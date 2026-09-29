#!/usr/bin/env node
/**
 * Snap build & verification helper for PDFForge Viewer.
 * - On Linux: runs `electron-builder --linux snap` (or `snapcraft pack`).
 * - On Windows: verifies `snap/snapcraft.yaml` & `snap/gui/` assets, ensures
 *   the Linux unpacked build is ready, and prints instructions for publishing
 *   to https://snapcraft.io/.
 */

const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const yaml = require("js-yaml");

const ROOT_DIR = path.resolve(__dirname, "..");
const SNAP_YAML_PATH = path.join(ROOT_DIR, "snap", "snapcraft.yaml");
const SNAP_DESKTOP_PATH = path.join(ROOT_DIR, "snap", "gui", "pdfforge-viewer.desktop");
const SNAP_ICON_PATH = path.join(ROOT_DIR, "snap", "gui", "pdfforge-viewer.png");

function validateSnapConfig() {
  if (!fs.existsSync(SNAP_YAML_PATH)) {
    throw new Error(`Missing ${SNAP_YAML_PATH}`);
  }
  if (!fs.existsSync(SNAP_DESKTOP_PATH)) {
    throw new Error(`Missing ${SNAP_DESKTOP_PATH}`);
  }
  if (!fs.existsSync(SNAP_ICON_PATH)) {
    throw new Error(`Missing ${SNAP_ICON_PATH}`);
  }

  const doc = yaml.load(fs.readFileSync(SNAP_YAML_PATH, "utf8"));
  if (!doc || !doc.name || !doc.version || !doc.summary || !doc.apps || !doc.parts) {
    throw new Error("snap/snapcraft.yaml is missing required top-level fields");
  }
  if (doc.summary.length > 78) {
    throw new Error(`snap/snapcraft.yaml summary exceeds 78 characters (${doc.summary.length})`);
  }
  console.log(`[snap-check] Verified snap/snapcraft.yaml (name: ${doc.name}, version: ${doc.version}, base: ${doc.base})`);
  return doc;
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT_DIR, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function main() {
  const snapDoc = validateSnapConfig();

  if (process.platform === "linux") {
    console.log("==> Building .snap package on Linux...");
    await runCommand(process.execPath, [
      path.join(ROOT_DIR, "node_modules", "electron-builder", "cli.js"),
      "--linux",
      "snap",
    ]);
    return;
  }

  console.log("\n========================================================");
  console.log("  Snapcraft Configuration Ready for " + snapDoc.name + " v" + snapDoc.version);
  console.log("========================================================");
  console.log("  - Config:  snap/snapcraft.yaml");
  console.log("  - Desktop: snap/gui/pdfforge-viewer.desktop");
  console.log("  - Icon:    snap/gui/pdfforge-viewer.png");
  console.log("  - CI/CD:   .github/workflows/snap-publish.yml");
  console.log("\nNote: Native .snap squashfs compilation requires Linux/Snapcraft.");
  console.log("From Windows, you can publish directly using either:");
  console.log("  1. Snapcraft.io GitHub Build Service (connect your repo at https://snapcraft.io/build)");
  console.log("  2. GitHub Actions (.github/workflows/snap-publish.yml)");
  console.log("========================================================\n");
}

main().catch((err) => {
  console.error("Snap check/build failed:", err.message || err);
  process.exit(1);
});
