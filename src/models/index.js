'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/*
 * Todos los importes se guardan en CENTAVOS como enteros, para no arrastrar
 * errores de punto flotante (el prototipo ya venía trabajando así).
 */
/*
 * Ojo: tiene que devolver un objeto nuevo en cada llamada. Sequelize muta las
 * opciones de cada atributo, así que compartir un mismo objeto entre columnas
 * hace que todas terminen apuntando a la misma.
 */
const cents = (defaultValue = 0) => ({ type: DataTypes.INTEGER, allowNull: false, defaultValue });

/* ---------------- Superadmin: galerías y administradores ---------------- */

const Galeria = sequelize.define('Galeria', {
  nombre: { type: DataTypes.STRING, allowNull: false },
  direccion: DataTypes.STRING,
  dueno: DataTypes.STRING,
  activa: { type: DataTypes.BOOLEAN, defaultValue: true },
});

const Administrador = sequelize.define('Administrador', {
  nombre: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
});

/* ---------------- Usuarios con acceso ---------------- */

/*
 * Quién puede entrar y qué ve. El rol define la pantalla:
 *  - superadmin: panel de galerías + puede administrar cualquiera (selector).
 *  - admin: administra la galería `galeriaId`, sin selector.
 *  - locatario: ve solo su local `localId`.
 */
const Usuario = sequelize.define('Usuario', {
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  nombre: DataTypes.STRING,
  /*
   * Null = todavía no definió su contraseña. Entra con el link de acceso que le
   * llegó por mail (`tokenAcceso`) y la crea ahí la primera vez.
   */
  passwordHash: { type: DataTypes.STRING, allowNull: true },
  tokenAcceso: { type: DataTypes.STRING, allowNull: true, unique: true },
  tokenExpira: { type: DataTypes.DATE, allowNull: true },
  rol: { type: DataTypes.ENUM('superadmin', 'admin', 'locatario'), allowNull: false },
});

/* ---------------- Dueños, locales, locatarios y contratos ---------------- */

/*
 * El propietario de uno o más locales de la galería. La administración le rinde
 * cuentas de lo cobrado y lo gastado en sus locales.
 */
const Dueno = sequelize.define('Dueno', {
  nombre: { type: DataTypes.STRING, allowNull: false },
  email: DataTypes.STRING,
  telefono: DataTypes.STRING,
  // Dirección, CBU, notas: lo que la administración necesite para contactarlo.
  contacto: DataTypes.STRING,
});

const Local = sequelize.define('Local', {
  numero: { type: DataTypes.STRING, allowNull: false }, // '01', '02', ...
  superficieM2: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
  // Porcentaje de las expensas totales que le toca a este local (0 a 100).
  expensasPct: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
});

const Locatario = sequelize.define('Locatario', {
  nombre: { type: DataTypes.STRING, allowNull: false },
  email: DataTypes.STRING,
  telefono: DataTypes.STRING,
});

const Contrato = sequelize.define('Contrato', {
  rubro: DataTypes.STRING,
  modalidad: { type: DataTypes.ENUM('fijo', 'fijo_pct'), defaultValue: 'fijo' },
  porcentajeFacturacion: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
  alquilerFijoCents: cents(),
  inicio: DataTypes.DATEONLY,
  plazoMeses: { type: DataTypes.INTEGER, defaultValue: 24 },
  indice: { type: DataTypes.STRING, defaultValue: 'ICL (BCRA)' },
  proximaActualizacion: DataTypes.STRING, // 'ICL · Nov 2026' (texto, como en el prototipo)
  // El mismo dato como período ('2026-11'): en ese mes el cierre le aplica el aumento del índice.
  proximaActualizacionPeriodo: DataTypes.STRING,
  diaVencimiento: { type: DataTypes.INTEGER, defaultValue: 10 },
  estado: { type: DataTypes.ENUM('vigente', 'baja'), defaultValue: 'vigente' },
  motivoBaja: DataTypes.STRING,
  fechaBaja: DataTypes.DATEONLY,
  archivoNombre: DataTypes.STRING,
  archivoPath: DataTypes.STRING,
  // Marcas que el plano usa para el cartelito ALTA / BAJA.
  esAlta: { type: DataTypes.BOOLEAN, defaultValue: false },
  /*
   * El locatario es el dueño del local: ocupa su propio local, así que no paga
   * alquiler. Solo le corresponden las expensas y los gastos extraordinarios
   * (ver `calcularLiquidacion` en services/calculo.js).
   */
  locatarioEsDueno: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  /*
   * Renovación: al renovar, el contrato viejo se cierra (estado 'baja', motivo
   * "Renovación") y el nuevo lo apunta con `contratoAnteriorId`. La cadena sirve
   * para arrastrar la deuda de un contrato al que lo sucede.
   */
  contratoAnteriorId: { type: DataTypes.INTEGER, allowNull: true },
});

/* ---------------- Liquidación mensual y cobranza ---------------- */

const Liquidacion = sequelize.define('Liquidacion', {
  periodo: { type: DataTypes.STRING, allowNull: false }, // '2026-08'
  alquilerFijoCents: cents(),
  variableCents: cents(),
  expensasCents: cents(),
  // Lo que quedó impago de meses anteriores (solo el capital, sin punitorios).
  saldoAnteriorCents: cents(),
  // Punitorios sobre los meses adeudados.
  interesMoraCents: cents(),
  diasMora: { type: DataTypes.INTEGER, defaultValue: 0 },
  cobradoCents: cents(),
  estado: {
    type: DataTypes.ENUM('pendiente', 'en_revision', 'cobrado'),
    defaultValue: 'pendiente',
  },
  fechaPago: DataTypes.STRING,        // 'Cobrado 08/08' — texto libre, como el prototipo
  facturacionDeclaradaCents: cents(),   // base del variable por % de facturación
  /*
   * Foto del cálculo al emitirla en el cierre: aumento del alquiler, gastos
   * repartidos, meses adeudados con sus punitorios. Con esto se arma el PDF
   * que explica el monto. Las del seed y las de contratos nuevos no lo tienen.
   */
  detalle: DataTypes.JSON,
});

const Comprobante = sequelize.define('Comprobante', {
  archivoNombre: DataTypes.STRING,
  archivoPath: DataTypes.STRING,
  datos: DataTypes.BLOB,
  mimeType: DataTypes.STRING, // solo está cuando hay `datos`
  fechaSubida: DataTypes.STRING, // '27/08 14:12'
  estado: {
    type: DataTypes.ENUM('pendiente', 'aceptado', 'rechazado'),
    defaultValue: 'pendiente',
  },
  // Por qué lo rechazó la administración. Lo ve el locatario en su historial.
  motivoRechazo: DataTypes.STRING,
}, {
  defaultScope: { attributes: { exclude: ['datos'] } },
});

const AjusteExpensa = sequelize.define('AjusteExpensa', {
  periodo: { type: DataTypes.STRING, allowNull: false },
  tipo: { type: DataTypes.ENUM('descuento', 'cargo'), allowNull: false },
  montoCents: cents(),
  motivo: DataTypes.STRING,
});

/* ---------------- Gastos de la galería ---------------- */

const Proveedor = sequelize.define('Proveedor', {
  nombre: { type: DataTypes.STRING, allowNull: false },
});

const Gasto = sequelize.define('Gasto', {
  tipo: { type: DataTypes.ENUM('ordinario', 'extraordinario'), defaultValue: 'ordinario' },
  facturaTipo: DataTypes.STRING,
  facturaNro: DataTypes.STRING,
  descripcion: DataTypes.STRING,
  montoCents: cents(),
  archivoNombre: DataTypes.STRING,
  archivoPath: DataTypes.STRING,
  fecha: DataTypes.DATEONLY,
  periodo: DataTypes.STRING, // '2026-08': el mes en el que se cargó y se reparte
});

/* ---------------- Parámetros de la galería ---------------- */

const Configuracion = sequelize.define('Configuracion', {
  indice: { type: DataTypes.STRING, defaultValue: 'ICL (BCRA)' },
  frecuencia: { type: DataTypes.STRING, defaultValue: 'Trimestral' },
  // Pese al nombre (viene del prototipo), es el punitorio por MES de atraso: se
  // cobra sobre el monto de cada mes adeudado, una vez por cada mes que pasó.
  interesMoraDiario: { type: DataTypes.DECIMAL(5, 2), defaultValue: 5 },
  comisionAdmin: { type: DataTypes.DECIMAL(5, 2), defaultValue: 8 },
  diaVencimiento: { type: DataTypes.INTEGER, defaultValue: 10 },
  diasGracia: { type: DataTypes.INTEGER, defaultValue: 3 },
  // Ya no se usa: las expensas salen de repartir los gastos del mes por el % de cada local.
  expensasBaseCents: cents(16000000),
  // Mes abierto: el que se está liquidando. Avanza con cada cierre.
  periodoActual: { type: DataTypes.STRING, allowNull: false, defaultValue: '2026-08' },
  // Saldo de la cuenta antes del primer cierre. Después manda el saldo final del último cierre.
  saldoInicialCents: cents(),
});

/* ---------------- Cierre del mes ---------------- */

/*
 * La foto de un mes cerrado: con qué saldo arrancó, qué gastos e ingresos tuvo
 * y con cuánto terminó. El PDF del cierre se genera a partir de acá.
 */
const CierreMes = sequelize.define('CierreMes', {
  periodo: { type: DataTypes.STRING, allowNull: false },
  saldoAnteriorCents: cents(),
  gastosOrdinariosCents: cents(),
  gastosExtraordinariosCents: cents(),
  ingresosCents: cents(),
  saldoFinalCents: cents(),
  detalle: DataTypes.JSON, // gastos, ingresos, aumentos aplicados, liquidaciones emitidas
  fechaCierre: DataTypes.DATE,
}, {
  // Un solo cierre por mes: un doble click en Confirmar no cierra dos veces.
  indexes: [{ unique: true, fields: ['galeriaId', 'periodo'] }],
});

/* ---------------- Chat entre la administración y los locatarios ---------------- */

/*
 * Un chat por locatario dentro de su galería: si el local cambia de inquilino,
 * el nuevo arranca con un chat propio y no ve la conversación del anterior.
 */
const Chat = sequelize.define('Chat', {
  /*
   * Hasta qué mensaje (id) leyó cada lado. Los mensajes se leen en orden, así
   * que alcanza con un cursor por lado en vez de marcar cada mensaje: uno propio
   * está leído si su id es <= al cursor del otro lado.
   */
  leidoAdminHasta: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  leidoLocatarioHasta: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  indexes: [{ unique: true, fields: ['galeriaId', 'locatarioId'] }],
});

const Mensaje = sequelize.define('Mensaje', {
  texto: { type: DataTypes.TEXT, allowNull: false },
  // 'admin' cubre al admin y al superadmin: los dos hablan por la administración.
  autorRol: { type: DataTypes.ENUM('admin', 'locatario'), allowNull: false },
});

/* ---------------- Relaciones ---------------- */

Galeria.hasMany(Local, { foreignKey: { name: 'galeriaId', allowNull: false } });
Local.belongsTo(Galeria, { foreignKey: 'galeriaId' });

Galeria.hasMany(Dueno, { foreignKey: { name: 'galeriaId', allowNull: false } });
Dueno.belongsTo(Galeria, { foreignKey: 'galeriaId' });

// Un local tiene a lo sumo un dueño; un dueño puede tener varios locales.
// Al borrar un dueño sus locales quedan sin asignar (no se borran).
Dueno.hasMany(Local, { foreignKey: 'duenoId', onDelete: 'SET NULL' });
Local.belongsTo(Dueno, { foreignKey: 'duenoId' });

Galeria.hasMany(Administrador, { foreignKey: 'galeriaId' });
Administrador.belongsTo(Galeria, { foreignKey: 'galeriaId' });

// galeriaId: la que administra (admin) o a la que pertenece su local (locatario).
Usuario.belongsTo(Galeria, { foreignKey: 'galeriaId' });
Usuario.belongsTo(Local, { foreignKey: 'localId' });

Galeria.hasOne(Configuracion, { foreignKey: 'galeriaId' });
Configuracion.belongsTo(Galeria, { foreignKey: 'galeriaId' });

Galeria.hasMany(Gasto, { foreignKey: 'galeriaId' });
Gasto.belongsTo(Galeria, { foreignKey: 'galeriaId' });

Proveedor.hasMany(Gasto, { foreignKey: 'proveedorId' });
Gasto.belongsTo(Proveedor, { foreignKey: 'proveedorId' });

Local.hasMany(Contrato, { foreignKey: 'localId' });
Contrato.belongsTo(Local, { foreignKey: 'localId' });

Locatario.hasMany(Contrato, { foreignKey: 'locatarioId' });
Contrato.belongsTo(Locatario, { foreignKey: 'locatarioId' });

Contrato.hasMany(Liquidacion, { foreignKey: 'contratoId' });
Liquidacion.belongsTo(Contrato, { foreignKey: 'contratoId' });

Local.hasMany(Liquidacion, { foreignKey: 'localId' });
Liquidacion.belongsTo(Local, { foreignKey: 'localId' });

// Varios por liquidación: si rechazan uno y sube otro, el anterior queda en el historial.
Liquidacion.hasMany(Comprobante, { foreignKey: 'liquidacionId' });
Comprobante.belongsTo(Liquidacion, { foreignKey: 'liquidacionId' });

Local.hasMany(AjusteExpensa, { foreignKey: 'localId' });
AjusteExpensa.belongsTo(Local, { foreignKey: 'localId' });

Galeria.hasMany(CierreMes, { foreignKey: { name: 'galeriaId', allowNull: false } });
CierreMes.belongsTo(Galeria, { foreignKey: 'galeriaId' });

Galeria.hasMany(Chat, { foreignKey: { name: 'galeriaId', allowNull: false } });
Chat.belongsTo(Galeria, { foreignKey: 'galeriaId' });

Locatario.hasMany(Chat, { foreignKey: { name: 'locatarioId', allowNull: false } });
Chat.belongsTo(Locatario, { foreignKey: 'locatarioId' });

Chat.hasMany(Mensaje, { foreignKey: { name: 'chatId', allowNull: false } });
Mensaje.belongsTo(Chat, { foreignKey: 'chatId' });

// Quién lo escribió, para mostrar el nombre en la burbuja.
Mensaje.belongsTo(Usuario, { foreignKey: 'autorId' });

module.exports = {
  sequelize,
  Galeria, Administrador, Usuario, Dueno, Local, Locatario, Contrato,
  Liquidacion, Comprobante, AjusteExpensa,
  Proveedor, Gasto, Configuracion, CierreMes, Chat, Mensaje,
};
