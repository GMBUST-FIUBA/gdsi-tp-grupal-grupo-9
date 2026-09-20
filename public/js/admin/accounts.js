/* ---------- Estado de cuenta por local ---------- */
function renderAccounts() {
  const box = document.getElementById('acct-rows');
  box.innerHTML = units.map((u) => {
    if (u.st === 'free') {
      return `<tr><td>Local ${u.n}</td><td>—</td><td class="r mono">—</td><td class="r mono">—</td><td class="r mono">—</td><td class="r"><span class="st-tag abierto">Libre</span></td></tr>`;
    }
    const facturado = totalEfectivoCents(u);
    const saldo = Math.max(facturado - u.cobCents, 0);
    const tag = saldo === 0
      ? '<span class="st-tag pagado">Saldado</span>'
      : (u.st === 'late'
        ? '<span class="st-tag mora">En mora</span>'
        : '<span class="st-tag pend">Pendiente</span>');
    return `<tr>
      <td>Local ${u.n}</td><td>${u.loc}</td>
      <td class="r mono">${centsToMoney(facturado)}</td>
      <td class="r mono">${centsToMoney(u.cobCents)}</td>
      <td class="r mono">${centsToMoney(saldo)}</td>
      <td class="r">${tag}</td></tr>`;
  }).join('');
}

/* ---------- Historial de cierres mensuales ---------- */
async function renderHistorial() {
  const box = document.getElementById('hist-rows');
  const filas = await apiLeer('/api/historial');
  if (!Array.isArray(filas) || !filas.length) {
    box.innerHTML = '<tr><td colspan="7">Todavía no hay períodos liquidados.</td></tr>';
    return;
  }
  box.innerHTML = filas.map((f) => `
    <tr>
      <td>${periodoLabel(f.periodo)}</td>
      <td class="r mono">${centsToMoney(f.facturado)}</td>
      <td class="r mono">${centsToMoney(f.cobrado)}</td>
      <td class="r mono">${centsToMoney(f.mora)}</td>
      <td class="r mono">${centsToMoney(f.comision)}</td>
      <td class="r mono">${centsToMoney(f.neto)}</td>
      <td class="r"><span class="st-tag ${f.estado === 'Abierto' ? 'abierto' : 'cerrado'}">${f.estado}</span></td>
    </tr>`).join('');
}
