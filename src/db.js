'use strict';
require('dotenv').config();
const path = require('path');
const { Sequelize } = require('sequelize');

/*
 * En Render (y en cualquier lado con DATABASE_URL) se usa Postgres.
 * Sin DATABASE_URL se cae a un SQLite local, así arrancar el proyecto no exige
 * instalar nada. Ojo: es solo para desarrollo — lo que se entrega corre sobre
 * Postgres.
 */
let sequelize;

if (process.env.DATABASE_URL) {
  // Render exige SSL; un Postgres en localhost no.
  const esLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: esLocal ? {} : { ssl: { require: true, rejectUnauthorized: false } },
  });
} else {
  console.log('Sin DATABASE_URL: usando SQLite local (dev.sqlite). Para Postgres, completá .env');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '..', 'dev.sqlite'),
    logging: false,
  });
}

module.exports = sequelize;
