'use strict';
/*
 * Envío de mails. Hay dos caminos y se elige solo según lo que esté cargado:
 *
 *  1. API HTTP de Brevo (BREVO_API_KEY + MAIL_FROM). Es el que hay que usar en
 *     Render: los planes free bloquean la salida por los puertos de SMTP
 *     (25, 465, 587), así que por SMTP los mails nunca salen.
 *  2. SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM), cómodo para
 *     desarrollo local (Gmail con contraseña de aplicación, Mailtrap...).
 *
 * Si no hay ninguno, `estaConfigurado()` da false y la app lo dice en pantalla
 * en vez de fallar: el resto sigue andando igual.
 */
const nodemailer = require('nodemailer');

function config() {
  const {
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
    BREVO_API_KEY, MAIL_FROM,
  } = process.env;
  return {
    brevoKey: BREVO_API_KEY,
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    user: SMTP_USER,
    pass: SMTP_PASS,
    // Remitente: el que se configure, o el usuario SMTP.
    from: MAIL_FROM || SMTP_FROM || SMTP_USER,
  };
}

/**
 * Separa el remitente en nombre y dirección. Acepta las tres formas que se
 * suelen escribir a mano, porque si la dirección sale mal el proveedor rechaza
 * el envío entero:
 *
 *   'Galex <a@b.com>'  -> { nombre: 'Galex', email: 'a@b.com' }
 *   'Galex a@b.com'    -> { nombre: 'Galex', email: 'a@b.com' }
 *   'a@b.com'          -> { nombre: 'Galex', email: 'a@b.com' }
 */
function partirRemitente(from) {
  const texto = String(from || '').trim();

  const conChevrones = /^(.*?)\s*<([^>]+)>$/.exec(texto);
  if (conChevrones) {
    return { nombre: conChevrones[1].trim() || 'Galex', email: conChevrones[2].trim() };
  }

  // Sin chevrones: la dirección es la última palabra con arroba, el resto es el nombre.
  const palabras = texto.split(/\s+/);
  const i = palabras.findLastIndex((p) => p.includes('@'));
  if (i === -1) return { nombre: 'Galex', email: texto };
  return {
    nombre: palabras.slice(0, i).join(' ').trim() || 'Galex',
    email: palabras[i],
  };
}

/** Qué camino se va a usar: 'brevo', 'smtp' o null. */
function metodo() {
  const c = config();
  if (c.brevoKey && c.from) return 'brevo';
  if (c.host && c.user && c.pass && c.from) return 'smtp';
  return null;
}

function estaConfigurado() {
  return metodo() !== null;
}

/** Lo que hay que contarle al usuario cuando no se puede mandar nada. */
const MSG_SIN_CONFIGURAR =
  'No hay servidor de correo configurado. Cargá BREVO_API_KEY y MAIL_FROM (recomendado '
  + 'en Render) o las variables SMTP_* para desarrollo local (ver README), y reiniciá el servicio.';

let transporte = null;

function obtenerTransporte() {
  if (transporte) return transporte;
  const c = config();
  transporte = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    // 465 es SSL directo; el resto (587, 2525) arranca en claro y hace STARTTLS.
    secure: c.port === 465,
    auth: { user: c.user, pass: c.pass },
    /*
     * Sin estos timeouts, si el puerto SMTP está bloqueado (Render bloquea la
     * salida por 25/465/587 en los planes free) la conexión queda esperando
     * hasta que corta el sistema operativo, y el pedido HTTP se cuelga.
     */
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return transporte;
}

/**
 * Manda un mail. Devuelve { ok: true } o { ok: false, msg } — nunca tira, para
 * que un problema de correo no voltee el pedido que lo disparó.
 *
 * `adjuntos`: [{ filename, content (Buffer), contentType }]
 */
async function enviarMail({ para, asunto, texto, html, adjuntos = [] }) {
  if (!estaConfigurado()) return { ok: false, msg: MSG_SIN_CONFIGURAR };
  if (!para) return { ok: false, msg: 'El destinatario no tiene email cargado.' };

  try {
    // Red de seguridad por si algún timeout del transporte no llegara a saltar.
    const envio = metodo() === 'brevo'
      ? porBrevo({ para, asunto, texto, html, adjuntos })
      : obtenerTransporte().sendMail({
        from: config().from,
        to: para,
        subject: asunto,
        text: texto,
        html,
        attachments: adjuntos,
      });
    await conTope(envio, TOPE_MS);
    return { ok: true };
  } catch (e) {
    console.error('No se pudo enviar el mail:', e.message);
    return { ok: false, msg: `No se pudo enviar el mail: ${e.message}` };
  }
}

/**
 * Envío por la API HTTP de Brevo. Sale por el puerto 443, que no está
 * bloqueado en ningún lado, y por eso es el camino para Render.
 */
async function porBrevo({ para, asunto, texto, html, adjuntos }) {
  const c = config();
  const cuerpo = {
    sender: partirRemitente(c.from),
    to: [{ email: para }],
    subject: asunto,
    textContent: texto,
  };
  if (html) cuerpo.htmlContent = html;
  if (adjuntos.length) {
    cuerpo.attachment = adjuntos.map((a) => ({
      name: a.filename,
      content: Buffer.from(a.content).toString('base64'),
    }));
  }

  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': c.brevoKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(TOPE_MS),
  });

  if (!r.ok) {
    // Brevo contesta { code, message } cuando rechaza.
    const detalle = await r.json().catch(() => ({}));
    throw new Error(detalle.message || `Brevo respondió ${r.status}`);
  }
}

const TOPE_MS = 25000;

/** Rechaza si la promesa no termina a tiempo, para no colgar el pedido HTTP. */
function conTope(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeout(
      () => rechazar(new Error('el servidor de correo no respondió a tiempo')), ms,
    ).unref()),
  ]);
}

/**
 * Manda el mail sin hacer esperar a quien lo pidió. Se usa para los avisos que
 * son un efecto secundario (el rechazo de un comprobante, por ejemplo): la
 * acción ya quedó guardada y el mail no debe demorar la respuesta.
 */
function enviarEnSegundoPlano(datos) {
  enviarMail(datos).then((r) => {
    if (!r.ok) console.error('Aviso por mail no enviado:', r.msg);
  });
}

/**
 * Mail de bienvenida: le avisa al usuario que tiene acceso y le pasa el link
 * donde define su contraseña la primera vez.
 */
async function enviarAcceso({ usuario, galeria, link }) {
  const nombreGaleria = galeria ? galeria.nombre : 'la galería';
  const esLocatario = usuario.rol === 'locatario';

  const presentacion = esLocatario
    ? `El administrador de ${nombreGaleria} te da acceso para que puedas ver la información de tu local.`
    : `Te dieron acceso para administrar ${nombreGaleria} en Galex.`;

  const texto = [
    `Hola${usuario.nombre ? ' ' + usuario.nombre : ''},`,
    '',
    presentacion,
    '',
    `Entrá acá y definí tu contraseña: ${link}`,
    `Tu usuario es tu email: ${usuario.email}`,
    '',
    'Si no esperabas este mail, ignoralo.',
  ].join('\n');

  const html = `
    <p>Hola${usuario.nombre ? ' ' + escaparHTML(usuario.nombre) : ''},</p>
    <p>${escaparHTML(presentacion)}</p>
    <p><a href="${link}">Definí tu contraseña y entrá</a></p>
    <p>Tu usuario es tu email: <strong>${escaparHTML(usuario.email)}</strong></p>
    <p style="color:#666;font-size:12px">Si no esperabas este mail, ignoralo.</p>`;

  return enviarMail({
    para: usuario.email,
    asunto: `Tu acceso a Galex · ${nombreGaleria}`,
    texto,
    html,
  });
}

/** El nombre lo escribe el administrador: no puede inyectar HTML en el mail. */
function escaparHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = {
  enviarMail, enviarAcceso, enviarEnSegundoPlano, estaConfigurado, MSG_SIN_CONFIGURAR,
};
