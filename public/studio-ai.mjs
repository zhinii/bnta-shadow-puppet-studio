import {applyStudioProposal,normalizeStudioProject} from './studio-model.mjs?v=0.7.9';
import {readArtworkFile,validateArtworkBytes} from './studio-storage.mjs';
// Browser transport contains no provider credential. Pixel services are optional
// capabilities of a protected server; the existing relay can provide drawing plans.
export const STUDIO_RELAY = 'https://6ilmssim2bz2s.kimi.site/api/studio';
export const PLAN_RELAY = 'https://6ilmssim2bz2s.kimi.site/api/puppet';
export const IMAGE_RELAY = PLAN_RELAY + '/image';
export const MAX_STUDIO_PROMPT = 4000;
// Match the existing classic image client's budget. The legacy image route is
// independent of the v2 studio's 4,000-character student-input contract.
export const KIMI_IMAGE_PROMPT_LIMIT = 800;
const KIMI_IMAGE_DEFAULTS = 'Production defaults (explicit student requests override): Single full-body character on plain white; only requested props. No extra text, calligraphy, signatures, watermarks, borders, floating stars, ground decoration, pinhole dots, joint circles or labels. Keep anatomy, pose, costume lettering, tattoos and motifs; show appendages clearly. No cropped parts, duplicate poses or detached part sheets.';

export const IMAGE_PRODUCTION_RULES = `Production rules for editable shadow-puppet artwork:
These are defaults only. Explicit student requests take precedence, including requested text, decoration, props, background, pose or multiple characters.
Show a single complete full-body character, assembled in one view, entirely inside the frame with clear margins. Preserve the requested anatomy, appendage count, identity, costume, palette and pose. Make all appendages distinguishable and as fully visible as the requested pose allows; do not omit hidden parts, crop extremities, duplicate poses, or turn the character into a detached parts sheet unless requested.
Use a flat plain white background and only explicitly requested props. Do not add text, calligraphy, signatures, watermarks, borders, floating stars, ground decoration or scenery unless explicitly requested. These exclusions concern added presentation decoration: preserve legitimate character and costume details, lettering, tattoos, patterns, embroidery and motifs.
Do not draw simulated mechanical pinhole dots, joint circles, hinge marks, diagram labels or cutting lines unless explicitly requested; the studio adds functional connections separately. Keep the outline readable for tracing while retaining the student's requested design detail.`;

export function makeImageGenerationPrompt(project,prompt) {
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>MAX_STUDIO_PROMPT)throw Error(`Enter a request of 1-${MAX_STUDIO_PROMPT} characters.`);
  // Legacy saved dropdown choices remain in the project file, but are no
  // longer controls and must not silently steer a new generation.
  return `${IMAGE_PRODUCTION_RULES}\n\nStudent prompt (verbatim):\n${prompt}`;
}

export const STUDIO_SYSTEM = `You collaborate with students on custom shadow-puppet design. Return one JSON object: {"reply":"short explanation in requested language","proposal":{"parts":[],"joints":[],"brief":{}},"warnings":[]}. Do not wrap JSON in Markdown. Student intent and retained work are authoritative. Never invent a character name, story, identity, historical fact or symbolism. Modern, historical, fictional, real-world, animal and fantastical subjects are valid. No fixed human skeleton: preserve requested anatomy, appendage counts, costume silhouette and custom shapes. Ask for clarification rather than silently substituting a generic human. The result is a design draft, never a claim of tested physical construction.
Parts are separate cuttable simple polygons in the supplied canvas coordinate system, with {id,name,polygon:[[x,y],...],fill:"#RRGGBB",assetId:null|string,z:number}. Use 6-24 vertices per shape, no self-intersections, duplicate points or zero-area parts. At most 24 parts per reply. Existing part edits are patches by id: omit unchanged fields and preserve everything the student did not request changing. Do not delete implicitly. Respect locked parts and their joints; do not move or recolor locked artwork. Use removePartIds only when explicitly requested. When source artwork is present, use its assetId and exact pixel coordinates to propose outlines; never invent a different picture. Trace visible boundaries, and identify hidden areas needing reconstruction as warnings. Approximate AI traces require student review.
For width or length changes to an existing part, return {id,parameters:{width:number,length:number}} with only the changed dimension. These are absolute multipliers from 0.25 to 4 relative to that part's baseline since its last axis rebase; a request for 20% longer means current parameters.length multiplied by 1.2. The stored axisAngle defines width/length directions. The application transforms artwork, boundaries and attached anchors together, keeps child pieces unscaled, and checks locked descendants. Never replace numeric contours to simulate a simple resize. Do not combine parameters with polygon edits in one patch. artworkMatrix, parameters.origin and parameters.axisAngle are read-only context: never return them. Dimension changes cannot invent hidden image details or recolor raster pixels; explain when a requested visual change needs image editing instead.
For a mirror/flip of an existing piece, return {id,transform:{mirror:"horizontal"}} for left-right or "vertical" for up-down. These directions refer to the displayed puppet. The studio reflects its outline and artwork together about its joint, or its centre when unattached, and preserves the joint angle. Do not use negative width/length, axisAngle, rotation, or a replacement polygon to imitate a mirror. Do not combine transform with parameters or polygon in one patch. Mirroring is not rotation: follow the requested direction, or ask if it is ambiguous. Return editable changes inside proposal, not promises or JSON fragments embedded in prose. If no supported edit is possible, say so without claiming to have changed the design.
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
  return {title:boundedString(project.title,160),brief:{keywords:boundedString(project.brief?.keywords,4000)},conceptAssetId:project.conceptAssetId,
    canvas:project.assets?.find(a=>a.id===project.conceptAssetId) ? (({width,height,id})=>({width,height,assetId:id}))(project.assets.find(a=>a.id===project.conceptAssetId)) : {...(project.canvas||{width:800,height:1000})},
    assets:(project.assets||[]).map(({id,width,height,name})=>({id,width,height,name})),
    parts:(project.parts||[]).map(({id,name,polygon,assetId,fill,x,y,rotation,locked,z,artworkMatrix,parameters})=>({id,name,polygon,assetId,fill,x,y,rotation,locked,z,...(artworkMatrix?{artworkMatrix:[...artworkMatrix]}:{}),...(parameters?{parameters:{...parameters,...(parameters.origin?{origin:[...parameters.origin]}:{})}}:{})})),
    joints:project.joints||[],rods:project.rods||[],heightMm:project.heightMm,holeMm:project.holeMm};
}
export function makeStudioRequest(project, {task='create',prompt='',imageDataUrl,history=[],selectedPartId,repair}={}) {
  if (!['create','refine','analyze','segment','generate-image','edit-image'].includes(task)) throw Error('Unknown studio task.');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_STUDIO_PROMPT) throw Error(`Enter a request of 1–${MAX_STUDIO_PROMPT} characters.`);
  if (imageDataUrl && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(imageDataUrl)) throw Error('Use a PNG, JPEG or WebP image.');
  if (imageDataUrl?.length > 12_000_000) throw Error('The reference image is too large. Use an image under 8 MB.');
  if(selectedPartId&&!project.parts?.some(p=>p.id===selectedPartId))throw Error('Select an existing part to revise.');
  return {application:'shadow-puppet-studio',version:2,task,prompt:task==='generate-image'?prompt:prompt.trim(),language:project.language==='zh'?'zh':'en',project:studioContext(project),
    ...(imageDataUrl?{imageDataUrl}:{}),...(selectedPartId?{selectedPartId}:{}),...(repair?{repair:{error:boundedString(repair.error,1000),proposal:repair.proposal}}:{}),history:history.slice(-4).filter(m=>['user','assistant'].includes(m.role)).map(m=>({role:m.role,content:boundedString(m.content,2000)}))};
}
export function makeDrawingPlanRequest(project,args) {
  const request=makeStudioRequest(project,args);
  if (request.imageDataUrl || ['analyze','segment','generate-image','edit-image'].includes(request.task)) throw Error('The current relay supports text drawing plans. Image analysis and generation need the image-capable studio relay. You can still import and trace your artwork.');
  const repairHint=request.repair?` Repair the previous plan in scene.repair; validation found: ${request.repair.error.slice(0,120)}. Return the complete corrected plan.`:'';
  const question=`Make an editable plan for: ${request.prompt.slice(0,180)}. Read the FULL request/history/geometry in scene.studentRequest and scene.studio.${repairHint} Put ONE JSON-encoded object in reply: {"summary":"Review this change","parts":[...]}. No prose outside that object, no "Summary:"/"Parts:" labels. For creation, parts have {id,name,polygon,fill}: numeric x/y pairs in the ${request.project.canvas.width} by ${request.project.canvas.height} canvas, at most 18 simple polygons with 6-20 vertices, nonzero area, no crossings, hex colors. Preserve requested anatomy. For existing pieces use current ids, return ONLY requested edits, retain locks and assetId. If scene.selectedPart is set, revise ONLY it. Resize with {id,parameters:{width:1.2}} or length: absolute multipliers 0.25..4; 20% longer means current length*1.2. Mirror with {id,transform:{mirror:"horizontal"}} (left-right) or "vertical" (up-down). Mirror preserves the joint angle; never use negative dimensions or rotation instead. Do not combine transform, parameters and polygon. Never return artworkMatrix, origin or axisAngle. Do not invent painting suggestions or say a change is applied. Unsupported edits need an honest explanation, not an invented plan.`;
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
  const plan=value=>plainObject(value)&&(Array.isArray(value.parts)||plainObject(value.proposal))?value:null;
  try {const parsed=plan(readJsonText(reply));if(parsed)return parsed;}catch{}
  // Some compliant advice surrounds the measurement data with explanation.
  // Parse only complete JSON objects; never run or infer executable content.
  const start=reply.indexOf('{'),end=reply.lastIndexOf('}');
  if(start>=0&&end>start)try {const parsed=plan(readJsonText(reply.slice(start,end+1)));if(parsed)return parsed;}catch{}
  // The legacy discussion relay sometimes emits exactly "Parts: [JSON]".
  // Accept one explicitly labelled, complete JSON array; never infer an edit
  // from prose, execute code, or choose between several competing arrays.
  const labels=[...reply.matchAll(/(?:^|[\s.!?;])Parts\s*:\s*(?=\[)/gi)];
  if(labels.length!==1)return null;
  const begin=labels[0].index+labels[0][0].length;
  let depth=0,quoted=false,escaped=false,finish=-1;
  for(let i=begin;i<reply.length;i++){
    const c=reply[i];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;continue;}
    if(c==='[')depth++;else if(c===']'&&--depth===0){finish=i+1;break;}
  }
  if(finish<0)return null;
  try {
    const parts=JSON.parse(reply.slice(begin,finish));
    const summary=reply.match(/(?:^|[\s.!?;])Summary\s*:\s*([^\n]*?)(?=\s+Parts\s*:|\r?\n|$)/i)?.[1];
    return Array.isArray(parts)?{parts,summary:summary||'Review this change before applying it.'}:null;
  }catch{return null;}
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
      if(own(p,'transform')){
        if(!plainObject(p.transform)||Object.keys(p.transform).length!==1||!['horizontal','vertical'].includes(p.transform.mirror))throw Error('Use transform:{mirror:"horizontal"} for left-right or {mirror:"vertical"} for up-down.');
        if(own(p,'polygon')||own(p,'parameters'))throw Error('Return a mirror transform separately from dimension parameters or a new outline.');
        item.transform={mirror:p.transform.mirror};
      }
      if(own(p,'artworkMatrix'))throw Error('Artwork alignment is calculated by the studio. Return only width or length parameters for a resize.');
      if(own(p,'parameters')){
        if(!plainObject(p.parameters)||!Object.keys(p.parameters).length||Object.keys(p.parameters).some(key=>!['width','length'].includes(key)))throw Error('Return only width and length parameters; the artwork origin and axis are protected.');
        if(own(p,'polygon'))throw Error('Use either dimension parameters or a new outline, not both in the same edit.');
        item.parameters={};
        for(const key of ['width','length'])if(own(p.parameters,key)){
          const n=p.parameters[key];if(typeof n!=='number'||!Number.isFinite(n)||n<.25||n>4)throw Error('Part dimensions must be numeric multipliers from 0.25 to 4. For mirroring, use transform:{mirror:"horizontal"} or {mirror:"vertical"}; never negative dimensions.');
          item.parameters[key]=n;
        }
      }
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
  if(typeof value.reply==='string'&&!value.proposal&&!value.parts&&!value.joints){const plan=planInsideReply(value.reply);if(plan)value={...value,...plan,reply:plan.summary||plan.reply||'Review this drawing plan before accepting it.'};}
  const proposal=cleanProposal(value.proposal||((value.parts||value.joints||value.removePartIds)?value:null));
  const reply=boundedString(value.reply||value.summary,5000);
  if(!reply)throw Error('The assistant did not explain its proposal.');
  const warnings=Array.isArray(value.warnings)?value.warnings.filter(x=>typeof x==='string').slice(0,12):[];
  if(value.asset){const a=value.asset;if(!plainObject(a)||typeof a.id!=='string'||!/^[A-Za-z0-9_-]{1,96}$/.test(a.id)||typeof a.dataUrl!=='string'||a.dataUrl.length>20*1024*1024||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(a.dataUrl)||![a.width,a.height].every(n=>Number.isInteger(n)&&n>=1&&n<=8192))throw Error('The assistant did not return a portable PNG, JPEG or WebP image.');}
  if(legacy&&proposal)warnings.push('Editable drawing plan from the text assistant. Review the silhouette and add or check connections in Refine. This is not generated reference artwork.');
  if(legacy&&!proposal)warnings.push('The relay returned advice only; no editable shapes were proposed.');
  return {reply,proposal,warnings,mode:legacy?'drawing-plan':(value.mode||'studio'),...(value.asset?{asset:value.asset}:{}),...(value.evaluation?{evaluation:value.evaluation}:{})};
}
const statusUrl=endpoint=>endpoint.replace(/\/$/,'')+'/status';
const timeoutSignal=(signal,ms)=>signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
async function responseJson(response){try{return await response.json();}catch{return null;}}
const aborted=signal=>{if(signal?.aborted)throw signal.reason||new DOMException('Request cancelled.','AbortError');};
// Only a format guard: this never guesses or executes a flip direction.
function explicitMirrorRequest(prompt){
  if(/\b(?:do\s+not|don't|dont|never)\s+(?:mirror|flip)\b|(?:不要|不用|无需|不必|别)(?:再|进行|做)?(?:镜像|翻转|翻面)/i.test(prompt))return false;
  return /\b(?:mirror|flip)\b(?:\s+(?:it|this|that|the|my|selected|horizontally|vertically|horizontal|vertical|left|right|up|down)\b|[.!?]?$)|镜像|翻转|翻面|左右翻|上下翻/i.test(prompt);
}
export function getKimiImagePromptLimit(project) {
  return KIMI_IMAGE_PROMPT_LIMIT;
}
export function makeKimiImageRequest(project,{prompt=''}={}) {
  makeStudioRequest(project,{task:'generate-image',prompt});
  const required=prompt;
  if(required.length>KIMI_IMAGE_PROMPT_LIMIT){
    const over=required.length-KIMI_IMAGE_PROMPT_LIMIT;
    throw Error(project.language==='zh'?'本图片连接最多支持 '+KIMI_IMAGE_PROMPT_LIMIT+' 个字符；本次使用 '+required.length+' 个。请至少缩短 '+over+' 个字符。未截断任何内容。':'This image connection allows '+KIMI_IMAGE_PROMPT_LIMIT+' characters; this request uses '+required.length+'. Shorten it by at least '+over+' characters. Nothing was truncated.');
  }
  // Guidance is optional; the student's complete wording takes priority.
  const guidance=KIMI_IMAGE_DEFAULTS+'\n\nStudent prompt (verbatim):\n';
  const complete=guidance.length+required.length<=KIMI_IMAGE_PROMPT_LIMIT?guidance+required:required;
  return {application:'shadow-puppet-studio',kind:'reference',prompt:complete};
}
export async function readKimiImageResponse(data,{artworkReader=readArtworkFile,signal,language='en'}={}) {
  aborted(signal);
  const value=data?.dataUrl;
  if(typeof value!=='string'||value.length>20_000_000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('The image service did not return a portable PNG, JPEG or WebP image.');
  const mime=value.slice(5,value.indexOf(';'));
  let bytes;try{bytes=Uint8Array.from(atob(value.slice(value.indexOf(',')+1)),c=>c.charCodeAt(0));}catch{throw Error('The image service returned invalid image data.');}
  if(!bytes.length||bytes.length>15_000_000)throw Error('The generated image is too large. Request a smaller image.');
  validateArtworkBytes(bytes,mime);
  const file=new Blob([bytes],{type:mime});Object.defineProperty(file,'name',{value:'Generated puppet artwork.'+(mime==='image/jpeg'?'jpg':mime.slice(6))});
  const asset=await artworkReader(file,{maxDimension:1600,maxBytes:15_000_000});
  aborted(signal);
  if(!plainObject(asset))throw Error('The generated artwork could not be decoded. Try generating another image.');
  // Validate the decoder result using the same portable-asset boundary as v2.
  const zh=language==='zh';
  const reply=zh?'接受前，请对照提示词检查生成图像的角色形态、肢体数量、服装和道具。确认后再提取并拆分部件。':'Before accepting, check the generated artwork against your prompt: anatomy, appendage count, costume, and props. Then extract and split the pieces in Refine.';
  const warning=zh?'此图像尚未经过视觉核验。生成结果可能遗漏细节或出现数量错误。':'This image has not been visually verified. Generation may miss requested details or produce incorrect counts.';
  const result=parseStudioResponse({reply,mode:'image',proposal:null,asset,warnings:[warning]});
  return {...result,providerModel:boundedString(data.model,100)};
}
async function readImageJson(response) {
  const limit=21_000_000;
  if(Number(response.headers?.get?.('content-length'))>limit)throw Error('The generated image response is too large.');
  if(!response.body?.getReader)return responseJson(response);
  const reader=response.body.getReader(),chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw Error('The generated image response is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('The image service returned an unreadable response. Please retry.');}
}
function kimiImageError(data,status,language) {
  const zh=language==='zh',messages={
    prompt:['The image service rejected the prompt. Shorten the description and try again.','图片服务拒绝了此描述。请缩短描述后重试。'],
    provider:['The image provider rejected this request. Your artwork is unchanged.','图像提供方拒绝了此请求。现有作品未改变。'],
    rate_limit:['The image service is busy or its account limit has been reached. Wait a moment before trying again.','图像服务繁忙或已达到账户限额。请稍后重试。'],
    image_model_unavailable:['Image generation is not enabled for this connected model or plan. Text assistance is still available.','当前连接的模型或套餐未启用图像生成。文字助手仍可使用。'],
    server_configuration:['Image generation is not configured on the protected server.','受保护服务器尚未配置图像生成。'],
    image_too_large:['The generated image was too large to keep. Request a smaller image.','生成图像过大，无法保存。请请求较小的图像。'],
    size:['The image request is too large. Shorten the description.','图片请求过大。请缩短描述。']
  };
  const detail=boundedString(data?.message,1000)||boundedString(data?.error?.message,1000),code=typeof data?.error==='string'?data.error:typeof data?.code==='string'?data.code:detail;
  if(own(messages,code))return messages[code][zh?1:0];
  if(detail&&!/^[A-Za-z0-9_.:-]+$/.test(detail))return detail;
  const statuses={400:['The image service could not read this request. Please revise the description.','图像服务无法读取此请求。请修改描述。'],401:['The image service needs authorization.','图像服务需要授权。'],403:['This studio is not allowed to use the image service.','此工作室尚未获准使用图像服务。'],404:['The image generation route is unavailable.','图像生成连接不可用。'],413:messages.size,429:messages.rate_limit,503:messages.server_configuration};
  return statuses[status]?.[zh?1:0]||(zh?`图像生成失败（${status}）。现有作品未改变。`:`Image generation failed (${status}). Your artwork is unchanged.`);
}
async function requestKimiImage(project,args,caps,{fetcher,signal,artworkReader}) {
  const target=caps.imageEndpoint;
  if(!validProtectedEndpoint(target)||new URL(target).origin!==new URL(caps.endpoint).origin)throw Error('The image endpoint must belong to the configured protected relay.');
  aborted(signal);
  const response=await fetcher(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(makeKimiImageRequest(project,args)),signal:timeoutSignal(signal,240000)});
  let data;try{data=await readImageJson(response);}catch(error){if(response.ok)throw error;data=null;}
  if(!response.ok)throw Error(kimiImageError(data,response.status,project.language));
  const result=await readKimiImageResponse(data,{artworkReader,signal,language:project.language});
  if(args.imageDataUrl)result.warnings.push(project.language==='zh'?'此连接根据文字生成新图像；现有图像未发送用于编辑。':'This connection generates a new concept from text; the existing image was not sent for editing.');
  return result;
}
export async function getStudioCapabilities({endpoint=studioEndpoint(),fetcher=fetch,signal}={}) {
  if(!validProtectedEndpoint(endpoint))throw Error('Use an HTTPS protected relay URL.');
  const endpointHost=new URL(endpoint).hostname;
  const compatibilityAllowed=[STUDIO_RELAY,PLAN_RELAY,IMAGE_RELAY].includes(endpoint)||(['localhost','127.0.0.1'].includes(endpointHost)&&new URL(endpoint).pathname==='/api/studio');
  let configuredStatus;
  try {
    const r=await fetcher(statusUrl(endpoint),{signal:timeoutSignal(signal,9000),headers:{Accept:'application/json'}}),v=await responseJson(r);
    if(r.ok&&v?.version===2){configuredStatus={...v,text:v.text===true,vision:v.vision===true,imageGeneration:v.imageGeneration===true,imageEditing:v.imageEditing===true,endpoint,mode:'studio'};if(v.text===true||v.vision===true||v.imageGeneration===true||v.imageEditing===true||!compatibilityAllowed)return configuredStatus;}
  }catch(error){if(signal?.aborted)throw error;}
  // Only the known existing relay is a safe automatic compatibility fallback.
  if(!compatibilityAllowed)return {version:2,text:false,vision:false,imageGeneration:false,imageEditing:false,endpoint,mode:'unavailable',status:'The studio relay is unavailable.'};
  try {
    const r=await fetcher('https://6ilmssim2bz2s.kimi.site/api/status',{signal:timeoutSignal(signal,9000)}),v=await responseJson(r);
    if(r.ok&&v?.service==='Shadow Puppet Studio'&&v.configured)return {version:1,text:true,vision:false,imageGeneration:true,imageEditing:false,imageEndpoint:IMAGE_RELAY,drawingPlans:'limited',endpoint:PLAN_RELAY,mode:'drawing-plan',status:'Image generation and the text assistant are connected. Image editing and automatic visual analysis are not connected; use local tools to extract and split generated artwork.'};
  }catch(error){if(signal?.aborted)throw error;}
  return configuredStatus||{version:0,text:false,vision:false,imageGeneration:false,imageEditing:false,endpoint,mode:'unavailable',status:'AI connection unavailable. Import an image or draw parts to continue.'};
}
export async function requestStudioAI(project,args={},options={}) {
  const {fetcher=fetch,endpoint=args.endpoint||studioEndpoint(),signal=args.signal,capabilities=args.capabilities,artworkReader=readArtworkFile}=options;
  const body=makeStudioRequest(project,args.task==='generate-image'?{...args,imageDataUrl:undefined}:args);
  if(body.task==='refine'&&body.selectedPartId&&project.parts.find(p=>p.id===body.selectedPartId)?.locked)throw Error('This part is locked. Unlock it before requesting a revision.');
  if(body.task==='create'&&project.parts.some(p=>p.locked))throw Error('This design contains locked pieces. Use Refine to preserve them, or unlock them before creating a new design.');
  const caps=capabilities||await getStudioCapabilities({endpoint,fetcher,signal});
  const isImage=['generate-image','edit-image'].includes(body.task),needsVision=!!body.imageDataUrl||['analyze','segment'].includes(body.task);
  if(body.task==='generate-image'&&!caps.imageGeneration)throw Error('Image generation is not connected yet. The protected relay needs an image-generation route. You can import your existing artwork now.');
  if(body.task==='edit-image'&&caps.imageEditing!==true)throw Error('Image editing is not connected. This connection can generate new artwork; use the local part controls to adjust the accepted design.');
  if(needsVision&&!isImage&&!caps.vision)throw Error('Image analysis is not connected yet. The protected relay needs multimodal image input. You can trace the imported image manually now.');
  if(!caps.text&&!isImage)throw Error(caps.status||'AI connection is unavailable. Your project is kept on this device.');
  const legacy=caps.mode==='drawing-plan',target=caps.endpoint||endpoint;
  if(!validProtectedEndpoint(target))throw Error('Invalid protected relay URL.');
  if(body.task==='generate-image'&&caps.imageEndpoint)return requestKimiImage(project,args,{...caps,endpoint:target},{fetcher,signal,artworkReader});
  let repair;
  for(let attempt=0;attempt<2;attempt++){
    aborted(signal);
    const attemptArgs={...args,...(repair?{repair}:{})};
    const response=await fetcher(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(legacy?makeDrawingPlanRequest(project,attemptArgs):makeStudioRequest(project,attemptArgs)),signal:timeoutSignal(signal,isImage?240000:60000)});
    const data=await responseJson(response);
    aborted(signal);
    if(!response.ok){const hints={400:'The relay could not read this request.',401:'The protected AI connection needs authorization.',403:'This studio is not allowed by the protected relay.',404:'The updated studio relay route has not been installed.',413:'This image or project is too large for the AI service.',422:'The assistant returned a shape that needs correction. Try a smaller change.',429:'The AI connection is busy. Wait a moment and retry.',503:'This AI capability is not configured on the protected server.'};throw Error(data?.message||hints[response.status]||`AI request failed (${response.status}). Your design is unchanged.`);}
    let result;
    try{result=parseStudioResponse(data,{legacy});}catch(error){if(attempt===0&&!isImage){repair={error:error.message,proposal:null};continue;}throw error;}
    if(body.task==='analyze')result.proposal=null;
    if(body.task==='refine'&&body.selectedPartId&&result.proposal){
      const original=project.parts.find(p=>p.id===body.selectedPartId),patches=(result.proposal.parts||[]).filter(p=>p.id===body.selectedPartId);
      if(!patches.length){result.proposal=null;result.warnings.push('No change to the selected piece was returned. Select the piece by name in your request.');}
      else {result.proposal={parts:patches.map(p=>({...p,assetId:original.assetId}))};result.warnings.push('Only the selected piece is edited. Other pieces keep their shapes and artwork; attached pieces follow their joints.');}
    }
    if(result.proposal){
      const validationBase=body.task==='create'?{...project,parts:[],joints:[],rods:[]}:project;
      try{
        const baseline=normalizeStudioProject(validationBase);
        for(const patch of result.proposal.parts||[]){
          const old=baseline.parts.find(part=>part.id===patch.id);
          if(old&&own(patch,'polygon')&&explicitMirrorRequest(body.prompt))throw Error('A mirrored outline alone leaves the source artwork unchanged. Return transform:{mirror:"horizontal"} or {mirror:"vertical"} for the requested flip, not polygon coordinates. Ask for the direction if unclear.');
          if(old&&baseline.joints.some(joint=>joint.childId===old.id)&&['x','y','rotation'].some(key=>own(patch,key)&&patch[key]!==old[key]))throw Error('This piece is attached to a joint: x, y and rotation do not control its displayed pose. Use the movement control for a joint angle, or transform:{mirror:"horizontal"} / {mirror:"vertical"} for a flip.');
        }
        const preview=applyStudioProposal(validationBase,result.proposal);
        if(body.task==='refine'&&JSON.stringify([preview.parts,preview.joints,preview.rods,preview.brief])===JSON.stringify([baseline.parts,baseline.joints,baseline.rods,baseline.brief])){
          result.proposal=null;result.warnings.push('The returned edit did not change the design. No preview was created.');
        }
      }
      catch(error){if(attempt===0&&!isImage){repair={error:error.message,proposal:result.proposal};continue;}throw Error('The proposed outline still needs correction: '+error.message+' Your existing design is unchanged. Try a simpler outline or trace this piece manually.');}
    }
    if(!result.proposal&&attempt===0&&['create','refine'].includes(body.task)&&!isImage){repair={error:body.task==='refine'?'No editable change to the requested piece was returned. Return the supported edit as JSON parts using its existing id. For a mirror, use transform:{mirror:"horizontal"} or {mirror:"vertical"}, not negative width or axisAngle. Do not claim a change is applied. If the request is ambiguous or unsupported, explain why.':'No editable numeric polygon measurements were returned. Provide the requested outline data if this service supports it; otherwise state that limitation clearly.',proposal:null};continue;}
    if(repair)result.warnings.push('The initial response did not provide a usable edit. One AI repair attempt was made; review this response before accepting.');
    return result;
  }
}
