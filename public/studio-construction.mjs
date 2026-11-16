import {normalizeStudioProject,studioId,partTransforms,transformPoint,inverseMatrix,unitsPerMm,neutralProjectBounds,polygonArea,pointInPolygon,distanceToBoundary,selfIntersects,validateStudio} from './studio-model.mjs';

const EPS=1e-7;
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

/**
 * Split one local cut contour along an infinite line. The first result retains
 * the original ID and incoming connection. Art pixels are not regenerated.
 * Multiple boundary crossings are deliberately rejected: a half-plane clip of a
 * concave shape can otherwise bridge disconnected islands with invented cuts.
 */
export function splitPart(project,partId,lineStart,lineEnd,{connect=true,type='pivot',nameA,nameB}={}){
 const before=normalizeStudioProject(project),p=copy(before),part=p.parts.find(x=>x.id===partId);
 if(!part)fail('Select an existing part.','PART_NOT_FOUND');
 if(part.locked)fail('Unlock this part before splitting it.','LOCKED_PART');
 if(!validPoint(lineStart)||!validPoint(lineEnd)||distance(lineStart,lineEnd)<1e-4)fail('Choose two different points for the split line.','INVALID_CUT');
 if(!['pivot','fixed','hinge'].includes(type))fail('Choose a pivot, fixed overlap or pin hinge.','INVALID_CONNECTION');
 if(p.parts.length>=80)fail('The project already has the maximum of 80 parts.','PART_LIMIT');
 if(selfIntersects(part.polygon))fail('Repair this outline before splitting it.','INVALID_CUT');
 const cuts=cutIntersections(part.polygon,lineStart,lineEnd);
 if(cuts.length!==2)fail(cuts.length>2?'This line crosses the outline more than twice. Split a simpler section first.':'Draw a line that crosses both sides of the part.','COMPLEX_CUT');
 let retained=clipHalf(part.polygon,lineStart,lineEnd,1),separated=clipHalf(part.polygon,lineStart,lineEnd,-1),retainedSign=1;
 if([retained,separated].some(points=>points.length<3||points.length>512||Math.abs(polygonArea(points))<EPS||selfIntersects(points)))fail('This line does not produce two separate, simple pieces. Try a different split.','INVALID_CUT');
 const incoming=p.joints.find(j=>j.childId===partId);
 if(incoming&&cross(lineStart,lineEnd,incoming.childAnchor)<-EPS){[retained,separated]=[separated,retained];retainedSign=-1;}
 const newId=studioId(),world=partTransforms(before)[partId],newPart={...copy(part),id:newId,polygon:separated,name:typeof nameB==='string'&&nameB.trim()?nameB:part.name+(p.language==='zh'?' · 第二段':' · section 2'),x:world[4],y:world[5],rotation:Math.atan2(world[1],world[0])*180/Math.PI,parameters:{width:1,length:1,axisAngle:part.parameters?.axisAngle||0}};
 part.polygon=retained;part.parameters={width:1,length:1,axisAngle:part.parameters?.axisAngle||0};
 if(typeof nameA==='string'&&nameA.trim())part.name=nameA;
 const goesToNew=point=>cross(lineStart,lineEnd,point)*retainedSign<-EPS;
 for(const joint of p.joints)if(joint.parentId===partId&&goesToNew(joint.parentAnchor))joint.parentId=newId;
 for(const rod of p.rods)if(rod.partId===partId&&goesToNew(rod.point))rod.partId=newId;
 p.parts.splice(p.parts.findIndex(x=>x.id===partId)+1,0,newPart);
 let jointId=null;
 if(connect){
  const anchor=[(cuts[0][0]+cuts[1][0])/2,(cuts[0][1]+cuts[1][1])/2];jointId=studioId();
  p.joints.push({id:jointId,parentId:partId,childId:newId,parentAnchor:[...anchor],childAnchor:[...anchor],type,angle:0,min:type==='fixed'?0:-90,max:type==='fixed'?0:90,padRadius:pinRadius(before,type)});
 }
 restorePhysicalScale(p,unitsPerMm(before));
 const normalized=normalizeStudioProject(p);ensureLockedUnchanged(before,normalized);ensureGeometry(normalized);
 const warnings=[p.language==='zh'?'已保留原图像。检查关节重叠区：原图中被遮挡的细节不会自动重建。':'Original artwork is retained. Review the overlap around the new joint; hidden artwork has not been reconstructed.'];
 if(!connect)warnings.push(p.language==='zh'?'两个部件保持原位置，需要时再添加连接。':'The two pieces retain their positions. Add a connection if they should move together.');
 return {project:normalized,partIds:[partId,newId],jointId,warnings};
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
 const joint={id:studioId(),parentId,childId,parentAnchor:transformPoint(inverseMatrix(transforms[parentId]),suggestion.point),childAnchor:transformPoint(inverseMatrix(transforms[childId]),suggestion.point),type,angle:type==='fixed'?0:angle,min:type==='fixed'?0:-180,max:type==='fixed'?0:180,padRadius:pinRadius(before,type,suggestion.gap/2)};
 p.joints.push(joint);restorePhysicalScale(p,mm);
 const normalized=normalizeStudioProject(p);ensureLockedUnchanged(before,normalized);ensureGeometry(normalized);
 const warnings=[p.language==='zh'?'这是根据形状重叠位置建议的连接，不是自动识别的解剖关节。请检查运动方向和图层顺序。':'This is a geometric connection suggestion, not an identified anatomical joint. Check the intended movement and layer order.'];
 if(suggestion.gap>EPS)warnings.push(p.language==='zh'?'已增加重叠片跨越间隙。检查原图在重叠片上的内容。':'Overlap tabs bridge the gap. Check the artwork on those tabs before cutting.');
 return {joint:normalized.joints.find(j=>j.id===joint.id),project:normalized,warnings};
}
