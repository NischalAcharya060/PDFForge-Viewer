import { state, tabs, activeTabId } from '../core/state.js';
import { el } from '../core/elements.js';
import { savePdf } from '../features/editor/editor.js';
import { showToast } from './toast.js';

let pendingAction = null;

export function hasAnyUnsavedWork() {
  if (state.editor.active && state.editor.dirty) return true;
  if (state.pdfModified) return true;
  for (const tab of tabs) {
    if (tab.type === "editor" && tab.editor?.dirty) return true;
    if (tab.dirty) return true;
  }
  return false;
}

export function getUnsavedDocumentName() {
  if (state.editor.active && state.editor.dirty) {
    return state.editor.fileName || "Document1";
  }
  const dirtyTab = tabs.find((t) =>
    (t.type === "editor" && (t.editor?.dirty || (t.id === activeTabId && state.editor.dirty))) || t.dirty
  );
  return dirtyTab ? dirtyTab.name : "Document1";
}

function resolveUnsavedAction(action) {
  hideUnsavedWarningModal();
  if (pendingAction) {
    const fn = pendingAction;
    pendingAction = null;
    fn(action);
    return;
  }
  if (action === "cancel") {
    if (window.pdfViewer?.confirmClose) window.pdfViewer.confirmClose("cancel");
    return;
  }
  if (action === "discard") {
    state.editor.dirty = false;
    tabs.forEach((t) => {
      t.dirty = false;
      if (t.editor) t.editor.dirty = false;
    });
    if (window.pdfViewer?.confirmClose) window.pdfViewer.confirmClose("close");
    return;
  }
  if (action === "save") {
    void (async () => {
      try {
        await savePdf();
        state.editor.dirty = false;
        tabs.forEach((t) => {
          t.dirty = false;
          if (t.editor) t.editor.dirty = false;
        });
        if (window.pdfViewer?.confirmClose) window.pdfViewer.confirmClose("close");
      } catch {
        showToast("Save was cancelled. Your document is still open.", "info");
      }
    })();
  }
}

export function showUnsavedWarningModal({ allowSave = true, fileName = "", message = "" } = {}) {
  if (!el.unsavedWarningModal) {
    if (pendingAction) {
      const fn = pendingAction;
      pendingAction = null;
      fn("discard");
    } else if (window.pdfViewer?.confirmClose) {
      window.pdfViewer.confirmClose("close");
    }
    return;
  }
  if (el.unsavedDocName) el.unsavedDocName.textContent = fileName || getUnsavedDocumentName();
  if (el.unsavedWarningText && message) el.unsavedWarningText.textContent = message;
  if (el.unsavedBtnSave) el.unsavedBtnSave.hidden = !allowSave;
  el.unsavedWarningModal.hidden = false;
}

export function confirmUnsavedWork({ allowSave = true, fileName = "", message = "" } = {}) {
  return new Promise((resolve) => {
    pendingAction = resolve;
    showUnsavedWarningModal({ allowSave, fileName, message });
  });
}

export function hideUnsavedWarningModal() {
  if (el.unsavedWarningModal) el.unsavedWarningModal.hidden = true;
}

export function setupBeforeUnload() {
  if (el.unsavedBtnCancel) {
    el.unsavedBtnCancel.addEventListener("click", () => resolveUnsavedAction("cancel"));
  }

  if (el.unsavedBtnDiscard) {
    el.unsavedBtnDiscard.addEventListener("click", () => resolveUnsavedAction("discard"));
  }

  if (el.unsavedBtnSave) {
    el.unsavedBtnSave.addEventListener("click", () => resolveUnsavedAction("save"));
  }

  if (window.pdfViewer?.onCloseRequested) {
    window.pdfViewer.onCloseRequested(() => {
      if (hasAnyUnsavedWork()) {
        showUnsavedWarningModal();
      } else {
        if (window.pdfViewer?.confirmClose) window.pdfViewer.confirmClose("close");
      }
    });
  }

  window.addEventListener("beforeunload", (e) => {
    if (hasAnyUnsavedWork()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}