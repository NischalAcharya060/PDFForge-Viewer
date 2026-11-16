import { state, PDF_OPTIONS_KEY } from '../core/state.js';
import { getSettings } from './settings-service.js';

export function defaultPdfOptions() {
  const settings = getSettings();
  return {
    pageSize: settings.editorPaperSize || "a4",
    fontSize: Number(settings.editorFontSize) || 11,
    lineSpacing: Number(settings.editorLineSpacing) || 1.15,
    margin: 56,
    pageNumbers: true,
    title: "",
    author: "PDFForge",
  };
}

export function loadPdfOptions() {
  const options = defaultPdfOptions();
  try {
    const raw = localStorage.getItem(PDF_OPTIONS_KEY);
    if (raw) Object.assign(options, JSON.parse(raw));
  } catch {}
  return options;
}

export function persistPdfOptions() {
  const o = state.editor.options;
  try {
    localStorage.setItem(
      PDF_OPTIONS_KEY,
      JSON.stringify({
        pageSize: o.pageSize,
        fontSize: o.fontSize,
        lineSpacing: o.lineSpacing,
        margin: o.margin,
        pageNumbers: o.pageNumbers,
        author: o.author,
      })
    );
  } catch {}
}
