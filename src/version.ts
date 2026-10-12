import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function readVersion(): string {
  for (const p of ['../package.json', '../../package.json']) {
    try {
      return (require(p) as { version: string }).version;
    } catch {
      // try next location (src/ vs dist/)
    }
  }
  return '0.0.0';
}

export const VERSION = readVersion();
