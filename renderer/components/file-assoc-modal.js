import { el } from "../core/elements.js";
import { showToast } from "./toast.js";
import { hideAllOverlays } from "../services/document-service.js";

let selectedIconId = "brand";
let customIconPath = null;
let currentPresets = [];
let isCheckingStatus = false;

export async function getFileAssocPrefs() {
  try {
    if (window.pdfViewer?.getIconPreferences) {
      return await window.pdfViewer.getIconPreferences();
    }
  } catch (err) {
    console.warn("Could not load icon preferences:", err);
  }
  return {
    selectedIconId: "brand",
    customIconPath: null,
    presets: [
      { id: "brand", name: "Brand Red", subtitle: "PDFForge official rounded emblem", previewSvg: "file-icons/brand.svg" },
      { id: "classic", name: "Classic Document", subtitle: "Clean paper sheet with red PDF banner", previewSvg: "file-icons/classic.svg" },
      { id: "dark", name: "Dark Modern", subtitle: "Sleek charcoal slate with ruby accents", previewSvg: "file-icons/dark.svg" },
      { id: "minimal", name: "Minimalist", subtitle: "Clean outline with scarlet ribbon tag", previewSvg: "file-icons/minimal.svg" },
    ],
    osSupported: true,
  };
}

export async function updateDefaultAppStatus() {
  if (isCheckingStatus) return;
  isCheckingStatus = true;

  try {
    if (window.pdfViewer?.getFileAssocStatus) {
      const status = await window.pdfViewer.getFileAssocStatus();
      const isDef = Boolean(status?.isDefault);

      // Update modal badge & description
      if (el.defaultAppBadge) {
        el.defaultAppBadge.className = isDef ? "status-pill success" : "status-pill warning";
        el.defaultAppBadge.innerHTML = isDef
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Default PDF Viewer`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Not Default Reader`;
      }

      if (el.defaultAppDesc) {
        el.defaultAppDesc.textContent = isDef
          ? "PDFForge Viewer is currently your default reader for .pdf files."
          : (status?.progId
              ? `Currently opened by '${status.progId}'. Click below to set PDFForge Viewer as default.`
              : "PDF files are not currently associated with PDFForge Viewer.");
      }

      if (el.btnSetDefault) {
        el.btnSetDefault.textContent = isDef ? "Default App Active" : "Set as Default PDF Viewer";
        el.btnSetDefault.disabled = isDef;
      }

      return status;
    }
  } catch (err) {
    console.warn("Could not check default app status:", err);
  } finally {
    isCheckingStatus = false;
  }
}

function updateExplorerPreview(iconId, customPath) {
  if (!el.explorerPreviewIcon) return;

  if (iconId === "custom") {
    if (customPath) {
      el.explorerPreviewIcon.innerHTML = `
        <div class="custom-ico-preview-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="#e5484d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          <span class="custom-badge-tag">ICO</span>
        </div>
      `;
    } else {
      el.explorerPreviewIcon.innerHTML = `
        <div class="custom-ico-preview-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
      `;
    }
    return;
  }

  // Pre-rendered SVG thumbnails
  const svgMap = {
    brand: `<svg viewBox="0 0 256 256" width="36" height="36">
      <defs>
        <linearGradient id="prevBrand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f04747"/>
          <stop offset="100%" stop-color="#c92a2a"/>
        </linearGradient>
      </defs>
      <rect x="20" y="20" width="216" height="216" rx="52" fill="url(#prevBrand)"/>
      <path d="M72 62 h76 l48 48 v78 a10 10 0 0 1 -10 10 H72 a10 10 0 0 1 -10 -10 V72 a10 10 0 0 1 10 -10 z" fill="#ffffff" opacity="0.96"/>
      <path d="M148 62 v44 a4 4 0 0 0 4 4 h44 z" fill="#e03131" opacity="0.45"/>
      <text x="82" y="166" font-family="system-ui, sans-serif" font-size="34" font-weight="900" fill="#e03131">PDF</text>
    </svg>`,

    classic: `<svg viewBox="0 0 256 256" width="36" height="36">
      <defs>
        <linearGradient id="prevClassic" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e5484d"/>
          <stop offset="100%" stop-color="#c5282d"/>
        </linearGradient>
      </defs>
      <path d="M48 28 h112 l52 52 v140 a8 8 0 0 1 -8 8 H48 a8 8 0 0 1 -8 -8 V36 a8 8 0 0 1 8 -8 z" fill="#ffffff" stroke="#dcdfe4" stroke-width="4"/>
      <path d="M160 28 v48 a4 4 0 0 0 4 4 h48 z" fill="#f0f2f5" stroke="#dcdfe4" stroke-width="3"/>
      <rect x="40" y="88" width="176" height="52" fill="url(#prevClassic)"/>
      <text x="128" y="125" text-anchor="middle" font-family="system-ui, sans-serif" font-size="30" font-weight="900" fill="#ffffff">PDF</text>
      <rect x="68" y="162" width="120" height="6" rx="3" fill="#cbd1d8"/>
      <rect x="68" y="178" width="95" height="6" rx="3" fill="#e2e6eb"/>
    </svg>`,

    dark: `<svg viewBox="0 0 256 256" width="36" height="36">
      <defs>
        <linearGradient id="prevDark" x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stop-color="#242832"/>
          <stop offset="100%" stop-color="#14171d"/>
        </linearGradient>
      </defs>
      <path d="M48 26 h112 l52 52 v144 a10 10 0 0 1 -10 10 H48 a10 10 0 0 1 -10 -10 V36 a10 10 0 0 1 10 -10 z" fill="url(#prevDark)" stroke="#dc2626" stroke-width="3"/>
      <path d="M160 26 v48 a4 4 0 0 0 4 4 h48 z" fill="#2d323e" stroke="#dc2626" stroke-width="2"/>
      <rect x="62" y="100" width="132" height="62" rx="10" fill="#2b1b22" stroke="#ef4444" stroke-width="2"/>
      <text x="128" y="144" text-anchor="middle" font-family="system-ui, sans-serif" font-size="34" font-weight="900" fill="#ff4a4a">PDF</text>
      <rect x="66" y="184" width="124" height="4" rx="2" fill="#ef4444" opacity="0.35"/>
    </svg>`,

    minimal: `<svg viewBox="0 0 256 256" width="36" height="36">
      <path d="M50 28 h110 l50 50 v142 a6 6 0 0 1 -6 6 H50 a6 6 0 0 1 -6 -6 V34 a6 6 0 0 1 6 -6 z" fill="#ffffff" stroke="#ef4444" stroke-width="5"/>
      <path d="M160 28 v46 a4 4 0 0 0 4 4 h46" fill="none" stroke="#ef4444" stroke-width="4"/>
      <path d="M72 26 v60 l18 -10 l18 10 v-60 z" fill="#ef4444"/>
      <text x="128" y="152" text-anchor="middle" font-family="system-ui, sans-serif" font-size="36" font-weight="800" fill="#1f2328">PDF</text>
      <rect x="88" y="170" width="80" height="3" rx="1.5" fill="#ef4444"/>
    </svg>`,
  };

  el.explorerPreviewIcon.innerHTML = svgMap[iconId] || svgMap.brand;
}

export function selectIconCard(iconId) {
  selectedIconId = iconId;

  // Update card selections
  if (el.iconPickerGrid) {
    const cards = el.iconPickerGrid.querySelectorAll(".icon-card");
    cards.forEach((card) => {
      const match = card.getAttribute("data-icon-id") === iconId;
      card.classList.toggle("selected", match);
      const radio = card.querySelector(".icon-card-radio");
      if (radio) radio.checked = match;
    });
  }

  // Update live preview
  updateExplorerPreview(selectedIconId, customIconPath);

  // Custom icon controls visibility
  if (el.customIconPickerRow) {
    el.customIconPickerRow.hidden = iconId !== "custom";
  }
}

export async function showFileAssocModal() {
  hideAllOverlays();
  if (el.fileAssocModal) el.fileAssocModal.hidden = false;

  // Load preferences
  const prefs = await getFileAssocPrefs();
  selectedIconId = prefs.selectedIconId || "brand";
  customIconPath = prefs.customIconPath || null;
  currentPresets = prefs.presets || [];

  if (el.customIconPathLabel) {
    el.customIconPathLabel.textContent = customIconPath
      ? customIconPath.split(/[/\\]/).pop()
      : "No file chosen";
  }

  selectIconCard(selectedIconId);
  await updateDefaultAppStatus();
}

export function hideFileAssocModal() {
  if (el.fileAssocModal) el.fileAssocModal.hidden = true;
}

export async function handleSetAsDefault() {
  if (!window.pdfViewer?.setAsDefaultPdfViewer) return;

  if (el.btnSetDefault) {
    el.btnSetDefault.disabled = true;
    el.btnSetDefault.textContent = "Setting as default…";
  }

  try {
    const res = await window.pdfViewer.setAsDefaultPdfViewer();
    if (res?.success) {
      showToast("Registered as PDF reader! Confirm in Windows Settings if prompted.", "success");
    } else {
      showToast(res?.message || "Failed to register file association.", "error");
    }
  } catch (err) {
    showToast("Error configuring default app: " + (err?.message || err), "error");
  } finally {
    await updateDefaultAppStatus();
  }
}

export async function handleOpenWindowsSettings() {
  try {
    if (window.pdfViewer?.openDefaultAppsSettings) {
      await window.pdfViewer.openDefaultAppsSettings();
    }
  } catch (err) {
    console.warn("Could not open Windows Settings:", err);
  }
}

export async function handleBrowseCustomIcon() {
  if (!window.pdfViewer?.chooseCustomIcon) return;

  try {
    const res = await window.pdfViewer.chooseCustomIcon();
    if (res && !res.canceled && res.filePath) {
      customIconPath = res.filePath;
      if (el.customIconPathLabel) {
        el.customIconPathLabel.textContent = customIconPath.split(/[/\\]/).pop();
      }
      selectIconCard("custom");
      showToast("Custom icon loaded!", "info");
    }
  } catch (err) {
    showToast("Failed to select icon: " + (err?.message || err), "error");
  }
}

export async function handleApplyFileIcon() {
  if (!window.pdfViewer?.applyPdfFileIcon) return;

  if (selectedIconId === "custom" && !customIconPath) {
    showToast("Please browse and select a .ico file first.", "warning");
    return;
  }

  if (el.btnApplyIcon) {
    el.btnApplyIcon.disabled = true;
    el.btnApplyIcon.textContent = "Applying…";
  }

  try {
    const res = await window.pdfViewer.applyPdfFileIcon({
      iconId: selectedIconId,
      customPath: customIconPath,
    });

    if (res?.success) {
      showToast("PDF file icon updated in Windows Explorer!", "success");
      hideFileAssocModal();
    } else {
      showToast(res?.error || res?.message || "Failed to update file icon.", "error");
    }
  } catch (err) {
    showToast("Error updating file icon: " + (err?.message || err), "error");
  } finally {
    if (el.btnApplyIcon) {
      el.btnApplyIcon.disabled = false;
      el.btnApplyIcon.textContent = "Apply & Save";
    }
  }
}

export function initFileAssocModal() {
  if (el.btnFileAssocClose) {
    el.btnFileAssocClose.addEventListener("click", hideFileAssocModal);
  }
  if (el.btnFileAssocCancel) {
    el.btnFileAssocCancel.addEventListener("click", hideFileAssocModal);
  }
  if (el.btnSetDefault) {
    el.btnSetDefault.addEventListener("click", handleSetAsDefault);
  }
  if (el.btnOpenDefaultSettings) {
    el.btnOpenDefaultSettings.addEventListener("click", handleOpenWindowsSettings);
  }
  if (el.btnBrowseCustomIcon) {
    el.btnBrowseCustomIcon.addEventListener("click", handleBrowseCustomIcon);
  }
  if (el.btnApplyIcon) {
    el.btnApplyIcon.addEventListener("click", handleApplyFileIcon);
  }

  // Handle clicking icon cards
  if (el.iconPickerGrid) {
    el.iconPickerGrid.addEventListener("click", (e) => {
      const card = e.target.closest(".icon-card");
      if (card) {
        const id = card.getAttribute("data-icon-id");
        if (id) selectIconCard(id);
      }
    });
  }

  // Re-check status on window focus
  window.addEventListener("focus", () => {
    updateDefaultAppStatus();
  });

  // Initial check on load
  updateDefaultAppStatus();
}
