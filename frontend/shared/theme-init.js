(() => {
  let theme;
  try {
    theme = localStorage.getItem('baadehasht-theme');
  } catch {}
  if (!['light', 'dark'].includes(theme)) {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
})();
