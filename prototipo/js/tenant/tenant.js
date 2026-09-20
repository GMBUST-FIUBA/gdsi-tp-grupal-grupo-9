function renderGastosTenant(){
  const box = document.getElementById('tenant-gastos-rows');
  if(!gastos.length){ box.innerHTML = '<tr><td class="desc" colspan="6">Sin gastos cargados este mes.</td></tr>'; return; }
  box.innerHTML = gastos.map(g=>`
    <tr>
      <td class="desc">${g.tipo==='ordinario'?'Ordinario':'Extraordinario'}</td>
      <td class="desc">${provNombre(g.proveedorId)}</td>
      <td class="desc">${g.desc}</td>
      <td class="desc">${g.facturaTipo} N° ${g.facturaNro}</td>
      <td style="text-align:right">${fmtMoney(g.monto)}</td>
      <td class="desc">${archivoLinkHTML(g)}</td>
    </tr>`).join('');
}

function tenantUpload(input){
  if(!input.files.length) return;
  document.getElementById('t-comp-box').classList.add('has');
  document.getElementById('t-comp-t').textContent = 'Comprobante listo · ' + input.files[0].name;
  document.getElementById('t-send').disabled = false;
}
function tenantSend(){
  document.getElementById('pay-block').innerHTML =
    `<div class="note rev"><strong>Comprobante enviado.</strong> Queda en revisión del administrador. Te avisamos cuando se acredite el pago.</div>`;
  toast('Comprobante enviado a la administración');
}
