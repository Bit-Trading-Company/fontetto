/**
 * One polite HTTP client for every provider: an honest user agent, a small gap
 * between requests to the same host, a disk cache with per-call TTLs, and an
 * offline mode (FONTETTO_OFFLINE=1) that serves only from the cache.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO, VERSION } from '../version.ts';
import { cacheDir } from './paths.ts';

export const USER_AGENT = `fontetto/${VERSION} (+${REPO})`;

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export interface GetOptions {
  /** How long a cached copy stays fresh. 0 disables the cache. Default: 1 day. */
  ttl?: number;
  /** Minimum gap between requests to the same host, in ms. Default: 750. */
  gap?: number;
}

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(status: number, url: string) {
    super(status === 404 ? `Not found: ${url}` : `HTTP ${status} for ${url}`);
    this.status = status;
    this.url = url;
  }
}

const lastHit = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(url: string, gap: number): Promise<void> {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

const cachePath = (url: string) =>
  path.join(cacheDir(), 'http', createHash('sha1').update(url).digest('hex'));

async function readCache(url: string, ttl: number, allowStale: boolean): Promise<Uint8Array | null> {
  const file = cachePath(url);
  try {
    const { mtimeMs } = await fs.stat(file);
    if (!allowStale && Date.now() - mtimeMs > ttl) return null;
    return new Uint8Array(await fs.readFile(file));
  } catch {
    return null;
  }
}

async function writeCache(url: string, data: Uint8Array): Promise<void> {
  const file = cachePath(url);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

/** GET a URL as bytes, through the cache. */
export async function getBytes(url: string, { ttl = DAY, gap = 750 }: GetOptions = {}): Promise<Uint8Array> {
  const offline = process.env.FONTETTO_OFFLINE === '1';
  if (ttl > 0 || offline) {
    const hit = await readCache(url, ttl, offline);
    if (hit) return hit;
    if (offline) throw new Error(`Offline and not cached: ${url}`);
  }

  for (let attempt = 0; ; attempt++) {
    await throttle(url, gap);
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' });
    if (res.ok) {
      const data = new Uint8Array(await res.arrayBuffer());
      if (ttl > 0) await writeCache(url, data);
      return data;
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 2) throw new HttpError(res.status, url);
    await sleep(1500 * (attempt + 1));
  }
}

/** GET a URL as text. `encoding` is a WHATWG label, e.g. "windows-1252". */
export async function getText(url: string, options: GetOptions & { encoding?: string } = {}): Promise<string> {
  return new TextDecoder(options.encoding ?? 'utf-8').decode(await getBytes(url, options));
}
