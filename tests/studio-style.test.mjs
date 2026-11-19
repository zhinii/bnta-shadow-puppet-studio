import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,makePart,normalizeStudioProject} from '../public/studio-model.mjs';
import {makeImageGenerationPrompt,makeStudioRequest,makeDrawingPlanRequest,makeKimiImageRequest,getKimiImagePromptLimit,KIMI_IMAGE_PROMPT_LIMIT,requestStudioAI} from '../public/studio-ai.mjs';
import {studioImagePayload,studioChatPayload} from '../server/studio-api.mjs';

const styles=['traditional-inspired','paper-cut','graphic','silhouette'];
const prompt='A panda wearing a blue birthday hat, holding one red balloon.';
const config={model:'test-text',imageModel:'test-image'};
const makeProject=style=>{
 const project=createStudioProject();
 project.brief={kind:'creature',era:'historical',style,action:'wave all six arms',keywords:prompt};
 project.parts=[makePart('Existing sleeve',[[10,10],[50,10],[50,100],[10,100]])];
 return normalizeStudioProject(project);
};
const noChoices=/Character type:|World \/ era:|Visual style:|Movement \/ action:|Selected design settings:/;

test('removed saved style choices cannot steer image prompts or editable-draft context',()=>{
 for(const style of styles){
  const project=makeProject(style),before=structuredClone(project);
  const input=makeStudioRequest(project,{task:'generate-image',prompt});
  assert.equal(input.prompt,prompt);assert.deepEqual(input.project.brief,{keywords:prompt});
  const legacy=makeKimiImageRequest(project,{prompt});
  assert.doesNotMatch(legacy.prompt,noChoices);assert.ok(legacy.prompt.endsWith(prompt));
  const native=studioImagePayload(input,config).input.messages[0].content.at(-1).text;
  assert.equal(native,makeImageGenerationPrompt(project,prompt));assert.doesNotMatch(native,noChoices);assert.ok(native.endsWith(prompt));
  const draft=JSON.parse(makeDrawingPlanRequest(project,{task:'create',prompt}).messages.at(-1).content);
  assert.deepEqual(draft.scene.studio.brief,{keywords:prompt});assert.equal(draft.scene.studentRequest,prompt);
  const chat=JSON.parse(studioChatPayload(makeStudioRequest(project,{task:'create',prompt}),config).messages.at(-1).content);
  assert.deepEqual(chat.studio.brief,{keywords:prompt});
  assert.deepEqual(project,before,'retired settings stay portable but never mutate or invisibly direct the accepted design');
 }
});

test('style expressed in the student description remains verbatim after removing the selector',()=>{
 const project=makeProject('graphic'),request='  A blue fox in ink-wash style; keep my brush marks.\nUse a modern costume.  ';
 for(const imagePrompt of [makeKimiImageRequest(project,{prompt:request}).prompt,makeImageGenerationPrompt(project,request)]){
  assert.ok(imagePrompt.endsWith(request));assert.doesNotMatch(imagePrompt,noChoices);
 }
 assert.equal(makeStudioRequest(project,{task:'generate-image',prompt:request}).prompt,request);
});

test('removed time and character settings are excluded from every AI task while the description stays available',()=>{
 for(const era of ['historical','modern','imagined']){
  const project=makeProject('');project.brief.era=era;const before=structuredClone(project);
  for(const task of ['create','refine','analyze','segment','edit-image','generate-image']){
   const body=makeStudioRequest(project,{task,prompt});
   assert.deepEqual(body.project.brief,{keywords:prompt});
  }
  assert.doesNotMatch(makeKimiImageRequest(project,{prompt}).prompt,noChoices);
  assert.doesNotMatch(makeImageGenerationPrompt(project,prompt),noChoices);
  assert.deepEqual(project,before);
 }
});

test('retired presets cannot consume the 800-character allowance or silently truncate the description',()=>{
 for(const style of styles){
  const project=makeProject(style),limit=getKimiImagePromptLimit(project),atLimit='x'.repeat(limit);
  assert.equal(limit,KIMI_IMAGE_PROMPT_LIMIT);assert.equal(makeKimiImageRequest(project,{prompt:atLimit}).prompt,atLimit);
  assert.throws(()=>makeKimiImageRequest(project,{prompt:atLimit+'x'}),/Nothing was truncated/);
 }
});

test('both image transports ignore saved options while preserving accepted artwork and explicit requests',async()=>{
 for(const style of styles){
  const project=makeProject(style),before=structuredClone(project);
  for(const legacy of [true,false]){
   let sent;
   const endpoint='https://relay.example/api/studio',imageEndpoint='https://relay.example/api/puppet/image';
   await assert.rejects(()=>requestStudioAI(project,{task:'generate-image',prompt},{
    capabilities:{mode:'studio',endpoint,imageGeneration:true,...(legacy?{imageEndpoint}:{})},
    fetcher:async(url,options)=>{sent={url,body:JSON.parse(options.body)};throw new Error('Request captured for transport test');},
   }),/Request captured for transport test/);
   assert.ok(sent);assert.equal(sent.url,legacy?imageEndpoint:endpoint);
   if(legacy){assert.doesNotMatch(sent.body.prompt,noChoices);assert.ok(sent.body.prompt.endsWith(prompt));}
   else {assert.deepEqual(sent.body.project.brief,{keywords:prompt});assert.equal(sent.body.prompt,prompt);}
   assert.deepEqual(project,before);
  }
 }
});

