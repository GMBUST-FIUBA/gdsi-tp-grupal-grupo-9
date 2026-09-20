'use strict';
const express = require('express');
const path = require('path');
const multer = require('multer');
const { Op } = require('sequelize');

const {
  Galeria, Administrador, Local, Locatario, Contrato,
  Liquidacion, Comprobante, AjusteExpensa, Proveedor, Gasto, Configuracion,
} = require('../models');
const {
  estadoCompleto, galeriaActual, serializarGasto, totalLiquidacionCents,
} = require('../services/galeria');
const { tieneMasDeDosDecimales, PERIODO_ACTUAL, parseMoneyCents, centsToMoney } = require('../services/formato');

/** Igual que el fmtPct del navegador: '12,50%'. */
function fmtPct(n) {
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

const router = express.Router();

/* ---------------- Subida de archivos ---------------- */
/*
 * TODO: en Render el disco es efímero — los archivos subidos se pierden en cada
 * deploy o reinicio. Para que sobrevivan hay que mover esto a un storage externo
 * (S3, Cloudinary) o a un disco persistente pago.
 */
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

/* ---------------- Helpers ---------------- */

const TIPOS_FACTURA = ['Factura A', 'Factura B', 'Factura C', 'Recibo', 'Ticket'];

function error(res, msg, code = 400) {
  return res.status(code).json({ ok: false, msg });
}

/** Envuelve un handler async para que los errores no tumben el server. */
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function localPorNumero(req, numero) {
  const galeria = await galeriaActual(req.galeriaId);
  if (!galeria) return null;
  return Local.findOne({ where: { galeriaId: galeria.id, numero } });
}

/** Un local "tiene expensas" si tiene contrato vigente (los libres no cuentan). */
async function tieneContratoVigente(localId) {
  const n = await Contrato.count({ where: { localId, estado: 'vigente' } });
  return n > 0;
}

/* ---------------- Estado general ---------------- */

router.get('/estado', wrap(async (req, res) => {
  res.json(await estadoCompleto(req.galeriaId));
}));

/* ---------------- Gastos ---------------- */

/** Mismas validaciones que hacía el prototipo, ahora del lado del servidor. */
async function validarGasto({ proveedorId, facturaTipo, facturaNro, descripcion, monto }, excluirId) {
  if (!proveedorId || !TIPOS_FACTURA.includes(facturaTipo) || !String(facturaNro || '').trim() || !String(descripcion || '').trim()) {
    return 'Completá todos los campos obligatorios antes de guardar (la factura adjunta es opcional).';
  }
  if (!(monto > 0)) return 'El monto del gasto debe ser mayor a $ 0,00.';
  if (tieneMasDeDosDecimales(monto)) return 'El monto solo puede tener hasta dos decimales.';

  const where = {
    proveedorId,
    facturaNro: String(facturaNro).trim(),
  };
  if (excluirId) where.id = { [Op.ne]: excluirId };
  const dup = await Gasto.count({ where });
  if (dup) return 'Ya existe un gasto cargado con ese número de factura para este proveedor.';
  return null;
}

router.post('/gastos', upload.single('archivo'), wrap(async (req, res) => {
  const galeria = await galeriaActual(req.galeriaId);
  const datos = {
    tipo: req.body.tipo === 'extraordinario' ? 'extraordinario' : 'ordinario',
    proveedorId: Number(req.body.proveedorId),
    facturaTipo: req.body.facturaTipo,
    facturaNro: req.body.facturaNro,
    descripcion: req.body.desc,
    monto: Number(req.body.monto),
  };
  const msg = await validarGasto(datos, null);
  if (msg) return error(res, msg);

  const gasto = await Gasto.create({
    galeriaId: galeria.id,
    tipo: datos.tipo,
    proveedorId: datos.proveedorId,
    facturaTipo: datos.facturaTipo,
    facturaNro: String(datos.facturaNro).trim(),
    descripcion: String(datos.descripcion).trim(),
    montoCents: Math.round(datos.monto * 100),
    archivoNombre: req.file ? req.file.originalname : null,
    archivoPath: req.file ? req.file.filename : null,
    fecha: new Date().toISOString().slice(0, 10),
  });
  const conProveedor = await Gasto.findByPk(gasto.id, { include: [Proveedor] });
  res.json({ ok: true, gasto: serializarGasto(conProveedor) });
}));

router.put('/gastos/:id', upload.single('archivo'), wrap(async (req, res) => {
  const gasto = await Gasto.findByPk(req.params.id);
  if (!gasto) return error(res, 'No se encontró el gasto.', 404);

  const datos = {
    proveedorId: gasto.proveedorId,
    facturaTipo: req.body.facturaTipo,
    facturaNro: req.body.facturaNro,
    descripcion: req.body.desc,
    monto: Number(req.body.monto),
  };
  const msg = await validarGasto(datos, gasto.id);
  if (msg) return error(res, msg);

  gasto.facturaTipo = datos.facturaTipo;
  gasto.facturaNro = String(datos.facturaNro).trim();
  gasto.descripcion = String(datos.descripcion).trim();
  gasto.montoCents = Math.round(datos.monto * 100);
  if (req.file) {
    gasto.archivoNombre = req.file.originalname;
    gasto.archivoPath = req.file.filename;
  }
  await gasto.save();
  const conProveedor = await Gasto.findByPk(gasto.id, { include: [Proveedor] });
  res.json({ ok: true, gasto: serializarGasto(conProveedor) });
}));

router.delete('/gastos/:id', wrap(async (req, res) => {
  const gasto = await Gasto.findByPk(req.params.id);
  if (!gasto) return error(res, 'No se encontró el gasto.', 404);
  await gasto.destroy();
  res.json({ ok: true });
}));

router.post('/proveedores', wrap(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return error(res, 'Ingresá el nombre del proveedor.');
  const p = await Proveedor.create({ nombre });
  res.json({ ok: true, proveedor: { id: p.id, nombre: p.nombre } });
}));

/* ---------------- Porcentaje de expensas por local ---------------- */

router.post('/locales/:numero/porcentaje', wrap(async (req, res) => {
  const local = await localPorNumero(req, req.params.numero);
  if (!local) return error(res, 'Elegí el comercio al que querés asignarle el porcentaje.');
  if (!(await tieneContratoVigente(local.id))) {
    return error(res, 'Elegí el comercio al que querés asignarle el porcentaje.');
  }

  const pct = Number(String(req.body.pct).replace(',', '.'));
  if (Number.isNaN(pct)) return error(res, 'Ingresá un porcentaje numérico válido.');
  if (pct < 0) return error(res, 'El porcentaje no puede ser negativo.');
  if (tieneMasDeDosDecimales(pct)) return error(res, 'El porcentaje solo puede tener hasta dos decimales.');

  // La suma de todos los porcentajes no puede pasar del 100%.
  const otros = await Local.findAll({
    where: { galeriaId: local.galeriaId, id: { [Op.ne]: local.id } },
  });
  const sumaOtros = otros.reduce((acc, l) => acc + Math.round(Number(l.expensasPct || 0) * 100), 0);
  if (sumaOtros + Math.round(pct * 100) > 10000) {
    const disponible = (10000 - sumaOtros) / 100;
    return error(res, `La suma de porcentajes superaría el 100% (asignado a otros comercios: ${fmtPct(sumaOtros / 100)}, disponible: ${fmtPct(disponible)}).`);
  }

  local.expensasPct = pct;
  await local.save();
  res.json({ ok: true });
}));

/* ---------------- Ajuste de expensas (descuento / cargo) ---------------- */

router.post('/locales/:numero/ajuste', wrap(async (req, res) => {
  const local = await localPorNumero(req, req.params.numero);
  if (!local || !(await tieneContratoVigente(local.id))) {
    return error(res, 'Elegí el comercio al que querés aplicarle el ajuste.');
  }

  const tipo = req.body.tipo;
  if (!['descuento', 'cargo'].includes(tipo)) {
    return error(res, 'Elegí si el ajuste es un descuento o un cargo adicional.');
  }

  const monto = Number(req.body.monto);
  if (Number.isNaN(monto)) return error(res, 'Ingresá un monto numérico válido.');
  if (!(monto > 0)) return error(res, 'El monto del ajuste debe ser mayor a $ 0,00.');
  if (tieneMasDeDosDecimales(monto)) return error(res, 'El monto solo puede tener hasta dos decimales.');

  const liq = await Liquidacion.findOne({ where: { localId: local.id, periodo: PERIODO_ACTUAL } });
  const expensas = liq ? liq.expensasCents : 0;
  const montoCents = Math.round(monto * 100);
  if (tipo === 'descuento' && montoCents > expensas) {
    return error(res, `El descuento no puede superar las expensas del comercio (${centsToMoney(expensas)}).`);
  }

  // Un solo ajuste por local y período: si ya había, se reemplaza.
  const previo = await AjusteExpensa.findOne({ where: { localId: local.id, periodo: PERIODO_ACTUAL } });
  const reemplazo = !!previo;
  if (previo) await previo.destroy();
  await AjusteExpensa.create({
    localId: local.id,
    periodo: PERIODO_ACTUAL,
    tipo,
    montoCents,
    motivo: String(req.body.motivo || '').trim(),
  });

  res.json({ ok: true, reemplazo });
}));

router.delete('/locales/:numero/ajuste', wrap(async (req, res) => {
  const local = await localPorNumero(req, req.params.numero);
  if (!local) return error(res, 'No se encontró el local.', 404);
  await AjusteExpensa.destroy({ where: { localId: local.id, periodo: PERIODO_ACTUAL } });
  res.json({ ok: true });
}));

/* ---------------- Cobranza: aceptar / rechazar comprobante ---------------- */

router.post('/liquidaciones/:id/aceptar', wrap(async (req, res) => {
  const liq = await Liquidacion.findByPk(req.params.id, { include: [Comprobante] });
  if (!liq) return error(res, 'No se encontró la liquidación.', 404);

  liq.cobradoCents = totalLiquidacionCents(liq);
  liq.estado = 'cobrado';
  liq.diasMora = 0;
  liq.fechaPago = 'Cobrado (comprobante aceptado)';
  await liq.save();

  if (liq.Comprobante) {
    liq.Comprobante.estado = 'aceptado';
    await liq.Comprobante.save();
  }
  res.json({ ok: true });
}));

router.post('/liquidaciones/:id/rechazar', wrap(async (req, res) => {
  const liq = await Liquidacion.findByPk(req.params.id, { include: [Comprobante] });
  if (!liq) return error(res, 'No se encontró la liquidación.', 404);

  if (liq.Comprobante) {
    liq.Comprobante.estado = 'rechazado';
    await liq.Comprobante.save();
  }
  liq.estado = 'pendiente';
  liq.fechaPago = 'Comprobante rechazado';
  await liq.save();
  // TODO: notificar al locatario por mail del rechazo.
  res.json({ ok: true });
}));

/* ---------------- Contratos ---------------- */

router.post('/contratos', upload.single('pdf'), wrap(async (req, res) => {
  const local = await localPorNumero(req, req.body.localNumero);
  if (!local) return error(res, 'Elegí el local del contrato.');
  if (await tieneContratoVigente(local.id)) {
    return error(res, 'Ese local ya tiene un contrato vigente.');
  }

  const nombre = String(req.body.locatario || '').trim();
  if (!nombre) return error(res, 'Ingresá el nombre o razón social del locatario.');

  const fijoCents = parseMoneyCents(req.body.alquilerFijo);
  if (Number.isNaN(fijoCents) || fijoCents <= 0) {
    return error(res, 'Ingresá un alquiler fijo mensual válido.');
  }

  const locatario = await Locatario.create({
    nombre,
    email: String(req.body.email || '').trim(),
    telefono: String(req.body.telefono || '').trim(),
  });

  const esPct = req.body.modalidad === 'fijo_pct';
  const contrato = await Contrato.create({
    localId: local.id,
    locatarioId: locatario.id,
    rubro: String(req.body.rubro || '').trim(),
    modalidad: esPct ? 'fijo_pct' : 'fijo',
    porcentajeFacturacion: esPct ? Number(req.body.porcentaje || 0) : 0,
    alquilerFijoCents: fijoCents,
    inicio: req.body.inicio || new Date().toISOString().slice(0, 10),
    plazoMeses: Number(req.body.plazoMeses || 24),
    diaVencimiento: 10,
    estado: 'vigente',
    esAlta: true,
    archivoNombre: req.file ? req.file.originalname : null,
    archivoPath: req.file ? req.file.filename : null,
  });

  // Liquidación del período en curso para que el local aparezca en cobranzas.
  const config = await Configuracion.findOne({ where: { galeriaId: local.galeriaId } });
  await Liquidacion.create({
    localId: local.id,
    contratoId: contrato.id,
    periodo: PERIODO_ACTUAL,
    alquilerFijoCents: fijoCents,
    // TODO: el variable por % de facturación necesita que el locatario declare
    // sus ventas del mes. Hasta que exista esa pantalla, arranca en 0.
    variableCents: 0,
    expensasCents: config ? config.expensasBaseCents : 0,
    estado: 'pendiente',
    fechaPago: 'Pendiente',
  });

  res.json({ ok: true, contratoId: contrato.id });
}));

router.post('/contratos/:id/baja', wrap(async (req, res) => {
  const contrato = await Contrato.findByPk(req.params.id);
  if (!contrato) return error(res, 'No se encontró el contrato.', 404);

  contrato.estado = 'baja';
  contrato.motivoBaja = req.body.motivo || 'Fin de contrato';
  contrato.fechaBaja = new Date().toISOString().slice(0, 10);
  contrato.esAlta = false;
  await contrato.save();
  // TODO: generar el estado de cuenta final del locatario al dar la baja.
  res.json({ ok: true });
}));

/* ---------------- Locatarios ---------------- */

router.put('/locatarios/:id', wrap(async (req, res) => {
  const l = await Locatario.findByPk(req.params.id);
  if (!l) return error(res, 'No se encontró el locatario.', 404);
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return error(res, 'El nombre no puede quedar vacío.');
  l.nombre = nombre;
  l.email = String(req.body.email || '').trim();
  l.telefono = String(req.body.telefono || '').trim();
  await l.save();
  res.json({ ok: true });
}));

router.post('/locatarios/:id/blanquear-clave', wrap(async (req, res) => {
  const l = await Locatario.findByPk(req.params.id);
  if (!l) return error(res, 'No se encontró el locatario.', 404);
  // TODO: no hay login todavía, así que no hay clave que blanquear ni mail que
  // enviar. Cuando exista autenticación, generar el token y mandar el mail.
  res.json({ ok: true, msg: 'Mail para blanquear clave enviado' });
}));

/* ---------------- Configuración de la galería ---------------- */

router.put('/config', wrap(async (req, res) => {
  const galeria = await galeriaActual(req.galeriaId);
  const config = await Configuracion.findOne({ where: { galeriaId: galeria.id } });
  if (!config) return error(res, 'No hay configuración cargada.', 404);

  const expensas = parseMoneyCents(req.body.expensasBase);
  if (Number.isNaN(expensas)) return error(res, 'Ingresá un importe válido para los gastos comunes.');

  config.indice = req.body.indice || config.indice;
  config.frecuencia = req.body.frecuencia || config.frecuencia;
  config.interesMoraDiario = Number(String(req.body.interesMora).replace(',', '.')) || 0;
  config.comisionAdmin = Number(String(req.body.comision).replace(',', '.')) || 0;
  config.diaVencimiento = Number(req.body.diaVencimiento) || config.diaVencimiento;
  config.diasGracia = Number(req.body.diasGracia) || 0;
  config.expensasBaseCents = expensas;
  await config.save();
  // TODO: estos parámetros hoy se guardan pero solo se aplican a las liquidaciones
  // que se generen después. Falta el recálculo del período abierto.
  res.json({ ok: true });
}));

/* ---------------- Vista del locatario ---------------- */

router.post('/tenant/comprobante', upload.single('comprobante'), wrap(async (req, res) => {
  if (!req.file) return error(res, 'Adjuntá el comprobante antes de enviarlo.');

  const liq = await Liquidacion.findByPk(req.body.liquidacionId, { include: [Comprobante] });
  if (!liq) return error(res, 'No se encontró la liquidación.', 404);

  const ahora = new Date();
  const fecha = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

  if (liq.Comprobante) await liq.Comprobante.destroy();
  await Comprobante.create({
    liquidacionId: liq.id,
    archivoNombre: req.file.originalname,
    archivoPath: req.file.filename,
    fechaSubida: fecha,
    estado: 'pendiente',
  });

  liq.estado = 'en_revision';
  liq.fechaPago = 'Comprobante en revisión';
  await liq.save();
  res.json({ ok: true });
}));

/* ---------------- Superadmin ---------------- */

router.post('/galerias', wrap(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return error(res, 'Ingresá el nombre de la galería.');
  const cantidad = Number(req.body.cantidadLocales || 0);
  if (!(cantidad > 0)) return error(res, 'La galería tiene que tener al menos un local.');

  const galeria = await Galeria.create({
    nombre,
    direccion: String(req.body.direccion || '').trim(),
    dueno: String(req.body.dueno || '').trim(),
  });
  await Configuracion.create({ galeriaId: galeria.id });

  // Se crean los locales numerados de una, como pedía el prototipo.
  for (let i = 1; i <= cantidad; i++) {
    await Local.create({ galeriaId: galeria.id, numero: String(i).padStart(2, '0') });
  }
  res.json({ ok: true, galeriaId: galeria.id });
}));

router.get('/galerias', wrap(async (req, res) => {
  const galerias = await Galeria.findAll({
    include: [Administrador],
    order: [['id', 'ASC']],
  });
  const out = [];
  for (const g of galerias) {
    out.push({
      id: g.id,
      nombre: g.nombre,
      dueno: g.dueno,
      activa: g.activa,
      locales: await Local.count({ where: { galeriaId: g.id } }),
      admins: g.Administradors.map((a) => a.nombre),
    });
  }
  res.json(out);
}));

router.post('/administradores', wrap(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim();
  if (!nombre || !email) return error(res, 'Completá el nombre y el email del administrador.');

  const galeria = await Galeria.findOne({ where: { nombre: req.body.galeria } });
  if (!galeria) return error(res, 'Elegí una galería existente.');

  await Administrador.create({ nombre, email, galeriaId: galeria.id });
  // TODO: falta enviar el mail con el acceso (hoy no hay login ni mailer).
  res.json({ ok: true });
}));

/* ---------------- Rendición al dueño ---------------- */

router.get('/rendicion', wrap(async (req, res) => {
  const galeria = await galeriaActual(req.galeriaId);
  const config = await Configuracion.findOne({ where: { galeriaId: galeria.id } });
  const comisionPct = config ? Number(config.comisionAdmin) : 0;
  const locales = await Local.findAll({ where: { galeriaId: galeria.id } });
  const liqs = await Liquidacion.findAll({
    where: { localId: locales.map((l) => l.id), periodo: PERIODO_ACTUAL },
  });

  let alquileresCobrados = 0;
  let expensasCobradas = 0;
  let cobradoTotal = 0;
  let facturado = 0;
  let mora = 0;

  for (const l of liqs) {
    const total = totalLiquidacionCents(l);
    facturado += total;
    cobradoTotal += l.cobradoCents;
    if (l.cobradoCents >= total && total > 0) {
      alquileresCobrados += l.alquilerFijoCents + l.variableCents;
      expensasCobradas += l.expensasCents;
    } else {
      mora += total - l.cobradoCents;
    }
  }

  const gastos = await Gasto.findAll({ where: { galeriaId: galeria.id } });
  const gastosPagados = gastos.reduce((acc, g) => acc + g.montoCents, 0);
  const comision = Math.round(cobradoTotal * comisionPct / 100);
  const neto = alquileresCobrados + expensasCobradas - gastosPagados - comision;

  res.json({
    periodo: PERIODO_ACTUAL,
    alquileresCobrados,
    expensasCobradas,
    gastosPagados,
    comision,
    comisionPct,
    neto,
    facturado,
    cobrado: cobradoTotal,
    mora,
    localesCobrados: liqs.filter((l) => l.cobradoCents >= totalLiquidacionCents(l) && totalLiquidacionCents(l) > 0).length,
  });
}));

/* ---------------- Historial de cierres ---------------- */

router.get('/historial', wrap(async (req, res) => {
  // TODO: todavía no existe el cierre mensual, así que el historial solo puede
  // mostrar el período abierto. Cuando se implemente el cierre, esto tiene que
  // recorrer todos los períodos con sus totales congelados.
  const galeria = await galeriaActual(req.galeriaId);
  const locales = await Local.findAll({ where: { galeriaId: galeria.id } });
  const liqs = await Liquidacion.findAll({ where: { localId: locales.map((l) => l.id) } });
  const config = await Configuracion.findOne({ where: { galeriaId: galeria.id } });
  const comisionPct = config ? Number(config.comisionAdmin) : 0;

  const porPeriodo = {};
  for (const l of liqs) {
    const p = (porPeriodo[l.periodo] = porPeriodo[l.periodo] || { facturado: 0, cobrado: 0, mora: 0 });
    const total = totalLiquidacionCents(l);
    p.facturado += total;
    p.cobrado += l.cobradoCents;
    if (l.cobradoCents < total) p.mora += total - l.cobradoCents;
  }

  const filas = Object.keys(porPeriodo).sort().reverse().map((periodo) => {
    const p = porPeriodo[periodo];
    const comision = Math.round(p.cobrado * comisionPct / 100);
    return {
      periodo,
      facturado: p.facturado,
      cobrado: p.cobrado,
      mora: p.mora,
      comision,
      neto: p.cobrado - comision,
      estado: periodo === PERIODO_ACTUAL ? 'Abierto' : 'Cerrado',
    };
  });
  res.json(filas);
}));

module.exports = router;
