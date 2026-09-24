const path = require("node:path");
const fs = require("node:fs/promises");
const { makeTestPdf } = require("../electron/utils/pdf-helpers");

async function runAppSmoke({ app, mainWindow }) {
  const poll = async (fn, timeout) => {
    const start = Date.now();
    for (;;) {
      try {
        const v = await fn();
        if (v) return v;
      } catch {
        // keep polling
      }
      if (Date.now() - start > timeout) return null;
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  mainWindow.webContents.on("console-message", (event) => {
    const message = typeof event.message === "string" ? event.message : event;
    console.log("[renderer]", message);
  });
  try {
    const ready = await poll(() => mainWindow.webContents.executeJavaScript("Boolean(window.__pdfViewerReady)"), 15000);
    if (!ready) throw new Error("renderer did not become ready");

    const smokeFile = process.env.PDFVIEWER_SMOKE_FILE;
    const expectedPages = process.env.PDFVIEWER_SMOKE_PAGES;
    if (smokeFile) {
      const buf = await fs.readFile(smokeFile);
      mainWindow.webContents.send("open-file", {
        name: path.basename(smokeFile),
        data: new Uint8Array(buf),
      });
    } else if (!expectedPages) {
      mainWindow.webContents.send("open-file", {
        name: "smoke.pdf",
        data: new Uint8Array(makeTestPdf()),
      });
    }

    const expect = `of ${expectedPages || "1"}`;
    const ok = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          `document.getElementById('page-indicator').textContent.includes('${expect}') && ` +
            "document.querySelector('.pdf-canvas').width > 0"
        ),
      20000
    );
    if (!ok) {
      const diag = await mainWindow.webContents.executeJavaScript(
        "JSON.stringify({ err: document.getElementById('error-message').textContent, " +
          "pages: document.querySelectorAll('.pdf-page').length, " +
          "globalErr: window.__pdfViewerError || null, " +
          "indicator: document.getElementById('page-indicator').textContent })"
      );
      console.error("[smoke] diagnostics:", diag);
      throw new Error("document did not render (indicator or canvas failed)");
    }
    const thumbs = await mainWindow.webContents.executeJavaScript(
      "document.querySelectorAll('.thumb').length"
    );
    if (thumbs !== Number(expectedPages || 1)) {
      throw new Error(`expected ${expectedPages} thumbnails, found ${thumbs}`);
    }
    const allThumbsRendered = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          "document.querySelectorAll('.thumb canvas').length === " +
            (expectedPages || 1) +
            " && Array.from(document.querySelectorAll('.thumb canvas')).every((c) => c.width > 0 && c.height > 0)"
        ),
      10000
    );
    console.log("[smoke] all thumbnails rendered:", Boolean(allThumbsRendered));
    if (!allThumbsRendered) throw new Error("thumbnails failed to render");

    const allViewerPagesRendered = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          "document.querySelectorAll('#page-host .pdf-canvas').length === " +
            (expectedPages || 1) +
            " && Array.from(document.querySelectorAll('#page-host .pdf-canvas')).every((c) => c.width > 0)"
        ),
      10000
    );
    console.log("[smoke] all viewer pages rendered:", Boolean(allViewerPagesRendered));
    if (!allViewerPagesRendered) throw new Error("viewer pages failed to render");
    const editorOpened = await mainWindow.webContents.executeJavaScript(
      "document.getElementById('btn-new').click(); true"
    );
    const editorOk = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          "!document.getElementById('editor-view').hidden && " +
            "!!document.querySelector('#editor-content .ql-editor') && " +
            "typeof window.Quill === 'function'"
        ),
      15000
    );
    if (!editorOk) {
      throw new Error("editor did not initialize");
    }
    const wordElementsOk = await mainWindow.webContents.executeJavaScript(
      "Boolean(document.getElementById('quill-toolbar') && " +
        "document.getElementById('word-workspace') && " +
        "document.getElementById('word-page-sheet') && " +
        "document.getElementById('editor-name-input') && " +
        "document.getElementById('btn-insert-page-break'))"
    );
    console.log("[smoke] word elements ok:", wordElementsOk);
    if (!wordElementsOk) throw new Error("Word UI elements missing");
    const seeded = await mainWindow.webContents.executeJavaScript(
      "window.__quill.setContents([{ insert: 'Hello ', attributes: { bold: true } }, { insert: 'World! Great day.' }]); " +
        "window.__quill.formatLine(0, 1, 'align', 'center'); " +
        "window.__quill.getSemanticHTML();"
    );
    console.log("[smoke] rich html:", seeded);
    const pageBreakSeed = await mainWindow.webContents.executeJavaScript(
      "(() => { window.__quill.setText('Intro text.\\n\\f\\nSecond page text.'); return window.__quill.getSemanticHTML(); })()"
    );
    console.log("[smoke] page break html:", pageBreakSeed);
    const tabsOk = await mainWindow.webContents.executeJavaScript(
      "Boolean(document.getElementById('tab-bar') && " +
        "document.getElementById('btn-new-tab') && " +
        "document.getElementById('btn-split-view') && " +
        "document.getElementById('btn-two-page') && " +
        "document.querySelectorAll('.chrome-tab').length >= 1)"
    );
    console.log("[smoke] tabs and layout controls ok:", tabsOk);
    mainWindow.webContents.executeJavaScript("document.title").then((title) => console.log("[smoke] title:", title));

    const appInfo = await mainWindow.webContents.executeJavaScript("window.pdfViewer.getAppInfo()");
    console.log("[smoke] appInfo:", JSON.stringify(appInfo));
    if (!appInfo || appInfo.version !== app.getVersion() || !appInfo.electron || !appInfo.chrome) {
      throw new Error("app:get-info failed or returned invalid version info");
    }

    mainWindow.webContents.send("menu:command", "about");
    const aboutOk = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          "!document.getElementById('about-modal').hidden && document.getElementById('about-info-grid').children.length >= 6"
        ),
      5000
    );
    console.log("[smoke] about modal opened with info:", Boolean(aboutOk));
    if (!aboutOk) throw new Error("About modal did not open or populate");

    await mainWindow.webContents.executeJavaScript("document.getElementById('btn-about-close').click();");

    await mainWindow.webContents.executeJavaScript("document.getElementById('btn-info').click();");
    const propertiesOk = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          "!document.getElementById('properties-modal').hidden && Boolean(document.getElementById('btn-properties-copy')) && document.getElementById('properties-content').children.length >= 4"
        ),
      5000
    );
    console.log("[smoke] properties modal opened:", Boolean(propertiesOk));
    if (!propertiesOk) throw new Error("Properties modal did not open");

    await mainWindow.webContents.executeJavaScript("document.getElementById('btn-properties-close').click();");

    await mainWindow.webContents.executeJavaScript("document.getElementById('btn-print').click();");
    const printPreviewOk = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          "!document.getElementById('print-preview-modal').hidden && " +
            "Boolean(document.getElementById('btn-print-confirm')) && " +
            "Boolean(document.getElementById('btn-print-cancel')) && " +
            "Boolean(document.getElementById('print-pages-select'))"
        ),
      5000
    );
    console.log("[smoke] print preview modal opened:", Boolean(printPreviewOk));
    if (!printPreviewOk) throw new Error("Print preview modal did not open or populate");

    await mainWindow.webContents.executeJavaScript("document.getElementById('btn-print-preview-close').click();");

    // File Association & Icon Customizer Smoke Verification
    const assocStatus = await mainWindow.webContents.executeJavaScript("window.pdfViewer.getFileAssocStatus()");
    console.log("[smoke] fileAssoc status:", JSON.stringify(assocStatus));
    if (typeof assocStatus !== "object") throw new Error("getFileAssocStatus failed");

    const iconPrefs = await mainWindow.webContents.executeJavaScript("window.pdfViewer.getIconPreferences()");
    console.log("[smoke] iconPrefs presets count:", iconPrefs?.presets?.length);
    if (!iconPrefs || !Array.isArray(iconPrefs.presets) || iconPrefs.presets.length !== 4) {
      throw new Error("Preset icons missing or invalid");
    }

    mainWindow.webContents.send("menu:command", "preferences");
    const fileAssocModalOk = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          "!document.getElementById('file-assoc-modal').hidden && " +
            "Boolean(document.getElementById('btn-set-default')) && " +
            "Boolean(document.getElementById('default-app-badge')) && " +
            "document.querySelectorAll('#icon-picker-grid .icon-card').length === 5 && " +
            "Boolean(document.getElementById('explorer-preview-icon'))"
        ),
      5000
    );
    console.log("[smoke] file-assoc modal opened:", Boolean(fileAssocModalOk));
    if (!fileAssocModalOk) throw new Error("File association modal did not open or populate");

    const badgeText = await mainWindow.webContents.executeJavaScript(
      "document.getElementById('default-app-badge').textContent"
    );
    console.log("[smoke] default app badge text:", badgeText.trim());
    if (!badgeText.includes("Default PDF Viewer")) {
      throw new Error("Expected default-app-badge to show Default PDF Viewer, got: " + badgeText);
    }

    await mainWindow.webContents.executeJavaScript("document.querySelector('[data-icon-id=\"classic\"]').click();");
    const cardSelectedOk = await mainWindow.webContents.executeJavaScript(
      "document.querySelector('[data-icon-id=\"classic\"]').classList.contains('selected') && " +
        "document.getElementById('explorer-preview-icon').innerHTML.includes('PDF')"
    );
    console.log("[smoke] card selection and preview ok:", Boolean(cardSelectedOk));
    if (!cardSelectedOk) throw new Error("Icon card selection or live preview failed");

    const applyRes = await mainWindow.webContents.executeJavaScript(
      "window.pdfViewer.applyPdfFileIcon({ iconId: 'classic' })"
    );
    console.log("[smoke] apply icon result:", JSON.stringify(applyRes));
    if (!applyRes?.success) throw new Error("applyPdfFileIcon failed: " + JSON.stringify(applyRes));

    await mainWindow.webContents.executeJavaScript("document.getElementById('btn-file-assoc-close').click();");
    const closedOk = await poll(
      () => mainWindow.webContents.executeJavaScript("document.getElementById('file-assoc-modal').hidden"),
      3000
    );
    console.log("[smoke] file-assoc modal closed ok:", Boolean(closedOk));
    if (!closedOk) throw new Error("File association modal did not close");

    // Multi-Tab & Split View Smoke Verification
    console.log("[smoke] Verifying multi-tab switching and thumbnail preservation...");
    // Currently on Tab 1 (PDF)
    // Switch to Tab 2 (the editor tab created earlier)
    await mainWindow.webContents.executeJavaScript("document.querySelectorAll('.chrome-tab')[1].click(); true;");
    const tab2EditorOk = await poll(
      () => mainWindow.webContents.executeJavaScript("!document.getElementById('editor-view').hidden"),
      4000
    );
    console.log("[smoke] tab 2 is active editor:", Boolean(tab2EditorOk));
    if (!tab2EditorOk) throw new Error("Tab 2 is not in editor mode");

    // Switch back to Tab 1 (PDF tab)
    await mainWindow.webContents.executeJavaScript("document.querySelectorAll('.chrome-tab')[0].click(); true;");
    const tab1PdfOk = await poll(
      () =>
        mainWindow.webContents.executeJavaScript(
          "document.getElementById('editor-view').hidden && " +
            "!document.getElementById('doc-name').textContent.includes('Document1') && " +
            "document.querySelectorAll('.thumb').length >= 1"
        ),
      4000
    );
    console.log("[smoke] tab 1 preserved as PDF with thumbnails:", Boolean(tab1PdfOk));
    if (!tab1PdfOk) throw new Error("Tab 1 mutated to editor or lost thumbnails on return!");

    // Test Split View enhancements
    console.log("[smoke] Verifying enhanced Split View...");
    await mainWindow.webContents.executeJavaScript("document.getElementById('btn-split-view').click(); true;");
    const splitOpened = await poll(
      () => mainWindow.webContents.executeJavaScript("!document.getElementById('secondary-pane').hidden"),
      4000
    );
    console.log("[smoke] split view opened:", Boolean(splitOpened));
    if (!splitOpened) throw new Error("Split view did not open");

    const splitSelectCount = await mainWindow.webContents.executeJavaScript(
      "document.querySelectorAll('#split-doc-select option').length"
    );
    console.log("[smoke] split-doc-select options count:", splitSelectCount);
    if (splitSelectCount < 2) throw new Error("split-doc-select did not populate with options");

    const splitCanvasOk = await poll(
      () => mainWindow.webContents.executeJavaScript("document.querySelectorAll('#secondary-page-host canvas').length >= 1"),
      8000
    );
    console.log("[smoke] split view canvas rendered:", Boolean(splitCanvasOk));
    if (!splitCanvasOk) throw new Error("Split view document did not render");

    // Close split view
    await mainWindow.webContents.executeJavaScript("document.getElementById('btn-close-split').click(); true;");
    const splitClosed = await poll(
      () => mainWindow.webContents.executeJavaScript("document.getElementById('secondary-pane').hidden"),
      3000
    );
    console.log("[smoke] split view closed ok:", Boolean(splitClosed));
    if (!splitClosed) throw new Error("Split view close button did not close pane");

    console.log("[smoke] PASS");
    app.exit(0);
  } catch (err) {
    console.error("[smoke] FAIL:", err && err.message);
    app.exit(1);
  }
}

module.exports = { runAppSmoke };