import {applyStudioProposal} from './studio-model.mjs';
// Browser transport contains no provider credential. Pixel services are optional
// capabilities of a protected server; the existing relay can provide drawing plans.
export const STUDIO_RELAY = 'https://6ilmssim2bz2s.kimi.site/api/studio';
export const PLAN_RELAY = 'https://6ilmssim2bz2s.kimi.site/api/puppet';
export const MAX_STUDIO_PROMPT = 4000;

export const STUDIO_SYSTEM = `You collaborate with students on custom shadow-puppet design. Return one JSON object: {"reply":"short explanation in requested language","proposal":{"parts":[],"joints":[],"brief":{}},"warnings":[]}. Do not wrap JSON in Markdown. Student intent and retained work are authoritative. Never invent a character name, story, identity, historical fact or symbolism. Modern, historical, fictional, real-world, animal and fantastical subjects are valid. No fixed human skeleton: preserve requested anatomy, appendage counts, costume silhouette and custom shapes. Ask for clarification rather than silently substituting a generic human. The result is a design draft, never a claim of tested physical construction.
Parts are separate cuttable simple polygons in the supplied canvas coordinate system, with {id,name,polygon:[[x,y],...],fill:"#RRGGBB",assetId:null|string,z:number}. Use 6-24 vertices per shape, no self-intersections, duplicate points or zero-area parts. At most 24 parts per reply. Existing part edits are patches by id: omit unchanged fields and preserve everything the student did not request changing. Do not delete implicitly. Respect locked parts and their joints; do not move or recolor locked artwork. Use removePartIds only when explicitly requested. When source artwork is present, use its assetId and exact pixel coordinates to propose outlines; never invent a different picture. Trace visible boundaries, and identify hidden areas needing reconstruction as warnings. Approximate AI traces require student review.
Joints have {id,parentId,childId,parentAnchor:[x,y],childAnchor:[x,y],type:"pivot"|"fixed"|"hinge",angle:0,min:-90,max:90,padRadius:12}. Anchors must be inside their respective polygons and leave a useful material rim. A part has at most one parent; no cycles. Pivot joints use overlap tabs and holes; fixed connections do not move; hinge lines need a material trial. Do not invent precise fabrication tolerances. For create, provide complete draft parts; for refine, provide only changed parts/joints; for segment, propose separate visible parts from the image; for analyze, return reply and warnings only, honestly distinguishing observed evidence from assumptions. Include required manual fixes. Do not output HTML, SVG, code, links, credentials or robot actions. Changes are proposals until the student accepts.`;

const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const plainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const boundedString = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
const finitePoint = p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 20000);
export function studioEndpoint() {
  if (typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)) return location.origin + '/api/studio';
  return STUDIO_RELAY;
}
export function validProtectedEndpoint(value) {
  try { const u = new URL(value); return !u.username && !u.password && !u.hash && !u.search && (u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname))); } catch { return false; }
}
export function studioContext(project) {
  // Asset bytes are sent only as explicit vision input, never in text history.
  return {title:boundedString(project.title,160),brief:project.brief,conceptAssetId:project.conceptAssetId,
    canvas:project.assets?.find(a=>a.id===project.conceptAssetId) ? (({width,height,id})=>({width,height,assetId:id}))(project.assets.find(a=>a.id===project.conceptAssetId)) : {width:800,height:1000},
    assets:(project.assets||[]).map(({id,width,height,name})=>({id,width,height,name})),
    parts:(project.parts||[]).map(({id,name,polygon,assetId,fill,x,y,rotation,locked,z})=>({id,name,polygon,assetId,fill,x,y,rotation,locked,z})),
    joints:project.joints||[],rods:project.rods||[],heightMm:project.heightMm,holeMm:project.holeMm};
}
export function makeStudioRequest(project, {task='create',prompt='',imageDataUrl,history=[],selectedPartId,repair}={}) {
  if (!['create','refine','analyze','segment','generate-image','edit-image'].includes(task)) throw Error('Unknown studio task.');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_STUDIO_PROMPT) throw Error(`Enter a request of 1–${MAX_STUDIO_PROMPT} characters.`);
  if (imageDataUrl && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(imageDataUrl)) throw Error('Use a PNG, JPEG or WebP image.');
  if (imageDataUrl?.length > 12_000_000) throw Error('The reference image is too large. Use an image under 8 MB.');
  if(selectedPartId&&!project.parts?.some(p=>p.id===selectedPartId))throw Error('Select an existing part to revise.');
  return {application:'shadow-puppet-studio',version:2,task,prompt:prompt.trim(),language:project.language==='zh'?'zh':'en',project:studioContext(project),
    ...(imageDataUrl?{imageDataUrl}:{}),...(selectedPartId?{selectedPartId}:{}),...(repair?{repair:{error:boundedString(repair.error,1000),proposal:repair.proposal}}:{}),history:history.slice(-4).filter(m=>['user','assistant'].includes(m.role)).map(m=>({role:m.role,content:boundedString(m.content,2000)}))};
}
export function makeDrawingPlanRequest(project,args) {
  const request=makeStudioRequest(project,args);
  if (request.imageDataUrl || ['analyze','segment','generate-image','edit-image'].includes(request.task)) throw Error('The current relay supports text drawing plans. Image analysis and generation need the image-capable studio relay. You can still import and trace your artwork.');
  const repairHint=request.repair?` Repair the previous plan in scene.repair; validation found: ${request.repair.error.slice(0,120)}. Return the complete corrected plan.`:'';
  const question=`For this design discussion, give a measured drawing plan for: ${request.prompt.slice(0,request.repair?250:450)}. Full request: scene.studentRequest.${repairHint} In reply include one JSON-encoded string containing summary and parts [{id,name,polygon,fill}]. Polygons are point measurements of paper outlines, not SVG or code. Use actual numeric x/y pairs in the ${request.project.canvas.width} by ${request.project.canvas.height} canvas. Include all requested shapes and appendage counts, at most 18 parts. Use 6-20 vertices per simple polygon, nonzero area, no crossings, hex colors. Every part is a physical cut piece: no thin trim/decorative slivers; suggest painting small details. No legacy fields. Example part: {"id":"coat","name":"Coat","polygon":[[300,250],[500,250],[520,600],[280,600]],"fill":"#ffffff"}. For refinement use existing ids from scene.studio, return only changes; retain locked pieces, anchors and assetId. If scene.selectedPart is set, revise ONLY that piece. Never replace tentacles with human legs or a skirt with trousers.`;
  const content=JSON.stringify({question,language:request.language,task:'discuss',scene:{application:'shadow-puppet-studio',objects:[],studentRequest:request.prompt,operation:request.task,selectedPart:request.selectedPartId||null,selectionRule:request.selectedPartId?'Return changes ONLY to part '+request.selectedPartId+'. Keep its assetId and all other pieces unchanged.':null,studio:request.project,history:request.history,...(request.repair?{repair:request.repair}:{})}});
  if(content.length>34500)throw Error('This project is too detailed for the current text relay. Use a smaller project or the updated studio relay.');
  return {application:'shadow-puppet-studio',model:'qwen3.8-flash',messages:[{role:'system',content:'You give concise shadow-puppet design advice.'},{role:'user',content}],temperature:.4,max_tokens:3500,response_format:{type:'json_object'},stream:false,enable_thinking:false};
}
function readJsonText(text) {
  let raw=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  // Some relay models serialize the plan twice inside reply. Decode, never eval.
  for(let i=0;i<3;i++) {
    try { const value=JSON.parse(raw); if(typeof value==='string'){raw=value;continue;} return value; }
    catch { if(raw.startsWith('{\\"')) { raw=raw.replace(/\\"/g,'"').replace(/\\\\/g,'\\'); continue; } throw Error('The assistant returned incomplete design data. Try a shorter request.'); }
  }
  throw Error('The assistant returned invalid design data.');
}
function planInsideReply(reply) {
  try {const parsed=readJsonText(reply);if(plainObject(parsed)&&Array.isArray(parsed.parts))return parsed;}catch{}
  // Some compliant advice surrounds the measurement data with explanation.
  // Parse only complete JSON objects; never run or infer executable content.
  const start=reply.indexOf('{'),end=reply.lastIndexOf('}');
  if(start<0||end<=start)return null;
  try {const parsed=readJsonText(reply.slice(start,end+1));return plainObject(parsed)&&Array.isArray(parsed.parts)?parsed:null;}catch{return null;}
}
function cleanProposal(value) {
  if(!plainObject(value)) return null;
  const result={};
  if(Array.isArray(value.parts)) {
    if(value.parts.length>40)throw Error('The assistant proposed too many pieces. Ask for fewer parts.');
    const ids=new Set();result.parts=value.parts.map(p=>{
      if(!plainObject(p)||typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(p.id))throw Error('The assistant returned an invalid part identifier. Retry the request.');
      if(ids.has(p.id))throw Error('The assistant returned duplicate part identifiers. Retry the request.');ids.add(p.id);
      const item={id:p.id};
      for(const key of ['name','assetId','fill','x','y','rotation','z'])if(own(p,key))item[key]=p[key];
      if(own(p,'polygon')){if(!Array.isArray(p.polygon)||p.polygon.length<3||p.polygon.length>250||!p.polygon.every(finitePoint))throw Error('The assistant returned invalid shape coordinates. Retry the request.');item.polygon=p.polygon;}
      return item;
    });
  }
  if(Array.isArray(value.joints))result.joints=value.joints;
  if(plainObject(value.brief))result.brief=value.brief;
  if(Array.isArray(value.removePartIds))result.removePartIds=value.removePartIds.filter(id=>typeof id==='string');
  return Object.keys(result).length?result:null;
}
export function parseStudioResponse(data,{legacy=false}={}) {
  let value=data;
  if(data?.choices){const choice=data.choices[0];if(choice?.finish_reason==='length')throw Error('The drawing plan was cut off. Ask for fewer parts or a smaller change.');if(typeof choice?.message?.content!=='string'||choice.message.content.length>120000)throw Error('Unexpected assistant response.');value=readJsonText(choice.message.content);}
  if(!plainObject(value))throw Error('Unexpected assistant response.');
  if(typeof value.reply==='string'){const plan=planInsideReply(value.reply);if(plan)value={...plan,reply:plan.summary||plan.reply||'Review this drawing plan before accepting it.'};}
  const proposal=cleanProposal(value.proposal||((value.parts||value.joints||value.removePartIds)?value:null));
  const reply=boundedString(value.reply||value.summary,5000);
  if(!reply)throw Error('The assistant did not explain its proposal.');
  const warnings=Array.isArray(value.warnings)?value.warnings.filter(x=>typeof x==='string').slice(0,12):[];
  if(value.asset){const a=value.asset;if(!plainObject(a)||typeof a.id!=='string'||!/^[A-Za-z0-9_-]{1,96}$/.test(a.id)||typeof a.dataUrl!=='string'||a.dataUrl.length>20*1024*1024||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(a.dataUrl)||![a.width,a.height].every(n=>Number.isInteger(n)&&n>=1&&n<=8192))throw Error('The assistant did not return a portable PNG, JPEG or WebP image.');}
  if(legacy&&proposal)warnings.push('Editable drawing plan from the text assistant. Review the silhouette and add or check connections in Prepare. This is not generated reference artwork.');
  if(legacy&&!proposal)warnings.push('The relay returned advice only; no editable shapes were proposed.');
  return {reply,proposal,warnings,mode:legacy?'drawing-plan':(value.mode||'studio'),...(value.asset?{asset:value.asset}:{}),...(value.evaluation?{evaluation:value.evaluation}:{})};
}
const statusUrl=endpoint=>endpoint.replace(/\/$/,'')+'/status';
const timeoutSignal=(signal,ms)=>signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
async function responseJson(response){try{return await response.json();}catch{return null;}}
export async function getStudioCapabilities({endpoint=studioEndpoint(),fetcher=fetch,signal}={}) {
  if(!validProtectedEndpoint(endpoint))throw Error('Use an HTTPS protected relay URL.');
  const endpointHost=new URL(endpoint).hostname;
  const compatibilityAllowed=endpoint===STUDIO_RELAY||(['localhost','127.0.0.1'].includes(endpointHost)&&new URL(endpoint).pathname==='/api/studio');
  let configuredStatus;
  try {
    const r=await fetcher(statusUrl(endpoint),{signal:timeoutSignal(signal,9000),headers:{Accept:'application/json'}}),v=await responseJson(r);
    if(r.ok&&v?.version===2){configuredStatus={...v,endpoint,mode:'studio'};if(v.text||v.imageGeneration||!compatibilityAllowed)return configuredStatus;}
  }catch(error){if(signal?.aborted)throw error;}
  // Only the known existing relay is a safe automatic compatibility fallback.
  if(!compatibilityAllowed)return {version:2,text:false,vision:false,imageGeneration:false,endpoint,mode:'unavailable',status:'The studio relay is unavailable.'};
  try {
    const r=await fetcher('https://6ilmssim2bz2s.kimi.site/api/status',{signal:timeoutSignal(signal,9000)}),v=await responseJson(r);
    if(r.ok&&v?.service==='Shadow Puppet Studio'&&v.configured)return {version:1,text:true,vision:false,imageGeneration:false,drawingPlans:'limited',endpoint:PLAN_RELAY,mode:'drawing-plan',status:'Legacy text assistant connected. Custom drawing plans are limited; reliable custom shapes and image services need the updated relay.'};
  }catch(error){if(signal?.aborted)throw error;}
  return configuredStatus||{version:0,text:false,vision:false,imageGeneration:false,endpoint,mode:'unavailable',status:'AI connection unavailable. Import an image or draw parts to continue.'};
}
export async function requestStudioAI(project,args={},options={}) {
  const {fetcher=fetch,endpoint=args.endpoint||studioEndpoint(),signal=args.signal,capabilities=args.capabilities}=options;
  const body=makeStudioRequest(project,args);
  if(body.task==='refine'&&body.selectedPartId&&project.parts.find(p=>p.id===body.selectedPartId)?.locked)throw Error('This part is locked. Unlock it before requesting a revision.');
  if(body.task==='create'&&project.parts.some(p=>p.locked))throw Error('This design contains locked pieces. Use Refine to preserve them, or unlock them before creating a new design.');
  const caps=capabilities||await getStudioCapabilities({endpoint,fetcher,signal});
  const isImage=['generate-image','edit-image'].includes(body.task),needsVision=!!body.imageDataUrl||['analyze','segment'].includes(body.task);
  if(isImage&&!caps.imageGeneration)throw Error('Image generation is not connected yet. The protected relay needs the Qwen Image endpoint. You can import your existing artwork now.');
  if(needsVision&&!isImage&&!caps.vision)throw Error('Image analysis is not connected yet. The protected relay needs multimodal image input. You can trace the imported image manually now.');
  if(!caps.text&&!isImage)throw Error(caps.status||'AI connection is unavailable. Your project is kept on this device.');
  const legacy=caps.mode==='drawing-plan',target=caps.endpoint||endpoint;
  if(!validProtectedEndpoint(target))throw Error('Invalid protected relay URL.');
  let repair;
  for(let attempt=0;attempt<2;attempt++){
    const attemptArgs={...args,...(repair?{repair}:{})};
    const response=await fetcher(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(legacy?makeDrawingPlanRequest(project,attemptArgs):makeStudioRequest(project,attemptArgs)),signal:timeoutSignal(signal,isImage?240000:60000)});
    const data=await responseJson(response);
    if(!response.ok){const hints={400:'The relay could not read this request.',401:'The protected AI connection needs authorization.',403:'This studio is not allowed by the protected relay.',404:'The updated studio relay route has not been installed.',413:'This image or project is too large for the AI service.',422:'The assistant returned a shape that needs correction. Try a smaller change.',429:'The AI connection is busy. Wait a moment and retry.',503:'This AI capability is not configured on the protected server.'};throw Error(data?.message||hints[response.status]||`AI request failed (${response.status}). Your design is unchanged.`);}
    let result;
    try{result=parseStudioResponse(data,{legacy});}catch(error){if(attempt===0&&!isImage){repair={error:error.message,proposal:null};continue;}throw error;}
    if(body.task==='analyze')result.proposal=null;
    if(body.task==='refine'&&body.selectedPartId&&result.proposal){
      const original=project.parts.find(p=>p.id===body.selectedPartId),patches=(result.proposal.parts||[]).filter(p=>p.id===body.selectedPartId);
      if(!patches.length){result.proposal=null;result.warnings.push('No change to the selected piece was returned. Select the piece by name in your request.');}
      else {result.proposal={parts:patches.map(p=>({...p,assetId:original.assetId}))};result.warnings.push('Only the selected piece is included; its source artwork, all other parts and connections are preserved.');}
    }
    if(result.proposal){
      const validationBase=body.task==='create'?{...project,parts:[],joints:[],rods:[]}:project;
      try{applyStudioProposal(validationBase,result.proposal);}
      catch(error){if(attempt===0&&!isImage){repair={error:error.message,proposal:result.proposal};continue;}throw Error('The proposed outline still needs correction: '+error.message+' Your existing design is unchanged. Try a simpler outline or trace this piece manually.');}
    }
    else if(attempt===0&&body.task==='create'&&!isImage){repair={error:'No editable numeric polygon measurements were returned. Provide the requested outline data if this service supports it; otherwise state that limitation clearly.',proposal:null};continue;}
    if(repair)result.warnings.push('The initial response did not provide valid editable outlines. One AI repair attempt was made; review this response before accepting.');
    return result;
  }
}
