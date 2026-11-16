import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject, makePart} from '../public/studio-model.mjs';
import {saveStudioProject, loadStudioProject, clearStudioProject, serializeStudioProject, parseStudioProject, validateArtworkBytes, artworkDimensions, readArtworkFile, MAX_PROJECT_BYTES} from '../public/studio-storage.mjs';

function fakeIndexedDB({abortWrites = false, blocked = false} = {}) {
  const records = new Map();
  const state = {closed: 0, committed: 0, requested: 0};
  const indexedDB = {open() {
    const request = {};
    queueMicrotask(() => {
      if (blocked) { request.onblocked?.(); return; }
      request.result = {objectStoreNames: {contains: () => true}, close() { state.closed++; }, transaction(_name, mode) {
        const tx = {objectStore() {return {put(value, key) {return run('put', key, structuredClone(value));}, get(key) {return run('get', key);}, delete(key) {return run('delete', key);}};}, abort() {queueMicrotask(() => tx.onabort?.());}};
        function run(action, key, value) {
          const operation = {};
          state.requested++;
          queueMicrotask(() => {
            operation.result = action === 'get' ? structuredClone(records.get(key)) : key;
            operation.onsuccess?.();
            queueMicrotask(() => {
              if (abortWrites && mode === 'readwrite') {
                tx.error = new DOMException('Full', 'QuotaExceededError');
                tx.onabort?.();
              } else {
                if (action === 'put') records.set(key, value);
                if (action === 'delete') records.delete(key);
                state.committed++;
                tx.oncomplete?.();
              }
            });
          });
          return operation;
        }
        return tx;
      }};
      request.onsuccess?.();
    });
    return request;
  }};
  return {indexedDB, state, records};
}

function imageProject() {
  const project = createStudioProject();
  project.title = 'My tentacled scholar / 书生';
  project.assets.push({id:'art-test',name:'My drawing',mime:'image/png',width:1,height:1,dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='});
  project.conceptAssetId = 'art-test';
  const part = makePart('Custom cloak', [[0,0],[100,0],[80,100],[20,100]], 'art-test');
  part.locked = true;
  project.parts.push(part);
  return project;
}

test('portable project roundtrip preserves artwork, custom geometry, and locks', () => {
  const original = imageProject();
  const reopened = parseStudioProject(serializeStudioProject(original));
  assert.equal(reopened.title, original.title);
  assert.equal(reopened.assets[0].dataUrl, original.assets[0].dataUrl);
  assert.deepEqual(reopened.parts[0].polygon, original.parts[0].polygon);
  assert.equal(reopened.parts[0].locked, true);
});

test('project import rejects malformed, oversized, and legacy files explicitly', () => {
  assert.throws(() => parseStudioProject('{broken'), {code:'INVALID_PROJECT'});
  assert.throws(() => parseStudioProject(' '.repeat(MAX_PROJECT_BYTES + 1)), {code:'PROJECT_TOO_LARGE'});
  assert.throws(() => parseStudioProject(JSON.stringify({schemaVersion:1,characters:[]})), {code:'LEGACY_PROJECT'});
});

test('IndexedDB saves an atomic snapshot and restores it independently of later mutations', async () => {
  const db = fakeIndexedDB();
  const project = imageProject();
  assert.equal(await loadStudioProject(db), null);
  await saveStudioProject(project, db);
  assert.equal(db.state.committed, 2, 'save only resolves after transaction completion');
  project.title = 'Changed after save';
  const restored = await loadStudioProject(db);
  assert.equal(restored.title, 'My tentacled scholar / 书生');
  assert.equal(restored.assets[0].dataUrl, project.assets[0].dataUrl);
  await clearStudioProject(db);
  assert.equal(await loadStudioProject(db), null);
  assert.equal(db.state.closed, 5, 'each connection is closed after its operation');
});

test('a successful put followed by an aborted transaction is never reported as saved', async () => {
  const db = fakeIndexedDB({abortWrites:true});
  await assert.rejects(saveStudioProject(createStudioProject(), db), {code:'STORAGE_FULL'});
  assert.equal(db.records.size, 0);
  assert.equal(db.state.closed, 1);
});

test('blocked or absent browser storage gives a useful download fallback', async () => {
  await assert.rejects(saveStudioProject(createStudioProject(), {indexedDB:null}), {code:'STORAGE_UNAVAILABLE'});
  await assert.rejects(loadStudioProject(fakeIndexedDB({blocked:true})), {code:'STORAGE_BLOCKED'});
});

test('artwork type is checked against bytes instead of trusting the extension', () => {
  const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
  const jpeg = Uint8Array.from([255,216,255,224]);
  const webp = Uint8Array.from([82,73,70,70,4,0,0,0,87,69,66,80,86,80,56,32]);
  assert.equal(validateArtworkBytes(png,'image/png'), 'image/png');
  assert.equal(validateArtworkBytes(jpeg,'image/jpeg'), 'image/jpeg');
  assert.equal(validateArtworkBytes(webp,'image/webp'), 'image/webp');
  assert.equal(validateArtworkBytes(png,''), 'image/png');
  assert.throws(() => validateArtworkBytes(png,'image/jpeg'), {code:'INVALID_ARTWORK'});
  assert.throws(() => validateArtworkBytes(new TextEncoder().encode('<svg onload="alert(1)"></svg>'),'image/png'), {code:'INVALID_ARTWORK'});
});

test('image dimensions preserve aspect ratio without upscaling and reject excessive decodes', () => {
  assert.deepEqual(artworkDimensions(4000,3000), {width:1600,height:1200});
  assert.deepEqual(artworkDimensions(600,800), {width:600,height:800});
  assert.throws(() => artworkDimensions(10000,10000), {code:'ARTWORK_DIMENSIONS'});
  assert.throws(() => artworkDimensions(0,3000), {code:'ARTWORK_DIMENSIONS'});
});

test('oversized and spoofed images are rejected before browser decoding', async () => {
  await assert.rejects(readArtworkFile({size:15_000_001,arrayBuffer(){throw Error('must not read');}}), {code:'ARTWORK_TOO_LARGE'});
  const bytes = new TextEncoder().encode('<svg></svg>');
  await assert.rejects(readArtworkFile({size:bytes.length,type:'image/png',arrayBuffer:async()=>bytes.buffer}), {code:'INVALID_ARTWORK'});
});

test('artwork import re-encodes a decoded image at bounded size and releases the bitmap', async () => {
  const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const calls = [];
  let closed = false;
  const bitmap = {width:3200,height:2400,close(){closed=true;}};
  const output = 'data:image/png;base64,aGVsbG8=';
  const canvas = {width:0,height:0,getContext(type){assert.equal(type,'2d');return {drawImage(...args){calls.push(args);}};},toDataURL(mime){assert.equal(mime,'image/png');return output;}};
  globalThis.createImageBitmap = async (_blob, options) => {assert.equal(options.imageOrientation,'from-image');return bitmap;};
  globalThis.document = {createElement(name){assert.equal(name,'canvas');return canvas;}};
  try {
    const asset = await readArtworkFile({size:png.length,type:'image/png',name:'My original.png',arrayBuffer:async()=>png.buffer});
    assert.equal(asset.name,'My original.png');
    assert.equal(asset.dataUrl,output);
    assert.equal(asset.mime,'image/png');
    assert.deepEqual([asset.width,asset.height],[1600,1200]);
    assert.deepEqual(calls[0],[bitmap,0,0,1600,1200]);
    assert.equal(closed,true);
  } finally {
    if (previousBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap=previousBitmap;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document=previousDocument;
  }
});
