import test from 'node:test';
import assert from 'node:assert/strict';
import {removeConnectedBackground,selectImageRegion,extractImageSilhouette,enumerateImageComponents,isolateImageSubject,decodeArtwork,assetFromImageData} from '../public/studio-image-tools.mjs';
import {selfIntersects,polygonArea} from '../public/studio-model.mjs';

function image(width,height,color=[0,0,0,0]){const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set(color,i);return {width,height,data};}
function pixel(r,x,y,color){r.data.set(color,(y*r.width+x)*4);}
function rectangle(r,x,y,width,height,color){for(let yy=y;yy<y+height;yy++)for(let xx=x;xx<x+width;xx++)pixel(r,xx,yy,color);}
const at=(r,x,y)=>Array.from(r.data.slice((y*r.width+x)*4,(y*r.width+x)*4+4));

test('background removal only clears edge-connected color and preserves enclosed white clothing and original alpha',()=>{
 const source=image(16,14,[250,250,250,255]);rectangle(source,4,3,8,8,[15,20,25,255]);rectangle(source,5,4,6,6,[250,250,250,255]);pixel(source,4,3,[15,20,25,128]);const before=source.data.slice();
 const cleaned=removeConnectedBackground(source,{tolerance:12});
 assert.deepEqual(source.data,before,'source pixels are immutable');assert.deepEqual(at(cleaned,0,0),[250,250,250,0]);assert.deepEqual(at(cleaned,6,6),[250,250,250,255]);assert.deepEqual(at(cleaned,4,3),[15,20,25,128]);assert.equal(cleaned.removedPixels,16*14-64);assert.ok(cleaned.warnings.length);
 const outlines=extractImageSilhouette(cleaned);assert.equal(outlines.parts.length,1);assert.deepEqual(outlines.parts[0].bounds,{x:4,y:3,width:8,height:8,minX:4,minY:3,maxX:12,maxY:11});
});

test('transparent artwork is not whitened and background removal exposes its edge risk honestly',()=>{
 const source=image(12,12);rectangle(source,3,3,5,5,[255,255,255,255]);const cleaned=removeConnectedBackground(source);assert.equal(cleaned.removedPixels,0);assert.deepEqual(cleaned.data,source.data);assert.match(cleaned.warnings.join(' '),/already transparent/);
 const white=image(12,12,[255,255,255,255]);rectangle(white,4,4,3,3,[0,0,0,255]);const result=removeConnectedBackground(white);assert.equal(result.removedPixels,135);assert.match(result.warnings.join(' '),/image edge/);
});

test('magic wand selects connected seed colors, respects its box, and does not drift through a gradient',()=>{
 const source=image(30,15);rectangle(source,2,3,10,8,[160,25,20,255]);rectangle(source,18,3,8,8,[160,25,20,255]);
 const region=selectImageRegion(source,[5,5],{tolerance:0});assert.equal(region.pixelCount,80);assert.equal(region.mask[5*30+20],0);assert.equal(region.bounds.minX,2);assert.equal(region.bounds.maxX,12);assert.equal(polygonArea(region.polygon),80);assert.equal(selfIntersects(region.polygon),false);
 const boxed=selectImageRegion(source,[5,5],{tolerance:0,bounds:{x:4,y:4,width:4,height:4}});assert.equal(boxed.pixelCount,16);assert.equal(boxed.bounds.width,4);assert.equal(boxed.bounds.height,4);
 const gradient=image(20,4);for(let x=0;x<20;x++)for(let y=0;y<4;y++)pixel(gradient,x,y,[x*10,x*10,x*10,255]);const limited=selectImageRegion(gradient,[0,1],{tolerance:11});assert.equal(limited.pixelCount,8,'matching compares to seed color, never the previous neighbor');
});

test('a concave connected outline stays concave and holes are explicitly not promised as cutouts',()=>{
 const source=image(20,20);rectangle(source,2,2,5,14,[200,40,30,255]);rectangle(source,2,12,13,4,[200,40,30,255]);
 const region=selectImageRegion(source,[3,3],{tolerance:0});assert.ok(region.polygon.length>4);assert.equal(selfIntersects(region.polygon),false);assert.equal(polygonArea(region.polygon),region.pixelCount);
 const ring=image(20,20);rectangle(ring,3,3,12,12,[0,0,0,255]);rectangle(ring,6,6,6,6,[0,0,0,0]);const parts=extractImageSilhouette(ring);assert.equal(parts.parts.length,1);assert.equal(parts.parts[0].interiorLoops,1);assert.match(parts.warnings.join(' '),/only the outer cut boundary/);assert.equal(parts.parts[0].pixelCount,108);assert.equal(polygonArea(parts.parts[0].polygon),144);
});

test('separated part sheets keep distinct silhouettes including diagonal-only contacts, and select largest regions first',()=>{
 const source=image(35,24);rectangle(source,1,1,3,3,[20,20,20,255]);rectangle(source,4,4,4,4,[20,20,20,255]);rectangle(source,15,5,12,15,[30,40,50,255]);pixel(source,34,23,[255,0,0,255]);
 const all=extractImageSilhouette(source,{minArea:4});assert.equal(all.parts.length,3);assert.deepEqual(all.parts.map(p=>p.pixelCount),[180,16,9]);assert.match(all.warnings.join(' '),/tiny disconnected/);
 const largest=extractImageSilhouette(source,{minArea:4,maxParts:1});assert.equal(largest.parts.length,1);assert.equal(largest.parts[0].pixelCount,180);assert.match(largest.warnings.join(' '),/additional region/);assert.equal(largest.parts[0].bounds.minX,15);
});

test('opaque backgrounds and invalid selections fail explicitly instead of producing a claimed body part',()=>{
 assert.deepEqual(extractImageSilhouette(image(10,10,[255,255,255,255])).parts,[]);
 assert.match(extractImageSilhouette(image(10,10,[255,255,255,255])).warnings.join(' '),/opaque background/);
 assert.throws(()=>selectImageRegion(image(10,10),[4,4]),/transparent/);assert.throws(()=>selectImageRegion(image(10,10),[-1,4]),/inside/);assert.throws(()=>selectImageRegion(image(10,10),[4,4],{tolerance:NaN}),/settings/);assert.throws(()=>removeConnectedBackground({width:9000,height:1,data:new Uint8Array(36000)}),/4 megapixels/);assert.throws(()=>extractImageSilhouette(image(10,10),{maxParts:1.5}),/whole number/);
});

test('subject cleanup keeps a multicolor horse while removing more than forty stars, text marks and a disconnected border',()=>{
 const source=image(100,80,[250,250,250,255]);
 // A horse-like body, neck, head, legs and black mane form one alpha component.
 rectangle(source,27,32,35,20,[140,70,25,255]);rectangle(source,56,19,8,25,[190,100,40,255]);rectangle(source,58,17,15,9,[155,80,30,255]);rectangle(source,29,49,6,19,[90,40,20,255]);rectangle(source,53,49,6,19,[90,40,20,255]);rectangle(source,54,22,4,15,[5,8,12,255]);rectangle(source,37,36,9,9,[250,250,250,255]);pixel(source,27,32,[140,70,25,90]);
 for(let y=7;y<18;y+=3)for(let x=5;x<47;x+=3)pixel(source,x,y,[15,25,45,255]);
 // A frame gap leaves the white background connected to the image edge.
 rectangle(source,2,22,1,52,[10,10,10,255]);rectangle(source,2,73,94,1,[10,10,10,255]);rectangle(source,95,22,1,52,[10,10,10,255]);
 const original=source.data.slice(),result=isolateImageSubject(source);
 assert.deepEqual(source.data,original);assert.equal(result.width,100);assert.equal(result.height,80);assert.ok(result.components.length>40,'all decoration is available for review, not truncated to 40 parts');assert.equal(result.keptComponentCount,1);assert.equal(result.removedComponentCount,result.components.length-1);
 assert.deepEqual(result.subjectBounds,{x:27,y:17,width:46,height:51,minX:27,minY:17,maxX:73,maxY:68});
 for(const [x,y] of [[27,32],[54,25],[58,23],[40,40],[32,60]])assert.deepEqual(at(result,x,y),at(source,x,y),'selected colors and alpha survive exactly');
 for(const [x,y] of [[0,0],[5,7],[2,40],[95,40]])assert.equal(at(result,x,y)[3],0);
 assert.equal(result.removedPixels,source.width*source.height-result.keptPixels);assert.ok(result.backgroundRemovedPixels>0);assert.ok(result.removedComponentPixels>40);assert.match(result.warnings.join(' '),/draft, not a recognized character/);assert.match(result.warnings.join(' '),/touching the character remains attached/);
 const parts=extractImageSilhouette(result);assert.equal(parts.parts.length,1);
});

test('a clicked subject replaces the largest draft and extra seeds keep or remove separate props and limbs',()=>{
 const source=image(70,60);rectangle(source,0,0,70,1,[0,0,0,255]);rectangle(source,0,59,70,1,[0,0,0,255]);rectangle(source,0,0,1,60,[0,0,0,255]);rectangle(source,69,0,1,60,[0,0,0,255]);
 rectangle(source,25,20,15,10,[120,55,20,255]);rectangle(source,25,20,4,10,[0,0,0,255]);rectangle(source,48,35,7,7,[240,220,80,190]);rectangle(source,27,35,4,8,[60,30,10,255]);
 const draft=isolateImageSubject(source);assert.equal(draft.components[0].touchesEdge,true);assert.equal(draft.subjectBounds.width,70);
 const horse=isolateImageSubject(source,{seed:[30,25]});assert.equal(horse.keptPixels,150);assert.equal(at(horse,0,0)[3],0);assert.deepEqual(at(horse,26,25),[0,0,0,255],'black artwork is not erased because the decorative edge is black');
 const extras=isolateImageSubject(source,{seed:[30,25],keepSeeds:[[50,38],[28,37],[50,38]]});assert.equal(extras.keptComponentCount,3);assert.equal(extras.keptPixels,150+49+32);assert.deepEqual(at(extras,50,38),[240,220,80,190]);assert.equal(extras.subjectBounds.maxX,55);assert.equal(extras.subjectBounds.maxY,43);
 const removed=isolateImageSubject(source,{seed:[30,25],keepSeeds:[[50,38],[28,37]],excludeSeeds:[[28,37]]});assert.equal(removed.keptComponentCount,2);assert.equal(at(removed,28,37)[3],0);assert.equal(at(removed,50,38)[3],190);
 assert.deepEqual(horse.labels,extras.labels,'component IDs stay stable while the selection changes');assert.equal(extras.labels[38*70+50],extras.components.find(component=>component.pixelCount===49).id);
});

test('cleanup preserves internal transparent holes, enclosed white artwork and diagonal separation',()=>{
 const source=image(28,24);rectangle(source,6,5,12,12,[50,90,130,255]);rectangle(source,8,7,3,3,[255,255,255,255]);rectangle(source,13,11,3,3,[12,34,56,0]);pixel(source,18,17,[50,90,130,255]);
 const result=isolateImageSubject(source,{seed:[7,6]});assert.equal(result.keptPixels,135);assert.equal(result.components.length,2);assert.deepEqual(at(result,9,8),[255,255,255,255]);assert.deepEqual(at(result,14,12),[12,34,56,0]);assert.equal(at(result,18,17)[3],0);assert.equal(result.removedPixels,1);assert.equal(result.removedComponentPixels,1);
 const all=isolateImageSubject(source,{seed:[7,6],keepSeeds:[[18,17]]});assert.equal(all.keptComponentCount,2);assert.equal(all.keptPixels,136);assert.deepEqual(all.subjectBounds,{x:6,y:5,width:13,height:13,minX:6,minY:5,maxX:19,maxY:18});
});

test('cleanup rejects empty, unseparated and invalid selections without silently truncating components',()=>{
 assert.throws(()=>isolateImageSubject(image(20,20)),{code:'NO_SUBJECT'});assert.throws(()=>isolateImageSubject(image(20,20,[255,255,255,255])),{code:'NO_SUBJECT'});
 const enclosed=image(80,80,[250,250,250,255]);rectangle(enclosed,0,0,80,1,[0,0,0,255]);rectangle(enclosed,0,79,80,1,[0,0,0,255]);rectangle(enclosed,0,0,1,80,[0,0,0,255]);rectangle(enclosed,79,0,1,80,[0,0,0,255]);rectangle(enclosed,32,24,15,30,[130,60,20,255]);
 assert.throws(()=>isolateImageSubject(enclosed),{code:'SUBJECT_UNSEPARATED'});assert.throws(()=>isolateImageSubject(enclosed,{seed:[35,30]}),{code:'SUBJECT_UNSEPARATED'});
 pixel(enclosed,10,10,[250,250,250,0]);assert.throws(()=>isolateImageSubject(enclosed),{code:'SUBJECT_UNSEPARATED'},'one transparent pixel does not make an opaque background a valid cutout');
 const source=image(20,20);rectangle(source,5,5,5,5,[80,20,10,255]);
 assert.throws(()=>isolateImageSubject(source,{seed:[1,1]}),/background or transparent/);assert.throws(()=>isolateImageSubject(source,{seed:[20,10]}),/inside/);assert.throws(()=>isolateImageSubject(source,{keepSeeds:'ball'}),/lists/);assert.throws(()=>isolateImageSubject(source,{excludeSeeds:[[6,6]]}),{code:'NO_SUBJECT'});assert.throws(()=>isolateImageSubject(source,{backgroundTolerance:NaN}),/settings/);
 const noise=image(20,20);for(let y=0;y<20;y+=2)for(let x=0;x<20;x+=2)pixel(noise,x,y,[80,20,10,255]);
 assert.equal(enumerateImageComponents(noise).components.length,100);assert.throws(()=>enumerateImageComponents(noise,{maxComponents:40}),{code:'TOO_MANY_COMPONENTS'});assert.throws(()=>isolateImageSubject(noise,{maxComponents:40}),{code:'TOO_MANY_COMPONENTS'});
});

test('a valid clicked subject can exclude a larger opaque frame remnant elsewhere',()=>{
 const source=image(100,100,[250,250,250,255]);rectangle(source,2,2,88,1,[0,0,0,255]);rectangle(source,2,97,88,1,[0,0,0,255]);rectangle(source,2,2,1,96,[0,0,0,255]);rectangle(source,89,2,1,96,[0,0,0,255]);rectangle(source,93,30,4,18,[160,75,20,255]);
 assert.throws(()=>isolateImageSubject(source),{code:'SUBJECT_UNSEPARATED'});
 const result=isolateImageSubject(source,{seed:[94,35]});assert.equal(result.keptPixels,72);assert.equal(result.keptComponentCount,1);assert.equal(result.components.length,2);assert.equal(at(result,40,40)[3],0);assert.deepEqual(at(result,94,35),[160,75,20,255]);assert.deepEqual(result.subjectBounds,{x:93,y:30,width:4,height:18,minX:93,minY:30,maxX:97,maxY:48});
 assert.throws(()=>isolateImageSubject(source,{seed:[94,35],keepSeeds:[[40,40]]}),{code:'SUBJECT_UNSEPARATED'},'adding the opaque remnant back is still rejected');
});

test('an existing cutout with a thin transparent border remains selectable with a review warning',()=>{
 const source=image(100,100);rectangle(source,1,1,98,98,[120,35,25,255]);rectangle(source,20,20,40,40,[255,255,255,255]);
 const result=isolateImageSubject(source,{seed:[30,30]});assert.equal(result.keptPixels,98*98);assert.equal(result.backgroundRemovedPixels,0);assert.deepEqual(result.data,source.data);assert.equal(result.subjectBounds.minX,1);assert.match(result.warnings.join(' '),/nearly solid rectangle/);
});

test('complex jagged silhouettes simplify to a bounded non-crossing cut boundary',()=>{
 const source=image(420,420);for(let y=30;y<390;y++){const left=40+(y%2)*2,right=360-(y%3);for(let x=left;x<right;x++)pixel(source,x,y,[35,50,80,255]);}
 const result=extractImageSilhouette(source);assert.equal(result.parts.length,1);const outline=result.parts[0];assert.ok(outline.polygon.length<=512);assert.ok(outline.polygon.length>=4);assert.equal(selfIntersects(outline.polygon),false);assert.ok(polygonArea(outline.polygon)>100000);assert.match(result.warnings.join(' '),/simplified/);
});

test('local image helpers preserve original canvas dimensions and release the decoder',async()=>{
 const oldBitmap=globalThis.createImageBitmap,oldDocument=globalThis.document;let closed=false,put,drawn;
 const source=image(8,6,[120,40,20,128]),png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 globalThis.createImageBitmap=async()=>({width:8,height:6,close(){closed=true;}});
 globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext(){return {drawImage(bitmap){drawn=bitmap;},getImageData(){return source;},createImageData(w,h){return image(w,h);},putImageData(value){put=value;}};},toDataURL(){return png;}};}};
 try{const decoded=await decodeArtwork({dataUrl:png});assert.equal(decoded.width,8);assert.equal(decoded.height,6);assert.deepEqual(decoded.data,source.data);assert.ok(closed);assert.ok(drawn);const asset=assetFromImageData(decoded,{name:'Sleeve',id:'sleeve_art'});assert.equal(asset.id,'sleeve_art');assert.equal(asset.width,8);assert.equal(asset.height,6);assert.equal(asset.mime,'image/png');assert.deepEqual(put.data,source.data);await assert.rejects(()=>decodeArtwork({dataUrl:'https://foreign.example/image.png'}),/embedded/);}finally{if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
