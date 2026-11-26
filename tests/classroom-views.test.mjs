import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderClassroom,renderStudentWorkspace,renderStageCanvas} from '../public/classroom-views.mjs';

const image='data:image/png;base64,iVBORw0KGgo=';
const makeState=(overrides={})=>({screen:'workspace',tab:'story',language:'en',storageMode:'local',actor:{role:'student',memberId:'m1',name:'Lin'},groupId:'g1',selectedSceneId:'s1',classroom:{id:'class',title:'Grade 8',rubric:[{id:'testing',title:'Testing',maxScore:4}],groups:[{id:'g1',name:'Our group',members:[{id:'m1',name:'Lin'},{id:'m2',name:'Bo'}],story:{title:'The journey',time:'Today',place:'Our town',characters:'A student',plot:'A student solves a problem.',relay:[],history:[]},characters:[{id:'c1',name:'Traveller',brief:'A student with a backpack.',ownerId:'m1',project:null,history:[]},{id:'c2',name:'Guide',brief:'A guide.',ownerId:'m2',project:null,history:[]}],scenes:[{id:'s1',title:'The crossroads',setting:'A town path',script:'Traveller: Which way?',history:[],stage:{width:960,height:540,background:null,backgroundColor:'#f4eddc',objects:[]}}],reflections:[],assessments:[],submission:null}]},...overrides});

test('welcome starts a new project or opens a JSON file without any classroom or account steps',()=>{
 const html=renderClassroom({screen:'welcome',language:'en'});
 for(const action of ['new-local-classroom','open-classroom','quick-studio'])assert.ok(html.includes(`data-action="${action}"`));
 assert.match(html,/Closing or reloading starts fresh/);assert.match(html,/project JSON file/);assert.match(html,/Keep the JSON file and open it next time/);
 assert.doesNotMatch(html,/class code|password|sign.in|show-join|show-teacher|Teacher workspace/i);
 assert.doesNotMatch(html,/Moonlit Legend|Searching for Moonlight|Mountain and Sea/);
});

test('old join navigation safely returns to file entry instead of showing a class-code gate',()=>{
 const html=renderClassroom({screen:'join',language:'en',joinCode:'ABCD',capabilities:{available:true}});
 assert.match(html,/data-action="new-local-classroom"/);assert.match(html,/data-action="open-classroom"/);
 assert.doesNotMatch(html,/lookup-class|join-class|passphrase|ABCD/);
});

test('story, characters and script stay directly editable without assignment or relay controls',()=>{
 const state=makeState();
 const story=renderStudentWorkspace(state);assert.match(story,/data-form="story.update"/);assert.match(story,/data-form="ai-story"/);
 assert.doesNotMatch(story,/story.handoff|Who starts this part|Enter Script · Locked/);
 const script=renderStudentWorkspace({...state,tab:'script'});assert.match(script,/data-form="scene.update"/);assert.match(script,/data-form="ai-script"/);
 const cards=renderStudentWorkspace({...state,tab:'characters'});assert.match(cards,/data-form="character.add"/);assert.match(cards,/data-action="open-designer" data-id="c1"/);
 assert.match(cards,/data-action="open-designer" data-id="c2"/);assert.match(cards,/data-action="remove-character" data-id="c2"/);
 assert.doesNotMatch(cards,/name="ownerId"|claim-character|Not assigned/);
});

test('imported character ownership never blocks a student from editing their local file',()=>{
 const state=makeState({tab:'characters'}),cards=renderStudentWorkspace(state);
 assert.match(cards,/data-action="open-designer" data-id="c2"/);
 const design=renderStudentWorkspace({...state,tab:'design',selectedCharacterId:'c2'});
 assert.match(design,/data-action="open-designer" data-id="c2"/);assert.doesNotMatch(design,/teammate|its designer|Not assigned/);
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

test('image and character inspectors do not offer text or fill edits that cannot change artwork',()=>{
 for(const type of ['image','character']){
  const state=makeState({tab:'stage',selectedObjectId:'chosen'}),stage=state.classroom.groups[0].scenes[0].stage;
  stage.objects=[{id:'chosen',type,characterId:'c1',dataUrl:image,x:10,y:20,width:80,height:90,z:0}];
  const html=renderStudentWorkspace(state),form=html.match(/<form data-form="stage-object"[\s\S]*?<\/form>/)?.[0];
  assert.ok(form);assert.doesNotMatch(form,/name="(?:text|shape|fill)"/);assert.match(form,/name="width"/);assert.match(form,/name="rotation"/);
  assert.match(html,/data-action="clear-selection"/);assert.match(html,/Add another text or shape/);
 }
});

test('AI advice has no pretend apply action and a new backdrop exposes its brief before generation',()=>{
 const advice=renderStudentWorkspace(makeState({aiProposal:{target:'story',reply:'Discuss this idea.',proposal:null,warnings:['No editable proposal was returned.']}}));
 assert.match(advice,/No editable proposal was returned/);assert.doesNotMatch(advice,/data-action="ai-apply"/);
 const backdrop=renderStudentWorkspace(makeState({tab:'stage',aiProposal:{target:'stage',reply:'A new background.',proposal:{objects:[],updates:[],backgroundRequest:{kind:'generate-new-backdrop',prompt:'A moonlit courtyard <with lanterns>'}}}}));
 assert.match(backdrop,/A moonlit courtyard &lt;with lanterns&gt;/);assert.match(backdrop,/data-action="generate-ai-backdrop"/);assert.doesNotMatch(backdrop,/data-action="ai-apply"/);
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

test('legacy network state never reintroduces synchronization or account controls',()=>{
 const html=renderStudentWorkspace(makeState({storageMode:'shared',pendingUpdate:true,actor:{role:'teacher'}}));
 assert.doesNotMatch(html,/refresh-classroom|show-teacher|choose-member|Sign in|newer version/);
 assert.match(html,/data-action="download-classroom"/);assert.match(html,/data-action="open-classroom"/);
});

test('make workflow keeps fabrication and reflection then downloads a complete file instead of submitting online',()=>{
 const state=makeState({tab:'make'}),g=state.classroom.groups[0];
 g.assessments=[{memberId:'m1',confirmed:false,comment:'Private draft',scores:{testing:1}},{memberId:'m2',confirmed:true,comment:'Another student grade',scores:{testing:4}},{memberId:'m1',confirmed:true,comment:'Use your test evidence.',scores:{testing:3}}];
 const html=renderStudentWorkspace(state);
 assert.match(html,/calibration ruler/);assert.match(html,/Overlap the rounded ends/);assert.match(html,/control rods/);assert.match(html,/data-form="reflection.save"/);
 assert.match(html,/Download one JSON file with your story, puppets, script, stage and reflection/);
 assert.match(html,/choose Open project and select this file/);assert.match(html,/data-action="download-classroom"/);
 assert.doesNotMatch(html,/submit-project|reopen-submission|Private draft|Another student grade|Use your test evidence|Teacher feedback/);
 assert.match(html,/References, traditions and help you used/);
});

test('reflection belongs to the local author without a roster or teacher selection',()=>{
 const state=makeState({tab:'make',actor:{role:'teacher',memberId:'m1'}}),html=renderStudentWorkspace(state);
 assert.match(html,/type="hidden" name="memberId" value="m1"/);assert.match(html,/data-form="reflection.save"/);
 assert.doesNotMatch(html,/select name="memberId"|Choose a student|teacher workspace|Add group members/i);
});

test('both languages clearly explain downloading and reopening a JSON project',()=>{
 const zh=renderStudentWorkspace(makeState({language:'zh'}));
 assert.match(zh,/JSON文件/);assert.match(zh,/以后在这里打开该文件即可继续/);assert.match(zh,/故事/);assert.match(zh,/角色/);assert.match(zh,/制作与保存/);
 assert.doesNotMatch(zh,/班级代码|登录|教师工作区/);
 const en=renderStudentWorkspace(makeState());assert.match(en,/starts fresh/);assert.match(en,/Open that file here to continue later/);
});

test('legacy multi-workspace files expose every imported project without showing group administration',()=>{
 const state=makeState();assert.doesNotMatch(renderStudentWorkspace(state),/data-form="choose-workspace"/);
 state.classroom.groups.push({...structuredClone(state.classroom.groups[0]),id:'g2',name:'Another imported work'});
 const html=renderStudentWorkspace(state);assert.match(html,/data-form="choose-workspace"/);assert.match(html,/value="g2"/);assert.match(html,/Another imported work/);
 assert.doesNotMatch(html,/group members|Teacher workspace|Add group/);
});

test('responsive styles provide single-column mobile workspace, readable inputs and visible keyboard focus',async()=>{
 const css=await readFile(new URL('../public/classroom.css',import.meta.url),'utf8');
 assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/\.cr-content-grid,\.classroom-grid\{grid-template-columns:1fr/);
 assert.match(css,/min-height:46px/);assert.match(css,/:focus-visible/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
