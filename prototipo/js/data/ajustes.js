let ajustesExpensas = {};
function ajusteDeltaCents(n){
  const a = ajustesExpensas[n];
  if(!a) return 0;
  return a.tipo==='descuento' ? -a.montoCents : a.montoCents;
}
function expensasEfectivasCents(u){ return u.expCents + ajusteDeltaCents(u.n); }
function totalEfectivoCents(u){ return u.totCents + ajusteDeltaCents(u.n); }
