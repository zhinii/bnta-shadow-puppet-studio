import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,makePart,addConnection,normalizeStudioProject,partTransforms,transformPoint,unitsPerMm,polygonArea,pointInPolygon,validateStudio} from '../public/studio-model.mjs';
import {suggestJointMarkers,buildJointPlan} from '../public/studio-joint-plan.mjs';

const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const sameMatrix=(a,b)=>a.forEach((n,i)=>near(n,b[i]));
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1cAAAAASUVORK5CYII=';
function character(points=[[0,0],[100,0],[100,60],[70,60],[70,220],[50,220],[50,60],[0,60]]){
 const p=createStudioProject();p.heightMm=220;p.assets=[{id:'art',name:'Source',dataUrl:png,width:200,height:240}];p.conceptAssetId='art';
 p.parts=[{...makePart('Character',points,'art'),id:'character'}];return normalizeStudioProject(p);
}
const marker=(id,point,partId='character',angleDegrees=0)=>({id,partId,point,angleDegrees});

test('deterministic suggestions find separate narrow limbs and avoid torso corners',()=>{
 const p=character([[0,0],[120,0],[120,60],[100,60],[100,180],[80,180],[80,60],[40,60],[40,180],[20,180],[20,60],[0,60]]);p.heightMm=180;
 const original=JSON.stringify(p),markers=suggestJointMarkers(p);
 assert.ok(markers.length>=2&&markers.length<=6);assert.deepEqual(markers,suggestJointMarkers(p));
 assert.ok(markers.some(m=>m.point[0]<60));assert.ok(markers.some(m=>m.point[0]>60));
 for(const m of markers){assert.equal(m.partId,'character');assert.ok(m.point[1]>60);assert.ok(pointInPolygon(m.point,p.parts[0].polygon));}
 const result=buildJointPlan(p,markers);assert.ok(result.markers.every(m=>m.status==='ready'));
 assert.equal(result.jointIds.length,markers.length);assert.equal(validateStudio(result.project).filter(i=>i.level==='error').length,0);assert.equal(JSON.stringify(p),original);
});

test('a sequence of markers resolves into newly split descendants using original image coordinates',()=>{
 const p=character(),original=JSON.stringify(p),scale=unitsPerMm(p),markers=[marker('bend-a',[60,80]),marker('bend-b',[60,130]),marker('bend-c',[60,180])];
 const result=buildJointPlan(p,markers);
 assert.deepEqual(result.markers.map(m=>m.status),['ready','ready','ready']);assert.equal(result.project.parts.length,4);assert.equal(result.jointIds.length,3);
 assert.notEqual(result.markers[1].resolvedPartId,'character');assert.notEqual(result.markers[2].resolvedPartId,'character');
 result.markers.forEach((m,i)=>{near(m.point[0],markers[i].point[0]);near(m.point[1],markers[i].point[1]);});
 near(result.project.parts.reduce((sum,part)=>sum+Math.abs(polygonArea(part.polygon)),0),Math.abs(polygonArea(p.parts[0].polygon)));
 near(unitsPerMm(result.project),scale);assert.equal(JSON.stringify(p),original);
 for(const part of result.project.parts){assert.equal(part.assetId,'art');assert.deepEqual(part.artworkMatrix,p.parts[0].artworkMatrix);}
 assert.equal(result.project.assets[0].dataUrl,p.assets[0].dataUrl);
});

test('plans preserve transformed chains, incoming joints, locked descendants and control rods',()=>{
 let p=character(rect(0,0,24,180));p.heightMm=220;p.parts[0].artworkMatrix=[1.1,.1,0,1.2,-4,8];
 p.parts.unshift({...makePart('Body',rect(-40,-50,100,80),'art'),id:'body',x:140,y:80,rotation:27});
 p.parts.push({...makePart('Hand',rect(3,165,18,30),'art'),id:'hand',locked:true});
 p=addConnection(p,{id:'shoulder',parentId:'body',childId:'character',parentAnchor:[30,20],childAnchor:[12,10],angle:35,min:-90,max:90,padRadius:8});
 p=addConnection(p,{id:'wrist',parentId:'character',childId:'hand',parentAnchor:[12,170],childAnchor:[12,170],angle:-20,min:-90,max:90,padRadius:8});
 p.rods=[{id:'rod',partId:'character',point:[12,160]}];
 const before=partTransforms(p),locked=structuredClone(p.parts.find(part=>part.id==='hand')),result=buildJointPlan(p,[marker('elbow',[12,60]),marker('lower',[12,120])]),after=partTransforms(result.project);
 assert.ok(result.markers.every(m=>m.status==='ready'));
 for(const id of ['body','character','hand'])sameMatrix(before[id],after[id]);
 for(const part of result.project.parts.filter(part=>!['body','hand'].includes(part.id)))sameMatrix(before.character,after[part.id]);
 assert.deepEqual(result.project.parts.find(part=>part.id==='hand'),locked);assert.equal(result.project.joints.find(j=>j.id==='shoulder').childId,'character');
 assert.notEqual(result.project.joints.find(j=>j.id==='wrist').parentId,'character');assert.notEqual(result.project.rods[0].partId,'character');near(unitsPerMm(result.project),unitsPerMm(p));
 for(const report of result.markers){const joint=result.project.joints.find(j=>j.id===report.jointId),world=transformPoint(after[joint.parentId],joint.parentAnchor),expected=transformPoint(before.character,report.point);near(world[0],expected[0]);near(world[1],expected[1]);}
});

test('duplicates and failed markers are individually reported while valid later bends still build',()=>{
 const p=character(),markers=[marker('good',[60,80]),marker('good',[60,130]),marker('same-place',[60,80]),marker('outside',[500,500]),marker('missing',[60,140],'absent'),marker('later',[60,170])],result=buildJointPlan(p,markers);
 assert.deepEqual(result.markers.map(m=>m.status),['ready','needs-review','needs-review','needs-review','needs-review','ready']);
 assert.equal(result.jointIds.length,2);assert.match(result.markers[1].message,/repeated/);assert.match(result.markers[2].message,/already a joint|too close/);
 assert.ok(result.markers.filter(m=>m.status==='needs-review').every(m=>m.message));assert.match(result.warnings[0],/4 bend markers need review; 2 joints are ready/);
 assert.equal(validateStudio(result.project).filter(i=>i.level==='error').length,0);
});

test('locked pieces and existing joints remain untouched, and suggestions do not link separate props',()=>{
 const p=character();p.parts.push({...makePart('Prop',rect(180,0,20,160),'art'),id:'prop'});p.parts[0].locked=true;
 const original=JSON.stringify(p),suggested=suggestJointMarkers(p),result=buildJointPlan(p,[marker('locked',[60,80]),marker('prop-bend',[190,90],'prop')]);
 assert.ok(suggested.every(m=>m.partId==='prop'));assert.equal(result.markers[0].status,'needs-review');assert.equal(result.markers[1].status,'ready');
 assert.deepEqual(result.project.parts.find(part=>part.id==='character'),p.parts[0]);assert.ok(result.project.joints.every(j=>j.parentId!=='character'&&j.childId!=='character'));assert.equal(JSON.stringify(p),original);
 const existing=buildJointPlan(character(),[marker('first',[60,100])]).project,joint=structuredClone(existing.joints[0]),again=buildJointPlan(existing,[marker('too-close',[60,98])]);
 assert.equal(again.markers[0].status,'needs-review');assert.deepEqual(again.project.joints[0],joint);
});

test('invalid entries and a marker count over twelve are bounded and explicitly reported',()=>{
 const p=character(),markers=[null,{},marker('bad-angle',[60,90],'character',Infinity),...Array.from({length:12},(_,i)=>marker('m'+i,[60,80+i*8]))],result=buildJointPlan(p,markers);
 assert.equal(result.markers.length,markers.length);assert.equal(result.markers[0].status,'needs-review');assert.equal(result.markers[2].status,'needs-review');
 assert.ok(result.markers.slice(12).every(m=>m.status==='needs-review'&&m.message.includes('at most 12')));
 assert.ok(result.jointIds.length<=12);assert.deepEqual(suggestJointMarkers(p,{maxMarkers:0}),[]);assert.ok(suggestJointMarkers(p,{maxMarkers:100}).length<=12);
 assert.equal(buildJointPlan(p,null).jointIds.length,0);
});

test('broad blocks and small scraps do not receive automatic marker suggestions',()=>{
 const p=character(rect(0,0,100,100));p.heightMm=100;assert.deepEqual(suggestJointMarkers(p),[]);
 const scrap=character(rect(0,0,3,6));scrap.heightMm=6;assert.deepEqual(suggestJointMarkers(scrap),[]);
});

test('suggestion work remains bounded with eighty dense contours',()=>{
 const p=createStudioProject();p.heightMm=200;
 const dense=Array.from({length:512},(_,i)=>{const a=2*Math.PI*i/512;return [16*Math.cos(a),100*Math.sin(a)];});
 p.parts=Array.from({length:80},(_,i)=>({...makePart('Piece '+i,dense),id:'piece-'+i,x:i*100}));
 assert.deepEqual(suggestJointMarkers(p),[]);
 const result=buildJointPlan(p,[marker('full',[0,0],'piece-0')]);assert.ok(result.markers.every(m=>m.status==='needs-review'));assert.equal(result.project.parts.length,80);
 p.parts.pop();const markers=suggestJointMarkers(p,{maxMarkers:6});assert.equal(markers.length,1);assert.deepEqual(markers,suggestJointMarkers(p,{maxMarkers:6}));
});
