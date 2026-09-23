import { state, quill } from '../core/state.js';
import { el } from '../core/elements.js';
import { formatFileSize, formatPdfDate, detectPaperFormat, escapeHtml, copyToClipboard } from '../utils/helpers.js';
import { hideAllOverlays } from '../services/document-service.js';
import { editorCharCount, editorWordCount } from '../features/editor/editor.js';

let currentPropertiesRows = [];

export async function showPropertiesModal() {
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

export async function copyPropertiesInfo() {
  if (!currentPropertiesRows || !currentPropertiesRows.length) {
    if (typeof showToast === 'function') showToast("No document properties to copy", "info");
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
    if (typeof showToast === 'function') showToast("Document properties copied to clipboard", "success");
  } else {
    if (typeof showToast === 'function') showToast("Could not copy properties to clipboard", "error");
  }
}
