// Progressive enhancement only — every page works without this file.
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.dataset.confirm && !window.confirm(f.dataset.confirm)) { e.preventDefault(); return; }
  if (f.dataset.busy) {
    const b = f.querySelector('button');
    if (b) { b.disabled = true; b.textContent = f.dataset.busy; }
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-autosubmit]')) t.form.submit();
  if (t.matches('[data-toggle-all]')) {
    t.closest('table').querySelectorAll('tbody input[name="include"]').forEach((c) => { c.checked = t.checked; });
  }
});
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-print]')) window.print();
});
// Show thousands separators while typing amounts, strip them on submit
document.addEventListener('blur', (e) => {
  const t = e.target;
  if (!t.matches || !t.matches('input.num') || t.value === '') return;
  const n = Number(t.value.replace(/,/g, ''));
  if (Number.isFinite(n)) t.value = n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}, true);
