import {PARTS,escapeXml as e,transforms,anchors,partBounds,layoutPrint,physicalScale} from './model.mjs';
const round=n=>Math.round(n*100)/100;
function baseContour(c,id){
 const part=PARTS.find(p=>p.id===id),L=part.length;
 if(id==='head'){const back=c.hair==='bun'?'M -9 3 L -16 -14 Q -39 -25 -34 -58 Q -45 -78 -28 -92 Q -51 -112 -26 -115 Q -4 -117 -9 -99 Q 16 -103 24 -79':c.hair==='long'?'M -9 3 L -16 -14 L -45 0 Q -58 -56 -34 -87 Q -12 -112 17 -89 L 24 -79':c.hair==='cap'?'M -9 3 L -16 -14 Q -39 -25 -34 -58 Q -44 -99 -10 -103 Q 20 -104 26 -79 L 39 -70 L 27 -65':'M -9 3 L -16 -14 Q -39 -25 -34 -58 Q -46 -97 -10 -100 Q 19 -102 24 -79';return back+' L 30 -64 L 45 -53 L 34 -48 L 37 -40 L 32 -37 Q 35 -22 15 -19 L 11 3 Z';}
 if(id==='torso')return c.clothing==='robe'?'M -12 -9 Q -27 -8 -34 14 L -27 59 Q -30 100 -45 157 Q 1 172 44 157 L 26 59 L 34 14 Q 27 -8 12 -9 Z':c.clothing==='jacket'?'M -12 -9 L -34 12 L -31 82 L -36 150 L 36 150 L 31 82 L 34 12 L 12 -9 Z':'M -12 -9 L -32 12 L -26 66 L -35 153 Q 0 166 35 153 L 26 66 L 32 12 L 12 -9 Z';
 if(id.startsWith('upper'))return c.clothing==='robe'?`M -12 -9 Q -23 5 -23 23 L -27 ${L-9} Q 0 ${L+17} 24 ${L-9} L 17 20 Q 16 -9 -12 -9 Z`:`M -12 -9 Q -22 0 -20 18 L -17 ${L} Q 0 ${L+13} 17 ${L} L 19 18 Q 20 -8 -12 -9 Z`;
 if(id.startsWith('forearm'))return `M -10 -9 Q -17 -3 -15 15 L -12 ${L-22} L -10 ${L-6} L -6 ${L+8} Q -2 ${L+13} 2 ${L+10} L 4 ${L-1} L 9 ${L+8} Q 15 ${L+11} 15 ${L+4} L 10 ${L-13} L 13 ${L-22} L 15 12 Q 17 -10 -10 -9 Z`;
 if(id.startsWith('thigh'))return `M -11 -10 Q -21 -4 -18 18 L -14 ${L} Q 0 ${L+13} 14 ${L} L 17 18 Q 19 -10 -11 -10 Z`;
 return `M -9 -10 Q -17 -4 -14 20 L -11 ${L-6} L -13 ${L+7} Q 4 ${L+14} 31 ${L+8} L 31 ${L-1} Q 24 ${L-9} 11 ${L-13} L 14 20 Q 16 -10 -9 -10 Z`;
}
export function contour(c,id){
 if(id==='torso'){
  const g=c.garment.hemLength,bottom=152*g,w=c.clothing==='robe'?44:c.clothing==='jacket'?36:32;
  if(bottom<145)return 'M -12 -9 Q -27 -8 -34 14 L -27 59 L -'+w+' '+bottom+' L -25 '+bottom+' L -25 153 Q 0 165 25 153 L 25 '+bottom+' L '+w+' '+bottom+' L 27 59 L 34 14 Q 27 -8 12 -9 Z';
  return 'M -12 -9 Q -27 -8 -34 14 L -27 59 L -'+w+' '+bottom+' Q 0 '+(bottom+12)+' '+w+' '+bottom+' L 27 59 L 34 14 Q 27 -8 12 -9 Z';
 }
 if(id.startsWith('upper')){
  const L=PARTS.find(p=>p.id===id).length,w=19*c.garment.sleeveWidth*(c.clothing==='robe'?1.2:1),end=L*c.garment.sleeveLength;
  if(end<L-3)return 'M -12 -9 Q -'+w+' 0 -'+w+' 20 L -'+w+' '+end+' L -11 '+end+' L -11 '+L+' Q 0 '+(L+12)+' 11 '+L+' L 11 '+end+' L '+w+' '+end+' L '+w+' 20 Q '+w+' -9 -12 -9 Z';
  return 'M -12 -9 Q -'+w+' 0 -'+w+' 20 L -'+w+' '+end+' Q 0 '+(end+12)+' '+w+' '+end+' L '+w+' 20 Q '+w+' -9 -12 -9 Z';
 }
 if(id==='head'){
  let path=baseContour(c,id);
  if(c.faceShape==='soft')path=path.replace('L 45 -53 L 34 -48','Q 43 -54 39 -51 L 32 -48').replace('Q 35 -22 15 -19','Q 28 -18 12 -19');
  if(c.faceShape==='angular')path=path.replace('Q 35 -22 15 -19','L 29 -23 L 12 -17');
  return path;
 }
 return baseContour(c,id);
}
function motif(type,x,y,size=12){if(type==='plain')return '';if(type==='cloud')return `<path d="M${x-size} ${y+4} q-${size/2} -9 4 -10 q3 -12 12 -6 q10 -3 11 6 q12 7 0 12 h-19" fill="none"/>`;if(type==='geometric')return `<path d="M${x} ${y-size} l${size} ${size} -${size} ${size} -${size} -${size}Z M${x} ${y-size/2} l${size/2} ${size/2} -${size/2} ${size/2} -${size/2} -${size/2}Z" fill="none"/>`;return `<g transform="translate(${x} ${y})">${Array.from({length:6},(_,i)=>`<ellipse cx="0" cy="-${size*.65}" rx="${size*.27}" ry="${size*.55}" transform="rotate(${i*60})" fill="none"/>`).join('')}<circle r="${size*.22}"/></g>`;}
export function partArt(c,id,{joints=false,selected=false,outline=false,instance='main',holeUnits=3}={}){
 const p=PARTS.find(p=>p.id===id),v=c.parts[id],path=contour(c,id),clip=`clip-${instance}-${id}`,fill=id==='head'?c.skin:id.startsWith('shin')?c.secondary:id.includes('Back')?c.secondary:c.primary;
 let decoration='';
 if(id==='head'){
  const hair=c.hair==='none'?'':c.hair==='cap'?'<path d="M-36 -60 Q-44 -99 -10 -101 Q20 -104 26 -79 L39 -70 L20 -66 Q-9 -83 -36 -60Z"/>':c.hair==='short'?'<path d="M-34 -50 Q-46 -97 -10 -100 Q19 -102 27 -77 L12 -73 L9 -83 L-4 -74 L-18 -61 L-22 -41Z"/>':c.hair==='long'?'<path d="M-34 -31 L-45 0 Q-58 -56 -34 -87 Q-12 -112 17 -89 L24 -76 Q-7 -86 -18 -57 L-22 -24Z"/>':'<path d="M-34 -38 Q-49 -69 -28 -92 Q-51 -112 -26 -113 Q-4 -117 -9 -99 Q16 -103 25 -77 Q-4 -85 -18 -60 L-23 -32Z"/>';
  const ageMarks=c.age==='elder'?'<path d="M3 -51l7 3 M4 -46l6 2 M20 -30l8 -3 M-6 -70l12 -2" fill="none" stroke="#675b50" stroke-width="1.3"/>':c.age==='child'?'<circle cx="18" cy="-41" r="6" fill="#cda58d" opacity=".6"/>':c.age==='teen'?'<path d="M5 -67 Q13 -69 21 -65" fill="none" stroke="#675b50" stroke-width="1.4"/>':'';
  decoration=`<g fill="${e(c.hairColor)}">${hair}</g><path d="M5 -66 Q13 -73 23 -65 M6 -59 Q14 -66 23 -59 M26 -37 L33 -38 M-13 -52 Q-24 -58 -24 -42 Q-24 -32 -16 -33" fill="none" stroke="#3f3429" stroke-width="2"/><circle cx="16" cy="-60" r="${c.age==='child'?3:2}" fill="#362b26"/>${ageMarks}`;

 }else{
  const L=p.length;
  decoration=`<g clip-path="url(#${clip})"><path d="M-36 35 Q0 51 36 35 M-38 42 Q0 58 38 42 M-42 ${L-16} Q0 ${L-1} 42 ${L-16} M-44 ${L-9} Q0 ${L+6} 44 ${L-9}" fill="none" stroke-width="3"/>${motif(c.pattern,0,id==='torso'?78:30,id==='torso'?21:10)}${id==='torso'?motif(c.pattern,-17,124,10)+motif(c.pattern,19,122,10):''}<path d="M-7 2 Q-5 18 0 22 Q5 18 7 2" fill="none" stroke-width="2"/>${id==='torso'?'<path d="M-12 -4 L5 35 L18 1 M5 35 L5 68" fill="none" stroke-width="3"/>':''}${id.startsWith('forearm')?`<path d="M-11 ${L-20} L11 ${L-20} L9 ${L-8} L15 ${L+4} L5 ${L+4} L2 ${L+10} L-6 ${L+6}Z" fill="${e(c.skin)}" stroke="#7c4633" stroke-width="1"/>`:''}${id.startsWith('shin')?`<path d="M-12 ${L-10} L11 ${L-15} Q21 ${L-8} 31 ${L-1} L31 ${L+8} Q0 ${L+13} -13 ${L+7}Z" fill="${e(c.hairColor)}" stroke="${e(c.accent)}" stroke-width="2"/>`:''}</g>`;
 }
 if(c.pattern==='plain'&&id!=='head')decoration='';
 const strokes=v.strokes.map(st=>`<polyline points="${st.points.map(pt=>pt.join(',')).join(' ')}" fill="none" stroke="${e(st.color)}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
 return `<g data-part="${id}" role="button" tabindex="0" aria-label="${e(p.en)}" class="puppet-part${selected?' selected':''}"><g transform="scale(${v.width} ${v.length})"><defs><clipPath id="${clip}"><path d="${path}"/></clipPath></defs><path class="part-contour" d="${path}" fill="${outline?'#fff':e(fill)}" stroke="${selected?'#d15338':'#613c2d'}" stroke-width="${selected?3:1.8}" stroke-linejoin="round"/>${outline?'':`<g stroke="${id==='head'?'#675b50':e(c.accent)}" fill="${id==='head'?'#675b50':e(c.accent)}" stroke-width="1.6">${decoration}</g><g clip-path="url(#${clip})">${strokes}</g>`}</g>${joints?anchors(c,id).map(([x,y])=>`<circle cx="${x}" cy="${y}" r="${holeUnits/2}" fill="#fff" stroke="#38332c" stroke-width=".8"/><path d="M${x-4} ${y}h8 M${x} ${y-4}v8" stroke="#38332c" stroke-width=".5"/>`).join(''):''}</g>`;
}
export function accessoryArt(a){const color=e(a.color);const shapes={letter:`<rect x="-22" y="-15" width="44" height="30" rx="2" fill="#f8e8bf"/><path d="M-22 -15 L0 2 L22 -15 M-13 9h26" fill="none"/>`,fan:`<path d="M0 25 L-36 -10 Q0 -45 36 -10 Z" fill="${color}"/>${[-30,-15,0,15,30].map(x=>`<path d="M0 25 L${x} ${-25+Math.abs(x)/2}"/>`).join('')}`,lantern:`<path d="M0 -32v-18 M-17 -27h34 M-17 27h34 M0 28v20"/><ellipse rx="26" ry="27" fill="${color}"/><ellipse rx="12" ry="27" fill="none"/><path d="M-26 0h52"/>`,sword:'<path d="M-5 0 L-4 -65 L0 -80 L5 -65 L5 0Z" fill="#b4c7b9"/><path d="M-15 0h30 M0 0v23" stroke-width="5"/>',bag:`<path d="M-13 -13 Q0 -37 13 -13" fill="none" stroke-width="4"/><rect x="-24" y="-13" width="48" height="38" rx="5" fill="${color}"/><path d="M-24 -1h48 M-5 -3v12h10v-12" fill="none"/>`};return `<g data-accessory="${e(a.id)}" class="accessory" transform="translate(${a.x} ${a.y}) rotate(${a.angle}) scale(${a.scale})" stroke="#714331" stroke-width="1.6">${shapes[a.type]||shapes.letter}</g>`;}
export function puppet(c,{selected=null,joints=false,angles={},instance='stage',outline=false}={}){
 const tx=transforms(c,angles);const order=['thighBack','shinBack','upperArmBack','forearmBack','thighFront','shinFront','torso','head','upperArmFront','forearmFront'];
 return order.map(id=>{const p=tx[id];return `<g transform="translate(${round(p.x)} ${round(p.y)}) rotate(${round(p.a*180/Math.PI)})">${partArt(c,id,{selected:selected===id,joints,instance,outline})}${c.accessories.filter(a=>a.parent===id).map(accessoryArt).join('')}</g>`;}).join('');
}
export function fullSvg(c,options={}){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 620" width="800" height="620" role="img" aria-label="${e(c.name||'Unnamed puppet / 未命名皮影')}"><g transform="translate(395 176)">${puppet(c,options)}</g></svg>`;}
export function printPages(c,height=280,hole=3){
 const scale=physicalScale(c,height),pages=layoutPrint(c,height);
 return pages.map((items,page)=>`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297"><rect width="210" height="297" fill="white"/><g font-family="Arial, sans-serif" fill="#252b27"><text x="10" y="12" font-size="4.2">${e(c.name)} · ${height} mm · ${page+1}/${pages.length}</text><text x="10" y="19" font-size="2.7">Print at 100% / 实际大小打印 · Joint marks / 关节孔 ${hole} mm</text></g>${items.map(item=>{const p=PARTS.find(p=>p.id===item.id);return `<g transform="translate(${round(item.x+4-item.bounds.x*scale)} ${round(item.y+3-item.bounds.y*scale)}) scale(${scale})">${partArt(c,item.id,{joints:true,instance:'print-'+page,holeUnits:hole/scale})}</g><text x="${item.x+4}" y="${round(item.y+item.h-2)}" font-family="Arial,sans-serif" font-size="2.7">${e(p.en)} / ${e(p.zh)}</text>`;}).join('')}<g stroke="#222" stroke-width=".3"><path d="M10 281v4 M10 283h50 M60 281v4"/></g><text x="65" y="284" font-size="3" font-family="Arial">50 mm · Check before cutting / 剪裁前核对</text><text x="10" y="292" font-size="2.7" font-family="Arial">Prototype: test material, joints and rods. / 先测试材料、关节和操纵杆。</text></svg>`);
}
export function inspection(c,height,hole){const s=physicalScale(c,height);const minRadius=Math.min(...PARTS.filter(p=>p.id!=='torso'&&p.id!=='head').map(p=>8*c.parts[p.id].width*s));const propHeights={fan:73,letter:32,lantern:102,sword:108,bag:66};const allowed=Math.min(...c.accessories.map(a=>232/(propHeights[a.type]*s*a.scale)),...PARTS.map(p=>{const b=partBounds(c,p.id);return Math.min(182/(b.w*s),232/(b.h*s));}));return {parts:PARTS.length,connections:PARTS.length-1,minMargin:Math.round((minRadius-hole/2)*10)/10,pages:layoutPrint(c,height).length,accessories:c.accessories.length,printable:allowed>=1,maxHeight:Math.floor(height*Math.min(1,allowed))};}
export function propPrintPages(c,height=280){
 const bounds={fan:{x:-37,y:-46,w:74,h:73},letter:{x:-23,y:-16,w:46,h:32},lantern:{x:-28,y:-52,w:56,h:102},sword:{x:-17,y:-82,w:34,h:108},bag:{x:-25,y:-39,w:50,h:66}};
 const pages=[[]],scale=physicalScale(c,height);let x=10,y=25,row=0;
 for(const a of c.accessories){const b=bounds[a.type],k=scale*a.scale,w=b.w*k+8,h=b.h*k+13;if(x+w>200){x=10;y+=row+3;row=0;}if(y+h>272){pages.push([]);x=10;y=25;row=0;}pages.at(-1).push({a,b,k,x,y,w,h});x+=w+3;row=Math.max(row,h);}
 return c.accessories.length?pages.map((items,i)=>`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297"><rect width="210" height="297" fill="white"/><text x="10" y="14" font-family="Arial" font-size="4">Props / 道具 · ${i+1}/${pages.length}</text>${items.map(({a,b,k,x,y,h})=>`<g transform="translate(${x+4-b.x*k} ${y+3-b.y*k}) scale(${scale})">${accessoryArt({...a,x:0,y:0,angle:0})}</g><text x="${x+4}" y="${y+h-2}" font-family="Arial" font-size="3">${e(a.type)}</text>`).join('')}<path d="M10 281v4 M10 283h50 M60 281v4" stroke="#222" stroke-width=".3"/><text x="65" y="284" font-size="3" font-family="Arial">50 mm · Print at 100% / 按实际尺寸打印</text></svg>`):[];
}

export function partPreview(c,id){const b=partBounds(c,id);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x-10} ${b.y-10} ${b.w+20} ${b.h+20}">${partArt(c,id,{joints:true,instance:'detail'})}</svg>`;}
