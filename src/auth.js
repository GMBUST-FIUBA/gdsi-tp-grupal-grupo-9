'use strict';
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Usuario, Galeria } = require('./models');

const PASSWORD_INICIAL = '1234';
const MIN_PASSWORD = 6;
const DIAS_DE_TOKEN = 30;

function hashear(password) {
  return bcrypt.hashSync(password, 8);
}

/* ---------------- Link de acceso ---------------- */

/*
 * Cuando se da de alta un usuario no se le inventa una contraseña: se le manda
 * un link con un token de un solo uso y él la define la primera vez que entra.
 */
function nuevoToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** Le deja al usuario un token nuevo y devuelve el link completo. */
async function generarLinkDeAcceso(usuario, req) {
  usuario.tokenAcceso = nuevoToken();
  usuario.tokenExpira = new Date(Date.now() + DIAS_DE_TOKEN * 24 * 60 * 60 * 1000);
  await usuario.save();
  return `${baseUrl(req)}/acceso/${usuario.tokenAcceso}`;
}

/**
 * Base para armar links absolutos. APP_URL manda; si no está, se deduce del
 * pedido (en Render hace falta `trust proxy` para que el protocolo sea https).
 */
function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

/** Usuario con ese token, si existe y no venció. */
async function usuarioPorToken(token) {
  if (!token) return null;
  const usuario = await Usuario.findOne({ where: { tokenAcceso: String(token) } });
  if (!usuario) return null;
  if (usuario.tokenExpira && usuario.tokenExpira.getTime() < Date.now()) return null;
  return usuario;
}

/* ---------------- Sesión ---------------- */

/*
 * Sesión en memoria: se pierde al reiniciar el server y no se comparte entre
 * instancias. Para un TP con una sola instancia en Render alcanza; si molesta,
 * el reemplazo es connect-pg-simple sobre la misma base.
 */
const sesion = session({
  secret: process.env.SESSION_SECRET || 'galex-tp-gdsi',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' },
});

/** Carga el usuario de la sesión en req.usuario (o null). */
async function cargarUsuario(req, res, next) {
  req.usuario = null;
  if (req.session && req.session.usuarioId) {
    req.usuario = await Usuario.findByPk(req.session.usuarioId);
    if (!req.usuario) req.session.usuarioId = null;
  }
  next();
}

/** Para páginas: sin sesión manda al login. */
function requiereLogin(req, res, next) {
  if (!req.usuario) return res.redirect('/login');
  next();
}

/**
 * Galería sobre la que trabaja el usuario:
 *  - superadmin: la del selector (cookie galeriaId), puede cambiarla.
 *  - admin y locatario: la suya, siempre.
 */
function galeriaDelUsuario(req) {
  if (!req.usuario) return null;
  if (req.usuario.rol === 'superadmin') return req.galeriaCookie;
  return req.usuario.galeriaId;
}

/* ---------------- Rutas: /login y /logout ---------------- */

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.usuario) return res.redirect('/');
  res.render('login', { error: null, email: '' });
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const usuario = await Usuario.findOne({ where: { email } });

    // Todavía no definió su contraseña: tiene que entrar por el link del mail.
    if (usuario && !usuario.passwordHash) {
      return res.status(401).render('login', {
        error: 'Todavía no definiste tu contraseña. Entrá con el link que te llegó por mail; si no lo tenés, pedile a la administración que te lo reenvíe.',
        email,
      });
    }
    if (!usuario || !bcrypt.compareSync(password, usuario.passwordHash)) {
      return res.status(401).render('login', { error: 'Email o contraseña incorrectos.', email });
    }

    req.session.usuarioId = usuario.id;
    res.redirect('/');
  } catch (e) {
    next(e);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

/* ---------------- Primer ingreso: definir la contraseña ---------------- */

router.get('/acceso/:token', async (req, res, next) => {
  try {
    const usuario = await usuarioPorToken(req.params.token);
    if (!usuario) return res.status(404).render('acceso', { usuario: null, galeria: null, token: null, error: null });

    const galeria = usuario.galeriaId ? await Galeria.findByPk(usuario.galeriaId) : null;
    res.render('acceso', { usuario, galeria, token: req.params.token, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/acceso/:token', async (req, res, next) => {
  try {
    const usuario = await usuarioPorToken(req.params.token);
    if (!usuario) return res.status(404).render('acceso', { usuario: null, galeria: null, token: null, error: null });

    const galeria = usuario.galeriaId ? await Galeria.findByPk(usuario.galeriaId) : null;
    const fallar = (error) => res.status(400).render('acceso', { usuario, galeria, token: req.params.token, error });

    const password = String(req.body.password || '');
    if (password.length < MIN_PASSWORD) {
      return fallar(`La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`);
    }
    if (password !== String(req.body.password2 || '')) {
      return fallar('Las dos contraseñas no coinciden.');
    }

    // El token es de un solo uso: se quema al definir la contraseña.
    usuario.passwordHash = hashear(password);
    usuario.tokenAcceso = null;
    usuario.tokenExpira = null;
    await usuario.save();

    req.session.usuarioId = usuario.id;
    res.redirect('/');
  } catch (e) {
    next(e);
  }
});

module.exports = {
  sesion, cargarUsuario, requiereLogin, galeriaDelUsuario,
  router, hashear, PASSWORD_INICIAL,
  generarLinkDeAcceso, baseUrl, MIN_PASSWORD,
};
