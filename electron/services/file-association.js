const { app, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const { exec, execFile } = require("node:child_process");

const CONFIG_FILE = "file-icon-config.json";

function getConfigFile() {
  return path.join(app.getPath("userData"), CONFIG_FILE);
}

function getAssetIconPath(iconId) {
  return path.join(__dirname, "..", "..", "assets", "file-icons", `${iconId}.ico`);
}

function runRegCommand(args) {
  return new Promise((resolve) => {
    execFile("reg.exe", args, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr, code: error ? error.code : 0 });
    });
  });
}

/**
 * Notify Windows Explorer of icon and file association updates
 */
function notifyShellChange() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve();
      return;
    }

    const scriptPath = path.join(__dirname, "..", "..", "scripts", "notify-shell.ps1");
    if (fs.existsSync(scriptPath)) {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
        { timeout: 3000 },
        () => {}
      );
    }

    // Secondary icon cache flush via ie4uinit
    exec("ie4uinit.exe -show", { timeout: 2000 }, () => {
      resolve();
    });
  });
}

/**
 * Check if PDFForge Viewer is currently the default reader for .pdf files
 */
async function checkDefaultStatus() {
  if (process.platform !== "win32") {
    return { isDefault: false, progId: "", osSupported: false };
  }

  // 1. Try querying UserChoice
  const userChoiceResult = await runRegCommand([
    "query",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoice",
    "/v",
    "ProgId",
  ]);

  if (!userChoiceResult.error && userChoiceResult.stdout) {
    const match = userChoiceResult.stdout.match(/ProgId\s+REG_SZ\s+(\S.*)/i);
    if (match && match[1]) {
      const progId = match[1].trim();
      const isDefault = /pdfforge/i.test(progId);
      return { isDefault, progId, osSupported: true };
    }
  }

  // 2. Fallback to HKCU\Software\Classes\.pdf default
  const defaultExtResult = await runRegCommand(["query", "HKCU\\Software\\Classes\\.pdf", "/ve"]);

  if (!defaultExtResult.error && defaultExtResult.stdout) {
    const match = defaultExtResult.stdout.match(/\(Default\)\s+REG_SZ\s+(\S.*)/i);
    if (match && match[1]) {
      const progId = match[1].trim();
      const isDefault = /pdfforge/i.test(progId);
      return { isDefault, progId, osSupported: true };
    }
  }

  return { isDefault: false, progId: "", osSupported: true };
}

/**
 * Get saved icon preferences and list of presets
 */
function getIconPreferences() {
  const defaults = {
    selectedIconId: "brand",
    customIconPath: null,
    currentIconPath: getAssetIconPath("brand"),
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
      icoPath: getAssetIconPath("brand"),
    },
    {
      id: "classic",
      name: "Classic Document",
      subtitle: "Clean paper sheet with red PDF banner",
      previewSvg: "file-icons/classic.svg",
      previewPng: "file-icons/classic.png",
      icoPath: getAssetIconPath("classic"),
    },
    {
      id: "dark",
      name: "Dark Modern",
      subtitle: "Sleek charcoal slate with ruby accents",
      previewSvg: "file-icons/dark.svg",
      previewPng: "file-icons/dark.png",
      icoPath: getAssetIconPath("dark"),
    },
    {
      id: "minimal",
      name: "Minimalist",
      subtitle: "Clean outline with scarlet ribbon tag",
      previewSvg: "file-icons/minimal.svg",
      previewPng: "file-icons/minimal.png",
      icoPath: getAssetIconPath("minimal"),
    },
  ];

  return {
    selectedIconId,
    customIconPath,
    presets,
    osSupported: process.platform === "win32",
  };
}

/**
 * Register file associations in HKCU registry and open Windows Default Apps settings
 */
async function registerAsDefault() {
  if (process.platform !== "win32") {
    return { success: false, message: "File associations are only supported on Windows." };
  }

  const openCmd = app.isPackaged
    ? `"${process.execPath}" "%1"`
    : `"${process.execPath}" "${path.resolve(__dirname, "..", "..")}" "%1"`;

  const prefs = getIconPreferences();
  let targetIconPath = getAssetIconPath(prefs.selectedIconId);
  if (prefs.selectedIconId === "custom" && prefs.customIconPath && fs.existsSync(prefs.customIconPath)) {
    targetIconPath = prefs.customIconPath;
  }
  if (!fs.existsSync(targetIconPath)) {
    targetIconPath = getAssetIconPath("brand");
  }

  const regOps = [
    ["add", "HKCU\\Software\\Classes\\.pdf", "/ve", "/t", "REG_SZ", "/d", "PDFForge Viewer", "/f"],
    ["add", "HKCU\\Software\\Classes\\.pdf\\OpenWithProgids", "/v", "PDFForge Viewer", "/t", "REG_SZ", "/d", "", "/f"],
    ["add", "HKCU\\Software\\Classes\\PDFForge Viewer", "/ve", "/t", "REG_SZ", "/d", "PDFForge Viewer document", "/f"],
    ["add", "HKCU\\Software\\Classes\\PDFForge Viewer\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\PDFForge Viewer\\shell\\open\\command", "/ve", "/t", "REG_SZ", "/d", openCmd, "/f"],
    ["add", "HKCU\\Software\\Classes\\Applications\\PDFForge Viewer.exe\\SupportedTypes", "/v", ".pdf", "/t", "REG_SZ", "/d", "", "/f"],
    ["add", "HKCU\\Software\\Classes\\Applications\\PDFForge Viewer.exe\\shell\\open\\command", "/ve", "/t", "REG_SZ", "/d", openCmd, "/f"],
    ["add", "HKCU\\Software\\Classes\\Applications\\PDFForge Viewer.exe\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\PDFForge Viewer\\Capabilities", "/v", "ApplicationDescription", "/t", "REG_SZ", "/d", "A fast, private, offline desktop PDF viewer.", "/f"],
    ["add", "HKCU\\Software\\PDFForge Viewer\\Capabilities", "/v", "ApplicationName", "/t", "REG_SZ", "/d", "PDFForge Viewer", "/f"],
    ["add", "HKCU\\Software\\PDFForge Viewer\\Capabilities\\FileAssociations", "/v", ".pdf", "/t", "REG_SZ", "/d", "PDFForge Viewer", "/f"],
    ["add", "HKCU\\Software\\RegisteredApplications", "/v", "PDFForge Viewer", "/t", "REG_SZ", "/d", "Software\\PDFForge Viewer\\Capabilities", "/f"],
  ];

  for (const op of regOps) {
    await runRegCommand(op);
  }

  await notifyShellChange();

  // Open Windows default apps page for user confirmation
  try {
    await shell.openExternal("ms-settings:defaultapps");
  } catch (err) {
    console.warn("Could not open ms-settings:defaultapps:", err);
  }

  const status = await checkDefaultStatus();
  return { success: true, isDefault: status.isDefault };
}

/**
 * Apply a selected preset icon or custom .ico to Windows Explorer PDF file association
 */
async function applyPdfFileIcon({ iconId, customPath }) {
  if (process.platform !== "win32") {
    return { success: false, message: "File icon customization is only supported on Windows." };
  }

  const userDataDir = app.getPath("userData");
  let targetIconPath = "";

  if (iconId === "custom") {
    if (!customPath || !fs.existsSync(customPath)) {
      return { success: false, error: "Custom icon file does not exist." };
    }
    // Copy custom icon to permanent userData location
    const persistentCustomPath = path.join(userDataDir, "custom-pdf-icon.ico");
    await fsPromises.copyFile(customPath, persistentCustomPath);
    targetIconPath = persistentCustomPath;
  } else {
    const srcIco = getAssetIconPath(iconId);
    if (!fs.existsSync(srcIco)) {
      return { success: false, error: `Preset icon '${iconId}' not found.` };
    }
    // Copy preset icon to permanent userData location so path remains valid
    const persistentPresetPath = path.join(userDataDir, `pdf-icon-${iconId}.ico`);
    await fsPromises.copyFile(srcIco, persistentPresetPath);
    targetIconPath = persistentPresetPath;
  }

  // Update registry keys
  const regUpdates = [
    ["add", "HKCU\\Software\\Classes\\PDFForge Viewer\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\Applications\\PDFForge Viewer.exe\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
    ["add", "HKCU\\Software\\Classes\\.pdf\\DefaultIcon", "/ve", "/t", "REG_SZ", "/d", targetIconPath, "/f"],
  ];

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
  };
}

/**
 * Show native open dialog to pick a custom .ico file
 */
async function chooseCustomIconDialog(mainWindow) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select PDF File Icon (.ico)",
    properties: ["openFile"],
    filters: [
      { name: "Windows Icon Files (*.ico)", extensions: ["ico"] },
      { name: "All Files (*.*)", extensions: ["*"] },
    ],
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }

  const selectedPath = result.filePaths[0];
  if (!/\.ico$/i.test(selectedPath)) {
    return { canceled: true, error: "Please select a valid .ico file." };
  }

  return { canceled: false, filePath: selectedPath };
}

/**
 * Open Windows Default Apps settings directly
 */
async function openDefaultAppsSettings() {
  if (process.platform === "win32") {
    return shell.openExternal("ms-settings:defaultapps");
  }
  return false;
}

module.exports = {
  checkDefaultStatus,
  getIconPreferences,
  registerAsDefault,
  applyPdfFileIcon,
  chooseCustomIconDialog,
  openDefaultAppsSettings,
  notifyShellChange,
};
