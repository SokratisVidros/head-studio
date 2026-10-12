---
name: head-studio
description: Audit and fix a web page's <head> metadata — title/description SERP truncation, canonical/robots, Open Graph and X/Twitter cards (image size and 1.91:1 ratio), favicons/apple-touch-icon/manifest, and JSON-LD schema.org structured data. Use when asked to improve SEO metadata, social share previews, favicons or structured data in a Next.js, Astro or static HTML project.
---

# head-studio

Inspects a running dev server or a static build, finds the source file that owns a route's metadata, and edits it with framework-native conventions (Next.js `export const metadata`, Astro `<SEO>`/layout `<head>`, HTML `<head>`).

## Tools

Use the MCP tools when the `head-studio` server is connected. Otherwise run the CLI; every command below accepts `--json` and then prints only JSON on stdout.

| Step | MCP tool | CLI |
| --- | --- | --- |
| Audit | `inspect_route { url?, route?, detail? }` | `npx head-studio inspect [url] --route /x --json --summary` |
| Find the file | `locate_source { route }` | `npx head-studio locate /x --json` |
| Check copy | `validate_serp_snippet { title, description }` | `npx head-studio serp --title "…" --description "…" --json` |
| Write | `apply_metadata_fix { filePath, updates, targetFramework?, dryRun? }` | `npx head-studio fix <file> --updates '<json>' [--dry-run] --json` |

`url` is optional: head-studio auto-detects the dev server (port from `package.json`) or a build dir (`out/`, `dist/`). If neither exists, start the dev server (`npm run dev`) in the background or build the site, then retry. `npx head-studio doctor` shows what is detected.

## Workflow

1. **Inspect.** `inspect_route` for each route in scope (default to `/` plus one representative content page). The default summary has everything needed; ask for `detail: "full"` only for raw tags or JSON-LD payloads.
2. **Triage.** `issues` are sorted error → warning → info. Each has a stable `code`, a `hint`, and — when the fix can be derived from the page — a `fix` object. `suggestedUpdates` is the merge of all of them (it deliberately excludes removing `noindex`).
3. **Locate.** `locate_source` with the route. Use `recommended.file`. Its `metadata` field tells you what you'll be editing:
   - `export const metadata` / `none` → route-specific values go here.
   - `generateMetadata` → values are dynamic; only change literals, keep data-driven fields dynamic.
   - `root-layout` → site-wide defaults (`metadataBase`, `openGraph.siteName`, `twitter.site`, title template). Put shared values here, not on every page.
   - Astro `layout props` → change the `title`/`description` props; `<head>` → edit the layout.
4. **Draft copy.** For missing/short/truncated titles and descriptions, write copy from the page's actual content (read the page component or fetch the page). Run `validate_serp_snippet` until `desktop.title.truncated` and `desktop.description.truncated` are `false`. Titles: unique, ~50–60 chars, key term first. Descriptions: ~120–155 chars, concrete.
5. **Apply.** Merge `suggestedUpdates` with your copy into one `updates` object → `apply_metadata_fix` with `dryRun: true` → check the diff → apply.
6. **Verify.** Re-run `inspect_route`; report the score before/after and anything left for a human.

## `updates` shape

Always the **Next.js `Metadata` shape**, for every framework. Nested objects deep-merge; `null` removes a key.

```json
{
  "title": "Acme Rockets — Reusable launch vehicles",
  "description": "Acme builds reusable rockets that make orbit affordable for small satellites.",
  "canonical": "https://acme.example/",
  "openGraph": {
    "type": "website",
    "url": "https://acme.example/",
    "images": [{ "url": "https://acme.example/og.png", "width": 1200, "height": 630, "alt": "Acme rocket on the pad" }]
  },
  "twitter": { "card": "summary_large_image" }
}
```

`canonical` is shorthand for `alternates.canonical`. Next.js-only keys (`metadataBase`, `icons`, `alternates.languages`) pass through; `themeColor` goes to `export const viewport`.

## Rules

- **Never invent** facts, URLs, handles or image assets. If an OG image or favicon file is missing, say what's needed (size, path) instead of referencing a file that doesn't exist.
- **Next.js:** never add `<meta>`/`<Head>` JSX in the App Router — the fixer uses `export const metadata`. Relative OG image URLs need `metadataBase: new URL('https://…')` in `app/layout.tsx`. Files with `"use client"` can't export metadata; pick the nearest server layout/page. The Pages Router (`pages/`) isn't supported by the fixer — edit `<Head>` manually.
- **`noindex`:** only remove it if the user confirms the page should rank (`issue.fix` is `{ "robots": null }`).
- **Dynamic routes** (`[slug]`): a static `metadata` export applies to every instance — prefer `generateMetadata` driven by the page data.
- **Not handled by `apply_metadata_fix`:** JSON-LD bodies (edit the `<script type="application/ld+json">` or the component that renders it) and favicon/OG image files.

## Issue codes → action

| Code | Action |
| --- | --- |
| `meta/title-missing`, `meta/description-missing`, `meta/*-short` | Draft copy (step 4) |
| `serp/title-truncated`, `serp/description-truncated` | Shorten with `validate_serp_snippet` |
| `meta/canonical-missing` | `canonical: "https://…/route"` (auto-filled when `og:url` exists) |
| `meta/robots-noindex` | Confirm intent, then `robots: null` |
| `og/*-missing`, `og/url-*`, `og/image-dimensions-*`, `twitter/card-*` | Use `issue.fix` / `suggestedUpdates` |
| `og/image-relative` | Absolute URL; in Next.js set `metadataBase` |
| `og/image-small`, `og/image-aspect-ratio`, `og/image-unreachable` | Needs a 1200×630 asset — tell the user |
| `favicon/*` | Needs image files; sizes are in the report's `favicons` grid |
| `jsonld/syntax` | Fix the JSON (often a trailing comma) |
| `jsonld/required-missing`, `jsonld/recommended-missing` | Add the named schema.org properties to the entity at `path` |
