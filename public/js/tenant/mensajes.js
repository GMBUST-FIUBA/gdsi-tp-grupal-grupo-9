/* ---------- Mensajes con la administración (locatario) ---------- */

/** Si ya tiene chat, lo muestra; si no, queda el botón para contactar. */
async function initChatTenant() {
  const r = await apiLeer('/api/chats/mio');
  if (r.ok && r.chat) mostrarChatTenant(r.chat.id, r.mensajes, r.leidoHasta);
}

async function contactarAdministracion() {
  const r = await apiEnviar('POST', '/api/chats/mio');
  if (!r.ok) return mostrarError('tc-err', r.msg);
  mostrarChatTenant(r.chat.id, r.mensajes, r.leidoHasta);
  document.getElementById('chat-texto').focus();
}

function mostrarChatTenant(chatId, mensajes, leidoHasta) {
  document.getElementById('tc-vacio').hidden = true;
  document.getElementById('tc-chat').hidden = false;
  abrirHilo(chatId, 'locatario', mensajes, leidoHasta);
  pollChat();
}
