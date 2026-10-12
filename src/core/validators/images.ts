import { imageSize } from 'image-size';
import { fetchResource, type ResourceContext } from '../fetcher.js';
import type { ImageCheck } from '../types.js';

export interface ImageSizeInfo {
  width: number;
  height: number;
  type?: string;
  /** Individual sizes for multi-image containers such as `.ico`. */
  images?: Array<{ width: number; height: number }>;
}

export function measureImage(bytes: Uint8Array): ImageSizeInfo | null {
  try {
    const r = imageSize(bytes);
    if (!r.width || !r.height) return null;
    return {
      width: r.width,
      height: r.height,
      type: r.type,
      images: r.images?.map((i) => ({ width: i.width, height: i.height })),
    };
  } catch {
    return null;
  }
}

const cache = new WeakMap<ResourceContext, Map<string, Promise<ImageCheck & { info: ImageSizeInfo | null }>>>();

/** Load an image (http or file) and read its intrinsic dimensions. Results are memoized per context. */
export function checkImage(href: string, ctx: ResourceContext): Promise<ImageCheck & { info: ImageSizeInfo | null }> {
  let perCtx = cache.get(ctx);
  if (!perCtx) cache.set(ctx, (perCtx = new Map()));
  const hit = perCtx.get(href);
  if (hit) return hit;
  const p = (async () => {
    const res = await fetchResource(href, ctx);
    const base = {
      url: href,
      resolved: res.resolved,
      status: res.status,
      contentType: res.contentType,
      bytes: res.bytes?.byteLength ?? null,
    };
    if (!res.ok || !res.bytes) {
      return { ...base, ok: false, width: null, height: null, error: res.error ?? 'Not found', info: null };
    }
    const info = measureImage(res.bytes);
    if (!info) {
      return { ...base, ok: false, width: null, height: null, error: 'Not a recognizable image', info: null };
    }
    return { ...base, ok: true, width: info.width, height: info.height, info };
  })();
  perCtx.set(href, p);
  return p;
}

/** Strip the internal `info` field before putting an ImageCheck into a report. */
export function publicCheck(c: ImageCheck & { info?: unknown }): ImageCheck {
  const { info: _info, ...rest } = c;
  return rest;
}
