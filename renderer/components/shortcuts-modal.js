import { el } from '../core/elements.js';
import { hideAllOverlays } from '../services/document-service.js';

export function showShortcutsModal() {
  hideAllOverlays();
  el.shortcutsModal.hidden = false;
}
