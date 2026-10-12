import { Check, Copy, FileCode2, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { applyFix, locate, type FixResponse } from '../api';
import { buttonGhost, buttonPrimary, buttonSecondary, cx, inputClass, Panel, Segmented } from './ui';

const FRAMEWORKS = [
  { id: 'nextjs', label: 'next.js', placeholder: 'app/layout.tsx' },
  { id: 'astro', label: 'astro', placeholder: 'src/pages/index.astro' },
  { id: 'html', label: 'html', placeholder: 'public/index.html' },
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

export function FixPanel({ updates, route, onApplied }: { updates: Record<string, unknown>; route?: string; onApplied?: () => void }) {
  const [framework, setFramework] = useState(() => readPref('hs.framework', 'nextjs'));
  const [filePath, setFilePath] = useState('');
  const [located, setLocated] = useState<string | null>(null);
  // Prefill with the file that owns this route's metadata (falls back to the last path used).
  useEffect(() => {
    let cancelled = false;
    locate(route ?? '/')
      .then((r) => {
        if (cancelled) return;
        if (r.recommended) {
          setFilePath(r.recommended.file);
          setFramework(r.recommended.framework);
          setLocated(r.recommended.metadata);
        } else setFilePath((p) => p || readPref('hs.filePath', ''));
      })
      .catch(() => setFilePath((p) => p || readPref('hs.filePath', '')));
    return () => {
      cancelled = true;
    };
  }, [route]);
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
          <Wand2 className="size-3.5 text-accent" /> apply_metadata_fix
        </span>
      }
      actions={
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className={buttonGhost}
        >
          {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />} {copied ? 'copied' : 'copy cli'}
        </button>
      }
    >
      <div className="flex flex-col gap-2 lg:flex-row">
        <Segmented value={framework} onChange={setFramework} options={FRAMEWORKS.map((f) => ({ id: f.id as string, label: f.label }))} />
        <label className="relative flex-1">
          <FileCode2 className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder={placeholder} aria-label="Source file path" className={cx(inputClass, 'pl-8')} />
        </label>
        <div className="flex gap-2">
          <button disabled={!filePath || busy} onClick={() => run(true)} className={buttonSecondary}>
            dry run
          </button>
          <button disabled={!filePath || busy} onClick={() => run(false)} className={buttonPrimary}>
            apply
          </button>
        </div>
      </div>
      {located && <p className="mt-2 text-[12px] text-muted">located via route · declares metadata with <span className="text-ink">{located}</span></p>}
      <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-subtle p-3 text-[12px] leading-5 text-body ring-1 ring-line ring-inset">{JSON.stringify(updates, null, 2)}</pre>
      {result && (
        <div className="mt-3 space-y-2">
          {result.error ? (
            <p className="text-err">✕ {result.error}</p>
          ) : (
            <p className="text-ok">
              ✓ {result.dryRun ? 'dry run' : 'wrote'} {result.filePath} <span className="text-muted">— {result.applied.join(', ') || 'no changes'}</span>
            </p>
          )}
          {result.warnings.map((w) => (
            <p key={w} className="text-[12px] text-warn">
              ! {w}
            </p>
          ))}
          {result.diff && (
            <pre className="max-h-80 overflow-auto rounded-md border border-line bg-panel py-2 text-[12px] leading-5">
              {result.diff.split('\n').map((l, i) => (
                <div
                  key={i}
                  className={cx(
                    'px-3',
                    l.startsWith('+') && !l.startsWith('+++') ? 'bg-ok-soft text-ok' : l.startsWith('-') && !l.startsWith('---') ? 'bg-err-soft text-err' : l.startsWith('@@') ? 'text-accent' : 'text-muted',
                  )}
                >
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
