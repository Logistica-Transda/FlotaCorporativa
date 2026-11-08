/* Flota Corporativa · TRANSDA — app web v1.0 (Supervisor y Consulta) */
"use strict";
const APP_VERSION = "2.0";
const API = (window.FC_CONFIG && window.FC_CONFIG.API_URL) || "";

/* ---------------- checklist (CHECKLIST_2, 34 ítems; prioridad del hallazgo que genera un "Malo") ---------------- */
const SECTIONS = [
 {id:"ext", t:"1. Condición exterior", items:[["Carrocería, pintura, golpes y rayones","Baja"],["Parabrisas y ventanas","Alta"],["Espejos laterales y retrovisor","Media"],
  ["Luces delanteras y traseras","Alta"],["Direccionales y luces de emergencia","Alta"],["Llantas (estado y desgaste)","Alta"],["Aros y tapones (si aplica)","Baja"],
  ["Placas y emblemas","Media"],["Limpiaparabrisas","Media"]]},
 {id:"int", t:"2. Condición interior", items:[["Asientos, tapicería y cinturones","Media"],["Tablero e indicadores","Media"],["Aire acondicionado","Baja"],
  ["Radio y sistema de audio","Baja"],["Manecillas","Media"],["Claxon","Alta"],["Limpieza interior","Baja"]]},
 {id:"mec", t:"3. Condición mecánica y seguridad", items:[["Motor: funcionamiento y ruidos","Alta"],["Sin fugas visibles de aceite o fluidos","Alta"],
  ["Nivel de aceite de motor","Media"],["Nivel de refrigerante","Media"],["Nivel de líquido de frenos","Alta"],["Frenos y freno de estacionamiento","Alta"],
  ["Dirección y suspensión (revisión básica)","Alta"],["Batería","Media"],["Prueba de manejo sin anomalías","Alta"]]},
 {id:"doc", t:"4. Documentos y accesorios", items:[["Tarjeta de circulación","Alta"],["Documentos / calcomanía vigentes (si aplica)","Media"],["Llave principal","Alta"],
  ["Llave de repuesto (si aplica)","Baja"],["Llanta de repuesto","Media"],["Tricket y llave de chuchos","Media"],["Triángulos o conos de seguridad","Media"],
  ["Extintor (si aplica)","Media"],["Otros accesorios asignados","Baja"]]}
];
SECTIONS.forEach(s=>s.items=s.items.map((x,i)=>({k:s.id+"-"+(i+1),n:i+1,t:x[0],p:x[1],sec:s.t})));
const ALL = SECTIONS.flatMap(s=>s.items);
const TIPOS = {
  E:{t:"Entrega",d:"Asignar a un responsable",a:"ENTREGA (supervisor)",b:"RECIBE (responsable)"},
  D:{t:"Devolución",d:"Recibir de vuelta",a:"ENTREGA (responsable)",b:"RECIBE (supervisor)"},
  M:{t:"Inspección mensual",d:"Revisión en sitio",a:"INSPECCIONA (supervisor)",b:"RESPONSABLE del vehículo"},
  A:{t:"Alta de vehículo",d:"Ingreso de vehículo nuevo",a:"ENTREGA (supervisor)",b:"RECIBE (responsable)"}
};
const FOTOS = [["frente","Frente"],["atras","Atrás"],["izq","Lado izquierdo"],["der","Lado derecho"],["odo","Odómetro"],["tab","Tablero encendido"]];
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
    h:{fecha:localISO(), km:"", cond:"", lic:"", licvig:"", area:"", fuel:""},
    r:{}, obs:{}, fotos:{}, fotosMalo:{}, fotoLic:null, verif:{}, verifC:{}, gen:"", dec:"C", sig:{a:null,b:null}, nomA:"", nomB:"", tried:false };
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
function homeBar(){ return `<button class="btn sec" id="reload" type="button">Actualizar datos</button><span class="progress" style="flex:1">v${APP_VERSION}</span><button class="btn sec" id="out" type="button">Salir</button>`; }
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
async function revisarBorrador(){ const d=await kv.get("borrador"); if(d && d.step>0 && d.v) S.draft=d; render(); }
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
     ${need("cond")?`<div class="err">Escribe el nombre del conductor.</div>`:""}
     <div class="grid2"><label class="f" for="lic"><span>No. de licencia <b>*</b></span><input id="lic" type="text" value="${esc(h.lic)}" placeholder="CUI / No. licencia"></label>
       <label class="f" for="licvig"><span>Vigencia de licencia <b>*</b></span><input id="licvig" type="date" value="${h.licvig}"></label></div>
     <div class="row" style="align-items:flex-start;gap:12px"><label class="ph req" style="width:150px;flex:none">${f.fotoLic?`<img src="${f.fotoLic}" alt="Licencia">`:""}
         <input type="file" accept="image/*" capture="environment" id="flic" aria-label="Foto de la licencia"><span class="lbl">Foto de licencia *${f.fotoLic?" ✓":""}</span></label>
       <p class="small muted" style="flex:1;min-width:160px;margin:0">Compara la foto con el número y la fecha de vencimiento escritos. La foto va a una carpeta de acceso restringido.</p></div>
     ${need("lic")||need("licvig")?`<div class="err">Completa número y vigencia de la licencia.</div>`:""}${f.tried&&!f.fotoLic?`<div class="err">Falta la foto de la licencia.</div>`:""}
     ${licE?`<div class="err">${licE}</div>`:""}
     <label class="f" for="area"><span>Área / sede</span><input id="area" type="text" value="${esc(h.area)}" placeholder="Ej. Auditoría Operativa"></label></div></div>`;
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
  ["fecha","km","cond","lic","licvig","area"].forEach(id=>{ const el=$("#"+id);
    el.onchange=()=>{ S.f.h[id]=el.value; if(id==="cond"){ const r=findResp(el.value); if(r){ if(!S.f.h.lic) S.f.h.lic=r.lic||""; if(!S.f.h.licvig) S.f.h.licvig=r.lv||""; } if(S.f.tipo!=="D") S.f.nomB=el.value; else S.f.nomA=el.value; } render(); };
    if(el.type!=="date") el.oninput=()=>{ S.f.h[id]=el.value; }; });
  $$("[data-fuel]").forEach(b=>b.onclick=()=>{S.f.h.fuel=b.dataset.fuel; render();});
}
function ok1(){ const h=S.f.h, k=kmError(); return h.fecha&&h.km!==""&&h.fuel&&h.cond.trim()&&h.lic.trim()&&h.licvig&&S.f.fotoLic&&!(k&&k.block); }

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
        ${v==="M"?`<div class="obs stack" style="gap:6px"><label class="f" for="o-${it.k}"><span>Qué está mal <b>*</b></span><textarea id="o-${it.k}" data-o="${it.k}" placeholder="Ej. rajadura de 20 cm lado copiloto">${esc(f.obs[it.k]||"")}</textarea></label>
           ${need&&f.tried?`<span class="hint">Describe la falla para generar el hallazgo.</span>`:""}
           <label class="ph" style="aspect-ratio:auto;padding:10px;justify-content:flex-start;max-width:260px"><input type="file" accept="image/*" capture="environment" data-fm="${it.k}" aria-label="Foto de la falla">
             <span class="lbl">${f.fotosMalo[it.k]?"Foto agregada ✓ (cambiar)":"Agregar foto de la falla"}</span></label></div>`:""}</div>`}).join("")}</section>`).join("")}</div>`;
}
function keepY(fn){ const y=window.scrollY; fn(); window.scrollTo({top:y}); }
function b2(){
  $$(".tri button[data-k]").forEach(b=>b.onclick=()=>{ const k=b.dataset.k; S.f.r[k]=b.dataset.v; keepY(render); if(b.dataset.v==="M"){ const t=$("#o-"+k); t&&t.focus({preventScroll:true}); } });
  $$("[data-hv]").forEach(b=>b.onclick=()=>{ S.f.verif[b.dataset.hid]=b.dataset.hv; keepY(render); });
  $$("[data-hvc]").forEach(i=>i.oninput=()=>{ S.f.verifC[i.dataset.hvc]=i.value; });
  $$("[data-o]").forEach(t=>t.oninput=()=>{ S.f.obs[t.dataset.o]=t.value; });
  $$("[data-fm]").forEach(inp=>inp.onchange=()=>readImg(inp.files[0],url=>{ S.f.fotosMalo[inp.dataset.fm]=url; keepY(render); }));
  $("#allok").onclick=()=>{ ALL.forEach(i=>{ if(!S.f.r[i.k]) S.f.r[i.k]="B"; }); keepY(render); };
}
function ok2(){ const f=S.f; return ALL.every(i=>f.r[i.k]) && ALL.every(i=>f.r[i.k]!=="M"||(f.obs[i.k]||"").trim()) && abiertos().every(x=>f.verif[x.id]); }

/* ---------------- paso 3: fotos y firmas ---------------- */
function s3(){
  const f=S.f, t=TIPOS[f.tipo];
  return `<div class="stack screen"><div><div class="eyebrow">Paso 4 de 5</div><h1>Fotos y firmas</h1></div>
   <div class="card stack"><h2>Fotos del vehículo</h2><p class="muted small">Obligatorias: los 4 lados y el odómetro. La del odómetro respalda el km registrado.</p>
     <div class="photos">${FOTOS.map(([k,l])=>`<label class="ph ${k!=="tab"?"req":""}">${f.fotos[k]?`<img src="${f.fotos[k]}" alt="${l}">`:""}
       <input type="file" accept="image/*" capture="environment" data-f="${k}" aria-label="Foto ${l}"><span class="lbl">${l}${k!=="tab"?" *":""}${f.fotos[k]?" ✓":""}</span></label>`).join("")}</div>
     ${f.tried&&!fotosOk()?`<div class="err">Faltan fotos obligatorias.</div>`:""}</div>
   <div class="card stack"><h2>Daños existentes y observaciones generales</h2><textarea id="gen" placeholder="Pendientes, daños previos, acuerdos con el responsable">${esc(f.gen)}</textarea></div>
   <div class="card stack"><h2>Confirmación</h2>${sigBlock("a",t.a,"nomA")}${sigBlock("b",t.b,"nomB")}${f.tried&&!sigOk()?`<div class="err">Faltan nombre o firma.</div>`:""}</div></div>`;
}
function sigBlock(k,label,nk){
  return `<div class="stack" style="gap:6px"><span class="eyebrow" style="color:var(--muted)">${label}</span>
    <label class="f" for="${nk}"><span>Nombre <b>*</b></span><input id="${nk}" type="text" value="${esc(S.f[nk])}"></label>
    <canvas class="sig" id="sig-${k}" aria-label="Firma ${label}"></canvas>
    <div class="row" style="justify-content:space-between"><span class="small muted">Firma con el dedo dentro del recuadro.</span><button type="button" class="link" data-clear="${k}">Borrar firma</button></div></div>`;
}
function b3(){
  $$("[data-f]").forEach(inp=>inp.onchange=()=>readImg(inp.files[0],url=>{ S.f.fotos[inp.dataset.f]=url; keepY(render); }));
  $("#gen").oninput=e=>S.f.gen=e.target.value;
  ["nomA","nomB"].forEach(id=>{ $("#"+id).oninput=e=>{ S.f[id]=e.target.value; }; });
  ["a","b"].forEach(initSig);
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
function fotosOk(){ return FOTOS.filter(f=>f[0]!=="tab").every(([k])=>S.f.fotos[k]); }
function sigOk(){ const f=S.f; return f.sig.a&&f.sig.b&&f.nomA.trim()&&f.nomB.trim(); }
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
     <dt>Checklist</dt><dd>${cnt("B")} Bueno · ${cnt("M")} Malo · ${cnt("N")} N/A</dd>
     ${ab.length?`<dt>Hallazgos previos</dt><dd>${ab.filter(x=>f.verif[x.id]==="R").length} resueltos · ${ab.filter(x=>f.verif[x.id]==="S").length} siguen</dd>`:""}</dl></div>
   <div class="card stack"><h2>Hallazgos nuevos (${hall.length})</h2>${hall.length?`<div style="overflow-x:auto"><table class="h"><thead><tr><th>Prioridad</th><th>Ítem</th><th>Observación</th></tr></thead><tbody>
     ${hall.map(x=>`<tr><td class="prio ${x.p}">${x.p}</td><td>${esc(x.item)}<br><span class="muted small">${esc(x.sec)}</span></td><td>${esc(x.obs)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted">Sin hallazgos nuevos.</p>`}</div>
   <p class="note">Al registrar se guarda en la hoja, se genera el PDF del acta y queda listo para compartir por WhatsApp. Sin señal, queda guardado en este dispositivo y se envía después.</p></div>`;
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
    fotos:f.fotos, fotosMalo:Object.fromEntries(Object.entries(f.fotosMalo).filter(([k])=>f.r[k]==="M")), fotoLic:f.fotoLic, sigA:f.sig.a, sigB:f.sig.b,
    licVencida:!!(f.h.licvig&&f.h.licvig<f.h.fecha) };
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
  if(n) S.msg={t:`Se enviaron ${n} registro${n>1?"s":""} pendientes. Están en "Enviados hoy" para compartir.`};
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
    body:[["Placa",d.placa,"Empresa",v.e||""],["Vehículo",`${v.m||""} ${v.l||""} ${v.a||""}`,"Área / sede",d.area||""],["Kilometraje",fmt(d.km)+" km","Combustible",d.fuel],
      ["Conductor",d.cond,"Licencia",`${d.lic} · vence ${d.licvig}`]] });
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
  [[d.sigA,d.firmaA,t.a],[d.sigB,d.firmaB,t.b]].forEach(([img,n,l],i)=>{ const x=M+i*(sw+10);
    try{ doc.addImage(img,"PNG",x,y,sw,28); }catch(e){}
    doc.setDrawColor(...gray); doc.line(x,y+30,x+sw,y+30); doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.text(n,x,y+35); doc.setFont("helvetica","normal"); doc.setTextColor(...gray); doc.text(l,x,y+40); doc.setTextColor(0,0,0); });
  // fotos
  doc.addPage(); head("FOTOS · "+d.placa);
  const pics=FOTOS.filter(([k])=>d.fotos[k]).map(([k,l])=>[d.fotos[k],l]).concat(Object.entries(d.fotosMalo||{}).map(([k,u])=>[u,"Falla: "+(ALL.find(i=>i.k===k)||{}).t]));
  const pw=(W-2*M-6)/2, ph=pw*0.75; let px=M, py=28;
  for(let i=0;i<pics.length;i++){
    if(py+ph+8>287){ doc.addPage(); head("FOTOS · "+d.placa); py=28; }
    px=M+(i%2)*(pw+6);
    try{ doc.addImage(pics[i][0],"JPEG",px,py,pw,ph,undefined,"FAST"); }catch(e){}
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
async function compartir(res){
  const name=`${res.folio} ${res.placa}.pdf`; const file=new File([res.pdf],name,{type:"application/pdf"});
  const text=`Acta ${res.folio} · ${res.tipo} · ${res.placa} · ${res.res}`;
  try{ if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:name,text}); return; } }catch(e){ if(e&&e.name==="AbortError") return; }
  const a=document.createElement("a"); a.href=URL.createObjectURL(res.pdf); a.download=name; document.body.appendChild(a); a.click(); a.remove();
  S.msg={t:"Este dispositivo no permite compartir archivos directo: se descargó el PDF para que lo envíes por WhatsApp."}; render();
}

/* ---------------- pantalla final ---------------- */
function vDone(){
  const r=S.done, lab=RES_LAB[r.res==="APTO"?"ok":r.res==="ENVIADO A TALLER"?"no":"obs"];
  return `<div class="stack screen"><div class="status ${r.res==="APTO"?"ok":r.res==="ENVIADO A TALLER"?"no":"obs"}"><b>Registrado · ${esc(r.folio)}</b><p>${esc(r.tipo)} de ${esc(r.placa)} · ${esc(lab[0])}</p></div>
    <div class="card stack"><h2>Compartir el acta</h2>
      <p class="small muted" style="margin:0">Toca el botón y elige WhatsApp. Envíalo a:</p>
      <div class="recip">${destinatarios(r).map(x=>`<div><span><b>${esc(x.n)}</b><br><span class="small muted">${esc(x.rol)}</span></span><span class="small" style="font-variant-numeric:tabular-nums">${esc(x.w||"sin número")}</span></div>`).join("")}</div>
      <button class="btn pri" id="share" type="button">Compartir PDF por WhatsApp</button>
      ${r.subido?`<p class="small muted" style="margin:0">El PDF quedó guardado en la carpeta de Actas de Drive.</p>`:`<p class="err" style="margin:0">El acta se registró, pero el PDF no se subió a Drive (${esc(r.errPdf||"")}). Compártelo desde aquí; Logística puede regenerarlo.</p>`}</div>
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
