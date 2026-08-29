// Writes src/public/icon.svg from the shared icon geometry (tools/iconArt.mjs).
// Run with: node tools/gen-svg.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIcon } from './iconArt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../src/public');
mkdirSync(outDir, { recursive: true });

const SIZE = 512;
const { cells, meta } = buildIcon(SIZE);

const polys = cells
  .map((c) => `<polygon points="${c.points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="${c.color}"/>`)
  .join('\n    ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="#2a3a2a"/>
      <stop offset="45%" stop-color="#161c28"/>
      <stop offset="100%" stop-color="#0a0d14"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8fe07a" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#8fe07a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shadow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <ellipse cx="${meta.cx}" cy="${meta.glowY}" rx="${SIZE * 0.42}" ry="${SIZE * 0.34}" fill="url(#glow)"/>
  <ellipse cx="${meta.cx}" cy="${meta.bottom + SIZE * 0.03}" rx="${(meta.right - meta.left) * 0.42}" ry="${SIZE * 0.045}" fill="url(#shadow)"/>
  <g stroke="none">
    ${polys}
  </g>
</svg>
`;

writeFileSync(join(outDir, 'icon.svg'), svg, 'utf-8');
console.log('Wrote', join(outDir, 'icon.svg'));
