import type { SerpDeviceResult, SerpLine, SerpReport } from '../types.js';

/**
 * Arial advance widths in 1/1000 em (from the standard Helvetica/Arial AFM metrics).
 * Google renders SERP titles and snippets in Arial, so these give pixel-accurate estimates
 * without needing a canvas. This module is pure and shared by the Node engine and the UI.
 */
const ARIAL: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333,
  '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, '0': 556, '1': 556, '2': 556, '3': 556,
  '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584,
  '>': 584, '?': 556, '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556,
  '`': 333, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500,
  l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722,
  x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584,
  '–': 556, '—': 1000, '‘': 222, '’': 222, '“': 333, '”': 333, '•': 350, '…': 1000, '·': 278,
  '«': 556, '»': 556, '©': 737, '®': 737, '™': 1000, '€': 556, '£': 556, '¥': 556, '°': 400,
};

/** Bold weights are used for the title in some layouts; Google titles are regular weight. */
const DEFAULT_WIDTH = 556;

function charWidth(ch: string): number {
  const known = ARIAL[ch];
  if (known != null) return known;
  const cp = ch.codePointAt(0) ?? 0;
  // Latin-1 supplement / Latin extended letters (é, ñ, ü...) approximate their base glyph.
  const base = ch.normalize('NFD')[0];
  if (base !== ch && ARIAL[base] != null) return ARIAL[base];
  // CJK, Hangul, full-width forms and emoji are roughly one em wide.
  if (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    cp >= 0x1f000
  ) {
    return 1000;
  }
  // Combining marks take no space.
  if (cp >= 0x0300 && cp <= 0x036f) return 0;
  return DEFAULT_WIDTH;
}

export function measureText(text: string, fontSizePx: number): number {
  let units = 0;
  for (const ch of text) units += charWidth(ch);
  return Math.round(((units * fontSizePx) / 1000) * 10) / 10;
}

export interface SerpLineProfile {
  fontSize: number;
  limit: number;
}

export interface SerpProfile {
  title: SerpLineProfile;
  description: SerpLineProfile;
}

/**
 * Approximate Google SERP limits. Desktop: titles 20px Arial in a ~600px column, snippets 14px
 * Arial over two lines (~960px). Mobile: titles wrap over two lines of a narrower card, snippets
 * are truncated earlier (~680px of text).
 */
export const SERP_PROFILES: Record<'desktop' | 'mobile', SerpProfile> = {
  desktop: { title: { fontSize: 20, limit: 600 }, description: { fontSize: 14, limit: 960 } },
  mobile: { title: { fontSize: 20, limit: 640 }, description: { fontSize: 14, limit: 680 } },
};

const ELLIPSIS = ' ...';

export function analyzeLine(input: string | null | undefined, profile: SerpLineProfile): SerpLine {
  const text = (input ?? '').replace(/\s+/g, ' ').trim();
  const pixels = measureText(text, profile.fontSize);
  const truncated = pixels > profile.limit;
  return {
    text,
    chars: [...text].length,
    pixels,
    limit: profile.limit,
    truncated,
    display: truncated ? truncateToWidth(text, profile) : text,
  };
}

/** Truncate on a word boundary, leaving room for Google's " ..." suffix. */
export function truncateToWidth(text: string, profile: SerpLineProfile): string {
  const budget = profile.limit - measureText(ELLIPSIS, profile.fontSize);
  let used = 0;
  let cut = 0;
  let lastSpace = -1;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const w = (charWidth(chars[i]) * profile.fontSize) / 1000;
    if (used + w > budget) break;
    used += w;
    cut = i + 1;
    if (chars[i] === ' ') lastSpace = i;
  }
  const end = lastSpace > cut * 0.6 ? lastSpace : cut;
  return chars.slice(0, end).join('').replace(/[\s,;:–—-]+$/, '') + ELLIPSIS;
}

export function analyzeDevice(title: string | null | undefined, description: string | null | undefined, profile: SerpProfile): SerpDeviceResult {
  return { title: analyzeLine(title, profile.title), description: analyzeLine(description, profile.description) };
}

export function analyzeSerp(title: string | null | undefined, description: string | null | undefined): SerpReport {
  return {
    desktop: analyzeDevice(title, description, SERP_PROFILES.desktop),
    mobile: analyzeDevice(title, description, SERP_PROFILES.mobile),
  };
}
