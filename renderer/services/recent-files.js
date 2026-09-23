import { state, RECENT_KEY } from '../core/state.js';
import { el } from '../core/elements.js';
import { openDocument } from './document-service.js';
import { showError } from './document-service.js';
// Assuming escapeHtml is available globally or imported, if needed we can import it.
// For now, adhering strictly to preserving the original code.

export function getRecentFiles() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentFile(name, filePath) {
  if (!name || !filePath) return;
  try {
    let list = getRecentFiles();
    list = list.filter((item) => item.path !== filePath);
    list.unshift({ name, path: filePath, time: Date.now() });
    if (list.length > 5) list = list.slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    renderRecentFiles();
  } catch {}
}

export function clearRecentFiles() {
  localStorage.removeItem(RECENT_KEY);
  renderRecentFiles();
}

export function renderRecentFiles() {
  const list = getRecentFiles();
  if (!list.length) {
    el.recentContainer.hidden = true;
    return;
  }
  el.recentContainer.hidden = false;
  el.recentList.innerHTML = "";
  for (const item of list) {
    const row = document.createElement("div");
    row.className = "recent-item";
    row.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6"/>
      </svg>
      <div class="recent-info">
        <span class="recent-name">${escapeHtml(item.name)}</span>
        <span class="recent-path">${escapeHtml(item.path || item.name)}</span>
      </div>
    `;
    row.addEventListener("click", () => {
      openRecentFile(item);
    });
    el.recentList.appendChild(row);
  }
}

export async function openRecentFile(item) {
  if (item.path) {
    try {
      const res = await window.pdfViewer.readFile(item.path);
      if (res && res.data) {
        openDocument(res.data, res.name, item.path);
        return;
      }
    } catch {
      // file might have moved
    }
  }
  showError(new Error(`Could not open "${item.name}". The file may have been moved or deleted.`));
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
