/* ---------- Init ---------- */
/*
 * El estado inicial viaja embebido en el HTML (window.__ESTADO__), así que la
 * primera pintada no necesita ningún fetch. A partir de ahí, cada cambio pasa
 * por la API y vuelve con recargarEstado().
 */
aplicarEstado(window.__ESTADO__ || {});
renderTodo();
if (document.getElementById('view-super')) refrescarGalerias();

// Deja seleccionado el primer local con contrato, como hacía el prototipo.
if (document.getElementById('view-admin')) {
  const primerOcupado = units.findIndex((u) => u.st !== 'free');
  if (primerOcupado >= 0) selectUnit(primerOcupado);
}
