'use strict';
/*
 * PDFs del cierre del mes (para la administración) y de cada liquidación (para
 * el locatario). Se arman al vuelo a partir de la foto guardada en la base, así
 * no dependen del disco de Render.
 *
 * Ojo con los caracteres: las fuentes estándar de PDF solo cubren Latin-1, así
 * que el signo menos va como '-' y no como '−'.
 */
const PDFDocument = require('pdfkit');
const { centsToMoney, periodoLabel, fechaHora } = require('./formato');

const MARGEN = 50;
const ANCHO = 595.28 - MARGEN * 2; // A4
const GRIS = '#666666';
const LINEA = '#cccccc';

function fmtPct(n) {
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

function nuevoDoc(titulo) {
  return new PDFDocument({ size: 'A4', margin: MARGEN, info: { Title: titulo, Producer: 'Galex' } });
}

function saltoSiHaceFalta(doc, alto = 40) {
  if (doc.y + alto > doc.page.height - MARGEN) doc.addPage();
}

function encabezado(doc, galeria, titulo, subtitulo) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GRIS)
    .text(`GALEX · ${galeria.nombre}${galeria.direccion ? ' · ' + galeria.direccion : ''}`.toUpperCase());
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(18).fillColor('black').text(titulo);
  if (subtitulo) doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(subtitulo);
  doc.moveDown(0.8);
  linea(doc);
}

function linea(doc) {
  doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO, doc.y).strokeColor(LINEA).lineWidth(0.5).stroke();
  doc.moveDown(0.5);
}

function seccion(doc, texto) {
  saltoSiHaceFalta(doc, 60);
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('black').text(texto, MARGEN, doc.y);
  doc.moveDown(0.3);
}

/** Renglón de dos columnas: concepto a la izquierda, importe a la derecha. */
function renglon(doc, concepto, importe, { negrita = false, gris = false, sangria = 0, tam = 10 } = {}) {
  saltoSiHaceFalta(doc, 18);
  const y = doc.y;
  const fuente = negrita ? 'Helvetica-Bold' : 'Helvetica';
  doc.font(fuente).fontSize(tam).fillColor(gris ? GRIS : 'black');
  doc.text(concepto, MARGEN + sangria, y, { width: ANCHO - 130 - sangria });
  const yFin = doc.y;
  if (importe !== undefined && importe !== null) {
    doc.text(importe, MARGEN + ANCHO - 130, y, { width: 130, align: 'right' });
  }
  doc.y = Math.max(yFin, doc.y);
  doc.x = MARGEN;
  doc.moveDown(0.15);
}

/** Tabla simple. columnas: [{ titulo, ancho, align }], filas: [[texto, ...]]. */
function tabla(doc, columnas, filas, { totales } = {}) {
  const dibujarFila = (celdas, { negrita = false, cabecera = false } = {}) => {
    saltoSiHaceFalta(doc, 20);
    const y = doc.y;
    let x = MARGEN;
    let alto = 0;
    doc.font(negrita || cabecera ? 'Helvetica-Bold' : 'Helvetica').fontSize(cabecera ? 8 : 9)
      .fillColor(cabecera ? GRIS : 'black');
    celdas.forEach((c, i) => {
      const col = columnas[i];
      const h = doc.heightOfString(String(c), { width: col.ancho - 6 });
      doc.text(String(c), x + 3, y, { width: col.ancho - 6, align: col.align || 'left' });
      alto = Math.max(alto, h);
      x += col.ancho;
    });
    doc.y = y + alto + 4;
    doc.x = MARGEN;
    if (cabecera) linea(doc);
  };
  dibujarFila(columnas.map((c) => c.titulo.toUpperCase()), { cabecera: true });
  filas.forEach((f) => dibujarFila(f));
  if (totales) {
    linea(doc);
    dibujarFila(totales, { negrita: true });
  }
  doc.moveDown(0.3);
}

function pie(doc, texto) {
  doc.moveDown(1.2);
  saltoSiHaceFalta(doc, 30);
  doc.font('Helvetica').fontSize(8).fillColor(GRIS).text(texto, MARGEN, doc.y, { width: ANCHO });
}

const tipoGasto = (t) => (t === 'extraordinario' ? 'Extraordinario' : 'Ordinario');

/* ------------------------------------------------------------------ */

/** Resumen del mes cerrado: saldo anterior, gastos, ingresos, saldo final. */
function pdfCierre(cierre, galeria) {
  const det = cierre.detalle || {};
  const gastos = det.gastos || [];
  const ingresos = det.ingresos || [];
  const ordinarios = gastos.filter((g) => g.tipo !== 'extraordinario');
  const extraordinarios = gastos.filter((g) => g.tipo === 'extraordinario');
  const gastosTotal = cierre.gastosOrdinariosCents + cierre.gastosExtraordinariosCents;

  const doc = nuevoDoc(`Liquidación de expensas ${periodoLabel(cierre.periodo)}`);
  encabezado(doc, galeria, `Liquidación de expensas · ${periodoLabel(cierre.periodo)}`,
    `Cierre del mes confirmado el ${fechaHora(cierre.fechaCierre)}`);

  seccion(doc, 'Estado de cuenta');
  renglon(doc, 'Saldo anterior', centsToMoney(cierre.saldoAnteriorCents));
  renglon(doc, `Ingresos (${ingresos.length === 1 ? '1 ingreso' : `${ingresos.length} ingresos`})`, '+ ' + centsToMoney(cierre.ingresosCents));
  renglon(doc, `Gastos (${gastos.length === 1 ? '1 gasto' : `${gastos.length} gastos`})`, '- ' + centsToMoney(gastosTotal));
  renglon(doc, `Ordinarios (${ordinarios.length})`, centsToMoney(cierre.gastosOrdinariosCents), { gris: true, sangria: 14 });
  renglon(doc, `Extraordinarios (${extraordinarios.length})`, centsToMoney(cierre.gastosExtraordinariosCents), { gris: true, sangria: 14 });
  linea(doc);
  renglon(doc, 'Saldo en la cuenta', centsToMoney(cierre.saldoFinalCents), { negrita: true, tam: 12 });

  const colsGasto = [
    { titulo: 'Proveedor', ancho: 110 },
    { titulo: 'Descripción', ancho: 175 },
    { titulo: 'Factura', ancho: 120 },
    { titulo: 'Monto', ancho: ANCHO - 405, align: 'right' },
  ];
  const filaGasto = (g) => [g.proveedor, g.descripcion || '—', g.factura || '—', centsToMoney(g.montoCents)];

  seccion(doc, 'Gastos ordinarios');
  if (ordinarios.length) {
    tabla(doc, colsGasto, ordinarios.map(filaGasto), { totales: ['Total ordinarios', '', '', centsToMoney(cierre.gastosOrdinariosCents)] });
  } else renglon(doc, 'Sin gastos ordinarios.', null, { gris: true });

  seccion(doc, 'Gastos extraordinarios');
  if (extraordinarios.length) {
    tabla(doc, colsGasto, extraordinarios.map(filaGasto), { totales: ['Total extraordinarios', '', '', centsToMoney(cierre.gastosExtraordinariosCents)] });
  } else renglon(doc, 'Sin gastos extraordinarios.', null, { gris: true });

  seccion(doc, 'Ingresos');
  if (ingresos.length) {
    tabla(doc, [
      { titulo: 'Local', ancho: 60 },
      { titulo: 'Locatario', ancho: 300 },
      { titulo: 'Cobrado', ancho: ANCHO - 360, align: 'right' },
    ], ingresos.map((i) => [i.localNumero, i.locatario, centsToMoney(i.montoCents)]),
    { totales: ['Total', '', centsToMoney(cierre.ingresosCents)] });
  } else renglon(doc, 'Sin ingresos en el mes.', null, { gris: true });

  const aumentos = det.aumentos || [];
  if (aumentos.length) {
    seccion(doc, 'Actualizaciones de alquiler aplicadas');
    tabla(doc, [
      { titulo: 'Local', ancho: 50 },
      { titulo: 'Locatario', ancho: 160 },
      { titulo: 'Índice', ancho: 90 },
      { titulo: 'Antes', ancho: 75, align: 'right' },
      { titulo: 'Aumento', ancho: 50, align: 'right' },
      { titulo: 'Ahora', ancho: ANCHO - 425, align: 'right' },
    ], aumentos.map((a) => [a.numero, a.locatario, a.indice, centsToMoney(a.baseCents), fmtPct(a.pct), centsToMoney(a.nuevoCents)]));
  }

  const liqs = det.liquidaciones || [];
  if (liqs.length) {
    seccion(doc, 'Liquidaciones emitidas para el mes siguiente');
    tabla(doc, [
      { titulo: 'Local', ancho: 40 },
      { titulo: 'Locatario', ancho: 120 },
      { titulo: 'Alquiler', ancho: 70, align: 'right' },
      { titulo: 'Expensas', ancho: 65, align: 'right' },
      { titulo: 'Deuda ant.', ancho: 70, align: 'right' },
      { titulo: 'Punitorios', ancho: 60, align: 'right' },
      { titulo: 'Total', ancho: ANCHO - 425, align: 'right' },
    ], liqs.map((l) => [
      l.numero, l.locatario, centsToMoney(l.alquilerFijoCents), centsToMoney(l.expensasCents),
      centsToMoney(l.saldoAnteriorCents), centsToMoney(l.interesMoraCents), centsToMoney(l.totalCents),
    ]), { totales: ['', 'Total', '', centsToMoney(liqs.reduce((a, l) => a + l.expensasCents, 0)), '', '', centsToMoney(liqs.reduce((a, l) => a + l.totalCents, 0))] });
  }

  pie(doc, 'Saldo en la cuenta = saldo anterior + ingresos - gastos. Los gastos del mes se reparten entre los locales según su porcentaje de expensas y se cobran en la liquidación del mes siguiente.');
  doc.end();
  return doc;
}

/* ------------------------------------------------------------------ */

/**
 * Detalle de lo que paga un local en un período, con las cuentas: alquiler y
 * su actualización, parte de cada gasto, ajuste, meses adeudados y punitorios.
 */
function pdfLiquidacion({ liq, ajuste, local, locatario, contrato, galeria, config }) {
  const det = liq.detalle || null;
  const doc = nuevoDoc(`Liquidación ${periodoLabel(liq.periodo)} · Local ${local.numero}`);
  encabezado(doc, galeria, `Liquidación · ${periodoLabel(liq.periodo)}`,
    `Local ${local.numero} · ${locatario ? locatario.nombre : 'Sin locatario'} · Contrato #C-${String(contrato ? contrato.id : liq.contratoId).padStart(4, '0')}`
    + (config ? ` · Vence el día ${config.diaVencimiento}` : ''));

  // Alquiler
  seccion(doc, 'Alquiler');
  const aumento = det && det.alquiler && det.alquiler.aumento;
  if (aumento && !aumento.falta) {
    renglon(doc, 'Alquiler del contrato', centsToMoney(aumento.baseCents));
    renglon(doc, `Actualización ${aumento.indice}: ${fmtPct(aumento.pct)}`, '+ ' + centsToMoney(aumento.nuevoCents - aumento.baseCents), { gris: true, sangria: 14 });
    renglon(doc, `Próxima actualización: ${aumento.proximaActualizacion}`, null, { gris: true, sangria: 14 });
  }
  renglon(doc, 'Alquiler del mes', centsToMoney(liq.alquilerFijoCents), { negrita: true });
  if (liq.variableCents > 0) {
    renglon(doc, `Variable por % de facturación (sobre ${centsToMoney(liq.facturacionDeclaradaCents)} declarados)`, centsToMoney(liq.variableCents));
  }

  // Expensas
  seccion(doc, 'Expensas');
  const exp = det && det.expensas;
  if (exp) {
    const periodoGastos = det.periodoGastos ? periodoLabel(det.periodoGastos) : 'el mes anterior';
    if (exp.pct === null) {
      renglon(doc, `El local no tiene porcentaje de expensas asignado: no paga expensas de ${periodoGastos}.`, null, { gris: true });
    } else if (!exp.gastos.length) {
      renglon(doc, `No hubo gastos en ${periodoGastos}.`, null, { gris: true });
    } else {
      renglon(doc, `Gastos de ${periodoGastos} repartidos según el porcentaje del local (${fmtPct(exp.pct)}):`, null, { gris: true });
      doc.moveDown(0.2);
      const ord = exp.gastos.filter((g) => g.tipo !== 'extraordinario');
      const ext = exp.gastos.filter((g) => g.tipo === 'extraordinario');
      const suma = (xs, k) => xs.reduce((a, g) => a + g[k], 0);
      const filas = [...ord, ...ext].map((g) => [
        tipoGasto(g.tipo), g.proveedor, g.descripcion || '—', centsToMoney(g.montoCents), centsToMoney(g.parteCents),
      ]);
      tabla(doc, [
        { titulo: 'Tipo', ancho: 80 },
        { titulo: 'Proveedor', ancho: 100 },
        { titulo: 'Descripción', ancho: 145 },
        { titulo: 'Gasto', ancho: 85, align: 'right' },
        { titulo: `Su parte (${fmtPct(exp.pct)})`, ancho: ANCHO - 410, align: 'right' },
      ], filas, { totales: ['Total', '', '', centsToMoney(exp.gastosTotalCents), centsToMoney(exp.totalCents)] });
      if (ord.length && ext.length) {
        renglon(doc, `Ordinarios: ${centsToMoney(suma(ord, 'montoCents'))} -> ${centsToMoney(suma(ord, 'parteCents'))}`, null, { gris: true, sangria: 14 });
        renglon(doc, `Extraordinarios: ${centsToMoney(suma(ext, 'montoCents'))} -> ${centsToMoney(suma(ext, 'parteCents'))}`, null, { gris: true, sangria: 14 });
      }
    }
  }
  renglon(doc, 'Expensas del mes', centsToMoney(liq.expensasCents), { negrita: true });
  if (ajuste) {
    const signo = ajuste.tipo === 'descuento' ? '- ' : '+ ';
    renglon(doc, `${ajuste.tipo === 'descuento' ? 'Descuento' : 'Cargo adicional'}${ajuste.motivo ? ': ' + ajuste.motivo : ''}`, signo + centsToMoney(ajuste.montoCents));
  }

  // Deuda de meses anteriores
  const deudas = (det && det.deudas) || [];
  if (deudas.length || liq.saldoAnteriorCents > 0 || liq.interesMoraCents > 0) {
    seccion(doc, 'Deuda de meses anteriores');
    if (deudas.length) {
      const tasa = det.punitorio ? det.punitorio.tasaPct : 0;
      renglon(doc, `Cada mes impago paga un punitorio de ${fmtPct(tasa)} por cada mes de atraso: monto x (1 + meses x ${fmtPct(tasa)}).`, null, { gris: true });
      doc.moveDown(0.2);
      tabla(doc, [
        { titulo: 'Mes adeudado', ancho: 130 },
        { titulo: 'Monto', ancho: 95, align: 'right' },
        { titulo: 'Atraso', ancho: 70, align: 'right' },
        { titulo: 'Punitorio', ancho: 95, align: 'right' },
        { titulo: 'Debe', ancho: ANCHO - 390, align: 'right' },
      ], deudas.map((dd) => [
        periodoLabel(dd.periodo), centsToMoney(dd.montoCents), dd.meses === 1 ? '1 mes' : `${dd.meses} meses`,
        centsToMoney(dd.punitorioCents), centsToMoney(dd.totalCents),
      ]), { totales: ['Total', centsToMoney(liq.saldoAnteriorCents), '', centsToMoney(liq.interesMoraCents), centsToMoney(liq.saldoAnteriorCents + liq.interesMoraCents)] });
    } else {
      if (liq.saldoAnteriorCents > 0) renglon(doc, 'Saldo anterior impago', centsToMoney(liq.saldoAnteriorCents));
      if (liq.interesMoraCents > 0) renglon(doc, `Interés por mora${liq.diasMora ? ` (${liq.diasMora} días)` : ''}`, centsToMoney(liq.interesMoraCents));
    }
  }

  // Total
  const delta = ajuste ? (ajuste.tipo === 'descuento' ? -ajuste.montoCents : ajuste.montoCents) : 0;
  const total = liq.alquilerFijoCents + liq.variableCents + liq.expensasCents + delta
    + (liq.saldoAnteriorCents || 0) + liq.interesMoraCents;
  doc.moveDown(0.6);
  linea(doc);
  renglon(doc, 'Total a pagar', centsToMoney(total), { negrita: true, tam: 13 });
  const estado = liq.cobradoCents >= total && total > 0
    ? `Pagado (${centsToMoney(liq.cobradoCents)})`
    : liq.estado === 'en_revision' ? 'Comprobante en revisión' : 'Pendiente de pago';
  renglon(doc, `Estado: ${estado}`, null, { gris: true });

  pie(doc, 'Total = alquiler + expensas (parte del local en los gastos del mes anterior) +/- ajustes + meses adeudados con sus punitorios.');
  doc.end();
  return doc;
}

/** Cabeceras para que el navegador lo baje con un nombre legible. */
function cabecerasPdf(res, nombre) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${nombre.replace(/[^\w.-]/g, '_')}"`,
    'Cache-Control': 'private, no-store',
  });
}

module.exports = { pdfCierre, pdfLiquidacion, cabecerasPdf };
