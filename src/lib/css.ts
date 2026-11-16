import path from 'node:path';
import type { Face } from './faces.ts';

const FORMATS: Record<string, string> = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };

export const fontFormat = (file: string): string | undefined =>
  FORMATS[file.split('.').pop()?.toLowerCase() ?? ''];

/** Quote a family name for CSS. */
export const cssFamily = (family: string): string => `'${family.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** One @font-face rule. `src` paths are written relative to `base`. */
export function fontFace(face: Face, base: string): string {
  const src = face.files.map((file) => {
    const url = encodeURI(path.relative(base, file).split(path.sep).join('/'));
    const format = fontFormat(file);
    return `url('${url}')${format ? ` format('${format}')` : ''}`;
  });
  return [
    '@font-face {',
    `  font-family: ${cssFamily(face.family)};`,
    `  src: ${src.join(',\n       ')};`,
    `  font-weight: ${face.weight};`,
    `  font-style: ${face.italic ? 'italic' : 'normal'};`,
    ...(face.stretch !== 'normal' ? [`  font-stretch: ${face.stretch};`] : []),
    '  font-display: swap;',
    '}',
  ].join('\n');
}
