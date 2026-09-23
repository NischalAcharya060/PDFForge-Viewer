/**
 * Generates multi-resolution .ico, .png, and .svg files for the 4 preset PDF file icons.
 * Usage: npx electron scripts/generate-preset-icons.js
 */

const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const OUTPUT_DIR = path.join(__dirname, "..", "assets", "file-icons");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 4 Distinct, beautifully crafted SVG designs
const SVG_ICONS = {
  brand: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f04747"/>
        <stop offset="100%" stop-color="#c92a2a"/>
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" flood-opacity="0.25"/>
      </filter>
    </defs>
    <!-- Rounded App Background Tile -->
    <rect x="20" y="20" width="216" height="216" rx="52" fill="url(#bgGrad)" filter="url(#shadow)"/>
    <!-- Folded Paper Sheet -->
    <path d="M72 62 h76 l48 48 v78 a10 10 0 0 1 -10 10 H72 a10 10 0 0 1 -10 -10 V72 a10 10 0 0 1 10 -10 z" fill="#ffffff" opacity="0.96"/>
    <!-- Corner Fold -->
    <path d="M148 62 v44 a4 4 0 0 0 4 4 h44 z" fill="#e03131" opacity="0.45"/>
    <path d="M148 62 v44 a4 4 0 0 0 4 4 h44" fill="none" stroke="#c92a2a" stroke-width="2"/>
    <!-- PDF Text -->
    <text x="82" y="166" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="34" font-weight="900" fill="#e03131" letter-spacing="1">PDF</text>
    <!-- Document Lines -->
    <rect x="82" y="112" width="50" height="5" rx="2.5" fill="#f04747" opacity="0.4"/>
    <rect x="82" y="125" width="40" height="5" rx="2.5" fill="#f04747" opacity="0.3"/>
  </svg>`,

  classic: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
    <defs>
      <linearGradient id="classicRed" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e5484d"/>
        <stop offset="100%" stop-color="#c5282d"/>
      </linearGradient>
      <filter id="docShadow" x="-10%" y="-5%" width="120%" height="115%">
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.18"/>
      </filter>
    </defs>
    <!-- Crisp White Sheet with Subtle Border -->
    <path d="M48 28 h112 l52 52 v140 a8 8 0 0 1 -8 8 H48 a8 8 0 0 1 -8 -8 V36 a8 8 0 0 1 8 -8 z" fill="#ffffff" stroke="#dcdfe4" stroke-width="3" filter="url(#docShadow)"/>
    <!-- Folded Corner Sheet -->
    <path d="M160 28 v48 a4 4 0 0 0 4 4 h48 z" fill="#f0f2f5" stroke="#dcdfe4" stroke-width="2"/>
    <!-- Crimson PDF Header Banner -->
    <rect x="40" y="88" width="176" height="52" fill="url(#classicRed)"/>
    <!-- PDF Text inside banner -->
    <text x="128" y="125" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="30" font-weight="900" fill="#ffffff" letter-spacing="3">PDF</text>
    <!-- Decorative Paper Content Lines -->
    <rect x="68" y="162" width="120" height="6" rx="3" fill="#cbd1d8"/>
    <rect x="68" y="178" width="95" height="6" rx="3" fill="#e2e6eb"/>
    <rect x="68" y="194" width="110" height="6" rx="3" fill="#e2e6eb"/>
  </svg>`,

  dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
    <defs>
      <linearGradient id="darkBg" x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stop-color="#242832"/>
        <stop offset="100%" stop-color="#14171d"/>
      </linearGradient>
      <linearGradient id="rubyGlow" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ff4a4a"/>
        <stop offset="100%" stop-color="#dc2626"/>
      </linearGradient>
      <filter id="darkGlow" x="-15%" y="-10%" width="130%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.45"/>
      </filter>
    </defs>
    <!-- Dark Slate Sheet -->
    <path d="M48 26 h112 l52 52 v144 a10 10 0 0 1 -10 10 H48 a10 10 0 0 1 -10 -10 V36 a10 10 0 0 1 10 -10 z" fill="url(#darkBg)" stroke="#dc2626" stroke-width="2.5" filter="url(#darkGlow)"/>
    <!-- Folded Corner Sheet -->
    <path d="M160 26 v48 a4 4 0 0 0 4 4 h48 z" fill="#2d323e" stroke="#dc2626" stroke-width="2"/>
    <!-- Center Red Badge Accent -->
    <rect x="62" y="100" width="132" height="62" rx="10" fill="#2b1b22" stroke="#ef4444" stroke-width="1.8"/>
    <!-- Glowing PDF Text -->
    <text x="128" y="144" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="34" font-weight="900" fill="url(#rubyGlow)" letter-spacing="2">PDF</text>
    <!-- Futuristic Dark Preview Lines -->
    <rect x="66" y="184" width="124" height="4" rx="2" fill="#ef4444" opacity="0.35"/>
    <rect x="66" y="196" width="80" height="4" rx="2" fill="#ef4444" opacity="0.2"/>
  </svg>`,

  minimal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
    <defs>
      <filter id="minShadow" x="-10%" y="-5%" width="120%" height="115%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.14"/>
      </filter>
    </defs>
    <!-- Clean Crisp Document Outline -->
    <path d="M50 28 h110 l50 50 v142 a6 6 0 0 1 -6 6 H50 a6 6 0 0 1 -6 -6 V34 a6 6 0 0 1 6 -6 z" fill="#ffffff" stroke="#ef4444" stroke-width="4" filter="url(#minShadow)"/>
    <!-- Fold Line -->
    <path d="M160 28 v46 a4 4 0 0 0 4 4 h46" fill="none" stroke="#ef4444" stroke-width="3"/>
    <!-- Scarlet Ribbon Hanging Down -->
    <path d="M72 26 v60 l18 -10 l18 10 v-60 z" fill="#ef4444"/>
    <!-- Clean Minimalist PDF Typography -->
    <text x="128" y="152" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="36" font-weight="800" fill="#1f2328" letter-spacing="1">PDF</text>
    <!-- Single Accent Divider -->
    <rect x="88" y="170" width="80" height="3" rx="1.5" fill="#ef4444"/>
    <rect x="98" y="184" width="60" height="2.5" rx="1.2" fill="#9ca3af"/>
  </svg>`
};

/**
 * Packs array of PNG buffers { width, height, buffer } into a valid Windows .ico binary buffer
 */
function createIcoFromPngs(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + 16 * count;
  let currentOffset = headerSize;
  const dirEntries = [];

  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0); // width (0 = 256)
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(item.buffer.length, 8); // size
    entry.writeUInt32LE(currentOffset, 12); // offset
    dirEntries.push(entry);
    currentOffset += item.buffer.length;
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO type
  header.writeUInt16LE(count, 4); // count of images

  return Buffer.concat([header, ...dirEntries, ...pngBuffers.map((p) => p.buffer)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 400,
    height: 400,
    show: false,
    webPreferences: {
      offscreen: true,
    },
  });

  const html = `<!DOCTYPE html>
  <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;">
      <canvas id="c"></canvas>
    </body>
  </html>`;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  const SIZES = [16, 32, 48, 64, 128, 256];

  for (const [id, svgContent] of Object.entries(SVG_ICONS)) {
    console.log(`Generating icon for preset: ${id}...`);

    // Write the raw SVG
    const svgPath = path.join(OUTPUT_DIR, `${id}.svg`);
    fs.writeFileSync(svgPath, svgContent, "utf8");

    // Render across sizes via canvas in renderer
    const pngBuffers = [];
    for (const size of SIZES) {
      const dataUrl = await win.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
          const canvas = document.getElementById('c');
          canvas.width = ${size};
          canvas.height = ${size};
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, ${size}, ${size});

          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, ${size}, ${size});
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = (e) => reject(new Error('Failed to load SVG into image: ' + e));
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svgContent)});
        });
      `);

      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      pngBuffers.push({ width: size, height: size, buffer: buf });

      if (size === 256) {
        // Save the 256x256 PNG preview
        fs.writeFileSync(path.join(OUTPUT_DIR, `${id}.png`), buf);
      }
    }

    // Build the Windows .ico file
    const icoBuf = createIcoFromPngs(pngBuffers);
    const icoPath = path.join(OUTPUT_DIR, `${id}.ico`);
    fs.writeFileSync(icoPath, icoBuf);
    console.log(`  Saved: ${icoPath} (${icoBuf.length} bytes, ${pngBuffers.length} resolutions)`);
  }

  console.log("All preset icons generated successfully!");
  app.exit(0);
});
