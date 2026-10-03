'use strict';
const express = require('express');
const { Op } = require('sequelize');

const {
  Galeria, Local, Locatario, Contrato, Usuario, Chat, Mensaje,
} = require('../models');
const { galeriaActual, locatarioDelUsuario } = require('../services/galeria');

/*
 * Chat entre la administración de la galería y cada locatario. Va en un router
 * aparte, montado antes que /api, porque tiene sus propias reglas de permisos:
 * acá el locatario sí puede leer y escribir (pero solo en su chat).
 *
 * Los mensajes nuevos se buscan por polling desde el navegador (?desde=<id>).
 * No hay estado de leído: es solo el hilo de mensajes.
 */
const router = express.Router();

const MAX_TEXTO = 2000;

/* ---------------- Helpers ---------------- */

function error(res, msg, code = 400) {
  return res.status(code).json({ ok: false, msg });
}

/** Envuelve un handler async para que los errores no tumben el server. */
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Entero >= 0 o null. Los ids y el `desde` vienen como texto en la URL. */
function entero(v) {
  if (!/^\d+$/.test(String(v))) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

function esAdministracion(usuario) {
  return usuario.rol === 'admin' || usuario.rol === 'superadmin';
}

/**
 * Galería cuyos chats ve la administración. El admin ve solo la suya: si no
 * tiene, no ve nada (galeriaActual() caería en la primera de la base). El
 * superadmin usa la del selector, como en el resto de la app.
 */
async function galeriaDeLaAdministracion(req) {
  if (req.usuario.rol === 'superadmin') return galeriaActual(req.galeriaId);
  if (!req.galeriaId) return null;
  return Galeria.findByPk(req.galeriaId);
}

/** Chat del pedido (:id) si el usuario tiene acceso; si no, responde el error y devuelve null. */
async function chatAccesible(req, res) {
  const id = entero(req.params.id);
  if (!id) {
    error(res, 'El chat pedido no es válido.');
    return null;
  }
  const chat = await Chat.findByPk(id);

  let permitido = false;
  if (chat && esAdministracion(req.usuario)) {
    const galeria = await galeriaDeLaAdministracion(req);
    permitido = !!galeria && chat.galeriaId === galeria.id;
  } else if (chat) {
    const propio = await locatarioDelUsuario(req.usuario);
    permitido = !!propio
      && chat.locatarioId === propio.locatario.id
      && chat.galeriaId === propio.contrato.Local.galeriaId;
  }

  // Mismo error si no existe o es ajeno, para no revelar qué ids existen.
  if (!permitido) {
    error(res, 'No tenés acceso a este chat.', 403);
    return null;
  }
  return chat;
}

function serializarMensaje(m, autor) {
  const quien = autor || m.Usuario;
  return {
    id: m.id,
    texto: m.texto,
    autorRol: m.autorRol,
    autorNombre: quien
      ? (quien.nombre || quien.email)
      : (m.autorRol === 'admin' ? 'Administración' : 'Locatario'),
    fecha: m.createdAt,
  };
}

async function mensajesDe(chatId, desde = 0) {
  const mensajes = await Mensaje.findAll({
    where: { chatId, id: { [Op.gt]: desde } },
    // Solo lo que se muestra: nunca mandar el hash de la contraseña.
    include: [{ model: Usuario, attributes: ['nombre', 'email'] }],
    order: [['id', 'ASC']],
  });
  return mensajes.map((m) => serializarMensaje(m));
}

/*
 * Límite de envío por usuario. Vive en memoria, igual que la sesión: alcanza
 * para una sola instancia y se reinicia con el server.
 */
const LIMITE_MENSAJES = 10;
const VENTANA_MS = 10 * 1000;
const enviosPorUsuario = new Map();

function superaLimite(usuarioId) {
  const ahora = Date.now();
  const recientes = (enviosPorUsuario.get(usuarioId) || []).filter((t) => ahora - t < VENTANA_MS);
  const supera = recientes.length >= LIMITE_MENSAJES;
  if (!supera) recientes.push(ahora);
  enviosPorUsuario.set(usuarioId, recientes);
  return supera;
}

/* ---------------- Permisos ---------------- */

router.use((req, res, next) => {
  if (!req.usuario) return error(res, 'Tenés que iniciar sesión.', 401);
  next();
});

function soloAdministracion(req, res, next) {
  if (!esAdministracion(req.usuario)) return error(res, 'No tenés permiso para hacer esto.', 403);
  next();
}

function soloLocatario(req, res, next) {
  if (req.usuario.rol !== 'locatario') return error(res, 'Esta sección es para locatarios.', 403);
  next();
}

/* ---------------- Administración ---------------- */

/** Chats de la galería, con el último mensaje; los más recientes primero. */
router.get('/', soloAdministracion, wrap(async (req, res) => {
  const galeria = await galeriaDeLaAdministracion(req);
  if (!galeria) return error(res, 'No tenés una galería asignada.', 403);

  const chats = await Chat.findAll({
    where: { galeriaId: galeria.id },
    include: [{
      model: Locatario,
      include: [{ model: Contrato, required: false, where: { estado: 'vigente' }, include: [Local] }],
    }],
  });

  const out = [];
  for (const chat of chats) {
    const ultimo = await Mensaje.findOne({ where: { chatId: chat.id }, order: [['id', 'DESC']] });
    const contrato = chat.Locatario && (chat.Locatario.Contratos || [])[0];
    out.push({
      id: chat.id,
      locatarioId: chat.locatarioId,
      locatario: chat.Locatario ? chat.Locatario.nombre : 'Locatario',
      local: contrato && contrato.Local ? contrato.Local.numero : null,
      ultimo: ultimo && {
        texto: ultimo.texto.slice(0, 120),
        autorRol: ultimo.autorRol,
        fecha: ultimo.createdAt,
      },
      fecha: ultimo ? ultimo.createdAt : chat.createdAt,
    });
  }
  out.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  res.json(out);
}));

/** Abre el chat con un locatario de la galería. Si ya existía, devuelve el mismo. */
router.post('/', soloAdministracion, wrap(async (req, res) => {
  const galeria = await galeriaDeLaAdministracion(req);
  if (!galeria) return error(res, 'No tenés una galería asignada.', 403);

  const locatarioId = entero(req.body.locatarioId);
  if (!locatarioId) return error(res, 'Elegí el locatario con el que querés hablar.');

  const contrato = await Contrato.findOne({
    where: { locatarioId, estado: 'vigente' },
    include: [{ model: Local, where: { galeriaId: galeria.id } }],
  });
  if (!contrato) return error(res, 'Elegí un locatario con contrato vigente en esta galería.');

  const [chat] = await Chat.findOrCreate({ where: { galeriaId: galeria.id, locatarioId } });
  res.json({ ok: true, chat: { id: chat.id } });
}));

/* ---------------- Locatario ---------------- */

/** Su chat con la administración, si ya existe (no lo crea). */
router.get('/mio', soloLocatario, wrap(async (req, res) => {
  const propio = await locatarioDelUsuario(req.usuario);
  if (!propio) return error(res, 'No tenés un contrato vigente.', 403);

  const chat = await Chat.findOne({
    where: { galeriaId: propio.contrato.Local.galeriaId, locatarioId: propio.locatario.id },
  });
  res.json({
    ok: true,
    chat: chat ? { id: chat.id } : null,
    mensajes: chat ? await mensajesDe(chat.id) : [],
  });
}));

/** "Contactar a la administración": crea su chat (o devuelve el que ya tenía). */
router.post('/mio', soloLocatario, wrap(async (req, res) => {
  const propio = await locatarioDelUsuario(req.usuario);
  if (!propio) return error(res, 'No tenés un contrato vigente.', 403);

  const [chat] = await Chat.findOrCreate({
    where: { galeriaId: propio.contrato.Local.galeriaId, locatarioId: propio.locatario.id },
  });
  res.json({ ok: true, chat: { id: chat.id }, mensajes: await mensajesDe(chat.id) });
}));

/* ---------------- Mensajes (los dos lados) ---------------- */

router.get('/:id/mensajes', wrap(async (req, res) => {
  const desde = req.query.desde === undefined ? 0 : entero(req.query.desde);
  if (desde === null) return error(res, 'El parámetro "desde" no es válido.');

  const chat = await chatAccesible(req, res);
  if (!chat) return;
  res.json({ ok: true, mensajes: await mensajesDe(chat.id, desde) });
}));

router.post('/:id/mensajes', wrap(async (req, res) => {
  const chat = await chatAccesible(req, res);
  if (!chat) return;

  const texto = String(req.body.texto || '').trim();
  if (!texto) return error(res, 'Escribí un mensaje antes de enviarlo.');
  if (texto.length > MAX_TEXTO) {
    return error(res, `El mensaje no puede superar los ${MAX_TEXTO} caracteres.`);
  }
  if (superaLimite(req.usuario.id)) {
    return error(res, 'Estás enviando mensajes muy rápido, esperá unos segundos.', 429);
  }

  // El autor sale de la sesión, nunca del body.
  const mensaje = await Mensaje.create({
    chatId: chat.id,
    texto,
    autorId: req.usuario.id,
    autorRol: esAdministracion(req.usuario) ? 'admin' : 'locatario',
  });
  res.json({ ok: true, mensaje: serializarMensaje(mensaje, req.usuario) });
}));

module.exports = router;
