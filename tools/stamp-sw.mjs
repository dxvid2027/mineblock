// Replaces the __BUILD_ID__ placeholder in the built service worker with a
// unique id. Without this the cache name never changes and returning players
// keep the old bundle forever. Run automatically after `vite build`.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '../dist');
const swPath = join(dist, 'sw.js');
if (!existsSync(swPath)) {
  console.error('stamp-sw: dist/sw.js not found — did vite build run?');
  process.exit(1);
}

const buildId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

// Collect everything the game shell needs offline. Asset filenames are
// content-hashed by Vite, so they can only be known after the build.
const precache = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
for (const file of readdirSync(join(dist, 'assets'))) precache.push(`./assets/${file}`);
for (const file of readdirSync(join(dist, 'icons'))) precache.push(`./icons/${file}`);

const src = readFileSync(swPath, 'utf-8');
for (const token of ['__BUILD_ID__', '__PRECACHE__']) {
  if (src.includes(token)) continue;
  console.error(`stamp-sw: placeholder ${token} missing from sw.js`);
  process.exit(1);
}

writeFileSync(
  swPath,
  src.replace('__BUILD_ID__', buildId).replace('__PRECACHE__', JSON.stringify(precache))
);
console.log(`stamp-sw: build id ${buildId}, ${precache.length} files pre-cached`);
