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
}

/** A minimal OpenType file with name, OS/2, head and maxp tables. */
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
  os2.writeUInt16BE(f.weight ?? 400, 4);
  os2.writeUInt16BE(f.width ?? 5, 6);
  os2.writeUInt16BE(f.italic ? 1 : 0x40, 62);
  const head = Buffer.alloc(54);
  const maxp = Buffer.alloc(6);
  maxp.writeUInt16BE(f.glyphs ?? 100, 4);

  const tables: [string, Buffer][] = [['OS/2', os2], ['head', head], ['maxp', maxp], ['name', Buffer.concat([name, ...strings])]];
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
