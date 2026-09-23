const path = require("node:path");
const fs = require("node:fs/promises");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { textToPdf } = require("./text-to-pdf");

const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const FONT_FILES = ["arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"];
const FONT_DIRS = [
  process.env.WINDIR ? path.join(process.env.WINDIR, "Fonts") : null,
  "/System/Library/Fonts/Supplemental",
  "/System/Library/Fonts",
  "/Library/Fonts",
  "/usr/share/fonts/truetype/msttcorefonts",
  "/usr/share/fonts/truetype/dejavu",
].filter(Boolean);

const HEADER_SCALE = { 0: 1, 1: 2.1, 2: 1.8, 3: 1.55, 4: 1.3, 5: 1.15, 6: 1 };
const SIZE_CLASS = { small: 0.75, large: 1.25, huge: 1.5 };

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
};

const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "ul", "ol", "li"]);
const VARIANTS = ["", "B", "I", "BI"];

let fonts = {};

function decodeEntities(str) {
  return str.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z0-9]+);/g, (match, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : match;
  });
}

function parseColor(str) {
  if (!str) return null;
  str = String(str).trim().toLowerCase();
  let m = str.match(/^#([0-9a-f]{6})$/);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  }
  m = str.match(/^#([0-9a-f]{3})$/);
  if (m) {
    const n = parseInt(m[1], 16);
    const r = ((n >> 8) & 15) | ((n >> 4) & 240);
    const g = ((n >> 4) & 15) | (n & 240);
    const b = (n & 15) | ((n & 15) << 4);
    return [r / 255, g / 255, b / 255];
  }
  m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/);
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  return null;
}

function parseStyle(styleStr) {
  const out = { color: null, bg: null, factor: null };
  if (!styleStr) return out;
  for (const part of styleStr.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (key === "color") out.color = parseColor(value);
    else if (key === "background" || key === "background-color") out.bg = parseColor(value);
    else if (key === "font-size") {
      const m = value.match(/^([\d.]+)(pt|px)?$/);
      if (m) {
        const val = parseFloat(m[1]);
        if (m[2] === "px") out.factor = (val * 0.75) / 11;
        else out.factor = val / 11;
      }
    }
  }
  return out;
}

function parseClass(cls) {
  const out = { align: "left", size: null, indent: 0, isPageBreak: false };
  if (!cls) return out;
  const align = cls.match(/ql-align-(left|center|right|justify)/);
  if (align) out.align = align[1];
  const size = cls.match(/ql-size-(small|large|huge)/);
  if (size) out.size = size[1];
  const indent = cls.match(/ql-indent-(\d)/);
  if (indent) out.indent = Number(indent[1]);
  if (cls.includes("page-break") || cls.includes("word-page-break")) out.isPageBreak = true;
  return out;
}

function parseAttrs(raw) {
  const out = {};
  const re = /([a-zA-Z0-9-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(raw)) !== null) out[m[1].toLowerCase()] = m[2];
  return out;
}

function inlineDeltaFor(tag, attrsRaw) {
  const attrs = parseAttrs(attrsRaw);
  if (tag === "b" || tag === "strong") return { bold: true };
  if (tag === "i" || tag === "em") return { italic: true };
  if (tag === "u" || tag === "ins") return { underline: true };
  if (tag === "s" || tag === "strike" || tag === "del") return { strike: true };
  if (tag === "small") return { factor: 0.85 };
  if (tag === "big") return { factor: 1.2 };
  if (tag === "span") {
    const style = parseStyle(attrs.style);
    const cls = parseClass(attrs.class);
    const delta = {};
    if (style.color) delta.color = style.color;
    if (style.bg) delta.bg = style.bg;
    if (style.factor) delta.factor = style.factor;
    if (cls.size) delta.factor = SIZE_CLASS[cls.size] || delta.factor || null;
    return delta.color || delta.bg || delta.factor ? delta : null;
  }
  return null;
}

function blockFromStack(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].block) return stack[i].block;
  }
  return null;
}

function parseHtml(html) {
  const blocks = [];
  const stack = [];
  let currentBlock = null;

  const emitRun = (rawText) => {
    if (!rawText) return;
    const text = decodeEntities(rawText);
    if (!text) return;
    if (!currentBlock) {
      currentBlock = { align: "left", header: 0, quote: false, code: false, list: null, indent: 0, runs: [] };
      stack.push({ tag: "p", block: currentBlock });
    }
    const style = { bold: false, italic: false, underline: false, strike: false, color: null, bg: null, factor: 1 };
    for (const frame of stack) {
      const d = frame.delta;
      if (!d) continue;
      if (d.bold) style.bold = true;
      if (d.italic) style.italic = true;
      if (d.underline) style.underline = true;
      if (d.strike) style.strike = true;
      if (d.color) style.color = d.color;
      if (d.bg) style.bg = d.bg;
      if (d.factor) style.factor *= d.factor;
    }
    currentBlock.runs.push({ text, ...style });
  };

  const withinList = () => {
    let type = null;
    let depth = 0;
    for (let i = stack.length - 1; i >= 0; i--) {
      const tag = stack[i].tag;
      if (tag === "ol" || tag === "ul") {
        type = tag;
        depth += 1;
      } else if (stack[i].block && type) {
        break;
      }
    }
    return type ? { type, depth } : null;
  };

  const tokenRe = /<(\/?)([a-zA-Z0-9]+)((?:\s+[^<>]*?)?)(\/?)>|([^<]+)/g;
  let match;
  while ((match = tokenRe.exec(String(html || ""))) !== null) {
    const closing = match[1] === "/";
    const tag = match[2] ? match[2].toLowerCase() : "";
    const attrsRaw = match[3] || "";
    const selfClose = match[4] === "/";
    const textNode = match[5];

    if (textNode !== undefined) {
      emitRun(textNode);
      continue;
    }
    if (!tag) continue;

    if (tag === "br") {
      if (currentBlock) currentBlock.runs.push({ text: "\n", break: true });
      continue;
    }
    if (tag === "hr") {
      const attrs = parseAttrs(attrsRaw);
      const isPageBreak = (attrs.class && (attrs.class.includes("page-break") || attrs.class.includes("word-page-break"))) || attrs["data-page-break"] === "true";
      if (currentBlock && currentBlock.runs.length) {
        blocks.push(currentBlock);
      }
      if (isPageBreak) {
        blocks.push({ align: "left", header: 0, quote: false, code: false, list: null, indent: 0, runs: [{ text: "\f" }] });
      } else {
        blocks.push({ hr: true, runs: [] });
      }
      currentBlock = null;
      continue;
    }
    if (tag === "img") continue;

    if (closing) {
      const idx = stack.map((f) => f.tag).lastIndexOf(tag);
      if (idx === -1) continue;
      const removed = stack.splice(idx);
      for (const frame of removed) {
        if (frame.block) {
          if (frame.block.runs.length || !blocks.length) blocks.push(frame.block);
          currentBlock = blockFromStack(stack);
        }
      }
      continue;
    }

    if (selfClose) continue;

    if (BLOCK_TAGS.has(tag)) {
      if (tag === "ul" || tag === "ol") {
        stack.push({ tag, delta: null });
        continue;
      }
      const attrs = parseAttrs(attrsRaw);
      const cls = parseClass(attrs.class);
      const isPageBreak = cls.isPageBreak || attrs["data-page-break"] === "true";
      if (isPageBreak) {
        if (currentBlock && currentBlock.runs.length) blocks.push(currentBlock);
        blocks.push({ align: "left", header: 0, quote: false, code: false, list: null, indent: 0, runs: [{ text: "\f" }] });
        currentBlock = null;
        continue;
      }
      const headerMatch = /^h([1-6])$/.exec(tag);
      const list = tag === "li" ? withinList() : null;
      const block = {
        align: cls.align,
        header: headerMatch ? Number(headerMatch[1]) : 0,
        quote: tag === "blockquote",
        code: tag === "pre",
        list: list ? list.type : null,
        indent: cls.indent + (list && list.depth > 1 ? list.depth - 1 : 0),
        runs: [],
      };
      currentBlock = block;
      stack.push({ tag, block, delta: inlineDeltaFor(tag, attrsRaw) });
      continue;
    }

    stack.push({ tag, delta: inlineDeltaFor(tag, attrsRaw) });
  }

  for (const frame of stack) {
    if (frame.block && frame.block.runs.length) blocks.push(frame.block);
  }

  return blocks;
}

async function embedFonts(doc) {
  const loaded = {};
  for (let i = 0; i < FONT_FILES.length; i++) {
    let font = null;
    for (const dir of FONT_DIRS) {
      try {
        font = await doc.embedFont(path.join(dir, FONT_FILES[i]));
        break;
      } catch {
        // try next directory
      }
    }
    loaded[VARIANTS[i]] = font;
  }
  let standardFallback = false;
  if (!loaded[""]) {
    loaded[""] = await doc.embedFont(StandardFonts.Helvetica);
    loaded["B"] = await doc.embedFont(StandardFonts.HelveticaBold);
    loaded["I"] = await doc.embedFont(StandardFonts.HelveticaOblique);
    loaded["BI"] = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
    standardFallback = true;
  }
  for (const k of VARIANTS) if (!loaded[k]) loaded[k] = loaded[""];
  return { fonts: loaded, standardFallback };
}

function sanitizeForStandardFont(text) {
  const winAnsiLatin1 = (code) => (code >= 0xa0 && code <= 0xff) || code === 0x20ac;
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    const ok =
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff && ![0x81, 0x8d, 0x8f, 0x90, 0x9d].includes(code)) ||
      [0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178].includes(code);
    out += ok ? ch : (winAnsiLatin1(code) ? ch : "?");
  }
  return out;
}

function chooseFont(run) {
  const key = (run.bold ? "B" : "") + (run.italic ? "I" : "");
  return fonts[key] || fonts[""];
}

function runSize(run, baseSize) {
  return Math.max(6, Math.round(baseSize * HEADER_SCALE[run.header || 0] * (run.factor || 1)));
}

function buildLines(runs, baseSize, maxWidth) {
  const tokens = [];
  for (const run of runs) {
    if (run.break) {
      tokens.push({ type: "break" });
      continue;
    }
    const parts = String(run.text).split(/([ \t\u00A0]+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^[ \t\u00A0]+$/.test(part)) tokens.push({ type: "space", count: part.length, run });
      else tokens.push({ type: "word", text: part, run });
    }
  }

  const lines = [];
  let words = [];
  let width = 0;
  let pendingSpace = 0;
  let maxSize = 0;

  const pushWord = (text, run, size, w) => {
    if (words.length && pendingSpace) {
      words.push({ space: true, width: pendingSpace, size });
      width += pendingSpace;
    }
    words.push({ text, run, size, width: w });
    width += w;
    maxSize = Math.max(maxSize, size);
    pendingSpace = 0;
  };

  const flush = () => {
    if (!words.length) {
      pendingSpace = 0;
      return;
    }
    lines.push({ words, width, maxSize });
    words = [];
    width = 0;
    pendingSpace = 0;
    maxSize = 0;
  };

  const measure = (text, run, size) => chooseFont(run).widthOfTextAtSize(text, size);

  const addWord = (text, run, size) => {
    const w = measure(text, run, size);
    if (w <= maxWidth) {
      pushWord(text, run, size, w);
      return;
    }
    let chunk = "";
    for (const ch of text) {
      const cw = measure(ch, run, size);
      const chunkW = chunk ? measure(chunk, run, size) : 0;
      if (chunk && width + pendingSpace + chunkW + cw > maxWidth) break;
      chunk += ch;
    }
    if (!chunk.length) chunk = text.slice(0, Math.max(1, Math.floor(maxWidth / (measure(text[0], run, size) || 1))));
    pushWord(chunk, run, size, measure(chunk, run, size));
    const rest = text.slice(chunk.length);
    if (rest) {
      flush();
      addWord(rest, run, size);
    }
  };

  for (const token of tokens) {
    if (token.type === "break") {
      flush();
      continue;
    }
    const size = runSize(token.run, baseSize);
    if (token.type === "space") {
      if (!words.length) continue;
      pendingSpace = measure(" ", token.run, size) * token.count;
      continue;
    }
    if (words.length && width + pendingSpace + measure(token.text, token.run, size) > maxWidth) flush();
    addWord(token.text, token.run, size);
  }
  flush();
  if (lines.length) lines[lines.length - 1].last = true;
  return lines;
}

function normalizeBlocks(blocks) {
  const hasMarker = blocks.some((block) => block.runs.some((run) => String(run.text).includes("\f")));
  if (!hasMarker) return blocks;
  const out = [];
  let pendingBreak = false;
  const pushText = (block, runs) => {
    if (!runs.length) return;
    out.push({ ...block, runs, pageBreakBefore: pendingBreak });
    pendingBreak = false;
  };
  for (const block of blocks) {
    if (!block.runs.some((run) => String(run.text).includes("\f"))) {
      pushText(block, block.runs);
      continue;
    }
    let runs = [];
    let hadBreak = false;
    for (const run of block.runs) {
      const text = String(run.text);
      if (!text.includes("\f")) {
        runs.push(run);
        continue;
      }
      const parts = text.split("\f");
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) runs.push({ ...run, text: parts[i] });
        if (i < parts.length - 1) {
          pushText(block, runs);
          runs = [];
          pendingBreak = true;
          hadBreak = true;
        }
      }
    }
    if (runs.length) pushText(block, runs);
    else if (hadBreak) pendingBreak = true;
  }
  return out;
}

function wordColor(c) {
  if (Array.isArray(c)) return rgb(c[0], c[1], c[2]);
  return rgb(0.1, 0.1, 0.1);
}

function drawLine({ page, line, pageW, maxWidth, margin, indent, y, block, listCounter, standardFallback }) {
  const avail = maxWidth - indent;
  let x = margin + indent;
  if (block.align === "center") {
    x = margin + Math.max(0, (maxWidth - line.width) / 2);
  } else if (block.align === "right") {
    x = margin + Math.max(0, maxWidth - line.width);
  }

  let spaceGap = 0;
  if (block.align === "justify" && !line.last) {
    const spaces = line.words.filter((w) => w.space).length;
    if (spaces > 0 && line.width < avail) spaceGap = Math.min((avail - line.width) / spaces, 20);
  }

  const markerIndent = block.indent * 18 + (block.quote || block.code ? 16 : 0);
  if (block.list) {
    const font = block.list === "ol" ? fonts["B"] || fonts[""] : fonts[""];
    const marker = block.list === "ol" ? `${listCounter}.` : "\u2022";
    const markerText = standardFallback ? sanitizeForStandardFont(marker) : marker;
    const markerSize = Math.max(10, Math.min(12, line.maxSize * 0.9));
    page.drawText(markerText, {
      x: margin + markerIndent,
      y: y + (markerSize - line.maxSize) * 0.25,
      size: markerSize,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
  }

  for (const word of line.words) {
    if (word.space) {
      const font = chooseFont(word.run || {});
      const baseSpace = font.widthOfTextAtSize(" ", word.size || line.maxSize);
      if (spaceGap > 0 && baseSpace > 0) {
        const drawSize = ((word.size || line.maxSize) * (baseSpace + spaceGap)) / baseSpace;
        page.drawText(" ", { x, y, size: drawSize, font });
        x += baseSpace + spaceGap;
      } else {
        x += word.width;
      }
      continue;
    }
    const font = chooseFont(word.run);
    const size = word.size;
    const text = standardFallback ? sanitizeForStandardFont(word.text) : word.text;
    const color = wordColor(word.run.color);

    if (word.run.bg) {
      page.drawRectangle({
        x,
        y: y - size * 0.18,
        width: word.width,
        height: size * 1.0,
        color: wordColor(word.run.bg),
      });
    }

    page.drawText(text, { x, y, size, font, color });

    if (word.run.underline) {
      page.drawRectangle({ x, y: y - 1.4, width: word.width, height: 0.8, color });
    }
    if (word.run.strike) {
      page.drawRectangle({ x, y: y + size * 0.3, width: word.width, height: 0.7, color });
    }

    x += word.width;
  }
}

async function richTextToPdf(html, options = {}) {
  const title = typeof options.title === "string" && options.title.trim() ? options.title.trim() : "Document";
  const author = typeof options.author === "string" && options.author.trim() ? options.author.trim() : "PDFForge";
  const [pageW, pageH] = PAGE_SIZES[options.pageSize] || PAGE_SIZES.a4;
  const baseSize = Number.isFinite(options.fontSize) && options.fontSize > 0 ? options.fontSize : 11;
  const lineSpacing = Number.isFinite(options.lineSpacing) && options.lineSpacing >= 1 ? options.lineSpacing : 1.45;
  const margin = Number.isFinite(options.margin) && options.margin >= 0 ? options.margin : 56;
  const showPageNumbers = options.pageNumbers !== false;

  const doc = await PDFDocument.create();
  const family = await embedFonts(doc);
  fonts = family.fonts;
  const standardFallback = family.standardFallback;

  const blocks = normalizeBlocks(parseHtml(html));
  if (!blocks.length) blocks.push({ align: "left", header: 0, quote: false, code: false, list: null, indent: 0, runs: [] });

  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin - baseSize;
  let listCounter = 0;

  const newPage = () => {
    page = doc.addPage([pageW, pageH]);
    y = pageH - margin - baseSize;
  };

  const maxWidth = pageW - margin * 2;

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    if (block.pageBreakBefore) newPage();
    if (block.hr) {
      y -= 8;
      if (y < margin) newPage();
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageW - margin, y },
        thickness: 0.75,
        color: rgb(0.8, 0.8, 0.8),
      });
      y -= 12;
      continue;
    }
    if (block.list === "ol") listCounter += 1;
    else if (!block.list) listCounter = 0;

    const runs = block.runs.map((run) => ({ ...run, header: block.header }));
    const indent = (block.list ? 14 : 0) + block.indent * 18 + (block.quote || block.code ? 16 : 0);
    const wrapWidth = maxWidth - indent > 24 ? maxWidth - indent : maxWidth;
    const lines = buildLines(runs, baseSize, wrapWidth);
    if (!lines.length) lines.push({ words: [], width: 0, maxSize: baseSize, last: true });

    const blockGap = Math.round(baseSize * (block.header ? 0.7 : 0.45));
    for (const line of lines) {
      const lineHeight = Math.ceil((line.maxSize || baseSize) * lineSpacing);
      if (y - lineHeight < margin) newPage();
      drawLine({ page, line, pageW, maxWidth, margin, indent, y, block, listCounter, standardFallback });
      y -= lineHeight;
    }
    y -= blockGap;
  }

  if (showPageNumbers) {
    const total = doc.getPageCount();
    const font = fonts[""];
    for (let i = 0; i < total; i++) {
      const p = doc.getPage(i);
      const label = standardFallback ? sanitizeForStandardFont(`Page ${i + 1} of ${total}`) : `Page ${i + 1} of ${total}`;
      const w = font.widthOfTextAtSize(label, 8);
      p.drawText(label, { x: (pageW - w) / 2, y: 24, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    }
  }

  doc.setTitle(title);
  doc.setAuthor(author);
  doc.setCreator("PDFForge Desktop");
  doc.setProducer("pdf-lib");
  doc.setSubject("Created with PDFForge Desktop");

  return doc.save();
}

async function richToPdf(html, options = {}) {
  try {
    return await richTextToPdf(html, options);
  } catch {
    const plain = String(html || "")
      .replace(/(<[^>]+>|&nbsp;|&amp;|&lt;|&gt;)/g, (m) => (m === "&nbsp;" ? " " : m === "&amp;" ? "&" : m === "&lt;" ? "<" : m === "&gt;" ? ">" : " "))
      .replace(/[ \t]+/g, " ");
    return textToPdf(plain, options);
  }
}

module.exports = { richToPdf };