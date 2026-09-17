'use strict';
(() => {
 const BASE=window.RCMechanics;
 let RC=BASE,D=RC.defaults,L=RC.limits,sectionKind='tee',compressionAtX=null;
 const $=id=>document.getElementById(id);
 const fmt=(n,d=0)=>Number(n).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
 let mode='rect', demand=115, ap=40, maxExtra=2000, scene=null, equivalentScene=null,wideRC=null,teeView='compare', solveMessage='', analysisView='formula',pairView='split', chartBox={x0:67,x1:610,y0:47,y1:302};
 const values={rect:650,over:5*Math.PI*20**2/4,double:BASE.create({b:300,h:450,h0:385}).designDouble(300,40).AsExtra,tee:2200};
 const demands={rect:115,over:120,double:300,tee:400};
 const overrides={rect:{},over:{b:200,h:380,h0:313},double:{b:300,h:450,h0:385},tee:{}};
 const shapeNames={tee:'T 形梁',box:'箱形截面',hollow:'空心板截面',diamond:'菱形截面'};
 const config={
  rect:{title:'单筋矩形梁 · 设计配筋',task:'继续加筋，观察适筋界限之后的两条线：设计按实线取值，超筋后的增长看虚线。',label:'下部受拉钢筋面积 A<sub>s</sub>'},
  over:{title:'双排受拉钢筋 · 超筋复核',task:'这 5 根 Φ20 钢筋是否够用？先找适筋上限，再与目标弯矩 120 kN·m 比较。',label:'下部受拉钢筋总面积 A<sub>s</sub>'},
  double:{title:'单筋基础 + 新增钢筋对',task:'拖动新增面积或两排间距，看“原单筋抗力 + 新增钢筋对抗力”；再点“插入梁中”。',label:'新增钢筋对：每侧面积 ΔA'},
  tee:{title:'T 形与变宽截面',task:'依次点下方 ①②③：每次增加同样的钢筋，压区进入腹板后，为什么加深得更快？',label:'下部受拉钢筋面积 A<sub>s</sub>'}
 };
 try{scene=new window.BeamLessonScene($('scene'));}catch(e){console.error(e);$('scene-error').hidden=false;}
 const isComparison=()=>mode==='tee'&&sectionKind==='tee'&&teeView==='compare';
 function calculate(a=values[mode]){
  if(mode==='double')return RC.doubly(a,ap);
  const reference=mode==='tee'?RC.tee(a):RC.rect(a);
  const response=window.RCSectionResponse.solve(a,{...BASE.defaults,...D},compressionAtX);
  return {...reference,x:response.x,cn:response.cn,xi:response.x/D.h0,yC:response.yC,yCtotal:response.yC,
   M:response.M,Mconcrete:response.M,C:response.C,Cc:response.C,T:response.T,compressionArea:response.area,
   compressionComponents:undefined,slope:undefined,curvature:undefined,
   AsBase:a,AsActive:a,AsIgnored:0,leverArm:D.h0-response.yC,
   steelStress:response.steelStress,steelStrain:response.steelStrain,steelYielded:response.steelYielded,
   response,designReference:reference,forceBalanced:Math.abs(response.forceResidual)<Math.max(1,response.C)*1e-8,
   warnings:reference.over?['超过教材设计界限；当前压区与抗力为应变协调模型趋势，不能作为适筋设计增益。']:reference.warnings};
 }
 function design(){return mode==='double'?RC.designDouble(demand,ap):mode==='tee'?RC.designT(demand):RC.designRect(demand);}
 function range(){return isComparison()?{min:Math.max(L.Amin,wideRC.limits.Amin),max:L.tee.transitionAs}:mode==='double'?{min:0,max:maxExtra}:{min:L.Amin,max:Math.ceil((mode==='tee'?L.tee.As:L.rect.As)*1.3/100)*100};}
 function presets(){
  const data=isComparison()?[['压区较浅',L.tee.transitionAs*.45],['刚到翼缘底',L.tee.transitionAs]]:(mode==='rect'||mode==='over')?[mode==='over'?['教材 5Φ20',5*Math.PI*20**2/4]:['压区较浅',L.rect.As*.45],['到适筋界限',L.rect.As],['继续加筋',L.rect.As*1.2]]:
   mode==='tee'?(sectionKind==='tee'?[['翼缘内',L.tee.transitionAs*.65],['刚到翼缘底',L.tee.transitionAs],['进入腹板',(L.tee.transitionAs+L.tee.As)/2],['继续加筋（超筋）',L.tee.As*1.2]]:[['较少配筋',L.tee.As*.3],['增加配筋',L.tee.As*.72],['到设计界限',L.tee.As],['继续加筋（超筋）',L.tee.As*1.2]]):
   [['只看基础部分',0],['增加钢筋对',1000]];
  $('presets').replaceChildren(...data.map(([name,value])=>{const btn=document.createElement('button');btn.textContent=name;btn.type='button';btn.dataset.value=value;btn.setAttribute('aria-pressed','false');btn.addEventListener('click',()=>{values[mode]=value;solveMessage='';update();});return btn;}));
 }
 function setupModel(){
  RC=BASE.create(overrides[mode]);
  compressionAtX=null;
  if(mode==='tee'&&sectionKind!=='tee'){
   const g=window.VariableRC.create(sectionKind,{});
   RC={...RC,defaults:g.defaults,tee:g.section,designT:g.design,limits:{...RC.limits,Amin:g.limits.Amin,xb:g.limits.xb,tee:{As:g.limits.As,M:g.limits.M,transitionAs:g.limits.transitionAs,transitionM:g.limits.transitionM}}};
   compressionAtX=g.compression;
  }
  D=RC.defaults;L=RC.limits;
  if(!compressionAtX)compressionAtX=x=>{
   const extra=mode==='tee'?D.bf-D.b:0,t=mode==='tee'?Math.min(x,D.hf):0;
   const area=D.b*x+extra*t,q=(D.b*x*x+extra*t*t)/2;
   return {area,C:D.fc*area,yC:area?q/area:0,M:D.fc*(D.h0*area-q)*1e-6};
  };
  wideRC=BASE.create({...D,b:D.bf});
 }
 function setMode(next){
  demands[mode]=demand;mode=next;demand=demands[mode];$('demand').value=demand;solveMessage='';setupModel();
  for(const btn of document.querySelectorAll('[data-mode]')) {const active=btn.dataset.mode===mode;btn.setAttribute('aria-selected',String(active));btn.tabIndex=active?0:-1;}
  $('workspace').setAttribute('aria-labelledby','tab-'+mode);
  $('task-text').textContent=config[mode].task;$('scene-title').textContent=mode==='tee'?shapeNames[sectionKind]:config[mode].title;
  $('steel-label').innerHTML=config[mode].label;$('pair-height').hidden=mode!=='double';$('shape-control').hidden=mode!=='tee';
  $('workspace').classList.toggle('is-double',mode==='double');
  $('pair-toolbar').hidden=mode!=='double';$('analysis-tabs').hidden=mode!=='double';
  $('tee-insight').hidden=mode!=='tee'||sectionKind!=='tee'||isComparison();
  $('tee-views').hidden=mode!=='tee'||sectionKind!=='tee';
  $('workspace').classList.toggle('is-compare',isComparison());
  $('equivalent-panel').hidden=!isComparison();$('equivalent-summary').hidden=!isComparison();
  for(const b of document.querySelectorAll('[data-tee-view]'))b.setAttribute('aria-pressed',String(b.dataset.teeView===teeView));
  if(isComparison())$('task-text').textContent='拖动配筋，看两梁青色压区始终相同；再看矩形多出的下部混凝土。抗弯相同，自重呢？';
  if(mode==='tee'&&sectionKind!=='tee')$('task-text').textContent='拖动滑块，观察净宽 b(y) 怎样改变受压面积、压力重心与抗弯能力。';
  setAnalysisView(analysisView);
  for(const button of document.querySelectorAll('[data-shape]'))button.setAttribute('aria-pressed',String(button.dataset.shape===sectionKind));
  $('example-context').textContent=mode==='rect'?'教材例 3-1：b × h = 250 × 500 mm，h₀ = 460 mm，C30 / HRB400，M需 = 115 kN·m。':mode==='over'?'教材例 3-4：200 × 380 mm；上排 2Φ20、下排 3Φ20，重心距底 67 mm，h₀ = 313 mm。':mode==='double'?'教材例 3-5 的设计阶段：300 × 450 mm，h₀ = 385 mm；沿用教材舍入后的 M需 = 300 kN·m。':'教材第 3.6 节原理与几何拓展：T 形的有效翼缘宽 650 mm、厚 100 mm，腹板宽 250 mm；形状切换时保持材料与 h₀ 不变。';
  $('scene-legend').innerHTML='<span><i class="swatch"></i>受压混凝土</span><span><i class="swatch base"></i>'+(mode==='double'?'基础受拉钢筋':'受拉钢筋')+'</span>'+(mode==='double'?'<span><i class="swatch pair"></i>新增上压、下拉钢筋对</span>':'<span>C：压力合力位置</span>');
  $('curve-guide').hidden=mode==='double';
  $('design-line-label').textContent=mode==='double'?'双筋设计抗力':'设计采用（实线）';
  const rg=range();values[mode]=Math.max(rg.min,Math.min(rg.max,values[mode]));presets();update();parameters();
 }
 function setTeeView(view,advance=false){
  if(!['compare','curve'].includes(view))return;
  teeView=view;
  if(advance){sectionKind='tee';values.tee=BASE.limits.tee.transitionAs+300;}
  setMode('tee');
 }
 function setAnalysisView(view){
  analysisView=view;
  const showFormula=mode==='double'&&view==='formula';
  $('pair-derivation').hidden=!showFormula;$('curve-panel').hidden=showFormula||isComparison();
  $('analysis-title').textContent=isComparison()?'等宽矩形梁 · 宽度 b′f':showFormula?'两部分分别承担多少弯矩？':'抗弯能力曲线';
  for(const b of document.querySelectorAll('[data-analysis]'))b.setAttribute('aria-pressed',String(b.dataset.analysis===view));
  if(!showFormula&&!isComparison())chart(calculate());
 }
 function equivalentComparison(s){
  if(!isComparison())return null;
  const rectangular=wideRC.rect(values.tee),teeArea=D.bf*D.hf+D.b*(D.h-D.hf),rectArea=D.bf*D.h,weightRatio=teeArea/rectArea;
  if(!equivalentScene){
   try{
    equivalentScene=new window.BeamEquivalentScene($('equivalent-scene'));
    let syncing=false;
    if(scene)scene.onViewChange=o=>{if(syncing||!isComparison())return;syncing=true;equivalentScene.setOrientation(o);syncing=false;};
    equivalentScene.onViewChange=o=>{if(syncing||!isComparison())return;syncing=true;scene?.setOrientation(o);syncing=false;};
    if(window.lesson)window.lesson.equivalentScene=equivalentScene;
   }catch(e){console.error(e);$('equivalent-error').hidden=false;}
  }
  if(equivalentScene){
   const barLayout=scene?.steelLayout?.map(bar=>({x:bar.x,y:bar.y,d:bar.diameter}));
   equivalentScene.updateEquivalent({...rectangular,mode:'rect',b:D.bf,h:D.h,h0:D.h0,bf:D.bf,hf:D.hf,originalWebWidth:D.b,flangeHeight:D.hf,AsBase:rectangular.AsActive,barLayout,showForces:$('forces').checked});
   if(scene)equivalentScene.setOrientation(scene.orientation);
   equivalentScene.resize();
  }
  $('tee-x-caption').innerHTML='等效压区 x = <b>'+fmt(s.x,1)+' mm</b> · '+(Math.abs(s.x-D.hf)<1e-7?'刚到翼缘底':'位于翼缘内');
  $('rect-x-caption').innerHTML='等效压区 x = <b>'+fmt(rectangular.x,1)+' mm</b> · 面积与力臂相同';
  $('equivalent-moment').innerHTML='M<sub>T形</sub> = M<sub>矩形</sub> = <b>'+fmt(s.M,1)+'</b> <small>kN·m</small>';
  $('tee-weight-bar').style.width=(weightRatio*100)+'%';$('tee-weight-percent').textContent='约 '+fmt(weightRatio*100)+'%';
  return {rectangular,teeArea,rectArea,weightRatio};
 }
 function setPairView(view,animate=true){
  pairView=view;
  for(const b of document.querySelectorAll('[data-pair-view]'))b.setAttribute('aria-pressed',String(b.dataset.pairView===view));
  $('pair-view-status').textContent=view==='assembled'?'钢筋对插入梁中':'钢筋对单独展示';
  scene?.setPairView(view,animate);
  if(window.lessonState)window.lessonState.pairView=view;
 }
 function pairDerivation(s){
  const z=s.steelLeverArm,base=s.Mconcrete,added=s.Msteel;
  const result=(id,value,color)=>'<output id="'+id+'" class="component-value '+color+'" data-moment="'+value+'">'+fmt(value,1)+' <small>kN·m</small></output>';
  $('pair-derivation').innerHTML=
   '<div class="derive-step base-step"><div class="component-heading"><div class="derive-label"><span class="step">1</span>原单筋部分 · 取适筋界限</div>'+result('base-moment',base,'base')+'</div><div class="math"><span class="base">M<sub>b</sub> = f<sub>cd</sub>A<sub>c,b</sub>z<sub>b</sub></span></div><small>混凝土 + 原受拉钢筋，沿用同一套公式；x = x<sub>b</sub>。</small></div>'+
   '<div class="derive-step pair-step"><div class="component-heading"><div class="derive-label"><span class="step">2</span>新增钢筋对 · 上压、下拉</div>'+result('pair-moment',added,'pair')+'</div><div class="math"><span class="pair">ΔM = f<sub>sd</sub>ΔA · z<sub>s</sub></span></div><small class="pair-geometry">上、下各增 <b>ΔA = '+fmt(s.AsExtra)+' mm²</b>；两排间距 <b>z<sub>s</sub> = '+fmt(z)+' mm</b>。</small><small>两侧钢筋力相等：C′<sub>s</sub> = ΔT = f<sub>sd</sub>ΔA。</small></div>'+
   '<div class="derive-step"><div class="derive-label"><span class="step">3</span>两部分相加，就是总抗弯能力</div><div class="math">M = <span class="base">M<sub>b</sub></span> + <span class="pair">ΔM</span></div><div class="component-sum"><span class="base">'+fmt(base,1)+'</span><span>+</span><span class="pair">'+fmt(added,1)+'</span><span>=</span><output id="total-moment" data-moment="'+s.M+'">'+fmt(s.M,1)+'</output><small>kN·m</small></div></div>'+
   '<p class="derive-foot">新增上、下钢筋面积相等；下部总面积还包含原来的受拉钢筋。</p>';
 }
 function formula(s){
  const item=(title,body)=>'<div class="formula-item"><small>'+title+'</small><div class="math">'+body+'</div></div>';
  $('mechanism-title').textContent='始终是同一套公式：力平衡 + 力 × 力臂';
  $('mechanism-lead').textContent='后两式计算同一个抗弯弯矩 M。';
  $('formulas').innerHTML=item('① 压力等于拉力','<span class="comp">f<sub>cd</sub>A<sub>c</sub></span> = <span class="base">f<sub>sd</sub>A<sub>s</sub></span>')+
   item('② 从混凝土压力计算弯矩','M = <span class="comp">f<sub>cd</sub>A<sub>c</sub></span> · z')+
   item('③ 从钢筋拉力计算弯矩','M = <span class="base">f<sub>sd</sub>A<sub>s</sub></span> · z');
  const centroid='y<sub>s</sub> 为受拉钢筋重心，y<sub>c</sub> 为受压混凝土面积重心；都从顶面量起，<b>z = y<sub>s</sub> − y<sub>c</sub></b>。';
  let geometry='',scope='';
  if(mode==='double'){
   geometry='<b>原单筋部分：</b>A<sub>c</sub> = bx<sub>b</sub>，y<sub>c</sub> = x<sub>b</sub>/2，y<sub>s</sub> = h<sub>0</sub>。<b>新增钢筋对：</b>z<sub>s</sub> = h<sub>0</sub> − a′<sub>s</sub>。';
   scope='上面三式用于原单筋部分，A<sub>s</sub> 指基础受拉钢筋面积 A<sub>s,1</sub>。新增上、下各 ΔA，同等设计应力时另加 <b>ΔM = f<sub>sd</sub>ΔA · z<sub>s</sub></b>；下部总面积 A<sub>s,总</sub> = A<sub>s,1</sub> + ΔA。';
  }else if(isComparison()){
   geometry='<b>两梁几何量相同：</b>A<sub>c</sub> = b′<sub>f</sub>x，y<sub>c</sub> = x/2，y<sub>s</sub> = h<sub>0</sub>，所以力臂 z 相同。';
   scope='相同材料、A<sub>s</sub>、h<sub>0</sub>，且压区在翼缘内时，直接代入同一套公式。矩形下部多出的混凝土只增加本页比较的自重。';
  }else if(mode==='tee'){
   geometry=sectionKind!=='tee'?'<b>变宽截面：</b>A<sub>c</sub> 按受压轮廓的净面积求，y<sub>c</sub> 按这部分面积求重心；y<sub>s</sub> = h<sub>0</sub>。':s.regime==='flange'?'<b>压区在翼缘内：</b>A<sub>c</sub> = b′<sub>f</sub>x，y<sub>c</sub> = x/2；y<sub>s</sub> = h<sub>0</sub>。':'<b>压区进入腹板：</b>A<sub>c</sub> = bx + (b′<sub>f</sub> − b)h′<sub>f</sub>；y<sub>c</sub> 按受压面积求重心，y<sub>s</sub> = h<sub>0</sub>。';
   scope='形状改变，只改变受压面积 A<sub>c</sub> 和它的重心位置；详细面积与重心算法可展开查看。';
  }else{
   geometry='<b>矩形压区：</b>A<sub>c</sub> = bx，y<sub>c</sub> = x/2。<b>钢筋重心：</b>'+(mode==='over'?'y<sub>s</sub> = Σ(A<sub>s,i</sub>y<sub>i</sub>)/ΣA<sub>s,i</sub> = h<sub>0</sub>。':'y<sub>s</sub> = h<sub>0</sub>。');
   scope=mode==='over'?'两排受拉钢筋按面积加权求共同重心，再确定力臂 z。':'多排受拉钢筋先按面积加权求重心，再用同一个力臂 z。';
  }
  if(s.over)scope='<b>此处对应设计实线：</b>按适筋界限 x = x<sub>b</sub> 取 A<sub>c</sub>、A<sub>s</sub> 和 z；A<sub>s</sub> 是该界限配筋面积。超筋虚线采用实际钢筋应力计算，详见展开说明。';
  $('geometry-note').innerHTML=centroid+'<br>'+geometry;
  $('formula-note').innerHTML=scope;
 }
 function chart(s){
  if(isComparison())return;
  const narrow=window.innerWidth<=720, width=narrow?Math.max(300,$('curve').clientWidth):640;
  const rg=range(), x0=narrow?47:67,x1=narrow?width-17:610,y0=47,y1=narrow?260:302;
  chartBox={x0,x1,y0,y1};$('curve').setAttribute('viewBox','0 0 '+width+' '+(narrow?320:369));
  const X=a=>x0+(a-rg.min)/(rg.max-rg.min)*(x1-x0);
  const maxM=Math.max(calculate(rg.max).M,demand)*1.14;
  const step=maxM>650?200:100, ceiling=Math.ceil(maxM/step)*step;
  const Y=m=>y1-m/ceiling*(y1-y0);
  const paths=[];
  const escape=t=>String(t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const text=(x,y,t,fill='#627383',anchor='start',size=12,extra='')=>'<text x="'+x+'" y="'+y+'" fill="'+fill+'" text-anchor="'+anchor+'" font-size="'+size+'" '+extra+'>'+escape(t)+'</text>';
  const line=(xa,ya,xb,yb,color='#d8e0e7',dash='')=>'<path d="M'+xa+' '+ya+'L'+xb+' '+yb+'" fill="none" stroke="'+color+'" '+(dash?'stroke-dasharray="'+dash+'"':'')+'/>';
  let html='<title id="curve-title">'+escape(config[mode].title)+'的配筋与设计抗力</title><desc id="curve-desc">目标弯矩'+fmt(demand)+'千牛米。当前配筋面积'+fmt(values[mode])+'平方毫米，设计取值'+fmt(s.designReference?.M??s.M,1)+'千牛米，模型抗弯能力'+fmt(s.M,1)+'千牛米。</desc>';
  const boundary=mode==='tee'?L.tee.As:L.rect.As;
  if(mode!=='double'){
   html+='<rect x="'+X(boundary)+'" y="'+y0+'" width="'+(x1-X(boundary))+'" height="'+(y1-y0)+'" fill="#f1f2f4"/>';
   const start=mode==='tee'?L.tee.transitionAs:rg.min;
   if(mode==='tee'&&sectionKind==='tee'){
    html+='<rect x="'+x0+'" y="'+y0+'" width="'+(X(L.tee.transitionAs)-x0)+'" height="'+(y1-y0)+'" fill="#f0f7f7"/>';
    html+=text((x0+X(L.tee.transitionAs))/2,27,'压区在翼缘内','#087f8c','middle',12);
    html+=text((X(L.tee.transitionAs)+X(boundary))/2,27,'压区进入腹板','#185abd','middle',12);
   }else html+=text((x0+X(boundary))/2,27,mode==='tee'?'按净宽 b(y) 累加受压混凝土':'适筋范围 · 抗力增长','#185abd','middle',12);
   html+=text((X(boundary)+x1)/2,27,'超筋趋势','#956449','middle',12);
  }else html+=text((x0+x1)/2,27,'基础抗力保持不变，钢筋对承担新增弯矩','#7755aa','middle',13);
  for(let m=0;m<=ceiling;m+=step){html+=line(x0,Y(m),x1,Y(m));html+=text(x0-10,Y(m)+4,String(m),'#758391','end',11);}
  html+=line(x0,y0,x0,y1,'#8a98a5')+line(x0,y1,x1,y1,'#8a98a5');
  html+=text(12,20,'M / kN·m','#384755','start',11);
  const ticks=[rg.min,...[.25,.5,.75].map(t=>Math.round((rg.min+t*(rg.max-rg.min))/100)*100),rg.max];
  for(const a of ticks){html+=line(X(a),y1,X(a),y1+4,'#8998a5')+text(X(a),y1+19,fmt(a),'#758391','middle',11);}
  html+=text((x0+x1)/2,y1+49,mode==='double'?'新增钢筋对：每侧面积 ΔA / mm²':'下部受拉钢筋面积 As / mm²','#384755','middle',12);
  const end=mode==='double'?rg.max:boundary;
  for(let i=0;i<=130;i++){const a=rg.min+(end-rg.min)*i/130,m=calculate(a).M;paths.push((i?'L':'M')+X(a).toFixed(2)+' '+Y(m).toFixed(2));}
  if(mode==='tee'&&sectionKind==='tee'){
   for(const [a0,a1,color] of [[rg.min,L.tee.transitionAs,'#087f8c'],[L.tee.transitionAs,boundary,'#185abd']]){
    const d=[];for(let i=0;i<=70;i++){const a=a0+(a1-a0)*i/70;d.push((i?'L':'M')+X(a).toFixed(2)+' '+Y(calculate(a).M).toFixed(2));}
    html+='<path d="'+d.join('')+'" fill="none" stroke="'+color+'" stroke-width="3"/>';
   }
  }else html+='<path d="'+paths.join('')+'" fill="none" stroke="'+(mode==='double'?'#7755aa':'#185abd')+'" stroke-width="3"/>';
  if(mode!=='double'){
   const continuation=[];
   for(let i=0;i<=55;i++){const a=boundary+(rg.max-boundary)*i/55;continuation.push((i?'L':'M')+X(a).toFixed(2)+' '+Y(calculate(a).M).toFixed(2));}
   html+='<path class="over-response" d="'+continuation.join('')+'" fill="none" stroke="#956449" stroke-width="3" stroke-dasharray="7 4"/>';
   const designM=mode==='tee'?L.tee.M:L.rect.M;
   html+='<path class="design-plateau" d="M'+X(boundary)+' '+Y(designM)+'L'+x1+' '+Y(designM)+'" fill="none" stroke="#185abd" stroke-width="3"/>';
   html+='<circle class="design-boundary" cx="'+X(boundary)+'" cy="'+Y(designM)+'" r="4" fill="white" stroke="#185abd" stroke-width="2"/>';
   html+=line(X(boundary),y0,X(boundary),y1,'#a2aeb8','3 5');
   html+=text(X(boundary)-7,Y(calculate(boundary).M)-12,mode==='tee'&&sectionKind!=='tee'?'教学界限':'适筋界限','#667684','end',11);
   html+=text(x1-4,Y(designM)+20,'设计取值','#185abd','end',11);
  }
  if(mode==='tee'&&sectionKind==='tee'){
   const xx=X(L.tee.transitionAs),yy=Y(L.tee.transitionM);
   html+=line(xx,y0,xx,y1,'#71a7ac','3 5')+'<circle cx="'+xx+'" cy="'+yy+'" r="4" fill="white" stroke="#087f8c" stroke-width="2"/>';
   html+=text(xx-10,yy+25,'x = h′f','#087f8c','end',12);
   html+=text(xx-10,yy+42,'压区刚到翼缘底','#087f8c','end',11);
  }
  html+=line(x0,Y(demand),x1,Y(demand),'#a34434','7 5');
  html+=text(x1-4,Y(demand)-7,'目标 '+fmt(demand),'#a34434','end',12,'paint-order="stroke" stroke="white" stroke-width="4" stroke-linejoin="round"');
  const aim=design(),aimA=mode==='double'?aim.AsExtra:aim.AsNeeded;
  if(aim.ok&&aimA>=rg.min&&aimA<=rg.max){html+='<circle cx="'+X(aimA)+'" cy="'+Y(aim.M)+'" r="5" fill="white" stroke="#087f8c" stroke-width="1.7"/>';}
  const xx=X(values[mode]),yy=Y(s.M);
  html+=line(xx,y1,xx,yy,'#9baab7','3 4');
  html+='<circle cx="'+xx+'" cy="'+yy+'" r="6" fill="'+(s.over?'#956449':mode==='double'?'#7755aa':'#185abd')+'" stroke="white" stroke-width="2"/>';
  if(s.over){const yd=Y(s.designReference.M);html+='<rect class="design-current" x="'+(xx-3.5)+'" y="'+(yd-3.5)+'" width="7" height="7" fill="#185abd"/>';}
  const atRight=xx>x1-90;
  html+=text(xx+(atRight?-11:11),yy+(s.over?-12:19),s.over?'超筋趋势':'当前','#243544',atRight?'end':'start',12,'paint-order="stroke" stroke="white" stroke-width="4" stroke-linejoin="round"');
  $('curve').innerHTML=html;
 }
 function depthChart(s){
  if(mode!=='tee'||sectionKind!=='tee'||isComparison())return;
  const svg=$('depth-curve'),narrow=window.innerWidth<=720,W=narrow?Math.max(300,svg.clientWidth):640;
  svg.setAttribute('viewBox','0 0 '+W+' 218');
  const A=L.tee.transitionAs,delta=300,span=450,x0=48,x1=W-22,y0=32,y1=157;
  const aMin=A-span,aMax=A+span,xMin=RC.tee(aMin).x-5,xMax=RC.tee(aMax).x+5;
  const X=a=>x0+(a-aMin)/(aMax-aMin)*(x1-x0),Y=x=>y1-(x-xMin)/(xMax-xMin)*(y1-y0);
  const d1=RC.tee(A).x-RC.tee(A-delta).x,d2=RC.tee(A+delta).x-RC.tee(A).x;
  $('depth-before').textContent=fmt(d1)+' mm';$('depth-after').textContent=fmt(d2)+' mm';
  for(const b of document.querySelectorAll('[data-depth]'))b.setAttribute('aria-pressed',String(Math.abs(values.tee-(A+Number(b.dataset.depth)*delta))<.1));
  const text=(x,y,t,color='#627383',anchor='start',size=12)=>'<text x="'+x+'" y="'+y+'" fill="'+color+'" text-anchor="'+anchor+'" font-size="'+size+'">'+t+'</text>';
  const line=(xa,ya,xb,yb,color='#d3dce4',dash='')=>'<path d="M'+xa+' '+ya+'L'+xb+' '+yb+'" stroke="'+color+'" fill="none" stroke-dasharray="'+dash+'"/>';
  let html='<title id="depth-title">压区高度随配筋增长的局部放大图</title><desc id="depth-desc">以压区刚到翼缘底为中点，同样增加300平方毫米钢筋：翼缘内压区加深'+fmt(d1,2)+'毫米，进入腹板后加深'+fmt(d2,2)+'毫米。</desc>';
  html+='<rect x="'+x0+'" y="'+y0+'" width="'+(X(A)-x0)+'" height="'+(y1-y0)+'" fill="#f0f7f7"/><rect x="'+X(A)+'" y="'+y0+'" width="'+(x1-X(A))+'" height="'+(y1-y0)+'" fill="#f1f5fb"/>';
  html+=text(10,18,'x / mm','#384755','start',11)+text((x0+X(A))/2,19,'翼缘内','#087f8c','middle',12)+text((X(A)+x1)/2,19,'进入腹板','#185abd','middle',12);
  html+=line(x0,Y(D.hf),x1,Y(D.hf),'#99adb7','4 4')+text(x0-7,Y(D.hf)+4,String(D.hf),'#627383','end',11);
  html+=line(X(A),y0,X(A),y1,'#99adb7','3 4')+line(x0,y0,x0,y1,'#8a98a5')+line(x0,y1,x1,y1,'#8a98a5');
  html+='<path d="M'+X(aMin)+' '+Y(RC.tee(aMin).x)+'L'+X(A)+' '+Y(D.hf)+'" stroke="#087f8c" stroke-width="3" fill="none"/>';
  html+='<path d="M'+X(A)+' '+Y(D.hf)+'L'+X(aMax)+' '+Y(RC.tee(aMax).x)+'" stroke="#185abd" stroke-width="3" fill="none"/>';
  for(const [i,a] of [-1,0,1].map(i=>[i,A+i*delta])){
   const x=X(a),y=Y(RC.tee(a).x);
   html+=line(x,y,x,y1,'#acb9c3','2 4')+'<circle cx="'+x+'" cy="'+y+'" r="4" fill="white" stroke="'+(i<0?'#087f8c':'#185abd')+'" stroke-width="2"/>';
   html+=text(x,y1+17,fmt(a),'#627383','middle',11);
  }
  for(const [a,b,color] of [[A-delta,A,'#087f8c'],[A,A+delta,'#185abd']]){
   html+=line(X(a)+3,187,X(b)-3,187,color)+line(X(a)+3,183,X(a)+3,191,color)+line(X(b)-3,183,X(b)-3,191,color);
   html+=text((X(a)+X(b))/2,204,'+300 mm²',color,'middle',11);
  }
  html+=text(x1,216,'As / mm²','#384755','end',10);
  html+=text(X(A)+8,Y(D.hf)+22,'x = h′f','#627383','start',11);
  if(values.tee>=aMin&&values.tee<=aMax){html+='<circle cx="'+X(values.tee)+'" cy="'+Y(s.x)+'" r="6" fill="#243544" stroke="white" stroke-width="2"/>';}
  svg.innerHTML=html;
 }
 function update(){
  const s=calculate(),rg=range();
  $('steel').min=rg.min;$('steel').max=rg.max;$('steel').value=values[mode];
  $('steel-output').innerHTML=fmt(values[mode])+' <small>mm²</small>';
  $('ap-output').innerHTML=fmt(ap)+' <small>mm</small>';
  const designM=s.designReference?.M??s.M;
  $('x-value').textContent=fmt(s.x,1);$('capacity-value').textContent=fmt(designM,1);
  $('capacity-label').textContent=mode==='tee'&&sectionKind!=='tee'?'教学取值 M':'设计抗弯 M';$('x-label').textContent=s.over?'模型压区 x':'受压区 x';
  $('stage-title').textContent=mode==='double'?'基础压区保持 x = xᵦ，新增钢筋对提供力偶':s.over?'超筋：设计按实线取适筋上限':mode==='tee'?(sectionKind!=='tee'?'宽度随高度变化，自动累加压区与力矩':s.x<D.hf-1e-6?'第一类 T 形：压区在翼缘内':Math.abs(s.x-D.hf)<1e-6?'两类分界：压区刚到翼缘底':'第二类 T 形：压区已进入腹板'):(s.atLimit?'到达适筋设计界限':'增加受拉钢筋，受压区逐渐加深');
  const gap=demand-designM;
  $('status').className='status'+(s.over?' over':gap<=.1?' met':'');
  $('status').textContent=solveMessage||(s.over?'虚线模型抗弯能力 '+fmt(s.M,1)+' kN·m，仍随配筋增长；设计与复核按实线取值。':gap>.1?'距离目标还差 '+fmt(gap,1)+' kN·m。'+((mode==='rect'||mode==='over')&&demand>L.rect.M?' 目标已超过本单筋截面的设计上限。':' 继续调整滑块，或按目标求配筋。'):'在本页正截面模型中已达到目标弯矩。');
  for(const b of $('presets').children)b.setAttribute('aria-pressed',String(Math.abs(Number(b.dataset.value)-values[mode])<.1));
  const barDiameter=20*Math.sqrt(values[mode]/(5*Math.PI*100));
  if(scene)scene.updateSection({...s,mode:mode==='over'?'rect':mode,sectionKind,pairView,referenceX:mode==='double'||isComparison()?null:L.xb,b:D.b,h:D.h,h0:D.h0,bf:D.bf,hf:D.hf,ap,AsBase:mode==='double'?s.AsBase:s.AsActive,barLayout:mode==='over'?[{x:-55,y:280,d:barDiameter},{x:55,y:280,d:barDiameter},{x:-55,y:335,d:barDiameter},{x:0,y:335,d:barDiameter},{x:55,y:335,d:barDiameter}]:null,showForces:$('forces').checked});
  chart(s);formula(s);if(mode==='double')pairDerivation(s);depthChart(s);
  const comparison=equivalentComparison(s);
  window.lessonState={mode,sectionKind,demand,ap,value:values[mode],range:rg,result:s,defaults:D,limits:L,pairView,analysisView,teeView,comparison};
  window.lessonReady=true;
 }
 function solve(){
  if(isComparison())setTeeView('curve');
  const result=design();
  if(!result.ok){
   solveMessage=mode==='double'?'此需求超出本演示的适用范围，请调整设计参数。':mode==='tee'&&sectionKind!=='tee'?'目标超出本页几何教学模型的截断值 '+fmt(L.tee.M,1)+' kN·m，停止外推。':'目标 '+fmt(demand)+' kN·m 超过本截面适筋上限 '+fmt(mode==='tee'?L.tee.M:L.rect.M,1)+' kN·m，当前单筋截面无适筋解。';
   update();$('status').classList.add('over');return;
  }
  const target=mode==='double'?result.AsExtra:result.AsNeeded;
  if(mode==='double'&&target>maxExtra)maxExtra=Math.ceil(target*1.2/100)*100;
  values[mode]=target;
  solveMessage=mode==='double'?(target<1e-7?'目标不超过基础部分的抗力，此处无需新增钢筋对；可返回单筋页优化配筋。':'新增上、下钢筋各 '+fmt(target)+' mm²，可达到目标；下部还保留基础受拉钢筋。'):'按本页模型，所需受拉钢筋约 '+fmt(target)+' mm²。';
  update();
 }
 $('steel').addEventListener('input',e=>{values[mode]=Number(e.target.value);solveMessage='';update();});
 $('ap').addEventListener('input',e=>{ap=Number(e.target.value);solveMessage='';update();});
 $('demand').addEventListener('input',e=>{const n=Number(e.target.value);if(!Number.isFinite(n)||n<50||n>800)return;demand=n;solveMessage='';update();});
 $('demand').addEventListener('change',e=>{const n=Number(e.target.value);demand=Number.isFinite(n)?Math.max(50,Math.min(800,n)):400;e.target.value=demand;solveMessage='';update();});
 $('solve').addEventListener('click',solve);
 for(const b of document.querySelectorAll('[data-mode]')){
  b.addEventListener('click',()=>setMode(b.dataset.mode));
  b.addEventListener('keydown',e=>{const modes=['rect','over','double','tee'],i=modes.indexOf(mode);if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?3:(i+(e.key==='ArrowLeft'?3:1))%4;setMode(modes[next]);$('tab-'+modes[next]).focus();});
 }
 $('forces').addEventListener('change',update);$('view-front').addEventListener('click',()=>scene?.frontView());$('view-reset').addEventListener('click',()=>scene?.resetView());
 $('bw').addEventListener('change',e=>document.body.classList.toggle('bw',e.target.checked));
 for(const b of document.querySelectorAll('[data-pair-view]'))b.addEventListener('click',e=>setPairView(b.dataset.pairView,e.detail!==0));
 for(const b of document.querySelectorAll('[data-analysis]'))b.addEventListener('click',()=>{setAnalysisView(b.dataset.analysis);if(window.lessonState)window.lessonState.analysisView=analysisView;});
 for(const b of document.querySelectorAll('[data-depth]'))b.addEventListener('click',()=>{values.tee=L.tee.transitionAs+Number(b.dataset.depth)*300;solveMessage='';update();});
 for(const b of document.querySelectorAll('[data-tee-view]'))b.addEventListener('click',()=>setTeeView(b.dataset.teeView));
 $('compare-next').addEventListener('click',()=>setTeeView('curve',true));
 $('curve').addEventListener('click',e=>{
  const p=$('curve').createSVGPoint();p.x=e.clientX;p.y=e.clientY;
  const q=p.matrixTransform($('curve').getScreenCTM().inverse()),rg=range();
  if(q.x<chartBox.x0||q.x>chartBox.x1||q.y<chartBox.y0||q.y>chartBox.y1)return;
  values[mode]=rg.min+(q.x-chartBox.x0)/(chartBox.x1-chartBox.x0)*(rg.max-rg.min);solveMessage='';update();
 });
 function parameters(){ $('parameters').innerHTML='当前例题：b = '+D.b+' mm，h = '+D.h+' mm，h<sub>0</sub> = '+D.h0+' mm；f<sub>cd</sub> = '+D.fc+' MPa，f<sub>sd</sub> = f′<sub>sd</sub> = '+D.fy+' MPa，ξ<sub>b</sub> = '+D.xiB+'。变宽截面外宽 650 mm、高 500 mm，T 形翼厚 100 mm；箱形顶底板厚 100 mm、侧壁厚 75 mm；空心板设三个直径 140 mm 的圆孔；菱形中部最宽。前三例沿用教材例3-1、3-4、3-5的设计或复核参数，第四例是基于第3.6节的独立几何演示。非T异形截面的配筋下限仅为统一展示起点，未代表其规范最小配筋验算。'; }
 for(const b of document.querySelectorAll('[data-shape]'))b.addEventListener('click',()=>{sectionKind=b.dataset.shape;for(const q of document.querySelectorAll('[data-shape]'))q.setAttribute('aria-pressed',String(q===b));setMode('tee');});
 const params=new URLSearchParams(location.search);
 if(params.has('export'))document.body.classList.add('export');
 if(params.get('bw')==='1'){$('bw').checked=true;document.body.classList.add('bw');}
 const initial=['rect','over','double','tee'].includes(params.get('mode'))?params.get('mode'):'rect';
 if(Object.keys(shapeNames).includes(params.get('shape')))sectionKind=params.get('shape');
 if(params.has('value')&&Number.isFinite(Number(params.get('value'))))values[initial]=Number(params.get('value'));
 if(params.get('analysis')==='curve')analysisView='curve';
 if(params.get('view')==='curve')teeView='curve';
 setMode(initial);
 if(params.get('pair')==='assembled')setPairView('assembled',false);
 let resizeFrame=0;window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{const s=calculate();chart(s);depthChart(s);});});
 if(params.get('solve')==='1')solve();
 window.lesson={setMode,setPairView,setAnalysisView,setTeeView,solve,update,calculate,scene,equivalentScene};
})();
