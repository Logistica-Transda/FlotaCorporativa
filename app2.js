/* Flota Corporativa v2.0 — módulos del supervisor y consulta: vehículos, servicios, fallas, km semanal y tableros.
   Reemplaza la pantalla de inicio de app.js (vHome / vConsulta). */
"use strict";
Object.assign(S, { vq:"", vedit:null, vbaja:null, sq:"", sreg:null, sprog:{}, kms:null, tb:null, tbF:{sem:12,emp:"",area:"",tipo:""}, fall:null, fallVer:"abiertas", fallAct:null, servVer:"coord" });
const TIPOS_VEH = ["AUTOMÓVIL","CAMIONETA","PICK UP","PANEL","CAMIÓN","BUS"];
const MOTIVOS_BAJA = ["Venta","Pérdida total (siniestro)","Robo","Traslado a otra empresa","Fin de arrendamiento","Otro"];
const SERV_NOMBRES = ["Menor 1","Menor 2","Menor 3","Intermedio","Menor 5","Menor 6","Menor 7","Mayor"];
const sel = (id,opts,val,ph)=>`<select id="${id}">${ph!=null?`<option value="">${esc(ph)}</option>`:""}${opts.map(o=>{ const v=typeof o==="string"?o:o.v, l=typeof o==="string"?o:o.l; return `<option value="${esc(v)}" ${String(val)===String(v)?"selected":""}>${esc(l)}</option>`; }).join("")}</select>`;
const fld = (id,label,html,req)=>`<label class="f" for="${id}"><span>${label}${req?" <b>*</b>":""}</span>${html}</label>`;
const inp = (id,val,type="text",extra="")=>`<input id="${id}" type="${type}" value="${esc(val??"")}" ${extra}>`;
const seChip = s=>({"VENCIDO":"venc","PRÓXIMO":"sem","AL DÍA":"ok"}[s]||"nunca");
const hoyISO = ()=>localISO();
function allAreas(){ const s=new Set(); (S.cat.empresas||[]).forEach(e=>e.a.forEach(a=>s.add(a))); S.cat.veh.forEach(v=>v.ar&&s.add(v.ar)); return [...s].sort(); }
function allEmpresasVeh(){ return [...new Set(S.cat.veh.map(v=>v.e).filter(Boolean).concat((S.cat.empresas||[]).map(e=>e.e)))].sort(); }

/* =========================== inicio supervisor =========================== */
const SUP_TABS=[["prog","Inspecciones"],["nuevo","Nuevo registro"],["veh","Vehículos"],["serv","Servicios"],["fallas","Fallas"],["km","Km semanal"],["tab","Tableros"],["env","Actas"]];
const CON_TABS=[["res","Resumen"],["tab","Tableros"],["serv","Servicios"],["fallas","Fallas"],["km","Km semanal"],["prog","Inspecciones"],["actas","Actas"],["hall","Hallazgos"]];
function tabsBar(list,cur,attr){ return `<div class="tabs" role="tablist">${list.map(([k,l])=>{ const n=k==="fallas"?(S.cat.fallas||[]).length:k==="km"?S.cat.alertas:0;
  return `<button type="button" role="tab" data-${attr}="${k}" aria-selected="${cur===k}">${l}${n?` <span class="chip venc" style="margin-left:4px">${n}</span>`:""}</button>`; }).join("")}</div>`; }

vHome = function(){
  if(!S.cat) return `<div class="stack">${banner()}<div class="card"><span class="spinner"></span> Cargando vehículos…</div></div>`;
  let body="";
  if(S.tab==="prog") body=vProg(false);
  if(S.tab==="nuevo") body=`<div class="card stack"><p style="margin:0">Entrega, devolución o inspección mensual de un vehículo del maestro.</p><button class="btn pri" id="start" type="button">Empezar registro</button>
    <p class="small muted" style="margin:0">Para un vehículo nuevo usa <b>Vehículos ▸ Agregar vehículo</b>: al guardarlo sigue el checklist de alta.</p></div>`;
  if(S.tab==="veh") body=vVehiculos(false);
  if(S.tab==="serv") body=vServicios(false);
  if(S.tab==="fallas") body=vFallas(false);
  if(S.tab==="km") body=vKm(false);
  if(S.tab==="tab") body=vTablero();
  if(S.tab==="env") body = (S.listas.length ? `<h2>Enviadas en esta sesión</h2><div class="card list">${S.listas.map((x,i)=>`<div class="li"><span><b>${esc(x.folio)}</b> · ${esc(x.placa)}<br><span class="small muted">${esc(x.tipo)} · ${esc(x.res)}</span></span>
      <span class="row">${botonesPdf(x,`data-share="${i}"`)}</span></div>`).join("")}</div>` : "") + `<h2>Buscar actas anteriores</h2>` + vActas();
  return `<div class="stack screen">${banner()}
    ${S.draft?`<div class="card row" style="justify-content:space-between"><span>Tienes un registro sin terminar: <b>${esc(S.draft.v?S.draft.v.p:"sin vehículo")}</b> · ${esc(TIPOS[S.draft.tipo].t)}</span><span class="row"><button class="btn sec sm" id="ddel" type="button">Descartar</button><button class="btn pri sm" id="dgo" type="button">Continuar</button></span></div>`:""}
    ${tabsBar(SUP_TABS,S.tab,"tab")}${body}</div>`;
};
bindHome = function(){
  bindBanner();
  $$("[data-tab]").forEach(b=>b.onclick=()=>{ S.tab=b.dataset.tab; S.msg=null; S.vedit=null; S.sreg=null; render(); loadTab(); window.scrollTo({top:0}); });
  $$("[data-insp]").forEach(b=>b.onclick=()=>{ S.f=newFlow("M"); S.view="flow"; pick(b.dataset.insp); });
  const st=$("#start"); if(st) st.onclick=()=>{ S.f=newFlow("M"); S.view="flow"; render(); };
  $$("[data-share]").forEach(b=>b.onclick=()=>compartir(S.listas[Number(b.dataset.share)]));
  bindActas();
  const dg=$("#dgo"); if(dg) dg.onclick=()=>{ S.f=S.draft; S.draft=null; S.view="flow"; render(); };
  const dd=$("#ddel"); if(dd) dd.onclick=()=>{ S.draft=null; kv.del("borrador"); render(); };
  bindModulos(false);
};
vConsulta = function(){
  if(!S.cat) return `<div class="stack">${banner()}<div class="card"><span class="spinner"></span> Cargando…</div></div>`;
  let body="";
  if(S.ctab==="res"){ const v=S.cat.veh, h=S.cat.hall, c=k=>v.filter(x=>x.st===k).length, ph=k=>h.filter(x=>x.pr===k).length, ck=v.filter(x=>x.ck), se=k=>ck.filter(x=>x.se===k).length;
    body=`<h2>Estado de la flota</h2><div class="kpis"><div class="kpi"><b>${c("En uso")}</b><span>En uso</span></div><div class="kpi"><b>${c("Disponible")}</b><span>Disponibles</span></div>
      <div class="kpi"><b>${c("En taller")+c("Con falla")}</b><span>En taller o con falla</span></div><div class="kpi"><b>${c("Por verificar")}</b><span>Por verificar</span></div></div>
      <h2>Servicios preventivos (${ck.length} con control de km)</h2><div class="kpis"><div class="kpi"><b class="bad-txt">${se("VENCIDO")}</b><span>Vencidos</span></div><div class="kpi"><b class="warn-txt">${se("PRÓXIMO")}</b><span>Próximos</span></div>
      <div class="kpi"><b>${se("AL DÍA")}</b><span>Al día</span></div><div class="kpi"><b>${se("POR COMPLETAR")}</b><span>Sin dato</span></div></div>
      <h2>Hallazgos y fallas abiertos</h2><div class="kpis"><div class="kpi"><b>${h.length}</b><span>Hallazgos</span></div><div class="kpi"><b class="bad-txt">${ph("Alta")}</b><span>Hallazgos prioridad alta</span></div>
      <div class="kpi"><b>${(S.cat.fallas||[]).length}</b><span>Fallas abiertas</span></div><div class="kpi"><b>${S.cat.alertas}</b><span>Alertas sin revisar</span></div></div>`; }
  if(S.ctab==="prog") body=vProg(true);
  if(S.ctab==="serv") body=vServicios(true);
  if(S.ctab==="fallas") body=vFallas(true);
  if(S.ctab==="km") body=vKm(true);
  if(S.ctab==="tab") body=vTablero();
  if(S.ctab==="actas"||S.ctab==="hall"){ const save=S.ctab; body=vConsultaV1(); S.ctab=save; }
  return `<div class="stack screen">${banner()}${tabsBar(CON_TABS,S.ctab,"ctab")}${body}</div>`;
};
function vActas(){ const a=S.actas; S.pdfB=S.pdfB||{};
  return `<form class="card stack" id="factas"><div class="grid2"><label class="f" for="fpl"><span>Placa</span><input id="fpl" type="text" value="${esc(S.actaF.placa)}" placeholder="Todas"></label>
      <label class="f" for="fde"><span>Desde</span><input id="fde" type="date" value="${S.actaF.desde}"></label></div><button class="btn sec" type="submit">Buscar</button></form>
    ${a===null?`<p class="muted">Toca Buscar para ver las actas.</p>`:a.length?`<div class="card list">${a.map(x=>{ const b=S.pdfB[x.folio];
      return `<div class="li"><span><b>${esc(x.folio)}</b> · ${esc(x.placa)} · ${esc(x.fecha)}<br><span class="small muted">${esc(x.tipo)} · ${esc(x.res)} · ${esc(x.cond)} · ${fmt(x.km)} km${x.carta?" · con carta":""}</span></span>
      <span class="row">${!x.pdf?`<span class="small muted">sin PDF</span>`:b?botonesPdf(b,`data-sharef="${esc(x.folio)}"`)+`<a class="btn sec sm" href="${pdfUrl(b)}" target="_blank" rel="noopener">Abrir</a>`:`<button class="btn sec sm" data-pdf="${esc(x.folio)}" type="button">Preparar PDF${x.carta?"s":""}</button>`}</span></div>`; }).join("")}</div>`:`<p class="muted">No hay actas con ese filtro.</p>`}`;
}
function bindActas(){
  const fa=$("#factas"); if(fa) fa.onsubmit=async e=>{ e.preventDefault(); S.actaF={placa:$("#fpl").value.trim().toUpperCase(),desde:$("#fde").value,hasta:""};
    try{ const r=await api("actas",S.actaF); S.actas=r.actas; S.msg=null; }catch(err){ S.msg={t:err.message,err:1}; } render(); };
  $$("[data-pdf]").forEach(b=>b.onclick=async()=>{ b.disabled=true; b.innerHTML='<span class="spinner"></span>';
    try{ const folio=b.dataset.pdf, x=(S.actas||[]).find(a=>a.folio===folio)||{};
      const traer=async doc=>{ const r=await api("pdf",{folio,doc}); return new Blob([await (await fetch(r.pdf)).blob()],{type:"application/pdf"}); };
      const pdf=await traer(""), carta=x.carta?await traer("carta").catch(()=>null):null;
      S.pdfB=S.pdfB||{}; S.pdfB[folio]={folio, placa:x.placa||"", pdf, carta}; }
    catch(err){ S.msg={t:err.message,err:1}; } render(); });
  $$("[data-sharef]").forEach(b=>b.onclick=()=>compartir(S.pdfB[b.dataset.sharef]));
}
function vConsultaV1(){ // actas y hallazgos de la v1
  if(S.ctab==="actas") return vActas();
  if(false){ const a=S.actas;
    return `<form class="card stack" id="factas"><div class="grid2"><label class="f" for="fpl"><span>Placa</span><input id="fpl" type="text" value="${esc(S.actaF.placa)}" placeholder="Todas"></label>
      <label class="f" for="fde"><span>Desde</span><input id="fde" type="date" value="${S.actaF.desde}"></label></div><button class="btn sec" type="submit">Buscar</button></form>
      ${a===null?`<p class="muted">Toca Buscar para ver las actas.</p>`:a.length?`<div class="card list">${a.map(x=>`<div class="li"><span><b>${esc(x.folio)}</b> · ${esc(x.placa)} · ${esc(x.fecha)}<br>
        <span class="small muted">${esc(x.tipo)} · ${esc(x.res)} · ${esc(x.cond)} · ${fmt(x.km)} km</span></span>
        ${x.pdf?(S.pdfLinks[x.folio]?`<a class="btn pri sm" href="${S.pdfLinks[x.folio]}" target="_blank" rel="noopener">Abrir PDF</a>`:`<button class="btn sec sm" data-pdf="${esc(x.folio)}" type="button">Ver PDF</button>`):`<span class="small muted">sin PDF</span>`}</div>`).join("")}</div>`:`<p class="muted">No hay actas con ese filtro.</p>`}`; }
  const l=S.cat.hall.filter(x=>!S.hallF||x.pr===S.hallF).sort((a,b)=>a.p.localeCompare(b.p));
  return `<div class="tabs">${["Alta","Media","Baja",""].map(p=>`<button type="button" data-hf="${p}" aria-selected="${S.hallF===p}">${p||"Todas"}</button>`).join("")}</div>
    <div class="card list">${l.map(x=>`<div class="li"><span><b>${esc(x.p)}</b> · ${esc(x.h)}<br><span class="small muted">${esc(x.o)} · ${esc(x.e)}${x.ri?" · reincidente":""}</span></span><span class="prio ${x.pr} small">${esc(x.pr)}</span></div>`).join("")||`<p class="muted">Sin hallazgos.</p>`}</div>`;
}
bindConsulta = function(){
  bindBanner();
  $$("[data-ctab]").forEach(b=>b.onclick=()=>{ S.ctab=b.dataset.ctab; S.msg=null; render(); loadTab(); window.scrollTo({top:0}); });
  $$("[data-hf]").forEach(b=>b.onclick=()=>{ S.hallF=b.dataset.hf; render(); });
  bindActas();
  bindModulos(true);
};
function curTab(){ return S.sess.rol==="consulta"?S.ctab:S.tab; }
async function loadTab(){
  const t=curTab();
  try{
    if(t==="km"){ S.kms=null; render(); S.kms=await api("kmSemana"); }
    if(t==="tab"){ S.tb=null; render(); S.tb=await api("tablero",{semanas:S.tbF.sem}); }
    if(t==="fallas"&&S.fallVer==="todas"){ S.fall=null; render(); S.fall=(await api("fallas")).fallas; }
  }catch(e){ S.msg={t:e.message,err:1}; }
  if(S.view==="home") keepY(render);
}
function bindModulos(ro){
  const t=curTab();
  if(t==="veh") bVehiculos(); if(t==="serv") bServicios(ro); if(t==="fallas") bFallas(ro); if(t==="km") bKm(ro); if(t==="tab") bTablero();
}
async function accion(fn,okMsg){
  S.busy=true; keepY(render);
  try{ await fn(); S.busy=false; S.msg={t:okMsg}; await cargarCatalogo(false); }
  catch(e){ S.busy=false; S.msg={t:e.message,err:1}; keepY(render); }
  window.scrollTo({top:0});
}

/* =========================== Vehículos (alta / edición / baja) =========================== */
function vVehiculos(){
  if(S.vbaja) return vBaja();
  if(S.vedit) return vVehForm();
  const q=S.vq.trim().toUpperCase();
  const list=S.cat.veh.filter(v=>!q||(v.p+" "+v.m+" "+v.l+" "+v.re+" "+v.pa+" "+v.ar+" "+v.e+" "+v.u).toUpperCase().includes(q));
  const pend=v=>[!v.cbo&&"combustible",!v.mto&&"mantenimiento",v.sg!=="Sí"&&v.sg!=="No"&&"seguro",v.gps!=="Sí"&&v.gps!=="No"&&"GPS",!v.tc&&"tarjeta"].filter(Boolean);
  const sinConf=S.cat.veh.filter(v=>pend(v).length).length;
  return `<div class="row" style="justify-content:space-between"><span class="small muted">${S.cat.veh.length} vehículos activos · ${S.cat.veh.filter(v=>v.ck).length} con control de km · ${sinConf} con datos por confirmar</span>
      <button class="btn pri sm" id="vnew" type="button">+ Agregar vehículo</button></div>
    <div class="card stack"><label class="f" for="vq"><span>Buscar</span><input id="vq" type="search" value="${esc(S.vq)}" placeholder="Placa, marca, responsable, área…" autocomplete="off"></label>
    <div class="vlist" style="max-height:none">${list.slice(0,120).map(v=>{ const p=pend(v); return `<button type="button" class="veh" data-vedit="${esc(v.p)}">
      <span class="plate">${esc(v.p)}</span><span><b>${esc(v.m)} ${esc(v.l)}</b> ${v.a?"· "+esc(v.a):""}</span><span class="chip ${v.ck?"ok":"nunca"}">${v.ck?"Control km":"Sin control km"}</span>
      <span class="sub">${esc(v.ar||"Área por asignar")} · ${esc(v.re||"sin responsable")}${v.pa?" ("+esc(v.pa)+")":""} · ${esc(v.st)}${p.length?` · <span class="warn-txt">por confirmar: ${p.join(", ")}</span>`:""}</span></button>`; }).join("")||`<p class="muted">Sin resultados.</p>`}</div></div>`;
}
function vehForm(v){
  return { nuevo:!v, PLACA:v?v.p:"", PLACA_ACTUAL:v?v.p:"", EMPRESA:v?v.e:"", TIPO:v?v.t:"", CLASE:v?v.c:"Liviano", MARCA:v?v.m:"", LINEA:v?v.l:"", ANIO:v?v.a:"", COLOR:v?(v.co||""):"", VIN:v?v.vin:"",
    KM_ACTUAL:"", AREA:v?v.ar:"", RESPONSABLE:v?v.re:"", PILOTO_ASIGNADO:v?v.pa:"", TEL_PILOTO:v?v.tel:"", ASIGNACION:v?v.as:"Por definir", UBICACION:v?(v.u==="Por asignar"?"":v.u):"",
    CONTROL_KM:v?(v.ck?"Sí":"No"):"Sí", COMBUSTIBLE:v?v.cb:"", MANTENIMIENTO:v?v.mt:"", AGENCIA_HASTA_KM:v&&v.ah!=null?v.ah:"", INTERVALO_KM:v?v.iv:(S.cat.intervalo||5000),
    PROX_SERV_KM:v&&v.px!=null?v.px:"", SEGURO:v?v.sg:"", ASEGURADORA:v?v.sga:"", POLIZA:v?v.sgp:"", SEGURO_VENCE:v?v.sgv:"", GPS:v?v.gps:"", GPS_PROVEEDOR:v?v.gpp:"",
    NOTAS:v?v.n:"", tarjeta:null, tc:v?v.tc:false, cbo:v?v.cbo:false, mto:v?v.mto:false, tried:false };
}
function vVehForm(){
  const f=S.vedit, need=k=>f.tried&&!String(f[k]??"").trim();
  const tp=hoyISO()>=S.cat.tallerPropioDesde;
  const yn=(k,lab)=>`<div class="stack" style="gap:6px"><span class="small muted">${lab} <b class="err">*</b></span><div class="seg" style="grid-template-columns:1fr 1fr">
    <button type="button" data-vyn="${k}" data-v="Sí" aria-pressed="${f[k]==="Sí"}"><b>Sí</b></button><button type="button" data-vyn="${k}" data-v="No" aria-pressed="${f[k]==="No"}"><b>No</b></button></div>
    ${f.tried&&f[k]!=="Sí"&&f[k]!=="No"?`<span class="err small">Confirma esta respuesta.</span>`:""}</div>`;
  return `<div class="stack screen"><div class="row" style="justify-content:space-between"><h2>${f.nuevo?"Agregar vehículo":"Editar "+esc(f.PLACA_ACTUAL)}</h2><button class="link" id="vcancel" type="button">Volver a la lista</button></div>
   ${S.msg&&S.msg.err?`<div class="banner off">${esc(S.msg.t)}</div>`:""}
   <section class="card stack"><div class="sec-h">Identificación</div><div class="fgrid">
     ${fld("vPLACA","Placa",inp("vPLACA",f.PLACA,"text",`style="text-transform:uppercase" ${!f.nuevo&&!/^PEND-/.test(f.PLACA_ACTUAL)?"disabled":""} placeholder="P123ABC o PENDIENTE"`),f.nuevo)}
     ${fld("vEMPRESA","Empresa (propietaria / póliza)",sel("vEMPRESA",allEmpresasVeh(),f.EMPRESA,"Elegir"),true)}
     ${fld("vTIPO","Tipo",sel("vTIPO",TIPOS_VEH,f.TIPO,"Elegir"),true)}${fld("vCLASE","Clase",sel("vCLASE",["Liviano","Camión","Pesado (validar alcance)"],f.CLASE))}
     ${fld("vMARCA","Marca",inp("vMARCA",f.MARCA),true)}${fld("vLINEA","Línea / modelo",inp("vLINEA",f.LINEA))}
     ${fld("vANIO","Año",inp("vANIO",f.ANIO,"number","inputmode=numeric"))}${fld("vCOLOR","Color",inp("vCOLOR",f.COLOR,"text",'placeholder="Ej. Blanco"'))}${fld("vVIN","VIN / chasis",inp("vVIN",f.VIN))}
     ${f.nuevo?fld("vKM_ACTUAL","Kilometraje inicial",inp("vKM_ACTUAL",f.KM_ACTUAL,"number","inputmode=numeric"),true):""}</div>
     <div class="row" style="align-items:flex-start;gap:12px"><label class="ph ${f.nuevo?"req":""}" style="width:170px;flex:none">${f.tarjeta?`<img src="${f.tarjeta}" alt="Tarjeta de circulación">`:""}
       <input type="file" accept="image/*" capture="environment" id="vtar" aria-label="Foto de la tarjeta de circulación"><span class="lbl">Tarjeta de circulación${f.nuevo?" *":""}${f.tarjeta?" ✓":f.tc?" (ya cargada)":""}</span></label>
       <p class="small muted" style="flex:1;min-width:160px;margin:0">Foto legible de la tarjeta de circulación. Se guarda en Drive, carpeta Tarjetas de circulación.</p></div>
     ${f.tried&&f.nuevo&&!f.tarjeta?`<span class="err small">Falta la foto de la tarjeta de circulación.</span>`:""}</section>
   <section class="card stack"><div class="sec-h">Asignación</div><div class="fgrid">
     ${fld("vAREA","Área",sel("vAREA",allAreas(),f.AREA,"Por asignar"))}${fld("vUBICACION","Ubicación base",inp("vUBICACION",f.UBICACION,"text",'placeholder="Ej. Santa Mónica"'))}
     ${fld("vRESPONSABLE","Responsable",inp("vRESPONSABLE",f.RESPONSABLE,"text",'list="dlresp2"'))}${fld("vPILOTO_ASIGNADO","Piloto asignado (si es distinto)",inp("vPILOTO_ASIGNADO",f.PILOTO_ASIGNADO,"text",'list="dlresp2"'))}
     ${fld("vTEL_PILOTO","Teléfono del piloto",inp("vTEL_PILOTO",f.TEL_PILOTO,"tel"))}${fld("vASIGNACION","Asignación",sel("vASIGNACION",["Fija","Temporal","Pool (por solicitud)","Por definir"],f.ASIGNACION))}</div>
     <datalist id="dlresp2">${(S.cat.resp||[]).map(r=>`<option value="${esc(r.n)}">`).join("")}</datalist></section>
   <section class="card stack"><div class="sec-h">Mantenimiento y control de km</div><div class="fgrid">
     ${fld("vCOMBUSTIBLE",`Combustible ${f.cbo?'<span class="chip ok">confirmado</span>':'<span class="chip sem">por confirmar</span>'}`,sel("vCOMBUSTIBLE",["Gasolina","Diésel"],f.COMBUSTIBLE,"Elegir"),true)}
     ${fld("vMANTENIMIENTO",`Dónde se hace el mantenimiento ${f.mto?'<span class="chip ok">confirmado</span>':'<span class="chip sem">por confirmar</span>'}`,
        sel("vMANTENIMIENTO",[{v:"Agencia",l:"Agencia"},{v:"Taller tercero",l:"Taller tercero"}].concat(tp?[{v:"Taller propio",l:"Taller propio"}]:[]),f.MANTENIMIENTO,"Elegir"),true)}
     ${f.MANTENIMIENTO==="Agencia"?fld("vAGENCIA_HASTA_KM","Programa de agencia hasta (km)",sel("vAGENCIA_HASTA_KM",[{v:"50000",l:"50,000 km"},{v:"100000",l:"100,000 km"}],String(f.AGENCIA_HASTA_KM),"Por definir")):""}
     ${fld("vCONTROL_KM","Control de km semanal",sel("vCONTROL_KM",["Sí","No"],f.CONTROL_KM))}
     ${fld("vINTERVALO_KM","Intervalo de servicio (km)",inp("vINTERVALO_KM",f.INTERVALO_KM,"number","inputmode=numeric"))}${fld("vPROX_SERV_KM","Próximo servicio (km)",inp("vPROX_SERV_KM",f.PROX_SERV_KM,"number",'inputmode=numeric placeholder="Se calcula si se deja vacío"'))}</div>
     ${tp?"":`<p class="small muted" style="margin:0">La opción Taller propio se habilita el ${esc(S.cat.tallerPropioDesde)}.</p>`}</section>
   <section class="card stack"><div class="sec-h">Seguro y GPS</div>
     ${yn("SEGURO","¿Cuenta con seguro?")}${f.SEGURO==="Sí"?`<div class="fgrid">${fld("vASEGURADORA","Aseguradora",inp("vASEGURADORA",f.ASEGURADORA),true)}${fld("vPOLIZA","No. de póliza",inp("vPOLIZA",f.POLIZA))}${fld("vSEGURO_VENCE","Vence",inp("vSEGURO_VENCE",f.SEGURO_VENCE,"date"),true)}</div>`:""}
     ${yn("GPS","¿Cuenta con GPS?")}${f.GPS==="Sí"?fld("vGPS_PROVEEDOR","Proveedor del GPS",inp("vGPS_PROVEEDOR",f.GPS_PROVEEDOR,"text",'placeholder="Ej. Cymsa"'),true):""}</section>
   <section class="card stack">${fld("vNOTAS","Notas",`<textarea id="vNOTAS">${esc(f.NOTAS)}</textarea>`)}</section>
   ${!f.nuevo?`<section class="card stack"><div class="sec-h">Baja del vehículo</div><p class="small muted" style="margin:0">Queda inactivo con todo su historial y sale de la programación y de los reportes.</p>
     <button class="btn sec" id="vbaja" type="button" style="color:var(--bad)">Dar de baja este vehículo</button></section>`:""}</div>`;
}
const VFIELDS=["PLACA","EMPRESA","TIPO","CLASE","MARCA","LINEA","ANIO","COLOR","VIN","KM_ACTUAL","AREA","UBICACION","RESPONSABLE","PILOTO_ASIGNADO","TEL_PILOTO","ASIGNACION","COMBUSTIBLE","MANTENIMIENTO","AGENCIA_HASTA_KM","CONTROL_KM","INTERVALO_KM","PROX_SERV_KM","ASEGURADORA","POLIZA","SEGURO_VENCE","GPS_PROVEEDOR","NOTAS"];
function readVehForm(){ const f=S.vedit; VFIELDS.forEach(k=>{ const el=$("#v"+k); if(el) f[k]=el.value; }); }
function bVehiculos(){
  if(S.vbaja) return bBaja();
  if(!S.vedit){
    const q=$("#vq"); q.oninput=()=>{ S.vq=q.value; const pos=q.selectionStart; render(); const n=$("#vq"); n.focus(); n.setSelectionRange(pos,pos); };
    $("#vnew").onclick=()=>{ S.vedit=vehForm(null); S.msg=null; render(); window.scrollTo({top:0}); };
    $$("[data-vedit]").forEach(b=>b.onclick=()=>{ S.vedit=vehForm(S.cat.veh.find(v=>v.p===b.dataset.vedit)); S.msg=null; render(); window.scrollTo({top:0}); });
    return;
  }
  const f=S.vedit;
  $("#vcancel").onclick=()=>{ S.vedit=null; S.msg=null; render(); };
  VFIELDS.forEach(k=>{ const el=$("#v"+k); if(el){ el.onchange=()=>{ readVehForm(); if(k==="MANTENIMIENTO"||k==="EMPRESA") keepY(render); }; } });
  $$("[data-vyn]").forEach(b=>b.onclick=()=>{ readVehForm(); f[b.dataset.vyn]=b.dataset.v; keepY(render); });
  $("#vtar").onchange=e=>readImg(e.target.files[0],u=>{ readVehForm(); f.tarjeta=u; keepY(render); });
  const vb=$("#vbaja"); if(vb) vb.onclick=()=>{ S.vbaja={placa:f.PLACA_ACTUAL,motivo:"",fecha:hoyISO(),doc:"",nota:"",foto:null,conf:false}; render(); window.scrollTo({top:0}); };
  $("#bar").innerHTML=`<button class="btn sec" id="vback" type="button">Cancelar</button><button class="btn pri" id="vsave" type="button" ${S.busy?"disabled":""}>${S.busy?'<span class="spinner"></span> Guardando':f.nuevo?"Guardar y hacer checklist de alta":"Guardar cambios"}</button>`;
  $("#vback").onclick=()=>{ S.vedit=null; S.msg=null; render(); };
  $("#vsave").onclick=async()=>{
    readVehForm(); f.tried=true;
    const faltan=[]; if(f.nuevo&&!f.PLACA.trim()) faltan.push("placa"); if(!f.EMPRESA) faltan.push("empresa"); if(!f.TIPO) faltan.push("tipo"); if(!f.MARCA.trim()) faltan.push("marca");
    if(!f.COMBUSTIBLE) faltan.push("combustible"); if(!f.MANTENIMIENTO) faltan.push("mantenimiento"); if(f.SEGURO!=="Sí"&&f.SEGURO!=="No") faltan.push("seguro"); if(f.GPS!=="Sí"&&f.GPS!=="No") faltan.push("GPS");
    if(f.nuevo&&f.KM_ACTUAL==="") faltan.push("km inicial"); if(f.nuevo&&!f.tarjeta) faltan.push("foto de la tarjeta");
    if(f.SEGURO==="Sí"&&(!f.ASEGURADORA.trim()||!f.SEGURO_VENCE)) faltan.push("aseguradora y vencimiento"); if(f.GPS==="Sí"&&!f.GPS_PROVEEDOR.trim()) faltan.push("proveedor de GPS");
    if(faltan.length){ S.msg={t:"Falta: "+faltan.join(", ")+".",err:1}; keepY(render); window.scrollTo({top:0}); return; }
    const veh={}; VFIELDS.forEach(k=>{ if(f[k]!==undefined) veh[k]=typeof f[k]==="string"?f[k].trim():f[k]; }); veh.SEGURO=f.SEGURO; veh.GPS=f.GPS;
    if(f.SEGURO==="No"){ veh.ASEGURADORA=""; veh.POLIZA=""; veh.SEGURO_VENCE=""; } if(f.GPS==="No") veh.GPS_PROVEEDOR="";
    if(f.MANTENIMIENTO!=="Agencia") veh.AGENCIA_HASTA_KM="";
    ["ANIO","AGENCIA_HASTA_KM","INTERVALO_KM","PROX_SERV_KM","KM_ACTUAL"].forEach(k=>{ if(veh[k]!==""&&veh[k]!=null) veh[k]=Number(veh[k]); });
    veh.confirmarCombustible=true; veh.confirmarMant=true;
    if(!f.nuevo){ delete veh.KM_ACTUAL; if(!/^PEND-/.test(f.PLACA_ACTUAL)) veh.PLACA=f.PLACA_ACTUAL; veh.PLACA_ACTUAL=f.PLACA_ACTUAL; }
    S.busy=true; keepY(render);
    try{ const r=await api("vehGuardar",{nuevo:f.nuevo,veh,tarjeta:f.tarjeta});
      S.busy=false; S.vedit=null; await cargarCatalogo(false);
      if(f.nuevo){ S.f=newFlow("A"); S.view="flow"; pick(r.placa); S.msg=null; return; }
      S.msg={t:r.sinCambios?"Sin cambios.":"Vehículo actualizado."}; render(); window.scrollTo({top:0}); }
    catch(e){ S.busy=false; S.msg={t:e.message,err:1}; keepY(render); window.scrollTo({top:0}); }
  };
}
function vBaja(){
  const b=S.vbaja, v=S.cat.veh.find(x=>x.p===b.placa)||{};
  return `<div class="stack screen"><h2>Dar de baja ${esc(b.placa)}</h2><p class="muted small" style="margin:0">${esc(v.m)} ${esc(v.l)} ${esc(v.a||"")} · ${esc(v.e)}</p>
    ${S.msg&&S.msg.err?`<div class="banner off">${esc(S.msg.t)}</div>`:""}
    <div class="card stack">${fld("bmot","Motivo",sel("bmot",MOTIVOS_BAJA,b.motivo,"Elegir"),true)}${fld("bfec","Fecha de baja",inp("bfec",b.fecha,"date"),true)}
      ${fld("bdoc","Documento de respaldo",inp("bdoc",b.doc,"text",'placeholder="Factura de venta, acta, denuncia, finiquito…"'),true)}${fld("bnota","Comentario",inp("bnota",b.nota))}
      <label class="ph" style="width:170px">${b.foto?`<img src="${b.foto}" alt="Documento">`:""}<input type="file" accept="image/*" id="bfoto" aria-label="Foto del documento"><span class="lbl">Foto del documento (opcional)${b.foto?" ✓":""}</span></label></div>
    <div class="status no"><b>Confirmación</b><p>El vehículo queda inactivo. Esta acción se revierte solo desde la hoja de Google.</p>
      <label class="row" style="margin-top:6px;color:var(--ink)"><input type="checkbox" id="bconf" ${b.conf?"checked":""}> Confirmo la baja de ${esc(b.placa)}</label></div></div>`;
}
function bBaja(){
  const b=S.vbaja; const rd=()=>{ b.motivo=$("#bmot").value; b.fecha=$("#bfec").value; b.doc=$("#bdoc").value; b.nota=$("#bnota").value; b.conf=$("#bconf").checked; };
  ["bmot","bfec","bdoc","bnota","bconf"].forEach(id=>$("#"+id).onchange=rd);
  $("#bfoto").onchange=e=>readImg(e.target.files[0],u=>{ rd(); b.foto=u; keepY(render); });
  $("#bar").innerHTML=`<button class="btn sec" id="bcan" type="button">Cancelar</button><button class="btn pri" id="bok" type="button" style="background:var(--bad);color:#fff" ${S.busy?"disabled":""}>Dar de baja</button>`;
  $("#bcan").onclick=()=>{ S.vbaja=null; S.msg=null; render(); };
  $("#bok").onclick=async()=>{ rd();
    if(!b.motivo||!b.fecha||b.doc.trim().length<3){ S.msg={t:"Completa motivo, fecha y documento.",err:1}; keepY(render); return; }
    if(!b.conf){ S.msg={t:"Marca la casilla de confirmación.",err:1}; keepY(render); return; }
    await accion(async()=>{ await api("vehBaja",{placa:b.placa,motivo:b.motivo,fecha:b.fecha,doc:b.doc.trim(),nota:b.nota.trim(),foto:b.foto}); S.vbaja=null; S.vedit=null; }, `${b.placa} quedó de baja.`);
  };
}

/* =========================== Servicios preventivos =========================== */
function trabajosDe(v,tipo){ const prog=v.cb==="Diésel"?"Diésel (Hilux)":"Gasolina (APV)"; const it=(S.cat.programa||[]).find(x=>x.p===prog&&x.s===String(tipo||"").replace(/ \+.*$/,"")); return it?it.t:""; }
function vServicios(ro){
  if(S.sreg) return vServReg();
  const ck=S.cat.veh.filter(v=>v.ck), c=k=>ck.filter(v=>v.se===k).length;
  const coord=ck.filter(v=>v.se==="VENCIDO"||v.se==="PRÓXIMO").sort((a,b)=>a.rest-b.rest);
  const q=S.sq.trim().toUpperCase();
  const lista=S.servVer==="coord"?coord:ck.filter(v=>!q||(v.p+" "+v.m+" "+v.l+" "+v.re+" "+v.ar).toUpperCase().includes(q)).sort((a,b)=>(a.rest??1e9)-(b.rest??1e9));
  const sinConf=ck.filter(v=>!v.mto).length;
  return `<div class="kpis"><div class="kpi"><b class="bad-txt">${c("VENCIDO")}</b><span>Vencidos</span></div><div class="kpi"><b class="warn-txt">${c("PRÓXIMO")}</b><span>Próximos</span></div>
      <div class="kpi"><b>${c("AL DÍA")}</b><span>Al día</span></div><div class="kpi"><b>${c("POR COMPLETAR")}</b><span>Sin dato</span></div></div>
    <p class="small muted" style="margin:0">Próximo = faltan ${fmt(S.cat.umbral)} km o menos, o menos que su promedio semanal. Programa cada ${fmt(S.cat.intervalo)} km: gasolina con el de la APV, diésel con el de la Hilux; agencia según su propio programa.${sinConf?` <b class="warn-txt">${sinConf} vehículos sin confirmar agencia o taller tercero.</b>`:""}</p>
    <div class="tabs"><button type="button" data-sver="coord" aria-selected="${S.servVer==="coord"}">Para coordinar (${coord.length})</button><button type="button" data-sver="todos" aria-selected="${S.servVer==="todos"}">Todos (${ck.length})</button></div>
    ${S.servVer==="todos"?`<input id="sq" type="search" value="${esc(S.sq)}" placeholder="Buscar placa, marca, responsable…" autocomplete="off">`:""}
    ${lista.map(v=>servCard(v,ro)).join("")||`<p class="muted">Nada que coordinar por ahora.</p>`}`;
}
function servCard(v,ro){
  const sp=S.sprog[v.p]||{taller:v.spt||"",fecha:v.spf||""};
  const tl=(S.cat.talleres||[]).filter(t=>t.t!=="Taller propio"||hoyISO()>=S.cat.tallerPropioDesde).filter(t=>!v.mt||v.mt==="Agencia"?true:t.t!=="Agencia"||true);
  return `<section class="card stack" style="gap:10px"><div class="group-h"><span class="row"><span class="plate" style="grid-row:auto">${esc(v.p)}</span><b>${esc(v.m)} ${esc(v.l)}</b></span>
      <span class="chip ${seChip(v.se)}">${esc(v.se)}${v.rest!=null?` · ${v.rest<=0?"vencido por "+fmt(-v.rest):"faltan "+fmt(v.rest)} km`:""}</span></div>
    <dl class="kv"><dt>Km actual</dt><dd>${fmt(v.km)} <span class="small muted">${v.fk?"("+esc(v.fk)+")":""}</span></dd><dt>Próximo servicio</dt><dd>${fmt(v.px)} km · <b>${esc(v.pt||"—")}</b></dd>
      <dt>Promedio semanal</dt><dd>${v.avg!=null?fmt(v.avg)+" km":"sin datos"}</dd><dt>Último servicio</dt><dd>${v.ust?esc(v.ust)+" · "+fmt(v.usk)+" km · "+esc(v.usf)+" · "+esc(v.ustl):"—"}</dd>
      <dt>Responsable</dt><dd>${esc(v.re||"—")}${v.pa?" ("+esc(v.pa)+")":""}${v.tel?" · "+esc(v.tel):""}</dd></dl>
    ${trabajosDe(v,v.pt)?`<p class="small muted" style="margin:0"><b>Incluye:</b> ${esc(trabajosDe(v,v.pt))}</p>`:""}
    <div class="row"><span class="small muted">Mantenimiento:</span>${ro||v.mto?`<span class="chip ${v.mto?"ok":"sem"}">${esc(v.mt||"Por definir")}${v.mto?"":" (por confirmar)"}</span>`
      :`<span class="chip sem">${esc(v.mt)} (por confirmar)</span><button class="btn sec sm" data-mant="Agencia" data-p="${esc(v.p)}" type="button">Agencia</button><button class="btn sec sm" data-mant="Taller tercero" data-p="${esc(v.p)}" type="button">Taller tercero</button>`}</div>
    ${ro?(v.spt?`<p class="small" style="margin:0">Programado en <b>${esc(v.spt)}</b>${v.spf?" · "+esc(v.spf):""}</p>`:"")
      :`<div class="filters">${fld("st-"+v.p,"Taller asignado",sel("st-"+v.p,tl.map(t=>({v:t.n,l:t.n+" · "+t.t})),sp.taller,"Elegir"))}${fld("sf-"+v.p,"Fecha tentativa",inp("sf-"+v.p,sp.fecha,"date"))}
        <button class="btn sec sm" data-sprog="${esc(v.p)}" type="button">${v.spt?"Actualizar":"Asignar taller"}</button></div>
        <div class="row" style="justify-content:flex-end"><button class="btn pri sm" data-sreg="${esc(v.p)}" type="button">Registrar servicio realizado</button></div>`}</section>`;
}
function vServReg(){
  const r=S.sreg, v=S.cat.veh.find(x=>x.p===r.placa);
  const tipos=SERV_NOMBRES.concat(["Programa de agencia","Cambios 90–100 mil km","Correctivo / otro"]);
  return `<div class="stack screen"><div class="row" style="justify-content:space-between"><h2>Servicio realizado · ${esc(r.placa)}</h2><button class="link" id="scan" type="button">Volver</button></div>
    ${S.msg&&S.msg.err?`<div class="banner off">${esc(S.msg.t)}</div>`:""}
    <p class="small muted" style="margin:0">${esc(v.m)} ${esc(v.l)} · ${esc(v.mt)} · próximo previsto ${fmt(v.px)} km (${esc(v.pt)})</p>
    <div class="card stack"><div class="fgrid">${fld("rfec","Fecha del servicio",inp("rfec",r.fecha,"date"),true)}${fld("rkm","Km al servicio",inp("rkm",r.km,"number","inputmode=numeric"),true)}
      ${fld("rtipo","Qué servicio se hizo",sel("rtipo",tipos,r.tipo,"Elegir"),true)}${fld("rtal","Taller o agencia",sel("rtal",(S.cat.talleres||[]).map(t=>t.n),r.taller,"Elegir"),true)}
      ${fld("rcos","Costo (Q, opcional)",inp("rcos",r.costo,"number","inputmode=decimal"))}${fld("rprox","Próximo servicio (km)",inp("rprox",r.prox,"number",`inputmode=numeric placeholder="${r.km?fmt(Number(r.km)+v.iv):"km + "+fmt(v.iv)}"`))}</div>
      ${fld("rtrab","Trabajos realizados",`<textarea id="rtrab">${esc(r.trab)}</textarea>`)}${fld("robs","Observaciones",inp("robs",r.obs))}
      <label class="ph" style="width:170px">${r.factura?`<img src="${r.factura}" alt="Factura">`:""}<input type="file" accept="image/*" id="rfac" aria-label="Foto de la factura"><span class="lbl">Foto de la factura (opcional)${r.factura?" ✓":""}</span></label>
      ${v.mto?"":`<label class="row"><input type="checkbox" id="rconf" ${r.conf?"checked":""}> Confirmar que este vehículo se mantiene en: <b>${esc(v.mt)}</b></label>`}</div></div>`;
}
function bServicios(ro){
  if(S.sreg) return bServReg();
  $$("[data-sver]").forEach(b=>b.onclick=()=>{ S.servVer=b.dataset.sver; render(); });
  const q=$("#sq"); if(q) q.oninput=()=>{ S.sq=q.value; const pos=q.selectionStart; render(); const n=$("#sq"); n.focus(); n.setSelectionRange(pos,pos); };
  if(ro) return;
  $$("[data-mant]").forEach(b=>b.onclick=()=>accion(()=>api("vehGuardar",{veh:{PLACA:b.dataset.p,MANTENIMIENTO:b.dataset.mant,confirmarMant:true}}),`${b.dataset.p}: mantenimiento en ${b.dataset.mant}.`));
  $$("[data-sprog]").forEach(b=>b.onclick=()=>{ const p=b.dataset.sprog, t=$("#st-"+p).value, f=$("#sf-"+p).value; S.sprog[p]={taller:t,fecha:f};
    if(!t){ S.msg={t:"Elige el taller para "+p+".",err:1}; keepY(render); return; }
    accion(()=>api("servProgramar",{placa:p,taller:t,fecha:f}),`${p} asignado a ${t}.`); });
  $$("[data-sreg]").forEach(b=>b.onclick=()=>{ const v=S.cat.veh.find(x=>x.p===b.dataset.sreg); const tipo=String(v.pt||"").replace(/ \+.*$/,"");
    S.sreg={placa:v.p,fecha:hoyISO(),km:v.km??"",tipo:tipo||"",taller:v.spt||"",costo:"",prox:"",trab:trabajosDe(v,tipo),obs:"",factura:null,conf:!v.mto}; S.msg=null; render(); window.scrollTo({top:0}); });
}
function bServReg(){
  const r=S.sreg, v=S.cat.veh.find(x=>x.p===r.placa);
  const rd=()=>{ r.fecha=$("#rfec").value; r.km=$("#rkm").value; const nt=$("#rtipo").value; if(nt!==r.tipo){ r.tipo=nt; r.trab=trabajosDe(v,nt)||r.trab; $("#rtrab").value=r.trab; } else r.trab=$("#rtrab").value;
    r.taller=$("#rtal").value; r.costo=$("#rcos").value; r.prox=$("#rprox").value; r.obs=$("#robs").value; const c=$("#rconf"); if(c) r.conf=c.checked; };
  ["rfec","rkm","rtipo","rtal","rcos","rprox","rtrab","robs","rconf"].forEach(id=>{ const el=$("#"+id); if(el) el.onchange=()=>{ rd(); if(id==="rkm") keepY(render); }; });
  $("#rfac").onchange=e=>readImg(e.target.files[0],u=>{ rd(); r.factura=u; keepY(render); });
  $("#scan").onclick=()=>{ S.sreg=null; S.msg=null; render(); };
  $("#bar").innerHTML=`<button class="btn sec" id="rcan" type="button">Cancelar</button><button class="btn pri" id="rok" type="button" ${S.busy?"disabled":""}>${S.busy?'<span class="spinner"></span> Guardando':"Registrar servicio"}</button>`;
  $("#rcan").onclick=()=>{ S.sreg=null; S.msg=null; render(); };
  $("#rok").onclick=async()=>{ rd();
    if(!r.fecha||r.km===""||!r.tipo||!r.taller){ S.msg={t:"Completa fecha, km, servicio y taller.",err:1}; keepY(render); window.scrollTo({top:0}); return; }
    await accion(async()=>{ const x=await api("servRegistrar",{placa:r.placa,fecha:r.fecha,km:Number(r.km),tipo:r.tipo,taller:r.taller,trabajos:r.trab,obs:r.obs,costo:r.costo===""?null:Number(r.costo),
      proxKm:r.prox===""?null:Number(r.prox),factura:r.factura,confirmarMant:r.conf}); S.sreg=null; S._ok=`Servicio ${x.id} registrado. Próximo: ${fmt(x.prox)} km.`; }, "Servicio registrado.");
    if(S._ok){ S.msg={t:S._ok}; S._ok=null; render(); }
  };
}

/* =========================== Fallas =========================== */
function vFallas(ro){
  const list=S.fallVer==="todas"?S.fall:(S.cat.fallas||[]);
  const a=S.fallAct;
  return `<div class="tabs"><button type="button" data-fver="abiertas" aria-selected="${S.fallVer==="abiertas"}">Abiertas (${(S.cat.fallas||[]).length})</button><button type="button" data-fver="todas" aria-selected="${S.fallVer==="todas"}">Historial</button></div>
    <p class="small muted" style="margin:0">Reportadas por los pilotos desde su app. Las que no circulan o necesitan grúa llegan como urgentes por correo.</p>
    ${list===null?`<div class="card"><span class="spinner"></span> Cargando…</div>`:list.length?list.map(f=>`<section class="card stack" style="gap:8px">
      <div class="group-h"><span class="row"><span class="plate" style="grid-row:auto">${esc(f.p)}</span><b>${esc(f.t)}</b></span><span class="chip ${f.st==="Cerrada"?"ok":f.pr==="Alta"?"venc":"sem"}">${esc(f.st)} · ${esc(f.pr)}</span></div>
      <p style="margin:0">${esc(f.d)}</p>
      <div class="row">${f.c?`<span class="chip ok">Puede circular</span>`:`<span class="chip venc">No circula</span>`}${f.g?`<span class="chip venc">Necesita grúa</span>`:""}
        ${f.mapa?`<a class="btn sec sm" href="${esc(f.mapa)}" target="_blank" rel="noopener">Ver en mapa</a>`:""}${f.fotos?`<a class="btn sec sm" href="${esc(f.fotos)}" target="_blank" rel="noopener">Fotos</a>`:""}</div>
      <span class="small muted">${esc(f.id)} · ${esc(f.f)} · ${esc(f.pi)} · ${esc(f.e)} / ${esc(f.a)}${f.ub?" · "+esc(f.ub):""}${f.ta?" · atiende: "+esc(f.ta):""}${f.no?" · "+esc(f.no):""}</span>
      ${ro||f.st==="Cerrada"?"":a&&a.id===f.id?`<div class="stack" style="gap:8px">${a.accion==="atender"?fld("fat","Taller, agencia o grúa que atiende",inp("fat",a.taller,"text",'list="dltal"'),true):""}
          ${fld("fno",a.accion==="atender"?"Nota":"Cómo se resolvió",inp("fno",a.nota),a.accion==="cerrar")}<datalist id="dltal">${(S.cat.talleres||[]).map(t=>`<option value="${esc(t.n)}">`).join("")}<option value="Grúa"></datalist>
          <div class="row" style="justify-content:flex-end"><button class="btn sec sm" id="facan" type="button">Cancelar</button><button class="btn pri sm" id="faok" type="button">${a.accion==="atender"?"Guardar atención":"Cerrar falla"}</button></div></div>`
        :`<div class="row" style="justify-content:flex-end">${f.st==="Reportada"?`<button class="btn sec sm" data-fa="atender" data-id="${esc(f.id)}" type="button">Atender</button>`:""}<button class="btn pri sm" data-fa="cerrar" data-id="${esc(f.id)}" type="button">Cerrar</button></div>`}
    </section>`).join(""):`<p class="muted">Sin fallas${S.fallVer==="abiertas"?" abiertas":""}.</p>`}`;
}
function bFallas(ro){
  $$("[data-fver]").forEach(b=>b.onclick=()=>{ S.fallVer=b.dataset.fver; render(); if(S.fallVer==="todas") loadTab(); });
  if(ro) return;
  $$("[data-fa]").forEach(b=>b.onclick=()=>{ S.fallAct={id:b.dataset.id,accion:b.dataset.fa,taller:"",nota:""}; keepY(render); });
  const c=$("#facan"); if(c) c.onclick=()=>{ S.fallAct=null; keepY(render); };
  const o=$("#faok"); if(o) o.onclick=()=>{ const a=S.fallAct; a.nota=$("#fno").value.trim(); const t=$("#fat"); if(t) a.taller=t.value.trim();
    accion(async()=>{ await api("fallaActualizar",a); S.fallAct=null; if(S.fallVer==="todas") S.fall=(await api("fallas")).fallas; }, a.accion==="atender"?"Falla en atención.":"Falla cerrada."); };
}

/* =========================== Km semanal =========================== */
function vKm(ro){
  const k=S.kms; if(!k) return `<div class="card"><span class="spinner"></span> Cargando…</div>`;
  const ok=k.rows.filter(r=>r.ok), no=k.rows.filter(r=>!r.ok), dist=ok.filter(r=>r.asig===false);
  const ab=k.alertas.filter(a=>a.e==="Abierta");
  return `<p class="small muted" style="margin:0">Semana del viernes <b>${esc(k.ventana.semana)}</b> · ventana de reporte ${esc(k.ventana.desde)} a ${esc(k.ventana.hasta)}. El lunes 9:00 se envía a jefaturas y Cumplimiento la lista de quienes no reportaron.</p>
    <div class="kpis"><div class="kpi"><b>${ok.length}</b><span>Reportaron</span></div><div class="kpi"><b class="warn-txt">${no.length}</b><span>Pendientes</span></div>
      <div class="kpi"><b class="bad-txt">${dist.length}</b><span>Piloto distinto</span></div><div class="kpi"><b>${ab.length}</b><span>Alertas abiertas</span></div></div>
    ${ab.length?`<section class="card stack"><h2>Alertas</h2>${ab.map(a=>`<div class="hv"><div class="item-h"><span class="t"><b>${esc(a.p)}</b> · ${esc(a.t)}</span><span class="small muted">${esc(a.f)}</span></div>
      <span class="small">${esc(a.d)} · reportó <b>${esc(a.pi)}</b>${a.as?" · asignado: "+esc(a.as):""}</span>
      ${ro?"":`<div class="row"><input type="text" data-anota="${esc(a.id)}" placeholder="Acción tomada (opcional)" style="flex:1;min-width:160px"><button class="btn sec sm" data-arev="${esc(a.id)}" type="button">Marcar revisada</button></div>`}</div>`).join("")}</section>`:""}
    <section class="card"><h2>Pendientes de reportar (${no.length})</h2><div class="list">${no.map(r=>`<div class="li"><span><b>${esc(r.p)}</b> · ${esc(r.m)}<br><span class="small muted">${esc(r.re||"sin responsable")}${r.pa?" ("+esc(r.pa)+")":""} · ${esc(r.ar)} · ${esc(r.u)}</span></span><span class="small muted">último: ${esc(r.ult||"nunca")}</span></div>`).join("")||`<p class="muted">Todos reportaron.</p>`}</div></section>
    <section class="card"><h2>Reportados (${ok.length})</h2><div class="list">${ok.map(r=>`<div class="li"><span><b>${esc(r.p)}</b> · ${esc(r.pi)}${r.asig===false?' <span class="chip venc">piloto distinto</span>':""}<br><span class="small muted">${esc(r.f)} · ${esc(r.eu||"")} ${esc(r.ar)}</span></span><span><b>${fmt(r.km)}</b>${r.rec!=null?` <span class="small muted">+${fmt(r.rec)}</span>`:""}</span></div>`).join("")||`<p class="muted">Aún nadie ha reportado esta semana.</p>`}</div></section>`;
}
function bKm(ro){
  if(ro) return;
  $$("[data-arev]").forEach(b=>b.onclick=()=>{ const id=b.dataset.arev, n=($(`[data-anota="${id}"]`)||{}).value||"";
    accion(async()=>{ await api("alertaRevisar",{id,nota:n}); S.kms=await api("kmSemana"); }, "Alerta revisada."); });
}

/* =========================== Tableros =========================== */
function agg(rows,keyFn,valFn){ const m=new Map(); rows.forEach(r=>{ const k=keyFn(r); if(k==null||k==="") return; m.set(k,(m.get(k)||0)+valFn(r)); }); return [...m.entries()]; }
function hbars(pairs,unit,max=12){
  pairs=pairs.sort((a,b)=>b[1]-a[1]).slice(0,max); const top=Math.max(1,...pairs.map(p=>p[1]));
  return pairs.length?pairs.map(([k,v])=>`<div class="hbar" title="${esc(k)}: ${fmt(Math.round(v))}${unit}"><span class="n">${esc(k)}</span><span><span class="t" style="display:block;width:${Math.max(2,v/top*100)}%"></span></span><span class="v">${fmt(Math.round(v))}${unit}</span></div>`).join("")
    :`<p class="muted small">Sin datos en el período.</p>`;
}
function colChart(pairs,unit,pct){
  if(!pairs.length) return `<p class="muted small">Sin datos en el período.</p>`;
  const W=Math.max(320,pairs.length*46), H=190, pl=46, pb=34, pt=14, top=pct?100:Math.max(1,...pairs.map(p=>p[1]));
  const nice=pct?100:Math.ceil(top/Math.pow(10,Math.floor(Math.log10(top))))*Math.pow(10,Math.floor(Math.log10(top)));
  const bw=Math.min(28,(W-pl-10)/pairs.length*.6), step=(W-pl-10)/pairs.length, y=v=>pt+(H-pt-pb)*(1-v/nice);
  const grid=[0,.5,1].map(f=>`<line x1="${pl}" x2="${W-6}" y1="${y(nice*f)}" y2="${y(nice*f)}" stroke="var(--line)" stroke-width="1"/><text x="${pl-6}" y="${y(nice*f)+4}" text-anchor="end">${fmt(Math.round(nice*f))}${pct?"%":""}</text>`).join("");
  const bars=pairs.map(([k,v],i)=>{ const x=pl+i*step+(step-bw)/2, h=Math.max(0,y(0)-y(v)); return `<g><title>${esc(k)}: ${fmt(Math.round(v))}${unit}</title>
    <rect x="${x}" y="${y(v)}" width="${bw}" height="${h}" rx="3" fill="var(--accent)"/><text x="${x+bw/2}" y="${H-pb+16}" text-anchor="middle">${esc(String(k).slice(5))}</text></g>`; }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gráfica por semana">${grid}${bars}</svg></div>`;
}
function vTablero(){
  const t=S.tb, F=S.tbF;
  const filtros=`<div class="card filters">${fld("tsem","Período",sel("tsem",[{v:4,l:"Últimas 4 semanas"},{v:8,l:"Últimas 8 semanas"},{v:12,l:"Últimas 12 semanas"},{v:26,l:"Últimos 6 meses"}],F.sem))}
    ${t?fld("temp","Empresa",sel("temp",[...new Set(t.km.map(r=>r[2]).filter(Boolean))].sort(),F.emp,"Todas"))+fld("tarea","Área",sel("tarea",[...new Set(t.km.map(r=>r[3]).filter(Boolean))].sort(),F.area,"Todas"))
      +fld("ttipo","Tipo de vehículo",sel("ttipo",[...new Set(t.veh.map(r=>r[3]).filter(Boolean))].sort(),F.tipo,"Todos")):""}</div>`;
  if(!t) return filtros+`<div class="card"><span class="spinner"></span> Cargando datos…</div>`;
  const tipoDe=Object.fromEntries(t.veh.map(r=>[r[0],r[3]]));
  const km=t.km.filter(r=>(!F.emp||r[2]===F.emp)&&(!F.area||r[3]===F.area)&&(!F.tipo||tipoDe[r[1]]===F.tipo));
  const rec=km.filter(r=>r[4]!=null&&r[4]>=0);
  const total=rec.reduce((a,r)=>a+r[4],0);
  const semanas=[...new Set(t.km.map(r=>r[0]))].sort();
  const porSem=semanas.map(s=>[s,rec.filter(r=>r[0]===s).reduce((a,r)=>a+r[4],0)]);
  const ctrl=t.veh.filter(r=>r[4]&&(!F.tipo||r[3]===F.tipo)&&(!F.area||r[2]===F.area)).length;
  const cumpl=semanas.map(s=>[s,ctrl?Math.min(100,new Set(km.filter(r=>r[0]===s).map(r=>r[1])).size/ctrl*100):0]);
  const ultima=cumpl.length?cumpl[cumpl.length-1][1]:0;
  const dist=km.filter(r=>r[5]===0).length;
  const fa=t.fallas.filter(r=>r[0]>=t.desde&&(!F.emp||r[5]===F.emp)&&(!F.area||r[6]===F.area)&&(!F.tipo||tipoDe[r[1]]===F.tipo));
  const sv=t.serv.filter(r=>r[0]>=t.desde&&(!F.tipo||tipoDe[r[1]]===F.tipo));
  const costo=sv.reduce((a,r)=>a+(r[4]||0),0);
  return `${filtros}
    <div class="kpis"><div class="kpi"><b>${fmt(Math.round(total))}</b><span>Km recorridos</span></div><div class="kpi"><b>${fmt(Math.round(total/Math.max(1,semanas.length)))}</b><span>Km por semana (promedio)</span></div>
      <div class="kpi"><b>${Math.round(ultima)}%</b><span>Cumplimiento del reporte (última semana)</span></div><div class="kpi"><b class="${dist?"bad-txt":""}">${dist}</b><span>Reportes con piloto distinto</span></div></div>
    <div class="kpis"><div class="kpi"><b>${fa.length}</b><span>Fallas reportadas</span></div><div class="kpi"><b class="bad-txt">${fa.filter(r=>r[3]==="Alta").length}</b><span>Fallas urgentes</span></div>
      <div class="kpi"><b>${sv.length}</b><span>Servicios registrados</span></div><div class="kpi"><b>Q ${fmt(Math.round(costo))}</b><span>Costo de servicios registrado</span></div></div>
    <section class="card stack"><h2>Km recorridos por semana</h2>${colChart(porSem," km")}<p class="small muted" style="margin:0">Semana = viernes de corte. Fuente: reportes de los pilotos (KM SEMANAL).</p></section>
    <section class="card stack"><h2>Cumplimiento del reporte semanal</h2>${colChart(cumpl,"%",true)}<p class="small muted" style="margin:0">Vehículos que reportaron ÷ ${ctrl} vehículos con control de km.</p></section>
    <div class="grid2" style="align-items:start"><section class="card stack"><h2>Km por empresa</h2>${hbars(agg(rec,r=>r[2]||"Sin empresa",r=>r[4])," km")}</section>
      <section class="card stack"><h2>Km por área</h2>${hbars(agg(rec,r=>r[3]||"Sin área",r=>r[4])," km")}</section></div>
    <div class="grid2" style="align-items:start"><section class="card stack"><h2>Vehículos con más km</h2>${hbars(agg(rec,r=>r[1],r=>r[4])," km",10)}</section>
      <section class="card stack"><h2>Fallas por tipo</h2>${hbars(agg(fa,r=>r[2],()=>1),"",10)}</section></div>`;
}
function bTablero(){
  const ch=async()=>{ const sem=Number($("#tsem").value); const e=$("#temp"), a=$("#tarea"), t=$("#ttipo");
    S.tbF={sem,emp:e?e.value:"",area:a?a.value:"",tipo:t?t.value:""};
    if(!S.tb||sem!==S._tbSem){ S._tbSem=sem; loadTab(); } else keepY(render); };
  ["tsem","temp","tarea","ttipo"].forEach(id=>{ const el=$("#"+id); if(el) el.onchange=ch; });
  S._tbSem=S._tbSem||S.tbF.sem;
}
