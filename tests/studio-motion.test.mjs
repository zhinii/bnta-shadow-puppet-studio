import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,makePart,addConnection,normalizeStudioProject,partTransforms,transformPoint} from '../public/studio-model.mjs';
import {serializeStudioProject,parseStudioProject} from '../public/studio-storage.mjs';
import {MOTION_TESTS,assignNamedMotion,clearNamedMotion,previewNamedMotion} from '../public/studio-motion.mjs';

const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){
 let p=createStudioProject();p.parts=[{...makePart('Creature body',rect(0,0,100,120)),id:'body'},{...makePart('Long antenna',rect(40,-60,20,80)),id:'antenna'},{...makePart('Tip',rect(43,-70,14,25)),id:'tip'}];
 p=addConnection(p,{id:'actual-pin',parentId:'body',childId:'antenna',parentAnchor:[50,10],childAnchor:[50,10],type:'pivot',angle:10,min:-70,max:80,padRadius:12});
 p=addConnection(p,{id:'tip-pin',parentId:'antenna',childId:'tip',parentAnchor:[50,-50],childAnchor:[50,-50],type:'pivot',angle:-5,min:-30,max:30,padRadius:10});
 return p;
}

test('all five named tests use only the student-selected actual joint and signed target pose',()=>{
 const p=fixture(),before=structuredClone(p);let assigned=p;
 for(const [index,motion] of MOTION_TESTS.entries())assigned=assignNamedMotion(assigned,motion.name,index%2?'tip-pin':'actual-pin',index%2?-20:50);
 assert.equal(assigned.motionTests.length,5);assert.deepEqual(p,before);assert.deepEqual(assigned.parts,p.parts);assert.deepEqual(assigned.joints,p.joints);
 for(const motion of MOTION_TESTS){
  const mapping=assigned.motionTests.find(item=>item.name===motion.name),preview=previewNamedMotion(assigned,motion.name);
  assert.equal(preview.joints.find(joint=>joint.id===mapping.jointId).angle,mapping.angle);
  assert.deepEqual(preview.joints.filter(joint=>joint.id!==mapping.jointId),assigned.joints.filter(joint=>joint.id!==mapping.jointId));
  assert.deepEqual(preview.parts,assigned.parts);assert.deepEqual(preview.assets,assigned.assets);assert.deepEqual(preview.motionTests,assigned.motionTests);
 }
 assert.deepEqual(assigned.joints,p.joints,'recording and previewing never overwrite the saved rest pose');
});

test('motion preview interpolates from the saved angle and Restore is exact across repeated tests',()=>{
 const assigned=assignNamedMotion(fixture(),'wave','actual-pin',-50),original=structuredClone(assigned);
 const half=previewNamedMotion(assigned,'wave',.5);near(half.joints[0].angle,-20);
 const matrices=partTransforms(half),joint=half.joints[0],parentPin=transformPoint(matrices[joint.parentId],joint.parentAnchor),childPin=transformPoint(matrices[joint.childId],joint.childAnchor);parentPin.forEach((value,index)=>near(value,childPin[index]));
 for(let index=0;index<10;index++)previewNamedMotion(assigned,'wave',index/10);
 assert.deepEqual(assigned,original);assert.deepEqual(previewNamedMotion(assigned,'wave',0),assigned);
 assigned.joints[0].min=-25;const clamped=previewNamedMotion(assigned,'wave');assert.equal(clamped.joints[0].angle,-25);assert.equal(clamped.motionTests[0].angle,-50,'limit clamping never rewrites the recorded intent');
});

test('named motion mappings survive JSON save/reopen, can replace one test and can be cleared',()=>{
 let p=assignNamedMotion(fixture(),'nod','actual-pin',40);p=assignNamedMotion(p,'step','tip-pin',20);p=assignNamedMotion(p,'nod','actual-pin',-40);
 assert.equal(p.motionTests.length,2);const reopened=parseStudioProject(serializeStudioProject(p));assert.deepEqual(reopened,p);assert.equal(previewNamedMotion(reopened,'nod').joints[0].angle,-40);
 const cleared=clearNamedMotion(reopened,'nod');assert.equal(cleared.motionTests.length,1);assert.equal(cleared.motionTests[0].name,'step');assert.deepEqual(cleared.parts,reopened.parts);assert.deepEqual(cleared.joints,reopened.joints);
 assert.throws(()=>previewNamedMotion(cleared,'nod'),{code:'MOTION_NOT_ASSIGNED'});assert.equal(clearNamedMotion(cleared,'step').motionTests,undefined);
});

test('recording and preview guard locked descendants, fixed joints, empty targets and malformed inputs',()=>{
 const p=fixture();assert.throws(()=>assignNamedMotion(p,'nod','missing',20),{code:'JOINT_NOT_FOUND'});
 for(const angle of [NaN,Infinity,'30',81,-71])assert.throws(()=>assignNamedMotion(p,'nod','actual-pin',angle),{code:'INVALID_MOTION_ANGLE'});
 assert.throws(()=>assignNamedMotion(p,'nod','actual-pin',10),{code:'EMPTY_MOTION'});
 for(const name of ['walk','',null])assert.throws(()=>assignNamedMotion(p,name,'actual-pin',30),{code:'INVALID_MOTION_NAME'});
 const fixed=structuredClone(p);Object.assign(fixed.joints[0],{type:'fixed',angle:0,min:0,max:0});assert.throws(()=>assignNamedMotion(fixed,'nod','actual-pin',0),{code:'FIXED_CONNECTION'});
 const locked=structuredClone(p);locked.parts[2].locked=true;assert.throws(()=>assignNamedMotion(locked,'nod','actual-pin',30),{code:'LOCKED_PART'});
 const recorded=assignNamedMotion(p,'nod','actual-pin',30);recorded.parts[2].locked=true;assert.throws(()=>previewNamedMotion(recorded,'nod'),{code:'LOCKED_PART'});assert.deepEqual(previewNamedMotion(recorded,'nod',0),normalizeStudioProject(recorded));
 for(const phase of [-1,2,NaN,'1'])assert.throws(()=>previewNamedMotion(recorded,'nod',phase),{code:'INVALID_MOTION_PHASE'});
 assert.throws(()=>previewNamedMotion(p,'wave'),{code:'MOTION_NOT_ASSIGNED'});
});

test('saved versions retain their own tests and stale tests do not silently show an unmoving preview',()=>{
 const p=assignNamedMotion(fixture(),'wave','actual-pin',40),original=fixture();
 p.revisions=[{id:'old',label:'Before tests',snapshot:original},{id:'new',label:'Recorded wave',snapshot:{...p,revisions:[]}}];
 const reopened=parseStudioProject(serializeStudioProject(p));
 assert.equal(reopened.revisions[0].snapshot.motionTests,undefined);assert.deepEqual(reopened.revisions[1].snapshot.motionTests,p.motionTests);
 const unchanged=structuredClone(p);unchanged.joints[0].angle=40;assert.throws(()=>previewNamedMotion(unchanged,'wave'),{code:'EMPTY_MOTION'});
 const removed=structuredClone(p);removed.joints=removed.joints.filter(j=>j.id!=='actual-pin');assert.equal(normalizeStudioProject(removed).motionTests,undefined);
});
