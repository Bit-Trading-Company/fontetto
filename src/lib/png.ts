/**
 * Just enough PNG for contact sheets: decode any non-interlaced PNG to 8-bit
 * grayscale, and encode grayscale back. Font previews are ink on paper, so
 * gray loses nothing that matters for judging a typeface.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';

export interface Gray {
  width: number;
  height: number;
  /** Row-major, one byte per pixel, 0 = black, 255 = white. */
  pixels: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const luma = (r: number, g: number, b: number) => Math.round(0.299 * r + 0.587 * g + 0.114 * b);
/** Composite over white paper. */
const overWhite = (v: number, a: number) => Math.round((v * a + 255 * (255 - a)) / 255);

export function decodePng(buf: Uint8Array): Gray {
  if (!SIGNATURE.every((b, i) => buf[i] === b)) throw new Error('Not a PNG');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let width = 0, height = 0, depth = 0, type = 0;
  let palette: Uint8Array | undefined;
  let alpha: Uint8Array | undefined;
  const idat: Uint8Array[] = [];

  for (let p = 8; p < buf.length; ) {
    const len = view.getUint32(p);
    const name = String.fromCharCode(...buf.subarray(p + 4, p + 8));
    const data = buf.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') {
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
      depth = data[8]!;
      type = data[9]!;
      if (data[12]) throw new Error('Interlaced PNGs are not supported');
    } else if (name === 'PLTE') palette = data;
    else if (name === 'tRNS') alpha = data;
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    p += 12 + len;
  }
  const channels = CHANNELS[type];
  if (!channels || !width || !height) throw new Error('Unsupported PNG');

  const raw = inflateSync(Buffer.concat(idat));
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const rows = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      let v = line[x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 0xff;
    }
    prev = out;
  }

  const sample = (row: Uint8Array, i: number): number => {
    if (depth === 8) return row[i]!;
    if (depth === 16) return row[i * 2]!;
    const perByte = 8 / depth;
    const shift = (perByte - 1 - (i % perByte)) * depth;
    return (row[Math.floor(i / perByte)]! >> shift) & ((1 << depth) - 1);
  };
  const scale = depth < 8 && type !== 3 ? 255 / ((1 << depth) - 1) : 1;

  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      let g: number;
      if (type === 3) {
        const i = sample(row, x);
        g = overWhite(luma(palette![i * 3]!, palette![i * 3 + 1]!, palette![i * 3 + 2]!), alpha?.[i] ?? 255);
      } else {
        const s = (k: number) => sample(row, x * channels + k) * scale;
        if (type === 0) g = s(0);
        else if (type === 4) g = overWhite(s(0), s(1));
        else if (type === 2) g = luma(s(0), s(1), s(2));
        else g = overWhite(luma(s(0), s(1), s(2)), s(3));
      }
      pixels[y * width + x] = g;
    }
  }
  return { width, height, pixels };
}

function chunk(name: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(name, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

export function encodePng({ width, height, pixels }: Gray): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  return new Uint8Array(
    Buffer.concat([Buffer.from(SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())]),
  );
}
