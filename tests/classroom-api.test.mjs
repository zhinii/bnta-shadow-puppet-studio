import test from 'node:test';
import assert from 'node:assert/strict';
import {handleClassroomApi} from '../server/classroom-api.mjs';
import {createMemoryClassroomStore,createClassroomStore} from '../server/classroom-store.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {unpackClassroomBundle} from '../public/classroom-bundle.mjs';

function harness(){
  const store=createMemoryClassroomStore();let now=Date.now();
  const env={CLASSROOM_TRUST_HOST_IDENTITY:'1'};
  async function call(path,{method='GET',body,teacher='teacher-a',token,headers={}}={}){
    const requestHeaders={...headers,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(teacher?{'oai-authenticated-user-id':teacher}:{}),...(token?{Authorization:'Bearer '+token}:{})};
    const response=await handleClassroomApi(new Request('https://classroom.test/api/classroom'+path,{method,headers:requestHeaders,...(body!==undefined?{body:JSON.stringify(body)}:{})}),env,{store,now:()=>now});
    const data=await response.json(),packedClassroom=data.classroom?.$classroomBundle?data.classroom:null;
    if(packedClassroom)data.classroom=unpackClassroomBundle(packedClassroom);
    return {status:response.status,data,packedClassroom,headers:response.headers};
  }
  async function create(){const result=await call('/classes',{method:'POST',body:{title:'Grade 8',language:'en'}});assert.equal(result.status,201,JSON.stringify(result.data));return result.data;}
  async function act(state,type,payload={},groupId,options={}){const result=await call('/classes/'+state.classroom.id+'/actions',{method:'POST',body:{revision:state.classroom.revision,action:{type,payload,...(groupId?{groupId}:{})}},...options});if(result.status===200)Object.assign(state,result.data);return result;}
  async function group(state,id='g-one',name='Moon Group'){const r=await act(state,'group.add',{id,name});assert.equal(r.status,200,JSON.stringify(r.data));return id;}
  async function join(state,groupId,name='Student A',passphrase='my-secret-phrase'){return call('/join',{method:'POST',teacher:null,body:{code:state.joinCode,groupId,name,passphrase}});}
  return {call,create,act,group,join,store,setTime:value=>{now=value;},now:()=>now};
}

test('unconfigured production is explicit and has no in-memory success fallback',async()=>{
  let r=await handleClassroomApi(new Request('https://classroom.test/api/classroom/capabilities'));
  assert.equal(r.status,200);assert.equal((await r.json()).available,false);
  r=await handleClassroomApi(new Request('https://classroom.test/api/classroom/classes'));
  assert.equal(r.status,503);assert.equal((await r.json()).code,'CLASSROOM_UNAVAILABLE');
  assert.throws(()=>createClassroomStore({}),/not configured/);
});

test('teacher ownership and sign-in cannot be asserted in JSON or browser role fields',async()=>{
  const h=harness();let r=await h.call('/classes',{method:'POST',teacher:null,body:{title:'Unauthorised',role:'teacher'}});assert.equal(r.status,401);
  const c=await h.create();r=await h.call('/classes/'+c.classroom.id,{teacher:'teacher-b'});assert.equal(r.status,404);
  r=await h.call('/classes',{teacher:'teacher-b'});assert.deepEqual(r.data.classes,[]);
  r=await h.call('/classes/'+c.classroom.id+'/actions',{method:'POST',teacher:'teacher-b',body:{revision:0,action:{type:'class.update',payload:{title:'Stolen'}}}});assert.equal(r.status,404);
});

test('lookup exposes group choices, not student names, artwork or private assessments',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c);await h.join(c,g);
  const r=await h.call('/lookup',{method:'POST',teacher:null,body:{code:c.joinCode.toLowerCase()}});
  assert.equal(r.status,200);assert.equal(r.data.groups[0].memberCount,1);assert.ok(!JSON.stringify(r.data).includes('Student A'));assert.ok(!JSON.stringify(r.data).includes('pass_hash'));
});

test('student signs in again with secret phrase and cannot impersonate an existing name',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c),first=await h.join(c,g);assert.equal(first.status,200);
  assert.ok(first.data.token);assert.equal(first.data.actor.role,'student');assert.equal(first.data.classroom.groups.length,1);assert.equal(first.data.joinCode,undefined);
  const identity=await h.store.findIdentity(c.classroom.id,'student a');assert.ok(identity.pass_hash.startsWith('pbkdf2:100000:'));assert.ok(!identity.pass_hash.includes('my-secret-phrase'));
  const wrong=await h.join(c,g,'STUDENT A','different-secret');assert.equal(wrong.status,401);
  const again=await h.join(c,g,'Student A');assert.equal(again.status,200);assert.equal(again.data.actor.memberId,first.data.actor.memberId);assert.notEqual(again.data.token,first.data.token);
  assert.equal((await h.store.getClass(c.classroom.id)).document.groups[0].members.length,1);
});

test('students only read and edit their own group, regardless of payload role',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c);await h.group(c,'g-two','Other Group');
  const a=await h.join(c,g),b=await h.join(c,'g-two','Student B');
  const view=await h.call('/classes/'+c.classroom.id,{teacher:null,token:a.data.token});assert.equal(view.data.classroom.groups.length,1);assert.equal(view.data.classroom.groups[0].id,g);
  const r=await h.act(view.data,'story.update',{plot:'A student-written story'},g,{teacher:null,token:a.data.token});assert.equal(r.status,200);
  const invalid=await h.act(view.data,'story.update',{plot:'Overwrite another group',role:'teacher'},'g-two',{teacher:null,token:a.data.token});assert.equal(invalid.status,403);
  const escalation=await h.act(view.data,'assessment.save',{memberId:null,scores:{story:4},comment:'Invented grade',confirmed:false},g,{teacher:null,token:a.data.token});assert.equal(escalation.status,403);
  const list=await h.call('/classes',{teacher:null,token:b.data.token});assert.equal(list.status,401);
});

test('optimistic revisions prevent simultaneous saves from silently overwriting each other',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c),revision=c.classroom.revision;
  const save=plot=>h.call('/classes/'+c.classroom.id+'/actions',{method:'POST',body:{revision,action:{type:'story.update',groupId:g,payload:{plot}}}});
  const results=await Promise.all([save('First idea'),save('Second idea')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const row=await h.store.getClass(c.classroom.id);assert.equal(row.revision,revision+1);assert.equal(row.document.groups[0].story.history.length,1);
});

test('unrelated groups may save concurrently from the same class revision without losing either change',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c);await h.group(c,'g-two','Other Group');const revision=c.classroom.revision;
  const save=(groupId,plot)=>h.call('/classes/'+c.classroom.id+'/actions',{method:'POST',body:{revision,baseGroupRevision:c.classroom.groups.find(item=>item.id===groupId).revision,action:{type:'story.update',groupId,payload:{plot}}}});
  const results=await Promise.all([save(g,'Group one original idea'),save('g-two','Group two independent idea')]);assert.deepEqual(results.map(r=>r.status),[200,200]);
  const row=await h.store.getClass(c.classroom.id);assert.equal(row.revision,revision+2);assert.equal(row.document.groups[0].story.plot,'Group one original idea');assert.equal(row.document.groups[1].story.plot,'Group two independent idea');assert.deepEqual(row.document.groups.map(item=>item.revision),[1,1]);
});

test('group revisions still reject stale work in the same group and never relax administrative revision checks',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c);await h.group(c,'g-two','Other Group');const revision=c.classroom.revision;
  const save=(type,groupId,payload,baseGroupRevision=0)=>h.call('/classes/'+c.classroom.id+'/actions',{method:'POST',body:{revision,baseGroupRevision,action:{type,groupId,payload}}});
  assert.equal((await save('story.update',g,{plot:'Accepted original'})).status,200);
  assert.equal((await save('story.update',g,{plot:'Stale overwrite'})).status,409);
  assert.equal((await save('group.update','g-two',{name:'Stale admin rename'})).status,409);
  assert.equal((await save('member.add','g-two',{name:'Stale new member'})).status,409);
  assert.equal((await save('story.update','g-two',{plot:'Independent group'})).status,200);
  const row=await h.store.getClass(c.classroom.id);assert.equal(row.document.groups[0].story.plot,'Accepted original');assert.equal(row.document.groups[1].name,'Other Group');assert.equal(row.document.groups[1].members.length,0);
});

test('a class archive cannot be bypassed by an unchanged group revision',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c),revision=c.classroom.revision,baseGroupRevision=c.classroom.groups[0].revision;
  await h.act(c,'class.update',{archived:true});
  const r=await h.call('/classes/'+c.classroom.id+'/actions',{method:'POST',body:{revision,baseGroupRevision,action:{type:'story.update',groupId:g,payload:{plot:'Should not save'}}}});assert.equal(r.status,409);
  assert.equal((await h.store.getClass(c.classroom.id)).document.groups[0].story.plot,'');
});

test('draft grades and another student’s individual grades remain teacher-only',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c),a=await h.join(c,g),b=await h.join(c,g,'Student B');
  Object.assign(c,(await h.call('/classes/'+c.classroom.id)).data);
  assert.equal((await h.act(c,'story.update',{plot:'The group investigates a missing lantern.'},g)).status,200);
  assert.equal((await h.act(c,'submission.submit',{},g)).status,200);
  const scores=Object.fromEntries(c.classroom.rubric.map(r=>[r.id,3]));
  assert.equal((await h.act(c,'assessment.save',{memberId:a.data.actor.memberId,scores,comment:'PRIVATE DRAFT',confirmed:false},g)).status,200);
  let view=await h.call('/classes/'+c.classroom.id,{teacher:null,token:a.data.token});assert.equal(view.data.classroom.groups[0].assessments.length,0);assert.ok(!JSON.stringify(view.data).includes('PRIVATE DRAFT'));
  await h.act(c,'assessment.save',{memberId:a.data.actor.memberId,scores,comment:'Published feedback',confirmed:true},g);
  await h.act(c,'assessment.save',{memberId:b.data.actor.memberId,scores,comment:'Other individual grade',confirmed:true},g);
  await h.act(c,'assessment.save',{memberId:null,scores,comment:'Group feedback',confirmed:true},g);
  view=await h.call('/classes/'+c.classroom.id,{teacher:null,token:a.data.token});const grades=view.data.classroom.groups[0].assessments;assert.equal(grades.length,2);assert.ok(!JSON.stringify(view.data).includes('Other individual grade'));
});

test('teacher phrase reset revokes old sessions and preserves work',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c),a=await h.join(c,g),memberId=a.data.actor.memberId;
  const denied=await h.call('/classes/'+c.classroom.id+'/members/'+memberId+'/reset',{method:'POST',teacher:null,token:a.data.token,body:{passphrase:'new-secret-phrase'}});assert.equal(denied.status,401);
  const reset=await h.call('/classes/'+c.classroom.id+'/members/'+memberId+'/reset',{method:'POST',body:{passphrase:'new-secret-phrase'}});assert.equal(reset.status,200);
  assert.equal((await h.call('/classes/'+c.classroom.id,{teacher:null,token:a.data.token})).status,401);
  assert.equal((await h.join(c,g)).status,401);assert.equal((await h.join(c,g,'Student A','new-secret-phrase')).status,200);
});

test('expired sessions and removed members cannot continue editing',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c),a=await h.join(c,g);
  h.setTime(h.now()+13*60*60*1000);assert.equal((await h.call('/classes/'+c.classroom.id,{teacher:null,token:a.data.token})).status,401);
  const rejoined=await h.join(c,g);Object.assign(c,(await h.call('/classes/'+c.classroom.id)).data);
  assert.equal((await h.act(c,'member.remove',{memberId:a.data.actor.memberId},g)).status,200);
  assert.equal((await h.call('/classes/'+c.classroom.id,{teacher:null,token:rejoined.data.token})).status,401);
});

test('foreign origins, malformed bodies and repeated guesses are rejected',async()=>{
  const h=harness();let r=await h.call('/capabilities',{headers:{Origin:'https://untrusted.example'}});assert.equal(r.status,403);
  const c=await h.create(),g=await h.group(c);await h.join(c,g);
  for(let i=0;i<8;i++)r=await h.join(c,g,'Student A','wrong-secret-phrase');assert.equal(r.status,429);
  const direct=await handleClassroomApi(new Request('https://classroom.test/api/classroom/classes',{method:'POST',headers:{'oai-authenticated-user-id':'teacher-a','Content-Type':'text/plain'},body:'{"title":"bad"}'}),{CLASSROOM_TRUST_HOST_IDENTITY:'1'},{store:h.store});assert.equal(direct.status,415);
});

test('teacher rename updates the student’s login name and archive blocks writes',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c),a=await h.join(c,g);Object.assign(c,(await h.call('/classes/'+c.classroom.id)).data);
  assert.equal((await h.act(c,'member.update',{memberId:a.data.actor.memberId,name:'Student A2'},g)).status,200);
  assert.equal((await h.join(c,g,'Student A2')).status,200);
  assert.equal((await h.act(c,'class.update',{archived:true})).status,200);
  assert.equal((await h.join(c,g,'Student A2')).status,404);
  const view=await h.call('/classes/'+c.classroom.id,{teacher:null,token:a.data.token});assert.equal(view.status,200);
  assert.equal((await h.act(view.data,'story.update',{plot:'Changed'},g,{teacher:null,token:a.data.token})).status,409);
  assert.equal((await h.act(c,'class.update',{archived:false})).status,200);
});

test('reserved roster names require a teacher-set secret before first sign-in',async()=>{
  const h=harness(),c=await h.create(),g=await h.group(c);await h.act(c,'member.add',{id:'reserved',name:'Reserved Student'},g);
  const denied=await h.join(c,g,'Reserved Student');assert.equal(denied.status,409);assert.equal(denied.data.code,'SETUP_REQUIRED');
  await h.call('/classes/'+c.classroom.id+'/members/reserved/reset',{method:'POST',body:{passphrase:'initial-secret'}});
  assert.equal((await h.join(c,g,'Reserved Student','initial-secret')).status,200);
});

test('a moved student session follows current membership and loses access to the former group',async()=>{
  const h=harness(),c=await h.create(),first=await h.group(c);await h.group(c,'g-two','New Group');const a=await h.join(c,first);
  Object.assign(c,(await h.call('/classes/'+c.classroom.id)).data);
  assert.equal((await h.act(c,'member.move',{memberId:a.data.actor.memberId,targetGroupId:'g-two'},first)).status,200);
  const view=await h.call('/classes/'+c.classroom.id,{teacher:null,token:a.data.token});assert.equal(view.data.actor.groupId,'g-two');assert.deepEqual(view.data.classroom.groups.map(g=>g.id),['g-two']);
  assert.equal((await h.act(view.data,'story.update',{plot:'Wrong group'},first,{teacher:null,token:a.data.token})).status,403);
  assert.equal((await h.act(view.data,'story.update',{plot:'New group idea'},'g-two',{teacher:null,token:a.data.token})).status,200);
  assert.equal((await h.join(c,first)).status,409);assert.equal((await h.join(c,'g-two')).status,200);
});

test('actual SQL adapter stores R2 pointers, enforces CAS and rolls back identity collisions atomically',async()=>{
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0001_classrooms.sql',import.meta.url),'utf8'));
  const blobs=new Map();
  const DB={prepare(query){return {bind(...values){return {query,values,async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}};}};}}},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const BUCKET={async put(key,value){blobs.set(key,value);},async get(key){return blobs.has(key)?{async json(){return JSON.parse(blobs.get(key));}}:null;},async delete(key){blobs.delete(key);}};
  const store=createClassroomStore({DB,BUCKET});
  const start={id:'durable-class',owner_id:'owner',title:'Durable class',join_code:'ABCDEFGH',revision:0,archived:false,created_at:'2026-11-26',updated_at:'2026-11-26',document:{id:'durable-class',title:'Durable class',revision:0,archived:false,groups:[]}};
  await store.createClass(start);assert.equal(blobs.size,1);assert.equal(JSON.parse([...blobs.values()][0]).$classroomBundle,1);assert.equal((await store.getClass(start.id)).document.title,start.title);
  await store.createIdentity({class_id:start.id,member_id:'one',name_key:'one',pass_hash:'hash-one'});await store.createIdentity({class_id:start.id,member_id:'two',name_key:'two',pass_hash:'hash-two'});
  const change={...start.document,title:'Changed',revision:1};
  await assert.rejects(store.commitClass(start.id,0,change,{rename:[{member_id:'one',name_key:'two'}]}),/UNIQUE/);
  assert.equal((await store.getClass(start.id)).revision,0);assert.equal(blobs.size,1);assert.equal((await store.getIdentity(start.id,'one')).name_key,'one');
  await store.commitClass(start.id,0,change,{rename:[{member_id:'one',name_key:'renamed'}]});assert.equal((await store.getClassByCode('ABCDEFGH')).document.title,'Changed');assert.equal((await store.getIdentity(start.id,'one')).name_key,'renamed');
  await assert.rejects(store.commitClass(start.id,0,{...change,title:'Stale'}),e=>e.status===409);assert.equal(blobs.size,2);
  await store.addSession({token_hash:'opaque-hash',class_id:start.id,member_id:'one',expires_at:100});
  await store.commitClass(start.id,1,{...change,revision:2},{remove:['one']});assert.equal(await store.getSession('opaque-hash'),null);assert.equal(await store.getIdentity(start.id,'one'),null);
  assert.equal(await store.attempt('key',1000,1,10),true);assert.equal(await store.attempt('key',1000,1,11),false);assert.equal(await store.attempt('key',1000,1,1010),true);
  sql.close();
});
