import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderClassroom,renderStudentWorkspace,renderJoin,renderStageCanvas} from '../public/classroom-views.mjs';

const image='data:image/png;base64,iVBORw0KGgo=';
const makeState=(overrides={})=>({screen:'workspace',tab:'story',language:'en',storageMode:'local',actor:{role:'student',memberId:'m1',name:'Lin'},groupId:'g1',selectedSceneId:'s1',classroom:{id:'class',title:'Grade 8',rubric:[{id:'testing',title:'Testing',maxScore:4}],groups:[{id:'g1',name:'Our group',members:[{id:'m1',name:'Lin'},{id:'m2',name:'Bo'}],story:{title:'The journey',time:'Today',place:'Our town',characters:'A student',plot:'A student solves a problem.',relay:[],history:[]},characters:[{id:'c1',name:'Traveller',brief:'A student with a backpack.',ownerId:'m1',project:null,history:[]},{id:'c2',name:'Guide',brief:'A guide.',ownerId:'m2',project:null,history:[]}],scenes:[{id:'s1',title:'The crossroads',setting:'A town path',script:'Traveller: Which way?',history:[],stage:{width:960,height:540,background:null,backgroundColor:'#f4eddc',objects:[]}}],reflections:[],assessments:[],submission:null}]},...overrides});

test('welcome offers class, local project, saved project and quick puppet routes without a sample story',()=>{
 const html=renderClassroom({screen:'welcome',language:'en'});
 for(const action of ['show-join','new-local-classroom','open-classroom','show-teacher','quick-studio'])assert.ok(html.includes(`data-action="${action}"`));
 assert.match(html,/starts fresh when you close or reload/);
 assert.doesNotMatch(html,/Moonlit Legend|Searching for Moonlight|Mountain and Sea/);
});

test('student join separates class lookup from group identity and password',()=>{
 const initial=renderJoin({language:'en'});
 assert.match(initial,/data-form="lookup-class"/);assert.doesNotMatch(initial,/data-form="join-class"/);
 const found=renderJoin({language:'en',joinCode:'ABCD',groupChoices:[{id:'g1',name:'Group one'}]});
 assert.match(found,/data-form="join-class"/);assert.match(found,/name="passphrase"[^>]*type="password"/);
 assert.match(found,/minlength="8"/);assert.match(found,/same name and password/);
});

test('a known unavailable shared service offers working local routes instead of a failing sign-in form',()=>{
 const html=renderJoin({language:'en',capabilities:{available:false},groupChoices:[{id:'stale',name:'Old group'}]});
 assert.match(html,/Shared classes are not connected/);assert.match(html,/data-action="new-local-classroom"/);assert.match(html,/data-action="open-classroom"/);
 assert.doesNotMatch(html,/data-form="lookup-class"|data-form="join-class"/);
});

test('story, character assignment and script remain available without a mandatory waiting gate',()=>{
 const state=makeState();
 const story=renderStudentWorkspace(state);assert.match(story,/data-form="story.update"/);assert.match(story,/data-form="story.handoff"/);assert.match(story,/data-form="ai-story"/);
 assert.match(story,/Everyone can contribute without waiting/);assert.doesNotMatch(story,/Enter Script · Locked/);
 const script=renderStudentWorkspace({...state,tab:'script'});assert.match(script,/data-form="scene.update"/);assert.match(script,/data-form="ai-script"/);
 const cards=renderStudentWorkspace({...state,tab:'characters'});assert.match(cards,/data-form="character.add"/);assert.match(cards,/data-action="open-designer" data-id="c1"/);
 assert.match(cards,/View character/);assert.doesNotMatch(cards,/data-action="remove-character" data-id="c2"/);
});

test('other students characters use a read-only preview route and never advertise an editing action',()=>{
 const state=makeState({tab:'characters'}),cards=renderStudentWorkspace(state);
 assert.match(cards,/data-action="select-character" data-id="c2" data-tab="design"/);
 assert.doesNotMatch(cards,/data-action="open-designer" data-id="c2"/);
 const design=renderStudentWorkspace({...state,tab:'design',selectedCharacterId:'c2'});
 assert.match(design,/its designer can edit it/);assert.doesNotMatch(design,/data-action="open-designer"/);
});

test('home allows resuming an already-open project',()=>{
 const html=renderClassroom({...makeState(),screen:'welcome'});
 assert.match(html,/data-action="resume-project"/);assert.match(html,/Continue your project/);
});

test('student-authored text and status messages are escaped everywhere',()=>{
 const state=makeState({status:'<img src=x onerror=alert(1)>',error:'<script>bad()</script>'});
 state.classroom.groups[0].name='Group <script>bad()</script>';
 state.classroom.groups[0].story.plot='</textarea><script>bad()</script>';
 state.classroom.groups[0].characters[0].name='<img src=x onerror=alert(1)>';
 for(const tab of ['story','characters','script','design','stage','make']){
  const html=renderStudentWorkspace({...state,tab});assert.doesNotMatch(html,/<script>|<img src=x/);assert.match(html,/&lt;script&gt;|&lt;img/);
 }
});

test('stage renders genuine raster assets and rejects URL and markup injection',()=>{
 const state=makeState(),g=state.classroom.groups[0],scene=g.scenes[0];
 scene.stage.background={dataUrl:image,name:'Sky'};
 scene.stage.objects=[{id:'image1',type:'image',dataUrl:image,x:20,y:30,width:80,height:90,z:0},{id:'bad',type:'image',dataUrl:'javascript:alert(1)',x:Infinity,y:NaN,width:80,height:90,z:1},{id:'text',type:'text',text:'<script>bad()</script>',x:1,y:2,width:80,height:30,z:2,fill:'red" onload="bad()'}];
 const html=renderStageCanvas(g,scene,state);
 assert.match(html,/viewBox="0 0 960 540"/);assert.match(html,/data:image\/png;base64/);
 assert.doesNotMatch(html,/javascript:|onload=|Infinity|NaN|<script>/);assert.match(html,/&lt;script&gt;/);
 assert.match(html,/data-stage-object="image1"/);assert.match(html,/role="button" tabindex="0"/);
 const preview=renderStageCanvas(g,scene,{...state,scenePreview:true});assert.doesNotMatch(preview,/data-stage-object=|role="button"/);
});

test('stage exposes obvious background selection, AI prompt limit, object adjustments and rehearsal',()=>{
 const html=renderStudentWorkspace(makeState({tab:'stage'}));
 assert.match(html,/data-action="upload-background"/);assert.match(html,/Choose background image/);
 assert.match(html,/data-form="generate-stage-image"/);assert.match(html,/name="stageImagePrompt"[^>]*maxlength="800"/);assert.match(html,/data-stage-prompt-count/);
 assert.match(html,/data-form="stage-object"/);assert.match(html,/name="width"/);assert.match(html,/data-action="preview-stage"/);
});

test('AI changes show a proposal with explicit acceptance and rejection before applying',()=>{
 const html=renderStudentWorkspace(makeState({tab:'script',aiProposal:{target:'script',reply:'Try a shorter exchange.',proposal:{script:'Traveller: Hello.'}}}));
 assert.match(html,/Traveller: Hello\./);assert.match(html,/data-action="ai-apply"/);assert.match(html,/data-action="ai-reject"/);
});

test('AI story and stage-image changes show their real content before acceptance',()=>{
 const story=renderStudentWorkspace(makeState({aiProposal:{target:'story',reply:'A possible direction.',proposal:{story:{title:'Our title',time:'Winter',place:'The library',characters:'A fox',plot:'The fox finds a book.'}}}}));
 for(const value of ['Our title','Winter','The library','A fox','The fox finds a book.'])assert.ok(story.includes(value));
 const stage=renderStudentWorkspace(makeState({tab:'stage',aiProposal:{target:'stage-image',reply:'Review this backdrop.',proposal:{background:{asset:{dataUrl:image}}}}}));
 assert.match(stage,/cr-ai-background-preview/);assert.match(stage,/Use background/);assert.match(stage,/data-target="stage-image"/);
 assert.match(stage,/type="button" data-action="generate-stage-image"/);
});

test('stage AI proposal previews additions without changing the accepted stage',()=>{
 const state=makeState({tab:'stage',aiProposal:{target:'stage',proposal:{objects:[{id:'proposal',type:'text',text:'Proposed words',x:10,y:10,width:300,height:50,fill:'#245344'}]}}});
 const before=structuredClone(state),html=renderStudentWorkspace(state);
 assert.match(html,/cr-ai-stage-preview/);assert.match(html,/Proposed words/);assert.deepEqual(state,before);
});

test('shared conflicts expose refresh and preserve a clear teacher return route',()=>{
 const html=renderStudentWorkspace(makeState({storageMode:'shared',pendingUpdate:true,actor:{role:'teacher'}}));
 assert.match(html,/data-action="refresh-classroom"/);assert.match(html,/typed draft is still here/);assert.match(html,/data-action="show-teacher"/);
});

test('make workflow keeps physical fabrication and reflection visible and hides unconfirmed grades',()=>{
 const state=makeState({tab:'make'}),g=state.classroom.groups[0];
 g.assessments=[{memberId:'m1',confirmed:false,comment:'Private draft',scores:{testing:1}},{memberId:'m2',confirmed:true,comment:'Another student grade',scores:{testing:4}},{memberId:'m1',confirmed:true,comment:'Use your test evidence.',scores:{testing:3}}];
 const html=renderStudentWorkspace(state);
 assert.match(html,/calibration ruler/);assert.match(html,/Overlap the rounded ends/);assert.match(html,/control rods/);assert.match(html,/data-form="reflection.save"/);
 assert.match(html,/data-action="submit-project"/);assert.match(html,/Use your test evidence/);assert.doesNotMatch(html,/Private draft|Another student grade/);
 assert.match(html,/References, traditions and help you used/);
});

test('teacher reflection requires choosing a student and cannot invent a student when the group is empty',()=>{
 const state=makeState({tab:'make',actor:{role:'teacher'}}),html=renderStudentWorkspace(state);
 assert.match(html,/select name="memberId" required/);assert.match(html,/Choose a student/);assert.match(html,/as the teacher/);
 state.classroom.groups[0].members=[];
 const empty=renderStudentWorkspace(state);assert.doesNotMatch(empty,/data-form="reflection.save"/);assert.match(empty,/Add group members/);
});

test('saved classroom and temporary workspace messages are distinct in both languages',()=>{
 const shared=renderStudentWorkspace(makeState({storageMode:'shared',language:'zh'}));
 assert.match(shared,/班级项目会保存/);assert.doesNotMatch(shared,/关闭或刷新后将开启新的工作区/);
 assert.match(shared,/故事/);assert.match(shared,/角色/);assert.match(shared,/制作与分享/);
 const local=renderStudentWorkspace(makeState());assert.match(local,/starts fresh/);assert.match(local,/data-action="choose-member"/);
});

test('responsive styles provide single-column mobile workspace, readable inputs and visible keyboard focus',async()=>{
 const css=await readFile(new URL('../public/classroom.css',import.meta.url),'utf8');
 assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/\.cr-content-grid,\.classroom-grid\{grid-template-columns:1fr/);
 assert.match(css,/min-height:46px/);assert.match(css,/:focus-visible/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
