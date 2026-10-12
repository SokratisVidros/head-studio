import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { createMcpServer } from '../src/server/mcp/index.js';

const SITE = path.join(import.meta.dirname, 'fixtures/site');
const local = { headers: { host: 'localhost:4983' } };

describe('HTTP API', () => {
  const app = createApp({ uiDir: path.join(import.meta.dirname, 'nonexistent-ui') });

  it('inspects targets', async () => {
    const res = await app.request(`/api/inspect?target=${encodeURIComponent(SITE)}`, local);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: { title: string } };
    expect(body.meta.title).toMatch(/Acme/);
  });

  it('returns 422 with a message for bad targets', async () => {
    const res = await app.request(`/api/inspect?target=${encodeURIComponent(path.join(SITE, 'missing'))}`, local);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(/No HTML file/);
  });

  it('measures SERP snippets', async () => {
    const res = await app.request('/api/serp', { method: 'POST', body: JSON.stringify({ title: 'Hello', description: 'World' }), headers: { ...local.headers, 'content-type': 'application/json' } });
    const body = (await res.json()) as { desktop: { title: { chars: number } } };
    expect(body.desktop.title.chars).toBe(5);
  });

  it('proxies workspace images and rejects others', async () => {
    const ok = await app.request(`/api/asset?url=${encodeURIComponent(pathToFileURL(path.join(SITE, 'og.png')).toString())}`, local);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    const html = await app.request(`/api/asset?url=${encodeURIComponent(pathToFileURL(path.join(SITE, 'index.html')).toString())}`, local);
    expect(html.status).toBe(415);
    const outside = await app.request(`/api/asset?url=${encodeURIComponent('file:///etc/passwd')}`, local);
    expect(outside.status).toBe(403);
  });

  it('blocks non-local hosts and cross-site origins', async () => {
    expect((await app.request('/api/health', { headers: { host: 'evil.example' } })).status).toBe(403);
    expect((await app.request('/api/health', { headers: { host: 'localhost:4983', origin: 'https://evil.example' } })).status).toBe(403);
    expect((await app.request('/api/health', local)).status).toBe(200);
  });

  it('serves a fallback page when the UI is not built', async () => {
    const res = await app.request('/', local);
    expect(await res.text()).toMatch(/npm run build/);
  });
});

describe('MCP server', () => {
  async function connect() {
    const server = createMcpServer({ workspaceRoot: SITE });
    const client = new Client({ name: 'test', version: '1.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
  }
  const text = (r: unknown) => JSON.parse((r as { content: Array<{ text: string }> }).content[0].text);

  it('lists the three tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['apply_metadata_fix', 'inspect_route', 'validate_serp_snippet']);
  });

  it('runs inspect_route and validate_serp_snippet', async () => {
    const client = await connect();
    const report = text(await client.callTool({ name: 'inspect_route', arguments: { url: SITE, route: '/blog/post-1' } }));
    expect(report.summary.errors).toBeGreaterThan(0);
    const serp = text(await client.callTool({ name: 'validate_serp_snippet', arguments: { title: 'Acme', description: 'Rockets' } }));
    expect(serp.mobile.title.truncated).toBe(false);
  });

  it('runs apply_metadata_fix as a dry run', async () => {
    const client = await connect();
    const result = await client.callTool({ name: 'apply_metadata_fix', arguments: { filePath: 'blog/post-1.html', targetFramework: 'html', updates: { description: 'How we landed it.' }, dryRun: true } });
    const body = text(result);
    expect(body).toMatchObject({ ok: true, changed: true, dryRun: true });
    expect(body.diff).toContain('+    <meta name="description" content="How we landed it." />');
  });

  it('reports errors with isError', async () => {
    const client = await connect();
    const result = await client.callTool({ name: 'inspect_route', arguments: { url: path.join(SITE, 'missing') } });
    expect(result.isError).toBe(true);
  });
});
