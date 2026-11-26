import test from 'node:test';
import assert from 'node:assert/strict';
import {reorderStageObjects, clampStageObjectPosition, nudgeStageObject} from '../public/classroom-stage-tools.mjs';

test('one Bring forward crosses the adjacent object even when layers have equal z values', () => {
  const source = [{id: 'rear', z: 0}, {id: 'middle', z: 1}, {id: 'front', z: 1}];
  const moved = reorderStageObjects(source, 'rear', 'forward');
  assert.deepEqual(moved.map(o => [o.id, o.z]), [['middle', 0], ['rear', 1], ['front', 2]]);
  assert.deepEqual(reorderStageObjects(moved, 'rear', 'backward').map(o => o.id), ['rear', 'middle', 'front']);
  assert.deepEqual(source.map(o => o.z), [0, 1, 1]);
});

test('layer changes follow visible order instead of source-array order or gaps between z values', () => {
  const source = [{id: 'front', z: 900, metadata: {name: 'Lamp'}}, {id: 'rear', z: -100}, {id: 'middle', z: 10}];
  const moved = reorderStageObjects(source, 'front', 'backward');
  assert.deepEqual(moved.map(o => [o.id, o.z]), [['rear', 0], ['front', 1], ['middle', 2]]);
  assert.deepEqual(moved[1].metadata, {name: 'Lamp'});
  moved[1].metadata.name = 'Changed';
  assert.equal(source[0].metadata.name, 'Lamp');
  assert.deepEqual(reorderStageObjects(source, 'front', 'forward').map(o => o.id), ['rear', 'middle', 'front']);
  assert.deepEqual(reorderStageObjects(source, 'missing', 'forward').map(o => o.id), ['rear', 'middle', 'front']);
});

test('keyboard moves only the selected object and Shift uses a ten-unit movement', () => {
  const stage = {width: 960, height: 540, backgroundColor: '#abcdef', objects: [
    {id: 'panda', x: 100, y: 120, width: 180, height: 320, rotation: 33, characterId: 'c1'},
    {id: 'tree', x: 700, y: 10, width: 150, height: 400}
  ]};
  const right = nudgeStageObject(stage, 'panda', 'ArrowRight');
  const down = nudgeStageObject(right, 'panda', 'ArrowDown', {shiftKey: true});
  assert.equal(down.objects[0].x, 101);
  assert.equal(down.objects[0].y, 130);
  assert.equal(down.objects[0].rotation, 33);
  assert.equal(down.objects[0].characterId, 'c1');
  assert.equal(down.backgroundColor, '#abcdef');
  assert.deepEqual(down.objects[1], stage.objects[1]);
  assert.equal(stage.objects[0].x, 100);
  assert.equal(stage.objects[0].y, 120);
  assert.deepEqual(nudgeStageObject(stage, 'panda', 'Enter'), stage);
  assert.deepEqual(nudgeStageObject(stage, 'missing', 'ArrowLeft'), stage);
});

test('repeated nudges cannot move an object wholly outside the visible stage', () => {
  const stage = {width: 960, height: 540, objects: [{id: 'panda', x: 0, y: 0, width: 180, height: 320}]};
  let moved = nudgeStageObject(stage, 'panda', 'ArrowLeft', {step: 5000});
  moved = nudgeStageObject(moved, 'panda', 'ArrowUp', {step: 5000});
  assert.deepEqual([moved.objects[0].x, moved.objects[0].y], [-156, -296]);
  moved = nudgeStageObject(moved, 'panda', 'ArrowRight', {step: 5000});
  moved = nudgeStageObject(moved, 'panda', 'ArrowDown', {step: 5000});
  assert.deepEqual([moved.objects[0].x, moved.objects[0].y], [936, 516]);
});

test('position bounds handle tiny objects, oversized scenery, and custom stage dimensions', () => {
  assert.deepEqual(clampStageObjectPosition({width: 200, height: 100}, {width: 5, height: 8}, -100, 500), {x: 0, y: 92});
  assert.deepEqual(clampStageObjectPosition({width: 200, height: 100}, {width: 400, height: 300}, -500, 500), {x: -376, y: 76});
  assert.deepEqual(clampStageObjectPosition({width: 12, height: 10}, {width: 5, height: 8}, 100, 100), {x: 7, y: 2});
  assert.deepEqual(clampStageObjectPosition({}, {x: 50, y: 60, width: 100, height: 100}, NaN, Infinity), {x: 50, y: 60});
});
