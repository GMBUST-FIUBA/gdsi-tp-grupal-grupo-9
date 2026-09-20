'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');

const sequelize = require('./db');
require('./models');
const { seedSiHaceFalta } = require('./seed');
const api = require('./routes/api');
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

/*
 * Galería seleccionada en el panel superior. El navegador la guarda en una
 * cookie, así viaja sola en todos los pedidos (páginas y API) sin tener que
 * agregarla a cada fetch.
 */
app.use((req, res, next) => {
  const m = /(?:^|;\s*)galeriaId=(\d+)/.exec(req.headers.cookie || '');
  req.galeriaId = m ? Number(m[1]) : null;
  next();
});

app.use('/api', api);

app.get('/', async (req, res, next) => {
  try {
    const estado = await estadoCompleto(req.galeriaId);
    const galeria = await galeriaActual(req.galeriaId);
    const tenant = galeria ? await detalleLocatario(galeria.id) : null;
    const galerias = await listadoGalerias();
    res.render('index', {
      estado,
      tenant,
      galerias,
      periodo: PERIODO_ACTUAL,
      periodoLabel: periodoLabel(PERIODO_ACTUAL),
      centsToMoney,
      periodoLabelDe: periodoLabel,
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
