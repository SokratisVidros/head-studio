import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AgentId = 'claude' | 'cursor' | 'vscode';

export const AGENTS: Record<AgentId, { label: string; detect: string[] }> = {
  claude: { label: 'Claude Code', detect: ['.claude', 'CLAUDE.md', '.mcp.json'] },
  cursor: { label: 'Cursor', detect: ['.cursor', '.cursorrules'] },
  vscode: { label: 'VS Code (Copilot)', detect: ['.vscode'] },
};

export interface ServerCommand {
  command: string;
  args: string[];
  /** `npx` for the published package, `local` for a linked/cloned checkout. */
  mode: 'npx' | 'local';
}

/** How agents should launch the MCP server: via npx when installed from npm, else this checkout's bin. */
export function serverCommand(mode?: 'npx' | 'local'): ServerCommand {
  const bin = fileURLToPath(new URL('../bin/cli.mjs', import.meta.url));
  const fromRegistry = /[\\/](node_modules|_npx)[\\/]/.test(bin);
  const chosen = mode ?? (fromRegistry ? 'npx' : 'local');
  return chosen === 'npx' ? { command: 'npx', args: ['-y', 'head-studio@latest', 'mcp'], mode: 'npx' } : { command: 'node', args: [bin, 'mcp'], mode: 'local' };
}

export function skillPath(): string {
  return fileURLToPath(new URL('../SKILL.md', import.meta.url));
}

export function detectAgents(root: string): AgentId[] {
  const found = (Object.keys(AGENTS) as AgentId[]).filter((id) => AGENTS[id].detect.some((f) => existsSync(path.join(root, f))));
  return found.length ? found : ['claude'];
}

export interface PlannedWrite {
  agent: AgentId;
  file: string;
  action: 'create' | 'update' | 'unchanged';
  kind: 'mcp' | 'skill' | 'rules';
  content: string;
}

async function readJsonFile(file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`${file} is not valid JSON; fix it or remove it before running init.`);
  }
}

async function planJson(agent: AgentId, file: string, key: 'mcpServers' | 'servers', entry: Record<string, unknown>): Promise<PlannedWrite> {
  const existing = await readJsonFile(file);
  const servers = { ...((existing[key] as Record<string, unknown>) ?? {}), 'head-studio': entry };
  const next = { ...existing, [key]: servers };
  const content = `${JSON.stringify(next, null, 2)}\n`;
  const before = existsSync(file) ? await readFile(file, 'utf8') : null;
  return { agent, file, kind: 'mcp', content, action: before == null ? 'create' : before === content ? 'unchanged' : 'update' };
}

async function planText(agent: AgentId, file: string, kind: PlannedWrite['kind'], content: string): Promise<PlannedWrite> {
  const before = existsSync(file) ? await readFile(file, 'utf8') : null;
  return { agent, file, kind, content, action: before == null ? 'create' : before === content ? 'unchanged' : 'update' };
}

/** Compute the files `head-studio init` writes for each agent (MCP registration + skill/rules). */
export async function planInit(root: string, agents: AgentId[], cmd: ServerCommand, withSkill = true): Promise<PlannedWrite[]> {
  const skill = await readFile(skillPath(), 'utf8');
  const skillBody = skill.replace(/^---[\s\S]*?---\s*/, '');
  const description = skill.match(/^description:\s*(.+)$/m)?.[1] ?? 'Audit and fix <head> metadata with head-studio.';
  const stdio = { command: cmd.command, args: cmd.args };
  const plans: PlannedWrite[] = [];
  for (const agent of agents) {
    if (agent === 'claude') {
      plans.push(await planJson(agent, path.join(root, '.mcp.json'), 'mcpServers', stdio));
      if (withSkill) plans.push(await planText(agent, path.join(root, '.claude/skills/head-studio/SKILL.md'), 'skill', skill));
    } else if (agent === 'cursor') {
      plans.push(await planJson(agent, path.join(root, '.cursor/mcp.json'), 'mcpServers', stdio));
      if (withSkill) plans.push(await planText(agent, path.join(root, '.cursor/rules/head-studio.mdc'), 'rules', `---\ndescription: ${description}\nalwaysApply: false\n---\n\n${skillBody}`));
    } else if (agent === 'vscode') {
      plans.push(await planJson(agent, path.join(root, '.vscode/mcp.json'), 'servers', { type: 'stdio', ...stdio }));
      if (withSkill) plans.push(await planText(agent, path.join(root, '.github/instructions/head-studio.instructions.md'), 'rules', `---\napplyTo: '**'\ndescription: ${description}\n---\n\n${skillBody}`));
    }
  }
  return plans;
}

export async function applyPlan(plans: PlannedWrite[]): Promise<void> {
  for (const p of plans) {
    if (p.action === 'unchanged') continue;
    await mkdir(path.dirname(p.file), { recursive: true });
    await writeFile(p.file, p.content, 'utf8');
  }
}
