import assert from 'node:assert/strict';
import {createStudioProject,makePart,normalizeStudioProject} from '../public/studio-model.mjs';
import {buildJointPlan} from '../public/studio-joint-plan.mjs';
import {requestJointPlan} from '../public/studio-joint-ai.mjs';
import {PLAN_RELAY} from '../public/studio-ai.mjs';

// Synthetic shapes only: this script never reads user projects, images or keys.
// The default run validates fixtures locally. --live makes three text requests
// to the already configured relay, using only these literal test inputs.
const live=process.argv.includes('--live');
const only=process.argv.find(value=>value.startsWith('--case='))?.slice(7);
const cases=[
 {id:'lower',name:'one lower bend',polygon:[[0,0],[20,0],[20,240],[0,240]],heightMm:240,
  prompt:'A plain vertical paper strip. Add exactly one bend near its bottom end. Keep its upper and middle sections rigid.',
  points:[[10,40],[10,120],[10,200]],angle:0,expected:['candidate-3']},
 {id:'left',name:'one left bend',polygon:[[0,0],[240,0],[240,20],[0,20]],heightMm:20,
  prompt:'A plain horizontal paper strip. Add exactly one bend near its left end. Keep its middle and right sections rigid.',
  points:[[40,10],[120,10],[200,10]],angle:90,expected:['candidate-1']},
 {id:'still',name:'explicit still puppet',polygon:[[0,0],[20,0],[20,240],[0,240]],heightMm:240,
  prompt:'A plain vertical paper strip. Make a still puppet with no joints, no bends and no moving pieces.',
  points:[[10,40],[10,120],[10,200]],angle:0,expected:[]}
];
const reports=[];
const chosen=only?cases.filter(item=>item.id===only):cases;
assert.ok(chosen.length,'Unknown synthetic case');
for(const item of chosen){
 const project=createStudioProject();project.id='synthetic-relay-check';project.title='Synthetic relay check';
 project.heightMm=item.heightMm;project.brief.keywords=item.prompt;
 project.parts=[{...makePart('Paper strip',item.polygon),id:'strip'}];
 const normalized=normalizeStudioProject(project),candidates=item.points.map((point,i)=>({id:'candidate-'+(i+1),partId:'strip',point,angleDegrees:item.angle,label:'Bend '+(i+1)}));
 for(const candidate of candidates){
  const plan=buildJointPlan(normalized,[candidate]);
  assert.equal(plan.markers[0].status,'ready',item.name+' must provide only valid candidates');
 }
 const report={name:item.name,mode:live?'live-synthetic':'local-fixture',candidateCount:candidates.length,expected:item.expected};
 if(live){
  const started=performance.now();
  const fetcher=async(...args)=>{const response=await fetch(...args);if(process.argv.includes('--inspect'))console.log(JSON.stringify({case:item.id,status:response.status,response:(await response.clone().text()).slice(0,5000)}));return response;};
  const result=await requestJointPlan(normalized,candidates,{endpoint:PLAN_RELAY,capabilities:{version:1,text:true,vision:false,mode:'drawing-plan',endpoint:PLAN_RELAY},timeoutMs:25000,fetcher});
  report.elapsedMs=Math.round(performance.now()-started);report.source=result.source;report.reason=result.reason;
  report.selected=result.markers.map(marker=>marker.id);report.pass=result.source==='ai'&&JSON.stringify(report.selected)===JSON.stringify(item.expected);
  report.summary=result.summary||result.message;
  if(!report.pass)process.exitCode=1;
 }
 reports.push(report);console.log(JSON.stringify(report));
}
console.log(JSON.stringify({syntheticOnly:true,requests:live?chosen.length:0,passed:live?reports.filter(r=>r.pass).length:chosen.length,total:chosen.length}));
