import type { Category } from '../types.ts';

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Resolve user input to one category: an id ("603"), a leaf name
 * ("handwritten"), a top-level name ("script"), a path ("script/old school",
 * "Script > Old School") or an alias ("monospace", "pixel"). Throws with
 * suggestions when ambiguous or unknown.
 */
export function resolveCategory(categories: Category[], input: string): Category {
  const byId = categories.find((c) => c.id === input.trim());
  if (byId) return byId;

  const parts = input.split(/\s*[/>]\s*/).map(norm).filter(Boolean);
  const key = parts.join(' / ');
  const matches = categories.filter((c) => {
    const path = c.path.map(norm);
    if (path.join(' / ') === key) return true;
    if (parts.length === 1) return path.length === 2 && path[1] === key;
    return false;
  });
  if (matches.length === 1) return matches[0]!;

  if (matches.length === 0) {
    const exactTop = categories.find((c) => c.path.length === 1 && norm(c.path[0]!) === key);
    if (exactTop) return exactTop;
    const alias = categories.find((c) => c.aliases?.some((a) => norm(a) === key));
    if (alias) return alias;
  }

  const label = (c: Category) => c.path.join(' > ');
  if (matches.length > 1) {
    throw new Error(`"${input}" is ambiguous: ${matches.map(label).join(', ')}. Use the full path or the id.`);
  }
  const loose = categories.filter((c) => c.path.some((p) => norm(p).includes(parts.at(-1) ?? key))).slice(0, 8);
  throw new Error(
    `Unknown category "${input}".${loose.length ? ` Did you mean: ${loose.map(label).join(', ')}?` : ''} Run \`fontetto categories\` for the full list.`,
  );
}
