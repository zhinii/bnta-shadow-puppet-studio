import test from 'node:test';
import assert from 'node:assert/strict';
import {removeConnectedBackground,selectImageRegion,extractImageSilhouette,decodeArtwork,assetFromImageData} from '../public/studio-image-tools.mjs';
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
