import type { CheerioAPI } from 'cheerio';
import type { IconKind, IconLink } from '../types.js';

const ICON_RELS = new Set(['icon', 'shortcut icon', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'mask-icon', 'manifest']);

export function parseIconLinks($: CheerioAPI): IconLink[] {
  const links: IconLink[] = [];
  $('link[rel][href]').each((_, el) => {
    const rel = ($(el).attr('rel') ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const tokens = rel.split(' ');
    const isIcon = ICON_RELS.has(rel) || tokens.includes('icon') || tokens.includes('manifest') || tokens.some((t) => t.startsWith('apple-touch-icon'));
    if (!isIcon) return;
    const kind: IconKind = ICON_RELS.has(rel) ? (rel as IconKind) : tokens.includes('icon') ? 'icon' : 'other';
    links.push({
      rel,
      kind,
      href: ($(el).attr('href') ?? '').trim(),
      sizes: $(el).attr('sizes')?.trim() || null,
      type: $(el).attr('type')?.trim() || null,
    });
  });
  return links;
}
