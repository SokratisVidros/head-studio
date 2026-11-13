import { Heart, ImageOff, MoreHorizontal } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { InspectReport } from '../../../core/types';
import { assetUrl, displayHost } from '../../api';
import { cx } from '../ui';

/*
 * Shared building blocks for the social previews. Everything shown comes from the
 * inspected page (`Ctx`); content the page can't provide (counts, locations, other
 * posts) is drawn as grey skeleton bars rather than invented.
 */

export type Device = 'desktop' | 'mobile';

export interface Ctx {
  title: string;
  description: string;
  host: string;
  siteName: string;
  url: string;
  ogImage?: string;
  ogSize: { w: number | null; h: number | null };
  twImage?: string;
  twTitle: string;
  twDescription: string;
  twSize: { w: number | null; h: number | null };
  largeCard: boolean;
  handle: string;
  icon?: { src: string; label: string; width: number | null };
}

/** Best brand icon for avatars/logos: apple-touch → manifest 512/192 → png 32 → svg → ico. */
function siteIcon(report: InspectReport): Ctx['icon'] {
  const rows = new Map(report.favicons.grid.map((r) => [r.id, r]));
  for (const id of ['apple-touch-icon', 'manifest-512x512', 'manifest-192x192', 'png-32x32']) {
    const row = rows.get(id);
    const c = row?.check;
    if (c?.ok && c.resolved) return { src: assetUrl(c.resolved)!, label: `${row!.label} ${c.width}×${c.height}`, width: c.width };
  }
  const svg = rows.get('svg');
  if (svg?.status === 'pass' && svg.href) {
    try {
      return { src: assetUrl(new URL(svg.href, report.url).href)!, label: 'SVG icon', width: null };
    } catch {
      // unresolvable href
    }
  }
  const ico = rows.get('favicon-ico')?.check;
  return ico?.ok && ico.resolved ? { src: assetUrl(ico.resolved)!, label: `favicon.ico${ico.width ? ` ${ico.width}×${ico.height}` : ''}`, width: ico.width } : undefined;
}

export function buildCtx(report: InspectReport): Ctx {
  const og = report.openGraph;
  const tw = report.twitter;
  const title = og.title ?? report.meta.title ?? 'Untitled';
  const description = og.description ?? report.meta.description ?? '';
  const host = displayHost(og.url ?? report.meta.canonical ?? report.url);
  const ogImage = og.imageCheck?.ok ? assetUrl(og.imageCheck.resolved) : undefined;
  const ogSize = { w: og.imageCheck?.width ?? null, h: og.imageCheck?.height ?? null };
  const twOwn = tw.imageCheck?.ok;
  return {
    title,
    description,
    host,
    siteName: og.siteName ?? host,
    url: og.url ?? report.meta.canonical ?? report.url,
    ogImage,
    ogSize,
    twImage: twOwn ? assetUrl(tw.imageCheck!.resolved) : ogImage,
    twTitle: tw.title ?? title,
    twDescription: tw.description ?? description,
    twSize: twOwn ? { w: tw.imageCheck!.width, h: tw.imageCheck!.height } : ogSize,
    largeCard: (tw.card ?? 'summary') === 'summary_large_image',
    handle: (tw.site ?? tw.creator ?? `@${host.split(/[.:]/)[0] || 'site'}`).replace(/^@?/, '@'),
    icon: siteIcon(report),
  };
}

// ── asset hints ───────────────────────────────────────────────────────────────
// Slots carry their hint as `data-hint`; AnnotatedStage renders it as a chip above the
// preview with a leader line, so nothing is drawn inside the preview itself.

const sizeLabel = (s: { w: number | null; h: number | null }) => (s.w && s.h ? ` ${s.w}×${s.h}` : '');

/** Cover/banner slot filled with og:image (center-cropped to the platform's ratio). Empty → plain banner. */
export function Cover({ ctx, ratio, label, className, empty = '#cfd9de' }: { ctx: Ctx; ratio: number; label: string; className?: string; empty?: string }) {
  return (
    <div
      data-anchor="image"
      data-hint={ctx.ogImage ? `cover ← og:image${sizeLabel(ctx.ogSize)} · ${label}` : 'cover · no og:image'}
      className={cx('relative w-full overflow-hidden', className)}
      style={{ aspectRatio: ratio, background: empty }}
    >
      {ctx.ogImage && <img src={ctx.ogImage} alt="" className="absolute inset-0 size-full object-cover" />}
    </div>
  );
}

/** Avatar/logo slot filled with the site icon; hint names its source and blur risk. */
export function BrandAvatar({ ctx, size, shape = 'circle', ring, className, tag = 'bottom' }: { ctx: Ctx; size: number; shape?: 'circle' | 'square'; ring?: string; className?: string; tag?: 'bottom' | 'right' | 'none' }) {
  const blurry = ctx.icon?.width != null && ctx.icon.width < size * 2;
  const hint = ctx.icon ? `${shape === 'square' ? 'logo' : 'avatar'} ← ${ctx.icon.label}${blurry ? ' · blurry at 2×' : ''}` : 'no site icon';
  return (
    <div data-hint={tag === 'none' ? undefined : hint} className={cx('relative shrink-0', className)} style={{ width: size, height: size }}>
      <div className={cx('size-full overflow-hidden', shape === 'circle' ? 'rounded-full' : 'rounded-md')} style={ring ? { boxShadow: `0 0 0 4px ${ring}` } : undefined}>
        <Avatar ctx={ctx} size={size} square={shape === 'square'} />
      </div>
    </div>
  );
}

// ── primitives ────────────────────────────────────────────────────────────────

export function Img({ src, ratio, className = '' }: { src?: string; ratio: string; className?: string }) {
  const [failed, setFailed] = useState<string>();
  const ok = src && failed !== src;
  return (
    <div data-anchor="image" className={cx('relative w-full overflow-hidden bg-[#eef1f5]', className)} style={{ aspectRatio: ratio }}>
      {ok ? <img src={src} alt="" onError={() => setFailed(src)} className="absolute inset-0 size-full object-cover" /> : <ImageOff className="absolute top-1/2 left-1/2 size-5 -translate-1/2 text-faint" />}
    </div>
  );
}

export function Avatar({ ctx, size = 40, square = false }: { ctx: Ctx; size?: number; square?: boolean }) {
  return (
    <div data-anchor="icon" className={cx('grid shrink-0 place-items-center overflow-hidden bg-[#e4e6eb] text-[#65676b]', square ? 'rounded-md' : 'rounded-full')} style={{ width: size, height: size }}>
      {ctx.icon ? <img src={ctx.icon.src} alt="" className="size-full object-contain" /> : <span style={{ fontSize: size * 0.4 }} className="font-semibold uppercase">{ctx.siteName[0]}</span>}
    </div>
  );
}

/** Neutral person silhouette for slots that hold a human photo (LinkedIn personal profiles). */
export function PersonAvatar({ size, ring }: { size: number; ring?: string }) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-full bg-[#d0d5dd]" style={{ width: size, height: size, boxShadow: ring ? `0 0 0 4px ${ring}` : undefined }}>
      <div className="absolute top-[22%] left-1/2 size-[36%] -translate-x-1/2 rounded-full bg-[#9aa3af]" />
      <div className="absolute top-[64%] left-1/2 h-[60%] w-[70%] -translate-x-1/2 rounded-t-full bg-[#9aa3af]" />
    </div>
  );
}

export const Skel = ({ w = '100%', h = 8, className, dark }: { w?: number | string; h?: number; className?: string; dark?: boolean }) => (
  <div className={cx('shrink-0 rounded-full', dark ? 'bg-white/15' : 'bg-black/[0.08]', className)} style={{ width: w, height: h }} />
);

export function SkelCard({ lines = 3, h, dark }: { lines?: number; h?: number; dark?: boolean }) {
  return (
    <div className={cx('space-y-2 rounded-lg p-3', dark ? 'bg-[#242526]' : 'bg-white')} style={{ minHeight: h }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skel key={i} w={`${90 - i * 18}%`} dark={dark} />
      ))}
    </div>
  );
}

/** Scales a fixed-width page down (never up) so the whole layout fits the panel. */
export function FitWidth({ width, children }: { width: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // Measure before first paint, then track resizes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setScale(Math.min(1, el.clientWidth / width));
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    // inline-size containment: the wrapper's width must come from the panel, not the fixed-width page inside it
    <div ref={ref} style={{ containerType: 'inline-size' }}>
      <div className="mx-auto" style={{ width, zoom: scale }}>{children}</div>
    </div>
  );
}

/** Generic top bar: logo block, search pill, nav icons — no platform branding. */
export function TopBar({ bg, dark, children }: { bg: string; dark?: boolean; children?: ReactNode }) {
  return (
    <div className={cx('flex h-12 items-center gap-3 border-b px-4', dark ? 'border-white/10' : 'border-black/5')} style={{ background: bg }}>
      <Skel w={28} h={28} className="rounded-md" dark={dark} />
      <Skel w={220} h={28} dark={dark} />
      <div className="ml-auto flex gap-3">{children ?? [0, 1, 2, 3].map((i) => <Skel key={i} w={24} h={24} dark={dark} />)}</div>
    </div>
  );
}

/** Desktop page: top bar, left column, centre column at the platform's width, right rail. */
export function DesktopPage({ bg, bar, left = 220, center, right = 300, children, rail, leftSlot, dark }: { bg: string; bar: string; left?: number; center: number; right?: number; children: ReactNode; rail?: ReactNode; leftSlot?: ReactNode; dark?: boolean }) {
  const width = left + center + right + 64;
  return (
    <FitWidth width={width}>
      <div className="overflow-hidden rounded-md border border-line" style={{ background: bg }}>
        <TopBar bg={bar} dark={dark} />
        <div className="flex items-start gap-4 p-4">
          <div className="shrink-0 space-y-3" style={{ width: left }}>
            {leftSlot ?? <SkelCard lines={4} dark={dark} />}
            <SkelCard lines={3} dark={dark} />
          </div>
          <div className="shrink-0 space-y-3" style={{ width: center }}>
            {children}
            <SkelCard lines={3} h={90} dark={dark} />
          </div>
          <div className="shrink-0 space-y-3" style={{ width: right }}>
            {rail}
            <SkelCard lines={5} dark={dark} />
          </div>
        </div>
      </div>
    </FitWidth>
  );
}

/** Mobile feed: the post followed by placeholder posts. */
export const Feed = ({ children }: { children: ReactNode }) => (
  <div className="space-y-2">
    {children}
    <SkelCard lines={3} h={160} />
    <SkelCard lines={2} h={120} />
  </div>
);

export function Phone({ bg = '#fff', children, dark }: { bg?: string; children: ReactNode; dark?: boolean }) {
  return (
    <div className="mx-auto w-[375px] overflow-hidden rounded-[36px] border-[10px] border-[#1c1c1e] shadow-pop" style={{ background: bg }}>
      <div className={cx('flex h-8 items-center justify-between px-6 text-[12px] font-semibold', dark ? 'text-white' : 'text-black')}>
        <span>9:41</span>
        <span className="h-4 w-20 rounded-full bg-[#1c1c1e]" />
        <span>●●●</span>
      </div>
      <div data-scroll className="h-[640px] overflow-y-auto">{children}</div>
    </div>
  );
}

export function PostHeader({ ctx, sub, avatar = 40, dark }: { ctx: Ctx; sub: ReactNode; avatar?: number; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar ctx={ctx} size={avatar} />
      <div className="min-w-0 leading-tight">
        <div className={cx('truncate text-[15px] font-semibold', dark ? 'text-[#e4e6eb]' : 'text-[#050505]')}>{ctx.siteName}</div>
        <div className={cx('truncate text-[13px]', dark ? 'text-[#b0b3b8]' : 'text-[#65676b]')}>{sub}</div>
      </div>
      <MoreHorizontal className={cx('ml-auto size-5', dark ? 'text-[#b0b3b8]' : 'text-[#65676b]')} />
    </div>
  );
}

export function Actions({ icons, className, dark }: { icons: Array<typeof Heart>; className?: string; dark?: boolean }) {
  return <div className={cx('flex justify-around border-t py-2', dark ? 'border-white/10 text-[#b0b3b8]' : 'border-black/10 text-[#65676b]', className)}>{icons.map((I, i) => <I key={i} className="size-[18px]" />)}</div>;
}
