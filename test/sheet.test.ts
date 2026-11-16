import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodePng, encodePng, type Gray } from '../src/lib/png.ts';
import { contactSheet } from '../src/lib/sheet.ts';
import { fixtureBytes } from './helpers/fixtures.ts';

const block = (width: number, height: number, ink: [number, number, number, number]): Gray => {
  const pixels = new Uint8Array(width * height).fill(255);
  const [x0, y0, x1, y1] = ink;
  for (let y = y0; y < y1; y++) pixels.fill(0, y * width + x0, y * width + x1);
  return { width, height, pixels };
};

test('png: grayscale round trip', () => {
  const img = block(37, 11, [3, 2, 20, 9]);
  assert.deepEqual(decodePng(encodePng(img)), img);
});

test('png: decodes a real dafont preview (1-bit palette)', () => {
  const img = decodePng(fixtureBytes('preview-palette.png'));
  assert.deepEqual([img.width, img.height], [203, 71]);
  const dark = img.pixels.filter((p) => p < 128).length;
  assert.ok(dark > 100 && dark < img.pixels.length / 2, 'some ink on white paper');
});

test('png: rejects non-PNG data', () => {
  assert.throws(() => decodePng(new Uint8Array(16)), /Not a PNG/);
});

test('sheet: crops, stacks and numbers every preview', () => {
  const sheet = contactSheet([block(300, 100, [10, 20, 110, 60]), block(500, 141, [0, 0, 250, 141])]);
  // Rows are cropped to the ink (100 and 250 wide) plus the number gutter and padding.
  assert.equal(sheet.width, 64 + 250 + 12);
  assert.equal(sheet.height, 40 + 24 + 141 + 24);
  const gutterInk = (y0: number, y1: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < 60; x++) if (sheet.pixels[y * sheet.width + x]! < 200) n++;
    return n;
  };
  assert.ok(gutterInk(0, 64) > 0, 'row 1 is numbered');
  assert.ok(gutterInk(65, sheet.height) > 0, 'row 2 is numbered');
});
