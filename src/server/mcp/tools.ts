import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyMetadataFix, type MetadataUpdates } from '../../core/fixers/index.js';
import { inspect } from '../../core/inspect.js';
import { analyzeSerp } from '../../core/validators/serp.js';

const json = (data: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

export interface ToolOptions {
  workspaceRoot?: string;
}

export function registerTools(server: McpServer, opts: ToolOptions = {}) {
  server.registerTool(
    'inspect_route',
    {
      title: 'Inspect route metadata',
      description:
        'Fetch a page (local dev server URL like http://localhost:3000/blog/post-1, or a static file/directory such as ./dist) and return a full JSON audit: title/meta/canonical/robots, Open Graph & Twitter tags with image dimension checks, favicon/touch-icon/manifest grid, SERP pixel widths, JSON-LD schemas, and a prioritized list of errors/warnings with fix hints.',
      inputSchema: {
        url: z.string().describe('URL (http://localhost:3000/path) or filesystem path to an HTML file or static build directory.'),
        route: z.string().optional().describe('Optional route appended to the target, e.g. /blog/post-1.'),
        root: z.string().optional().describe('Static site root for resolving /absolute hrefs when inspecting files.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, route, root }) => {
      try {
        return json(await inspect(url, { route, root }));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, true);
      }
    },
  );

  server.registerTool(
    'validate_serp_snippet',
    {
      title: 'Validate SERP snippet',
      description:
        'Calculate Arial pixel widths, character counts and truncation status of a title/description pair for Google desktop (title ~600px, description ~960px) and mobile results. Use this to iterate on copy before applying a fix.',
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
      description:
        'Apply metadata updates to a local source file using framework-native conventions: Next.js App Router `export const metadata` (or generateMetadata return objects), Astro <SEO> props / layout <head>, or a plain HTML <head>. `updates` uses the Next.js Metadata shape, e.g. {"title":"…","description":"…","canonical":"https://…","openGraph":{"images":[{"url":"https://…/og.png","width":1200,"height":630}]},"twitter":{"card":"summary_large_image"}}. Set a key to null to remove it. Returns applied keys, warnings and a unified diff. Use dryRun to preview.',
      inputSchema: {
        filePath: z.string().describe('Path to the file to edit, relative to the workspace (e.g. app/layout.tsx, src/pages/index.astro, public/index.html).'),
        targetFramework: z.enum(['nextjs', 'astro', 'html']).describe('Conventions to use when editing the file.'),
        updates: z.record(z.string(), z.unknown()).describe('Metadata updates in the Next.js Metadata shape.'),
        dryRun: z.boolean().optional().describe('Return the diff without writing the file.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ filePath, targetFramework, updates, dryRun }) => {
      const result = await applyMetadataFix(filePath, targetFramework, updates as MetadataUpdates, { dryRun, workspaceRoot: opts.workspaceRoot });
      return json(result, !result.ok);
    },
  );
}
