/* ---------- Init ---------- */
/*
 * El estado inicial viaja embebido en el HTML (window.__ESTADO__), así que la
 * primera pintada no necesita ningún fetch. A partir de ahí, cada cambio pasa
 * por la API y vuelve con recargarEstado().
 */
aplicarEstado(window.__ESTADO__ || {});
renderTodo();
refrescarGalerias();

// Deja seleccionado el primer local con contrato, como hacía el prototipo.
const primerOcupado = units.findIndex((u) => u.st !== 'free');
if (primerOcupado >= 0) selectUnit(primerOcupado);
