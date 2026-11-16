import {STUDIO_SYSTEM,makeStudioRequest,parseStudioResponse} from '../public/studio-ai.mjs';

const STUDIO_APPLICATION='shadow-puppet-studio';
const STUDIO_ALLOWED_ORIGINS=new Set(['https://zhinii.github.io','http://127.0.0.1:4237','http://localhost:4237']);
const STUDIO_ENDPOINT_HOSTS=new Set(['token-plan.maas.qianwenaiapi.com','token-plan.cn-beijing.maas.aliyuncs.com','token-plan.ap-southeast-1.maas.aliyuncs.com','dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com']);
const STUDIO_IMAGE_PATH='/api/v1/services/aigc/multimodal-generation/generation';
const studioClients=new Map();let studioInFlight=0;
const studioJson=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const studioModelName=v=>typeof v==='string'&&/^[\w.-]{1,100}$/.test(v);
function allowedProviderUrl(value,path) {
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.pathname===path&&(STUDIO_ENDPOINT_HOSTS.has(u.hostname)||/^[a-z0-9-]+\.(?:cn-beijing|ap-southeast-1|us-east-1|cn-hongkong|eu-central-1|ap-northeast-1)\.maas\.aliyuncs\.com$/.test(u.hostname));}catch{return false;}
}
export function studioConfig(env={}) {
  const key=(env.ALIBABA_API_KEY||env.QIANWEN_API_KEY||env.DASHSCOPE_API_KEY||'').trim();
  const base=(env.ALIBABA_BASE_URL||'https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1').replace(/\/$/,'');
  const model=env.ALIBABA_STUDIO_MODEL||env.ALIBABA_MODEL||'qwen3.8-flash';
  const visionModel=env.ALIBABA_VISION_MODEL||model;
  const imageModel=env.ALIBABA_IMAGE_MODEL||'qwen-image-3.0-pro';
  // The Token Plan chat alias does not establish which regional image endpoint
  // belongs to the account. Image service is enabled only by explicit config.
  const imageEndpoint=env.ALIBABA_IMAGE_ENDPOINT||'';
  if(!key||key.length>512||/\s/.test(key)||!allowedProviderUrl(base,'/compatible-mode/v1')||!studioModelName(model)||!studioModelName(visionModel))return null;
  return {key,base,model,visionModel,imageModel,imageEndpoint:allowedProviderUrl(imageEndpoint,STUDIO_IMAGE_PATH)&&studioModelName(imageModel)?imageEndpoint:null};
}
export async function studioReadBounded(response,max) {
  if(Number(response.headers.get('content-length'))>max)throw Object.assign(Error('Request is too large.'),{status:413});
  const reader=response.body?.getReader();if(!reader)throw Object.assign(Error('Empty request.'),{status:400});
  const chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw Object.assign(Error('Request is too large.'),{status:413});}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
function studioParseJson(bytes){try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(Error('Invalid JSON request.'),{status:400});}}
function validStudioImage(data) {
  if(typeof data!=='string'||data.length>12_000_000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(data))return false;
  try{const raw=atob(data.split(',')[1].slice(0,48));if(data.startsWith('data:image/png'))return raw.startsWith('\x89PNG\r\n\x1a\n');if(data.startsWith('data:image/jpeg'))return raw.charCodeAt(0)===255&&raw.charCodeAt(1)===216;return raw.startsWith('RIFF')&&raw.slice(8,12)==='WEBP';}catch{return false;}
}
export function validateStudioRequest(body) {
  if(!body||body.application!==STUDIO_APPLICATION||body.version!==2||!body.project||typeof body.project!=='object'||Array.isArray(body.project))throw Object.assign(Error('Invalid studio request.'),{status:400});
  const p=body.project;
  if(!Array.isArray(p.parts)||p.parts.length>100||!Array.isArray(p.joints)||p.joints.length>100||!Array.isArray(p.assets)||p.assets.length>30||JSON.stringify(p).length>250000)throw Object.assign(Error('The design context is too large or invalid.'),{status:400});
  for(const part of p.parts)if(!part||typeof part.id!=='string'||!Array.isArray(part.polygon)||part.polygon.length>500||part.polygon.some(pt=>!Array.isArray(pt)||pt.length!==2||pt.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>20000)))throw Object.assign(Error('Invalid part geometry.'),{status:400});
  if(body.imageDataUrl&&!validStudioImage(body.imageDataUrl))throw Object.assign(Error('Use a valid PNG, JPEG or WebP image under 8 MB.'),{status:400});
  if(body.repair&&JSON.stringify(body.repair).length>60000)throw Object.assign(Error('The correction context is too large.'),{status:400});
  const project={...p,language:body.language};
  let result;try{result=makeStudioRequest(project,body);}catch(e){throw Object.assign(Error(e.message),{status:400});}
  // studioContext expects image metadata and regenerates canvas consistently.
  if(p.canvas&&Number.isFinite(p.canvas.width)&&Number.isFinite(p.canvas.height)&&p.canvas.width>0&&p.canvas.height>0)result.project.canvas={width:Math.min(8000,p.canvas.width),height:Math.min(8000,p.canvas.height),...(typeof p.canvas.assetId==='string'?{assetId:p.canvas.assetId}:{})};
  if(['analyze','segment','edit-image'].includes(result.task)&&!result.imageDataUrl)throw Object.assign(Error('This task needs an image reference.'),{status:400});
  if(result.task==='edit-image'&&p.parts.some(part=>part.locked))throw Object.assign(Error('Pixel editing cannot guarantee exact preservation of locked pieces. Keep the locked artwork and edit an unlocked copy.'),{status:400});
  return result;
}
export function studioChatPayload(input,configuration) {
  const question={task:input.task,request:input.prompt,language:input.language,studio:input.project,selectedPartId:input.selectedPartId||null,selectionRule:input.selectedPartId?'Propose changes only to the selected part, preserving its source asset and all other pieces.':null,...(input.repair?{repair:input.repair,repairRule:'Correct the reported invalid geometry. Return the complete corrected proposal, retaining the original student intent.'}:{})};
  const text=JSON.stringify(question);
  const content=input.imageDataUrl?[{type:'image_url',image_url:{url:input.imageDataUrl}},{type:'text',text}]:text;
  return {model:input.imageDataUrl?configuration.visionModel:configuration.model,messages:[{role:'system',content:STUDIO_SYSTEM},...input.history,{role:'user',content}],response_format:{type:'json_object'},temperature:.35,max_tokens:6000,stream:false,enable_thinking:false};
}
export function studioImagePayload(input,configuration) {
  const prompt=`Create a shadow-puppet character design from the student's exact request below. Preserve requested identity, anatomy, number of appendages, clothing silhouette, palette and pose. A single complete character is fully inside the frame with generous margins; no UI, watermark text, stage scenery or distracting background. Use a clean plain background. Make the silhouette readable and keep appendages distinguishable so students can trace separate movable parts. Rich traditional or modern decoration is allowed when requested. Do not draw artificial joint circles or cutting labels; the studio adds real connections separately. Do not invent historical authenticity. ${input.task==='edit-image'?'Revise the supplied artwork only as requested; keep unrelated visual details consistent. This is an editable concept, so do not claim exact preservation. ':''}Student request: ${input.prompt}`;
  return {model:configuration.imageModel,input:{messages:[{role:'user',content:[...(input.imageDataUrl?[{image:input.imageDataUrl}]:[]),{text:prompt}]}]},parameters:{n:1,size:'1024*1536',prompt_extend:false,watermark:false}};
}
function trustedImageDownload(value) {
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(/(^|\.)aliyuncs\.com$/.test(u.hostname)||/(^|\.)alibabacloud\.com$/.test(u.hostname));}catch{return false;}
}
const studioBase64=bytes=>{let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(raw);};
async function studioGeneratedAsset(data,fetcher) {
  const url=data?.output?.choices?.[0]?.message?.content?.find(item=>typeof item.image==='string')?.image;
  if(!trustedImageDownload(url))throw Object.assign(Error('The image provider returned an unexpected download address.'),{status:502});
  const r=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Object.assign(Error('The generated image could not be downloaded. Please retry.'),{status:502});
  const bytes=await studioReadBounded(r,12_000_000);
  if(bytes.length<24||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw Object.assign(Error('The image provider did not return a PNG image.'),{status:502});
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=view.getUint32(16),height=view.getUint32(20);
  if(width<1||height<1||width>8000||height>8000)throw Object.assign(Error('The generated image has unsupported dimensions.'),{status:502});
  return {id:'art-'+crypto.randomUUID(),name:'AI character concept',mime:'image/png',dataUrl:'data:image/png;base64,'+studioBase64(bytes),width,height};
}
async function studioEvaluateArtwork(asset,input,configuration,fetcher) {
  const payload={model:configuration.visionModel,messages:[
    {role:'system',content:'Evaluate the supplied character artwork against the exact student request. Look at the pixels, not merely the prompt. Return JSON only: {"summary":"short assessment","checks":[{"requirement":"specific requested feature","status":"met|not_met|unclear","evidence":"what is visibly present or missing"}]}. Check requested anatomy and appendage counts, clothing silhouette, colors, full-body framing, and distinct cuttable regions when relevant. Never invent invisible details or assume a generated image follows its prompt. No identification of a real person from their face; assess explicitly requested visible features. If occlusion prevents counting, say unclear. This is visual design review, not fabrication verification. Use the requested response language.'},
    {role:'user',content:[{type:'image_url',image_url:{url:asset.dataUrl}},{type:'text',text:JSON.stringify({language:input.language,studentRequest:input.prompt})}]}
  ],response_format:{type:'json_object'},temperature:0,max_tokens:1200,stream:false,enable_thinking:false};
  try {
    const r=await fetcher(configuration.base+'/chat/completions',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+configuration.key},body:JSON.stringify(payload),signal:AbortSignal.timeout(35000)});
    if(!r.ok){await r.body?.cancel();return null;}
    const data=studioParseJson(await studioReadBounded(r,25000));
    if(data?.choices?.[0]?.finish_reason==='length')return null;
    const raw=data?.choices?.[0]?.message?.content;
    if(typeof raw!=='string')return null;
    const value=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
    if(typeof value.summary!=='string'||!Array.isArray(value.checks)||!value.checks.length)return null;
    const checks=value.checks.slice(0,10).filter(c=>c&&typeof c.requirement==='string'&&typeof c.evidence==='string'&&['met','not_met','unclear'].includes(c.status)).map(c=>({requirement:c.requirement.slice(0,200),status:c.status,evidence:c.evidence.slice(0,400)}));
    return checks.length?{summary:value.summary.slice(0,800),checks}:null;
  }catch{return null;}
}
export async function handleStudioApi(request,env={},fetcher=fetch) {
  const url=new URL(request.url),configuration=studioConfig(env),origin=request.headers.get('origin')||'';
  const extraOrigins=String(env.STUDIO_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const allowed=!origin||origin===url.origin||STUDIO_ALLOWED_ORIGINS.has(origin)||extraOrigins.includes(origin);
  const cors=origin&&allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'}:{};
  if(!allowed)return studioJson({error:'origin',message:'This origin is not allowed by the studio relay.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(url.pathname==='/api/studio/status'&&request.method==='GET')return studioJson({version:2,service:'Shadow Puppet Studio',configured:!!configuration,text:!!configuration,vision:!!configuration,imageGeneration:!!configuration?.imageEndpoint,verification:'configuration-only',storesPrompts:false,status:configuration?'Protected studio services configured. Provider access is checked when you make a request.':'AI is not configured on this server.',models:configuration?{text:configuration.model,vision:configuration.visionModel,image:configuration.imageEndpoint?configuration.imageModel:null}:{}},200,cors);
  if(url.pathname!=='/api/studio')return studioJson({error:'not_found'},404,cors);
  if(request.method!=='POST')return studioJson({error:'method'},405,cors);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return studioJson({error:'content_type'},400,cors);
  let admitted=false;
  try {
    const input=validateStudioRequest(studioParseJson(await studioReadBounded(request,13_000_000)));
    const imageTask=['generate-image','edit-image'].includes(input.task);
    if(!configuration||imageTask&&!configuration.imageEndpoint)return studioJson({error:'configuration',message:imageTask?'Qwen Image generation is not configured on this protected server.':'AI is not configured on this protected server.'},503,cors);
    const minute=Math.floor(Date.now()/60000),who=request.headers.get('oai-authenticated-user-id')||request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'local';
    for(const [id,v]of studioClients)if(v.minute!==minute)studioClients.delete(id);
    const record=studioClients.get(who)||{minute,count:0};if(studioInFlight>=3||record.count>=8)return studioJson({error:'rate_limit',message:'The studio assistant is busy. Wait a moment and retry.'},429,cors);
    record.count++;studioClients.set(who,record);studioInFlight++;admitted=true;
    const target=imageTask?configuration.imageEndpoint:configuration.base+'/chat/completions';
    const response=await fetcher(target,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+configuration.key},body:JSON.stringify(imageTask?studioImagePayload(input,configuration):studioChatPayload(input,configuration)),signal:AbortSignal.timeout(imageTask?150000:55000)});
    if(!response.ok){await response.body?.cancel();return studioJson({error:'provider',providerStatus:response.status,message:response.status===401||response.status===403?'The provider did not authorize this model. Check the model and region on the protected server.':response.status===429?'The provider is busy or the account quota is unavailable. Please retry later.':'The provider could not complete this request. Your design is unchanged.'},[401,403,429].includes(response.status)?response.status:502,cors);}
    const data=studioParseJson(await studioReadBounded(response,500000));
    if(imageTask){
      const asset=await studioGeneratedAsset(data,fetcher),evaluation=await studioEvaluateArtwork(asset,input,configuration,fetcher);
      const warnings=['AI artwork is a concept. Cut boundaries, hidden areas and moving connections still require review.'];
      if(evaluation){for(const check of evaluation.checks)if(check.status!=='met')warnings.push(`${check.requirement}: ${check.evidence}`);}
      else warnings.push('Automatic visual comparison could not finish. Check the image against your prompt before accepting it.');
      const introduction=input.language==='zh'?'请检查新图像；接受后仍需描绘部件并检查连接。':'Review the new artwork. After accepting it, trace the parts and check their connections.';
      return studioJson({reply:introduction+(evaluation?' '+evaluation.summary:''),asset,proposal:null,mode:'image',evaluation,warnings},200,cors);
    }
    const result=parseStudioResponse(data);if(input.task==='analyze')result.proposal=null;
    return studioJson(result,200,cors);
  } catch(error) {
    const status=error.status||((error.name==='TimeoutError'||error.name==='AbortError')?504:502);
    return studioJson({error:status===400?'request':'studio',message:error.status?error.message:status===504?'The AI request timed out. Your project is unchanged.':'The assistant could not return usable design data. Try a smaller change.'},status,cors);
  } finally {if(admitted)studioInFlight--;}
}
