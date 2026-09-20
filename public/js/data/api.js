/* ---------- Cliente de la API ---------- */
/*
 * Todas las llamadas devuelven { ok, ...datos } o { ok:false, msg }.
 * El servidor valida de nuevo todo lo que valida el navegador, así que `msg`
 * trae el mismo texto que antes mostraba el prototipo.
 */

async function apiLeer(url) {
  const r = await fetch(url);
  if (!r.ok) return { ok: false, msg: 'No se pudo leer del servidor.' };
  return r.json();
}

async function apiEnviar(metodo, url, body) {
  const opciones = { method: metodo };
  if (body instanceof FormData) {
    opciones.body = body;
  } else if (body !== undefined) {
    opciones.headers = { 'Content-Type': 'application/json' };
    opciones.body = JSON.stringify(body);
  }
  try {
    const r = await fetch(url, opciones);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, msg: data.msg || 'No se pudo guardar.' };
    return data;
  } catch (e) {
    return { ok: false, msg: 'No se pudo conectar con el servidor.' };
  }
}

/** Muestra el mensaje de error en el cartel del formulario, o lo oculta. */
function mostrarError(id, msg) {
  const box = document.getElementById(id);
  if (!box) return;
  if (msg) {
    box.textContent = msg;
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}
