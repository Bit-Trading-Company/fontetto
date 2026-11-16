#!/usr/bin/env node
import { parseArgs } from 'node:util';
import * as fontetto from './fontetto.ts';
import { formatCategories, formatGet, formatInfo, formatPreview, formatSearch, formatTags } from './format.ts';
import type { LicenseFilter, LicenseKind, Sort } from './types.ts';
import { VERSION } from './version.ts';

const HELP = `fontetto ${VERSION} — fonts for design agents

Usage
  fontetto search [words] [options]   Find fonts (by name words, category, licence, author, tags)
  fontetto info <font>… [--files]     Licence, styles, author note… --files adds what the files can set
  fontetto preview <font>… [-t text]  One numbered contact sheet (PNG) of the fonts, in your own text
  fontetto get <font>… [-o dir]       Download, unpack, and write font-face.css (default dir: ./fonts)
  fontetto categories                 The category tree (names and ids for --category)
  fontetto tag <font> <tag>… [-r tag] Add (or remove with -r) your own tags
  fontetto tags                       List your tags
  fontetto mcp                        Run as an MCP server on stdio

<font> is a slug ("bebas-neue"), "dafont:bebas-neue", or a dafont URL.

Search options
  -c, --category <c>   Name, path or id: "handwritten", "script/brush", "603", "techno"
  -l, --license <l>    commercial (open + free) · open · or kinds: open,free,personal,donationware,shareware,demo
  -s, --sort <s>       popular · newest · name   (default: popular for browsing, relevance for words)
  -n, --limit <n>      Results to show (default 10, max 200)
  -p, --page <n>       Page of the underlying listing
      --author <h>     Author handle from a result, e.g. dharma-type.d2733
      --any            Match ANY of the words (or comma-separated phrases), merged into one list
      --tag <t>        Search your own tags (repeatable; all must match)
      --accents        Only fonts with accented characters
      --euro           Only fonts with the € sign

Other options
  -t, --text <text>    Preview text (preview)
      --size <s>       Preview size: xs · s · m · l (default l)
      --styles <n>     Preview the first n styles of each font (default 1)
      --separate       Also save one PNG per preview
  -o, --out <dir>      Where to put fonts (get) or previews (preview)
      --full           Show the full author note (info)
      --files          Also read the font files (info): case, digits, scripts, family — no install
      --json           Machine-readable output
  -v, --version
  -h, --help

Environment
  FONTETTO_CACHE    cache dir (default ~/.cache/fontetto)
  FONTETTO_TAGS     tags file (default ~/.config/fontetto/tags.json) — point it into a repo to share tags
  FONTETTO_OFFLINE  1 = serve only from cache

Examples
  fontetto search -c handwritten -l commercial -n 5
  fontetto search retro --license commercial
  fontetto search script cursive handwriting -c pixel --any
  fontetto preview bebas-neue coolvetica -t "Acme Coffee"
  fontetto get bebas-neue -o public/fonts`;

const LICENSE_KINDS: LicenseKind[] = ['open', 'free', 'personal', 'donationware', 'shareware', 'demo', 'unknown'];

function parseLicense(value: string | undefined): LicenseFilter | undefined {
  if (!value) return undefined;
  if (value === 'commercial' || value === 'open') return value;
  const kinds = value.split(',').map((s) => s.trim()) as LicenseKind[];
  const bad = kinds.filter((k) => !LICENSE_KINDS.includes(k));
  if (bad.length) throw new Error(`Unknown licence "${bad.join(', ')}". Use commercial, open, or: ${LICENSE_KINDS.join(', ')}`);
  return kinds;
}

function parseSort(value: string | undefined): Sort | undefined {
  if (!value) return undefined;
  if (value === 'popular' || value === 'newest' || value === 'name') return value;
  throw new Error(`Unknown sort "${value}". Use popular, newest or name.`);
}

const int = (value: string | undefined, name: string): number | undefined => {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive whole number`);
  return n;
};

async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values: o, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      category: { type: 'string', short: 'c' },
      license: { type: 'string', short: 'l' },
      sort: { type: 'string', short: 's' },
      limit: { type: 'string', short: 'n' },
      page: { type: 'string', short: 'p' },
      author: { type: 'string' },
      tag: { type: 'string', multiple: true },
      any: { type: 'boolean' },
      accents: { type: 'boolean' },
      euro: { type: 'boolean' },
      provider: { type: 'string' },
      text: { type: 'string', short: 't' },
      size: { type: 'string' },
      styles: { type: 'string' },
      out: { type: 'string', short: 'o' },
      remove: { type: 'string', short: 'r', multiple: true },
      full: { type: 'boolean' },
      separate: { type: 'boolean' },
      files: { type: 'boolean' },
      json: { type: 'boolean' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, ...args] = positionals;
  const print = (data: unknown, text: () => string) => console.log(o.json ? JSON.stringify(data, null, 2) : text());
  const needFont = () => {
    if (!args.length) throw new Error(`Usage: fontetto ${command} <font>`);
    return args;
  };

  if (o.version) return console.log(VERSION);
  if (o.help || !command || command === 'help') return console.log(HELP);

  switch (command) {
    case 'search':
    case 's': {
      const result = await fontetto.search({
        provider: o.provider,
        text: args.join(' ') || undefined,
        category: o.category,
        license: parseLicense(o.license),
        sort: parseSort(o.sort),
        limit: int(o.limit, 'limit'),
        page: int(o.page, 'page'),
        author: o.author,
        tags: o.tag,
        any: o.any,
        accents: o.accents,
        euro: o.euro,
      });
      return print(result, () => formatSearch(result));
    }
    case 'info':
    case 'i': {
      const fonts: (fontetto.Font & { contents?: fontetto.FileReport })[] = [];
      for (const ref of needFont()) fonts.push(await (o.files ? fontetto.inspect(ref) : fontetto.info(ref)));
      return print(fonts.length === 1 ? fonts[0] : fonts, () => fonts.map((f) => formatInfo(f, { full: o.full })).join('\n\n'));
    }
    case 'preview':
    case 'p': {
      const size = o.size as 'xs' | 's' | 'm' | 'l' | undefined;
      if (size && !['xs', 's', 'm', 'l'].includes(size)) throw new Error('--size must be xs, s, m or l');
      const result = await fontetto.preview(needFont(), { text: o.text, size, styles: int(o.styles, 'styles'), dir: o.out, separate: o.separate });
      return print(result, () => formatPreview(result));
    }
    case 'get':
    case 'g': {
      const results: fontetto.GetResult[] = [];
      for (const ref of needFont()) results.push(await fontetto.get(ref, { dir: o.out }));
      return print(results, () => results.map(formatGet).join('\n\n'));
    }
    case 'categories':
    case 'cats': {
      const cats = fontetto.categories(o.provider);
      return print(cats, () => formatCategories(cats));
    }
    case 'tag': {
      const [ref, ...add] = needFont();
      if (!add.length && !o.remove?.length) throw new Error('Usage: fontetto tag <font> <tag>… [-r <tag>]');
      const result = await fontetto.tag(ref!, add, o.remove ?? []);
      return print(result, () => `${result.font.id}: ${result.tags.join(', ') || '(no tags)'}`);
    }
    case 'tags': {
      const tags = await fontetto.listTags();
      return print(Object.fromEntries(tags), () => formatTags(tags));
    }
    case 'mcp': {
      const { serve } = await import('./mcp.ts');
      return serve();
    }
    default:
      throw new Error(`Unknown command "${command}". Run fontetto --help.`);
  }
}

main().catch((e: Error) => {
  console.error(`fontetto: ${e.message}`);
  process.exitCode = 1;
});
