import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VERSION } from '../../version.js';
import { registerTools, type ToolOptions } from './tools.js';

export function createMcpServer(opts: ToolOptions = {}): McpServer {
  const server = new McpServer(
    { name: 'head-studio', version: VERSION },
    {
      instructions:
        'head-studio audits HTML <head> metadata. Call inspect_route on a page (e.g. http://localhost:3000/), read `issues` (errors first), iterate on copy with validate_serp_snippet, then apply_metadata_fix to the route\'s layout/page source file. Re-run inspect_route to verify.',
    },
  );
  registerTools(server, opts);
  return server;
}

/** Run the MCP server over stdio. stdout is reserved for JSON-RPC; logs go to stderr. */
export async function runMcpStdio(opts: ToolOptions = {}): Promise<void> {
  const server = createMcpServer(opts);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`head-studio MCP server v${VERSION} ready on stdio\n`);
}
