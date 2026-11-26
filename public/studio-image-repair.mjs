import {normalizeStudioProject,inverseMatrix,transformPoint,pointInPolygon,assertLockedPartsUnchanged} from './studio-model.mjs?v=0.8.0';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function edgeDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;return distance(p,[a[0]+t*dx,a[1]+t*dy]);}
function sourceContext(project,partId,jointId){
 const part=project.parts.find(p=>p.id===partId),joint=project.joints.find(j=>j.id===jointId);
 if(!part||!joint||![joint.parentId,joint.childId].includes(partId))throw Error('Choose a piece and one of its joints.');
 if(part.locked)throw Error('Unlock this piece before changing its pattern.');
 const asset=project.assets.find(a=>a.id===part.assetId);if(!asset)throw Error('This piece needs printed artwork before choosing a pattern.');
 const inverse=inverseMatrix(part.artworkMatrix),polygon=part.polygon.map(p=>transformPoint(inverse,p));
 return {part,joint,asset,inverse,polygon};
}

/** Source coordinates remain stable when the piece is moved, resized or mirrored. */
export function overlapSampleAt(project,partId,jointId,localPoint,{size}={}){
 const p=normalizeStudioProject(project),{asset,inverse,polygon}=sourceContext(p,partId,jointId);
 if(!Array.isArray(localPoint)||localPoint.length!==2||!localPoint.every(Number.isFinite))throw Error('Tap inside the selected piece.');
 const center=transformPoint(inverse,localPoint);
 if(!pointInPolygon(center,polygon))throw Error('Tap a pattern inside this selected piece, away from the edge.');
 const rim=Math.min(center[0],center[1],asset.width-center[0],asset.height-center[1],...polygon.map((a,i)=>edgeDistance(center,a,polygon[(i+1)%polygon.length])));
 // The square fits inside an inscribed circle, including concave outlines.
 const maxSize=Math.max(0,rim*Math.SQRT2*.98);
 if(maxSize<1)throw Error('This spot is too close to an edge. Tap farther inside the piece.');
 const sampleSize=size===undefined?Math.min(maxSize,Math.max(4,Math.min(asset.width,asset.height)/24)):size;
 if(typeof sampleSize!=='number'||!Number.isFinite(sampleSize)||sampleSize<1||sampleSize>maxSize+1e-6)throw Error('Use a smaller sample or choose a spot farther from the edge.');
 return {jointId,center,size:sampleSize,maxSize};
}

export function setOverlapSample(project,partId,jointId,localPoint,options={}){
 const before=normalizeStudioProject(project),sample=overlapSampleAt(before,partId,jointId,localPoint,options),next=structuredClone(before),part=next.parts.find(p=>p.id===partId);
 part.overlapSamples=[...(part.overlapSamples||[]).filter(s=>s.jointId!==jointId),{jointId:sample.jointId,center:sample.center,size:sample.size}];
 return assertLockedPartsUnchanged(before,normalizeStudioProject(next));
}

export function clearOverlapSample(project,partId,jointId){
 const before=normalizeStudioProject(project);sourceContext(before,partId,jointId);const next=structuredClone(before),part=next.parts.find(p=>p.id===partId);
 part.overlapSamples=(part.overlapSamples||[]).filter(s=>s.jointId!==jointId);if(!part.overlapSamples.length)delete part.overlapSamples;
 return assertLockedPartsUnchanged(before,normalizeStudioProject(next));
}

export function resizeOverlapSample(project,partId,jointId,size){
 const p=normalizeStudioProject(project),part=p.parts.find(p=>p.id===partId),sample=part?.overlapSamples?.find(s=>s.jointId===jointId);
 if(!sample)throw Error('Choose a pattern first.');
 return setOverlapSample(p,partId,jointId,transformPoint(part.artworkMatrix,sample.center),{size});
}
