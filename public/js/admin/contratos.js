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
  document.getElementById('f-pct-wrap').hidden = !esPct;
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
  ['f-rubro', 'f-locatario', 'f-email', 'f-tel'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  const pdf = document.getElementById('f-pdf');
  pdf.value = '';
  document.getElementById('f-pdf-box').classList.remove('has');
  document.getElementById('f-pdf-t').textContent = 'Subir contrato firmado';
}
