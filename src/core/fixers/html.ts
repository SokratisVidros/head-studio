import MagicString from 'magic-string';
import { isPlainObject } from './js-object.js';
import type { FixOutput, ImageUpdate, MetadataUpdates } from './types.js';

/** A single `<head>` element operation derived from MetadataUpdates. */
export type HeadOp =
  | { kind: 'title'; value: string | null; path: string }
  | { kind: 'meta'; attr: 'name' | 'property'; key: string; value: string | null; path: string }
  | { kind: 'link'; rel: string; value: string | null; path: string };

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function robotsString(v: MetadataUpdates['robots']): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return [v.index === false ? 'noindex' : 'index', v.follow === false ? 'nofollow' : 'follow'].join(', ');
}

function firstImage(v: unknown): ImageUpdate | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const first = Array.isArray(v) ? v[0] : v;
  if (typeof first === 'string') return { url: first };
  if (isPlainObject(first) && typeof first.url === 'string') return first as unknown as ImageUpdate;
  return undefined;
}

/** Translate Next.js-shaped updates into flat `<head>` operations. */
export function toHeadOps(updates: MetadataUpdates): { ops: HeadOp[]; warnings: string[] } {
  const ops: HeadOp[] = [];
  const warnings: string[] = [];
  const meta = (attr: 'name' | 'property', key: string, value: unknown, path: string) => {
    if (value === undefined) return;
    ops.push({ kind: 'meta', attr, key, value: value == null ? null : String(value), path });
  };

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    switch (key) {
      case 'title':
        ops.push({ kind: 'title', value: value == null ? null : String(isPlainObject(value) ? value.default ?? value.absolute ?? '' : value), path: 'title' });
        break;
      case 'description':
      case 'themeColor':
        meta('name', key === 'themeColor' ? 'theme-color' : key, value, key);
        break;
      case 'keywords':
        meta('name', 'keywords', Array.isArray(value) ? value.join(', ') : value, key);
        break;
      case 'robots':
        meta('name', 'robots', robotsString(value as MetadataUpdates['robots']), key);
        break;
      case 'canonical':
        ops.push({ kind: 'link', rel: 'canonical', value: value == null ? null : String(value), path: 'canonical' });
        break;
      case 'alternates':
        if (isPlainObject(value) && value.canonical !== undefined) {
          ops.push({ kind: 'link', rel: 'canonical', value: value.canonical == null ? null : String(value.canonical), path: 'alternates.canonical' });
        }
        break;
      case 'openGraph':
      case 'twitter': {
        if (!isPlainObject(value)) break;
        const prefix = key === 'openGraph' ? 'og' : 'twitter';
        const attr = key === 'openGraph' ? 'property' : 'name';
        for (const [k, v] of Object.entries(value)) {
          if (k === 'images') {
            const img = firstImage(v);
            if (img === undefined) continue;
            meta(attr, `${prefix}:image`, img?.url ?? null, `${key}.images`);
            if (img && key === 'openGraph') {
              if (img.width != null) meta(attr, 'og:image:width', img.width, `${key}.images.width`);
              if (img.height != null) meta(attr, 'og:image:height', img.height, `${key}.images.height`);
            }
            if (img?.alt != null) meta(attr, `${prefix}:image:alt`, img.alt, `${key}.images.alt`);
          } else if (typeof v === 'string' || typeof v === 'number' || v === null) {
            meta(attr, `${prefix}:${snake(k)}`, v, `${key}.${k}`);
          } else {
            warnings.push(`Skipped ${key}.${k}: only scalar values map to <meta> tags.`);
          }
        }
        break;
      }
      case 'other':
        if (isPlainObject(value)) for (const [k, v] of Object.entries(value)) meta('name', k, v, `other.${k}`);
        break;
      default:
        warnings.push(`Skipped "${key}": no plain-HTML equivalent.`);
    }
  }
  return { ops, warnings };
}

export const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Span {
  start: number;
  end: number;
  text: string;
}

function findTag(source: string, from: number, to: number, re: RegExp): Span | null {
  re.lastIndex = 0;
  const m = re.exec(source.slice(from, to));
  return m ? { start: from + m.index, end: from + m.index + m[0].length, text: m[0] } : null;
}

export function findHead(source: string): { open: Span; close: Span } | null {
  const open = findTag(source, 0, source.length, /<head(\s[^>]*)?>/i);
  if (!open) return null;
  const close = findTag(source, open.end, source.length, /<\/head\s*>/i);
  return close ? { open, close } : null;
}

export interface ApplyHeadOptions {
  /** Treat `{…}` expressions in existing values as dynamic and leave them alone (Astro templates). */
  skipExpressions?: boolean;
}

/**
 * Apply head operations between `headStart` (after `<head>`) and `headEnd` (before `</head>`).
 * Existing tags are edited in place; new tags are inserted before `</head>`.
 */
export function applyHeadOps(s: MagicString, source: string, headStart: number, headEnd: number, ops: HeadOp[], opts: ApplyHeadOptions = {}): { applied: string[]; warnings: string[] } {
  const applied: string[] = [];
  const warnings: string[] = [];
  const closeIndent = source.slice(source.lastIndexOf('\n', headEnd - 1) + 1, headEnd);
  const firstChild = source.slice(headStart, headEnd).match(/\n([ \t]*)</);
  const indent = firstChild ? firstChild[1] : (/^[ \t]*$/.test(closeIndent) ? closeIndent : '') + '  ';
  const closeOnOwnLine = /^[ \t]*$/.test(closeIndent);
  const inserts: string[] = [];

  const removeTag = (span: Span) => {
    const lineStart = source.lastIndexOf('\n', span.start - 1) + 1;
    const blankBefore = /^[ \t]*$/.test(source.slice(lineStart, span.start));
    const after = source.slice(span.end).match(/^[ \t]*\n/);
    if (blankBefore && after) s.remove(lineStart, span.end + after[0].length);
    else s.remove(span.start, span.end);
  };

  for (const op of ops) {
    if (op.kind === 'title') {
      const span = findTag(source, headStart, headEnd, /<title(\s[^>]*)?>[\s\S]*?<\/title\s*>/i);
      if (span) {
        if (opts.skipExpressions && /\{[\s\S]*\}/.test(span.text)) {
          warnings.push(`Skipped title: the existing <title> is dynamic (${span.text.trim()}); update the value passed to it instead.`);
          continue;
        }
        if (op.value == null) removeTag(span);
        else s.overwrite(span.start, span.end, span.text.replace(/(<title(?:\s[^>]*)?>)[\s\S]*?(<\/title\s*>)/i, (_m, a: string, b: string) => `${a}${escapeText(op.value!)}${b}`));
      } else if (op.value != null) {
        inserts.push(renderTag(op));
      }
      applied.push(op.path);
      continue;
    }

    const re =
      op.kind === 'meta'
        ? new RegExp(`<meta\\b[^>]*\\b${op.attr}\\s*=\\s*(["'])${escapeRe(op.key)}\\1[^>]*>`, 'i')
        : new RegExp(`<link\\b[^>]*\\brel\\s*=\\s*(["'])${escapeRe(op.rel)}\\1[^>]*>`, 'i');
    const span = findTag(source, headStart, headEnd, re);
    const valueAttr = op.kind === 'meta' ? 'content' : 'href';
    if (span) {
      if (opts.skipExpressions && new RegExp(`\\b${valueAttr}\\s*=\\s*\\{`).test(span.text)) {
        warnings.push(`Skipped ${op.path}: the existing tag uses a dynamic expression (${span.text.trim()}).`);
        continue;
      }
      if (op.value == null) {
        removeTag(span);
      } else {
        const attrRe = new RegExp(`(\\b${valueAttr}\\s*=\\s*)(["'])[\\s\\S]*?\\2`, 'i');
        const replaced = attrRe.test(span.text)
          ? span.text.replace(attrRe, (_m, a: string) => `${a}"${escapeAttr(op.value!)}"`)
          : span.text.replace(/\s*\/?>$/, (end) => ` ${valueAttr}="${escapeAttr(op.value!)}"${end}`);
        s.overwrite(span.start, span.end, replaced);
      }
    } else if (op.value != null) {
      inserts.push(renderTag(op));
    }
    applied.push(op.path);
  }

  if (inserts.length) {
    // Group new tags with the existing <title>/<meta>/<link> tags rather than after scripts/styles.
    const anchor = lastHeadTagEnd(source, headStart, headEnd);
    const lineEnd = anchor != null ? source.indexOf('\n', anchor) : -1;
    if (anchor != null && lineEnd !== -1 && lineEnd < headEnd && /^[ \t]*$/.test(source.slice(anchor, lineEnd))) {
      s.appendLeft(lineEnd + 1, inserts.map((t) => `${indent}${t}\n`).join(''));
    } else if (closeOnOwnLine) {
      const lineStart = headEnd - closeIndent.length;
      s.appendLeft(lineStart, inserts.map((t) => `${indent}${t}\n`).join(''));
    } else {
      s.appendLeft(headEnd, inserts.map((t) => `\n${indent}${t}`).join('') + '\n');
    }
  }
  return { applied, warnings };
}

export function renderTag(op: HeadOp): string {
  if (op.kind === 'title') return `<title>${escapeText(op.value ?? '')}</title>`;
  if (op.kind === 'meta') return `<meta ${op.attr}="${escapeAttr(op.key)}" content="${escapeAttr(op.value ?? '')}" />`;
  return `<link rel="${escapeAttr(op.rel)}" href="${escapeAttr(op.value ?? '')}" />`;
}

/** End offset of the last <title>, <meta> or <link> tag inside the head, if any. */
function lastHeadTagEnd(source: string, headStart: number, headEnd: number): number | null {
  const re = /<title(?:\s[^>]*)?>[\s\S]*?<\/title\s*>|<(?:meta|link)\b[^>]*>/gi;
  const head = source.slice(headStart, headEnd);
  // Ignore tags inside <script>/<style>/<noscript> blocks.
  const masked = head.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, (m) => ' '.repeat(m.length));
  let end: number | null = null;
  for (const m of masked.matchAll(re)) end = headStart + m.index! + m[0].length;
  return end;
}

export function fixHtml(code: string, filePath: string, updates: MetadataUpdates): FixOutput {
  const s = new MagicString(code);
  const { ops, warnings } = toHeadOps(updates);
  const head = findHead(code);
  if (!head) {
    const html = findTag(code, 0, code.length, /<html(\s[^>]*)?>/i);
    if (!html) throw new Error(`${filePath} has no <head> or <html> element.`);
    const tags = ops.filter((o) => o.value != null).map((o) => `  ${renderTag(o)}\n`);
    s.appendLeft(html.end, `\n<head>\n${tags.join('')}</head>`);
    return { code: s.toString(), applied: ops.filter((o) => o.value != null).map((o) => o.path), warnings: [...warnings, 'Created a <head> element.'] };
  }
  const result = applyHeadOps(s, code, head.open.end, head.close.start, ops);
  return { code: s.toString(), applied: result.applied, warnings: [...warnings, ...result.warnings] };
}
