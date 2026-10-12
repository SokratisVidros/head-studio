# head-studio

A local studio, CLI and MCP server for auditing and fixing everything in your page's `<head>`: SERP snippets, Open Graph / X cards, favicons and JSON-LD.

```bash
npx head-studio                     # dashboard on http://localhost:4983
npx head-studio inspect --url http://localhost:3000/blog/post-1 --json
npx head-studio mcp                 # MCP server over stdio
```

- **Localhost-first.** Inspects your running dev server (`http://localhost:3000`) or a static build (`./dist`, `./out`) — no public URL, no CORS issues.
- **Pixel-accurate SERP simulator.** Titles and descriptions are measured with Arial glyph metrics against Google's desktop (~600px / ~960px) and mobile limits.
- **Real asset checks.** OG images, touch icons and manifest icons are loaded and measured (1200×630 / 1.91:1, 180×180, 192/512…).
- **Schema checks.** Every `application/ld+json` block is parsed (with line/column syntax errors) and validated against rules for Organization, WebSite, Article/BlogPosting/NewsArticle, Product and BreadcrumbList.
- **Framework-native fixes.** Edits `export const metadata` in Next.js App Router files, `<SEO>` props / layout `<head>` in Astro, or the `<head>` of plain HTML — preserving your formatting.

## Dashboard

```bash
npx head-studio                         # inspects http://localhost:3000 by default
npx head-studio ./dist --port 4983      # start with a static build
npx head-studio http://localhost:4321 --open
```

Light, monospaced UI (JetBrains Mono, bundled — no network needed). The accent colour is a single token (`--color-accent` in `src/ui/styles.css`).

Tabs: **Overview** (score + prioritized issues), **Meta & SERP** (Google preview, live snippet editor, apply-to-source), **Social cards** (Facebook, X, LinkedIn, Slack/Discord previews), **Favicons** (icon matrix, tab and home-screen previews), **JSON-LD** (tree viewer with per-entity issues) and **All tags**.

The server binds to `127.0.0.1` and rejects requests whose `Host`/`Origin` is not local.

## CLI

```bash
# Human-readable report
npx head-studio inspect http://localhost:3000

# Strict JSON for scripts/agents (nothing else is written to stdout)
npx head-studio inspect --url http://localhost:3000/blog/post-1 --json

# Static builds: directories, files, or extension-less routes
npx head-studio inspect --url ./out --route /blog/post-1
npx head-studio inspect --url ./dist/about/index.html --root ./dist

# CI: exit 1 when errors (or warnings) are found
npx head-studio inspect --url ./out --fail-on error

# SERP pixel widths
npx head-studio serp --title "My title" --description "My description"

# Apply a fix (Next.js Metadata shape for every framework)
npx head-studio fix app/layout.tsx --updates '{"title":"Acme","openGraph":{"images":[{"url":"https://acme.example/og.png","width":1200,"height":630}]}}' --dry-run
npx head-studio fix src/pages/index.astro --title "Acme" --description "Rockets for everyone"
```

Exit codes: `0` success, `1` `--fail-on` threshold reached (or fix failed), `2` target could not be loaded.

## MCP server

```bash
claude mcp add head-studio -- npx -y head-studio mcp
```

Cursor / other clients:

```json
{ "mcpServers": { "head-studio": { "command": "npx", "args": ["-y", "head-studio", "mcp"] } } }
```

| Tool | Input | Output |
| --- | --- | --- |
| `inspect_route` | `{ url, route?, root? }` | Full JSON report (tags, favicon grid, SERP widths, JSON-LD, issues) |
| `validate_serp_snippet` | `{ title, description }` | Pixel widths, character counts and truncation for desktop/mobile |
| `apply_metadata_fix` | `{ filePath, targetFramework: "nextjs" \| "astro" \| "html", updates, dryRun? }` | Applied keys, warnings and a unified diff |

`apply_metadata_fix` only edits files inside the server's working directory. [`SKILL.md`](./SKILL.md) contains agent guidance for the full inspect → draft → fix → verify loop.

## Fixers

`updates` always uses the Next.js `Metadata` shape; nested objects deep-merge and `null` removes a key.

| Framework | Strategy |
| --- | --- |
| `nextjs` | Merges into `export const metadata` (incl. `satisfies Metadata`, `title.default` templates) or the object returned by `generateMetadata`; creates the export plus `import type { Metadata }` when missing; `themeColor` goes to `export const viewport`. Refuses `"use client"` files. Never emits `<meta>` JSX. |
| `astro` | Updates `<SEO>` (astro-seo) props, mapping `openGraph`/`twitter` to its `basic`/`optional`/`image` shape; falls back to the layout's `<head>`, then to `title`/`description` props on a layout component. Dynamic `{expressions}` are left alone. |
| `html` | Edits existing `<title>`, `<meta>` and `<link rel="canonical">` in place and inserts missing tags before `</head>`. |

## Programmatic API

```ts
import { inspect, analyzeSerp, applyMetadataFix } from 'head-studio';

const report = await inspect('http://localhost:3000');
console.log(report.summary, report.issues);
```

## Development

```bash
npm install
npm run build        # tsup (node) + vite (dashboard → dist/ui)
npm test             # vitest
npm run typecheck
npm run dev:ui       # Vite dev server for the dashboard; proxies /api to a running `head-studio`
```

Layout: `src/core` (fetcher, parsers, validators, fixers), `src/server` (Hono app, MCP server), `src/ui` (React dashboard), `bin/cli.mjs` (entrypoint). Fixture images are generated by `scripts/make-fixture-images.mjs`.

## License

MIT
