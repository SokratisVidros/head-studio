import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const USER_AGENT =
  'Mozilla/5.0 (compatible; head-studio/0.1; +https://github.com/sokratisvidros/head-studio)';

export interface LoadOptions {
  /** Route appended to the target, e.g. `/blog/post-1`. */
  route?: string;
  /** Static site root used to resolve root-relative hrefs (`/og.png`) for file targets. */
  root?: string;
  timeoutMs?: number;
}

export interface ResourceContext {
  source: 'http' | 'file';
  /** Absolute document URL (http(s):// or file://). */
  url: string;
  /** Absolute filesystem directory acting as the site root (file targets only). */
  root?: string;
  timeoutMs: number;
}

export interface LoadedDocument extends ResourceContext {
  html: string;
  status: number | null;
}

export interface ResourceResult {
  resolved: string | null;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  bytes: Uint8Array | null;
  error?: string;
}

const DEFAULT_TIMEOUT = 10_000;

export function isHttpTarget(target: string): boolean {
  return /^https?:\/\//i.test(target) || /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(target);
}

export function normalizeHttpTarget(target: string, route?: string): string {
  const withScheme = /^https?:\/\//i.test(target) ? target : `http://${target}`;
  const url = new URL(withScheme);
  if (route) return new URL(route.replace(/^\/?/, '/'), url).toString();
  return url.toString();
}

/** Resolve a filesystem target (dir, file or extension-less route) to an HTML file. */
export function resolveHtmlFile(target: string, route?: string): string {
  const base = path.resolve(target);
  const candidate = route ? path.join(statSafe(base)?.isDirectory() ? base : path.dirname(base), route) : base;
  const tries = [
    candidate,
    path.join(candidate, 'index.html'),
    `${candidate}.html`,
    `${candidate.replace(/[\\/]+$/, '')}.html`,
  ];
  for (const t of tries) {
    const s = statSafe(t);
    if (s?.isFile()) return t;
  }
  throw new Error(`No HTML file found for "${target}${route ?? ''}" (tried ${tries.map((t) => path.relative(process.cwd(), t) || '.').join(', ')})`);
}

/**
 * Guess the static site root for an HTML file: the highest ancestor directory (bounded by
 * the current working directory) that contains an `index.html`.
 */
export function guessStaticRoot(htmlFile: string, targetDir?: string): string {
  if (targetDir) return targetDir;
  const cwd = process.cwd();
  let dir = path.dirname(htmlFile);
  let best = dir;
  while (dir.startsWith(cwd) && dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, 'index.html'))) best = dir;
    if (dir === cwd) break;
    dir = path.dirname(dir);
  }
  return best;
}

export async function loadDocument(target: string, opts: LoadOptions = {}): Promise<LoadedDocument> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  if (isHttpTarget(target)) {
    const url = normalizeHttpTarget(target, opts.route);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new Error(`Could not reach ${url}: ${describeError(err)}. Is your dev server running?`);
    }
    const html = await res.text();
    if (!res.ok && !html) throw new Error(`${url} responded with HTTP ${res.status}`);
    return { source: 'http', url: res.url || url, html, status: res.status, timeoutMs };
  }

  const file = resolveHtmlFile(target, opts.route);
  const targetStat = statSafe(path.resolve(target));
  const root = opts.root
    ? path.resolve(opts.root)
    : guessStaticRoot(file, targetStat?.isDirectory() ? path.resolve(target) : undefined);
  const html = await readFile(file, 'utf8');
  return { source: 'file', url: pathToFileURL(file).toString(), root, html, status: null, timeoutMs };
}

/** Resolve an href found in the document to an absolute http(s):// or file:// URL. */
export function resolveHref(href: string, ctx: ResourceContext): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return null;
  if (ctx.source === 'file' && ctx.root) {
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      return pathToFileURL(path.join(ctx.root, decodeURIComponent(trimmed.split(/[?#]/)[0]))).toString();
    }
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
      // Production URLs in a static build: prefer the locally built file when it exists.
      try {
        const u = new URL(trimmed, 'https://placeholder.invalid');
        const local = path.join(ctx.root, decodeURIComponent(u.pathname));
        if (statSafe(local)?.isFile()) return pathToFileURL(local).toString();
        return u.toString();
      } catch {
        return null;
      }
    }
  }
  try {
    return new URL(trimmed, ctx.url).toString();
  } catch {
    return null;
  }
}

export async function fetchResource(href: string, ctx: ResourceContext, maxBytes = 15 * 1024 * 1024): Promise<ResourceResult> {
  const resolved = resolveHref(href, ctx);
  if (!resolved) return { resolved: null, ok: false, status: null, contentType: null, bytes: null, error: 'Unresolvable URL' };
  return fetchResolved(resolved, ctx.timeoutMs, maxBytes);
}

export async function fetchResolved(resolved: string, timeoutMs = DEFAULT_TIMEOUT, maxBytes = 15 * 1024 * 1024): Promise<ResourceResult> {
  if (resolved.startsWith('file:')) {
    const file = fileURLToPath(resolved);
    try {
      const buf = await readFile(file);
      return { resolved, ok: true, status: null, contentType: contentTypeFromExt(file), bytes: new Uint8Array(buf) };
    } catch (err) {
      return { resolved, ok: false, status: null, contentType: null, bytes: null, error: `File not found: ${path.relative(process.cwd(), file) || file}` };
    }
  }
  try {
    const res = await fetch(resolved, {
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = res.headers.get('content-type');
    if (!res.ok) {
      return { resolved, ok: false, status: res.status, contentType, bytes: null, error: `HTTP ${res.status}` };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      return { resolved, ok: false, status: res.status, contentType, bytes: null, error: `Resource exceeds ${maxBytes} bytes` };
    }
    return { resolved, ok: true, status: res.status, contentType, bytes: buf };
  } catch (err) {
    return { resolved, ok: false, status: null, contentType: null, bytes: null, error: describeError(err) };
  }
}

export function contentTypeFromExt(file: string): string | null {
  const ext = path.extname(file).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.html': 'text/html',
  };
  return map[ext] ?? null;
}

function statSafe(p: string) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

export function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError') return 'request timed out';
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
    if (cause?.code) return `${err.message} (${cause.code})`;
    return err.message;
  }
  return String(err);
}
