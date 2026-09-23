import { el } from '../core/elements.js';
import { escapeHtml, copyToClipboard } from '../utils/helpers.js';
import { hideAllOverlays } from '../services/document-service.js';

let cachedAppInfo = null;

export async function getOrFetchAppInfo() {
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

export async function showAboutModal() {
  hideAllOverlays();
  if (el.aboutModal) el.aboutModal.hidden = false;
  const info = await getOrFetchAppInfo();
  const appVersion = info.version || "1.1.0";
  if (el.aboutVersionBadge) el.aboutVersionBadge.textContent = `v${appVersion}`;
  if (el.emptyVersionLabel) el.emptyVersionLabel.textContent = `v${appVersion}`;

  const platformName = info.platform === "win32" ? "Windows" : info.platform === "darwin" ? "macOS" : info.platform === "linux" ? "Linux" : (info.platform || "Desktop");
  const archString = info.arch === "x64" ? "64-bit" : info.arch === "arm64" ? "ARM 64-bit" : info.arch || "";
  const osString = `${platformName} ${archString}`.trim();

  let isDef = false;
  try {
    const assoc = await window.pdfViewer?.getFileAssocStatus?.();
    isDef = Boolean(assoc?.isDefault);
  } catch {}

  const rows = [
    ["Product", `PDFForge Viewer`],
    ["Version", `${appVersion} <span class="about-pill green">Latest Release</span>`],
    ["Default PDF Reader", isDef ? `<span class="about-pill green">Default System Reader</span>` : `<span class="about-pill">Not Default</span>`],
    ["Edition", `Desktop Standard Edition`],
    ["Platform", osString],
    ["Privacy", `<span class="about-pill green">100% Offline · Zero Telemetry</span>`],
    ["Document Security", `<span class="about-pill green">On-Device Local Processing</span>`],
    ["Key Features", `Multi-Tab Reading, Split View, Word Editor, Instant Search`],
    ["Publisher", `PDFForge`],
    ["License", `Free & Open Source (MIT License)`],
  ];

  if (el.aboutInfoGrid) {
    el.aboutInfoGrid.innerHTML = rows
      .map(([label, val]) => `<span class="about-prop-label">${escapeHtml(label)}</span><span class="about-prop-val">${val}</span>`)
      .join("");
  }
}

export async function copyAboutInfo() {
  const info = await getOrFetchAppInfo();
  const appVersion = info.version || "1.1.0";
  const platformName = info.platform === "win32" ? "Windows" : info.platform === "darwin" ? "macOS" : info.platform === "linux" ? "Linux" : (info.platform || "Desktop");
  const archString = info.arch === "x64" ? "64-bit" : info.arch === "arm64" ? "ARM 64-bit" : info.arch || "";
  const osString = `${platformName} ${archString}`.trim();

  const text = [
    `# PDFForge Viewer - Application Information`,
    `- **Product**: PDFForge Viewer`,
    `- **Version**: ${appVersion}`,
    `- **Edition**: Desktop Standard Edition`,
    `- **Platform**: ${osString}`,
    `- **Privacy**: 100% Offline (Zero Telemetry, No Cloud Uploads)`,
    `- **Security**: On-Device Local Processing`,
    `- **Key Features**: Multi-Tab Reading, Split View, Rich Document Creation, Instant Search`,
    `- **Publisher**: PDFForge`,
    `- **License**: Free & Open Source (MIT License)`,
  ].join("\n");

  const copied = await copyToClipboard(text);
  if (copied) {
    if (typeof showToast === 'function') showToast("Application details copied to clipboard", "success");
  } else {
    if (typeof showToast === 'function') showToast("Could not copy info to clipboard", "error");
  }
}
