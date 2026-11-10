'use strict';
/*
 * Datos de ejemplo de dos rubros además de la galería, para ver hasta dónde
 * llega el modelo genérico:
 *
 *  - Parque de depósitos: misma forma que una galería. Un predio, unidades con
 *    su coeficiente, un pozo de gastos comunes que se reparte entre todas. El
 *    motor de liquidación funciona sin tocar una línea.
 *
 *  - Cartera inmobiliaria: propiedades dispersas, cada una en un edificio
 *    distinto. No hay pozo de gastos para repartir porque la expensa la cobra
 *    el consorcio de cada edificio, no la administración. Hoy el sistema lo
 *    resuelve cobrando solo el alquiler, y eso alcanza para contratos,
 *    cobranzas, cuenta corriente y rendición al dueño; lo que todavía no puede
 *    es pasarle a cada inquilino la expensa de su propio consorcio.
 *
 * O sea: el de depósitos muestra lo que ya se reutiliza, y el inmobiliario
 * muestra exactamente dónde está el trabajo que falta.
 */
const {
  Complejo, Administrador, Usuario, Dueno, Unidad, Locatario, Contrato,
  Liquidacion, Comprobante, Proveedor, Gasto, Configuracion,
} = require('./models');
const { PERIODO_INICIAL } = require('./services/formato');

const pesos = (n) => Math.round(Number(n) * 100);

/* ---------------- Parque de depósitos ---------------- */

const DEPOSITOS = {
  complejo: {
    nombre: 'Parque Logístico Km 40',
    direccion: 'Acceso Oeste km 40, Moreno',
    dueno: 'Logística del Oeste SA',
    tipo: 'depositos',
  },
  admin: { nombre: 'Gestión Oeste', email: 'oeste@galex.com' },
  config: { comisionAdmin: 7, interesMoraDiario: 4, diaVencimiento: 5, diasGracia: 5 },
  // Los gastos comunes del predio: se reparten entre las unidades por su coeficiente.
  proveedores: ['Edesur', 'Vigilancia Patagonia', 'Mantenimiento Vial SRL'],
  gastos: [
    { tipo: 'ordinario', proveedor: 'Edesur', facturaTipo: 'Factura B', facturaNro: '0005-00001120', descripcion: 'Energía del predio · agosto', monto: 940000 },
    { tipo: 'ordinario', proveedor: 'Vigilancia Patagonia', facturaTipo: 'Factura A', facturaNro: '0003-00008810', descripcion: 'Vigilancia 24 h · agosto', monto: 1850000 },
    { tipo: 'extraordinario', proveedor: 'Mantenimiento Vial SRL', facturaTipo: 'Factura A', facturaNro: '0001-00000455', descripcion: 'Repavimentación de la playa de maniobras', monto: 3200000 },
  ],
  duenos: [
    { nombre: 'Hugo Salerno', email: 'hugo.salerno@correo.com', telefono: '+54 237 400-1100', contacto: 'Socio fundador', unidades: ['N-01', 'N-02', 'N-03', 'N-04'] },
    { nombre: 'Claudia Vence', email: 'claudia.vence@correo.com', telefono: '+54 237 400-1200', contacto: 'Acceso Oeste km 40', unidades: ['N-05', 'N-06', 'B-01', 'B-02'] },
  ],
  // pct = coeficiente de expensas; suman 100.
  unidades: [
    { n: 'N-01', m2: 600, pct: 18, loc: 'Transportes Araoz', mail: 'araoz@correo.com', tel: '+54 11 4500-0001', alquiler: 2400000, cobrado: true },
    { n: 'N-02', m2: 600, pct: 18, loc: 'Distribuidora Pampa', mail: 'pampa@correo.com', tel: '+54 11 4500-0002', alquiler: 2400000, cobrado: true },
    { n: 'N-03', m2: 450, pct: 14, loc: 'Frío Sur SA', mail: 'friosur@correo.com', tel: '+54 11 4500-0003', alquiler: 1900000, cobrado: false, comprobante: '26/08 11:20' },
    { n: 'N-04', m2: 450, pct: 14, libre: true },
    { n: 'N-05', m2: 300, pct: 10, loc: 'Insumos del Oeste', mail: 'insumos@correo.com', tel: '+54 11 4500-0005', alquiler: 1350000, cobrado: true },
    { n: 'N-06', m2: 300, pct: 10, loc: 'Maderera Lanús', mail: 'maderera@correo.com', tel: '+54 11 4500-0006', alquiler: 1350000, cobrado: false, mora: true },
    { n: 'B-01', m2: 120, pct: 8, loc: 'Mudanzas Robles', mail: 'robles@correo.com', tel: '+54 11 4500-0007', alquiler: 620000, cobrado: true },
    { n: 'B-02', m2: 120, pct: 8, libre: true },
  ],
  // Este locatario puede entrar con su propio usuario.
  conAcceso: 'N-03',
};

/* ---------------- Cartera inmobiliaria ---------------- */

const INMOBILIARIA = {
  complejo: {
    nombre: 'Inmobiliaria del Sur',
    direccion: 'Av. Hipólito Yrigoyen 8800, Lomas de Zamora',
    dueno: 'Inmobiliaria del Sur SRL',
    tipo: 'inmobiliaria',
  },
  admin: { nombre: 'Inmobiliaria del Sur', email: 'sur@galex.com' },
  // Comisión más alta y mora más baja que en un predio: así se maneja el rubro.
  config: { comisionAdmin: 10, interesMoraDiario: 3, diaVencimiento: 10, diasGracia: 3 },
  /*
   * Sin proveedores ni gastos: la administración no paga expensas comunes.
   * Cada propiedad está en un consorcio distinto y su inquilino le paga la
   * expensa directamente a ese consorcio.
   */
  proveedores: [],
  gastos: [],
  duenos: [
    { nombre: 'Elena Ferreyra', email: 'elena.ferreyra@correo.com', telefono: '+54 11 4292-3300', contacto: 'Cobra por transferencia, CBU en legajo', unidades: ['P-01', 'P-02'] },
    { nombre: 'Marcelo Juárez', email: 'marcelo.juarez@correo.com', telefono: '+54 11 4292-4400', contacto: 'Vive en Mar del Plata', unidades: ['P-03'] },
    { nombre: 'Sucesión Ibarra', email: 'ibarra.sucesion@correo.com', telefono: '+54 11 4292-5500', contacto: 'Representa la Dra. Paz', unidades: ['P-04', 'P-05'] },
  ],
  /*
   * pct en null a propósito: no hay pozo que repartir, así que ninguna propiedad
   * tiene coeficiente. El inquilino paga alquiler y nada más.
   */
  unidades: [
    { n: 'P-01', m2: 48, direccion: 'Meeks 340, 3.º B, Lomas de Zamora', loc: 'Familia Quiroga', mail: 'quiroga@correo.com', tel: '+54 11 4700-0001', alquiler: 480000, cobrado: true },
    { n: 'P-02', m2: 65, direccion: 'Laprida 1120, 1.º A, Banfield', loc: 'Sofía Linares', mail: 'linares@correo.com', tel: '+54 11 4700-0002', alquiler: 610000, cobrado: true },
    { n: 'P-03', m2: 90, direccion: 'Sáenz 455, casa, Temperley', loc: 'Familia Méndez', mail: 'mendez@correo.com', tel: '+54 11 4700-0003', alquiler: 820000, cobrado: false, comprobante: '28/08 09:05' },
    { n: 'P-04', m2: 35, direccion: 'Colombres 90, PB 2, Lomas de Zamora', loc: 'Tomás Riquelme', mail: 'riquelme@correo.com', tel: '+54 11 4700-0004', alquiler: 395000, cobrado: false, mora: true },
    { n: 'P-05', m2: 120, direccion: 'Pasaje Güemes 23, Adrogué', libre: true },
  ],
  conAcceso: 'P-03',
};

/* ---------------- Alta ---------------- */

function estadoDeLiquidacion(u) {
  if (u.cobrado) return 'cobrado';
  return u.comprobante ? 'en_revision' : 'pendiente';
}

function textoDePago(u) {
  if (u.cobrado) return 'Cobrado';
  if (u.comprobante) return 'Comprobante en revisión';
  return u.mora ? 'En mora · 25 días' : 'Pendiente';
}

/** Crea un complejo completo a partir de una de las definiciones de arriba. */
async function crearRubro(def, clave) {
  const complejo = await Complejo.create(def.complejo);
  await Configuracion.create({ complejoId: complejo.id, ...def.config });

  await Administrador.create({ ...def.admin, complejoId: complejo.id });
  await Usuario.create({
    email: def.admin.email, nombre: def.admin.nombre, rol: 'admin',
    complejoId: complejo.id, passwordHash: clave,
  });

  const proveedores = {};
  for (const nombre of def.proveedores) {
    // Un proveedor puede estar compartido con otro complejo.
    const [p] = await Proveedor.findOrCreate({ where: { nombre } });
    proveedores[nombre] = p;
  }
  for (const g of def.gastos) {
    await Gasto.create({
      complejoId: complejo.id,
      tipo: g.tipo,
      proveedorId: proveedores[g.proveedor].id,
      facturaTipo: g.facturaTipo,
      facturaNro: g.facturaNro,
      descripcion: g.descripcion,
      montoCents: pesos(g.monto),
      fecha: `${PERIODO_INICIAL}-10`,
      periodo: PERIODO_INICIAL,
    });
  }

  // Los dueños primero: cada unidad nace ya asignada.
  const duenoPorUnidad = {};
  for (const d of def.duenos) {
    const dueno = await Dueno.create({
      complejoId: complejo.id,
      nombre: d.nombre, email: d.email, telefono: d.telefono, contacto: d.contacto,
    });
    d.unidades.forEach((n) => { duenoPorUnidad[n] = dueno; });
  }

  for (const u of def.unidades) {
    const unidad = await Unidad.create({
      complejoId: complejo.id,
      numero: u.n,
      superficieM2: u.m2,
      direccion: u.direccion || null,
      expensasPct: u.pct === undefined ? null : u.pct,
      duenoId: duenoPorUnidad[u.n] ? duenoPorUnidad[u.n].id : null,
    });
    if (u.libre) continue;

    const locatario = await Locatario.create({ nombre: u.loc, email: u.mail, telefono: u.tel });
    if (u.n === def.conAcceso) {
      await Usuario.create({
        email: u.mail, nombre: u.loc, rol: 'locatario', locatarioId: locatario.id,
        complejoId: complejo.id, unidadId: unidad.id, passwordHash: clave,
      });
    }

    const contrato = await Contrato.create({
      unidadId: unidad.id,
      locatarioId: locatario.id,
      rubro: '—',
      modalidad: 'fijo',
      alquilerFijoCents: pesos(u.alquiler),
      inicio: '2025-09-01',
      plazoMeses: 24,
      diaVencimiento: def.config.diaVencimiento,
      estado: 'vigente',
    });

    /*
     * La liquidación del mes abierto. Las expensas salen del pozo recién en el
     * primer cierre, así que acá va solo el alquiler: en depósitos el monto va
     * a crecer al liquidar, y en la cartera inmobiliaria se va a quedar como
     * está, que es justamente la diferencia entre los dos rubros.
     */
    const liq = await Liquidacion.create({
      unidadId: unidad.id,
      contratoId: contrato.id,
      periodo: PERIODO_INICIAL,
      alquilerFijoCents: pesos(u.alquiler),
      expensasCents: 0,
      cobradoCents: u.cobrado ? pesos(u.alquiler) : 0,
      diasMora: u.mora ? 25 : 0,
      estado: estadoDeLiquidacion(u),
      fechaPago: textoDePago(u),
    });

    // Un comprobante esperando revisión, para que el admin tenga qué mirar.
    if (u.comprobante) {
      await Comprobante.create({
        liquidacionId: liq.id,
        archivoNombre: `transferencia_${u.n}.pdf`,
        fechaSubida: u.comprobante,
        estado: 'pendiente',
      });
    }
  }

  return complejo;
}

/** Da de alta los dos rubros de ejemplo. `clave` es el hash ya calculado. */
async function seedRubros(clave) {
  await crearRubro(DEPOSITOS, clave);
  await crearRubro(INMOBILIARIA, clave);
}

module.exports = { seedRubros, DEPOSITOS, INMOBILIARIA };
