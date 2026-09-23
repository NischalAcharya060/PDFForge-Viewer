import { state } from '../core/state.js';

export function applyTheme(theme, persist) {
  if (theme === state.currentTheme) return;
  state.currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  window.pdfViewer.setTheme(theme);
  if (persist) localStorage.setItem("viewer-theme", theme);
}

export function toggleTheme() {
  applyTheme(state.currentTheme === "dark" ? "light" : "dark", true);
}
