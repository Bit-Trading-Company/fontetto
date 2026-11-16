import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CATEGORIES } from '../src/providers/dafont/categories.ts';
import { parseDate, parseFontPage, parseLicense, parseListing, parsePages } from '../src/providers/dafont/parse.ts';
import { fixture } from './helpers/fixtures.ts';

describe('dafont listings', () => {
  for (const file of ['theme-handwritten.html', 'search-retro.html', 'top.html', 'bitmap.html']) {
    test(`${file} parses every entry`, () => {
      const html = fixture(file);
      const fonts = parseListing(html);
      assert.equal(fonts.length, (html.match(/class="lv1left/g) ?? []).length);
      for (const f of fonts) {
        assert.match(f.slug, /^[a-z0-9-]+$/);
        assert.equal(f.id, `dafont:${f.slug}`);
        assert.ok(f.name && !/[<>]|^\d+\./.test(f.name), `clean name: ${f.name}`);
        assert.ok(f.downloads && f.downloads.total > 0, `${f.slug} downloads`);
        assert.match(f.preview, /^https:\/\/(www|img)\.dafont\.com\//);
        assert.equal(f.url, `https://www.dafont.com/${f.slug}.font`);
        assert.ok(!f.author?.handle?.includes('?'), 'author handle has no query string');
      }
      // A few fonts carry no licence label on dafont; they must read as unknown, not be guessed.
      assert.ok(fonts.filter((f) => f.license.kind === 'unknown').length <= 3);
    });
  }

  test('theme listings honour server-side filters and fill in the category', () => {
    const fonts = parseListing(fixture('theme-handwritten.html'), CATEGORIES.find((c) => c.id === '603'));
    assert.ok(fonts.every((f) => f.category?.path.join('>') === 'Script>Handwritten'));
    assert.ok(fonts.every((f) => f.license.commercial === true));
  });

  test('search results carry their own category', () => {
    const fonts = parseListing(fixture('search-retro.html'));
    assert.ok(fonts.filter((f) => f.category).length >= fonts.length - 1);
  });

  test('bitmap fonts expose their pixel size', () => {
    const fonts = parseListing(fixture('bitmap.html'), CATEGORIES.find((c) => c.id === 'bitmap'));
    assert.ok(fonts.every((f) => (f.pixelSize ?? 0) > 0));
    assert.ok(fonts.every((f) => f.category?.id === 'bitmap'));
  });

  test('pager', () => {
    assert.ok(parsePages(fixture('theme-handwritten.html')) > 1);
    assert.equal(parsePages('<div class="noindex"></div>'), 1);
  });
});

describe('dafont font pages', () => {
  test('bebas-neue', () => {
    const f = parseFontPage(fixture('font-bebas-neue.html'), 'bebas-neue');
    assert.equal(f.name, 'Bebas Neue');
    assert.equal(f.author?.name, 'Dharma Type');
    assert.match(f.author?.handle ?? '', /^dharma-type\.d\d+$/);
    assert.deepEqual(f.category, { id: '501', path: ['Basic', 'Sans serif'] });
    assert.deepEqual(f.license, { kind: 'open', label: 'Public domain / GPL / OFL', commercial: true });
    assert.equal(f.added, '2010-07-15');
    assert.match(f.download, /^https:\/\/dl\.dafont\.com\/dl\/\?f=bebas_neue$/);
    assert.ok(f.styles.length >= 1 && f.styles[0]!.file.endsWith('.otf'));
    assert.ok((f.glyphs ?? 0) > 100);
    assert.ok(f.note?.includes('Bebas Neue Pro'));
    assert.ok(f.charset?.accents && f.charset.euro);
  });

  test('coolvetica: every style, and a note that overrides the label', () => {
    const f = parseFontPage(fixture('font-coolvetica.html'), 'coolvetica');
    assert.equal(f.styles.length, 5);
    assert.equal(f.license.kind, 'personal');
    assert.equal(f.license.commercial, null, 'the note talks about commercial use, so: read it');
    assert.ok(f.oldVersions?.includes('coolvetica-old1'));
    assert.ok(!/\n{3,}/.test(f.note ?? ''));
  });

  test('custom preview text yields rendered preview URLs', () => {
    const f = parseFontPage(fixture('font-coolvetica-text.html'), 'coolvetica');
    assert.equal(f.styles.length, 5);
    for (const s of f.styles) assert.match(s.preview, /^https:\/\/img\.dafont\.com\/preview\.php\?text=Brand\+Name&/);
  });

  test('a page without a font throws', () => {
    assert.throws(() => parseFontPage('<html></html>', 'nope'), /No font "nope"/);
  });
});

test('licence labels', () => {
  assert.equal(parseLicense('100% Free').commercial, true);
  assert.equal(parseLicense('Free for personal use').kind, 'personal');
  assert.equal(parseLicense('Donationware').commercial, null);
  assert.deepEqual(parseLicense('Something new'), { kind: 'unknown', label: 'Something new', commercial: null });
});

test('dates', () => {
  assert.equal(parseDate(' July 15, 2010 '), '2010-07-15');
  assert.equal(parseDate('before 2005'), undefined);
});
