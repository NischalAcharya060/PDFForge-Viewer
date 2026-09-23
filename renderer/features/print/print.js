import { state, quill, tabs, activeTabId } from '../../core/state.js';
import { el } from '../../core/elements.js';
import { showToast } from '../../components/toast.js';
import { hideAllOverlays } from '../../services/document-service.js';
import { editorHasContent } from '../editor/editor.js';

export const printPreviewState = {
  isOpen: false,
  sourceType: null, // "pdf" | "editor"
  totalPages: 1,
  currentPage: 1,
  pagesMode: "all", // "all" | "current" | "custom"
  customRange: "",
  orientation: "portrait", // "portrait" | "landscape"
  colorMode: "color", // "color" | "grayscale"
  copies: 1,
  renderTask: null,
};

export let isPrinting = false;

export function parsePageRange(rangeStr, maxPages) {
  if (!rangeStr || !rangeStr.trim()) return [];
  const parts = rangeStr.split(/[,;\s]+/);
  const result = new Set();
  for (const part of parts) {
    if (!part) continue;
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const lo = Math.max(1, Math.min(start, end));
        const hi = Math.min(maxPages, Math.max(start, end));
        for (let i = lo; i <= hi; i++) result.add(i);
      }
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPages) {
        result.add(page);
      }
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

export function updatePreviewStepperUI() {
  if (el.previewPageNum) {
    el.previewPageNum.value = String(printPreviewState.currentPage);
    el.previewPageNum.max = String(printPreviewState.totalPages);
  }
  if (el.previewPageTotal) {
    el.previewPageTotal.textContent = String(printPreviewState.totalPages);
  }
  if (el.btnPreviewPrev) {
    el.btnPreviewPrev.disabled = printPreviewState.currentPage <= 1;
  }
  if (el.btnPreviewNext) {
    el.btnPreviewNext.disabled = printPreviewState.currentPage >= printPreviewState.totalPages;
  }
}

export async function renderPrintPreviewPage() {
  if (!el.printPreviewSheet) return;
  el.printPreviewSheet.innerHTML = "";
  el.printPreviewSheet.classList.toggle("grayscale", printPreviewState.colorMode === "grayscale");

  const pageNum = printPreviewState.currentPage;

  if (printPreviewState.sourceType === "pdf") {
    const pageIndex = pageNum - 1;
    if (pageIndex < 0 || !state.pages || pageIndex >= state.pages.length) return;
    const p = state.pages[pageIndex];

    let rot = (p.page.rotate + state.rotation) % 360;
    if (printPreviewState.orientation === "landscape") {
      const rawVp = p.page.getViewport({ scale: 1, rotation: rot });
      if (rawVp.height > rawVp.width) rot = (rot + 90) % 360;
    } else if (printPreviewState.orientation === "portrait") {
      const rawVp = p.page.getViewport({ scale: 1, rotation: rot });
      if (rawVp.width > rawVp.height) rot = (rot + 90) % 360;
    }

    const baseVp = p.page.getViewport({ scale: 1, rotation: rot });
    const maxPreviewW = 560;
    const maxPreviewH = 480;
    const scale = Math.min(maxPreviewW / baseVp.width, maxPreviewH / baseVp.height, 1.5);
    const viewport = p.page.getViewport({ scale, rotation: rot });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    el.printPreviewSheet.appendChild(canvas);

    try {
      if (printPreviewState.renderTask) {
        try { printPreviewState.renderTask.cancel(); } catch {}
      }
      printPreviewState.renderTask = p.page.render({ canvasContext: ctx, viewport });
      await printPreviewState.renderTask.promise;
    } catch {
      // Ignored if cancelled
    }
  } else if (printPreviewState.sourceType === "editor") {
    const previewInner = document.createElement("div");
    previewInner.className = "print-editor-preview-inner";
    previewInner.innerHTML = quill && quill.root ? quill.root.innerHTML : "<p></p>";
    if (printPreviewState.orientation === "landscape") {
      previewInner.style.width = "640px";
      previewInner.style.height = "420px";
    } else {
      previewInner.style.width = "480px";
      previewInner.style.height = "520px";
    }
    el.printPreviewSheet.appendChild(previewInner);
  }
}

export async function showPrintPreview() {
  const isEditor = Boolean(state.editor.active && quill);
  const hasDoc = Boolean(state.doc);
  if (!hasDoc && !isEditor) {
    showToast("Open a document to print", "info");
    return;
  }
  if (isEditor && !editorHasContent()) {
    showToast("Document has no content to print", "info");
    return;
  }

  hideAllOverlays();
  if (el.printPreviewModal) el.printPreviewModal.hidden = false;

  printPreviewState.isOpen = true;
  printPreviewState.sourceType = isEditor ? "editor" : "pdf";
  printPreviewState.totalPages = isEditor ? 1 : (state.pages?.length || 1);
  printPreviewState.currentPage = 1;
  printPreviewState.pagesMode = "all";
  printPreviewState.customRange = "";
  printPreviewState.orientation = "portrait";
  printPreviewState.colorMode = "color";
  printPreviewState.copies = 1;

  let docTitle = "Document";
  const currentTab = tabs.find((t) => t.id === activeTabId);
  if (currentTab) docTitle = currentTab.name || "Document";
  else if (state.docName) docTitle = state.docName;
  if (el.previewDocTitle) el.previewDocTitle.textContent = docTitle;

  if (el.printPagesSelect) el.printPagesSelect.value = "all";
  if (el.printPagesCustomWrap) el.printPagesCustomWrap.hidden = true;
  if (el.printPagesCustom) el.printPagesCustom.value = "";
  if (el.printOrientation) el.printOrientation.value = "portrait";
  if (el.printColor) el.printColor.value = "color";
  if (el.printCopies) el.printCopies.value = "1";

  updatePreviewStepperUI();
  await renderPrintPreviewPage();
}

export async function executePrintFromPreview() {
  if (isPrinting) return;
  isPrinting = true;

  const total = printPreviewState.totalPages;
  let pagesToPrint = [];
  if (printPreviewState.sourceType === "pdf") {
    if (printPreviewState.pagesMode === "current") {
      pagesToPrint = [printPreviewState.currentPage];
    } else if (printPreviewState.pagesMode === "custom") {
      pagesToPrint = parsePageRange(el.printPagesCustom ? el.printPagesCustom.value : "", total);
      if (pagesToPrint.length === 0) {
        showToast("Invalid custom range. Printing all pages.", "info");
        pagesToPrint = Array.from({ length: total }, (_, i) => i + 1);
      }
    } else {
      pagesToPrint = Array.from({ length: total }, (_, i) => i + 1);
    }
  }

  hideAllOverlays();
  el.printHost.textContent = "";

  if (printPreviewState.sourceType === "editor" && quill) {
    const sheet = document.createElement("section");
    sheet.className = "print-sheet print-editor-sheet";
    if (printPreviewState.colorMode === "grayscale") {
      sheet.style.filter = "grayscale(100%)";
    }
    sheet.innerHTML = quill.root ? quill.root.innerHTML : "";
    el.printHost.appendChild(sheet);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      el.printHost.textContent = "";
      window.removeEventListener("afterprint", cleanup);
      isPrinting = false;
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 60000);
    return;
  }

  if (printPreviewState.sourceType === "pdf" && state.doc) {
    if (pagesToPrint.length > 5) {
      showToast(`Preparing ${pagesToPrint.length} pages for printing…`, "info");
    }

    try {
      const maxW = 2000;
      for (const pageNum of pagesToPrint) {
        const pageIdx = pageNum - 1;
        if (pageIdx < 0 || pageIdx >= state.pages.length) continue;
        const p = state.pages[pageIdx];

        let rot = (p.page.rotate + state.rotation) % 360;
        if (printPreviewState.orientation === "landscape") {
          const rawVp = p.page.getViewport({ scale: 1, rotation: rot });
          if (rawVp.height > rawVp.width) rot = (rot + 90) % 360;
        } else if (printPreviewState.orientation === "portrait") {
          const rawVp = p.page.getViewport({ scale: 1, rotation: rot });
          if (rawVp.width > rawVp.height) rot = (rot + 90) % 360;
        }

        const vp1 = p.page.getViewport({ scale: 1, rotation: rot });
        const scale = Math.min(2, maxW / vp1.width);
        const viewport = p.page.getViewport({ scale, rotation: rot });
        const sheet = document.createElement("section");
        sheet.className = "print-sheet";
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (printPreviewState.colorMode === "grayscale") {
          canvas.style.filter = "grayscale(100%)";
        }
        sheet.appendChild(canvas);
        el.printHost.appendChild(sheet);
        try {
          await p.page.render({ canvasContext: ctx, viewport }).promise;
        } catch {
          // ignore page render error
        }
        await new Promise((r) => setTimeout(r, 0));
      }

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        el.printHost.textContent = "";
        window.removeEventListener("afterprint", cleanup);
        isPrinting = false;
      };
      window.addEventListener("afterprint", cleanup);
      window.print();
      setTimeout(cleanup, 60000);
    } catch (err) {
      el.printHost.textContent = "";
      isPrinting = false;
      showToast("Could not prepare document for printing", "error");
    }
  }
}

export async function printDocument() {
  await showPrintPreview();
}

