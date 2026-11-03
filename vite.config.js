// The browser game lives in client/; the simulation it shares with the server lives in shared/.
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'client',
  base: './',                         // works from any sub-path (e.g. https://<user>.github.io/marsh-rut/)
  publicDir: 'public',                // client/public: icons and the web manifest, copied as they are (stable addresses)
  server: { port: 5173, fs: { allow: ['..'] } },
  build: {
    outDir: '../dist', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000,
    // one page per screen, each a folder with an index.html (hunting.ltd/create-account/ ...): the account pages
    // (light, a still picture of the lake) and the game (/hunting/). The log-in page is the root.
    rollupOptions: { input: Object.fromEntries([['login', 'index.html'], ...['create-account', 'forgot-password', 'reset-password', 'confirm-email', 'hunting']
      .map((n) => [n, n + '/index.html'])].map(([k, f]) => [k, resolve(__dirname, 'client', f)])) },
  },
});
