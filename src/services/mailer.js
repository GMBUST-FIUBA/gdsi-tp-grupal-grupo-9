'use strict';
/*
 * Envío de mails por SMTP. La app no trae servidor de correo propio: hay que
 * apuntarla a uno (Gmail con contraseña de aplicación, Brevo, Mailtrap para
 * probar...) con estas variables de entorno:
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Si falta alguna, `estaConfigurado()` da false y la app lo dice en pantalla en
 * vez de fallar: el resto sigue andando igual.
 */
const nodemailer = require('nodemailer');

function config() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    user: SMTP_USER,
    pass: SMTP_PASS,
    // Remitente: el que se configure, o el usuario SMTP.
    from: SMTP_FROM || SMTP_USER,
  };
}

function estaConfigurado() {
  const c = config();
  return !!(c.host && c.user && c.pass && c.from);
}

/** Lo que hay que contarle al usuario cuando no se puede mandar nada. */
const MSG_SIN_CONFIGURAR =
  'No hay servidor de correo configurado. Cargá SMTP_HOST, SMTP_PORT, SMTP_USER, '
  + 'SMTP_PASS y SMTP_FROM en las variables de entorno (ver README) y reiniciá el servicio.';

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
    await obtenerTransporte().sendMail({
      from: config().from,
      to: para,
      subject: asunto,
      text: texto,
      html,
      attachments: adjuntos,
    });
    return { ok: true };
  } catch (e) {
    console.error('No se pudo enviar el mail:', e.message);
    return { ok: false, msg: `No se pudo enviar el mail: ${e.message}` };
  }
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

module.exports = { enviarMail, enviarAcceso, estaConfigurado, MSG_SIN_CONFIGURAR };
