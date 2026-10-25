'use strict';
const {
  Galeria, Local, Contrato, Locatario, Liquidacion, Comprobante,
  AjusteExpensa, Configuracion, Gasto, Proveedor,
} = require('../models');
const {
  centsToMoney, PERIODO_INICIAL, fechaCorta, fechaHora,
} = require('./formato');
const { deltaAjuste, totalConAjusteCents } = require('./calculo');

/**
 * La galería sobre la que se está trabajando. Viene del selector del panel
 * superior, que guarda el id en una cookie; si no hay ninguna elegida (o la
 * elegida ya no existe) se cae a la primera.
 *
 * TODO: cuando haya login, el administrador solo debería poder elegir entre las
 * galerías que tiene asignadas, no entre todas.
 */
async function galeriaActual(galeriaId) {
  if (galeriaId) {
    const elegida = await Galeria.findByPk(galeriaId);
    if (elegida) return elegida;
  }
  return Galeria.findOne({ order: [['id', 'ASC']] });
}

/** El mes abierto de la galería (el que se está liquidando). */
async function periodoAbierto(galeriaId) {
  const config = await Configuracion.findOne({ where: { galeriaId } });
  return (config && config.periodoActual) || PERIODO_INICIAL;
}

/** Trae el local con su contrato vigente, locatario, liquidación del período y comprobante. */
async function localesConDatos(galeriaId, periodo) {
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

/**
 * Lo que el formulario de nuevo contrato puede copiar de un contrato anterior.
 * Solo van las claves con un dato real: lo que falta no se completa con nada.
 */
function datosParaReplicar(contrato) {
  if (!contrato) return null;
  const texto = (v) => {
    const t = String(v || '').trim();
    return t && t !== '—' ? t : null;
  };
  const out = {};
  const loc = contrato.Locatario;

  if (texto(contrato.rubro)) out.rubro = texto(contrato.rubro);
  if (loc && texto(loc.nombre)) out.locatario = texto(loc.nombre);
  if (loc && texto(loc.email)) out.email = texto(loc.email);
  if (loc && texto(loc.telefono)) out.telefono = texto(loc.telefono);
  if (contrato.plazoMeses > 0) out.plazoMeses = contrato.plazoMeses;
  if (contrato.alquilerFijoCents > 0) out.alquilerFijo = centsToMoney(contrato.alquilerFijoCents);
  out.locatarioEsDueno = !!contrato.locatarioEsDueno;
  if (contrato.modalidad) out.modalidad = contrato.modalidad;
  if (contrato.modalidad === 'fijo_pct' && Number(contrato.porcentajeFacturacion) > 0) {
    out.porcentaje = Number(contrato.porcentajeFacturacion);
  }
  return out;
}

function modalidadLabel(contrato) {
  if (!contrato) return '—';
  if (contrato.locatarioEsDueno) return 'Dueño · sin alquiler';
  return contrato.modalidad === 'fijo_pct'
    ? `Fijo + ${Number(contrato.porcentajeFacturacion)}% fact.`
    : 'Fijo';
}

/**
 * Estado que pinta el plano: ok / warn / late / free.
 *
 * En mora = arrastra meses impagos (lo que deja el cierre en `saldoAnteriorCents`).
 * Los días de mora solo vienen escritos a mano en los datos de ejemplo.
 */
function estadoLocal(local, contrato, liq) {
  if (!contrato) return 'free';
  if (!liq) return 'warn';
  const total = totalLiquidacionCents(liq);
  if (liq.cobradoCents >= total && total > 0) return 'ok';
  if (liq.saldoAnteriorCents > 0 || liq.diasMora > 0) return 'late';
  return 'warn';
}

function totalLiquidacionCents(liq) {
  if (!liq) return 0;
  return liq.alquilerFijoCents + liq.variableCents + liq.expensasCents
    + (liq.saldoAnteriorCents || 0) + liq.interesMoraCents;
}

/** El comprobante más nuevo que todavía espera revisión, o null. */
function comprobantePendiente(liq) {
  const pendientes = ((liq && liq.Comprobantes) || []).filter((c) => c.estado === 'pendiente');
  pendientes.sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
  return pendientes[0] || null;
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
      duenoId: local.duenoId || null,
      desde: previo && previo.fechaBaja
        ? `Baja: ${fechaCorta(previo.fechaBaja)}`
        : 'Disponible',
      ultimoContrato: datosParaReplicar(previo),
    };
  }

  const locatario = contrato.Locatario;
  const comp = comprobantePendiente(liq);
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
    // Lo que arrastra de meses anteriores, punitorios incluidos.
    deudaCents: liq ? (liq.saldoAnteriorCents || 0) + liq.interesMoraCents : 0,
    act: contrato.locatarioEsDueno
      ? 'Sin alquiler que actualizar'
      : (contrato.proximaActualizacion || contrato.indice),
    venc: String(contrato.diaVencimiento),
    pago: liq ? (liq.fechaPago || 'Pendiente') : 'Sin liquidación',
    email: locatario ? locatario.email : '',
    tel: locatario ? locatario.telefono : '',
    comp: !!comp,
    compFecha: comp ? comp.fechaSubida : null,
    compId: comp ? comp.id : null,
    compTieneArchivo: !!(comp && comp.mimeType),
    fact: centsToMoney(totCents),
    cob: centsToMoney(liq ? liq.cobradoCents : 0),
    cobCents: liq ? liq.cobradoCents : 0,
    nuevo: !!contrato.esAlta,
    esDueno: !!contrato.locatarioEsDueno,
    duenoId: local.duenoId || null,
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
    periodo: g.periodo,
  };
}

/** Todo lo que el front necesita para arrancar, en una sola llamada. */
async function estadoCompleto(galeriaId) {
  const galeria = await galeriaActual(galeriaId);
  if (!galeria) {
    return { galeria: null, periodo: PERIODO_INICIAL, units: [], ajustes: {}, porcentajes: {}, gastos: [], proveedores: [], config: null };
  }
  const periodo = await periodoAbierto(galeria.id);
  const locales = await localesConDatos(galeria.id, periodo);
  // Solo los del mes abierto: los de meses cerrados ya se repartieron en las expensas.
  const gastos = await Gasto.findAll({
    where: { galeriaId: galeria.id, periodo },
    include: [Proveedor],
    order: [['id', 'ASC']],
  });
  const proveedores = await Proveedor.findAll({ order: [['nombre', 'ASC']] });
  const config = await Configuracion.findOne({ where: { galeriaId: galeria.id } });

  return {
    galeria: { id: galeria.id, nombre: galeria.nombre, direccion: galeria.direccion, dueno: galeria.dueno },
    periodo,
    units: locales.map(serializarLocal),
    ajustes: serializarAjustes(locales),
    porcentajes: serializarPorcentajes(locales),
    gastos: gastos.map(serializarGasto),
    proveedores: proveedores.map((p) => ({ id: p.id, nombre: p.nombre })),
    config: config ? config.toJSON() : null,
  };
}

/**
 * Cuenta corriente: una fila por liquidación, de la más nueva a la más vieja.
 * `where` elige cuáles (las de un contrato, las de un locatario...).
 *
 * Cada mes muestra lo generado en el mes y la deuda que arrastraba (con sus
 * punitorios); si se cerró impago, esa deuda pasó a la liquidación siguiente.
 */
async function cuentaCorriente(where, periodoActual) {
  const liqs = await Liquidacion.findAll({
    where,
    include: [{ model: Contrato, attributes: ['id', 'localId'], include: [{ model: Local, attributes: ['numero'] }] }],
    order: [['periodo', 'DESC'], ['id', 'DESC']],
  });
  const ajustes = liqs.length
    ? await AjusteExpensa.findAll({ where: { localId: [...new Set(liqs.map((l) => l.localId))] } })
    : [];
  return liqs.map((l) => {
    const ajuste = ajustes.find((a) => a.localId === l.localId && a.periodo === l.periodo) || null;
    const totalCents = totalConAjusteCents(l, ajuste);
    const deudaAnteriorCents = (l.saldoAnteriorCents || 0) + l.interesMoraCents;
    const abierta = l.periodo === periodoActual;
    const pagada = l.cobradoCents >= totalCents && totalCents > 0;
    return {
      id: l.id,
      periodo: l.periodo,
      localNumero: l.Contrato && l.Contrato.Local ? l.Contrato.Local.numero : null,
      delMesCents: totalCents - deudaAnteriorCents,
      deudaAnteriorCents,
      totalCents,
      cobradoCents: l.cobradoCents,
      estado: l.estado,
      abierta,
      // Cerrada sin pagar: la deuda se pasó a la liquidación del mes siguiente.
      trasladada: !abierta && !pagada,
    };
  });
}

/**
 * Datos de la pantalla del locatario: contrato, desglose de la liquidación del
 * mes abierto y su cuenta corriente.
 */
async function detalleLocatario(galeriaId, numero) {
  const periodo = await periodoAbierto(galeriaId);
  const locales = await localesConDatos(galeriaId, periodo);
  const local = locales.find((l) => l.numero === numero)
    || locales.find((l) => contratoVigente(l));
  if (!local) return null;

  const contrato = contratoVigente(local);
  if (!contrato) return null;
  const liq = (local.Liquidacions || [])[0] || null;
  const ajuste = (local.AjusteExpensas || [])[0] || null;
  const delta = deltaAjuste(ajuste);

  // Las liquidaciones de los contratos de este locatario en el local (no las del
  // inquilino anterior).
  const contratosPropios = await Contrato.findAll({
    where: { localId: local.id, locatarioId: contrato.locatarioId },
    attributes: ['id'],
  });
  const cuenta = await cuentaCorriente({ contratoId: contratosPropios.map((c) => c.id) }, periodo);

  // Todos los comprobantes que subió este locatario, de cualquiera de sus
  // contratos (no los del inquilino anterior o siguiente del mismo local).
  const comprobantes = await Comprobante.findAll({
    include: [{
      model: Liquidacion,
      required: true,
      include: [{ model: Contrato, required: true, attributes: [], where: { locatarioId: contrato.locatarioId } }],
    }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
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
      periodo: liq.periodo,
      alquilerFijoCents: liq.alquilerFijoCents,
      variableCents: liq.variableCents,
      expensasCents: liq.expensasCents + delta,
      saldoAnteriorCents: liq.saldoAnteriorCents || 0,
      interesMoraCents: liq.interesMoraCents,
      detalle: liq.detalle || null,
      diasMora: liq.diasMora,
      facturacionDeclaradaCents: liq.facturacionDeclaradaCents,
      totalCents: totalLiquidacionCents(liq) + delta,
      estado: liq.estado,
      ajuste: ajuste && { tipo: ajuste.tipo, montoCents: ajuste.montoCents, motivo: ajuste.motivo },
    },
    comprobantes: comprobantes.map((c) => ({
      id: c.id,
      periodo: c.Liquidacion.periodo,
      fecha: fechaHora(c.createdAt),
      archivoNombre: c.archivoNombre,
      estado: c.estado,
      tieneArchivo: !!c.mimeType,
    })),
    cuenta,
  };
}

/**
 * El locatario que corresponde al usuario logueado, con su contrato vigente.
 *
 * El usuario queda atado al local (`localId`), no a la persona: después de una
 * baja y un contrato nuevo en el mismo local, el usuario viejo seguiría
 * apuntando a ese local. Por eso además pedimos que el email del usuario sea el
 * del locatario vigente; si no coincide, no le corresponde nada.
 */
async function locatarioDelUsuario(usuario) {
  if (!usuario || usuario.rol !== 'locatario' || !usuario.localId) return null;
  const contrato = await Contrato.findOne({
    where: { localId: usuario.localId, estado: 'vigente' },
    include: [Locatario, Local],
  });
  const locatario = contrato && contrato.Locatario;
  if (!locatario) return null;
  const mismoEmail = String(locatario.email || '').trim().toLowerCase()
    === String(usuario.email || '').trim().toLowerCase();
  return mismoEmail ? { contrato, locatario } : null;
}

module.exports = {
  locatarioDelUsuario, periodoAbierto, cuentaCorriente,
  galeriaActual, localesConDatos, detalleLocatario, modalidadLabel, contratoVigente, estadoLocal,
  totalLiquidacionCents, comprobantePendiente, serializarLocal, serializarAjustes,
  serializarPorcentajes, serializarGasto, estadoCompleto,
};
