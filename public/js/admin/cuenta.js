/* ---------- Estado de cuenta y cierre del mes ("Liquidar expensas") ---------- */
/*
 * La pestaña muestra el mes abierto: saldo anterior, gastos, ingresos (pagos
 * aceptados) y saldo. "Liquidar expensas" abre la vista previa de lo que va a
 * pagar cada local el mes siguiente; "Confirmar" cierra el mes en el servidor.
 */
let cuenta = null;          // lo último que devolvió /api/cuenta
let liqPreview = null;      // lo último que devolvió /api/cierres/preview
const liqAumentos = {};     // { 'ICL (BCRA)': '12' } lo que va tipeando el admin

const NUMEROS = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];

/** '$ 1.000 y $ 2.000' / '$ 1.000, $ 2.000 y $ 3.000' */
function listarMontos(items) {
  const m = items.map((g) => centsToMoney(g.montoCents));
  return m.length > 1 ? `${m.slice(0, -1).join(', ')} y ${m[m.length - 1]}` : m[0];
}

/** 'un gasto ordinario de $ 1.000' / 'dos gastos ordinarios de $ 1.000 y $ 2.000' */
function describirGastos(items, tipo) {
  const n = items.length;
  const cuantos = NUMEROS[n] || String(n);
  return n === 1
    ? `un gasto ${tipo} de ${listarMontos(items)}`
    : `${cuantos} gastos ${tipo}s de ${listarMontos(items)}`;
}

/** La frase del resumen: 'Los gastos en total fueron $ 3.000: un gasto ordinario...' */
function fraseGastos(r) {
  const ord = r.gastos.ordinarios.items;
  const ext = r.gastos.extraordinarios.items;
  if (!ord.length && !ext.length) return 'No hubo gastos en el mes.';
  const partes = [];
  if (ord.length) partes.push(describirGastos(ord, 'ordinario'));
  if (ext.length) partes.push(describirGastos(ext, 'extraordinario'));
  return `Los gastos en total fueron ${centsToMoney(r.gastos.totalCents)}: ${partes.join(' y ')}.`;
}

function fraseIngresos(r) {
  const n = r.ingresos.items.length;
  if (!n) return 'No hubo ingresos en el mes.';
  return `Los ingresos en total fueron ${centsToMoney(r.ingresos.totalCents)} ${n === 1 ? 'por un solo ingreso' : `por ${n} ingresos`}.`;
}

/** Saldo anterior / ingresos / gastos / saldo, con el formato de la rendición. */
function lineasResumen(r) {
  const ord = r.gastos.ordinarios;
  const ext = r.gastos.extraordinarios;
  return `
    <div class="line"><div class="lbl">Saldo anterior</div><div class="val">${centsToMoney(r.saldoAnteriorCents)}</div></div>
    <div class="line"><div class="lbl">Ingresos <small>${fraseIngresos(r)}</small></div><div class="val">+ ${centsToMoney(r.ingresos.totalCents)}</div></div>
    <div class="line neg"><div class="lbl">Gastos <small>Ordinarios ${centsToMoney(ord.totalCents)} (${ord.items.length}) · Extraordinarios ${centsToMoney(ext.totalCents)} (${ext.items.length})</small></div><div class="val">− ${centsToMoney(r.gastos.totalCents)}</div></div>
    <div class="line net"><div class="lbl">Quedan en la cuenta</div><div class="val">${centsToMoney(r.saldoFinalCents)}</div></div>`;
}

function tablaGastosCuenta(titulo, bloque) {
  if (!bloque.items.length) {
    return `<div class="line"><div class="lbl">${titulo} <small>Sin gastos</small></div><div class="val">${centsToMoney(0)}</div></div>`;
  }
  return `
    <div class="line"><div class="lbl">${titulo} <small>${bloque.items.length === 1 ? '1 gasto' : bloque.items.length + ' gastos'}</small></div><div class="val">${centsToMoney(bloque.totalCents)}</div></div>
    <table class="data" style="margin:-4px 0 6px">
      <tbody>${bloque.items.map((g) => `
        <tr><td>${escaparHTML(g.proveedor)}</td><td>${escaparHTML(g.descripcion || '—')}</td><td class="r mono">${centsToMoney(g.montoCents)}</td></tr>`).join('')}
      </tbody>
    </table>`;
}

async function renderCuenta() {
  if (!document.getElementById('sec-cuenta')) return;
  const r = await apiLeer('/api/cuenta');
  if (!r || r.ok === false) {
    document.getElementById('cta-resumen').innerHTML = '<div class="empty">No se pudo leer el estado de cuenta.</div>';
    return;
  }
  cuenta = r;

  document.getElementById('cta-ant').textContent = centsToMoney(r.saldoAnteriorCents);
  document.getElementById('cta-ant-foot').textContent = r.cierres.length
    ? `Saldo final de ${periodoLabel(r.cierres[0].periodo)}`
    : 'Saldo inicial de la cuenta';
  document.getElementById('cta-gastos').textContent = centsToMoney(r.gastos.totalCents);
  document.getElementById('cta-gastos-foot').textContent =
    `Ordinarios ${centsToMoney(r.gastos.ordinarios.totalCents)} · Extraordinarios ${centsToMoney(r.gastos.extraordinarios.totalCents)}`;
  document.getElementById('cta-ing').textContent = centsToMoney(r.ingresos.totalCents);
  document.getElementById('cta-ing-foot').textContent =
    r.ingresos.items.length === 1 ? '1 pago aceptado' : `${r.ingresos.items.length} pagos aceptados`;
  document.getElementById('cta-saldo').textContent = centsToMoney(r.saldoFinalCents);

  // Desglose de gastos
  document.getElementById('cta-gastos-sub').textContent =
    `${r.gastos.ordinarios.items.length + r.gastos.extraordinarios.items.length} cargados`;
  document.getElementById('cta-gastos-body').innerHTML = `<div class="rend">
    ${tablaGastosCuenta('Ordinarios', r.gastos.ordinarios)}
    ${tablaGastosCuenta('Extraordinarios', r.gastos.extraordinarios)}
    <div class="line net"><div class="lbl">Total de gastos</div><div class="val">${centsToMoney(r.gastos.totalCents)}</div></div>
  </div>`;

  // Desglose de ingresos
  document.getElementById('cta-ing-body').innerHTML = r.ingresos.items.length
    ? `<table class="data"><tbody>${r.ingresos.items.map((i) => `
        <tr><td>Local ${escaparHTML(i.localNumero)}</td><td>${escaparHTML(i.locatario)}</td><td class="r mono">${centsToMoney(i.montoCents)}</td></tr>`).join('')}
       </tbody></table>
       <div class="rend" style="margin-top:10px"><div class="line net"><div class="lbl">Total de ingresos</div><div class="val">${centsToMoney(r.ingresos.totalCents)}</div></div></div>`
    : '<div class="empty">Todavía no se aceptó ningún pago este mes.</div>';

  document.getElementById('cta-resumen').innerHTML = lineasResumen(r);
  renderSaldoInicial(r);
  renderCierres(r);

  // Si la vista previa está abierta, se rehace con los datos nuevos.
  if (!document.getElementById('liq-panel').hidden) recalcularPreview();
}

function renderSaldoInicial(r) {
  const box = document.getElementById('cta-saldo-inicial');
  if (!r.puedeEditarSaldoInicial) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="form-grid" style="margin-top:16px">
      <div class="field"><label for="cta-si">Saldo inicial de la cuenta</label>
        <input id="cta-si" value="${centsToMoney(r.saldoInicialCents)}">
        <span class="hint">Lo que tenía la cuenta antes del primer cierre. Después del primer cierre ya no se puede cambiar.</span></div>
    </div>
    <div class="note late" id="cta-si-err" hidden></div>
    <div class="form-actions"><button class="btn btn-ghost btn-sm" onclick="guardarSaldoInicial()">Guardar saldo inicial</button></div>`;
}

async function guardarSaldoInicial() {
  const saldo = document.getElementById('cta-si').value;
  if (Number.isNaN(parseMoneyCents(saldo))) return mostrarError('cta-si-err', 'Ingresá un saldo inicial válido.');
  const r = await apiEnviar('PUT', '/api/cuenta/saldo-inicial', { saldo });
  if (!r.ok) return mostrarError('cta-si-err', r.msg);
  await renderCuenta();
  toast('Saldo inicial guardado');
}

function renderCierres(r) {
  const box = document.getElementById('cta-cierres');
  document.getElementById('cta-cierres-count').textContent = r.cierres.length
    ? (r.cierres.length === 1 ? '1 mes cerrado' : `${r.cierres.length} meses cerrados`)
    : '';
  if (!r.cierres.length) {
    box.innerHTML = '<div class="empty">Todavía no se liquidó ningún mes.</div>';
    return;
  }
  box.innerHTML = `<table class="data">
    <thead><tr><th>Período</th><th class="r">Saldo anterior</th><th class="r">Ingresos</th><th class="r">Gastos</th><th class="r">Saldo final</th><th class="r"></th></tr></thead>
    <tbody>${r.cierres.map((c) => `
      <tr>
        <td>${periodoLabel(c.periodo)}</td>
        <td class="r mono">${centsToMoney(c.saldoAnteriorCents)}</td>
        <td class="r mono">${centsToMoney(c.ingresosCents)}</td>
        <td class="r mono">${centsToMoney(c.gastosOrdinariosCents + c.gastosExtraordinariosCents)}</td>
        <td class="r mono">${centsToMoney(c.saldoFinalCents)}</td>
        <td class="r"><a class="btn btn-ghost btn-sm" href="/api/cierres/${c.id}/pdf">Descargar PDF</a></td>
      </tr>`).join('')}
    </tbody></table>`;
}

/* ---------- Vista previa y confirmación ---------- */

async function abrirLiquidar() {
  document.getElementById('liq-panel').hidden = false;
  mostrarError('liq-err', null);
  await recalcularPreview();
  document.getElementById('liq-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cerrarLiquidar() {
  document.getElementById('liq-panel').hidden = true;
  mostrarError('liq-err', null);
}

let previewTimer = null;
function cambiarAumento(indice, valor) {
  liqAumentos[indice] = valor;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(recalcularPreview, 350);
}

async function recalcularPreview() {
  const r = await apiEnviar('POST', '/api/cierres/preview', { aumentos: liqAumentos });
  const boton = document.getElementById('liq-confirmar');
  if (!r.ok) {
    boton.disabled = true;
    return mostrarError('liq-err', r.msg);
  }
  mostrarError('liq-err', null);
  liqPreview = r;
  const nuevo = periodoLabel(r.periodoNuevo);

  document.getElementById('liq-sub').textContent = `Se emite ${nuevo}`;
  document.getElementById('liq-resumen').innerHTML = `
    <div class="note" style="margin:0 0 4px">${fraseGastos(r.resumen)} ${fraseIngresos(r.resumen)} En la cuenta quedan <strong>${centsToMoney(r.resumen.saldoFinalCents)}</strong>.</div>
    ${lineasResumen(r.resumen)}`;

  renderAumentosPedidos(r);

  document.getElementById('liq-avisos').innerHTML = [
    ...r.bloqueos.map((m) => `<div class="note late">${escaparHTML(m)}</div>`),
    ...r.avisos.map((m) => `<div class="note rev">${escaparHTML(m)}</div>`),
  ].join('');

  document.getElementById('liq-tabla-titulo').textContent = `Lo que paga cada local en ${nuevo}`;
  const rows = document.getElementById('liq-rows');
  if (!r.filas.length) {
    rows.innerHTML = '<tr><td colspan="7">No hay locales con contrato vigente.</td></tr>';
  } else {
    const tot = (k) => r.filas.reduce((a, f) => a + f[k], 0);
    rows.innerHTML = r.filas.map(filaPreview).join('') + `
      <tr><td colspan="2"><strong>Total</strong></td>
        <td class="r mono"><strong>${centsToMoney(tot('alquilerFijoCents'))}</strong></td>
        <td class="r mono"><strong>${centsToMoney(tot('expensasCents'))}</strong></td>
        <td class="r mono"><strong>${centsToMoney(tot('saldoAnteriorCents'))}</strong></td>
        <td class="r mono"><strong>${centsToMoney(tot('interesMoraCents'))}</strong></td>
        <td class="r mono"><strong>${centsToMoney(tot('totalCents'))}</strong></td></tr>`;
  }
  boton.disabled = !r.puedeConfirmar;
}

function filaPreview(f) {
  const chico = (t) => `<div style="color:var(--muted);font-size:.74rem;font-family:'Instrument Sans'">${t}</div>`;
  const a = f.aumento;
  const alquilerNota = a
    ? chico(a.falta ? `Se actualiza por ${escaparHTML(a.indice)}: falta el %` : `+${fmtPct(a.pct)} ${escaparHTML(a.indice)}`)
    : '';
  const pct = f.detalle.expensas.pct;
  const expNota = chico(pct === null ? 'Sin % asignado' : `${fmtPct(pct)} de ${centsToMoney(f.detalle.expensas.gastosTotalCents)}`);
  const deudaNota = f.detalle.deudas.map((d) =>
    chico(`${periodoLabel(d.periodo)}: ${centsToMoney(d.montoCents)} · ${d.meses === 1 ? '1 mes' : d.meses + ' meses'}`)).join('');
  return `<tr>
    <td>${escaparHTML(f.numero)}</td>
    <td>${escaparHTML(f.locatario)}</td>
    <td class="r mono">${centsToMoney(f.alquilerFijoCents)}${alquilerNota}</td>
    <td class="r mono">${centsToMoney(f.expensasCents)}${expNota}</td>
    <td class="r mono">${centsToMoney(f.saldoAnteriorCents)}${deudaNota}</td>
    <td class="r mono">${centsToMoney(f.interesMoraCents)}</td>
    <td class="r mono"><strong>${centsToMoney(f.totalCents)}</strong></td>
  </tr>`;
}

/** Un campo de % por cada índice que tiene contratos para actualizar el mes que viene. */
function renderAumentosPedidos(r) {
  const box = document.getElementById('liq-aumentos');
  if (!r.aumentos.length) { box.innerHTML = ''; return; }
  // No se pisa el campo que se está editando: solo se dibuja la primera vez o si cambian los índices.
  const clave = r.aumentos.map((a) => a.indice + ':' + a.locales.join(',')).join('|');
  if (box.dataset.clave === clave) return;
  box.dataset.clave = clave;
  box.innerHTML = `
    <h3 style="margin:20px 0 6px;font-size:1rem">Actualización de alquileres · ${periodoLabel(r.periodoNuevo)}</h3>
    <p style="margin:0 0 10px;color:var(--muted);font-size:.85rem">Estos contratos se actualizan el mes que viene. Ingresá la variación del índice del período.</p>
    <div class="form-grid">${r.aumentos.map((a, i) => `
      <div class="field"><label for="liq-aum-${i}">Variación ${escaparHTML(a.indice)}</label>
        <div class="suffix-wrap"><input id="liq-aum-${i}" inputmode="decimal" placeholder="0,00" value="${escaparHTML(liqAumentos[a.indice] || '')}"
          data-indice="${escaparHTML(a.indice)}" oninput="cambiarAumento(this.dataset.indice, this.value)"><span class="sfx">%</span></div>
        <span class="hint">Locales ${a.locales.join(', ')}</span></div>`).join('')}
    </div>`;
}

async function confirmarCierre() {
  const boton = document.getElementById('liq-confirmar');
  boton.disabled = true;
  if (!liqPreview) return;
  const r = await apiEnviar('POST', '/api/cierres', { aumentos: liqAumentos, periodo: liqPreview.periodo });
  if (!r.ok) {
    boton.disabled = false;
    return mostrarError('liq-err', r.msg);
  }
  // Baja el PDF del cierre y recarga: el período nuevo se pinta en el servidor.
  const a = document.createElement('a');
  a.href = `/api/cierres/${r.cierreId}/pdf`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(`Mes liquidado · ahora se trabaja sobre ${periodoLabel(r.periodoNuevo)}`);
  setTimeout(() => window.location.reload(), 1200);
}

/* ---------- Cuenta corriente de un local (desde el detalle) ---------- */

/** Tabla de cuenta corriente. La usa el admin; el locatario la ve armada en el servidor. */
function tablaCuentaCorriente(filas) {
  if (!filas.length) return '<div class="empty">Todavía no hay liquidaciones.</div>';
  return `<div style="overflow-x:auto"><table class="data">
    <thead><tr><th>Período</th><th class="r">Del mes</th><th class="r">Deuda ant.</th><th class="r">Total</th><th class="r">Pagado</th><th class="r">Estado</th><th></th></tr></thead>
    <tbody>${filas.map((f) => `
      <tr>
        <td>${periodoLabel(f.periodo)}</td>
        <td class="r mono">${centsToMoney(f.delMesCents)}</td>
        <td class="r mono">${centsToMoney(f.deudaAnteriorCents)}</td>
        <td class="r mono">${centsToMoney(f.totalCents)}</td>
        <td class="r mono">${centsToMoney(f.cobradoCents)}</td>
        <td class="r">${estadoCuentaTag(f)}</td>
        <td class="r"><a class="btn btn-ghost btn-sm" href="/api/liquidaciones/${f.id}/pdf">PDF</a></td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

function estadoCuentaTag(f) {
  if (f.cobradoCents >= f.totalCents && f.totalCents > 0) return '<span class="st-tag pagado">Pagado</span>';
  if (f.trasladada) return '<span class="st-tag mora">Impago · pasó al mes siguiente</span>';
  if (f.estado === 'en_revision') return '<span class="st-tag pend">En revisión</span>';
  return '<span class="st-tag pend">Pendiente</span>';
}

async function verCuentaCorriente(i) {
  const u = units[i];
  const r = await apiLeer(`/api/locales/${u.n}/cuenta-corriente`);
  if (!r || r.ok === false) return toast('No se pudo leer la cuenta corriente');
  openModal(`Cuenta corriente — Local ${u.n} · ${u.loc}`, tablaCuentaCorriente(r.filas),
    [{ label: 'Cerrar', cls: 'btn-ghost', fn: closeModal }], { ancho: true });
}
