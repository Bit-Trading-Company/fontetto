/**
 * The font's character map (cmap): which characters it actually draws.
 * Supports the subtable formats real fonts ship: 4 (BMP), 12 (full Unicode),
 * 0 (legacy Mac) and Windows "symbol" fonts, whose glyphs sit at U+F0xx.
 */

/** Glyph id for a code point (0 = not drawn). */
export type Lookup = (codePoint: number) => number;

export interface Cmap {
  lookup: Lookup;
  /** A symbol-encoded font (dingbats and pictographs, usually). */
  symbol: boolean;
}

export function readCmap(view: DataView, offset: number): Cmap | null {
  const count = view.getUint16(offset + 2);
  const subtables: { platform: number; encoding: number; at: number }[] = [];
  for (let i = 0; i < count; i++) {
    const r = offset + 4 + i * 8;
    subtables.push({ platform: view.getUint16(r), encoding: view.getUint16(r + 2), at: offset + view.getUint32(r + 4) });
  }
  const pick = (platform: number, encodings: number[]) =>
    subtables.find((s) => s.platform === platform && encodings.includes(s.encoding));
  const best = pick(3, [10]) ?? pick(0, [4, 6]) ?? pick(3, [1]) ?? pick(0, [0, 1, 2, 3]) ?? pick(3, [0]) ?? pick(1, [0]);
  if (!best) return null;

  const table = readSubtable(view, best.at);
  if (!table) return null;
  const symbol = best.platform === 3 && best.encoding === 0;
  return { symbol, lookup: symbol ? (cp) => table(cp) || table(0xf000 + cp) : table };
}

function readSubtable(view: DataView, at: number): Lookup | null {
  const format = view.getUint16(at);
  if (format === 4) {
    const segX2 = view.getUint16(at + 6);
    const ends = at + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    return (cp) => {
      if (cp > 0xffff) return 0;
      for (let i = 0; i < segX2; i += 2) {
        if (view.getUint16(ends + i) < cp) continue;
        const start = view.getUint16(starts + i);
        if (start > cp) return 0;
        const delta = view.getUint16(deltas + i);
        const range = view.getUint16(ranges + i);
        if (range === 0) return (cp + delta) & 0xffff;
        const glyph = view.getUint16(ranges + i + range + 2 * (cp - start));
        return glyph ? (glyph + delta) & 0xffff : 0;
      }
      return 0;
    };
  }
  if (format === 12) {
    const groups = view.getUint32(at + 12);
    return (cp) => {
      for (let i = 0; i < groups; i++) {
        const g = at + 16 + i * 12;
        const start = view.getUint32(g);
        if (cp >= start && cp <= view.getUint32(g + 4)) return view.getUint32(g + 8) + (cp - start);
      }
      return 0;
    };
  }
  if (format === 0) return (cp) => (cp < 256 ? view.getUint8(at + 6 + cp) : 0);
  return null;
}
