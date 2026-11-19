import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,makePart,addConnection,normalizeStudioProject,applyStudioProposal,partTransforms,transformPoint,jointGeometry,unitsPerMm,roundedOverlapRadius} from '../public/studio-model.mjs';
import {mirrorPart,resizePart,getPartParameters,assertLockedPartsUnchanged} from '../public/studio-parametric.mjs';
import {renderStudioSvg,exportSheetSvg,exportPrintHtml} from '../public/studio-render.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const nearPoint=(a,b)=>a.forEach((n,i)=>near(n,b[i]));
function fixture(){
 let p=createStudioProject();p.assets=[{id:'art',name:'Asymmetric artwork',dataUrl:png,width:800,height:1000}];p.conceptAssetId='art';
 p.parts=[{...makePart('Body',rect(200,100,200,240),'art'),id:'body',rotation:23,x:12,y:17},{...makePart('Sleeve',[[250,300],[350,300],[340,480],[320,520],[265,510]],'art'),id:'sleeve'},{...makePart('Hand',[[265,480],[335,480],[350,540],[320,600],[265,570]],'art'),id:'hand'}];
 p=addConnection(p,{id:'shoulder',parentId:'body',childId:'sleeve',parentAnchor:[300,320],childAnchor:[300,320],padRadius:18,angle:31});
 p=addConnection(p,{id:'wrist',parentId:'sleeve',childId:'hand',parentAnchor:[300,500],childAnchor:[300,500],padRadius:18,angle:-15});
 p.rods=[{id:'rod',partId:'sleeve',point:[300,430]}];return normalizeStudioProject(p);
}

test('horizontal and vertical mirrors reflect the displayed piece and its source pixels about the pin',()=>{
 for(const axis of ['horizontal','vertical']){
  const before=fixture(),snapshot=structuredClone(before),next=mirrorPart(before,'sleeve',axis),oldWorld=partTransforms(before),newWorld=partTransforms(next);
  const old=before.parts[1],piece=next.parts[1],pivot=transformPoint(oldWorld.sleeve,before.joints[0].childAnchor);
  const reflected=point=>axis==='horizontal'?[2*pivot[0]-point[0],point[1]]:[point[0],2*pivot[1]-point[1]];
  old.polygon.forEach((point,i)=>nearPoint(transformPoint(newWorld.sleeve,piece.polygon[i]),reflected(transformPoint(oldWorld.sleeve,point))));
  for(const pixel of [[280,350],[300,430],[330,475]])nearPoint(transformPoint(newWorld.sleeve,transformPoint(piece.artworkMatrix,pixel)),reflected(transformPoint(oldWorld.sleeve,transformPoint(old.artworkMatrix,pixel))));
  nearPoint(transformPoint(newWorld.sleeve,next.rods[0].point),reflected(transformPoint(oldWorld.sleeve,before.rods[0].point)));
  assert.deepEqual(next.joints[0].childAnchor,before.joints[0].childAnchor);
  assert.equal(next.joints[0].angle,before.joints[0].angle,'a mirror does not rotate the joint');
  assert.deepEqual(next.parts[0],before.parts[0]);assert.deepEqual(before,snapshot);
  nearPoint(newWorld.sleeve,oldWorld.sleeve);
 }
});

test('mirror keeps children connected without reflecting their shape or artwork',()=>{
 const before=fixture(),next=mirrorPart(before,'sleeve','horizontal'),oldWorld=partTransforms(before),newWorld=partTransforms(next);
 assert.deepEqual(next.parts[2],before.parts[2]);
 assert.notDeepEqual(newWorld.hand,oldWorld.hand,'the child follows the reflected parent attachment');
 nearPoint(newWorld.hand.slice(0,4),oldWorld.hand.slice(0,4));
 for(const joint of next.joints)nearPoint(transformPoint(newWorld[joint.parentId],joint.parentAnchor),transformPoint(newWorld[joint.childId],joint.childAnchor));
});

test('mirrors preserve circular overlap radii, hole size, section widths and physical scale',()=>{
 const p=fixture();
 for(const joint of p.joints){joint.overlapSpans={parent:[25,15],child:[30,-10]};joint.padRadius=roundedOverlapRadius(joint.overlapSpans)+3;}
 const next=mirrorPart(p,'sleeve','vertical');
 near(unitsPerMm(next),unitsPerMm(p));
 for(let i=0;i<p.joints.length;i++){
  const joint=next.joints[i];near(joint.padRadius,p.joints[i].padRadius);
  for(const side of ['parent','child'])near(Math.hypot(...joint.overlapSpans[side]),Math.hypot(...p.joints[i].overlapSpans[side]));
  near(jointGeometry(next,joint).holeRadius/unitsPerMm(next),p.holeMm/2);
 }
 near(getPartParameters(next,'sleeve').widthMm,getPartParameters(p,'sleeve').widthMm);
 near(getPartParameters(next,'sleeve').lengthMm,getPartParameters(p,'sleeve').lengthMm);
});

test('two mirrors restore an already resized piece and its artwork mapping',()=>{
 const before=resizePart(fixture(),'sleeve',{width:1.3,length:.8});
 const once=mirrorPart(before,'sleeve','horizontal'),twice=mirrorPart(once,'sleeve','horizontal');
 before.parts[1].polygon.forEach((point,i)=>nearPoint(point,twice.parts[1].polygon[i]));
 nearPoint(before.parts[1].artworkMatrix,twice.parts[1].artworkMatrix);
 for(let i=0;i<before.joints.length;i++){nearPoint(before.joints[i].parentAnchor,twice.joints[i].parentAnchor);nearPoint(before.joints[i].childAnchor,twice.joints[i].childAnchor);}
 near(before.heightMm,twice.heightMm);assert.equal(once.parts[1].parameters.width,1.3);assert.equal(once.parts[1].parameters.length,.8);
 const resized=resizePart(once,'sleeve',{width:1.5});near(getPartParameters(resized,'sleeve').widthMm,getPartParameters(once,'sleeve').widthMm*1.5/1.3);
});

test('a free rotated piece mirrors about its own centre without changing its placement or rotation',()=>{
 const p=createStudioProject();p.parts=[{...makePart('Free hand',[[10,10],[90,20],[60,150],[10,110]]),id:'free',x:140,y:85,rotation:42}];
 const before=normalizeStudioProject(p),next=mirrorPart(before,'free','vertical'),a=partTransforms(before).free,b=partTransforms(next).free,pivot=transformPoint(a,[50,80]);
 before.parts[0].polygon.forEach((point,i)=>{const old=transformPoint(a,point);nearPoint(transformPoint(b,next.parts[0].polygon[i]),[old[0],2*pivot[1]-old[1]]);});
 assert.equal(next.parts[0].rotation,42);assert.equal(next.parts[0].x,140);assert.equal(next.parts[0].y,85);
});

test('locked selected pieces and affected descendants block mirrors; a locked parent stays unchanged',()=>{
 const p=fixture();p.parts[1].locked=true;assert.throws(()=>mirrorPart(p,'sleeve','horizontal'),e=>e.code==='LOCKED_PART');
 p.parts[1].locked=false;p.parts[2].locked=true;const snapshot=structuredClone(p);
 assert.throws(()=>mirrorPart(p,'sleeve','horizontal'),e=>e.code==='LOCKED_PART');assert.deepEqual(p,snapshot);
 p.parts[2].locked=false;p.parts[0].locked=true;const next=mirrorPart(p,'sleeve','horizontal');
 assertLockedPartsUnchanged(p,next);assert.deepEqual(next.parts[0],p.parts[0]);
 assert.deepEqual(next.joints[0].parentAnchor,p.joints[0].parentAnchor);
});

test('AI mirror proposals use the same operation and reject unsupported or ambiguous transforms',()=>{
 const p=fixture();assert.deepEqual(applyStudioProposal(p,{parts:[{id:'sleeve',transform:{mirror:'horizontal'}}]}),mirrorPart(p,'sleeve','horizontal'));
 for(const transform of [{mirror:'diagonal'},{mirror:'horizontal',rotate:90},{},null,'horizontal'])assert.throws(()=>applyStudioProposal(p,{parts:[{id:'sleeve',transform}]}),e=>e.code==='INVALID_PARAMETERS');
 for(const extra of [{parameters:{width:1.5}},{polygon:p.parts[1].polygon}])assert.throws(()=>applyStudioProposal(p,{parts:[{id:'sleeve',transform:{mirror:'vertical'},...extra}]}),/separately/);
 assert.throws(()=>applyStudioProposal(p,{parts:[{id:'new',polygon:rect(0,0,100,100),transform:{mirror:'horizontal'}}]}),/existing part/);
 assert.throws(()=>applyStudioProposal(p,{parts:[{id:'sleeve',parameters:{width:-1}}]}),/25% and 400%/);
});

test('reflected artwork survives portable import and appears in stage, print and SVG exports',()=>{
 const next=mirrorPart(fixture(),'sleeve','horizontal'),reopened=normalizeStudioProject(JSON.parse(JSON.stringify(next)));
 assert.deepEqual(reopened,next);assert.ok(next.parts[1].artworkMatrix[0]*next.parts[1].artworkMatrix[3]-next.parts[1].artworkMatrix[1]*next.parts[1].artworkMatrix[2]<0);
 const stage=renderStudioSvg(next),print=exportPrintHtml(next),cut=exportSheetSvg(next,{cutOnly:true});
 for(const svg of [stage,print])assert.match(svg,/data-part-artwork="sleeve"[^>]+transform="matrix\(/);
 assert.match(cut,/data-cut="outline-and-holes"/);assert.doesNotMatch(stage,/NaN|Infinity/);assert.doesNotMatch(cut,/NaN|Infinity/);
});
