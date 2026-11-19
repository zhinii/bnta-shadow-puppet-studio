import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,normalizeStudioProject,applyStudioProposal} from '../public/studio-model.mjs';
import {STUDIO_SYSTEM,PLAN_RELAY,makeDrawingPlanRequest,makeStudioRequest,parseStudioResponse,requestStudioAI} from '../public/studio-ai.mjs';
import {studioChatPayload} from '../server/studio-api.mjs';

const caps={text:true,mode:'drawing-plan',endpoint:PLAN_RELAY};
const choice=reply=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply})}}]});
const piece={id:'hand',name:'Hand and ball',polygon:[[20,20],[80,20],[80,70],[40,100],[20,70]],fill:'#bd6a43'};
function project(){const p=createStudioProject();p.parts=[piece,{...piece,id:'body',name:'Body'}];return normalizeStudioProject(p);}
const sceneOf=options=>JSON.parse(JSON.parse(options.body).messages.at(-1).content).scene;

test('legacy labelled Parts arrays become typed proposals without interpreting surrounding prose',()=>{
  const reply='I suggest a local change.\nSummary: Mirror the selected hand.\nParts: '+JSON.stringify([{id:'hand',name:'Hand [with "ball"]',transform:{mirror:'horizontal'}}])+'\nThis remains a preview.';
  const result=parseStudioResponse(choice(reply),{legacy:true});
  assert.equal(result.reply,'Mirror the selected hand.');
  assert.deepEqual(result.proposal.parts,[{id:'hand',name:'Hand [with "ball"]',transform:{mirror:'horizontal'}}]);
  const inline=parseStudioResponse(choice('Summary: Flip the hand. Parts: [{"id":"hand","transform":{"mirror":"vertical"}}]'),{legacy:true});
  assert.equal(inline.reply,'Flip the hand.');assert.deepEqual(inline.proposal.parts[0].transform,{mirror:'vertical'});
  assert.equal(parseStudioResponse(choice('I will mirror it horizontally.'),{legacy:true}).proposal,null);
  assert.equal(parseStudioResponse(choice('Parts: [{"id":"hand"'),{legacy:true}).proposal,null);
  assert.equal(parseStudioResponse(choice('Parts: [{"id":"hand","fill":"#ffffff"}]\nParts: [{"id":"body","fill":"#000000"}]'),{legacy:true}).proposal,null);
  assert.equal(parseStudioResponse(choice('Run this: [{id:"hand",transform:{mirror:"horizontal"}}]'),{legacy:true}).proposal,null);
  assert.throws(()=>parseStudioResponse(choice('Parts: [{"id":"hand","parameters":{"width":-1}}]'),{legacy:true}),/transform.*mirror.*negative dimensions/);
});

test('a structured proposal remains authoritative when reply contains a different embedded plan',()=>{
  const result=parseStudioResponse({reply:JSON.stringify({summary:'Wrong target',parts:[{id:'body',fill:'#000000'}]}),proposal:{parts:[{id:'hand',transform:{mirror:'vertical'}}]}});
  assert.deepEqual(result.proposal.parts,[{id:'hand',transform:{mirror:'vertical'}}]);
});

test('mirroring uses a strict separate transform operation and positive dimensions stay protected',()=>{
  for(const mirror of ['horizontal','vertical'])assert.deepEqual(parseStudioResponse({reply:'Review the flip.',proposal:{parts:[{id:'hand',transform:{mirror}}]}}).proposal.parts[0].transform,{mirror});
  for(const transform of [{},{mirror:'diagonal'},{mirror:1},{mirror:'horizontal',rotation:180},'horizontal'])assert.throws(()=>parseStudioResponse({reply:'Review.',proposal:{parts:[{id:'hand',transform}]}}),/Use transform/);
  for(const other of [{parameters:{width:1.2}},{polygon:piece.polygon}])assert.throws(()=>parseStudioResponse({reply:'Review.',proposal:{parts:[{id:'hand',transform:{mirror:'horizontal'},...other}]}}),/separately/);
  assert.throws(()=>parseStudioResponse({reply:'Review.',proposal:{parts:[{id:'hand',parameters:{width:-1}}]}}),/never negative dimensions/);
  assert.match(STUDIO_SYSTEM,/Mirroring is not rotation/);
});

test('both relay contracts teach the supported edit and fit the legacy question limit during repairs',()=>{
  const p=project(),prompt='x'.repeat(4000),repair={error:'x'.repeat(1000),proposal:null};
  const request=makeDrawingPlanRequest(p,{task:'refine',prompt,selectedPartId:'hand',repair});
  const value=JSON.parse(request.messages.at(-1).content);
  assert.ok(value.question.length<=1600);assert.equal(value.scene.studentRequest,prompt);
  assert.match(value.question,/ONE JSON-encoded object/);assert.match(value.question,/transform:\{mirror:"horizontal"\}/);
  assert.doesNotMatch(value.question,/suggest painting/);
  const payload=studioChatPayload(makeStudioRequest(p,{task:'refine',prompt:'Mirror it',selectedPartId:'hand',repair}),{model:'test'});
  assert.match(payload.messages[0].content,/transform:\{mirror:"horizontal"\}/);
  assert.match(JSON.parse(payload.messages.at(-1).content).repairRule,/supported edit inside proposal/);
});

test('the reported negative-width answer gets one repair and yields a real selected-piece mirror preview',async()=>{
  const p=project(),snapshot=structuredClone(p),prompt='Mirror the basketball hand so it faces the other direction';let calls=0;
  const result=await requestStudioAI(p,{task:'refine',prompt,selectedPartId:'hand',history:[{role:'user',content:'Keep its joint angle unchanged.'}]},{capabilities:caps,fetcher:async(url,options)=>{
    calls++;const scene=sceneOf(options);assert.equal(scene.studentRequest,prompt);assert.equal(scene.selectedPart,'hand');
    if(calls===1)return Response.json(choice('You are right.\nSummary: Mirror the selected hand.\nParts: [{"id":"hand","parameters":{"width":-1}}]'));
    assert.match(scene.repair.error,/transform.*mirror/);
    return Response.json(choice('Summary: Review the mirrored hand.\nParts: [{"id":"hand","transform":{"mirror":"horizontal"}},{"id":"body","fill":"#000000"}]'));
  }});
  assert.equal(calls,2);assert.equal(result.proposal.parts.length,1);assert.equal(result.proposal.parts[0].id,'hand');
  const preview=applyStudioProposal(p,result.proposal),hand=preview.parts.find(part=>part.id==='hand');
  assert.notDeepEqual(hand.artworkMatrix,p.parts[0].artworkMatrix);assert.equal(hand.parameters.width,1);assert.equal(hand.rotation,p.parts[0].rotation);
  assert.deepEqual(preview.parts.find(part=>part.id==='body'),p.parts.find(part=>part.id==='body'));assert.deepEqual(p,snapshot);
});

test('advice-only and no-op refine replies get one bounded correction, never a false preview',async()=>{
  for(const reply of ['I have changed the hand.',JSON.stringify({summary:'Changed.',parts:[{id:'hand',parameters:{width:1}}]})]){
    const p=project(),snapshot=structuredClone(p);let calls=0;
    const result=await requestStudioAI(p,{task:'refine',prompt:'Make this piece wider',selectedPartId:'hand'},{capabilities:caps,fetcher:async(url,options)=>{
      calls++;if(calls===2)assert.match(sceneOf(options).repair.error,/No editable change/);return Response.json(choice(reply));
    }});
    assert.equal(calls,2);assert.equal(result.proposal,null);assert.deepEqual(p,snapshot);
  }
});

test('advice-only refinement can recover to a valid dimension edit and cancellation stops its repair',async()=>{
  const p=project();let calls=0;
  const result=await requestStudioAI(p,{task:'refine',prompt:'Make the hand wider',selectedPartId:'hand'},{capabilities:caps,fetcher:async()=>Response.json(choice(++calls===1?'I would make it wider.':JSON.stringify({summary:'Review the wider hand.',parts:[{id:'hand',parameters:{width:1.2}}]})))});
  assert.equal(calls,2);assert.equal(result.proposal.parts[0].parameters.width,1.2);
  const controller=new AbortController();calls=0;
  await assert.rejects(requestStudioAI(p,{task:'refine',prompt:'Mirror the hand',selectedPartId:'hand',signal:controller.signal},{capabilities:caps,fetcher:async()=>{calls++;controller.abort();return Response.json(choice('I would mirror it.'));}}),{name:'AbortError'});
  assert.equal(calls,1);
});

test('attached-piece pose fields cannot pass as a visible preview when its joint controls the pose',async()=>{
  const p=project();p.joints=[{id:'wrist',parentId:'body',childId:'hand',parentAnchor:[40,40],childAnchor:[40,40],type:'pivot',angle:0,min:-90,max:90,padRadius:10}];
  const snapshot=structuredClone(p);let calls=0;
  const result=await requestStudioAI(p,{task:'refine',prompt:'Turn the attached hand down',selectedPartId:'hand'},{capabilities:caps,fetcher:async(url,options)=>{
    calls++;if(calls===1)return Response.json(choice(JSON.stringify({summary:'Rotate the hand.',parts:[{id:'hand',rotation:150}]})));
    assert.match(sceneOf(options).repair.error,/do not control its displayed pose/);
    return Response.json(choice('Use the movement control to adjust the joint angle.'));
  }});
  assert.equal(calls,2);assert.equal(result.proposal,null);assert.deepEqual(p,snapshot);
});

test('all three reported wrong edit formats repair to a typed mirror instead of accepting a contour-only flip',async()=>{
  for(const patch of [{id:'hand',parameters:{axisAngle:150}},{id:'hand',parameters:{width:-1}},{id:'hand',polygon:[[80,20],[20,20],[20,70],[60,100],[80,70]]}]){
    const p=project();let calls=0;
    const result=await requestStudioAI(p,{task:'refine',prompt:'mirror the basketball hand so it faces the other direction',selectedPartId:'hand'},{capabilities:caps,fetcher:async(url,options)=>{
      calls++;if(calls===1)return Response.json(choice('Summary: Mirror it. Parts: '+JSON.stringify([patch])));
      const repair=sceneOf(options).repair;assert.ok(repair.error);return Response.json(choice(JSON.stringify({summary:'Review the mirror.',parts:[{id:'hand',transform:{mirror:'horizontal'}}]})));
    }});
    assert.equal(calls,2);assert.deepEqual(result.proposal.parts[0].transform,{mirror:'horizontal'});assert.equal(result.proposal.parts[0].polygon,undefined);
  }
});

test('mirror format guard supports Chinese requests and does not block an explicitly unmirrored outline edit',async()=>{
  for(const prompt of ['把这个手和篮球左右翻转','Do not mirror the piece; make the outline wider instead.','不要镜像，把轮廓变宽一点']){
    const p=project(),patch={id:'hand',polygon:[[10,20],[90,20],[90,70],[40,100],[10,70]]};let calls=0;
    const result=await requestStudioAI(p,{task:'refine',prompt,selectedPartId:'hand'},{capabilities:caps,fetcher:async()=>{calls++;return Response.json(choice(calls===1?JSON.stringify({summary:'Review.',parts:[patch]}):'Please choose left-right or up-down.'));}});
    if(prompt.startsWith('把')){assert.equal(calls,2);assert.equal(result.proposal,null);}else{assert.equal(calls,1);assert.deepEqual(result.proposal.parts[0].polygon,patch.polygon);}
  }
});
