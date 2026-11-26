// Production documents are durable R2 objects; D1 holds identities and CAS pointers.
// The in-memory implementation is explicitly injected by tests, never a fallback.
import {packClassroomBundle,unpackClassroomBundle} from '../public/classroom-bundle.mjs';
const clone = value => structuredClone(value);
const conflict = () => Object.assign(new Error('This project changed on another device. Load the latest version before saving.'), {status:409,code:'REVISION_CONFLICT'});
const unavailable = () => Object.assign(new Error('Shared classrooms are not configured on this server. You can still download and open project files.'),{status:503,code:'CLASSROOM_UNAVAILABLE'});

export function createClassroomStore(env={}) {
  if(!env.DB?.prepare || !env.BUCKET?.put || !env.BUCKET?.get)throw unavailable();
  const db=env.DB,bucket=env.BUCKET;
  const first=(sql,...values)=>db.prepare(sql).bind(...values).first();
  const run=(sql,...values)=>db.prepare(sql).bind(...values).run();
  const read=async row=>{
    if(!row)return null;
    const object=await bucket.get(row.object_key);
    if(!object)throw Object.assign(new Error('The saved project is temporarily unavailable. Please try again.'),{status:503,code:'DOCUMENT_UNAVAILABLE'});
    return {...row,document:unpackClassroomBundle(await object.json())};
  };
  return {
    durable:true,
    async createClass(record){
      const key=`classrooms/${record.id}/${record.revision}-${crypto.randomUUID()}.json`;
      await bucket.put(key,JSON.stringify(packClassroomBundle(record.document)),{httpMetadata:{contentType:'application/json'}});
      try{await run('INSERT INTO classroom_classes (id,owner_id,title,join_code,object_key,revision,archived,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',record.id,record.owner_id,record.title,record.join_code,key,record.revision,record.archived?1:0,record.created_at,record.updated_at);}
      catch(error){await bucket.delete(key).catch(()=>{});throw error;}
      return {...record,object_key:key};
    },
    async getClass(id){return read(await first('SELECT * FROM classroom_classes WHERE id=?',id));},
    async getClassByCode(code){return read(await first('SELECT * FROM classroom_classes WHERE join_code=?',code));},
    async listClasses(owner){const result=await db.prepare('SELECT id,title,join_code,revision,archived,created_at,updated_at FROM classroom_classes WHERE owner_id=? ORDER BY updated_at DESC').bind(owner).all();return result.results||[];},
    async commitClass(id,revision,document,effects={}){
      const key=`classrooms/${id}/${document.revision}-${crypto.randomUUID()}.json`;
      await bucket.put(key,JSON.stringify(packClassroomBundle(document)),{httpMetadata:{contentType:'application/json'}});
      const updated=new Date().toISOString();
      try{
        const statements=[db.prepare('UPDATE classroom_classes SET object_key=?,title=?,revision=?,archived=?,updated_at=? WHERE id=? AND revision=?').bind(key,document.title,document.revision,document.archived?1:0,updated,id,revision)];
        for(const change of effects.rename||[])statements.push(db.prepare('UPDATE classroom_identities SET name_key=? WHERE class_id=? AND member_id=? AND EXISTS (SELECT 1 FROM classroom_classes WHERE id=? AND object_key=?)').bind(change.name_key,id,change.member_id,id,key));
        for(const memberId of effects.remove||[])for(const table of ['classroom_sessions','classroom_identities'])statements.push(db.prepare(`DELETE FROM ${table} WHERE class_id=? AND member_id=? AND EXISTS (SELECT 1 FROM classroom_classes WHERE id=? AND object_key=?)`).bind(id,memberId,id,key));
        const [result]=await db.batch(statements);
        if(result.meta?.changes!==1)throw conflict();
      }catch(error){await bucket.delete(key).catch(()=>{});throw error;}
      // Old immutable objects are retained as recovery snapshots. Never delete a
      // document another request may still be reading or a submission may cite.
      return {document,updated_at:updated};
    },
    async findIdentity(classId,nameKey){return first('SELECT * FROM classroom_identities WHERE class_id=? AND name_key=?',classId,nameKey);},
    async getIdentity(classId,memberId){return first('SELECT * FROM classroom_identities WHERE class_id=? AND member_id=?',classId,memberId);},
    async createIdentity(identity){await run('INSERT INTO classroom_identities (class_id,member_id,name_key,pass_hash) VALUES (?,?,?,?)',identity.class_id,identity.member_id,identity.name_key,identity.pass_hash);},
    async updateIdentity(classId,memberId,updates){
      const old=await this.getIdentity(classId,memberId);if(!old)return;
      await run('UPDATE classroom_identities SET name_key=?,pass_hash=? WHERE class_id=? AND member_id=?',updates.name_key??old.name_key,updates.pass_hash??old.pass_hash,classId,memberId);
    },
    async removeIdentity(classId,memberId){await db.batch([db.prepare('DELETE FROM classroom_sessions WHERE class_id=? AND member_id=?').bind(classId,memberId),db.prepare('DELETE FROM classroom_identities WHERE class_id=? AND member_id=?').bind(classId,memberId)]);},
    async addSession(session){await run('INSERT INTO classroom_sessions (token_hash,class_id,member_id,expires_at) VALUES (?,?,?,?)',session.token_hash,session.class_id,session.member_id,session.expires_at);},
    async getSession(hash){return first('SELECT * FROM classroom_sessions WHERE token_hash=?',hash);},
    async removeSession(hash){await run('DELETE FROM classroom_sessions WHERE token_hash=?',hash);},
    async revokeSessions(classId,memberId){await run('DELETE FROM classroom_sessions WHERE class_id=? AND member_id=?',classId,memberId);},
    async attempt(key,windowMs,limit,now){
      const bucketKey=`${key}:${Math.floor(now/windowMs)}`;
      await run('INSERT INTO classroom_rate_limits (bucket_key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket_key) DO UPDATE SET attempts=attempts+1',bucketKey,now+windowMs);
      const row=await first('SELECT attempts FROM classroom_rate_limits WHERE bucket_key=?',bucketKey);
      if(Math.random()<.01)await run('DELETE FROM classroom_rate_limits WHERE expires_at<?',now);
      return row.attempts<=limit;
    }
  };
}

export function createMemoryClassroomStore() {
  const classes=new Map(),identities=new Map(),sessions=new Map(),attempts=new Map();
  const identityKey=(c,m)=>`${c}:${m}`;
  return {
    durable:false,
    async createClass(record){if(classes.has(record.id)||[...classes.values()].some(c=>c.join_code===record.join_code))throw Error('UNIQUE constraint failed');classes.set(record.id,clone(record));return clone(record);},
    async getClass(id){return clone(classes.get(id)||null);},
    async getClassByCode(code){return clone([...classes.values()].find(c=>c.join_code===code)||null);},
    async listClasses(owner){return [...classes.values()].filter(c=>c.owner_id===owner).map(({document,owner_id,...meta})=>clone(meta));},
    async commitClass(id,revision,document,effects={}){const row=classes.get(id);if(!row||row.revision!==revision)throw conflict();for(const change of effects.rename||[]){const clash=[...identities.values()].find(i=>i.class_id===id&&i.name_key===change.name_key&&i.member_id!==change.member_id);if(clash)throw Error('UNIQUE constraint failed');}const updated_at=new Date().toISOString();classes.set(id,{...row,title:document.title,revision:document.revision,archived:document.archived,updated_at,document:clone(document)});for(const change of effects.rename||[]){const k=identityKey(id,change.member_id),old=identities.get(k);if(old)identities.set(k,{...old,name_key:change.name_key});}for(const memberId of effects.remove||[]){identities.delete(identityKey(id,memberId));for(const [key,s] of sessions)if(s.class_id===id&&s.member_id===memberId)sessions.delete(key);}return {document:clone(document),updated_at};},
    async findIdentity(classId,nameKey){return clone([...identities.values()].find(i=>i.class_id===classId&&i.name_key===nameKey)||null);},
    async getIdentity(classId,memberId){return clone(identities.get(identityKey(classId,memberId))||null);},
    async createIdentity(identity){if(await this.findIdentity(identity.class_id,identity.name_key)||await this.getIdentity(identity.class_id,identity.member_id))throw Error('UNIQUE constraint failed');identities.set(identityKey(identity.class_id,identity.member_id),clone(identity));},
    async updateIdentity(classId,memberId,updates){const key=identityKey(classId,memberId),old=identities.get(key);if(!old)return;const clash=await this.findIdentity(classId,updates.name_key??old.name_key);if(clash&&clash.member_id!==memberId)throw Error('UNIQUE constraint failed');identities.set(key,{...old,...clone(updates)});},
    async removeIdentity(classId,memberId){identities.delete(identityKey(classId,memberId));await this.revokeSessions(classId,memberId);},
    async addSession(session){sessions.set(session.token_hash,clone(session));},
    async getSession(hash){return clone(sessions.get(hash)||null);},
    async removeSession(hash){sessions.delete(hash);},
    async revokeSessions(classId,memberId){for(const [key,s] of sessions)if(s.class_id===classId&&s.member_id===memberId)sessions.delete(key);},
    async attempt(key,windowMs,limit,now){const k=`${key}:${Math.floor(now/windowMs)}`,count=(attempts.get(k)||0)+1;attempts.set(k,count);return count<=limit;}
  };
}
