// Shared classrooms use server authorization and revision checks. Sessions stay in memory.
import {packClassroomBundle} from './classroom-bundle.mjs?v=0.8.0';
export function createClassroomClient({base='/api/classroom',fetcher=globalThis.fetch}={}) {
  let token='';
  async function request(path,{method='GET',body,signal}={}) {
    const response=await fetcher(base+path,{method,credentials:'same-origin',signal,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body.action?packClassroomBundle(body):body)}:{})});
    let data;try{data=await response.json();}catch{throw Object.assign(Error('Shared classrooms are not available at this address. You can still work with a downloaded project.'),{status:response.status});}
    if(!response.ok)throw Object.assign(Error(typeof data.error==='string'?data.error:data.error?.message||data.message||'The request could not be completed.'),{status:response.status,details:data});
    return data;
  }
  return {request,setToken(value){token=String(value||'');},clearSession(){token='';},capabilities:()=>request('/capabilities'),list:()=>request('/classes'),create:values=>request('/classes',{method:'POST',body:values}),lookup:code=>request('/lookup',{method:'POST',body:{code}}),join:async values=>{const r=await request('/join',{method:'POST',body:values});token=r.token;return r;},get:id=>request('/classes/'+encodeURIComponent(id)),action:(id,revision,action,{groupRevision}={})=>request('/classes/'+encodeURIComponent(id)+'/actions',{method:'POST',body:{revision,action,...(Number.isInteger(groupRevision)?{baseGroupRevision:groupRevision}:{})}}),resetMember:(id,memberId,passphrase)=>request('/classes/'+encodeURIComponent(id)+'/members/'+encodeURIComponent(memberId)+'/reset',{method:'POST',body:{passphrase}})};
}
