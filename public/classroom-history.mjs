import {normalizeScriptFormats,rebaseScriptFormats,renderScriptPreview} from './classroom-script-format.mjs?v=0.10.0';

const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const text=value=>typeof value==='string'?value:'';
const draftFields={story:['title','time','place','characters','plot'],scene:['title','setting','script'],character:['name','brief']};

/** Merge typed fields and, for scenes, an explicit staged stage snapshot.
 * The model validates geometry and references before accepting a stage draft.
 * Hidden IDs, ownership, character artwork and history cannot be replaced. */
export function mergeHistoryDraft(kind,current,draft) {
  const result=structuredClone(current);
  if(!draft||typeof draft!=='object'||Array.isArray(draft))return result;
  for(const key of draftFields[kind]||[])if(own(draft,key)&&typeof draft[key]==='string')result[key]=draft[key];
  if(kind==='scene'){
    result.scriptFormats=own(draft,'scriptFormats')
      ?normalizeScriptFormats(result.script,draft.scriptFormats)
      :rebaseScriptFormats(current.script,result.script,current.scriptFormats);
    if(own(draft,'stage'))result.stage=structuredClone(draft.stage);
  }
  return result;
}

/** Read-only preview data. Text fields are plain strings for the view to escape.
 * scriptHtml is the sole HTML field and comes from the safe script renderer. */
export function prepareHistoryPreview(kind,entry,{language='en'}={}) {
  const value=entry?.snapshot||{},zh=language==='zh',labels=zh
    ?{title:'标题',time:'时间',place:'地点',characters:'角色',plot:'情节',name:'角色名称',brief:'角色介绍',setting:'场景',script:'剧本'}
    :{title:'Title',time:'Time',place:'Place',characters:'Characters',plot:'Plot',name:'Character name',brief:'Character brief',setting:'Setting',script:'Script'};
  return {
    id:text(entry?.id),kind,title:text(value.title||value.name)||(zh?'已保存的版本':'Saved version'),
    at:text(entry?.at),actorName:text(entry?.actorName),
    fields:(draftFields[kind]||[]).map(key=>({key,label:labels[key],value:text(value[key])})),
    scriptHtml:kind==='scene'?renderScriptPreview(value.script,value.scriptFormats):null,
    stageObjectCount:kind==='scene'?(value.stage?.objects?.length||0):null,
    hasArtwork:kind==='character'&&!!(value.project||value.previewDataUrl),
  };
}
