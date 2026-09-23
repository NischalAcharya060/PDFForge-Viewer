import { state, quill } from '../../core/state.js';
import { el } from '../../core/elements.js';
import { updateEditorChrome } from '../editor/editor.js';
import { showToast } from '../../components/toast.js';

let pendingImageDataUrl = null;

export function openImageInsertModal() {
  if (!el.imageInsertModal) return;
  pendingImageDataUrl = null;
  switchImageTab("device");
  clearDevicePreview();
  clearUrlPreview();
  if (el.imgUrlInput) el.imgUrlInput.value = "";
  if (el.imgInsertBtn) el.imgInsertBtn.disabled = true;
  el.imageInsertModal.hidden = false;
}

export function closeImageInsertModal() {
  if (!el.imageInsertModal) return;
  el.imageInsertModal.hidden = true;
  pendingImageDataUrl = null;
  if (el.imgFileInput) el.imgFileInput.value = "";
}

export function switchImageTab(tab) {
  const isDevice = tab === "device";
  if (el.imgTabDevice) el.imgTabDevice.classList.toggle("active", isDevice);
  if (el.imgTabUrl) el.imgTabUrl.classList.toggle("active", !isDevice);
  if (el.imgPanelDevice) el.imgPanelDevice.classList.toggle("active", isDevice);
  if (el.imgPanelUrl) el.imgPanelUrl.classList.toggle("active", !isDevice);
  pendingImageDataUrl = null;
  if (el.imgInsertBtn) el.imgInsertBtn.disabled = true;
}

export function clearDevicePreview() {
  if (el.imgDropZone) el.imgDropZone.style.display = "";
  if (el.imgDevicePreview) el.imgDevicePreview.style.display = "none";
  if (el.imgDevicePreviewImg) el.imgDevicePreviewImg.src = "";
  if (el.imgDeviceInfo) el.imgDeviceInfo.style.display = "none";
  if (el.imgDeviceName) el.imgDeviceName.textContent = "";
  pendingImageDataUrl = null;
  if (el.imgInsertBtn) el.imgInsertBtn.disabled = true;
}

export function clearUrlPreview() {
  if (el.imgUrlPreview) el.imgUrlPreview.style.display = "none";
  if (el.imgUrlPreviewImg) el.imgUrlPreviewImg.src = "";
  if (el.imgUrlInfo) el.imgUrlInfo.style.display = "none";
  if (el.imgUrlStatus) el.imgUrlStatus.textContent = "";
  pendingImageDataUrl = null;
  if (el.imgInsertBtn) el.imgInsertBtn.disabled = true;
}

export function handleDeviceImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("Please select a valid image file.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    pendingImageDataUrl = dataUrl;
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

export async function handleUrlImageLoad() {
  const url = el.imgUrlInput ? el.imgUrlInput.value.trim() : "";
  if (!url) {
    showToast("Please enter an image URL.", "info");
    return;
  }
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
      const img = document.createElement("img");
      img.alt = "Preview";
      img.onload = () => {
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

export function insertPendingImage() {
  if (!pendingImageDataUrl || !quill) return;
  const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
  quill.insertEmbed(range.index, "image", pendingImageDataUrl, "user");
  quill.setSelection(range.index + 1, "silent");
  closeImageInsertModal();
}

export function bindImageModalEvents() {
  if (el.imgTabDevice) el.imgTabDevice.addEventListener("click", () => switchImageTab("device"));
  if (el.imgTabUrl) el.imgTabUrl.addEventListener("click", () => switchImageTab("url"));

  if (el.imgBrowseTrigger) {
    el.imgBrowseTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (el.imgFileInput) el.imgFileInput.click();
    });
  }

  if (el.imgDropZone) {
    el.imgDropZone.addEventListener("click", () => {
      if (el.imgFileInput) el.imgFileInput.click();
    });

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

  if (el.imgFileInput) {
    el.imgFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleDeviceImageFile(file);
    });
  }

  if (el.imgDeviceRemove) {
    el.imgDeviceRemove.addEventListener("click", () => {
      clearDevicePreview();
      if (el.imgFileInput) el.imgFileInput.value = "";
    });
  }

  if (el.imgUrlLoad) {
    el.imgUrlLoad.addEventListener("click", handleUrlImageLoad);
  }

  if (el.imgUrlInput) {
    el.imgUrlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleUrlImageLoad();
      }
    });
  }

  if (el.imgUrlRemove) {
    el.imgUrlRemove.addEventListener("click", clearUrlPreview);
  }

  if (el.imgCancelBtn) {
    el.imgCancelBtn.addEventListener("click", closeImageInsertModal);
  }

  if (el.imgInsertBtn) {
    el.imgInsertBtn.addEventListener("click", insertPendingImage);
  }

  if (el.imageInsertModal) {
    el.imageInsertModal.addEventListener("click", (e) => {
      if (e.target === el.imageInsertModal) closeImageInsertModal();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.imageInsertModal && !el.imageInsertModal.hidden) {
      closeImageInsertModal();
    }
  });

  if (quill) {
    const toolbar = quill.getModule("toolbar");
    if (toolbar) {
      toolbar.addHandler("image", () => {
        openImageInsertModal();
      });
    }
  }
}

// Word-Style Image Resize Handles
let selectedImg = null;
let resizeOverlay = null;

export function removeImageResizeHandles() {
  if (resizeOverlay) {
    resizeOverlay.remove();
    resizeOverlay = null;
  }
  if (selectedImg) {
    selectedImg.classList.remove("img-selected");
    selectedImg = null;
  }
}

export function getResizeContainer() {
  return el.wordPageSheet || document.getElementById("word-page-sheet");
}

export function createResizeHandles(img) {
  removeImageResizeHandles();
  selectedImg = img;
  img.classList.add("img-selected");

  const container = getResizeContainer();
  if (!container) return;

  resizeOverlay = document.createElement("div");
  resizeOverlay.className = "img-resize-wrapper";
  resizeOverlay.setAttribute("contenteditable", "false");

  updateOverlayPosition();

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

  const tooltip = document.createElement("div");
  tooltip.className = "img-resize-tooltip";
  tooltip.textContent = `${Math.round(img.offsetWidth)} × ${Math.round(img.offsetHeight)}`;
  resizeOverlay.appendChild(tooltip);

  container.appendChild(resizeOverlay);
}

export function updateOverlayPosition() {
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

export function startResize(e, dir) {
  if (!selectedImg) return;

  const img = selectedImg;
  const startX = e.clientX;
  const startY = e.clientY;
  const startW = img.offsetWidth;
  const startH = img.offsetHeight;
  const aspect = startW / (startH || 1);
  const isCorner = dir === "nw" || dir === "ne" || dir === "sw" || dir === "se";

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

    newW = Math.max(20, newW);
    newH = Math.max(20, newH);

    if (isCorner) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        newH = Math.round(newW / aspect);
      } else {
        newW = Math.round(newH * aspect);
      }
      newW = Math.max(20, newW);
      newH = Math.max(20, newH);
    }

    img.style.width = newW + "px";
    img.style.height = newH + "px";
    img.setAttribute("width", String(Math.round(newW)));
    img.setAttribute("height", String(Math.round(newH)));

    requestAnimationFrame(() => {
      updateOverlayPosition();
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

    if (state.editor) {
      state.editor.dirty = true;
      updateEditorChrome();
    }

    requestAnimationFrame(updateOverlayPosition);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

// Detect clicks on images inside the Quill editor
document.addEventListener("click", (e) => {
  if (!state.editor || !state.editor.active) return;

  const img = e.target.closest && e.target.closest("#editor-content .ql-editor img");
  if (img) {
    e.preventDefault();
    e.stopPropagation();
    createResizeHandles(img);
    return;
  }

  if (e.target.closest && e.target.closest(".img-resize-handle")) {
    return;
  }
  if (e.target.closest && e.target.closest(".img-resize-wrapper")) {
    return;
  }

  if (selectedImg) {
    removeImageResizeHandles();
  }
}, true);

document.addEventListener("mousedown", (e) => {
  if (!state.editor || !state.editor.active) return;
  const img = e.target.closest && e.target.closest("#editor-content .ql-editor img");
  if (img) {
    setTimeout(() => {
      createResizeHandles(img);
    }, 0);
  }
}, true);

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
    if (quill && typeof Quill !== "undefined") {
      try {
        const blot = Quill.find(img);
        if (blot) {
          const index = quill.getIndex(blot);
          quill.deleteText(index, 1, "user");
        }
      } catch {
        img.remove();
      }
    }
  }
});
