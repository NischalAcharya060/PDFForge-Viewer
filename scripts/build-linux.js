#!/usr/bin/env node
/**
 * Cross-platform Linux builder for PDFForge Viewer.
 * - On Linux / macOS: runs `electron-builder --linux AppImage deb tar.gz`
 * - On Windows: packages the Linux x64 build via `electron-builder --linux dir`
 *   and produces both `dist/PDFForge-<version>-linux-x64.tar.gz` and
 *   `dist/PDFForge-Setup-<version>-amd64.deb` with proper POSIX permissions.
 */

const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const { spawn } = require("node:child_process");
const tar = require("tar");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));

const EXECUTABLE_NAMES = new Set([
  "pdfforge-viewer",
  "chrome-sandbox",
  "chrome_crashpad_handler",
  "install.sh",
  "postinst",
  "postrm",
]);

function isExecutableFile(filePath) {
  const base = path.basename(filePath);
  if (EXECUTABLE_NAMES.has(base)) return true;
  if (base.endsWith(".sh") || base.endsWith(".so") || /\.so\.\d+/.test(base)) return true;
  return false;
}

function runElectronBuilder(args) {
  return new Promise((resolve, reject) => {
    const cliJs = path.join(ROOT_DIR, "node_modules", "electron-builder", "cli.js");
    const child = spawn(process.execPath, [cliJs, ...args], {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`electron-builder exited with code ${code}`));
    });
  });
}

async function getDirectorySizeKB(dirPath) {
  let totalBytes = 0;
  async function walk(curr) {
    const entries = await fsp.readdir(curr, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(curr, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const st = await fsp.stat(full);
        totalBytes += st.size;
      }
    }
  }
  await walk(dirPath);
  return Math.ceil(totalBytes / 1024);
}

function createArHeader(name, size, mtimeSec, mode = 0o100644) {
  const header = Buffer.alloc(60, 0x20); // space-filled
  header.write(name.slice(0, 16), 0, "ascii");
  header.write(String(mtimeSec).slice(0, 12), 16, "ascii");
  header.write("0", 28, "ascii"); // uid
  header.write("0", 34, "ascii"); // gid
  header.write(mode.toString(8), 40, "ascii");
  header.write(String(size), 48, "ascii");
  header.write("`\n", 58, "ascii");
  return header;
}

function buildArArchive(members) {
  const chunks = [Buffer.from("!<arch>\n", "ascii")];
  const nowSec = Math.floor(Date.now() / 1000);
  for (const member of members) {
    const data = Buffer.isBuffer(member.data) ? member.data : Buffer.from(member.data);
    chunks.push(createArHeader(member.name, data.length, nowSec, member.mode || 0o100644));
    chunks.push(data);
    if (data.length % 2 === 1) {
      chunks.push(Buffer.from("\n", "ascii"));
    }
  }
  return Buffer.concat(chunks);
}

async function createTarGzWithPosixModes(cwd, entries, outFile, prefix = "") {
  await tar.create(
    {
      file: outFile,
      cwd,
      gzip: true,
      portable: true,
      prefix: prefix || undefined,
      onWriteEntry(entry) {
        if (entry.stat) {
          if (entry.type === "Directory" || isExecutableFile(entry.path)) {
            entry.stat.mode = 0o755;
          } else {
            entry.stat.mode = 0o644;
          }
        }
      },
    },
    entries
  );
}

async function buildLinuxFromWindows() {
  console.log("==> Step 1/3: Packaging Linux x64 application via electron-builder...");
  await runElectronBuilder(["--linux", "dir", "--x64"]);

  const unpackedDir = path.join(DIST_DIR, "linux-unpacked");
  if (!fs.existsSync(unpackedDir)) {
    throw new Error(`Expected unpacked Linux directory not found at: ${unpackedDir}`);
  }

  // Write desktop file & install.sh helper into linux-unpacked for tar.gz users
  const desktopEntry = [
    "[Desktop Entry]",
    "Name=PDFForge Viewer",
    "Comment=A fast, private, offline desktop PDF viewer.",
    'Exec="/opt/PDFForge Viewer/pdfforge-viewer" %U',
    "Terminal=false",
    "Type=Application",
    "Icon=pdfforge-viewer",
    "StartupWMClass=PDFForge Viewer",
    "Categories=Office;Viewer;",
    "MimeType=application/pdf;",
    "",
  ].join("\n");

  const installScript = [
    "#!/bin/bash",
    "set -e",
    'APP_DIR="$(cd "$(dirname "$0")" && pwd)"',
    'INSTALL_DIR="/opt/PDFForge Viewer"',
    'echo "Installing PDFForge Viewer to $INSTALL_DIR..."',
    'sudo mkdir -p "$INSTALL_DIR"',
    'sudo cp -r "$APP_DIR"/* "$INSTALL_DIR/"',
    'sudo chmod +x "$INSTALL_DIR/pdfforge-viewer"',
    'sudo chmod 4755 "$INSTALL_DIR/chrome-sandbox" 2>/dev/null || true',
    'sudo ln -sf "$INSTALL_DIR/pdfforge-viewer" /usr/bin/pdfforge-viewer',
    'sudo cp "$INSTALL_DIR/pdfforge-viewer.desktop" /usr/share/applications/pdfforge-viewer.desktop',
    'sudo mkdir -p /usr/share/icons/hicolor/256x256/apps',
    'sudo cp "$INSTALL_DIR/pdfforge-viewer.png" /usr/share/icons/hicolor/256x256/apps/pdfforge-viewer.png',
    'sudo update-desktop-database /usr/share/applications 2>/dev/null || true',
    'echo "PDFForge Viewer installed successfully! Run: pdfforge-viewer"',
    "",
  ].join("\n");

  const iconSrc = path.join(ROOT_DIR, "assets", "brand-icon.png");
  await fsp.writeFile(path.join(unpackedDir, "pdfforge-viewer.desktop"), desktopEntry, "utf8");
  await fsp.writeFile(path.join(unpackedDir, "install.sh"), installScript, "utf8");
  if (fs.existsSync(iconSrc)) {
    await fsp.copyFile(iconSrc, path.join(unpackedDir, "pdfforge-viewer.png"));
  }

  // Step 2: Create .tar.gz with proper POSIX executable modes
  const tarGzName = `PDFForge-${pkg.version}-linux-x64.tar.gz`;
  const tarGzPath = path.join(DIST_DIR, tarGzName);
  console.log(`==> Step 2/3: Creating Linux archive ${tarGzName}...`);
  await fsp.rm(tarGzPath, { force: true });
  await createTarGzWithPosixModes(
    unpackedDir,
    ["."],
    tarGzPath,
    `PDFForge-Viewer-${pkg.version}-linux-x64`
  );

  // Step 3: Create Debian/Ubuntu .deb package
  const debName = `PDFForge-Setup-${pkg.version}-amd64.deb`;
  const debPath = path.join(DIST_DIR, debName);
  console.log(`==> Step 3/3: Building Debian/Ubuntu package ${debName}...`);

  const tmpStage = await fsp.mkdtemp(path.join(os.tmpdir(), "pdfforge-deb-"));
  try {
    const controlDir = path.join(tmpStage, "control");
    const dataDir = path.join(tmpStage, "data");
    const optAppDir = path.join(dataDir, "opt", "PDFForge Viewer");
    const appsDir = path.join(dataDir, "usr", "share", "applications");
    const iconsDir = path.join(dataDir, "usr", "share", "icons", "hicolor", "256x256", "apps");

    await fsp.mkdir(controlDir, { recursive: true });
    await fsp.mkdir(optAppDir, { recursive: true });
    await fsp.mkdir(appsDir, { recursive: true });
    await fsp.mkdir(iconsDir, { recursive: true });

    await fsp.cp(unpackedDir, optAppDir, { recursive: true });
    await fsp.writeFile(path.join(appsDir, "pdfforge-viewer.desktop"), desktopEntry, "utf8");
    if (fs.existsSync(iconSrc)) {
      await fsp.copyFile(iconSrc, path.join(iconsDir, "pdfforge-viewer.png"));
    }

    const installedSizeKB = await getDirectorySizeKB(dataDir);
    const controlContent = [
      "Package: pdfforge-viewer",
      `Version: ${pkg.version}`,
      "Section: utils",
      "Priority: optional",
      "Architecture: amd64",
      `Installed-Size: ${installedSizeKB}`,
      "Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1",
      `Maintainer: ${pkg.build?.linux?.maintainer || "Grdh_Ravan <Nischal060@gmail.com>"}`,
      `Homepage: ${pkg.homepage || "https://github.com/NischalAcharya060/PDFForge-Viewer"}`,
      "Description: A fast, private, offline desktop PDF viewer.",
      " PDFForge Viewer is a fast, private, 100% offline desktop PDF viewer",
      " and rich document creator.",
      "",
    ].join("\n");

    const postinstContent = [
      "#!/bin/bash",
      "set -e",
      "chmod +x '/opt/PDFForge Viewer/pdfforge-viewer' 2>/dev/null || true",
      "chmod 4755 '/opt/PDFForge Viewer/chrome-sandbox' 2>/dev/null || true",
      "ln -sf '/opt/PDFForge Viewer/pdfforge-viewer' /usr/bin/pdfforge-viewer || true",
      "update-desktop-database /usr/share/applications 2>/dev/null || true",
      "gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true",
      "",
    ].join("\n");

    const postrmContent = [
      "#!/bin/bash",
      "set -e",
      "rm -f /usr/bin/pdfforge-viewer || true",
      "update-desktop-database /usr/share/applications 2>/dev/null || true",
      "",
    ].join("\n");

    await fsp.writeFile(path.join(controlDir, "control"), controlContent, "utf8");
    await fsp.writeFile(path.join(controlDir, "postinst"), postinstContent, "utf8");
    await fsp.writeFile(path.join(controlDir, "postrm"), postrmContent, "utf8");

    const controlTarGz = path.join(tmpStage, "control.tar.gz");
    const dataTarGz = path.join(tmpStage, "data.tar.gz");

    await createTarGzWithPosixModes(controlDir, ["./control", "./postinst", "./postrm"], controlTarGz);
    await createTarGzWithPosixModes(dataDir, ["./opt", "./usr"], dataTarGz);

    const debBuffer = buildArArchive([
      { name: "debian-binary", data: Buffer.from("2.0\n", "ascii") },
      { name: "control.tar.gz", data: await fsp.readFile(controlTarGz) },
      { name: "data.tar.gz", data: await fsp.readFile(dataTarGz) },
    ]);

    await fsp.rm(debPath, { force: true });
    await fsp.writeFile(debPath, debBuffer);
  } finally {
    await fsp.rm(tmpStage, { recursive: true, force: true }).catch(() => {});
  }

  console.log("\nLinux packages generated successfully:");
  console.log(`  - ${ debPath }`);
  console.log(`  - ${ tarGzPath }`);
}

async function main() {
  if (process.platform === "win32") {
    await buildLinuxFromWindows();
  } else {
    await runElectronBuilder(["--linux", "AppImage", "deb", "tar.gz"]);
  }
}

main().catch((err) => {
  console.error("Linux build failed:", err.message || err);
  process.exit(1);
});
