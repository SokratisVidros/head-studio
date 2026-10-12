import { useMemo, useState } from 'react';
import type { InspectReport, IssueCategory, Severity } from '../../core/types';
import { cx, IssueList, Panel, Pill } from './ui';

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  meta: 'Meta',
  serp: 'SERP',
  opengraph: 'Open Graph',
  twitter: 'X / Twitter',
  favicons: 'Favicons',
  jsonld: 'JSON-LD',
};

export function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = score >= 90 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171';
  return (
    <svg viewBox="0 0 80 80" className="size-24 shrink-0" role="img" aria-label={`Score ${score} out of 100`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="#262b35" strokeWidth="7" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 40 40)" />
      <text x="40" y="45" textAnchor="middle" className="fill-zinc-100 text-[18px] font-semibold tabular-nums">
        {score}
      </text>
    </svg>
  );
}

export function Overview({ report, onNavigate }: { report: InspectReport; onNavigate: (tab: string) => void }) {
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const byCategory = useMemo(() => {
    const m = new Map<IssueCategory, { error: number; warning: number; info: number }>();
    for (const cat of Object.keys(CATEGORY_LABEL) as IssueCategory[]) m.set(cat, { error: 0, warning: 0, info: 0 });
    for (const i of report.issues) m.get(i.category)![i.severity]++;
    return m;
  }, [report]);
  const filtered = severity === 'all' ? report.issues : report.issues.filter((i) => i.severity === severity);
  const tabFor: Record<IssueCategory, string> = { meta: 'serp', serp: 'serp', opengraph: 'og', twitter: 'og', favicons: 'favicons', jsonld: 'jsonld' };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel>
          <div className="flex items-center gap-5">
            <ScoreRing score={report.summary.score} />
            <div className="min-w-0 space-y-2">
              <p className="truncate text-sm text-zinc-200" title={report.url}>
                {report.url}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Pill tone="error">{report.summary.errors} errors</Pill>
                <Pill tone="warning">{report.summary.warnings} warnings</Pill>
                <Pill tone="info">{report.summary.infos} notices</Pill>
              </div>
              <p className="text-xs text-muted">
                {report.source === 'http' ? `HTTP ${report.status}` : 'Static file'} · {report.timingMs}ms · {new Date(report.fetchedAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </Panel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[...byCategory].map(([cat, counts]) => (
            <button
              key={cat}
              onClick={() => onNavigate(tabFor[cat])}
              className="rounded-lg border border-line bg-panel px-3 py-2.5 text-left transition hover:border-zinc-600"
            >
              <div className="text-xs text-muted">{CATEGORY_LABEL[cat]}</div>
              <div className="mt-1.5 flex items-center gap-1.5">
                {counts.error + counts.warning === 0 ? (
                  <Pill tone="ok">OK</Pill>
                ) : (
                  <>
                    {counts.error > 0 && <Pill tone="error">{counts.error}</Pill>}
                    {counts.warning > 0 && <Pill tone="warning">{counts.warning}</Pill>}
                  </>
                )}
                {counts.info > 0 && <Pill tone="info">{counts.info}</Pill>}
              </div>
            </button>
          ))}
        </div>
      </div>

      <Panel
        title="Issues"
        actions={
          <div className="flex gap-1 text-xs">
            {(['all', 'error', 'warning', 'info'] as const).map((s) => (
              <button key={s} onClick={() => setSeverity(s)} className={cx('rounded px-2 py-1 capitalize', severity === s ? 'bg-raised text-zinc-100' : 'text-muted hover:text-zinc-200')}>
                {s}
              </button>
            ))}
          </div>
        }
      >
        <IssueList issues={filtered} empty="Nothing to fix here." />
      </Panel>
    </div>
  );
}
