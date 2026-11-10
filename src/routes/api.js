'use strict';
const express = require('express');
const path = require('path');
const multer = require('multer');
const { Op } = require('sequelize');

const { sequelize } = require('../models');
const {
  Complejo, Administrador, Usuario, Dueno, Unidad, Locatario, Contrato,
  Liquidacion, Comprobante, AjusteExpensa, Proveedor, Gasto, Configuracion, CierreMes,
} = require('../models');
const { generarLinkDeAcceso } = require('../auth');
const {
  estadoCompleto, complejoActual, serializarGasto, locatarioDelUsuario,
  comprobantePendiente, periodoAbierto, cuentaCorriente,
} = require('../services/complejo');
const {
  tieneMasDeDosDecimales, parseMoneyCents, centsToMoney, sumarMeses, mesesDeFrecuencia, periodoCorto,
  periodoLabel,
} = require('../services/formato');
const { totalConAjusteCents, indiceCorto } = require('../services/calculo');
const cierre = require('../services/cierre');
const { pdfCierre, pdfLiquidacion, pdfRendicion, pdfABuffer, cabecerasPdf } = require('../services/documentos');
const {
  enviarMail, enviarAcceso, enviarEnSegundoPlano, estaConfigurado, MSG_SIN_CONFIGURAR,
} = require('../services/mailer');

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

/*
 * Los comprobantes de pago no pasan por el disco: quedan en memoria y se
 * guardan en la base (Comprobante.datos), así sobreviven a los deploys y no
 * quedan expuestos en /uploads.
 */
const MAX_COMPROBANTE = 10 * 1024 * 1024;
const uploadComprobante = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_COMPROBANTE } });

/** Como upload.single(), pero un archivo muy grande vuelve como error legible y no como 500. */
function subirComprobante(campo) {
  const mw = uploadComprobante.single(campo);
  return (req, res, next) => mw(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return error(res, 'El comprobante no puede pesar más de 10 MB.');
    }
    next(err);
  });
}

function esImagenOPdf(mime) {
  return mime === 'application/pdf' || /^image\/[\w.+-]+$/.test(String(mime));
}

/* ---------------- Helpers ---------------- */

const TIPOS_FACTURA = ['Factura A', 'Factura B', 'Factura C', 'Recibo', 'Ticket'];

function error(res, msg, code = 400) {
  return res.status(code).json({ ok: false, msg });
}

/** Envuelve un handler async para que los errores no tumben el server. */
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function unidadPorNumero(req, numero) {
  const complejo = await complejoActual(req.complejoId);
  if (!complejo) return null;
  return Unidad.findOne({ where: { complejoId: complejo.id, numero } });
}

/** Un local "tiene expensas" si tiene contrato vigente (los libres no cuentan). */
async function tieneContratoVigente(unidadId) {
  const n = await Contrato.count({ where: { unidadId, estado: 'vigente' } });
  return n > 0;
}

/* ---------------- Permisos ---------------- */

/*
 * Toda la API pide sesión. El locatario solo puede leer su estado y subir su
 * comprobante; el alta de galerías y administradores es solo del superadmin;
 * todo lo demás es para admin y superadmin.
 */
router.use((req, res, next) => {
  const u = req.usuario;
  if (!u) return error(res, 'Tenés que iniciar sesión.', 401);

  const rutaLocatario =
    (req.method === 'GET' && req.path === '/estado') ||
    (req.method === 'POST' && req.path === '/tenant/comprobante') ||
    // Las rutas de descarga chequean además que el comprobante o la liquidación sean suyos.
    (req.method === 'GET' && /^\/comprobantes\/\d+\/archivo$/.test(req.path)) ||
    (req.method === 'GET' && /^\/liquidaciones\/\d+\/pdf$/.test(req.path));
  if (u.rol === 'locatario' && !rutaLocatario) {
    return error(res, 'No tenés permiso para hacer esto.', 403);
  }

  const rutaSuper = req.method === 'POST' && (req.path === '/complejos' || req.path === '/administradores');
  if (rutaSuper && u.rol !== 'superadmin') {
    return error(res, 'Solo el superadmin puede hacer esto.', 403);
  }
  next();
});

/** Crea el usuario de acceso si el mail no está tomado. Devuelve null si ya existía. */
async function crearUsuarioSiNoExiste(datos) {
  const email = String(datos.email || '').trim().toLowerCase();
  if (!email) return null;
  const existe = await Usuario.findOne({ where: { email } });
  if (existe) return null;
  // Sin contraseña: la define él mismo con el link de acceso que le llega por mail.
  return Usuario.create({ ...datos, email, passwordHash: null });
}

/**
 * Le genera el link de acceso y se lo manda por mail. Devuelve el mensaje que
 * se le muestra al administrador: si no hay SMTP (o el envío falla), le pasa el
 * link para que lo haga llegar a mano.
 */
async function darAcceso(req, usuario, complejo) {
  if (!usuario) return null;
  const link = await generarLinkDeAcceso(usuario, req);
  const envio = await enviarAcceso({ usuario, complejo, link });
  return envio.ok
    ? `Le enviamos el acceso a ${usuario.email}`
    : `No se pudo enviar el mail (${envio.msg}). Pasale este link: ${link}`;
}

/* ---------------- Estado general ---------------- */

router.get('/estado', wrap(async (req, res) => {
  const completo = await estadoCompleto(req.complejoId);
  if (req.usuario.rol === 'locatario') {
    // Al locatario no le mandamos los datos del resto de los locales.
    return res.json({ complejo: completo.complejo, periodo: completo.periodo, gastos: completo.gastos, config: completo.config, units: [], proveedores: [], ajustes: {}, porcentajes: {} });
  }
  res.json(completo);
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
  const complejo = await complejoActual(req.complejoId);
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
    complejoId: complejo.id,
    tipo: datos.tipo,
    proveedorId: datos.proveedorId,
    facturaTipo: datos.facturaTipo,
    facturaNro: String(datos.facturaNro).trim(),
    descripcion: String(datos.descripcion).trim(),
    montoCents: Math.round(datos.monto * 100),
    archivoNombre: req.file ? req.file.originalname : null,
    archivoPath: req.file ? req.file.filename : null,
    fecha: new Date().toISOString().slice(0, 10),
    periodo: await periodoAbierto(complejo.id),
  });
  const conProveedor = await Gasto.findByPk(gasto.id, { include: [Proveedor] });
  res.json({ ok: true, gasto: serializarGasto(conProveedor) });
}));

/** Los gastos de un mes cerrado ya se repartieron en las expensas: no se tocan. */
async function gastoCerrado(gasto) {
  return gasto.periodo !== await periodoAbierto(gasto.complejoId);
}
const MSG_GASTO_CERRADO = 'Ese gasto es de un mes ya liquidado: no se puede modificar.';

router.put('/gastos/:id', upload.single('archivo'), wrap(async (req, res) => {
  const gasto = await Gasto.findByPk(req.params.id);
  if (!gasto) return error(res, 'No se encontró el gasto.', 404);
  if (await gastoCerrado(gasto)) return error(res, MSG_GASTO_CERRADO);

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
  if (await gastoCerrado(gasto)) return error(res, MSG_GASTO_CERRADO);
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

router.post('/unidades/:numero/porcentaje', wrap(async (req, res) => {
  const unidad = await unidadPorNumero(req, req.params.numero);
  if (!unidad) return error(res, 'Elegí el comercio al que querés asignarle el porcentaje.');
  if (!(await tieneContratoVigente(unidad.id))) {
    return error(res, 'Elegí el comercio al que querés asignarle el porcentaje.');
  }

  const pct = Number(String(req.body.pct).replace(',', '.'));
  if (Number.isNaN(pct)) return error(res, 'Ingresá un porcentaje numérico válido.');
  if (pct < 0) return error(res, 'El porcentaje no puede ser negativo.');
  if (tieneMasDeDosDecimales(pct)) return error(res, 'El porcentaje solo puede tener hasta dos decimales.');

  // La suma de todos los porcentajes no puede pasar del 100%.
  const otros = await Unidad.findAll({
    where: { complejoId: unidad.complejoId, id: { [Op.ne]: unidad.id } },
  });
  const sumaOtros = otros.reduce((acc, l) => acc + Math.round(Number(l.expensasPct || 0) * 100), 0);
  if (sumaOtros + Math.round(pct * 100) > 10000) {
    const disponible = (10000 - sumaOtros) / 100;
    return error(res, `La suma de porcentajes superaría el 100% (asignado a otros comercios: ${fmtPct(sumaOtros / 100)}, disponible: ${fmtPct(disponible)}).`);
  }

  unidad.expensasPct = pct;
  await unidad.save();
  res.json({ ok: true });
}));

/* ---------------- Ajuste de expensas (descuento / cargo) ---------------- */

router.post('/unidades/:numero/ajuste', wrap(async (req, res) => {
  const unidad = await unidadPorNumero(req, req.params.numero);
  if (!unidad || !(await tieneContratoVigente(unidad.id))) {
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

  const periodo = await periodoAbierto(unidad.complejoId);
  const liq = await Liquidacion.findOne({ where: { unidadId: unidad.id, periodo } });
  const expensas = liq ? liq.expensasCents : 0;
  const montoCents = Math.round(monto * 100);
  if (tipo === 'descuento' && montoCents > expensas) {
    return error(res, `El descuento no puede superar las expensas del comercio (${centsToMoney(expensas)}).`);
  }

  // Un solo ajuste por local y período: si ya había, se reemplaza.
  const previo = await AjusteExpensa.findOne({ where: { unidadId: unidad.id, periodo } });
  const reemplazo = !!previo;
  if (previo) await previo.destroy();
  await AjusteExpensa.create({
    unidadId: unidad.id,
    periodo,
    tipo,
    montoCents,
    motivo: String(req.body.motivo || '').trim(),
  });

  res.json({ ok: true, reemplazo });
}));

router.delete('/unidades/:numero/ajuste', wrap(async (req, res) => {
  const unidad = await unidadPorNumero(req, req.params.numero);
  if (!unidad) return error(res, 'No se encontró el local.', 404);
  await AjusteExpensa.destroy({ where: { unidadId: unidad.id, periodo: await periodoAbierto(unidad.complejoId) } });
  res.json({ ok: true });
}));

/* ---------------- Cobranza: aceptar / rechazar comprobante ---------------- */

/** Las liquidaciones de un mes cerrado quedan congeladas: su deuda ya pasó al mes siguiente. */
async function liquidacionCerrada(liq) {
  const unidad = await Unidad.findByPk(liq.unidadId);
  return !unidad || liq.periodo !== await periodoAbierto(unidad.complejoId);
}
const MSG_LIQ_CERRADA = 'Ese mes ya está liquidado: lo impago pasó a la liquidación del mes siguiente.';

router.post('/liquidaciones/:id/aceptar', wrap(async (req, res) => {
  const liq = await Liquidacion.findByPk(req.params.id, { include: [Comprobante] });
  if (!liq) return error(res, 'No se encontró la liquidación.', 404);
  if (await liquidacionCerrada(liq)) return error(res, MSG_LIQ_CERRADA);
  const comp = comprobantePendiente(liq);
  const ajuste = await AjusteExpensa.findOne({ where: { unidadId: liq.unidadId, periodo: liq.periodo } });

  liq.cobradoCents = totalConAjusteCents(liq, ajuste);
  liq.estado = 'cobrado';
  liq.diasMora = 0;
  liq.fechaPago = 'Cobrado (comprobante aceptado)';
  await liq.save();

  if (comp) {
    comp.estado = 'aceptado';
    await comp.save();
  }
  res.json({ ok: true });
}));

router.post('/liquidaciones/:id/rechazar', wrap(async (req, res) => {
  const liq = await Liquidacion.findByPk(req.params.id, { include: [Comprobante] });
  if (!liq) return error(res, 'No se encontró la liquidación.', 404);
  if (await liquidacionCerrada(liq)) return error(res, MSG_LIQ_CERRADA);

  const motivo = String(req.body.motivo || '').trim();
  if (!motivo) return error(res, 'Escribí el motivo del rechazo: el locatario lo va a ver.');
  if (motivo.length > 300) return error(res, 'El motivo no puede superar los 300 caracteres.');

  const comp = comprobantePendiente(liq);
  if (comp) {
    comp.estado = 'rechazado';
    comp.motivoRechazo = motivo;
    await comp.save();
  }
  liq.estado = 'pendiente';
  liq.fechaPago = `Comprobante rechazado: ${motivo}`;
  await liq.save();

  /*
   * El aviso por mail va en segundo plano: el rechazo ya quedó guardado y el
   * motivo le aparece en "Mis comprobantes" igual. Si esperáramos al servidor
   * de correo, un SMTP lento o bloqueado colgaría el botón de la pantalla.
   */
  const destinatario = await avisarRechazo(req, liq, motivo);
  res.json({
    ok: true,
    msg: destinatario ? `Comprobante rechazado · le avisamos a ${destinatario}` : 'Comprobante rechazado',
  });
}));

/**
 * Dispara el mail al locatario con el motivo del rechazo y devuelve a qué
 * casilla salió (o null si no hay a quién o no hay SMTP). No espera el envío.
 */
async function avisarRechazo(req, liq, motivo) {
  if (!estaConfigurado()) return null;

  const contrato = await Contrato.findByPk(liq.contratoId, { include: [Locatario, Unidad] });
  const locatario = contrato && contrato.Locatario;
  if (!locatario || !locatario.email) return null;

  const complejo = await complejoActual(req.complejoId);
  enviarEnSegundoPlano({
    para: locatario.email,
    asunto: `Tu comprobante de ${periodoLabel(liq.periodo)} fue rechazado`,
    texto: [
      `Hola ${locatario.nombre},`,
      '',
      `La administración de ${complejo.nombre} rechazó el comprobante que subiste para ${periodoLabel(liq.periodo)}.`,
      '',
      `Motivo: ${motivo}`,
      '',
      'Podés subir uno nuevo desde tu cuenta.',
    ].join('\n'),
  });
  return locatario.email;
}

/* ---------------- Contratos ---------------- */

router.post('/contratos', upload.single('pdf'), wrap(async (req, res) => {
  const unidad = await unidadPorNumero(req, req.body.unidadNumero);
  if (!unidad) return error(res, 'Elegí el local del contrato.');
  if (await tieneContratoVigente(unidad.id)) {
    return error(res, 'Ese local ya tiene un contrato vigente.');
  }

  const nombre = String(req.body.locatario || '').trim();
  if (!nombre) return error(res, 'Ingresá el nombre o razón social del locatario.');

  // El dueño que ocupa su propio local no paga alquiler, así que no se le pide.
  const locatarioEsDueno = req.body.locatarioEsDueno === 'true' || req.body.locatarioEsDueno === true;
  let fijoCents = 0;
  if (!locatarioEsDueno) {
    fijoCents = parseMoneyCents(req.body.alquilerFijo);
    if (Number.isNaN(fijoCents) || fijoCents <= 0) {
      return error(res, 'Ingresá un alquiler fijo mensual válido.');
    }
  }

  const locatario = await Locatario.create({
    nombre,
    email: String(req.body.email || '').trim(),
    telefono: String(req.body.telefono || '').trim(),
  });

  // Con el mail queda creado el acceso del locatario, que define su contraseña
  // la primera vez que entra con el link que le mandamos.
  const usuarioLocatario = await crearUsuarioSiNoExiste({
    email: locatario.email,
    nombre,
    rol: 'locatario',
    complejoId: unidad.complejoId,
    unidadId: unidad.id,
  });

  const esPct = !locatarioEsDueno && req.body.modalidad === 'fijo_pct';
  const config = await Configuracion.findOne({ where: { complejoId: unidad.complejoId } });
  const periodo = await periodoAbierto(unidad.complejoId);
  const inicio = req.body.inicio || new Date().toISOString().slice(0, 10);
  // La primera actualización cae una frecuencia después del mes de inicio.
  const indice = (config && config.indice) || 'ICL (BCRA)';
  const proximaActualizacionPeriodo = sumarMeses(inicio.slice(0, 7), mesesDeFrecuencia(config && config.frecuencia));
  const contrato = await Contrato.create({
    unidadId: unidad.id,
    locatarioId: locatario.id,
    rubro: String(req.body.rubro || '').trim(),
    modalidad: esPct ? 'fijo_pct' : 'fijo',
    porcentajeFacturacion: esPct ? Number(req.body.porcentaje || 0) : 0,
    alquilerFijoCents: fijoCents,
    inicio,
    indice,
    // Un dueño no paga alquiler, así que no hay actualización que agendarle.
    proximaActualizacionPeriodo: locatarioEsDueno ? null : proximaActualizacionPeriodo,
    proximaActualizacion: locatarioEsDueno
      ? null
      : `${indiceCorto(indice)} · ${periodoCorto(proximaActualizacionPeriodo)}`,
    plazoMeses: Number(req.body.plazoMeses || 24),
    diaVencimiento: 10,
    estado: 'vigente',
    esAlta: true,
    locatarioEsDueno,
    archivoNombre: req.file ? req.file.originalname : null,
    archivoPath: req.file ? req.file.filename : null,
  });

  /*
   * Si el locatario es el dueño del local, lo damos de alta como dueño (o lo
   * reusamos si ya está por nombre) y le asignamos este local.
   */
  if (locatarioEsDueno) {
    const [dueno] = await Dueno.findOrCreate({
      where: { complejoId: unidad.complejoId, nombre },
      defaults: { email: locatario.email, telefono: locatario.telefono },
    });
    // Solo si el local estaba libre: si ya tenía dueño, se respeta el existente
    // y queda para que la administración lo corrija desde la sección Dueños.
    if (!unidad.duenoId) await unidad.update({ duenoId: dueno.id });
  }

  // Liquidación del período en curso para que el local aparezca en cobranzas.
  // Lleva solo el alquiler: las expensas se cobran desde el primer cierre, cuando
  // hay gastos del mes para repartir.
  await Liquidacion.create({
    unidadId: unidad.id,
    contratoId: contrato.id,
    periodo,
    alquilerFijoCents: fijoCents,
    // TODO: el variable por % de facturación necesita que el locatario declare
    // sus ventas del mes. Hasta que exista esa pantalla, arranca en 0.
    variableCents: 0,
    expensasCents: 0,
    estado: 'pendiente',
    fechaPago: 'Pendiente',
  });

  const complejo = await Complejo.findByPk(unidad.complejoId);
  const avisoAcceso = await darAcceso(req, usuarioLocatario, complejo);
  res.json({ ok: true, contratoId: contrato.id, msg: avisoAcceso });
}));

/**
 * Renovar: cierra el contrato actual y crea el que lo sucede, con el mismo
 * local y el mismo locatario. El local nunca pasa por "libre" y la cuenta
 * corriente sigue, porque los contratos quedan encadenados
 * (`contratoAnteriorId`).
 *
 * Sirve igual para un contrato vencido: la renovación no mira la fecha de fin.
 */
router.post('/contratos/:id/renovar', upload.single('pdf'), wrap(async (req, res) => {
  const anterior = await Contrato.findByPk(req.params.id, { include: [Unidad] });
  if (!anterior) return error(res, 'No se encontró el contrato.', 404);
  if (anterior.estado !== 'vigente') {
    return error(res, 'Ese contrato ya no está vigente. Registrá uno nuevo desde el formulario de alta.');
  }

  const unidad = anterior.Unidad;
  const complejo = await complejoActual(req.complejoId);
  if (!complejo || unidad.complejoId !== complejo.id) {
    return error(res, 'No se encontró el contrato.', 404);
  }

  // Un dueño que ocupa su local sigue sin pagar alquiler al renovar.
  const esDueno = !!anterior.locatarioEsDueno;
  let fijoCents = 0;
  if (!esDueno) {
    fijoCents = parseMoneyCents(req.body.alquilerFijo);
    if (Number.isNaN(fijoCents) || fijoCents <= 0) {
      return error(res, 'Ingresá el alquiler del contrato renovado.');
    }
  }

  const plazoMeses = Number(req.body.plazoMeses || 0);
  if (!(plazoMeses > 0)) return error(res, 'Ingresá el plazo del contrato renovado.');

  const inicio = req.body.inicio || new Date().toISOString().slice(0, 10);
  const esPct = !esDueno && req.body.modalidad === 'fijo_pct';
  const config = await Configuracion.findOne({ where: { complejoId: unidad.complejoId } });
  const indice = (config && config.indice) || anterior.indice;
  const proxima = sumarMeses(inicio.slice(0, 7), mesesDeFrecuencia(config && config.frecuencia));

  const nuevo = await Contrato.create({
    unidadId: unidad.id,
    locatarioId: anterior.locatarioId,
    rubro: anterior.rubro,
    modalidad: esPct ? 'fijo_pct' : 'fijo',
    porcentajeFacturacion: esPct ? Number(req.body.porcentaje || 0) : 0,
    alquilerFijoCents: fijoCents,
    inicio,
    plazoMeses,
    indice,
    proximaActualizacionPeriodo: esDueno ? null : proxima,
    proximaActualizacion: esDueno ? null : `${indiceCorto(indice)} · ${periodoCorto(proxima)}`,
    diaVencimiento: anterior.diaVencimiento,
    estado: 'vigente',
    esAlta: false,
    locatarioEsDueno: esDueno,
    contratoAnteriorId: anterior.id,
    // Si no suben uno nuevo, se conserva el PDF del anterior como respaldo.
    archivoNombre: req.file ? req.file.originalname : anterior.archivoNombre,
    archivoPath: req.file ? req.file.filename : anterior.archivoPath,
  });

  anterior.estado = 'baja';
  anterior.motivoBaja = 'Renovación';
  anterior.fechaBaja = inicio;
  anterior.esAlta = false;
  await anterior.save();

  res.json({ ok: true, contratoId: nuevo.id });
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

  const email = String(l.email || '').trim().toLowerCase();
  const usuario = email ? await Usuario.findOne({ where: { email } }) : null;
  if (!usuario) {
    return error(res, 'El locatario no tiene usuario de acceso (necesita un email).');
  }

  // La contraseña vieja deja de servir: define una nueva con el link.
  usuario.passwordHash = null;
  await usuario.save();

  const complejo = await complejoActual(req.complejoId);
  res.json({ ok: true, msg: await darAcceso(req, usuario, complejo) });
}));

/* ---------------- Configuración de la galería ---------------- */

router.put('/config', wrap(async (req, res) => {
  const complejo = await complejoActual(req.complejoId);
  const config = await Configuracion.findOne({ where: { complejoId: complejo.id } });
  if (!config) return error(res, 'No hay configuración cargada.', 404);

  const punitorio = Number(String(req.body.interesMora).replace(',', '.'));
  if (Number.isNaN(punitorio) || punitorio < 0) return error(res, 'Ingresá un punitorio válido (0 o más).');
  if (tieneMasDeDosDecimales(punitorio)) return error(res, 'El punitorio solo puede tener hasta dos decimales.');

  config.indice = req.body.indice || config.indice;
  config.frecuencia = req.body.frecuencia || config.frecuencia;
  config.interesMoraDiario = punitorio; // % por mes de atraso (ver el modelo)
  config.comisionAdmin = Number(String(req.body.comision).replace(',', '.')) || 0;
  config.diaVencimiento = Number(req.body.diaVencimiento) || config.diaVencimiento;
  config.diasGracia = Number(req.body.diasGracia) || 0;
  await config.save();
  // Se aplican en el próximo cierre: la liquidación del mes abierto ya está emitida.
  res.json({ ok: true });
}));

/* ---------------- Vista del locatario ---------------- */

router.post('/tenant/comprobante', subirComprobante('comprobante'), wrap(async (req, res) => {
  if (!req.file) return error(res, 'Adjuntá el comprobante antes de enviarlo.');
  if (!esImagenOPdf(req.file.mimetype)) return error(res, 'El comprobante tiene que ser una imagen o un PDF.');

  const liq = await Liquidacion.findByPk(req.body.liquidacionId, { include: [Comprobante] });
  if (!liq) return error(res, 'No se encontró la liquidación.', 404);
  if (req.usuario.rol === 'locatario') {
    // Tiene que ser de su contrato vigente, no solo de su local: después de una
    // baja y un alta, el local es el mismo pero el contrato ya es de otro.
    const propio = await locatarioDelUsuario(req.usuario);
    if (!propio || liq.contratoId !== propio.contrato.id) {
      return error(res, 'Esa liquidación no es de tu local.', 403);
    }
  }
  if (await liquidacionCerrada(liq)) return error(res, MSG_LIQ_CERRADA);
  if (liq.estado === 'cobrado') return error(res, 'Este mes ya está pagado.');
  if (liq.estado === 'en_revision') return error(res, 'Ya hay un comprobante en revisión para este mes.');

  const ahora = new Date();
  const fecha = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

  // Los anteriores (rechazados) quedan: son el historial del locatario.
  await Comprobante.create({
    liquidacionId: liq.id,
    archivoNombre: req.file.originalname,
    datos: req.file.buffer,
    mimeType: req.file.mimetype,
    fechaSubida: fecha,
    estado: 'pendiente',
  });

  liq.estado = 'en_revision';
  liq.fechaPago = 'Comprobante en revisión';
  await liq.save();
  res.json({ ok: true });
}));

/* ---------------- Descarga de comprobantes ---------------- */

/**
 * El archivo de un comprobante. Lo baja el locatario que lo subió (cualquiera
 * de sus contratos) y la administración de esa galería. A cualquier otro se le
 * responde 404, igual que si no existiera, para no confirmar qué ids hay.
 */
router.get('/comprobantes/:id/archivo', wrap(async (req, res) => {
  const noEncontrado = () => error(res, 'No se encontró el comprobante.', 404);
  if (!/^\d+$/.test(req.params.id)) return noEncontrado();

  const comp = await Comprobante.unscoped().findByPk(req.params.id, {
    include: [{ model: Liquidacion, include: [Contrato, Unidad] }],
  });
  const liq = comp && comp.Liquidacion;
  if (!liq) return noEncontrado();

  const u = req.usuario;
  if (u.rol === 'locatario') {
    const propio = await locatarioDelUsuario(u);
    if (!propio || !liq.Contrato || liq.Contrato.locatarioId !== propio.locatario.id) return noEncontrado();
  } else if (u.rol === 'admin') {
    if (!liq.Unidad || liq.Unidad.complejoId !== req.complejoId) return noEncontrado();
  }

  if (!comp.datos) return error(res, 'Este comprobante no tiene archivo.', 404);

  const nombre = comp.archivoNombre || `comprobante-${comp.id}`;
  /*
   * Con ?inline=1 el navegador lo muestra en vez de bajarlo: lo usa el modal
   * donde la administración revisa el comprobante antes de aceptarlo.
   */
  const disposicion = req.query.inline === '1' ? 'inline' : 'attachment';
  res.set({
    'Content-Type': comp.mimeType || 'application/octet-stream',
    'Content-Disposition': `${disposicion}; filename="${nombre.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(comp.datos);
}));

/* ---------------- Superadmin ---------------- */

router.post('/complejos', wrap(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return error(res, 'Ingresá el nombre de la galería.');
  const cantidad = Number(req.body.cantidadUnidades || 0);
  if (!(cantidad > 0)) return error(res, 'La galería tiene que tener al menos un local.');

  const complejo = await Complejo.create({
    nombre,
    direccion: String(req.body.direccion || '').trim(),
    dueno: String(req.body.dueno || '').trim(),
  });
  await Configuracion.create({ complejoId: complejo.id });

  // Se crean los locales numerados de una, como pedía el prototipo.
  for (let i = 1; i <= cantidad; i++) {
    await Unidad.create({ complejoId: complejo.id, numero: String(i).padStart(2, '0') });
  }
  res.json({ ok: true, complejoId: complejo.id });
}));

router.get('/complejos', wrap(async (req, res) => {
  const complejos = await Complejo.findAll({
    include: [Administrador],
    order: [['id', 'ASC']],
  });
  const out = [];
  for (const g of complejos) {
    out.push({
      id: g.id,
      nombre: g.nombre,
      dueno: g.dueno,
      activa: g.activa,
      unidades: await Unidad.count({ where: { complejoId: g.id } }),
      admins: g.Administradors.map((a) => a.nombre),
    });
  }
  res.json(out);
}));

router.post('/administradores', wrap(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim();
  if (!nombre || !email) return error(res, 'Completá el nombre y el email del administrador.');

  const complejo = await Complejo.findOne({ where: { nombre: req.body.complejo } });
  if (!complejo) return error(res, 'Elegí una galería existente.');

  const usuario = await crearUsuarioSiNoExiste({ email, nombre, rol: 'admin', complejoId: complejo.id });
  if (!usuario) return error(res, 'Ya existe un usuario con ese email.');
  await Administrador.create({ nombre, email, complejoId: complejo.id });
  res.json({ ok: true, msg: await darAcceso(req, usuario, complejo) });
}));

/* ---------------- Rendición al dueño ---------------- */

/** Función liq -> total con el ajuste de su mes, con los ajustes traídos de una vez. */
async function totalesConAjuste(liqs) {
  const ajustes = liqs.length
    ? await AjusteExpensa.findAll({ where: { unidadId: [...new Set(liqs.map((l) => l.unidadId))] } })
    : [];
  return (liq) => totalConAjusteCents(liq, ajustes.find((a) => a.unidadId === liq.unidadId && a.periodo === liq.periodo));
}

/* ---------------- ABM de locales ---------------- */

/** Los m2 del local: número positivo con hasta dos decimales, u opcional. */
function parseM2(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { m2: null };
  const n = Number(String(raw).replace(',', '.'));
  if (Number.isNaN(n)) return { msg: 'Ingresá los m² como un número.' };
  if (n <= 0) return { msg: 'Los m² tienen que ser mayores a 0.' };
  if (tieneMasDeDosDecimales(n)) return { msg: 'Los m² solo pueden tener hasta dos decimales.' };
  return { m2: n };
}

router.post('/unidades', wrap(async (req, res) => {
  const complejo = await complejoActual(req.complejoId);
  if (!complejo) return error(res, 'No hay una galería seleccionada.');

  const numero = String(req.body.numero || '').trim();
  if (!numero) return error(res, 'Ingresá el número del local.');
  if (numero.length > 10) return error(res, 'El número del local es demasiado largo.');

  const repetido = await Unidad.count({ where: { complejoId: complejo.id, numero } });
  if (repetido) return error(res, `Ya existe el Local ${numero} en esta galería.`);

  const { m2, msg } = parseM2(req.body.m2);
  if (msg) return error(res, msg);

  const unidad = await Unidad.create({ complejoId: complejo.id, numero, superficieM2: m2 });
  res.json({ ok: true, unidadId: unidad.id });
}));

router.put('/unidades/:numero', wrap(async (req, res) => {
  const unidad = await unidadPorNumero(req, req.params.numero);
  if (!unidad) return error(res, 'No se encontró el local.', 404);

  const { m2, msg } = parseM2(req.body.m2);
  if (msg) return error(res, msg);

  unidad.superficieM2 = m2;
  await unidad.save();
  res.json({ ok: true });
}));

/**
 * Borra un local vacío. "Vacío" = sin contrato vigente; si además tuvo
 * contratos anteriores, se borra su historial junto con él (los cierres ya
 * guardan su propia foto de cada mes, así que no se tocan).
 */
router.delete('/unidades/:numero', wrap(async (req, res) => {
  const unidad = await unidadPorNumero(req, req.params.numero);
  if (!unidad) return error(res, 'No se encontró el local.', 404);

  if (await tieneContratoVigente(unidad.id)) {
    return error(res, `El Local ${unidad.numero} está ocupado. Dale de baja el contrato antes de borrarlo.`);
  }

  await sequelize.transaction(async (t) => {
    const liqs = await Liquidacion.findAll({ where: { unidadId: unidad.id }, transaction: t });
    if (liqs.length) {
      await Comprobante.destroy({ where: { liquidacionId: liqs.map((l) => l.id) }, transaction: t });
      await Liquidacion.destroy({ where: { unidadId: unidad.id }, transaction: t });
    }
    await AjusteExpensa.destroy({ where: { unidadId: unidad.id }, transaction: t });
    await Contrato.destroy({ where: { unidadId: unidad.id }, transaction: t });
    // Los usuarios de inquilinos anteriores dejan de apuntar a un local que ya no existe.
    await Usuario.update({ unidadId: null }, { where: { unidadId: unidad.id }, transaction: t });
    await unidad.destroy({ transaction: t });
  });

  res.json({ ok: true });
}));

/* ---------------- Dueños de los locales ---------------- */

/** Lee y valida el cuerpo del alta/edición de un dueño. */
function datosDeDueno(body) {
  const nombre = String(body.nombre || '').trim();
  if (!nombre) return { msg: 'Ingresá el nombre del dueño.' };
  return {
    datos: {
      nombre,
      email: String(body.email || '').trim(),
      telefono: String(body.telefono || '').trim(),
      contacto: String(body.contacto || '').trim(),
    },
  };
}

/** Dueño de la galería en la que se está trabajando (null si es de otra). */
async function duenoDelComplejo(req, id) {
  const complejo = await complejoActual(req.complejoId);
  if (!complejo) return null;
  return Dueno.findOne({ where: { id, complejoId: complejo.id } });
}

router.get('/duenos', wrap(async (req, res) => {
  const complejo = await complejoActual(req.complejoId);
  if (!complejo) return res.json({ duenos: [], sinDueno: [] });

  const duenos = await Dueno.findAll({
    where: { complejoId: complejo.id },
    include: [{ model: Unidad, required: false }],
    order: [['nombre', 'ASC']],
  });
  const unidades = await Unidad.findAll({
    where: { complejoId: complejo.id },
    order: [['numero', 'ASC']],
  });

  const comoOpcion = (l) => ({ id: l.id, numero: l.numero, duenoId: l.duenoId });
  res.json({
    duenos: duenos.map((d) => ({
      id: d.id,
      nombre: d.nombre,
      email: d.email,
      telefono: d.telefono,
      contacto: d.contacto,
      unidades: (d.Unidades || [])
        .map(comoOpcion)
        .sort((a, b) => a.numero.localeCompare(b.numero)),
    })),
    unidades: unidades.map(comoOpcion),
    sinDueno: unidades.filter((l) => !l.duenoId).map(comoOpcion),
  });
}));

router.post('/duenos', wrap(async (req, res) => {
  const complejo = await complejoActual(req.complejoId);
  if (!complejo) return error(res, 'No hay una galería seleccionada.');

  const { datos, msg } = datosDeDueno(req.body);
  if (msg) return error(res, msg);

  // Se valida antes de crear: si los locales no sirven, no queda un dueño suelto.
  const malos = await unidadesDeOtroDueno(complejo.id, null, req.body.unidades);
  if (malos) return error(res, malos);

  const dueno = await Dueno.create({ ...datos, complejoId: complejo.id });
  await asignarUnidades(complejo.id, dueno.id, req.body.unidades);
  res.json({ ok: true, duenoId: dueno.id });
}));

router.put('/duenos/:id', wrap(async (req, res) => {
  const dueno = await duenoDelComplejo(req, req.params.id);
  if (!dueno) return error(res, 'No se encontró el dueño.', 404);

  const { datos, msg } = datosDeDueno(req.body);
  if (msg) return error(res, msg);

  const malos = await unidadesDeOtroDueno(dueno.complejoId, dueno.id, req.body.unidades);
  if (malos) return error(res, malos);

  await dueno.update(datos);
  await asignarUnidades(dueno.complejoId, dueno.id, req.body.unidades);
  res.json({ ok: true });
}));

router.delete('/duenos/:id', wrap(async (req, res) => {
  const dueno = await duenoDelComplejo(req, req.params.id);
  if (!dueno) return error(res, 'No se encontró el dueño.', 404);
  // Los locales no se borran: quedan sin dueño asignado.
  await Unidad.update({ duenoId: null }, { where: { duenoId: dueno.id } });
  await dueno.destroy();
  res.json({ ok: true });
}));

/** Normaliza el campo `locales` del cuerpo a una lista de ids. */
function idsDeUnidades(ids) {
  return (Array.isArray(ids) ? ids : [ids]).map(Number).filter((n) => !Number.isNaN(n));
}

/**
 * Un local solo se puede asignar si está libre: los que ya tienen dueño hay que
 * liberarlos primero desde la ficha de ese dueño. Devuelve el mensaje de error,
 * o null si todos los pedidos se pueden asignar.
 *
 * `duenoId` es el dueño que se está editando (sus propios locales son válidos);
 * en un alta va null.
 */
async function unidadesDeOtroDueno(complejoId, duenoId, ids) {
  if (ids === undefined) return null;
  const pedidos = idsDeUnidades(ids);
  if (!pedidos.length) return null;

  const unidades = await Unidad.findAll({ where: { complejoId, id: pedidos } });
  if (unidades.length !== pedidos.length) return 'Alguno de los locales elegidos no es de esta galería.';

  const ocupados = unidades.filter((l) => l.duenoId && l.duenoId !== duenoId);
  if (!ocupados.length) return null;

  const duenos = await Dueno.findAll({ where: { id: [...new Set(ocupados.map((l) => l.duenoId))] } });
  const nombreDe = (id) => {
    const d = duenos.find((x) => x.id === id);
    return d ? d.nombre : 'otro dueño';
  };
  const detalle = ocupados
    .map((l) => `Local ${l.numero} (${nombreDe(l.duenoId)})`)
    .join(', ');
  return ocupados.length === 1
    ? `El ${detalle} ya tiene dueño. Quitáselo primero desde su ficha.`
    : `Estos locales ya tienen dueño: ${detalle}. Quitáselos primero desde sus fichas.`;
}

/**
 * Deja al dueño con exactamente los locales de `ids`. Los que tenía y ya no
 * están quedan sin dueño. Se asume que `localesDeOtroDueno` ya validó que
 * ninguno pertenece a otro.
 */
async function asignarUnidades(complejoId, duenoId, ids) {
  if (ids === undefined) return; // no vino el campo: no se toca la asignación
  const pedidos = idsDeUnidades(ids);

  await Unidad.update({ duenoId: null }, { where: { duenoId } });
  if (!pedidos.length) return;
  await Unidad.update({ duenoId }, { where: { complejoId, id: pedidos } });
}

/*
 * Rendición del mes. Sin `duenoId` es la de toda la galería; con uno, solo sus
 * locales, y los gastos se prorratean por la suma de los porcentajes de
 * expensas de esos locales (es la parte que se les cobró a sus inquilinos).
 */
/*
 * Rendición del mes. Sin `duenoId` es la de toda la galería; con uno, solo sus
 * locales, y los gastos se prorratean por la suma de los porcentajes de
 * expensas de esos locales (es la parte que se les cobró a sus inquilinos).
 *
 * Devuelve { msg } si el dueño pedido no existe.
 */
async function calcularRendicion(req, duenoIdRaw) {
  const complejo = await complejoActual(req.complejoId);
  const config = await Configuracion.findOne({ where: { complejoId: complejo.id } });
  const comisionPct = config ? Number(config.comisionAdmin) : 0;
  const periodo = await periodoAbierto(complejo.id);

  const duenoId = duenoIdRaw ? Number(duenoIdRaw) : null;
  const dueno = duenoId ? await duenoDelComplejo(req, duenoId) : null;
  if (duenoId && !dueno) return { msg: 'No se encontró el dueño.' };

  const todos = await Unidad.findAll({ where: { complejoId: complejo.id } });
  const unidades = dueno ? todos.filter((l) => l.duenoId === dueno.id) : todos;

  const liqs = unidades.length
    ? await Liquidacion.findAll({ where: { unidadId: unidades.map((l) => l.id), periodo } })
    : [];
  const totalDe = await totalesConAjuste(liqs);

  let alquileresCobrados = 0;
  let expensasCobradas = 0;
  let cobradoTotal = 0;
  let facturado = 0;
  let mora = 0;

  for (const l of liqs) {
    const total = totalDe(l);
    facturado += total;
    cobradoTotal += l.cobradoCents;
    if (l.cobradoCents >= total && total > 0) {
      alquileresCobrados += l.alquilerFijoCents + l.variableCents;
      expensasCobradas += l.expensasCents;
    } else {
      mora += total - l.cobradoCents;
    }
  }

  const gastos = await Gasto.findAll({ where: { complejoId: complejo.id, periodo } });
  const gastosComplejo = gastos.reduce((acc, g) => acc + g.montoCents, 0);

  // Al dueño le toca la porción de gastos que se le cobró a sus locales.
  const pctDelDueno = unidades.reduce((acc, l) => acc + Math.round(Number(l.expensasPct || 0) * 100), 0);
  const gastosPagados = dueno
    ? Math.round(gastosComplejo * pctDelDueno / 10000)
    : gastosComplejo;

  const comision = Math.round(cobradoTotal * comisionPct / 100);
  const neto = alquileresCobrados + expensasCobradas - gastosPagados - comision;

  return {
    complejo,
    duenoRow: dueno,
    rendicion: {
      periodo,
      dueno: dueno ? { id: dueno.id, nombre: dueno.nombre, email: dueno.email } : null,
      unidades: unidades.length,
      pctGastos: dueno ? pctDelDueno / 100 : 100,
      alquileresCobrados,
      expensasCobradas,
      gastosPagados,
      comision,
      comisionPct,
      neto,
      facturado,
      cobrado: cobradoTotal,
      mora,
      unidadesCobradas: liqs.filter((l) => l.cobradoCents >= totalDe(l) && totalDe(l) > 0).length,
    },
  };
}

router.get('/rendicion', wrap(async (req, res) => {
  const r = await calcularRendicion(req, req.query.duenoId);
  if (r.msg) return error(res, r.msg, 404);
  // `mailConfigurado` deja que el botón de envío avise antes de intentarlo.
  res.json({ ...r.rendicion, mailConfigurado: estaConfigurado() });
}));

router.get('/rendicion/pdf', wrap(async (req, res) => {
  const r = await calcularRendicion(req, req.query.duenoId);
  if (r.msg) return error(res, r.msg, 404);

  const quien = r.rendicion.dueno ? r.rendicion.dueno.nombre : 'galeria';
  cabecerasPdf(res, `rendicion-${quien}-${r.rendicion.periodo}.pdf`);
  pdfRendicion(r.rendicion, r.complejo).pipe(res);
}));

/** Manda la rendición al dueño por mail, con el PDF adjunto. */
router.post('/rendicion/enviar', wrap(async (req, res) => {
  if (!estaConfigurado()) return error(res, MSG_SIN_CONFIGURAR);

  const r = await calcularRendicion(req, req.body.duenoId);
  if (r.msg) return error(res, r.msg, 404);
  if (!r.rendicion.dueno) {
    return error(res, 'Elegí un dueño: la rendición de toda la galería no tiene a quién enviarse.');
  }
  if (!r.rendicion.dueno.email) {
    return error(res, `${r.rendicion.dueno.nombre} no tiene email cargado. Agregalo en sus datos.`);
  }

  const mes = periodoLabel(r.rendicion.periodo);
  const pdf = await pdfABuffer(pdfRendicion(r.rendicion, r.complejo));

  const envio = await enviarMail({
    para: r.rendicion.dueno.email,
    asunto: `Rendición de cuentas ${mes} · ${r.complejo.nombre}`,
    texto: [
      `Hola ${r.rendicion.dueno.nombre},`,
      '',
      `Te adjuntamos la rendición de cuentas de ${mes} por tus locales en ${r.complejo.nombre}.`,
      `Neto a transferir: ${centsToMoney(r.rendicion.neto)}.`,
      '',
      'Saludos,',
      'La administración',
    ].join('\n'),
    adjuntos: [{
      filename: `rendicion-${r.rendicion.periodo}.pdf`,
      content: pdf,
      contentType: 'application/pdf',
    }],
  });
  if (!envio.ok) return error(res, envio.msg);

  res.json({ ok: true, msg: `Rendición enviada a ${r.rendicion.dueno.email}` });
}));

/* ---------------- Historial de cierres ---------------- */

router.get('/historial', wrap(async (req, res) => {
  const complejo = await complejoActual(req.complejoId);
  const periodoActual = await periodoAbierto(complejo.id);
  const unidades = await Unidad.findAll({ where: { complejoId: complejo.id } });
  const liqs = await Liquidacion.findAll({ where: { unidadId: unidades.map((l) => l.id) } });
  const totalDe = await totalesConAjuste(liqs);
  const config = await Configuracion.findOne({ where: { complejoId: complejo.id } });
  const comisionPct = config ? Number(config.comisionAdmin) : 0;

  const porPeriodo = {};
  for (const l of liqs) {
    const p = (porPeriodo[l.periodo] = porPeriodo[l.periodo] || { facturado: 0, cobrado: 0, mora: 0 });
    const total = totalDe(l);
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
      estado: periodo === periodoActual ? 'Abierto' : 'Cerrado',
    };
  });
  res.json(filas);
}));

/* ---------------- Estado de cuenta y cierre del mes ---------------- */

router.get('/cuenta', wrap(async (req, res) => {
  const complejo = await complejoActual(req.complejoId);
  if (!complejo) return error(res, 'No hay galería elegida.', 404);
  res.json({ ok: true, ...(await cierre.resumenPeriodo(complejo.id)) });
}));

router.put('/cuenta/saldo-inicial', wrap(async (req, res) => {
  const complejo = await complejoActual(req.complejoId);
  const cents = parseMoneyCents(req.body.saldo);
  if (Number.isNaN(cents)) return error(res, 'Ingresá un saldo inicial válido.');
  const r = await cierre.fijarSaldoInicial(complejo.id, cents);
  if (!r.ok) return error(res, r.msg);
  res.json({ ok: true });
}));

/** Lo que se emitiría si se confirma ahora. No guarda nada. */
router.post('/cierres/preview', wrap(async (req, res) => {
  const complejo = await complejoActual(req.complejoId);
  const p = await cierre.previewCierre(complejo.id, req.body.aumentos);
  if (!p.ok) return error(res, p.msg);
  res.json(cierre.previewPublica(p));
}));

router.post('/cierres', wrap(async (req, res) => {
  const complejo = await complejoActual(req.complejoId);
  const r = await cierre.cerrarMes(complejo.id, req.body.aumentos, req.body.periodo);
  if (!r.ok) return error(res, r.msg);
  res.json(r);
}));

router.get('/cierres/:id/pdf', wrap(async (req, res) => {
  const complejo = await complejoActual(req.complejoId);
  const c = /^\d+$/.test(req.params.id)
    ? await CierreMes.findOne({ where: { id: req.params.id, complejoId: complejo.id } })
    : null;
  if (!c) return error(res, 'No se encontró el cierre.', 404);
  cabecerasPdf(res, `liquidacion-expensas-${c.periodo}.pdf`);
  pdfCierre(c, complejo).pipe(res);
}));

/** Cuenta corriente del contrato vigente del local. */
router.get('/unidades/:numero/cuenta-corriente', wrap(async (req, res) => {
  const unidad = await unidadPorNumero(req, req.params.numero);
  if (!unidad) return error(res, 'No se encontró el local.', 404);
  const contrato = await Contrato.findOne({ where: { unidadId: unidad.id, estado: 'vigente' } });
  if (!contrato) return res.json({ ok: true, filas: [] });

  // Con los renovados hay que sumar los contratos anteriores de la cadena.
  const deLaUnidad = await Contrato.findAll({ where: { unidadId: unidad.id } });
  const porId = new Map(deLaUnidad.map((c) => [c.id, c]));
  const ids = [];
  let actual = contrato;
  while (actual && !ids.includes(actual.id)) {
    ids.push(actual.id);
    actual = actual.contratoAnteriorId ? porId.get(actual.contratoAnteriorId) : null;
  }

  const filas = await cuentaCorriente({ contratoId: ids }, await periodoAbierto(unidad.complejoId));
  res.json({ ok: true, filas });
}));

/**
 * PDF con el detalle de una liquidación. Lo baja el locatario de ese contrato y
 * la administración de la galería; a cualquier otro, 404.
 */
router.get('/liquidaciones/:id/pdf', wrap(async (req, res) => {
  const noEncontrada = () => error(res, 'No se encontró la liquidación.', 404);
  if (!/^\d+$/.test(req.params.id)) return noEncontrada();

  const liq = await Liquidacion.findByPk(req.params.id, {
    include: [{ model: Contrato, include: [Locatario] }, Unidad],
  });
  if (!liq || !liq.Unidad) return noEncontrada();

  const u = req.usuario;
  if (u.rol === 'locatario') {
    const propio = await locatarioDelUsuario(u);
    if (!propio || !liq.Contrato || liq.Contrato.locatarioId !== propio.locatario.id) return noEncontrada();
  } else if (u.rol === 'admin') {
    if (liq.Unidad.complejoId !== req.complejoId) return noEncontrada();
  }

  const complejo = await Complejo.findByPk(liq.Unidad.complejoId);
  const config = await Configuracion.findOne({ where: { complejoId: complejo.id } });
  const ajuste = await AjusteExpensa.findOne({ where: { unidadId: liq.unidadId, periodo: liq.periodo } });
  cabecerasPdf(res, `liquidacion-local-${liq.Unidad.numero}-${liq.periodo}.pdf`);
  pdfLiquidacion({
    liq, ajuste, unidad: liq.Unidad, locatario: liq.Contrato && liq.Contrato.Locatario,
    contrato: liq.Contrato, complejo, config,
  }).pipe(res);
}));

module.exports = router;
