import { Monitor, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { analyzeSerp } from '../../core/validators/serp';
import type { InspectReport, SerpDeviceResult } from '../../core/types';
import { assetUrl, displayHost } from '../api';
import { FixPanel } from './FixPanel';
import { cx, IssueList, KeyValue, Meter, Panel, Pill } from './ui';

function breadcrumb(url: string) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    return { host: u.protocol === 'file:' ? 'localhost' : u.host, origin: u.protocol === 'file:' ? 'file://' : u.origin, parts: u.protocol === 'file:' ? parts.slice(-1) : parts };
  } catch {
    return { host: url, origin: url, parts: [] };
  }
}

function GoogleResult({ result, url, siteName, favicon, device }: { result: SerpDeviceResult; url: string; siteName: string; favicon?: string; device: 'desktop' | 'mobile' }) {
  const crumb = breadcrumb(url);
  return (
    <div className={cx('font-arial rounded-xl bg-[#1f1f1f] p-4 text-left', device === 'mobile' ? 'w-[360px] max-w-full' : 'w-[652px] max-w-full')}>
      <div className="flex items-center gap-3">
        <div className="grid size-[28px] shrink-0 place-items-center overflow-hidden rounded-full border border-[#3c4043] bg-[#303134]">
          {favicon ? <img src={favicon} alt="" className="size-[18px]" /> : <span className="size-[18px] rounded-full bg-[#5f6368]" />}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[14px] text-[#dadce0]">{siteName}</div>
          <div className="truncate text-[12px] text-[#bdc1c6]">
            {crumb.origin}
            {crumb.parts.map((p) => ` › ${p}`)}
          </div>
        </div>
      </div>
      <h3 className={cx('mt-2 text-[#99c3ff] hover:underline', device === 'mobile' ? 'line-clamp-2 text-[20px] leading-[26px]' : 'truncate text-[20px] leading-[26px]')} style={device === 'desktop' ? { maxWidth: 600 } : undefined}>
        {result.title.display || <span className="text-[#9aa0a6] italic">Untitled</span>}
      </h3>
      <p className={cx('mt-1 text-[14px] leading-[22px] text-[#bdc1c6]', device === 'mobile' ? 'line-clamp-3' : 'line-clamp-2')}>
        {result.description.display || <span className="italic text-[#9aa0a6]">No meta description — Google will pick text from the page.</span>}
      </p>
    </div>
  );
}

export function SerpView({ report, onApplied }: { report: InspectReport; onApplied: () => void }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [title, setTitle] = useState(report.meta.title ?? '');
  const [description, setDescription] = useState(report.meta.description ?? '');
  useEffect(() => {
    setTitle(report.meta.title ?? '');
    setDescription(report.meta.description ?? '');
  }, [report]);

  const live = useMemo(() => analyzeSerp(title, description), [title, description]);
  const result = live[device];
  const dirty = title !== (report.meta.title ?? '') || description !== (report.meta.description ?? '');
  const favicon = report.favicons.grid.find((g) => g.status === 'pass' && g.check?.resolved)?.check?.resolved;
  const siteName = report.openGraph.siteName ?? displayHost(report.meta.canonical ?? report.url);
  const issues = report.issues.filter((i) => i.category === 'meta' || i.category === 'serp');

  const updates: Record<string, unknown> = {};
  if (title !== (report.meta.title ?? '')) updates.title = title;
  if (description !== (report.meta.description ?? '')) updates.description = description;

  return (
    <div className="space-y-4">
      <Panel
        title="Google preview"
        actions={
          <div className="flex rounded-md border border-line bg-surface p-0.5">
            {(
              [
                ['desktop', Monitor],
                ['mobile', Smartphone],
              ] as const
            ).map(([d, Icon]) => (
              <button key={d} onClick={() => setDevice(d)} className={cx('inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs capitalize', device === d ? 'bg-raised text-zinc-100' : 'text-muted hover:text-zinc-200')}>
                <Icon className="size-3.5" /> {d}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto rounded-lg bg-[#101010] p-4">
          <GoogleResult result={result} url={report.meta.canonical ?? report.url} siteName={siteName} favicon={assetUrl(favicon)} device={device} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Meter label={`Title · ${result.title.chars} chars`} value={result.title.pixels} limit={result.title.limit} />
          <Meter label={`Description · ${result.description.chars} chars`} value={result.description.pixels} limit={result.description.limit} />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={<span className="inline-flex items-center gap-2">Snippet editor {dirty && <Pill tone="warning">edited</Pill>}</span>}>
          <label className="block text-xs text-muted" htmlFor="serp-title">
            Title
          </label>
          <input
            id="serp-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-arial mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <label className="mt-3 block text-xs text-muted" htmlFor="serp-desc">
            Meta description
          </label>
          <textarea
            id="serp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="font-arial mt-1 w-full resize-y rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {(['desktop', 'mobile'] as const).map((d) => (
              <div key={d} className="rounded-md bg-surface p-2.5">
                <div className="mb-1 capitalize text-muted">{d}</div>
                <div className="flex flex-wrap gap-1">
                  <Pill tone={live[d].title.truncated ? 'warning' : 'ok'}>title {Math.round(live[d].title.pixels)}px</Pill>
                  <Pill tone={live[d].description.truncated ? 'warning' : 'ok'}>desc {Math.round(live[d].description.pixels)}px</Pill>
                </div>
              </div>
            ))}
          </div>
          {dirty && (
            <button
              onClick={() => {
                setTitle(report.meta.title ?? '');
                setDescription(report.meta.description ?? '');
              }}
              className="mt-3 text-xs text-muted hover:text-zinc-200"
            >
              Reset to page values
            </button>
          )}
        </Panel>
        <Panel title="Meta tags">
          <KeyValue
            rows={[
              ['title', report.meta.title],
              ['description', report.meta.description],
              ['canonical', report.meta.canonical],
              ['robots', report.meta.robots ?? <span className="text-muted">index, follow (default)</span>],
              ['viewport', report.meta.viewport],
              ['charset', report.meta.charset],
              ['lang', report.meta.lang],
              ['theme-color', report.meta.themeColor ?? <span className="text-muted">—</span>],
            ]}
          />
        </Panel>
      </div>

      {Object.keys(updates).length > 0 && <FixPanel updates={updates} onApplied={onApplied} />}

      <Panel title="Meta & SERP issues">
        <IssueList issues={issues} />
      </Panel>
    </div>
  );
}
