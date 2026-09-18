/* ---------- Gastos (ABM) ---------- */
function provNombre(id){
  const p = proveedores.find(x=>x.id===id);
  return p ? p.nombre : '—';
}
function facturaTipoOptions(selected){
  return tiposFactura.map(t=>`<option${t===selected?' selected':''}>${t}</option>`).join('');
}
function fillProveedorSelect(){
  document.getElementById('g-prov').innerHTML =
    proveedores.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('');
  document.getElementById('g-facttipo').innerHTML = facturaTipoOptions();
}
function validarGasto(g, excludeId){
  if(!g.proveedorId || !tiposFactura.includes(g.facturaTipo) || !g.facturaNro.trim() || !g.desc.trim()){
    return {ok:false, msg:'Completá todos los campos obligatorios antes de guardar (la factura adjunta es opcional).'};
  }
  if(!(g.monto > 0)){
    return {ok:false, msg:'El monto del gasto debe ser mayor a $ 0,00.'};
  }
  if(tieneMasDeDosDecimales(g.monto)){
    return {ok:false, msg:'El monto solo puede tener hasta dos decimales.'};
  }
  const nro = g.facturaNro.trim().toLowerCase();
  const dup = gastos.some(x=> x.id!==excludeId && x.proveedorId===g.proveedorId && x.facturaNro.trim().toLowerCase()===nro);
  if(dup){
    return {ok:false, msg:'Ya existe un gasto cargado con ese número de factura para este proveedor.'};
  }
  return {ok:true};
}
function archivoLinkHTML(g){
  return g.archivoUrl
    ? `<a class="btn btn-ghost btn-sm" href="${g.archivoUrl}" download="${g.archivoNombre}">↓ ${g.archivoNombre}</a>`
    : '<span class="hint">Sin factura adjunta</span>';
}
function renderGastos(){
  const box = document.getElementById('gastos-list');
  document.getElementById('gastos-count').textContent = gastos.length ? `${gastos.length} cargados` : '';
  if(!gastos.length){ box.innerHTML = '<div class="empty">Todavía no cargaste gastos.</div>'; return; }
  box.innerHTML = gastos.map(g=>`
    <div class="abm-row">
      <div class="an" style="font-size:.68rem">${g.tipo==='ordinario'?'ORD':'EXT'}</div>
      <div>
        <div class="aname">${provNombre(g.proveedorId)} · ${fmtMoney(g.monto)}</div>
        <div class="acontact">${g.desc} · ${g.facturaTipo} N° ${g.facturaNro}</div>
      </div>
      <div class="aacts">
        ${archivoLinkHTML(g)}
        <button class="btn btn-ghost btn-sm" onclick="editGasto(${g.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteGasto(${g.id})">Borrar</button>
      </div>
    </div>`).join('');
}

function addGasto(){
  const errBox = document.getElementById('g-err');
  const archivoInput = document.getElementById('g-archivo');
  const hasFile = archivoInput.files.length > 0;
  const g = {
    tipo: document.getElementById('g-tipo').value,
    proveedorId: Number(document.getElementById('g-prov').value),
    facturaTipo: document.getElementById('g-facttipo').value,
    facturaNro: document.getElementById('g-factnro').value,
    desc: document.getElementById('g-desc').value,
    monto: Number(document.getElementById('g-monto').value),
    archivoNombre: hasFile ? archivoInput.files[0].name : null,
    archivoUrl: hasFile ? URL.createObjectURL(archivoInput.files[0]) : null
  };
  const v = validarGasto(g, null);
  if(!v.ok){
    if(g.archivoUrl) URL.revokeObjectURL(g.archivoUrl);
    errBox.textContent = v.msg; errBox.hidden = false; return;
  }
  errBox.hidden = true;
  gastos.push({id: ++gastoSeq, fecha: new Date().toISOString().slice(0,10), ...g});
  renderGastos(); renderGastosTenant();
  toast('Gasto cargado correctamente');
  document.getElementById('g-facttipo').selectedIndex = 0;
  document.getElementById('g-factnro').value = '';
  document.getElementById('g-desc').value = '';
  document.getElementById('g-monto').value = '';
  archivoInput.value = '';
  document.getElementById('g-archivo-box').classList.remove('has');
  document.getElementById('g-archivo-t').textContent = 'Adjuntar factura';
}
function editGasto(id){
  const g = gastos.find(x=>x.id===id);
  const fileLabel = g.archivoNombre ? `Factura actual · ${g.archivoNombre}` : 'Adjuntar factura';
  openModal(`Editar gasto — ${provNombre(g.proveedorId)}`,
    `<div class="field" style="margin-bottom:12px"><label>Tipo de factura</label><select id="eg-facttipo">${facturaTipoOptions(g.facturaTipo)}</select></div>
     <div class="field" style="margin-bottom:12px"><label>Número de factura</label><input id="eg-factnro" value="${g.facturaNro}"></div>
     <div class="field" style="margin-bottom:12px"><label>Descripción</label><input id="eg-desc" value="${g.desc}"></div>
     <div class="field" style="margin-bottom:12px"><label>Costo</label><input id="eg-monto" type="number" min="0" step="0.01" value="${g.monto}"><span class="hint">Hasta dos decimales.</span></div>
     <div class="field">
       <label>Factura (PDF, JPEG o PNG) · opcional</label>
       <label class="filebox${g.archivoNombre?' has':''}" for="eg-archivo" id="eg-archivo-box">
         <div class="fi-ico">📎</div><div class="fi-t" id="eg-archivo-t">${fileLabel}</div><div class="fi-s">PDF, JPEG o PNG</div>
       </label>
       <input type="file" id="eg-archivo" accept="application/pdf,image/jpeg,image/png" onchange="fileChosen(this,'eg-archivo-box','eg-archivo-t','Nueva factura')">
     </div>
     <div class="note late" id="eg-err" style="margin-top:12px" hidden></div>`,
    [{label:'Cancelar', cls:'btn-ghost', fn:closeModal},
     {label:'Guardar cambios', cls:'btn-primary', fn:()=>saveGasto(id)}]);
}
function saveGasto(id){
  const g = gastos.find(x=>x.id===id);
  const archivoInput = document.getElementById('eg-archivo');
  const hasNewFile = archivoInput.files.length > 0;
  const updated = {
    tipo: g.tipo,
    proveedorId: g.proveedorId,
    facturaTipo: document.getElementById('eg-facttipo').value,
    facturaNro: document.getElementById('eg-factnro').value,
    desc: document.getElementById('eg-desc').value,
    monto: Number(document.getElementById('eg-monto').value),
    archivoNombre: hasNewFile ? archivoInput.files[0].name : g.archivoNombre,
    archivoUrl: hasNewFile ? URL.createObjectURL(archivoInput.files[0]) : g.archivoUrl
  };
  const errBox = document.getElementById('eg-err');
  const v = validarGasto(updated, id);
  if(!v.ok){
    if(hasNewFile) URL.revokeObjectURL(updated.archivoUrl);
    errBox.textContent = v.msg; errBox.hidden = false; return;
  }
  if(hasNewFile && g.archivoUrl) URL.revokeObjectURL(g.archivoUrl);
  Object.assign(g, updated);
  closeModal();
  renderGastos(); renderGastosTenant();
  toast('Cambios guardados');
}
function confirmDeleteGasto(id){
  const g = gastos.find(x=>x.id===id);
  openModal('Borrar gasto',
    `<p style="margin:0">Vas a borrar el gasto de <strong>${provNombre(g.proveedorId)}</strong> por <strong>${fmtMoney(g.monto)}</strong> (${g.facturaTipo} N° ${g.facturaNro}). Esta acción no se puede deshacer.</p>`,
    [{label:'Cancelar', cls:'btn-ghost', fn:closeModal},
     {label:'Confirmar borrado', cls:'btn-danger', fn:()=>{ deleteGasto(id); closeModal(); }}]);
}
function deleteGasto(id){
  const g = gastos.find(x=>x.id===id);
  if(g && g.archivoUrl) URL.revokeObjectURL(g.archivoUrl);
  gastos = gastos.filter(x=>x.id!==id);
  renderGastos(); renderGastosTenant();
  toast('Gasto borrado');
}
