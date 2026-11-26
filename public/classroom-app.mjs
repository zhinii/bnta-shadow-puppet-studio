import {createClassroom,normalizeClassroom,applyClassroomAction,CLASSROOM_MAX_BYTES} from './classroom-model.mjs?v=0.9.0';
import {renderClassroom,escapeClassroomHtml} from './classroom-views.mjs?v=0.9.0';
import {requestClassroomHelp,requestStageImage} from './classroom-ai.mjs?v=0.8.0';
import {packClassroomBundle,unpackClassroomBundle} from './classroom-bundle.mjs?v=0.8.0';

const blankState=()=>({screen:'welcome',tab:'story',classroom:null,groupId:null,actor:{role:'teacher'},authorByGroup:{},language:'en',status:'',error:'',busy:false,storageMode:'local',selectedCharacterId:null,selectedSceneId:null,selectedObjectId:null,aiProposal:null,dirty:false,fileDirty:false,draftsSaved:false});
export const PROJECT_FILE_MAX_BYTES=CLASSROOM_MAX_BYTES;
function checkedProjectFile(source){if(typeof source!=='string'||source.length>PROJECT_FILE_MAX_BYTES||new TextEncoder().encode(source).byteLength>PROJECT_FILE_MAX_BYTES)throw Error('Project files must be under 100 MiB. Use smaller artwork or remove unneeded images.');return source;}
function projectAuthors(classroom,authors={}){return Object.fromEntries(classroom.groups.filter(g=>g.members.some(m=>m.id===authors?.[g.id])).map(g=>[g.id,authors[g.id]]));}
const clone=v=>structuredClone(v),id=prefix=>prefix+'-'+crypto.randomUUID();
const editableForms=new Set(['story.update','character.add','character.update','scene.update','ai-story','ai-script','ai-stage','stage-object','stage-background','generate-stage-image','reflection.save']);
function normalizedWorkspaceDrafts(classroom,drafts){return (Array.isArray(drafts)?drafts:[]).filter(x=>Array.isArray(x)&&x.length===2).filter(([key,values])=>typeof key==='string'&&key.startsWith(classroom.id+':')&&key.length<1000&&values&&typeof values==='object'&&!Array.isArray(values)).slice(0,100).map(([key,values])=>[key,Object.fromEntries(Object.entries(values).filter(([k,v])=>!['__proto__','constructor','prototype','passphrase','password','token'].includes(k)&&k.length<=100&&typeof v==='string').map(([k,v])=>[k,v.slice(0,30000)]))]);}
export function exportWorkspaceFile(classroom,drafts=[],view={}){
 const safeDrafts=normalizedWorkspaceDrafts(classroom,drafts);
 return checkedProjectFile(JSON.stringify(packClassroomBundle({...normalizeClassroom(classroom),workspaceDrafts:safeDrafts,workspaceView:{groupId:view.groupId||null,memberId:view.actor?.memberId||null,authorByGroup:projectAuthors(classroom,view.authorByGroup),tab:view.tab||null,selectedCharacterId:view.selectedCharacterId||null,selectedSceneId:view.selectedSceneId||null,selectedObjectId:view.selectedObjectId||null}}),null,2));
}
export function importWorkspaceFile(source){const raw=unpackClassroomBundle(JSON.parse(checkedProjectFile(source))),classroom=normalizeClassroom(raw),drafts=normalizedWorkspaceDrafts(classroom,raw.workspaceDrafts),view=raw.workspaceView&&typeof raw.workspaceView==='object'?raw.workspaceView:{};view.authorByGroup=projectAuthors(classroom,view.authorByGroup);return {classroom,drafts,view};}
export function createClassroomController({onChange=()=>{}}={}) {
  const state=blankState();let mutation=Promise.resolve(),generation=0;
  const notify=()=>onChange(state);
  function set(values){Object.assign(state,values);notify();return state;}
  function open(data,{actor={},groupId,authorByGroup={}}={}){
    let c=normalizeClassroom(data);c.archived=false;
    if(!c.groups.length)c=applyClassroomAction(c,{type:'group.add',payload:{name:c.title}},{role:'teacher'});
    const g=c.groups.find(g=>g.id===(groupId||actor.groupId))||c.groups[0];
    if(!g.members.length)c=applyClassroomAction(c,{type:'member.add',groupId:g.id,payload:{name:actor.name||(c.language==='zh'?'创作者':'Creator')}},{role:'teacher'});
    const members=c.groups.find(x=>x.id===g.id).members,author=members.find(m=>m.id===(actor.memberId||authorByGroup?.[g.id]))||members[0];
    generation++;set({...blankState(),classroom:c,language:c.language,groupId:g.id,actor:{role:'teacher',memberId:author.id,groupId:g.id,name:author.name},authorByGroup:{...projectAuthors(c,authorByGroup),[g.id]:author.id},screen:'workspace',draftsSaved:true,status:c.language==='zh'?'项目已打开。下载 JSON 文件以保存进度。':'Project opened. Download a JSON file to keep your progress.'});return c;
  }
  async function dispatch(action) {
    const requestedGeneration=generation,requestedClass=state.classroom?.id;
    const run=async()=>{
      if(requestedGeneration!==generation||requestedClass!==state.classroom?.id)throw Error('The open project changed. This change was not applied to the new project.');
      if(!state.classroom)throw Error('Open a project first.');
      const c=state.classroom;
      const localAction=action.type==='reflection.save'?{...action,payload:{...action.payload,memberId:state.actor.memberId}}:action;
      state.classroom=applyClassroomAction(c,localAction,state.actor);
      if(!state.classroom.groups.some(g=>g.id===state.groupId))state.groupId=state.classroom.groups[0]?.id||null;
      state.fileDirty=true;state.status=state.language==='zh'?'更改已加入项目。下载项目以保存。':'Changes added to this project. Download it to keep them.';state.error='';notify();return state.classroom;
    };
    const result=mutation.then(run);mutation=result.catch(()=>{});return result;
  }
  return {state,set,open,dispatch,group:()=>state.classroom?.groups.find(g=>g.id===state.groupId),reset(){generation++;Object.assign(state,blankState());notify();}};
}

if(typeof document!=='undefined'&&document.getElementById('classroom-app')) startClassroom();
export function startClassroom() {
 const root=document.getElementById('classroom-app'),escape=escapeClassroomHtml;
 const controller=createClassroomController({onChange:render}),s=controller.state;
 let modal=null,designer=null,aiAbort=null,drag=null,assetIntent=null;
 const drafts=new Map();
 const draftKey=form=>[s.classroom?.id,s.groupId,form.dataset.form,...['groupId','characterId','sceneId','memberId','field','id'].map(name=>{const input=form.elements.namedItem(name);return input?.type==='hidden'?input.value:'';}),...(['ai-stage','ai-script','stage-background','generate-stage-image','stage-object'].includes(form.dataset.form)?[scene()?.id]:[]),...(form.dataset.form==='stage-object'?[s.selectedObjectId]:[])].join(':');
 const fileInput=document.getElementById('classroom-file'),imageInput=document.getElementById('classroom-image');
 const t=(en,zh)=>s.language==='zh'?zh:en;
 const group=()=>controller.group();
 const scene=()=>group()?.scenes.find(x=>x.id===s.selectedSceneId)||group()?.scenes[0];
 const character=()=>group()?.characters.find(x=>x.id===s.selectedCharacterId)||group()?.characters[0];
 function render(){
  document.documentElement.lang=s.language==='zh'?'zh-CN':'en';
  s.dirty=s.fileDirty||(!s.draftsSaved&&[...drafts.keys()].some(k=>k.startsWith(s.classroom?.id+':')));
  if(designer)return;
  const active=document.activeElement,focus=active?.id,selection=typeof active?.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null;
  root.innerHTML=renderClassroom(s)+renderModal();
  for(const form of root.querySelectorAll('form[data-form]')){const draft=drafts.get(draftKey(form));if(draft)for(const [name,value]of Object.entries(draft)){const input=form.elements.namedItem(name);if(input&&input.type!=='file')input.value=value;}}
  if(modal){const d=root.querySelector('dialog');if(d&&!d.open)d.showModal();}
  if(focus){const el=document.getElementById(focus);el?.focus({preventScroll:true});if(selection&&el?.setSelectionRange)try{el.setSelectionRange(...selection);}catch{}}
 }
 function renderModal(){if(!modal)return '';return `<dialog class="classroom-dialog" aria-labelledby="modal-title"><form data-form="modal"><h2 id="modal-title">${escape(modal.title)}</h2>${modal.description?`<p>${escape(modal.description)}</p>`:''}${modal.fields.map(f=>`<label>${escape(f.label)}${f.options?`<select name="${escape(f.name)}">${f.options.map(o=>`<option value="${escape(o.value)}">${escape(o.label)}</option>`).join('')}</select>`:`<input name="${escape(f.name)}" type="${f.type||'text'}" value="${escape(f.value||'')}" maxlength="${f.max||160}" ${f.required===false?'':'required'}>`}</label>`).join('')}<div class="classroom-actions">${modal.canDownload?`<button type="button" data-action="download-classroom">${t('Download current project','下载当前项目')}</button>`:''}<button type="button" data-action="close-modal">${t('Cancel','取消')}</button><button type="submit" class="primary">${escape(modal.submit||t('Continue','继续'))}</button></div></form></dialog>`;}
 function ask(config){modal=config;render();}
 function replaceProject(next){if(!s.dirty){next();return;}ask({title:t('Replace this project?','替换当前项目？'),description:t('This project has changes that you have not downloaded. Download it first if you want to keep them.','当前项目有尚未下载的修改。请先下载以保留这些内容。'),fields:[],canDownload:true,submit:t('Replace project','替换项目'),save:async()=>next()});}
 function downloadProject(){if(!s.classroom)return;download(s.classroom.title+'.shadow-project.json',exportWorkspaceFile({...s.classroom,language:s.language},[...drafts],s));s.fileDirty=false;s.draftsSaved=true;s.dirty=false;s.status=t('JSON download started. Open this file to continue later.','JSON 文件已开始下载。下次打开此文件即可继续。');}

 async function run(fn){if(s.busy)return;controller.set({busy:true,error:''});try{await fn();}catch(e){s.error=e.name==='AbortError'?t('Request cancelled. Your work is unchanged.','请求已取消，作品没有更改。'):e.message;}finally{s.busy=false;s.aiBusy=false;render();}}
 function action(type,payload={},groupId=s.groupId){return controller.dispatch({type,groupId,payload});}
 function download(name,body,type='application/json'){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*]/g,'-');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function saveStage(stage){await action('stage.update',{sceneId:scene().id,stage});}
 function nextTab(){const order=['story','characters','script','design','stage','make'];controller.set({tab:order[Math.min(order.indexOf(s.tab)+1,order.length-1)]});}
 async function openDesigner(char,step){
  if(!char)return;
  designer={characterId:char.id,groupId:s.groupId,step};
  const panel=document.createElement('dialog');panel.id='classroom-designer';panel.className='designer-dialog';panel.innerHTML=`<div class="designer-top"><strong>${escape(char.name)}</strong><button type="button" id="classroom-designer-save">${t('Keep changes and return','保留修改并返回')}</button></div><iframe title="${t('Puppet designer','皮影设计')}" src="${new URL('./studio.html?classroom=1',import.meta.url).href}"></iframe>`;
  document.body.append(panel);panel.showModal();panel.addEventListener('cancel',e=>{e.preventDefault();requestDesignerSave();});document.getElementById('classroom-designer-save').onclick=requestDesignerSave;
 }
 function requestDesignerSave(){document.querySelector('#classroom-designer iframe')?.contentWindow.postMessage({type:'classroom:request-save',exit:true},location.origin);}
 async function rasterPreview(svg){if(typeof svg!=='string'||svg.length>18_000_000)return '';return new Promise(resolve=>{const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),img=new Image();img.onload=()=>{try{const canvas=document.createElement('canvas'),ratio=Math.min(1,480/Math.max(img.naturalWidth||800,img.naturalHeight||1000));canvas.width=Math.max(1,Math.round((img.naturalWidth||800)*ratio));canvas.height=Math.max(1,Math.round((img.naturalHeight||1000)*ratio));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/png'));}catch{resolve('');}finally{URL.revokeObjectURL(url);}};img.onerror=()=>{URL.revokeObjectURL(url);resolve('');};img.src=url;});}
 window.addEventListener('message',event=>{
  const frame=document.querySelector('#classroom-designer iframe');
  if(!designer||event.origin!==location.origin||event.source!==frame?.contentWindow)return;
  if(event.data?.type==='classroom:ready'){const char=group()?.characters.find(c=>c.id===designer.characterId);frame.contentWindow.postMessage({type:'classroom:load',project:char?.project||null,characterName:char?.name,brief:char?.brief||'',language:s.language,step:designer.step},location.origin);}
  if(event.data?.type==='classroom:error'){const note=document.createElement('p');note.setAttribute('role','alert');note.textContent=event.data.message||event.data.error||t('Finish or cancel the preview before saving.','请先完成或取消预览再保存。');document.querySelector('.designer-top')?.append(note);}
  if(event.data?.type==='classroom:project'){const target={...designer};run(async()=>{try{const previewDataUrl=await rasterPreview(event.data.previewSvg);await action('character.update',{characterId:target.characterId,project:event.data.project,...(previewDataUrl?{previewDataUrl}:{})},target.groupId);if(event.data.exit){document.getElementById('classroom-designer')?.remove();designer=null;s.tab='design';}else{const note=document.createElement('p');note.setAttribute('role','status');note.textContent=t('Character added to your project. Download the project to keep it.','角色已加入项目。下载项目以保存。');document.querySelector('.designer-top')?.append(note);}}catch(error){const note=document.createElement('p');note.setAttribute('role','alert');note.textContent=error.message;document.querySelector('.designer-top')?.append(note);throw error;}});}
 });
 async function ai(task,prompt){
  aiAbort?.abort();aiAbort=new AbortController();s.aiBusy=true;render();const g=group(),currentScene=scene(),classId=s.classroom.id,revision=s.classroom.revision;
  const context={story:g?.story,characters:g?.characters.map(({id,name,brief})=>({id,name,brief})),scenes:g?.scenes.map(({id,title,setting,script})=>({id,title,setting,script})),stage:currentScene?.stage,sceneId:currentScene?.id};
  const result=await requestClassroomHelp({task,prompt,context,language:s.language,signal:aiAbort.signal});
  if(s.classroom?.id!==classId||s.groupId!==g.id||(['stage','script'].includes(task)&&scene()?.id!==currentScene?.id))return;
  s.aiProposal={...result,target:task,groupId:g.id,sceneId:currentScene?.id,baseRevision:revision};
 }
 async function applyAI(){const p=s.aiProposal;if(!p)return;if(p.groupId!==s.groupId||p.baseRevision!==s.classroom.revision)throw Error(t('Your project changed. Ask for a fresh suggestion so it uses your latest work.','项目已有修改，请重新请求建议。'));if(p.target==='stage-image'){await action('stage.update',{sceneId:p.sceneId,stage:{...group().scenes.find(x=>x.id===p.sceneId).stage,background:p.proposal.background.asset.dataUrl}});}else if(p.target==='story')await action('story.update',p.proposal.story);else if(p.target==='script'){for(const draft of p.proposal.scenes||[]){const existing=group().scenes.find(sc=>sc.id===draft.id);await action(existing?'scene.update':'scene.add',existing?{...draft,sceneId:existing.id}:draft);}}else if(p.target==='stage'){const sc=group().scenes.find(x=>x.id===p.sceneId);if(!sc)throw Error('Choose a scene.');const objects=(p.proposal.objects||[]).map((o,i)=>({...o,id:id('object'),z:(sc.stage.objects?.length||0)+i}));await action('stage.update',{sceneId:sc.id,stage:{...sc.stage,objects:[...(sc.stage.objects||[]),...objects]}});}s.aiProposal=null;}
 root.addEventListener('input',event=>{s.dirty=true;s.draftsSaved=false;const form=event.target.closest('form[data-form]');if(form&&editableForms.has(form.dataset.form))drafts.set(draftKey(form),Object.fromEntries(new FormData(form)));if(event.target.name==='stageImagePrompt'){const out=root.querySelector('[data-stage-prompt-count]');if(out)out.textContent=event.target.value.length+' / 800';}});
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const a=button.dataset.action,bid=button.dataset.id;
  if(a==='language'){s.language=s.language==='en'?'zh':'en';render();return;}
  if(a==='close-modal'){modal=null;render();return;}
  if(a==='cancel-ai'){aiAbort?.abort();return;}
  if(a==='tab'){controller.set({tab:button.dataset.tab,aiProposal:null});return;}
  if(a==='next-step'){nextTab();return;}
  if(a==='home'){controller.set({screen:'welcome'});return;}
  if(a==='resume-project'){controller.set({screen:'workspace'});return;}
  if(a==='quick-studio'){location.href=new URL('./studio.html',import.meta.url).href;return;}
  if(a==='open-classroom'){fileInput.click();return;}
  if(a==='new-local-classroom'){ask({title:t('New project','新建项目'),description:t('Write, design and make. Download a JSON file to keep your progress.','编写故事、设计并制作。下载 JSON 文件以保存进度。'),fields:[{name:'title',label:t('Project name','项目名称')},{name:'name',label:t('Your name (optional)','你的名字（选填）'),required:false}],submit:t('Start project','开始项目'),save:async v=>{let c=createClassroom({title:v.title,language:s.language});c=applyClassroomAction(c,{type:'group.add',payload:{name:v.title}},{role:'teacher'});c=applyClassroomAction(c,{type:'member.add',groupId:c.groups[0].id,payload:{name:v.name?.trim()||t('Creator','创作者')}},{role:'teacher'});replaceProject(()=>{aiAbort?.abort();drafts.clear();controller.open(c);s.fileDirty=true;});}});return;}
  if(a==='download-classroom'){try{downloadProject();s.error='';}catch(error){s.error=error.message;}render();return;}
  if(a==='download-character'){const c=group()?.characters.find(c=>c.id===bid);if(c?.project)download(c.name+'.puppet.json',JSON.stringify(c.project,null,2));return;}
  if(a==='select-character'){controller.set({selectedCharacterId:bid,...(button.dataset.tab?{tab:button.dataset.tab}:{})});return;}
  if(a==='select-scene'){controller.set({selectedSceneId:bid,selectedObjectId:null});return;}
  if(a==='select-object'){controller.set({selectedObjectId:bid});return;}
  if(a==='upload-background'||a==='upload-stage-image'){assetIntent=a;imageInput.click();return;}
  if(a==='preview-stage'){controller.set({scenePreview:true});return;}
  if(a==='close-stage-preview'){controller.set({scenePreview:false});return;}
  if(a==='previous-scene'||a==='next-scene'){const scenes=group()?.scenes||[],n=scenes.findIndex(x=>x.id===scene()?.id);controller.set({selectedSceneId:scenes[(n+(a==='next-scene'?1:-1)+scenes.length)%scenes.length]?.id});return;}
  if(a==='ai-reject'||a==='reject-ai'){controller.set({aiProposal:null});return;}
  run(async()=>{
   if(a==='open-designer')await openDesigner(group()?.characters.find(c=>c.id===bid)||character(),button.dataset.step);
   else if(a==='remove-character'){await action('character.remove',{characterId:bid});s.selectedCharacterId=null;}
   else if(a==='add-scene'){const sid=id('scene');await action('scene.add',{id:sid,title:t('New scene','新场景')});s.selectedSceneId=sid;}
   else if(a==='remove-scene'){await action('scene.remove',{sceneId:bid});s.selectedSceneId=null;}
   else if(a==='restore-story')await action('story.restore',{historyId:bid});
   else if(a==='restore-character')await action('character.restore',{characterId:button.dataset.characterId||s.selectedCharacterId,historyId:bid});
   else if(a==='restore-scene')await action('scene.restore',{sceneId:button.dataset.sceneId||s.selectedSceneId,historyId:bid});
   else if(a==='add-stage-character'){const sc=scene(),obj={id:id('object'),type:'character',characterId:bid,x:360,y:100,width:180,height:320,rotation:0,z:sc.stage.objects.length};await saveStage({...sc.stage,objects:[...sc.stage.objects,obj]});s.selectedObjectId=obj.id;}
   else if(a==='remove-object')await saveStage({...scene().stage,objects:scene().stage.objects.filter(o=>o.id!==bid)});
   else if(a==='object-forward'||a==='object-backward'){const objects=clone(scene().stage.objects),o=objects.find(o=>o.id===bid);if(o)o.z=(o.z||0)+(a==='object-forward'?1:-1);await saveStage({...scene().stage,objects});}
   else if(a==='clear-background')await saveStage({...scene().stage,background:null});
   else if(a==='ai-apply')await applyAI();
   else if(a==='generate-stage-image'){const prompt=root.querySelector('[name="stageImagePrompt"]')?.value||scene()?.setting;if(!prompt?.trim())throw Error(t('Describe the stage background first.','请先描述舞台背景。'));const target={classId:s.classroom.id,groupId:s.groupId,sceneId:scene().id,baseRevision:s.classroom.revision};aiAbort?.abort();aiAbort=new AbortController();s.aiBusy=true;const image=await requestStageImage({prompt,language:s.language,signal:aiAbort.signal});if(s.classroom?.id===target.classId&&s.groupId===target.groupId)s.aiProposal={target:'stage-image',...target,reply:t('Review the new background before using it.','确认背景后再使用。'),proposal:{background:image}};}
  });
 });

 root.addEventListener('submit',event=>{const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();const formData=new FormData(form),v=Object.fromEntries(formData),type=form.dataset.form,key=draftKey(form);
  run(async()=>{
   if(type==='modal'){const save=modal.save;modal=null;await save(v);}
   else if(type==='choose-workspace'){const g=s.classroom.groups.find(g=>g.id===v.groupId);if(!g)throw Error('Choose a project section.');if(!g.members.length)await action('member.add',{name:t('Creator','创作者')},g.id);const members=s.classroom.groups.find(x=>x.id===g.id).members,member=members.find(m=>m.id===s.authorByGroup[g.id])||members[0];controller.set({groupId:g.id,authorByGroup:{...s.authorByGroup,[g.id]:member.id},actor:{role:'teacher',memberId:member.id,groupId:g.id,name:member.name},selectedCharacterId:null,selectedSceneId:null,selectedObjectId:null,aiProposal:null});}
   else if(type==='story.update')await action(type,v);
   else if(type==='character.add'){const cid=id('character');await action(type,{...v,id:cid,ownerId:v.ownerId||s.actor.memberId||null});s.selectedCharacterId=cid;}
   else if(type==='character.update'){const {ownerId,...payload}=v;await action(type,payload);if(ownerId!==undefined)await action('character.assign',{characterId:v.characterId,ownerId:ownerId||null});}
   else if(type==='scene.update')await action(type,v);
   else if(type==='reflection.save')await action(type,{...v,memberId:s.actor.memberId});
   else if(type==='ai-story'||type==='ai-script'||type==='ai-stage')await ai(type.slice(3),v.prompt);
   else if(type==='stage-background')await saveStage({...scene().stage,backgroundColor:v.backgroundColor});
   else if(type==='stage-object'){const old=scene().stage.objects.find(o=>o.id===v.id),object={...old,...v,id:old?.id||id('object'),x:Number(v.x)||0,y:Number(v.y)||0,width:Number(v.width)||150,height:Number(v.height)||100,rotation:Number(v.rotation)||0,z:old?.z??scene().stage.objects.length};await saveStage({...scene().stage,objects:[...scene().stage.objects.filter(o=>o.id!==object.id),object]});s.selectedObjectId=object.id;}
   drafts.delete(key);s.dirty=false;
  });
 });
 fileInput.addEventListener('change',()=>run(async()=>{const file=fileInput.files[0];if(!file)return;fileInput.value='';if(file.size>PROJECT_FILE_MAX_BYTES)throw Error(t('Choose a project under 100 MiB.','请选择小于 100 MiB 的项目。'));const restored=importWorkspaceFile(await file.text());replaceProject(()=>{aiAbort?.abort();drafts.clear();controller.open(restored.classroom,{groupId:restored.view.groupId,actor:{memberId:restored.view.memberId},authorByGroup:restored.view.authorByGroup});for(const [key,values]of restored.drafts)drafts.set(key,values);const v=restored.view;if(['story','characters','script','design','stage','make'].includes(v.tab))s.tab=v.tab;for(const key of ['selectedCharacterId','selectedSceneId','selectedObjectId'])if(typeof v[key]==='string')s[key]=v[key];s.draftsSaved=true;s.fileDirty=false;});}));
 imageInput.addEventListener('change',()=>run(async()=>{const file=imageInput.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8_000_000)throw Error(t('Choose a PNG, JPEG or WebP image under 8 MB.','请选择小于 8 MB 的 PNG、JPEG 或 WebP 图片。'));const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const sc=scene();if(!sc)throw Error('Add a scene first.');if(assetIntent==='upload-background')await saveStage({...sc.stage,background:dataUrl});else{const object={id:id('object'),type:'image',name:file.name,dataUrl,x:300,y:150,width:200,height:200,rotation:0,z:sc.stage.objects.length};await saveStage({...sc.stage,objects:[...sc.stage.objects,object]});s.selectedObjectId=object.id;}imageInput.value='';}));
 root.addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key)||!e.target.matches?.('[data-stage-object]'))return;e.preventDefault();controller.set({selectedObjectId:e.target.dataset.stageObject});});
 root.addEventListener('pointerdown',e=>{const element=e.target.closest('[data-stage-object]');if(!element||s.busy)return;const oid=element.dataset.stageObject,sc=scene(),object=sc?.stage.objects.find(o=>o.id===oid),svg=element.ownerSVGElement;if(!object||!svg)return;const rect=svg.getBoundingClientRect(),width=sc.stage.width||960,height=sc.stage.height||540,scale=Math.min(rect.width/width,rect.height/height);drag={id:oid,sceneId:sc.id,groupId:s.groupId,startX:e.clientX,startY:e.clientY,x:object.x,y:object.y,width,height,scaleX:1/scale,scaleY:1/scale,element,pointer:e.pointerId};element.setPointerCapture?.(e.pointerId);e.preventDefault();});
 root.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;const dx=(e.clientX-drag.startX)*drag.scaleX,dy=(e.clientY-drag.startY)*drag.scaleY;drag.dx=dx;drag.dy=dy;drag.element.style.translate=dx+'px '+dy+'px';});
 root.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointer)return;const d=drag;drag=null;if(Math.abs(d.dx||0)+Math.abs(d.dy||0)<3)return;run(async()=>{if(s.groupId!==d.groupId||scene()?.id!==d.sceneId)return;const objects=clone(scene().stage.objects),object=objects.find(o=>o.id===d.id);if(!object)return;object.x=Math.round(Math.max(-object.width,Math.min(d.width,d.x+(d.dx||0))));object.y=Math.round(Math.max(-object.height,Math.min(d.height,d.y+(d.dy||0))));await saveStage({...scene().stage,objects});s.selectedObjectId=d.id;});});
 root.addEventListener('pointercancel',()=>{drag=null;render();});
 window.addEventListener('pagehide',()=>{aiAbort?.abort();});
 window.addEventListener('beforeunload',event=>{if(s.dirty||designer){event.preventDefault();event.returnValue='';}});
 render();
 return controller;
}
