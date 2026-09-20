function fmtMoney(n) {
  return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function tieneMasDeDosDecimales(n) { return Math.abs(n * 100 - Math.round(n * 100)) > 1e-6; }

function parseMoneyCents(s) {
  const t = String(s).replace(/[$\s.]/g, '').replace(',', '.');
  return /^-?\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : NaN;
}
function centsToMoney(c) { return fmtMoney(Number(c) / 100); }

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** '2026-08' -> 'Agosto 2026' */
function periodoLabel(periodo) {
  const [anio, mes] = String(periodo).split('-');
  return `${MESES[Number(mes) - 1]} ${anio}`;
}
