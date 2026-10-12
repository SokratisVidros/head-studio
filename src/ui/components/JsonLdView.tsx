import { ChevronRight, Code2, ListTree } from 'lucide-react';
import { useState } from 'react';
import type { InspectReport } from '../../core/types';
import { cx, IssueList, Panel, Pill } from './ui';

function Node({ name, value, depth = 0 }: { name?: string; value: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const isObj = value !== null && typeof value === 'object';
  const label = name != null && <span className={cx('font-mono', name.startsWith('@') ? 'text-violet-300' : 'text-sky-300')}>{name}</span>;

  if (!isObj) {
    const cls = typeof value === 'string' ? 'text-emerald-300' : typeof value === 'number' ? 'text-amber-300' : 'text-pink-300';
    const str = typeof value === 'string' ? `"${value}"` : String(value);
    return (
      <div className="flex gap-2 py-0.5 pl-5">
        {label}
        {label && <span className="text-muted">:</span>}
        <span className={cx('font-mono break-all', cls)}>{str}</span>
      </div>
    );
  }

  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>);
  const type = !Array.isArray(value) ? (value as Record<string, unknown>)['@type'] : undefined;
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 py-0.5 text-left">
        <ChevronRight className={cx('size-4 text-muted transition-transform', open && 'rotate-90')} />
        {label}
        {label && <span className="text-muted">:</span>}
        <span className="font-mono text-xs text-muted">{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
        {typeof type === 'string' && <Pill>{type}</Pill>}
      </button>
      {open && (
        <div className="ml-2 border-l border-line pl-2">
          {entries.map(([k, v]) => (
            <Node key={k} name={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonLdView({ report }: { report: InspectReport }) {
  const [raw, setRaw] = useState(false);
  const blocks = report.jsonLd;
  const general = report.issues.filter((i) => i.category === 'jsonld' && (i.code === 'jsonld/none' || i.code === 'jsonld/no-type'));

  return (
    <div className="space-y-4">
      {!blocks.length && (
        <Panel title="Structured data">
          <IssueList issues={general} />
        </Panel>
      )}
      {blocks.map((b) => {
        const issues = b.valid ? b.entities.flatMap((e) => e.issues) : [];
        const errors = issues.filter((i) => i.severity === 'error').length;
        return (
          <Panel
            key={b.index}
            title={
              <span className="flex flex-wrap items-center gap-2">
                Block #{b.index + 1}
                {b.valid ? b.entities.map((e, i) => <Pill key={i}>{e.type.join(' / ') || 'untyped'}</Pill>) : <Pill tone="error">Invalid JSON</Pill>}
                {b.valid && (errors ? <Pill tone="error">{errors} {errors === 1 ? 'error' : 'errors'}</Pill> : <Pill tone="ok">valid</Pill>)}
              </span>
            }
            actions={
              <button onClick={() => setRaw(!raw)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-raised hover:text-zinc-200">
                {raw ? <ListTree className="size-3.5" /> : <Code2 className="size-3.5" />} {raw ? 'Tree' : 'Source'}
              </button>
            }
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="max-h-[480px] overflow-auto rounded-md bg-surface p-3 text-[13px]">
                {!b.valid || raw ? <pre className="font-mono text-xs whitespace-pre-wrap text-zinc-300">{b.raw}</pre> : <Node value={b.data} />}
              </div>
              <div>
                {!b.valid ? <p className="text-sm text-red-400">{b.syntaxError}</p> : <IssueList issues={issues} empty="Matches schema.org rules for this type." />}
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
