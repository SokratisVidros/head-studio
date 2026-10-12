import type { InspectReport, Issue } from './types.js';

const useColor = () => !!process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  cyan: wrap('36'),
};

const ICON: Record<Issue['severity'], string> = { error: '✖', warning: '▲', info: '•' };
const COLOR: Record<Issue['severity'], (s: string) => string> = { error: c.red, warning: c.yellow, info: c.dim };

const line = (label: string, value: string | null | undefined) => `  ${c.dim(label.padEnd(14))} ${value ?? c.red('(missing)')}`;

/** Human-readable report for terminals. */
export function formatReport(r: InspectReport): string {
  const out: string[] = [];
  const { errors, warnings, infos, score } = r.summary;
  const scoreColor = score >= 90 ? c.green : score >= 60 ? c.yellow : c.red;
  out.push('', `${c.bold('head-studio')} ${c.dim('›')} ${r.url}${r.status ? c.dim(` (HTTP ${r.status})`) : ''}`);
  out.push(`${scoreColor(c.bold(`Score ${score}/100`))}  ${c.red(`${errors} errors`)}  ${c.yellow(`${warnings} warnings`)}  ${c.dim(`${infos} notices`)}  ${c.dim(`${r.timingMs}ms`)}`, '');

  out.push(c.bold('Meta'));
  out.push(line('title', r.meta.title), line('description', r.meta.description), line('canonical', r.meta.canonical), line('robots', r.meta.robots ?? c.dim('(default: index, follow)')), '');

  out.push(c.bold('SERP preview'));
  for (const device of ['desktop', 'mobile'] as const) {
    const d = r.serp[device];
    const fmt = (l: typeof d.title) => `${l.truncated ? c.yellow(`${l.pixels}px`) : c.green(`${l.pixels}px`)} / ${l.limit}px, ${l.chars} chars${l.truncated ? c.yellow(' — truncated') : ''}`;
    out.push(`  ${c.dim(device.padEnd(14))} title ${fmt(d.title)}`, `  ${' '.repeat(14)} desc  ${fmt(d.description)}`);
  }
  out.push('');

  out.push(c.bold('Open Graph'));
  const og = r.openGraph;
  out.push(line('og:title', og.title), line('og:description', og.description), line('og:image', og.image));
  if (og.imageCheck) out.push(`  ${' '.repeat(14)} ${og.imageCheck.ok ? `${og.imageCheck.width}×${og.imageCheck.height}` : c.red(og.imageCheck.error ?? 'unreachable')}`);
  out.push(line('twitter:card', r.twitter.card), '');

  out.push(c.bold('Favicons'));
  for (const row of r.favicons.grid) {
    const mark = row.status === 'pass' ? c.green('✔') : row.status === 'warn' ? c.yellow('▲') : c.red('✖');
    out.push(`  ${mark} ${row.label.padEnd(22)} ${c.dim(row.href ?? '')} ${row.note ? c.dim(`— ${row.note}`) : ''}`);
  }
  out.push('');

  out.push(c.bold('JSON-LD'));
  if (!r.jsonLd.length) out.push(`  ${c.dim('none')}`);
  for (const b of r.jsonLd) {
    out.push(`  #${b.index + 1} ${b.valid ? b.entities.map((e) => e.type.join('/')).join(', ') || c.dim('(no @type)') : c.red('invalid JSON')}`);
  }
  out.push('');

  if (r.issues.length) {
    out.push(c.bold('Issues'));
    for (const i of r.issues) {
      out.push(`  ${COLOR[i.severity](ICON[i.severity])} ${i.message} ${c.dim(`[${i.code}]`)}`);
      if (i.hint) out.push(`    ${c.dim(i.hint)}`);
    }
  } else {
    out.push(c.green('No issues found.'));
  }
  out.push('');
  return out.join('\n');
}
