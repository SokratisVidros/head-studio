import { parseExpression } from '@babel/parser';
import MagicString from 'magic-string';
import { applyHeadOps, escapeAttr, findHead, toHeadOps } from './html.js';
import { detectQuote, isPlainObject, mergeIntoObject, serialize, unwrapExpression, type MergeContext } from './js-object.js';
import type { FixOutput, ImageUpdate, MetadataUpdates } from './types.js';

interface Attr {
  name: string;
  start: number;
  end: number;
  kind: 'string' | 'expr' | 'bare';
  /** Value span (inside quotes / braces). */
  valueStart: number;
  valueEnd: number;
}

interface TagScan {
  name: string;
  start: number;
  attrs: Attr[];
  /** Position right before `/>` or `>` where new attributes can be inserted. */
  insertAt: number;
  end: number;
}

/** Scan a component tag's attributes, handling quoted strings and balanced `{…}` expressions. */
export function scanTag(source: string, start: number): TagScan | null {
  const nameMatch = /^<([A-Za-z][\w.:-]*)/.exec(source.slice(start));
  if (!nameMatch) return null;
  let i = start + nameMatch[0].length;
  const attrs: Attr[] = [];
  while (i < source.length) {
    while (/\s/.test(source[i])) i++;
    if (source.startsWith('/>', i) || source[i] === '>') {
      let insertAt = i;
      while (insertAt > start && /\s/.test(source[insertAt - 1])) insertAt--;
      return { name: nameMatch[1], start, attrs, insertAt, end: i + (source[i] === '>' ? 1 : 2) };
    }
    if (source[i] === '{') {
      // Spread attribute `{...props}`
      i = skipBraces(source, i);
      continue;
    }
    const m = /^[^\s=/>{]+/.exec(source.slice(i));
    if (!m) return null;
    const name = m[0];
    const attrStart = i;
    i += name.length;
    while (/\s/.test(source[i])) i++;
    if (source[i] !== '=') {
      attrs.push({ name, start: attrStart, end: attrStart + name.length, kind: 'bare', valueStart: i, valueEnd: i });
      continue;
    }
    i++;
    while (/\s/.test(source[i])) i++;
    const q = source[i];
    if (q === '"' || q === "'" || q === '`') {
      const close = source.indexOf(q, i + 1);
      if (close < 0) return null;
      attrs.push({ name, start: attrStart, end: close + 1, kind: 'string', valueStart: i + 1, valueEnd: close });
      i = close + 1;
    } else if (q === '{') {
      const close = skipBraces(source, i);
      attrs.push({ name, start: attrStart, end: close, kind: 'expr', valueStart: i + 1, valueEnd: close - 1 });
      i = close;
    } else {
      const v = /^[^\s>]+/.exec(source.slice(i))?.[0] ?? '';
      attrs.push({ name, start: attrStart, end: i + v.length, kind: 'string', valueStart: i, valueEnd: i + v.length });
      i += v.length;
    }
  }
  return null;
}

/** Return the index right after the `}` matching the `{` at `open`. */
function skipBraces(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      const close = findStringEnd(source, i);
      i = close;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return source.length;
}

function findStringEnd(source: string, start: number): number {
  const q = source[start];
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') i++;
    else if (source[i] === q) return i;
  }
  return source.length;
}

/** Convert Next.js-shaped updates into `astro-seo` `<SEO>` props. */
export function toAstroSeoProps(updates: MetadataUpdates): { props: Record<string, unknown>; warnings: string[] } {
  const props: Record<string, unknown> = {};
  const warnings: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    switch (key) {
      case 'title':
      case 'description':
      case 'canonical':
        props[key] = value;
        break;
      case 'alternates':
        if (isPlainObject(value) && value.canonical !== undefined) props.canonical = value.canonical;
        break;
      case 'robots': {
        const r = updates.robots;
        if (r == null) {
          props.noindex = null;
          props.nofollow = null;
        } else if (typeof r === 'string') {
          props.noindex = /\bnoindex\b|\bnone\b/i.test(r);
          props.nofollow = /\bnofollow\b|\bnone\b/i.test(r);
        } else {
          props.noindex = r.index === false;
          props.nofollow = r.follow === false;
        }
        break;
      }
      case 'openGraph': {
        if (!isPlainObject(value)) break;
        const og = value as NonNullable<MetadataUpdates['openGraph']>;
        const basic: Record<string, unknown> = {};
        const optional: Record<string, unknown> = {};
        const image: Record<string, unknown> = {};
        if (og.title !== undefined) basic.title = og.title;
        if (og.type !== undefined) basic.type = og.type;
        if (og.url !== undefined) basic.url = og.url;
        if (og.description !== undefined) optional.description = og.description;
        if (og.siteName !== undefined) optional.siteName = og.siteName;
        if (og.locale !== undefined) optional.locale = og.locale;
        if (og.images !== undefined) {
          const first = Array.isArray(og.images) ? og.images[0] : og.images;
          const img: ImageUpdate | null = typeof first === 'string' ? { url: first } : (first ?? null);
          basic.image = img?.url ?? null;
          if (img?.width != null) image.width = img.width;
          if (img?.height != null) image.height = img.height;
          if (img?.alt != null) image.alt = img.alt;
        }
        props.openGraph = {
          ...(Object.keys(basic).length ? { basic } : {}),
          ...(Object.keys(optional).length ? { optional } : {}),
          ...(Object.keys(image).length ? { image } : {}),
        };
        break;
      }
      case 'twitter': {
        if (!isPlainObject(value)) break;
        const tw: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
          if (k === 'images') tw.image = Array.isArray(v) ? (v[0] ?? null) : v;
          else tw[k] = v;
        }
        props.twitter = tw;
        break;
      }
      default:
        warnings.push(`Skipped "${key}": not supported by the <SEO> component mapping.`);
    }
  }
  return { props, warnings };
}

const SEO_TAG = /<(SEO|Seo|AstroSeo|SEOHead)\b/;

export function fixAstro(code: string, filePath: string, updates: MetadataUpdates): FixOutput {
  const s = new MagicString(code);
  const fm = /^\s*---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(code);
  const templateStart = fm ? fm[0].length : 0;
  const template = code.slice(templateStart);
  const quote = detectQuote(code.slice(0, templateStart) || code);

  // 1. <SEO /> component (astro-seo and friends)
  const seoMatch = SEO_TAG.exec(template);
  if (seoMatch) {
    const tag = scanTag(code, templateStart + seoMatch.index);
    if (!tag) throw new Error(`Could not parse the <${seoMatch[1]}> tag in ${filePath}.`);
    const { props, warnings } = toAstroSeoProps(updates);
    const applied = applyComponentProps(s, code, tag, props, quote, warnings);
    return { code: s.toString(), applied, warnings };
  }

  // 2. A literal <head> in the template (layouts)
  const head = findHead(template);
  if (head) {
    const { ops, warnings } = toHeadOps(updates);
    const res = applyHeadOps(s, code, templateStart + head.open.end, templateStart + head.close.start, ops, { skipExpressions: true });
    return { code: s.toString(), applied: res.applied, warnings: [...warnings, ...res.warnings] };
  }

  // 3. A layout component receiving title/description props, e.g. <Layout title="…">
  const layoutRe = /<([A-Z][\w.]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = layoutRe.exec(template))) {
    const tag = scanTag(code, templateStart + m.index);
    if (!tag || !tag.attrs.some((a) => a.name === 'title' || a.name === 'description')) continue;
    const warnings: string[] = [];
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (k === 'title' || k === 'description') props[k] = v;
      else if (v !== undefined) warnings.push(`Skipped "${k}": <${tag.name}> only receives title/description; edit the layout's <head> instead.`);
    }
    const applied = applyComponentProps(s, code, tag, props, quote, warnings);
    return { code: s.toString(), applied, warnings };
  }

  throw new Error(`${filePath} has no <SEO> component, <head> element, or layout component with title/description props.`);
}

function applyComponentProps(s: MagicString, code: string, tag: TagScan, props: Record<string, unknown>, quote: "'" | '"', warnings: string[]): string[] {
  const applied: string[] = [];
  const additions: string[] = [];
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined) continue;
    const attr = tag.attrs.find((a) => a.name === name);
    if (value === null) {
      if (attr) {
        const ws = code.slice(0, attr.start).match(/\s*$/)?.[0].length ?? 0;
        s.remove(attr.start - ws, attr.end);
        applied.push(`${name} (removed)`);
      }
      continue;
    }
    const literal = typeof value === 'string' ? `${name}="${escapeAttr(value)}"` : `${name}={${serialize(value, attrIndent(code, tag), quote)}}`;
    if (!attr) {
      additions.push(literal);
      applied.push(name);
      continue;
    }
    if (attr.kind === 'expr') {
      const exprSrc = code.slice(attr.valueStart, attr.valueEnd);
      let expr;
      try {
        expr = unwrapExpression(parseExpression(exprSrc, { plugins: ['typescript', 'jsx'] }));
      } catch {
        expr = null;
      }
      if (isPlainObject(value) && expr?.type === 'ObjectExpression') {
        const ctx: MergeContext = { s, source: code, quote, offset: attr.valueStart, applied: [], warnings };
        mergeIntoObject(expr, value, ctx);
        applied.push(...ctx.applied.map((p) => `${name}.${p}`));
        continue;
      }
      const isLiteral = expr && (expr.type === 'StringLiteral' || expr.type === 'BooleanLiteral' || expr.type === 'NumericLiteral' || (expr.type === 'TemplateLiteral' && !expr.expressions.length));
      if (!isLiteral) {
        warnings.push(`Skipped ${name}: <${tag.name} ${name}={${exprSrc.trim()}}> is dynamic; update the value it references instead.`);
        continue;
      }
    }
    s.overwrite(attr.start, attr.end, literal);
    applied.push(name);
  }
  if (additions.length) {
    const multiline = code.slice(tag.start, tag.end).includes('\n');
    const indent = attrIndent(code, tag);
    s.appendLeft(tag.insertAt, additions.map((a) => (multiline ? `\n${indent}${a}` : ` ${a}`)).join(''));
  }
  return applied;
}

function attrIndent(code: string, tag: TagScan): string {
  const first = tag.attrs[0];
  if (first) {
    const lineStart = code.lastIndexOf('\n', first.start - 1) + 1;
    const before = code.slice(lineStart, first.start);
    if (/^[ \t]*$/.test(before)) return before;
  }
  const lineStart = code.lastIndexOf('\n', tag.start - 1) + 1;
  return (code.slice(lineStart).match(/^[ \t]*/)?.[0] ?? '') + '  ';
}
