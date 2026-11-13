import { useEffect, useRef, useState } from 'react';
import { isEditing } from './components/ui';

/*
 * Arrow-key navigation across nested tabs, using only arrows, Enter, Space and Esc.
 *
 *   level -1 (sections)  ↑/↓ switch section · Enter / Space / → step into the section's tab rows
 *   level  n (tab row)   ←/→ switch tab · Space next tab · ↑/↓ previous/next row (↑ from the
 *                        first row returns to sections) · Enter next row · Esc back to sections
 *
 * Rows are discovered from the DOM: every `[data-kbd-row]` inside <main> (segmented
 * controls), ordered by their numeric value, then document order. Selection changes by
 * clicking the target button programmatically, so focus never moves and no focus ring
 * appears. The active level gets a soft `[data-kbd-active]` marker only in keyboard mode.
 */

function rows(): HTMLElement[] {
  const main = document.querySelector('main');
  if (!main) return [];
  return [...main.querySelectorAll<HTMLElement>('[data-kbd-row]')]
    .filter((el) => el.offsetParent !== null)
    .map((el, i) => ({ el, i, order: Number(el.dataset.kbdRow) || 0 }))
    .sort((a, b) => a.order - b.order || a.i - b.i)
    .map((r) => r.el);
}

function mark(level: number | null) {
  document.querySelectorAll('[data-kbd-active]').forEach((el) => el.removeAttribute('data-kbd-active'));
  if (level === null) return;
  const target = level < 0 ? document.querySelector('[data-kbd-sections]') : rows()[level];
  target?.setAttribute('data-kbd-active', '');
}

/** Select the previous/next option in a row by clicking it (wraps). */
function step(row: HTMLElement, delta: number) {
  const buttons = [...row.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  if (!buttons.length) return;
  const at = buttons.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
  buttons[(at + delta + buttons.length) % buttons.length].click();
}

/** Enter/Space should still press a focused button or link (e.g. reached with Tab). */
const nativeActivation = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('button, a, summary, [role="button"]') && !el.closest('[data-kbd-sections]');
};

export function useKeyNav({ sections, current, select, disabled }: { sections: readonly string[]; current: string; select: (id: string) => void; disabled: boolean }) {
  const level = useRef(-1);
  const [keyboard, setKeyboard] = useState(false);
  const live = useRef({ sections, current, select, disabled });
  live.current = { sections, current, select, disabled };

  // Re-mark after React has re-rendered (rows can appear, disappear or move).
  const remark = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    const n = rows().length;
    if (level.current >= n) level.current = n - 1;
    mark(level.current);
  }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { sections, current, select, disabled } = live.current;
      if (disabled || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isEditing(e.target)) return;
      const k = e.key;
      const rs = rows();
      if (level.current >= rs.length) level.current = rs.length - 1;
      const handled = () => {
        e.preventDefault();
        setKeyboard(true);
        remark();
      };

      if (level.current < 0) {
        const i = sections.indexOf(current);
        if (k === 'ArrowDown' || k === 'ArrowUp') {
          select(sections[(i + (k === 'ArrowDown' ? 1 : -1) + sections.length) % sections.length]);
          return handled();
        }
        if (k === 'ArrowRight' || ((k === 'Enter' || k === ' ') && !nativeActivation(e.target))) {
          if (rs.length) level.current = 0;
          return handled();
        }
        return;
      }

      const row = rs[level.current];
      if (k === 'ArrowLeft' || k === 'ArrowRight') step(row, k === 'ArrowRight' ? 1 : -1);
      else if (k === ' ' && !nativeActivation(e.target)) step(row, 1);
      else if (k === 'ArrowDown' || (k === 'Enter' && !nativeActivation(e.target))) level.current = Math.min(level.current + 1, rs.length - 1);
      else if (k === 'ArrowUp') level.current -= 1;
      else if (k === 'Escape') level.current = -1;
      else return;
      handled();
    };
    // Any pointer use leaves keyboard mode and hides the markers.
    const onPointer = () => {
      setKeyboard(false);
      mark(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);

  // A section change made with the mouse starts again at the sections level.
  useEffect(() => {
    if (!keyboard) level.current = -1;
  }, [current, keyboard]);

  return { keyboard };
}
