---
name: fontetto
description: Find, preview and install fonts for a design. Use whenever a page, letter, document, logo, poster, game or brand needs a font, or a request describes how text should look ("in a pixel font", "handwritten heading", "8-bit cursive signature", "retro", "hindi-style", "monospace"…) — search ~100k dafont.com fonts by style and licence, check what each font can set, compare candidates in one image, then install with ready-to-use @font-face CSS. Flags which fonts are free for commercial use.
---

# fontetto — fonts for designs

Run the CLI with Node ≥ 22.18 (no install, no dependencies):

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" <command>
```

If `${CLAUDE_PLUGIN_ROOT}` above was not replaced with a path, use `fontetto` if it is on PATH, else `npx -y github:Bit-Trading-Company/fontetto`. Below, `fontetto` means whichever works.

## Workflow

Aim for a handful of calls: one search per element, one check, one install.

1. **Translate the brief** into a category, style words, and a licence filter. Client, brand or any commercial work → `-l commercial`.
2. **Search once per element.** Several style words? Pass them all with `--any` — one call, merged and de-duplicated:
   ```bash
   fontetto search -c handwritten -l commercial -n 8
   fontetto search script cursive handwriting -c pixel --any -n 8   # words match font names only
   ```
   Columns: `slug  Name — Author · Category · licence ✓/✗/? · downloads · files · accents`. Downloads are a decent quality signal. Need é/ü/ñ? Add `--accents`.
3. **Check the shortlist with text first** — it reads the font files (cached, nothing installed):
   ```bash
   fontetto info vcr-osd-mono polix-mono --files
   ```
   `reads` flags what previews would otherwise reveal: `NO LOWERCASE` (capitals or one unicase form — wrong for body text), `no digits`, `monospace`, and the scripts actually covered (`latin-1`, `cyrillic`, `devanagari`…). `embedded` shows a licence written into the file itself.
4. **Preview only when the choice is about the look** (mood, personality, "does it read as X?"). One call renders every candidate in the real copy as **one numbered sheet** — read that single image:
   ```bash
   fontetto preview samarkan devanagarish upakarti -t "Namaste, Dear Friend"
   ```
   Skip it when category, licence, popularity and `--files` already decide.
5. **Check the licence.** `✓` = free for commercial use. `✗` = personal use only (or paid). `?` = the author's note decides — read it in `info` (`--full` for all of it).
6. **Install** into the project's font folder (`public/fonts`, `src/assets/fonts`, …):
   ```bash
   fontetto get vcr-osd-mono -o public/fonts
   ```
   The output is paste-ready: a `<link>` tag for the generated `font-face.css` (path relative to where you ran it — adjust for the page) and the `font-family` rule with a fitting fallback (plus the native pixel size for bitmap fonts). Pages must be served over http(s); fonts do not load into `data:` URLs.
7. **Tell the user** which fonts you chose, their licences (quote ✗/? cases plainly, and credit CC-BY fonts), and where the files are.

## Commands

| Command | Purpose |
| --- | --- |
| `search [words] [-c cat] [-l lic] [-s sort] [-n N] [--any]` | Find fonts. `--any`: match any of the words. `-l commercial` (open + 100% free), `open`, or kinds `open,free,personal,donationware,shareware,demo`. `-s popular\|newest\|name`. `--author <handle>` lists an author's fonts. |
| `info <font>… [--files]` | Licence + author note, styles, glyphs, dates. `--files`: case, digits, scripts, monospace, CSS family. |
| `preview <font>… [-t text] [--styles N]` | One numbered contact sheet PNG of all of them. |
| `get <font>… [-o dir]` | Install: files, `font-face.css`, `fontetto.json`, paste-ready snippet. |
| `categories` | The full category tree with ids. |
| `tag <font> <tag>… [-r tag]` · `tags` · `search --tag <t>` | Your own tags (e.g. `brand-acme`, `approved`) — searchable later, offline. |

`<font>` is a slug (`bebas-neue`), `dafont:bebas-neue`, or a dafont URL. Add `--json` to any command for structured output.

## Brief → category

| Brief says | `-c` |
| --- | --- |
| clean, modern, geometric, grotesk | `sans-serif` (Basic > Sans serif) |
| classic, editorial, bookish | `serif` |
| code, terminal, typewriter | `monospace`, `typewriter` |
| signature, handwritten, notes | `handwritten`, `school` |
| elegant script, wedding, luxury | `calligraphy` |
| brush, sporty, energetic | `brush` |
| street, urban | `graffiti` |
| retro, vintage, 70s, groovy | `retro`, `groovy`, `fancy/old school`, `script/old school` |
| playful, kids, cartoon, comic | `cartoon`, `comic` |
| pixel, 8-bit, game UI | `pixel` (bitmap fonts list their native px size: use multiples, no anti-aliasing) |
| futuristic, tech, sci-fi | `sci-fi`, `square`, `lcd` |
| medieval, blackletter, fantasy | `blackletter`, `celtic` |
| horror, grunge, distressed | `fancy/horror`, `eroded`, `destroy`, `distorted` |
| military, industrial, stencil | `stencil` |
| icons / symbols | `dingbats` (or a sub-category like `dingbats/animals`) |
| seasonal | `halloween`, `christmas`, `valentine`, `easter` |

Top-level names (`fancy`, `script`, `techno`, `gothic`, `basic`, `dingbats`, `holiday`, `foreign look`) browse a whole group. Ambiguous names (`horror`, `various`, `initials`, `old school`) need the path, e.g. `fancy/horror`.

## Notes

- Provider fonts are mostly display faces. For long body text, pair the pick with a sturdy text face rather than setting paragraphs in it.
- Results are cached (pages for a day, downloads for months), so repeating a command is free. Don't loop over many pages or fonts — narrow the search instead.
- Never present a `✗` or `?` font as cleared for commercial use. If the user needs commercial use and the best match is `✗`, say so and offer the closest `✓` alternatives.
