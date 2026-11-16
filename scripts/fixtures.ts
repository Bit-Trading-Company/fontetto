/**
 * Refresh the saved dafont pages the parser tests run against:
 *   npm run fixtures
 * Pages are trimmed (scripts, styles, ads and forms removed) to keep the repo
 * small while preserving the markup the parser reads.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { USER_AGENT } from '../src/lib/http.ts';

const PAGES: Record<string, string> = {
  'font-bebas-neue.html': 'https://www.dafont.com/bebas-neue.font',
  'font-coolvetica.html': 'https://www.dafont.com/coolvetica.font',
  'font-coolvetica-text.html': 'https://www.dafont.com/coolvetica.font?text=Brand+Name&psize=l',
  'theme-handwritten.html': 'https://www.dafont.com/theme.php?cat=603&fpp=25&sort=pop&l[]=10&l[]=1',
  'search-retro.html': 'https://www.dafont.com/search.php?q=retro&fpp=25',
  'top.html': 'https://www.dafont.com/top.php?fpp=25',
  'bitmap.html': 'https://www.dafont.com/bitmap.php?fpp=25&sort=pop',
};

const dir = path.join(import.meta.dirname, '..', 'test', 'fixtures', 'dafont');

const trim = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<ins[\s\S]*?<\/ins>/gi, '')
    .replace(/<form id="donate[\s\S]*?<\/form>/gi, '')
    .replace(/<head>[\s\S]*?<\/head>/i, '<head></head>');

await fs.mkdir(dir, { recursive: true });
for (const [file, url] of Object.entries(PAGES)) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  // latin1 maps bytes 1:1, so trimming keeps dafont's original windows-1252 bytes.
  const html = Buffer.from(await res.arrayBuffer()).toString('latin1');
  await fs.writeFile(path.join(dir, file), Buffer.from(trim(html), 'latin1'));
  console.log(`${file}  ←  ${url}`);
  await new Promise((r) => setTimeout(r, 1000));
}
