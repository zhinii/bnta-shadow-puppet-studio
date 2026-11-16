export const SCHEMA_VERSION=1;
export const PARTS=[
 {id:'torso',en:'Torso',zh:'躯干',parent:null,anchor:[0,0],length:152,width:68},
 {id:'head',en:'Head',zh:'头部',parent:'torso',anchor:[0,0],length:100,width:72},
 {id:'upperArmBack',en:'Far upper arm',zh:'后侧上臂',parent:'torso',anchor:[-23,24],length:86,width:38},
 {id:'forearmBack',en:'Far forearm + hand',zh:'后侧前臂与手',parent:'upperArmBack',anchor:[0,86],length:83,width:30},
 {id:'thighBack',en:'Far thigh',zh:'后侧大腿',parent:'torso',anchor:[-15,141],length:91,width:35},
 {id:'shinBack',en:'Far lower leg + foot',zh:'后侧小腿与脚',parent:'thighBack',anchor:[0,91],length:94,width:30},
 {id:'thighFront',en:'Near thigh',zh:'前侧大腿',parent:'torso',anchor:[17,141],length:91,width:35},
 {id:'shinFront',en:'Near lower leg + foot',zh:'前侧小腿与脚',parent:'thighFront',anchor:[0,91],length:94,width:30},
 {id:'upperArmFront',en:'Near upper arm',zh:'前侧上臂',parent:'torso',anchor:[25,24],length:86,width:38},
 {id:'forearmFront',en:'Near forearm + hand',zh:'前侧前臂与手',parent:'upperArmFront',anchor:[0,86],length:83,width:30}
];
export const PART_IDS=PARTS.map(p=>p.id);
export const PALETTES={vermilion:['#b94731','#194f4b','#d9a64e'],jade:['#28776e','#c76a3a','#dfbb6b'],indigo:['#354b76','#b64c44','#dab166']};
export const clone=o=>JSON.parse(JSON.stringify(o));
export const uid=()=>globalThis.crypto?.randomUUID?.()||'p-'+Date.now()+'-'+Math.random().toString(36).slice(2);
export const escapeXml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const num=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
export const color=(v,fallback='#b94731')=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:fallback;
export const textValue=(v,max=1000)=>typeof v==='string'?v.slice(0,max):'';
const pick=(v,values,fallback)=>values.includes(v)?v:fallback;
export function createCharacter(){
 return {id:uid(),name:'',role:'',age:'adult',gender:'unspecified',brief:'',action:'',hair:'none',clothing:'base',pattern:'plain',faceShape:'neutral',primary:'#d2c8b6',secondary:'#beb5a6',accent:'#8b8172',skin:'#ded5c4',hairColor:'#4d5049',garment:{sleeveWidth:1,sleeveLength:1,hemLength:1},locks:{face:false,body:false,costume:false,props:false},parts:Object.fromEntries(PARTS.map(p=>[p.id,{width:1,length:1,angle:0,locked:false,strokes:[]}])),accessories:[],reflection:''};
}
export function createProject(){return {schemaVersion:1,id:uid(),title:'',story:{setting:'',theme:'',script:'',duration:3},characters:[createCharacter()],selected:0,height:280,hole:3,language:'en',revisions:[]};}
export function normalizeCharacter(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid character');
 const c=createCharacter(); c.id=textValue(raw.id,80)||uid();
 for(const key of ['name','role','brief','action','reflection'])c[key]=textValue(raw[key],key==='name'?100:2000);

 c.age=pick(raw.age,['child','teen','adult','elder'],'adult');c.gender=pick(raw.gender,['female','male','unspecified'],'unspecified');
 c.hair=pick(raw.hair,['none','bun','short','long','cap'],'none');c.clothing=pick(raw.clothing,['base','robe','tunic','jacket'],'base');c.pattern=pick(raw.pattern,['floral','cloud','geometric','plain'],'plain');
 c.faceShape=pick(raw.faceShape,['neutral','soft','angular'],'neutral');
 c.garment={sleeveWidth:num(raw.garment?.sleeveWidth,.8,1.6,1),sleeveLength:num(raw.garment?.sleeveLength,.65,1.3,1),hemLength:num(raw.garment?.hemLength,.7,1.35,1)};
 c.locks=Object.fromEntries(['face','body','costume','props'].map(k=>[k,raw.locks?.[k]===true]));
 for(const key of ['primary','secondary','accent','skin','hairColor'])c[key]=color(raw[key],c[key]);
 for(const id of PART_IDS){const p=raw.parts?.[id]||{};c.parts[id]={width:num(p.width,.65,1.5,1),length:num(p.length,.7,1.3,1),angle:num(p.angle,-150,150,0),locked:p.locked===true,strokes:Array.isArray(p.strokes)?p.strokes.slice(0,40).map(st=>({color:color(st.color,c.accent),points:Array.isArray(st.points)?st.points.slice(0,250).filter(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(Number.isFinite)).map(([x,y])=>[num(x,-100,100,0),num(y,-140,200,0)]):[]})).filter(st=>st.points.length>1):[]};}
 c.accessories=Array.isArray(raw.accessories)?raw.accessories.slice(0,8).map(a=>({id:textValue(a.id,80)||uid(),type:pick(a.type,['fan','letter','lantern','sword','bag'],'letter'),parent:pick(a.parent,PART_IDS,'forearmFront'),x:num(a.x,-180,180,0),y:num(a.y,-180,220,70),scale:num(a.scale,.4,2,1),angle:num(a.angle,-180,180,0),color:color(a.color,c.accent)})):[];
 return c;
}
export function normalizeProject(raw){
 if(!raw||raw.schemaVersion!==1||!Array.isArray(raw.characters)||!raw.characters.length||raw.characters.length>12)throw Error('This is not a supported Shadow Puppet Studio project.');
 const p=createProject();p.id=textValue(raw.id,80)||uid();p.title=textValue(raw.title,120)||p.title;p.language=raw.language==='zh'?'zh':'en';p.height=num(raw.height,180,350,280);p.hole=num(raw.hole,1.5,4,3);
 p.story={setting:textValue(raw.story?.setting,1000),theme:textValue(raw.story?.theme,1000),script:textValue(raw.story?.script,18000),duration:num(raw.story?.duration,1,10,3)};
 p.characters=raw.characters.map(normalizeCharacter);p.selected=Math.floor(num(raw.selected,0,p.characters.length-1,0));
 p.revisions=Array.isArray(raw.revisions)?raw.revisions.slice(-12).flatMap(r=>{try{return [{id:textValue(r.id,80)||uid(),date:textValue(r.date,60),note:textValue(r.note,250),character:normalizeCharacter(r.character)}];}catch{return [];}}):[];
 return p;
}
const DESIGN_FIELDS=['name','role','brief','action','age','gender','hair','clothing','pattern','faceShape','primary','secondary','accent','skin','hairColor'];
const FACE_FIELDS=['age','faceShape','hair','skin','hairColor'];
const COSTUME_FIELDS=['clothing','pattern','primary','secondary','accent'];
export function applyDesign(c,proposal,selectedPart=null){
 const next=clone(c),patch=proposal?.design;
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('The assistant returned no valid design.');
 const locks=c.locks||{};
 if(!selectedPart)for(const key of DESIGN_FIELDS){
  if(locks.face&&FACE_FIELDS.includes(key)||locks.costume&&COSTUME_FIELDS.includes(key))continue;
  if(patch[key]!==undefined)next[key]=patch[key];
 }
 for(const id of PART_IDS){if(c.parts[id].locked||locks.body||(id==='head'&&locks.face)||(selectedPart&&id!==selectedPart))continue;const delta=patch.parts?.[id];if(delta&&typeof delta==='object')for(const key of ['width','length','angle'])if(delta[key]!==undefined)next.parts[id][key]=delta[key];}
 if(!selectedPart&&!locks.costume&&patch.garment&&typeof patch.garment==='object')for(const k of ['sleeveWidth','sleeveLength','hemLength'])if(patch.garment[k]!==undefined)next.garment[k]=patch.garment[k];
 if(!selectedPart&&!locks.props&&Array.isArray(patch.accessories))next.accessories=patch.accessories;
 const normalized=normalizeCharacter(next);normalized.id=c.id;
 for(const id of PART_IDS)if(c.parts[id].locked||locks.body||(id==='head'&&locks.face))normalized.parts[id]=clone(c.parts[id]);
 return normalized;
}
// Compare normalized, locally permitted values rather than trusting the AI's prose.
export function designChanges(before,after){
 const changes=[],add=(path,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))changes.push({path,before:a,after:b});};
 for(const k of DESIGN_FIELDS)add(k,before[k],after[k]);
 for(const k of ['sleeveWidth','sleeveLength','hemLength'])add('garment.'+k,before.garment[k],after.garment[k]);
 for(const id of PART_IDS)for(const k of ['width','length','angle'])add('parts.'+id+'.'+k,before.parts[id][k],after.parts[id][k]);
 const props=x=>x.map(({id,...rest})=>rest);
 if(JSON.stringify(props(before.accessories))!==JSON.stringify(props(after.accessories)))add('accessories',before.accessories,after.accessories);
 return changes;
}
export function applySelectedChanges(c,proposal,selectedPart,paths){
 const candidate=applyDesign(c,proposal,selectedPart),patch={};
 for(const change of designChanges(c,candidate))if(paths.includes(change.path)){
  const keys=change.path.split('.');let target=patch;
  for(const k of keys.slice(0,-1))target=target[k]??=( {} );target[keys.at(-1)]=clone(change.after);
 }
 return applyDesign(c,{design:patch},selectedPart);
}
export function anchors(c,id){
 const p=PARTS.find(p=>p.id===id),v=c.parts[id];
 if(id==='head')return [[0,0]];
 if(id==='torso')return [[0,0],[-23*v.width,24*v.length],[25*v.width,24*v.length],[-15*v.width,141*v.length],[17*v.width,141*v.length]];
 if(id.startsWith('upper')||id.startsWith('thigh'))return [[0,0],[0,p.length*v.length]];
 return [[0,0]];
}
export function localAnchor(c,id){const p=PARTS.find(p=>p.id===id);if(!p.parent)return [0,0];const parent=c.parts[p.parent];return [p.anchor[0]*parent.width,p.anchor[1]*parent.length];}
export function transforms(c,angles={}){
 const out={};for(const p of PARTS){const [x,y]=localAnchor(c,p.id),a=(angles[p.id]??c.parts[p.id].angle)*Math.PI/180;const ca=Math.cos(a),sa=Math.sin(a);if(!p.parent){out[p.id]={x:0,y:0,a};continue;}const parent=out[p.parent],cp=Math.cos(parent.a),sp=Math.sin(parent.a);out[p.id]={x:parent.x+cp*x-sp*y,y:parent.y+sp*x+cp*y,a:parent.a+a};}return out;
}
export function pose(name,t=0){if(name==='wave')return {upperArmFront:-115+Math.sin(t*3)*10,forearmFront:-45+Math.sin(t*5)*20,upperArmBack:12,forearmBack:-12,head:Math.sin(t*2)*3};if(name==='walk')return {thighFront:Math.sin(t*3)*25,thighBack:-Math.sin(t*3)*25,shinFront:Math.max(0,Math.sin(t*3))*30,shinBack:Math.max(0,-Math.sin(t*3))*30,upperArmFront:-Math.sin(t*3)*18,upperArmBack:Math.sin(t*3)*18};if(name==='read')return {upperArmFront:-55,forearmFront:-70,upperArmBack:-40,forearmBack:-80,head:12};return {};}
export function partBounds(c,id){const p=PARTS.find(p=>p.id===id),v=c.parts[id];if(id==='head')return {x:-60*v.width,y:-118*v.length,w:120*v.width,h:128*v.length};if(id==='torso')return {x:-48*v.width,y:-14*v.length,w:96*v.width,h:Math.max(180,170*c.garment.hemLength+14)*v.length};if(id.startsWith('upper'))return {x:-32*c.garment.sleeveWidth*v.width,y:-13*v.length,w:64*c.garment.sleeveWidth*v.width,h:Math.max(p.length+35,p.length*c.garment.sleeveLength+30)*v.length};return {x:-32*v.width,y:-13*v.length,w:72*v.width,h:(p.length+35)*v.length};}
export function physicalScale(c,height){return height/(115*c.parts.head.length+141*c.parts.torso.length+91*Math.max(c.parts.thighFront.length,c.parts.thighBack.length)+111*Math.max(c.parts.shinFront.length,c.parts.shinBack.length));}
export function layoutPrint(c,height=280){
 const scale=physicalScale(c,height),pages=[[]];let x=10,y=27,row=0;
 for(const part of PARTS){const bounds=partBounds(c,part.id),w=bounds.w*scale+8,h=bounds.h*scale+13;if(x+w>200){x=10;y+=row+3;row=0;}if(y+h>272){pages.push([]);x=10;y=27;row=0;}pages.at(-1).push({id:part.id,x,y,w,h,bounds,scale});x+=w+3;row=Math.max(row,h);}
 return pages;
}
