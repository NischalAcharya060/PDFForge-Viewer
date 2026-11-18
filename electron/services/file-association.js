const { app, dialog, shell } = require("electron");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const { exec, execFile } = require("node:child_process");

const CONFIG_FILE = "file-icon-config.json";
const LINUX_DESKTOP_FILENAME = "pdfforge-viewer.desktop";

function getConfigFile() {
  return path.join(app.getPath("userData"), CONFIG_FILE);
}

function getAssetIconPath(iconId, ext = "ico") {
  return path.join(__dirname, "..", "..", "assets", "file-icons", `${iconId}.${ext}`);
}

function runRegCommand(args) {
  return new Promise((resolve) => {
    execFile("reg.exe", args, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr, code: error ? error.code : 0 });
    });
  });
}

function runCommand(cmd, args, timeout = 3000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (error, stdout, stderr) => {
      resolve({
        error,
        stdout: stdout ? String(stdout) : "",
        stderr: stderr ? String(stderr) : "",
        code: error ? error.code : 0,
      });
    });
  });
}

/**
 * Notify OS shell of icon and file association updates
 */
function notifyShellChange() {
  return new Promise((resolve) => {
    if (process.platform === "linux") {
      const appsDir = path.join(os.homedir(), ".local", "share", "applications");
      const iconsDir = path.join(os.homedir(), ".local", "share", "icons", "hicolor");
      Promise.all([
        runCommand("update-desktop-database", [appsDir]),
        runCommand("gtk-update-icon-cache", ["-f", "-t", iconsDir]),
      ]).finally(() => resolve());
      return;
    }

    if (process.platform !== "win32") {
      resolve();
      return;
    }

    // On Windows, broadcast SHChangeNotify directly via PowerShell in-memory
    // without relying on relative .ps1 files that fail inside packaged app.asar archives.
    // 0x08000000 = SHCNE_ASSOCCHANGED, 0x00002000 = SHCNE_UPDATEIMAGE
    const psScript = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class ShellNotifier {
    [DllImport("shell32.dll", SetLastError = true)]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
try {
    Add-Type -TypeDefinition $code -ErrorAction Stop
    [ShellNotifier]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
    [ShellNotifier]::SHChangeNotify(0x00002000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
} catch {}
`;
    const encoded = Buffer.from(psScript, "utf16le").toString("base64");

    const p1 = runCommand("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], 5000);
    const p2 = runCommand("ie4uinit.exe", ["-show"], 3000);
    const p3 = runCommand("ie4uinit.exe", ["-kioskupdate"], 3000);

    Promise.allSettled([p1, p2, p3]).finally(() => {
      resolve();
    });
  });
}

/**
 * Check if PDFForge Viewer is currently the default reader for .pdf files
 */
async function checkDefaultStatus() {
  if (process.platform === "linux") {
    const res = await runCommand("xdg-mime", ["query", "default", "application/pdf"]);
    const desktopId = res.stdout.trim();
    return {
      isDefault: /pdfforge/i.test(desktopId),
      progId: desktopId,
      osSupported: true,
    };
  }

  if (process.platform !== "win32") {
    return { isDefault: false, progId: "", osSupported: false };
  }

  // 1. Windows 11 24H2 / latest Insider UserChoiceLatest (takes highest precedence)
  const userChoiceLatestSub = await runRegCommand([
    "query",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoiceLatest\\ProgId",
    "/v",
    "ProgId",
  ]);
  if (!userChoiceLatestSub.error && userChoiceLatestSub.stdout) {
    const match = userChoiceLatestSub.stdout.match(/ProgId\s+REG_SZ\s+(\S.*)/i);
    if (match && match[1]) {
      const progId = match[1].trim();
      return { isDefault: /pdfforge/i.test(progId), progId, osSupported: true };
    }
  }

  const userChoiceLatest = await runRegCommand([
    "query",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoiceLatest",
    "/v",
    "ProgId",
  ]);
  if (!userChoiceLatest.error && userChoiceLatest.stdout) {
    const match = userChoiceLatest.stdout.match(/ProgId\s+REG_SZ\s+(\S.*)/i);
    if (match && match[1]) {
      const progId = match[1].trim();
      return { isDefault: /pdfforge/i.test(progId), progId, osSupported: true };
    }
  }

  // 2. Standard Windows 10 / earlier Windows 11 UserChoice
  const userChoiceResult = await runRegCommand([
    "query",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoice",
    "/v",
    "ProgId",
  ]);
  let userChoiceProgId = null;
  if (!userChoiceResult.error && userChoiceResult.stdout) {
    const match = userChoiceResult.stdout.match(/ProgId\s+REG_SZ\s+(\S.*)/i);
    if (match && match[1]) {
      userChoiceProgId = match[1].trim();
      if (/pdfforge/i.test(userChoiceProgId)) {
        return { isDefault: true, progId: userChoiceProgId, osSupported: true };
      }
    }
  }

  // 3. HKCU\Software\Classes\.pdf default
  const defaultExtResult = await runRegCommand(["query", "HKCU\\Software\\Classes\\.pdf", "/ve"]);
  if (!defaultExtResult.error && defaultExtResult.stdout) {
    const match = defaultExtResult.stdout.match(/\(Default\)\s+REG_SZ\s+(\S.*)/i);
    if (match && match[1]) {
      const progId = match[1].trim();
      if (/pdfforge/i.test(progId)) {
        return { isDefault: true, progId, osSupported: true };
      }
    }
  }

  // 4. HKCR\.pdf default
  const hkcrResult = await runRegCommand(["query", "HKCR\\.pdf", "/ve"]);
  if (!hkcrResult.error && hkcrResult.stdout) {
    const match = hkcrResult.stdout.match(/\(Default\)\s+REG_SZ\s+(\S.*)/i);
    if (match && match[1]) {
      const progId = match[1].trim();
      if (/pdfforge/i.test(progId)) {
        return { isDefault: true, progId, osSupported: true };
      }
    }
  }

  return { isDefault: false, progId: userChoiceProgId || "", osSupported: true };
}

/**
 * Get saved icon preferences and list of presets
 */
function getIconPreferences() {
  const iconExt = process.platform === "linux" ? "png" : "ico";
  const defaults = {
    selectedIconId: "brand",
    customIconPath: null,
    currentIconPath: getAssetIconPath("brand", iconExt),
  };

  const configFile = getConfigFile();
  let saved = {};
  if (fs.existsSync(configFile)) {
    try {
      saved = JSON.parse(fs.readFileSync(configFile, "utf8"));
    } catch {
      saved = {};
    }
  }

  const selectedIconId = saved.selectedIconId || defaults.selectedIconId;
  const customIconPath = saved.customIconPath || null;

  const presets = [
    {
      id: "brand",
      name: "Brand Red",
      subtitle: "PDFForge official rounded emblem",
      previewSvg: "file-icons/brand.svg",
      previewPng: "file-icons/brand.png",
      icoPath: getAssetIconPath("brand", iconExt),
    },
    {
      id: "classic",
      name: "Classic Document",
      subtitle: "Clean paper sheet with red PDF banner",
      previewSvg: "file-icons/classic.svg",
      previewPng: "file-icons/classic.png",
      icoPath: getAssetIconPath("classic", iconExt),
    },
    {
      id: "dark",
      name: "Dark Modern",
      subtitle: "Sleek charcoal slate with ruby accents",
      previewSvg: "file-icons/dark.svg",
      previewPng: "file-icons/dark.png",
      icoPath: getAssetIconPath("dark", iconExt),
    },
    {
      id: "minimal",
      name: "Minimalist",
      subtitle: "Clean outline with scarlet ribbon tag",
      previewSvg: "file-icons/minimal.svg",
      previewPng: "file-icons/minimal.png",
      icoPath: getAssetIconPath("minimal", iconExt),
    },
  ];

  return {
    selectedIconId,
    customIconPath,
    presets,
    osSupported: process.platform === "win32" || process.platform === "linux",
  };
}

/**
 * Deep link to this app's own page inside Windows Default apps settings.
 * Falls back to the generic Default apps list on older Windows builds
 * (query param requires Windows 11 21H2+ with 2023-04 update or later).
 */
function defaultAppsAppPageUri() {
  const appName = encodeURIComponent("PDFForge Viewer");
  return `ms-settings:defaultapps?registeredAppUser=${appName}`;
}

/**
 * Register file associations on Windows (HKCU registry) or Linux (XDG desktop entry + xdg-mime)
 */
async function registerAsDefault() {
  if (process.platform === "linux") {
    const execTarget = process.env.APPIMAGE
      ? `"${process.env.APPIMAGE}" %U`
      : app.isPackaged
      ? `"${process.execPath}" %U`
      : `"${process.execPath}" "${path.resolve(__dirname, "..", "..")}" %U`;

    const appsDir = path.join(os.homedir(), ".local", "share", "applications");
    await fsPromises.mkdir(appsDir, { recursive: true });

    const prefs = getIconPreferences();
    let iconPath = getAssetIconPath(prefs.selectedIconId, "png");
    if (prefs.selectedIconId === "custom" && prefs.customIconPath && fs.existsSync(prefs.customIconPath)) {
      iconPath = prefs.customIconPath;
    } else if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, "..", "..", "assets", "brand-icon.png");
    }

    const desktopContent = [
      "[Desktop Entry]",
      "Name=PDFForge Viewer",
      "Comment=A fast, private, offline desktop PDF viewer.",
      `Exec=${execTarget}`,
      "Terminal=false",
      "Type=Application",
      `Icon=${iconPath}`,
      "StartupWMClass=PDFForge Viewer",
      "Categories=Office;Viewer;",
      "MimeType=application/pdf;",
      "",
    ].join("\n");

    const desktopFile = path.join(appsDir, LINUX_DESKTOP_FILENAME);
    await fsPromises.writeFile(desktopFile, desktopContent, "utf8");
    await fsPromises.chmod(desktopFile, 0o755).catch(() => {});

    await runCommand("xdg-mime", ["default", LINUX_DESKTOP_FILENAME, "application/pdf"]);
    await notifyShellChange();

    const status = await checkDefaultStatus();
    return {
      success: true,
      isDefault: status.isDefault,
      message: "PDFForge Viewer has been set as your default PDF reader!",
    };
  }

  if (process.platform !== "win32") {
    return { success: false, message: "File associations are only supported on Windows and Linux." };
  }

  const openCmd = app.isPackaged
    ? `"${process.execPath}" "%1"`
    : `"${process.execPath}" "${path.resolve(__dirname, "..", "..")}" "%1"`;

  const prefs = getIconPreferences();
  let targetIconPath = "";
  try {
    const iconRes = await ensurePersistentIcon(prefs.selectedIconId, prefs.customIconPath);
    targetIconPath = iconRes.targetIconPath || "";
  } catch {
    // fallback
  }
  if (!targetIconPath || !fs.existsSync(targetIconPath)) {
    try {
      const fallbackRes = await ensurePersistentIcon("brand", null);
      targetIconPath = fallbackRes.targetIconPath || getAssetIconPath("brand");
    } catch {
      targetIconPath = getAssetIconPath("brand");
    }
  }

  const regOps = [
    ["add", "HKCU\\Software\\Classes\\.pdf", "/ve", "/t", "REG_SZ", "/d", "PDFForge Viewer", "/f"],
    ["add", "HKCU\\Software\\Classes\\.pdf\\OpenWithProgids", "/v", "PDFForge Viewer", "/t", "REG_SZ", "/d", "", "/f"],
    ["add", "HKCU\\Software\\Classes\\PDFForge Viewer", "/ve", "/t", "REG_SZ", "/d", "PDFForge Viewer document", "/f"],
    ["add", "HKCU\\Software\\Classes\\PDFForge Viewer\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\PDFForge Viewer.pdf\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\PDFForge Viewer\\shell\\open\\command", "/ve", "/t", "REG_SZ", "/d", openCmd, "/f"],
    ["add", "HKCU\\Software\\Classes\\Applications\\PDFForge Viewer.exe\\SupportedTypes", "/v", ".pdf", "/t", "REG_SZ", "/d", "", "/f"],
    ["add", "HKCU\\Software\\Classes\\Applications\\PDFForge Viewer.exe\\shell\\open\\command", "/ve", "/t", "REG_SZ", "/d", openCmd, "/f"],
    ["add", "HKCU\\Software\\Classes\\Applications\\PDFForge Viewer.exe\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\Applications\\pdfforge-viewer.exe\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\SystemFileAssociations\\.pdf\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\PDFForge Viewer\\Capabilities", "/v", "ApplicationDescription", "/t", "REG_SZ", "/d", "A fast, private, offline desktop PDF viewer.", "/f"],
    ["add", "HKCU\\Software\\PDFForge Viewer\\Capabilities", "/v", "ApplicationName", "/t", "REG_SZ", "/d", "PDFForge Viewer", "/f"],
    ["add", "HKCU\\Software\\PDFForge Viewer\\Capabilities\\FileAssociations", "/v", ".pdf", "/t", "REG_SZ", "/d", "PDFForge Viewer", "/f"],
    ["add", "HKCU\\Software\\RegisteredApplications", "/v", "PDFForge Viewer", "/t", "REG_SZ", "/d", "Software\\PDFForge Viewer\\Capabilities", "/f"],
  ];

  for (const op of regOps) {
    await runRegCommand(op);
  }

  await notifyShellChange();

  // Open this app's page inside Windows Default apps so the user only has to click "Set as default"
  try {
    await shell.openExternal(defaultAppsAppPageUri());
  } catch (err) {
    console.warn("Could not open app Default apps page:", err);
  }

  const status = await checkDefaultStatus();
  return {
    success: true,
    isDefault: status.isDefault,
    message: "Registered as PDF reader! Click \"Set as default\" on the Windows page that opened.",
  };
}

/**
 * Ensure the requested icon is copied to a permanent, un-sandboxed userData location
 * so Windows Explorer can reliably access the .ico file (outside of app.asar).
 */
async function ensurePersistentIcon(iconId, customPath) {
  const userDataDir = app.getPath("userData");
  if (iconId === "custom") {
    if (!customPath || !fs.existsSync(customPath)) {
      return { error: "Custom icon file does not exist." };
    }
    const persistentCustomPath = path.join(userDataDir, "custom-pdf-icon.ico");
    await fsPromises.copyFile(customPath, persistentCustomPath);
    return { targetIconPath: persistentCustomPath };
  }

  const srcIco = getAssetIconPath(iconId, "ico");
  if (!fs.existsSync(srcIco)) {
    return { error: `Preset icon '${iconId}' not found.` };
  }
  const persistentPresetPath = path.join(userDataDir, `pdf-icon-${iconId}.ico`);
  await fsPromises.copyFile(srcIco, persistentPresetPath);
  return { targetIconPath: persistentPresetPath };
}

/**
 * Apply a selected preset icon or custom icon to OS PDF file association
 */
async function applyPdfFileIcon({ iconId, customPath }) {
  const userDataDir = app.getPath("userData");

  if (process.platform === "linux") {
    let targetIconPath = "";
    if (iconId === "custom") {
      if (!customPath || !fs.existsSync(customPath)) {
        return { success: false, error: "Custom icon file does not exist." };
      }
      const ext = path.extname(customPath) || ".png";
      const persistentCustomPath = path.join(userDataDir, `custom-pdf-icon${ext}`);
      await fsPromises.copyFile(customPath, persistentCustomPath);
      targetIconPath = persistentCustomPath;
    } else {
      const srcPng = getAssetIconPath(iconId, "png");
      if (!fs.existsSync(srcPng)) {
        return { success: false, error: `Preset icon '${iconId}' not found.` };
      }
      const persistentPresetPath = path.join(userDataDir, `pdf-icon-${iconId}.png`);
      await fsPromises.copyFile(srcPng, persistentPresetPath);
      targetIconPath = persistentPresetPath;
    }

    // Install into user hicolor icon theme for application-pdf mimetype
    try {
      const mimeIconsDir = path.join(os.homedir(), ".local", "share", "icons", "hicolor", "256x256", "mimetypes");
      await fsPromises.mkdir(mimeIconsDir, { recursive: true });
      await fsPromises.copyFile(targetIconPath, path.join(mimeIconsDir, "application-pdf.png"));
      await fsPromises.copyFile(targetIconPath, path.join(mimeIconsDir, "x-office-document.png")).catch(() => {});
    } catch {
      // ignore if user icon dir is read-only
    }

    const configFile = getConfigFile();
    const configData = {
      selectedIconId: iconId,
      customIconPath: iconId === "custom" ? targetIconPath : customPath || null,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(configFile, JSON.stringify(configData, null, 2), "utf8");

    await notifyShellChange();

    return {
      success: true,
      iconId,
      iconPath: targetIconPath,
      message: "PDF file icon updated!",
    };
  }

  if (process.platform !== "win32") {
    return { success: false, message: "File icon customization is only supported on Windows and Linux." };
  }

  const iconResult = await ensurePersistentIcon(iconId, customPath);
  if (iconResult.error) {
    return { success: false, error: iconResult.error };
  }
  const targetIconPath = iconResult.targetIconPath;

  // Update all relevant registry keys to ensure Windows Explorer picks up the icon
  const regUpdates = [
    ["add", "HKCU\\Software\\Classes\\PDFForge Viewer\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\PDFForge Viewer.pdf\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\Applications\\PDFForge Viewer.exe\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\Applications\\pdfforge-viewer.exe\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\.pdf\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\SystemFileAssociations\\.pdf\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
  ];

  try {
    const status = await checkDefaultStatus();
    if (status && status.progId && typeof status.progId === "string") {
      const cleanProgId = status.progId.trim();
      if (cleanProgId && !cleanProgId.includes("\\") && cleanProgId !== "PDFForge Viewer") {
        regUpdates.push(["add", `HKCU\\Software\\Classes\\${cleanProgId}\\DefaultIcon`, "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"]);
      }
    }
  } catch {
    // ignore query failure
  }

  for (const op of regUpdates) {
    await runRegCommand(op);
  }

  // Save preference
  const configFile = getConfigFile();
  const configData = {
    selectedIconId: iconId,
    customIconPath: iconId === "custom" ? targetIconPath : customPath || null,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(configFile, JSON.stringify(configData, null, 2), "utf8");

  // Broadcast shell change notification
  await notifyShellChange();

  return {
    success: true,
    iconId,
    iconPath: targetIconPath,
    message: "PDF file icon updated in Windows Explorer!",
  };
}

/**
 * Synchronize saved icon preference on startup (restores icon if overwritten by installer or OS update)
 */
async function syncSavedIconPreference() {
  if (process.platform !== "win32") return;
  try {
    const configFile = getConfigFile();
    if (fs.existsSync(configFile)) {
      const data = JSON.parse(fs.readFileSync(configFile, "utf8"));
      if (data && data.selectedIconId) {
        await applyPdfFileIcon({
          iconId: data.selectedIconId,
          customPath: data.customIconPath || null,
        });
      }
    }
  } catch (err) {
    console.warn("Could not sync saved icon preference:", err);
  }
}

/**
 * Show native open dialog to pick a custom icon file
 */
async function chooseCustomIconDialog(mainWindow) {
  const isLinux = process.platform === "linux";
  const filters = isLinux
    ? [
        { name: "Icon Files (*.png, *.svg, *.ico)", extensions: ["png", "svg", "ico"] },
        { name: "All Files (*.*)", extensions: ["*"] },
      ]
    : [
        { name: "Windows Icon Files (*.ico)", extensions: ["ico"] },
        { name: "All Files (*.*)", extensions: ["*"] },
      ];

  const result = await dialog.showOpenDialog(mainWindow, {
    title: isLinux ? "Select PDF File Icon" : "Select PDF File Icon (.ico)",
    properties: ["openFile"],
    filters,
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }

  const selectedPath = result.filePaths[0];
  const validPattern = isLinux ? /\.(png|svg|ico)$/i : /\.ico$/i;
  if (!validPattern.test(selectedPath)) {
    return {
      canceled: true,
      error: isLinux ? "Please select a valid .png, .svg, or .ico file." : "Please select a valid .ico file.",
    };
  }

  return { canceled: false, filePath: selectedPath };
}

/**
 * Open system Default Apps settings directly
 */
async function openDefaultAppsSettings() {
  if (process.platform === "win32") {
    return shell.openExternal(defaultAppsAppPageUri());
  }
  if (process.platform === "linux") {
    const res = await runCommand("gnome-control-center", ["default-apps"]);
    if (res.error) {
      await runCommand("systemsettings", ["kcm_componentchooser"]);
    }
    return true;
  }
  return false;
}

/**
 * Check if the Windows Explorer context menu item for opening folders is enabled
 */
const CONTEXT_MENU_TITLE = "Open Folder in PDFForge Viewer";
const REG_BG_KEY = "HKCU\\Software\\Classes\\Directory\\Background\\shell\\PDFForgeViewer";
const REG_DIR_KEY = "HKCU\\Software\\Classes\\Directory\\shell\\PDFForgeViewer";

async function checkContextMenuStatus() {
  if (process.platform !== "win32") {
    return { isEnabled: false, osSupported: false };
  }
  const bgCheck = await runRegCommand(["query", REG_BG_KEY, "/ve"]);
  const dirCheck = await runRegCommand(["query", REG_DIR_KEY, "/ve"]);
  const isEnabled = !bgCheck.error && !dirCheck.error;
  return { isEnabled, osSupported: true };
}

async function setContextMenuStatus(enabled) {
  if (process.platform !== "win32") {
    return { success: false, message: "Context menu is only supported on Windows.", osSupported: false };
  }

  if (!enabled) {
    await runRegCommand(["delete", REG_BG_KEY, "/f"]);
    await runRegCommand(["delete", REG_DIR_KEY, "/f"]);
    await notifyShellChange();
    return { success: true, isEnabled: false, message: "Removed from Windows Explorer context menu." };
  }

  let exePath = process.execPath;
  let bgOpenCmd = `"${exePath}" "%V"`;
  let dirOpenCmd = `"${exePath}" "%1"`;
  let iconPath = exePath;

  const isPackaged = app ? Boolean(app.isPackaged) : false;
  if (!isPackaged) {
    const installedExe = path.join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "PDFForge Viewer",
      "PDFForge Viewer.exe"
    );
    if (fs.existsSync(installedExe)) {
      exePath = installedExe;
      bgOpenCmd = `"${exePath}" "%V"`;
      dirOpenCmd = `"${exePath}" "%1"`;
      iconPath = exePath;
    } else {
      const appRoot = path.resolve(__dirname, "..", "..");
      bgOpenCmd = `"${exePath}" "${appRoot}" "%V"`;
      dirOpenCmd = `"${exePath}" "${appRoot}" "%1"`;
      const assetIcon = path.join(appRoot, "assets", "app-icon.ico");
      iconPath = fs.existsSync(assetIcon) ? assetIcon : exePath;
    }
  }

  const regOps = [
    // Directory Background (right-click inside open folder)
    ["add", REG_BG_KEY, "/ve", "/t", "REG_SZ", "/d", CONTEXT_MENU_TITLE, "/f"],
    ["add", REG_BG_KEY, "/v", "Icon", "/t", "REG_SZ", "/d", iconPath, "/f"],
    ["add", `${REG_BG_KEY}\\command`, "/ve", "/t", "REG_SZ", "/d", bgOpenCmd, "/f"],

    // Directory (right-click on folder item)
    ["add", REG_DIR_KEY, "/ve", "/t", "REG_SZ", "/d", CONTEXT_MENU_TITLE, "/f"],
    ["add", REG_DIR_KEY, "/v", "Icon", "/t", "REG_SZ", "/d", iconPath, "/f"],
    ["add", `${REG_DIR_KEY}\\command`, "/ve", "/t", "REG_SZ", "/d", dirOpenCmd, "/f"],
  ];

  for (const op of regOps) {
    await runRegCommand(op);
  }

  await notifyShellChange();
  return { success: true, isEnabled: true, message: "Added 'Open Folder in PDFForge Viewer' to Windows Explorer context menu!" };
}

module.exports = {
  checkDefaultStatus,
  getIconPreferences,
  registerAsDefault,
  applyPdfFileIcon,
  chooseCustomIconDialog,
  openDefaultAppsSettings,
  notifyShellChange,
  syncSavedIconPreference,
  checkContextMenuStatus,
  setContextMenuStatus,
};

