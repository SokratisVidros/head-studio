import type { InspectReport } from '../core/types';

export type { InspectReport };

export interface FixResponse {
  ok: boolean;
  filePath: string;
  framework: string;
  dryRun: boolean;
  changed: boolean;
  applied: string[];
  warnings: string[];
  error?: string;
  diff: string;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T & { error?: string };
  if (!res.ok && body && (body as { error?: string }).error && !('ok' in body)) throw new Error(body.error);
  return body;
}

export async function getConfig(): Promise<{ version: string; defaultTarget: string; workspaceRoot: string }> {
  return json(await fetch('/api/config'));
}

export async function inspectTarget(target: string, route?: string): Promise<InspectReport> {
  const qs = new URLSearchParams({ target });
  if (route) qs.set('route', route);
  return json(await fetch(`/api/inspect?${qs}`));
}

export async function applyFix(body: { filePath: string; targetFramework: string; updates: unknown; dryRun: boolean }): Promise<FixResponse> {
  return json(await fetch('/api/fix', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
}

/** Route images through the local server so file:// and localhost assets preview reliably. */
export function assetUrl(resolved: string | null | undefined): string | undefined {
  if (!resolved) return undefined;
  return `/api/asset?url=${encodeURIComponent(resolved)}`;
}

export function displayHost(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.protocol === 'file:' ? 'localhost' : u.host;
  } catch {
    return url;
  }
}
