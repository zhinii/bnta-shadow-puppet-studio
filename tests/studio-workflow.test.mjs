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
function jointPlanCandidates(body) {
  const prefix='Candidate table columns: [id,localPoint,cutAngle,position,smallerRegionAreaFraction,smallerRegionBounds]. ';
  if(typeof body.prompt==='string'&&body.prompt.includes(prefix)){
    const groups=JSON.parse(body.prompt.slice(body.prompt.indexOf(prefix)+prefix.length));
    return groups.flatMap(group=>group.rows.map(([id,point,angleDegrees])=>({id,partId:group.partId,point,...(angleDegrees===null?{}:{angleDegrees})})));
  }
  const message=body.messages?.findLast(message=>message.role==='user');
  if(typeof message?.content==='string'){
    try{const content=JSON.parse(message.content);if(content.scene?.operation==='joint-plan')return content.scene.studio.candidates;}catch{}
  }
  return null;
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
  const target = ({dataset={},canvas=false,planCanvas=false,planMarker=null,partId=null,jointId=null,...rest}={}) => ({dataset,...rest,closest(selector) {
    if(selector==='#puppet-canvas')return canvas ? this : null;
    if(selector==='#plan-canvas')return planCanvas ? this : null;
    if(selector==='[data-plan-marker]')return planMarker ? {dataset:{planMarker}} : null;
    if(selector==='#canvas-wrap')return canvas ? canvasWrap : null;
    if(selector==='[data-action]')return dataset.action ? this : null;
    if(selector==='[data-part-id]')return partId ? {dataset:{partId}} : null;
    if(selector==='[data-joint-id]')return jointId ? {dataset:{jointId}} : null;
    if(selector==='[data-vertex-index]')return dataset.vertexIndex!==undefined ? this : null;
    return null;
  }});
  const root = {_html:'',get innerHTML(){return this._html;},set innerHTML(value){this._html=value;canvas.innerHTML=value.match(/<div id="puppet-canvas">([\s\S]*?)<\/div>/)?.[1]||'';planCanvas.innerHTML=value.match(/<div\b[^>]*\bid="plan-canvas"[^>]*>([\s\S]*?)<\/div>/)?.[1]||'';jointPreview.innerHTML=value.match(/<div class="joint-preview" id="joint-preview">([\s\S]*?)<\/div>/)?.[1]||'';reviewAngle.textContent=value.match(/<output id="review-angle-output">([^<]*)<\/output>/)?.[1]||'';promptBudget.textContent=value.match(/<p id="prompt-budget"[^>]*>([^<]*)<\/p>/)?.[1]||'';promptBudget.hidden=!value.includes('id="prompt-budget"');},addEventListener:(type,fn)=>rootListeners.set(type,fn),querySelector:selector=>/^\[data-(?:(part|joint)-id|vertex-index|plan-marker)=/.test(selector)?{focus(){focusedSelectors.push(selector);}}:null};
  const status = {textContent:''}, canvas = {innerHTML:''},planCanvas={innerHTML:'',getBoundingClientRect:()=>rect(),setPointerCapture(id){captures.push(id);},releasePointerCapture(id){releases.push(id);}},jointPreview={innerHTML:''},reviewAngle={textContent:''}, angle = {textContent:''},promptBudget={textContent:'',hidden:false}, toast = {textContent:'',classList:{add(){},remove(){}}};
  const relayInput={value:'',focus(){focusedSelectors.push('#relay-url');}};
  let viewport={width:800,height:600};
  const rect=()=>({left:0,top:0,...viewport,right:viewport.width,bottom:viewport.height});
  const canvasWrap={getBoundingClientRect:rect,setPointerCapture(id){captures.push(id);},releasePointerCapture(id){releases.push(id);},focus(){focusedSelectors.push('#canvas-wrap');}};
  const svg = {getBoundingClientRect:rect,createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}};},getScreenCTM(){return {inverse(){return {};}};}};
  for(const name of ['project-file','artwork-file'])files.set(name,{value:'',files:[],listeners:new Map(),addEventListener(type,fn){this.listeners.set(type,fn);},click(){}});
  const printFrame={contentDocument:{images:[]},contentWindow:{focus(){},print(){}}};
  globalThis.document = {documentElement:{lang:'en'},addEventListener:(type,fn)=>documentListeners.set(type,fn),querySelector(selector) {
    if(['#puppet-canvas','#puppet-canvas svg','#canvas-wrap'].includes(selector)&&!root.innerHTML.includes('id="puppet-canvas"'))return null;
    if(['#joint-preview','#review-angle-output'].includes(selector)&&!root.innerHTML.includes('id="joint-preview"'))return null;
    if(['#plan-canvas','#plan-canvas svg'].includes(selector)&&!root.innerHTML.includes('id="plan-canvas"'))return null;
    if(selector==='#review-heading'||selector==='#cleanup-heading')return {focus(){focusedSelectors.push(selector);}};
    if(selector==='#relay-url')return root.innerHTML.includes('id="relay-url"')?relayInput:null;
    if(selector==='#ai-status-button')return {focus(){focusedSelectors.push(selector);}};
    if(selector==='.canvas-panel')return {scrollIntoView(options){scrollRequests.push(options);}};
    if(/^\[data-vertex-index=/.test(selector))return {focus(){focusedSelectors.push(selector);},setAttribute(){},getBoundingClientRect:rect};
    if(/^\[data-plan-marker=/.test(selector))return {focus(){focusedSelectors.push(selector);},setAttribute(){},getBoundingClientRect:rect};
    return ({'#app':root,'#save-status':status,'#toast':toast,'#puppet-canvas':canvas,'#canvas-wrap':canvasWrap,'#puppet-canvas svg':svg,'#plan-canvas':planCanvas,'#plan-canvas svg':svg,'#angle-output':angle,'#joint-preview':jointPreview,'#review-angle-output':reviewAngle,'#prompt-budget':promptBudget,'#print-frame':printFrame})[selector] || files.get(selector.slice(1)) || null;
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
  let postResponseFactory=null;
  let planResponseFactory=candidates=>({selectedIds:candidates.map(marker=>marker.id)}),planPostResponseFactory=null;
  let capabilities={version:2,text:true,vision:false,imageGeneration:false,status:'Drawing plans only; image services unavailable.'};
  let getResponseFactory=()=>({ok:true,status:200,json:async()=>capabilities});
  globalThis.fetch=async(url,options={})=>{
    if(options.method==='POST'){
      const body=JSON.parse(options.body),candidates=jointPlanCandidates(body);requests.push({url,body,planning:candidates!==null});
      if(candidates!==null)return planPostResponseFactory?planPostResponseFactory(candidates,body,url):{ok:true,status:200,json:async()=>planResponseFactory(candidates,body)};
      if(postResponseFactory)return postResponseFactory(body,url);
      return {ok:true,status:200,json:async()=>responseFactory(body)};
    }
    return getResponseFactory(url);
  };
  const settle=()=>new Promise(resolve=>nativeTimeout(resolve,25));
  return {root,status,requests,legacyRecords:records,storageOperations,preferences,downloads,files,settle,rasters,printFrame,promptBudget,focusedSelectors,scrollRequests,captures,releases,
    async start(name){appModule=await import(`../public/studio-app.mjs?${name}-${++startCount}`);},
    project:()=>appModule.getSessionSnapshot(),
    canvasMarkup:()=>canvas.innerHTML,
    reviewMarkup:()=>jointPreview.innerHTML,
    planMarkup:()=>planCanvas.innerHTML,
    planMarkers:()=>[...new Set(Array.from(planCanvas.innerHTML.matchAll(/data-plan-marker="([^"]+)"/g),m=>m[1]))],
    planLocation:id=>{const markup=planCanvas.innerHTML.slice(planCanvas.innerHTML.indexOf(`data-plan-marker="${id}"`)),circle=markup.match(/<circle cx="([^"]+)" cy="([^"]+)"/);return circle?.slice(1).map(Number);},
    resizeCanvas(width,height){viewport={width,height};windowListeners.get('resize')?.();},
    focusPlanMarker(id){globalThis.document.activeElement=target({planMarker:id});},
    reviewAngle:()=>reviewAngle.textContent,
    viewBox:()=>canvas.innerHTML.match(/viewBox="([^"]+)"/)?.[1].split(' ').map(Number),
    pageShow:async persisted=>{windowListeners.get('pageshow')?.({persisted});await settle();},
    error:()=>root.innerHTML.match(/class="error-banner" role="alert">([^<]*)/)?.[1]||'',
    setRaster(value){fixtureRaster=structuredClone(value);const url=fixturePng(value);rasters.set(url,structuredClone(value));return url;},
    setResponse(fn){responseFactory=fn;},
    setPostResponse(fn){postResponseFactory=fn;},
    setPlanResponse(fn){planResponseFactory=fn;},
    setPlanPostResponse(fn){planPostResponseFactory=fn;},
    setGetResponse(fn){getResponseFactory=fn;},
    setRelayUrl(value){relayInput.value=value;},
    setCapabilities(value){capabilities={...capabilities,...value};},
    click:dataset=>rootListeners.get('click')({target:target({dataset})}),
    input:(id,value)=>rootListeners.get('input')({target:target({id,value,dataset:{}})}),
    parameterInput:(key,value)=>rootListeners.get('input')({target:target({dataset:{paramField:key},value})}),
    jointInput:(key,value)=>rootListeners.get('input')({target:target({dataset:{jointField:key},value})}),
    reviewInput:value=>rootListeners.get('input')({target:target({dataset:{reviewAngle:''},type:'range',value:String(value)})}),
    planInput:value=>rootListeners.get('input')({target:target({dataset:{planAngle:''},type:'range',value:String(value)})}),
    change:el=>rootListeners.get('change')({target:target(el)}),
    submit:id=>rootListeners.get('submit')({target:{id},preventDefault(){}}),
    point:(x,y,partId=null)=>rootListeners.get('click')({target:target({canvas:true,partId}),clientX:x,clientY:y}),
    planPoint:(x,y,{partId=null,marker=null}={})=>rootListeners.get('click')({target:target({planCanvas:true,partId,planMarker:marker}),clientX:x,clientY:y}),
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

test('cold startup waits for known image capabilities without sending a surprise text draft', async () => {
  const h=browserHarness();let releaseStatus;
  h.setGetResponse(url=>String(url).endsWith('/api/status')?legacyImageStatus(url):new Promise(resolve=>{releaseStatus=resolve;}));
  try {
    await h.start('pending-image-capabilities');
    const prompt='A panda wearing a birthday party hat.';h.input('create-prompt',prompt);
    assert.equal(typeof releaseStatus,'function');assert.equal(h.promptBudget.textContent,'37 characters · Checking allowance…');
    assert.doesNotMatch(h.root.innerHTML,/37 \/ (4000|800)|Create editable draft/);
    assert.match(h.root.innerHTML,/<button[^>]*data-action="generate-image"[^>]*disabled[^>]*>Connecting…<\/button>/);
    assert.match(h.root.innerHTML,/<button[^>]*data-action="create-plan"[^>]*disabled/);
    for(const action of ['generate-image','create-plan'])await h.click({action});await h.submit('create-form');
    assert.equal(h.requests.length,0,'clicks or form submission during connection cannot silently choose the text route');
    assert.equal(h.project().brief.keywords,prompt);assert.equal(h.error(),'');
    releaseStatus({ok:false,status:404,json:async()=>({error:'not_found'})});await h.settle();
    assert.equal(h.promptBudget.textContent,'37 / 800 characters');assert.match(h.root.innerHTML,/>Create character<\/button>/);
    assert.doesNotMatch(h.root.innerHTML,/>Connecting…<\/button>/);assert.equal(h.requests.length,0);assert.equal(h.project().brief.keywords,prompt);
  } finally {await h.close();}
});

test('superseded capability checks cannot change the current session or endpoint', async () => {
  const h=browserHarness(),pending=[];
  h.setGetResponse(url=>new Promise(resolve=>pending.push({url,resolve})));
  const response=imageGeneration=>({ok:true,status:200,json:async()=>({version:2,text:true,imageGeneration,vision:false,status:'Connected.'})});
  try {
    await h.start('stale-capability-checks');assert.equal(pending.length,1);
    await h.click({action:'starter',kind:'figure'});assert.ok(h.project().parts.length,'local starters remain usable during the connection check');
    await h.click({action:'new-project'});assert.equal(pending.length,2,'New restarts an unfinished capability check');
    h.input('create-prompt','New session cosmic bird');pending[1].resolve(response(false));await h.settle();
    pending[0].resolve(response(true));await h.settle();
    assert.equal(h.project().brief.keywords,'New session cosmic bird');assert.equal(h.project().parts.length,0);
    assert.match(h.root.innerHTML,/>Create editable draft<\/button>/);assert.doesNotMatch(h.root.innerHTML,/>Create character<\/button>/);
    await h.click({action:'settings'});h.setRelayUrl('https://old-relay.example/api/studio');const oldCheck=h.click({action:'save-endpoint'});
    h.setRelayUrl('https://current-relay.example/api/studio');const currentCheck=h.click({action:'save-endpoint'});
    assert.equal(pending.length,4);pending[3].resolve(response(false));await currentCheck;pending[2].resolve(response(true));await oldCheck;
    assert.equal(h.preferences.get('bnta-studio-endpoint'),'https://current-relay.example/api/studio');
    await h.click({action:'settings'});assert.match(h.root.innerHTML,/>Create editable draft<\/button>/);assert.doesNotMatch(h.root.innerHTML,/>Create character<\/button>/);
    h.setResponse(()=>({reply:'Review the bird.',proposal:{parts:[{id:'bird',name:'Bird',polygon:[[0,0],[80,0],[80,100],[0,100]],fill:'#774422'}],joints:[]}}));
    await h.submit('create-form');await h.settle();assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'https://current-relay.example/api/studio');
  } finally {await h.close();}
});

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
    assert.doesNotMatch(h.root.innerHTML,/<aside class="inspector"|Keep the character and any props|Choose the character myself/,'drawing does not show irrelevant cleanup or selection tools');
    for(const action of ['cancel-tool','undo-point','finish-part'])assert.match(h.root.innerHTML,new RegExp(`data-action="${action}"`),'drawing controls remain reachable');
    await h.click({action:'cancel-tool'});
    assert.deepEqual(primaryActions(h.root.innerHTML),['draw'],'cancelled blank drawing offers one enabled recovery action');
    assert.match(h.root.innerHTML,/data-action="draw"[^>]*>Draw a piece/);
    assert.doesNotMatch(h.root.innerHTML,/<aside class="inspector"|Choose the character myself/,'cancelling an empty drawing keeps recovery uncluttered');
    await h.importArtwork();
    await h.click({action:'draw'});
    assert.match(h.root.innerHTML,/Tap around the outline/);
    for(const point of [[10,10],[40,10],[40,90],[10,90]])await h.point(...point);
    await h.click({action:'finish-part'});
    assert.match(h.root.innerHTML,/<aside class="inspector"/,'piece controls return after finishing');
    assert.match(h.root.innerHTML,/Adjust this piece/);
    await h.click({action:'draw'});
    assert.doesNotMatch(h.root.innerHTML,/<aside class="inspector"/,'drawing another part also stays focused');
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
    assert.match(h.root.innerHTML,/data-overlap-size="part"[^>]*value="6"/,'the inspector shows the existing compact size without silently upgrading it');
    await h.change({dataset:{overlapSize:'part',overlapJoint:project.joints[0].id},type:'number',value:'8.4'});await h.settle();
    project=h.project();
    assert.ok(Math.abs(project.joints[0].padRadius-4.2*drawingScale)<1e-8,'inspector millimetres convert into the calibrated design coordinates');
    assert.match(h.root.innerHTML,/data-overlap-size="part"[^>]*value="8.4"/);
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
    assert.match(h.root.innerHTML,/Remove the background/);await h.click({action:'reject'});
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
    assert.match(h.root.innerHTML,/Remove the background/);await h.click({action:'reject'});
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
    assert.match(h.root.innerHTML,/Remove the background/);await h.click({action:'reject'});
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
    assert.match(h.requests[0].body.prompt,/explicit student requests override/);assert.match(h.requests[0].body.prompt,/No extra text/);assert.ok(h.requests[0].body.prompt.length<=800,'classic image relay receives its bounded compact prompt');
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
    await h.click({action:'redo'});await h.settle();await h.click({action:'step',step:'refine'});assert.equal((h.root.innerHTML.match(/data-action="extract-silhouette"/g)||[]).length,1,'one advanced extraction action remains available for an image beside protected existing pieces');
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

test('classic image generation accepts a short panda prompt, honors the 800-character boundary and explains HTTP failures beside Create', async () => {
  const h=browserHarness();h.setGetResponse(legacyImageStatus);
  const generated=h.setRaster(rasterFixture({rectangles:[{x:25,y:15,w:50,h:65,color:[25,25,25,255]},{x:35,y:25,w:30,h:40,color:[255,255,255,255]}]}));
  const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
  const relay=body=>body.prompt.length>800?response(400,{error:'prompt'}):response(200,{dataUrl:generated,model:'configured-image-model',kind:'reference'});
  const createForm=()=>h.root.innerHTML.match(/<form id="create-form"[\s\S]*?<\/form>/)?.[0]||'';
  const inputLimit=()=>Number(createForm().match(/<textarea[^>]*id="create-prompt"[^>]*maxlength="(\d+)"/)?.[1]);
  const panda='a panda, dancing';let complete;
  h.setPostResponse(body=>new Promise(resolve=>{complete=()=>resolve(relay(body));}));
  try {
    await h.start('classic-panda-prompt-limit');await h.settle();assert.equal(inputLimit(),800);assert.equal(h.promptBudget.textContent,'0 / 800 characters');assert.equal(h.promptBudget.hidden,false);assert.match(createForm(),/id="prompt-budget"[^>]*aria-live="polite"/);
    h.input('create-prompt','p'.repeat(37));assert.equal(h.promptBudget.textContent,'37 / 800 characters','the always-visible count updates on each input without waiting for generation');assert.equal(h.promptBudget.hidden,false);
    h.input('create-prompt',panda);const pending=h.click({action:'generate-image'});await h.settle();
    assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'https://6ilmssim2bz2s.kimi.site/api/puppet/image');
    assert.ok(h.requests[0].body.prompt.length<=800);assert.ok(h.requests[0].body.prompt.endsWith(panda));
    assert.match(createForm(),/class="busy-banner"/,'pending feedback appears beside the Create action');
    assert.equal((h.root.innerHTML.match(/class="busy-banner"/g)||[]).length,1,'Create has no duplicate feedback on the distant canvas');
    complete();await pending;await h.settle();assert.equal(h.error(),'');assert.match(h.root.innerHTML,/id="review-heading"/);assert.ok(h.root.innerHTML.includes(generated));
    await h.click({action:'reject'});assert.equal(h.project().brief.keywords,panda);assert.equal(h.project().assets.length,0);
    await h.change({dataset:{field:'brief.kind'},value:'animal'});await h.change({dataset:{field:'brief.era'},value:'imagined'});await h.change({dataset:{field:'brief.style'},value:'paper-cut'});
    const limit=inputLimit();assert.ok(limit>100&&limit<800,'collapsed presets reserve their required space in the relay limit');assert.equal(h.promptBudget.textContent,panda.length+' / '+limit+' characters','changing a preset updates the displayed prompt budget');
    const boundary='panda '+ 'x'.repeat(limit-6);h.input('create-prompt',boundary);h.setPostResponse(relay);
    await h.click({action:'generate-image'});await h.settle();assert.equal(h.error(),'');assert.equal(h.requests.at(-1).body.prompt.length,800,'the advertised input boundary is accepted exactly');
    assert.ok(h.requests.at(-1).body.prompt.endsWith(boundary),'no student text is truncated at the boundary');assert.match(h.requests.at(-1).body.prompt,/Character type: animal/);assert.match(h.root.innerHTML,/id="review-heading"/);
    await h.click({action:'reject'});const count=h.requests.length,oversized=boundary+'!';h.input('create-prompt',oversized);
    assert.ok(h.promptBudget.textContent.startsWith(oversized.length+' / '+limit+' characters'),'an over-limit imported value still displays its actual count');assert.match(h.promptBudget.textContent,/Remove 1 characters/);assert.equal(h.promptBudget.hidden,false);
    await h.click({action:'generate-image'});await h.settle();assert.equal(h.requests.length,count,'an oversized imported or programmatic value is rejected before the network');assert.match(h.error(),/800/);assert.equal(h.project().brief.keywords,oversized);assert.ok(createForm().includes(oversized));assert.match(createForm(),/class="error-banner"/);
    h.input('create-prompt',panda);h.setPostResponse(()=>response(400,{error:'prompt'}));const before=h.project();
    await h.click({action:'generate-image'});await h.settle();assert.equal(h.requests.length,count+1,'HTTP 400 does not silently retry or repair image generation');
    assert.match(h.error(),/rejected the prompt.*Shorten/);assert.notEqual(h.error(),'prompt');assert.deepEqual(h.project(),before);assert.ok(createForm().includes(panda));assert.match(createForm(),/class="error-banner"/);assert.doesNotMatch(h.root.innerHTML,/class="busy-banner"|data-action="accept"/);
    h.setPostResponse(()=>response(429,{error:'rate_limit'}));await h.click({action:'generate-image'});await h.settle();
    assert.equal(h.requests.length,count+2,'HTTP 429 waits for an explicit retry');assert.match(h.error(),/busy|limit/);assert.match(createForm(),/class="error-banner"/);assert.deepEqual(h.project(),before);assert.deepEqual(primaryActions(h.root.innerHTML),['generate-image'],'the request finishes and Create becomes available again');
  } finally {await h.close();}
});

test('the simple image route automatically reviews the character and joint plan, then poses and prints it', async () => {
  const h=browserHarness(),raster=decoratedHorseFixture(),original=h.setRaster(raster);
  const pixel=(image,x,y)=>Array.from(image.data.slice((y*image.width+x)*4,(y*image.width+x)*4+4));
  try {
    await h.start('simple-subject-cleanup');await h.settle();
    assert.equal(primaryActions(h.root.innerHTML).length,1,'Create presents one enabled primary action');
    await h.importArtwork();
    const imported=structuredClone(h.project());
    assert.equal(imported.parts.length,0,'import does not automatically turn every disconnected mark into a part');
    assert.match(h.root.innerHTML,/Remove the background/,'upload starts the cleanup review automatically');
    assert.deepEqual(primaryActions(h.root.innerHTML),['accept']);
    await h.click({action:'reject'});assert.deepEqual(h.project(),imported);
    assert.doesNotMatch(h.root.innerHTML,/class="refine-stages"|data-action="refine-stage" data-stage="clean"/,'the four internal tool stages are not a visible navigation rail');
    assert.match(h.root.innerHTML,/<details class="view-tools"[^>]*>/,'view controls are in a disclosure');
    assert.doesNotMatch(h.root.innerHTML,/<details class="view-tools"[^>]*\sopen(?:\s|=|>)/,'view controls are folded away by default');
    assert.match(h.root.innerHTML,/More editing tools/);
    assert.deepEqual(primaryActions(h.root.innerHTML),['pick-background']);
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
    assert.match(h.root.innerHTML,/id="plan-canvas"/,'accepting the character automatically prepares its joint plan');
    const plannedCount=h.planMarkers().length;assert.ok(plannedCount>0);assert.deepEqual(primaryActions(h.root.innerHTML),['accept']);
    assert.equal(h.error(),'');assert.deepEqual(h.project().parts,cleaned.parts,'proposed movement cuts remain reviewable');
    await h.click({action:'accept'});await h.settle();
    assert.equal(h.project().parts.length,1+plannedCount);assert.equal(h.project().joints.length,plannedCount);
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
    assert.equal(h.requests.length,1);assert.equal(h.requests[0].planning,true,'only the explicit character acceptance starts AI joint selection; posing and printing remain local');
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
    assert.deepEqual(primaryActions(h.root.innerHTML),['pick-background'],'a new image needs preparation even when the previous character already had movable joints');
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
    assert.match(h.root.innerHTML,/id="plan-canvas"/);await h.click({action:'reject'});
    await h.click({action:'undo'});assert.deepEqual(h.project(),before,'cleanup and construction replacement undo together');
    await h.click({action:'pick-subject'});await h.point(87,79);await h.settle();assert.equal(h.error(),'');
    await h.click({action:'accept'});await h.settle();
    const ballOnly=structuredClone(h.project()),ballRaster=h.rasters.get(ballOnly.assets.find(a=>a.id===ballOnly.conceptAssetId).dataUrl);
    assert.equal(ballOnly.parts.length,1,'manual selection can choose a subject smaller than the default largest component');
    assert.equal(ballRaster.data[(79*100+87)*4+3],255);assert.equal(ballRaster.data[(45*100+35)*4+3],0);
    assert.match(h.root.innerHTML,/id="plan-canvas"/);await h.click({action:'reject'});
    await h.click({action:'undo'});assert.deepEqual(h.project(),before);
    await h.click({action:'select',id:before.parts[0].id});await h.click({action:'lock'});const locked=structuredClone(h.project());
    await h.click({action:'remove-extras'});await h.settle();assert.match(h.error(),/unlock|locked/i);assert.deepEqual(h.project(),locked);assert.doesNotMatch(h.root.innerHTML,/id="review-heading"/);
    assert.equal(h.requests.filter(r=>!r.planning).length,1,'only the explicit generation requests artwork');
    assert.equal(h.requests.filter(r=>r.planning).length,1,'cleanup acceptance plans the horse once; a still prop has no candidates to send');
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

test('a prepared joint plan rebuilds edits from the original and commits all joints in one undo step', async () => {
  const h=browserHarness();h.setPlanResponse(candidates=>({selectedIds:[candidates[0].id]}));
  try {
    await h.start('editable-joint-plan');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:240};project.parts=[makePart('Long arm',[[0,0],[30,0],[30,240],[0,240]])];
    await h.openProject(project);const before=h.project(),partId=before.parts[0].id;
    assert.deepEqual(primaryActions(h.root.innerHTML),['prepare-joints']);await h.click({action:'prepare-joints'});
    assert.equal(h.error(),'');assert.equal(h.planMarkers().length,1);assert.match(h.planMarkup(),/data-plan-marker="[^"]+" role="button" tabindex="0"/);
    assert.deepEqual(h.project(),before);assert.equal(h.requests.length,1);assert.equal(h.requests[0].planning,true);
    const initialMarker=h.planMarkers()[0];await h.planPoint(15,120,{marker:initialMarker});
    const stillPreview=h.planMarkup(),page=h.root.innerHTML;h.planInput(30);
    assert.notEqual(h.planMarkup(),stillPreview,'trying a selected joint updates the preview');assert.equal(h.root.innerHTML,page,'slider input preserves its DOM');assert.deepEqual(h.project(),before);
    await h.click({action:'plan-add'});await h.planPoint(15,60,{partId});
    assert.equal(h.error(),'');assert.equal(h.planMarkers().length,2);assert.deepEqual(h.project(),before);
    const addedMarker=h.planMarkers().find(id=>id!==initialMarker);
    await h.planPoint(15,60,{marker:addedMarker});await h.click({action:'plan-move'});await h.planPoint(15,180,{partId});
    assert.equal(h.error(),'');assert.equal(h.planMarkers().length,2);assert.ok(h.planMarkers().includes(addedMarker),'moving retains the selected marker identity');
    await h.click({action:'plan-delete'});assert.deepEqual(h.planMarkers(),[initialMarker]);assert.deepEqual(h.project(),before);
    await h.click({action:'plan-add'});await h.planPoint(15,60,{partId});
    await h.click({action:'plan-add'});await h.planPoint(15,.1,{partId});
    assert.equal(h.planMarkers().length,3);assert.deepEqual(primaryActions(h.root.innerHTML),[],'a marker that cannot form a sound cut blocks acceptance');
    assert.match(h.root.innerHTML,/A moving piece could not be separated here/);assert.deepEqual(h.project(),before);
    await h.click({action:'plan-delete'});assert.equal(h.planMarkers().length,2);h.planInput(-20);
    assert.equal(h.error(),'');assert.deepEqual(primaryActions(h.root.innerHTML),['accept']);assert.deepEqual(h.project(),before);
    assert.equal(h.requests.length,1,'adding, moving, deleting and trying joints reuse the accepted geometry candidates locally');
    await h.click({action:'accept'});const accepted=h.project();
    assert.equal(accepted.joints.length,2);assert.equal(accepted.parts.length,3,'rebuilding never accumulates abandoned splits');
    assert.ok(accepted.joints.every(joint=>joint.angle===0),'trial movement does not become the accepted rest pose');
    const transforms=partTransforms(accepted);for(const joint of accepted.joints)assert.deepEqual(transformPoint(transforms[joint.parentId],joint.parentAnchor),transformPoint(transforms[joint.childId],joint.childAnchor));
    await h.click({action:'export-cut'});const cut=await h.downloads.at(-1).blob.text();
    assert.equal((cut.match(/data-cut="outline-and-holes"/g)||[]).length,accepted.parts.length,'each final piece exports its complete contour and pin holes');
    assert.match(cut,/Reinforcement tabs are united with each contour/);
    await h.click({action:'next-stage'});assert.deepEqual(primaryActions(h.root.innerHTML),['print']);await h.click({action:'print'});
    assert.match(h.printFrame.srcdoc,/rounded overlap on both parts/);assert.match(h.printFrame.srcdoc,/matching numbered holes/);
    await h.click({action:'undo'});assert.deepEqual(h.project(),before,'one undo restores the entire original before the plan');
    await h.click({action:'redo'});assert.deepEqual(h.project(),accepted);
  } finally {await h.close();}
});

test('joint diameter remains a reviewable choice through plan swaps and valid moves, and blocks a narrower size at a wider section',async()=>{
 const h=browserHarness();h.setPlanResponse(()=>({selectedIds:[]}));
 const sizeInput=()=>{const tag=h.root.innerHTML.match(/<input[^>]*data-overlap-size="plan"[^>]*>/)?.[0];assert.ok(tag,'the selected planned joint exposes a size control');return {id:tag.match(/data-overlap-joint="([^"]+)"/)[1],value:Number(tag.match(/value="([^"]+)"/)[1])};};
 try{
  await h.start('joint-size-plan');await h.settle();const project=createStudioProject();project.canvas={width:100,height:300};project.parts=[makePart('Stepped limb',[[0,0],[20,0],[20,100],[60,100],[60,300],[0,300]])];await h.openProject(project);const before=h.project();
  await h.click({action:'prepare-joints'});await h.click({action:'plan-add'});await h.planPoint(10,60);assert.equal(h.error(),'');const marker=h.planMarkers()[0];
  assert.match(h.root.innerHTML,/<details[^>]*joint-size[^>]*><summary>Joint size<\/summary>/);assert.match(h.root.innerHTML,/Pin hole：3 mm/);assert.deepEqual(primaryActions(h.root.innerHTML),['accept']);
  await h.change({dataset:{overlapSize:'plan',overlapJoint:sizeInput().id},value:'25'});assert.equal(h.error(),'');assert.equal(sizeInput().value,25);assert.deepEqual(h.project(),before);
  h.planInput(30);await h.click({action:'plan-swap'});assert.equal(sizeInput().value,25,'front/back rebuild retains the chosen physical diameter');
  await h.click({action:'plan-move'});await h.planPoint(10,80);assert.equal(h.error(),'');assert.equal(sizeInput().value,25);const location=h.planLocation(marker);
  await h.click({action:'plan-move'});await h.planPoint(30,180);assert.match(h.error(),/Adjust Joint size before moving/);assert.deepEqual(h.planLocation(marker),location,'an invalid smaller overlap cannot partially install the wider-section cut');assert.equal(sizeInput().value,25);
  await h.click({action:'plan-cancel'});await h.click({action:'dismiss-error'});await h.change({dataset:{overlapSize:'plan',overlapJoint:sizeInput().id},value:'1'});assert.ok(h.error());assert.equal(sizeInput().value,25);assert.deepEqual(h.project(),before);
  await h.click({action:'dismiss-error'});await h.click({action:'accept'});const accepted=h.project(),joint=accepted.joints[0];assert.equal(accepted.joints.length,1);assert.ok(Math.abs(joint.padRadius*2/unitsPerMm(accepted)-25)<1e-7);assert.equal(accepted.holeMm,3);assert.equal(joint.angle,0);assert.ok(accepted.parts.find(p=>p.id===joint.childId).z<accepted.parts.find(p=>p.id===joint.parentId).z);assert.equal(h.requests.length,1);
  await h.click({action:'undo'});assert.deepEqual(h.project(),before,'one undo restores the whole unaccepted source');
 }finally{await h.close();}
});

test('single-joint size review and accepted edits retain hole size, respect locks, and remain undoable',async()=>{
 const h=browserHarness();const reviewId=()=>h.root.innerHTML.match(/data-overlap-size="review" data-overlap-joint="([^"]+)"/)[1];
 try{
  await h.start('joint-size-review');await h.settle();const project=createStudioProject();project.canvas={width:100,height:240};project.parts=[makePart('Arm',[[0,0],[40,0],[40,240],[0,240]])];await h.openProject(project);const before=h.project();await h.click({action:'add-joint'});await h.point(20,120,before.parts[0].id);
  assert.match(h.root.innerHTML,/Both rounded ends overlap/);await h.change({dataset:{overlapSize:'review',overlapJoint:reviewId()},value:'60'});assert.equal(h.error(),'');h.reviewInput(35);await h.click({action:'joint-swap'});assert.equal(h.reviewAngle(),'35°');assert.match(h.root.innerHTML,/data-overlap-size="review"[^>]*value="60"/);assert.deepEqual(h.project(),before);
  await h.click({action:'accept'});const accepted=h.project(),joint=accepted.joints[0];assert.ok(Math.abs(joint.padRadius*2/unitsPerMm(accepted)-60)<1e-7);assert.equal(joint.angle,0);assert.equal(accepted.holeMm,3);assert.match(h.root.innerHTML,/data-overlap-joint=/,'accepted selected joints show their actual overlap');
  await h.change({dataset:{overlapSize:'part',overlapJoint:joint.id},value:'70'});const enlarged=h.project();assert.ok(Math.abs(enlarged.joints[0].padRadius*2/unitsPerMm(enlarged)-70)<1e-7);assert.equal(enlarged.holeMm,3);await h.click({action:'undo'});assert.deepEqual(h.project(),accepted);
  await h.click({action:'vertices'});h.key('ArrowRight',{dataset:{vertexIndex:'0'},tagName:'g'});assert.match(h.root.innerHTML,/Outline changed\. Check the joint size and movement before printing/);await h.click({action:'undo'});assert.deepEqual(h.project(),accepted);
  const locked=structuredClone(accepted);locked.parts.find(p=>p.id===joint.parentId).locked=true;await h.openProject(locked);await h.click({action:'select',id:joint.childId});const protectedProject=h.project();assert.match(h.root.innerHTML,/data-overlap-size="part"[^>]*disabled/);await h.change({dataset:{overlapSize:'part',overlapJoint:joint.id},value:'80'});assert.ok(h.error());assert.deepEqual(h.project(),protectedProject);assert.equal(h.requests.length,0);
 }finally{await h.close();}
});

test('front and back choices remain consistent through a multi-joint chain after later marker edits', async () => {
  const h=browserHarness();h.setPlanResponse(()=>({selectedIds:[]}));
  try {
    await h.start('joint-plan-chain-layers');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:300};project.parts=[makePart('Three-joint arm',[[0,0],[30,0],[30,300],[0,300]])];
    await h.openProject(project);const before=h.project();await h.click({action:'prepare-joints'});
    for(const y of [75,150,225]){await h.click({action:'plan-add'});await h.planPoint(15,y);}
    const ids=h.planMarkers();assert.equal(ids.length,3);assert.deepEqual(primaryActions(h.root.innerHTML),['accept']);
    for(const id of ids){await h.planPoint(...h.planLocation(id),{marker:id});await h.click({action:'plan-swap'});}
    assert.deepEqual(h.project(),before,'changing every overlap order remains a proposal');
    await h.planPoint(...h.planLocation(ids[2]),{marker:ids[2]});await h.click({action:'plan-move'});await h.planPoint(15,230);
    const first=h.planLocation(ids[0]);h.pointer('pointerdown',...first,{planCanvas:true,planMarker:ids[0],pointerId:94});h.pointer('pointermove',first[0],first[1]+5,{pointerId:94});h.pointer('pointerup',first[0],first[1]+5,{pointerId:94});
    assert.deepEqual(h.planMarkers(),ids);assert.deepEqual(primaryActions(h.root.innerHTML),['accept']);assert.deepEqual(h.project(),before);
    assert.match(h.planMarkup(),/data-overlap-layer="back"/);assert.match(h.planMarkup(),/data-overlap-layer="front"/);
    await h.click({action:'accept'});const accepted=h.project();assert.equal(accepted.parts.length,4);assert.equal(accepted.joints.length,3);
    const positions=accepted.joints.map(joint=>joint.parentAnchor[1]).sort((a,b)=>a-b);for(const [i,expected]of [80,150,230].entries())assert.ok(Math.abs(positions[i]-expected)<1e-6);
    for(const joint of accepted.joints){const parent=accepted.parts.find(part=>part.id===joint.parentId),child=accepted.parts.find(part=>part.id===joint.childId);assert.ok(child.z<parent.z,`the moving piece at ${joint.parentAnchor[1]} remains behind its parent after the chain is rebuilt`);}
    await h.click({action:'undo'});assert.deepEqual(h.project(),before);
  } finally {await h.close();}
});

test('automatic joint review zooms to the selected pin without changing its trial movement or accepted construction', async () => {
  const h=browserHarness();h.setPlanResponse(()=>({selectedIds:[]}));
  const viewBox=()=>h.planMarkup().match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const construction=()=>Array.from(h.planMarkup().matchAll(/<g transform="matrix\([^"]+\)">|<path d="[^"]+"/g),match=>match[0]);
  try {
    await h.start('joint-plan-closeup');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:300};project.parts=[makePart('Long arm',[[0,0],[30,0],[30,300],[0,300]])];
    await h.openProject(project);const before=h.project();await h.click({action:'prepare-joints'});
    for(const y of [75,225]){await h.click({action:'plan-add'});await h.planPoint(15,y);}
    const ids=h.planMarkers(),pin=h.planLocation(ids[0]);assert.equal(ids.length,2);
    await h.planPoint(...pin,{marker:ids[0]});h.planInput(32);
    const wholeBox=viewBox(),trialConstruction=construction();
    assert.match(h.root.innerHTML,/data-action="plan-view"[^>]*>Zoom to this joint/);
    await h.click({action:'plan-view'});const closeupBox=viewBox();
    assert.ok(closeupBox[3]<wholeBox[3],'the selected pin has a closer inspection view');
    assert.ok(Math.abs(closeupBox[0]+closeupBox[2]/2-pin[0])<1e-6);assert.ok(Math.abs(closeupBox[1]+closeupBox[3]/2-pin[1])<1e-6,'the close-up centers the selected pin rather than another joint');
    assert.match(h.root.innerHTML,/<output id="plan-angle-output">32°<\/output>/);
    assert.match(h.root.innerHTML,/data-action="plan-view"[^>]*>See whole puppet/);
    assert.deepEqual(construction(),trialConstruction,'zoom changes framing without changing proposed contours or trial transforms');
    assert.deepEqual(h.project(),before,'the accepted character remains untouched during inspection');
    await h.click({action:'plan-view'});assert.deepEqual(viewBox(),wholeBox);assert.deepEqual(construction(),trialConstruction);
    await h.click({action:'plan-view'});assert.deepEqual(viewBox(),closeupBox);
    h.planInput(-18);assert.deepEqual(viewBox(),closeupBox,'trial movement keeps the pin centered at a stable zoom');assert.notDeepEqual(construction(),trialConstruction);
    await h.click({action:'plan-view'});assert.match(h.root.innerHTML,/<output id="plan-angle-output">-18°<\/output>/);
    await h.click({action:'plan-view'});await h.click({action:'plan-move'});
    assert.match(h.root.innerHTML,/data-action="plan-view"[^>]*>Zoom to this joint/,'moving a marker returns to the whole character for placement');
    await h.click({action:'plan-cancel'});h.planInput(21);await h.click({action:'plan-view'});
    assert.deepEqual(h.project(),before);assert.equal(h.requests.length,1,'inspection and local marker changes require no additional AI request');
    await h.click({action:'accept'});const accepted=h.project();
    assert.equal(accepted.parts.length,3);assert.equal(accepted.joints.length,2);assert.ok(accepted.joints.every(joint=>joint.angle===0),'acceptance preserves the unposed construction rather than the trial angle');
    assert.deepEqual(accepted.joints.map(joint=>joint.parentAnchor[1]).sort((a,b)=>a-b),[75,225]);
    await h.click({action:'undo'});assert.deepEqual(h.project(),before,'one undo restores the character before the joint plan');
  } finally {await h.close();}
});

test('joint review keeps touch targets, motion and placement state when the viewport changes', async () => {
  const h=browserHarness();h.setPlanResponse(candidates=>({selectedIds:[candidates[0].id]}));
  const viewBox=()=>h.planMarkup().match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const construction=()=>Array.from(h.planMarkup().matchAll(/<g transform="matrix\([^"]+\)">|<path d="[^"]+"/g),match=>match[0]);
  const hitDiameter=(width,height)=>{const box=viewBox(),radius=Number(h.planMarkup().match(/class="plan-marker[^>]*><circle[^>]* r="([^"]+)"/)[1]);return radius*2/Math.max(box[2]/width,box[3]/height);};
  try {
    await h.start('joint-plan-responsive-targets');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:300};project.parts=[makePart('Long arm',[[0,0],[30,0],[30,300],[0,300]])];
    await h.openProject(project);const before=h.project();await h.click({action:'prepare-joints'});
    const ids=h.planMarkers();assert.equal(ids.length,1);h.planInput(31);await h.click({action:'plan-view'});
    const box=viewBox(),trial=construction(),pin=h.planLocation(ids[0]);h.focusPlanMarker(ids[0]);
    for(const [width,height]of [[366,320],[820,420],[320,300]]){
      h.resizeCanvas(width,height);
      assert.ok(Math.abs(hitDiameter(width,height)-44)<1e-8,'the dot remains a 44 CSS-pixel target after resizing');
      assert.deepEqual(viewBox(),box,'responsive sizing keeps the selected-joint close-up');
      assert.deepEqual(construction(),trial,'resizing cannot change contours or trial motion');
      assert.deepEqual(h.planLocation(ids[0]),pin);assert.deepEqual(h.project(),before);
      assert.match(h.root.innerHTML,/<output id="plan-angle-output">31°<\/output>/);
      assert.equal(h.focusedSelectors.at(-1),`[data-plan-marker="${ids[0]}"]`,'keyboard focus returns to the same dot');
    }
    await h.click({action:'plan-move'});h.resizeCanvas(366,320);
    assert.match(h.root.innerHTML,/Tap the new position for this dot/,'rotation does not exit placement mode');
    await h.planPoint(15,150);assert.equal(h.planMarkers().length,1);assert.equal(h.error(),'');
    await h.click({action:'accept'});assert.equal(h.project().joints.length,1);assert.equal(h.project().joints[0].angle,0);
    assert.equal(h.requests.length,1,'resizing and marker correction stay local');
  } finally {await h.close();}
});

test('AI connection errors stay inside the dialog and Escape preserves the joint trial underneath', async () => {
  const h=browserHarness();h.setPlanResponse(candidates=>({selectedIds:[candidates[0].id]}));
  const modal=()=>h.root.innerHTML.match(/<section class="settings-card"[\s\S]*?<\/section>/)?.[0]||'';
  try {
    await h.start('joint-plan-settings');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:240};project.parts=[makePart('Long arm',[[0,0],[30,0],[30,240],[0,240]])];
    await h.openProject(project);const before=h.project();await h.click({action:'prepare-joints'});h.planInput(27);await h.click({action:'plan-view'});
    const closeupBox=h.planMarkup().match(/viewBox="([^"]+)"/)[1];await h.click({action:'settings'});
    assert.match(modal(),/role="dialog"/);assert.equal(h.focusedSelectors.at(-1),'#relay-url');
    let connectionChecks=0;h.setGetResponse(()=>{connectionChecks++;return {ok:true,status:200,json:async()=>({version:2,text:true,vision:false,imageGeneration:false,status:'Connected.'})};});
    for(const value of ['invalid','http://relay.example/api/studio']){
      h.setRelayUrl(value);await h.click({action:'save-endpoint'});
      assert.match(modal(),/role="alert">Use an HTTPS protected relay URL\./,'malformed and insecure URLs receive readable guidance inside the active dialog');
      assert.doesNotMatch(modal(),/Invalid URL|construct.*URL/);assert.deepEqual(h.project(),before);
      assert.equal(connectionChecks,0,'invalid endpoints are rejected before attempting a connection');
      assert.equal(h.preferences.has('bnta-studio-endpoint'),false);
    }
    h.setRelayUrl('https://relay.example/api/studio');await h.click({action:'save-endpoint'});
    assert.equal(connectionChecks,1);assert.equal(h.preferences.get('bnta-studio-endpoint'),'https://relay.example/api/studio');
    assert.doesNotMatch(modal(),/role="alert"/,'a corrected endpoint clears its stale validation error');
    h.setRelayUrl('invalid');await h.click({action:'save-endpoint'});
    assert.equal(h.preferences.get('bnta-studio-endpoint'),'https://relay.example/api/studio','malformed input cannot replace the saved endpoint');
    assert.match(modal(),/id="relay-url"[^>]*value="https:\/\/relay.example\/api\/studio"/,'the active endpoint also stays valid after rejection');
    assert.equal(connectionChecks,1);assert.deepEqual(h.project(),before);
    assert.equal(h.key('Escape',{tagName:'INPUT'}),true);assert.equal(modal(),'');
    assert.equal(h.focusedSelectors.at(-1),'#ai-status-button','closing returns focus to the connection control');
    assert.match(h.root.innerHTML,/<output id="plan-angle-output">27°<\/output>/,'Escape dismisses only the dialog without resetting the trial');
    assert.equal(h.planMarkup().match(/viewBox="([^"]+)"/)[1],closeupBox);assert.deepEqual(h.project(),before);
    await h.click({action:'dismiss-error'});assert.equal(h.error(),'');
    await h.click({action:'accept'});assert.ok(h.project().joints.every(joint=>joint.angle===0));
    await h.click({action:'language'});const accepted=h.project();await h.click({action:'settings'});
    h.setRelayUrl('invalid');await h.click({action:'save-endpoint'});
    assert.match(modal(),/role="alert">请使用 HTTPS 中继地址。/,'malformed URL guidance follows the interface language');
    assert.equal(h.preferences.get('bnta-studio-endpoint'),'https://relay.example/api/studio');assert.equal(connectionChecks,1);assert.deepEqual(h.project(),accepted);
    h.key('Escape',{tagName:'INPUT'});await h.click({action:'dismiss-error'});await h.click({action:'step',step:'make'});await h.click({action:'step',step:'refine'});
    assert.equal(h.error(),'','dismissed endpoint errors do not reappear when changing stages');assert.equal(connectionChecks,1);assert.deepEqual(h.project(),accepted);
  } finally {await h.close();}
});

test('moving and dragging an automatic dot recomputes its cut direction for a differently oriented limb', async () => {
  const h=browserHarness();h.setPlanResponse(candidates=>({selectedIds:[candidates.find(marker=>marker.angleDegrees===90&&marker.point[0]>60).id]}));
  try {
    await h.start('joint-plan-cut-direction');await h.settle();
    const project=createStudioProject();project.canvas={width:180,height:200};project.heightMm=180;project.parts=[makePart('Bent limb',[[0,0],[30,0],[30,150],[150,150],[150,180],[0,180]])];
    await h.openProject(project);const before=h.project();
    for(const mode of ['move','drag']){
      await h.click({action:'prepare-joints'});const id=h.planMarkers()[0],start=h.planLocation(id);assert.ok(start[0]>60&&start[1]>150);
      if(mode==='move'){await h.click({action:'plan-move'});await h.planPoint(15,90);}
      else{h.pointer('pointerdown',...start,{planCanvas:true,planMarker:id,pointerId:95});h.pointer('pointermove',15,90,{pointerId:95});h.pointer('pointerup',15,90,{pointerId:95});}
      assert.deepEqual(h.planMarkers(),[id]);assert.deepEqual(h.planLocation(id),[15,90]);assert.deepEqual(primaryActions(h.root.innerHTML),['accept'],`${mode} chooses a new seam across the vertical limb`);assert.doesNotMatch(h.root.innerHTML,/A moving piece could not be separated here/);assert.deepEqual(h.project(),before);
      await h.click({action:'accept'});const accepted=h.project();assert.equal(accepted.joints.length,1);assert.deepEqual(accepted.joints[0].parentAnchor,[15,90]);
      await h.click({action:'undo'});assert.deepEqual(h.project(),before);
    }
  } finally {await h.close();}
});

test('a failed planner offers local suggestions while cancellation and New discard late selections', async () => {
  const h=browserHarness();
  try {
    await h.start('joint-plan-failure-and-reset');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:240};project.parts=[makePart('Long leg',[[0,0],[30,0],[30,240],[0,240]])];
    await h.openProject(project);const before=h.project();
    h.setPlanPostResponse(()=>({ok:false,status:503,json:async()=>({error:'temporarily unavailable'})}));
    await h.click({action:'prepare-joints'});
    assert.equal(h.error(),'');assert.ok(h.planMarkers().length>0);assert.match(h.root.innerHTML,/outline-based suggestions/);assert.deepEqual(h.project(),before);
    await h.click({action:'reject'});assert.deepEqual(h.project(),before);assert.equal(h.planMarkup(),'');
    let resolveOld;h.setPlanPostResponse(candidates=>new Promise(resolve=>{resolveOld=()=>resolve({ok:true,status:200,json:async()=>({selectedIds:[candidates[0].id]})});}));
    const pending=h.click({action:'prepare-joints'});await h.settle();assert.equal(typeof resolveOld,'function');
    await h.click({action:'new-project'});const fresh=h.project();resolveOld();await pending;await h.settle();
    assert.deepEqual(h.project(),fresh);assert.equal(fresh.parts.length,0);assert.equal(h.planMarkup(),'');assert.equal(h.error(),'');
    await h.openProject(project);const reopened=h.project();let resolveCancelled;
    h.setPlanPostResponse(candidates=>new Promise(resolve=>{resolveCancelled=()=>resolve({ok:true,status:200,json:async()=>({selectedIds:[candidates[0].id]})});}));
    const cancelled=h.click({action:'prepare-joints'});await h.settle();await h.click({action:'cancel-ai'});resolveCancelled();await cancelled;await h.settle();
    assert.deepEqual(h.project(),reopened);assert.equal(h.planMarkup(),'','cancellation cannot quietly install the local fallback or late AI result');
    assert.ok(h.storageOperations.every(operation=>!['put','open'].includes(operation.kind)),'joint drafts never create saved sessions');
  } finally {await h.close();}
});

test('switching from pending AI planning to manual joint placement or drawing preserves the manual work', async () => {
  const h=browserHarness();
  try {
    await h.start('pending-plan-manual-tools');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:240};project.parts=[makePart('Long arm',[[0,0],[30,0],[30,240],[0,240]])];
    await h.openProject(project);const before=h.project(),partId=before.parts[0].id;
    let complete;h.setPlanPostResponse(candidates=>new Promise(resolve=>{complete=()=>resolve({ok:true,status:200,json:async()=>({selectedIds:[candidates[0].id]})});}));
    const pendingJoint=h.click({action:'prepare-joints'});await h.settle();assert.equal(typeof complete,'function');
    await h.click({action:'add-joint'});await h.point(15,120,partId);assert.match(h.root.innerHTML,/data-review-angle/);
    complete();await pendingJoint;await h.settle();
    assert.equal(h.planMarkup(),'');assert.match(h.root.innerHTML,/data-review-angle/,'the late automatic plan cannot replace the manual joint review');assert.deepEqual(h.project(),before);
    await h.click({action:'accept'});assert.equal(h.project().joints.length,1);await h.click({action:'undo'});assert.deepEqual(h.project(),before);
    complete=null;const pendingDrawing=h.click({action:'prepare-joints'});await h.settle();assert.equal(typeof complete,'function');
    await h.click({action:'draw'});for(const point of [[60,10],[80,10],[70,50]])await h.point(...point);
    complete();await pendingDrawing;await h.settle();
    assert.equal(h.planMarkup(),'');assert.match(h.root.innerHTML,/data-action="finish-part"/,'the late automatic plan cannot discard a drawing in progress');
    await h.click({action:'finish-part'});assert.equal(h.project().parts.length,2);assert.equal(h.project().joints.length,0);assert.equal(h.error(),'');
  } finally {await h.close();}
});

test('detecting image dots again preserves a moved marker instead of duplicating its identity', async () => {
  const h=browserHarness();h.setPlanResponse(()=>({selectedIds:[]}));
  const raster=rasterFixture({rectangles:[{x:44,y:10,w:8,h:80,color:[180,70,25,255]}]});
  for(let y=48;y<=52;y++)for(let x=46;x<=50;x++)if(Math.hypot(x-48,y-50)<=2)raster.data.set([255,0,255,255],(y*100+x)*4);
  const dataUrl=h.setRaster(raster);
  try {
    await h.start('redetect-moved-image-marker');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:100};project.assets=[{id:'marked-art',name:'Marked arm',mime:'image/png',width:100,height:100,dataUrl}];project.conceptAssetId='marked-art';project.parts=[makePart('Marked arm',[[44,10],[52,10],[52,90],[44,90]],'marked-art')];
    await h.openProject(project);const before=h.project();await h.click({action:'prepare-joints'});
    assert.equal(h.planMarkers().length,1);const id=h.planMarkers()[0];assert.match(id,/^image-magenta-/);
    await h.click({action:'plan-move'});await h.planPoint(48,72);const moved=h.planLocation(id);assert.deepEqual(moved,[48,72]);
    await h.click({action:'plan-detect'});
    const renderedMarkers=Array.from(h.planMarkup().matchAll(/data-plan-marker="([^"]+)"/g),match=>match[1]);
    assert.deepEqual(renderedMarkers,[id],'deduplication uses the original image marker ID after its position changes');
    assert.deepEqual(h.planLocation(id),moved);assert.deepEqual(primaryActions(h.root.innerHTML),['accept']);assert.deepEqual(h.project(),before);
    await h.click({action:'accept'});assert.equal(h.project().joints.length,1);assert.equal(h.project().parts.length,2);assert.equal(h.project().joints[0].parentAnchor[1],72);
  } finally {await h.close();}
});

test('rotated-part keyboard and drag movement begin at the snapped dot in world coordinates', async () => {
  const h=browserHarness();h.setPlanResponse(()=>({selectedIds:[]}));
  try {
    await h.start('rotated-snapped-plan-marker');await h.settle();
    const project=createStudioProject();project.canvas={width:320,height:100};project.heightMm=35;project.parts=[{...makePart('Horizontal arm',[[0,0],[30,0],[30,240],[0,240]]),rotation:90,x:300,y:20}];
    await h.openProject(project);const before=h.project(),partId=before.parts[0].id,matrix=partTransforms(before)[partId];await h.click({action:'prepare-joints'});
    assert.equal(h.planMarkers().length,0);await h.click({action:'plan-add'});await h.planPoint(...transformPoint(matrix,[13,120]));
    const id=h.planMarkers()[0],snapped=h.planLocation(id),center=transformPoint(matrix,[15,120]);
    assert.ok(Math.hypot(snapped[0]-center[0],snapped[1]-center[1])<1e-6,'the visible marker snaps to the center of the cut rather than retaining the off-center tap');
    assert.equal(h.key('ArrowRight',{planMarker:id},{shiftKey:true}),true);
    const nudged=h.planLocation(id),distance=2*unitsPerMm(before);
    assert.ok(Math.abs(nudged[0]-snapped[0]-distance)<1e-6,'Right moves right on the screen despite a 90-degree source rotation');
    assert.ok(Math.abs(nudged[1]-snapped[1])<1e-6,'the first nudge starts at the snapped point, without jumping to the original off-center tap');
    h.pointer('pointerdown',nudged[0]+1,nudged[1]+1,{planCanvas:true,planMarker:id,pointerId:91});h.pointer('pointermove',nudged[0]-9,nudged[1]+1,{pointerId:91});h.pointer('pointerup',nudged[0]-9,nudged[1]+1,{pointerId:91});
    const dragged=h.planLocation(id);assert.ok(Math.abs(dragged[0]-nudged[0]+10)<1e-6);assert.ok(Math.abs(dragged[1]-nudged[1])<1e-6);assert.deepEqual(h.project(),before);
    await h.click({action:'accept'});const accepted=h.project(),joint=accepted.joints[0],pivot=transformPoint(partTransforms(accepted)[joint.parentId],joint.parentAnchor);
    assert.ok(Math.hypot(pivot[0]-dragged[0],pivot[1]-dragged[1])<1e-6);assert.equal(accepted.joints.length,1);
  } finally {await h.close();}
});

test('joint dots drag with a stable pointer offset and support cancellation and keyboard adjustment', async () => {
  const h=browserHarness();h.setPlanResponse(candidates=>({selectedIds:[candidates[0].id]}));
  try {
    await h.start('joint-marker-inputs');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:240};project.parts=[makePart('Long tail',[[0,0],[30,0],[30,240],[0,240]])];
    await h.openProject(project);const before=h.project();await h.click({action:'prepare-joints'});
    const id=h.planMarkers()[0],start=h.planLocation(id),page=h.root.innerHTML;
    assert.match(h.root.innerHTML,/>1 joint ready<\/span>/);assert.doesNotMatch(h.root.innerHTML,/1 joints ready/);
    assert.equal(h.pointer('pointerdown',start[0]+2,start[1]+2,{planCanvas:true,planMarker:id,pointerId:71}),true);
    assert.equal(h.captures.at(-1),71);h.pointer('pointermove',start[0]+2,start[1]+32,{pointerId:71});
    assert.equal(h.root.innerHTML,page,'dragging preserves the captured canvas until release');assert.deepEqual(h.project(),before);
    h.pointer('pointerup',start[0]+2,start[1]+32,{pointerId:71});assert.equal(h.releases.at(-1),71);
    const moved=h.planLocation(id);assert.deepEqual(moved,[start[0],start[1]+30],'grabbing a larger hit area preserves the initial pointer offset');
    await h.planPoint(...moved,{marker:id});assert.deepEqual(h.planMarkers(),[id],'the click generated by pointer release does not add or duplicate a dot');
    h.pointer('pointerdown',...moved,{planCanvas:true,planMarker:id,pointerId:72});h.pointer('pointermove',moved[0],moved[1]+20,{pointerId:72});h.pointer('pointercancel',moved[0],moved[1]+20,{pointerId:72});
    assert.equal(h.releases.at(-1),72);assert.deepEqual(h.planLocation(id),moved,'pointer cancellation discards the drag');
    h.pointer('pointerdown',...moved,{planCanvas:true,planMarker:id,pointerId:73});h.pointer('pointermove',moved[0],moved[1]-20,{pointerId:73});h.key('Escape');h.pointer('pointerup',moved[0],moved[1]-20,{pointerId:73});
    assert.equal(h.releases.at(-1),73);assert.deepEqual(h.planLocation(id),moved,'Escape cancels the drag before its later pointerup');
    assert.equal(h.key('Enter',{planMarker:id}),true);assert.equal(h.key('ArrowDown',{planMarker:id},{shiftKey:true}),true);
    const nudged=h.planLocation(id);assert.ok(Math.abs(nudged[1]-moved[1]-2*unitsPerMm(before))<1e-6);assert.equal(nudged[0],moved[0]);assert.deepEqual(h.project(),before);
    assert.equal(h.key('Delete',{planMarker:id}),true);assert.deepEqual(h.planMarkers(),[]);assert.deepEqual(primaryActions(h.root.innerHTML),['plan-add']);assert.doesNotMatch(h.root.innerHTML,/Drag dots to adjust|No suitable automatic joints found/);assert.match(h.root.innerHTML,/Add your first movement point/);assert.match(h.root.innerHTML,/>0 joints ready<\/span>/);
    await h.click({action:'reject'});assert.deepEqual(h.project(),before);assert.equal(h.requests.length,1,'marker interaction never starts another AI request');
  } finally {await h.close();}
});

test('an empty movement plan leads to adding a point while a still puppet stays an explicit option', async () => {
  const h=browserHarness();h.setPlanResponse(()=>({selectedIds:[]}));
  try {
    await h.start('empty-plan-recovery');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:240};project.parts=[makePart('Long tail',[[0,0],[30,0],[30,240],[0,240]])];
    await h.openProject(project);const before=h.project();await h.click({action:'prepare-joints'});
    assert.deepEqual(h.planMarkers(),[]);assert.deepEqual(primaryActions(h.root.innerHTML),['plan-add']);
    assert.doesNotMatch(h.root.innerHTML,/Drag dots to adjust|No suitable automatic joints found/);assert.match(h.root.innerHTML,/Add your first movement point/);assert.match(h.root.innerHTML,/>0 joints ready<\/span>/);
    assert.match(h.root.innerHTML,/<button[^>]*class="text-button"[^>]*data-action="plan-still"/);
    await h.click({action:'plan-add'});assert.match(h.root.innerHTML,/Tap the character to add a joint dot/);await h.planPoint(15,120);
    assert.equal(h.planMarkers().length,1);assert.deepEqual(primaryActions(h.root.innerHTML),['accept']);assert.deepEqual(h.project(),before);assert.match(h.root.innerHTML,/>1 joint ready<\/span>/);
    await h.click({action:'accept'});assert.equal(h.project().joints.length,1);await h.click({action:'undo'});assert.deepEqual(h.project(),before);
    await h.click({action:'prepare-joints'});await h.click({action:'plan-still'});assert.equal(h.project().parts.length,1);assert.equal(h.project().joints.length,0);assert.match(h.root.innerHTML,/Make your puppet/);
  } finally {await h.close();}
});

test('a generated character retains its exact custom request through cleanup and joint planning without committing rejected ideas', async () => {
  const h=browserHarness();h.setGetResponse(legacyImageStatus);
  const generated=h.setRaster(rasterFixture({rectangles:[{x:40,y:10,w:8,h:80,color:[180,70,25,255]}]}));
  h.setResponse(()=>({dataUrl:generated,model:'configured-image-model',kind:'reference'}));
  try {
    await h.start('generated-image-auto-construction');await h.settle();
    const prompt='A long narrow puppet arm with two bending points: one elbow and one wrist. Keep the shoulder fixed. 保留手腕活动。';
    await h.change({dataset:{field:'brief.kind'},value:'human'});h.input('create-prompt',prompt);
    await h.click({action:'undo'});const before=h.project();
    assert.equal(before.brief.keywords,'','undo restores the accepted brief before the setting change');
    assert.ok(h.root.innerHTML.includes(prompt),'the visible creation request survives the design undo');
    await h.click({action:'generate-image'});assert.deepEqual(h.project(),before,'generation keeps the current brief unchanged until review');
    await h.click({action:'reject'});assert.deepEqual(h.project(),before,'rejecting new artwork cannot install its replacement brief');
    await h.click({action:'generate-image'});
    assert.match(h.root.innerHTML,/Is this your character\?/);assert.equal(h.project().assets.length,0);
    await h.click({action:'accept'});
    assert.equal(h.project().brief.keywords,prompt,'accepted artwork retains the exact request used to generate it');
    assert.equal(h.project().assets.length,1);assert.equal(h.project().parts.length,0);assert.match(h.root.innerHTML,/Remove the background/,'using the generated artwork starts its cleanup review');
    await h.click({action:'accept'});
    assert.equal(h.error(),'');assert.equal(h.project().parts.length,1);assert.equal(h.project().joints.length,0);assert.match(h.root.innerHTML,/id="plan-canvas"/);
    const count=h.planMarkers().length;assert.ok(count>0);const cleaned=h.project();
    assert.equal(cleaned.brief.keywords,prompt,'character cleanup preserves movement requirements');
    const plans=h.requests.filter(request=>request.planning);assert.equal(h.requests.length,3);assert.equal(plans.length,1,'the accepted character starts one planning request after the rejected generation');
    const planningContext=JSON.parse(plans[0].body.messages.findLast(message=>message.role==='user').content);
    assert.equal(planningContext.scene.studentRequest,prompt,'joint selection receives the original movement request verbatim');
    assert.equal(planningContext.scene.studio.brief.keywords,prompt);
    await h.click({action:'accept'});assert.equal(h.project().joints.length,count);assert.equal(h.project().parts.length,count+1);
    await h.click({action:'undo'});assert.deepEqual(h.project(),cleaned);await h.settle();
    assert.equal(h.planMarkup(),'');assert.equal(h.requests.length,3,'undo and render cannot start planning again');
  } finally {await h.close();}
});

test('one bend tap previews a joint and movement without committing the trial pose', async () => {
  const h=browserHarness();
  try {
    await h.start('one-tap-joint');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:240};project.parts=[makePart('Long arm',[[0,0],[40,0],[40,240],[0,240]])];
    await h.openProject(project);const before=h.project(),partId=before.parts[0].id;
    await h.click({action:'add-joint'});
    assert.doesNotMatch(h.root.innerHTML,/0\/2 points placed|data-action="preview-split"/,'the default joint tool does not require a two-point cut');
    await h.point(20,120,partId);
    assert.equal(h.error(),'');assert.match(h.root.innerHTML,/id="review-heading"/);
    assert.match(h.root.innerHTML,/data-review-angle/,'movement can be tried before accepting the joint');
    assert.deepEqual(primaryActions(h.root.innerHTML),['accept'],'review offers one primary decision');
    assert.deepEqual(h.project(),before,'splitting and matching holes remain an unaccepted proposal');
    const restingPreview=h.reviewMarkup(),restingPage=h.root.innerHTML;
    h.reviewInput(35);
    assert.notEqual(h.reviewMarkup(),restingPreview,'the trial angle visibly updates the review');
    assert.equal(h.reviewAngle(),'35°');
    assert.equal(h.root.innerHTML,restingPage,'movement preview keeps the slider DOM stable for dragging');
    assert.deepEqual(h.project(),before,'trying the movement cannot change accepted construction');
    const closeupBox=h.reviewMarkup().match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    await h.click({action:'joint-view'});
    const wholeBox=h.reviewMarkup().match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    assert.notDeepEqual(wholeBox,closeupBox,'the review can switch from the joint detail to the whole puppet');
    assert.ok(wholeBox[3]>closeupBox[3],'the initial close-up shows a smaller area around the joint');
    assert.equal(h.reviewAngle(),'35°');assert.deepEqual(h.project(),before,'changing the view preserves the trial angle and accepted project');
    await h.click({action:'joint-view'});
    assert.deepEqual(h.reviewMarkup().match(/viewBox="([^"]+)"/)[1].split(' ').map(Number),closeupBox,'switching back restores the same joint detail');
    assert.equal(h.reviewAngle(),'35°');assert.deepEqual(h.project(),before);
    await h.click({action:'accept'});
    const accepted=h.project(),joint=accepted.joints[0];
    assert.equal(accepted.parts.length,2);assert.equal(accepted.joints.length,1);
    assert.equal(joint.angle,0,'acceptance keeps the construction rest angle rather than the temporary trial pose');
    assert.deepEqual(joint.parentAnchor,joint.childAnchor,'the two new parts share their pin center');
    assert.ok(accepted.parts.find(p=>p.id===joint.childId).z>accepted.parts.find(p=>p.id===joint.parentId).z,'the moving piece starts in front of the body');
    assert.match(h.root.innerHTML,/data-action="add-joint"/,'another joint remains easy to add');
    await h.click({action:'undo'});assert.deepEqual(h.project(),before,'one undo reverses the whole accepted joint');
    await h.click({action:'redo'});assert.deepEqual(h.project(),accepted);
    assert.equal(h.requests.length,0,'joint placement and movement review need no AI request');
  } finally {await h.close();}
});

test('joint layer changes and repicking stay in review until one accepted edit', async () => {
  const h=browserHarness();
  try {
    await h.start('joint-review-adjustments');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:240};project.parts=[makePart('Long leg',[[0,0],[40,0],[40,240],[0,240]])];
    await h.openProject(project);const before=h.project(),partId=before.parts[0].id;
    await h.click({action:'add-joint'});await h.point(20,120,partId);
    assert.match(h.root.innerHTML,/data-action="joint-swap"/);assert.match(h.root.innerHTML,/data-action="joint-repick"/);
    const frontPreview=h.root.innerHTML;await h.click({action:'joint-swap'});
    assert.notEqual(h.root.innerHTML,frontPreview,'swapping overlap order changes its review');
    assert.deepEqual(h.project(),before,'layer changes do not leak into accepted pieces');
    h.reviewInput(-25);await h.click({action:'joint-repick'});
    assert.doesNotMatch(h.root.innerHTML,/id="review-heading"|data-review-angle/,'repicking dismisses the old review');
    assert.deepEqual(h.project(),before);
    await h.point(20,180,partId);
    assert.equal(h.error(),'');assert.match(h.root.innerHTML,/data-review-angle/,'the next tap makes a fresh joint proposal');
    await h.click({action:'joint-swap'});await h.click({action:'accept'});
    const accepted=h.project(),joint=accepted.joints[0],parent=accepted.parts.find(p=>p.id===joint.parentId),child=accepted.parts.find(p=>p.id===joint.childId);
    assert.equal(accepted.joints.length,1);assert.equal(joint.angle,0,'a repick resets the earlier trial pose');
    assert.ok(Math.abs(joint.parentAnchor[1]-180)<1e-6,'the earlier bend point is discarded');
    assert.ok(child.z<parent.z,'the accepted overlap order places the moving piece behind the body');
    await h.click({action:'undo'});assert.deepEqual(h.project(),before,'repicks and layer swaps add no extra undo entries');
  } finally {await h.close();}
});

test('joining existing pieces uses two actual hits and reviews the automatic pin position', async () => {
  const h=browserHarness();
  try {
    await h.start('two-piece-joint');await h.settle();
    const project=createStudioProject();project.canvas={width:180,height:240};project.parts=[makePart('Body',[[0,0],[40,0],[40,140],[0,140]]),makePart('Moving arm',[[0,130],[40,130],[40,240],[0,240]]),makePart('Separate prop',[[100,60],[130,60],[130,100],[100,100]])];
    await h.openProject(project);const before=h.project(),[parent,child,prop]=before.parts;
    await h.click({action:'select',id:prop.id});await h.click({action:'join-pieces'});
    await h.point(20,80,parent.id);
    assert.doesNotMatch(h.root.innerHTML,/id="review-heading"/,'the first piece alone does not create a joint');
    assert.deepEqual(h.project(),before);
    await h.point(20,200,child.id);
    assert.equal(h.error(),'');assert.match(h.root.innerHTML,/id="review-heading"/);assert.match(h.root.innerHTML,/data-review-angle/);
    assert.deepEqual(h.project(),before,'automatic positioning remains reviewable');
    h.reviewInput(30);await h.click({action:'accept'});
    const accepted=h.project(),joint=accepted.joints[0],transforms=partTransforms(accepted);
    assert.equal(accepted.parts.length,3);assert.equal(accepted.joints.length,1);
    assert.equal(joint.parentId,parent.id);assert.equal(joint.childId,child.id,'the second tapped piece wins over stale selection');
    assert.equal(joint.angle,0);
    assert.deepEqual(accepted.parts.find(p=>p.id===prop.id),prop,'an unrelated selected prop stays untouched');
    assert.deepEqual(transformPoint(transforms[parent.id],joint.parentAnchor),transformPoint(transforms[child.id],joint.childAnchor),'both holes align in the assembled puppet');
    assert.notDeepEqual(joint.parentAnchor,[20,80]);assert.notDeepEqual(joint.childAnchor,[20,200],'piece taps select pieces rather than requiring matching anchor placement');
    await h.click({action:'undo'});assert.deepEqual(h.project(),before);
    await h.click({action:'join-pieces'});
    assert.equal(h.key('Enter',{partId:parent.id}),true,'Enter selects the first canvas piece for joining');
    assert.doesNotMatch(h.root.innerHTML,/id="review-heading"/);assert.deepEqual(h.project(),before);
    assert.equal(h.key('Enter',{partId:child.id}),true,'Enter selects the second piece without cancelling the join tool');
    assert.equal(h.error(),'');assert.match(h.root.innerHTML,/data-review-angle/);assert.deepEqual(h.project(),before,'keyboard joining also waits for review');
    await h.click({action:'accept'});
    const keyboardJoint=h.project().joints[0];
    assert.equal(h.project().joints.length,1);assert.equal(keyboardJoint.parentId,parent.id);assert.equal(keyboardJoint.childId,child.id);
    assert.deepEqual(keyboardJoint.parentAnchor,joint.parentAnchor);assert.deepEqual(keyboardJoint.childAnchor,joint.childAnchor,'keyboard and pointer routes suggest the same geometry');
    await h.click({action:'undo'});assert.deepEqual(h.project(),before,'keyboard acceptance is also one undo operation');
    assert.equal(h.requests.length,0);
  } finally {await h.close();}
});

test('locked pieces reject joint placement and reopening discards a pending joint review', async () => {
  const h=browserHarness();
  try {
    await h.start('joint-review-session-reset');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:240};project.parts=[makePart('Long arm',[[0,0],[40,0],[40,240],[0,240]])];project.parts[0].locked=true;
    await h.openProject(project);const locked=h.project(),partId=locked.parts[0].id;
    await h.click({action:'add-joint'});await h.point(20,120,partId);
    assert.deepEqual(h.project(),locked,'the easy tool respects the existing lock');
    assert.doesNotMatch(h.root.innerHTML,/data-review-angle/);
    project.parts[0].locked=false;await h.openProject(project);const before=h.project();
    await h.click({action:'add-joint'});await h.point(20,120,partId);h.reviewInput(40);await h.click({action:'joint-swap'});
    assert.match(h.root.innerHTML,/data-review-angle/);assert.deepEqual(h.project(),before);
    await h.pageShow(true);
    assert.equal(h.project().parts.length,0);assert.equal(h.project().joints.length,0);
    assert.doesNotMatch(h.root.innerHTML,/data-review-angle|id="joint-preview"/,'restoring a closed page starts a fresh session');
    await h.openProject(project);await h.click({action:'add-joint'});await h.point(20,160,partId);await h.click({action:'accept'});
    const accepted=h.project(),joint=accepted.joints[0];
    assert.equal(accepted.joints.length,1);assert.equal(joint.angle,0);
    assert.ok(Math.abs(joint.parentAnchor[1]-160)<1e-6);
    assert.ok(accepted.parts.find(p=>p.id===joint.childId).z>accepted.parts.find(p=>p.id===joint.parentId).z,'a new session does not inherit the discarded back-layer choice');
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

function framedPandaFixture(){
  const white=[250,250,250,255],ink=[25,25,25,255];
  return rasterFixture({rectangles:[{x:4,y:4,w:92,h:92,color:white},{x:40,y:15,w:20,h:25,color:ink},{x:43,y:18,w:14,h:16,color:white},{x:40,y:35,w:20,h:25,color:ink},{x:30,y:35,w:10,h:10,color:ink},{x:60,y:35,w:10,h:10,color:ink},{x:40,y:60,w:8,h:25,color:ink},{x:52,y:60,w:8,h:25,color:ink}]});
}

test('a suspected background rectangle pauses joints and offers obvious tap, cancel and intentional-shape choices', async()=>{
  const h=browserHarness();h.setRaster(framedPandaFixture());h.setPlanResponse(()=>({selectedIds:[]}));
  try{
    await h.start('background-rectangle-review');await h.settle();await h.importArtwork();const before=h.project();
    assert.match(h.root.innerHTML,/Remove the background|The background may still be attached/);
    assert.match(h.root.innerHTML,/class="cleanup-cut-outline"/,'preview displays the cut boundary as well as pixels');
    assert.deepEqual(primaryActions(h.root.innerHTML),['pick-background']);
    assert.match(h.root.innerHTML,/<button[^>]*data-action="accept"[^>]*disabled/);
    await h.click({action:'accept'});assert.deepEqual(h.project(),before);assert.equal(h.requests.length,0);assert.match(h.error(),/Remove the background first/);
    await h.click({action:'pick-background'});assert.match(h.root.innerHTML,/mode-background-pick/);assert.match(h.root.innerHTML,/Tap the empty space around your character/);
    assert.doesNotMatch(h.root.innerHTML,/<aside class="inspector"/);assert.match(h.root.innerHTML,/Adjust removal/);assert.equal(h.focusedSelectors.at(-1),'#cleanup-heading');assert.match(h.root.innerHTML,/aria-label="Picture for background removal/);
    await h.click({action:'cancel-tool'});assert.match(h.root.innerHTML,/The background may still be attached/);assert.deepEqual(h.project(),before);
    await h.click({action:'keep-whole-shape'});assert.deepEqual(primaryActions(h.root.innerHTML),['accept']);await h.click({action:'accept'});await h.settle();
    assert.equal(h.project().parts.length,1,'intentional rectangular objects remain available after explicit confirmation');
    assert.deepEqual(h.project().parts[0].polygon,[[4,4],[96,4],[96,96],[4,96]]);
  }finally{await h.close();}
});

test('tapping a retained background previews new outlines, preserves enclosed white artwork and commits once before planning',async()=>{
  const h=browserHarness(),raster=framedPandaFixture(),original=h.setRaster(raster);h.setPlanResponse(()=>({selectedIds:[]}));
  try{
    await h.start('background-tap-to-joints');await h.settle();await h.importArtwork();const before=h.project(),scale=unitsPerMm(before);
    await h.click({action:'pick-background'});await h.point(10,10);await h.settle();
    assert.equal(h.error(),'');assert.match(h.root.innerHTML,/Continue to movement/);assert.doesNotMatch(h.root.innerHTML,/The background may still be attached/);
    assert.match(h.root.innerHTML,/Undo last removal/);assert.deepEqual(h.project(),before,'pixels and cut boundaries are only a proposal');assert.equal(h.requests.length,0);
    await h.click({action:'undo-background'});assert.match(h.root.innerHTML,/The background may still be attached/);assert.deepEqual(h.project(),before);
    await h.click({action:'pick-background'});await h.point(10,10);await h.settle();await h.click({action:'reject'});assert.deepEqual(h.project(),before);
    await h.click({action:'pick-background'});await h.point(10,10);await h.settle();await h.click({action:'accept'});await h.settle();
    const accepted=h.project(),asset=accepted.assets.find(a=>a.id===accepted.conceptAssetId),pixels=h.rasters.get(asset.dataUrl),outline=accepted.parts[0].polygon;
    assert.equal(accepted.parts.length,1);assert.ok(outline.length>4,'accepted shape follows the head, arms and legs');
    assert.ok(outline.every(([x,y])=>x>=30&&x<=70&&y>=15&&y<=85));assert.equal(accepted.heightMm,before.heightMm,'new artwork keeps its chosen puppet height');
    assert.equal(pixels.data[(10*100+10)*4+3],0);assert.equal(pixels.data[(20*100+48)*4+3],255,'white enclosed face remains artwork');
    assert.equal(accepted.assets[0].dataUrl,original);assert.deepEqual(h.rasters.get(original),raster);assert.match(h.root.innerHTML,/id="plan-canvas"/);
    await h.click({action:'reject'});await h.click({action:'undo'});assert.deepEqual(h.project(),before,'one undo restores the image and old geometry together');
  }finally{await h.close();}
});

test('background recovery from a failed joint restores its review on Cancel and cannot alter locked pieces',async()=>{
  const h=browserHarness(),raster=framedPandaFixture(),original=h.setRaster(raster);h.setPlanResponse(()=>({selectedIds:[]}));
  try{
    await h.start('joint-background-recovery');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:100};project.assets=[{id:'picture',name:'Panda picture',mime:'image/png',dataUrl:original,width:100,height:100}];project.conceptAssetId='picture';project.parts=[makePart('Uncleaned image',[[4,4],[96,4],[96,96],[4,96]],'picture')];
    await h.openProject(project);const before=h.project();await h.click({action:'prepare-joints'});await h.click({action:'plan-add'});await h.planPoint(55,70);assert.match(h.root.innerHTML,/A moving piece could not be separated here/);assert.match(h.root.innerHTML,/>Fix background<\/button>/);const markers=h.planMarkers();
    await h.click({action:'pick-background'});assert.match(h.root.innerHTML,/mode-background-pick/);h.key('Escape');assert.deepEqual(h.planMarkers(),markers);assert.match(h.root.innerHTML,/>Fix background<\/button>/);assert.deepEqual(h.project(),before);
    await h.click({action:'reject'});await h.click({action:'select',id:before.parts[0].id});await h.click({action:'lock'});const locked=h.project();await h.click({action:'pick-background'});assert.match(h.error(),/Unlock/);assert.deepEqual(h.project(),locked);
  }finally{await h.close();}
});

test('background removal handles an empty-space tap and ignores a late result after New',async()=>{
  const h=browserHarness();h.setRaster(framedPandaFixture());
  try{
    await h.start('background-tap-reset');await h.settle();await h.importArtwork();const before=h.project();await h.click({action:'pick-background'});await h.point(0,0);await h.settle();
    assert.match(h.error(),/already empty/);assert.match(h.root.innerHTML,/mode-background-pick/);assert.deepEqual(h.project(),before);
    await h.point(10,10);await h.click({action:'new-project'});await h.settle();assert.equal(h.project().parts.length,0);assert.equal(h.project().assets.length,0);assert.doesNotMatch(h.root.innerHTML,/cleanup-review|mode-background-pick|Undo last removal/);assert.equal(h.error(),'');
  }finally{await h.close();}
});
