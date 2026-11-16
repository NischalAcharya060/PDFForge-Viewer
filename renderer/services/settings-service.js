import { clamp } from '../utils/helpers.js';

export const SETTINGS_KEY = 'pdfforge-user-settings';
export const LAST_PAGES_KEY = 'pdfforge-last-read-pages';

export const DEFAULT_SETTINGS = {
  // Zoom & View Sizing
  defaultZoom: '125', // '125' is default as requested!
  customZoom: 125,
  defaultLayout: 'single', // 'single' | 'two-page'

  // Appearance & Reading
  theme: 'system', // 'system' | 'dark' | 'light'
  invertPdfColors: false, // Dark reader mode for PDF canvases
  smoothScroll: true, // Smooth scrolling in document viewer

  // Sidebar Defaults
  sidebarDefaultState: 'closed', // 'closed' | 'open'
  defaultSidebarTab: 'thumbs', // 'thumbs' | 'outline'

  // Document Creator Defaults
  editorPaperSize: 'a4', // 'a4' | 'letter' | 'legal'
  editorFontSize: 11, // 10, 11, 12, 14, 16
  editorLineSpacing: 1.15, // 1.0, 1.15, 1.4, 1.6, 2.0

  // Session & History
  restoreLastPage: true, // Remember last read page per document
};

/**
 * Load user settings from localStorage merged with defaults
 */
export function getSettings() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    console.warn('Could not read user settings from localStorage:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save updated user settings to localStorage
 */
export function saveSettings(updated) {
  const current = getSettings();
  const merged = { ...current, ...updated };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    }
  } catch (err) {
    console.warn('Could not save user settings to localStorage:', err);
  }
  applyDomSettings(merged);
  return merged;
}

/**
 * Reset all settings to factory defaults
 */
export function resetSettings() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SETTINGS_KEY);
    }
  } catch {}
  applyDomSettings(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}

/**
 * Compute initial zoom and layout mode based on user preferences
 */
export function getInitialZoomAndLayout() {
  const settings = getSettings();
  const zoomVal = settings.defaultZoom || '125';
  let layoutMode = 'fixed';
  let zoom = 1.25; // default 125%
  const twoPageMode = settings.defaultLayout === 'two-page';

  if (zoomVal === 'fit-width') {
    layoutMode = 'fit-width';
    zoom = 1;
  } else if (zoomVal === 'fit-page') {
    layoutMode = 'fit-page';
    zoom = 1;
  } else if (zoomVal === 'custom') {
    layoutMode = 'fixed';
    const custom = Number(settings.customZoom) || 125;
    zoom = clamp(custom / 100, 0.1, 8);
  } else {
    layoutMode = 'fixed';
    const numeric = Number(zoomVal) || 125;
    zoom = clamp(numeric / 100, 0.1, 8);
  }

  return {
    zoom,
    layoutMode,
    twoPageMode,
    sidebarVisible: settings.sidebarDefaultState === 'open',
    activeSidebarTab: settings.defaultSidebarTab || 'thumbs',
  };
}

/**
 * Apply DOM-level settings like dark PDF invert and smooth scrolling
 */
export function applyDomSettings(settings = getSettings()) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.pdfInvert = settings.invertPdfColors ? 'true' : 'false';
  document.documentElement.dataset.smoothScroll = settings.smoothScroll ? 'true' : 'false';
}

/**
 * Retrieve saved reading page for a given document key (file path or name)
 */
export function getLastReadPage(docKey) {
  if (!docKey || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_PAGES_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    const p = map[docKey];
    return typeof p === 'number' && p > 0 ? p : null;
  } catch {
    return null;
  }
}

/**
 * Save reading page for a given document key
 */
export function saveLastReadPage(docKey, pageNumber) {
  if (!docKey || !pageNumber || pageNumber < 1 || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LAST_PAGES_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[docKey] = pageNumber;
    // Keep max 100 entries to prevent localStorage bloat
    const keys = Object.keys(map);
    if (keys.length > 100) {
      delete map[keys[0]];
    }
    localStorage.setItem(LAST_PAGES_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Clear all saved last-read pages
 */
export function clearAllLastReadPages() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LAST_PAGES_KEY);
  } catch {}
}
