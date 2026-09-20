/* ---------- File inputs ---------- */
function fileChosen(input, boxId, tId, txt) {
  if (!input.files.length) return;
  const box = document.getElementById(boxId);
  box.classList.add('has');
  document.getElementById(tId).textContent = txt + ' · ' + input.files[0].name;
}
