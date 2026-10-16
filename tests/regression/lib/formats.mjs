// Zero-dependency decoders used by the harness and the comparator:
//   * decodePNG  - PNG decoder (8-bit, color types 0/2/3/4/6, filters 0-4, non-interlaced) -> RGBA
//   * readZip    - ZIP reader (stored + deflate, no zip64)
//   * encodePNG  - RGBA -> PNG encoder (used to stitch scrolled UI screenshots)
//   * sha256     - hex digest helper
import zlib from 'node:zlib';
import crypto from 'node:crypto';

export function sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decode a PNG buffer into { width, height, rgba: Uint8Array(width*height*4) }. */
export function decodePNG(buf) {
    buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('Not a PNG file');
    let pos = 8;
    let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
    let palette = null, trns = null;
    const idat = [];
    while (pos + 8 <= buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('latin1', pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        pos += 12 + len;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'PLTE') {
            palette = data;
        } else if (type === 'tRNS') {
            trns = data;
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }
    if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}`);
    if (interlace !== 0) throw new Error('Interlaced PNG not supported');
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
    if (!channels) throw new Error(`Unsupported PNG color type ${colorType}`);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const bpp = channels;
    const stride = width * bpp;
    if (raw.length < (stride + 1) * height) throw new Error('PNG data truncated');
    const pixels = Buffer.alloc(stride * height);
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const ftype = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const out = pixels.subarray(y * stride, (y + 1) * stride);
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? out[x - bpp] : 0;
            const b = prev[x];
            const c = x >= bpp ? prev[x - bpp] : 0;
            let v = line[x];
            switch (ftype) {
                case 0: break;
                case 1: v += a; break;
                case 2: v += b; break;
                case 3: v += (a + b) >> 1; break;
                case 4: {
                    const p = a + b - c;
                    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                    v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
                    break;
                }
                default: throw new Error(`Bad PNG filter type ${ftype}`);
            }
            out[x] = v & 0xff;
        }
        prev = out;
    }
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0, n = width * height; i < n; i++) {
        let r, g, b, al = 255;
        if (colorType === 6) { r = pixels[i * 4]; g = pixels[i * 4 + 1]; b = pixels[i * 4 + 2]; al = pixels[i * 4 + 3]; }
        else if (colorType === 2) { r = pixels[i * 3]; g = pixels[i * 3 + 1]; b = pixels[i * 3 + 2]; }
        else if (colorType === 0) { r = g = b = pixels[i]; }
        else if (colorType === 4) { r = g = b = pixels[i * 2]; al = pixels[i * 2 + 1]; }
        else { // palette
            const idx = pixels[i];
            r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
            al = trns && idx < trns.length ? trns[idx] : 255;
        }
        rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = al;
    }
    return { width, height, rgba };
}

/** Read a ZIP archive. Returns [{ name, isDir, data: Buffer }] in central-directory order. */
export function readZip(buf) {
    buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP end-of-central-directory not found');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const entries = [];
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad ZIP central directory entry');
        const method = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const localOff = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
        p += 46 + nameLen + extraLen + commentLen;
        if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('Bad ZIP local header for ' + name);
        const lNameLen = buf.readUInt16LE(localOff + 26);
        const lExtraLen = buf.readUInt16LE(localOff + 28);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const comp = buf.subarray(start, start + compSize);
        let data;
        if (method === 0) data = Buffer.from(comp);
        else if (method === 8) data = zlib.inflateRawSync(comp);
        else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
        entries.push({ name, isDir: name.endsWith('/'), data });
    }
    return entries;
}

/** Map a filename to a comparison kind. */
export function kindForFilename(name) {
    const n = name.toLowerCase();
    if (n.endsWith('.obj')) return 'obj';
    if (n.endsWith('.mtl')) return 'mtl';
    if (n.endsWith('.gltf')) return 'gltf';
    if (n.endsWith('.json')) return 'json';
    if (n.endsWith('.png')) return 'png';
    if (n.endsWith('.zip')) return 'zip';
    return 'text';
}

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/** Encode RGBA pixels (Uint8Array of width*height*4) as an 8-bit RGBA PNG. Deterministic output. */
export function encodePNG(width, height, rgba) {
    const stride = width * 4;
    if (rgba.length < stride * height) throw new Error('encodePNG: pixel buffer too small');
    const raw = Buffer.alloc((stride + 1) * height);
    const src = Buffer.from(rgba.buffer, rgba.byteOffset, stride * height);
    for (let y = 0; y < height; y++) src.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); // filter 0 (None)
    const chunk = (type, data) => {
        const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
        const out = Buffer.alloc(td.length + 8);
        out.writeUInt32BE(data.length, 0);
        td.copy(out, 4);
        out.writeUInt32BE(crc32(td), td.length + 4);
        return out;
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // RGBA
    return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
