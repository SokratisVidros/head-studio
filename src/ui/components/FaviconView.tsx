import { ImageOff } from 'lucide-react';
import type { InspectReport } from '../../core/types';
import { assetUrl } from '../api';
import { IssueList, Panel, StatusBadge } from './ui';

export function FaviconView({ report }: { report: InspectReport }) {
  const { grid, manifest, links } = report.favicons;
  const tabIcon = grid.find((g) => (g.id === 'png-32x32' || g.id === 'favicon-ico' || g.id === 'svg') && g.status === 'pass');
  const apple = grid.find((g) => g.id === 'apple-touch-icon');
  const issues = report.issues.filter((i) => i.category === 'favicons');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Browser tab">
          <div className="rounded-lg bg-[#202124] p-2 pb-0">
            <div className="flex w-64 max-w-full items-center gap-2 rounded-t-lg bg-[#35363a] px-3 py-2">
              {tabIcon?.check?.resolved ? <img src={assetUrl(tabIcon.check.resolved)} alt="" className="size-4" /> : <span className="size-4 rounded-full bg-zinc-600" />}
              <span className="truncate text-xs text-zinc-200">{report.meta.title ?? 'Untitled'}</span>
            </div>
          </div>
        </Panel>
        <Panel title="iOS home screen">
          <div className="flex items-end gap-6 rounded-lg bg-gradient-to-br from-indigo-900 via-slate-900 to-emerald-900 p-4">
            <div className="flex w-16 flex-col items-center gap-1">
              {apple?.status !== 'fail' && apple?.check?.resolved ? (
                <img src={assetUrl(apple.check.resolved)} alt="" className="size-14 rounded-[14px] shadow-lg" />
              ) : (
                <div className="grid size-14 place-items-center rounded-[14px] bg-white/10 text-white/40">
                  <ImageOff className="size-5" />
                </div>
              )}
              <span className="w-full truncate text-center text-[10px] text-white">{manifest?.shortName ?? report.openGraph.siteName ?? 'App'}</span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Icon matrix">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {grid.map((row) => {
            const src = row.check?.ok ? assetUrl(row.check.resolved) : undefined;
            return (
              <div key={row.id} className="flex gap-3 rounded-lg border border-line bg-surface p-3">
                <div className="grid size-14 shrink-0 place-items-center rounded-md bg-[repeating-conic-gradient(#1f232b_0%_25%,#171a20_0%_50%)] bg-[length:12px_12px]">
                  {src ? <img src={src} alt="" className="max-h-12 max-w-12" style={{ imageRendering: (row.check?.width ?? 64) < 48 ? 'pixelated' : 'auto' }} /> : <ImageOff className="size-5 text-zinc-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-zinc-200">{row.label}</span>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-muted" title={row.href ?? ''}>
                    {row.href ?? '—'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {row.check?.width ? `${row.check.width}×${row.check.height}` : ''}
                    {row.expected ? ` · expects ${row.expected}` : ''}
                    {row.note ? ` · ${row.note}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Declared icon links">
          {links.length ? (
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="pb-2 font-normal">rel</th>
                  <th className="pb-2 font-normal">sizes</th>
                  <th className="pb-2 font-normal">href</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {links.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-3 font-mono text-zinc-300">{l.rel}</td>
                    <td className="py-1.5 pr-3 text-muted">{l.sizes ?? '—'}</td>
                    <td className="py-1.5 font-mono break-all text-zinc-200">{l.href}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">No icon links in &lt;head&gt;.</p>
          )}
        </Panel>
        <Panel title="Web app manifest">
          {manifest ? (
            manifest.ok ? (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(
                    [
                      ['name', manifest.name],
                      ['short_name', manifest.shortName],
                      ['display', manifest.display],
                      ['theme_color', manifest.themeColor],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <div className="font-mono text-muted">{k}</div>
                      <div className="flex items-center gap-1.5 text-zinc-200">
                        {k === 'theme_color' && v && <span className="size-3 rounded-sm border border-line" style={{ background: v }} />}
                        {v ?? '—'}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="font-mono text-[11px] text-muted">{manifest.icons.map((i) => `${i.sizes ?? '?'} ${i.src}`).join(' · ')}</div>
              </div>
            ) : (
              <p className="text-sm text-red-400">{manifest.error}</p>
            )
          ) : (
            <p className="text-sm text-muted">No manifest declared.</p>
          )}
        </Panel>
      </div>

      <Panel title="Favicon issues">
        <IssueList issues={issues} />
      </Panel>
    </div>
  );
}
