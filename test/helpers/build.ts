/** Tiny builders for synthetic zips and font files, so unit tests need no binaries. */
import { deflateRawSync } from 'node:zlib';

export function makeZip(entries: { name: string; data: Uint8Array | string; deflate?: boolean }[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.from(e.data);
    const body = e.deflate ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(e.deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(e.deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dir, end]));
}

export interface FakeFont {
  family: string;
  subfamily?: string;
  typoFamily?: string;
  weight?: number;
  width?: number;
  italic?: boolean;
  glyphs?: number;
  license?: string;
  monospace?: boolean;
  /** Character map: which letters exist and how lowercase is drawn. */
  chars?: { lower?: 'real' | 'capitals' | 'same-glyphs' | 'none'; digits?: boolean; extra?: number[] };
}

/** cmap with one format-4 segment per code point (plenty for tests). */
function makeCmap(map: Map<number, number>): Buffer {
  const cps = [...map.keys()].sort((a, b) => a - b);
  const segs = [...cps, 0xffff];
  const n = segs.length;
  const sub = Buffer.alloc(16 + n * 8);
  sub.writeUInt16BE(4, 0);
  sub.writeUInt16BE(sub.length, 2);
  sub.writeUInt16BE(n * 2, 6);
  segs.forEach((cp, i) => {
    sub.writeUInt16BE(cp, 14 + i * 2); // end
    sub.writeUInt16BE(cp, 16 + n * 2 + i * 2); // start
    const delta = cp === 0xffff ? 1 : ((map.get(cp)! - cp) & 0xffff);
    sub.writeUInt16BE(delta, 16 + n * 4 + i * 2);
  });
  const head = Buffer.alloc(12);
  head.writeUInt16BE(1, 2);
  head.writeUInt16BE(3, 4);
  head.writeUInt16BE(1, 6);
  head.writeUInt32BE(12, 8);
  return Buffer.concat([head, sub]);
}

/** A minimal OpenType file with name, OS/2, head, maxp, post and cmap tables. */
export function makeFont(f: FakeFont): Uint8Array {
  const names: [number, string][] = [[1, f.family], [2, f.subfamily ?? 'Regular']];
  if (f.typoFamily) names.push([16, f.typoFamily]);
  if (f.license) names.push([13, f.license]);
  const strings = names.map(([, s]) => Buffer.from(s, 'utf16le').swap16());
  const name = Buffer.alloc(6 + names.length * 12);
  name.writeUInt16BE(names.length, 2);
  name.writeUInt16BE(name.length, 4);
  let pos = 0;
  names.forEach(([id], i) => {
    const r = 6 + i * 12;
    name.writeUInt16BE(3, r);
    name.writeUInt16BE(1, r + 2);
    name.writeUInt16BE(0x409, r + 4);
    name.writeUInt16BE(id, r + 6);
    name.writeUInt16BE(strings[i]!.length, r + 8);
    name.writeUInt16BE(pos, r + 10);
    pos += strings[i]!.length;
  });
  const os2 = Buffer.alloc(96);
  os2.writeUInt16BE(2, 0); // version 2: has x-height and cap height
  os2.writeInt16BE(f.chars?.lower === 'capitals' ? 700 : 500, 86);
  os2.writeInt16BE(700, 88);
  os2.writeUInt16BE(f.weight ?? 400, 4);
  os2.writeUInt16BE(f.width ?? 5, 6);
  os2.writeUInt16BE(f.italic ? 1 : 0x40, 62);
  const head = Buffer.alloc(54);
  const maxp = Buffer.alloc(6);
  maxp.writeUInt16BE(f.glyphs ?? 100, 4);
  const post = Buffer.alloc(32);
  post.writeUInt32BE(0x00030000, 0);
  post.writeUInt32BE(f.monospace ? 1 : 0, 12);

  const map = new Map<number, number>();
  let gid = 1;
  for (let cp = 0x41; cp <= 0x5a; cp++) map.set(cp, gid++);
  const lower = f.chars?.lower ?? 'real';
  if (lower !== 'none') for (let cp = 0x61; cp <= 0x7a; cp++) map.set(cp, lower === 'same-glyphs' ? map.get(cp - 32)! : gid++);
  if (f.chars?.digits ?? true) for (let cp = 0x30; cp <= 0x39; cp++) map.set(cp, gid++);
  for (const cp of f.chars?.extra ?? []) map.set(cp, gid++);

  const tables: [string, Buffer][] = [['OS/2', os2], ['cmap', makeCmap(map)], ['head', head], ['maxp', maxp], ['post', post], ['name', Buffer.concat([name, ...strings])]];
  const header = Buffer.alloc(12 + tables.length * 16);
  header.write('OTTO', 0, 'latin1');
  header.writeUInt16BE(tables.length, 4);
  let offset = header.length;
  tables.forEach(([tag, data], i) => {
    const r = 12 + i * 16;
    header.write(tag, r, 'latin1');
    header.writeUInt32BE(offset, r + 8);
    header.writeUInt32BE(data.length, r + 12);
    offset += data.length;
  });
  return new Uint8Array(Buffer.concat([header, ...tables.map(([, d]) => d)]));
}
