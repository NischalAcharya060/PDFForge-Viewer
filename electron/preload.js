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
  onOpenFile: subscribe("open-file"),
  onCommand: subscribe("menu:command"),
});