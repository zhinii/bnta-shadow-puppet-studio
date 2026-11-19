import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,makePart,normalizeStudioProject,unitsPerMm,partTransforms,transformPoint,resizePart,validateStudio,roundedOverlapRadius} from '../public/studio-model.mjs';
import {splitPart,suggestJointAt,suggestConnection,setJointOverlapDiameter,getJointOverlapLimits} from '../public/studio-construction.mjs';

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

test('physical diameter editing is immutable and keeps full-width coverage, pin size and calibration',()=>{
 const result=bend(),p=result.project,j=p.joints[0],snapshot=structuredClone(p),limits=getJointOverlapLimits(p,j.id);
 assert.equal(limits.fullWidth,true);assert.ok(limits.minDiameterMm>=24);
 const changed=setJointOverlapDiameter(p,j.id,36),edited=changed.joints[0];
 near(2*edited.padRadius/unitsPerMm(changed),36);near(unitsPerMm(changed),unitsPerMm(p));
 assert.deepEqual(edited.parentAnchor,j.parentAnchor);assert.deepEqual(edited.childAnchor,j.childAnchor);
 assert.equal(changed.holeMm,p.holeMm);assert.deepEqual(changed.parts,p.parts);assert.deepEqual(p,snapshot);
 const atMinimum=setJointOverlapDiameter(changed,j.id,limits.minDiameterMm);
 near(atMinimum.joints[0].padRadius,roundedOverlapRadius(j.overlapSpans));
 for(const bad of [0,-1,23,NaN,Infinity,'30',limits.maxDiameterMm+1])assert.throws(()=>setJointOverlapDiameter(p,j.id,bad),{code:'JOINT_SIZE_RANGE'});
 assert.throws(()=>setJointOverlapDiameter(p,'missing',30),{code:'JOINT_NOT_FOUND'});
 assert.deepEqual(p,snapshot);
});

test('legacy projects retain existing small joint sizes until explicitly edited',()=>{
 const p=bend().project,j=p.joints[0];delete j.overlapSpans;j.padRadius=3.5;
 const reopened=normalizeStudioProject(JSON.parse(JSON.stringify(p)));
 assert.equal(reopened.joints[0].padRadius,3.5);assert.equal(reopened.joints[0].overlapSpans,undefined);
 assert.equal(getJointOverlapLimits(reopened,j.id).fullWidth,false);
 const changed=setJointOverlapDiameter(reopened,j.id,26);near(changed.joints[0].padRadius/unitsPerMm(changed),13);
 assert.equal(reopened.joints[0].padRadius,3.5);
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
