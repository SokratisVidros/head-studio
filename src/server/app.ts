import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { fetchResolved } from '../core/fetcher.js';
import { applyMetadataFix } from '../core/fixers/index.js';
import { inspect } from '../core/inspect.js';
import { analyzeSerp } from '../core/validators/serp.js';
import { VERSION } from '../version.js';

export interface AppOptions {
  /** Target pre-filled in the dashboard (URL or path). */
  defaultTarget?: string;
  /** Directory containing the built dashboard (`dist/ui`). */
  uiDir?: string;
  /** Root for file edits and file:// asset proxying. */
  workspaceRoot?: string;
}

export function defaultUiDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, 'ui'), path.join(here, '../../dist/ui'), path.join(here, '../dist/ui')];
  return candidates.find((c) => existsSync(path.join(c, 'index.html'))) ?? candidates[0];
}

const LOCAL_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

export function createApp(opts: AppOptions = {}) {
  const app = new Hono();
  const uiDir = opts.uiDir ?? defaultUiDir();
  const workspaceRoot = path.resolve(opts.workspaceRoot ?? process.cwd());

  // Guard the local API against DNS rebinding and cross-site requests from other origins.
  app.use('/api/*', async (c, next) => {
    const host = c.req.header('host') ?? '';
    if (!LOCAL_HOSTS.test(host)) return c.json({ error: `Forbidden host "${host}"` }, 403);
    const origin = c.req.header('origin');
    if (origin) {
      try {
        if (!LOCAL_HOSTS.test(new URL(origin).host)) return c.json({ error: 'Forbidden origin' }, 403);
      } catch {
        return c.json({ error: 'Forbidden origin' }, 403);
      }
    }
    await next();
  });

  app.get('/api/health', (c) => c.json({ ok: true, version: VERSION }));
  app.get('/api/config', (c) => c.json({ version: VERSION, defaultTarget: opts.defaultTarget ?? 'http://localhost:3000', workspaceRoot }));

  app.get('/api/inspect', async (c) => {
    const target = c.req.query('target') ?? c.req.query('url');
    if (!target) return c.json({ error: 'Missing ?target=' }, 400);
    try {
      return c.json(await inspect(target, { route: c.req.query('route') || undefined, root: c.req.query('root') || undefined }));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 422);
    }
  });

  app.post('/api/serp', async (c) => {
    const body = await c.req.json<{ title?: string; description?: string }>().catch(() => ({}) as { title?: string; description?: string });
    return c.json(analyzeSerp(body.title ?? '', body.description ?? ''));
  });

  app.post('/api/fix', async (c) => {
    const body = await c.req.json<{ filePath?: string; targetFramework?: 'nextjs' | 'astro' | 'html'; updates?: Record<string, unknown>; dryRun?: boolean }>().catch(() => null);
    if (!body?.filePath || !body.updates) return c.json({ error: 'Expected { filePath, targetFramework, updates }' }, 400);
    const result = await applyMetadataFix(body.filePath, body.targetFramework, body.updates, { dryRun: body.dryRun ?? false, workspaceRoot });
    return c.json(result, result.ok ? 200 : 422);
  });

  /** Proxy images referenced by the inspected page (lets the UI preview file:// assets). */
  app.get('/api/asset', async (c) => {
    const url = c.req.query('url');
    if (!url) return c.json({ error: 'Missing ?url=' }, 400);
    if (url.startsWith('file:')) {
      const file = path.resolve(fileURLToPath(url));
      const rel = path.relative(workspaceRoot, file);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return c.json({ error: 'Outside workspace' }, 403);
    } else if (!/^https?:\/\//i.test(url)) {
      return c.json({ error: 'Unsupported URL' }, 400);
    }
    const res = await fetchResolved(url);
    if (!res.ok || !res.bytes) return c.json({ error: res.error ?? 'Not found' }, 404);
    const type = res.contentType ?? 'application/octet-stream';
    if (!/^image\/|json/i.test(type)) return c.json({ error: `Refusing to proxy ${type}` }, 415);
    return new Response(res.bytes as unknown as BodyInit, { headers: { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  });

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  app.get('*', async (c) => {
    const reqPath = decodeURIComponent(new URL(c.req.url).pathname);
    const file = path.join(uiDir, path.normalize(reqPath).replace(/^([/\\])+/, ''));
    const inside = !path.relative(uiDir, file).startsWith('..');
    const target = inside && existsSync(file) && path.extname(file) ? file : path.join(uiDir, 'index.html');
    try {
      const body = await readFile(target);
      return new Response(body, { headers: { 'content-type': MIME[path.extname(target)] ?? 'application/octet-stream' } });
    } catch {
      return c.html(
        `<!doctype html><title>head-studio</title><body style="font-family:system-ui;padding:2rem"><h1>head-studio</h1><p>The dashboard bundle was not found at <code>${uiDir}</code>. Run <code>npm run build</code>. The API is available under <code>/api</code>.</p></body>`,
        200,
      );
    }
  });

  return app;
}
