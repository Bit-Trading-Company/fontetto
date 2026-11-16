import type { Category } from '../../types.ts';

/**
 * dafont's theme tree (from www.dafont.com/themes.php). Leaf ids are dafont's
 * own `cat` numbers; top-level ids are 'm<n>' (mtheme.php?id=n).
 */
const TREE: [string, string, [number, string][]][] = [
  ['m1', 'Fancy', [[101, 'Cartoon'], [102, 'Comic'], [103, 'Groovy'], [104, 'Old School'], [105, 'Curly'], [106, 'Western'], [107, 'Eroded'], [108, 'Distorted'], [109, 'Destroy'], [110, 'Horror'], [111, 'Fire, Ice'], [112, 'Decorative'], [113, 'Typewriter'], [114, 'Stencil, Army'], [115, 'Retro'], [116, 'Initials'], [117, 'Grid'], [118, 'Various']]],
  ['m2', 'Foreign look', [[201, 'Chinese, Jpn'], [202, 'Arabic'], [203, 'Mexican'], [204, 'Roman, Greek'], [205, 'Russian'], [206, 'Various']]],
  ['m3', 'Techno', [[301, 'Square'], [302, 'LCD'], [303, 'Sci-fi'], [304, 'Various']]],
  ['bitmap', 'Bitmap', []],
  ['m4', 'Gothic', [[401, 'Medieval'], [402, 'Modern'], [403, 'Celtic'], [404, 'Initials'], [405, 'Various']]],
  ['m5', 'Basic', [[501, 'Sans serif'], [502, 'Serif'], [503, 'Fixed width'], [504, 'Various']]],
  ['m6', 'Script', [[601, 'Calligraphy'], [602, 'School'], [603, 'Handwritten'], [604, 'Brush'], [605, 'Trash'], [606, 'Graffiti'], [607, 'Old School'], [608, 'Various']]],
  ['m7', 'Dingbats', [[701, 'Alien'], [702, 'Animals'], [703, 'Asian'], [704, 'Ancient'], [705, 'Runes, Elvish'], [706, 'Esoteric'], [707, 'Fantastic'], [708, 'Horror'], [709, 'Games'], [710, 'Shapes'], [711, 'Bar Code'], [712, 'Nature'], [713, 'Sport'], [714, 'Heads'], [715, 'Kids'], [716, 'TV, Movie'], [717, 'Logos'], [718, 'Sexy'], [719, 'Army'], [720, 'Music'], [721, 'Various']]],
  ['m8', 'Holiday', [[801, 'Valentine'], [802, 'Easter'], [803, 'Halloween'], [804, 'Christmas'], [805, 'Various']]],
];

/** Words designers use that dafont does not. */
const ALIASES: Record<string, string[]> = {
  bitmap: ['pixel', 'pixel bitmap', '8 bit', '8bit'],
  '501': ['sans', 'sans serif', 'grotesk', 'grotesque'],
  '503': ['monospace', 'mono', 'monospaced', 'code'],
  '401': ['blackletter', 'fraktur'],
  '303': ['futuristic', 'scifi'],
  '302': ['digital', 'segment'],
  '114': ['stencil', 'military'],
  '111': ['fire', 'ice'],
};

export const CATEGORIES: Category[] = TREE.flatMap(([id, name, leaves]) =>
  [{ id, path: [name] }, ...leaves.map(([leaf, leafName]) => ({ id: String(leaf), path: [name, leafName] }))].map((c) =>
    ALIASES[c.id] ? { ...c, aliases: ALIASES[c.id] } : c,
  ),
);

/** Listing page path for a category id. */
export const categoryPath = (id: string): string =>
  id === 'bitmap' ? 'bitmap.php' : id.startsWith('m') ? `mtheme.php?id=${id.slice(1)}` : `theme.php?cat=${id}`;

/** Category from the link dafont prints next to a font ('theme.php?cat=501', 'bitmap.php'). */
export function categoryFromHref(href: string | undefined): Category | undefined {
  if (!href) return undefined;
  const id = href.includes('bitmap.php') ? 'bitmap' : /cat=(\d+)/.exec(href)?.[1] ?? (/mtheme\.php\?id=(\d+)/.exec(href) ? `m${/id=(\d+)/.exec(href)![1]}` : undefined);
  return CATEGORIES.find((c) => c.id === id);
}
