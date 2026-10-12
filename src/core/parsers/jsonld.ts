import type { CheerioAPI } from 'cheerio';
import type { JsonLdBlock, JsonLdEntity } from '../types.js';

export function extractJsonLd($: CheerioAPI): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  $('script[type]').each((_, el) => {
    const type = ($(el).attr('type') ?? '').trim().toLowerCase();
    if (type !== 'application/ld+json') return;
    const raw = $(el).html() ?? '';
    blocks.push(parseJsonLdBlock(raw, blocks.length));
  });
  return blocks;
}

export function parseJsonLdBlock(raw: string, index: number): JsonLdBlock {
  // Some CMSs wrap JSON-LD in HTML comments or CDATA.
  const text = raw
    .trim()
    .replace(/^<!--/, '')
    .replace(/-->$/, '')
    .replace(/^\/\/\s*<!\[CDATA\[/, '')
    .replace(/\/\/\s*\]\]>$/, '')
    .trim();
  try {
    const data: unknown = JSON.parse(text);
    return { index, raw: text, valid: true, data, entities: flattenEntities(data) };
  } catch (err) {
    return {
      index,
      raw: text,
      valid: false,
      syntaxError: describeSyntaxError(text, err),
      data: null,
      entities: [],
    };
  }
}

function describeSyntaxError(text: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const pos = Number(msg.match(/position (\d+)/)?.[1]);
  if (Number.isFinite(pos) && !/line \d+/.test(msg)) {
    const before = text.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    return `${msg} (line ${line}, column ${col})`;
  }
  return msg;
}

export function typesOf(node: Record<string, unknown>): string[] {
  const t = node['@type'];
  const list = Array.isArray(t) ? t : t == null ? [] : [t];
  return list.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/^(https?:\/\/)?schema\.org\//, ''));
}

/** Collect top-level typed entities (arrays and `@graph` are unwrapped; nested values are not). */
export function flattenEntities(data: unknown, path = '$'): JsonLdEntity[] {
  if (Array.isArray(data)) return data.flatMap((d, i) => flattenEntities(d, `${path}[${i}]`));
  if (!data || typeof data !== 'object') return [];
  const node = data as Record<string, unknown>;
  const out: JsonLdEntity[] = [];
  if (node['@type'] != null) out.push({ type: typesOf(node), path, data: node, issues: [] });
  if (Array.isArray(node['@graph'])) out.push(...flattenEntities(node['@graph'], `${path}["@graph"]`));
  return out;
}
