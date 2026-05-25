/* ===== state ===== */
const MEMORY_KEY="sati-progress-v1";
function readMemory(){
  try{
    const box=window.name?JSON.parse(window.name):{};
    return box[MEMORY_KEY]||null;
  }catch(_){
    return window.__SATI_MEMORY_STORE__||null;
  }
}
function writeMemory(data){
  try{
    const box=window.name?JSON.parse(window.name):{};
    box[MEMORY_KEY]=data;
    window.name=JSON.stringify(box);
  }catch(_){
    try{
      window.name=JSON.stringify({[MEMORY_KEY]:data});
    }catch(__){
      window.__SATI_MEMORY_STORE__=data;
    }
  }
}
/*
  Sandbox note:
  ตอนนี้ใช้หน่วยความจำของ browsing context เพื่อให้ demo รอด refresh
  โดยไม่ต้องพึ่ง localStorage. ถ้ารันจริง ให้เปลี่ยน readMemory/writeMemory
  ตรงนี้เป็น localStorage หรือ backend account storage.
*/
const savedProgress=readMemory()||{};
function freshMissionsDone(){
  return {m1:false,m2:false,m3:false};
}
const app={
  mode:"normal", state:"normal", stateLocked:false,
  sit:0, backMs:0, distMs:0, recMs:0, last:performance.now(), modeStart:performance.now(),
  ang:15, dist:60, postureClass:"normal",
  movementMs:0, movementRewarded:false,
  distanceGoodMs:0, distanceTotalMs:0,
  gp:savedProgress.gp??120,
  coins:savedProgress.coins??80,
  stage:savedProgress.stage??1,
  stretchIdx:savedProgress.stretchIdx??0,
  breaks:savedProgress.breaks??0,
  bestGoodSec:savedProgress.bestGoodSec??0,
  missionsDone:{...freshMissionsDone(),...(savedProgress.missionsDone||{})}
};
const STAGES=[
  {name:"🌰 Seed", at:0, next:100},
  {name:"🌱 Sprout", at:100, next:300},
  {name:"🪴 Seedling", at:300, next:700},
  {name:"🌿 Plant", at:700, next:1500},
  {name:"🌳 Flourishing", at:1500, next:1500}
];
const stretches=[
  {t:"ยืดคอด้านข้าง", c:"เอียงศีรษะไปด้านข้างค้างไว้ 15 วินาที สลับซ้าย-ขวา"},
  {t:"หมุนไหล่", c:"หมุนไหล่ช้าๆ ไปหน้า-หลัง อย่างละ 8 ครั้ง"},
  {t:"ยืดหลังส่วนบน", c:"ประสานมือไปข้างหน้า ยืดแขนและหลังส่วนบน 15 วินาที"}
];
/* thresholds (demo speed) */
const T={warnDeg:20,badDeg:40,closeCm:45,warnMs:3000,closeWarnMs:800,actMs:8200,closeActMs:5200,recMs:1300,longSit:80,moveBreakMs:5000,goodGpMs:300000};

/* ===== onboarding ===== */
const steps=[
  {e:"🌱",h:"ยินดีต้อนรับสู่ Sati",p:"โค้ชท่านั่งที่ช่วยให้คุณทำงานอย่างมีสุขภาวะ มาดูกันว่ามันทำงานยังไงใน 30 วินาที"},
  {e:"📡",h:"เซนเซอร์จริง 3 ตัว",p:"Sati วัดมุมหลัง ระยะหน้าจอ และการเคลื่อนไหวจากเซนเซอร์จริง — ไม่ใช่ค่าที่กดเอง ดูได้ที่แผง Live Signals ด้านขวา"},
  {e:"🌳",h:"ต้นไม้โตจากพฤติกรรมจริง",p:"นั่งท่าดี พักตามเตือน = ต้นไม้สะสมแต้มและเติบโต คุณโกงไม่ได้ เพราะเซนเซอร์รู้ความจริง"},
  {e:"🎯",h:"ทำภารกิจ รับเหรียญ",p:"ภารกิจรายวันให้เหรียญ Sati เอาไปแต่งต้นไม้ในร้านค้าได้ — ไม่ใช้เงินจริง ใช้พฤติกรรมดีแลก"},
  {e:"▶️",h:"ลองเล่นเลย!",p:"กดปุ่ม 'นั่งงอหลัง' ด้านล่าง แล้วดูต้นไม้เปลี่ยนอารมณ์ + ระบบเตือนให้พัก ลองเลย!"}
];
let gi=0;
const G={wrap:document.getElementById("guide"),emoji:document.getElementById("gEmoji"),step:document.getElementById("gStep"),
  h:document.getElementById("gH"),p:document.getElementById("gP"),dots:document.getElementById("gDots"),
  back:document.getElementById("gBack"),next:document.getElementById("gNext"),skip:document.getElementById("guideSkip")};
function renderGuide(){
  const s=steps[gi];
  G.emoji.textContent=s.e; G.h.textContent=s.h; G.p.textContent=s.p;
  G.step.textContent=`ขั้นที่ ${gi+1} / ${steps.length}`;
  G.dots.innerHTML=steps.map((_,i)=>`<i class="${i===gi?'on':''}"></i>`).join("");
  G.back.style.visibility=gi===0?"hidden":"visible";
  G.next.textContent=gi===steps.length-1?"เริ่มใช้งาน ✓":"ถัดไป →";
}
G.next.onclick=()=>{ if(gi<steps.length-1){gi++;renderGuide();} else closeGuide(); };
G.back.onclick=()=>{ if(gi>0){gi--;renderGuide();} };
G.skip.onclick=closeGuide;
function closeGuide(){ G.wrap.classList.remove("show"); }
renderGuide();

/* ===== view tabs ===== */
const tabs=[...document.querySelectorAll(".tab[data-view]")];
const panels=[...document.querySelectorAll(".view-panel")];
function switchView(view){
  tabs.forEach(tab=>{
    const active=tab.dataset.view===view;
    tab.classList.toggle("active",active);
    tab.setAttribute("aria-selected",String(active));
  });
  panels.forEach(panel=>{
    panel.hidden=panel.id!==`view-${view}`;
  });
  if(view==="insights") renderInsights();
  if(view==="hr") renderHrDashboard();
}
tabs.forEach((tab,idx)=>{
  tab.onclick=()=>switchView(tab.dataset.view);
  tab.onkeydown=e=>{
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key)) return;
    e.preventDefault();
    let next=idx;
    if(e.key==="ArrowRight") next=(idx+1)%tabs.length;
    if(e.key==="ArrowLeft") next=(idx-1+tabs.length)%tabs.length;
    if(e.key==="Home") next=0;
    if(e.key==="End") next=tabs.length-1;
    tabs[next].focus();
    switchView(tabs[next].dataset.view);
  };
});

/* ===== shop ===== */
const SHOP=[
  {id:"pot1",e:"🪴",nm:"กระถางเซรามิก",price:50},
  {id:"pot2",e:"🏺",nm:"กระถางลายเบญจรงค์",price:120},
  {id:"flower",e:"🌸",nm:"ดอกไม้สีชมพู",price:100},
  {id:"sun",e:"☀️",nm:"แสงอุ่น",price:80},
  {id:"butterfly",e:"🦋",nm:"ผีเสื้อ",price:150},
  {id:"lantern",e:"🏮",nm:"โคมไฟไทย",price:180},
  {id:"star",e:"⭐",nm:"ดาวประดับ",price:90},
  {id:"glow",e:"✨",nm:"ต้นไม้เรืองแสง",price:300}
];
const owned=new Set(savedProgress.owned||[]);
let placedDecorations=[...(savedProgress.decorations||[])];
const S={wrap:document.getElementById("shop"),grid:document.getElementById("shopGrid"),coins:document.getElementById("shopCoins"),
  open:document.getElementById("shopBtn"),close:document.getElementById("shopClose"),dim:document.getElementById("shopDim"),deco:document.getElementById("deco")};
let lastSaved="";
function saveProgress(){
  const data={
    gp:app.gp,
    coins:app.coins,
    stage:app.stage,
    stretchIdx:app.stretchIdx,
    breaks:app.breaks,
    bestGoodSec:app.bestGoodSec,
    missionsDone:app.missionsDone,
    owned:[...owned],
    decorations:placedDecorations
  };
  const next=JSON.stringify(data);
  if(next!==lastSaved){
    writeMemory(data);
    lastSaved=next;
  }
}
function renderShop(){
  S.coins.textContent=app.coins;
  S.grid.innerHTML=SHOP.map(it=>{
    const has=owned.has(it.id);
    const can=app.coins>=it.price;
    return `<div class="item ${has?'owned':''}">
      <div class="emoji">${it.e}</div><div class="nm">${it.nm}</div>
      <div class="price"><span class="c">¢</span>${it.price}</div>
      <button class="buy" data-id="${it.id}" aria-label="${has?'Owned':(can?'Buy':'Not enough coins')} ${it.nm}" ${has?'disabled':(can?'':'disabled')}>${has?'มีแล้ว ✓':(can?'ซื้อ':'เหรียญไม่พอ')}</button>
    </div>`;
  }).join("");
  S.grid.querySelectorAll(".buy").forEach(b=>{
    b.onclick=()=>{
      const it=SHOP.find(x=>x.id===b.dataset.id);
      if(owned.has(it.id)||app.coins<it.price) return;
      app.coins-=it.price; owned.add(it.id);
      placeDeco(it.e); renderShop(); renderWallet();
      toast(`ได้ ${it.nm} แล้ว! 🎉`);
    };
  });
}
let decoCount=0;
function placeDeco(emoji,shouldSave=true){
  const positions=[[70,120],[250,120],[60,210],[260,210],[160,90]];
  const [x,y]=positions[decoCount%positions.length]; decoCount++;
  const t=document.createElementNS("http://www.w3.org/2000/svg","text");
  t.setAttribute("x",x); t.setAttribute("y",y); t.setAttribute("font-size","30"); t.setAttribute("text-anchor","middle");
  t.textContent=emoji; S.deco.appendChild(t);
  if(shouldSave){
    placedDecorations.push(emoji);
    saveProgress();
  }
}
placedDecorations.forEach(emoji=>placeDeco(emoji,false));
function openShop(){
  renderShop();
  S.wrap.classList.add("show");
  S.close.focus();
}
function closeShop(){
  S.wrap.classList.remove("show");
  S.open.focus();
}
S.open.onclick=openShop;
S.close.onclick=closeShop;
S.dim.onclick=closeShop;
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape") return;
  if(S.wrap.classList.contains("show")) closeShop();
  if(G.wrap.classList.contains("show")) closeGuide();
});

/* ===== toast ===== */
let toastTimer;
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2200);}

/* ===== demo buttons ===== */
document.querySelectorAll(".btn[data-mode]").forEach(b=>{
  b.onclick=()=>{
    app.mode=b.dataset.mode; app.modeStart=performance.now();
    app.backMs=0;app.distMs=0;app.recMs=0;app.stateLocked=false;
    if(b.dataset.mode==="normal"){app.sit=0;app.state="normal";}
    if(b.dataset.mode==="long"){app.sit=T.longSit-26;}
    document.querySelectorAll(".btn[data-mode]").forEach(x=>x.classList.toggle("active",x===b));
  };
});
document.getElementById("acDone").onclick=()=>{
  app.gp+=10; app.breaks+=1; addBreakReward(); app.state="normal";app.stateLocked=false;app.mode="normal";
  app.sit=0;app.backMs=0;app.distMs=0;app.recMs=0;app.ang=15;app.dist=60;app.modeStart=performance.now();
  app.stretchIdx=(app.stretchIdx+1)%stretches.length;
  document.querySelectorAll(".btn[data-mode]").forEach(x=>x.classList.toggle("active",x.dataset.mode==="normal"));
  saveProgress();
  toast("ทำท่ายืดเหยียดสำเร็จ · +10 GP 🌿");
  checkMissions();
};
document.getElementById("resetBtn").onclick=()=>{
  app.gp=120;app.coins=80;app.stage=1;app.sit=0;app.state="normal";app.stateLocked=false;app.mode="normal";
  app.ang=15;app.dist=60;app.backMs=0;app.distMs=0;app.recMs=0;app.modeStart=performance.now();
  app.breaks=0;app.bestGoodSec=0;app.goodRun=0;app.goodAcc=0;app.movementMs=0;app.movementRewarded=false;
  app.distanceGoodMs=0;app.distanceTotalMs=0;app.missionsDone=freshMissionsDone();behaviorLog.length=0;
  owned.clear();placedDecorations=[];S.deco.innerHTML="";decoCount=0;
  document.querySelectorAll(".btn[data-mode]").forEach(x=>x.classList.toggle("active",x.dataset.mode==="normal"));
  renderMissions();
  saveProgress();render();
  toast("รีเซ็ตเดโมแล้ว ↻");
};
let breakAwarded=false;
function addBreakReward(){ if(!breakAwarded){ app.coins+=15; saveProgress(); breakAwarded=true; setTimeout(()=>breakAwarded=false,3000);} }

/* ===== mission tracking ===== */
function missionReward(id){
  const el=document.getElementById(id);
  return Number(el?.dataset.reward)||0;
}
function missionName(id){
  return document.getElementById(id)?.querySelector(".m-name")?.textContent||id;
}
function renderMissions(){
  Object.entries(app.missionsDone).forEach(([id,done])=>{
    const el=document.getElementById(id);
    if(el) el.classList.toggle("done",done);
  });
}
function completeMission(id){
  if(app.missionsDone[id]) return;
  const reward=missionReward(id);
  app.missionsDone[id]=true;
  app.coins+=reward;
  renderMissions();
  renderWallet();
  if(S.wrap.classList.contains("show")) renderShop();
  saveProgress();
  toast(`ภารกิจสำเร็จ: ${missionName(id)} · +${reward} coins`);
}
function trackDistanceMission(dt){
  app.distanceTotalMs+=dt;
  if(app.dist>=T.closeCm) app.distanceGoodMs+=dt;
}
function checkMissions(){
  if(app.breaks>=3) completeMission("m1");
  if(app.bestGoodSec*1000>=T.goodGpMs) completeMission("m2");
  const distanceGoodRatio=app.distanceTotalMs?app.distanceGoodMs/app.distanceTotalMs:0;
  if(distanceGoodRatio>=.8) completeMission("m3");
}

/* ===== behavior log + insights ===== */
const behaviorLog=[];
let logAcc=0;
function periodName(hour){
  if(hour>=12&&hour<17) return "ช่วงบ่าย";
  if(hour>=17) return "ช่วงเย็น";
  return "ช่วงเช้า";
}
function recordBehavior(dt){
  logAcc+=dt;
  if(logAcc<2000) return;
  logAcc=0;
  const hour=new Date().getHours();
  behaviorLog.push({
    hour,
    period:periodName(hour),
    state:app.state,
    angle:app.ang,
    distance:app.dist
  });
  if(behaviorLog.length>240) behaviorLog.shift();
}
function mostCuePeriod(){
  const buckets={"ช่วงเช้า":0,"ช่วงบ่าย":0,"ช่วงเย็น":0};
  behaviorLog.forEach(row=>{
    if(row.angle>T.warnDeg||row.state!=="normal") buckets[row.period]+=1;
  });
  return Object.entries(buckets).sort((a,b)=>b[1]-a[1])[0];
}
function renderInsights(){
  if(!E("insightPattern")) return;
  const total=behaviorLog.length;
  const [topPeriod,topCount]=mostCuePeriod();
  const goodCount=behaviorLog.filter(row=>row.state==="normal").length;
  const goodPct=total?Math.round((goodCount/total)*100):0;
  const avgDist=total?Math.round(behaviorLog.reduce((sum,row)=>sum+row.distance,0)/total):Math.round(app.dist);
  E("logCount").textContent=`${total} logs`;
  E("insightPattern").textContent=topCount>0?`${topPeriod}คุณมักนั่งงอหลังมากสุด`:"วันนี้ยังไม่เห็น pattern ท่านั่งที่ต้องปรับเป็นพิเศษ";
  E("insightPatternCopy").textContent=topCount>0?`พบ ${topCount} ช่วง log ที่หลังเริ่มงอหรือ state เปลี่ยนจากปกติ`:"ข้อมูลยังนุ่มอยู่ Sati จะค่อย ๆ สรุปเมื่อมี log มากขึ้น";
  E("insightBreaks").textContent=`วันนี้พัก ${app.breaks} ครั้ง`;
  E("insightFocus").textContent=app.bestGoodSec>0?`ท่าดีต่อเนื่องยาวสุด ${fmt(app.bestGoodSec)}`:`ท่าดีใน log ตอนนี้ ${goodPct}%`;
  E("insightFocusCopy").textContent=`สัดส่วน state ปกติจาก log ล่าสุดอยู่ที่ ${goodPct}%`;
  E("insightDistance").textContent=`ระยะหน้าจอเฉลี่ย ${avgDist} cm`;
  E("insightDistanceCopy").textContent=avgDist<T.closeCm?"มีบางช่วงที่คุณขยับเข้าใกล้หน้าจอ ลองเว้นระยะเพิ่มเล็กน้อย":"ระยะจาก ToF อยู่ในโซนสบายเป็นส่วนใหญ่";
}

/* ===== anonymized HR aggregate mock ===== */
const teamAggregate={
  goodPct:78,
  tiredWindow:"15:00–16:00",
  breaks:24,
  devices:18
};
function renderHrDashboard(){
  if(!E("hrGoodPct")) return;
  E("hrGoodPct").textContent=`${teamAggregate.goodPct}%`;
  E("hrGoodBar").style.width=`${teamAggregate.goodPct}%`;
  E("hrTiredWindow").textContent=teamAggregate.tiredWindow;
  E("hrBreaks").textContent=`${teamAggregate.breaks} ครั้ง`;
  E("hrDevices").textContent=`${teamAggregate.devices} devices`;
}

/* ===== Arduino UNO Q WebSocket ===== */
const SENSOR_WS_URL="ws://127.0.0.1:8765";
const sensor={
  source:"mock",
  status:"connecting",
  ws:null,
  reconnectTimer:null,
  lastMessage:0
};
function normalizePostureClass(value){
  return String(value||"normal").trim().toLowerCase().replace(/_/g,"-");
}
function updateSensorStatus(){
  const el=E("sensorStatus");
  if(!el) return;
  const live=sensor.source==="ws";
  el.classList.toggle("live",live);
  el.innerHTML=`<span></span>${live?"Arduino WebSocket: live":"Arduino WebSocket: mock fallback"}`;
  E("sourceStat").textContent=live?"Arduino live":"Mock fallback";
  document.querySelectorAll(".btn[data-mode]").forEach(btn=>{
    btn.disabled=live;
    btn.setAttribute("aria-disabled",String(live));
  });
}
function applySensorData(data){
  const backAngle=Number(data.backAngle);
  const screenDistance=Number(data.screenDistance);
  if(Number.isFinite(backAngle)) app.ang=backAngle;
  if(Number.isFinite(screenDistance)) app.dist=screenDistance;
  const posture=normalizePostureClass(data.postureClass);
  app.postureClass=posture==="movement"?"movement":posture;
  if((app.postureClass==="slouch"||app.postureClass==="hunched")&&app.ang<=T.warnDeg) app.ang=T.warnDeg+8;
  if(app.postureClass.includes("close")&&app.dist>=T.closeCm) app.dist=T.closeCm-6;
  sensor.lastMessage=performance.now();
}
function scheduleReconnect(){
  clearTimeout(sensor.reconnectTimer);
  sensor.reconnectTimer=setTimeout(connectSensor,3000);
}
function connectSensor(){
  if(!("WebSocket" in window)){
    sensor.source="mock";
    sensor.status="mock";
    updateSensorStatus();
    return;
  }
  clearTimeout(sensor.reconnectTimer);
  sensor.status="connecting";
  updateSensorStatus();
  try{
    const ws=new WebSocket(SENSOR_WS_URL);
    sensor.ws=ws;
    ws.onopen=()=>{
      sensor.source="ws";
      sensor.status="live";
      sensor.lastMessage=performance.now();
      updateSensorStatus();
    };
    ws.onmessage=event=>{
      try{
        applySensorData(JSON.parse(event.data));
      }catch(_){
        sensor.source="mock";
        updateSensorStatus();
      }
    };
    ws.onclose=()=>{
      if(sensor.ws!==ws) return;
      sensor.source="mock";
      sensor.status="mock";
      updateSensorStatus();
      scheduleReconnect();
    };
    ws.onerror=()=>ws.close();
  }catch(_){
    sensor.source="mock";
    sensor.status="mock";
    updateSensorStatus();
    scheduleReconnect();
  }
}

/* ===== mock sensors (always run) ===== */
function mock(dt,now){
  const sec=(now-app.modeStart)/1000, w=Math.sin(now/900);
  if(app.mode==="normal"){app.ang=15+w*1.4;app.dist=60+Math.sin(now/1100)*2;app.postureClass="normal";app.sit+=dt/1000;}
  else if(app.mode==="slouch"){app.ang=(sec>8.4?45:32)+w*1.2;app.dist=60+Math.sin(now/1200)*1.5;app.postureClass="slouch";app.sit+=dt/1000;}
  else if(app.mode==="long"){app.ang=15+w;app.dist=61+Math.sin(now/1000)*1.5;app.postureClass="long-sitting";app.sit+=(dt/1000)*7;}
}
/* ===== state machine ===== */
function machine(dt){
  const movementCue=app.postureClass==="movement";
  if(movementCue){
    app.movementMs+=dt;
  }else{
    app.movementMs=0;
    app.movementRewarded=false;
  }
  if(app.movementMs>=T.moveBreakMs){
    if(!app.movementRewarded){
      app.gp+=15;
      app.breaks+=1;
      app.movementRewarded=true;
      saveProgress();
      toast("ลุกพักสำเร็จ · +15 GP 🌿");
    }
    app.state="normal";
    app.stateLocked=false;
    app.backMs=0;app.distMs=0;app.recMs=T.recMs;app.sit=0;
    app.goodRun=0;app.goodAcc=0;
    return;
  }
  const backCue=app.ang>T.warnDeg, distCue=app.dist<T.closeCm, longSit=app.sit>=T.longSit;
  app.backMs=backCue?app.backMs+dt:0;
  app.distMs=distCue?app.distMs+dt:0;
  const anyCue=backCue||distCue||longSit||movementCue;
  app.recMs=anyCue?0:app.recMs+dt;
  /* award GP for sustained good posture */
  if(!anyCue){
    app.goodRun=(app.goodRun||0)+dt/1000;
    app.bestGoodSec=Math.max(app.bestGoodSec,app.goodRun);
    app.goodAcc=(app.goodAcc||0)+dt;
    if(app.goodAcc>=T.goodGpMs){app.gp+=20;app.goodAcc=0;saveProgress();toast("นั่งท่าดีครบ 5 นาที · +20 GP 🌱");}
  }else{
    app.goodRun=0;
    app.goodAcc=0;
  }
  const warnReady=app.backMs>=T.warnMs||app.distMs>=T.closeWarnMs;
  const actReady=app.backMs>=T.actMs||app.distMs>=T.closeActMs||longSit;
  if(app.state==="action"){app.stateLocked=true;return;}
  if(actReady)app.state="action";
  else if(warnReady)app.state="warning";
  else if(app.recMs>=T.recMs)app.state="normal";
}
/* ===== render ===== */
const E=id=>document.getElementById(id);
let previousWallet={gp:app.gp,coins:app.coins};
function pulse(id,cls="gain-pop"){
  const el=E(id);
  if(!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
const copy={
  normal:{txt:"NORMAL — ต้นไม้ของคุณแข็งแรงดี",cue:"wellness cue / ปกติ"},
  warning:{txt:"WARNING — ปรับท่านั่งหน่อยนะ",cue:"wellness cue / เตือน"},
  action:{txt:"ACTION — ได้เวลาพักและยืดเส้น",cue:"wellness cue / แนะนำ"}
};
function angStat(a){return a>T.badDeg?"Deep bend":a>T.warnDeg?"Adjust":"Good";}
function fmt(s){return String(Math.floor(s/60)).padStart(2,"0")+":"+String(Math.floor(s%60)).padStart(2,"0");}
function face(){
  if(app.state==="normal"){E("mouth").setAttribute("d","M141 190 C151 206 172 206 181 190");E("browL").setAttribute("opacity","0");E("browR").setAttribute("opacity","0");}
  else if(app.state==="warning"){E("mouth").setAttribute("d","M147 195 C154 188 168 188 175 195");E("browL").setAttribute("d","M134 152 C141 149 148 150 154 155");E("browR").setAttribute("d","M166 155 C172 149 179 149 186 152");E("browL").setAttribute("opacity",".9");E("browR").setAttribute("opacity",".9");}
  else{E("mouth").setAttribute("d","M143 202 C151 192 170 192 179 202");E("browL").setAttribute("d","M134 155 C141 148 149 148 156 154");E("browR").setAttribute("d","M164 154 C171 148 179 148 186 155");E("browL").setAttribute("opacity","1");E("browR").setAttribute("opacity","1");}
}
function renderWallet(){
  E("gpVal").textContent=app.gp;E("coinVal").textContent=app.coins;
  if(previousWallet.gp!==app.gp) pulse("gpChip");
  if(previousWallet.coins!==app.coins) pulse("coinChip");
  previousWallet={gp:app.gp,coins:app.coins};
}
function updateStage(){
  let st=0; for(let i=0;i<STAGES.length;i++){ if(app.gp>=STAGES[i].at) st=i; }
  if(st>app.stage){ app.stage=st; pulse("growthCard","level-pop"); toast(`ต้นไม้เลื่อนขั้นเป็น ${STAGES[st].name}! 🎉`); }
  app.stage=st;
  E("stageName").textContent=STAGES[st].name;
  const cur=STAGES[st], span=cur.next-cur.at, prog=Math.min(1,(app.gp-cur.at)/Math.max(span,1));
  E("gbarFill").style.width=(st===STAGES.length-1?100:Math.round(prog*100))+"%";
  E("gpProgress").textContent=st===STAGES.length-1?`${app.gp} GP · MAX`:`${app.gp} / ${cur.next} GP`;
  document.querySelectorAll("#stageTrack span").forEach(s=>s.classList.toggle("on",+s.dataset.st<=st));
}
function render(){
  document.body.className="s-"+app.state;
  E("stateTxt").textContent=copy[app.state].txt;
  E("cueTxt").textContent=copy[app.state].cue;
  const a=Math.round(app.ang),d=Math.round(app.dist);
  E("angVal").textContent=a;E("angStat").textContent=angStat(a);
  E("distVal").textContent=d;E("distStat").textContent=d<T.closeCm?"Too Close":"Good";
  E("postureVal").textContent=app.postureClass;
  E("sitVal").textContent=fmt(app.sit);E("sitStat").textContent=app.sit>=T.longSit?"Take a break":"Counting";
  const s=stretches[app.stretchIdx];E("acTitle").textContent=s.t;E("acCopy").textContent=s.c;
  face();renderWallet();updateStage();saveProgress();
  renderMissions();
  if(!E("view-insights").hidden) renderInsights();
  if(!E("view-hr").hidden) renderHrDashboard();
}
function tick(){
  const now=performance.now(),dt=Math.min(now-app.last,1000);app.last=now;
  if(sensor.source==="ws"){
    app.sit+=dt/1000;
    if(sensor.lastMessage&&now-sensor.lastMessage>5000){
      sensor.ws?.close();
      sensor.source="mock";
      updateSensorStatus();
      scheduleReconnect();
    }
  }else{
    mock(dt,now);
  }
  trackDistanceMission(dt);machine(dt);checkMissions();recordBehavior(dt);render();
}
render();connectSensor();setInterval(tick,250);
