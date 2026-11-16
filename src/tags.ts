/**
 * Your own tags on top of provider metadata. Stored as one JSON file
 * (FONTETTO_TAGS, default ~/.config/fontetto/tags.json) that also keeps a
 * snapshot of each tagged font, so tag searches work offline.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { tagsFile } from './lib/paths.ts';
import type { FontSummary } from './types.ts';

export interface TagStore {
  version: 1;
  fonts: Record<string, { tags: string[]; font: FontSummary }>;
}

export const normalizeTag = (tag: string): string =>
  tag.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function loadTags(file = tagsFile()): Promise<TagStore> {
  try {
    const store = JSON.parse(await fs.readFile(file, 'utf8')) as TagStore;
    return { version: 1, fonts: store.fonts ?? {} };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, fonts: {} };
    throw new Error(`Could not read tags from ${file}: ${(e as Error).message}`);
  }
}

export async function saveTags(store: TagStore, file = tagsFile()): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(store.fonts).sort(([a], [b]) => a.localeCompare(b)));
  await fs.writeFile(file, `${JSON.stringify({ version: 1, fonts: sorted }, null, 2)}\n`);
}

/** Add and remove tags on a font. Returns its tags afterwards. */
export function applyTags(store: TagStore, font: FontSummary, add: string[], remove: string[]): string[] {
  const current = new Set(store.fonts[font.id]?.tags ?? []);
  for (const t of add.map(normalizeTag).filter(Boolean)) current.add(t);
  for (const t of remove.map(normalizeTag)) current.delete(t);
  const tags = [...current].sort();
  if (tags.length) {
    const { tags: _old, ...snapshot } = font;
    store.fonts[font.id] = { tags, font: snapshot };
  } else delete store.fonts[font.id];
  return tags;
}

export function withTags<T extends FontSummary>(store: TagStore, font: T): T {
  const tags = store.fonts[font.id]?.tags;
  return tags?.length ? { ...font, tags } : font;
}

/** Tag → number of fonts carrying it. */
export function tagCounts(store: TagStore): [string, number][] {
  const counts = new Map<string, number>();
  for (const { tags } of Object.values(store.fonts)) for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
