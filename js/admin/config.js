/* ---------- Configuración · Porcentaje de expensas por unidad ---------- */
function fmtPct(n){ return Number(n).toLocaleString('es-AR', {minimumFractionDigits:0, maximumFractionDigits:2}) + '%'; }
function parsePct(raw){
  const s = String(raw).trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}
function unidadesConExpensas(){ return units.filter(u=>u.st!=='free'); }
function totalExpensasPct(excludeN){
  return Object.keys(expensasPct).reduce((acc, n)=> n===excludeN ? acc : acc + Math.round(expensasPct[n]*100), 0) / 100;
}
function validarPorcentajeExpensa(n, pct){
  if(!unidadesConExpensas().some(u=>u.n===n)){
    return {ok:false, msg:'Elegí el comercio al que querés asignarle el porcentaje.'};
  }
  if(Number.isNaN(pct)){
    return {ok:false, msg:'Ingresá un porcentaje numérico válido.'};
  }
  if(pct < 0){
    return {ok:false, msg:'El porcentaje no puede ser negativo.'};
  }
  if(tieneMasDeDosDecimales(pct)){
    return {ok:false, msg:'El porcentaje solo puede tener hasta dos decimales.'};
  }
  const otros = totalExpensasPct(n);
  if(Math.round(otros*100) + Math.round(pct*100) > 10000){
    return {ok:false, msg:`La suma de porcentajes superaría el 100% (asignado a otros comercios: ${fmtPct(otros)}, disponible: ${fmtPct(100-otros)}).`};
  }
  return {ok:true};
}
function fillConfigUnidades(){
  document.getElementById('cf-unidad').innerHTML =
    unidadesConExpensas().map(u=>`<option value="${u.n}">Local ${u.n} — ${u.loc}</option>`).join('');
  syncConfigPct();
}
function syncConfigPct(){
  const n = document.getElementById('cf-unidad').value;
  const actual = expensasPct[n];
  document.getElementById('cf-pct').value = actual===undefined ? '' : String(actual).replace('.', ',');
}
function setPorcentajeExpensa(){
  const errBox = document.getElementById('cf-err');
  const n = document.getElementById('cf-unidad').value;
  const pct = parsePct(document.getElementById('cf-pct').value);
  const v = validarPorcentajeExpensa(n, pct);
  if(!v.ok){ errBox.textContent = v.msg; errBox.hidden = false; return; }
  errBox.hidden = true;
  expensasPct[n] = pct;
  renderConfig();
  toast('Porcentaje de expensas asignado');
}
function renderConfig(){
  const total = totalExpensasPct(null);
  document.getElementById('cf-total').textContent = `Total asignado: ${fmtPct(total)} · Disponible: ${fmtPct(100-total)}`;
  const asignadas = unidadesConExpensas().filter(u=>expensasPct[u.n]!==undefined);
  const box = document.getElementById('cf-list');
  if(!asignadas.length){ box.innerHTML = '<div class="empty">Todavía no asignaste porcentajes.</div>'; return; }
  box.innerHTML = asignadas.map(u=>`
    <div class="abm-row">
      <div class="an">${u.n}</div>
      <div><div class="aname">${u.loc}</div><div class="acontact">${u.rubro}</div></div>
      <div class="aname mono">${fmtPct(expensasPct[u.n])}</div>
    </div>`).join('');
}
