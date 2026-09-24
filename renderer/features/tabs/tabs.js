import {
  state,
  tabs,
  activeTabId,
  splitTabId,
  isSplitActive,
  tabCounter,
  splitDoc,
  splitPages,
  tabDragSourceId,
  contextMenuTargetTabId,
  quill,
  setActiveTabId,
  setSplitTabId,
  setIsSplitActive,
  setTabCounter,
  setSplitDoc,
  setSplitPages,
  setTabDragSourceId,
  setContextMenuTargetTabId,
} from '../../core/state.js';
import { el } from '../../core/elements.js';
import { layoutPages, updateControls, syncFitButtons, updateZoomSelect, queueVisibleRender } from '../viewer/viewer.js';
import { openDocument, hideAllOverlays } from '../../services/document-service.js';
import { updateEditorChrome, openTextEditor } from '../editor/editor.js';
import { confirmUnsavedWork } from '../../components/unsaved-warning.js';
import { savePdf } from '../editor/editor.js';
import { escapeHtml, clamp } from '../../utils/helpers.js';
import { getDocument } from '../../pdfjs/pdf.mjs';
import {
  buildThumbnails,
  applyThumbnails,
  queueThumbRenders,
  updateActiveThumb,
  thumbsVisible,
  setThumbsVisible,
  renderOutlineItems,
} from '../thumbnails/thumbnails.js';

export function showTabContextMenu(x, y, tabId) {
  if (!el.tabContextMenu) return;
  setContextMenuTargetTabId(tabId);
  const menuW = 190;
  const menuH = 220;
  const posX = Math.min(x, Math.max(10, window.innerWidth - menuW - 10));
  const posY = Math.min(y, Math.max(10, window.innerHeight - menuH - 10));
  el.tabContextMenu.style.left = `${posX}px`;
  el.tabContextMenu.style.top = `${posY}px`;
  el.tabContextMenu.hidden = false;
}

export function hideTabContextMenu() {
  if (el.tabContextMenu) {
    el.tabContextMenu.hidden = true;
    setContextMenuTargetTabId(null);
  }
}

export async function closeOtherTabs(targetId) {
  hideTabContextMenu();
  const others = tabs.filter((t) => t.id !== targetId);
  for (const t of others) {
    await closeTab(t.id);
  }
}

export async function closeTabsToRight(targetId) {
  hideTabContextMenu();
  const idx = tabs.findIndex((t) => t.id === targetId);
  if (idx === -1) return;
  const toRight = tabs.slice(idx + 1);
  for (const t of toRight) {
    await closeTab(t.id);
  }
}

export function duplicateTab(targetId) {
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

export function openTabInSplit(targetId) {
  hideTabContextMenu();
  const tab = tabs.find((t) => t.id === targetId);
  if (tab && (tab.data || tab.doc)) {
    void openSplitView(tab);
  }
}

export function renderTabBar() {
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

    const isDirty =
      (tab.type === "editor" && (tab.editor?.dirty || (tab.id === activeTabId && state.editor.dirty))) ||
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
      setTabDragSourceId(tab.id);
      tabEl.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tab.id);
    });

    tabEl.addEventListener("dragend", () => {
      setTabDragSourceId(null);
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

export function snapshotCurrentTab() {
  const currentTab = tabs.find((t) => t.id === activeTabId);
  if (!currentTab) return;

  if (state.editor.active && currentTab.type === "editor") {
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
  } else if (state.doc || currentTab.type === "pdf") {
    currentTab.type = "pdf";
    currentTab.name = state.name || currentTab.name;
    currentTab.filePath = state.filePath || currentTab.filePath;
    if (state.data) {
      currentTab.data = state.data instanceof Uint8Array ? state.data : new Uint8Array(state.data);
    }
    currentTab.doc = state.doc || currentTab.doc;
    currentTab.loadingTask = state.loadingTask || currentTab.loadingTask;
    currentTab.pages = state.pages || currentTab.pages;
    currentTab.outline = state.outline || currentTab.outline;
    currentTab.currentPage = state.currentPage || 1;
    currentTab.zoom = state.zoom || 1;
    currentTab.layoutMode = state.layoutMode || "fit-width";
    currentTab.twoPageMode = Boolean(state.twoPageMode);
    currentTab.rotation = state.rotation || 0;
    currentTab.sidebarVisible = Boolean(thumbsVisible);
    currentTab.activeSidebarTab = state.activeSidebarTab || "thumbs";
    currentTab.scrollTop = el.pageHost ? el.pageHost.scrollTop : 0;
    currentTab.scrollLeft = el.pageHost ? el.pageHost.scrollLeft : 0;
  } else {
    currentTab.type = "empty";
    currentTab.name = "New Tab";
  }
}

export function restoreTab(tab) {
  setActiveTabId(tab.id);
  hideAllOverlays();

  if (tab.type === "editor") {
    state.editor.active = true;
    state.doc = null;
    state.pages = [];
    if (el.pageHost) el.pageHost.textContent = "";
    if (el.thumbList) el.thumbList.textContent = "";
    if (el.thumbnails) el.thumbnails.hidden = true;
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
    state.editor.active = false;
    state.editor.dirty = false;
    state.editor.saving = false;
    el.editorView.hidden = true;
    if (el.toolbar) el.toolbar.hidden = false;
    el.emptyState.hidden = true;
    el.errorState.hidden = true;

    // Self-healing fallback: if doc was somehow destroyed or lost, reload cleanly from data
    if ((!tab.doc || tab.doc.destroyed) && tab.data) {
      void openDocument(tab.data, tab.name, tab.filePath);
      return;
    }

    state.doc = tab.doc;
    state.loadingTask = tab.loadingTask || null;
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

    // Restore sidebar visibility for this tab
    if (typeof tab.sidebarVisible === "boolean") {
      setThumbsVisible(tab.sidebarVisible);
    }
    applyThumbnails();

    // Reset rendering flags on page objects so they render freshly
    for (const p of state.pages) {
      p.pageRendering = false;
      p.rendered = false;
      p.renderKey = 0;
      if (p.prevTask) {
        try { p.prevTask.cancel(); } catch {}
        p.prevTask = null;
      }
    }

    // Restore pages into pageHost
    if (el.pageHost) {
      el.pageHost.textContent = "";
      if (state.pages && state.pages.length) {
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

    // Restore thumbnails into thumbList
    if (el.thumbList) {
      el.thumbList.textContent = "";
      if (state.pages && state.pages.length && state.pages.some((p) => p.thumbDiv)) {
        for (const p of state.pages) {
          if (p.thumbDiv) el.thumbList.appendChild(p.thumbDiv);
        }
        queueThumbRenders();
      } else if (state.doc) {
        buildThumbnails();
      }
    }

    // Restore outline if present
    if (el.outlineList) {
      if (state.outline && state.outline.length) {
        el.outlineList.textContent = "";
        const container = document.createElement("div");
        container.className = "outline-tree";
        renderOutlineItems(state.outline, container, 0);
        el.outlineList.appendChild(container);
      } else {
        el.outlineList.innerHTML = '<div class="empty-outline">No outline in this document</div>';
      }
    }

    // Recalculate layout and trigger rendering for visible pages
    layoutPages();
    updateZoomSelect();
    syncFitButtons();
    updateControls();
    updateActiveThumb();

    if (tab.scrollTop && el.pageHost) {
      el.pageHost.scrollTo({ top: tab.scrollTop, left: tab.scrollLeft || 0 });
    }
  } else {
    state.editor.active = false;
    state.editor.dirty = false;
    state.editor.saving = false;
    el.editorView.hidden = true;
    if (el.toolbar) el.toolbar.hidden = false;
    el.errorState.hidden = true;
    if (el.pageHost) el.pageHost.textContent = "";
    if (el.thumbList) el.thumbList.textContent = "";
    if (el.thumbnails) el.thumbnails.hidden = true;
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
  if (isSplitActive) {
    updateSplitDocSelect();
  }
}

export function createNewTab(opts = {}) {
  snapshotCurrentTab();
  setTabCounter(tabCounter + 1);
  const id = 'tab-' + tabCounter;
  const rawBytes = opts.data ? (opts.data instanceof Uint8Array ? opts.data : new Uint8Array(opts.data)) : null;
  const newTab = {
    id,
    type: opts.type || 'empty',
    name: opts.name || (opts.type === 'editor' ? 'Document1' : 'New Tab'),
    filePath: opts.filePath || null,
    data: rawBytes,
    doc: null,
    pages: [],
    outline: [],
    currentPage: 1,
    zoom: 1,
    layoutMode: 'fit-width',
    twoPageMode: false,
    rotation: 0,
    sidebarVisible: Boolean(thumbsVisible),
    activeSidebarTab: 'thumbs',
    editor: opts.editor || null,
  };
  tabs.push(newTab);
  restoreTab(newTab);
  return newTab;
}

export async function closeTab(tabId, { force = false } = {}) {
  const index = tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return false;
  const tab = tabs[index];
  const isActive = tabId === activeTabId;

  const tabDirty =
    (tab.type === "editor" && (tab.editor?.dirty || (isActive && state.editor.dirty))) ||
    Boolean(tab.dirty || (isActive && state.pdfModified));

  if (!force && tabDirty) {
    const allowSave = isActive;
    const action = await confirmUnsavedWork({ allowSave, fileName: tab.name });
    if (action === "cancel") return false;
    if (action === "save") {
      try {
        await savePdf();
      } catch {
        return false;
      }
      if (tab.type === "editor" ? state.editor.dirty : state.pdfModified) return false;
    }
    tab.dirty = false;
    if (tab.editor) tab.editor.dirty = false;
  }

  if (tab.doc) {
    try {
      await tab.doc.destroy();
    } catch {}
    tab.doc = null;
    tab.pages = [];
  }
  if (tab.loadingTask) {
    try {
      await tab.loadingTask.destroy();
    } catch {}
    tab.loadingTask = null;
  }

  if (splitTabId === tabId) {
    const nextSplitTab = tabs.find((t) => t.id !== tabId && (t.data || t.doc));
    if (nextSplitTab) {
      void openSplitView(nextSplitTab);
    } else {
      closeSplitView();
    }
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
    return true;
  }

  if (activeTabId === tabId) {
    const nextIndex = Math.min(index, tabs.length - 1);
    restoreTab(tabs[nextIndex]);
  } else {
    renderTabBar();
    if (isSplitActive) {
      updateSplitDocSelect();
    }
  }

  return true;
}

export function cycleTabs(offset) {
  if (tabs.length <= 1) return;
  snapshotCurrentTab();
  const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
  let nextIndex = (currentIndex + offset) % tabs.length;
  if (nextIndex < 0) nextIndex += tabs.length;
  restoreTab(tabs[nextIndex]);
}

export async function openMultipleFiles(files) {
  if (!files || !files.length) return;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const currentTab = tabs.find((t) => t.id === activeTabId);
    if (i === 0 && currentTab && currentTab.type === "empty") {
      await openDocument(f.data, f.name, f.path);
    } else {
      createNewTab({ type: "pdf", name: f.name, filePath: f.path });
      await openDocument(f.data, f.name, f.path);
    }
  }
}

export function toggleTwoPage() {
  if (!state.doc) return;
  state.twoPageMode = !state.twoPageMode;
  const currentTab = tabs.find((t) => t.id === activeTabId);
  if (currentTab) currentTab.twoPageMode = state.twoPageMode;
  layoutPages();
  updateControls();
}

export function updateSplitDocSelect() {
  if (!el.splitDocSelect) return;
  el.splitDocSelect.innerHTML = "";

  const pdfTabs = tabs.filter((t) => t.data || t.doc || t.type === "pdf");

  if (!pdfTabs.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No documents open";
    el.splitDocSelect.appendChild(opt);
  } else {
    for (const t of pdfTabs) {
      const opt = document.createElement("option");
      opt.value = t.id;
      const isCurrent = t.id === activeTabId;
      opt.textContent = isCurrent ? `${t.name} (Active Tab)` : t.name;
      el.splitDocSelect.appendChild(opt);
    }
  }

  const openOpt = document.createElement("option");
  openOpt.value = "__open_new__";
  openOpt.textContent = "+ Open another PDF…";
  el.splitDocSelect.appendChild(openOpt);

  if (splitTabId && pdfTabs.some((t) => t.id === splitTabId)) {
    el.splitDocSelect.value = splitTabId;
  } else if (pdfTabs.length > 0) {
    const other = pdfTabs.find((t) => t.id !== activeTabId);
    el.splitDocSelect.value = other ? other.id : pdfTabs[0].id;
  }
}

export async function onSplitDocSelectChange() {
  if (!el.splitDocSelect) return;
  const val = el.splitDocSelect.value;
  if (val === "__open_new__") {
    await openSplitFile();
    return;
  }
  const targetTab = tabs.find((t) => t.id === val);
  if (targetTab) {
    await openSplitView(targetTab);
  }
}

export async function openSplitFile() {
  const res = await window.pdfViewer.openDialog();
  if (!res || res.canceled || !res.data) {
    updateSplitDocSelect();
    return;
  }
  setTabCounter(tabCounter + 1);
  const rawBytes = res.data ? (res.data instanceof Uint8Array ? res.data : new Uint8Array(res.data)) : null;
  const newTab = {
    id: "tab-" + tabCounter,
    type: "pdf",
    name: res.name,
    filePath: res.path,
    data: rawBytes,
    doc: null,
    pages: [],
    outline: [],
    currentPage: 1,
    zoom: 1,
    layoutMode: "fit-width",
    twoPageMode: false,
    rotation: 0,
    sidebarVisible: Boolean(thumbsVisible),
    activeSidebarTab: "thumbs",
  };
  tabs.push(newTab);
  renderTabBar();
  await openSplitView(newTab);
}

export async function toggleSplitView() {
  if (isSplitActive) {
    closeSplitView();
    return;
  }
  const otherTab = tabs.find((t) => t.id !== activeTabId && (t.data || t.doc));
  if (otherTab && otherTab.data) {
    await openSplitView(otherTab);
  } else {
    const currentTab = tabs.find((t) => t.id === activeTabId && (t.data || t.doc));
    if (currentTab && currentTab.data) {
      await openSplitView(currentTab);
    } else {
      await openSplitFile();
    }
  }
}

export async function openSplitView(tab) {
  if (!tab) return;
  setIsSplitActive(true);
  setSplitTabId(tab.id);
  if (el.splitDivider) el.splitDivider.hidden = false;
  if (el.secondaryPane) el.secondaryPane.hidden = false;
  if (el.btnSplitView) el.btnSplitView.classList.add("active");
  if (el.secondaryPaneTitle) el.secondaryPaneTitle.textContent = tab.name || "Second Document";
  updateSplitDocSelect();
  await renderSplitDoc(tab);
}

export function closeSplitView() {
  setIsSplitActive(false);
  setSplitTabId(null);
  disconnectSplitObserver();
  splitRenderSeq++;
  if (el.splitDivider) el.splitDivider.hidden = true;
  if (el.secondaryPane) el.secondaryPane.hidden = true;
  if (el.btnSplitView) el.btnSplitView.classList.remove("active");
  if (el.secondaryPageHost) el.secondaryPageHost.textContent = "";
  if (el.splitPageIndicator) el.splitPageIndicator.textContent = "";
  if (splitDoc) {
    try {
      splitDoc.destroy();
    } catch {}
    setSplitDoc(null);
    setSplitPages([]);
  }
  if (el.primaryPane) el.primaryPane.style.flex = "1";
  if (el.secondaryPane) el.secondaryPane.style.flex = "1";
  layoutPages();
}

let splitRenderSeq = 0;
let splitObserver = null;
const splitCanvasTasks = new WeakMap();

function disconnectSplitObserver() {
  if (splitObserver) {
    splitObserver.disconnect();
    splitObserver = null;
  }
}

async function renderSplitPage(page, vp, canvas, seq) {
  if (seq !== splitRenderSeq) return;
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);
  let task;
  try {
    task = page.render({ canvasContext: ctx, viewport: vp });
    splitCanvasTasks.set(canvas, task);
    await task.promise;
  } catch (err) {
    if (!err || err.name !== "RenderingCancelledException") throw err;
  } finally {
    if (splitCanvasTasks.get(canvas) === task) splitCanvasTasks.delete(canvas);
  }
}

export async function renderSplitDoc(tab) {
  if (!el.secondaryPageHost) return;
  disconnectSplitObserver();
  const seq = ++splitRenderSeq;
  el.secondaryPageHost.textContent = "";
  if (!tab || (!tab.data && !tab.doc)) {
    if (el.splitPageIndicator) el.splitPageIndicator.textContent = "";
    return;
  }
  if (splitDoc) {
    try {
      await splitDoc.destroy();
    } catch {}
    setSplitDoc(null);
    setSplitPages([]);
  }
  try {
    let rawBytes = tab.data;
    if (!rawBytes && tab.doc && typeof tab.doc.getData === "function") {
      try {
        rawBytes = await tab.doc.getData();
        tab.data = rawBytes;
      } catch {}
    }
    if (!rawBytes) {
      if (el.splitPageIndicator) el.splitPageIndicator.textContent = "";
      return;
    }
    const bytesToPass = (rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes)).slice();
    const task = getDocument({ data: bytesToPass });
    const doc = await task.promise;
    if (seq !== splitRenderSeq) {
      try {
        await doc.destroy();
      } catch {}
      return;
    }
    setSplitDoc(doc);
    setSplitPages([]);
    if (el.splitPageIndicator) {
      el.splitPageIndicator.textContent = `${doc.numPages} ${doc.numPages === 1 ? "page" : "pages"}`;
    }
    const dpr = window.devicePixelRatio || 1;
    const availW = Math.max(260, (el.secondaryPageHost.clientWidth || 400) - 48);
    const pageData = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      if (seq !== splitRenderSeq) {
        try {
          await doc.destroy();
        } catch {}
        return;
      }
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
      canvas.width = Math.ceil(vp.width * dpr);
      canvas.height = Math.ceil(vp.height * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      pageDiv.appendChild(canvas);
      el.secondaryPageHost.appendChild(pageDiv);
      pageData.push({ page, vp, canvas });
    }
    splitObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const data = pageData[Number(entry.target.dataset.splitIndex)];
          if (data && !data.rendered) {
            data.rendered = true;
            void renderSplitPage(data.page, data.vp, data.canvas, seq);
          }
        }
      },
      { root: el.secondaryPageHost, rootMargin: "200px 0px", threshold: 0 }
    );
    pageData.forEach((d, i) => {
      d.canvas.dataset.splitIndex = String(i);
      splitObserver.observe(d.canvas.parentElement);
    });
  } catch (err) {
    console.warn("Could not render split document:", err);
  }
}

export function setupSplitDivider() {
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
