/**
 * Pure HTML → data functions for dafont pages. No I/O here, so every change
 * can be tested against saved pages in test/fixtures/dafont.
 */
import { decodeEntities, toInt, toText } from '../../lib/html.ts';
import type { Category, Font, FontStyle, FontSummary, License, LicenseKind } from '../../types.ts';
import { categoryFromHref } from './categories.ts';

export const ORIGIN = 'https://www.dafont.com';

/** dafont licence labels → normalised licence + the `l[]` filter code dafont uses. */
export const LICENSES: { label: string; kind: LicenseKind; commercial: boolean | null; code: number }[] = [
  { label: 'Public domain / GPL / OFL', kind: 'open', commercial: true, code: 10 },
  { label: '100% Free', kind: 'free', commercial: true, code: 1 },
  { label: 'Free for personal use', kind: 'personal', commercial: false, code: 6 },
  { label: 'Donationware', kind: 'donationware', commercial: null, code: 13 },
  { label: 'Shareware', kind: 'shareware', commercial: false, code: 2 },
  { label: 'Demo', kind: 'demo', commercial: false, code: 3 },
  { label: 'Unknown', kind: 'unknown', commercial: null, code: 0 },
];

export function parseLicense(label: string | undefined): License {
  const clean = decodeEntities(label ?? '').trim();
  const known = LICENSES.find((l) => l.label.toLowerCase() === clean.toLowerCase());
  return known
    ? { kind: known.kind, label: known.label, commercial: known.commercial }
    : { kind: 'unknown', label: clean || 'Unknown', commercial: null };
}

const abs = (url: string) => (url.startsWith('//') ? `https:${url}` : url.startsWith('/') ? ORIGIN + url : url);

const first = (re: RegExp, s: string): string | undefined => re.exec(s)?.[1];

/** The header shared by listing entries and font pages: name, author, category, stats, licence. */
function parseHeader(block: string, fallbackCategory?: Category) {
  const left = first(/<div class="lv1left[^"]*">([\s\S]*?)<\/div>/, block) ?? '';
  const right = first(/<div class="lv1right[^"]*">([\s\S]*?)<\/div>/, block) ?? '';
  const stats = first(/<div class="lv2right">([\s\S]*?)<\/div>/, block) ?? '';

  const nameHtml = (first(/^([\s\S]*?)(?:&nbsp;<span title=|\s+by\s+<a |$)/, left) ?? left).replace(/<b>\d+\.<\/b>/, ''); // "<b>1.</b>" rank on top.php
  const authorMatch = /\sby\s+<a href="([^"]+)">([^<]*)<\/a>/.exec(left);
  const website = first(/<a class="tdn" title="([^"]+)" href=/, left);
  const catHrefs = [...right.matchAll(/href="((?:m?theme|bitmap)\.php[^"]*)"/g)].map((m) => m[1]);
  const category = categoryFromHref(catHrefs.at(-1)) ?? fallbackCategory;
  const pixelSize = toInt(first(/\((\d+) px\)/, right));
  const downloads = /([\d,]+) downloads? \(([\d,]+) yesterday\)/.exec(stats);
  const dl = /class="dl" title="([\d.]+) ?([KM])" href="([^"]+)"/.exec(block);

  return {
    name: toText(nameHtml),
    author: authorMatch
      ? { name: toText(authorMatch[2]!), handle: authorMatch[1]!.split('?')[0], ...(website ? { website: decodeEntities(website) } : {}) }
      : undefined,
    category: category && { id: category.id, path: category.path }, // aliases stay in the tree
    license: parseLicense(first(/copyright">([^<]+)</, stats)),
    downloads: downloads ? { total: toInt(downloads[1]), yesterday: toInt(downloads[2]) } : undefined,
    comments: toInt(first(/(\d[\d,]*) comments?</, stats)),
    files: toInt(first(/(\d+) font files?/, stats)) || 1,
    ...(pixelSize ? { pixelSize } : {}),
    charset: { accents: /title="Accents"/.test(left), euro: /title="Euro"/.test(left) },
    sizeKB: dl ? Math.round(Number(dl[1]) * (dl[2] === 'M' ? 1024 : 1)) : undefined,
    download: dl ? abs(decodeEntities(dl[3]!)) : undefined,
  };
}

function summary(slug: string, header: ReturnType<typeof parseHeader>, preview: string): FontSummary {
  const { download: _download, ...rest } = header;
  return {
    id: `dafont:${slug}`,
    provider: 'dafont',
    slug,
    ...rest,
    url: `${ORIGIN}/${slug}.font`,
    preview: abs(decodeEntities(preview)),
  };
}

/** Number of pages in a listing, from its pager. */
export function parsePages(html: string): number {
  const pager = first(/<div class="noindex">([\s\S]*?)<\/div>/, html) ?? '';
  return Math.max(1, ...[...pager.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1])));
}

/** Any listing page: search, theme, mtheme, bitmap, top, new, author. */
export function parseListing(html: string, category?: Category): FontSummary[] {
  const blocks = html.split(/(?=<div class="lv1left)/).slice(1);
  const fonts: FontSummary[] = [];
  for (const block of blocks) {
    const preview = /background-image:url\(([^)]+)\);?" class="preview(?:_\w+)?"><a href="([^"/?]+)\.font/.exec(block);
    const slug = preview?.[2] ?? first(/href="([^"/?]+)\.font/, block);
    if (!slug) continue;
    fonts.push(summary(slug, parseHeader(block, category), preview?.[1] ?? ''));
  }
  return fonts;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "July 15, 2010" → "2010-07-15". */
export function parseDate(s: string | undefined): string | undefined {
  const m = s && /([a-z]+) (\d{1,2}), (\d{4})/i.exec(s);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
  return month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[2]!.padStart(2, '0')}` : undefined;
}

/** A font page: www.dafont.com/<slug>.font */
export function parseFontPage(html: string, slug: string): Font {
  const start = html.indexOf('<div class="lv1left');
  if (start < 0) throw new Error(`No font "${slug}" on dafont`);
  const body = html.slice(start);
  const header = parseHeader(body);
  const name = toText(first(/<h1>([\s\S]*?)<\/h1>/, html) ?? '') || header.name;

  const styles: FontStyle[] = [...body.matchAll(/<span class="filename">([^<]+)<\/span><div style="background-image:url\(([^)]+)\);?" class="preview(?:_\w+)?">/g)]
    .map((m) => ({ file: decodeEntities(m[1]!), preview: abs(decodeEntities(m[2]!)) }));
  if (!styles.length) {
    const preview = first(/background-image:url\(([^)]+)\);?" class="preview(?:_\w+)?"/, body);
    const file = first(/<b>([^<]+\.(?:ttf|otf|woff2?|fon))<\/b>/i, body);
    if (preview) styles.push({ file: file ? decodeEntities(file) : '', preview: abs(decodeEntities(preview)) });
  }

  const noteHtml = first(/<b>Note of the author<\/b><\/i><\/div><div>([\s\S]*?)<div id="comment_end"/, body);
  const dates = first(/First seen on DaFont:([^<]*)/, body) ?? '';
  const [added, updated] = dates.split(/\s+-\s+Updated:/);
  const illustration = first(/src="(\/img\/illustration\/[^"]+)"/, body);
  const glyphs = toInt(first(/View all glyphs \((\d+)\)/, body));

  if (!header.download) throw new Error(`No download link for "${slug}" on dafont`);
  const note = noteHtml ? toText(noteHtml) : undefined;
  // The author's note often grants (or sells) commercial use beyond dafont's
  // label. When it talks about commercial use, the honest answer is "read it".
  const license = header.license.commercial === false && note && /commercial/i.test(note)
    ? { ...header.license, commercial: null }
    : header.license;
  return {
    ...summary(slug, { ...header, name, license }, styles[0]?.preview ?? ''),
    styles,
    ...(note ? { note } : {}),
    ...(glyphs ? { glyphs } : {}),
    ...(parseDate(added) ? { added: parseDate(added) } : {}),
    ...(parseDate(updated) ? { updated: parseDate(updated) } : {}),
    ...(illustration ? { illustration: abs(illustration) } : {}),
    download: header.download,
    ...(() => {
      const old = [...new Set([...body.matchAll(/href="([^"/?]+-old\d+)\.font/g)].map((m) => m[1]!))];
      return old.length ? { oldVersions: old } : {};
    })(),
  };
}
