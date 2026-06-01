
(function(){
  const root = document.documentElement;
  const saved = localStorage.getItem('nrg-theme') || 'sunburst';
  const themeButtons = Array.from(document.querySelectorAll('.theme-row [data-theme]'));
  function applyTheme(theme){
    root.setAttribute('data-theme', theme);
    localStorage.setItem('nrg-theme', theme);
    themeButtons.forEach(btn => btn.setAttribute('aria-pressed', String(btn.getAttribute('data-theme') === theme)));
  }
  applyTheme(saved);
  themeButtons.forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.getAttribute('data-theme')));
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
