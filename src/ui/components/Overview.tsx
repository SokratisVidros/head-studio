import { ArrowUpRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { InspectReport, IssueCategory, Severity } from '../../core/types';
import { IssueList, Panel, Pill, Segmented } from './ui';

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  meta: 'meta',
  serp: 'serp',
  opengraph: 'open_graph',
  twitter: 'x_twitter',
  favicons: 'favicons',
  jsonld: 'json_ld',
};

export function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = score >= 90 ? 'var(--color-ok)' : score >= 60 ? 'var(--color-warn)' : 'var(--color-err)';
  return (
    <svg viewBox="0 0 80 80" className="size-[88px] shrink-0" role="img" aria-label={`Score ${score} out of 100`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-line)" strokeWidth="5" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${Math.max(0.01, (score / 100) * c)} ${c}`} transform="rotate(-90 40 40)" />
      <text x="40" y="44" textAnchor="middle" fill="var(--color-ink)" className="text-[17px] font-semibold tabular-nums">
        {score}
      </text>
      <text x="40" y="56" textAnchor="middle" fill="var(--color-faint)" className="text-[7px]">
        /100
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
  const { errors, warnings, infos } = report.summary;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel>
          <div className="flex items-center gap-5">
            <ScoreRing score={report.summary.score} />
            <div className="min-w-0 space-y-2.5">
              <p className="truncate text-[12px] text-muted" title={report.url}>
                {report.url}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Pill tone="error">{errors} err</Pill>
                <Pill tone="warning">{warnings} warn</Pill>
                <Pill tone="info">{infos} info</Pill>
              </div>
              <p className="text-[12px] text-faint">
                {report.source === 'http' ? `HTTP ${report.status}` : 'static file'} · {report.timingMs}ms · {new Date(report.fetchedAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </Panel>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card sm:grid-cols-3">
          {[...byCategory].map(([cat, counts]) => (
            <button key={cat} onClick={() => onNavigate(tabFor[cat])} className="group bg-panel px-4 py-3 text-left transition hover:bg-subtle">
              <div className="flex items-center justify-between text-[12px] text-muted group-hover:text-accent">
                {CATEGORY_LABEL[cat]}
                <ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {counts.error + counts.warning === 0 ? (
                  <Pill tone="ok">ok</Pill>
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
        title={`issues (${filtered.length})`}
        actions={
          <Segmented
            value={severity}
            onChange={setSeverity}
            options={[
              { id: 'all', label: 'all' },
              { id: 'error', label: 'err' },
              { id: 'warning', label: 'warn' },
              { id: 'info', label: 'info' },
            ]}
          />
        }
      >
        <IssueList issues={filtered} empty="Nothing to fix here." />
      </Panel>
    </div>
  );
}
