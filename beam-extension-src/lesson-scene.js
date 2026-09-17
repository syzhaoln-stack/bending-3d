'use strict';
/*
 * Classroom geometry only. All section mechanics are supplied by the caller.
 * Depends on the bundled THREE r160 and window.BendingScene from bending-3d.
 * Coordinates: x across the section; y upward; z along the beam, with its cut
 * face at z = 0 and the physical beam extending into negative z.
 */
(() => {
  const T = window.THREE;
  if (!T || !window.BendingScene) throw new Error('BeamLessonScene requires THREE and BendingScene.');
  const C = Object.freeze({ concrete:0xb7c3ce, edge:0x647d8d, pressure:0x087f8c,
    base:0xc87524, extra:0x7755aa, ink:0x384755, reference:0x899ba8 });
  const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const hex = value => `#${value.toString(16).padStart(6, '0')}`;

  class BeamLessonScene extends window.BendingScene {
    constructor(element) {
      super(element, {kind:'rc'});
      this.orientation = {azimuth:-0.54, elevation:0.20, zoom:1};
      this.canvas.tabIndex = 0;
      this.canvas.setAttribute('aria-label', '矩形、双筋与T形钢筋混凝土梁三维截面。拖动或用方向键旋转，加减键缩放，Home复位，F键正视。');
      this._lessonKeyDown = event => {
        const step = {ArrowLeft:[-.08,0],ArrowRight:[.08,0],ArrowUp:[0,.06],ArrowDown:[0,-.06]}[event.key];
        if (step) {
          event.preventDefault();
          this.setOrientation({azimuth:this.orientation.azimuth+step[0], elevation:this.orientation.elevation+step[1]});
          this._notifyView();
        } else if (event.key === '+' || event.key === '=') {
          event.preventDefault(); this.setZoom(1.08);
        } else if (event.key === '-' || event.key === '_') {
          event.preventDefault(); this.setZoom(1/1.08);
        } else if (event.key === 'Home') {
          event.preventDefault(); this.resetView();
        } else if (event.key.toLowerCase() === 'f') {
          event.preventDefault(); this.frontView();
        }
      };
      this.canvas.addEventListener('keydown', this._lessonKeyDown);
      this.updateSection({mode:'rect',b:250,h:500,h0:460,bf:650,hf:100,x:120,yC:60,
        AsBase:1200,AsExtra:0,AsTop:0,ap:40,over:false,showForces:true});
    }

    _normaliseState(input) {
      const h=Math.max(200,number(input.h,500)), b=Math.max(100,number(input.b,250));
      const h0=clamp(number(input.h0,h-40),h*.3,h-15);
      const x=clamp(number(input.x,0),0,h);
      const reference=number(input.referenceX,NaN);
      return {
        mode:['rect','double','tee'].includes(input.mode)?input.mode:'rect', b,h,h0,
        sectionKind:['tee','box','diamond','hollow'].includes(input.sectionKind)?input.sectionKind:'tee',
        geometrySpec:input.geometrySpec&&typeof input.geometrySpec==='object'?{...input.geometrySpec}:null,
        barLayout:Array.isArray(input.barLayout)?input.barLayout.slice(0,20).map(bar=>({
          x:number(bar.x,0),y:number(bar.y,h0),diameter:Math.max(.5,number(bar.d,number(bar.diameter,20)))
        })):null,
        bf:Math.max(b,number(input.bf,650)),hf:clamp(number(input.hf,100),15,h-20),
        x,referenceX:reference>0&&reference<=h?reference:null,
        yC:clamp(number(input.yC,x/2),0,Math.max(x,0)),
        AsBase:Math.max(0,number(input.AsBase,0)),AsExtra:Math.max(0,number(input.AsExtra,0)),
        AsTop:Math.max(0,number(input.AsTop,0)),ap:clamp(number(input.ap,40),15,h0-15),
        pairView:['split','assembled','base'].includes(input.pairView)?input.pairView:null,
        over:!!input.over,showForces:input.showForces!==false
      };
    }

    _geometrySpec(s) {
      const supplied=s.geometrySpec||{},sx=s.bf/650,sy=s.h/500;
      return {
        wall:clamp(number(supplied.wall,75*sx),1,s.bf*.49),
        top:clamp(number(supplied.top,100*sy),1,s.h*.49),
        bottom:clamp(number(supplied.bottom,100*sy),1,s.h*.49),
        radius:Math.max(.5,number(supplied.radius,70*Math.min(sx,sy))),
        centers:Array.isArray(supplied.centers)?supplied.centers.map(p=>({x:number(p.x,s.bf/2)-s.bf/2,y:number(p.y,s.h/2)})):
          [-190,0,190].map(x=>({x:x*sx,y:s.h/2}))
      };
    }

    _clipAbove(profile,cutY) {
      const output=[];
      for(let i=0;i<profile.length;i++){
        const a=profile[i],b=profile[(i+1)%profile.length],aIn=a[1]>=cutY-1e-10,bIn=b[1]>=cutY-1e-10;
        if(aIn)output.push(a);
        if(aIn!==bIn){const t=(cutY-a[1])/(b[1]-a[1]);output.push([a[0]+t*(b[0]-a[0]),cutY]);}
      }
      return output;
    }

    // The pressure geometry is the section intersected with a horizontal strip.
    // A hole cut by the strip becomes a genuine open notch in the outer contour;
    // fully enclosed holes remain Shape.holes. No concrete is drawn inside voids.
    _sectionShape(s, depthFromTop=s.h) {
      const d=clamp(depthFromTop,0,s.h), top=this.Y(0), bottom=this.Y(d);
      const web=s.b*this.scale, flange=s.bf*this.scale;
      const rectangle=width=>[[-width/2,top],[width/2,top],[width/2,bottom],[-width/2,bottom]];
      if(s.mode!=='tee')return {outer:rectangle(web),holes:[]};
      if(s.sectionKind==='diamond'){
        const full=[[0,top],[flange/2,this.Y(s.h/2)],[0,this.Y(s.h)],[-flange/2,this.Y(s.h/2)]];
        return {outer:this._clipAbove(full,bottom),holes:[]};
      }
      if(s.sectionKind==='box'){
        const spec=this._geometrySpec(s),innerHalf=(s.bf/2-spec.wall)*this.scale;
        const voidTop=this.Y(spec.top),voidBottom=this.Y(s.h-spec.bottom);
        if(d<=spec.top)return {outer:rectangle(flange),holes:[]};
        if(d<s.h-spec.bottom)return {outer:[[-flange/2,top],[flange/2,top],[flange/2,bottom],
          [innerHalf,bottom],[innerHalf,voidTop],[-innerHalf,voidTop],[-innerHalf,bottom],[-flange/2,bottom]],holes:[]};
        return {outer:rectangle(flange),holes:[[[-innerHalf,voidTop],[-innerHalf,voidBottom],[innerHalf,voidBottom],[innerHalf,voidTop]]]};
      }
      if(s.sectionKind==='hollow'){
        const spec=this._geometrySpec(s),holes=[],notches=[];
        spec.centers.forEach(center=>{
          const r=spec.radius,cx=center.x*this.scale,cy=this.Y(center.y),rr=r*this.scale;
          if(d<=center.y-r+1e-9)return;
          if(d>=center.y+r-1e-9){
            holes.push(Array.from({length:160},(_,i)=>{const a=2*Math.PI*i/160;return[cx+rr*Math.cos(a),cy+rr*Math.sin(a)];}));
          }else{
            const start=Math.asin(clamp((center.y-d)/r,-1,1)),end=Math.PI-start;
            const count=Math.max(8,Math.ceil((end-start)/(2*Math.PI)*160));
            notches.push({right:cx+rr*Math.cos(start),points:Array.from({length:count+1},(_,i)=>{
              const a=start+(end-start)*i/count;return[cx+rr*Math.cos(a),cy+rr*Math.sin(a)];
            })});
          }
        });
        notches.sort((a,b)=>b.right-a.right);
        const outer=[[-flange/2,top],[flange/2,top],[flange/2,bottom]];
        notches.forEach(notch=>outer.push(...notch.points));outer.push([-flange/2,bottom]);
        return {outer,holes};
      }
      if(d<=s.hf)return {outer:rectangle(flange),holes:[]};
      const shoulder=this.Y(s.hf);
      return {outer:[[-flange/2,top],[flange/2,top],[flange/2,shoulder],[web/2,shoulder],
        [web/2,bottom],[-web/2,bottom],[-web/2,shoulder],[-flange/2,shoulder]],holes:[]};
    }

    _profile(s,depthFromTop=s.h){return this._sectionShape(s,depthFromTop).outer;}

    _widthAt(s,y) {
      if(s.mode!=='tee')return s.b;
      if(s.sectionKind==='diamond')return s.bf*2*Math.min(y,s.h-y)/s.h;
      if(s.sectionKind==='tee')return y<=s.hf?s.bf:s.b;
      return s.bf;
    }

    _prism(profile, depth, color, opacity, front=0) {
      const section=Array.isArray(profile)?{outer:profile,holes:[]}:profile;
      const shape=new T.Shape();
      section.outer.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y)); shape.closePath();
      section.holes.forEach(points=>{
        const hole=new T.Path();points.forEach(([x,y],i)=>i?hole.lineTo(x,y):hole.moveTo(x,y));hole.closePath();shape.holes.push(hole);
      });
      const geometry=new T.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:false,curveSegments:1});
      geometry.translate(0,0,front-depth);
      const mesh=new T.Mesh(geometry,this._mat(color,opacity));
      mesh.userData.lessonPart=color===C.pressure?'compression-block':'concrete';
      this.group.add(mesh); return mesh;
    }

    _outline(profile, depth, color=C.edge, opacity=.65) {
      const section=Array.isArray(profile)?{outer:profile,holes:[]}:profile;
      [section.outer,...section.holes].forEach((points,index)=>{
        const closed=[...points,points[0]];
        this._line(closed.map(([x,y])=>[x,y,.018]),color,false,opacity);
        this._line(closed.map(([x,y])=>[x,y,-depth]),color,false,opacity*.65);
        const stride=index===0?1:Math.max(1,Math.floor(points.length/4));
        points.forEach(([x,y],i)=>{if(i%stride===0)this._line([[x,y,0],[x,y,-depth]],color,false,opacity*.38);});
      });
    }

    // Representative bars preserve group colour and area-dependent thickness.
    // If exact equivalent diameters cannot fit, a common display reduction keeps
    // the bodies distinct. These bars are deliberately not a construction layout.
    _steelLayout(s) {
      if(s.barLayout&&s.barLayout.length)return s.barLayout.map(bar=>({...bar,color:C.base,kind:'base',area:Math.PI*bar.diameter**2/4}));
      const baseCount=s.AsBase>1e-8?3:0,extraCount=s.mode==='double'&&s.AsExtra>1e-8?2:0;
      const lower=[];
      const make=(area,count,color,kind,y)=>({area:area/count,
        diameter:Math.min(Math.sqrt(4*area/(Math.PI*count)),Math.min(y,s.h-y)*1.5),
        color,kind,y,x:0});
      for(let i=0;i<Math.max(baseCount,extraCount);i++){
        if(i<baseCount)lower.push(make(s.AsBase,baseCount,C.base,'base',s.h0));
        if(i<extraCount)lower.push(make(s.AsExtra,extraCount,C.extra,'extra-bottom',s.h0));
      }
      const steelWidth=this._widthAt(s,s.h0),insideWidth=steelWidth-2*Math.min(30,steelWidth*.12),minimumGap=Math.min(10,insideWidth*.05);
      const totalDiameter=lower.reduce((sum,bar)=>sum+bar.diameter,0);
      const fit=Math.min(1,(insideWidth-minimumGap*Math.max(0,lower.length-1))/Math.max(totalDiameter,1e-8));
      lower.forEach(bar=>bar.diameter*=Math.max(fit,.05));
      const occupied=lower.reduce((sum,bar)=>sum+bar.diameter,0);
      const gap=lower.length>1?(insideWidth-occupied)/(lower.length-1):0;
      let cursor=-insideWidth/2;
      lower.forEach(bar=>{bar.x=lower.length===1?0:cursor+bar.diameter/2;cursor+=bar.diameter+gap;});
      if(s.mode==='tee'&&s.sectionKind==='diamond')lower.forEach(bar=>{
        const normalDistance=(steelWidth/2-Math.abs(bar.x))/Math.sqrt(1+(s.bf/s.h)**2);
        bar.diameter=Math.min(bar.diameter,Math.max(.5,normalDistance*1.86));
      });
      const upper=[];
      if(s.mode==='double'&&s.AsTop>1e-8){
        for(const direction of [-1,1]){
          const bar=make(s.AsTop,2,C.extra,'extra-top',s.ap);
          bar.diameter=Math.min(bar.diameter,insideWidth*.34);
          bar.x=direction*insideWidth*.28;upper.push(bar);
        }
      }
      return [...lower,...upper];
    }

    _steelMaterial(part) {
      const color=this._activeSteelColor||C.base,key=`lesson-steel:${color}:${part}`;
      if(!this.materials.has(key)){
        const tint=new T.Color(color);
        if(part==='rib')tint.multiplyScalar(.85);
        this.materials.set(key,new T.MeshStandardMaterial({color:tint,roughness:part==='cut'?.63:.76,
          metalness:.13,transparent:true,opacity:1,depthWrite:true,side:T.FrontSide}));
      }
      return this.materials.get(key);
    }

    _point(at,color,radius=.047) {
      const mesh=new T.Mesh(new T.SphereGeometry(radius,12,8),this._mat(color));
      mesh.position.set(...at);mesh.renderOrder=5;this.group.add(mesh);return mesh;
    }

    _depthDimension(s) {
      if(s.x<=.0001)return;
      const half=(s.mode==='tee'?s.bf:s.b)*this.scale/2;
      const xx=-half-.40,top=this.Y(0),bottom=this.Y(s.x),z=.10;
      const endHalf=this._widthAt(s,s.x)*this.scale/2,startHalf=this._widthAt(s,0)*this.scale/2;
      this._line([[-startHalf,top,z],[xx-.10,top,z]],C.pressure,false,.64);
      this._line([[-endHalf,bottom,z],[xx-.10,bottom,z]],C.pressure,true,.72);
      this._line([[xx,top,z],[xx,bottom,z]],C.pressure,false,.9);
      for(const y of [top,bottom])this._line([[xx-.075,y-.05,z],[xx+.075,y+.05,z]],C.pressure);
      // Keep the short x label outside the diagram instead of on its dimension line.
      const atReference=s.mode!=='double'&&s.referenceX!==null&&Math.abs(s.x-s.referenceX)<=s.h*1e-6;
      const label=this._label(atReference?'x = x_b':'x',[xx-.20,(top+bottom)/2,z+.04],hex(C.pressure),.29);
      label.userData.lessonPart='current-compression-depth-label';label.userData.labelText=atReference?'x = x_b':'x';
    }

    _referenceDepth(s) {
      if(s.mode==='double'||s.referenceX===null)return;
      const y=this.Y(s.referenceX),half=this._widthAt(s,s.referenceX)*this.scale/2;
      const outerHalf=(s.mode==='tee'?s.bf:s.b)*this.scale/2,color=0x526b83,z=.125;
      const reference=this._line([[-half-.06,y,z],[half+.06,y,z]],color,true,.97);
      reference.userData.lessonPart='reference-compression-depth';reference.userData.referenceX=s.referenceX;
      const labelX=outerHalf+.94,labelY=y-.20;
      this._line([[half+.06,y,z],[outerHalf+.34,y,z],[outerHalf+.51,labelY,z]],color,true,.76);
      const label=this._label('x_b 适筋界限',[labelX,labelY,z+.045],hex(color),.23);
      label.userData.lessonPart='reference-compression-depth-label';label.userData.labelText='x_b 适筋界限';
    }

    _showResultants(s,part='all') {
      const w=s.b*this.scale,yt=this.Y(s.h0),yc=this.Y(s.yC),hasPair=s.mode==='double'&&(s.AsExtra>0||s.AsTop>0);
      const forceLength=1.40;
      if(part!=='pair'&&s.x>0){
        this._point([0,yc,.075],C.pressure,.06);
        this._arrow([0,yc,forceLength],[0,yc,.10],C.pressure,.035);
        this._label('C',[.29,yc+.27,forceLength*.82],hex(C.pressure),.31);
      }
      if(part!=='pair'&&s.AsBase>0){
        const tx=hasPair?-w/2-.35:0;
        if(hasPair)this._line([[0,yt,.10],[tx,yt,.10]],C.base,true,.7);
        this._arrow([tx,yt,.10],[tx,yt,forceLength],C.base,.035);
        this._label(hasPair?'T₁':'T',[tx-.10,yt-.31,forceLength*.82],hex(C.base),.31);
      }
      if(part!=='base'&&hasPair){
        const rx=0,top=this.Y(s.ap),z=.13;
        if(s.AsTop>0){
          this._arrow([rx,top,forceLength],[rx,top,z],C.extra,.034);
          this._label('上压 Cₛ′',[rx+.37,top+.29,forceLength*.81],hex(C.extra),.27);
        }
        if(s.AsExtra>0){
          this._arrow([rx,yt,z],[rx,yt,forceLength],C.extra,.034);
          this._label('下拉 ΔT',[rx+.37,yt-.30,forceLength*.81],hex(C.extra),.27);
        }
        if(s.AsTop>0&&s.AsExtra>0){
          const dx=w/2+.43,dz=.50;
          this._line([[rx,top,dz],[dx+.08,top,dz]],C.extra,false,.55);
          this._line([[rx,yt,dz],[dx+.08,yt,dz]],C.extra,false,.55);
          this._line([[dx,top,dz],[dx,yt,dz]],C.extra,false,.75);
          for(const y of [top,yt])this._line([[dx-.075,y-.05,dz],[dx+.075,y+.05,dz]],C.extra);
          this._label('h₀ − a′',[dx+.13,(top+yt)/2,dz+.1],hex(C.extra),.27);
        }
      }
    }

    _flangeReference(s) {
      if(s.mode!=='tee'||s.sectionKind!=='tee')return;
      const half=s.bf*this.scale/2,web=s.b*this.scale,y=this.Y(s.hf),top=this.Y(0),z=.105;
      const color=0x526b83,dx=half+.32;
      this._line([[-half-.05,y,z],[half+.12,y,z]],color,true,.95);
      this._line([[half,top,z],[dx+.08,top,z]],color,false,.72);
      this._line([[half,y,z],[dx+.08,y,z]],color,false,.72);
      this._line([[dx,top,z],[dx,y,z]],color,false,.85);
      for(const yy of [top,y])this._line([[dx-.06,yy-.045,z],[dx+.06,yy+.045,z]],color);
      this._label('h_f′',[dx+.24,(top+y)/2,z+.04],hex(color),.25);
      const added=s.x-s.hf;
      if(added>1e-7&&added<=Math.min(30,.3*s.hf)){
        const lower=this.Y(s.x),mid=(y+lower)/2;
        // The highlighted layer has its actual geometric thickness, even when
        // very thin; a leader makes it noticeable without changing the model.
        const layer=this._box(web,added*this.scale,.024,[0,mid,.085],C.pressure,.42,false);
        layer.userData.lessonPart='new-web-compression-layer';
        this._line([[-web/2,y,.116],[web/2,y,.116],[web/2,lower,.116],[-web/2,lower,.116]],C.pressure,false,.95);
        this._line([[web/2,mid,.13],[web/2+.32,mid-.27,.13],[web/2+.86,mid-.27,.13]],C.pressure,false,.9);
        this._point([web/2,mid,.14],C.pressure,.035);
        this._label('新增腹板受压',[web/2+.89,mid-.44,.17],hex(C.pressure),.22);
      }
    }

    _usingGroup(group,build) {
      const root=this.group;this.group=group;
      try{return build();}finally{this.group=root;}
    }

    _cancelPairAnimation() {
      if(this._pairAnimation)cancelAnimationFrame(this._pairAnimation);
      this._pairAnimation=0;
    }

    _pairPosition(progress) {
      const p=clamp(progress,0,1),shift=this._pairBaseShift||0,offset=this._pairOffset||0,clear=this._pairClearZ||0;
      // Split -> move clear of the cut face -> align sideways -> insert along z.
      // Reversing the same path never drags a purple bar through an orange bar.
      if(p<.25)return [shift+offset,0,clear*(p/.25)];
      if(p<.65)return [shift+offset*(1-(p-.25)/.4),0,clear];
      return [shift,0,clear*(1-(p-.65)/.35)];
    }

    _applyPairProgress(progress) {
      this.pairProgress=clamp(number(progress,0),0,1);
      if(this._pairGroup){
        this._pairGroup.visible=this.pairView!=='base';
        this._pairGroup.position.set(...this._pairPosition(this.pairProgress));
        // Once inserted, the colour legend identifies the pair. Hide its
        // floating title before it can overlap the concrete compression label.
        if(this._pairTitle)this._pairTitle.visible=this.pairProgress<.65;
      }
    }

    _pairEvent() {
      return {view:this.pairView,progress:this.pairProgress,animating:!!this._pairAnimation};
    }

    setPairView(view,animate=true) {
      if(!['split','assembled','base'].includes(view))throw new RangeError('Pair view must be split, assembled, or base.');
      if(this.disposed)return this;
      const oldView=this.pairView;
      if(oldView===view&&this._pairAnimation&&animate)return this;
      const target=view==='assembled'?1:0;
      if(oldView===view&&!this._pairAnimation&&(view==='base'||Math.abs(this.pairProgress-target)<1e-8))return this;
      this._cancelPairAnimation();this.pairView=view;
      if(this.sectionState?.mode!=='double'||!this._pairGroup){
        this.pairProgress=target;
        if(typeof this.onPairViewChange==='function')this.onPairViewChange(this._pairEvent());
        return this;
      }
      const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(view==='base'||!animate||reduced||(oldView==='base'&&view==='split')){
        this._applyPairProgress(view==='base'?this.pairProgress:target);this.render();
        if(typeof this.onPairViewChange==='function')this.onPairViewChange(this._pairEvent());
        if(typeof this.onPairAnimationEnd==='function')this.onPairAnimationEnd(this._pairEvent());
        return this;
      }
      const start=oldView==='base'?0:number(this.pairProgress,0),started=performance.now();
      this._applyPairProgress(start);
      const duration=900*Math.max(.35,Math.abs(target-start));
      const frame=now=>{
        if(this.disposed||this.sectionState?.mode!=='double')return;
        const t=clamp((now-started)/duration,0,1),eased=t*t*(3-2*t);
        this._applyPairProgress(start+(target-start)*eased);this.render();
        if(t<1)this._pairAnimation=requestAnimationFrame(frame);
        else{
          this._pairAnimation=0;this._applyPairProgress(target);
          if(typeof this.onPairViewChange==='function')this.onPairViewChange(this._pairEvent());
          if(typeof this.onPairAnimationEnd==='function')this.onPairAnimationEnd(this._pairEvent());
        }
      };
      this._pairAnimation=requestAnimationFrame(frame);
      if(typeof this.onPairViewChange==='function')this.onPairViewChange(this._pairEvent());
      return this;
    }

    updateSection(input={}) {
      if(this.disposed)return;
      const previousMode=this.sectionState?.mode,s=this._normaliseState(input),modeChanged=previousMode!==s.mode;
      if(modeChanged)this._cancelPairAnimation();
      this.sectionState=s;this.state=s;
      this._clear();this.scale=5/s.h;this.w=s.b*this.scale;this.Y=fromTop=>2.5-fromTop*this.scale;
      this.displayCurvature=0;this.neutralY=0;
      const depth=3.45,profile=this._sectionShape(s),maxWidth=(s.mode==='tee'?s.bf:s.b)*this.scale;
      this.bars=this._steelLayout(s);
      this.steelLayout=this.bars.map(bar=>({...bar}));
      const sectionNames={tee:'T形',box:'箱形',diamond:'菱形',hollow:'空心板'};
      const compressionLabel=s.mode==='tee'?(s.sectionKind==='tee'?(s.x<=s.hf?'受压区在翼缘内':'受压区进入腹板'):`${sectionNames[s.sectionKind]}受压区`):'混凝土受压区';
      this._baseGroup=new T.Group();this._baseGroup.name='lesson-base-section';this.group.add(this._baseGroup);
      this._pairGroup=s.mode==='double'?new T.Group():null;
      if(this._pairGroup){this._pairGroup.name='lesson-added-steel-pair';this.group.add(this._pairGroup);}
      this._usingGroup(this._baseGroup,()=>{
        this._prism(profile,depth,C.concrete,.13);
        this._prism(profile,.028,0xe1e8ed,.20,.016);
        this._outline(profile,depth,C.edge,.70);
        if(s.x>1e-6){
          const compression=this._sectionShape(s,s.x);
          this._prism(compression,depth-.014,C.pressure,.18,-.008);
          this._prism(compression,.036,C.pressure,.33,.037);
          [compression.outer,...compression.holes].forEach(points=>this._line([...points,points[0]].map(([x,y])=>[x,y,.061]),C.pressure,false,.85));
        }
        this.bars.filter(bar=>s.mode!=='double'||bar.kind==='base').forEach(bar=>{this._activeSteelColor=bar.color;this._ribbedBar(bar,depth);});
        this._depthDimension(s);this._flangeReference(s);this._referenceDepth(s);
        if(s.showForces)this._showResultants(s,s.mode==='double'?'base':'all');
        else if(s.x>0){this._point([0,this.Y(s.yC),.078],C.pressure,.052);this._label('C',[.25,this.Y(s.yC)+.15,.15],hex(C.pressure),.28);}
        this._label(compressionLabel,[0,2.86,-depth*.54],hex(C.pressure),.24);
        if(s.mode==='double')this._label('原单筋部分',[0,-2.97,-depth*.30],hex(C.base),.23);
      });
      this._pairTitle=null;
      if(this._pairGroup)this._usingGroup(this._pairGroup,()=>{
        this.bars.filter(bar=>bar.kind!=='base').forEach(bar=>{this._activeSteelColor=bar.color;this._ribbedBar(bar,depth);});
        if(s.showForces)this._showResultants(s,'pair');
        if(s.AsExtra>0||s.AsTop>0)this._pairTitle=this._label('新增钢筋对',[0,2.87,-depth*.48],hex(C.extra),.25);
      });
      this._activeSteelColor=null;
      if(s.mode==='double'){
        this._pairOffset=this.w+1.45;this._pairBaseShift=-this._pairOffset/2;this._pairClearZ=depth+.38;
        this._baseGroup.position.x=this._pairBaseShift;
        if(modeChanged||!['split','assembled','base'].includes(this.pairView)){
          this.pairView=s.pairView||'split';this.pairProgress=this.pairView==='assembled'?1:0;
        }
        this._applyPairProgress(this.pairProgress);
        this._lessonBounds={min:[this._pairBaseShift-maxWidth/2-1.02,-3.27,-depth-.15],
          max:[this._pairBaseShift+this._pairOffset+this.w/2+1.15,3.20,this._pairClearZ+1.72]};
      }else this._lessonBounds={min:[-maxWidth/2-1.02,-3.03,-depth-.15],max:[maxWidth/2+(s.referenceX===null?.98:1.85),3.14,1.72]};
      this.canvas.setAttribute('aria-label',`${s.mode==='tee'?sectionNames[s.sectionKind]:s.mode==='double'?'双筋矩形':'单筋矩形'}钢筋混凝土梁三维截面。青色表示等效受压区，橙色为原受拉钢筋${s.mode==='double'?'，紫色为新增上下钢筋及其力偶':''}。${s.over?'当前状态超过所取适筋界限。':''}可拖动、方向键旋转，F键正视，Home复位。`);
      this._camera();
      if(s.mode==='double'&&!modeChanged&&s.pairView&&s.pairView!==this.pairView)this.setPairView(s.pairView,true);
      return this;
    }

    _camera() {
      // Called once by super() before this module's fields exist.
      if(!this.camera||!this.orientation)return;
      const bounds=this._lessonBounds||{min:[-3.25,-3.1,-3.6],max:[3.55,3.2,1.8]};
      const min=bounds.min,max=bounds.max,o=this.orientation;
      const aspect=Math.max(.25,(this.width||600)/(this.height||460));
      const target=new T.Vector3((min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2);
      this.camera.position.set(target.x+20*Math.sin(o.azimuth)*Math.cos(o.elevation),target.y+20*Math.sin(o.elevation),target.z+20*Math.cos(o.azimuth)*Math.cos(o.elevation));
      this.camera.up.set(0,1,0);this.camera.lookAt(target);this.camera.updateMatrixWorld(true);
      let extentX=0,extentY=0;
      for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]]){
        const view=new T.Vector3(x,y,z).applyMatrix4(this.camera.matrixWorldInverse);
        extentX=Math.max(extentX,Math.abs(view.x));extentY=Math.max(extentY,Math.abs(view.y));
      }
      const half=Math.max(extentY,extentX/aspect)*1.025/o.zoom;
      this.camera.left=-half*aspect;this.camera.right=half*aspect;this.camera.top=half;this.camera.bottom=-half;
      this.camera.updateProjectionMatrix();this.render();
    }

    resetView(){this.setOrientation({azimuth:-.54,elevation:.20,zoom:1});this._notifyView();return this;}
    frontView(){this.setOrientation({azimuth:0,elevation:0,zoom:1});this._notifyView();return this;}
    dispose(){this._cancelPairAnimation();this.canvas.removeEventListener('keydown',this._lessonKeyDown);super.dispose();}
  }

  /**
   * A real full-width rectangle for the bounded x <= flange-height comparison.
   * Mechanics (including its own x and yC) are supplied by the caller. The amber
   * regions are outside the original T outline; they are not assigned a tensile
   * strain sign here, since equivalent-block x is not the neutral-axis depth.
   */
  class BeamEquivalentScene extends BeamLessonScene {
    updateEquivalent(input={}) {
      if(this.disposed)return this;
      const width=Math.max(100,number(input.b,650)),height=Math.max(200,number(input.h,500));
      const web=clamp(number(input.originalWebWidth,250),1,width);
      const flange=clamp(number(input.flangeHeight,100),15,height-20);
      const x=number(input.x,0);
      if(x>flange+1e-7)throw new RangeError('Equivalent T/rectangle comparison requires x <= flangeHeight.');
      let barLayout=input.barLayout;
      if(!Array.isArray(barLayout)||!barLayout.length){
        // Without a supplied layout, place representative bars inside the
        // original web, never spread them across the added concrete side zones.
        const reference=this._normaliseState({...input,mode:'rect',b:web,h:height,AsExtra:0,AsTop:0,barLayout:null});
        barLayout=this._steelLayout(reference).map(bar=>({x:bar.x,y:bar.y,d:bar.diameter}));
      }
      super.updateSection({...input,mode:'rect',b:width,h:height,bf:width,referenceX:null,
        AsExtra:0,AsTop:0,barLayout});
      const s=this.sectionState,depth=3.45,sideWidth=(width-web)/2;
      this.equivalentState={...s,originalWebWidth:web,flangeHeight:flange,
        additionalConcreteArea:(width-web)*(height-flange),comparisonValid:true};
      this._extraConcreteGroup=new T.Group();this._extraConcreteGroup.name='equivalent-additional-lower-concrete';
      this._baseGroup.add(this._extraConcreteGroup);
      this._usingGroup(this._extraConcreteGroup,()=>{
        const fill=0xe3b875,edge=0xaa7e43,top=this.Y(flange),bottom=this.Y(height);
        if(sideWidth>1e-8)for(const sign of [-1,1]){
          const cx=sign*(width+web)/4*this.scale,w=sideWidth*this.scale,h=(height-flange)*this.scale;
          const volume=this._box(w,h,depth,[cx,(top+bottom)/2,-depth/2],fill,.075,false);
          volume.userData.lessonPart='additional-lower-concrete';
          const face=this._box(w,h,.012,[cx,(top+bottom)/2,.040],fill,.13,false);
          face.userData.lessonPart='additional-lower-concrete-face';
          const corners=[[cx-w/2,top],[cx+w/2,top],[cx+w/2,bottom],[cx-w/2,bottom]];
          for(const z of [.060,-depth])this._line([...corners,corners[0]].map(([xx,yy])=>[xx,yy,z]),edge,true,z>0?.74:.38);
          corners.forEach(([xx,yy])=>this._line([[xx,yy,.02],[xx,yy,-depth]],edge,true,.28));
        }
        if(sideWidth>1e-8){
          // Place the explanatory label in the quiet middle band, above the
          // tension steel and below the pressure resultant and dimensions.
          const labelY=this.Y(flange+(height-flange)*.40),pickY=labelY-.25;
          const outerPick=(web/2+sideWidth*.55)*this.scale;
          for(const sign of [-1,1])this._line([[sign*outerPick,pickY,.105],[sign*.82,labelY-.08,.17]],edge,true,.64);
          const label=this._label('多出的下部混凝土',[0,labelY+.10,.19],hex(edge),.23);
          label.userData.labelText='多出的下部混凝土';
        }
      });
      // The reference line belongs to the original T, not to a change in this
      // rectangle's physical outline. Its position and label match the left view.
      this._usingGroup(this._baseGroup,()=>this._flangeReference({...s,mode:'tee',sectionKind:'tee',
        b:web,bf:width,hf:flange}));
      // BeamLessonScene already uses the same bounds for equal outer width and
      // height in rect/tee mode. Extra labels stay inside that shared frame.
      this.canvas.setAttribute('aria-label','与左侧T梁同外包尺寸的完整矩形梁。青色为相同的等效受压区；淡琥珀色虚线标出比T梁多出的下部混凝土，本模型不计其抗弯贡献但计入自重。钢筋位置与左侧相同。可拖动或方向键旋转。');
      this.render();return this;
    }
  }
  window.BeamLessonScene=BeamLessonScene;
  window.BeamEquivalentScene=BeamEquivalentScene;
})();
