import { state, tabs, activeTabId } from '../core/state.js';
import { el } from '../core/elements.js';
import { toggleFindBar } from '../features/search/search.js';
import { renderRecentFiles, saveRecentFile } from './recent-files.js';
import { updateControls, updateZoomSelect, layoutPages, syncFitButtons, buildPages } from '../features/viewer/viewer.js';
import { buildOutline, buildThumbnails, updateActiveThumb } from '../features/thumbnails/thumbnails.js';
import { renderTabBar, openMultipleFiles } from '../features/tabs/tabs.js';
import { leaveEditor } from '../features/editor/editor.js';
import { getDocument } from '../pdfjs/pdf.mjs';

export async function destroyDocument() {
  toggleFindBar(false);
  for (const p of state.pages) {
    if (p.annotDiv) {
      p.annotDiv.textContent = "";
    }
    if (p.prevTask) {
      try {
        p.prevTask.cancel();
      } catch {
        // ignore
      }
    }
    if (p.textTask) {
      try {
        p.textTask.cancel();
      } catch {
        // ignore
      }
    }
  }
  state.pages = [];
  state.outline = [];
  el.pageHost.textContent = "";
  el.thumbList.textContent = "";
  el.outlineList.textContent = "";
  if (state.loadingTask) {
    try {
      await state.loadingTask.destroy();
    } catch {
      // ignore
    }
    state.loadingTask = null;
  }
  if (state.doc) {
    try {
      await state.doc.destroy();
    } catch {
      // ignore
    }
  }
  state.doc = null;
  state.passwordCallback = null;
}

export function setLoading(on) {
  el.loadingBar.hidden = !on;
}

export function showEmpty() {
  el.emptyState.hidden = false;
  el.errorState.hidden = true;
  el.docName.textContent = "PDFForge Viewer";
  el.docName.title = "No document opened";
  document.title = "PDFForge Viewer";
  renderRecentFiles();
  updateControls();
}

export function showError(err) {
  const msg = err && err.message ? err.message : "The file could not be read or is not a valid PDF.";
  window.__pdfViewerError = msg;
  el.errorTitle.textContent = "Couldn't open this file";
  el.errorMessage.textContent = msg;
  el.errorState.hidden = false;
  el.emptyState.hidden = true;
  updateControls();
}

export function hideAllOverlays() {
  el.passwordModal.hidden = true;
  el.dropOverlay.hidden = true;
  if (el.propertiesModal) el.propertiesModal.hidden = true;
  if (el.shortcutsModal) el.shortcutsModal.hidden = true;
  if (el.aboutModal) el.aboutModal.hidden = true;
  if (el.printPreviewModal) el.printPreviewModal.hidden = true;
  if (el.fileAssocModal) el.fileAssocModal.hidden = true;
}

function showPasswordModal(note) {
  el.passwordNote.textContent = note;
  el.passwordError.hidden = true;
  el.passwordModal.hidden = false;
  el.passwordInput.value = "";
  setTimeout(() => el.passwordInput.focus(), 0);
}

export async function openDocument(data, name, filePath) {
  if (!leaveEditor()) return;
  hideAllOverlays();
  setLoading(true);
  el.errorState.hidden = true;
  el.emptyState.hidden = true;
  el.pageHost.textContent = "";
  state.passwordValue = null;
  state.rotation = 0;
  state.filePath = filePath || null;
  state.data = data;
  await destroyDocument();
  try {
    const task = getDocument({ data, password: state.passwordValue });
    task.onPassword = (update, reason) => {
      state.passwordCallback = update;
      const prompt = reason === 2 ? "The password is incorrect. Try again." : "This PDF requires a password to open.";
      showPasswordModal(prompt);
    };
    state.loadingTask = task;
    state.doc = await task.promise;
    state.name = name;
    state.currentPage = 1;
    document.title = `${name} — PDFForge Viewer`;
    el.docName.textContent = name;
    el.docName.title = filePath ? `${name} (${filePath})` : name;
    saveRecentFile(name, filePath);
    await buildPages(state.doc);
    await buildOutline(state.doc);
    // Note: To avoid circular dependency with tabs state, we access it via state or imports.
    // However, the original code used global tabs array.
    // We assume tabs and activeTabId are imported from state.js or tabs.js
    // Let's import them from state.js
    const currentTab = tabs ? tabs.find((t) => t.id === activeTabId) : null;
    if (currentTab) {
      currentTab.type = "pdf";
      currentTab.name = name;
      currentTab.filePath = filePath;
      currentTab.data = data;
      currentTab.doc = state.doc;
      currentTab.pages = state.pages;
      currentTab.outline = state.outline;
    }
    renderTabBar();
    layoutPages();
    buildThumbnails();
    updateZoomSelect();
    syncFitButtons();
    updateControls();
    updateActiveThumb();
    el.pageHost.scrollTo({ top: 0 });
    state.renderSeq++;
  } catch (err) {
    if (err && err.name === "PasswordException") {
      showPasswordModal("This PDF requires a password to open.");
    } else {
      showError(err);
    }
  } finally {
    setLoading(false);
  }
}

export async function openFromDialog() {
  const res = await window.pdfViewer.openDialog();
  if (!res || res.canceled) return;
  const files = res.files && res.files.length ? res.files : [{ name: res.name, path: res.path, data: res.data }];
  openMultipleFiles(files);
}
