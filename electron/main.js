const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { textToPdf } = require("./services/text-to-pdf");
const { richToPdf } = require("./services/rich-to-pdf");
const { looksLikePdf, firstPdfArg, resolveLaunchTarget } = require('./utils/pdf-helpers');
const { PDFDocument } = require("pdf-lib");
const fileAssoc = require("./services/file-association");

const SMOKE = process.argv.includes("--smoke") || process.env.PDFVIEWER_SMOKE === "1";

let mainWindow = null;
let pendingTarget = null;
let lastThemeSource = "system";

function themeBackgroundColor() {
  const dark = lastThemeSource === "dark" || (lastThemeSource === "system" && nativeTheme.shouldUseDarkColors);
  return dark ? "#101318" : "#f2f3f5";
}

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
const ASSETS_DIR = path.join(__dirname, "..", "assets");
const PDFJS_BUILD_DIR = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "build");
const PDFJS_WEB_DIR = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "web");
const QUILL_DIR = path.join(__dirname, "..", "node_modules", "quill", "dist");





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
    } else if (pathname.startsWith("/assets/")) {
      filePath = path.join(ASSETS_DIR, pathname.substring("/assets/".length));
    } else if (pathname.startsWith("/file-icons/")) {
      filePath = path.join(ASSETS_DIR, "file-icons", pathname.substring("/file-icons/".length));
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
      filePath.startsWith(ASSETS_DIR + path.sep) ||
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

const FOLDER_OPEN_THRESHOLD = 15;

async function readPdfFolder(folderPath) {
  try {
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) {
      return { canceled: true, error: "Selected path is not a directory." };
    }
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    // Filter top-level files ending with .pdf (ignore subdirectories)
    const pdfEntries = entries
      .filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

    const folderName = path.basename(folderPath);

    if (pdfEntries.length === 0) {
      return { canceled: false, files: [], folderName, count: 0 };
    }

    if (pdfEntries.length > FOLDER_OPEN_THRESHOLD) {
      const targetWin = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
      const { response } = await dialog.showMessageBox(targetWin, {
        type: "question",
        buttons: [`Open All (${pdfEntries.length})`, "Cancel"],
        defaultId: 0,
        cancelId: 1,
        title: "Open Multiple Documents",
        message: `Open ${pdfEntries.length} PDF documents from "${folderName}"?`,
        detail: `Opening ${pdfEntries.length} tabs simultaneously may take a few moments and increase memory usage.`,
      });
      if (response !== 0) {
        return { canceled: true };
      }
    }

    const files = [];
    for (const entry of pdfEntries) {
      const filePath = path.join(folderPath, entry.name);
      const data = await fs.readFile(filePath);
      files.push({
        name: entry.name,
        path: filePath,
        data: new Uint8Array(data),
      });
    }

    return {
      canceled: false,
      files,
      folderName,
      count: files.length,
    };
  } catch (err) {
    return {
      canceled: false,
      error: err && err.message ? err.message : String(err),
      files: [],
    };
  }
}

async function sendReadyTarget(target) {
  if (!target || !target.path) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (target.type === "file") {
    sendReadyFile(target.path);
  } else if (target.type === "directory") {
    const res = await readPdfFolder(target.path);
    if (!res || res.canceled || !res.files || !res.files.length) return;
    mainWindow.webContents.send("open-file", res.files);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: themeBackgroundColor(),
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
    if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("console-message", (_event, _level, message) => {
    console.log("[RENDERER]", message);
  });

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Intercept close to allow renderer to show unsaved changes warning
  win.on("close", (e) => {
    e.preventDefault();
    // Ask renderer if there are unsaved changes
    win.webContents.send("app:close-requested");
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
        { label: "Open Folder…", accelerator: "CmdOrCtrl+Shift+O", click: () => send("open-folder") },
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
        { type: "separator" },
        {
          label: "Settings…",
          accelerator: "CmdOrCtrl+,",
          click: () => send("settings"),
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "Keyboard Shortcuts", accelerator: "F1", click: () => send("shortcuts") },
        { type: "separator" },
        { label: "About PDFForge Viewer", click: () => send("about") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", async (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const target = await resolveLaunchTarget(argv);
    if (target) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        sendReadyTarget(target);
      } else {
        pendingTarget = target;
      }
    }
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

    ipcMain.handle("dialog:open-folder", async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Open Folder",
        properties: ["openDirectory"],
      });
      if (result.canceled || !result.filePaths.length) return { canceled: true };
      const folderPath = result.filePaths[0];
      return await readPdfFolder(folderPath);
    });

    ipcMain.handle("folder:open-path", async (_event, folderPath) => {
      if (typeof folderPath !== "string" || !path.isAbsolute(folderPath)) {
        throw new Error("Invalid path");
      }
      return await readPdfFolder(folderPath);
    });

    ipcMain.handle("file:check-type", async (_event, targetPath) => {
      try {
        const stat = await fs.stat(targetPath);
        return { isDirectory: stat.isDirectory(), isFile: stat.isFile() };
      } catch {
        return { isDirectory: false, isFile: false };
      }
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

    ipcMain.handle("dialog:save-pdf", async (_event, payload) => {
      const data = payload?.data;
      if (!data) return { canceled: true, error: "No data provided" };
      const defaultName = typeof payload?.defaultName === "string" && payload.defaultName.trim()
        ? payload.defaultName.trim().replace(/\.pdf$/i, "")
        : "document";
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Save PDF",
        defaultPath: `${defaultName}.pdf`,
        filters: [{ name: "PDF documents", extensions: ["pdf"] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      await fs.writeFile(result.filePath, Buffer.from(data));
      return { canceled: false, filePath: result.filePath, name: path.basename(result.filePath) };
    });

    ipcMain.handle("app:confirm-close", (_event, action) => {
      if (action === "close") {
        const win = BrowserWindow.fromWebContents(_event.sender);
        if (win && !win.isDestroyed()) {
          win.destroy();
        }
      }
      // action === "cancel" means user chose to stay
    });

    ipcMain.handle("app:set-theme", (_event, theme) => {
      if (theme === "light" || theme === "dark" || theme === "system") {
        lastThemeSource = theme;
        nativeTheme.themeSource = theme;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setBackgroundColor(themeBackgroundColor());
        }
      }
    });

    ipcMain.handle("app:get-theme", () =>
      lastThemeSource === "system" ? (nativeTheme.shouldUseDarkColors ? "dark" : "light") : lastThemeSource
    );

    ipcMain.handle("app:get-info", async () => {
      return {
        name: "PDFForge Viewer",
        version: app.getVersion(),
        electron: process.versions.electron || "",
        chrome: process.versions.chrome || "",
        node: process.versions.node || "",
        v8: process.versions.v8 || "",
        platform: process.platform,
        arch: process.arch,
        osVersion: typeof process.getSystemVersion === "function" ? process.getSystemVersion() : "",
      };
    });

    ipcMain.handle("app:get-launch-target", async () => {
      if (!pendingTarget) return null;
      const target = pendingTarget;
      pendingTarget = null;
      if (target.type === "file") {
        try {
          const buf = await fs.readFile(target.path);
          return {
            type: "file",
            files: [
              {
                name: path.basename(target.path),
                path: target.path,
                data: new Uint8Array(buf),
              },
            ],
          };
        } catch {
          return null;
        }
      } else if (target.type === "directory") {
        const res = await readPdfFolder(target.path);
        if (res && !res.canceled && res.files && res.files.length) {
          return {
            type: "directory",
            folderName: res.folderName,
            files: res.files,
          };
        }
        return null;
      }
      return null;
    });

    ipcMain.handle("fileAssoc:getStatus", async () => {
      return fileAssoc.checkDefaultStatus();
    });

    ipcMain.handle("fileAssoc:setDefault", async () => {
      return fileAssoc.registerAsDefault();
    });

    ipcMain.handle("fileAssoc:openSettings", async () => {
      return fileAssoc.openDefaultAppsSettings();
    });

    ipcMain.handle("fileAssoc:getIconPrefs", async () => {
      return fileAssoc.getIconPreferences();
    });

    ipcMain.handle("fileAssoc:applyIcon", async (_event, payload) => {
      return fileAssoc.applyPdfFileIcon(payload);
    });

    ipcMain.handle("fileAssoc:chooseCustomIcon", async () => {
      return fileAssoc.chooseCustomIconDialog(mainWindow);
    });

    ipcMain.handle("fileAssoc:getContextMenuStatus", async () => {
      return fileAssoc.checkContextMenuStatus();
    });

    ipcMain.handle("fileAssoc:setContextMenuStatus", async (_event, enabled) => {
      return fileAssoc.setContextMenuStatus(enabled);
    });

    mainWindow = createWindow();
    buildMenu();

    // Re-apply and sync saved PDF file icon to Windows Explorer registry on startup
    if (process.platform === "win32") {
      fileAssoc.syncSavedIconPreference().catch((err) => {
        console.warn("Could not sync saved PDF file icon on startup:", err);
      });
    }

    const initialTarget = await resolveLaunchTarget(process.argv);
    if (initialTarget) pendingTarget = initialTarget;

    mainWindow.webContents.once("did-finish-load", async () => {
      if (pendingTarget) {
        const t = pendingTarget;
        pendingTarget = null;
        await sendReadyTarget(t);
      }
      if (SMOKE) require("../scripts/smoke").runAppSmoke({ app, mainWindow });
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