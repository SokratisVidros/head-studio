import { CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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

/**
 * Segmented control with a sliding thumb: the raised indicator glides to the selected
 * option (transform + width, 220ms ease-out) instead of jumping between buttons.
 */
export function Segmented<T extends string>({ value, options, onChange, row = 0 }: { value: T; options: Array<{ id: T; label: ReactNode; title?: string }>; onChange: (v: T) => void; row?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const place = useCallback(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el) setThumb((t) => (t && t.x === el.offsetLeft && t.w === el.offsetWidth ? t : { x: el.offsetLeft, w: el.offsetWidth }));
  }, []);
  useLayoutEffect(place, [place, value, options]);
  useEffect(() => {
    // Re-place when labels change size (font load, icon swap).
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [place]);
  return (
    <div ref={ref} data-kbd-row={row} role="group" className="relative inline-flex rounded-md bg-subtle p-0.5 ring-1 ring-line ring-inset">
      {thumb && (
        <span
          aria-hidden
          className="seg-thumb absolute top-0.5 bottom-0.5 left-0 rounded-[5px] transition-[transform,width] duration-[220ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
          style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          title={o.title}
          aria-label={o.title}
          aria-pressed={value === o.id}
          className={cx('relative inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] transition-colors duration-150', value === o.id ? 'text-ink' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-ink outline-none transition placeholder:text-faint hover:border-line-strong focus:border-accent focus:ring-3 focus:ring-accent/15';

export const buttonPrimary = 'btn btn-primary';

export const buttonSecondary = 'btn btn-secondary';

export const buttonGhost = 'inline-flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-muted transition hover:bg-subtle hover:text-ink';

/** True when keys should go to the focused element (text entry or a draggable note), not shortcuts. */
export function isEditing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"], [data-note]');
}

/** True for any CSS colour the browser understands (hex, rgb(), hsl(), named…). */
export function isColor(value: string | null | undefined): value is string {
  return !!value && typeof CSS !== 'undefined' && CSS.supports('color', value.trim());
}

/** A colour value with a small swatch box beside it; plain text when it isn't a colour. */
export function ColorValue({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted">—</span>;
  if (!isColor(value)) return <>{value}</>;
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span aria-hidden className="size-3.5 shrink-0 rounded-[3px] shadow-[inset_0_0_0_1px_rgb(10_37_64/0.14)]" style={{ backgroundColor: value.trim() }} />
      <span>{value}</span>
    </span>
  );
}
