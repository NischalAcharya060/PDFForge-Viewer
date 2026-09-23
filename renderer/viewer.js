import "./polyfills.js";
import { getDocument, GlobalWorkerOptions, TextLayer } from "./pdfjs/pdf.mjs";

const worker = new Worker(new URL("./pdf-worker.mjs", import.meta.url), { type: "module" });
GlobalWorkerOptions.workerPort = worker;

const PAGE_PAD = 24;
const THUMB_MAX = 150;
const ZOOM_PRESETS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.83, 1, 1.25, 1.5, 2, 2.5, 3, 4];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const RECENT_KEY = "pdfforge-recent-files";
const PDF_OPTIONS_KEY = "pdfforge-pdf-options";

const state = {
  doc: null,
  loadingTask: null,
  name: "",
  filePath: null,
  layoutMode: "fit-width",
  zoom: 1,
  rotation: 0,
  pages: [],
  outline: [],
  passwordCallback: null,
  passwordValue: null,
  currentPage: 1,
  renderSeq: 0,
  renderQueue: [],
  renderBusy: false,
  currentTheme: null,
  activeSidebarTab: "thumbs",
  search: {
    isOpen: false,
    query: "",
    matches: [],
    currentMatchIndex: -1,
  },
  twoPageMode: false,
  data: null,
  editor: {
    active: false,
    fileName: "untitled",
    dirty: false,
    saving: false,
    source: null,
    options: null,
  },
};

const el = {
  tabBar: document.getElementById("tab-bar"),
  toolbar: document.getElementById("toolbar"),
  tabsList: document.getElementById("tabs-list"),
  btnNewTab: document.getElementById("btn-new-tab"),
  btnSplitView: document.getElementById("btn-split-view"),
  btnAddPage: document.getElementById("btn-add-page"),
  addPageMenu: document.getElementById("add-page-menu"),
  btnAddBlankPage: document.getElementById("btn-add-blank-page"),
  btnAppendPdfPages: document.getElementById("btn-append-pdf-pages"),
  btnTwoPage: document.getElementById("btn-two-page"),
  workspaceContainer: document.getElementById("workspace-container"),
  primaryPane: document.getElementById("primary-pane"),
  splitDivider: document.getElementById("split-divider"),
  secondaryPane: document.getElementById("secondary-pane"),
  secondaryPaneTitle: document.getElementById("secondary-pane-title"),
  btnCloseSplit: document.getElementById("btn-close-split"),
  secondaryPageHost: document.getElementById("secondary-page-host"),
  btnNew: document.getElementById("btn-new"),
  btnOpen: document.getElementById("btn-open"),
  btnSave: document.getElementById("btn-save"),
  btnPrint: document.getElementById("btn-print"),
  btnFind: document.getElementById("btn-find"),
  btnInfo: document.getElementById("btn-info"),
  btnShortcuts: document.getElementById("btn-shortcuts"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnZoomOut: document.getElementById("btn-zoom-out"),
  btnZoomIn: document.getElementById("btn-zoom-in"),
  btnRotate: document.getElementById("btn-rotate"),
  btnFitWidth: document.getElementById("btn-fit-width"),
  btnFitPage: document.getElementById("btn-fit-page"),
  btnThumbs: document.getElementById("btn-thumbs"),
  btnTheme: document.getElementById("btn-theme"),
  zoomSelect: document.getElementById("zoom-select"),
  docName: document.getElementById("doc-name"),
  pageJumpInput: document.getElementById("page-jump-input"),
  pageIndicator: document.getElementById("page-indicator"),
  thumbnails: document.getElementById("thumbnails"),
  tabThumbs: document.getElementById("tab-thumbs"),
  tabOutline: document.getElementById("tab-outline"),
  thumbList: document.getElementById("thumb-list"),
  outlineList: document.getElementById("outline-list"),
  pageHost: document.getElementById("page-host"),
  emptyState: document.getElementById("empty-state"),
  btnOpenEmpty: document.getElementById("btn-open-empty"),
  btnNewEmpty: document.getElementById("btn-new-empty"),
  recentContainer: document.getElementById("recent-container"),
  recentList: document.getElementById("recent-list"),
  btnClearRecent: document.getElementById("btn-clear-recent"),
  errorState: document.getElementById("error-state"),
  errorTitle: document.getElementById("error-title"),
  errorMessage: document.getElementById("error-message"),
  btnErrorOpen: document.getElementById("btn-error-open"),
  btnErrorDismiss: document.getElementById("btn-error-dismiss"),
  loadingBar: document.getElementById("loading-bar"),
  dropOverlay: document.getElementById("drop-overlay"),
  passwordModal: document.getElementById("password-modal"),
  passwordNote: document.getElementById("password-note"),
  passwordError: document.getElementById("password-error"),
  passwordInput: document.getElementById("password-input"),
  btnPasswordCancel: document.getElementById("btn-password-cancel"),
  btnPasswordOk: document.getElementById("btn-password-ok"),
  propertiesModal: document.getElementById("properties-modal"),
  propertiesContent: document.getElementById("properties-content"),
  btnPropertiesClose: document.getElementById("btn-properties-close"),
  btnPropertiesCopy: document.getElementById("btn-properties-copy"),
  shortcutsModal: document.getElementById("shortcuts-modal"),
  btnShortcutsClose: document.getElementById("btn-shortcuts-close"),
  aboutModal: document.getElementById("about-modal"),
  aboutVersionBadge: document.getElementById("about-version-badge"),
  aboutInfoGrid: document.getElementById("about-info-grid"),
  btnAbout: document.getElementById("btn-about"),
  btnAboutClose: document.getElementById("btn-about-close"),
  btnAboutCopy: document.getElementById("btn-about-copy"),
  btnEmptyAbout: document.getElementById("btn-empty-about"),
  emptyVersionLabel: document.getElementById("empty-version-label"),
  appBrandBtn: document.getElementById("app-brand-btn"),
  printHost: document.getElementById("print-host"),
  findBar: document.getElementById("find-bar"),
  findInput: document.getElementById("find-input"),
  findPrev: document.getElementById("find-prev"),
  findNext: document.getElementById("find-next"),
  findResults: document.getElementById("find-results"),
  findClose: document.getElementById("find-close"),
  editorView: document.getElementById("editor-view"),
  editorName: document.getElementById("editor-name"),
  editorNameInput: document.getElementById("editor-name-input"),
  editorSaveState: document.getElementById("editor-save-state"),
  editorSubtitle: document.getElementById("editor-subtitle"),
  editorStatus: document.getElementById("editor-status"),
  editorContent: document.getElementById("editor-content"),
  editorStats: document.getElementById("editor-stats"),
  btnEditorClose: document.getElementById("btn-editor-close"),
  btnEditorSave: document.getElementById("btn-editor-save"),
  editorSaveLabel: document.getElementById("editor-save-label"),
  btnEditorOptions: document.getElementById("btn-editor-options"),
  editorOptions: document.getElementById("editor-options"),
  optPaperSize: document.getElementById("opt-paper-size"),
  optFontSize: document.getElementById("opt-font-size"),
  optLineSpacing: document.getElementById("opt-line-spacing"),
  optMargin: document.getElementById("opt-margin"),
  optPageNumbers: document.getElementById("opt-page-numbers"),
  optTitle: document.getElementById("opt-title"),
  optAuthor: document.getElementById("opt-author"),
  btnRibbonUndo: document.getElementById("btn-ribbon-undo"),
  btnRibbonRedo: document.getElementById("btn-ribbon-redo"),
  btnInsertPageBreak: document.getElementById("btn-insert-page-break"),
  btnInsertHr: document.getElementById("btn-insert-hr"),
  ribbonLineSpacing: document.getElementById("ribbon-line-spacing"),
  wordPageCount: document.getElementById("word-page-count"),
  wordPageSheet: document.getElementById("word-page-sheet"),
  btnDocZoomOut: document.getElementById("btn-doc-zoom-out"),
  btnDocZoomIn: document.getElementById("btn-doc-zoom-in"),
  docZoomLabel: document.getElementById("doc-zoom-label"),
  toastContainer: document.getElementById("toast-container"),
  tabContextMenu: document.getElementById("tab-context-menu"),
  ctxCloseTab: document.getElementById("ctx-close-tab"),
  ctxCloseOthers: document.getElementById("ctx-close-others"),
  ctxCloseRight: document.getElementById("ctx-close-right"),
  ctxDuplicateTab: document.getElementById("ctx-duplicate-tab"),
  ctxNewTab: document.getElementById("ctx-new-tab"),
  // Image Insert Modal
  imageInsertModal: document.getElementById("image-insert-modal"),
  imgTabDevice: document.getElementById("img-tab-device"),
  imgTabUrl: document.getElementById("img-tab-url"),
  imgPanelDevice: document.getElementById("img-panel-device"),
  imgPanelUrl: document.getElementById("img-panel-url"),
  imgDropZone: document.getElementById("img-drop-zone"),
  imgBrowseTrigger: document.getElementById("img-browse-trigger"),
  imgFileInput: document.getElementById("img-file-input"),
  imgDevicePreview: document.getElementById("img-device-preview"),
  imgDevicePreviewImg: document.getElementById("img-device-preview-img"),
  imgDeviceInfo: document.getElementById("img-device-info"),
  imgDeviceName: document.getElementById("img-device-name"),
  imgDeviceRemove: document.getElementById("img-device-remove"),
  imgUrlInput: document.getElementById("img-url-input"),
  imgUrlLoad: document.getElementById("img-url-load"),
  imgUrlPreview: document.getElementById("img-url-preview"),
  imgUrlPreviewImg: document.getElementById("img-url-preview-img"),
  imgUrlInfo: document.getElementById("img-url-info"),
  imgUrlStatus: document.getElementById("img-url-status"),
  imgUrlRemove: document.getElementById("img-url-remove"),
  imgCancelBtn: document.getElementById("img-cancel-btn"),
  imgInsertBtn: document.getElementById("img-insert-btn"),
  // Unsaved Changes Warning Modal
  unsavedWarningModal: document.getElementById("unsaved-warning-modal"),
  unsavedDocName: document.getElementById("unsaved-doc-name"),
  unsavedBtnCancel: document.getElementById("unsaved-btn-cancel"),
  unsavedBtnDiscard: document.getElementById("unsaved-btn-discard"),
  unsavedBtnSave: document.getElementById("unsaved-btn-save"),
};

for (const preset of ZOOM_PRESETS) {
  const option = document.createElement("option");
  option.value = String(Math.round(preset * 100));
  option.textContent = `${Math.round(preset * 100)}%`;
  el.zoomSelect.appendChild(option);
}

let quill = null;
let editorBusy = false;
let docZoomScale = 1.0;

// Multi-Tab Management State
let tabs = [];
let activeTabId = null;
let splitTabId = null;
let isSplitActive = false;
let tabCounter = 0;
let splitDoc = null;
let splitPages = [];
let tabDragSourceId = null;
let contextMenuTargetTabId = null;

function showTabContextMenu(x, y, tabId) {
  if (!el.tabContextMenu) return;
  contextMenuTargetTabId = tabId;
  const menuW = 190;
  const menuH = 180;
  const posX = Math.min(x, Math.max(10, window.innerWidth - menuW - 10));
  const posY = Math.min(y, Math.max(10, window.innerHeight - menuH - 10));
  el.tabContextMenu.style.left = `${posX}px`;
  el.tabContextMenu.style.top = `${posY}px`;
  el.tabContextMenu.hidden = false;
}

function hideTabContextMenu() {
  if (el.tabContextMenu) {
    el.tabContextMenu.hidden = true;
    contextMenuTargetTabId = null;
  }
}

async function closeOtherTabs(targetId) {
  hideTabContextMenu();
  const others = tabs.filter((t) => t.id !== targetId);
  for (const t of others) {
    await closeTab(t.id);
  }
}

async function closeTabsToRight(targetId) {
  hideTabContextMenu();
  const idx = tabs.findIndex((t) => t.id === targetId);
  if (idx === -1) return;
  const toRight = tabs.slice(idx + 1);
  for (const t of toRight) {
    await closeTab(t.id);
  }
}

function duplicateTab(targetId) {
  hideTabContextMenu();
  const tab = tabs.find((t) => t.id === targetId);
  if (!tab) return;
  if (tab.type === "pdf" && tab.data) {
    createNewTab({ type: "pdf", name: tab.name, data: tab.data, filePath: tab.filePath });
  } else if (tab.type === "editor") {
    const html = tab.id === activeTabId && quill ? quill.getSemanticHTML() : (tab.editor?.html || "");
    const baseName = tab.name.replace(/\s*\(\d+\)$/, "");
    const newName = `${baseName} (Copy)`;
    createNewTab({ type: "editor", name: newName });
    if (quill && html) quill.clipboard.dangerouslyPasteHTML(html);
  } else {
    createNewTab();
  }
}

function renderTabBar() {
  if (!el.tabsList) return;
  el.tabsList.innerHTML = "";

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const tabEl = document.createElement("div");
    tabEl.className = "chrome-tab" + (tab.id === activeTabId ? " active" : "");
    tabEl.dataset.tabId = tab.id;
    tabEl.dataset.index = String(i);
    tabEl.setAttribute("role", "tab");
    tabEl.setAttribute("aria-selected", String(tab.id === activeTabId));
    tabEl.setAttribute("draggable", "true");
    tabEl.title = tab.filePath ? `${tab.name} (${tab.filePath})` : tab.name;

    let iconSvg = "";
    if (tab.type === "editor") {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>
      </svg>`;
    } else if (tab.type === "pdf") {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="4" fill="#e5484d"/>
        <path d="M7 6h6l4 4v8a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" fill="#fff" opacity="0.95"/>
      </svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6"/>
      </svg>`;
    }

    const isDirty = (tab.type === "editor" && (tab.editor?.dirty || (tab.id === activeTabId && state.editor.dirty))) ||
                    Boolean(tab.dirty || (tab.id === activeTabId && state.pdfModified));

    tabEl.innerHTML = `
      <span class="chrome-tab-icon">${iconSvg}</span>
      <span class="chrome-tab-title">${escapeHtml(tab.name || "New Tab")}</span>
      ${isDirty ? '<span class="chrome-tab-dirty" title="Unsaved changes"></span>' : ""}
      <button class="chrome-tab-close" type="button" title="Close tab (Ctrl+W)">&times;</button>
    `;

    // Click to switch tab
    tabEl.addEventListener("click", (e) => {
      if (e.target.closest(".chrome-tab-close")) return;
      if (tab.id !== activeTabId) {
        snapshotCurrentTab();
        restoreTab(tab);
      }
    });

    // Middle-click to close
    tabEl.addEventListener("auxclick", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });

    // Right-click context menu
    tabEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showTabContextMenu(e.clientX, e.clientY, tab.id);
    });

    // Tab Drag & Drop Reordering
    tabEl.addEventListener("dragstart", (e) => {
      tabDragSourceId = tab.id;
      tabEl.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tab.id);
    });

    tabEl.addEventListener("dragend", () => {
      tabDragSourceId = null;
      tabEl.classList.remove("dragging");
      document.querySelectorAll(".chrome-tab.drag-over").forEach((el) => el.classList.remove("drag-over"));
    });

    tabEl.addEventListener("dragover", (e) => {
      if (!tabDragSourceId || tabDragSourceId === tab.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      tabEl.classList.add("drag-over");
    });

    tabEl.addEventListener("dragleave", () => {
      tabEl.classList.remove("drag-over");
    });

    tabEl.addEventListener("drop", (e) => {
      e.preventDefault();
      tabEl.classList.remove("drag-over");
      if (!tabDragSourceId || tabDragSourceId === tab.id) return;
      const fromIdx = tabs.findIndex((t) => t.id === tabDragSourceId);
      const toIdx = tabs.findIndex((t) => t.id === tab.id);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [movedTab] = tabs.splice(fromIdx, 1);
        tabs.splice(toIdx, 0, movedTab);
        renderTabBar();
      }
    });

    const closeBtn = tabEl.querySelector(".chrome-tab-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
    }

    el.tabsList.appendChild(tabEl);
  }

  const activeEl = el.tabsList.querySelector(".chrome-tab.active");
  if (activeEl) {
    activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }
}

function snapshotCurrentTab() {
  const currentTab = tabs.find((t) => t.id === activeTabId);
  if (!currentTab) return;

  if (state.editor.active) {
    currentTab.type = "editor";
    currentTab.name = state.editor.fileName || "Document";
    currentTab.editor = {
      active: true,
      fileName: state.editor.fileName || "Document",
      dirty: state.editor.dirty,
      saving: state.editor.saving,
      html: quill ? quill.getSemanticHTML() : "",
      options: { ...(state.editor.options || {}) },
    };
  } else if (state.doc) {
    currentTab.type = "pdf";
    currentTab.name = state.name;
    currentTab.filePath = state.filePath;
    currentTab.data = state.data;
    currentTab.doc = state.doc;
    currentTab.pages = state.pages;
    currentTab.outline = state.outline;
    currentTab.currentPage = state.currentPage;
    currentTab.zoom = state.zoom;
    currentTab.layoutMode = state.layoutMode;
    currentTab.twoPageMode = Boolean(state.twoPageMode);
    currentTab.rotation = state.rotation;
    currentTab.scrollTop = el.pageHost ? el.pageHost.scrollTop : 0;
    currentTab.scrollLeft = el.pageHost ? el.pageHost.scrollLeft : 0;
    currentTab.pageHostFragment = document.createDocumentFragment();
    while (el.pageHost && el.pageHost.firstChild) {
      currentTab.pageHostFragment.appendChild(el.pageHost.firstChild);
    }
    currentTab.thumbFragment = document.createDocumentFragment();
    while (el.thumbList && el.thumbList.firstChild) {
      currentTab.thumbFragment.appendChild(el.thumbList.firstChild);
    }
  } else {
    currentTab.type = "empty";
    currentTab.name = "New Tab";
  }
}

function restoreTab(tab) {
  activeTabId = tab.id;
  hideAllOverlays();

  if (tab.type === "editor") {
    if (el.pageHost) el.pageHost.textContent = "";
    if (el.thumbList) el.thumbList.textContent = "";
    el.thumbnails.hidden = true;
    el.emptyState.hidden = true;
    el.errorState.hidden = true;
    el.editorView.hidden = false;
    const editorData = tab.editor || {};
    openTextEditor({
      html: editorData.html || "",
      fileName: editorData.fileName || tab.name || "Document1",
      options: editorData.options,
    });
    state.editor.dirty = Boolean(editorData.dirty);
    updateEditorChrome();
  } else if (tab.type === "pdf") {
    el.editorView.hidden = true;
    if (el.toolbar) el.toolbar.hidden = false;
    el.emptyState.hidden = true;
    el.errorState.hidden = true;

    state.doc = tab.doc;
    state.name = tab.name;
    state.filePath = tab.filePath;
    state.data = tab.data;
    state.pages = tab.pages || [];
    state.outline = tab.outline || [];
    state.currentPage = tab.currentPage || 1;
    state.zoom = tab.zoom || 1;
    state.layoutMode = tab.layoutMode || "fit-width";
    state.twoPageMode = Boolean(tab.twoPageMode);
    state.rotation = tab.rotation || 0;

    if (el.pageHost) {
      el.pageHost.textContent = "";
      if (tab.pageHostFragment && tab.pageHostFragment.childNodes.length > 0) {
        el.pageHost.appendChild(tab.pageHostFragment);
        tab.pageHostFragment = null;
      } else if (state.pages && state.pages.length) {
        for (const p of state.pages) {
          if (p.div) el.pageHost.appendChild(p.div);
        }
      }
      el.pageHost.classList.toggle("two-page-mode", Boolean(state.twoPageMode));
    }
    if (el.btnTwoPage) {
      el.btnTwoPage.classList.toggle("active", Boolean(state.twoPageMode));
    }

    el.docName.textContent = state.name;
    el.docName.title = state.filePath ? `${state.name} (${state.filePath})` : state.name;
    document.title = `${state.name} — PDFForge Viewer`;

    if (tab.thumbFragment && tab.thumbFragment.childNodes.length > 0) {
      el.thumbList.textContent = "";
      el.thumbList.appendChild(tab.thumbFragment);
      tab.thumbFragment = null;
      applyThumbnails();
      queueThumbRenders();
    } else {
      buildThumbnails();
    }

    updateZoomSelect();
    syncFitButtons();
    updateControls();
    updateActiveThumb();

    if (tab.scrollTop && el.pageHost) {
      el.pageHost.scrollTo({ top: tab.scrollTop, left: tab.scrollLeft || 0 });
    }
    queueVisibleRender();
  } else {
    el.editorView.hidden = true;
    if (el.toolbar) el.toolbar.hidden = false;
    el.errorState.hidden = true;
    if (el.pageHost) el.pageHost.textContent = "";
    if (el.thumbList) el.thumbList.textContent = "";
    el.thumbnails.hidden = true;
    state.doc = null;
    state.pages = [];
    state.name = "";
    state.data = null;
    el.emptyState.hidden = false;
    el.docName.textContent = "PDFForge Viewer";
    document.title = "PDFForge Viewer";
    updateControls();
  }

  renderTabBar();
}

function createNewTab(opts = {}) {
  snapshotCurrentTab();
  const id = "tab-" + (++tabCounter);
  const newTab = {
    id,
    type: opts.type || "empty",
    name: opts.name || (opts.type === "editor" ? "Document1" : "New Tab"),
    filePath: opts.filePath || null,
    data: opts.data || null,
    doc: null,
    pages: [],
    outline: [],
    currentPage: 1,
    zoom: 1,
    layoutMode: "fit-width",
    twoPageMode: false,
    rotation: 0,
    editor: opts.editor || null,
  };
  tabs.push(newTab);
  restoreTab(newTab);

  if (opts.data && opts.name) {
    openDocument(opts.data, opts.name, opts.filePath);
  }
  return newTab;
}

async function closeTab(tabId) {
  const index = tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return;
  const tab = tabs[index];

  if (tab.type === "editor" && (tab.editor?.dirty || (tabId === activeTabId && state.editor.dirty))) {
    if (!window.confirm(`Discard unsaved changes in "${tab.name}"?`)) {
      return;
    }
  }

  if (tab.doc) {
    try {
      await tab.doc.destroy();
    } catch {}
    tab.doc = null;
    tab.pages = [];
  }

  if (splitTabId === tabId) {
    closeSplitView();
  }

  if (activeTabId === tabId) {
    if (state.editor.active) {
      state.editor.active = false;
      state.editor.dirty = false;
    }
    state.doc = null;
    state.pages = [];
  }

  tabs.splice(index, 1);

  if (tabs.length === 0) {
    createNewTab();
    return;
  }

  if (activeTabId === tabId) {
    const nextIndex = Math.min(index, tabs.length - 1);
    restoreTab(tabs[nextIndex]);
  } else {
    renderTabBar();
  }
}

function cycleTabs(offset) {
  if (tabs.length <= 1) return;
  snapshotCurrentTab();
  const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
  let nextIndex = (currentIndex + offset) % tabs.length;
  if (nextIndex < 0) nextIndex += tabs.length;
  restoreTab(tabs[nextIndex]);
}

async function openMultipleFiles(files) {
  if (!files || !files.length) return;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const currentTab = tabs.find((t) => t.id === activeTabId);
    if (i === 0 && currentTab && currentTab.type === "empty") {
      await openDocument(f.data, f.name, f.path);
    } else {
      createNewTab({ type: "pdf", name: f.name, data: f.data, filePath: f.path });
    }
  }
}

function toggleTwoPage() {
  if (!state.doc) return;
  state.twoPageMode = !state.twoPageMode;
  const currentTab = tabs.find((t) => t.id === activeTabId);
  if (currentTab) currentTab.twoPageMode = state.twoPageMode;
  layoutPages();
  updateControls();
}

async function toggleSplitView() {
  if (isSplitActive) {
    closeSplitView();
    return;
  }
  const otherTab = tabs.find((t) => t.id !== activeTabId && (t.data || t.doc));
  if (otherTab && otherTab.data) {
    openSplitView(otherTab);
  } else {
    const res = await window.pdfViewer.openDialog();
    if (res && !res.canceled && res.data) {
      const newTab = {
        id: "tab-" + (++tabCounter),
        type: "pdf",
        name: res.name,
        filePath: res.path,
        data: res.data,
        doc: null,
        pages: [],
        outline: [],
        currentPage: 1,
        zoom: 1,
        layoutMode: "fit-width",
        twoPageMode: false,
        rotation: 0,
      };
      tabs.push(newTab);
      renderTabBar();
      openSplitView(newTab);
    }
  }
}

async function openSplitView(tab) {
  isSplitActive = true;
  splitTabId = tab.id;
  if (el.splitDivider) el.splitDivider.hidden = false;
  if (el.secondaryPane) el.secondaryPane.hidden = false;
  if (el.btnSplitView) el.btnSplitView.classList.add("active");
  if (el.secondaryPaneTitle) el.secondaryPaneTitle.textContent = tab.name || "Second Document";
  renderSplitDoc(tab);
}

function closeSplitView() {
  isSplitActive = false;
  splitTabId = null;
  if (el.splitDivider) el.splitDivider.hidden = true;
  if (el.secondaryPane) el.secondaryPane.hidden = true;
  if (el.btnSplitView) el.btnSplitView.classList.remove("active");
  if (el.secondaryPageHost) el.secondaryPageHost.textContent = "";
  if (splitDoc) {
    try {
      splitDoc.destroy();
    } catch {}
    splitDoc = null;
    splitPages = [];
  }
  if (el.primaryPane) el.primaryPane.style.flex = "1";
  if (el.secondaryPane) el.secondaryPane.style.flex = "1";
  layoutPages();
}

async function renderSplitDoc(tab) {
  if (!el.secondaryPageHost) return;
  el.secondaryPageHost.textContent = "";
  if (!tab.data) return;
  try {
    const task = getDocument({ data: tab.data });
    splitDoc = await task.promise;
    splitPages = [];
    const availW = Math.max(260, (el.secondaryPageHost.clientWidth || 400) - 48);
    for (let i = 1; i <= splitDoc.numPages; i++) {
      const page = await splitDoc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = availW / vp1.width;
      const vp = page.getViewport({ scale });
      const pageDiv = document.createElement("div");
      pageDiv.className = "pdf-page";
      pageDiv.style.width = `${Math.round(vp.width)}px`;
      pageDiv.style.height = `${Math.round(vp.height)}px`;
      pageDiv.style.marginBottom = "16px";
      pageDiv.style.background = "#ffffff";
      pageDiv.style.boxShadow = "var(--page-shadow)";
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width * window.devicePixelRatio);
      canvas.height = Math.ceil(vp.height * window.devicePixelRatio);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      const ctx = canvas.getContext("2d");
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      pageDiv.appendChild(canvas);
      el.secondaryPageHost.appendChild(pageDiv);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    }
  } catch (err) {
    console.warn("Could not render split document:", err);
  }
}

function setupSplitDivider() {
  if (!el.splitDivider || !el.workspaceContainer) return;
  let dragging = false;
  el.splitDivider.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    el.splitDivider.classList.add("active");
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = el.workspaceContainer.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0.2, 0.8);
    if (el.primaryPane) el.primaryPane.style.flex = `${ratio}`;
    if (el.secondaryPane) el.secondaryPane.style.flex = `${1 - ratio}`;
    layoutPages();
  });
  window.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false;
      el.splitDivider.classList.remove("active");
    }
  });
}

function showToast(message, type = "info", duration = 3200) {
  if (!el.toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  let iconSvg = "";
  if (type === "success") {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
  } else if (type === "error") {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  } else {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }
  toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
  el.toastContainer.appendChild(toast);

  const removeToast = () => {
    toast.classList.add("toast-hiding");
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 200);
  };

  setTimeout(removeToast, duration);
}

function goToPage(pageNumber) {
  if (!state.doc || !state.pages.length) return;
  const idx = clamp(pageNumber - 1, 0, state.pages.length - 1);
  scrollToPage(idx);
}

async function addBlankPageToCurrentDoc() {
  if (!state.data) return;
  setLoading(true);
  try {
    const res = await window.pdfViewer.addBlankPage(state.data);
    if (res && res.success && res.data) {
      state.data = res.data;
      const currentTab = tabs.find((t) => t.id === activeTabId);
      if (currentTab) currentTab.data = res.data;
      await openDocument(res.data, state.name, state.filePath);
      goToPage(state.pages.length);
      showToast("Added blank page to document", "success");
    } else {
      showToast("Failed to add blank page: " + (res?.error || "unknown error"), "error");
    }
  } catch (err) {
    showToast("Error adding blank page: " + (err && err.message ? err.message : String(err)), "error");
  } finally {
    setLoading(false);
  }
}

async function appendPdfToCurrentDoc() {
  if (!state.data) return;
  const dialogRes = await window.pdfViewer.openDialog();
  if (!dialogRes || dialogRes.canceled || !dialogRes.data) return;
  setLoading(true);
  try {
    const res = await window.pdfViewer.appendPdf({
      baseData: state.data,
      appendData: dialogRes.data,
    });
    if (res && res.success && res.data) {
      state.data = res.data;
      const currentTab = tabs.find((t) => t.id === activeTabId);
      if (currentTab) currentTab.data = res.data;
      const prevCount = state.pages.length;
      await openDocument(res.data, state.name, state.filePath);
      goToPage(prevCount + 1);
      showToast("Inserted pages from PDF", "success");
    } else {
      showToast("Failed to insert pages: " + (res?.error || "unknown error"), "error");
    }
  } catch (err) {
    showToast("Error inserting pages: " + (err && err.message ? err.message : String(err)), "error");
  } finally {
    setLoading(false);
  }
}

if (typeof Quill !== "undefined" && el.editorContent) {
  try {
    const BlockEmbed = Quill.import("blots/block/embed");
    if (BlockEmbed) {
      class PageBreakBlot extends BlockEmbed {
        static blotName = "pageBreak";
        static tagName = "div";
        static className = "word-page-break";

        static create() {
          const node = super.create();
          node.setAttribute("contenteditable", "false");
          node.innerHTML = `<span>Page Break</span>`;
          return node;
        }
      }
      Quill.register(PageBreakBlot);

      class HrBlot extends BlockEmbed {
        static blotName = "hr";
        static tagName = "hr";
      }
      Quill.register(HrBlot);
    }
  } catch (err) {
    console.warn("Could not register custom Quill blots:", err);
  }

  try {
    const SizeStyle = Quill.import("attributors/style/size");
    if (SizeStyle) {
      SizeStyle.whitelist = [
        "9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "20pt", "24pt", "28pt", "36pt", "48pt"
      ];
      Quill.register(SizeStyle, true);
    }
  } catch {}

  try {
    const FontStyle = Quill.import("attributors/style/font");
    if (FontStyle) {
      FontStyle.whitelist = ["arial", "times-new-roman", "georgia", "courier", "segoe"];
      Quill.register(FontStyle, true);
    }
  } catch {}

  quill = new Quill(el.editorContent, {
    theme: "snow",
    modules: {
      toolbar: "#quill-toolbar",
      keyboard: {
        bindings: {
          tab: false,
          pageBreak: {
            key: 13, // Enter
            shortKey: true, // Ctrl / Cmd
            handler: function () {
              insertWordPageBreak();
              return false;
            },
          },
        },
      },
    },
    placeholder: "Start typing your Word document here… Format text with the ribbon above.",
  });
  window.__quill = quill;

  // Ensure all Quill pickers (Font, Size, Header) have explicit data-label attributes
  function setupQuillPickerLabels() {
    const fontLabels = {
      "": "Calibri",
      "arial": "Arial",
      "times-new-roman": "Times New Roman",
      "georgia": "Georgia",
      "courier": "Courier New",
      "segoe": "Segoe UI",
    };
    document.querySelectorAll(".word-ribbon .ql-picker.ql-font .ql-picker-item").forEach((item) => {
      const val = item.getAttribute("data-value") || "";
      if (fontLabels[val]) {
        item.setAttribute("data-label", fontLabels[val]);
      }
    });

    const sizeLabels = {
      "": "11",
      "9pt": "9",
      "10pt": "10",
      "11pt": "11",
      "12pt": "12",
      "14pt": "14",
      "16pt": "16",
      "18pt": "18",
      "20pt": "20",
      "24pt": "24",
      "28pt": "28",
      "36pt": "36",
      "48pt": "48",
    };
    document.querySelectorAll(".word-ribbon .ql-picker.ql-size .ql-picker-item").forEach((item) => {
      const val = item.getAttribute("data-value") || "";
      if (sizeLabels[val]) {
        item.setAttribute("data-label", sizeLabels[val]);
      }
    });

    const headerLabels = {
      "": "Normal Text",
      "1": "Heading 1",
      "2": "Heading 2",
      "3": "Heading 3",
      "4": "Heading 4",
    };
    document.querySelectorAll(".word-ribbon .ql-picker.ql-header .ql-picker-item").forEach((item) => {
      const val = item.getAttribute("data-value") || "";
      if (headerLabels[val]) {
        item.setAttribute("data-label", headerLabels[val]);
      }
    });

    const spacingLabels = {
      "": "1.15",
      "1.0": "1.0",
      "1.15": "1.15",
      "1.25": "1.25",
      "1.45": "1.45",
      "1.5": "1.5",
      "2.0": "2.0",
      "2.5": "2.5",
      "3.0": "3.0",
    };
    document.querySelectorAll(".word-ribbon .ql-picker.word-select-spacing .ql-picker-item").forEach((item) => {
      const val = item.getAttribute("data-value") || "";
      if (spacingLabels[val]) {
        item.setAttribute("data-label", spacingLabels[val]);
      }
    });
    // Set initial label on spacing picker
    const spacingLabel = document.querySelector(".word-ribbon .ql-picker.word-select-spacing .ql-picker-label");
    if (spacingLabel && !spacingLabel.getAttribute("data-label")) {
      const curVal = el.ribbonLineSpacing ? el.ribbonLineSpacing.value : "1.15";
      spacingLabel.setAttribute("data-label", spacingLabels[curVal] || curVal || "1.15");
      spacingLabel.setAttribute("data-value", curVal || "1.15");
    }
  }

  setupQuillPickerLabels();

  if (el.editorContent) {
    el.editorContent.addEventListener("click", (e) => {
      const link = e.target.closest("a");
      if (link && link.href) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          window.open(link.href, "_blank");
        }
      }
    });
  }
}

// ==========================================================================
//   Image Insert Modal Logic
// ==========================================================================
let pendingImageDataUrl = null;

function openImageInsertModal() {
  if (!el.imageInsertModal) return;
  pendingImageDataUrl = null;
  // Reset to device tab
  switchImageTab("device");
  // Reset device panel
  clearDevicePreview();
  // Reset URL panel
  clearUrlPreview();
  if (el.imgUrlInput) el.imgUrlInput.value = "";
  // Disable insert button
  if (el.imgInsertBtn) el.imgInsertBtn.disabled = true;
  // Show modal
  el.imageInsertModal.hidden = false;
}

function closeImageInsertModal() {
  if (!el.imageInsertModal) return;
  el.imageInsertModal.hidden = true;
  pendingImageDataUrl = null;
  if (el.imgFileInput) el.imgFileInput.value = "";
}

function switchImageTab(tab) {
  const isDevice = tab === "device";
  if (el.imgTabDevice) el.imgTabDevice.classList.toggle("active", isDevice);
  if (el.imgTabUrl) el.imgTabUrl.classList.toggle("active", !isDevice);
  if (el.imgPanelDevice) el.imgPanelDevice.classList.toggle("active", isDevice);
  if (el.imgPanelUrl) el.imgPanelUrl.classList.toggle("active", !isDevice);
  // Reset pending when switching tabs
  pendingImageDataUrl = null;
  if (el.imgInsertBtn) el.imgInsertBtn.disabled = true;
}

function clearDevicePreview() {
  if (el.imgDropZone) el.imgDropZone.style.display = "";
  if (el.imgDevicePreview) el.imgDevicePreview.style.display = "none";
  if (el.imgDevicePreviewImg) el.imgDevicePreviewImg.src = "";
  if (el.imgDeviceInfo) el.imgDeviceInfo.style.display = "none";
  if (el.imgDeviceName) el.imgDeviceName.textContent = "";
  pendingImageDataUrl = null;
  if (el.imgInsertBtn) el.imgInsertBtn.disabled = true;
}

function clearUrlPreview() {
  if (el.imgUrlPreview) el.imgUrlPreview.style.display = "none";
  if (el.imgUrlPreviewImg) el.imgUrlPreviewImg.src = "";
  if (el.imgUrlInfo) el.imgUrlInfo.style.display = "none";
  if (el.imgUrlStatus) el.imgUrlStatus.textContent = "";
  pendingImageDataUrl = null;
  if (el.imgInsertBtn) el.imgInsertBtn.disabled = true;
}

function handleDeviceImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("Please select a valid image file.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    pendingImageDataUrl = dataUrl;
    // Show preview
    if (el.imgDropZone) el.imgDropZone.style.display = "none";
    if (el.imgDevicePreview) el.imgDevicePreview.style.display = "flex";
    if (el.imgDevicePreviewImg) el.imgDevicePreviewImg.src = dataUrl;
    if (el.imgDeviceInfo) el.imgDeviceInfo.style.display = "flex";
    if (el.imgDeviceName) {
      const sizeKB = (file.size / 1024).toFixed(1);
      el.imgDeviceName.textContent = `${file.name} (${sizeKB} KB)`;
    }
    if (el.imgInsertBtn) el.imgInsertBtn.disabled = false;
  };
  reader.onerror = () => {
    showToast("Failed to read image file.", "error");
  };
  reader.readAsDataURL(file);
}

async function handleUrlImageLoad() {
  const url = el.imgUrlInput ? el.imgUrlInput.value.trim() : "";
  if (!url) {
    showToast("Please enter an image URL.", "info");
    return;
  }
  // Show loading state
  if (el.imgUrlPreview) {
    el.imgUrlPreview.style.display = "flex";
    el.imgUrlPreview.innerHTML = '<div class="image-loading-spinner"></div>';
  }
  if (el.imgUrlInfo) el.imgUrlInfo.style.display = "none";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error("URL does not point to an image");
    }
    const blob = await response.blob();
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      pendingImageDataUrl = dataUrl;
      if (el.imgUrlPreview) {
        el.imgUrlPreview.innerHTML = '';
        const img = document.createElement("img");
        img.id = "img-url-preview-img";
        img.src = dataUrl;
        img.alt = "Preview";
        el.imgUrlPreview.appendChild(img);
      }
      if (el.imgUrlInfo) el.imgUrlInfo.style.display = "flex";
      const sizeKB = (blob.size / 1024).toFixed(1);
      if (el.imgUrlStatus) el.imgUrlStatus.textContent = `${sizeKB} KB · Loaded from URL`;
      if (el.imgInsertBtn) el.imgInsertBtn.disabled = false;
    };
    reader.onerror = () => {
      throw new Error("Failed to convert image");
    };
    reader.readAsDataURL(blob);
  } catch (err) {
    if (el.imgUrlPreview) {
      el.imgUrlPreview.innerHTML = '';
      el.imgUrlPreview.style.display = "flex";
      // Try loading the URL directly as an img (for cases where fetch is blocked by CORS)
      const img = document.createElement("img");
      img.alt = "Preview";
      img.onload = () => {
        // Image loaded directly — use the URL as-is
        pendingImageDataUrl = url;
        if (el.imgUrlInfo) el.imgUrlInfo.style.display = "flex";
        if (el.imgUrlStatus) el.imgUrlStatus.textContent = "Loaded from URL (external)";
        if (el.imgInsertBtn) el.imgInsertBtn.disabled = false;
      };
      img.onerror = () => {
        el.imgUrlPreview.innerHTML = '<span class="image-preview-placeholder">Failed to load image. Check the URL and try again.</span>';
        pendingImageDataUrl = null;
        if (el.imgInsertBtn) el.imgInsertBtn.disabled = true;
      };
      img.src = url;
      el.imgUrlPreview.appendChild(img);
    }
  }
}

function insertPendingImage() {
  if (!pendingImageDataUrl || !quill) return;
  const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
  quill.insertEmbed(range.index, "image", pendingImageDataUrl, "user");
  quill.setSelection(range.index + 1, "silent");
  closeImageInsertModal();
}

// Bind image modal events
function bindImageModalEvents() {
  // Tab switching
  if (el.imgTabDevice) el.imgTabDevice.addEventListener("click", () => switchImageTab("device"));
  if (el.imgTabUrl) el.imgTabUrl.addEventListener("click", () => switchImageTab("url"));

  // Browse files trigger
  if (el.imgBrowseTrigger) {
    el.imgBrowseTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (el.imgFileInput) el.imgFileInput.click();
    });
  }

  // Drop zone click → open file picker
  if (el.imgDropZone) {
    el.imgDropZone.addEventListener("click", () => {
      if (el.imgFileInput) el.imgFileInput.click();
    });

    // Drag and drop
    el.imgDropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.imgDropZone.classList.add("drag-over");
    });
    el.imgDropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.imgDropZone.classList.remove("drag-over");
    });
    el.imgDropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.imgDropZone.classList.remove("drag-over");
      const file = e.dataTransfer.files[0];
      if (file) handleDeviceImageFile(file);
    });
  }

  // File input change
  if (el.imgFileInput) {
    el.imgFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleDeviceImageFile(file);
    });
  }

  // Remove device preview
  if (el.imgDeviceRemove) {
    el.imgDeviceRemove.addEventListener("click", () => {
      clearDevicePreview();
      if (el.imgFileInput) el.imgFileInput.value = "";
    });
  }

  // URL load button
  if (el.imgUrlLoad) {
    el.imgUrlLoad.addEventListener("click", handleUrlImageLoad);
  }

  // URL input Enter key
  if (el.imgUrlInput) {
    el.imgUrlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleUrlImageLoad();
      }
    });
  }

  // Remove URL preview
  if (el.imgUrlRemove) {
    el.imgUrlRemove.addEventListener("click", clearUrlPreview);
  }

  // Cancel button
  if (el.imgCancelBtn) {
    el.imgCancelBtn.addEventListener("click", closeImageInsertModal);
  }

  // Insert button
  if (el.imgInsertBtn) {
    el.imgInsertBtn.addEventListener("click", insertPendingImage);
  }

  // Click backdrop to close
  if (el.imageInsertModal) {
    el.imageInsertModal.addEventListener("click", (e) => {
      if (e.target === el.imageInsertModal) closeImageInsertModal();
    });
  }

  // Escape key to close
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.imageInsertModal && !el.imageInsertModal.hidden) {
      closeImageInsertModal();
    }
  });

  // Override Quill's default image handler to open our modal
  if (quill) {
    const toolbar = quill.getModule("toolbar");
    if (toolbar) {
      toolbar.addHandler("image", () => {
        openImageInsertModal();
      });
    }
  }
}

bindImageModalEvents();

// ==========================================================================
//   Word-Style Image Resize Handles
// ==========================================================================
let selectedImg = null;
let resizeOverlay = null;

function removeImageResizeHandles() {
  if (resizeOverlay) {
    resizeOverlay.remove();
    resizeOverlay = null;
  }
  if (selectedImg) {
    selectedImg.classList.remove("img-selected");
    selectedImg = null;
  }
}

function getResizeContainer() {
  // Use the word-page-sheet as the container (it has position: relative)
  return el.wordPageSheet || document.getElementById("word-page-sheet");
}

function createResizeHandles(img) {
  removeImageResizeHandles();
  selectedImg = img;
  img.classList.add("img-selected");

  const container = getResizeContainer();
  if (!container) return;

  // Create overlay positioned over the image
  resizeOverlay = document.createElement("div");
  resizeOverlay.className = "img-resize-wrapper";
  resizeOverlay.setAttribute("contenteditable", "false");

  updateOverlayPosition();

  // Create 8 handles
  const dirs = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];
  dirs.forEach((dir) => {
    const handle = document.createElement("div");
    handle.className = `img-resize-handle ${dir}`;
    handle.setAttribute("contenteditable", "false");
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startResize(e, dir);
    });
    resizeOverlay.appendChild(handle);
  });

  // Size tooltip
  const tooltip = document.createElement("div");
  tooltip.className = "img-resize-tooltip";
  tooltip.textContent = `${Math.round(img.offsetWidth)} × ${Math.round(img.offsetHeight)}`;
  resizeOverlay.appendChild(tooltip);

  container.appendChild(resizeOverlay);
}

function updateOverlayPosition() {
  if (!resizeOverlay || !selectedImg) return;
  const container = getResizeContainer();
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const imgRect = selectedImg.getBoundingClientRect();

  resizeOverlay.style.top = (imgRect.top - containerRect.top + container.scrollTop) + "px";
  resizeOverlay.style.left = (imgRect.left - containerRect.left + container.scrollLeft) + "px";
  resizeOverlay.style.width = imgRect.width + "px";
  resizeOverlay.style.height = imgRect.height + "px";
}

function startResize(e, dir) {
  if (!selectedImg) return;

  const img = selectedImg;
  const startX = e.clientX;
  const startY = e.clientY;
  const startW = img.offsetWidth;
  const startH = img.offsetHeight;
  const aspect = startW / (startH || 1);
  const isCorner = dir === "nw" || dir === "ne" || dir === "sw" || dir === "se";

  // Prevent text selection while dragging
  const origUserSelect = document.body.style.userSelect;
  document.body.style.userSelect = "none";
  document.body.style.cursor = dir + "-resize";

  function onMouseMove(ev) {
    ev.preventDefault();
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    let newW = startW;
    let newH = startH;

    if (dir.includes("e")) newW = startW + dx;
    if (dir.includes("w")) newW = startW - dx;
    if (dir.includes("s")) newH = startH + dy;
    if (dir.includes("n")) newH = startH - dy;

    // Minimum size
    newW = Math.max(20, newW);
    newH = Math.max(20, newH);

    // Lock aspect ratio for corner handles
    if (isCorner) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        newH = Math.round(newW / aspect);
      } else {
        newW = Math.round(newH * aspect);
      }
      newW = Math.max(20, newW);
      newH = Math.max(20, newH);
    }

    // Apply size directly to the img element
    img.style.width = newW + "px";
    img.style.height = newH + "px";
    img.setAttribute("width", String(Math.round(newW)));
    img.setAttribute("height", String(Math.round(newH)));

    // Update overlay
    requestAnimationFrame(() => {
      updateOverlayPosition();
      // Update tooltip
      const tooltip = resizeOverlay ? resizeOverlay.querySelector(".img-resize-tooltip") : null;
      if (tooltip) {
        tooltip.textContent = `${Math.round(newW)} × ${Math.round(newH)}`;
      }
    });
  }

  function onMouseUp() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = origUserSelect;
    document.body.style.cursor = "";

    // Mark editor dirty
    if (state.editor) {
      state.editor.dirty = true;
      updateEditorChrome();
    }

    // Final position update
    requestAnimationFrame(updateOverlayPosition);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

// Detect clicks on images inside the Quill editor
// We use 'click' on the document since Quill intercepts mousedown
document.addEventListener("click", (e) => {
  if (!state.editor || !state.editor.active) return;

  // Did user click on an image inside the editor?
  const img = e.target.closest && e.target.closest("#editor-content .ql-editor img");
  if (img) {
    e.preventDefault();
    e.stopPropagation();
    createResizeHandles(img);
    return;
  }

  // Did user click on a resize handle? Don't deselect.
  if (e.target.closest && e.target.closest(".img-resize-handle")) {
    return;
  }
  if (e.target.closest && e.target.closest(".img-resize-wrapper")) {
    return;
  }

  // Clicked elsewhere — deselect
  if (selectedImg) {
    removeImageResizeHandles();
  }
}, true); // Use capture phase to get events before Quill

// Also handle mousedown on images (for immediate visual feedback)
document.addEventListener("mousedown", (e) => {
  if (!state.editor || !state.editor.active) return;
  const img = e.target.closest && e.target.closest("#editor-content .ql-editor img");
  if (img) {
    // Don't prevent default here — let click event handle selection
    // But stop Quill from changing selection
    setTimeout(() => {
      createResizeHandles(img);
    }, 0);
  }
}, true);

// Reposition handles on scroll
(function() {
  const workspace = document.getElementById("word-workspace");
  if (workspace) {
    workspace.addEventListener("scroll", () => {
      if (selectedImg && resizeOverlay) {
        requestAnimationFrame(updateOverlayPosition);
      }
    });
  }
})();

// Keyboard: Escape to deselect, Delete/Backspace to remove image
window.addEventListener("keydown", (e) => {
  if (!selectedImg) return;

  if (e.key === "Escape") {
    removeImageResizeHandles();
    return;
  }

  if ((e.key === "Delete" || e.key === "Backspace") && state.editor.active) {
    e.preventDefault();
    const img = selectedImg;
    removeImageResizeHandles();
    // Remove the image from Quill
    if (quill && typeof Quill !== "undefined") {
      try {
        const blot = Quill.find(img);
        if (blot) {
          const index = quill.getIndex(blot);
          quill.deleteText(index, 1, "user");
        }
      } catch {
        // Fallback: just remove from DOM
        img.remove();
      }
    }
  }
});

// ==========================================================================
//   Unsaved Changes Warning on App Close
// ==========================================================================
function hasAnyUnsavedWork() {
  // Check active editor
  if (state.editor.active && state.editor.dirty) return true;
  // Check modified PDF
  if (state.pdfModified) return true;
  // Check all tabs for dirty state
  for (const tab of tabs) {
    if (tab.type === "editor" && tab.editor?.dirty) return true;
    if (tab.dirty) return true;
  }
  return false;
}

function getUnsavedDocumentName() {
  if (state.editor.active && state.editor.dirty) {
    return state.editor.fileName || "Document1";
  }
  const dirtyTab = tabs.find(t => 
    (t.type === "editor" && (t.editor?.dirty || (t.id === activeTabId && state.editor.dirty))) ||
    t.dirty
  );
  return dirtyTab ? dirtyTab.name : "Document1";
}

function showUnsavedWarningModal() {
  if (!el.unsavedWarningModal) {
    // Fallback: no modal, just close
    if (window.pdfViewer?.confirmClose) window.pdfViewer.confirmClose("close");
    return;
  }
  if (el.unsavedDocName) el.unsavedDocName.textContent = getUnsavedDocumentName();
  el.unsavedWarningModal.hidden = false;
}

function hideUnsavedWarningModal() {
  if (el.unsavedWarningModal) el.unsavedWarningModal.hidden = true;
}

// Bind unsaved warning modal events
if (el.unsavedBtnCancel) {
  el.unsavedBtnCancel.addEventListener("click", () => {
    hideUnsavedWarningModal();
    // Tell main process user cancelled
    if (window.pdfViewer?.confirmClose) window.pdfViewer.confirmClose("cancel");
  });
}

if (el.unsavedBtnDiscard) {
  el.unsavedBtnDiscard.addEventListener("click", () => {
    hideUnsavedWarningModal();
    // Clear all dirty flags so beforeunload does not block closing
    state.editor.dirty = false;
    tabs.forEach((t) => {
      t.dirty = false;
      if (t.editor) t.editor.dirty = false;
    });
    // Don't save, just close
    if (window.pdfViewer?.confirmClose) window.pdfViewer.confirmClose("close");
  });
}

if (el.unsavedBtnSave) {
  el.unsavedBtnSave.addEventListener("click", async () => {
    hideUnsavedWarningModal();
    // Try to save first, then close
    try {
      await savePdf();
      state.editor.dirty = false;
      tabs.forEach((t) => {
        t.dirty = false;
        if (t.editor) t.editor.dirty = false;
      });
      // After save, close the app
      if (window.pdfViewer?.confirmClose) window.pdfViewer.confirmClose("close");
    } catch {
      // Save failed or cancelled, don't close
      showToast("Save was cancelled. Your document is still open.", "info");
    }
  });
}

// Listen for close request from main process
if (window.pdfViewer?.onCloseRequested) {
  window.pdfViewer.onCloseRequested(() => {
    if (hasAnyUnsavedWork()) {
      showUnsavedWarningModal();
    } else {
      // No unsaved work, close immediately
      if (window.pdfViewer?.confirmClose) window.pdfViewer.confirmClose("close");
    }
  });
}

// Also add beforeunload as a safety net
window.addEventListener("beforeunload", (e) => {
  if (hasAnyUnsavedWork()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

function editorHasContent() {
  if (!quill) return false;
  return Boolean(quill.getText().replace(/\n/g, "").trim());
}

function editorCharCount() {
  if (!quill) return 0;
  return quill.getText().replace(/\n/g, "").length;
}

function editorWordCount() {
  if (!quill) return 0;
  const text = quill.getText().trim();
  return text ? text.trim().split(/\s+/).length : 0;
}

function applyEditorFontSize() {
  if (quill && state.editor.options && el.editorContent) {
    const editable = el.editorContent.querySelector(".ql-editor");
    if (editable) editable.style.fontSize = `${state.editor.options.fontSize}pt`;
  }
}

function applyEditorLineSpacing() {
  if (state.editor?.options && el.editorContent) {
    const spacing = state.editor.options.lineSpacing || 1.15;
    const editable = el.editorContent.querySelector(".ql-editor");
    if (editable) editable.style.lineHeight = String(spacing);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = String(str || "");
  return d.innerHTML;
}

function availableSpace() {
  const w = el.pageHost.clientWidth - PAGE_PAD * 2;
  const h = el.pageHost.clientHeight - PAGE_PAD * 2;
  return { w: Math.max(40, w), h: Math.max(40, h) };
}

function effectiveScale() {
  if (state.layoutMode === "fixed") return state.zoom;
  const first = state.pages[0];
  if (!first) return state.zoom;
  const rot = (first.page.rotate + state.rotation) % 360;
  const vp1 = first.page.getViewport({ scale: 1, rotation: rot });
  const { w, h } = availableSpace();
  const w1 = vp1.width;
  const h1 = vp1.height;
  if (state.layoutMode === "fit-width") return Math.max(MIN_ZOOM, w / w1);
  return Math.max(MIN_ZOOM, Math.min(w / w1, h / h1));
}

function updateControls() {
  const hasDoc = Boolean(state.doc);
  const isEditor = Boolean(state.editor && state.editor.active);
  const hasContent = hasDoc || isEditor;

  if (el.btnSave) el.btnSave.disabled = !hasContent;
  if (el.btnPrint) el.btnPrint.disabled = !hasContent;
  if (el.btnFind) el.btnFind.disabled = !hasContent;
  if (el.btnInfo) el.btnInfo.disabled = !hasContent;

  for (const btn of [
    el.btnZoomIn,
    el.btnZoomOut,
    el.btnRotate,
    el.btnFitWidth,
    el.btnFitPage,
    el.btnTwoPage,
    el.btnAddPage,
  ]) {
    if (btn) btn.disabled = !hasDoc;
  }
  if (el.btnPrev) {
    const onFirst = state.twoPageMode ? state.currentPage <= 2 : state.currentPage <= 1;
    el.btnPrev.disabled = !hasDoc || onFirst;
  }
  if (el.btnNext) {
    const onLast = state.twoPageMode ? state.currentPage >= state.pages.length - 1 : state.currentPage >= state.pages.length;
    el.btnNext.disabled = !hasDoc || onLast;
  }
  if (el.zoomSelect) el.zoomSelect.disabled = !hasDoc;
  if (el.btnTwoPage) {
    el.btnTwoPage.classList.toggle("active", Boolean(state.twoPageMode));
  }
  if (el.pageJumpInput) {
    el.pageJumpInput.disabled = !hasDoc;
    el.pageJumpInput.max = String(hasDoc ? state.pages.length : 1);
    el.pageJumpInput.value = String(hasDoc ? state.currentPage : 1);
  }
  if (el.pageIndicator) {
    if (!hasDoc) {
      el.pageIndicator.textContent = "— of —";
    } else if (state.twoPageMode && state.pages.length > 1) {
      const p1 = state.currentPage % 2 === 0 ? state.currentPage - 1 : state.currentPage;
      const p2 = p1 + 1;
      if (p2 <= state.pages.length) {
        if (el.pageJumpInput && document.activeElement !== el.pageJumpInput) {
          el.pageJumpInput.value = String(p1);
        }
        el.pageIndicator.textContent = `– ${p2} of ${state.pages.length}`;
      } else {
        el.pageIndicator.textContent = `of ${state.pages.length}`;
      }
    } else {
      el.pageIndicator.textContent = `of ${state.pages.length}`;
    }
  }
}

function updateZoomSelect() {
  const percent = Math.round(effectiveScale() * 100);
  const preset = ZOOM_PRESETS.find((p) => Math.abs(p - percent / 100) < 0.02);
  if (preset) {
    el.zoomSelect.value = String(Math.round(preset * 100));
  } else {
    let opt = el.zoomSelect.querySelector('option[data-custom="1"]');
    if (!opt) {
      opt = document.createElement("option");
      opt.dataset.custom = "1";
      el.zoomSelect.appendChild(opt);
    }
    opt.value = String(percent);
    opt.textContent = `${percent}%`;
    el.zoomSelect.value = String(percent);
  }
  el.zoomSelect.title = `${percent}%`;
}

function layoutPages() {
  if (!state.doc) return;
  const { w: availW, h: availH } = availableSpace();
  const isTwoPage = Boolean(state.twoPageMode);
  el.pageHost.classList.toggle("two-page-mode", isTwoPage);
  if (el.btnTwoPage) el.btnTwoPage.classList.toggle("active", isTwoPage);

  const effectiveAvailW = isTwoPage ? Math.max(200, (availW - 48) / 2) : availW;

  for (const p of state.pages) {
    const rot = (p.page.rotate + state.rotation) % 360;
    const vp1 = p.page.getViewport({ scale: 1, rotation: rot });
    const w1 = vp1.width;
    const h1 = vp1.height;
    let scale;
    if (state.layoutMode === "fit-width") {
      scale = effectiveAvailW / w1;
    } else if (state.layoutMode === "fit-page") {
      scale = Math.min(effectiveAvailW / w1, availH / h1);
    } else {
      scale = isTwoPage ? state.zoom * 0.75 : state.zoom;
    }
    p.scale = clamp(scale, MIN_ZOOM, 8);
    p.width = Math.round(w1 * p.scale);
    p.height = Math.round(h1 * p.scale);
    p.div.style.width = `${p.width}px`;
    p.div.style.height = `${p.height}px`;
    p.div.style.setProperty("--scale-factor", String(p.scale));
    p.rendered = false;
    p.renderKey = 0;
    if (p.prevTask) {
      try {
        p.prevTask.cancel();
      } catch {
        // ignore
      }
      p.prevTask = null;
    }
    if (p.textTask) {
      try {
        p.textTask.cancel();
      } catch {
        // ignore
      }
      p.textTask = null;
    }
    if (p.textDiv) {
      p.textDiv.textContent = "";
    }
    if (p.annotDiv) {
      p.annotDiv.textContent = "";
    }
  }
  queueVisibleRender();
}

function computeVisibleRange() {
  const first = state.pages[0];
  if (!first) return [-1, -1];
  const top = el.pageHost.scrollTop - PAGE_PAD;
  const bottom = top + el.pageHost.clientHeight + PAGE_PAD;
  let start = -1;
  let end = -1;
  for (let i = 0; i < state.pages.length; i++) {
    const p = state.pages[i];
    const y = p.div.offsetTop;
    if (start < 0 && y + p.height >= top) start = i;
    if (y <= bottom) end = i;
    if (y > bottom) break;
  }
  return [start, end];
}

function computeCurrentPage() {
  if (!state.pages.length) return;
  const mid = el.pageHost.scrollTop + el.pageHost.clientHeight / 2;
  let current = 0;
  for (let i = 0; i < state.pages.length; i++) {
    if (state.pages[i].div.offsetTop <= mid) current = i;
    else break;
  }
  if (current + 1 !== state.currentPage) {
    state.currentPage = current + 1;
    if (el.pageJumpInput && document.activeElement !== el.pageJumpInput) {
      el.pageJumpInput.value = String(state.currentPage);
    }
    updateControls();
    updateActiveThumb();
  }
}

function queueVisibleRender() {
  if (!state.doc) return;
  state.renderSeq++;
  const seq = state.renderSeq;
  requestAnimationFrame(() => {
    if (seq !== state.renderSeq) return;
    collectVisiblePages();
  });
}

function collectVisiblePages() {
  if (!state.doc) return;
  computeCurrentPage();
  const [start, end] = computeVisibleRange();
  for (let i = start - 3; i < end + 3; i++) {
    const p = state.pages[i];
    if (p && !p.rendered) enqueueRender(p);
  }
  pumpRender();
}

function enqueueRender(p) {
  if (!state.renderQueue.includes(p)) state.renderQueue.push(p);
}

async function pumpRender() {
  if (state.renderBusy) return;
  state.renderBusy = true;
  try {
    while (state.renderQueue.length) {
      const p = state.renderQueue.shift();
      await renderPage(p);
    }
  } catch {
    // keep going
  } finally {
    state.renderBusy = false;
  }
}

async function renderPage(p) {
  if (p.rendered) return;
  const key = ++p.renderKey;
  p.pageRendering = true;

  if (p.thumbTask) {
    try {
      p.thumbTask.cancel();
    } catch {
      // ignore
    }
    p.thumbTask = null;
    p.thumbRendering = false;
  }

  const dpr = window.devicePixelRatio || 1;
  const rot = (p.page.rotate + state.rotation) % 360;
  const viewport = p.page.getViewport({ scale: p.scale * dpr, rotation: rot });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  if (p.canvas.width !== width) p.canvas.width = width;
  if (p.canvas.height !== height) p.canvas.height = height;
  p.canvas.style.width = `${p.width}px`;
  p.canvas.style.height = `${p.height}px`;

  if (p.prevTask) {
    try {
      p.prevTask.cancel();
    } catch {
      // ignore
    }
  }
  const ctx = p.canvas.getContext("2d");
  const task = p.page.render({ canvasContext: ctx, viewport });
  p.prevTask = task;
  try {
    await task.promise;
    if (key === p.renderKey) {
      p.rendered = true;
      updateThumbFromPageCanvas(p);
    }
  } catch (_err) {
    // cancelled or failed
  } finally {
    p.pageRendering = false;
    p.prevTask = null;
  }
  if (key !== p.renderKey || !p.rendered) return;

  renderTextLayerForPage(p, key);
  renderAnnotationLayerForPage(p, key);
}

async function renderAnnotationLayerForPage(p, key) {
  if (!p.annotDiv) {
    p.annotDiv = document.createElement("div");
    p.annotDiv.className = "annotationLayer";
    p.div.appendChild(p.annotDiv);
  }
  p.annotDiv.textContent = "";

  const rot = (p.page.rotate + state.rotation) % 360;
  const viewport = p.page.getViewport({ scale: p.scale, rotation: rot });

  try {
    const annotations = await p.page.getAnnotations({ intent: "display" });
    if (key !== p.renderKey || !annotations || !annotations.length) return;

    for (const item of annotations) {
      if (item.subtype === "Link" && (item.url || item.dest)) {
        if (!item.rect || item.rect.length < 4) continue;
        const [x1, y1] = viewport.convertToViewportPoint(item.rect[0], item.rect[1]);
        const [x2, y2] = viewport.convertToViewportPoint(item.rect[2], item.rect[3]);
        const minX = Math.min(x1, x2);
        const minY = Math.min(y1, y2);
        const width = Math.abs(x1 - x2);
        const height = Math.abs(y1 - y2);

        const a = document.createElement("a");
        a.className = "pdf-link-annotation";
        a.style.left = `${Math.round(minX)}px`;
        a.style.top = `${Math.round(minY)}px`;
        a.style.width = `${Math.round(width)}px`;
        a.style.height = `${Math.round(height)}px`;

        if (item.url) {
          a.href = item.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.title = `${item.url} (Click to open in browser)`;
          a.addEventListener("click", (e) => {
            e.preventDefault();
            window.open(item.url, "_blank");
          });
        } else if (item.dest) {
          a.title = "Jump to linked section";
          a.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
              const dest = typeof item.dest === "string" ? await state.doc.getDestination(item.dest) : item.dest;
              if (Array.isArray(dest) && dest[0]) {
                const pageIndex = typeof dest[0] === "number" ? dest[0] : await state.doc.getPageIndex(dest[0]);
                if (pageIndex >= 0) scrollToPage(pageIndex);
              }
            } catch {}
          });
        }
        p.annotDiv.appendChild(a);
      }
    }
  } catch {
    // annotations unavailable or cancelled
  }
}

async function renderTextLayerForPage(p, key) {
  if (p.textTask) {
    try {
      p.textTask.cancel();
    } catch {
      // ignore
    }
    p.textTask = null;
  }
  p.textDiv.textContent = "";

  const rot = (p.page.rotate + state.rotation) % 360;
  const textViewport = p.page.getViewport({ scale: p.scale, rotation: rot });
  try {
    if (!p.textContent) {
      p.textContent = await p.page.getTextContent();
    }
    if (key !== p.renderKey) return;

    const textLayer = new TextLayer({
      textContentSource: p.textContent,
      container: p.textDiv,
      viewport: textViewport,
    });
    p.textTask = textLayer;
    await textLayer.render();
    if (key !== p.renderKey) return;
    p.textTask = null;

    if (state.search.query) {
      highlightPage(p);
      const active = p.textDiv.querySelector(".highlight.selected");
      if (active) {
        active.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    }
  } catch (err) {
    if (err && err.name === "AbortException") return;
    // ignore
  }
}

function scrollToPage(index) {
  const p = state.pages[index];
  if (!p) return;
  const target = Math.max(0, p.div.offsetTop - Math.max(24, (el.pageHost.clientHeight - p.height) / 2));
  el.pageHost.scrollTo({ top: target, behavior: "smooth" });
}

function prevPage() {
  if (!state.doc) return;
  if (state.twoPageMode) {
    const currentSpreadStart = state.currentPage % 2 === 0 ? state.currentPage - 1 : state.currentPage;
    const targetPage = Math.max(1, currentSpreadStart - 2);
    if (currentSpreadStart > 1) scrollToPage(targetPage - 1);
    return;
  }
  if (state.currentPage > 1) scrollToPage(state.currentPage - 2);
}

function nextPage() {
  if (!state.doc) return;
  if (state.twoPageMode) {
    const currentSpreadStart = state.currentPage % 2 === 0 ? state.currentPage - 1 : state.currentPage;
    const targetPage = currentSpreadStart + 2;
    if (targetPage <= state.pages.length) scrollToPage(targetPage - 1);
    return;
  }
  if (state.currentPage < state.pages.length) scrollToPage(state.currentPage);
}

function setFit(mode) {
  state.layoutMode = mode;
  layoutPages();
  updateZoomSelect();
  syncFitButtons();
}

function zoomIn() {
  if (!state.doc) return;
  const cur = effectiveScale();
  const next = ZOOM_PRESETS.find((p) => p > cur + 0.015);
  state.zoom = next ? next : clamp(cur * 1.25, MIN_ZOOM, MAX_ZOOM);
  state.layoutMode = "fixed";
  layoutPages();
  updateZoomSelect();
  syncFitButtons();
}

function zoomOut() {
  if (!state.doc) return;
  const cur = effectiveScale();
  const prev = [...ZOOM_PRESETS].reverse().find((p) => p < cur - 0.015);
  state.zoom = prev ? prev : clamp(cur * 0.8, MIN_ZOOM, MAX_ZOOM);
  state.layoutMode = "fixed";
  layoutPages();
  updateZoomSelect();
  syncFitButtons();
}

function zoomBy(factor) {
  if (!state.doc) return;
  if (state.layoutMode !== "fixed") {
    state.zoom = effectiveScale();
    state.layoutMode = "fixed";
  }
  state.zoom = clamp(state.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  layoutPages();
  updateZoomSelect();
  syncFitButtons();
}

function actualSize() {
  if (!state.doc) return;
  state.zoom = 1;
  state.layoutMode = "fixed";
  layoutPages();
  updateZoomSelect();
  syncFitButtons();
}

function rotateClockwise() {
  if (!state.doc) return;
  state.rotation = (state.rotation + 90) % 360;
  layoutPages();
  buildThumbnails();
}

function syncFitButtons() {
  el.btnFitWidth.classList.toggle("active", state.layoutMode === "fit-width");
  el.btnFitPage.classList.toggle("active", state.layoutMode === "fit-page");
}

function updateActiveThumb() {
  for (let i = 0; i < state.pages.length; i++) {
    const isCurrent = i === state.currentPage - 1;
    const p = state.pages[i];
    if (p && p.thumbDiv) {
      p.thumbDiv.classList.toggle("active", isCurrent);
      if (isCurrent && thumbsVisible && state.activeSidebarTab === "thumbs" && !el.thumbnails.hidden) {
        const cRect = el.thumbnails.getBoundingClientRect();
        const tRect = p.thumbDiv.getBoundingClientRect();
        if (tRect.top < cRect.top || tRect.bottom > cRect.bottom) {
          p.thumbDiv.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    }
  }
}

let thumbsVisible = true;

function toggleThumbnails() {
  thumbsVisible = !thumbsVisible;
  applyThumbnails();
}

function applyThumbnails() {
  el.thumbnails.hidden = !thumbsVisible;
  el.btnThumbs.classList.toggle("active", thumbsVisible);
  if (thumbsVisible && state.activeSidebarTab === "thumbs") {
    queueThumbRenders();
  }
  setTimeout(layoutPages, 0);
}

function switchSidebarTab(tab) {
  state.activeSidebarTab = tab;
  el.tabThumbs.classList.toggle("active", tab === "thumbs");
  el.tabOutline.classList.toggle("active", tab === "outline");
  el.thumbList.hidden = tab !== "thumbs";
  el.outlineList.hidden = tab !== "outline";
  if (tab === "thumbs") {
    queueThumbRenders();
  }
}

let thumbRenderGen = 0;
let thumbRenderActive = 0;
const MAX_CONCURRENT_THUMB_RENDERS = 2;

function buildThumbnails() {
  thumbRenderGen++;
  el.thumbList.textContent = "";
  for (let i = 0; i < state.pages.length; i++) {
    const p = state.pages[i];
    p.thumbRendered = false;
    p.thumbRendering = false;
    if (p.thumbTask) {
      try {
        p.thumbTask.cancel();
      } catch {
        // ignore
      }
      p.thumbTask = null;
    }

    const div = document.createElement("div");
    div.className = "thumb";
    div.dataset.index = String(i);

    const rot = (p.page.rotate + state.rotation) % 360;
    const vp1 = p.page.getViewport({ scale: 1, rotation: rot });
    const scale = THUMB_MAX / Math.max(vp1.width, vp1.height);
    const tw = Math.round(vp1.width * scale);
    const th = Math.round(vp1.height * scale);

    div.style.width = `${tw}px`;
    div.style.minHeight = `${th}px`;

    const canvas = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(tw * dpr);
    canvas.height = Math.ceil(th * dpr);
    canvas.style.width = `${tw}px`;
    canvas.style.height = `${th}px`;

    const label = document.createElement("span");
    label.className = "thumb-label";
    label.textContent = String(p.n);
    div.append(canvas, label);
    p.thumbDiv = div;
    p.thumbCanvas = canvas;
    el.thumbList.appendChild(div);
  }
  applyThumbnails();
  queueThumbRenders();
}

async function buildOutline(doc) {
  el.outlineList.textContent = "";
  try {
    const outline = await doc.getOutline();
    state.outline = outline || [];
    if (!outline || !outline.length) {
      el.outlineList.innerHTML = '<div class="empty-outline">No outline in this document</div>';
      return;
    }
    const container = document.createElement("div");
    container.className = "outline-tree";
    renderOutlineItems(outline, container, 0);
    el.outlineList.appendChild(container);
  } catch {
    el.outlineList.innerHTML = '<div class="empty-outline">Could not load outline</div>';
  }
}

function renderOutlineItems(items, container, depth) {
  for (const item of items) {
    const link = document.createElement("div");
    link.className = "outline-item";
    link.style.paddingLeft = `${depth * 14 + 8}px`;
    link.textContent = item.title;
    link.addEventListener("click", async () => {
      if (item.dest) {
        try {
          const dest = typeof item.dest === "string" ? await state.doc.getDestination(item.dest) : item.dest;
          if (Array.isArray(dest) && dest[0]) {
            let pageIndex = -1;
            if (typeof dest[0] === "number") {
              pageIndex = dest[0];
            } else if (dest[0] && typeof dest[0] === "object") {
              pageIndex = await state.doc.getPageIndex(dest[0]);
            }
            if (pageIndex >= 0) {
              scrollToPage(pageIndex);
            }
          }
        } catch {
          // destination could not be navigated
        }
      }
    });
    container.appendChild(link);
    if (item.items && item.items.length) {
      renderOutlineItems(item.items, container, depth + 1);
    }
  }
}

function queueThumbRenders() {
  if (!state.doc || el.thumbnails.hidden || state.activeSidebarTab !== "thumbs") return;
  scheduleNextThumbRender();
}

function scheduleNextThumbRender() {
  if (!state.doc || el.thumbnails.hidden || state.activeSidebarTab !== "thumbs") return;
  while (thumbRenderActive < MAX_CONCURRENT_THUMB_RENDERS) {
    const next = getNextThumbnailToRender();
    if (!next) break;
    void renderSingleThumb(next, thumbRenderGen);
  }
}

function updateThumbFromPageCanvas(p) {
  if (!p || !p.canvas || !p.thumbCanvas || !p.thumbDiv || !p.page) return;
  const c = p.thumbCanvas;
  const rot = (p.page.rotate + state.rotation) % 360;
  const vp1 = p.page.getViewport({ scale: 1, rotation: rot });
  const baseScale = THUMB_MAX / Math.max(vp1.width, vp1.height);
  const dpr = window.devicePixelRatio || 1;
  const tw = Math.round(vp1.width * baseScale);
  const th = Math.round(vp1.height * baseScale);

  c.width = Math.ceil(tw * dpr);
  c.height = Math.ceil(th * dpr);
  c.style.width = `${tw}px`;
  c.style.height = `${th}px`;
  p.thumbDiv.style.width = `${tw}px`;
  p.thumbDiv.style.minHeight = `${th}px`;

  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  try {
    ctx.drawImage(p.canvas, 0, 0, c.width, c.height);
    p.thumbRendered = true;
    p.thumbRendering = false;
  } catch {
    // Fallback if drawImage cannot read from canvas
  }
}

function getNextThumbnailToRender() {
  if (!state.pages || !state.pages.length) return null;
  const container = el.thumbnails;
  const cRect = container.getBoundingClientRect();

  // If already rendered on main canvas, sync it immediately
  for (const p of state.pages) {
    if (!p.thumbRendered && !p.thumbRendering && p.rendered && p.canvas && p.canvas.width > 0) {
      return p;
    }
  }

  // Priority 1: Current active page (if not currently rendering on main canvas)
  const activeIdx = state.currentPage - 1;
  const activePage = state.pages[activeIdx];
  if (activePage && !activePage.thumbRendered && !activePage.thumbRendering && !activePage.pageRendering) {
    return activePage;
  }

  // Priority 2: Currently visible in sidebar (with 250px buffer, not currently rendering on main canvas)
  for (const p of state.pages) {
    if (p.thumbRendered || p.thumbRendering || p.pageRendering || !p.thumbDiv) continue;
    const tRect = p.thumbDiv.getBoundingClientRect();
    if (tRect.bottom >= cRect.top - 200 && tRect.top <= cRect.bottom + 250) {
      return p;
    }
  }

  // Priority 3: Any remaining unrendered pages
  for (const p of state.pages) {
    if (!p.thumbRendered && !p.thumbRendering && !p.pageRendering && p.thumbDiv) {
      return p;
    }
  }

  return null;
}

async function renderSingleThumb(p, gen) {
  if (p.thumbRendered || p.thumbRendering || !p.thumbCanvas || !p.page) return;

  // If already rendered on the main canvas, copy instantly via drawImage
  if (p.rendered && p.canvas && p.canvas.width > 0) {
    updateThumbFromPageCanvas(p);
    scheduleNextThumbRender();
    return;
  }

  // If main page is currently painting, defer so we never conflict with main reader
  if (p.pageRendering) {
    return;
  }

  p.thumbRendering = true;
  thumbRenderActive++;

  try {
    const rot = (p.page.rotate + state.rotation) % 360;
    const vp1 = p.page.getViewport({ scale: 1, rotation: rot });
    const baseScale = THUMB_MAX / Math.max(vp1.width, vp1.height);
    const dpr = window.devicePixelRatio || 1;
    const viewport = p.page.getViewport({ scale: baseScale * dpr, rotation: rot });

    const c = p.thumbCanvas;
    const tw = Math.ceil(viewport.width / dpr);
    const th = Math.ceil(viewport.height / dpr);

    if (c.width !== Math.ceil(viewport.width) || c.height !== Math.ceil(viewport.height)) {
      c.width = Math.ceil(viewport.width);
      c.height = Math.ceil(viewport.height);
    }
    c.style.width = `${tw}px`;
    c.style.height = `${th}px`;
    if (p.thumbDiv) {
      p.thumbDiv.style.width = `${tw}px`;
      p.thumbDiv.style.minHeight = `${th}px`;
    }

    const ctx = c.getContext("2d");
    const task = p.page.render({ canvasContext: ctx, viewport });
    p.thumbTask = task;
    await task.promise;

    if (gen === thumbRenderGen) {
      p.thumbRendered = true;
    }
  } catch (_err) {
    // cancelled or failed, allow retry
  } finally {
    p.thumbRendering = false;
    p.thumbTask = null;
    thumbRenderActive = Math.max(0, thumbRenderActive - 1);
    scheduleNextThumbRender();
  }
}

async function buildPages(doc) {
  el.pageHost.textContent = "";
  state.pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const section = document.createElement("section");
    section.className = "pdf-page";
    section.dataset.pageNumber = String(n);
    const canvas = document.createElement("canvas");
    canvas.className = "pdf-canvas";
    const textDiv = document.createElement("div");
    textDiv.className = "textLayer";
    const annotDiv = document.createElement("div");
    annotDiv.className = "annotationLayer";
    section.append(canvas, textDiv, annotDiv);
    el.pageHost.appendChild(section);
    state.pages.push({
      n,
      page,
      vp1,
      div: section,
      canvas,
      textDiv,
      annotDiv,
      textContent: null,
      scale: 1,
      width: vp1.width,
      height: vp1.height,
      rendered: false,
      prevTask: null,
      textTask: null,
      renderKey: 0,
      thumbDiv: null,
      thumbCanvas: null,
      thumbRendered: false,
    });
  }
}

async function destroyDocument() {
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

function setLoading(on) {
  el.loadingBar.hidden = !on;
}

function showEmpty() {
  el.emptyState.hidden = false;
  el.errorState.hidden = true;
  el.docName.textContent = "PDFForge Viewer";
  el.docName.title = "No document opened";
  document.title = "PDFForge Viewer";
  renderRecentFiles();
  updateControls();
}

function showError(err) {
  const msg = err && err.message ? err.message : "The file could not be read or is not a valid PDF.";
  window.__pdfViewerError = msg;
  el.errorTitle.textContent = "Couldn't open this file";
  el.errorMessage.textContent = msg;
  el.errorState.hidden = false;
  el.emptyState.hidden = true;
  updateControls();
}

function hideAllOverlays() {
  el.passwordModal.hidden = true;
  el.dropOverlay.hidden = true;
  if (el.propertiesModal) el.propertiesModal.hidden = true;
  if (el.shortcutsModal) el.shortcutsModal.hidden = true;
  if (el.aboutModal) el.aboutModal.hidden = true;
}

function setEditorStatus(message) {
  el.editorStatus.textContent = message || "";
}

function insertWordPageBreak() {
  if (!quill) return;
  const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
  try {
    quill.insertEmbed(range.index, "pageBreak", true, "user");
    quill.insertText(range.index + 1, "\n", "user");
    quill.setSelection(range.index + 2, "silent");
  } catch {
    quill.insertText(range.index, "\n\f\n", "user");
    quill.setSelection(range.index + 3, "silent");
  }
  updateEditorChrome();
}

function insertWordHr() {
  if (!quill) return;
  const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
  try {
    quill.insertEmbed(range.index, "hr", true, "user");
    quill.insertText(range.index + 1, "\n", "user");
    quill.setSelection(range.index + 2, "silent");
  } catch {
    quill.insertText(range.index, "\n---\n", "user");
  }
  updateEditorChrome();
}

function updateDocZoom() {
  if (el.wordPageSheet) {
    el.wordPageSheet.style.transform = `scale(${docZoomScale})`;
  }
  if (el.docZoomLabel) {
    el.docZoomLabel.textContent = `${Math.round(docZoomScale * 100)}%`;
  }
}

function zoomDocIn() {
  docZoomScale = clamp(Number((docZoomScale + 0.1).toFixed(1)), 0.5, 2.0);
  updateDocZoom();
}

function zoomDocOut() {
  docZoomScale = clamp(Number((docZoomScale - 0.1).toFixed(1)), 0.5, 2.0);
  updateDocZoom();
}

function updateEditorChrome() {
  const { fileName, dirty, saving, source } = state.editor;
  el.editorName.textContent = fileName;
  if (el.editorNameInput && document.activeElement !== el.editorNameInput) {
    el.editorNameInput.value = fileName;
  }
  if (el.editorSaveState) {
    el.editorSaveState.textContent = dirty ? "Unsaved" : "Saved";
    el.editorSaveState.classList.toggle("dirty", dirty);
  }
  if (dirty) {
    el.editorSubtitle.textContent = "Word Document — unsaved changes";
  } else if (source) {
    el.editorSubtitle.textContent = `Word Document from ${source}`;
  } else {
    el.editorSubtitle.textContent = "Word Rich Document Editor";
  }
  el.docName.textContent = fileName;
  el.docName.title = `Editing ${fileName}`;
  document.title = `${fileName}${dirty ? " *" : ""} — Word Editor`;
  const chars = editorCharCount();
  const words = editorWordCount();
  el.editorStats.textContent = `${words} words · ${chars} characters`;

  // Update Word page count
  if (el.wordPageCount && quill) {
    const rawHtml = quill.root ? quill.root.innerHTML : "";
    const pageBreaks = (rawHtml.match(/word-page-break|\f/g) || []).length;
    const totalPages = pageBreaks + 1;
    el.wordPageCount.textContent = `Page 1 of ${totalPages}`;
  }

  el.editorSaveLabel.textContent = saving ? "Saving…" : "Save as PDF";
  el.btnEditorSave.disabled = saving || !editorHasContent();

  const currentTab = tabs.find((t) => t.id === activeTabId);
  if (currentTab) {
    currentTab.name = fileName;
    if (currentTab.editor) {
      currentTab.editor.fileName = fileName;
      currentTab.editor.dirty = dirty;
    }
  }
  const activeTabEl = el.tabsList ? el.tabsList.querySelector(`.chrome-tab[data-tab-id="${activeTabId}"]`) : null;
  if (activeTabEl) {
    const titleEl = activeTabEl.querySelector(".chrome-tab-title");
    if (titleEl) titleEl.textContent = fileName || "New Tab";
    activeTabEl.title = fileName;
    let dirtyEl = activeTabEl.querySelector(".chrome-tab-dirty");
    if (dirty && !dirtyEl) {
      dirtyEl = document.createElement("span");
      dirtyEl.className = "chrome-tab-dirty";
      dirtyEl.title = "Unsaved changes";
      const closeBtn = activeTabEl.querySelector(".chrome-tab-close");
      if (closeBtn) activeTabEl.insertBefore(dirtyEl, closeBtn);
      else activeTabEl.appendChild(dirtyEl);
    } else if (!dirty && dirtyEl) {
      dirtyEl.remove();
    }
  }
}

function defaultPdfOptions() {
  return {
    pageSize: "a4",
    fontSize: 11,
    lineSpacing: 1.15,
    margin: 56,
    pageNumbers: true,
    title: "",
    author: "PDFForge",
  };
}

function loadPdfOptions() {
  const options = defaultPdfOptions();
  try {
    const raw = localStorage.getItem(PDF_OPTIONS_KEY);
    if (raw) Object.assign(options, JSON.parse(raw));
  } catch {}
  return options;
}

function persistPdfOptions() {
  const o = state.editor.options;
  try {
    localStorage.setItem(
      PDF_OPTIONS_KEY,
      JSON.stringify({
        pageSize: o.pageSize,
        fontSize: o.fontSize,
        lineSpacing: o.lineSpacing,
        margin: o.margin,
        pageNumbers: o.pageNumbers,
        author: o.author,
      })
    );
  } catch {}
}

function applyEditorSheetLayout() {
  if (!el.wordPageSheet || !state.editor.options) return;
  const o = state.editor.options;
  el.wordPageSheet.style.width = o.pageSize === "letter" ? "816px" : "794px";
  const editable = el.editorContent ? el.editorContent.querySelector(".ql-editor") : null;
  if (editable) {
    const m = o.margin || 56;
    editable.style.padding = `${m}px ${Math.round(m * 1.15)}px 80px`;
  }
}

function syncOptionsToFields() {
  const o = state.editor.options;
  el.optPaperSize.value = o.pageSize === "letter" ? "letter" : "a4";
  el.optFontSize.value = String(o.fontSize);

  // Sync Line Spacing to both Layout Drawer and Ribbon Dropdown
  const spacingVal = Number(o.lineSpacing) || 1.15;
  const spacingStr = String(spacingVal);

  if (el.optLineSpacing) {
    let match = Array.from(el.optLineSpacing.options).find(
      (opt) => opt.value === spacingStr || Math.abs(Number(opt.value) - spacingVal) < 0.01
    );
    if (!match) {
      const newOpt = document.createElement("option");
      newOpt.value = spacingStr;
      newOpt.textContent = `${spacingStr} (Custom)`;
      el.optLineSpacing.appendChild(newOpt);
      match = newOpt;
    }
    el.optLineSpacing.value = match.value;
  }

  if (el.ribbonLineSpacing) {
    let match = Array.from(el.ribbonLineSpacing.options).find(
      (opt) => opt.value === spacingStr || Math.abs(Number(opt.value) - spacingVal) < 0.01
    );
    if (!match) {
      const newOpt = document.createElement("option");
      newOpt.value = spacingStr;
      newOpt.textContent = spacingStr;
      el.ribbonLineSpacing.appendChild(newOpt);
      match = newOpt;
    }
    el.ribbonLineSpacing.value = match.value;
    const picker = el.ribbonLineSpacing.previousElementSibling;
    if (picker && picker.classList.contains("ql-picker")) {
      const label = picker.querySelector(".ql-picker-label");
      if (label) {
        label.setAttribute("data-value", match.value);
        label.setAttribute("data-label", match.textContent || match.value);
      }
      picker.querySelectorAll(".ql-picker-item").forEach((item) => {
        item.classList.toggle("ql-selected", item.getAttribute("data-value") === match.value);
      });
    }
  }

  el.optMargin.value = String(o.margin);
  el.optPageNumbers.checked = !!o.pageNumbers;
  el.optAuthor.value = o.author || "";
  applyEditorFontSize();
  applyEditorLineSpacing();
  applyEditorSheetLayout();
}

function syncOptionsFromFields() {
  const o = state.editor.options;
  o.pageSize = el.optPaperSize.value === "letter" ? "letter" : "a4";
  o.fontSize = Number(el.optFontSize.value) || 11;
  o.lineSpacing = Number(el.optLineSpacing.value) || 1.15;
  if (el.ribbonLineSpacing) {
    el.ribbonLineSpacing.value = String(o.lineSpacing);
  }
  o.margin = Number(el.optMargin.value) || 56;
  o.pageNumbers = el.optPageNumbers.checked;
  o.title = el.optTitle.value.trim();
  o.author = el.optAuthor.value.trim();
  applyEditorLineSpacing();
  applyEditorSheetLayout();
  persistPdfOptions();
}

function toggleEditorOptions() {
  const show = el.editorOptions.hidden;
  el.editorOptions.hidden = !show;
  if (el.btnEditorOptions) el.btnEditorOptions.classList.toggle("active", show);
}

function openTextEditor({ html = "", text = "", fileName = "Document1", source = null, options = null } = {}) {
  state.editor.active = true;
  state.editor.fileName = fileName;
  state.editor.dirty = false;
  state.editor.saving = false;
  state.editor.source = source;
  state.editor.options = options ? { ...options } : loadPdfOptions();
  if (!state.editor.options.title) state.editor.options.title = "";
  hideAllOverlays();
  el.errorState.hidden = true;
  el.emptyState.hidden = true;
  el.editorView.hidden = false;
  if (el.toolbar) el.toolbar.hidden = true;
  editorBusy = true;
  if (html) {
    quill.clipboard.dangerouslyPasteHTML(html);
  } else if (text) {
    quill.setText(text);
  } else {
    quill.setContents([{ insert: "\n" }]);
  }
  editorBusy = false;
  el.optTitle.value = fileName;
  if (el.editorNameInput) el.editorNameInput.value = fileName;
  docZoomScale = 1.0;
  updateDocZoom();
  syncOptionsToFields();
  setEditorStatus("");
  updateEditorChrome();
  const currentTab = tabs.find((t) => t.id === activeTabId);
  if (currentTab) {
    currentTab.type = "editor";
    currentTab.name = fileName;
  }
  renderTabBar();
  quill.focus();
}

function newTextFile() {
  const currentTab = tabs.find((t) => t.id === activeTabId);
  if (currentTab && currentTab.type === "empty") {
    openTextEditor({ text: "", fileName: "Document1" });
    currentTab.type = "editor";
    currentTab.name = "Document1";
    renderTabBar();
  } else {
    createNewTab({ type: "editor", name: "Document1" });
  }
}

function exitEditor() {
  if (!state.editor.active) return true;
  if (tabs.length > 1) {
    closeTab(activeTabId);
    return true;
  }
  if (state.editor.dirty && !window.confirm("Discard changes? You have unsaved changes that will be lost.")) {
    return false;
  }
  state.editor.active = false;
  state.editor.dirty = false;
  state.editor.saving = false;
  state.editor.source = null;
  el.editorView.hidden = true;
  if (el.toolbar) el.toolbar.hidden = false;
  setEditorStatus("");
  const currentTab = tabs.find((t) => t.id === activeTabId);
  if (currentTab) {
    currentTab.type = "empty";
    currentTab.name = "New Tab";
    currentTab.dirty = false;
  }
  showEmpty();
  renderTabBar();
  return true;
}

function leaveEditor() {
  if (!state.editor.active) return true;
  return exitEditor();
}

async function savePdf() {
  if (state.editor.active) {
    if (!editorHasContent()) {
      showToast("Cannot save an empty document. Please enter some text first.", "info");
      return;
    }
    const html = quill.getSemanticHTML();
    syncOptionsFromFields();
    const o = state.editor.options;
    const options = {
      pageSize: o.pageSize,
      fontSize: o.fontSize,
      lineSpacing: o.lineSpacing,
      margin: o.margin,
      pageNumbers: o.pageNumbers,
      title: o.title || state.editor.fileName,
      author: o.author || "PDFForge",
    };
    const prevName = state.editor.fileName;
    state.editor.saving = true;
    setEditorStatus("Creating PDF…");
    updateEditorChrome();
    try {
      const res = await window.pdfViewer.createTextPdf({ text: html, rich: true, suggestedName: state.editor.fileName, options });
      if (res && !res.canceled && res.filePath) {
        const base = String(res.filePath).split(/[\\/]/).pop().replace(/\.pdf$/i, "") || state.editor.fileName;
        state.editor.fileName = base;
        state.editor.dirty = false;
        if (!el.optTitle.value.trim() || el.optTitle.value.trim() === prevName) {
          el.optTitle.value = base;
        }
        setEditorStatus(`Saved ${base}.pdf`);
        showToast(`Saved ${base}.pdf`, "success");
        const currentTab = tabs.find((t) => t.id === activeTabId);
        if (currentTab) {
          currentTab.name = base;
          currentTab.filePath = res.filePath;
          currentTab.dirty = false;
        }
        saveRecentFile(base + ".pdf", res.filePath);
        renderTabBar();
      } else {
        setEditorStatus("Save canceled");
      }
    } catch (err) {
      setEditorStatus(`Save failed — ${err && err.message ? err.message : "unknown error"}`);
      showToast(`Save failed: ${err && err.message ? err.message : "unknown error"}`, "error");
    } finally {
      state.editor.saving = false;
      updateEditorChrome();
    }
    return;
  }

  // Active PDF Viewer mode
  if (state.doc && state.data) {
    try {
      const defaultName = (state.name || "document").replace(/\.pdf$/i, "");
      const res = await window.pdfViewer.savePdf({ data: state.data, defaultName });
      if (res && !res.canceled && res.filePath) {
        state.filePath = res.filePath;
        state.name = res.name || `${defaultName}.pdf`;
        state.pdfModified = false;
        el.docName.textContent = state.name;
        el.docName.title = `${state.name} (${state.filePath})`;
        document.title = `${state.name} — PDFForge Viewer`;
        const currentTab = tabs.find((t) => t.id === activeTabId);
        if (currentTab) {
          currentTab.name = state.name;
          currentTab.filePath = state.filePath;
          currentTab.dirty = false;
        }
        saveRecentFile(state.name, state.filePath);
        renderTabBar();
        showToast(`Saved ${state.name}`, "success");
      }
    } catch (err) {
      showToast(`Save failed: ${err && err.message ? err.message : "unknown error"}`, "error");
    }
  }
}

function getRecentFiles() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentFile(name, filePath) {
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

function clearRecentFiles() {
  localStorage.removeItem(RECENT_KEY);
  renderRecentFiles();
}

function renderRecentFiles() {
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

async function openRecentFile(item) {
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

async function openDocument(data, name, filePath) {
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
    const currentTab = tabs.find((t) => t.id === activeTabId);
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

function showPasswordModal(note) {
  el.passwordNote.textContent = note;
  el.passwordError.hidden = true;
  el.passwordModal.hidden = false;
  el.passwordInput.value = "";
  setTimeout(() => el.passwordInput.focus(), 0);
}

function hidePasswordModal() {
  el.passwordModal.hidden = true;
}

function submitPassword() {
  const value = el.passwordInput.value;
  if (!value) return;
  const update = state.passwordCallback;
  hidePasswordModal();
  if (update) {
    state.passwordValue = value;
    update(value);
  }
}

function showShortcutsModal() {
  hideAllOverlays();
  el.shortcutsModal.hidden = false;
}

let cachedAppInfo = null;
let currentPropertiesRows = [];

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB (${bytes.toLocaleString()} bytes)`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB (${bytes.toLocaleString()} bytes)`;
}

function formatPdfDate(raw) {
  if (!raw) return "—";
  const s = String(raw).trim();
  const m = s.match(/^D:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (m) {
    const year = m[1];
    const month = m[2] || "01";
    const day = m[3] || "01";
    const hour = m[4] || "00";
    const min = m[5] || "00";
    const sec = m[6] || "00";
    const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString();
    }
  }
  const d2 = new Date(s);
  if (!isNaN(d2.getTime())) {
    return d2.toLocaleString();
  }
  return s.replace(/^D:/, "");
}

function detectPaperFormat(w, h) {
  const isLandscape = w > h;
  const pw = isLandscape ? h : w;
  const ph = isLandscape ? w : h;
  const orient = isLandscape ? "Landscape" : "Portrait";
  
  if (Math.abs(pw - 595.28) < 8 && Math.abs(ph - 841.89) < 8) return `A4 (${orient})`;
  if (Math.abs(pw - 612) < 8 && Math.abs(ph - 792) < 8) return `US Letter (${orient})`;
  if (Math.abs(pw - 612) < 8 && Math.abs(ph - 1008) < 8) return `US Legal (${orient})`;
  if (Math.abs(pw - 841.89) < 8 && Math.abs(ph - 1190.55) < 8) return `A3 (${orient})`;
  if (Math.abs(pw - 419.53) < 8 && Math.abs(ph - 595.28) < 8) return `A5 (${orient})`;
  if (Math.abs(pw - 792) < 8 && Math.abs(ph - 1224) < 8) return `US Tabloid (${orient})`;
  if (Math.abs(pw - 504) < 8 && Math.abs(ph - 720) < 8) return `B5 (${orient})`;
  return `Custom (${orient})`;
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function getOrFetchAppInfo() {
  if (cachedAppInfo) return cachedAppInfo;
  try {
    if (window.pdfViewer && window.pdfViewer.getAppInfo) {
      cachedAppInfo = await window.pdfViewer.getAppInfo();
    }
  } catch (err) {
    console.warn("Could not get app info:", err);
  }
  if (!cachedAppInfo) {
    cachedAppInfo = {
      name: "PDFForge Viewer",
      version: "1.1.0",
      electron: "Desktop",
      chrome: "Chromium",
      node: "Node.js",
      v8: "V8",
      platform: "win32",
      arch: "x64",
      osVersion: "",
    };
  }
  return cachedAppInfo;
}

async function showAboutModal() {
  hideAllOverlays();
  if (el.aboutModal) el.aboutModal.hidden = false;
  const info = await getOrFetchAppInfo();
  if (el.aboutVersionBadge) el.aboutVersionBadge.textContent = `v${info.version || "1.1.0"}`;
  if (el.emptyVersionLabel) el.emptyVersionLabel.textContent = `v${info.version || "1.1.0"}`;

  const platformName = info.platform === "win32" ? "Windows" : info.platform === "darwin" ? "macOS" : info.platform === "linux" ? "Linux" : info.platform;
  const osString = `${platformName} ${info.arch ? `(${info.arch})` : ""} ${info.osVersion || ""}`.trim();

  const rows = [
    ["App Version", `${info.version || "1.1.0"} <span class="about-pill">Stable</span>`],
    ["Electron Runtime", `v${info.electron || "—"}`],
    ["Chromium Engine", `v${info.chrome || "—"}`],
    ["Node.js Engine", `v${info.node || "—"}`],
    ["V8 JavaScript", `v${info.v8 || "—"}`],
    ["Operating System", osString],
    ["PDF Reader Engine", `Mozilla PDF.js v6.3.289`],
    ["PDF Document Engine", `PDF-Lib v1.17.1`],
    ["Rich Editor Engine", `Quill v2.0.3`],
    ["Security Architecture", `<span class="about-pill green">Sandbox Enabled · Context Isolated</span>`],
    ["License", "MIT Open Source License"],
  ];

  if (el.aboutInfoGrid) {
    el.aboutInfoGrid.innerHTML = rows
      .map(([label, val]) => `<span class="about-prop-label">${escapeHtml(label)}</span><span class="about-prop-val">${val}</span>`)
      .join("");
  }
}

async function copyAboutInfo() {
  const info = await getOrFetchAppInfo();
  const platformName = info.platform === "win32" ? "Windows" : info.platform === "darwin" ? "macOS" : info.platform === "linux" ? "Linux" : info.platform;
  const osString = `${platformName} ${info.arch ? `(${info.arch})` : ""} ${info.osVersion || ""}`.trim();

  const text = [
    `# PDFForge Viewer Diagnostic & Version Info`,
    `- **Application**: PDFForge Viewer`,
    `- **App Version**: ${info.version || "1.1.0"}`,
    `- **Electron**: ${info.electron || "—"}`,
    `- **Chromium**: ${info.chrome || "—"}`,
    `- **Node.js**: ${info.node || "—"}`,
    `- **V8**: ${info.v8 || "—"}`,
    `- **OS / Platform**: ${osString}`,
    `- **PDF.js Engine**: 6.3.289`,
    `- **PDF-Lib**: 1.17.1`,
    `- **Quill Engine**: 2.0.3`,
    `- **Sandbox Isolation**: Active`,
    `- **Privacy / Mode**: 100% Offline (Zero Telemetry)`,
    `- **License**: MIT`,
  ].join("\n");

  const copied = await copyToClipboard(text);
  if (copied) {
    showToast("System & version info copied to clipboard", "success");
  } else {
    showToast("Could not copy info to clipboard", "error");
  }
}

async function showPropertiesModal() {
  if (!state.doc && !state.editor.active) return;
  hideAllOverlays();
  el.propertiesContent.innerHTML = "<span class='prop-label'>Loading…</span><span class='prop-val'>Reading document metadata…</span>";
  el.propertiesModal.hidden = false;

  try {
    if (state.editor.active) {
      const chars = editorCharCount();
      const words = editorWordCount();
      const rawHtml = quill && quill.root ? quill.root.innerHTML : "";
      const pageBreaks = (rawHtml.match(/word-page-break|\f/g) || []).length;
      const totalPages = pageBreaks + 1;
      const paragraphs = quill && quill.root ? quill.root.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li").length : 1;
      const opt = state.editor.options || {};
      const targetSize = (opt.pageSize || "a4").toUpperCase();
      const marginMm = Math.round((opt.margin || 56) * 25.4 / 72);

      currentPropertiesRows = [
        ["Document Title", state.editor.fileName || "Untitled Document"],
        ["Document Type", "Rich Text Document (PDF-Ready Word Desk)"],
        ["Save Status", state.editor.dirty ? "Unsaved changes" : "Saved"],
        ["Word Count", `${words.toLocaleString()} words`],
        ["Character Count", `${chars.toLocaleString()} characters`],
        ["Paragraphs", `${paragraphs} paragraphs`],
        ["Estimated PDF Pages", `${totalPages} page${totalPages === 1 ? "" : "s"}`],
        ["Target Page Size", `${targetSize} Portrait (${targetSize === "LETTER" ? "612 × 792 pt" : "595 × 842 pt"})`],
        ["Target Margins", `${opt.margin || 56} pt (~${marginMm} mm)`],
        ["Typography", `${opt.fontSize || 11} pt font · ${opt.lineSpacing || 1.45}× line spacing`],
        ["Page Numbering", opt.pageNumbers !== false ? "Enabled" : "Disabled"],
        ["Export Format", "Adobe PDF (.pdf) via Built-in Rich Engine"],
      ];
    } else {
      const meta = await state.doc.getMetadata();
      const info = (meta && meta.info) || {};
      const first = state.pages[0];
      let dims = "—";
      if (first) {
        const ptW = Math.round(first.page.view ? Math.abs(first.page.view[2] - first.page.view[0]) : (first.vp1.width * 72) / 96);
        const ptH = Math.round(first.page.view ? Math.abs(first.page.view[3] - first.page.view[1]) : (first.vp1.height * 72) / 96);
        const mmW = (ptW * 25.4 / 72).toFixed(1);
        const mmH = (ptH * 25.4 / 72).toFixed(1);
        const inW = (ptW / 72).toFixed(2);
        const inH = (ptH / 72).toFixed(2);
        const formatName = detectPaperFormat(ptW, ptH);
        dims = `${ptW} × ${ptH} pt (${mmW} × ${mmH} mm / ${inW} × ${inH} in) — ${formatName}`;
      }

      currentPropertiesRows = [
        ["File Name", state.name || "Untitled.pdf"],
        ["File Location", state.filePath || "Local Session (Memory)"],
        ["File Size", state.data ? formatFileSize(state.data.byteLength) : "—"],
        ["Page Count", `${state.pages.length} page${state.pages.length === 1 ? "" : "s"}`],
        ["Page Dimensions", dims],
        ["Title", info.Title || "—"],
        ["Author", info.Author || "—"],
        ["Subject", info.Subject || "—"],
        ["Keywords", info.Keywords || "—"],
        ["Creator Tool", info.Creator || "—"],
        ["PDF Producer", info.Producer || "—"],
        ["Creation Date", formatPdfDate(info.CreationDate)],
        ["Modification Date", formatPdfDate(info.ModDate)],
        ["PDF Version", info.PDFFormatVersion || (state.doc.pdfFormatVersion ? `PDF ${state.doc.pdfFormatVersion}` : "1.4+")],
        ["Fast Web View", info.IsLinearized ? "Yes (Linearized / Optimized)" : "No (Standard)"],
        ["Security / Encryption", state.passwordValue ? "Encrypted (Password Protected)" : "Standard (Unencrypted)"],
      ];
    }

    el.propertiesContent.innerHTML = currentPropertiesRows
      .map(([label, val]) => `<span class="prop-label">${escapeHtml(label)}</span><span class="prop-val">${escapeHtml(val)}</span>`)
      .join("");
  } catch {
    el.propertiesContent.innerHTML = "<span class='prop-label'>Error</span><span class='prop-val'>Could not read document properties</span>";
  }
}

async function copyPropertiesInfo() {
  if (!currentPropertiesRows || !currentPropertiesRows.length) {
    showToast("No document properties to copy", "info");
    return;
  }
  const title = state.editor.active ? `Document Properties: ${state.editor.fileName}` : `PDF Properties: ${state.name || "Document"}`;
  const lines = [`# ${title}`, ""];
  for (const [k, v] of currentPropertiesRows) {
    lines.push(`- **${k}**: ${v}`);
  }
  const text = lines.join("\n");
  const copied = await copyToClipboard(text);
  if (copied) {
    showToast("Document properties copied to clipboard", "success");
  } else {
    showToast("Could not copy properties to clipboard", "error");
  }
}

async function openFromDialog() {
  const res = await window.pdfViewer.openDialog();
  if (!res || res.canceled) return;
  const files = res.files && res.files.length ? res.files : [{ name: res.name, path: res.path, data: res.data }];
  openMultipleFiles(files);
}

async function printDocument() {
  if (state.editor.active && quill) {
    el.printHost.textContent = "";
    const sheet = document.createElement("section");
    sheet.className = "print-sheet print-editor-sheet";
    sheet.innerHTML = quill.root ? quill.root.innerHTML : "";
    el.printHost.appendChild(sheet);
    const cleanup = () => {
      el.printHost.textContent = "";
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 1500);
    return;
  }
  if (!state.doc) return;
  el.printHost.textContent = "";
  const maxW = 2000;
  for (const p of state.pages) {
    const rot = (p.page.rotate + state.rotation) % 360;
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
    sheet.appendChild(canvas);
    el.printHost.appendChild(sheet);
    try {
      await p.page.render({ canvasContext: ctx, viewport }).promise;
    } catch {
      // ignore one page
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  const cleanup = () => {
    el.printHost.textContent = "";
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  setTimeout(cleanup, 1500);
}

function applyTheme(theme, persist) {
  if (theme === state.currentTheme) return;
  state.currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  window.pdfViewer.setTheme(theme);
  if (persist) localStorage.setItem("viewer-theme", theme);
}

function toggleTheme() {
  applyTheme(state.currentTheme === "dark" ? "light" : "dark", true);
}

let searchDebounceTimer = null;
function debounceSearch(query) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    executeSearch(query);
  }, 150);
}

function toggleFindBar(force) {
  if (!state.doc && !state.editor.active && force) return;
  const show = typeof force === "boolean" ? force : el.findBar.hidden;
  state.search.isOpen = show;
  el.findBar.hidden = !show;
  if (el.btnFind) el.btnFind.classList.toggle("active", show);
  if (show) {
    el.findInput.focus();
    el.findInput.select();
    if (el.findInput.value) {
      executeSearch(el.findInput.value);
    }
  } else {
    clearAllHighlights();
    state.search.query = "";
    state.search.matches = [];
    state.search.currentMatchIndex = -1;
    el.findResults.textContent = "";
    if (state.editor.active && quill) {
      quill.focus();
    } else if (el.pageHost) {
      el.pageHost.focus();
    }
  }
}

async function executeSearch(query) {
  query = (query || "").trim();
  state.search.query = query;
  state.search.matches = [];
  state.search.currentMatchIndex = -1;

  if (state.editor.active) {
    executeEditorSearch(query);
    return;
  }

  if (!query || !state.doc) {
    el.findResults.textContent = "";
    clearAllHighlights();
    return;
  }

  el.findResults.textContent = "…";

  const lowerQuery = query.toLowerCase();
  const allMatches = [];

  for (let i = 0; i < state.pages.length; i++) {
    const p = state.pages[i];
    if (!p.textContent) {
      try {
        p.textContent = await p.page.getTextContent();
      } catch {
        continue;
      }
    }
    for (const item of p.textContent.items) {
      if (!item.str) continue;
      const strLower = item.str.toLowerCase();
      let pos = 0;
      while ((pos = strLower.indexOf(lowerQuery, pos)) !== -1) {
        allMatches.push({
          pageIndex: i,
        });
        pos += lowerQuery.length;
      }
    }
  }

  state.search.matches = allMatches;

  if (allMatches.length === 0) {
    el.findResults.textContent = "0 of 0";
    clearAllHighlights();
    return;
  }

  let targetIndex = allMatches.findIndex((m) => m.pageIndex >= state.currentPage - 1);
  if (targetIndex < 0) targetIndex = 0;

  goToMatch(targetIndex);
}

function executeEditorSearch(query) {
  if (!query || !quill) {
    el.findResults.textContent = "";
    return;
  }
  const text = quill.getText();
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const allMatches = [];
  let pos = 0;
  while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
    allMatches.push({ index: pos, length: query.length });
    pos += lowerQuery.length;
  }
  state.search.matches = allMatches;
  if (allMatches.length === 0) {
    el.findResults.textContent = "0 of 0";
    return;
  }
  const sel = quill.getSelection() || { index: 0 };
  let targetIndex = allMatches.findIndex((m) => m.index >= sel.index);
  if (targetIndex < 0) targetIndex = 0;
  goToEditorMatch(targetIndex);
}

function goToEditorMatch(index) {
  if (!state.search.matches.length || !quill) return;
  state.search.currentMatchIndex = (index + state.search.matches.length) % state.search.matches.length;
  const current = state.search.matches[state.search.currentMatchIndex];
  el.findResults.textContent = `${state.search.currentMatchIndex + 1} of ${state.search.matches.length}`;
  quill.setSelection(current.index, current.length, "user");
  quill.scrollIntoView();
}

function goToMatch(index) {
  if (!state.search.matches.length) return;
  state.search.currentMatchIndex = (index + state.search.matches.length) % state.search.matches.length;
  const current = state.search.matches[state.search.currentMatchIndex];

  el.findResults.textContent = `${state.search.currentMatchIndex + 1} of ${state.search.matches.length}`;

  for (const p of state.pages) {
    if (p.rendered) {
      highlightPage(p);
    }
  }

  scrollToPage(current.pageIndex);

  setTimeout(() => {
    const active = el.pageHost.querySelector(".textLayer .highlight.selected");
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, 100);
}

function findNext() {
  if (!state.search.matches.length) {
    if (el.findInput.value) executeSearch(el.findInput.value);
    return;
  }
  if (state.editor.active) {
    goToEditorMatch(state.search.currentMatchIndex + 1);
  } else {
    goToMatch(state.search.currentMatchIndex + 1);
  }
}

function findPrev() {
  if (!state.search.matches.length) {
    if (el.findInput.value) executeSearch(el.findInput.value);
    return;
  }
  if (state.editor.active) {
    goToEditorMatch(state.search.currentMatchIndex - 1);
  } else {
    goToMatch(state.search.currentMatchIndex - 1);
  }
}

function highlightPage(p) {
  const query = state.search.query;
  if (!query || !p.textDiv) return;
  clearHighlightsOnPage(p);

  const lowerQuery = query.toLowerCase();
  const pageMatches = state.search.matches.filter((m) => m.pageIndex === p.n - 1);
  if (!pageMatches.length) return;

  const spans = Array.from(p.textDiv.querySelectorAll("span"));
  if (!spans.length) return;

  const firstGlobalMatchIdx = state.search.matches.findIndex((m) => m.pageIndex === p.n - 1);
  let matchCounter = 0;

  for (const span of spans) {
    if (span.classList.contains("highlight")) continue;
    const rawText = span.textContent;
    const lower = rawText.toLowerCase();
    if (!lower.includes(lowerQuery)) continue;

    const fragment = document.createDocumentFragment();
    let lastIdx = 0;
    let idx = 0;
    while ((idx = lower.indexOf(lowerQuery, lastIdx)) !== -1) {
      if (idx > lastIdx) {
        fragment.appendChild(document.createTextNode(rawText.slice(lastIdx, idx)));
      }
      const matchSpan = document.createElement("span");
      matchSpan.className = "highlight";
      const globalIdx = firstGlobalMatchIdx + matchCounter;
      if (globalIdx === state.search.currentMatchIndex) {
        matchSpan.classList.add("selected");
      }
      matchSpan.textContent = rawText.slice(idx, idx + query.length);
      fragment.appendChild(matchSpan);
      matchCounter++;
      lastIdx = idx + query.length;
    }
    if (lastIdx < rawText.length) {
      fragment.appendChild(document.createTextNode(rawText.slice(lastIdx)));
    }
    span.textContent = "";
    span.appendChild(fragment);
  }
}

function clearHighlightsOnPage(p) {
  if (!p.textDiv) return;
  const highlights = p.textDiv.querySelectorAll(".highlight");
  for (const h of highlights) {
    const parent = h.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(h.textContent), h);
      parent.normalize();
    }
  }
}

function clearAllHighlights() {
  for (const p of state.pages) {
    clearHighlightsOnPage(p);
  }
}

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

  [el.propertiesModal, el.shortcutsModal, el.passwordModal, el.aboutModal].forEach((overlay) => {
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
          docZoomScale = 1.0;
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
      if (!el.propertiesModal.hidden || !el.shortcutsModal.hidden || !el.passwordModal.hidden || (el.aboutModal && !el.aboutModal.hidden)) {
        e.preventDefault();
        hideAllOverlays();
        return;
      }
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
  bindEvents();
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