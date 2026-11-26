import {normalizeStudioProject} from './studio-model.mjs';
import {packClassroomBundle,unpackClassroomBundle} from './classroom-bundle.mjs';

// Shared validation and permissions run in the browser and again on the server.
// Sessions are separate from explicitly saved classroom work.
export const CLASSROOM_VERSION = 1;
export const CLASSROOM_MAX_BYTES = 100 * 1024 * 1024;
const HISTORY_LIMIT = 5, EVENT_LIMIT = 300;
const fields = ['time','place','characters','plot'];
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
const clone = x => structuredClone(x);
const newId = () => globalThis.crypto?.randomUUID?.() || 'c-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
function fail(message,code='INVALID_CLASSROOM') { const e=new Error(message);e.code=code;throw e; }
function text(x,max=2000) { return typeof x==='string'?x.slice(0,max):''; }
function required(x,label,max=160) { const value=text(x,max).trim();if(!value)fail(label+' is required.');return value; }
function id(x,optional=false) { if(optional&&x==null)return null;if(typeof x!=='string'||!/^[-\w]{1,96}$/.test(x)||['constructor','prototype','__proto__'].includes(x))fail('Invalid identifier.');return x; }
function list(x,max,label) { if(x==null)return [];if(!Array.isArray(x)||x.length>max)fail('Too many or invalid '+label+'.');return x; }
function number(x,fallback,min,max) { if(x==null)return fallback;if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)fail('Number outside supported range.');return x; }
function unique(rows,label) { const seen=new Set();for(const row of rows){if(seen.has(row.id))fail('Duplicate '+label+'.');seen.add(row.id);}return rows; }
function safeTree(raw) {
  // The packer validates plain JSON, cycles, depth and unique raster bytes without
  // allocating a huge JSON string for every repeated history/submission image.
  packClassroomBundle(raw);
}
function raster(value) {
  if(value==null||value==='')return null;
  if(typeof value!=='string'||value.length>12_000_000||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))fail('Use an embedded PNG, JPEG or WebP image.');
  return value;
}
function color(value,fallback='#f4eddc') { if(value==null)return fallback;if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))fail('Use a six-digit hex colour.');return value; }
function normalizedStory(raw={}) {
  const s={title:text(raw.title,160),time:text(raw.time,2000),place:text(raw.place,2000),characters:text(raw.characters,4000),plot:text(raw.plot,12000),relay:[]};
  const relays=list(raw.relay,4,'relay steps');
  for(const field of fields){const v=relays.find(r=>r?.field===field)||{};s.relay.push({field,memberId:id(v.memberId,true),status:['waiting','active','done'].includes(v.status)?v.status:'waiting'});}
  return s;
}
function historyEntry(raw,snapshotNormalizer) {
  if(!record(raw)||!record(raw.snapshot))fail('Invalid version history.');
  return {id:id(raw.id),at:text(raw.at,40),actorId:id(raw.actorId,true),actorName:text(raw.actorName,120),snapshot:snapshotNormalizer(raw.snapshot)};
}
function normalizedStage(raw={},characters=[]) {
  if(!record(raw))fail('Invalid stage.');
  return {width:number(raw.width,960,100,4000),height:number(raw.height,540,100,4000),background:raster(raw.background),backgroundColor:color(raw.backgroundColor),objects:unique(list(raw.objects,80,'stage objects').map(o=>{
    if(!record(o)||!['character','image','shape','text'].includes(o.type))fail('Invalid stage object.');
    const v={id:id(o.id),type:o.type,x:number(o.x,0,-8000,8000),y:number(o.y,0,-8000,8000),width:number(o.width,160,1,8000),height:number(o.height,220,1,8000),rotation:number(o.rotation,0,-3600,3600),z:number(o.z,0,-1000,1000),opacity:number(o.opacity,1,0,1),fill:color(o.fill,'#225544')};
    if(o.type==='character'){v.characterId=id(o.characterId);if(!characters.some(c=>c.id===v.characterId))fail('A stage character no longer exists.');}
    if(o.type==='image'){v.dataUrl=raster(o.dataUrl);if(!v.dataUrl)fail('A stage image is missing.');}
    if(o.type==='text')v.text=text(o.text,1000);
    if(o.type==='shape')v.shape=o.shape==='ellipse'?'ellipse':'rect';
    return v;
  }),'stage object')};
}
function characterSnapshot(raw) { return {name:required(raw.name,'Character name'),brief:text(raw.brief,4000),project:raw.project==null?null:normalizeStudioProject(raw.project),previewDataUrl:raster(raw.previewDataUrl)}; }
function sceneSnapshot(raw,characters) { return {title:text(raw.title,160),setting:text(raw.setting,2000),script:text(raw.script,30000),stage:normalizedStage(raw.stage||{},characters)}; }
function normalizedReflection(raw) { return {memberId:id(raw.memberId),text:text(raw.text,6000),sources:text(raw.sources,6000),tests:text(raw.tests,6000),updatedAt:text(raw.updatedAt,40)}; }
function normalizedRubric(raw) {
  const rows=list(raw,12,'rubric criteria').map(r=>({id:id(r.id),title:required(r.title,'Criterion',120),description:text(r.description,1000),maxScore:number(r.maxScore,4,1,100),descriptors:list(r.descriptors,101,'rubric descriptors').map(d=>text(d,600)).slice(0,Math.floor(r.maxScore||4)+1)}));
  if(!rows.length)fail('Add at least one assessment criterion.');return unique(rows,'criterion');
}
export function defaultClassroomRubric(language='en') {
  const zh=language==='zh';return [
    ['story',zh?'故事与表达':'Story and expression',zh?'说明角色、场景与故事的联系。':'Explain how characters and scenes serve the story.'],
    ['design',zh?'设计与传统':'Design and tradition',zh?'解释设计选择，标明参考来源和推测。':'Explain design choices, references and inferred details.'],
    ['construction',zh?'制作与结构':'Construction',zh?'展示部件、重叠关节、层次和操纵方式。':'Show separate pieces, overlapping joints, layer order and control.'],
    ['testing',zh?'测试与改进':'Testing and revision',zh?'记录实际运动或纸样测试、发现的问题与改进。':'Record movement or physical prototype tests, problems and revisions.'],
    ['reflection',zh?'个人贡献与反思':'Contribution and reflection',zh?'说明自己的决定、贡献、证据与下一步。':'Explain personal decisions, contributions, evidence and next steps.'],
  ].map(([id,title,description])=>({id,title,description,maxScore:4,descriptors:rubricDescriptors(id,zh)}));
}
function rubricDescriptors(criterion,zh) {
  const descriptors={
    story:zh?['尚未提供故事表达的证据。','提出了角色或故事想法。','角色和场景与故事有明确联系。','能解释设计选择如何支持情节和观众理解。','通过试演或反馈改进表达，并说明改进理由。']:['No evidence of story intent yet.','Identifies a character or story idea.','Connects characters and scenes clearly to the story.','Explains how design decisions support the plot and audience understanding.','Uses rehearsal or feedback to improve expression and explains the change.'],
    design:zh?['尚未提供设计选择或参考证据。','有外观想法，但未解释选择。','解释了设计选择，并标明使用的参考。','比较了参考，区分传统依据和自己的创作。','有依据地改进设计，并明确说明不确定或推测的细节。']:['No evidence of design choices or references yet.','Shows an appearance idea without explaining choices.','Explains choices and identifies references used.','Compares references and distinguishes tradition from personal invention.','Revises with evidence and clearly identifies uncertain or inferred details.'],
    construction:zh?['尚未提供部件或结构证据。','有初步部件，但连接关系未说明。','展示独立部件、连接位置和层次。','展示圆形重叠、对齐孔位及操纵方式，并说明可制作性。','实物或纸样证据支持结构选择，并记录限制和改进。']:['No evidence of parts or construction yet.','Shows initial pieces without explaining connections.','Shows separate pieces, connection locations and layer order.','Shows rounded overlap, aligned holes and controls, and explains how to make it.','Physical or paper-prototype evidence supports construction choices and documents limits and improvements.'],
    testing:zh?['尚未提供测试记录。','尝试了运动，但没有记录观察。','记录了运动测试及一个具体观察。','根据测试发现问题，修改并再次测试。','比较修改前后的证据，说明改善和仍存在的限制。']:['No testing evidence yet.','Tries movement without recording observations.','Records a movement test and a specific observation.','Finds a problem, changes the design and retests.','Compares before/after evidence and explains improvements and remaining limits.'],
    reflection:zh?['尚未提供个人贡献或反思证据。','列出了自己完成的工作。','说明了个人决定和贡献，并提供例子。','用修改或测试证据解释学习过程和同伴协作。','反思自己的判断和帮助需求，提出有依据的下一步。']:['No personal contribution or reflection evidence yet.','Lists work completed.','Explains personal decisions and contributions with examples.','Uses revision or testing evidence to explain learning and collaboration.','Reflects on personal judgment and help needed, and proposes an evidence-based next step.'],
  };return descriptors[criterion];
}
function normalizedAssessment(raw,rubric,members) {
  const memberId=id(raw.memberId,true),member=members.find(m=>m.id===memberId),memberName=member?.name||text(raw.memberName,120);if(memberId&&!memberName)fail('Assessment member is missing.');
  const scores={};if(raw.scores!=null&&!record(raw.scores))fail('Invalid scores.');
  for(const criterion of rubric)if(own(raw.scores||{},criterion.id))scores[criterion.id]=number(raw.scores[criterion.id],0,0,criterion.maxScore);
  return {id:id(raw.id),memberId,memberName:memberId?memberName:'',scores,comment:text(raw.comment,6000),evidence:list(raw.evidence,30,'assessment evidence').map(e=>text(e,1000)),confirmed:raw.confirmed===true,updatedAt:text(raw.updatedAt,40),confirmedAt:raw.confirmed===true?text(raw.confirmedAt,40):null,teacherName:text(raw.teacherName,120),submissionId:id(raw.submissionId,true)};
}
function normalizedWork(raw,members) {
  const story=normalizedStory(raw.story||{});
  for(const r of story.relay)if(r.memberId&&!members.some(m=>m.id===r.memberId))r.memberId=null;
  const characters=unique(list(raw.characters,30,'characters').map(c=>({id:id(c.id),...characterSnapshot(c),ownerId:id(c.ownerId,true),history:list(c.history,HISTORY_LIMIT,'character versions').map(h=>historyEntry(h,characterSnapshot))})),'character');
  for(const c of characters)if(c.ownerId&&!members.some(m=>m.id===c.ownerId))c.ownerId=null;
  const scenes=unique(list(raw.scenes,30,'scenes').map(s=>({id:id(s.id),...sceneSnapshot(s,characters),history:list(s.history,HISTORY_LIMIT,'scene versions').map(h=>historyEntry(h,x=>sceneSnapshot(x,characters)))})),'scene');
  const reflections=list(raw.reflections,80,'reflections').map(normalizedReflection).filter(r=>members.some(m=>m.id===r.memberId));
  if(new Set(reflections.map(r=>r.memberId)).size!==reflections.length)fail('Duplicate reflection.');
  return {story:{...story,history:list(raw.story?.history,HISTORY_LIMIT,'story versions').map(h=>historyEntry(h,normalizedStory))},characters,scenes,reflections};
}
function normalizedSubmission(s) {
  if(!record(s)||!record(s.snapshot))fail('Invalid submission.');
  const members=unique(list(s.snapshot.members,80,'submitted members').map(m=>({id:id(m.id),name:required(m.name,'Student name',120)})),'submitted member');
  return {id:id(s.id),submittedAt:text(s.submittedAt,40),submittedBy:id(s.submittedBy,true),revision:number(s.revision,0,0,1e9),status:['submitted','outdated','reopened'].includes(s.status)?s.status:'submitted',snapshot:{name:text(s.snapshot.name,160),members,...normalizedWork(s.snapshot,members)}};
}
function normalizedGroup(raw,rubric) {
  if(!record(raw))fail('Invalid group.');
  const members=unique(list(raw.members,80,'members').map(m=>({id:id(m.id),name:required(m.name,'Student name',120)})),'member');
  const revision=number(raw.revision,0,0,1e9);if(!Number.isInteger(revision))fail('Group revision must be a nonnegative integer.');
  const g={id:id(raw.id),name:required(raw.name,'Group name'),revision,members,...normalizedWork(raw,members),history:[],submission:raw.submission?normalizedSubmission(raw.submission):null,submissionHistory:list(raw.submissionHistory,HISTORY_LIMIT,'submitted versions').map(normalizedSubmission),assessments:[],events:[]};
  unique([...g.submissionHistory,...(g.submission?[g.submission]:[])],'submission');
  g.assessments=unique(list(raw.assessments,81,'assessments').map(a=>normalizedAssessment(a,rubric,members)),'assessment');
  if(new Set(g.assessments.map(a=>a.memberId||'group')).size!==g.assessments.length)fail('Duplicate assessment target.');
  g.events=list(raw.events,EVENT_LIMIT,'events').map(e=>({id:id(e.id),type:text(e.type,80),at:text(e.at,40),actorId:id(e.actorId,true),actorName:text(e.actorName,120),subjectId:id(e.subjectId,true),detail:text(e.detail,500)}));
  return g;
}
export function createClassroom({title='',language='en'}={}) {
  const now=new Date().toISOString();return {version:CLASSROOM_VERSION,id:newId(),title:text(title,160).trim(),language:language==='zh'?'zh':'en',revision:0,archived:false,createdAt:now,updatedAt:now,groups:[],rubric:defaultClassroomRubric(language)};
}
export function normalizeClassroom(raw) {
  raw=unpackClassroomBundle(raw);
  if(!record(raw))fail('Open a classroom project file.');safeTree(raw);
  if(raw.version!==CLASSROOM_VERSION)fail('This classroom file uses an unsupported version.');
  const rubric=normalizedRubric(raw.rubric||defaultClassroomRubric(raw.language));
  const c={version:CLASSROOM_VERSION,id:id(raw.id),title:text(raw.title,160),language:raw.language==='zh'?'zh':'en',revision:number(raw.revision,0,0,1e9),archived:raw.archived===true,createdAt:text(raw.createdAt,40),updatedAt:text(raw.updatedAt,40),groups:unique(list(raw.groups,40,'groups').map(g=>normalizedGroup(g,rubric)),'group'),rubric};
  const memberIds=new Set();for(const g of c.groups)for(const m of g.members){if(memberIds.has(m.id))fail('A student belongs to more than one group.');memberIds.add(m.id);}
  return c;
}
function checkpoint(history,snapshot,actor,now) { history.push({id:newId(),at:now,actorId:actor.memberId||null,actorName:text(actor.name||'Teacher',120),snapshot:clone(snapshot)});while(history.length>HISTORY_LIMIT)history.shift(); }
function findById(rows,value,label) { const row=rows.find(x=>x.id===value);if(!row)fail(label+' was not found.','NOT_FOUND');return row; }
function teacher(actor) { if(actor.role!=='teacher')fail('Only the teacher can do this.','FORBIDDEN'); }
function editableCharacter(g,p,actor) {const c=findById(g.characters,p.characterId,'Character');if(actor.role!=='teacher'&&c.ownerId!==actor.memberId)fail('Choose your own character to edit.','FORBIDDEN');return c;}
function workSnapshot(g) { const value=clone({name:g.name,members:g.members,story:g.story,characters:g.characters,scenes:g.scenes,reflections:g.reflections});value.story.history=[];for(const c of value.characters)c.history=[];for(const s of value.scenes)s.history=[];return value; }

export function applyClassroomAction(classroom,action,actor={}) {
  const c=normalizeClassroom(classroom);if(!record(action)||typeof action.type!=='string')fail('Choose a classroom action.');safeTree(action);
  if(!['teacher','student'].includes(actor.role))fail('Sign in before changing a classroom.','FORBIDDEN');
  const p=record(action.payload)?action.payload:{},type=action.type,now=new Date().toISOString();
  if(c.archived&&!(actor.role==='teacher'&&type==='class.update'&&p.archived===false))fail('This class is archived. Ask the teacher to reopen it.','ARCHIVED');
  let g=null,subjectId=null,workChanged=false;
  const classActions=['class.update','group.add','group.remove','rubric.update'];
  if(classActions.includes(type))teacher(actor);
  else {g=findById(c.groups,action.groupId,'Group');if(actor.role==='student'&&(actor.groupId!==g.id||!g.members.some(m=>m.id===actor.memberId)))fail('This is not your group.','FORBIDDEN');}
  switch(type){
    case 'class.update':if(own(p,'title'))c.title=required(p.title,'Class name');if(own(p,'archived'))c.archived=p.archived===true;if(own(p,'language'))c.language=p.language==='zh'?'zh':'en';break;
    case 'rubric.update':c.rubric=normalizedRubric(p.rubric);for(const group of c.groups){group.revision+=1;for(const a of group.assessments){a.confirmed=false;a.confirmedAt=null;for(const key of Object.keys(a.scores)){const criterion=c.rubric.find(r=>r.id===key);if(!criterion||a.scores[key]>criterion.maxScore)delete a.scores[key];}}}break;
    case 'group.add':c.groups.push({id:p.id||newId(),name:required(p.name,'Group name'),members:[],story:normalizedStory(),characters:[],scenes:[],reflections:[],history:[],submission:null,assessments:[],events:[]});break;
    case 'group.remove':findById(c.groups,action.groupId,'Group');c.groups=c.groups.filter(x=>x.id!==action.groupId);break;
    case 'group.update':teacher(actor);g.name=required(p.name,'Group name');break;
    case 'member.add':teacher(actor);g.members.push({id:p.id||newId(),name:required(p.name,'Student name',120)});break;
    case 'member.update':teacher(actor);findById(g.members,p.memberId,'Student').name=required(p.name,'Student name',120);break;
    case 'member.remove':teacher(actor);findById(g.members,p.memberId,'Student');g.members=g.members.filter(m=>m.id!==p.memberId);workChanged=true;break;
    case 'member.move':{
      teacher(actor);const member=findById(g.members,p.memberId,'Student'),destination=findById(c.groups,p.targetGroupId,'Destination group');if(destination.id===g.id)fail('Choose a different group.');
      destination.members.push(clone(member));g.members=g.members.filter(m=>m.id!==member.id);const reflection=g.reflections.find(r=>r.memberId===member.id);if(reflection)destination.reflections.push(clone(reflection));g.reflections=g.reflections.filter(r=>r.memberId!==member.id);
      destination.revision+=1;if(destination.submission)destination.submission.status='outdated';destination.events.push({id:newId(),type,at:now,actorId:actor.memberId||null,actorName:text(actor.name||'Teacher',120),subjectId:member.id,detail:'Moved from '+g.name});destination.events=destination.events.slice(-EVENT_LIMIT);subjectId=member.id;workChanged=true;break;
    }
    case 'story.update':checkpoint(g.story.history,normalizedStory(g.story),actor,now);for(const field of ['title',...fields])if(own(p,field))g.story[field]=text(p[field],field==='plot'?12000:field==='characters'?4000:field==='title'?160:2000);workChanged=true;break;
    case 'story.handoff':{
      if(!fields.includes(p.field))fail('Choose a story step.');if(p.memberId!=null)findById(g.members,p.memberId,'Student');if(!['waiting','active','done'].includes(p.status))fail('Choose a relay status.');
      checkpoint(g.story.history,normalizedStory(g.story),actor,now);const step=g.story.relay.find(r=>r.field===p.field);step.memberId=p.memberId||null;step.status=p.status;workChanged=true;break;
    }
    case 'story.restore':{const old=findById(g.story.history,p.historyId,'Story version');const restore=clone(old.snapshot);checkpoint(g.story.history,normalizedStory(g.story),actor,now);g.story={...restore,history:g.story.history};workChanged=true;break;}
    case 'character.add':{
      const ownerId=actor.role==='student'?actor.memberId:(p.ownerId||null);if(ownerId)findById(g.members,ownerId,'Student');g.characters.push({id:p.id||newId(),name:required(p.name,'Character name'),brief:text(p.brief,4000),ownerId,project:null,previewDataUrl:null,history:[]});workChanged=true;break;
    }
    case 'character.assign':{
      const char=findById(g.characters,p.characterId,'Character');if(p.ownerId!=null)findById(g.members,p.ownerId,'Student');
      if(actor.role==='student'&&((char.ownerId&&char.ownerId!==actor.memberId)||(p.ownerId&&p.ownerId!==actor.memberId)))fail('You can claim an available character or release your own.','FORBIDDEN');char.ownerId=p.ownerId||null;subjectId=char.id;workChanged=true;break;
    }
    case 'character.update':{
      const char=editableCharacter(g,p,actor);checkpoint(char.history,characterSnapshot(char),actor,now);if(own(p,'name'))char.name=required(p.name,'Character name');if(own(p,'brief'))char.brief=text(p.brief,4000);if(own(p,'project'))char.project=p.project==null?null:normalizeStudioProject(p.project);if(own(p,'previewDataUrl'))char.previewDataUrl=raster(p.previewDataUrl);subjectId=char.id;workChanged=true;break;
    }
    case 'character.restore':{const char=editableCharacter(g,p,actor),old=findById(char.history,p.historyId,'Character version'),restore=clone(old.snapshot);checkpoint(char.history,characterSnapshot(char),actor,now);Object.assign(char,restore);subjectId=char.id;workChanged=true;break;}
    case 'character.remove':{const char=editableCharacter(g,p,actor);g.characters=g.characters.filter(x=>x.id!==char.id);for(const scene of g.scenes){scene.stage.objects=scene.stage.objects.filter(o=>o.characterId!==char.id);for(const h of scene.history)h.snapshot.stage.objects=h.snapshot.stage.objects.filter(o=>o.characterId!==char.id);}subjectId=char.id;workChanged=true;break;}
    case 'scene.add':g.scenes.push({id:p.id||newId(),title:text(p.title,160),setting:text(p.setting,2000),script:text(p.script,30000),stage:normalizedStage(),history:[]});workChanged=true;break;
    case 'scene.update':{const scene=findById(g.scenes,p.sceneId,'Scene');checkpoint(scene.history,sceneSnapshot(scene,g.characters),actor,now);for(const field of ['title','setting','script'])if(own(p,field))scene[field]=text(p[field],field==='script'?30000:field==='setting'?2000:160);subjectId=scene.id;workChanged=true;break;}
    case 'scene.restore':{const scene=findById(g.scenes,p.sceneId,'Scene'),old=findById(scene.history,p.historyId,'Scene version'),restore=clone(old.snapshot);checkpoint(scene.history,sceneSnapshot(scene,g.characters),actor,now);Object.assign(scene,restore);subjectId=scene.id;workChanged=true;break;}
    case 'scene.remove':findById(g.scenes,p.sceneId,'Scene');g.scenes=g.scenes.filter(s=>s.id!==p.sceneId);subjectId=p.sceneId;workChanged=true;break;
    case 'stage.update':{const scene=findById(g.scenes,p.sceneId,'Scene');checkpoint(scene.history,sceneSnapshot(scene,g.characters),actor,now);scene.stage=normalizedStage(p.stage,g.characters);subjectId=scene.id;workChanged=true;break;}
    case 'reflection.save':{const memberId=actor.role==='student'?actor.memberId:p.memberId;findById(g.members,memberId,'Student');if(actor.role==='student'&&p.memberId&&p.memberId!==actor.memberId)fail('Write your own reflection.','FORBIDDEN');const reflection={memberId,text:text(p.text,6000),sources:text(p.sources,6000),tests:text(p.tests,6000),updatedAt:now};g.reflections=g.reflections.filter(r=>r.memberId!==memberId);g.reflections.push(reflection);subjectId=memberId;workChanged=true;break;}
    case 'submission.submit':{
      if(!g.story.plot.trim()&&!g.characters.length&&!g.scenes.length)fail('Add some work before submitting.');
      if(g.submission){
        const candidates=[...g.submissionHistory,clone(g.submission)],assessed=new Set(g.assessments.map(a=>a.submissionId).filter(Boolean)),pinned=candidates.filter(s=>assessed.has(s.id));
        if(pinned.length>HISTORY_LIMIT)fail('Five assessed submission versions are already retained. Export this classroom and start a new project to preserve them.','HISTORY_FULL');
        const available=HISTORY_LIMIT-pinned.length,unassessed=candidates.filter(s=>!assessed.has(s.id));
        const keep=new Set([...pinned,...(available?unassessed.slice(-available):[])].map(s=>s.id));
        g.submissionHistory=candidates.filter(s=>keep.has(s.id));
      }
      g.submission={id:newId(),submittedAt:now,submittedBy:actor.memberId||null,revision:c.revision+1,status:'submitted',snapshot:workSnapshot(g)};break;
    }
    case 'submission.reopen':if(!g.submission)fail('There is no submission to reopen.');g.submission.status='reopened';break;
    case 'assessment.save':{
      teacher(actor);const memberId=p.memberId||null;if(memberId)findById(g.members,memberId,'Student');
      if(p.confirmed===true){if(!g.submission||g.submission.status!=='submitted')fail('Review a current submitted project before confirming assessment.');if(!record(p.scores)||c.rubric.some(r=>!own(p.scores,r.id)))fail('Complete each criterion before confirming assessment.');if(!text(p.comment,6000).trim())fail('Add feedback before confirming assessment.');}
      const prior=g.assessments.find(a=>a.memberId===memberId);const a=normalizedAssessment({id:prior?.id||newId(),memberId,scores:p.scores||{},comment:p.comment,evidence:p.evidence,confirmed:p.confirmed===true,updatedAt:now,confirmedAt:p.confirmed===true?now:null,teacherName:actor.name||'Teacher',submissionId:g.submission?.id||null},c.rubric,g.members);g.assessments=g.assessments.filter(x=>x.memberId!==memberId);g.assessments.push(a);subjectId=memberId;break;
    }
    default:fail('Unsupported classroom action.','INVALID_ACTION');
  }
  if(g){g.revision+=1;if(workChanged&&g.submission)g.submission.status='outdated';g.events.push({id:newId(),type,at:now,actorId:actor.memberId||null,actorName:text(actor.name||'Teacher',120),subjectId,detail:''});g.events=g.events.slice(-EVENT_LIMIT);}
  c.revision+=1;c.updatedAt=now;return normalizeClassroom(c);
}
export function exportClassroom(classroom) { return JSON.stringify(packClassroomBundle(normalizeClassroom(classroom))); }
export function importClassroom(contents) { if(typeof contents!=='string'||contents.length>CLASSROOM_MAX_BYTES)fail('Choose a classroom JSON file under 100 MB.');let data;try{data=JSON.parse(contents);}catch{fail('This is not a valid classroom JSON file.');}return normalizeClassroom(data); }
export function assessmentEvidence(group,memberId=null) {
  const characters=(group.characters||[]).filter(c=>!memberId||c.ownerId===memberId),events=(group.events||[]).filter(e=>!memberId||e.actorId===memberId),reflections=(group.reflections||[]).filter(r=>!memberId||r.memberId===memberId);
  return {memberId,characters:characters.map(c=>({id:c.id,name:c.name,brief:c.brief,parts:c.project?.parts?.length||0,joints:c.project?.joints?.length||0,savedVersions:c.history?.length||0})),recordedActions:events.length,actionTypes:[...new Set(events.map(e=>e.type))],reflections:clone(reflections),story:{title:group.story?.title||'',plot:group.story?.plot||''},sceneCount:group.scenes?.length||0,submissionId:group.submission?.id||null,limitations:['Recorded actions do not establish effort, independence or collaboration quality.','Movement and physical prototype results require student or teacher evidence.']};
}
function csvCell(value) { let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'; }
export function exportScoresCsv(classroom) {
  const c=normalizeClassroom(classroom),rows=[['Class','Group','Student / group',...c.rubric.map(r=>r.title),'Total','Maximum','Feedback','Confirmed','Confirmed at','Submission']];
  for(const g of c.groups)for(const a of g.assessments){if(!a.confirmed)continue;rows.push([c.title,g.name,a.memberId?g.members.find(m=>m.id===a.memberId)?.name||a.memberName||'Student':'Group',...c.rubric.map(r=>a.scores[r.id]??''),c.rubric.reduce((n,r)=>n+(a.scores[r.id]||0),0),c.rubric.reduce((n,r)=>n+r.maxScore,0),a.comment,'Yes',a.confirmedAt,a.submissionId||'']);}
  return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
}
