import { state, tabs, activeTabId, splitTabId, isSplitActive, tabCounter, splitDoc, splitPages, tabDragSourceId, contextMenuTargetTabId, setActiveTabId, setSplitTabId, setIsSplitActive, setTabCounter, setSplitDoc, setSplitPages, setTabDragSourceId, setContextMenuTargetTabId } from '../../core/state.js';
import { el } from '../../core/elements.js';
import { layoutPages, updateControls, syncFitButtons, updateZoomSelect } from '../viewer/viewer.js';
import { openDocument, hideAllOverlays } from '../../services/document-service.js';
import { updateEditorChrome, exitEditor, openTextEditor } from '../editor/editor.js';
import { escapeHtml } from '../../utils/helpers.js';

export function showTabContextMenu(x, y, tabId) {
  if (!el.tabContextMenu) return;
  setContextMenuTargetTabId(tabId);
  const menuW = 190;
  const menuH = 180;
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

export function restoreTab(tab) {
  setActiveTabId(tab.id);
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

export function createNewTab(opts = {}) {
  snapshotCurrentTab();
  setTabCounter(tabCounter + 1);
  const id = 'tab-' + tabCounter;
  const newTab = {
    id,
    type: opts.type || 'empty',
    name: opts.name || (opts.type === 'editor' ? 'Document1' : 'New Tab'),
    filePath: opts.filePath || null,
    data: opts.data || null,
    doc: null,
    pages: [],
    outline: [],
    currentPage: 1,
    zoom: 1,
    layoutMode: 'fit-width',
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

export async function closeTab(tabId) {
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
      createNewTab({ type: "pdf", name: f.name, data: f.data, filePath: f.path });
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

export async function toggleSplitView() {
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

export async function openSplitView(tab) {
  setIsSplitActive(true);
  setSplitTabId(tab.id);
  if (el.splitDivider) el.splitDivider.hidden = false;
  if (el.secondaryPane) el.secondaryPane.hidden = false;
  if (el.btnSplitView) el.btnSplitView.classList.add("active");
  if (el.secondaryPaneTitle) el.secondaryPaneTitle.textContent = tab.name || "Second Document";
  renderSplitDoc(tab);
}

export function closeSplitView() {
  setIsSplitActive(false);
  setSplitTabId(null);
  if (el.splitDivider) el.splitDivider.hidden = true;
  if (el.secondaryPane) el.secondaryPane.hidden = true;
  if (el.btnSplitView) el.btnSplitView.classList.remove("active");
  if (el.secondaryPageHost) el.secondaryPageHost.textContent = "";
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

export async function renderSplitDoc(tab) {
  if (!el.secondaryPageHost) return;
  el.secondaryPageHost.textContent = "";
  if (!tab.data) return;
  try {
    const task = getDocument({ data: tab.data });
    setSplitDoc(await task.promise);
    setSplitPages([]);
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

