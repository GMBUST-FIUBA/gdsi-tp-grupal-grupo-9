/* ---------- Estado de cuenta por local ---------- */
function renderAccounts(){
  const box = document.getElementById('acct-rows');
  box.innerHTML = units.map(u=>{
    if(u.st==='free') return `<tr><td>Local ${u.n}</td><td>—</td><td class="r mono">—</td><td class="r mono">—</td><td class="r mono">—</td><td class="r"><span class="st-tag abierto">Libre</span></td></tr>`;
    const saldo = (u.cob==='$ 0,00') ? u.fact : '$ 0,00';
    const tag = u.cob===u.fact ? '<span class="st-tag pagado">Saldado</span>' :
                (u.st==='late' ? '<span class="st-tag mora">En mora</span>' : '<span class="st-tag pend">Pendiente</span>');
    return `<tr><td>Local ${u.n}</td><td>${u.loc}</td><td class="r mono">${u.fact}</td><td class="r mono">${u.cob}</td><td class="r mono">${saldo}</td><td class="r">${tag}</td></tr>`;
  }).join('');
}
