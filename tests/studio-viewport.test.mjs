import test from 'node:test';
import assert from 'node:assert/strict';
import {fitBox,normalizeCamera,zoomViewBox,panCamera,screenUnitScale} from '../public/studio-viewport.mjs';

test('fit and zoom preserve the artwork center without mutating geometry or camera', () => {
  const bounds=Object.freeze([-40,20,1200,800]);
  const camera=Object.freeze({zoom:3,x:0,y:0});
  assert.deepEqual(fitBox(bounds,20),[-60,0,1240,840]);
  const view=zoomViewBox(bounds,camera);
  assert.deepEqual(view,[360,20+(800-800/3)/2,400,800/3]);
  assert.equal(view[0]+view[2]/2,bounds[0]+bounds[2]/2);
  assert.equal(view[1]+view[3]/2,bounds[1]+bounds[3]/2);
  assert.deepEqual(bounds,[-40,20,1200,800]);
  assert.deepEqual(camera,{zoom:3,x:0,y:0});
  assert.deepEqual(zoomViewBox(bounds),bounds);
});

test('zoom bounds and malformed camera values remain finite', () => {
  assert.deepEqual(normalizeCamera({zoom:100,x:NaN,y:Infinity}),{zoom:6,x:0,y:0});
  assert.deepEqual(normalizeCamera({zoom:-10,x:-32,y:60}),{zoom:1,x:-32,y:60});
  assert.deepEqual(normalizeCamera(null),{zoom:1,x:0,y:0});
  assert.deepEqual(zoomViewBox([0,0,600,900],{zoom:99}),[250,375,100,150]);
  assert.throws(()=>fitBox([0,0,0,900]),/positive width/);
  assert.throws(()=>fitBox([0,Infinity,600,900]),/finite/);
});

test('panning changes only the view origin and fit resets offsets', () => {
  const original=Object.freeze({zoom:2,x:10,y:-20});
  const camera=panCamera(original,-60,35);
  assert.deepEqual(camera,{zoom:2,x:-50,y:15});
  const before=zoomViewBox([0,0,1000,600],original);
  const after=zoomViewBox([0,0,1000,600],camera);
  assert.deepEqual(after,[before[0]-60,before[1]+35,before[2],before[3]]);
  assert.deepEqual(zoomViewBox([0,0,1000,600],{zoom:1,x:0,y:0}),[0,0,1000,600]);
  assert.throws(()=>panCamera(camera,Infinity,0),/finite/);
});

test('screen-sized handles account for portrait and landscape letterboxing', () => {
  assert.equal(screenUnitScale([0,0,1000,500],500,500),2);
  assert.equal(screenUnitScale([0,0,500,1000],500,500),2);
  assert.equal(screenUnitScale([0,0,1000,500],1000,250),2);
  const base=[0,0,1000,500],zoomed=zoomViewBox(base,{zoom:2});
  assert.equal(screenUnitScale(zoomed,500,500),1);
  assert.equal(22*screenUnitScale(base,500,500),44);
  assert.equal(screenUnitScale(base,0,0),1);
});
