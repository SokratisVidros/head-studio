import type MagicString from 'magic-string';
import type { Expression, Node, ObjectExpression, ObjectProperty } from '@babel/types';

export type Quote = "'" | '"';

const IDENT = /^[A-Za-z_$][\w$]*$/;

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Serialize a JSON-like value as a JavaScript literal using the file's quote style. */
export function serialize(value: unknown, indent: string, quote: Quote = "'", step = '  '): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return quoteString(value, quote);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const items = value.map((v) => serialize(v, indent + step, quote, step));
    const inline = `[${items.join(', ')}]`;
    if (inline.length <= 60 && !inline.includes('\n')) return inline;
    return `[\n${items.map((i) => `${indent + step}${i},`).join('\n')}\n${indent}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (!entries.length) return '{}';
    const lines = entries.map(([k, v]) => `${indent + step}${formatKey(k, quote)}: ${serialize(v, indent + step, quote, step)},`);
    return `{\n${lines.join('\n')}\n${indent}}`;
  }
  return quoteString(String(value), quote);
}

/** Single-line literal for short values (used when editing single-line objects); null if too long. */
export function serializeInline(value: unknown, quote: Quote = "'", max = 80): string | null {
  const render = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(render).join(', ')}]`;
    if (isPlainObject(v)) {
      const entries = Object.entries(v).filter(([, x]) => x !== undefined);
      return entries.length ? `{ ${entries.map(([k, x]) => `${formatKey(k, quote)}: ${render(x)}`).join(', ')} }` : '{}';
    }
    return serialize(v, '', quote);
  };
  const out = render(value);
  return out.length <= max ? out : null;
}

export function formatKey(key: string, quote: Quote): string {
  return IDENT.test(key) ? key : quoteString(key, quote);
}

export function quoteString(s: string, quote: Quote): string {
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(new RegExp(quote, 'g'), `\\${quote}`)
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `${quote}${escaped}${quote}`;
}

export function detectQuote(source: string): Quote {
  const single = (source.match(/'/g) ?? []).length;
  const double = (source.match(/"/g) ?? []).length;
  return double > single ? '"' : "'";
}

export function lineIndent(source: string, pos: number): string {
  const lineStart = source.lastIndexOf('\n', pos - 1) + 1;
  return source.slice(lineStart).match(/^[ \t]*/)?.[0] ?? '';
}

export function propKey(p: ObjectProperty): string | null {
  if (p.computed) return null;
  if (p.key.type === 'Identifier') return p.key.name;
  if (p.key.type === 'StringLiteral') return p.key.value;
  if (p.key.type === 'NumericLiteral') return String(p.key.value);
  return null;
}

/** Unwrap `x satisfies T`, `x as T`, `(x)` and `<T>x` to reach the underlying expression. */
export function unwrapExpression(node: Node | null | undefined): Node | null | undefined {
  let n = node;
  while (n && (n.type === 'TSSatisfiesExpression' || n.type === 'TSAsExpression' || n.type === 'TSTypeAssertion' || n.type === 'ParenthesizedExpression' || n.type === 'TSNonNullExpression')) {
    n = n.expression;
  }
  return n;
}

export interface MergeContext {
  s: MagicString;
  source: string;
  quote: Quote;
  /** Offset added to AST positions (when the AST was parsed from a slice of the file). */
  offset: number;
  applied: string[];
  warnings: string[];
}

/**
 * Deep-merge `updates` into an object literal in place. Nested plain objects merge into
 * nested object literals; other values replace the existing property value; `null` removes it.
 */
export function mergeIntoObject(obj: ObjectExpression, updates: Record<string, unknown>, ctx: MergeContext, pathPrefix = ''): void {
  const { s, source, quote, offset } = ctx;
  const start = obj.start! + offset;
  const end = obj.end! + offset;
  const props = obj.properties;
  const multiline = source.slice(start, end).includes('\n');
  const parentIndent = lineIndent(source, start);
  const firstProp = props[0];
  const childIndent = firstProp && multiline ? lineIndent(source, firstProp.start! + offset) : parentIndent + '  ';

  const additions: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const path = pathPrefix ? `${pathPrefix}.${key}` : key;
    const existing = props.find((p): p is ObjectProperty => p.type === 'ObjectProperty' && propKey(p) === key);

    if (!existing) {
      if (props.some((p) => p.type === 'SpreadElement')) ctx.warnings.push(`"${path}" added next to a spread; the spread may override it depending on order.`);
      if (value === null) continue;
      const inline = !multiline && props.length ? serializeInline(value, quote) : null;
      additions.push(`${formatKey(key, quote)}: ${inline ?? serialize(value, multiline || !props.length ? childIndent : parentIndent, quote)}`);
      ctx.applied.push(path);
      continue;
    }

    const valueNode = unwrapExpression(existing.value as Expression);
    if (value === null) {
      removeProperty(existing, props, ctx);
      ctx.applied.push(`${path} (removed)`);
      continue;
    }
    if (isPlainObject(value) && valueNode?.type === 'ObjectExpression') {
      mergeIntoObject(valueNode, value, ctx, path);
      continue;
    }
    // Next.js `title: { default, template }` — keep the template when a plain string is given.
    if (key === 'title' && typeof value === 'string' && valueNode?.type === 'ObjectExpression') {
      const hasDefault = valueNode.properties.some((p) => p.type === 'ObjectProperty' && propKey(p) === 'default');
      if (hasDefault) {
        mergeIntoObject(valueNode, { default: value }, ctx, path);
        continue;
      }
    }
    const indent = lineIndent(source, existing.start! + offset);
    s.overwrite(existing.value.start! + offset, existing.value.end! + offset, serialize(value, indent, quote));
    ctx.applied.push(path);
  }

  if (!additions.length) return;
  if (!props.length) {
    const body = additions.map((a) => `${childIndent}${a},`).join('\n');
    s.overwrite(start, end, `{\n${body}\n${parentIndent}}`);
    return;
  }
  const last = props[props.length - 1];
  const lastEnd = last.end! + offset;
  const between = source.slice(lastEnd, end - 1);
  const trailingComma = /^\s*,/.test(between);
  if (multiline) {
    const insertAt = trailingComma ? lastEnd + between.indexOf(',') + 1 : lastEnd;
    const text = additions.map((a) => `\n${childIndent}${a},`).join('');
    s.appendLeft(insertAt, trailingComma ? text : `,${text.replace(/,$/, '')}`);
  } else {
    s.appendLeft(lastEnd, additions.map((a) => `, ${a}`).join(''));
  }
}

function removeProperty(prop: ObjectProperty, props: ObjectExpression['properties'], ctx: MergeContext) {
  const { s, source, offset } = ctx;
  const i = props.indexOf(prop);
  const next = props[i + 1];
  const prev = props[i - 1];
  if (next) {
    s.remove(lineStartIfBlank(source, prop.start! + offset), lineStartIfBlank(source, next.start! + offset));
  } else if (prev) {
    // Keep any trailing comma style: remove from the end of the previous property.
    const tail = source.slice(prop.end! + offset).match(/^\s*,/)?.[0].length ?? 0;
    s.remove(prev.end! + offset, prop.end! + offset + tail);
    if (tail) s.appendLeft(prev.end! + offset, ',');
  } else {
    const tail = source.slice(prop.end! + offset).match(/^\s*,/)?.[0].length ?? 0;
    s.remove(prop.start! + offset, prop.end! + offset + tail);
  }
}

/** If only whitespace precedes `pos` on its line, return the line start (to remove whole lines). */
function lineStartIfBlank(source: string, pos: number): number {
  const lineStart = source.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*$/.test(source.slice(lineStart, pos)) ? lineStart : pos;
}
