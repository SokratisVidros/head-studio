import { ChevronRight, Code2, ListTree } from 'lucide-react';
import { useState } from 'react';
import type { InspectReport } from '../../core/types';
import { buttonGhost, cx, IssueList, Panel, Pill } from './ui';

function Node({ name, value, depth = 0 }: { name?: string; value: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const isObj = value !== null && typeof value === 'object';
  const label = name != null && <span className={cx('font-mono', name.startsWith('@') ? 'text-[#7c3aed]' : 'text-accent')}>{name}</span>;

  if (!isObj) {
    const cls = typeof value === 'string' ? 'text-[#0a7d52]' : typeof value === 'number' ? 'text-[#b45309]' : 'text-[#c026d3]';
    const str = typeof value === 'string' ? `"${value}"` : String(value);
    return (
      <div className="flex gap-2 py-0.5 pl-5">
        {label}
        {label && <span className="text-muted">:</span>}
        <span className={cx('break-all', cls)}>{str}</span>
      </div>
    );
  }

  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>);
  const type = !Array.isArray(value) ? (value as Record<string, unknown>)['@type'] : undefined;
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 py-0.5 text-left">
        <ChevronRight className={cx('size-3.5 text-faint transition-transform', open && 'rotate-90')} />
        {label}
        {label && <span className="text-muted">:</span>}
        <span className="text-[11px] text-faint">{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
        {typeof type === 'string' && <Pill tone="accent">{type}</Pill>}
      </button>
      {open && (
        <div className="ml-[7px] border-l border-line pl-2">
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
    <div className="space-y-5">
      {!blocks.length && (
        <Panel title="structured data">
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
                <span className="text-muted">block[{b.index}]</span>
                {b.valid ? b.entities.map((e, i) => <Pill key={i}>{e.type.join(' / ') || 'untyped'}</Pill>) : <Pill tone="error">invalid json</Pill>}
                {b.valid && (errors ? <Pill tone="error">{errors} {errors === 1 ? 'error' : 'errors'}</Pill> : <Pill tone="ok">✓ valid</Pill>)}
              </span>
            }
            actions={
              <button onClick={() => setRaw(!raw)} className={buttonGhost}>
                {raw ? <ListTree className="size-3.5" /> : <Code2 className="size-3.5" />} {raw ? 'tree' : 'source'}
              </button>
            }
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="max-h-[480px] overflow-auto rounded-md bg-subtle p-3 text-[12px] leading-5 ring-1 ring-line ring-inset">
                {!b.valid || raw ? <pre className="whitespace-pre-wrap text-body">{b.raw}</pre> : <Node value={b.data} />}
              </div>
              <div>
                {!b.valid ? <p className="text-err">✕ {b.syntaxError}</p> : <IssueList issues={issues} showCode={false} empty="Matches schema.org rules for this type." />}
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
