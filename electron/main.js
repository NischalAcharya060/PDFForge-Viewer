const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { textToPdf } = require("./text-to-pdf");
const { richToPdf } = require("./rich-to-pdf");
const { PDFDocument } = require("pdf-lib");

const SMOKE = process.argv.includes("--smoke") || process.env.PDFVIEWER_SMOKE === "1";

let mainWindow = null;
let pendingFile = null;

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

const RENDERER_DIR = path.join(__dirname, "..", "renderer");
const PDFJS_BUILD_DIR = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "build");
const PDFJS_WEB_DIR = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "web");
const QUILL_DIR = path.join(__dirname, "..", "node_modules", "quill", "dist");

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
    
    // Simple directory traversal check
    if (filePath.includes("..")) {
        return new Response("Forbidden", { status: 403 });
    }

    const allowed =
      filePath === RENDERER_DIR ||
      filePath.startsWith(RENDERER_DIR + path.sep) ||
      (filePath.startsWith(PDFJS_BUILD_DIR + path.sep) && pathname.startsWith("/pdfjs/")) ||
      (filePath.startsWith(PDFJS_WEB_DIR + path.sep) && pathname.startsWith("/pdfjs-web/")) ||
      (filePath.startsWith(QUILL_DIR + path.sep) && pathname.startsWith("/quill/"));
      
    if (!allowed) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function sendReadyFile(filePath) {
  fs.readFile(filePath)
    .then((buf) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send("open-file", {
        name: path.basename(filePath),
        path: filePath,
        data: new Uint8Array(buf),
      });
    })
    .catch(() => {});
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#101318" : "#f2f3f5",
    show: false,
    icon: path.join(__dirname, "..", "assets", "brand-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.setMenuBarVisibility(true);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("console-message", (_event, _level, message) => {
    console.log("[RENDERER]", message);
  });

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

function buildMenu() {
  const send = (cmd) => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.send("menu:command", cmd) : null);
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "New Tab", accelerator: "CmdOrCtrl+T", click: () => send("new-tab") },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: () => send("close-tab") },
        { type: "separator" },
        { label: "New Document…", accelerator: "CmdOrCtrl+N", click: () => send("new-text-file") },
        { label: "Open PDF…", accelerator: "CmdOrCtrl+O", click: () => send("open") },
        { label: "Save Document as PDF…", accelerator: "CmdOrCtrl+S", click: () => send("save-pdf") },
        { type: "separator" },
        { label: "Print…", accelerator: "CmdOrCtrl+P", click: () => send("print") },
        { label: "Document Properties…", accelerator: "CmdOrCtrl+D", click: () => send("properties") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Zoom In", accelerator: "CmdOrCtrl+=", click: () => send("zoom-in") },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => send("zoom-out") },
        { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: () => send("actual-size") },
        { label: "Fit to Width", click: () => send("fit-width") },
        { label: "Fit to Page", click: () => send("fit-page") },
        { label: "Two-Page View", accelerator: "CmdOrCtrl+Alt+2", click: () => send("toggle-two-page") },
        { label: "Split View", accelerator: "CmdOrCtrl+Alt+S", click: () => send("toggle-split-view") },
        { type: "separator" },
        { label: "Next Tab", accelerator: "Ctrl+Tab", click: () => send("next-tab") },
        { label: "Previous Tab", accelerator: "Ctrl+Shift+Tab", click: () => send("prev-tab") },
        { type: "separator" },
        { label: "Rotate Clockwise", accelerator: "CmdOrCtrl+R", click: () => send("rotate") },
        { type: "separator" },
        { label: "Toggle Thumbnails", click: () => send("toggle-thumbnails") },
        { label: "Toggle Dark Mode", click: () => send("toggle-theme") },
        { type: "separator" },
        { role: "forceReload", accelerator: "CmdOrCtrl+Shift+R" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find…",
          accelerator: "CmdOrCtrl+F",
          click: () => send("find"),
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "Keyboard Shortcuts", accelerator: "F1", click: () => send("shortcuts") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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

async function runSmoke() {
  const poll = async (fn, timeout) => {
    const start = Date.now();
    for (;;) {
      try {
        const v = await fn();
        if (v) return v;
      } catch {
        // keep polling
      }
      if (Date.now() - start > timeout) return null;
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  mainWindow.webContents.on("console-message", (event) => {
    const message = typeof event.message === "string" ? event.message : event;
    console.log("[renderer]", message);
  });
  try {
    const ready = await poll(() => mainWindow.webContents.executeJavaScript("Boolean(window.__pdfViewerReady)"), 15000);
    if (!ready) throw new Error("renderer did not become ready");

    const smokeFile = process.env.PDFVIEWER_SMOKE_FILE;
    const expectedPages = process.env.PDFVIEWER_SMOKE_PAGES;
    if (smokeFile) {
      const buf = await fs.readFile(smokeFile);
      mainWindow.webContents.send("open-file", {
        name: path.basename(smokeFile),
        data: new Uint8Array(buf),
      });
    } else if (!expectedPages) {
      mainWindow.webContents.send("open-file", {
        name: "smoke.pdf",
        data: new Uint8Array(makeTestPdf()),
      });
    }

    const expect = `of ${expectedPages || "1"}`;
    const ok = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          `document.getElementById('page-indicator').textContent.includes('${expect}') && ` +
            "document.querySelector('.pdf-canvas').width > 0"
        ),
      20000
    );
    if (!ok) {
      const diag = await mainWindow.webContents.executeJavaScript(
        "JSON.stringify({ err: document.getElementById('error-message').textContent, " +
          "pages: document.querySelectorAll('.pdf-page').length, " +
          "globalErr: window.__pdfViewerError || null, " +
          "indicator: document.getElementById('page-indicator').textContent })"
      );
      console.error("[smoke] diagnostics:", diag);
      throw new Error("document did not render (indicator or canvas failed)");
    }
    const thumbs = await mainWindow.webContents.executeJavaScript(
      "document.querySelectorAll('.thumb').length"
    );
    if (thumbs !== Number(expectedPages || 1)) {
      throw new Error(`expected ${expectedPages} thumbnails, found ${thumbs}`);
    }
    const allThumbsRendered = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          "document.querySelectorAll('.thumb canvas').length === " +
            (expectedPages || 1) +
            " && Array.from(document.querySelectorAll('.thumb canvas')).every((c) => c.width > 0 && c.height > 0)"
        ),
      10000
    );
    console.log("[smoke] all thumbnails rendered:", Boolean(allThumbsRendered));
    if (!allThumbsRendered) throw new Error("thumbnails failed to render");

    const allViewerPagesRendered = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          "document.querySelectorAll('#page-host .pdf-canvas').length === " +
            (expectedPages || 1) +
            " && Array.from(document.querySelectorAll('#page-host .pdf-canvas')).every((c) => c.width > 0)"
        ),
      10000
    );
    console.log("[smoke] all viewer pages rendered:", Boolean(allViewerPagesRendered));
    if (!allViewerPagesRendered) throw new Error("viewer pages failed to render");
    const editorOpened = await mainWindow.webContents.executeJavaScript(
      "document.getElementById('btn-new').click(); true"
    );
    const editorOk = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          "!document.getElementById('editor-view').hidden && " +
            "!!document.querySelector('#editor-content .ql-editor') && " +
            "typeof window.Quill === 'function'"
        ),
      15000
    );
    if (!editorOk) {
      throw new Error("editor did not initialize");
    }
    const wordElementsOk = await mainWindow.webContents.executeJavaScript(
      "Boolean(document.getElementById('quill-toolbar') && " +
        "document.getElementById('word-workspace') && " +
        "document.getElementById('word-page-sheet') && " +
        "document.getElementById('editor-name-input') && " +
        "document.getElementById('btn-insert-page-break'))"
    );
    console.log("[smoke] word elements ok:", wordElementsOk);
    if (!wordElementsOk) throw new Error("Word UI elements missing");
    const seeded = await mainWindow.webContents.executeJavaScript(
      "window.__quill.setContents([{ insert: 'Hello ', attributes: { bold: true } }, { insert: 'World! Great day.' }]); " +
        "window.__quill.formatLine(0, 1, 'align', 'center'); " +
        "window.__quill.getSemanticHTML();"
    );
    console.log("[smoke] rich html:", seeded);
    const pageBreakSeed = await mainWindow.webContents.executeJavaScript(
      "(() => { window.__quill.setText('Intro text.\\n\\f\\nSecond page text.'); return window.__quill.getSemanticHTML(); })()"
    );
    console.log("[smoke] page break html:", pageBreakSeed);
    const tabsOk = await mainWindow.webContents.executeJavaScript(
      "Boolean(document.getElementById('tab-bar') && " +
        "document.getElementById('btn-new-tab') && " +
        "document.getElementById('btn-split-view') && " +
        "document.getElementById('btn-two-page') && " +
        "document.getElementById('btn-add-page') && " +
        "document.querySelectorAll('.chrome-tab').length >= 1)"
    );
    console.log("[smoke] tabs and layout controls ok:", tabsOk);
    if (!tabsOk) throw new Error("Chrome tab bar or layout controls missing");

    mainWindow.webContents.executeJavaScript("document.title").then((title) => console.log("[smoke] title:", title));
    console.log("[smoke] PASS");
    app.exit(0);
  } catch (err) {
    console.error("[smoke] FAIL:", err && err.message);
    app.exit(1);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    firstPdfArg(argv).then((p) => {
      if (p) {
        if (mainWindow) sendReadyFile(p);
        else pendingFile = p;
      }
    });
  });

  app.whenReady().then(async () => {
    nativeTheme.themeSource = "system";
    registerProtocol();

    ipcMain.handle("dialog:open-pdf", async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Open PDF",
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "PDF documents", extensions: ["pdf"] }],
      });
      if (result.canceled || !result.filePaths.length) return { canceled: true };
      const files = [];
      for (const filePath of result.filePaths) {
        const data = await fs.readFile(filePath);
        files.push({ name: path.basename(filePath), path: filePath, data: new Uint8Array(data) });
      }
      return {
        canceled: false,
        files,
        name: files[0].name,
        path: files[0].path,
        data: files[0].data,
      };
    });

    ipcMain.handle("pdf:add-blank-page", async (_event, pdfData) => {
      try {
        const doc = await PDFDocument.load(pdfData);
        const count = doc.getPageCount();
        const [w, h] = count > 0 ? [doc.getPage(count - 1).getWidth(), doc.getPage(count - 1).getHeight()] : [595.28, 841.89];
        doc.addPage([w, h]);
        const modified = await doc.save();
        return { success: true, data: new Uint8Array(modified) };
      } catch (err) {
        return { success: false, error: err && err.message ? err.message : String(err) };
      }
    });

    ipcMain.handle("pdf:append-pdf", async (_event, { baseData, appendData }) => {
      try {
        const doc = await PDFDocument.load(baseData);
        const donor = await PDFDocument.load(appendData);
        const indices = donor.getPageIndices();
        const copied = await doc.copyPages(donor, indices);
        for (const p of copied) {
          doc.addPage(p);
        }
        const modified = await doc.save();
        return { success: true, data: new Uint8Array(modified) };
      } catch (err) {
        return { success: false, error: err && err.message ? err.message : String(err) };
      }
    });

    ipcMain.handle("file:read", async (_event, filePath) => {
      if (typeof filePath !== "string" || path.isAbsolute(filePath) !== true) {
        throw new Error("Invalid path");
      }
      const data = await fs.readFile(filePath);
      return { name: path.basename(filePath), data: new Uint8Array(data) };
    });

    ipcMain.handle("dialog:create-text-pdf", async (_event, payload) => {
      const text = typeof payload?.text === "string" ? payload.text : "";
      const suggested = typeof payload?.suggestedName === "string" ? payload.suggestedName : "document";
      const base = suggested.replace(/\.(pdf|txt)$/i, "") || "document";
      const opts = payload?.options && typeof payload.options === "object" ? payload.options : {};
      const fontSize = Number.isFinite(opts.fontSize) && opts.fontSize > 0 ? opts.fontSize : 11;
      const lineSpacing = Number.isFinite(opts.lineSpacing) && opts.lineSpacing >= 1 ? opts.lineSpacing : 1.45;
      const margin = Number.isFinite(opts.margin) && opts.margin >= 0 ? opts.margin : 56;
      const title = typeof opts.title === "string" && opts.title.trim() ? opts.title.trim() : base;
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Save as PDF",
        defaultPath: `${base}.pdf`,
        filters: [{ name: "PDF documents", extensions: ["pdf"] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      const pdfOptions = {
        pageSize: opts.pageSize === "letter" ? "letter" : "a4",
        fontSize,
        lineSpacing,
        lineHeight: Math.round(fontSize * lineSpacing),
        margin,
        pageNumbers: opts.pageNumbers !== false,
        title,
        author: opts.author,
      };
      const data = payload?.rich === true ? await richToPdf(text, pdfOptions) : await textToPdf(text, pdfOptions);
      await fs.writeFile(result.filePath, Buffer.from(data));
      return { canceled: false, filePath: result.filePath };
    });

    ipcMain.handle("app:set-theme", (_event, theme) => {
      if (theme === "light" || theme === "dark" || theme === "system") nativeTheme.themeSource = theme;
    });

    ipcMain.handle("app:get-theme", () => (nativeTheme.shouldUseDarkColors ? "dark" : "light"));

    mainWindow = createWindow();
    buildMenu();

    const first = await firstPdfArg(process.argv);
    if (first) pendingFile = first;

    mainWindow.webContents.once("did-finish-load", () => {
      if (pendingFile) {
        const p = pendingFile;
        pendingFile = null;
        sendReadyFile(p);
      }
      if (SMOKE) runSmoke();
    });

    await mainWindow.loadURL("app://renderer/index.html");
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
}