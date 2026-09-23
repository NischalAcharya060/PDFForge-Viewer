const path = require('node:path');
const fs = require('node:fs/promises');

function looksLikePdf(p) {
  return typeof p === "string" && /\.pdf$/i.test(p) && !p.startsWith("-");
}

async function firstPdfArg(argv) {
  for (const raw of argv.slice(1)) {
    if (!looksLikePdf(raw)) continue;
    const resolved = path.resolve(raw);
    try {
      const st = await fs.stat(resolved);
      if (st.isFile()) return resolved;
    } catch {
      // skip
    }
  }
  return null;
}

function makeTestPdf() {
  const objects = {
    "1": "<< /Type /Catalog /Pages 2 0 R >>",
    "2": "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "3": "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "4": "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  };
  const content = "BT /F1 30 Tf 60 380 Td (Hello PDFForge Viewer) Tj ET\n";
  objects["5"] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`;

  const header = Buffer.from("%PDF-1.4\n");
  let body = header;
  const offsets = {};
  for (const id of ["1", "2", "3", "4", "5"]) {
    offsets[id] = body.length;
    body = Buffer.concat([body, Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`)]);
  }
  const xrefPos = body.length;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (const id of ["1", "2", "3", "4", "5"]) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.concat([body, Buffer.from(xref + trailer)]);
}

module.exports = { looksLikePdf, firstPdfArg, makeTestPdf };
