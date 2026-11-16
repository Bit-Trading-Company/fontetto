---
name: fontetto
description: Find, preview and install fonts for a design. Use whenever a design, page, logo, poster, game or brand needs a font or typeface — search by style (handwritten, script, brush, retro, pixel, stencil, horror, sci-fi, serif, sans, monospace…) and licence, render previews with the real copy, then download the files and get ready-to-use @font-face CSS. Covers ~100k fonts from dafont.com and flags which are free for commercial use.
---

# fontetto — fonts for designs

Run the CLI with Node ≥ 22.18 (no install, no dependencies):

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" <command>
```

If `${CLAUDE_PLUGIN_ROOT}` above was not replaced with a path, use `fontetto` if it is on PATH, else `npx -y github:Bit-Trading-Company/fontetto`. Below, `fontetto` means whichever works.

## Workflow

1. **Translate the brief** into a category, optional name words, and a licence filter. Client, brand or any commercial work → `-l commercial`.
2. **Search** — one compact line per font, best candidates first:
   ```bash
   fontetto search -c handwritten -l commercial -n 8
   fontetto search retro -c "fancy/retro" -l commercial      # words match font names only
   ```
   Columns: `slug  Name — Author · Category · licence ✓/✗/? · downloads · files · accents`. Downloads are a decent quality signal. Need é/ü/ñ? Add `--accents`.
3. **Look before choosing.** Render 2–4 candidates with the actual copy, then Read the PNGs:
   ```bash
   fontetto preview baltime thesignature -t "Acme Coffee Co."
   ```
4. **Check the licence** of the pick. `✓` = free for commercial use. `✗` = personal use only (or paid). `?` = the author's note decides — run `fontetto info <slug>` and read the note (add `--full` for all of it).
5. **Install** into the project's font folder (match the project: `public/fonts`, `src/assets/fonts`, …):
   ```bash
   fontetto get baltime -o public/fonts
   ```
   This unpacks the files, reads each file's real family/weight/style/stretch, and writes `font-face.css` (one `@font-face` per face, every format) plus `fontetto.json` (source, author, licence). The output says which `font-family` to use, with a fitting fallback.
6. **Use it**: link or `@import` the generated `font-face.css` (or copy its rules into the project's CSS), then `font-family: 'Baltime', cursive;`.
7. **Tell the user** which font you chose, its licence (quote ✗/? cases plainly), and where the files and licence docs are.

## Commands

| Command | Purpose |
| --- | --- |
| `search [words] [-c cat] [-l lic] [-s sort] [-n N] [-p page]` | Find fonts. `-l commercial` (open + 100% free), `open`, or kinds `open,free,personal,donationware,shareware,demo`. `-s popular\|newest\|name`. `--author <handle>` lists an author's fonts. |
| `info <font>…` | Licence + author note, styles, glyph count, dates, preview and page URLs. |
| `preview <font>… [-t text] [--styles N] [--size xs\|s\|m\|l]` | Saves PNGs and prints their paths. |
| `get <font>… [-o dir]` | Download, unpack, write `font-face.css` + `fontetto.json`. |
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
