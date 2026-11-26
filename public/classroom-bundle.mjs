// Portable transport keeps each raster once even when versions/submissions reuse it.
// References are data-only dictionary entries, never URLs or executable objects.
export const CLASSROOM_BUNDLE_VERSION = 1;
const LIMIT_BYTES=100*1024*1024,MAX_NODES=800000,MAX_DEPTH=45,MAX_ASSETS=512,MAX_IMAGE=12_000_000;
const raster=/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const assetId=/^a(?:0|[1-9][0-9]{0,3})$/;
const own=(v,key)=>Object.prototype.hasOwnProperty.call(v,key);
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
function fail(message){const error=new Error(message);error.code='INVALID_CLASSROOM_BUNDLE';throw error;}
function keyAllowed(key){if(['__proto__','constructor','prototype','$classroomBundle','$classroomAsset'].includes(key))fail('Unsupported classroom bundle property.');}
function stringBytes(value){let bytes=0;for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c<128)bytes++;else if(c<2048)bytes+=2;else if(c>=0xD800&&c<=0xDBFF&&i+1<value.length&&value.charCodeAt(i+1)>=0xDC00&&value.charCodeAt(i+1)<=0xDFFF){bytes+=4;i++;}else bytes+=3;}return bytes;}
function budget(){let nodes=0,bytes=0;return {visit(depth){if(depth>MAX_DEPTH||++nodes>MAX_NODES)fail('This classroom data is too complex.');},add(n){bytes+=n;if(bytes>LIMIT_BYTES)fail('This classroom file is too large.');}};}

export function packClassroomBundle(input) {
  if(plain(input)&&own(input,'$classroomBundle'))input=unpackClassroomBundle(input);
  const assets={},lookup=new Map(),active=new WeakSet(),limits=budget();
  function walk(value,depth=0){
    limits.visit(depth);
    if(value===null){limits.add(4);return null;}
    if(typeof value==='string'){
      const existing=lookup.get(value);
      if(existing){limits.add(existing.length+24);return {$classroomAsset:existing};}
      if(value.length>LIMIT_BYTES)fail('This classroom file is too large.');
      if(value.startsWith('data:image/')&&value.length>MAX_IMAGE)fail('A classroom image is too large. Use an image under 8 MB.');
      if(value.startsWith('data:image/')&&raster.test(value)){
        if(value.length>MAX_IMAGE)fail('A classroom image is too large. Use an image under 8 MB.');
        let key=lookup.get(value);
        if(!key){if(lookup.size>=MAX_ASSETS)fail('This classroom contains too many different images.');key='a'+lookup.size;lookup.set(value,key);assets[key]=value;limits.add(value.length+key.length+5);}
        limits.add(key.length+24);return {$classroomAsset:key};
      }
      limits.add(stringBytes(value)+2);return value;
    }
    if(typeof value==='number'){if(!Number.isFinite(value))fail('Classroom numbers must be finite.');limits.add(24);return value;}
    if(typeof value==='boolean'){limits.add(5);return value;}
    if(!Array.isArray(value)&&!plain(value))fail('Classroom bundles contain only plain JSON data.');
    if(active.has(value))fail('A classroom bundle cannot contain circular references.');active.add(value);
    limits.add(2);let result;
    if(Array.isArray(value)){if(value.length>MAX_NODES)fail('This classroom data is too complex.');result=value.map(item=>walk(item,depth+1));limits.add(value.length);}
    else {result={};for(const key of Object.keys(value)){keyAllowed(key);limits.add(stringBytes(key)+4);result[key]=walk(value[key],depth+1);}}
    active.delete(value);return result;
  }
  const document=walk(input);
  return {$classroomBundle:CLASSROOM_BUNDLE_VERSION,document,assets};
}

export function unpackClassroomBundle(input) {
  if(!plain(input)||!own(input,'$classroomBundle'))return input;
  if(input.$classroomBundle!==CLASSROOM_BUNDLE_VERSION||Object.keys(input).sort().join(',')!=='$classroomBundle,assets,document'||!plain(input.assets))fail('This classroom bundle uses an unsupported format.');
  const limits=budget(),ids=Object.keys(input.assets),seenValues=new Set(),used=new Set(),active=new WeakSet();
  if(ids.length>MAX_ASSETS)fail('This classroom contains too many different images.');
  for(const key of ids){
    const value=input.assets[key];
    if(!assetId.test(key)||typeof value!=='string'||value.length>MAX_IMAGE||!raster.test(value))fail('Invalid classroom image dictionary.');
    if(seenValues.has(value))fail('The classroom image dictionary contains duplicate entries.');
    seenValues.add(value);limits.add(value.length+key.length+5);
  }
  function walk(value,depth=0){
    limits.visit(depth);
    if(value===null){limits.add(4);return null;}
    if(typeof value==='string'){if(value.length>LIMIT_BYTES)fail('This classroom file is too large.');limits.add(stringBytes(value)+2);return value;}
    if(typeof value==='number'){if(!Number.isFinite(value))fail('Classroom numbers must be finite.');limits.add(24);return value;}
    if(typeof value==='boolean'){limits.add(5);return value;}
    if(!Array.isArray(value)&&!plain(value))fail('Classroom bundles contain only plain JSON data.');
    if(plain(value)&&own(value,'$classroomAsset')){
      const key=value.$classroomAsset;
      if(Object.keys(value).length!==1||typeof key!=='string'||!assetId.test(key)||!own(input.assets,key))fail('A classroom image reference is missing or invalid.');
      used.add(key);limits.add(key.length+24);return input.assets[key];
    }
    if(active.has(value))fail('A classroom bundle cannot contain circular references.');active.add(value);limits.add(2);
    let result;
    if(Array.isArray(value)){if(value.length>MAX_NODES)fail('This classroom data is too complex.');result=value.map(item=>walk(item,depth+1));limits.add(value.length);}
    else {result={};for(const key of Object.keys(value)){keyAllowed(key);limits.add(stringBytes(key)+4);result[key]=walk(value[key],depth+1);}}
    active.delete(value);return result;
  }
  const document=walk(input.document);
  if(used.size!==ids.length)fail('The classroom bundle contains unused image entries.');
  return document;
}

export function classroomPackedBytes(value) {
  return stringBytes(JSON.stringify(packClassroomBundle(value)));
}
