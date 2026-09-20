/* ---------- View / tabs ---------- */
function setView(v){
  ['super','admin','tenant'].forEach(x=>{
    document.getElementById('view-'+x).hidden = (x!==v);
    document.getElementById('tab-'+x).setAttribute('aria-selected', x===v);
  });
  document.getElementById('bell-wrap').style.display = (v==='admin') ? '' : 'none';
  document.getElementById('notif').hidden = true;
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
