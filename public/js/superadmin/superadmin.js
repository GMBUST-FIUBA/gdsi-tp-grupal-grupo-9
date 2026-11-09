/* ---------- Superadmin: alta de galerías y administradores ---------- */

async function crearComplejo() {
  const nombre = document.getElementById('sg-nom').value.trim();
  if (!nombre) return mostrarError('sg-err', 'Ingresá el nombre de la galería.');

  const cantidad = Number(document.getElementById('sg-locs').value);
  if (!(cantidad > 0)) return mostrarError('sg-err', 'La galería tiene que tener al menos un local.');

  const r = await apiEnviar('POST', '/api/complejos', {
    nombre,
    direccion: document.getElementById('sg-dir').value,
    dueno: document.getElementById('sg-dueno').value,
    cantidadUnidades: cantidad,
  });
  if (!r.ok) return mostrarError('sg-err', r.msg);

  mostrarError('sg-err', null);
  ['sg-nom', 'sg-dir', 'sg-dueno'].forEach((id) => { document.getElementById(id).value = ''; });
  await refrescarComplejos();
  toast('Galería y locales creados');
}

async function crearAdministrador() {
  const nombre = document.getElementById('sa-nom').value.trim();
  const email = document.getElementById('sa-mail').value.trim();
  if (!nombre || !email) {
    return mostrarError('sa-err', 'Completá el nombre y el email del administrador.');
  }

  const r = await apiEnviar('POST', '/api/administradores', {
    nombre,
    email,
    complejo: document.getElementById('sa-gal').value,
  });
  if (!r.ok) return mostrarError('sa-err', r.msg);

  mostrarError('sa-err', null);
  document.getElementById('sa-nom').value = '';
  document.getElementById('sa-mail').value = '';
  await refrescarComplejos();
  avisoAcceso(r.msg || 'Administrador dado de alta');
}

/** Redibuja la lista de galerías y el select de asignación. */
async function refrescarComplejos() {
  const complejos = await apiLeer('/api/complejos');
  if (!Array.isArray(complejos)) return;

  document.getElementById('sa-list').innerHTML = complejos.map((g) => `
    <div class="sa-item">
      <div class="si">🏬</div>
      <div>
        <div class="sname">${g.nombre}</div>
        <div class="ssub">${g.unidades} locales · Admin: ${g.admins.length ? g.admins.join(', ') : 'sin asignar'} · Dueño: ${g.dueno || '—'}</div>
      </div>
      <span class="st-tag cerrado">${g.activa ? 'Activa' : 'Inactiva'}</span>
    </div>`).join('');

  const sel = document.getElementById('sa-gal');
  const previo = sel.value;
  sel.innerHTML = complejos.map((g) => `<option>${g.nombre}</option>`).join('');
  if (previo) sel.value = previo;

  // El selector del panel superior también tiene que mostrar la galería nueva.
  const brandSel = document.getElementById('galeria-sel');
  if (brandSel) {
    const actual = brandSel.value;
    brandSel.innerHTML = complejos
      .map((g) => `<option value="${g.id}">${g.nombre}</option>`).join('');
    if (actual) brandSel.value = actual;
  }
}
