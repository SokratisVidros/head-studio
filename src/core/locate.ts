import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectProject, type ProjectInfo } from './project.js';

export interface SourceCandidate {
  /** Path relative to the project root. */
  file: string;
  role: 'page' | 'layout' | 'root-layout' | 'html';
  framework: 'nextjs' | 'astro' | 'html';
  /** How the file currently declares metadata. */
  metadata: 'export const metadata' | 'generateMetadata' | 'none' | 'SEO component' | '<head>' | 'layout props' | 'frontmatter' | 'unknown';
  note?: string;
}

export interface LocateResult {
  route: string;
  framework: ProjectInfo['framework'];
  /** Best file to pass to apply_metadata_fix for route-specific metadata. */
  recommended: SourceCandidate | null;
  candidates: SourceCandidate[];
  notes: string[];
}

const PAGE_EXT = ['tsx', 'ts', 'jsx', 'js', 'mdx'];

function list(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function findFile(dir: string, base: string, exts: string[]): string | null {
  for (const ext of exts) {
    const f = path.join(dir, `${base}.${ext}`);
    if (existsSync(f)) return f;
  }
  return null;
}

export function routeSegments(route: string): string[] {
  let pathname = route;
  try {
    if (/^https?:\/\//i.test(route)) pathname = new URL(route).pathname;
  } catch {
    // treat as a path
  }
  return pathname
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s).replace(/\.html?$/, ''))
    .filter((s) => s !== 'index');
}

/**
 * Match URL segments against a Next.js `app/` tree. Route groups `(x)` are transparent,
 * dynamic `[x]`, catch-all `[...x]` and optional catch-all `[[...x]]` segments are honoured.
 * Returns the matched directories, most specific (static) matches first.
 */
function matchAppDir(dir: string, segments: string[], trail: string[] = []): string[][] {
  const out: string[][] = [];
  const entries = list(dir).filter((e) => !e.startsWith('_') && !e.startsWith('@') && !e.startsWith('.'));
  if (!segments.length && findFile(dir, 'page', PAGE_EXT)) out.push([...trail, dir]);
  const subdirs = entries.filter((e) => isDirectory(path.join(dir, e)));
  const [head, ...rest] = segments;
  // Ranking: static > dynamic > catch-all; groups are traversed at the same rank.
  for (const e of subdirs) {
    if (/^\(.+\)$/.test(e)) out.push(...matchAppDir(path.join(dir, e), segments, [...trail, dir]));
  }
  if (head != null) {
    for (const e of subdirs) if (e === head) out.push(...matchAppDir(path.join(dir, e), rest, [...trail, dir]));
    for (const e of subdirs) if (/^\[[^.[\]]+\]$/.test(e)) out.push(...matchAppDir(path.join(dir, e), rest, [...trail, dir]));
    for (const e of subdirs) if (/^\[\.\.\.[^\]]+\]$/.test(e)) out.push(...matchAppDir(path.join(dir, e), [], [...trail, dir]));
  }
  for (const e of subdirs) if (/^\[\[\.\.\.[^\]]+\]\]$/.test(e)) out.push(...matchAppDir(path.join(dir, e), [], [...trail, dir]));
  return out;
}

function detectNextMetadata(file: string): SourceCandidate['metadata'] {
  const code = safeRead(file);
  if (/export\s+(async\s+)?function\s+generateMetadata|export\s+const\s+generateMetadata/.test(code)) return 'generateMetadata';
  if (/export\s+const\s+metadata\b|export\s*\{[^}]*\bmetadata\b/.test(code)) return 'export const metadata';
  return 'none';
}

function detectAstroMetadata(file: string): SourceCandidate['metadata'] {
  const code = safeRead(file);
  if (/\.mdx?$/.test(file)) return 'frontmatter';
  if (/<(SEO|Seo|AstroSeo|SEOHead)\b/.test(code)) return 'SEO component';
  if (/<head[\s>]/i.test(code)) return '<head>';
  if (/<[A-Z][\w.]*[^>]*\btitle=/.test(code)) return 'layout props';
  return 'unknown';
}

const isDirectory = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const safeRead = (file: string) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

function locateNext(project: ProjectInfo, segments: string[], notes: string[]): SourceCandidate[] {
  const rel = (f: string) => path.relative(project.root, f);
  if (!project.appDir) {
    if (project.pagesDir) notes.push('This project uses the Next.js Pages Router (next/head). apply_metadata_fix supports the App Router only; edit <Head> manually.');
    return [];
  }
  const matches = matchAppDir(project.appDir, segments);
  if (!matches.length) {
    notes.push(`No page.tsx under ${rel(project.appDir)} matches this route.`);
    const root = findFile(project.appDir, 'layout', PAGE_EXT);
    return root ? [{ file: rel(root), role: 'root-layout', framework: 'nextjs', metadata: detectNextMetadata(root) }] : [];
  }
  const chain = matches[0];
  const pageDir = chain[chain.length - 1];
  const out: SourceCandidate[] = [];
  const page = findFile(pageDir, 'page', PAGE_EXT)!;
  const pageMeta = detectNextMetadata(page);
  out.push({
    file: rel(page),
    role: 'page',
    framework: 'nextjs',
    metadata: pageMeta,
    note: /\[/.test(rel(pageDir)) ? 'Dynamic route: prefer generateMetadata driven by the page data; a static export applies to every instance.' : undefined,
  });
  // Layouts from the deepest to the root.
  for (const dir of [...chain].reverse()) {
    const layout = findFile(dir, 'layout', PAGE_EXT);
    if (!layout) continue;
    out.push({ file: rel(layout), role: dir === project.appDir ? 'root-layout' : 'layout', framework: 'nextjs', metadata: detectNextMetadata(layout) });
  }
  if (matches.length > 1) notes.push(`Route also matches ${matches.slice(1).map((m) => rel(m[m.length - 1])).join(', ')}.`);
  return out;
}

function locateAstro(project: ProjectInfo, segments: string[], notes: string[]): SourceCandidate[] {
  const pagesDir = path.join(project.root, 'src/pages');
  const rel = (f: string) => path.relative(project.root, f);
  const exts = ['astro', 'md', 'mdx'];
  const found: string[] = [];
  const walk = (dir: string, segs: string[]) => {
    const [head, ...rest] = segs;
    if (head == null) {
      const index = findFile(dir, 'index', exts);
      if (index) found.push(index);
      return;
    }
    const entries = list(dir);
    if (!rest.length) {
      const file = findFile(dir, head, exts);
      if (file) found.push(file);
    }
    if (entries.includes(head)) walk(path.join(dir, head), rest);
    for (const e of entries) {
      const base = e.replace(/\.(astro|mdx?)$/, '');
      const isFile = base !== e;
      if (/^\[[^.\]]+\]$/.test(base)) {
        if (isFile && !rest.length) found.push(path.join(dir, e));
        else if (!isFile) walk(path.join(dir, e), rest);
      } else if (/^\[\.\.\.[^\]]+\]$/.test(base) && isFile) {
        found.push(path.join(dir, e));
      }
    }
  };
  walk(pagesDir, segments);
  if (!found.length) notes.push('No page under src/pages matches this route.');
  const out: SourceCandidate[] = found.map((f) => ({
    file: rel(f),
    role: 'page',
    framework: 'astro',
    metadata: detectAstroMetadata(f),
    note: /\[/.test(rel(f)) ? 'Dynamic route: metadata usually comes from getStaticPaths/props.' : undefined,
  }));
  // The layout owning <head> is the place for site-wide defaults.
  for (const layout of list(path.join(project.root, 'src/layouts')).filter((f) => f.endsWith('.astro'))) {
    const file = path.join(project.root, 'src/layouts', layout);
    const meta = detectAstroMetadata(file);
    if (meta === 'SEO component' || meta === '<head>') out.push({ file: rel(file), role: 'layout', framework: 'astro', metadata: meta });
  }
  return out;
}

function locateHtml(project: ProjectInfo, segments: string[]): SourceCandidate[] {
  const out: SourceCandidate[] = [];
  const name = segments.join('/');
  for (const base of ['.', 'public', 'src', ...project.buildDirs.map((d) => path.relative(project.root, d))]) {
    const dir = path.join(project.root, base);
    const tries = name ? [`${name}.html`, `${name}/index.html`] : ['index.html'];
    for (const t of tries) {
      const f = path.join(dir, t);
      if (existsSync(f) && !out.some((o) => o.file === path.relative(project.root, f))) {
        const generated = /^(dist|out|build|_site)(\/|$)/.test(path.relative(project.root, f));
        out.push({ file: path.relative(project.root, f), role: 'html', framework: 'html', metadata: '<head>', note: generated ? 'Generated build output — edits are overwritten on the next build.' : undefined });
      }
    }
  }
  // Prefer hand-written sources over build output.
  return out.sort((a, b) => Number(!!a.note) - Number(!!b.note));
}

/** Map a file:// URL from a static inspection back to a site route (relative to its build/public dir). */
function fileUrlToRoute(route: string, project: ProjectInfo): string {
  if (!route.startsWith('file:')) return route;
  const file = fileURLToPath(route);
  const bases = [...project.buildDirs, project.root].sort((a, b) => b.length - a.length);
  const base = bases.find((b) => file.startsWith(b + path.sep)) ?? path.dirname(file);
  return '/' + path.relative(base, file).split(path.sep).join('/');
}

/** Find the source file(s) that own the metadata for a route. */
export function locateSource(route: string, root = process.cwd()): LocateResult {
  const project = detectProject(root);
  const segments = routeSegments(fileUrlToRoute(route, project));
  const notes: string[] = [];
  let candidates: SourceCandidate[];
  if (project.framework === 'nextjs') candidates = locateNext(project, segments, notes);
  else if (project.framework === 'astro') candidates = locateAstro(project, segments, notes);
  else candidates = locateHtml(project, segments);

  const page = candidates.find((c) => c.role === 'page' || c.role === 'html');
  const recommended = page && !(project.framework === 'astro' && page.metadata === 'unknown') ? page : (candidates[0] ?? null);
  if (recommended?.metadata === 'generateMetadata') {
    notes.push(`${recommended.file} uses generateMetadata; apply_metadata_fix merges into its returned object literal — keep dynamic values dynamic.`);
  }
  return { route: '/' + segments.join('/'), framework: project.framework, recommended, candidates, notes };
}
