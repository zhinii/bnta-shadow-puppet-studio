import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createStudioProject,makePart,normalizeStudioProject,applyStudioProposal,partTransforms,transformPoint} from '../public/studio-model.mjs';
import {requestStudioAI,PLAN_RELAY} from '../public/studio-ai.mjs';
// Sends only this newly authored generic geometric fixture, never a saved project or image.
function fixture(){const p=createStudioProject();p.title='Synthetic revision check';p.brief.keywords='Generic paper arm and hand test';p.parts=[{...makePart('Test arm',[[5,40],[45,40],[45,60],[5,60]]),id:'test-arm'},{...makePart('Test hand',[[40,45],[52,28],[78,20],[90,35],[83,48],[60,55],[40,55]]),id:'test-hand'}];p.joints=[{id:'test-wrist',parentId:'test-arm',childId:'test-hand',parentAnchor:[42,50],childAnchor:[42,50],type:'pivot',angle:0,min:-90,max:90,padRadius:8}];return normalizeStudioProject(p);}
const cases=[['horizontal','Mirror only the selected hand left to right. Keep its wrist pivot and current angle.'],['vertical','Flip only the selected hand up–down around its wrist. Do not rotate it.'],['width','Make only the selected hand 20% wider. Keep its length and angle. Do not mirror it.']];
const results=[];
for(const [kind,prompt] of cases){const project=fixture(),started=Date.now();let requests=0;try{
 const response=await requestStudioAI(project,{task:'refine',prompt,selectedPartId:'test-hand',capabilities:{text:true,vision:false,mode:'drawing-plan',endpoint:PLAN_RELAY}},{fetcher:(url,options)=>{requests++;return fetch(url,options);},signal:AbortSignal.timeout(140000)});
 assert.ok(response.proposal,'No editable proposal');const after=applyStudioProposal(project,response.proposal),part=after.parts.find(p=>p.id==='test-hand'),prior=project.parts.find(p=>p.id==='test-hand');
 if(kind==='width')assert.ok(Math.abs(part.parameters.width-1.2)<1e-8,'Expected 20% wider');else assert.equal(response.proposal.parts[0].transform?.mirror,kind,'Expected requested mirror');
 assert.notDeepEqual(part.polygon,prior.polygon);assert.deepEqual(after.parts.find(p=>p.id==='test-arm'),project.parts.find(p=>p.id==='test-arm'));
 const joint=after.joints[0],tr=partTransforms(after);assert.deepEqual(transformPoint(tr[joint.parentId],joint.parentAnchor),transformPoint(tr[joint.childId],joint.childAnchor));
 results.push({kind,prompt,pass:true,requests,elapsedMs:Date.now()-started,proposal:response.proposal,reply:response.reply});
 }catch(error){results.push({kind,prompt,pass:false,requests,elapsedMs:Date.now()-started,error:error.message});}
 console.log(JSON.stringify(results.at(-1)));await writeFile(new URL('../validation/v078-live-revisions.json',import.meta.url),JSON.stringify({fixture:'Newly authored generic vector shapes; no user artwork or project sent',results},null,2)+'\n');}
if(results.some(r=>!r.pass))process.exitCode=1;
