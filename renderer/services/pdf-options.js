import { state, PDF_OPTIONS_KEY } from '../core/state.js';

export function defaultPdfOptions() {
  return {
    pageSize: "a4",
    fontSize: 11,
    lineSpacing: 1.15,
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
