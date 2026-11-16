/** Image artwork, cut contours and mechanical connections are separate data. */
export const STUDIO_SCHEMA_VERSION = 2;
const MAX_COORD = 20000, EPS = 1e-8;
const rasterPattern = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const ID = /^[A-Za-z0-9_-]{1,96}$/;
const safeId = value => typeof value === 'string' && ID.test(value) && !['constructor','prototype','__proto__'].includes(value);
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
const cleanText = (value,max=2000) => typeof value === 'string' ? value.slice(0,max) : '';
const copy = value => JSON.parse(JSON.stringify(value));
export const studioId = () => globalThis.crypto?.randomUUID?.() || 'p-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
function fail(message,code='INVALID_PROJECT') { const error = new Error(message); error.code=code; throw error; }
function number(value, fallback, min=-MAX_COORD,max=MAX_COORD) {
  if(value===undefined || value===null)return fallback;
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('A number is outside its supported range.');
  return value;
}
function id(value, fallback=true) { if(value===undefined&&fallback)return studioId();if(!safeId(value))fail('Invalid object identifier.');return value; }
function point(value) {
  if(!Array.isArray(value)||value.length!==2||value.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>MAX_COORD))fail('A point needs two finite coordinates.','INVALID_GEOMETRY');
  return [number(value[0],0),number(value[1],0)];
}
function polygon(value) {
  if(!Array.isArray(value)||value.length<3||value.length>512)fail('A cut shape needs 3–512 points.','INVALID_GEOMETRY');
  const points=value.map(point);
  if(points.length>3&&distance(points[0],points.at(-1))<EPS)points.pop();
  if(new Set(points.map(p=>p.join(','))).size<3||Math.abs(polygonArea(points))<EPS)fail('A cut shape needs a non-zero area.','INVALID_GEOMETRY');
  return points;
}
function record(value) { return value && typeof value==='object' && !Array.isArray(value); }
function list(value,max,label) { if(value===undefined)return [];if(!Array.isArray(value)||value.length>max)fail('Too many or invalid '+label+'.');return value; }
function distinct(values,label) { const ids=new Set();for(const v of values){if(ids.has(v.id))fail('Duplicate '+label+' identifier.');ids.add(v.id);}return ids; }
function color(value) {
  if(value===undefined)return '#bd6a43';
  if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))return value;
  if(typeof value==='string'&&/^#[0-9a-f]{3}$/i.test(value))return '#'+[...value.slice(1)].map(c=>c+c).join('');
  fail('Part colors must be hexadecimal colors such as #224488.','INVALID_GEOMETRY');
}

export function createStudioProject() {
  return {schemaVersion:STUDIO_SCHEMA_VERSION,id:studioId(),title:'',language:'en',brief:{kind:'',era:'',style:'',keywords:'',action:''},canvas:{width:800,height:1000},assets:[],conceptAssetId:null,parts:[],joints:[],rods:[],heightMm:280,holeMm:3,materialMm:1,revisions:[]};
}
export function makePart(name,points,assetId=null) {
  return normalizePart({id:studioId(),name,polygon:points,assetId,fill:'#bd6a43',x:0,y:0,rotation:0,locked:false,z:0});
}
function normalizePart(raw) {
  if(!record(raw))fail('Invalid part.');
  return {id:id(raw.id),name:cleanText(raw.name,100)||'Untitled part',polygon:polygon(raw.polygon),assetId:raw.assetId==null?null:id(raw.assetId,false),fill:color(raw.fill),x:number(raw.x,0),y:number(raw.y,0),rotation:number(raw.rotation,0,-360,360),locked:raw.locked===true,z:number(raw.z,0,-1000,1000)};
}
function normalizeJoint(raw) {
  if(!record(raw))fail('Invalid connection.');
  if(raw.type!==undefined&&!['pivot','fixed','hinge'].includes(raw.type))fail('Connection type must be pivot, fixed or hinge.','INVALID_CONNECTION');
  const type=raw.type||'pivot';
  const min=number(raw.min,-120,-180,180),max=number(raw.max,120,-180,180);
  if(min>max)fail('A joint minimum cannot exceed its maximum.','INVALID_CONNECTION');
  const angle=type==='fixed'?0:number(raw.angle,0,min,max);
  return {id:id(raw.id),parentId:id(raw.parentId,false),childId:id(raw.childId,false),parentAnchor:point(raw.parentAnchor),childAnchor:point(raw.childAnchor),type,angle,min:type==='fixed'?0:min,max:type==='fixed'?0:max,padRadius:number(raw.padRadius,12,0,300)};
}
function normalizeAsset(raw) {
  if(!record(raw)||typeof raw.dataUrl!=='string'||raw.dataUrl.length>20*1024*1024||!rasterPattern.test(raw.dataUrl))fail('Artwork must be an embedded PNG, JPEG or WebP image of at most 15 MB.','INVALID_ASSET');
  const mime='image/'+rasterPattern.exec(raw.dataUrl)[1];
  return {id:id(raw.id),name:cleanText(raw.name,160)||'Artwork',mime,dataUrl:raw.dataUrl,width:number(raw.width,800,1,8192),height:number(raw.height,1000,1,8192)};
}

/** Strict import boundary: retain safe fields; never accept active SVG or external image URLs. */
export function normalizeStudioProject(raw) {
  if(raw?.schemaVersion===1)fail('This is a version 1 project. Open it in the legacy studio to preserve its character and drawings.','LEGACY_PROJECT');
  if(!record(raw)||raw.schemaVersion!==STUDIO_SCHEMA_VERSION)fail('This file is not a version 2 puppet project.');
  const p=createStudioProject();
  p.id=id(raw.id);p.title=cleanText(raw.title,160);p.language=raw.language==='zh'?'zh':'en';
  for(const key of Object.keys(p.brief))p.brief[key]=cleanText(raw.brief?.[key],key==='keywords'?4000:1000);
  p.canvas={width:number(raw.canvas?.width,800,1,8192),height:number(raw.canvas?.height,1000,1,8192)};
  p.heightMm=number(raw.heightMm,280,50,1200);p.holeMm=number(raw.holeMm,3,.5,12);p.materialMm=number(raw.materialMm,1,.1,10);
  p.assets=list(raw.assets,24,'images').map(normalizeAsset);const assetIds=distinct(p.assets,'image');
  if(p.assets.reduce((n,a)=>n+a.dataUrl.length,0)>40*1024*1024)fail('Embedded images exceed the 30 MB project limit.','INVALID_ASSET');
  p.conceptAssetId=raw.conceptAssetId==null?null:id(raw.conceptAssetId,false);
  if(p.conceptAssetId&&!assetIds.has(p.conceptAssetId))fail('The concept image is missing.','INVALID_ASSET');
  p.parts=list(raw.parts,80,'parts').map(normalizePart);const partIds=distinct(p.parts,'part');
  for(const part of p.parts)if(part.assetId&&!assetIds.has(part.assetId))fail('Artwork for '+part.name+' is missing.','INVALID_ASSET');
  p.joints=list(raw.joints,79,'connections').map(normalizeJoint);distinct(p.joints,'connection');
  const incoming=new Map();
  for(const joint of p.joints){
    if(!partIds.has(joint.parentId)||!partIds.has(joint.childId)||joint.parentId===joint.childId)fail('Connections must join two different existing parts.','INVALID_CONNECTION');
    if(incoming.has(joint.childId))fail('A part can have only one parent connection.','INVALID_CONNECTION');
    incoming.set(joint.childId,joint.parentId);
  }
  for(const part of p.parts){const visited=new Set([part.id]);let parent=incoming.get(part.id);while(parent){if(visited.has(parent))fail('Connections cannot form a cycle.','CONNECTION_CYCLE');visited.add(parent);parent=incoming.get(parent);}}
  p.rods=list(raw.rods,80,'control rods').map(rawRod=>{
    if(!record(rawRod)||!partIds.has(rawRod.partId))fail('A control rod must belong to an existing part.','INVALID_CONNECTION');
    return {id:id(rawRod.id),partId:id(rawRod.partId,false),point:point(rawRod.point)};
  });distinct(p.rods,'rod');
  // Revisions reference existing image assets instead of duplicating base64 artwork.
  p.revisions=list(raw.revisions,20,'saved versions').map(r=>{
    if(!record(r))fail('Invalid saved version.');
    const out={id:id(r.id),label:cleanText(r.label,160),createdAt:cleanText(r.createdAt||r.at,50)};
    if(record(r.snapshot)){
      const snap=normalizeStudioProject({...p,...r.snapshot,assets:p.assets,revisions:[]});
      out.snapshot={title:snap.title,brief:snap.brief,parts:snap.parts,joints:snap.joints,rods:snap.rods,conceptAssetId:snap.conceptAssetId,heightMm:snap.heightMm,holeMm:snap.holeMm,materialMm:snap.materialMm,canvas:snap.canvas};
    }
    return out;
  });
  return p;
}

export function addConnection(project,input) {
  const p=copy(project),existing=p.joints.findIndex(j=>j.id===input.id);
  const connection=normalizeJoint(input);
  if(existing<0)p.joints.push(connection);else p.joints[existing]=connection;
  return normalizeStudioProject(p);
}

export function multiplyMatrices(a,b) {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
const translate=(x,y)=>[1,0,0,1,x,y];
const rotate=degrees=>{const a=degrees*Math.PI/180;return [Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0];};
export function transformPoint(matrix,p) { return [matrix[0]*p[0]+matrix[2]*p[1]+matrix[4],matrix[1]*p[0]+matrix[3]*p[1]+matrix[5]]; }
export function inverseMatrix(m) { const d=m[0]*m[3]-m[1]*m[2];if(Math.abs(d)<EPS)fail('Cannot invert a collapsed transform.','INVALID_GEOMETRY');return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d]; }
/** A child's anchor remains coincident with its parent's anchor at every angle. */
export function partTransforms(project,options={}) {
  const parts=new Map(project.parts.map(p=>[p.id,p])),joints=new Map(project.joints.map(j=>[j.childId,j])),result=Object.create(null),visiting=new Set();
  function visit(partId){
    if(result[partId])return result[partId];if(visiting.has(partId))fail('Connections cannot form a cycle.','CONNECTION_CYCLE');
    const part=parts.get(partId);if(!part)fail('Connection points to a missing part.','INVALID_CONNECTION');visiting.add(partId);
    const joint=joints.get(partId);let matrix;
    if(joint){const angle=options.neutral||joint.type==='fixed'?0:Math.max(joint.min,Math.min(joint.max,joint.angle));matrix=multiplyMatrices(multiplyMatrices(multiplyMatrices(visit(joint.parentId),translate(...joint.parentAnchor)),rotate(angle)),translate(-joint.childAnchor[0],-joint.childAnchor[1]));}
    else matrix=multiplyMatrices(translate(part.x||0,part.y||0),rotate(part.rotation||0));
    visiting.delete(partId);result[partId]=matrix;return matrix;
  }
  for(const part of project.parts)visit(part.id);return result;
}
export function boundsOf(points) {
  if(!points.length)return {x:0,y:0,width:0,height:0,minX:0,minY:0,maxX:0,maxY:0};
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  return {x:minX,y:minY,width:maxX-minX,height:maxY-minY,minX,minY,maxX,maxY};
}
function assemblyBounds(project,neutral) {
  const transforms=partTransforms(project,{neutral}),points=[];
  for(const p of project.parts)for(const point of p.polygon)points.push(transformPoint(transforms[p.id],point));
  for(const j of project.joints)for(const [partId,anchor]of [[j.parentId,j.parentAnchor],[j.childId,j.childAnchor]]){
    const center=transformPoint(transforms[partId],anchor),r=j.padRadius||0;
    points.push([center[0]-r,center[1]-r],[center[0]+r,center[1]+r]);
  }
  return boundsOf(points);
}
export function projectBounds(project) { return assemblyBounds(project,false); }
export function neutralProjectBounds(project) { return assemblyBounds(project,true); }
export function unitsPerMm(project) { return (neutralProjectBounds(project).height||project.canvas?.height||1000)/(project.heightMm||280); }
export function jointGeometry(project,joint) {
  return {holeRadius:joint.type==='fixed'?0:project.holeMm*unitsPerMm(project)/2,padRadius:joint.padRadius,sides:[{partId:joint.parentId,anchor:[...joint.parentAnchor]},{partId:joint.childId,anchor:[...joint.childAnchor]}]};
}

export function polygonArea(points) { let twice=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];twice+=p[0]*q[1]-q[0]*p[1];}return twice/2; }
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function distanceToSegment(p,a,b) {const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
export function distanceToBoundary(p,points) { return Math.min(...points.map((a,i)=>distanceToSegment(p,a,points[(i+1)%points.length]))); }
export function pointInPolygon(p,points) {
  if(distanceToBoundary(p,points)<EPS)return true;
  let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function segmentsIntersect(a,b,c,d) {
  const ac=cross(a,b,c),ad=cross(a,b,d),ca=cross(c,d,a),cb=cross(c,d,b);
  if(((ac>EPS&&ad< -EPS)||(ac< -EPS&&ad>EPS))&&((ca>EPS&&cb< -EPS)||(ca< -EPS&&cb>EPS)))return true;
  return Math.abs(ac)<EPS&&distanceToSegment(c,a,b)<EPS||Math.abs(ad)<EPS&&distanceToSegment(d,a,b)<EPS||Math.abs(ca)<EPS&&distanceToSegment(a,c,d)<EPS||Math.abs(cb)<EPS&&distanceToSegment(b,c,d)<EPS;
}
export function selfIntersects(points) {
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
    if(j===i+1||(i===0&&j===points.length-1))continue;
    if(segmentsIntersect(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))return true;
  }return false;
}

/** These checks are geometry checks, not a material strength certification. */
export function validateStudio(project) {
  const issues=[];let p;
  try {p=normalizeStudioProject(project);}catch(error){return [{level:'error',code:error.code||'INVALID_PROJECT',message:error.message}];}
  const issue=(level,code,message,partId)=>issues.push({level,code,message,...(partId?{partId}:{})});
  if(!p.parts.length){issue('warning','NO_PARTS','Trace or add at least one cut part before preparing a puppet.');return issues;}
  const mm=unitsPerMm(p),partMap=new Map(p.parts.map(part=>[part.id,part]));
  const attached=new Set(p.joints.flatMap(j=>[j.parentId,j.childId]));
  for(const part of p.parts){
    if(selfIntersects(part.polygon))issue('error','SELF_INTERSECTION',part.name+': the cut boundary crosses itself.',part.id);
    const b=boundsOf(part.polygon);
    if(Math.min(b.width,b.height)/mm<2)issue('warning','NARROW_PART',part.name+': one dimension is below 2 mm. Check material strength.',part.id);
    if(p.parts.length>1&&!attached.has(part.id))issue('warning','UNCONNECTED_PART',part.name+': no connection yet. Keep it separate only if it is a prop.',part.id);
  }
  for(const joint of p.joints){
    const holeRadius=joint.type==='fixed'?0:p.holeMm*mm/2,minWeb=Math.max(1,p.materialMm)*mm;
    for(const [partId,anchor]of [[joint.parentId,joint.parentAnchor],[joint.childId,joint.childAnchor]]){
      const part=partMap.get(partId),inside=pointInPolygon(anchor,part.polygon),boundary=distanceToBoundary(anchor,part.polygon),pad=joint.padRadius;
      if(!inside&&boundary>=pad-EPS)issue('error','DETACHED_JOINT_PAD',part.name+': the connection tab does not overlap its cut shape.',partId);
      if(!inside&&pad-boundary<minWeb)issue('warning','WEAK_TAB_OVERLAP',part.name+': the connection tab has less than '+Math.max(1,p.materialMm)+' mm overlap.',partId);
      const clearance=Math.max(inside?boundary:0,pad)-holeRadius;
      if(clearance<0)issue('error','HOLE_OUTSIDE_TAB',part.name+': the hole is larger than its supporting tab.',partId);
      else if(joint.type!=='fixed'&&clearance<minWeb)issue('warning','SMALL_HOLE_MARGIN',part.name+': leave at least '+Math.max(1,p.materialMm)+' mm material around the hole.',partId);
    }
    if(joint.type==='hinge')issue('warning','HINGE_TEST','Hinge movement is shown in the plane. Test the real hinge and range of movement with scrap material.',joint.childId);
  }
  for(const part of p.parts){
    const pins=p.joints.filter(j=>j.type!=='fixed'&&(j.parentId===part.id||j.childId===part.id)).map(j=>j.parentId===part.id?j.parentAnchor:j.childAnchor),diameter=p.holeMm*mm,minWeb=Math.max(1,p.materialMm)*mm;
    for(let i=0;i<pins.length;i++)for(let j=i+1;j<pins.length;j++){
      const separation=distance(pins[i],pins[j]);
      if(separation<EPS)continue; // A shared pin through three or more layers is legitimate.
      if(separation<diameter-EPS)issue('error','HOLES_OVERLAP',part.name+': two distinct pin holes overlap. Separate them or use one shared pin center.',part.id);
      else if(separation-diameter<minWeb)issue('warning','NARROW_HOLE_WEB',part.name+': leave at least '+Math.max(1,p.materialMm)+' mm material between separate pin holes.',part.id);
    }
  }
  for(const rod of p.rods)if(!pointInPolygon(rod.point,partMap.get(rod.partId).polygon))issue('error','ROD_OUTSIDE_PART',partMap.get(rod.partId).name+': the rod attachment is outside the cut shape.',rod.partId);
  if(p.parts.length>1&&p.rods.length===0)issue('warning','NO_CONTROL_ROD','Add a control rod attachment or plan how the puppet will be held.');
  return issues;
}

/** Apply a proposed patch only after local validation. Locked art and connections survive. */
export function applyStudioProposal(project,proposal) {
  if(!record(proposal))fail('AI did not return a usable change proposal.','INVALID_PROPOSAL');
  const p=normalizeStudioProject(project),before=new Map(p.parts.map(part=>[part.id,part]));
  const locked=new Set(p.parts.filter(part=>part.locked).map(part=>part.id));
  const ancestors=new Set(locked),parentOf=new Map(p.joints.map(j=>[j.childId,j.parentId]));
  for(const partId of locked){let parent=parentOf.get(partId);while(parent){ancestors.add(parent);parent=parentOf.get(parent);}}
  const protectedJoint=j=>locked.has(j.parentId)||ancestors.has(j.childId);
  if(own(proposal,'title'))p.title=cleanText(proposal.title,160);
  if(record(proposal.brief))for(const key of Object.keys(p.brief))if(own(proposal.brief,key))p.brief[key]=cleanText(proposal.brief[key],key==='keywords'?4000:1000);
  if(own(proposal,'parts'))for(const patch of list(proposal.parts,80,'proposed parts')){
    if(!record(patch))fail('Invalid proposed part.','INVALID_PROPOSAL');
    const partId=patch.id===undefined?studioId():id(patch.id,false);
    if(locked.has(partId))continue;
    const old=before.get(partId),part=normalizePart({...old,...patch,id:partId,locked:old?.locked||false});
    if(old&&ancestors.has(partId)){part.x=old.x;part.y=old.y;part.rotation=old.rotation;}
    const index=p.parts.findIndex(part=>part.id===partId);if(index>=0)p.parts[index]=part;else p.parts.push(part);
  }
  const removed=new Set(list(proposal.removePartIds,80,'removed parts').filter(partId=>safeId(partId)&&!ancestors.has(partId)));
  p.parts=p.parts.filter(part=>!removed.has(part.id));p.joints=p.joints.filter(j=>!removed.has(j.parentId)&&!removed.has(j.childId));p.rods=p.rods.filter(r=>!removed.has(r.partId));
  if(own(proposal,'joints'))for(const patch of list(proposal.joints,79,'proposed connections')){
    if(!record(patch))fail('Invalid proposed connection.','INVALID_PROPOSAL');
    const existing=patch.id?p.joints.find(j=>j.id===patch.id):null;
    if(existing&&protectedJoint(existing))continue;
    const joint=normalizeJoint({...existing,...patch});
    if(protectedJoint(joint))continue;
    const index=p.joints.findIndex(j=>j.id===joint.id);if(index>=0)p.joints[index]=joint;else p.joints.push(joint);
  }
  if(own(proposal,'removeJointIds')){
    const removeJoints=new Set(list(proposal.removeJointIds,79,'removed connections'));
    p.joints=p.joints.filter(j=>!removeJoints.has(j.id)||protectedJoint(j));
  }
  if(own(proposal,'rods'))for(const patch of list(proposal.rods,80,'proposed rods')){
    if(!record(patch))fail('Invalid proposed rod.','INVALID_PROPOSAL');
    const existing=patch.id?p.rods.find(r=>r.id===patch.id):null;
    if(locked.has(existing?.partId)||locked.has(patch.partId))continue;
    const rod={...existing,...patch,id:patch.id||studioId()},index=p.rods.findIndex(r=>r.id===rod.id);
    if(index>=0)p.rods[index]=rod;else p.rods.push(rod);
  }
  const next=normalizeStudioProject(p),errors=validateStudio(next).filter(issue=>issue.level==='error');
  if(errors.length)fail(errors.map(issue=>issue.message).join(' '),'INVALID_GEOMETRY');
  return next;
}
