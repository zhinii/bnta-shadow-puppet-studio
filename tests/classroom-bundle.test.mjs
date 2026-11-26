import test from 'node:test';
import assert from 'node:assert/strict';
import {packClassroomBundle,unpackClassroomBundle,classroomPackedBytes} from '../public/classroom-bundle.mjs';
const raster='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN8cAAAAASUVORK5CYII=';

test('portable bundles deduplicate artwork across current work, history and submission snapshots',()=>{
  const original={characters:[{project:{dataUrl:raster},history:[{project:{dataUrl:raster}},{project:{dataUrl:raster}}]}],submission:{snapshot:{dataUrl:raster}}};
  const packed=packClassroomBundle(original);assert.equal(packed.$classroomBundle,1);assert.deepEqual(Object.keys(packed.assets),['a0']);assert.equal(packed.document.characters[0].project.dataUrl.$classroomAsset,'a0');assert.deepEqual(unpackClassroomBundle(packed),original);
  assert.deepEqual(packClassroomBundle(packed),packed);assert.equal(classroomPackedBytes(original),new TextEncoder().encode(JSON.stringify(packed)).length);
});

test('thirty students with five image histories fit using unique artwork bytes',()=>{
  // Synthetic raster transport strings, not visual output or decoder fixtures.
  const suffixes='ABCDEFGHIJKLMNOPQRSTUVWXYZabcd';
  const students=Array.from({length:30},(_,i)=>{const image='data:image/png;base64,iVBORw0KGgo'+ 'A'.repeat(1024*1024)+suffixes[i];return {id:'student-'+i,current:image,history:[image,image,image,image,image],submission:{image}};});
  const packed=packClassroomBundle({students});assert.equal(Object.keys(packed.assets).length,30);
  const bytes=new TextEncoder().encode(JSON.stringify(packed)).length;assert.ok(bytes<32*1024*1024);assert.ok(30*7*1024*1024>200*1024*1024);
  const restored=unpackClassroomBundle(packed);assert.equal(restored.students.length,30);
  for(let i=0;i<30;i++){assert.equal(restored.students[i].current,students[i].current);assert.equal(restored.students[i].history[4],students[i].current);assert.equal(restored.students[i].submission.image,students[i].current);}
});

test('missing, malformed, unused and duplicate dictionary entries cannot be unpacked',()=>{
  for(const malformed of [
    {$classroomBundle:1,assets:{},document:{$classroomAsset:'a0'}},
    {$classroomBundle:1,assets:{a0:raster},document:{$classroomAsset:'a0',other:'smuggled'}},
    {$classroomBundle:1,assets:{a0:raster},document:{title:'Unused image'}},
    {$classroomBundle:1,assets:{a0:raster,a1:raster},document:[{$classroomAsset:'a0'},{$classroomAsset:'a1'}]},
    {$classroomBundle:1,assets:{a0:'https://private/image.png'},document:{$classroomAsset:'a0'}},
    {$classroomBundle:1,assets:{a0:'data:image/svg+xml;base64,AAAA'},document:{$classroomAsset:'a0'}},
    {$classroomBundle:2,assets:{},document:{}},
    {$classroomBundle:1,assets:{},document:{},extra:true},
  ])assert.throws(()=>unpackClassroomBundle(malformed),e=>e.code==='INVALID_CLASSROOM_BUNDLE');
});

test('bundles reject prototype injection, circular data, depth and node bombs',()=>{
  assert.throws(()=>packClassroomBundle(JSON.parse('{"__proto__":{"polluted":true}}')),/Unsupported/);
  assert.throws(()=>unpackClassroomBundle(JSON.parse('{"$classroomBundle":1,"assets":{},"document":{"constructor":{"prototype":{"polluted":true}}}}')),/Unsupported/);
  const circular={};circular.self=circular;assert.throws(()=>packClassroomBundle(circular),/circular/);
  let deep={};for(let i=0;i<60;i++)deep={child:deep};assert.throws(()=>packClassroomBundle(deep),/complex/);assert.throws(()=>unpackClassroomBundle({$classroomBundle:1,assets:{},document:deep}),/complex/);
  assert.throws(()=>packClassroomBundle(new Array(800001)),/complex/);assert.throws(()=>unpackClassroomBundle({$classroomBundle:1,assets:{},document:new Array(800001)}),/complex/);
  assert.equal({}.polluted,undefined);
});

test('asset and unique-byte limits apply before expansion without counting reused pixels repeatedly',()=>{
  assert.throws(()=>packClassroomBundle({image:'data:image/png;base64,'+'A'.repeat(12000001)}),/image is too large/);
  const assets={};const document=[];for(let i=0;i<513;i++){assets['a'+i]=raster;document.push({$classroomAsset:'a'+i});}assert.throws(()=>unpackClassroomBundle({$classroomBundle:1,assets,document}),/too many/);
  assert.throws(()=>packClassroomBundle({number:Infinity}),/finite/);assert.throws(()=>packClassroomBundle({call(){}}),/plain JSON/);
  assert.deepEqual(unpackClassroomBundle({title:'legacy unbundled file'}),{title:'legacy unbundled file'});
});
