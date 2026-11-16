import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { search, splitTerms } from '../src/fontetto.ts';
import { PROVIDERS } from '../src/providers/index.ts';
import type { FontSummary, Provider } from '../src/types.ts';

process.env.FONTETTO_TAGS = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fontetto-tags-')), 'tags.json');

const font = (slug: string, total: number): FontSummary => ({
  id: `fake:${slug}`, provider: 'fake', slug, name: slug, url: '', preview: '',
  license: { kind: 'free', label: 'Free', commercial: true }, downloads: { total, yesterday: 0 },
});

const CATALOG: Record<string, FontSummary[]> = {
  script: [font('alpha-script', 10), font('shared', 50)],
  cursive: [font('shared', 50), font('beta-cursive', 900)],
  'pixel art': [font('gamma', 5)],
};
const asked: string[] = [];

// Providers are a registry: any implementation of Provider plugs in.
const fake: Provider = {
  id: 'fake',
  name: 'Fake',
  homepage: 'https://example.test',
  categories: () => [],
  async search(q) {
    asked.push(q.text ?? '');
    return { provider: 'fake', fonts: CATALOG[q.text ?? ''] ?? [], page: 1, pages: 1, source: `fake:${q.text}` };
  },
  info: async () => { throw new Error('unused'); },
  download: async () => { throw new Error('unused'); },
};
PROVIDERS.fake = fake;

test('splitTerms', () => {
  assert.deepEqual(splitTerms('script  cursive script'), ['script', 'cursive']);
  assert.deepEqual(splitTerms('script, pixel art'), ['script', 'pixel art']);
});

test('--any: one call, every term, merged, de-duplicated, most popular first', async () => {
  asked.length = 0;
  const r = await search({ provider: 'fake', text: 'script cursive', any: true });
  assert.deepEqual(asked, ['script', 'cursive']);
  assert.deepEqual(r.fonts.map((f) => f.slug), ['beta-cursive', 'shared', 'alpha-script']);
  assert.equal(r.source, 'fake:script + fake:cursive');
});

test('--any honours phrases, limit and sort by name', async () => {
  const r = await search({ provider: 'fake', text: 'script, pixel art', any: true, sort: 'name', limit: 2 });
  assert.deepEqual(r.fonts.map((f) => f.slug), ['alpha-script', 'gamma']);
});

test('without --any, the words go to the provider as one query', async () => {
  asked.length = 0;
  await search({ provider: 'fake', text: 'script cursive' });
  assert.deepEqual(asked, ['script cursive']);
});
