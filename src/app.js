'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');

const sequelize = require('./db');
require('./models');
const { seedSiHaceFalta } = require('./seed');
const api = require('./routes/api');
const auth = require('./auth');
const { estadoCompleto, galeriaActual, detalleLocatario } = require('./services/galeria');
const { PERIODO_ACTUAL, periodoLabel, centsToMoney } = require('./services/formato');

const app = express();

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
  const m = /(?:^|;\s*)galeriaId=(\d+)/.exec(req.headers.cookie || '');
  req.galeriaCookie = m ? Number(m[1]) : null;
  req.galeriaId = auth.galeriaDelUsuario(req);
  next();
});

app.use(auth.router);
app.use('/api', api);

app.get('/', auth.requiereLogin, async (req, res, next) => {
  try {
    const usuario = req.usuario;
    const galeria = await galeriaActual(req.galeriaId);
    const comunes = {
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
      periodo: PERIODO_ACTUAL,
      periodoLabel: periodoLabel(PERIODO_ACTUAL),
      centsToMoney,
      periodoLabelDe: periodoLabel,
    };

    if (usuario.rol === 'locatario') {
      // El locatario recibe solo lo suyo: nada del resto de los locales.
      const completo = await estadoCompleto(req.galeriaId);
      const local = usuario.localId
        ? completo.units.find((u) => u.id === usuario.localId)
        : null;
      const tenant = galeria && local ? await detalleLocatario(galeria.id, local.n) : null;
      return res.render('index', {
        ...comunes,
        estado: { galeria: completo.galeria, gastos: completo.gastos, config: completo.config, units: [], proveedores: [], ajustes: {}, porcentajes: {} },
        tenant,
        galerias: [],
      });
    }

    const estado = await estadoCompleto(req.galeriaId);
    res.render('index', {
      ...comunes,
      estado,
      tenant: null,
      galerias: usuario.rol === 'superadmin' ? await listadoGalerias() : [],
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
async function listadoGalerias() {
  const { Galeria, Administrador, Local } = require('./models');
  const galerias = await Galeria.findAll({ include: [Administrador], order: [['id', 'ASC']] });
  const out = [];
  for (const g of galerias) {
    out.push({
      id: g.id,
      nombre: g.nombre,
      dueno: g.dueno,
      activa: g.activa,
      locales: await Local.count({ where: { galeriaId: g.id } }),
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
