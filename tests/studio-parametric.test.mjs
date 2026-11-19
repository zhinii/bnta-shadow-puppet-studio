import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,normalizeStudioProject,makePart,addConnection,partTransforms,transformPoint,unitsPerMm,jointGeometry,applyStudioProposal} from '../public/studio-model.mjs';
import {resizePart,setPartParameterAxis,getPartParameters,assertLockedPartsUnchanged,preservePhysicalScale} from '../public/studio-parametric.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const nearPoint=(a,b)=>a.forEach((n,i)=>near(n,b[i]));
function fixture(){
 let p=createStudioProject();p.assets=[{id:'art',name:'Student drawing',dataUrl:png,width:800,height:1000}];p.conceptAssetId='art';
 p.parts=[{...makePart('Body',rect(200,100,200,240),'art'),id:'body'},{...makePart('Sleeve',rect(250,300,100,220),'art'),id:'sleeve'},{...makePart('Hand',rect(265,480,70,120),'art'),id:'hand'}];
 p=addConnection(p,{id:'shoulder',parentId:'body',childId:'sleeve',parentAnchor:[300,320],childAnchor:[300,320],padRadius:18,angle:25});
 p=addConnection(p,{id:'wrist',parentId:'sleeve',childId:'hand',parentAnchor:[300,500],childAnchor:[300,500],padRadius:18,angle:-15});
 p.rods=[{id:'rod',partId:'sleeve',point:[300,430]}];return normalizeStudioProject(p);
}

test('older v2 parts acquire neutral dimension and artwork parameters without changing contours',()=>{
 const p=fixture();for(const part of p.parts){delete part.parameters;delete part.artworkMatrix;}
 const next=normalizeStudioProject(JSON.parse(JSON.stringify(p)));
 assert.deepEqual(next.parts[1].artworkMatrix,[1,0,0,1,0,0]);
 assert.deepEqual(next.parts[1].parameters,{width:1,length:1,axisAngle:0,origin:[300,410]});
 assert.deepEqual(next.parts[1].polygon,p.parts[1].polygon);
 assert.equal(next.schemaVersion,2);
});

test('length and width reshape imported pixels and outlines while connected children only move',()=>{
 const before=fixture(),snapshot=structuredClone(before),next=resizePart(before,'sleeve',{width:1.4,length:1.5});
 const old=before.parts[1],piece=next.parts[1],child=next.parts[2];
 nearPoint(piece.polygon[0],[230,290]);
 for(let i=0;i<old.polygon.length;i++)nearPoint(transformPoint(piece.artworkMatrix,old.polygon[i]),piece.polygon[i]);
 nearPoint(next.joints[0].childAnchor,[300,320]);
 nearPoint(next.joints[1].parentAnchor,[300,590]);
 nearPoint(next.rods[0].point,[300,485]);
 assert.deepEqual(child,before.parts[2],'the hand artwork and size are unchanged');
 const oldWorld=partTransforms(before),newWorld=partTransforms(next);
 assert.notDeepEqual(newWorld.hand,oldWorld.hand);
 for(const joint of next.joints)nearPoint(transformPoint(newWorld[joint.parentId],joint.parentAnchor),transformPoint(newWorld[joint.childId],joint.childAnchor));
 assert.deepEqual(before,snapshot,'the source project is unchanged');
});

test('resizing a part preserves material scale, drill diameter and unrelated dimensions',()=>{
 const before=fixture(),next=resizePart(before,'sleeve',{length:1.5});
 near(unitsPerMm(next),unitsPerMm(before));
 near(jointGeometry(next,next.joints[0]).holeRadius/unitsPerMm(next),1.5);
 near(getPartParameters(next,'hand').widthMm,getPartParameters(before,'hand').widthMm);
 near(getPartParameters(next,'sleeve').lengthMm,getPartParameters(before,'sleeve').lengthMm*1.5);
 assert.ok(next.heightMm>before.heightMm);
});

test('absolute sliders are idempotent and return an asymmetric rotated shape to its baseline',()=>{
 let p=createStudioProject();p.parts=[{...makePart('Custom',[[0,0],[80,20],[150,150],[15,90]]),id:'custom'}];
 p=setPartParameterAxis(p,'custom',37);const baseline=structuredClone(p);
 const resized=resizePart(p,'custom',{width:1.7,length:.8});
 assert.deepEqual(resizePart(resized,'custom',{width:1.7,length:.8}),resized);
 const restored=resizePart(resized,'custom',{width:1,length:1});
 baseline.parts[0].polygon.forEach((point,i)=>nearPoint(restored.parts[0].polygon[i],point));
 nearPoint(restored.parts[0].artworkMatrix,[1,0,0,1,0,0]);
 nearPoint(restored.parts[0].parameters.origin,baseline.parts[0].parameters.origin);
 near(restored.heightMm,baseline.heightMm);
});

test('axis changes rebase controls without moving pixels, contours, anchors or physical dimensions',()=>{
 const stretched=resizePart(fixture(),'sleeve',{width:1.2,length:1.3});
 const rebased=setPartParameterAxis(stretched,'sleeve',90);
 assert.equal(rebased.parts[1].parameters.axisAngle,90);
 assert.equal(rebased.parts[1].parameters.width,1);assert.equal(rebased.parts[1].parameters.length,1);
 assert.deepEqual(rebased.parts[1].polygon,stretched.parts[1].polygon);
 assert.deepEqual(rebased.parts[1].artworkMatrix,stretched.parts[1].artworkMatrix);
 assert.deepEqual(rebased.joints,stretched.joints);near(rebased.heightMm,stretched.heightMm);
 near(getPartParameters(rebased,'sleeve').widthUnits,getPartParameters(stretched,'sleeve').lengthUnits);
});

test('locked selected pieces and locked descendants block dimension changes that would move them',()=>{
 const p=fixture();p.parts[2].locked=true;
 assert.throws(()=>resizePart(p,'hand',{width:1.1}),error=>error.code==='LOCKED_PART');
 assert.throws(()=>resizePart(p,'sleeve',{length:1.2}),error=>error.code==='LOCKED_PART');
 assert.throws(()=>setPartParameterAxis(p,'hand',90),error=>error.code==='LOCKED_PART');
 const next=resizePart(p,'sleeve',{width:1.2});
 assertLockedPartsUnchanged(p,next);
 assert.deepEqual(next.parts[2],p.parts[2]);
});

test('a locked parent permits child resizing around its unchanged incoming pivot',()=>{
 const p=fixture();p.parts[0].locked=true;
 const next=resizePart(p,'sleeve',{width:1.2,length:1.3});
 assert.deepEqual(next.parts[0],p.parts[0]);
 assert.deepEqual(partTransforms(next).body,partTransforms(p).body);
 nearPoint(next.joints[0].parentAnchor,p.joints[0].parentAnchor);
});

test('natural-language parameter proposals use the same deterministic resize and preserve unrelated pieces',()=>{
 const p=fixture(),proposal={parts:[{id:'sleeve',parameters:{length:1.2}}]};
 assert.deepEqual(applyStudioProposal(p,proposal),resizePart(p,'sleeve',{length:1.2}));
 assert.throws(()=>applyStudioProposal(p,{parts:[{id:'sleeve',parameters:{length:1.2},polygon:p.parts[1].polygon}]}),/separately/);
 assert.throws(()=>applyStudioProposal(p,{parts:[{id:'sleeve',parameters:{origin:[0,0]}}]}),/width or length only/);
 p.parts[2].locked=true;
 assert.throws(()=>applyStudioProposal(p,proposal),error=>error.code==='LOCKED_PART');
});

test('image mappings and parameter baselines survive a portable project round trip',()=>{
 let p=fixture();p.parts[1].artworkMatrix=[.9,.1,-.1,.9,15,20];
 const next=resizePart(p,'sleeve',{width:.8,length:1.4});
 const reopened=normalizeStudioProject(JSON.parse(JSON.stringify(next)));
 assert.deepEqual(reopened,next);
 assert.deepEqual(reopened.assets,p.assets);
 assert.notDeepEqual(reopened.parts[1].artworkMatrix,p.parts[1].artworkMatrix);
 const originalPixel=[100,80],priorMapped=transformPoint(p.parts[1].artworkMatrix,originalPixel);
 const expected=[300+(priorMapped[0]-300)*.8,320+(priorMapped[1]-320)*1.4];
 nearPoint(transformPoint(reopened.parts[1].artworkMatrix,originalPixel),expected);
});

test('invalid dimensions and collapsed or executable artwork transforms are rejected',()=>{
 const p=fixture();for(const width of [0,-1,.24,4.01,Infinity,NaN,'1.2'])assert.throws(()=>resizePart(p,'sleeve',{width}));
 for(const matrix of [[0,0,0,0,0,0],[-1e-10,0,0,1,0,0],[1,0,0,1,0,'onload'],[1,0,0,1,0],[1,null,0,1,0,0],[1,,0,1,0,0]]){
  const bad=structuredClone(p);bad.parts[0].artworkMatrix=matrix;assert.throws(()=>normalizeStudioProject(bad));
 }
 assert.throws(()=>resizePart(p,'missing',{width:1.2}),error=>error.code==='PART_NOT_FOUND');
 assert.throws(()=>resizePart(p,'sleeve',{axisAngle:45,width:1.2}),/Set the dimension axis/);
 assert.throws(()=>applyStudioProposal(p,{parts:[{id:'new-part',polygon:rect(500,200,80,80),parameters:{width:2}}]}),/starts at 100%/);
});

test('first traced pieces below 50 mm retain the source image calibration',()=>{
 const empty=createStudioProject(),scale=unitsPerMm(empty),candidate=structuredClone(empty);
 candidate.parts.push({...makePart('Small hand',rect(100,100,20,40)),id:'first-hand'});
 const first=preservePhysicalScale(empty,candidate);
 assert.ok(first.heightMm<50);near(first.heightMm,11.2);
 near(unitsPerMm(first),scale);
 near(getPartParameters(first,'first-hand').widthMm,20/scale);
 const more=structuredClone(first);more.parts.push({...makePart('Body',rect(300,300,150,400)),id:'body-added'});
 const expanded=preservePhysicalScale(first,more);
 near(unitsPerMm(expanded),scale);
 near(getPartParameters(expanded,'first-hand').widthMm,20/scale);
 assert.deepEqual(expanded.parts[0],first.parts[0]);
});

test('adding connected pieces retains prior part dimensions and physical pin diameters',()=>{
 const before=fixture(),scale=unitsPerMm(before),added=structuredClone(before);
 added.parts.push({...makePart('Long prop',rect(700,700,80,400)),id:'prop'});
 const connected=addConnection(added,{id:'prop-pin',parentId:'hand',childId:'prop',parentAnchor:[300,560],childAnchor:[740,730],padRadius:18,angle:0});
 const after=preservePhysicalScale(before,connected);
 near(unitsPerMm(after),scale);
 near(getPartParameters(after,'body').widthMm,getPartParameters(before,'body').widthMm);
 near(getPartParameters(after,'hand').lengthMm,getPartParameters(before,'hand').lengthMm);
 for(const joint of after.joints)near(jointGeometry(after,joint).holeRadius/unitsPerMm(after),after.holeMm/2);
 const transforms=partTransforms(after);
 for(const joint of after.joints)nearPoint(transformPoint(transforms[joint.parentId],joint.parentAnchor),transformPoint(transforms[joint.childId],joint.childAnchor));
});

test('removing pieces including the final piece preserves calibration for the next trace',()=>{
 const before=fixture(),scale=unitsPerMm(before),empty={...before,parts:[],joints:[],rods:[]};
 const cleared=preservePhysicalScale(before,empty);
 near(unitsPerMm(cleared),scale);
 const next={...cleared,parts:[{...makePart('New piece',rect(100,100,30,60)),id:'new-piece'}]};
 const traced=preservePhysicalScale(cleared,next);
 near(unitsPerMm(traced),scale);
 near(getPartParameters(traced,'new-piece').lengthMm,60/scale);
});

test('scale preservation rejects unprintably small or excessive envelopes instead of clamping',()=>{
 const empty=createStudioProject();
 const small={...empty,parts:[makePart('Tiny',rect(10,10,1,1))]};
 assert.throws(()=>preservePhysicalScale(empty,small),error=>error.code==='PHYSICAL_SCALE_RANGE');
 const large={...empty,parts:[makePart('Huge',rect(0,0,100,10000))]};
 assert.throws(()=>preservePhysicalScale(empty,large),error=>error.code==='PHYSICAL_SCALE_RANGE');
 assert.equal(empty.heightMm,280);
});
