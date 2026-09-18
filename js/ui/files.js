function makeDemoFileUrl(filename){
  const ext = filename.split('.').pop().toLowerCase();
  const mime = ext==='pdf' ? 'application/pdf' : (ext==='png' ? 'image/png' : 'image/jpeg');
  return URL.createObjectURL(new Blob([`Factura simulada · ${filename}`], {type: mime}));
}

/* ---------- File inputs ---------- */
function fileChosen(input, boxId, tId, txt){
  if(!input.files.length) return;
  const box = document.getElementById(boxId);
  box.classList.add('has');
  document.getElementById(tId).textContent = txt + ' · ' + input.files[0].name;
}
