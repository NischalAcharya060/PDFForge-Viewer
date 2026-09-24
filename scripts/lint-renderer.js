const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "renderer");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

(async () => {
  const files = walk(ROOT);
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pdfviewer-lint-"));
  let failed = 0;
  let index = 0;
  try {
    for (const file of files) {
      const src = await fsp.readFile(file, "utf8");
      const tmp = path.join(tmpDir, `chk${index++}.mjs`);
      await fsp.writeFile(tmp, src);
      const res = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
      if (res.status !== 0) {
        failed++;
        console.error(`[lint-renderer] ${path.relative(ROOT, file)}`);
        const detail = (res.stderr || res.stdout || "").trim();
        for (const line of detail.split("\n")) {
          const trimmed = line.trim();
          if (/^\s*\(?\d+:\d+\)?/.test(trimmed) || /Error|SyntaxError/.test(trimmed)) {
            console.error("  " + trimmed);
          }
        }
      }
    }
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
  if (failed) {
    console.error(`[lint-renderer] ${failed}/${files.length} renderer files failed syntax check.`);
    process.exit(1);
  }
  console.log(`[lint-renderer] ${files.length} renderer files OK.`);
})();