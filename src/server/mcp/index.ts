import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VERSION } from '../../version.js';
import { registerPrompts, registerTools, type ToolOptions } from './tools.js';

export const SERVER_INSTRUCTIONS = `head-studio audits and fixes HTML <head> metadata (SERP title/description, canonical, robots, Open Graph & X cards, favicons, JSON-LD) for the project in the current working directory.

Loop: inspect_route (url optional — auto-detects the dev server or build) → locate_source (route → file) → validate_serp_snippet (for any copy you write) → apply_metadata_fix (dryRun first; pass suggestedUpdates and your copy in the Next.js Metadata shape) → inspect_route again to verify.
Rules: never invent facts, URLs or images; keep generateMetadata values dynamic; favicon files and JSON-LD bodies are edited directly, not via apply_metadata_fix.`;

export function createMcpServer(opts: ToolOptions = {}): McpServer {
  const server = new McpServer({ name: 'head-studio', version: VERSION }, { instructions: SERVER_INSTRUCTIONS });
  registerTools(server, opts);
  registerPrompts(server);
  return server;
}

/** Run the MCP server over stdio. stdout is reserved for JSON-RPC; logs go to stderr. */
export async function runMcpStdio(opts: ToolOptions = {}): Promise<void> {
  const server = createMcpServer(opts);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`head-studio MCP server v${VERSION} ready on stdio (cwd: ${opts.workspaceRoot ?? process.cwd()})\n`);
}
