import type { CheerioAPI } from 'cheerio';
import type { MetaTags } from '../types.js';

const clean = (v: string | undefined | null): string | null => {
  if (v == null) return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length ? t : null;
};

export function metaContent($: CheerioAPI, attr: 'name' | 'property', key: string): string | null {
  let found: string | null = null;
  $(`meta[${attr}]`).each((_, el) => {
    if (found != null) return;
    if (($(el).attr(attr) ?? '').trim().toLowerCase() === key.toLowerCase()) {
      found = clean($(el).attr('content'));
    }
  });
  return found;
}

export function parseMeta($: CheerioAPI): MetaTags {
  const all: MetaTags['all'] = [];
  $('meta').each((_, el) => {
    const key = $(el).attr('name') ?? $(el).attr('property') ?? $(el).attr('http-equiv') ?? $(el).attr('itemprop');
    const content = $(el).attr('content');
    if (key && content != null) all.push({ key: key.trim(), content: content.trim() });
  });

  const charset =
    clean($('meta[charset]').first().attr('charset')) ??
    clean(
      $('meta[http-equiv]')
        .filter((_, el) => ($(el).attr('http-equiv') ?? '').toLowerCase() === 'content-type')
        .first()
        .attr('content')
        ?.match(/charset=([^;]+)/i)?.[1],
    );

  const canonical = $('link[rel]')
    .filter((_, el) => ($(el).attr('rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'))
    .first()
    .attr('href');

  return {
    title: clean($('head title').first().text() || $('title').first().text()),
    description: metaContent($, 'name', 'description'),
    robots: metaContent($, 'name', 'robots'),
    canonical: clean(canonical),
    viewport: metaContent($, 'name', 'viewport'),
    charset,
    lang: clean($('html').attr('lang')),
    themeColor: metaContent($, 'name', 'theme-color'),
    all,
  };
}
