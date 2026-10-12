import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inspect } from '../src/core/inspect.js';

const SITE = path.join(import.meta.dirname, 'fixtures/site');
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!path.extname(p)) p += '.html';
    try {
      const body = await readFile(path.join(SITE, p));
      // Serve the home page with absolute localhost asset URLs to mimic a dev server.
      res.end(p === '/index.html' ? body.toString().replaceAll('https://acme.example', base) : body);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('inspect (static files)', () => {
  it('passes a well-formed page', async () => {
    const r = await inspect(SITE);
    expect(r.source).toBe('file');
    expect(r.summary.errors).toBe(0);
    expect(r.summary.warnings).toBe(0);
    expect(r.meta.title).toMatch(/Acme Rockets/);
    expect(r.openGraph.imageCheck).toMatchObject({ ok: true, width: 1200, height: 630 });
    expect(r.favicons.grid.find((g) => g.id === 'apple-touch-icon')?.status).toBe('pass');
    expect(r.favicons.grid.find((g) => g.id === 'manifest-512x512')?.status).toBe('pass');
    expect(r.jsonLd[0].entities).toHaveLength(2);
  });

  it('reports problems on a broken page', async () => {
    const r = await inspect(SITE, { route: '/blog/post-1' });
    const codes = r.issues.map((i) => i.code);
    for (const code of ['meta/description-missing', 'og/image-relative', 'og/image-aspect-ratio', 'twitter/card-invalid', 'serp/title-truncated', 'jsonld/syntax', 'meta/robots-noindex']) {
      expect(codes).toContain(code);
    }
    expect(r.issues[0].severity).toBe('error');
    expect(r.summary.score).toBeLessThan(50);
  });

  it('throws a helpful error for missing files', async () => {
    await expect(inspect(path.join(SITE, 'nope'))).rejects.toThrow(/No HTML file found/);
  });
});

describe('inspect (http)', () => {
  it('inspects a localhost dev server', async () => {
    const r = await inspect(base);
    expect(r.source).toBe('http');
    expect(r.status).toBe(200);
    expect(r.openGraph.imageCheck?.resolved).toBe(`${base}/og.png`);
    expect(r.summary.errors).toBe(0);
  });

  it('supports routes and reports HTTP errors', async () => {
    const r = await inspect(base, { route: '/missing' });
    expect(r.status).toBe(404);
    expect(r.issues.map((i) => i.code)).toContain('http/status');
  });

  it('explains unreachable servers', async () => {
    await expect(inspect('http://127.0.0.1:1/')).rejects.toThrow(/Is your dev server running/);
  });
});
