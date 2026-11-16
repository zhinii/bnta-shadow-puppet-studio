import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject, normalizeStudioProject, unitsPerMm, polygonArea, transformPoint, partTransforms} from '../public/studio-model.mjs';
import {renderStudioSvg, exportSheetSvg, exportPrintHtml, getFabricationMetrics, unionContours} from '../public/studio-render.mjs';
import {resizePart} from '../public/studio-parametric.mjs';

const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VZsAAAAASUVORK5CYII=';
function puppet() {
 const p=createStudioProject();
 p.title='Custom creature';p.heightMm=280;p.holeMm=3;
 p.assets=[{id:'art',name:'Artwork',mime:'image/png',dataUrl:pixel,width:800,height:1000}];p.conceptAssetId='art';
 p.parts=[{id:'body',name:'Body',polygon:[[0,0],[100,0],[100,500],[0,500]],assetId:'art'}, {id:'tentacle',name:'Tentacle',polygon:[[80,400],[180,400],[180,700],[80,700]],assetId:'art'}];
 p.joints=[{id:'pin',parentId:'body',childId:'tentacle',parentAnchor:[100,450],childAnchor:[100,450],type:'pivot',angle:0,min:-120,max:120,padRadius:12}];
 return normalizeStudioProject(p);
}

test('custom artwork is clipped to independent cut parts and pin holes are transparent',()=>{
 const p=puppet(),svg=renderStudioSvg(p,{selectedPartId:'tentacle',showJoints:false});
 assert.equal((svg.match(/<image /g)||[]).length,2);
 assert.match(svg,/mask="url\(#studio-\d+-body-holes\)"/);assert.match(svg,/data-part-id="tentacle"/);assert.match(svg,/is-selected/);
 const r=p.holeMm*unitsPerMm(p)/2;
 assert.ok(svg.includes(`a${r} ${r} 0 1 0 ${2*r} 0`),'Both exact circular holes are part of the clip and contour.');
 const shadow=renderStudioSvg(p,{showArt:false,showJoints:false,showRods:false});
 assert.ok(!shadow.includes('<image '));assert.match(shadow,/#25252a/);
});

test('reinforcement outlines are united, without cuts through their overlaps',()=>{
 const rectangle=[[0,0],[10,0],[10,10],[0,10]],overlap=[[5,0],[15,0],[15,10],[5,10]],loops=unionContours([rectangle,overlap]);
 assert.equal(loops.length,1);assert.equal(Math.abs(polygonArea(loops[0])),150);
 const contained=unionContours([rectangle,[[2,2],[8,2],[8,8],[2,8]]]);
 assert.equal(contained.length,1);assert.equal(Math.abs(polygonArea(contained[0])),100);
 const identical=unionContours([rectangle,rectangle]);assert.equal(identical.length,1);assert.equal(Math.abs(polygonArea(identical[0])),100);
 const adjacent=unionContours([rectangle,[[10,0],[20,0],[20,10],[10,10]]]);assert.equal(adjacent.length,1);assert.equal(Math.abs(polygonArea(adjacent[0])),200);
 const p=puppet(),cut=exportSheetSvg(p,{cutOnly:true});
 assert.equal((cut.match(/data-cut="outline-and-holes"/g)||[]).length,2);
 assert.ok(!cut.includes('<circle'),'No separate overlapping tab disks create an interior cut.');
 assert.ok(!cut.includes('<image'));assert.ok(!cut.includes('<text'));
});

test('small reinforcement disks on a split edge form one closed contour at every artwork resolution',()=>{
 for(const scale of [.5,1,16,100]){
  const radius=6/7*scale,center=[45*scale,50*scale],disk=Array.from({length:96},(_,i)=>[center[0]+radius*Math.cos(i*2*Math.PI/96),center[1]+radius*Math.sin(i*2*Math.PI/96)]);
  for(const polygon of [ [[20,10],[70,10],[70,50],[20,50]], [[20,50],[70,50],[70,90],[20,90]] ]){
   const rectangle=polygon.map(([x,y])=>[x*scale,y*scale]),contours=unionContours([rectangle,disk]);
   assert.equal(contours.length,1,'The tab must remain united to this side of the split.');
   const expected=Math.abs(polygonArea(rectangle))+Math.abs(polygonArea(disk))/2;
   assert.ok(Math.abs(Math.abs(polygonArea(contours[0]))-expected)<expected*1e-9,'Union retains exactly the external half of the reinforcement disk.');
  }
 }
});

test('export blocks detached joint tabs instead of delivering disconnected cutting geometry',()=>{
 const p=puppet();p.joints[0].parentAnchor=[700,700];
 assert.throws(()=>exportSheetSvg(p,{cutOnly:true}),/Repair the cut geometry/);
 assert.throws(()=>exportPrintHtml(p),/does not overlap/);
});

test('physical export scale and hole diameter do not change when the puppet is posed',()=>{
 const p=puppet(),before=JSON.stringify(p),m=getFabricationMetrics(p),cut=exportSheetSvg(p,{cutOnly:true});
 assert.equal(m.heightMm,280);assert.equal(m.scaleMmPerUnit,.4);assert.match(cut,/data-scale-mm-per-unit="0.4"/);assert.match(cut,/width="210mm"/);
 assert.equal(JSON.stringify(p),before,'Rendering never rewrites geometry or angles.');
 p.joints[0].angle=100;
 assert.equal(getFabricationMetrics(p).scaleMmPerUnit,m.scaleMmPerUnit);
 assert.equal(getFabricationMetrics(p).parts[1].heightMm,m.parts[1].heightMm);
 assert.equal(exportSheetSvg(p,{cutOnly:true}).replace(/sheet-\d+/g,'sheet'),cut.replace(/sheet-\d+/g,'sheet'));
});

test('fixed overlaps have no pin holes while pin hinges have the same exact circles as pivots',()=>{
 const p=puppet();p.joints[0].type='fixed';
 const fixed=exportSheetSvg(p,{cutOnly:true});assert.ok(!fixed.includes('a3.75 3.75'));
 p.joints[0].type='hinge';const hinge=exportSheetSvg(p,{cutOnly:true});assert.ok(hinge.includes('a3.75 3.75'));
});

test('a shared pin through three pieces is punched once in each piece',()=>{
 const p=puppet();p.parts.push({...p.parts[1],id:'second-tentacle',name:'Second tentacle'});p.joints.push({...p.joints[0],id:'second-pin',childId:'second-tentacle'});
 const cut=exportSheetSvg(p,{cutOnly:true});
 assert.equal((cut.match(/a3\.75 3\.75 0 1 0 7\.5 0/g)||[]).length,3,'The shared body pin is not duplicated or cancelled by even-odd filling.');
 const stage=renderStudioSvg(p,{showJoints:false});assert.equal((stage.match(/r="3\.75" fill="black"/g)||[]).length,3);
});

test('large parts print across overlapping A4 tiles at actual size',()=>{
 const p=puppet();p.heightMm=700;const before=JSON.stringify(p),html=exportPrintHtml(p);
 assert.match(html,/@page\{size:A4 portrait;margin:0\}/);assert.match(html,/width="190mm" height="230mm"/);
 assert.ok((html.match(/class="page"/g)||[]).length>=5,'Long body and tentacle span more than one A4 sheet.');
 assert.match(html,/5 mm overlap/);assert.match(html,/50 mm calibration/);assert.match(html,/not to scale/);assert.match(html,/Do not use “fit to page”/);
 assert.equal(JSON.stringify(p),before);
});

test('rendered markup cannot execute imported names or non-raster image data',()=>{
 const p=puppet();p.title='<script>alert(1)</script>';p.parts[0].name='"><img onerror="bad">';p.parts[0].fill='red" onload="bad';p.assets[0].dataUrl='data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImJhZCIvPg==';
 const svg=renderStudioSvg(p,{showConcept:true});assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('<img '));assert.ok(!svg.includes('<image '));assert.match(svg,/&lt;script&gt;/);
});

test('reference and tracing points remain visible before any cut part exists',()=>{
 const p=puppet();p.parts=[];p.joints=[];
 const svg=renderStudioSvg(p,{showConcept:true,draftPoints:[[10,20],[80,20],[50,70]]});
 assert.match(svg,/concept-reference/);assert.match(svg,/draft-contour/);assert.match(svg,/10,20 80,20 50,70/);
 assert.throws(()=>exportSheetSvg(p),/at least one cut part/);assert.throws(()=>exportPrintHtml(p),/at least one cut part/);
});

test('source artwork transforms independently inside the cut boundary on canvas and print',()=>{
 const p=puppet();
 p.parts[0].artworkMatrix=[1.5,0,0,1.2,-50,-90];
 p.parts[0].polygon=[[ -50,-90],[100,-90],[100,510],[-50,510]];
 p.parts[1].artworkMatrix=[1,0,0,1,0,0];
 const stage=renderStudioSvg(p,{showConcept:true,showJoints:false}),sheet=exportSheetSvg(p),printed=exportPrintHtml(p);
 for(const markup of [stage,sheet,printed]){
  assert.match(markup,/<image data-part-artwork="body"[^>]* transform="matrix\(1\.5 0 0 1\.2 -50 -90\)"\/>/);
  assert.match(markup,/<image data-part-artwork="tentacle"[^>]* transform="matrix\(1 0 0 1 0 0\)"\/>/);
 }
 const reference=stage.match(/<image class="concept-reference"[^>]*\/>/)[0];
 assert.ok(!reference.includes('transform='),'Original reference remains in its source coordinate system.');
 assert.ok(!stage.includes('<g transform="matrix(1.5 0 0 1.2 -50 -90)"'),'Artwork scale cannot affect the clipping mask or pin holes.');
 const cut=exportSheetSvg(p,{cutOnly:true});
 assert.ok(!cut.includes('data-part-artwork'));assert.ok(!cut.includes('<image'));
});

test('invalid raw artwork mappings cannot inject SVG attributes',()=>{
 const p=puppet();p.parts[0].artworkMatrix=['1)" onload="bad',0,0,1,0,0];
 const stage=renderStudioSvg(p,{showConcept:false});
 assert.match(stage,/<image data-part-artwork="body"[^>]* transform="matrix\(1 0 0 1 0 0\)"\/>/);
 assert.ok(!stage.includes('onload='));
});

test('parametric resize keeps texture, contours, moving children and physical pin size aligned',()=>{
 const before=puppet(),scaleBefore=getFabricationMetrics(before).scaleMmPerUnit;
 const resized=resizePart(before,'body',{width:.8,length:1.5}),body=resized.parts[0],child=resized.parts[1];
 for(let i=0;i<body.polygon.length;i++){
  const mapped=transformPoint(body.artworkMatrix,before.parts[0].polygon[i]);
  assert.ok(Math.hypot(mapped[0]-body.polygon[i][0],mapped[1]-body.polygon[i][1])<1e-8,'Every source corner maps to its deformed cut boundary.');
 }
 assert.deepEqual(child.polygon,before.parts[1].polygon);
 assert.deepEqual(child.artworkMatrix,before.parts[1].artworkMatrix);
 const transforms=partTransforms(resized),joint=resized.joints[0];
 assert.deepEqual(transformPoint(transforms.body,joint.parentAnchor),transformPoint(transforms.tentacle,joint.childAnchor),'The child follows the new parent pivot.');
 const metrics=getFabricationMetrics(resized),sheet=exportSheetSvg(resized),cut=exportSheetSvg(resized,{cutOnly:true}),stage=renderStudioSvg(resized,{showJoints:false});
 assert.ok(Math.abs(metrics.scaleMmPerUnit-scaleBefore)<1e-12);
 assert.equal(metrics.parts[1].heightMm,getFabricationMetrics(before).parts[1].heightMm,'The child is not resized by its parent.');
 assert.match(sheet,/<image data-part-artwork="body"[^>]*transform="matrix\(0\.8 0 0 1\.5 10 -125\)"/);
 assert.match(stage,/<image data-part-artwork="tentacle"[^>]*transform="matrix\(1 0 0 1 0 0\)"/);
 const radius=Number(cut.match(/a([\d.e+-]+) [\d.e+-]+ 0 1 0/)[1]);
 assert.ok(Math.abs(radius*2*metrics.scaleMmPerUnit-before.holeMm)<1e-10,'Nonuniform artwork scaling does not turn a 3 mm pin into an ellipse.');
});

test('union preserves enclosed openings with the correct winding',()=>{
 const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],ring=unionContours([rect(0,0,30,10),rect(0,0,10,30),rect(20,0,10,30),rect(0,20,30,10)]);
 assert.equal(ring.length,2);const areas=ring.map(polygonArea).sort((a,b)=>a-b);
 assert.ok(Math.abs(areas[0]+100)<1e-6);assert.ok(Math.abs(areas[1]-900)<1e-6);assert.ok(Math.abs(areas.reduce((a,b)=>a+b,0)-800)<1e-6);
});

test('extreme source coordinates preserve the declared physical scale',()=>{
 const p=createStudioProject();p.heightMm=50;
 for(let i=0;i<40;i++){
  p.parts.push({id:'segment-'+i,name:'Segment '+i,polygon:[[0,0],[1000,0],[1000,19999],[0,19999]],assetId:null,x:0,y:0,z:i,rotation:0,fill:'#bd6a43',locked:false});
  if(i)p.joints.push({id:'join-'+i,parentId:'segment-'+(i-1),childId:'segment-'+i,parentAnchor:[500,19999],childAnchor:[500,0],type:'fixed',min:0,max:0,angle:0,padRadius:0});
 }
 const scale=getFabricationMetrics(p).scaleMmPerUnit,svg=exportSheetSvg(p,{cutOnly:true}),printedScale=Number(svg.match(/data-scale-mm-per-unit="([^"]+)"/)[1]);
 assert.ok(Math.abs(printedScale/scale-1)<1e-10);
 assert.equal(getFabricationMetrics(p).heightMm,50);
});

test('an unreliable outline stays editable but cannot silently become a cutting file',()=>{
 const p=createStudioProject();p.parts=[{id:'sliver',name:'Sliver',polygon:[[0,0],[.0000001,0],[.0000001,10],[0,10]],assetId:null,x:0,y:0,z:0,rotation:0,fill:'#bd6a43',locked:false}];
 assert.doesNotThrow(()=>renderStudioSvg(p));
 assert.throws(()=>exportSheetSvg(p,{cutOnly:true}),/too small or narrow|could not be closed|collapsed/);
});

test('Chinese print guidance and long connection lists are paginated without losing joints',()=>{
 const p=puppet();p.language='zh';p.joints[0].type='fixed';p.joints[0].min=0;p.joints[0].max=0;
 for(let i=2;i<=20;i++){
  p.parts.push({...p.parts[1],id:'limb-'+i,name:'皮影部件'.repeat(25)});
  p.joints.push({...p.joints[0],id:'join-'+i,childId:'limb-'+i});
 }
 p.parts[0].name='皮影身体'.repeat(25);p.parts[1].name='皮影部件'.repeat(25);
 const html=exportPrintHtml(p);
 assert.match(html,/<html lang="zh">/);assert.match(html,/50 毫米校准线/);assert.match(html,/请勿选择“适合页面”/);assert.match(html,/重叠粘合/);assert.match(html,/层次/);
 const guides=html.match(/<section class="page assembly connection-guide">/g)||[];assert.ok(guides.length>=3);
 assert.equal((html.match(/<tr><th>\d+<\/th>/g)||[]).length,20);
 assert.match(html,/<tr><th>20<\/th>/);
});
