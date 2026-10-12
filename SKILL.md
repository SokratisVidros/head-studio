---
name: head-studio
description: Audit and fix a web page's <head> metadata — title/description SERP truncation, canonical/robots, Open Graph and X/Twitter cards (image size and 1.91:1 ratio), favicons/apple-touch-icon/manifest, and JSON-LD schema.org structured data. Use when asked to improve SEO metadata, social share previews, favicons or structured data in a Next.js, Astro or static HTML project.
---

# head-studio

`head-studio` inspects a running dev server (`http://localhost:3000/...`) or a static build (`./dist`, `./out`, `./public`) and fixes metadata in source files using each framework's own conventions.

## Tools

Prefer the MCP tools when the `head-studio` MCP server is connected; otherwise use the CLI equivalents. CLI `--json` output is strict JSON on stdout (logs go to stderr).

| MCP tool | CLI | Purpose |
| --- | --- | --- |
| `inspect_route { url, route?, root? }` | `npx head-studio inspect --url <url-or-path> --json` | Full report: meta, SERP pixel widths, OG/Twitter, favicon grid, JSON-LD, `issues[]` |
| `validate_serp_snippet { title, description }` | `npx head-studio serp --title "…" --description "…" --json` | Pixel widths + truncation for desktop and mobile |
| `apply_metadata_fix { filePath, targetFramework, updates, dryRun? }` | `npx head-studio fix <file> --framework nextjs --updates '<json>' [--dry-run] --json` | Edit the source file and return a unified diff |

## Workflow

1. **Find the target.** Ask for or detect the dev server URL (check `package.json` scripts; Next.js defaults to `:3000`, Astro to `:4321`, Vite to `:5173`). If no server is running, build and inspect the output directory (`out/`, `dist/`).
2. **Inspect.** Call `inspect_route` for each important route (home page, a representative article/product page). Work through `issues` in order — they are sorted errors → warnings → info. Each issue has a stable `code` and usually a `hint`.
3. **Draft copy.** For titles and descriptions, iterate with `validate_serp_snippet` until `desktop.title.truncated` and `desktop.description.truncated` are both `false`. Keep titles unique per page, front-load keywords, and aim for 70–155 characters in descriptions. Don't invent facts about the product — derive copy from the page content.
4. **Locate the source file** that owns the route's metadata:
   - **Next.js App Router:** the nearest `page.tsx` / `layout.tsx` under `app/` (`app/layout.tsx` for site-wide defaults, `app/blog/[slug]/page.tsx` for a post). Files with `"use client"` cannot export metadata.
   - **Astro:** the page in `src/pages/` if it renders `<SEO>` or passes `title`/`description` to a layout; otherwise the layout in `src/layouts/` that owns `<head>`.
   - **Plain HTML:** the HTML file itself (e.g. `public/index.html`, `index.html`).
5. **Preview, then apply.** Call `apply_metadata_fix` with `dryRun: true`, review the diff, then call again without `dryRun`.
6. **Verify.** Re-run `inspect_route` and confirm the issues are gone. Dev servers usually hot-reload; static builds need a rebuild.

## The `updates` object

Always use the **Next.js `Metadata` shape**, for every framework — the fixer translates it into Astro `<SEO>` props or HTML `<meta>`/`<link>` tags:

```json
{
  "title": "Acme Rockets — Reusable launch vehicles",
  "description": "Acme builds reusable rockets that make orbit affordable.",
  "canonical": "https://acme.example/",
  "robots": { "index": true, "follow": true },
  "openGraph": {
    "title": "Acme Rockets",
    "description": "Reusable launch vehicles that make orbit affordable.",
    "url": "https://acme.example/",
    "siteName": "Acme",
    "type": "website",
    "images": [{ "url": "https://acme.example/og.png", "width": 1200, "height": 630, "alt": "Acme rocket on the pad" }]
  },
  "twitter": { "card": "summary_large_image", "site": "@acme" }
}
```

- Nested objects are **deep-merged**: you only need to send the keys you change.
- Set a key to `null` to remove it (e.g. `"robots": null` to drop a stray `noindex`).
- `canonical` is shorthand for `alternates.canonical`. In Next.js, `themeColor` is written to `export const viewport`.
- Next.js-only keys (e.g. `metadataBase`, `icons`, `alternates.languages`) pass straight through to `export const metadata`.

## Framework rules

- **Next.js:** never add `<meta>` or `<head>` JSX to App Router layouts — always use `export const metadata` (the fixer does this, creating the export and `import type { Metadata } from 'next'` when missing). If the route uses `generateMetadata`, the fixer merges into its returned object literal; check the diff, since dynamic values may need to stay dynamic. Relative `og:image` URLs need `metadataBase: new URL('https://your-domain')` in the root layout.
- **Astro:** values bound to expressions (`<title>{title}</title>`, `title={post.title}`) are left untouched and reported as warnings — update the data source or the props passed to the layout instead.
- **HTML:** existing tags are edited in place; missing tags are inserted before `</head>` with matching indentation.

## Issue cheat sheet

| Code | Fix |
| --- | --- |
| `meta/title-missing`, `meta/description-missing` | Add `title` / `description` |
| `serp/title-truncated`, `serp/description-truncated` | Shorten using `validate_serp_snippet` |
| `meta/canonical-missing` | `canonical: "https://…/route"` |
| `meta/robots-noindex` | Confirm intent; `robots: null` to remove |
| `og/image-missing`, `og/image-relative` | Absolute `openGraph.images[0].url` (Next.js: set `metadataBase`) |
| `og/image-small`, `og/image-aspect-ratio` | Use a 1200×630 image; tell the user if a new asset is needed — don't fabricate one |
| `twitter/card-missing`, `twitter/card-invalid` | `twitter.card: "summary_large_image"` |
| `favicon/*` | Usually requires adding image files; list what's missing (sizes are in the report's `favicons.grid`) |
| `jsonld/syntax` | Fix the JSON in the `<script type="application/ld+json">` block (often a trailing comma) |
| `jsonld/required-missing`, `jsonld/recommended-missing` | Add the named schema.org properties to the entity at `path` |

JSON-LD and favicon assets are not edited by `apply_metadata_fix`; change those files directly.
