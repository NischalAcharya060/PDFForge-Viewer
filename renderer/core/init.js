import "../polyfills.js";
import { getDocument, GlobalWorkerOptions } from "../pdfjs/pdf.mjs";

const worker = new Worker(new URL("../pdf-worker.mjs", import.meta.url), { type: "module" });
GlobalWorkerOptions.workerPort = worker;

// Core
import { state, MIN_ZOOM, MAX_ZOOM, tabs, activeTabId, quill, editorBusy, docZoomScale, contextMenuTargetTabId, setDocZoomScale } from './state.js';
import { el } from './elements.js';

// Utils
import { clamp } from '../utils/helpers.js';
import { applyTheme, toggleTheme } from '../utils/theme.js';

// Components
import { showToast } from '../components/toast.js';
import { getOrFetchAppInfo, showAboutModal, copyAboutInfo } from '../components/about-modal.js';
import { showPropertiesModal, copyPropertiesInfo } from '../components/properties-modal.js';
import { showShortcutsModal } from '../components/shortcuts-modal.js';
import { showPasswordModal, hidePasswordModal, submitPassword } from '../components/password-modal.js';
import { hasAnyUnsavedWork, showUnsavedWarningModal, hideUnsavedWarningModal, setupBeforeUnload } from '../components/unsaved-warning.js';
import { initFileAssocModal, showFileAssocModal } from '../components/file-assoc-modal.js';

// Services
import { openDocument, destroyDocument, openFromDialog, hideAllOverlays, showEmpty, showError } from '../services/document-service.js';
import { clearRecentFiles, renderRecentFiles } from '../services/recent-files.js';
import { persistPdfOptions } from '../services/pdf-options.js';

// Features — Tabs
import { createNewTab, closeTab, cycleTabs, openMultipleFiles, toggleTwoPage, toggleSplitView, closeSplitView, setupSplitDivider, renderTabBar, snapshotCurrentTab, restoreTab, showTabContextMenu, hideTabContextMenu, closeOtherTabs, closeTabsToRight, duplicateTab } from '../features/tabs/tabs.js';

// Features — Viewer
import { layoutPages, computeCurrentPage, collectVisiblePages, scrollToPage, prevPage, nextPage, setFit, zoomIn, zoomOut, zoomBy, actualSize, rotateClockwise, syncFitButtons, addBlankPageToCurrentDoc, appendPdfToCurrentDoc } from '../features/viewer/viewer.js';

// Features — Editor
import { initQuill, openTextEditor, newTextFile, exitEditor, leaveEditor, savePdf, setEditorStatus, updateEditorChrome, insertWordPageBreak, insertWordHr, applyEditorLineSpacing, syncOptionsFromFields, toggleEditorOptions, zoomDocIn, zoomDocOut, updateDocZoom } from '../features/editor/editor.js';

// Features — Thumbnails
import { toggleThumbnails, switchSidebarTab, queueThumbRenders } from '../features/thumbnails/thumbnails.js';

// Features — Search
import { debounceSearch, toggleFindBar, executeSearch, findNext, findPrev, searchDebounceTimer } from '../features/search/search.js';

// Features — Print
import { printPreviewState, updatePreviewStepperUI, renderPrintPreviewPage, executePrintFromPreview, printDocument } from '../features/print/print.js';

// Features — Image Editor
import { bindImageModalEvents } from '../features/image-editor/image-editor.js';

let dragDepth = 0;

function bindEvents() {
  if (el.btnNewTab) el.btnNewTab.addEventListener("click", () => createNewTab());
  if (el.btnSplitView) el.btnSplitView.addEventListener("click", toggleSplitView);
  if (el.btnCloseSplit) el.btnCloseSplit.addEventListener("click", closeSplitView);
  if (el.btnTwoPage) el.btnTwoPage.addEventListener("click", toggleTwoPage);
  if (el.btnAddPage) {
    el.btnAddPage.addEventListener("click", (e) => {
      e.stopPropagation();
      if (el.addPageMenu) el.addPageMenu.hidden = !el.addPageMenu.hidden;
    });
  }
  if (el.btnAddBlankPage) {
    el.btnAddBlankPage.addEventListener("click", () => {
      if (el.addPageMenu) el.addPageMenu.hidden = true;
      addBlankPageToCurrentDoc();
    });
  }
  if (el.btnAppendPdfPages) {
    el.btnAppendPdfPages.addEventListener("click", () => {
      if (el.addPageMenu) el.addPageMenu.hidden = true;
      appendPdfToCurrentDoc();
    });
  }
  window.addEventListener("click", (e) => {
    if (el.addPageMenu && !e.target.closest(".dropdown-wrapper")) {
      el.addPageMenu.hidden = true;
    }
    if (el.tabContextMenu && !e.target.closest("#tab-context-menu")) {
      hideTabContextMenu();
    }
  });

  if (el.ctxCloseTab) {
    el.ctxCloseTab.addEventListener("click", () => {
      if (contextMenuTargetTabId) closeTab(contextMenuTargetTabId);
      hideTabContextMenu();
    });
  }
  if (el.ctxCloseOthers) {
    el.ctxCloseOthers.addEventListener("click", () => {
      if (contextMenuTargetTabId) closeOtherTabs(contextMenuTargetTabId);
    });
  }
  if (el.ctxCloseRight) {
    el.ctxCloseRight.addEventListener("click", () => {
      if (contextMenuTargetTabId) closeTabsToRight(contextMenuTargetTabId);
    });
  }
  if (el.ctxDuplicateTab) {
    el.ctxDuplicateTab.addEventListener("click", () => {
      if (contextMenuTargetTabId) duplicateTab(contextMenuTargetTabId);
    });
  }
  if (el.ctxNewTab) {
    el.ctxNewTab.addEventListener("click", () => {
      hideTabContextMenu();
      createNewTab();
    });
  }

  setupSplitDivider();

  if (el.tabsList) {
    el.tabsList.addEventListener("wheel", (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.tabsList.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }
  if (el.tabBar) {
    el.tabBar.addEventListener("dblclick", (e) => {
      if (e.target === el.tabBar || e.target === el.tabsList || e.target.classList.contains("chrome-tab-spacer")) {
        createNewTab();
      }
    });
  }

  if (el.btnNew) el.btnNew.addEventListener("click", newTextFile);
  el.btnOpen.addEventListener("click", openFromDialog);
  if (el.btnSave) el.btnSave.addEventListener("click", savePdf);
  el.btnOpenEmpty.addEventListener("click", openFromDialog);
  if (el.btnNewEmpty) el.btnNewEmpty.addEventListener("click", newTextFile);
  el.btnErrorOpen.addEventListener("click", openFromDialog);
  el.btnErrorDismiss.addEventListener("click", showEmpty);
  el.btnPrint.addEventListener("click", printDocument);
  if (el.btnClearRecent) el.btnClearRecent.addEventListener("click", clearRecentFiles);
  if (el.btnFind) el.btnFind.addEventListener("click", () => toggleFindBar());
  if (el.btnInfo) el.btnInfo.addEventListener("click", showPropertiesModal);
  if (el.btnShortcuts) el.btnShortcuts.addEventListener("click", showShortcutsModal);
  if (el.btnAbout) el.btnAbout.addEventListener("click", showAboutModal);
  if (el.appBrandBtn) {
    el.appBrandBtn.addEventListener("click", showAboutModal);
    el.appBrandBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showAboutModal();
      }
    });
  }
  if (el.btnEmptyAbout) el.btnEmptyAbout.addEventListener("click", showAboutModal);
  if (el.btnPropertiesClose) el.btnPropertiesClose.addEventListener("click", hideAllOverlays);
  if (el.btnPropertiesCopy) el.btnPropertiesCopy.addEventListener("click", copyPropertiesInfo);
  if (el.btnShortcutsClose) el.btnShortcutsClose.addEventListener("click", hideAllOverlays);
  if (el.btnAboutClose) el.btnAboutClose.addEventListener("click", hideAllOverlays);
  if (el.btnAboutCopy) el.btnAboutCopy.addEventListener("click", copyAboutInfo);
  if (el.btnAboutFileAssoc) el.btnAboutFileAssoc.addEventListener("click", showFileAssocModal);

  initFileAssocModal();

  if (el.btnPrintPreviewClose) el.btnPrintPreviewClose.addEventListener("click", hideAllOverlays);
  if (el.btnPrintCancel) el.btnPrintCancel.addEventListener("click", hideAllOverlays);
  if (el.btnPrintConfirm) el.btnPrintConfirm.addEventListener("click", executePrintFromPreview);

  if (el.btnPreviewPrev) {
    el.btnPreviewPrev.addEventListener("click", () => {
      if (printPreviewState.currentPage > 1) {
        printPreviewState.currentPage--;
        updatePreviewStepperUI();
        renderPrintPreviewPage();
      }
    });
  }

  if (el.btnPreviewNext) {
    el.btnPreviewNext.addEventListener("click", () => {
      if (printPreviewState.currentPage < printPreviewState.totalPages) {
        printPreviewState.currentPage++;
        updatePreviewStepperUI();
        renderPrintPreviewPage();
      }
    });
  }

  if (el.previewPageNum) {
    el.previewPageNum.addEventListener("change", (e) => {
      let page = parseInt(e.target.value, 10);
      if (isNaN(page)) page = 1;
      page = Math.max(1, Math.min(printPreviewState.totalPages, page));
      printPreviewState.currentPage = page;
      updatePreviewStepperUI();
      renderPrintPreviewPage();
    });
  }

  if (el.printPagesSelect) {
    el.printPagesSelect.addEventListener("change", (e) => {
      printPreviewState.pagesMode = e.target.value;
      if (el.printPagesCustomWrap) {
        el.printPagesCustomWrap.hidden = e.target.value !== "custom";
        if (e.target.value === "custom" && el.printPagesCustom) {
          el.printPagesCustom.focus();
        }
      }
    });
  }

  if (el.printColor) {
    el.printColor.addEventListener("change", (e) => {
      printPreviewState.colorMode = e.target.value;
      if (el.printPreviewSheet) {
        el.printPreviewSheet.classList.toggle("grayscale", e.target.value === "grayscale");
      }
    });
  }

  if (el.printOrientation) {
    el.printOrientation.addEventListener("change", (e) => {
      printPreviewState.orientation = e.target.value;
      renderPrintPreviewPage();
    });
  }

  if (el.printCopies) {
    el.printCopies.addEventListener("change", (e) => {
      let c = parseInt(e.target.value, 10);
      if (isNaN(c) || c < 1) c = 1;
      printPreviewState.copies = c;
    });
  }

  [el.propertiesModal, el.shortcutsModal, el.passwordModal, el.aboutModal, el.printPreviewModal].forEach((overlay) => {
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          if (overlay === el.passwordModal) {
            hidePasswordModal();
            showError(new Error("This PDF requires a password. It was not opened."));
          } else {
            hideAllOverlays();
          }
        }
      });
    }
  });

  if (el.tabThumbs) el.tabThumbs.addEventListener("click", () => switchSidebarTab("thumbs"));
  if (el.tabOutline) el.tabOutline.addEventListener("click", () => switchSidebarTab("outline"));

  if (el.findClose) el.findClose.addEventListener("click", () => toggleFindBar(false));
  if (el.findPrev) el.findPrev.addEventListener("click", () => findPrev());
  if (el.findNext) el.findNext.addEventListener("click", () => findNext());
  if (el.findInput) {
    el.findInput.addEventListener("input", (e) => debounceSearch(e.target.value));
    el.findInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(searchDebounceTimer);
        const query = el.findInput.value.trim();
        if (query !== state.search.query) {
          executeSearch(query);
        } else {
          if (e.shiftKey) findPrev();
          else findNext();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        toggleFindBar(false);
      }
    });
  }
  el.btnPrev.addEventListener("click", prevPage);
  el.btnNext.addEventListener("click", () => nextPage());
  el.btnZoomIn.addEventListener("click", zoomIn);
  el.btnZoomOut.addEventListener("click", zoomOut);
  if (el.btnRotate) el.btnRotate.addEventListener("click", rotateClockwise);
  el.btnFitWidth.addEventListener("click", () => setFit("fit-width"));
  el.btnFitPage.addEventListener("click", () => setFit("fit-page"));
  el.btnThumbs.addEventListener("click", toggleThumbnails);
  el.btnTheme.addEventListener("click", toggleTheme);

  if (el.btnEditorClose) el.btnEditorClose.addEventListener("click", exitEditor);
  if (el.btnEditorSave) el.btnEditorSave.addEventListener("click", savePdf);
  if (el.btnEditorOptions) el.btnEditorOptions.addEventListener("click", toggleEditorOptions);
  if (el.editorNameInput) {
    el.editorNameInput.addEventListener("input", (e) => {
      const val = e.target.value.trim() || "Document";
      state.editor.fileName = val;
      state.editor.dirty = true;
      updateEditorChrome();
    });
  }
  if (el.btnRibbonUndo) {
    el.btnRibbonUndo.addEventListener("click", () => {
      if (quill && quill.history) quill.history.undo();
    });
  }
  if (el.btnRibbonRedo) {
    el.btnRibbonRedo.addEventListener("click", () => {
      if (quill && quill.history) quill.history.redo();
    });
  }
  if (el.btnInsertPageBreak) {
    el.btnInsertPageBreak.addEventListener("click", () => {
      insertWordPageBreak();
    });
  }
  if (el.btnInsertHr) {
    el.btnInsertHr.addEventListener("click", () => {
      insertWordHr();
    });
  }
  if (el.ribbonLineSpacing) {
    el.ribbonLineSpacing.addEventListener("change", () => {
      const spacing = parseFloat(el.ribbonLineSpacing.value) || 1.15;
      if (state.editor.options) {
        state.editor.options.lineSpacing = spacing;
        if (el.optLineSpacing) el.optLineSpacing.value = String(spacing);
        persistPdfOptions();
      }
      applyEditorLineSpacing();
      if (state.editor.active) {
        state.editor.dirty = true;
        updateEditorChrome();
      }
    });
  }
  if (el.btnDocZoomIn) el.btnDocZoomIn.addEventListener("click", zoomDocIn);
  if (el.btnDocZoomOut) el.btnDocZoomOut.addEventListener("click", zoomDocOut);

  if (el.editorOptions) {
    for (const control of [el.optPaperSize, el.optFontSize, el.optLineSpacing, el.optMargin, el.optPageNumbers, el.optAuthor]) {
      control.addEventListener("change", syncOptionsFromFields);
    }
    if (el.optTitle) el.optTitle.addEventListener("input", syncOptionsFromFields);
  }
  if (quill) {
    quill.on("text-change", () => {
      if (editorBusy) return;
      state.editor.dirty = true;
      setEditorStatus("");
      updateEditorChrome();
    });
  }

  if (el.pageJumpInput) {
    const handleJump = () => {
      const val = parseInt(el.pageJumpInput.value, 10);
      if (Number.isInteger(val) && val >= 1 && val <= state.pages.length) {
        if (val !== state.currentPage) {
          scrollToPage(val - 1);
        }
      } else {
        el.pageJumpInput.value = String(state.currentPage);
      }
    };
    el.pageJumpInput.addEventListener("focus", () => el.pageJumpInput.select());
    el.pageJumpInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleJump();
        el.pageHost.focus();
      } else if (e.key === "Escape") {
        el.pageJumpInput.value = String(state.currentPage);
        el.pageHost.focus();
      }
    });
    el.pageJumpInput.addEventListener("blur", handleJump);
  }

  el.zoomSelect.addEventListener("change", () => {
    const value = Number(el.zoomSelect.value);
    if (!value) return;
    state.zoom = clamp(value / 100, MIN_ZOOM, MAX_ZOOM);
    state.layoutMode = "fixed";
    layoutPages();
    syncFitButtons();
  });

  el.btnPasswordOk.addEventListener("click", submitPassword);
  el.passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPassword();
  });
  el.btnPasswordCancel.addEventListener("click", () => {
    hidePasswordModal();
    showError(new Error("This PDF requires a password. It was not opened."));
  });

  el.thumbList.addEventListener("click", (e) => {
    const item = e.target.closest(".thumb");
    if (!item) return;
    const index = Number(item.dataset.index);
    if (Number.isInteger(index)) scrollToPage(index);
  });

  let scrollFrame = null;
  el.pageHost.addEventListener(
    "scroll",
    () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        computeCurrentPage();
        collectVisiblePages();
      });
    },
    { passive: true }
  );

  let thumbScrollFrame = null;
  const onThumbScroll = () => {
    if (thumbScrollFrame) return;
    thumbScrollFrame = requestAnimationFrame(() => {
      thumbScrollFrame = null;
      queueThumbRenders();
    });
  };
  el.thumbnails.addEventListener("scroll", onThumbScroll, { passive: true });
  el.thumbList.addEventListener("scroll", onThumbScroll, { passive: true });

  window.addEventListener("resize", () => {
    layoutPages();
    queueThumbRenders();
  });

  // Ctrl + Mouse Wheel to zoom
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (state.editor.active) {
          if (e.deltaY < 0) zoomDocIn();
          else if (e.deltaY > 0) zoomDocOut();
        } else {
          if (e.deltaY < 0) zoomIn();
          else if (e.deltaY > 0) zoomOut();
        }
      }
    },
    { passive: false }
  );

  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    if (dragDepth > 0 && el.dropOverlay) el.dropOverlay.hidden = false;
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) el.dropOverlay.hidden = true;
  });
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragDepth = 0;
    el.dropOverlay.hidden = true;
    const dropped = Array.from(e.dataTransfer?.files || []).filter((f) => /\.pdf$/i.test(f.name));
    if (!dropped.length) {
      if (state.doc || state.editor.active) {
        showToast("Only PDF files can be opened", "error");
      } else {
        showError(new Error("Only PDF files can be opened."));
      }
      return;
    }
    const filesToOpen = [];
    for (const file of dropped) {
      const path = window.pdfViewer.getPathForFile ? window.pdfViewer.getPathForFile(file) : null;
      const buffer = new Uint8Array(await file.arrayBuffer());
      filesToOpen.push({ name: file.name, path, data: buffer });
    }
    openMultipleFiles(filesToOpen);
  });

  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    if (mod) {
      const k = key.toLowerCase();
      if (k === "t") {
        e.preventDefault();
        createNewTab();
        return;
      }
      if (k === "w") {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
        return;
      }
      if (key === "Tab") {
        e.preventDefault();
        cycleTabs(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.altKey && k === "2") {
        e.preventDefault();
        toggleTwoPage();
        return;
      }
      if (e.altKey && k === "s") {
        e.preventDefault();
        toggleSplitView();
        return;
      }
      if (/^[1-9]$/.test(k)) {
        const tabIdx = parseInt(k, 10) - 1;
        if (tabs[tabIdx] && tabs[tabIdx].id !== activeTabId) {
          e.preventDefault();
          snapshotCurrentTab();
          restoreTab(tabs[tabIdx]);
          return;
        }
      }
      if (k === "n") {
        e.preventDefault();
        newTextFile();
        return;
      }
      if (k === "s") {
        e.preventDefault();
        savePdf();
        return;
      }
      if (k === "o") {
        e.preventDefault();
        openFromDialog();
        return;
      }
      if (k === "p") {
        e.preventDefault();
        printDocument();
        return;
      }
      if (k === "d") {
        if (state.editor.active) return;
        e.preventDefault();
        showPropertiesModal();
        return;
      }
      if (k === "=" || k === "+" || key === "Add") {
        e.preventDefault();
        if (state.editor.active) zoomDocIn();
        else zoomIn();
        return;
      }
      if (k === "-" || key === "Subtract") {
        e.preventDefault();
        if (state.editor.active) zoomDocOut();
        else zoomOut();
        return;
      }
      if (k === "0") {
        e.preventDefault();
        if (state.editor.active) {
          setDocZoomScale(1.0);
          updateDocZoom();
        } else {
          actualSize();
        }
        return;
      }
      if (k === "r") {
        if (state.editor.active) {
          if (quill) {
            e.preventDefault();
            const format = quill.getFormat();
            quill.format("align", format.align === "right" ? false : "right");
          }
          return;
        }
        e.preventDefault();
        rotateClockwise();
        return;
      }
      if (k === "f") {
        e.preventDefault();
        toggleFindBar(true);
        return;
      }
    }
    if (key === "Escape") {
      if (el.tabContextMenu && !el.tabContextMenu.hidden) {
        e.preventDefault();
        hideTabContextMenu();
        return;
      }
      if (state.search.isOpen) {
        e.preventDefault();
        toggleFindBar(false);
        return;
      }
      if (!el.propertiesModal.hidden || !el.shortcutsModal.hidden || !el.passwordModal.hidden || (el.aboutModal && !el.aboutModal.hidden) || (el.fileAssocModal && !el.fileAssocModal.hidden)) {
        e.preventDefault();
        hideAllOverlays();
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === ",") {
      e.preventDefault();
      showFileAssocModal();
      return;
    }
    if (key === "?" || key === "F1") {
      const tag = e.target && e.target.tagName;
      const isEditable = e.target && (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.target.isContentEditable);
      if (!isEditable) {
        e.preventDefault();
        showShortcutsModal();
        return;
      }
    }
    if (!state.doc) return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
    switch (key) {
      case "ArrowLeft":
        e.preventDefault();
        prevPage();
        break;
      case "ArrowRight":
        e.preventDefault();
        nextPage();
        break;
      case "PageUp":
        e.preventDefault();
        el.pageHost.scrollBy({ top: -el.pageHost.clientHeight });
        break;
      case "PageDown":
        e.preventDefault();
        el.pageHost.scrollBy({ top: el.pageHost.clientHeight });
        break;
      case "Home":
        e.preventDefault();
        el.pageHost.scrollTo({ top: 0 });
        break;
      case "End":
        e.preventDefault();
        el.pageHost.scrollTo({ top: el.pageHost.scrollHeight });
        break;
      case "t":
      case "T":
        toggleThumbnails();
        break;
      case "d":
      case "D":
        toggleTheme();
        break;
      default:
        break;
    }
  });

  window.pdfViewer.onOpenFile((payload) => {
    if (Array.isArray(payload)) {
      openMultipleFiles(payload);
    } else if (payload && payload.files && payload.files.length) {
      openMultipleFiles(payload.files);
    } else if (payload && payload.data) {
      openMultipleFiles([{ name: payload.name, path: payload.path, data: payload.data }]);
    }
  });

  window.pdfViewer.onCommand((cmd) => {
    switch (cmd) {
      case "new-tab":
        createNewTab();
        break;
      case "close-tab":
        if (activeTabId) closeTab(activeTabId);
        break;
      case "next-tab":
        cycleTabs(1);
        break;
      case "prev-tab":
        cycleTabs(-1);
        break;
      case "toggle-two-page":
        toggleTwoPage();
        break;
      case "toggle-split-view":
        toggleSplitView();
        break;
      case "new-text-file":
        newTextFile();
        break;
      case "save-pdf":
        savePdf();
        break;
      case "open":
        openFromDialog();
        break;
      case "find":
        toggleFindBar(true);
        break;
      case "rotate":
        rotateClockwise();
        break;
      case "properties":
        showPropertiesModal();
        break;
      case "shortcuts":
        showShortcutsModal();
        break;
      case "about":
        showAboutModal();
        break;
      case "file-assoc":
        showFileAssocModal();
        break;
      case "print":
        printDocument();
        break;
      case "zoom-in":
        zoomIn();
        break;
      case "zoom-out":
        zoomOut();
        break;
      case "actual-size":
        actualSize();
        break;
      case "fit-width":
        setFit("fit-width");
        break;
      case "fit-page":
        setFit("fit-page");
        break;
      case "toggle-thumbnails":
        toggleThumbnails();
        break;
      case "toggle-theme":
        toggleTheme();
        break;
      default:
        break;
    }
  });
}

async function init() {
  const saved = localStorage.getItem("viewer-theme");
  const initial = saved || (await window.pdfViewer.getTheme());
  applyTheme(initial === "dark" ? "dark" : "light");
  initQuill();
  bindEvents();
  bindImageModalEvents();
  setupBeforeUnload();
  createNewTab();
  window.__pdfViewerReady = true;
  document.body.dataset.ready = "1";
  getOrFetchAppInfo().then((info) => {
    if (info && info.version) {
      if (el.emptyVersionLabel) el.emptyVersionLabel.textContent = `v${info.version}`;
      if (el.aboutVersionBadge) el.aboutVersionBadge.textContent = `v${info.version}`;
    }
  }).catch(() => {});
}

init();
