/** Minimal unified diff (LCS-based) for previewing fixer output. */
export function unifiedDiff(a: string, b: string, file = 'file', context = 3): string {
  if (a === b) return '';
  const x = a.split('\n');
  const y = b.split('\n');
  // Trim common prefix/suffix to keep the LCS table small.
  let pre = 0;
  while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  const xs = x.slice(pre, x.length - suf);
  const ys = y.slice(pre, y.length - suf);

  type Op = { t: ' ' | '-' | '+'; line: string };
  let ops: Op[];
  if (xs.length * ys.length > 4_000_000) {
    ops = [...xs.map((line) => ({ t: '-' as const, line })), ...ys.map((line) => ({ t: '+' as const, line }))];
  } else {
    const m = xs.length;
    const n = ys.length;
    const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = xs[i] === ys[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    ops = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (xs[i] === ys[j]) (ops.push({ t: ' ', line: xs[i] }), i++, j++);
      else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ t: '-', line: xs[i++] });
      else ops.push({ t: '+', line: ys[j++] });
    }
    while (i < m) ops.push({ t: '-', line: xs[i++] });
    while (j < n) ops.push({ t: '+', line: ys[j++] });
  }

  const before = x.slice(Math.max(0, pre - context), pre).map((line) => ({ t: ' ' as const, line }));
  const after = x.slice(x.length - suf, x.length - suf + context).map((line) => ({ t: ' ' as const, line }));
  const all = [...before, ...ops, ...after];
  const startA = pre - before.length + 1;
  const lenA = all.filter((o) => o.t !== '+').length;
  const lenB = all.filter((o) => o.t !== '-').length;
  return [`--- a/${file}`, `+++ b/${file}`, `@@ -${startA},${lenA} +${startA},${lenB} @@`, ...all.map((o) => `${o.t}${o.line}`)].join('\n');
}
