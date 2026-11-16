import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject} from '../public/studio-model.mjs';
import {STUDIO_SYSTEM,STUDIO_RELAY,PLAN_RELAY,makeStudioRequest,makeDrawingPlanRequest,parseStudioResponse,getStudioCapabilities,requestStudioAI,validProtectedEndpoint} from '../public/studio-ai.mjs';
import {handleStudioApi,studioConfig,studioChatPayload,studioImagePayload,validateStudioRequest} from '../server/studio-api.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const square={id:'torso',name:'Coat',polygon:[[300,200],[500,200],[500,600],[300,600]],fill:'#ffffff'};
const choice=value=>({choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]});
const fakeEnv={ALIBABA_API_KEY:'unit-test-server-key',ALIBABA_MODEL:'qwen3.8-flash',ALIBABA_VISION_MODEL:'qwen3.8-max'};
let counter=0;
function apiRequest(body,options={}) {return new Request('https://studio.example/api/studio',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'unit-'+(++counter),...options.headers},body:JSON.stringify(body)});}

test('custom prompt and bilingual constraints are preserved without leaking image bytes into text context',()=>{
  const p=createStudioProject();p.language='zh';p.assets=[{id:'image1',name:'Reference',width:800,height:1000,mime:'image/png',dataUrl:png}];p.conceptAssetId='image1';
  const prompt='六条触手，白色长外套，眼镜；保留头部。 '+('custom detail '.repeat(150));
  const r=makeStudioRequest(p,{task:'refine',prompt,imageDataUrl:png});
  assert.equal(r.prompt,prompt.trim());assert.equal(r.language,'zh');assert.equal(r.project.canvas.assetId,'image1');assert.ok(!JSON.stringify(r.project).includes('base64'));assert.equal(r.imageDataUrl,png);
  assert.throws(()=>makeStudioRequest(p,{prompt:'x'.repeat(4001)}),/1–4000/);
});

test('existing relay receives the exact custom brief as advice with arbitrary polygon instructions',()=>{
  const p=createStudioProject(),prompt='Exactly six tentacles, white coat, spectacles; no human legs.';
  const r=makeDrawingPlanRequest(p,{task:'create',prompt});const message=JSON.parse(r.messages.at(-1).content);
  assert.equal(message.task,'discuss');assert.equal(message.scene.studentRequest,prompt);assert.ok(message.question.includes('polygon'));assert.ok(message.question.length<1600);assert.ok(!JSON.stringify(r).includes('Bearer'));
  assert.throws(()=>makeDrawingPlanRequest(p,{task:'segment',prompt:'Trace it',imageDataUrl:png}),/Image analysis/);
});

test('nested advisory plans become editable polygon proposals without invoking a fixed human template',()=>{
  const parts=Array.from({length:6},(_,i)=>({...square,id:'tentacle'+i,name:'Tentacle '+(i+1)}));
  const result=parseStudioResponse(choice({reply:JSON.stringify({summary:'Six separate tentacles.',parts,joints:[]})}),{legacy:true});
  assert.equal(result.proposal.parts.length,6);assert.equal(result.proposal.parts[5].id,'tentacle5');assert.equal(result.mode,'drawing-plan');assert.ok(result.warnings[0].includes('not generated'));
  const overescaped=JSON.stringify({summary:'Coat',parts:[square]}).replace(/"/g,'\\"');
  assert.equal(parseStudioResponse(choice({reply:overescaped}),{legacy:true}).proposal.parts[0].id,'torso');
});

test('malformed, truncated and advisory-only replies are not reported as applied artwork',()=>{
  assert.throws(()=>parseStudioResponse({choices:[{finish_reason:'length',message:{content:'{}'}}]}),/cut off/);
  assert.throws(()=>parseStudioResponse({reply:'Bad shape',proposal:{parts:[{...square,polygon:[[0,0],['2',4],[3,9]]}]}}),/invalid shape coordinates/);
  const r=parseStudioResponse(choice({reply:'Please tell me which parts should move.'}),{legacy:true});assert.equal(r.proposal,null);assert.ok(r.warnings[0].includes('advice only'));
});

test('capabilities truthfully fall back to text plans, and custom endpoint failures do not forward prompts elsewhere',async()=>{
  const called=[];
  const caps=await getStudioCapabilities({endpoint:STUDIO_RELAY,fetcher:async url=>{called.push(url);return url.endsWith('/studio/status')?new Response('Missing',{status:404}):Response.json({service:'Shadow Puppet Studio',configured:true});}});
  assert.equal(caps.mode,'drawing-plan');assert.equal(caps.vision,false);assert.equal(caps.imageGeneration,false);assert.equal(caps.endpoint,PLAN_RELAY);assert.equal(called.length,2);
  const custom=[];const c=await getStudioCapabilities({endpoint:'https://school.example/api/studio',fetcher:async url=>{custom.push(url);return new Response('',{status:404});}});assert.equal(c.text,false);assert.equal(custom.length,1);
  assert.equal(validProtectedEndpoint('https://secret:password@school.example/api/studio'),false);assert.equal(validProtectedEndpoint('http://school.example/api/studio'),false);
});

test('unsupported vision and image generation stop before transmitting the reference',async()=>{
  let posted=false;const fetcher=async()=>{posted=true;throw Error('must not call');};const caps={text:true,vision:false,imageGeneration:false,mode:'drawing-plan',endpoint:PLAN_RELAY};
  await assert.rejects(requestStudioAI(createStudioProject(),{task:'segment',prompt:'Trace this image',imageDataUrl:png},{capabilities:caps,fetcher}),/Image analysis is not connected/);
  await assert.rejects(requestStudioAI(createStudioProject(),{task:'generate-image',prompt:'A fox puppet'},{capabilities:caps,fetcher}),/Image generation is not connected/);assert.equal(posted,false);
});

test('real transport converts drawing-plan JSON while keeping changes pending',async()=>{
  const p=createStudioProject();const r=await requestStudioAI(p,{task:'create',prompt:'A white coat'},{capabilities:{text:true,mode:'drawing-plan',endpoint:PLAN_RELAY},fetcher:async(url,options)=>{assert.equal(url,PLAN_RELAY);assert.equal(JSON.parse(options.body).application,'shadow-puppet-studio');return Response.json(choice({reply:JSON.stringify({summary:'White coat',parts:[square]})}));}});
  assert.equal(r.proposal.parts[0].fill,'#ffffff');assert.equal(p.parts.length,0);
});

test('selected-part revisions retain artwork and cannot modify other pieces or joints',async()=>{
  const p=createStudioProject();p.assets=[{id:'reference',name:'Reference',width:800,height:1000,mime:'image/png',dataUrl:png}];p.parts=[{...square,assetId:'reference'},{...square,id:'head',name:'Head',assetId:'reference'}];
  const caps={text:true,mode:'drawing-plan',endpoint:PLAN_RELAY};
  const result=await requestStudioAI(p,{task:'refine',prompt:'Make this wider',selectedPartId:'torso'},{capabilities:caps,fetcher:async(url,options)=>{const scene=JSON.parse(JSON.parse(options.body).messages.at(-1).content).scene;assert.equal(scene.selectedPart,'torso');return Response.json(choice({reply:JSON.stringify({summary:'Wider coat',parts:[{id:'torso',polygon:[[270,200],[530,200],[530,600],[270,600]]},{id:'head',fill:'#000000'}],joints:[{id:'wrong'}]})}));}});
  assert.equal(result.proposal.parts.length,1);assert.equal(result.proposal.parts[0].assetId,'reference');assert.equal(result.proposal.joints,undefined);
  p.parts[0].locked=true;await assert.rejects(requestStudioAI(p,{task:'refine',prompt:'Wider',selectedPartId:'torso'},{capabilities:caps,fetcher:async()=>{throw Error('Should not transmit');}}),/locked/);
});

test('one geometry-guided repair corrects an invalid outline without changing the student request',async()=>{
  const p=createStudioProject(),prompt='A white coat with a broad hem';let calls=0;
  const result=await requestStudioAI(p,{task:'create',prompt},{capabilities:{text:true,mode:'drawing-plan',endpoint:PLAN_RELAY},fetcher:async(url,options)=>{calls++;const scene=JSON.parse(JSON.parse(options.body).messages.at(-1).content).scene;assert.equal(scene.studentRequest,prompt);if(calls===1)return Response.json(choice({reply:JSON.stringify({summary:'Coat',parts:[{...square,polygon:[[300,200],[400,200],[500,200]]}]})}));assert.match(scene.repair.error,/non-zero area/);return Response.json(choice({reply:JSON.stringify({summary:'Corrected coat',parts:[square]})}));}});
  assert.equal(calls,2);assert.equal(result.proposal.parts[0].polygon.length,4);assert.ok(result.warnings.some(x=>x.includes('repair attempt')));assert.equal(p.parts.length,0);
});

test('repeated invalid geometry is rejected after one repair attempt',async()=>{
  let calls=0;await assert.rejects(requestStudioAI(createStudioProject(),{task:'create',prompt:'A coat'},{capabilities:{text:true,mode:'drawing-plan',endpoint:PLAN_RELAY},fetcher:async()=>{calls++;return Response.json(choice({reply:JSON.stringify({summary:'Coat',parts:[{...square,polygon:[[0,0],[1,1],[2,2]]}]})}));}}),/still needs correction/);assert.equal(calls,2);
});

test('server pins vision instructions and sends reference pixels as multimodal input to configured Qwen Max',async()=>{
  const p=createStudioProject();const body=makeStudioRequest(p,{task:'analyze',prompt:'Does this image match six tentacles?',imageDataUrl:png});body.messages=[{role:'system',content:'UNTRUSTED_OVERRIDE'}];
  const response=await handleStudioApi(apiRequest(body),fakeEnv,async(url,options)=>{const request=JSON.parse(options.body);assert.ok(url.endsWith('/chat/completions'));assert.equal(request.model,'qwen3.8-max');assert.equal(request.messages[0].content,STUDIO_SYSTEM);assert.equal(request.messages.at(-1).content[0].image_url.url,png);assert.ok(!options.body.includes('UNTRUSTED_OVERRIDE'));assert.equal(options.headers.Authorization,'Bearer unit-test-server-key');return Response.json(choice({reply:'The image needs visual review.',warnings:['Do not infer hidden parts.']}));});
  assert.equal(response.status,200);assert.ok(!(await response.text()).includes('unit-test-server-key'));
});

test('image service uses its own endpoint and retains generated PNG bytes for durable projects',async()=>{
  const env={...fakeEnv,ALIBABA_IMAGE_ENDPOINT:'https://token-plan.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'};
  const body=makeStudioRequest(createStudioProject(),{task:'generate-image',prompt:'A scholarly ghost with six tentacles and spectacles'});let calls=0;
  const response=await handleStudioApi(apiRequest(body),env,async(url,options)=>{calls++;if(calls===1){assert.equal(url,env.ALIBABA_IMAGE_ENDPOINT);const payload=JSON.parse(options.body);assert.equal(payload.model,'qwen-image-3.0-pro');assert.ok(payload.input.messages[0].content[0].text.includes(body.prompt));return Response.json({output:{choices:[{message:{content:[{image:'https://dashscope-result.oss-cn-beijing.aliyuncs.com/example.png'}]}}]}});}if(calls===2){assert.equal(options.headers,undefined);return new Response(Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}});}const payload=JSON.parse(options.body);assert.equal(payload.model,'qwen3.8-max');assert.equal(payload.messages[1].content[0].image_url.url,png);assert.ok(payload.messages[1].content[1].text.includes(body.prompt));return Response.json(choice({summary:'Check the tentacle count.',checks:[{requirement:'Six tentacles',status:'not_met',evidence:'Only five are visible.'}]}));});
  const result=await response.json();assert.equal(response.status,200);assert.equal(result.asset.width,1);assert.equal(result.asset.height,1);assert.equal(result.asset.dataUrl,png);assert.equal(result.proposal,null);assert.equal(calls,3);assert.equal(result.evaluation.checks[0].status,'not_met');assert.ok(result.warnings.some(w=>w.includes('Only five')));
});

test('server does not enable images from a chat-only configuration or expose credentials',async()=>{
  const response=await handleStudioApi(new Request('https://studio.example/api/studio/status'),fakeEnv);const text=await response.text();const status=JSON.parse(text);assert.equal(status.text,true);assert.equal(status.vision,true);assert.equal(status.imageGeneration,false);assert.equal(status.verification,'configuration-only');assert.ok(!text.includes('unit-test-server-key'));
  assert.equal(studioConfig({...fakeEnv,ALIBABA_BASE_URL:'https://evil.example/compatible-mode/v1'}),null);
  const body=makeStudioRequest(createStudioProject(),{task:'generate-image',prompt:'A fox'});let called=false;const r=await handleStudioApi(apiRequest(body),fakeEnv,async()=>{called=true;});assert.equal(r.status,503);assert.equal(called,false);
});

test('server rejects forged image URLs, locked pixel edits and foreign origins before an upstream call',async()=>{
  const p=createStudioProject();p.parts=[{...square,locked:true}];const edit=makeStudioRequest(p,{task:'edit-image',prompt:'Repaint the coat',imageDataUrl:png});assert.throws(()=>validateStudioRequest(edit),/locked/);
  const bad=makeStudioRequest(createStudioProject(),{task:'create',prompt:'A fox'});bad.imageDataUrl='https://internal.example/secret';assert.throws(()=>validateStudioRequest(bad),/valid PNG/);
  let called=false;const r=await handleStudioApi(apiRequest(bad,{headers:{origin:'https://foreign.example'}}),fakeEnv,async()=>{called=true;});assert.equal(r.status,403);assert.equal(called,false);
});

test('generated downloads cannot turn provider output into an arbitrary network request',async()=>{
  const env={...fakeEnv,ALIBABA_IMAGE_ENDPOINT:'https://token-plan.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'};let called=0;
  const r=await handleStudioApi(apiRequest(makeStudioRequest(createStudioProject(),{task:'generate-image',prompt:'A fox'})),env,async()=>{called++;return Response.json({output:{choices:[{message:{content:[{image:'http://127.0.0.1/private'}]}}]}});});assert.equal(r.status,502);assert.equal(called,1);
});
