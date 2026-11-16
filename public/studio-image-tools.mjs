import {selfIntersects, polygonArea, boundsOf} from './studio-model.mjs';

// Local pixel tools. These identify connected pixels, not anatomical parts.
// Every returned boundary is in the original image's pixel coordinate system.
const MAX_PIXELS=4_194_304,MAX_EDGES=100_000,MAX_POINTS=512;
const toolError=(message,code='IMAGE_SELECTION')=>Object.assign(new Error(message),{code});
function raster(input){
 const {width,height,data}=input||{};
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||width*height>MAX_PIXELS||!data||data.length!==width*height*4||!(data instanceof Uint8Array||data instanceof Uint8ClampedArray))throw toolError('Use a decoded image of at most 4 megapixels.','IMAGE_SIZE');
 return {width,height,data};
}
function optionNumber(value,fallback,min,max){if(value===undefined)return fallback;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw toolError('Image selection settings are outside their supported range.');return value;}
const colorMatch=(data,index,color,tolerance)=>{
 const offset=index*4,dr=data[offset]-color[0],dg=data[offset+1]-color[1],db=data[offset+2]-color[2];
 return dr*dr+dg*dg+db*db<=tolerance*tolerance*3;
};
function limits(width,height,requested){
 if(!requested)return {left:0,top:0,right:width,bottom:height};
 const x=requested.x??requested.minX,y=requested.y??requested.minY,w=requested.width,h=requested.height;
 if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)throw toolError('The selection box needs a positive width and height.');
 const left=Math.max(0,Math.floor(x)),top=Math.max(0,Math.floor(y)),right=Math.min(width,Math.ceil(x+w)),bottom=Math.min(height,Math.ceil(y+h));
 if(left>=right||top>=bottom)throw toolError('The selection box is outside the image.');return {left,top,right,bottom};
}
function flood(width,height,seeds,allowed,bounds={left:0,top:0,right:width,bottom:height}){
 const mask=new Uint8Array(width*height),queue=new Uint32Array(width*height);let head=0,tail=0;
 const admit=index=>{if(!mask[index]&&allowed(index)){mask[index]=1;queue[tail++]=index;}};
 for(const seed of seeds)admit(seed);
 while(head<tail){const index=queue[head++],x=index%width,y=(index-x)/width;if(x>bounds.left)admit(index-1);if(x+1<bounds.right)admit(index+1);if(y>bounds.top)admit(index-width);if(y+1<bounds.bottom)admit(index+width);}
 return {mask,pixels:queue.subarray(0,tail),pixelCount:tail};
}
function borderPixels(width,height){const result=[];for(let x=0;x<width;x++){result.push(x);if(height>1)result.push((height-1)*width+x);}for(let y=1;y<height-1;y++){result.push(y*width);if(width>1)result.push(y*width+width-1);}return result;}
function inferBackground(data,border){
 const bins=new Map();let transparent=0;
 for(const index of border){const o=index*4;if(data[o+3]<16){transparent++;continue;}const key=(data[o]>>5)*64+(data[o+1]>>5)*8+(data[o+2]>>5);let bin=bins.get(key);if(!bin)bins.set(key,bin={count:0,total:[0,0,0]});bin.count++;for(let c=0;c<3;c++)bin.total[c]+=data[o+c];}
 if(transparent>=border.length*.8)return {transparent:true};
 const best=[...bins.values()].sort((a,b)=>b.count-a.count)[0];
 if(!best||best.count<Math.max(1,(border.length-transparent)*.25))throw toolError('The border has no clear plain background color. Crop the artwork or trace its outline instead.','BACKGROUND_UNCLEAR');
 return {color:best.total.map(v=>Math.round(v/best.count))};
}

/** Removes only matching pixels reachable from an image edge. Interior colors stay unchanged. */
export function removeConnectedBackground(input,{tolerance=30,backgroundColor}={}){
 const {width,height,data}=raster(input);tolerance=optionNumber(tolerance,30,0,150);
 const border=borderPixels(width,height),resultData=new Uint8ClampedArray(data);
 let inferred;
 if(backgroundColor!==undefined){if(!Array.isArray(backgroundColor)||backgroundColor.length!==3||backgroundColor.some(n=>!Number.isFinite(n)||n<0||n>255))throw toolError('Choose an RGB background color.');inferred={color:backgroundColor};}
 else inferred=inferBackground(data,border);
 if(inferred.transparent)return {width,height,data:resultData,removedPixels:0,warnings:['The image border is already transparent. No background pixels were removed.']};
 const selected=flood(width,height,border,index=>data[index*4+3]<16||colorMatch(data,index,inferred.color,tolerance));let removedPixels=0;
 for(const index of selected.pixels)if(resultData[index*4+3]){resultData[index*4+3]=0;removedPixels++;}
 const warnings=[];if(!removedPixels)warnings.push('No connected background matched this tolerance.');
 else {warnings.push('Check the result before accepting: matching artwork connected to the image edge can also be removed.');if(removedPixels>width*height*.95)warnings.push('Almost the whole image matched the background. Undo or use a lower tolerance if artwork disappeared.');}
 return {width,height,data:resultData,removedPixels,backgroundColor:inferred.color,warnings};
}

/** Label all alpha-connected regions without turning decoration into puppet parts. */
export function enumerateImageComponents(input,{minAlpha=16,maxComponents=4096}={}){
 const {width,height,data}=raster(input);minAlpha=optionNumber(minAlpha,16,1,255);maxComponents=optionNumber(maxComponents,4096,1,65536);
 if(!Number.isInteger(maxComponents))throw toolError('The maximum number of regions must be a whole number.');
 const labels=new Uint32Array(width*height),queue=new Uint32Array(width*height),components=[];
 for(let seed=0;seed<labels.length;seed++){
  if(labels[seed]||data[seed*4+3]<minAlpha)continue;
  if(components.length===maxComponents)throw toolError('This image contains too many disconnected marks to review. Clean the background or select a simpler image first.','TOO_MANY_COMPONENTS');
  const id=components.length+1;let head=0,tail=1,minX=width,minY=height,maxX=0,maxY=0;queue[0]=seed;labels[seed]=id;
  const admit=index=>{if(!labels[index]&&data[index*4+3]>=minAlpha){labels[index]=id;queue[tail++]=index;}};
  while(head<tail){const index=queue[head++],x=index%width,y=(index-x)/width;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+1);maxY=Math.max(maxY,y+1);if(x>0)admit(index-1);if(x+1<width)admit(index+1);if(y>0)admit(index-width);if(y+1<height)admit(index+width);}
  components.push({id,pixelCount:tail,bounds:{x:minX,y:minY,width:maxX-minX,height:maxY-minY,minX,minY,maxX,maxY},touchesEdge:minX===0||minY===0||maxX===width||maxY===height});
 }
 components.sort((a,b)=>b.pixelCount-a.pixelCount||a.id-b.id);
 return {width,height,labels,components};
}

function componentAtSeed(seed,width,height,labels){
 if(!Array.isArray(seed)||seed.length!==2||seed.some(value=>!Number.isFinite(value)))throw toolError('Click a visible region to keep or remove.');
 const x=Math.floor(seed[0]),y=Math.floor(seed[1]);
 if(x<0||y<0||x>=width||y>=height)throw toolError('Click inside the image.');
 const id=labels[y*width+x];if(!id)throw toolError('That point is background or transparent. Click a visible region.');return id;
}

/**
 * Preview subject cleanup before tracing/splitting. Connectivity uses alpha, never
 * color, so patterned clothes stay together. The largest region is only a review
 * draft; seed replaces it, keepSeeds adds regions, and excludeSeeds removes them.
 * Pixels, bounds and labels retain the original image coordinates. No anatomy or
 * hidden artwork is inferred, and no region becomes a puppet part here.
 */
export function isolateImageSubject(input,{seed,keepSeeds=[],excludeSeeds=[],minAlpha=16,backgroundTolerance=30,backgroundColor,maxComponents=4096}={}){
 const source=raster(input);minAlpha=optionNumber(minAlpha,16,1,255);
 if(!Array.isArray(keepSeeds)||!Array.isArray(excludeSeeds))throw toolError('Additional selections must be lists of image points.');
 backgroundTolerance=optionNumber(backgroundTolerance,30,0,150);
 let originalTransparent=0;for(let i=3;i<source.data.length;i+=4)if(source.data[i]<minAlpha)originalTransparent++;
 const sourceBorder=borderPixels(source.width,source.height),transparentBorder=sourceBorder.reduce((count,index)=>count+(source.data[index*4+3]<minAlpha?1:0),0)>=sourceBorder.length*.8;
 const hasSeparatedAlpha=originalTransparent>=source.width*source.height*.05||transparentBorder;
 // Existing substantial transparency already separates foreground. Guessing a
 // color from an opaque decorative edge could otherwise erase black mane/ink.
 const cleaned=backgroundColor===undefined&&hasSeparatedAlpha?{width:source.width,height:source.height,data:new Uint8ClampedArray(source.data),removedPixels:0,warnings:['Existing transparency is used as the background. No artwork color was removed.']}:removeConnectedBackground(source,{tolerance:backgroundTolerance,backgroundColor}),{width,height}=cleaned;
 const {labels,components}=enumerateImageComponents(cleaned,{minAlpha,maxComponents});
 if(!components.length)throw toolError('No visible subject remains. Lower the background tolerance or use an image with a clearer background.','NO_SUBJECT');
 const largest=components[0],totalPixels=width*height,foregroundPixels=components.reduce((sum,component)=>sum+component.pixelCount,0);
 const selected=new Set([seed===undefined?largest.id:componentAtSeed(seed,width,height,labels)]);
 for(const point of keepSeeds)selected.add(componentAtSeed(point,width,height,labels));
 for(const point of excludeSeeds)selected.delete(componentAtSeed(point,width,height,labels));
 if(!selected.size)throw toolError('Keep at least one visible region before accepting the cleanup.','NO_SUBJECT');
 const kept=components.filter(component=>selected.has(component.id)),keptPixels=kept.reduce((sum,component)=>sum+component.pixelCount,0),data=new Uint8ClampedArray(cleaned.data);
 // A removed frame can leave its entire opaque interior connected to a subject.
 // Judge only kept regions: a different, clicked subject may be separable even
 // when an unselected background remnant is the largest component in the image.
 const opaqueRemnant=kept.some(component=>component.pixelCount>totalPixels*.95||(component.pixelCount/(component.bounds.width*component.bounds.height)>.97&&component.bounds.width>width*.85&&component.bounds.height>height*.85));
 if(foregroundPixels===totalPixels||(!hasSeparatedAlpha&&opaqueRemnant))throw toolError('The subject is still joined to an opaque background or enclosing frame. Remove that background or frame before selecting the character.','SUBJECT_UNSEPARATED');
 let removedPixels=0,removedComponentPixels=0;
 for(let index=0;index<labels.length;index++)if(!selected.has(labels[index])){if(source.data[index*4+3])removedPixels++;if(labels[index])removedComponentPixels++;data[index*4+3]=0;}
 const minX=Math.min(...kept.map(component=>component.bounds.minX)),minY=Math.min(...kept.map(component=>component.bounds.minY)),maxX=Math.max(...kept.map(component=>component.bounds.maxX)),maxY=Math.max(...kept.map(component=>component.bounds.maxY));
 const warnings=[...cleaned.warnings];
 if(opaqueRemnant)warnings.push('A kept region is a large, nearly solid rectangle. Check that it is artwork rather than a remaining background.');
 if(seed===undefined)warnings.push('The largest connected region is selected as a draft, not a recognized character. Review it and click the character if needed.');
 warnings.push('This keeps connected visible pixels, not anatomical parts. Use tracing or splitting after accepting the cleanup.');
 warnings.push('Decoration touching the character remains attached. Separate it manually before accepting if it is unwanted.');
 if(components.length>kept.length)warnings.push(`${components.length-kept.length} disconnected region(s) will be removed. Keep any separate legs, props or other intentional pieces before accepting.`);
 if(kept.some(component=>component.touchesEdge))warnings.push('A kept region touches the image edge. Check for a remaining border or clipped artwork.');
 return {width,height,data,keptPixels,removedPixels,backgroundRemovedPixels:cleaned.removedPixels,removedComponentPixels,subjectBounds:{x:minX,y:minY,width:maxX-minX,height:maxY-minY,minX,minY,maxX,maxY},components:components.map(component=>({...component,selected:selected.has(component.id)})),labels,selectedComponentIds:kept.map(component=>component.id),keptComponentCount:kept.length,removedComponentCount:components.length-kept.length,warnings};
}

function removeCollinear(points){
 if(points.length<4)return points;
 const out=[];for(let i=0;i<points.length;i++){const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];if((b[0]-a[0])*(c[1]-b[1])!==(b[1]-a[1])*(c[0]-b[0]))out.push(b);}return out;
}
function distanceSquared(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;}
function simplifyOpen(points,tolerance){
 if(points.length<3)return points;const keep=new Uint8Array(points.length),stack=[[0,points.length-1]];keep[0]=keep[points.length-1]=1;
 while(stack.length){const [first,last]=stack.pop();let far=-1,max=tolerance*tolerance;for(let i=first+1;i<last;i++){const d=distanceSquared(points[i],points[first],points[last]);if(d>max){max=d;far=i;}}if(far>=0){keep[far]=1;stack.push([first,far],[far,last]);}}
 return points.filter((_,i)=>keep[i]);
}
function simplifyClosed(points,tolerance){let far=1,max=0;for(let i=1;i<points.length;i++){const d=(points[i][0]-points[0][0])**2+(points[i][1]-points[0][1])**2;if(d>max){max=d;far=i;}}const a=simplifyOpen(points.slice(0,far+1),tolerance),b=simplifyOpen([...points.slice(far),points[0]],tolerance);return [...a.slice(0,-1),...b.slice(0,-1)];}
function contourForPixels(width,height,pixels,belongs,{simplify=.65}={}){
 const stride=width+1,edges=new Set();
 const edge=(x,y,direction)=>{edges.add((y*stride+x)*4+direction);if(edges.size>MAX_EDGES)throw toolError('This boundary is too intricate for a cut piece. Select a smaller region or trace a simpler outline.','COMPLEX_BOUNDARY');};
 for(const index of pixels){const x=index%width,y=(index-x)/width;if(y===0||!belongs(index-width))edge(x,y,0);if(x===width-1||!belongs(index+1))edge(x+1,y,1);if(y===height-1||!belongs(index+width))edge(x+1,y+1,2);if(x===0||!belongs(index-1))edge(x,y+1,3);}
 const loops=[];
 while(edges.size){const first=edges.values().next().value;let current=first;const loop=[];let closed=false;
  for(let step=0;step<=MAX_EDGES;step++){
   if(!edges.delete(current))throw toolError('The pixel boundary could not be traced safely. Use a manual outline.','COMPLEX_BOUNDARY');
   const direction=current%4,start=(current-direction)/4,x=start%stride,y=(start-x)/stride;loop.push([x,y]);const end=start+[1,stride,-1,-stride][direction];
   const nextDirections=[(direction+1)%4,direction,(direction+3)%4,(direction+2)%4];let next;
   for(const d of nextDirections){const candidate=end*4+d;if(candidate===first||edges.has(candidate)){next=candidate;break;}}
   if(next===first){closed=true;break;}if(next===undefined)break;current=next;
  }
  if(!closed)throw toolError('The outline did not close. Trace the boundary manually.','COMPLEX_BOUNDARY');
  const compact=removeCollinear(loop);if(compact.length>=3&&Math.abs(polygonArea(compact))>0)loops.push(compact);
 }
 if(!loops.length)throw toolError('No cuttable boundary was found.');
 loops.sort((a,b)=>Math.abs(polygonArea(b))-Math.abs(polygonArea(a)));const original=loops[0];let polygon=original;
 if(original.length>MAX_POINTS){let tolerance=Math.max(.1,simplify);for(let tries=0;tries<8;tries++){const candidate=simplifyClosed(original,tolerance);if(candidate.length>=3&&candidate.length<=MAX_POINTS&&!selfIntersects(candidate)){polygon=candidate;break;}tolerance*=1.6;}}
 if(polygon.length>MAX_POINTS||selfIntersects(polygon))throw toolError('This region has a touching or overly complex outline. Adjust the selection or trace a simpler boundary.','COMPLEX_BOUNDARY');
 if(polygonArea(polygon)<0)polygon=[...polygon].reverse();
 const warnings=[];if(loops.length>1)warnings.push('Internal openings are retained in the artwork, but only the outer cut boundary is created. Add interior cuts separately if needed.');if(polygon!==original)warnings.push('The pixel outline was simplified. Review narrow details before cutting.');
 return {polygon,bounds:boundsOf(polygon),warnings,interiorLoops:loops.length-1};
}

/** A color-connected click selection; optional bounds constrain it to a student-drawn box. */
export function selectImageRegion(input,seed,{tolerance=35,bounds,minAlpha=16,simplify=.65}={}){
 const {width,height,data}=raster(input);tolerance=optionNumber(tolerance,35,0,150);minAlpha=optionNumber(minAlpha,16,1,255);simplify=optionNumber(simplify,.65,0,20);
 if(!Array.isArray(seed)||seed.length!==2||seed.some(v=>!Number.isFinite(v)))throw toolError('Click a point inside the artwork.');
 const x=Math.floor(seed[0]),y=Math.floor(seed[1]),box=limits(width,height,bounds);
 if(x<box.left||x>=box.right||y<box.top||y>=box.bottom)throw toolError('Click inside the image or selection box.');
 const index=y*width+x,offset=index*4;if(data[offset+3]<minAlpha)throw toolError('That point is transparent. Click inside a visible part.');
 const color=[data[offset],data[offset+1],data[offset+2]],region=flood(width,height,[index],i=>data[i*4+3]>=minAlpha&&colorMatch(data,i,color,tolerance),box);
 if(region.pixelCount<3)throw toolError('The selected region is too small. Increase tolerance or trace the part.');
 const contour=contourForPixels(width,height,region.pixels,i=>region.mask[i]===1,{simplify});
 const warnings=[...contour.warnings,'This selects connected similar colors, not a named body part. Check the boundary and split or trace as needed.'];
 if(contour.bounds.minX===0||contour.bounds.minY===0||contour.bounds.maxX===width||contour.bounds.maxY===height)warnings.push('The selection touches the image edge. Check that it is artwork rather than the background.');
 return {...contour,pixelCount:region.pixelCount,mask:region.mask,width,height,warnings};
}

/** Extracts disconnected opaque silhouettes, useful for transparent artwork or a separated part sheet. */
export function extractImageSilhouette(input,{minArea=16,minAlpha=16,maxParts=40,simplify=.65}={}){
 const {width,height,data}=raster(input);minArea=optionNumber(minArea,16,1,MAX_PIXELS);minAlpha=optionNumber(minAlpha,16,1,255);maxParts=optionNumber(maxParts,40,1,80);simplify=optionNumber(simplify,.65,0,20);if(!Number.isInteger(maxParts))throw toolError('The maximum number of parts must be a whole number.');
 const labels=new Uint32Array(width*height),queue=new Uint32Array(width*height),parts=[],components=[],warnings=[];let component=0,ignored=0,oversize=0,opaque=0;
 for(let i=3;i<data.length;i+=4)if(data[i]>=minAlpha)opaque++;
 if(opaque===width*height)return {parts:[],warnings:['The image still has an opaque background. Remove the plain background or trace a part before extracting silhouettes.']};
 for(let seed=0;seed<labels.length;seed++){
  if(labels[seed]||data[seed*4+3]<minAlpha)continue;
  component++;let head=0,tail=1;queue[0]=seed;labels[seed]=component;
  const admit=i=>{if(!labels[i]&&data[i*4+3]>=minAlpha){labels[i]=component;queue[tail++]=i;}};
  while(head<tail){const index=queue[head++],x=index%width,y=(index-x)/width;if(x>0)admit(index-1);if(x+1<width)admit(index+1);if(y>0)admit(index-width);if(y+1<height)admit(index+width);}
  if(tail<minArea){ignored++;continue;}
  if(components.length>=maxParts){oversize++;let smallest=0;for(let i=1;i<components.length;i++)if(components[i].pixelCount<components[smallest].pixelCount)smallest=i;if(tail<=components[smallest].pixelCount)continue;components.splice(smallest,1);}
  components.push({label:component,pixels:queue.slice(0,tail),pixelCount:tail});
 }
 for(const item of components)try{const contour=contourForPixels(width,height,item.pixels,i=>labels[i]===item.label,{simplify});parts.push({...contour,pixelCount:item.pixelCount});}catch(error){warnings.push(error.message);}
 parts.sort((a,b)=>b.pixelCount-a.pixelCount);if(ignored)warnings.push(`${ignored} tiny disconnected region(s) were omitted; check that no intentional detail was lost.`);if(oversize)warnings.push(`${oversize} additional region(s) were omitted. Work on a smaller part sheet.`);if(!parts.length&&!warnings.length)warnings.push('No opaque silhouette was found.');
 if(parts.length===1)warnings.push('One connected silhouette was found. Use split or trace to define the moving parts.');
 for(const part of parts)for(const warning of part.warnings)if(!warnings.includes(warning))warnings.push(warning);
 return {parts,warnings};
}

/** Decode an embedded raster locally; there is no external image or AI request. */
export async function decodeArtwork(asset){
 if(!asset||typeof asset.dataUrl!=='string'||asset.dataUrl.length>20*1024*1024||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.dataUrl))throw toolError('Use an embedded PNG, JPEG or WebP artwork.','IMAGE_FORMAT');
 const encoded=asset.dataUrl.slice(asset.dataUrl.indexOf(',')+1),raw=atob(encoded),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 let decoded;
 try{
  if(typeof createImageBitmap==='function')decoded=await createImageBitmap(new Blob([bytes],{type:asset.dataUrl.slice(5,asset.dataUrl.indexOf(';'))}));
  else decoded=await new Promise((resolve,reject)=>{const image=new Image(),timer=setTimeout(()=>reject(toolError('The artwork could not be decoded.')),15000);image.onload=()=>{clearTimeout(timer);resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(toolError('The artwork could not be decoded.'));};image.src=asset.dataUrl;});
  const width=decoded.width||decoded.naturalWidth,height=decoded.height||decoded.naturalHeight;if(width*height>MAX_PIXELS||width>4096||height>4096)throw toolError('This image is too large for local selection. Import a smaller copy.','IMAGE_SIZE');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw toolError('Image editing is unavailable in this browser.');ctx.drawImage(decoded,0,0);const result=ctx.getImageData(0,0,width,height);return {width,height,data:new Uint8ClampedArray(result.data)};
 }finally{decoded?.close?.();}
}

/** Re-encode a local result without cropping, preserving the shared artwork coordinates. */
export function assetFromImageData(input,{name='Edited artwork',id}={}){
 const {width,height,data}=raster(input),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw toolError('Image editing is unavailable in this browser.');const image=ctx.createImageData(width,height);image.data.set(data);ctx.putImageData(image,0,0);
 return {id:id||globalThis.crypto?.randomUUID?.()||'art-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9),name:String(name).slice(0,160),mime:'image/png',width,height,dataUrl:canvas.toDataURL('image/png')};
}
