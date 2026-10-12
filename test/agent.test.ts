import { mkdtemp, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixHtml } from '../src/core/fixers/html.js';
import { fixNextjs } from '../src/core/fixers/nextjs.js';
import { inspect } from '../src/core/inspect.js';
import { locateSource } from '../src/core/locate.js';
import { detectProject } from '../src/core/project.js';
import { summarizeReport } from '../src/core/summary.js';
import { applyPlan, planInit, type ServerCommand } from '../src/integrations.js';

const FIX = path.join(import.meta.dirname, 'fixtures');
const NEXT = path.join(FIX, 'next-app');
const ASTRO = path.join(FIX, 'astro-app');

describe('project detection', () => {
  it('detects Next.js and the dev port from the dev script', () => {
    const p = detectProject(NEXT);
    expect(p).toMatchObject({ framework: 'nextjs', fixFramework: 'nextjs', devUrl: 'http://localhost:3100', name: 'acme-web' });
    expect(p.appDir).toBe(path.join(NEXT, 'app'));
  });
  it('detects Astro with its default port', () => {
    expect(detectProject(ASTRO)).toMatchObject({ framework: 'astro', devUrl: 'http://localhost:4321' });
  });
});

describe('locateSource', () => {
  const rec = (route: string, root = NEXT) => locateSource(route, root).recommended?.file;
  it('resolves Next.js route groups, dynamic and catch-all segments', () => {
    expect(rec('/')).toBe('app/(marketing)/page.tsx');
    expect(rec('http://localhost:3100/about?x=1')).toBe('app/(marketing)/about/page.tsx');
    expect(rec('/blog/hello-world')).toBe('app/blog/[slug]/page.tsx');
    expect(rec('/docs')).toBe('app/docs/[[...slug]]/page.tsx');
    expect(rec('/docs/a/b')).toBe('app/docs/[[...slug]]/page.tsx');
  });
  it('reports how each file declares metadata and includes the layout chain', () => {
    const r = locateSource('/blog/x', NEXT);
    expect(r.recommended?.metadata).toBe('generateMetadata');
    expect(r.candidates.map((c) => c.file)).toContain('app/layout.tsx');
    expect(r.notes.join(' ')).toMatch(/generateMetadata/);
  });
  it('falls back to the root layout for unknown routes', () => {
    const r = locateSource('/nope', NEXT);
    expect(r.recommended?.role).toBe('root-layout');
  });
  it('resolves Astro pages and layouts', () => {
    expect(rec('/', ASTRO)).toBe('src/pages/index.astro');
    expect(rec('/blog/my-post', ASTRO)).toBe('src/pages/blog/[slug].astro');
    expect(locateSource('/', ASTRO).candidates.some((c) => c.file === 'src/layouts/Base.astro')).toBe(true);
  });
  it('finds plain HTML files', () => {
    expect(rec('/blog/post-1', path.join(FIX, 'site'))).toBe('blog/post-1.html');
  });
});

describe('suggested fixes', () => {
  it('attaches deterministic fixes and merges them, excluding judgement calls', async () => {
    const r = await inspect(path.join(FIX, 'site'), { route: '/blog/post-1' });
    expect(r.issues.find((i) => i.code === 'twitter/card-invalid')?.fix).toEqual({ twitter: { card: 'summary_large_image' } });
    expect(r.issues.find((i) => i.code === 'meta/robots-noindex')?.fix).toEqual({ robots: null });
    expect(r.suggestedUpdates).not.toHaveProperty('robots');
    expect(r.issues.find((i) => i.code === 'meta/description-missing')?.fix).toBeUndefined();
  });
  it('summaries keep issues and fixes but drop bulky fields', async () => {
    const r = await inspect(path.join(FIX, 'site'));
    const s = summarizeReport(r);
    expect(JSON.stringify(s).length).toBeLessThan(JSON.stringify(r).length / 1.5);
    expect(s.favicons[0]).toHaveProperty('status');
    expect(s.jsonLd[0].types).toEqual(['Organization', 'WebSite']);
  });
});

describe('fixer formatting', () => {
  it('keeps single-line objects single-line', () => {
    const out = fixNextjs(`export const metadata = { title: 'About' };\n`, 'page.tsx', { twitter: { card: 'summary' } });
    expect(out.code).toBe(`export const metadata = { title: 'About', twitter: { card: 'summary' } };\n`);
  });
  it('inserts HTML tags next to existing meta tags, not after scripts', () => {
    const html = `<html>\n  <head>\n    <title>A</title>\n    <script>var x = '<meta name="x">';</script>\n  </head>\n</html>\n`;
    const out = fixHtml(html, 'a.html', { description: 'D' });
    expect(out.code).toContain(`    <title>A</title>\n    <meta name="description" content="D" />\n    <script>`);
  });
});

describe('init', () => {
  const cmd: ServerCommand = { command: 'node', args: ['/x/bin/cli.mjs', 'mcp'], mode: 'local' };

  it('registers the MCP server for each agent, merging existing config, idempotently', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hs-init-'));
    await writeFile(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
    const plans = await planInit(dir, ['claude', 'cursor', 'vscode'], cmd);
    await applyPlan(plans);

    const claude = JSON.parse(await readFile(path.join(dir, '.mcp.json'), 'utf8'));
    expect(claude.mcpServers).toEqual({ other: { command: 'x' }, 'head-studio': { command: 'node', args: ['/x/bin/cli.mjs', 'mcp'] } });
    const vscode = JSON.parse(await readFile(path.join(dir, '.vscode/mcp.json'), 'utf8'));
    expect(vscode.servers['head-studio']).toMatchObject({ type: 'stdio', command: 'node' });
    expect(await readFile(path.join(dir, '.claude/skills/head-studio/SKILL.md'), 'utf8')).toMatch(/^---\nname: head-studio/);
    expect(await readFile(path.join(dir, '.cursor/rules/head-studio.mdc'), 'utf8')).toMatch(/alwaysApply: false/);

    const again = await planInit(dir, ['claude', 'cursor', 'vscode'], cmd);
    expect(again.every((p) => p.action === 'unchanged')).toBe(true);
  });

  it('refuses to clobber invalid JSON', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hs-init-'));
    await mkdir(path.join(dir, '.cursor'));
    await writeFile(path.join(dir, '.cursor/mcp.json'), '{ nope');
    await expect(planInit(dir, ['cursor'], cmd)).rejects.toThrow(/not valid JSON/);
  });

  it('can skip the skill', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hs-init-'));
    await cp(path.join(NEXT, 'package.json'), path.join(dir, 'package.json'));
    const plans = await planInit(dir, ['claude'], cmd, false);
    expect(plans.map((p) => p.kind)).toEqual(['mcp']);
  });
});

describe('locateSource with file URLs', () => {
  it('maps a statically inspected file back to its route', async () => {
    const site = path.join(FIX, 'site');
    const r = await inspect(site, { route: '/blog/post-1' });
    expect(locateSource(r.url, site).recommended?.file).toBe('blog/post-1.html');
  });
});
