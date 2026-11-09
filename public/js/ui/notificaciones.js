/* ---------- Campanita ---------- */
/*
 * Junta en un solo lugar lo que necesita atención: los comprobantes esperando
 * revisión (solo la administración) y los mensajes sin leer (los dos roles).
 *
 * Los mensajes se consultan aparte porque pueden llegar en cualquier momento;
 * los comprobantes salen del estado que ya está en memoria. El contador se
 * refresca cada CADA_MS esté donde esté el usuario, así se entera sin tener que
 * abrir la sección Mensajes. Se frena cuando la pestaña se va a segundo plano.
 */

const NOTIF_CADA_MS = 20000;
let notifT = null;
let mensajesSinLeer = { total: 0, chats: [] };

/** Comprobantes pendientes de revisar. Vacío para el locatario. */
function comprobantesPendientes() {
  return typeof units === 'undefined' ? [] : units.filter((u) => u.comp);
}

async function traerMensajesSinLeer() {
  const r = await apiLeer('/api/chats/no-leidos');
  if (r && r.ok) {
    mensajesSinLeer = { total: r.total || 0, chats: r.chats || [] };
    refreshNotif();
  }
}

/** Arranca el refresco periódico y trae el primer conteo. */
function iniciarNotificaciones() {
  if (!document.getElementById('bell')) return;
  traerMensajesSinLeer();
  if (notifT) clearInterval(notifT);
  notifT = setInterval(() => {
    if (!document.hidden) traerMensajesSinLeer();
  }, NOTIF_CADA_MS);
}

/** Redibuja la campanita con lo que haya en memoria. */
function refreshNotif() {
  const badge = document.getElementById('bell-badge');
  const box = document.getElementById('notif');
  if (!badge || !box) return;

  const comprobantes = comprobantesPendientes();
  const total = comprobantes.length + mensajesSinLeer.total;

  badge.textContent = total;
  badge.style.display = total ? 'grid' : 'none';

  const itemsMensajes = mensajesSinLeer.chats.map((c) => `
    <div class="ni" role="menuitem" tabindex="0" onclick="desdeNotifMensaje(${c.chatId})">
      <div class="ico">💬</div>
      <div>
        <div class="t">${escaparHTML(c.locatario)}${c.noLeidos > 1 ? ` · ${c.noLeidos} mensajes` : ''}</div>
        <div class="s">${escaparHTML(c.ultimo)}</div>
      </div>
    </div>`).join('');

  const itemsComprobantes = comprobantes.map((u) => `
    <div class="ni" role="menuitem" tabindex="0" onclick="desdeNotifComprobante(${units.indexOf(u)})">
      <div class="ico">🧾</div>
      <div>
        <div class="t">${escaparHTML(u.n)} · ${escaparHTML(u.loc)}</div>
        <div class="s">Subió comprobante · ${escaparHTML(u.compFecha || '')}</div>
      </div>
    </div>`).join('');

  box.innerHTML = `<div class="nh">Notificaciones <small>${total} ${total === 1 ? 'nueva' : 'nuevas'}</small></div>`
    + (total ? itemsMensajes + itemsComprobantes : '<div class="empty-n">No hay nada pendiente.</div>');
}

function toggleNotif() {
  const box = document.getElementById('notif');
  box.hidden = !box.hidden;
  // Al abrirla se refresca, para no mostrar algo de hace veinte segundos.
  if (!box.hidden) traerMensajesSinLeer();
}

/** Va al chat que avisó la notificación. */
function desdeNotifMensaje(chatId) {
  document.getElementById('notif').hidden = true;
  if (document.getElementById('view-admin')) {
    setSection('mensajes');
    abrirChat(chatId);
  } else {
    // El locatario tiene un solo chat, al pie de su cuenta.
    if (typeof initChatTenant === 'function') initChatTenant();
    const panel = document.getElementById('tenant-chat');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // Lo que se abre queda leído: el contador se pone al día.
  setTimeout(traerMensajesSinLeer, 1500);
}

/** Va al detalle de la unidad que subió el comprobante. */
function desdeNotifComprobante(i) {
  document.getElementById('notif').hidden = true;
  setSection('panel');
  selectUnit(i);
  document.getElementById('detail-body').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.addEventListener('click', (e) => {
  const bw = document.getElementById('bell-wrap');
  if (bw && !bw.contains(e.target)) {
    const notif = document.getElementById('notif');
    if (notif) notif.hidden = true;
  }
});
