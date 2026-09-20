/* ---------- Ajustes de expensas: descuentos y cargos adicionales ---------- */
function ajusteTipoLabel(tipo) { return tipo === 'descuento' ? 'Descuento' : 'Cargo adicional'; }
function fmtAjuste(a) { return (a.tipo === 'descuento' ? '− ' : '+ ') + centsToMoney(a.montoCents); }

function fillAjusteUnidades() {
  const sel = document.getElementById('aj-unidad');
  const previo = sel.value;
  sel.innerHTML = unidadesConExpensas()
    .map((u) => `<option value="${u.n}">Local ${u.n} — ${u.loc}</option>`).join('');
  if (previo) sel.value = previo;
  syncAjuste();
}

function syncAjuste() {
  const n = document.getElementById('aj-unidad').value;
  const u = unidadesConExpensas().find((x) => x.n === n);
  document.getElementById('aj-base').textContent = u
    ? `Expensas actuales: ${centsToMoney(u.expCents)} · Total del mes: ${centsToMoney(u.totCents)}`
    : '';
  const a = ajustesExpensas[n];
  document.getElementById('aj-tipo').value = a ? a.tipo : 'descuento';
  document.getElementById('aj-monto').value = a ? a.montoCents / 100 : '';
  document.getElementById('aj-motivo').value = a ? a.motivo : '';
  mostrarError('aj-err', null);
}

function validarAjusteExpensas(n, tipo, monto) {
  const u = unidadesConExpensas().find((x) => x.n === n);
  if (!u) {
    return { ok: false, msg: 'Elegí el comercio al que querés aplicarle el ajuste.' };
  }
  if (!['descuento', 'cargo'].includes(tipo)) {
    return { ok: false, msg: 'Elegí si el ajuste es un descuento o un cargo adicional.' };
  }
  if (Number.isNaN(monto)) {
    return { ok: false, msg: 'Ingresá un monto numérico válido.' };
  }
  if (!(monto > 0)) {
    return { ok: false, msg: 'El monto del ajuste debe ser mayor a $ 0,00.' };
  }
  if (tieneMasDeDosDecimales(monto)) {
    return { ok: false, msg: 'El monto solo puede tener hasta dos decimales.' };
  }
  if (tipo === 'descuento' && Math.round(monto * 100) > u.expCents) {
    return { ok: false, msg: `El descuento no puede superar las expensas del comercio (${centsToMoney(u.expCents)}).` };
  }
  return { ok: true };
}

async function setAjusteExpensas() {
  const n = document.getElementById('aj-unidad').value;
  const tipo = document.getElementById('aj-tipo').value;
  const raw = document.getElementById('aj-monto').value.trim();
  const monto = raw === '' ? NaN : Number(raw);

  const v = validarAjusteExpensas(n, tipo, monto);
  if (!v.ok) return mostrarError('aj-err', v.msg);

  const r = await apiEnviar('POST', `/api/locales/${n}/ajuste`, {
    tipo,
    monto,
    motivo: document.getElementById('aj-motivo').value.trim(),
  });
  if (!r.ok) return mostrarError('aj-err', r.msg);

  mostrarError('aj-err', null);
  await recargarEstado();
  toast(r.reemplazo ? 'Ajuste de expensas reemplazado' : 'Ajuste de expensas aplicado');
}

function renderAjustes() {
  const ajustadas = unidadesConExpensas().filter((u) => ajustesExpensas[u.n]);
  document.getElementById('aj-count').textContent = ajustadas.length ? `${ajustadas.length} aplicados` : '';
  const box = document.getElementById('aj-list');
  if (!ajustadas.length) { box.innerHTML = '<div class="empty">Todavía no aplicaste ajustes.</div>'; return; }
  box.innerHTML = ajustadas.map((u) => {
    const a = ajustesExpensas[u.n];
    return `
    <div class="abm-row">
      <div class="an">${u.n}</div>
      <div><div class="aname">${u.loc} · ${ajusteTipoLabel(a.tipo)} ${fmtAjuste(a)}</div><div class="acontact">${a.motivo ? a.motivo + ' · ' : ''}Expensas: ${centsToMoney(expensasEfectivasCents(u))} · Total: ${centsToMoney(totalEfectivoCents(u))}</div></div>
      <div class="aacts"><button class="btn btn-danger btn-sm" onclick="confirmQuitarAjuste('${u.n}')">Quitar</button></div>
    </div>`;
  }).join('');
}

function confirmQuitarAjuste(n) {
  const u = unidadesConExpensas().find((x) => x.n === n);
  const a = ajustesExpensas[n];
  openModal('Quitar ajuste',
    `<p style="margin:0">Vas a quitar el <strong>${a.tipo === 'descuento' ? 'descuento' : 'cargo'}</strong> de <strong>${u.loc}</strong> por <strong>${centsToMoney(a.montoCents)}</strong>. Las expensas vuelven a su valor original.</p>`,
    [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
     { label: 'Quitar ajuste', cls: 'btn-danger', fn: () => quitarAjuste(n) }]);
}

async function quitarAjuste(n) {
  const r = await apiEnviar('DELETE', `/api/locales/${n}/ajuste`);
  closeModal();
  if (!r.ok) return toast(r.msg);
  await recargarEstado();
  syncAjuste();
  toast('Ajuste quitado');
}
