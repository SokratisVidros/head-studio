import type { InspectReport } from './types.js';

/**
 * Token-lean view of an InspectReport for agents: the fields needed to decide and apply fixes,
 * without raw tag lists, manifest internals or JSON-LD payloads. Use the full report when you
 * need those details.
 */
export function summarizeReport(r: InspectReport) {
  const line = (l: InspectReport['serp']['desktop']['title']) => ({ chars: l.chars, pixels: l.pixels, limit: l.limit, truncated: l.truncated });
  const img = (c: InspectReport['openGraph']['imageCheck']) => (c ? { ok: c.ok, width: c.width, height: c.height, ...(c.error ? { error: c.error } : {}) } : null);
  return {
    schemaVersion: r.schemaVersion,
    detail: 'summary' as const,
    url: r.url,
    status: r.status,
    summary: r.summary,
    meta: { title: r.meta.title, description: r.meta.description, canonical: r.meta.canonical, robots: r.meta.robots, lang: r.meta.lang },
    serp: {
      desktop: { title: line(r.serp.desktop.title), description: line(r.serp.desktop.description) },
      mobile: { title: line(r.serp.mobile.title), description: line(r.serp.mobile.description) },
    },
    openGraph: { title: r.openGraph.title, description: r.openGraph.description, url: r.openGraph.url, type: r.openGraph.type, image: r.openGraph.image, imageCheck: img(r.openGraph.imageCheck) },
    twitter: { card: r.twitter.card, image: r.twitter.image },
    favicons: r.favicons.grid.map((g) => ({ id: g.id, status: g.status, href: g.href, ...(g.note ? { note: g.note } : {}) })),
    jsonLd: r.jsonLd.map((b) => ({ index: b.index, valid: b.valid, types: b.entities.map((e) => e.type.join('/')), ...(b.syntaxError ? { syntaxError: b.syntaxError } : {}) })),
    issues: r.issues,
    suggestedUpdates: r.suggestedUpdates,
  };
}

export type ReportSummary = ReturnType<typeof summarizeReport>;
