import test from 'node:test';
import assert from 'node:assert/strict';
import {isolateImageSubject,removeTappedBackground,extractImageSilhouette} from '../public/studio-image-tools.mjs';
import {createStudioProject,makePart,validateStudio,unitsPerMm,polygonArea,pointInPolygon} from '../public/studio-model.mjs';
import {suggestJointAt} from '../public/studio-construction.mjs';
import {exportSheetSvg,getFabricationMetrics} from '../public/studio-render.mjs';

test('removing a retained image background turns a rejected knee into a valid overlapping pin joint',()=>{
 const width=240,height=360,source={width,height,data:new Uint8ClampedArray(width*height*4)},white=[250,250,250,255],ink=[18,20,22,255];
 const paint=(x,y,w,h,color)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)source.data.set(color,(yy*width+xx)*4);};
 // A common failure: an opaque picture remains inside an already transparent
 // margin, so alpha alone cannot separate the character from its background.
 paint(10,10,220,340,white);
 paint(75,40,80,70,ink);paint(80,45,70,60,white); // outlined white face
 paint(100,110,30,15,ink);paint(65,120,70,110,ink);
 paint(70,130,60,80,white); // enclosed white clothing
 paint(40,130,25,25,ink);paint(135,130,45,25,ink);
 paint(65,230,25,80,ink);paint(110,230,20,80,ink);
 paint(60,300,30,20,ink);paint(110,300,35,20,ink);
 const original=source.data.slice(),knee=[120,270],projectFor=polygon=>{
  const p=createStudioProject();p.canvas={width,height};p.heightMm=280;p.parts=[{...makePart('Character',polygon),id:'character'}];return p;
 };

 const misleading=isolateImageSubject(source),rectangle=extractImageSilhouette(misleading).parts[0];
 assert.equal(misleading.backgroundNeedsReview,true);
 assert.equal(rectangle.polygon.length,4,'The old cut boundary is the image rectangle, not the leg.');
 assert.throws(()=>suggestJointAt(projectFor(rectangle.polygon),'character',knee),{code:'JOINT_SECTION_TOO_BROAD'});

 const removed=removeTappedBackground(source,{seed:[20,20]}),cleaned=isolateImageSubject(removed),outlines=extractImageSilhouette(cleaned);
 assert.equal(cleaned.backgroundNeedsReview,false);assert.equal(outlines.parts.length,1);assert.ok(outlines.parts[0].polygon.length>4);
 for(const [x,y] of [[100,70],[90,170]])assert.deepEqual(Array.from(cleaned.data.slice((y*width+x)*4,(y*width+x)*4+4)),white,'The white face and clothing remain intact.');
 assert.equal(cleaned.data[(20*width+20)*4+3],0);assert.deepEqual(source.data,original,'Background recovery leaves the original image unchanged.');
 const character=projectFor(outlines.parts[0].polygon),result=suggestJointAt(character,'character',knee),joint=result.project.joints.find(j=>j.id===result.jointId);
 assert.equal(result.project.parts.length,2);assert.equal(result.project.joints.length,1);assert.deepEqual(joint.parentAnchor,joint.childAnchor);assert.deepEqual(result.pivot,knee);
 assert.deepEqual(validateStudio(result.project).filter(issue=>issue.level==='error'),[]);
 assert.ok(joint.padRadius>result.project.holeMm*unitsPerMm(result.project)/2);
 const originalArea=Math.abs(polygonArea(character.parts[0].polygon));
 assert.ok(Math.abs(result.project.parts.reduce((sum,part)=>sum+Math.abs(polygonArea(part.polygon)),0)-originalArea)<1e-6,'Splitting preserves the entire character outline.');
 const lower=result.project.parts.find(part=>pointInPolygon([120,290],part.polygon)),lowerBounds=getFabricationMetrics(result.project).parts.find(part=>part.id===lower.id).bounds;
 assert.ok(lowerBounds.minY<knee[1],'The moving leg includes real overlap material above the knee cut.');
 const paths=[...exportSheetSvg(result.project,{cutOnly:true}).matchAll(/<path d="([^"]+)"[^>]*data-cut="outline-and-holes"/g)].map(match=>match[1]);
 assert.equal(paths.length,2);
 for(const path of paths){assert.equal((path.match(/M/g)||[]).length,2,'Each cut piece has one united perimeter and one matching pin hole.');assert.equal((path.match(/a/g)||[]).length,2);}
 assert.equal(paths[0].slice(paths[0].lastIndexOf('M')),paths[1].slice(paths[1].lastIndexOf('M')),'Both pieces export the same circular hole at the aligned pin position.');
});
