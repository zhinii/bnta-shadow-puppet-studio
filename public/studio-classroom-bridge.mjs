import {createStudioProject,normalizeStudioProject} from './studio-model.mjs?v=0.8.0';

export function isTrustedClassroomMessage(event,{origin,parent,enabled}){
 return enabled===true&&origin!=='null'&&!!parent&&event.source===parent&&event.origin===origin&&event.data&&typeof event.data==='object'&&['classroom:load','classroom:request-save'].includes(event.data.type);
}

export function classroomCharacterProject(message){
 const project=message.project==null?createStudioProject():normalizeStudioProject(message.project);
 if(message.project==null){
  project.title=typeof message.characterName==='string'?message.characterName.slice(0,160):'';
  project.brief.keywords=(typeof message.brief==='string'?message.brief:typeof message.brief?.keywords==='string'?message.brief.keywords:'').slice(0,4000);
 }
 if(['en','zh'].includes(message.language))project.language=message.language;
 return normalizeStudioProject(project);
}

export function classroomCharacterStep(project,requested){
 if(requested==='create')return 'create';
 if(requested==='make'&&project.parts.length)return 'make';
 return project.parts.length||project.assets.length?'refine':'create';
}
