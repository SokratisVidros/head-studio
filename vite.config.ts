import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { getRequestListener } from '@hono/node-server';
import { fileURLToPath } from 'node:url';

const appModule = fileURLToPath(new URL('./src/server/app.ts', import.meta.url));

/**
 * Dev only: serve the Hono API (`/api/*`) from the Vite dev server itself, so
 * `npm run dev:ui` needs no second process. The module is loaded through Vite's
 * SSR loader on each request, so edits under src/server and src/core apply
 * without a restart.
 */
function headStudioApi(): Plugin {
  return {
    name: 'head-studio-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const { createApp } = (await server.ssrLoadModule(appModule)) as typeof import('./src/server/app');
          const app = createApp({ defaultTarget: process.env.HEAD_STUDIO_TARGET });
          await getRequestListener(app.fetch)(req, res);
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('./src/ui', import.meta.url)),
  base: './',
  plugins: [react(), tailwindcss(), headStudioApi()],
  build: {
    outDir: fileURLToPath(new URL('./dist/ui', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
