import {createClassroom,normalizeClassroom,applyClassroomAction,exportClassroom,importClassroom,assessmentEvidence,exportScoresCsv} from './classroom-model.mjs?v=0.8.0';
import {renderClassroom,renderStudentWorkspace,renderWelcome,renderJoin,escapeClassroomHtml} from './classroom-views.mjs?v=0.8.0';
import {renderTeacher} from './classroom-teacher.mjs?v=0.8.0';
import {requestClassroomHelp,requestStageImage,assessmentAIContext} from './classroom-ai.mjs?v=0.8.0';
import {createClassroomClient} from './classroom-client.mjs?v=0.8.0';
import {packClassroomBundle,unpackClassroomBundle} from './classroom-bundle.mjs?v=0.8.0';

const blankState=()=>({screen:'welcome',tab:'story',classroom:null,groupId:null,actor:{role:'teacher'},language:'en',status:'',error:'',busy:false,storageMode:'local',teacherTab:'classes',classes:[],capabilities:null,selectedCharacterId:null,selectedSceneId:null,selectedObjectId:null,aiProposal:null,dirty:false,pendingUpdate:false});
const clone=v=>structuredClone(v),id=prefix=>prefix+'-'+crypto.randomUUID();
const editableForms=new Set(['story.update','story.handoff','character.add','character.update','scene.update','ai-story','ai-script','ai-stage','stage-object','stage-background','generate-stage-image','reflection.save','assessment','rename-member','rename-group','rubric']);
function normalizedWorkspaceDrafts(classroom,drafts){return (Array.isArray(drafts)?drafts:[]).filter(x=>Array.isArray(x)&&x.length===2).filter(([key,values])=>typeof key==='string'&&key.startsWith(classroom.id+':')&&key.length<1000&&values&&typeof values==='object'&&!Array.isArray(values)).slice(0,100).map(([key,values])=>[key,Object.fromEntries(Object.entries(values).filter(([k,v])=>!['__proto__','constructor','prototype','passphrase','password','token'].includes(k)&&k.length<=100&&typeof v==='string').map(([k,v])=>[k,v.slice(0,30000)]))]);}
export function exportWorkspaceFile(classroom,drafts=[],view={}){
 const safeDrafts=normalizedWorkspaceDrafts(classroom,drafts);
 return JSON.stringify(packClassroomBundle({...normalizeClassroom(classroom),workspaceDrafts:safeDrafts,workspaceView:{groupId:view.groupId||null,tab:view.tab||null,selectedCharacterId:view.selectedCharacterId||null,selectedSceneId:view.selectedSceneId||null,selectedObjectId:view.selectedObjectId||null}}),null,2);
}
export function importWorkspaceFile(source){const raw=unpackClassroomBundle(JSON.parse(source)),classroom=normalizeClassroom(raw),drafts=normalizedWorkspaceDrafts(classroom,raw.workspaceDrafts),view=raw.workspaceView&&typeof raw.workspaceView==='object'?raw.workspaceView:{};return {classroom,drafts,view};}
export function createClassroomController({client=createClassroomClient(),onChange=()=>{}}={}) {
  const state=blankState();let mutation=Promise.resolve(),generation=0;
  const notify=()=>onChange(state);
  function set(values){Object.assign(state,values);notify();return state;}
  function open(data,{actor={role:'teacher'},storageMode='local',groupId}={}){const c=normalizeClassroom(data);generation++;set({classroom:c,actor,storageMode,groupId:groupId||actor.groupId||c.groups[0]?.id||null,screen:actor.role==='student'?'workspace':'teacher',dirty:false,error:'',aiProposal:null,status:storageMode==='shared'?'Saved class project':'Download this project to keep your work.'});return c;}
  async function dispatch(action) {
    const requestedGeneration=generation,requestedClass=state.classroom?.id;
    const run=async()=>{
      if(requestedGeneration!==generation||requestedClass!==state.classroom?.id)throw Error('The open class changed. This change was not applied to the new class.');
      if(!state.classroom)throw Error('Open a class project first.');
      const c=state.classroom;
      if(state.storageMode==='shared'){
        const result=await client.action(c.id,c.revision,action,{groupRevision:c.groups.find(g=>g.id===action.groupId)?.revision});
        if(requestedGeneration!==generation||state.classroom?.id!==c.id)throw Error('Your previous class was saved. The newly opened class was not changed.');
        state.classroom=normalizeClassroom(result.classroom||result);
        if(result.actor){state.actor=result.actor;if(result.actor.groupId)state.groupId=result.actor.groupId;}
      }else state.classroom=applyClassroomAction(c,action,state.actor);
      if(!state.classroom.groups.some(g=>g.id===state.groupId))state.groupId=state.classroom.groups[0]?.id||null;
      state.pendingUpdate=false;state.status=state.storageMode==='shared'?'Saved to your class':'Changes ready. Download your project to keep them.';state.error='';notify();return state.classroom;
    };
    const result=mutation.then(run);mutation=result.catch(()=>{});return result;
  }
  async function refresh({force=false}={}){if(state.storageMode!=='shared'||!state.classroom)return false;const requestedGeneration=generation,requestedClass=state.classroom.id,result=await client.get(requestedClass);if(requestedGeneration!==generation||state.classroom?.id!==requestedClass)return false;const incoming=normalizeClassroom(result.classroom||result);if(incoming.id!==requestedClass||incoming.revision<=state.classroom.revision)return false;if(state.dirty&&!force){set({pendingUpdate:true});return false;}state.classroom=incoming;if(result.actor){state.actor=result.actor;if(result.actor.groupId)state.groupId=result.actor.groupId;}if(!state.classroom.groups.some(g=>g.id===state.groupId))state.groupId=state.classroom.groups[0]?.id||null;state.pendingUpdate=false;notify();return true;}
  return {state,client,set,open,dispatch,refresh,group:()=>state.classroom?.groups.find(g=>g.id===state.groupId),reset(){generation++;client.clearSession();Object.assign(state,blankState());notify();}};
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
  s.dirty=[...drafts.keys()].some(k=>k.startsWith(s.classroom?.id+':'));
  if(designer)return;
  const active=document.activeElement,focus=active?.id,selection=typeof active?.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null;
  root.innerHTML=(s.screen==='teacher'?renderTeacher(s):renderClassroom(s))+renderModal();
  for(const form of root.querySelectorAll('form[data-form]')){const draft=drafts.get(draftKey(form));if(draft)for(const [name,value]of Object.entries(draft)){const input=form.elements.namedItem(name);if(input&&input.type!=='file')input.value=value;}}
  if(modal){const d=root.querySelector('dialog');if(d&&!d.open)d.showModal();}
  if(focus){const el=document.getElementById(focus);el?.focus({preventScroll:true});if(selection&&el?.setSelectionRange)try{el.setSelectionRange(...selection);}catch{}}
 }
 function renderModal(){if(!modal)return '';return `<dialog class="classroom-dialog" aria-labelledby="modal-title"><form data-form="modal"><h2 id="modal-title">${escape(modal.title)}</h2>${modal.description?`<p>${escape(modal.description)}</p>`:''}${modal.fields.map(f=>`<label>${escape(f.label)}${f.options?`<select name="${escape(f.name)}">${f.options.map(o=>`<option value="${escape(o.value)}">${escape(o.label)}</option>`).join('')}</select>`:`<input name="${escape(f.name)}" type="${f.type||'text'}" value="${escape(f.value||'')}" maxlength="${f.max||160}" ${f.required===false?'':'required'}>`}</label>`).join('')}<div class="classroom-actions"><button type="button" data-action="close-modal">${t('Cancel','取消')}</button><button type="submit" class="primary">${escape(modal.submit||t('Continue','继续'))}</button></div></form></dialog>`;}
 function ask(config){modal=config;render();}
 async function run(fn){if(s.busy)return;controller.set({busy:true,error:''});try{await fn();}catch(e){s.error=e.name==='AbortError'?t('Request cancelled. Your work is unchanged.','已取消请求，作品未改变。'):e.status===409?t('Someone else saved a change. Your typed draft is kept here. Load the latest class version, review your draft, then save again.','其他同学已保存修改。输入的草稿仍保留在这里。请载入最新版本，检查草稿后再次保存。'):e.message; if(e.status===409)s.pendingUpdate=true;}finally{s.busy=false;s.aiBusy=false;render();}}
 function action(type,payload={},groupId=s.groupId){return controller.dispatch({type,groupId,payload});}
 function download(name,body,type='application/json'){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*]/g,'-');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function saveStage(stage){await action('stage.update',{sceneId:scene().id,stage});}
 function nextTab(){const order=['story','characters','script','design','stage','make'];controller.set({tab:order[Math.min(order.indexOf(s.tab)+1,order.length-1)]});}
 async function openDesigner(char,step){
  if(!char)return;
  if(s.actor.role==='student'&&!char.ownerId){await action('character.assign',{characterId:char.id,ownerId:s.actor.memberId});char=group().characters.find(c=>c.id===char.id);}
  const readOnly=s.actor.role==='student'&&char.ownerId!==s.actor.memberId;
  if(readOnly&&step!=='make')throw Error(t('Choose your own character, or ask your teacher to reassign it.','请选择自己的角色，或请老师重新分配。'));
  designer={characterId:char.id,groupId:s.groupId,step,readOnly};
  const panel=document.createElement('dialog');panel.id='classroom-designer';panel.className='designer-dialog';panel.innerHTML=`<div class="designer-top"><strong>${escape(char.name)}</strong><button type="button" id="classroom-designer-save">${t('Save and return to group','保存并返回小组')}</button></div><iframe title="${t('Puppet designer','皮影设计')}" src="${new URL('./studio.html?classroom=1',import.meta.url).href}"></iframe>`;
  document.body.append(panel);panel.showModal();panel.addEventListener('cancel',e=>{e.preventDefault();requestDesignerSave();});document.getElementById('classroom-designer-save').onclick=requestDesignerSave;
  if(readOnly){document.getElementById('classroom-designer-save').textContent=t('Back to group','返回小组');const note=document.createElement('span');note.textContent=t('Print view · your teammate’s design is unchanged.','打印视图 · 不会修改同学的设计。');panel.querySelector('.designer-top').append(note);}
 }
 function requestDesignerSave(){if(designer?.readOnly){document.getElementById('classroom-designer')?.remove();designer=null;render();return;}document.querySelector('#classroom-designer iframe')?.contentWindow.postMessage({type:'classroom:request-save',exit:true},location.origin);}
 async function rasterPreview(svg){if(typeof svg!=='string'||svg.length>18_000_000)return '';return new Promise(resolve=>{const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),img=new Image();img.onload=()=>{try{const canvas=document.createElement('canvas'),ratio=Math.min(1,480/Math.max(img.naturalWidth||800,img.naturalHeight||1000));canvas.width=Math.max(1,Math.round((img.naturalWidth||800)*ratio));canvas.height=Math.max(1,Math.round((img.naturalHeight||1000)*ratio));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/png'));}catch{resolve('');}finally{URL.revokeObjectURL(url);}};img.onerror=()=>{URL.revokeObjectURL(url);resolve('');};img.src=url;});}
 window.addEventListener('message',event=>{
  const frame=document.querySelector('#classroom-designer iframe');
  if(!designer||event.origin!==location.origin||event.source!==frame?.contentWindow)return;
  if(event.data?.type==='classroom:project'&&designer.readOnly){if(event.data.exit)requestDesignerSave();return;}
  if(event.data?.type==='classroom:ready'){const char=group()?.characters.find(c=>c.id===designer.characterId);frame.contentWindow.postMessage({type:'classroom:load',project:char?.project||null,characterName:char?.name,brief:char?.brief||'',language:s.language,step:designer.step},location.origin);}
  if(event.data?.type==='classroom:error'){const note=document.createElement('p');note.setAttribute('role','alert');note.textContent=event.data.message||event.data.error||t('Finish or cancel the preview before saving.','请先完成或取消预览再保存。');document.querySelector('.designer-top')?.append(note);}
  if(event.data?.type==='classroom:project'){const target={...designer};run(async()=>{try{const previewDataUrl=await rasterPreview(event.data.previewSvg);await action('character.update',{characterId:target.characterId,project:event.data.project,...(previewDataUrl?{previewDataUrl}:{})},target.groupId);if(event.data.exit){document.getElementById('classroom-designer')?.remove();designer=null;s.tab='design';}else{const note=document.createElement('p');note.setAttribute('role','status');note.textContent=t('Character saved.','角色已保存。');document.querySelector('.designer-top')?.append(note);}}catch(error){const note=document.createElement('p');note.setAttribute('role','alert');note.textContent=error.message;document.querySelector('.designer-top')?.append(note);throw error;}});}
 });
 async function ai(task,prompt){
  aiAbort?.abort();aiAbort=new AbortController();s.aiBusy=true;render();const g=group(),currentScene=scene(),classId=s.classroom.id,revision=s.classroom.revision,memberId=s.assessmentMemberId||null;
  const context={story:g?.story,characters:g?.characters.map(({id,name,brief,ownerId})=>({id,name,brief,ownerId})),scenes:g?.scenes.map(({id,title,setting,script})=>({id,title,setting,script})),stage:currentScene?.stage,sceneId:currentScene?.id,...(task==='feedback'?assessmentAIContext(s.classroom,g,s.assessmentMemberId||null):{})};
  const result=await requestClassroomHelp({task,prompt,context,language:s.language,signal:aiAbort.signal});
  if(s.classroom?.id!==classId||s.groupId!==g.id||(task==='feedback'&&(s.assessmentMemberId||null)!==memberId)||(['stage','script'].includes(task)&&scene()?.id!==currentScene?.id))return;
  s.aiProposal={...result,target:task,groupId:g.id,sceneId:currentScene?.id,baseRevision:revision};
 }
 async function applyAI(){const p=s.aiProposal;if(!p)return;if(p.groupId!==s.groupId||p.baseRevision!==s.classroom.revision)throw Error(t('Your project changed. Ask for a fresh suggestion so it uses your latest work.','项目已有修改，请重新请求建议。'));if(p.target==='stage-image'){await action('stage.update',{sceneId:p.sceneId,stage:{...group().scenes.find(x=>x.id===p.sceneId).stage,background:p.proposal.background.asset.dataUrl}});}else if(p.target==='story')await action('story.update',p.proposal.story);else if(p.target==='script'){for(const draft of p.proposal.scenes||[]){const existing=group().scenes.find(sc=>sc.id===draft.id);await action(existing?'scene.update':'scene.add',existing?{...draft,sceneId:existing.id}:draft);}}else if(p.target==='stage'){const sc=group().scenes.find(x=>x.id===p.sceneId);if(!sc)throw Error('Choose a scene.');const objects=(p.proposal.objects||[]).map((o,i)=>({...o,id:id('object'),z:(sc.stage.objects?.length||0)+i}));await action('stage.update',{sceneId:sc.id,stage:{...sc.stage,objects:[...(sc.stage.objects||[]),...objects]}});}s.aiProposal=null;}
 root.addEventListener('input',event=>{s.dirty=true;const form=event.target.closest('form[data-form]');if(form&&editableForms.has(form.dataset.form))drafts.set(draftKey(form),Object.fromEntries(new FormData(form)));if(event.target.name==='stageImagePrompt'){const out=root.querySelector('[data-stage-prompt-count]');if(out)out.textContent=event.target.value.length+' / 800';}});
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const a=button.dataset.action,bid=button.dataset.id;
  if(a==='language'){s.language=s.language==='en'?'zh':'en';render();return;}
  if(a==='close-modal'){modal=null;render();return;}
  if(a==='cancel-ai'){aiAbort?.abort();return;}
  if(a==='tab'){controller.set({tab:button.dataset.tab,aiProposal:null});return;}
  if(a==='next-step'){nextTab();return;}
  if(a==='teacher-class-list'){controller.set({teacherTab:'classes'});return;}
  if(a==='copy-class-code'){navigator.clipboard?.writeText(s.joinCode||s.classCode||'').then(()=>{s.status=t('Class code copied.','班级码已复制。');render();}).catch(()=>{});return;}
  if(a==='use-feedback-draft'){const form=root.querySelector('form[data-form="assessment"]');if(form&&s.aiProposal?.proposal){form.elements.namedItem('comment').value=(s.aiProposal.proposal.observations||[]).map(o=>o.comment+' ['+o.evidenceRefs.join(', ')+']').join('\n');drafts.set(draftKey(form),Object.fromEntries(new FormData(form)));s.dirty=true;}return;}
  if(a==='teacher-tab'){controller.set({teacherTab:button.dataset.tab});return;}
  if(a==='home'){controller.set({screen:'welcome'});return;}
  if(a==='resume-project'){controller.set({screen:s.actor.role==='student'?'workspace':'teacher'});return;}
  if(a==='quick-studio'){location.href=new URL('./studio.html',import.meta.url).href;return;}
  if(a==='open-classroom'){fileInput.click();return;}
  if(a==='show-join'){controller.set({screen:'join'});return;}
  if(a==='new-local-classroom'){ask({title:t('Start a class project','开始班级项目'),description:t('Work on this device and download your project to keep it. Shared classes use a teacher-created class code.','在本设备上创作，并下载保存。共享班级使用老师提供的班级码。'),fields:[{name:'title',label:t('Class name','班级名称')},{name:'groupName',label:t('First group name','第一个小组名称')}],submit:t('Create project','创建项目'),save:async v=>{let c=createClassroom({title:v.title,language:s.language});c=applyClassroomAction(c,{type:'group.add',payload:{name:v.groupName}},{role:'teacher'});controller.open(c);s.teacherTab='groups';}});return;}
  if(a==='choose-member'){ask({title:t('Work as a student','以学生身份体验'),description:t('This is a local project. Choose a group member to try their workspace.','这是本地项目。选择一名成员进入其工作区。'),fields:[{name:'memberId',label:t('Member','成员'),options:group()?.members.map(m=>({value:m.id,label:m.name}))||[]}],save:async v=>{s.actor={role:'student',memberId:v.memberId,groupId:s.groupId,name:group().members.find(m=>m.id===v.memberId)?.name};s.screen='workspace';}});return;}
  if(a==='download-classroom'){if(s.classroom)download(s.classroom.title+'.shadow-class.json',exportWorkspaceFile(s.classroom,[...drafts],s));s.status=t('Project and typed drafts downloaded. Open this file to continue later.','项目与输入的草稿已下载。下次打开此文件即可继续。');render();return;}
  if(a==='download-character'){const c=group()?.characters.find(c=>c.id===bid);if(c?.project)download(c.name+'.puppet.json',JSON.stringify(c.project,null,2));return;}
  if(a==='download-scores'){download(s.classroom.title+'-scores.csv',exportScoresCsv(s.classroom),'text/csv;charset=utf-8');return;}
  if(a==='select-character'){controller.set({selectedCharacterId:bid,...(button.dataset.tab?{tab:button.dataset.tab}:{})});return;}
  if(a==='select-scene'){controller.set({selectedSceneId:bid,selectedObjectId:null});return;}
  if(a==='select-object'){controller.set({selectedObjectId:bid});return;}
  if(a==='upload-background'||a==='upload-stage-image'){assetIntent=a;imageInput.click();return;}
  if(a==='preview-stage'){controller.set({scenePreview:true});return;}
  if(a==='close-stage-preview'){controller.set({scenePreview:false});return;}
  if(a==='previous-scene'||a==='next-scene'){const scenes=group()?.scenes||[],n=scenes.findIndex(x=>x.id===scene()?.id);controller.set({selectedSceneId:scenes[(n+(a==='next-scene'?1:-1)+scenes.length)%scenes.length]?.id});return;}
  if(a==='assessment-target'){controller.set({teacherTab:'assessment',groupId:button.dataset.groupId,assessmentGroupId:button.dataset.groupId,assessmentMemberId:button.dataset.memberId||null,aiProposal:null});return;}
  if(a==='ai-reject'||a==='reject-ai'){controller.set({aiProposal:null});return;}
  run(async()=>{
   if(a==='show-teacher'){if(s.storageMode==='shared'&&s.actor.role==='student')throw Error(t('Teacher access requires teacher sign-in.','教师工作区需要教师登录。'));s.actor={role:'teacher'};s.screen='teacher';s.teacherTab=button.dataset.tab||'classes';if(s.capabilities?.available&&s.capabilities.teacherSignedIn){const r=await controller.client.list();s.classes=r.classes||r.items||[];}}
   else if(a==='open-class'){const r=await controller.client.get(button.dataset.classId||bid);controller.open(r.classroom||r,{storageMode:'shared'});s.joinCode=r.joinCode;s.classCode=r.joinCode;s.teacherTab='groups';}
   else if(a==='teacher-open-group'||a==='review-project'){s.groupId=button.dataset.groupId||bid;if(a==='review-project'){s.reviewSubmission=group()?.submission||null;s.teacherTab='projects';s.screen='teacher';}else{s.screen='workspace';s.tab='story';}}
   else if(a==='open-designer')await openDesigner(group()?.characters.find(c=>c.id===bid)||character(),button.dataset.step);
   else if(a==='close-submission-review')s.reviewSubmission=null;
   else if(a==='download-submission'){if(s.reviewSubmission)download('submission-'+s.reviewSubmission.id+'.json',JSON.stringify(s.reviewSubmission,null,2));}
   else if(a==='review-submission'){s.groupId=button.dataset.groupId;const g=group();s.reviewSubmission=[g.submission,...(g.submissionHistory||[])].find(x=>x?.id===bid)||null;s.teacherTab='projects';s.screen='teacher';}
   else if(a==='claim-character')await action('character.assign',{characterId:bid,ownerId:s.actor.memberId});
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
   else if(a==='ai-feedback')await ai('feedback',t('Give evidence-based formative feedback against our rubric. Cite specific saved work, identify missing evidence and suggest a next step. Do not invent scores, effort or collaboration.','依据已保存的作品与量规提供形成性反馈，引用证据，指出缺失的证据与下一步。不要推测分数、努力程度或合作。'));
   else if(a==='submit-project')await action('submission.submit');
   else if(a==='reopen-submission')await action('submission.reopen');
   else if(a==='archive-class')await action('class.update',{archived:!s.classroom.archived});
   else if(a==='remove-group')await action('group.remove',{},button.dataset.groupId||bid);
   else if(a==='remove-member')await action('member.remove',{memberId:button.dataset.memberId||bid},button.dataset.groupId);
   else if(a==='refresh-classroom')await controller.refresh({force:true});
   else if(a==='save-assessment'||a==='confirm-assessment'){const form=root.querySelector('form[data-form="assessment"]');if(form)await saveAssessment(Object.fromEntries(new FormData(form)),a==='confirm-assessment');}
   else if(a==='generate-stage-image'){const prompt=root.querySelector('[name="stageImagePrompt"]')?.value||scene()?.setting;if(!prompt?.trim())throw Error(t('Describe the stage background first.','请先描述舞台背景。'));const target={classId:s.classroom.id,groupId:s.groupId,sceneId:scene().id,baseRevision:s.classroom.revision};aiAbort?.abort();aiAbort=new AbortController();s.aiBusy=true;const image=await requestStageImage({prompt,language:s.language,signal:aiAbort.signal});if(s.classroom?.id===target.classId&&s.groupId===target.groupId)s.aiProposal={target:'stage-image',...target,reply:t('Review the new background before using it.','确认背景后再使用。'),proposal:{background:image}};}
  });
 });
 async function saveAssessment(v,confirmed){const scores={};for(const r of s.classroom.rubric){const raw=v['score:'+r.id]??v[r.id];if(raw!==undefined&&raw!=='')scores[r.id]=Number(raw);}await action('assessment.save',{memberId:v.memberId||null,scores,comment:v.comment||'',evidence:Array.isArray(v.evidence)?v.evidence:(v.evidence||'').split('\n').filter(Boolean),confirmed},v.groupId||s.assessmentGroupId||s.groupId);}
 root.addEventListener('submit',event=>{const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();const formData=new FormData(form),v=Object.fromEntries(formData),type=form.dataset.form,key=draftKey(form);if(type==='assessment')v.evidence=formData.getAll('evidence');
  run(async()=>{
   if(type==='modal'){const save=modal.save;modal=null;await save(v);}
   else if(type==='lookup-class'){const r=await controller.client.lookup(v.code);s.joinCode=v.code;s.groupChoices=r.groups||r.classroom?.groups||[];s.joinClass=r.classroom||r.class||r;}
   else if(type==='join-class'){const r=await controller.client.join({code:s.joinCode,...v});controller.open(r.classroom,{storageMode:'shared',actor:r.actor,groupId:v.groupId});}
   else if(type==='create-class'){const r=await controller.client.create({title:v.title,language:s.language});controller.open(r.classroom||r,{storageMode:'shared'});s.teacherTab='groups';s.joinCode=r.code||r.joinCode;s.classCode=r.code||r.joinCode;}
   else if(type==='update-class')await action('class.update',{title:v.title});
   else if(type==='add-group')await action('group.add',{name:v.name});
   else if(type==='rename-group')await action('group.update',{name:v.name},v.groupId);
   else if(type==='add-member')await action('member.add',{name:v.name},v.groupId||s.groupId);
   else if(type==='rename-member')await action('member.update',{memberId:v.memberId,name:v.name},v.groupId);
   else if(type==='reset-member'){await controller.client.resetMember(s.classroom.id,v.memberId,v.passphrase);s.status=t('Passphrase reset. Share it privately with that student.','口令已重置，请私下告知该学生。');}
   else if(type==='assessment')await saveAssessment(v,event.submitter?.value==='confirm');
   else if(type==='move-member')await action('member.move',{memberId:v.memberId,targetGroupId:v.targetGroupId},v.groupId);
   else if(type==='rubric'){const rubric=s.classroom.rubric.map(r=>({...r,title:v['rubric:'+r.id+':title']||r.title,description:v['rubric:'+r.id+':description']||r.description,maxScore:Number(v['rubric:'+r.id+':maxScore'])||r.maxScore}));await action('rubric.update',{rubric});}
   else if(type==='story.update')await action(type,v);
   else if(type==='story.handoff')await action(type,v);
   else if(type==='character.add'){const cid=id('character');await action(type,{...v,id:cid,ownerId:v.ownerId||s.actor.memberId||null});s.selectedCharacterId=cid;}
   else if(type==='character.update'){const {ownerId,...payload}=v;await action(type,payload);if(ownerId!==undefined)await action('character.assign',{characterId:v.characterId,ownerId:ownerId||null});}
   else if(type==='scene.update')await action(type,v);
   else if(type==='reflection.save')await action(type,v);
   else if(type==='ai-story'||type==='ai-script'||type==='ai-stage')await ai(type.slice(3),v.prompt);
   else if(type==='stage-background')await saveStage({...scene().stage,backgroundColor:v.backgroundColor});
   else if(type==='stage-object'){const old=scene().stage.objects.find(o=>o.id===v.id),object={...old,...v,id:old?.id||id('object'),x:Number(v.x)||0,y:Number(v.y)||0,width:Number(v.width)||150,height:Number(v.height)||100,rotation:Number(v.rotation)||0,z:old?.z??scene().stage.objects.length};await saveStage({...scene().stage,objects:[...scene().stage.objects.filter(o=>o.id!==object.id),object]});s.selectedObjectId=object.id;}
   drafts.delete(key);s.dirty=false;
  });
 });
 fileInput.addEventListener('change',()=>run(async()=>{const file=fileInput.files[0];if(!file)return;if(file.size>80_000_000)throw Error('Choose a project under 80 MB.');const restored=importWorkspaceFile(await file.text());controller.open(restored.classroom);for(const [key,values]of restored.drafts)drafts.set(key,values);const v=restored.view;if(s.classroom.groups.some(g=>g.id===v.groupId))s.groupId=v.groupId;if(['story','characters','script','design','stage','make'].includes(v.tab)){s.tab=v.tab;s.screen='workspace';}for(const key of ['selectedCharacterId','selectedSceneId','selectedObjectId'])if(typeof v[key]==='string')s[key]=v[key];fileInput.value='';}));
 imageInput.addEventListener('change',()=>run(async()=>{const file=imageInput.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8_000_000)throw Error(t('Choose a PNG, JPEG or WebP image under 8 MB.','请选择小于 8 MB 的 PNG、JPEG 或 WebP 图片。'));const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const sc=scene();if(!sc)throw Error('Add a scene first.');if(assetIntent==='upload-background')await saveStage({...sc.stage,background:dataUrl});else{const object={id:id('object'),type:'image',name:file.name,dataUrl,x:300,y:150,width:200,height:200,rotation:0,z:sc.stage.objects.length};await saveStage({...sc.stage,objects:[...sc.stage.objects,object]});s.selectedObjectId=object.id;}imageInput.value='';}));
 root.addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key)||!e.target.matches?.('[data-stage-object]'))return;e.preventDefault();controller.set({selectedObjectId:e.target.dataset.stageObject});});
 root.addEventListener('pointerdown',e=>{const element=e.target.closest('[data-stage-object]');if(!element||s.busy)return;const oid=element.dataset.stageObject,sc=scene(),object=sc?.stage.objects.find(o=>o.id===oid),svg=element.ownerSVGElement;if(!object||!svg)return;const rect=svg.getBoundingClientRect(),width=sc.stage.width||960,height=sc.stage.height||540,scale=Math.min(rect.width/width,rect.height/height);drag={id:oid,sceneId:sc.id,groupId:s.groupId,startX:e.clientX,startY:e.clientY,x:object.x,y:object.y,width,height,scaleX:1/scale,scaleY:1/scale,element,pointer:e.pointerId};element.setPointerCapture?.(e.pointerId);e.preventDefault();});
 root.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;const dx=(e.clientX-drag.startX)*drag.scaleX,dy=(e.clientY-drag.startY)*drag.scaleY;drag.dx=dx;drag.dy=dy;drag.element.style.translate=dx+'px '+dy+'px';});
 root.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointer)return;const d=drag;drag=null;if(Math.abs(d.dx||0)+Math.abs(d.dy||0)<3)return;run(async()=>{if(s.groupId!==d.groupId||scene()?.id!==d.sceneId)return;const objects=clone(scene().stage.objects),object=objects.find(o=>o.id===d.id);if(!object)return;object.x=Math.round(Math.max(-object.width,Math.min(d.width,d.x+(d.dx||0))));object.y=Math.round(Math.max(-object.height,Math.min(d.height,d.y+(d.dy||0))));await saveStage({...scene().stage,objects});s.selectedObjectId=d.id;});});
 root.addEventListener('pointercancel',()=>{drag=null;render();});
 const poll=setInterval(()=>{if(!designer&&!s.busy&&s.storageMode==='shared'&&!document.hidden)controller.refresh().catch(()=>{s.status=t('Connection interrupted. Your open work is still here.','连接中断，当前作品仍在这里。');});},15000);
 window.addEventListener('pagehide',()=>{clearInterval(poll);aiAbort?.abort();controller.client.clearSession();});
 window.addEventListener('beforeunload',event=>{if(s.dirty||designer){event.preventDefault();event.returnValue='';}});
 render();controller.client.capabilities().then(capabilities=>controller.set({capabilities})).catch(()=>controller.set({capabilities:{available:false,teacherSignedIn:false}}));
 return controller;
}
