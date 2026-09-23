export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = String(str || "");
  return d.innerHTML;
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB (${bytes.toLocaleString()} bytes)`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB (${bytes.toLocaleString()} bytes)`;
}

export function formatPdfDate(raw) {
  if (!raw) return "—";
  const s = String(raw).trim();
  const m = s.match(/^D:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (m) {
    const year = m[1];
    const month = m[2] || "01";
    const day = m[3] || "01";
    const hour = m[4] || "00";
    const min = m[5] || "00";
    const sec = m[6] || "00";
    const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString();
    }
  }
  const d2 = new Date(s);
  if (!isNaN(d2.getTime())) {
    return d2.toLocaleString();
  }
  return s.replace(/^D:/, "");
}

export function detectPaperFormat(w, h) {
  const isLandscape = w > h;
  const pw = isLandscape ? h : w;
  const ph = isLandscape ? w : h;
  const orient = isLandscape ? "Landscape" : "Portrait";
  
  if (Math.abs(pw - 595.28) < 8 && Math.abs(ph - 841.89) < 8) return `A4 (${orient})`;
  if (Math.abs(pw - 612) < 8 && Math.abs(ph - 792) < 8) return `US Letter (${orient})`;
  if (Math.abs(pw - 612) < 8 && Math.abs(ph - 1008) < 8) return `US Legal (${orient})`;
  if (Math.abs(pw - 841.89) < 8 && Math.abs(ph - 1190.55) < 8) return `A3 (${orient})`;
  if (Math.abs(pw - 419.53) < 8 && Math.abs(ph - 595.28) < 8) return `A5 (${orient})`;
  if (Math.abs(pw - 792) < 8 && Math.abs(ph - 1224) < 8) return `US Tabloid (${orient})`;
  if (Math.abs(pw - 504) < 8 && Math.abs(ph - 720) < 8) return `B5 (${orient})`;
  return `Custom (${orient})`;
}

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
