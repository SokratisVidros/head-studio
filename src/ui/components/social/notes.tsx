import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { Issue } from '../../../core/types';
import { SeverityTag, cx } from '../ui';

/*
 * Issue notes anchored to the preview slot they affect. Notes live in a gutter beside
 * the preview (never on top of it) and connect to their slot with a leader line.
 *
 * Motion: while the pointer is down the note tracks it 1:1 (direct transform writes, no
 * React renders); on release a spring seeded with the release velocity settles it, with
 * rubber-banding past the stage edges and a velocity-driven paper-like tilt. Springs are
 * retargetable, so a note can be caught mid-flight. Reduced motion drops tilt + momentum.
 */

/** Issue code → preview slots (data-anchor) to attach to, in order of preference. */
const RULES: Array<[RegExp, string[]]> = [
  [/^twitter\/card/, ['card', 'image']],
  [/^og\/type/, ['card', 'image']],
  [/^(og|twitter)\/image/, ['image']],
  [/^(og|twitter)\/title/, ['title']],
  [/^og\/description/, ['description']],
  [/^og\/url/, ['url']],
  [/^favicon\//, ['icon']],
];

const anchorsFor = (code: string) => RULES.find(([re]) => re.test(code))?.[1] ?? [];

const GUTTER = 250; // reserved column for notes
const NOTE_W = 226;
const NOTE_GAP = 10;
const COLOR: Record<Issue['severity'], string> = { error: 'var(--color-err)', warning: 'var(--color-warn)', info: 'var(--color-note)' };

// Release spring: slightly under-damped (ζ ≈ 0.64) so a throw lands with a small settle.
const SPRING = { k: 300, c: 22 };
// Keyboard / reset spring: critically damped — no force was applied, so no bounce.
const SNAP = { k: 300, c: 2 * Math.sqrt(300) };
const TILT = { k: 220, c: 20 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rubber = (v: number, lo: number, hi: number) => (v < lo ? lo + (v - lo) * 0.2 : v > hi ? hi + (v - hi) * 0.2 : v);
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Hint {
  key: string;
  text: string;
  el: HTMLElement;
  ax: number;
  ay: number;
}

const HINT_CHAR = 6.6; // JetBrains Mono advance at 11px (0.6em)
const HINT_ROW = 32; // chip height + row gap

interface Placed {
  key: string;
  issue: Issue;
  el: HTMLElement;
  ax: number;
  ay: number;
}

export function AnnotatedStage({ issues, children, watch, hints = false, footer = false }: { issues: Issue[]; children: ReactNode; watch?: unknown; hints?: boolean; footer?: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [hintList, setHintList] = useState<Hint[]>([]);
  const [missing, setMissing] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0, pw: 0 });
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [order, setOrder] = useState<string[]>([]);
  const wide = size.w >= 720;

  // Anchor coordinates are relative to the preview's top-left, in the stage's own (unscaled)
  // pixels — so the hint lane above the preview and any ancestor transform (present mode
  // scales slides to fit) don't skew them.
  const measure = useCallback(() => {
    const stage = stageRef.current;
    const preview = previewRef.current;
    if (!stage || !preview) return;
    const sr = stage.getBoundingClientRect();
    const pr = preview.getBoundingClientRect();
    const k = sr.width / (stage.offsetWidth || sr.width) || 1;
    const point = (el: HTMLElement, edge: 'right' | 'centre') => {
      const r = el.getBoundingClientRect();
      // Clip to the visible area (phone screens scroll internally).
      const clip = (el.closest('[data-scroll]') ?? preview).getBoundingClientRect();
      const top = Math.max(r.top, clip.top);
      const bottom = Math.min(r.bottom, clip.bottom);
      const visible = bottom > top && r.width > 0;
      const cy = visible ? (top + bottom) / 2 : clamp(r.top + r.height / 2, clip.top, clip.bottom);
      const left = Math.max(r.left, clip.left);
      const right = Math.min(r.right, clip.right);
      const x = edge === 'right' ? right - Math.min(10, r.width / 2) : (left + right) / 2;
      return { visible, x: (x - pr.left) / k, y: (cy - pr.top) / k };
    };
    const out: Placed[] = [];
    let miss = 0;
    issues.forEach((issue, i) => {
      const el = anchorsFor(issue.code)
        .map((a) => preview.querySelector<HTMLElement>(`[data-anchor="${a}"]`))
        .find((e): e is HTMLElement => !!e);
      if (!el) return void miss++;
      const pt = point(el, 'right');
      out.push({ key: `${issue.code}#${i}`, issue, el, ax: pt.x, ay: pt.y });
    });
    const hs: Hint[] = [];
    if (hints)
      preview.querySelectorAll<HTMLElement>('[data-hint]').forEach((el, i) => {
        const pt = point(el, 'centre');
        if (pt.visible) hs.push({ key: `hint#${i}`, text: el.dataset.hint!, el, ax: pt.x, ay: pt.y });
      });
    setPlaced(out);
    setHintList(hs);
    setMissing(miss);
    setSize({ w: sr.width / k, h: pr.height / k, pw: pr.width / k });
  }, [issues, hints]);

  useLayoutEffect(measure, [measure, watch]);
  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (stageRef.current) ro.observe(stageRef.current);
    if (previewRef.current) ro.observe(previewRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // ── hint lane: chips above the preview, each centred over its slot, wrapping into rows ──
  const chips: Array<Hint & { x: number; w: number; row: number }> = [];
  const rowEnds: number[] = [];
  for (const h of [...hintList].sort((a, b) => a.ax - b.ax)) {
    const w = Math.round(h.text.length * HINT_CHAR + 34);
    let x = clamp(h.ax - w / 2, 0, Math.max(0, size.pw - w));
    let row = rowEnds.findIndex((end) => x >= end + 8);
    if (row < 0) {
      if (rowEnds.length < 3) row = rowEnds.push(-Infinity) - 1;
      else {
        row = rowEnds.indexOf(Math.min(...rowEnds));
        x = rowEnds[row] + 8;
      }
    }
    rowEnds[row] = x + w;
    chips.push({ ...h, x, w, row });
  }
  const lane = chips.length ? rowEnds.length * HINT_ROW + 18 : 0;

  // Place notes beside their anchors. Overlapping notes merge into a cluster that is centred
  // on its anchors (instead of only pushing down), so lines stay as short as possible.
  const shifted = placed.map((p) => ({ ...p, ay: p.ay + lane }));
  const homes = new Map<string, { x: number; y: number }>();
  type Cluster = { keys: string[]; ideal: number[]; hs: number[]; top: number; height: number };
  const clusters: Cluster[] = [];
  const centre = (c: Cluster) => {
    // top minimising squared distance of each note centre to its anchor
    let offset = 0;
    const sum = c.ideal.reduce((acc, ay, i) => {
      const s = acc + ay - (offset + c.hs[i] / 2);
      offset += c.hs[i] + NOTE_GAP;
      return s;
    }, 0);
    c.top = Math.max(0, sum / c.keys.length);
  };
  for (const p of [...shifted].sort((a, b) => a.ay - b.ay)) {
    const h = heights[p.key] ?? 64;
    const c: Cluster = { keys: [p.key], ideal: [p.ay], hs: [h], top: 0, height: h };
    centre(c);
    clusters.push(c);
    // merge while the last cluster overlaps the previous one
    while (clusters.length > 1) {
      const b = clusters[clusters.length - 1];
      const a = clusters[clusters.length - 2];
      if (a.top + a.height + NOTE_GAP <= b.top) break;
      clusters.splice(-2, 2, { keys: [...a.keys, ...b.keys], ideal: [...a.ideal, ...b.ideal], hs: [...a.hs, ...b.hs], top: 0, height: a.height + NOTE_GAP + b.height });
      centre(clusters[clusters.length - 1]);
    }
  }
  let bottom = 0;
  for (const c of clusters) {
    let y = c.top;
    c.keys.forEach((k, i) => {
      homes.set(k, { x: size.w - NOTE_W, y });
      y += c.hs[i] + NOTE_GAP;
    });
    bottom = Math.max(bottom, y - NOTE_GAP);
  }

  const onHeight = useCallback((key: string, h: number) => setHeights((m) => (m[key] === h ? m : { ...m, [key]: h })), []);
  const raise = useCallback((key: string) => setOrder((o) => [...o.filter((k) => k !== key), key]), []);
  const outline = (el: HTMLElement, on: boolean, color = 'var(--color-accent)') => {
    el.style.outline = on ? `2px solid ${color}` : '';
    el.style.outlineOffset = on ? '2px' : '';
  };

  return (
    <div>
      <div ref={stageRef} className="relative flex items-start gap-6" style={{ minHeight: wide ? bottom : undefined }}>
        <div ref={previewRef} className="min-w-0 flex-1" style={{ marginTop: lane }} onLoadCapture={measure} onScrollCapture={measure} onAnimationEndCapture={measure}>
          {children}
        </div>
        {chips.length > 0 && (
          <>
            <svg className="note-in pointer-events-none absolute inset-0 size-full overflow-visible" style={{ zIndex: 8 }} aria-hidden>
              {chips.map((c) => (
                <g key={c.key}>
                  <line x1={c.x + c.w / 2} y1={c.row * HINT_ROW + 26} x2={c.ax} y2={c.ay + lane} stroke="var(--color-accent)" strokeWidth={1.25} strokeOpacity={0.55} strokeDasharray="3 3" />
                  <circle cx={c.ax} cy={c.ay + lane} r={3.5} fill="var(--color-accent)" stroke="white" strokeWidth={1.5} />
                </g>
              ))}
            </svg>
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                tabIndex={-1}
                onPointerEnter={() => outline(c.el, true)}
                onPointerLeave={() => outline(c.el, false)}
                className="note-in btn btn-secondary btn-sm absolute z-[9] h-[26px] justify-start overflow-hidden font-mono text-[11px] text-body"
                style={{ left: c.x, top: c.row * HINT_ROW, width: c.w }}
                title={c.text}
              >
                <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                <span className="truncate">{c.text}</span>
              </button>
            ))}
          </>
        )}
        {wide && placed.length > 0 && <div className="shrink-0" style={{ width: GUTTER - 24 }} />}
        {wide &&
          shifted.map((p) => (
            <Note
              key={p.key}
              id={p.key}
              p={p}
              home={homes.get(p.key)!}
              bounds={{ w: size.w, h: Math.max(size.h + lane, bottom) }}
              z={20 + order.indexOf(p.key) + 1}
              onHeight={onHeight}
              raise={raise}
            />
          ))}
      </div>
      {!wide && placed.length > 0 && (
        <ul className="mt-3 space-y-2">
          {placed.map((p) => (
            <li key={p.key} className="flex gap-2 text-[12px]">
              <SeverityTag severity={p.issue.severity} />
              <span className="text-ink">{p.issue.message}</span>
            </li>
          ))}
        </ul>
      )}
      {footer && (
        <p className="mt-2 text-[11px] text-faint">
          {placed.length ? 'Drag notes aside to see the slot · double-click or Home to send one back' : 'No social-card issues in this preview.'}
          {missing > 0 && ` · ${missing} other issue${missing > 1 ? 's' : ''} not shown in this view`}
        </p>
      )}
    </div>
  );
}

function Note({ id, p, home, bounds, z, onHeight, raise }: { id: string; p: Placed; home: { x: number; y: number }; bounds: { w: number; h: number }; z: number; onHeight: (key: string, h: number) => void; raise: (key: string) => void }) {
  const noteRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  // Motion state lives in refs: it changes every frame and must not re-render.
  const m = useRef({ x: 0, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0, raf: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number; samples: Array<{ t: number; x: number; y: number }> } | null>(null);
  const live = useRef({ home, p, bounds });
  live.current = { home, p, bounds };
  const color = COLOR[p.issue.severity];

  const paint = useCallback(() => {
    const el = noteRef.current;
    if (!el) return;
    const { home, p } = live.current;
    const s = m.current;
    const x = home.x + s.x;
    const y = home.y + s.y;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${s.rot}deg)`;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const nx = clamp(p.ax, x, x + w);
    const ny = clamp(p.ay, y, y + h);
    const line = lineRef.current;
    const dot = dotRef.current;
    if (line && dot) {
      line.setAttribute('x1', String(nx));
      line.setAttribute('y1', String(ny));
      line.setAttribute('x2', String(p.ax));
      line.setAttribute('y2', String(p.ay));
      dot.setAttribute('cx', String(p.ax));
      dot.setAttribute('cy', String(p.ay));
    }
  }, []);

  useLayoutEffect(paint);

  useLayoutEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    onHeight(id, el.offsetHeight);
    const ro = new ResizeObserver(() => onHeight(id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, onHeight]);

  useEffect(() => () => cancelAnimationFrame(m.current.raf), []);

  /** Bounds for the note's offset so it stays inside the stage. */
  const limits = () => {
    const el = noteRef.current!;
    const { home, bounds } = live.current;
    return { minX: -home.x, maxX: bounds.w - el.offsetWidth - home.x, minY: -home.y, maxY: Math.max(0, bounds.h - el.offsetHeight - home.y) };
  };

  /** Spring the offset to a target (and the tilt back to 0), keeping current velocity. */
  const springTo = (tx: number, ty: number, cfg = SPRING) => {
    const s = m.current;
    cancelAnimationFrame(s.raf);
    let last = performance.now();
    const step = (now: number) => {
      let dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      // Fixed 4ms substeps keep the integration stable on slow frames.
      while (dt > 0) {
        const h = Math.min(0.004, dt);
        dt -= h;
        s.vx += (-cfg.k * (s.x - tx) - cfg.c * s.vx) * h;
        s.vy += (-cfg.k * (s.y - ty) - cfg.c * s.vy) * h;
        s.x += s.vx * h;
        s.y += s.vy * h;
        s.vrot += (-TILT.k * s.rot - TILT.c * s.vrot) * h;
        s.rot += s.vrot * h;
      }
      const settled = Math.abs(s.x - tx) < 0.3 && Math.abs(s.y - ty) < 0.3 && Math.hypot(s.vx, s.vy) < 4 && Math.abs(s.rot) < 0.05 && Math.abs(s.vrot) < 0.5;
      if (settled) Object.assign(s, { x: tx, y: ty, vx: 0, vy: 0, rot: 0, vrot: 0 });
      paint();
      if (!settled) s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  };

  const velocity = (now: number) => {
    const samples = drag.current?.samples.filter((q) => now - q.t < 80) ?? [];
    if (samples.length < 2) return { vx: 0, vy: 0 };
    const a = samples[0];
    const b = samples[samples.length - 1];
    const dt = (b.t - a.t) / 1000 || 1;
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
  };

  /** While dragging, spring the tilt toward the current horizontal velocity. */
  const tiltLoop = () => {
    const s = m.current;
    let last = performance.now();
    const step = (now: number) => {
      if (!drag.current) return;
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const target = clamp(velocity(now).vx / 90, -9, 9);
      s.vrot += (-TILT.k * (s.rot - target) - TILT.c * s.vrot) * dt;
      s.rot += s.vrot * dt;
      paint();
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  };

  const highlight = (on: boolean) => {
    const el = live.current.p.el;
    el.style.outline = on ? `2px solid ${color}` : '';
    el.style.outlineOffset = on ? '2px' : '';
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const s = m.current;
    cancelAnimationFrame(s.raf); // catch it mid-flight
    s.vx = s.vy = 0;
    drag.current = { px: e.clientX, py: e.clientY, ox: s.x, oy: s.y, samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
    raise(id);
    highlight(true);
    if (!reducedMotion()) tiltLoop();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const L = limits();
    const s = m.current;
    s.x = rubber(d.ox + e.clientX - d.px, L.minX, L.maxX);
    s.y = rubber(d.oy + e.clientY - d.py, L.minY, L.maxY);
    d.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    if (d.samples.length > 12) d.samples.shift();
    paint();
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const { vx, vy } = velocity(e.timeStamp);
    drag.current = null;
    highlight(false);
    const s = m.current;
    const L = limits();
    if (reducedMotion()) {
      cancelAnimationFrame(s.raf);
      Object.assign(s, { x: clamp(s.x, L.minX, L.maxX), y: clamp(s.y, L.minY, L.maxY), vx: 0, vy: 0, rot: 0, vrot: 0 });
      return paint();
    }
    // Throw: carry the release velocity a short way, then settle inside the stage.
    s.vx = vx;
    s.vy = vy;
    springTo(clamp(s.x + vx * 0.1, L.minX, L.maxX), clamp(s.y + vy * 0.1, L.minY, L.maxY));
  };

  const reset = () => {
    if (reducedMotion()) {
      Object.assign(m.current, { x: 0, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0 });
      return paint();
    }
    springTo(0, 0, SNAP);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (e.key === 'Home' || e.key === 'Escape') {
      e.preventDefault();
      return reset();
    }
    if (!d) return;
    e.preventDefault();
    const L = limits();
    const s = m.current;
    if (reducedMotion()) {
      Object.assign(s, { x: clamp(s.x + d[0], L.minX, L.maxX), y: clamp(s.y + d[1], L.minY, L.maxY) });
      return paint();
    }
    springTo(clamp(s.x + d[0], L.minX, L.maxX), clamp(s.y + d[1], L.minY, L.maxY), SNAP);
  };

  return (
    <>
      <svg className="note-in pointer-events-none absolute inset-0 size-full overflow-visible" style={{ zIndex: 10 }} aria-hidden>
        <line ref={lineRef} stroke={color} strokeWidth={1.5} strokeOpacity={0.75} />
        <circle ref={dotRef} r={4.5} fill={color} stroke="white" strokeWidth={2} />
      </svg>
      <div
        ref={noteRef}
        data-note
        tabIndex={0}
        role="group"
        aria-label={`${p.issue.severity}: ${p.issue.message}. Drag or use arrow keys to move, Home to reset.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
        onKeyDown={onKeyDown}
        onPointerEnter={() => highlight(true)}
        onPointerLeave={() => !drag.current && highlight(false)}
        onFocus={() => highlight(true)}
        onBlur={() => highlight(false)}
        className={cx(
          'note-in absolute top-0 left-0 cursor-grab touch-none rounded-md border border-line bg-panel p-2.5 text-[12px] shadow-pop select-none active:cursor-grabbing',
          'border-l-[3px] outline-offset-2 will-change-transform',
        )}
        style={{ width: NOTE_W, zIndex: z, borderLeftColor: color }}
      >
        <div className="flex items-center gap-2">
          <SeverityTag severity={p.issue.severity} />
          <code className="truncate text-[10px] text-faint">{p.issue.code}</code>
        </div>
        <p className="mt-1.5 leading-[17px] text-ink">{p.issue.message}</p>
        {p.issue.hint && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">{p.issue.hint}</p>}
      </div>
    </>
  );
}
