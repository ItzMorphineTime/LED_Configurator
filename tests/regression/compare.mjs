#!/usr/bin/env node
// Golden-master comparator.
//   node tests/regression/compare.mjs <baselineDir> <candidateDir> [--expect a.json[,b.json]] [--tolerance 1e-5]
//        [--png-threshold 0] [--png-max-percent 0.01] [--shot-threshold 8] [--shot-max-percent 0.5]
//        [--only scenarioA,scenarioB] [--ignore-keys keyA,keyB] [--rename old=new[,old=new]] [--diff-bbox] [--verbose]
// Exit code: 0 = no FAIL, 1 = at least one FAIL, 2 = usage error.
//
// --ignore-keys (docs/improvements/06-morph-branding.md 8.3, T1) drops the named object keys, at any depth, from both
// sides of every JSON and state comparison (ZIP JSON entries included) before comparing: a file that then compares
// equal is reported as equivalent (PASS), never as a difference. It is a review cross-check, not a gate: 06 T1 runs
// it with `classes,class` to prove that only the recorded class keys changed, 06 T5 with `statusColor`.
//
// --rename (docs/improvements/06-morph-branding.md 8.3, T6b) maps download file names of the baseline to the
// candidate's before comparing, so a commit that only renames the exports can be checked for byte identity: an output
// key's file name (the part after the last '__', or the whole name), a ZIP entry's last path segment (the textures/
// atlas entry included), and every exact file-name token inside the baseline's text outputs and text ZIP entries
// (downloads.json, the OBJ mtllib line, the MTL map_Kd lines, glTF images[].uri, the JSON texture paths, dialogs and
// console messages). A token matches only as a whole file name: 'panel-ids.png' maps 'textures/panel-ids.png' but
// not 'morph-led-wall-panel-ids.png'. Images are compared as they are. Like --ignore-keys it is a review check of the
// rename commit; its gate still declares the renamed outputs (removed and added) in the --expect manifest.
//
// --expect (docs/improvements/08-bugfix-roadmap.md, sections 8.1 and 8.2) gates a re-baselining commit: every difference
// must be declared in an expected-change manifest (tests/regression/expected/<commit-id>.json), and every declared
// change must happen. Every --expect run also loads tests/regression/expected/_nondeterminism.json, the standing
// allowlist of the known overlay-glyph screenshot jitter; it is never listed by hand.
// Rect allowances (docs/improvements/01-normals.md 8.4, T2; 07 C57): a manifest entry with `rects` (and its capture
// frame `size`) accepts an image difference only when every differing pixel lies inside the union of its rectangles and
// the PNG has exactly that size; otherwise the output is a FAIL. The only pixels tolerated outside the rectangles are
// the allowlisted jitter: on a screenshot listed in _nondeterminism.json, outside pixels within that entry's level and
// pixel bounds (F1-0c). The rectangles are measured from the DOM by
// tests/regression/measure-rects.mjs, never typed. --diff-bbox adds the bounding box of the differing pixels (and of
// those outside an entry's rectangles) to the detail of every differing image, for review.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePNG, readZip, kindForFilename } from './lib/formats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The standing nondeterminism allowlist, loaded by every --expect run. */
export const NONDETERMINISM_FILE = path.join(HERE, 'expected', '_nondeterminism.json');

// ---------------------------------------------------------------------------------------------
// Documented nondeterminism handling (never silently ignored - each is reported):
//   * ZIP container bytes (kind 'zip'): JSZip stamps entries with the current date/time, so the
//     archive bytes differ on every export. Archives are compared by entry list + per-entry content.
//   * Viewport screenshots (kind 'screenshot'): GPU/SwiftShader rasterisation may legitimately
//     differ by a few levels; any difference is a WARN, a FAIL only beyond --shot-threshold /
//     --shot-max-percent. With --expect, a difference on an output listed in
//     expected/_nondeterminism.json that stays within its bounds is reported as JITTER.
//   * console.json (kind 'console'): compared as a multiset of (kind, normalised message); the step
//     an async error is attributed to and URLs/line numbers are ignored. Errors that disappear in
//     the candidate are a WARN (likely a fix); new errors are a FAIL.
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
    const a = { tolerance: 1e-5, pngThreshold: 0, pngMaxPercent: 0.01, shotThreshold: 8, shotMaxPercent: 0.5, verbose: false, diffBbox: false, expect: [], positional: [] };
    for (let i = 2; i < argv.length; i++) {
        const k = argv[i];
        const num = () => { const v = Number(argv[++i]); if (!Number.isFinite(v)) throw new Error('Bad number for ' + k); return v; };
        const str = () => { const v = argv[++i]; if (v === undefined) throw new Error('Missing value for ' + k); return v; };
        if (k === '--tolerance') a.tolerance = num();
        else if (k === '--png-threshold') a.pngThreshold = num();
        else if (k === '--png-max-percent') a.pngMaxPercent = num();
        else if (k === '--shot-threshold') a.shotThreshold = num();
        else if (k === '--shot-max-percent') a.shotMaxPercent = num();
        else if (k === '--only') a.only = str().split(',').map((s) => s.trim()).filter(Boolean);
        else if (k === '--ignore-keys') {
            a.ignoreKeys = str().split(',').map((s) => s.trim()).filter(Boolean);
            if (!a.ignoreKeys.length) throw new Error('No keys for --ignore-keys');
        }
        else if (k === '--rename') a.rename = parseRenameMap(str());
        else if (k === '--expect') a.expect.push(...str().split(',').map((s) => s.trim()).filter(Boolean));
        else if (k === '--verbose' || k === '-v') a.verbose = true;
        else if (k === '--diff-bbox') a.diffBbox = true;
        else if (k.startsWith('--')) throw new Error('Unknown option ' + k);
        else a.positional.push(k);
    }
    return a;
}

// ---- generic helpers -------------------------------------------------------------------------

const NUM_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const result = (status, detail = '', extra = {}) => ({ status, detail, ...extra });
const RANK = { IDENTICAL: 0, PASS: 1, WARN: 2, FAIL: 3 };
const worst = (...ss) => ss.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'IDENTICAL');

/** Token-wise text comparison: numbers with absolute tolerance, everything else exact. */
function compareTokens(aText, bText, tol, label = '') {
    const al = aText.replace(/\r\n/g, '\n').split('\n');
    const bl = bText.replace(/\r\n/g, '\n').split('\n');
    const diffs = [];
    let maxNumDiff = 0;
    if (al.length !== bl.length) diffs.push(`line count ${al.length} vs ${bl.length}`);
    const n = Math.min(al.length, bl.length);
    for (let i = 0; i < n && diffs.length < 8; i++) {
        if (al[i] === bl[i]) continue;
        const at = al[i].trim().split(/\s+/);
        const bt = bl[i].trim().split(/\s+/);
        let lineBad = at.length !== bt.length;
        if (!lineBad) {
            for (let j = 0; j < at.length; j++) {
                if (at[j] === bt[j]) continue;
                if (NUM_RE.test(at[j]) && NUM_RE.test(bt[j])) {
                    const d = Math.abs(Number(at[j]) - Number(bt[j]));
                    maxNumDiff = Math.max(maxNumDiff, d);
                    if (d > tol) { lineBad = true; break; }
                } else { lineBad = true; break; }
            }
        }
        if (lineBad) diffs.push(`${label}line ${i + 1}: "${al[i].slice(0, 90)}" vs "${bl[i].slice(0, 90)}"`);
    }
    if (diffs.length) return result('FAIL', diffs.join('; '));
    return result('PASS', maxNumDiff > 0 ? `numeric diffs <= ${maxNumDiff.toExponential(2)}` : 'equivalent (whitespace only)');
}

/** Deep JSON comparison with numeric tolerance. Object key order is ignored. */
function deepCompare(a, b, tol, p = '$', diffs = [], stats = { maxNum: 0 }) {
    if (diffs.length >= 10) return diffs;
    const ta = Array.isArray(a) ? 'array' : a === null ? 'null' : typeof a;
    const tb = Array.isArray(b) ? 'array' : b === null ? 'null' : typeof b;
    if (ta !== tb) { diffs.push(`${p}: type ${ta} vs ${tb}`); return diffs; }
    if (ta === 'number') {
        const d = Math.abs(a - b);
        if (!(d <= tol) && !(Number.isNaN(a) && Number.isNaN(b))) diffs.push(`${p}: ${a} vs ${b}`);
        else stats.maxNum = Math.max(stats.maxNum, d || 0);
    } else if (ta === 'array') {
        if (a.length !== b.length) diffs.push(`${p}: length ${a.length} vs ${b.length}`);
        for (let i = 0; i < Math.min(a.length, b.length); i++) deepCompare(a[i], b[i], tol, `${p}[${i}]`, diffs, stats);
    } else if (ta === 'object') {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) {
            if (!(k in a)) diffs.push(`${p}.${k}: missing in baseline`);
            else if (!(k in b)) diffs.push(`${p}.${k}: missing in candidate`);
            else deepCompare(a[k], b[k], tol, `${p}.${k}`, diffs, stats);
        }
    } else if (a !== b) {
        diffs.push(`${p}: ${JSON.stringify(a).slice(0, 80)} vs ${JSON.stringify(b).slice(0, 80)}`);
    }
    return diffs;
}

function parseJSONSafe(buf) {
    try { return { ok: true, value: JSON.parse(buf.toString('utf8')) }; } catch (e) { return { ok: false, error: e.message }; }
}

// ui_visual computed-style snapshots ({ viewport, cssTokens, controlPanelScroll, elements }) get a
// per-element summary, so every element that changed is named instead of only the first 10 paths.
const isStyleSnapshot = (v) => v && typeof v === 'object' && v.elements && typeof v.elements === 'object' && 'cssTokens' in v;

function styleSnapshotDiff(a, b, tol) {
    const parts = [];
    for (const k of ['viewport', 'cssTokens', 'controlPanelScroll']) {
        const d = deepCompare(a[k], b[k], tol, k);
        if (d.length) parts.push(d.join(', '));
    }
    const labels = [...new Set([...Object.keys(a.elements), ...Object.keys(b.elements)])];
    let nEl = 0;
    for (const l of labels) {
        const x = a.elements[l], y = b.elements[l];
        if (!x || !y) { nEl++; parts.push(`${l}: ${!x ? 'not probed in baseline' : 'not probed in candidate'}`); continue; }
        // Styles first: a changed property is usually the cause, a changed rect the consequence.
        const d = deepCompare({ styles: x.styles, ...x }, { styles: y.styles, ...y }, tol, '');
        if (!d.length) continue;
        nEl++;
        const shown = d.slice(0, 4).map((s) => s.replace(/^\.(styles\.)?/, ''));
        parts.push(`${l} [${shown.join('; ')}${d.length > 4 ? `; +${d.length >= 10 ? '10 or more' : d.length - 4} more` : ''}]`);
    }
    const head = `${nEl} element(s) differ`;
    return parts.length > 15 ? `${head}: ${parts.slice(0, 15).join(' || ')} || ... (${parts.length - 15} more)` : `${head}: ${parts.join(' || ')}`;
}

/** A deep copy of a parsed JSON value without the object keys in `keys` (any depth). */
function withoutKeys(v, keys) {
    if (Array.isArray(v)) return v.map((x) => withoutKeys(x, keys));
    if (v === null || typeof v !== 'object') return v;
    const out = {};
    for (const [k, x] of Object.entries(v)) if (!keys.has(k)) out[k] = withoutKeys(x, keys);
    return out;
}

/** Whether a parsed JSON value holds one of the object keys in `keys` (any depth). */
function hasAnyKey(v, keys) {
    if (Array.isArray(v)) return v.some((x) => hasAnyKey(x, keys));
    if (v === null || typeof v !== 'object') return false;
    return Object.entries(v).some(([k, x]) => keys.has(k) || hasAnyKey(x, keys));
}

// ---- --rename (06 T6b) ---------------------------------------------------------------------------

/**
 * Parses an --rename value 'old=new[,old=new...]' into a Map. Every pair needs a non-empty old and new file name
 * without '/' or '='; an old name may appear once.
 * @param {string} spec
 * @returns {Map<string, string>}
 * @throws {Error} for a malformed or empty list
 */
export function parseRenameMap(spec) {
    const map = new Map();
    for (const pair of String(spec).split(',').map((x) => x.trim()).filter(Boolean)) {
        const m = /^([^=/]+)=([^=/]+)$/.exec(pair);
        if (!m) throw new Error(`--rename: "${pair}" is not old=new (file names without '/' or '=')`);
        const [from, to] = [m[1].trim(), m[2].trim()];
        if (map.has(from)) throw new Error(`--rename: "${from}" is mapped twice`);
        map.set(from, to);
    }
    if (!map.size) throw new Error('No pairs for --rename');
    return map;
}

const escapeRegExp = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The comparison kinds whose bytes are text, renamed token by token. */
const TEXT_KINDS = new Set(['obj', 'mtl', 'text', 'gltf', 'json', 'state', 'console']);

/** The file name of an output key or a path renamed by `map` (the part after the last '__' or '/', else the whole). */
export function renameFileName(name, map, sep = '__') {
    const i = name.lastIndexOf(sep);
    const head = i >= 0 ? name.slice(0, i + sep.length) : '';
    const file = i >= 0 ? name.slice(i + sep.length) : name;
    return map.has(file) ? head + map.get(file) : name;
}

/**
 * Every exact file-name token of `map` in a text, replaced (a token is not part of a longer name: no letter, digit,
 * '_', '-' or '.' before it, none of those after it except a '.' that does not continue the name).
 */
export function renameText(text, map) {
    let out = text;
    for (const [from, to] of map) {
        out = out.replace(new RegExp(`(?<![A-Za-z0-9_.-])${escapeRegExp(from)}(?![A-Za-z0-9_-]|\\.[A-Za-z0-9])`, 'g'), to);
    }
    return out;
}

/** A baseline buffer of `kind` with the file-name tokens renamed (text kinds only). */
function renameBuffer(kind, buf, map) {
    if (!map || !TEXT_KINDS.has(kind)) return buf;
    const text = buf.toString('utf8');
    const renamed = renameText(text, map);
    return renamed === text ? buf : Buffer.from(renamed, 'utf8');
}

function compareJSON(aBuf, bBuf, tol, ignoreKeys = null) {
    let a = parseJSONSafe(aBuf), b = parseJSONSafe(bBuf);
    if (!a.ok || !b.ok) {
        if (aBuf.equals(bBuf)) return result('PASS', 'unparseable but identical');
        return result('FAIL', `JSON parse error: baseline=${a.error || 'ok'} candidate=${b.error || 'ok'}`);
    }
    // --ignore-keys (06 T1): compare without those keys; a file that only differs in them is equivalent.
    const ignored = ignoreKeys && ignoreKeys.length ? new Set(ignoreKeys) : null;
    const dropped = ignored && (hasAnyKey(a.value, ignored) || hasAnyKey(b.value, ignored));
    if (dropped) {
        a = { ok: true, value: withoutKeys(a.value, ignored) };
        b = { ok: true, value: withoutKeys(b.value, ignored) };
    }
    const stats = { maxNum: 0 };
    const diffs = deepCompare(a.value, b.value, tol, '$', [], stats);
    if (diffs.length) {
        if (isStyleSnapshot(a.value) && isStyleSnapshot(b.value)) return result('FAIL', styleSnapshotDiff(a.value, b.value, tol));
        return result('FAIL', diffs.join('; '));
    }
    if (dropped) return result('PASS', `equivalent with the keys ${[...ignored].join(', ')} ignored (--ignore-keys)`);
    return result('PASS', stats.maxNum > 0 ? `numeric diffs <= ${stats.maxNum.toExponential(2)}` : 'equivalent (formatting/key order only)');
}

// ---- glTF ------------------------------------------------------------------------------------

const COMP = {
    5120: { size: 1, read: (dv, o) => dv.getInt8(o), float: false },
    5121: { size: 1, read: (dv, o) => dv.getUint8(o), float: false },
    5122: { size: 2, read: (dv, o) => dv.getInt16(o, true), float: false },
    5123: { size: 2, read: (dv, o) => dv.getUint16(o, true), float: false },
    5125: { size: 4, read: (dv, o) => dv.getUint32(o, true), float: false },
    5126: { size: 4, read: (dv, o) => dv.getFloat32(o, true), float: true },
};
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function decodeBuffers(gltf) {
    return (gltf.buffers || []).map((b) => {
        if (typeof b.uri === 'string' && b.uri.startsWith('data:')) {
            return Buffer.from(b.uri.slice(b.uri.indexOf(',') + 1), 'base64');
        }
        return null;
    });
}

function readAccessor(gltf, buffers, idx) {
    const acc = gltf.accessors[idx];
    const comp = COMP[acc.componentType];
    const nc = NCOMP[acc.type];
    if (!comp || !nc) throw new Error(`accessor ${idx}: unsupported componentType/type`);
    if (acc.bufferView === undefined) return { values: new Array(acc.count * nc).fill(0), float: comp.float };
    const bv = gltf.bufferViews[acc.bufferView];
    const buf = buffers[bv.buffer];
    if (!buf) throw new Error(`accessor ${idx}: buffer ${bv.buffer} not embedded`);
    const stride = bv.byteStride || comp.size * nc;
    const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const values = new Array(acc.count * nc);
    for (let i = 0; i < acc.count; i++) {
        for (let c = 0; c < nc; c++) {
            const off = base + i * stride + c * comp.size;
            if (off + comp.size > buf.length) throw new Error(`accessor ${idx}: out of bounds`);
            values[i * nc + c] = comp.read(dv, off);
        }
    }
    return { values, float: comp.float };
}

function compareGLTF(aBuf, bBuf, tol) {
    const pa = parseJSONSafe(aBuf), pb = parseJSONSafe(bBuf);
    if (!pa.ok || !pb.ok) return result('FAIL', `glTF JSON parse error: baseline=${pa.error || 'ok'} candidate=${pb.error || 'ok'}`);
    const a = pa.value, b = pb.value;
    const strip = (g) => ({ ...g, buffers: (g.buffers || []).map((x) => ({ ...x, uri: typeof x.uri === 'string' && x.uri.startsWith('data:') ? '<embedded>' : x.uri })) });
    const stats = { maxNum: 0 };
    const diffs = deepCompare(strip(a), strip(b), tol, '$', [], stats);
    if (diffs.length) return result('FAIL', 'structure: ' + diffs.join('; '));
    let maxData = 0;
    try {
        const ba = decodeBuffers(a), bb = decodeBuffers(b);
        for (let i = 0; i < (a.accessors || []).length; i++) {
            const va = readAccessor(a, ba, i), vb = readAccessor(b, bb, i);
            for (let k = 0; k < va.values.length; k++) {
                const d = Math.abs(va.values[k] - vb.values[k]);
                if (va.float ? !(d <= tol) : d !== 0) {
                    return result('FAIL', `accessor ${i} (${a.accessors[i].type}) element ${k}: ${va.values[k]} vs ${vb.values[k]}`);
                }
                maxData = Math.max(maxData, d);
            }
        }
    } catch (e) {
        return result('FAIL', 'buffer decode: ' + e.message);
    }
    const m = Math.max(maxData, stats.maxNum);
    return result('PASS', m > 0 ? `numeric diffs <= ${m.toExponential(2)}` : 'equivalent');
}

// ---- PNG -------------------------------------------------------------------------------------

function comparePNG(aBuf, bBuf, threshold, maxPercent, label) {
    let a, b;
    try { a = decodePNG(aBuf); b = decodePNG(bBuf); } catch (e) { return result('FAIL', 'PNG decode: ' + e.message); }
    if (a.width !== b.width || a.height !== b.height) return result('FAIL', `size ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    let maxDiff = 0, over = 0, anyDiff = 0;
    const n = a.width * a.height;
    for (let i = 0; i < n; i++) {
        let m = 0;
        for (let c = 0; c < 4; c++) { const d = Math.abs(a.rgba[i * 4 + c] - b.rgba[i * 4 + c]); if (d > m) m = d; }
        if (m > 0) anyDiff++;
        if (m > threshold) over++;
        if (m > maxDiff) maxDiff = m;
    }
    const pct = (over / n) * 100;
    const detail = `${label}: max channel diff ${maxDiff}, ${pct.toFixed(4)}% pixels differ by >${threshold} (${anyDiff} px differ at all, ${a.width}x${a.height})`;
    if (maxDiff === 0) return result('PASS', 'pixel-identical (encoding differs)', { maxDiff, pct, anyDiff });
    if (pct > maxPercent) return result('FAIL', detail, { maxDiff, pct, anyDiff });
    return result('WARN', detail, { maxDiff, pct, anyDiff });
}

// ---- console ---------------------------------------------------------------------------------

function compareConsole(aBuf, bBuf) {
    const pa = parseJSONSafe(aBuf), pb = parseJSONSafe(bBuf);
    if (!pa.ok || !pb.ok) return result('FAIL', 'console.json parse error');
    const key = (e) => `${e.kind}| ${e.message}`;
    const count = (arr) => arr.reduce((m, e) => m.set(key(e), (m.get(key(e)) || 0) + 1), new Map());
    const ca = count(pa.value), cb = count(pb.value);
    const added = [], removed = [];
    for (const [k, v] of cb) if (v > (ca.get(k) || 0)) added.push(`${k} (x${v - (ca.get(k) || 0)})`);
    for (const [k, v] of ca) if (v > (cb.get(k) || 0)) removed.push(`${k} (x${v - (cb.get(k) || 0)})`);
    if (added.length) return result('FAIL', 'NEW errors in candidate: ' + added.join(' || ') + (removed.length ? ' ; gone: ' + removed.join(' || ') : ''));
    if (removed.length) return result('WARN', 'errors no longer raised by candidate: ' + removed.join(' || '));
    return result('PASS', pa.value.length ? `${pa.value.length} known error(s), unchanged` : 'no errors');
}

// ---- ZIP -------------------------------------------------------------------------------------

function compareZip(aBuf, bBuf, opts) {
    let ea, eb;
    try { ea = readZip(aBuf); eb = readZip(bBuf); } catch (e) { return result('FAIL', 'ZIP read: ' + e.message); }
    if (opts.rename) {
        // --rename (06 T6b): the baseline's entry names (last path segment) and its text entries.
        ea = ea.map((e) => ({ ...e, name: renameFileName(e.name, opts.rename, '/'), data: renameBuffer(kindForFilename(e.name), e.data, opts.rename) }));
    }
    const na = ea.map((e) => e.name), nb = eb.map((e) => e.name);
    const missing = na.filter((x) => !nb.includes(x)), extra = nb.filter((x) => !na.includes(x));
    if (missing.length || extra.length) return result('FAIL', `entries missing: [${missing.join(', ')}] extra: [${extra.join(', ')}]`);
    let status = 'PASS';
    const notes = [];
    if (na.join('\n') !== nb.join('\n')) { status = 'WARN'; notes.push('entry order differs'); }
    const mb = new Map(eb.map((e) => [e.name, e]));
    for (const e of ea) {
        if (e.isDir) continue;
        const other = mb.get(e.name);
        if (e.data.equals(other.data)) continue;
        const r = compareContent(kindForFilename(e.name), e.data, other.data, opts, e.name);
        if (r.status !== 'IDENTICAL' && r.status !== 'PASS') notes.push(`${e.name}: ${r.status} ${r.detail}`);
        else notes.push(`${e.name}: ${r.detail}`);
        status = worst(status, r.status === 'IDENTICAL' ? 'PASS' : r.status);
    }
    return result(status, `${ea.length} entries; container bytes ignored (timestamps)` + (notes.length ? '; ' + notes.join('; ') : ''));
}

// ---- dispatch --------------------------------------------------------------------------------

function compareContent(kind, aBuf, bBuf, opts, label = '') {
    if (kind !== 'zip' && aBuf.equals(bBuf)) return result('IDENTICAL');
    switch (kind) {
        case 'obj':
        case 'mtl':
        case 'text':
            return compareTokens(aBuf.toString('utf8'), bBuf.toString('utf8'), opts.tolerance);
        case 'gltf':
            return compareGLTF(aBuf, bBuf, opts.tolerance);
        case 'json':
        case 'state':
            return compareJSON(aBuf, bBuf, opts.tolerance, opts.ignoreKeys);
        case 'png':
            return comparePNG(aBuf, bBuf, opts.pngThreshold, opts.pngMaxPercent, label || 'export png');
        case 'screenshot':
            return comparePNG(aBuf, bBuf, opts.shotThreshold, opts.shotMaxPercent, label || 'screenshot');
        case 'zip':
            return compareZip(aBuf, bBuf, opts);
        case 'console':
            return compareConsole(aBuf, bBuf);
        default:
            return result('FAIL', `unknown kind "${kind}" and bytes differ`);
    }
}

function loadHarnessManifest(dir) {
    const p = path.join(dir, 'manifest.json');
    if (!fs.existsSync(p)) throw new Error('No manifest.json in ' + dir);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export const DEFAULT_OPTIONS = Object.freeze({ tolerance: 1e-5, pngThreshold: 0, pngMaxPercent: 0.01, shotThreshold: 8, shotMaxPercent: 0.5 });

/**
 * Compare two harness output trees. Every output of the union is reported once as
 * { key: '<scenario>/<output>', scenario, output, kind, status, detail, change, maxDiff?, anyDiff?, baseFile, candFile }
 * (the two file paths, null on the side that lacks the output), where status is
 * IDENTICAL | PASS | WARN | FAIL and `change` is 'added' (only in the candidate), 'removed' (only in the baseline),
 * 'modified' (in both, status WARN or FAIL) or null (no difference). A scenario present on one side only reports
 * each of its outputs as added or removed.
 */
export function compareTrees(baseDir, candDir, opts = DEFAULT_OPTIONS, only = null) {
    const A = loadHarnessManifest(baseDir), B = loadHarnessManifest(candDir);
    let scenarios = [...new Set([...Object.keys(A.scenarios || {}), ...Object.keys(B.scenarios || {})])];
    if (only) scenarios = scenarios.filter((s) => only.includes(s));
    const out = [];
    const rename = opts.rename || null;
    for (const s of scenarios) {
        const sb = B.scenarios[s];
        let sa = A.scenarios[s];
        if (sa && rename) {
            // --rename (06 T6b): the baseline's outputs under their candidate names.
            const renamed = {};
            for (const [o, v] of Object.entries(sa.outputs || {})) {
                const to = renameFileName(o, rename);
                if (renamed[to]) throw new UsageError(`--rename maps two outputs of ${s} to ${to}`);
                renamed[to] = to === o ? v : { ...v, renamedFrom: o };
            }
            sa = { ...sa, outputs: renamed };
        }
        const outputs = [];
        const outs = [...new Set([...Object.keys(sa?.outputs || {}), ...Object.keys(sb?.outputs || {})])];
        for (const o of outs) {
            const oa = sa?.outputs[o], ob = sb?.outputs[o];
            let r;
            let change = null;
            if (!oa) {
                change = 'added';
                r = result('FAIL', sa ? 'EXTRA output (not in baseline)' : 'EXTRA output (scenario not in baseline)');
            } else if (!ob) {
                change = 'removed';
                r = result('FAIL', sb ? 'MISSING output (not produced by candidate)' : 'MISSING output (scenario not in candidate)');
            } else if (oa.kind !== ob.kind) {
                r = result('FAIL', `kind ${oa.kind} vs ${ob.kind}`);
            } else {
                try {
                    const ba = renameBuffer(oa.kind, fs.readFileSync(path.join(baseDir, oa.file)), rename);
                    const bb = fs.readFileSync(path.join(candDir, ob.file));
                    r = compareContent(oa.kind, ba, bb, opts, o);
                    if (oa.renamedFrom) r = { ...r, detail: [r.detail, `baseline ${oa.renamedFrom} (--rename)`].filter(Boolean).join('; ') };
                } catch (e) {
                    r = result('FAIL', 'read error: ' + e.message);
                }
            }
            if (!change && (r.status === 'WARN' || r.status === 'FAIL')) change = 'modified';
            outputs.push({
                key: `${s}/${o}`, scenario: s, output: o, kind: (oa || ob).kind, inBaseline: !!oa, inCandidate: !!ob, ...r, change,
                baseFile: oa ? path.join(baseDir, oa.file) : null, candFile: ob ? path.join(candDir, ob.file) : null,
            });
        }
        out.push({ name: s, inBaseline: !!sa, inCandidate: !!sb, outputs });
    }
    return { A, B, scenarios: out };
}

// ---- expected-change manifests and the nondeterminism allowlist (08 section 8.2) ---------------

/**
 * Glob over '<scenario>/<output>': `*` matches within one path segment, `**` across segments, `{a,b}` is
 * alternation (nestable, each alternative may hold wildcards), `?` matches one character of a segment. Everything
 * else is literal.
 */
export function globToRegExp(pattern) {
    if (typeof pattern !== 'string' || !pattern) throw new Error(`invalid pattern ${JSON.stringify(pattern)}`);
    let i = 0;
    const parse = (inBrace) => {
        let re = '';
        const alts = [];
        while (i < pattern.length) {
            const c = pattern[i];
            if (c === '*') {
                if (pattern[i + 1] === '*') {
                    i += 2;
                    if (pattern[i] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
                } else { i++; re += '[^/]*'; }
            } else if (c === '?') { i++; re += '[^/]'; }
            else if (c === '{') {
                i++;
                re += parse(true);
                if (pattern[i] !== '}') throw new Error(`unclosed "{" in pattern ${JSON.stringify(pattern)}`);
                i++;
            } else if (inBrace && c === ',') { i++; alts.push(re); re = ''; }
            else if (inBrace && c === '}') break;
            else if (c === '}' || c === ',') { i++; re += '\\' + c; }
            else { i++; re += c.replace(/[.+^$()|[\]\\]/g, '\\$&'); }
        }
        if (!inBrace) return re;
        alts.push(re);
        return `(?:${alts.join('|')})`;
    };
    const body = parse(false);
    return new RegExp(`^${body}$`);
}

const CHANGES = ['added', 'removed', 'modified'];
const ENTRY_KEYS = new Set(['output', 'exclude', 'change', 'each', 'size', 'rects', 'measure', 'reason', 'note']);
/** The output kinds a `rects` entry can judge pixel by pixel. */
const IMAGE_KINDS = new Set(['screenshot', 'png']);

/** Validate a `rects` list: [{x, y, w, h, label?}] with integer pixel coordinates and non-negative sizes. */
function validateRects(rects, where) {
    if (!Array.isArray(rects) || !rects.length) throw new Error(`${where}: "rects" must be a non-empty array of {x, y, w, h}`);
    return rects.map((r, k) => {
        const at = `${where} rects[${k}]`;
        if (!r || typeof r !== 'object') throw new Error(`${at}: must be an object {x, y, w, h}`);
        for (const key of Object.keys(r)) if (!['x', 'y', 'w', 'h', 'label'].includes(key)) throw new Error(`${at}: unknown key "${key}"`);
        for (const key of ['x', 'y', 'w', 'h']) {
            if (!Number.isInteger(r[key])) throw new Error(`${at}: "${key}" must be an integer`);
        }
        if (r.w < 0 || r.h < 0) throw new Error(`${at}: "w" and "h" must not be negative`);
        return { x: r.x, y: r.y, w: r.w, h: r.h, label: typeof r.label === 'string' ? r.label : '' };
    });
}

/**
 * Validate one manifest entry. Keys: `output` (pattern), `exclude` (pattern of outputs the entry does not match),
 * `change`, `each`, `reason`/`note`, and the rect allowance of 01 T2: `rects` with the capture frame `size` [w, h]
 * (both or neither; `change` 'modified' only), plus `measure`, the instructions measure-rects.mjs reads to write
 * `rects` and `size`. An entry with `measure` but no `rects` has not been measured and is refused.
 */
function validateEntry(e, where, { changeRequired }) {
    if (typeof e === 'string') e = { output: e };
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error(`${where}: an entry must be an object or a pattern string`);
    for (const k of Object.keys(e)) if (!ENTRY_KEYS.has(k)) throw new Error(`${where}: unknown key "${k}"`);
    if (typeof e.output !== 'string' || !e.output) throw new Error(`${where}: "output" must be a non-empty pattern`);
    if (e.exclude !== undefined && (typeof e.exclude !== 'string' || !e.exclude)) throw new Error(`${where}: "exclude" must be a non-empty pattern`);
    if (changeRequired || e.change !== undefined) {
        if (!CHANGES.includes(e.change)) throw new Error(`${where}: "change" must be one of ${CHANGES.join(' | ')}`);
    }
    if (e.each !== undefined && typeof e.each !== 'boolean') throw new Error(`${where}: "each" must be a boolean`);
    let rects = null;
    let size = null;
    if (e.rects !== undefined || e.size !== undefined) {
        if (e.rects === undefined || e.size === undefined) throw new Error(`${where}: "rects" and "size" go together (the rectangles and their capture frame)`);
        if (!Array.isArray(e.size) || e.size.length !== 2 || !e.size.every((n) => Number.isInteger(n) && n > 0)) {
            throw new Error(`${where}: "size" must be [width, height] in pixels`);
        }
        if (e.change !== undefined && e.change !== 'modified') throw new Error(`${where}: "rects" only apply to "change": "modified"`);
        rects = validateRects(e.rects, where);
        size = [e.size[0], e.size[1]];
    }
    if (e.measure !== undefined) {
        if (!e.measure || typeof e.measure !== 'object' || Array.isArray(e.measure)) throw new Error(`${where}: "measure" must be an object`);
        if (!rects) throw new Error(`${where}: "measure" without "rects": run tests/regression/measure-rects.mjs on this manifest first`);
    }
    return {
        output: e.output, exclude: e.exclude ?? null, change: e.change ?? null, each: e.each === true, reason: e.reason ?? e.note ?? '',
        re: globToRegExp(e.output), excludeRe: e.exclude ? globToRegExp(e.exclude) : null, rects, size,
    };
}

/** Whether an entry matches an output key (its pattern, minus its `exclude` pattern). */
const entryMatches = (entry, key) => entry.re.test(key) && !(entry.excludeRe && entry.excludeRe.test(key));

/**
 * The pixel comparison of one image output against a rect entry (01 T2): the frame size check, then every pixel with
 * any channel difference is either inside the union of the rectangles or counted outside (with the largest channel
 * difference among the outside pixels, which the jitter tolerance of applyRects reads). Bounding boxes are
 * [x0, y0, x1, y1], inclusive. Decoded images are cached on the output record.
 * @returns {{size: number[], sizeOk: boolean, differing: number, outside: number, outsideMaxDiff: number,
 *            bbox: number[]|null, outsideBbox: number[]|null}}
 */
export function rectCheck(o, rects, size) {
    if (!o._pixels) {
        const a = decodePNG(fs.readFileSync(o.baseFile));
        const b = decodePNG(fs.readFileSync(o.candFile));
        o._pixels = { a, b };
    }
    const { a, b } = o._pixels;
    const frame = [b.width, b.height];
    const sizeOk = !size || (a.width === size[0] && a.height === size[1] && b.width === size[0] && b.height === size[1]);
    if (a.width !== b.width || a.height !== b.height) {
        return { size: frame, sizeOk: false, differing: NaN, outside: NaN, outsideMaxDiff: NaN, bbox: null, outsideBbox: null };
    }
    const inside = (x, y) => (rects || []).some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    let differing = 0, outside = 0, outsideMaxDiff = 0;
    let bbox = null, outsideBbox = null;
    const grow = (box, x, y) => (box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y]);
    for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
            const i = (y * a.width + x) * 4;
            if (a.rgba[i] === b.rgba[i] && a.rgba[i + 1] === b.rgba[i + 1] && a.rgba[i + 2] === b.rgba[i + 2] && a.rgba[i + 3] === b.rgba[i + 3]) continue;
            differing++;
            bbox = grow(bbox, x, y);
            if (rects && !inside(x, y)) {
                outside++;
                outsideBbox = grow(outsideBbox, x, y);
                for (let k = 0; k < 4; k++) outsideMaxDiff = Math.max(outsideMaxDiff, Math.abs(a.rgba[i + k] - b.rgba[i + k]));
            }
        }
    }
    return { size: frame, sizeOk, differing, outside, outsideMaxDiff, bbox, outsideBbox };
}

const fmtBox = (box) => (box ? `[${box[0]},${box[1]}]-[${box[2]},${box[3]}]` : 'none');

/**
 * Apply a rect entry to a differing output: EXPECTED-able (returns true) only for an image of the entry's frame size
 * whose differing pixels all lie inside the rectangles. Otherwise the output becomes a FAIL with the reason, and the
 * function returns false (the output then satisfies nothing).
 * The one tolerance outside the rectangles is the standing overlay-glyph jitter (F1-0c): when the output is a
 * screenshot listed in the nondeterminism allowlist and its pixels outside the rectangles stay within that entry's
 * bounds (largest channel difference <= maxLevel, count <= maxPixels), those pixels are what the allowlist accepts on
 * an otherwise unchanged capture, so they do not fail the entry. Without it a re-baseline that changes the help badge
 * of a camera/* screenshot would fail whenever the preview-label jitter of the same capture flips.
 */
function applyRects(o, entry, label, allowlist = []) {
    if (!IMAGE_KINDS.has(o.kind) || !o.baseFile || !o.candFile) {
        o.status = 'FAIL';
        o.detail = `[${label}] rects apply to screenshots and PNG exports only; ${o.detail}`;
        return false;
    }
    let c;
    try {
        c = rectCheck(o, entry.rects, entry.size);
    } catch (e) {
        o.status = 'FAIL';
        o.detail = `[${label}] rect check: ${e.message}; ${o.detail}`;
        return false;
    }
    o.rectResult = c;
    if (!c.sizeOk) {
        o.status = 'FAIL';
        o.detail = `[${label}] rect frame mismatch: the capture is ${c.size[0]}x${c.size[1]}, the entry's frame is ${entry.size[0]}x${entry.size[1]}; ${o.detail}`;
        return false;
    }
    if (c.outside > 0) {
        const j = o.kind === 'screenshot' ? allowlist.find((a) => a.re.test(o.key)) : null;
        if (j && c.outsideMaxDiff <= j.maxLevel && c.outside <= j.maxPixels) {
            o.detail = `${o.detail}; ${c.differing - c.outside} of ${c.differing} differing px inside the rects (bbox ${fmtBox(c.bbox)}), `
                + `${c.outside} outside within the allowlisted jitter (${j.output}, <= ${j.maxLevel} level / ${j.maxPixels} px; `
                + `max ${c.outsideMaxDiff}, bbox ${fmtBox(c.outsideBbox)})`;
            return true;
        }
        o.status = 'FAIL';
        o.detail = `[${label}] ${c.outside} of ${c.differing} differing px outside the rects (max ${c.outsideMaxDiff}, bbox ${fmtBox(c.outsideBbox)}`
            + `${j ? `; beyond the allowlisted jitter of ${j.output}, <= ${j.maxLevel} level / ${j.maxPixels} px` : ''}); ${o.detail}`;
        return false;
    }
    o.detail = `${o.detail}; all ${c.differing} differing px inside the rects (bbox ${fmtBox(c.bbox)})`;
    return true;
}

/** Parse and validate an expected-change manifest ({ commit, bugs?, expect: [...], mayChange?: [...] }). */
export function parseExpectManifest(json, file = 'manifest') {
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error(`${file}: not a JSON object`);
    for (const k of Object.keys(json)) {
        if (!['commit', 'bugs', 'expect', 'mayChange', 'notes'].includes(k)) throw new Error(`${file}: unknown key "${k}"`);
    }
    if (!Array.isArray(json.expect)) throw new Error(`${file}: "expect" must be an array (it may be empty)`);
    if (json.mayChange !== undefined && !Array.isArray(json.mayChange)) throw new Error(`${file}: "mayChange" must be an array`);
    const commit = typeof json.commit === 'string' && json.commit ? json.commit : path.basename(file, '.json');
    return {
        file,
        commit,
        expect: json.expect.map((e, k) => validateEntry(e, `${file} expect[${k}]`, { changeRequired: true })),
        mayChange: (json.mayChange || []).map((e, k) => validateEntry(e, `${file} mayChange[${k}]`, { changeRequired: false })),
    };
}

/** Parse and validate the nondeterminism allowlist ({ jitter: [{ output, maxLevel, maxPixels, overlay, evidence }] }). */
export function parseAllowlist(json, file = '_nondeterminism.json') {
    if (!json || typeof json !== 'object' || !Array.isArray(json.jitter)) throw new Error(`${file}: expected { "jitter": [...] }`);
    return json.jitter.map((e, k) => {
        const where = `${file} jitter[${k}]`;
        if (!e || typeof e.output !== 'string' || !e.output) throw new Error(`${where}: "output" must be a non-empty pattern`);
        for (const n of ['maxLevel', 'maxPixels']) {
            if (!Number.isInteger(e[n]) || e[n] < 0) throw new Error(`${where}: "${n}" must be a non-negative integer`);
        }
        return { output: e.output, maxLevel: e.maxLevel, maxPixels: e.maxPixels, overlay: e.overlay || '', re: globToRegExp(e.output) };
    });
}

const isDiffering = (o) => o.change !== null;

/**
 * Apply the 08 section 8.2 semantics to the outputs of compareTrees (mutates their status):
 *   0. a screenshot difference on an allowlisted output within its bounds becomes JITTER (no count, satisfies nothing);
 *   1. a difference matching an `expect` entry with a compatible `change` becomes EXPECTED;
 *   2. a difference matching `mayChange` becomes EXPECTED?;
 *   3. every other difference keeps its status.
 * An entry with `rects` (01 T2) accepts a difference only when the image has the entry's frame `size` and every
 * differing pixel lies inside the union of its rectangles, except the allowlisted jitter of step 0 outside them (an
 * allowlisted screenshot whose outside pixels stay within that allowlist entry's bounds, F1-0c); otherwise the output
 * becomes a FAIL (the reason is in its detail) and satisfies no entry. Entries never match the outputs of their
 * `exclude` pattern.
 * Returns one record per `expect` entry: { manifest, entry, matched, differing, satisfied, why }. An entry is
 * satisfied only by differing outputs (a within-tolerance PASS never satisfies it); with `each`, every matching
 * output present in the baseline must differ compatibly. An unsatisfied entry is a FAIL.
 */
export function applyExpectations(outputs, manifests, allowlist) {
    for (const o of outputs) {
        o.originalStatus = o.status;
        if (o.kind === 'screenshot' && o.change === 'modified' && (o.status === 'WARN' || o.status === 'FAIL') && Number.isFinite(o.maxDiff)) {
            const j = allowlist.find((a) => a.re.test(o.key));
            if (j && o.maxDiff <= j.maxLevel && o.anyDiff <= j.maxPixels) {
                o.status = 'JITTER';
                o.detail = `${o.detail} [allowlisted: ${j.output}, <= ${j.maxLevel} level / ${j.maxPixels} px]`;
                o.change = null;
            }
        }
    }
    const entries = [];
    for (const m of manifests) {
        for (const entry of m.expect) {
            const matched = outputs.filter((o) => entryMatches(entry, o.key));
            const candidates = matched.filter((o) => isDiffering(o) && o.change === entry.change);
            const differing = [];
            let rectFailures = 0;
            for (const o of candidates) {
                if (o.status === 'EXPECTED') { differing.push(o); continue; }   // accepted by an earlier entry
                if (o.rectFailed) { rectFailures++; continue; }                 // failed an earlier entry's rect check
                const label = `${m.commit}: ${entry.output}`;
                if (entry.rects && !applyRects(o, entry, label, allowlist)) { o.rectFailed = true; rectFailures++; continue; }
                o.status = 'EXPECTED';
                o.detail = `[${label}, ${entry.change}${entry.rects ? `, ${entry.rects.length} rect(s) in ${entry.size[0]}x${entry.size[1]}` : ''}] ${o.detail}`;
                differing.push(o);
            }
            let satisfied = differing.length > 0;
            let why = '';
            if (!matched.length) why = 'no output matches the pattern';
            else if (!differing.length && rectFailures) why = `${rectFailures} differing output(s) failed the rect check`;
            else if (!differing.length) why = `none of the ${matched.length} matching output(s) differs with change "${entry.change}"`;
            if (satisfied && entry.each) {
                const notChanged = matched.filter((o) => o.inBaseline && !differing.includes(o));
                if (notChanged.length) {
                    satisfied = false;
                    why = `"each": ${notChanged.length} of ${matched.filter((o) => o.inBaseline).length} matching baseline output(s) did not change: ` +
                        notChanged.slice(0, 6).map((o) => o.key).join(', ') + (notChanged.length > 6 ? ', ...' : '');
                }
            }
            entries.push({ manifest: m.commit, entry, matched: matched.length, differing: differing.length, satisfied, why });
        }
    }
    for (const m of manifests) {
        for (const entry of m.mayChange) {
            for (const o of outputs) {
                if (!isDiffering(o) || o.rectFailed || o.status === 'EXPECTED' || o.status === 'EXPECTED?' || !entryMatches(entry, o.key)) continue;
                if (entry.change && entry.change !== o.change) continue;
                if (entry.rects && !applyRects(o, entry, `${m.commit} mayChange: ${entry.output}`, allowlist)) { o.rectFailed = true; continue; }
                o.status = 'EXPECTED?';
                o.detail = `[${m.commit} mayChange: ${entry.output}${entry.reason ? ` (${entry.reason})` : ''}] ${o.detail}`;
            }
        }
    }
    return entries;
}

/**
 * Programmatic entry point (used by the CLI and the unit tests). `expectFiles` is a list of manifest paths
 * (empty: plain comparison); with at least one, the allowlist at `allowlistFile` is loaded as well.
 * Returns { exitCode, outputs, entries, lines } and writes the report through `log`.
 */
export function runCompare({ baseDir, candDir, expectFiles = [], allowlistFile = NONDETERMINISM_FILE, opts = DEFAULT_OPTIONS, only = null, verbose = false, diffBbox = false, log = console.log }) {
    const expectMode = expectFiles.length > 0;
    let manifests = [], allowlist = [];
    if (expectMode) {
        if (!fs.existsSync(allowlistFile)) throw new UsageError(`--expect needs the nondeterminism allowlist ${allowlistFile}`);
        try {
            allowlist = parseAllowlist(JSON.parse(fs.readFileSync(allowlistFile, 'utf8')), allowlistFile);
            manifests = expectFiles.map((f) => parseExpectManifest(JSON.parse(fs.readFileSync(f, 'utf8')), f));
        } catch (e) {
            throw new UsageError(e.message);
        }
    }
    const { A, B, scenarios } = compareTrees(baseDir, candDir, opts, only);
    const outputs = scenarios.flatMap((s) => s.outputs);
    const entries = expectMode ? applyExpectations(outputs, manifests, allowlist) : [];
    if (diffBbox) addDiffBoxes(outputs);

    log(`Baseline : ${baseDir}\n           ${A.meta?.browser || '?'} captured ${A.meta?.capturedAt || '?'} from ${A.meta?.root || '?'}`);
    log(`Candidate: ${candDir}\n           ${B.meta?.browser || '?'} captured ${B.meta?.capturedAt || '?'} from ${B.meta?.root || '?'}`);
    log(`Tolerance ${opts.tolerance}; export PNG: >${opts.pngThreshold} on >${opts.pngMaxPercent}% px = FAIL; screenshots: >${opts.shotThreshold} on >${opts.shotMaxPercent}% px = FAIL`);
    if (opts.ignoreKeys && opts.ignoreKeys.length) log(`Ignored JSON keys (--ignore-keys): ${opts.ignoreKeys.join(', ')}`);
    if (opts.rename && opts.rename.size) log(`Renamed baseline file names (--rename): ${[...opts.rename].map(([a, b]) => `${a} -> ${b}`).join(', ')}`);
    if (expectMode) {
        log(`Expected-change manifests: ${manifests.map((m) => `${m.commit} (${m.file})`).join(', ')}`);
        log(`Nondeterminism allowlist: ${allowlistFile} (${allowlist.length} entries)`);
    }
    log('');

    const totals = { IDENTICAL: 0, PASS: 0, WARN: 0, FAIL: 0, EXPECTED: 0, 'EXPECTED?': 0, JITTER: 0 };
    const failedScenarios = [];
    const ALWAYS_SHOWN = new Set(['FAIL', 'WARN', 'EXPECTED', 'EXPECTED?', 'JITTER']);
    for (const s of scenarios) {
        const lines = [];
        let sStatus = 'IDENTICAL';
        if (!s.inBaseline || !s.inCandidate) lines.push(`    scenario ${!s.inBaseline ? 'missing from baseline (extra in candidate)' : 'missing from candidate'}`);
        for (const o of s.outputs) {
            totals[o.status]++;
            if (o.status in RANK) sStatus = worst(sStatus, o.status);
            if (ALWAYS_SHOWN.has(o.status) || verbose) lines.push(`    ${o.status.padEnd(9)} ${o.output}${o.detail ? '  -- ' + o.detail : ''}`);
        }
        lines.unshift(`    (${s.outputs.length} outputs)`);
        if (sStatus === 'FAIL') failedScenarios.push(s.name);
        const label = sStatus === 'FAIL' ? 'FAIL' : sStatus === 'WARN' ? 'PASS (with warnings)' : 'PASS';
        log(`[${label}] ${s.name}`);
        for (const l of lines) log(l);
    }

    const unsatisfied = entries.filter((e) => !e.satisfied);
    if (expectMode) {
        log('\n============ EXPECTED-CHANGE ENTRIES ============');
        if (!entries.length) log('    (no expect entries: every difference outside the allowlist and mayChange keeps its status)');
        for (const e of entries) {
            const head = `[${e.manifest}] ${e.entry.output} (${e.entry.change}${e.entry.each ? ', each' : ''})`;
            if (e.satisfied) log(`    ok        ${head}: ${e.differing} differing of ${e.matched} matching`);
            else log(`    FAIL      ${head}: expected change did not occur (${e.why})`);
        }
    }

    log('\n==================== SUMMARY ====================');
    let sum = `Outputs: ${totals.IDENTICAL} identical, ${totals.PASS} equivalent within tolerance, ${totals.WARN} warnings, ${totals.FAIL} failures`;
    if (expectMode) sum += `, ${totals.EXPECTED} expected, ${totals['EXPECTED?']} may-change, ${totals.JITTER} jitter`;
    log(sum);
    log(`Scenarios: ${scenarios.length - failedScenarios.length}/${scenarios.length} passed${failedScenarios.length ? '  | FAILED: ' + failedScenarios.join(', ') : ''}`);
    if (expectMode) log(`Expected-change entries: ${entries.length - unsatisfied.length}/${entries.length} satisfied`);
    const fail = failedScenarios.length > 0 || unsatisfied.length > 0;
    log(fail ? 'RESULT: FAIL' : 'RESULT: PASS');
    return { exitCode: fail ? 1 : 0, outputs, entries };
}

export class UsageError extends Error {}

/**
 * --diff-bbox (01 T2): append the bounding box of the differing pixels to every differing image output (any status,
 * JITTER included), and for an output judged by a rect entry also the box of the pixels outside its rectangles.
 */
function addDiffBoxes(outputs) {
    for (const o of outputs) {
        if (!IMAGE_KINDS.has(o.kind) || !o.baseFile || !o.candFile) continue;
        const was = o.originalStatus ?? o.status;
        if (was !== 'WARN' && was !== 'FAIL') continue;
        let c = o.rectResult;
        try {
            if (!c) c = rectCheck(o, null, null);
        } catch (e) {
            o.detail = `${o.detail}; diff bbox: ${e.message}`;
            continue;
        }
        o.detail = `${o.detail}; diff bbox ${fmtBox(c.bbox)} (${c.differing} px)`
            + (o.rectResult ? `; outside the rects ${fmtBox(c.outsideBbox)} (${c.outside} px)` : '');
    }
}

const USAGE = 'Usage: node tests/regression/compare.mjs <baselineDir> <candidateDir> [--expect a.json[,b.json]] [--tolerance 1e-5] [--png-threshold 0] [--png-max-percent 0.01] [--shot-threshold 8] [--shot-max-percent 0.5] [--only a,b] [--ignore-keys a,b] [--rename old=new[,old=new]] [--diff-bbox] [--verbose]';

export function main(argv = process.argv) {
    let args;
    try { args = parseArgs(argv); } catch (e) { console.error(e.message); return 2; }
    if (args.positional.length !== 2) {
        console.error(USAGE);
        return 2;
    }
    const [baseDir, candDir] = args.positional.map((p) => path.resolve(p));
    try {
        const { exitCode } = runCompare({
            baseDir, candDir,
            expectFiles: args.expect.map((f) => path.resolve(f)),
            opts: args, only: args.only || null, verbose: args.verbose, diffBbox: args.diffBbox,
        });
        return exitCode;
    } catch (e) {
        console.error(e instanceof UsageError ? `compare: ${e.message}` : e);
        return 2;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main());
