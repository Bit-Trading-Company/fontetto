/** The CLI and MCP server, end to end, against a seeded offline cache. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { makeFont, makeZip } from './helpers/build.ts';
import { seededEnv } from './helpers/fixtures.ts';

const CLI = path.join(import.meta.dirname, '..', 'src', 'cli.ts');
const D = 'https://www.dafont.com';

const env = seededEnv({
  [`${D}/theme.php?cat=603&fpp=25&sort=pop&l[]=10&l[]=1`]: 'theme-handwritten.html',
  [`${D}/search.php?q=retro&fpp=200`]: 'search-retro.html',
  [`${D}/bebas-neue.font`]: 'font-bebas-neue.html',
  'https://dl.dafont.com/dl/?f=bebas_neue': makeZip([
    { name: 'BebasNeue-Regular.otf', data: makeFont({ family: 'Bebas Neue', license: 'SIL OFL 1.1' }), deflate: true },
    { name: 'BebasNeue-Regular.woff2', data: 'wOF2' },
    { name: 'OFL.txt', data: 'SIL Open Font License' },
    { name: '__MACOSX/._BebasNeue-Regular.otf', data: 'junk' },
    { name: 'preview.png', data: 'png' },
  ]),
});

const run = (...args: string[]) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

test('help and version', () => {
  assert.match(run('--help').out, /fontetto search/);
  assert.match(run('-v').out, /^\d+\.\d+\.\d+\n$/);
});

test('search a category with a licence filter', () => {
  const { out, code } = run('search', '-c', 'handwritten', '-l', 'commercial', '-n', '20');
  assert.equal(code, 0);
  const lines = out.trim().split('\n');
  assert.match(lines[0]!, /^20 fonts from dafont · page 1\/\d+/);
  assert.ok(lines.slice(1).every((l) => /Script > Handwritten · (open|free) ✓/.test(l)), out);
});

test('search words, filtered and sorted locally, as JSON', () => {
  const { out } = run('search', 'retro', '-l', 'commercial', '-s', 'popular', '--json');
  const { fonts } = JSON.parse(out);
  assert.ok(fonts.length > 0);
  assert.ok(fonts.every((f: { license: { commercial: boolean } }) => f.license.commercial));
  const totals = fonts.map((f: { downloads: { total: number } }) => f.downloads.total);
  assert.deepEqual(totals, [...totals].sort((a, b) => b - a));
});

test('info', () => {
  const { out } = run('info', 'https://www.dafont.com/bebas-neue.font');
  assert.match(out, /^Bebas Neue {2}\(dafont:bebas-neue\)/);
  assert.match(out, /licence  Public domain \/ GPL \/ OFL — commercial ok/);
  assert.match(out, /more: --author dharma-type\.d\d+/);
});

test('get: unpack, read the files, write CSS and provenance', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fontetto-get-'));
  const { out, code, err } = run('get', 'bebas-neue', '-o', dir, '--json');
  assert.equal(code, 0, err);
  const [r] = JSON.parse(out);
  assert.deepEqual(r.families, ['Bebas Neue']);
  assert.equal(r.faces.length, 1, 'otf + woff2 of one face → one @font-face');
  assert.deepEqual(fs.readdirSync(r.dir).sort(), ['BebasNeue-Regular.otf', 'BebasNeue-Regular.woff2', 'OFL.txt', 'font-face.css', 'fontetto.json']);
  const css = fs.readFileSync(r.css, 'utf8');
  assert.match(css, /src: url\('BebasNeue-Regular\.woff2'\) format\('woff2'\),\s+url\('BebasNeue-Regular\.otf'\) format\('opentype'\);/);
  const meta = JSON.parse(fs.readFileSync(path.join(r.dir, 'fontetto.json'), 'utf8'));
  assert.equal(meta.license.kind, 'open');
  assert.equal(meta.embeddedLicense.text, 'SIL OFL 1.1');
});

test('tags round-trip and are searchable', () => {
  assert.match(run('tag', 'bebas-neue', 'Display', 'brand acme').out, /dafont:bebas-neue: brand-acme, display/);
  assert.match(run('search', '--tag', 'display').out, /bebas-neue +Bebas Neue .*#brand-acme #display/);
  assert.match(run('tags').out, /display \(1\)/);
  assert.match(run('tag', 'bebas-neue', '-r', 'display', '-r', 'brand-acme').out, /\(no tags\)/);
});

test('errors are short and actionable', () => {
  const { code, err } = run('search', '-c', 'horror');
  assert.equal(code, 1);
  assert.equal(err.trim(), 'fontetto: "horror" is ambiguous: Fancy > Horror, Dingbats > Horror. Use the full path or the id.');
  assert.match(run('search', '-l', 'cheap').err, /Unknown licence "cheap"/);
  assert.match(run('frobnicate').err, /Unknown command/);
});

test('mcp: initialize, list tools, call a tool', async () => {
  const child = spawn(process.execPath, [CLI, 'mcp'], { env });
  const lines: string[] = [];
  let buf = '';
  child.stdout.on('data', (d: Buffer) => {
    buf += d;
    const parts = buf.split('\n');
    buf = parts.pop()!;
    lines.push(...parts);
  });
  const send = (m: object) => child.stdin.write(`${JSON.stringify(m)}\n`);
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_fonts', arguments: { category: 'handwritten', license: 'commercial', limit: 3 } } });
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope' } });
  send({ jsonrpc: '2.0', id: 5, method: 'bogus' });
  child.stdin.end();
  await new Promise((r) => child.on('close', r));

  const byId = Object.fromEntries(lines.map((l) => JSON.parse(l)).map((m) => [m.id, m]));
  assert.equal(byId[1].result.serverInfo.name, 'fontetto');
  assert.deepEqual(byId[2].result.tools.map((t: { name: string }) => t.name), ['search_fonts', 'font_info', 'preview_font', 'get_font', 'list_categories', 'tag_font']);
  assert.match(byId[3].result.content[0].text, /^3 fonts from dafont/);
  assert.equal(byId[4].error.code, -32602);
  assert.equal(byId[5].error.code, -32601);
});
