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

module.exports = { enviarMail, estaConfigurado, MSG_SIN_CONFIGURAR };
