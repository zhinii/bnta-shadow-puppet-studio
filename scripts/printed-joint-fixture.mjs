import {writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {createStudioProject,normalizeStudioProject,pointInPolygon} from '../public/studio-model.mjs';
import {suggestJointAt} from '../public/studio-construction.mjs';
import {renderStudioSvg,exportPrintHtml} from '../public/studio-render.mjs';
// Synthetic print/assembly sample, not a traditional puppet or a browser screenshot.
const width=200,height=240,polygon=[[70,15],[130,15],[150,225],[50,225]],raw=Buffer.alloc((width*4+1)*height);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pointInPolygon([x+.5,y+.5],polygon)){const i=y*(width*4+1)+1+x*4;const diamond=((x+y)%30<3||(x-y+300)%30<3),band=y%65<7;raw.set(diamond?[80,46,25,255]:band?[176,51,34,255]:[235,181,59,255],i);}
const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
const chunk=(name,data)=>{const kind=Buffer.from(name),b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);kind.copy(b,4);data.copy(b,8);b.writeUInt32BE(crc(Buffer.concat([kind,data])),data.length+8);return b;};
const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
const png='data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
const source=normalizeStudioProject({...createStudioProject(),title:'Printed overlap paper test',heightMm:140,canvas:{width,height},assets:[{id:'pattern',name:'Synthetic gold print',width,height,dataUrl:png}],parts:[{id:'limb',name:'Patterned test limb',polygon,assetId:'pattern',fill:'#bd6a43'}]});
const p=suggestJointAt(source,'limb',[100,120],{angleDegrees:0}).project;p.parts[0].name='Upper piece';p.parts[1].name='Lower piece';
const bent=structuredClone(p);bent.joints[0].angle=45;
const neutral=renderStudioSvg(p,{width:290,height:420,showJoints:false,interactive:false,showConcept:false});
const moving=renderStudioSvg(bent,{width:290,height:420,showJoints:false,interactive:false,showConcept:false});
const comparison='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="520" viewBox="0 0 640 520"><rect width="640" height="520" fill="#fffef9"/><g font-family="Arial,sans-serif" fill="#243d35"><text x="24" y="30" font-size="21" font-weight="700">Printed design on both rounded ends</text><text x="24" y="54" font-size="13">Synthetic patterned limb with a transparent background</text><text x="90" y="86" font-size="16">Resting position</text><text x="410" y="86" font-size="16">45-degree bend</text><g transform="translate(10 90)">'+neutral+'</g><g transform="translate(330 90)">'+moving+'</g></g></svg>';
await writeFile(new URL('../validation/v078-printed-joints.svg',import.meta.url),comparison);
await writeFile(new URL('../validation/v078-printed-joints.html',import.meta.url),exportPrintHtml(p));
await writeFile(new URL('../validation/v078-printed-project.json',import.meta.url),JSON.stringify(p,null,2)+'\n');
console.log('Wrote printed overlap comparison, paper prototype and editable project.');
