import { state, quill, setQuill, editorBusy, setEditorBusy, docZoomScale, setDocZoomScale, tabs, activeTabId } from '../../core/state.js';
import { el } from '../../core/elements.js';
import { clamp } from '../../utils/helpers.js';
import { defaultPdfOptions, loadPdfOptions, persistPdfOptions } from '../../services/pdf-options.js';
import { hideAllOverlays, showEmpty } from '../../services/document-service.js';
import { saveRecentFile } from '../../services/recent-files.js';
import { showToast } from '../../components/toast.js';
import { createNewTab, closeTab, renderTabBar } from '../tabs/tabs.js';

export function initQuill() {
  if (typeof Quill === "undefined") return;

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

  const q = new Quill(el.editorContent, {
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
  setQuill(q);
  window.__quill = q;

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

  q.on("text-change", () => {
    if (editorBusy) return;
    state.editor.dirty = true;
    setEditorStatus("");
    updateEditorChrome();
  });
}

export function editorHasContent() {
  if (!quill) return false;
  return Boolean(quill.getText().replace(/\n/g, "").trim());
}

export function editorCharCount() {
  if (!quill) return 0;
  return quill.getText().replace(/\n/g, "").length;
}

export function editorWordCount() {
  if (!quill) return 0;
  const text = quill.getText().trim();
  return text ? text.trim().split(/\s+/).length : 0;
}

export function applyEditorFontSize() {
  if (quill && state.editor.options && el.editorContent) {
    const editable = el.editorContent.querySelector(".ql-editor");
    if (editable) editable.style.fontSize = `${state.editor.options.fontSize}pt`;
  }
}

export function applyEditorLineSpacing() {
  if (state.editor?.options && el.editorContent) {
    const spacing = state.editor.options.lineSpacing || 1.15;
    const editable = el.editorContent.querySelector(".ql-editor");
    if (editable) editable.style.lineHeight = String(spacing);
  }
}

export function insertWordPageBreak() {
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

export function insertWordHr() {
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

export function updateDocZoom() {
  if (el.wordPageSheet) {
    el.wordPageSheet.style.transform = `scale(${docZoomScale})`;
  }
  if (el.docZoomLabel) {
    el.docZoomLabel.textContent = `${Math.round(docZoomScale * 100)}%`;
  }
}

export function zoomDocIn() {
  setDocZoomScale(clamp(Number((docZoomScale + 0.1).toFixed(1)), 0.5, 2.0));
  updateDocZoom();
}

export function zoomDocOut() {
  setDocZoomScale(clamp(Number((docZoomScale - 0.1).toFixed(1)), 0.5, 2.0));
  updateDocZoom();
}

export function updateEditorChrome() {
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

export function applyEditorSheetLayout() {
  if (!el.wordPageSheet || !state.editor.options) return;
  const o = state.editor.options;
  el.wordPageSheet.style.width = o.pageSize === "letter" ? "816px" : "794px";
  const editable = el.editorContent ? el.editorContent.querySelector(".ql-editor") : null;
  if (editable) {
    const m = o.margin || 56;
    editable.style.padding = `${m}px ${Math.round(m * 1.15)}px 80px`;
  }
}

export function syncOptionsToFields() {
  const o = state.editor.options;
  el.optPaperSize.value = o.pageSize === "letter" ? "letter" : "a4";
  el.optFontSize.value = String(o.fontSize);

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

export function syncOptionsFromFields() {
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

export function toggleEditorOptions() {
  const show = el.editorOptions.hidden;
  el.editorOptions.hidden = !show;
  if (el.btnEditorOptions) el.btnEditorOptions.classList.toggle("active", show);
}

export function openTextEditor({ html = "", text = "", fileName = "Document1", source = null, options = null } = {}) {
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
  setEditorBusy(true);
  if (html) {
    quill.clipboard.dangerouslyPasteHTML(html);
  } else if (text) {
    quill.setText(text);
  } else {
    quill.setContents([{ insert: "\n" }]);
  }
  setEditorBusy(false);
  el.optTitle.value = fileName;
  if (el.editorNameInput) el.editorNameInput.value = fileName;
  setDocZoomScale(1.0);
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

export function newTextFile() {
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

export function exitEditor() {
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

export function leaveEditor() {
  if (!state.editor.active) return true;
  return exitEditor();
}

export async function savePdf() {
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

export function setEditorStatus(message) {
  el.editorStatus.textContent = message || "";
}
