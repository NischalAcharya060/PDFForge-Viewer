export const PAGE_PAD = 24;
export const THUMB_MAX = 150;
export const ZOOM_PRESETS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.83, 1, 1.25, 1.5, 2, 2.5, 3, 4];
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const RECENT_KEY = "pdfforge-recent-files";
export const PDF_OPTIONS_KEY = "pdfforge-pdf-options";

export const state = {
  doc: null,
  loadingTask: null,
  name: "",
  filePath: null,
  layoutMode: "fit-width",
  zoom: 1,
  rotation: 0,
  pages: [],
  outline: [],
  passwordCallback: null,
  passwordValue: null,
  currentPage: 1,
  renderSeq: 0,
  renderQueue: [],
  renderBusy: false,
  currentTheme: null,
  activeSidebarTab: "thumbs",
  search: {
    isOpen: false,
    query: "",
    matches: [],
    currentMatchIndex: -1,
  },
  twoPageMode: false,
  data: null,
  editor: {
    active: false,
    fileName: "untitled",
    dirty: false,
    saving: false,
    source: null,
    options: null,
  },
};

export let quill = null;
export let editorBusy = false;
export let docZoomScale = 1.0;
export let tabs = [];
export let activeTabId = null;
export let splitTabId = null;
export let isSplitActive = false;
export let tabCounter = 0;
export let splitDoc = null;
export let splitPages = [];
export let tabDragSourceId = null;
export let contextMenuTargetTabId = null;

export function setQuill(v) { quill = v; }
export function setEditorBusy(v) { editorBusy = v; }
export function setDocZoomScale(v) { docZoomScale = v; }
export function setTabs(v) { tabs = v; }
export function setActiveTabId(v) { activeTabId = v; }
export function setSplitTabId(v) { splitTabId = v; }
export function setIsSplitActive(v) { isSplitActive = v; }
export function setTabCounter(v) { tabCounter = v; }
export function setSplitDoc(v) { splitDoc = v; }
export function setSplitPages(v) { splitPages = v; }
export function setTabDragSourceId(v) { tabDragSourceId = v; }
export function setContextMenuTargetTabId(v) { contextMenuTargetTabId = v; }
