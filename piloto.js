/* Flota Corporativa · app del piloto v2.0: kilometraje semanal y reporte de fallas */
"use strict";
const API = (window.FC_CONFIG && window.FC_CONFIG.API_URL) || "";
const TIPOS_FALLA = ["Motor","Frenos","Llantas / pinchazo","Luces / eléctrico","Batería","Golpe / accidente","Testigo en el tablero","Otro"];
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
const esc = s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n=>n==null||n===""||isNaN(n)?"—":Number(n).toLocaleString("es-GT");
const ls = { get(k){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):null; }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }, del(k){ try{ localStorage.removeItem(k); }catch(e){} } };

/* cola sin señal (IndexedDB) */
let _db=null;
function idb(){ if(_db) return Promise.resolve(_db); return new Promise((res,rej)=>{ if(!window.indexedDB) return rej(new Error("sin IndexedDB"));
  const r=indexedDB.open("flota-piloto",1); r.onupgradeneeded=()=>r.result.createObjectStore("cola",{keyPath:"id"}); r.onsuccess=()=>{_db=r.result;res(_db);}; r.onerror=()=>rej(r.error); }); }
async function q(mode,fn){ try{ const db=await idb(); return await new Promise((res,rej)=>{ const tx=db.transaction("cola",mode); const o=fn(tx.objectStore("cola")); tx.oncomplete=()=>res(o&&o.result); tx.onerror=()=>rej(tx.error); }); }catch(e){ return undefined; } }
const cola={ put:x=>q("readwrite",s=>s.put(x)), del:id=>q("readwrite",s=>s.delete(id)), all:()=>q("readonly",s=>s.getAll()).then(x=>x||[]) };

async function api(action,payload={}){
  if(!API) throw new Error("Falta configurar la dirección del servidor (config.js).");
  let r; try{ r=await fetch(API,{method:"POST",body:JSON.stringify(Object.assign({action,token:S.sess&&S.sess.token,piloto:1},payload))}); }
  catch(e){ const x=new Error("Sin conexión. Se enviará cuando haya señal."); x.offline=true; throw x; }
  let j; try{ j=await r.json(); }catch(e){ const x=new Error("Sin conexión. Se enviará cuando haya señal."); x.offline=true; throw x; }
  if(j.auth){ S.sess=null; ls.del("fp_sess"); render(); throw new Error(j.error); }
  if(!j.ok) throw new Error(j.error||"Error del servidor.");
  return j;
}

const S = { sess:ls.get("fp_sess"), emp:ls.get("fp_emp"), view:"home", msg:null, busy:false, f:null, k:null, res:null, mis:null, pend:0,
  login: Object.assign({placa:"",nombre:"",empresa:"",area:""}, ls.get("fp_login")||{}) };
if(S.sess && S.sess.exp<Date.now()){ S.sess=null; ls.del("fp_sess"); }

let _rendering=false,_again=false;
function render(){ if(_rendering){ _again=true; return; } _rendering=true; try{ renderNow(); } finally{ _rendering=false; } if(_again){ _again=false; setTimeout(render,0); } }
function renderNow(){
  const app=$("#app"), bar=$("#bar");
  $("#role").textContent = S.sess ? S.sess.veh.p : "Piloto";
  if(!S.sess){ app.innerHTML=vLogin(); bar.innerHTML=""; bLogin(); return; }
  const v={home:vHome,km:vKm,falla:vFalla,ok:vOk,mis:vMis}[S.view]; app.innerHTML=v(); ({home:bHome,km:bKm,falla:bFalla,ok:bOk,mis:bMis})[S.view]();
}
function msg(){ return S.msg?`<div class="banner ${S.msg.err?"off":"q"}">${esc(S.msg.t)}</div>`:""; }

/* ---------- ingreso ---------- */
function vLogin(){
  const L=S.login, emps=(S.emp||[]); const e=emps.find(x=>x.e===L.empresa);
  return `<div class="login stack screen"><div><div class="eyebrow">Flota Corporativa · Pilotos</div><h1>Ingresar</h1>
    <p class="muted small" style="margin:4px 0 0">Para reportar el kilometraje de los viernes o una falla.</p></div>
    <form class="card stack" id="fl">
      <label class="f" for="placa"><span>Placa del vehículo <b>*</b></span><input id="placa" class="pin" style="letter-spacing:.15em;text-transform:uppercase" autocomplete="off" placeholder="P123ABC" value="${esc(L.placa)}"></label>
      <label class="f" for="nombre"><span>Tu nombre y apellido <b>*</b></span><input id="nombre" type="text" autocomplete="name" value="${esc(L.nombre)}"></label>
      <div class="stack" style="gap:6px"><span class="small muted">Empresa <b class="err">*</b></span>
        ${emps.length?`<div class="chips">${emps.map(x=>`<button type="button" class="chipbtn" data-emp="${esc(x.e)}" aria-pressed="${L.empresa===x.e}">${esc(x.e)}</button>`).join("")}</div>`:`<span class="small muted"><span class="spinner"></span> Cargando…</span>`}</div>
      ${e?`<div class="stack" style="gap:6px"><span class="small muted">Área de trabajo <b class="err">*</b></span>
        <div class="chips">${e.a.map(a=>`<button type="button" class="chipbtn" data-area="${esc(a)}" aria-pressed="${L.area===a}">${esc(a)}</button>`).join("")}</div></div>`:""}
      ${S.msg?`<div class="err">${esc(S.msg.t)}</div>`:""}
      <button class="btn pri" type="submit" id="lbtn" ${S.busy?"disabled":""}>${S.busy?'<span class="spinner"></span> Verificando':"Ingresar"}</button>
    </form></div>`;
}
function bLogin(){
  const L=S.login;
  $("#placa").oninput=e=>{ L.placa=e.target.value.toUpperCase(); };
  $("#nombre").oninput=e=>{ L.nombre=e.target.value; };
  $$("[data-emp]").forEach(b=>b.onclick=()=>{ L.empresa=b.dataset.emp; L.area=""; render(); });
  $$("[data-area]").forEach(b=>b.onclick=()=>{ L.area=b.dataset.area; render(); });
  $("#fl").onsubmit=async ev=>{ ev.preventDefault(); L.placa=$("#placa").value.trim().toUpperCase(); L.nombre=$("#nombre").value.trim();
    if(!L.placa||!L.nombre||!L.empresa||!L.area){ S.msg={t:"Escribe la placa y tu nombre, y elige empresa y área.",err:1}; render(); return; }
    S.busy=true; S.msg=null; render();
    try{ const r=await api("pilotoLogin",L); S.sess=r; ls.set("fp_sess",r); ls.set("fp_login",L); S.busy=false; S.view="home"; render(); enviarPendientes(); }
    catch(e){ S.busy=false; S.msg={t:e.message,err:1}; render(); } };
}
async function cargarEmpresas(){ try{ const r=await api("pilotoCatalogo"); S.emp=r.empresas; ls.set("fp_emp",r.empresas); }catch(e){ if(!S.emp) S.msg={t:e.message,err:1}; } if(!S.sess) render(); }

/* ---------- inicio ---------- */
function esVentana(){ const d=new Date(), w=d.getDay(), h=d.getHours(); return w===5||w===6||w===0||(w===1&&h<9); }
function vHome(){
  const v=S.sess.veh;
  return `<div class="stack screen">${msg()}
    ${S.pend?`<div class="banner off">${S.pend} reporte${S.pend>1?"s":""} esperando señal para enviarse.</div>`:""}
    <div class="card stack"><div class="row" style="justify-content:space-between"><span class="plate" style="grid-row:auto">${esc(v.p)}</span><span class="small muted">${esc(v.m)} ${esc(v.l)} ${esc(v.a||"")}</span></div>
      <dl class="kv"><dt>Piloto</dt><dd>${esc(S.sess.nombre)}</dd><dt>Empresa / área</dt><dd>${esc(S.sess.empresa)} · ${esc(S.sess.area)}</dd>
      <dt>Último km</dt><dd>${fmt(v.ultKm??v.km)}${v.ult?` <span class="muted small">(${esc(v.ult.slice(0,10))})</span>`:""}</dd></dl></div>
    ${v.ck?`<button class="btn pri big" id="gkm" type="button">Reportar kilometraje<span>${esVentana()?"Hoy toca: del viernes al lunes 9:00":"Se reporta los viernes (hasta el lunes 9:00)"}</span></button>`
      :`<div class="note">Este vehículo aún no está en el control de kilometraje.</div>`}
    <button class="btn danger big" id="gfa" type="button">Reportar una falla<span>Con tu ubicación y fotos</span></button>
    <button class="btn sec" id="gmis" type="button">Mis reportes</button></div>`;
}
function bHome(){
  const k=$("#gkm"); if(k) k.onclick=()=>{ S.k={km:"",foto:null,obs:"",lat:null,lng:null,gps:"buscando"}; S.view="km"; S.msg=null; render(); gps(S.k); };
  $("#gfa").onclick=()=>{ S.f={tipo:"",desc:"",circula:null,grua:null,lat:null,lng:null,gps:"buscando",ubic:"",km:"",fotos:[]}; S.view="falla"; S.msg=null; render(); gps(S.f); };
  $("#gmis").onclick=async()=>{ S.view="mis"; S.mis=null; render(); try{ S.mis=await api("misReportes"); }catch(e){ S.msg={t:e.message,err:1}; } render(); };
  $("#bar").innerHTML=`<span class="progress" style="flex:1">v2.0</span><button class="btn sec" id="out" type="button">Cambiar vehículo</button>`;
  $("#out").onclick=()=>{ api("logout").catch(()=>{}); S.sess=null; ls.del("fp_sess"); render(); };
}
function gps(o){
  if(!navigator.geolocation){ o.gps="no"; return; }
  navigator.geolocation.getCurrentPosition(p=>{ o.lat=+p.coords.latitude.toFixed(6); o.lng=+p.coords.longitude.toFixed(6); o.gps="ok"; o.acc=Math.round(p.coords.accuracy); if(S.view!=="home") keepY(render); },
    ()=>{ o.gps="no"; if(S.view!=="home") keepY(render); }, {enableHighAccuracy:true,timeout:15000,maximumAge:60000});
}
function gpsTag(o){ return o.gps==="ok"?`<span class="chip ok">Ubicación lista (±${o.acc||"?"} m)</span>`:o.gps==="buscando"?`<span class="chip sem"><span class="spinner" style="width:12px;height:12px"></span> Buscando ubicación…</span>`:`<span class="chip venc">Sin ubicación</span>`; }
function keepY(fn){ const y=window.scrollY; fn(); window.scrollTo({top:y}); }

/* ---------- km ---------- */
function vKm(){
  const k=S.k, v=S.sess.veh, ant=v.ultKm??v.km, n=Number(k.km), rec=k.km!==""&&ant!=null?n-ant:null;
  return `<div class="stack screen"><div><div class="eyebrow">${esc(v.p)}</div><h1>Kilometraje</h1></div>${msg()}
    <div class="card stack"><label class="f" for="km"><span>Km del odómetro <b>*</b></span><input id="km" type="number" inputmode="numeric" min="0" class="pin" style="letter-spacing:.05em" value="${esc(k.km)}" placeholder="${ant!=null?"Anterior "+fmt(ant):""}"></label>
      ${rec!=null&&rec<0?`<div class="err">Es menor que el anterior (${fmt(ant)}). Revisa el odómetro.</div>`:rec!=null?`<div class="small muted">Recorrido desde el último reporte: <b>${fmt(rec)} km</b></div>`:""}
      <label class="ph req" style="aspect-ratio:4/3">${k.foto?`<img src="${k.foto}" alt="Odómetro">`:""}<input type="file" accept="image/*" capture="environment" id="fodo" aria-label="Foto del odómetro">
        <span class="lbl">Foto del odómetro *${k.foto?" ✓ (cambiar)":""}</span></label>
      <div class="row">${gpsTag(k)}</div>
      <label class="f" for="obs"><span>Comentario (opcional)</span><input id="obs" type="text" value="${esc(k.obs)}"></label></div></div>`;
}
function bKm(){
  const k=S.k;
  $("#km").oninput=e=>{ k.km=e.target.value; }; $("#km").onchange=()=>keepY(render);
  $("#obs").oninput=e=>{ k.obs=e.target.value; };
  $("#fodo").onchange=e=>readImg(e.target.files[0],u=>{ k.foto=u; keepY(render); });
  bar2("Enviar kilometraje", async()=>{
    const v=S.sess.veh, ant=v.ultKm??v.km;
    if(k.km===""||isNaN(Number(k.km))) return err("Escribe el kilometraje.");
    if(ant!=null&&Number(k.km)<ant) return err(`Es menor que el anterior (${fmt(ant)}).`);
    if(!k.foto) return err("Toma la foto del odómetro.");
    await enviar({tipo:"km", payload:{km:Number(k.km),foto:k.foto,lat:k.lat,lng:k.lng,obs:k.obs}});
  });
}

/* ---------- falla ---------- */
function vFalla(){
  const f=S.f, v=S.sess.veh;
  const yn=(key,lab)=>`<div class="stack" style="gap:6px"><span class="small muted">${lab} <b class="err">*</b></span><div class="seg" style="grid-template-columns:1fr 1fr">
    <button type="button" data-yn="${key}" data-v="1" aria-pressed="${f[key]===true}"><b>Sí</b></button><button type="button" data-yn="${key}" data-v="0" aria-pressed="${f[key]===false}"><b>No</b></button></div></div>`;
  return `<div class="stack screen"><div><div class="eyebrow">${esc(v.p)}</div><h1>Reportar una falla</h1></div>${msg()}
    <div class="card stack"><span class="small muted">Tipo de falla <b class="err">*</b></span>
      <div class="chips">${TIPOS_FALLA.map(t=>`<button type="button" class="chipbtn" data-tipo="${esc(t)}" aria-pressed="${f.tipo===t}">${esc(t)}</button>`).join("")}</div>
      <label class="f" for="desc"><span>¿Qué pasa? <b>*</b></span><textarea id="desc" placeholder="Ej. el pedal de freno se va al fondo">${esc(f.desc)}</textarea></label></div>
    <div class="card stack">${yn("circula","¿El vehículo puede seguir circulando?")}${yn("grua","¿Necesitas grúa?")}</div>
    <div class="card stack"><div class="row" style="justify-content:space-between"><b>Ubicación</b>${gpsTag(f)}</div>
      ${f.gps!=="ok"?`<div class="row"><button class="btn sec sm" id="regps" type="button">Intentar de nuevo</button><span class="small muted">Si no se puede, escribe dónde estás.</span></div>`:""}
      <label class="f" for="ubic"><span>Referencia del lugar ${f.gps==="ok"?"(opcional)":"<b>*</b>"}</span><input id="ubic" type="text" value="${esc(f.ubic)}" placeholder="Ej. km 32 carretera a El Salvador, frente a gasolinera"></label>
      <label class="f" for="fkm"><span>Km del odómetro (opcional)</span><input id="fkm" type="number" inputmode="numeric" value="${esc(f.km)}"></label></div>
    <div class="card stack"><b>Fotos (1 a 4) *</b><div class="photos">${[0,1,2,3].map(i=>`<label class="ph ${i===0?"req":""}">${f.fotos[i]?`<img src="${f.fotos[i]}" alt="Foto ${i+1}">`:""}
      <input type="file" accept="image/*" capture="environment" data-fi="${i}" aria-label="Foto ${i+1}"><span class="lbl">Foto ${i+1}${f.fotos[i]?" ✓":""}</span></label>`).join("")}</div></div></div>`;
}
function bFalla(){
  const f=S.f;
  $$("[data-tipo]").forEach(b=>b.onclick=()=>{ f.tipo=b.dataset.tipo; keepY(render); });
  $$("[data-yn]").forEach(b=>b.onclick=()=>{ f[b.dataset.yn]=b.dataset.v==="1"; if(b.dataset.yn==="circula"&&f.circula===true&&f.grua===null) f.grua=false; keepY(render); });
  $("#desc").oninput=e=>{ f.desc=e.target.value; }; $("#ubic").oninput=e=>{ f.ubic=e.target.value; }; $("#fkm").oninput=e=>{ f.km=e.target.value; };
  const rg=$("#regps"); if(rg) rg.onclick=()=>{ f.gps="buscando"; keepY(render); gps(f); };
  $$("[data-fi]").forEach(i=>i.onchange=()=>readImg(i.files[0],u=>{ f.fotos[Number(i.dataset.fi)]=u; f.fotos=f.fotos.filter(Boolean); keepY(render); }));
  bar2("Enviar reporte de falla", async()=>{
    if(!f.tipo) return err("Elige el tipo de falla."); if(f.desc.trim().length<5) return err("Describe la falla.");
    if(f.circula===null||f.grua===null) return err("Indica si puede circular y si necesitas grúa.");
    if(f.gps!=="ok"&&f.ubic.trim().length<4) return err("Escribe dónde estás.");
    if(!f.fotos.length) return err("Agrega al menos una foto.");
    await enviar({tipo:"falla", payload:{tipo:f.tipo,desc:f.desc.trim(),circula:f.circula,grua:f.grua,lat:f.lat,lng:f.lng,ubic:f.ubic.trim(),km:f.km===""?null:Number(f.km),fotos:f.fotos}});
  });
}
function err(t){ S.msg={t,err:1}; render(); window.scrollTo({top:0}); }
function bar2(label,fn){
  $("#bar").innerHTML=`<button class="btn sec" id="back" type="button">Atrás</button><button class="btn pri" id="send" type="button" ${S.busy?"disabled":""}>${S.busy?'<span class="spinner"></span> Enviando':label}</button>`;
  $("#back").onclick=()=>{ S.view="home"; S.msg=null; render(); };
  $("#send").onclick=fn;
}
async function enviar(item){
  item.id=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)); item.token=S.sess.token; item.placa=S.sess.veh.p;
  S.busy=true; S.msg=null; render();
  try{ const r=await api(item.tipo==="km"?"kmReportar":"fallaReportar",item.payload); S.busy=false; S.res={tipo:item.tipo,r}; S.view="ok";
    if(item.tipo==="km"){ S.sess.veh.ultKm=r.km; S.sess.veh.ult=new Date().toISOString().slice(0,16).replace("T"," "); ls.set("fp_sess",S.sess); } render(); window.scrollTo({top:0}); }
  catch(e){ S.busy=false;
    if(e.offline){ await cola.put(item); S.pend=(await cola.all()).length; S.view="home"; S.msg={t:"Sin señal: el reporte quedó guardado en el celular y se enviará solo cuando haya conexión."}; render(); }
    else err(e.message); }
}
async function enviarPendientes(){
  const items=await cola.all(); let n=0;
  for(const it of items){ try{ const tok=S.sess&&S.sess.token;
      const useTok=(S.sess&&S.sess.veh.p===it.placa)?tok:it.token;
      const r=await fetch(API,{method:"POST",body:JSON.stringify(Object.assign({action:it.tipo==="km"?"kmReportar":"fallaReportar",token:useTok,piloto:1},it.payload))});
      const j=await r.json(); if(j.ok||!j.auth){ await cola.del(it.id); if(j.ok) n++; } }catch(e){ break; } }
  S.pend=(await cola.all()).length; if(n){ S.msg={t:`Se enviaron ${n} reporte${n>1?"s":""} pendientes.`}; } if(S.sess&&S.view==="home") render();
}

/* ---------- resultado y mis reportes ---------- */
function vOk(){
  const {tipo,r}=S.res;
  if(tipo==="km") return `<div class="stack screen"><div class="status ok"><b>Kilometraje recibido</b><p>${fmt(r.km)} km${r.recorrido!==""&&r.recorrido!=null?` · ${fmt(r.recorrido)} km desde el reporte anterior`:""}</p></div>
    ${r.asignado?"":`<div class="status obs"><b>Piloto distinto al asignado</b><p>Tu nombre no coincide con el piloto asignado a este vehículo. Se avisó al supervisor y a Cumplimiento: pide tu checklist de entrega.</p></div>`}</div>`;
  return `<div class="stack screen"><div class="status ${r.prioridad==="Alta"?"no":"obs"}"><b>Falla reportada · ${esc(r.id)}</b><p>El supervisor ya recibió el aviso${r.prioridad==="Alta"?" como urgente":""}. Mantente atento al teléfono.</p></div></div>`;
}
function bOk(){ $("#bar").innerHTML=`<button class="btn pri" id="home" type="button">Listo</button>`; $("#home").onclick=()=>{ S.view="home"; render(); }; }
function vMis(){
  const m=S.mis;
  if(!m) return `<div class="card"><span class="spinner"></span> Cargando…</div>`;
  return `<div class="stack screen"><h1>Mis reportes</h1>${msg()}
    <div class="card list"><h3>Kilometraje</h3>${m.km.map(x=>`<div class="li"><span>${esc(x.f)}<br><span class="small muted">${esc(x.pi)}</span></span><span><b>${fmt(x.km)}</b>${x.rec!=null?` <span class="small muted">+${fmt(x.rec)}</span>`:""}</span></div>`).join("")||`<p class="muted">Sin reportes.</p>`}</div>
    <div class="card list"><h3>Fallas</h3>${m.fallas.map(x=>`<div class="li"><span><b>${esc(x.id)}</b> · ${esc(x.t)}<br><span class="small muted">${esc(x.f)}${x.ta?" · "+esc(x.ta):""}</span></span><span class="chip ${x.e==="Cerrada"?"ok":"sem"}">${esc(x.e)}</span></div>`).join("")||`<p class="muted">Sin fallas reportadas.</p>`}</div></div>`;
}
function bMis(){ $("#bar").innerHTML=`<button class="btn sec" id="home" type="button">Volver</button>`; $("#home").onclick=()=>{ S.view="home"; render(); }; }

function readImg(file,cb){
  if(!file) return; const fr=new FileReader();
  fr.onload=()=>{ const im=new Image(); im.onload=()=>{ const m=1280, sc=Math.min(1,m/Math.max(im.width,im.height)); const c=document.createElement("canvas");
    c.width=Math.round(im.width*sc); c.height=Math.round(im.height*sc); c.getContext("2d").drawImage(im,0,0,c.width,c.height); cb(c.toDataURL("image/jpeg",.72)); }; im.src=fr.result; };
  fr.readAsDataURL(file);
}

window.addEventListener("online",enviarPendientes);
(async function(){ render(); await cargarEmpresas(); S.pend=(await cola.all()).length; if(S.sess){ render(); enviarPendientes(); } })();
