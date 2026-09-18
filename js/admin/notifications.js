/* ---------- Notifications (bell) ---------- */
function refreshNotif(){
  const pend = units.filter(u=>u.comp);
  const badge = document.getElementById('bell-badge');
  badge.textContent = pend.length;
  badge.style.display = pend.length ? 'grid' : 'none';
  const box = document.getElementById('notif');
  box.innerHTML = `<div class="nh">Notificaciones <small>${pend.length} nuevas</small></div>` +
    (pend.length
      ? pend.map(u=>`<div class="ni" role="menuitem" tabindex="0" onclick="fromNotif(${units.indexOf(u)})">
          <div class="ico">🧾</div><div><div class="t">Local ${u.n} · ${u.loc}</div><div class="s">Subió comprobante · ${u.compFecha}</div></div></div>`).join('')
      : '<div class="empty-n">No hay comprobantes pendientes.</div>');
}
function toggleNotif(){
  const box = document.getElementById('notif');
  box.hidden = !box.hidden;
}
function fromNotif(i){
  document.getElementById('notif').hidden = true;
  selectUnit(i);
  document.getElementById('detail-body').scrollIntoView({behavior:'smooth', block:'center'});
}
document.addEventListener('click', e=>{
  const bw = document.getElementById('bell-wrap');
  if(bw && !bw.contains(e.target)) document.getElementById('notif').hidden = true;
});
