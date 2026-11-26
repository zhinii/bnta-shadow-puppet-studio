import {normalizeStudioProject,studioId,partTransforms,transformPoint,inverseMatrix,unitsPerMm,neutralProjectBounds,polygonArea,pointInPolygon,distanceToBoundary,selfIntersects,validateStudio,roundedOverlapRadius} from './studio-model.mjs?v=0.8.0';

const EPS=1e-7;
// Finite paper-prototype heuristics, not material-strength limits. Broader
// sections remain reviewable when they separate a smaller branch of the shape.
export const JOINT_SECTION_REVIEW_MM=60,JOINT_SECTION_MAX_MM=90;
const copy=value=>JSON.parse(JSON.stringify(value));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function fail(message,code='INVALID_CONSTRUCTION'){throw Object.assign(new Error(message),{code});}
function validPoint(p){return Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=20000);}
function cleanPolygon(points){
 const out=[];for(const p of points)if(!out.length||distance(out.at(-1),p)>EPS)out.push(p);
 if(out.length>1&&distance(out[0],out.at(-1))<=EPS)out.pop();
 let changed=true;while(changed&&out.length>3){changed=false;for(let i=0;i<out.length;i++){const a=out[(i+out.length-1)%out.length],b=out[i],c=out[(i+1)%out.length];if(Math.abs(cross(a,b,c))<EPS&&distance(a,b)+distance(b,c)<=distance(a,c)+EPS){out.splice(i,1);changed=true;break;}}}
 return out;
}
function clipHalf(points,a,b,sign){
 const result=[];for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length],dp=cross(a,b,p)*sign,dq=cross(a,b,q)*sign,insideP=dp>=-EPS,insideQ=dq>=-EPS;
  if(insideP)result.push([...p]);
  if(insideP!==insideQ){const ratio=dp/(dp-dq);result.push([p[0]+ratio*(q[0]-p[0]),p[1]+ratio*(q[1]-p[1])]);}
 }
 return cleanPolygon(result);
}
function cutIntersections(points,a,b){
 const hits=[];const add=p=>{if(!hits.some(q=>distance(p,q)<=EPS))hits.push(p);};
 for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length],dp=cross(a,b,p),dq=cross(a,b,q);
  if(Math.abs(dp)<=EPS&&Math.abs(dq)<=EPS)fail('Move the split line away from an existing boundary edge.','CUT_ON_EDGE');
  if(Math.abs(dp)<=EPS)add([...p]);
  if(dp*dq<0&&Math.abs(dp)>EPS&&Math.abs(dq)>EPS){const ratio=dp/(dp-dq);add([p[0]+ratio*(q[0]-p[0]),p[1]+ratio*(q[1]-p[1])]);}
 }
 return hits;
}
// Find the finite interior chord containing a chosen point. Other limbs may
// cross the same infinite line, but are not part of this cut. Boundary positions
// let us walk each original contour arc and close it with only the chosen chord.
function interiorSection(points,a,b,sectionPoint){
 const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),hits=[];
 if(length<EPS||distanceToBoundary(sectionPoint,points)<=EPS||Math.abs(cross(a,b,sectionPoint))/length>EPS)return null;
 const add=(point,position)=>{if(!hits.some(hit=>distance(hit.point,point)<=EPS))hits.push({point,position,t:((point[0]-sectionPoint[0])*dx+(point[1]-sectionPoint[1])*dy)/length});};
 for(let i=0;i<points.length;i++){
  const p=points[i],q=points[(i+1)%points.length],dp=cross(a,b,p)/length,dq=cross(a,b,q)/length;
  if(Math.abs(dp)<=EPS)add([...p],i);
  if(dp*dq<0&&Math.abs(dp)>EPS&&Math.abs(dq)>EPS){const ratio=dp/(dp-dq);add([p[0]+ratio*(q[0]-p[0]),p[1]+ratio*(q[1]-p[1])],i+ratio);}
 }
 hits.sort((x,y)=>x.t-y.t);
 const left=hits.filter(hit=>hit.t < -EPS).at(-1),right=hits.find(hit=>hit.t>EPS);
 if(!left||!right)return null;
 const midpoint=[(left.point[0]+right.point[0])/2,(left.point[1]+right.point[1])/2];
 if(!pointInPolygon(midpoint,points)||distanceToBoundary(midpoint,points)<=EPS)return null;
 const arc=(first,last)=>{
  const end=last.position>first.position?last.position:last.position+points.length,result=[[...first.point]];
  for(let i=Math.floor(first.position)+1;i<=Math.floor(end);i++)result.push([...points[i%points.length]]);
  result.push([...last.point]);return cleanPolygon(result);
 };
 const pieces=[arc(left,right),arc(right,left)];
 if(pieces.some(piece=>piece.length<3||piece.length>512||Math.abs(polygonArea(piece))<EPS||selfIntersects(piece)))return null;
 const originalArea=Math.abs(polygonArea(points)),sum=pieces.reduce((total,piece)=>total+Math.abs(polygonArea(piece)),0);
 if(Math.abs(sum-originalArea)>Math.max(EPS,originalArea*1e-8))return null;
 return {hits:[left.point,right.point],pieces};
}
function restorePhysicalScale(project,oldUnits){
 const height=neutralProjectBounds(project).height||project.canvas.height;
 project.heightMm=height/oldUnits;
 if(project.heightMm<1||project.heightMm>1200)fail('This construction exceeds the supported physical height. Change the project size first.','SIZE_LIMIT');
}
function ensureGeometry(project){
 const errors=validateStudio(project).filter(x=>x.level==='error');
 if(errors.length)fail(errors.map(x=>x.message).join(' '),'UNSAFE_CONSTRUCTION');
}
function ensureLockedUnchanged(before,after){
 const oldTransforms=partTransforms(before),newTransforms=partTransforms(after);
 for(const part of before.parts.filter(p=>p.locked)){
  const current=after.parts.find(p=>p.id===part.id);
  if(!current||JSON.stringify(part)!==JSON.stringify(current)||oldTransforms[part.id].some((n,i)=>Math.abs(n-newTransforms[part.id][i])>1e-6))fail('This construction would change a locked part. Unlock it first.','LOCKED_PART');
 }
}
function pinRadius(project,type,extra=0){const mm=unitsPerMm(project),web=Math.max(1,project.materialMm);return extra+mm*(type==='fixed'?Math.max(3,web+1):project.holeMm/2+web+.5);}
function fullRoundOverlap(project,cuts){
 const span=[cuts[1][0]-cuts[0][0],cuts[1][1]-cuts[0][1]],overlapSpans={parent:[...span],child:[...span]},mm=unitsPerMm(project);
 const padRadius=Math.max(roundedOverlapRadius(overlapSpans),(project.holeMm/2+Math.max(2,project.materialMm*2))*mm);
 if(padRadius>300)fail('This rounded joint is too large. Choose a narrower section or reduce the piece width.','JOINT_SIZE_LIMIT');
 return {padRadius,overlapSpans};
}

/** Physical controls for both concentric ends; old joint sizes are never migrated. */
export function getJointOverlapLimits(project,jointId){
 const p=normalizeStudioProject(project),joint=p.joints.find(j=>j.id===jointId);
 if(!joint)fail('Select an existing joint.','JOINT_NOT_FOUND');
 const mm=unitsPerMm(p),web=Math.max(2,p.materialMm*2)*mm;
 let minimum=joint.type==='fixed'?web:p.holeMm*mm/2+web;
 for(const [partId,anchor] of [[joint.parentId,joint.parentAnchor],[joint.childId,joint.childAnchor]]){
  const part=p.parts.find(piece=>piece.id===partId);
  if(!pointInPolygon(anchor,part.polygon))minimum=Math.max(minimum,distanceToBoundary(anchor,part.polygon)+web);
 }
 const diameterMm=2*joint.padRadius/mm,minDiameterMm=2*minimum/mm,maxDiameterMm=600/mm;
 const suggestedDiameterMm=Math.min(maxDiameterMm,2*Math.max(minimum,roundedOverlapRadius(joint.overlapSpans))/mm);
 return {diameterMm,minDiameterMm,maxDiameterMm,suggestedDiameterMm,sliderMaxDiameterMm:Math.min(maxDiameterMm,Math.max(diameterMm,suggestedDiameterMm*2,minDiameterMm+10)),fullWidth:!!joint.overlapSpans,compact:!!joint.overlapSpans&&joint.padRadius+EPS<roundedOverlapRadius(joint.overlapSpans)};
}

/** Inspect the visible pose, including round tabs on pieces outside this pair.
 * Contact is a review hint, never permission to create another connection.
 */
export function inspectJointOverlap(project,jointId){
 const p=normalizeStudioProject(project),joint=p.joints.find(j=>j.id===jointId);
 if(!joint)fail('Select an existing joint.','JOINT_NOT_FOUND');
 const transforms=partTransforms(p),center=transformPoint(transforms[joint.parentId],joint.parentAnchor),radius=joint.padRadius;
 const overlaps=[];
 for(const part of p.parts){
  if(part.id===joint.parentId||part.id===joint.childId)continue;
  const polygon=part.polygon.map(point=>transformPoint(transforms[part.id],point));
  let touches=pointInPolygon(center,polygon)||distanceToBoundary(center,polygon)<radius-EPS;
  if(!touches)for(const other of p.joints){
   const anchor=other.parentId===part.id?other.parentAnchor:other.childId===part.id?other.childAnchor:null;
   if(anchor&&distance(center,transformPoint(transforms[part.id],anchor))<radius+other.padRadius-EPS){touches=true;break;}
  }
  if(touches)overlaps.push(part);
 }
 return {overlappingPartIds:overlaps.map(part=>part.id),overlappingPartNames:overlaps.map(part=>part.name)};
}

/** Change both round ends together, retaining hole size, rest pose and material scale. */
export function setJointOverlapDiameter(project,jointId,diameterMm){
 const before=normalizeStudioProject(project),p=copy(before),joint=p.joints.find(j=>j.id===jointId);
 if(!joint)fail('Select an existing joint.','JOINT_NOT_FOUND');
 if(typeof diameterMm==='number'&&Number.isFinite(diameterMm)&&Math.abs(diameterMm-2*joint.padRadius/unitsPerMm(before))<EPS)return before;
 if(p.parts.some(part=>part.locked&&(part.id===joint.parentId||part.id===joint.childId)))fail('Unlock both connected pieces before changing the joint size.','LOCKED_PART');
 const limits=getJointOverlapLimits(before,jointId);
 if(typeof diameterMm!=='number'||!Number.isFinite(diameterMm)||diameterMm<limits.minDiameterMm-EPS||diameterMm>limits.maxDiameterMm+EPS)fail(`Choose a joint diameter from ${Math.ceil(limits.minDiameterMm*10)/10} to ${Math.floor(limits.maxDiameterMm*10)/10} mm. Leave material around the pin hole and keep both tabs attached.`,'JOINT_SIZE_RANGE');
 joint.padRadius=Math.min(300,diameterMm*unitsPerMm(before)/2);
 joint.overlapSizing='custom';
 restorePhysicalScale(p,unitsPerMm(before));
 const normalized=normalizeStudioProject(p);ensureLockedUnchanged(before,normalized);ensureGeometry(normalized);
 return normalized;
}

/**
 * Split one local cut contour along an infinite line. The first result retains
 * the original ID and incoming connection. Art pixels are not regenerated.
 * Multiple boundary crossings are deliberately rejected: a half-plane clip of a
 * concave shape can otherwise bridge disconnected islands with invented cuts.
 * Internal sectionPoint opts into a finite interior chord for a tapped joint;
 * it walks the original boundary rather than clipping disconnected half-planes.
 */
export function splitPart(project,partId,lineStart,lineEnd,{connect=true,type='pivot',nameA,nameB,sectionPoint}={}){
 const before=normalizeStudioProject(project),p=copy(before),part=p.parts.find(x=>x.id===partId);
 if(!part)fail('Select an existing part.','PART_NOT_FOUND');
 if(part.locked)fail('Unlock this part before splitting it.','LOCKED_PART');
 if(!validPoint(lineStart)||!validPoint(lineEnd)||distance(lineStart,lineEnd)<1e-4)fail('Choose two different points for the split line.','INVALID_CUT');
 if(!['pivot','fixed','hinge'].includes(type))fail('Choose a pivot, fixed overlap or pin hinge.','INVALID_CONNECTION');
 if(p.parts.length>=80)fail('The project already has the maximum of 80 parts.','PART_LIMIT');
 if(selfIntersects(part.polygon))fail('Repair this outline before splitting it.','INVALID_CUT');
 const finite=sectionPoint!==undefined;
 if(finite&&(!validPoint(sectionPoint)||!pointInPolygon(sectionPoint,part.polygon)))fail('Choose an interior point for the joint section.','INVALID_CUT');
 const section=finite?interiorSection(part.polygon,lineStart,lineEnd,sectionPoint):null;
 if(finite&&!section)fail('This section does not produce two separate, simple pieces. Try a different joint position.','INVALID_CUT');
 const cuts=finite?section.hits:cutIntersections(part.polygon,lineStart,lineEnd);
 if(cuts.length!==2)fail(cuts.length>2?'This line crosses the outline more than twice. Split a simpler section first.':'Draw a line that crosses both sides of the part.','COMPLEX_CUT');
 let retained=finite?section.pieces[0]:clipHalf(part.polygon,lineStart,lineEnd,1),separated=finite?section.pieces[1]:clipHalf(part.polygon,lineStart,lineEnd,-1),retainedSign=1;
 if(finite&&Math.abs(polygonArea(separated))>Math.abs(polygonArea(retained)))[retained,separated]=[separated,retained];
 if([retained,separated].some(points=>points.length<3||points.length>512||Math.abs(polygonArea(points))<EPS||selfIntersects(points)))fail('This line does not produce two separate, simple pieces. Try a different split.','INVALID_CUT');
 const belongsToSeparated=point=>{
  const inRetained=pointInPolygon(point,retained),inSeparated=pointInPolygon(point,separated);
  // A pre-existing reinforcement anchor can lie just beyond the raw polygon.
  // Keep it with the contour it touches; points on the shared chord stay put.
  return inSeparated&&!inRetained||!inRetained&&!inSeparated&&distanceToBoundary(point,separated)<distanceToBoundary(point,retained)-EPS;
 };
 const incoming=p.joints.find(j=>j.childId===partId);
 if(incoming&&(finite?belongsToSeparated(incoming.childAnchor):cross(lineStart,lineEnd,incoming.childAnchor)<-EPS)){[retained,separated]=[separated,retained];retainedSign=-1;}
 const newId=studioId(),world=partTransforms(before)[partId],newPart={...copy(part),id:newId,polygon:separated,name:typeof nameB==='string'&&nameB.trim()?nameB:part.name+(p.language==='zh'?' · 第二段':' · section 2'),x:world[4],y:world[5],rotation:Math.atan2(world[1],world[0])*180/Math.PI,parameters:{width:1,length:1,axisAngle:part.parameters?.axisAngle||0}};
 part.polygon=retained;part.parameters={width:1,length:1,axisAngle:part.parameters?.axisAngle||0};
 if(typeof nameA==='string'&&nameA.trim())part.name=nameA;
 const goesToNew=point=>finite?belongsToSeparated(point):cross(lineStart,lineEnd,point)*retainedSign<-EPS;
 for(const joint of p.joints)if(joint.parentId===partId&&goesToNew(joint.parentAnchor))joint.parentId=newId;
 for(const rod of p.rods)if(rod.partId===partId&&goesToNew(rod.point))rod.partId=newId;
 p.parts.splice(p.parts.findIndex(x=>x.id===partId)+1,0,newPart);
 let jointId=null;
 if(connect){
  const anchor=[(cuts[0][0]+cuts[1][0])/2,(cuts[0][1]+cuts[1][1])/2];jointId=studioId();
  p.joints.push({id:jointId,parentId:partId,childId:newId,parentAnchor:[...anchor],childAnchor:[...anchor],type,angle:0,min:type==='fixed'?0:-90,max:type==='fixed'?0:90,...(type==='fixed'?{padRadius:pinRadius(before,type)}:fullRoundOverlap(before,cuts))});
 }
 restorePhysicalScale(p,unitsPerMm(before));
 const normalized=normalizeStudioProject(p);ensureLockedUnchanged(before,normalized);ensureGeometry(normalized);
 const warnings=[p.language==='zh'?'已保留原图像。检查关节重叠区：原图中被遮挡的细节不会自动重建。':'Original artwork is retained. Review the overlap around the new joint; hidden artwork has not been reconstructed.'];
 if(validateStudio(normalized).some(issue=>issue.code==='ROUND_ENDS_OVERLAP'))warnings.push(p.language==='zh'?'相邻的圆形关节区域有重叠。请用纸样检查两个关节能否顺畅转动，并观察背光效果。':'Nearby rounded joint regions overlap. Test that both joints turn freely and check the backlit shadow with a paper prototype.');
 if(!connect)warnings.push(p.language==='zh'?'两个部件保持原位置，需要时再添加连接。':'The two pieces retain their positions. Add a connection if they should move together.');
 return {project:normalized,partIds:[partId,newId],jointId,warnings};
}

/**
 * Turn a tap on a local section into a reviewable pin joint. This is a local
 * geometric suggestion, not anatomical recognition. The finite interior chord
 * around the tap splits the original boundary into two arcs; unrelated limbs
 * crossing the same infinite line remain intact. angleDegrees fixes the cut direction for a
 * student's adjustment; without it the shortest suitable direction is chosen.
 */
export function suggestJointAt(project,partId,localPoint,{angleDegrees,sourcePolygon}={}){
 const before=normalizeStudioProject(project),part=before.parts.find(p=>p.id===partId);
 if(!part)fail('Select an existing part.','PART_NOT_FOUND');
 if(part.locked)fail('Unlock this part before adding movement.','LOCKED_PART');
 if(!validPoint(localPoint)||!pointInPolygon(localPoint,part.polygon))fail('Tap inside the part where you want it to bend.','INVALID_JOINT_POINT');
 if(angleDegrees!==undefined&&(typeof angleDegrees!=='number'||!Number.isFinite(angleDegrees)))fail('Choose a finite cut angle.','INVALID_CUT');
 if(selfIntersects(part.polygon))fail('Repair this outline before adding movement.','INVALID_CUT');
 // Batch fragments retain their source coordinates. Judge the SAME finite cut
 // against that immutable outline, so removing another branch cannot turn a
 // previously suitable branch into an apparent broad division of the torso.
 // Current fragment area, pin clearance and all construction checks still apply.
 const reference=sourcePolygon??part.polygon;
 if(sourcePolygon!==undefined&&(!Array.isArray(sourcePolygon)||sourcePolygon.length<3||sourcePolygon.length>512||sourcePolygon.some(p=>!validPoint(p))||selfIntersects(sourcePolygon)||!pointInPolygon(localPoint,sourcePolygon)))fail('The source outline does not support this joint position.','INVALID_CUT');
 const mm=unitsPerMm(before),webMm=Math.max(2,before.materialMm*2),padRadius=(before.holeMm/2+webMm)*mm;
 if(padRadius>300)fail('This image needs a larger print size before adding a joint.','JOINT_SIZE_LIMIT');
 const xs=reference.map(p=>p[0]),ys=reference.map(p=>p[1]),longest=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
 // Classroom paper-prototype defaults, not a material-strength certification.
 const reviewWidth=JOINT_SECTION_REVIEW_MM*mm,maxWidth=Math.min(JOINT_SECTION_MAX_MM*mm,longest*.65),referenceArea=Math.abs(polygonArea(reference)),minArea=Math.PI*padRadius*padRadius,maxSnap=Math.max(8*mm,padRadius*1.5);
 const nearbyPins=before.joints.filter(j=>j.parentId===partId||j.childId===partId).map(j=>j.parentId===partId?j.parentAnchor:j.childAnchor);
 const minPinSpacing=(before.holeMm+webMm)*mm;
 if(nearbyPins.some(p=>distance(p,localPoint)<minPinSpacing))fail('There is already a joint here. Tap farther along the part.','JOINT_TOO_CLOSE');
 const angles=angleDegrees===undefined?Array.from({length:36},(_,i)=>i*5):[((angleDegrees%180)+180)%180];
 const candidates=[];let broad=false,nearPin=false;
 for(const angle of angles){
  const radians=angle*Math.PI/180,a=localPoint,b=[a[0]+Math.cos(radians),a[1]+Math.sin(radians)];
  const section=interiorSection(part.polygon,a,b,localPoint);if(!section)continue;
  const referenceSection=sourcePolygon===undefined?section:interiorSection(reference,a,b,localPoint);if(!referenceSection)continue;
  const {hits,pieces:[positive,negative]}=section;
  const smallArea=Math.min(Math.abs(polygonArea(positive)),Math.abs(polygonArea(negative)));
  if(smallArea<minArea)continue;
  const pivot=[(hits[0][0]+hits[1][0])/2,(hits[0][1]+hits[1][1])/2],width=distance(...hits),snap=distance(pivot,localPoint);
  if(snap>maxSnap)continue;
  // Allow wide necks and garments while declining broad cuts through two
  // similarly sized body halves. A manual split is still available for those.
  const referenceWidth=distance(...referenceSection.hits),referenceSmallArea=Math.min(...referenceSection.pieces.map(points=>Math.abs(polygonArea(points))));
  if(width>maxWidth||referenceWidth>maxWidth||referenceWidth>reviewWidth&&referenceSmallArea>referenceArea*.35){broad=true;continue;}
  if(nearbyPins.some(p=>distance(p,pivot)<minPinSpacing)){nearPin=true;continue;}
  candidates.push({hits,pivot,angle,width,score:width+snap*2});
 }
 candidates.sort((a,b)=>a.score-b.score||a.angle-b.angle);
 const best=candidates[0];
 if(!best){
  if(nearPin)fail('This would put two joints too close together. Tap farther along the part.','JOINT_TOO_CLOSE');
  if(broad)fail('This section is too broad for a suggested bend. Tap a narrower limb, neck or tail, or use the manual split tool.','JOINT_SECTION_TOO_BROAD');
  fail('No simple bend fits here. Tap nearer the middle of a narrow section, adjust the cut angle, or use the manual split tool.','NO_JOINT_SECTION');
 }
 // The finite chord keeps the larger body on the original ID unless its
 // incoming anchor requires the other arc. Manual splitPart remains infinite.
 const cutLine=best.hits.map(p=>[...p]);
 const result=splitPart(before,partId,...cutLine,{sectionPoint:best.pivot}),p=result.project,joint=p.joints.find(j=>j.id===result.jointId),child=p.parts.find(p=>p.id===result.partIds[1]);
 // splitPart supplies the full-width round ends. The minimum fastener radius
 // above is only for candidate area/spacing; using the full disk there would
 // wrongly reject short, broad limbs and later cuts in a multi-joint plan.
 joint.min=-60;joint.max=60;
 // Place the moving piece immediately over the retained body without changing
 // existing layers. At the maximum layer, insertion order is the tie breaker.
 const nextLayer=Math.min(...p.parts.filter(p=>p.id!==child.id&&p.z>part.z).map(p=>p.z));
 child.z=Number.isFinite(nextLayer)?(part.z+nextLayer)/2:Math.min(1000,part.z+1);
 restorePhysicalScale(p,mm);
 const normalized=normalizeStudioProject(p);ensureLockedUnchanged(before,normalized);ensureGeometry(normalized);
 const warnings=result.warnings;
 if(best.width>reviewWidth)warnings.push(before.language==='zh'?`此关节截面较宽（${(best.width/mm).toFixed(1)} 毫米）。请用纸样检查运动、重叠和刚度。`:`This joint section is broad (${(best.width/mm).toFixed(1)} mm). Review its motion, overlap and stiffness with a paper prototype.`);
 return {...result,project:normalized,cutLine,pivot:[...best.pivot],angleDegrees:best.angle,warnings};
}

const nearestOnSegment=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;return [a[0]+t*dx,a[1]+t*dy];};
function segmentIntersection(a,b,c,d){
 const ab=[b[0]-a[0],b[1]-a[1]],cd=[d[0]-c[0],d[1]-c[1]],delta=[c[0]-a[0],c[1]-a[1]],den=ab[0]*cd[1]-ab[1]*cd[0];
 if(Math.abs(den)<EPS)return null;
 const t=(delta[0]*cd[1]-delta[1]*cd[0])/den,u=(delta[0]*ab[1]-delta[1]*ab[0])/den;
 return t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS?[a[0]+t*ab[0],a[1]+t*ab[1]]:null;
}
function bestConnectionPoint(a,b){
 const candidates=[...a.filter(p=>pointInPolygon(p,b)),...b.filter(p=>pointInPolygon(p,a))];
 let closest={gap:Infinity,a:null,b:null};
 const consider=(point,poly,reverse)=>{for(let i=0;i<poly.length;i++){const q=nearestOnSegment(point,poly[i],poly[(i+1)%poly.length]),gap=distance(point,q);if(gap<closest.gap)closest={gap,a:reverse?q:point,b:reverse?point:q};}};
 for(const point of a)consider(point,b,false);for(const point of b)consider(point,a,true);
 for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const point=segmentIntersection(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]);if(point)candidates.push(point);}
 if(candidates.length){
  const minX=Math.max(Math.min(...a.map(p=>p[0])),Math.min(...b.map(p=>p[0]))),maxX=Math.min(Math.max(...a.map(p=>p[0])),Math.max(...b.map(p=>p[0]))),minY=Math.max(Math.min(...a.map(p=>p[1])),Math.min(...b.map(p=>p[1]))),maxY=Math.min(Math.max(...a.map(p=>p[1])),Math.max(...b.map(p=>p[1])));
  const mean=[candidates.reduce((sum,p)=>sum+p[0],0)/candidates.length,candidates.reduce((sum,p)=>sum+p[1],0)/candidates.length];if(pointInPolygon(mean,a)&&pointInPolygon(mean,b))candidates.push(mean);
  for(let x=0;x<=10;x++)for(let y=0;y<=10;y++){const point=[minX+(maxX-minX)*x/10,minY+(maxY-minY)*y/10];if(pointInPolygon(point,a)&&pointInPolygon(point,b))candidates.push(point);}
  let best=candidates[0],clearance=-1;for(const point of candidates){const score=Math.min(distanceToBoundary(point,a),distanceToBoundary(point,b));if(score>clearance){best=point;clearance=score;}}
  return {point:best,gap:0,clearance};
 }
 return {point:[(closest.a[0]+closest.b[0])/2,(closest.a[1]+closest.b[1])/2],gap:closest.gap,clearance:0};
}

function narrowExtent(points){
 // A pair already exists, so there is no reliable split chord to preserve.
 // Use its smaller oriented extent as a bounded starting width, never the
 // torso's full width when the selected moving piece is a narrow limb.
 let width=Infinity;
 for(let i=0;i<36;i++){
  const angle=i*Math.PI/36,c=Math.cos(angle),s=Math.sin(angle),values=points.map(p=>p[0]*c+p[1]*s);
  width=Math.min(width,Math.max(...values)-Math.min(...values));
 }
 return width;
}

/** Suggest a geometric pivot for one explicitly chosen pair. Never auto-rig props. */
export function suggestConnection(project,parentId,childId,{type='pivot',maxGapMm=8}={}){
 const before=normalizeStudioProject(project),p=copy(before),parent=p.parts.find(x=>x.id===parentId),child=p.parts.find(x=>x.id===childId);
 if(!parent||!child||parentId===childId)fail('Choose two different existing parts.','INVALID_CONNECTION');
 if(parent.locked||child.locked)fail('Unlock both pieces before adding a connection.','LOCKED_PART');
 if(!['pivot','fixed','hinge'].includes(type))fail('Choose a supported connection type.','INVALID_CONNECTION');
 if(typeof maxGapMm!=='number'||!Number.isFinite(maxGapMm)||maxGapMm<0||maxGapMm>30)fail('The allowed gap must be between 0 and 30 mm.','INVALID_CONNECTION');
 if(p.joints.some(j=>j.childId===childId))fail('This child already has a parent. Remove its current connection first.','EXISTING_PARENT');
 const transforms=partTransforms(p),a=parent.polygon.map(point=>transformPoint(transforms[parentId],point)),b=child.polygon.map(point=>transformPoint(transforms[childId],point)),suggestion=bestConnectionPoint(a,b),mm=unitsPerMm(before);
 if(suggestion.gap/mm>maxGapMm+EPS)fail('These pieces are too far apart for an automatic connection. Move them closer or place the anchors yourself.','PARTS_TOO_FAR');
 const parentAngle=Math.atan2(transforms[parentId][1],transforms[parentId][0])*180/Math.PI,childAngle=Math.atan2(transforms[childId][1],transforms[childId][0])*180/Math.PI;
 const angle=((childAngle-parentAngle+540)%360)-180;
 if(type==='fixed'&&Math.abs(angle)>1e-5)fail('A fixed connection would rotate this child. Align the pieces first or use a pivot.','FIXED_ALIGNMENT');
 const padRadius=type==='fixed'?pinRadius(before,type,suggestion.gap/2):Math.max(pinRadius(before,type,suggestion.gap/2),(Math.min(narrowExtent(a),narrowExtent(b))+suggestion.gap)/(2*Math.cos(Math.PI/96)));
 if(padRadius>300)fail('These pieces need a smaller joint region. Move their ends together or place the anchors yourself.','JOINT_SIZE_LIMIT');
 const joint={id:studioId(),parentId,childId,parentAnchor:transformPoint(inverseMatrix(transforms[parentId]),suggestion.point),childAnchor:transformPoint(inverseMatrix(transforms[childId]),suggestion.point),type,angle:type==='fixed'?0:angle,min:type==='fixed'?0:-180,max:type==='fixed'?0:180,padRadius};
 p.joints.push(joint);restorePhysicalScale(p,mm);
 const normalized=normalizeStudioProject(p);ensureLockedUnchanged(before,normalized);ensureGeometry(normalized);
 const warnings=[p.language==='zh'?'这是根据形状重叠位置建议的连接，不是自动识别的解剖关节。请检查运动方向和图层顺序。':'This is a geometric connection suggestion, not an identified anatomical joint. Check the intended movement and layer order.'];
 if(suggestion.gap>EPS)warnings.push(p.language==='zh'?'已增加重叠片跨越间隙。检查原图在重叠片上的内容。':'Overlap tabs bridge the gap. Check the artwork on those tabs before cutting.');
 return {joint:normalized.joints.find(j=>j.id===joint.id),project:normalized,warnings};
}
