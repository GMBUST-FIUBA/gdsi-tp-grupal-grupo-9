'use strict';

/** Centavos (entero) -> '$ 1.234.567,89' */
function centsToMoney(c) {
  return '$ ' + (Number(c) / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** '$ 1.234.567,89' | '1234567.89' -> centavos (entero), o NaN si no parsea. */
function parseMoneyCents(s) {
  const t = String(s).replace(/[$\s.]/g, '').replace(',', '.');
  return /^-?\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : NaN;
}

/** Un número tiene más de dos decimales? */
function tieneMasDeDosDecimales(n) {
  return Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;
}

// TODO: el período está fijo en agosto 2026 porque el prototipo mostraba ese mes.
// Cuando exista el cierre mensual, esto tiene que salir de la config de la galería
// (o del mes en curso) y no de una constante.
const PERIODO_ACTUAL = '2026-08';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** '2026-08' -> 'Agosto 2026' */
function periodoLabel(periodo) {
  const [anio, mes] = periodo.split('-');
  return `${MESES[Number(mes) - 1]} ${anio}`;
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** '2026-06-30' -> 'Jun 2026' */
function fechaCorta(fecha) {
  if (!fecha) return '';
  const [anio, mes] = String(fecha).split('-');
  return `${MESES_CORTOS[Number(mes) - 1]} ${anio}`;
}

module.exports = {
  centsToMoney, parseMoneyCents, tieneMasDeDosDecimales,
  PERIODO_ACTUAL, periodoLabel, fechaCorta,
};
