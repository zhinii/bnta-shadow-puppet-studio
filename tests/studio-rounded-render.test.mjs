import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,normalizeStudioProject,partTransforms,transformPoint,inverseMatrix,pointInPolygon,unitsPerMm} from '../public/studio-model.mjs';
import {splitPart} from '../public/studio-construction.mjs';
import {renderStudioSvg,exportSheetSvg,exportPrintHtml,getFabricationMetrics} from '../public/studio-render.mjs';

const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VZsAAAAASUVORK5CYII=';
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} must equal ${b}`);
const polygonPath=points=>'M'+points.map(p=>p.map(n=>String(Number(n.toPrecision(12)))).join(' ')).join('L')+'Z';
const contours=svg=>[...svg.matchAll(/<path d="([^"]+)"[^>]*data-cut="outline-and-holes"/g)].map(m=>{
 const outer=m[1].split('Z')[0];
 return {path:m[1],points:[...outer.matchAll(/[ML]([^ML]+)/g)].map(p=>p[1].trim().split(/\s+/).map(Number))};
});

function splitFixture(width,angle){
 const radians=angle*Math.PI/180,rotate=([x,y])=>[300+x*Math.cos(radians)-y*Math.sin(radians),300+x*Math.sin(radians)+y*Math.cos(radians)];
 const p=createStudioProject();p.heightMm=120;p.materialMm=.5;p.holeMm=3;
 p.assets=[{id:'art',name:'Source artwork',dataUrl:pixel,width:600,height:600}];p.conceptAssetId='art';
 p.parts=[{id:'limb',name:'Limb',polygon:[[-width/2,-150],[width/2,-150],[width/2,150],[-width/2,150]].map(rotate),assetId:'art',fill:'#bd6a43'}];
 const before=normalizeStudioProject(p),result=splitPart(before,'limb',rotate([-width,0]),rotate([width,0]));
 return {before,project:result.project,joint:result.project.joints.find(j=>j.id===result.jointId),width};
}

test('full-width rounded ends remain united material on both pieces throughout rotation, including oblique cuts',()=>{
 for(const [width,angle] of [[24,0],[80,17],[140,43]]){
  const {before,project:p,joint}=splitFixture(width,angle),scale=1/unitsPerMm(before),cut=exportSheetSvg(p,{cutOnly:true}),pieces=contours(cut);
  assert.equal(pieces.length,2);
  assert.ok(joint.padRadius>=width/2,'The material overlap spans the complete local cut width.');
  close(getFabricationMetrics(p).scaleMmPerUnit,scale);
  for(const piece of pieces){
   assert.equal((piece.path.match(/M/g)||[]).length,2,'One united outer cut and one pin hole per piece.');
   assert.equal((piece.path.match(/a/g)||[]).length,2,'The hole remains an exact circle.');
   const holeRadius=Number(piece.path.match(/a([\d.e+-]+) /)[1]);
   close(holeRadius*2*scale,3);
  }
  const localOutlines=new Map(p.parts.map((part,i)=>[part.id,pieces[i].points]));
  for(const angle of [-60,-30,0,30,60]){
   joint.angle=angle;
   const transforms=partTransforms(p),center=transformPoint(transforms[joint.parentId],joint.parentAnchor),childCenter=transformPoint(transforms[joint.childId],joint.childAnchor);
   close(center[0],childCenter[0]);close(center[1],childCenter[1]);
   // Sample a complete ring just within the inscribed 96-sided circle. It must
   // be actual material on BOTH pieces for every tested pose, not a UI guide.
   const radius=joint.padRadius*Math.cos(Math.PI/96)*.999;
   for(const id of [joint.parentId,joint.childId])for(let n=0;n<72;n++){
    const theta=n*Math.PI/36,world=[center[0]+radius*Math.cos(theta),center[1]+radius*Math.sin(theta)];
    const local=transformPoint(inverseMatrix(transforms[id]),world);
    assert.ok(pointInPolygon(local,localOutlines.get(id)),`Full overlap ring must remain inside ${id} at ${angle} degrees.`);
   }
   const posedCut=exportSheetSvg(p,{cutOnly:true});
   assert.equal(posedCut.replace(/sheet-\d+/g,'sheet'),cut.replace(/sheet-\d+/g,'sheet'),'Changing pose must not change scale or fabrication contours.');
  }
 }
});

test('large round ends use identical geometry for stage, artwork sheet and print, with bounds that include both caps',()=>{
 const {project:p,joint}=splitFixture(120,31),cut=exportSheetSvg(p,{cutOnly:true}),pieces=contours(cut),metrics=getFabricationMetrics(p);
 for(const part of p.parts){
  const anchor=part.id===joint.parentId?joint.parentAnchor:joint.childAnchor,b=metrics.parts.find(m=>m.id===part.id).bounds;
  assert.ok(b.minX<=anchor[0]-joint.padRadius+1e-8&&b.maxX>=anchor[0]+joint.padRadius-1e-8);
  assert.ok(b.minY<=anchor[1]-joint.padRadius+1e-8&&b.maxY>=anchor[1]+joint.padRadius-1e-8);
 }
 for(const markup of [renderStudioSvg(p,{showJoints:false}),exportSheetSvg(p),exportPrintHtml(p)]){
  for(const {path} of pieces)assert.ok(markup.includes(path),'One fabrication contour must serve every visible/exported output.');
 }
 assert.doesNotMatch(cut,/<circle|<image|data-overlap-/,'No decorative guide or separate disk becomes a cut.');
});

test('enlarged material pads do not copy raster pixels from outside either original piece polygon',()=>{
 const {project:p}=splitFixture(100,0);
 for(const markup of [renderStudioSvg(p,{showJoints:false}),exportSheetSvg(p),exportPrintHtml(p)]){
  for(const part of p.parts){
   const clip=[...markup.matchAll(/<clipPath id="([^"]+-artwork)"><path d="([^"]+)"[^>]*\/><\/clipPath>/g)].find(m=>m[2]===polygonPath(part.polygon));
   assert.ok(clip,'The source raster has a separate clip to this original piece polygon.');
   assert.ok(markup.includes(`clip-path="url(#${clip[1]})"`),'The source-only clip is applied to artwork.');
  }
  assert.match(markup,/<path d="[^"]+" fill="#bd6a43"[^>]*\/>/,'New material retains a deliberate solid part colour beneath the original image.');
 }
});
