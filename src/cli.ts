import { defineCommand, runMain } from 'citty';
import { readFile } from 'node:fs/promises';
import { applyMetadataFix, type MetadataUpdates, type TargetFramework } from './core/fixers/index.js';
import { inspect } from './core/inspect.js';
import { c, formatReport } from './core/report-format.js';
import { analyzeSerp } from './core/validators/serp.js';
import { VERSION } from './version.js';

const writeJson = (data: unknown) => process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

const studio = defineCommand({
  meta: { name: 'studio', description: 'Start the visual dashboard (default command)' },
  args: {
    target: { type: 'positional', required: false, description: 'URL or path to inspect first (default: http://localhost:3000)' },
    port: { type: 'string', default: '4983', description: 'Dashboard port' },
    host: { type: 'string', default: '127.0.0.1', description: 'Interface to bind' },
    open: { type: 'boolean', default: false, description: 'Open the dashboard in a browser' },
  },
  async run({ args }) {
    const { startStudio } = await import('./server/studio.js');
    const target = args.target as string | undefined;
    const { url } = await startStudio({ port: Number(args.port), host: args.host, defaultTarget: target });
    const link = target ? `${url}/?target=${encodeURIComponent(target)}` : url;
    process.stdout.write(`\n  ${c.bold('head-studio')} ${c.dim(`v${VERSION}`)}\n\n  ${c.green('➜')}  Studio:  ${c.cyan(link)}\n  ${c.dim('Press Ctrl+C to stop')}\n\n`);
    if (args.open) openBrowser(link);
  },
});

const inspectCmd = defineCommand({
  meta: { name: 'inspect', description: 'Run a headless metadata inspection' },
  args: {
    target: { type: 'positional', required: false, description: 'URL or path (alternative to --url)' },
    url: { type: 'string', description: 'URL (http://localhost:3000/blog) or static path (./dist)' },
    route: { type: 'string', description: 'Route appended to the target, e.g. /blog/post-1' },
    root: { type: 'string', description: 'Static site root for resolving /absolute hrefs' },
    json: { type: 'boolean', default: false, description: 'Print a strict JSON report to stdout' },
    'fail-on': { type: 'string', default: 'none', description: 'Exit with code 1 on: error | warning | none' },
  },
  async run({ args }) {
    const target = (args.url as string | undefined) ?? (args.target as string | undefined);
    if (!target) {
      process.stderr.write('Missing target. Usage: head-studio inspect --url http://localhost:3000\n');
      process.exitCode = 2;
      return;
    }
    try {
      const report = await inspect(target, { route: args.route as string | undefined, root: args.root as string | undefined });
      if (args.json) writeJson(report);
      else process.stdout.write(formatReport(report));
      const failOn = String(args['fail-on']);
      if ((failOn === 'error' && report.summary.errors) || (failOn === 'warning' && report.summary.errors + report.summary.warnings)) process.exitCode = 1;
    } catch (err) {
      if (args.json) writeJson({ error: errMessage(err), target });
      else process.stderr.write(`${c.red('✖')} ${errMessage(err)}\n`);
      process.exitCode = 2;
    }
  },
});

const serpCmd = defineCommand({
  meta: { name: 'serp', description: 'Measure a title/description against Google SERP pixel limits' },
  args: {
    title: { type: 'string', default: '', description: 'Title text' },
    description: { type: 'string', default: '', description: 'Description text' },
    json: { type: 'boolean', default: false, description: 'Print JSON' },
  },
  run({ args }) {
    const r = analyzeSerp(args.title as string, args.description as string);
    if (args.json) return writeJson(r);
    for (const device of ['desktop', 'mobile'] as const) {
      const d = r[device];
      process.stdout.write(`${c.bold(device)}\n`);
      for (const [label, l] of [['title', d.title], ['desc', d.description]] as const) {
        process.stdout.write(`  ${label.padEnd(6)} ${l.truncated ? c.yellow(`${l.pixels}px`) : c.green(`${l.pixels}px`)} / ${l.limit}px  ${l.chars} chars${l.truncated ? c.yellow(`  → "${l.display}"`) : ''}\n`);
      }
    }
  },
});

const fixCmd = defineCommand({
  meta: { name: 'fix', description: 'Apply metadata updates to a source file (Next.js, Astro or HTML)' },
  args: {
    file: { type: 'positional', required: true, description: 'File to edit, e.g. app/layout.tsx' },
    framework: { type: 'string', description: 'nextjs | astro | html (auto-detected from the extension)' },
    updates: { type: 'string', description: 'JSON object of updates (Next.js Metadata shape), or @file.json' },
    title: { type: 'string', description: 'Shortcut for updates.title' },
    description: { type: 'string', description: 'Shortcut for updates.description' },
    'dry-run': { type: 'boolean', default: false, description: 'Show the diff without writing' },
    json: { type: 'boolean', default: false, description: 'Print JSON result' },
  },
  async run({ args }) {
    let updates: MetadataUpdates = {};
    try {
      const raw = args.updates as string | undefined;
      if (raw) updates = JSON.parse(raw.startsWith('@') ? await readFile(raw.slice(1), 'utf8') : raw) as MetadataUpdates;
    } catch (err) {
      process.stderr.write(`Invalid --updates JSON: ${errMessage(err)}\n`);
      process.exitCode = 2;
      return;
    }
    if (args.title) updates.title = args.title as string;
    if (args.description) updates.description = args.description as string;
    const result = await applyMetadataFix(args.file as string, args.framework as TargetFramework | undefined, updates, { dryRun: !!args['dry-run'] });
    if (args.json) writeJson(result);
    else if (!result.ok) process.stderr.write(`${c.red('✖')} ${result.error}\n`);
    else {
      process.stdout.write(`${result.diff || c.dim('No changes.')}\n`);
      for (const w of result.warnings) process.stdout.write(`${c.yellow('▲')} ${w}\n`);
      process.stdout.write(`${c.green('✔')} ${result.dryRun ? 'Would update' : 'Updated'} ${result.filePath} (${result.applied.join(', ') || 'nothing'})\n`);
    }
    if (!result.ok) process.exitCode = 1;
  },
});

const mcpCmd = defineCommand({
  meta: { name: 'mcp', description: 'Start the MCP server over stdio (Claude Code, Cursor, …)' },
  async run() {
    const { runMcpStdio } = await import('./server/mcp/index.js');
    await runMcpStdio();
  },
});

const subCommands = { studio, inspect: inspectCmd, serp: serpCmd, fix: fixCmd, mcp: mcpCmd };

const main = defineCommand({
  meta: { name: 'head-studio', version: VERSION, description: 'Audit and fix HTML <head> metadata: SERP, Open Graph, favicons, JSON-LD' },
  subCommands,
});

function openBrowser(url: string) {
  void import('node:child_process').then(({ spawn }) => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  });
}

// `npx head-studio` (no subcommand, or only flags/positional target) runs the studio.
const argv = process.argv.slice(2);
const first = argv.find((a) => !a.startsWith('-'));
const isMeta = argv.some((a) => a === '--help' || a === '-h' || a === '--version' || a === '-v');
if (!isMeta && (!first || !(first in subCommands))) {
  void runMain(studio, { rawArgs: argv });
} else {
  void runMain(main);
}
