'use strict';
/*
 * Cómo se llama cada cosa según el rubro del complejo.
 *
 * El modelo es uno solo —un complejo con unidades que se alquilan—, pero el
 * nombre que ve el usuario cambia: en una galería son "locales", en un edificio
 * "departamentos", en un centro de oficinas "oficinas". Separar el vocabulario
 * del modelo es lo que permite sumar un rubro sin tocar la lógica.
 *
 * Si mañana aparece un rubro con reglas de cálculo propias, este archivo es el
 * primer escalón: el `tipo` del complejo ya está, y la estrategia de
 * liquidación se cuelga del mismo lugar.
 */

const VOCABULARIOS = {
  galeria: {
    complejo: 'Galería',
    complejos: 'Galerías',
    unidad: 'Local',
    unidades: 'Locales',
    ocupante: 'Locatario',
    ocupantes: 'Locatarios',
    plano: 'Plano de la galería',
  },
  edificio: {
    complejo: 'Edificio',
    complejos: 'Edificios',
    unidad: 'Departamento',
    unidades: 'Departamentos',
    ocupante: 'Inquilino',
    ocupantes: 'Inquilinos',
    plano: 'Unidades del edificio',
  },
  oficinas: {
    complejo: 'Centro de oficinas',
    complejos: 'Centros de oficinas',
    unidad: 'Oficina',
    unidades: 'Oficinas',
    ocupante: 'Locatario',
    ocupantes: 'Locatarios',
    plano: 'Plano del centro',
  },
  depositos: {
    complejo: 'Parque de depósitos',
    complejos: 'Parques de depósitos',
    unidad: 'Depósito',
    unidades: 'Depósitos',
    ocupante: 'Locatario',
    ocupantes: 'Locatarios',
    plano: 'Plano del parque',
  },
  /*
   * Una cartera de propiedades dispersas. Es el rubro que no encaja del todo:
   * las unidades están en edificios distintos, así que no hay un pozo de gastos
   * para repartir y cada una paga la expensa de su propio consorcio. Hoy el
   * sistema lo cubre cobrando solo el alquiler (ver el README).
   */
  inmobiliaria: {
    complejo: 'Cartera',
    complejos: 'Carteras',
    unidad: 'Propiedad',
    unidades: 'Propiedades',
    ocupante: 'Inquilino',
    ocupantes: 'Inquilinos',
    plano: 'Propiedades de la cartera',
  },
  otro: {
    complejo: 'Complejo',
    complejos: 'Complejos',
    unidad: 'Unidad',
    unidades: 'Unidades',
    ocupante: 'Locatario',
    ocupantes: 'Locatarios',
    plano: 'Plano del complejo',
  },
};

const POR_DEFECTO = 'galeria';

/** Vocabulario de un complejo. Acepta el registro o el tipo suelto. */
function vocabulario(complejoOTipo) {
  const tipo = complejoOTipo && typeof complejoOTipo === 'object'
    ? complejoOTipo.tipo
    : complejoOTipo;
  return VOCABULARIOS[tipo] || VOCABULARIOS[POR_DEFECTO];
}

/** Los tipos disponibles, para los selectores de alta. */
function tiposDeComplejo() {
  return Object.keys(VOCABULARIOS).map((tipo) => ({
    tipo,
    nombre: VOCABULARIOS[tipo].complejo,
  }));
}

module.exports = { vocabulario, tiposDeComplejo, VOCABULARIOS };
