#!/usr/bin/env node
// Golden-master comparator.
//   node tests/regression/compare.mjs <baselineDir> <candidateDir> [--tolerance 1e-5]
//        [--png-threshold 0] [--png-max-percent 0.01] [--shot-threshold 8] [--shot-max-percent 0.5]
//        [--only scenarioA,scenarioB] [--verbose]
// Exit code: 0 = no FAIL, 1 = at least one FAIL, 2 = usage error.
import fs from 'node:fs';
import path from 'node:path';
import { decodePNG, readZip, kindForFilename } from './lib/formats.mjs';

// ---------------------------------------------------------------------------------------------
// Documented nondeterminism handling (never silently ignored - each is reported):
//   * ZIP container bytes (kind 'zip'): JSZip stamps entries with the current date/time, so the
//     archive bytes differ on every export. Archives are compared by entry list + per-entry content.
//   * Viewport screenshots (kind 'screenshot'): GPU/SwiftShader rasterisation may legitimately
//     differ by a few levels; any difference is a WARN, a FAIL only beyond --shot-threshold /
//     --shot-max-percent.
//   * console.json (kind 'console'): compared as a multiset of (kind, normalised message); the step
//     an async error is attributed to and URLs/line numbers are ignored. Errors that disappear in
//     the candidate are a WARN (likely a fix); new errors are a FAIL.
//   * WARN_ONLY below: outputs whose differences are downgraded to WARN. Patterns are matched
//     against "<scenario>/<output>". Keep this list empty unless a self-consistency run proves an
//     output is nondeterministic, and document why next to each entry.
// ---------------------------------------------------------------------------------------------
const WARN_ONLY = [
    // { pattern: /^toggles\/.*\.screenshot\.png$/, reason: 'example' },
];

function parseArgs(argv) {
    const a = { tolerance: 1e-5, pngThreshold: 0, pngMaxPercent: 0.01, shotThreshold: 8, shotMaxPercent: 0.5, verbose: false, positional: [] };
    for (let i = 2; i < argv.length; i++) {
        const k = argv[i];
        const num = () => { const v = Number(argv[++i]); if (!Number.isFinite(v)) throw new Error('Bad number for ' + k); return v; };
        if (k === '--tolerance') a.tolerance = num();
        else if (k === '--png-threshold') a.pngThreshold = num();
        else if (k === '--png-max-percent') a.pngMaxPercent = num();
        else if (k === '--shot-threshold') a.shotThreshold = num();
        else if (k === '--shot-max-percent') a.shotMaxPercent = num();
        else if (k === '--only') a.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
        else if (k === '--verbose' || k === '-v') a.verbose = true;
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

function compareJSON(aBuf, bBuf, tol) {
    const a = parseJSONSafe(aBuf), b = parseJSONSafe(bBuf);
    if (!a.ok || !b.ok) {
        if (aBuf.equals(bBuf)) return result('PASS', 'unparseable but identical');
        return result('FAIL', `JSON parse error: baseline=${a.error || 'ok'} candidate=${b.error || 'ok'}`);
    }
    const stats = { maxNum: 0 };
    const diffs = deepCompare(a.value, b.value, tol, '$', [], stats);
    if (diffs.length) {
        if (isStyleSnapshot(a.value) && isStyleSnapshot(b.value)) return result('FAIL', styleSnapshotDiff(a.value, b.value, tol));
        return result('FAIL', diffs.join('; '));
    }
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
    if (maxDiff === 0) return result('PASS', 'pixel-identical (encoding differs)', { maxDiff, pct });
    if (pct > maxPercent) return result('FAIL', detail, { maxDiff, pct });
    return result('WARN', detail, { maxDiff, pct });
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
            return compareJSON(aBuf, bBuf, opts.tolerance);
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

function loadManifest(dir) {
    const p = path.join(dir, 'manifest.json');
    if (!fs.existsSync(p)) throw new Error('No manifest.json in ' + dir);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
    let args;
    try { args = parseArgs(process.argv); } catch (e) { console.error(e.message); return 2; }
    if (args.positional.length !== 2) {
        console.error('Usage: node tests/regression/compare.mjs <baselineDir> <candidateDir> [--tolerance 1e-5] [--png-threshold 0] [--png-max-percent 0.01] [--shot-threshold 8] [--shot-max-percent 0.5] [--only a,b] [--verbose]');
        return 2;
    }
    const [baseDir, candDir] = args.positional.map((p) => path.resolve(p));
    const A = loadManifest(baseDir), B = loadManifest(candDir);
    console.log(`Baseline : ${baseDir}\n           ${A.meta?.browser || '?'} captured ${A.meta?.capturedAt || '?'} from ${A.meta?.root || '?'}`);
    console.log(`Candidate: ${candDir}\n           ${B.meta?.browser || '?'} captured ${B.meta?.capturedAt || '?'} from ${B.meta?.root || '?'}`);
    console.log(`Tolerance ${args.tolerance}; export PNG: >${args.pngThreshold} on >${args.pngMaxPercent}% px = FAIL; screenshots: >${args.shotThreshold} on >${args.shotMaxPercent}% px = FAIL\n`);

    let scenarios = [...new Set([...Object.keys(A.scenarios || {}), ...Object.keys(B.scenarios || {})])];
    if (args.only) scenarios = scenarios.filter((s) => args.only.includes(s));
    const totals = { IDENTICAL: 0, PASS: 0, WARN: 0, FAIL: 0 };
    const scenarioStatus = {};

    for (const s of scenarios) {
        const lines = [];
        let sStatus = 'IDENTICAL';
        const sa = A.scenarios[s], sb = B.scenarios[s];
        if (!sa || !sb) {
            sStatus = 'FAIL';
            lines.push(`    FAIL  scenario ${!sa ? 'missing from baseline (extra in candidate)' : 'missing from candidate'}`);
            totals.FAIL++;
        } else {
            const outs = [...new Set([...Object.keys(sa.outputs), ...Object.keys(sb.outputs)])];
            for (const o of outs) {
                const oa = sa.outputs[o], ob = sb.outputs[o];
                let r;
                if (!oa) r = result('FAIL', 'EXTRA output (not in baseline)');
                else if (!ob) r = result('FAIL', 'MISSING output (not produced by candidate)');
                else if (oa.kind !== ob.kind) r = result('FAIL', `kind ${oa.kind} vs ${ob.kind}`);
                else {
                    try {
                        const ba = fs.readFileSync(path.join(baseDir, oa.file));
                        const bb = fs.readFileSync(path.join(candDir, ob.file));
                        r = compareContent(oa.kind, ba, bb, args, o);
                    } catch (e) {
                        r = result('FAIL', 'read error: ' + e.message);
                    }
                }
                const wo = WARN_ONLY.find((w) => w.pattern.test(`${s}/${o}`));
                if (wo && r.status === 'FAIL') r = result('WARN', `[warn-only: ${wo.reason}] ${r.detail}`);
                totals[r.status]++;
                sStatus = worst(sStatus, r.status);
                if (r.status === 'FAIL' || r.status === 'WARN' || args.verbose) {
                    lines.push(`    ${r.status.padEnd(9)} ${o}${r.detail ? '  -- ' + r.detail : ''}`);
                }
            }
            const nOut = outs.length;
            lines.unshift(`    (${nOut} outputs)`);
        }
        scenarioStatus[s] = sStatus;
        const label = sStatus === 'FAIL' ? 'FAIL' : sStatus === 'WARN' ? 'PASS (with warnings)' : 'PASS';
        console.log(`[${label}] ${s}`);
        for (const l of lines) console.log(l);
    }

    const failed = Object.entries(scenarioStatus).filter(([, v]) => v === 'FAIL').map(([k]) => k);
    console.log('\n==================== SUMMARY ====================');
    console.log(`Outputs: ${totals.IDENTICAL} identical, ${totals.PASS} equivalent within tolerance, ${totals.WARN} warnings, ${totals.FAIL} failures`);
    console.log(`Scenarios: ${scenarios.length - failed.length}/${scenarios.length} passed${failed.length ? '  | FAILED: ' + failed.join(', ') : ''}`);
    console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
    return failed.length ? 1 : 0;
}

process.exit(main());
