import { state, tabs, activeTabId, PAGE_PAD, ZOOM_PRESETS, MIN_ZOOM, MAX_ZOOM } from '../../core/state.js';
import { el } from '../../core/elements.js';
import { TextLayer } from '../../pdfjs/pdf.mjs';
import { getDocument } from '../../pdfjs/pdf.mjs';
import { clamp } from '../../utils/helpers.js';
import { highlightPage } from '../search/search.js';
import { showToast } from '../../components/toast.js';
import { updateActiveThumb, updateThumbFromPageCanvas, thumbsVisible, applyThumbnails, queueThumbRenders, buildThumbnails, buildOutline } from '../thumbnails/thumbnails.js';
import { setLoading, openDocument } from '../../services/document-service.js';

export function availableSpace() {
  const w = el.pageHost.clientWidth - PAGE_PAD * 2;
  const h = el.pageHost.clientHeight - PAGE_PAD * 2;
  return { w: Math.max(40, w), h: Math.max(40, h) };
}

export function effectiveScale() {
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

export function updateControls() {
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

export function updateZoomSelect() {
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

export function layoutPages() {
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

export function computeVisibleRange() {
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

export function computeCurrentPage() {
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

export function queueVisibleRender() {
  if (!state.doc) return;
  state.renderSeq++;
  const seq = state.renderSeq;
  requestAnimationFrame(() => {
    if (seq !== state.renderSeq) return;
    collectVisiblePages();
  });
}

export function collectVisiblePages() {
  if (!state.doc) return;
  computeCurrentPage();
  const [start, end] = computeVisibleRange();
  for (let i = start - 3; i < end + 3; i++) {
    const p = state.pages[i];
    if (p && !p.rendered) enqueueRender(p);
  }
  pumpRender();
}

export function enqueueRender(p) {
  if (!state.renderQueue.includes(p)) state.renderQueue.push(p);
}

export async function pumpRender() {
  if (state.renderBusy) return;
  state.renderBusy = true;
  try {
    while (state.renderQueue.length) {
      const p = state.renderQueue.shift();
      await renderPage(p);
    }
  } catch (err) {
    console.error("[PUMP-RENDER-ERROR]", err);
  } finally {
    state.renderBusy = false;
  }
}

export async function renderPage(p) {
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
    p.prevTask = null;
  }

  const ctx = p.canvas.getContext("2d");
  try {
    const task = p.page.render({ canvasContext: ctx, viewport });
    p.prevTask = task;
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

export async function renderAnnotationLayerForPage(p, key) {
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

export async function renderTextLayerForPage(p, key) {
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

export function scrollToPage(index) {
  const p = state.pages[index];
  if (!p) return;
  const target = Math.max(0, p.div.offsetTop - Math.max(24, (el.pageHost.clientHeight - p.height) / 2));
  el.pageHost.scrollTo({ top: target, behavior: "smooth" });
}

export function goToPage(pageNumber) {
  if (!state.doc || !state.pages.length) return;
  const idx = clamp(pageNumber - 1, 0, state.pages.length - 1);
  scrollToPage(idx);
}

export function prevPage() {
  if (!state.doc) return;
  if (state.twoPageMode) {
    const currentSpreadStart = state.currentPage % 2 === 0 ? state.currentPage - 1 : state.currentPage;
    const targetPage = Math.max(1, currentSpreadStart - 2);
    if (currentSpreadStart > 1) scrollToPage(targetPage - 1);
    return;
  }
  if (state.currentPage > 1) scrollToPage(state.currentPage - 2);
}

export function nextPage() {
  if (!state.doc) return;
  if (state.twoPageMode) {
    const currentSpreadStart = state.currentPage % 2 === 0 ? state.currentPage - 1 : state.currentPage;
    const targetPage = currentSpreadStart + 2;
    if (targetPage <= state.pages.length) scrollToPage(targetPage - 1);
    return;
  }
  if (state.currentPage < state.pages.length) scrollToPage(state.currentPage);
}

export function setFit(mode) {
  state.layoutMode = mode;
  layoutPages();
  updateZoomSelect();
  syncFitButtons();
}

export function zoomIn() {
  if (!state.doc) return;
  const cur = effectiveScale();
  const next = ZOOM_PRESETS.find((p) => p > cur + 0.015);
  state.zoom = next ? next : clamp(cur * 1.25, MIN_ZOOM, MAX_ZOOM);
  state.layoutMode = "fixed";
  layoutPages();
  updateZoomSelect();
  syncFitButtons();
}

export function zoomOut() {
  if (!state.doc) return;
  const cur = effectiveScale();
  const prev = [...ZOOM_PRESETS].reverse().find((p) => p < cur - 0.015);
  state.zoom = prev ? prev : clamp(cur * 0.8, MIN_ZOOM, MAX_ZOOM);
  state.layoutMode = "fixed";
  layoutPages();
  updateZoomSelect();
  syncFitButtons();
}

export function zoomBy(factor) {
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

export function actualSize() {
  if (!state.doc) return;
  state.zoom = 1;
  state.layoutMode = "fixed";
  layoutPages();
  updateZoomSelect();
  syncFitButtons();
}

export function rotateClockwise() {
  if (!state.doc) return;
  state.rotation = (state.rotation + 90) % 360;
  layoutPages();
  buildThumbnails();
}

export function syncFitButtons() {
  el.btnFitWidth.classList.toggle("active", state.layoutMode === "fit-width");
  el.btnFitPage.classList.toggle("active", state.layoutMode === "fit-page");
}

export async function buildPages(doc) {
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

export async function addBlankPageToCurrentDoc() {
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

export async function appendPdfToCurrentDoc() {
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

