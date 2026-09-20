/* ---------- Rendición al dueño ---------- */
async function renderRendicion() {
  const box = document.getElementById('rend-lines');
  const r = await apiLeer('/api/rendicion');
  if (!r || r.ok === false) {
    box.innerHTML = '<div class="empty">No se pudo calcular la rendición.</div>';
    return;
  }
  box.innerHTML = `
    <div class="line"><div class="lbl">Alquileres cobrados <small>${r.localesCobrados} locales</small></div><div class="val">${centsToMoney(r.alquileresCobrados)}</div></div>
    <div class="line"><div class="lbl">Gastos comunes cobrados</div><div class="val">${centsToMoney(r.expensasCobradas)}</div></div>
    <div class="line neg"><div class="lbl">Gastos comunes pagados <small>ordinarios y extraordinarios</small></div><div class="val">− ${centsToMoney(r.gastosPagados)}</div></div>
    <div class="line neg"><div class="lbl">Comisión del administrador <small>${r.comisionPct}% sobre lo cobrado</small></div><div class="val">− ${centsToMoney(r.comision)}</div></div>
    <div class="line net"><div class="lbl">Neto a transferir al dueño</div><div class="val">${centsToMoney(r.neto)}</div></div>`;
}
