import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTeacher,renderSubmissionReview} from '../public/classroom-teacher.mjs';
import {assessmentAIContext} from '../public/classroom-ai.mjs';

const classroom={id:'class1',title:'Grade 8',groups:[{id:'g1',name:'Group 1',members:[{id:'m1',name:'Student A'}],story:{title:'A question',plot:'A student tests two ideas.'},characters:[{id:'c1',name:'Scientist',ownerId:'m1',brief:'Modern scientist',project:{parts:[{}],joints:[]},history:[]}],scenes:[{id:'s1',title:'A workshop',script:'Let us test it.'}],reflections:[{memberId:'m1',text:'I changed the sleeve.',tests:'The first pin was loose.',sources:'An image from the museum.'}],events:[{id:'e1',actorId:'m1',type:'character.update',at:'2026-11-26T05:00:00Z'}],assessments:[],submission:null}],rubric:[{id:'construction',title:'Construction',description:'Overlapping ends and aligned holes.',maxScore:4}]};

test('teacher classes and groups expose clear form actions and escape all student text',()=>{
  const malicious=structuredClone(classroom);malicious.groups[0].members[0].name='<img src=x onerror=alert(1)>';
  const html=renderTeacher({classroom:malicious,teacherTab:'groups',language:'en'});
  assert.match(html,/data-form="add-group"/);
  assert.match(html,/data-form="move-member"/);
  assert.match(html,/data-action="teacher-open-group"/);
  assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/&lt;img/);
  const list=renderTeacher({classes:[{id:'class1',title:'Grade 8'}],capabilities:{available:true,teacherSignedIn:true}});
  assert.match(list,/data-form="create-class"/);assert.match(list,/data-class-id="class1"/);
});

test('teacher can draft but cannot confirm grades until a current submission exists',()=>{
  let html=renderTeacher({classroom,teacherTab:'assessment',assessmentGroupId:'g1',assessmentMemberId:'m1'});
  assert.match(html,/name="decision" value="draft"/);
  assert.match(html,/name="decision" value="confirm" disabled/);
  assert.match(html,/name="score:construction"/);
  assert.match(html,/value="reflection:m1"/);
  const submitted=structuredClone(classroom);submitted.groups[0].submission={id:'sub1',status:'submitted',submittedAt:'2026-11-26T05:00:00Z'};
  html=renderTeacher({classroom:submitted,teacherTab:'assessment',assessmentMemberId:'m1'});
  assert.doesNotMatch(html,/name="decision" value="confirm" disabled/);
  assert.match(html,/data-action="ai-feedback"/);
  assert.match(html,/not establish effort or teamwork/);
});

test('individual assessment context excludes other students and identifies unverifiable claims',()=>{
  const group=structuredClone(classroom.groups[0]);group.characters.push({id:'other',name:'Other student work',ownerId:'m2',project:{parts:[{},{}]}});group.reflections.push({memberId:'m2',text:'Private peer reflection'});group.events.push({id:'e2',actorId:'m2',type:'story.update'});
  const context=assessmentAIContext(classroom,group,'m1');
  assert.ok(context.evidence.some(e=>e.id==='character:c1'));
  assert.ok(context.evidence.some(e=>e.id==='reflection:m1'));
  assert.ok(context.evidence.some(e=>e.id==='event:e1'));
  assert.ok(!JSON.stringify(context).includes('Other student work'));
  assert.ok(!JSON.stringify(context).includes('Private peer reflection'));
  assert.match(context.limitations.join(' '),/not independently verified/);
});

test('Chinese teacher workflow translates primary task labels',()=>{
  const html=renderTeacher({classroom,teacherTab:'assessment',language:'zh'});
  assert.match(html,/教师工作空间/);assert.match(html,/确认评价/);assert.match(html,/保存草稿/);
});

test('teacher entry never offers a disconnected shared create action and sign-in remains a normal safe link',()=>{
  const unavailable=renderTeacher({capabilities:{available:false,teacherSignedIn:false}});
  assert.doesNotMatch(unavailable,/data-form="create-class"/);
  assert.match(unavailable,/data-action="new-local-classroom"/);
  const signedOut=renderTeacher({capabilities:{available:true,teacherSignedIn:false,signInPath:'/signin-with-chatgpt?returnTo=%2F'}});
  assert.match(signedOut,/<a[^>]*href="\/signin-with-chatgpt\?returnTo=%2F"[^>]*target="_top"/);
  assert.doesNotMatch(renderTeacher({signInPath:'//evil.example'}),/href="\/\/evil/);
});

test('feedback preview exposes actual evidence and questions with explicit draft action only',()=>{
  const html=renderTeacher({classroom,teacherTab:'assessment',aiProposal:{task:'feedback',reply:'Review these suggestions',proposal:{observations:[{criterion:'construction',evidenceRefs:['reflection:m1'],comment:'Retest the loose pin.'}],questions:['What happened after the repair?']},warnings:[]}});
  assert.match(html,/Retest the loose pin/);assert.match(html,/reflection:m1/);assert.match(html,/What happened after the repair/);
  assert.match(html,/data-action="use-feedback-draft"/);assert.match(html,/not saved/);
});

test('submitted review shows frozen work and archived versions instead of current edits',()=>{
  const c=structuredClone(classroom),g=c.groups[0];
  const snapshot=structuredClone(g);snapshot.story.title='Frozen story';snapshot.scenes[0].script='The submitted dialogue.';snapshot.scenes[0].stage={width:960,height:540,backgroundColor:'#f4eddc',objects:[{id:'prop1',type:'text',text:'Frozen stage label',x:50,y:50,width:100,height:50,fill:'#225544'}]};
  const earlier={id:'sub1',submittedAt:'2026-11-25T05:00:00Z',submittedBy:'m1',status:'submitted',snapshot};
  g.story.title='Changed live title';g.scenes[0].script='Changed live dialogue';g.submission={...earlier,id:'sub2',submittedAt:'2026-11-26T05:00:00Z',snapshot:structuredClone(g)};g.submissionHistory=[earlier];
  const before=JSON.stringify(c);
  const html=renderSubmissionReview({classroom:c,groupId:'g1',reviewSubmission:earlier,language:'en'});
  assert.match(html,/Frozen story/);assert.match(html,/The submitted dialogue/);assert.match(html,/Frozen stage label/);
  assert.doesNotMatch(html,/Changed live title|Changed live dialogue/);
  assert.match(html,/data-action="close-submission-review"/);assert.match(html,/data-action="download-submission"/);
  assert.match(html,/data-action="review-submission" data-id="sub1"/);
  assert.doesNotMatch(html,/data-action="select-object"|<textarea|<input|<form/);
  assert.equal(JSON.stringify(c),before);
  const wrapped=renderTeacher({classroom:c,groupId:'g1',reviewSubmission:earlier,teacherTab:'projects'});
  assert.match(wrapped,/class="classroom-app"/);assert.match(wrapped,/Submitted version · read only/);
});

test('teacher notices surface errors, pending updates and main navigation',()=>{
  const html=renderTeacher({classroom,teacherTab:'groups',error:'Could not save',pendingUpdate:true});
  assert.match(html,/role="alert">Could not save/);assert.match(html,/data-action="refresh-classroom"/);
  assert.match(html,/data-action="home"/);assert.match(html,/data-action="language"/);assert.match(html,/data-action="download-classroom"/);
});
