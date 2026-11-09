'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');

const sequelize = require('./db');
require('./models');
const { seedSiHaceFalta } = require('./seed');
const api = require('./routes/api');
const chats = require('./routes/chats');
const auth = require('./auth');
const {
  estadoCompleto, complejoActual, detalleLocatario, locatarioDelUsuario, periodoAbierto,
} = require('./services/complejo');
const { PERIODO_INICIAL, periodoLabel, centsToMoney } = require('./services/formato');

const app = express();

// Lo usan las plantillas de login/acceso para el minimo de caracteres.
app.locals.MIN_PASSWORD = auth.MIN_PASSWORD;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

/*
 * El prototipo original, tal como estaba en GitHub Pages: HTML estático con
 * datos escritos a mano, sin base de datos. Queda congelado como referencia de
 * la maqueta que presentamos, así que no comparte el CSS ni el JS de la app.
 */
app.use('/prototipo', express.static(path.join(__dirname, '..', 'prototipo')));

// Render termina el HTTPS en su proxy; sin esto la cookie de sesión no se marca bien.
app.set('trust proxy', 1);
app.use(auth.sesion);
app.use(auth.cargarUsuario);

/*
 * Galería elegida en el selector del panel superior (solo superadmin). El
 * navegador la guarda en una cookie, así viaja sola en todos los pedidos.
 * Para admin y locatario la galería es la suya y la cookie se ignora.
 */
app.use((req, res, next) => {
  const m = /(?:^|;\s*)complejoId=(\d+)/.exec(req.headers.cookie || '');
  req.complejoCookie = m ? Number(m[1]) : null;
  req.complejoId = auth.complejoDelUsuario(req);
  next();
});

app.use(auth.router);
// Antes que /api: el chat tiene sus propios permisos (el locatario también escribe).
app.use('/api/chats', chats);
app.use('/api', api);

app.get('/', auth.requiereLogin, async (req, res, next) => {
  try {
    const usuario = req.usuario;
    const complejo = await complejoActual(req.complejoId);
    // El mes abierto de la galería: avanza con cada cierre.
    const periodo = complejo ? await periodoAbierto(complejo.id) : PERIODO_INICIAL;
    const comunes = {
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
      periodo,
      periodoLabel: periodoLabel(periodo),
      centsToMoney,
      periodoLabelDe: periodoLabel,
    };

    if (usuario.rol === 'locatario') {
      // El locatario recibe solo lo suyo: nada del resto de los locales.
      const completo = await estadoCompleto(req.complejoId);
      const unidad = usuario.unidadId
        ? completo.units.find((u) => u.id === usuario.unidadId)
        : null;
      // Si el contrato vigente del local es de otro (hubo baja y alta), no ve nada.
      const propio = await locatarioDelUsuario(usuario);
      const tenant = complejo && unidad && propio ? await detalleLocatario(complejo.id, unidad.n) : null;
      return res.render('index', {
        ...comunes,
        estado: { complejo: completo.complejo, periodo: completo.periodo, gastos: completo.gastos, config: completo.config, units: [], proveedores: [], ajustes: {}, porcentajes: {} },
        tenant,
        complejos: [],
      });
    }

    const estado = await estadoCompleto(req.complejoId);
    res.render('index', {
      ...comunes,
      estado,
      tenant: null,
      complejos: usuario.rol === 'superadmin' ? await listadoComplejos() : [],
    });
  } catch (e) {
    next(e);
  }
});

// Render expone el commit deployado en RENDER_GIT_COMMIT: sirve para confirmar
// desde afuera qué versión está corriendo.
app.get('/salud', (req, res) => res.json({
  ok: true,
  commit: (process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7),
}));

/** Listado para el panel de superadmin. */
async function listadoComplejos() {
  const { Complejo, Administrador, Unidad } = require('./models');
  const complejos = await Complejo.findAll({ include: [Administrador], order: [['id', 'ASC']] });
  const out = [];
  for (const g of complejos) {
    out.push({
      id: g.id,
      nombre: g.nombre,
      dueno: g.dueno,
      activa: g.activa,
      unidades: await Unidad.count({ where: { complejoId: g.id } }),
      admins: (g.Administradors || []).map((a) => a.nombre),
    });
  }
  return out;
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ ok: false, msg: 'Error del servidor. Mirá los logs.' });
  }
  res.status(500).send('Error del servidor. Mirá los logs.');
});

const PORT = process.env.PORT || 3000;

(async () => {
  await sequelize.authenticate();
  /*
   * Auto-migración: Sequelize crea y actualiza las tablas solo al arrancar.
   *
   * En SQLite NO usamos `alter`: para alterar una tabla, SQLite la recrea, y al
   * borrar la tabla padre las claves foráneas se llevan puestas las filas hijas
   * (locales, gastos, administradores). O sea, cada reinicio vaciaba la base de
   * desarrollo. En Postgres `alter` emite ALTER TABLE de verdad y no toca los
   * datos, así que ahí sí va.
   *
   * Consecuencia en desarrollo: si cambiás un modelo, borrá `dev.sqlite` (o
   * corré `npm run seed -- --force`) para que se recree con la forma nueva.
   */
  const esSqlite = sequelize.getDialect() === 'sqlite';
  await sequelize.sync({ alter: !esSqlite });
  await seedSiHaceFalta();
  app.listen(PORT, () => console.log(`Galex escuchando en http://localhost:${PORT}`));
})().catch((e) => {
  console.error('No se pudo arrancar:', e);
  process.exit(1);
});
