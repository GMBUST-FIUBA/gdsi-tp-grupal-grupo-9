'use strict';
/*
 * Las cuentas del cierre del mes, sin tocar la base: reciben datos planos y
 * devuelven importes en centavos. Así se pueden probar con `npm test`.
 *
 * Los porcentajes se pasan a puntos básicos (12,5% -> 1250) para hacer las
 * cuentas con enteros y redondear una sola vez al final.
 */
const { sumarMeses, mesesEntre, mesesDeFrecuencia, periodoCorto } = require('./formato');

/** 12.5 -> 1250 */
function bp(pct) {
  return Math.round(Number(pct || 0) * 100);
}

/** monto × pct%, redondeado al centavo. */
function aplicarPct(montoCents, pct) {
  return Math.round(montoCents * bp(pct) / 10000);
}

/** +monto para un cargo, −monto para un descuento, 0 si no hay ajuste. */
function deltaAjuste(ajuste) {
  if (!ajuste) return 0;
  return ajuste.tipo === 'descuento' ? -ajuste.montoCents : ajuste.montoCents;
}

/*
 * Cuando el locatario es el dueño del local no paga alquiler: solo le tocan las
 * expensas, y esas salen únicamente de los gastos extraordinarios (los
 * ordinarios son el costo de administrar lo que ya es suyo).
 */
function gastosQueLeTocan(gastos, locatarioEsDueno) {
  return locatarioEsDueno ? gastos.filter((g) => g.tipo === 'extraordinario') : gastos;
}

/** Lo que se generó en el mes, sin deuda anterior ni punitorios. */
function montoDelMesCents(liq, ajuste) {
  return liq.alquilerFijoCents + liq.variableCents + liq.expensasCents + deltaAjuste(ajuste);
}

/** Total a pagar de una liquidación, incluido el ajuste del mes. */
function totalConAjusteCents(liq, ajuste) {
  return montoDelMesCents(liq, ajuste) + (liq.saldoAnteriorCents || 0) + liq.interesMoraCents;
}

/**
 * Estado de cuenta de la galería en el mes: saldo anterior + ingresos − gastos.
 * `gastos`: [{ tipo, montoCents, ... }], `ingresos`: [{ montoCents, ... }].
 */
function resumenCuenta({ saldoAnteriorCents = 0, gastos = [], ingresos = [] }) {
  const suma = (xs) => xs.reduce((acc, x) => acc + x.montoCents, 0);
  const ordinarios = gastos.filter((g) => g.tipo !== 'extraordinario');
  const extraordinarios = gastos.filter((g) => g.tipo === 'extraordinario');
  const gastosTotalCents = suma(gastos);
  const ingresosTotalCents = suma(ingresos);
  return {
    saldoAnteriorCents,
    gastos: {
      totalCents: gastosTotalCents,
      ordinarios: { totalCents: suma(ordinarios), items: ordinarios },
      extraordinarios: { totalCents: suma(extraordinarios), items: extraordinarios },
    },
    ingresos: { totalCents: ingresosTotalCents, items: ingresos },
    saldoFinalCents: saldoAnteriorCents + ingresosTotalCents - gastosTotalCents,
  };
}

/**
 * Reparte los gastos del mes según el % del local. Cada gasto lleva su parte y
 * las partes suman exactamente el total (los centavos que sobran del redondeo
 * van a los gastos con mayor resto), así el detalle del PDF cierra.
 */
function repartirGastos(gastos, expensasPct) {
  const puntos = bp(expensasPct);
  const totalGastos = gastos.reduce((acc, g) => acc + g.montoCents, 0);
  const totalCents = Math.round(totalGastos * puntos / 10000);

  const partes = gastos.map((g, i) => {
    const exacto = g.montoCents * puntos;
    return { i, cents: Math.floor(exacto / 10000), resto: exacto % 10000 };
  });
  let sobrante = totalCents - partes.reduce((acc, p) => acc + p.cents, 0);
  [...partes].sort((a, b) => b.resto - a.resto).forEach((p) => {
    if (sobrante > 0) { p.cents++; sobrante--; }
  });

  return {
    totalCents,
    items: gastos.map((g, i) => ({ ...g, parteCents: partes[i].cents })),
  };
}

/** ¿Al contrato le toca la actualización del alquiler en este período? */
function seActualiza(contrato, periodo) {
  return !!contrato.proximaActualizacionPeriodo && contrato.proximaActualizacionPeriodo === periodo;
}

/** 'ICL (BCRA)' -> 'ICL', para el texto corto de la próxima actualización. */
function indiceCorto(indice) {
  return String(indice || '').replace(/\s*\(.*\)\s*$/, '').trim() || 'Índice';
}

/**
 * Meses adeudados al emitir `periodoNuevo`. La deuda se lleva por mes: si la
 * liquidación anterior quedó impaga, su monto del mes se suma a las deudas que
 * ya traía; si se pagó (el pago siempre cubre el total), no queda nada.
 *
 * Cada mes adeudado paga un punitorio simple: monto × meses de atraso × tasa.
 * Debo $100 de agosto y $100 de septiembre al 5% -> en octubre, $110 + $105.
 */
function calcularDeudas(anterior, periodoNuevo, tasaPct) {
  if (!anterior || anterior.pagada) return [];
  const previas = anterior.deudas || [];
  const delMes = anterior.montoDelMesCents > 0
    ? [{ periodo: anterior.periodo, montoCents: anterior.montoDelMesCents }]
    : [];
  return [...previas, ...delMes].map((d) => {
    const meses = mesesEntre(d.periodo, periodoNuevo);
    const punitorioCents = Math.round(d.montoCents * meses * bp(tasaPct) / 10000);
    return {
      periodo: d.periodo,
      montoCents: d.montoCents,
      meses,
      punitorioCents,
      totalCents: d.montoCents + punitorioCents,
    };
  });
}

/**
 * La liquidación que se emite para `periodoNuevo` al cerrar el mes anterior.
 *
 * - contrato: { alquilerFijoCents, indice, proximaActualizacionPeriodo, locatarioEsDueno }
 * - anterior: { periodo, montoDelMesCents, pagada, deudas } o null
 * - gastos: los del mes que se cierra, [{ tipo, montoCents, ... }]
 * - expensasPct: % de expensas del local (null/undefined = sin asignar)
 * - aumentosPorIndice: { 'ICL (BCRA)': 12 } con el % que cargó el admin
 */
function calcularLiquidacion({
  contrato, anterior, gastos = [], expensasPct, tasaPunitorioPct = 0,
  aumentosPorIndice = {}, frecuencia, periodoNuevo,
}) {
  // Alquiler: el del contrato, más el aumento si este mes le toca actualizar.
  // Un dueño que ocupa su propio local no paga alquiler, así que tampoco se le
  // actualiza nada.
  const esDueno = !!contrato.locatarioEsDueno;
  const baseCents = esDueno ? 0 : contrato.alquilerFijoCents;
  let alquilerFijoCents = baseCents;
  let aumento = null;
  if (!esDueno && seActualiza(contrato, periodoNuevo)) {
    const pct = aumentosPorIndice[contrato.indice];
    const falta = pct === undefined || pct === null || pct === '';
    alquilerFijoCents = falta ? baseCents : baseCents + aplicarPct(baseCents, pct);
    const proxima = sumarMeses(periodoNuevo, mesesDeFrecuencia(frecuencia));
    aumento = {
      indice: contrato.indice,
      pct: falta ? null : Number(pct),
      falta,
      baseCents,
      nuevoCents: alquilerFijoCents,
      proximaActualizacionPeriodo: proxima,
      proximaActualizacion: `${indiceCorto(contrato.indice)} · ${periodoCorto(proxima)}`,
    };
  }

  // Expensas: la parte del local en los gastos del mes que se cierra.
  const tienePct = expensasPct !== null && expensasPct !== undefined;
  const gastosDelLocal = gastosQueLeTocan(gastos, esDueno);
  const reparto = repartirGastos(gastosDelLocal, tienePct ? expensasPct : 0);

  // Deuda de meses anteriores, mes por mes, con su punitorio.
  const deudas = calcularDeudas(anterior, periodoNuevo, tasaPunitorioPct);
  const saldoAnteriorCents = deudas.reduce((acc, d) => acc + d.montoCents, 0);
  const interesMoraCents = deudas.reduce((acc, d) => acc + d.punitorioCents, 0);

  const variableCents = 0; // TODO: falta la declaración de facturación del locatario.
  const totalCents = alquilerFijoCents + variableCents + reparto.totalCents
    + saldoAnteriorCents + interesMoraCents;

  return {
    alquilerFijoCents,
    variableCents,
    expensasCents: reparto.totalCents,
    saldoAnteriorCents,
    interesMoraCents,
    totalCents,
    aumento,
    detalle: {
      periodoGastos: anterior ? anterior.periodo : null,
      locatarioEsDueno: esDueno,
      alquiler: { baseCents, aumento },
      expensas: {
        pct: tienePct ? Number(expensasPct) : null,
        // Solo extraordinarios cuando el locatario es el dueño.
        soloExtraordinarios: esDueno,
        gastosTotalCents: gastosDelLocal.reduce((acc, g) => acc + g.montoCents, 0),
        totalCents: reparto.totalCents,
        gastos: reparto.items,
      },
      punitorio: { tasaPct: Number(tasaPunitorioPct || 0) },
      deudas,
    },
  };
}

module.exports = {
  deltaAjuste, montoDelMesCents, totalConAjusteCents, resumenCuenta, repartirGastos,
  seActualiza, indiceCorto, calcularDeudas, calcularLiquidacion, aplicarPct,
  gastosQueLeTocan,
};
