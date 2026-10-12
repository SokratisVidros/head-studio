# CLAUDE.md — Head Studio Project Instructions

Build an NPM package (`head-studio`) providing a local visual developer interface (Drizzle Studio style) and AI agent integrations for auditing and fixing HTML metadata, Open Graph cards, favicons, SERP snippets, and JSON-LD schemas.

## 1. Project Overview & Architecture

`head-studio` is a triple-interface developer tool:

1. **Interactive Local Web Dashboard:** Vite + React single-page app running on a local port (`http://localhost:4983`).
2. **Headless CLI:** Fast terminal runner for human devs and scriptable JSON output for AI harnesses.
3. **MCP Server & Agent Integration:** Embedded Model Context Protocol server exposing tool calls for agentic inspection and codebase auto-fixing.

```
                      ┌──────────────────────────────┐
                      │    Local Web App (React)     │
                      │  (Drizzle Studio UI view)    │
                      └──────────────┬───────────────┘
                                     │ HTTP (/api)
┌──────────────────┐  CLI Trigger   ┌┴──────────────────────────────┐
│ Developer Terminal├─────────────►│        Local Node Engine      │
└──────────────────┘ npx head-studio│  - HTML / JSON-LD Parser      │
                                    │  - AST Code Mod / Fixer       │
┌──────────────────┐  JSON-RPC      │  - Hono Server                │
│  AI Agent / MCP  ├──────────────►└───────────────────────────────┘
└──────────────────┘ (Tool Calls)
```

## 2. Package Structure

```
head-studio/
├── bin/cli.mjs               # Executable entrypoint (imports dist/cli.js)
├── src/
│   ├── cli.ts                # citty commands: studio (default), inspect, locate, serp, fix, init, doctor, mcp
│   ├── integrations.ts       # `init`: MCP registration + skill install for Claude Code / Cursor / VS Code
│   ├── index.ts              # Programmatic API
│   ├── core/
│   │   ├── fetcher.ts        # HTTP + static-file loading, href resolution
│   │   ├── inspect.ts        # Orchestrates parsers/validators into an InspectReport
│   │   ├── project.ts        # Framework / dev URL / build dir detection, target auto-detect
│   │   ├── locate.ts         # Route → source file (Next.js app router, Astro, HTML)
│   │   ├── suggest.ts        # Deterministic per-issue `fix` + `suggestedUpdates`
│   │   ├── summary.ts        # Compact agent-facing report
│   │   ├── types.ts          # Report schema (schemaVersion: 1)
│   │   ├── parsers/          # Cheerio parsers: meta, opengraph, favicons, jsonld
│   │   ├── validators/       # serp (Arial pixel widths), opengraph, favicons, jsonld, images
│   │   └── fixers/           # nextjs (Babel + magic-string), astro, html, diff
│   ├── server/
│   │   ├── app.ts            # Hono API + static dist/ui hosting
│   │   ├── studio.ts         # @hono/node-server bootstrap
│   │   └── mcp/              # @modelcontextprotocol/sdk server + tools
│   └── ui/                   # React + Tailwind v4 + lucide dashboard (built to dist/ui)
├── test/                     # vitest suites + fixtures/site static site
├── scripts/make-fixture-images.mjs
├── SKILL.md                  # Agent skill instructions
└── README.md
```

## 3. Tech Stack

- CLI: `citty` · Server: `hono` + `@hono/node-server` · HTML: `cheerio`
- JSON-LD: custom schema.org rule matching (`src/core/validators/jsonld.ts`)
- MCP: `@modelcontextprotocol/sdk` + `zod`
- Code modification: `@babel/parser` + `magic-string` (format-preserving edits)
- Images: `image-size` · UI: React, Tailwind CSS, Lucide (Vite) · Build: `tsup` · Tests: `vitest`

## 4. Functional Requirements

### A. Parser & Inspection Engine
Inspect local dev servers (`http://localhost:3000`) and static directories (`./public`, `./dist`):
- Meta & title: `<title>`, description, robots, canonical, viewport, charset, lang.
- Open Graph & Twitter: `og:*`, `twitter:*`; load and measure images, validate 1200×630 / 1.91:1.
- Favicons: `favicon.ico`, PNG 16/32, SVG, Apple touch icon 180×180, manifest + 192/512 icons.
- SERP simulator: Arial pixel widths (desktop title ~600px, description ~960px; mobile limits in `SERP_PROFILES`).
- JSON-LD: extract all blocks, report syntax errors, validate Organization, WebSite, Article (+BlogPosting/NewsArticle), Product, BreadcrumbList.

### B. CLI
```bash
npx head-studio                                              # dashboard on localhost:4983
npx head-studio inspect --url http://localhost:3000/blog/post-1 --json
npx head-studio mcp                                          # MCP over stdio
```

### C. MCP Tools & Prompt
1. `inspect_route` — `{ url?, route?, root?, detail? }` → compact summary by default (`detail: "full"` for the whole report); `url` auto-detected.
2. `locate_source` — `{ route }` → file owning the route's metadata.
3. `validate_serp_snippet` — `{ title, description }` → pixel widths, lengths, truncation.
4. `apply_metadata_fix` — `{ filePath, targetFramework?, updates, dryRun? }` → applied keys, warnings, diff.
5. Prompt `audit` — the full inspect → locate → draft → apply → verify loop.

### D. Agent DX
- `head-studio init` registers the server and installs `SKILL.md` per agent (idempotent, merges JSON, `--dry-run`).
- Issues carry a `fix` only when derivable from the page; never invent copy, URLs or assets. Removing `noindex` is never part of `suggestedUpdates`.

## 5. Development Rules

1. **Localhost first:** parsers work against `localhost` and static files without CORS or public URLs.
2. **Deterministic output:** `--json` and `mcp` write only JSON to stdout; diagnostics go to stderr. Never add `console.log` to code paths reachable from those commands.
3. **Framework awareness:** Next.js fixes go through `export const metadata` / `generateMetadata` — never insert raw `<meta>` JSX into App Router layouts. Astro uses `<SEO>` props or the layout `<head>`. HTML edits `<head>` in place.
4. **Embedded assets:** the UI builds to `dist/ui` and is served by the Node server.
5. `updates` objects always use the Next.js `Metadata` shape; fixers translate for other frameworks.
6. Keep `src/core/validators/serp.ts` free of Node imports — the UI imports it directly.

## 6. Commands

```bash
npm run build      # tsup + vite
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

## 7. Milestones

- [x] Phase 1: Core parser & CLI inspection (`inspect`, `--json`, static + HTTP targets)
- [x] Phase 2: Local web dashboard (Overview, Meta & SERP, Social cards, Favicons, JSON-LD, All tags) served by Hono
- [x] Phase 3: MCP server (`inspect_route`, `validate_serp_snippet`, `apply_metadata_fix`) over stdio
- [x] Phase 4: AST fixer engine (Next.js, Astro, HTML) & `SKILL.md`
- [x] Phase 5: Agent DX — `init`, `doctor`, `locate`, auto-detected targets, per-issue fixes, summary reports, `audit` prompt
