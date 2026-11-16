/**
 * Against the real dafont.com — catches markup changes the fixtures can't.
 * Opt-in (polite to the provider): npm run test:live
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const live = process.env.FONTETTO_LIVE === '1';
if (live) process.env.FONTETTO_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'fontetto-live-'));
const { get, info, preview, search } = await import('../src/fontetto.ts');

test('live: browse, search, inspect, preview, install', { skip: !live && 'set FONTETTO_LIVE=1' }, async () => {
  const browse = await search({ category: 'script/brush', license: 'commercial', limit: 5 });
  assert.equal(browse.fonts.length, 5);
  assert.ok(browse.fonts.every((f) => f.license.commercial && f.category?.id === '604'));

  const words = await search({ text: 'bebas', limit: 5 });
  assert.ok(words.fonts.some((f) => f.slug === 'bebas-neue'));

  const font = await info('bebas-neue');
  assert.equal(font.license.kind, 'open');
  assert.ok(font.styles.length >= 1);

  const shot = await preview(['bebas-neue', 'coolvetica'], { text: 'Fontetto' });
  assert.equal(shot.rows.length, 2);
  assert.ok(fs.statSync(shot.sheet!).size > 100);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fontetto-live-get-'));
  const got = await get('bebas-neue', { dir });
  assert.deepEqual(got.families, ['Bebas Neue']);
  assert.match(fs.readFileSync(got.css, 'utf8'), /@font-face/);
});
