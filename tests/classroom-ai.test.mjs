import test from 'node:test';
import assert from 'node:assert/strict';
import {classroomAIContext,makeClassroomRequest,parseClassroomHelp,requestClassroomHelp,makeStageImageRequest,requestStageImage,applyStageProposal} from '../public/classroom-ai.mjs';
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
  assert.equal(result.proposal.objects.length,2);
  assert.equal(result.proposal.objects[1].shape,'rect');
  assert.equal(result.proposal.objects[1].fill,'#245447');
  assert.equal(result.proposal.objects[1].width,10);
  assert.ok(!JSON.stringify(result.proposal).includes('javascript:'));
  assert.ok(!JSON.stringify(result.proposal).includes('<script>'));
});

test('a script revision missing its id targets only a known current scene and does not erase omitted fields',()=>{
  const context={sceneId:'scene-current',scenes:[{id:'scene-current',title:'Keep this title',setting:'A forest',script:'Old line'},{id:'scene-other',title:'Other',script:'Untouched'}]};
  const result=parseClassroomHelp('script',response({proposal:{scenes:[{script:'Fox: I found the lantern.'}]}}),context);
  assert.deepEqual(result.proposal.scenes,[{id:'scene-current',script:'Fox: I found the lantern.'}]);
  assert.equal(context.scenes[0].script,'Old line');
  const explicitAdd=parseClassroomHelp('script',response({proposal:{scenes:[{operation:'add',title:'After the forest',script:'Owl: Let us go home.'}]}}),context);
  assert.equal(explicitAdd.proposal.scenes[0].id,undefined);
  assert.equal(explicitAdd.proposal.scenes[0].title,'After the forest');
});

test('ambiguous or invented script revision ids cannot silently create duplicate scenes',()=>{
  const context={sceneId:'scene-current',scenes:[{id:'scene-current',script:'Keep this'}]};
  const ambiguous={proposal:{scenes:[{script:'One'},{script:'Two'}]}};
  assert.throws(()=>parseClassroomHelp('script',response(ambiguous),context),/which scene/);
  assert.throws(()=>parseClassroomHelp('script',response({proposal:{scenes:[{script:'One'}]}}),{scenes:context.scenes}),/which scene/);
  assert.throws(()=>parseClassroomHelp('script',response({proposal:{scenes:[{id:'invented',script:'One'}]}}),context),/unknown scene/);
  assert.throws(()=>parseClassroomHelp('script',response({proposal:{scenes:[{operation:'add',id:'scene-current',script:'One'}]}}),context),/must not reuse/);
  const additions=parseClassroomHelp('script',response({proposal:{scenes:[{operation:'add',script:'One'},{operation:'add',script:'Two'}]}}),context);
  assert.equal(additions.proposal.scenes.length,2);
  assert.ok(additions.proposal.scenes.every(scene=>!scene.id));
});

test('stage chat updates selected existing scenery without duplicating it or altering nearby work',()=>{
  const stage={width:960,height:540,background:png,backgroundColor:'#ffffff',objects:[
    {id:'mountains',type:'image',dataUrl:png,x:0,y:20,width:960,height:300,opacity:1,z:0},
    {id:'tree',type:'shape',shape:'rect',fill:'#225544',x:700,y:100,width:60,height:240,z:1}
  ]};
  const before=structuredClone(stage);
  const result=parseClassroomHelp('stage',response({reply:'Preview lighter mountains.',proposal:{updates:[{id:'mountains',changes:{opacity:.4,y:10}},{id:'tree',changes:{fill:'#000000'}}]}}),{stage,selectedObjectId:'mountains'});
  assert.deepEqual(result.proposal.updates,[{id:'mountains',changes:{opacity:.4,y:10}}]);
  assert.match(result.warnings.join(' '),/unselected/);
  const preview=applyStageProposal(stage,result.proposal,{selectedObjectId:'mountains'});
  const applied=applyStageProposal(stage,result.proposal,{selectedObjectId:'mountains'});
  assert.deepEqual(preview,applied);
  assert.equal(preview.objects[0].opacity,.4);
  assert.equal(preview.objects[0].dataUrl,png);
  assert.equal(preview.background,png);
  assert.deepEqual(preview.objects[1],stage.objects[1]);
  assert.deepEqual(stage,before);
  assert.equal(preview.objects.length,2);
});

test('stage edits and new elements compose together, and updates preserve original object identity',()=>{
  const stage={objects:[{id:'tree',type:'shape',shape:'ellipse',fill:'#225544',x:40,y:20,width:60,height:200,z:7}]};
  const result=parseClassroomHelp('stage',response({proposal:{updates:[{id:'tree',changes:{fill:'#000000',width:80}}],objects:[{type:'shape',shape:'ellipse',fill:'#ffaa00',x:800,y:300,width:40,height:50}]}}),{stage});
  const next=applyStageProposal(stage,result.proposal,{createId:()=> 'lamp'});
  assert.equal(next.objects[0].id,'tree');assert.equal(next.objects[0].fill,'#000000');assert.equal(next.objects[0].width,80);
  assert.equal(next.objects[1].id,'lamp');assert.equal(next.objects[1].z,8);
  assert.equal(stage.objects.length,1);assert.equal(stage.objects[0].width,60);
  assert.throws(()=>applyStageProposal(stage,result.proposal,{createId:()=> 'tree'}),/unique id/);
  assert.throws(()=>applyStageProposal({objects:[]},result.proposal),/no longer exists/);
});

test('existing ids cannot be duplicated through legacy additions and selected-only scope excludes new elements',()=>{
  const stage={objects:[{id:'tree',type:'shape',shape:'ellipse',fill:'#225544',x:40,y:20,width:60,height:200,z:1}]};
  const source={proposal:{objects:[{id:'tree',type:'shape',shape:'rect',x:20},{type:'shape',shape:'ellipse',x:500}],updates:[{id:'tree',changes:{x:100}}]}};
  const wholeScene=parseClassroomHelp('stage',response(source),{stage});
  assert.equal(wholeScene.proposal.objects.length,1);
  assert.equal(applyStageProposal(stage,wholeScene.proposal).objects.length,2);
  const selected=parseClassroomHelp('stage',response(source),{stage,selectedObjectId:'tree'});
  assert.equal(selected.proposal.objects.length,0);
  assert.deepEqual(selected.proposal.updates,[{id:'tree',changes:{x:100}}]);
  assert.match(selected.warnings.join(' '),/Clear the selection/);
  assert.throws(()=>applyStageProposal(stage,wholeScene.proposal,{selectedObjectId:'tree'}),/Clear the selection/);
});

test('stage update contracts reject unknown ids, replacement images, markup, deletion and ambiguous repeats',()=>{
  const stage={objects:[{id:'tree',type:'shape',shape:'rect',fill:'#225544',x:10},{id:'caption',type:'text',text:'Welcome'}]};
  const result=parseClassroomHelp('stage',response({proposal:{updates:[{id:'unknown',changes:{x:99}},{id:'tree',changes:{x:1e20,y:-1e20,width:-30,height:1e10,rotation:2000,opacity:40,dataUrl:'javascript:bad',type:'image',fill:'url(https://evil.test/)'}},{id:'caption',changes:{text:'<img src=x onerror=alert(1)>'}}],delete:['caption']}}),{stage});
  assert.deepEqual(result.proposal.updates,[{id:'tree',changes:{x:1920,y:-540,width:10,height:810,rotation:360,opacity:1}}]);
  assert.match(result.warnings.join(' '),/Removing stage elements/);
  const next=applyStageProposal(stage,result.proposal);
  assert.equal(next.objects.length,2);assert.equal(next.objects[1].text,'Welcome');
  assert.equal(next.objects[0].fill,'#225544');assert.equal(next.objects[0].type,'shape');
  assert.equal(next.objects[0].dataUrl,undefined);
  assert.throws(()=>parseClassroomHelp('stage',response({proposal:{updates:[{id:'tree',changes:{x:20}},{id:'tree',changes:{x:30}}]}}),{stage}),/repeats/);
  assert.equal(parseClassroomHelp('stage',response({proposal:{updates:[{id:'unknown',changes:{x:99}}]}}),{stage}).proposal,null);
});

test('background suggestions are separate generation requests and never silently replace image pixels',()=>{
  const stage={background:png,objects:[{id:'tree-image',type:'image',dataUrl:png,opacity:1}]};
  const background=parseClassroomHelp('stage',response({proposal:{backgroundPrompt:'Distant mountains at sunset'}}),{stage});
  assert.deepEqual(background.proposal.backgroundRequest,{kind:'generate-new-backdrop',prompt:'Distant mountains at sunset'});
  assert.match(background.warnings.join(' '),/separate review/);
  assert.deepEqual(applyStageProposal(stage,background.proposal),stage);
  const selected=parseClassroomHelp('stage',response({proposal:{backgroundPrompt:'A black silhouette tree',updates:[{id:'tree-image',changes:{fill:'#000000',dataUrl:png}}]}}),{stage,selectedObjectId:'tree-image'});
  assert.equal(selected.proposal,null);
  assert.match(selected.warnings.join(' '),/pixels cannot be selectively edited/);
  assert.match(selected.warnings.join(' '),/Image pixels were not edited/);
  const request=JSON.parse(makeClassroomRequest({task:'stage',prompt:'Make only the tree a silhouette',context:{stage,selectedObjectId:'tree-image'}}).messages.at(-1).content);
  assert.equal(request.scene.classroom.selectedObjectId,'tree-image');
  assert.match(request.question,/pixels cannot be recolored/);
  assert.doesNotMatch(JSON.stringify(request.scene.classroom),/base64/);
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
