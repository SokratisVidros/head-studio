import { parse, type ParserPlugin } from '@babel/parser';
import type { File, Node, ObjectExpression, Statement } from '@babel/types';
import MagicString from 'magic-string';
import { detectQuote, isPlainObject, mergeIntoObject, serialize, unwrapExpression, type MergeContext } from './js-object.js';
import type { FixOutput, MetadataUpdates } from './types.js';

export function parseModule(code: string, filePath: string): File {
  const plugins: ParserPlugin[] = /\.tsx?$|\.mts$|\.cts$/.test(filePath) ? ['typescript'] : [];
  if (!/\.(ts|mts|cts)$/.test(filePath)) plugins.push('jsx');
  return parse(code, { sourceType: 'module', plugins, errorRecovery: false });
}

/** Map framework-neutral updates onto the Next.js Metadata shape. */
export function toNextMetadata(updates: MetadataUpdates): { metadata: Record<string, unknown>; viewport: Record<string, unknown> } {
  const { canonical, themeColor, ...rest } = updates;
  const metadata: Record<string, unknown> = { ...rest };
  const viewport: Record<string, unknown> = {};
  if (canonical !== undefined) {
    metadata.alternates = { ...(isPlainObject(rest.alternates) ? rest.alternates : {}), canonical };
  }
  if (themeColor !== undefined) viewport.themeColor = themeColor;
  for (const key of ['openGraph', 'twitter'] as const) {
    const v = metadata[key];
    if (isPlainObject(v) && typeof v.images === 'object' && v.images && !Array.isArray(v.images)) {
      metadata[key] = { ...v, images: [v.images] };
    }
  }
  return { metadata, viewport };
}

const isTs = (filePath: string) => /\.(tsx?|mts|cts)$/.test(filePath);

/**
 * Apply metadata updates to a Next.js App Router `layout`/`page` module using the
 * `export const metadata` convention (or the object returned from `generateMetadata`).
 * Never injects raw `<meta>` JSX.
 */
export function fixNextjs(code: string, filePath: string, updates: MetadataUpdates): FixOutput {
  const ast = parseModule(code, filePath);
  const s = new MagicString(code);
  const ctx: MergeContext = { s, source: code, quote: detectQuote(code), offset: 0, applied: [], warnings: [] };
  const body = ast.program.body;

  if (ast.program.directives.some((d) => d.value.value === 'use client')) {
    throw new Error(`${filePath} is a Client Component ("use client"); Next.js only reads metadata from Server Components. Move metadata to a server layout/page.`);
  }

  const { metadata, viewport } = toNextMetadata(updates);
  if (Object.keys(metadata).length) applyExport('metadata', 'Metadata', metadata, body, code, filePath, ctx);
  if (Object.keys(viewport).length) applyExport('viewport', 'Viewport', viewport, body, code, filePath, ctx);
  return { code: s.toString(), applied: ctx.applied, warnings: ctx.warnings };
}

function applyExport(
  name: 'metadata' | 'viewport',
  typeName: 'Metadata' | 'Viewport',
  updates: Record<string, unknown>,
  body: Statement[],
  code: string,
  filePath: string,
  ctx: MergeContext,
) {
  const objects = findExportObjects(body, name);
  if (objects.kind === 'object') {
    mergeIntoObject(objects.node, updates, ctx);
    return;
  }
  if (objects.kind === 'unsupported') {
    throw new Error(`\`export const ${name}\` in ${filePath} is not an object literal; edit it manually.`);
  }

  const generator = `generate${typeName}`;
  const returns = findGeneratorReturns(body, generator);
  if (returns.found) {
    if (!returns.objects.length) throw new Error(`${generator}() in ${filePath} does not return an object literal; edit it manually.`);
    for (const obj of returns.objects) mergeIntoObject(obj, updates, ctx);
    ctx.warnings.push(`Updated object literal(s) returned from ${generator}(); dynamic values elsewhere may override them.`);
    return;
  }

  // No export yet: create one after the imports.
  const lastImport = [...body].reverse().find((n) => n.type === 'ImportDeclaration');
  const insertAt = lastImport ? lastImport.end! : directivesEnd(code);
  const ts = isTs(filePath);
  const hasTypeImport = body.some(
    (n) => n.type === 'ImportDeclaration' && n.source.value === 'next' && n.specifiers.some((sp) => sp.local.name === typeName),
  );
  const typeImport = ts && !hasTypeImport ? `import type { ${typeName} } from ${ctx.quote}next${ctx.quote};\n` : '';
  const decl = `export const ${name}${ts ? `: ${typeName}` : ''} = ${serialize(updates, '', ctx.quote)};`;
  // After imports: "<imports>\n<type import>\n<decl>" + the file's own following newlines.
  ctx.s.appendLeft(insertAt, insertAt ? `\n${typeImport}\n${decl}` : `${typeImport}${typeImport ? '\n' : ''}${decl}\n\n`);
  ctx.applied.push(...Object.keys(updates).map((k) => `${k}`));
  ctx.warnings.push(`Created \`export const ${name}\` in ${filePath}.`);
}

type ExportLookup = { kind: 'object'; node: ObjectExpression } | { kind: 'none' } | { kind: 'unsupported' };

function findExportObjects(body: Statement[], name: string): ExportLookup {
  for (const stmt of body) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : null;
    if (decl?.type === 'VariableDeclaration') {
      for (const d of decl.declarations) {
        if (d.id.type === 'Identifier' && d.id.name === name) {
          const init = unwrapExpression(d.init);
          return init?.type === 'ObjectExpression' ? { kind: 'object', node: init } : { kind: 'unsupported' };
        }
      }
    }
    // `const metadata = {...}; export { metadata }`
    if (stmt.type === 'VariableDeclaration') {
      for (const d of stmt.declarations) {
        if (d.id.type === 'Identifier' && d.id.name === name && isReExported(body, name)) {
          const init = unwrapExpression(d.init);
          return init?.type === 'ObjectExpression' ? { kind: 'object', node: init } : { kind: 'unsupported' };
        }
      }
    }
  }
  return { kind: 'none' };
}

function isReExported(body: Statement[], name: string) {
  return body.some(
    (n) => n.type === 'ExportNamedDeclaration' && !n.source && n.specifiers.some((sp) => sp.type === 'ExportSpecifier' && sp.local.name === name),
  );
}

function findGeneratorReturns(body: Statement[], name: string): { found: boolean; objects: ObjectExpression[] } {
  for (const stmt of body) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : null;
    let fnBody: Node | null = null;
    if (decl?.type === 'FunctionDeclaration' && decl.id?.name === name) fnBody = decl.body;
    if (decl?.type === 'VariableDeclaration') {
      for (const d of decl.declarations) {
        const init = unwrapExpression(d.init);
        if (d.id.type === 'Identifier' && d.id.name === name && (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression')) {
          if (init.body.type === 'ObjectExpression') return { found: true, objects: [init.body] };
          fnBody = init.body;
        }
      }
    }
    if (fnBody) {
      const objects: ObjectExpression[] = [];
      collectReturns(fnBody, objects);
      return { found: true, objects };
    }
  }
  return { found: false, objects: [] };
}

/** Collect `return {…}` object literals, without descending into nested functions. */
function collectReturns(node: Node, out: ObjectExpression[]) {
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'ObjectMethod' || node.type === 'ClassMethod') return;
  if (node.type === 'ReturnStatement') {
    const arg = unwrapExpression(node.argument);
    if (arg?.type === 'ObjectExpression') out.push(arg);
    return;
  }
  for (const key of Object.keys(node) as Array<keyof Node>) {
    if (key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments' || key === 'loc') continue;
    const child = node[key] as unknown;
    if (Array.isArray(child)) child.forEach((c) => isNode(c) && collectReturns(c, out));
    else if (isNode(child)) collectReturns(child, out);
  }
}

const isNode = (v: unknown): v is Node => !!v && typeof v === 'object' && typeof (v as Node).type === 'string';

function directivesEnd(code: string): number {
  const m = code.match(/^(\s*(['"])use (?:client|server)\2;?[^\n]*\n)+/);
  return m ? m[0].length : 0;
}
