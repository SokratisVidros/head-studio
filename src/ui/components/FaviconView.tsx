import { ImageOff } from 'lucide-react';
import type { InspectReport } from '../../core/types';
import { assetUrl } from '../api';
import { IssueList, Panel, StatusBadge } from './ui';

export function FaviconView({ report }: { report: InspectReport }) {
  const { grid, manifest, links } = report.favicons;
  const tabIcon = grid.find((g) => (g.id === 'png-32x32' || g.id === 'favicon-ico') && g.status === 'pass');
  const apple = grid.find((g) => g.id === 'apple-touch-icon');
  const issues = report.issues.filter((i) => i.category === 'favicons');

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="browser.tab">
          <div className="font-platform rounded-md border border-line bg-[#dee1e6] px-2 pt-2">
            <div className="flex w-64 max-w-full items-center gap-2 rounded-t-lg bg-white px-3 py-2">
              {tabIcon?.check?.resolved ? <img src={assetUrl(tabIcon.check.resolved)} alt="" className="size-4" /> : <span className="size-4 rounded-full bg-[#c4c7cc]" />}
              <span className="truncate text-[12px] text-[#202124]">{report.meta.title ?? 'Untitled'}</span>
            </div>
          </div>
        </Panel>
        <Panel title="ios.home_screen">
          <div className="font-platform flex items-end gap-6 rounded-md bg-gradient-to-br from-[#c7d7fe] via-[#e0e7ff] to-[#f5f3ff] p-4">
            <div className="flex w-16 flex-col items-center gap-1">
              {apple?.status !== 'fail' && apple?.check?.resolved ? (
                <img src={assetUrl(apple.check.resolved)} alt="" className="size-14 rounded-[14px] shadow-pop" />
              ) : (
                <div className="grid size-14 place-items-center rounded-[14px] bg-white/60 text-faint">
                  <ImageOff className="size-5" />
                </div>
              )}
              <span className="w-full truncate text-center text-[10px] text-[#1f2937]">{manifest?.shortName ?? report.openGraph.siteName ?? 'App'}</span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="icon.matrix">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {grid.map((row) => {
            const src = row.check?.ok ? assetUrl(row.check.resolved) : undefined;
            return (
              <div key={row.id} className="flex gap-3 rounded-md border border-line p-3 transition hover:border-line-strong">
                <div className="grid size-14 shrink-0 place-items-center rounded bg-[repeating-conic-gradient(#eef1f5_0%_25%,#ffffff_0%_50%)] bg-[length:10px_10px] ring-1 ring-line ring-inset">
                  {src ? <img src={src} alt="" className="max-h-11 max-w-11" style={{ imageRendering: (row.check?.width ?? 64) < 48 ? 'pixelated' : 'auto' }} /> : <ImageOff className="size-4 text-faint" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-ink">{row.label}</span>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="mt-1 truncate text-[11px] text-accent" title={row.href ?? ''}>
                    {row.href ?? <span className="text-faint">—</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {[row.check?.width ? `${row.check.width}×${row.check.height}` : null, row.expected ? `want ${row.expected}` : null, row.note].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="<link rel=icon>" flush>
          {links.length ? (
            <table className="w-full text-left text-[12px]">
              <thead className="text-faint">
                <tr className="border-b border-line">
                  <th className="py-2 pl-4 font-normal">rel</th>
                  <th className="py-2 font-normal">sizes</th>
                  <th className="py-2 pr-4 font-normal">href</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {links.map((l, i) => (
                  <tr key={i} className="hover:bg-subtle">
                    <td className="py-2 pr-3 pl-4 text-ink">{l.rel}</td>
                    <td className="py-2 pr-3 text-muted">{l.sizes ?? '—'}</td>
                    <td className="py-2 pr-4 break-all text-accent">{l.href}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-muted">No icon links in &lt;head&gt;.</p>
          )}
        </Panel>
        <Panel title="manifest">
          {manifest ? (
            manifest.ok ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  {(
                    [
                      ['name', manifest.name],
                      ['short_name', manifest.shortName],
                      ['display', manifest.display],
                      ['theme_color', manifest.themeColor],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <div className="text-muted">{k}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-ink">
                        {k === 'theme_color' && v && <span className="size-3 rounded-sm ring-1 ring-line" style={{ background: v }} />}
                        {v ?? '—'}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-line pt-3 text-[11px] text-muted">
                  {manifest.icons.map((i) => (
                    <div key={i.src}>
                      <span className="text-ink">{i.sizes ?? '?'}</span> {i.src}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-err">✕ {manifest.error}</p>
            )
          ) : (
            <p className="text-muted">No manifest declared.</p>
          )}
        </Panel>
      </div>

      <Panel title="issues">
        <IssueList issues={issues} />
      </Panel>
    </div>
  );
}
