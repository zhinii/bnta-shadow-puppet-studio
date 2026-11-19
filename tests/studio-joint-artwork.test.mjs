import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {createStudioProject,normalizeStudioProject,pointInPolygon,transformPoint,unitsPerMm,mirrorPart,resizePart} from '../public/studio-model.mjs';
import {getJointArtworkPlan,jointArtworkMapping} from '../public/studio-joint-artwork.mjs';
import {renderStudioSvg,exportSheetSvg,exportPrintHtml} from '../public/studio-render.mjs';

const upper=[[60,20],[90,20],[120,100],[40,100]],lower=[[40,100],[120,100],[100,180],[80,180]];
function patternedPng(){
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const kind=Buffer.from(name),r=Buffer.alloc(data.length+12);r.writeUInt32BE(data.length);kind.copy(r,4);data.copy(r,8);r.writeUInt32BE(crc(Buffer.concat([kind,data])),data.length+8);return r;};
 const header=Buffer.alloc(13);header.writeUInt32BE(200);header.writeUInt32BE(200,4);header[8]=8;header[9]=6;
 const raw=Buffer.alloc(200*801);
 for(let y=0;y<200;y++)for(let x=0;x<200;x++){const i=y*801+1+x*4;if([upper,lower].some(poly=>pointInPolygon([x+.5,y+.5],poly))){const dark=Math.floor(x/5)%2;raw.set(dark?[45,30,15,255]:[225,175,45,255],i);if(x>73&&x<79&&y>83&&y<90)raw[i+3]=0;}else if(x>155&&x<180&&y>20&&y<45)raw.set([240,0,0,255],i);}
 return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
function fixture(){
 const p=createStudioProject();p.title='Patterned tapered joint';p.heightMm=200;
 p.assets=[{id:'print',name:'Authored stripes and transparent edges',dataUrl:patternedPng(),width:200,height:200}];
 p.parts=[{id:'upper',name:'Upper',polygon:upper,assetId:'print',fill:'#bd6a43'},{id:'lower',name:'Lower',polygon:lower,assetId:'print',fill:'#bd6a43'},{id:'unrelated',name:'Unrelated red prop',polygon:[[156,21],[179,21],[179,44],[156,44]],assetId:'print'}];
 p.joints=[{id:'bend',parentId:'upper',childId:'lower',parentAnchor:[80,100],childAnchor:[80,100],padRadius:42,type:'pivot',angle:0,min:-90,max:90,overlapSpans:{parent:[80,0],child:[80,0]}}];return normalizeStudioProject(p);
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
const rounded=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'?Number(v.toFixed(7)):v));

test('both rounded ends share exact connected source artwork and an interior donor tile',()=>{
 const p=fixture(),before=structuredClone(p),j=p.joints[0],plan=getJointArtworkPlan(p,j);
 assert.equal(plan.assetId,'print');assert.equal(plan.sourcePolygons.length,2,'Unrelated same-image props are excluded.');
 assert.deepEqual(plan.sourceAnchor,[80,100]);assert.ok(plan.tile);
 for(const part of p.parts.slice(0,2)){const mapping=jointArtworkMapping(plan,part,j);assert.deepEqual(mapping,[1,0,0,1,0,0]);assert.deepEqual(transformPoint(mapping,plan.sourceAnchor),[80,100]);}
 const tile=plan.tile;
 for(let y=0;y<=12;y++)for(let x=0;x<=12;x++){const point=[tile.x+tile.size*x/12,tile.y+tile.size*y/12];assert.ok(plan.sourcePolygons.some(poly=>pointInPolygon(point,poly)),'Every sampled fallback pixel is within a connected source piece.');assert.ok(point.every(v=>v>=0&&v<=200));}
 assert.deepEqual(p,before,'Rendering recipes do not modify saved projects.');
});

test('tapered round ends receive copied print while exact source alpha remains authoritative',()=>{
 const p=fixture(),svg=renderStudioSvg(p,{showJoints:false,showRods:false});
 assert.equal((svg.match(/data-joint-artwork="bend"/g)||[]).length,2);
 assert.equal((svg.match(/data-joint-copy="tile"/g)||[]).length,2,'Tiles cover any newly added wedges beyond the original tapered outline.');
 assert.match(svg,/without-joint-print/,'Orange backing and native artwork are removed from both copied circular ends.');
 assert.match(svg,/-new-material"[^>]*><rect[^>]*fill="white"\/><path[^>]*fill="black"/,'Copied fallback is excluded from original source regions.');
 assert.match(svg,/data-joint-copy="original"/,'Original pixels are drawn once after the fallback mask, preserving alpha without squaring it.');
 assert.doesNotMatch(svg,/feColorMatrix/,'Original semi-transparent print does not pass through a second alpha mask.');
 assert.match(svg,/-round"><circle cx="80" cy="100" r="42"/,'The final copy clip stays circular in part coordinates.');
});

test('joint source recipes survive motion mirror and proportional edits without changing scale',()=>{
 const p=fixture(),j=p.joints[0],before=getJointArtworkPlan(p,j),posed=structuredClone(p);posed.joints[0].angle=43;
 assert.deepEqual(getJointArtworkPlan(posed,posed.joints[0]),before,'Pose must not repaint either physical piece.');
 for(const next of [mirrorPart(p,'lower','horizontal'),mirrorPart(p,'lower','vertical'),resizePart(p,'lower',{width:1.3,length:.8})]){
  const joint=next.joints[0],plan=getJointArtworkPlan(next,joint),part=next.parts.find(p=>p.id==='lower'),mapping=jointArtworkMapping(plan,part,joint);
  assert.deepEqual(rounded(plan.sourcePolygons),rounded(before.sourcePolygons));assert.deepEqual(rounded(plan.sourceAnchor),rounded(before.sourceAnchor));
  const mapped=transformPoint(mapping,plan.sourceAnchor);close(mapped[0],joint.childAnchor[0]);close(mapped[1],joint.childAnchor[1]);
  close(unitsPerMm(next),unitsPerMm(p));assert.deepEqual(next.assets,p.assets);
 }
});

test('stage and print reuse one image per asset per SVG and keep cut output image-free',()=>{
 const p=fixture(),image=p.assets[0].dataUrl,stage=renderStudioSvg(p,{showJoints:false}),sheet=exportSheetSvg(p),print=exportPrintHtml(p);
 for(const svg of [stage,sheet]){assert.equal(svg.split(image).length-1,1,'Native art, reflected copies and tiles share one embedded image.');assert.equal((svg.match(/data-part-artwork=/g)||[]).length,3);assert.equal((svg.match(/data-joint-artwork="bend"/g)||[]).length,2);}
 for(const markup of [stage,sheet,print]){const ids=new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));for(const m of markup.matchAll(/(?:href="#|url\(#)([^")]+)[")]/g))assert.ok(ids.has(m[1]),'Every local image/mask/clip reference resolves: '+m[1]);}
 const pages=[...print.matchAll(/<svg\b[^>]*class="piece"[^>]*>([\s\S]*?)<\/svg>/g)].map(m=>m[1]);assert.equal(pages.length,3);
 for(const page of pages)assert.equal(page.split(image).length-1,1,'Each standalone print piece embeds its source only once.');
 const shadow=renderStudioSvg(p,{showArt:false,showJoints:false}),cut=exportSheetSvg(p,{cutOnly:true});for(const markup of [shadow,cut])assert.doesNotMatch(markup,/<image|data-joint-artwork|data:image/);
 const plain=structuredClone(p);plain.assets=[];for(const part of plain.parts)part.assetId=null;assert.equal(exportSheetSvg(plain,{cutOnly:true}).replace(/sheet-\d+/g,'sheet'),cut.replace(/sheet-\d+/g,'sheet'),'Print decoration never changes cut contours or physical holes.');
});

test('native artwork without joints still has one local source definition',()=>{
 const p=fixture();p.joints=[];p.parts=[p.parts[0]];const svg=renderStudioSvg(p,{showJoints:false});assert.equal(svg.split(p.assets[0].dataUrl).length-1,1);assert.match(svg,/<use data-part-artwork="upper"/);assert.doesNotMatch(svg,/data-joint-artwork=/);
});

test('source tile stays within raster bounds and zero-area source contact falls back',()=>{
 const p=fixture();p.parts[0].polygon=[[-10,20],[90,20],[120,100],[-10,100]];const plan=getJointArtworkPlan(p,p.joints[0]);assert.ok(plan);for(const poly of plan.sourcePolygons)for(const point of poly)assert.ok(point.every(v=>v>=0&&v<=200));
 p.parts[0].polygon=[[200,10],[220,10],[220,60],[200,60]];p.parts[1].assetId=null;assert.equal(getJointArtworkPlan(p,p.joints[0]),null,'A zero-area line at the raster edge cannot replace a printed cap.');
 const noArt=fixture();noArt.assets=[];for(const part of noArt.parts)part.assetId=null;assert.equal(getJointArtworkPlan(noArt,noArt.joints[0]),null);assert.match(renderStudioSvg(noArt,{showJoints:false}),/fill="#bd6a43"/);
});
