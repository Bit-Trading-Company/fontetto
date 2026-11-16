/**
 * fontetto as a library:
 *
 *   import { search, get } from 'fontetto';
 *   const { fonts } = await search({ category: 'handwritten', license: 'commercial', limit: 5 });
 *   const { css, families } = await get(fonts[0].id, { dir: 'public/fonts' });
 */
export { categories, get, info, inspect, listTags, parseRef, preview, search, tag } from './fontetto.ts';
export type { FileReport, FontRef, GetResult, PreviewOptions, PreviewResult, PreviewRow, SearchOptions } from './fontetto.ts';
export { PROVIDERS, provider } from './providers/index.ts';
export type * from './types.ts';
export { VERSION } from './version.ts';
