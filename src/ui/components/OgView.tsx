import { ImageOff } from 'lucide-react';
import type { InspectReport } from '../../core/types';
import { assetUrl, displayHost } from '../api';
import { IssueList, KeyValue, Panel, Pill } from './ui';

function CardImage({ src, ratio, className = '' }: { src?: string; ratio: string; className?: string }) {
  return (
    <div className={`relative w-full overflow-hidden bg-[#eef1f5] ${className}`} style={{ aspectRatio: ratio }}>
      {src ? (
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center gap-1 text-faint">
          <ImageOff className="size-6" />
        </div>
      )}
    </div>
  );
}

const Stage = ({ children }: { children: React.ReactNode }) => <div className="bg-grid rounded-md border border-line bg-subtle p-5">{children}</div>;

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
  const tags = [...og.raw.map((r) => [r.property, r.content]), ...tw.raw.map((r) => [r.name, r.content])];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="facebook">
          <Stage>
            <div className="font-platform mx-auto max-w-[500px] overflow-hidden rounded-md border border-[#dddfe2] bg-white">
              <CardImage src={ogImage} ratio="1.91 / 1" />
              <div className="border-t border-[#dddfe2] bg-[#f0f2f5] px-3 py-2.5">
                <div className="truncate text-[12px] tracking-wide text-[#65676b] uppercase">{host}</div>
                <div className="mt-0.5 line-clamp-2 text-[16px] leading-5 font-semibold text-[#050505]">{title}</div>
                {description && <div className="mt-0.5 line-clamp-1 text-[14px] text-[#65676b]">{description}</div>}
              </div>
            </div>
          </Stage>
        </Panel>

        <Panel title={<span className="inline-flex items-center gap-2">x / twitter <Pill>{tw.card ?? 'summary (default)'}</Pill></span>}>
          <Stage>
            {largeCard ? (
              <div className="font-platform mx-auto max-w-[500px]">
                <div className="relative overflow-hidden rounded-2xl border border-[#cfd9de]">
                  <CardImage src={twImage} ratio="1.91 / 1" />
                  <span className="absolute bottom-3 left-3 max-w-[80%] truncate rounded bg-black/70 px-1.5 py-0.5 text-[13px] text-white">{twTitle}</span>
                </div>
                <div className="mt-1 text-[13px] text-[#536471]">From {host}</div>
              </div>
            ) : (
              <div className="font-platform mx-auto flex max-w-[500px] overflow-hidden rounded-2xl border border-[#cfd9de] bg-white">
                <div className="w-[130px] shrink-0 border-r border-[#cfd9de]">
                  <CardImage src={twImage} ratio="1 / 1" />
                </div>
                <div className="min-w-0 self-center px-3 py-2 text-[15px]">
                  <div className="truncate text-[#536471]">{host}</div>
                  <div className="truncate text-[#0f1419]">{twTitle}</div>
                  <div className="line-clamp-2 text-[#536471]">{twDesc}</div>
                </div>
              </div>
            )}
          </Stage>
        </Panel>

        <Panel title="linkedin">
          <Stage>
            <div className="font-platform mx-auto max-w-[500px] overflow-hidden rounded-lg border border-[#e0dfdc] bg-white">
              <CardImage src={ogImage} ratio="1.91 / 1" />
              <div className="bg-[#eef3f8] px-3 py-2.5">
                <div className="line-clamp-2 text-[14px] font-semibold text-[#000000e6]">{title}</div>
                <div className="mt-0.5 text-[12px] text-[#00000099]">{host}</div>
              </div>
            </div>
          </Stage>
        </Panel>

        <Panel title="slack">
          <Stage>
            <div className="font-platform mx-auto max-w-[500px] rounded-r border-l-4 border-[#dddddd] bg-white py-2 pr-3 pl-3">
              <div className="text-[13px] font-bold text-[#1d1c1d]">{og.siteName ?? host}</div>
              <div className="mt-0.5 text-[15px] font-bold text-[#1264a3]">{title}</div>
              {description && <div className="mt-1 line-clamp-3 text-[14px] text-[#1d1c1d]">{description}</div>}
              <div className="mt-2 max-w-[360px] overflow-hidden rounded-lg border border-[#e8e8e8]">
                <CardImage src={ogImage} ratio="1.91 / 1" />
              </div>
            </div>
          </Stage>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="og:image">
          {check ? (
            <KeyValue
              rows={[
                ['url', <span className="break-all">{check.url}</span>],
                ['resolved', <span className="break-all text-muted">{check.resolved}</span>],
                ['status', check.ok ? <Pill tone="ok">200 loaded</Pill> : <Pill tone="error">{check.error}</Pill>],
                ['dimensions', check.width ? <span className="tabular-nums">{check.width}×{check.height} <span className="text-muted">· {(check.width / (check.height ?? 1)).toFixed(2)}:1 (target 1.91:1)</span></span> : null],
                ['size', check.bytes != null ? `${(check.bytes / 1024).toFixed(1)} KB` : null],
                ['type', check.contentType],
              ]}
            />
          ) : (
            <p className="text-err">✕ no og:image declared</p>
          )}
        </Panel>
        <Panel title={`tags (${tags.length})`} flush>
          <div className="max-h-72 overflow-auto">
            {tags.length ? (
              <table className="w-full text-left text-[12px]">
                <tbody className="divide-y divide-line">
                  {tags.map(([k, v], i) => (
                    <tr key={`${k}-${i}`} className="hover:bg-subtle">
                      <td className="py-2 pr-4 pl-4 whitespace-nowrap text-accent">{k}</td>
                      <td className="py-2 pr-4 break-all text-ink">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-4 text-muted">No og:* or twitter:* tags found.</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="issues">
        <IssueList issues={issues} />
      </Panel>
    </div>
  );
}
