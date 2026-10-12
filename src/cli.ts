import { defineCommand, runMain } from 'citty';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { applyMetadataFix, type MetadataUpdates, type TargetFramework } from './core/fixers/index.js';
import { inspect } from './core/inspect.js';
import { locateSource, type LocateResult } from './core/locate.js';
import { detectProject, guessTarget } from './core/project.js';
import { c, formatReport } from './core/report-format.js';
import { deepMerge } from './core/suggest.js';
import { summarizeReport } from './core/summary.js';
import type { InspectReport } from './core/types.js';
import { analyzeSerp } from './core/validators/serp.js';
import { AGENTS, applyPlan, detectAgents, planInit, serverCommand, type AgentId } from './integrations.js';
import { VERSION } from './version.js';

const out = (s = '') => process.stdout.write(`${s}\n`);
const err = (s = '') => process.stderr.write(`${s}\n`);
const writeJson = (data: unknown) => process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Resolve an explicit target, or fall back to the detected dev server / static build. */
async function resolveTarget(explicit: string | undefined, quiet: boolean): Promise<string | null> {
  if (explicit) return explicit;
  const guess = await guessTarget();
  if (guess.target && !quiet) err(c.dim(`› ${guess.reason}`));
  if (!guess.target) {
    err(`${c.red('✖')} No target given and ${guess.reason}.`);
    const hint = guess.project.devUrl ? `start it with ${c.cyan('npm run dev')} (expected at ${guess.project.devUrl}), or ` : '';
    err(`  ${hint}pass one explicitly: ${c.cyan('head-studio inspect --url http://localhost:3000')} or ${c.cyan('--url ./dist')}`);
  }
  return guess.target;
}

function nextSteps(report: InspectReport, located: LocateResult | null, route?: string): string {
  const lines: string[] = [];
  const file = located?.recommended?.file;
  const hasFix = Object.keys(report.suggestedUpdates).length > 0;
  if (!report.issues.some((i) => i.severity !== 'info')) return '';
  lines.push(c.bold('Next steps'));
  const label = (s: string) => c.dim(s.padEnd(12));
  if (file) lines.push(`  ${label('source')}${file} ${c.dim(`(${located!.recommended!.metadata})`)}`);
  if (hasFix) {
    const fixable = report.issues.filter((i) => i.fix).length;
    lines.push(`  ${label('auto-fix')}${fixable} issue(s): ${c.cyan(`head-studio fix ${file ?? '<file>'} --from ${shellQuote(report.target)}${route ? ` --route ${route}` : ''} --dry-run`)}`);
  }
  const manual = report.issues.filter((i) => !i.fix && i.severity !== 'info').length;
  if (manual) lines.push(`  ${label('judgement')}${manual} issue(s) need copy, assets or JSON-LD edits — test copy with ${c.cyan('head-studio serp --title … --description …')}`);
  lines.push(`  ${label('agents')}${c.cyan('head-studio init')} lets Claude Code / Cursor / VS Code run this loop for you`);
  return `${lines.join('\n')}\n`;
}

const studio = defineCommand({
  meta: { name: 'studio', description: 'Start the visual dashboard (default command)' },
  args: {
    target: { type: 'positional', required: false, description: 'URL or path to inspect first (default: auto-detect)' },
    port: { type: 'string', default: '4983', description: 'Dashboard port' },
    host: { type: 'string', default: '127.0.0.1', description: 'Interface to bind' },
    open: { type: 'boolean', default: false, description: 'Open the dashboard in a browser' },
  },
  async run({ args }) {
    const { startStudio } = await import('./server/studio.js');
    const target = (args.target as string | undefined) ?? (await guessTarget()).target ?? undefined;
    let started;
    try {
      started = await startStudio({ port: Number(args.port), host: args.host, defaultTarget: target });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      err(`${c.red('✖')} ${code === 'EADDRINUSE' ? `Port ${args.port} is in use — try ${c.cyan(`head-studio --port ${Number(args.port) + 1}`)}` : errMessage(e)}`);
      process.exitCode = 1;
      return;
    }
    const link = target ? `${started.url}/?target=${encodeURIComponent(target)}` : started.url;
    out(`\n  ${c.bold('head-studio')} ${c.dim(`v${VERSION}`)}\n`);
    out(`  ${c.blue('➜')}  studio   ${c.cyan(link)}`);
    out(`  ${c.dim('➜')}  target   ${target ?? c.dim('none detected — enter one in the UI')}`);
    out(`\n  ${c.dim('press ctrl+c to stop')}\n`);
    if (args.open) openBrowser(link);
  },
});

const inspectCmd = defineCommand({
  meta: { name: 'inspect', description: 'Audit a page headlessly (text, or --json for scripts and agents)' },
  args: {
    target: { type: 'positional', required: false, description: 'URL or path (default: auto-detect dev server / build)' },
    url: { type: 'string', description: 'Same as the positional target' },
    route: { type: 'string', description: 'Route appended to the target, e.g. /blog/post-1' },
    root: { type: 'string', description: 'Static site root for resolving /absolute hrefs' },
    json: { type: 'boolean', default: false, description: 'Print the JSON report to stdout (nothing else)' },
    summary: { type: 'boolean', default: false, description: 'With --json: compact, token-lean report' },
    'fail-on': { type: 'string', default: 'none', description: 'Exit 1 on: error | warning | none' },
  },
  async run({ args }) {
    const target = await resolveTarget((args.url as string | undefined) ?? (args.target as string | undefined), !!args.json);
    if (!target) return void (process.exitCode = 2);
    try {
      const report = await inspect(target, { route: args.route as string | undefined, root: args.root as string | undefined });
      if (args.json) writeJson(args.summary ? summarizeReport(report) : report);
      else {
        process.stdout.write(formatReport(report));
        let located: LocateResult | null = null;
        try {
          located = locateSource(report.url);
        } catch {
          // not inside a project
        }
        process.stdout.write(nextSteps(report, located, args.route as string | undefined));
      }
      const failOn = String(args['fail-on']);
      if ((failOn === 'error' && report.summary.errors) || (failOn === 'warning' && report.summary.errors + report.summary.warnings)) process.exitCode = 1;
    } catch (e) {
      if (args.json) writeJson({ error: errMessage(e), target });
      else err(`${c.red('✖')} ${errMessage(e)}`);
      process.exitCode = 2;
    }
  },
});

const locateCmd = defineCommand({
  meta: { name: 'locate', description: 'Find the source file that owns a route’s metadata' },
  args: {
    route: { type: 'positional', required: false, description: 'Route or URL (default: /)' },
    json: { type: 'boolean', default: false, description: 'Print JSON' },
  },
  run({ args }) {
    const result = locateSource((args.route as string | undefined) ?? '/');
    if (args.json) return writeJson(result);
    out(`${c.bold(result.route)} ${c.dim(`· ${result.framework}`)}`);
    if (!result.candidates.length) out(`  ${c.yellow('▲')} no source found`);
    for (const cand of result.candidates) {
      const star = cand === result.recommended ? c.green('★') : ' ';
      out(`  ${star} ${cand.file.padEnd(40)} ${c.dim(`${cand.role} · ${cand.metadata}`)}`);
      if (cand.note) out(`    ${c.dim(cand.note)}`);
    }
    for (const n of result.notes) out(`  ${c.yellow('▲')} ${n}`);
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
      out(c.bold(device));
      for (const [label, l] of [['title', d.title], ['desc', d.description]] as const) {
        const bar = '█'.repeat(Math.min(20, Math.round((l.pixels / l.limit) * 20))).padEnd(20, '░');
        out(`  ${label.padEnd(6)} ${l.truncated ? c.yellow(bar) : c.green(bar)} ${String(Math.round(l.pixels)).padStart(4)}/${l.limit}px  ${l.chars} chars${l.truncated ? c.yellow(`\n         → "${l.display}"`) : ''}`);
      }
    }
  },
});

async function readUpdates(raw: string | undefined): Promise<MetadataUpdates> {
  if (!raw) return {};
  if (raw === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    raw = Buffer.concat(chunks).toString('utf8');
  } else if (raw.startsWith('@')) {
    raw = await readFile(raw.slice(1), 'utf8');
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // Accept a full inspect report (uses its suggestedUpdates) as well as a bare updates object.
  return (parsed.suggestedUpdates && parsed.schemaVersion ? parsed.suggestedUpdates : parsed) as MetadataUpdates;
}

const fixCmd = defineCommand({
  meta: { name: 'fix', description: 'Write metadata to a source file (Next.js, Astro or HTML)' },
  args: {
    file: { type: 'positional', required: false, description: 'File to edit (default: located from --route)' },
    route: { type: 'string', description: 'Locate the file for this route instead of passing one' },
    from: { type: 'string', description: 'Inspect this URL/path and apply its suggestedUpdates' },
    updates: { type: 'string', description: 'JSON updates (Next.js Metadata shape), @file.json, or - for stdin' },
    title: { type: 'string', description: 'Shortcut for updates.title' },
    description: { type: 'string', description: 'Shortcut for updates.description' },
    framework: { type: 'string', description: 'nextjs | astro | html (default: detected)' },
    'dry-run': { type: 'boolean', default: false, description: 'Show the diff without writing' },
    json: { type: 'boolean', default: false, description: 'Print the JSON result' },
  },
  async run({ args }) {
    let updates: MetadataUpdates = {};
    try {
      if (args.from) {
        const report = await inspect(String(args.from), { route: args.route as string | undefined });
        updates = report.suggestedUpdates as MetadataUpdates;
        if (!args.json) err(c.dim(`› ${Object.keys(updates).length ? `using suggestedUpdates from ${report.url}` : `no auto-fixable issues on ${report.url}`}`));
      }
      updates = deepMerge(updates, await readUpdates(args.updates as string | undefined)) as MetadataUpdates;
    } catch (e) {
      err(`${c.red('✖')} ${errMessage(e)}`);
      return void (process.exitCode = 2);
    }
    if (args.title) updates.title = String(args.title);
    if (args.description) updates.description = String(args.description);
    if (!Object.keys(updates).length) {
      err(`${c.yellow('▲')} Nothing to apply. Pass --updates, --title/--description, or --from <url>.`);
      return void (process.exitCode = 2);
    }

    let file = args.file as string | undefined;
    if (!file) {
      const located = locateSource(String(args.route ?? '/'));
      file = located.recommended?.file;
      if (!file) {
        err(`${c.red('✖')} Could not locate a source file for ${located.route}. ${located.notes.join(' ')}`);
        return void (process.exitCode = 2);
      }
      if (!args.json) err(c.dim(`› editing ${file} (${located.recommended!.metadata})`));
    }
    const framework = (args.framework as TargetFramework | undefined) ?? (/\.astro$/.test(file) ? 'astro' : /\.html?$/.test(file) ? 'html' : detectProject().fixFramework);
    const result = await applyMetadataFix(file, framework, updates, { dryRun: !!args['dry-run'] });
    if (args.json) writeJson(result);
    else if (!result.ok) err(`${c.red('✖')} ${result.error}`);
    else {
      out(result.diff ? colorDiff(result.diff) : c.dim('No changes.'));
      for (const w of result.warnings) out(`${c.yellow('▲')} ${w}`);
      out(`${c.green('✔')} ${result.dryRun ? 'Would update' : 'Updated'} ${result.filePath} ${c.dim(`(${result.applied.join(', ') || 'nothing'})`)}`);
      if (result.dryRun && result.changed) out(c.dim('  re-run without --dry-run to write the file'));
    }
    if (!result.ok) process.exitCode = 1;
  },
});

const colorDiff = (diff: string) =>
  diff
    .split('\n')
    .map((l) => (l.startsWith('+') && !l.startsWith('+++') ? c.green(l) : l.startsWith('-') && !l.startsWith('---') ? c.red(l) : l.startsWith('@@') ? c.cyan(l) : c.dim(l)))
    .join('\n');

const initCmd = defineCommand({
  meta: { name: 'init', description: 'Connect your coding agent: register the MCP server and install the skill' },
  args: {
    agent: { type: 'string', description: 'claude, cursor, vscode, all — comma separated (default: detected, else claude)' },
    'dry-run': { type: 'boolean', default: false, description: 'Show what would be written' },
    skill: { type: 'boolean', default: true, description: 'Also install SKILL.md / rules (use --no-skill to skip)' },
    npx: { type: 'boolean', default: false, description: 'Launch the server with npx head-studio@latest (default when installed from npm)' },
    local: { type: 'boolean', default: false, description: 'Launch the server from this checkout (default when cloned/linked)' },
  },
  async run({ args }) {
    const root = process.cwd();
    const requested = String(args.agent ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const agents = (requested.includes('all') ? (Object.keys(AGENTS) as AgentId[]) : requested.length ? requested : detectAgents(root)) as AgentId[];
    const unknown = agents.filter((a) => !(a in AGENTS));
    if (unknown.length) {
      err(`${c.red('✖')} Unknown agent(s): ${unknown.join(', ')} (expected ${Object.keys(AGENTS).join(', ')}, all)`);
      return void (process.exitCode = 2);
    }
    const cmd = serverCommand(args.npx ? 'npx' : args.local ? 'local' : undefined);
    let plans;
    try {
      plans = await planInit(root, agents, cmd, args.skill !== false);
    } catch (e) {
      err(`${c.red('✖')} ${errMessage(e)}`);
      return void (process.exitCode = 1);
    }
    if (!args['dry-run']) await applyPlan(plans);

    const project = detectProject(root);
    out(`\n  ${c.bold('head-studio init')} ${c.dim(`· ${project.framework}${project.name ? ` · ${project.name}` : ''}`)}\n`);
    for (const p of plans) {
      const mark = p.action === 'unchanged' ? c.dim('=') : args['dry-run'] ? c.yellow('~') : c.green('✔');
      out(`  ${mark} ${path.relative(root, p.file).padEnd(48)} ${c.dim(`${AGENTS[p.agent].label} · ${p.kind}${p.action === 'unchanged' ? ' · up to date' : ` · ${p.action}`}`)}`);
    }
    out(`\n  ${c.dim('server')}  ${cmd.command} ${cmd.args.join(' ')} ${c.dim(`(${cmd.mode})`)}`);
    if (args['dry-run']) out(`\n  ${c.yellow('dry run')} — nothing written.`);
    out(`\n  ${c.bold('Next')}`);
    if (agents.includes('claude')) out(`  ${c.dim('claude')}   restart Claude Code in this folder, approve the "head-studio" server, then try:\n           ${c.cyan('/mcp__head-studio__audit')}  or  "audit the metadata of /blog"`);
    if (agents.includes('cursor')) out(`  ${c.dim('cursor')}   enable head-studio under Settings → MCP`);
    if (agents.includes('vscode')) out(`  ${c.dim('vscode')}   start the server from .vscode/mcp.json (Copilot agent mode)`);
    const others = (Object.keys(AGENTS) as AgentId[]).filter((a) => !agents.includes(a));
    if (others.length) out(`  ${c.dim('more')}     ${others.map((a) => c.cyan(`--agent ${a}`)).join(', ')} ${c.dim('to also configure ' + others.map((a) => AGENTS[a].label).join(', '))}`);
    out(`  ${c.dim('check')}    ${c.cyan('head-studio doctor')}\n`);
  },
});

const doctorCmd = defineCommand({
  meta: { name: 'doctor', description: 'Show what head-studio detects in this project' },
  args: { json: { type: 'boolean', default: false, description: 'Print JSON' } },
  async run({ args }) {
    const guess = await guessTarget();
    const p = guess.project;
    const located = locateSource('/');
    const agents = (Object.keys(AGENTS) as AgentId[]).map((id) => ({ id, label: AGENTS[id].label, configured: configured(id) }));
    if (args.json) return writeJson({ version: VERSION, node: process.version, project: p, target: guess.target, reason: guess.reason, homeSource: located.recommended, agents });
    const ok = (b: boolean) => (b ? c.green('✔') : c.yellow('▲'));
    out(`\n  ${c.bold('head-studio doctor')} ${c.dim(`v${VERSION} · node ${process.version}`)}\n`);
    out(`  ${ok(p.framework !== 'unknown')} ${'framework'.padEnd(18)} ${p.framework}${p.appDir ? c.dim(` (app router: ${path.relative(p.root, p.appDir)})`) : ''}`);
    out(`  ${ok(!!guess.target)} ${'target'.padEnd(18)} ${guess.target ?? c.dim('none')} ${c.dim(`— ${guess.reason}`)}`);
    out(`  ${ok(!!located.recommended)} ${'home source'.padEnd(18)} ${located.recommended?.file ?? c.dim('not found')}${located.recommended ? c.dim(` (${located.recommended.metadata})`) : ''}`);
    for (const n of located.notes) out(`  ${' '.repeat(21)}${c.dim(n)}`);
    for (const a of agents) out(`  ${ok(a.configured)} ${a.label.padEnd(18)} ${a.configured ? 'MCP server registered' : c.dim(`not configured — head-studio init --agent ${a.id}`)}`);
    out('');
  },
});

function configured(agent: AgentId): boolean {
  const file = { claude: '.mcp.json', cursor: '.cursor/mcp.json', vscode: '.vscode/mcp.json' }[agent];
  try {
    return readFileSync(path.join(process.cwd(), file), 'utf8').includes('"head-studio"');
  } catch {
    return false;
  }
}

const mcpCmd = defineCommand({
  meta: { name: 'mcp', description: 'Run the MCP server over stdio (used by agents; see `init`)' },
  async run() {
    const { runMcpStdio } = await import('./server/mcp/index.js');
    await runMcpStdio();
  },
});

const subCommands = { studio, inspect: inspectCmd, locate: locateCmd, serp: serpCmd, fix: fixCmd, init: initCmd, doctor: doctorCmd, mcp: mcpCmd };

const main = defineCommand({
  meta: { name: 'head-studio', version: VERSION, description: 'Audit and fix HTML <head> metadata — SERP, Open Graph, favicons, JSON-LD' },
  subCommands,
});

function openBrowser(url: string) {
  void import('node:child_process').then(({ spawn }) => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const a = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(cmd, a, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
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
