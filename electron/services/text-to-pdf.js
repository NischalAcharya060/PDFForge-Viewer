const path = require("node:path");
const fs = require("node:fs/promises");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const FONT_CANDIDATES = [
  process.env.WINDIR ? path.join(process.env.WINDIR, "Fonts", "arial.ttf") : null,
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Arial.ttf",
  "/Library/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
].filter(Boolean);

const WINANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function isWinAnsi(code) {
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) {
    return !(code === 0x81 || code === 0x8d || code === 0x8f || code === 0x90 || code === 0x9d);
  }
  return WINANSI_EXTRAS.has(code);
}

function sanitizeForStandardFont(text) {
  let out = "";
  for (const ch of text) {
    out += isWinAnsi(ch.codePointAt(0)) ? ch : "?";
  }
  return out;
}

async function embedTextFont(doc) {
  for (const candidate of FONT_CANDIDATES) {
    try {
      const bytes = await fs.readFile(candidate);
      return { font: await doc.embedFont(bytes), standard: false };
    } catch {
      // try next candidate
    }
  }
  return { font: await doc.embedFont(StandardFonts.Helvetica), standard: true };
}

function hardWrap(font, word, size, maxWidth) {
  const lines = [];
  let current = "";
  for (const ch of word) {
    if (current && font.widthOfTextAtSize(current + ch, size) > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapParagraph(font, paragraph, size, maxWidth) {
  const out = [];
  let current = "";
  for (const word of paragraph.split(/\s+/)) {
    if (!word) continue;
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
    } else {
      if (current) out.push(current);
      current = "";
      const pieces = hardWrap(font, word, size, maxWidth);
      if (pieces.length > 0) {
        current = pieces.pop();
        out.push(...pieces);
      }
    }
  }
  if (current) out.push(current);
  return out;
}

function layoutLines(font, text, size, maxWidth) {
  const lines = [];
  const paragraphs = String(text).replace(/\r\n?/g, "\n").split("\n");
  for (const paragraph of paragraphs) {
    if (paragraph === "\f") {
      lines.push("\f");
      continue;
    }
    const normalized = paragraph.replace(/\t/g, "    ");
    if (!normalized.trim()) {
      lines.push("");
      continue;
    }
    const wrapped = wrapParagraph(font, normalized, size, maxWidth);
    lines.push(...(wrapped.length ? wrapped : [""]));
  }
  return lines;
}

async function textToPdf(text, options = {}) {
  const title = typeof options.title === "string" && options.title.trim() ? options.title.trim() : "Untitled";
  const author = typeof options.author === "string" && options.author.trim() ? options.author.trim() : "PDFForge";
  const pageSize = PAGE_SIZES[options.pageSize] || PAGE_SIZES.a4;
  const fontSize = typeof options.fontSize === "number" && options.fontSize > 0 ? options.fontSize : 11;
  const lineHeight = typeof options.lineHeight === "number" && options.lineHeight >= fontSize ? options.lineHeight : Math.round(fontSize * 1.45);
  const margin = typeof options.margin === "number" && options.margin >= 0 ? options.margin : 56;
  const showPageNumbers = options.pageNumbers !== false;

  const [pageW, pageH] = pageSize;
  const maxWidth = pageW - margin * 2;
  const topY = pageH - margin - fontSize;

  const doc = await PDFDocument.create();
  const { font, standard } = await embedTextFont(doc);
  const lines = layoutLines(font, text, fontSize, maxWidth);

  let page = doc.addPage([pageW, pageH]);
  let y = topY;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === "\f") {
      page = doc.addPage([pageW, pageH]);
      y = topY;
      continue;
    }
    if (y - lineHeight < margin) {
      page = doc.addPage([pageW, pageH]);
      y = topY;
    }
    const draw = standard ? sanitizeForStandardFont(line) : line;
    if (draw) {
      page.drawText(draw, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
    y -= lineHeight;
  }

  if (showPageNumbers && doc.getPageCount() > 0) {
    const total = doc.getPageCount();
    for (let i = 0; i < total; i++) {
      const p = doc.getPage(i);
      const label = `Page ${i + 1} of ${total}`;
      const w = font.widthOfTextAtSize(label, 8);
      p.drawText(standard ? sanitizeForStandardFont(label) : label, {
        x: (pageW - w) / 2,
        y: 24,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  doc.setTitle(title);
  doc.setAuthor(author);
  doc.setCreator("PDFForge Desktop");
  doc.setProducer("pdf-lib");
  doc.setSubject("Created with PDFForge Desktop");

  return doc.save();
}

module.exports = { textToPdf };