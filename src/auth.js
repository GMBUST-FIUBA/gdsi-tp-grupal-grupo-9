'use strict';
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Usuario } = require('./models');

const PASSWORD_INICIAL = '1234';

function hashear(password) {
  return bcrypt.hashSync(password, 8);
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

module.exports = {
  sesion, cargarUsuario, requiereLogin, galeriaDelUsuario,
  router, hashear, PASSWORD_INICIAL,
};
