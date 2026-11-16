/**
 * The shared vocabulary every provider speaks. Providers map their own pages
 * and APIs onto these shapes, so the CLI, the MCP server and the skill never
 * need to know where a font came from.
 */

/** Normalised licence buckets, ordered from most to least permissive. */
export type LicenseKind =
  | 'open' // public domain, GPL, OFL…
  | 'free' // free for any use, including commercial
  | 'personal' // free for personal use only
  | 'donationware'
  | 'shareware'
  | 'demo'
  | 'unknown';

export interface License {
  kind: LicenseKind;
  /** The provider's own wording, e.g. "Free for personal use". */
  label: string;
  /** Whether commercial use is allowed: true, false, or null when the author's note must be read. */
  commercial: boolean | null;
}

export interface Category {
  /** Provider-specific id, e.g. "603" for dafont's Script > Handwritten. */
  id: string;
  /** Human path, e.g. ["Script", "Handwritten"]. */
  path: string[];
  /** Designer vocabulary that should find this category ("monospace", "pixel"…). */
  aliases?: string[];
}

export interface Author {
  name: string;
  /** Provider handle for listing the author's other fonts (pass to search `author`). */
  handle?: string;
  /** The author's own website, when given. */
  website?: string;
}

/** What a listing (search, category, top…) knows about a font. */
export interface FontSummary {
  /** Globally unique: "<provider>:<slug>". */
  id: string;
  provider: string;
  slug: string;
  name: string;
  author?: Author;
  category?: Category;
  license: License;
  downloads?: { total: number; yesterday: number };
  /** Number of font files (styles) in the download. */
  files?: number;
  /** Download size in KB. */
  sizeKB?: number;
  /** Bitmap fonts: render at this pixel size (or a multiple), anti-aliasing off. */
  pixelSize?: number;
  /** Character set hints from the provider. */
  charset?: { accents: boolean; euro: boolean };
  comments?: number;
  /** Provider page for humans. */
  url: string;
  /** Preview image (PNG). */
  preview: string;
  /** Your own tags (see `fontetto tag`). */
  tags?: string[];
}

export interface FontStyle {
  /** File name inside the download, e.g. "Coolvetica Rg It.otf". */
  file: string;
  preview: string;
}

/** Everything the font page exposes. */
export interface Font extends FontSummary {
  styles: FontStyle[];
  /** The author's note — often holds the real licence terms. Plain text. */
  note?: string;
  glyphs?: number;
  /** ISO dates. */
  added?: string;
  updated?: string;
  /** Large showcase image, when the author uploaded one. */
  illustration?: string;
  /** Direct download URL (zip). */
  download: string;
  /** Older versions of this font on the provider. */
  oldVersions?: string[];
}

export type Sort = 'popular' | 'newest' | 'name';

/** A license filter: a named preset or explicit kinds. */
export type LicenseFilter = 'commercial' | 'open' | LicenseKind[];

export interface Query {
  /** Free-text search on font names. */
  text?: string;
  /** Category id or name ("handwritten", "script/brush", "603"). */
  category?: string;
  /** Author handle from a previous result (e.g. "dharma-type.d2733"). */
  author?: string;
  license?: LicenseFilter;
  /** Only fonts with accented characters / the euro sign. */
  accents?: boolean;
  euro?: boolean;
  sort?: Sort;
  /** Max results to return (default 10). */
  limit?: number;
  /** 1-based page of the underlying listing. */
  page?: number;
}

export interface SearchResult {
  provider: string;
  fonts: FontSummary[];
  /** Pages available in the underlying listing (for `page`). */
  pages: number;
  page: number;
  /** Where the listing came from (for humans and debugging). */
  source: string;
}

export interface Download {
  /** Suggested file name, e.g. "coolvetica.zip". */
  filename: string;
  data: Uint8Array;
}

export interface InfoOptions {
  /** Render style previews with this text instead of the provider's sample. */
  previewText?: string;
  previewSize?: 'xs' | 's' | 'm' | 'l';
}

/** Implement this to add a font source (Google Fonts, Font Squirrel, …). */
export interface Provider {
  id: string;
  name: string;
  homepage: string;
  categories(): Category[];
  search(query: Query): Promise<SearchResult>;
  info(slug: string, options?: InfoOptions): Promise<Font>;
  download(slug: string): Promise<Download>;
}
