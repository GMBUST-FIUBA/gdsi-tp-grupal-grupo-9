/* ---------- ABM de locales ---------- */
/*
 * El administrador da de alta locales, les cambia los m² y borra los que están
 * vacíos. Un local ocupado (con contrato vigente) no se puede borrar: primero
 * hay que darle de baja el contrato desde la sección Contratos.
 */

function m2Texto(u) {
  return u.m2 ? `${u.m2} m²` : 'sin m² cargados';
}

async function agregarLocal() {
  const numero = document.getElementById('lo-num').value.trim();
  if (!numero) return mostrarError('lo-err', 'Ingresá el número del local.');

  const r = await apiEnviar('POST', '/api/locales', {
    numero,
    m2: document.getElementById('lo-m2').value,
  });
  if (!r.ok) return mostrarError('lo-err', r.msg);

  mostrarError('lo-err', null);
  document.getElementById('lo-num').value = '';
  document.getElementById('lo-m2').value = '';
  await recargarEstado();
  toast(`Local ${numero} agregado`);
}

function renderLocales() {
  const box = document.getElementById('lo-list');
  if (!box) return;

  document.getElementById('lo-count').textContent = units.length
    ? `${units.length} locales` : '';

  if (!units.length) {
    box.innerHTML = '<div class="empty">La galería todavía no tiene locales.</div>';
    return;
  }

  box.innerHTML = units.map((u) => {
    const ocupado = u.st !== 'free';
    const estado = ocupado
      ? `Ocupado por ${escaparHTML(u.loc)}`
      : 'Libre';
    const dueno = u.duenoId ? nombreDeDueno(u.duenoId) : null;
    return `
      <div class="abm-row">
        <div class="an">${escaparHTML(u.n)}</div>
        <div>
          <div class="aname">Local ${escaparHTML(u.n)} · ${m2Texto(u)}</div>
          <div class="acontact">${estado}${dueno ? ' · Dueño: ' + escaparHTML(dueno) : ' · sin dueño asignado'}</div>
        </div>
        <div class="aacts">
          <button class="btn btn-ghost btn-sm" onclick="editarM2('${escaparHTML(u.n)}')">Cambiar m²</button>
          <button class="btn btn-danger btn-sm" onclick="confirmBorrarLocal('${escaparHTML(u.n)}')"${ocupado ? ' disabled title="Está ocupado: dale de baja el contrato primero"' : ''}>Borrar</button>
        </div>
      </div>`;
  }).join('');
}

function editarM2(n) {
  const u = units.find((x) => x.n === n);
  if (!u) return;
  openModal(`Superficie — Local ${u.n}`,
    `<div class="field">
       <label for="em2">Metros cuadrados</label>
       <div class="suffix-wrap"><input id="em2" type="number" min="0" step="0.01" value="${u.m2 || ''}"><span class="sfx">m²</span></div>
       <span class="hint">Dejalo vacío para quitar el dato.</span>
     </div>
     <div class="note late" id="em2-err" style="margin-top:12px" hidden></div>`,
    [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
     { label: 'Guardar', cls: 'btn-primary', fn: () => guardarM2(n) }]);
}

async function guardarM2(n) {
  const r = await apiEnviar('PUT', `/api/locales/${encodeURIComponent(n)}`, {
    m2: document.getElementById('em2').value,
  });
  if (!r.ok) return mostrarError('em2-err', r.msg);

  closeModal();
  await recargarEstado();
  toast(`Superficie del Local ${n} actualizada`);
}

function confirmBorrarLocal(n) {
  const u = units.find((x) => x.n === n);
  if (!u) return;
  if (u.st !== 'free') {
    return toast(`El Local ${n} está ocupado: dale de baja el contrato primero`);
  }

  // Si tuvo inquilinos antes, con el local se va también su historial.
  const tuvoContratos = !!u.baja || !!u.ultimoContrato;
  const aviso = tuvoContratos
    ? ' Se borran también sus contratos anteriores y sus liquidaciones. Los cierres de mes ya guardados no se tocan.'
    : '';

  openModal('Borrar local',
    `<p style="margin:0">Vas a borrar el <strong>Local ${escaparHTML(n)}</strong> de la galería.${aviso} Esta acción no se puede deshacer.</p>`,
    [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
     { label: 'Confirmar borrado', cls: 'btn-danger', fn: () => borrarLocal(n) }]);
}

async function borrarLocal(n) {
  const r = await apiEnviar('DELETE', `/api/locales/${encodeURIComponent(n)}`);
  closeModal();
  if (!r.ok) return toast(r.msg);
  await recargarEstado();
  toast(`Local ${n} borrado`);
}
