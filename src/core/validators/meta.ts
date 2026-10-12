import type { Issue, MetaTags, SerpReport } from '../types.js';

export function validateMeta(meta: MetaTags): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], code: string, message: string, hint?: string) =>
    issues.push({ severity, category: code.startsWith('serp/') ? 'serp' : 'meta', code, message, hint });

  if (!meta.title) {
    add('error', 'meta/title-missing', 'Page has no <title>.', 'Add a unique, descriptive title of roughly 30–60 characters.');
  } else {
    const len = [...meta.title].length;
    if (len < 10) add('warning', 'meta/title-short', `Title is very short (${len} chars).`, 'Aim for 30–60 characters that describe the page.');
  }

  if (!meta.description) {
    add('error', 'meta/description-missing', 'Page has no meta description.', 'Add <meta name="description"> of roughly 70–160 characters.');
  } else {
    const len = [...meta.description].length;
    if (len < 50) add('warning', 'meta/description-short', `Description is short (${len} chars).`, 'Aim for 70–160 characters summarizing the page.');
  }

  if (!meta.canonical) {
    add('warning', 'meta/canonical-missing', 'No canonical URL (<link rel="canonical">).', 'Declare the preferred absolute URL for this page.');
  } else if (!/^https?:\/\//i.test(meta.canonical)) {
    add('warning', 'meta/canonical-relative', `Canonical URL "${meta.canonical}" is not absolute.`, 'Use a fully-qualified https:// URL.');
  } else if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$)/i.test(meta.canonical)) {
    add('info', 'meta/canonical-localhost', `Canonical URL points at ${new URL(meta.canonical).host}.`, 'Make sure production builds emit the production origin (e.g. via metadataBase).');
  }

  if (meta.robots) {
    const r = meta.robots.toLowerCase();
    if (/\bnoindex\b|\bnone\b/.test(r)) add('warning', 'meta/robots-noindex', `Robots meta is "${meta.robots}" — this page will be excluded from search.`, 'Remove noindex for pages that should rank.');
    if (/\bnofollow\b/.test(r)) add('info', 'meta/robots-nofollow', 'Robots meta contains nofollow.');
  }

  if (!meta.viewport) add('warning', 'meta/viewport-missing', 'No <meta name="viewport">; the page may not be mobile-friendly.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.');
  if (!meta.charset) add('info', 'meta/charset-missing', 'No <meta charset> declared.', 'Add <meta charset="utf-8"> as the first element in <head>.');
  if (!meta.lang) add('info', 'meta/lang-missing', '<html> has no lang attribute.', 'Set <html lang="en"> (or the page language).');

  const dupes = new Map<string, number>();
  for (const m of meta.all) {
    const k = m.key.toLowerCase();
    if (k === 'description' || k === 'robots' || k === 'viewport') dupes.set(k, (dupes.get(k) ?? 0) + 1);
  }
  for (const [k, n] of dupes) if (n > 1) add('warning', 'meta/duplicate', `<meta name="${k}"> appears ${n} times.`, 'Keep a single tag; crawlers use the first one.');

  return issues;
}

export function validateSerp(serp: SerpReport, meta: MetaTags): Issue[] {
  const issues: Issue[] = [];
  const { desktop, mobile } = serp;
  if (meta.title && desktop.title.truncated) {
    issues.push({ severity: 'warning', category: 'serp', code: 'serp/title-truncated', message: `Title is ${desktop.title.pixels}px wide and will be truncated on desktop (limit ~${desktop.title.limit}px).`, hint: `Shorten to fit; Google would show: "${desktop.title.display}"` });
  } else if (meta.title && mobile.title.truncated) {
    issues.push({ severity: 'info', category: 'serp', code: 'serp/title-truncated-mobile', message: `Title will be truncated on mobile (${mobile.title.pixels}px > ${mobile.title.limit}px).` });
  }
  if (meta.description && desktop.description.truncated) {
    issues.push({ severity: 'warning', category: 'serp', code: 'serp/description-truncated', message: `Description is ${desktop.description.pixels}px wide and will be truncated on desktop (limit ~${desktop.description.limit}px).`, hint: 'Keep the key message in the first ~155 characters.' });
  } else if (meta.description && mobile.description.truncated) {
    issues.push({ severity: 'info', category: 'serp', code: 'serp/description-truncated-mobile', message: `Description will be truncated on mobile (${mobile.description.pixels}px > ${mobile.description.limit}px).` });
  }
  return issues;
}
