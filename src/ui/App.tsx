import { ArrowRight, Braces, Image, LayoutGrid, Loader2, RotateCw, Search, Share2, Tags } from 'lucide-react';
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
  { id: 'overview', label: 'overview', icon: LayoutGrid, categories: [] },
  { id: 'serp', label: 'meta & serp', icon: Search, categories: ['meta', 'serp'] },
  { id: 'og', label: 'social cards', icon: Share2, categories: ['opengraph', 'twitter'] },
  { id: 'favicons', label: 'favicons', icon: Image, categories: ['favicons'] },
  { id: 'jsonld', label: 'json-ld', icon: Braces, categories: ['jsonld'] },
  { id: 'tags', label: 'all tags', icon: Tags, categories: [] },
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

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-7 place-items-center rounded-md bg-accent text-[11px] font-bold tracking-tighter text-white shadow-card">&lt;/&gt;</div>
      <span className="font-semibold tracking-tight text-ink">head-studio</span>
    </div>
  );
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
  const fresh = report && report.target === target.trim();

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-panel/90 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 md:px-6">
          <div className="flex items-center gap-2">
            <Logo />
            {version && <span className="rounded bg-subtle px-1.5 py-px text-[11px] text-muted ring-1 ring-line ring-inset">v{version}</span>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(target);
            }}
            className="order-last flex w-full items-center gap-2 md:order-none md:w-auto md:flex-1"
          >
            <label className="group flex flex-1 items-center rounded-md border border-line bg-panel shadow-card transition focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15 hover:border-line-strong">
              <span className="pr-1 pl-3 text-accent select-none">$</span>
              <span className="hidden pr-2 text-muted select-none sm:inline">inspect</span>
              <input
                ref={inputRef}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="http://localhost:3000/blog/post-1 or ./dist"
                aria-label="Target URL or path"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent py-2 pr-2 text-ink outline-none placeholder:text-faint"
              />
              <kbd className="mr-2 hidden rounded border border-line bg-subtle px-1.5 text-[10px] text-muted sm:block">⌘K</kbd>
            </label>
            <button type="submit" disabled={loading} className="inline-flex h-[38px] items-center gap-1.5 rounded-md bg-accent px-3.5 font-medium text-white shadow-card transition hover:bg-accent-hover disabled:opacity-60">
              {loading ? <Loader2 className="size-4 animate-spin" /> : fresh ? <RotateCw className="size-4" /> : <ArrowRight className="size-4" />}
              <span className="hidden sm:inline">{fresh ? 'rerun' : 'run'}</span>
            </button>
          </form>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-line md:w-56 md:border-r md:border-b-0">
          <nav className="flex gap-1 overflow-x-auto px-3 py-2 md:flex-col md:overflow-visible md:py-4">
            <div className="hidden px-2.5 pb-2 text-[11px] text-faint md:block">// report</div>
            {TABS.map(({ id, label, icon: Icon, categories }) => {
              const issues = count(categories);
              const errors = issues.filter((i) => i.severity === 'error').length;
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cx(
                    'flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition',
                    active ? 'bg-panel text-accent shadow-card ring-1 ring-line' : 'text-body hover:bg-panel/70 hover:text-ink',
                  )}
                >
                  <Icon className={cx('size-4', active ? 'text-accent' : 'text-faint')} />
                  <span className="flex-1">{label}</span>
                  {issues.length > 0 && <span className={cx('text-[11px] tabular-nums', errors ? 'text-err' : 'text-warn')}>{issues.length}</span>}
                </button>
              );
            })}
            {recent.length > 1 && (
              <div className="mt-6 hidden md:block">
                <div className="px-2.5 pb-2 text-[11px] text-faint">// recent</div>
                {recent.slice(0, 6).map((h) => (
                  <button
                    key={h}
                    onClick={() => {
                      setTarget(h);
                      void run(h);
                    }}
                    title={h}
                    className="block w-full truncate rounded px-2.5 py-1 text-left text-[12px] text-muted transition hover:bg-panel hover:text-accent"
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">
            {error && (
              <div className="mb-5 rounded-lg border border-err/20 bg-err-soft px-4 py-3 text-err">
                <span className="font-medium">error</span> {error}
              </div>
            )}
            {!report && !error && (
              <div className="grid h-64 place-items-center text-muted">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-accent" /> inspecting…
                </span>
              </div>
            )}
            {report && (
              <div className={cx('transition-opacity', loading && 'opacity-50')}>
                <div className="mb-5">
                  <div className="text-[11px] text-faint">// {TABS.find((t) => t.id === tab)?.label}</div>
                  <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-ink" title={report.url}>
                    {report.meta.title ?? report.url}
                  </h1>
                </div>
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
    </div>
  );
}
