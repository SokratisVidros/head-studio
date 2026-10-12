import { fetchResource, type ResourceContext } from '../fetcher.js';
import type { FaviconCheckRow, FaviconReport, IconLink, ImageCheck, Issue, ManifestInfo } from '../types.js';
import { checkImage, publicCheck } from './images.js';

const sizesInclude = (sizes: string | null, wanted: string) =>
  !!sizes && sizes.toLowerCase().split(/\s+/).includes(wanted.toLowerCase());

const isPng = (l: { href: string; type: string | null }) => l.type === 'image/png' || /\.png(\?|#|$)/i.test(l.href);
const isSvg = (l: { href: string; type: string | null }) => l.type === 'image/svg+xml' || /\.svg(\?|#|$)/i.test(l.href);
const isIco = (l: { href: string; type: string | null }) =>
  /x-icon|vnd\.microsoft\.icon/.test(l.type ?? '') || /\.ico(\?|#|$)/i.test(l.href);

const iconLinks = (links: IconLink[]) => links.filter((l) => l.kind === 'icon' || l.kind === 'shortcut icon');

async function measured(href: string, ctx: ResourceContext): Promise<ImageCheck & { info: { images?: Array<{ width: number; height: number }> } | null }> {
  return checkImage(href, ctx);
}

function sizeMatches(check: ImageCheck & { info: { images?: Array<{ width: number; height: number }> } | null }, size: string): boolean {
  const [w, h] = size.split('x').map(Number);
  if (check.width === w && check.height === h) return true;
  return !!check.info?.images?.some((i) => i.width === w && i.height === h);
}

async function loadManifest(link: IconLink | undefined, ctx: ResourceContext): Promise<ManifestInfo | null> {
  if (!link) return null;
  const res = await fetchResource(link.href, ctx);
  const base: ManifestInfo = {
    href: link.href,
    resolved: res.resolved,
    ok: false,
    name: null,
    shortName: null,
    themeColor: null,
    backgroundColor: null,
    display: null,
    icons: [],
  };
  if (!res.ok || !res.bytes) return { ...base, error: res.error ?? 'Not found' };
  try {
    const json = JSON.parse(new TextDecoder().decode(res.bytes)) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    const icons = Array.isArray(json.icons)
      ? (json.icons as Array<Record<string, unknown>>)
          .filter((i) => i && typeof i.src === 'string')
          .map((i) => ({ src: i.src as string, sizes: str(i.sizes), type: str(i.type), purpose: str(i.purpose) }))
      : [];
    return {
      ...base,
      ok: true,
      name: str(json.name),
      shortName: str(json.short_name),
      themeColor: str(json.theme_color),
      backgroundColor: str(json.background_color),
      display: str(json.display),
      icons,
    };
  } catch (err) {
    return { ...base, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function validateFavicons(links: IconLink[], ctx: ResourceContext): Promise<{ report: FaviconReport; issues: Issue[] }> {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], code: string, message: string, hint?: string) =>
    issues.push({ severity, category: 'favicons', code, message, hint });
  const grid: FaviconCheckRow[] = [];
  const icons = iconLinks(links);

  // 1. favicon.ico (declared or at the conventional /favicon.ico location)
  {
    const declared = icons.find(isIco);
    const href = declared?.href ?? '/favicon.ico';
    const check = await measured(href, ctx);
    grid.push({
      id: 'favicon-ico',
      label: 'favicon.ico',
      expected: null,
      status: check.ok ? 'pass' : icons.length ? 'warn' : 'fail',
      href: check.ok || declared ? href : null,
      check: publicCheck(check),
      note: check.ok ? (declared ? 'Declared in <head>' : 'Served from /favicon.ico (implicit)') : check.error,
    });
    if (!check.ok && !icons.length) add('error', 'favicon/missing', 'No favicon: nothing declared in <head> and /favicon.ico is not served.', 'Add /favicon.ico and <link rel="icon" href="/favicon.ico" sizes="any">.');
    else if (!check.ok) add('info', 'favicon/ico-missing', '/favicon.ico is not served; some crawlers and legacy browsers request it directly.');
  }

  // 2/3. PNG variants
  for (const size of ['32x32', '16x16'] as const) {
    const link = icons.find((l) => isPng(l) && sizesInclude(l.sizes, size)) ?? icons.find((l) => isPng(l) && !l.sizes && size === '32x32');
    if (!link) {
      grid.push({ id: `png-${size}`, label: `PNG ${size}`, expected: size, status: 'warn', href: null, check: null, note: 'Not declared' });
      if (size === '32x32') add('info', 'favicon/png-missing', 'No 32×32 PNG favicon declared.', '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">');
      continue;
    }
    const check = await measured(link.href, ctx);
    const ok = check.ok && sizeMatches(check, size);
    grid.push({ id: `png-${size}`, label: `PNG ${size}`, expected: size, status: ok ? 'pass' : check.ok ? 'warn' : 'fail', href: link.href, check: publicCheck(check), note: check.ok && !ok ? `Actual size ${check.width}×${check.height}` : check.error });
    if (!check.ok) add('warning', 'favicon/unreachable', `Favicon ${link.href} could not be loaded: ${check.error}.`);
    else if (!ok) add('warning', 'favicon/size-mismatch', `Favicon ${link.href} is ${check.width}×${check.height}, declared as ${size}.`);
  }

  // 4. SVG icon (optional, modern browsers)
  {
    const link = icons.find(isSvg);
    if (link) {
      const res = await fetchResource(link.href, ctx);
      grid.push({ id: 'svg', label: 'SVG icon', expected: null, status: res.ok ? 'pass' : 'fail', href: link.href, check: null, note: res.ok ? 'Scalable icon' : res.error });
      if (!res.ok) add('warning', 'favicon/unreachable', `SVG favicon ${link.href} could not be loaded: ${res.error}.`);
    } else {
      grid.push({ id: 'svg', label: 'SVG icon', expected: null, status: 'warn', href: null, check: null, note: 'Optional — not declared' });
    }
  }

  // 5. Apple touch icon
  {
    const declared = links.find((l) => l.kind === 'apple-touch-icon' || l.kind === 'apple-touch-icon-precomposed');
    const href = declared?.href ?? '/apple-touch-icon.png';
    const check = await measured(href, ctx);
    const ok = check.ok && sizeMatches(check, '180x180');
    grid.push({
      id: 'apple-touch-icon',
      label: 'Apple touch icon',
      expected: '180x180',
      status: ok ? 'pass' : check.ok ? 'warn' : 'fail',
      href: check.ok || declared ? href : null,
      check: publicCheck(check),
      note: !check.ok ? (declared ? check.error : 'Not declared') : !ok ? `Actual size ${check.width}×${check.height}` : declared ? undefined : 'Served from /apple-touch-icon.png (implicit)',
    });
    if (!check.ok) add('warning', 'favicon/apple-touch-icon-missing', declared ? `Apple touch icon ${href} could not be loaded: ${check.error}.` : 'No apple-touch-icon.', '<link rel="apple-touch-icon" href="/apple-touch-icon.png"> with a 180×180 PNG.');
    else if (!ok) add('warning', 'favicon/apple-touch-icon-size', `Apple touch icon is ${check.width}×${check.height}; 180×180 is recommended.`);
  }

  // 6. Web app manifest + icons
  const manifestLink = links.find((l) => l.kind === 'manifest');
  const manifest = await loadManifest(manifestLink, ctx);
  grid.push({
    id: 'manifest',
    label: 'Web app manifest',
    expected: null,
    status: manifest?.ok ? 'pass' : manifest ? 'fail' : 'warn',
    href: manifestLink?.href ?? null,
    check: null,
    note: manifest?.ok ? manifest.name ?? manifest.shortName ?? 'Loaded' : manifest?.error ?? 'Not declared',
  });
  if (!manifest) add('info', 'favicon/manifest-missing', 'No web app manifest (<link rel="manifest">).', 'Add /site.webmanifest with 192×192 and 512×512 icons.');
  else if (!manifest.ok) add('warning', 'favicon/manifest-invalid', `Manifest ${manifest.href} could not be loaded: ${manifest.error}.`);

  if (manifest?.ok) {
    const manifestCtx: ResourceContext = { ...ctx, url: manifest.resolved ?? ctx.url };
    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons.find((i) => sizesInclude(i.sizes, size));
      if (!icon) {
        grid.push({ id: `manifest-${size}`, label: `Manifest icon ${size}`, expected: size, status: 'warn', href: null, check: null, note: 'Not listed in manifest' });
        add('warning', 'favicon/manifest-icon-missing', `Manifest has no ${size} icon (required for installable PWAs on Android).`);
        continue;
      }
      const check = await measured(icon.src, manifestCtx);
      const ok = check.ok && sizeMatches(check, size);
      grid.push({ id: `manifest-${size}`, label: `Manifest icon ${size}`, expected: size, status: ok ? 'pass' : check.ok ? 'warn' : 'fail', href: icon.src, check: publicCheck(check), note: check.ok && !ok ? `Actual size ${check.width}×${check.height}` : check.error });
      if (!check.ok) add('warning', 'favicon/unreachable', `Manifest icon ${icon.src} could not be loaded: ${check.error}.`);
      else if (!ok) add('warning', 'favicon/size-mismatch', `Manifest icon ${icon.src} is ${check.width}×${check.height}, declared as ${size}.`);
    }
  }

  return { report: { links, manifest, grid }, issues };
}
