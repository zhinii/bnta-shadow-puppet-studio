import test from 'node:test';
import assert from 'node:assert/strict';
import {createClassroomController,exportWorkspaceFile,importWorkspaceFile} from '../public/classroom-app.mjs';
import {createClassroom,applyClassroomAction,exportClassroom} from '../public/classroom-model.mjs';
import {createStudioProject,makePart,normalizeStudioProject} from '../public/studio-model.mjs';

const author={role:'teacher',name:'Author'};
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const action=(type,payload={},groupId='group-a')=>({type,payload,groupId});
const change=(c,type,payload={},groupId='group-a')=>applyClassroomAction(c,action(type,payload,groupId),author);
function fixture(){return change(createClassroom({title:'My puppet story'}),'group.add',{id:'group-a',name:'Our project'});}
function puppetFixture(){const p=createStudioProject();p.title='Panda';p.assets=[{id:'art',name:'Panda artwork',dataUrl:PNG,width:200,height:200}];p.parts=[{...makePart('Body',[[40,20],[120,20],[120,100],[40,100]],'art'),id:'body'},{...makePart('Leg',[[40,100],[120,100],[120,180],[40,180]],'art'),id:'leg'}];p.joints=[{id:'hip',parentId:'body',childId:'leg',parentAnchor:[80,100],childAnchor:[80,100],padRadius:25,min:-90,max:90,angle:0}];return normalizeStudioProject(p);}

test('a file project opens directly into an editable author workspace',()=>{
 const controller=createClassroomController();controller.open(fixture());
 assert.equal(controller.state.screen,'workspace');assert.equal(controller.state.actor.role,'teacher');
 assert.ok(controller.state.actor.memberId);assert.ok(controller.group().members.some(m=>m.id===controller.state.actor.memberId));
 assert.equal(controller.client,undefined);
});

test('file project preserves story, rig, embedded artwork, stage and reflection after closing and opening',async()=>{
 const controller=createClassroomController();controller.open(fixture());const memberId=controller.state.actor.memberId;
 await controller.dispatch(action('story.update',{title:'A new beginning',time:'Today',place:'Our town',characters:'Panda',plot:'Panda learns to help a friend.'}));
 await controller.dispatch(action('character.add',{id:'panda',name:'Panda',brief:'A panda with a red scarf',ownerId:memberId}));
 const puppet=puppetFixture();await controller.dispatch(action('character.update',{characterId:'panda',project:puppet}));
 await controller.dispatch(action('scene.add',{id:'opening',title:'At home',setting:'A courtyard',script:'Panda: How can I help?'}));
 await controller.dispatch(action('stage.update',{sceneId:'opening',stage:{background:PNG,objects:[{id:'performer',type:'character',characterId:'panda',x:100,y:80,width:150,height:220}]}}));
 await controller.dispatch(action('reflection.save',{memberId,text:'I designed the scarf.',sources:'My drawing',tests:'Tested a paper outline against a lamp.'}));
 const before=structuredClone(controller.state.classroom),saved=exportWorkspaceFile(before,[],{groupId:'group-a',tab:'stage',selectedSceneId:'opening'});
 controller.reset();assert.equal(controller.state.classroom,null);assert.equal(controller.state.screen,'welcome');
 const restored=importWorkspaceFile(saved);controller.open(restored.classroom,{groupId:restored.view.groupId});
 assert.deepEqual(controller.group().characters[0].project,puppet);assert.equal(controller.group().characters[0].project.joints[0].padRadius,25);
 assert.equal(controller.group().story.plot,before.groups[0].story.plot);assert.equal(controller.group().scenes[0].script,'Panda: How can I help?');
 assert.equal(controller.group().scenes[0].stage.background,PNG);assert.equal(controller.group().scenes[0].stage.objects[0].characterId,'panda');
 assert.deepEqual(controller.group().reflections,before.groups[0].reflections);assert.equal(restored.view.tab,'stage');
});

test('queued local changes retain both edits and a rejected edit does not poison the next change',async()=>{
 const controller=createClassroomController();controller.open(fixture());
 await Promise.all([controller.dispatch(action('story.update',{plot:'First idea'})),controller.dispatch(action('scene.add',{id:'scene',title:'Our scene'}))]);
 assert.equal(controller.group().story.plot,'First idea');assert.equal(controller.group().scenes[0].title,'Our scene');
 const previous=exportClassroom(controller.state.classroom);await assert.rejects(controller.dispatch(action('character.update',{characterId:'missing',name:'Invalid edit'})));
 assert.equal(exportClassroom(controller.state.classroom),previous);
 await controller.dispatch(action('story.update',{plot:'Next idea'}));assert.equal(controller.group().story.plot,'Next idea');
});

test('closing or replacing a project prevents queued work from being applied to a different session',async()=>{
 for(const replace of [false,true]){const controller=createClassroomController();controller.open(fixture());
  const pending=controller.dispatch(action('story.update',{plot:'Old project change'}));
  if(replace)controller.open(createClassroom({title:'New project'}));else controller.reset();
  await assert.rejects(pending,/changed|closed|previous/i);
  if(replace){assert.equal(controller.state.classroom.title,'New project');assert.ok(!JSON.stringify(controller.state.classroom).includes('Old project change'));}
  else assert.equal(controller.state.classroom,null);
 }
});

test('explicit workspace download preserves typed drafts separately from accepted project work',()=>{
 const c=fixture(),key=c.id+':group-a:story.update::::::',drafts=[[key,{title:'Uncommitted title',plot:'Typed but not saved'}]],view={groupId:'group-a',tab:'story',selectedCharacterId:null,selectedSceneId:null,selectedObjectId:null};
 const restored=importWorkspaceFile(exportWorkspaceFile(c,drafts,view));assert.equal(restored.classroom.groups[0].story.title,'');assert.equal(restored.classroom.groups[0].story.plot,'');assert.deepEqual(restored.drafts,drafts);assert.equal(restored.view.tab,'story');assert.equal(c.groups[0].story.plot,'');
});

test('workspace export works without optional view state and imports legacy class files without dropping groups',()=>{
 let c=fixture();c=change(c,'group.add',{id:'group-b',name:'Other legacy group'});c=change(c,'story.update',{plot:'Legacy second-group work'},'group-b');
 const defaults=importWorkspaceFile(exportWorkspaceFile(c));assert.deepEqual(defaults.classroom,c);assert.deepEqual(defaults.drafts,[]);
 for(const source of [JSON.stringify(c),exportClassroom(c)]){const restored=importWorkspaceFile(source);assert.deepEqual(restored.classroom,c);assert.deepEqual(restored.drafts,[]);assert.deepEqual(restored.view,{authorByGroup:{}});}
});

test('downloaded projects preserve each section author and discard invalid author references',()=>{
 let c=fixture();c=change(c,'member.add',{id:'alice',name:'Alice'});c=change(c,'member.add',{id:'bob',name:'Bob'});
 c=change(c,'group.add',{id:'group-b',name:'Second section'});c=change(c,'member.add',{id:'chen',name:'Chen'},'group-b');
 const authors={'group-a':'bob','group-b':'chen','missing-group':'alice'};
 const restored=importWorkspaceFile(exportWorkspaceFile(c,[],{groupId:'group-a',actor:{memberId:'bob'},authorByGroup:authors}));
 assert.deepEqual(restored.view.authorByGroup,{'group-a':'bob','group-b':'chen'});
 const controller=createClassroomController();controller.open(restored.classroom,{groupId:restored.view.groupId,actor:{memberId:restored.view.memberId},authorByGroup:restored.view.authorByGroup});
 assert.equal(controller.state.actor.memberId,'bob');assert.equal(controller.state.actor.name,'Bob');assert.deepEqual(controller.state.authorByGroup,{'group-a':'bob','group-b':'chen'});
 const invalid=importWorkspaceFile(exportWorkspaceFile(c,[],{authorByGroup:{'group-a':'chen','group-b':'missing-member'}}));assert.deepEqual(invalid.view.authorByGroup,{});
});

test('workspace files exclude legacy credential fields in both directions',()=>{
 const c=fixture(),key=c.id+':group-a:story.update::::::',values={plot:'Keep this draft',password:'never-export-password',passphrase:'never-export-passphrase',token:'never-export-token'},view={groupId:'group-a',tab:'story',selectedCharacterId:null,selectedSceneId:null,selectedObjectId:null};
 const exported=exportWorkspaceFile(c,[[key,values]],view);assert.ok(!exported.includes('never-export'));assert.deepEqual(importWorkspaceFile(exported).drafts,[[key,{plot:'Keep this draft'}]]);
 const incoming=JSON.stringify({...c,workspaceDrafts:[[key,values]],workspaceView:view});assert.deepEqual(importWorkspaceFile(incoming).drafts,[[key,{plot:'Keep this draft'}]]);
});

test('workspace imports reject malformed and prototype-bearing data and ignore another project drafts',()=>{
 const c=fixture();for(const source of ['not json','null','[]','{"version":1,"__proto__":{"polluted":true}}',JSON.stringify({...c,workspaceDrafts:JSON.parse('[["'+c.id+':story",{"constructor":{"prototype":{"polluted":true}}}]]')})])assert.throws(()=>importWorkspaceFile(source));
 const restored=importWorkspaceFile(JSON.stringify({...c,workspaceDrafts:[['another-class:story',{plot:'Wrong project'}]]}));assert.deepEqual(restored.drafts,[]);assert.equal({}.polluted,undefined);
});
