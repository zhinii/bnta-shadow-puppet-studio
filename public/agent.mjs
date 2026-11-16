import {normalizeCharacter,PART_IDS} from './model.mjs';
// Reused transport from zhinii/bnta-robotics/six-axis-agent/agent.mjs.
// This is the protected Kimi-hosted relay, not a browser-held API key.
export const RELAY='https://s52xzsn2ztf64.kimi.site/api/chat';
export const PUPPET_SYSTEM=`You are a bilingual Chinese shadow-puppet design collaborator for school students. The application is a component-based VECTOR design studio, not a robot controller. Speak in the requested language (en or zh). Be concise, helpful and honest about limits. Use the supplied character, story and selected part. Never claim physical fabrication, testing or cultural authenticity has been verified. Traditional-inspired templates are contemporary educational interpretations. Student choices are authoritative. Do not invent cultural symbolism as fact.
Return one JSON object only. For task design: {"reply":"short explanation of proposed changes","design":{...changed fields only}}. Allowed design fields: name, role, brief, action (strings), age (child|teen|adult|elder), gender (female|male|unspecified), hair (bun|short|long|cap), clothing (robe|tunic|jacket), pattern (floral|cloud|geometric|plain), primary, secondary, accent, skin, hairColor (six-digit hex colors). parts is an object keyed only by ${PART_IDS.join(', ')}; each patch can contain width 0.65..1.5, length 0.7..1.3 and angle -150..150. Respect locked part dimensions. If selectedPart is set, ONLY change that part's dimensions or angle and explain what is possible; do not change global colors or add props. Accessories are an optional full array, maximum 8: {type:fan|letter|lantern|sword|bag,parent:one part ID,x:-180..180,y:-180..220,scale:0.4..2,angle:-180..180,color:hex}. Preserve existing props unless asked to remove them. A hand prop normally attaches to forearmFront at x:0,y:80. If the student requests unsupported custom imagery, explain the current vector controls and suggest sketching decorations rather than claiming to generate a bitmap.
For task story: {"reply":"brief introduction","story":{"title":"title","script":"continuous performable dialogue with brief movement and prop cues"},"characters":[{"name":"name","role":"role","brief":"visible appearance","action":"required gesture"}]}. Limit characters to 6 and script to 9000 characters. Fit the requested duration, give each character useful participation, and retain the student's setting/theme. For task extract: return {"reply":"brief","characters":[same fields]}; preserve existing script and extract only characters present. For task discuss: return {"reply":"concise advice or a clarifying question"}. Do not output robot actions, secrets, HTML, executable code or raw SVG. Student accepts proposals before they are applied. Never say the design was changed already.`;
export function requestBody({task,question,language,character,story,selectedPart,history=[]}){
 const scene={objects:[],application:'shadow-puppet-studio',task,character,story,selectedPart};
 return {application:'shadow-puppet-studio',model:'qwen3.8-flash',messages:[{role:'system',content:PUPPET_SYSTEM},...history.slice(-4).filter(m=>['user','assistant'].includes(m.role)).map(m=>({role:m.role,content:String(m.content).slice(0,1600)})),{role:'user',content:JSON.stringify({question:question.slice(0,1600),language,task,scene})}],temperature:.6,max_tokens:3500,response_format:{type:'json_object'},stream:false,enable_thinking:false};
}
export function parseResponse(data){
 const choice=data?.choices?.[0];if(choice?.finish_reason==='length')throw Error('The reply was cut off. Try a shorter request. / 回复过长，请缩短要求。');
 const raw=choice?.message?.content;if(typeof raw!=='string'||raw.length>30000)throw Error('The relay returned an unexpected response. / 服务返回格式异常。');
 let v;try{v=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw Error('The assistant did not return a valid design. Please retry. / 请重试。');}
 if(!v||typeof v.reply!=='string'||v.reply.length>3000)throw Error('Invalid assistant response.');
 if(Array.isArray(v.actions)&&!v.design&&!v.story&&!v.characters)throw Error('This relay is still using robot-only instructions. Install the puppet relay route included in this project. / 当前服务仍使用机器人指令，需要部署皮影专用接口。');
 const result={reply:v.reply};
 if(v.design&&typeof v.design==='object'&&!Array.isArray(v.design))result.design=v.design;
 if(v.story&&typeof v.story.script==='string')result.story={title:String(v.story.title||'').slice(0,120),script:v.story.script.slice(0,18000)};
 if(Array.isArray(v.characters))result.characters=v.characters.slice(0,6).map(x=>normalizeCharacter(x));
 return result;
}
export async function askAssistant(args,{signal,fetcher=fetch,endpoint=RELAY}={}){
 const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody(args)),signal});
 if(!response.ok){const hints={400:'The relay does not accept this puppet request yet.',401:'The protected connection needs authorization.',403:'This app origin is not allowed by the protected relay.',404:'The relay route is unavailable.',429:'The AI connection is busy. Wait a moment and retry.',503:'The server AI connection is not configured.'};throw Error(hints[response.status]||`AI connection failed (${response.status}). Your design is saved.`);}
 return parseResponse(await response.json());
}
