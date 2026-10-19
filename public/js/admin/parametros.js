/* ---------- Parámetros de la galería (solapa Configuración del panel) ---------- */
async function guardarParametros() {
  const r = await apiEnviar('PUT', '/api/config', {
    indice: document.getElementById('c-indice').value,
    frecuencia: document.getElementById('c-frec').value,
    interesMora: document.getElementById('c-mora').value,
    comision: document.getElementById('c-comision').value,
    diaVencimiento: document.getElementById('c-venc').value,
    diasGracia: document.getElementById('c-gracia').value,
  });
  if (!r.ok) return mostrarError('c-err', r.msg);

  mostrarError('c-err', null);
  await recargarEstado();
  toast('Configuración guardada');
}
