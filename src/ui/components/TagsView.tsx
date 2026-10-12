import { useState } from 'react';
import type { InspectReport } from '../../core/types';
import { Panel } from './ui';

export function TagsView({ report }: { report: InspectReport }) {
  const [q, setQ] = useState('');
  const rows = report.meta.all.filter((m) => !q || `${m.key} ${m.content}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <Panel
        title={`All <meta> tags (${report.meta.all.length})`}
        actions={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" aria-label="Filter tags" className="w-48 rounded-md border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-zinc-500" />}
      >
        <table className="w-full text-left text-xs">
          <tbody className="divide-y divide-line">
            {rows.map((m, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-4 font-mono whitespace-nowrap text-sky-300">{m.key}</td>
                <td className="py-1.5 break-all text-zinc-200">{m.content}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Raw report (JSON)">
        <pre className="max-h-[600px] overflow-auto rounded-md bg-surface p-3 font-mono text-[11px] text-zinc-300">{JSON.stringify(report, null, 2)}</pre>
      </Panel>
    </div>
  );
}
