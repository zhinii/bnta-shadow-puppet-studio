import test from 'node:test';import assert from 'node:assert/strict';
// A minimal DOM double tests rendering/state transitions only. It is deliberately
// not presented as browser, visual, pointer, or accessibility verification.
test('all six student views render and character creation updates the project',async()=>{
 const listeners=new Map(),root={innerHTML:'',addEventListener:(type,fn)=>listeners.set(type,fn),contains:()=>true};
 const fakeInput={addEventListener:()=>{}};
 const old={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 const saved=new Map();
 globalThis.document={querySelector:s=>s==='#app'?root:s==='#file-input'?fakeInput:null,documentElement:{lang:'en'},addEventListener:()=>{}};
 globalThis.window={addEventListener:()=>{}};globalThis.localStorage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};globalThis.fetch=async()=>({ok:false});globalThis.cancelAnimationFrame=()=>{};
 try{
  await import('../public/app.mjs');assert.ok(root.innerHTML.includes('Give your story a silhouette.'));assert.ok(root.innerHTML.includes('data-part="head"'));
  const click=async dataset=>listeners.get('click')({target:{closest:()=>({dataset})}});
  for(const [step,label]of [['story','Begin with a story.'],['characters','Meet your characters.'],['motion','Let your character move.'],['make','From screen to stage.'],['history','Every change tells a story.']]){await click({step});assert.ok(root.innerHTML.includes(label),step);}
  await click({template:'courier'});assert.ok(root.innerHTML.includes('Xiao Liu'));assert.ok(root.innerHTML.includes('Current character'));
  await click({step:'characters'});assert.equal((root.innerHTML.match(/<article class="character-card/g)||[]).length,2);
  // Allow the debounced autosave to complete before restoring the globals.
  await new Promise(resolve=>setTimeout(resolve,300));assert.equal(JSON.parse([...saved.values()][0]).characters.length,2);
 }finally{await new Promise(resolve=>setTimeout(resolve,300));for(const [key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
