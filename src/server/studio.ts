import { serve } from '@hono/node-server';
import { createApp, type AppOptions } from './app.js';

export interface StudioOptions extends AppOptions {
  port?: number;
  host?: string;
}

export function startStudio(opts: StudioOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const app = createApp(opts);
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? 4983;
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
      const shownHost = host === '127.0.0.1' || host === '0.0.0.0' ? 'localhost' : host;
      resolve({
        url: `http://${shownHost}:${info.port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
    server.on('error', reject);
  });
}
