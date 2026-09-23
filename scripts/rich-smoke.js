const fs = require("node:fs");
const path = require("node:path");
const { richToPdf } = require("../electron/rich-to-pdf");

const html = [
  "<h1>PDFForge rich text test</h1>",
  '<p class="ql-align-center">This&nbsp;line&nbsp;is&nbsp;centered&nbsp;and&nbsp;wraps&nbsp;onto&nbsp;multiple&nbsp;lines&nbsp;so&nbsp;we&nbsp;can&nbsp;see&nbsp;wrapping&nbsp;still&nbsp;works&nbsp;with&nbsp;non-breaking&nbsp;space&nbsp;characters.</p>',
  "<p><strong>Bold</strong> and <em>italic</em>, <u>underlined</u> and <s>struck</s> text with ",
  '<span style="color: rgb(200, 20, 20);">colored</span> and extra <span style="font-size: 16pt;">16pt font size</span> words.</p>',
  '<p class="ql-align-right">Right aligned line here.</p>',
  '<p class="ql-align-justify">Justified paragraph. The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.</p>',
  "<hr>",
  "<h2>Things to do</h2>",
  '<ol><li>First numbered item.</li><li>Second numbered item with a fairly long description that wraps onto another line to test hanging alignment.</li></ol>',
  '<ul><li>A bullet point.</li><li>Another bullet point.</li></ul>',
  '<blockquote>A quoted paragraph that should be indented from the margins on both sides to look like a citation block.</blockquote>',
  '<p>Final paragraph before a Word page break.</p>',
  '<div class="word-page-break"><span>Page Break</span></div>',
  '<p>This paragraph starts on a fresh page after a Word page break.</p>',
].join("");

async function main() {
  const bytes = await richToPdf(html, {
    title: "Rich Test",
    author: "QA",
    pageSize: "a4",
    fontSize: 11,
    lineSpacing: 1.45,
    margin: 56,
    pageNumbers: true,
  });
  const out = path.join(__dirname, "..", "rich-smoke.pdf");
  fs.writeFileSync(out, bytes);
  console.log(`rich-smoke OK: ${bytes.length} bytes -> ${out}`);
}

main().catch((err) => {
  console.error("rich-smoke FAIL:", err);
  process.exit(1);
});