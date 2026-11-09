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
let configComplejo = null;
let complejoActual = null;
let periodoActual = window.__PERIODO__ || null;

let selectedIdx = null;

const stLabel = { ok: 'Al día', warn: 'Por vencer', late: 'En mora', free: 'Libre' };
const stPill = { ok: 'ok', warn: 'warn', late: 'late', free: 'free' };

const tiposFactura = ['Factura A', 'Factura B', 'Factura C', 'Recibo', 'Ticket'];

/*
 * Cómo se llaman las cosas en este rubro ("Local" en una galería, "Depósito"
 * en un parque). Arranca con el vocabulario de galería y se reemplaza con el
 * que manda el servidor en cuanto llega el estado.
 */
let voc = {
  complejo: 'Complejo', complejos: 'Complejos', complejoMin: 'complejo', complejosMin: 'complejos',
  unidad: 'Unidad', unidades: 'Unidades', unidadMin: 'unidad', unidadesMin: 'unidades',
  ocupante: 'Locatario', ocupantes: 'Locatarios', ocupanteMin: 'locatario', ocupantesMin: 'locatarios',
  plano: 'Plano',
};

function aplicarEstado(e) {
  units = e.units || [];
  gastos = e.gastos || [];
  proveedores = e.proveedores || [];
  ajustesExpensas = e.ajustes || {};
  expensasPct = e.porcentajes || {};
  configComplejo = e.config || null;
  complejoActual = e.complejo || null;
  if (complejoActual && complejoActual.vocabulario) voc = complejoActual.vocabulario;
  if (e.periodo) periodoActual = e.periodo;
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
    renderUnidades();
    fillConfigUnidades();
    renderConfig();
    fillAjusteUnidades();
    renderAjustes();
    fillUnidadesLibres();
    renderContratos();
    cargarDuenos();
    renderHistorial();
    renderCuenta();

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
