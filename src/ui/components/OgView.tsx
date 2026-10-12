import { ImageOff } from 'lucide-react';
import type { InspectReport } from '../../core/types';
import { assetUrl, displayHost } from '../api';
import { IssueList, KeyValue, Panel, Pill } from './ui';

function CardImage({ src, ratio, className = '' }: { src?: string; ratio: string; className?: string }) {
  return (
    <div className={`relative w-full overflow-hidden bg-[#2a2d33] ${className}`} style={{ aspectRatio: ratio }}>
      {src ? (
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-zinc-500">
          <ImageOff className="size-8" />
        </div>
      )}
    </div>
  );
}

export function OgView({ report }: { report: InspectReport }) {
  const og = report.openGraph;
  const tw = report.twitter;
  const title = og.title ?? report.meta.title ?? 'Untitled';
  const description = og.description ?? report.meta.description ?? '';
  const host = displayHost(og.url ?? report.meta.canonical ?? report.url);
  const ogImage = og.imageCheck?.ok ? assetUrl(og.imageCheck.resolved) : undefined;
  const twImage = tw.imageCheck?.ok ? assetUrl(tw.imageCheck.resolved) : ogImage;
  const twTitle = tw.title ?? title;
  const twDesc = tw.description ?? description;
  const largeCard = (tw.card ?? 'summary') === 'summary_large_image';
  const check = og.imageCheck;
  const issues = report.issues.filter((i) => i.category === 'opengraph' || i.category === 'twitter');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Facebook">
          <div className="mx-auto max-w-[500px] overflow-hidden rounded-md border border-[#3e4042] bg-[#242526] font-[Helvetica,Arial,sans-serif]">
            <CardImage src={ogImage} ratio="1.91 / 1" />
            <div className="border-t border-[#3e4042] bg-[#3a3b3c] px-3 py-2.5">
              <div className="truncate text-[12px] tracking-wide text-[#b0b3b8] uppercase">{host}</div>
              <div className="mt-0.5 line-clamp-2 text-[16px] leading-5 font-semibold text-[#e4e6eb]">{title}</div>
              {description && <div className="mt-0.5 line-clamp-1 text-[14px] text-[#b0b3b8]">{description}</div>}
            </div>
          </div>
        </Panel>

        <Panel title={<span className="inline-flex items-center gap-2">X / Twitter <Pill>{tw.card ?? 'summary (default)'}</Pill></span>}>
          {largeCard ? (
            <div className="mx-auto max-w-[500px]">
              <div className="relative overflow-hidden rounded-2xl border border-[#2f3336]">
                <CardImage src={twImage} ratio="1.91 / 1" />
                <span className="absolute bottom-3 left-3 max-w-[80%] truncate rounded bg-black/70 px-1.5 py-0.5 text-[13px] text-white">{twTitle}</span>
              </div>
              <div className="mt-1 text-[13px] text-[#71767b]">From {host}</div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-[500px] overflow-hidden rounded-2xl border border-[#2f3336] bg-black">
              <div className="w-[130px] shrink-0 border-r border-[#2f3336]">
                <CardImage src={twImage} ratio="1 / 1" />
              </div>
              <div className="min-w-0 self-center px-3 py-2 text-[15px]">
                <div className="truncate text-[#71767b]">{host}</div>
                <div className="truncate text-[#e7e9ea]">{twTitle}</div>
                <div className="line-clamp-2 text-[#71767b]">{twDesc}</div>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="LinkedIn">
          <div className="mx-auto max-w-[500px] overflow-hidden rounded-lg bg-[#1b1f23]">
            <CardImage src={ogImage} ratio="1.91 / 1" />
            <div className="px-3 py-2.5">
              <div className="line-clamp-2 text-[14px] font-semibold text-[#e9e9e9]">{title}</div>
              <div className="mt-0.5 text-[12px] text-[#a8a8a8]">{host}</div>
            </div>
          </div>
        </Panel>

        <Panel title="Slack / Discord">
          <div className="mx-auto max-w-[500px] border-l-4 border-[#4f545c] bg-[#2b2d31] py-2 pr-3 pl-3 rounded-r">
            <div className="text-[13px] text-[#b5bac1]">{og.siteName ?? host}</div>
            <div className="mt-0.5 text-[15px] font-semibold text-[#00a8fc]">{title}</div>
            {description && <div className="mt-1 line-clamp-3 text-[14px] text-[#dbdee1]">{description}</div>}
            <div className="mt-2 max-w-[400px] overflow-hidden rounded">
              <CardImage src={ogImage} ratio="1.91 / 1" />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="og:image">
          {check ? (
            <KeyValue
              rows={[
                ['url', <span className="font-mono text-xs">{check.url}</span>],
                ['resolved', <span className="font-mono text-xs text-muted">{check.resolved}</span>],
                ['status', check.ok ? <Pill tone="ok">loaded</Pill> : <Pill tone="error">{check.error}</Pill>],
                ['dimensions', check.width ? <span className="tabular-nums">{check.width} × {check.height} <span className="text-muted">({(check.width / (check.height ?? 1)).toFixed(2)}:1 — target 1.91:1)</span></span> : null],
                ['size', check.bytes != null ? `${(check.bytes / 1024).toFixed(1)} KB` : null],
                ['type', check.contentType],
              ]}
            />
          ) : (
            <p className="text-sm text-red-400">No og:image declared.</p>
          )}
        </Panel>
        <Panel title="Social tags">
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-xs">
              <tbody className="divide-y divide-line">
                {[...og.raw.map((r) => [r.property, r.content]), ...tw.raw.map((r) => [r.name, r.content])].map(([k, v], i) => (
                  <tr key={`${k}-${i}`}>
                    <td className="py-1.5 pr-4 font-mono whitespace-nowrap text-muted">{k}</td>
                    <td className="py-1.5 break-all text-zinc-200">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!og.raw.length && !tw.raw.length && <p className="text-sm text-muted">No og:* or twitter:* tags found.</p>}
          </div>
        </Panel>
      </div>

      <Panel title="Social card issues">
        <IssueList issues={issues} />
      </Panel>
    </div>
  );
}
