import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyMetadataFix } from '../src/core/fixers/index.js';
import { fixAstro } from '../src/core/fixers/astro.js';
import { fixHtml } from '../src/core/fixers/html.js';
import { fixNextjs, parseModule } from '../src/core/fixers/nextjs.js';

const parses = (code: string, file = 'app/layout.tsx') => expect(() => parseModule(code, file)).not.toThrow();

describe('Next.js fixer', () => {
  const layout = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Acme",
    template: "%s | Acme",
  },
  description: "Old description",
  openGraph: {
    title: "Acme",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

  it('deep-merges into export const metadata, preserving formatting and templates', () => {
    const out = fixNextjs(layout, 'app/layout.tsx', {
      title: 'Acme Rockets',
      description: 'Reusable rockets for everyone.',
      canonical: 'https://acme.example/',
      openGraph: { images: [{ url: 'https://acme.example/og.png', width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image' },
    });
    parses(out.code);
    expect(out.code).toContain('default: "Acme Rockets"');
    expect(out.code).toContain('template: "%s | Acme"');
    expect(out.code).toContain('description: "Reusable rockets for everyone."');
    expect(out.code).toContain('alternates: {\n    canonical: "https://acme.example/",\n  }');
    expect(out.code).toMatch(/openGraph: \{\n    title: "Acme",\n    images: \[/);
    expect(out.code).toContain('twitter: {\n    card: "summary_large_image",\n  },');
    expect(out.code).not.toMatch(/<meta/);
    expect(out.applied).toEqual(expect.arrayContaining(['title.default', 'description', 'alternates', 'openGraph.images', 'twitter']));
  });

  it('creates an export when none exists, with a type import for TS', () => {
    const code = `import "./globals.css";\n\nexport default function Page() {\n  return <main />;\n}\n`;
    const out = fixNextjs(code, 'app/page.tsx', { title: 'Home', description: "Rocket's home" });
    parses(out.code, 'app/page.tsx');
    expect(out.code).toBe(`import "./globals.css";\nimport type { Metadata } from "next";\n\nexport const metadata: Metadata = {\n  title: "Home",\n  description: "Rocket's home",\n};\n\nexport default function Page() {\n  return <main />;\n}\n`);
  });

  it('omits type annotations in JS files', () => {
    const out = fixNextjs('export default function Page() { return null }\n', 'app/page.jsx', { title: 'Home' });
    expect(out.code).toBe(`export const metadata = {\n  title: 'Home',\n};\n\nexport default function Page() { return null }\n`);
  });

  it('updates objects returned from generateMetadata', () => {
    const code = `export async function generateMetadata({ params }) {\n  const post = await getPost(params.slug);\n  return {\n    title: post.title,\n  };\n}\n`;
    const out = fixNextjs(code, 'app/blog/[slug]/page.jsx', { description: 'Fallback' });
    parses(out.code, 'page.jsx');
    expect(out.code).toContain("title: post.title,\n    description: 'Fallback',");
  });

  it('handles satisfies, single-line objects and removals', () => {
    const code = `export const metadata = { title: 'A', robots: 'noindex' } satisfies Metadata;\n`;
    const out = fixNextjs(code, 'app/layout.ts', { robots: null, description: 'D' });
    parses(out.code, 'app/layout.ts');
    expect(out.code).toBe(`export const metadata = { title: 'A', description: 'D' } satisfies Metadata;\n`);
  });

  it('routes themeColor to the viewport export', () => {
    const out = fixNextjs(`export const metadata = {\n  title: 'A',\n};\n`, 'app/layout.js', { themeColor: '#000' });
    expect(out.code).toContain(`export const viewport = {\n  themeColor: '#000',\n};`);
    expect(out.code).not.toMatch(/metadata = \{[^}]*themeColor/);
  });

  it('refuses client components', () => {
    expect(() => fixNextjs(`'use client';\nexport default function P() { return null }\n`, 'app/page.js', { title: 'x' })).toThrow(/Client Component/);
  });
});

describe('HTML fixer', () => {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Old</title>
    <meta name="description" content="old">
    <meta name="robots" content="noindex">
  </head>
  <body></body>
</html>
`;
  it('edits existing tags in place and inserts missing ones before </head>', () => {
    const out = fixHtml(html, 'index.html', {
      title: 'New & improved',
      description: 'A "quoted" description',
      robots: null,
      canonical: 'https://acme.example/',
      openGraph: { title: 'OG', images: [{ url: 'https://acme.example/og.png', width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image' },
    });
    expect(out.code).toContain('<title>New &amp; improved</title>');
    expect(out.code).toContain('<meta name="description" content="A &quot;quoted&quot; description">');
    expect(out.code).not.toContain('robots');
    expect(out.code).toContain(`    <link rel="canonical" href="https://acme.example/" />
    <meta property="og:title" content="OG" />
    <meta property="og:image" content="https://acme.example/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>`);
  });

  it('creates a <head> when missing', () => {
    const out = fixHtml('<html><body></body></html>', 'a.html', { title: 'T' });
    expect(out.code).toContain('<head>\n  <title>T</title>\n</head>');
  });
});

describe('Astro fixer', () => {
  it('updates <SEO> props including nested openGraph objects', () => {
    const code = `---
import { SEO } from 'astro-seo';
---
<html>
  <head>
    <SEO
      title="Old"
      openGraph={{
        basic: {
          title: 'Old',
          type: 'website',
          image: '/old.png',
        },
      }}
    />
  </head>
</html>
`;
    const out = fixAstro(code, 'src/pages/index.astro', {
      title: 'New',
      description: 'Desc',
      openGraph: { title: 'OG New', images: [{ url: 'https://acme.example/og.png', width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image' },
    });
    expect(out.code).toContain('title="New"');
    expect(out.code).toContain("title: 'OG New',");
    expect(out.code).toContain("image: 'https://acme.example/og.png',");
    expect(out.code).toMatch(/image: \{\n\s+width: 1200,\n\s+height: 630,\n\s+\}/);
    expect(out.code).toContain('      description="Desc"');
    expect(out.code).toMatch(/twitter=\{\{\n\s+card: 'summary_large_image',\n\s+\}\}/);
  });

  it('falls back to the layout <head> and leaves dynamic values alone', () => {
    const code = `---\nconst { title } = Astro.props;\n---\n<html>\n  <head>\n    <title>{title}</title>\n  </head>\n</html>\n`;
    const out = fixAstro(code, 'src/layouts/Base.astro', { title: 'X', description: 'D' });
    expect(out.code).toContain('<title>{title}</title>');
    expect(out.code).toContain('    <meta name="description" content="D" />\n  </head>');
    expect(out.warnings.join(' ')).toMatch(/dynamic/);
  });

  it('updates title/description props passed to a layout component', () => {
    const code = `---\nimport Layout from '../layouts/Layout.astro';\n---\n<Layout title="Old">\n  <h1>Hi</h1>\n</Layout>\n`;
    const out = fixAstro(code, 'src/pages/index.astro', { title: 'New', description: 'D' });
    expect(out.code).toContain('<Layout title="New" description="D">');
  });
});

describe('applyMetadataFix', () => {
  it('writes files, supports dry runs and refuses paths outside the workspace', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'head-studio-'));
    const file = path.join(dir, 'index.html');
    await writeFile(file, '<html><head>\n  <title>A</title>\n</head></html>');

    const dry = await applyMetadataFix('index.html', 'html', { title: 'B' }, { dryRun: true, workspaceRoot: dir });
    expect(dry).toMatchObject({ ok: true, changed: true, dryRun: true });
    expect(dry.diff).toContain('-  <title>A</title>');
    expect(dry.diff).toContain('+  <title>B</title>');
    expect(await readFile(file, 'utf8')).toContain('<title>A</title>');

    const real = await applyMetadataFix('index.html', undefined, { title: 'B' }, { workspaceRoot: dir });
    expect(real.framework).toBe('html');
    expect(await readFile(file, 'utf8')).toContain('<title>B</title>');

    const outside = await applyMetadataFix('../etc/passwd', 'html', { title: 'x' }, { workspaceRoot: dir });
    expect(outside.ok).toBe(false);
    expect(outside.error).toMatch(/outside the workspace/);
  });
});
