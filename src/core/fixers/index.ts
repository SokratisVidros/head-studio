import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixAstro } from './astro.js';
import { unifiedDiff } from './diff.js';
import { fixHtml } from './html.js';
import { fixNextjs } from './nextjs.js';
import type { FixOutput, FixResult, MetadataUpdates, TargetFramework } from './types.js';

export * from './types.js';
export { fixAstro, fixHtml, fixNextjs };

export interface ApplyFixOptions {
  /** Compute the change and diff without writing to disk. */
  dryRun?: boolean;
  /** Directory the file must live in (defaults to the current working directory). */
  workspaceRoot?: string;
}

const FIXERS: Record<TargetFramework, (code: string, filePath: string, updates: MetadataUpdates) => FixOutput> = {
  nextjs: fixNextjs,
  astro: fixAstro,
  html: fixHtml,
};

export function detectFramework(filePath: string): TargetFramework {
  if (/\.astro$/.test(filePath)) return 'astro';
  if (/\.html?$/.test(filePath)) return 'html';
  return 'nextjs';
}

/** Apply metadata updates to a source file using framework-native conventions. */
export async function applyMetadataFix(filePath: string, targetFramework: TargetFramework | undefined, updates: MetadataUpdates, opts: ApplyFixOptions = {}): Promise<FixResult> {
  const root = path.resolve(opts.workspaceRoot ?? process.cwd());
  const abs = path.resolve(root, filePath);
  const framework = targetFramework ?? detectFramework(abs);
  const rel = path.relative(root, abs);
  const base: FixResult = { ok: false, filePath: rel || abs, framework, dryRun: !!opts.dryRun, changed: false, applied: [], warnings: [], diff: '' };

  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ...base, error: `Refusing to edit ${abs}: it is outside the workspace root ${root}.` };
  }
  if (!FIXERS[framework]) return { ...base, error: `Unsupported targetFramework "${framework}" (expected nextjs, astro or html).` };
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return { ...base, error: '`updates` must be an object.' };

  let code: string;
  try {
    code = await readFile(abs, 'utf8');
  } catch {
    return { ...base, error: `File not found: ${rel}` };
  }
  try {
    const out = FIXERS[framework](code, rel, updates);
    const changed = out.code !== code;
    if (changed && !opts.dryRun) await writeFile(abs, out.code, 'utf8');
    return { ...base, ok: true, changed, applied: out.applied, warnings: out.warnings, diff: unifiedDiff(code, out.code, rel) };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}
