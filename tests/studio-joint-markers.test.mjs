import test from 'node:test';
import assert from 'node:assert/strict';
import {detectJointMarkers} from '../public/studio-joint-markers.mjs';
const magenta=[255,0,255,255];
function image(width=240,height=240,color=[255,255,255,255]){const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set(color,i);return {width,height,data};}
function pixel(r,x,y,color){if(x>=0&&y>=0&&x<r.width&&y<r.height)r.data.set(color,(y*r.width+x)*4);}
function circle(r,cx,cy,radius,{color=magenta,inner=0,antialias=false}={}){for(let y=Math.floor(cy-radius-1);y<=Math.ceil(cy+radius+1);y++)for(let x=Math.floor(cx-radius-1);x<=Math.ceil(cx+radius+1);x++){const d=Math.hypot(x-cx,y-cy);if(d<=radius&&d>=inner)pixel(r,x,y,color);else if(antialias&&d<radius+1&&d>=inner)pixel(r,x,y,[255,170,255,180]);}}
function rect(r,x,y,w,h,color=magenta){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)pixel(r,xx,yy,color);}

test('round magenta dots and rings retain original image coordinates without changing pixels',()=>{
 const source=image();circle(source,40,50,6);circle(source,150,120,9,{inner:6});const before=source.data.slice(),result=detectJointMarkers(source);
 assert.equal(result.markers.length,2);assert.deepEqual(result.markers.map(m=>m.point),[[40.5,50.5],[150.5,120.5]]);assert.deepEqual(source.data,before);assert.ok(result.markers.every(m=>m.source==='image'&&m.radius>0));assert.match(result.warnings.join(' '),/not anatomical recognition/);assert.match(result.warnings.join(' '),/remain in the original artwork/);
 assert.deepEqual(detectJointMarkers(source),result,'IDs and scan order are deterministic');
});

test('antialiasing, saturated pink and transparent ring interiors remain detectable',()=>{
 const source=image(220,180,[0,0,0,0]);circle(source,40.5,40.5,6.5,{color:[235,45,215,220],antialias:true});circle(source,130,100,8,{inner:5.5,color:[200,30,190,180]});circle(source,180,140,7,{color:[255,0,255,50]});
 const result=detectJointMarkers(source);assert.equal(result.markers.length,2);assert.ok(Math.abs(result.markers[0].point[0]-41)<.6);assert.deepEqual(result.markers[1].point,[130.5,100.5]);
});

test('lines, speckles, large costume regions, squares and border marks are not treated as joints',()=>{
 const source=image(300,250);rect(source,20,20,80,3);rect(source,35,60,4,50);rect(source,100,50,14,14);circle(source,200,100,38);circle(source,0,160,8);rect(source,1,1,298,1);rect(source,1,248,298,1);rect(source,1,1,1,248);rect(source,298,1,1,248);for(let i=0;i<20;i++)pixel(source,70+i*5,200,magenta);
 assert.equal(detectJointMarkers(source).markers.length,0);
 // A valid mark remains detectable in the same noisy image.
 circle(source,50,150,6);assert.deepEqual(detectJointMarkers(source).markers.map(m=>m.point),[[50.5,150.5]]);
});

test('black dots are opt-in and explicitly identified as potentially decorative',()=>{
 const source=image();circle(source,55,55,6,{color:[15,15,15,255]});circle(source,150,150,7,{inner:4,color:[45,40,35,255]});
 assert.equal(detectJointMarkers(source).markers.length,0);const result=detectJointMarkers(source,{color:'black'});assert.equal(result.markers.length,2);assert.match(result.warnings[0],/eyes, buttons or decoration/);
});

test('marker limit reports omitted candidates instead of silently implying a complete plan',()=>{
 const source=image(360,240);for(let i=0;i<15;i++)circle(source,25+(i%5)*65,25+Math.floor(i/5)*70,6);
 const result=detectJointMarkers(source);assert.equal(result.markers.length,12);assert.match(result.warnings.join(' '),/Found 15 candidate marks; showing the first 12/);assert.match(result.warnings.join(' '),/remaining 3 were not included/);
 assert.equal(detectJointMarkers(source,{maxMarkers:3}).markers.length,3);
});

test('unsupported rasters and unbounded detector settings reject before allocation',()=>{
 assert.throws(()=>detectJointMarkers({width:4096,height:4096,data:new Uint8Array(0)}),/4 megapixels/);
 assert.throws(()=>detectJointMarkers({width:1.5,height:1,data:new Uint8Array(4)}),/4 megapixels/);
 assert.throws(()=>detectJointMarkers({width:2,height:2,data:new Float32Array(16)}),/4 megapixels/);
 for(const maxMarkers of [0,13,1.5,NaN])assert.throws(()=>detectJointMarkers(image(),{maxMarkers}),/1 and 12/);
 assert.throws(()=>detectJointMarkers(image(),{color:'blue'}),/magenta or black/);
});

test('small usable dots survive pixel-grid angular gaps while isolated speckles do not',()=>{
 for(const radius of [2,3,4]){const source=image();circle(source,60,70,radius);pixel(source,20,20,magenta);const result=detectJointMarkers(source);assert.equal(result.markers.length,1,`radius ${radius}`);assert.deepEqual(result.markers[0].point,[60.5,70.5]);}
});
