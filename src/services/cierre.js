'use strict';
/*
 * Cierre del mes ("Liquidar expensas"): el estado de cuenta del mes abierto, la
 * vista previa de lo que va a pagar cada local el mes siguiente y la
 * confirmación, que congela el mes y emite las liquidaciones nuevas.
 *
 * Las cuentas están en ./calculo.js; acá solo se leen y se guardan los datos.
 */
const {
  sequelize, Local, Contrato, Locatario, Liquidacion, AjusteExpensa,
  Configuracion, Gasto, Proveedor, CierreMes,
} = require('../models');
const {
  sumarMeses, tieneMasDeDosDecimales, PERIODO_INICIAL, periodoLabel, centsToMoney,
} = require('./formato');
const {
  resumenCuenta, calcularLiquidacion, seActualiza, montoDelMesCents, totalConAjusteCents,
} = require('./calculo');
const { contratoVigente } = require('./galeria');

function fmtPct(n) {
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

/** Lo que se guarda de cada gasto en el cierre y en el detalle de las liquidaciones. */
function fotoGasto(g) {
  return {
    id: g.id,
    tipo: g.tipo,
    proveedor: g.Proveedor ? g.Proveedor.nombre : '—',
    descripcion: g.descripcion,
    factura: `${g.facturaTipo || ''} N° ${g.facturaNro || ''}`.trim(),
    montoCents: g.montoCents,
  };
}

/** El saldo con el que arrancó el mes abierto: el final del último cierre o el inicial. */
async function saldoAnteriorDe(galeriaId, config) {
  const ultimo = await CierreMes.findOne({ where: { galeriaId }, order: [['periodo', 'DESC']] });
  if (ultimo) return ultimo.saldoFinalCents;
  return config ? config.saldoInicialCents : 0;
}

/** Gastos, ingresos y saldo anterior del mes abierto. */
async function datosDelPeriodo(galeriaId) {
  const config = await Configuracion.findOne({ where: { galeriaId } });
  const periodo = (config && config.periodoActual) || PERIODO_INICIAL;

  const gastos = await Gasto.findAll({
    where: { galeriaId, periodo },
    include: [Proveedor],
    order: [['id', 'ASC']],
  });

  // Ingresos: lo cobrado de las liquidaciones del mes (pagos aceptados).
  const locales = await Local.findAll({ where: { galeriaId }, attributes: ['id', 'numero'] });
  const liqs = await Liquidacion.findAll({
    where: { periodo, localId: locales.map((l) => l.id) },
    include: [{ model: Contrato, include: [Locatario] }],
    order: [['id', 'ASC']],
  });
  const ingresos = liqs
    .filter((l) => l.cobradoCents > 0)
    .map((l) => ({
      liquidacionId: l.id,
      localNumero: (locales.find((x) => x.id === l.localId) || {}).numero,
      locatario: l.Contrato && l.Contrato.Locatario ? l.Contrato.Locatario.nombre : '—',
      montoCents: l.cobradoCents,
    }))
    .sort((a, b) => String(a.localNumero).localeCompare(String(b.localNumero)));

  return {
    config,
    periodo,
    gastos: gastos.map(fotoGasto),
    ingresos,
    liqs,
    saldoAnteriorCents: await saldoAnteriorDe(galeriaId, config),
  };
}

/** Lo que muestra la pestaña Estado de cuenta. */
async function resumenPeriodo(galeriaId) {
  const d = await datosDelPeriodo(galeriaId);
  const cierres = await CierreMes.findAll({
    where: { galeriaId },
    attributes: ['id', 'periodo', 'saldoAnteriorCents', 'gastosOrdinariosCents', 'gastosExtraordinariosCents', 'ingresosCents', 'saldoFinalCents', 'fechaCierre'],
    order: [['periodo', 'DESC']],
  });
  return {
    periodo: d.periodo,
    periodoNuevo: sumarMeses(d.periodo, 1),
    ...resumenCuenta(d),
    saldoInicialCents: d.config ? d.config.saldoInicialCents : 0,
    puedeEditarSaldoInicial: cierres.length === 0,
    cierres: cierres.map((c) => c.toJSON()),
  };
}

/**
 * '12,5' / 12.5 por índice -> { aumentos } o { error }. Vacío = todavía no lo
 * cargó (la vista previa lo muestra como pendiente y no deja confirmar).
 */
function normalizarAumentos(raw) {
  const aumentos = {};
  for (const [indice, valor] of Object.entries(raw || {})) {
    const s = String(valor === null || valor === undefined ? '' : valor).trim().replace(',', '.');
    if (s === '') continue;
    if (!/^\d+(\.\d+)?$/.test(s)) return { error: `Ingresá un porcentaje válido para ${indice} (0 o más).` };
    const n = Number(s);
    if (tieneMasDeDosDecimales(n)) return { error: `El porcentaje de ${indice} solo puede tener hasta dos decimales.` };
    aumentos[indice] = n;
  }
  return { aumentos };
}

/**
 * Lo que va a pagar cada local con contrato vigente en el mes siguiente, más
 * los avisos y lo que falta para poder confirmar.
 */
async function previewCierre(galeriaId, aumentosRaw) {
  const { aumentos, error } = normalizarAumentos(aumentosRaw);
  if (error) return { ok: false, msg: error };

  const d = await datosDelPeriodo(galeriaId);
  const periodoNuevo = sumarMeses(d.periodo, 1);
  const resumen = resumenCuenta(d);

  const locales = await Local.findAll({
    where: { galeriaId },
    order: [['numero', 'ASC']],
    include: [
      { model: Contrato, required: false, include: [{ model: Locatario, required: false }] },
      { model: AjusteExpensa, required: false, where: { periodo: d.periodo } },
    ],
  });

  const filas = [];
  const porIndice = {}; // { 'ICL (BCRA)': ['02', '04'] }
  for (const local of locales) {
    const contrato = contratoVigente(local);
    if (!contrato) continue;

    // La liquidación del mes que se cierra, si es de este mismo contrato.
    const liq = d.liqs.find((l) => l.localId === local.id && l.contratoId === contrato.id) || null;
    const ajuste = (local.AjusteExpensas || [])[0] || null;
    const anterior = liq && {
      periodo: liq.periodo,
      montoDelMesCents: montoDelMesCents(liq, ajuste),
      pagada: liq.cobradoCents >= totalConAjusteCents(liq, ajuste),
      deudas: (liq.detalle && liq.detalle.deudas) || [],
    };

    if (seActualiza(contrato, periodoNuevo)) {
      (porIndice[contrato.indice] = porIndice[contrato.indice] || []).push(local.numero);
    }

    const calc = calcularLiquidacion({
      contrato,
      anterior,
      gastos: d.gastos,
      expensasPct: local.expensasPct === null || local.expensasPct === undefined ? null : Number(local.expensasPct),
      tasaPunitorioPct: d.config ? Number(d.config.interesMoraDiario) : 0,
      aumentosPorIndice: aumentos,
      frecuencia: d.config ? d.config.frecuencia : 'Trimestral',
      periodoNuevo,
    });
    // El cálculo usa el mes cerrado como origen de los gastos aunque el contrato sea nuevo.
    calc.detalle.periodoGastos = d.periodo;

    filas.push({
      localId: local.id,
      numero: local.numero,
      locatario: contrato.Locatario ? contrato.Locatario.nombre : '—',
      contratoId: contrato.id,
      ...calc,
    });
  }

  const aumentosPedidos = Object.keys(porIndice).sort().map((indice) => ({
    indice,
    locales: porIndice[indice],
    pct: aumentos[indice] === undefined ? null : aumentos[indice],
  }));

  // Avisos (no bloquean) y bloqueos (no dejan confirmar).
  const avisos = [];
  const bloqueos = [];

  const enRevision = d.liqs.filter((l) => l.estado === 'en_revision').length;
  if (enRevision) {
    bloqueos.push(enRevision === 1
      ? 'Revisá el comprobante pendiente antes de liquidar (Panel general › detalle del local).'
      : `Revisá los ${enRevision} comprobantes pendientes antes de liquidar (Panel general › detalle del local).`);
  }
  const faltan = aumentosPedidos.filter((a) => a.pct === null).map((a) => a.indice);
  if (faltan.length) {
    bloqueos.push(`Ingresá el % de variación de ${faltan.join(', ')} para los contratos que se actualizan en ${periodoLabel(periodoNuevo)}.`);
  }

  const sinPct = filas.filter((f) => f.detalle.expensas.pct === null).map((f) => f.numero);
  if (sinPct.length && resumen.gastos.totalCents > 0) {
    avisos.push(`${sinPct.length === 1 ? 'El local' : 'Los locales'} ${sinPct.join(', ')} no ${sinPct.length === 1 ? 'tiene' : 'tienen'} % de expensas asignado: no ${sinPct.length === 1 ? 'paga' : 'pagan'} expensas este mes.`);
  }
  const sumaPct = filas.reduce((acc, f) => acc + Math.round((f.detalle.expensas.pct || 0) * 100), 0) / 100;
  const repartido = filas.reduce((acc, f) => acc + f.expensasCents, 0);
  if (resumen.gastos.totalCents > 0 && repartido < resumen.gastos.totalCents) {
    avisos.push(`Los % de los locales con contrato suman ${fmtPct(sumaPct)}: se reparten ${centsToMoney(repartido)} de ${centsToMoney(resumen.gastos.totalCents)} de gastos.`);
  }

  return {
    ok: true,
    periodo: d.periodo,
    periodoNuevo,
    resumen,
    filas,
    aumentos: aumentosPedidos,
    aumentosValidos: aumentos,
    avisos,
    bloqueos,
    puedeConfirmar: bloqueos.length === 0,
    _datos: d,
  };
}

/** Saca de la vista previa lo que es solo para uso interno. */
function previewPublica(p) {
  if (!p.ok) return p;
  const { _datos, aumentosValidos, ...resto } = p;
  return resto;
}

/**
 * Cierra el mes abierto: guarda la foto del cierre, aplica los aumentos que
 * tocan, emite las liquidaciones del mes siguiente y avanza el período.
 * Todo o nada, en una transacción.
 *
 * `periodoEsperado` es el mes que el admin vio en la vista previa: si ya no es
 * el abierto (otro pedido lo cerró), no se cierra el siguiente por accidente.
 */
async function cerrarMes(galeriaId, aumentosRaw, periodoEsperado) {
  const p = await previewCierre(galeriaId, aumentosRaw);
  if (!p.ok) return p;
  if (periodoEsperado !== p.periodo) {
    return { ok: false, msg: `${periodoLabel(periodoEsperado || p.periodo)} ya está liquidado. Recargá la página.` };
  }
  if (!p.puedeConfirmar) return { ok: false, msg: p.bloqueos.join(' ') };

  const d = p._datos;
  try {
    const cierre = await sequelize.transaction(async (transaction) => {
      // Si mientras tanto alguien cerró el mes, no se cierra dos veces.
      const config = await Configuracion.findOne({ where: { galeriaId }, transaction });
      if (config && config.periodoActual !== p.periodo) {
        throw new ErrorCierre('Este mes ya se liquidó. Recargá la página.');
      }

      const aumentosAplicados = p.filas.filter((f) => f.aumento).map((f) => ({
        numero: f.numero,
        locatario: f.locatario,
        indice: f.aumento.indice,
        pct: f.aumento.pct,
        baseCents: f.aumento.baseCents,
        nuevoCents: f.aumento.nuevoCents,
      }));

      const creado = await CierreMes.create({
        galeriaId,
        periodo: p.periodo,
        saldoAnteriorCents: p.resumen.saldoAnteriorCents,
        gastosOrdinariosCents: p.resumen.gastos.ordinarios.totalCents,
        gastosExtraordinariosCents: p.resumen.gastos.extraordinarios.totalCents,
        ingresosCents: p.resumen.ingresos.totalCents,
        saldoFinalCents: p.resumen.saldoFinalCents,
        fechaCierre: new Date(),
        detalle: {
          gastos: d.gastos,
          ingresos: d.ingresos,
          aumentos: aumentosAplicados,
          liquidaciones: p.filas.map((f) => ({
            numero: f.numero,
            locatario: f.locatario,
            alquilerFijoCents: f.alquilerFijoCents,
            expensasCents: f.expensasCents,
            saldoAnteriorCents: f.saldoAnteriorCents,
            interesMoraCents: f.interesMoraCents,
            totalCents: f.totalCents,
          })),
        },
      }, { transaction });

      for (const f of p.filas) {
        if (f.aumento) {
          await Contrato.update({
            alquilerFijoCents: f.aumento.nuevoCents,
            proximaActualizacionPeriodo: f.aumento.proximaActualizacionPeriodo,
            proximaActualizacion: f.aumento.proximaActualizacion,
          }, { where: { id: f.contratoId }, transaction });
        }
        const mesesAdeudados = f.detalle.deudas.length;
        await Liquidacion.create({
          localId: f.localId,
          contratoId: f.contratoId,
          periodo: p.periodoNuevo,
          alquilerFijoCents: f.alquilerFijoCents,
          variableCents: f.variableCents,
          expensasCents: f.expensasCents,
          saldoAnteriorCents: f.saldoAnteriorCents,
          interesMoraCents: f.interesMoraCents,
          diasMora: 0,
          estado: 'pendiente',
          fechaPago: mesesAdeudados
            ? `En mora · ${mesesAdeudados === 1 ? '1 mes adeudado' : `${mesesAdeudados} meses adeudados`}`
            : 'Pendiente',
          detalle: f.detalle,
        }, { transaction });
      }

      await Configuracion.update(
        { periodoActual: p.periodoNuevo },
        { where: { galeriaId }, transaction },
      );
      return creado;
    });
    return { ok: true, cierreId: cierre.id, periodoNuevo: p.periodoNuevo };
  } catch (e) {
    if (e instanceof ErrorCierre) return { ok: false, msg: e.message };
    if (e.name === 'SequelizeUniqueConstraintError') {
      return { ok: false, msg: 'Este mes ya se liquidó. Recargá la página.' };
    }
    throw e;
  }
}

class ErrorCierre extends Error {}

/** ¿El período de esta liquidación/gasto sigue abierto? */
async function esPeriodoAbierto(galeriaId, periodo) {
  const config = await Configuracion.findOne({ where: { galeriaId } });
  return ((config && config.periodoActual) || PERIODO_INICIAL) === periodo;
}

/** El saldo inicial de la cuenta solo se puede cambiar antes del primer cierre. */
async function fijarSaldoInicial(galeriaId, cents) {
  const hayCierres = await CierreMes.count({ where: { galeriaId } });
  if (hayCierres) return { ok: false, msg: 'El saldo inicial solo se puede cambiar antes del primer cierre.' };
  await Configuracion.update({ saldoInicialCents: cents }, { where: { galeriaId } });
  return { ok: true };
}

module.exports = {
  resumenPeriodo, previewCierre, previewPublica, cerrarMes, esPeriodoAbierto, fijarSaldoInicial,
  normalizarAumentos,
};
