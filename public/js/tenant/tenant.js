/* ---------- Vista del locatario ---------- */
let filtroGastosTenant = { periodo: '', tipo: '', pagina: 1 };

function renderGastosTenant() { cargarGastosTenant(); }

function cambiarFiltroGastosTenant() {
  filtroGastosTenant.periodo = document.getElementById('tg-periodo').value;
  filtroGastosTenant.tipo = document.getElementById('tg-tipo').value;
  filtroGastosTenant.pagina = 1;
  cargarGastosTenant();
}
function irAPaginaGastosTenant(pagina) {
  filtroGastosTenant.pagina = pagina;
  cargarGastosTenant();
}

async function cargarGastosTenant() {
  const box = document.getElementById('tenant-gastos-rows');
  if (!box) return; // la galería todavía no tiene contratos
  const r = await apiLeer('/api/gastos' + queryString(filtroGastosTenant));
  if (!r.ok) {
    box.innerHTML = `<tr><td class="desc" colspan="7">${escaparHTML(r.msg || 'No se pudieron leer los gastos.')}</td></tr>`;
    return;
  }
  if (!filtroGastosTenant.periodo) filtroGastosTenant.periodo = r.periodoAbierto || '';
  filtroGastosTenant.pagina = r.pagina;
  const elegido = filtroGastosTenant.periodo;
  document.getElementById('tg-periodo').innerHTML = opcionesPeriodo(r.periodos, elegido);

  const esAbierto = elegido === r.periodoAbierto;
  document.getElementById('tenant-gastos-titulo').textContent =
    `Gastos comunes · ${elegido === 'todos' ? 'Todos los meses' : periodoLabel(elegido)}`;
  document.getElementById('tenant-gastos-sub').textContent = esAbierto
    ? 'Los del mes en curso: se reparten en las expensas del mes que viene'
    : (elegido === 'todos' ? '' : 'Mes ya liquidado');
  document.getElementById('tenant-gastos-paginacion').innerHTML = paginacionHTML(r, 'irAPaginaGastosTenant');
  document.getElementById('tenant-gastos-total').innerHTML = r.total
    ? `<tr><td class="desc" colspan="5"><strong>Total${r.paginas > 1 ? ` (${r.total} gastos)` : ''}</strong></td><td style="text-align:right"><strong>${centsToMoney(r.totalCents)}</strong></td><td></td></tr>`
    : '';

  if (!r.gastos.length) {
    box.innerHTML = `<tr><td class="desc" colspan="7">${esAbierto && !filtroGastosTenant.tipo ? 'Sin gastos cargados este mes.' : 'No hay gastos con esos filtros.'}</td></tr>`;
    return;
  }
  box.innerHTML = r.gastos.map((g) => `
    <tr>
      <td class="desc">${fechaCorta(g.fecha)}</td>
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


  window.location.reload();
}
