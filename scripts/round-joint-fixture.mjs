import {writeFile,mkdir} from 'node:fs/promises';
import {createStudioProject,normalizeStudioProject} from '../public/studio-model.mjs';
import {suggestJointAt} from '../public/studio-construction.mjs';
import {renderStudioSvg,exportSheetSvg,exportPrintHtml} from '../public/studio-render.mjs';

// Reproducible engineering evidence, not a browser screenshot or heritage model.
const source=normalizeStudioProject({...createStudioProject(),title:'Rounded joint paper test',heightMm:140,parts:[{id:'strip',name:'Arm test',polygon:[[0,0],[30,0],[30,140],[0,140]],fill:'#315e53'}]});
const result=suggestJointAt(source,'strip',[15,65],{angleDegrees:0});
const rounded=result.project;
rounded.parts[0].name='Upper piece';rounded.parts[1].name='Lower piece';rounded.parts[1].fill='#b95335';
const old=structuredClone(rounded);old.joints[0].padRadius=3.5;delete old.joints[0].overlapSpans;
const cases=[['Previous 7 mm overlap',old,0],['Previous at 45 degrees',old,45],['Full-width round ends',rounded,0],['Full overlap at 45 degrees',rounded,45]];
const panels=cases.map(([label,base,angle],i)=>{
 const project=structuredClone(base);project.joints[0].angle=angle;
 const svg=renderStudioSvg(project,{interactive:false,showArt:true,showJoints:false,showRods:false,width:240,height:310,viewBox:[-65,-10,130,168]});
 return `<g transform="translate(${i*260+15} 74)"><rect width="245" height="360" rx="12" fill="#f5f5ef" stroke="#d3d9cf"/><text x="122" y="24" text-anchor="middle" font-size="14" font-weight="600">${label}</text><g transform="translate(2 42)">${svg}</g></g>`;
}).join('');
const comparison=`<svg xmlns="http://www.w3.org/2000/svg" width="1060" height="490" viewBox="0 0 1060 490"><rect width="1060" height="490" fill="white"/><g font-family="Arial,sans-serif" fill="#243b33"><text x="24" y="30" font-size="22" font-weight="700">Rounded overlap: actual material geometry</text><text x="24" y="53" font-size="14">30 mm-wide test limb; independent 3 mm pin hole. Both rounded ends remain centred on the same pivot.</text>${panels}<text x="24" y="466" font-size="13">Engineering test shape, not traditional artwork. Validate the physical material and projected appearance with a practitioner.</text></g></svg>`;
const out=new URL('../validation/',import.meta.url);await mkdir(out,{recursive:true});
await writeFile(new URL('v077-rounded-joints.svg',out),comparison);
await writeFile(new URL('v077-rounded-cut.svg',out),exportSheetSvg(rounded,{cutOnly:true}));
await writeFile(new URL('v077-rounded-print.html',out),exportPrintHtml(rounded));
await writeFile(new URL('v077-rounded-project.json',out),JSON.stringify(rounded,null,2)+'\n');
console.log('Wrote rounded-joint comparison, cut sheet, print prototype and editable test project.');
