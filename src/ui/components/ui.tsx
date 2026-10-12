import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Issue, Severity } from '../../core/types';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function Panel({ title, actions, children, className, flush }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cx('rounded-lg border border-line bg-panel shadow-card', className)}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2">
          <h2 className="text-[12px] font-medium text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

const TONE: Record<Severity | 'ok' | 'neutral' | 'accent', string> = {
  error: 'text-err bg-err-soft',
  warning: 'text-warn bg-warn-soft',
  info: 'text-note bg-note-soft',
  ok: 'text-ok bg-ok-soft',
  neutral: 'text-body bg-subtle ring-1 ring-inset ring-line',
  accent: 'text-accent bg-accent-soft',
};

export const SEVERITY_LABEL: Record<Severity, string> = { error: 'ERR', warning: 'WARN', info: 'INFO' };

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: keyof typeof TONE; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium whitespace-nowrap tabular-nums', TONE[tone], className)}>{children}</span>;
}

export function SeverityTag({ severity }: { severity: Severity }) {
  return <Pill tone={severity} className="w-12 justify-center">{SEVERITY_LABEL[severity]}</Pill>;
}

export function StatusBadge({ status }: { status: 'pass' | 'warn' | 'fail' }) {
  const map = { pass: ['PASS', 'ok'], warn: ['WARN', 'warning'], fail: ['FAIL', 'error'] } as const;
  const [label, tone] = map[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function IssueList({ issues, empty = 'No issues.', showCode = true }: { issues: Issue[]; empty?: string; showCode?: boolean }) {
  if (!issues.length) {
    return (
      <div className="flex items-center gap-2 text-ok">
        <CheckCircle2 className="size-4" /> {empty}
      </div>
    );
  }
  return (
    <ul className="-my-2 divide-y divide-line">
      {issues.map((i, n) => (
        <li key={`${i.code}-${n}`} className="flex gap-3 py-2.5">
          <div className="pt-px">
            <SeverityTag severity={i.severity} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="leading-5 text-ink">{i.message}</p>
            {i.hint && <p className="mt-0.5 text-[12px] leading-5 text-muted">{i.hint}</p>}
          </div>
          {showCode && <code className="hidden shrink-0 self-start pt-0.5 text-[11px] text-faint lg:block">{i.code}</code>}
        </li>
      ))}
    </ul>
  );
}

export function KeyValue({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(100px,max-content)_1fr] gap-x-6 gap-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[12px] leading-5 text-muted">{k}</dt>
          <dd className="min-w-0 leading-5 break-words text-ink">{v ?? <span className="text-err">— missing</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Meter({ value, limit, label }: { value: number; limit: number; label: string }) {
  const pct = Math.min(100, (value / limit) * 100);
  const over = value > limit;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
        <span className="text-muted">{label}</span>
        <span className={cx('tabular-nums', over ? 'text-warn' : 'text-ink')}>
          {Math.round(value)}
          <span className="text-faint">/{limit}px</span>
        </span>
      </div>
      <div className="relative h-1 rounded-full bg-line">
        <div className={cx('h-full rounded-full transition-all', over ? 'bg-warn' : 'bg-accent')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ id: T; label: ReactNode }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md bg-subtle p-0.5 ring-1 ring-line ring-inset">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cx('inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] transition', value === o.id ? 'bg-panel text-ink shadow-card ring-1 ring-line' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-ink outline-none transition placeholder:text-faint hover:border-line-strong focus:border-accent focus:ring-3 focus:ring-accent/15';

export const buttonPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-white shadow-card transition hover:bg-accent-hover disabled:opacity-50';

export const buttonSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-ink shadow-card transition hover:border-line-strong disabled:opacity-50';

export const buttonGhost = 'inline-flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-muted transition hover:bg-subtle hover:text-ink';
