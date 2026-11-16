import test from 'node:test';import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
test('student workflow, AI review, selective apply, versions and printing',async()=>{
 const listeners=new Map(),root={innerHTML:'',addEventListener:(type,fn)=>listeners.set(type,fn),contains:()=>true};
 const fakeInput={addEventListener:()=>{}},chatInput={value:'Give it a blue robe and longer sleeves',focus:()=>{}},printRoot={innerHTML:''},toast={textContent:'',classList:{add:()=>{},remove:()=>{}}};
 const old=Object.fromEntries(['document','window','localStorage','fetch','cancelAnimationFrame'].map(k=>[k,globalThis[k]])),saved=new Map();let printed=false;
 globalThis.document={querySelector:s=>s==='#app'?root:s==='#file-input'?fakeInput:s==='#chat-input'?chatInput:s==='#print-root'?printRoot:s==='#toast'?toast:null,documentElement:{lang:'en'},addEventListener:()=>{}};
 globalThis.window={addEventListener:()=>{},print:()=>{printed=true;}};globalThis.localStorage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};globalThis.fetch=async(url,options)=>options?.method==='POST'?{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({reply:'Review these edits.',design:{primary:'#123456',garment:{sleeveWidth:1.4}}})}}]})}:{ok:false};globalThis.cancelAnimationFrame=()=>{};
 const click=async dataset=>listeners.get('click')({target:{closest:()=>({dataset})}});
 const change=async el=>listeners.get('change')({target:{dataset:{},matches:()=>false,...el}});
 const page=async name=>{await mkdir(new URL('../dist/qa/',import.meta.url),{recursive:true});await writeFile(new URL('../dist/qa/'+name+'.html',import.meta.url),root.innerHTML);};
 try{
  await import('../public/app.mjs');assert.ok(root.innerHTML.includes('Start with a simple shape.'));assert.ok(!root.innerHTML.includes('Xiao Liu'));assert.ok(!root.innerHTML.includes('chat-form'));await page('shape');
  for(const [step,label]of [['style','Make it your own.'],['story','Your project story.'],['characters','Your puppets.'],['motion','Try it in motion.'],['make','Ready for the light.']]){await click({step});assert.ok(root.innerHTML.includes(label),step);await page(step);}
  await click({action:'print'});assert.equal(printed,true);assert.ok(printRoot.innerHTML.includes('50 mm'));assert.ok(printRoot.innerHTML.includes('Assembly'));
  await click({template:'neutral'});assert.ok(root.innerHTML.includes('Start with a simple shape.'));await click({step:'characters'});assert.equal((root.innerHTML.match(/<article class="character-card/g)||[]).length,2);
  await click({action:'choose-character',index:'1'});await click({step:'style'});await click({action:'toggle-ai'});assert.ok(root.innerHTML.includes('chat-form'));
  listeners.get('submit')({target:{id:'chat-form',dataset:{task:'design'}},preventDefault:()=>{}});await new Promise(r=>setTimeout(r,30));assert.ok(root.innerHTML.includes('Before'));assert.ok(root.innerHTML.includes('Proposed'));assert.ok(root.innerHTML.includes('data-change-path="primary"'));await page('proposal');
  await change({dataset:{changePath:'primary'},checked:false});await click({action:'apply-proposal'});await new Promise(r=>setTimeout(r,300));let project=JSON.parse([...saved.values()][0]);assert.equal(project.characters[1].primary,'#d2c8b6');assert.equal(project.characters[1].garment.sleeveWidth,1.4);assert.equal(project.revisions.length,1);
  await click({action:'versions'});assert.ok(root.innerHTML.includes('versions-drawer'));await page('versions');await click({action:'restore-version',id:project.revisions[0].id});assert.ok(!root.innerHTML.includes('versions-drawer'));await new Promise(r=>setTimeout(r,300));project=JSON.parse([...saved.values()][0]);assert.equal(project.characters[1].garment.sleeveWidth,1);
  await click({action:'language'});assert.ok(root.innerHTML.includes('从基础形态开始。'));await page('chinese');
 }finally{await new Promise(r=>setTimeout(r,350));for(const [key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
