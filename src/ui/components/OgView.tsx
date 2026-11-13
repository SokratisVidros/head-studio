import type { InspectReport } from '../../core/types';
import { CropGuides, SocialPreviews } from './SocialPreviews';
import { IssueList, KeyValue, Panel, Pill } from './ui';

export function OgView({ report }: { report: InspectReport }) {
  const og = report.openGraph;
  const tw = report.twitter;
  const check = og.imageCheck;
  const issues = report.issues.filter((i) => i.category === 'opengraph' || i.category === 'twitter');
  const tags = [...og.raw.map((r) => [r.property, r.content]), ...tw.raw.map((r) => [r.name, r.content])];

  return (
    <div className="space-y-5">
      <SocialPreviews report={report} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="og:image">
          <div className="mb-4"><CropGuides report={report} /></div>
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
