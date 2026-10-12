import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export type ProjectFramework = 'nextjs' | 'astro' | 'vite' | 'html' | 'unknown';

export interface ProjectInfo {
  root: string;
  name: string | null;
  framework: ProjectFramework;
  /** Framework the fixer should use for source files. */
  fixFramework: 'nextjs' | 'astro' | 'html';
  /** Next.js App Router directory (`app` or `src/app`), if any. */
  appDir: string | null;
  /** Next.js Pages Router directory, if any (not supported by the fixer). */
  pagesDir: string | null;
  /** Conventional dev server URL for the detected framework. */
  devUrl: string | null;
  /** Static output directories that contain an index.html. */
  buildDirs: string[];
}

const DEFAULT_PORTS: Record<ProjectFramework, number | null> = { nextjs: 3000, astro: 4321, vite: 5173, html: null, unknown: null };

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** Inspect `package.json` and the file layout to guess the framework, dev URL and build output. */
export function detectProject(root = process.cwd()): ProjectInfo {
  const pkg = readJson(path.join(root, 'package.json'));
  const deps = { ...(pkg?.dependencies as object), ...(pkg?.devDependencies as object) } as Record<string, string>;
  const framework: ProjectFramework = deps.next ? 'nextjs' : deps.astro ? 'astro' : deps.vite ? 'vite' : existsSync(path.join(root, 'index.html')) || existsSync(path.join(root, 'public/index.html')) ? 'html' : 'unknown';

  // Respect an explicit port in the dev script (`next dev -p 4000`, `astro dev --port 4000`).
  const devScript = String((pkg?.scripts as Record<string, string> | undefined)?.dev ?? '');
  const portMatch = devScript.match(/(?:--port|-p)[\s=]+(\d{2,5})/);
  const port = portMatch ? Number(portMatch[1]) : DEFAULT_PORTS[framework];

  const appDir = ['app', 'src/app'].map((d) => path.join(root, d)).find(isDir) ?? null;
  const pagesDir = ['pages', 'src/pages'].map((d) => path.join(root, d)).find(isDir) ?? null;
  const buildDirs = ['out', 'dist', 'build', '_site', 'public', '.']
    .map((d) => path.join(root, d))
    .filter((d) => existsSync(path.join(d, 'index.html')));

  return {
    root,
    name: typeof pkg?.name === 'string' ? pkg.name : null,
    framework,
    fixFramework: framework === 'nextjs' ? 'nextjs' : framework === 'astro' ? 'astro' : 'html',
    appDir: framework === 'nextjs' ? appDir : null,
    pagesDir: framework === 'nextjs' && !appDir ? pagesDir : null,
    devUrl: port ? `http://localhost:${port}` : null,
    buildDirs,
  };
}

async function isUp(url: string, timeoutMs = 800): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
    await res.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

export interface TargetGuess {
  target: string | null;
  reason: string;
  project: ProjectInfo;
}

/**
 * Pick something sensible to inspect when no target was given: a running dev server first,
 * then a static build directory.
 */
export async function guessTarget(root = process.cwd()): Promise<TargetGuess> {
  const project = detectProject(root);
  const candidates = [project.devUrl, 'http://localhost:3000', 'http://localhost:4321', 'http://localhost:5173', 'http://localhost:8080'].filter(
    (u, i, all): u is string => !!u && all.indexOf(u) === i,
  );
  const results = await Promise.all(candidates.map(async (u) => [u, await isUp(u)] as const));
  const running = results.find(([, up]) => up)?.[0];
  if (running) return { target: running, reason: `dev server responding at ${running}`, project };
  const build = project.buildDirs[0];
  if (build) {
    const rel = path.relative(process.cwd(), build) || '.';
    return { target: rel.startsWith('.') ? rel : `./${rel}`, reason: `no dev server found; using static build ${rel}`, project };
  }
  return {
    target: null,
    reason: project.devUrl ? `no dev server at ${project.devUrl} and no static build found` : 'no dev server or static build found',
    project,
  };
}
