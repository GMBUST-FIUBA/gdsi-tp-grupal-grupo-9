/* ---------- Gastos (ABM) ---------- */
function provNombre(id) {
  const p = proveedores.find((x) => x.id === id);
  return p ? p.nombre : '—';
}
function facturaTipoOptions(selected) {
  return tiposFactura.map((t) => `<option${t === selected ? ' selected' : ''}>${t}</option>`).join('');
}
function fillProveedorSelect() {
  document.getElementById('g-prov').innerHTML =
    proveedores.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('');
  document.getElementById('g-facttipo').innerHTML = facturaTipoOptions();
  document.getElementById('gf-prov').innerHTML = '<option value="">Todos los proveedores</option>' +
    proveedores.map((p) => `<option value="${p.id}"${String(p.id) === String(filtroGastos.proveedorId) ? ' selected' : ''}>${p.nombre}</option>`).join('');
  fijarFechaPorDefecto();
}

/** La fecha del formulario de carga arranca en hoy, o en el 1° del período abierto si hoy no cae en él. */
function fijarFechaPorDefecto() {
  const input = document.getElementById('g-fecha');
  if (!input || !periodoActual) return;
  input.min = `${periodoActual}-01`;
  input.max = ultimoDiaDe(periodoActual);
  if (input.value && input.value.startsWith(periodoActual)) return;
  const hoy = new Date().toISOString().slice(0, 10);
  input.value = hoy.startsWith(periodoActual) ? hoy : `${periodoActual}-01`;
}
function ultimoDiaDe(periodo) {
  const [anio, mes] = periodo.split('-').map(Number);
  return `${periodo}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`;
}

/*
 * Las validaciones también viven en el servidor (src/routes/api.js). Estas son
 * para que el usuario vea el error sin esperar el ida y vuelta.
 */
function validarGastoEnPantalla(monto) {
  if (!(monto > 0)) return 'El monto del gasto debe ser mayor a $ 0,00.';
  if (tieneMasDeDosDecimales(monto)) return 'El monto solo puede tener hasta dos decimales.';
  return null;
}

function archivoLinkHTML(g) {
  return g.archivoUrl
    ? `<a class="btn btn-ghost btn-sm" href="${g.archivoUrl}" download="${g.archivoNombre}">↓ ${g.archivoNombre}</a>`
    : '<span class="hint">Sin factura adjunta</span>';
}

/*
 * La lista de "Gastos cargados" no usa el global `gastos` (que es solo el
 * período abierto): se pide a GET /api/gastos con los filtros elegidos.
 */
let filtroGastos = { periodo: '', tipo: '', proveedorId: '', pagina: 1 };
let gastosFiltrados = [];
let periodoAbiertoGastos = null;

function renderGastos() { cargarGastosFiltrados(); }

function cambiarFiltroGastos() {
  filtroGastos.periodo = document.getElementById('gf-periodo').value;
  filtroGastos.tipo = document.getElementById('gf-tipo').value;
  filtroGastos.proveedorId = document.getElementById('gf-prov').value;
  filtroGastos.pagina = 1;
  cargarGastosFiltrados();
}
function irAPaginaGastos(pagina) {
  filtroGastos.pagina = pagina;
  cargarGastosFiltrados();
}

function opcionesPeriodo(periodos, elegido) {
  return periodos.map((p) => `<option value="${p}"${p === elegido ? ' selected' : ''}>${periodoLabel(p)}</option>`).join('') +
    `<option value="todos"${elegido === 'todos' ? ' selected' : ''}>Todos los meses</option>`;
}

function paginacionHTML(r, fn) {
  if (r.paginas <= 1) return '';
  return `<button class="btn btn-ghost btn-sm" ${r.pagina <= 1 ? 'disabled' : ''} onclick="${fn}(${r.pagina - 1})">← Anterior</button>
    <span class="hint">Página ${r.pagina} de ${r.paginas}</span>
    <button class="btn btn-ghost btn-sm" ${r.pagina >= r.paginas ? 'disabled' : ''} onclick="${fn}(${r.pagina + 1})">Siguiente →</button>`;
}

async function cargarGastosFiltrados() {
  const box = document.getElementById('gastos-list');
  if (!box) return;
  const r = await apiLeer('/api/gastos' + queryString(filtroGastos));
  if (!r.ok) { box.innerHTML = `<div class="empty">${escaparHTML(r.msg || 'No se pudieron leer los gastos.')}</div>`; return; }

  gastosFiltrados = r.gastos;
  periodoAbiertoGastos = r.periodoAbierto;
  if (!filtroGastos.periodo) filtroGastos.periodo = r.periodoAbierto || '';
  filtroGastos.pagina = r.pagina;
  document.getElementById('gf-periodo').innerHTML = opcionesPeriodo(r.periodos, filtroGastos.periodo);

  document.getElementById('gastos-count').textContent = r.total ? `${r.total} ${r.total === 1 ? 'gasto' : 'gastos'}` : '';
  document.getElementById('gastos-total').innerHTML = r.total ? `Total: <strong class="mono">${centsToMoney(r.totalCents)}</strong>` : '';
  document.getElementById('gastos-paginacion').innerHTML = paginacionHTML(r, 'irAPaginaGastos');

  if (!r.gastos.length) {
    box.innerHTML = `<div class="empty">${r.periodos.length > 1 || filtroGastos.tipo || filtroGastos.proveedorId ? 'No hay gastos con esos filtros.' : 'Todavía no cargaste gastos.'}</div>`;
    return;
  }
  box.innerHTML = r.gastos.map((g) => {
    const editable = g.periodo === r.periodoAbierto;
    return `
    <div class="abm-row">
      <div class="an" style="font-size:.68rem">${g.tipo === 'ordinario' ? 'ORD' : 'EXT'}</div>
      <div>
        <div class="aname">${g.proveedorNombre} · ${centsToMoney(g.montoCents)}</div>
        <div class="acontact">${fechaCorta(g.fecha)} · ${g.desc} · ${g.facturaTipo} N° ${g.facturaNro}</div>
      </div>
      <div class="aacts">
        ${archivoLinkHTML(g)}
        ${editable
          ? `<button class="btn btn-ghost btn-sm" onclick="editGasto(${g.id})">Editar</button>
             <button class="btn btn-danger btn-sm" onclick="confirmDeleteGasto(${g.id})">Borrar</button>`
          : `<span class="hint">${periodoLabel(g.periodo)} · liquidado</span>`}
      </div>
    </div>`;
  }).join('');
}

async function addGasto() {
  const archivoInput = document.getElementById('g-archivo');
  const monto = Number(document.getElementById('g-monto').value);

  const msgEnPantalla = validarGastoEnPantalla(monto);
  if (msgEnPantalla) return mostrarError('g-err', msgEnPantalla);

  const fd = new FormData();
  fd.append('tipo', document.getElementById('g-tipo').value);
  fd.append('proveedorId', document.getElementById('g-prov').value);
  fd.append('facturaTipo', document.getElementById('g-facttipo').value);
  fd.append('facturaNro', document.getElementById('g-factnro').value);
  fd.append('desc', document.getElementById('g-desc').value);
  fd.append('monto', monto);
  fd.append('fecha', document.getElementById('g-fecha').value);
  if (archivoInput.files.length) fd.append('archivo', archivoInput.files[0]);

  const r = await apiEnviar('POST', '/api/gastos', fd);
  if (!r.ok) return mostrarError('g-err', r.msg);

  mostrarError('g-err', null);
  await recargarEstado();
  toast('Gasto cargado correctamente');

  document.getElementById('g-facttipo').selectedIndex = 0;
  document.getElementById('g-factnro').value = '';
  document.getElementById('g-desc').value = '';
  document.getElementById('g-monto').value = '';
  archivoInput.value = '';
  document.getElementById('g-archivo-box').classList.remove('has');
  document.getElementById('g-archivo-t').textContent = 'Adjuntar factura';
}

function editGasto(id) {
  const g = gastosFiltrados.find((x) => x.id === id);
  const fileLabel = g.archivoNombre ? `Factura actual · ${g.archivoNombre}` : 'Adjuntar factura';
  openModal(`Editar gasto — ${g.proveedorNombre}`,
    `<div class="field" style="margin-bottom:12px"><label>Fecha</label><input id="eg-fecha" type="date" value="${g.fecha || ''}" min="${g.periodo}-01" max="${ultimoDiaDe(g.periodo)}"></div>
     <div class="field" style="margin-bottom:12px"><label>Tipo de factura</label><select id="eg-facttipo">${facturaTipoOptions(g.facturaTipo)}</select></div>
     <div class="field" style="margin-bottom:12px"><label>Número de factura</label><input id="eg-factnro" value="${g.facturaNro}"></div>
     <div class="field" style="margin-bottom:12px"><label>Descripción</label><input id="eg-desc" value="${g.desc}"></div>
     <div class="field" style="margin-bottom:12px"><label>Costo</label><input id="eg-monto" type="number" min="0" step="0.01" value="${g.monto}"><span class="hint">Hasta dos decimales.</span></div>
     <div class="field">
       <label>Factura (PDF, JPEG o PNG) · opcional</label>
       <label class="filebox${g.archivoNombre ? ' has' : ''}" for="eg-archivo" id="eg-archivo-box">
         <div class="fi-ico">📎</div><div class="fi-t" id="eg-archivo-t">${fileLabel}</div><div class="fi-s">PDF, JPEG o PNG</div>
       </label>
       <input type="file" id="eg-archivo" accept="application/pdf,image/jpeg,image/png" onchange="fileChosen(this,'eg-archivo-box','eg-archivo-t','Nueva factura')">
     </div>
     <div class="note late" id="eg-err" style="margin-top:12px" hidden></div>`,
    [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
     { label: 'Guardar cambios', cls: 'btn-primary', fn: () => saveGasto(id) }]);
}

async function saveGasto(id) {
  const archivoInput = document.getElementById('eg-archivo');
  const monto = Number(document.getElementById('eg-monto').value);

  const msgEnPantalla = validarGastoEnPantalla(monto);
  if (msgEnPantalla) return mostrarError('eg-err', msgEnPantalla);

  const fd = new FormData();
  fd.append('facturaTipo', document.getElementById('eg-facttipo').value);
  fd.append('facturaNro', document.getElementById('eg-factnro').value);
  fd.append('desc', document.getElementById('eg-desc').value);
  fd.append('monto', monto);
  fd.append('fecha', document.getElementById('eg-fecha').value);
  if (archivoInput.files.length) fd.append('archivo', archivoInput.files[0]);

  const r = await apiEnviar('PUT', `/api/gastos/${id}`, fd);
  if (!r.ok) return mostrarError('eg-err', r.msg);

  closeModal();
  await recargarEstado();
  toast('Cambios guardados');
}

function confirmDeleteGasto(id) {
  const g = gastosFiltrados.find((x) => x.id === id);
  openModal('Borrar gasto',
    `<p style="margin:0">Vas a borrar el gasto de <strong>${g.proveedorNombre}</strong> por <strong>${centsToMoney(g.montoCents)}</strong> (${g.facturaTipo} N° ${g.facturaNro}). Esta acción no se puede deshacer.</p>`,
    [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
     { label: 'Confirmar borrado', cls: 'btn-danger', fn: () => deleteGasto(id) }]);
}

async function deleteGasto(id) {
  const r = await apiEnviar('DELETE', `/api/gastos/${id}`);
  closeModal();
  if (!r.ok) return toast(r.msg);
  await recargarEstado();
  toast('Gasto borrado');
}
