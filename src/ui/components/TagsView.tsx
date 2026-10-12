import { Search } from 'lucide-react';
import { useState } from 'react';
import type { InspectReport } from '../../core/types';
import { cx, inputClass, Panel } from './ui';

export function TagsView({ report }: { report: InspectReport }) {
  const [q, setQ] = useState('');
  const rows = report.meta.all.filter((m) => !q || `${m.key} ${m.content}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-5">
      <Panel
        flush
        title={`<meta> (${rows.length}/${report.meta.all.length})`}
        actions={
          <label className="relative w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter…" aria-label="Filter tags" className={cx(inputClass, 'py-1 pl-8 text-[12px]')} />
          </label>
        }
      >
        <table className="w-full text-left text-[12px]">
          <tbody className="divide-y divide-line">
            {rows.map((m, i) => (
              <tr key={i} className="hover:bg-subtle">
                <td className="w-0 py-2 pr-6 pl-4 whitespace-nowrap text-accent">{m.key}</td>
                <td className="py-2 pr-4 break-all text-ink">{m.content}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="report.json">
        <pre className="max-h-[600px] overflow-auto text-[12px] leading-5 text-body">{JSON.stringify(report, null, 2)}</pre>
      </Panel>
    </div>
  );
}
