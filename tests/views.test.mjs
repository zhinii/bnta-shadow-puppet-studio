import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {createProject} from '../public/model.mjs';

let sessionNumber=0;
function harness() {
 const listeners=new Map(),documentListeners=new Map(),windowListeners=new Map(),fileListeners=new Map();
 const root={innerHTML:'',addEventListener:(type,fn)=>listeners.set(type,fn),contains:()=>true};
 const fakeInput={addEventListener:(type,fn)=>fileListeners.set(type,fn),click(){this.opened=true;}};
 const chatInput={value:'Give it a blue robe and longer sleeves',focus:()=>{}},printRoot={innerHTML:''},toast={textContent:'',classList:{add:()=>{},remove:()=>{}}};
 const old=Object.fromEntries(['document','window','localStorage','fetch','cancelAnimationFrame'].map(k=>[k,globalThis[k]]));
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 const closed=createProject();closed.characters[0].name='A closed session must not reopen';
 const saved=new Map([['bnta-shadow-studio-v1',JSON.stringify(closed)],['bnta-studio-endpoint','https://relay.example/api/studio']]);
 const blobs=new Map(),downloads=[];
 let printed=false,reloads=0,storageReads=0,storageWrites=0;
 globalThis.document={
  querySelector:s=>s==='#app'?root:s==='#file-input'?fakeInput:s==='#chat-input'?chatInput:s==='#print-root'?printRoot:s==='#toast'?toast:null,
  documentElement:{lang:'en'},addEventListener:(type,fn)=>documentListeners.set(type,fn),
  createElement(name){assert.equal(name,'a');return {click(){downloads.push({name:this.download,blob:blobs.get(this.href)});}};}
 };
 globalThis.window={addEventListener:(type,fn)=>windowListeners.set(type,fn),print:()=>{printed=true;},location:{reload(){reloads++;}}};
 globalThis.localStorage={getItem:k=>{storageReads++;return saved.get(k);},setItem:(k,v)=>{storageWrites++;saved.set(k,v);},removeItem:k=>saved.delete(k)};
 globalThis.fetch=async(_url,options)=>options?.method==='POST'?{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({reply:'Review these edits.',design:{primary:'#123456',garment:{sleeveWidth:1.4}}})}}]})}:{ok:false};
 globalThis.cancelAnimationFrame=()=>{};
 URL.createObjectURL=blob=>{const url='blob:test-'+blobs.size;blobs.set(url,blob);return url;};
 URL.revokeObjectURL=()=>{};
 const click=async dataset=>listeners.get('click')({target:{closest:()=>({dataset})}});
 const change=async el=>listeners.get('change')({target:{dataset:{},matches:()=>false,...el}});
 const open=async()=>import('../public/app.mjs?classic-session='+sessionNumber++);
 const downloadProject=async()=>{await click({action:'save'});return JSON.parse(await downloads.at(-1).blob.text());};
 return {root,listeners,documentListeners,windowListeners,fileListeners,fakeInput,printRoot,saved,downloads,click,change,open,downloadProject,
  get printed(){return printed;},get reloads(){return reloads;},get storageReads(){return storageReads;},get storageWrites(){return storageWrites;},
  async page(name){await mkdir(new URL('../dist/qa/',import.meta.url),{recursive:true});await writeFile(new URL('../dist/qa/'+name+'.html',import.meta.url),root.innerHTML);},
  restore(){URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;for(const [key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
 };
}

test('student workflow, AI review, selective apply, versions and printing',async()=>{
 const h=harness();
 try{
  await h.open();assert.ok(h.root.innerHTML.includes('Start with a simple shape.'));assert.ok(!h.root.innerHTML.includes('Xiao Liu'));assert.ok(!h.root.innerHTML.includes('chat-form'));await h.page('shape');
  for(const [step,label]of [['style','Make it your own.'],['story','Your project story.'],['characters','Your puppets.'],['motion','Try it in motion.'],['make','Ready for the light.']]){await h.click({step});assert.ok(h.root.innerHTML.includes(label),step);await h.page(step);}
  await h.click({action:'print'});assert.equal(h.printed,true);assert.ok(h.printRoot.innerHTML.includes('50 mm'));assert.ok(h.printRoot.innerHTML.includes('Assembly'));
  await h.click({template:'neutral'});assert.ok(h.root.innerHTML.includes('Start with a simple shape.'));await h.click({step:'characters'});assert.equal((h.root.innerHTML.match(/<article class="character-card/g)||[]).length,2);
  await h.click({action:'choose-character',index:'1'});await h.click({step:'style'});await h.click({action:'toggle-ai'});assert.ok(h.root.innerHTML.includes('chat-form'));
  h.listeners.get('submit')({target:{id:'chat-form',dataset:{task:'design'}},preventDefault:()=>{}});await new Promise(r=>setTimeout(r,30));assert.ok(h.root.innerHTML.includes('Before'));assert.ok(h.root.innerHTML.includes('Proposed'));assert.ok(h.root.innerHTML.includes('data-change-path="primary"'));await h.page('proposal');
  await h.change({dataset:{changePath:'primary'},checked:false});await h.click({action:'apply-proposal'});let project=await h.downloadProject();assert.equal(project.characters[1].primary,'#d2c8b6');assert.equal(project.characters[1].garment.sleeveWidth,1.4);assert.equal(project.revisions.length,1);
  await h.click({action:'versions'});assert.ok(h.root.innerHTML.includes('versions-drawer'));await h.page('versions');await h.click({action:'restore-version',id:project.revisions[0].id});assert.ok(!h.root.innerHTML.includes('versions-drawer'));project=await h.downloadProject();assert.equal(project.characters[1].garment.sleeveWidth,1);
  await h.click({action:'language'});assert.equal(document.documentElement.lang,'zh');await h.page('chinese');
  assert.equal(h.storageReads,0);assert.equal(h.storageWrites,0);
 }finally{h.restore();}
});

test('classic sessions start fresh, erase only their former snapshot, and retain explicit download/open',async()=>{
 const h=harness();
 try{
  await h.open();
  assert.ok(!h.root.innerHTML.includes('A closed session must not reopen'));
  assert.ok(h.root.innerHTML.includes('Session only — download to keep'));
  assert.equal(h.saved.has('bnta-shadow-studio-v1'),false);
  assert.equal(h.saved.get('bnta-studio-endpoint'),'https://relay.example/api/studio');
  await h.change({dataset:{field:'name'},value:'My downloaded character'});
  const original=await h.downloadProject();
  assert.equal(original.characters[0].name,'My downloaded character');
  assert.equal(h.downloads.at(-1).name,'shadow-studio-project.json');
  let prevented=false;
  h.documentListeners.get('keydown')({key:'s',ctrlKey:true,preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(h.downloads.length,2,'Ctrl+S downloads exactly once');
  assert.equal(h.windowListeners.has('beforeunload'),false,'Closing must not write a project');
  h.windowListeners.get('pagehide')({persisted:true});
  h.windowListeners.get('pageshow')({persisted:false});assert.equal(h.reloads,0);
  h.windowListeners.get('pageshow')({persisted:true});assert.equal(h.reloads,1,'Back/forward restoration restarts the application');
  await h.open();
  const fresh=await h.downloadProject();assert.equal(fresh.characters[0].name,'');assert.deepEqual(fresh.revisions,[]);
  await h.click({action:'import'});assert.equal(h.fakeInput.opened,true);
  const text=JSON.stringify(original);
  await h.fileListeners.get('change')({target:{files:[{size:text.length,text:async()=>text}],value:'chosen.json'}});
  assert.equal((await h.downloadProject()).characters[0].name,'My downloaded character');
  assert.equal(h.storageReads,0);assert.equal(h.storageWrites,0);
 }finally{h.restore();}
});

