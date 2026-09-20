/* ---------- Locatarios ABM ---------- */
function renderAbm() {
  const box = document.getElementById('abm-list');
  const conContrato = units.filter((u) => u.st !== 'free');
  if (!conContrato.length) {
    box.innerHTML = '<div class="empty">Todavía no hay locatarios con contrato vigente.</div>';
    return;
  }
  box.innerHTML = conContrato.map((u) => `
    <div class="abm-row">
      <div class="an">${u.n}</div>
      <div><div class="aname">${u.loc}</div><div class="acontact">${u.email || 'sin email'} · ${u.tel || 'sin teléfono'}</div></div>
      <div class="aacts">
        <button class="btn btn-ghost btn-sm" onclick="editTenant('${u.n}')">Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="resetPass('${u.n}')">Blanquear clave</button>
      </div>
    </div>`).join('');
}

function editTenant(n) {
  const u = units.find((x) => x.n === n);
  openModal(`Editar locatario — Local ${u.n}`,
    `<div class="field" style="margin-bottom:12px"><label>Nombre</label><input id="et-nom" value="${u.loc}"></div>
     <div class="field" style="margin-bottom:12px"><label>Email</label><input id="et-mail" type="email" value="${u.email || ''}"></div>
     <div class="field"><label>Teléfono</label><input id="et-tel" value="${u.tel || ''}"></div>
     <div class="note late" id="et-err" style="margin-top:12px" hidden></div>`,
    [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
     { label: 'Guardar cambios', cls: 'btn-primary', fn: () => saveTenant(u.locatarioId) }]);
}

async function saveTenant(locatarioId) {
  const r = await apiEnviar('PUT', `/api/locatarios/${locatarioId}`, {
    nombre: document.getElementById('et-nom').value,
    email: document.getElementById('et-mail').value,
    telefono: document.getElementById('et-tel').value,
  });
  if (!r.ok) return mostrarError('et-err', r.msg);
  closeModal();
  await recargarEstado();
  toast('Datos del locatario actualizados');
}

function resetPass(n) {
  const u = units.find((x) => x.n === n);
  openModal('Blanquear clave',
    `<p style="margin:0">Se enviará un mail a <strong>${u.loc}</strong> con un enlace para que defina una nueva contraseña de acceso a su cuenta.</p>`,
    [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
     { label: 'Enviar mail', cls: 'btn-primary', fn: () => doResetPass(u.locatarioId) }]);
}

async function doResetPass(locatarioId) {
  const r = await apiEnviar('POST', `/api/locatarios/${locatarioId}/blanquear-clave`);
  closeModal();
  toast(r.ok ? r.msg : r.msg);
}
