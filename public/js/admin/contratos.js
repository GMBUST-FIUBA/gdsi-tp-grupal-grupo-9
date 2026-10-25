/* ---------- Nuevo contrato ---------- */

/** El select de "Local" solo ofrece los locales sin contrato vigente. */
function fillLocalesLibres() {
  const sel = document.getElementById('f-local');
  const libres = units.filter((u) => u.st === 'free');
  if (!libres.length) {
    sel.innerHTML = '<option value="">No hay locales libres</option>';
    return;
  }
  sel.innerHTML = libres.map((u) => `<option value="${u.n}">Local ${u.n} — libre</option>`).join('');
}

function syncModalidad() {
  const esPct = document.getElementById('f-modo').value === 'fijo_pct';
  document.getElementById('f-pct-wrap').hidden = !esPct || esDuenoMarcado();
}

function esDuenoMarcado() {
  const chk = document.getElementById('f-dueno');
  return !!(chk && chk.checked);
}

/* Si el locatario es el dueño no paga alquiler: se ocultan alquiler y modalidad. */
function syncEsDueno() {
  const esDueno = esDuenoMarcado();
  document.getElementById('f-fijo-wrap').hidden = esDueno;
  document.getElementById('f-modo-wrap').hidden = esDueno;
  syncModalidad();
}

/** Dato del último contrato -> campo del formulario donde se copia. */
const camposReplicables = {
  rubro: 'f-rubro',
  locatario: 'f-locatario',
  email: 'f-email',
  telefono: 'f-tel',
  plazoMeses: 'f-meses',
  alquilerFijo: 'f-fijo',
  modalidad: 'f-modo',
  porcentaje: 'f-pct',
};

/**
 * Completa el formulario con el último contrato del local elegido. Solo pisa
 * los campos de los que hay dato; si el local nunca tuvo contrato, no toca nada.
 */
function replicarUltimoContrato() {
  const numero = document.getElementById('f-local').value;
  if (!numero) return toast('No hay locales libres para registrar un contrato.');

  const u = units.find((x) => x.n === numero);
  const previo = u && u.ultimoContrato;
  if (!previo) return toast(`El Local ${numero} no tiene un contrato anterior para replicar`);

  const claves = Object.keys(camposReplicables).filter((k) => previo[k] !== undefined);
  if (!claves.length) return toast(`El último contrato del Local ${numero} no tiene datos para copiar`);

  claves.forEach((k) => {
    document.getElementById(camposReplicables[k]).value = previo[k];
  });
  document.getElementById('f-dueno').checked = !!previo.locatarioEsDueno;
  syncEsDueno();
  mostrarError('f-err', null);
  toast(`Se copiaron los datos del último contrato del Local ${numero}`);
}

async function registrarContrato() {
  const numero = document.getElementById('f-local').value;
  if (!numero) return mostrarError('f-err', 'No hay locales libres para registrar un contrato.');

  const fd = new FormData();
  fd.append('localNumero', numero);
  fd.append('rubro', document.getElementById('f-rubro').value);
  fd.append('locatario', document.getElementById('f-locatario').value);
  fd.append('email', document.getElementById('f-email').value);
  fd.append('telefono', document.getElementById('f-tel').value);
  fd.append('inicio', document.getElementById('f-desde').value);
  fd.append('plazoMeses', document.getElementById('f-meses').value);
  fd.append('locatarioEsDueno', esDuenoMarcado() ? 'true' : 'false');
  fd.append('alquilerFijo', document.getElementById('f-fijo').value);
  fd.append('modalidad', document.getElementById('f-modo').value);
  fd.append('porcentaje', document.getElementById('f-pct').value);

  const pdf = document.getElementById('f-pdf');
  if (pdf.files.length) fd.append('pdf', pdf.files[0]);

  const r = await apiEnviar('POST', '/api/contratos', fd);
  if (!r.ok) return mostrarError('f-err', r.msg);

  mostrarError('f-err', null);
  limpiarFormContrato();
  await recargarEstado();
  toast('Contrato registrado' + (pdf.files.length ? ' con PDF adjunto' : ''));
}

function limpiarFormContrato() {
  document.getElementById('f-dueno').checked = false;
  syncEsDueno();
  ['f-rubro', 'f-locatario', 'f-email', 'f-tel'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  const pdf = document.getElementById('f-pdf');
  pdf.value = '';
  document.getElementById('f-pdf-box').classList.remove('has');
  document.getElementById('f-pdf-t').textContent = 'Subir contrato firmado';
}

/* ---------- Contratos vigentes ---------- */

/** Fecha del contrato ('2025-03-01') -> '01/03/2025'. */
function fechaContrato(f) {
  if (!f) return '—';
  const [a, m, d] = String(f).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Un renglón por local con contrato vigente: los datos del contrato y las
 * acciones. Dar de baja se hace solo desde acá; el Panel general muestra el
 * mismo contrato pero sin acciones que lo modifiquen.
 */
function renderContratos() {
  const box = document.getElementById('contratos-list');
  if (!box) return;

  const vigentes = units.filter((u) => u.st !== 'free');
  document.getElementById('contratos-count').textContent = vigentes.length
    ? `${vigentes.length} vigentes` : '';

  if (!vigentes.length) {
    box.innerHTML = '<div class="empty">Todavía no hay contratos vigentes.</div>';
    return;
  }

  box.innerHTML = vigentes.map((u) => {
    const i = units.indexOf(u);
    const alquiler = u.esDueno ? 'sin alquiler (dueño)' : u.fijo;
    const actualiza = u.esDueno ? '' : ` · ${escaparHTML(u.act)}`;
    return `
      <div class="abm-row">
        <div class="an">${escaparHTML(u.n)}</div>
        <div>
          <div class="aname">${escaparHTML(u.loc)} · ${escaparHTML(u.mod)}</div>
          <div class="acontact">${escaparHTML(u.rubro)} · ${alquiler} · vence el día ${escaparHTML(u.venc)}${actualiza}</div>
          <div class="acontact">Desde ${fechaContrato(u.inicio)} · ${u.plazoMeses || '—'} meses${u.archivoContratoUrl ? '' : ' · sin PDF adjunto'}</div>
        </div>
        <div class="aacts">
          <button class="btn btn-ghost btn-sm" onclick="verContrato(${i})">Ver contrato</button>
          <button class="btn btn-danger btn-sm" onclick="confirmBaja(${i})">Dar de baja</button>
        </div>
      </div>`;
  }).join('');
}

/* ---------- Baja de contrato ---------- */

function confirmBaja(i) {
  const u = units[i];
  openModal(`Dar de baja — Local ${u.n}`,
    `<p style="margin:0 0 12px">Vas a rescindir el contrato de <strong>${escaparHTML(u.loc)}</strong>. El local pasará a estado <strong>libre</strong> y se generará el estado de cuenta final.</p>
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
