import { ArrowLeft, Briefcase, CalendarDays, ExternalLink, Grid3x3, Link2, MapPin, MessageCircle, Search, SquarePlay } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../ui';
import { XPost, FacebookPost } from './cards';
import { BrandAvatar, Cover, FitWidth, PersonAvatar, Skel, SkelCard, TopBar, type Ctx } from './kit';

/*
 * Profile / page layouts where the site's brand assets end up:
 *   - site icon → avatar or logo slot
 *   - og:image  → cover/banner slot (stand-in: on the real platform these are uploads,
 *                 but teams usually reuse the OG artwork, and this shows how it crops)
 * Proportions marked "ref" were measured from desktop screenshots (Nov 2026); counts,
 * locations and dates are skeletons because the page doesn't provide them.
 */

const Stat = ({ label, dark }: { label: string; dark?: boolean }) => (
  <span className="inline-flex items-center gap-1">
    <Skel w={26} h={10} dark={dark} />
    {label}
  </span>
);

function Tabs({ items, color, line, dark }: { items: string[]; color: string; line: string; dark?: boolean }) {
  return (
    <div className={cx('flex border-b', dark ? 'border-white/15' : 'border-black/10')}>
      {items.map((t, i) => (
        <div key={t} className={cx('relative flex-1 py-3 text-center text-[15px]', i === 0 ? 'font-bold' : 'opacity-60')} style={{ color }}>
          {t}
          {i === 0 && <span className="absolute bottom-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full" style={{ background: line }} />}
        </div>
      ))}
    </div>
  );
}

const Pill = ({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) => (
  <span className={cx('inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-[15px] font-semibold whitespace-nowrap', className)} style={style}>
    {children}
  </span>
);

// ── X ─────────────────────────────────────────────────────────────────────────

/** ref: header 3:1; avatar ≈ 22.5% of column width, half over the header, 16px inset, 4px page-colour ring. */
export function XProfile({ ctx, mobile }: { ctx: Ctx; mobile?: boolean }) {
  const col = mobile ? 355 : 600;
  const avatar = Math.round(col * 0.225);
  const body = (
    <div className="bg-black text-[#e7e9ea]">
      <div className="flex items-center gap-6 px-4 py-1.5">
        <ArrowLeft className="size-5" />
        <div>
          <div className="text-[20px] leading-6 font-bold">{ctx.siteName}</div>
          <div className="mt-1 flex items-center gap-1 text-[13px] text-[#71767b]"><Skel w={24} h={9} dark /> posts</div>
        </div>
        <Search className="ml-auto size-5" />
      </div>
      <Cover ctx={ctx} ratio={3} label="3:1" empty="#333639" />
      <div className="px-4">
        <div className="flex items-start justify-between">
          <div style={{ marginTop: -avatar / 2 }}><BrandAvatar ctx={ctx} size={avatar} ring="#000" tag="right" /></div>
          <Pill className="mt-3 bg-[#eff3f4] text-black">Follow</Pill>
        </div>
        <div className="mt-3 text-[20px] leading-6 font-extrabold">{ctx.siteName}</div>
        <div className="text-[15px] text-[#71767b]">{ctx.handle}</div>
        {ctx.description && <p data-anchor="description" className="mt-3 text-[15px] leading-5">{ctx.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-[#71767b]">
          <span className="inline-flex items-center gap-1"><MapPin className="size-4" /><Skel w={60} h={10} dark /></span>
          <span className="inline-flex items-center gap-1"><Link2 className="size-4" /><span data-anchor="url" className="text-[#1d9bf0]">{ctx.host}</span></span>
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-4" /><Skel w={110} h={10} dark /></span>
        </div>
        <div className="mt-3 mb-1 flex gap-5 text-[15px] text-[#71767b]">
          <Stat label="Following" dark />
          <Stat label="Followers" dark />
        </div>
      </div>
      <Tabs items={['Posts', 'Replies', 'Highlights', 'Media']} color="#e7e9ea" line="#1d9bf0" dark />
      <XPost ctx={ctx} dark pinned />
    </div>
  );
  if (mobile) return body;
  return (
    <FitWidth width={1000}>
      <div className="flex justify-center overflow-hidden rounded-md border border-line bg-black">
        <div className="w-[250px] space-y-4 p-4">{[0, 1, 2, 3, 4, 5].map((i) => <Skel key={i} w={i ? 140 : 32} h={i ? 14 : 32} dark />)}</div>
        <div className="w-[600px] shrink-0 border-x border-[#2f3336]">{body}</div>
        <div className="w-[150px]" />
      </div>
    </FitWidth>
  );
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────

/** Company row (square logo + name) as it appears on personal profiles and the feed sidebar. */
const CompanyRow = ({ ctx, size = 40, text = 'text-[16px]' }: { ctx: Ctx; size?: number; text?: string }) => (
  <div className="flex items-center gap-3">
    <BrandAvatar ctx={ctx} size={size} shape="square" tag="right" />
    <span className={cx('font-semibold text-black/90', text)}>{ctx.siteName}</span>
  </div>
);

/**
 * ref: business Page admin sidebar — banner ≈ 3.6:1; square logo ≈ 30% of card width, its top
 * ~28% down the banner so roughly two-thirds of it sits over the banner; rounded ~8px corners.
 */
export function LinkedInPageSidebar({ ctx }: { ctx: Ctx }) {
  const W = 225;
  const logo = Math.round(W * 0.3);
  const bannerH = W / 3.6;
  const nav = ['Dashboard', 'Page posts', 'Analytics', 'Feed', 'Activity', 'Inbox', 'Edit page'];
  return (
    <div className="overflow-hidden rounded-lg border border-[#e0dfdc] bg-white">
      <Cover ctx={ctx} ratio={3.6} label="≈3.6:1" />
      <div className="px-4" style={{ marginTop: -(bannerH * 0.72) }}>
        <div className="inline-block rounded-lg bg-white p-0.5"><BrandAvatar ctx={ctx} size={logo} shape="square" tag="right" /></div>
        <div className="mt-2 truncate text-[18px] leading-6 font-semibold text-black/90">{ctx.siteName}</div>
        <div className="mt-1 flex items-center gap-1.5"><Skel w={12} h={12} className="rounded-sm" /><Skel w={110} h={10} className="bg-[#0a66c2]/25" /></div>
        <div className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-black/60"><Skel w={18} h={9} /> followers</div>
        <div className="mt-3 flex flex-col items-start gap-2">
          <Pill className="bg-[#0a66c2] px-3 py-1 text-[14px] text-white">+ Create</Pill>
          <Pill className="border border-black/70 px-3 py-1 text-[14px] text-black/70">View as member</Pill>
        </div>
      </div>
      <nav className="mt-3 pb-2">
        {nav.map((n, i) => (
          <div key={n} className={cx('border-l-2 px-4 py-2 text-[14px] font-semibold', i === 0 ? 'border-[#01754f] text-[#01754f]' : 'border-transparent text-black/75')}>{n}</div>
        ))}
      </nav>
    </div>
  );
}

/** Page admin view: business Page sidebar on the left, dashboard placeholders in the centre. */
export function LinkedInPageAdmin({ ctx }: { ctx: Ctx }) {
  return (
    <FitWidth width={1144}>
      <div className="overflow-hidden rounded-md border border-line bg-[#f4f2ee]">
        <TopBar bg="#fff" />
        <div className="flex items-start gap-4 p-4">
          <div className="w-[225px] shrink-0"><LinkedInPageSidebar ctx={ctx} /></div>
          <div className="flex-1 space-y-3">
            <SkelCard lines={4} h={180} />
            <SkelCard lines={3} h={160} />
          </div>
          <div className="w-[300px] shrink-0"><SkelCard lines={5} /></div>
        </div>
      </div>
    </FitWidth>
  );
}

/** ref: personal-profile feed sidebar — banner ≈ 3.9:1, avatar ≈ 33% of card width with ~30% over the banner. */
export function LinkedInProfileSidebar({ ctx }: { ctx: Ctx }) {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-[#e0dfdc] bg-white">
        <Cover ctx={ctx} ratio={3.9} label="≈3.9:1" />
        <div className="px-4 pb-4">
          <div className="-mt-6"><PersonAvatar size={72} ring="#fff" /></div>
          <div className="mt-2 flex items-center gap-1 text-[18px] font-semibold text-black/90"><Skel w={120} h={14} /></div>
          {ctx.description && <p data-anchor="description" className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-black/90">{ctx.description}</p>}
          <div className="mt-1"><Skel w={60} h={9} /></div>
          <div className="mt-3"><CompanyRow ctx={ctx} size={32} text="text-[14px]" /></div>
        </div>
      </div>
      <SkelCard lines={2} />
    </div>
  );
}

/** ref: personal profile — banner 4:1, avatar ≈ 20% of card width with ~60% over the banner, 24px inset. */
export function LinkedInProfile({ ctx, mobile }: { ctx: Ctx; mobile?: boolean }) {
  const card = mobile ? 355 : 804;
  const avatar = Math.round(card * 0.2);
  const body = (
    <div className={cx('overflow-hidden bg-white', !mobile && 'rounded-lg border border-[#e0dfdc]')}>
      <Cover ctx={ctx} ratio={4} label="4:1" className="bg-[#a0b4b7]" />
      <div className="px-6 pb-6">
        <div style={{ marginTop: -avatar * 0.6 }}><PersonAvatar size={avatar} ring="#fff" /></div>
        <div className={cx('mt-4 flex gap-8', mobile && 'flex-col gap-3')}>
          <div className="min-w-0 flex-1">
            <Skel w={220} h={20} />
            {ctx.description && <p data-anchor="description" className="mt-2 text-[16px] leading-6 text-black/90">{ctx.description}</p>}
            <div className="mt-2 flex items-center gap-1 text-[14px]"><Skel w={70} h={10} /> · <span className="font-semibold text-[#0a66c2]">Contact info</span></div>
            <div className="mt-2 inline-flex items-center gap-1 text-[14px] font-semibold text-[#0a66c2]"><Skel w={36} h={10} className="bg-[#0a66c2]/25" /> connections</div>
          </div>
          <div className="w-[230px] shrink-0 space-y-3">
            <CompanyRow ctx={ctx} />
            <div className="flex items-center gap-3"><Skel w={40} h={40} className="rounded-md" /><Skel w={150} h={12} /></div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Pill className="bg-[#0a66c2] text-white">Follow</Pill>
          <Pill className="border border-[#0a66c2] text-[#0a66c2]">Message</Pill>
          <Pill className="border border-black/60 text-black/60">More</Pill>
        </div>
      </div>
    </div>
  );
  if (mobile) return body;
  return (
    <FitWidth width={1180}>
      <div className="overflow-hidden rounded-md border border-line bg-[#f4f2ee]">
        <TopBar bg="#fff" />
        <div className="flex gap-6 p-6">
          <div className="w-[804px] shrink-0">{body}</div>
          <div className="flex-1 space-y-3"><SkelCard lines={4} /><SkelCard lines={5} /></div>
        </div>
      </div>
    </FitWidth>
  );
}

/** Company page: cover 1128×191 per LinkedIn's Pages image specs (≈5.9:1); square logo overlaps the cover. */
export function LinkedInCompany({ ctx, mobile }: { ctx: Ctx; mobile?: boolean }) {
  const logo = mobile ? 72 : 112;
  const body = (
    <div className={cx('overflow-hidden bg-white', !mobile && 'rounded-lg border border-[#e0dfdc]')}>
      <Cover ctx={ctx} ratio={1128 / 191} label="1128×191" />
      <div className="px-6 pb-5">
        <div style={{ marginTop: -logo / 2 }} className="inline-block rounded-md bg-white p-1"><BrandAvatar ctx={ctx} size={logo} shape="square" tag="right" /></div>
        <div className="mt-2 text-[24px] leading-8 font-semibold text-black/90">{ctx.siteName}</div>
        {ctx.description && <p data-anchor="description" className="mt-1 text-[16px] leading-6 text-black/90">{ctx.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-black/60"><Skel w={80} h={10} /> · <Skel w={70} h={10} /> · <Skel w={60} h={10} /></div>
        <div className="mt-4 flex gap-2">
          <Pill className="bg-[#0a66c2] text-white">+ Follow</Pill>
          <Pill className="border border-[#0a66c2] text-[#0a66c2]">Visit website <ExternalLink className="size-4" /></Pill>
        </div>
        <div className="mt-1 truncate text-[12px] text-black/50">→ {ctx.url}</div>
      </div>
      <Tabs items={['Home', 'About', 'Posts', 'Jobs', 'People']} color="#000000bf" line="#01754f" />
    </div>
  );
  if (mobile) return body;
  return (
    <FitWidth width={1180}>
      <div className="overflow-hidden rounded-md border border-line bg-[#f4f2ee]">
        <TopBar bg="#fff" />
        <div className="flex gap-6 p-6">
          <div className="w-[804px] shrink-0">{body}</div>
          <div className="flex-1 space-y-3"><SkelCard lines={4} /></div>
        </div>
      </div>
    </FitWidth>
  );
}

// ── Facebook ──────────────────────────────────────────────────────────────────

/** ref: Page header (dark) — cover ≈ 2.7:1 with rounded bottom; avatar ≈ 14% of page width beside the name. */
export function FacebookPage({ ctx }: { ctx: Ctx }) {
  const W = 1100;
  return (
    <FitWidth width={W}>
      <div className="overflow-hidden rounded-md border border-line bg-[#18191a] text-[#e4e6eb]">
        <TopBar bg="#242526" dark />
        <div className="bg-[#242526]">
          <Cover ctx={ctx} ratio={2.7} label="≈2.7:1" className="rounded-b-xl" empty="#3a3b3c" />
          <div className="flex items-center gap-6 px-8 py-6">
            <BrandAvatar ctx={ctx} size={Math.round(W * 0.14)} ring="#242526" />
            <div className="min-w-0 flex-1">
              <div className="text-[32px] leading-9 font-bold">{ctx.siteName}</div>
              <div className="mt-1 flex items-center gap-1 text-[15px] font-semibold text-[#b0b3b8]"><Skel w={20} h={10} dark /> followers · <Skel w={20} h={10} dark /> following</div>
              {ctx.description && <p data-anchor="description" className="mt-1 line-clamp-2 text-[15px] text-[#b0b3b8]">{ctx.description}</p>}
              <div className="mt-1 flex items-center gap-1 text-[15px] text-[#b0b3b8]"><Briefcase className="size-4" /><Skel w={70} h={10} dark /></div>
            </div>
            <div className="flex gap-2 self-start pt-4">
              <Pill className="rounded-md bg-[#0866ff] text-white"><MessageCircle className="size-4" /> Message</Pill>
              <Pill className="rounded-md bg-[#3a3b3c]">Follow</Pill>
              <Pill className="rounded-md bg-[#3a3b3c]"><Search className="size-4" /> Search</Pill>
            </div>
          </div>
          <div className="mx-8 flex gap-8 border-t border-white/10 py-3 text-[15px] font-semibold text-[#b0b3b8]">
            {['All', 'About', 'Followers', 'Photos', 'Mentions', 'More'].map((t, i) => <span key={t} className={i === 0 ? 'text-[#2d88ff]' : ''}>{t}</span>)}
          </div>
        </div>
        <div className="flex gap-4 p-4">
          <div className="w-[380px] shrink-0 space-y-2 rounded-lg bg-[#242526] p-4">
            <div className="text-[20px] font-bold">Intro</div>
            {ctx.description && <p data-anchor="description" className="text-center text-[15px]">{ctx.description}</p>}
            <div className="flex items-center gap-2 text-[15px]"><Link2 className="size-5 text-[#b0b3b8]" /><span data-anchor="url" className="font-semibold text-[#2d88ff]">{ctx.host}</span></div>
            <div className="flex items-center gap-2"><Briefcase className="size-5 text-[#b0b3b8]" /><Skel w={120} h={10} dark /></div>
          </div>
          <div className="flex-1"><FacebookPost ctx={ctx} dark /></div>
        </div>
      </div>
    </FitWidth>
  );
}

// ── Instagram ─────────────────────────────────────────────────────────────────

/** Approximate: no cover slot; round avatar, bio + link, 3:4 grid tiles. Bio link is plain text. */
export function InstagramProfile({ ctx, mobile }: { ctx: Ctx; mobile?: boolean }) {
  const handle = ctx.handle.slice(1);
  const grid = (
    <>
      <div className="mt-4 flex justify-around border-t border-black/10 pt-3 text-black"><Grid3x3 className="size-5" /><SquarePlay className="size-5 opacity-40" /></div>
      <div className="mt-2 grid grid-cols-3 gap-0.5">{Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[3/4] bg-black/[0.06]" />)}</div>
    </>
  );
  const bio = (
    <>
      <div className="text-[14px] font-semibold text-black">{ctx.siteName}</div>
      {ctx.description && <p data-anchor="description" className="text-[14px] leading-[18px] text-black">{ctx.description}</p>}
      <div data-anchor="url" className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#00376b]"><Link2 className="size-4" />{ctx.host}</div>
    </>
  );
  if (mobile)
    return (
      <div className="pt-2 pb-4">
        <div className="px-4 text-[20px] font-bold text-black">{handle}</div>
        <div className="mt-4 flex items-center gap-6 px-4">
          <BrandAvatar ctx={ctx} size={86} />
          <div className="flex flex-1 justify-around text-center text-[13px] text-black">
            {['posts', 'followers', 'following'].map((l) => <div key={l} className="flex flex-col items-center gap-1"><Skel w={28} h={12} />{l}</div>)}
          </div>
        </div>
        <div className="mt-3 space-y-0.5 px-4">{bio}</div>
        <div className="mt-3 flex gap-2 px-4">
          <span className="flex-1 rounded-lg bg-[#0095f6] py-1.5 text-center text-[14px] font-semibold text-white">Follow</span>
          <span className="flex-1 rounded-lg bg-[#efefef] py-1.5 text-center text-[14px] font-semibold text-black">Message</span>
        </div>
        {grid}
      </div>
    );
  return (
    <FitWidth width={935}>
      <div className="overflow-hidden rounded-md border border-line bg-white px-10 pt-8 pb-4">
        <div className="flex gap-16 pl-12">
          <BrandAvatar ctx={ctx} size={150} />
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-[20px] text-black">{handle}</span>
              <span className="rounded-lg bg-[#0095f6] px-4 py-1.5 text-[14px] font-semibold text-white">Follow</span>
              <span className="rounded-lg bg-[#efefef] px-4 py-1.5 text-[14px] font-semibold text-black">Message</span>
            </div>
            <div className="flex gap-10 text-[16px] text-black">{['posts', 'followers', 'following'].map((l) => <Stat key={l} label={l} />)}</div>
            <div className="space-y-0.5">{bio}</div>
          </div>
        </div>
        {grid}
      </div>
    </FitWidth>
  );
}

// ── TikTok ────────────────────────────────────────────────────────────────────

/** Approximate (no reference screenshot): centred round avatar, counts, Follow/Message, bio, plain-text link, 3:4 video grid. */
export function TikTokProfile({ ctx, mobile }: { ctx: Ctx; mobile?: boolean }) {
  const handle = ctx.handle.slice(1);
  const counts = ['Following', 'Followers', 'Likes'];
  const gridCols = mobile ? 'grid-cols-3' : 'grid-cols-6';
  const grid = <div className={cx('mt-4 grid gap-0.5', gridCols)}>{Array.from({ length: mobile ? 6 : 12 }, (_, i) => <div key={i} className="aspect-[3/4] bg-white/10" />)}</div>;
  if (mobile)
    return (
      <div className="pb-4 text-white">
        <div className="py-2 text-center text-[17px] font-semibold">{ctx.siteName}</div>
        <div className="mt-2 flex flex-col items-center">
          <BrandAvatar ctx={ctx} size={96} tag="right" />
          <div className="mt-3 text-[17px] font-semibold">@{handle}</div>
          <div className="mt-4 flex gap-6 text-center text-[13px] text-white/60">
            {counts.map((l) => <div key={l} className="flex flex-col items-center gap-1"><Skel w={30} h={12} dark />{l}</div>)}
          </div>
          <div className="mt-4 flex gap-1">
            <span className="rounded bg-[#fe2c55] px-10 py-2 text-[15px] font-semibold">Follow</span>
            <span className="rounded bg-white/15 px-4 py-2 text-[15px] font-semibold">Message</span>
          </div>
          {ctx.description && <p data-anchor="description" className="mt-3 px-8 text-center text-[14px] leading-[18px]">{ctx.description}</p>}
          <div data-anchor="url" className="mt-1 inline-flex items-center gap-1 text-[14px] font-semibold"><Link2 className="size-4" />{ctx.host}</div>
        </div>
        {grid}
      </div>
    );
  return (
    <FitWidth width={1100}>
      <div className="overflow-hidden rounded-md border border-line bg-[#121212] p-8 text-white">
        <div className="flex gap-6">
          <BrandAvatar ctx={ctx} size={116} />
          <div className="space-y-2">
            <div className="flex items-baseline gap-3"><span className="text-[24px] font-bold">{handle}</span><span className="text-[16px]">{ctx.siteName}</span></div>
            <div className="flex gap-2">
              <span className="rounded bg-[#fe2c55] px-8 py-1.5 text-[15px] font-semibold">Follow</span>
              <span className="rounded bg-white/15 px-4 py-1.5 text-[15px] font-semibold">Message</span>
            </div>
            <div className="flex gap-5 text-[15px] text-white/60">{counts.map((l) => <Stat key={l} label={l} dark />)}</div>
            {ctx.description && <p data-anchor="description" className="text-[15px]">{ctx.description}</p>}
            <div data-anchor="url" className="inline-flex items-center gap-1 text-[15px] font-semibold"><Link2 className="size-4" />{ctx.host}</div>
          </div>
        </div>
        <div className="mt-6 flex gap-8 border-b border-white/15 text-[17px] font-semibold"><span className="border-b-2 border-white pb-2">Videos</span><span className="text-white/50">Reposts</span><span className="text-white/50">Liked</span></div>
        {grid}
      </div>
    </FitWidth>
  );
}
