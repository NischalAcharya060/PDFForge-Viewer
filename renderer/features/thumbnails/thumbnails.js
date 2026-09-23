import { state, THUMB_MAX } from '../../core/state.js';
import { el } from '../../core/elements.js';
import { scrollToPage, layoutPages } from '../viewer/viewer.js';

export const MAX_CONCURRENT_THUMB_RENDERS = 2;
export let thumbsVisible = true;
export function setThumbsVisible(v) { thumbsVisible = Boolean(v); }
let thumbRenderGen = 0;
let thumbRenderActive = 0;

export function buildThumbnails() {
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

export async function buildOutline(doc) {
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

export function renderOutlineItems(items, container, depth) {
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

export function queueThumbRenders() {
  if (!state.doc || el.thumbnails.hidden || state.activeSidebarTab !== "thumbs") return;
  scheduleNextThumbRender();
}

export function scheduleNextThumbRender() {
  if (!state.doc || el.thumbnails.hidden || state.activeSidebarTab !== "thumbs") return;
  while (thumbRenderActive < MAX_CONCURRENT_THUMB_RENDERS) {
    const next = getNextThumbnailToRender();
    if (!next) break;
    void renderSingleThumb(next, thumbRenderGen);
  }
}

export function updateThumbFromPageCanvas(p) {
  if (!p || !p.canvas || !p.thumbCanvas || !p.thumbDiv || !p.page) return;
  if (!p.rendered || p.canvas.width <= 0 || p.canvas.height <= 0) return;
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

export function getNextThumbnailToRender() {
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

export async function renderSingleThumb(p, gen) {
  if (p.thumbRendered || p.thumbRendering || !p.thumbCanvas || !p.page) return;

  // If already rendered on the main canvas, copy instantly via drawImage
  if (p.rendered && p.canvas && p.canvas.width > 0 && p.canvas.height > 0) {
    updateThumbFromPageCanvas(p);
    if (p.thumbRendered) {
      scheduleNextThumbRender();
      return;
    }
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

export function updateActiveThumb() {
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

export function toggleThumbnails() {
  thumbsVisible = !thumbsVisible;
  applyThumbnails();
}

export function applyThumbnails() {
  el.thumbnails.hidden = !thumbsVisible;
  el.btnThumbs.classList.toggle("active", thumbsVisible);
  if (thumbsVisible && state.activeSidebarTab === "thumbs") {
    queueThumbRenders();
  }
  setTimeout(layoutPages, 0);
}

export function switchSidebarTab(tab) {
  state.activeSidebarTab = tab;
  el.tabThumbs.classList.toggle("active", tab === "thumbs");
  el.tabOutline.classList.toggle("active", tab === "outline");
  el.thumbList.hidden = tab !== "thumbs";
  el.outlineList.hidden = tab !== "outline";
  if (tab === "thumbs") {
    queueThumbRenders();
  }
}
