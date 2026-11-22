import { el } from "../core/elements.js";
import { showToast } from "./toast.js";
import { hideAllOverlays } from "../services/document-service.js";
import {
  getSettings,
  saveSettings,
  resetSettings,
  getInitialZoomAndLayout,
  applyDomSettings,
  clearAllLastReadPages,
} from "../services/settings-service.js";
import { applyTheme } from "../utils/theme.js";
import { state } from "../core/state.js";
import { layoutPages, updateZoomSelect, syncFitButtons } from "../features/viewer/viewer.js";
import { clearRecentFiles } from "../services/recent-files.js";
import { clamp } from "../utils/helpers.js";

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

export async function updateContextMenuStatus() {
  try {
    if (window.pdfViewer?.getContextMenuStatus) {
      const res = await window.pdfViewer.getContextMenuStatus();
      const isEnabled = Boolean(res?.isEnabled);

      if (el.contextMenuBadge) {
        el.contextMenuBadge.className = isEnabled ? "status-pill success" : "status-pill neutral";
        el.contextMenuBadge.innerHTML = isEnabled
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Active in Context Menu`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Not in Context Menu`;
      }

      if (el.settingContextMenuToggle) {
        el.settingContextMenuToggle.checked = isEnabled;
      }
      return res;
    }
  } catch (err) {
    console.warn("Could not check context menu status:", err);
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

export function detectVoiceGender(voice) {
  if (!voice) return null;
  const name = (voice.name || "").toLowerCase();
  const uri = (voice.voiceURI || "").toLowerCase();
  const combined = `${name} ${uri}`;

  if (/\b(female|woman|girl|femme|weiblich|donna|mujer|feminino)\b/i.test(combined)) {
    return "Female";
  }
  if (/\b(male|man|boy|homme|m\u00e4nnlich|uomo|hombre|masculino)\b/i.test(combined)) {
    return "Male";
  }

  const femaleNames = [
    "zira", "hazel", "susan", "samantha", "victoria", "katherine", "caren",
    "helena", "eva", "elena", "laura", "julie", "alice", "fiona", "karen",
    "tessa", "veena", "moira", "alva", "yuri", "kyoko", "ting-ting", "sin-ji",
    "mei-jia", "huihui", "yaoyao", "hanhan", "yating", "kanya", "monica",
    "paulina", "joana", "luciana", "sara", "anna", "milena", "mariska",
    "damayanti", "heera", "hedda", "hortense", "elsa", "sabina", "irina",
    "haruka", "ayumi", "sayaka", "siri", "ava", "allison", "serena", "zoe"
  ];
  for (const fn of femaleNames) {
    if (new RegExp(`\\b${fn}\\b`, "i").test(combined)) {
      return "Female";
    }
  }

  const maleNames = [
    "david", "mark", "george", "ravi", "richard", "james", "john", "alex",
    "fred", "daniel", "oliver", "thomas", "diego", "jorge", "juan", "carlos",
    "kangkang", "danny", "stefan", "pavel", "tarik", "cosimo", "magnus",
    "zhiwei", "ichiro", "adam", "raul", "pablo", "claude", "tom", "bruce",
    "ralph", "lee", "nathan", "aaron"
  ];
  for (const mn of maleNames) {
    if (new RegExp(`\\b${mn}\\b`, "i").test(combined)) {
      return "Male";
    }
  }

  return null;
}

export function populateVoiceList() {
  if (!el.settingSpeechVoice || typeof window === "undefined" || !window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  const currentVal = el.settingSpeechVoice.value;
  el.settingSpeechVoice.innerHTML = '<option value="">Default System Voice</option>';
  for (const voice of voices) {
    const opt = document.createElement("option");
    opt.value = voice.voiceURI || voice.name;
    const gender = detectVoiceGender(voice);
    const tag = gender === "Female" ? "[Female] " : gender === "Male" ? "[Male] " : "";
    opt.textContent = `${tag}${voice.name} (${voice.lang})${voice.default ? ' — Default' : ''}`;
    el.settingSpeechVoice.appendChild(opt);
  }
  if (currentVal) {
    el.settingSpeechVoice.value = currentVal;
  }
}

export function populateSettingsForm(settings = getSettings()) {
  if (el.settingDefaultZoom) {
    el.settingDefaultZoom.value = settings.defaultZoom || "125";
  }
  if (el.settingCustomZoom) {
    el.settingCustomZoom.value = String(settings.customZoom || 125);
  }
  if (el.settingCustomZoomWrap) {
    el.settingCustomZoomWrap.hidden = (settings.defaultZoom !== "custom");
  }
  if (el.settingDefaultLayout) {
    el.settingDefaultLayout.value = settings.defaultLayout || "single";
  }
  if (el.settingTheme) {
    el.settingTheme.value = settings.theme || "system";
  }
  if (el.settingInvertColors) {
    el.settingInvertColors.checked = Boolean(settings.invertPdfColors);
  }
  if (el.settingSmoothScroll) {
    el.settingSmoothScroll.checked = Boolean(settings.smoothScroll);
  }
  populateVoiceList();
  if (el.settingSpeechVoice && settings.speechVoice) {
    el.settingSpeechVoice.value = settings.speechVoice;
  }
  if (el.settingSpeechRate) {
    el.settingSpeechRate.value = String(settings.speechRate || 1.0);
  }
  if (el.settingSpeechPitch) {
    el.settingSpeechPitch.value = String(settings.speechPitch || 1.0);
  }
  if (el.settingSpeechVolume) {
    el.settingSpeechVolume.value = String(settings.speechVolume || 1.0);
  }
  if (el.settingSpeechMode) {
    el.settingSpeechMode.value = settings.speechMode || "auto";
  }
  if (el.settingSidebarState) {
    el.settingSidebarState.value = settings.sidebarDefaultState || "closed";
  }
  if (el.settingSidebarTab) {
    el.settingSidebarTab.value = settings.defaultSidebarTab || "thumbs";
  }
  if (el.settingRememberPage) {
    el.settingRememberPage.checked = Boolean(settings.restoreLastPage);
  }
  if (el.settingEditorPaper) {
    el.settingEditorPaper.value = settings.editorPaperSize || "a4";
  }
  if (el.settingEditorFontSize) {
    el.settingEditorFontSize.value = String(settings.editorFontSize || 11);
  }
  if (el.settingEditorLineSpacing) {
    el.settingEditorLineSpacing.value = String(settings.editorLineSpacing || 1.15);
  }
}

export function switchSettingsTab(tabName = "viewer") {
  const tabs = ["viewer", "system", "editor", "session"];
  tabs.forEach((t) => {
    const btn = document.querySelector(`.settings-tab-btn[data-tab="${t}"]`);
    const panel = document.getElementById(`tab-panel-${t}`);
    const isActive = (t === tabName);
    if (btn) {
      btn.classList.toggle("active", isActive);
      if (isActive) {
        try {
          btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        } catch {}
      }
    }
    if (panel) panel.hidden = !isActive;
  });
}

export async function showFileAssocModal(initialTab = "viewer") {
  hideAllOverlays();
  if (el.fileAssocModal) el.fileAssocModal.hidden = false;

  // Populate settings form and activate initial tab
  populateSettingsForm();
  switchSettingsTab(initialTab);
  setTimeout(() => {
    if (!el.settingsTabsBar) return;
    const isOverflowing = el.settingsTabsBar.scrollWidth > (el.settingsTabsBar.clientWidth + 4);
    const wrapper = el.settingsTabsBar.closest(".settings-tabs-wrapper");
    if (wrapper) {
      wrapper.classList.toggle("has-overflow", isOverflowing);
    }
    const canLeft = el.settingsTabsBar.scrollLeft > 2;
    const canRight = el.settingsTabsBar.scrollLeft < (el.settingsTabsBar.scrollWidth - el.settingsTabsBar.clientWidth - 2);
    if (el.btnSettingsTabsPrev) el.btnSettingsTabsPrev.disabled = !canLeft;
    if (el.btnSettingsTabsNext) el.btnSettingsTabsNext.disabled = !canRight;
  }, 100);

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
  await updateContextMenuStatus();
}

export const showSettingsModal = showFileAssocModal;

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
      showToast(res.message || "Registered as PDF reader! Click \"Set as default\" on the Windows page that opened.", "success");
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
  if (!window.pdfViewer?.applyPdfFileIcon) return { success: true };

  if (selectedIconId === "custom" && !customIconPath) {
    showToast("Please browse and select an icon file first.", "warning");
    return { success: false, error: "Please select an icon file." };
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
      // Icon successfully saved
    } else {
      console.warn("File icon apply warning:", res);
    }
    return res;
  } catch (err) {
    console.warn("Error updating file icon:", err);
    return { success: false, error: err?.message || err };
  } finally {
    if (el.btnApplyIcon) {
      el.btnApplyIcon.disabled = false;
      el.btnApplyIcon.textContent = "Apply & Save";
    }
  }
}

export async function handleApplyAllPreferences() {
  // 1. Gather and save settings
  const customZoomNum = el.settingCustomZoom ? Number(el.settingCustomZoom.value) || 125 : 125;
  const newSettings = {
    defaultZoom: el.settingDefaultZoom ? el.settingDefaultZoom.value : "125",
    customZoom: clamp(customZoomNum, 25, 500),
    defaultLayout: el.settingDefaultLayout ? el.settingDefaultLayout.value : "single",
    theme: el.settingTheme ? el.settingTheme.value : "system",
    invertPdfColors: el.settingInvertColors ? Boolean(el.settingInvertColors.checked) : false,
    smoothScroll: el.settingSmoothScroll ? Boolean(el.settingSmoothScroll.checked) : false,
    speechVoice: el.settingSpeechVoice ? el.settingSpeechVoice.value : "",
    speechRate: el.settingSpeechRate ? Number(el.settingSpeechRate.value) || 1.0 : 1.0,
    speechPitch: el.settingSpeechPitch ? Number(el.settingSpeechPitch.value) || 1.0 : 1.0,
    speechVolume: el.settingSpeechVolume ? Number(el.settingSpeechVolume.value) || 1.0 : 1.0,
    speechMode: el.settingSpeechMode ? el.settingSpeechMode.value : "auto",
    sidebarDefaultState: el.settingSidebarState ? el.settingSidebarState.value : "closed",
    defaultSidebarTab: el.settingSidebarTab ? el.settingSidebarTab.value : "thumbs",
    restoreLastPage: el.settingRememberPage ? Boolean(el.settingRememberPage.checked) : false,
    editorPaperSize: el.settingEditorPaper ? el.settingEditorPaper.value : "a4",
    editorFontSize: el.settingEditorFontSize ? Number(el.settingEditorFontSize.value) || 11 : 11,
    editorLineSpacing: el.settingEditorLineSpacing ? Number(el.settingEditorLineSpacing.value) || 1.15 : 1.15,
  };

  saveSettings(newSettings);

  // Apply theme if requested
  if (newSettings.theme === "dark") {
    applyTheme("dark", true);
  } else if (newSettings.theme === "light") {
    applyTheme("light", true);
  } else if (window.pdfViewer?.getTheme) {
    const sysTheme = await window.pdfViewer.getTheme();
    applyTheme(sysTheme === "dark" ? "dark" : "light", false);
  }

  // Apply DOM settings (invert, smooth scroll)
  applyDomSettings(newSettings);

  // If a document is currently active, apply the zoom/layout settings right away
  if (state.doc) {
    const initialConfig = getInitialZoomAndLayout();
    state.zoom = initialConfig.zoom;
    state.layoutMode = initialConfig.layoutMode;
    state.twoPageMode = initialConfig.twoPageMode;
    layoutPages();
    updateZoomSelect();
    syncFitButtons();
  }

  // 2. Also apply file association & icon changes
  const iconRes = await handleApplyFileIcon();
  if (iconRes && iconRes.success === false && iconRes.error) {
    showToast("Warning: " + iconRes.error, "warning");
  } else {
    showToast("Settings and file icon saved successfully!", "success");
  }
  hideFileAssocModal();
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
    el.btnApplyIcon.addEventListener("click", handleApplyAllPreferences);
  }

  // Settings Tabs switching & scrolling
  const updateTabScrollArrows = () => {
    if (!el.settingsTabsBar) return;
    const isOverflowing = el.settingsTabsBar.scrollWidth > (el.settingsTabsBar.clientWidth + 4);
    const wrapper = el.settingsTabsBar.closest(".settings-tabs-wrapper");
    if (wrapper) {
      wrapper.classList.toggle("has-overflow", isOverflowing);
    }
    const canLeft = el.settingsTabsBar.scrollLeft > 2;
    const canRight = el.settingsTabsBar.scrollLeft < (el.settingsTabsBar.scrollWidth - el.settingsTabsBar.clientWidth - 2);
    if (el.btnSettingsTabsPrev) el.btnSettingsTabsPrev.disabled = !canLeft;
    if (el.btnSettingsTabsNext) el.btnSettingsTabsNext.disabled = !canRight;
  };

  if (el.btnSettingsTabsPrev) {
    el.btnSettingsTabsPrev.addEventListener("click", () => {
      if (el.settingsTabsBar) {
        el.settingsTabsBar.scrollBy({ left: -140, behavior: "smooth" });
        setTimeout(updateTabScrollArrows, 200);
      }
    });
  }

  if (el.btnSettingsTabsNext) {
    el.btnSettingsTabsNext.addEventListener("click", () => {
      if (el.settingsTabsBar) {
        el.settingsTabsBar.scrollBy({ left: 140, behavior: "smooth" });
        setTimeout(updateTabScrollArrows, 200);
      }
    });
  }

  if (el.settingsTabsBar) {
    el.settingsTabsBar.addEventListener("click", (e) => {
      const btn = e.target.closest(".settings-tab-btn");
      if (btn && btn.dataset.tab) {
        switchSettingsTab(btn.dataset.tab);
        setTimeout(updateTabScrollArrows, 150);
      }
    });

    // Side scrolling with mouse wheel
    el.settingsTabsBar.addEventListener("wheel", (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.settingsTabsBar.scrollLeft += e.deltaY;
        updateTabScrollArrows();
      }
    }, { passive: false });

    el.settingsTabsBar.addEventListener("scroll", updateTabScrollArrows, { passive: true });

    // Drag-to-scroll support for settings tabs
    let isDown = false;
    let startX = 0;
    let scrollStart = 0;
    el.settingsTabsBar.addEventListener("mousedown", (e) => {
      if (e.target.closest(".settings-tab-btn")) return;
      isDown = true;
      startX = e.pageX - el.settingsTabsBar.offsetLeft;
      scrollStart = el.settingsTabsBar.scrollLeft;
    });
    window.addEventListener("mouseup", () => { isDown = false; });
    window.addEventListener("mousemove", (e) => {
      if (!isDown || !el.settingsTabsBar) return;
      e.preventDefault();
      const x = e.pageX - el.settingsTabsBar.offsetLeft;
      const walk = (x - startX) * 1.5;
      el.settingsTabsBar.scrollLeft = scrollStart - walk;
      updateTabScrollArrows();
    });
  }

  // Test selected voice preview
  if (el.btnTestVoice) {
    el.btnTestVoice.addEventListener("click", () => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        showToast("Speech synthesis is not supported on this platform.", "warning");
        return;
      }
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        if (el.btnTestVoice) {
          el.btnTestVoice.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Test Voice</span>`;
        }
        return;
      }

      const voiceVal = el.settingSpeechVoice ? el.settingSpeechVoice.value : "";
      const rateVal = el.settingSpeechRate ? Number(el.settingSpeechRate.value) || 1.0 : 1.0;
      const pitchVal = el.settingSpeechPitch ? Number(el.settingSpeechPitch.value) || 1.0 : 1.0;
      const volVal = el.settingSpeechVolume ? Number(el.settingSpeechVolume.value) || 1.0 : 1.0;

      const utt = new SpeechSynthesisUtterance("Hello! This is a preview of your selected text-to-speech voice.");
      utt.rate = rateVal;
      utt.pitch = pitchVal;
      utt.volume = volVal;

      if (voiceVal) {
        const voices = window.speechSynthesis.getVoices();
        const matched = voices.find((v) => (v.voiceURI === voiceVal || v.name === voiceVal));
        if (matched) utt.voice = matched;
      }

      utt.onstart = () => {
        if (el.btnTestVoice) {
          el.btnTestVoice.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><rect x="6" y="6" width="12" height="12"/></svg><span>Stop</span>`;
        }
      };
      utt.onend = () => {
        if (el.btnTestVoice) {
          el.btnTestVoice.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Test Voice</span>`;
        }
      };
      utt.onerror = () => {
        if (el.btnTestVoice) {
          el.btnTestVoice.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Test Voice</span>`;
        }
      };

      window.speechSynthesis.speak(utt);
    });
  }

  // Handle custom zoom toggle
  if (el.settingDefaultZoom) {
    el.settingDefaultZoom.addEventListener("change", () => {
      if (el.settingCustomZoomWrap) {
        el.settingCustomZoomWrap.hidden = (el.settingDefaultZoom.value !== "custom");
      }
    });
  }

  // Reset settings button
  if (el.btnSettingsReset) {
    el.btnSettingsReset.addEventListener("click", () => {
      const defaults = resetSettings();
      populateSettingsForm(defaults);
      showToast("Settings reset to defaults (125% zoom)", "info");
    });
  }

  // Clear recent files button in settings
  if (el.btnClearRecentSettings) {
    el.btnClearRecentSettings.addEventListener("click", () => {
      clearRecentFiles();
      clearAllLastReadPages();
      showToast("Recent documents & reading progress cleared", "info");
    });
  }

  // Toolbar settings button
  if (el.btnSettings) {
    el.btnSettings.addEventListener("click", () => {
      showFileAssocModal("viewer");
    });
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

    el.iconPickerGrid.addEventListener("change", (e) => {
      const radio = e.target.closest(".icon-card-radio");
      if (radio && radio.value) {
        selectIconCard(radio.value);
      }
    });
  }

  // Toggle Windows Explorer Context Menu
  if (el.settingContextMenuToggle) {
    el.settingContextMenuToggle.addEventListener("change", async (e) => {
      const wantEnabled = e.target.checked;
      try {
        if (window.pdfViewer?.setContextMenuStatus) {
          const res = await window.pdfViewer.setContextMenuStatus(wantEnabled);
          if (res?.success) {
            showToast(res.message || (wantEnabled ? "Context menu enabled" : "Context menu removed"), "success");
          } else {
            showToast(res?.message || "Failed to update context menu", "error");
            e.target.checked = !wantEnabled;
          }
        }
      } catch (err) {
        showToast("Error updating context menu: " + (err?.message || err), "error");
        e.target.checked = !wantEnabled;
      } finally {
        await updateContextMenuStatus();
      }
    });
  }

  // Re-check status on window focus
  window.addEventListener("focus", () => {
    updateDefaultAppStatus();
    updateContextMenuStatus();
    populateVoiceList();
  });

  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      populateVoiceList();
    };
  }

  // Initial check on load
  updateDefaultAppStatus();
  updateContextMenuStatus();
}
