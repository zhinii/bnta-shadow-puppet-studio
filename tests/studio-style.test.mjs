import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,makePart,normalizeStudioProject} from '../public/studio-model.mjs';
import {makeImageGenerationPrompt,makeStudioRequest,makeDrawingPlanRequest,makeKimiImageRequest,getKimiImagePromptLimit,KIMI_IMAGE_PROMPT_LIMIT,requestStudioAI} from '../public/studio-ai.mjs';
import {studioImagePayload,studioChatPayload} from '../server/studio-api.mjs';

const styles=['traditional-inspired','paper-cut','graphic','silhouette'];
const prompt='A panda wearing a blue birthday hat, holding one red balloon.';
const config={model:'test-text',imageModel:'test-image'};
const makeProject=style=>{
 const project=createStudioProject();project.brief.style=style;
 project.parts=[makePart('Existing sleeve',[[10,10],[50,10],[50,100],[10,100]])];
 return normalizeStudioProject(project);
};

test('each visible style reaches image prompts and editable-draft context without replacing the student request',()=>{
 for(const style of styles){
  const project=makeProject(style),before=structuredClone(project);
  const input=makeStudioRequest(project,{task:'generate-image',prompt});
  assert.equal(input.prompt,prompt);
  assert.equal(input.project.brief.style,style);
  const legacy=makeKimiImageRequest(project,{prompt});
  assert.ok(legacy.prompt.includes('Visual style: '+style));
  assert.ok(legacy.prompt.endsWith(prompt));
  const native=studioImagePayload(input,config).input.messages[0].content.at(-1).text;
  assert.equal(native,makeImageGenerationPrompt(project,prompt));
  assert.ok(native.includes('Visual style: '+style));
  assert.ok(native.endsWith(prompt));
  const draft=JSON.parse(makeDrawingPlanRequest(project,{task:'create',prompt}).messages.at(-1).content);
  assert.equal(draft.scene.studio.brief.style,style);
  assert.equal(draft.scene.studentRequest,prompt);
  const chat=JSON.parse(studioChatPayload(makeStudioRequest(project,{task:'create',prompt}),config).messages.at(-1).content);
  assert.equal(chat.studio.brief.style,style);
  assert.deepEqual(project,before,'preparing different style instructions never edits current pieces');
 }
});

test('unset style adds no style setting and keeps an explicit visual request verbatim',()=>{
 const project=makeProject(''),request='A blue fox in ink-wash style; keep my brush marks.';
 for(const imagePrompt of [makeKimiImageRequest(project,{prompt:request}).prompt,makeImageGenerationPrompt(project,request)]){
  assert.ok(imagePrompt.endsWith(request));
  assert.doesNotMatch(imagePrompt,/Visual style:|Selected design settings:/);
 }
 assert.equal(makeStudioRequest(project,{task:'generate-image',prompt:request}).project.brief.style,'');
});

test('time or setting choices reach both image routes and the drawing brief as era guidance',()=>{
 for(const era of ['historical','modern','imagined']){
  const project=makeProject('');project.brief.era=era;
  const body=makeStudioRequest(project,{task:'generate-image',prompt});
  assert.equal(body.project.brief.era,era);
  assert.ok(makeKimiImageRequest(project,{prompt}).prompt.includes('World / era: '+era));
  assert.ok(studioImagePayload(body,config).input.messages[0].content.at(-1).text.includes('World / era: '+era));
  const draft=JSON.parse(makeDrawingPlanRequest(project,{task:'create',prompt}).messages.at(-1).content);
  assert.equal(draft.scene.studio.brief.era,era);
 }
});

test('all style options have an accurate legacy prompt allowance and cannot silently truncate a description',()=>{
 const emptyLimit=getKimiImagePromptLimit(makeProject(''));
 assert.equal(emptyLimit,KIMI_IMAGE_PROMPT_LIMIT);
 for(const style of styles){
  const project=makeProject(style),limit=getKimiImagePromptLimit(project),atLimit='x'.repeat(limit);
  assert.ok(limit>0&&limit<emptyLimit);
  const body=makeKimiImageRequest(project,{prompt:atLimit});
  assert.equal(body.prompt.length,KIMI_IMAGE_PROMPT_LIMIT);
  assert.ok(body.prompt.endsWith(atLimit));
  assert.ok(body.prompt.includes('Visual style: '+style));
  assert.throws(()=>makeKimiImageRequest(project,{prompt:atLimit+'x'}),/Nothing was truncated/);
 }
});

test('selected styles reach both image transports while accepted artwork remains unchanged',async()=>{
 for(const style of styles){
  const project=makeProject(style),before=structuredClone(project);
  for(const legacy of [true,false]){
   let sent;
   const endpoint='https://relay.example/api/studio',imageEndpoint='https://relay.example/api/puppet/image';
   await assert.rejects(()=>requestStudioAI(project,{task:'generate-image',prompt},{
    capabilities:{mode:'studio',endpoint,imageGeneration:true,...(legacy?{imageEndpoint}:{})},
    fetcher:async(url,options)=>{sent={url,body:JSON.parse(options.body)};throw new Error('Request captured for transport test');},
   }),/Request captured for transport test/);
   assert.ok(sent,'generation attempted the expected transport');
   assert.equal(sent.url,legacy?imageEndpoint:endpoint);
   if(legacy){assert.ok(sent.body.prompt.includes('Visual style: '+style));assert.ok(sent.body.prompt.endsWith(prompt));}
   else {assert.equal(sent.body.project.brief.style,style);assert.equal(sent.body.prompt,prompt);}
   assert.deepEqual(project,before,'a style request cannot transform accepted geometry or artwork');
  }
 }
});

