import test from 'node:test';
import assert from 'node:assert/strict';
import {startClassroom} from '../public/classroom-app.mjs';
import {createClassroom,applyClassroomAction,importClassroom} from '../public/classroom-model.mjs';
import {createStudioProject,makePart} from '../public/studio-model.mjs';

const decode=s=>String(s||'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function attrs(markup){const out={};for(const m of markup.matchAll(/([\w:-]+)(?:="([^"]*)")?/g))out[m[1]]=decode(m[2]??'');return out;}
function dataset(a){return Object.fromEntries(Object.entries(a).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));}
function formsFrom(markup){return [...markup.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].map(match=>{
  const form={dataset:dataset(attrs(match[1])),controls:[],closest:selector=>selector==='form[data-form]'?form:null};
  for(const m of match[2].matchAll(/<input\b([^>]*)>|<(textarea|select)\b([^>]*)>([\s\S]*?)<\/\2>/g)){
    const kind=m[2]||'input',a=attrs(m[1]??m[3]);if(!a.name)continue;let value=a.value??'';
    if(kind==='textarea')value=decode(m[4]);if(kind==='select'){const opts=[...(m[4]||'').matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(o=>({a:attrs(o[1]),label:decode(o[2])}));const selected=opts.find(o=>'selected'in o.a)||opts[0];value=selected?.a.value??selected?.label??'';}
    form.controls.push({name:a.name,value,type:a.type||kind,disabled:'disabled'in a,checked:'checked'in a,closest:selector=>selector==='form[data-form]'?form:null});
  }
  form.elements={namedItem:name=>form.controls.find(c=>c.name===name)};return form;
});}
function fixture(){const actor={role:'teacher',name:'Teacher'};let c=createClassroom({title:'Grade 8'});for(const [type,payload]of [['group.add',{id:'g1',name:'Our group'}],['member.add',{id:'alice',name:'Alice'}],['member.add',{id:'bob',name:'Bob'}]])c=applyClassroomAction(c,{type,groupId:'g1',payload},actor);return c;}

// Event-wiring harness only. This intentionally does not claim browser layout,
// pointer geometry, screenshot fidelity, or physical puppet verification.
function harness(){
  const names=['document','window','location','navigator','fetch','FormData','setInterval','clearInterval'],previous=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const rootListeners=new Map(),windowListeners=new Map(),files=new Map(),elements=new Map(),downloads=[],urls=new Map(),messages=[],intervals=new Map();let frame=null,panel=null;
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
  const modal={open:false,showModal(){this.open=true;}};
  const root={_html:'',forms:[],get innerHTML(){return this._html;},set innerHTML(v){this._html=v;this.forms=formsFrom(v);},addEventListener:(name,fn)=>rootListeners.set(name,fn),querySelectorAll:selector=>selector==='form[data-form]'?root.forms:[],querySelector:selector=>{const f=selector.match(/^form\[data-form="([^"]+)"\]$/);if(f)return root.forms.find(x=>x.dataset.form===f[1]);if(selector==='dialog')return modal;return null;}};
  for(const name of ['classroom-file','classroom-image'])files.set(name,{value:'',files:[],listeners:new Map(),addEventListener(type,fn){this.listeners.set(type,fn);},click(){}});
  const top={notes:[],append(note){this.notes.push(note);}};
  const doc={documentElement:{lang:'en'},hidden:false,activeElement:null,body:{append(el){panel=el;elements.set(el.id,el);}},getElementById:id=>id==='classroom-app'?root:files.get(id)||elements.get(id)||null,querySelector:selector=>selector==='#classroom-designer iframe'?frame:selector==='.designer-top'?top:null,createElement(tag){
    if(tag==='a')return {href:'',download:'',click(){downloads.push({name:this.download,blob:urls.get(this.href)});}};
    if(tag==='dialog'){const dialog={id:'',className:'',open:false,showModal(){this.open=true;},addEventListener(){},remove(){elements.delete(this.id);panel=null;frame=null;},set innerHTML(value){this.markup=value;frame={contentWindow:{postMessage(data,origin){messages.push({data:structuredClone(data),origin});}}};elements.set('classroom-designer-save',{onclick:null});}};return dialog;}
    return {textContent:'',setAttribute(){},append(){}};
  }};
  const set=(k,v)=>Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
  set('document',doc);set('window',{addEventListener:(name,fn)=>windowListeners.set(name,fn)});set('location',{origin:'https://classroom.test',href:'https://classroom.test/'});set('navigator',{clipboard:{writeText:async()=>{}}});set('fetch',async()=>Response.json({available:false,teacherSignedIn:false}));
  set('FormData',class {constructor(form){this.entriesValue=form.controls.filter(c=>!c.disabled&&(!['checkbox','radio'].includes(c.type)||c.checked)).map(c=>[c.name,c.value]);} [Symbol.iterator](){return this.entriesValue[Symbol.iterator]();}getAll(name){return this.entriesValue.filter(([key])=>key===name).map(([,v])=>v);}});
  set('setInterval',fn=>{const id=intervals.size+1;intervals.set(id,fn);return id;});set('clearInterval',id=>intervals.delete(id));URL.createObjectURL=blob=>{const url='blob:'+urls.size;urls.set(url,blob);return url;};URL.revokeObjectURL=url=>urls.delete(url);
  const controller=startClassroom();
  async function settle(){for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));if(!controller.state.busy&&i>1)return;}assert.fail('Controller did not settle.');}
  const form=(type,match={})=>root.forms.find(f=>f.dataset.form===type&&Object.entries(match).every(([k,v])=>f.elements.namedItem(k)?.value===v));
  return {controller,root,messages,downloads,top,
    async submit(type,values={},match={},decision=''){const f=form(type,match);assert.ok(f,'Rendered form '+type);for(const [k,v]of Object.entries(values)){const input=f.elements.namedItem(k);assert.ok(input,'Rendered field '+k);input.value=String(v);}rootListeners.get('submit')({target:f,preventDefault(){},submitter:{value:decision}});await settle();},
    async click(action,match={}){const tags=[...root.innerHTML.matchAll(/<(?:button|g)\b([^>]*)>/g)].map(m=>attrs(m[1]));const a=tags.find(a=>a['data-action']===action&&Object.entries(match).every(([k,v])=>dataset(a)[k]===v));assert.ok(a,'Rendered action '+action+' '+JSON.stringify(match));const target={dataset:dataset(a),disabled:'disabled'in a,closest:s=>s==='[data-action]'?target:null};rootListeners.get('click')({target});await settle();},
    input(type,name,value,match={}){const f=form(type,match),input=f?.elements.namedItem(name);assert.ok(input,'Input '+type+'.'+name);input.value=value;rootListeners.get('input')({target:input});},
    field:(type,name,match={})=>form(type,match)?.elements.namedItem(name)?.value,
    async message(data,{origin='https://classroom.test',source}={}){windowListeners.get('message')({data,origin,source:source||frame?.contentWindow});await settle();},
    async requestDesignerSave(){assert.ok(panel);elements.get('classroom-designer-save').onclick();await settle();},
    hasDesigner:()=>!!panel,
    async chooseFile(file){const input=files.get('classroom-file');input.files=[file];input.listeners.get('change')();await settle();},
    async settle(){await settle();},
    cleanup(){windowListeners.get('pagehide')?.();URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;for(const [k,d]of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
  };
}

test('rendered classroom forms and buttons complete student design to teacher-confirmed submission',async()=>{
  const h=harness();try{
    await h.settle();h.controller.open(fixture(),{actor:{role:'student',memberId:'alice',groupId:'g1',name:'Alice'}});
    await h.submit('story.update',{title:'Panda helps',plot:'A panda helps a friend.',time:'Today',place:'A garden',characters:'Panda'});assert.equal(h.controller.group().story.title,'Panda helps');
    await h.click('tab',{tab:'characters'});await h.submit('character.add',{name:'Panda',brief:'A panda in a red scarf'});const char=h.controller.group().characters[0];assert.equal(char.ownerId,'alice');
    await h.click('open-designer',{id:char.id});assert.equal(h.hasDesigner(),true);await h.message({type:'classroom:ready'});assert.equal(h.messages.at(-1).data.type,'classroom:load');assert.equal(h.messages.at(-1).data.characterName,'Panda');
    const puppet=createStudioProject();puppet.parts=[makePart('Body',[[0,0],[100,0],[100,200],[0,200]])];await h.message({type:'classroom:project',project:puppet,exit:false});assert.equal(h.controller.group().characters[0].project.parts.length,1);assert.equal(h.hasDesigner(),true);
    await h.requestDesignerSave();assert.equal(h.messages.at(-1).data.type,'classroom:request-save');assert.equal(h.messages.at(-1).data.exit,true);await h.message({type:'classroom:project',project:puppet,exit:true});assert.equal(h.hasDesigner(),false);
    await h.click('tab',{tab:'script'});await h.click('add-scene');const scene=h.controller.group().scenes[0];await h.submit('scene.update',{title:'In the garden',setting:'A courtyard',script:'Panda: Let me help.'});assert.equal(h.controller.group().scenes[0].script,'Panda: Let me help.');
    await h.click('tab',{tab:'stage'});await h.click('add-stage-character',{id:char.id});assert.equal(h.controller.group().scenes[0].stage.objects[0].characterId,char.id);await h.submit('stage-object',{x:'210',y:'90',width:'160',height:'300'});assert.equal(h.controller.group().scenes[0].stage.objects[0].x,210);
    await h.click('tab',{tab:'make'});await h.submit('reflection.save',{text:'I drew the scarf.',tests:'I tested the paper body with a lamp.',sources:'My drawing.'});await h.click('submit-project');assert.equal(h.controller.group().submission.status,'submitted');
    h.controller.set({actor:{role:'teacher',name:'Teacher'},screen:'teacher',teacherTab:'assessment',assessmentGroupId:'g1',assessmentMemberId:'alice'});const scores=Object.fromEntries(h.controller.state.classroom.rubric.map(r=>['score:'+r.id,'3']));await h.submit('assessment',{...scores,comment:'Document how the next joint test changes your design.'},{},'confirm');assert.equal(h.controller.group().assessments[0].confirmed,true);
    await h.click('download-classroom');const downloaded=h.downloads.at(-1);assert.ok(downloaded.name.endsWith('.shadow-class.json'));const reopened=importClassroom(await downloaded.blob.text());assert.equal(reopened.groups[0].scenes[0].id,scene.id);assert.equal(reopened.groups[0].assessments[0].confirmed,true);assert.equal(h.controller.state.error,'');
  }finally{h.cleanup();}
});

test('iframe save bridge rejects foreign origin and unrelated same-origin sender',async()=>{
  const h=harness();try{h.controller.open(fixture(),{actor:{role:'student',memberId:'alice',groupId:'g1',name:'Alice'}});await h.click('tab',{tab:'characters'});await h.submit('character.add',{name:'Panda',brief:'My panda'});const char=h.controller.group().characters[0];await h.click('open-designer',{id:char.id});const revision=h.controller.state.classroom.revision;
    await h.message({type:'classroom:project',project:createStudioProject(),exit:true},{origin:'https://foreign.test'});await h.message({type:'classroom:project',project:createStudioProject(),exit:true},{source:{}});assert.equal(h.controller.state.classroom.revision,revision);assert.equal(h.hasDesigner(),true);
  }finally{h.cleanup();}
});

test('unsaved member-name drafts do not bleed into another member or clear on unrelated save',async()=>{
  const h=harness();try{h.controller.open(fixture());h.controller.set({teacherTab:'groups'});h.input('rename-member','name','Alice draft',{memberId:'alice'});await h.click('language');assert.equal(h.field('rename-member','name',{memberId:'alice'}),'Alice draft');assert.equal(h.field('rename-member','name',{memberId:'bob'}),'Bob');await h.submit('rename-group',{name:'Renamed group'},{groupId:'g1'});assert.equal(h.field('rename-member','name',{memberId:'alice'}),'Alice draft');assert.equal(h.controller.state.dirty,true);await h.submit('rename-member',{name:'Alice final'},{memberId:'alice'});assert.equal(h.controller.group().members[0].name,'Alice final');
  }finally{h.cleanup();}
});

test('explicit download and reopen recover unsaved form text without silently accepting it',async()=>{
  let contents;const first=harness();try{first.controller.open(fixture(),{actor:{role:'student',memberId:'alice',groupId:'g1',name:'Alice'}});first.input('story.update','plot','My typed idea has not been saved.');assert.equal(first.controller.group().story.plot,'');await first.click('download-classroom');contents=await first.downloads.at(-1).blob.text();assert.equal(first.controller.group().story.plot,'');}finally{first.cleanup();}
  const reopened=harness();try{await reopened.chooseFile({size:new TextEncoder().encode(contents).length,text:async()=>contents});assert.equal(reopened.controller.group().story.plot,'');assert.equal(reopened.field('story.update','plot'),'My typed idea has not been saved.');assert.equal(reopened.controller.state.dirty,true);await reopened.submit('story.update');assert.equal(reopened.controller.group().story.plot,'My typed idea has not been saved.');assert.equal(reopened.controller.state.error,'');}finally{reopened.cleanup();}
});
