'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resumenCuenta, calcularLiquidacion, calcularDeudas, repartirGastos, montoDelMesCents, totalConAjusteCents,
} = require('../src/services/calculo');

const pesos = (n) => Math.round(n * 100);
const gasto = (tipo, monto) => ({ tipo, montoCents: pesos(monto) });
const ingreso = (monto) => ({ montoCents: pesos(monto) });

/* ---------- Escenarios del cierre del mes ---------- */

test('cerrar el mes con cuenta vacía', () => {
  const r = resumenCuenta({
    saldoAnteriorCents: 0,
    gastos: [gasto('ordinario', 1000), gasto('extraordinario', 2000)],
    ingresos: [ingreso(4000)],
  });
  assert.equal(r.gastos.totalCents, pesos(3000));
  assert.equal(r.gastos.ordinarios.totalCents, pesos(1000));
  assert.equal(r.gastos.ordinarios.items.length, 1);
  assert.equal(r.gastos.extraordinarios.totalCents, pesos(2000));
  assert.equal(r.gastos.extraordinarios.items.length, 1);
  assert.equal(r.ingresos.totalCents, pesos(4000));
  assert.equal(r.ingresos.items.length, 1);
  assert.equal(r.saldoFinalCents, pesos(1000));
});

test('cerrar el mes con dinero del mes anterior', () => {
  const r = resumenCuenta({
    saldoAnteriorCents: pesos(500),
    gastos: [gasto('ordinario', 1000), gasto('extraordinario', 2000)],
    ingresos: [ingreso(4000)],
  });
  assert.equal(r.gastos.totalCents, pesos(3000));
  assert.equal(r.ingresos.totalCents, pesos(4000));
  assert.equal(r.saldoFinalCents, pesos(1500));
});

test('cerrar el mes sin gastos extraordinarios', () => {
  const r = resumenCuenta({
    saldoAnteriorCents: 0,
    gastos: [gasto('ordinario', 1000), gasto('ordinario', 2000)],
    ingresos: [ingreso(4000)],
  });
  assert.equal(r.gastos.totalCents, pesos(3000));
  assert.equal(r.gastos.ordinarios.items.length, 2);
  assert.equal(r.gastos.extraordinarios.totalCents, 0);
  assert.equal(r.saldoFinalCents, pesos(1000));
});

test('cerrar el mes sin gastos ordinarios', () => {
  const r = resumenCuenta({
    saldoAnteriorCents: 0,
    gastos: [gasto('extraordinario', 1000), gasto('extraordinario', 2000)],
    ingresos: [ingreso(4000)],
  });
  assert.equal(r.gastos.totalCents, pesos(3000));
  assert.equal(r.gastos.ordinarios.totalCents, 0);
  assert.equal(r.gastos.extraordinarios.items.length, 2);
  assert.equal(r.saldoFinalCents, pesos(1000));
});

/* ---------- Liquidación de cada local ---------- */

const contrato = (alquiler, proxima = '2026-11') => ({
  alquilerFijoCents: pesos(alquiler), indice: 'ICL (BCRA)', proximaActualizacionPeriodo: proxima,
});
const base = {
  gastos: [gasto('ordinario', 1000), gasto('extraordinario', 2000)],
  tasaPunitorioPct: 5,
  frecuencia: 'Trimestral',
  periodoNuevo: '2026-09',
};

test('expensas = gastos del mes cerrado × % del local', () => {
  const l = calcularLiquidacion({ ...base, contrato: contrato(100000), anterior: null, expensasPct: 25 });
  assert.equal(l.expensasCents, pesos(750));
  assert.equal(l.alquilerFijoCents, pesos(100000));
  assert.equal(l.totalCents, pesos(100750));
  assert.deepEqual(l.detalle.expensas.gastos.map((g) => g.parteCents), [pesos(250), pesos(500)]);
});

test('local sin % de expensas no paga expensas', () => {
  const l = calcularLiquidacion({ ...base, contrato: contrato(100000), anterior: null, expensasPct: null });
  assert.equal(l.expensasCents, 0);
  assert.equal(l.detalle.expensas.pct, null);
});

test('las partes de cada gasto suman el total aunque haya redondeo', () => {
  const r = repartirGastos([{ montoCents: 1 }, { montoCents: 1 }, { montoCents: 1 }], 33.33);
  assert.equal(r.items.reduce((a, g) => a + g.parteCents, 0), r.totalCents);
  const r2 = repartirGastos([{ montoCents: 101 }, { montoCents: 333 }, { montoCents: 777 }], 6.25);
  assert.equal(r2.items.reduce((a, g) => a + g.parteCents, 0), r2.totalCents);
});

test('el aumento se aplica solo en el mes que toca y corre la próxima actualización', () => {
  const toca = calcularLiquidacion({
    ...base, contrato: contrato(100000, '2026-09'), anterior: null, expensasPct: 25,
    aumentosPorIndice: { 'ICL (BCRA)': 12 },
  });
  assert.equal(toca.alquilerFijoCents, pesos(112000));
  assert.equal(toca.totalCents, pesos(112750));
  assert.equal(toca.aumento.proximaActualizacionPeriodo, '2026-12');
  assert.equal(toca.aumento.proximaActualizacion, 'ICL · Dic 2026');

  const noToca = calcularLiquidacion({
    ...base, contrato: contrato(100000, '2026-10'), anterior: null, expensasPct: 25,
    aumentosPorIndice: { 'ICL (BCRA)': 12 },
  });
  assert.equal(noToca.alquilerFijoCents, pesos(100000));
  assert.equal(noToca.aumento, null);
});

test('si falta el % del índice, queda marcado y no aumenta', () => {
  const l = calcularLiquidacion({ ...base, contrato: contrato(100000, '2026-09'), anterior: null, expensasPct: 0 });
  assert.equal(l.aumento.falta, true);
  assert.equal(l.alquilerFijoCents, pesos(100000));
});

/* ---------- Punitorios ---------- */

test('$100 adeudados de dos meses al 5%: el más viejo debe $110 y el más nuevo $105', () => {
  // Al emitir septiembre: debe agosto (1 mes).
  const sep = calcularDeudas({ periodo: '2026-08', montoDelMesCents: pesos(100), pagada: false, deudas: [] }, '2026-09', 5);
  assert.deepEqual(sep.map((d) => d.totalCents), [pesos(105)]);

  // Al emitir octubre: tampoco pagó septiembre.
  const oct = calcularDeudas({ periodo: '2026-09', montoDelMesCents: pesos(100), pagada: false, deudas: sep }, '2026-10', 5);
  assert.deepEqual(oct.map((d) => [d.periodo, d.meses, d.totalCents]), [
    ['2026-08', 2, pesos(110)],
    ['2026-09', 1, pesos(105)],
  ]);
});

test('el punitorio es simple: no se cobra punitorio sobre el punitorio', () => {
  const sep = calcularDeudas({ periodo: '2026-08', montoDelMesCents: pesos(1000), pagada: false, deudas: [] }, '2026-09', 10);
  const oct = calcularDeudas({ periodo: '2026-09', montoDelMesCents: 0, pagada: false, deudas: sep }, '2026-10', 10);
  // 1000 × (1 + 2 × 10%) = 1200, no 1000 × 1,1 × 1,1 = 1210.
  assert.equal(oct[0].totalCents, pesos(1200));
});

test('al pagar el mes, la deuda arrastrada se cancela', () => {
  const l = calcularLiquidacion({
    ...base, contrato: contrato(100000), expensasPct: 25,
    anterior: { periodo: '2026-08', montoDelMesCents: pesos(100000), pagada: true, deudas: [{ periodo: '2026-07', montoCents: pesos(100000) }] },
  });
  assert.equal(l.saldoAnteriorCents, 0);
  assert.equal(l.interesMoraCents, 0);
  assert.equal(l.detalle.deudas.length, 0);
});

test('la liquidación suma la deuda anterior y su punitorio', () => {
  const l = calcularLiquidacion({
    ...base, contrato: contrato(100000), expensasPct: 25,
    anterior: { periodo: '2026-08', montoDelMesCents: pesos(100750), pagada: false, deudas: [] },
  });
  assert.equal(l.saldoAnteriorCents, pesos(100750));
  assert.equal(l.interesMoraCents, pesos(5037.5));
  assert.equal(l.totalCents, pesos(100750) + pesos(100750) + pesos(5037.5));
});

test('el monto del mes incluye el ajuste y excluye la deuda previa', () => {
  const liq = {
    alquilerFijoCents: pesos(1000), variableCents: 0, expensasCents: pesos(200),
    saldoAnteriorCents: pesos(500), interesMoraCents: pesos(25),
  };
  assert.equal(montoDelMesCents(liq, { tipo: 'descuento', montoCents: pesos(50) }), pesos(1150));
  assert.equal(montoDelMesCents(liq, { tipo: 'cargo', montoCents: pesos(50) }), pesos(1250));
  assert.equal(totalConAjusteCents(liq, null), pesos(1725));
});
