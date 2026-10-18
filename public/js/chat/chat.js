/* ---------- Chat (compartido por admin y locatario) ---------- */
/*
 * Hay un solo hilo abierto por pantalla (#chat-hilo). Los mensajes nuevos se
 * piden cada POLL_MS con ?desde=<último id>, así que solo viajan los que faltan.
 *
 * Los textos los escribe otro usuario: todo lo que venga del chat pasa por
 * escaparHTML() antes de ir a innerHTML.
 *
 * Estado de los mensajes propios:
 *   enviando -> se dibujó al apretar Enviar, todavía no respondió el server
 *   enviado  -> el server lo guardó (✓)
 *   leido    -> el otro lado abrió el chat después de que llegó (✓✓)
 *   error    -> no se pudo enviar; queda en el hilo con "Reintentar"
 * "enviando" y "error" existen solo en el navegador. "leido" sale de
 * `leidoHasta`: hasta qué id leyó el otro lado.
 */
const POLL_MS = 5000;
let pollChatT = null;
let chatAbierto = null; // { id, ultimoId, miRol, leidoHasta }

/* Mensajes que todavía no guardó el server: clave temporal -> texto. */
const pendientes = new Map();
let proximaClave = 1;

const ESTADOS = {
  enviando: { marca: '◷', texto: 'Enviándose' },
  enviado: { marca: '✓', texto: 'Enviado' },
  leido: { marca: '✓✓', texto: 'Leído' },
};

/** '2026-08-27T14:12:00Z' -> '27/08 14:12' (hora local del navegador). */
function fechaMensaje(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** Marca de estado de un mensaje propio. `clave` solo hace falta para el botón de reintentar. */
function estadoHTML(estado, clave) {
  if (estado === 'error') {
    return `<span class="b-estado error">No se envió · <button type="button" class="b-reintentar" onclick="reintentarMensaje(${clave})">Reintentar</button></span>`;
  }
  const e = ESTADOS[estado];
  return `<span class="b-estado ${estado}" title="${e.texto}" aria-label="${e.texto}">${e.marca}</span>`;
}

function estadoDe(m, miRol) {
  if (m.autorRol !== miRol) return null;
  return chatAbierto && m.id <= chatAbierto.leidoHasta ? 'leido' : 'enviado';
}

function burbujaHTML(m, miRol) {
  const estado = estadoDe(m, miRol);
  return `
    <div class="burbuja${estado ? ' mia' : ''}" data-id="${m.id}">
      <div class="b-autor">${escaparHTML(m.autorNombre)}</div>
      <div class="b-texto">${escaparHTML(m.texto)}</div>
      <div class="b-fecha">${fechaMensaje(m.fecha)}${estado ? ' ' + estadoHTML(estado) : ''}</div>
    </div>`;
}

/** Burbuja de un mensaje propio que todavía no tiene id del server. */
function burbujaPendienteHTML(clave, texto) {
  return `
    <div class="burbuja mia pendiente" data-clave="${clave}">
      <div class="b-autor">Vos</div>
      <div class="b-texto">${escaparHTML(texto)}</div>
      <div class="b-fecha">${estadoHTML('enviando')}</div>
    </div>`;
}

/** Abre un hilo: lo dibuja entero y deja anotado hasta qué mensaje se vio. */
function abrirHilo(chatId, miRol, mensajes, leidoHasta) {
  chatAbierto = { id: chatId, ultimoId: 0, miRol, leidoHasta: leidoHasta || 0 };
  pendientes.clear();
  const box = document.getElementById('chat-hilo');
  box.innerHTML = '<div class="chat-vacio">Todavía no hay mensajes. Escribí el primero.</div>';
  agregarAlHilo(mensajes);
}

/**
 * Agrega los mensajes que todavía no estaban. Filtra por id porque el envío y
 * el polling pueden traer el mismo mensaje. Van antes de los pendientes, que
 * quedan siempre al final mientras viajan.
 */
function agregarAlHilo(mensajes) {
  if (!chatAbierto) return;
  const nuevos = mensajes.filter((m) => m.id > chatAbierto.ultimoId);
  if (!nuevos.length) return;

  const box = document.getElementById('chat-hilo');
  const vacio = box.querySelector('.chat-vacio');
  if (vacio) vacio.remove();
  const html = nuevos.map((m) => burbujaHTML(m, chatAbierto.miRol)).join('');
  const primerPendiente = box.querySelector('.burbuja.pendiente');
  if (primerPendiente) primerPendiente.insertAdjacentHTML('beforebegin', html);
  else box.insertAdjacentHTML('beforeend', html);
  chatAbierto.ultimoId = nuevos[nuevos.length - 1].id;
  box.scrollTop = box.scrollHeight;
}

/** El otro lado leyó hasta `leidoHasta`: pasa a ✓✓ los mensajes propios hasta ahí. */
function actualizarLeidos(leidoHasta) {
  if (!chatAbierto || !(leidoHasta > chatAbierto.leidoHasta)) return;
  chatAbierto.leidoHasta = leidoHasta;
  document.querySelectorAll('#chat-hilo .burbuja.mia[data-id]').forEach((b) => {
    if (Number(b.dataset.id) > leidoHasta) return;
    const marca = b.querySelector('.b-estado');
    if (marca && !marca.classList.contains('leido')) marca.outerHTML = estadoHTML('leido');
  });
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
      if (r.ok && chatAbierto === c) {
        agregarAlHilo(r.mensajes);
        actualizarLeidos(r.leidoHasta);
      }
    }
    if (alTick) alTick();
  }, POLL_MS);
}

function pararPoll() {
  clearInterval(pollChatT);
  pollChatT = null;
}

/** Dibuja el mensaje como "Enviándose" y lo manda sin esperar: se puede seguir escribiendo. */
function enviarMensaje() {
  if (!chatAbierto) return;
  const ta = document.getElementById('chat-texto');
  const texto = ta.value.trim();
  if (!texto) return mostrarError('chat-err', 'Escribí un mensaje antes de enviarlo.');

  const clave = proximaClave++;
  pendientes.set(clave, texto);
  const box = document.getElementById('chat-hilo');
  const vacio = box.querySelector('.chat-vacio');
  if (vacio) vacio.remove();
  box.insertAdjacentHTML('beforeend', burbujaPendienteHTML(clave, texto));
  box.scrollTop = box.scrollHeight;

  mostrarError('chat-err', null);
  ta.value = '';
  ta.focus();
  enviarPendiente(clave);
}

async function enviarPendiente(clave) {
  const c = chatAbierto;
  const texto = pendientes.get(clave);
  if (!c || texto === undefined) return;

  const r = await apiEnviar('POST', `/api/chats/${c.id}/mensajes`, { texto });
  // Si se cambió de chat mientras viajaba, la burbuja ya no está en pantalla.
  if (chatAbierto !== c) return;
  const burbuja = document.querySelector(`#chat-hilo .burbuja.pendiente[data-clave="${clave}"]`);

  if (!r.ok) {
    mostrarError('chat-err', r.msg);
    if (burbuja) {
      burbuja.classList.add('error');
      burbuja.querySelector('.b-estado').outerHTML = estadoHTML('error', clave);
    }
    return;
  }

  pendientes.delete(clave);
  if (burbuja) burbuja.remove();
  // Si el polling ya lo había traído, agregarAlHilo lo descarta por id.
  agregarAlHilo([r.mensaje]);
}

function reintentarMensaje(clave) {
  const burbuja = document.querySelector(`#chat-hilo .burbuja.pendiente[data-clave="${clave}"]`);
  if (!burbuja || !pendientes.has(clave)) return;
  burbuja.classList.remove('error');
  burbuja.querySelector('.b-estado').outerHTML = estadoHTML('enviando');
  mostrarError('chat-err', null);
  enviarPendiente(clave);
}

/** Enter envía; Shift+Enter hace un salto de línea. */
function teclaChat(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    enviarMensaje();
  }
}
