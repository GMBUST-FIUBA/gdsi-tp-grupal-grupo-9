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
  // El aviso del acceso del locatario puede traer el link si no salió el mail.
  if (r.msg) avisoAcceso(r.msg);
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

  const porVencer = vigentes.filter((u) => u.vencido || (u.diasParaVencer !== null && u.diasParaVencer <= DIAS_AVISO_VENCIMIENTO));
  const aviso = porVencer.length
    ? `<div class="note" style="margin-bottom:12px">${porVencer.length === 1 ? 'Hay 1 contrato' : `Hay ${porVencer.length} contratos`} vencido(s) o por vencer: ${porVencer.map((u) => 'Local ' + escaparHTML(u.n)).join(', ')}.</div>`
    : '';

  box.innerHTML = aviso + vigentes.map((u) => {
    const i = units.indexOf(u);
    const alquiler = u.esDueno ? 'sin alquiler (dueño)' : u.fijo;
    const actualiza = u.esDueno ? '' : ` · ${escaparHTML(u.act)}`;
    return `
      <div class="abm-row">
        <div class="an">${escaparHTML(u.n)}</div>
        <div>
          <div class="aname">${escaparHTML(u.loc)} · ${escaparHTML(u.mod)} ${tagVigencia(u)}</div>
          <div class="acontact">${escaparHTML(u.rubro)} · ${alquiler} · vence el día ${escaparHTML(u.venc)}${actualiza}</div>
          <div class="acontact">Desde ${fechaContrato(u.inicio)} · ${u.plazoMeses || '—'} meses · ${textoVigencia(u)}${u.archivoContratoUrl ? '' : ' · sin PDF adjunto'}</div>
        </div>
        <div class="aacts">
          <button class="btn btn-ghost btn-sm" onclick="verContrato(${i})">Ver contrato</button>
          <button class="btn btn-primary btn-sm" onclick="abrirRenovar(${i})">Renovar</button>
          <button class="btn btn-danger btn-sm" onclick="confirmBaja(${i})">Dar de baja</button>
        </div>
      </div>`;
  }).join('');
}

/* A partir de acá se avisa que el contrato está por vencer. */
const DIAS_AVISO_VENCIMIENTO = 60;

function tagVigencia(u) {
  if (u.vencido) return '<span class="st-tag mora">Vencido</span>';
  if (u.diasParaVencer !== null && u.diasParaVencer <= DIAS_AVISO_VENCIMIENTO) {
    return '<span class="st-tag pend">Por vencer</span>';
  }
  return '';
}

function textoVigencia(u) {
  if (!u.fin) return 'sin plazo cargado';
  if (u.vencido) return `venció el ${fechaContrato(u.fin)}`;
  return `hasta el ${fechaContrato(u.fin)}`;
}

/* ---------- Renovación ---------- */

/*
 * Renovar cierra el contrato actual y abre el que lo sucede, con el mismo local
 * y locatario. Sirve también para uno ya vencido.
 */
function abrirRenovar(i) {
  const u = units[i];
  const desde = u.fin ? diaSiguiente(u.fin) : new Date().toISOString().slice(0, 10);
  const alquilerActual = u.esDueno ? '' : u.fijo;

  openModal(`Renovar contrato — Local ${u.n}`,
    `<p style="margin:0 0 12px">Se cierra el contrato actual de <strong>${escaparHTML(u.loc)}</strong> y se registra el que lo sucede. El local no queda libre y la cuenta corriente sigue.</p>
     <div class="form-grid">
       <div class="field"><label for="rn-desde">Inicio</label>
         <input id="rn-desde" type="date" value="${desde}"></div>
       <div class="field"><label for="rn-meses">Plazo (meses)</label>
         <input id="rn-meses" type="number" min="1" value="${u.plazoMeses || 24}"></div>
       ${u.esDueno ? '' : `
       <div class="field"><label for="rn-fijo">Alquiler fijo mensual</label>
         <input id="rn-fijo" value="${escaparHTML(alquilerActual)}">
         <span class="hint">Hoy paga ${escaparHTML(alquilerActual)}.</span></div>
       <div class="field"><label for="rn-modo">Modalidad</label>
         <select id="rn-modo" onchange="syncModalidadRenovar()">
           <option value="fijo">Fijo</option>
           <option value="fijo_pct">Fijo + % de facturación</option>
         </select></div>
       <div class="field" id="rn-pct-wrap" hidden><label for="rn-pct">% de facturación</label>
         <div class="suffix-wrap"><input id="rn-pct" type="number" min="0" step="0.01" value="4"><span class="sfx">%</span></div></div>`}
       <div class="field full"><label>Contrato firmado (PDF)</label>
         <label class="filebox" for="rn-pdf" id="rn-pdf-box">
           <div class="fi-ico">📄</div><div class="fi-t" id="rn-pdf-t">Subir el contrato renovado</div><div class="fi-s">Opcional · si no, queda el anterior</div>
         </label>
         <input type="file" id="rn-pdf" accept="application/pdf" onchange="fileChosen(this,'rn-pdf-box','rn-pdf-t','Contrato cargado')">
       </div>
     </div>
     ${u.esDueno ? '<div class="note" style="margin-top:12px">Es el dueño del local: sigue sin pagar alquiler.</div>' : ''}
     <div class="note late" id="rn-err" style="margin-top:12px" hidden></div>`,
    [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
     { label: 'Renovar', cls: 'btn-primary', fn: () => renovarContrato(i) }]);

  if (!u.esDueno) document.getElementById('rn-modo').value = u.mod.startsWith('Fijo +') ? 'fijo_pct' : 'fijo';
  syncModalidadRenovar();
}

/** '2027-02-28' -> '2027-03-01': el contrato nuevo arranca al día siguiente. */
function diaSiguiente(fecha) {
  const d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function syncModalidadRenovar() {
  const sel = document.getElementById('rn-modo');
  if (!sel) return;
  document.getElementById('rn-pct-wrap').hidden = sel.value !== 'fijo_pct';
}

async function renovarContrato(i) {
  const u = units[i];
  const fd = new FormData();
  fd.append('inicio', document.getElementById('rn-desde').value);
  fd.append('plazoMeses', document.getElementById('rn-meses').value);
  if (!u.esDueno) {
    fd.append('alquilerFijo', document.getElementById('rn-fijo').value);
    fd.append('modalidad', document.getElementById('rn-modo').value);
    fd.append('porcentaje', document.getElementById('rn-pct').value);
  }
  const pdf = document.getElementById('rn-pdf');
  if (pdf.files.length) fd.append('pdf', pdf.files[0]);

  const r = await apiEnviar('POST', `/api/contratos/${u.contratoId}/renovar`, fd);
  if (!r.ok) return mostrarError('rn-err', r.msg);

  closeModal();
  await recargarEstado();
  toast(`Contrato del Local ${u.n} renovado`);
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
