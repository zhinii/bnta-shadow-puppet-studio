import {PUPPET_SYSTEM,RELAY} from '../public/agent.mjs';
const UPSTREAMS=new Set(['https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1','https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1','https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1','https://dashscope.aliyuncs.com/compatible-mode/v1','https://dashscope-intl.aliyuncs.com/compatible-mode/v1']);
const clients=new Map();let inFlight=0;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function config(env={}){const key=(env.ALIBABA_API_KEY||env.QIANWEN_API_KEY||env.DASHSCOPE_API_KEY||'').trim(),base=env.ALIBABA_BASE_URL||'https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1',model=env.ALIBABA_MODEL||'qwen3.8-flash';return key&&key.length<=512&&!/\s/.test(key)&&UPSTREAMS.has(base)&&/^[\w.\-]{1,100}$/.test(model)?{key,base,model}:null;}
export function validateBody(body){
 if(!body||body.application!=='shadow-puppet-studio'||!Array.isArray(body.messages)||body.messages.length<2||body.messages.length>8)throw Error('request');
 for(const m of body.messages)if(!m||!['system','assistant','user'].includes(m.role)||typeof m.content!=='string'||m.content.length>35000)throw Error('messages');
 const last=body.messages.at(-1);if(last.role!=='user')throw Error('last_message');
 const task=JSON.parse(last.content);if(!['design','story','extract','discuss'].includes(task.task)||!['en','zh'].includes(task.language)||typeof task.question!=='string'||!task.question.trim()||task.question.length>1600||task.scene?.application!=='shadow-puppet-studio')throw Error('task');
 return {task,messages:[{role:'system',content:PUPPET_SYSTEM},...body.messages.filter(m=>m.role!=='system').slice(-5)]};
}
async function readBounded(request,max=110000){if(Number(request.headers.get('content-length'))>max)throw Error('size');const reader=request.body?.getReader();if(!reader)throw Error('body');const chunks=[];let n=0;while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>max){await reader.cancel();throw Error('size');}chunks.push(value);}const data=new Uint8Array(n);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(data));}
export async function handleApi(request,env={},fetcher=fetch){
 const url=new URL(request.url),configuration=config(env);
 if(url.pathname==='/api/status')return json({service:'Shadow Puppet Studio',configured:!!configuration,relay:true,provider:configuration?'qwen':'protected-kimi',storesPrompts:false});
 if(url.pathname!=='/api/puppet')return json({error:'not_found'},404);
 if(request.method!=='POST')return json({error:'method'},405);
 const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'origin'},403);
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'content_type'},400);
 let admitted=false;
 try{
  const body=await readBounded(request);const {messages}=validateBody(body);
  const minute=Math.floor(Date.now()/60000);for(const [key,item]of clients)if(item.minute!==minute)clients.delete(key);
  const who=request.headers.get('oai-authenticated-user-id')||request.headers.get('cf-connecting-ip')||'local',entry=clients.get(who)||{minute,count:0};
  if(inFlight>=3||entry.count>=10)return json({error:'rate_limit'},429);
  entry.count++;clients.set(who,entry);inFlight++;admitted=true;
  // Proxy to the existing protected Kimi service without obtaining or moving its secret.
  // A dedicated /api/puppet route on that host can be configured by its maintainer later.
  const target=configuration?configuration.base+'/chat/completions':RELAY;
  const payload=configuration?{model:configuration.model,messages,max_tokens:3500,response_format:{type:'json_object'},temperature:.6,stream:false,enable_thinking:false}:{...body,messages};
  const response=await fetcher(target,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',...(configuration?{Authorization:'Bearer '+configuration.key}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
  if(!response.ok){await response.body?.cancel();return json({error:'provider',status:response.status},[400,401,403,404,429].includes(response.status)?response.status:502);}
  const data=await readBounded(response,120000),choice=data?.choices?.[0];
  if(typeof choice?.message?.content!=='string'||choice.message.content.length>30000)return json({error:'response'},502);
  return json({choices:[{message:{content:choice.message.content},finish_reason:choice.finish_reason}]});
 }catch(error){if(['size','body','request','messages','last_message','task'].includes(error.message))return json({error:error.message},error.message==='size'?413:400);if(error instanceof SyntaxError)return json({error:'invalid_json'},400);return json({error:'connection',kind:error.name==='TimeoutError'?'timeout':'transport'},502);}
 finally{if(admitted)inFlight--;}
}
