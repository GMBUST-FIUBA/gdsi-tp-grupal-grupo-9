/* ---------- Detail ---------- */
const detailBody = document.getElementById('detail-body');
const detailSub = document.getElementById('detail-sub');

function selectUnit(i) {
  selectedIdx = i;
  renderPlan();
  const u = units[i];
  if (!u) return;
  detailSub.textContent = `Local ${u.n} · ${stLabel[u.st]}`;

  if (u.st === 'free') {
    detailBody.innerHTML = `
      <div class="contract-title"><span class="num">${u.n}</span><div><h3>Local disponible</h3></div>
        <span class="pill free" style="margin-left:auto"><i></i>Libre</span></div>
      <dl class="dl"><dt>Situación</dt><dd>${u.desde || 'Sin contrato'}</dd><dt>Superficie</dt><dd>~ 38 m²</dd>
        <dt>Expensas base</dt><dd class="mono">${centsToMoney(configGaleria ? configGaleria.expensasBaseCents : 0)}</dd></dl>
      <div class="note">Local sin contrato vigente. Registrá un alta desde <strong>Nuevo contrato</strong>.</div>`;
    return;
  }

  const compBlock = u.comp
    ? `<div class="note rev"><strong>Comprobante recibido</strong> el ${u.compFecha}. Revisalo para aceptar el pago.</div>
       <div class="form-actions" style="margin-top:12px">
         <button class="btn btn-primary btn-sm" onclick="viewReceipt(${i})">Ver comprobante y aceptar</button>
       </div>`
    : (u.st === 'late'
      ? `<div class="note late"><strong>Estado de cobro:</strong> ${u.pago}</div>`
      : `<div class="note"><strong>Estado de cobro:</strong> ${u.pago}</div>`);

  const a = ajustesExpensas[u.n];
  const ajusteRow = a
    ? `<dt>Ajuste de expensas</dt><dd class="mono">${ajusteTipoLabel(a.tipo)} ${fmtAjuste(a)}${a.motivo ? ' · ' + a.motivo : ''}</dd>`
    : '';

  const pctRow = expensasPct[u.n] !== undefined
    ? `<dt>% de expensas</dt><dd class="mono">${fmtPct(expensasPct[u.n])}</dd>`
    : '';

  detailBody.innerHTML = `
    <div class="contract-title"><span class="num">${u.n}</span>
      <div><h3>${u.loc}</h3><span class="sub" style="color:var(--muted);font-size:.8rem">${u.rubro}</span></div>
      <span class="pill ${stPill[u.st]}" style="margin-left:auto"><i></i>${stLabel[u.st]}</span></div>
    <dl class="dl">
      <dt>Modalidad</dt><dd>${u.mod}</dd>
      <dt>Actualización</dt><dd>${u.act}</dd>
      <dt>Alquiler fijo</dt><dd class="mono">${u.fijo}</dd>
      <dt>Gastos comunes</dt><dd class="mono">${centsToMoney(expensasEfectivasCents(u))}</dd>
      ${ajusteRow}
      ${pctRow}
      <dt>Vencimiento</dt><dd>Día ${u.venc}</dd>
    </dl>
    <table class="liq" style="margin-top:16px"><tr class="total"><td>A pagar en el mes</td><td>${centsToMoney(totalEfectivoCents(u))}</td></tr></table>
    ${compBlock}
    <div class="form-actions">
      <button class="btn btn-ghost btn-sm" onclick="verContrato(${i})">Ver contrato</button>
      <button class="btn btn-danger btn-sm" onclick="confirmBaja(${i})">Dar de baja contrato</button>
    </div>`;
}

function verContrato(i) {
  const u = units[i];
  if (u.archivoContratoUrl) {
    window.open(u.archivoContratoUrl, '_blank');
  } else {
    toast('Este contrato no tiene PDF adjunto');
  }
}

/* ---------- Baja de contrato ---------- */
function confirmBaja(i) {
  const u = units[i];
  openModal(`Dar de baja — Local ${u.n}`,
    `<p style="margin:0 0 12px">Vas a rescindir el contrato de <strong>${u.loc}</strong>. El local pasará a estado <strong>libre</strong> y se generará el estado de cuenta final.</p>
     <div class="field"><label for="baja-mot">Motivo</label>
       <select id="baja-mot"><option>Fin de contrato</option><option>Rescisión anticipada</option><option>Falta de pago</option><option>Acuerdo de partes</option></select></div>`,
    [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
     { label: 'Confirmar baja', cls: 'btn-danger', fn: () => doBaja(i) }]);
}

async function doBaja(i) {
  const u = units[i];
  const motivo = document.getElementById('baja-mot').value;
  const r = await apiEnviar('POST', `/api/contratos/${u.contratoId}/baja`, { motivo });
  closeModal();
  if (!r.ok) return toast(r.msg);
  await recargarEstado();
  toast(`Contrato del Local ${u.n} dado de baja`);
}

/* ---------- Comprobante: ver, aceptar o rechazar ---------- */
function viewReceipt(i) {
  const u = units[i];
  openModal(`Comprobante — Local ${u.n}`,
    `<div class="receipt">
       <div class="r-bank">Transferencia recibida</div>
       <div class="r-line"><span>Origen</span><span>${u.loc}</span></div>
       <div class="r-line"><span>Fecha</span><span>${u.compFecha}</span></div>
       <div class="r-line"><span>Liquidación</span><span>#${u.liquidacionId}</span></div>
       <div class="r-amt">${centsToMoney(totalEfectivoCents(u))}</div>
       <div class="r-stamp">COMPROBANTE</div>
     </div>
     <p style="font-size:.82rem;color:var(--muted);margin:12px 0 0">Verificá que el monto coincida con la liquidación del mes antes de aceptar.</p>`,
    [{ label: 'Rechazar', cls: 'btn-ghost', fn: () => rejectPay(i) },
     { label: 'Aceptar pago', cls: 'btn-primary', fn: () => acceptPay(i) }]);
}

async function acceptPay(i) {
  const u = units[i];
  const r = await apiEnviar('POST', `/api/liquidaciones/${u.liquidacionId}/aceptar`);
  closeModal();
  if (!r.ok) return toast(r.msg);
  await recargarEstado();
  toast(`Pago del Local ${u.n} aceptado`);
}

async function rejectPay(i) {
  const u = units[i];
  const r = await apiEnviar('POST', `/api/liquidaciones/${u.liquidacionId}/rechazar`);
  closeModal();
  if (!r.ok) return toast(r.msg);
  await recargarEstado();
  toast('Comprobante rechazado · se notificó al locatario');
}
