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

app.use('/api', api);

app.get('/', async (req, res, next) => {
  try {
    const estado = await estadoCompleto();
    const galeria = await galeriaActual();
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

app.get('/salud', (req, res) => res.json({ ok: true }));

/** Listado para el panel de superadmin. */
async function listadoGalerias() {
  const { Galeria, Administrador, Local } = require('./models');
  const galerias = await Galeria.findAll({ include: [Administrador], order: [['id', 'ASC']] });
  const out = [];
  for (const g of galerias) {
    out.push({
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
  // Auto-migración: Sequelize crea y actualiza las tablas solo al arrancar.
  await sequelize.sync({ alter: true });
  await seedSiHaceFalta();
  app.listen(PORT, () => console.log(`Galería Belgrano escuchando en http://localhost:${PORT}`));
})().catch((e) => {
  console.error('No se pudo arrancar:', e);
  process.exit(1);
});
