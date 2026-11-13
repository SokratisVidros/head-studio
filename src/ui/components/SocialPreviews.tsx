import { Monitor, Smartphone, Tag } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { InspectReport } from '../../core/types';
import { assetUrl } from '../api';
import { NetworkIcon } from './social/icons';
import { AnnotatedStage } from './social/notes';
import { DmCard, DmThread, FacebookPost, LinkedInPost, SlackUnfurl, StorySticker, XCard, XPost } from './social/cards';
import { DesktopPage, Feed, Phone, SkelCard, buildCtx, type Ctx, type Device } from './social/kit';
import { FacebookPage, InstagramProfile, LinkedInCompany, LinkedInPageAdmin, LinkedInProfile, LinkedInProfileSidebar, TikTokProfile, XProfile } from './social/profiles';
import { Panel, Pill, Segmented, cx } from './ui';

/*
 * In-context previews of how the page's metadata renders on social networks.
 * Platform chrome is deliberately reduced to grey skeletons: what matters is the
 * real column widths, crops and size-dependent card variants, not the branding.
 */

// ── registry ──────────────────────────────────────────────────────────────────

export interface Surface {
  id: string;
  label: string;
  devices: Device[];
  note: string;
  render: (ctx: Ctx, device: Device) => ReactNode;
}

const both: Device[] = ['desktop', 'mobile'];

/** Issue categories that map onto social preview slots. */
const SOCIAL = ['opengraph', 'twitter', 'favicons'];

export const PLATFORMS: Array<{ id: string; label: string; surfaces: Surface[] }> = [
  {
    id: 'facebook',
    label: 'facebook',
    surfaces: [
      {
        id: 'feed',
        label: 'feed',
        devices: both,
        note: 'og:image ≥ 600×315 renders full width; smaller (≥ 200×200) becomes a square thumbnail; smaller still, text only.',
        render: (ctx, d) => (d === 'desktop' ? <DesktopPage bg="#f0f2f5" bar="#fff" left={280} center={590} right={280}><FacebookPost ctx={ctx} /></DesktopPage> : <Phone bg="#f0f2f5"><Feed><FacebookPost ctx={ctx} /></Feed></Phone>),
      },
      { id: 'page', label: 'page', devices: ['desktop'], note: 'Page header: cover ← og:image (≈2.7:1), avatar ← site icon, website in the Intro card.', render: (ctx) => <FacebookPage ctx={ctx} /> },
    ],
  },
  {
    id: 'x',
    label: 'x',
    surfaces: [
      {
        id: 'timeline',
        label: 'timeline',
        devices: both,
        note: 'twitter:card picks the layout: summary_large_image → 1.91:1 image, summary → 1:1 thumbnail. Falls back to og:image.',
        render: (ctx, d) =>
          d === 'desktop' ? (
            <DesktopPage bg="#fff" bar="#fff" left={260} center={600} right={350} rail={<SkelCard lines={4} />}>
              <div className="border-x border-[#eff3f4]"><XPost ctx={ctx} /></div>
            </DesktopPage>
          ) : (
            <Phone><Feed><XPost ctx={ctx} /></Feed></Phone>
          ),
      },
      { id: 'profile', label: 'profile', devices: both, note: 'Header ← og:image cropped to 3:1, avatar ← site icon (half over the header), website as a text link, pinned post below.', render: (ctx, d) => (d === 'desktop' ? <XProfile ctx={ctx} /> : <Phone bg="#000" dark><XProfile ctx={ctx} mobile /></Phone>) },
      { id: 'dm', label: 'dm', devices: ['mobile'], note: 'Direct messages reuse the card with the same twitter:card layout.', render: (ctx) => <Phone><DmThread ctx={ctx} me="#1d9bf0" them="#eff3f4" bubble="#fff" dark card={<div className="p-1"><XCard ctx={ctx} /></div>} /></Phone> },
    ],
  },
  {
    id: 'linkedin',
    label: 'linkedin',
    surfaces: [
      {
        id: 'feed',
        label: 'feed',
        devices: both,
        note: 'Organic link posts show a small left thumbnail (since 2024). Left: personal-profile sidebar — banner ← og:image (≈3.9:1), company logo ← site icon.',
        render: (ctx, d) => (d === 'desktop' ? <DesktopPage bg="#f4f2ee" bar="#fff" left={225} center={555} right={300} leftSlot={<LinkedInProfileSidebar ctx={ctx} />}><LinkedInPost ctx={ctx} /></DesktopPage> : <Phone bg="#f4f2ee"><Feed><LinkedInPost ctx={ctx} /></Feed></Phone>),
      },
      { id: 'profile', label: 'profile', devices: both, note: 'Personal profile: banner ← og:image (4:1), company logo ← site icon. The photo slot is a person, so it stays a placeholder.', render: (ctx, d) => (d === 'desktop' ? <LinkedInProfile ctx={ctx} /> : <Phone bg="#f4f2ee"><LinkedInProfile ctx={ctx} mobile /></Phone>) },
      { id: 'page-sidebar', label: 'page sidebar', devices: ['desktop'], note: 'Business Page admin sidebar: banner ← og:image (≈3.6:1), square logo ← site icon overlapping the banner.', render: (ctx) => <LinkedInPageAdmin ctx={ctx} /> },
      { id: 'company', label: 'company page', devices: both, note: 'Company page: cover ← og:image (1128×191), square logo ← site icon, "Visit website" links to the page URL.', render: (ctx, d) => (d === 'desktop' ? <LinkedInCompany ctx={ctx} /> : <Phone bg="#f4f2ee"><LinkedInCompany ctx={ctx} mobile /></Phone>) },
      {
        id: 'sponsored',
        label: 'sponsored',
        devices: both,
        note: 'Sponsored content keeps the full-width 1.91:1 image (1200×627 recommended).',
        render: (ctx, d) => (d === 'desktop' ? <DesktopPage bg="#f4f2ee" bar="#fff" left={225} center={555} right={300} leftSlot={<LinkedInProfileSidebar ctx={ctx} />}><LinkedInPost ctx={ctx} sponsored /></DesktopPage> : <Phone bg="#f4f2ee"><Feed><LinkedInPost ctx={ctx} sponsored /></Feed></Phone>),
      },
      { id: 'messaging', label: 'messaging', devices: ['mobile'], note: 'Messaging unfurls with image, title and domain.', render: (ctx) => <Phone><DmThread ctx={ctx} me="#0a66c2" them="#f4f2ee" bubble="#f4f2ee" dark card={<DmCard ctx={ctx} />} /></Phone> },
    ],
  },
  {
    id: 'instagram',
    label: 'instagram',
    surfaces: [
      { id: 'profile', label: 'profile', devices: both, note: 'No cover slot. Avatar ← site icon (round crop), bio ← description, link is plain text. Approximate layout.', render: (ctx, d) => (d === 'desktop' ? <InstagramProfile ctx={ctx} /> : <Phone><InstagramProfile ctx={ctx} mobile /></Phone>) },
      { id: 'dm', label: 'dm', devices: ['mobile'], note: 'Instagram has no link cards in feed; DMs are where og:image + title appear.', render: (ctx) => <Phone bg="#000" dark><DmThread ctx={ctx} me="#3797f0" them="#262626" bubble="#262626" dark card={<DmCard ctx={ctx} dark />} /></Phone> },
      { id: 'story', label: 'story link', devices: ['mobile'], note: 'Link stickers show only the domain — no image, no title.', render: (ctx) => <Phone bg="#111827" dark><StorySticker ctx={ctx} /></Phone> },
    ],
  },
  {
    id: 'tiktok',
    label: 'tiktok',
    surfaces: [
      { id: 'profile', label: 'profile', devices: both, note: 'No cover slot. Avatar ← site icon, bio ← description, link is plain text. Approximate layout (no reference screenshot).', render: (ctx, d) => (d === 'desktop' ? <TikTokProfile ctx={ctx} /> : <Phone bg="#000" dark><TikTokProfile ctx={ctx} mobile /></Phone>) },
      { id: 'dm', label: 'dm', devices: ['mobile'], note: 'Messages unfurl shared links with image, title and domain.', render: (ctx) => <Phone bg="#000" dark><DmThread ctx={ctx} me="#fe2c55" them="#2f2f2f" bubble="#2f2f2f" dark card={<DmCard ctx={ctx} dark />} /></Phone> },
    ],
  },
  {
    id: 'slack',
    label: 'slack',
    surfaces: [{ id: 'unfurl', label: 'unfurl', devices: ['desktop'], note: 'Unfurl uses og:site_name, title, description and a capped-width image.', render: (ctx) => <div className="mx-auto max-w-[640px] overflow-hidden rounded-md border border-line"><SlackUnfurl ctx={ctx} /></div> }],
  },
];

// ── crop guides ───────────────────────────────────────────────────────────────

const CROPS: Array<[string, number, string]> = [
  ['1.91:1', 1.91, '#1a56f0'],
  ['1:1', 1, '#0a7d52'],
  ['4:5', 0.8, '#d4183c'],
];

export function CropGuides({ report }: { report: InspectReport }) {
  const c = report.openGraph.imageCheck;
  const src = c?.ok ? assetUrl(c.resolved) : undefined;
  if (!src) return <p className="text-muted">No loadable og:image to show crops for.</p>;
  const ratio = c?.width && c.height ? c.width / c.height : 1.91;
  return (
    <div className="space-y-2">
      <div className="relative mx-auto w-full overflow-hidden rounded border border-line" style={{ aspectRatio: ratio, maxWidth: 320 * ratio }}>
        <img src={src} alt="" className="absolute inset-0 size-full" />
        {CROPS.map(([label, r, color]) => {
          const box = r < ratio ? { width: `${(r / ratio) * 100}%`, height: '100%' } : { width: '100%', height: `${(ratio / r) * 100}%` };
          return (
            <div key={label} className="absolute top-1/2 left-1/2 -translate-1/2 border-2 border-dashed" style={{ ...box, borderColor: color }}>
              <span className="absolute top-0 left-0 px-1 text-[10px] font-bold text-white" style={{ background: color }}>{label}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-muted">Centre crops: 1.91:1 link cards · 1:1 summary / thumbnails · 4:5 portrait feeds. Keep key content inside the smallest box.</p>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export function SocialPreviews({ report }: { report: InspectReport }) {
  // Initial view can be deep-linked: ?network=linkedin&surface=feed&device=mobile
  const [params] = useState(() => new URLSearchParams(location.search));
  const [platformId, setPlatformId] = useState(params.get('network') ?? PLATFORMS[0].id);
  const [surfaceId, setSurfaceId] = useState<Record<string, string>>(() => (params.get('surface') ? { [platformId]: params.get('surface')! } : {}));
  const [device, setDevice] = useState<Device>(params.get('device') === 'mobile' ? 'mobile' : 'desktop');
  const [labels, setLabels] = useState(params.get('labels') !== '0');
  const ctx = buildCtx(report);
  const issues = useMemo(() => report.issues.filter((i) => SOCIAL.includes(i.category) && i.severity !== 'info'), [report]);
  const platform = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];
  const surface = platform.surfaces.find((s) => s.id === surfaceId[platform.id]) ?? platform.surfaces[0];
  const effective = surface.devices.includes(device) ? device : surface.devices[0];

  // Direction of travel through the flattened preview list → which side the next preview slides in from.
  const order = `${PLATFORMS.findIndex((p) => p.id === platform.id)}.${platform.surfaces.indexOf(surface)}`;
  const prevOrder = useRef(order);
  const prevDevice = useRef(effective);
  const dirRef = useRef(0);
  if (prevOrder.current !== order) {
    const [a1, a2] = prevOrder.current.split('.').map(Number);
    const [b1, b2] = order.split('.').map(Number);
    dirRef.current = b1 !== a1 ? Math.sign(b1 - a1) : Math.sign(b2 - a2);
  } else if (prevDevice.current !== effective) {
    dirRef.current = 0; // device switch: crossfade in place
  }
  prevOrder.current = order;
  prevDevice.current = effective;
  const dir = dirRef.current;

  return (
    <Panel
      title={<span className="inline-flex items-center gap-2">previews {!ctx.ogImage && <Pill tone="error">no og:image</Pill>}</span>}
      actions={
        <div className="flex items-center gap-2">
        <button onClick={() => setLabels((v) => !v)} aria-pressed={labels} className={cx('btn btn-secondary btn-sm', !labels && 'text-muted')}>
          <Tag className="size-3.5" /> hints
        </button>
        <Segmented
          row={3}
          value={effective}
          onChange={setDevice}
          options={[
            { id: 'desktop', label: <Monitor className="size-3.5" />, title: 'Desktop' },
            { id: 'mobile', label: <Smartphone className="size-3.5" />, title: 'Mobile' },
          ]}
        />
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented row={1} value={platform.id} onChange={setPlatformId} options={PLATFORMS.map((p) => ({ id: p.id, label: <><NetworkIcon id={p.id} /> {p.label}</> }))} />
        {platform.surfaces.length > 1 && (
          <Segmented row={2} value={surface.id} onChange={(id) => setSurfaceId((s) => ({ ...s, [platform.id]: id }))} options={platform.surfaces.map((s) => ({ id: s.id, label: s.label }))} />
        )}
      </div>
      <AnnotatedStage key={`${platform.id}/${surface.id}/${effective}`} issues={issues} hints={labels}>
        <div className="font-platform bg-grid preview-in rounded-md border border-line bg-subtle p-5" style={{ '--dx': `${dir * 16}px` } as React.CSSProperties}>
          {surface.render(ctx, effective)}
        </div>
      </AnnotatedStage>
    </Panel>
  );
}
