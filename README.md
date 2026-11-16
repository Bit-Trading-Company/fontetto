# fontetto

**Fonts for design agents.** Search third-party font providers by style and licence, look at candidates
rendered with your own copy, and install the winner with ready-to-use `@font-face` CSS — in a handful of
small, cheap tool calls.

Starts with [dafont.com](https://www.dafont.com) (~100k free fonts in 90 categories). Built so more providers
slot in behind the same commands.

```text
$ fontetto search -c brush -l commercial -n 5
5 fonts from dafont · page 1/13 · licence: ✓ commercial ok, ✗ not, ? read terms
anak-bocil    Anak Bocil — Khurasan™ · Script > Brush · free ✓ · 2.1k dl · 2 files
brusher       Brusher — Vlad Cristea · Script > Brush · free ✓ · 1.8M dl
edo-sz        Edo SZ — Vic Fieger · Script > Brush · free ✓ · 4.4M dl · accents
ninja-naruto  Ninja Naruto — sk89q · Script > Brush · free ✓ · 2.5M dl
hey-august    Hey August — Khurasan™ · Script > Brush · free ✓ · 1.6M dl · 2 files · accents

$ fontetto preview edo-sz brusher -t "Acme Coffee Co."     # PNGs the agent can look at
$ fontetto get edo-sz -o public/fonts
Edo SZ → ./public/fonts/edo-sz
css      ./public/fonts/edo-sz/font-face.css
use      font-family: 'Edo SZ', cursive;
licence  100% Free — commercial ok
faces
  'Edo SZ' 400 normal  ← edosz.ttf
```

## Why a skill (and not just an MCP server)

Agent context is the scarce resource, so fontetto ships as a **skill + CLI** first:

| | Idle cost in every conversation | Cost when used |
| --- | --- | --- |
| **Skill** (recommended) | ~120 tokens (its one-line description) | ~1.3k tokens to load the workflow, then compact CLI output |
| MCP server | ~850 tokens of tool schemas, always | Same compact output |

And the output itself is built for agents: one line per font with the fields that drive a decision
(licence first-class), ~8× smaller than the same results as JSON. `--json` is there when a program wants it.

The MCP server is still included for agents that speak MCP but not skills — same core, same output.

## Install

**Claude Code (plugin with the skill)** — runs straight from source on Node ≥ 22.18, nothing to build:

```text
/plugin marketplace add Bit-Trading-Company/fontetto
/plugin install fontetto@fontetto
```

**CLI**

```bash
npm install -g github:Bit-Trading-Company/fontetto
```

**MCP server** (Claude Desktop, Cursor, any MCP client)

```bash
claude mcp add fontetto -- npx -y github:Bit-Trading-Company/fontetto mcp
```

```json
{ "mcpServers": { "fontetto": { "command": "npx", "args": ["-y", "github:Bit-Trading-Company/fontetto", "mcp"] } } }
```

Tools: `search_fonts`, `font_info`, `preview_font` (returns the images), `get_font`, `list_categories`, `tag_font`.

## Commands

| Command | |
| --- | --- |
| `fontetto search [words] [-c category] [-l licence] [-s sort] [-n N]` | Find fonts by name words, category, licence, author (`--author`), or your tags (`--tag`). |
| `fontetto info <font>` | Everything the provider knows — see below. |
| `fontetto preview <font>… [-t text]` | Render previews (optionally of your own text) to PNG files. |
| `fontetto get <font>… [-o dir]` | Download, unpack, write `font-face.css` and `fontetto.json`. |
| `fontetto categories` | The category tree. |
| `fontetto tag <font> <tag>… [-r tag]` · `fontetto tags` | Your own tags. |
| `fontetto mcp` | Run as an MCP server on stdio. |

`<font>` is a slug (`bebas-neue`), `dafont:bebas-neue` or a dafont URL. Categories accept dafont's names
(`handwritten`, `script/brush`), ids (`604`), whole groups (`techno`) and designer vocabulary
(`monospace`, `pixel`, `blackletter`, `grotesk`). Licence filters: `commercial` (open + 100% free), `open`,
or explicit kinds.

## What you get from dafont

| Field | Notes |
| --- | --- |
| name, slug, author (+ website, handle for "more by this author") | |
| category | e.g. `Script > Handwritten`, with dafont's id |
| licence | dafont's label → `open` · `free` · `personal` · `donationware` · `shareware` · `demo` · `unknown`, plus `commercial: true / false / null` |
| author's note | Often the real terms. When it mentions commercial use, `commercial` becomes `null` ("read terms") instead of trusting the label |
| styles | every font file in the download, each with its own preview |
| downloads (total, yesterday), comments | a decent quality signal |
| charset | accents, euro sign |
| glyph count, size, added/updated dates, old versions, showcase image | |
| bitmap pixel size | pixel fonts list their native size (use multiples, anti-aliasing off) |

After `get`, fontetto reads the font files themselves (OpenType `name`, `OS/2`, `head`, `maxp`) for the
true family name, weight, italic, width (→ `font-stretch`) and any embedded licence (e.g. the OFL), so the CSS
is right even when file names are not. The same face shipped as WOFF2/WOFF/OTF/TTF becomes one `@font-face`
with every format, best first. `fontetto.json` records where the font came from and under which licence.

## Your own tags

```bash
fontetto tag edo-sz brand-acme approved
fontetto search --tag brand-acme
```

Tags live in `~/.config/fontetto/tags.json` together with a snapshot of each tagged font, so tag searches
are instant and offline. Point `FONTETTO_TAGS` at a file in a repo to share a curated set with your team.

## As a library

```ts
import { search, get } from 'fontetto';

const { fonts } = await search({ category: 'handwritten', license: 'commercial', limit: 5 });
const { css, families } = await get(fonts[0].id, { dir: 'public/fonts' });
```

## Being a good guest

fontetto is not a crawler. It fetches only the single page or file an agent asks for, identifies itself
(`fontetto/<version> (+repo URL)`), waits between requests, and caches everything on disk — listings for a
day, font pages for a week, downloads for months — so repeated questions never reach the provider.
`FONTETTO_OFFLINE=1` serves from the cache only.

Fonts belong to their authors. fontetto surfaces each licence and the author's note precisely so agents
respect them; read the terms before commercial use.

## Development

```bash
npm install
npm test              # unit + end-to-end CLI/MCP tests, fully offline (saved pages in test/fixtures)
npm run test:live     # the same flow against dafont.com
npm run typecheck
npm run fixtures      # refresh the saved pages after a markup change
node src/cli.ts …     # run from source — Node strips the types, no build step
```

```text
src/
  cli.ts               command line
  mcp.ts               MCP server (stdio, dependency-free)
  fontetto.ts          the API: search · info · preview · get · tags
  format.ts            compact agent-facing output
  types.ts             the shared vocabulary every provider speaks
  tags.ts              your tags
  providers/
    index.ts           registry
    dafont/            categories · parse (pure HTML → data) · provider (URLs, filters)
  lib/                 http (cache, politeness) · zip · sfnt (font tables) · faces · css · html · licence
skills/fontetto/       the agent skill
test/                  fixtures, builders for synthetic zips and fonts, tests
```

### Adding a provider

Implement `Provider` from [`src/types.ts`](src/types.ts) — `categories`, `search`, `info`, `download` — in
`src/providers/<name>/`, keep parsing pure and test it against saved pages, and register it in
[`src/providers/index.ts`](src/providers/index.ts). Search, info, preview, get, tags, CLI and MCP pick it up;
fonts are addressed as `<name>:<slug>`.

Zero runtime dependencies. MIT © [Bit Trading Company](https://bit-trading-company.com).
