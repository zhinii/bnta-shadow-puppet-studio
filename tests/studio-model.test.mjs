import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStudioProject,normalizeStudioProject,makePart,addConnection,partTransforms,
  transformPoint,inverseMatrix,unitsPerMm,neutralProjectBounds,projectBounds,
  validateStudio,applyStudioProposal,pointInPolygon,distanceToBoundary,selfIntersects,
  jointGeometry,
} from '../public/studio-model.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1cAAAAASUVORK5CYII=';
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function threePartPuppet(){
  let p=createStudioProject();
  p.assets=[{id:'art',name:'Octopus scholar',mime:'image/png',dataUrl:png,width:800,height:1000}];
  p.conceptAssetId='art';
  p.parts=[{...makePart('Coat',rect(200,100,160,300),'art'),id:'coat'},{...makePart('Tentacle one',rect(240,360,50,250),'art'),id:'tentacle'},{...makePart('Tip',rect(245,580,40,180),'art'),id:'tip'}];
  p=addConnection(p,{id:'hip',parentId:'coat',childId:'tentacle',parentAnchor:[265,380],childAnchor:[265,380],padRadius:12,angle:0});
  p=addConnection(p,{id:'bend',parentId:'tentacle',childId:'tip',parentAnchor:[265,600],childAnchor:[265,600],padRadius:12,angle:0});
  p.rods=[{id:'hold',partId:'coat',point:[280,180]}];return p;
}

test('new projects start blank and round-trip arbitrary image-backed parts',()=>{
  const blank=createStudioProject();assert.equal(blank.title,'');assert.equal(blank.parts.length,0);assert.equal(blank.brief.keywords,'');
  const project=threePartPuppet();project.brief={kind:'Creature',era:'Modern',style:'Ink cutout',keywords:'A scientist with seven tentacles, glasses and a white coat',action:'One tentacle waves'};
  assert.deepEqual(normalizeStudioProject(JSON.parse(JSON.stringify(project))),project);
  assert.deepEqual(validateStudio(project),[]);
});

test('arbitrary chains keep every pin aligned through nested rotations',()=>{
  const p=threePartPuppet();p.parts[0].x=37;p.parts[0].y=-15;p.parts[0].rotation=17;
  for(const a of [-110,-45,0,37,118])for(const b of [-99,0,88]){
    p.joints[0].angle=a;p.joints[1].angle=b;const matrices=partTransforms(p);
    for(const joint of p.joints){const parent=transformPoint(matrices[joint.parentId],joint.parentAnchor),child=transformPoint(matrices[joint.childId],joint.childAnchor);near(parent[0],child[0]);near(parent[1],child[1]);}
    const matrix=matrices.tip,original=[270,690],back=transformPoint(inverseMatrix(matrix),transformPoint(matrix,original));near(original[0],back[0]);near(original[1],back[1]);
  }
});

test('posing does not change the physical cut scale or drill diameter',()=>{
  const p=threePartPuppet(),scale=unitsPerMm(p),bounds=neutralProjectBounds(p),geometry=jointGeometry(p,p.joints[0]);
  near(geometry.holeRadius/scale,p.holeMm/2);
  p.joints[0].angle=100;p.joints[1].angle=-70;
  near(unitsPerMm(p),scale);assert.deepEqual(neutralProjectBounds(p),bounds);
  assert.notDeepEqual(projectBounds(p),bounds);
});

test('joining different original anchor positions aligns both sides at rest',()=>{
  let p=createStudioProject();p.parts=[{...makePart('Wing',rect(0,0,80,80)),id:'wing'},{...makePart('Feather',rect(200,200,80,80)),id:'feather'}];
  p=addConnection(p,{parentId:'wing',childId:'feather',parentAnchor:[40,40],childAnchor:[240,240],angle:40});
  const tx=partTransforms(p),a=transformPoint(tx.wing,[40,40]),b=transformPoint(tx.feather,[240,240]);near(a[0],b[0]);near(a[1],b[1]);
});

test('the connection graph rejects cycles, missing references and two parents',()=>{
  const p=threePartPuppet();
  assert.throws(()=>addConnection(p,{parentId:'tip',childId:'coat',parentAnchor:[265,600],childAnchor:[280,180]}),e=>e.code==='CONNECTION_CYCLE');
  assert.throws(()=>addConnection(p,{parentId:'coat',childId:'tip',parentAnchor:[280,180],childAnchor:[265,600]}),/one parent/);
  assert.throws(()=>addConnection(p,{parentId:'missing',childId:'tip',parentAnchor:[0,0],childAnchor:[0,0]}),/existing parts/);
  assert.equal(p.joints.length,2);
});

test('unsafe assets and invalid coordinates fail at the import boundary',()=>{
  const p=threePartPuppet();
  for(const bad of ['https://example.test/a.png','data:image/svg+xml;base64,PHN2Zz4=','javascript:alert(1)']){
    const q=structuredClone(p);q.assets[0].dataUrl=bad;assert.throws(()=>normalizeStudioProject(q),e=>e.code==='INVALID_ASSET');
  }
  for(const bad of [NaN,Infinity,undefined,'10']){const q=structuredClone(p);q.parts[0].polygon[0][0]=bad;assert.throws(()=>normalizeStudioProject(q),e=>e.code==='INVALID_GEOMETRY');}
  const duplicate=structuredClone(p);duplicate.parts[1].id=duplicate.parts[0].id;assert.throws(()=>normalizeStudioProject(duplicate),/Duplicate part/);
});

test('geometry checks distinguish internal pins from detached or too-small pads',()=>{
  const p=threePartPuppet();p.joints[0].parentAnchor=[500,500];p.joints[0].padRadius=10;
  assert.ok(validateStudio(p).some(issue=>issue.code==='DETACHED_JOINT_PAD'&&issue.level==='error'));
  p.joints[0].parentAnchor=[361,200];p.joints[0].childAnchor=[265,380];p.joints[0].padRadius=1.5;
  assert.ok(validateStudio(p).some(issue=>issue.code==='HOLE_OUTSIDE_TAB'));
  p.joints[0].padRadius=15;
  assert.ok(!validateStudio(p).some(issue=>issue.code==='DETACHED_JOINT_PAD'||issue.code==='HOLE_OUTSIDE_TAB'));
  p.rods[0].point=[0,0];assert.ok(validateStudio(p).some(issue=>issue.code==='ROD_OUTSIDE_PART'));
});

test('natural language proposal patches preserve untouched artwork and locked descendants',()=>{
  const p=threePartPuppet();p.parts[2].locked=true;
  const result=applyStudioProposal(p,{reply:'Make coat blue; do not change face or tentacles',parts:[{id:'coat',fill:'#1144aa',rotation:80},{id:'tip',polygon:rect(0,0,20,20),locked:false}],joints:[{id:'hip',angle:80}],removePartIds:['tip','coat']});
  assert.equal(result.parts.length,3);assert.equal(result.parts[0].fill,'#1144aa');assert.equal(result.parts[0].rotation,0);assert.deepEqual(result.parts[2],p.parts[2]);assert.deepEqual(result.joints,p.joints);
  assert.deepEqual(result.assets,p.assets);assert.deepEqual(result.parts[0].polygon,p.parts[0].polygon);
  assert.equal(p.parts[0].fill,'#bd6a43');
});

test('new custom parts can be added and connected in one accepted proposal',()=>{
  const p=threePartPuppet(),next=applyStudioProposal(p,{parts:[{id:'sleeve',name:'Wide sleeve',polygon:rect(330,170,180,80),assetId:'art',fill:'#aa5533'}],joints:[{id:'shoulder',parentId:'coat',childId:'sleeve',parentAnchor:[345,210],childAnchor:[345,210],padRadius:12}],brief:{keywords:'A white coat with one wide patterned sleeve'}});
  assert.equal(next.parts.length,4);assert.equal(next.joints.length,3);assert.equal(next.parts.at(-1).assetId,'art');assert.deepEqual(validateStudio(next),[]);
});

test('attached-part pose proposals cannot report an invisible rotation or move',()=>{
  const p=threePartPuppet(),snapshot=structuredClone(p);
  for(const patch of [{rotation:150},{x:25},{y:-40}])assert.throws(()=>applyStudioProposal(p,{parts:[{id:'tentacle',...patch}]}),error=>error.code==='ATTACHED_PART_POSE'&&/joint angle/.test(error.message));
  assert.deepEqual(p,snapshot,'invalid pose requests leave the source project intact');
  const echoed=applyStudioProposal(p,{parts:[{id:'tentacle',x:0,y:0,rotation:0,fill:'#225588'}]});
  assert.equal(echoed.parts[1].fill,'#225588');assert.deepEqual(partTransforms(echoed),partTransforms(p));
  const posed=applyStudioProposal(p,{joints:[{id:'hip',angle:90}]});
  assert.notDeepEqual(partTransforms(posed).tentacle,partTransforms(p).tentacle);
  const free=applyStudioProposal(p,{parts:[{id:'coat',rotation:150}]});assert.equal(free.parts[0].rotation,150);
  const detached=applyStudioProposal(p,{parts:[{id:'tentacle',rotation:150}],removeJointIds:['hip']});
  assert.equal(detached.parts[1].rotation,150);assert.ok(!detached.joints.some(j=>j.childId==='tentacle'));
});

test('crossed boundaries and malformed proposals are never accepted',()=>{
  const p=threePartPuppet(),crossed=[[0,0],[100,100],[0,100],[100,0],[150,50]];
  assert.equal(selfIntersects(crossed),true);
  assert.throws(()=>applyStudioProposal(p,{parts:[{id:'bad',name:'Bad',polygon:crossed}]}),e=>e.code==='INVALID_GEOMETRY');
  assert.throws(()=>applyStudioProposal(p,{parts:[{id:'bad',name:'Missing outline'}]}),e=>e.code==='INVALID_GEOMETRY');
  assert.equal(p.parts.length,3);
});

test('fixed joins stay fixed and hinge previews carry a fabrication test reminder',()=>{
  const p=threePartPuppet();p.joints[0].type='fixed';p.joints[0].angle=90;const normalized=normalizeStudioProject(p);assert.equal(normalized.joints[0].angle,0);assert.equal(jointGeometry(normalized,normalized.joints[0]).holeRadius,0);
  normalized.joints[1].type='hinge';assert.ok(validateStudio(normalized).some(issue=>issue.code==='HINGE_TEST'&&issue.level==='warning'));
});

test('saved versions reference image assets and keep restorable geometry',()=>{
  const p=threePartPuppet();p.revisions=[{id:'saved-one',label:'Before wider sleeve',createdAt:'2026-11-16T17:00:00Z',snapshot:{title:p.title,brief:p.brief,parts:structuredClone(p.parts),joints:structuredClone(p.joints),rods:structuredClone(p.rods),conceptAssetId:'art'}}];
  const normalized=normalizeStudioProject(p);assert.equal(normalized.revisions[0].snapshot.parts.length,3);assert.equal(normalized.revisions[0].snapshot.assets,undefined);assert.equal(normalized.assets.length,1);
});

test('legacy projects get an explicit non-destructive migration instruction',()=>{
  const p={schemaVersion:1,characters:[{name:'Original'}]};assert.throws(()=>normalizeStudioProject(p),e=>e.code==='LEGACY_PROJECT'&&/legacy/.test(e.message));assert.equal(p.characters[0].name,'Original');
});

test('point-in-polygon includes boundary and handles concave custom contours',()=>{
  const concave=[[0,0],[100,0],[100,20],[20,20],[20,100],[0,100]];
  assert.equal(pointInPolygon([10,90],concave),true);assert.equal(pointInPolygon([50,50],concave),false);assert.equal(pointInPolygon([20,50],concave),true);near(distanceToBoundary([10,50],concave),10);
});

test('UI audit revisions retain their timestamp without requiring a snapshot',()=>{
  const p=threePartPuppet();p.revisions=[{id:'edit-one',at:'2026-11-16T17:01:00Z',label:'Import artwork'}];
  const next=normalizeStudioProject(p);assert.equal(next.revisions[0].createdAt,'2026-11-16T17:01:00Z');assert.equal(next.revisions[0].snapshot,undefined);
});

test('short hex colors expand but invalid proposed appearance or connection types do not silently substitute',()=>{
  const p=threePartPuppet();assert.equal(applyStudioProposal(p,{parts:[{id:'coat',fill:'#29a'}]}).parts[0].fill,'#2299aa');
  assert.throws(()=>applyStudioProposal(p,{parts:[{id:'coat',fill:'blue with flowers'}]}),/hexadecimal colors/);
  assert.throws(()=>applyStudioProposal(p,{joints:[{id:'hip',type:'glued'}]}),/pivot, fixed or hinge/);
  assert.equal(p.parts[0].fill,'#bd6a43');assert.equal(p.joints[0].type,'pivot');
});

test('new artwork adoption protects locked shared joints but permits unrelated pieces',()=>{
  const p=threePartPuppet();p.parts[0].locked=true;const asset={...p.assets[0],id:'revised-art',name:'Revised colors'};
  const base=structuredClone(p);base.assets.push(asset);base.conceptAssetId=asset.id;
  assert.throws(()=>applyStudioProposal(base,{parts:p.parts.map(part=>({id:part.id,assetId:'revised-art'}))}),error=>error.code==='LOCKED_PART'&&/printed artwork/.test(error.message));
  const result=applyStudioProposal(base,{parts:[{id:'tip',assetId:'revised-art'}]});
  assert.equal(result.parts[0].assetId,'art');assert.equal(result.parts[1].assetId,'art');assert.equal(result.parts[2].assetId,'revised-art');assert.equal(result.assets.length,2);
  assert.equal(result.conceptAssetId,'revised-art');
});

test('overlapping distinct drill holes are blocked while a shared pin center is allowed',()=>{
  const p=threePartPuppet();p.joints[1].parentAnchor=[265,382];p.joints[1].childAnchor=[265,600];
  assert.ok(validateStudio(p).some(issue=>issue.code==='HOLES_OVERLAP'&&issue.level==='error'));
  p.joints[1].parentAnchor=[265,380];
  assert.ok(!validateStudio(p).some(issue=>issue.code==='HOLES_OVERLAP'));
});
