import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseRef, genericFallback } from '../src/fontetto.ts';
import { resolveCategory } from '../src/lib/categories.ts';
import { fontFace } from '../src/lib/css.ts';
import { buildFaces } from '../src/lib/faces.ts';
import { decodeEntities, toText } from '../src/lib/html.ts';
import { commercialLabel, licenseKinds } from '../src/lib/license.ts';
import { readFontFile, weightFromName } from '../src/lib/sfnt.ts';
import { unzip } from '../src/lib/zip.ts';
import { CATEGORIES } from '../src/providers/dafont/categories.ts';
import { applyTags, tagCounts, withTags, type TagStore } from '../src/tags.ts';
import type { FontSummary } from '../src/types.ts';
import { makeFont, makeZip } from './helpers/build.ts';

test('unzip: stored and deflated entries, directories skipped', () => {
  const zip = makeZip([
    { name: 'dir/', data: '' },
    { name: 'a.txt', data: 'hello' },
    { name: 'dir/b.ttf', data: 'x'.repeat(1000), deflate: true },
  ]);
  const entries = unzip(zip);
  assert.deepEqual(entries.map((e) => e.name), ['a.txt', 'dir/b.ttf']);
  assert.equal(new TextDecoder().decode(entries[0]!.data), 'hello');
  assert.equal(entries[1]!.data.length, 1000);
  assert.throws(() => unzip(new Uint8Array(40)), /Not a zip/);
});

describe('sfnt', () => {
  test('reads family, style, weight, stretch, glyphs and licence', () => {
    const info = readFontFile(makeFont({ family: 'Acme Bold', typoFamily: 'Acme', subfamily: 'Bold Italic', weight: 700, width: 3, italic: true, glyphs: 321, license: 'OFL' }));
    assert.deepEqual(
      { family: info?.family, subfamily: info?.subfamily, weight: info?.weight, italic: info?.italic, stretch: info?.stretch, glyphs: info?.glyphs, license: info?.license },
      { family: 'Acme', subfamily: 'Bold Italic', weight: 700, italic: true, stretch: 'condensed', glyphs: 321, license: 'OFL' },
    );
  });
  test('legacy 1–9 weights and nonsense weights', () => {
    assert.equal(readFontFile(makeFont({ family: 'A', weight: 7 }))?.weight, 700);
    assert.equal(readFontFile(makeFont({ family: 'A', subfamily: 'Light', weight: 0 }))?.weight, 300);
  });
  test('non-sfnt data', () => assert.equal(readFontFile(new TextEncoder().encode('wOF2 not parsed here')), null));
  test('weight words', () => {
    assert.equal(weightFromName('Coolvetica Hv Comp'), 900);
    assert.equal(weightFromName('SemiBold'), 600);
    assert.equal(weightFromName('Regular'), 400);
  });
});

describe('faces', () => {
  const info = (o: Partial<ReturnType<typeof readFontFile>> & { family: string }) => ({ subfamily: 'Regular', weight: 400, italic: false, stretch: 'normal', ...o });

  test('one face per stem, best web format first', () => {
    const faces = buildFaces(
      [
        { path: 'x/Acme-Regular.ttf', info: info({ family: 'Acme' }) },
        { path: 'x/Acme-Regular.woff2', info: null },
        { path: 'x/Acme-Regular.otf', info: info({ family: 'Acme' }) },
      ],
      'Fallback',
    );
    assert.equal(faces.length, 1);
    assert.deepEqual(faces[0]!.files, ['x/Acme-Regular.woff2', 'x/Acme-Regular.otf', 'x/Acme-Regular.ttf']);
    assert.equal(faces[0]!.family, 'Acme');
  });

  test('colliding cuts get their own family; the plain one keeps the name', () => {
    const faces = buildFaces(
      [
        { path: 'Acme Rg.otf', info: info({ family: 'Acme' }) },
        { path: 'Acme Cram.otf', info: info({ family: 'Acme', subfamily: 'Crammed' }) },
        { path: 'Acme It.otf', info: info({ family: 'Acme', subfamily: 'Italic', italic: true }) },
      ],
      'Acme',
    );
    assert.deepEqual(faces.map((f) => f.family).sort(), ['Acme', 'Acme', 'Acme Crammed']);
  });

  test('files without metadata fall back to the provider name and file-name hints', () => {
    const [face] = buildFaces([{ path: 'Thing Bold Italic.woff2', info: null }], 'Thing');
    assert.deepEqual([face!.family, face!.weight, face!.italic], ['Thing', 700, true]);
  });

  test('CSS', () => {
    const css = fontFace({ family: "O'Brien", fileFamily: "O'Brien", subfamily: 'Italic', weight: 300, italic: true, stretch: 'condensed', files: ['out/a b.woff2', 'out/a b.ttf'] }, 'out');
    assert.match(css, /font-family: 'O\\'Brien';/);
    assert.match(css, /url\('a%20b\.woff2'\) format\('woff2'\),\s+url\('a%20b\.ttf'\) format\('truetype'\);/);
    assert.match(css, /font-weight: 300;\s+font-style: italic;\s+font-stretch: condensed;/);
  });
});

test('categories resolve by id, name, path; ambiguity is explained', () => {
  const r = (s: string) => resolveCategory(CATEGORIES, s).id;
  assert.equal(r('603'), '603');
  assert.equal(r('handwritten'), '603');
  assert.equal(r('Script > Brush'), '604');
  assert.equal(r('script/old school'), '607');
  assert.equal(r('techno'), 'm3');
  assert.equal(r('pixel'), 'bitmap');
  assert.equal(r('Monospace'), '503');
  assert.equal(r('sans-serif'), '501');
  assert.equal(r('Sci-fi'), '303');
  assert.throws(() => r('horror'), /ambiguous: Fancy > Horror, Dingbats > Horror/);
  assert.throws(() => r('zzz'), /Unknown category/);
});

test('refs', () => {
  assert.deepEqual(parseRef('bebas-neue'), { provider: 'dafont', slug: 'bebas-neue' });
  assert.deepEqual(parseRef('dafont:Bebas-Neue'), { provider: 'dafont', slug: 'bebas-neue' });
  assert.deepEqual(parseRef('https://www.dafont.com/fr/bebas-neue.font?text=x'), { provider: 'dafont', slug: 'bebas-neue' });
});

test('html', () => {
  assert.equal(decodeEntities('&agrave; &euro; &#8482; &#x41; &amp;amp; &bogus;'), 'à € ™ A &amp; &bogus;');
  assert.equal(toText('a<br />\r\n<br />\r\n<br />b <b>c</b>&nbsp;d'), 'a\n\nb c d');
});

test('licences', () => {
  assert.deepEqual(licenseKinds('commercial'), ['open', 'free']);
  assert.deepEqual(licenseKinds(['demo']), ['demo']);
  assert.equal(licenseKinds(undefined), undefined);
  assert.equal(commercialLabel({ kind: 'personal', label: '', commercial: false }), 'personal use only');
  assert.equal(commercialLabel({ kind: 'donationware', label: '', commercial: null }), 'check terms');
});

test('generic fallbacks', () => {
  const f = (id: string) => genericFallback(CATEGORIES.find((c) => c.id === id));
  assert.equal(f('603'), 'cursive');
  assert.equal(f('502'), 'serif');
  assert.equal(f('501'), 'sans-serif');
  assert.equal(f('503'), 'monospace');
});

test('tags', () => {
  const store: TagStore = { version: 1, fonts: {} };
  const font = { id: 'dafont:x', name: 'X', license: { kind: 'free' } } as FontSummary;
  assert.deepEqual(applyTags(store, font, ['Display', ' brand acme '], []), ['brand-acme', 'display']);
  assert.deepEqual(withTags(store, font).tags, ['brand-acme', 'display']);
  assert.deepEqual(tagCounts(store), [['brand-acme', 1], ['display', 1]]);
  assert.deepEqual(applyTags(store, font, [], ['display', 'brand-acme']), []);
  assert.deepEqual(store.fonts, {});
});

test('every category the skill recommends resolves', async () => {
  const fs = await import('node:fs');
  const skill = fs.readFileSync(new URL('../skills/fontetto/SKILL.md', import.meta.url), 'utf8');
  const table = skill.slice(skill.indexOf('## Brief → category'), skill.indexOf('## Notes'));
  const cells = table.split('\n').filter((l) => l.startsWith('| ')).map((l) => l.split('|').at(-2)!);
  const words = cells.flatMap((c) => [...c.matchAll(/`([^`]+)`/g)].map((m) => m[1]!)).filter((w) => w !== '-c');
  assert.ok(words.length > 30);
  for (const w of words) assert.doesNotThrow(() => resolveCategory(CATEGORIES, w), w);
});
