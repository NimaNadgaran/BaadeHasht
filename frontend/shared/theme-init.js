(() => {
  let theme;
  try {
    theme = localStorage.getItem('baadehasht-theme');
  } catch {}
  if (!['light', 'dark'].includes(theme)) {
    const defaultTheme = document.documentElement.dataset.defaultTheme;
    theme = ['light', 'dark'].includes(defaultTheme) ? defaultTheme : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
})();
