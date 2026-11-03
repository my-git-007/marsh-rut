// The browser game lives in client/; the simulation it shares with the server lives in shared/.
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  base: './',                         // works from any sub-path (e.g. https://<user>.github.io/marsh-rut/)
  publicDir: 'public',                // client/public: icons and the web manifest, copied as they are (stable addresses)
  server: { port: 5173, fs: { allow: ['..'] } },
  build: { outDir: '../dist', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
