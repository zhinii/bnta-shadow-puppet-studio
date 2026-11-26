import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStudioProject,makePart,addConnection,normalizeStudioProject,partTransforms,transformPoint,polygonArea,unitsPerMm,validateStudio,jointGeometry,pointInPolygon,selfIntersects} from '../public/studio-model.mjs';
import {splitPart,suggestConnection,suggestJointAt,repositionJointPivot,setJointOverlapDiameter,inspectJointOverlap} from '../public/studio-construction.mjs';

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

test('repositioning an accepted pin preserves the posed chain, artwork, rods, scale and locked descendants',()=>{
 const p=chain();p.parts.find(part=>part.id==='hand').locked=true;
 const before=normalizeStudioProject(p),original=JSON.stringify(p),transforms=partTransforms(before),worldPoint=transformPoint(transforms.torso,[45,22]);
 const next=repositionJointPivot(p,'shoulder',worldPoint),after=partTransforms(next),joint=next.joints.find(j=>j.id==='shoulder');
 for(const id of Object.keys(transforms))sameMatrix(transforms[id],after[id]);
 sameMatrix(transformPoint(after.torso,joint.parentAnchor),worldPoint);sameMatrix(transformPoint(after.sleeve,joint.childAnchor),worldPoint);
 assert.deepEqual(next.parts,before.parts);assert.deepEqual(next.assets,before.assets);assert.deepEqual(next.rods,before.rods);
 assert.deepEqual(next.joints.find(j=>j.id==='wrist'),before.joints.find(j=>j.id==='wrist'));assert.equal(joint.angle,36);
 near(unitsPerMm(next),unitsPerMm(before));assert.equal(JSON.stringify(p),original);
 assert.equal(validateStudio(next).filter(issue=>issue.level==='error').length,0);
 // The new centres stay coincident throughout the allowed movement, not just at the resting angle.
 for(const angle of [-90,-35,0,50,90]){const posed=structuredClone(next);posed.joints.find(j=>j.id==='shoulder').angle=angle;const matrices=partTransforms(posed);sameMatrix(transformPoint(matrices.torso,joint.parentAnchor),transformPoint(matrices.sleeve,joint.childAnchor));}
});

test('moving a split joint clears stale span claims and never inflates circles across repeated moves',()=>{
 const result=splitPart(sheet(),'sleeve',[-20,100],[120,100]),before=result.project,original=structuredClone(before),joint=before.joints[0],radius=joint.padRadius,scale=unitsPerMm(before);
 assert.ok(joint.overlapSpans);let next=before;
 for(const point of [[55,100],[60,105],[45,95],[50,100]]){
  next=repositionJointPivot(next,joint.id,point);const moved=next.joints[0];
  assert.equal(moved.padRadius,radius);assert.equal(moved.overlapSpans,undefined);assert.equal(moved.overlapSizing,'custom');near(unitsPerMm(next),scale);
  assert.deepEqual(next.parts,before.parts);assert.deepEqual(next.assets,before.assets);assert.equal(validateStudio(next).filter(issue=>issue.level==='error').length,0);
 }
 assert.deepEqual(before,original);assert.deepEqual(normalizeStudioProject(JSON.parse(JSON.stringify(next))),next);
});

test('joint relocation keeps custom diameter and rejects detached or weakly attached pin positions',()=>{
 const result=splitPart(sheet(),'sleeve',[-20,100],[120,100]),id=result.jointId,small=setJointOverlapDiameter(result.project,id,20),original=structuredClone(small);
 const moved=repositionJointPivot(small,id,[52,104]);assert.equal(moved.joints[0].padRadius,small.joints[0].padRadius);near(unitsPerMm(moved),unitsPerMm(small));
 assert.throws(()=>repositionJointPivot(small,id,[50,109]),{code:'WEAK_TAB_ATTACHMENT'});
 assert.throws(()=>repositionJointPivot(small,id,[50,160]),{code:'PIVOT_OUTSIDE_PAIR'});
 assert.throws(()=>repositionJointPivot(small,id,[1000,1000]),{code:'PIVOT_OUTSIDE_PAIR'});assert.deepEqual(small,original);
});

test('joint relocation guards locks, invalid points and intersecting holes without adding connections',()=>{
 const result=splitPart(sheet(),'sleeve',[-20,100],[120,100]),id=result.jointId;
 for(const index of [0,1]){const locked=structuredClone(result.project);locked.parts[index].locked=true;assert.throws(()=>repositionJointPivot(locked,id,[52,100]),{code:'LOCKED_PART'});}
 assert.throws(()=>repositionJointPivot(result.project,'missing',[50,100]),{code:'JOINT_NOT_FOUND'});
 for(const point of [null,[NaN,0],['50',100],[50,100,0]])assert.throws(()=>repositionJointPivot(result.project,id,point),{code:'INVALID_JOINT_POINT'});
 const fixed=structuredClone(result.project);Object.assign(fixed.joints[0],{type:'fixed',angle:0,min:0,max:0});assert.throws(()=>repositionJointPivot(fixed,id,[52,100]),{code:'FIXED_CONNECTION'});
 let crowded=createStudioProject();crowded.heightMm=100;crowded.parts=['a','b','c'].map(id=>({...makePart(id,rect(0,0,100,100)),id}));
 crowded=addConnection(crowded,{id:'ab',parentId:'a',childId:'b',parentAnchor:[50,50],childAnchor:[50,50],angle:0,min:-90,max:90,padRadius:10});
 crowded=addConnection(crowded,{id:'bc',parentId:'b',childId:'c',parentAnchor:[60,50],childAnchor:[60,50],angle:0,min:-90,max:90,padRadius:10});
 assert.throws(()=>repositionJointPivot(crowded,'ab',[59.5,50]),{code:'UNSAFE_CONSTRUCTION'});
 const withProp=structuredClone(result.project);withProp.parts.push({...makePart('Separate prop',rect(70,95,10,10)),id:'prop'});const next=repositionJointPivot(withProp,id,[53,100]);
 assert.deepEqual(next.parts.find(part=>part.id==='prop'),normalizeStudioProject(withProp).parts.find(part=>part.id==='prop'));assert.equal(next.joints.length,1);assert.ok(inspectJointOverlap(next,id).overlappingPartIds.includes('prop'));
});

test('batch source eligibility checks the same original chord while standalone joint placement uses the current piece',()=>{
 const p=sheet(rect(0,0,80,300));p.heightMm=300;
 const first=suggestJointAt(p,'sleeve',[40,100],{angleDegrees:0}),target=first.project.parts.find(part=>pointInPolygon([40,150],part.polygon));
 assert.ok(suggestJointAt(first.project,target.id,[40,150],{angleDegrees:0}).jointId,'Intentional standalone placement retains its current-piece rules.');
 assert.throws(()=>suggestJointAt(first.project,target.id,[40,150],{angleDegrees:0,sourcePolygon:p.parts[0].polygon}),{code:'JOINT_SECTION_TOO_BROAD'});
 assert.throws(()=>suggestJointAt(first.project,target.id,[40,150],{angleDegrees:0,sourcePolygon:[[0,0],[1,1]]}),{code:'INVALID_CUT'});
});

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

test('one tap selects the short cross-section and retains the larger body without changing pixels or scale',()=>{
 const p=sheet(rect(0,0,24,120));p.heightMm=120;p.parts[0].artworkMatrix=[1.2,0,0,1.1,-5,8];
 const original=JSON.stringify(p),result=suggestJointAt(p,'sleeve',[12,85]),body=result.project.parts.find(p=>p.id==='sleeve'),moving=result.project.parts.find(p=>p.id===result.partIds[1]);
 near(result.angleDegrees,0);assert.deepEqual(result.pivot,[12,85]);
 assert.ok(Math.abs(polygonArea(body.polygon))>Math.abs(polygonArea(moving.polygon)));
 assert.ok(pointInPolygon([12,10],body.polygon));assert.ok(pointInPolygon([12,110],moving.polygon));
 assert.equal(result.project.assets[0].dataUrl,p.assets[0].dataUrl);
 for(const part of result.project.parts)assert.deepEqual(part.artworkMatrix,p.parts[0].artworkMatrix);
 near(unitsPerMm(result.project),unitsPerMm(p));assert.equal(JSON.stringify(p),original);
 assert.ok(moving.z>body.z);assert.equal(validateStudio(result.project).filter(x=>x.level==='error').length,0);
});

test('an arbitrary animal silhouette splits at the tapped narrow leg without cutting the body',()=>{
 const outline=[[0,0],[120,0],[120,60],[100,60],[100,160],[80,160],[80,60],[0,60]],p=sheet(outline);p.heightMm=160;
 const result=suggestJointAt(p,'sleeve',[90,110]),joint=result.project.joints.find(j=>j.id===result.jointId);
 assert.deepEqual(result.pivot,[90,110]);assert.equal(joint.type,'pivot');assert.equal(joint.min,-60);assert.equal(joint.max,60);
 assert.ok(pointInPolygon([20,20],result.project.parts[0].polygon));
 assert.ok(result.project.parts.every(p=>!selfIntersects(p.polygon)));
 near(result.project.parts.reduce((sum,p)=>sum+Math.abs(polygonArea(p.polygon)),0),Math.abs(polygonArea(outline)));
 assert.equal(validateStudio(result.project).filter(x=>x.level==='error').length,0);
});

test('both cut pieces receive real positive overlap around the same pin throughout the preview range',()=>{
 const p=sheet(rect(0,0,24,120));p.heightMm=120;p.materialMm=1.5;
 const result=suggestJointAt(p,'sleeve',[12,85]),joint=result.project.joints.find(j=>j.id===result.jointId),geometry=jointGeometry(result.project,joint);
 assert.equal(geometry.sides.length,2);assert.ok(geometry.padRadius-geometry.holeRadius>=3*unitsPerMm(p));
 assert.ok(geometry.padRadius*Math.cos(Math.PI/96)>=12,'The full round end covers the 24-unit limb width.');
 assert.deepEqual(joint.parentAnchor,joint.childAnchor);
 for(const side of geometry.sides){
  const part=result.project.parts.find(p=>p.id===side.partId);
  assert.ok(pointInPolygon(side.anchor,part.polygon));
  // Each circular tab crosses the new boundary into the other piece's side.
  const radius=geometry.padRadius*.75;
  assert.ok([[side.anchor[0],side.anchor[1]-radius],[side.anchor[0],side.anchor[1]+radius]].some(point=>!pointInPolygon(point,part.polygon)));
 }
 for(const angle of [-60,-30,0,30,60]){
  joint.angle=angle;const transforms=partTransforms(result.project),a=transformPoint(transforms[joint.parentId],joint.parentAnchor),b=transformPoint(transforms[joint.childId],joint.childAnchor);
  near(a[0],b[0]);near(a[1],b[1]);
 }
});

test('a posed chain preserves the incoming side, descendants, control rods and locked artwork',()=>{
 const p=chain();p.parts.find(p=>p.id==='hand').locked=true;
 const before=partTransforms(p),hand=structuredClone(p.parts.find(p=>p.id==='hand')),result=suggestJointAt(p,'sleeve',[50,65]),after=partTransforms(result.project),newId=result.partIds[1];
 assert.equal(result.project.joints.find(j=>j.id==='shoulder').childId,'sleeve');
 assert.equal(result.project.joints.find(j=>j.id==='wrist').parentId,newId);assert.equal(result.project.rods[0].partId,newId);
 // Incoming attachment wins over the larger-area heuristic for connected parts.
 assert.ok(Math.abs(polygonArea(result.project.parts.find(p=>p.id==='sleeve').polygon))<Math.abs(polygonArea(result.project.parts.find(p=>p.id===newId).polygon)));
 sameMatrix(before.sleeve,after.sleeve);sameMatrix(before.sleeve,after[newId]);sameMatrix(before.hand,after.hand);
 assert.deepEqual(result.project.parts.find(p=>p.id==='hand'),hand);near(unitsPerMm(result.project),unitsPerMm(p));
});

test('joint suggestions reject broad body cuts, locked pieces, outside taps and nearby existing pins',()=>{
 const broad=sheet(rect(0,0,100,100));broad.heightMm=100;
 assert.throws(()=>suggestJointAt(broad,'sleeve',[50,50]),{code:'JOINT_SECTION_TOO_BROAD'});
 const narrow=sheet(rect(0,0,24,120));narrow.heightMm=120;
 assert.throws(()=>suggestJointAt(narrow,'sleeve',[40,85]),{code:'INVALID_JOINT_POINT'});
 narrow.parts[0].locked=true;assert.throws(()=>suggestJointAt(narrow,'sleeve',[12,85]),{code:'LOCKED_PART'});narrow.parts[0].locked=false;
 const result=suggestJointAt(narrow,'sleeve',[12,85]);
 assert.throws(()=>suggestJointAt(result.project,'sleeve',[12,83]),{code:'JOINT_TOO_CLOSE'});
 assert.throws(()=>suggestJointAt(narrow,'sleeve',[12,85],{angleDegrees:NaN}),{code:'INVALID_CUT'});
});

test('wide garment branches remain reviewable while broad halves and over-limit sections reject',()=>{
 const p=sheet(rect(0,0,80,240));p.heightMm=240;
 const result=suggestJointAt(p,'sleeve',[40,180]);
 assert.deepEqual(result.pivot,[40,180]);assert.match(result.warnings.join(' '),/broad \(80\.0 mm\).*paper prototype/);
 near(result.project.parts.reduce((sum,part)=>sum+Math.abs(polygonArea(part.polygon)),0),80*240);near(unitsPerMm(result.project),unitsPerMm(p));
 assert.throws(()=>suggestJointAt(p,'sleeve',[40,120]),{code:'JOINT_SECTION_TOO_BROAD'},'A wider body must not be suggested as two similar halves.');
 const overLimit=sheet(rect(0,0,95,300));overLimit.heightMm=300;
 assert.throws(()=>suggestJointAt(overLimit,'sleeve',[47.5,240]),{code:'JOINT_SECTION_TOO_BROAD'},'The expanded width remains bounded.');
 assert.throws(()=>suggestJointAt(result.project,'sleeve',[40,178]),{code:'JOINT_TOO_CLOSE'});
 const zh=structuredClone(p);zh.language='zh';assert.match(suggestJointAt(zh,'sleeve',[40,180]).warnings.join(' '),/80\.0 毫米.*纸样/);
});

test('the generated 469-vertex horse accepts its actual wide neck without admitting a torso half-cut',()=>{
 const p=JSON.parse(readFileSync(new URL('./fixtures/generated-horse-wide-neck-outline.puppet.json',import.meta.url),'utf8')),part=p.parts[0],original=JSON.stringify(p),scale=unitsPerMm(p);
 assert.equal(part.polygon.length,469);assert.equal(p.assets.length,0);
 const result=suggestJointAt(p,part.id,[350,320]),width=Math.hypot(result.cutLine[1][0]-result.cutLine[0][0],result.cutLine[1][1]-result.cutLine[0][1])/scale;
 assert.ok(width>60&&width<90);assert.match(result.warnings.join(' '),/section is broad/);
 const head=result.project.parts.find(piece=>piece.id===result.partIds[1]),body=result.project.parts.find(piece=>piece.id===part.id);
 assert.ok(pointInPolygon([200,290],head.polygon));assert.ok(pointInPolygon([550,500],body.polygon));
 near(result.project.parts.reduce((sum,piece)=>sum+Math.abs(polygonArea(piece.polygon)),0),Math.abs(polygonArea(part.polygon)));near(unitsPerMm(result.project),scale);
 assert.ok(result.project.parts.every(piece=>!selfIntersects(piece.polygon)));assert.equal(validateStudio(result.project).filter(issue=>issue.level==='error').length,0);
 assert.throws(()=>suggestJointAt(p,part.id,[530,510]),{code:'JOINT_SECTION_TOO_BROAD'});
 assert.equal(JSON.stringify(p),original);
});

test('an explicit angle selects only the interior chord containing the tapped limb',()=>{
 const p=sheet(rect(0,0,24,120));p.heightMm=120;
 const result=suggestJointAt(p,'sleeve',[12,85],{angleDegrees:15});near(result.angleDegrees,15);
 const [a,b]=result.cutLine;near((b[1]-a[1])/(b[0]-a[0]),Math.tan(Math.PI/12));
 near(result.pivot[0],12);near(result.pivot[1],85);
 const u=sheet([[0,0],[100,0],[100,100],[70,100],[70,30],[30,30],[30,100],[0,100]]);u.heightMm=100;
 const horizontal=suggestJointAt(u,'sleeve',[15,60],{angleDegrees:0});
 assert.deepEqual(horizontal.cutLine,[[0,60],[30,60]]);
 const moving=horizontal.project.parts.find(p=>p.id===horizontal.partIds[1]),retained=horizontal.project.parts.find(p=>p.id==='sleeve');
 assert.ok(pointInPolygon([15,85],moving.polygon));assert.ok(!pointInPolygon([85,85],moving.polygon));
 assert.ok(pointInPolygon([85,85],retained.polygon),'The other limb stays intact even below the same infinite line.');
 near(horizontal.project.parts.reduce((sum,p)=>sum+Math.abs(polygonArea(p.polygon)),0),Math.abs(polygonArea(u.parts[0].polygon)));
 for(let x=5;x<100;x+=10)for(let y=5;y<100;y+=10){
  const count=horizontal.project.parts.filter(p=>pointInPolygon([x,y],p.polygon)).length;
  assert.equal(count,Number(pointInPolygon([x,y],u.parts[0].polygon)),'The finite chord preserves every sampled region without bridging the gap.');
 }
 assert.throws(()=>splitPart(u,'sleeve',[-10,60],[110,60]),{code:'COMPLEX_CUT'},'The manual infinite-line split contract is unchanged.');
 // A valid diagonal can separate that limb without bridging across the gap.
 const diagonal=suggestJointAt(u,'sleeve',[15,60],{angleDegrees:45});
 assert.ok(diagonal.project.parts.every(p=>!selfIntersects(p.polygon)));assert.equal(validateStudio(diagonal.project).filter(x=>x.level==='error').length,0);
});

test('a finite limb chord reassigns only its own children and rods, preserving posed locked neighbors',()=>{
 let p=sheet([[0,0],[100,0],[100,100],[70,100],[70,30],[30,30],[30,100],[0,100]]);
 p.parts.unshift({...makePart('Support',rect(-20,-20,140,60),'art'),id:'support',x:35,y:-20,rotation:13});
 p.parts.push({...makePart('Left hand',rect(5,85,20,35),'art'),id:'left-hand'},{...makePart('Right hand',rect(75,85,20,35),'art'),id:'right-hand'});
 p=addConnection(p,{id:'incoming',parentId:'support',childId:'sleeve',parentAnchor:[50,15],childAnchor:[50,15],angle:23,min:-90,max:90,padRadius:8});
 p=addConnection(p,{id:'left-pin',parentId:'sleeve',childId:'left-hand',parentAnchor:[15,103],childAnchor:[15,103],angle:8,min:-90,max:90,padRadius:8});
 p=addConnection(p,{id:'right-pin',parentId:'sleeve',childId:'right-hand',parentAnchor:[85,103],childAnchor:[85,103],angle:-12,min:-90,max:90,padRadius:8});
 p.rods=[{id:'left-rod',partId:'sleeve',point:[15,90]},{id:'right-rod',partId:'sleeve',point:[85,90]}];
 p.parts.find(p=>p.id==='right-hand').locked=true;p.parts.find(p=>p.id==='support').locked=true;
 const original=structuredClone(p),before=partTransforms(p),scale=unitsPerMm(p),result=suggestJointAt(p,'sleeve',[15,60],{angleDegrees:0}),next=result.project,newId=result.partIds[1],after=partTransforms(next);
 assert.equal(next.joints.find(j=>j.id==='incoming').childId,'sleeve');
 assert.equal(next.joints.find(j=>j.id==='left-pin').parentId,newId,'An anchor just outside the contour stays with its reinforced limb.');
 assert.equal(next.joints.find(j=>j.id==='right-pin').parentId,'sleeve','A different limb below the infinite cut line is not reassigned.');
 assert.equal(next.rods.find(r=>r.id==='left-rod').partId,newId);assert.equal(next.rods.find(r=>r.id==='right-rod').partId,'sleeve');
 for(const id of ['support','sleeve','left-hand','right-hand'])sameMatrix(before[id],after[id]);sameMatrix(before.sleeve,after[newId]);
 assert.deepEqual(next.parts.find(p=>p.id==='right-hand'),original.parts.find(p=>p.id==='right-hand'));
 assert.deepEqual(next.parts.find(p=>p.id==='support'),original.parts.find(p=>p.id==='support'));
 assert.deepEqual(next.assets,p.assets);near(unitsPerMm(next),scale);assert.deepEqual(p,original);
 assert.equal(validateStudio(next).filter(x=>x.level==='error').length,0);
});

test('a finite chord keeps the original incoming anchor even when it is on the smaller arc',()=>{
 let p=sheet([[0,0],[100,0],[100,100],[70,100],[70,30],[30,30],[30,100],[0,100]]);p.heightMm=100;
 p.parts.unshift({...makePart('Holder',rect(0,75,30,30),'art'),id:'holder'});
 p=addConnection(p,{id:'incoming',parentId:'holder',childId:'sleeve',parentAnchor:[15,90],childAnchor:[15,90],angle:15,min:-90,max:90,padRadius:5});
 p.rods=[{id:'other-limb',partId:'sleeve',point:[85,90]}];
 const before=partTransforms(p),result=suggestJointAt(p,'sleeve',[15,60],{angleDegrees:0}),retained=result.project.parts.find(p=>p.id==='sleeve'),separated=result.project.parts.find(p=>p.id===result.partIds[1]);
 assert.ok(pointInPolygon([15,90],retained.polygon));assert.ok(!pointInPolygon([85,90],retained.polygon));assert.ok(pointInPolygon([85,90],separated.polygon));
 assert.ok(Math.abs(polygonArea(retained.polygon))<Math.abs(polygonArea(separated.polygon)));
 assert.equal(result.project.rods[0].partId,separated.id);sameMatrix(before.sleeve,partTransforms(result.project).sleeve);
 assert.equal(validateStudio(result.project).filter(x=>x.level==='error').length,0);
});
