/**
 * The fontetto API: one place that ties providers, tags, downloads and CSS
 * together. The CLI, the MCP server and library users all call these.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fontFace } from './lib/css.ts';
import { buildFaces, type Face, type FontFile } from './lib/faces.ts';
import { DAY, getBytes } from './lib/http.ts';
import { licenseKinds } from './lib/license.ts';
import { cacheDir } from './lib/paths.ts';
import { readFontFile } from './lib/sfnt.ts';
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
}

export async function search(options: SearchOptions = {}): Promise<SearchResult> {
  const store = await loadTags();
  if (options.tags?.length) return searchTags(options, store);
  const result = await provider(options.provider).search(options);
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
    .sort((a, b) => (b.downloads?.total ?? 0) - (a.downloads?.total ?? 0));
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

export interface GetResult {
  font: Font;
  dir: string;
  /** One entry per CSS face; `files` holds every format of that face. */
  faces: Face[];
  /** Licences, readmes and EULAs that shipped in the archive. */
  docs: string[];
  /** Ready-to-link stylesheet with one @font-face per face. */
  css: string;
  /** CSS family names, ready for `font-family`. */
  families: string[];
  /** Generic fallback that suits the category (serif, cursive, monospace…). */
  fallback: string;
  /** Licence text embedded in the font files themselves, if any. */
  embeddedLicense?: { text?: string; url?: string };
}

const FONT_EXT = /\.(ttf|otf|woff2?)$/i;
const DOC_EXT = /\.(txt|pdf|html?|md|rtf)$/i;

export function genericFallback(category: Category | undefined): string {
  const p = category?.path.join(' ').toLowerCase() ?? '';
  if (/fixed width|typewriter|lcd/.test(p)) return 'monospace';
  if (/serif/.test(p) && !/sans/.test(p)) return 'serif';
  if (/script|calligraphy|handwritten|brush|school/.test(p)) return 'cursive';
  if (/dingbats/.test(p)) return 'fantasy';
  return 'sans-serif';
}

const safeName = (name: string) => path.basename(name).replace(/[^\w.\- ()+&,]/g, '_');

/**
 * Download a font, unpack it into `<dir>/<slug>/`, read each file's real
 * family/weight/style, and write `font-face.css` + `fontetto.json` (provenance
 * and licence) next to it.
 */
export async function get(ref: string, { dir = 'fonts' }: { dir?: string } = {}): Promise<GetResult> {
  const { provider: id, slug } = parseRef(ref);
  const p = provider(id);
  const font = withTags(await loadTags(), await p.info(slug));
  const archive = await p.download(slug);

  const target = path.join(dir, slug);
  await fs.mkdir(target, { recursive: true });

  const files: FontFile[] = [];
  const docs: string[] = [];
  const seen = new Set<string>();
  const entries = /\.zip$/i.test(archive.filename) ? unzip(archive.data) : [{ name: archive.filename, data: archive.data }];

  for (const entry of entries) {
    const base = path.basename(entry.name);
    if (entry.name.includes('__MACOSX') || base.startsWith('.')) continue;
    const isFont = FONT_EXT.test(base);
    if (!isFont && !DOC_EXT.test(base)) continue;
    const name = safeName(base);
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    const out = path.join(target, name);
    await fs.writeFile(out, entry.data);
    if (isFont) files.push({ path: out, info: readFontFile(entry.data) });
    else docs.push(out);
  }
  if (!files.length) throw new Error(`The ${font.name} download contains no TTF/OTF/WOFF files.`);

  const faces = buildFaces(files, font.name);
  const css = path.join(target, 'font-face.css');
  const header = `/* ${font.name} by ${font.author?.name ?? 'unknown'} — ${font.license.label}. ${font.url} */\n`;
  await fs.writeFile(css, header + faces.map((f) => fontFace(f, target)).join('\n\n') + '\n');

  const licensed = files.find((f) => f.info?.license || f.info?.licenseUrl)?.info;
  const embeddedLicense = licensed ? { text: licensed.license, url: licensed.licenseUrl } : undefined;

  await fs.writeFile(
    path.join(target, 'fontetto.json'),
    `${JSON.stringify(
      {
        name: font.name,
        source: font.url,
        author: font.author,
        license: font.license,
        note: font.note,
        embeddedLicense,
        families: [...new Set(faces.map((f) => f.family))],
        retrieved: new Date().toISOString().slice(0, 10),
        fontetto: VERSION,
      },
      null,
      2,
    )}\n`,
  );

  return {
    font,
    dir: target,
    faces,
    docs,
    css,
    families: [...new Set(faces.map((f) => f.family))],
    fallback: genericFallback(font.category),
    ...(embeddedLicense ? { embeddedLicense } : {}),
  };
}

// ── Previews ───────────────────────────────────────────────────────────────

export interface PreviewResult {
  font: Font;
  images: { style: string; path: string }[];
}

/**
 * Render preview PNGs (optionally with your own text) and save them locally so
 * an agent can look at them. Returns one image per style, up to `styles`.
 */
export async function preview(
  ref: string,
  { text, size = 'l', styles = 1, dir }: { text?: string; size?: InfoOptions['previewSize']; styles?: number; dir?: string } = {},
): Promise<PreviewResult> {
  const font = await info(ref, text ? { previewText: text, previewSize: size } : undefined);
  const out = dir ?? path.join(cacheDir(), 'previews');
  await fs.mkdir(out, { recursive: true });
  const picks = font.styles.length ? font.styles.slice(0, Math.max(1, styles)) : [{ file: font.name, preview: font.preview }];
  const images = [];
  for (const [i, style] of picks.entries()) {
    const data = await getBytes(style.preview, { ttl: 30 * DAY });
    if (!data.length) throw new Error(`Preview for ${font.name} came back empty.`);
    const label = text ? `-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)}` : '';
    const file = path.join(out, `${font.slug}-${i}${label}.png`);
    await fs.writeFile(file, data);
    images.push({ style: style.file || font.name, path: file });
  }
  return { font, images };
}

export type { Face, Font, FontSummary, License, Query, SearchResult };
