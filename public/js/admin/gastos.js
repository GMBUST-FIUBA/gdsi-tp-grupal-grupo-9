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
}

/*
 * Las validaciones también viven en el servidor (src/routes/api.js). Estas son
 * para que el usuario vea el error sin esperar el ida y vuelta.
 */
function validarGastoLocal(monto) {
  if (!(monto > 0)) return 'El monto del gasto debe ser mayor a $ 0,00.';
  if (tieneMasDeDosDecimales(monto)) return 'El monto solo puede tener hasta dos decimales.';
  return null;
}

function archivoLinkHTML(g) {
  return g.archivoUrl
    ? `<a class="btn btn-ghost btn-sm" href="${g.archivoUrl}" download="${g.archivoNombre}">↓ ${g.archivoNombre}</a>`
    : '<span class="hint">Sin factura adjunta</span>';
}

function renderGastos() {
  const box = document.getElementById('gastos-list');
  document.getElementById('gastos-count').textContent = gastos.length ? `${gastos.length} cargados` : '';
  if (!gastos.length) { box.innerHTML = '<div class="empty">Todavía no cargaste gastos.</div>'; return; }
  box.innerHTML = gastos.map((g) => `
    <div class="abm-row">
      <div class="an" style="font-size:.68rem">${g.tipo === 'ordinario' ? 'ORD' : 'EXT'}</div>
      <div>
        <div class="aname">${g.proveedorNombre} · ${centsToMoney(g.montoCents)}</div>
        <div class="acontact">${g.desc} · ${g.facturaTipo} N° ${g.facturaNro}</div>
      </div>
      <div class="aacts">
        ${archivoLinkHTML(g)}
        <button class="btn btn-ghost btn-sm" onclick="editGasto(${g.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteGasto(${g.id})">Borrar</button>
      </div>
    </div>`).join('');
}

async function addGasto() {
  const archivoInput = document.getElementById('g-archivo');
  const monto = Number(document.getElementById('g-monto').value);

  const localMsg = validarGastoLocal(monto);
  if (localMsg) return mostrarError('g-err', localMsg);

  const fd = new FormData();
  fd.append('tipo', document.getElementById('g-tipo').value);
  fd.append('proveedorId', document.getElementById('g-prov').value);
  fd.append('facturaTipo', document.getElementById('g-facttipo').value);
  fd.append('facturaNro', document.getElementById('g-factnro').value);
  fd.append('desc', document.getElementById('g-desc').value);
  fd.append('monto', monto);
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
  const g = gastos.find((x) => x.id === id);
  const fileLabel = g.archivoNombre ? `Factura actual · ${g.archivoNombre}` : 'Adjuntar factura';
  openModal(`Editar gasto — ${g.proveedorNombre}`,
    `<div class="field" style="margin-bottom:12px"><label>Tipo de factura</label><select id="eg-facttipo">${facturaTipoOptions(g.facturaTipo)}</select></div>
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

  const localMsg = validarGastoLocal(monto);
  if (localMsg) return mostrarError('eg-err', localMsg);

  const fd = new FormData();
  fd.append('facturaTipo', document.getElementById('eg-facttipo').value);
  fd.append('facturaNro', document.getElementById('eg-factnro').value);
  fd.append('desc', document.getElementById('eg-desc').value);
  fd.append('monto', monto);
  if (archivoInput.files.length) fd.append('archivo', archivoInput.files[0]);

  const r = await apiEnviar('PUT', `/api/gastos/${id}`, fd);
  if (!r.ok) return mostrarError('eg-err', r.msg);

  closeModal();
  await recargarEstado();
  toast('Cambios guardados');
}

function confirmDeleteGasto(id) {
  const g = gastos.find((x) => x.id === id);
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
