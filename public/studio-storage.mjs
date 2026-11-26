import {normalizeStudioProject} from './studio-model.mjs?v=0.8.0';

const DATABASE = 'bnta-shadow-studio-v2';
const STORE = 'projects';
const CURRENT = 'current';
export const MAX_PROJECT_BYTES = 55_000_000;
export const MAX_ARTWORK_BYTES = 15_000_000;

function failure(code, message, cause) {
  const error = new Error(message, cause ? {cause} : undefined);
  error.code = code;
  return error;
}

function storageFailure(error) {
  if (typeof error?.code === 'string') return error;
  if (error?.name === 'QuotaExceededError') return failure('STORAGE_FULL', 'Browser storage is full. Download your project to keep this work.', error);
  return failure('STORAGE_FAILED', 'This browser could not save the project. Download your project to keep this work.', error);
}

function openDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB?.open) return Promise.reject(failure('STORAGE_UNAVAILABLE', 'Browser storage is unavailable. Download your project to keep this work.'));
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, failure('STORAGE_BLOCKED', 'Browser storage is blocked. Close other studio tabs, or download your project.')), 5000);
    try { request = indexedDB.open(DATABASE, 1); }
    catch (error) { finish(reject, storageFailure(error)); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onerror = () => finish(reject, storageFailure(request.error));
    request.onblocked = () => finish(reject, failure('STORAGE_BLOCKED', 'Browser storage is blocked by another studio tab. Close that tab, or download your project.'));
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      db.onversionchange = () => db.close();
      finish(resolve, db);
    };
  });
}

async function operation(mode, action, {indexedDB = globalThis.indexedDB} = {}) {
  const db = await openDatabase(indexedDB);
  try {
    return await new Promise((resolve, reject) => {
      let value;
      let transaction;
      try {
        transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        request.onsuccess = () => { value = request.result; };
        request.onerror = () => { /* Transaction error/abort is authoritative. */ };
        transaction.oncomplete = () => resolve(value);
        transaction.onabort = () => reject(storageFailure(transaction.error || request.error));
        transaction.onerror = () => reject(storageFailure(transaction.error || request.error));
      } catch (error) {
        try { transaction?.abort(); } catch { /* Already inactive. */ }
        reject(storageFailure(error));
      }
    });
  } finally { db.close(); }
}

// One IndexedDB record is written atomically. A successful individual put request
// does not mean saved until its surrounding transaction commits.
export async function saveStudioProject(project, options) {
  const snapshot = normalizeStudioProject(project);
  await operation('readwrite', store => store.put(snapshot, CURRENT), options);
  return snapshot;
}

export async function loadStudioProject(options) {
  const value = await operation('readonly', store => store.get(CURRENT), options);
  return value == null ? null : normalizeStudioProject(value);
}

export async function clearStudioProject(options) {
  await operation('readwrite', store => store.delete(CURRENT), options);
}

// The studio now keeps projects only in memory unless a file is downloaded.
// Remove the previous version's automatic session snapshot without opening or
// creating a database. Call this in the background; a blocked/disabled storage
// service must never delay a fresh project. A blocked deletion may still finish
// after an older tab closes its database connection.
export function clearStoredStudioSession({indexedDB, timeoutMs = 1000} = {}) {
  return new Promise(resolve => {
    let settled = false, timer;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    try {
      const storage = indexedDB === undefined ? globalThis.indexedDB : indexedDB;
      if (!storage?.deleteDatabase) { finish(false); return; }
      const request = storage.deleteDatabase(DATABASE);
      timer = setTimeout(() => finish(false), Number.isFinite(timeoutMs) ? Math.max(0, Math.min(timeoutMs, 5000)) : 1000);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
      request.onblocked = () => finish(false);
    } catch { finish(false); }
  });
}

export function serializeStudioProject(project) {
  const text = JSON.stringify(normalizeStudioProject(project), null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES) throw failure('PROJECT_TOO_LARGE', 'This project is too large to export. Reduce the number or resolution of its images.');
  return text;
}

export function parseStudioProject(text) {
  if (typeof text !== 'string') throw failure('INVALID_PROJECT', 'Choose a saved .puppet.json project.');
  if (text.length > MAX_PROJECT_BYTES || new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES) throw failure('PROJECT_TOO_LARGE', 'The project file exceeds the 55 MB import limit.');
  let value;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch (error) { throw failure('INVALID_PROJECT', 'The project file is not valid JSON.', error); }
  return normalizeStudioProject(value);
}

// File names and browser-provided MIME types are not sufficient to identify an
// image. Reject SVG and mismatched content before asking the image decoder.
export function validateArtworkBytes(bytes, declaredMime = '') {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  const matches = (offset, values) => values.every((value, i) => bytes[offset + i] === value);
  let mime = '';
  if (bytes.length >= 24 && matches(0, [137, 80, 78, 71, 13, 10, 26, 10]) && matches(12, [73, 72, 68, 82])) mime = 'image/png';
  else if (bytes.length >= 4 && matches(0, [255, 216, 255])) mime = 'image/jpeg';
  else if (bytes.length >= 16 && matches(0, [82, 73, 70, 70]) && matches(8, [87, 69, 66, 80])) mime = 'image/webp';
  const stated = String(declaredMime).toLowerCase().split(';')[0].trim();
  if (!mime || (stated && stated !== mime)) throw failure('INVALID_ARTWORK', 'Choose a PNG, JPEG, or WebP image whose contents match its file type. SVG files are not accepted as artwork.');
  return mime;
}

export function artworkDimensions(width, height, maxDimension = 1600) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 60_000_000) throw failure('ARTWORK_DIMENSIONS', 'Choose an image with valid dimensions and fewer than 60 million pixels.');
  if (!Number.isInteger(maxDimension) || maxDimension < 128 || maxDimension > 4096) throw failure('ARTWORK_DIMENSIONS', 'The maximum artwork dimension must be between 128 and 4096 pixels.');
  const ratio = Math.min(1, maxDimension / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio))};
}

async function decodeArtwork(blob) {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(blob, {imageOrientation: 'from-image'});
      return {source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close()};
    } catch { /* Some browsers decode WebP only through Image. */ }
  }
  if (typeof globalThis.Image !== 'function' || !globalThis.URL?.createObjectURL) throw failure('ARTWORK_UNAVAILABLE', 'Image import requires a browser with canvas support.');
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(failure('INVALID_ARTWORK', 'The image could not be decoded. Try exporting it as PNG or JPEG.'));
      image.src = url;
    });
    return {source: img, width: img.naturalWidth, height: img.naturalHeight, close() {}};
  } finally { URL.revokeObjectURL(url); }
}

export async function readArtworkFile(file, {maxDimension = 1600, maxBytes = MAX_ARTWORK_BYTES} = {}) {
  if (!file || typeof file.arrayBuffer !== 'function' || !Number.isFinite(file.size) || file.size <= 0) throw failure('INVALID_ARTWORK', 'Choose a PNG, JPEG, or WebP image.');
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || file.size > maxBytes) throw failure('ARTWORK_TOO_LARGE', 'Choose an image smaller than 15 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || bytes.byteLength > maxBytes) throw failure('ARTWORK_TOO_LARGE', 'The image is larger than the permitted import size.');
  const mime = validateArtworkBytes(bytes, file.type);
  const decoded = await decodeArtwork(new Blob([bytes], {type: mime}));
  try {
    const dimensions = artworkDimensions(decoded.width, decoded.height, maxDimension);
    if (!globalThis.document?.createElement) throw failure('ARTWORK_UNAVAILABLE', 'Image import requires a browser with canvas support.');
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) throw failure('ARTWORK_UNAVAILABLE', 'This browser could not open an image canvas.');
    context.drawImage(decoded.source, 0, 0, dimensions.width, dimensions.height);
    // Re-encoding removes embedded metadata and leaves alpha transparency intact.
    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 24_000_000) throw failure('ARTWORK_TOO_LARGE', 'The decoded image is too large. Reduce its dimensions and try again.');
    return {id: 'art-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)), name: String(file.name || 'Artwork').slice(0, 160), mime: 'image/png', dataUrl, ...dimensions};
  } finally { decoded.close(); }
}
