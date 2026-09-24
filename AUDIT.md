# PDFForge Viewer — Full System Audit

**Repo:** `C:\laragon\www\pdf-forge-viewer`
**Version audited:** 1.1.0
**Date:** 2026-09-24
**Platform:** Windows (win32), Node v24.16.0
**Verdict:** Functional, well-structured, security-conscious. Several real bugs and notable gaps in testing, dirty-state tracking, and large-document handling.

---

## 1. What the app is

A fast, private, offline desktop PDF **viewer + creator** built with Electron. It renders PDFs locally with pdf.js (no cloud upload), provides a Chrome-style multi-tab UI, a Word-like rich-text editor (Quill) that exports to PDF via pdf-lib, split-view reading, search, print preview, thumbnails, outline navigation, and a Windows file-association + .pdf-icon customizer.

### Verified working (`npm run lint`, `npm run test:rich`)
- All 6 main-process files pass syntax checks.
- Rich-text → PDF conversion smoke test passes (5,575 bytes generated).

---

## 2. Architecture

```
electron/
├── main.js                 Main process: window, app:// protocol, IPC, menu, smoke test
├── preload.js              Context-isolated bridge (window.pdfViewer.*)
├── services/
│   ├── file-association.js Windows registry: default .pdf handler + icon
│   ├── text-to-pdf.js      Plain text → PDF (pdf-lib, font embedding, wrap)
│   └── rich-to-pdf.js      Quill HTML → PDF (inline styles, lists, page breaks)
└── utils/pdf-helpers.js    CLI PDF arg parsing, smoke-test PDF builder

renderer/
├── index.html              All markup + Quill ribbon UI (1,162 lines)
├── pdf-worker.mjs          pdf.js worker entry
├── polyfills.js            Uint8Array toHex/setFromHex shims
├── core/state.js           Central mutable state (doc, editor, tabs, split, …)
├── core/elements.js        All DOM lookups in one place
├── core/init.js            Bootstrap: events, keyboard, drag-drop, menu commands
├── components/             Modals: about, properties, password, file-assoc, etc.
├── features/
│   ├── viewer/             page layout, zoom, rotate, render pump, annotations
│   ├── tabs/               multi-tab, split view, context menu, drag reorder
│   ├── editor/             Quill integration, Word ribbon, PDF export
│   ├── thumbnails/         sidebar thumbs + outline tree
│   ├── search/             text search + highlights (viewer & editor)
│   ├── print/              print preview + system print
│   └── image-editor/       insert/resize images in editor
├── services/               document open/destroy, recent files, PDF options
├── utils/                  clamp, escapeHtml, size/date/paper helpers, theme
└── styles/                 8 CSS files (base, layout, viewer, editor, modals…)
```

Key design decisions:
- **Custom `app://` protocol** serves the renderer. `renderer/pdfjs/*` is a *virtual* namespace mapped to `node_modules/pdfjs-dist/build/`, and `/quill/` maps to `node_modules/quill/dist/` — no bundler, imports are resolved at runtime by the protocol handler.
- **Render pipeline:** pages build once (`buildPages`), then a `renderSeq` → rAF → `collectVisiblePages` → queue → `pumpRender` loop renders only visible pages. Thumbnails render in parallel (max 2 concurrent) with priority (active → visible → rest).
- **Target:** Windows NSIS installer only (win/nsis) with `.pdf` file association. macOS quirk exists (see Bug 3).

---

## 3. Tech stack

| Layer | Tech | Notes |
|---|---|---|
| Runtime | Electron ^44.4.3 | sandbox, contextIsolation, nodeIntegration off |
| PDF render | pdfjs-dist ^6.3.289 | ESM build, inline worker, no WASM |
| PDF create/edit | pdf-lib ^1.17.1 | text/rich→PDF, add blank page, append PDF |
| Rich editor | Quill ^2.0.3 | custom PageBreak/Hr blots, image resize |
| Styling | Vanilla CSS | 8 files, light/dark/system theme |
| Build | electron-builder ^26.0.12 | NSIS, asar |
| Tests | Node `--check` + Electron smoke + rich-smoke script | see §8 |

---

## 4. Security review — mostly strong

**Good:**
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `spellcheck: false`.
- Strict CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`. (`'unsafe-inline'` for styles is needed for Quill inline styles — acceptable but loosens style CSP.)
- Custom protocol handler has both a path-traversal guard and an allow-list (renderer/assets/pdfjs/quill roots) — good defense-in-depth (`electron/main.js:62-76`).
- `setWindowOpenHandler` routes external http(s) to `shell.openExternal`, denies everything else; `will-navigate` is prevented (`main.js:115-120`).
- Preload exposes a minimal, explicit API surface.
- `dangerouslyPasteHTML` / img `src` content is only used for user-authored editor content and local/URL images the user chooses.
- RegEx registry writes use `execFile` args arrays (no shell interpolation) and copy icons into `userData` with stable paths (`file-association.js:203-251`).

**Findings / hardening ideas:**
- `file:read` IPC currently lets the sandboxed renderer read **any absolute path** (`main.js:605`). If a future XSS ever occurred, that is full local-file read. Consider validating the path is under an allowed root (e.g. a recent-files dir) or opening via `dialog.showOpenDialog` only.
- CSP `connect-src`/`img-src` include `https: http:` to support URL-embedded images in the editor. This is the one feature that can touch the network; the "100% Offline" claim is technically true-by-default but slightly overstated in the About modal — flag it if strict privacy matters.
- No `electron/fuses` hardening (ASAR integrity, etc.) — optional for a local viewer.
- `about-modal.js` inserts some row values as raw HTML (only for the hard-coded pills + trusted `osString`), while `properties-modal` escapes all values. Keep the inconsistency in mind — if any About row ever sources user data, it must be escaped.

---

## 5. Feature inventory (implemented)

- Continuous scroll PDF viewer (fit-width / fit-page / actual size / fixed zoom 10%–400%)
- Multi-page render queue + DPR-aware canvas
- Thumbnail rail with lazy render + active-page sync; outline tree navigation
- Multi-tab (New, Close, cycle Ctrl+Tab, middle-click close, drag reorder, context menu: close others/right, duplicate, open in split)
- Split view with draggable divider + document selector (Ctrl+Alt+S)
- Two-page spread mode (Ctrl+Alt+2)
- Zoom/rotate, keyboard + Ctrl+wheel
- Text search with highlights (PDF text layer + editor)
- Print preview modal (range, current, custom, orientation, grayscale, copies)
- Editor: Quill ribbon (fonts, sizes, colors, lists, alignment), page breaks, HR, images (device + URL) with resize handles, layout options (paper, margins, spacing, page numbers, title/author)
- PDF editing: add blank page, append another PDF (via pdf-lib IPC)
- Password-protected PDF prompt
- Properties modal (PDF + editor metadata) with copy
- About modal, shortcuts modal, toast notifications
- Recent files (5), drag & drop, file dialog, CLI arg, second-instance file open, `.pdf` file association
- Light/dark/system themes, persisted
- Windows file-icon customization (brand/classic/dark/minimal/custom .ico) with Explorer refresh
- App info (Electron/Chrome/Node/V8/OS)

---

## 6. Bugs & issues found

### Critical / correctness

1. **Triple concurrent `openDocument()` when opening a PDF** — real race condition.
   `createNewTab()` with data calls `restoreTab(newTab)` first; `restoreTab` hits the "self-healing" branch `(!tab.doc || tab.doc.destroyed) && tab.data → void openDocument(...); return` (`tabs.js:295-297`). Then `createNewTab` itself calls `openDocument` again (`tabs.js:436-438`). Then the callers `openMultipleFiles` / `duplicateTab` call it AGAIN (`tabs.js:520-522`). So a single file open triggers **3 concurrent loads** that each run `destroyDocument()` and `getDocument()`. The second load destroys the first task's `loadingTask` (`document-service.js:49-57`), the first's `await task.promise` rejects, and the error path (`showError`) can flash the error screen before the last load wins. It's wasteful (3× PDF parse) and causes intermittent loading-bar/error flash, especially for large or slow files.
   **Fix:** let `createNewTab` open *or* the caller open, never both; or add a "load in progress" guard in `openDocument`.

2. **`state.pdfModified` is never set to `true`** — dirty tracking for edited PDFs is dead code.
   When a user adds a blank page (`viewer.js:534-554`) or appends a PDF (`viewer.js:556-582`), the in-memory document changes but the dirty flag stays off. The tab shows no unsaved dot and closing the app does **not** warn (unsaved-warning reads `state.pdfModified`/`tab.dirty` which are only ever set to `false`). The Save flow exists and works, but the warning half is broken.
   **Fix:** set `state.pdfModified = true` (and `tab.dirty = true`) in `addBlankPageToCurrentDoc`/`appendPdfToCurrentDoc`.

3. **`ipcMain.handle("app:confirm-close")` is registered inside `createWindow()`** (`main.js:139-147`).
   On macOS, closing the last window doesn't quit; re-activating calls `createWindow()` again (`main.js:725-727`), and re-registering the handler throws *"Attempted to register a second handler"*. macOS users: close all windows → relaunch → crash path.
   **Fix:** move the handler out of `createWindow` (register once in `whenReady`), and make it operate on `mainWindow`/event sender rather than closure `win`.

### Moderate

4. **Memorized caveats for split view:** `renderSplitDoc` (`tabs.js:662-723`) renders **every page synchronously, sequentially** into one scroll host, awaiting each render. A 500-page PDF will freeze the UI for a long time. Use the same virtualized render pump as the main viewer (or at least cap pages).

5. **Full-file byte duplication:** every tab snapshot `.slice()`s the whole PDF (`tabs.js:242`, `tabs.js:589`, `document-service.js:131`). Opening a 100 MB PDF in 5 tabs ≈ up to 500 MB. Consider `Blob`/shared `ArrayBuffer` or a per-file ref-count.

6. **Inconsistent "are you sure?" UX:** `closeTab` and `exitEditor` use native `window.confirm` while window-close uses the custom unsaved modal (`tabs.js:448`, `editor.js:466`). Result: mixed look, and the custom modal can't be styled/translated. Also `closeTab`'s confirm can't "Save".

7. **Print preview for the editor is not paginated:** the preview is one fixed 480×520 sheet (`print.js:108-120`) and the printed output is `quill.root.innerHTML` into one sheet — Word page-breaks (`.word-page-break`) are real `<div>`s but are not converted to PDF pagination; the PDF export is paginated correctly, but screen preview ≠ print output.

8. **`setupQuillPickerLabels()` runs on every `init`** (once, fine now) but labels must stay in sync with `syncOptionsToFields` custom spacing options — fragile coupling between two hand-rolled label maps.

9. **Font fidelity:** editor default is "Calibri" and offers 7 fonts, but `rich-to-pdf.js` only embeds **Arial variants** (`rich-to-pdf.js:11`). Selecting Times/Georgia/Segoe in the editor silently exports as Helvetica/Arial. Either map to real font files or rename the picker options.

### Low / polish

10. **`runSmoke()` (~300 lines) lives inside `electron/main.js`** and is coupled to DOM ids via strings. Extract to `scripts/` — its exact-version assertion `version !== "1.1.0"` (`main.js:366`) will break the smoke test on the very next version bump.
11. **"Preferences…" triggers the file-association/icon modal** (`main.js:217`, `init.js:700-702`). Fine, but it's the only "settings" surface; a real Preferences dialog (default zoom, show on startup, recent files count) would be more honest.
12. **Window background doesn't update when theme changes** (`BrowserWindow backgroundColor` set once at creation, `main.js:100`).
13. **`npm run lint` ignores all renderer code** (only checks `electron/*`), and `tests/smoke.test.js` is a placeholder — the renderer is validated only by the in-process smoke test which needs a display. See §8.
14. `about-info-grid` values not escaped uniformly (see §4 note).
15. `getTheme()` reflects `shouldUseDarkColors` at call time; `nativeTheme` is set to `'system'` in main but renderer theme is localStorage-driven — the two can disagree until first toggle.

---

## 7. Performance notes

- **Good:** scroll throttled via rAF; render queue only for visible ±3 pages; thumbnails capped at 2 concurrent; DPR-aware canvas.
- **Watch items:** (a) `buildPages` awaits `getPage` for every page up-front — fine for typical docs, slow for thousands of pages; (b) search scans every page and calls `getTextContent()` for each lazily (`search.js:62-82`) — first search on big files can take seconds; (c) split view full render (Bug 4); (d) PDF add-page/append round-trips the **entire** file through IPC + pdf-lib (`pdf:add-blank-page`, `pdf:append-pdf`).

---

## 8. Testing & CI

**What exists:**
- `npm run lint` — syntax check, main-process only ✅
- `npm run test:rich` — rich HTML → PDF conversion ✅
- `npm run smoke` — full Electron run gated by `--smoke`, verifies: renderer ready, page indicator, canvas, thumbnails, viewer pages, editor init, quill modules, page-break seed, tabs/split UI, app info, about modal, properties modal, print preview modal, file-assoc status/presets, icon apply, tab switching, split open/close.

**Gaps:**
- No unit or integration tests for: `text-to-pdf`, file-association registry logic, recent-files, PDF options persistence, viewer math (zoom/fit/effectiveScale), search matching, page-range parsing, or any renderer module.
- Smoke test cannot run headless on CI without a display server / `xvfb` on Linux; no CI workflow file at all.
- Smoke test asserts hard-coded version (Bug 10).
- `tests/` folder: 1 placeholder file.

**Recommend:** extract renderer logic into pure functions where possible and add Node tests (or Vitest); at minimum test `textToPdf`/`richToPdf` output (page count, page-break behavior), `parsePageRange`, and `firstPdfArg`. Add a minimal GitHub Actions workflow running lint + rich-smoke (+ smoke on a self-hosted/windows runner).

---

## 9. Accessibility snapshot

- Decent: `role="tablist"/"tab"`, `aria-selected`, `aria-expanded` on thumbs, `<button type="button">` everywhere, keyboard support for nearly every action, alt text on icons via `title`.
- Gaps: modals don't trap focus, no `aria-modal`/`role="dialog"`, no focus return on close; some icon buttons lack accessible names beyond title; find-bar/zoom-select/layout selects have labels but img-url-input is placeholder-only; the Quill toolbar relies on Quill's default ARIA. A WCAG 2.1 AA pass would be a good follow-up.

---

## 10. Recommended feature roadmap (prioritized)

### P0 — Fix first (correctness)
1. Add-blank-page / append-PDF dirty flag (Bug 2) — one-line fix, restores unsaved-changes safety.
2. De-duplicate `openDocument` calls in tab creation (Bug 1) — prevents race flashes + 3× file parse.
3. Move `app:confirm-close` handler out of `createWindow` (Bug 3) — unblocks macOS relаunch.

### P1 — High value
4. **Virtualized split view** (reuse render pump, only render visible secondary pages).
5. **Smart search UX**: match count per page in thumbnails, "next/prev" highlight only the active page (perf), debounce already OK.
6. **Real Preferences dialog**: default zoom/fit mode, startup behavior, recent-files count, theme default; move file-association/icon UI there as a tab.
7. **Crash/load guard + progress**: show page count while `buildPages` runs; abort stale loads (fixes load flash UX).
8. **Lazy-load Quill** (script + CSS + `initQuill`) only when the editor is opened — faster startup.

### P2 — Differentiators
9. **Form-fill support** (pdf-lib can flatten/acroform) & **annotations in editor** (highlight/notes) — big for a viewer.
10. **Export/import rich documents**: keep Quill content as `.html`/`.rtf` and re-open it; "Open .html → continue editing" workflow.
11. **Multi-language (i18n)** — all strings hardcoded English today.
12. **Print as PDF** (re-use pdf-lib path, "Save as PDF" already exists — add from viewer for annotated docs).
13. **Document compare / diff** side-by-side, or **bookmark & named-destination panel** beyond outline.
14. **Batch conversion** (text → PDF) via CLI/drag-drop of many `.txt` files.

### P3 — Nice-to-have
15. **Tab persistence** — restore last session's tabs/recent docs on startup.
16. **Drag-out to detach windows**, **tab pinning**, tab overflow scroll (already) → **group/stack**.
17. **Auto-update** (electron-updater) for packaged builds, with update channel + rollback.
18. **PDF safeguards**: password-protect export from editor; add PDF/A compliance option; embed metadata editing.
19. **Accessibility pass** (focus trap, aria-modal, visible focus rings).
20. **Cleaner packaging**: code-signing (or at least `electron/fuses`), proper NSIS icon set (multiple sizes), and a `.github/workflows` release pipeline.

---

## 11. Quick-fix list (in order of impact)

| # | Fix | Location |
|---|---|---|
| 1 | Set `state.pdfModified = true` + `tab.dirty` when PDF edited | `viewer.js` add/append page |
| 2 | Remove duplicate `openDocument` in `createNewTab`/`openMultipleFiles` | `tabs.js` |
| 3 | Register `app:confirm-close` once, outside `createWindow` | `main.js` |
| 4 | Skeleton/lazy-load Quill | `index.html`, `init.js` |
| 5 | Add `renderer/**` to lint + extract `runSmoke` to `scripts/` | `package.json`, `main.js` |
| 6 | Virtualize split-view rendering | `tabs.js:renderSplitDoc` |
| 7 | Add version-agnostic smoke assertion | `main.js` runSmoke |
| 8 | Map editor fonts to real font files or relabel picker | `rich-to-pdf.js`, `editor.js` |
| 9 | Focus-trap + `aria-modal` on modals | `index.html`/`modals.css` |
| 10 | Add CI workflow (lint + rich-smoke + unit tests) | `.github/workflows` |

---

## 12. Summary

| Area | Rating | Notes |
|---|---|---|
| Security | 8/10 | Strong IPC/protocol hygiene; harden `file:read`, CSP pragmatics |
| Architecture | 8/10 | Clean layering; no bundler is a neat choice but couples to protocol |
| Features | 8/10 | Viewer is feature-rich; editor is a nice bonus |
| Correctness | 6/10 | 3 real bugs (open race, dirty flag dead, macOS md re-register) |
| Performance | 7/10 | Solid viewer core; split view + search + memory scaling weak |
| Testing | 4/10 | Good smoke; no unit/CI, renderer unchecked, hard-coded version |
| Accessibility | 5/10 | Keyboard great; modals/focus need work |
| Polish/UX | 7/10 | Tabs/split/themes polished; Preferences naming + confirm UX inconsistent |

**Bottom line:** a solid, privacy-focused PDF viewer + basic document creator. Fix the 3 correctness bugs first (small changes), then virtualize split-view and add a real test/CI layer.