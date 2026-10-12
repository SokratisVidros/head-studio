import { describe, expect, it } from 'vitest';
import { analyzeLine, analyzeSerp, measureText, SERP_PROFILES } from '../src/core/validators/serp.js';

describe('measureText', () => {
  it('uses Arial advance widths', () => {
    // "Hi" = H(722) + i(222) = 944 units → 18.88px at 20px
    expect(measureText('Hi', 20)).toBeCloseTo(18.9, 1);
    expect(measureText('', 20)).toBe(0);
  });
  it('treats CJK and emoji as full-width', () => {
    expect(measureText('日本', 10)).toBe(20);
  });
  it('approximates accented letters by their base glyph', () => {
    expect(measureText('é', 20)).toBe(measureText('e', 20));
  });
});

describe('analyzeSerp', () => {
  it('flags long titles and produces a truncated display', () => {
    const title = 'How we landed our first orbital-class booster on a drone ship in the middle of the Atlantic Ocean';
    const r = analyzeSerp(title, 'Short description');
    expect(r.desktop.title.truncated).toBe(true);
    expect(r.desktop.title.display.endsWith(' ...')).toBe(true);
    expect(measureText(r.desktop.title.display, 20)).toBeLessThanOrEqual(SERP_PROFILES.desktop.title.limit);
    expect(r.desktop.description.truncated).toBe(false);
  });
  it('keeps short titles intact', () => {
    const line = analyzeLine('Acme Rockets', SERP_PROFILES.desktop.title);
    expect(line).toMatchObject({ truncated: false, display: 'Acme Rockets', chars: 12, limit: 600 });
  });
  it('normalizes whitespace', () => {
    expect(analyzeLine('  a \n  b ', SERP_PROFILES.desktop.title).text).toBe('a b');
  });
});
