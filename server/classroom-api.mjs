import {createClassroom,normalizeClassroom,applyClassroomAction} from '../public/classroom-model.mjs';
import {createClassroomStore} from './classroom-store.mjs';
import {packClassroomBundle,unpackClassroomBundle,classroomPackedBytes} from '../public/classroom-bundle.mjs';

const PREFIX='/api/classroom';
const GROUP_WORK_ACTIONS=new Set(['story.update','story.handoff','story.restore','character.add','character.assign','character.update','character.restore','character.remove','scene.add','scene.update','scene.restore','scene.remove','stage.update','reflection.save','submission.submit','submission.reopen']);
const SESSION_MS=12*60*60*1000,MAX_BODY=48*1024*1024,MAX_DOCUMENT=64*1024*1024;
const idPattern=/^[A-Za-z0-9_-]{1,96}$/;
const encoder=new TextEncoder();
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const fail=(message,status=400,code='INVALID_REQUEST')=>{throw Object.assign(new Error(message),{status,code});};
const text=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
const nameKey=value=>text(value,80).normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g,' ');
const safeId=value=>typeof value==='string'&&idPattern.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const randomToken=(size=32)=>b64(crypto.getRandomValues(new Uint8Array(size)));
const hash=async value=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
const same=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;};

async function passwordHash(passphrase,salt=randomToken(16)) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:decode(salt),iterations:100000},key,256);
  return `pbkdf2:100000:${salt}:${b64(new Uint8Array(bits))}`;
}
async function passwordMatches(passphrase,stored){if(typeof stored!=='string'||!/^pbkdf2:100000:/.test(stored))return false;return same(await passwordHash(passphrase,stored.split(':')[2]),stored);}
function validatePassphrase(value){if(typeof value!=='string'||value.length<8||value.length>128||!value.trim())fail('Use a secret phrase of 8–128 characters.');return value;}
function allowedOrigin(request,env) {
  const origin=request.headers.get('origin');
  if(!origin)return null;
  const own=new URL(request.url).origin;
  const allowed=new Set([own,...String(env.CLASSROOM_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)]);
  if(!allowed.has(origin))fail('This website cannot access the classroom service.',403,'ORIGIN_FORBIDDEN');
  return origin;
}
async function readBody(request) {
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))fail('Send a JSON request.',415);
  if(Number(request.headers.get('content-length'))>MAX_BODY)fail('This project is too large to send. Download a backup and use smaller images.',413);
  const reader=request.body?.getReader();if(!reader)fail('The request is empty.');
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BODY){await reader.cancel();fail('This project is too large to send. Download a backup and use smaller images.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  try{const body=unpackClassroomBundle(JSON.parse(new TextDecoder().decode(bytes)));if(!body||Array.isArray(body)||typeof body!=='object')fail('Use a JSON object.');return body;}catch(e){if(e.status||e.code==='INVALID_CLASSROOM_BUNDLE')throw e;fail('The request is not valid JSON.');}
}
function findMember(document,memberId){for(const group of document.groups||[]){const member=group.members.find(m=>m.id===memberId);if(member)return {group,member};}return null;}
function allMembers(document){return (document.groups||[]).flatMap(g=>g.members);}
function displayName(request){try{return decodeURIComponent(request.headers.get('oai-authenticated-user-full-name')||'Teacher').slice(0,80);}catch{return 'Teacher';}}
async function actorFor(request,env,store,now) {
  const authorization=request.headers.get('authorization')||'';
  if(authorization){
    const token=authorization.match(/^Bearer ([A-Za-z0-9_-]{10,512})$/)?.[1];
    if(!token)fail('Please sign in again.',401,'SIGN_IN_REQUIRED');
    if(env.CLASSROOM_TEACHER_TOKEN&&same(await hash(token),await hash(env.CLASSROOM_TEACHER_TOKEN)))return {role:'teacher',id:'local-teacher',name:'Teacher'};
    const session=await store.getSession(await hash(token));
    if(!session||session.expires_at<=now)fail('Your classroom session ended. Sign in again to continue.',401,'SESSION_EXPIRED');
    return {role:'student',memberId:session.member_id,classId:session.class_id,sessionHash:session.token_hash};
  }
  // These headers are supplied by the Sites host. A standalone Node server
  // enables this contract explicitly; merely choosing "teacher" in a form never grants access.
  const hosted=!!env.DB?.prepare&&!!env.BUCKET?.put;
  const hostId=request.headers.get('oai-authenticated-user-id');
  if(hostId&&(hosted||env.CLASSROOM_TRUST_HOST_IDENTITY==='1'))return {role:'teacher',id:text(hostId,200),name:displayName(request)};
  return null;
}
function teacher(actor){if(actor?.role!=='teacher')fail('Sign in as the teacher to manage classes.',401,'TEACHER_SIGN_IN_REQUIRED');}
function accessible(record,actor){
  if(!record||!actor)fail('Class not found or you do not have access.',404,'CLASS_NOT_FOUND');
  if(actor.role==='teacher'){if(record.owner_id!==actor.id)fail('Class not found or you do not have access.',404,'CLASS_NOT_FOUND');return {...actor};}
  if(actor.classId!==record.id)fail('Class not found or you do not have access.',404,'CLASS_NOT_FOUND');
  const found=findMember(record.document,actor.memberId);if(!found)fail('Your class membership changed. Ask your teacher to help you sign in.',403,'MEMBERSHIP_CHANGED');
  return {...actor,groupId:found.group.id,name:found.member.name};
}
function projectFor(record,actor) {
  const document=structuredClone(record.document);
  if(actor.role==='student'){
    document.groups=document.groups.filter(g=>g.id===actor.groupId);
    for(const group of document.groups){
      group.assessments=(group.assessments||[]).filter(a=>a.confirmed&&(a.memberId==null||a.memberId===actor.memberId));
      // Historical/assessment events can contain a teacher's draft feedback.
      group.events=(group.events||[]).filter(e=>!String(e.type||e.action||'').startsWith('assessment'));
      if(group.submission?.snapshot?.assessments)group.submission.snapshot.assessments=[];
    }
    document.events=(document.events||[]).filter(e=>e.groupId===actor.groupId&&!String(e.type||e.action||'').startsWith('assessment'));
  }
  return document;
}
function envelope(record,actor){return {classroom:packClassroomBundle(projectFor(record,actor)),actor:{role:actor.role,name:actor.name,...(actor.groupId?{groupId:actor.groupId,memberId:actor.memberId}:{})},...(actor.role==='teacher'?{joinCode:record.join_code}:{}),syncedAt:record.updated_at};}
function enforceNames(document){const seen=new Set();for(const m of allMembers(document)){const key=nameKey(m.name);if(!key||seen.has(key))fail('Each student needs a different sign-in name within this class. Add an initial if needed.',409,'NAME_IN_USE');seen.add(key);}}
async function limited(store,request,label,now,limit=20){const address=request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'local';const key=await hash(`${address}:${label}`);if(!await store.attempt(key,15*60*1000,limit,now))fail('Too many attempts. Wait a few minutes and try again.',429,'RATE_LIMITED');}
function parseCode(value){const code=text(value,40).replace(/[\s-]/g,'').toUpperCase();if(!/^[A-Z2-9]{8}$/.test(code))fail('Enter the eight-character class code.');return code;}
const newCode=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...crypto.getRandomValues(new Uint8Array(8))].map(n=>alphabet[n%alphabet.length]).join('');};

export async function handleClassroomApi(request,env={},dependencies={}) {
  let origin;
  try{
    origin=allowedOrigin(request,env);
    const response=await routeClassroom(request,env,dependencies);
    if(origin){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin');}
    return response;
  }catch(error){
    const modelErrors=new Set(['INVALID_CLASSROOM','INVALID_CLASSROOM_BUNDLE','INVALID_PROJECT','INVALID_GEOMETRY','FILE_TOO_LARGE','NOT_FOUND','FORBIDDEN','INVALID_ACTION','ARCHIVED']);
    const status=error.status||(error.code==='FORBIDDEN'?403:error.code==='NOT_FOUND'?404:error.code==='ARCHIVED'?409:modelErrors.has(error.code)?400:500);
    const known=status>=400&&status<500||['CLASSROOM_UNAVAILABLE','DOCUMENT_UNAVAILABLE'].includes(error.code);
    return json({error:known?error.message:'The classroom service could not save this request. Your local work is still available.',code:error.code||'CLASSROOM_ERROR'},status>=400&&status<=599?status:500,origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{});
  }
}

async function routeClassroom(request,env,dependencies) {
  const path=new URL(request.url).pathname.slice(PREFIX.length).replace(/\/$/,'')||'/';
  const now=dependencies.now?.()??Date.now();
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'600','Cache-Control':'no-store'}});
  if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed.'},405,{Allow:'GET, POST, OPTIONS'});
  const configured=!!dependencies.store||(!!env.DB?.prepare&&!!env.BUCKET?.put&&!!env.BUCKET?.get);
  if(path==='/capabilities'&&request.method==='GET'){
    let actor=null;if(configured)actor=await actorFor(request,env,dependencies.store||createClassroomStore(env),now);
    const hostSignIn=!!env.DB?.prepare&&!!env.BUCKET?.put;
    return json({available:configured,durable:configured&&!dependencies.store,teacherSignedIn:actor?.role==='teacher',sessionHours:12,...(hostSignIn?{signInPath:'/signin-with-chatgpt?returnTo=%2F'}:{}),...(configured?{}:{reason:'Shared classrooms need the hosted classroom service. Download and open files to keep work on this version.'})});
  }
  const store=dependencies.store||createClassroomStore(env);
  const actor=await actorFor(request,env,store,now);
  if(path==='/logout'&&request.method==='POST'){if(actor?.sessionHash)await store.removeSession(actor.sessionHash);return json({signedOut:true});}
  if(path==='/classes'&&request.method==='GET'){teacher(actor);return json({classes:await store.listClasses(actor.id)});}
  if(path==='/classes'&&request.method==='POST'){
    teacher(actor);await limited(store,request,`create:${actor.id}`,now,30);
    const body=await readBody(request);
    if(!text(body.title,160))fail('Give your class a name.');
    const document=createClassroom({title:text(body.title,160),language:body.language==='zh'?'zh':'en'});
    const timestamp=new Date(now).toISOString();
    let record;
    for(let tries=0;tries<5;tries++){
      const candidate={id:document.id,owner_id:actor.id,title:document.title,join_code:newCode(),revision:document.revision,archived:false,created_at:timestamp,updated_at:timestamp,document};
      try{record=await store.createClass(candidate);break;}catch(error){if(!/UNIQUE/i.test(error.message))throw error;}
    }
    if(!record)fail('A class code could not be created. Try again.',503,'CLASS_CREATE_FAILED');
    return json(envelope(record,actor),201);
  }
  if(path==='/lookup'&&request.method==='POST'){
    // A whole class can share one school gateway. Keep a generous gateway
    // allowance while retaining the stricter per-name sign-in limit below.
    await limited(store,request,'lookup',now,240);
    const body=await readBody(request),record=await store.getClassByCode(parseCode(body.code));
    if(!record||record.archived)fail('That class code is unavailable. Check it with your teacher.',404,'CLASS_NOT_FOUND');
    return json({classroom:{id:record.id,title:record.title,language:record.document.language},groups:record.document.groups.map(g=>({id:g.id,name:g.name,memberCount:g.members.length}))});
  }
  if(path==='/join'&&request.method==='POST'){
    const body=await readBody(request),code=parseCode(body.code),name=text(body.name,80),key=nameKey(name),passphrase=validatePassphrase(body.passphrase);
    if(!key)fail('Enter your name.');
    await limited(store,request,`join:${code}`,now,120);
    await limited(store,request,`join-name:${code}:${key}`,now,8);
    let record=await store.getClassByCode(code);
    if(!record||record.archived)fail('That class code is unavailable. Check it with your teacher.',404,'CLASS_NOT_FOUND');
    const group=record.document.groups.find(g=>g.id===body.groupId);
    if(!group)fail('Choose one of this class’s groups.');
    let identity=await store.findIdentity(record.id,key);
    if(identity){
      if(!await passwordMatches(passphrase,identity.pass_hash))fail('That name is already registered. Use your secret phrase, or ask your teacher to reset it.',401,'SIGN_IN_FAILED');
      const existing=findMember(record.document,identity.member_id);
      if(!existing)fail('Your membership changed. Ask your teacher for help.',403,'MEMBERSHIP_CHANGED');
      if(existing.group.id!==group.id)fail('You already belong to another group. Ask your teacher to move you.',409,'GROUP_CHANGED');
    }else{
      const registered=allMembers(record.document).find(m=>nameKey(m.name)===key);
      const location=registered?findMember(record.document,registered.id):null;
      if(location&&location.group.id!==group.id)fail('That name belongs to another group. Ask your teacher for help.',409,'NAME_IN_USE');
      if(registered)fail('Your teacher has reserved this name. Ask them to set your secret phrase before you sign in.',409,'SETUP_REQUIRED');
      identity={class_id:record.id,member_id:registered?.id||crypto.randomUUID(),name_key:key,pass_hash:await passwordHash(passphrase)};
      try{await store.createIdentity(identity);}catch(error){if(/UNIQUE/i.test(error.message))fail('That name was just registered. Sign in again with your secret phrase.',409,'NAME_IN_USE');throw error;}
      if(!registered){
        let committed=false;
        try{
          for(let tries=0;tries<4;tries++){
            record=await store.getClass(record.id);
            if(record.archived)fail('This class has been archived.',409,'CLASS_ARCHIVED');
            const document=applyClassroomAction(record.document,{type:'member.add',groupId:group.id,payload:{id:identity.member_id,name}},{role:'teacher',name:'Class enrollment'});
            enforceNames(document);
            try{const result=await store.commitClass(record.id,record.revision,document);record={...record,...result,revision:document.revision};committed=true;break;}catch(error){if(error.status!==409)throw error;}
          }
          if(!committed)fail('The class is busy. Try joining again.',409,'REVISION_CONFLICT');
        }catch(error){await store.removeIdentity(identity.class_id,identity.member_id);throw error;}
      }
    }
    const token=randomToken(),expiresAt=now+SESSION_MS;
    await store.addSession({token_hash:await hash(token),class_id:record.id,member_id:identity.member_id,expires_at:expiresAt});
    const student=accessible(record,{role:'student',classId:record.id,memberId:identity.member_id});
    return json({...envelope(record,student),token,expiresAt:new Date(expiresAt).toISOString()});
  }
  const match=path.match(/^\/classes\/([A-Za-z0-9_-]{1,96})(?:\/(actions|members\/([A-Za-z0-9_-]{1,96})\/reset))?$/);
  if(!match)return json({error:'Classroom route not found.'},404);
  const record=await store.getClass(match[1]),authorized=accessible(record,actor);
  if(!match[2]&&request.method==='GET')return json(envelope(record,authorized));
  if(match[2]==='actions'&&request.method==='POST'){
    const body=await readBody(request);
    if(!body.action||typeof body.action.type!=='string')fail('Choose a classroom action.');
    const scoped=GROUP_WORK_ACTIONS.has(body.action.type)&&safeId(body.action.groupId)&&Number.isInteger(body.baseGroupRevision)&&body.baseGroupRevision>=0;
    let current=record;
    for(let attempt=0;attempt<2;attempt++){
      const currentActor=accessible(current,actor),group=current.document.groups.find(g=>g.id===body.action.groupId);
      if(currentActor.role==='student'&&body.action.groupId!==currentActor.groupId)fail('You can edit only your own group.',403,'FORBIDDEN');
      const sameGroup=scoped&&group&&(group.revision||0)===body.baseGroupRevision;
      // A different group may have advanced the class pointer. Rebase only a
      // scoped work action whose own group is unchanged. Administrative edits
      // and older work from the same group must always be reviewed by the user.
      if(!Number.isInteger(body.revision)||body.revision<0||body.revision>current.revision||(body.revision!==current.revision&&!sameGroup)||(scoped&&!sameGroup))fail('Someone saved a newer version of this work. Load the latest project, then apply your change again.',409,'REVISION_CONFLICT');
      const document=normalizeClassroom(applyClassroomAction(current.document,body.action,currentActor));
      enforceNames(document);
      if(classroomPackedBytes(document)>MAX_DOCUMENT)fail('This class project is too large to save. Download a backup and reduce image sizes.',413,'PROJECT_TOO_LARGE');
      const before=allMembers(current.document),after=allMembers(document);
      const effects={remove:before.filter(m=>!after.some(n=>n.id===m.id)).map(m=>m.id),rename:after.filter(m=>before.some(n=>n.id===m.id&&nameKey(n.name)!==nameKey(m.name))).map(m=>({member_id:m.id,name_key:nameKey(m.name)}))};
      try{
        const saved=await store.commitClass(current.id,current.revision,document,effects);
        const updated={...current,...saved,revision:document.revision,archived:document.archived};
        return json(envelope(updated,accessible(updated,actor)));
      }catch(error){
        if(error.status!==409||!scoped||attempt!==0)throw error;
        current=await store.getClass(current.id);
        // The next iteration rechecks membership, archival state, and the
        // original group revision before the single permitted CAS retry.
      }
    }
  }
  if(match[3]&&request.method==='POST'){
    teacher(authorized);
    const body=await readBody(request),memberId=match[3],member=findMember(record.document,memberId);
    if(!member||!safeId(memberId))fail('Student not found.',404);
    const passphrase=validatePassphrase(body.passphrase),pass_hash=await passwordHash(passphrase);
    const identity=await store.getIdentity(record.id,memberId);
    if(identity)await store.updateIdentity(record.id,memberId,{pass_hash});
    else await store.createIdentity({class_id:record.id,member_id:memberId,name_key:nameKey(member.member.name),pass_hash});
    await store.revokeSessions(record.id,memberId);
    return json({reset:true,memberId});
  }
  return json({error:'Method not allowed.'},405,{Allow:match[2]?'POST':'GET'});
}
