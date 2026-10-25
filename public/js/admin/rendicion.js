/* ---------- Rendición al dueño ---------- */

// Última rendición traída: la usan los botones de PDF y envío.
let rendicionActual = null;

/**
 * "Enviar al dueño" solo tiene sentido con un dueño elegido, con email y con
 * SMTP configurado; el title explica por qué está deshabilitado.
 */
function syncBotonEnviar() {
  const btn = document.getElementById('rend-enviar');
  if (!btn) return;
  const r = rendicionActual;
  let motivo = '';
  if (!r) motivo = 'Todavía no se pudo calcular la rendición.';
  else if (!r.dueno) motivo = 'Elegí un dueño: la rendición de toda la galería no tiene a quién enviarse.';
  else if (!r.dueno.email) motivo = `${r.dueno.nombre} no tiene email cargado.`;
  else if (!r.mailConfigurado) motivo = 'No hay servidor de correo configurado (ver README).';

  btn.disabled = !!motivo;
  btn.title = motivo;
}

function descargarRendicion() {
  const id = typeof duenoElegido === 'string' ? duenoElegido : '';
  window.open('/api/rendicion/pdf' + (id ? `?duenoId=${id}` : ''), '_blank');
}

async function enviarRendicion() {
  const btn = document.getElementById('rend-enviar');
  const id = typeof duenoElegido === 'string' ? duenoElegido : '';
  btn.disabled = true;

  const r = await apiEnviar('POST', '/api/rendicion/enviar', { duenoId: id });
  if (!r.ok) {
    syncBotonEnviar();
    return mostrarError('rend-err', r.msg);
  }
  mostrarError('rend-err', null);
  syncBotonEnviar();
  toast(r.msg || 'Rendición enviada');
}

/**
 * Resumen del mes. Sin dueño elegido es el de toda la galería; con uno, solo
 * sus locales (y los gastos prorrateados por el % de expensas de esos locales).
 */
async function renderRendicion() {
  const box = document.getElementById('rend-lines');
  if (!box) return;

  // El dueño sale del selector de la sección (vacío = toda la galería).
  const duenoId = typeof duenoElegido === 'string' ? duenoElegido : '';
  const r = await apiLeer('/api/rendicion' + (duenoId ? `?duenoId=${duenoId}` : ''));

  const sub = document.getElementById('rend-sub');
  const titulo = document.getElementById('rend-titulo');
  mostrarError('rend-err', null);
  rendicionActual = r && r.ok !== false ? r : null;
  syncBotonEnviar();
  if (!r || r.ok === false) {
    box.innerHTML = '<div class="empty">No se pudo calcular la rendición.</div>';
    if (sub) sub.textContent = '';
    return;
  }

  if (titulo) titulo.textContent = r.dueno ? `Resumen de ${r.dueno.nombre}` : 'Resumen del mes';
  if (sub) {
    sub.textContent = r.dueno
      ? `${r.locales} local(es) · le corresponde el ${fmtPct(r.pctGastos)} de los gastos`
      : 'Todos los locales de la galería';
  }

  if (r.dueno && !r.locales) {
    box.innerHTML = '<div class="empty">Este dueño todavía no tiene locales asignados.</div>';
    return;
  }

  const gastosSub = r.dueno
    ? `${fmtPct(r.pctGastos)} de los gastos de la galería`
    : 'ordinarios y extraordinarios';

  box.innerHTML = `
    <div class="line"><div class="lbl">Alquileres cobrados <small>${r.localesCobrados} de ${r.locales} locales</small></div><div class="val">${centsToMoney(r.alquileresCobrados)}</div></div>
    <div class="line"><div class="lbl">Gastos comunes cobrados</div><div class="val">${centsToMoney(r.expensasCobradas)}</div></div>
    <div class="line neg"><div class="lbl">Gastos comunes pagados <small>${gastosSub}</small></div><div class="val">− ${centsToMoney(r.gastosPagados)}</div></div>
    <div class="line neg"><div class="lbl">Comisión del administrador <small>${r.comisionPct}% sobre lo cobrado</small></div><div class="val">− ${centsToMoney(r.comision)}</div></div>
    <div class="line net"><div class="lbl">Neto a transferir ${r.dueno ? 'a ' + escaparHTML(r.dueno.nombre) : 'al dueño'}</div><div class="val">${centsToMoney(r.neto)}</div></div>`;
}
