/* global document -- page callbacks run in the browser */
// App icons, /favicon.ico and the share image (#47): writes src/brand/flame.svg (the flame engine's
// still frame, the logo's one source), then public/favicon.svg (that flame on the graphite tile
// read from HDS's variables.css), then renders it and a brand card to PNG with headless Chromium,
// so the app icons, /favicon.ico and the Open Graph image are reproducible.
// Re-run after a brand change and commit the PNGs:
//
//   npm run icons
//
// Chromium: PW_CHROMIUM_PATH (cloud sessions: /opt/pw-browsers/chromium),
// else Playwright's own. The name and description come from src/brand.ts (Node strips its types).
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { BRAND } from '../src/brand.ts';
import { hdsColor } from '../src/hdsColor.ts';
import { wordmarkMarkup } from '../src/brand/wordmarkMarkup.ts';
import { flameSvgFile } from '../src/brand/flameEngine.ts';

// First the source: src/brand/flame.svg is the flame engine's still frame (Version E), in the HDS
// primitives base.css recolours per theme. Everything below reads it.
writeFileSync(
  'src/brand/flame.svg',
  flameSvgFile([hdsColor('blue-500'), hdsColor('cobalt-400'), hdsColor('cobalt-200')]),
);
console.log('src/brand/flame.svg');

// The mark: src/brand/flame.svg as written (its own fills), placed as a nested svg in a box.
const flame = readFileSync('src/brand/flame.svg', 'utf8')
  .replace(/<!--[\s\S]*?-->\s*/g, '')
  .trim();
const placed = (x, y, w, h) =>
  flame
    .replace(/\sxmlns="[^"]*"/, '')
    .replace('<svg ', `<svg x="${x}" y="${y}" width="${w}" height="${h}" `);
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${BRAND.name}">` +
  `<rect width="64" height="64" rx="14" fill="${hdsColor('graphite-900')}"/>` +
  `${placed(10, 8, 44, 48)}</svg>\n`;
writeFileSync('public/favicon.svg', svg);
console.log('public/favicon.svg');
const dataUrl = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`;
const svgUrl = dataUrl(svg);
// HDS's own face (one variable font since HDS 0.30), inlined: a page set with setContent can't
// load file:// fonts.
const font = `data:font/woff2;base64,${readFileSync(
  'node_modules/@hirobius/design-system/dist/fonts/plus-jakarta-sans-variable.woff2',
).toString('base64')}`;
// The tile and the card: HDS graphite, light face.
const GRAPHITE = hdsColor('graphite-900');
const FACE = '#d4d0d2';

// The wordmark's face (HDS display, Sora 700) and its own CSS (src/brand/wordmark.css), so the
// share image draws the app's wordmark from the same markup (wordmarkMarkup).
const display = `data:font/woff2;base64,${readFileSync(
  'node_modules/@hirobius/design-system/dist/fonts/sora-700.woff2',
).toString('base64')}`;
const wordmarkCss = readFileSync('src/brand/wordmark.css', 'utf8');

const page = (body, w, h) => `<!doctype html><html><head><style>
  @font-face { font-family: Brand; src: url(${font}) format('woff2'); font-weight: 200 800; }
  @font-face { font-family: Display; src: url(${display}) format('woff2'); font-weight: 700; }
  ${wordmarkCss}
  html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
  body { background: ${GRAPHITE}; font-family: Brand, sans-serif; }
</style></head><body>${body}</body></html>`;

// Plain icons are the SVG edge to edge; the maskable one keeps the mark inside the 80% safe zone
// on a full graphite square, so a launcher's circle or squircle never clips it. iOS rounds the
// touch icon itself and paints transparency black, so it gets the full square too.
const ICONS = [
  { file: 'icon-192.png', size: 192, inset: 0 },
  { file: 'icon-512.png', size: 512, inset: 0 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.12 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.08 },
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
try {
  for (const { file, size, inset } of ICONS) {
    const p = await browser.newPage({ viewport: { width: size, height: size } });
    const pad = Math.round(size * inset);
    const bg = inset ? GRAPHITE : 'transparent';
    await p.setContent(
      page(
        `<div style="width:${size}px;height:${size}px;background:${bg};box-sizing:border-box;padding:${pad}px">` +
          `<img src="${svgUrl}" style="width:100%;height:100%;display:block"></div>`,
        size,
        size,
      ),
    );
    await p.screenshot({ path: `public/${file}`, omitBackground: !inset });
    await p.close();
    console.log(`public/${file}`);
  }

  // /favicon.ico: one 32px PNG in an ICO container (PNG entries are valid ICO since Vista), for
  // crawlers and browsers that ask for /favicon.ico whatever the page links.
  {
    const p = await browser.newPage({ viewport: { width: 32, height: 32 } });
    await p.setContent(
      page(`<img src="${svgUrl}" style="width:32px;height:32px;display:block">`, 32, 32),
    );
    const png = await p.screenshot({ omitBackground: true });
    await p.close();
    const head = Buffer.alloc(22);
    head.writeUInt16LE(0, 0); // reserved
    head.writeUInt16LE(1, 2); // type: icon
    head.writeUInt16LE(1, 4); // one image
    head.writeUInt8(32, 6); // width
    head.writeUInt8(32, 7); // height
    head.writeUInt8(0, 8); // no palette
    head.writeUInt8(0, 9); // reserved
    head.writeUInt16LE(1, 10); // colour planes
    head.writeUInt16LE(32, 12); // bits per pixel
    head.writeUInt32LE(png.length, 14);
    head.writeUInt32LE(22, 18); // the PNG starts right after this header
    writeFileSync('public/favicon.ico', Buffer.concat([head, png]));
    console.log('public/favicon.ico');
  }

  const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(
    page(
      `<div style="display:flex;flex-direction:column;justify-content:center;height:100%;padding:0 96px;box-sizing:border-box;color:${FACE}">
        <div class="rjb-logo-word" style="font-family:Display,sans-serif;font-size:128px;font-weight:700;line-height:1;color:#fff">${wordmarkMarkup(flame)}</div>
        <div style="font-size:36px;line-height:1.35;margin-top:40px;max-width:960px">${BRAND.description}</div>
      </div>`,
      1200,
      630,
    ),
  );
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: 'public/og-image.png' });
  console.log('public/og-image.png');
} finally {
  await browser.close();
}
