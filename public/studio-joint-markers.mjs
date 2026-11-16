// Optional recognition of drawing marks, not anatomical joint recognition.
// Detection never removes, paints over or otherwise modifies source pixels.
const MAX_PIXELS=4_194_304;
const markerError=message=>Object.assign(new Error(message),{code:'JOINT_MARKER_INPUT'});
function sourceRaster(input){
 const {width,height,data}=input||{};
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||width*height>MAX_PIXELS||!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||data.length!==width*height*4)throw markerError('Use a decoded image of at most 4 megapixels.');
 return {width,height,data};
}
function matches(data,index,color){
 const o=index*4,r=data[o],g=data[o+1],b=data[o+2];if(data[o+3]<96)return false;
 return color==='black'?Math.max(r,g,b)<=70&&Math.max(r,g,b)-Math.min(r,g,b)<=35:r>=160&&b>=130&&g<=140&&Math.min(r,b)-g>=70&&Math.abs(r-b)<=110;
}
function roundMark(pixels,count,width,box){
 const w=box.maxX-box.minX+1,h=box.maxY-box.minY+1,rx=w/2,ry=h/2,cx=box.minX+rx,cy=box.minY+ry,ratio=w/h;
 if(w<4||h<4||count<7||ratio<.75||ratio>1.33)return null;
 const density=count/(w*h);if(density<.16||density>.92)return null;
 const sectors=new Float64Array(16);let inner=0,outside=0,sumX=0,sumY=0,minRho=Infinity;
 for(let i=0;i<count;i++){
  const index=pixels[i],x=index%width+.5,y=Math.floor(index/width)+.5,dx=(x-cx)/rx,dy=(y-cy)/ry,rho=Math.hypot(dx,dy);
  sumX+=x;sumY+=y;minRho=Math.min(minRho,rho);if(rho<.5)inner++;if(rho>1.1)outside++;
  const angle=Math.atan2(dy,dx),sector=Math.min(15,Math.floor((angle+Math.PI)/(2*Math.PI)*16));sectors[sector]=Math.max(sectors[sector],rho);
 }
 if(outside/count>.04||Math.hypot((sumX/count-cx)/rx,(sumY/count-cy)/ry)>.15)return null;
 // Round outlines reach almost equally far in all directions. Tiny marks use
 // fewer angular samples because their pixel grid cannot populate 16 sectors.
 const covered=Array.from(sectors).filter(rho=>rho>=.72).length,required=Math.min(w,h)<=5?4:Math.min(w,h)<11?8:14;
 if(covered<required)return null;
 const innerCoverage=inner/(Math.PI*rx*ry*.25),circularCoverage=count/(Math.PI*rx*ry);
 const filled=innerCoverage>=.72&&circularCoverage>=(Math.min(w,h)<7?.60:.73);
 const ring=innerCoverage<.18&&minRho>=.42&&density<=.66;
 if(!filled&&!ring)return null;
 return {point:[cx,cy],radius:(rx+ry)/2};
}

/**
 * Find small round magenta marks in original image-pixel coordinates.
 * Black detection is deliberately opt-in: eyes/buttons cannot be distinguished
 * reliably from black joint dots. All results remain reviewable candidates.
 */
export function detectJointMarkers(input,{color='magenta',maxMarkers=12}={}){
 const {width,height,data}=sourceRaster(input);
 if(!['magenta','black'].includes(color))throw markerError('Choose magenta or black marker detection.');
 if(!Number.isInteger(maxMarkers)||maxMarkers<1||maxMarkers>12)throw markerError('Detect between 1 and 12 joint markers at a time.');
 // Fixed memory bounded by raster size, even for heavily patterned images.
 const mask=new Uint8Array(width*height),queue=new Uint32Array(width*height),markers=[];
 for(let i=0;i<mask.length;i++)if(matches(data,i,color))mask[i]=1;
 const maxDiameter=Math.max(12,Math.min(64,Math.min(width,height)*.12));let found=0;
 for(let seed=0;seed<mask.length;seed++){
  if(mask[seed]!==1)continue;
  let head=0,tail=1,minX=width,minY=height,maxX=-1,maxY=-1;queue[0]=seed;mask[seed]=2;
  while(head<tail){
   const index=queue[head++],x=index%width,y=Math.floor(index/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   // Eight-neighbour connectivity retains thin diagonal sections of a ring.
   for(let yy=Math.max(0,y-1);yy<=Math.min(height-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(width-1,x+1);xx++){
    const next=yy*width+xx;if(mask[next]===1){mask[next]=2;queue[tail++]=next;}
   }
  }
  if(minX===0||minY===0||maxX===width-1||maxY===height-1||maxX-minX+1>maxDiameter||maxY-minY+1>maxDiameter)continue;
  const mark=roundMark(queue,tail,width,{minX,minY,maxX,maxY});if(!mark)continue;
  found++;if(markers.length<maxMarkers)markers.push({id:`image-${color}-${minX}-${minY}`,point:mark.point,radius:mark.radius,source:'image'});
 }
 const warnings=[];
 if(color==='black')warnings.push('Black dots may be eyes, buttons or decoration. Check every proposed marker before making joints.');
 if(found){warnings.push('Detected marks are candidate joint positions, not anatomical recognition. Review their positions and connections.');warnings.push('Embedded marks remain in the original artwork; detection does not reconstruct the pixels underneath them.');}
 else warnings.push(`No small round ${color} dots or rings were found. Add joint dots in the editor instead.`);
 if(found>maxMarkers)warnings.push(`Found ${found} candidate marks; showing the first ${maxMarkers}. The remaining ${found-maxMarkers} were not included.`);
 return {markers,warnings};
}
