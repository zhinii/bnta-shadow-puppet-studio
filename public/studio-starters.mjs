import {createStudioProject,makePart,addConnection,normalizeStudioProject} from './studio-model.mjs?v=0.8.0';

/** Optional construction templates. These are editable geometry, not AI-generated art. */
export const STARTERS = Object.freeze([
  {id:'figure',name:'Jointed figure',nameZh:'关节人形',description:'Separate arms and legs',descriptionZh:'独立的手臂与双腿'},
  {id:'skirt',name:'Sleeves & skirt',nameZh:'宽袖与长裙',description:'A different garment structure',descriptionZh:'不同的服装结构'},
  {id:'winged',name:'Wings & tail',nameZh:'翅膀与尾巴',description:'A creature with broad wings',descriptionZh:'带宽大翅膀的生物'},
  {id:'tentacles',name:'Six tentacles',nameZh:'六条触手',description:'A coat with branching limbs',descriptionZh:'长外套与多分支肢体'}
]);

const round = value => Math.round(value*100)/100;
const ellipse = (cx,cy,rx,ry,n=20) => Array.from({length:n},(_,i)=>{
  const angle=-Math.PI/2+i*Math.PI*2/n;
  return [round(cx+Math.cos(angle)*rx),round(cy+Math.sin(angle)*ry)];
});
function capsule(a,b,r1,r2=r1){
  const angle=Math.atan2(b[1]-a[1],b[0]-a[0]),out=[];
  for(let i=0;i<=7;i++){const t=angle+Math.PI/2+i*Math.PI/7;out.push([round(a[0]+Math.cos(t)*r1),round(a[1]+Math.sin(t)*r1)]);}
  for(let i=0;i<=7;i++){const t=angle-Math.PI/2+i*Math.PI/7;out.push([round(b[0]+Math.cos(t)*r2),round(b[1]+Math.sin(t)*r2)]);}
  return out;
}
function ribbon(points,startWidth=27,endWidth=8){
  const left=[],right=[];
  for(let i=0;i<points.length;i++){
    const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];
    const dx=after[0]-before[0],dy=after[1]-before[1],length=Math.hypot(dx,dy)||1;
    const width=startWidth+(endWidth-startWidth)*i/(points.length-1);
    left.push([round(points[i][0]-dy/length*width),round(points[i][1]+dx/length*width)]);
    right.push([round(points[i][0]+dy/length*width),round(points[i][1]-dx/length*width)]);
  }
  return [...left,...right.reverse()];
}
const mirror = points => points.map(([x,y])=>[800-x,y]).reverse();

/** No identity or story is assigned; the student keeps control of the brief. */
export function createStarter(kind,{language='en'}={}){
  if(!STARTERS.some(item=>item.id===kind))throw new Error('Unknown construction template.');
  let project=createStudioProject();project.language=language==='zh'?'zh':'en';
  const zh=project.language==='zh';
  const add=(id,en,cn,polygon,fill,z=0)=>{
    project.parts.push({...makePart(zh?cn:en,polygon),id,fill,z});return id;
  };
  const join=(parentId,childId,anchor,{type='pivot',min=-100,max=100,padRadius=15}={})=>{
    project=addConnection(project,{id:'join-'+childId,parentId,childId,parentAnchor:anchor,childAnchor:anchor,type,min,max,angle:0,padRadius});
  };
  const head=(y=0)=>add('head','Head','头部',[
    [375,130+y],[421,130+y],[450,155+y],[456,197+y],[440,227+y],[421,242+y],
    [421,311+y],[379,311+y],[379,242+y],[355,221+y],[346,187+y],[351,154+y]
  ],'#d9ab70',8);

  if(kind==='figure'){
    add('torso','Body','身体',[[331,278],[469,278],[488,443],[458,532],[342,532],[312,443]],'#297b80',4);
    head();
    add('upper-arm-left','Left upper arm','左上臂',capsule([337,313],[283,464],31,26),'#368c90',2);
    add('forearm-left','Left forearm','左前臂',capsule([283,464],[247,611],25,19),'#d9ab70',3);
    add('upper-arm-right','Right upper arm','右上臂',capsule([463,313],[517,464],31,26),'#368c90',6);
    add('forearm-right','Right forearm','右前臂',capsule([517,464],[553,611],25,19),'#d9ab70',7);
    add('thigh-left','Left thigh','左大腿',capsule([362,505],[350,697],33,28),'#245d70',1);
    add('shin-left','Left lower leg','左小腿',[[326,677],[376,677],[377,870],[394,899],[392,919],[315,919],[313,895]],'#315974',2);
    add('thigh-right','Right thigh','右大腿',capsule([438,505],[450,697],33,28),'#245d70',1);
    add('shin-right','Right lower leg','右小腿',mirror([[326,677],[376,677],[377,870],[394,899],[392,919],[315,919],[313,895]]),'#315974',2);
    join('torso','head',[400,294],{min:-30,max:30});
    join('torso','upper-arm-left',[337,313]);join('upper-arm-left','forearm-left',[283,464]);
    join('torso','upper-arm-right',[463,313]);join('upper-arm-right','forearm-right',[517,464]);
    join('torso','thigh-left',[362,505],{min:-70,max:70});join('thigh-left','shin-left',[350,697],{min:-100,max:30});
    join('torso','thigh-right',[438,505],{min:-70,max:70});join('thigh-right','shin-right',[450,697],{min:-30,max:100});
    project.rods=[{id:'rod-body',partId:'torso',point:[400,420]},{id:'rod-hand',partId:'forearm-right',point:[549,590]}];
  }

  if(kind==='skirt'){
    add('torso','Bodice','上衣',[[337,278],[463,278],[479,336],[443,484],[453,527],[347,527],[357,484],[321,336]],'#a54c3d',5);
    head();
    add('upper-arm-left','Left upper sleeve','左上袖',capsule([340,315],[247,393],34,32),'#ad5341',3);
    add('upper-arm-right','Right upper sleeve','右上袖',mirror(capsule([340,315],[247,393],34,32)),'#ad5341',6);
    const sleeve=[[271,365],[273,416],[263,449],[230,492],[164,548],[91,534],[125,467],[175,408],[221,369]];
    add('sleeve-left','Left wide sleeve','左宽袖',sleeve,'#345976',4);
    add('sleeve-right','Right wide sleeve','右宽袖',mirror(sleeve),'#345976',7);
    add('skirt','Long skirt','长裙',[[349,481],[451,481],[470,584],[505,714],[561,882],[511,902],[450,890],[400,909],[350,890],[289,902],[239,882],[295,714],[330,584]],'#c49a56',1);
    add('foot-left','Left foot','左脚',[[315,852],[356,854],[363,895],[379,915],[373,933],[287,933],[282,918],[305,894]],'#374347',0);
    add('foot-right','Right foot','右脚',mirror([[315,852],[356,854],[363,895],[379,915],[373,933],[287,933],[282,918],[305,894]]),'#374347',0);
    join('torso','head',[400,294],{min:-30,max:30});
    join('torso','upper-arm-left',[340,315]);join('upper-arm-left','sleeve-left',[247,393],{min:-65,max:65});
    join('torso','upper-arm-right',[460,315]);join('upper-arm-right','sleeve-right',[553,393],{min:-65,max:65});
    join('torso','skirt',[400,505],{min:-25,max:25,padRadius:20});
    join('skirt','foot-left',[335,875],{min:-30,max:30});join('skirt','foot-right',[465,875],{min:-30,max:30});
    project.rods=[{id:'rod-body',partId:'torso',point:[400,419]},{id:'rod-sleeve',partId:'sleeve-right',point:[625,474]}];
  }

  if(kind==='winged'){
    add('torso','Body','身体',ellipse(400,395,90,165),'#516954',5);
    add('head','Head','头部',[[369,137],[410,126],[454,151],[458,181],[490,202],[450,215],[442,251],[414,272],[377,269],[348,239],[338,202],[347,164]],'#ac8353',8);
    const wing=[[369,311],[332,267],[245,222],[112,186],[176,277],[65,313],[192,358],[101,447],[260,423],[340,376],[365,347]];
    add('wing-left','Left wing','左翅膀',wing,'#6e8c76',2);
    add('wing-right','Right wing','右翅膀',mirror(wing),'#6e8c76',3);
    add('tail','Tail','尾巴',[[372,506],[428,506],[434,600],[470,690],[427,673],[446,776],[399,743],[357,780],[373,672],[331,696],[366,600]],'#a88854',0);
    add('leg-left','Left leg','左腿',[[336,483],[376,485],[372,602],[358,666],[367,691],[342,685],[325,703],[321,677],[303,676],[322,650],[332,593]],'#b69055',4);
    add('leg-right','Right leg','右腿',mirror([[336,483],[376,485],[372,602],[358,666],[367,691],[342,685],[325,703],[321,677],[303,676],[322,650],[332,593]]),'#b69055',4);
    join('torso','head',[400,251],{min:-45,max:45});
    join('torso','wing-left',[345,332],{min:-65,max:65,padRadius:20});
    join('torso','wing-right',[455,332],{min:-65,max:65,padRadius:20});
    join('torso','tail',[400,533],{min:-45,max:45,padRadius:18});
    join('torso','leg-left',[355,505],{min:-60,max:60});join('torso','leg-right',[445,505],{min:-60,max:60});
    project.rods=[{id:'rod-body',partId:'torso',point:[400,415]},{id:'rod-wing',partId:'wing-right',point:[560,334]}];
  }

  if(kind==='tentacles'){
    add('torso','Long coat','长外套',[[323,278],[477,278],[492,371],[500,465],[531,576],[481,562],[443,587],[402,563],[364,585],[323,562],[270,577],[300,465],[308,371]],'#ddd5c5',7);
    head();
    add('arm-left','Left arm','左臂',capsule([329,317],[274,486],29,22),'#bdb6a9',5);
    add('arm-right','Right arm','右臂',mirror(capsule([329,317],[274,486],29,22)),'#bdb6a9',9);
    const curves=[
      [[311,536],[283,600],[221,648],[158,702],[120,771],[127,828],[171,854],[219,831]],
      [[347,546],[337,610],[308,677],[258,745],[241,812],[260,866],[310,891],[349,871]],
      [[382,552],[389,620],[374,689],[348,753],[355,816],[386,864],[409,917],[390,949]],
      [[418,552],[423,619],[449,682],[478,746],[475,809],[446,863],[455,917],[489,934]],
      [[453,546],[471,609],[517,666],[554,735],[559,801],[537,856],[581,884],[620,864]],
      [[489,536],[523,600],[580,644],[646,695],[690,756],[699,812],[666,849],[618,837]]
    ];
    curves.forEach((curve,i)=>{
      const id='tentacle-'+(i+1);
      add(id,'Tentacle '+(i+1),'触手 '+(i+1),ribbon(curve,27,8),['#34444b','#465961','#52636b'][i%3],i%3);
      // Set the pivot below the open base cap so it is supported by the silhouette.
      const a=curve[0],b=curve[1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      join('torso',id,[round(a[0]+(b[0]-a[0])*12/length),round(a[1]+(b[1]-a[1])*12/length)],{min:-35,max:35,padRadius:18});
    });
    join('torso','head',[400,294],{min:-30,max:30});
    join('torso','arm-left',[329,317]);join('torso','arm-right',[471,317]);
    project.rods=[{id:'rod-body',partId:'torso',point:[400,420]},{id:'rod-tentacle',partId:'tentacle-6',point:[644,694]}];
  }
  return normalizeStudioProject(project);
}
