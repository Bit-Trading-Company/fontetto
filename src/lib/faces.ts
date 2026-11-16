/**
 * Turn the font files of one download into CSS faces:
 *  - the same face in several formats (woff2, woff, otf, ttf) becomes one
 *    @font-face with every format in `src`, best first;
 *  - weight, style and stretch come from the files themselves;
 *  - faces that would still collide (e.g. "Condensed" and "Crammed" cuts that
 *    are both 400/normal/normal) get their own family name, so none is lost.
 */
import path from 'node:path';
import { fontFormat } from './css.ts';
import { weightFromName, type FontFileInfo } from './sfnt.ts';

export interface FontFile {
  path: string;
  info: FontFileInfo | null;
}

export interface Face {
  /** CSS family name to use. */
  family: string;
  /** The family name stored in the font file. */
  fileFamily: string;
  subfamily: string;
  weight: number;
  italic: boolean;
  stretch: string;
  /** Files for this face, best web format first. */
  files: string[];
  glyphs?: number;
}

const FORMAT_ORDER = ['woff2', 'woff', 'opentype', 'truetype'];
const rankFormat = (file: string) => {
  const i = FORMAT_ORDER.indexOf(fontFormat(file) ?? '');
  return i < 0 ? FORMAT_ORDER.length : i;
};

const PLAIN = /^(regular|normal|roman|book|italic|oblique|bold|bold italic|light|medium|thin|black)$/i;

export function buildFaces(files: FontFile[], fallbackFamily: string): Face[] {
  const groups = new Map<string, FontFile[]>();
  for (const f of files) {
    const stem = path.basename(f.path).replace(/\.[^.]+$/, '').toLowerCase();
    groups.set(stem, [...(groups.get(stem) ?? []), f]);
  }

  const faces: Face[] = [...groups.entries()].map(([stem, group]) => {
    const info = group.find((g) => g.info)?.info;
    const subfamily = info?.subfamily ?? (/italic|oblique/i.test(stem) ? 'Italic' : 'Regular');
    return {
      family: info?.family ?? fallbackFamily,
      fileFamily: info?.family ?? fallbackFamily,
      subfamily,
      weight: info?.weight ?? weightFromName(stem),
      italic: info?.italic ?? /italic|oblique/i.test(stem),
      stretch: info?.stretch ?? 'normal',
      files: group.map((g) => g.path).sort((a, b) => rankFormat(a) - rankFormat(b)),
      ...(info?.glyphs ? { glyphs: info.glyphs } : {}),
    };
  });

  const key = (f: Face) => `${f.family}|${f.weight}|${f.italic}|${f.stretch}`;
  const clashes = new Map<string, Face[]>();
  for (const f of faces) clashes.set(key(f), [...(clashes.get(key(f)) ?? []), f]);
  for (const group of clashes.values()) {
    if (group.length < 2) continue;
    const keep = group.find((f) => PLAIN.test(f.subfamily)) ?? group[0]!;
    for (const f of group) if (f !== keep) f.family = `${f.fileFamily} ${f.subfamily.replace(/\s*(italic|oblique)\s*/i, ' ').trim()}`.trim();
  }

  return faces.sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight || Number(a.italic) - Number(b.italic));
}
