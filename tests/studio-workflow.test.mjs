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

// This harness verifies event wiring and state persistence; it is not a browser
// rendering or physical-fabrication test.
function browserHarness() {
  const rootListeners = new Map(), documentListeners = new Map(), files = new Map();
  const downloads = [], requests = [], records = new Map(), urls = new Map();
  const rasters=new Map();let fixtureRaster=null;
  const previous = new Map(['document','window','localStorage','indexedDB','fetch','setTimeout','clearTimeout','createImageBitmap'].map(k=>[k,globalThis[k]]));
  const originalCreateURL = URL.createObjectURL, originalRevokeURL = URL.revokeObjectURL;
  const nativeTimeout = globalThis.setTimeout;
  const timers = new Set();
  const target = ({dataset={},canvas=false,partId=null,...rest}={}) => ({dataset,...rest,closest(selector) {
    if(selector==='#puppet-canvas')return canvas ? this : null;
    if(selector==='[data-action]')return dataset.action ? this : null;
    if(selector==='[data-part-id]')return partId ? {dataset:{partId}} : null;
    if(selector==='[data-vertex-index]')return dataset.vertexIndex!==undefined ? this : null;
    return null;
  }});
  const root = {innerHTML:'',addEventListener:(type,fn)=>rootListeners.set(type,fn),querySelector:()=>null};
  const status = {textContent:''}, canvas = {innerHTML:''}, angle = {textContent:''}, toast = {textContent:'',classList:{add(){},remove(){}}};
  const svg = {createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}};},getScreenCTM(){return {inverse(){return {};}};}};
  for(const name of ['project-file','artwork-file'])files.set(name,{value:'',files:[],listeners:new Map(),addEventListener(type,fn){this.listeners.set(type,fn);},click(){}});
  const printFrame={contentDocument:{images:[]},contentWindow:{focus(){},print(){}}};
  globalThis.document = {documentElement:{lang:'en'},addEventListener:(type,fn)=>documentListeners.set(type,fn),querySelector(selector) {
    return ({'#app':root,'#save-status':status,'#toast':toast,'#puppet-canvas':canvas,'#puppet-canvas svg':svg,'#angle-output':angle,'#print-frame':printFrame})[selector] || files.get(selector.slice(1)) || null;
  },createElement(tag) {
    if(tag==='a')return {href:'',download:'',click(){downloads.push({name:this.download,blob:urls.get(this.href)});}};
    if(tag==='canvas'){let pixels=null;const canvas={width:0,height:0,getContext(){return {drawImage(decoded){pixels=structuredClone(decoded.raster||fixtureRaster);},getImageData(){return {data:new Uint8ClampedArray(pixels.data)};},createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};},putImageData(image){pixels={width:canvas.width,height:canvas.height,data:new Uint8ClampedArray(image.data)};}};},toDataURL(){if(!pixels)return PNG;const value=fixturePng(pixels);rasters.set(value,structuredClone(pixels));return value;}};return canvas;}
    throw Error('Unexpected DOM element: '+tag);
  }};
  globalThis.window={addEventListener(){}};
  globalThis.localStorage={getItem(){return null;},setItem(){}};
  globalThis.createImageBitmap=async blob=>{let raster=fixtureRaster;if(blob?.arrayBuffer){const key='data:image/png;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');raster=rasters.get(key)||raster;}return {width:raster?.width||100,height:raster?.height||100,raster:raster?structuredClone(raster):null,close(){}};};
  globalThis.setTimeout=(fn,ms,...args)=>{let id;id=nativeTimeout(()=>{timers.delete(id);fn(...args);},ms<10000?1:ms);timers.add(id);return id;};
  globalThis.clearTimeout=id=>{timers.delete(id);previous.get('clearTimeout')(id);};
  URL.createObjectURL=blob=>{const url='blob:test-'+urls.size;urls.set(url,blob);return url;};
  URL.revokeObjectURL=()=>{};
  globalThis.indexedDB={open(){const request={};queueMicrotask(()=>{request.result={objectStoreNames:{contains:()=>true},close(){},transaction(){const transaction={objectStore(){return {get:key=>operation('get',key),put:(value,key)=>operation('put',key,value),delete:key=>operation('delete',key)};}};function operation(kind,key,value){const op={};queueMicrotask(()=>{if(kind==='put')records.set(key,structuredClone(value));if(kind==='delete')records.delete(key);op.result=kind==='get'?structuredClone(records.get(key)):key;op.onsuccess?.();queueMicrotask(()=>transaction.oncomplete?.());});return op;}return transaction;}};request.onsuccess?.();});return request;}};
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
  return {root,status,requests,records,downloads,files,settle,rasters,
    error:()=>root.innerHTML.match(/class="error-banner" role="alert">([^<]*)/)?.[1]||'',
    setRaster(value){fixtureRaster=structuredClone(value);const url=fixturePng(value);rasters.set(url,structuredClone(value));return url;},
    setResponse(fn){responseFactory=fn;},
    setGetResponse(fn){getResponseFactory=fn;},
    setCapabilities(value){capabilities={...capabilities,...value};},
    click:dataset=>rootListeners.get('click')({target:target({dataset})}),
    input:(id,value)=>rootListeners.get('input')({target:target({id,value,dataset:{}})}),
    parameterInput:(key,value)=>rootListeners.get('input')({target:target({dataset:{paramField:key},value})}),
    change:el=>rootListeners.get('change')({target:target(el)}),
    submit:id=>rootListeners.get('submit')({target:{id},preventDefault(){}}),
    point:(x,y,partId=null)=>rootListeners.get('click')({target:target({canvas:true,partId}),clientX:x,clientY:y}),
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
    await import('../public/studio-app.mjs?workflow');
    await h.settle();
    assert.equal((h.root.innerHTML.match(/data-action="step"/g)||[]).length,3);
    assert.match(h.root.innerHTML,/Who will step/);
    assert.match(h.root.innerHTML,/0 parts/);
    assert.doesNotMatch(h.root.innerHTML,/data-action="generate-image"/);
    await h.click({action:'settings'});
    assert.match(h.root.innerHTML,/Image analysis<\/span><strong>Not available/);
    assert.match(h.root.innerHTML,/Image generation<\/span><strong>Not available/);
    assert.match(h.root.innerHTML,/Image editing<\/span><strong>Not available/);
    await h.click({action:'settings'});

    await h.click({action:'starter',kind:'tentacles'});
    await h.settle();
    const before=structuredClone(h.records.get('current'));
    assert.ok(before.parts.length>6,'starter supports many custom appendages');
    const first=before.parts[0];
    await h.click({action:'step',step:'refine'});
    const prompt='Make this specific piece deep blue. Keep all six tentacles, its white coat, and the current connections. 保留轮廓。';
    h.input('revision-prompt',prompt);
    h.submit('refine-form');
    await h.settle();
    assert.equal(h.requests.at(-1).body.prompt,prompt,'custom request reaches AI verbatim');
    assert.match(h.root.innerHTML,/Review the proposed design/);
    assert.equal(h.records.get('current').parts[0].fill,first.fill,'proposal is not autosaved as an accepted edit');
    await h.click({action:'accept'});
    await h.settle();
    assert.equal(h.records.get('current').parts[0].fill,'#244466');
    assert.equal(h.records.get('current').parts.length,before.parts.length);
    assert.deepEqual(h.records.get('current').joints,before.joints);
    await h.click({action:'undo'});
    await h.settle();
    assert.equal(h.records.get('current').parts[0].fill,first.fill);
    assert.deepEqual(h.records.get('current').parts,before.parts);
  } finally {await h.close();}
});

test('artwork, hand-drawn parts and connections survive portable project export', async () => {
  const h=browserHarness();
  try {
    await import('../public/studio-app.mjs?drawing');
    await h.settle();
    await h.importArtwork();
    await h.click({action:'draw'});
    assert.match(h.root.innerHTML,/Trace the boundary/);
    for(const point of [[10,10],[40,10],[40,90],[10,90]])await h.point(...point);
    await h.click({action:'finish-part'});
    await h.click({action:'draw'});
    for(const point of [[40,10],[70,10],[70,90],[40,90]])await h.point(...point);
    await h.click({action:'finish-part'});
    await h.settle();
    let project=h.records.get('current');
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
    project=h.records.get('current');
    assert.equal(project.joints.length,1);
    assert.deepEqual(project.joints[0].parentAnchor,[30,40]);
    assert.deepEqual(project.joints[0].childAnchor,[50,40]);
    assert.ok(Math.abs(unitsPerMm(project)-drawingScale)<1e-8);
    assert.ok(Math.abs(project.joints[0].padRadius/unitsPerMm(project)-3)<1e-8,'default 3 mm overlap radius stays physical even on a 100 px image');
    await h.change({dataset:{jointField:'padRadius'},type:'number',value:'4.2'});await h.settle();
    project=h.records.get('current');
    assert.ok(Math.abs(project.joints[0].padRadius-4.2*drawingScale)<1e-8,'inspector millimetres convert into the calibrated design coordinates');
    assert.match(h.root.innerHTML,/data-joint-field="padRadius"[^>]*value="4.2"/);
    await h.click({action:'rod'});
    await h.click({action:'select',id:parent.id});
    await h.point(30,70,parent.id);
    await h.settle();
    assert.equal(h.records.get('current').rods.length,1);
    assert.equal(h.records.get('current').rods[0].partId,parent.id,'part-list selection preserves the active rod tool and its target');
    await h.click({action:'save-project'});
    const saved=parseStudioProject(await h.downloads.at(-1).blob.text());
    assert.equal(saved.assets[0].dataUrl,PNG);
    assert.equal(saved.assets[0].name,'Student artwork.png');
    assert.equal(saved.parts.length,2);
    assert.equal(saved.joints.length,1);
    assert.ok(Math.abs(saved.joints[0].padRadius/unitsPerMm(saved)-4.2)<1e-8,'portable export retains the physical overlap radius');
    assert.equal(saved.rods.length,1);
    await h.openProject(saved);
    assert.equal(h.records.get('current').assets[0].dataUrl,PNG);
    assert.deepEqual(h.records.get('current').parts,saved.parts);

    // A text edit of traced geometry should not accidentally demand image vision.
    await h.click({action:'step',step:'refine'});
    h.input('revision-prompt','Change only the selected shape color to blue. Keep the imported artwork unchanged.');
    h.submit('refine-form');
    await h.settle();
    assert.equal(h.requests.length,1,'text refinement remains available with imported artwork');
    assert.equal(h.requests[0].body.imageDataUrl,undefined,'unneeded image bytes are not sent to a text-only connection');
    assert.match(h.root.innerHTML,/Review the proposed design/);
    await h.click({action:'reject'});
    assert.equal(h.records.get('current').assets[0].dataUrl,PNG);
  } finally {await h.close();}
});

test('opening a portable project preserves student artwork and custom shape identity', async () => {
  const h=browserHarness();
  try {
    await import('../public/studio-app.mjs?opening');
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

test('an unsubmitted custom prompt autosaves and a new Create proposal replaces parts only on acceptance', async () => {
  const h=browserHarness();
  try {
    await import('../public/studio-app.mjs?create-replacement');
    await h.settle();
    const prompt='A historical astronomer with a circular star chart and two movable wings. 保留星图。';
    h.input('create-prompt',prompt);
    await h.settle();
    assert.equal(h.records.get('current').brief.keywords,prompt);
    assert.equal(h.requests.length,0,'typing does not send a generation request');
    assert.equal(h.status.textContent,'Saved on this device');
    await h.click({action:'starter',kind:'figure'});
    await h.settle();
    const before=structuredClone(h.records.get('current'));
    h.setResponse(()=>({reply:'Review this completely new draft before replacing the construction.',proposal:{parts:[{id:'new-star-chart',name:'Star chart',polygon:[[100,100],[200,100],[250,200],[200,300],[100,300],[50,200]],fill:'#244466'}],joints:[]}}));
    h.submit('create-form');
    await h.settle();
    assert.equal(h.requests[0].body.task,'create');
    assert.equal(h.requests[0].body.prompt,prompt);
    assert.deepEqual(h.requests[0].body.project.parts,[],'new creation starts from an empty geometry context');
    assert.deepEqual(h.records.get('current').parts,before.parts,'the current construction stays until acceptance');
    await h.click({action:'accept'});
    await h.settle();
    assert.deepEqual(h.records.get('current').parts.map(p=>p.id),['new-star-chart']);
    assert.equal(h.records.get('current').joints.length,0);
    assert.match(h.records.get('current').revisions.at(-1).createdAt,/^\d{4}-\d{2}-\d{2}T/);
    await h.click({action:'undo'});
    await h.settle();
    assert.deepEqual(h.records.get('current').parts,before.parts);
    assert.deepEqual(h.records.get('current').joints,before.joints);
    assert.equal(h.records.get('current').brief.keywords,prompt);
  } finally {await h.close();}
});

test('fixed connections can move again and AI receives the selected part without changing other pieces', async () => {
  const h=browserHarness();
  try {
    await import('../public/studio-app.mjs?connection-selection');
    await h.settle();
    await h.click({action:'starter',kind:'figure'});
    await h.settle();
    let project=h.records.get('current');
    const joint=project.joints.find(j=>j.type==='pivot')||project.joints[0];
    await h.click({action:'select',id:joint.childId});
    await h.change({dataset:{field:'connection.type'},value:'fixed'});
    await h.settle();
    assert.equal(h.records.get('current').joints.find(j=>j.id===joint.id).min,0);
    assert.equal(h.records.get('current').joints.find(j=>j.id===joint.id).max,0);
    await h.change({dataset:{field:'connection.type'},value:'pivot'});
    await h.settle();
    let changed=h.records.get('current').joints.find(j=>j.id===joint.id);
    assert.ok(changed.min<0&&changed.max>0,'a restored pivot gets a useful movement range');
    await h.change({dataset:{jointField:'angle'},value:'35'});
    await h.settle();
    changed=h.records.get('current').joints.find(j=>j.id===joint.id);
    assert.equal(changed.angle,35);
    const before=structuredClone(h.records.get('current'));
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
    project=h.records.get('current');
    assert.equal(project.parts.find(p=>p.id===joint.childId).fill,'#244466');
    assert.deepEqual(project.parts.find(p=>p.id===other.id),other,'out-of-scope AI edits are filtered out');
    assert.deepEqual(project.joints,before.joints);
  } finally {await h.close();}
});

test('shadow view hides the source image and accepted same-frame image edits preserve locked artwork', async () => {
  const h=browserHarness();
  h.setCapabilities({vision:true,imageGeneration:true,imageEditing:true,status:'Configured image connection.'});
  try {
    await import('../public/studio-app.mjs?image-adoption');
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
    assert.doesNotMatch(h.root.innerHTML,/<image\b/,'shadow shows cut geometry without the full-color reference leaking behind it');
    await h.click({action:'view-art'});
    assert.match(h.root.innerHTML,/class="concept-reference"/);
    h.setResponse(()=>({reply:'Review the revised artwork before applying it.',asset:{id:'revised-image',name:'Edited artwork',mime:'image/png',dataUrl:PNG,width:100,height:100}}));
    await h.click({action:'step',step:'refine'});
    h.input('revision-prompt','Revise the costume colors while keeping the face.');
    await h.click({action:'edit-image'});
    await h.settle();
    assert.equal(h.requests[0].body.task,'edit-image');
    assert.equal(h.requests[0].body.imageDataUrl,PNG);
    assert.equal(h.records.get('current').conceptAssetId,'source-image','image proposal remains uncommitted before acceptance');
    await h.click({action:'accept'});
    await h.settle();
    const accepted=h.records.get('current');
    assert.equal(accepted.conceptAssetId,'revised-image');
    assert.equal(accepted.parts[0].assetId,'source-image','locked piece retains original artwork');
    assert.equal(accepted.parts[1].assetId,'revised-image','unlocked same-frame artwork adopts the new image');
    assert.equal(accepted.assets.length,2,'original is retained for locked pieces and undo');
    assert.deepEqual(accepted.parts.map(p=>p.polygon),project.parts.map(p=>p.polygon),'pixel revisions do not silently change cut contours');
    await h.click({action:'undo'});
    await h.settle();
    assert.equal(h.records.get('current').conceptAssetId,'source-image');
    assert.deepEqual(h.records.get('current').parts,project.parts);
  } finally {await h.close();}
});

test('local image extraction, hinged splitting and parametric artwork resizing round-trip without AI', async () => {
  const h=browserHarness();
  const original=h.setRaster(rasterFixture({rectangles:[{x:20,y:10,w:50,h:80,color:[170,45,25,255]},{x:35,y:25,w:20,h:10,color:[20,80,190,255]}]}));
  try {
    await import('../public/studio-app.mjs?local-image-pipeline');await h.settle();await h.importArtwork();
    assert.equal(h.records.get('current').assets[0].dataUrl,original);
    await h.click({action:'extract-silhouette'});await h.settle();
    assert.match(h.root.innerHTML,/Review the extracted cut boundaries/);
    assert.equal(h.records.get('current').parts.length,0,'extraction is reviewable, not applied immediately');
    await h.click({action:'accept'});await h.settle();
    let project=h.records.get('current');assert.equal(project.parts.length,1);
    assert.equal(project.parts[0].assetId,project.conceptAssetId);
    await h.click({action:'split-part'});await h.point(10,50);await h.point(80,50);await h.click({action:'preview-split'});await h.settle();
    assert.match(h.root.innerHTML,/Review the two pieces/);
    assert.equal(h.records.get('current').parts.length,1);
    await h.click({action:'accept'});await h.settle();
    const split=structuredClone(h.records.get('current'));assert.equal(split.parts.length,2);assert.equal(split.joints.length,1);
    assert.equal(split.parts[0].assetId,split.parts[1].assetId);
    const joint=split.joints[0],scale=unitsPerMm(split),childBefore=split.parts.find(p=>p.id===joint.childId);
    await h.click({action:'select',id:joint.parentId});
    h.parameterInput('length','150');await h.settle();
    assert.deepEqual(h.records.get('current').parts,split.parts,'slider input previews without persisting');
    await h.change({dataset:{paramField:'length'},value:'150'});await h.settle();
    const resized=structuredClone(h.records.get('current')),parent=resized.parts.find(p=>p.id===joint.parentId),child=resized.parts.find(p=>p.id===joint.childId);
    assert.equal(parent.parameters.length,1.5);assert.notDeepEqual(parent.artworkMatrix,[1,0,0,1,0,0]);
    assert.deepEqual(child.polygon,childBefore.polygon,'attached child artwork is not stretched');assert.deepEqual(child.artworkMatrix,childBefore.artworkMatrix);
    assert.ok(Math.abs(unitsPerMm(resized)-scale)<1e-8,'resize preserves physical scale of other pieces');
    const transforms=partTransforms(resized),changedJoint=resized.joints[0];
    assert.deepEqual(transformPoint(transforms[joint.parentId],changedJoint.parentAnchor),transformPoint(transforms[joint.childId],changedJoint.childAnchor));
    assert.equal(resized.assets[0].dataUrl,original,'source image bytes remain intact');
    await h.click({action:'undo'});await h.settle();assert.deepEqual(h.records.get('current').parts,split.parts);
    await h.click({action:'redo'});await h.settle();assert.deepEqual(h.records.get('current').parts,resized.parts);
    await h.click({action:'export-art'});assert.equal(h.downloads.length,1,h.error());const svg=await h.downloads.at(-1).blob.text();assert.match(svg,/<image[^>]*transform="matrix\(/);assert.ok(svg.includes(original));
    await h.click({action:'save-project'});const portable=parseStudioProject(await h.downloads.at(-1).blob.text());await h.openProject(portable);
    project=h.records.get('current');assert.deepEqual(project.parts,resized.parts);assert.deepEqual(project.joints,resized.joints);assert.equal(project.assets[0].dataUrl,original);
    assert.equal(h.requests.length,0,'the complete local pipeline never sends an AI request');
  } finally {await h.close();}
});

test('background cleanup previews alpha changes and preserves the original until acceptance', async () => {
  const h=browserHarness();
  const input=rasterFixture({background:[255,255,255,255],rectangles:[{x:20,y:20,w:60,h:60,color:[150,30,20,255]},{x:40,y:40,w:20,h:20,color:[255,255,255,255]}]});
  const original=h.setRaster(input);
  try {
    await import('../public/studio-app.mjs?background-cleanup');await h.settle();await h.importArtwork();
    const artworkProject=structuredClone(h.records.get('current')),sourceId=artworkProject.conceptAssetId;
    artworkProject.parts=[makePart('Editable piece',[[20,20],[80,20],[80,40],[20,40]],sourceId),makePart('Protected piece',[[20,60],[80,60],[80,80],[20,80]],sourceId)];
    artworkProject.parts[1].locked=true;await h.openProject(artworkProject);
    const before=structuredClone(h.records.get('current'));
    await h.click({action:'view-shadow'});await h.change({dataset:{view:'concept'},checked:false});
    await h.click({action:'remove-background'});await h.settle();
    assert.match(h.root.innerHTML,/Review the transparent areas/);assert.equal(h.records.get('current').assets.length,1);assert.equal(h.records.get('current').assets[0].dataUrl,original);
    assert.ok(h.root.innerHTML.includes(original));assert.ok(h.root.innerHTML.includes([...h.rasters.keys()].at(-1)),'image review shows both sources even when shadow/reference settings hide the main artwork');
    await h.click({action:'reject'});assert.deepEqual(h.records.get('current'),before);
    await h.click({action:'remove-background'});await h.click({action:'accept'});await h.settle();
    const accepted=h.records.get('current'),cleaned=accepted.assets.find(a=>a.id===accepted.conceptAssetId);
    assert.equal(accepted.assets.length,2);assert.equal(accepted.assets[0].dataUrl,original);assert.notEqual(cleaned.dataUrl,original);
    assert.equal(accepted.parts[0].assetId,cleaned.id);assert.equal(accepted.parts[1].assetId,sourceId,'locked artwork retains its original image');
    const pixels=h.rasters.get(cleaned.dataUrl);assert.equal(pixels.data[3],0,'edge-connected background is transparent');assert.equal(pixels.data[(50*100+50)*4+3],255,'enclosed white artwork survives');
    await h.click({action:'undo'});await h.settle();assert.deepEqual(h.records.get('current').assets,before.assets);assert.equal(h.records.get('current').conceptAssetId,before.conceptAssetId);
    assert.deepEqual(h.records.get('current').parts,before.parts);
    assert.equal(h.requests.length,0);
  } finally {await h.close();}
});

test('local resize protects locked descendants and a changed project cannot accept an old image proposal', async () => {
  const h=browserHarness();
  h.setRaster(rasterFixture({rectangles:[{x:20,y:10,w:50,h:80,color:[170,45,25,255]}]}));
  try {
    await import('../public/studio-app.mjs?locked-parameter-and-stale');await h.settle();
    await h.click({action:'starter',kind:'figure'});await h.settle();
    const project=h.records.get('current'),joint=project.joints.find(j=>j.parentId===project.parts[0].id)||project.joints[0];
    await h.click({action:'select',id:joint.childId});await h.click({action:'lock'});await h.settle();
    const before=structuredClone(h.records.get('current'));await h.click({action:'select',id:joint.parentId});
    await h.change({dataset:{paramField:'length'},value:'130'});await h.settle();
    assert.deepEqual(h.records.get('current').parts,before.parts);assert.deepEqual(h.records.get('current').joints,before.joints);assert.match(h.root.innerHTML,/locked/i);
    await h.click({action:'new-project'});await h.importArtwork();await h.click({action:'extract-silhouette'});await h.settle();
    assert.match(h.root.innerHTML,/Review the proposed design/);h.input('create-prompt','This prompt was changed while the image proposal was pending.');await h.settle();
    await h.click({action:'accept'});await h.settle();
    assert.equal(h.records.get('current').parts.length,0);assert.match(h.root.innerHTML,/project changed/i);assert.equal(h.requests.length,0);
  } finally {await h.close();}
});

test('color selection, reviewed connection suggestions and drawn parameter direction work locally', async () => {
  const h=browserHarness();
  h.setRaster(rasterFixture({rectangles:[{x:15,y:15,w:60,h:30,color:[180,40,20,255]},{x:25,y:45,w:40,h:40,color:[30,70,180,255]}]}));
  try {
    await import('../public/studio-app.mjs?region-connection-axis');await h.settle();await h.importArtwork();
    for(const point of [[35,30],[45,65]]){
      const count=h.records.get('current').parts.length;
      await h.click({action:'select-region'});await h.point(...point);await h.settle();
      assert.equal(h.error(),'');assert.equal(h.records.get('current').parts.length,count,'region remains a proposal until accepted');
      await h.click({action:'accept'});await h.settle();assert.equal(h.records.get('current').parts.length,count+1);
    }
    const before=structuredClone(h.records.get('current')),[parent,child]=before.parts;
    assert.ok(parent.polygon.every(p=>p[1]<=45));assert.ok(child.polygon.every(p=>p[1]>=45),'color clicks produce distinct cut regions');
    await h.change({dataset:{connectParent:''},value:parent.id});await h.click({action:'suggest-connection'});await h.settle();
    assert.equal(h.error(),'');assert.equal(h.records.get('current').joints.length,0);
    assert.match(h.root.innerHTML,/Review its position and movement/);
    await h.click({action:'accept'});await h.settle();
    const connected=structuredClone(h.records.get('current'));assert.equal(connected.joints.length,1);assert.equal(connected.joints[0].parentId,parent.id);assert.equal(connected.joints[0].childId,child.id);
    await h.click({action:'parameter-axis'});await h.point(25,65);await h.point(65,65);await h.settle();
    const directed=h.records.get('current'),part=directed.parts.find(p=>p.id===child.id);
    assert.equal(part.parameters.axisAngle,-90);assert.deepEqual(part.polygon,child.polygon,'direction is a rebase, not a deformation');assert.deepEqual(part.artworkMatrix,child.artworkMatrix);
    await h.change({dataset:{paramField:'length'},value:'125'});await h.settle();
    const resized=h.records.get('current').parts.find(p=>p.id===child.id);
    assert.equal(resized.parameters.length,1.25);assert.ok(Math.abs(resized.artworkMatrix[0]-1.25)<1e-8);assert.ok(Math.abs(resized.artworkMatrix[3]-1)<1e-8,'horizontal direction stretches the horizontal image axis');
    assert.equal(h.requests.length,0);
  } finally {await h.close();}
});

test('changing selection or importing artwork clears unfinished cuts and restores an editable image view', async () => {
  const h=browserHarness();
  const original=h.setRaster(rasterFixture({rectangles:[{x:10,y:10,w:30,h:80,color:[180,40,20,255]},{x:50,y:10,w:40,h:80,color:[30,70,180,255]}]}));
  try {
    await import('../public/studio-app.mjs?cancel-stale-cut');await h.settle();await h.importArtwork();
    await h.click({action:'extract-silhouette'});await h.click({action:'accept'});await h.settle();
    const before=structuredClone(h.records.get('current')),[first,second]=before.parts;
    await h.click({action:'select',id:first.id});await h.click({action:'split-part'});await h.point(5,50);
    assert.match(h.root.innerHTML,/class="trace-overlay"/);
    await h.click({action:'select',id:second.id});
    assert.doesNotMatch(h.root.innerHTML,/class="trace-overlay"|Place two points across the selected piece/);
    await h.click({action:'split-part'});await h.point(95,50);await h.click({action:'preview-split'});
    assert.doesNotMatch(h.root.innerHTML,/Review the two pieces/,'the previous piece contributes no old split point');
    assert.deepEqual(h.records.get('current').parts,before.parts);
    await h.point(45,50);await h.click({action:'preview-split'});assert.match(h.root.innerHTML,/Review the two pieces/);await h.click({action:'reject'});
    await h.click({action:'split-part'});await h.point(45,50);await h.click({action:'view-shadow'});await h.change({dataset:{view:'concept'},checked:false});
    await h.importArtwork();
    assert.equal(h.error(),'');assert.doesNotMatch(h.root.innerHTML,/class="trace-overlay"|Place two points across the selected piece|data-action="finish-part"/);
    assert.match(h.root.innerHTML,/class="active" data-action="view-art"/);assert.ok(h.root.innerHTML.includes(original));
    await h.click({action:'preview-split'});assert.doesNotMatch(h.root.innerHTML,/Review the two pieces/);assert.deepEqual(h.records.get('current').parts,before.parts);
    assert.equal(h.requests.length,0);
  } finally {await h.close();}
});

test('generation-only relay accepts custom prompts and presets, reviews new pixels, and continues into local hinged parts', async () => {
  const h=browserHarness();h.setGetResponse(legacyImageStatus);
  const original=h.setRaster(rasterFixture({rectangles:[{x:5,y:10,w:8,h:80,color:[180,40,20,255]}]}));
  const generated=h.setRaster(rasterFixture({rectangles:[{x:20,y:10,w:50,h:80,color:[30,70,180,255]}]}));
  h.setResponse(()=>({dataUrl:generated,model:'configured-image-model',kind:'reference'}));
  try {
    await import('../public/studio-app.mjs?generation-only-relay');await h.settle();
    const project=createStudioProject();project.canvas={width:100,height:100};project.assets=[{id:'kept-original',name:'Original piece',mime:'image/png',dataUrl:original,width:100,height:100}];project.conceptAssetId='kept-original';
    project.parts=[makePart('Protected original piece',[[5,10],[13,10],[13,90],[5,90]],'kept-original')];project.parts[0].locked=true;
    await h.openProject(project);await h.click({action:'step',step:'create'});
    assert.match(h.root.innerHTML,/class="primary full" data-action="generate-image"/);assert.match(h.root.innerHTML,/data-action="create-plan"/);
    await h.change({dataset:{field:'brief.kind'},value:'human'});await h.change({dataset:{field:'brief.era'},value:'modern'});await h.change({dataset:{field:'brief.style'},value:'paper-cut'});
    const prompt='A doctor 医生 with a long white coat, two arms and a blue book; keep every finger inside the frame.';h.input('create-prompt',prompt);await h.settle();
    const before=structuredClone(h.records.get('current'));
    await h.click({action:'view-shadow'});await h.change({dataset:{view:'concept'},checked:false});
    await h.click({action:'generate-image'});await h.settle();
    assert.equal(h.error(),'');assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'https://6ilmssim2bz2s.kimi.site/api/puppet/image');
    assert.deepEqual(h.requests[0].body,{application:'shadow-puppet-studio',kind:'reference',prompt:`Selected design settings:\nCharacter type: human\nWorld / era: modern\nVisual style: paper-cut\n\nStudent prompt:\n${prompt}`},'only prompt text and preset context reach the generation route');
    assert.ok(h.root.innerHTML.includes(generated),'generated pixels remain visible during review even in Shadow mode');assert.ok(h.root.innerHTML.includes(original),'review keeps the original visible for comparison');
    assert.match(h.root.innerHTML,/has not been visually verified/);assert.deepEqual(h.records.get('current'),before,'generation does not commit until acceptance');
    await h.click({action:'reject'});assert.deepEqual(h.records.get('current'),before);
    h.submit('create-form');await h.settle();assert.equal(h.requests.length,2,'the primary form generates artwork on this relay');
    await h.click({action:'draw'});await h.point(1,1);
    await h.click({action:'accept'});await h.settle();
    const accepted=structuredClone(h.records.get('current')),generatedId=accepted.conceptAssetId;
    assert.notEqual(generatedId,'kept-original');assert.equal(accepted.assets.find(a=>a.id===generatedId).dataUrl,generated);assert.equal(accepted.assets.length,2);
    assert.deepEqual(accepted.parts,before.parts,'new generation never rebinds or replaces existing cut pieces');assert.match(h.root.innerHTML,/class="active" data-action="view-art"/);assert.match(h.root.innerHTML,/data-step="make" aria-current="step"/);assert.doesNotMatch(h.root.innerHTML,/class="trace-overlay"|data-action="finish-part"/);
    await h.click({action:'step',step:'refine'});assert.doesNotMatch(h.root.innerHTML,/data-action="edit-image"/);assert.match(h.root.innerHTML,/data-action="analyze" disabled/);
    h.input('revision-prompt','Make the costume green.');await h.click({action:'edit-image'});assert.match(h.error(),/Image editing is not connected/);assert.equal(h.requests.length,2,'unsupported pixel edits never make a request');
    await h.click({action:'dismiss-error'});await h.click({action:'undo'});await h.settle();assert.deepEqual(h.records.get('current').assets,before.assets);assert.deepEqual(h.records.get('current').parts,before.parts);
    await h.click({action:'redo'});await h.settle();await h.click({action:'step',step:'make'});
    await h.click({action:'extract-silhouette'});await h.click({action:'accept'});await h.settle();assert.equal(h.records.get('current').parts.length,2);
    await h.click({action:'split-part'});await h.point(10,50);await h.point(80,50);await h.click({action:'preview-split'});await h.click({action:'accept'});await h.settle();
    const built=structuredClone(h.records.get('current'));assert.equal(built.parts.length,3);assert.equal(built.joints.length,1);assert.deepEqual(built.parts[0],before.parts[0]);assert.ok(built.parts.slice(1).every(p=>p.assetId===generatedId));
    await h.click({action:'save-project'});const saved=parseStudioProject(await h.downloads.at(-1).blob.text());await h.openProject(saved);
    assert.deepEqual(h.records.get('current').parts,built.parts);assert.deepEqual(h.records.get('current').joints,built.joints);assert.deepEqual(h.records.get('current').assets,built.assets);assert.equal(h.requests.length,2,'local extraction, splitting and persistence need no additional AI calls');
  } finally {await h.close();}
});

test('a delayed generated image cannot replace work changed while generation is pending', async () => {
  const h=browserHarness();h.setGetResponse(legacyImageStatus);
  const generated=h.setRaster(rasterFixture({rectangles:[{x:20,y:10,w:50,h:80,color:[30,70,180,255]}]}));let complete;
  h.setResponse(()=>new Promise(resolve=>{complete=resolve;}));
  try {
    await import('../public/studio-app.mjs?stale-generated-image');await h.settle();
    h.input('create-prompt','A historical astronomer with a wide robe.');await h.settle();
    const pending=h.click({action:'generate-image'});await h.settle();assert.equal(h.requests.length,1);
    h.input('create-prompt','A modern astronaut with a blue flight suit.');await h.settle();const changed=structuredClone(h.records.get('current'));
    complete({dataUrl:generated,model:'configured-image-model',kind:'reference'});await pending;await h.settle();
    assert.match(h.error(),/design changed while AI was working/i);assert.deepEqual(h.records.get('current'),changed);assert.equal(changed.assets.length,0);assert.doesNotMatch(h.root.innerHTML,/data-action="accept"/);
    await h.click({action:'accept'});await h.settle();assert.deepEqual(h.records.get('current'),changed);
  } finally {await h.close();}
});
