/* Click-to-open gallery with horizontal browsing, adapted from gallery-template.
   Media order and descriptions are authored in photos.html. */
(async () => {
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// Motion values measured from mikematas.com: expansion 300/35, paging 450/50,
// touch paging 800/80, edge return 550/50, and drag decay 0.96 per 60 Hz frame.
// Integrate in seconds so 60 Hz and 120 Hz displays have the same response.
function springStep(position,velocity,target,tension,friction,seconds){
  const steps=Math.max(1,Math.ceil(seconds*240)), dt=seconds/steps;
  for(let i=0;i<steps;i++){
    velocity+=((target-position)*tension-velocity*friction)*dt;
    position+=velocity*dt;
  }
  return [position,velocity];
}
const touchPointer=matchMedia('(pointer: coarse)');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
let reduce=motion.matches;
motion.addEventListener('change',event=>{ reduce=event.matches; });
const railTrack=document.getElementById('railTrack');
const detailTrack=document.getElementById('detailTrack');
try {
  const response=await fetch('https://ninad-photo-review.ninad-085.workers.dev/gallery.json',{signal:AbortSignal.timeout(2500)});
  if(response.ok){
    const cloudItems=await response.json();
    const markup=cloudItems.map((item,index)=>{
      const file=escapeHtml(item.file), alt=escapeHtml(item.alt||'Gallery media'), description=escapeHtml(item.description||'');
      const attrs=description?` data-caption="${description}"`:'';
      if(item.type==='video') return `<li class="photo video" data-type="video" data-video="${file}" data-poster=""${attrs}><a href="${file}" aria-label="Open video ${index+1}: ${alt}"><video class="gallery-media" src="${file}" aria-label="${alt}" width="${item.width||1080}" height="${item.height||1920}" muted playsinline preload="metadata"></video><span class="play-badge" aria-hidden="true"></span></a></li>`;
      return `<li class="photo"${attrs}><a href="${file}" aria-label="Open photo ${index+1}: ${alt}"><img class="gallery-media" src="${file}" alt="${alt}" width="${item.width||1080}" height="${item.height||1350}" loading="eager" decoding="async" draggable="false"></a></li>`;
    }).join('');
    railTrack.insertAdjacentHTML('afterbegin',markup);
  }
} catch(error) {
  console.info('Cloud gallery feed is temporarily unavailable.',error);
}
const cards=[...railTrack.querySelectorAll('.photo')];
const links=cards.map(card=>card.querySelector('a'));
const homeMedia=cards.map(card=>card.querySelector('.gallery-media'));
let suppressClick=false;
if(!cards.length) return;
cards.forEach((card,i)=>{
  card.dataset.i=i;
  const page=document.createElement('div');
  page.className='page';
  let media;
  if(card.dataset.type==='video'){
    media=document.createElement('video');
    media.className='gallery-media';
    media.src=card.dataset.video;
    media.poster=card.dataset.poster;
    media.width=homeMedia[i].width;
    media.height=homeMedia[i].height;
    media.controls=true;
    media.playsInline=true;
    media.preload='metadata';
    media.setAttribute('aria-label',homeMedia[i].getAttribute('alt')||homeMedia[i].getAttribute('aria-label')||'Gallery video');
  } else {
    media=homeMedia[i].cloneNode();
    media.loading='eager';
    media.removeAttribute('fetchpriority');
  }
  const figure=document.createElement('figure');
  figure.appendChild(media);
  if(card.dataset.title || card.dataset.caption){
    const caption=document.createElement('figcaption');
    if(card.dataset.title){
      const title=document.createElement('span');
      title.className='caption-title';
      title.textContent=card.dataset.title;
      caption.appendChild(title);
    }
    if(card.dataset.caption){
      const note=document.createElement('p');
      note.textContent=card.dataset.caption;
      caption.appendChild(note);
    }
    figure.appendChild(caption);
  }
  page.appendChild(figure);
  detailTrack.appendChild(page);
});
const pages=[...detailTrack.children];
const detailMedia=pages.map(page=>page.querySelector('.gallery-media'));
const captions=pages.map(page=>page.querySelector('figcaption'));
class Scroller{
  constructor(vp,track,opts){
    this.vp=vp; this.track=track; this.opts=opts; this.mode=opts.mode;
    this.frame=0; this.pos=0; this.target=0; this.active=false; this.dragging=false;
    this.velocity=0; this.coast=0; this.lastFrame=0;
    this.snapTimer=null;
    this.ox=0; this.oxVel=0; this.oxDrag=false;
    this.metrics(); this.bind();
  }
  get target(){ return this._target; }
  set target(value){ this.coast=0; this._target=value; this.wake(); }
  wake(){ if(!this.frame){ this.lastFrame=performance.now(); this.frame=requestAnimationFrame(now=>this.loop(now)); } }
  metrics(){ this.vw=this.vp.clientWidth; this.max=Math.max(0,this.track.scrollWidth-this.vw); this.oxMax=this.vw*(this.mode==="page"?0.30:0.40); }
  apply(){
    this.track.style.transform=`translate3d(${this.ox-this.pos}px,0,0)`;
    if(this.mode==='page' && this.vw){
      const index=clamp(Math.round(this.pos/this.vw),0,pages.length-1);
      if(index!==this.visibleIndex){
        pages.forEach((page,i)=>page.setAttribute('aria-hidden',String(i!==index)));
        detailMedia.forEach((media,i)=>{ if(i!==index && media instanceof HTMLVideoElement) media.pause(); });
        this.visibleIndex=index;
      }
    }
  }
  setInstant(p){ this.pos=this.target=clamp(p,0,this.max); this.velocity=this.coast=0; this.ox=this.oxVel=0; this.apply(); }
  loop(now){
    this.frame=0;
    const dt=Math.min((now-this.lastFrame)/1000,0.032);
    this.lastFrame=now;
    if(reduce){ this.resetOverscroll(); this.coast=this.velocity=0; this.pos=this.target; }
    else if(this.coast && !this.dragging){
      const decay=Math.pow(0.96,dt*60);
      const distance=this.coast*(1-decay)/(-Math.log(0.96)*60);
      const want=this.pos+distance;
      this.pos=this._target=clamp(want,0,this.max);
      this.coast*=decay;
      if(want!==this.pos){ this.oxVel=-this.coast*0.35; this.coast=0; }
      if(Math.abs(this.coast)<6) this.coast=0;
    } else if(!this.dragging){
      const [tension,friction]=this.mode==='page'?(touchPointer.matches?[800,80]:[450,50]):[300,35];
      [this.pos,this.velocity]=springStep(this.pos,this.velocity,this.target,tension,friction,dt);
      if(Math.abs(this.target-this.pos)<0.1 && Math.abs(this.velocity)<1){ this.pos=this.target; this.velocity=0; }
    }
    if(!reduce && !this.oxDrag){
      [this.ox,this.oxVel]=springStep(this.ox,this.oxVel,0,550,50,dt);
      this.ox=clamp(this.ox,-this.oxMax,this.oxMax);
      if(Math.abs(this.ox)<0.05 && Math.abs(this.oxVel)<0.5){ this.ox=this.oxVel=0; }
    }
    this.apply();
    if(this.coast || this.pos!==this.target || (!this.oxDrag && (this.ox || this.oxVel))) this.frame=requestAnimationFrame(time=>this.loop(time));
  }
  feedOverscrollX(px){       // px = scroll blocked by a bound; add it as an impulse (velocity), never a position jump
    if(reduce||!px) return;
    const room=1-Math.min(Math.abs(this.ox)/(this.oxMax||1),1);
    this.oxVel += px*(0.04+0.20*room)*60;
    this.wake();
  }
  resetOverscroll(){
    this.ox=0; this.oxVel=0; this.oxDrag=false;
  }
  snapPage(velocity=0,startIndex=Math.round(this.target/this.vw)){
    const distance=this.target-startIndex*this.vw;
    const direction=Math.abs(velocity)>100?Math.sign(velocity):Math.abs(distance)>this.vw*0.33?Math.sign(distance):0;
    this.velocity=velocity;
    this.target=clamp((startIndex+direction)*this.vw,0,this.max);
    if((this.target===0 && velocity<0)||(this.target===this.max && velocity>0)) this.velocity=0;
  }
  bind(){
    this.vp.addEventListener("wheel",e=>{
      if(e.ctrlKey || e.metaKey || T.active) return;
      if(!this.active) return;
      e.preventDefault();
      const unit=e.deltaMode===1?16:e.deltaMode===2?this.vw:1;
      const deltaX=e.deltaX*unit, deltaY=e.deltaY*unit;
      const ax=Math.abs(deltaX), ay=Math.abs(deltaY);
      const now=performance.now();
      if(!this.lastWheelTime || now-this.lastWheelTime>160) this.wheelAxis=ax>ay?'x':'y';
      this.lastWheelTime=now;
      if(this.wheelAxis==='x'){
        this.coast=this.velocity=0;
        if(this.mode==='page'){
          if(!this.snapTimer){ this.wheelIndex=Math.round(this.pos/this.vw); this.wheelOffset=this.pos-this.wheelIndex*this.vw; this.wheelPaging=false; }
          this.wheelOffset+=deltaX;
          if(!this.wheelPaging){
            if(Math.abs(this.wheelOffset)>=this.vw*0.33){
              this.wheelPaging=true;
              this.target=clamp((this.wheelIndex+Math.sign(this.wheelOffset))*this.vw,0,this.max);
              if(this.target===this.wheelIndex*this.vw) this.feedOverscrollX(-deltaX);
            } else {
              const want=this.wheelIndex*this.vw+this.wheelOffset;
              this.pos=this.target=clamp(want,0,this.max);
              if(want!==this.pos) this.feedOverscrollX(-deltaX);
              this.apply();
            }
          }
          this.queueSnap();
          return;
        }
        const before=this.target;
        this.target=clamp(before+deltaX,0,this.max);
        this.pos=this.target; this.apply();
        const leftover=deltaX-(this.target-before);   // portion blocked by the bound
        if(leftover) this.feedOverscrollX(-leftover);
        return;
      }
    },{passive:false});

    this.vp.addEventListener("pointerdown",e=>{
      if(T.active||!this.active||!e.isPrimary||e.button!==0||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||e.target.closest('video')) return;
      clearTimeout(this.snapTimer); this.snapTimer=null;
      this.setInstant(this.pos);
      suppressClick=false; this.dragging=true; this.sx=e.clientX; this.sy=e.clientY; this.sp=this.target; this.axis=null;
      this.pointerId=e.pointerId;
      this.samples=[{x:e.clientX,y:e.clientY,time:performance.now()}];
      this.startIndex=Math.round(this.pos/this.vw);
      try{ this.vp.setPointerCapture(e.pointerId); }catch(_){}
    });
    this.vp.addEventListener("pointermove",e=>{
      if(!this.dragging || e.pointerId!==this.pointerId) return;
      this.wake();
      const now=performance.now();
      this.samples.push({x:e.clientX,y:e.clientY,time:now});
      this.samples=this.samples.filter(sample=>now-sample.time<=100);
      const dx=e.clientX-this.sx, dy=e.clientY-this.sy;
      if(this.axis===null && (Math.abs(dx)>6||Math.abs(dy)>6)) this.axis=Math.abs(dx)>Math.abs(dy)?"x":"y";
      if(this.axis) suppressClick=true;
      if(this.axis==="x"){
        const want=this.sp-dx;
        this.target=clamp(want,0,this.max);
        this.pos=this.target;
        this.oxDrag=true; this.oxVel=0;
        this.ox=clamp((this.target-want)*0.5,-this.oxMax,this.oxMax);  // resist past bounds
        this.apply();
        return;
      }
    });
    const end=e=>{
      if(!this.dragging || e.pointerId!==this.pointerId) return; this.dragging=false; this.oxDrag=false;
      this.wake();
      const dx=e.clientX-this.sx, dy=e.clientY-this.sy;
      const sample=this.samples.find(point=>performance.now()-point.time<=100);
      const elapsed=sample?Math.max(16,performance.now()-sample.time):1;
      const vx=sample?clamp(-(e.clientX-sample.x)/elapsed*1000,-4000,4000):0;
      if(this.axis==="x"){
        if(this.mode==="page") this.snapPage(reduce?0:vx,this.startIndex);
        else if(!reduce && !this.ox){ this.coast=vx; this.wake(); }
      }
      else if(this.axis===null && Math.abs(dx)<6 && Math.abs(dy)<6){
        const el=document.elementFromPoint(e.clientX,e.clientY);
        const card=el&&el.closest&&el.closest(".photo");
        if(card && this.opts.onTap) this.opts.onTap(+card.dataset.i);
        else if(this.mode==='page' && !el?.closest('a,button,video')) closeNow();
      }
    };
    this.vp.addEventListener("pointerup",end);
    this.vp.addEventListener("pointercancel",e=>{
      if(e.pointerId!==this.pointerId) return;
      this.dragging=false; this.oxDrag=false;
      this.wake();
     
    });
    this.vp.addEventListener("lostpointercapture",e=>{
      if(e.pointerId!==this.pointerId) return;
      this.dragging=false; this.oxDrag=false;
     
      this.wake();
    });
  }
  queueSnap(){
    clearTimeout(this.snapTimer);
    this.snapTimer=setTimeout(()=>{
      this.snapTimer=null;
      if(!this.wheelPaging) this.snapPage(0,this.wheelIndex);
      this.wheelPaging=false;
    },160);
  }
}

let view="home";
const homeEl=document.getElementById("home");
const detailEl=document.getElementById("detail");
const backBtn=document.getElementById("back");


const home=new Scroller(document.getElementById("rail"),railTrack,{
  mode:"home", onTap:(i)=>openTo(i)
});
const detail=new Scroller(detailEl,detailTrack,{
  mode:"page"
});
home.active=true;

/* Recompute bounds as images load or the viewport changes. */
function remeasure(){ home.metrics(); detail.metrics(); }
addEventListener("load",remeasure);
homeMedia.forEach(m=>{ if(!m.complete) m.addEventListener("load",remeasure,{once:true}); });
if(window.ResizeObserver){
  new ResizeObserver(remeasure).observe(railTrack);
  new ResizeObserver(remeasure).observe(detailTrack);
}

function curDetail(){ return clamp(Math.round(detail.pos/(detail.vw||innerWidth)),0,cards.length-1); }

const T={ active:false, settling:false, t:0, dir:0, idx:0, R0:null, R1:null, flyer:null };
let openedIndex=0, openedPosition=0;
let restoreKeyboardFocus=false;
function beginTransition(i,dir){
  if(T.active) return;
  T.active=true; T.settling=false; T.idx=i; T.dir=dir; T.t=(dir>0)?0:1;
  view="transition"; home.active=false; detail.active=false;
  home.resetOverscroll(); detail.resetOverscroll();
  home.setInstant(home.pos);
  for(const scroller of [home,detail]){ clearTimeout(scroller.snapTimer); scroller.snapTimer=null; }
  if(dir>0){ openedIndex=i; openedPosition=home.pos; }
  if(dir<0 && detailMedia[i] instanceof HTMLVideoElement) detailMedia[i].pause();
  homeEl.style.display="block"; detailEl.style.display="block";
  detail.metrics(); detail.setInstant(i*detail.vw);
  if(dir<0){                          // closing: centre the matching card so the image returns to it
    home.metrics();
    const cc=cards[i].offsetLeft+cards[i].offsetWidth/2;
    home.setInstant(i===openedIndex?openedPosition:cc-home.vw/2);
  }
  T.R0=homeMedia[i].getBoundingClientRect();
  T.R1=detailMedia[i].getBoundingClientRect();
  const html=homeMedia[i].outerHTML;        // capture BEFORE hiding, or the flyer inherits visibility:hidden
  homeMedia[i].style.visibility="hidden";
  detailMedia[i].style.opacity="0";
  const fl=document.createElement("div"); fl.className="flyer"; fl.innerHTML=html;
  fl.setAttribute('aria-hidden','true');
  Object.assign(fl.style,{left:T.R1.left+"px",top:T.R1.top+"px",width:T.R1.width+"px",height:T.R1.height+"px",transformOrigin:"top left"});
  document.body.appendChild(fl); T.flyer=fl;
  homeEl.inert=true; detailEl.inert=true;
  renderTransition(T.t);
}

function renderTransition(t){
  t=clamp(t,0,1); T.t=t;
  const {R0,R1,idx,flyer}=T;
  const l=lerp(R0.left,R1.left,t), tp=lerp(R0.top,R1.top,t);
  const sx=lerp(R0.width,R1.width,t)/R1.width, sy=lerp(R0.height,R1.height,t)/R1.height;
  flyer.style.transform=`translate(${l-R1.left}px,${tp-R1.top}px) scale(${sx},${sy})`;
  const vw=home.vw||innerWidth;
  for(let j=0;j<cards.length;j++){
    if(j===idx){ cards[j].style.transform=""; continue; }
    const dir=j<idx?-1:1;                      // left neighbours slide left, right neighbours slide right
    cards[j].style.transform=`translateX(${dir*vw*0.9*t}px)`;
  }
  homeEl.style.opacity=String(1-t);
  detailEl.style.opacity=String(t);
  if(captions[idx]) captions[idx].style.opacity=String(clamp((t-1/3)/(2/3),0,1));
}

function finalizeTransition(target){
  const i=T.idx;
  if(captions[i]) captions[i].style.removeProperty('opacity');
  for(const c of cards) c.style.transform="";
  if(target>=1){
    detailMedia[i].style.opacity="1";
    homeMedia[i].style.visibility="visible";
    homeEl.style.display="none"; homeEl.style.opacity="1";
    detailEl.style.display="block"; detailEl.style.opacity="1";
    backBtn.setAttribute("aria-label","Back to photos");
    homeEl.inert=true; detailEl.inert=false;
    if(restoreKeyboardFocus) backBtn.focus({preventScroll:true});
    view="detail"; detail.active=true;
  } else {
    homeMedia[i].style.visibility="visible";
    detailMedia[i].style.opacity="1";
    detailEl.style.display="none"; detailEl.style.opacity="1";
    homeEl.style.display="block"; homeEl.style.opacity="1";
    backBtn.setAttribute("aria-label","Back to home");
    homeEl.inert=false; detailEl.inert=true;
    if(restoreKeyboardFocus) links[i].focus({preventScroll:true});
    view="home"; home.active=true;
  }
  if(T.flyer){ T.flyer.remove(); T.flyer=null; }
  T.active=false; T.settling=false;
}

function settleTransition(target){
  if(!T.active) return;
  T.settling=true;
  const generation=++settleGeneration;
  if(reduce){ renderTransition(target); finalizeTransition(target); return; }
  const start=T.t, distance=target-start;
  const duration=Math.max(180,Math.abs(distance)*420);
  const started=performance.now();
  function step(now){
    if(!T.active || !T.settling || generation!==settleGeneration) return;
    const progress=Math.min(1,(now-started)/duration);
    const eased=1-Math.pow(1-progress,3);
    if(progress>=1){
      renderTransition(target); finalizeTransition(target); return;
    }
    renderTransition(start+distance*eased); requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

let settleGeneration=0;

function openTo(i,fromKeyboard=false){
  if(view!=="home") return;
  restoreKeyboardFocus=fromKeyboard;
  beginTransition(i,1); settleTransition(1);
}
function closeNow(){ if(view==="detail"){ beginTransition(curDetail(),-1); settleTransition(0); } }

/* One back control: return to the rail, then to the homepage. */
backBtn.addEventListener('click',e=>{
  if(view==='home') return;
  e.preventDefault();
  if(T.active) settleTransition(0);
  else closeNow();
});
links.forEach((link,i)=>{
  link.addEventListener('click',e=>{
    if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
    e.preventDefault();
    if(!suppressClick) openTo(i,e.detail===0);
    suppressClick=false;
  });
  link.addEventListener('keydown',e=>{
    if(e.key===' '){ e.preventDefault(); openTo(i,true); }
  });
  link.addEventListener('focus',()=>{
    if(view!=='home') return;
    const rect=link.getBoundingClientRect();
    if(rect.left<0||rect.right>innerWidth){
      home.target=clamp(cards[i].offsetLeft+cards[i].offsetWidth/2-home.vw/2,0,home.max);
    }
  });
});
railTrack.addEventListener('dragstart',e=>e.preventDefault());
// Keyboard focus must use the animated track instead of scrolling its clipped parent.
document.getElementById('rail').addEventListener('scroll',e=>{ e.currentTarget.scrollLeft=0; });
document.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey) return;
  if(e.key==='Escape'){
    if(T.active) settleTransition(0);
    else closeNow();
    return;
  }
  if(T.active||!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
  e.preventDefault();
  const scroller=view==='detail'?detail:home;
  if(e.key==='Home') scroller.target=0;
  else if(e.key==='End') scroller.target=scroller.max;
  else scroller.target=clamp(scroller.target+(e.key==='ArrowRight'?1:-1)*scroller.vw*(view==='detail'?1:0.6),0,scroller.max);
  if(view==='detail') detail.snapPage();
});
addEventListener('resize',()=>{
  if(T.active) finalizeTransition(T.dir>0?1:0);
  const i=curDetail();
  home.metrics(); detail.metrics();
  home.setInstant(home.target);
  if(view==='detail') detail.setInstant(i*detail.vw);
});

/* The template's circular cursor, only enabled for a fine mouse pointer. */
const cursor=document.getElementById('cursor');
const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
let cx=0,cy=0,mx=0,my=0,scale=1,hovering=false,pressing=false,cursorFrame=0;
function drawCursor(){
  const target=(hovering?0.5:1)*(pressing?0.9:1);
  cx=reduce?mx:lerp(cx,mx,0.3); cy=reduce?my:lerp(cy,my,0.3);
  scale=reduce?target:lerp(scale,target,0.2);
  cursor.style.transform=`translate3d(${cx}px,${cy}px,0) scale(${scale})`;
  cursorFrame=0;
  if(Math.abs(mx-cx)>0.05||Math.abs(my-cy)>0.05||Math.abs(target-scale)>0.001) wakeCursor();
}
function wakeCursor(){ if(!cursorFrame) cursorFrame=requestAnimationFrame(drawCursor); }
function hideCursor(){
  document.documentElement.classList.remove('custom-cursor');
  cursor.style.opacity='0'; pressing=false;
}
addEventListener('pointermove',e=>{
  if(!finePointer.matches||e.pointerType!=='mouse'){ hideCursor(); return; }
  mx=e.clientX; my=e.clientY;
  if(!document.documentElement.classList.contains('custom-cursor')){ cx=mx; cy=my; }
  document.documentElement.classList.add('custom-cursor');
  cursor.style.opacity='1';
  hovering=!!e.target.closest('a,button,video');
  wakeCursor();
},{passive:true});
addEventListener('pointerdown',()=>{ pressing=true; wakeCursor(); });
addEventListener('pointerup',()=>{ pressing=false; wakeCursor(); });
document.addEventListener('pointerover',e=>{
  hovering=!!e.target.closest('a,button,video'); wakeCursor();
},{passive:true});
document.addEventListener('pointerout',e=>{
  hovering=!!e.relatedTarget?.closest?.('a,button,video'); wakeCursor();
},{passive:true});
document.addEventListener('mouseleave',hideCursor);
addEventListener('blur',hideCursor);
finePointer.addEventListener('change',hideCursor);
document.documentElement.classList.add('gallery-ready');
})();
