import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,normalizeStudioProject,mirrorPart,resizePart,unitsPerMm,transformPoint} from '../public/studio-model.mjs';
import {setOverlapSample,clearOverlapSample,overlapSampleAt,resizeOverlapSample} from '../public/studio-image-repair.mjs';
import {getJointArtworkPlan,jointArtworkMapping} from '../public/studio-joint-artwork.mjs';
import {renderStudioSvg,exportSheetSvg,exportPrintHtml} from '../public/studio-render.mjs';
import {serializeStudioProject,parseStudioProject} from '../public/studio-storage.mjs';
import {isTrustedClassroomMessage,classroomCharacterProject} from '../public/studio-classroom-bridge.mjs';

const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function fixture(){const p=createStudioProject();p.assets=[{id:'art',name:'Test metadata',dataUrl:PNG,width:200,height:200}];p.parts=[{id:'top',name:'Top garment',polygon:[[40,20],[120,20],[120,100],[40,100]],assetId:'art',fill:'#118844'},{id:'leg',name:'Leg garment',polygon:[[40,100],[120,100],[120,180],[40,180]],assetId:'art',fill:'#cc3322'}];p.joints=[{id:'hip',parentId:'top',childId:'leg',parentAnchor:[80,100],childAnchor:[80,100],padRadius:42,min:-90,max:90,angle:0,overlapSpans:{parent:[80,0],child:[80,0]}}];return normalizeStudioProject(p);}

test('a selected piece supplies its own joint pattern without changing the other layer or geometry',()=>{
 const before=fixture(),next=setOverlapSample(before,'leg','hip',[80,145],{size:20}),plan=getJointArtworkPlan(next,next.joints[0],'leg');
 assert.equal(plan.manualSample,true);assert.equal(plan.donorId,'leg');assert.deepEqual(plan.sourceAnchor,[80,145]);assert.deepEqual(plan.tile,{x:70,y:135,size:20});
 assert.deepEqual(next.joints,before.joints);assert.deepEqual(next.parts[0],before.parts[0]);assert.deepEqual(next.parts[1].polygon,before.parts[1].polygon);assert.equal(unitsPerMm(next),unitsPerMm(before));
 assert.deepEqual(getJointArtworkPlan(next,next.joints[0],'top'),getJointArtworkPlan(before,before.joints[0]));
 assert.equal(before.parts[1].overlapSamples,undefined,'Proposal does not mutate original.');
});

test('pattern samples cannot come from another piece or outside the image or a concave edge',()=>{
 const p=fixture();assert.throws(()=>setOverlapSample(p,'leg','hip',[80,60]),/selected piece|inside/i);assert.throws(()=>setOverlapSample(p,'leg','hip',[42,145],{size:20}),/smaller sample/i);
 const q=structuredClone(p);q.parts[1].overlapSamples=[{jointId:'hip',center:[80,60],size:10}];assert.throws(()=>normalizeStudioProject(q),/inside this piece/);
 q.parts[1].overlapSamples=[{jointId:'hip',center:[80,145],size:-10}];assert.throws(()=>normalizeStudioProject(q),/sample size/);
 assert.throws(()=>setOverlapSample(p,'leg','missing',[80,145]),/one of its joints/);
});

test('sample coordinates remain stable through mirror, resize, movement and portable save/open',()=>{
 const original=setOverlapSample(fixture(),'leg','hip',[80,145],{size:20});
 for(const next of [mirrorPart(original,'leg','horizontal'),resizePart(original,'leg',{width:1.4,length:.8}),parseStudioProject(serializeStudioProject(original))]){
  const part=next.parts[1],joint=next.joints[0],plan=getJointArtworkPlan(next,joint,'leg');assert.deepEqual(part.overlapSamples,original.parts[1].overlapSamples);const anchor=transformPoint(jointArtworkMapping(plan,part,joint),plan.sourceAnchor);assert.ok(anchor.every((n,i)=>Math.abs(n-joint.childAnchor[i])<1e-7));assert.equal(plan.tile.size,20);
 }
 const posed=structuredClone(original);posed.joints[0].angle=38;assert.deepEqual(getJointArtworkPlan(posed,posed.joints[0],'leg'),getJointArtworkPlan(original,original.joints[0],'leg'));
});

test('manual samples render in preview, sheet and each print piece, while cuts remain unchanged',()=>{
 const p=fixture(),next=setOverlapSample(p,'leg','hip',[80,145],{size:20});
 for(const markup of [renderStudioSvg(next),exportSheetSvg(next),exportPrintHtml(next)]){
  assert.match(markup,/data-joint-part="leg" data-joint-donor="leg" data-joint-sample="selected-piece"/);assert.doesNotMatch(markup,/data-joint-part="top" data-joint-donor="top" data-joint-sample/);
  assert.match(markup,/x="70" y="135" width="20" height="20" viewBox="70 135 20 20"/);
 }
 const stable=s=>s.replace(/sheet-\d+/g,'sheet');assert.equal(stable(exportSheetSvg(next,{cutOnly:true})),stable(exportSheetSvg(p,{cutOnly:true})));
});

test('locks protect own samples and permit independent repair of the unlocked connected layer',()=>{
 const p=fixture();p.parts[0].locked=true;const next=setOverlapSample(p,'leg','hip',[80,145]);assert.ok(next.parts[1].overlapSamples);assert.deepEqual(next.parts[0],p.parts[0]);
 next.parts[1].locked=true;assert.throws(()=>clearOverlapSample(next,'leg','hip'),/Unlock/);assert.throws(()=>resizeOverlapSample(next,'leg','hip',3),/Unlock/);
});

test('sample size adjustments and reset restore automatic artwork without altering physical connections',()=>{
 const p=fixture(),next=setOverlapSample(p,'leg','hip',[80,145]);const sample=overlapSampleAt(p,'leg','hip',[80,145]);assert.ok(sample.maxSize>sample.size);
 const smaller=resizeOverlapSample(next,'leg','hip',4);assert.equal(smaller.parts[1].overlapSamples[0].size,4);assert.deepEqual(clearOverlapSample(smaller,'leg','hip'),p);
});

test('classroom messages require explicit embed mode, nonopaque same origin and the actual parent window',()=>{
 const parent={},event={origin:'https://school.example',source:parent,data:{type:'classroom:load'}};
 assert.ok(isTrustedClassroomMessage(event,{origin:event.origin,parent,enabled:true}));
 for(const bad of [{...event,origin:'https://other.example'},{...event,source:{}},{...event,data:{type:'run-code'}},{...event,data:null}])assert.equal(!!isTrustedClassroomMessage(bad,{origin:event.origin,parent,enabled:true}),false);
 assert.equal(!!isTrustedClassroomMessage(event,{origin:event.origin,parent,enabled:false}),false);assert.equal(!!isTrustedClassroomMessage({...event,origin:'null'},{origin:'null',parent,enabled:true}),false);
});

test('classroom load normalizes existing work and creates empty named characters from a brief',()=>{
 const p=classroomCharacterProject({project:null,characterName:'Lantern keeper',brief:'A modern cyclist carrying a lamp',language:'zh'});assert.equal(p.title,'Lantern keeper');assert.equal(p.brief.keywords,'A modern cyclist carrying a lamp');assert.equal(p.language,'zh');assert.equal(p.parts.length,0);
 const existing=fixture(),loaded=classroomCharacterProject({project:existing,characterName:'Ignored replacement',brief:'Ignored replacement',language:'zh'});assert.deepEqual(loaded.parts,existing.parts);assert.equal(loaded.title,existing.title);assert.equal(loaded.language,'zh');
 assert.throws(()=>classroomCharacterProject({project:{schemaVersion:2,assets:[{id:'evil',dataUrl:'javascript:alert(1)'}]}}),/embedded PNG|image/);
});
