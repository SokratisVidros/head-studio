import { Check, Copy, FileCode2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { applyFix, type FixResponse } from '../api';
import { cx, Panel } from './ui';

const FRAMEWORKS = [
  { id: 'nextjs', label: 'Next.js', placeholder: 'app/layout.tsx' },
  { id: 'astro', label: 'Astro', placeholder: 'src/pages/index.astro' },
  { id: 'html', label: 'HTML', placeholder: 'public/index.html' },
] as const;

function readPref(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable
  }
}

export function FixPanel({ updates, onApplied }: { updates: Record<string, unknown>; onApplied?: () => void }) {
  const [framework, setFramework] = useState(() => readPref('hs.framework', 'nextjs'));
  const [filePath, setFilePath] = useState(() => readPref('hs.filePath', ''));
  const [result, setResult] = useState<FixResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const placeholder = FRAMEWORKS.find((f) => f.id === framework)?.placeholder;
  const payload = JSON.stringify(updates);
  const command = `npx head-studio fix ${filePath || placeholder} --framework ${framework} --updates '${payload.replace(/'/g, "'\\''")}'`;

  async function run(dryRun: boolean) {
    if (!filePath) return;
    setBusy(true);
    writePref('hs.framework', framework);
    writePref('hs.filePath', filePath);
    try {
      const r = await applyFix({ filePath, targetFramework: framework, updates, dryRun });
      setResult(r);
      if (!dryRun && r.ok) onApplied?.();
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : String(err), diff: '', applied: [], warnings: [], changed: false, dryRun, filePath, framework });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <Wand2 className="size-4 text-brand" /> Apply to source
        </span>
      }
      actions={
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-raised hover:text-zinc-200"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copy CLI command
        </button>
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex rounded-md border border-line bg-surface p-0.5">
          {FRAMEWORKS.map((f) => (
            <button key={f.id} onClick={() => setFramework(f.id)} className={cx('rounded px-2.5 py-1 text-xs', framework === f.id ? 'bg-raised text-zinc-100' : 'text-muted hover:text-zinc-200')}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="relative flex-1">
          <FileCode2 className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
          <input
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder={placeholder}
            aria-label="Source file path"
            className="w-full rounded-md border border-line bg-surface py-1.5 pr-2 pl-8 font-mono text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          />
        </label>
        <div className="flex gap-2">
          <button disabled={!filePath || busy} onClick={() => run(true)} className="rounded-md border border-line px-3 py-1.5 text-xs text-zinc-200 hover:bg-raised disabled:opacity-40">
            Preview diff
          </button>
          <button disabled={!filePath || busy} onClick={() => run(false)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-emerald-950 hover:bg-emerald-400 disabled:opacity-40">
            Apply
          </button>
        </div>
      </div>
      <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-surface p-2.5 font-mono text-[11px] text-muted">{JSON.stringify(updates, null, 2)}</pre>
      {result && (
        <div className="mt-3 space-y-2">
          {result.error ? (
            <p className="text-sm text-red-400">{result.error}</p>
          ) : (
            <p className="text-sm text-emerald-300">
              {result.dryRun ? 'Preview of' : 'Updated'} {result.filePath} — {result.applied.join(', ') || 'no changes'}
            </p>
          )}
          {result.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-300">
              {w}
            </p>
          ))}
          {result.diff && (
            <pre className="max-h-80 overflow-auto rounded-md bg-surface p-2.5 font-mono text-[11px] leading-relaxed">
              {result.diff.split('\n').map((l, i) => (
                <div key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'text-emerald-300' : l.startsWith('-') && !l.startsWith('---') ? 'text-red-400' : 'text-muted'}>
                  {l || ' '}
                </div>
              ))}
            </pre>
          )}
        </div>
      )}
    </Panel>
  );
}
