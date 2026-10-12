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
- **Agent-ready.** `head-studio init` wires the MCP server and skill into Claude Code, Cursor or VS Code; issues carry ready-to-apply fixes and `locate_source` maps routes to files.
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

## Use it with your coding agent

```bash
npx head-studio init            # registers the MCP server + installs the skill for detected agents
npx head-studio init --agent all  # claude, cursor, vscode
npx head-studio doctor          # what's detected: framework, target, source files, agents
```

| Agent | MCP registration | Guidance |
| --- | --- | --- |
| Claude Code | `.mcp.json` | `.claude/skills/head-studio/SKILL.md` |
| Cursor | `.cursor/mcp.json` | `.cursor/rules/head-studio.mdc` |
| VS Code (Copilot) | `.vscode/mcp.json` | `.github/instructions/head-studio.instructions.md` |

`init` merges into existing config files, is idempotent, and supports `--dry-run`, `--no-skill`, and `--npx` / `--local` (how the server is launched; auto-detected). Prefer a one-off? `claude mcp add head-studio -- npx -y head-studio mcp`.

Then ask your agent to *"audit the metadata of /blog"*, or in Claude Code run the bundled prompt **`/mcp__head-studio__audit`**.

### MCP tools

| Tool | Input | Output |
| --- | --- | --- |
| `inspect_route` | `{ url?, route?, root?, detail?: "summary" \| "full" }` | Compact audit by default: issues (with ready-to-apply `fix` objects), `suggestedUpdates`, SERP widths, OG/X, favicon grid, JSON-LD. `url` auto-detects the dev server or build. |
| `locate_source` | `{ route }` | The file that owns the route's metadata (Next.js app router incl. route groups and dynamic segments, Astro pages/layouts, HTML) and how it declares it |
| `validate_serp_snippet` | `{ title, description }` | Pixel widths, character counts and truncation for desktop/mobile |
| `apply_metadata_fix` | `{ filePath, updates, targetFramework?, dryRun? }` | Applied keys, warnings and a unified diff |

Prompt: `audit { target?, route? }` — the full inspect → locate → draft → apply → verify loop. The server only edits files inside its working directory. See [`SKILL.md`](./SKILL.md).

## CLI

```bash
npx head-studio inspect                       # auto-detects the dev server or ./out, ./dist…
npx head-studio inspect http://localhost:3000 --route /blog/post-1
npx head-studio inspect --url ./out --route /blog/post-1 --json            # full JSON
npx head-studio inspect --json --summary                                     # compact JSON for agents
npx head-studio inspect --url ./out --fail-on error                         # CI gate

npx head-studio locate /blog/hello            # → app/blog/[slug]/page.tsx (generateMetadata)
npx head-studio serp --title "My title" --description "My description"

# Apply the auto-fixable suggestions from an inspection (file located from the route)
npx head-studio fix --route /blog/post-1 --from http://localhost:3000 --dry-run
# …or explicit updates (Next.js Metadata shape for every framework)
npx head-studio fix app/layout.tsx --updates '{"openGraph":{"images":[{"url":"https://acme.example/og.png","width":1200,"height":630}]}}'
npx head-studio fix src/pages/index.astro --title "Acme" --description "Rockets for everyone"
npx head-studio inspect --json | npx head-studio fix app/page.tsx --updates -   # pipe a report's suggestedUpdates
```

The text report ends with **next steps**: the source file for the route, a ready-to-run `fix` command for auto-fixable issues, and what still needs judgement.

Exit codes: `0` success, `1` `--fail-on` threshold reached (or fix failed), `2` target could not be loaded / bad input.

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
