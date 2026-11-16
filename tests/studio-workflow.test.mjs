import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject, makePart, partTransforms, transformPoint, unitsPerMm} from '../public/studio-model.mjs';
import {serializeStudioProject, parseStudioProject} from '../public/studio-storage.mjs';
import {deflateSync} from 'node:zlib';

function fixturePng(raster) {
  const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  const chunk=(name,data)=>{const kind=Buffer.from(name),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);kind.copy(result,4);data.copy(result,8);result.writeUInt32BE(crc(Buffer.concat([kind,data])),data.length+8);return result;};
  const header=Buffer.alloc(13);header.writeUInt32BE(raster.width);header.writeUInt32BE(raster.height,4);header[8]=8;header[9]=6;
  const raw=Buffer.alloc((raster.width*4+1)*raster.height);for(let y=0;y<raster.height;y++)Buffer.from(raster.data.buffer,raster.data.byteOffset+y*raster.width*4,raster.width*4).copy(raw,y*(raster.width*4+1)+1);
  return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
function rasterFixture({background=[255,255,255,0],rectangles=[]}={}) {
  const width=100,height=100,data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4)data.set(background,i);
  for(const {x,y,w,h,color}of rectangles)for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++)data.set(color,(py*width+px)*4);
  return {width,height,data};
}
function decoratedHorseFixture() {
  const brown=[145,75,35,255],ink=[35,25,20,255];
  const rectangles=[{x:30,y:35,w:40,h:25,color:brown},{x:60,y:20,w:10,h:25,color:brown},{x:64,y:14,w:18,h:10,color:brown},{x:33,y:60,w:6,h:20,color:brown},{x:58,y:60,w:6,h:20,color:brown},{x:60,y:24,w:3,h:16,color:ink},{x:40,y:40,w:15,h:12,color:[20,95,150,255]},{x:44,y:43,w:5,h:5,color:[255,255,255,255]},{x:83,y:75,w:9,h:9,color:[225,130,20,255]}];
  for(const r of [{x:1,y:1,w:98,h:1},{x:1,y:98,w:98,h:1},{x:1,y:1,w:1,h:98},{x:98,y:1,w:1,h:98}])rectangles.push({...r,color:ink});
  for(let row=0;row<12;row++)for(let col=0;col<4;col++)rectangles.push({x:5+col*6,y:5+row*6,w:4,h:4,color:ink});
  return rasterFixture({rectangles});
}
// Closed details and disabled fieldsets are excluded by native HTML semantics;
// CSS layout and actual browser visibility still require browser verification.
function primaryActions(markup) {
  const details=[],fieldsets=[],actions=[];
  for(const tag of markup.match(/<\/?[a-z][^>]*>/gi)||[]){
    if(/^<details\b/i.test(tag))details.push({open:/\sopen(?:\s|=|>)/.test(tag),summary:false});
    else if(/^<\/details/i.test(tag))details.pop();
    else if(/^<summary\b/i.test(tag)&&details.length)details.at(-1).summary=true;
    else if(/^<\/summary/i.test(tag)&&details.length)details.at(-1).summary=false;
    else if(/^<fieldset\b/i.test(tag))fieldsets.push(/\sdisabled(?:\s|=|>)/.test(tag));
    else if(/^<\/fieldset/i.test(tag))fieldsets.pop();
    else if(/^<button\b/i.test(tag)&&details.every(d=>d.open||d.summary)&&!fieldsets.some(Boolean)&&!/\sdisabled(?:\s|=|>)/.test(tag)&&/\bprimary\b/.test(tag.match(/class="([^"]*)"/)?.[1]||''))actions.push(tag.match(/data-action="([^"]+)"/)?.[1]||'submit');
  }
  return actions;
}

// This harness verifies event wiring and state persistence; it is not a browser
// rendering or physical-fabrication test.
function browserHarness() {
  const rootListeners = new Map(), documentListeners = new Map(), windowListeners=new Map(), files = new Map();
  const downloads = [], requests = [], records = new Map(), urls = new Map(), focusedSelectors=[];
  const storageOperations=[],preferences=new Map(),scrollRequests=[],captures=[],releases=[];let appModule=null,startCount=0;
  const rasters=new Map();let fixtureRaster=null;
  const previous = new Map(['document','window','localStorage','indexedDB','fetch','setTimeout','clearTimeout','createImageBitmap'].map(k=>[k,globalThis[k]]));
  const originalCreateURL = URL.createObjectURL, originalRevokeURL = URL.revokeObjectURL;
  const nativeTimeout = globalThis.setTimeout;
  const timers = new Set();
  const target = ({dataset={},canvas=false,partId=null,jointId=null,...rest}={}) => ({dataset,...rest,closest(selector) {
    if(selector==='#puppet-canvas')return canvas ? this : null;
    if(selector==='#canvas-wrap')return canvas ? canvasWrap : null;
    if(selector==='[data-action]')return dataset.action ? this : null;
    if(selector==='[data-part-id]')return partId ? {dataset:{partId}} : null;
    if(selector==='[data-joint-id]')return jointId ? {dataset:{jointId}} : null;
    if(selector==='[data-vertex-index]')return dataset.vertexIndex!==undefined ? this : null;
    return null;
  }});
  const root = {_html:'',get innerHTML(){return this._html;},set innerHTML(value){this._html=value;canvas.innerHTML=value.match(/<div id="puppet-canvas">([\s\S]*?)<\/div>/)?.[1]||'';},addEventListener:(type,fn)=>rootListeners.set(type,fn),querySelector:selector=>/^\[data-(?:(part|joint)-id|vertex-index)=/.test(selector)?{focus(){focusedSelectors.push(selector);}}:null};
  const status = {textContent:''}, canvas = {innerHTML:''}, angle = {textContent:''}, toast = {textContent:'',classList:{add(){},remove(){}}};
  const rect=()=>({left:0,top:0,width:800,height:600,right:800,bottom:600});
  const canvasWrap={getBoundingClientRect:rect,setPointerCapture(id){captures.push(id);},releasePointerCapture(id){releases.push(id);},focus(){focusedSelectors.push('#canvas-wrap');}};
  const svg = {getBoundingClientRect:rect,createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}};},getScreenCTM(){return {inverse(){return {};}};}};
  for(const name of ['project-file','artwork-file'])files.set(name,{value:'',files:[],listeners:new Map(),addEventListener(type,fn){this.listeners.set(type,fn);},click(){}});
  const printFrame={contentDocument:{images:[]},contentWindow:{focus(){},print(){}}};
  globalThis.document = {documentElement:{lang:'en'},addEventListener:(type,fn)=>documentListeners.set(type,fn),querySelector(selector) {
    if(['#puppet-canvas','#puppet-canvas svg','#canvas-wrap'].includes(selector)&&!root.innerHTML.includes('id="puppet-canvas"'))return null;
    if(selector==='#review-heading')return {focus(){focusedSelectors.push(selector);}};
    if(selector==='.canvas-panel')return {scrollIntoView(options){scrollRequests.push(options);}};
    if(/^\[data-vertex-index=/.test(selector))return {focus(){focusedSelectors.push(selector);},setAttribute(){},getBoundingClientRect:rect};
    return ({'#app':root,'#save-status':status,'#toast':toast,'#puppet-canvas':canvas,'#canvas-wrap':canvasWrap,'#puppet-canvas svg':svg,'#angle-output':angle,'#print-frame':printFrame})[selector] || files.get(selector.slice(1)) || null;
  },createElement(tag) {
    if(tag==='a')return {href:'',download:'',click(){downloads.push({name:this.download,blob:urls.get(this.href)});}};
    if(tag==='canvas'){let pixels=null;const canvas={width:0,height:0,getContext(){return {drawImage(decoded){pixels=structuredClone(decoded.raster||fixtureRaster);},getImageData(){return {data:new Uint8ClampedArray(pixels.data)};},createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};},putImageData(image){pixels={width:canvas.width,height:canvas.height,data:new Uint8ClampedArray(image.data)};}};},toDataURL(){if(!pixels)return PNG;const value=fixturePng(pixels);rasters.set(value,structuredClone(pixels));return value;}};return canvas;}
    throw Error('Unexpected DOM element: '+tag);
  }};
  globalThis.window={addEventListener:(type,fn)=>windowListeners.set(type,fn)};
  globalThis.localStorage={getItem(key){storageOperations.push({kind:'local-get',key});return preferences.get(key)||null;},setItem(key,value){storageOperations.push({kind:'local-set',key});preferences.set(key,value);},removeItem(key){storageOperations.push({kind:'local-remove',key});preferences.delete(key);}};
  globalThis.createImageBitmap=async blob=>{let raster=fixtureRaster;if(blob?.arrayBuffer){const key='data:image/png;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');raster=rasters.get(key)||raster;}return {width:raster?.width||100,height:raster?.height||100,raster:raster?structuredClone(raster):null,close(){}};};
  globalThis.setTimeout=(fn,ms,...args)=>{let id;id=nativeTimeout(()=>{timers.delete(id);fn(...args);},ms<10000?1:ms);timers.add(id);return id;};
  globalThis.clearTimeout=id=>{timers.delete(id);previous.get('clearTimeout')(id);};
  URL.createObjectURL=blob=>{const url='blob:test-'+urls.size;urls.set(url,blob);return url;};
  URL.revokeObjectURL=()=>{};
  globalThis.indexedDB={deleteDatabase(name){storageOperations.push({kind:'deleteDatabase',name});const request={};queueMicrotask(()=>{records.clear();request.onsuccess?.();});return request;},open(name){storageOperations.push({kind:'open',name});const request={};queueMicrotask(()=>{request.result={objectStoreNames:{contains:()=>true},close(){},transaction(){const transaction={objectStore(){return {get:key=>operation('get',key),put:(value,key)=>operation('put',key,value),delete:key=>operation('delete',key)};}};function operation(kind,key,value){storageOperations.push({kind,key});const op={};queueMicrotask(()=>{if(kind==='put')records.set(key,structuredClone(value));if(kind==='delete')records.delete(key);op.result=kind==='get'?structuredClone(records.get(key)):key;op.onsuccess?.();queueMicrotask(()=>transaction.oncomplete?.());});return op;}return transaction;}};request.onsuccess?.();});return request;}};
  let responseFactory=body=>({reply:'Compare the changed cut shape before accepting.',proposal:{parts:[{id:body.project.parts[0].id,fill:'#244466'}]}});
  let capabilities={version:2,text:true,vision:false,imageGeneration:false,status:'Drawing plans only; image services unavailable.'};
  let getResponseFactory=()=>({ok:true,status:200,json:async()=>capabilities});
  globalThis.fetch=async(url,options={})=>{
    if(options.method==='POST'){
      const body=JSON.parse(options.body);requests.push({url,body});
      return {ok:true,status:200,json:async()=>responseFactory(body)};
    }
    return getResponseFactory(url);
  };
  const settle=()=>new Promise(resolve=>nativeTimeout(resolve,25));
  return {root,status,requests,legacyRecords:records,storageOperations,preferences,downloads,files,settle,rasters,printFrame,focusedSelectors,scrollRequests,captures,releases,
    async start(name){appModule=await import(`../public/studio-app.mjs?${name}-${++startCount}`);},
    project:()=>appModule.getSessionSnapshot(),
    canvasMarkup:()=>canvas.innerHTML,
    viewBox:()=>canvas.innerHTML.match(/viewBox="([^"]+)"/)?.[1].split(' ').map(Number),
    pageShow:async persisted=>{windowListeners.get('pageshow')?.({persisted});await settle();},
    error:()=>root.innerHTML.match(/class="error-banner" role="alert">([^<]*)/)?.[1]||'',
    setRaster(value){fixtureRaster=structuredClone(value);const url=fixturePng(value);rasters.set(url,structuredClone(value));return url;},
    setResponse(fn){responseFactory=fn;},
    setGetResponse(fn){getResponseFactory=fn;},
    setCapabilities(value){capabilities={...capabilities,...value};},
    click:dataset=>rootListeners.get('click')({target:target({dataset})}),
    input:(id,value)=>rootListeners.get('input')({target:target({id,value,dataset:{}})}),
    parameterInput:(key,value)=>rootListeners.get('input')({target:target({dataset:{paramField:key},value})}),
    jointInput:(key,value)=>rootListeners.get('input')({target:target({dataset:{jointField:key},value})}),
    change:el=>rootListeners.get('change')({target:target(el)}),
    submit:id=>rootListeners.get('submit')({target:{id},preventDefault(){}}),
    point:(x,y,partId=null)=>rootListeners.get('click')({target:target({canvas:true,partId}),clientX:x,clientY:y}),
    jointPoint:(x,y,jointId)=>rootListeners.get('click')({target:target({canvas:true,jointId}),clientX:x,clientY:y}),
    key:(key,element={},modifiers={})=>{let prevented=false;documentListeners.get('keydown')({key,target:target({tagName:'g',...element}),...modifiers,preventDefault(){prevented=true;}});return prevented;},
    pointer:(type,x,y,{vertexIndex,pointerId=7,...options}={})=>{let prevented=false;const handler=(type==='pointerdown'?rootListeners:documentListeners).get(type);handler?.({type,target:target({canvas:true,dataset:vertexIndex===undefined?{}:{vertexIndex},...options}),clientX:x,clientY:y,pointerId,preventDefault(){prevented=true;}});return prevented;},
    async openProject(project){const input=files.get('project-file');const text=serializeStudioProject(project);input.files=[{size:new TextEncoder().encode(text).length,text:async()=>text}];await input.listeners.get('change')({target:input});await settle();},
    async importArtwork(){const input=files.get('artwork-file');const bytes=fixtureRaster?Uint8Array.from(Buffer.from(fixturePng(fixtureRaster).split(',')[1],'base64')):Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,100,0,0,0,100]);input.files=[{name:'Student artwork.png',type:'image/png',size:bytes.length,arrayBuffer:async()=>bytes.buffer}];await input.listeners.get('change')({target:input});await settle();},
    async close(){await settle();for(const timer of timers)previous.get('clearTimeout')(timer);URL.createObjectURL=originalCreateURL;URL.revokeObjectURL=originalRevokeURL;for(const [key,value]of previous){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
  };
}
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function legacyImageStatus(url){return String(url).endsWith('/api/status')?{ok:true,status:200,json:async()=>({service:'Shadow Puppet Studio',configured:true})}:{ok:false,status:404,json:async()=>({error:'not_found'})};}

test('three-stage student workflow keeps AI edits reviewable and undoable', async () => {
  const h=browserHarness();
  try {
    await h.start('workflow');
    await h.settle();
    assert.equal((h.root.innerHTML.match(/data-action="step"/g)||[]).length,3);
    assert.match(h.root.innerHTML,/Create a character/);
    assert.equal(h.project().parts.length,0);
    assert.doesNotMatch(h.root.innerHTML,/data-action="generate-image"/);
    await h.click({action:'settings'});
    assert.match(h.root.innerHTML,/Image analysis<\/span><strong>Not available/);
    assert.match(h.root.innerHTML,/Image generation<\/span><strong>Not available/);
    assert.match(h.root.innerHTML,/Image editing<\/span><strong>Not available/);
    await h.click({action:'settings'});

    await h.click({action:'starter',kind:'tentacles'});
    await h.settle();
    const before=structuredClone(h.project());
    assert.ok(before.parts.length>6,'starter supports many custom appendages');
    const first=before.parts[0];
    await h.click({action:'step',step:'refine'});
    const prompt='Make this specific piece deep blue. Keep all six tentacles, its white coat, and the current connections. 保留轮廓。';
    h.input('revision-prompt',prompt);
    h.submit('refine-form');
    await h.settle();
    assert.equal(h.requests.at(-1).body.prompt,prompt,'custom request reaches AI verbatim');
    assert.match(h.root.innerHTML,/id="review-heading"/);
    assert.equal(h.project().parts[0].fill,first.fill,'proposal is not committed as an accepted edit');
    await h.click({action:'accept'});
    await h.settle();
    assert.equal(h.project().parts[0].fill,'#244466');
    assert.equal(h.project().parts.length,before.parts.length);
    assert.deepEqual(h.project().joints,before.joints);
    await h.click({action:'undo'});
    await h.settle();
    assert.equal(h.project().parts[0].fill,first.fill);
    assert.deepEqual(h.project().parts,before.parts);
  } finally {await h.close();}
});

test('artwork, hand-drawn parts and connections survive portable project export', async () => {
  const h=browserHarness();
  try {
    await h.start('drawing');
    await h.settle();
    await h.click({action:'draw'});
    assert.match(h.root.innerHTML,/<p class="task-instruction"[^>]*>Tap around the outline/,'blank drawing explains the next action');
    assert.doesNotMatch(h.root.innerHTML,/class="empty-canvas"/,'the empty placeholder cannot cover drawing input');
    await h.click({action:'cancel-tool'});
    assert.deepEqual(primaryActions(h.root.innerHTML),['draw'],'cancelled blank drawing offers one enabled recovery action');
    assert.match(h.root.innerHTML,/data-action="draw"[^>]*>Draw a piece/);
    await h.importArtwork();
    await h.click({action:'draw'});
    assert.match(h.root.innerHTML,/Tap around the outline/);
    for(const point of [[10,10],[40,10],[40,90],[10,90]])await h.point(...point);
    await h.click({action:'finish-part'});
    await h.click({action:'draw'});
    for(const point of [[40,10],[70,10],[70,90],[40,90]])await h.point(...point);
    await h.click({action:'finish-part'});
    await h.settle();
    let project=h.project();
    const [parent,child]=project.parts;
    assert.equal(project.parts.length,2);
    assert.equal(parent.assetId,project.conceptAssetId);
    const drawingScale=unitsPerMm(project);
    await h.click({action:'joint'});
    await h.click({action:'select',id:parent.id});
    await h.point(30,40,parent.id);
    await h.click({action:'select',id:child.id});
    await h.point(50,40,child.id);
    await h.settle();
    project=h.project();
    assert.equal(project.joints.length,1);
    assert.deepEqual(project.joints[0].parentAnchor,[30,40]);
    assert.deepEqual(project.joints[0].childAnchor,[50,40]);
    assert.ok(Math.abs(unitsPerMm(project)-drawingScale)<1e-8);
    assert.ok(Math.abs(project.joints[0].padRadius/unitsPerMm(project)-3)<1e-8,'default 3 mm overlap radius stays physical even on a 100 px image');
    await h.change({dataset:{jointField:'padRadius'},type:'number',value:'4.2'});await h.settle();
    project=h.project();
    assert.ok(Math.abs(project.joints[0].padRadius-4.2*drawingScale)<1e-8,'inspector millimetres convert into the calibrated design coordinates');
    assert.match(h.root.innerHTML,/data-joint-field="padRadius"[^>]*value="4.2"/);
    await h.click({action:'rod'});
    await h.click({action:'select',id:parent.id});
    await h.point(30,70,parent.id);
    await h.settle();
    assert.equal(h.project().rods.length,1);
    assert.equal(h.project().rods[0].partId,parent.id,'part-list selection preserves the active rod tool and its target');
    await h.click({action:'save-project'});
    const saved=parseStudioProject(await h.downloads.at(-1).blob.text());
    assert.equal(saved.assets[0].dataUrl,PNG);
    assert.equal(saved.assets[0].name,'Student artwork.png');
    assert.equal(saved.parts.length,2);
    assert.equal(saved.joints.length,1);
    assert.ok(Math.abs(saved.joints[0].padRadius/unitsPerMm(saved)-4.2)<1e-8,'portable export retains the physical overlap radius');
    assert.equal(saved.rods.length,1);
    await h.openProject(saved);
    assert.equal(h.project().assets[0].dataUrl,PNG);
    assert.deepEqual(h.project().parts,saved.parts);

    // A text edit of traced geometry should not accidentally demand image vision.
    await h.click({action:'step',step:'refine'});
    h.input('revision-prompt','Change only the selected shape color to blue. Keep the imported artwork unchanged.');
    h.submit('refine-form');
    await h.settle();
    assert.equal(h.requests.length,1,'text refinement remains available with imported artwork');
    assert.equal(h.requests[0].body.imageDataUrl,undefined,'unneeded image bytes are not sent to a text-only connection');
    assert.match(h.root.innerHTML,/id="review-heading"/);
    await h.click({action:'reject'});
    assert.equal(h.project().assets[0].dataUrl,PNG);
  } finally {await h.close();}
});

test('opening a portable project preserves student artwork and custom shape identity', async () => {
  const h=browserHarness();
  try {
    await h.start('opening');
    await h.settle();
    const project=createStudioProject();
    project.title='My own character';
    project.assets=[{id:'art-custom',name:'Original',mime:'image/png',dataUrl:PNG,width:100,height:100}];
    project.conceptAssetId='art-custom';
    project.parts=[makePart('Unusual skirt',[[5,5],[50,10],[90,90],[10,90]],'art-custom')];
    project.parts[0].locked=true;
    await h.openProject(project);
    assert.match(h.root.innerHTML,/My own character/);
    assert.match(h.root.innerHTML,/Unusual skirt/);
    await h.click({action:'save-project'});
    const exported=parseStudioProject(await h.downloads.at(-1).blob.text());
    assert.equal(exported.assets[0].dataUrl,PNG);
    assert.equal(exported.parts[0].id,project.parts[0].id);
    assert.equal(exported.parts[0].locked,true);
    assert.deepEqual(exported.parts[0].polygon,project.parts[0].polygon);
  } finally {await h.close();}
});

test('an unsubmitted custom prompt stays in the session and a new Create proposal replaces parts only on acceptance', async () => {
  const h=browserHarness();
  try {
    await h.start('create-replacement');
    await h.settle();
    const prompt='A historical astronomer with a circular star chart and two movable wings. 保留星图。';
    h.input('create-prompt',prompt);
    await h.settle();
    assert.equal(h.project().brief.keywords,prompt);
    assert.equal(h.requests.length,0,'typing does not send a generation request');
    assert.doesNotMatch(h.status.textContent,/Saved on this device/);
    await h.click({action:'starter',kind:'figure'});
    await h.settle();
    const before=structuredClone(h.project());
    h.setResponse(()=>({reply:'Review this completely new draft before replacing the construction.',proposal:{parts:[{id:'new-star-chart',name:'Star chart',polygon:[[100,100],[200,100],[250,200],[200,300],[100,300],[50,200]],fill:'#244466'}],joints:[]}}));
    h.submit('create-form');
    await h.settle();
    assert.equal(h.requests[0].body.task,'create');
    assert.equal(h.requests[0].body.prompt,prompt);
    assert.deepEqual(h.requests[0].body.project.parts,[],'new creation starts from an empty geometry context');
    assert.deepEqual(h.project().parts,before.parts,'the current construction stays until acceptance');
    await h.click({action:'accept'});
    await h.settle();
    assert.deepEqual(h.project().parts.map(p=>p.id),['new-star-chart']);
    assert.equal(h.project().joints.length,0);
    assert.match(h.project().revisions.at(-1).createdAt,/^\d{4}-\d{2}-\d{2}T/);
    await h.click({action:'undo'});
    await h.settle();
    assert.deepEqual(h.project().parts,before.parts);
    assert.deepEqual(h.project().joints,before.joints);
    assert.equal(h.project().brief.keywords,prompt);
  } finally {await h.close();}
});

test('fixed connections can move again and AI receives the selected part without changing other pieces', async () => {
  const h=browserHarness();
  try {
    await h.start('connection-selection');
    await h.settle();
    await h.click({action:'starter',kind:'figure'});
    await h.settle();
    let project=h.project();
    const joint=project.joints.find(j=>j.type==='pivot')||project.joints[0];
    await h.click({action:'select',id:joint.childId});
    await h.change({dataset:{field:'connection.type'},value:'fixed'});
    await h.settle();
    assert.equal(h.project().joints.find(j=>j.id===joint.id).min,0);
    assert.equal(h.project().joints.find(j=>j.id===joint.id).max,0);
    await h.change({dataset:{field:'connection.type'},value:'pivot'});
    await h.settle();
    let changed=h.project().joints.find(j=>j.id===joint.id);
    assert.ok(changed.min<0&&changed.max>0,'a restored pivot gets a useful movement range');
    await h.change({dataset:{jointField:'angle'},value:'35'});
    await h.settle();
    changed=h.project().joints.find(j=>j.id===joint.id);
    assert.equal(changed.angle,35);
    const before=structuredClone(h.project());
    const other=before.parts.find(p=>p.id!==joint.childId);
    h.setResponse(()=>({reply:'A proposed edit for the selected part.',proposal:{parts:[{id:joint.childId,fill:'#244466'},{id:other.id,fill:'#ff0000'}]}}));
    await h.click({action:'step',step:'refine'});
    h.input('revision-prompt','Make this piece blue.');
    h.submit('refine-form');
    await h.settle();
    assert.equal(h.requests[0].body.selectedPartId,joint.childId);
    assert.equal(h.requests[0].body.prompt,'Make this piece blue.');
    await h.click({action:'accept'});
    await h.settle();
    project=h.project();
    assert.equal(project.parts.find(p=>p.id===joint.childId).fill,'#244466');
    assert.deepEqual(project.parts.find(p=>p.id===other.id),other,'out-of-scope AI edits are filtered out');
    assert.deepEqual(project.joints,before.joints);
  } finally {await h.close();}
});

test('shadow view hides the source image and accepted same-frame image edits preserve locked artwork', async () => {
  const h=browserHarness();
  h.setCapabilities({vision:true,imageGeneration:true,imageEditing:true,status:'Configured image connection.'});
  try {
    await h.start('image-adoption');
    await h.settle();
    const project=createStudioProject();
    project.canvas={width:100,height:100};
    project.assets=[{id:'source-image',name:'Original',mime:'image/png',dataUrl:PNG,width:100,height:100}];
    project.conceptAssetId='source-image';
    project.parts=[makePart('Locked face',[[5,5],[45,5],[45,40],[5,40]],'source-image'),makePart('Editable costume',[[10,45],[90,45],[90,95],[10,95]],'source-image')];
    project.parts[0].locked=true;
    await h.openProject(project);
    assert.match(h.root.innerHTML,/class="concept-reference"/);
    await h.click({action:'view-shadow'});
    assert.doesNotMatch(h.canvasMarkup(),/<image\b/,'shadow shows cut geometry without the full-color reference leaking behind it');
    await h.click({action:'view-art'});
    assert.match(h.root.innerHTML,/class="concept-reference"/);
    h.setResponse(()=>({reply:'Review the revised artwork before applying it.',asset:{id:'revised-image',name:'Edited artwork',mime:'image/png',dataUrl:PNG,width:100,height:100}}));
    await h.click({action:'step',step:'refine'});
    h.input('revision-prompt','Revise the costume colors while keeping the face.');
    await h.click({action:'edit-image'});
    await h.settle();
    assert.equal(h.requests[0].body.task,'edit-image');
    assert.equal(h.requests[0].body.imageDataUrl,PNG);
    assert.equal(h.project().conceptAssetId,'source-image','image proposal remains uncommitted before acceptance');
    await h.click({action:'accept'});
    await h.settle();
    const accepted=h.project();
    assert.equal(accepted.conceptAssetId,'revised-image');
    assert.equal(accepted.parts[0].assetId,'source-image','locked piece retains original artwork');
    assert.equal(accepted.parts[1].assetId,'revised-image','unlocked same-frame artwork adopts the new image');
    assert.equal(accepted.assets.length,2,'original is retained for locked pieces and undo');
    assert.deepEqual(accepted.parts.map(p=>p.polygon),project.parts.map(p=>p.polygon),'pixel revisions do not silently change cut contours');
    await h.click({action:'undo'});
    await h.settle();
    assert.equal(h.project().conceptAssetId,'source-image');
    assert.deepEqual(h.project().parts,project.parts);
  } finally {await h.close();}
});

test('local image extraction, hinged splitting and parametric artwork resizing round-trip without AI', async () => {
  const h=browserHarness();
  const original=h.setRaster(rasterFixture({rectangles:[{x:20,y:10,w:50,h:80,color:[170,45,25,255]},{x:35,y:25,w:20,h:10,color:[20,80,190,255]}]}));
  try {
    await h.start('local-image-pipeline');await h.settle();await h.importArtwork();
    assert.equal(h.project().assets[0].dataUrl,original);
    await h.click({action:'extract-silhouette'});await h.settle();
    assert.match(h.root.innerHTML,/Review the extracted cut boundaries/);
    assert.equal(h.project().parts.length,0,'extraction is reviewable, not applied immediately');
    await h.click({action:'accept'});await h.settle();
    let project=h.project();assert.equal(project.parts.length,1);
    assert.equal(project.parts[0].assetId,project.conceptAssetId);
    await h.click({action:'split-part'});await h.point(10,50);await h.point(80,50);await h.click({action:'preview-split'});await h.settle();
    assert.match(h.root.innerHTML,/Review the two pieces/);
    assert.equal(h.project().parts.length,1);
    await h.click({action:'accept'});await h.settle();
    const split=structuredClone(h.project());assert.equal(split.parts.length,2);assert.equal(split.joints.length,1);
    assert.equal(split.parts[0].assetId,split.parts[1].assetId);
    const joint=split.joints[0],scale=unitsPerMm(split),childBefore=split.parts.find(p=>p.id===joint.childId);
    await h.click({action:'select',id:joint.parentId});
    h.parameterInput('length','150');await h.settle();
    assert.deepEqual(h.project().parts,split.parts,'slider input previews without persisting');
    await h.change({dataset:{paramField:'length'},value:'150'});await h.settle();
    const resized=structuredClone(h.project()),parent=resized.parts.find(p=>p.id===joint.parentId),child=resized.parts.find(p=>p.id===joint.childId);
    assert.equal(parent.parameters.length,1.5);assert.notDeepEqual(parent.artworkMatrix,[1,0,0,1,0,0]);
    assert.deepEqual(child.polygon,childBefore.polygon,'attached child artwork is not stretched');assert.deepEqual(child.artworkMatrix,childBefore.artworkMatrix);
    assert.ok(Math.abs(unitsPerMm(resized)-scale)<1e-8,'resize preserves physical scale of other pieces');
    const transforms=partTransforms(resized),changedJoint=resized.joints[0];
    assert.deepEqual(transformPoint(transforms[joint.parentId],changedJoint.parentAnchor),transformPoint(transforms[joint.childId],changedJoint.childAnchor));
    assert.equal(resized.assets[0].dataUrl,original,'source image bytes remain intact');
    await h.click({action:'undo'});await h.settle();assert.deepEqual(h.project().parts,split.parts);
    await h.click({action:'redo'});await h.settle();assert.deepEqual(h.project().parts,resized.parts);
    await h.click({action:'export-art'});assert.equal(h.downloads.length,1,h.error());const svg=await h.downloads.at(-1).blob.text();assert.match(svg,/<image[^>]*transform="matrix\(/);assert.ok(svg.includes(original));
    await h.click({action:'save-project'});const portable=parseStudioProject(await h.downloads.at(-1).blob.text());await h.openProject(portable);
    project=h.project();assert.deepEqual(project.parts,resized.parts);assert.deepEqual(project.joints,resized.joints);assert.equal(project.assets[0].dataUrl,original);
    assert.equal(h.requests.length,0,'the complete local pipeline never sends an AI request');
  } finally {await h.close();}
});

test('background cleanup previews alpha changes and preserves the original until acceptance', async () => {
  const h=browserHarness();
  const input=rasterFixture({background:[255,255,255,255],rectangles:[{x:20,y:20,w:60,h:60,color:[150,30,20,255]},{x:40,y:40,w:20,h:20,color:[255,255,255,255]}]});
  const original=h.setRaster(input);
  try {
    await h.start('background-cleanup');await h.settle();await h.importArtwork();
    const artworkProject=structuredClone(h.project()),sourceId=artworkProject.conceptAssetId;
    artworkProject.parts=[makePart('Editable piece',[[20,20],[80,20],[80,40],[20,40]],sourceId),makePart('Protected piece',[[20,60],[80,60],[80,80],[20,80]],sourceId)];
    artworkProject.parts[1].locked=true;await h.openProject(artworkProject);
    const before=structuredClone(h.project());
    await h.click({action:'view-shadow'});await h.change({dataset:{view:'concept'},checked:false});
    await h.click({action:'remove-background'});await h.settle();
    assert.match(h.root.innerHTML,/Review the transparent areas/);assert.equal(h.project().assets.length,1);assert.equal(h.project().assets[0].dataUrl,original);
    assert.ok(h.root.innerHTML.includes(original));assert.ok(h.root.innerHTML.includes([...h.rasters.keys()].at(-1)),'image review shows both sources even when shadow/reference settings hide the main artwork');
    await h.click({action:'reject'});assert.deepEqual(h.project(),before);
    await h.click({action:'remove-background'});await h.click({action:'accept'});await h.settle();
    const accepted=h.project(),cleaned=accepted.assets.find(a=>a.id===accepted.conceptAssetId);
    assert.equal(accepted.assets.length,2);assert.equal(accepted.assets[0].dataUrl,original);assert.notEqual(cleaned.dataUrl,original);
    assert.equal(accepted.parts[0].assetId,cleaned.id);assert.equal(accepted.parts[1].assetId,sourceId,'locked artwork retains its original image');
    const pixels=h.rasters.get(cleaned.dataUrl);assert.equal(pixels.data[3],0,'edge-connected background is transparent');assert.equal(pixels.data[(50*100+50)*4+3],255,'enclosed white artwork survives');
    await h.click({action:'undo'});await h.settle();assert.deepEqual(h.project().assets,before.assets);assert.equal(h.project().conceptAssetId,before.conceptAssetId);
    assert.deepEqual(h.project().parts,before.parts);
    assert.equal(h.requests.length,0);
  } finally {await h.close();}
});

test('local resize protects locked descendants and New discards a pending image proposal', async () => {
  const h=browserHarness();
  h.setRaster(rasterFixture({rectangles:[{x:20,y:10,w:50,h:80,color:[170,45,25,255]}]}));
  try {
    await h.start('locked-parameter-and-stale');await h.settle();
    await h.click({action:'starter',kind:'figure'});await h.settle();
    const project=h.project(),joint=project.joints.find(j=>j.parentId===project.parts[0].id)||project.joints[0];
    await h.click({action:'select',id:joint.childId});await h.click({action:'lock'});await h.settle();
    const before=structuredClone(h.project());await h.click({action:'select',id:joint.parentId});
    await h.change({dataset:{paramField:'length'},value:'130'});await h.settle();
    assert.deepEqual(h.project().parts,before.parts);assert.deepEqual(h.project().joints,before.joints);assert.match(h.root.innerHTML,/locked/i);
    await h.click({action:'new-project'});await h.importArtwork();await h.click({action:'extract-silhouette'});await h.settle();
    assert.match(h.root.innerHTML,/id="review-heading"/);await h.click({action:'new-project'});const fresh=h.project();await h.click({action:'accept'});await h.settle();
    assert.deepEqual(h.project(),fresh);assert.equal(fresh.parts.length,0);assert.equal(fresh.assets.length,0);assert.equal(h.error(),'');assert.equal(h.requests.length,0);
  } finally {await h.close();}
});

test('color selection, reviewed connection suggestions and drawn parameter direction work locally', async () => {
  const h=browserHarness();
  h.setRaster(rasterFixture({rectangles:[{x:15,y:15,w:60,h:30,color:[180,40,20,255]},{x:25,y:45,w:40,h:40,color:[30,70,180,255]}]}));
  try {
    await h.start('region-connection-axis');await h.settle();await h.importArtwork();
    for(const point of [[35,30],[45,65]]){
      const count=h.project().parts.length;
      await h.click({action:'select-region'});await h.point(...point);await h.settle();
      assert.equal(h.error(),'');assert.equal(h.project().parts.length,count,'region remains a proposal until accepted');
      await h.click({action:'accept'});await h.settle();assert.equal(h.project().parts.length,count+1);
    }
    const before=structuredClone(h.project()),[parent,child]=before.parts;
    assert.ok(parent.polygon.every(p=>p[1]<=45));assert.ok(child.polygon.every(p=>p[1]>=45),'color clicks produce distinct cut regions');
    await h.change({dataset:{connectParent:''},value:parent.id});await h.click({action:'suggest-connection'});await h.settle();
    assert.equal(h.error(),'');assert.equal(h.project().joints.length,0);
    assert.match(h.root.innerHTML,/Review its position and movement/);
    await h.click({action:'accept'});await h.settle();
    const connected=structuredClone(h.project());assert.equal(connected.joints.length,1);assert.equal(connected.joints[0].parentId,parent.id);assert.equal(connected.joints[0].childId,child.id);
    await h.click({action:'parameter-axis'});await h.point(25,65);await h.point(65,65);await h.settle();
    const directed=h.project(),part=directed.parts.find(p=>p.id===child.id);
    assert.equal(part.parameters.axisAngle,-90);assert.deepEqual(part.polygon,child.polygon,'direction is a rebase, not a deformation');assert.deepEqual(part.artworkMatrix,child.artworkMatrix);
    await h.change({dataset:{paramField:'length'},value:'125'});await h.settle();
    const resized=h.project().parts.find(p=>p.id===child.id);
    assert.equal(resized.parameters.length,1.25);assert.ok(Math.abs(resized.artworkMatrix[0]-1.25)<1e-8);assert.ok(Math.abs(resized.artworkMatrix[3]-1)<1e-8,'horizontal direction stretches the horizontal image axis');
    assert.equal(h.requests.length,0);
  } finally {await h.close();}
});

test('changing selection or importing artwork clears unfinished cuts and restores an editable image view', async () => {
  const h=browserHarness();
  const original=h.setRaster(rasterFixture({rectangles:[{x:10,y:10,w:30,h:80,color:[180,40,20,255]},{x:50,y:10,w:40,h:80,color:[30,70,180,255]}]}));
  try {
    await h.start('cancel-stale-cut');await h.settle();await h.importArtwork();
    await h.click({action:'extract-silhouette'});await h.click({action:'accept'});await h.settle();
    const before=structuredClone(h.project()),[first,second]=before.parts;
    await h.click({action:'select',id:first.id});await h.click({action:'split-part'});await h.point(5,50);
    assert.match(h.root.innerHTML,/class="trace-overlay"/);
    await h.click({action:'select',id:second.id});
    assert.doesNotMatch(h.root.innerHTML,/class="trace-overlay"|Place two points across the selected piece/);
    await h.click({action:'split-part'});await h.point(95,50);await h.click({action:'preview-split'});
    assert.doesNotMatch(h.root.innerHTML,/Review the two pieces/,'the previous piece contributes no old split point');
    assert.deepEqual(h.project().parts,before.parts);
    await h.point(45,50);await h.click({action:'preview-split'});assert.match(h.root.innerHTML,/Review the two pieces/);await h.click({action:'reject'});
    await h.click({action:'split-part'});await h.point(45,50);await h.click({action:'view-shadow'});await h.change({dataset:{view:'concept'},checked:false});
    await h.importArtwork();
    assert.equal(h.error(),'');assert.doesNotMatch(h.root.innerHTML,/class="trace-overlay"|Place two points across the selected piece|data-action="finish-part"/);
    assert.match(h.root.innerHTML,/class="active" data-action="view-art"/);assert.ok(h.root.innerHTML.includes(original));
    await h.click({action:'preview-split'});assert.doesNotMatch(h.root.innerHTML,/Review the two pieces/);assert.deepEqual(h.project().parts,before.parts);
    assert.equal(h.requests.length,0);
  } finally {await h.close();}
});

test('generation-only relay accepts custom prompts and presets, reviews new pixels, and continues into local hinged parts', async () => {
  const h=browserHarness();h.setGetResponse(legacyImageStatus);
  const original=h.setRaster(rasterFixture({rectangles:[{x:5,y:10,w:8,h:80,color:[180,40,20,255]}]}));
  const generated=h.setRaster(rasterFixture({rectangles:[{x:20,y:10,w:50,h:80,color:[30,70,180,255]}]}));
  h.setResponse(()=>({dataUrl:generated,model:'configured-image-model',kind:'reference'}));
  try {
    await h.start('generation-only-relay');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:100};project.assets=[{id:'kept-original',name:'Original piece',mime:'image/png',dataUrl:original,width:100,height:100}];project.conceptAssetId='kept-original';
    project.parts=[makePart('Protected original piece',[[5,10],[13,10],[13,90],[5,90]],'kept-original')];project.parts[0].locked=true;
    await h.openProject(project);await h.click({action:'step',step:'create'});
    assert.deepEqual(primaryActions(h.root.innerHTML),['next-stage'],'an existing character has one primary continuation while Change my idea stays collapsed');assert.match(h.root.innerHTML,/<details class="create-again"/);assert.match(h.root.innerHTML,/data-action="generate-image"/);assert.match(h.root.innerHTML,/data-action="create-plan"/);
    await h.change({dataset:{field:'brief.kind'},value:'human'});await h.change({dataset:{field:'brief.era'},value:'modern'});await h.change({dataset:{field:'brief.style'},value:'paper-cut'});
    const prompt='A doctor 医生 with a long white coat, two arms and a blue book; keep every finger inside the frame.';h.input('create-prompt',prompt);await h.settle();
    const before=structuredClone(h.project());
    await h.click({action:'view-shadow'});await h.change({dataset:{view:'concept'},checked:false});
    await h.click({action:'generate-image'});await h.settle();
    assert.equal(h.error(),'');assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'https://6ilmssim2bz2s.kimi.site/api/puppet/image');
    assert.deepEqual(Object.keys(h.requests[0].body).sort(),['application','kind','prompt'],'generation sends the composition prompt without source pixels or editor state');
    assert.equal(h.requests[0].body.application,'shadow-puppet-studio');assert.equal(h.requests[0].body.kind,'reference');
    assert.ok(h.requests[0].body.prompt.endsWith(`Selected design settings:\nCharacter type: human\nWorld / era: modern\nVisual style: paper-cut\n\nStudent prompt (verbatim):\n${prompt}`),'custom prompt and preset context remain intact after the composition guidance');
    assert.match(h.requests[0].body.prompt,/Explicit student requests take precedence/);assert.match(h.requests[0].body.prompt,/Do not add text/);
    assert.ok(h.root.innerHTML.includes(generated),'generated pixels remain visible during review even in Shadow mode');assert.ok(h.root.innerHTML.includes(original),'review keeps the original visible for comparison');
    assert.equal(h.canvasMarkup(),'','review takes the main canvas position');assert.equal(h.focusedSelectors.at(-1),'#review-heading');assert.ok(h.scrollRequests.length,'new proposals request scrolling into view');
    for(const view of ['before','both','after']){await h.click({action:'review-view',view});assert.ok(h.root.innerHTML.includes(`data-review-view="${view}"`));assert.deepEqual(h.project(),before,'comparison controls do not apply the proposal');}
    assert.match(h.root.innerHTML,/has not been visually verified/);assert.deepEqual(h.project(),before,'generation does not commit until acceptance');
    await h.click({action:'reject'});assert.deepEqual(h.project(),before);
    h.submit('create-form');await h.settle();assert.equal(h.requests.length,2,'the primary form generates artwork on this relay');
    await h.click({action:'draw'});await h.point(1,1);
    await h.click({action:'accept'});await h.settle();
    const accepted=structuredClone(h.project()),generatedId=accepted.conceptAssetId;
    assert.notEqual(generatedId,'kept-original');assert.equal(accepted.assets.find(a=>a.id===generatedId).dataUrl,generated);assert.equal(accepted.assets.length,2);
    assert.deepEqual(accepted.parts,before.parts,'new generation never rebinds or replaces existing cut pieces');assert.match(h.root.innerHTML,/class="active" data-action="view-art"/);assert.match(h.root.innerHTML,/data-step="refine" aria-current="step"/);assert.doesNotMatch(h.root.innerHTML,/class="trace-overlay"|data-action="finish-part"/);
    await h.click({action:'step',step:'refine'});assert.doesNotMatch(h.root.innerHTML,/data-action="edit-image"/);assert.doesNotMatch(h.root.innerHTML,/data-action="analyze"/,'unavailable image services do not add dead-end controls');
    h.input('revision-prompt','Make the costume green.');await h.click({action:'edit-image'});assert.match(h.error(),/Image editing is not connected/);assert.equal(h.requests.length,2,'unsupported pixel edits never make a request');
    await h.click({action:'dismiss-error'});await h.click({action:'undo'});await h.settle();assert.deepEqual(h.project().assets,before.assets);assert.deepEqual(h.project().parts,before.parts);
    await h.click({action:'redo'});await h.settle();await h.click({action:'step',step:'refine'});assert.match(h.root.innerHTML,/data-action="extract-silhouette"/,'advanced extraction remains available for an image beside protected existing pieces');
    await h.click({action:'extract-silhouette'});await h.click({action:'accept'});await h.settle();assert.equal(h.project().parts.length,2);
    assert.match(h.root.innerHTML,/data-action="rod"/);
    await h.click({action:'split-part'});await h.point(10,50);await h.point(80,50);await h.click({action:'preview-split'});await h.click({action:'accept'});await h.settle();
    let built=structuredClone(h.project());assert.equal(built.parts.length,3);assert.equal(built.joints.length,1);assert.deepEqual(built.parts[0],before.parts[0]);assert.ok(built.parts.slice(1).every(p=>p.assetId===generatedId));
    const movingId=built.joints[0].childId;
    await h.click({action:'rod'});await h.click({action:'select',id:movingId});await h.point(45,30,movingId);await h.settle();
    assert.equal(h.project().rods[0].partId,movingId);
    await h.click({action:'select',id:movingId});await h.change({dataset:{paramField:'width'},value:'125'});await h.settle();
    const beforeRevision=structuredClone(h.project());assert.equal(beforeRevision.parts.find(p=>p.id===movingId).parameters.width,1.25);
    h.setResponse(()=>({reply:'Review a 20% length increase for the selected piece. Other parts and source artwork are preserved.',proposal:{parts:[{id:movingId,parameters:{length:1.2}}]}}));
    await h.click({action:'step',step:'refine'});const revision='Make only the selected piece 20% longer. Keep the original artwork, other parts and hinge.';h.input('revision-prompt',revision);h.submit('refine-form');await h.settle();
    assert.equal(h.error(),'');assert.equal(h.requests.length,3);assert.equal(h.requests[2].url,'https://6ilmssim2bz2s.kimi.site/api/puppet');
    const textRequest=JSON.parse(h.requests[2].body.messages.at(-1).content);assert.equal(textRequest.scene.studentRequest,revision);assert.equal(textRequest.scene.selectedPart,movingId);assert.ok(!JSON.stringify(h.requests[2].body).includes('data:image'),'text revision sends numeric geometry without image bytes');
    assert.deepEqual(h.project().parts,beforeRevision.parts,'natural-language resizing still waits for review');
    await h.click({action:'accept'});await h.settle();
    const revised=structuredClone(h.project()),moving=revised.parts.find(p=>p.id===movingId);
    assert.equal(moving.parameters.length,1.2);assert.equal(moving.parameters.width,1.25);assert.notDeepEqual(moving.artworkMatrix,beforeRevision.parts.find(p=>p.id===movingId).artworkMatrix);assert.deepEqual(revised.parts.filter(p=>p.id!==movingId),beforeRevision.parts.filter(p=>p.id!==movingId));assert.deepEqual(revised.assets,beforeRevision.assets);
    await h.click({action:'undo'});await h.settle();assert.deepEqual(h.project().parts,beforeRevision.parts);assert.deepEqual(h.project().rods,beforeRevision.rods);
    await h.click({action:'redo'});await h.settle();await h.click({action:'refine-stage',stage:'test'});await h.change({dataset:{jointField:'angle'},value:'30'});await h.settle();
    built=structuredClone(h.project());assert.equal(built.joints[0].angle,30);assert.equal(built.rods.length,1);
    await h.click({action:'next-stage'});assert.match(h.root.innerHTML,/data-step="make" aria-current="step"/);
    await h.click({action:'view-shadow'});assert.doesNotMatch(h.canvasMarkup(),/<image\b/);await h.click({action:'view-art'});
    await h.click({action:'export-art'});assert.equal(h.error(),'');assert.match(h.downloads.at(-1).name,/-artwork\.svg$/);const art=await h.downloads.at(-1).blob.text();assert.ok(art.includes(generated));assert.match(art,/<image[^>]*transform="matrix\(/);
    await h.click({action:'export-cut'});assert.match(h.downloads.at(-1).name,/-cut\.svg$/);assert.doesNotMatch(await h.downloads.at(-1).blob.text(),/<image\b/);
    await h.click({action:'print'});assert.equal(h.error(),'');assert.ok(h.printFrame.srcdoc.includes(generated));assert.match(h.printFrame.srcdoc,/50 mm/,'print preparation includes a physical calibration mark');
    await h.click({action:'save-project'});const saved=parseStudioProject(await h.downloads.at(-1).blob.text());await h.openProject(saved);
    assert.deepEqual(h.project().parts,built.parts);assert.deepEqual(h.project().joints,built.joints);assert.deepEqual(h.project().rods,built.rods);assert.deepEqual(h.project().assets,built.assets);assert.equal(h.requests.length,3,'only two explicit generations and one text revision use AI');
  } finally {await h.close();}
});

test('the simple image route reviews one character instead of decoration fragments, then splits, poses and prints it', async () => {
  const h=browserHarness(),raster=decoratedHorseFixture(),original=h.setRaster(raster);
  const pixel=(image,x,y)=>Array.from(image.data.slice((y*image.width+x)*4,(y*image.width+x)*4+4));
  try {
    await h.start('simple-subject-cleanup');await h.settle();
    assert.equal(primaryActions(h.root.innerHTML).length,1,'Create presents one enabled primary action');
    await h.importArtwork();
    const imported=structuredClone(h.project());
    assert.equal(imported.parts.length,0,'import does not automatically turn every disconnected mark into a part');
    assert.doesNotMatch(h.root.innerHTML,/class="refine-stages"|data-action="refine-stage" data-stage="clean"/,'the four internal tool stages are not a visible navigation rail');
    assert.match(h.root.innerHTML,/<details class="view-tools"[^>]*>/,'view controls are in a disclosure');
    assert.doesNotMatch(h.root.innerHTML,/<details class="view-tools"[^>]*\sopen(?:\s|=|>)/,'view controls are folded away by default');
    assert.match(h.root.innerHTML,/More editing tools/);
    assert.deepEqual(primaryActions(h.root.innerHTML),['remove-extras']);
    await h.click({action:'remove-extras'});await h.settle();
    assert.equal(h.error(),'');assert.match(h.root.innerHTML,/id="review-heading"/);
    assert.deepEqual(primaryActions(h.root.innerHTML),['accept'],'cleanup has one primary review decision');
    assert.deepEqual(h.project(),imported,'pixel cleanup and construction wait for the student to accept');
    await h.click({action:'reject'});assert.deepEqual(h.project(),imported);
    await h.click({action:'remove-extras'});await h.click({action:'accept'});await h.settle();
    const cleaned=structuredClone(h.project()),source=cleaned.assets.find(a=>a.id===cleaned.conceptAssetId),pixels=h.rasters.get(source.dataUrl);
    assert.equal(cleaned.parts.length,1,'48 text marks, the border and the ball are not automatically puppet parts');
    assert.equal(cleaned.joints.length,0);assert.equal(cleaned.parts[0].assetId,source.id);
    assert.equal(cleaned.assets.find(a=>a.id===imported.conceptAssetId).dataUrl,original,'original pixels remain available');
    assert.deepEqual(h.rasters.get(original),raster,'cleanup does not modify its input raster');
    for(const [x,y] of [[35,45],[41,41],[46,45],[61,28]])assert.deepEqual(pixel(pixels,x,y),pixel(raster,x,y),'connected costume colors and enclosed white details are retained');
    for(const [x,y] of [[1,50],[6,6],[87,79]])assert.equal(pixel(pixels,x,y)[3],0,'detached border, marks and unconfirmed prop are transparent');
    assert.deepEqual(primaryActions(h.root.innerHTML),['next-stage']);
    await h.click({action:'next-stage'});assert.match(h.root.innerHTML,/0\/2 points placed/);
    await h.point(50,30);await h.point(80,30);assert.deepEqual(primaryActions(h.root.innerHTML),['preview-split']);await h.click({action:'preview-split'});
    assert.equal(h.error(),'');assert.deepEqual(h.project().parts,cleaned.parts,'a proposed movement cut is reviewed');
    await h.click({action:'accept'});await h.settle();
    assert.equal(h.project().parts.length,2);assert.equal(h.project().joints.length,1);
    assert.match(h.root.innerHTML,/data-joint-field="angle"/,'the selected moving part exposes its angle');
    await h.change({dataset:{jointField:'angle'},value:'25'});await h.settle();
    assert.equal(h.project().joints[0].angle,25);
    const posed=structuredClone(h.project());
    assert.deepEqual(primaryActions(h.root.innerHTML),['next-stage']);
    await h.click({action:'next-stage'});assert.match(h.root.innerHTML,/data-step="make" aria-current="step"/);
    assert.deepEqual(primaryActions(h.root.innerHTML),['print']);
    const makeMarkup=h.root.innerHTML,makeControls=makeMarkup.indexOf('<section class="make-controls">'),heightControl=makeMarkup.indexOf('data-field="heightMm"'),printButton=makeMarkup.indexOf('data-action="print"');
    assert.ok(makeControls>=0&&heightControl>makeControls&&printButton>heightControl,'Make shows the editable puppet height before its Print action');
    await h.click({action:'print'});assert.equal(h.error(),'');assert.ok(h.printFrame.srcdoc.includes(source.dataUrl));assert.match(h.printFrame.srcdoc,/50 mm/);
    await h.click({action:'save-project'});const downloaded=parseStudioProject(await h.downloads.at(-1).blob.text());await h.openProject(downloaded);
    assert.deepEqual(h.project().parts,posed.parts);assert.deepEqual(h.project().joints,posed.joints);assert.deepEqual(h.project().assets,posed.assets);
    assert.equal(h.requests.length,0,'cleanup, construction and printing are local operations');
  } finally {await h.close();}
});

test('a new generated character prepares before reusing an old rig, keeps chosen props and protects locked construction', async () => {
  const h=browserHarness(),raster=decoratedHorseFixture(),original=h.setRaster(raster);
  h.setGetResponse(legacyImageStatus);h.setResponse(()=>({dataUrl:original,model:'configured-image-model',kind:'reference'}));
  try {
    await h.start('subject-selection-and-locks');await h.settle();await h.click({action:'starter',kind:'figure'});
    const oldRig=structuredClone(h.project());assert.ok(oldRig.joints.length);assert.ok(oldRig.parts.every(part=>!part.locked));
    await h.click({action:'step',step:'create'});h.input('create-prompt','A brown horse with a blue saddle and a separate ball.');
    await h.click({action:'generate-image'});await h.click({action:'accept'});await h.settle();
    assert.equal(h.error(),'');assert.deepEqual(h.project().parts,oldRig.parts);assert.deepEqual(h.project().joints,oldRig.joints);
    assert.deepEqual(primaryActions(h.root.innerHTML),['remove-extras'],'a new image needs preparation even when the previous character already had movable joints');
    const before=structuredClone(h.project());assert.ok(before.parts.length>2);assert.ok(before.joints.length);
    await h.click({action:'remove-extras'});await h.settle();assert.deepEqual(h.project(),before,'old construction is preserved while cleanup is being reviewed');
    assert.match(h.root.innerHTML,/data-action="keep-more"/);
    await h.click({action:'keep-more'});assert.ok(h.canvasMarkup().includes(original),'choosing a prop uses the original image');
    await h.point(87,79);await h.settle();assert.equal(h.error(),'');assert.match(h.root.innerHTML,/id="review-heading"/);
    await h.click({action:'accept'});await h.settle();
    const kept=structuredClone(h.project()),cleaned=kept.assets.find(a=>a.id===kept.conceptAssetId),pixels=h.rasters.get(cleaned.dataUrl);
    assert.equal(kept.parts.length,2,'only the character and explicitly confirmed prop become pieces');
    assert.equal(kept.joints.length,0,'old construction connections are removed with their replaced parts');
    assert.equal(kept.rods.length,0);assert.ok(kept.parts.every(p=>!before.parts.some(old=>old.id===p.id)));
    assert.equal(pixels.data[(79*100+87)*4+3],255);assert.equal(pixels.data[(6*100+6)*4+3],0);
    await h.click({action:'undo'});assert.deepEqual(h.project(),before,'cleanup and construction replacement undo together');
    await h.click({action:'pick-subject'});await h.point(87,79);await h.settle();assert.equal(h.error(),'');
    await h.click({action:'accept'});await h.settle();
    const ballOnly=structuredClone(h.project()),ballRaster=h.rasters.get(ballOnly.assets.find(a=>a.id===ballOnly.conceptAssetId).dataUrl);
    assert.equal(ballOnly.parts.length,1,'manual selection can choose a subject smaller than the default largest component');
    assert.equal(ballRaster.data[(79*100+87)*4+3],255);assert.equal(ballRaster.data[(45*100+35)*4+3],0);
    await h.click({action:'undo'});assert.deepEqual(h.project(),before);
    await h.click({action:'select',id:before.parts[0].id});await h.click({action:'lock'});const locked=structuredClone(h.project());
    await h.click({action:'remove-extras'});await h.settle();assert.match(h.error(),/unlock|locked/i);assert.deepEqual(h.project(),locked);assert.doesNotMatch(h.root.innerHTML,/id="review-heading"/);
    assert.equal(h.requests.length,1,'only the explicit generation used the relay; cleanup, selection and locking stayed local');
  } finally {await h.close();}
});

test('a delayed generated image cannot replace work changed while generation is pending', async () => {
  const h=browserHarness();h.setGetResponse(legacyImageStatus);
  const generated=h.setRaster(rasterFixture({rectangles:[{x:20,y:10,w:50,h:80,color:[30,70,180,255]}]}));let complete;
  h.setResponse(()=>new Promise(resolve=>{complete=resolve;}));
  try {
    await h.start('stale-generated-image');await h.settle();
    h.input('create-prompt','A historical astronomer with a wide robe.');await h.settle();
    const pending=h.click({action:'generate-image'});await h.settle();assert.equal(h.requests.length,1);
    h.input('create-prompt','A modern astronaut with a blue flight suit.');await h.settle();const changed=structuredClone(h.project());
    complete({dataUrl:generated,model:'configured-image-model',kind:'reference'});await pending;await h.settle();
    assert.match(h.error(),/design changed while AI was working/i);assert.deepEqual(h.project(),changed);assert.equal(changed.assets.length,0);assert.doesNotMatch(h.root.innerHTML,/data-action="accept"/);
    await h.click({action:'accept'});await h.settle();assert.deepEqual(h.project(),changed);
  } finally {await h.close();}
});

test('a drawing-plan response containing advice without editable shapes remains visible', async () => {
  const h=browserHarness();h.setGetResponse(legacyImageStatus);
  const advice='Try tracing the two sleeves from a side-view reference; no editable outline measurements were returned.';
  h.setResponse(()=>({reply:advice}));
  try {
    await h.start('advice-only-create');await h.settle();
    h.input('create-prompt','Draft an articulated historical scholar with wide sleeves.');await h.settle();
    const before=structuredClone(h.project());await h.click({action:'create-plan'});await h.settle();
    assert.equal(h.requests.length,2,'the text transport attempts one repair before presenting the advice');
    assert.deepEqual(h.project(),before);assert.doesNotMatch(h.root.innerHTML,/data-action="accept"/);
    assert.ok(h.root.innerHTML.includes(advice),'an advice-only reply is shown on the current screen instead of disappearing');
  } finally {await h.close();}
});

test('keyboard part and joint buttons and clicking a joint select the correct inspector without changing geometry', async () => {
  const h=browserHarness();
  try {
    await h.start('keyboard-and-mouse-selection');await h.settle();await h.click({action:'starter',kind:'figure'});await h.settle();
    const before=structuredClone(h.project()),joint=before.joints[0];
    assert.equal(h.key('Enter',{partId:joint.parentId}),true,'Enter activates the advertised SVG part button');
    assert.ok(h.root.innerHTML.includes(`class="part-item selected" data-action="select" data-id="${joint.parentId}"`));assert.equal(h.focusedSelectors.at(-1),`[data-part-id="${joint.parentId}"]`,'keyboard selection restores focus after rendering');
    assert.equal(h.key(' ',{jointId:joint.id}),true,'Space activates the joint and prevents page scrolling');
    assert.ok(h.root.innerHTML.includes(`class="part-item selected" data-action="select" data-id="${joint.childId}"`));assert.match(h.root.innerHTML,/class="joint-control"/);assert.equal(h.focusedSelectors.at(-1),`[data-joint-id="${joint.id}"]`);
    h.key(' ',{partId:joint.parentId});await h.jointPoint(0,0,joint.id);
    assert.ok(h.root.innerHTML.includes(`class="part-item selected" data-action="select" data-id="${joint.childId}"`),'clicking the joint marker opens its child movement controls');
    await h.settle();assert.deepEqual(h.project(),before,'selection creates no geometry or undo-history edit');assert.equal(h.requests.length,0);
  } finally {await h.close();}
});

test('projects remain session-only across reload, back-forward restoration and New while downloaded projects reopen explicitly', async () => {
  const h=browserHarness();
  const stale=createStudioProject();stale.title='Old browser-stored design';stale.brief.keywords='Do not restore this prompt';stale.parts=[makePart('Old stored piece',[[10,10],[40,10],[40,70],[10,70]])];
  h.legacyRecords.set('current',stale);
  try {
    await h.start('fresh-session');await h.settle();
    assert.equal(h.project().title,'');assert.equal(h.project().brief.keywords,'');assert.equal(h.project().parts.length,0,'startup ignores legacy browser projects');
    assert.equal(h.legacyRecords.size,0,'startup clears the previous browser-stored project');
    await h.click({action:'starter',kind:'figure'});h.input('create-prompt','My session-only blue storyteller');await h.settle();
    const current=h.project();assert.ok(current.parts.length);assert.equal(current.brief.keywords,'My session-only blue storyteller');
    await h.click({action:'save-project'});assert.equal(h.downloads.length,1);const downloaded=parseStudioProject(await h.downloads[0].blob.text());
    assert.deepEqual(downloaded.parts,current.parts);assert.equal(downloaded.brief.keywords,current.brief.keywords);
    await h.start('reload-session');await h.settle();
    assert.notEqual(h.project().id,current.id);assert.equal(h.project().parts.length,0);assert.equal(h.project().assets.length,0);assert.equal(h.project().brief.keywords,'','reload opens a blank project');
    await h.openProject(downloaded);assert.deepEqual(h.project().parts,downloaded.parts);assert.equal(h.project().brief.keywords,downloaded.brief.keywords,'explicit portable-project opening still restores the saved work');
    const reopened=h.project();await h.pageShow(false);assert.deepEqual(h.project(),reopened,'an ordinary pageshow event does not discard the active session');
    await h.pageShow(true);assert.equal(h.project().parts.length,0);assert.equal(h.project().brief.keywords,'','back-forward cache restoration starts a fresh session');
    await h.openProject(downloaded);const downloadCount=h.downloads.length;await h.click({action:'new-project'});await h.settle();
    assert.equal(h.downloads.length,downloadCount,'New does not download a project automatically');assert.equal(h.project().parts.length,0);
    await h.click({action:'undo'});assert.equal(h.project().parts.length,0,'New clears history so a previous project cannot be restored with Undo');
    assert.equal(h.storageOperations.filter(op=>op.kind==='put'||op.kind==='get').length,0,'the application neither reads nor writes project records');
    assert.ok(h.storageOperations.filter(op=>op.kind==='local-set').every(op=>op.key==='bnta-studio-endpoint'),'only the optional endpoint preference may be persisted');assert.equal(h.requests.length,0);
  } finally {await h.close();}
});

test('reset cancels an old generation without overwriting a new session or its newer pending request', async () => {
  const h=browserHarness();h.setGetResponse(legacyImageStatus);const completions=[];
  const oldImage=h.setRaster(rasterFixture({rectangles:[{x:20,y:10,w:50,h:80,color:[180,40,20,255]}]}));
  const newImage=h.setRaster(rasterFixture({rectangles:[{x:20,y:10,w:50,h:80,color:[30,70,180,255]}]}));
  h.setResponse(()=>new Promise(resolve=>completions.push(resolve)));
  try {
    await h.start('reset-pending-generation');await h.settle();h.input('create-prompt','Old session crimson knight');
    const oldPending=h.click({action:'generate-image'});await h.settle();assert.equal(completions.length,1);
    await h.click({action:'new-project'});h.input('create-prompt','New session blue astronomer');
    const newPending=h.click({action:'generate-image'});await h.settle();assert.equal(completions.length,2);
    completions[0]({dataUrl:oldImage,model:'configured-image-model',kind:'reference'});await oldPending;await h.settle();
    assert.equal(h.error(),'');assert.equal(h.project().brief.keywords,'New session blue astronomer');assert.equal(h.project().assets.length,0);assert.match(h.root.innerHTML,/class="busy-banner"/,'an old request cannot end the new request busy state');assert.doesNotMatch(h.root.innerHTML,/Old session crimson knight/);
    completions[1]({dataUrl:newImage,model:'configured-image-model',kind:'reference'});await newPending;await h.settle();assert.equal(h.error(),'');assert.match(h.root.innerHTML,/id="review-heading"/);
    await h.click({action:'accept'});assert.equal(h.project().assets.length,1);assert.equal(h.project().assets[0].dataUrl,newImage);assert.equal(h.requests.length,2);
  } finally {await h.close();}
});

test('a pending review isolates angle and shape controls until the student accepts the proposal', async () => {
  const h=browserHarness();
  try {
    await h.start('review-control-isolation');await h.settle();await h.click({action:'starter',kind:'figure'});
    const childId=h.project().joints[0].childId;await h.click({action:'select',id:childId});
    h.setResponse(()=>({reply:'Review the selected piece at 110% width.',proposal:{parts:[{id:childId,parameters:{width:1.1}}]}}));
    h.input('revision-prompt','Make this piece 10% wider.');h.submit('refine-form');await h.settle();const before=h.project();assert.match(h.root.innerHTML,/id="review-heading"/);assert.equal(h.canvasMarkup(),'');
    assert.match(h.root.innerHTML,/class="workspace[^\"]*reviewing/);assert.doesNotMatch(h.root.innerHTML,/<section class="work-panel"/,'Refine review contains no background work panel');
    assert.doesNotMatch(h.root.innerHTML,/<aside class="inspector"/,'the review contains no background editing inspector');
    assert.doesNotThrow(()=>h.jointInput('angle','30'),'hidden canvas previews cannot throw during review');assert.doesNotThrow(()=>h.parameterInput('width','150'));
    await h.change({dataset:{jointField:'angle'},value:'30'});await h.change({dataset:{paramField:'width'},value:'150'});
    assert.deepEqual(h.project(),before,'review prevents background geometry edits');assert.equal(h.error(),'');assert.match(h.root.innerHTML,/data-action="accept"/);
    await h.click({action:'accept'});assert.equal(h.project().parts.find(p=>p.id===childId).parameters.width,1.1);assert.deepEqual(h.project().joints,before.joints);
  } finally {await h.close();}
});

test('zoom, pan cancellation and touch-sized keyboard or pointer outline edits preserve the correct geometry', async () => {
  const h=browserHarness();
  try {
    await h.start('camera-and-outline-controls');await h.settle();const project=createStudioProject();project.canvas={width:100,height:100};project.parts=[makePart('Editable rectangle',[[20,20],[80,20],[80,80],[20,80]])];await h.openProject(project);
    const id=h.project().parts[0].id,before=h.project(),fit=h.viewBox();
    await h.click({action:'zoom-in'});const zoomed=h.viewBox();assert.ok(Math.abs(zoomed[2]-fit[2]/1.25)<1e-8);assert.ok(Math.abs(zoomed[0]+zoomed[2]/2-fit[0]-fit[2]/2)<1e-8,'zoom keeps the view centered');
    for(let i=0;i<12;i++)await h.click({action:'zoom-in'});assert.ok(Math.abs(h.viewBox()[2]-fit[2]/6)<1e-6,'zoom stops at 6x');await h.click({action:'zoom-fit'});assert.deepEqual(h.viewBox(),fit);assert.deepEqual(h.project(),before,'camera controls never change puppet geometry or scale');
    await h.click({action:'zoom-in'});await h.click({action:'pan'});const panStart=h.viewBox(),unit=Math.max(panStart[2]/800,panStart[3]/600);
    assert.equal(h.pointer('pointerdown',100,100,{pointerId:41}),true);assert.equal(h.captures.at(-1),41);
    h.pointer('pointermove',120,130,{pointerId:42});assert.deepEqual(h.viewBox(),panStart,'another pointer cannot take over a drag');
    h.pointer('pointermove',120,130,{pointerId:41});assert.ok(Math.abs(h.viewBox()[0]-(panStart[0]-20*unit))<.01);assert.ok(Math.abs(h.viewBox()[1]-(panStart[1]-30*unit))<.01);assert.deepEqual(h.project(),before);
    h.pointer('pointercancel',120,130,{pointerId:41});assert.deepEqual(h.viewBox(),panStart,'a cancelled pan restores the camera');assert.equal(h.releases.at(-1),41);
    h.pointer('pointerdown',100,100,{pointerId:43});h.pointer('pointermove',120,130,{pointerId:43});h.pointer('pointerup',120,130,{pointerId:43});assert.notDeepEqual(h.viewBox(),panStart);assert.deepEqual(h.project(),before);
    await h.click({action:'zoom-fit'});await h.click({action:'select',id});await h.click({action:'vertices'});const vertexView=h.viewBox(),vertexUnit=Math.max(vertexView[2]/800,vertexView[3]/600),radius=Number(h.canvasMarkup().match(/class="vertex-hit"[^>]*r="([^"]+)"/)?.[1]);
    assert.ok(Math.abs(2*radius/vertexUnit-44)<1e-8,'outline points have a 44 CSS-pixel hit area');assert.match(h.canvasMarkup(),/data-vertex-index="0" tabindex="0" role="button"/);
    h.pointer('pointerdown',22,22,{vertexIndex:0,pointerId:51});h.pointer('pointermove',26,24,{pointerId:51});assert.deepEqual(h.project(),before,'dragging previews without committing');h.pointer('pointercancel',26,24,{pointerId:51});assert.deepEqual(h.project(),before);assert.equal(h.releases.at(-1),51);
    assert.equal(h.key('ArrowRight',{dataset:{vertexIndex:0}}),true);const movedRight=h.project();assert.ok(Math.abs(movedRight.parts[0].polygon[0][0]-(20+vertexUnit))<1e-8);assert.equal(h.focusedSelectors.at(-1),'[data-vertex-index="0"]');
    assert.equal(h.key('ArrowDown',{dataset:{vertexIndex:0}},{shiftKey:true}),true);assert.ok(Math.abs(h.project().parts[0].polygon[0][1]-(20+10*vertexUnit))<1e-8);assert.ok(Math.abs(unitsPerMm(h.project())-unitsPerMm(before))<1e-8);
    await h.click({action:'undo'});await h.click({action:'undo'});assert.deepEqual(h.project(),before);await h.click({action:'vertices'});
    h.pointer('pointerdown',22,22,{vertexIndex:0,pointerId:55});h.pointer('pointermove',26,24,{pointerId:55});h.pointer('pointerup',26,24,{pointerId:55});assert.deepEqual(h.project().parts[0].polygon[0],[24,22],'grabbing the wider hit area preserves the pointer offset');assert.equal(h.releases.at(-1),55);assert.equal(h.error(),'');assert.equal(h.requests.length,0);
  } finally {await h.close();}
});
