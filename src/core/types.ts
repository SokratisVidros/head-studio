export type Severity = 'error' | 'warning' | 'info';

export type IssueCategory = 'meta' | 'serp' | 'opengraph' | 'twitter' | 'favicons' | 'jsonld';

export interface Issue {
  severity: Severity;
  category: IssueCategory;
  /** Stable machine-readable identifier, e.g. `meta/title-missing`. */
  code: string;
  message: string;
  /** Human/agent hint describing how to resolve the issue. */
  hint?: string;
}

export interface MetaTags {
  title: string | null;
  description: string | null;
  robots: string | null;
  canonical: string | null;
  viewport: string | null;
  charset: string | null;
  lang: string | null;
  themeColor: string | null;
  /** Every `<meta>` with a name/property, in document order. */
  all: Array<{ key: string; content: string }>;
}

export interface ImageCheck {
  url: string;
  /** Resolved absolute URL (http(s):// or file://) used to load the image. */
  resolved: string | null;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  error?: string;
}

export interface OpenGraphTags {
  title: string | null;
  description: string | null;
  type: string | null;
  url: string | null;
  siteName: string | null;
  locale: string | null;
  image: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /** All `og:*` properties (repeated keys preserved). */
  raw: Array<{ property: string; content: string }>;
  imageCheck: ImageCheck | null;
}

export interface TwitterTags {
  card: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  imageAlt: string | null;
  site: string | null;
  creator: string | null;
  raw: Array<{ name: string; content: string }>;
  imageCheck: ImageCheck | null;
}

export type IconKind = 'icon' | 'shortcut icon' | 'apple-touch-icon' | 'apple-touch-icon-precomposed' | 'mask-icon' | 'manifest' | 'other';

export interface IconLink {
  rel: string;
  kind: IconKind;
  href: string;
  sizes: string | null;
  type: string | null;
}

export interface FaviconCheckRow {
  id: string;
  label: string;
  /** Expected size, e.g. `180x180`, or null when any size is acceptable. */
  expected: string | null;
  status: 'pass' | 'warn' | 'fail';
  href: string | null;
  check: ImageCheck | null;
  note?: string;
}

export interface ManifestInfo {
  href: string;
  resolved: string | null;
  ok: boolean;
  error?: string;
  name: string | null;
  shortName: string | null;
  themeColor: string | null;
  backgroundColor: string | null;
  display: string | null;
  icons: Array<{ src: string; sizes: string | null; type: string | null; purpose: string | null }>;
}

export interface FaviconReport {
  links: IconLink[];
  manifest: ManifestInfo | null;
  grid: FaviconCheckRow[];
}

export interface SerpLine {
  text: string;
  chars: number;
  pixels: number;
  limit: number;
  truncated: boolean;
  /** What Google would display (with ellipsis) when truncated. */
  display: string;
}

export interface SerpDeviceResult {
  title: SerpLine;
  description: SerpLine;
}

export interface SerpReport {
  desktop: SerpDeviceResult;
  mobile: SerpDeviceResult;
}

export interface JsonLdBlock {
  index: number;
  raw: string;
  valid: boolean;
  syntaxError?: string;
  data: unknown;
  /** Flattened list of typed entities found in the block (handles arrays and @graph). */
  entities: JsonLdEntity[];
}

export interface JsonLdEntity {
  type: string[];
  path: string;
  data: Record<string, unknown>;
  issues: Issue[];
}

export interface InspectReport {
  schemaVersion: 1;
  target: string;
  /** Resolved document URL (http(s):// or file://). */
  url: string;
  source: 'http' | 'file';
  status: number | null;
  fetchedAt: string;
  timingMs: number;
  meta: MetaTags;
  openGraph: OpenGraphTags;
  twitter: TwitterTags;
  favicons: FaviconReport;
  serp: SerpReport;
  jsonLd: JsonLdBlock[];
  issues: Issue[];
  summary: { errors: number; warnings: number; infos: number; score: number };
}
