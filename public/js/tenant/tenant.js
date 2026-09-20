/* ---------- Vista del locatario ---------- */
function renderGastosTenant() {
  const box = document.getElementById('tenant-gastos-rows');
  if (!box) return; // la galería todavía no tiene contratos
  if (!gastos.length) {
    box.innerHTML = '<tr><td class="desc" colspan="6">Sin gastos cargados este mes.</td></tr>';
    return;
  }
  box.innerHTML = gastos.map((g) => `
    <tr>
      <td class="desc">${g.tipo === 'ordinario' ? 'Ordinario' : 'Extraordinario'}</td>
      <td class="desc">${g.proveedorNombre}</td>
      <td class="desc">${g.desc}</td>
      <td class="desc">${g.facturaTipo} N° ${g.facturaNro}</td>
      <td style="text-align:right">${centsToMoney(g.montoCents)}</td>
      <td class="desc">${archivoLinkHTML(g)}</td>
    </tr>`).join('');
}

function tenantUpload(input) {
  if (!input.files.length) return;
  document.getElementById('t-comp-box').classList.add('has');
  document.getElementById('t-comp-t').textContent = 'Comprobante listo · ' + input.files[0].name;
  document.getElementById('t-send').disabled = false;
}

async function tenantSend(liquidacionId) {
  const input = document.getElementById('t-comp');
  if (!input.files.length) {
    return mostrarError('t-err', 'Adjuntá el comprobante antes de enviarlo.');
  }

  const fd = new FormData();
  fd.append('liquidacionId', liquidacionId);
  fd.append('comprobante', input.files[0]);

  const boton = document.getElementById('t-send');
  boton.disabled = true;

  const r = await apiEnviar('POST', '/api/tenant/comprobante', fd);
  if (!r.ok) {
    boton.disabled = false;
    return mostrarError('t-err', r.msg);
  }

  document.getElementById('pay-block').innerHTML =
    '<div class="note rev"><strong>Comprobante enviado.</strong> Queda en revisión del administrador. Te avisamos cuando se acredite el pago.</div>';
  await recargarEstado();
  toast('Comprobante enviado a la administración');
}
