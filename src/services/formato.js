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

// Período con el que arranca cada galería (el prototipo mostraba agosto 2026).
// Después, el período abierto vive en la config de la galería y avanza con
// cada cierre del mes.
const PERIODO_INICIAL = '2026-08';

/** '2026-11' + 3 -> '2027-02' */
/**
 * Último día de vigencia de un contrato: inicio + plazo, menos un día.
 * '2025-03-01' + 24 meses -> '2027-02-28'. Null si falta el inicio o el plazo.
 */
function finDeContrato(inicio, plazoMeses) {
  if (!inicio || !(plazoMeses > 0)) return null;
  const [a, m, d] = String(inicio).slice(0, 10).split('-').map(Number);

  /*
   * El día se recorta al último del mes destino, si no un contrato que arranca
   * el 31/01 se desbordaría a marzo. Date en UTC para no correr un día por la
   * zona horaria.
   */
  const destino = new Date(Date.UTC(a, (m - 1) + Number(plazoMeses), 1));
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  const fin = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth(), Math.min(d, ultimoDia)));
  fin.setUTCDate(fin.getUTCDate() - 1);
  return fin.toISOString().slice(0, 10);
}

function sumarMeses(periodo, n) {
  const [anio, mes] = String(periodo).split('-').map(Number);
  const total = anio * 12 + (mes - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Meses de '2026-08' a '2026-10' -> 2 */
function mesesEntre(desde, hasta) {
  const [a1, m1] = String(desde).split('-').map(Number);
  const [a2, m2] = String(hasta).split('-').map(Number);
  return (a2 * 12 + m2) - (a1 * 12 + m1);
}

const MESES_FRECUENCIA = { Trimestral: 3, Cuatrimestral: 4, Semestral: 6, Anual: 12 };

/** 'Trimestral' -> 3. Lo que no se reconoce cuenta como trimestral. */
function mesesDeFrecuencia(frecuencia) {
  return MESES_FRECUENCIA[frecuencia] || 3;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** '2026-08' -> 'Agosto 2026' */
function periodoLabel(periodo) {
  const [anio, mes] = periodo.split('-');
  return `${MESES[Number(mes) - 1]} ${anio}`;
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** 'ICL · Sep 2026' | 'Sep 2026' -> '2026-09', o null si no trae un mes. */
function periodoDeTexto(texto) {
  const m = /(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)\w*\s+(\d{4})/.exec(String(texto || ''));
  if (!m) return null;
  return `${m[2]}-${String(MESES_CORTOS.indexOf(m[1]) + 1).padStart(2, '0')}`;
}

/** '2026-09' -> 'Sep 2026' */
function periodoCorto(periodo) {
  const [anio, mes] = String(periodo).split('-');
  return `${MESES_CORTOS[Number(mes) - 1]} ${anio}`;
}

/** '2026-06-30' -> 'Jun 2026' */
function fechaCorta(fecha) {
  if (!fecha) return '';
  const [anio, mes] = String(fecha).split('-');
  return `${MESES_CORTOS[Number(mes) - 1]} ${anio}`;
}

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Date -> '03/10/2026 19:49', en hora de Argentina (el server de Render corre en UTC). */
function fechaHora(fecha) {
  if (!fecha) return '';
  const p = {};
  FORMATO_FECHA_HORA.formatToParts(new Date(fecha)).forEach(({ type, value }) => { p[type] = value; });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

module.exports = {
  centsToMoney, parseMoneyCents, tieneMasDeDosDecimales,
  PERIODO_INICIAL, periodoLabel, periodoCorto, fechaCorta, fechaHora,
  sumarMeses, mesesEntre, mesesDeFrecuencia, periodoDeTexto, finDeContrato,
};
