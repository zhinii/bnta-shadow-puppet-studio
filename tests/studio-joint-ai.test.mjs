import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStudioProject,makePart} from '../public/studio-model.mjs';
import {PLAN_RELAY} from '../public/studio-ai.mjs';
import {requestJointPlan,parseJointPlanResponse} from '../public/studio-joint-ai.mjs';
import {suggestJointMarkers} from '../public/studio-joint-plan.mjs';

const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function fixture(){const project=createStudioProject();const part=makePart('Long limb',[[0,0],[40,0],[40,240],[0,240]]);part.id='limb';project.parts=[part];project.brief.keywords='An imaginary animal with a long tail. Preserve my patterned costume.';project.assets=[{id:'art',name:'Artwork',width:40,height:240,mime:'image/png',dataUrl:PNG}];project.conceptAssetId='art';return {project,candidates:[{id:'joint-a',partId:'limb',point:[20,80],label:'Upper bend'},{id:'joint-b',partId:'limb',point:[20,160],label:'Lower bend',angleDegrees:0}]};}
const legacy={version:1,text:true,vision:false,mode:'drawing-plan',endpoint:PLAN_RELAY};
const answer=value=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:JSON.stringify(value)})}}]});

test('legacy AI selects only supplied markers with the exact brief and no image bytes or shape mutation',async()=>{
 const {project,candidates}=fixture(),before=structuredClone(project),calls=[];
 const result=await requestJointPlan(project,candidates,{capabilities:legacy,imageDataUrl:PNG,fetcher:async(url,options)=>{calls.push(url);const raw=options.body,body=JSON.parse(raw),question=JSON.parse(body.messages.at(-1).content);assert.equal(question.task,'discuss');assert.equal(question.scene.studentRequest,project.brief.keywords);assert.ok(question.question.length<=1600);assert.match(question.question,/NOT image pixels/);assert.doesNotMatch(raw,/base64|dataUrl|imageDataUrl/);assert.deepEqual(question.scene.studio.candidates,candidates);return answer({selectedIds:['joint-b'],summary:'Use one movement point on the long section.'});}});
 assert.equal(calls.length,1);assert.equal(result.source,'ai');assert.equal(result.input,'outline-only');assert.deepEqual(result.markers,[candidates[1]]);assert.deepEqual(project,before);result.markers[0].point[0]=999;assert.equal(candidates[1].point[0],20);
});

test('horse selection request focuses explicit movements and supplies bounded measured regions without anatomical labels',async()=>{
 const project=JSON.parse(await readFile(new URL('./fixtures/generated-horse-outline.puppet.json',import.meta.url),'utf8')),before=structuredClone(project),candidates=suggestJointMarkers(project,{maxMarkers:12});let calls=0;
 const result=await requestJointPlan(project,candidates,{capabilities:legacy,fetcher:async(_url,options)=>{
  calls++;const content=JSON.parse(options.body).messages.at(-1).content,body=JSON.parse(content),context=body.scene.studio;
  assert.equal(body.scene.studentRequest,project.brief.keywords);assert.deepEqual(context.brief,{keywords:project.brief.keywords});
  assert.ok(content.length<=34500);assert.ok(body.question.length<=1600);
  assert.match(body.question,/ONLY the minimum joints needed/);assert.match(body.question,/"one" means one/);assert.match(body.question,/ambiguous or missing, omit it/);assert.doesNotMatch(body.question,/Start with 2-6/);assert.match(body.question,/For a still puppet, return/);assert.match(body.question,/never prose alone/);
  assert.equal(context.candidateGeometry.length,candidates.length);assert.ok(context.candidateGeometry.length<=12);
  for(const measurement of context.candidateGeometry){assert.deepEqual(Object.keys(measurement).sort(),['id','position','smallerRegion']);assert.ok(candidates.some(m=>m.id===measurement.id));assert.ok(measurement.position.every(n=>n>=0&&n<=1));assert.ok(measurement.smallerRegion.bounds.every(n=>n>=0&&n<=1));assert.ok(measurement.smallerRegion.areaFraction>0&&measurement.smallerRegion.areaFraction<=.5);}
  const nearest=(x,y)=>candidates.reduce((best,m)=>Math.hypot(m.point[0]-x,m.point[1]-y)<Math.hypot(best.point[0]-x,best.point[1]-y)?m:best),face=nearest(185,294),neck=nearest(331,256),measurement=id=>context.candidateGeometry.find(m=>m.id===id);
  // The full contour distinguishes a substantial upper region from a small tip.
  assert.ok(measurement(neck.id).smallerRegion.areaFraction>measurement(face.id).smallerRegion.areaFraction*5);
  assert.deepEqual(context.candidates,candidates);assert.doesNotMatch(content,/base64|dataUrl|imageDataUrl/);
  return answer({selectedIds:[neck.id],summary:'One candidate for review; the other requested movement is uncertain.'});
 }});
 assert.equal(calls,1);assert.equal(result.source,'ai');assert.equal(result.markers.length,1);assert.deepEqual(project,before);
});

test('AI coordinates or extra artwork cannot replace a selected measured candidate',()=>{
 const {candidates}=fixture(),result=parseJointPlanResponse({selectedIds:['joint-a'],markers:[{...candidates[0],point:[999,999]}],parts:[{id:'new-artwork'}],point:[-20,-20]},candidates);
 assert.deepEqual(result.markers,[candidates[0]]);assert.notEqual(result.markers[0],candidates[0]);
});

test('structured and nested replies accept a deliberate empty AI selection without geometry fallback',async()=>{
 const {project,candidates}=fixture();
 for(const payload of [{selectedIds:[],summary:'A still prop is appropriate.'},{reply:'```json\n'+JSON.stringify({selectedIds:[]})+'\n```'},{choices:[{finish_reason:'stop',message:{content:JSON.stringify(JSON.stringify({selectedIds:[]}))}}] }]){
  const result=await requestJointPlan(project,candidates,{capabilities:legacy,fetcher:async()=>Response.json(payload)});assert.equal(result.source,'ai');assert.deepEqual(result.markers,[]);assert.match(result.message,/did not identify/);
 }
});

test('unknown, duplicate, malformed or truncated AI choices fall back honestly without a second request',async()=>{
 const {project,candidates}=fixture();
 for(const payload of [{selectedIds:['unknown']},{selectedIds:['joint-a','joint-a']},{selectedIds:'joint-a'},{selectedIds:[{id:'joint-a',point:[20,80]}]},{selectedIds:Array(13).fill('joint-a')},{reply:'Move the legs naturally.'},{choices:[{finish_reason:'length',message:{content:'{"selectedIds":["joint-a"]}'}}]}]){
  let calls=0;const result=await requestJointPlan(project,candidates,{capabilities:legacy,fetcher:async()=>{calls++;return Response.json(payload);}});assert.equal(calls,1);assert.equal(result.source,'geometry');assert.equal(result.reason,'invalid-response');assert.deepEqual(result.markers,candidates);assert.match(result.message,/outline-based/);
 }
 assert.throws(()=>parseJointPlanResponse({selectedIds:['unknown']},candidates),/unknown/);
});

test('invalid candidate coordinates, duplicates and locks never reach the service',async()=>{
 const {project,candidates}=fixture();let calls=0;const options={capabilities:legacy,fetcher:async()=>{calls++;return answer({selectedIds:[]});}};
 for(const markers of [[{...candidates[0],point:[1000,80]}],[{...candidates[0],point:[NaN,80]}],[candidates[0],candidates[0]],[{...candidates[0],partId:'missing'}]])await assert.rejects(requestJointPlan(project,markers,options),/candidate/);
 project.parts[0].locked=true;await assert.rejects(requestJointPlan(project,candidates,options),/locked/);assert.equal(calls,0);
});

test('custom relay stays on its configured host and never forwards a failed request elsewhere',async()=>{
 const {project,candidates}=fixture(),calls=[],endpoint='https://school.example/api/studio';
 const down=await requestJointPlan(project,candidates,{endpoint,fetcher:async(url)=>{calls.push(url);return new Response('',{status:404});}});assert.equal(down.source,'geometry');assert.deepEqual(calls,[endpoint+'/status']);
 const cross=await requestJointPlan(project,candidates,{endpoint,capabilities:legacy,fetcher:async()=>{throw Error('must not call');}});assert.equal(cross.reason,'endpoint');
 let posts=0;const rejected=await requestJointPlan(project,candidates,{endpoint,capabilities:{text:true,mode:'studio',endpoint},fetcher:async url=>{posts++;assert.equal(url,endpoint);return new Response('',{status:429});}});assert.equal(posts,1);assert.equal(rejected.reason,'provider');
});

test('reference pixels are sent only to an advertised v2 vision route on the configured host',async()=>{
 const {project,candidates}=fixture(),endpoint='https://school.example/api/studio';
 for(const vision of [false,true]){
  const result=await requestJointPlan(project,candidates,{endpoint,capabilities:{version:2,text:true,vision,mode:'studio',endpoint},imageDataUrl:PNG,fetcher:async(url,options)=>{assert.equal(url,endpoint);const body=JSON.parse(options.body);assert.equal(body.task,vision?'analyze':'refine');assert.equal(body.imageDataUrl,vision?PNG:undefined);assert.doesNotMatch(JSON.stringify(body.project),/base64|dataUrl/);assert.match(body.prompt,/selectedIds/);assert.match(body.prompt,/smallerRegionAreaFraction/);assert.ok(body.prompt.length<=4000);assert.equal(body.project.brief.keywords,project.brief.keywords);return Response.json({reply:JSON.stringify({selectedIds:['joint-a']})});}});
  assert.equal(result.source,'ai');assert.equal(result.input,vision?'image-and-outline':'outline-only');
 }
});

test('cancellation before and during planning throws instead of applying fallback suggestions',async()=>{
 const {project,candidates}=fixture();let calls=0;const before=new AbortController();before.abort();await assert.rejects(requestJointPlan(project,candidates,{signal:before.signal,capabilities:legacy,fetcher:async()=>{calls++;}}),{name:'AbortError'});assert.equal(calls,0);
 const controller=new AbortController();let observed;const pending=requestJointPlan(project,candidates,{signal:controller.signal,capabilities:legacy,fetcher:async(_url,{signal})=>{observed=signal;return new Promise(()=>{});}});await Promise.resolve();controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(observed.aborted,true);
});

test('a stalled request or response body has a bounded timeout and preserves geometry provenance',async()=>{
 const {project,candidates}=fixture();
 for(const fetcher of [async()=>new Promise(()=>{}),async()=>({ok:true,json:()=>new Promise(()=>{})})]){
  const result=await requestJointPlan(project,candidates,{capabilities:legacy,timeoutMs:5,fetcher});assert.equal(result.source,'geometry');assert.equal(result.reason,'timeout');assert.deepEqual(result.markers,candidates);
 }
});

test('oversized replies and unavailable or empty plans do not claim AI success',async()=>{
 const {project,candidates}=fixture();const oversized=await requestJointPlan(project,candidates,{capabilities:legacy,fetcher:async()=>new Response('x'.repeat(120001))});assert.equal(oversized.source,'geometry');assert.equal(oversized.reason,'invalid-response');const interrupted=await requestJointPlan(project,candidates,{capabilities:legacy,fetcher:async()=>{throw new DOMException('Transport aborted','AbortError');}});assert.equal(interrupted.source,'geometry');
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not call');};const unavailable=await requestJointPlan(project,candidates,{capabilities:{text:false,vision:false,endpoint:PLAN_RELAY},fetcher});assert.equal(unavailable.source,'geometry');assert.equal(unavailable.reason,'unavailable');const empty=await requestJointPlan(project,[],{capabilities:legacy,fetcher});assert.equal(empty.reason,'no-candidates');assert.deepEqual(empty.markers,[]);assert.equal(calls,0);
});
