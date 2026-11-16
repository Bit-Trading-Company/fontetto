/**
 * dafont.com — ~100k free fonts across 90 themes.
 *
 * Every request is a single page a person could open in a browser; results are
 * cached on disk so repeated questions never hit dafont again. There is no bulk
 * crawling.
 */
import { resolveCategory } from '../../lib/categories.ts';
import { DAY, getBytes, getText, HttpError } from '../../lib/http.ts';
import { licenseKinds } from '../../lib/license.ts';
import type { Category, Download, Font, FontSummary, InfoOptions, Provider, Query, SearchResult } from '../../types.ts';
import { CATEGORIES, categoryPath } from './categories.ts';
import { LICENSES, ORIGIN, parseFontPage, parseListing, parsePages } from './parse.ts';

const ENCODING = 'windows-1252';
const PAGE_SIZES = [25, 50, 100, 200];
const SORTS = { popular: 'pop', newest: 'date', name: 'alpha' } as const;

const SLUG = /^[a-z0-9][a-z0-9-]*$/i;
const HANDLE = /^[a-z0-9][a-z0-9-]*\.d\d+$/i;

function inCategory(font: FontSummary, category: Category): boolean {
  if (!font.category) return false;
  return category.path.length === 1 ? font.category.path[0] === category.path[0] : font.category.id === category.id;
}

const SORTERS: Record<string, (a: FontSummary, b: FontSummary) => number> = {
  popular: (a, b) => (b.downloads?.total ?? 0) - (a.downloads?.total ?? 0),
  name: (a, b) => a.name.localeCompare(b.name),
};

export const dafont: Provider = {
  id: 'dafont',
  name: 'DaFont',
  homepage: ORIGIN,

  categories: () => CATEGORIES,

  async search(query: Query): Promise<SearchResult> {
    const limit = Math.max(1, Math.min(query.limit ?? 10, 200));
    const page = Math.max(1, query.page ?? 1);
    const category = query.category ? resolveCategory(CATEGORIES, query.category) : undefined;
    const kinds = licenseKinds(query.license);
    const text = query.text?.trim();

    if (query.author && !HANDLE.test(query.author)) {
      throw new Error(`Author handles look like "dharma-type.d2733" (shown as author.handle in results).`);
    }

    // dafont's search ignores licence/sort filters, so text searches fetch a full
    // page and filter here. Every other listing filters server-side.
    const params = new URLSearchParams();
    let path: string;
    if (text) {
      path = 'search.php';
      params.set('q', text);
      params.set('fpp', '200');
    } else {
      path = query.author ?? (category ? categoryPath(category.id) : query.sort === 'newest' ? 'new.php' : 'top.php');
      params.set('fpp', String(PAGE_SIZES.find((n) => n >= limit) ?? 200));
      params.set('sort', SORTS[query.sort ?? 'popular']);
      for (const kind of kinds ?? []) params.append('l[]', String(LICENSES.find((l) => l.kind === kind)!.code));
      if (query.accents) params.set('a', 'on');
      if (query.euro) params.set('e', 'on');
    }
    if (page > 1) params.set('page', String(page));

    const [base, own] = path.split('?');
    const qs = [own, params.toString().replace(/l%5B%5D=/g, 'l[]=')].filter(Boolean).join('&');
    const url = `${ORIGIN}/${base}?${qs}`;
    const html = await getText(url, { encoding: ENCODING, ttl: DAY });

    let fonts = parseListing(html, query.author ? undefined : category);
    if (text) {
      if (category) fonts = fonts.filter((f) => inCategory(f, category));
      if (kinds) fonts = fonts.filter((f) => kinds.includes(f.license.kind));
      if (query.accents) fonts = fonts.filter((f) => f.charset?.accents);
      if (query.euro) fonts = fonts.filter((f) => f.charset?.euro);
      const sorter = query.sort && SORTERS[query.sort];
      if (sorter) fonts = [...fonts].sort(sorter);
    }

    return { provider: 'dafont', fonts: fonts.slice(0, limit), page, pages: parsePages(html), source: url };
  },

  async info(slug: string, options: InfoOptions = {}): Promise<Font> {
    if (!SLUG.test(slug)) throw new Error(`Not a dafont slug: "${slug}"`);
    const params = new URLSearchParams();
    if (options.previewText) {
      params.set('text', options.previewText.slice(0, 80));
      params.set('psize', options.previewSize ?? 'l');
    }
    const url = `${ORIGIN}/${slug}.font${params.size ? `?${params}` : ''}`;
    try {
      return parseFontPage(await getText(url, { encoding: ENCODING, ttl: 7 * DAY }), slug);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw new Error(`No font "${slug}" on dafont. Search for it: fontetto search ${slug.replace(/-/g, ' ')}`);
      throw e;
    }
  },

  async download(slug: string): Promise<Download> {
    const font = await this.info(slug);
    const key = new URL(font.download).searchParams.get('f') ?? slug;
    return { filename: `${key}.zip`, data: await getBytes(font.download, { ttl: 90 * DAY }) };
  },
};
