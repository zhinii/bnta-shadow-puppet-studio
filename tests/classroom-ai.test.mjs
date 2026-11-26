import test from 'node:test';
import assert from 'node:assert/strict';
import {classroomAIContext,makeClassroomRequest,parseClassroomHelp,requestClassroomHelp,makeStageImageRequest,requestStageImage} from '../public/classroom-ai.mjs';
import {validateBody} from '../server/api.mjs';

const response=value=>({choices:[{message:{content:JSON.stringify({reply:JSON.stringify(value)})},finish_reason:'stop'}]});
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

test('classroom transport preserves custom requests and conforms to existing relay without sending private assets',()=>{
  const prompt='A modern scientist meets a historical storyteller. Keep their disagreement unresolved. '+ 'detail '.repeat(200);
  const context={title:'Group work',joinCode:'PRIVATE',token:'SECRET',email:'person@example.com',story:{plot:'Their debate'},characters:[{id:'c1',project:{assets:[{dataUrl:png}]}}],evidence:[{id:'test-1',text:'Student reported a loose pin.'}]};
  for(const task of ['story','script','stage','feedback']){
    const body=makeClassroomRequest({task,prompt,context,language:'zh'});
    assert.equal(validateBody(body).task.language,'zh');
    const sent=JSON.parse(body.messages.at(-1).content);
    assert.equal(sent.scene.studentRequest,prompt);
    assert.ok(sent.question.length<=1600);
    assert.doesNotMatch(JSON.stringify(body),/PRIVATE|SECRET|person@example|base64/);
  }
  assert.equal(context.token,'SECRET');
  assert.throws(()=>makeClassroomRequest({task:'story',prompt:'x'.repeat(4001)}),/4,000/);
});

test('story and scene proposals are bounded structured suggestions and do not mutate accepted work',()=>{
  const original={story:{title:'Original'},scenes:[{id:'s1',script:'Keep this'}]};
  const result=parseClassroomHelp('story',response({reply:'A possible ending.',proposal:{story:{plot:'They agree to test both ideas.',code:'delete',title:'New title'}}}),original);
  assert.deepEqual(result.proposal,{story:{title:'New title',plot:'They agree to test both ideas.'}});
  assert.equal(original.story.title,'Original');
  const script=parseClassroomHelp('script',response({proposal:{scenes:[{id:'s1',title:'Debate',script:'Scientist: Let us test it.',setting:'Workshop'}]}}));
  assert.equal(script.proposal.scenes[0].id,'s1');
  assert.throws(()=>parseClassroomHelp('script',response({proposal:{scenes:[{id:'same',script:'A'},{id:'same',script:'B'}]}})),/repeats/);
  assert.equal(parseClassroomHelp('story',{reply:'Try thinking about the ending.'}).proposal,null);
  const patch=parseClassroomHelp('story',response({proposal:{story:{title:'Original',plot:'Only this changes.'}}}),original);
  assert.deepEqual(patch.proposal.story,{plot:'Only this changes.'});
  assert.match(JSON.parse(makeClassroomRequest({task:'script',prompt:'Six spoken lines'}).messages.at(-1).content).question,/count only spoken lines/);
});

test('stage proposals cannot inject HTML, arbitrary image URLs, or unknown characters',()=>{
  const result=parseClassroomHelp('stage',response({proposal:{backgroundPrompt:'A village at dusk',objects:[{type:'image',dataUrl:'javascript:alert(1)'},{type:'character',characterId:'unknown'},{type:'character',characterId:'known',x:100,y:100},{type:'shape',shape:'script',fill:'url(evil)',x:Infinity,width:-20},{type:'text',text:'<script>bad</script>'}]}}),{characters:[{id:'known'}]});
  assert.equal(result.proposal.objects.length,3);
  assert.equal(result.proposal.objects[1].shape,'rect');
  assert.equal(result.proposal.objects[1].fill,'#245447');
  assert.equal(result.proposal.objects[1].width,10);
  assert.ok(!JSON.stringify(result.proposal).includes('javascript:'));
});

test('AI assessment only retains known evidence and never accepts numeric scores',()=>{
  const context={rubric:[{id:'construction'}],evidence:[{id:'movement-1',text:'The student reports a pin coming loose.'}]};
  const result=parseClassroomHelp('feedback',response({proposal:{score:98,observations:[{criterion:'construction',evidenceRefs:['movement-1','invented'],comment:'Revise the pin connection and retest.'},{criterion:'construction',evidenceRefs:['invented'],comment:'Excellent teamwork.'},{criterion:'unknown',evidenceRefs:['movement-1'],comment:'Unsupported.'}],questions:['Can you attach a photo of the revised joint?']}}),context);
  assert.equal(result.proposal.observations.length,1);
  assert.deepEqual(result.proposal.observations[0].evidenceRefs,['movement-1']);
  assert.equal(result.proposal.score,undefined);
  assert.ok(result.warnings.length);
});

test('AI requests surface service errors and handle explicit cancellation',async()=>{
  await assert.rejects(requestClassroomHelp({task:'story',prompt:'Revise the ending'},{fetcher:async()=>Response.json({error:'rate_limit'},{status:429})}),/busy/);
  const controller=new AbortController();
  await assert.rejects(requestClassroomHelp({task:'story',prompt:'Revise the ending',signal:controller.signal},{fetcher:async()=>{controller.abort();return Response.json(response({proposal:{story:{plot:'New'}}}));}}),/abort/i);
  await assert.rejects(requestClassroomHelp({task:'story',prompt:'Revise the ending'},{fetcher:async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]})}),/cut off/);
});

test('stage generation preserves exact prompt and does not apply character-only image defaults',async()=>{
  const prompt='Wide landscape: distant mountains, red lantern, an open foreground for puppets.';
  const body=makeStageImageRequest({prompt});assert.ok(body.prompt.endsWith(prompt));assert.match(body.prompt,/stage backdrop/);assert.doesNotMatch(body.prompt,/Single full-body character|plain white/);
  assert.equal(makeStageImageRequest({prompt:'x'.repeat(800)}).prompt.length,800);
  assert.throws(()=>makeStageImageRequest({prompt:'x'.repeat(801)}),/800/);
  const result=await requestStageImage({prompt},{fetcher:async(url,options)=>{assert.equal(JSON.parse(options.body).kind,'reference');return Response.json({dataUrl:png});},artworkReader:async()=>({id:'stage1',name:'image',mime:'image/png',dataUrl:png,width:1,height:1})});
  assert.equal(result.task,'stage-image');assert.equal(result.asset.name,'Generated stage backdrop');
  assert.doesNotMatch(result.reply,/anatomy|appendage/);
});

test('context refuses excessively large evidence instead of silently truncating the task',()=>{
  assert.throws(()=>classroomAIContext({evidence:Array.from({length:30},(_,i)=>({id:String(i),text:'x'.repeat(6000)}))}),/too large/);
  assert.deepEqual(classroomAIContext(JSON.parse('{"__proto__":{"polluted":true},"token":"secret","story":{"plot":"safe"}}')),{story:{plot:'safe'}});
});
