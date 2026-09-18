function fmtMoney(n){ return '$ ' + Number(n).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function tieneMasDeDosDecimales(n){ return Math.abs(n*100 - Math.round(n*100)) > 1e-6; }
