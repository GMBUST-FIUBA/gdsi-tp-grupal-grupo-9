'use strict';
/*
 * Carga inicial: reproduce los datos de ejemplo del prototipo.
 * Se ejecuta solo si la base está vacía (o con `npm run seed -- --force`).
 */
const {
  sequelize, Galeria, Administrador, Local, Locatario, Contrato,
  Liquidacion, Comprobante, Proveedor, Gasto, Configuracion,
} = require('./models');
const { PERIODO_ACTUAL } = require('./services/formato');

const EXPENSAS_BASE = 160000; // pesos, por local

// n, rubro, locatario, mail, tel, % de facturación, alquiler fijo, total del mes,
// próxima actualización, texto de estado de cobro, comprobante, cobrado, días de mora, mora.
const LOCALES = [
  { n: '01', rubro: 'Indumentaria', loc: 'Alma Ropa', mail: 'alma@correo.com', tel: '+54 11 4001-0001', pct: 0, fijo: 840000, tot: 1000000, act: 'ICL · Nov 2026', pago: 'Cobrado 08/08', cobrado: 1000000 },
  { n: '02', rubro: 'Marroquinería', loc: 'Cuero & Co.', mail: 'cueroco@correo.com', tel: '+54 11 4001-0002', pct: 0, fijo: 720000, tot: 880000, act: 'ICL · Sep 2026', pago: 'Cobrado 06/08', cobrado: 880000 },
  { n: '03', rubro: 'Joyería', loc: 'Áurea', mail: 'aurea@correo.com', tel: '+54 11 4001-0003', pct: 0, fijo: 910000, tot: 1070000, act: 'ICL · Oct 2026', pago: 'Cobrado 09/08', cobrado: 1070000 },
  { n: '04', rubro: 'Gastronomía', loc: 'Café del Pasaje', mail: 'cafe@correo.com', tel: '+54 11 4001-0004', pct: 4, fijo: 980000, tot: 1586200, act: 'ICL · Sep 2026', pago: 'Comprobante en revisión', comp: '27/08 14:12', cobrado: 0, diasMora: 18, mora: 74200 },
  { n: '05', rubro: 'Perfumería', loc: 'Esencia', mail: 'esencia@correo.com', tel: '+54 11 4001-0005', pct: 0, fijo: 680000, tot: 840000, act: 'ICL · Ene 2027', pago: 'Cobrado 07/08', cobrado: 840000 },
  { n: '06', rubro: 'Librería', loc: 'Papel & Tinta', mail: 'papel@correo.com', tel: '+54 11 4001-0006', pct: 0, fijo: 560000, tot: 720000, act: 'ICL · Sep 2026', pago: 'Vence hoy', cobrado: 0 },
  { n: '07', libre: true, bajaEl: '2026-06-30' },
  { n: '08', rubro: 'Óptica', loc: 'Ver Más', mail: 'vermas@correo.com', tel: '+54 11 4001-0008', pct: 0, fijo: 640000, tot: 800000, act: 'ICL · Oct 2026', pago: 'Cobrado 05/08', cobrado: 800000 },
  { n: '09', rubro: 'Calzado', loc: 'Zapatería Nova', mail: 'nova@correo.com', tel: '+54 11 4001-0009', pct: 0, fijo: 545000, tot: 705000, act: 'ICL · Nov 2026', pago: 'Pendiente', cobrado: 0 },
  { n: '10', rubro: 'Farmacia', loc: 'Farma Centro', mail: 'farma@correo.com', tel: '+54 11 4001-0010', pct: 0, fijo: 1240000, tot: 1400000, act: 'ICL · Dic 2026', pago: 'Cobrado 04/08', cobrado: 1400000 },
  { n: '11', rubro: 'Kiosco', loc: 'KioZone', mail: 'kiozone@correo.com', tel: '+54 11 4001-0011', pct: 0, fijo: 530000, tot: 690000, act: 'ICL · Sep 2026', pago: 'Comprobante en revisión', comp: '28/08 09:40', cobrado: 0 },
  { n: '12', rubro: 'Indumentaria', loc: 'Urbano', mail: 'urbano@correo.com', tel: '+54 11 4001-0012', pct: 3, fijo: 760000, tot: 1180000, act: 'ICL · Sep 2026', pago: 'Cobrado 08/08', cobrado: 1180000 },
  { n: '13', rubro: 'Tecnología', loc: 'ByteShop', mail: 'byteshop@correo.com', tel: '+54 11 4001-0013', pct: 0, fijo: 990000, tot: 1150000, act: 'ICL · Oct 2026', pago: 'Cobrado 03/08', cobrado: 1150000 },
  { n: '14', libre: true },
  { n: '15', rubro: 'Peluquería', loc: 'Estilo D10', mail: 'estilo@correo.com', tel: '+54 11 4001-0015', pct: 0, fijo: 610000, tot: 770000, act: 'ICL · Ene 2027', pago: 'Cobrado 09/08', cobrado: 770000 },
  { n: '16', rubro: 'Gastronomía', loc: 'Empanadas Sur', mail: 'empanadas@correo.com', tel: '+54 11 4001-0016', pct: 5, fijo: 700000, tot: 1320000, act: 'ICL · Sep 2026', pago: 'Cobrado 07/08', cobrado: 1320000, nuevo: true },
  { n: '17', rubro: 'Óptica', loc: 'Óptica Belgrano', mail: 'opticabelgrano@correo.com', tel: '+54 11 4001-0017', pct: 0, fijo: 1088500, tot: 1248500, act: 'ICL · Oct 2026', pago: 'En mora · 18 días', cobrado: 0, diasMora: 18 },
  { n: '18', rubro: 'Regalería', loc: 'Detalles', mail: 'detalles@correo.com', tel: '+54 11 4001-0018', pct: 0, fijo: 520000, tot: 680000, act: 'ICL · Dic 2026', pago: 'Cobrado 06/08', cobrado: 680000 },
  { n: '19', rubro: 'Indumentaria', loc: 'Nena&Nene', mail: 'nenaynene@correo.com', tel: '+54 11 4001-0019', pct: 0, fijo: 690000, tot: 850000, act: 'ICL · Sep 2026', pago: 'Cobrado 08/08', cobrado: 850000 },
  { n: '20', rubro: 'Gastronomía', loc: 'Helados Polo', mail: 'polo@correo.com', tel: '+54 11 4001-0020', pct: 4, fijo: 650000, tot: 1090000, act: 'ICL · Sep 2026', pago: 'Cobrado 05/08', cobrado: 1090000 },
  { n: '21', libre: true, bajaEl: '2026-07-31' },
  { n: '22', rubro: 'Deportes', loc: 'Récord Sport', mail: 'record@correo.com', tel: '+54 11 4001-0022', pct: 0, fijo: 870000, tot: 1030000, act: 'ICL · Oct 2026', pago: 'Cobrado 04/08', cobrado: 1030000, nuevo: true },
];

const PROVEEDORES = ['Edenor', 'AySA', 'Limpieza Total SRL', 'Seguridad Belgrano', 'Estudio Ríos'];

const GASTOS = [
  { tipo: 'ordinario', proveedor: 'Edenor', facturaTipo: 'Factura B', facturaNro: '0001-00004521', descripcion: 'Consumo eléctrico de agosto', monto: 185000, fecha: '2026-08-05' },
  { tipo: 'ordinario', proveedor: 'Estudio Ríos', facturaTipo: 'Factura C', facturaNro: '0002-00000891', descripcion: 'Honorarios de administración · agosto', monto: 420000, fecha: '2026-08-03' },
  { tipo: 'extraordinario', proveedor: 'Limpieza Total SRL', facturaTipo: 'Ticket', facturaNro: '0001-00000142', descripcion: 'Reparación de bomba de agua', monto: 96000, fecha: '2026-08-14' },
];

const pesos = (n) => Math.round(Number(n) * 100);

async function seed() {
  const galeria = await Galeria.create({
    nombre: 'Galería Belgrano',
    direccion: 'Av. Cabildo 2200, CABA',
    dueno: 'J. Belgrano',
  });

  await Configuracion.create({ galeriaId: galeria.id, expensasBaseCents: pesos(EXPENSAS_BASE) });

  await Administrador.create({
    nombre: 'Estudio Ríos',
    email: 'admin@estudiorios.com',
    galeriaId: galeria.id,
  });

  // Las otras galerías que listaba el panel de superadmin (todavía sin locales).
  // Cada una necesita su configuración: el selector del panel permite entrar a
  // administrarlas y sin config se rompen la rendición y los parámetros.
  for (const otra of [
    { nombre: 'Galería Centro', direccion: 'Rivadavia 4500, CABA', dueno: 'Centro SA' },
    { nombre: 'Complejo Norte (oficinas)', direccion: 'Panamericana km 30', dueno: 'NorteInmuebles' },
  ]) {
    const g = await Galeria.create(otra);
    await Configuracion.create({ galeriaId: g.id, expensasBaseCents: pesos(EXPENSAS_BASE) });
  }

  const proveedores = {};
  for (const nombre of PROVEEDORES) {
    proveedores[nombre] = await Proveedor.create({ nombre });
  }

  for (const g of GASTOS) {
    await Gasto.create({
      galeriaId: galeria.id,
      tipo: g.tipo,
      proveedorId: proveedores[g.proveedor].id,
      facturaTipo: g.facturaTipo,
      facturaNro: g.facturaNro,
      descripcion: g.descripcion,
      montoCents: pesos(g.monto),
      fecha: g.fecha,
    });
  }

  for (const d of LOCALES) {
    const local = await Local.create({
      galeriaId: galeria.id,
      numero: d.n,
      superficie: '~ 38 m2',
    });

    if (d.libre) {
      // Los locales que quedaron libres por una baja conservan el contrato anterior.
      if (d.bajaEl) {
        await Contrato.create({
          localId: local.id,
          rubro: '—',
          alquilerFijoCents: 0,
          estado: 'baja',
          motivoBaja: 'Fin de contrato',
          fechaBaja: d.bajaEl,
        });
      }
      continue;
    }

    const locatario = await Locatario.create({ nombre: d.loc, email: d.mail, telefono: d.tel });

    const mora = pesos(d.mora || 0);
    const fijo = pesos(d.fijo);
    const exp = pesos(EXPENSAS_BASE);
    const variable = pesos(d.tot) - fijo - exp - mora;

    const contrato = await Contrato.create({
      localId: local.id,
      locatarioId: locatario.id,
      rubro: d.rubro,
      modalidad: d.pct > 0 ? 'fijo_pct' : 'fijo',
      porcentajeFacturacion: d.pct,
      alquilerFijoCents: fijo,
      inicio: '2025-03-01',
      plazoMeses: 24,
      proximaActualizacion: d.act,
      diaVencimiento: 10,
      estado: 'vigente',
      esAlta: !!d.nuevo,
    });

    const liq = await Liquidacion.create({
      localId: local.id,
      contratoId: contrato.id,
      periodo: PERIODO_ACTUAL,
      alquilerFijoCents: fijo,
      variableCents: variable,
      expensasCents: exp,
      interesMoraCents: mora,
      diasMora: d.diasMora || 0,
      cobradoCents: pesos(d.cobrado || 0),
      estado: d.comp ? 'en_revision' : (d.cobrado ? 'cobrado' : 'pendiente'),
      fechaPago: d.pago,
      facturacionDeclaradaCents: d.pct > 0 ? Math.round(variable / (d.pct / 100)) : 0,
    });

    if (d.comp) {
      await Comprobante.create({
        liquidacionId: liq.id,
        archivoNombre: 'comprobante_' + d.n + '.pdf',
        fechaSubida: d.comp,
        estado: 'pendiente',
      });
    }
  }

  console.log('Datos de ejemplo cargados.');
}

/** Corre el seed solo si no hay galerías cargadas. */
async function seedSiHaceFalta() {
  const n = await Galeria.count();
  if (n > 0) return false;
  await seed();
  return true;
}

module.exports = { seed, seedSiHaceFalta };

if (require.main === module) {
  (async () => {
    const force = process.argv.includes('--force');
    await sequelize.sync({ alter: !force, force });
    if (force) await seed();
    else if (!(await seedSiHaceFalta())) console.log('La base ya tiene datos. Usá --force para recrearla.');
    await sequelize.close();
  })().catch((e) => { console.error(e); process.exit(1); });
}
