import type { ResourceContext } from '../fetcher.js';
import type { Issue, MetaTags, OpenGraphTags, TwitterTags } from '../types.js';
import { checkImage, publicCheck } from './images.js';

export const OG_RECOMMENDED = { width: 1200, height: 630 } as const;
const OG_RATIO = OG_RECOMMENDED.width / OG_RECOMMENDED.height; // ≈ 1.905
const RATIO_TOLERANCE = 0.03;

export function aspectRatioOk(width: number, height: number, target = OG_RATIO, tolerance = RATIO_TOLERANCE): boolean {
  return Math.abs(width / height - target) / target <= tolerance;
}

const isAbsolute = (u: string) => /^https?:\/\//i.test(u);

export async function validateOpenGraph(og: OpenGraphTags, meta: MetaTags, ctx: ResourceContext): Promise<Issue[]> {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], code: string, message: string, hint?: string) =>
    issues.push({ severity, category: 'opengraph', code, message, hint });

  if (!og.title) add(meta.title ? 'warning' : 'error', 'og/title-missing', 'Missing og:title.', 'Social platforms fall back unpredictably; set og:title explicitly.');
  if (!og.description) add('warning', 'og/description-missing', 'Missing og:description.');
  if (!og.type) add('info', 'og/type-missing', 'Missing og:type (defaults to "website").');
  if (!og.url) add('info', 'og/url-missing', 'Missing og:url.', 'Set og:url to the canonical URL.');
  else if (meta.canonical && isAbsolute(meta.canonical) && stripSlash(og.url) !== stripSlash(meta.canonical)) {
    add('warning', 'og/url-canonical-mismatch', `og:url (${og.url}) differs from the canonical URL (${meta.canonical}).`);
  }

  if (!og.image) {
    add('error', 'og/image-missing', 'Missing og:image — shares will render without a preview image.', `Add a ${OG_RECOMMENDED.width}×${OG_RECOMMENDED.height} image via og:image.`);
    return issues;
  }
  if (!isAbsolute(og.image)) {
    add('error', 'og/image-relative', `og:image "${og.image}" is not an absolute URL; scrapers will not resolve it.`, 'Use a fully-qualified https:// URL (in Next.js set metadataBase).');
  }
  if (!og.imageAlt) add('info', 'og/image-alt-missing', 'Missing og:image:alt.', 'Describe the image for accessibility.');

  const check = await checkImage(og.image, ctx);
  og.imageCheck = publicCheck(check);
  if (!check.ok || check.width == null || check.height == null) {
    add('error', 'og/image-unreachable', `og:image could not be loaded: ${check.error ?? 'unknown error'}.`, `Resolved to ${check.resolved ?? 'nothing'}.`);
    return issues;
  }
  const { width, height } = check;
  if (width < 200 || height < 200) {
    add('error', 'og/image-too-small', `og:image is ${width}×${height}; Facebook requires at least 200×200.`, `Use ${OG_RECOMMENDED.width}×${OG_RECOMMENDED.height}.`);
  } else if (width < OG_RECOMMENDED.width || height < OG_RECOMMENDED.height) {
    add('warning', 'og/image-small', `og:image is ${width}×${height}; ${OG_RECOMMENDED.width}×${OG_RECOMMENDED.height} is recommended for high-resolution cards.`);
  }
  if (!aspectRatioOk(width, height)) {
    add('warning', 'og/image-aspect-ratio', `og:image aspect ratio is ${(width / height).toFixed(2)}:1; 1.91:1 (${OG_RECOMMENDED.width}×${OG_RECOMMENDED.height}) avoids cropping.`);
  }
  if ((og.imageWidth != null && og.imageWidth !== width) || (og.imageHeight != null && og.imageHeight !== height)) {
    add('warning', 'og/image-dimensions-mismatch', `Declared og:image:width/height (${og.imageWidth ?? '?'}×${og.imageHeight ?? '?'}) do not match the actual image (${width}×${height}).`);
  } else if (og.imageWidth == null || og.imageHeight == null) {
    add('info', 'og/image-dimensions-undeclared', 'og:image:width / og:image:height are not declared.', 'Declaring them lets platforms render the card on first share.');
  }
  if (check.bytes != null && check.bytes > 8 * 1024 * 1024) add('warning', 'og/image-heavy', `og:image is ${(check.bytes / 1024 / 1024).toFixed(1)} MB; Facebook rejects images over 8 MB.`);
  if (check.contentType && /svg/i.test(check.contentType)) add('error', 'og/image-svg', 'og:image is an SVG, which social platforms do not render.', 'Use PNG, JPEG or WebP.');
  return issues;
}

const TWITTER_CARDS = new Set(['summary', 'summary_large_image', 'app', 'player']);

export async function validateTwitter(tw: TwitterTags, og: OpenGraphTags, ctx: ResourceContext): Promise<Issue[]> {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], code: string, message: string, hint?: string) =>
    issues.push({ severity, category: 'twitter', code, message, hint });

  if (!tw.card) add('warning', 'twitter/card-missing', 'Missing twitter:card; X will show a minimal summary card.', 'Set twitter:card to "summary_large_image".');
  else if (!TWITTER_CARDS.has(tw.card)) add('error', 'twitter/card-invalid', `twitter:card "${tw.card}" is not valid (summary, summary_large_image, app, player).`);

  if (!tw.title && !og.title) add('warning', 'twitter/title-missing', 'No twitter:title or og:title fallback.');
  const image = tw.image ?? og.image;
  if (!image) {
    if (tw.card === 'summary_large_image') add('error', 'twitter/image-missing', 'twitter:card is summary_large_image but no image is set (twitter:image or og:image).');
    return issues;
  }
  if (tw.image) {
    const check = await checkImage(tw.image, ctx);
    tw.imageCheck = publicCheck(check);
    if (!check.ok) {
      add('error', 'twitter/image-unreachable', `twitter:image could not be loaded: ${check.error ?? 'unknown error'}.`);
      return issues;
    }
    if (check.bytes != null && check.bytes > 5 * 1024 * 1024) add('warning', 'twitter/image-heavy', 'twitter:image exceeds the 5 MB limit.');
    if (tw.card === 'summary_large_image' && check.width != null && check.height != null && (check.width < 300 || check.height < 157)) {
      add('warning', 'twitter/image-small', `twitter:image is ${check.width}×${check.height}; summary_large_image needs at least 300×157.`);
    }
  }
  return issues;
}

const stripSlash = (u: string) => u.replace(/\/+$/, '');
