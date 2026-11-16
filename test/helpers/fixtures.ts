import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'dafont');

/** Fixtures keep dafont's original windows-1252 bytes. */
export const fixtureBytes = (name: string): Buffer => fs.readFileSync(path.join(FIXTURES, name));
export const fixture = (name: string): string => new TextDecoder('windows-1252').decode(fixtureBytes(name));

/**
 * A throwaway cache pre-seeded with responses (fixture file names or raw bytes)
 * under the exact URLs fontetto requests, so CLI and MCP tests run fully
 * offline (FONTETTO_OFFLINE=1).
 */
export function seededEnv(pages: Record<string, string | Uint8Array>): NodeJS.ProcessEnv {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fontetto-test-'));
  const http = path.join(root, 'cache', 'http');
  fs.mkdirSync(http, { recursive: true });
  for (const [url, page] of Object.entries(pages)) {
    const bytes = typeof page === 'string' ? fixtureBytes(page) : page;
    fs.writeFileSync(path.join(http, createHash('sha1').update(url).digest('hex')), bytes);
  }
  return {
    ...process.env,
    FONTETTO_CACHE: path.join(root, 'cache'),
    FONTETTO_TAGS: path.join(root, 'tags.json'),
    FONTETTO_OFFLINE: '1',
  };
}
