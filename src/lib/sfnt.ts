/**
 * Read what CSS needs from a TrueType/OpenType file: family, style, weight —
 * plus the licence and designer fields many fonts embed.
 */

import { readCmap } from './cmap.ts';
import { readTraits, type FontTraits } from './traits.ts';

export interface FontFileInfo {
  family: string;
  subfamily: string;
  fullName?: string;
  postscriptName?: string;
  version?: string;
  designer?: string;
  copyright?: string;
  license?: string;
  licenseUrl?: string;
  /** CSS font-weight, 1–1000. */
  weight: number;
  italic: boolean;
  /** CSS font-stretch keyword, from the OS/2 width class. */
  stretch: string;
  /** Every glyph has the same advance width (post.isFixedPitch). */
  monospace: boolean;
  /** Case, digits and scripts, from the character map. */
  traits?: FontTraits;
  glyphs?: number;
}

const NAME_IDS = {
  copyright: 0, family: 1, subfamily: 2, fullName: 4, version: 5, postscriptName: 6,
  designer: 9, license: 13, licenseUrl: 14, typoFamily: 16, typoSubfamily: 17,
} as const;
type NameKey = keyof typeof NAME_IDS;

const WEIGHT_WORDS: [RegExp, number][] = [
  [/\b(thin|hairline)\b/, 100], [/\b(extra|ultra) ?light\b/, 200], [/\blight\b/, 300],
  [/\bmedium\b/, 500], [/\b(semi|demi) ?bold\b/, 600], [/\b(extra|ultra) ?bold\b/, 800],
  [/\b(black|heavy|hv)\b/, 900], [/\bbold\b/, 700],
];

const STRETCH = ['ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'normal', 'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded'];

/** Guess a CSS weight from a style or file name ("SemiBold", "Coolvetica Hv Comp"). */
export function weightFromName(name: string): number {
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z]+/g, ' ');
  return WEIGHT_WORDS.find(([re]) => re.test(words))?.[1] ?? 400;
}

export function readFontFile(buf: Uint8Array): FontFileInfo | null {
  if (buf.length < 12) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let base = 0;
  const tag = String.fromCharCode(...buf.subarray(0, 4));
  if (tag === 'ttcf') base = view.getUint32(12); // first font of a collection
  else if (tag !== 'OTTO' && tag !== 'true' && view.getUint32(0) !== 0x00010000) return null; // WOFF etc.

  const tables = new Map<string, number>();
  const numTables = view.getUint16(base + 4);
  for (let i = 0; i < numTables; i++) {
    const rec = base + 12 + i * 16;
    tables.set(String.fromCharCode(...buf.subarray(rec, rec + 4)), view.getUint32(rec + 8));
  }

  const names = readNames(buf, view, tables.get('name'));
  const os2 = tables.get('OS/2');
  const head = tables.get('head');
  const maxp = tables.get('maxp');
  const post = tables.get('post');
  const cmapAt = tables.get('cmap');
  const cmap = cmapAt !== undefined ? readCmap(view, cmapAt) : null;
  const lowerToUpper = cmap ? caseRatio(view, tables, os2, head, cmap.lookup) : undefined;

  const family = names.typoFamily ?? names.family ?? names.fullName ?? 'Unknown';
  const subfamily = names.typoSubfamily ?? names.subfamily ?? 'Regular';

  let weight = os2 !== undefined ? view.getUint16(os2 + 4) : 0;
  if (weight > 0 && weight < 10) weight *= 100; // legacy 1–9 scale
  if (weight < 1 || weight > 1000) weight = weightFromName(subfamily);

  const width = os2 !== undefined ? view.getUint16(os2 + 6) : 5;
  const stretch = STRETCH[width - 1] ?? 'normal';

  const italic =
    (os2 !== undefined && (view.getUint16(os2 + 62) & 0x201) !== 0) ||
    (head !== undefined && (view.getUint16(head + 44) & 0x2) !== 0) ||
    /italic|oblique/i.test(subfamily);

  return {
    family,
    subfamily,
    fullName: names.fullName,
    postscriptName: names.postscriptName,
    version: names.version,
    designer: names.designer,
    copyright: names.copyright,
    license: names.license,
    licenseUrl: names.licenseUrl,
    weight,
    italic,
    stretch,
    monospace: post !== undefined && view.getUint32(post + 12) !== 0,
    glyphs: maxp !== undefined ? view.getUint16(maxp + 4) : undefined,
    ...(cmap ? { traits: readTraits(cmap, lowerToUpper) } : {}),
  };
}

/**
 * Height of lowercase x against capital X. Real lowercase is ~0.5–0.75; a font
 * that draws capitals in the lowercase slots comes out near 1. Uses the drawn
 * outlines (TrueType glyf) when present, else the declared OS/2 heights.
 */
function caseRatio(view: DataView, tables: Map<string, number>, os2: number | undefined, head: number | undefined, lookup: (cp: number) => number): number | undefined {
  const glyf = tables.get('glyf');
  const loca = tables.get('loca');
  if (glyf !== undefined && loca !== undefined && head !== undefined) {
    const long = view.getInt16(head + 50) === 1;
    const top = (gid: number): number | undefined => {
      if (!gid) return undefined;
      const at = long ? view.getUint32(loca + gid * 4) : view.getUint16(loca + gid * 2) * 2;
      const next = long ? view.getUint32(loca + gid * 4 + 4) : view.getUint16(loca + gid * 2 + 2) * 2;
      return next > at ? view.getInt16(glyf + at + 8) : undefined; // yMax
    };
    const lower = top(lookup(0x78)) ?? top(lookup(0x7a));
    const upper = top(lookup(0x58)) ?? top(lookup(0x48));
    if (lower && upper && upper > 0) return lower / upper;
  }
  if (os2 !== undefined && view.getUint16(os2) >= 2) {
    const xHeight = view.getInt16(os2 + 86);
    const capHeight = view.getInt16(os2 + 88);
    if (xHeight > 0 && capHeight > 0) return xHeight / capHeight;
  }
  return undefined;
}

function readNames(buf: Uint8Array, view: DataView, offset: number | undefined): Partial<Record<NameKey, string>> {
  const out: Partial<Record<NameKey, string>> = {};
  if (offset === undefined) return out;
  const count = view.getUint16(offset + 2);
  const strings = offset + view.getUint16(offset + 4);
  const rank = new Map<NameKey, number>();

  for (let i = 0; i < count; i++) {
    const r = offset + 6 + i * 12;
    const platform = view.getUint16(r);
    const language = view.getUint16(r + 4);
    const id = view.getUint16(r + 6);
    const key = (Object.keys(NAME_IDS) as NameKey[]).find((k) => NAME_IDS[k] === id);
    if (!key) continue;
    // Prefer Windows English, then any Windows/Unicode, then Mac Roman.
    const score = platform === 3 ? (language === 0x409 ? 3 : 2) : platform === 0 ? 2 : platform === 1 ? 1 : 0;
    if (score === 0 || score <= (rank.get(key) ?? 0)) continue;
    const start = strings + view.getUint16(r + 10);
    const bytes = buf.subarray(start, start + view.getUint16(r + 8));
    const value = new TextDecoder(platform === 1 ? 'macintosh' : 'utf-16be').decode(bytes).replace(/\0/g, '').trim();
    if (!value) continue;
    out[key] = value;
    rank.set(key, score);
  }
  return out;
}
