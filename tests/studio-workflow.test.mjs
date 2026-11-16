import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject, makePart} from '../public/studio-model.mjs';
import {serializeStudioProject, parseStudioProject} from '../public/studio-storage.mjs';

// This harness verifies event wiring and state persistence; it is not a browser
// rendering or physical-fabrication test.
function browserHarness() {
  const rootListeners = new Map(), documentListeners = new Map(), files = new Map();
  const downloads = [], requests = [], records = new Map(), urls = new Map();
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
    if(tag==='canvas')return {width:0,height:0,getContext(){return {drawImage(){}};},toDataURL(){return PNG;}};
    throw Error('Unexpected DOM element: '+tag);
  }};
  globalThis.window={addEventListener(){}};
  globalThis.localStorage={getItem(){return null;},setItem(){}};
  globalThis.createImageBitmap=async()=>({width:100,height:100,close(){}});
  globalThis.setTimeout=(fn,ms,...args)=>{let id;id=nativeTimeout(()=>{timers.delete(id);fn(...args);},ms<10000?1:ms);timers.add(id);return id;};
  globalThis.clearTimeout=id=>{timers.delete(id);previous.get('clearTimeout')(id);};
  URL.createObjectURL=blob=>{const url='blob:test-'+urls.size;urls.set(url,blob);return url;};
  URL.revokeObjectURL=()=>{};
  globalThis.indexedDB={open(){const request={};queueMicrotask(()=>{request.result={objectStoreNames:{contains:()=>true},close(){},transaction(){const transaction={objectStore(){return {get:key=>operation('get',key),put:(value,key)=>operation('put',key,value),delete:key=>operation('delete',key)};}};function operation(kind,key,value){const op={};queueMicrotask(()=>{if(kind==='put')records.set(key,structuredClone(value));if(kind==='delete')records.delete(key);op.result=kind==='get'?structuredClone(records.get(key)):key;op.onsuccess?.();queueMicrotask(()=>transaction.oncomplete?.());});return op;}return transaction;}};request.onsuccess?.();});return request;}};
  let responseFactory=body=>({reply:'Compare the changed cut shape before accepting.',proposal:{parts:[{id:body.project.parts[0].id,fill:'#244466'}]}});
  let capabilities={version:2,text:true,vision:false,imageGeneration:false,status:'Drawing plans only; image services unavailable.'};
  globalThis.fetch=async(url,options={})=>{
    if(options.method==='POST'){
      const body=JSON.parse(options.body);requests.push({url,body});
      return {ok:true,status:200,json:async()=>responseFactory(body)};
    }
    return {ok:true,status:200,json:async()=>capabilities};
  };
  const settle=()=>new Promise(resolve=>nativeTimeout(resolve,25));
  return {root,status,requests,records,downloads,files,settle,
    setResponse(fn){responseFactory=fn;},
    setCapabilities(value){capabilities={...capabilities,...value};},
    click:dataset=>rootListeners.get('click')({target:target({dataset})}),
    input:(id,value)=>rootListeners.get('input')({target:target({id,value,dataset:{}})}),
    change:el=>rootListeners.get('change')({target:target(el)}),
    submit:id=>rootListeners.get('submit')({target:{id},preventDefault(){}}),
    point:(x,y,partId=null)=>rootListeners.get('click')({target:target({canvas:true,partId}),clientX:x,clientY:y}),
    async openProject(project){const input=files.get('project-file');const text=serializeStudioProject(project);input.files=[{size:new TextEncoder().encode(text).length,text:async()=>text}];await input.listeners.get('change')({target:input});await settle();},
    async importArtwork(){const input=files.get('artwork-file');const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,100,0,0,0,100]);input.files=[{name:'Student artwork.png',type:'image/png',size:bytes.length,arrayBuffer:async()=>bytes.buffer}];await input.listeners.get('change')({target:input});await settle();},
    async close(){await settle();for(const timer of timers)previous.get('clearTimeout')(timer);URL.createObjectURL=originalCreateURL;URL.revokeObjectURL=originalRevokeURL;for(const [key,value]of previous){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
  };
}
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

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
    assert.match(h.root.innerHTML,/Image generation \/ editing<\/span><strong>Not available/);
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
    await h.click({action:'rod'});
    await h.click({action:'select',id:parent.id});
    await h.point(30,70,parent.id);
    await h.settle();
    assert.equal(h.records.get('current').rods.length,1);
    await h.click({action:'save-project'});
    const saved=parseStudioProject(await h.downloads.at(-1).blob.text());
    assert.equal(saved.assets[0].dataUrl,PNG);
    assert.equal(saved.assets[0].name,'Student artwork.png');
    assert.equal(saved.parts.length,2);
    assert.equal(saved.joints.length,1);
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
  h.setCapabilities({vision:true,imageGeneration:true,status:'Configured image connection.'});
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
