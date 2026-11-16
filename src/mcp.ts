/**
 * fontetto as an MCP server (stdio, newline-delimited JSON-RPC), for agents
 * that speak MCP but not skills. Dependency-free: the protocol surface used
 * here is small. Tool results reuse the CLI's compact text.
 */
import fs from 'node:fs/promises';
import readline from 'node:readline';
import * as fontetto from './fontetto.ts';
import { formatCategories, formatGet, formatInfo, formatPreview, formatSearch } from './format.ts';
import type { LicenseFilter, Sort } from './types.ts';
import { VERSION } from './version.ts';

const INSTRUCTIONS = `fontetto finds and installs fonts from third-party providers (dafont.com today).
Workflow: search_fonts (by category, words, licence) → optionally preview_fonts to compare candidates in one image → get_font to download and receive @font-face CSS.
Licence matters: pass license "commercial" for client/commercial work, and read the author note (font_info) whenever the licence shows "?".`;

type Args = Record<string, unknown>;
interface Tool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  annotations?: Record<string, boolean>;
  run(args: Args): Promise<{ type: string; [k: string]: unknown }[]>;
}

const str = { type: 'string' };
const font = { type: 'string', description: 'Slug ("bebas-neue"), "dafont:<slug>" or a dafont URL' };
const text = (t: string) => [{ type: 'text', text: t }];

const TOOLS: Tool[] = [
  {
    name: 'search_fonts',
    description: 'Search fonts by name words, category, licence, author or your own tags. One compact line per font: slug, name — author, category, licence (✓ commercial ok, ✗ not, ? read terms), downloads.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { ...str, description: 'Words in the font name, e.g. "retro"' },
        any: { type: 'boolean', description: 'Match ANY of the words in text (or comma-separated phrases), merged into one list — one call instead of one per word' },
        category: { ...str, description: 'Name, path or id: "handwritten", "script/brush", "techno", "603" (see list_categories)' },
        license: { ...str, description: '"commercial" (open + 100% free), "open", or comma-separated kinds: open,free,personal,donationware,shareware,demo' },
        sort: { type: 'string', enum: ['popular', 'newest', 'name'] },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 10 },
        page: { type: 'integer', minimum: 1 },
        author: { ...str, description: 'Author handle from a result, e.g. "dharma-type.d2733"' },
        tags: { type: 'array', items: str, description: 'Search your own tags instead (all must match)' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run(a) {
      const license = typeof a.license === 'string' && a.license
        ? (['commercial', 'open'].includes(a.license) ? a.license : a.license.split(',')) as LicenseFilter
        : undefined;
      const r = await fontetto.search({
        text: a.text as string, any: Boolean(a.any), category: a.category as string, license, sort: a.sort as Sort,
        limit: a.limit as number, page: a.page as number, author: a.author as string, tags: a.tags as string[],
      });
      return text(formatSearch(r));
    },
  },
  {
    name: 'font_info',
    description: 'Everything the provider knows about a font: licence and the author\'s note (often the real terms), styles, glyph count, dates. With files: true, also what the font files can set (NO LOWERCASE, digits, scripts, monospace, CSS family) — often enough to skip a preview.',
    inputSchema: { type: 'object', properties: { font, files: { type: 'boolean', description: 'Also read the font files (downloads to cache, installs nothing)' }, full: { type: 'boolean', description: 'Full author note' } }, required: ['font'] },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run(a) {
      const font = a.files ? await fontetto.inspect(a.font as string) : await fontetto.info(a.font as string);
      return text(formatInfo(font, { full: Boolean(a.full) }));
    },
  },
  {
    name: 'preview_fonts',
    description: 'Render one or more fonts in your own text as ONE numbered contact sheet image, to compare candidates at a glance. Optional: skip it when the text signals already decide.',
    inputSchema: {
      type: 'object',
      properties: {
        fonts: { type: 'array', items: font, minItems: 1, maxItems: 12, description: 'Fonts to compare (slugs, "dafont:<slug>" or URLs)' },
        text: { ...str, description: 'Text to render, e.g. the brand name or headline (max 80 chars)' },
        styles: { type: 'integer', minimum: 1, maximum: 10, default: 1, description: 'Styles per font' },
      },
      required: ['fonts'],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run(a) {
      const r = await fontetto.preview(a.fonts as string[], { text: a.text as string, styles: a.styles as number });
      const files = r.sheet ? [r.sheet] : (r.images ?? []);
      const images = await Promise.all(files.map(async (f) => ({ type: 'image', mimeType: 'image/png', data: (await fs.readFile(f)).toString('base64') })));
      return [...text(formatPreview(r)), ...images];
    },
  },
  {
    name: 'get_font',
    description: 'Download a font into <dir>/<slug>/, unpack it, and write font-face.css with correct family, weight, style and stretch for every file. Returns the CSS path, font-family to use, licence and bundled licence docs.',
    inputSchema: {
      type: 'object',
      properties: { font, dir: { ...str, description: 'Target directory (default "fonts", relative to the working directory)' } },
      required: ['font'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run(a) {
      return text(formatGet(await fontetto.get(a.font as string, { dir: a.dir as string })));
    },
  },
  {
    name: 'list_categories',
    description: 'The category tree with ids, for search_fonts.category.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    async run() {
      return text(formatCategories(fontetto.categories()));
    },
  },
  {
    name: 'tag_font',
    description: 'Add or remove your own tags on a font (e.g. "brand-acme", "display", "approved"). Tagged fonts are searchable with search_fonts.tags.',
    inputSchema: {
      type: 'object',
      properties: { font, add: { type: 'array', items: str }, remove: { type: 'array', items: str } },
      required: ['font'],
    },
    async run(a) {
      const r = await fontetto.tag(a.font as string, (a.add as string[]) ?? [], (a.remove as string[]) ?? []);
      return text(`${r.font.id}: ${r.tags.join(', ') || '(no tags)'}`);
    },
  },
];

type Message = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: Args };

async function handle(msg: Message): Promise<unknown> {
  switch (msg.method) {
    case 'initialize':
      return {
        protocolVersion: (msg.params?.protocolVersion as string) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'fontetto', title: 'fontetto — fonts for design agents', version: VERSION },
        instructions: INSTRUCTIONS,
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS.map(({ run: _run, ...tool }) => tool) };
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) throw Object.assign(new Error(`Unknown tool: ${String(msg.params?.name)}`), { code: -32602 });
      try {
        return { content: await tool.run((msg.params?.arguments as Args) ?? {}) };
      } catch (e) {
        return { isError: true, content: text((e as Error).message) };
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${msg.method}`), { code: -32601 });
  }
}

export function serve(input = process.stdin, output = process.stdout): Promise<void> {
  const send = (m: unknown) => output.write(`${JSON.stringify(m)}\n`);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg: Message;
    try {
      msg = JSON.parse(line) as Message;
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    if (msg.id === undefined) return; // notifications need no answer
    try {
      send({ jsonrpc: '2.0', id: msg.id, result: await handle(msg) });
    } catch (e) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: (e as { code?: number }).code ?? -32603, message: (e as Error).message } });
    }
  });
  return new Promise((resolve) => rl.on('close', resolve));
}
