import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,makePart,addConnection,normalizeStudioProject,partTransforms,transformPoint,polygonArea,unitsPerMm,validateStudio} from '../public/studio-model.mjs';
import {splitPart,suggestConnection} from '../public/studio-construction.mjs';

const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const sameMatrix=(a,b)=>a.forEach((n,i)=>near(n,b[i]));
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1cAAAAASUVORK5CYII=';
function sheet(points=rect(0,0,100,200)){
 const p=createStudioProject();p.assets=[{id:'art',name:'Artwork',dataUrl:png,width:200,height:240}];p.conceptAssetId='art';p.heightMm=200;
 p.parts=[{...makePart('Sleeve',points,'art'),id:'sleeve'}];return normalizeStudioProject(p);
}
function chain(){
 let p=sheet();p.parts.unshift({...makePart('Torso',rect(-80,-100,180,140),'art'),id:'torso',x:80,y:40,rotation:17});
 p.parts.push({...makePart('Hand',rect(10,165,75,90),'art'),id:'hand'});
 p=addConnection(p,{id:'shoulder',parentId:'torso',childId:'sleeve',parentAnchor:[40,20],childAnchor:[40,20],angle:36,min:-90,max:90,padRadius:10});
 p=addConnection(p,{id:'wrist',parentId:'sleeve',childId:'hand',parentAnchor:[45,185],childAnchor:[45,185],angle:-12,min:-90,max:90,padRadius:10});
 p.rods=[{id:'hold',partId:'sleeve',point:[35,175]}];return p;
}

test('split retains image pixels, closes both cut shapes and creates a valid overlap hinge',()=>{
 const p=sheet(),original=JSON.stringify(p),scale=unitsPerMm(p);
 const result=splitPart(p,'sleeve',[-20,100],[120,100]);
 assert.equal(result.project.parts.length,2);assert.deepEqual(result.partIds[0],'sleeve');assert.equal(result.project.assets[0].dataUrl,p.assets[0].dataUrl);
 assert.ok(result.project.parts.every(part=>part.assetId==='art'));
 near(result.project.parts.reduce((sum,part)=>sum+Math.abs(polygonArea(part.polygon)),0),20000);
 const joint=result.project.joints.find(j=>j.id===result.jointId);assert.deepEqual(joint.parentAnchor,[50,100]);assert.deepEqual(joint.childAnchor,[50,100]);assert.ok(joint.padRadius>result.project.holeMm/2*scale);
 assert.equal(validateStudio(result.project).filter(x=>x.level==='error').length,0);
 near(unitsPerMm(result.project),scale);assert.equal(JSON.stringify(p),original);assert.match(result.warnings[0],/hidden artwork has not been reconstructed/);
});

test('splitting a posed linked part preserves its incoming joint, outgoing children, rods and current world pose',()=>{
 const p=chain(),before=partTransforms(p),result=splitPart(p,'sleeve',[-20,100],[120,100]),after=partTransforms(result.project),newId=result.partIds[1];
 assert.equal(result.project.joints.find(j=>j.id==='shoulder').childId,'sleeve');
 assert.equal(result.project.joints.find(j=>j.id==='wrist').parentId,newId);assert.equal(result.project.rods[0].partId,newId);
 sameMatrix(before.sleeve,after.sleeve);sameMatrix(before.sleeve,after[newId]);sameMatrix(before.hand,after.hand);
 const pin=result.project.joints.find(j=>j.id===result.jointId);pin.angle=65;
 const posed=partTransforms(result.project),a=transformPoint(posed[pin.parentId],pin.parentAnchor),b=transformPoint(posed[pin.childId],pin.childAnchor);near(a[0],b[0]);near(a[1],b[1]);
 assert.notDeepEqual(posed[newId],after[newId]);
});

test('an unconnected split section preserves the current world transform instead of jumping to raw source coordinates',()=>{
 const p=chain(),before=partTransforms(p),result=splitPart(p,'sleeve',[-20,100],[120,100],{connect:false}),after=partTransforms(result.project);
 assert.equal(result.jointId,null);sameMatrix(before.sleeve,after[result.partIds[1]]);sameMatrix(before.hand,after.hand);
 assert.equal(result.project.joints.length,p.joints.length);
});

test('simple concave splits are supported, while disconnected half-plane fragments and tangential cuts reject',()=>{
 const lShape=sheet([[0,0],[120,0],[120,40],[40,40],[40,120],[0,120]]);
 const result=splitPart(lShape,'sleeve',[-10,80],[130,80],{connect:false});assert.equal(result.project.parts.length,2);near(result.project.parts.reduce((sum,p)=>sum+Math.abs(polygonArea(p.polygon)),0),8000);
 const uShape=sheet([[0,0],[100,0],[100,100],[70,100],[70,30],[30,30],[30,100],[0,100]]);
 assert.throws(()=>splitPart(uShape,'sleeve',[-10,60],[110,60]),{code:'COMPLEX_CUT'});
 assert.throws(()=>splitPart(sheet(),'sleeve',[-10,0],[110,0]),{code:'CUT_ON_EDGE'});
 assert.throws(()=>splitPart(sheet(),'sleeve',[0,0],[0,0]),{code:'INVALID_CUT'});
 assert.throws(()=>splitPart(sheet(),'sleeve',[-10,-20],[110,-20]),{code:'COMPLEX_CUT'});
});

test('locked pieces cannot be split and locked descendants retain their artwork and world geometry',()=>{
 const locked=sheet();locked.parts[0].locked=true;assert.throws(()=>splitPart(locked,'sleeve',[-20,100],[120,100]),{code:'LOCKED_PART'});
 const p=chain();p.parts.find(x=>x.id==='hand').locked=true;const before=partTransforms(p),hand=structuredClone(p.parts.find(x=>x.id==='hand'));
 const result=splitPart(p,'sleeve',[-20,100],[120,100]);assert.deepEqual(result.project.parts.find(x=>x.id==='hand'),hand);sameMatrix(before.hand,partTransforms(result.project).hand);
});

test('source artwork transforms survive a split and per-piece size controls rebase without moving pixels',()=>{
 const p=sheet();p.parts[0].artworkMatrix=[1.2,0,0,1.5,-5,10];p.parts[0].parameters={width:1.2,length:1.5,axisAngle:15};
 const result=splitPart(p,'sleeve',[-20,100],[120,100]);
 for(const piece of result.project.parts){assert.deepEqual(piece.artworkMatrix,p.parts[0].artworkMatrix);assert.equal(piece.parameters.width,1);assert.equal(piece.parameters.length,1);assert.equal(piece.parameters.axisAngle,15);assert.equal(piece.parameters.origin.length,2);}
});

test('an explicit overlapping pair gets an interior geometric pivot without changing either pose',()=>{
 const p=createStudioProject();p.heightMm=100;p.parts=[{...makePart('Upper arm',rect(0,0,80,100)),id:'a'},{...makePart('Forearm',rect(40,20,80,100)),id:'b'}];
 const original=JSON.stringify(p),before=partTransforms(p),result=suggestConnection(p,'a','b'),after=partTransforms(result.project);
 assert.ok(result.joint.parentAnchor[0]>40&&result.joint.parentAnchor[0]<80);assert.ok(result.joint.parentAnchor[1]>20&&result.joint.parentAnchor[1]<100);
 sameMatrix(before.a,after.a);sameMatrix(before.b,after.b);assert.equal(JSON.stringify(p),original);assert.match(result.warnings[0],/not an identified anatomical joint/);
});

test('nearby outlines can use overlap tabs, but distant props and already-parented parts are not auto-connected',()=>{
 const p=createStudioProject();p.heightMm=100;p.parts=[{...makePart('A',rect(0,0,50,100)),id:'a'},{...makePart('B',rect(56,0,50,100)),id:'b'}];
 const result=suggestConnection(p,'a','b');assert.equal(result.project.joints.length,1);near(unitsPerMm(result.project),unitsPerMm(p));assert.ok(result.warnings.some(w=>w.includes('bridge the gap')));
 assert.throws(()=>suggestConnection(result.project,'a','b'),{code:'EXISTING_PARENT'});
 p.parts[1].x=100;assert.throws(()=>suggestConnection(p,'a','b'),{code:'PARTS_TOO_FAR'});
 p.parts[1].x=0;p.parts[0].locked=true;assert.throws(()=>suggestConnection(p,'a','b'),{code:'LOCKED_PART'});
});

test('suggested pivots preserve relative rotation and fixed joins reject an unexpected orientation change',()=>{
 const p=createStudioProject();p.heightMm=150;p.parts=[{...makePart('A',rect(-50,-50,100,100)),id:'a',rotation:20},{...makePart('B',rect(-40,-40,80,80)),id:'b',rotation:50}];
 const before=partTransforms(p),result=suggestConnection(p,'a','b');near(result.joint.angle,30);sameMatrix(before.b,partTransforms(result.project).b);
 assert.throws(()=>suggestConnection(p,'a','b',{type:'fixed'}),{code:'FIXED_ALIGNMENT'});
});

test('small traced components below 50 mm retain their physical scale when split and connected',()=>{
 const p=sheet();p.heightMm=20;const scale=unitsPerMm(p);
 const split=splitPart(p,'sleeve',[-20,100],[120,100]);
 near(unitsPerMm(split.project),scale);assert.ok(split.project.heightMm<50);
 const separate=splitPart(p,'sleeve',[-20,100],[120,100],{connect:false});
 const connected=suggestConnection(separate.project,...separate.partIds);
 near(unitsPerMm(connected.project),scale);assert.ok(connected.project.heightMm<50);
});
