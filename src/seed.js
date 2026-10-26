'use strict';
/*
 * Carga inicial: reproduce los datos de ejemplo del prototipo.
 * Se ejecuta solo si la base está vacía (o con `npm run seed -- --force`).
 */
const {
  sequelize, Galeria, Administrador, Usuario, Dueno, Local, Locatario, Contrato,
  Liquidacion, Comprobante, Proveedor, Gasto, Configuracion, Chat, Mensaje,
} = require('./models');
const { PERIODO_INICIAL, periodoDeTexto } = require('./services/formato');

const PERIODO_ACTUAL = PERIODO_INICIAL;
const { hashear, PASSWORD_INICIAL } = require('./auth');

// Locales cuyos locatarios tienen usuario de acceso (mail del locatario, clave 1234).
const LOCALES_CON_ACCESO = ['04', '10', '11'];

const EXPENSAS_BASE = 160000; // pesos, por local

// Chat de ejemplo entre la administración y el locatario de este local.
const LOCAL_CON_CHAT = '04';

// % de expensas: los 19 locales ocupados suman 100% (los más grandes pagan un poco más).
const LOCALES_PCT_MAYOR = ['04', '10', '16', '20'];
const pctExpensas = (d) => (d.libre ? null : (LOCALES_PCT_MAYOR.includes(d.n) ? 6.25 : 5));

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
    email: 'admin@galex.com',
    galeriaId: galeria.id,
  });

  // Usuarios de acceso. Todos arrancan con la misma contraseña inicial.
  const clave = hashear(PASSWORD_INICIAL);
  await Usuario.create({ email: 'super@galex.com', nombre: 'Superadmin', rol: 'superadmin', passwordHash: clave });
  const admin = await Usuario.create({ email: 'admin@galex.com', nombre: 'Estudio Ríos', rol: 'admin', galeriaId: galeria.id, passwordHash: clave });

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
      periodo: PERIODO_ACTUAL,
    });
  }

  /*
   * Dueños de ejemplo: la galería está repartida entre tres propietarios, y el
   * Local 16 lo ocupa su propio dueño (no paga alquiler).
   */
  const DUENOS = [
    { nombre: 'Jorge Belgrano', email: 'jorge.belgrano@correo.com', telefono: '+54 11 4777-1000',
      contacto: 'Av. Cabildo 2200, CABA',
      locales: ['01', '02', '03', '04', '05', '06', '07', '08'] },
    { nombre: 'Marta Duarte', email: 'marta.duarte@correo.com', telefono: '+54 11 4777-2000',
      contacto: 'Mendoza 1540, CABA',
      locales: ['09', '10', '11', '12', '13', '14', '15'] },
    { nombre: 'Ricardo Sosa', email: 'empanadas@correo.com', telefono: '+54 11 4001-0016',
      contacto: 'Ocupa su propio local (16)',
      locales: ['16', '17', '18', '19', '20', '21', '22'] },
  ];
  const duenoPorLocal = {};   // '04' -> instancia de Dueno
  for (const d of DUENOS) {
    const dueno = await Dueno.create({
      galeriaId: galeria.id, nombre: d.nombre, email: d.email,
      telefono: d.telefono, contacto: d.contacto,
    });
    d.locales.forEach((n) => { duenoPorLocal[n] = dueno; });
  }

  // El locatario del 16 es el dueño del local: solo paga expensas.
  const LOCAL_DEL_DUENO = '16';

  let chatDeEjemplo = null; // { locatario, usuario } del LOCAL_CON_CHAT

  for (const d of LOCALES) {
    const local = await Local.create({
      galeriaId: galeria.id,
      numero: d.n,
      superficieM2: 38,
      expensasPct: pctExpensas(d),
      duenoId: duenoPorLocal[d.n] ? duenoPorLocal[d.n].id : null,
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

    if (LOCALES_CON_ACCESO.includes(d.n)) {
      const usuario = await Usuario.create({
        email: d.mail, nombre: d.loc, rol: 'locatario',
        galeriaId: galeria.id, localId: local.id, passwordHash: clave,
      });
      if (d.n === LOCAL_CON_CHAT) chatDeEjemplo = { locatario, usuario };
    }

    // El dueño que ocupa su propio local no paga alquiler.
    const esDueno = d.n === LOCAL_DEL_DUENO;
    const mora = pesos(d.mora || 0);
    const fijo = esDueno ? 0 : pesos(d.fijo);
    const exp = pesos(EXPENSAS_BASE);
    const variable = esDueno ? 0 : pesos(d.tot) - fijo - exp - mora;

    const contrato = await Contrato.create({
      localId: local.id,
      locatarioId: locatario.id,
      rubro: d.rubro,
      modalidad: !esDueno && d.pct > 0 ? 'fijo_pct' : 'fijo',
      porcentajeFacturacion: esDueno ? 0 : d.pct,
      alquilerFijoCents: fijo,
      inicio: '2025-03-01',
      plazoMeses: 24,
      proximaActualizacion: esDueno ? null : d.act,
      proximaActualizacionPeriodo: esDueno ? null : periodoDeTexto(d.act),
      diaVencimiento: 10,
      estado: 'vigente',
      esAlta: !!d.nuevo,
      locatarioEsDueno: esDueno,
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
      cobradoCents: esDueno ? exp : pesos(d.cobrado || 0),
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

  if (chatDeEjemplo) {
    const chat = await Chat.create({ galeriaId: galeria.id, locatarioId: chatDeEjemplo.locatario.id });
    const consulta = await Mensaje.create({
      chatId: chat.id, autorId: chatDeEjemplo.usuario.id, autorRol: 'locatario',
      texto: 'Hola, ya subí el comprobante de agosto. ¿Me confirman cuando lo revisen?',
    });
    const respuesta = await Mensaje.create({
      chatId: chat.id, autorId: admin.id, autorRol: 'admin',
      texto: 'Hola, lo recibimos. Lo revisamos y te avisamos por acá.',
    });
    await Mensaje.create({
      chatId: chat.id, autorId: chatDeEjemplo.usuario.id, autorRol: 'locatario',
      texto: 'Gracias. ¿La expensa de septiembre ya está liquidada?',
    });
    // El locatario leyó la respuesta; el admin todavía no vio la última consulta.
    await chat.update({ leidoAdminHasta: consulta.id, leidoLocatarioHasta: respuesta.id });
  }

  console.log('Datos de ejemplo cargados.');
}

/**
 * Para bases que ya existían antes de que hubiera login: crea los usuarios de
 * acceso a partir de los datos cargados (primera galería, su administrador y
 * los locatarios de LOCALES_CON_ACCESO).
 */
async function seedUsuariosSiFaltan() {
  if ((await Usuario.count()) > 0) return false;

  const galeria = await Galeria.findOne({ order: [['id', 'ASC']] });
  if (!galeria) return false;

  const clave = hashear(PASSWORD_INICIAL);
  await Usuario.create({ email: 'super@galex.com', nombre: 'Superadmin', rol: 'superadmin', passwordHash: clave });
  await Usuario.create({ email: 'admin@galex.com', nombre: 'Estudio Ríos', rol: 'admin', galeriaId: galeria.id, passwordHash: clave });

  const locales = await Local.findAll({
    where: { galeriaId: galeria.id, numero: LOCALES_CON_ACCESO },
    include: [{ model: Contrato, where: { estado: 'vigente' }, include: [Locatario] }],
  });
  for (const local of locales) {
    const locatario = local.Contratos[0] && local.Contratos[0].Locatario;
    if (!locatario || !locatario.email) continue;
    await Usuario.create({
      email: locatario.email, nombre: locatario.nombre, rol: 'locatario',
      galeriaId: galeria.id, localId: local.id, passwordHash: clave,
    });
  }
  console.log('Usuarios de acceso creados sobre la base existente.');
  return true;
}

/**
 * Para bases que ya existían antes del cierre del mes: los gastos sin período
 * pasan al mes abierto de su galería, y los contratos toman el período de su
 * próxima actualización del texto que ya tenían ('ICL · Sep 2026').
 */
async function completarCierreSiFalta() {
  const gastos = await Gasto.findAll({ where: { periodo: null } });
  for (const g of gastos) {
    const config = await Configuracion.findOne({ where: { galeriaId: g.galeriaId } });
    g.periodo = (config && config.periodoActual) || PERIODO_INICIAL;
    await g.save();
  }
  // Los contratos dados de baja no tienen texto: esos quedan sin período.
  let contratos = 0;
  for (const c of await Contrato.findAll({ where: { proximaActualizacionPeriodo: null } })) {
    const p = periodoDeTexto(c.proximaActualizacion);
    if (!p) continue;
    c.proximaActualizacionPeriodo = p;
    await c.save();
    contratos++;
  }
  if (gastos.length || contratos) console.log('Datos completados para el cierre del mes.');
}

/** Corre el seed solo si no hay galerías cargadas; si hay, completa lo que falte. */
async function seedSiHaceFalta() {
  const n = await Galeria.count();
  if (n === 0) {
    await seed();
    return true;
  }
  const usuarios = await seedUsuariosSiFaltan();
  await completarCierreSiFalta();
  return usuarios;
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
