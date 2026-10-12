import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyMetadataFix, type MetadataUpdates } from '../../core/fixers/index.js';
import { inspect } from '../../core/inspect.js';
import { locateSource } from '../../core/locate.js';
import { detectProject, guessTarget } from '../../core/project.js';
import { summarizeReport } from '../../core/summary.js';
import { analyzeSerp } from '../../core/validators/serp.js';

const json = (data: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export interface ToolOptions {
  workspaceRoot?: string;
}

export function registerTools(server: McpServer, opts: ToolOptions = {}) {
  const root = opts.workspaceRoot ?? process.cwd();

  server.registerTool(
    'inspect_route',
    {
      title: 'Inspect route metadata',
      description: [
        'Audit the <head> of a page: title/description with Google SERP pixel widths, canonical, robots, Open Graph & X cards (images are loaded and measured), favicons/touch icons/manifest, and JSON-LD schema.org validation.',
        'Returns `issues` (errors first, each with a stable `code`, a `hint`, and — when derivable from the page — a ready-to-apply `fix`) plus `suggestedUpdates`, the merge of all fixes, which can be passed straight to apply_metadata_fix.',
        'Omit `url` to auto-detect the running dev server or static build. Use `detail: "full"` only when you need raw tags, manifest internals or JSON-LD payloads.',
      ].join(' '),
      inputSchema: {
        url: z.string().optional().describe('Dev server URL (http://localhost:3000/blog/post-1) or path to an HTML file / static build dir (./out). Defaults to the detected dev server or build.'),
        route: z.string().optional().describe('Route appended to url, e.g. /blog/post-1.'),
        root: z.string().optional().describe('Static site root for resolving /absolute hrefs when inspecting files.'),
        detail: z.enum(['summary', 'full']).optional().describe('summary (default, compact) or full report.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, route, root: staticRoot, detail }) => {
      let target = url;
      if (!target) {
        const guess = await guessTarget(root);
        if (!guess.target) return json({ error: `No target given and ${guess.reason}. Start the dev server or pass url (e.g. "./out").`, project: guess.project.framework }, true);
        target = guess.target;
      }
      try {
        const report = await inspect(target, { route, root: staticRoot });
        return json(detail === 'full' ? report : summarizeReport(report));
      } catch (err) {
        return json({ error: errorText(err), target }, true);
      }
    },
  );

  server.registerTool(
    'locate_source',
    {
      title: 'Locate metadata source file',
      description:
        'Find the source file that owns the metadata for a route in this project — Next.js App Router page/layout chain (route groups and [dynamic] segments resolved), Astro src/pages and layouts, or plain HTML files — and how each declares metadata (export const metadata, generateMetadata, <SEO>, <head>…). Use `recommended.file` as filePath for apply_metadata_fix.',
      inputSchema: {
        route: z.string().describe('Route path or full URL, e.g. /blog/post-1 or http://localhost:3000/blog/post-1.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ route }) => json(locateSource(route, root)),
  );

  server.registerTool(
    'validate_serp_snippet',
    {
      title: 'Validate SERP snippet',
      description:
        'Measure a candidate title/description with Arial glyph metrics against Google limits (desktop title ~600px, description ~960px; tighter on mobile). Returns pixel widths, character counts, truncation flags and the text Google would display. Iterate with this before writing copy to source.',
      inputSchema: {
        title: z.string().describe('Candidate <title> text.'),
        description: z.string().describe('Candidate meta description text.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ title, description }) => json(analyzeSerp(title, description)),
  );

  server.registerTool(
    'apply_metadata_fix',
    {
      title: 'Apply metadata fix',
      description: [
        'Write metadata to a local source file using framework-native conventions: Next.js App Router `export const metadata` / generateMetadata return objects (never raw <meta> JSX), Astro <SEO> props or layout <head>, or a plain HTML <head>. Formatting is preserved.',
        '`updates` always uses the Next.js Metadata shape, e.g. {"title":"…","description":"…","canonical":"https://…","openGraph":{"images":[{"url":"https://…/og.png","width":1200,"height":630}]},"twitter":{"card":"summary_large_image"}}. Nested objects deep-merge; null removes a key.',
        'Tip: pass `suggestedUpdates` from inspect_route directly. Preview with dryRun: true, then apply. Returns applied keys, warnings and a unified diff.',
      ].join(' '),
      inputSchema: {
        filePath: z.string().describe('File to edit, relative to the project (use locate_source to find it), e.g. app/layout.tsx.'),
        targetFramework: z.enum(['nextjs', 'astro', 'html']).optional().describe('Conventions to use; defaults to the detected project framework / file extension.'),
        updates: z.record(z.string(), z.unknown()).describe('Metadata updates in the Next.js Metadata shape.'),
        dryRun: z.boolean().optional().describe('Return the diff without writing the file.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ filePath, targetFramework, updates, dryRun }) => {
      const framework = targetFramework ?? (/\.(astro)$/.test(filePath) ? 'astro' : /\.html?$/.test(filePath) ? 'html' : detectProject(root).fixFramework);
      const result = await applyMetadataFix(filePath, framework, updates as MetadataUpdates, { dryRun, workspaceRoot: root });
      return json(result, !result.ok);
    },
  );
}

export const AUDIT_PROMPT = (target?: string, route?: string) => `Audit and fix the <head> metadata of ${target ? `\`${target}\`` : 'this project (auto-detect the dev server or static build)'}${route ? ` for route \`${route}\`` : ''} with the head-studio tools.

1. Call \`inspect_route\`${target ? ` with url "${target}"` : ''}${route ? ` and route "${route}"` : ''}. Summarize the score and the errors/warnings in a short table (code, message).
2. Call \`locate_source\` for the route to find the file that owns its metadata.
3. Build one \`updates\` object: start from \`suggestedUpdates\`; for missing or truncated titles/descriptions, draft copy from the page's actual content and check it with \`validate_serp_snippet\` until nothing is truncated on desktop. Never invent facts, URLs or image assets.
4. Call \`apply_metadata_fix\` with \`dryRun: true\`, show me the diff, then apply it.
5. Re-run \`inspect_route\` and report the before/after score. List anything that needs a human (new images, favicon files, JSON-LD content, noindex intent).`;

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    'audit',
    {
      title: 'Audit & fix metadata',
      description: 'Inspect a route, locate its source, draft and apply metadata fixes, and verify.',
      argsSchema: {
        target: z.string().optional().describe('URL or path to inspect (default: auto-detect).'),
        route: z.string().optional().describe('Route to audit, e.g. /blog/post-1.'),
      },
    },
    ({ target, route }) => ({ messages: [{ role: 'user', content: { type: 'text', text: AUDIT_PROMPT(target, route) } }] }),
  );
}
