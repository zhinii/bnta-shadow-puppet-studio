import test from 'node:test';
import assert from 'node:assert/strict';
import {createClassroom,normalizeClassroom,applyClassroomAction,exportClassroom,importClassroom,assessmentEvidence,exportScoresCsv} from '../public/classroom-model.mjs';
import {createStudioProject,makePart} from '../public/studio-model.mjs';

const teacher={role:'teacher',name:'Teacher Lin'};
const alice={role:'student',groupId:'g1',memberId:'alice',name:'Alice'};
const bob={role:'student',groupId:'g1',memberId:'bob',name:'Bob'};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1cAAAAASUVORK5CYII=';
const act=(c,type,payload={},actor=teacher,groupId='g1')=>applyClassroomAction(c,{type,groupId,payload},actor);
function fixture(){let c=createClassroom({title:'Grade 8',language:'en'});c=act(c,'group.add',{id:'g1',name:'Workshop'});c=act(c,'group.add',{id:'g2',name:'Second group'});for(const [id,name]of [['alice','Alice'],['bob','Bob']])c=act(c,'member.add',{id,name});return c;}
function artwork(){let p=createStudioProject();p.title='Panda';p.parts=[makePart('Body',[[0,0],[100,0],[100,150],[0,150]])];p.assets=[{id:'panda-art',name:'Source print',mime:'image/png',width:1,height:1,dataUrl:png}];return p;}

test('classrooms start without story or character presets and round trip exactly',()=>{
  const c=createClassroom({title:'Grade 8, Class 1',language:'zh'});assert.equal(c.revision,0);assert.equal(c.groups.length,0);assert.equal(c.language,'zh');assert.equal(c.rubric.length,5);assert.deepEqual(importClassroom(exportClassroom(c)),c);
  const d=act(c,'group.add',{id:'g1',name:'Our group'});assert.equal(c.groups.length,0);assert.equal(d.groups[0].story.plot,'');assert.equal(d.groups[0].characters.length,0);
});
test('students can create story and scenes in parallel before all character assignments',()=>{
  let c=fixture();c=act(c,'scene.add',{id:'s1',title:'Opening'},alice);c=act(c,'story.update',{time:'Today',plot:'A panda learns to dance.'},bob);c=act(c,'story.handoff',{field:'plot',memberId:'alice',status:'active'},bob);
  assert.equal(c.groups[0].scenes[0].title,'Opening');assert.equal(c.groups[0].characters.length,0);assert.equal(c.groups[0].story.relay[3].memberId,'alice');
});
test('students cannot edit another group, another owner, classroom membership or scores',()=>{
  let c=fixture();c=act(c,'character.add',{id:'char-a',name:'Panda',ownerId:'bob'},alice);assert.equal(c.groups[0].characters[0].ownerId,'alice');
  const attempts=[()=>act(c,'story.update',{plot:'Hijack'},alice,'g2'),()=>act(c,'character.update',{characterId:'char-a',name:'Changed'},bob),()=>act(c,'character.assign',{characterId:'char-a',ownerId:'bob'},bob),()=>act(c,'member.add',{name:'Fake'},alice),()=>act(c,'assessment.save',{comment:'Give me full marks'},alice),()=>act(c,'group.add',{name:'Fake'},alice),()=>act(c,'reflection.save',{memberId:'bob',text:'Impersonate'},alice)];
  for(const attempt of attempts)assert.throws(attempt,e=>e.code==='FORBIDDEN');
  assert.throws(()=>act(c,'story.update',{plot:'Fake'},{...alice,memberId:'missing'}),e=>e.code==='FORBIDDEN');
});
test('story restore checkpoints the current version and histories remain bounded',()=>{
  let c=fixture();c=act(c,'story.update',{plot:'Original'},alice);c=act(c,'story.update',{plot:'Second'},bob);const version=c.groups[0].story.history.at(-1).id;c=act(c,'story.restore',{historyId:version},alice);
  assert.equal(c.groups[0].story.plot,'Original');assert.equal(c.groups[0].story.history.at(-1).snapshot.plot,'Second');
  for(let i=0;i<10;i++)c=act(c,'story.update',{plot:'Revision '+i},alice);assert.equal(c.groups[0].story.history.length,5);
});
test('character project, source pixels, thumbnail and older edit are preserved',()=>{
  let c=fixture();c=act(c,'character.add',{id:'panda',name:'Panda'},alice);const p=artwork();c=act(c,'character.update',{characterId:'panda',project:p,previewDataUrl:png},alice);c=act(c,'character.update',{characterId:'panda',name:'Dancing panda'},alice);
  const version=c.groups[0].characters[0].history.at(-1).id;c=act(c,'character.restore',{characterId:'panda',historyId:version},alice);
  const char=importClassroom(exportClassroom(c)).groups[0].characters[0];assert.equal(char.name,'Panda');assert.deepEqual(char.project,p);assert.equal(char.previewDataUrl,png);assert.equal(char.history.at(-1).snapshot.name,'Dancing panda');
});
test('stage edits and scene restore retain geometry and reject executable image sources',()=>{
  let c=fixture();c=act(c,'character.add',{id:'panda',name:'Panda'},alice);c=act(c,'scene.add',{id:'opening',title:'Opening'},alice);
  const stage={width:1200,height:675,background:null,objects:[{id:'actor',type:'character',characterId:'panda',x:110,y:200,width:180,height:280}]};c=act(c,'stage.update',{sceneId:'opening',stage},alice);c=act(c,'scene.update',{sceneId:'opening',title:'New title'},bob);
  const version=c.groups[0].scenes[0].history.at(-1).id;c=act(c,'scene.restore',{sceneId:'opening',historyId:version},alice);assert.equal(c.groups[0].scenes[0].title,'Opening');assert.equal(c.groups[0].scenes[0].stage.objects[0].x,110);
  for(const dataUrl of ['javascript:alert(1)','https://example.com/tracker.png','data:image/svg+xml;base64,PHN2Zz4='])assert.throws(()=>act(c,'stage.update',{sceneId:'opening',stage:{objects:[{id:'img',type:'image',dataUrl}]}}));
  assert.throws(()=>act(c,'stage.update',{sceneId:'opening',stage:{objects:[{id:'missing',type:'character',characterId:'no-such-character'}]}}));
});
test('submission keeps immutable prior work while later edits mark it outdated',()=>{
  let c=fixture();c=act(c,'character.add',{id:'panda',name:'Panda'},alice);c=act(c,'character.update',{characterId:'panda',project:artwork()},alice);c=act(c,'submission.submit',{},alice);
  const submitted=clone(c.groups[0].submission);c=act(c,'character.update',{characterId:'panda',name:'Different'},alice);assert.equal(c.groups[0].submission.status,'outdated');assert.deepEqual(c.groups[0].submission.snapshot,submitted.snapshot);assert.equal(submitted.snapshot.characters[0].name,'Panda');
  c=act(c,'character.remove',{characterId:'panda'},alice);assert.equal(c.groups[0].submission.snapshot.characters[0].name,'Panda');assert.equal(c.groups[0].characters.length,0);
  c=act(c,'story.update',{plot:'A new plan'},alice);c=act(c,'submission.submit',{},alice);assert.notEqual(c.groups[0].submission.id,submitted.id);assert.equal(c.groups[0].submission.status,'submitted');
});
function clone(x){return JSON.parse(JSON.stringify(x));}
test('assessments require teacher, complete criteria and a submitted work snapshot',()=>{
  let c=fixture();const scores=Object.fromEntries(c.rubric.map(r=>[r.id,3]));assert.throws(()=>act(c,'assessment.save',{scores,comment:'Evidence checked',confirmed:true}));c=act(c,'story.update',{plot:'Story'},alice);c=act(c,'submission.submit',{},alice);
  assert.throws(()=>act(c,'assessment.save',{scores:{story:3},comment:'Incomplete',confirmed:true}));assert.throws(()=>act(c,'assessment.save',{scores:{...scores,testing:99},comment:'Invalid',confirmed:true}));
  c=act(c,'assessment.save',{memberId:'alice',scores,comment:'Test the knee further.',evidence:['Student described a paper test.'],confirmed:true});const a=c.groups[0].assessments[0];assert.equal(a.teacherName,'Teacher Lin');assert.equal(a.submissionId,c.groups[0].submission.id);assert.equal(a.confirmed,true);assert.ok(a.confirmedAt);
  c=act(c,'rubric.update',{rubric:c.rubric.map(r=>({...r,maxScore:2}))});assert.equal(c.groups[0].assessments[0].confirmed,false);assert.deepEqual(c.groups[0].assessments[0].scores,{});
});
test('evidence records work without inventing physical test success or effort scores',()=>{
  let c=fixture();c=act(c,'character.add',{id:'panda',name:'Panda'},alice);c=act(c,'reflection.save',{text:'I changed the shape.',sources:'Museum reference',tests:'Paper knee bent but caught on the coat.'},alice);const ev=assessmentEvidence(c.groups[0],'alice');assert.equal(ev.characters.length,1);assert.equal(ev.reflections[0].tests,'Paper knee bent but caught on the coat.');assert.equal(ev.recordedActions,2);assert.equal(ev.score,undefined);assert.ok(ev.limitations.some(t=>t.includes('do not establish effort')));
});
test('only confirmed results export and spreadsheet formula injection is neutralized',()=>{
  let c=fixture();c=act(c,'member.update',{memberId:'alice',name:'=HYPERLINK("bad")'});c=act(c,'story.update',{plot:'Story'},alice);c=act(c,'submission.submit',{},alice);c=act(c,'assessment.save',{memberId:'alice',scores:Object.fromEntries(c.rubric.map(r=>[r.id,2])),comment:'@unsafe',confirmed:true});c=act(c,'assessment.save',{memberId:'bob',comment:'Draft only',scores:{story:1},confirmed:false});const csv=exportScoresCsv(c);assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes("'@unsafe"));assert.equal(csv.split('\r\n').length,2);
});
test('archived classrooms remain read-only until teacher explicitly reopens them',()=>{
  let c=act(fixture(),'class.update',{archived:true});assert.throws(()=>act(c,'story.update',{plot:'New'},teacher),e=>e.code==='ARCHIVED');assert.throws(()=>act(c,'class.update',{archived:false},alice),e=>e.code==='ARCHIVED');c=act(c,'class.update',{archived:false});assert.equal(c.archived,false);
});
test('imports reject prototype properties, duplicate ids, impossible geometry and unsupported versions',()=>{
  let c=fixture();assert.throws(()=>importClassroom('{"version":1,"__proto__":{"admin":true}}'));const duplicate=clone(c);duplicate.groups[1].members.push({...duplicate.groups[0].members[0]});assert.throws(()=>normalizeClassroom(duplicate));assert.throws(()=>normalizeClassroom({...c,version:42}));assert.throws(()=>act(c,'does-not-exist',{},alice));const untouched=exportClassroom(c);assert.throws(()=>act(c,'scene.add',{id:'__proto__'},alice));assert.equal(exportClassroom(c),untouched);
});
test('new scenes use the shared 960 by 540 stage and rubric levels are explicit',()=>{
  const c=act(fixture(),'scene.add',{id:'s',title:'Stage'},alice);assert.equal(c.groups[0].scenes[0].stage.width,960);assert.equal(c.groups[0].scenes[0].stage.height,540);for(const r of c.rubric){assert.equal(r.descriptors.length,5);assert.match(r.descriptors[0],/No .*evidence/);assert.ok(r.descriptors[4].length>30);}
});
test('deleting a character clears stage and scene-history references but keeps submitted artwork',()=>{
  let c=fixture();c=act(c,'character.add',{id:'panda',name:'Panda'},alice);c=act(c,'character.update',{characterId:'panda',project:artwork()},alice);c=act(c,'scene.add',{id:'s',title:'Stage'},alice);c=act(c,'stage.update',{sceneId:'s',stage:{objects:[{id:'actor',type:'character',characterId:'panda'}]}},alice);c=act(c,'scene.update',{sceneId:'s',script:'Panda enters.'},alice);c=act(c,'submission.submit',{},alice);const snapshot=clone(c.groups[0].submission.snapshot);
  c=act(c,'character.remove',{characterId:'panda'},alice);assert.equal(c.groups[0].scenes[0].stage.objects.length,0);for(const h of c.groups[0].scenes[0].history)assert.equal(h.snapshot.stage.objects.length,0);assert.deepEqual(c.groups[0].submission.snapshot,snapshot);assert.equal(c.groups[0].submission.snapshot.scenes[0].stage.objects[0].characterId,'panda');assert.deepEqual(importClassroom(exportClassroom(c)),c);
});
test('teacher can move members without losing score attribution or changing submitted membership',()=>{
  let c=fixture();c=act(c,'character.add',{id:'panda',name:'Panda'},alice);c=act(c,'reflection.save',{text:'My test result',tests:'Bent the paper joint'},alice);c=act(c,'submission.submit',{},alice);c=act(c,'assessment.save',{memberId:'alice',scores:Object.fromEntries(c.rubric.map(r=>[r.id,2])),comment:'Reviewed the paper test.',confirmed:true});const submitted=clone(c.groups[0].submission);
  assert.throws(()=>act(c,'member.move',{memberId:'alice',targetGroupId:'g2'},bob),e=>e.code==='FORBIDDEN');c=act(c,'member.move',{memberId:'alice',targetGroupId:'g2'});assert.equal(c.groups[0].members.some(m=>m.id==='alice'),false);assert.equal(c.groups[1].members[0].id,'alice');assert.equal(c.groups[0].characters[0].ownerId,null);assert.equal(c.groups[1].reflections[0].text,'My test result');assert.equal(c.groups[0].assessments[0].memberName,'Alice');assert.equal(c.groups[0].assessments[0].confirmed,true);assert.deepEqual(c.groups[0].submission.snapshot,submitted.snapshot);assert.ok(exportScoresCsv(c).includes('Alice'));assert.throws(()=>act(c,'story.update',{plot:'Wrong group'},alice),e=>e.code==='FORBIDDEN');
  const moved={...alice,groupId:'g2'};c=act(c,'story.update',{plot:'New group story'},moved,'g2');assert.equal(c.groups[1].story.plot,'New group story');
});
test('outdated submission cannot receive new confirmed scores until it is resubmitted',()=>{
  let c=fixture();c=act(c,'story.update',{plot:'Version 1'},alice);c=act(c,'submission.submit',{},alice);c=act(c,'story.update',{plot:'Version 2'},alice);const payload={scores:Object.fromEntries(c.rubric.map(r=>[r.id,2])),comment:'Reviewed.',confirmed:true};assert.throws(()=>act(c,'assessment.save',payload),/current submitted/);c=act(c,'submission.submit',{},alice);c=act(c,'assessment.save',payload);assert.equal(c.groups[0].assessments[0].confirmed,true);
});
test('resubmission archives exact assessed snapshots and bounds unassessed history',()=>{
  let c=fixture();c=act(c,'story.update',{plot:'Assessed original'},alice);c=act(c,'submission.submit',{},alice);c=act(c,'assessment.save',{memberId:'alice',scores:Object.fromEntries(c.rubric.map(r=>[r.id,3])),comment:'Reviewed original.',confirmed:true});const original=clone(c.groups[0].submission);
  for(let i=0;i<9;i++){c=act(c,'story.update',{plot:'Later draft '+i},alice);c=act(c,'submission.submit',{},alice);}
  const g=c.groups[0];assert.equal(g.submissionHistory.length,5);assert.equal(g.submissionHistory.find(s=>s.id===original.id).snapshot.story.plot,'Assessed original');assert.deepEqual(g.submissionHistory.find(s=>s.id===original.id).snapshot,original.snapshot);assert.equal(g.assessments[0].submissionId,original.id);assert.notEqual(g.submission.id,original.id);assert.equal(g.submission.snapshot.story.plot,'Later draft 8');assert.deepEqual(importClassroom(exportClassroom(c)),c);
  const raw=clone(c);raw.groups[0].submissionHistory.push(clone(original));assert.throws(()=>normalizeClassroom(raw));
});
test('portable classroom embeds repeated artwork once across edits and submissions',()=>{
  let c=fixture();c=act(c,'character.add',{id:'panda',name:'Panda'},alice);c=act(c,'character.update',{characterId:'panda',project:artwork(),previewDataUrl:png},alice);for(let i=0;i<3;i++)c=act(c,'character.update',{characterId:'panda',brief:'Revision '+i},alice);c=act(c,'submission.submit',{},alice);c=act(c,'story.update',{plot:'Next version'},alice);c=act(c,'submission.submit',{},alice);
  const portable=exportClassroom(c),bundle=JSON.parse(portable);assert.equal(bundle.$classroomBundle,1);assert.equal(Object.keys(bundle.assets).length,1);assert.equal(portable.split(png).length-1,1);assert.deepEqual(importClassroom(portable),c);assert.deepEqual(normalizeClassroom(bundle),c);
  delete bundle.assets.a0;assert.throws(()=>normalizeClassroom(bundle),/reference.*missing|missing.*reference/i);
});
test('a normalized class of thirty image-backed puppets retains five histories in a compact roundtrip',()=>{
  // Synthetic raster transport payloads exercise storage capacity, not decoding
  // or artistic fidelity. Each image is unique and reused in its own history.
  const c=fixture(),g=c.groups[0],suffix='ABCDEFGHIJKLMNOPQRSTUVWXYZabcd';
  g.members=Array.from({length:30},(_,i)=>({id:'student-'+i,name:'Student '+i}));
  g.characters=g.members.map((member,i)=>{
    const project=artwork();project.id='puppet-'+i;project.assets[0].dataUrl='data:image/png;base64,iVBORw0KGgo'+'A'.repeat(1024*1024)+suffix[i];
    const snapshot={name:'Puppet '+i,brief:'Custom character',project,previewDataUrl:null};return {id:'character-'+i,...snapshot,ownerId:member.id,history:Array.from({length:5},(_,n)=>({id:'version-'+i+'-'+n,at:'2026-11-26T00:00:00Z',actorId:member.id,actorName:member.name,snapshot}))};
  });
  g.submission={id:'submission-one',submittedAt:'2026-11-26T00:00:00Z',submittedBy:g.members[0].id,revision:c.revision,status:'submitted',snapshot:{name:g.name,members:g.members,story:g.story,characters:g.characters.map(char=>({...char,history:[]})),scenes:[],reflections:[]}};
  const encoded=exportClassroom(c);assert.ok(new TextEncoder().encode(encoded).length<32*1024*1024);assert.equal(Object.keys(JSON.parse(encoded).assets).length,30);
  const restored=importClassroom(encoded);assert.equal(restored.groups[0].characters.length,30);for(let i=0;i<30;i++){const char=restored.groups[0].characters[i];assert.equal(char.history.length,5);assert.equal(char.history[4].snapshot.project.assets[0].dataUrl,char.project.assets[0].dataUrl);assert.equal(restored.groups[0].submission.snapshot.characters[i].project.assets[0].dataUrl,char.project.assets[0].dataUrl);}
});
test('group revisions increment exactly once for scoped changes and stay stable during read/history normalization',()=>{
  let c=fixture();assert.equal(c.groups[0].revision,2);assert.equal(c.groups[1].revision,0);const otherRevision=c.groups[1].revision;
  for(const [type,payload]of [['story.update',{plot:'A new story'}],['story.handoff',{field:'plot',memberId:'alice',status:'done'}],['character.add',{id:'panda',name:'Panda'}],['character.update',{characterId:'panda',brief:'A scarf'}],['scene.add',{id:'s1',title:'Opening'}],['scene.update',{sceneId:'s1',script:'Hello'}],['stage.update',{sceneId:'s1',stage:{objects:[]}}],['reflection.save',{text:'I made a choice.'}],['submission.submit',{}]]){
    const before=c.groups[0].revision,global=c.revision;c=act(c,type,payload,alice);assert.equal(c.groups[0].revision,before+1,type);assert.equal(c.groups[1].revision,otherRevision,type+' keeps other groups unchanged');assert.equal(c.revision,global+1);
    assert.equal(normalizeClassroom(c).groups[0].revision,c.groups[0].revision);assert.equal(importClassroom(exportClassroom(c)).groups[0].revision,c.groups[0].revision);
  }
  const before=c.groups[0].revision,historyId=c.groups[0].story.history[0].id;c=act(c,'story.restore',{historyId},alice);assert.equal(c.groups[0].revision,before+1);assert.equal(c.groups[1].revision,0);
});
test('membership moves and rubric edits invalidate the affected group revisions without double increments',()=>{
  let c=fixture(),a=c.groups[0].revision,b=c.groups[1].revision;c=act(c,'member.update',{memberId:'alice',name:'Alice A'});assert.equal(c.groups[0].revision,a+1);assert.equal(c.groups[1].revision,b);
  a=c.groups[0].revision;c=act(c,'member.move',{memberId:'alice',targetGroupId:'g2'});assert.equal(c.groups[0].revision,a+1);assert.equal(c.groups[1].revision,b+1);
  [a,b]=c.groups.map(g=>g.revision);c=act(c,'rubric.update',{rubric:c.rubric});assert.deepEqual(c.groups.map(g=>g.revision),[a+1,b+1]);
  [a,b]=c.groups.map(g=>g.revision);c=act(c,'class.update',{title:'New class name'});assert.deepEqual(c.groups.map(g=>g.revision),[a,b]);
  const legacy=clone(c);delete legacy.groups[0].revision;assert.equal(normalizeClassroom(legacy).groups[0].revision,0);for(const revision of [-1,.5,'1']){const malformed=clone(c);malformed.groups[0].revision=revision;assert.throws(()=>normalizeClassroom(malformed));}
});
