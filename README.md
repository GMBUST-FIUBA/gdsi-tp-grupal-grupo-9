# Galex — gestión de galerías de locales comerciales

TP grupal de GDSI (grupo 9). Aplicación para administrar galerías de locales
comerciales: contratos, liquidaciones mensuales, cobranzas, gastos y rendición al
dueño.

Una misma instancia maneja varias galerías. El superadmin elige cuál administra
con el selector del panel superior izquierdo (se guarda en la cookie `galeriaId`);
los administradores y locatarios ven siempre la suya.

## Usuarios

Hay login con sesión. Cada rol entra y ve solo su pantalla. Los usuarios de
ejemplo (todos con contraseña `1234`):

| Email | Rol | Ve |
| --- | --- | --- |
| `super@galex.com` | Superadmin | Alta de galerías y administradores, y puede administrar cualquier galería |
| `admin@galex.com` | Administrador | Galería Belgrano |
| `cafe@correo.com` | Locatario | Local 04 · Café del Pasaje |
| `farma@correo.com` | Locatario | Local 10 · Farma Centro |
| `kiozone@correo.com` | Locatario | Local 11 · KioZone |

Cuando el superadmin da de alta un administrador, o el administrador registra un
contrato con email, se crea el usuario correspondiente con la contraseña inicial
`1234`. "Blanquear clave" la vuelve a dejar en `1234` (no hay mailer).

La sesión vive en memoria del server: se pierde al reiniciar o redeployar, y hay
que volver a loguearse. Para un TP alcanza.

La cookie de sesión se firma con `SESSION_SECRET`. En Render la genera el
Blueprint (`render.yaml`); conviene confirmar en el dashboard que la variable
existe. Al agregarla o cambiarla, todos tienen que volver a loguearse una vez.

Un locatario accede a su local solo si el email de su usuario coincide con el
del locatario del contrato vigente. Así, si un local cambia de inquilino, el
usuario del anterior deja de ver la cuenta (y los mensajes) del nuevo.

## Mensajes

El administrador puede abrir un chat con cualquier locatario con contrato
vigente (sección **Mensajes**, o el botón *Mensaje* en la pestaña Locatarios), y
el locatario puede escribirle a la administración desde su cuenta. Hay un chat
por locatario.

- Los mensajes nuevos llegan por **polling**: mientras el chat está abierto, el
  navegador pregunta cada 5 segundos si hay mensajes nuevos. No hay WebSockets.
- Cada mensaje propio muestra su estado: **Enviándose** (◷) mientras viaja al
  servidor, **Enviado** (✓) cuando quedó guardado y **Leído** (✓✓) cuando el
  otro lado abrió el chat. Si el envío falla (sin conexión, límite de envío),
  queda en el hilo como **No se envió** con un botón *Reintentar*.
- El leído se guarda como un cursor por chat (`leidoAdminHasta` /
  `leidoLocatarioHasta`: hasta qué mensaje leyó cada lado), no como una marca
  por mensaje. Traer los mensajes de un chat abierto cuenta como leerlos.
- En la lista de chats el admin ve cuántos mensajes sin leer tiene cada uno.
- No hay notificaciones fuera de la sección de mensajes.
- Si venís de una versión anterior con SQLite, recreá la base
  (`npm run seed -- --force`) para que la tabla de chats tenga los cursores.
- Cada usuario puede mandar hasta 10 mensajes cada 10 segundos. El contador
  vive en memoria, igual que la sesión.
- El texto de los mensajes se escapa antes de mostrarlo (`escaparHTML`): lo
  escribe otro usuario y no puede inyectar HTML.

## Comprobantes de pago

El locatario sube el comprobante del mes desde su cuenta y ve todos los que
subió en **Mis comprobantes** (período, fecha de subida, estado), con un botón
para descargarlos. El administrador lo descarga desde el detalle del local, al
revisarlo.

- El archivo (imagen o PDF, hasta 10 MB) se guarda **en la base**, no en
  `uploads/`: así sobrevive a los deploys de Render y no queda público.
- Se baja solo por `GET /api/comprobantes/:id/archivo`, que deja pasar al
  locatario que lo subió y a la administración de esa galería. A cualquier otro
  le responde 404.
- Si rechazan un comprobante y el locatario sube otro, el anterior queda en el
  historial como *Rechazado*.
- Los comprobantes de los datos de ejemplo no tienen archivo: figuran como
  *Sin archivo*.

## Cierre del mes ("Liquidar expensas")

La pestaña **Estado de cuenta** del administrador muestra el mes abierto:

- **Saldo anterior**: el saldo final del último cierre (o el saldo inicial que se
  carga ahí mismo, solo antes del primer cierre).
- **Gastos**: los cargados en el mes, ordinarios y extraordinarios.
- **Ingresos**: los pagos aceptados de los locatarios en el mes.
- **Saldo en la cuenta** = saldo anterior + ingresos − gastos.

*Liquidar expensas* muestra la vista previa de lo que va a pagar cada local el
mes siguiente y *Confirmar* cierra el mes: guarda la foto del cierre
(`CierreMes`), baja un PDF con el resumen, emite las liquidaciones nuevas y
avanza el período. A partir de ahí, los gastos del mes cerrado ya no se pueden
editar y la lista de gastos arranca vacía. Para confirmar no puede haber
comprobantes sin revisar.

Lo que paga cada local con contrato vigente en el mes nuevo
(`src/services/calculo.js`, probado con `npm test`):

| Concepto | Cómo se calcula |
| --- | --- |
| Alquiler | El del contrato. Si ese mes le toca actualizar (inicio + frecuencia de Configuración), se le suma el % del índice que el admin carga al liquidar. |
| Expensas | Gastos del mes cerrado × % de expensas del local. Sin % asignado, paga $ 0 (la vista previa avisa). |
| Ajuste | El descuento o cargo extra del mes, si hay. |
| Deuda anterior | Cada mes impago se arrastra con su monto (sin punitorios). |
| Punitorios | Por cada mes adeudado: monto × meses de atraso × tasa (Configuración › "Interés por mora", en % por mes). Interés simple: $ 100 de agosto y $ 100 de septiembre al 5% → en octubre se deben $ 110 + $ 105. |

El locatario ve el cálculo explicado, su **cuenta corriente** mes a mes y baja un
PDF de cada liquidación con el detalle (qué gastos se pagaron y cuánto le toca de
cada uno). Los PDF se arman con `pdfkit` a partir de lo guardado en la base.

Si venís de una base anterior: en SQLite recreala (`npm run seed -- --force`). En
Postgres las columnas se agregan solas y al arrancar se completa el período de
los gastos y de las actualizaciones de los contratos. Ojo: el interés por mora antes
era "% diario" y ahora es "% por mes"; quedó con el valor viejo (0,5): revisalo en
Configuración.

## Stack

- **Node + Express** sirviendo las vistas con **EJS** y una API JSON.
- **Sequelize + Postgres** (con SQLite como fallback para desarrollo local). Las
  tablas se crean y actualizan solas al arrancar (`sequelize.sync({ alter: true })`):
  no hay archivos de migración que mantener.
- **multer** para los archivos que se suben. Las facturas y los contratos van a
  `uploads/`; los comprobantes de pago se guardan en la base (ver abajo).
- El front es el mismo HTML/CSS/JS del prototipo, ahora alimentado por la API.

## Levantarlo en local

```bash
npm install
npm run dev
```

Queda en http://localhost:3000.

**Sin configurar nada** arranca sobre un SQLite local (`dev.sqlite`, ignorado por
git), así cualquiera del grupo puede levantarlo de una. Para desarrollar contra
Postgres de verdad, copiá `.env.example` a `.env` y completá `DATABASE_URL` — por
ejemplo con la *External Database URL* que te da Render. En producción siempre
corre sobre Postgres.

La primera vez que arranca, si la base está vacía, se cargan los datos de ejemplo
del prototipo (22 locales, contratos, gastos). Para recrearlos desde cero:

```bash
npm run seed -- --force   # borra y vuelve a crear las tablas
```

## Deploy en Render

El repo trae `render.yaml`. En Render: **New → Blueprint**, apuntar a este repo y
listo: crea el servicio web y la base Postgres, y las conecta.

> El plan free de Postgres en Render **se vence a los 30 días**. Si pasa eso, hay
> que crear una base nueva, actualizar `DATABASE_URL` y volver a correr el seed.

## El prototipo original

La maqueta que estaba en GitHub Pages quedó congelada en `prototipo/` y se sirve
en **`/prototipo/`** del mismo servicio de Render, así que no hace falta
mantener el Pages aparte. Es HTML estático con los datos escritos a mano: no
toca la base ni la API, y tiene sus propias copias del CSS y el JS para que no
se rompa cuando cambiemos la app.

## Estructura

```
src/
  app.js              arranque, sync de tablas, seed
  db.js               conexión a Postgres
  models/index.js     todos los modelos y sus relaciones
  routes/api.js       la API JSON
  routes/chats.js     la API del chat (con sus propios permisos)
  services/           lógica de dominio y formato de importes
  seed.js             datos de ejemplo
views/                plantillas EJS (index + partials por rol)
public/               CSS y JS del navegador
prototipo/            la maqueta original, congelada, servida en /prototipo/
uploads/              archivos subidos
```

## Decisiones que conviene tener a mano

- **Los importes se guardan en centavos** (enteros) para no arrastrar errores de
  punto flotante. Se formatean a `$ 1.234,56` recién al mostrarlos.
- **Contraseñas hasheadas con bcrypt**, pero sin política ni recuperación por
  mail: el blanqueo la vuelve a `1234`.
- **Cada galería tiene su mes abierto** (`Configuracion.periodoActual`, arranca
  en agosto 2026). Avanza solo con el cierre del mes.

## Lo que falta (buscá `TODO` en el código)

| Tema | Dónde |
| --- | --- |
| Estado de cuenta final de un contrato dado de baja con deuda (hoy la deuda queda en su última liquidación) | `src/services/cierre.js` |
| Declaración de facturación del locatario (alquiler variable) | `src/routes/api.js` |
| Envío de mails (recordatorios, rendición, blanqueo de clave) | `src/routes/api.js` |
| Generación del PDF de la rendición | `views/partials/admin.ejs` |
| Guardar contrato como borrador | `views/partials/admin.ejs` |
| Storage persistente para facturas y contratos (los comprobantes ya van a la base) | `src/routes/api.js` |
