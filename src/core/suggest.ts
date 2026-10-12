import type { InspectReport, Issue } from './types.js';

const isAbsolute = (u: string | null | undefined): u is string => !!u && /^https?:\/\//i.test(u);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k] as Record<string, unknown>, v) : v;
  return out;
}

/**
 * Attach deterministic `fix` objects to issues whose resolution can be derived from the page
 * itself (copying values between tags, declaring measured image dimensions, valid enum values).
 */
export function attachFixes(report: Omit<InspectReport, 'suggestedUpdates'>): Record<string, unknown> {
  const { meta, openGraph: og, twitter: tw } = report;
  const canonical = isAbsolute(meta.canonical) ? meta.canonical : null;
  const check = og.imageCheck;

  const ogImage = (): Record<string, unknown> | null => {
    if (!og.image) return null;
    const url = isAbsolute(og.image) ? og.image : canonical ? new URL(og.image, canonical).toString() : null;
    if (!url) return null;
    const image: Record<string, unknown> = { url };
    if (check?.ok && check.width && check.height) Object.assign(image, { width: check.width, height: check.height });
    if (og.imageAlt) image.alt = og.imageAlt;
    return { openGraph: { images: [image] } };
  };

  const fixFor = (issue: Issue): Record<string, unknown> | null => {
    switch (issue.code) {
      case 'meta/canonical-missing':
        return isAbsolute(og.url) ? { canonical: og.url } : null;
      case 'meta/robots-noindex':
        return { robots: null };
      case 'og/title-missing':
        return meta.title ? { openGraph: { title: meta.title } } : null;
      case 'og/description-missing':
        return meta.description ? { openGraph: { description: meta.description } } : null;
      case 'og/type-missing':
        return { openGraph: { type: 'website' } };
      case 'og/url-missing':
      case 'og/url-canonical-mismatch':
        return canonical ? { openGraph: { url: canonical } } : null;
      case 'og/image-relative':
      case 'og/image-dimensions-undeclared':
      case 'og/image-dimensions-mismatch':
        return ogImage();
      case 'twitter/card-missing':
      case 'twitter/card-invalid':
      case 'twitter/image-missing':
        return og.image || tw.image ? { twitter: { card: 'summary_large_image' } } : { twitter: { card: 'summary' } };
      default:
        return null;
    }
  };

  let merged: Record<string, unknown> = {};
  for (const issue of report.issues) {
    const fix = fixFor(issue);
    if (!fix) continue;
    issue.fix = fix;
    // Removing noindex is a judgement call: offer it per-issue, but keep it out of the bulk suggestion.
    if (issue.code !== 'meta/robots-noindex') merged = deepMerge(merged, fix);
  }
  return merged;
}
