/* ---------- Cobranzas ---------- */
function renderCobranzas(){
  const box = document.getElementById('cobr-rows');
  const pend = units.filter(u=>u.st==='late'||u.st==='warn');
  if(!pend.length){ box.innerHTML = '<div class="empty">Sin cobranzas pendientes este mes.</div>'; return; }
  box.innerHTML = pend.map(u=>{
    const pill = u.st==='late' ? '<span class="pill late"><i></i>Mora</span>' :
                 (u.comp ? '<span class="pill warn"><i></i>Revisión</span>' : '<span class="pill warn"><i></i>Pendiente</span>');
    return `<div class="row"><div class="rn">${u.n}</div>
      <div><div class="rname">${u.loc}</div><div class="rsub">Vence 10/08 · ${u.pago}</div></div>
      <div>${pill}</div><div class="ramt">${centsToMoney(totalEfectivoCents(u))}</div></div>`;
  }).join('');
}
