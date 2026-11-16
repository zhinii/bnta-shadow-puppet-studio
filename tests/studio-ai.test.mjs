import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,normalizeStudioProject,applyStudioProposal,boundsOf} from '../public/studio-model.mjs';
import {STUDIO_SYSTEM,STUDIO_RELAY,PLAN_RELAY,IMAGE_RELAY,IMAGE_PRODUCTION_RULES,KIMI_IMAGE_PROMPT_LIMIT,getKimiImagePromptLimit,makeImageGenerationPrompt,makeStudioRequest,makeDrawingPlanRequest,makeKimiImageRequest,readKimiImageResponse,parseStudioResponse,getStudioCapabilities,requestStudioAI,validProtectedEndpoint} from '../public/studio-ai.mjs';
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

test('AI context retains resized artwork coordinates and dimensions without sending image bytes',()=>{
  const p=createStudioProject();p.canvas={width:640,height:480};
  p.parts=[{...square,artworkMatrix:[1.25,0,0,1.5,-50,-100],parameters:{width:1.25,length:1.5,axisAngle:30,origin:[400,200]}}];
  const body=makeStudioRequest(p,{task:'refine',prompt:'Make this sleeve 20% longer',selectedPartId:'torso'});
  assert.deepEqual(body.project.canvas,{width:640,height:480});
  assert.deepEqual(body.project.parts[0].artworkMatrix,p.parts[0].artworkMatrix);
  assert.deepEqual(body.project.parts[0].parameters,p.parts[0].parameters);
  body.project.parts[0].parameters.origin[0]=0;body.project.parts[0].artworkMatrix[0]=99;
  assert.equal(p.parts[0].parameters.origin[0],400);assert.equal(p.parts[0].artworkMatrix[0],1.25);
  assert.match(STUDIO_SYSTEM,/current parameters.length multiplied by 1.2/);
  assert.match(STUDIO_SYSTEM,/artworkMatrix.*read-only/);
});

test('AI dimension patches are bounded and cannot rewrite artwork mapping or combine geometric edits',()=>{
  const response=parameters=>({reply:'Review this resized sleeve.',proposal:{parts:[{id:'sleeve',parameters}]}});
  assert.deepEqual(parseStudioResponse(response({width:1.2,length:.75})).proposal.parts[0].parameters,{width:1.2,length:.75});
  for(const parameters of [{width:'1.2'},{width:0},{length:5},{width:NaN},{axisAngle:90},{origin:[0,0]},{}])assert.throws(()=>parseStudioResponse(response(parameters)),/dimensions|parameters|protected/);
  assert.throws(()=>parseStudioResponse({reply:'Move art.',proposal:{parts:[{id:'sleeve',artworkMatrix:[2,0,0,2,0,0]}]}}),/alignment is calculated/);
  assert.throws(()=>parseStudioResponse({reply:'Both edits.',proposal:{parts:[{...square,parameters:{width:1.2}}]}}),/either dimension parameters/);
});

test('a selected parametric proposal resizes its source artwork through the model and keeps siblings untouched',async()=>{
  const p=createStudioProject();p.assets=[{id:'reference',name:'Reference',width:800,height:1000,mime:'image/png',dataUrl:png}];
  p.parts=[{...square,assetId:'reference'},{...square,id:'head',name:'Head',assetId:'reference'}];
  const before=normalizeStudioProject(p);const snapshot=structuredClone(before);
  const result=await requestStudioAI(before,{task:'refine',prompt:'Make this piece 20% wider; preserve its printed artwork.',selectedPartId:'torso'},{capabilities:{text:true,mode:'studio',endpoint:STUDIO_RELAY},fetcher:async(url,options)=>{
    const sent=JSON.parse(options.body);assert.equal(sent.project.parts[0].parameters.width,1);assert.deepEqual(sent.project.parts[0].artworkMatrix,[1,0,0,1,0,0]);
    return Response.json({reply:'Review a 20% wider coat.',proposal:{parts:[{id:'torso',parameters:{width:1.2}},{id:'head',parameters:{width:2}}]}});
  }});
  const after=applyStudioProposal(before,result.proposal);const resized=after.parts.find(part=>part.id==='torso');
  assert.equal(result.proposal.parts.length,1);assert.equal(resized.parameters.width,1.2);assert.equal(resized.assetId,'reference');
  assert.ok(Math.abs(boundsOf(resized.polygon).width-240)<1e-6);assert.ok(Math.abs(resized.artworkMatrix[0]-1.2)<1e-6);
  assert.deepEqual(after.parts.find(part=>part.id==='head'),before.parts.find(part=>part.id==='head'));
  assert.deepEqual(before,snapshot,'request and proposal validation never mutate the accepted project');
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
  assert.equal(caps.mode,'drawing-plan');assert.equal(caps.vision,false);assert.equal(caps.imageGeneration,true);assert.equal(caps.imageEditing,false);assert.equal(caps.imageEndpoint,IMAGE_RELAY);assert.equal(caps.endpoint,PLAN_RELAY);assert.equal(called.length,2);
  const custom=[];const c=await getStudioCapabilities({endpoint:'https://school.example/api/studio',fetcher:async url=>{custom.push(url);return new Response('',{status:404});}});assert.equal(c.text,false);assert.equal(custom.length,1);
  assert.equal(validProtectedEndpoint('https://secret:password@school.example/api/studio'),false);assert.equal(validProtectedEndpoint('http://school.example/api/studio'),false);
});

test('unsupported vision and image generation stop before transmitting the reference',async()=>{
  let posted=false;const fetcher=async()=>{posted=true;throw Error('must not call');};const caps={text:true,vision:false,imageGeneration:false,mode:'drawing-plan',endpoint:PLAN_RELAY};
  await assert.rejects(requestStudioAI(createStudioProject(),{task:'segment',prompt:'Trace this image',imageDataUrl:png},{capabilities:caps,fetcher}),/Image analysis is not connected/);
  await assert.rejects(requestStudioAI(createStudioProject(),{task:'generate-image',prompt:'A fox puppet'},{capabilities:caps,fetcher}),error=>{assert.match(error.message,/Image generation is not connected/);assert.match(error.message,/image-generation route/);assert.doesNotMatch(error.message,/Qwen/);return true;});assert.equal(posted,false);
});

test('generation capabilities do not silently enable image editing or cross-host fallback',async()=>{
  const calls=[];const caps=await getStudioCapabilities({endpoint:'https://school.example/api/studio',fetcher:async url=>{calls.push(url);return Response.json({version:2,text:true,vision:false,imageGeneration:true});}});
  assert.equal(caps.imageGeneration,true);assert.equal(caps.imageEditing,false);assert.equal(caps.imageEndpoint,undefined);assert.deepEqual(calls,['https://school.example/api/studio/status']);
  let posted=false;await assert.rejects(requestStudioAI(createStudioProject(),{task:'edit-image',prompt:'Change the face',imageDataUrl:png},{capabilities:caps,fetcher:async()=>{posted=true;throw Error('Must not post');}}),/Image editing is not connected/);assert.equal(posted,false);
  await assert.rejects(requestStudioAI(createStudioProject(),{task:'generate-image',prompt:'A fox'},{capabilities:{...caps,imageEndpoint:IMAGE_RELAY},fetcher:async()=>{posted=true;throw Error('Must not post');}}),/configured protected relay/);assert.equal(posted,false);
});

test('an explicit editing capability is independent of image generation',async()=>{
  let calls=0;const caps=await getStudioCapabilities({endpoint:STUDIO_RELAY,fetcher:async()=>{calls++;return Response.json({version:2,text:false,vision:false,imageGeneration:false,imageEditing:true});}});
  assert.equal(calls,1);assert.equal(caps.mode,'studio');assert.equal(caps.imageGeneration,false);assert.equal(caps.imageEditing,true);
  const result=await requestStudioAI(createStudioProject(),{task:'edit-image',prompt:'Make the coat blue',imageDataUrl:png},{capabilities:caps,fetcher:async(url,options)=>{calls++;assert.equal(url,STUDIO_RELAY);assert.equal(JSON.parse(options.body).imageDataUrl,png);return Response.json({reply:'Review the blue coat.',mode:'image',proposal:null,asset:{id:'edited-art',name:'Coat',mime:'image/png',dataUrl:png,width:1,height:1}});}});
  assert.equal(calls,2);assert.equal(result.asset.id,'edited-art');
});

test('Kimi generation keeps the exact student prompt and selected presets without sending the project or reference image',()=>{
  const p=createStudioProject();p.brief={kind:'creature',era:'imagined',style:'paper-cut',action:'wave',keywords:'Do not duplicate this stale text'};
  const snapshot=structuredClone(p);
  const prompt='  Six tentacles; keep my blue-and-gold pattern.\nSeparate every appendage.  ';
  const body=makeKimiImageRequest(p,{prompt,imageDataUrl:png,history:[{role:'user',content:'private earlier request'}]});
  assert.deepEqual(Object.keys(body).sort(),['application','kind','prompt']);assert.equal(body.kind,'reference');assert.equal(body.application,'shadow-puppet-studio');
  assert.ok(body.prompt.endsWith(prompt));assert.match(body.prompt,/Character type: creature/);assert.match(body.prompt,/World \/ era: imagined/);assert.match(body.prompt,/Visual style: paper-cut/);assert.match(body.prompt,/Movement \/ action: wave/);
  assert.ok(!JSON.stringify(body).includes('base64'));assert.ok(!JSON.stringify(body).includes('private'));assert.ok(!body.prompt.includes('stale'));
  assert.match(body.prompt,/^Production defaults \(explicit student requests override\):/);assert.equal(body.prompt.split('Student prompt (verbatim):\n')[1],prompt);assert.deepEqual(p,snapshot);
  const noSettings=makeKimiImageRequest(createStudioProject(),{prompt}).prompt;assert.ok(noSettings.endsWith('Student prompt (verbatim):\n'+prompt));assert.ok(noSettings.length<=800);
});

test('both generation providers share production defaults while preserving Chinese requests and costume detail',()=>{
  const p=createStudioProject();p.language='zh';p.brief={kind:'动物',era:'历史',style:'传统皮影',action:'奔跑'};
  const prompt='  一匹蓝金色奔马，保留马鞍上的星星纹样、刺绣和汉字。\n请明确加入红色边框及题字“马到成功”，不要改变纹身。  ';
  const snapshot=structuredClone(p),kimi=makeKimiImageRequest(p,{prompt});
  const request=makeStudioRequest(p,{task:'generate-image',prompt});assert.equal(request.prompt,prompt);
  const input=validateStudioRequest(request),payload=studioImagePayload(input,{imageModel:'test-image-model'});
  const providerPrompt=payload.input.messages[0].content.find(item=>item.text).text;
  assert.equal(providerPrompt,makeImageGenerationPrompt(p,prompt));assert.equal(providerPrompt.split('Student prompt (verbatim):\n')[1],prompt);
  assert.equal(kimi.prompt.split('Student prompt (verbatim):\n')[1],prompt);assert.ok(kimi.prompt.length<=800);assert.match(kimi.prompt,/explicit student requests override/);assert.match(kimi.prompt,/costume lettering, tattoos and motifs/);
  assert.match(providerPrompt,/Character type: 动物/);assert.match(providerPrompt,/World \/ era: 历史/);assert.match(providerPrompt,/Visual style: 传统皮影/);assert.match(providerPrompt,/Movement \/ action: 奔跑/);
  assert.match(IMAGE_PRODUCTION_RULES,/Explicit student requests take precedence/);
  assert.match(IMAGE_PRODUCTION_RULES,/flat plain white background/);assert.match(IMAGE_PRODUCTION_RULES,/only explicitly requested props/);
  assert.match(IMAGE_PRODUCTION_RULES,/text, calligraphy, signatures, watermarks, borders, floating stars, ground decoration/);
  assert.match(IMAGE_PRODUCTION_RULES,/preserve legitimate character and costume details, lettering, tattoos, patterns, embroidery and motifs/);
  assert.match(IMAGE_PRODUCTION_RULES,/simulated mechanical pinhole dots, joint circles, hinge marks, diagram labels or cutting lines unless explicitly requested/);
  assert.match(IMAGE_PRODUCTION_RULES,/single complete full-body character/);assert.match(IMAGE_PRODUCTION_RULES,/detached parts sheet unless requested/);assert.deepEqual(p,snapshot);
});

test('generation preserves the full input limit without adding its policy to text or edit requests',()=>{
  const p=createStudioProject(),prompt='  '+('自定义花纹'.repeat(799))+'   ';
  assert.equal(prompt.length,4000);
  const body=makeStudioRequest(p,{task:'generate-image',prompt}),input=validateStudioRequest(body);
  assert.equal(input.prompt,prompt);assert.ok(makeImageGenerationPrompt(p,prompt).endsWith(prompt));
  assert.throws(()=>makeKimiImageRequest(p,{prompt}),/800 characters.*4000/);
  for(const task of ['create','refine','analyze','segment','edit-image']){
    const request=makeStudioRequest(p,{task,prompt:'  Keep this request unchanged.  '});assert.equal(request.prompt,'Keep this request unchanged.');
    assert.doesNotMatch(JSON.stringify(request),/Production rules for editable shadow-puppet artwork/);
    if(task!=='edit-image')assert.doesNotMatch(JSON.stringify(studioChatPayload(request,{model:'test-chat',visionModel:'test-vision'})),/Production rules for editable shadow-puppet artwork/);
  }
});

test('legacy image budget preserves 800 characters exactly and rejects 801 before posting',async()=>{
  const p=createStudioProject(),caps={imageGeneration:true,mode:'drawing-plan',endpoint:PLAN_RELAY,imageEndpoint:IMAGE_RELAY};
  assert.equal(KIMI_IMAGE_PROMPT_LIMIT,800);assert.equal(getKimiImagePromptLimit(p),800);
  const prompt='x'.repeat(800);assert.equal(makeKimiImageRequest(p,{prompt}).prompt,prompt);
  let calls=0;await assert.rejects(requestStudioAI(p,{task:'generate-image',prompt:prompt+'x'},{capabilities:caps,fetcher:async()=>{calls++;throw Error('Must not post');}}),error=>{assert.match(error.message,/800 characters/);assert.match(error.message,/uses 801/);assert.match(error.message,/at least 1 characters/);assert.match(error.message,/Nothing was truncated/);return true;});assert.equal(calls,0);
});

test('legacy budget reserves every selected preset and localizes oversized requests without truncation',async()=>{
  const p=createStudioProject();p.language='zh';p.brief={kind:'动物',era:'现代',style:'传统皮影',action:'招手'};
  const snapshot=structuredClone(p),limit=getKimiImagePromptLimit(p),prompt='熊'.repeat(limit),body=makeKimiImageRequest(p,{prompt});
  assert.ok(limit>0&&limit<800);assert.equal(body.prompt.length,800);assert.ok(body.prompt.endsWith(prompt));assert.doesNotMatch(body.prompt,/Production defaults/);
  for(const value of Object.values(p.brief))assert.ok(body.prompt.includes(value));assert.deepEqual(p,snapshot);
  let posted=false;await assert.rejects(requestStudioAI(p,{task:'generate-image',prompt:prompt+'熊'},{capabilities:{imageGeneration:true,endpoint:PLAN_RELAY,imageEndpoint:IMAGE_RELAY},fetcher:async()=>{posted=true;}}),error=>{assert.match(error.message,/801/);assert.ok(error.message.includes('原文未被截断'));assert.ok(error.message.includes('所选设置'));return true;});assert.equal(posted,false);
  p.brief.style='pattern'.repeat(160);assert.equal(getKimiImagePromptLimit(p),0);assert.throws(()=>makeKimiImageRequest(p,{prompt:'熊猫'}),/所选设置/);
});

test('panda generation succeeds against a relay double enforcing the entire 800-character payload budget',async()=>{
  for(const brief of [{},{kind:'animal',era:'modern',style:'traditional',action:'wave'}]){
    const p=createStudioProject();p.brief=brief;const prompt='A panda wearing a birthday party hat.';let calls=0;
    const result=await requestStudioAI(p,{task:'generate-image',prompt},{capabilities:{imageGeneration:true,mode:'drawing-plan',endpoint:PLAN_RELAY,imageEndpoint:IMAGE_RELAY},fetcher:async(url,options)=>{
      calls++;const body=JSON.parse(options.body);assert.equal(url,IMAGE_RELAY);assert.ok(body.prompt.endsWith(prompt));for(const value of Object.values(brief))assert.ok(body.prompt.includes(value));
      return body.prompt.length>800?Response.json({error:'prompt'},{status:400}):Response.json({dataUrl:png,model:'test-image-model'});
    },artworkReader:async()=>({id:'panda',name:'Panda',mime:'image/png',dataUrl:png,width:1,height:1})});
    assert.equal(calls,1);assert.equal(result.asset.id,'panda');assert.equal(result.proposal,null);
  }
});

test('the verified Kimi image route is called once and its dimensionless result becomes a bounded portable asset',async()=>{
  const p=createStudioProject(),snapshot=structuredClone(p);let calls=0,reads=0;
  const result=await requestStudioAI(p,{task:'generate-image',prompt:'A modern footballer',imageDataUrl:png},{capabilities:{text:true,vision:false,imageGeneration:true,imageEditing:false,mode:'drawing-plan',endpoint:PLAN_RELAY,imageEndpoint:IMAGE_RELAY},fetcher:async(url,options)=>{
    calls++;assert.equal(url,IMAGE_RELAY);const sent=JSON.parse(options.body);assert.equal(sent.application,'shadow-puppet-studio');assert.equal(sent.kind,'reference');assert.ok(sent.prompt.endsWith('A modern footballer'));assert.ok(sent.prompt.length<=800);
    assert.ok(options.signal instanceof AbortSignal);return Response.json({dataUrl:png,model:'wan2.7-image-pro',kind:'reference'});
  },artworkReader:async(file,options)=>{
    reads++;assert.equal(file.type,'image/png');assert.deepEqual(options,{maxDimension:1600,maxBytes:15_000_000});assert.equal(new Uint8Array(await file.arrayBuffer())[0],137);
    return {id:'new-art',name:file.name,mime:'image/png',dataUrl:png,width:1600,height:900};
  }});
  assert.equal(calls,1);assert.equal(reads,1);assert.equal(result.mode,'image');assert.equal(result.proposal,null);assert.equal(result.asset.width,1600);assert.equal(result.asset.height,900);assert.equal(result.providerModel,'wan2.7-image-pro');assert.ok(result.warnings.some(w=>w.includes('not sent')));assert.deepEqual(p,snapshot);
  for(const requirement of ['anatomy','appendage count','costume','props'])assert.ok(result.reply.includes(requirement));
  assert.ok(result.warnings.some(w=>w.includes('not been visually verified')));assert.equal(result.evaluation,undefined);
});

test('Chinese generation results invite visual review without claiming prompt compliance',async()=>{
  const p=createStudioProject();p.language='zh';let calls=0;
  const result=await requestStudioAI(p,{task:'generate-image',prompt:'六条触手，白大褂和眼镜',imageDataUrl:png},{capabilities:{imageGeneration:true,imageEditing:false,mode:'drawing-plan',endpoint:PLAN_RELAY,imageEndpoint:IMAGE_RELAY},fetcher:async()=>{calls++;return Response.json({dataUrl:png,model:'wan2.7-image-pro'});},artworkReader:async()=>({id:'generated',name:'Artwork',mime:'image/png',dataUrl:png,width:1,height:1})});
  assert.equal(calls,1);assert.equal(result.proposal,null);assert.equal(result.evaluation,undefined);
  for(const requirement of ['接受前','角色形态','肢体数量','服装','道具'])assert.ok(result.reply.includes(requirement));
  assert.ok(result.warnings.some(w=>w.includes('尚未经过视觉核验')));assert.ok(result.warnings.some(w=>w.includes('现有图像未发送')));
  assert.doesNotMatch(result.reply+result.warnings.join(' '),/This image|This connection|Before accepting/);
});

test('generated images use the existing browser decoder and are resized before being saved',async()=>{
  const previous={document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};let closed=false,drawn;
  globalThis.createImageBitmap=async blob=>{assert.equal(blob.type,'image/png');return {width:3840,height:2160,close(){closed=true;}};};
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext(){return {drawImage(...args){drawn=args.slice(1);}};},toDataURL(type){assert.equal(type,'image/png');return png;}};}};
  try{const result=await readKimiImageResponse({dataUrl:png,model:'wan2.7-image-pro',kind:'reference'});assert.equal(result.asset.width,1600);assert.equal(result.asset.height,900);assert.deepEqual(drawn,[0,0,1600,900]);assert.equal(closed,true);}
  finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('invalid image payloads and provider errors never trigger a second generation call',async()=>{
  const caps={text:true,imageGeneration:true,imageEditing:false,mode:'drawing-plan',endpoint:PLAN_RELAY,imageEndpoint:IMAGE_RELAY};
  for(const [response,expected]of [[()=>Response.json({dataUrl:'https://provider.example/temporary.png'}),/portable/],[()=>Response.json({dataUrl:'data:image/png;base64,SGVsbG8='}),/contents match/],[()=>new Response('<html>Denied</html>',{status:401}),/authorization/],[()=>Response.json({message:'Provider quota reached'},{status:429}),/Provider quota reached/],[()=>Response.json({error:{message:'Unsupported generation model'}},{status:400}),/Unsupported generation model/]]){
    let calls=0,reads=0;await assert.rejects(requestStudioAI(createStudioProject(),{task:'generate-image',prompt:'A fox'},{capabilities:caps,fetcher:async()=>{calls++;return response();},artworkReader:async()=>{reads++;throw Error('Should not decode');}}),expected);assert.equal(calls,1);assert.equal(reads,0);
  }
});

test('legacy image errors explain known codes and unknown statuses in both languages without retries',async()=>{
  const cases=[['prompt',400,/rejected the prompt/,'提示词'],['provider',502,/provider rejected/,'提供方'],['rate_limit',429,/busy|account limit/,'限额'],['image_model_unavailable',503,/not enabled/,'未启用'],['server_configuration',503,/not configured/,'尚未配置'],['image_too_large',502,/too large/,'过大'],['size',413,/too large/,'过大'],['unknown_internal_code',418,/Image generation failed \(418\)/,'图像生成失败']];
  for(const language of ['en','zh'])for(const [code,status,english,chinese]of cases){
    const p=createStudioProject();p.language=language;let calls=0;
    await assert.rejects(requestStudioAI(p,{task:'generate-image',prompt:'A panda wearing a birthday party hat.'},{capabilities:{imageGeneration:true,endpoint:PLAN_RELAY,imageEndpoint:IMAGE_RELAY},fetcher:async()=>{calls++;return Response.json({error:code},{status});}}),error=>{assert.notEqual(error.message,code);if(language==='zh')assert.ok(error.message.includes(chinese));else assert.match(error.message,english);return true;});
    assert.equal(calls,1);
  }
});

test('cancellation before generation or during image decoding keeps the pending image unapplied',async()=>{
  const caps={text:true,imageGeneration:true,imageEditing:false,mode:'drawing-plan',endpoint:PLAN_RELAY,imageEndpoint:IMAGE_RELAY};
  const before=new AbortController();before.abort();let calls=0;
  await assert.rejects(requestStudioAI(createStudioProject(),{task:'generate-image',prompt:'A fox',signal:before.signal},{capabilities:caps,fetcher:async()=>{calls++;throw Error('Should not post');}}),{name:'AbortError'});assert.equal(calls,0);
  const during=new AbortController();await assert.rejects(requestStudioAI(createStudioProject(),{task:'generate-image',prompt:'A fox',signal:during.signal},{capabilities:caps,fetcher:async()=>{calls++;return Response.json({dataUrl:png});},artworkReader:async()=>{during.abort();return {id:'ignored',name:'Image',mime:'image/png',dataUrl:png,width:1,height:1};}}),{name:'AbortError'});assert.equal(calls,1);
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
