/* ---------- Locatarios ABM ---------- */
function renderAbm(){
  const box = document.getElementById('abm-list');
  box.innerHTML = units.filter(u=>u.st!=='free').map(u=>`
    <div class="abm-row">
      <div class="an">${u.n}</div>
      <div><div class="aname">${u.loc}</div><div class="acontact">${u.email} · ${u.tel}</div></div>
      <div class="aacts">
        <button class="btn btn-ghost btn-sm" onclick="editTenant('${u.n}')">Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="resetPass('${u.loc.replace(/'/g,'')}')">Blanquear clave</button>
      </div>
    </div>`).join('');
}
function editTenant(n){
  const u = units.find(x=>x.n===n);
  openModal(`Editar locatario — Local ${u.n}`,
    `<div class="field" style="margin-bottom:12px"><label>Nombre</label><input value="${u.loc}"></div>
     <div class="field" style="margin-bottom:12px"><label>Email</label><input type="email" value="${u.email}"></div>
     <div class="field"><label>Teléfono</label><input value="${u.tel}"></div>`,
    [{label:'Cancelar', cls:'btn-ghost', fn:closeModal},
     {label:'Guardar cambios', cls:'btn-primary', fn:()=>{ closeModal(); toast('Datos del locatario actualizados'); }}]);
}
function resetPass(name){
  openModal('Blanquear clave',
    `<p style="margin:0">Se enviará un mail a <strong>${name}</strong> con un enlace para que defina una nueva contraseña de acceso a su cuenta.</p>`,
    [{label:'Cancelar', cls:'btn-ghost', fn:closeModal},
     {label:'Enviar mail', cls:'btn-primary', fn:()=>{ closeModal(); toast('Mail para blanquear clave enviado'); }}]);
}
