/* ---------- KPIs del panel ---------- */
/* Antes estaban escritos a mano en el HTML; ahora salen de los locales. */
function renderKpis() {
  const ocupados = units.filter((u) => u.st !== 'free');
  const libres = units.length - ocupados.length;

  let facturado = 0;
  let cobrado = 0;
  let mora = 0;
  let localesEnMora = 0;

  ocupados.forEach((u) => {
    const total = totalEfectivoCents(u);
    facturado += total;
    cobrado += u.cobCents;
    if (u.cobCents < total) {
      mora += total - u.cobCents;
      if (u.st === 'late') localesEnMora++;
    }
  });

  const pctCobrado = facturado ? Math.round((cobrado / facturado) * 100) : 0;

  document.getElementById('kpi-occ').innerHTML =
    `${ocupados.length}<span style="color:var(--muted);font-size:1rem"> / ${units.length}</span>`;
  document.getElementById('kpi-occ-foot').textContent =
    libres === 1 ? '1 local libre' : `${libres} locales libres`;
  document.getElementById('kpi-fact').textContent = centsToMoney(facturado);
  document.getElementById('kpi-cob').textContent = centsToMoney(cobrado);
  document.getElementById('kpi-cob-foot').textContent = `${pctCobrado}% del total`;
  document.getElementById('kpi-mora').textContent = centsToMoney(mora);
  document.getElementById('kpi-mora-foot').textContent =
    localesEnMora === 1 ? '1 local con atraso' : `${localesEnMora} locales con atraso`;
}
