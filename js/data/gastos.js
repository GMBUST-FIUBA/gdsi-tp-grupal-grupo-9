/* ---------- Gastos ---------- */
const proveedores = [
  {id:1, nombre:'Edenor'},
  {id:2, nombre:'AySA'},
  {id:3, nombre:'Limpieza Total SRL'},
  {id:4, nombre:'Seguridad Belgrano'},
  {id:5, nombre:'Estudio Ríos'},
];
let gastoSeq = 3;
let gastos = [
  {id:1, tipo:'ordinario', proveedorId:1, facturaTipo:'Factura B', facturaNro:'0001-00004521', desc:'Consumo eléctrico de agosto', monto:185000, archivoNombre:'edenor_ago2026.pdf', archivoUrl:null, fecha:'2026-08-05'},
  {id:2, tipo:'ordinario', proveedorId:5, facturaTipo:'Factura C', facturaNro:'0002-00000891', desc:'Honorarios de administración · agosto', monto:420000, archivoNombre:'honorarios_ago2026.pdf', archivoUrl:null, fecha:'2026-08-03'},
  {id:3, tipo:'extraordinario', proveedorId:3, facturaTipo:'Ticket', facturaNro:'0001-00000142', desc:'Reparación de bomba de agua', monto:96000, archivoNombre:null, archivoUrl:null, fecha:'2026-08-14'},
];
const tiposFactura = ['Factura A','Factura B','Factura C','Recibo','Ticket'];

gastos.forEach(g=>{ if(g.archivoNombre) g.archivoUrl = makeDemoFileUrl(g.archivoNombre); });
