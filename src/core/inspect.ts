import { load } from 'cheerio';
import { loadDocument, type LoadedDocument, type LoadOptions } from './fetcher.js';
import { parseIconLinks } from './parsers/favicons.js';
import { extractJsonLd } from './parsers/jsonld.js';
import { parseMeta } from './parsers/meta.js';
import { parseOpenGraph, parseTwitter } from './parsers/opengraph.js';
import type { InspectReport, Issue } from './types.js';
import { validateFavicons } from './validators/favicons.js';
import { validateJsonLd } from './validators/jsonld.js';
import { validateMeta, validateSerp } from './validators/meta.js';
import { validateOpenGraph, validateTwitter } from './validators/opengraph.js';
import { analyzeSerp } from './validators/serp.js';

export type InspectOptions = LoadOptions;

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;
const PENALTY = { error: 10, warning: 3, info: 0 } as const;

/** Inspect a URL (`http://localhost:3000/blog`) or a static file/directory (`./dist`). */
export async function inspect(target: string, opts: InspectOptions = {}): Promise<InspectReport> {
  const started = Date.now();
  const doc = await loadDocument(target, opts);
  return inspectDocument(doc, target, started);
}

/** Inspect raw HTML. Resources resolve against `url` (defaults to the current directory). */
export async function inspectHtml(html: string, url = `file://${process.cwd()}/index.html`, root = process.cwd()): Promise<InspectReport> {
  const source = url.startsWith('file:') ? 'file' : 'http';
  return inspectDocument({ html, url, source, root: source === 'file' ? root : undefined, status: null, timeoutMs: 10_000 }, url, Date.now());
}

async function inspectDocument(doc: LoadedDocument, target: string, started: number): Promise<InspectReport> {
  const $ = load(doc.html);
  const meta = parseMeta($);
  const openGraph = parseOpenGraph($);
  const twitter = parseTwitter($);
  const iconLinks = parseIconLinks($);
  const jsonLd = extractJsonLd($);
  const serp = analyzeSerp(meta.title, meta.description);

  const [ogIssues, favicons] = await Promise.all([validateOpenGraph(openGraph, meta, doc), validateFavicons(iconLinks, doc)]);
  const twitterIssues = await validateTwitter(twitter, openGraph, doc);

  const issues: Issue[] = [];
  if (doc.status != null && doc.status >= 400) {
    issues.push({ severity: 'error', category: 'meta', code: 'http/status', message: `Page responded with HTTP ${doc.status}.` });
  }
  issues.push(
    ...validateMeta(meta),
    ...validateSerp(serp, meta),
    ...ogIssues,
    ...twitterIssues,
    ...favicons.issues,
    ...validateJsonLd(jsonLd),
  );
  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const infos = issues.length - errors - warnings;
  const score = Math.max(0, 100 - issues.reduce((s, i) => s + PENALTY[i.severity], 0));

  return {
    schemaVersion: 1,
    target,
    url: doc.url,
    source: doc.source,
    status: doc.status,
    fetchedAt: new Date(started).toISOString(),
    timingMs: Date.now() - started,
    meta,
    openGraph,
    twitter,
    favicons: favicons.report,
    serp,
    jsonLd,
    issues,
    summary: { errors, warnings, infos, score },
  };
}
