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
  // TODO: autenticación real (hash de contraseña, sesión/JWT). Hoy no hay login:
  // el rol se elige con las solapas de arriba, igual que en el prototipo.
});

/* ---------------- Locales, locatarios y contratos ---------------- */

const Local = sequelize.define('Local', {
  numero: { type: DataTypes.STRING, allowNull: false }, // '01', '02', ...
  superficie: DataTypes.STRING,
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
  diaVencimiento: { type: DataTypes.INTEGER, defaultValue: 10 },
  estado: { type: DataTypes.ENUM('vigente', 'baja'), defaultValue: 'vigente' },
  motivoBaja: DataTypes.STRING,
  fechaBaja: DataTypes.DATEONLY,
  archivoNombre: DataTypes.STRING,
  archivoPath: DataTypes.STRING,
  // Marcas que el plano usa para el cartelito ALTA / BAJA.
  esAlta: { type: DataTypes.BOOLEAN, defaultValue: false },
});

/* ---------------- Liquidación mensual y cobranza ---------------- */

const Liquidacion = sequelize.define('Liquidacion', {
  periodo: { type: DataTypes.STRING, allowNull: false }, // '2026-08'
  alquilerFijoCents: cents(),
  variableCents: cents(),
  expensasCents: cents(),
  interesMoraCents: cents(),
  diasMora: { type: DataTypes.INTEGER, defaultValue: 0 },
  cobradoCents: cents(),
  estado: {
    type: DataTypes.ENUM('pendiente', 'en_revision', 'cobrado'),
    defaultValue: 'pendiente',
  },
  fechaPago: DataTypes.STRING,        // 'Cobrado 08/08' — texto libre, como el prototipo
  facturacionDeclaradaCents: cents(),   // base del variable por % de facturación
});

const Comprobante = sequelize.define('Comprobante', {
  archivoNombre: DataTypes.STRING,
  archivoPath: DataTypes.STRING,
  fechaSubida: DataTypes.STRING, // '27/08 14:12'
  estado: {
    type: DataTypes.ENUM('pendiente', 'aceptado', 'rechazado'),
    defaultValue: 'pendiente',
  },
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
});

/* ---------------- Parámetros de la galería ---------------- */

const Configuracion = sequelize.define('Configuracion', {
  indice: { type: DataTypes.STRING, defaultValue: 'ICL (BCRA)' },
  frecuencia: { type: DataTypes.STRING, defaultValue: 'Trimestral' },
  interesMoraDiario: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0.5 },
  comisionAdmin: { type: DataTypes.DECIMAL(5, 2), defaultValue: 8 },
  diaVencimiento: { type: DataTypes.INTEGER, defaultValue: 10 },
  diasGracia: { type: DataTypes.INTEGER, defaultValue: 3 },
  expensasBaseCents: cents(16000000),
});

/* ---------------- Relaciones ---------------- */

Galeria.hasMany(Local, { foreignKey: { name: 'galeriaId', allowNull: false } });
Local.belongsTo(Galeria, { foreignKey: 'galeriaId' });

Galeria.hasMany(Administrador, { foreignKey: 'galeriaId' });
Administrador.belongsTo(Galeria, { foreignKey: 'galeriaId' });

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

Liquidacion.hasOne(Comprobante, { foreignKey: 'liquidacionId' });
Comprobante.belongsTo(Liquidacion, { foreignKey: 'liquidacionId' });

Local.hasMany(AjusteExpensa, { foreignKey: 'localId' });
AjusteExpensa.belongsTo(Local, { foreignKey: 'localId' });

module.exports = {
  sequelize,
  Galeria, Administrador, Local, Locatario, Contrato,
  Liquidacion, Comprobante, AjusteExpensa,
  Proveedor, Gasto, Configuracion,
};
