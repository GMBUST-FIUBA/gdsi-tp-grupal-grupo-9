/* ---------- Estado del navegador ---------- */
/*
 * Antes estos datos venían escritos a mano en js/data/. Ahora llegan del
 * servidor: la primera carga viaja embebida en el HTML (window.__ESTADO__) y
 * después de cada cambio se vuelven a pedir con recargarEstado().
 */

let units = [];
let gastos = [];
let proveedores = [];
let ajustesExpensas = {};   // { '04': {tipo, montoCents, motivo} }
let expensasPct = {};       // { '04': 12.5 }
let configGaleria = null;
let galeriaActual = null;

let selectedIdx = null;

const stLabel = { ok: 'Al día', warn: 'Por vencer', late: 'En mora', free: 'Libre' };
const stPill = { ok: 'ok', warn: 'warn', late: 'late', free: 'free' };

const tiposFactura = ['Factura A', 'Factura B', 'Factura C', 'Recibo', 'Ticket'];

function aplicarEstado(e) {
  units = e.units || [];
  gastos = e.gastos || [];
  proveedores = e.proveedores || [];
  ajustesExpensas = e.ajustes || {};
  expensasPct = e.porcentajes || {};
  configGaleria = e.config || null;
  galeriaActual = e.galeria || null;
}

/** Vuelve a pedir todo al servidor y redibuja la pantalla. */
async function recargarEstado() {
  const e = await apiLeer('/api/estado');
  if (e && e.units) {
    aplicarEstado(e);
    renderTodo();
  }
}

/**
 * Redibuja las secciones presentes en la página. Según el rol, el servidor
 * manda solo algunas vistas, así que cada bloque chequea que exista.
 */
function renderTodo() {
  if (document.getElementById('view-admin')) {
    renderKpis();
    renderPlan();
    renderCobranzas();
    renderAbm();
    renderAccounts();
    refreshNotif();
    fillProveedorSelect();
    renderGastos();
    fillConfigUnidades();
    renderConfig();
    fillAjusteUnidades();
    renderAjustes();
    fillLocalesLibres();
    renderRendicion();
    renderHistorial();

    // Mantiene seleccionado el mismo local después de recargar.
    if (selectedIdx !== null && units[selectedIdx]) selectUnit(selectedIdx);
  }
  if (document.getElementById('view-tenant')) {
    renderGastosTenant();
  }
}

/* ---------- Ajustes de expensas (se calculan en el navegador) ---------- */

function ajusteDeltaCents(n) {
  const a = ajustesExpensas[n];
  if (!a) return 0;
  return a.tipo === 'descuento' ? -a.montoCents : a.montoCents;
}
function expensasEfectivasCents(u) { return u.expCents + ajusteDeltaCents(u.n); }
function totalEfectivoCents(u) { return u.totCents + ajusteDeltaCents(u.n); }
