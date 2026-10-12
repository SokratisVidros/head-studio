import { Monitor, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { analyzeSerp } from '../../core/validators/serp';
import type { InspectReport, SerpDeviceResult } from '../../core/types';
import { assetUrl, displayHost } from '../api';
import { FixPanel } from './FixPanel';
import { cx, inputClass, IssueList, KeyValue, Meter, Panel, Pill, Segmented } from './ui';

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
    <div className={cx('font-arial bg-white text-left', device === 'mobile' ? 'w-[360px] max-w-full rounded-2xl p-4 shadow-[0_1px_6px_rgba(32,33,36,0.18)]' : 'w-[652px] max-w-full')}>
      <div className="flex items-center gap-3">
        <div className="grid size-[28px] shrink-0 place-items-center overflow-hidden rounded-full border border-[#dadce0] bg-[#f1f3f4]">
          {favicon ? <img src={favicon} alt="" className="size-[18px]" /> : <span className="size-[18px] rounded-full bg-[#dadce0]" />}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[14px] text-[#202124]">{siteName}</div>
          <div className="truncate text-[12px] text-[#4d5156]">
            {crumb.origin}
            {crumb.parts.map((p) => ` › ${p}`)}
          </div>
        </div>
      </div>
      <h3 className={cx('mt-1.5 text-[20px] leading-[26px] text-[#1a0dab] hover:underline', device === 'mobile' ? 'line-clamp-2' : 'truncate')} style={device === 'desktop' ? { maxWidth: 600 } : undefined}>
        {result.title.display || <span className="text-[#70757a] italic">Untitled</span>}
      </h3>
      <p className={cx('mt-1 text-[14px] leading-[22px] text-[#4d5156]', device === 'mobile' ? 'line-clamp-3' : 'line-clamp-2')}>
        {result.description.display || <span className="text-[#70757a] italic">No meta description — Google will pick text from the page.</span>}
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
    <div className="space-y-5">
      <Panel
        title="google.preview"
        actions={
          <Segmented
            value={device}
            onChange={setDevice}
            options={[
              { id: 'desktop', label: <><Monitor className="size-3.5" /> desktop</> },
              { id: 'mobile', label: <><Smartphone className="size-3.5" /> mobile</> },
            ]}
          />
        }
      >
        <div className={cx('bg-grid overflow-x-auto rounded-md border border-line', device === 'mobile' ? 'bg-[#f1f3f4] p-6' : 'bg-white p-6')}>
          <GoogleResult result={result} url={report.meta.canonical ?? report.url} siteName={siteName} favicon={assetUrl(favicon)} device={device} />
        </div>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <Meter label={`title · ${result.title.chars} chars`} value={result.title.pixels} limit={result.title.limit} />
          <Meter label={`description · ${result.description.chars} chars`} value={result.description.pixels} limit={result.description.limit} />
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={<span className="inline-flex items-center gap-2">snippet.editor {dirty && <Pill tone="accent">modified</Pill>}</span>}>
          <label className="block text-[12px] text-muted" htmlFor="serp-title">
            title
          </label>
          <input
            id="serp-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={cx(inputClass, 'font-arial mt-1 text-sm')}
          />
          <label className="mt-3 block text-[12px] text-muted" htmlFor="serp-desc">
            description
          </label>
          <textarea
            id="serp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={cx(inputClass, 'font-arial mt-1 resize-y text-sm')}
          />
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            {(['desktop', 'mobile'] as const).map((d) => (
              <div key={d} className="rounded-md bg-subtle p-2.5 ring-1 ring-line ring-inset">
                <div className="mb-1.5 text-muted">{d}</div>
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
              className="mt-3 text-[12px] text-accent hover:underline"
            >
              ↺ reset to page values
            </button>
          )}
        </Panel>
        <Panel title="meta.tags">
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

      {Object.keys(updates).length > 0 && <FixPanel updates={updates} route={report.url} onApplied={onApplied} />}

      <Panel title="issues">
        <IssueList issues={issues} />
      </Panel>
    </div>
  );
}
