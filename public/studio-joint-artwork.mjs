import {inverseMatrix,multiplyMatrices,transformPoint} from './studio-model.mjs?v=0.8.0';

// Source-coordinate recipes stay stable through pose, mirror and proportional
// edits. They copy the existing print; they do not reconstruct hidden artwork.
const identity=[1,0,0,1,0,0],cache=new Map();
const matrix=part=>part.artworkMatrix||identity;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function edgeDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return distance(p,[a[0]+t*dx,a[1]+t*dy]);}
function inside(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
const clearance=(p,poly)=>inside(p,poly)?Math.min(...poly.map((a,i)=>edgeDistance(p,a,poly[(i+1)%poly.length]))):0;
const vector=(m,p)=>[m[0]*p[0]+m[2]*p[1],m[1]*p[0]+m[3]*p[1]];
function clipToImage(poly,width,height){
 let result=poly;
 for(const [axis,value,sign]of [[0,0,1],[0,width,-1],[1,0,1],[1,height,-1]]){
  const input=result;result=[];if(!input.length)break;
  const keep=p=>sign*(p[axis]-value)>=0;
  for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],ka=keep(a),kb=keep(b);if(ka)result.push(a);if(ka!==kb){const t=(value-a[axis])/(b[axis]-a[axis]);result.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}
 }
 return result;
}
function interiorTile(polygons,anchor,radius){
 let best=null;
 const consider=(point,poly)=>{const rim=clearance(point,poly);if(rim<1e-6)return;const half=Math.min(radius*.45,rim/Math.SQRT2*.94),score=half/(1+distance(point,anchor)/Math.max(radius,1));if(!best||score>best.score)best={x:point[0]-half,y:point[1]-half,size:half*2,score};};
 for(const poly of polygons){
  for(const amount of [.3,.6,1,1.6,2.4])for(let k=0;k<16;k++)consider([anchor[0]+radius*amount*Math.cos(k*Math.PI/8),anchor[1]+radius*amount*Math.sin(k*Math.PI/8)],poly);
  const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY;
  for(let y=1;y<8;y++)for(let x=1;x<8;x++)consider([minX+w*x/8,minY+h*y/8],poly);
  const stride=Math.max(1,Math.ceil(poly.length/48));
  for(let i=0;i<poly.length;i+=stride){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)continue;for(const sign of [-1,1])for(const amount of [.02,.1,.3])consider([(a[0]+b[0])/2-sign*dy/length*radius*amount,(a[1]+b[1])/2+sign*dx/length*radius*amount],poly);}
 }
 if(!best)return null;const {score,...tile}=best;return tile;
}
export function getJointArtworkPlan(project,joint,partId){
 if(!(joint.padRadius>0))return null;
 const selectedPart=partId&&project.parts.find(p=>p.id===partId),sample=selectedPart?.overlapSamples?.find(s=>s.jointId===joint.id);
 if(sample){
  const asset=project.assets.find(a=>a.id===selectedPart.assetId);if(!asset)return null;
  const x=sample.center[0]-sample.size/2,y=sample.center[1]-sample.size/2;
  return {jointId:joint.id,donorId:selectedPart.id,assetId:asset.id,manualSample:true,sourceAnchor:[...sample.center],sourcePolygons:[[[x,y],[x+sample.size,y],[x+sample.size,y+sample.size],[x,y+sample.size]]],reflection:[1,0,0,1,0,0],tile:{x,y,size:sample.size}};
 }
 const pair=[joint.parentId,joint.childId].map(id=>project.parts.find(p=>p.id===id)),assets=project.assets||[];
 const donor=pair.find(p=>p&&assets.some(a=>a.id===p.assetId&&/^data:image\/(png|jpeg|webp);base64,/.test(a.dataUrl||'')));
 if(!donor)return null;
 const asset=assets.find(a=>a.id===donor.assetId);
 const key=JSON.stringify([joint.id,joint.padRadius,joint.parentAnchor,joint.childAnchor,joint.overlapSpans,pair.map(p=>p&&[p.id,p.assetId,p.polygon,matrix(p)]),asset.width,asset.height]);
 if(cache.has(key))return cache.get(key);
 const anchorOf=part=>part.id===joint.parentId?joint.parentAnchor:joint.childAnchor,inv=inverseMatrix(matrix(donor)),sourceAnchor=transformPoint(inv,anchorOf(donor));
 const sourcePolygons=[clipToImage(donor.polygon.map(p=>transformPoint(inv,p)),asset.width,asset.height)];
 for(const part of pair)if(part&&part!==donor&&part.assetId===donor.assetId){const other=inverseMatrix(matrix(part));if(distance(transformPoint(other,anchorOf(part)),sourceAnchor)<1e-5)sourcePolygons.push(clipToImage(part.polygon.map(p=>transformPoint(other,p)),asset.width,asset.height));}
 const validPolygons=sourcePolygons.filter(p=>p.length>=3&&Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0))>1e-9);if(!validPolygons.length)return null;
 let span=joint.overlapSpans?.[donor.id===joint.parentId?'parent':'child'];
 if(span)span=vector(inv,span);else{const poly=validPolygons[0];let edge=0;for(let i=1;i<poly.length;i++)if(edgeDistance(sourceAnchor,poly[i],poly[(i+1)%poly.length])<edgeDistance(sourceAnchor,poly[edge],poly[(edge+1)%poly.length]))edge=i;span=[poly[(edge+1)%poly.length][0]-poly[edge][0],poly[(edge+1)%poly.length][1]-poly[edge][1]];}
 const length=Math.hypot(...span);if(!length)return null;const ux=span[0]/length,uy=span[1]/length,a=2*ux*ux-1,b=2*ux*uy,d=2*uy*uy-1;
 const reflection=[a,b,b,d,sourceAnchor[0]-a*sourceAnchor[0]-b*sourceAnchor[1],sourceAnchor[1]-b*sourceAnchor[0]-d*sourceAnchor[1]];
 const radius=Math.max(.01,joint.overlapSpans?.[donor.id===joint.parentId?'parent':'child']?length/2:joint.padRadius),tile=interiorTile(validPolygons,sourceAnchor,radius);if(!tile)return null;
 const plan={jointId:joint.id,donorId:donor.id,assetId:donor.assetId,sourceAnchor,sourcePolygons:validPolygons,reflection,tile};
 if(cache.size>=160)cache.delete(cache.keys().next().value);cache.set(key,plan);return plan;
}
export function jointArtworkMapping(plan,part,joint){
 const anchor=part.id===joint.parentId?joint.parentAnchor:joint.childAnchor,art=matrix(part),local=transformPoint(inverseMatrix(art),anchor),offset=[1,0,0,1,local[0]-plan.sourceAnchor[0],local[1]-plan.sourceAnchor[1]];
 return multiplyMatrices(art,offset);
}
