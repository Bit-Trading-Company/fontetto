/**
 * Contact sheets: many previews stacked into one numbered image, so an agent
 * compares candidates with a single look instead of one image per font.
 */
import type { Gray } from './png.ts';

/** 5×7 digits, one 5-bit row per entry. */
const DIGITS = [
  [14, 17, 19, 21, 25, 17, 14], [4, 12, 4, 4, 4, 4, 14], [14, 17, 1, 2, 4, 8, 31], [30, 1, 1, 14, 1, 1, 30],
  [2, 6, 10, 18, 31, 2, 2], [31, 16, 30, 1, 1, 17, 14], [6, 8, 16, 30, 17, 17, 14], [31, 1, 2, 4, 8, 8, 8],
  [14, 17, 17, 14, 17, 17, 14], [14, 17, 17, 15, 1, 2, 12],
];
const SCALE = 3;
const PAD = 12;
const GUTTER = 64;
const INK = 140;

/** Crop to the inked area (anything darker than near-white). */
function crop(img: Gray): Gray {
  let top = img.height, bottom = -1, left = img.width, right = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.pixels[y * img.width + x]! < 235) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return { width: 1, height: 1, pixels: new Uint8Array([255]) };
  const width = right - left + 1, height = bottom - top + 1;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) pixels.set(img.pixels.subarray((top + y) * img.width + left, (top + y) * img.width + left + width), y * width);
  return { width, height, pixels };
}

function drawNumber(sheet: Gray, n: number, x0: number, y0: number): void {
  let x = x0;
  for (const ch of String(n)) {
    const rows = DIGITS[Number(ch)]!;
    rows.forEach((bits, ry) => {
      for (let rx = 0; rx < 5; rx++) {
        if (!(bits & (16 >> rx))) continue;
        for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) sheet.pixels[(y0 + ry * SCALE + dy) * sheet.width + x + rx * SCALE + dx] = INK;
      }
    });
    x += 6 * SCALE;
  }
}

/** Stack images top to bottom, each cropped and numbered 1, 2, 3… on the left. */
export function contactSheet(images: Gray[]): Gray {
  const cropped = images.map(crop);
  const width = GUTTER + Math.max(...cropped.map((c) => c.width)) + PAD;
  const heights = cropped.map((c) => Math.max(c.height, 7 * SCALE) + 2 * PAD);
  const height = heights.reduce((a, b) => a + b, 0);
  const sheet: Gray = { width, height, pixels: new Uint8Array(width * height).fill(255) };

  let y = 0;
  cropped.forEach((img, i) => {
    const rowHeight = heights[i]!;
    if (i > 0) sheet.pixels.fill(225, y * width, (y + 1) * width); // divider
    drawNumber(sheet, i + 1, PAD, y + Math.floor((rowHeight - 7 * SCALE) / 2));
    const top = y + Math.floor((rowHeight - img.height) / 2);
    for (let r = 0; r < img.height; r++) sheet.pixels.set(img.pixels.subarray(r * img.width, (r + 1) * img.width), (top + r) * width + GUTTER);
    y += rowHeight;
  });
  return sheet;
}
