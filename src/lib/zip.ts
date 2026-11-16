/**
 * Minimal ZIP reader (stored + deflate), enough for font archives.
 * Uses the central directory, so sizes are always known.
 */
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function unzip(buf: Uint8Array): ZipEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip archive');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== CENTRAL) throw new Error('Corrupt zip central directory');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const rawName = buf.subarray(p + 46, p + 46 + nameLen);
    const name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'latin1').decode(rawName);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    if (view.getUint32(local, true) !== LOCAL) throw new Error(`Corrupt zip entry: ${name}`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const body = buf.subarray(start, start + compressed);
    if (method === 0) entries.push({ name, data: body });
    else if (method === 8) entries.push({ name, data: new Uint8Array(inflateRawSync(body)) });
    // Other methods (e.g. LZMA) are vanishingly rare for fonts; skip them.
  }
  return entries;
}
