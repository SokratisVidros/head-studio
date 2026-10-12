import type { CheerioAPI } from 'cheerio';
import type { OpenGraphTags, TwitterTags } from '../types.js';

const toInt = (v: string | null): number | null => {
  if (v == null) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

export function parseOpenGraph($: CheerioAPI): OpenGraphTags {
  const raw: OpenGraphTags['raw'] = [];
  $('meta[property], meta[name]').each((_, el) => {
    const key = ($(el).attr('property') ?? $(el).attr('name') ?? '').trim();
    if (/^og:/i.test(key)) raw.push({ property: key.toLowerCase(), content: ($(el).attr('content') ?? '').trim() });
  });
  const first = (k: string) => raw.find((r) => r.property === k)?.content || null;
  return {
    title: first('og:title'),
    description: first('og:description'),
    type: first('og:type'),
    url: first('og:url'),
    siteName: first('og:site_name'),
    locale: first('og:locale'),
    image: first('og:image') ?? first('og:image:url') ?? first('og:image:secure_url'),
    imageAlt: first('og:image:alt'),
    imageWidth: toInt(first('og:image:width')),
    imageHeight: toInt(first('og:image:height')),
    raw,
    imageCheck: null,
  };
}

export function parseTwitter($: CheerioAPI): TwitterTags {
  const raw: TwitterTags['raw'] = [];
  $('meta[name], meta[property]').each((_, el) => {
    const key = ($(el).attr('name') ?? $(el).attr('property') ?? '').trim();
    if (/^twitter:/i.test(key)) raw.push({ name: key.toLowerCase(), content: ($(el).attr('content') ?? '').trim() });
  });
  const first = (k: string) => raw.find((r) => r.name === k)?.content || null;
  return {
    card: first('twitter:card'),
    title: first('twitter:title'),
    description: first('twitter:description'),
    image: first('twitter:image') ?? first('twitter:image:src'),
    imageAlt: first('twitter:image:alt'),
    site: first('twitter:site'),
    creator: first('twitter:creator'),
    raw,
    imageCheck: null,
  };
}
