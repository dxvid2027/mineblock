import { defineConfig } from 'vite';

// MineBlock renderer build configuration.
// The renderer is a plain ES module app (no framework) rendered with three.js
// and hosted inside an Electron BrowserWindow.
export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext'
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
