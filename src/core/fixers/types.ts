export type TargetFramework = 'nextjs' | 'astro' | 'html';

export interface ImageUpdate {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

/**
 * Framework-neutral metadata updates, shaped like Next.js' `Metadata` object. Unknown keys are
 * passed through untouched to the Next.js fixer. Set a key to `null` to remove it.
 */
export interface MetadataUpdates {
  title?: string | null;
  description?: string | null;
  /** Shorthand for `alternates.canonical`. */
  canonical?: string | null;
  robots?: string | { index?: boolean; follow?: boolean } | null;
  keywords?: string | string[] | null;
  themeColor?: string | null;
  alternates?: { canonical?: string | null } & Record<string, unknown>;
  openGraph?: {
    title?: string | null;
    description?: string | null;
    url?: string | null;
    siteName?: string | null;
    type?: string | null;
    locale?: string | null;
    images?: string | ImageUpdate | Array<string | ImageUpdate> | null;
  } & Record<string, unknown>;
  twitter?: {
    card?: 'summary' | 'summary_large_image' | 'app' | 'player' | null;
    title?: string | null;
    description?: string | null;
    site?: string | null;
    creator?: string | null;
    images?: string | string[] | null;
  } & Record<string, unknown>;
  /** Extra `<meta name="…">` tags (`other` in Next.js). */
  other?: Record<string, string | null>;
  [key: string]: unknown;
}

export interface FixResult {
  ok: boolean;
  filePath: string;
  framework: TargetFramework;
  dryRun: boolean;
  changed: boolean;
  applied: string[];
  warnings: string[];
  error?: string;
  diff: string;
}

export interface FixOutput {
  code: string;
  applied: string[];
  warnings: string[];
}
