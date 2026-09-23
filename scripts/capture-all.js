const { app, BrowserWindow, nativeTheme } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");

const RENDERER_DIR = path.join(__dirname, "..", "renderer");
const PDFJS_BUILD_DIR = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "build");
const PDFJS_WEB_DIR = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "web");
const QUILL_DIR = path.join(__dirname, "..", "node_modules", "quill", "dist");

const { protocol, net } = require("electron");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function registerProtocol() {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "renderer") {
      return new Response("Not found", { status: 404 });
    }
    const pathname = decodeURIComponent(url.pathname);
    let filePath;
    if (pathname.startsWith("/pdfjs/")) {
      filePath = path.join(PDFJS_BUILD_DIR, path.basename(pathname));
    } else if (pathname.startsWith("/pdfjs-web/")) {
      filePath = path.join(PDFJS_WEB_DIR, pathname.substring("/pdfjs-web/".length));
    } else if (pathname.startsWith("/quill/")) {
      filePath = path.join(QUILL_DIR, path.basename(pathname));
    } else {
      filePath = path.join(RENDERER_DIR, pathname.replace(/^\//, ""));
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function makeTestPdf() {
  const objects = {
    "1": "<< /Type /Catalog /Pages 2 0 R >>",
    "2": "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "3": "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "4": "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  };
  const content = "BT /F1 28 Tf 60 720 Td (PDFForge Viewer - Modern System App) Tj /F1 14 Tf 0 -40 Td (High quality layout, smooth typography, glitch-free UI) Tj ET\n";
  objects["5"] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`;

  const header = Buffer.from("%PDF-1.4\n");
  let body = header;
  const offsets = {};
  for (const id of ["1", "2", "3", "4", "5"]) {
    offsets[id] = body.length;
    body = Buffer.concat([body, Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`)]);
  }
  const xrefPos = body.length;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (const id of ["1", "2", "3", "4", "5"]) {
    xref += String(offsets[id]).padStart(10, "0") + " 00000 n \n";
  }
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.concat([body, Buffer.from(xref), Buffer.from(trailer)]);
}

app.whenReady().then(async () => {
  registerProtocol();

  const { ipcMain } = require("electron");
  ipcMain.handle("app:get-info", async () => ({
    name: "PDFForge Viewer",
    version: "1.1.0",
    electron: process.versions.electron || "",
    chrome: process.versions.chrome || "",
    node: process.versions.node || "",
    v8: process.versions.v8 || "",
    platform: "win32",
    arch: "x64",
    osVersion: "10.0.26200",
  }));
  ipcMain.handle("app:get-theme", () => "dark");
  ipcMain.handle("app:set-theme", (_event, theme) => {
    nativeTheme.themeSource = theme;
    return true;
  });

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    backgroundColor: "#202020",
    webPreferences: {
      preload: path.join(__dirname, "..", "electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await win.loadURL("app://renderer/index.html");
  await new Promise((r) => setTimeout(r, 1200));

  // Ensure dark theme at start
  await win.webContents.executeJavaScript(`
    localStorage.setItem("viewer-theme", "dark");
    document.documentElement.dataset.theme = "dark";
  `);
  await new Promise((r) => setTimeout(r, 400));

  // Capture Home / Empty screen
  let img = await win.capturePage();
  await fs.writeFile(path.join(__dirname, "..", "screenshots", "current-home.png"), img.toPNG());
  console.log("Saved current-home.png");

  // Open About Modal
  await win.webContents.executeJavaScript("document.getElementById('btn-about').click()");
  await new Promise((r) => setTimeout(r, 600));
  img = await win.capturePage();
  await fs.writeFile(path.join(__dirname, "..", "screenshots", "current-about.png"), img.toPNG());
  console.log("Saved current-about.png");

  // Close About Modal
  await win.webContents.executeJavaScript("document.getElementById('btn-about-close').click()");
  await new Promise((r) => setTimeout(r, 300));

  // Open PDF Document
  win.webContents.send("open-file", {
    name: "Sample Document.pdf",
    data: new Uint8Array(makeTestPdf()),
  });
  await new Promise((r) => setTimeout(r, 1500));
  img = await win.capturePage();
  await fs.writeFile(path.join(__dirname, "..", "screenshots", "current-viewer.png"), img.toPNG());
  console.log("Saved current-viewer.png");

  // Open Word Editor
  await win.webContents.executeJavaScript("document.getElementById('btn-new').click()");
  await new Promise((r) => setTimeout(r, 1000));
  img = await win.capturePage();
  await fs.writeFile(path.join(__dirname, "..", "screenshots", "current-editor.png"), img.toPNG());
  console.log("Saved current-editor.png");

  // Now switch to Light Theme deterministically
  await win.webContents.executeJavaScript(`
    localStorage.setItem("viewer-theme", "light");
    document.documentElement.dataset.theme = "light";
    document.body.offsetHeight;
  `);
  await new Promise((r) => setTimeout(r, 600));
  img = await win.capturePage();
  await fs.writeFile(path.join(__dirname, "..", "screenshots", "current-light-editor.png"), img.toPNG());
  console.log("Saved current-light-editor.png");

  // Light theme home: close editor and open tabs to show clean empty home
  await win.webContents.executeJavaScript(`
    window.confirm = () => true;
    const editorClose = document.getElementById('btn-editor-close');
    if (editorClose) editorClose.click();
  `);
  await new Promise((r) => setTimeout(r, 400));

  await win.webContents.executeJavaScript(`
    window.confirm = () => true;
    const closes = Array.from(document.querySelectorAll('.chrome-tab-close'));
    for (const c of closes) {
      try { c.click(); } catch {}
    }
  `);
  await new Promise((r) => setTimeout(r, 600));
  img = await win.capturePage();
  await fs.writeFile(path.join(__dirname, "..", "screenshots", "current-light-home.png"), img.toPNG());
  console.log("Saved current-light-home.png");

  app.exit(0);
});
