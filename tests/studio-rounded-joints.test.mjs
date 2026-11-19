import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,makePart,normalizeStudioProject,unitsPerMm,partTransforms,transformPoint,resizePart,validateStudio,roundedOverlapRadius} from '../public/studio-model.mjs';
import {splitPart,suggestJointAt,suggestConnection,setJointOverlapDiameter,getJointOverlapLimits,inspectJointOverlap} from '../public/studio-construction.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
function strip(width=24,height=120){
 const p=createStudioProject();p.parts=[{...makePart('Limb',rect(0,0,width,height)),id:'limb'}];p.heightMm=height;
 return normalizeStudioProject(p);
}
function bend(width=24){return suggestJointAt(strip(width),'limb',[width/2,85],{angleDegrees:0});}

test('rounded ends follow the complete limb width instead of a fixed fastener allowance',()=>{
 const narrow=bend(24),wide=bend(48),a=narrow.project.joints[0],b=wide.project.joints[0];
 near(b.padRadius/a.padRadius,2);
 for(const [result,width] of [[narrow,24],[wide,48]]){
  const p=result.project,j=p.joints[0],before=strip(width);
  assert.ok(j.padRadius*Math.cos(Math.PI/96)>=width/2);
  assert.deepEqual(j.overlapSpans,{parent:[width,0],child:[width,0]});
  near(unitsPerMm(p),unitsPerMm(before));near(p.holeMm,3);
  for(const angle of [-60,-30,0,30,60]){
   const posed=structuredClone(p);posed.joints[0].angle=angle;
   const matrices=partTransforms(posed),pa=transformPoint(matrices[j.parentId],j.parentAnchor),ca=transformPoint(matrices[j.childId],j.childAnchor);
   near(pa[0],ca[0]);near(pa[1],ca[1]);
   // The shared inscribed circle covers the full half-width at every heading,
   // independent of rotation of either polygonal circular end.
   for(let d=0;d<360;d+=15){const r=width/2,rad=d*Math.PI/180,point=[pa[0]+r*Math.cos(rad),pa[1]+r*Math.sin(rad)];assert.ok(Math.hypot(point[0]-ca[0],point[1]-ca[1])<=j.padRadius*Math.cos(Math.PI/96)+1e-7);}
  }
 }
});

test('manual splits and broad short branches retain full ends without an oversized disk area rejection',()=>{
 const p=strip(80,240),manual=splitPart(p,'limb',[-1,180],[81,180]),auto=suggestJointAt(p,'limb',[40,180],{angleDegrees:0});
 for(const result of [manual,auto]){
  assert.ok(result.project.joints[0].padRadius>=40);
  assert.equal(validateStudio(result.project).filter(i=>i.level==='error').length,0);
  near(unitsPerMm(result.project),1);
 }
 const fixed=splitPart(p,'limb',[-1,180],[81,180],{type:'fixed'});
 assert.equal(fixed.project.joints[0].overlapSpans,undefined,'Adhesive joins keep their existing construction.');
});

test('physical diameter editing is immutable and allows a smaller reviewed circle with pin clearance',()=>{
 const result=bend(),p=result.project,j=p.joints[0],snapshot=structuredClone(p),limits=getJointOverlapLimits(p,j.id);
 assert.equal(limits.fullWidth,true);near(limits.minDiameterMm,7);assert.ok(limits.suggestedDiameterMm>=24);
 assert.ok(limits.sliderMaxDiameterMm<limits.maxDiameterMm);
 const changed=setJointOverlapDiameter(p,j.id,36),edited=changed.joints[0];
 near(2*edited.padRadius/unitsPerMm(changed),36);near(unitsPerMm(changed),unitsPerMm(p));
 assert.deepEqual(edited.parentAnchor,j.parentAnchor);assert.deepEqual(edited.childAnchor,j.childAnchor);
 assert.equal(changed.holeMm,p.holeMm);assert.deepEqual(changed.parts,p.parts);assert.deepEqual(p,snapshot);
 const atMinimum=setJointOverlapDiameter(changed,j.id,limits.minDiameterMm);
 near(atMinimum.joints[0].padRadius,3.5);
 assert.equal(atMinimum.joints[0].overlapSizing,'custom');
 assert.equal(validateStudio(atMinimum).filter(i=>i.level==='error').length,0);
 assert.ok(validateStudio(atMinimum).some(i=>i.code==='COMPACT_ROUND_OVERLAP'&&i.level==='warning'));
 assert.equal(getJointOverlapLimits(atMinimum,j.id).compact,true);
 for(const bad of [0,-1,6.9,NaN,Infinity,'30',limits.maxDiameterMm+1])assert.throws(()=>setJointOverlapDiameter(p,j.id,bad),{code:'JOINT_SIZE_RANGE'});
 assert.throws(()=>setJointOverlapDiameter(p,'missing',30),{code:'JOINT_NOT_FOUND'});
 assert.deepEqual(p,snapshot);
});

test('custom joint diameter survives save, piece resizing, and physical scale changes',()=>{
 const p=bend().project,j=p.joints[0],small=setJointOverlapDiameter(p,j.id,12);
 const reopened=normalizeStudioProject(JSON.parse(JSON.stringify(small)));
 assert.deepEqual(reopened,small);
 const wider=resizePart(reopened,j.childId,{width:1.6});
 near(2*wider.joints[0].padRadius/unitsPerMm(wider),12);
 assert.equal(wider.joints[0].overlapSizing,'custom');
 const oldTransforms=partTransforms(reopened),newTransforms=partTransforms(wider);
 near(transformPoint(oldTransforms[j.parentId],j.parentAnchor)[0],transformPoint(newTransforms[j.parentId],wider.joints[0].parentAnchor)[0]);
 const scaled=structuredClone(reopened);scaled.heightMm*=2;
 near(getJointOverlapLimits(scaled,j.id).diameterMm,24);
 const restored=setJointOverlapDiameter(small,j.id,getJointOverlapLimits(small,j.id).suggestedDiameterMm);
 assert.equal(getJointOverlapLimits(restored,j.id).compact,false);
 assert.equal(validateStudio(restored).some(i=>i.code==='COMPACT_ROUND_OVERLAP'),false);
});

test('overlap inspection finds an unrelated contour and shrinking clears it without new connections',()=>{
 const p=bend().project,j=p.joints[0];
 p.parts.push({...makePart('Other leg',rect(23,80,10,20)),id:'other-leg'});
 const original=structuredClone(p);
 assert.deepEqual(inspectJointOverlap(p,j.id).overlappingPartIds,['other-leg']);
 assert.deepEqual(inspectJointOverlap(p,j.id).overlappingPartNames,['Other leg']);
 const smaller=setJointOverlapDiameter(p,j.id,10);
 assert.deepEqual(inspectJointOverlap(smaller,j.id).overlappingPartIds,[]);
 assert.equal(smaller.joints.length,p.joints.length);
 assert.equal(smaller.joints[0].parentId,j.parentId);assert.equal(smaller.joints[0].childId,j.childId);
 assert.deepEqual(smaller.parts,p.parts);assert.deepEqual(p,original);
 assert.throws(()=>inspectJointOverlap(p,'missing'),{code:'JOINT_NOT_FOUND'});
});

test('overlap inspection includes another piece tab and uses the current posed transforms',()=>{
 const p=bend().project,j=p.joints[0];
 p.parts.push({...makePart('Distant body',rect(80,80,10,20)),id:'other-parent'}, {...makePart('Near tab',rect(80,80,10,20)),id:'other-child'});
 p.joints.push({id:'other-joint',parentId:'other-parent',childId:'other-child',parentAnchor:[31,85],childAnchor:[31,85],type:'pivot',min:-90,max:90,angle:0,padRadius:10});
 assert.deepEqual(inspectJointOverlap(p,j.id).overlappingPartIds,['other-parent','other-child']);
 const moved=structuredClone(p);moved.parts.find(part=>part.id==='other-parent').x=100;
 assert.deepEqual(inspectJointOverlap(moved,j.id).overlappingPartIds,[]);
});

test('legacy projects retain existing small joint sizes until explicitly edited',()=>{
 const p=bend().project,j=p.joints[0];delete j.overlapSpans;j.padRadius=3.5;
 const reopened=normalizeStudioProject(JSON.parse(JSON.stringify(p)));
 assert.equal(reopened.joints[0].padRadius,3.5);assert.equal(reopened.joints[0].overlapSpans,undefined);
 assert.equal(getJointOverlapLimits(reopened,j.id).fullWidth,false);
 const changed=setJointOverlapDiameter(reopened,j.id,26);near(changed.joints[0].padRadius/unitsPerMm(changed),13);
 assert.equal(reopened.joints[0].padRadius,3.5);
 const undersized=structuredClone(reopened);undersized.joints[0].padRadius=3;
 const unchanged=setJointOverlapDiameter(undersized,j.id,getJointOverlapLimits(undersized,j.id).diameterMm);
 assert.deepEqual(unchanged,undersized);
 assert.throws(()=>setJointOverlapDiameter(undersized,j.id,5.9),{code:'JOINT_SIZE_RANGE'});
});

test('anisotropic piece resizing updates only its width vector and both round ends',()=>{
 const p=bend().project,j=p.joints[0],childId=j.childId,original=structuredClone(p),scale=unitsPerMm(p);
 const wide=resizePart(p,childId,{width:1.5}),wj=wide.joints[0];
 assert.deepEqual(wj.overlapSpans.parent,[24,0]);assert.deepEqual(wj.overlapSpans.child,[36,0]);
 assert.ok(wj.padRadius*Math.cos(Math.PI/96)>=18);near(unitsPerMm(wide),scale);
 assert.deepEqual(wide.parts.find(part=>part.id===j.parentId),p.parts.find(part=>part.id===j.parentId));
 const restored=resizePart(wide,childId,{width:1});near(restored.joints[0].padRadius,j.padRadius);
 const long=resizePart(p,childId,{length:1.5});near(long.joints[0].padRadius,j.padRadius);
 assert.deepEqual(p,original);assert.deepEqual(normalizeStudioProject(JSON.parse(JSON.stringify(wide))),wide);
});

test('locked connected pieces prevent changes to their actual round-end geometry',()=>{
 const p=bend().project,j=p.joints[0];p.parts.find(part=>part.id===j.parentId).locked=true;
 assert.throws(()=>setJointOverlapDiameter(p,j.id,36),{code:'LOCKED_PART'});
 assert.throws(()=>resizePart(p,j.childId,{width:1.5}),{code:'LOCKED_PART'});
 const longer=resizePart(p,j.childId,{length:1.2});near(longer.joints[0].padRadius,j.padRadius);
 assert.deepEqual(longer.parts.find(part=>part.id===j.parentId),p.parts.find(part=>part.id===j.parentId));
});

test('separate-piece connections use the smaller oriented limb extent while preserving pose',()=>{
 const p=createStudioProject();p.heightMm=150;
 p.parts=[{...makePart('Body',rect(0,0,100,100)),id:'body'},{...makePart('Arm',rect(40,80,20,70)),id:'arm'}];
 const before=partTransforms(p),result=suggestConnection(p,'body','arm'),mm=unitsPerMm(p);
 assert.ok(result.joint.padRadius>=10&&result.joint.padRadius<11,'The arm width, not the entire torso, sets the end size.');
 assert.deepEqual(partTransforms(result.project),before);near(unitsPerMm(result.project),mm);
});

test('unsafe imported rounded spans and incomplete or detached overlaps cannot be accepted',()=>{
 const p=bend().project,j=p.joints[0],bad=structuredClone(p);bad.joints[0].padRadius=3.5;
 assert.ok(validateStudio(bad).some(i=>i.code==='INCOMPLETE_ROUND_OVERLAP'));
 for(const spans of [{parent:[0,0],child:[24,0]},{parent:[NaN,0],child:[24,0]},{parent:[24,0]}]){
  const copy=structuredClone(p);copy.joints[0].overlapSpans=spans;assert.throws(()=>normalizeStudioProject(copy));
 }
 const detached=structuredClone(p);delete detached.joints[0].overlapSpans;detached.joints[0].parentAnchor=[-20,85];
 const limits=getJointOverlapLimits(detached,j.id);assert.ok(limits.minDiameterMm>=44);
 assert.throws(()=>setJointOverlapDiameter(detached,j.id,30),{code:'JOINT_SIZE_RANGE'});
 const repaired=setJointOverlapDiameter(detached,j.id,limits.minDiameterMm);
 assert.equal(validateStudio(repaired).filter(i=>i.level==='error').length,0);
});

test('a nearby second bend retains inherited round ends and requests a physical overlap check',()=>{
 const first=bend(),p=first.project,j=p.joints[0];
 const result=suggestJointAt(p,j.parentId,[12,70],{angleDegrees:0}),old=result.project.joints.find(joint=>joint.id===j.id);
 assert.deepEqual(old.overlapSpans,j.overlapSpans);near(old.padRadius,j.padRadius);
 assert.ok(validateStudio(result.project).some(issue=>issue.level==='warning'&&issue.code==='ROUND_ENDS_OVERLAP'));
 assert.ok(result.warnings.some(warning=>/both joints turn freely.*backlit/.test(warning)));
 assert.equal(validateStudio(result.project).filter(issue=>issue.level==='error').length,0);
});
