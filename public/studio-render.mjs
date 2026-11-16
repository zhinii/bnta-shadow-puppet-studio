import {partTransforms, transformPoint, neutralProjectBounds, unitsPerMm, validateStudio} from './studio-model.mjs';

// Artwork, cut geometry and joints are independent. All geometry is in artwork
// units until the last print transform, where one SVG unit is one millimetre.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
// Relative precision matters for very small print scales and large source
// coordinates. Rounding a scale to five decimals can resize a long part graph.
const f = value => String(Number(num(value).toPrecision(12)));
const color = value => /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value || '') ? value : '#b96b46';
const identity = [1,0,0,1,0,0];
let renderSequence = 0;
const geometryCache = new Map();
const pointsOf = part => (part.polygon || []).filter(p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite)).map(p => [p[0],p[1]]);
const raster = asset => asset && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.dataUrl || '') ? asset : null;
// Artwork has its own mapping from original image pixels to the materialized
// part contour. Applying this only to the image keeps pin holes circular and
// prevents a resized parent's texture transform from stretching its children.
const artworkMatrixOf = part => Array.isArray(part.artworkMatrix) && part.artworkMatrix.length===6 && part.artworkMatrix.every(n=>typeof n==='number'&&Number.isFinite(n)) ? part.artworkMatrix : identity;
const bounds = points => {
 if (!points.length) return {x:0,y:0,width:0,height:0,minX:0,minY:0,maxX:0,maxY:0};
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
 return {x:minX,y:minY,width:maxX-minX,height:maxY-minY,minX,minY,maxX,maxY};
};
const polygonPath = points => points.length ? 'M'+points.map(p=>f(p[0])+' '+f(p[1])).join('L')+'Z' : '';
const circlePath = (p,r) => `M${f(p[0]-r)} ${f(p[1])}a${f(r)} ${f(r)} 0 1 0 ${f(2*r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2*r)} 0Z`;
const cross = (a,b) => a[0]*b[1]-a[1]*b[0];
const sub = (a,b) => [a[0]-b[0],a[1]-b[1]];
const area = poly => poly.reduce((a,p,i)=>a+cross(p,poly[(i+1)%poly.length]),0)/2;
const ccw = poly => area(poly)<0 ? [...poly].reverse() : poly;
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const onEdge = (p,a,b,epsilon=1e-7) => {
 const edge=sub(b,a),offset=sub(p,a),length=distance(a,b);
 if(length<=epsilon)return distance(p,a)<=epsilon;
 const projection=offset[0]*edge[0]+offset[1]*edge[1];
 // Cross products have area units. Scale the tolerance by the actual edge
 // length, including sub-unit disk edges. A minimum length of one would turn
 // both sides of a small reinforcement edge into "on the boundary" and erase
 // that edge from the union.
 return Math.abs(cross(offset,edge))<=epsilon*length && projection>=-epsilon*length && projection<=length*length+epsilon*length;
};
function inside(p,poly,strict=false) {
 let hit=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
  if(onEdge(p,poly[j],poly[i]))return !strict;
  const a=poly[i],b=poly[j];
  if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }
 return hit;
}
function intersectParameters(a,b,c,d) {
 const r=sub(b,a),s=sub(d,c),q=sub(c,a),den=cross(r,s);
 if(Math.abs(den)>1e-10) {
  const t=cross(q,s)/den,u=cross(q,r)/den;
  return t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8?[Math.max(0,Math.min(1,t))]:[];
 }
 if(Math.abs(cross(q,r))>1e-7)return [];
 const len=r[0]*r[0]+r[1]*r[1];
 if(len<1e-14)return [];
 return [c,d].map(p=>((p[0]-a[0])*r[0]+(p[1]-a[1])*r[1])/len).filter(t=>t>=0&&t<=1);
}

// Union all exterior edges before cutting. Keeping a separate disk outline
// would cut a reinforcement tab off the part. Disks use 96 segments; holes
// remain exact circles, independent of this outer-boundary approximation.
export function unionContours(polygons,{strict=true}={}) {
 const shapes=polygons.filter(p=>p.length>=3).map(ccw),segments=[],seen=new Set();
 for(let si=0;si<shapes.length;si++) {
  const poly=shapes[si];
  for(let i=0;i<poly.length;i++) {
   const a=poly[i],b=poly[(i+1)%poly.length],cuts=[0,1];
   for(let sj=0;sj<shapes.length;sj++)if(sj!==si) {
    const other=shapes[sj];
    for(let k=0;k<other.length;k++)cuts.push(...intersectParameters(a,b,other[k],other[(k+1)%other.length]));
   }
   const ts=[...new Set(cuts.map(t=>Math.round(t*1e10)/1e10))].sort((x,y)=>x-y);
   for(let k=0;k<ts.length-1;k++) {
    if(ts[k+1]-ts[k]<1e-9)continue;
    const point=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],mid=point((ts[k]+ts[k+1])/2),first=point(ts[k]),last=point(ts[k+1]),length=distance(first,last),step=Math.min(.0001,Math.max(.000001,length*.00001)),normal=[-(last[1]-first[1])/length*step,(last[0]-first[0])/length*step];
    // Sampling both sides also removes a shared edge between merely touching
    // polygons. A midpoint-only containment test would retain that cut line.
    const left=shapes.some(s=>inside([mid[0]+normal[0],mid[1]+normal[1]],s)),right=shapes.some(s=>inside([mid[0]-normal[0],mid[1]-normal[1]],s));
    if(left===right)continue;
    const segment=left?[first,last]:[last,first],key=segment.map(p=>p.map(v=>Math.round(v*1e6)).join(',')).join(':');
    if(!seen.has(key)){seen.add(key);segments.push(segment);}
   }
  }
 }
 const loops=[];
 while(segments.length) {
  const start=segments.shift(),loop=[start[0],start[1]];
  while(distance(loop.at(-1),loop[0])>1e-6) {
   const idx=segments.findIndex(s=>distance(s[0],loop.at(-1))<1e-5);
   if(idx<0){if(strict)throw Error('A reinforcement outline could not be closed. Move the anchor or simplify the cut shape.');break;}
   loop.push(segments.splice(idx,1)[0][1]);
  }
  if(distance(loop.at(-1),loop[0])<1e-5)loop.pop();
  if(loop.length>=3&&Math.abs(area(loop))>1e-12)loops.push(loop);
  else if(strict)throw Error('A reinforcement outline collapsed. Enlarge the cut shape or move the anchor.');
 }
 if(strict&&shapes.length&&!loops.length)throw Error('The cut outline is too small or narrow to prepare reliably.');
 return loops;
}

function padsFor(project,partId) {
 return (project.joints||[]).flatMap(j=>{
  const anchor=j.parentId===partId?j.parentAnchor:j.childId===partId?j.childAnchor:null;
  return anchor&&anchor.every(Number.isFinite)?[{anchor,radius:Math.max(0,num(j.padRadius)),joint:j}]:[];
 });
}
function partGeometry(project,part) {
 const polygon=pointsOf(part),pads=padsFor(project,part.id),scale=1/Math.max(.000001,unitsPerMm(project)),holeRadius=num(project.holeMm)/(2*scale),key=JSON.stringify([polygon,pads.map(p=>[p.anchor,p.radius,p.joint.type!=='fixed']),holeRadius]);
 if(geometryCache.has(key))return geometryCache.get(key);
 const circles=pads.filter(p=>p.radius>0).map(p=>Array.from({length:96},(_,i)=>[p.anchor[0]+p.radius*Math.cos(i*2*Math.PI/96),p.anchor[1]+p.radius*Math.sin(i*2*Math.PI/96)]));
 let contours,unionError=null;
 try{contours=unionContours([polygon,...circles]);}catch(error){contours=[polygon,...circles];unionError=error.message;}
 const outer=contours.map(polygonPath).join(' '),holes=[];
 for(const pad of pads)if(pad.joint.type!=='fixed'&&!holes.some(h=>distance(h.point,pad.anchor)<1e-7))holes.push({point:pad.anchor,radius:holeRadius});
 const all=contours.flat(),box=bounds(all.length?all:polygon);
 const result={contours,outer,holes,box,unionError,path:outer+' '+holes.map(h=>circlePath(h.point,h.radius)).join(' ')};
 if(geometryCache.size>=320)geometryCache.delete(geometryCache.keys().next().value);
 geometryCache.set(key,result);return result;
}

function partMarkup(project,part,geometry,{prefix,showArt=true,cutOnly=false,selected=false,interactive=false,strokeWidth=1.5}={}) {
 const token=prefix+'-'+String(part.id).replace(/[^\w-]/g,'_'),asset=raster((project.assets||[]).find(a=>a.id===part.assetId));
 const fill=showArt?color(part.fill):'#25252a';
 const b=geometry.box,mask=`<mask id="${token}-holes" maskUnits="userSpaceOnUse" x="${f(b.x-1)}" y="${f(b.y-1)}" width="${f(b.width+2)}" height="${f(b.height+2)}"><rect x="${f(b.x-1)}" y="${f(b.y-1)}" width="${f(b.width+2)}" height="${f(b.height+2)}" fill="white"/>${geometry.holes.map(h=>`<circle cx="${f(h.point[0])}" cy="${f(h.point[1])}" r="${f(h.radius)}" fill="black"/>`).join('')}</mask>`;
 const contents=cutOnly?`<path d="${geometry.path}" fill="none" stroke="#000" stroke-width="${f(strokeWidth)}" fill-rule="evenodd" data-cut="outline-and-holes"/>`:`<defs><clipPath id="${token}"><path d="${geometry.outer}" clip-rule="nonzero"/></clipPath>${mask}</defs><g clip-path="url(#${token})" mask="url(#${token}-holes)"><path d="${geometry.outer}" fill="${fill}"/>${showArt&&asset?`<image data-part-artwork="${esc(part.id)}" href="${esc(asset.dataUrl)}" x="0" y="0" width="${f(asset.width)}" height="${f(asset.height)}" preserveAspectRatio="none" transform="matrix(${artworkMatrixOf(part).map(f).join(' ')})"/>`:''}</g><path d="${geometry.path}" fill="none" stroke="${selected?'#bd492f':showArt?'#644a3b':'#25252a'}" stroke-width="${f(selected?strokeWidth*2:strokeWidth)}" fill-rule="evenodd"/>`;
 return `<g data-part-id="${esc(part.id)}"${interactive?` role="button" tabindex="0" aria-label="${esc(part.name||'Part')}"`:''} class="studio-part${selected?' is-selected':''}">${contents}<title>${esc(part.name||'Part')}</title></g>`;
}

export function renderStudioSvg(project,options={}) {
 const {selectedPartId=null,selectedJointId=null,showJoints=true,showRods=true,showArt=true,showConcept=false,interactive=true,draftPoints=[],width=800,height=1000}=options;
 const prefix='studio-'+(++renderSequence),transforms=partTransforms(project),parts=[...(project.parts||[])].filter(p=>p.visible!==false).sort((a,b)=>num(a.z)-num(b.z)),geometries=new Map(parts.map(p=>[p.id,partGeometry(project,p)]));
 const concept=raster((project.assets||[]).find(a=>a.id===project.conceptAssetId)),all=parts.flatMap(p=>geometries.get(p.id).contours.flat().map(pt=>transformPoint(transforms[p.id]||identity,pt)));
 if(showConcept&&concept)all.push([0,0],[concept.width,concept.height]);
 if(draftPoints.length)all.push(...draftPoints);
 if(!all.length)all.push([0,0],[800,1000]);
 const box=bounds(all),pad=Math.max(20,Math.max(box.width,box.height)*.035),view=options.viewBox||[box.x-pad,box.y-pad,Math.max(1,box.width)+2*pad,Math.max(1,box.height)+2*pad],marker=Math.max(4,view[2]/170);
 const content=parts.map(p=>`<g transform="matrix(${(transforms[p.id]||identity).map(f).join(' ')})">${partMarkup(project,p,geometries.get(p.id),{prefix,showArt,selected:p.id===selectedPartId,interactive,strokeWidth:Math.max(.8,marker*.23)})}</g>`).join('');
 const joints=showJoints?(project.joints||[]).map((j,i)=>{
  const p=transformPoint(transforms[j.parentId]||identity,j.parentAnchor),stroke=j.id===selectedJointId?'#db5635':'#1b7067';
  return `<g data-joint-id="${esc(j.id)}" class="studio-joint"${interactive?` role="button" tabindex="0" aria-label="${esc(j.type)} connection ${i+1}"`:''}><circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(marker*1.6)}" fill="#fffdf5" stroke="${stroke}" stroke-width="${f(marker*.36)}"/><text x="${f(p[0])}" y="${f(p[1]+marker*.45)}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${f(marker*1.7)}" font-weight="700" fill="${stroke}" pointer-events="none">${i+1}</text></g>`;
 }).join(''):'';
 const rods=showRods?(project.rods||[]).map(r=>{
  const p=transformPoint(transforms[r.partId]||identity,r.point);
  return `<g data-rod-id="${esc(r.id)}" class="studio-rod" pointer-events="none"><path d="M${f(p[0])} ${f(p[1])}l${f(marker*5)} ${f(marker*15)}" fill="none" stroke="#8b6b4b" stroke-width="${f(marker*.65)}"/><circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(marker)}" fill="#fffdf5" stroke="#8b6b4b" stroke-width="${f(marker*.35)}"/></g>`;
 }).join(''):'';
 const draft=draftPoints.length?`<g class="draft-contour" pointer-events="none"><polyline points="${draftPoints.map(p=>p.map(f).join(',')).join(' ')}" fill="${draftPoints.length>2?'#e7a35422':'none'}" stroke="#be492d" stroke-width="${f(marker*.55)}" stroke-linejoin="round"/>${draftPoints.map((p,i)=>`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(marker*(i===0?1.1:.7))}" fill="${i===0?'#1b7067':'#be492d'}" stroke="#fff" stroke-width="${f(marker*.25)}"/>`).join('')}</g>`:'';
 return `<svg xmlns="http://www.w3.org/2000/svg" class="studio-canvas" data-studio-canvas="true" width="${f(width)}" height="${f(height)}" viewBox="${view.map(f).join(' ')}" role="img" aria-label="${esc(project.title||'Custom shadow puppet')}"><title>${esc(project.title||'Custom shadow puppet')}</title>${showConcept&&concept?`<image class="concept-reference" href="${esc(concept.dataUrl)}" x="0" y="0" width="${f(concept.width)}" height="${f(concept.height)}" opacity="${parts.length?.36:1}"/>`:''}${content}${rods}${joints}${draft}</svg>`;
}

export function getFabricationMetrics(project) {
 const b=neutralProjectBounds(project),scaleMmPerUnit=1/Math.max(.000001,unitsPerMm(project));
 return {scaleMmPerUnit,widthMm:b.width*scaleMmPerUnit,heightMm:b.height*scaleMmPerUnit,parts:(project.parts||[]).map(p=>{const g=partGeometry(project,p);return {id:p.id,name:p.name,widthMm:g.box.width*scaleMmPerUnit,heightMm:g.box.height*scaleMmPerUnit,bounds:g.box};})};
}

function ensureExportable(project) {
 if(!(project.parts||[]).length)throw Error('Create at least one cut part before exporting.');
 const errors=validateStudio(project).filter(issue=>issue.level==='error');
 if(errors.length)throw Error('Repair the cut geometry before exporting: '+errors.map(issue=>issue.message).join(' '));
 for(const part of project.parts){const geometry=partGeometry(project,part);if(geometry.unionError)throw Error((part.name||'Part')+': '+geometry.unionError);}
}

export function exportSheetSvg(project,{cutOnly=false}={}) {
 ensureExportable(project);
 const prefix='sheet-'+(++renderSequence),metrics=getFabricationMetrics(project),scale=metrics.scaleMmPerUnit,margin=12,gap=12,usableWidth=Math.max(186,...metrics.parts.map(p=>p.widthMm));
 let x=margin,y=cutOnly?margin:32,rowHeight=0;
 const placements=metrics.parts.map(m=>{
  if(x>margin&&x+m.widthMm>margin+usableWidth){x=margin;y+=rowHeight+gap;rowHeight=0;}
  const place={...m,x,y};x+=m.widthMm+gap;rowHeight=Math.max(rowHeight,m.heightMm+(cutOnly?0:8));return place;
 });
 const width=usableWidth+2*margin,height=y+rowHeight+margin;
 const body=placements.map(place=>{
  const part=project.parts.find(p=>p.id===place.id),geometry=partGeometry(project,part),tx=place.x-place.bounds.x*scale,ty=place.y-place.bounds.y*scale;
  return `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(scale)})">${partMarkup(project,part,geometry,{prefix,showArt:!cutOnly,cutOnly,strokeWidth:.18/scale})}</g>${cutOnly?'':`<text x="${f(place.x)}" y="${f(place.y+place.heightMm+5)}" font-size="3.2" font-family="system-ui,sans-serif" fill="#302a25">${esc(part.name||'Part')}</text>`}`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(width)}mm" height="${f(height)}mm" viewBox="0 0 ${f(width)} ${f(height)}" data-scale-mm-per-unit="${f(scale)}"><title>${esc(project.title||'Shadow puppet')} — ${cutOnly?'cut contours':'parts at actual size'}</title><desc>Units: millimetres. Pin diameter ${f(project.holeMm)} mm. Reinforcement tabs are united with each contour. Verify calibration, material strength and assembly using a paper prototype before machine cutting. Pivot and hinge types are planar pin joints; fixed joints use adhesive overlap.</desc>${cutOnly?'':`<rect width="100%" height="100%" fill="white"/><text x="12" y="12" font-size="4" font-family="system-ui,sans-serif">${esc(project.title||'Shadow puppet')}</text><path d="M12 23v-3h50v3" fill="none" stroke="#333" stroke-width=".2"/><text x="67" y="22" font-family="system-ui,sans-serif" font-size="3">50 mm · print at 100%</text>`}${body}</svg>`;
}

export function exportPrintHtml(project) {
 ensureExportable(project);
 const t=(en,zh)=>project.language==='zh'?zh:en;
 const prefix='print-'+(++renderSequence),metrics=getFabricationMetrics(project),scale=metrics.scaleMmPerUnit,pages=[],tileWidth=190,tileHeight=230,overlap=5;
 const layerOrder=[...project.parts].sort((a,b)=>num(a.z)-num(b.z)),layerOf=id=>layerOrder.findIndex(p=>p.id===id)+1;
 for(const part of project.parts) {
  const geometry=partGeometry(project,part),b=geometry.box,w=b.width*scale,h=b.height*scale,cols=Math.max(1,Math.ceil((w-overlap)/(tileWidth-overlap))),rows=Math.max(1,Math.ceil((h-overlap)/(tileHeight-overlap)));
  if(cols*rows+pages.length>160)throw Error(t('This print needs more than 160 pages. Reduce the puppet height.','打印需要超过 160 页，请减小皮影高度。'));
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
   const vx=b.x+(cols===1?-(tileWidth-w)/2:col*(tileWidth-overlap))/scale,vy=b.y+(rows===1?-(tileHeight-h)/2:row*(tileHeight-overlap))/scale,tiled=cols*rows>1;
   const cut=partMarkup(project,part,geometry,{prefix:prefix+'-'+pages.length,showArt:true,strokeWidth:.18/scale});
   const guides=padsFor(project,part.id).map(p=>`<text x="${f(p.anchor[0]+5/scale)}" y="${f(p.anchor[1])}" font-size="${f(3/scale)}" font-family="system-ui,sans-serif" fill="#1b7067">${project.joints.indexOf(p.joint)+1}${p.joint.type==='fixed'?t(' glue',' 粘合'):''}</text>`).join('');
   const rodMarks=(project.rods||[]).filter(r=>r.partId===part.id).map(r=>`<path d="M${f(r.point[0]-2/scale)} ${f(r.point[1])}h${f(4/scale)}m${f(-2/scale)} ${f(-2/scale)}v${f(4/scale)}" fill="none" stroke="#28666a" stroke-width="${f(.2/scale)}"/>`).join('');
   pages.push(`<section class="page"><header><strong>${esc(part.name||t('Part','部件'))}<small>${t('Layer','层次')} ${layerOf(part.id)} / ${project.parts.length}</small></strong><span>${esc(project.title||t('Shadow puppet','皮影'))} · ${tiled?t(`tile ${row+1}, ${col+1} of ${rows} × ${cols}`,`分块：第 ${row+1} 行，第 ${col+1} 列，共 ${rows} 行 × ${cols} 列`):t('one piece','完整部件')}</span></header><svg xmlns="http://www.w3.org/2000/svg" class="piece" width="190mm" height="230mm" viewBox="${[vx,vy,tileWidth/scale,tileHeight/scale].map(f).join(' ')}">${cut}${guides}${rodMarks}</svg><footer><svg xmlns="http://www.w3.org/2000/svg" width="58mm" height="7mm" viewBox="0 0 58 7"><path d="M1 5v-3h50v3" fill="none" stroke="#222" stroke-width=".2"/><text x="26" y="6.5" text-anchor="middle" font-size="2.4" font-family="sans-serif">${t('50 mm calibration','50 毫米校准线')}</text></svg><span>${t('100% / actual size','100% / 实际大小')} · ${f(project.holeMm)} ${t('mm pin holes','毫米连接孔')}${tiled?t(' · 5 mm overlap: align matching outlines, then tape',' · 重叠 5 毫米：对齐轮廓后用胶带拼接'):''}<br>${t('Do not use “fit to page”.','请勿选择“适合页面”。')} ${tiled?t('Tile coordinates are row, column.','分块坐标按行、列排列。'):t('Blue crosses mark rod attachment positions.','蓝色十字标记操纵杆连接位置。')}</span></footer></section>`);
  }
 }
 const assembly=renderStudioSvg(project,{interactive:false,showJoints:true,showRods:true,width:600,height:600});
 pages.push(`<section class="page assembly"><header><strong>${t('Assembly','组装')}</strong><span>${esc(project.title||t('Shadow puppet','皮影'))}</span></header><div class="overview">${assembly}</div><h2>${t('Assembly overview — not to scale','组装示意图——非实际比例')}</h2><p>${t('Keep each piece with its labelled page until assembly. Stack parts from the lowest layer number (back) to the highest (front); the layer number is printed below each part name. The following connection guide matches the numbered joints in this overview.','组装前请将每个部件与其标记页面放在一起。按层次编号从小到大叠放：小号在后，大号在前。层次编号印在部件名称下方。后面的连接指南与本图的关节编号对应。')}</p><p>${t('Cut the outer contours. Punch numbered holes through both matching parts. Add pins with enough clearance to rotate. Fixed joins use adhesive overlap. Blue crosses mark rod attachment positions; secure rods with tabs or tape.','沿外轮廓裁剪，在两个对应部件上打出相同编号的孔。安装连接钉时保留足够的转动间隙。固定连接采用重叠粘合。蓝色十字标记操纵杆连接位置，可用连接片或胶带固定。')}</p><p>${t('Make a paper prototype first. Check fragile details, joint clearance and intended motion. A planar preview does not test material strength, fastener thickness or out-of-plane hinge movement.','请先制作纸样，检查细小部位、关节间隙和预期动作。平面预览无法验证材料强度、连接件厚度或关节的立体运动。')}</p>${project.joints.length?'':`<p>${t('No connections yet. Add joints to connect moving pieces.','尚未添加连接，请添加关节以连接活动部件。')}</p>`}</section>`);
 const textWidth=value=>[...String(value||'')].reduce((sum,c)=>sum+(c.charCodeAt(0)>255?1:.6),0);
 for(let start=0;start<project.joints.length;){
  let end=start,estimatedHeight=0;
  while(end<project.joints.length&&end-start<12){
   const j=project.joints[end],lines=[j.parentId,j.childId].reduce((sum,id)=>sum+Math.max(1,Math.ceil((textWidth(project.parts.find(p=>p.id===id)?.name)+9)/40)),0),rowHeight=lines*4.5+5;
   if(end>start&&estimatedHeight+rowHeight>210)break;
   estimatedHeight+=rowHeight;end++;
  }
  const rows=project.joints.slice(start,end).map((j,index)=>`<tr><th>${start+index+1}</th><td>${esc(project.parts.find(p=>p.id===j.parentId)?.name)} <small>${t('layer','层')} ${layerOf(j.parentId)}</small><br>↔ ${esc(project.parts.find(p=>p.id===j.childId)?.name)} <small>${t('layer','层')} ${layerOf(j.childId)}</small></td><td>${j.type==='fixed'?t('Adhesive overlap; no pin hole','重叠粘合；无连接孔'):j.type==='hinge'?t('Planar pin hinge','平面销轴铰链'):t('Pivot pin','转轴连接')}</td></tr>`).join('');
  pages.push(`<section class="page assembly connection-guide"><header><strong>${t('Connection guide','连接指南')}</strong><span>${t('Joints','关节')} ${start+1}–${end}</span></header><table><thead><tr><th>#</th><th>${t('Matching parts','对应部件')}</th><th>${t('Connection','连接方式')}</th></tr></thead><tbody>${rows}</tbody></table><p>${t('Match each number on both parts. A shared pin may join more than two layers at the same position. Check each joint can move without binding before attaching control rods.','将两个部件上相同编号的位置对应。在同一位置，一个连接钉可以连接两个以上的层。安装操纵杆前，请检查每个关节都能顺畅转动。')}</p></section>`);
  start=end;
 }
 return `<!doctype html><html lang="${project.language==='zh'?'zh':'en'}"><head><meta charset="utf-8"><title>${esc(project.title||t('Shadow puppet','皮影'))} — ${t('print parts','打印部件')}</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;color:#2c2822;background:#e7e4df;font:11px system-ui,sans-serif}.page{width:210mm;height:297mm;padding:10mm;background:white;margin:8mm auto;break-after:page;page-break-after:always;overflow:hidden}.page:last-child{break-after:auto;page-break-after:auto}header{height:30mm;display:flex;justify-content:space-between;gap:8mm;font-size:12px}.assembly header{height:15mm}header strong{font-size:15px;max-width:85mm;overflow-wrap:anywhere;line-height:1.1}header strong small{display:block;font-size:9px;font-weight:400;margin-top:1mm}header span{text-align:right;max-width:100mm;overflow-wrap:anywhere}.piece{display:block;overflow:hidden}footer{height:14mm;display:flex;align-items:center;gap:7mm;font-size:9px;line-height:1.4}footer svg{flex-shrink:0}.overview{height:165mm;text-align:center}.overview svg{width:100%;height:100%}.assembly h2{font-size:13px}.assembly p{line-height:1.6;font-size:10px}.connection-guide table{border-collapse:collapse;width:100%;table-layout:fixed}.connection-guide th,.connection-guide td{padding:2.5mm 2mm;border-bottom:1px solid #ddd;text-align:left;vertical-align:top;overflow-wrap:anywhere;line-height:1.45}.connection-guide th:first-child{width:9mm}.connection-guide th:last-child{width:37mm}.connection-guide small{color:#666;font-size:9px}@media print{body{background:white}.page{margin:0}}</style></head><body>${pages.join('')}</body></html>`;
}
