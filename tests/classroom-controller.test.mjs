import test from 'node:test';
import assert from 'node:assert/strict';
import {createClassroomController,exportWorkspaceFile,importWorkspaceFile} from '../public/classroom-app.mjs';
import {createClassroomClient} from '../public/classroom-client.mjs';
import {createClassroom,applyClassroomAction,exportClassroom,importClassroom,exportScoresCsv} from '../public/classroom-model.mjs';
import {createStudioProject,makePart} from '../public/studio-model.mjs';
import {handleClassroomApi} from '../server/classroom-api.mjs';
import {createMemoryClassroomStore} from '../server/classroom-store.mjs';

const teacher={role:'teacher',name:'Teacher'};
const action=(type,payload={},groupId='group-a')=>({type,payload,groupId});
const change=(c,type,payload={},groupId='group-a')=>applyClassroomAction(c,action(type,payload,groupId),teacher);
function fixture(){return change(createClassroom({title:'Grade 8'}),'group.add',{id:'group-a',name:'Our group'});}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const nextTick=()=>new Promise(resolve=>setImmediate(resolve));
const noNetwork={clearSession(){},capabilities:async()=>({available:false})};

test('local classroom controller completes story, puppet, stage, submission, assessment and reopen',async()=>{
  const controller=createClassroomController({client:noNetwork});controller.open(fixture());
  await controller.dispatch(action('member.add',{id:'student-a',name:'Student A'}));
  controller.set({actor:{role:'student',memberId:'student-a',groupId:'group-a',name:'Student A'},screen:'workspace'});
  await controller.dispatch(action('story.update',{title:'A new beginning',time:'Today',place:'Our town',characters:'Panda',plot:'Panda learns to help a friend.'}));
  await controller.dispatch(action('character.add',{id:'panda',name:'Panda',brief:'A panda with a red scarf'}));
  const puppet=createStudioProject();puppet.title='Panda';puppet.parts=[makePart('Body',[[0,0],[120,0],[120,200],[0,200]])];
  await controller.dispatch(action('character.update',{characterId:'panda',project:puppet}));
  await controller.dispatch(action('scene.add',{id:'opening',title:'At home',setting:'A courtyard',script:'Panda: How can I help?'}));
  await controller.dispatch(action('stage.update',{sceneId:'opening',stage:{objects:[{id:'performer',type:'character',characterId:'panda',x:100,y:80,width:150,height:220}]}}));
  await controller.dispatch(action('reflection.save',{text:'I designed the scarf.',sources:'My drawing',tests:'Tested a paper outline against a lamp.'}));
  await controller.dispatch(action('submission.submit'));
  const snapshot=structuredClone(controller.group().submission);
  controller.set({actor:teacher,screen:'teacher'});
  const scores=Object.fromEntries(controller.state.classroom.rubric.map(r=>[r.id,3]));
  await controller.dispatch(action('assessment.save',{memberId:'student-a',scores,comment:'Explain the change after your next paper test.',evidence:['Student recorded a lamp test.'],confirmed:true}));
  assert.ok(exportScoresCsv(controller.state.classroom).includes('Student A'));
  const saved=exportClassroom(controller.state.classroom);controller.reset();assert.equal(controller.state.classroom,null);controller.open(importClassroom(saved));
  assert.deepEqual(controller.group().submission.snapshot,snapshot.snapshot);assert.deepEqual(controller.group().characters[0].project,puppet);assert.equal(controller.group().scenes[0].stage.objects[0].characterId,'panda');assert.equal(controller.group().assessments[0].confirmed,true);
});

test('queued shared mutations use the latest committed revision and preserve both edits',async()=>{
  let remote=fixture();const revisions=[],client={...noNetwork,action:async(id,revision,operation)=>{revisions.push(revision);assert.equal(revision,remote.revision);await nextTick();remote=applyClassroomAction(remote,operation,teacher);return {classroom:remote};}};
  const controller=createClassroomController({client});controller.open(remote,{storageMode:'shared'});const initial=remote.revision;
  await Promise.all([controller.dispatch(action('story.update',{plot:'First idea'})),controller.dispatch(action('scene.add',{id:'scene',title:'Our scene'}))]);
  assert.deepEqual(revisions,[initial,initial+1]);assert.equal(controller.group().story.plot,'First idea');assert.equal(controller.group().scenes[0].title,'Our scene');
});

test('revision conflict preserves open work and does not poison the next queued save',async()=>{
  let remote=fixture(),conflict=true;const client={...noNetwork,action:async(id,revision,operation)=>{if(conflict)throw Object.assign(new Error('Revision conflict'),{status:409});remote=applyClassroomAction(remote,operation,teacher);return {classroom:remote};}};
  const controller=createClassroomController({client});controller.open(remote,{storageMode:'shared'});controller.set({dirty:true});const original=exportClassroom(controller.state.classroom);
  await assert.rejects(controller.dispatch(action('story.update',{plot:'Student draft'})),{status:409});assert.equal(exportClassroom(controller.state.classroom),original);assert.equal(controller.state.dirty,true);
  conflict=false;await controller.dispatch(action('story.update',{plot:'Retried draft'}));assert.equal(controller.group().story.plot,'Retried draft');
});

test('background refresh waits for unsaved draft review before adopting newer work',async()=>{
  const initial=fixture(),newer=change(initial,'story.update',{plot:'Remote idea'});const controller=createClassroomController({client:{...noNetwork,get:async()=>({classroom:newer})}});controller.open(initial,{storageMode:'shared'});controller.set({dirty:true});
  assert.equal(await controller.refresh(),false);assert.equal(controller.state.pendingUpdate,true);assert.equal(controller.group().story.plot,'');
  assert.equal(await controller.refresh({force:true}),true);assert.equal(controller.group().story.plot,'Remote idea');
});

test('slow refresh cannot roll back a later successful save',async()=>{
  const initial=fixture(),older=change(initial,'story.update',{plot:'Older remote'}),latest=change(older,'story.update',{plot:'Latest accepted save'}),pending=deferred();
  const controller=createClassroomController({client:{...noNetwork,get:()=>pending.promise}});controller.open(initial,{storageMode:'shared'});const refresh=controller.refresh();controller.set({classroom:latest});pending.resolve({classroom:older});
  assert.equal(await refresh,false);assert.equal(controller.state.classroom.revision,latest.revision);assert.equal(controller.group().story.plot,'Latest accepted save');
});

test('responses from a previous class cannot replace a newly opened classroom',async()=>{
  const initial=fixture(),other=createClassroom({title:'Another class'}),pending=deferred();const controller=createClassroomController({client:{...noNetwork,get:()=>pending.promise}});controller.open(initial,{storageMode:'shared'});const request=controller.refresh();controller.open(other);
  pending.resolve({classroom:change(initial,'story.update',{plot:'Late old response'})});await request;assert.equal(controller.state.classroom.id,other.id);assert.equal(controller.state.storageMode,'local');
});

test('reset prevents an in-flight save from resurrecting the closed session',async()=>{
  const initial=fixture(),pending=deferred();let cleared=0;const controller=createClassroomController({client:{clearSession(){cleared++;},action:()=>pending.promise}});controller.open(initial,{storageMode:'shared'});const request=controller.dispatch(action('story.update',{plot:'In flight'}));await nextTick();controller.reset();pending.resolve({classroom:change(initial,'story.update',{plot:'In flight'})});await assert.rejects(request,/previous class|changed|closed/i);
  assert.equal(controller.state.classroom,null);assert.equal(controller.state.screen,'welcome');assert.equal(cleared,1);
});

test('shared actor changes move the student workspace to their new authorised group',async()=>{
  let initial=fixture();initial=change(initial,'member.add',{id:'student-a',name:'Student A'});initial=change(initial,'group.add',{id:'group-b',name:'New group'});const moved=change(initial,'member.move',{memberId:'student-a',targetGroupId:'group-b'});moved.groups=moved.groups.filter(g=>g.id==='group-b');
  const actor={role:'student',memberId:'student-a',groupId:'group-a',name:'Student A'},newActor={...actor,groupId:'group-b'};const controller=createClassroomController({client:{...noNetwork,get:async()=>({classroom:moved,actor:newActor})}});controller.open(initial,{storageMode:'shared',actor});await controller.refresh();
  assert.equal(controller.state.actor.groupId,'group-b');assert.equal(controller.state.groupId,'group-b');assert.equal(controller.group().name,'New group');
});

test('real client and API keep simultaneous students isolated and expose confirmed feedback only',async()=>{
  const store=createMemoryClassroomStore(),env={CLASSROOM_TRUST_HOST_IDENTITY:'1'};
  const fetcher=isTeacher=>async(url,init={})=>{const headers=new Headers(init.headers);if(isTeacher)headers.set('oai-authenticated-user-id','teacher-test');return handleClassroomApi(new Request(url,{...init,headers}),env,{store});};
  const makeClient=isTeacher=>createClassroomClient({base:'https://classroom.test/api/classroom',fetcher:fetcher(isTeacher)}),teacherClient=makeClient(true),created=await teacherClient.create({title:'Classroom integration'}),tc=createClassroomController({client:teacherClient});tc.open(created.classroom,{storageMode:'shared'});
  await tc.dispatch(action('group.add',{id:'group-a',name:'Our group'}));await tc.dispatch(action('group.add',{id:'group-b',name:'Other group'}));
  const aClient=makeClient(false),bClient=makeClient(false),joinA=await aClient.join({code:created.joinCode,groupId:'group-a',name:'Student A',passphrase:'my-secret-one'}),joinB=await bClient.join({code:created.joinCode,groupId:'group-b',name:'Student B',passphrase:'my-secret-two'}),a=createClassroomController({client:aClient}),b=createClassroomController({client:bClient});
  a.open(joinA.classroom,{storageMode:'shared',actor:joinA.actor});b.open(joinB.classroom,{storageMode:'shared',actor:joinB.actor});await a.refresh();
  await a.dispatch(action('story.update',{plot:'Our private group story'}));assert.equal(a.state.classroom.groups.length,1);assert.equal(b.state.classroom.groups.length,1);
  await assert.rejects(a.dispatch(action('story.update',{plot:'Cannot alter this'},'group-b')),{status:403});
  await a.dispatch(action('submission.submit'));await tc.refresh();const scores=Object.fromEntries(tc.state.classroom.rubric.map(r=>[r.id,2]));await tc.dispatch(action('assessment.save',{memberId:joinA.actor.memberId,scores,comment:'Private teacher draft',confirmed:false}));await a.refresh();assert.equal(a.group().assessments.length,0);
  await tc.dispatch(action('assessment.save',{memberId:joinA.actor.memberId,scores,comment:'Confirmed student feedback',confirmed:true}));await a.refresh();assert.equal(a.group().assessments[0].comment,'Confirmed student feedback');await b.refresh();assert.ok(!JSON.stringify(b.state.classroom).includes('Confirmed student feedback'));
  const classId=tc.state.classroom.id;a.reset();await assert.rejects(aClient.get(classId),e=>e.status===401||e.status===404);
});

test('explicit workspace download preserves typed drafts separately from accepted classroom work',()=>{
  const c=fixture(),key=c.id+':group-a:story.update::::::',drafts=[[key,{title:'Uncommitted title',plot:'Typed but not saved'}]],view={groupId:'group-a',tab:'story',selectedCharacterId:null,selectedSceneId:null,selectedObjectId:null};
  const restored=importWorkspaceFile(exportWorkspaceFile(c,drafts,view));assert.equal(restored.classroom.groups[0].story.title,'');assert.equal(restored.classroom.groups[0].story.plot,'');assert.deepEqual(restored.drafts,drafts);assert.equal(restored.view.tab,'story');assert.equal(c.groups[0].story.plot,'');
});

test('workspace export works without optional view state and imports legacy class files',()=>{
  const c=fixture();const defaults=importWorkspaceFile(exportWorkspaceFile(c));assert.deepEqual(defaults.classroom,c);assert.deepEqual(defaults.drafts,[]);
  for(const source of [JSON.stringify(c),exportClassroom(c)]){const restored=importWorkspaceFile(source);assert.deepEqual(restored.classroom,c);assert.deepEqual(restored.drafts,[]);assert.deepEqual(restored.view,{});}
});

test('workspace files exclude password, passphrase and token fields in both directions',()=>{
  const c=fixture(),key=c.id+':group-a:story.update::::::',values={plot:'Keep this draft',password:'never-export-password',passphrase:'never-export-passphrase',token:'never-export-token'},view={groupId:'group-a',tab:'story',selectedCharacterId:null,selectedSceneId:null,selectedObjectId:null};
  const exported=exportWorkspaceFile(c,[[key,values]],view);assert.ok(!exported.includes('never-export'));assert.deepEqual(importWorkspaceFile(exported).drafts,[[key,{plot:'Keep this draft'}]]);
  const incoming=JSON.stringify({...c,workspaceDrafts:[[key,values]],workspaceView:view});assert.deepEqual(importWorkspaceFile(incoming).drafts,[[key,{plot:'Keep this draft'}]]);
});

test('workspace imports reject malformed and prototype-bearing data and ignore another class drafts',()=>{
  const c=fixture();for(const source of ['not json','null','[]','{"version":1,"__proto__":{"polluted":true}}',JSON.stringify({...c,workspaceDrafts:JSON.parse('[["'+c.id+':story",{"constructor":{"prototype":{"polluted":true}}}]]')})])assert.throws(()=>importWorkspaceFile(source));
  const restored=importWorkspaceFile(JSON.stringify({...c,workspaceDrafts:[['another-class:story',{plot:'Wrong project'}]]}));assert.deepEqual(restored.drafts,[]);assert.equal({}.polluted,undefined);
});
