/* ---------- Plan (just tiles) ---------- */
const plan = document.getElementById('plan');
function renderPlan(){
  plan.innerHTML = '';
  units.forEach((u,i)=>{
    const b = document.createElement('button');
    b.className = 'unit' + (i===selectedIdx?' selected':'');
    b.dataset.st = u.st; b.dataset.i = i;
    b.setAttribute('aria-label', `Local ${u.n}, ${stLabel[u.st]}`);
    let flag = '';
    if(u.nuevo) flag = '<span class="flag new">ALTA</span>';
    else if(u.baja) flag = '<span class="flag rec">BAJA</span>';
    b.innerHTML = `${flag}<span class="u-num">${u.n}</span><span class="u-dot"></span>`;
    b.addEventListener('click', ()=>selectUnit(i));
    plan.appendChild(b);
  });
}
