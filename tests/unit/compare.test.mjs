// Unit tests for the golden-master gate of docs/improvements/08-bugfix-roadmap.md section 8.2:
// tests/regression/compare.mjs --expect (expected-change manifests) and the nondeterminism allowlist
// (tests/regression/expected/_nondeterminism.json), on synthetic baseline / candidate output trees; and the rect
// allowances of docs/improvements/01-normals.md 8.4 (T2): `rects` / `size` / `exclude` on manifest entries (the
// per-pixel rule, the allowlisted jitter tolerated outside the rects (F1-0c) and the frame-size check) and
// --diff-bbox, on synthetic PNG pairs; and --ignore-keys (docs/improvements/06-morph-branding.md 8.3, T1).
// Run: node --test tests/unit/compare.test.mjs   (zero dependencies)

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runCompare, globToRegExp, parseExpectManifest, parseAllowlist, NONDETERMINISM_FILE, DEFAULT_OPTIONS } from '../regression/compare.mjs';
import { encodePNG, sha256 } from '../regression/lib/formats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMPARE = path.resolve(HERE, '..', 'regression', 'compare.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'led-compare-test-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// ---- synthetic outputs ---------------------------------------------------------------------------

const W = 20, H = 10;

/** A W x H grey screenshot; `changes` is a list of [pixelIndex, delta] applied to the red channel. */
function png(changes = []) {
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) rgba.set([100, 100, 100, 255], i * 4);
  for (const [i, d] of changes) rgba[i * 4] += d;
  return encodePNG(W, H, rgba);
}

/** The same pixels with different file bytes: a tEXt chunk inserted before IEND. */
function reencoded(buf) {
  const data = Buffer.from('Comment\0re-encoded', 'latin1');
  const type = Buffer.from('tEXt', 'latin1');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([type, data])) >>> 0);
  const iend = buf.length - 12;
  return Buffer.concat([buf.subarray(0, iend), len, type, data, crc, buf.subarray(iend)]);
}

const pixels = (n, delta) => Array.from({ length: n }, (_, k) => [k * 3, delta]);
const json = (v) => Buffer.from(JSON.stringify(v, null, 2) + '\n');

/**
 * Write a harness output tree: `scenarios` is { scenario: { output: { kind, data } } }.
 * Returns the directory.
 */
let treeNo = 0;
function tree(scenarios) {
  const dir = path.join(TMP, `tree-${treeNo++}`);
  const manifest = { meta: { root: 'synthetic', browser: 'none', capturedAt: '2026-10-16T00:00:00.000Z' }, scenarios: {} };
  for (const [s, outputs] of Object.entries(scenarios)) {
    fs.mkdirSync(path.join(dir, s), { recursive: true });
    const entry = { description: s, durationMs: 0, outputs: {} };
    for (const [o, { kind, data }] of Object.entries(outputs)) {
      fs.writeFileSync(path.join(dir, s, o), data);
      entry.outputs[o] = { file: `${s}/${o}`, sha256: sha256(data), kind, bytes: data.length };
    }
    manifest.scenarios[s] = entry;
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

const shot = (data) => ({ kind: 'screenshot', data });
const state = (v) => ({ kind: 'state', data: json(v) });

/** The two trees most tests use: baseline and a candidate with the given per-output overrides. */
const BASE = {
  cfg: { 'a.json': state({ v: 1 }), 'b.json': state({ v: 1 }), 'c.json': state({ v: 1 }), 'view.screenshot.png': shot(png()) },
  keyboard: { 'pilot_view.screenshot.png': shot(png()), 'other.screenshot.png': shot(png()) },
};
function candidate(overrides = {}, extraScenarios = {}) {
  const scenarios = structuredClone(BASE);
  for (const [k, v] of Object.entries(overrides)) {
    const [s, o] = k.split('/');
    if (v === null) delete scenarios[s][o];
    else scenarios[s][o] = v;
  }
  return tree({ ...scenarios, ...extraScenarios });
}
const baseDir = tree(BASE);

let fileNo = 0;
function file(content, name = `m-${fileNo++}.json`) {
  const p = path.join(TMP, name);
  fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  return p;
}

/** The allowlist used by the API tests (mirrors one README entry: keyboard pilot view). */
const ALLOWLIST = file({
  jitter: [{ output: 'keyboard/{pilot_view,final_view}.screenshot.png', maxLevel: 1, maxPixels: 8, overlay: 'pilot banner', evidence: 'test' }],
});

function gate(candDir, manifests = [], { allowlistFile = ALLOWLIST } = {}) {
  const lines = [];
  const r = runCompare({ baseDir, candDir, expectFiles: manifests.map((m) => file(m)), allowlistFile, log: (l) => lines.push(l) });
  const byKey = Object.fromEntries(r.outputs.map((o) => [o.key, o.status]));
  return { ...r, byKey, text: lines.join('\n') };
}
const manifest = (expect, mayChange = []) => ({ commit: 'T-1', bugs: [], expect, mayChange });

// ---- tests -------------------------------------------------------------------------------------

describe('globToRegExp (patterns over <scenario>/<output>)', () => {
  test('* stays within one segment, ** crosses segments, {a,b} alternates, ? is one character', () => {
    const m = (p, s) => globToRegExp(p).test(s);
    assert.ok(m('cfg/*.json', 'cfg/a.json'));
    assert.ok(!m('*.json', 'cfg/a.json'));
    assert.ok(m('**/*.json', 'cfg/a.json'));
    assert.ok(m('**', 'cfg/a.json'));
    assert.ok(m('p2_*/**', 'p2_xss_names/section__export-obj__led-wall-config.obj'));
    assert.ok(!m('p2_*/**', 'camera/cam_01_enabled.json'));
    assert.ok(m('cfg/{a,b}.json', 'cfg/a.json') && m('cfg/{a,b}.json', 'cfg/b.json') && !m('cfg/{a,b}.json', 'cfg/c.json'));
    assert.ok(m('{default,flat3}/final__export-zip__*.zip', 'flat3/final__export-zip__led-wall-export.zip'));
    assert.ok(m('**/*combined__export-*', 'import_edge/ii_combined__export-obj__led-wall-config.obj'));
    assert.ok(m('camera/cam_0?_*.json', 'camera/cam_01_enabled.json') && !m('camera/cam_0?_*.json', 'camera/cam_10_clamps.json'));
    assert.ok(m('{camera/x{1,2}.json,keyboard/*}', 'camera/x2.json') && m('{camera/x{1,2}.json,keyboard/*}', 'keyboard/k'));
    assert.ok(m('a.b(c)+.json', 'a.b(c)+.json') && !m('a.b.json', 'aXb.json'));
    assert.throws(() => globToRegExp('cfg/{a,b.json'), /unclosed/);
  });
});

describe('manifest and allowlist validation', () => {
  test('a manifest needs an expect array, valid change values and known keys', () => {
    assert.throws(() => parseExpectManifest({ commit: 'x' }), /"expect" must be an array/);
    assert.throws(() => parseExpectManifest({ expect: [{ output: 'a', change: 'changed' }] }), /"change" must be one of/);
    assert.throws(() => parseExpectManifest({ expect: [{ output: 'a', change: 'added', chnage: 1 }] }), /unknown key "chnage"/);
    assert.throws(() => parseExpectManifest({ expect: [], extra: 1 }), /unknown key "extra"/);
    assert.throws(() => parseExpectManifest({ expect: [{ output: '', change: 'added' }] }), /non-empty pattern/);
    const m = parseExpectManifest({ commit: 'P2-0', bugs: [], expect: [{ output: 'p2_*/**', change: 'added', each: true }], mayChange: ['x/y.png'] });
    assert.equal(m.commit, 'P2-0');
    assert.equal(m.expect[0].each, true);
    assert.equal(m.mayChange[0].change, null);
  });

  test('an allowlist entry needs a pattern and integer bounds; the committed allowlist parses', () => {
    assert.throws(() => parseAllowlist({ jitter: [{ output: 'a', maxLevel: 1.5, maxPixels: 8 }] }), /maxLevel/);
    assert.throws(() => parseAllowlist({}), /jitter/);
    const committed = parseAllowlist(JSON.parse(fs.readFileSync(NONDETERMINISM_FILE, 'utf8')), NONDETERMINISM_FILE);
    assert.ok(committed.length >= 8);
    for (const e of committed) assert.ok(e.maxLevel <= 1 && e.maxPixels <= 8, `${e.output}: bounds above the documented jitter`);
  });
});

describe('compare --expect semantics (08 section 8.2)', () => {
  test('without --expect the comparison is unchanged: a JSON difference is a FAIL (exit 1)', () => {
    const r = runCompare({ baseDir, candDir: candidate({ 'cfg/a.json': state({ v: 2 }) }), log: () => {} });
    assert.equal(r.exitCode, 1);
    assert.equal(r.entries.length, 0);
  });

  test('an identical tree passes with an empty manifest', () => {
    const r = gate(tree(BASE), [manifest([])]);
    assert.equal(r.exitCode, 0, r.text);
  });

  test('an undeclared difference is a FAIL', () => {
    const r = gate(candidate({ 'cfg/a.json': state({ v: 2 }) }), [manifest([])]);
    assert.equal(r.exitCode, 1);
    assert.equal(r.byKey['cfg/a.json'], 'FAIL');
  });

  test('a declared difference is EXPECTED and the gate passes', () => {
    const r = gate(candidate({ 'cfg/a.json': state({ v: 2 }) }), [manifest([{ output: 'cfg/a.json', change: 'modified' }])]);
    assert.equal(r.exitCode, 0, r.text);
    assert.equal(r.byKey['cfg/a.json'], 'EXPECTED');
    assert.match(r.text, /ok {8}\[T-1\] cfg\/a\.json \(modified\): 1 differing of 1 matching/);
  });

  test('an expect entry whose output does not change is a FAIL ("expected change did not occur")', () => {
    const r = gate(tree(BASE), [manifest([{ output: 'cfg/a.json', change: 'modified' }])]);
    assert.equal(r.exitCode, 1);
    assert.equal(r.entries[0].satisfied, false);
    assert.match(r.text, /expected change did not occur/);
  });

  test('an entry whose pattern matches nothing is a FAIL', () => {
    const r = gate(tree(BASE), [manifest([{ output: 'nowhere/*.json', change: 'added' }])]);
    assert.equal(r.exitCode, 1);
    assert.match(r.entries[0].why, /no output matches/);
  });

  test('a within-tolerance PASS does not satisfy an expect entry: a re-encoded screenshot and a 1e-7 numeric change', () => {
    const r1 = gate(candidate({ 'cfg/view.screenshot.png': shot(reencoded(png())) }), [manifest([{ output: 'cfg/view.screenshot.png', change: 'modified' }])]);
    assert.equal(r1.byKey['cfg/view.screenshot.png'], 'PASS');
    assert.equal(r1.exitCode, 1);
    const r2 = gate(candidate({ 'cfg/a.json': state({ v: 1 + 1e-7 }) }), [manifest([{ output: 'cfg/a.json', change: 'modified' }])]);
    assert.equal(r2.byKey['cfg/a.json'], 'PASS');
    assert.equal(r2.exitCode, 1);
  });

  test('a screenshot WARN is a difference and satisfies an expect entry', () => {
    const r = gate(candidate({ 'cfg/view.screenshot.png': shot(png(pixels(3, 5))) }), [manifest([{ output: 'cfg/*.screenshot.png', change: 'modified' }])]);
    assert.equal(r.byKey['cfg/view.screenshot.png'], 'EXPECTED');
    assert.equal(r.exitCode, 0, r.text);
  });

  test('"each": every matching baseline output must differ; without it one is enough', () => {
    const cand = candidate({ 'cfg/a.json': state({ v: 2 }) });
    assert.equal(gate(cand, [manifest([{ output: 'cfg/{a,b}.json', change: 'modified' }])]).exitCode, 0);
    const r = gate(cand, [manifest([{ output: 'cfg/{a,b}.json', change: 'modified', each: true }])]);
    assert.equal(r.exitCode, 1);
    assert.match(r.entries[0].why, /1 of 2 matching baseline output\(s\) did not change: cfg\/b\.json/);
    const both = candidate({ 'cfg/a.json': state({ v: 2 }), 'cfg/b.json': state({ v: 3 }) });
    assert.equal(gate(both, [manifest([{ output: 'cfg/{a,b}.json', change: 'modified', each: true }])]).exitCode, 0);
  });

  test('{a,b} patterns: c.json is not covered by cfg/{a,b}.json', () => {
    const cand = candidate({ 'cfg/a.json': state({ v: 2 }), 'cfg/b.json': state({ v: 2 }), 'cfg/c.json': state({ v: 2 }) });
    const r = gate(cand, [manifest([{ output: 'cfg/{a,b}.json', change: 'modified', each: true }])]);
    assert.equal(r.byKey['cfg/a.json'], 'EXPECTED');
    assert.equal(r.byKey['cfg/b.json'], 'EXPECTED');
    assert.equal(r.byKey['cfg/c.json'], 'FAIL');
    assert.equal(r.exitCode, 1);
  });

  test('added and removed outputs, a new scenario, and an incompatible change kind', () => {
    const cand = candidate({ 'cfg/c.json': null, 'cfg/d.json': state({ v: 1 }) }, { p2_new: { 'x.json': state({}), 'y.screenshot.png': shot(png()) } });
    const ok = gate(cand, [manifest([
      { output: 'cfg/c.json', change: 'removed' },
      { output: 'cfg/d.json', change: 'added' },
      { output: 'p2_*/**', change: 'added', each: true },
    ])]);
    assert.equal(ok.exitCode, 0, ok.text);
    assert.equal(ok.byKey['p2_new/x.json'], 'EXPECTED');
    assert.equal(ok.byKey['cfg/c.json'], 'EXPECTED');
    const wrong = gate(cand, [manifest([
      { output: 'cfg/c.json', change: 'modified' },
      { output: 'cfg/d.json', change: 'added' },
      { output: 'p2_*/**', change: 'added' },
    ])]);
    assert.equal(wrong.byKey['cfg/c.json'], 'FAIL');
    assert.equal(wrong.exitCode, 1);
  });

  test('mayChange: a matching difference is EXPECTED? and does not count; it is never required', () => {
    const r = gate(candidate({ 'cfg/view.screenshot.png': shot(png(pixels(3, 2))) }), [manifest([], [{ output: 'cfg/view.screenshot.png', reason: 'wireframe' }])]);
    assert.equal(r.byKey['cfg/view.screenshot.png'], 'EXPECTED?');
    assert.equal(r.exitCode, 0);
    assert.equal(gate(tree(BASE), [manifest([], ['cfg/view.screenshot.png'])]).exitCode, 0);
  });

  test('several manifests are combined (--expect a.json,b.json)', () => {
    const cand = candidate({ 'cfg/a.json': state({ v: 2 }), 'cfg/b.json': state({ v: 2 }) });
    const r = gate(cand, [manifest([{ output: 'cfg/a.json', change: 'modified' }]), { commit: 'T-2', expect: [{ output: 'cfg/b.json', change: 'modified' }] }]);
    assert.equal(r.exitCode, 0, r.text);
  });
});

describe('the nondeterminism allowlist (JITTER)', () => {
  test('a 1-level, 5-pixel difference on a listed screenshot is JITTER and the gate passes', () => {
    const r = gate(candidate({ 'keyboard/pilot_view.screenshot.png': shot(png(pixels(5, 1))) }), [manifest([])]);
    assert.equal(r.byKey['keyboard/pilot_view.screenshot.png'], 'JITTER');
    assert.equal(r.exitCode, 0);
    assert.match(r.text, /1 jitter/);
  });

  test('a 2-level difference on the same output is an ordinary WARN', () => {
    const r = gate(candidate({ 'keyboard/pilot_view.screenshot.png': shot(png(pixels(5, 2))) }), [manifest([])]);
    assert.equal(r.byKey['keyboard/pilot_view.screenshot.png'], 'WARN');
  });

  test('more pixels than maxPixels is an ordinary WARN', () => {
    const r = gate(candidate({ 'keyboard/pilot_view.screenshot.png': shot(png(pixels(9, 1))) }), [manifest([])]);
    assert.equal(r.byKey['keyboard/pilot_view.screenshot.png'], 'WARN');
  });

  test('a jitter-sized difference on an unlisted output is a WARN', () => {
    const r = gate(candidate({ 'keyboard/other.screenshot.png': shot(png(pixels(5, 1))) }), [manifest([])]);
    assert.equal(r.byKey['keyboard/other.screenshot.png'], 'WARN');
  });

  test('JITTER never satisfies an expect entry', () => {
    const r = gate(candidate({ 'keyboard/pilot_view.screenshot.png': shot(png(pixels(5, 1))) }), [manifest([{ output: 'keyboard/pilot_view.screenshot.png', change: 'modified' }])]);
    assert.equal(r.byKey['keyboard/pilot_view.screenshot.png'], 'JITTER');
    assert.equal(r.exitCode, 1);
    assert.equal(r.entries[0].satisfied, false);
  });

  test('the allowlist applies only with --expect', () => {
    const r = runCompare({ baseDir, candDir: candidate({ 'keyboard/pilot_view.screenshot.png': shot(png(pixels(5, 1))) }), log: () => {} });
    assert.equal(r.outputs.find((o) => o.key === 'keyboard/pilot_view.screenshot.png').status, 'WARN');
  });

  test('--expect without an allowlist file is a usage error', () => {
    assert.throws(() => runCompare({ baseDir, candDir: baseDir, expectFiles: [file(manifest([]))], allowlistFile: path.join(TMP, 'missing.json'), log: () => {} }), /allowlist/);
  });
});

describe('command line', () => {
  const cli = (...args) => spawnSync(process.execPath, [COMPARE, ...args], { encoding: 'utf8' });

  test('exit codes: 1 for an undeclared difference, 0 when declared, 2 for a malformed manifest', () => {
    const cand = candidate({ 'cfg/a.json': state({ v: 2 }) });
    assert.equal(cli(baseDir, cand, '--expect', file(manifest([]))).status, 1);
    const ok = cli(baseDir, cand, '--expect', file(manifest([{ output: 'cfg/a.json', change: 'modified' }])), '--verbose');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /EXPECTED +a\.json/);
    assert.match(ok.stdout, /Nondeterminism allowlist: .*_nondeterminism\.json/);
    assert.equal(cli(baseDir, cand, '--expect', file({ expect: [{ output: 'x', change: 'nope' }] })).status, 2);
    assert.equal(cli(baseDir).status, 2);
  });
});

describe('rect allowances (01 T2: rects, size, exclude, --diff-bbox)', () => {
  const at = (x, y) => y * W + x;
  const VIEW = 'cfg/view.screenshot.png';
  /** One `rects` entry on cfg/view in the W x H frame. */
  const rectEntry = (rects, extra = {}) => ({ output: VIEW, change: 'modified', size: [W, H], rects, ...extra });
  const CORNERS = [{ x: 0, y: 0, w: 3, h: 3, label: 'column' }, { x: 17, y: 7, w: 3, h: 3, label: 'badge' }];

  test('a difference whose every pixel lies in the union of the rects is EXPECTED, though the rects sit in opposite corners', () => {
    const cand = candidate({ [VIEW]: shot(png([[at(0, 0), 5], [at(2, 2), 3], [at(19, 9), 40]])) });
    const r = gate(cand, [manifest([rectEntry(CORNERS)])]);
    assert.equal(r.exitCode, 0, r.text);
    assert.equal(r.byKey[VIEW], 'EXPECTED');
    assert.equal(r.entries[0].satisfied, true);
    assert.match(r.text, /all 3 differing px inside the rects \(bbox \[0,0\]-\[19,9\]\)/);
  });

  test('one differing pixel outside the rects is a FAIL, even when the diff alone is only a WARN, and satisfies nothing', () => {
    const cand = candidate({ [VIEW]: shot(png([[at(0, 0), 1], [at(10, 5), 1]])) });
    const plain = gate(cand, [manifest([{ output: VIEW, change: 'modified' }])]);
    assert.equal(plain.exitCode, 0, 'without rects the 1-level WARN is EXPECTED');
    const r = gate(cand, [manifest([rectEntry(CORNERS)])]);
    assert.equal(r.byKey[VIEW], 'FAIL');
    assert.equal(r.exitCode, 1);
    assert.equal(r.entries[0].satisfied, false);
    assert.match(r.text, /1 of 2 differing px outside the rects \(max 1, bbox \[10,5\]-\[10,5\]\)/);
    assert.match(r.text, /1 differing output\(s\) failed the rect check/);
  });

  test('a differing capture of another frame size is a FAIL "rect frame mismatch"', () => {
    const cand = candidate({ [VIEW]: shot(png([[at(0, 0), 5]])) });
    const r = gate(cand, [manifest([rectEntry(CORNERS, { size: [1200, 940] })])]);
    assert.equal(r.byKey[VIEW], 'FAIL');
    assert.match(r.text, /rect frame mismatch: the capture is 20x10, the entry's frame is 1200x940/);
    assert.equal(r.exitCode, 1);
  });

  test('unchanged captures pass whatever their size; "each" still needs every matching baseline capture to change', () => {
    const big = () => shot(encodePNG(40, 10, new Uint8Array(40 * 10 * 4).fill(100)));
    const base = tree({ s: { 'small.screenshot.png': shot(png()), 'big.screenshot.png': big() } });
    const cand = tree({ s: { 'small.screenshot.png': shot(png([[0, 9]])), 'big.screenshot.png': big() } });
    const run = (entry) => {
      const lines = [];
      const r = runCompare({ baseDir: base, candDir: cand, expectFiles: [file(manifest([entry]))], allowlistFile: ALLOWLIST, log: (l) => lines.push(l) });
      return { ...r, byKey: Object.fromEntries(r.outputs.map((o) => [o.key, o.status])), text: lines.join('\n') };
    };
    const ok = run({ output: 's/*.screenshot.png', change: 'modified', size: [W, H], rects: [{ x: 0, y: 0, w: 1, h: 1 }] });
    assert.equal(ok.exitCode, 0, ok.text);
    assert.equal(ok.byKey['s/big.screenshot.png'], 'IDENTICAL');
    assert.equal(ok.byKey['s/small.screenshot.png'], 'EXPECTED');
    const each = run({ output: 's/*.screenshot.png', change: 'modified', each: true, size: [W, H], rects: [{ x: 0, y: 0, w: 1, h: 1 }] });
    assert.equal(each.exitCode, 1);
  });

  test('exclude: an output matched by "output" and by "exclude" is not matched (expect and mayChange)', () => {
    const cand = candidate({ [VIEW]: shot(png([[at(0, 0), 5]])), 'keyboard/other.screenshot.png': shot(png([[at(5, 5), 30]])) });
    const r = gate(cand, [manifest([{ output: '*/*.screenshot.png', exclude: 'keyboard/**', change: 'modified', size: [W, H], rects: CORNERS }])]);
    assert.equal(r.byKey[VIEW], 'EXPECTED');
    assert.equal(r.byKey['keyboard/other.screenshot.png'], 'WARN', 'excluded, so it keeps its status');
    const m = gate(cand, [manifest([], [{ output: '**', exclude: 'keyboard/**' }])]);
    assert.equal(m.byKey[VIEW], 'EXPECTED?');
    assert.equal(m.byKey['keyboard/other.screenshot.png'], 'WARN');
  });

  test('a mayChange entry with rects: inside is EXPECTED?, outside is a FAIL', () => {
    const inside = gate(candidate({ [VIEW]: shot(png([[at(1, 1), 5]])) }), [manifest([], [rectEntry(CORNERS)])]);
    assert.equal(inside.byKey[VIEW], 'EXPECTED?');
    assert.equal(inside.exitCode, 0);
    const outside = gate(candidate({ [VIEW]: shot(png([[at(9, 4), 5]])) }), [manifest([], [rectEntry(CORNERS)])]);
    assert.equal(outside.byKey[VIEW], 'FAIL');
    assert.equal(outside.exitCode, 1);
  });

  test('outside the rects, only the allowlisted jitter of that screenshot is tolerated (F1-0c)', () => {
    const PILOT = 'keyboard/pilot_view.screenshot.png';   // allowlisted in ALLOWLIST: <= 1 level, <= 8 px
    const OTHER = 'keyboard/other.screenshot.png';        // not allowlisted
    const entry = (output) => ({ output, change: 'modified', size: [W, H], rects: CORNERS });
    // A real change in the column rect plus 1-level flips at two pixels outside (the preview-label jitter of camera/*).
    const real = [[at(1, 1), 40], [at(2, 0), 40]];
    const run = (output, outside, mayChange = false) => {
      const m = mayChange ? manifest([], [entry(output)]) : manifest([entry(output)]);
      return gate(candidate({ [output]: shot(png([...real, ...outside])) }), [m]);
    };

    const ok = run(PILOT, [[at(10, 5), 1], [at(11, 5), 1]]);
    assert.equal(ok.byKey[PILOT], 'EXPECTED', ok.text);
    assert.equal(ok.exitCode, 0);
    assert.equal(ok.entries[0].satisfied, true);
    assert.match(ok.text, /2 of 4 differing px inside the rects .*2 outside within the allowlisted jitter \(keyboard\/\{pilot_view,final_view\}\.screenshot\.png, <= 1 level \/ 8 px; max 1, bbox \[10,5\]-\[11,5\]\)/);
    assert.equal(run(PILOT, [[at(10, 5), 1]], true).byKey[PILOT], 'EXPECTED?', 'mayChange entries tolerate it too');

    const twoLevels = run(PILOT, [[at(10, 5), 2]]);
    assert.equal(twoLevels.byKey[PILOT], 'FAIL', 'a 2-level pixel outside is more than the jitter');
    assert.match(twoLevels.text, /1 of 3 differing px outside the rects \(max 2, bbox \[10,5\]-\[10,5\]; beyond the allowlisted jitter of keyboard\/\{pilot_view,final_view\}\.screenshot\.png/);
    const nine = run(PILOT, Array.from({ length: 9 }, (_, k) => [at(5 + k, 5), 1]));
    assert.equal(nine.byKey[PILOT], 'FAIL', 'more outside pixels than maxPixels');
    assert.equal(nine.exitCode, 1);

    const unlisted = run(OTHER, [[at(10, 5), 1]]);
    assert.equal(unlisted.byKey[OTHER], 'FAIL', 'a screenshot without an allowlist entry gets no tolerance');
    assert.equal(unlisted.entries[0].satisfied, false);
  });

  test('rects judge images only: a rect entry matching a differing JSON output makes it a FAIL', () => {
    const r = gate(candidate({ 'cfg/a.json': state({ v: 2 }) }), [manifest([{ output: 'cfg/a.json', change: 'modified', size: [W, H], rects: CORNERS }])]);
    assert.equal(r.byKey['cfg/a.json'], 'FAIL');
    assert.match(r.text, /rects apply to screenshots and PNG exports only/);
  });

  test('validation: rects and size go together, modified only, integer fields; an unmeasured "measure" entry is refused', () => {
    const bad = (entry, re) => assert.throws(() => parseExpectManifest(manifest([entry])), re);
    bad({ output: VIEW, change: 'modified', rects: CORNERS }, /"rects" and "size" go together/);
    bad({ output: VIEW, change: 'modified', size: [W, H] }, /"rects" and "size" go together/);
    bad(rectEntry(CORNERS, { change: 'added' }), /only apply to "change": "modified"/);
    bad(rectEntry([{ x: 0.5, y: 0, w: 1, h: 1 }]), /"x" must be an integer/);
    bad(rectEntry([{ x: 0, y: 0, w: -1, h: 1 }]), /must not be negative/);
    bad(rectEntry([{ x: 0, y: 0, w: 1, h: 1, colour: 'red' }]), /unknown key "colour"/);
    bad(rectEntry([]), /non-empty array/);
    bad(rectEntry(CORNERS, { size: [W] }), /"size" must be \[width, height\]/);
    bad({ output: VIEW, change: 'modified', measure: { frame: 'canvas' } }, /run tests\/regression\/measure-rects\.mjs/);
    bad({ output: VIEW, change: 'modified', exclude: '' }, /"exclude" must be a non-empty pattern/);
    const ok = parseExpectManifest(manifest([rectEntry(CORNERS, { measure: { frame: 'page', window: [W, H], selectors: ['.x'] } })]));
    assert.deepEqual(ok.expect[0].size, [W, H]);
    assert.equal(ok.expect[0].rects.length, 2);
  });

  test('--diff-bbox (command line) prints the box of the differing pixels and, for a rect entry, of those outside', () => {
    const cli = (...args) => spawnSync(process.execPath, [COMPARE, ...args], { encoding: 'utf8' });
    const cand = candidate({ [VIEW]: shot(png([[at(1, 1), 5], [at(12, 6), 5]])), 'keyboard/other.screenshot.png': shot(png([[at(4, 3), 50]])) });
    const m = file(manifest([rectEntry(CORNERS)], [{ output: 'keyboard/other.screenshot.png' }]));
    const r = cli(baseDir, cand, '--expect', m, '--diff-bbox');
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /view\.screenshot\.png .*1 of 2 differing px outside the rects \(max 5, bbox \[12,6\]-\[12,6\]\).*diff bbox \[1,1\]-\[12,6\] \(2 px\); outside the rects \[12,6\]-\[12,6\] \(1 px\)/);
    assert.match(r.stdout, /other\.screenshot\.png .*diff bbox \[4,3\]-\[4,3\] \(1 px\)/);
    const plain = cli(baseDir, cand, '--expect', m);
    assert.doesNotMatch(plain.stdout, /diff bbox/);
  });
});

describe('--ignore-keys (06 T1: classes,class; 06 T5: statusColor)', () => {
  const styles = (classes, color = 'rgb(1, 2, 3)') => state({
    viewport: { width: 1600 }, cssTokens: {}, controlPanelScroll: null,
    elements: { 'card0/offset-hint': { matches: 1, found: true, classes, styles: { color } } },
  });
  const text = (cls, label = 'Reset') => state({ buttons: [{ tag: 'button', id: 'reset-camera', class: cls, text: label }] });
  const both = { a: { 'x.styles.json': styles(['curve-hint']), 'x.text.json': text('export-btn secondary') } };
  const base = tree(both);
  const run = (cand, ignoreKeys) => {
    const lines = [];
    const opts = ignoreKeys ? { ...DEFAULT_OPTIONS, ignoreKeys } : DEFAULT_OPTIONS;
    const r = runCompare({ baseDir: base, candDir: cand, opts, log: (l) => lines.push(l) });
    return { ...r, byKey: Object.fromEntries(r.outputs.map((o) => [o.key, o])), text: lines.join('\n') };
  };

  test('outputs that differ only in the ignored keys (any depth) are equivalent; without the option they fail', () => {
    const cand = tree({ a: { 'x.styles.json': styles(['curve-hint', 'curve-hint--small']), 'x.text.json': text('btn-block export-btn mt-10 secondary') } });
    assert.equal(run(cand).exitCode, 1);
    const r = run(cand, ['classes', 'class']);
    assert.equal(r.exitCode, 0, r.text);
    for (const key of ['a/x.styles.json', 'a/x.text.json']) {
      assert.equal(r.byKey[key].status, 'PASS');
      assert.equal(r.byKey[key].change, null);
      assert.match(r.byKey[key].detail, /classes, class ignored/);
    }
    assert.match(r.text, /Ignored JSON keys \(--ignore-keys\): classes, class/);
  });

  test('any other difference still fails, and a key that is not ignored still counts', () => {
    const r = run(tree({ a: { 'x.styles.json': styles(['curve-hint', 'x'], 'rgb(9, 9, 9)'), 'x.text.json': text('other', 'Reset camera') } }), ['classes', 'class']);
    assert.equal(r.exitCode, 1);
    assert.equal(r.byKey['a/x.styles.json'].status, 'FAIL');
    assert.match(r.byKey['a/x.styles.json'].detail, /color/);
    assert.equal(r.byKey['a/x.text.json'].status, 'FAIL');
    assert.equal(run(tree({ a: { ...both.a, 'x.styles.json': styles(['other']) } }), ['class']).byKey['a/x.styles.json'].status, 'FAIL');
  });

  test('command line: --ignore-keys a,b; an empty list is a usage error', () => {
    const cli = (...args) => spawnSync(process.execPath, [COMPARE, ...args], { encoding: 'utf8' });
    const cand = tree({ a: { 'x.styles.json': styles(['y']), 'x.text.json': text('z') } });
    assert.equal(cli(base, cand).status, 1);
    const ok = cli(base, cand, '--ignore-keys', 'classes,class', '--verbose');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /PASS +x\.styles\.json +-- equivalent with the keys classes, class ignored/);
    assert.equal(cli(base, cand, '--ignore-keys', ',').status, 2);
  });
});
