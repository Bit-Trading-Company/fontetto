/**
 * Read what CSS needs from a TrueType/OpenType file: family, style, weight —
 * plus the licence and designer fields many fonts embed.
 */

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
    glyphs: maxp !== undefined ? view.getUint16(maxp + 4) : undefined,
  };
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
