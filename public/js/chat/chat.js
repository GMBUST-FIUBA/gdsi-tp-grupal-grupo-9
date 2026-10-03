/* ---------- Chat (compartido por admin y locatario) ---------- */
/*
 * Hay un solo hilo abierto por pantalla (#chat-hilo). Los mensajes nuevos se
 * piden cada POLL_MS con ?desde=<último id>, así que solo viajan los que faltan.
 *
 * Los textos los escribe otro usuario: todo lo que venga del chat pasa por
 * escaparHTML() antes de ir a innerHTML.
 */
const POLL_MS = 5000;
let pollChatT = null;
let chatAbierto = null; // { id, ultimoId, miRol }

/** '2026-08-27T14:12:00Z' -> '27/08 14:12' (hora local del navegador). */
function fechaMensaje(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

function burbujaHTML(m, miRol) {
  const mia = m.autorRol === miRol;
  return `
    <div class="burbuja${mia ? ' mia' : ''}">
      <div class="b-autor">${escaparHTML(m.autorNombre)}</div>
      <div class="b-texto">${escaparHTML(m.texto)}</div>
      <div class="b-fecha">${fechaMensaje(m.fecha)}</div>
    </div>`;
}

/** Abre un hilo: lo dibuja entero y deja anotado hasta qué mensaje se vio. */
function abrirHilo(chatId, miRol, mensajes) {
  chatAbierto = { id: chatId, ultimoId: 0, miRol };
  const box = document.getElementById('chat-hilo');
  box.innerHTML = '<div class="chat-vacio">Todavía no hay mensajes. Escribí el primero.</div>';
  agregarAlHilo(mensajes);
}

/**
 * Agrega al final los mensajes que todavía no estaban. Filtra por id porque el
 * envío y el polling pueden traer el mismo mensaje.
 */
function agregarAlHilo(mensajes) {
  if (!chatAbierto) return;
  const nuevos = mensajes.filter((m) => m.id > chatAbierto.ultimoId);
  if (!nuevos.length) return;

  const box = document.getElementById('chat-hilo');
  const vacio = box.querySelector('.chat-vacio');
  if (vacio) vacio.remove();
  box.insertAdjacentHTML('beforeend', nuevos.map((m) => burbujaHTML(m, chatAbierto.miRol)).join(''));
  chatAbierto.ultimoId = nuevos[nuevos.length - 1].id;
  box.scrollTop = box.scrollHeight;
}

/**
 * Arranca el polling. `alTick` (opcional) corre en cada vuelta, por ejemplo
 * para refrescar la lista de chats del admin. Si la pestaña no está visible, no
 * pide nada.
 */
function pollChat(alTick) {
  pararPoll();
  pollChatT = setInterval(async () => {
    if (document.hidden) return;
    const c = chatAbierto;
    if (c) {
      const r = await apiLeer(`/api/chats/${c.id}/mensajes?desde=${c.ultimoId}`);
      // Si mientras tanto se abrió otro chat, la respuesta ya no sirve.
      if (r.ok && chatAbierto === c) agregarAlHilo(r.mensajes);
    }
    if (alTick) alTick();
  }, POLL_MS);
}

function pararPoll() {
  clearInterval(pollChatT);
  pollChatT = null;
}

async function enviarMensaje() {
  const c = chatAbierto;
  if (!c) return;
  const ta = document.getElementById('chat-texto');
  const texto = ta.value.trim();
  if (!texto) return mostrarError('chat-err', 'Escribí un mensaje antes de enviarlo.');

  const boton = document.getElementById('chat-enviar');
  boton.disabled = true;
  const r = await apiEnviar('POST', `/api/chats/${c.id}/mensajes`, { texto });
  boton.disabled = false;
  if (!r.ok) return mostrarError('chat-err', r.msg);

  mostrarError('chat-err', null);
  ta.value = '';
  ta.focus();
  if (chatAbierto === c) agregarAlHilo([r.mensaje]);
}

/** Enter envía; Shift+Enter hace un salto de línea. */
function teclaChat(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    enviarMensaje();
  }
}
