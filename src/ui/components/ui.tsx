import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Issue, Severity } from '../../core/types';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-lg border border-line bg-panel', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="text-[13px] font-medium text-zinc-200">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const SEVERITY_STYLE: Record<Severity, string> = {
  error: 'text-red-400 bg-red-500/10 border-red-500/20',
  warning: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  info: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
};

export function SeverityIcon({ severity, className = 'size-4' }: { severity: Severity; className?: string }) {
  if (severity === 'error') return <XCircle className={cx(className, 'text-red-400')} />;
  if (severity === 'warning') return <AlertTriangle className={cx(className, 'text-amber-300')} />;
  return <Info className={cx(className, 'text-sky-300')} />;
}

export function StatusBadge({ status }: { status: 'pass' | 'warn' | 'fail' }) {
  const map = {
    pass: ['Pass', 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'],
    warn: ['Warn', 'text-amber-300 bg-amber-500/10 border-amber-500/20'],
    fail: ['Fail', 'text-red-400 bg-red-500/10 border-red-500/20'],
  } as const;
  const [label, cls] = map[status];
  return <span className={cx('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium', cls)}>{label}</span>;
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | Severity | 'ok' }) {
  const cls =
    tone === 'neutral' ? 'text-zinc-300 bg-raised border-line' : tone === 'ok' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : SEVERITY_STYLE[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium tabular-nums', cls)}>{children}</span>;
}

export function IssueList({ issues, empty = 'No issues.' }: { issues: Issue[]; empty?: string }) {
  if (!issues.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-300">
        <CheckCircle2 className="size-4" /> {empty}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {issues.map((i, n) => (
        <li key={`${i.code}-${n}`} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
          <SeverityIcon severity={i.severity} className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200">{i.message}</p>
            {i.hint && <p className="mt-0.5 text-xs text-muted">{i.hint}</p>}
          </div>
          <code className="hidden shrink-0 self-start rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted md:block">{i.code}</code>
        </li>
      ))}
    </ul>
  );
}

export function KeyValue({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,max-content)_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono text-xs leading-5 text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-zinc-200">{v ?? <span className="text-red-400/80">missing</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Meter({ value, limit, label }: { value: number; limit: number; label: string }) {
  const pct = Math.min(100, (value / limit) * 100);
  const over = value > limit;
  const near = !over && value > limit * 0.9;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={cx('tabular-nums', over ? 'text-amber-300' : 'text-zinc-300')}>
          {Math.round(value)} / {limit}px
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className={cx('h-full rounded-full transition-all', over ? 'bg-amber-400' : near ? 'bg-lime-400' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
