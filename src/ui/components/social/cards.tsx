import { Bookmark, Heart, Link2, MessageCircle, Pin, Repeat2, Send, Share, ThumbsUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../ui';
import { Actions, Avatar, Img, PostHeader, Skel, type Ctx } from './kit';

// ── facebook ──────────────────────────────────────────────────────────────────

/** Facebook: images under 600×315 render as a small square beside the link; under 200×200 no image. */
export function fbVariant(s: Ctx['ogSize']): 'large' | 'small' | 'none' {
  if (s.w == null || s.h == null) return 'large';
  if (s.w >= 600 && s.h >= 315) return 'large';
  return s.w >= 200 && s.h >= 200 ? 'small' : 'none';
}

const FB = {
  light: { card: '#f0f2f5', line: '#dddfe2', ink: '#050505', muted: '#65676b', post: '#fff' },
  dark: { card: '#3a3b3c', line: '#3e4042', ink: '#e4e6eb', muted: '#b0b3b8', post: '#242526' },
};

export function FacebookCard({ ctx, dark }: { ctx: Ctx; dark?: boolean }) {
  const t = dark ? FB.dark : FB.light;
  const v = ctx.ogImage ? fbVariant(ctx.ogSize) : 'none';
  const text = (
    <div className="min-w-0 px-3 py-2.5" style={{ background: t.card }}>
      <div data-anchor="url" className="truncate text-[12px] uppercase" style={{ color: t.muted }}>{ctx.host}</div>
      <div data-anchor="title" className="line-clamp-2 text-[16px] leading-5 font-semibold" style={{ color: t.ink }}>{ctx.title}</div>
      {ctx.description && <div data-anchor="description" className="line-clamp-1 text-[14px]" style={{ color: t.muted }}>{ctx.description}</div>}
    </div>
  );
  if (v === 'small')
    return (
      <div data-anchor="card" className="flex border-y" style={{ background: t.card, borderColor: t.line }}>
        <div className="w-[130px] shrink-0"><Img src={ctx.ogImage} ratio="1 / 1" /></div>
        <div className="flex min-w-0 items-center">{text}</div>
      </div>
    );
  return (
    <div data-anchor="card" className="border-y" style={{ borderColor: t.line }}>
      {v === 'large' && <Img src={ctx.ogImage} ratio="1.91 / 1" />}
      {text}
    </div>
  );
}

export function FacebookPost({ ctx, dark }: { ctx: Ctx; dark?: boolean }) {
  return (
    <div className="rounded-lg shadow-sm" style={{ background: dark ? FB.dark.post : FB.light.post }}>
      <div className="space-y-3 p-3">
        <PostHeader ctx={ctx} sub="2h · 🌐" dark={dark} />
        <Skel w="70%" dark={dark} />
      </div>
      <FacebookCard ctx={ctx} dark={dark} />
      <Actions icons={[ThumbsUp, MessageCircle, Share]} className="mx-3" dark={dark} />
    </div>
  );
}

// ── x ─────────────────────────────────────────────────────────────────────────

const X = {
  light: { bg: '#fff', line: '#cfd9de', sep: '#eff3f4', ink: '#0f1419', muted: '#536471' },
  dark: { bg: '#000', line: '#2f3336', sep: '#2f3336', ink: '#e7e9ea', muted: '#71767b' },
};

/** X picks the layout from twitter:card. The headline overlay on large cards has changed over time; treat as approximate. */
export function XCard({ ctx, dark }: { ctx: Ctx; dark?: boolean }) {
  const t = dark ? X.dark : X.light;
  if (ctx.largeCard)
    return (
      <div data-anchor="card">
        <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: t.line }}>
          <Img src={ctx.twImage} ratio="1.91 / 1" />
          <span data-anchor="title" className="absolute bottom-3 left-3 max-w-[80%] truncate rounded bg-black/70 px-1.5 py-0.5 text-[13px] text-white">{ctx.twTitle}</span>
        </div>
        <div data-anchor="url" className="mt-1 text-[13px]" style={{ color: t.muted }}>From {ctx.host}</div>
      </div>
    );
  return (
    <div data-anchor="card" className="flex overflow-hidden rounded-2xl border" style={{ borderColor: t.line }}>
      <div className="w-[130px] shrink-0 border-r" style={{ borderColor: t.line }}><Img src={ctx.twImage} ratio="1 / 1" /></div>
      <div className="min-w-0 self-center px-3 py-2 text-[15px] leading-5">
        <div data-anchor="url" className="truncate" style={{ color: t.muted }}>{ctx.host}</div>
        <div data-anchor="title" className="truncate" style={{ color: t.ink }}>{ctx.twTitle}</div>
        <div data-anchor="description" className="line-clamp-2" style={{ color: t.muted }}>{ctx.twDescription}</div>
      </div>
    </div>
  );
}

export function XPost({ ctx, dark, pinned }: { ctx: Ctx; dark?: boolean; pinned?: boolean }) {
  const t = dark ? X.dark : X.light;
  return (
    <div className="border-b px-4 py-3" style={{ background: t.bg, borderColor: t.sep }}>
      {pinned && <div className="mb-1 flex items-center gap-2 pl-7 text-[13px] font-bold" style={{ color: t.muted }}><Pin className="size-3.5" /> Pinned</div>}
      <div className="flex gap-3">
        <Avatar ctx={ctx} size={40} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="truncate text-[15px]"><b style={{ color: t.ink }}>{ctx.siteName}</b> <span style={{ color: t.muted }}>{ctx.handle} · 2h</span></div>
          <Skel w="80%" dark={dark} />
          <XCard ctx={ctx} dark={dark} />
          <div className="flex justify-between pr-8" style={{ color: t.muted }}>{[MessageCircle, Repeat2, Heart, Bookmark, Share].map((I, i) => <I key={i} className="size-[18px]" />)}</div>
        </div>
      </div>
    </div>
  );
}

// ── linkedin ──────────────────────────────────────────────────────────────────

/** LinkedIn shrank organic link previews to a left thumbnail (2024); sponsored posts keep the full-width image. */
export function LinkedInCard({ ctx, sponsored }: { ctx: Ctx; sponsored?: boolean }) {
  if (sponsored)
    return (
      <div>
        <Img src={ctx.ogImage} ratio="1.91 / 1" />
        <div className="bg-[#eef3f8] px-3 py-2.5">
          <div data-anchor="title" className="line-clamp-2 text-[14px] font-semibold text-black/90">{ctx.title}</div>
          <div data-anchor="url" className="text-[12px] text-black/60">{ctx.host}</div>
        </div>
      </div>
    );
  return (
    <div data-anchor="card" className="mx-3 flex items-center gap-3 overflow-hidden rounded-lg border border-[#e0dfdc] bg-white p-2">
      <div className="w-[128px] shrink-0 overflow-hidden rounded"><Img src={ctx.ogImage} ratio="1.91 / 1" /></div>
      <div className="min-w-0">
        <div data-anchor="title" className="line-clamp-2 text-[14px] leading-5 font-semibold text-black/90">{ctx.title}</div>
        <div data-anchor="url" className="truncate text-[12px] text-black/60">{ctx.host}</div>
      </div>
    </div>
  );
}

export function LinkedInPost({ ctx, sponsored }: { ctx: Ctx; sponsored?: boolean }) {
  return (
    <div className="rounded-lg border border-[#e0dfdc] bg-white">
      <div className="space-y-3 p-3">
        <PostHeader ctx={ctx} sub={sponsored ? 'Promoted' : <Skel w={110} className="mt-1" />} avatar={48} />
        <Skel w="75%" />
      </div>
      <LinkedInCard ctx={ctx} sponsored={sponsored} />
      <Actions icons={[ThumbsUp, MessageCircle, Repeat2, Send]} className="mx-3 mt-2" />
    </div>
  );
}

// ── messaging & profiles (shared) ─────────────────────────────────────────────

export function DmThread({ ctx, me, them, bubble, card, dark }: { ctx: Ctx; me: string; them: string; bubble: string; card: ReactNode; dark?: boolean }) {
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2 border-b border-black/10 pb-3"><Skel w={32} h={32} /><Skel w={120} /></div>
      <div className="w-2/3 rounded-2xl px-3 py-2" style={{ background: them }}><Skel w="80%" /></div>
      <div className="ml-auto w-[260px] space-y-1">
        <div className="overflow-hidden rounded-2xl" style={{ background: bubble }}>{card}</div>
        <div className={cx('truncate rounded-2xl px-3 py-2 text-[14px]', dark ? 'text-white' : 'text-black')} style={{ background: me }}>{ctx.url}</div>
      </div>
    </div>
  );
}

export function DmCard({ ctx, dark, ratio = '1.91 / 1' }: { ctx: Ctx; dark?: boolean; ratio?: string }) {
  return (
    <div>
      <Img src={ctx.ogImage} ratio={ratio} />
      <div className="px-3 py-2">
        <div data-anchor="title" className={cx('line-clamp-2 text-[14px] leading-5 font-semibold', dark ? 'text-white' : 'text-black')}>{ctx.title}</div>
        <div data-anchor="url" className={cx('truncate text-[12px]', dark ? 'text-white/60' : 'text-black/50')}>{ctx.host}</div>
      </div>
    </div>
  );
}

export function StorySticker({ ctx }: { ctx: Ctx }) {
  return (
    <div className="relative h-full min-h-[640px] bg-gradient-to-b from-[#4b5563] to-[#111827]">
      <div className="flex gap-1 p-2">{[0, 1, 2].map((i) => <div key={i} className="h-0.5 flex-1 rounded bg-white/50" />)}</div>
      <div className="flex items-center gap-2 px-3"><Avatar ctx={ctx} size={32} /><span className="text-[13px] font-semibold text-white">{ctx.handle.slice(1)}</span></div>
      <div className="absolute top-1/2 left-1/2 inline-flex max-w-[80%] -translate-1/2 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[15px] font-bold text-[#3897f0] uppercase shadow-pop">
        <Link2 className="size-4 shrink-0" />
        <span data-anchor="url" className="truncate">{ctx.host}</span>
      </div>
    </div>
  );
}

export function SlackUnfurl({ ctx }: { ctx: Ctx }) {
  return (
    <div className="flex gap-2 bg-white p-4">
      <Skel w={36} h={36} className="rounded-md" />
      <div className="min-w-0 flex-1 space-y-1">
        <Skel w={140} />
        <div className="truncate text-[15px] text-[#1264a3]">{ctx.url}</div>
        <div className="border-l-4 border-[#dddddd] pl-3">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#1d1c1d]"><Avatar ctx={ctx} size={16} square />{ctx.siteName}</div>
          <div data-anchor="title" className="mt-0.5 text-[15px] font-bold text-[#1264a3]">{ctx.title}</div>
          {ctx.description && <div data-anchor="description" className="mt-1 line-clamp-3 text-[14px] text-[#1d1c1d]">{ctx.description}</div>}
          <div className="mt-2 max-w-[360px] overflow-hidden rounded-lg border border-[#e8e8e8]"><Img src={ctx.ogImage} ratio="1.91 / 1" /></div>
        </div>
      </div>
    </div>
  );
}

