/* ---------- Mensajes con los locatarios ---------- */
let chatsAdmin = [];

/** Al entrar a la sección: trae la lista y arranca el polling (hilo abierto + lista). */
async function entrarMensajes() {
  await cargarChats();
  pollChat(cargarChats);
}

async function cargarChats() {
  const r = await apiLeer('/api/chats');
  if (!Array.isArray(r)) return;
  chatsAdmin = r;
  renderListaChats();
}

function renderListaChats() {
  const box = document.getElementById('chat-list');
  if (!chatsAdmin.length) {
    box.innerHTML = '<div class="empty">Todavía no hay chats. Creá uno con "Nuevo chat".</div>';
    return;
  }
  box.innerHTML = chatsAdmin.map((c) => {
    const ultimo = c.ultimo
      ? (c.ultimo.autorRol === 'admin' ? 'Vos: ' : '') + escaparHTML(c.ultimo.texto)
      : 'Sin mensajes';
    const activo = chatAbierto && chatAbierto.id === c.id;
    return `
      <button class="chat-item${activo ? ' activo' : ''}" onclick="abrirChat(${c.id})">
        <div class="ci-top"><span class="ci-nombre">${escaparHTML(c.locatario)}</span><span class="ci-fecha">${fechaMensaje(c.fecha)}</span></div>
        <div class="ci-local">${c.local ? 'Local ' + escaparHTML(c.local) : 'Sin contrato vigente'}</div>
        <div class="ci-ultimo">${ultimo}</div>
      </button>`;
  }).join('');
}

async function abrirChat(id) {
  const r = await apiLeer(`/api/chats/${id}/mensajes`);
  if (!r.ok) return toast(r.msg || 'No se pudo abrir el chat');

  const c = chatsAdmin.find((x) => x.id === id);
  document.getElementById('chat-titulo').textContent = c ? c.locatario : 'Conversación';
  document.getElementById('chat-sub').textContent = c && c.local ? 'Local ' + c.local : '';
  abrirHilo(id, 'admin', r.mensajes);
  mostrarError('chat-err', null);
  document.getElementById('chat-form').hidden = false;
  renderListaChats();
  document.getElementById('chat-texto').focus();
}

function nuevoChat() {
  const conContrato = units.filter((u) => u.st !== 'free' && u.locatarioId);
  if (!conContrato.length) return toast('No hay locatarios con contrato vigente');
  openModal('Nuevo chat',
    `<div class="field"><label for="nc-loc">Locatario</label>
       <select id="nc-loc">${conContrato.map((u) =>
         `<option value="${u.locatarioId}">Local ${escaparHTML(u.n)} · ${escaparHTML(u.loc)}</option>`).join('')}
       </select>
       <span class="hint">Si ya tenés un chat con ese locatario, se abre el mismo.</span></div>
     <div class="note late" id="nc-err" hidden></div>`,
    [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
     { label: 'Abrir chat', cls: 'btn-primary', fn: () => crearChat(Number(document.getElementById('nc-loc').value), 'nc-err') }]);
}

async function crearChat(locatarioId, errId) {
  const r = await apiEnviar('POST', '/api/chats', { locatarioId });
  if (!r.ok) return errId ? mostrarError(errId, r.msg) : toast(r.msg);
  closeModal();
  await cargarChats();
  await abrirChat(r.chat.id);
}

/** Atajo desde el ABM de locatarios: va a Mensajes con el chat de ese locatario. */
async function chatConLocatario(locatarioId) {
  setSection('mensajes');
  await crearChat(locatarioId);
}
