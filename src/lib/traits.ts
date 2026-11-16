/**
 * What a font can actually set, read from its character map — the facts that
 * otherwise only show up in a preview: capitals only? digits? which scripts?
 */
import type { Cmap } from './cmap.ts';

export interface FontTraits {
  /** mixed = real upper and lower case; no-lowercase = capitals (or one unicase form) in both slots. */
  case: 'mixed' | 'no-lowercase' | 'no-uppercase' | 'no-letters';
  digits: boolean;
  /** Writing systems with real coverage, e.g. ["latin", "latin-1", "cyrillic"]. */
  scripts: string[];
  /** Symbol-encoded (dingbats, icons). */
  symbol: boolean;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const UPPER = range(0x41, 0x5a);
const LOWER = range(0x61, 0x7a);
const DIGITS = range(0x30, 0x39);

/** A script counts when most of its probe characters are drawn. */
const SCRIPTS: [string, number[]][] = [
  ['latin-1', [0xe9, 0xe8, 0xfc, 0xf6, 0xf1, 0xe7, 0xe0, 0xdf, 0xc9, 0xd6]], // é è ü ö ñ ç à ß É Ö
  ['latin-ext', [0x142, 0x151, 0x15f, 0x10d, 0x159, 0x17e, 0x11f, 0x131]], // ł ő ş č ř ž ğ ı
  ['vietnamese', [0x1ea1, 0x1ebf, 0x1edd, 0x1ef1, 0x111]], // ạ ế ờ ự đ
  ['greek', [0x391, 0x392, 0x393, 0x3a9, 0x3b1, 0x3b2, 0x3c9]],
  ['cyrillic', [0x410, 0x411, 0x416, 0x42f, 0x430, 0x431, 0x44f]],
  ['hebrew', [0x5d0, 0x5d1, 0x5d2, 0x5e9]],
  ['arabic', [0x627, 0x628, 0x62a, 0x645]],
  ['devanagari', [0x905, 0x915, 0x92e, 0x93f]],
  ['thai', [0xe01, 0xe02, 0xe04, 0xe2d]],
  ['cjk', [0x4e00, 0x4eba, 0x65e5, 0x3042, 0x30a2]],
  ['hangul', [0xac00, 0xb098, 0xd55c]],
];

/**
 * @param lowerToUpper height of "x" over "X" when known. Fonts that put capitals
 *   in the lowercase slots score ~1; real lowercase sits well below.
 */
export function readTraits(cmap: Cmap, lowerToUpper?: number): FontTraits {
  const { lookup } = cmap;
  const upper = UPPER.map(lookup);
  const lower = LOWER.map(lookup);
  const hasUpper = upper.filter(Boolean).length >= 20;
  const realLower = lower.filter((g, i) => g && g !== upper[i]).length >= 20 && !(lowerToUpper !== undefined && lowerToUpper > 0.88);
  const textCase = hasUpper ? (realLower ? 'mixed' : 'no-lowercase') : lower.filter(Boolean).length >= 20 ? 'no-uppercase' : 'no-letters';

  const scripts = hasUpper || realLower ? ['latin'] : [];
  for (const [name, probes] of SCRIPTS) {
    if (probes.filter((cp) => lookup(cp)).length / probes.length >= 0.75) scripts.push(name);
  }
  return { case: textCase, digits: DIGITS.every((cp) => lookup(cp)), scripts, symbol: cmap.symbol };
}

/** Traits of a whole family: what every face can set (case/digits), and every script any face covers. */
export function mergeTraits(all: FontTraits[]): FontTraits | undefined {
  if (!all.length) return undefined;
  const first = all[0]!;
  return {
    case: all.every((t) => t.case === first.case) ? first.case : all.some((t) => t.case === 'mixed') ? 'mixed' : first.case,
    digits: all.some((t) => t.digits),
    scripts: [...new Set(all.flatMap((t) => t.scripts))],
    symbol: all.every((t) => t.symbol),
  };
}

/** "NO LOWERCASE · no digits · latin, latin-1" — the warnings first. */
export function describeTraits(t: FontTraits, monospace = false): string {
  return [
    t.case === 'no-lowercase' && 'NO LOWERCASE',
    t.case === 'no-uppercase' && 'NO UPPERCASE',
    t.case === 'no-letters' && 'no Latin letters',
    !t.digits && 'no digits',
    t.symbol && 'symbol font',
    monospace && 'monospace',
    t.scripts.length ? t.scripts.join(', ') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}
