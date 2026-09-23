const { contextBridge, ipcRenderer, webUtils } = require("electron");

function subscribe(channel) {
  return (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld("pdfViewer", {
  openDialog: () => ipcRenderer.invoke("dialog:open-pdf"),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),
  createTextPdf: (payload) => ipcRenderer.invoke("dialog:create-text-pdf", payload),
  savePdf: (payload) => ipcRenderer.invoke("dialog:save-pdf", payload),
  addBlankPage: (data) => ipcRenderer.invoke("pdf:add-blank-page", data),
  appendPdf: (payload) => ipcRenderer.invoke("pdf:append-pdf", payload),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
  setTheme: (theme) => ipcRenderer.invoke("app:set-theme", theme),
  getTheme: () => ipcRenderer.invoke("app:get-theme"),
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  onOpenFile: subscribe("open-file"),
  onCommand: subscribe("menu:command"),
  // Close confirmation flow
  onCloseRequested: subscribe("app:close-requested"),
  confirmClose: (action) => ipcRenderer.invoke("app:confirm-close", action),
  // File Association & Icon Customization
  getFileAssocStatus: () => ipcRenderer.invoke("fileAssoc:getStatus"),
  setAsDefaultPdfViewer: () => ipcRenderer.invoke("fileAssoc:setDefault"),
  openDefaultAppsSettings: () => ipcRenderer.invoke("fileAssoc:openSettings"),
  getIconPreferences: () => ipcRenderer.invoke("fileAssoc:getIconPrefs"),
  applyPdfFileIcon: (payload) => ipcRenderer.invoke("fileAssoc:applyIcon", payload),
  chooseCustomIcon: () => ipcRenderer.invoke("fileAssoc:chooseCustomIcon"),
});