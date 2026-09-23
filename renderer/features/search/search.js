import { state, quill } from '../../core/state.js';
import { el } from '../../core/elements.js';
import { scrollToPage } from '../viewer/viewer.js';

export let searchDebounceTimer = null;

export function debounceSearch(query) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    executeSearch(query);
  }, 150);
}

export function toggleFindBar(force) {
  if (!state.doc && !state.editor.active && force) return;
  const show = typeof force === "boolean" ? force : el.findBar.hidden;
  state.search.isOpen = show;
  el.findBar.hidden = !show;
  if (el.btnFind) el.btnFind.classList.toggle("active", show);
  if (show) {
    el.findInput.focus();
    el.findInput.select();
    if (el.findInput.value) {
      executeSearch(el.findInput.value);
    }
  } else {
    clearAllHighlights();
    state.search.query = "";
    state.search.matches = [];
    state.search.currentMatchIndex = -1;
    el.findResults.textContent = "";
    if (state.editor.active && quill) {
      quill.focus();
    } else if (el.pageHost) {
      el.pageHost.focus();
    }
  }
}

export async function executeSearch(query) {
  query = (query || "").trim();
  state.search.query = query;
  state.search.matches = [];
  state.search.currentMatchIndex = -1;

  if (state.editor.active) {
    executeEditorSearch(query);
    return;
  }

  if (!query || !state.doc) {
    el.findResults.textContent = "";
    clearAllHighlights();
    return;
  }

  el.findResults.textContent = "…";

  const lowerQuery = query.toLowerCase();
  const allMatches = [];

  for (let i = 0; i < state.pages.length; i++) {
    const p = state.pages[i];
    if (!p.textContent) {
      try {
        p.textContent = await p.page.getTextContent();
      } catch {
        continue;
      }
    }
    for (const item of p.textContent.items) {
      if (!item.str) continue;
      const strLower = item.str.toLowerCase();
      let pos = 0;
      while ((pos = strLower.indexOf(lowerQuery, pos)) !== -1) {
        allMatches.push({
          pageIndex: i,
        });
        pos += lowerQuery.length;
      }
    }
  }

  state.search.matches = allMatches;

  if (allMatches.length === 0) {
    el.findResults.textContent = "0 of 0";
    clearAllHighlights();
    return;
  }

  let targetIndex = allMatches.findIndex((m) => m.pageIndex >= state.currentPage - 1);
  if (targetIndex < 0) targetIndex = 0;

  goToMatch(targetIndex);
}

export function executeEditorSearch(query) {
  if (!query || !quill) {
    el.findResults.textContent = "";
    return;
  }
  const text = quill.getText();
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const allMatches = [];
  let pos = 0;
  while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
    allMatches.push({ index: pos, length: query.length });
    pos += lowerQuery.length;
  }
  state.search.matches = allMatches;
  if (allMatches.length === 0) {
    el.findResults.textContent = "0 of 0";
    return;
  }
  const sel = quill.getSelection() || { index: 0 };
  let targetIndex = allMatches.findIndex((m) => m.index >= sel.index);
  if (targetIndex < 0) targetIndex = 0;
  goToEditorMatch(targetIndex);
}

export function goToEditorMatch(index) {
  if (!state.search.matches.length || !quill) return;
  state.search.currentMatchIndex = (index + state.search.matches.length) % state.search.matches.length;
  const current = state.search.matches[state.search.currentMatchIndex];
  el.findResults.textContent = `${state.search.currentMatchIndex + 1} of ${state.search.matches.length}`;
  quill.setSelection(current.index, current.length, "user");
  quill.scrollIntoView();
}

export function goToMatch(index) {
  if (!state.search.matches.length) return;
  state.search.currentMatchIndex = (index + state.search.matches.length) % state.search.matches.length;
  const current = state.search.matches[state.search.currentMatchIndex];

  el.findResults.textContent = `${state.search.currentMatchIndex + 1} of ${state.search.matches.length}`;

  for (const p of state.pages) {
    if (p.rendered) {
      highlightPage(p);
    }
  }

  scrollToPage(current.pageIndex);

  setTimeout(() => {
    const active = el.pageHost.querySelector(".textLayer .highlight.selected");
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, 100);
}

export function findNext() {
  if (!state.search.matches.length) {
    if (el.findInput.value) executeSearch(el.findInput.value);
    return;
  }
  if (state.editor.active) {
    goToEditorMatch(state.search.currentMatchIndex + 1);
  } else {
    goToMatch(state.search.currentMatchIndex + 1);
  }
}

export function findPrev() {
  if (!state.search.matches.length) {
    if (el.findInput.value) executeSearch(el.findInput.value);
    return;
  }
  if (state.editor.active) {
    goToEditorMatch(state.search.currentMatchIndex - 1);
  } else {
    goToMatch(state.search.currentMatchIndex - 1);
  }
}

export function highlightPage(p) {
  const query = state.search.query;
  if (!query || !p.textDiv) return;
  clearHighlightsOnPage(p);

  const lowerQuery = query.toLowerCase();
  const pageMatches = state.search.matches.filter((m) => m.pageIndex === p.n - 1);
  if (!pageMatches.length) return;

  const spans = Array.from(p.textDiv.querySelectorAll("span"));
  if (!spans.length) return;

  const firstGlobalMatchIdx = state.search.matches.findIndex((m) => m.pageIndex === p.n - 1);
  let matchCounter = 0;

  for (const span of spans) {
    if (span.classList.contains("highlight")) continue;
    const rawText = span.textContent;
    const lower = rawText.toLowerCase();
    if (!lower.includes(lowerQuery)) continue;

    const fragment = document.createDocumentFragment();
    let lastIdx = 0;
    let idx = 0;
    while ((idx = lower.indexOf(lowerQuery, lastIdx)) !== -1) {
      if (idx > lastIdx) {
        fragment.appendChild(document.createTextNode(rawText.slice(lastIdx, idx)));
      }
      const matchSpan = document.createElement("span");
      matchSpan.className = "highlight";
      const globalIdx = firstGlobalMatchIdx + matchCounter;
      if (globalIdx === state.search.currentMatchIndex) {
        matchSpan.classList.add("selected");
      }
      matchSpan.textContent = rawText.slice(idx, idx + query.length);
      fragment.appendChild(matchSpan);
      matchCounter++;
      lastIdx = idx + query.length;
    }
    if (lastIdx < rawText.length) {
      fragment.appendChild(document.createTextNode(rawText.slice(lastIdx)));
    }
    span.textContent = "";
    span.appendChild(fragment);
  }
}

export function clearHighlightsOnPage(p) {
  if (!p.textDiv) return;
  const highlights = p.textDiv.querySelectorAll(".highlight");
  for (const h of highlights) {
    const parent = h.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(h.textContent), h);
      parent.normalize();
    }
  }
}

export function clearAllHighlights() {
  for (const p of state.pages) {
    clearHighlightsOnPage(p);
  }
}

