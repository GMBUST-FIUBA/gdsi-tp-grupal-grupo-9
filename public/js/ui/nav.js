/* ---------- Galería que se administra ---------- */
/*
 * La elección se guarda en una cookie para que viaje sola en todos los pedidos
 * (la página y la API). Recargamos porque el HTML se arma en el servidor.
 */
function cambiarGaleria(id) {
  document.cookie = 'galeriaId=' + id + '; path=/; max-age=' + (60 * 60 * 24 * 365);
  window.location.reload();
}

/* ---------- View / tabs ---------- */
/* Según el rol, algunas vistas no están en la página: se ignoran. */
function setView(v){
  ['super','admin','tenant'].forEach(x=>{
    const view = document.getElementById('view-'+x);
    const tab = document.getElementById('tab-'+x);
    if(view) view.hidden = (x!==v);
    if(tab) tab.setAttribute('aria-selected', x===v);
  });
  const bell = document.getElementById('bell-wrap');
  if(bell) bell.style.display = (v==='admin') ? '' : 'none';
  const notif = document.getElementById('notif');
  if(notif) notif.hidden = true;
  window.scrollTo({top:0});
}
function setTab(name){
  ['contrato','cobranzas','locatarios','config','rendicion'].forEach(t=>{
    const sel = t===name;
    document.getElementById('tp-'+t).hidden = !sel;
    document.getElementById('t-'+t).setAttribute('aria-selected', sel);
  });
}
function setSection(name){
  ['panel','gastos','config'].forEach(s=>{
    const sel = s===name;
    document.getElementById('sec-'+s).hidden = !sel;
    document.getElementById('sec-tab-'+s).setAttribute('aria-selected', sel);
  });
}
function setHist(name){
  ['mes','local'].forEach(t=>{
    const sel = t===name;
    document.getElementById('hp-'+t).hidden = !sel;
    document.getElementById('h-'+t).setAttribute('aria-selected', sel);
  });
}
