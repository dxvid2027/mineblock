// Rasterizes the icon geometry (tools/iconArt.mjs) to PNGs at every size the
// app/manifest needs, via a headless page (Playwright, dev-only — not a
// project dependency; install `playwright-core` + a Chromium build to
// re-run this). Run with: node tools/gen-png.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { buildIcon } from './iconArt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../src/public/icons');
mkdirSync(outDir, { recursive: true });

const SIZES = [512, 192, 180, 32, 16];

async function render(page, size, { maskable = false } = {}) {
  const { cells, meta } = buildIcon(size, { contentScale: maskable ? 0.62 : 1 });
  const dataUrl = await page.evaluate(({ size, cells, meta, maskable }) => {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createRadialGradient(size * 0.5, size * 0.38, 0, size * 0.5, size * 0.38, size * 0.75);
    bg.addColorStop(0, '#2a3a2a');
    bg.addColorStop(0.45, '#161c28');
    bg.addColorStop(1, '#0a0d14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    const glow = ctx.createRadialGradient(meta.cx, meta.glowY, 0, meta.cx, meta.glowY, size * 0.42);
    glow.addColorStop(0, 'rgba(143,224,122,0.35)');
    glow.addColorStop(1, 'rgba(143,224,122,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(meta.cx, meta.glowY, size * 0.42, size * 0.34, 0, 0, Math.PI * 2); ctx.fill();

    const shadowW = (meta.right - meta.left) * 0.42;
    const shadow = ctx.createRadialGradient(meta.cx, meta.bottom + size * 0.03, 0, meta.cx, meta.bottom + size * 0.03, shadowW);
    shadow.addColorStop(0, 'rgba(0,0,0,0.45)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath(); ctx.ellipse(meta.cx, meta.bottom + size * 0.03, shadowW, size * 0.045, 0, 0, Math.PI * 2); ctx.fill();

    for (const cell of cells) {
      ctx.fillStyle = cell.color;
      ctx.beginPath();
      ctx.moveTo(cell.points[0][0], cell.points[0][1]);
      for (let i = 1; i < cell.points.length; i++) ctx.lineTo(cell.points[i][0], cell.points[i][1]);
      ctx.closePath();
      ctx.fill();
    }

    return canvas.toDataURL('image/png');
  }, { size, cells, meta, maskable });

  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');

for (const size of SIZES) {
  const buf = await render(page, size);
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, buf);
  console.log('Wrote', file);
}

const maskableBuf = await render(page, 512, { maskable: true });
writeFileSync(join(outDir, 'icon-512-maskable.png'), maskableBuf);
console.log('Wrote', join(outDir, 'icon-512-maskable.png'));

await browser.close();
