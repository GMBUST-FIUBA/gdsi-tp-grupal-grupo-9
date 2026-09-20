/* ---------- Toast ---------- */
let toastT;
function toast(msg){
  const el = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  el.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(()=>el.classList.remove('show'), 2600);
}
