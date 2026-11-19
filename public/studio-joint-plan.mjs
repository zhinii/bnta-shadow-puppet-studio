import {normalizeStudioProject,partTransforms,transformPoint,inverseMatrix,unitsPerMm,boundsOf,polygonArea,pointInPolygon,validateStudio} from './studio-model.mjs?v=0.7.8';
import {suggestJointAt,JOINT_SECTION_MAX_MM} from './studio-construction.mjs?v=0.7.8';

const EPS=1e-7,MAX_MARKERS=12,MAX_PARTS_TO_SCAN=12,MAX_TRIALS=24;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const isPoint=p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=20000);
const text=(project,en,zh)=>project.language==='zh'?zh:en;
const markerId=(partId,point,angle)=>{
 let hash=2166136261;for(const c of `${partId}:${point.map(n=>n.toFixed(4)).join(',')}:${angle}`)hash=Math.imul(hash^c.charCodeAt(0),16777619);
 return 'bend-'+(hash>>>0).toString(36);
};

// A scan line can cross several independent limbs. Keep each interior interval
// as its own finite chord instead of discarding the whole line. Construction
// later validates that exact local section without cutting neighboring limbs.
function sectionsAt(polygon,normal,offset,minWidth,maxWidth,minArea,totalArea){
 const hits=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],da=a[0]*normal[0]+a[1]*normal[1]-offset,db=b[0]*normal[0]+b[1]*normal[1]-offset;
  if(Math.abs(da)<EPS&&Math.abs(db)<EPS)return [];
  let hit=null;
  if(Math.abs(da)<EPS)hit=[...a];
  else if(da*db<0&&Math.abs(db)>EPS){const t=da/(da-db);hit=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];}
  if(hit&&!hits.some(p=>distance(p.point,hit)<EPS))hits.push({point:hit,edge:i});
 }
 hits.sort((a,b)=>(a.point[0]-b.point[0])*-normal[1]+(a.point[1]-b.point[1])*normal[0]);
 const sections=[];
 for(let i=0;i<hits.length-1;i++){
  const a=hits[i],b=hits[i+1],width=distance(a.point,b.point);
  if(width<minWidth||width>maxWidth)continue;
  const point=[(a.point[0]+b.point[0])/2,(a.point[1]+b.point[1])/2];
  if(!pointInPolygon(point,polygon))continue;
  // Reject tiny mane tips and decorations before spending a construction trial.
  // This follows the existing contour; it never smooths or edits the artwork.
  const side=[a.point];let vertex=(a.edge+1)%polygon.length;
  while(vertex!==(b.edge+1)%polygon.length){side.push(polygon[vertex]);vertex=(vertex+1)%polygon.length;}
  side.push(b.point);const area=Math.abs(polygonArea(side));
  if(Math.min(area,totalArea-area)<minArea)continue;
  sections.push({point,width,smallArea:Math.min(area,totalArea-area)});
 }
 // Bound pathological comb outlines while keeping substantial narrow sections.
 return sections.sort((a,b)=>a.width-b.width).slice(0,16);
}

/**
 * A bounded, deterministic geometric starting plan. Scan at most 12 substantial
 * unlocked pieces, 8 directions × 9 sections each, and validate at most 24 cuts.
 * Proposed bends stay inside their source piece; separate props are never joined.
 * Results need student review and are not identified anatomical joints.
 */
export function suggestJointMarkers(project,{maxMarkers=6}={}){
 const p=normalizeStudioProject(project),requested=Number.isFinite(maxMarkers)?Math.max(0,Math.min(MAX_MARKERS,Math.floor(maxMarkers))):6,limit=Math.min(requested,80-p.parts.length);
 if(!limit||!p.parts.length)return [];
 const mm=unitsPerMm(p),pinSpacing=(p.holeMm+Math.max(2,p.materialMm*2))*mm,spacing=Math.max(16*mm,pinSpacing*2),candidates=[],sketches=new Map();
 const eligible=p.parts.filter(part=>!part.locked).map(part=>({part,area:Math.abs(polygonArea(part.polygon)),box:boundsOf(part.polygon)})).filter(({area,box})=>area>Math.PI*(p.holeMm/2+Math.max(2,p.materialMm*2))**2*mm*mm*2&&Math.max(box.width,box.height)>spacing*1.5).sort((a,b)=>b.area-a.area||a.part.id.localeCompare(b.part.id)).slice(0,MAX_PARTS_TO_SCAN);
 for(const {part,box,area} of eligible){
  const physicalHeight=box.height/mm;if(physicalHeight<1||physicalHeight>1200)continue;
  // Candidate trials need contours only; do not duplicate large image assets.
  const sketch=normalizeStudioProject({...p,assets:[],conceptAssetId:null,parts:[{...part,assetId:null,x:0,y:0,rotation:0}],joints:[],rods:[],revisions:[],heightMm:physicalHeight});
  sketches.set(part.id,sketch);
  const pins=p.joints.filter(j=>j.parentId===part.id||j.childId===part.id).map(j=>j.parentId===part.id?j.parentAnchor:j.childAnchor),minWidth=(p.holeMm+2*Math.max(2,p.materialMm*2))*mm,maxWidth=Math.min(JOINT_SECTION_MAX_MM*mm,Math.max(box.width,box.height)*.65),minMovingArea=Math.max(area*.012,Math.PI*(minWidth/2)**2*4);
  for(let direction=0;direction<8;direction++){
   const angleDegrees=direction*22.5,radians=angleDegrees*Math.PI/180,normal=[-Math.sin(radians),Math.cos(radians)],projections=part.polygon.map(point=>point[0]*normal[0]+point[1]*normal[1]),min=Math.min(...projections),max=Math.max(...projections);
   for(let band=1;band<10;band++){
    for(const section of sectionsAt(part.polygon,normal,min+(max-min)*band/10,minWidth,maxWidth,minMovingArea,area)){
    if(pins.some(pin=>distance(pin,section.point)<pinSpacing))continue;
    // A wider head/neck branch can be useful. Avoid proposing a wide cut that
    // simply divides the main body into two similarly sized halves.
    if(section.width>40*mm&&section.smallArea>area*.35)continue;
    // A short diagonal across a body corner is not a useful narrow section.
    // Require material to continue along both sides of the proposed bend.
    if([-1,1].some(sign=>!pointInPolygon([section.point[0]+normal[0]*section.width*.7*sign,section.point[1]+normal[1]*section.width*.7*sign],part.polygon)))continue;
    candidates.push({partId:part.id,point:section.point,angleDegrees,width:section.width,minMovingArea,spacing:Math.max(spacing,Math.max(box.width,box.height)*.14),score:section.width*(1+Math.abs(band-5)*.04)});
    }
   }
  }
 }
 candidates.sort((a,b)=>a.score-b.score||a.partId.localeCompare(b.partId)||a.angleDegrees-b.angleDegrees||a.point[0]-b.point[0]||a.point[1]-b.point[1]);
 const markers=[];let trials=0;
 for(const candidate of candidates){
  if(markers.length>=limit||trials>=MAX_TRIALS)break;
  if(markers.some(marker=>marker.partId===candidate.partId&&distance(marker.point,candidate.point)<candidate.spacing))continue;
  const sketch=sketches.get(candidate.partId),part=sketch.parts.find(part=>pointInPolygon(candidate.point,part.polygon));
  if(!part)continue;
  trials++;
  try{
   const sourcePolygon=p.parts.find(part=>part.id===candidate.partId).polygon;
   const result=suggestJointAt(sketch,part.id,candidate.point,{angleDegrees:candidate.angleDegrees,sourcePolygon});
   if(result.partIds.some(id=>Math.abs(polygonArea(result.project.parts.find(part=>part.id===id).polygon))<candidate.minMovingArea))continue;
   sketches.set(candidate.partId,result.project);
   markers.push({id:markerId(candidate.partId,result.pivot,candidate.angleDegrees),partId:candidate.partId,point:[...result.pivot],label:text(p,'Bend '+(markers.length+1),'关节 '+(markers.length+1)),angleDegrees:candidate.angleDegrees});
  }catch{/* A rejected trial contributes no geometry or marker. */}
 }
 return markers;
}

/**
 * Build a proposal without mutating the supplied project. Marker coordinates and
 * partId refer to the supplied project's original pieces, even after earlier
 * markers split them. Every accepted or skipped marker is reported explicitly.
 */
export function buildJointPlan(project,markers){
 const before=normalizeStudioProject(project),originalTransforms=partTransforms(before),originalParts=new Map(before.parts.map(part=>[part.id,part])),lineages=new Map(before.parts.map(part=>[part.id,new Set([part.id])])),statuses=[],jointIds=[],warnings=[],seenIds=new Set();
 // Split geometry without repeatedly serializing the same large image payload.
 // Every fragment inherits its source image association, restored exactly once.
 const artworkIds=new Map(before.parts.map(part=>[part.id,part.assetId]));
 let working=normalizeStudioProject({...before,assets:[],conceptAssetId:null,revisions:[],parts:before.parts.map(part=>({...part,assetId:null}))});
 const input=Array.isArray(markers)?markers:[];
 if(!Array.isArray(markers))warnings.push(text(before,'No joint markers were supplied.','没有提供关节标记。'));
 for(let i=0;i<input.length;i++){
  const raw=input[i],marker=raw&&typeof raw==='object'?raw:{},report={id:typeof marker.id==='string'?marker.id:'marker-'+(i+1),partId:typeof marker.partId==='string'?marker.partId:'',point:isPoint(marker.point)?[...marker.point]:null,...(typeof marker.label==='string'?{label:marker.label}:{}),...(Number.isFinite(marker.angleDegrees)?{angleDegrees:marker.angleDegrees}:{})};
  const reject=message=>statuses.push({...report,status:'needs-review',message});
  if(i>=MAX_MARKERS){reject(text(before,'Use at most 12 bend markers in one plan.','一次最多使用 12 个关节标记。'));continue;}
  if(seenIds.has(report.id)){reject(text(before,'This marker is repeated. Keep one marker at each bend.','这个标记重复了。每个关节保留一个标记。'));continue;}seenIds.add(report.id);
  const originalPart=originalParts.get(marker.partId);
  if(!originalPart||!isPoint(marker.point)){reject(text(before,'Move this marker inside an existing piece.','请将此标记移到现有部件内。'));continue;}
  if(originalPart.locked){reject(text(before,'Unlock this piece before adding movement.','添加运动前请解锁此部件。'));continue;}
  if(!pointInPolygon(marker.point,originalPart.polygon)){reject(text(before,'Move this marker inside its piece.','请将此标记移到部件内。'));continue;}
  try{
   const world=transformPoint(originalTransforms[marker.partId],marker.point),currentTransforms=partTransforms(working),fragments=working.parts.filter(part=>lineages.get(marker.partId).has(part.id));
   let target=null,point=null;
   for(const part of fragments){const local=transformPoint(inverseMatrix(currentTransforms[part.id]),world);if(pointInPolygon(local,part.polygon)){target=part;point=local;break;}}
   if(!target){reject(text(before,'This bend no longer fits a piece. Move the marker and try again.','此关节不再位于部件内。请移动标记后重试。'));continue;}
   let angleDegrees=marker.angleDegrees;
   if(angleDegrees!==undefined){
    if(typeof angleDegrees!=='number'||!Number.isFinite(angleDegrees))throw new Error(text(before,'Choose a finite cut angle.','请选择有效的切割角度。'));
    const radians=angleDegrees*Math.PI/180,originalDirection=[marker.point[0]+Math.cos(radians),marker.point[1]+Math.sin(radians)],currentEnd=transformPoint(inverseMatrix(currentTransforms[target.id]),transformPoint(originalTransforms[marker.partId],originalDirection));
    angleDegrees=Math.atan2(currentEnd[1]-point[1],currentEnd[0]-point[0])*180/Math.PI;
   }
   // Splitting retains each fragment's original coordinate system. Keep broad
   // section heuristics tied to the source contour, rather than earlier cuts.
   const result=suggestJointAt(working,target.id,point,{angleDegrees,sourcePolygon:originalPart.polygon});
   const errors=validateStudio(result.project).filter(issue=>issue.level==='error');if(errors.length)throw new Error(errors.map(issue=>issue.message).join(' '));
   working=result.project;for(const id of result.partIds){lineages.get(marker.partId).add(id);artworkIds.set(id,originalPart.assetId);}
   jointIds.push(result.jointId);
   const originalPivot=transformPoint(inverseMatrix(originalTransforms[marker.partId]),transformPoint(currentTransforms[target.id],result.pivot));
   statuses.push({...report,point:originalPivot,status:'ready',jointId:result.jointId,resolvedPartId:target.id,angleDegrees:marker.angleDegrees??result.angleDegrees});
   for(const warning of result.warnings)if(!warnings.includes(warning))warnings.push(warning);
  }catch(error){reject(error.message||text(before,'Move this marker and try again.','请移动此标记后重试。'));}
 }
 const skipped=statuses.filter(marker=>marker.status==='needs-review').length;
 if(skipped)warnings.unshift(text(before,`${skipped} bend marker${skipped===1?' needs':'s need'} review; ${jointIds.length} joint${jointIds.length===1?' is':'s are'} ready.`,`${skipped} 个关节标记需要检查；${jointIds.length} 个关节已准备好。`));
 const restored=jointIds.length?normalizeStudioProject({...working,assets:before.assets,conceptAssetId:before.conceptAssetId,revisions:before.revisions,parts:working.parts.map(part=>({...part,assetId:artworkIds.get(part.id)??null}))}):before;
 return {project:restored,markers:statuses,jointIds,warnings};
}
