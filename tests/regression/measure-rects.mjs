#!/usr/bin/env node
// Measures the allowed rectangles of a rect-limited re-baseline from the DOM (docs/improvements/01-normals.md 8.4, T2;
// 07 C57), so they are never typed by hand.
//   node tests/regression/measure-rects.mjs --manifest tests/regression/expected/<commit-id>.json [--root .]
//        [--page index.html] [--chrome <path>] [--dry-run]
// For every `expect` / `mayChange` entry of the manifest that carries a `measure` object
//   { "frame": "canvas" | "page", "window": [width, height], "selectors": [".viewport-controls", ...], "pad": 8 }
// it opens the page under --root (the CANDIDATE build) with the harness lib at that window size (one fresh page per
// size), takes the getBoundingClientRect of each selector that is present and visible, pads it by `pad` px
// (default 8: focus rings, shadows, anti-aliasing) and writes the entry's `rects` (integer {x, y, w, h, label}, in the
// capture frame and clipped to it) and `size`:
//   frame "canvas": relative to #three-canvas, size = the canvas size (app.screenshotCanvas captures);
//   frame "page":   relative to the page, size = the window size (ui_visual's full-page captures).
// A selector that is missing or hidden is reported and gives no rectangle. compare.mjs --expect then accepts an image
// difference of such an entry only when every differing pixel lies inside the rectangles and the PNG has that size.
// --dry-run prints the result without writing the manifest. Run it like the harness: one process at a time.
// Exit code: 0 = measured (or nothing to measure), 1 = a measurement failed, 2 = usage error.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startStaticServer } from './lib/server.mjs';
import { launchChrome } from './lib/cdp.mjs';
import { AppPage } from './lib/app.mjs';

const USAGE = 'Usage: node tests/regression/measure-rects.mjs --manifest <file.json> [--root .] [--page index.html] [--chrome <path>] [--dry-run]';

function parseArgs(argv) {
    const a = { root: '.', page: 'index.html', dryRun: false };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        const next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`Missing value for ${k}`); return v; };
        if (k === '--manifest') a.manifest = next();
        else if (k === '--root') a.root = next();
        else if (k === '--page') a.page = next();
        else if (k === '--chrome') a.chrome = next();
        else if (k === '--dry-run') a.dryRun = true;
        else throw new Error(`Unknown argument ${k}`);
    }
    if (!a.manifest) throw new Error('--manifest is required');
    return a;
}

/**
 * Validate one `measure` object. Returns { frame, window: [w, h], selectors, pad }.
 * @param {*} m
 * @param {string} where
 */
export function parseMeasure(m, where) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error(`${where}: "measure" must be an object`);
    for (const k of Object.keys(m)) if (!['frame', 'window', 'selectors', 'pad'].includes(k)) throw new Error(`${where}: unknown measure key "${k}"`);
    if (m.frame !== 'canvas' && m.frame !== 'page') throw new Error(`${where}: measure.frame must be "canvas" or "page"`);
    if (!Array.isArray(m.window) || m.window.length !== 2 || !m.window.every((n) => Number.isInteger(n) && n > 0)) {
        throw new Error(`${where}: measure.window must be [width, height]`);
    }
    if (!Array.isArray(m.selectors) || !m.selectors.length || !m.selectors.every((s) => typeof s === 'string' && s)) {
        throw new Error(`${where}: measure.selectors must be a non-empty list of CSS selectors`);
    }
    const pad = m.pad === undefined ? 8 : m.pad;
    if (!Number.isInteger(pad) || pad < 0) throw new Error(`${where}: measure.pad must be a non-negative integer`);
    return { frame: m.frame, window: [m.window[0], m.window[1]], selectors: m.selectors.slice(), pad };
}

/**
 * The rectangles of one entry from the measured DOM boxes (pure, unit-tested): each visible box translated by -origin,
 * padded by `pad`, rounded outwards to whole pixels and clipped to [0, size).
 * @param {{selector: string, found: boolean, visible: boolean, box: {left: number, top: number, right: number, bottom: number}|null}[]} boxes
 * @param {{left: number, top: number}} origin
 * @param {number[]} size  [width, height] of the capture frame
 * @param {number} pad
 * @returns {{rects: {x: number, y: number, w: number, h: number, label: string}[], missing: string[]}}
 */
export function rectsFromBoxes(boxes, origin, size, pad) {
    const rects = [];
    const missing = [];
    for (const { selector, found, visible, box } of boxes) {
        if (!found || !visible || !box) { missing.push(`${selector} (${found ? 'hidden' : 'not found'})`); continue; }
        const x0 = Math.max(0, Math.floor(box.left - origin.left - pad));
        const y0 = Math.max(0, Math.floor(box.top - origin.top - pad));
        const x1 = Math.min(size[0], Math.ceil(box.right - origin.left + pad));
        const y1 = Math.min(size[1], Math.ceil(box.bottom - origin.top + pad));
        if (x1 <= x0 || y1 <= y0) { missing.push(`${selector} (outside the frame)`); continue; }
        rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, label: selector });
    }
    return { rects, missing };
}

/**
 * JSON with 2-space indentation in which every array or object that fits on one line of at most 120 characters is
 * written on one line (a rectangle, a size, a measure object), so a measured manifest stays reviewable.
 * @param {*} value
 * @param {string} [indent]
 * @returns {string}
 */
export function formatJson(value, indent = '') {
    const flat = JSON.stringify(value);
    if (value === null || typeof value !== 'object' || indent.length + flat.length <= 120) return flat;
    const inner = indent + '  ';
    if (Array.isArray(value)) return `[\n${value.map((v) => inner + formatJson(v, inner)).join(',\n')}\n${indent}]`;
    return `{\n${Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatJson(v, inner)}`).join(',\n')}\n${indent}}`;
}

/** The page-side measurement: the canvas rect and, per selector, its box and whether it is visible. */
function measureExpr(selectors) {
    return `(() => {
        const c = document.getElementById('three-canvas');
        const cb = c ? c.getBoundingClientRect() : null;
        const boxes = ${JSON.stringify(selectors)}.map((selector) => {
            const el = document.querySelector(selector);
            if (!el) return { selector, found: false, visible: false, box: null };
            const cs = getComputedStyle(el);
            const b = el.getBoundingClientRect();
            const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0;
            return { selector, found: true, visible, box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom } };
        });
        return { canvas: cb ? { left: cb.left, top: cb.top, width: cb.width, height: cb.height } : null,
                 window: [innerWidth, innerHeight], boxes };
    })()`;
}

export async function main(argv = process.argv.slice(2), log = console.log) {
    let args;
    try { args = parseArgs(argv); } catch (e) { log(e.message); log(USAGE); return 2; }
    const file = path.resolve(args.manifest);
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { log(`cannot read ${file}: ${e.message}`); return 2; }
    const jobs = [];
    try {
        for (const list of ['expect', 'mayChange']) {
            (doc[list] || []).forEach((entry, k) => {
                if (entry && typeof entry === 'object' && entry.measure !== undefined) {
                    jobs.push({ entry, where: `${list}[${k}]`, measure: parseMeasure(entry.measure, `${list}[${k}]`) });
                }
            });
        }
    } catch (e) { log(e.message); return 2; }
    if (!jobs.length) { log(`${file}: no entry has a "measure" object; nothing to measure`); return 0; }
    const root = path.resolve(args.root);
    if (!fs.existsSync(path.join(root, args.page))) { log(`No ${args.page} under ${root}`); return 2; }

    const server = await startStaticServer(root);
    let browser;
    let failed = false;
    try {
        browser = await launchChrome({ chromePath: args.chrome });
        const bySize = new Map();
        for (const job of jobs) {
            const key = job.measure.window.join('x');
            if (!bySize.has(key)) bySize.set(key, []);
            bySize.get(key).push(job);
        }
        for (const [key, group] of bySize) {
            const [width, height] = group[0].measure.window;
            const app = await AppPage.open(browser, server.url + args.page, { width, height });
            try {
                await app.settle(300);
                for (const job of group) {
                    const m = await app.eval(measureExpr(job.measure.selectors));
                    let origin, size;
                    if (job.measure.frame === 'canvas') {
                        if (!m.canvas) { log(`FAIL  ${job.where}: #three-canvas not found`); failed = true; continue; }
                        origin = m.canvas;
                        size = [Math.round(m.canvas.width), Math.round(m.canvas.height)];
                    } else {
                        origin = { left: 0, top: 0 };
                        size = [m.window[0], m.window[1]];
                    }
                    const { rects, missing } = rectsFromBoxes(m.boxes, origin, size, job.measure.pad);
                    if (!rects.length) { log(`FAIL  ${job.where}: no selector gave a rectangle (${missing.join(', ')})`); failed = true; continue; }
                    job.entry.size = size;
                    job.entry.rects = rects;
                    log(`OK    ${job.where} ${job.entry.output} @ ${key} (${job.measure.frame} frame ${size.join('x')}): `
                        + rects.map((r) => `${r.label} {x: ${r.x}, y: ${r.y}, w: ${r.w}, h: ${r.h}}`).join(', ')
                        + (missing.length ? `; skipped ${missing.join(', ')}` : ''));
                }
            } finally {
                await app.close().catch(() => {});
            }
        }
    } finally {
        try { if (browser) await browser.close(); } catch { /* ignore */ }
        try { await server.close(); } catch { /* ignore */ }
    }
    if (failed) return 1;
    if (args.dryRun) { log('--dry-run: manifest not written'); return 0; }
    fs.writeFileSync(file, formatJson(doc) + '\n');
    log(`Wrote ${file}`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}
