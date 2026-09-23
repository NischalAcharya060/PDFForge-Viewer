import { state } from '../core/state.js';
import { el } from '../core/elements.js';

export function showPasswordModal(note) {
  el.passwordNote.textContent = note;
  el.passwordError.hidden = true;
  el.passwordModal.hidden = false;
  el.passwordInput.value = "";
  setTimeout(() => el.passwordInput.focus(), 0);
}

export function hidePasswordModal() {
  el.passwordModal.hidden = true;
}

export function submitPassword() {
  const value = el.passwordInput.value;
  if (!value) return;
  const update = state.passwordCallback;
  hidePasswordModal();
  if (update) {
    state.passwordValue = value;
    update(value);
  }
}
