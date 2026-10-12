import { Braces, Globe, Image, LayoutDashboard, Loader2, Play, RefreshCw, Search, Share2, Tags } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { getConfig, inspectTarget, type InspectReport } from './api';
import { FaviconView } from './components/FaviconView';
import { JsonLdView } from './components/JsonLdView';
import { OgView } from './components/OgView';
import { Overview } from './components/Overview';
import { SerpView } from './components/SerpView';
import { TagsView } from './components/TagsView';
import { cx } from './components/ui';

type Tab = 'overview' | 'serp' | 'og' | 'favicons' | 'jsonld' | 'tags';

const TABS: Array<{ id: Tab; label: string; icon: ComponentType<{ className?: string }>; categories: string[] }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, categories: [] },
  { id: 'serp', label: 'Meta & SERP', icon: Search, categories: ['meta', 'serp'] },
  { id: 'og', label: 'Social cards', icon: Share2, categories: ['opengraph', 'twitter'] },
  { id: 'favicons', label: 'Favicons', icon: Image, categories: ['favicons'] },
  { id: 'jsonld', label: 'JSON-LD', icon: Braces, categories: ['jsonld'] },
  { id: 'tags', label: 'All tags', icon: Tags, categories: [] },
];

function readHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem('hs.history') ?? '[]') as string[];
  } catch {
    return [];
  }
}

function pushHistory(target: string) {
  try {
    const next = [target, ...readHistory().filter((t) => t !== target)].slice(0, 8);
    localStorage.setItem('hs.history', JSON.stringify(next));
  } catch {
    // storage unavailable
  }
}

export function App() {
  const params = new URLSearchParams(location.search);
  const [target, setTarget] = useState(params.get('target') ?? '');
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'overview');
  const [report, setReport] = useState<InspectReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState('');
  const [recent, setRecent] = useState<string[]>(readHistory);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (t: string) => {
    const value = t.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      const r = await inspectTarget(value);
      setReport(r);
      pushHistory(value);
      setRecent(readHistory());
      const qs = new URLSearchParams(location.search);
      qs.set('target', value);
      window.history.replaceState(null, '', `?${qs}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setVersion(cfg.version);
        const initial = params.get('target') ?? readHistory()[0] ?? cfg.defaultTarget;
        setTarget(initial);
        void run(initial);
      })
      .catch(() => setError('Cannot reach the head-studio server.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    qs.set('tab', tab);
    window.history.replaceState(null, '', `?${qs}`);
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const count = (cats: string[]) => (report ? report.issues.filter((i) => cats.includes(i.category) && i.severity !== 'info') : []);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-panel md:w-56 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-3.5">
          <div className="grid size-7 place-items-center rounded-md bg-brand font-bold text-emerald-950">H</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Head Studio</div>
            <div className="text-[11px] text-muted">{version ? `v${version}` : 'local'}</div>
          </div>
        </div>
        <nav className="flex gap-0.5 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {TABS.map(({ id, label, icon: Icon, categories }) => {
            const issues = count(categories);
            const errors = issues.filter((i) => i.severity === 'error').length;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cx('flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition', tab === id ? 'bg-raised text-zinc-100' : 'text-muted hover:bg-raised/60 hover:text-zinc-200')}
              >
                <Icon className="size-4" />
                <span className="flex-1">{label}</span>
                {issues.length > 0 && (
                  <span className={cx('rounded px-1.5 text-[11px] tabular-nums', errors ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300')}>{issues.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        {recent.length > 1 && (
          <div className="mt-auto hidden border-t border-line px-2 py-3 md:block">
            <div className="px-2.5 pb-1.5 text-[11px] tracking-wide text-muted uppercase">Recent</div>
            {recent.slice(0, 6).map((h) => (
              <button
                key={h}
                onClick={() => {
                  setTarget(h);
                  void run(h);
                }}
                title={h}
                className="block w-full truncate rounded px-2.5 py-1 text-left font-mono text-[11px] text-muted hover:bg-raised hover:text-zinc-200"
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(target);
          }}
          className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2.5"
        >
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="http://localhost:3000/blog/post-1 or ./dist"
              aria-label="Target URL or path"
              spellCheck={false}
              className="w-full rounded-md border border-line bg-surface py-2 pr-16 pl-9 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-muted sm:block">⌘K</kbd>
          </div>
          <button type="submit" disabled={loading} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 text-[13px] font-medium text-emerald-950 hover:bg-emerald-400 disabled:opacity-60">
            {loading ? <Loader2 className="size-4 animate-spin" /> : report && report.target === target.trim() ? <RefreshCw className="size-4" /> : <Play className="size-4" />}
            Inspect
          </button>
        </form>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
          {!report && !error && (
            <div className="grid h-full place-items-center text-sm text-muted">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Inspecting…
              </span>
            </div>
          )}
          {report && (
            <div className={cx('mx-auto max-w-6xl transition-opacity', loading && 'opacity-60')}>
              {tab === 'overview' && <Overview report={report} onNavigate={(t) => setTab(t as Tab)} />}
              {tab === 'serp' && <SerpView report={report} onApplied={() => void run(report.target)} />}
              {tab === 'og' && <OgView report={report} />}
              {tab === 'favicons' && <FaviconView report={report} />}
              {tab === 'jsonld' && <JsonLdView report={report} />}
              {tab === 'tags' && <TagsView report={report} />}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
