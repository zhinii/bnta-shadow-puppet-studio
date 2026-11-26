import test from 'node:test';
import assert from 'node:assert/strict';
import {createClassroom,applyClassroomAction,exportClassroom,importClassroom,normalizeClassroom} from '../public/classroom-model.mjs';
import {normalizeScriptFormats,formatScriptSelection,rebaseScriptFormats,renderScriptPreview} from '../public/classroom-script-format.mjs';
import {prepareHistoryPreview,mergeHistoryDraft} from '../public/classroom-history.mjs';
import {exportWorkspaceFile,importWorkspaceFile} from '../public/classroom-app.mjs';

const author={role:'teacher',name:'Designer'};
const act=(project,type,payload={})=>applyClassroomAction(project,{type,groupId:'group',payload},author);
function project(){return act(createClassroom({title:'My puppet story'}),'group.add',{id:'group',name:'Our story'});}
const group=project=>project.groups[0];

test('formatting combines overlapping flags, bounds ranges and rejects executable colors',()=>{
  const spans=normalizeScriptFormats('Hello puppet',[
    {start:-2,end:5,bold:true,color:'#AB1234'},
    {start:2,end:500,italic:true,color:'red; background:url(javascript:alert(1))'},
    {start:7,end:3,underline:true},{start:1.5,end:4,bold:true},
  ]);
  assert.deepEqual(spans,[{start:0,end:2,bold:true,color:'#ab1234'},{start:2,end:5,bold:true,italic:true,color:'#ab1234'},{start:5,end:12,italic:true}]);
  assert.throws(()=>normalizeScriptFormats('text',Array(1001).fill({start:0,end:1,bold:true})),/Too many/);
});
test('selection tools toggle only the selection and retain other formatting',()=>{
  const text='Moon says hello';
  let spans=formatScriptSelection(text,[],{start:0,end:4,format:'bold'});
  spans=formatScriptSelection(text,spans,{start:0,end:9,format:'italic'});
  spans=formatScriptSelection(text,spans,{start:0,end:4,format:'bold'});
  assert.deepEqual(spans,[{start:0,end:9,italic:true}]);
  spans=formatScriptSelection(text,spans,{start:5,end:9,format:'color',value:'#225544'});
  assert.deepEqual(spans,[{start:0,end:5,italic:true},{start:5,end:9,italic:true,color:'#225544'}]);
  spans=formatScriptSelection(text,spans,{start:5,end:9,format:'color',value:null});
  assert.deepEqual(spans,[{start:0,end:9,italic:true}]);
  assert.deepEqual(formatScriptSelection(text,spans,{start:2,end:2,format:'bold'}),spans);
  assert.throws(()=>formatScriptSelection(text,spans,{start:0,end:4,format:'color',value:'red" onmouseover="bad'}),/hex/);
});
test('typing moves unaffected ranges and leaves replacement words plain',()=>{
  const before='Moon: Hello.',spans=[{start:0,end:5,bold:true},{start:6,end:11,italic:true}];
  assert.deepEqual(rebaseScriptFormats(before,'Moon: Well, hello.',spans),[{start:0,end:5,bold:true},{start:13,end:17,italic:true}]);
  assert.deepEqual(rebaseScriptFormats('abc','aXXbc',[{start:0,end:3,underline:true}]),[{start:0,end:1,underline:true},{start:3,end:5,underline:true}]);
  assert.deepEqual(rebaseScriptFormats('abc','ac',[{start:0,end:3,underline:true}]),[{start:0,end:2,underline:true}]);
  assert.deepEqual(rebaseScriptFormats('old scene','NEW WORDS',[{start:0,end:9,bold:true}]),[]);
});
test('preview escapes script markup while preserving safe style and Unicode',()=>{
  const script='<img src=x onerror=bad> & 月亮 🌙\nNext';
  const html=renderScriptPreview(script,[{start:0,end:script.length,bold:true,italic:true,underline:true,color:'#225544'}]);
  assert.ok(html.startsWith('<span style="color:#225544"><u><em><strong>'));
  assert.ok(html.includes('&lt;img src=x onerror=bad&gt; &amp; 月亮 🌙\nNext'));
  assert.ok(!html.includes('<img'));
});
test('scene formatting survives JSON, stage updates and version restore',()=>{
  let p=act(project(),'scene.add',{id:'opening',title:'Opening',script:'Moon enters.',scriptFormats:[{start:0,end:4,bold:true,color:'#225544'}]});
  p=act(p,'stage.update',{sceneId:'opening',stage:{objects:[{id:'prop',type:'shape',x:30,y:40}]}});
  p=act(p,'scene.update',{sceneId:'opening',script:'Moon enters quietly.'});
  const scene=group(p).scenes[0],version=scene.history.at(-1).id;
  assert.deepEqual(scene.scriptFormats,[{start:0,end:4,bold:true,color:'#225544'}]);
  p=act(p,'scene.restore',{sceneId:'opening',historyId:version});
  assert.equal(group(p).scenes[0].script,'Moon enters.');
  assert.equal(group(p).scenes[0].stage.objects[0].id,'prop');
  assert.deepEqual(group(p).scenes[0].scriptFormats,[{start:0,end:4,bold:true,color:'#225544'}]);
  assert.deepEqual(importClassroom(exportClassroom(p)),p);
});
test('formatting-only updates are versioned and old files gain empty formatting safely',()=>{
  let p=act(project(),'scene.add',{id:'s',script:'Hello'});
  const raw=structuredClone(p);delete group(raw).scenes[0].scriptFormats;
  assert.deepEqual(group(normalizeClassroom(raw)).scenes[0].scriptFormats,[]);
  p=act(p,'scene.update',{sceneId:'s',scriptFormats:[{start:0,end:5,underline:true}]});
  assert.deepEqual(group(p).scenes[0].history.at(-1).snapshot.scriptFormats,[]);
  assert.deepEqual(group(p).scenes[0].scriptFormats,[{start:0,end:5,underline:true}]);
});
test('story restore preserves both accepted work and unsaved partial form draft atomically',()=>{
  let p=act(project(),'story.update',{title:'Earlier',time:'Winter',place:'Forest',characters:'Moon',plot:'Original'});
  p=act(p,'story.update',{title:'Current',plot:'Accepted revision'});
  const version=group(p).story.history.at(-1).id;
  p=act(p,'story.restore',{historyId:version,currentDraft:{title:'',plot:'My unfinished thought',relay:[],history:[],id:'attack'}});
  assert.equal(group(p).story.title,'Earlier');assert.equal(group(p).story.plot,'Original');
  assert.equal(group(p).story.history.at(-2).snapshot.plot,'Accepted revision');
  assert.equal(group(p).story.history.at(-1).snapshot.title,'');
  assert.equal(group(p).story.history.at(-1).snapshot.plot,'My unfinished thought');
  assert.equal(group(p).story.history.at(-1).snapshot.time,'Winter');
  assert.equal(group(p).story.history.at(-1).snapshot.relay.length,4);
  const recovered=act(p,'story.restore',{historyId:group(p).story.history.at(-1).id});
  assert.equal(group(recovered).story.plot,'My unfinished thought');
});
test('restoring oldest of five versions still works when two checkpoints evict it',()=>{
  let p=project();
  for(let i=0;i<6;i++)p=act(p,'story.update',{plot:'Version '+i});
  const oldest=structuredClone(group(p).story.history[0]);
  p=act(p,'story.restore',{historyId:oldest.id,currentDraft:{plot:'Typing before restore'}});
  assert.equal(group(p).story.plot,oldest.snapshot.plot);
  assert.equal(group(p).story.history.length,5);
  assert.equal(group(p).story.history.at(-2).snapshot.plot,'Version 5');
  assert.equal(group(p).story.history.at(-1).snapshot.plot,'Typing before restore');
});
test('scene restore retains typed script and formatting in a recoverable version',()=>{
  let p=act(project(),'scene.add',{id:'s',title:'Earlier scene',script:'Original'});
  p=act(p,'scene.update',{sceneId:'s',title:'Current scene',script:'Current'});
  const version=group(p).scenes[0].history.at(-1).id;
  assert.throws(()=>act(p,'scene.restore',{sceneId:'s',historyId:version,currentDraft:{stage:{objects:[{id:'injected'}]}}}),/Invalid stage object/);
  p=act(p,'scene.restore',{sceneId:'s',historyId:version,currentDraft:{script:'Typing…',scriptFormats:[{start:0,end:6,italic:true}]}});
  const restored=group(p).scenes[0];assert.equal(restored.script,'Original');
  assert.equal(restored.history.at(-2).snapshot.script,'Current');
  assert.equal(restored.history.at(-1).snapshot.script,'Typing…');
  assert.deepEqual(restored.history.at(-1).snapshot.scriptFormats,[{start:0,end:6,italic:true}]);
  assert.deepEqual(restored.history.at(-1).snapshot.stage.objects,[]);
});
test('scene restore atomically preserves typed stage edits even when restoring the oldest retained version',()=>{
  let p=act(project(),'scene.add',{id:'s',script:'Moon enters.'});
  for(let i=0;i<6;i++)p=act(p,'stage.update',{sceneId:'s',stage:{objects:[{id:'prop',type:'shape',x:10*i,y:20}],backgroundColor:'#225544'}});
  const oldest=structuredClone(group(p).scenes[0].history[0]),current=structuredClone(group(p).scenes[0]),typedStage=structuredClone(current.stage);
  typedStage.objects[0].x=123;typedStage.backgroundColor='#ccaa44';
  p=act(p,'scene.restore',{sceneId:'s',historyId:oldest.id,currentDraft:{stage:typedStage}});
  const restored=group(p).scenes[0];assert.deepEqual(restored.stage,oldest.snapshot.stage);
  assert.equal(restored.history.length,5);assert.deepEqual(restored.history.at(-2).snapshot.stage,current.stage);
  assert.deepEqual(restored.history.at(-1).snapshot.stage,typedStage);
  const recovered=act(p,'scene.restore',{sceneId:'s',historyId:restored.history.at(-1).id});
  assert.equal(group(recovered).scenes[0].stage.objects[0].x,123);
  assert.equal(group(recovered).scenes[0].stage.backgroundColor,'#ccaa44');
});
test('new story preserves accepted and typed work, character artwork and scenes',()=>{
  let p=act(project(),'story.update',{title:'Old story',plot:'Accepted'});
  p=act(p,'character.add',{id:'moon',name:'Moon',brief:'Curious visitor'});
  p=act(p,'scene.add',{id:'s',script:'Moon enters.'});
  p=act(p,'story.new',{currentDraft:{plot:'Unfinished new idea'}});
  assert.equal(group(p).story.plot,'');assert.equal(group(p).story.title,'');
  assert.equal(group(p).story.history.at(-2).snapshot.plot,'Accepted');
  assert.equal(group(p).story.history.at(-1).snapshot.plot,'Unfinished new idea');
  assert.equal(group(p).characters[0].name,'Moon');assert.equal(group(p).scenes[0].script,'Moon enters.');
  p=act(p,'story.restore',{historyId:group(p).story.history.at(-1).id});assert.equal(group(p).story.plot,'Unfinished new idea');
});
test('history preview presents full plain fields and safe formatted script',()=>{
  const story=prepareHistoryPreview('story',{id:'v',snapshot:{title:'A story',time:'Winter',place:'Forest',characters:'Moon',plot:'A complete story'}});
  assert.deepEqual(story.fields.map(field=>field.key),['title','time','place','characters','plot']);
  assert.equal(story.fields.at(-1).value,'A complete story');
  const scene=prepareHistoryPreview('scene',{snapshot:{script:'<b>Text</b>',scriptFormats:[{start:0,end:11,bold:true}],stage:{objects:[{}]}}},{language:'zh'});
  assert.ok(scene.scriptHtml.includes('&lt;b&gt;'));assert.equal(scene.stageObjectCount,1);assert.equal(scene.fields[2].label,'剧本');
  const original={name:'Moon',brief:'Friendly',project:{parts:[{id:'keep'}]}};
  assert.deepEqual(mergeHistoryDraft('character',original,{brief:'New brief',project:null}),{...original,brief:'New brief'});
});
test('unaccepted formatted script drafts survive downloaded JSON and remain recoverable on restore',()=>{
  let p=act(project(),'scene.add',{id:'s',script:'Earlier dialogue'});
  p=act(p,'scene.update',{sceneId:'s',script:'Accepted dialogue'});
  const key=`${p.id}:group:scene.update:::s:::`,values={sceneId:'s',script:'月亮: Hello!',scriptFormats:JSON.stringify([{start:4,end:9,bold:true,color:'#225544'}])};
  const reopened=importWorkspaceFile(exportWorkspaceFile(p,[[key,values]],{groupId:'group',tab:'script',selectedSceneId:'s'}));
  assert.equal(group(reopened.classroom).scenes[0].script,'Accepted dialogue');
  assert.deepEqual(reopened.drafts,[[key,values]]);
  const draft={...reopened.drafts[0][1],scriptFormats:JSON.parse(reopened.drafts[0][1].scriptFormats)};
  const restored=act(reopened.classroom,'scene.restore',{sceneId:'s',historyId:group(reopened.classroom).scenes[0].history.at(-1).id,currentDraft:draft});
  assert.equal(group(restored).scenes[0].script,'Earlier dialogue');
  const recoverable=group(restored).scenes[0].history.at(-1).snapshot;
  assert.equal(recoverable.script,'月亮: Hello!');assert.deepEqual(recoverable.scriptFormats,JSON.parse(values.scriptFormats));
});
