/**
 * Compact plain-text renderings, written for agents: one font per line, the
 * fields that drive a decision first, nothing decorative. `--json` exists for
 * everything else.
 */
import path from 'node:path';
import type { GetResult, PreviewResult } from './fontetto.ts';
import { cssFamily } from './lib/css.ts';
import { commercialLabel } from './lib/license.ts';
import type { Category, Font, FontSummary, License, SearchResult } from './types.ts';

export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return String(n);
}

const mark = (l: License) => (l.commercial === true ? '✓' : l.commercial === false ? '✗' : '?');
const rel = (p: string) => (path.isAbsolute(p) ? p : `./${p}`);

function fontLine(f: FontSummary, width: number): string {
  const parts = [
    f.name + (f.author ? ` — ${f.author.name}` : ''),
    f.category?.path.join(' > '),
    `${f.license.kind} ${mark(f.license)}`,
    f.downloads ? `${compact(f.downloads.total)} dl` : undefined,
    f.files && f.files > 1 ? `${f.files} files` : undefined,
    f.pixelSize ? `${f.pixelSize}px bitmap` : undefined,
    f.charset?.accents ? 'accents' : undefined,
    f.tags?.length ? `#${f.tags.join(' #')}` : undefined,
  ];
  return `${f.slug.padEnd(width)}  ${parts.filter(Boolean).join(' · ')}`;
}

export function formatSearch(r: SearchResult): string {
  if (!r.fonts.length) return `No fonts found (${r.source}).`;
  const width = Math.min(32, Math.max(...r.fonts.map((f) => f.slug.length)));
  const pager = r.pages > 1 ? ` · page ${r.page}/${r.pages}` : '';
  return [
    `${r.fonts.length} font${r.fonts.length === 1 ? '' : 's'} from ${r.provider}${pager} · licence: ✓ commercial ok, ✗ not, ? read terms`,
    ...r.fonts.map((f) => fontLine(f, width)),
  ].join('\n');
}

export function formatInfo(f: Font, { full = false } = {}): string {
  const rows: [string, string | undefined][] = [
    ['by', f.author && [f.author.name, f.author.website, f.author.handle && `more: --author ${f.author.handle}`].filter(Boolean).join(' · ')],
    ['category', f.category?.path.join(' > ')],
    ['licence', `${f.license.label} — ${commercialLabel(f.license)}${f.license.commercial === null && f.note ? ' (see note)' : ''}`],
    ['stats', f.downloads && [`${compact(f.downloads.total)} downloads (${compact(f.downloads.yesterday)} yesterday)`, f.added && `added ${f.added}`, f.updated && `updated ${f.updated}`].filter(Boolean).join(' · ')],
    ['files', [`${f.styles.length || f.files} styles`, f.glyphs && `${f.glyphs} glyphs`, f.charset?.accents && 'accents', f.charset?.euro && 'euro', f.sizeKB && `${f.sizeKB} KB`, f.pixelSize && `bitmap: use at ${f.pixelSize}px multiples, no anti-aliasing`].filter(Boolean).join(' · ')],
    ['styles', f.styles.map((s) => s.file).filter(Boolean).join(', ')],
    ['tags', f.tags?.join(', ')],
    ['preview', f.preview],
    ['page', f.url],
  ];
  const lines = [`${f.name}  (${f.id})`, ...rows.filter(([, v]) => v).map(([k, v]) => `${k.padEnd(9)}${v}`)];
  if (f.note) {
    const limit = 700;
    const note = full || f.note.length <= limit ? f.note : `${f.note.slice(0, limit).trimEnd()}… (--full for the rest)`;
    lines.push('note', ...note.split('\n').map((l) => `  ${l}`));
  }
  return lines.join('\n');
}

export function formatGet(r: GetResult): string {
  const lines = [
    `${r.font.name} → ${rel(r.dir)}`,
    `css      ${rel(r.css)}`,
    `use      font-family: ${cssFamily(r.families[0]!)}, ${r.fallback};`,
    `licence  ${r.font.license.label} — ${commercialLabel(r.font.license)}${r.font.license.commercial === null ? ` (read the note: fontetto info ${r.font.slug})` : ''}`,
  ];
  if (r.embeddedLicense?.url || r.embeddedLicense?.text) {
    lines.push(`embedded ${[r.embeddedLicense.url, r.embeddedLicense.text?.slice(0, 120)].filter(Boolean).join(' — ')}`);
  }
  lines.push('faces');
  for (const f of r.faces) {
    const style = [f.weight, f.italic ? 'italic' : 'normal', f.stretch !== 'normal' ? f.stretch : ''].filter(Boolean).join(' ');
    lines.push(`  ${cssFamily(f.family)} ${style}  ← ${f.files.map((p) => path.basename(p)).join(', ')}`);
  }
  if (r.docs.length) lines.push(`docs     ${r.docs.map(rel).join(', ')}`);
  return lines.join('\n');
}

export function formatPreview(r: PreviewResult): string {
  return [`${r.font.name} (${r.font.id})`, ...r.images.map((i) => `${i.path}  ${i.style}`)].join('\n');
}

export function formatCategories(categories: Category[]): string {
  const lines: string[] = [];
  for (const c of categories) {
    if (c.path.length === 1) lines.push(`${c.path[0]} (${c.id})`);
    else lines.push(`  ${c.id.padEnd(5)}${c.path[1]}`);
  }
  return lines.join('\n');
}

export function formatTags(tags: [string, number][]): string {
  return tags.length ? tags.map(([t, n]) => `${t} (${n})`).join('\n') : 'No tags yet. Add some: fontetto tag <font> <tag>…';
}
