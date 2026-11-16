/**
 * The fontetto API: one place that ties providers, tags, downloads and CSS
 * together. The CLI, the MCP server and library users all call these.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { cssFamily, fontFace } from './lib/css.ts';
import { buildFaces, type Face } from './lib/faces.ts';
import { DAY, getBytes } from './lib/http.ts';
import { licenseKinds } from './lib/license.ts';
import { cacheDir } from './lib/paths.ts';
import { decodePng, encodePng } from './lib/png.ts';
import { readFontFile, type FontFileInfo } from './lib/sfnt.ts';
import { contactSheet } from './lib/sheet.ts';
import { mergeTraits, type FontTraits } from './lib/traits.ts';
import { unzip } from './lib/zip.ts';
import { DEFAULT_PROVIDER, PROVIDERS, provider } from './providers/index.ts';
import { applyTags, loadTags, normalizeTag, saveTags, tagCounts, withTags } from './tags.ts';
import type { Category, Font, FontSummary, InfoOptions, License, Query, SearchResult } from './types.ts';
import { VERSION } from './version.ts';

export interface FontRef {
  provider: string;
  slug: string;
}

/** Accepts "slug", "provider:slug" or a provider URL such as https://www.dafont.com/bebas-neue.font */
export function parseRef(ref: string): FontRef {
  const s = ref.trim();
  const url = /^https?:\/\/(?:www\.)?dafont\.com\/(?:[a-z]{2}\/)?([^/?#]+)\.font/i.exec(s);
  if (url) return { provider: 'dafont', slug: url[1]!.toLowerCase() };
  const m = /^([a-z]+):(.+)$/i.exec(s);
  if (m && PROVIDERS[m[1]!.toLowerCase()]) return { provider: m[1]!.toLowerCase(), slug: m[2]!.toLowerCase() };
  return { provider: DEFAULT_PROVIDER, slug: s.toLowerCase() };
}

export interface SearchOptions extends Query {
  provider?: string;
  /** Search your own tags instead of the provider (all tags must match). */
  tags?: string[];
  /**
   * Treat `text` as alternatives: fonts matching ANY of the words (or of the
   * comma-separated phrases) are merged into one de-duplicated list, sorted by
   * popularity unless `sort` says otherwise. One call instead of one per word.
   */
  any?: boolean;
}

/** "script, pixel art" → ["script", "pixel art"]; "script cursive" → ["script", "cursive"]. */
export const splitTerms = (text: string): string[] =>
  [...new Set((text.includes(',') ? text.split(',') : text.split(/\s+/)).map((t) => t.trim()).filter(Boolean))];

const BY_POPULARITY = (a: FontSummary, b: FontSummary) => (b.downloads?.total ?? 0) - (a.downloads?.total ?? 0);

export async function search(options: SearchOptions = {}): Promise<SearchResult> {
  const store = await loadTags();
  if (options.tags?.length) return searchTags(options, store);
  const p = provider(options.provider);
  const terms = options.any && options.text ? splitTerms(options.text) : [];

  let result: SearchResult;
  if (terms.length > 1) {
    const results = [];
    for (const text of terms) results.push(await p.search({ ...options, text, limit: 200, page: undefined }));
    const seen = new Set<string>();
    const fonts = results.flatMap((r) => r.fonts).filter((f) => !seen.has(f.id) && seen.add(f.id));
    fonts.sort(options.sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : BY_POPULARITY);
    result = { provider: p.id, fonts: fonts.slice(0, options.limit ?? 10), page: 1, pages: 1, source: results.map((r) => r.source).join(' + ') };
  } else {
    result = await p.search(options);
  }
  return { ...result, fonts: result.fonts.map((f) => withTags(store, f)) };
}

function searchTags(options: SearchOptions, store: Awaited<ReturnType<typeof loadTags>>): SearchResult {
  const wanted = options.tags!.map(normalizeTag);
  const kinds = licenseKinds(options.license);
  const text = options.text?.toLowerCase();
  const fonts = Object.values(store.fonts)
    .filter(({ tags }) => wanted.every((t) => tags.includes(t)))
    .map(({ tags, font }) => ({ ...font, tags }))
    .filter((f) => !options.provider || f.provider === options.provider)
    .filter((f) => !kinds || kinds.includes(f.license.kind))
    .filter((f) => !text || f.name.toLowerCase().includes(text))
    .sort(BY_POPULARITY);
  return { provider: 'tags', fonts: fonts.slice(0, options.limit ?? 10), page: 1, pages: 1, source: `tags: ${wanted.join(', ')}` };
}

export async function info(ref: string, options?: InfoOptions): Promise<Font> {
  const { provider: id, slug } = parseRef(ref);
  return withTags(await loadTags(), await provider(id).info(slug, options));
}

export function categories(providerId?: string): Category[] {
  return provider(providerId).categories();
}

// ── Tags ───────────────────────────────────────────────────────────────────

export async function tag(ref: string, add: string[], remove: string[] = []): Promise<{ font: FontSummary; tags: string[] }> {
  const store = await loadTags();
  const font = await info(ref);
  const tags = applyTags(store, font, add, remove);
  await saveTags(store);
  return { font, tags };
}

export async function listTags(): Promise<[string, number][]> {
  return tagCounts(await loadTags());
}

// ── Download & install ─────────────────────────────────────────────────────

/** What the font files themselves say — available before installing (`info --files`). */
export interface FileReport {
  /** CSS faces; `files` are file names inside the download. */
  faces: Face[];
  /** CSS family names, ready for `font-family`. */
  families: string[];
  /** Generic fallback: from the files (monospace), the name, or the category. */
  fallback: string;
  /** Case, digits and scripts the font really covers. */
  traits?: FontTraits;
  monospace: boolean;
  /** Licence, readme and EULA files in the download. */
  docs: string[];
  /** Licence text embedded in the font files themselves, if any. */
  embeddedLicense?: { text?: string; url?: string };
}

export interface GetResult extends FileReport {
  font: Font;
  dir: string;
  /** Ready-to-link stylesheet with one @font-face per face. */
  css: string;
  /** Paste-ready: a <link> tag (relative to the current directory) and the font-family rule. */
  snippet: { link: string; rule: string };
}

const FONT_EXT = /\.(ttf|otf|woff2?)$/i;
const DOC_EXT = /\.(txt|pdf|html?|md|rtf)$/i;

/**
 * The CSS generic family that best stands in for a font. The files decide
 * monospace (they say so in their post table); the name decides when it is
 * explicit ("VCR OSD Mono", "Pixel Script"); otherwise the category does.
 */
export function genericFallback(category: Category | undefined, { name = '', monospace = false } = {}): string {
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  if (monospace || /\b(mono|monospaced?|code|terminal|console)\b/.test(words)) return 'monospace';
  if (/\b(cursive|script|handwrit\w*|calligraph\w*|signature)\b/.test(words)) return 'cursive';
  if (/\bserif\b/.test(words) && !/\bsans\b/.test(words)) return 'serif';

  const p = category?.path.join(' ').toLowerCase() ?? '';
  if (/fixed width|typewriter|lcd/.test(p)) return 'monospace';
  if (/serif/.test(p) && !/sans/.test(p)) return 'serif';
  if (/script|calligraphy|handwritten|brush|school/.test(p)) return 'cursive';
  if (/dingbats/.test(p)) return 'fantasy';
  return 'sans-serif';
}

const safeName = (name: string) => path.basename(name).replace(/[^\w.\- ()+&,]/g, '_');

interface Unpacked {
  font: Font;
  fonts: { name: string; data: Uint8Array; info: FontFileInfo | null }[];
  docs: { name: string; data: Uint8Array }[];
}

/** Fetch a font's archive (cached) and pick out its font and licence files. */
async function unpack(ref: string): Promise<Unpacked> {
  const { provider: id, slug } = parseRef(ref);
  const p = provider(id);
  const font = withTags(await loadTags(), await p.info(slug));
  const archive = await p.download(slug);
  const entries = /\.zip$/i.test(archive.filename) ? unzip(archive.data) : [{ name: archive.filename, data: archive.data }];

  const out: Unpacked = { font, fonts: [], docs: [] };
  const seen = new Set<string>();
  for (const entry of entries) {
    const base = path.basename(entry.name);
    if (entry.name.includes('__MACOSX') || base.startsWith('.')) continue;
    const isFont = FONT_EXT.test(base);
    if (!isFont && !DOC_EXT.test(base)) continue;
    const name = safeName(base);
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    if (isFont) out.fonts.push({ name, data: entry.data, info: readFontFile(entry.data) });
    else out.docs.push({ name, data: entry.data });
  }
  if (!out.fonts.length) throw new Error(`The ${font.name} download contains no TTF/OTF/WOFF files.`);
  return out;
}

function report(u: Unpacked, dir = ''): FileReport {
  const faces = buildFaces(u.fonts.map((f) => ({ path: path.join(dir, f.name), info: f.info })), u.font.name);
  const infos = u.fonts.map((f) => f.info).filter((i): i is FontFileInfo => i !== null);
  const monospace = infos.length > 0 && infos.every((i) => i.monospace);
  const licensed = infos.find((i) => i.license || i.licenseUrl);
  const traits = mergeTraits(infos.flatMap((i) => (i.traits ? [i.traits] : [])));
  return {
    faces,
    families: [...new Set(faces.map((f) => f.family))],
    fallback: genericFallback(u.font.category, { name: u.font.name, monospace }),
    ...(traits ? { traits } : {}),
    monospace,
    docs: u.docs.map((d) => path.join(dir, d.name)),
    ...(licensed ? { embeddedLicense: { text: licensed.license, url: licensed.licenseUrl } } : {}),
  };
}

/** Everything `info` knows, plus what the font files say — without installing. */
export async function inspect(ref: string): Promise<Font & { contents: FileReport }> {
  const u = await unpack(ref);
  return { ...u.font, contents: report(u) };
}

/**
 * Download a font, unpack it into `<dir>/<slug>/`, read each file's real
 * family/weight/style, and write `font-face.css` + `fontetto.json` (provenance
 * and licence) next to it.
 */
export async function get(ref: string, { dir = 'fonts' }: { dir?: string } = {}): Promise<GetResult> {
  const u = await unpack(ref);
  const { font } = u;
  const target = path.join(dir, font.slug);
  await fs.mkdir(target, { recursive: true });
  for (const f of [...u.fonts, ...u.docs]) await fs.writeFile(path.join(target, f.name), f.data);

  const files = report(u, target);
  const css = path.join(target, 'font-face.css');
  const bitmap = font.pixelSize ? ` Bitmap font: set at ${font.pixelSize}px or multiples, with -webkit-font-smoothing: none.` : '';
  const header = `/* ${font.name} by ${font.author?.name ?? 'unknown'} — ${font.license.label}. ${font.url}${bitmap} */\n`;
  await fs.writeFile(css, header + files.faces.map((f) => fontFace(f, target)).join('\n\n') + '\n');

  await fs.writeFile(
    path.join(target, 'fontetto.json'),
    `${JSON.stringify(
      {
        name: font.name,
        source: font.url,
        author: font.author,
        license: font.license,
        note: font.note,
        embeddedLicense: files.embeddedLicense,
        families: files.families,
        traits: files.traits,
        retrieved: new Date().toISOString().slice(0, 10),
        fontetto: VERSION,
      },
      null,
      2,
    )}\n`,
  );

  const size = font.pixelSize ? ` font-size: ${font.pixelSize}px; -webkit-font-smoothing: none;` : '';
  return {
    font,
    dir: target,
    css,
    ...files,
    snippet: {
      link: `<link rel="stylesheet" href="${css.split(path.sep).map(encodeURIComponent).join('/')}">`,
      rule: `font-family: ${cssFamily(files.families[0]!)}, ${files.fallback};${size}`,
    },
  };
}

// ── Previews ───────────────────────────────────────────────────────────────

export interface PreviewRow {
  /** The number drawn on the sheet. */
  n: number;
  id: string;
  name: string;
  style: string;
  license: License;
}

export interface PreviewResult {
  /** One PNG with every preview stacked and numbered (absent only if a preview could not be decoded). */
  sheet?: string;
  rows: PreviewRow[];
  /** Individual PNGs, when asked for with `separate` (or as a fallback). */
  images?: string[];
}

export interface PreviewOptions {
  /** Render this text instead of the provider sample (max 80 characters). */
  text?: string;
  size?: InfoOptions['previewSize'];
  /** Styles per font (default 1). */
  styles?: number;
  /** Output directory (default: the cache). */
  dir?: string;
  /** Also keep one PNG per preview. */
  separate?: boolean;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Render previews of one or more fonts (optionally with your own text) into a
 * single numbered contact sheet, so they can be compared with one look.
 */
export async function preview(refs: string | string[], options: PreviewOptions = {}): Promise<PreviewResult> {
  const { text, size = 'l', styles = 1, dir, separate = false } = options;
  const list = Array.isArray(refs) ? refs : [refs];
  if (!list.length) throw new Error('Nothing to preview.');
  const out = dir ?? path.join(cacheDir(), 'previews');
  await fs.mkdir(out, { recursive: true });

  const rows: PreviewRow[] = [];
  const pngs: Uint8Array[] = [];
  for (const ref of list) {
    const font = await info(ref, text ? { previewText: text, previewSize: size } : undefined);
    const picks = font.styles.length ? font.styles.slice(0, Math.max(1, styles)) : [{ file: font.name, preview: font.preview }];
    for (const style of picks) {
      const data = await getBytes(style.preview, { ttl: 30 * DAY });
      if (!data.length) throw new Error(`Preview for ${font.name} came back empty.`);
      pngs.push(data);
      rows.push({ n: rows.length + 1, id: font.id, name: font.name, style: style.file || font.name, license: font.license });
    }
  }

  const base = `preview-${slugify(rows.map((r) => r.id.split(':')[1]).join(' ')).slice(0, 60)}${text ? `-${slugify(text).slice(0, 24)}` : ''}`;
  const writeEach = async () =>
    Promise.all(pngs.map(async (data, i) => {
      const file = path.join(out, `${base}-${i + 1}.png`);
      await fs.writeFile(file, data);
      return file;
    }));

  let sheet: string | undefined;
  try {
    sheet = path.join(out, `${base}.png`);
    await fs.writeFile(sheet, encodePng(contactSheet(pngs.map(decodePng))));
  } catch {
    return { rows, images: await writeEach() }; // an unusual PNG: fall back to separate files
  }
  return { sheet, rows, ...(separate ? { images: await writeEach() } : {}) };
}

export type { Face, Font, FontSummary, License, Query, SearchResult };
