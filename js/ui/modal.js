/* ---------- Modal ---------- */
function openModal(title, bodyHTML, actions){
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  const foot = document.getElementById('modal-foot'); foot.innerHTML = '';
  actions.forEach(a=>{
    const b = document.createElement('button');
    b.className = 'btn ' + a.cls; b.textContent = a.label; b.onclick = a.fn;
    foot.appendChild(b);
  });
  document.getElementById('modal').hidden = false;
}
function closeModal(){ document.getElementById('modal').hidden = true; }
document.getElementById('modal').addEventListener('click', e=>{ if(e.target.id==='modal') closeModal(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });
