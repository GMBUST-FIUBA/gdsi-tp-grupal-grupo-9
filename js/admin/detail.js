/* ---------- Detail ---------- */
const detailBody = document.getElementById('detail-body');
const detailSub = document.getElementById('detail-sub');

function selectUnit(i){
  selectedIdx = i; renderPlan();
  const u = units[i];
  detailSub.textContent = `Local ${u.n} · ${stLabel[u.st]}`;

  if(u.st==='free'){
    detailBody.innerHTML = `
      <div class="contract-title"><span class="num">${u.n}</span><div><h3>Local disponible</h3></div>
        <span class="pill free" style="margin-left:auto"><i></i>Libre</span></div>
      <dl class="dl"><dt>Situación</dt><dd>${u.desde||'Sin contrato'}</dd><dt>Superficie</dt><dd>~ 38 m²</dd>
        <dt>Expensas base</dt><dd class="mono">$ 160.000,00</dd></dl>
      <div class="note">Local sin contrato vigente. Registrá un alta desde <strong>Nuevo contrato</strong>.</div>`;
    return;
  }

  const compBlock = u.comp
    ? `<div class="note rev"><strong>Comprobante recibido</strong> el ${u.compFecha}. Revisalo para aceptar el pago.</div>
       <div class="form-actions" style="margin-top:12px">
         <button class="btn btn-primary btn-sm" onclick="viewReceipt(${i})">Ver comprobante y aceptar</button>
       </div>`
    : (u.st==='late'
        ? `<div class="note late"><strong>Estado de cobro:</strong> ${u.pago}</div>`
        : `<div class="note"><strong>Estado de cobro:</strong> ${u.pago}</div>`);

  detailBody.innerHTML = `
    <div class="contract-title"><span class="num">${u.n}</span>
      <div><h3>${u.loc}</h3><span class="sub" style="color:var(--muted);font-size:.8rem">${u.rubro}</span></div>
      <span class="pill ${stPill[u.st]}" style="margin-left:auto"><i></i>${stLabel[u.st]}</span></div>
    <dl class="dl">
      <dt>Modalidad</dt><dd>${u.mod}</dd>
      <dt>Actualización</dt><dd>${u.act}</dd>
      <dt>Alquiler fijo</dt><dd class="mono">${u.fijo}</dd>
      <dt>Gastos comunes</dt><dd class="mono">${u.exp}</dd>
      <dt>Vencimiento</dt><dd>Día ${u.venc}</dd>
    </dl>
    <table class="liq" style="margin-top:16px"><tr class="total"><td>A pagar en agosto</td><td>${u.tot}</td></tr></table>
    ${compBlock}
    <div class="form-actions">
      <button class="btn btn-ghost btn-sm" onclick="toast('Contrato (PDF) abierto')">Ver contrato</button>
      <button class="btn btn-danger btn-sm" onclick="confirmBaja(${i})">Dar de baja contrato</button>
    </div>`;
}

/* ---------- Baja de contrato ---------- */
function confirmBaja(i){
  const u = units[i];
  openModal(`Dar de baja — Local ${u.n}`,
    `<p style="margin:0 0 12px">Vas a rescindir el contrato de <strong>${u.loc}</strong>. El local pasará a estado <strong>libre</strong> y se generará el estado de cuenta final.</p>
     <div class="field"><label for="baja-mot">Motivo</label>
       <select id="baja-mot"><option>Fin de contrato</option><option>Rescisión anticipada</option><option>Falta de pago</option><option>Acuerdo de partes</option></select></div>`,
    [{label:'Cancelar', cls:'btn-ghost', fn:closeModal},
     {label:'Confirmar baja', cls:'btn-danger', fn:()=>{ doBaja(i); closeModal(); }}]);
}
function doBaja(i){
  const u = units[i];
  u.st='free'; u.baja=true; u.desde='Baja: Ago 2026'; u.comp=false; u.nuevo=false;
  renderPlan(); selectUnit(i); renderCobranzas(); renderAccounts(); refreshNotif();
  toast(`Contrato del Local ${u.n} dado de baja`);
}

/* ---------- Receipt view + accept ---------- */
function viewReceipt(i){
  const u = units[i];
  openModal(`Comprobante — Local ${u.n}`,
    `<div class="receipt">
       <div class="r-bank">Transferencia recibida</div>
       <div class="r-line"><span>Origen</span><span>${u.loc}</span></div>
       <div class="r-line"><span>CBU destino</span><span>····4402</span></div>
       <div class="r-line"><span>Fecha</span><span>${u.compFecha}</span></div>
       <div class="r-line"><span>Operación</span><span>#83920${i}</span></div>
       <div class="r-amt">${u.tot}</div>
       <div class="r-stamp">COMPROBANTE</div>
     </div>
     <p style="font-size:.82rem;color:var(--muted);margin:12px 0 0">Verificá que el monto coincida con la liquidación del mes antes de aceptar.</p>`,
    [{label:'Rechazar', cls:'btn-ghost', fn:()=>{ closeModal(); toast('Comprobante rechazado · se notificó al locatario'); }},
     {label:'Aceptar pago', cls:'btn-primary', fn:()=>{ acceptPay(i); closeModal(); }}]);
}
function acceptPay(i){
  const u = units[i];
  u.st='ok'; u.comp=false; u.pago='Cobrado (comprobante aceptado)'; u.cob=u.fact;
  renderPlan(); selectUnit(i); renderCobranzas(); renderAccounts(); refreshNotif();
  toast(`Pago del Local ${u.n} aceptado`);
}
