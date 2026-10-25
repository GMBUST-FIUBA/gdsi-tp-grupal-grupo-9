/* ---------- Dueños de los locales ---------- */
/*
 * La sección gira alrededor de un dueño elegido en el selector de arriba: se
 * muestra primero su rendición del mes y abajo sus datos, en modo lectura hasta
 * que se toca "Editar". El alta vive en un panel aparte que arranca colapsado.
 */

let duenos = [];
let localesDeGaleria = [];   // { id, numero, duenoId } de todos los locales
let duenoElegido = '';       // id del dueño del selector, '' = toda la galería
let editandoDueno = false;   // ¿el panel de datos está en modo edición?

/** Trae los dueños y redibuja selector, rendición y datos. */
async function cargarDuenos() {
  const r = await apiLeer('/api/duenos');
  if (!r || !Array.isArray(r.duenos)) return;
  duenos = r.duenos;
  localesDeGaleria = r.locales || [];

  // Si al dueño elegido lo borraron, volvemos a la galería completa.
  if (duenoElegido && !duenoActual()) duenoElegido = '';

  fillSelectorDuenos();
  renderSinDueno();
  renderDatosDueno();
  renderRendicion();
}

function duenoActual() {
  return duenos.find((d) => String(d.id) === String(duenoElegido)) || null;
}

function nombreDeDueno(id) {
  const d = duenos.find((x) => x.id === id);
  return d ? d.nombre : null;
}

/* ---------- Selector ---------- */

function fillSelectorDuenos() {
  const sel = document.getElementById('du-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">Toda la galería</option>'
    + duenos.map((d) => {
      const cuantos = d.locales.length;
      return `<option value="${d.id}">${escaparHTML(d.nombre)} · ${cuantos} local${cuantos === 1 ? '' : 'es'}</option>`;
    }).join('');
  sel.value = duenoElegido;
}

function seleccionarDueno(id) {
  duenoElegido = id || '';
  salirDeEdicion();
  renderDatosDueno();
  renderRendicion();
}

/** Aviso de los locales que todavía no tienen dueño. */
function renderSinDueno() {
  const box = document.getElementById('du-sin-dueno');
  if (!box) return;
  const sueltos = localesDeGaleria.filter((l) => !l.duenoId);
  box.hidden = !sueltos.length;
  if (sueltos.length) {
    box.textContent = `Sin dueño asignado: ${sueltos.map((l) => 'Local ' + l.numero).join(', ')}.`;
  }
}

/* ---------- Datos del dueño elegido ---------- */

function renderDatosDueno() {
  const panel = document.getElementById('du-datos');
  const titulo = document.getElementById('du-datos-titulo');
  if (!panel) return;

  const d = duenoActual();
  // Con "Toda la galería" no hay datos de nadie que mostrar.
  panel.hidden = !d;
  titulo.hidden = !d;
  if (!d) return;

  document.getElementById('du-datos-nombre').textContent = d.nombre;
  document.getElementById('du-datos-sub').textContent = d.locales.length
    ? `${d.locales.length} local${d.locales.length === 1 ? '' : 'es'}`
    : 'Sin locales asignados';

  const fila = (rotulo, valor) => `<dt>${rotulo}</dt><dd>${valor ? escaparHTML(valor) : '—'}</dd>`;
  document.getElementById('du-ver-dl').innerHTML =
    fila('Nombre', d.nombre)
    + fila('Email', d.email)
    + fila('Teléfono', d.telefono)
    + fila('Contacto', d.contacto)
    + fila('Locales', d.locales.map((l) => 'Local ' + l.numero).join(', '));
}

function habilitarEdicionDueno() {
  const d = duenoActual();
  if (!d) return;
  editandoDueno = true;
  document.getElementById('du-nombre').value = d.nombre || '';
  document.getElementById('du-email').value = d.email || '';
  document.getElementById('du-tel').value = d.telefono || '';
  document.getElementById('du-contacto').value = d.contacto || '';
  renderCheckLocales('du-locales', d.id);
  mostrarError('du-err', null);
  document.getElementById('du-ver').hidden = true;
  document.getElementById('du-editar').hidden = false;
}

function salirDeEdicion() {
  editandoDueno = false;
  const ver = document.getElementById('du-ver');
  const editar = document.getElementById('du-editar');
  if (ver) ver.hidden = false;
  if (editar) editar.hidden = true;
  mostrarError('du-err', null);
}

function cancelarEdicionDueno() {
  salirDeEdicion();
}

async function guardarDueno() {
  const d = duenoActual();
  if (!d) return;

  const nombre = document.getElementById('du-nombre').value.trim();
  if (!nombre) return mostrarError('du-err', 'Ingresá el nombre del dueño.');

  const r = await apiEnviar('PUT', `/api/duenos/${d.id}`, {
    nombre,
    email: document.getElementById('du-email').value,
    telefono: document.getElementById('du-tel').value,
    contacto: document.getElementById('du-contacto').value,
    locales: localesMarcados('du-locales'),
  });
  if (!r.ok) return mostrarError('du-err', r.msg);

  salirDeEdicion();
  await cargarDuenos();
  await recargarEstado();
  toast('Cambios guardados');
}

function confirmBorrarDueno() {
  const d = duenoActual();
  if (!d) return;
  const aviso = d.locales.length
    ? ` Sus ${d.locales.length} local(es) quedan sin dueño asignado.`
    : '';
  openModal('Borrar dueño',
    `<p style="margin:0">Vas a borrar a <strong>${escaparHTML(d.nombre)}</strong>.${aviso} Esta acción no se puede deshacer.</p>`,
    [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
     { label: 'Confirmar borrado', cls: 'btn-danger', fn: () => borrarDueno(d.id) }]);
}

async function borrarDueno(id) {
  const r = await apiEnviar('DELETE', `/api/duenos/${id}`);
  closeModal();
  if (!r.ok) return toast(r.msg);
  duenoElegido = '';
  salirDeEdicion();
  await cargarDuenos();
  await recargarEstado();
  toast('Dueño borrado');
}

/* ---------- Alta (panel colapsado) ---------- */

function abrirAltaDueno() {
  ['na-nombre', 'na-email', 'na-tel', 'na-contacto'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  renderCheckLocales('na-locales', null);
  mostrarError('na-err', null);
  document.getElementById('du-alta').hidden = false;
  document.getElementById('du-nuevo-btn').hidden = true;
  document.getElementById('na-nombre').focus();
}

function cerrarAltaDueno() {
  document.getElementById('du-alta').hidden = true;
  document.getElementById('du-nuevo-btn').hidden = false;
  mostrarError('na-err', null);
}

async function crearDueno() {
  const nombre = document.getElementById('na-nombre').value.trim();
  if (!nombre) return mostrarError('na-err', 'Ingresá el nombre del dueño.');

  const r = await apiEnviar('POST', '/api/duenos', {
    nombre,
    email: document.getElementById('na-email').value,
    telefono: document.getElementById('na-tel').value,
    contacto: document.getElementById('na-contacto').value,
    locales: localesMarcados('na-locales'),
  });
  if (!r.ok) return mostrarError('na-err', r.msg);

  cerrarAltaDueno();
  // Queda elegido el recién creado, así se ve su rendición y sus datos.
  duenoElegido = String(r.duenoId);
  await cargarDuenos();
  await recargarEstado();
  toast('Dueño agregado');
}

/* ---------- Grilla de locales (compartida por alta y edición) ---------- */

/**
 * Checkboxes con los locales de la galería. Solo se pueden marcar los que están
 * libres (y los que ya son de este dueño): los de otro aparecen deshabilitados
 * con el nombre de su dueño, y para pasarlos hay que liberarlos desde su ficha.
 */
function renderCheckLocales(boxId, duenoId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  if (!localesDeGaleria.length) {
    box.innerHTML = '<div class="empty">La galería todavía no tiene locales.</div>';
    return;
  }

  const html = localesDeGaleria.map((l) => {
    const propio = duenoId !== null && l.duenoId === duenoId;
    const otro = l.duenoId && !propio ? nombreDeDueno(l.duenoId) : null;
    return `
      <label class="${otro ? 'ajeno' : ''}"${otro ? ` title="Ya es de ${escaparHTML(otro)}"` : ''}>
        <input type="checkbox" value="${l.id}"${propio ? ' checked' : ''}${otro ? ' disabled' : ''}>
        <span>Local ${escaparHTML(l.numero)}</span>
      </label>`;
  }).join('');

  const libres = localesDeGaleria.filter((l) => !l.duenoId).length;
  const aviso = libres
    ? ''
    : '<div class="empty">Todos los locales ya tienen dueño.</div>';
  box.innerHTML = html + aviso;
}

function localesMarcados(boxId) {
  return [...document.querySelectorAll(`#${boxId} input[type=checkbox]:checked`)]
    .map((c) => Number(c.value));
}
