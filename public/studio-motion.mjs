import {normalizeStudioProject,assertLockedPartsUnchanged} from './studio-model.mjs?v=0.10.0';

// These names label motions authored by the student. They do not identify
// anatomy, infer a direction, or impose a human skeleton on the artwork.
export const MOTION_TESTS=Object.freeze([
 Object.freeze({name:'raise-hand',en:'Raise hand',zh:'抬手'}),
 Object.freeze({name:'wave',en:'Wave',zh:'挥手'}),
 Object.freeze({name:'nod',en:'Nod',zh:'点头'}),
 Object.freeze({name:'step',en:'Step',zh:'迈步'}),
 Object.freeze({name:'bend-knee',en:'Bend knee',zh:'屈膝'})
]);
const names=new Set(MOTION_TESTS.map(test=>test.name));
const fail=(message,code)=>{throw Object.assign(new Error(message),{code});};
function validName(name){if(!names.has(name))fail('Choose one of the five movement tests.','INVALID_MOTION_NAME');}
function movingJoint(project,jointId){
 const joint=project.joints.find(j=>j.id===jointId);
 if(!joint)fail('Choose an existing joint for this movement test.','JOINT_NOT_FOUND');
 if(joint.type==='fixed')fail('Choose a moving joint for this test.','FIXED_CONNECTION');
 if(project.parts.find(part=>part.id===joint.childId)?.locked)fail('Unlock this piece before recording or trying its movement.','LOCKED_PART');
 return joint;
}

/** Record the actual end pose chosen with the joint slider, never a guessed pose. */
export function assignNamedMotion(project,name,jointId,angle){
 validName(name);const before=normalizeStudioProject(project),joint=movingJoint(before,jointId);
 if(typeof angle!=='number'||!Number.isFinite(angle)||angle<joint.min||angle>joint.max)fail('Choose a test angle inside this joint’s movement limits.','INVALID_MOTION_ANGLE');
 if(Math.abs(angle-joint.angle)<1e-7)fail('Move the joint slider to a new pose before saving this test.','EMPTY_MOTION');
 const next=structuredClone(before);next.motionTests=[...(next.motionTests||[]).filter(test=>test.name!==name),{name,jointId,angle}];
 const normalized=normalizeStudioProject(next);
 // The end pose must also preserve locked descendants, not only this piece.
 previewNamedMotion(normalized,name);
 return normalized;
}

export function clearNamedMotion(project,name){
 validName(name);const next=normalizeStudioProject(project);
 next.motionTests=(next.motionTests||[]).filter(test=>test.name!==name);
 if(!next.motionTests.length)delete next.motionTests;
 return normalizeStudioProject(next);
}

/** A temporary pose between the saved rest pose (0) and the recorded target (1).
 * Later limit changes clamp the target. The mapping and source project remain
 * unchanged, so Restore can always display the original saved project directly.
 */
export function previewNamedMotion(project,name,phase=1){
 validName(name);
 if(typeof phase!=='number'||!Number.isFinite(phase)||phase<0||phase>1)fail('Movement progress must be between 0 and 1.','INVALID_MOTION_PHASE');
 const before=normalizeStudioProject(project);
 if(phase===0)return before;
 const test=before.motionTests?.find(test=>test.name===name);
 if(!test)fail('Choose a joint and save a test pose for this movement first.','MOTION_NOT_ASSIGNED');
 const next=structuredClone(before),joint=movingJoint(next,test.jointId),end=Math.max(joint.min,Math.min(joint.max,test.angle));
 if(Math.abs(end-joint.angle)<1e-7)fail('This test now ends at the saved pose. Move the slider and record a different end pose.','EMPTY_MOTION');
 joint.angle=joint.angle+(end-joint.angle)*phase;
 return assertLockedPartsUnchanged(before,normalizeStudioProject(next));
}
