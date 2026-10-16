// Pixel probes of the normals_debug scenario (docs/improvements/01-normals.md 8.2, T8). Pure functions over decoded
// screenshots (decodePNG of lib/formats.mjs), plus readProbePalette(app), which reads the colours to look for from the
// live palette hook (lib/palette.mjs; 07 C53), never from literals. Only the normal-colour triples are constants: they
// are the debug shader's convention (n * 0.5 + 0.5), not theme data.
//
//   colorMask(png, rgb, tol)        the pixels whose every channel is within tol of rgb
//   largestComponent(mask)          the largest 4-connected component: {size, bbox, pixels}
//   probePoint(mask)                inside the largest component, the pixel nearest its centroid whose whole 3x3
//                                   neighbourhood is in the component, or null
//   sampleRGB(png, x, y)            the per-channel median of the 3x3 neighbourhood
//   classifyFace(rgb)               'front' (b > r + 60), 'back' (r > b + 60) or 'other'
//   diffStats(a, b, excludeRects)   {maxDiff, diffPixels} over the pixels outside the rects
//   withinJitter(stats)             maxDiff <= 1 && diffPixels <= 16: the harness's documented overlay jitter
//                                   (README "Known nondeterminism": 1 level in 1-8 glyph pixels) with a 2x margin
// Every image argument is a PNG Buffer or an already decoded {width, height, rgba}.
import { decodePNG } from './formats.mjs';
import { livePalette } from './palette.mjs';

/** The world-normal colours of the "Normal colours (world)" shading (01 3.3): +Z, -X and -Z facing walls. */
export const NORMAL_COLOURS = Object.freeze({
    lavender: Object.freeze([128, 128, 255]),   // +Z
    teal: Object.freeze([0, 128, 128]),         // -X
    olive: Object.freeze([128, 128, 0]),        // -Z
});

/** The smallest connected region (px) that counts as a found colour (a 20 x 20 block; 01 8.2 A1). */
export const MIN_REGION = 400;

const asImage = (png) => (png && png.rgba ? png : decodePNG(png));

/**
 * The pixels whose every channel is within `tol` of `rgb`.
 * @param {Buffer|{width: number, height: number, rgba: Uint8Array}} png
 * @param {number[]} rgb
 * @param {number} tol
 * @returns {{width: number, height: number, data: Uint8Array}} data[i] = 1 for a matching pixel
 */
export function colorMask(png, rgb, tol) {
    const { width, height, rgba } = asImage(png);
    const data = new Uint8Array(width * height);
    if (!rgb) return { width, height, data };
    for (let i = 0, p = 0; p < data.length; p++, i += 4) {
        if (Math.abs(rgba[i] - rgb[0]) <= tol && Math.abs(rgba[i + 1] - rgb[1]) <= tol && Math.abs(rgba[i + 2] - rgb[2]) <= tol) data[p] = 1;
    }
    return { width, height, data };
}

/**
 * The largest 4-connected component of a mask (ties: the first found in scan order).
 * @param {{width: number, height: number, data: Uint8Array}} mask
 * @returns {{size: number, bbox: {x0: number, y0: number, x1: number, y1: number}|null, pixels: Int32Array}}
 */
export function largestComponent(mask) {
    const { width, height, data } = mask;
    const label = new Int32Array(width * height);
    const stack = new Int32Array(width * height);
    let best = { size: 0, bbox: null, pixels: new Int32Array(0) };
    let next = 0;
    for (let start = 0; start < data.length; start++) {
        if (!data[start] || label[start]) continue;
        next++;
        let top = 0;
        stack[top++] = start;
        label[start] = next;
        const members = [];
        let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
        while (top) {
            const p = stack[--top];
            members.push(p);
            const x = p % width, y = (p - x) / width;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            if (x > 0 && data[p - 1] && !label[p - 1]) { label[p - 1] = next; stack[top++] = p - 1; }
            if (x < width - 1 && data[p + 1] && !label[p + 1]) { label[p + 1] = next; stack[top++] = p + 1; }
            if (y > 0 && data[p - width] && !label[p - width]) { label[p - width] = next; stack[top++] = p - width; }
            if (y < height - 1 && data[p + width] && !label[p + width]) { label[p + width] = next; stack[top++] = p + width; }
        }
        if (members.length > best.size) best = { size: members.length, bbox: { x0, y0, x1, y1 }, pixels: Int32Array.from(members) };
    }
    return best;
}

/**
 * Inside the largest component, the pixel nearest its centroid whose whole 3x3 neighbourhood lies in the component
 * (ties: the first in scan order), or null when the mask is empty or no pixel qualifies.
 * @param {{width: number, height: number, data: Uint8Array}} mask
 * @returns {{x: number, y: number, size: number}|null}
 */
export function probePoint(mask) {
    const { width, height } = mask;
    const comp = largestComponent(mask);
    if (!comp.size) return null;
    const inComp = new Uint8Array(width * height);
    let sx = 0, sy = 0;
    for (const p of comp.pixels) { inComp[p] = 1; sx += p % width; sy += Math.floor(p / width); }
    const cx = sx / comp.size, cy = sy / comp.size;
    let best = null, bestD = Infinity;
    const sorted = Int32Array.from(comp.pixels).sort();
    for (const p of sorted) {
        const x = p % width, y = (p - x) / width;
        if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
        let full = true;
        for (let dy = -1; dy <= 1 && full; dy++) for (let dx = -1; dx <= 1; dx++) if (!inComp[p + dy * width + dx]) { full = false; break; }
        if (!full) continue;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bestD) { bestD = d; best = { x, y, size: comp.size }; }
    }
    return best;
}

/**
 * The per-channel median of the 3x3 neighbourhood of (x, y) (clipped at the image border).
 * @param {Buffer|{width: number, height: number, rgba: Uint8Array}} png
 * @param {number} x
 * @param {number} y
 * @returns {number[]} [r, g, b]
 */
export function sampleRGB(png, x, y) {
    const { width, height, rgba } = asImage(png);
    const ch = [[], [], []];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            const i = (yy * width + xx) * 4;
            for (let c = 0; c < 3; c++) ch[c].push(rgba[i + c]);
        }
    }
    return ch.map((v) => { v.sort((a, b) => a - b); return v[(v.length - 1) >> 1]; });
}

/**
 * The face-orientation verdict of a sampled colour: blue = front, red = back (01 3.3); compares channels only, so it
 * does not depend on the exact palette or on the shading factor.
 * @param {number[]} rgb
 * @returns {'front'|'back'|'other'}
 */
export function classifyFace([r, , b]) {
    if (b > r + 60) return 'front';
    if (r > b + 60) return 'back';
    return 'other';
}

/**
 * The difference of two images of the same size outside `excludeRects` ({x, y, w, h}, image pixels): the largest
 * channel difference and the count of pixels with any difference. Images of different sizes give
 * {maxDiff: Infinity, diffPixels: Infinity, sizeMismatch: true}.
 * @param {Buffer|object} a
 * @param {Buffer|object} b
 * @param {{x: number, y: number, w: number, h: number}[]} [excludeRects]
 * @returns {{maxDiff: number, diffPixels: number, sizeMismatch?: boolean}}
 */
export function diffStats(a, b, excludeRects = []) {
    const A = asImage(a), B = asImage(b);
    if (A.width !== B.width || A.height !== B.height) return { maxDiff: Infinity, diffPixels: Infinity, sizeMismatch: true };
    const { width, height } = A;
    const excluded = new Uint8Array(width * height);
    for (const r of excludeRects) {
        for (let y = Math.max(0, r.y); y < Math.min(height, r.y + r.h); y++) {
            for (let x = Math.max(0, r.x); x < Math.min(width, r.x + r.w); x++) excluded[y * width + x] = 1;
        }
    }
    let maxDiff = 0, diffPixels = 0;
    for (let p = 0, i = 0; p < width * height; p++, i += 4) {
        if (excluded[p]) continue;
        const d = Math.max(Math.abs(A.rgba[i] - B.rgba[i]), Math.abs(A.rgba[i + 1] - B.rgba[i + 1]), Math.abs(A.rgba[i + 2] - B.rgba[i + 2]));
        if (d > 0) { diffPixels++; if (d > maxDiff) maxDiff = d; }
    }
    return { maxDiff, diffPixels };
}

/** The in-scenario tolerance for an image comparison (never exact equality; 01 8.2). */
export const withinJitter = (stats) => stats.maxDiff <= 1 && stats.diffPixels <= 16;

/**
 * The probe colours of the running page (07 C53): the section colours of the cards (`wall` is section 0, `sections`
 * by name) and the cabinet colour from the --scene-wall-back token or SceneTheme.wallBack (null until 01 F1-5 adds
 * it), from lib/palette.mjs; plus the constant normal-colour triples.
 * @param {{eval(expr: string, timeoutMs?: number): Promise<any>}} app
 * @returns {Promise<{wall: number[]|null, cabinet: number[]|null, sections: Record<string, number[]|null>,
 *   lavender: number[], teal: number[], olive: number[]}>}
 */
export async function readProbePalette(app) {
    const p = await livePalette(app);
    const sections = {};
    for (const s of p.sections) if (s.name !== null && !(s.name in sections)) sections[s.name] = s.rgb;
    return { wall: p.wall, cabinet: p.cabinet, sections, ...NORMAL_COLOURS };
}
