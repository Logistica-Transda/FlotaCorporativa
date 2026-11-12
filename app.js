/* Flota Corporativa · TRANSDA — app web v2.2 (Supervisor y Consulta) */
"use strict";
const APP_VERSION = "2.2";
const API = (window.FC_CONFIG && window.FC_CONFIG.API_URL) || "";

/* ---------------- checklist (CHECK_LIST_ACTUALIZADO nov-2026, 31 ítems; prioridad del hallazgo que genera un "Malo") ---------------- */
const SECTIONS = [
 {id:"ext", t:"1. Condición exterior", items:[["Carrocería, pintura, golpes y rayones","Baja"],["Parabrisas y ventanas","Alta"],["Espejos laterales y retrovisor","Media"],
  ["Luces delanteras y traseras","Alta"],["Direccionales y luces de emergencia","Alta"],["Llantas (estado y desgaste)","Alta"],["Aros y tapones (si aplica)","Baja"],
  ["Placas y emblemas","Media"]]},
 {id:"int", t:"2. Condición interior", items:[["Asientos, tapicería y cinturones","Media"],["Tablero e indicadores","Media"],["Aire acondicionado","Baja"],
  ["Radio y sistema de audio","Baja"],["Manecillas","Media"],["Claxon","Alta"]]},
 {id:"mec", t:"3. Condición mecánica y seguridad", items:[["Motor: funcionamiento y ruidos","Alta"],["Sin fugas visibles de aceite o fluidos","Alta"],
  ["Nivel de aceite de motor","Media"],["Nivel de refrigerante","Media"],["Nivel de líquido de frenos","Alta"],["Frenos y freno de estacionamiento","Alta"],
  ["Dirección y suspensión (revisión básica)","Alta"],["Batería","Media"]]},
 {id:"doc", t:"4. Documentos y accesorios", items:[["Tarjeta de circulación","Alta"],["Documentos / calcomanía vigentes (si aplica)","Media"],["Llave principal","Alta"],
  ["Llave de repuesto (si aplica)","Baja"],["Llanta de repuesto","Media"],["Tricket y llave de chuchos","Media"],["Triángulos o conos de seguridad","Media"],
  ["Extintor (si aplica)","Media"],["Otros accesorios asignados","Baja"]]}
];
const SIN_FOTO = new Set(["doc-7","doc-8"]);   // triángulos y extintor: un "Malo" significa que no tiene, no se pide foto
const MAX_FOTOS_FALLA = {"ext-1":2};           // carrocería: hasta 2 fotos de daños
const MARCABLE = new Set(["frente","atras","izq","der"]);
const CON_CARTA = t=>t==="E"||t==="A";          // entrega (y alta) llevan carta de responsabilidad
SECTIONS.forEach(s=>s.items=s.items.map((x,i)=>({k:s.id+"-"+(i+1),n:i+1,t:x[0],p:x[1],sec:s.t})));
const ALL = SECTIONS.flatMap(s=>s.items);
const TIPOS = {
  E:{t:"Entrega",d:"Asignar a un responsable",a:"ENTREGA (supervisor)",b:"RECIBE (responsable)"},
  D:{t:"Devolución",d:"Recibir de vuelta",a:"ENTREGA (responsable)",b:"RECIBE (supervisor)"},
  M:{t:"Inspección mensual",d:"Revisión en sitio",a:"INSPECCIONA (supervisor)",b:"RESPONSABLE del vehículo"},
  A:{t:"Alta de vehículo",d:"Ingreso de vehículo nuevo",a:"ENTREGA (supervisor)",b:"RECIBE (responsable)"}
};
const FOTOS = [["frente","Frente"],["atras","Atrás"],["izq","Lado izquierdo"],["der","Lado derecho"],["odo","Odómetro y tablero encendido"],["tap","Tapicería"]];
const FUEL = ["E","1/4","1/2","3/4","F"];
const STEP_NAMES = ["Vehículo","Datos","Checklist","Fotos y firmas","Resumen"];

/* ---------------- utilidades ---------------- */
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
const esc = s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n=>n==null||n===""||isNaN(n)?"—":Number(n).toLocaleString("es-GT");
const pad2 = n=>String(n).padStart(2,"0");
const localISO = (d=new Date())=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const addDays = (iso,n)=>{ const [y,m,d]=iso.split("-").map(Number); return localISO(new Date(y,m-1,d+n)); };
const diffDays = (a,b)=>{ const p=s=>{const [y,m,d]=s.split("-").map(Number); return Date.UTC(y,m-1,d);}; return Math.round((p(a)-p(b))/86400000); };
const uuid = ()=> (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2));
const ls = {
  get(k){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):null; }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};

/* IndexedDB: cola de envíos y borrador (las fotos no caben en localStorage) */
let _db=null;
function idb(){
  if(_db) return Promise.resolve(_db);
  return new Promise((res,rej)=>{
    if(!window.indexedDB) return rej(new Error("sin IndexedDB"));
    const r=indexedDB.open("flota-corporativa",1);
    r.onupgradeneeded=()=>{ const db=r.result; db.createObjectStore("cola",{keyPath:"clientId"}); db.createObjectStore("kv"); };
    r.onsuccess=()=>{ _db=r.result; res(_db); }; r.onerror=()=>rej(r.error);
  });
}
async function idbDo(store,mode,fn){
  try{ const db=await idb(); return await new Promise((res,rej)=>{ const tx=db.transaction(store,mode); const st=tx.objectStore(store); const out=fn(st);
    tx.oncomplete=()=>res(out&&out.result!==undefined?out.result:undefined); tx.onerror=()=>rej(tx.error); }); }catch(e){ return undefined; }
}
const cola = {
  put: d=>idbDo("cola","readwrite",s=>s.put(d)),
  del: id=>idbDo("cola","readwrite",s=>s.delete(id)),
  all: ()=>idbDo("cola","readonly",s=>s.getAll()).then(x=>x||[])
};
const kv = {
  get: k=>idbDo("kv","readonly",s=>s.get(k)),
  set: (k,v)=>idbDo("kv","readwrite",s=>s.put(v,k)),
  del: k=>idbDo("kv","readwrite",s=>s.delete(k))
};

async function api(action,payload={}){
  if(!API) throw new Error("Falta configurar la dirección del servidor (config.js).");
  const body=JSON.stringify(Object.assign({action,token:S.sess&&S.sess.token},payload));
  let r;
  try{ r=await fetch(API,{method:"POST",body,redirect:"follow"}); }
  catch(e){ const err=new Error("Sin conexión con el servidor."); err.offline=true; throw err; }
  let j; try{ j=await r.json(); }catch(e){ const err=new Error("Respuesta no válida del servidor."); err.offline=true; throw err; }
  if(j.auth){ logout(true); throw new Error(j.error); }
  if(!j.ok) throw new Error(j.error||"Error del servidor.");
  return j;
}

/* ---------------- estado ---------------- */
const S = {
  sess: ls.get("fc_sess"), cat: ls.get("fc_cat"), view:"home", tab:"prog", ctab:"res",
  msg:null, busy:false, online:navigator.onLine, queue:0, listas:[], actas:null, actaF:{placa:"",desde:"",hasta:""}, hallF:"Alta",
  pdfLinks:{}, f:null, draft:null
};
if(S.sess && S.sess.exp < Date.now()){ S.sess=null; ls.del("fc_sess"); }

function newFlow(tipo="M"){
  return { step:0, tipo, q:"", v:null, clientId:uuid(),
    h:{fecha:localISO(), km:"", cond:"", lic:"", licvig:"", area:"", fuel:"", asig:"", del:"", al:"", emp:"", dpi:"", color:""},
    r:{}, obs:{}, fotos:{}, fotosBase:{}, marks:{}, fotosMalo:{}, fotoLic:null, verif:{}, verifC:{}, gen:"", dec:"C", sig:{a:null,b:null,c:null}, nomA:"", nomB:"", tried:false };
}
/* borradores guardados con versiones anteriores */
function fixFlow(f){
  if(!f) return f; const n=newFlow(f.tipo);
  f.h=Object.assign({},n.h,f.h||{}); f.sig=Object.assign({a:null,b:null,c:null},f.sig||{});
  ["fotosBase","marks","fotosMalo","fotos","r","obs"].forEach(k=>{ if(!f[k]) f[k]={}; });
  const keys=new Set(ALL.map(i=>i.k)); Object.keys(f.r).forEach(k=>{ if(!keys.has(k)) delete f.r[k]; });
  Object.keys(f.fotosMalo).forEach(k=>{ const v=f.fotosMalo[k]; f.fotosMalo[k]=(Array.isArray(v)?v:[v]).filter(Boolean).map(x=>typeof x==="string"?{u:x,b:x,m:[]}:x); });
  if(f.fotos.tab && !f.fotos.odo) f.fotos.odo=f.fotos.tab; delete f.fotos.tab;
  return f;
}

/* ---------------- render ---------------- */
let _rendering=false, _again=false;
function render(){
  if(_rendering){ _again=true; return; }
  _rendering=true;
  try{ renderNow(); } finally { _rendering=false; }
  if(_again){ _again=false; setTimeout(render,0); }
}
function renderNow(){
  const app=$("#app"), bar=$("#bar");
  $("#role").textContent = S.sess ? (S.sess.rol==="supervisor"?"Supervisor":"Consulta")+" · "+S.sess.nombre : "Sin sesión";
  $("#steps").innerHTML = S.f && S.view==="flow" ? STEP_NAMES.map((_,i)=>`<span class="${i<=S.f.step?"on":""}"></span>`).join("") : "";
  if(!S.sess){ app.innerHTML=vLogin(); bar.innerHTML=""; bindLogin(); return; }
  if(S.view==="flow"){ const s=S.f.step; app.innerHTML=[s0,s1,s2,s3,s4][s](); [b0,b1,b2,b3,b4][s](); flowBar(); saveDraftSoon(); return; }
  if(S.view==="done"){ app.innerHTML=vDone(); bindDone(); bar.innerHTML=`<button class="btn pri" id="home" type="button">Volver al inicio</button>`; $("#home").onclick=()=>{S.view="home"; S.done=null; render();}; return; }
  if(S.sess.rol==="consulta"){ app.innerHTML=vConsulta(); bar.innerHTML=homeBar(); bindHomeBar(); bindConsulta(); return; }
  app.innerHTML=vHome(); bar.innerHTML=homeBar(); bindHomeBar(); bindHome();
}
function banner(){
  const parts=[];
  if(!S.online) parts.push(`<div class="banner off">Sin señal. Puedes registrar; los envíos quedan guardados en este dispositivo.</div>`);
  if(S.queue) parts.push(`<div class="banner q row" style="justify-content:space-between"><span>${S.queue} registro${S.queue>1?"s":""} pendiente${S.queue>1?"s":""} de envío</span><button class="link" id="sync" type="button">Enviar ahora</button></div>`);
  if(S.msg) parts.push(`<div class="banner ${S.msg.err?"off":"q"}">${esc(S.msg.t)}</div>`);
  return parts.join("");
}
function bindBanner(){ const b=$("#sync"); if(b) b.onclick=()=>procesarCola(true); }
function homeBar(){ return `<button class="btn sec" id="reload" type="button">Actualizar datos</button><span class="progress" style="flex:1">v${APP_VERSION}${S.cat&&S.cat.version&&S.cat.version!==APP_VERSION?` <span class="warn-txt">· servidor v${esc(S.cat.version)}: actualiza el Code.gs</span>`:""}</span><button class="btn sec" id="out" type="button">Salir</button>`; }
function bindHomeBar(){ $("#reload").onclick=()=>cargarCatalogo(true); $("#out").onclick=()=>logout(false); }

/* ---------------- ingreso ---------------- */
function vLogin(){
  const n=S.loginNombre!=null?S.loginNombre:(ls.get("fc_nombre")||"");
  return `<div class="login stack screen">
    <div><div class="eyebrow">TRANSDA · Gasolineras Don Arturo</div><h1>Ingresar</h1></div>
    <form class="card stack" id="flogin">
      <div class="seg" style="grid-template-columns:1fr 1fr" role="group" aria-label="Acceso">
        <button type="button" data-rol="supervisor" aria-pressed="${(S.loginRol||"supervisor")==="supervisor"}"><b>Supervisor</b><span>Registra checklists</span></button>
        <button type="button" data-rol="consulta" aria-pressed="${S.loginRol==="consulta"}"><b>Consulta</b><span>Ve actas y hallazgos</span></button>
      </div>
      <label class="f" for="lnombre"><span>Tu nombre <b>*</b></span><input id="lnombre" type="text" autocomplete="name" value="${esc(n)}"></label>
      <label class="f" for="lpin"><span>PIN de 8 dígitos <b>*</b></span><input id="lpin" class="pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
      ${S.msg?`<div class="err">${esc(S.msg.t)}</div>`:""}
      <button class="btn pri" type="submit" id="lbtn" ${S.busy?"disabled":""}>${S.busy?'<span class="spinner"></span> Ingresando':"Ingresar"}</button>
    </form>
    <p class="small muted">La sesión dura 30 días en este dispositivo. El PIN no se guarda.</p></div>`;
}
function bindLogin(){
  $$("[data-rol]").forEach(b=>b.onclick=()=>{S.loginRol=b.dataset.rol; render();});
  $("#lnombre").oninput=e=>{ S.loginNombre=e.target.value; };
  $("#flogin").onsubmit=async e=>{
    e.preventDefault(); const nombre=$("#lnombre").value.trim(), pin=$("#lpin").value.trim(); S.loginNombre=$("#lnombre").value;
    if(!nombre||!/^\d{8}$/.test(pin)){ S.msg={t:"Escribe tu nombre y un PIN de 8 dígitos.",err:1}; render(); return; }
    S.busy=true; S.msg=null; render();
    try{ const r=await api("login",{rol:S.loginRol||"supervisor",pin,nombre}); S.sess={token:r.token,rol:r.rol,nombre:r.nombre,exp:r.exp};
      ls.set("fc_sess",S.sess); ls.set("fc_nombre",nombre); S.busy=false; await cargarCatalogo(false); await revisarBorrador(); procesarCola(false); }
    catch(err){ S.busy=false; S.msg={t:err.message,err:1}; render(); }
  };
}
function logout(expired){
  if(S.sess && !expired) api("logout").catch(()=>{});
  S.sess=null; ls.del("fc_sess"); S.view="home"; S.f=null;
  S.msg = expired ? {t:"Tu sesión venció. Ingresa de nuevo con tu PIN.",err:1} : null; render();
}
async function cargarCatalogo(showMsg){
  try{ S.busy=true; const c=await api("catalog"); S.cat=c; ls.set("fc_cat",c); S.busy=false; if(showMsg) S.msg={t:"Datos actualizados."}; }
  catch(e){ S.busy=false; if(showMsg||!S.cat) S.msg={t:e.offline&&S.cat?"Sin conexión: se usan los últimos datos descargados.":e.message,err:1}; }
  render();
}

/* ---------------- programación ---------------- */
function prog(){
  const c=S.cat; if(!c) return [];
  const hoy=localISO();
  return c.veh.map(v=>{
    const pool=/pool/i.test(v.as);
    let st,lbl,ord;
    if(pool){ st="pool"; lbl="Pool: cualquier día"; ord=3; }
    else if(!v.ui){ st="nunca"; lbl="Sin inspección"; ord=1; }
    else { const due=addDays(v.ui,c.dias), d=diffDays(due,hoy);
      if(d<0){ st="venc"; lbl=`Vencida hace ${-d} d`; ord=0; } else if(d<=c.aviso){ st="sem"; lbl=d===0?"Vence hoy":`Vence en ${d} d`; ord=2; } else { st="ok"; lbl=`Al día · ${due}`; ord=4; } }
    return Object.assign({},v,{pst:st,plbl:lbl,pord:ord});
  });
}
function vProg(readOnly){
  const list=prog(); const by={};
  list.forEach(v=>(by[v.u||"Por asignar"]=by[v.u||"Por asignar"]||[]).push(v));
  const groups=Object.entries(by).map(([u,vs])=>({u,vs:vs.sort((a,b)=>a.pord-b.pord||a.p.localeCompare(b.p)),pend:vs.filter(v=>v.pst==="venc"||v.pst==="nunca"||v.pst==="sem").length}))
    .sort((a,b)=>(a.u==="Por asignar")-(b.u==="Por asignar")||b.pend-a.pend||a.u.localeCompare(b.u));
  const cnt=k=>list.filter(v=>v.pst===k).length;
  return `<div class="kpis"><div class="kpi"><b>${cnt("venc")}</b><span>Vencidas</span></div><div class="kpi"><b>${cnt("nunca")}</b><span>Sin inspección</span></div>
    <div class="kpi"><b>${cnt("sem")}</b><span>Esta semana</span></div><div class="kpi"><b>${cnt("ok")}</b><span>Al día</span></div></div>
    <p class="small muted">Agrupado por ubicación para armar rutas. Los vehículos de pool se revisan en cada entrega, cualquier día.${readOnly?"":" Toca un vehículo para iniciar su inspección mensual."}</p>
    ${groups.map(g=>`<section class="card group" aria-label="${esc(g.u)}"><div class="group-h"><h2>${esc(g.u)}</h2><span class="small muted">${g.pend} por inspeccionar · ${g.vs.length} vehículos</span></div>
      ${g.vs.map(v=>`<${readOnly?"div":"button type=\"button\""} class="veh" data-insp="${esc(v.p)}">
        <span class="plate">${esc(v.p)}</span><span><b>${esc(v.m)} ${esc(v.l)}</b></span><span class="chip ${v.pst}">${esc(v.plbl)}</span>
        <span class="sub">${esc(v.ar||"Área por asignar")} · ${esc(v.re||"sin responsable")}${v.ui?` · última ${v.ui}`:""}</span></${readOnly?"div":"button"}>`).join("")}
    </section>`).join("")}`;
}

/* ---------------- inicio supervisor ---------------- */
function vHome(){
  if(!S.cat) return `<div class="stack">${banner()}<div class="card"><span class="spinner"></span> Cargando vehículos…</div></div>`;
  const tabs=[["prog","Programación"],["nuevo","Nuevo registro"],["env","Enviados hoy"]];
  let body="";
  if(S.tab==="prog") body=vProg(false);
  if(S.tab==="nuevo") body=`<div class="card stack"><p style="margin:0">Elige el tipo de movimiento y el vehículo.</p><button class="btn pri" id="start" type="button">Empezar registro</button></div>`;
  if(S.tab==="env") body = S.listas.length ? `<div class="card list">${S.listas.map((x,i)=>`<div class="li"><span><b>${esc(x.folio)}</b> · ${esc(x.placa)}<br><span class="small muted">${esc(x.tipo)} · ${esc(x.res)}</span></span>
      <button class="btn sec sm" data-share="${i}" type="button">Compartir PDF</button></div>`).join("")}</div>` : `<p class="muted">Aún no hay registros enviados en esta sesión.</p>`;
  return `<div class="stack screen">${banner()}
    ${S.draft?`<div class="card row" style="justify-content:space-between"><span>Tienes un registro sin terminar: <b>${esc(S.draft.v?S.draft.v.p:"sin vehículo")}</b> · ${esc(TIPOS[S.draft.tipo].t)}</span><span class="row"><button class="btn sec sm" id="ddel" type="button">Descartar</button><button class="btn pri sm" id="dgo" type="button">Continuar</button></span></div>`:""}
    <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button type="button" role="tab" data-tab="${k}" aria-selected="${S.tab===k}">${l}</button>`).join("")}</div>
    ${body}</div>`;
}
function bindHome(){
  bindBanner();
  $$("[data-tab]").forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab; S.msg=null; render();});
  $$("[data-insp]").forEach(b=>b.onclick=()=>{ S.f=newFlow("M"); S.view="flow"; pick(b.dataset.insp); });
  const st=$("#start"); if(st) st.onclick=()=>{ S.f=newFlow("M"); S.view="flow"; render(); };
  $$("[data-share]").forEach(b=>b.onclick=()=>compartir(S.listas[Number(b.dataset.share)]));
  const dg=$("#dgo"); if(dg) dg.onclick=()=>{ S.f=S.draft; S.draft=null; S.view="flow"; render(); };
  const dd=$("#ddel"); if(dd) dd.onclick=()=>{ S.draft=null; kv.del("borrador"); render(); };
}
async function revisarBorrador(){ const d=await kv.get("borrador"); if(d && d.step>0 && d.v) S.draft=fixFlow(d); render(); }
let _draftT=null;
function saveDraftSoon(){ clearTimeout(_draftT); _draftT=setTimeout(()=>{ if(S.f && S.view==="flow" && S.f.v) kv.set("borrador",S.f); },600); }

/* ---------------- flujo: paso 0 ---------------- */
function s0(){
  const f=S.f, q=f.q.trim().toUpperCase();
  const list=S.cat.veh.filter(v=>!q || (v.p+" "+v.m+" "+v.l+" "+v.re+" "+v.ar+" "+v.u).toUpperCase().includes(q)).slice(0,60);
  return `<div class="stack screen"><div><div class="eyebrow">Paso 1 de 5</div><h1>¿Qué vas a registrar?</h1></div>
   <div class="seg" role="group" aria-label="Tipo de movimiento">${Object.entries(TIPOS).filter(([k])=>k!=="A"||f.tipo==="A").map(([k,x])=>`<button type="button" data-tipo="${k}" aria-pressed="${f.tipo===k}"><b>${x.t}</b><span>${x.d}</span></button>`).join("")}</div>
   <div class="card stack"><label class="f" for="q"><span>Buscar por placa, marca, responsable, área o ubicación</span>
     <input id="q" type="search" placeholder="Ej. P438GDB o Auditoría" value="${esc(f.q)}" autocomplete="off"></label>
     <span class="progress">${S.cat.veh.length} vehículos · mostrando ${list.length}</span>
     <div class="vlist">${list.map(v=>`<button type="button" class="veh" data-p="${esc(v.p)}"><span class="plate">${esc(v.p)}</span>
       <span><b>${esc(v.m)} ${esc(v.l)}</b> ${v.a?`· ${esc(v.a)}`:""}</span>${v.e==="Sin póliza en listado"?`<span class="tag warn">Sin póliza</span>`:`<span class="tag">${esc(v.st||v.e)}</span>`}
       <span class="sub">${esc(v.ar||"Área por asignar")} · ${esc(v.re||"sin responsable")}${v.km!=null?` · ${fmt(v.km)} km`:""}</span></button>`).join("")||`<p class="muted">No hay vehículos con ese texto.</p>`}</div></div></div>`;
}
function b0(){
  $$("[data-tipo]").forEach(b=>b.onclick=()=>{S.f.tipo=b.dataset.tipo; render();});
  const q=$("#q"); q.oninput=()=>{ S.f.q=q.value; const pos=q.selectionStart; render(); const n=$("#q"); n.focus(); n.setSelectionRange(pos,pos); };
  $$(".veh").forEach(b=>b.onclick=()=>pick(b.dataset.p));
}
function pick(p){
  const f=S.f, v=S.cat.veh.find(x=>x.p===p); f.v=v;
  f.h.area=v.ar; f.h.cond = (f.tipo==="E"||f.tipo==="A") ? (f.tipo==="A"?v.re:"") : v.re; f.h.km="";
  const r=findResp(f.h.cond); if(r){ f.h.lic=r.lic||""; f.h.licvig=r.lv||""; }
  f.nomA = f.tipo==="D" ? v.re : S.sess.nombre; f.nomB = f.tipo==="D" ? S.sess.nombre : (f.tipo==="M"? v.re : "");
  f.verif={}; f.verifC={};
  if(CON_CARTA(f.tipo)){ f.h.emp=v.ep||""; f.h.color=v.co||""; f.h.del=f.h.fecha; f.h.asig=""; f.h.al="";
    f.h.dpi=(r&&r.dpi)||(/^\d{13}$/.test(f.h.lic)?f.h.lic:""); }
  go(1);
}
function findResp(n){ if(!n||!S.cat||!S.cat.resp) return null; const k=norm(n); return S.cat.resp.find(r=>norm(r.n)===k)||null; }
function norm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim(); }
function go(n){ S.f.step=n; S.f.tried=false; render(); window.scrollTo({top:0}); }

/* ---------------- paso 1: datos ---------------- */
function s1(){
  const f=S.f, v=f.v, h=f.h, t=TIPOS[f.tipo]; const kmE=kmError(), licE=licError(); const need=k=>f.tried&&!h[k];
  return `<div class="stack screen"><div><div class="eyebrow">Paso 2 de 5 · ${t.t}</div><h1>${esc(v.p)} · ${esc(v.m)} ${esc(v.l)}</h1>
     <p class="muted small">${esc(v.e)} · ${esc(v.a||"año s/d")} · ${esc(v.u||"ubicación s/d")} · estado ${esc(v.st||"s/d")}</p></div>
   <div class="card stack"><div class="grid2">
       <label class="f" for="fecha"><span>Fecha <b>*</b></span><input id="fecha" type="date" value="${h.fecha}" max="${localISO()}"></label>
       <label class="f" for="km"><span>Kilometraje <b>*</b></span><input id="km" type="number" inputmode="numeric" min="0" value="${esc(h.km)}" placeholder="${v.km!=null?"Última lectura "+fmt(v.km):"Sin lectura previa"}"></label></div>
     ${kmE?`<div class="${kmE.block?"err":"note"}">${kmE.msg}</div>`:""}${need("km")?`<div class="err">Escribe el kilometraje del odómetro.</div>`:""}
     <div class="stack" style="gap:6px"><span class="small muted">Nivel de combustible <b class="err">*</b></span>
       <div class="fuel" role="group" aria-label="Nivel de combustible">${FUEL.map(x=>`<button type="button" data-fuel="${x}" aria-pressed="${h.fuel===x}">${x}</button>`).join("")}</div>
       ${need("fuel")?`<div class="err">Marca el nivel de combustible.</div>`:""}</div></div>
   <div class="card stack"><h3>${f.tipo==="E"?"Responsable que recibe":"Conductor responsable"}</h3>
     <label class="f" for="cond"><span>Nombre <b>*</b></span><input id="cond" type="text" list="dlresp" value="${esc(h.cond)}" placeholder="Nombre completo"></label>
     <datalist id="dlresp">${(S.cat.resp||[]).map(r=>`<option value="${esc(r.n)}">`).join("")}</datalist>
     ${need("cond")?`<div class="err">Escribe el nombre del conductor.</div>`:(f.tried&&h.cond.trim()&&!nombreOk(h.cond))?`<div class="err">Escribe el nombre y apellido del conductor, no el número de DPI o licencia.</div>`:""}
     <div class="grid2"><label class="f" for="lic"><span>No. de licencia <b>*</b></span><input id="lic" type="text" value="${esc(h.lic)}" placeholder="CUI / No. licencia"></label>
       <label class="f" for="licvig"><span>Vigencia de licencia <b>*</b></span><input id="licvig" type="date" value="${h.licvig}"></label></div>
     <div class="row" style="align-items:flex-start;gap:12px"><label class="ph req" style="width:150px;flex:none">${f.fotoLic?`<img src="${f.fotoLic}" alt="Licencia">`:""}
         <input type="file" accept="image/*" capture="environment" id="flic" aria-label="Foto de la licencia"><span class="lbl">Foto de licencia *${f.fotoLic?" ✓":""}</span></label>
       <p class="small muted" style="flex:1;min-width:160px;margin:0">Compara la foto con el número y la fecha de vencimiento escritos. La foto va a una carpeta de acceso restringido.</p></div>
     ${need("lic")||need("licvig")?`<div class="err">Completa número y vigencia de la licencia.</div>`:""}${f.tried&&!f.fotoLic?`<div class="err">Falta la foto de la licencia.</div>`:""}
     ${licE?`<div class="err">${licE}</div>`:""}
     <label class="f" for="area"><span>Área / sede</span><input id="area" type="text" value="${esc(h.area)}" placeholder="Ej. Auditoría Operativa"></label></div>
   ${CON_CARTA(f.tipo)?vAsignacion():""}</div>`;
}
const dpiLimpio = s=>String(s||"").replace(/[\s-]/g,"");
const dpiOk = s=>/^\d{13}$/.test(dpiLimpio(s));
function asigOk(){ const h=S.f.h; return h.asig==="Permanente" || (h.asig==="Temporal" && h.del && h.al && h.al>=h.del); }
function cartaDatosOk(){ const h=S.f.h; return asigOk() && h.emp && h.color.trim() && dpiOk(h.dpi); }
function vAsignacion(){
  const f=S.f, h=f.h, emps=((S.cat&&S.cat.empresas)||[]).map(x=>x.e); if(h.emp&&!emps.includes(h.emp)) emps.unshift(h.emp);
  return `<div class="card stack"><h3>Asignación y carta de responsabilidad</h3>
     <div class="stack" style="gap:6px"><span class="small muted">Tipo de asignación <b class="err">*</b></span>
       <div class="seg" style="grid-template-columns:1fr 1fr" role="group" aria-label="Tipo de asignación">
         <button type="button" data-asig="Permanente" aria-pressed="${h.asig==="Permanente"}"><b>Permanente</b><span>Sin fecha de fin</span></button>
         <button type="button" data-asig="Temporal" aria-pressed="${h.asig==="Temporal"}"><b>Temporal</b><span>Con vigencia del / al</span></button></div>
       ${f.tried&&!h.asig?`<div class="err">Elige si la asignación es permanente o temporal.</div>`:""}</div>
     ${h.asig==="Temporal"?`<div class="grid2"><label class="f" for="del"><span>Del <b>*</b></span><input id="del" type="date" value="${h.del}"></label>
       <label class="f" for="al"><span>Al <b>*</b></span><input id="al" type="date" value="${h.al}" min="${h.del}"></label></div>
       ${f.tried&&!asigOk()?`<div class="err">Indica la vigencia; la fecha final no puede ser antes de la inicial.</div>`:""}`:""}
     <div class="grid2"><label class="f" for="emp"><span>Empresa propietaria <b>*</b></span><select id="emp"><option value="">Elegir…</option>${emps.map(e=>`<option ${e===h.emp?"selected":""}>${esc(e)}</option>`).join("")}</select></label>
       <label class="f" for="color"><span>Color del vehículo <b>*</b></span><input id="color" type="text" value="${esc(h.color)}" placeholder="Ej. Blanco"></label></div>
     ${f.tried&&(!h.emp||!h.color.trim())?`<div class="err">Indica la empresa propietaria y el color del vehículo.</div>`:""}
     <label class="f" for="dpi"><span>DPI (CUI) de quien recibe <b>*</b></span><input id="dpi" type="text" inputmode="numeric" maxlength="16" value="${esc(h.dpi)}" placeholder="13 dígitos"></label>
     ${f.tried&&!dpiOk(h.dpi)?`<div class="err">El DPI debe tener 13 dígitos.</div>`:""}
     <p class="small muted" style="margin:0">Con estos datos se llena la carta de responsabilidad. El piloto la lee y la firma en el paso de firmas.</p></div>`;
}
function kmError(){
  const v=S.f.v, km=Number(S.f.h.km);
  if(S.f.h.km===""||v.km==null) return null;
  if(km<v.km) return {block:true,msg:`El km (${fmt(km)}) es menor que la última lectura registrada (${fmt(v.km)}). Revisa el odómetro.`};
  if(km-v.km>30000) return {block:false,msg:`Aumento de ${fmt(km-v.km)} km desde la última lectura. Confírmalo con la foto del odómetro.`};
  return null;
}
function licError(){ const h=S.f.h; return h.licvig && h.licvig<h.fecha ? "La licencia está vencida. Se registra como hallazgo de prioridad alta; tú decides si entregas." : null; }
function b1(){
  $("#flic").onchange=e=>readImg(e.target.files[0],url=>{S.f.fotoLic=url; render();});
  ["fecha","km","cond","lic","licvig","area","del","al","emp","color","dpi"].forEach(id=>{ const el=$("#"+id); if(!el) return;
    el.onchange=()=>{ const h=S.f.h; h[id]=el.value;
      if(id==="cond"){ const r=findResp(el.value); if(r){ if(!h.lic) h.lic=r.lic||""; if(!h.licvig) h.licvig=r.lv||""; if(!h.dpi&&r.dpi) h.dpi=r.dpi; } if(S.f.tipo!=="D") S.f.nomB=el.value; else S.f.nomA=el.value; }
      if((id==="lic"||id==="cond") && CON_CARTA(S.f.tipo) && !h.dpi && dpiOk(h.lic)) h.dpi=dpiLimpio(h.lic);
      if(id==="fecha" && h.asig!=="Temporal") h.del=h.fecha;
      keepY(render); };
    if(el.type!=="date"&&el.tagName!=="SELECT") el.oninput=()=>{ S.f.h[id]=el.value; }; });
  $$("[data-fuel]").forEach(b=>b.onclick=()=>{S.f.h.fuel=b.dataset.fuel; render();});
  $$("[data-asig]").forEach(b=>b.onclick=()=>{ S.f.h.asig=b.dataset.asig; if(!S.f.h.del) S.f.h.del=S.f.h.fecha; keepY(render); });
}
function nombreOk(n){ return /[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{2,}/.test(String(n||"")) && !/\d{5,}/.test(String(n||"")); }
function ok1(){ const h=S.f.h, k=kmError(); return h.fecha&&h.km!==""&&h.fuel&&h.cond.trim()&&nombreOk(h.cond)&&h.lic.trim()&&h.licvig&&S.f.fotoLic&&!(k&&k.block)&&(!CON_CARTA(S.f.tipo)||cartaDatosOk()); }

/* ---------------- paso 2: checklist + hallazgos abiertos ---------------- */
function abiertos(){ return (S.cat.hall||[]).filter(x=>x.p===S.f.v.p); }
function s2(){
  const f=S.f, done=ALL.filter(i=>f.r[i.k]).length, ab=abiertos(), abDone=ab.filter(x=>f.verif[x.id]).length;
  return `<div class="stack screen"><div><div class="eyebrow">Paso 3 de 5</div><h1>Checklist</h1>
   <p class="muted small">${done} de ${ALL.length} ítems marcados. Un <b>Malo</b> pide observación y genera un hallazgo con la prioridad que se muestra junto al ítem.</p></div>
   ${ab.length?`<section class="card stack" aria-labelledby="h-ab"><div class="group-h"><h2 id="h-ab">Hallazgos abiertos de este vehículo</h2><span class="small muted">${abDone}/${ab.length}</span></div>
     <p class="small muted" style="margin:0">Verifica cada uno. Si sigue, márcalo aquí y no lo repitas como Malo en el checklist.</p>
     ${ab.map(x=>`<div class="hv ${f.tried&&!f.verif[x.id]?"need":""}"><div class="item-h"><span class="t">${esc(x.h)}</span><span class="prio ${x.pr} small">${esc(x.pr)}</span></div>
       <span class="small muted">${esc(x.o)}${x.ri?" · reincidente":""} · ${esc(x.e)}</span>
       <div class="tri" role="group" aria-label="${esc(x.h)}"><button type="button" data-hv="S" data-hid="${esc(x.id)}" aria-pressed="${f.verif[x.id]==="S"}">Sigue</button>
         <button type="button" data-hv="R" data-hid="${esc(x.id)}" aria-pressed="${f.verif[x.id]==="R"}">Resuelto</button></div>
       ${f.verif[x.id]==="R"?`<input type="text" data-hvc="${esc(x.id)}" value="${esc(f.verifC[x.id]||"")}" placeholder="Cómo se resolvió (opcional)">`:""}</div>`).join("")}
     ${f.tried&&abDone<ab.length?`<div class="err">Marca todos los hallazgos abiertos como Sigue o Resuelto.</div>`:""}</section>`:""}
   <div class="row"><button type="button" class="link" id="allok">Marcar pendientes como Bueno</button></div>
   ${SECTIONS.map(s=>`<section class="card" aria-labelledby="h-${s.id}"><h2 id="h-${s.id}">${s.t}</h2>
     ${s.items.map(it=>{ const v=f.r[it.k], need=v==="M"&&!(f.obs[it.k]||"").trim();
       return `<div class="item ${need&&f.tried?"need":""}"><div class="item-h"><span class="n">${it.n}</span><span class="t">${esc(it.t)}</span><span class="prio ${it.p} small">${it.p}</span></div>
        <div class="tri" role="group" aria-label="${esc(it.t)}">${[["B","Bueno"],["M","Malo"],["N","N/A"]].map(([c,l])=>`<button type="button" data-k="${it.k}" data-v="${c}" aria-pressed="${v===c}">${l}</button>`).join("")}</div>
        ${v==="M"?`<div class="obs stack" style="gap:6px"><label class="f" for="o-${it.k}"><span>Qué está mal <b>*</b></span><textarea id="o-${it.k}" data-o="${it.k}" placeholder="${SIN_FOTO.has(it.k)?"Ej. no tiene":"Ej. rajadura de 20 cm lado copiloto"}">${esc(f.obs[it.k]||"")}</textarea></label>
           ${need&&f.tried?`<span class="hint">Describe la falla para generar el hallazgo.</span>`:""}
           ${SIN_FOTO.has(it.k)?`<div class="row"><button type="button" class="btn sec sm" data-notiene="${it.k}">No tiene</button><span class="small muted">No requiere foto.</span></div>`:fotosFalla(it.k)}</div>`:""}</div>`}).join("")}</section>`).join("")}</div>`;
}
function fotosFalla(k){
  const arr=S.f.fotosMalo[k]||[], max=MAX_FOTOS_FALLA[k]||1, marc=MAX_FOTOS_FALLA[k]>1;
  return `<div class="row" style="gap:10px;align-items:flex-start">${arr.map((x,i)=>`<div class="thumb"><img src="${x.u}" alt="Foto ${i+1} de la falla">
      <div class="row" style="gap:10px">${marc?`<button type="button" class="link" data-mkm="${k}" data-i="${i}">✎ Marcar${(x.m||[]).length?" ("+x.m.length+")":""}</button>`:""}<button type="button" class="link" data-rmm="${k}" data-i="${i}">Quitar</button></div></div>`).join("")}
    ${arr.length<max?`<label class="ph" style="aspect-ratio:auto;padding:10px;justify-content:flex-start;max-width:230px"><input type="file" accept="image/*" capture="environment" data-fm="${k}" aria-label="Foto de la falla">
      <span class="lbl">${arr.length?"Agregar otra foto":"Agregar foto de la falla"}${max>1?` (hasta ${max})`:""}</span></label>`:""}</div>`;
}
function keepY(fn){ const y=window.scrollY; fn(); window.scrollTo({top:y}); }
function b2(){
  $$(".tri button[data-k]").forEach(b=>b.onclick=()=>{ const k=b.dataset.k; S.f.r[k]=b.dataset.v; keepY(render); if(b.dataset.v==="M"){ const t=$("#o-"+k); t&&t.focus({preventScroll:true}); } });
  $$("[data-hv]").forEach(b=>b.onclick=()=>{ S.f.verif[b.dataset.hid]=b.dataset.hv; keepY(render); });
  $$("[data-hvc]").forEach(i=>i.oninput=()=>{ S.f.verifC[i.dataset.hvc]=i.value; });
  $$("[data-o]").forEach(t=>t.oninput=()=>{ S.f.obs[t.dataset.o]=t.value; });
  $$("[data-fm]").forEach(inp=>inp.onchange=()=>readImg(inp.files[0],url=>{ const k=inp.dataset.fm; (S.f.fotosMalo[k]=S.f.fotosMalo[k]||[]).push({u:url,b:url,m:[]}); keepY(render); }));
  $$("[data-rmm]").forEach(b=>b.onclick=()=>{ S.f.fotosMalo[b.dataset.rmm].splice(Number(b.dataset.i),1); keepY(render); });
  $$("[data-mkm]").forEach(b=>b.onclick=()=>{ const x=S.f.fotosMalo[b.dataset.mkm][Number(b.dataset.i)];
    abrirMarcador(x.b||x.u, x.m||[], (url,m)=>{ x.u=url; x.m=m; keepY(render); saveDraftSoon(); }); });
  $$("[data-notiene]").forEach(b=>b.onclick=()=>{ const k=b.dataset.notiene; S.f.obs[k]=(S.f.obs[k]||"").trim()||"No tiene"; keepY(render); });
  $("#allok").onclick=()=>{ ALL.forEach(i=>{ if(!S.f.r[i.k]) S.f.r[i.k]="B"; }); keepY(render); };
}
function ok2(){ const f=S.f; return ALL.every(i=>f.r[i.k]) && ALL.every(i=>f.r[i.k]!=="M"||(f.obs[i.k]||"").trim()) && abiertos().every(x=>f.verif[x.id]); }

/* ---------------- paso 3: fotos y firmas ---------------- */
function s3(){
  const f=S.f, t=TIPOS[f.tipo];
  return `<div class="stack screen"><div><div class="eyebrow">Paso 4 de 5</div><h1>Fotos y firmas</h1></div>
   <div class="card stack"><h2>Fotos del vehículo</h2><p class="muted small">Todas son obligatorias. En el frente, atrás y los dos lados toca <b>Marcar daños</b> para encerrar golpes o rayones. La del odómetro con el tablero encendido respalda el km.</p>
     <div class="photos">${FOTOS.map(([k,l])=>`<div class="phw"><label class="ph req">${f.fotos[k]?`<img src="${f.fotos[k]}" alt="${l}">`:""}
       <input type="file" accept="image/*" capture="environment" data-f="${k}" aria-label="Foto ${l}"><span class="lbl">${l} *${f.fotos[k]?" ✓":""}</span></label>
       ${MARCABLE.has(k)&&f.fotos[k]?`<button type="button" class="btn sec sm" data-mk="${k}">✎ Marcar daños${(f.marks[k]||[]).length?` (${f.marks[k].length})`:""}</button>`:""}</div>`).join("")}</div>
     ${f.tried&&!fotosOk()?`<div class="err">Faltan fotos: ${FOTOS.filter(([k])=>!f.fotos[k]).map(x=>x[1]).join(", ")}.</div>`:""}</div>
   <div class="card stack"><h2>Daños existentes y observaciones generales</h2><textarea id="gen" placeholder="Pendientes, daños previos, acuerdos con el responsable">${esc(f.gen)}</textarea></div>
   <div class="card stack"><h2>Confirmación</h2>${sigBlock("a",t.a,"nomA")}${sigBlock("b",t.b,"nomB")}${f.tried&&!(f.sig.a&&f.sig.b&&f.nomA.trim()&&f.nomB.trim())?`<div class="err">Faltan nombre o firma.</div>`:""}</div>
   ${CON_CARTA(f.tipo)?`<div class="card stack"><h2>Carta de responsabilidad</h2>
     <p class="small muted" style="margin:0">Pide a ${esc(f.h.cond||"quien recibe")} que la lea. Al firmar acepta las condiciones. Se genera un PDF aparte que se comparte por WhatsApp y se envía por correo junto con el acta.</p>
     <div class="carta">${cartaHTML(cartaDesdeFlujo())}</div>
     ${sigBlock("c","FIRMA DEL PILOTO EN LA CARTA",null)}${f.tried&&!f.sig.c?`<div class="err">Falta la firma del piloto en la carta.</div>`:""}</div>`:""}</div>`;
}
function sigBlock(k,label,nk){
  return `<div class="stack" style="gap:6px"><span class="eyebrow" style="color:var(--muted)">${label}</span>
    ${nk?`<label class="f" for="${nk}"><span>Nombre <b>*</b></span><input id="${nk}" type="text" value="${esc(S.f[nk])}"></label>`:`<b>${esc(S.f.h.cond)}</b>`}
    <canvas class="sig" id="sig-${k}" aria-label="Firma ${label}"></canvas>
    <div class="row" style="justify-content:space-between"><span class="small muted">Firma con el dedo dentro del recuadro.</span><button type="button" class="link" data-clear="${k}">Borrar firma</button></div></div>`;
}
function b3(){
  $$("[data-f]").forEach(inp=>inp.onchange=()=>readImg(inp.files[0],url=>{ const k=inp.dataset.f; S.f.fotos[k]=url; S.f.fotosBase[k]=url; S.f.marks[k]=[]; keepY(render); }));
  $$("[data-mk]").forEach(b=>b.onclick=()=>{ const k=b.dataset.mk, f=S.f;
    abrirMarcador(f.fotosBase[k]||f.fotos[k], f.marks[k]||[], (url,m)=>{ if(!f.fotosBase[k]) f.fotosBase[k]=f.fotos[k]; f.fotos[k]=m.length?url:f.fotosBase[k]; f.marks[k]=m; keepY(render); saveDraftSoon(); }); });
  $("#gen").oninput=e=>S.f.gen=e.target.value;
  ["nomA","nomB"].forEach(id=>{ $("#"+id).oninput=e=>{ S.f[id]=e.target.value; }; });
  ["a","b"].concat(CON_CARTA(S.f.tipo)?["c"]:[]).forEach(initSig);
  $$("[data-clear]").forEach(b=>b.onclick=()=>{ S.f.sig[b.dataset.clear]=null; keepY(render); });
}
function initSig(k){
  const c=$("#sig-"+k), dpr=window.devicePixelRatio||1, r=c.getBoundingClientRect();
  c.width=Math.max(1,r.width*dpr); c.height=Math.max(1,r.height*dpr); const x=c.getContext("2d"); x.scale(dpr,dpr);
  x.lineWidth=2.4; x.lineCap="round"; x.lineJoin="round"; x.strokeStyle="#14213D";
  x.fillStyle="#FFFFFF"; x.fillRect(0,0,r.width,r.height);
  if(S.f.sig[k]){ const im=new Image(); im.onload=()=>x.drawImage(im,0,0,r.width,r.height); im.src=S.f.sig[k]; }
  let drawing=false,last=null,moved=false;
  const pt=e=>{ const b=c.getBoundingClientRect(); return [e.clientX-b.left,e.clientY-b.top]; };
  c.onpointerdown=e=>{ drawing=true; moved=false; last=pt(e); try{c.setPointerCapture(e.pointerId);}catch(_){} };
  c.onpointermove=e=>{ if(!drawing) return; const p=pt(e); x.beginPath(); x.moveTo(last[0],last[1]); x.lineTo(p[0],p[1]); x.stroke(); last=p; moved=true; };
  const end=()=>{ if(!drawing) return; drawing=false; if(moved) S.f.sig[k]=c.toDataURL("image/png"); saveDraftSoon(); };
  c.onpointerup=end; c.onpointercancel=end;
}
function fotosOk(){ return FOTOS.every(([k])=>S.f.fotos[k]); }
function sigOk(){ const f=S.f; return f.sig.a&&f.sig.b&&f.nomA.trim()&&f.nomB.trim()&&(!CON_CARTA(f.tipo)||f.sig.c); }
function ok3(){ return fotosOk()&&sigOk(); }

/* ---------------- paso 4: resumen ---------------- */
function resumen(f){
  const hall=ALL.filter(i=>f.r[i.k]==="M").map(i=>({item:i.t,sec:i.sec,p:i.p,obs:f.obs[i.k]}));
  if(f.h.licvig && f.h.licvig<f.h.fecha) hall.unshift({item:"Licencia de conducir vencida",sec:"Datos del conductor",p:"Alta",obs:`Vigencia ${f.h.licvig}`});
  const estado=f.dec==="T"?"no":(hall.length?"obs":"ok");
  return {hall,estado};
}
const RES_LAB={ok:["APTO","Sin hallazgos nuevos. El vehículo puede circular."],obs:["APTO CON OBSERVACIONES","Puede circular; los hallazgos quedan abiertos para seguimiento."],no:["ENVIADO A TALLER","Decisión del supervisor: no circula hasta cerrar los hallazgos."]};
function s4(){
  const f=S.f, v=f.v, h=f.h, t=TIPOS[f.tipo], {hall,estado}=resumen(f), lab=RES_LAB[estado], altas=hall.filter(x=>x.p==="Alta").length;
  const cnt=c=>ALL.filter(i=>f.r[i.k]===c).length, ab=abiertos();
  return `<div class="stack screen"><div><div class="eyebrow">Paso 5 de 5 · ${t.t}</div><h1>Resumen</h1></div>
   <div class="card stack"><h2>Decisión del supervisor</h2>
     ${altas?`<p class="small" style="margin:0;color:var(--bad)">Hay ${altas} hallazgo${altas>1?"s":""} nuevo${altas>1?"s":""} de prioridad alta. Revisa si el vehículo debe ir a Taller.</p>`:""}
     <div class="seg" style="grid-template-columns:1fr 1fr" role="group" aria-label="Decisión">
       <button type="button" data-dec="C" aria-pressed="${f.dec!=="T"}"><b>Puede circular</b><span>${f.tipo==="E"?"Se entrega al responsable":f.tipo==="D"?"Queda disponible":"Sigue en uso"}</span></button>
       <button type="button" data-dec="T" aria-pressed="${f.dec==="T"}"><b>Enviar a Taller</b><span>Estado: En taller</span></button></div></div>
   <div class="status ${estado}"><b>${lab[0]}</b><p>${lab[1]}</p></div>
   <div class="card stack"><h2>${esc(v.p)} · ${esc(v.m)} ${esc(v.l)} ${esc(v.a||"")}</h2><dl class="kv">
     <dt>Fecha</dt><dd>${h.fecha}</dd><dt>Empresa</dt><dd>${esc(v.e)}</dd>
     <dt>Kilometraje</dt><dd>${fmt(h.km)} km${v.km!=null?` <span class="muted small">(+${fmt(h.km-v.km)})</span>`:""}</dd><dt>Combustible</dt><dd>${h.fuel}</dd>
     <dt>Conductor</dt><dd>${esc(h.cond)}</dd><dt>Licencia</dt><dd>${esc(h.lic)} · vence ${h.licvig}</dd><dt>Área / sede</dt><dd>${esc(h.area||"—")}</dd>
     ${CON_CARTA(f.tipo)?`<dt>Asignación</dt><dd>${esc(asigTxt(h))}</dd><dt>Carta</dt><dd>Firmada por ${esc(h.cond)} · DPI ${esc(dpiFmt(h.dpi))}</dd>`:""}
     <dt>Checklist</dt><dd>${cnt("B")} Bueno · ${cnt("M")} Malo · ${cnt("N")} N/A</dd>
     ${ab.length?`<dt>Hallazgos previos</dt><dd>${ab.filter(x=>f.verif[x.id]==="R").length} resueltos · ${ab.filter(x=>f.verif[x.id]==="S").length} siguen</dd>`:""}</dl></div>
   <div class="card stack"><h2>Hallazgos nuevos (${hall.length})</h2>${hall.length?`<div style="overflow-x:auto"><table class="h"><thead><tr><th>Prioridad</th><th>Ítem</th><th>Observación</th></tr></thead><tbody>
     ${hall.map(x=>`<tr><td class="prio ${x.p}">${x.p}</td><td>${esc(x.item)}<br><span class="muted small">${esc(x.sec)}</span></td><td>${esc(x.obs)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted">Sin hallazgos nuevos.</p>`}</div>
   <p class="note">Al registrar se guarda en la hoja, se genera el PDF del acta${CON_CARTA(f.tipo)?" y el de la carta de responsabilidad":""} y queda listo para compartir por WhatsApp; también se envía por correo. Sin señal, queda guardado en este dispositivo y se envía después.</p></div>`;
}
function b4(){ $$("[data-dec]").forEach(b=>b.onclick=()=>{ S.f.dec=b.dataset.dec; keepY(render); }); }

function flowBar(){
  const b=$("#bar"), s=S.f.step;
  if(s===0){ b.innerHTML=`<button class="btn sec" id="cancel" type="button">Cancelar</button><span class="progress" style="flex:1">Elige el tipo y toca un vehículo</span>`;
    $("#cancel").onclick=()=>{ S.f=null; S.view="home"; kv.del("borrador"); render(); }; return; }
  const okFn=[null,ok1,ok2,ok3,()=>true][s];
  b.innerHTML=`<button class="btn sec" id="back" type="button">Atrás</button>${s===2?`<span class="progress">${ALL.filter(i=>S.f.r[i.k]).length}/${ALL.length}</span>`:""}
    <button class="btn pri" id="next" type="button" ${S.busy?"disabled":""}>${s===4?(S.busy?'<span class="spinner"></span> Registrando':"Registrar"):"Continuar"}</button>`;
  $("#back").onclick=()=>go(s-1);
  $("#next").onclick=()=>{
    if(s===4){ registrar(); return; }
    if(okFn()) go(s+1); else { S.f.tried=true; keepY(render); const e=document.querySelector(".err,.need"); e&&e.scrollIntoView({block:"center"}); }
  };
}

/* ---------------- registrar, cola y PDF ---------------- */
function payload(f){
  return { clientId:f.clientId, tipo:f.tipo, fecha:f.h.fecha, placa:f.v.p, km:Number(f.h.km), fuel:f.h.fuel, cond:f.h.cond.trim(), lic:f.h.lic.trim(), licvig:f.h.licvig,
    area:f.h.area.trim(), items:ALL.map(i=>({k:i.k,sec:i.sec,n:i.n,t:i.t,p:i.p,r:f.r[i.k],obs:f.r[i.k]==="M"?(f.obs[i.k]||"").trim():""})),
    verif:Object.entries(f.verif).map(([id,e])=>({id,e,c:f.verifC[id]||""})), dec:f.dec, firmaA:f.nomA.trim(), firmaB:f.nomB.trim(), gen:f.gen.trim(),
    fotos:Object.fromEntries(FOTOS.filter(([k])=>f.fotos[k]).map(([k])=>[k,f.fotos[k]])),
    fotosMalo:Object.fromEntries(Object.entries(f.fotosMalo).filter(([k,a])=>f.r[k]==="M"&&!SIN_FOTO.has(k)&&a&&a.length).map(([k,a])=>[k,a.slice(0,MAX_FOTOS_FALLA[k]||1).map(x=>x.u)])),
    fotoLic:f.fotoLic, sigA:f.sig.a, sigB:f.sig.b, licVencida:!!(f.h.licvig&&f.h.licvig<f.h.fecha), app:APP_VERSION,
    ...(CON_CARTA(f.tipo)?{asig:f.h.asig, del:f.h.asig==="Temporal"?f.h.del:"", al:f.h.asig==="Temporal"?f.h.al:"", emp:f.h.emp, dpi:dpiLimpio(f.h.dpi), color:f.h.color.trim(), sigC:f.sig.c}:{}) };
}
async function registrar(){
  if(S.busy) return;
  const f=S.f, d=payload(f);
  const meta={v:f.v, abiertos:abiertos(), tipoT:TIPOS[f.tipo].t};
  S.busy=true; render();
  await cola.put({clientId:d.clientId, d, meta, creado:Date.now()});
  await kv.del("borrador");
  try{
    const out=await enviarUno({clientId:d.clientId,d,meta});
    S.busy=false; S.f=null; S.done=out; S.view="done"; render(); window.scrollTo({top:0});
  }catch(e){
    S.busy=false;
    if(e.offline){ S.f=null; S.view="home"; S.msg={t:"Guardado en este dispositivo. Se enviará cuando haya señal."}; await contarCola(); render(); }
    else { S.msg={t:e.message,err:1}; render(); alertBar(e.message); }
  }
}
function alertBar(t){ const b=$("#bar .in")||$("#bar"); const p=document.createElement("div"); p.className="err"; p.style.flexBasis="100%"; p.textContent=t; b.prepend(p); }
async function enviarUno(item){
  const {d,meta}=item;
  const r=await api("guardar",{data:d});
  const res={folio:r.folio, placa:d.placa, tipo:meta.tipoT, res:r.resultado||(d.dec==="T"?"ENVIADO A TALLER":"APTO"), d, meta, nuevos:r.nuevos, resueltos:r.resueltos, vigentes:r.vigentes};
  res.pdf = await pdfActa(d, meta, res);
  if(CON_CARTA(d.tipo) && d.sigC){ res.carta = await pdfCarta(d, meta, res);
    try{ if(!r.repetido || !r.carta) await api("subirPdf",{folio:r.folio,pdf:await blobToDataURL(res.carta),doc:"carta"}); res.subidoCarta=true; }catch(e){ res.subidoCarta=false; res.errCarta=e.message; } }
  try{ if(!r.repetido || !r.pdf) await api("subirPdf",{folio:r.folio,pdf:await blobToDataURL(res.pdf)}); res.subido=true; }catch(e){ res.subido=false; res.errPdf=e.message; }
  await cola.del(item.clientId);
  actualizarLocal(d, r.folio);
  S.listas.unshift(res); await contarCola();
  return res;
}
let _syncing=false;
async function procesarCola(manual){
  if(_syncing || !S.sess || S.sess.rol!=="supervisor") return; _syncing=true;
  const items=await cola.all(); let n=0, err=null;
  for(const it of items){ try{ await enviarUno(it); n++; }catch(e){ err=e; if(e.offline) break; } }
  _syncing=false; await contarCola();
  if(n) S.msg={t:`Se enviaron ${n} registro${n>1?"s":""} pendientes. Están en la pestaña Actas para compartir.`};
  else if(manual && err) S.msg={t:err.message,err:1};
  if(S.view!=="flow") render();
}
async function contarCola(){ S.queue=(await cola.all()).length; }
function actualizarLocal(d,folio){
  const v=S.cat.veh.find(x=>x.p===d.placa); if(!v) return;
  v.km=d.km; v.ui=d.fecha; v.uf=folio;
  if(d.dec==="T") v.st="En taller"; else if(d.tipo==="E"){ v.st="En uso"; v.re=d.cond; } else if(d.tipo==="D"){ v.st="Disponible"; v.re=""; }
  if(d.area) v.ar=d.area;
  const cerr=new Set(d.verif.filter(x=>x.e==="R").map(x=>x.id)); S.cat.hall=S.cat.hall.filter(h=>!cerr.has(h.id));
  d.verif.filter(x=>x.e==="S").forEach(x=>{ const h=S.cat.hall.find(y=>y.id===x.id); if(h&&h.e==="Verificar vigencia") h.e="Pendiente"; });
  ls.set("fc_cat",S.cat);
  cargarCatalogo(false);
}
function blobToDataURL(b){ return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(b); }); }

function readImg(file,cb){
  if(!file) return; const fr=new FileReader();
  fr.onload=()=>{ const im=new Image(); im.onload=()=>{ const m=1280, sc=Math.min(1,m/Math.max(im.width,im.height)); const c=document.createElement("canvas");
    c.width=Math.round(im.width*sc); c.height=Math.round(im.height*sc); c.getContext("2d").drawImage(im,0,0,c.width,c.height); cb(c.toDataURL("image/jpeg",.72)); };
    im.onerror=()=>alertBar("No se pudo leer la imagen."); im.src=fr.result; };
  fr.readAsDataURL(file);
}

/* PDF del acta (jsPDF + autotable) */
function achicar(src,max,q,fondo){ return new Promise(ok=>{ if(!src){ ok(src); return; } const im=new Image();
  im.onload=()=>{ const sc=Math.min(1,max/Math.max(im.width,im.height)); const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(im.width*sc)); c.height=Math.max(1,Math.round(im.height*sc));
    const g=c.getContext("2d"); if(fondo){ g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height); } g.drawImage(im,0,0,c.width,c.height); ok(c.toDataURL("image/jpeg",q)); };
  im.onerror=()=>ok(src); im.src=src; }); }
async function pdfActa(d, meta, res){
  const { jsPDF } = window.jspdf; const doc=new jsPDF({unit:"mm",format:"a4"}); const W=210, M=12;
  // las fuentes estándar del PDF no traen "·": se cambia por guion
  const san=t=>typeof t==="string"?t.replace(/·/g,"-"):t; const _text=doc.text.bind(doc);
  doc.text=(t,...a)=>_text(Array.isArray(t)?t.map(san):san(t),...a);
  const navy=[20,33,61], orange=[181,84,26], gray=[90,99,117];
  const org=(S.cat&&S.cat.org)||"TRANSDA · Gasolineras Don Arturo";
  const head=(title)=>{ doc.setFillColor(...navy); doc.rect(0,0,W,22,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text(title,M,10); doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.text(org+" · Flota Corporativa",M,16);
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.text(res.folio,W-M,10,{align:"right"}); doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.text(d.fecha,W-M,16,{align:"right"}); doc.setTextColor(0,0,0); };
  head("ACTA DE "+meta.tipoT.toUpperCase());
  const v=meta.v;
  doc.autoTable({ startY:27, theme:"plain", styles:{fontSize:9,cellPadding:1.2}, columnStyles:{0:{fontStyle:"bold",textColor:gray,cellWidth:32},2:{fontStyle:"bold",textColor:gray,cellWidth:32}},
    body:[["Placa",d.placa,"Empresa",d.emp||v.ep||v.e||""],["Vehículo",`${v.m||""} ${v.l||""} ${v.a||""}${d.color?" · "+d.color:""}`,"Área / sede",d.area||""],["Kilometraje",fmt(d.km)+" km","Combustible",d.fuel],
      ["Conductor",d.cond,"Licencia",`${d.lic} · vence ${d.licvig}`]].concat(CON_CARTA(d.tipo)&&d.asig?[["Asignación",asigTxt(d),"DPI",dpiFmt(d.dpi)]]:[])
      .concat([["Fecha de inspección",d.fecha,"Próxima inspección",addDays(d.fecha,(S.cat&&S.cat.dias)||30)]]) });
  let y=doc.lastAutoTable.finalY+3;
  const col=res.res==="APTO"?[47,125,91]:res.res==="ENVIADO A TALLER"?[180,35,24]:[154,91,0];
  doc.setFillColor(...col); doc.roundedRect(M,y,W-2*M,9,1.5,1.5,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(11);
  doc.text(`RESULTADO: ${res.res}  ·  Decisión: ${d.dec==="T"?"Enviar a Taller":"Puede circular"}`,M+3,y+6); doc.setTextColor(0,0,0); y+=13;
  const R={B:"Bueno",M:"MALO",N:"N/A"};
  doc.autoTable({ startY:y, head:[["Sección / ítem","Resultado","Observación"]], headStyles:{fillColor:navy,fontSize:8.5}, styles:{fontSize:8,cellPadding:1.1},
    columnStyles:{0:{cellWidth:82},1:{cellWidth:20}},
    body:SECTIONS.flatMap(s=>[[{content:s.t,colSpan:3,styles:{fontStyle:"bold",fillColor:[236,234,227]}}]].concat(
      d.items.filter(i=>i.sec===s.t).map(i=>[`${i.n}. ${i.t}`,R[i.r],i.r==="M"?`${i.obs} (prioridad ${i.p})`:""]))),
    didParseCell:(h)=>{ if(h.section==="body"&&h.column.index===1&&h.cell.raw==="MALO"){ h.cell.styles.textColor=[180,35,24]; h.cell.styles.fontStyle="bold"; } } });
  y=doc.lastAutoTable.finalY+4;
  if(meta.abiertos.length){
    const mapV=Object.fromEntries(d.verif.map(x=>[x.id,x]));
    doc.autoTable({ startY:y, head:[["Hallazgos previos verificados","Origen","Estado"]], headStyles:{fillColor:navy,fontSize:8.5}, styles:{fontSize:8,cellPadding:1.1},
      body:meta.abiertos.map(h=>[h.h,h.o,mapV[h.id]?(mapV[h.id].e==="R"?"Resuelto"+(mapV[h.id].c?": "+mapV[h.id].c:""):"Sigue"):"—"]) });
    y=doc.lastAutoTable.finalY+4;
  }
  if(d.gen){ doc.autoTable({ startY:y, head:[["Daños existentes, observaciones generales y pendientes"]], headStyles:{fillColor:navy,fontSize:8.5}, styles:{fontSize:8.5}, body:[[d.gen]] }); y=doc.lastAutoTable.finalY+4; }
  // firmas
  if(y>235){ doc.addPage(); y=20; }
  const t=TIPOS[d.tipo], sw=(W-2*M-10)/2;
  const sigs=[await achicar(d.sigA,700,.75,true), await achicar(d.sigB,700,.75,true)];
  [[sigs[0],d.firmaA,t.a],[sigs[1],d.firmaB,t.b]].forEach(([img,n,l],i)=>{ const x=M+i*(sw+10);
    try{ doc.addImage(img,"JPEG",x,y,sw,28); }catch(e){}
    doc.setDrawColor(...gray); doc.line(x,y+30,x+sw,y+30); doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.text(n,x,y+35); doc.setFont("helvetica","normal"); doc.setTextColor(...gray); doc.text(l,x,y+40); doc.setTextColor(0,0,0); });
  // fotos
  doc.addPage(); head("FOTOS · "+d.placa);
  const pics=FOTOS.filter(([k])=>d.fotos[k]).map(([k,l])=>[d.fotos[k],l]).concat(Object.entries(d.fotosMalo||{}).flatMap(([k,u])=>{ const a=Array.isArray(u)?u:[u], t=(ALL.find(i=>i.k===k)||{}).t;
    return a.map((x,i)=>[x,"Falla: "+t+(a.length>1?` (${i+1}/${a.length})`:"")]); }));
  const pw=(W-2*M-6)/2, ph=pw*0.75; let px=M, py=28;
  for(let i=0;i<pics.length;i++){
    if(py+ph+8>287){ doc.addPage(); head("FOTOS · "+d.placa); py=28; }
    px=M+(i%2)*(pw+6);
    try{ doc.addImage(await achicar(pics[i][0],1000,.6),"JPEG",px,py,pw,ph,undefined,"FAST"); }catch(e){}
    doc.setFontSize(8.5); doc.setTextColor(...gray); doc.text(String(pics[i][1]).slice(0,60),px,py+ph+4); doc.setTextColor(0,0,0);
    if(i%2===1) py+=ph+9;
  }
  const n=doc.getNumberOfPages();
  for(let i=1;i<=n;i++){ doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...gray); doc.text(`${res.folio} · ${d.placa} · página ${i} de ${n} · registrado por ${S.sess.nombre}`,M,292); }
  return doc.output("blob");
}

function destinatarios(res){
  const out=[]; const r=findResp(res.d.cond);
  out.push({rol:"Responsable",n:res.d.cond,w:r&&r.w});
  out.push({rol:"Jefe directo",n:r&&r.j||"Por definir en la hoja",w:r&&r.wj});
  ((S.cat&&S.cat.contactos)||[]).forEach(c=>out.push({rol:c.rol,n:c.n,w:c.w}));
  return out;
}
function pdfUrl(res){ if(!res.url) res.url=URL.createObjectURL(res.pdf); return res.url; }
function cartaUrl(res){ if(!res.curl) res.curl=URL.createObjectURL(res.carta); return res.curl; }
function pdfNombre(res){ return `${res.folio} ${res.placa}.pdf`; }
function cartaNombre(res){ return `CARTA ${res.folio} ${res.placa}.pdf`; }
async function compartir(res){
  const files=[new File([res.pdf],pdfNombre(res),{type:"application/pdf"})];
  if(res.carta) files.push(new File([res.carta],cartaNombre(res),{type:"application/pdf"}));
  let porque="";
  if(!navigator.share || !navigator.canShare) porque="Este navegador no permite compartir archivos. Abre la app en Chrome (Android) o Safari (iPhone), no dentro de WhatsApp, Facebook u otra app.";
  else if(!navigator.canShare({files})) porque="Este celular no permite compartir estos PDF directo.";
  else {
    // solo los archivos: con texto o título algunas versiones de WhatsApp no adjuntan el PDF
    try{ await navigator.share({files}); return; }
    catch(e){ if(e&&e.name==="AbortError") return; porque="No se pudo abrir el menú de compartir ("+(e&&e.name||"error")+")."; }
  }
  S.msg={t:porque+" Usa «Descargar» y luego adjúntalo en WhatsApp. El acta también se envía por correo.",err:1}; render(); window.scrollTo({top:0});
}
function botonesPdf(res,attr){ return `<button class="btn pri sm" ${attr} type="button">Compartir${res.carta?" acta y carta":" PDF"}</button><a class="btn sec sm" href="${pdfUrl(res)}" download="${esc(pdfNombre(res))}">Descargar acta</a>${res.carta?`<a class="btn sec sm" href="${cartaUrl(res)}" download="${esc(cartaNombre(res))}">Descargar carta</a>`:""}`; }

/* ---------------- carta de responsabilidad ---------------- */
const MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function fechaLarga(iso){ const [y,m,d]=String(iso||"").split("-").map(Number); return y?`${d} de ${MESES[m-1]} de ${y}`:""; }
function dpiFmt(x){ const s=dpiLimpio(x); return /^\d{13}$/.test(s)?`${s.slice(0,4)} ${s.slice(4,9)} ${s.slice(9)}`:s; }
function asigTxt(h){ return h.asig==="Temporal"?`Temporal, del ${h.del} al ${h.al}`:(h.asig||""); }
function empresaLegal(e){ const x=((S.cat&&S.cat.empresas)||[]).find(y=>y.e===e); return (x&&x.rs)||e||"la empresa"; }
function cartaDesdeFlujo(){ const f=S.f, v=f.v, h=f.h; return {fecha:h.fecha, nombre:h.cond.trim(), dpi:dpiFmt(h.dpi), tipoV:v.t, marca:v.m, modelo:`${v.l||""} ${v.a||""}`.trim(), color:h.color.trim(), placa:v.p, empresa:empresaLegal(h.emp), asig:asigTxt(h), folio:""}; }
function cartaDesdeActa(d,meta,res){ const v=meta.v; return {fecha:d.fecha, nombre:d.cond, dpi:dpiFmt(d.dpi), tipoV:v.t, marca:v.m, modelo:`${v.l||""} ${v.a||""}`.trim(), color:d.color, placa:d.placa, empresa:empresaLegal(d.emp), asig:asigTxt(d), folio:res.folio}; }
/* Texto de CARTA_DE_RESPONSABILIDAD.docx; solo se llenan los espacios en blanco */
function cartaPartes(x){
  const E=x.empresa||"la empresa", b=t=>t||"________";
  return { titulo:"CARTA DE RESPONSABILIDAD DE VEHÍCULO CORPORATIVO", sub:"GUATEMALA "+String(x.fecha||"").slice(0,4), dest:"Auditoría Operativa,",
    p1:`En la Ciudad de Guatemala, el ${b(fechaLarga(x.fecha))}, yo, ${b(x.nombre)}, guatemalteco(a), quien me identifico con Documento Personal de Identificación (DPI) con Código Único de Identificación (CUI) número: ${b(x.dpi)} extendido por el Registro Nacional de las Personas de la República de Guatemala, DECLARO QUE: asumo total responsabilidad por el vehículo que me fue asignado, cuyos datos se detallan a continuación:`,
    tabla:[["Tipo de vehículo:",x.tipoV],["Marca:",x.marca],["Modelo:",x.modelo],["Color:",x.color],["Placa:",x.placa]].concat(x.asig?[["Tipo de asignación:",x.asig]]:[]),
    p2:`Dicho vehículo es propiedad de ${E}, se encuentra en perfecto estado de mecánica y carrocería y a partir de la presente fecha reconozco que soy el único responsable del uso y manejo de este, así como de cumplir con todas las normas de tránsito y regulaciones vigentes. Me comprometo a mantener el vehículo en buen estado de funcionamiento, así como de realizar los mantenimientos y reparaciones necesarias de acuerdo con la política de uso de vehículos de la empresa.`,
    p3:`Asimismo, asumo todas las obligaciones de tipo civil, administrativo y penal que pudieran presentarse por el mal uso que hiciera del vehículo dentro y fuera, de los horarios y jornadas de trabajo. En caso de ocurrir algún percance de cualquier tipo informaré de inmediato a mi jefe directo o al departamento legal y por el uso inadecuado me comprometo a pagar la prima por deducible que puede llegar a ser de Q 10,000.00 y en caso de un percance por estado de ebriedad pagaré el 100% de los costos por daños ocasionados. El Vehículo será devuelto en el momento en que cese mi contrato de trabajo con ${E} o cuando sea requerido, en perfectas condiciones de uso.`,
    intro:"Además de lo anterior, me comprometo a:",
    items:[
      ["Uso Exclusivo para Fines Laborales",`El vehículo debe utilizarse únicamente para actividades relacionadas con las responsabilidades laborales asignadas por ${E}. El uso personal está estrictamente prohibido.`],
      ["Mantenimiento y Cuidado del Vehículo","El empleado se compromete a mantener el vehículo en condiciones óptimas, realizar el mantenimiento regular según las indicaciones del fabricante y notificar cualquier problema o necesidad de reparación de inmediato al departamento correspondiente."],
      ["Cumplimiento de las Normativas de Tráfico","Es responsabilidad del empleado cumplir con todas las leyes de tránsito y regulaciones locales mientras conduce el vehículo corporativo. Cualquier infracción o multa será responsabilidad del conductor."],
      ["Reporte de Accidentes o Daños","En caso de accidente, robo o cualquier daño al vehículo, el empleado debe informar de inmediato a su supervisor y completar los formularios de informe de incidentes proporcionados por la empresa."],
      ["Prohibición de Subarriendo o Préstamo",`No se permite al empleado subarrendar, prestar o ceder el vehículo a terceros sin la autorización expresa de ${E}.`],
      ["Limpieza del Vehículo","El piloto será responsable de realizar la limpieza del vehículo asignado como mínimo una vez por semana, tanto en el interior como en el exterior, manteniéndolo en condiciones adecuadas de higiene y presentación. El incumplimiento de esta obligación podrá dar lugar a la aplicación de sanciones administrativas, conforme a las políticas y procedimientos internos de la empresa."],
      ["Reporte de Kilometraje del Vehículo","El piloto está obligado a reportar periódicamente el kilometraje del vehículo asignado a su jefe inmediato o al Supervisor de Flota, conforme a los procedimientos y fechas establecidos por la empresa, proporcionando información veraz y actualizada."],
      ["Devolución del Vehículo","Al término del empleo o al finalizar la asignación del vehículo, el empleado deberá devolverlo con todos los documentos y accesorios en buen estado."],
      ["Responsabilidad Compartida por Daños al Vehículo","En caso de que el vehículo asignado sufra daños derivados de un uso inadecuado o negligente por parte del colaborador, se aplicará la siguiente política de responsabilidad compartida, la cual tendrá una vigencia de un (1) año calendario contado a partir de la fecha del primer reporte de daño registrado:"]],
    escala:[["Primer daño reportado:","El colaborador asumirá el treinta por ciento (30%) del costo total de la reparación, y la empresa cubrirá el setenta por ciento (70%) restante."],
      ["Segundo daño reportado:","El colaborador asumirá el cincuenta por ciento (50%) del costo total de la reparación, y la empresa cubrirá el cincuenta por ciento (50%) restante."],
      ["Tercer daño o más dentro del período de vigencia:","El colaborador será el único responsable de cubrir el cien por ciento (100%) del costo total de la reparación, sin ninguna contribución por parte de la empresa."]],
    nota:"Nota: El período de vigencia de un (1) año iniciará a contarse a partir de la fecha en que se registre oficialmente el primer daño reportado. El reinicio del conteo aplica únicamente para los colaboradores que, al cumplirse el año de vigencia, hayan acumulado un máximo de dos (2) daños. En caso de que el colaborador haya llegado al tercer daño dentro del año de vigencia, el conteo no se reiniciará, y cualquier daño posterior seguirá siendo responsabilidad total del colaborador al cien por ciento (100%).",
    anexo:`El estado del vehículo al momento de la entrega consta en el acta${x.folio?" "+x.folio:" de entrega"} de esta misma fecha, que forma parte de esta carta.`,
    cierre:"Atentamente," };
}
function cartaHTML(x){ const c=cartaPartes(x);
  return `<p style="text-align:center;margin:0"><b>${esc(c.titulo)}</b><br>${esc(c.sub)}</p><p>${esc(c.dest)}</p><p>${esc(c.p1)}</p>
    <table class="ct">${c.tabla.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v||"—")}</td></tr>`).join("")}</table>
    <p>${esc(c.p2)}</p><p>${esc(c.p3)}</p><p>${esc(c.intro)}</p>
    <ol>${c.items.map(([t,b])=>`<li><b>${esc(t)}:</b> ${esc(b)}</li>`).join("")}</ol>
    <ul>${c.escala.map(([t,b])=>`<li><b>${esc(t)}</b> ${esc(b)}</li>`).join("")}</ul><p class="small">${esc(c.nota)}</p><p>${esc(c.anexo)}</p><p>${esc(c.cierre)}</p>`;
}
async function pdfCarta(d, meta, res){
  const { jsPDF } = window.jspdf; const doc=new jsPDF({unit:"mm",format:"letter"}); const W=216, H=279, M=22, TW=W-2*M;
  const san=t=>typeof t==="string"?t.replace(/·/g,"-"):t; const _text=doc.text.bind(doc);
  doc.text=(t,...a)=>_text(Array.isArray(t)?t.map(san):san(t),...a);
  const c=cartaPartes(cartaDesdeActa(d,meta,res)); let y=24; const LH=4.6;
  const salto=h=>{ if(y+h>H-20){ doc.addPage(); y=22; } };
  const para=(t,{bold=false,size=10,indent=0,gap=2.6,align="justify"}={})=>{ doc.setFont("helvetica",bold?"bold":"normal"); doc.setFontSize(size);
    const lines=doc.splitTextToSize(t,TW-indent);
    lines.forEach((ln,i)=>{ salto(LH); const last=i===lines.length-1, w=ln.trim().split(/\s+/);
      if(align==="justify"&&!last&&w.length>1){ const tot=w.reduce((s,x)=>s+doc.getTextWidth(x),0), sp=(TW-indent-tot)/(w.length-1); let xx=M+indent;
        if(sp<6){ w.forEach(x=>{ doc.text(x,xx,y); xx+=doc.getTextWidth(x)+sp; }); } else doc.text(ln,M+indent,y); }
      else doc.text(ln,M+indent,y); y+=LH; }); y+=gap; };
  doc.setFont("helvetica","bold"); doc.setFontSize(12.5); doc.text(c.titulo,W/2,y,{align:"center"}); y+=6;
  doc.setFontSize(10.5); doc.text(c.sub,W/2,y,{align:"center"}); y+=10;
  para(c.dest,{bold:true}); para(c.p1);
  doc.autoTable({ startY:y, margin:{left:M+20,right:M+20}, theme:"grid", styles:{fontSize:10,cellPadding:1.6,lineColor:[180,180,180]}, columnStyles:{0:{fontStyle:"bold",cellWidth:44}}, body:c.tabla.map(([k,v])=>[k,v||""]) });
  y=doc.lastAutoTable.finalY+5;
  para(c.p2); para(c.p3); para(c.intro,{bold:true});
  c.items.forEach(([t,b],i)=>{ doc.setFont("helvetica","bold"); doc.setFontSize(10); salto(LH); doc.text(`${i+1}.`,M+2,y); para(`${t}: ${b}`,{indent:8,gap:1.6}); });
  c.escala.forEach(([t,b])=>para(`${t} ${b}`,{indent:14,gap:1.4}));
  y+=1; para(c.nota,{size:9}); para(c.anexo);
  salto(52); para(c.cierre); y+=2;
  const img=await achicar(d.sigC,700,.8,true);
  try{ doc.addImage(img,"JPEG",M,y,70,26); }catch(e){}
  y+=28; doc.setDrawColor(90,99,117); doc.line(M,y,M+80,y); y+=5;
  doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("f) "+d.cond,M,y); y+=5; doc.setFont("helvetica","normal");
  doc.text("DPI (CUI): "+dpiFmt(d.dpi),M,y); y+=5; doc.text("Fecha: "+fechaLarga(d.fecha),M,y);
  const n=doc.getNumberOfPages();
  for(let i=1;i<=n;i++){ doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(90,99,117); doc.text(`Carta de responsabilidad · ${res.folio} · ${d.placa} · página ${i} de ${n}`,M,H-10); doc.setTextColor(0,0,0); }
  return doc.output("blob");
}

/* ---------------- marcar daños sobre una foto ---------------- */
function abrirMarcador(base, marks, onSave){
  const ov=document.createElement("div"); ov.className="mkov"; ov.setAttribute("role","dialog"); ov.setAttribute("aria-label","Marcar daños en la foto");
  ov.innerHTML=`<div class="mkbar"><button type="button" class="btn sec sm" data-tool="c" aria-pressed="true">◯ Círculo</button><button type="button" class="btn sec sm" data-tool="l" aria-pressed="false">✎ Lápiz</button>
      <button type="button" class="btn sec sm" id="mkundo">Deshacer</button><button type="button" class="btn sec sm" id="mkclr">Borrar todo</button></div>
    <div class="mkwrap"><canvas id="mkc"></canvas></div>
    <p class="mkhelp">Arrastra el dedo sobre el golpe o rayón para encerrarlo en un círculo, o usa el lápiz para dibujar.</p>
    <div class="mkbar"><button type="button" class="btn sec" id="mkno">Cancelar</button><button type="button" class="btn pri" id="mkok">Guardar marcas</button></div>`;
  document.body.appendChild(ov); const prevOv=document.body.style.overflow; document.body.style.overflow="hidden";
  const c=ov.querySelector("#mkc"), x=c.getContext("2d"); let tool="c", list=(marks||[]).map(m=>JSON.parse(JSON.stringify(m))), cur=null, lw=6;
  const im=new Image();
  const dibuja=(m)=>{ [["rgba(255,255,255,.85)",lw+4],["#E0201B",lw]].forEach(([col,w])=>{ x.strokeStyle=col; x.lineWidth=w; x.lineCap="round"; x.lineJoin="round"; x.beginPath();
      if(m.t==="c"){ const cx=(m.x0+m.x1)/2, cy=(m.y0+m.y1)/2, rx=Math.max(4,Math.abs(m.x1-m.x0)/2), ry=Math.max(4,Math.abs(m.y1-m.y0)/2); x.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); }
      else { m.p.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b)); }
      x.stroke(); }); };
  const pinta=()=>{ x.drawImage(im,0,0,c.width,c.height); list.forEach(dibuja); if(cur) dibuja(cur); };
  const pt=e=>{ const r=c.getBoundingClientRect(); return [(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height]; };
  im.onload=()=>{ c.width=im.naturalWidth; c.height=im.naturalHeight; lw=Math.max(4,Math.round(Math.max(c.width,c.height)/180)); pinta(); };
  im.src=base;
  c.onpointerdown=e=>{ e.preventDefault(); try{c.setPointerCapture(e.pointerId);}catch(_){} const [a,b]=pt(e); cur=tool==="c"?{t:"c",x0:a,y0:b,x1:a,y1:b}:{t:"l",p:[[a,b]]}; };
  c.onpointermove=e=>{ if(!cur) return; const [a,b]=pt(e); if(cur.t==="c"){ cur.x1=a; cur.y1=b; } else cur.p.push([a,b]); pinta(); };
  const fin=()=>{ if(!cur) return; const ok=cur.t==="c"?(Math.abs(cur.x1-cur.x0)>lw*2||Math.abs(cur.y1-cur.y0)>lw*2):cur.p.length>1; if(ok) list.push(cur); cur=null; pinta(); };
  c.onpointerup=fin; c.onpointercancel=fin;
  ov.querySelectorAll("[data-tool]").forEach(b=>b.onclick=()=>{ tool=b.dataset.tool; ov.querySelectorAll("[data-tool]").forEach(z=>z.setAttribute("aria-pressed",String(z===b))); });
  ov.querySelector("#mkundo").onclick=()=>{ list.pop(); pinta(); };
  ov.querySelector("#mkclr").onclick=()=>{ list=[]; pinta(); };
  const cerrar=()=>{ ov.remove(); document.body.style.overflow=prevOv; };
  ov.querySelector("#mkno").onclick=cerrar;
  ov.querySelector("#mkok").onclick=()=>{ list.forEach(m=>{ if(m.p&&m.p.length>400) m.p=m.p.filter((_,i)=>i%2===0); }); const url=c.toDataURL("image/jpeg",.8); cerrar(); onSave(url,list); };
}

/* ---------------- pantalla final ---------------- */
function vDone(){
  const r=S.done, lab=RES_LAB[r.res==="APTO"?"ok":r.res==="ENVIADO A TALLER"?"no":"obs"];
  return `<div class="stack screen">${S.msg?`<div class="banner ${S.msg.err?"off":"q"}" role="alert">${esc(S.msg.t)}</div>`:""}<div class="status ${r.res==="APTO"?"ok":r.res==="ENVIADO A TALLER"?"no":"obs"}"><b>Registrado · ${esc(r.folio)}</b><p>${esc(r.tipo)} de ${esc(r.placa)} · ${esc(lab[0])}</p></div>
    <div class="card stack"><h2>Compartir el acta</h2>
      <p class="small muted" style="margin:0">Toca el botón y elige WhatsApp${r.carta?"; se comparten el acta y la carta de responsabilidad":""}. Envíalo a:</p>
      <div class="recip">${destinatarios(r).map(x=>`<div><span><b>${esc(x.n)}</b><br><span class="small muted">${esc(x.rol)}</span></span><span class="small" style="font-variant-numeric:tabular-nums">${esc(x.w||"sin número")}</span></div>`).join("")}</div>
      <button class="btn pri" id="share" type="button">${r.carta?"Compartir acta y carta por WhatsApp":"Compartir PDF por WhatsApp"}</button>
      <a class="btn sec" href="${pdfUrl(r)}" download="${esc(pdfNombre(r))}">Descargar acta</a>
      ${r.carta?`<a class="btn sec" href="${cartaUrl(r)}" download="${esc(cartaNombre(r))}">Descargar carta de responsabilidad</a>`:""}
      ${(S.cat&&S.cat.contactos||[]).length?`<p class="small muted" style="margin:0">El PDF se envía por correo a quienes tienen marcada la casilla ACTAS en Contactos.</p>`:""}
      ${r.subido?`<p class="small muted" style="margin:0">${r.carta?"El acta y la carta quedaron guardadas":"El PDF quedó guardado"} en la carpeta de Actas de Drive.</p>${r.carta&&!r.subidoCarta?`<p class="err" style="margin:0">La carta no se subió a Drive (${esc(r.errCarta||"")}). Compártela desde aquí.</p>`:""}`:`<p class="err" style="margin:0">El acta se registró, pero el PDF no se subió a Drive (${esc(r.errPdf||"")}). Compártelo desde aquí; Logística puede regenerarlo.</p>`}</div>
    <div class="card"><dl class="kv"><dt>Hallazgos nuevos</dt><dd>${r.nuevos??"—"}</dd><dt>Previos resueltos</dt><dd>${r.resueltos??"—"}</dd><dt>Previos que siguen</dt><dd>${r.vigentes??"—"}</dd></dl></div></div>`;
}
function bindDone(){ $("#share").onclick=()=>compartir(S.done); }

/* ---------------- consulta ---------------- */
function vConsulta(){
  if(!S.cat) return `<div class="stack">${banner()}<div class="card"><span class="spinner"></span> Cargando…</div></div>`;
  const tabs=[["res","Resumen"],["prog","Programación"],["actas","Actas"],["hall","Hallazgos"]];
  let body="";
  if(S.ctab==="res"){ const v=S.cat.veh, h=S.cat.hall, c=k=>v.filter(x=>x.st===k).length, ph=k=>h.filter(x=>x.pr===k).length;
    body=`<h2>Estado de la flota</h2><div class="kpis"><div class="kpi"><b>${c("En uso")}</b><span>En uso</span></div><div class="kpi"><b>${c("Disponible")}</b><span>Disponibles</span></div>
      <div class="kpi"><b>${c("En taller")}</b><span>En taller</span></div><div class="kpi"><b>${c("Por verificar")}</b><span>Por verificar</span></div></div>
      <h2>Hallazgos abiertos</h2><div class="kpis"><div class="kpi"><b>${h.length}</b><span>Total</span></div><div class="kpi"><b style="color:var(--bad)">${ph("Alta")}</b><span>Prioridad alta</span></div>
      <div class="kpi"><b>${ph("Media")}</b><span>Media</span></div><div class="kpi"><b>${h.filter(x=>x.e==="Verificar vigencia").length}</b><span>Por verificar vigencia</span></div></div>`; }
  if(S.ctab==="prog") body=vProg(true);
  if(S.ctab==="actas"){ const a=S.actas;
    body=`<form class="card stack" id="factas"><div class="grid2"><label class="f" for="fpl"><span>Placa</span><input id="fpl" type="text" value="${esc(S.actaF.placa)}" placeholder="Todas"></label>
      <label class="f" for="fde"><span>Desde</span><input id="fde" type="date" value="${S.actaF.desde}"></label></div><button class="btn sec" type="submit">Buscar</button></form>
      ${a===null?`<p class="muted">Toca Buscar para ver las actas.</p>`:a.length?`<div class="card list">${a.map(x=>`<div class="li"><span><b>${esc(x.folio)}</b> · ${esc(x.placa)} · ${esc(x.fecha)}<br>
        <span class="small muted">${esc(x.tipo)} · ${esc(x.res)} · ${esc(x.cond)} · ${fmt(x.km)} km</span></span>
        ${x.pdf?(S.pdfLinks[x.folio]?`<a class="btn pri sm" href="${S.pdfLinks[x.folio]}" target="_blank" rel="noopener">Abrir PDF</a>`:`<button class="btn sec sm" data-pdf="${esc(x.folio)}" type="button">Ver PDF</button>`):`<span class="small muted">sin PDF</span>`}</div>`).join("")}</div>`:`<p class="muted">No hay actas con ese filtro.</p>`}`; }
  if(S.ctab==="hall"){ const l=S.cat.hall.filter(x=>!S.hallF||x.pr===S.hallF).sort((a,b)=>a.p.localeCompare(b.p));
    body=`<div class="tabs">${["Alta","Media","Baja",""].map(p=>`<button type="button" data-hf="${p}" aria-selected="${S.hallF===p}">${p||"Todas"}</button>`).join("")}</div>
      <div class="card list">${l.map(x=>`<div class="li"><span><b>${esc(x.p)}</b> · ${esc(x.h)}<br><span class="small muted">${esc(x.o)} · ${esc(x.e)}${x.ri?" · reincidente":""}</span></span><span class="prio ${x.pr} small">${esc(x.pr)}</span></div>`).join("")||`<p class="muted">Sin hallazgos.</p>`}</div>`; }
  return `<div class="stack screen">${banner()}<div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button type="button" role="tab" data-ctab="${k}" aria-selected="${S.ctab===k}">${l}</button>`).join("")}</div>${body}</div>`;
}
function bindConsulta(){
  $$("[data-ctab]").forEach(b=>b.onclick=()=>{ S.ctab=b.dataset.ctab; S.msg=null; render(); });
  $$("[data-hf]").forEach(b=>b.onclick=()=>{ S.hallF=b.dataset.hf; render(); });
  const fa=$("#factas"); if(fa) fa.onsubmit=async e=>{ e.preventDefault(); S.actaF={placa:$("#fpl").value.trim(),desde:$("#fde").value,hasta:""};
    try{ const r=await api("actas",S.actaF); S.actas=r.actas; S.msg=null; }catch(err){ S.msg={t:err.message,err:1}; } render(); };
  $$("[data-pdf]").forEach(b=>b.onclick=async()=>{ b.disabled=true; b.innerHTML='<span class="spinner"></span>';
    try{ const r=await api("pdf",{folio:b.dataset.pdf}); const blob=await (await fetch(r.pdf)).blob(); S.pdfLinks[b.dataset.pdf]=URL.createObjectURL(blob); }
    catch(err){ S.msg={t:err.message,err:1}; } render(); });
}

/* ---------------- arranque ---------------- */
window.addEventListener("online",()=>{ S.online=true; procesarCola(false); if(S.view!=="flow") render(); });
window.addEventListener("offline",()=>{ S.online=false; if(S.view!=="flow") render(); });
window.addEventListener("DOMContentLoaded", async function init(){
  render();
  if(S.sess){ await contarCola(); await cargarCatalogo(false); if(S.sess&&S.sess.rol==="supervisor"){ await revisarBorrador(); procesarCola(false); } }
});
