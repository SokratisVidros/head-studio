import { ChevronLeft, ChevronRight, Monitor, Smartphone, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { InspectReport } from '../../core/types';
import { assetUrl, displayHost } from '../api';
import { GoogleResult } from './SerpView';
import { CropGuides, PLATFORMS } from './SocialPreviews';
import { NetworkIcon } from './social/icons';
import { buildCtx, type Device } from './social/kit';
import { AnnotatedStage } from './social/notes';
import { cx } from './ui';

/*
 * Present mode: a full-screen walkthrough of every visual preview, one slide each,
 * across sections (Google search → each social network/view/device → og:image crops).
 */

const NO_ISSUES: never[] = [];

const NAMES: Record<string, string> = { facebook: 'Facebook', x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', tiktok: 'TikTok', slack: 'Slack' };

interface Slide {
  id: string;
  section: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  device?: Device;
  render: () => ReactNode;
}

function buildSlides(report: InspectReport): Slide[] {
  const ctx = buildCtx(report);
  const favicon = report.favicons.grid.find((g) => g.status === 'pass' && g.check?.resolved)?.check?.resolved;
  const siteName = report.openGraph.siteName ?? displayHost(report.meta.canonical ?? report.url);
  const url = report.meta.canonical ?? report.url;
  const slides: Slide[] = (['desktop', 'mobile'] as const).map((d) => ({
    id: `google/${d}`,
    section: 'Search',
    title: 'Google',
    subtitle: 'search result',
    device: d,
    render: () => (
      <div className="grid place-items-center rounded-xl bg-white p-10 shadow-card ring-1 ring-line">
        <GoogleResult result={report.serp[d]} url={url} siteName={siteName} favicon={assetUrl(favicon)} device={d} />
      </div>
    ),
  }));
  for (const p of PLATFORMS)
    for (const s of p.surfaces)
      for (const d of s.devices)
        slides.push({
          id: `${p.id}/${s.id}/${d}`,
          section: 'Social',
          title: NAMES[p.id] ?? p.label,
          subtitle: s.label,
          icon: <NetworkIcon id={p.id} className="size-5" />,
          device: d,
          render: () => s.render(ctx, d),
        });
  slides.push({
    id: 'og-crops',
    section: 'Assets',
    title: 'og:image',
    subtitle: 'crop guides',
    render: () => (
      <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-card ring-1 ring-line">
        <CropGuides report={report} />
      </div>
    ),
  });
  return slides;
}

/** Scales its content down (never up) to fit the available height. Uses transform, so layout-driven width fitting inside is untouched. */
function FitHeight({ children }: { children: ReactNode }) {
  const area = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const fit = useCallback(() => {
    if (!area.current || !content.current) return;
    setScale(Math.min(1, area.current.clientHeight / Math.max(1, content.current.offsetHeight)));
  }, []);
  useLayoutEffect(fit);
  useEffect(() => {
    const ro = new ResizeObserver(fit);
    if (area.current) ro.observe(area.current);
    if (content.current) ro.observe(content.current);
    return () => ro.disconnect();
  }, [fit]);
  return (
    <div ref={area} className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={content} className="mx-auto w-full max-w-[1280px] origin-top" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

export function Present({ report, onClose }: { report: InspectReport; onClose: () => void }) {
  const slides = useMemo(() => buildSlides(report), [report]);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(0);
  const [labels, setLabels] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const slide = slides[index];

  const go = useCallback(
    (to: number) => {
      const next = Math.max(0, Math.min(slides.length - 1, to));
      setDir(Math.sign(next - index));
      setIndex(next);
    },
    [index, slides.length],
  );

  // Full screen while presenting; leaving full screen (Esc in the browser) ends the presentation.
  useEffect(() => {
    const el = rootRef.current;
    let entered = false;
    el?.requestFullscreen?.().then(
      () => (entered = true),
      () => undefined, // not allowed (e.g. iframe) — the overlay still covers the window
    );
    const onChange = () => {
      if (entered && !document.fullscreenElement) onClose();
    };
    document.addEventListener('fullscreenchange', onChange);
    rootRef.current?.focus();
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose]);

  // Capture-phase key handling so the dashboard's own shortcuts don't fire underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'Enter' || (k === ' ' && !e.shiftKey)) go(index + 1);
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || (k === ' ' && e.shiftKey)) go(index - 1);
      else if (k === 'Escape') onClose();
      else return e.stopPropagation(); // keep dashboard shortcuts from acting behind the overlay
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [go, index, slides.length, onClose]);

  return (
    <div ref={rootRef} tabIndex={-1} role="dialog" aria-modal aria-label="Presentation" className="fixed inset-0 z-50 flex flex-col bg-canvas outline-none">
      <header className="flex items-center gap-4 border-b border-line bg-panel px-6 py-3">
        <div key={slide.id} className="preview-in flex min-w-0 items-center gap-3" style={{ '--dx': `${dir * 10}px` } as CSSProperties}>
          <span className="text-[11px] tracking-wide text-faint uppercase">{slide.section}</span>
          <span className="grid size-8 place-items-center rounded-md bg-subtle text-ink ring-1 ring-line">{slide.icon ?? <span className="text-[13px] font-semibold">{slide.title[0]}</span>}</span>
          <h2 className="truncate text-[18px] font-semibold tracking-tight text-ink">
            {slide.title}
            {slide.subtitle && <span className="font-normal text-muted"> · {slide.subtitle}</span>}
          </h2>
          {slide.device && (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted ring-1 ring-line ring-inset">
              {slide.device === 'desktop' ? <Monitor className="size-3.5" /> : <Smartphone className="size-3.5" />} {slide.device}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-muted tabular-nums">
            {index + 1} / {slides.length}
          </span>
          <button onClick={() => setLabels((v) => !v)} aria-pressed={labels} className={cx('btn btn-secondary btn-sm', !labels && 'text-muted')} title="Hints">
            <Tag className="size-3.5" /> hints
          </button>
          <button onClick={() => go(index - 1)} disabled={index === 0} className="btn btn-secondary btn-sm" aria-label="Previous slide">
            <ChevronLeft className="size-4" />
          </button>
          <button onClick={() => go(index + 1)} disabled={index === slides.length - 1} className="btn btn-secondary btn-sm" aria-label="Next slide">
            <ChevronRight className="size-4" />
          </button>
          <button onClick={onClose} className="btn btn-secondary btn-sm" aria-label="Exit presentation (Esc)">
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-8 pt-6 pb-4">
        <div key={slide.id} className="preview-in font-platform flex min-h-0 flex-1 flex-col" style={{ '--dx': `${dir * 24}px` } as CSSProperties}>
          <FitHeight>
            <AnnotatedStage issues={NO_ISSUES} hints={labels} footer={false}>
              {slide.render()}
            </AnnotatedStage>
          </FitHeight>
        </div>
      </div>

      <footer className="flex items-center gap-3 px-8 pb-5">
        <div className="flex flex-1 gap-1" role="tablist" aria-label="Slides">
          {slides.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === index}
              aria-label={`${s.title}${s.subtitle ? ` · ${s.subtitle}` : ''}${s.device ? ` · ${s.device}` : ''}`}
              title={`${s.title}${s.subtitle ? ` · ${s.subtitle}` : ''}${s.device ? ` · ${s.device}` : ''}`}
              onClick={() => go(i)}
              className={cx('h-1.5 flex-1 rounded-full transition-colors duration-200', i === index ? 'bg-accent' : i < index ? 'bg-accent/30' : 'bg-line hover:bg-line-strong')}
            />
          ))}
        </div>
        <span className="text-[11px] text-faint">← → / space navigate · esc exit</span>
      </footer>
    </div>
  );
}
