'use strict';
const {
  Galeria, Local, Contrato, Locatario, Liquidacion, Comprobante,
  AjusteExpensa, Configuracion, Gasto, Proveedor,
} = require('../models');
const { centsToMoney, PERIODO_ACTUAL, fechaCorta } = require('./formato');

/**
 * TODO: mientras no haya login, toda la app trabaja sobre la primera galería.
 * Cuando exista autenticación, la galería tiene que salir del administrador logueado.
 */
async function galeriaActual() {
  return Galeria.findOne({ order: [['id', 'ASC']] });
}

/** Trae el local con su contrato vigente, locatario, liquidación del período y comprobante. */
async function localesConDatos(galeriaId, periodo = PERIODO_ACTUAL) {
  return Local.findAll({
    where: { galeriaId },
    order: [['numero', 'ASC']],
    include: [
      {
        model: Contrato,
        required: false,
        include: [{ model: Locatario, required: false }],
      },
      {
        model: Liquidacion,
        required: false,
        where: { periodo },
        include: [{ model: Comprobante, required: false }],
      },
      { model: AjusteExpensa, required: false, where: { periodo } },
    ],
  });
}

function contratoVigente(local) {
  return (local.Contratos || []).find((c) => c.estado === 'vigente') || null;
}

/** El contrato más reciente del local (el de id más alto). */
function ultimoContrato(local) {
  const cs = local.Contratos || [];
  if (!cs.length) return null;
  return cs.reduce((masNuevo, c) => (c.id > masNuevo.id ? c : masNuevo), cs[0]);
}

function modalidadLabel(contrato) {
  if (!contrato) return '—';
  return contrato.modalidad === 'fijo_pct'
    ? `Fijo + ${Number(contrato.porcentajeFacturacion)}% fact.`
    : 'Fijo';
}

/**
 * Estado que pinta el plano: ok / warn / late / free.
 *
 * TODO: hoy los días de mora vienen cargados en la liquidación. Lo correcto es
 * calcularlos contra el día de vencimiento + días de gracia de la configuración,
 * y derivar de ahí el interés por mora.
 */
function estadoLocal(local, contrato, liq) {
  if (!contrato) return 'free';
  if (!liq) return 'warn';
  const total = totalLiquidacionCents(liq);
  if (liq.cobradoCents >= total && total > 0) return 'ok';
  if (liq.diasMora > 0) return 'late';
  return 'warn';
}

function totalLiquidacionCents(liq) {
  if (!liq) return 0;
  return liq.alquilerFijoCents + liq.variableCents + liq.expensasCents + liq.interesMoraCents;
}

/**
 * Arma el array `units` con la misma forma que consumía el prototipo, para que
 * el JS del navegador siga funcionando sin reescribirse.
 */
function serializarLocal(local) {
  const contrato = contratoVigente(local);
  const liq = (local.Liquidacions || [])[0] || null;
  const st = estadoLocal(local, contrato, liq);

  if (st === 'free') {
    const previo = ultimoContrato(local);
    return {
      id: local.id,
      n: local.numero,
      st: 'free',
      loc: 'Local libre',
      rubro: '—',
      baja: !!(previo && previo.estado === 'baja'),
      desde: previo && previo.fechaBaja
        ? `Baja: ${fechaCorta(previo.fechaBaja)}`
        : 'Disponible',
    };
  }

  const locatario = contrato.Locatario;
  const comp = liq && liq.Comprobante && liq.Comprobante.estado === 'pendiente'
    ? liq.Comprobante
    : null;
  const totCents = totalLiquidacionCents(liq);

  return {
    id: local.id,
    n: local.numero,
    st,
    loc: locatario ? locatario.nombre : 'Sin locatario',
    rubro: contrato.rubro || '—',
    mod: modalidadLabel(contrato),
    fijo: centsToMoney(contrato.alquilerFijoCents),
    exp: centsToMoney(liq ? liq.expensasCents : 0),
    tot: centsToMoney(totCents),
    expCents: liq ? liq.expensasCents : 0,
    totCents,
    act: contrato.proximaActualizacion || contrato.indice,
    venc: String(contrato.diaVencimiento),
    pago: liq ? (liq.fechaPago || 'Pendiente') : 'Sin liquidación',
    email: locatario ? locatario.email : '',
    tel: locatario ? locatario.telefono : '',
    comp: !!comp,
    compFecha: comp ? comp.fechaSubida : null,
    fact: centsToMoney(totCents),
    cob: centsToMoney(liq ? liq.cobradoCents : 0),
    cobCents: liq ? liq.cobradoCents : 0,
    nuevo: !!contrato.esAlta,
    liquidacionId: liq ? liq.id : null,
    contratoId: contrato.id,
    locatarioId: locatario ? locatario.id : null,
    archivoContratoUrl: contrato.archivoPath ? `/uploads/${contrato.archivoPath}` : null,
  };
}

/** Mapa { '04': {tipo, montoCents, motivo} } que el front usa tal cual. */
function serializarAjustes(locales) {
  const out = {};
  locales.forEach((l) => {
    const a = (l.AjusteExpensas || [])[0];
    if (a) out[l.numero] = { tipo: a.tipo, montoCents: a.montoCents, motivo: a.motivo || '' };
  });
  return out;
}

/** Mapa { '04': 12.5 } con el porcentaje de expensas asignado a cada local. */
function serializarPorcentajes(locales) {
  const out = {};
  locales.forEach((l) => {
    if (l.expensasPct !== null && l.expensasPct !== undefined) {
      out[l.numero] = Number(l.expensasPct);
    }
  });
  return out;
}

function serializarGasto(g) {
  return {
    id: g.id,
    tipo: g.tipo,
    proveedorId: g.proveedorId,
    proveedorNombre: g.Proveedor ? g.Proveedor.nombre : '—',
    facturaTipo: g.facturaTipo,
    facturaNro: g.facturaNro,
    desc: g.descripcion,
    monto: g.montoCents / 100,
    montoCents: g.montoCents,
    archivoNombre: g.archivoNombre,
    archivoUrl: g.archivoPath ? `/uploads/${g.archivoPath}` : null,
    fecha: g.fecha,
  };
}

/** Todo lo que el front necesita para arrancar, en una sola llamada. */
async function estadoCompleto() {
  const galeria = await galeriaActual();
  if (!galeria) {
    return { galeria: null, units: [], ajustes: {}, porcentajes: {}, gastos: [], proveedores: [], config: null };
  }
  const locales = await localesConDatos(galeria.id);
  const gastos = await Gasto.findAll({
    where: { galeriaId: galeria.id },
    include: [Proveedor],
    order: [['id', 'ASC']],
  });
  const proveedores = await Proveedor.findAll({ order: [['nombre', 'ASC']] });
  const config = await Configuracion.findOne({ where: { galeriaId: galeria.id } });

  return {
    galeria: { id: galeria.id, nombre: galeria.nombre, direccion: galeria.direccion, dueno: galeria.dueno },
    units: locales.map(serializarLocal),
    ajustes: serializarAjustes(locales),
    porcentajes: serializarPorcentajes(locales),
    gastos: gastos.map(serializarGasto),
    proveedores: proveedores.map((p) => ({ id: p.id, nombre: p.nombre })),
    config: config ? config.toJSON() : null,
  };
}

/**
 * Datos de la pantalla del locatario: contrato, desglose de la liquidación del
 * mes y últimos pagos.
 *
 * TODO: no hay login todavía, así que el locatario se elige por número de local
 * (el prototipo mostraba siempre el 04). Cuando exista autenticación, tiene que
 * salir de la sesión.
 */
async function detalleLocatario(galeriaId, numero = '04', periodo = PERIODO_ACTUAL) {
  const locales = await localesConDatos(galeriaId, periodo);
  const local = locales.find((l) => l.numero === numero)
    || locales.find((l) => contratoVigente(l));
  if (!local) return null;

  const contrato = contratoVigente(local);
  if (!contrato) return null;
  const liq = (local.Liquidacions || [])[0] || null;
  const ajuste = (local.AjusteExpensas || [])[0] || null;
  const delta = ajuste ? (ajuste.tipo === 'descuento' ? -ajuste.montoCents : ajuste.montoCents) : 0;

  // Historial de pagos del locatario, del más nuevo al más viejo.
  const previas = await Liquidacion.findAll({
    where: { localId: local.id },
    order: [['periodo', 'DESC']],
  });

  return {
    unidad: serializarLocal(local),
    contrato: {
      modalidad: modalidadLabel(contrato),
      inicio: contrato.inicio,
      plazoMeses: contrato.plazoMeses,
      indice: contrato.indice,
      proximaActualizacion: contrato.proximaActualizacion,
      diaVencimiento: contrato.diaVencimiento,
      porcentajeFacturacion: Number(contrato.porcentajeFacturacion),
    },
    liquidacion: liq && {
      id: liq.id,
      alquilerFijoCents: liq.alquilerFijoCents,
      variableCents: liq.variableCents,
      expensasCents: liq.expensasCents + delta,
      interesMoraCents: liq.interesMoraCents,
      diasMora: liq.diasMora,
      facturacionDeclaradaCents: liq.facturacionDeclaradaCents,
      totalCents: totalLiquidacionCents(liq) + delta,
      estado: liq.estado,
      ajuste: ajuste && { tipo: ajuste.tipo, montoCents: ajuste.montoCents, motivo: ajuste.motivo },
    },
    pagos: previas.map((l) => ({
      periodo: l.periodo,
      totalCents: totalLiquidacionCents(l),
      estado: l.estado,
    })),
  };
}

module.exports = {
  galeriaActual, localesConDatos, detalleLocatario, modalidadLabel, contratoVigente, estadoLocal,
  totalLiquidacionCents, serializarLocal, serializarAjustes,
  serializarPorcentajes, serializarGasto, estadoCompleto,
};
