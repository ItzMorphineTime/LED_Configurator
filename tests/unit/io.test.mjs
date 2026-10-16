// Unit tests for the IO layer (js/io/*) and its use cases (js/app/ProjectIO.js, js/ui/ExportPanel.js).
//
// 1. Oracle equality: ObjExporter, GltfExporter and ProjectSerializer produce BYTE-identical text / JSON to the
//    verbatim legacy oracle (tests/unit/oracle/legacy-io.mjs, copied from index.html@cd3fd3f) over hand-picked walls,
//    the harness configurations and seeded fuzzed walls (fractional and string fields, NaN / duplicate / string ids,
//    numeric names, odd colours, unknown mesh modes, empty walls). Where legacy throws, both throw the same error
//    type and message. ProjectSerializer.read equals the legacy import mapping over fuzzed documents. (NaN byte
//    encodings in the glTF Float32 buffer are canonicalised first: they are implementation-defined, see gltfText.)
// 2. Golden files: the projects of the 'default' scenario and of every config in tests/regression/configs.mjs are
//    rebuilt in Node and every export is compared byte for byte with the golden-master downloads in GOLDEN_DIR
//    (default tests/regression/output/baseline; skipped with a message when absent), under correctly rounded
//    Math.atan2 / sin / cos as in the Chrome that captured them (see "Chrome math emulation").
// 3. ProjectSerializer.read edge cases; 4. strategy reads (foreign profile values throw unsupportedStrategy);
// 5. ProjectIO / Downloader / ExportPanel sequences with fakes (order, async shape, no added try/catch).
// Run: node --test tests/unit/io.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WallSection } from '../../js/domain/WallSection.js';
import { Project } from '../../js/domain/Project.js';
import { LegacyProfiles, Strategies, unsupportedStrategy } from '../../js/legacy/LegacyCompat.js';
import { layoutProject } from '../../js/geometry/WallLayout.js';
import { WallMeshBuilder, maxIndexOf } from '../../js/geometry/WallMeshBuilder.js';
import { checkGltfDocument } from '../../tools/check-gltf.mjs';
import { checkObjText, checkGltfOrientation } from '../../tools/check-orientation.mjs';
import { computeAtlas } from '../../js/geometry/TextureAtlas.js';
import { zipTextureFileName } from '../../js/geometry/PanelNaming.js';
import { ProjectSerializer } from '../../js/io/ProjectSerializer.js';
import { ObjExporter } from '../../js/io/ObjExporter.js';
import { GltfExporter, chunkedBase64 } from '../../js/io/GltfExporter.js';
import { ProjectIO, Downloader } from '../../js/app/ProjectIO.js';
import { ExportPanel } from '../../js/ui/ExportPanel.js';
import { PanelIdRenderer } from '../../js/render/textures/PanelIdRenderer.js';
import { Brand, Palette } from '../../js/theme/Theme.js';
import * as L from './oracle/legacy-io.mjs';
import { CONFIGS } from '../regression/configs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GOLDEN_DIR = path.resolve(REPO, process.env.GOLDEN_DIR || 'tests/regression/output/baseline');
const MODES = ['combined', 'section', 'panel'];

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

/**
 * THREE r128 `new THREE.Color(style)` for '#rrggbb' and '#rgb' (Color#setStyle; r128 has no colour management):
 * r = parseInt(hex.slice(1, 3), 16) / 255, etc. Every other value returns white here. That matches r128 only for
 * strings it cannot parse ('', '#12345': it warns and keeps its default white); r128 itself maps CSS keywords
 * ('red'), rgb()/hsl() strings and numbers (setHex) to other colours. The difference is harmless for these tests:
 * the oracle and the exporters receive the same injected parser, and the golden files use '#rrggbb' only.
 */
function colorToRgb(style) {
  const m = typeof style === 'string' ? /^#([A-Fa-f\d]+)$/.exec(style) : null;
  if (m) {
    const hex = m[1];
    if (hex.length === 6) {
      return { r: parseInt(style.slice(1, 3), 16) / 255, g: parseInt(style.slice(3, 5), 16) / 255, b: parseInt(style.slice(5, 7), 16) / 255 };
    }
    if (hex.length === 3) {
      return { r: parseInt(hex[0] + hex[0], 16) / 255, g: parseInt(hex[1] + hex[1], 16) / 255, b: parseInt(hex[2] + hex[2], 16) / 255 };
    }
  }
  return { r: 1, g: 1, b: 1 };
}

/**
 * The Phase-1 glTF encoder (index.html@cd3fd3f 4902), copied verbatim from js/legacy/LegacyCompat.js before 08 P2-1a
 * deleted it with Strategies.gltfBase64 (B-H3: the spread throws RangeError above about 125 KB). A retired global key
 * cannot be injected (08 4.2), so the oracle comparisons inject this copy and keep testing the exact legacy outcome.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function legacySpreadBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

/** Node's own base64, the reference for every encoder test. */
const nodeBase64 = (bytes) => Buffer.from(bytes).toString('base64');

const serializer = new ProjectSerializer({ palette: Palette });
const makeObj = (profile = Strategies.mesh.obj) => new ObjExporter({ brand: Brand, colorToRgb, builder: new WallMeshBuilder(profile) });
const makeGltf = (profile = Strategies.mesh.gltf, encodeBase64 = undefined) =>
  new GltfExporter({ brand: Brand, colorToRgb, builder: new WallMeshBuilder(profile), encodeBase64 });
// The golden comparisons and the use-case tests use the production profiles (Strategies.mesh.*) and the production
// encoder (chunkedBase64). The oracle comparisons use the exact Phase-1 profiles (LegacyProfiles.mesh.*, 08 4.2) and
// the Phase-1 spread encoder, so they stay meaningful after each Phase-2 flip.
const OBJ = makeObj();
const GLTF = makeGltf();
const LEGACY_OBJ = makeObj(LegacyProfiles.mesh.obj);
const LEGACY_GLTF = makeGltf(LegacyProfiles.mesh.gltf, legacySpreadBase64);

/** A project whose wall is exactly `sections` (Wall.replaceAll, as the import does) in `meshMode`. */
function projectOf(sections, meshMode) {
  const project = Project.createDefault();
  project.wall.replaceAll(sections);
  project.meshMode = meshMode;
  return project;
}

/** Runs fn and captures its value or its exception. */
function run(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

const describeError = (e) => `${e && e.constructor ? e.constructor.name : typeof e}: ${e && e.message}`;

/** Both outcomes returned equal strings (after `toText`), or both threw the same error type and message. */
function assertSameOutcome(actual, expected, label, toText = (v) => v) {
  if (!expected.ok || !actual.ok) {
    assert.equal(actual.ok, expected.ok,
      `${label}: ${actual.ok ? 'returned' : `threw ${describeError(actual.error)}`}, legacy ${expected.ok ? 'returned' : `threw ${describeError(expected.error)}`}`);
    assert.equal(describeError(actual.error), describeError(expected.error), `${label}: error`);
    return 'threw';
  }
  const a = toText(actual.value);
  const e = toText(expected.value);
  if (a !== e) assert.fail(`${label}: output differs from legacy ${firstDifference(a, e)}`);
  return 'equal';
}

/** "at char N: got '...' expected '...'" for two strings. */
function firstDifference(a, e) {
  let i = 0;
  while (i < a.length && i < e.length && a[i] === e[i]) i++;
  return `at char ${i} (lengths ${a.length} / ${e.length}): got ${JSON.stringify(a.slice(Math.max(0, i - 40), i + 40))}, ` +
    `expected ${JSON.stringify(e.slice(Math.max(0, i - 40), i + 40))}`;
}

const legacyGeometry = (sections) => L.generateAllSectionsGeometry(sections, 0.001);
const objText = ({ objContent, mtlContent }) => `${objContent}\u0000MTL\u0000${mtlContent}`;
const json2 = (value) => JSON.stringify(value, null, 2);

/**
 * The glTF text with every NaN of the Float32 POSITION views (target 34962) rewritten to the canonical quiet NaN.
 * Garbage imports (B-L8) make positions NaN. ECMAScript leaves the bytes a NaN gets in a Float32Array
 * implementation-defined (SetValueInBuffer: "any implementation chosen ... NaN encoding"), and V8's sign bit depends
 * on which operand of a commutative add/multiply the interpreter or the JIT propagates, so two textually identical
 * expressions can store different NaN bytes. Only the fuzz comparison canonicalises; the golden files contain no NaN
 * and are compared raw.
 */
function gltfText(gltf) {
  const doc = JSON.parse(JSON.stringify(gltf));
  for (const buffer of doc.buffers) {
    const comma = buffer.uri.indexOf(',');
    const bytes = Buffer.from(buffer.uri.slice(comma + 1), 'base64');
    for (const view of doc.bufferViews) {
      if (view.target !== 34962) continue;
      for (let o = view.byteOffset; o + 4 <= view.byteOffset + view.byteLength; o += 4) {
        const bits = bytes.readUInt32LE(o);
        if ((bits & 0x7f800000) === 0x7f800000 && (bits & 0x007fffff) !== 0) bytes.writeUInt32LE(0x7fc00000, o);
      }
    }
    buffer.uri = `${buffer.uri.slice(0, comma + 1)}${bytes.toString('base64')}`;
  }
  return json2(doc);
}

/** Legacy and new OBJ / glTF / JSON outcomes of one project. */
function compareAll(project, label, tally) {
  const sections = project.wall.sections;
  const meshMode = project.meshMode;
  const r = (key, actual, expected, toText) => {
    const outcome = assertSameOutcome(actual, expected, `${label} ${key}`, toText);
    tally[outcome]++;
  };
  r('obj', run(() => LEGACY_OBJ.write({ sections, meshMode, layout: layoutProject(project) })),
    run(() => L.generateOBJContent(legacyGeometry(sections), 0.001, sections, meshMode, colorToRgb)), objText);
  r('gltf', run(() => LEGACY_GLTF.write({ sections, meshMode, layout: layoutProject(project) })),
    run(() => L.generateGLTFContent(legacyGeometry(sections), sections, meshMode, colorToRgb)), gltfText);
  r('json:file', run(() => serializer.write(project, { variant: 'file' })), run(() => L.exportJSONData(sections, meshMode)), json2);
  r('json:zip', run(() => serializer.write(project, { variant: 'zip' })), run(() => L.exportZIPJSONData(sections, meshMode)), json2);
}

// ---------------------------------------------------------------------------------------------------------------
// Inputs: hand-picked walls, the harness configurations and seeded fuzzed walls
// ---------------------------------------------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLS = [1, 2, 3, 4, 5, 6, 8, 2.5, 0.5, 1.5, 3.75, '10', '5', '3', '2.5', '1'];
const ROWS = [1, 2, 3, 4, 2.5, 0.5, 1.25, '5', '3', '2', '1.5'];
const RARE_COUNTS = [0, -0, -1, -2.5, NaN, '', '0', 'abc', null, true];
const SIZES = [500, 250, 600, 1000, 333.3, 337.5, 499.9, 50, 5000, 562.5, '500', '250', '337.5', 0];
const LEDS = [32, 64, 16, 8, 128, 96, 54, 7.5, 33, '32', '64', 0, ''];
const CURVES = [0, -0, 5, -5, 10, -10, 2.5, -7.25, 3.5, -1.5, 45, 90, 180, 4.75, -9.5, 19, '5', '-3', '0', '2.5', '', NaN, null];
const OFFSETS = [0, 90, -90, 180, -180, 45, 12.5, 9.5, -19, 89, '30', '-90', '4.75', '', null, undefined, NaN, 'abc'];
const NAMES = ['Wall 1', 'A B', 'A_B', 'Stage-Left', 'x/y:z*?', 'Ünïcödé wall', 'Curve C', 'L1', '   ', '', 0, 42];
const COLORS = ['#00f0ff', '#ff00aa', '#00ff66', '#FF6B35', '#ffdd00', '#AbCdEf', '#abc', 'red', '', '#12345', 0];
const MESH_MODES = ['combined', 'section', 'panel', 'Panel', 'bogus', undefined, null, '', 42, {}];

/** A fuzzed WallSection with raw (possibly imported) field values. */
function fuzzSection(rand, i, previousId) {
  const pick = (pool) => pool[Math.floor(rand() * pool.length)];
  const count = (pool) => (rand() < 0.05 ? pick(RARE_COUNTS) : pick(pool));
  const r = rand();
  const id = r < 0.08 ? NaN : r < 0.16 ? `id-${i}` : r < 0.22 ? String(i) : r < 0.32 && previousId !== undefined ? previousId : i;
  return new WallSection({
    id,
    name: pick(NAMES),
    panelCols: count(COLS),
    panelRows: count(ROWS),
    panelWidth: pick(SIZES),
    panelHeight: pick(SIZES),
    ledX: pick(LEDS),
    ledY: pick(LEDS),
    curveIntensity: pick(CURVES),
    angleOffset: pick(OFFSETS),
    color: pick(COLORS),
  });
}

/** `count` fuzzed projects (0-5 sections each). */
function fuzzProjects(seed, count) {
  const rand = rng(seed);
  const projects = [];
  for (let w = 0; w < count; w++) {
    const n = Math.floor(rand() * 6);
    const sections = [];
    for (let i = 0; i < n; i++) sections.push(fuzzSection(rand, i, sections.length ? sections[sections.length - 1].id : undefined));
    projects.push(projectOf(sections, MESH_MODES[Math.floor(rand() * MESH_MODES.length)]));
  }
  return projects;
}

/** The project the harness builds by importing CONFIGS[key] (JSON round trip, then the import mapping). */
function projectFromConfig(config) {
  const parsed = serializer.read(JSON.parse(JSON.stringify(config, null, 2)));
  const project = Project.createDefault();
  project.wall.replaceAll(parsed.sections);
  if (parsed.meshMode) project.meshMode = parsed.meshMode;
  return project;
}

const handPicked = () => [
  ['default wall', Project.createDefault()],
  ['empty wall', projectOf([], 'combined')],
  ['two defaults', projectOf([WallSection.createDefault(), WallSection.createDefault()], 'combined')],
  ...Object.entries(CONFIGS).map(([key, config]) => [`config ${key}`, projectFromConfig(config)]),
];

// ---------------------------------------------------------------------------------------------------------------
// 1. Oracle equality
// ---------------------------------------------------------------------------------------------------------------

describe('oracle equality (byte for byte)', () => {
  test('hand-picked walls and the harness configs, in every mesh mode (plus unknown modes)', (t) => {
    const tally = { equal: 0, threw: 0 };
    for (const [label, project] of handPicked()) {
      for (const mode of [...MODES, 'bogus', undefined]) {
        project.meshMode = mode;
        compareAll(project, `${label} [${String(mode)}]`, tally);
      }
    }
    t.diagnostic(`${tally.equal} identical outputs, ${tally.threw} identical exceptions`);
    assert.ok(tally.equal > 50);
    assert.ok(tally.threw > 0, 'expected the empty-wall combined exports and the large panel-mode glTF to throw');
  });

  test('empty wall: combined OBJ and glTF throw the legacy TypeError; section/panel do not', () => {
    for (const mode of MODES) {
      const project = projectOf([], mode);
      const sections = project.wall.sections;
      const obj = run(() => LEGACY_OBJ.write({ sections, meshMode: mode, layout: layoutProject(project) }));
      const gltf = run(() => LEGACY_GLTF.write({ sections, meshMode: mode, layout: layoutProject(project) }));
      if (mode === 'combined') {
        assert.ok(!obj.ok && obj.error instanceof TypeError, describeError(obj.error));
        assert.ok(!gltf.ok && gltf.error instanceof TypeError, describeError(gltf.error));
        assert.match(obj.error.message, /reading 'color'/);
      } else {
        assert.ok(obj.ok && gltf.ok);
      }
    }
  });

  test('large_wall panel-mode glTF throws RangeError in both with the Phase-1 encoder (B-H3); combined does not', () => {
    const project = projectFromConfig(CONFIGS.large_wall);
    const sections = project.wall.sections;
    for (const [mode, throws] of [['panel', true], ['combined', false]]) {
      project.meshMode = mode;
      const actual = run(() => LEGACY_GLTF.write({ sections, meshMode: mode, layout: layoutProject(project) }));
      const expected = run(() => L.generateGLTFContent(legacyGeometry(sections), sections, mode, colorToRgb));
      assert.equal(actual.ok, !throws, `${mode}: ${actual.ok ? 'returned' : describeError(actual.error)}`);
      assert.equal(expected.ok, !throws);
      if (throws) {
        assert.ok(actual.error instanceof RangeError);
        assert.equal(actual.error.message, 'Maximum call stack size exceeded');
      }
    }
  });

  test('>= 600 seeded fuzzed walls: OBJ, MTL, glTF and both JSON variants identical to legacy', (t) => {
    const tally = { equal: 0, threw: 0 };
    const projects = fuzzProjects(0x5eed, 600);
    projects.forEach((project, w) => compareAll(project, `fuzz #${w} [${String(project.meshMode)}]`, tally));
    // The same walls once more in each of the three real modes.
    projects.slice(0, 200).forEach((project, w) => {
      for (const mode of MODES) {
        project.meshMode = mode;
        compareAll(project, `fuzz #${w} [${mode}]`, tally);
      }
    });
    t.diagnostic(`${tally.equal} identical outputs, ${tally.threw} identical exceptions`);
    assert.ok(tally.equal > 3000);
    assert.ok(tally.threw > 0);
  });

  test('ProjectSerializer.read equals the legacy import mapping (fields, order, Object.is)', (t) => {
    const docs = [];
    // Round trips of exported documents (both variants) of fuzzed walls.
    for (const project of fuzzProjects(0xbeef, 150)) {
      for (const variant of ['file', 'zip']) {
        const r = run(() => JSON.parse(JSON.stringify(serializer.write(project, { variant }))));
        if (r.ok) docs.push(r.value);
      }
    }
    // Hand-made raw documents: missing / zero / string / null / nested-null fields, odd containers.
    const rand = rng(7);
    const RAW = [undefined, null, 0, '', '0', 3, 2.5, '12', -4, true, [], {}, 'abc', NaN];
    const pick = () => RAW[Math.floor(rand() * RAW.length)];
    for (let k = 0; k < 150; k++) {
      const n = Math.floor(rand() * 5);
      const sections = [];
      for (let i = 0; i < n; i++) {
        const s = {};
        if (rand() < 0.7) s.id = pick();
        if (rand() < 0.7) s.name = rand() < 0.5 ? `S${i}` : pick();
        if (rand() < 0.8) s.panel = rand() < 0.1 ? null : { columns: pick(), rows: pick(), width_mm: pick(), height_mm: pick() };
        if (rand() < 0.8) s.led_resolution = rand() < 0.1 ? 7 : { x: pick(), y: pick() };
        if (rand() < 0.8) s.curvature = { angle_degrees: pick(), angle_offset_degrees: pick() };
        if (rand() < 0.7) s.color = rand() < 0.5 ? '#123456' : pick();
        sections.push(rand() < 0.03 ? 5 : s);
      }
      docs.push({ version: rand() < 0.5 ? '1.0' : '9.9', sections, mesh_mode: MESH_MODES[k % MESH_MODES.length] });
    }
    docs.push(5, 'text', [], true, {}, { foo: 1 }, { sections: 'x' }, { sections: {} }, { sections: [] }, { sections: [null] },
      { sections: [{}], mesh_mode: 'panel' }, null);

    let compared = 0;
    for (const [k, data] of docs.entries()) {
      const actual = run(() => serializer.read(data));
      const expected = run(() => L.importJSONMapping(data, Palette.sectionColors));
      if (!expected.ok || !actual.ok) {
        assert.equal(actual.ok, expected.ok, `doc #${k}`);
        assert.equal(describeError(actual.error), describeError(expected.error), `doc #${k}`);
        continue;
      }
      if (expected.value === null) {
        assert.equal(actual.value, null, `doc #${k}`);
        continue;
      }
      assert.ok(Object.is(actual.value.meshMode, expected.value.meshMode), `doc #${k} meshMode`);
      assert.deepEqual(Object.keys(actual.value), ['sections', 'meshMode']);
      assert.equal(actual.value.sections.length, expected.value.wallSections.length, `doc #${k}`);
      actual.value.sections.forEach((s, i) => {
        const e = expected.value.wallSections[i];
        assert.ok(s instanceof WallSection);
        assert.deepEqual(Object.keys(s), Object.keys(e), `doc #${k} section ${i} key order`);
        for (const key of Object.keys(e)) {
          compared++;
          assert.ok(Object.is(s[key], e[key]), `doc #${k} section ${i}.${key}: ${String(s[key])} vs ${String(e[key])}`);
        }
      });
    }
    t.diagnostic(`${docs.length} documents, ${compared} fields compared with Object.is`);
    assert.ok(compared > 2000);
  });

  test('writeSafeDistance equals the legacy text over a duck-typed group', () => {
    const attr = (values, itemSize) => ({
      count: values.length / itemSize,
      getX: (i) => values[i * itemSize],
      getY: (i) => values[i * itemSize + 1],
      getZ: (i) => values[i * itemSize + 2],
    });
    const mesh = (positions, index) => ({ isMesh: true, geometry: { attributes: { position: attr(positions, 3) }, index: index && attr(index, 1) } });
    const children = [
      mesh([0, 0.005, 0, 1.25, 0.005, 0, 1.25, 0.005, 3.3333333, 0, 0.005, 3.3333333], [0, 1, 2, 0, 2, 3]),
      { isMesh: false, isLine: true, geometry: {} },
      mesh([0.1, 0.02, 4.5, -2.123456789, 0.02, 4.5], null),
      mesh([1, 2, 3, 4, 5, 6, 7, 8, 9], [0, 1, 2]),
      { isSprite: true },
    ];
    const group = { traverse(cb) { cb(this); children.forEach(cb); } };
    const actual = LEGACY_OBJ.writeSafeDistance(group);
    assert.equal(actual, L.safeDistanceObjText(group));
    assert.ok(actual.startsWith(Brand.safeDistanceObjHeader));
    assert.match(actual, /\nf 7 8 9\n$/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Chrome math emulation for the golden comparisons
// ---------------------------------------------------------------------------------------------------------------
//
// The baseline was captured in Chrome 154, whose Math.atan2 is correctly rounded, while Node 24's V8 still uses the
// fdlibm atan2, which computes atan(y / x) from a rounded quotient and differs in the last ulp for ~20% of
// arguments. The verbatim legacy oracle run in plain Node therefore misses exactly the three golden files that print
// atan2-derived values at full precision (panel-mode glTF min/max of curved walls: concave_offsets, convex, mixed).
// The golden comparisons thus run with correctly rounded Math.atan2, Math.sin and Math.cos (Chrome's sin/cos come from
// glibc and are correctly rounded in practice; the golden files cannot tell the two sin/cos apart). The functions
// below compute in 1200-bit BigInt fixed point and round to nearest-even; they are installed only inside the golden
// tests (withChromeMath) and the oracle comparisons above use Node's own Math on both sides.

const CR = (() => {
  const P = 1200n;
  const ONE = 1n << P;
  const atanInv = (n) => {          // atan(1/n) * 2^P (Taylor series)
    const N2 = BigInt(n) * BigInt(n);
    let term = ONE / BigInt(n);
    let sum = term;
    for (let k = 1n; term !== 0n; k++) {
      term /= N2;
      sum += (k % 2n === 1n ? -term : term) / (2n * k + 1n);
    }
    return sum;
  };
  const PI = 16n * atanInv(5) - 4n * atanInv(239);   // Machin
  const HALF_PI = PI / 2n;
  const view = new DataView(new ArrayBuffer(8));

  /** The exact fixed-point value of a finite double (every double is a multiple of 2^-1074, so this is exact). */
  const fixed = (x) => {
    view.setFloat64(0, x);
    const hi = view.getUint32(0);
    const exp = (hi >>> 20) & 0x7ff;
    let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(view.getUint32(4));
    if (exp !== 0) mant |= 1n << 52n;
    const v = mant << (BigInt(exp === 0 ? -1074 : exp - 1075) + P);
    return hi >>> 31 ? -v : v;
  };

  /** The nearest double (ties to even) of a fixed-point value (normal range only, which is all we need). */
  const double = (v) => {
    if (v === 0n) return 0;
    const a = v < 0n ? -v : v;
    const shift = BigInt(a.toString(2).length) - 53n;
    let q = a >> shift;
    const rem = a - (q << shift);
    const half = 1n << (shift - 1n);
    if (rem > half || (rem === half && (q & 1n) === 1n)) q += 1n;
    const r = Number(q) * 2 ** Number(shift - P);
    return v < 0n ? -r : r;
  };

  const isqrt = (n) => {
    let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
    for (;;) {
      const y = (x + n / x) >> 1n;
      if (y >= x) return x;
      x = y;
    }
  };

  /** [sin, cos] of a fixed-point argument reduced to |r| <= pi/4, with its quadrant. */
  const sinCos = (x) => {
    const X = fixed(x);
    let k = X / HALF_PI;
    let r = X - k * HALF_PI;
    if (r * 2n > HALF_PI) { k += 1n; r -= HALF_PI; }
    if (r * 2n < -HALF_PI) { k -= 1n; r += HALF_PI; }
    const r2 = (r * r) >> P;
    let term = r, s = r;
    for (let i = 1n; term !== 0n; i++) { term = -((term * r2) >> P) / ((2n * i) * (2n * i + 1n)); s += term; }
    term = ONE;
    let c = ONE;
    for (let i = 1n; term !== 0n; i++) { term = -((term * r2) >> P) / ((2n * i - 1n) * (2n * i)); c += term; }
    return { q: Number(((k % 4n) + 4n) % 4n), s, c };
  };

  /** atan of a fixed-point value: invert above 1, halve three times, then the Taylor series. */
  const atan = (t) => {
    let a = t < 0n ? -t : t;
    const invert = a > ONE;
    if (invert) a = (ONE * ONE) / a;
    for (let h = 0; h < 3; h++) a = (a * ONE) / (ONE + isqrt(ONE * ONE + a * a));
    const a2 = (a * a) >> P;
    let term = a, sum = a;
    for (let i = 1n; term !== 0n; i++) { term = -((term * a2) >> P); sum += term / (2n * i + 1n); }
    let r = sum * 8n;
    if (invert) r = HALF_PI - r;
    return t < 0n ? -r : r;
  };

  const memo = (fn) => {
    const cache = new Map();
    return (...args) => {
      const key = args.map((a) => (Object.is(a, -0) ? '-0' : String(a))).join(',');
      let v = cache.get(key);
      if (v === undefined) cache.set(key, (v = fn(...args)));
      return v;
    };
  };
  const native = { sin: Math.sin, cos: Math.cos, atan2: Math.atan2 };
  const sin = (x) => {
    if (!Number.isFinite(x) || x === 0) return native.sin(x);   // NaN, +-Infinity, +-0 are exact
    const { q, s, c } = sinCos(x);
    return double([s, c, -s, -c][q]);
  };
  const cos = (x) => {
    if (!Number.isFinite(x) || x === 0) return native.cos(x);
    const { q, s, c } = sinCos(x);
    return double([c, -s, -c, s][q]);
  };
  const atan2 = (y, x) => {
    if (!Number.isFinite(y) || !Number.isFinite(x) || y === 0 || x === 0) return native.atan2(y, x);   // exact cases
    let r = atan((fixed(y) * ONE) / fixed(x));
    if (x < 0) r = y > 0 ? r + PI : r - PI;
    return double(r);
  };
  // Memoised (String(x) is exact for doubles; -0 gets its own key).
  return { native, sin: memo(sin), cos: memo(cos), atan2: memo(atan2) };
})();

/** Runs body with the correctly rounded Math.sin / Math.cos / Math.atan2 installed (always restored). */
function withChromeMath(body) {
  Object.assign(Math, { sin: CR.sin, cos: CR.cos, atan2: CR.atan2 });
  try {
    return body();
  } finally {
    Object.assign(Math, CR.native);
  }
}

test('Chrome math emulation: correctly rounded, within 1 ulp of Node, exact cases native', (t) => {
  const ulp = (v) => { const a = Math.abs(v); return a === 0 ? Number.MIN_VALUE : 2 ** (Math.floor(Math.log2(a)) - 52); };
  const rand = rng(99);
  let differ = 0;
  for (let i = 0; i < 400; i++) {
    const x = (rand() - 0.5) * 8, y = rand() - 0.5;
    for (const [cr, nat] of [[CR.sin(x), Math.sin(x)], [CR.cos(x), Math.cos(x)], [CR.atan2(y, x), Math.atan2(y, x)]]) {
      assert.ok(Math.abs(cr - nat) <= ulp(nat), `${cr} vs ${nat}`);
      if (cr !== nat) differ++;
    }
  }
  // How often this Node's native libm differs from correctly rounded is a property of the Node version, not of the
  // code under test (a Node whose V8 matches Chrome makes the emulation moot, not wrong), so it is reported only.
  t.diagnostic(`${differ} of 1200 native sin/cos/atan2 results differ from correctly rounded on Node ${process.version}`);
  assert.equal(CR.atan2(1, 1), Math.PI / 4);
  assert.equal(CR.atan2(1, -1), (3 * Math.PI) / 4);
  assert.equal(CR.sin(Math.PI / 6), 0.49999999999999994);
  assert.equal(CR.cos(Math.PI), -1);
  assert.ok(Object.is(CR.sin(-0), -0) && Object.is(CR.atan2(-0, 1), -0) && CR.atan2(0, -1) === Math.PI);
  assert.ok(Number.isNaN(CR.sin(NaN)) && Number.isNaN(CR.atan2(NaN, 1)));
  // Known Chrome-vs-Node case (concave_offsets, first panel): atan2 of the 5-degree edge returns the angle itself.
  const a = (5 * Math.PI) / 180;
  const panelW = 500 * 0.001;
  assert.equal(-CR.atan2(panelW * CR.sin(a), panelW * CR.cos(a)), -a);
  t.diagnostic(`native rotY of that edge on Node ${process.version}: ${-Math.atan2(panelW * Math.sin(a), panelW * Math.cos(a))} ` +
    `(Node 24.x fdlibm: -0.08726646259971646; Chrome 154: ${-a})`);
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Golden files (GOLDEN_DIR)
// ---------------------------------------------------------------------------------------------------------------

/** Asserts that `text` encodes (UTF-8) to exactly the bytes of `file`. */
function assertSameBytes(text, file) {
  const expected = fs.readFileSync(file);
  const actual = Buffer.from(text, 'utf8');
  if (!actual.equals(expected)) {
    assert.fail(`${path.relative(REPO, file)} differs ${firstDifference(actual.toString('utf8'), expected.toString('utf8'))}`);
  }
}

const goldenAvailable = fs.existsSync(GOLDEN_DIR);
const goldenSkip = goldenAvailable ? false
  : `GOLDEN_DIR ${GOLDEN_DIR} does not exist: capture the baseline (tests/regression/run.mjs; tests/regression/README.md) or set GOLDEN_DIR`;

describe('golden files (byte-identical to the legacy downloads)', { skip: goldenSkip }, () => {
  const scenarios = ['default', ...Object.keys(CONFIGS)];

  for (const scenario of scenarios) {
    const dir = path.join(GOLDEN_DIR, scenario);
    const missing = fs.existsSync(dir) ? false : `scenario directory ${dir} is missing from GOLDEN_DIR`;

    test(`${scenario}: JSON, OBJ, MTL and glTF in all mesh modes, ZIP entries and round trips`, { skip: missing }, (t) => withChromeMath(() => {
      const file = (name) => path.join(dir, name);
      const project = scenario === 'default' ? Project.createDefault() : projectFromConfig(CONFIGS[scenario]);
      const sections = project.wall.sections;
      let files = 0;
      const same = (text, name) => {
        assertSameBytes(text, file(name));
        files++;
      };

      // Right after the import (initial mesh mode).
      same(json2(serializer.write(project, { variant: 'file' })), 'initial__export-json__led-wall-config.json');

      const consoleLog = JSON.parse(fs.readFileSync(file('console.json'), 'utf8'));
      for (const mode of MODES) {
        project.meshMode = mode;
        const { objContent, mtlContent } = OBJ.write({ sections, meshMode: mode, layout: layoutProject(project) });
        same(objContent, `${mode}__export-obj__led-wall-config.obj`);
        same(mtlContent, `${mode}__export-obj__led-wall-config.mtl`);

        const gltfName = `${mode}__export-gltf__led-wall-config.gltf`;
        const gltf = run(() => GLTF.write({ sections, meshMode: mode, layout: layoutProject(project) }));
        if (fs.existsSync(file(gltfName))) {
          assert.ok(gltf.ok, `${gltfName}: threw ${gltf.ok || describeError(gltf.error)}`);
          same(json2(gltf.value), gltfName);
        } else {
          // The baseline recorded no download but an uncaught RangeError for this step (B-H3).
          // Since 08 P2-1a every glTF export downloads (the chunked encoder), so the baseline holds every file.
          const logged = consoleLog.find((e) => e.step === `${mode}__export-gltf`) ?? null;
          assert.fail(`${gltfName} is missing from GOLDEN_DIR (console entry of the step: ${JSON.stringify(logged)})`);
        }
      }

      // Back in combined mode: Export JSON and the ZIP's JSON / OBJ / MTL / glTF entries.
      project.meshMode = 'combined';
      same(json2(serializer.write(project, { variant: 'file' })), 'final__export-json__led-wall-config.json');
      const entries = 'final__export-zip__led-wall-export.zip.entries';
      const layout = layoutProject(project);
      same(json2(serializer.write(project, { variant: 'zip' })), `${entries}/led-wall-config.json`);
      const zipObj = OBJ.write({ sections, meshMode: 'combined', layout });
      same(zipObj.objContent, `${entries}/led-wall-config.obj`);
      same(zipObj.mtlContent, `${entries}/led-wall-config.mtl`);
      same(json2(GLTF.write({ sections, meshMode: 'combined', layout })), `${entries}/led-wall-config.gltf`);
      // The ZIP's texture names (B-L14 naming) are the files the archive holds.
      const textureDir = file(`${entries}/textures`);
      const expectedNames = [...new Set(sections.map((s, i) => zipTextureFileName(s, i)))].sort();
      assert.deepEqual(fs.readdirSync(textureDir).sort(), expectedNames);

      // Round trip: re-import the golden Export JSON and export again.
      const reimport = (name) => {
        const parsed = serializer.read(JSON.parse(fs.readFileSync(file(name), 'utf8')));
        const p = Project.createDefault();
        p.wall.replaceAll(parsed.sections);
        if (parsed.meshMode) p.meshMode = parsed.meshMode;
        return p;
      };
      same(json2(serializer.write(reimport('final__export-json__led-wall-config.json'), { variant: 'file' })),
        'roundtrip__export-json__led-wall-config.json');
      if (fs.existsSync(file('zipjson_roundtrip__export-json__led-wall-config.json'))) {
        same(json2(serializer.write(reimport(`${entries}/led-wall-config.json`), { variant: 'file' })),
          'zipjson_roundtrip__export-json__led-wall-config.json');
      }
      t.diagnostic(`${scenario}: ${files} golden files byte-identical (correctly rounded Math, as Chrome)`);
    }));
  }
});

// ---------------------------------------------------------------------------------------------------------------
// 3. ProjectSerializer.read edge cases and write variants
// ---------------------------------------------------------------------------------------------------------------

describe('ProjectSerializer', () => {
  test('read(null) throws the TypeError the import alert shows; non-section documents give null', () => {
    assert.throws(() => serializer.read(null), (e) => e instanceof TypeError && e.message === "Cannot read properties of null (reading 'sections')");
    assert.throws(() => serializer.read(undefined), TypeError);
    assert.equal(serializer.read({ foo: 1 }), null);
    assert.equal(serializer.read({ sections: 'abc' }), null);
    assert.equal(serializer.read({ sections: {} }), null);
    assert.equal(serializer.read(42), null);
    assert.deepEqual(serializer.read({ sections: [] }), { sections: [], meshMode: undefined });
  });

  test('read keeps string fields raw, falls back to the index id, defaults with ||, and returns the raw mesh_mode', () => {
    const parsed = serializer.read({
      version: '7',
      sections: [
        { name: 'S', panel: { columns: '10', rows: '0', width_mm: '500' }, led_resolution: { x: '64', y: 0 }, curvature: { angle_degrees: '5' } },
        { id: 'abc', color: '#123456', curvature: { angle_degrees: 0, angle_offset_degrees: '15' } },
        { id: 0, name: '' },
      ],
      mesh_mode: 'weird',
    });
    assert.equal(parsed.meshMode, 'weird');
    const [a, b, c] = parsed.sections;
    assert.ok(a instanceof WallSection && b instanceof WallSection);
    assert.deepEqual({ ...a }, { id: 0, name: 'S', panelCols: '10', panelRows: '0', panelWidth: '500', panelHeight: 500,
      ledX: '64', ledY: 32, curveIntensity: '5', angleOffset: 0, color: Palette.sectionColors[0] });
    assert.deepEqual({ ...b }, { id: 'abc', name: 'Wall 2', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500,
      ledX: 32, ledY: 32, curveIntensity: 0, angleOffset: '15', color: '#123456' });
    assert.equal(c.id, 0);
    assert.equal(c.name, 'Wall 3');
    assert.equal(c.color, Palette.sectionColors[2]);
  });

  test('the palette colour fallback wraps with i % length', () => {
    const parsed = serializer.read({ sections: Array.from({ length: 10 }, () => ({})) });
    assert.deepEqual(parsed.sections.map((s) => s.color), Array.from({ length: 10 }, (_, i) => Palette.sectionColors[i % 8]));
  });

  test('write: legacy key order; zip drops angle_offset_degrees and adds texture_file; numeric names throw in zip', () => {
    const project = projectOf([new WallSection({ id: 4, name: 'A B', panelCols: 2, panelRows: 3, panelWidth: 500, panelHeight: 250,
      ledX: 64, ledY: 32, curveIntensity: -3, angleOffset: 15, color: '#ff00aa' })], 'section');
    const file = serializer.write(project);
    assert.deepEqual(Object.keys(file), ['version', 'sections', 'mesh_mode', 'totals']);
    assert.deepEqual(Object.keys(file.sections[0]), ['name', 'id', 'panel', 'led_resolution', 'curvature', 'color']);
    assert.deepEqual(file.sections[0].curvature, { type: 'convex', angle_degrees: -3, angle_offset_degrees: 15 });
    assert.deepEqual(file.totals, { sections: 1, total_panels: 6, total_pixels: 12288 });
    const zip = serializer.write(project, { variant: 'zip' });
    assert.deepEqual(Object.keys(zip.sections[0]), ['name', 'id', 'panel', 'led_resolution', 'curvature', 'color', 'texture_file']);
    assert.deepEqual(zip.sections[0].curvature, { type: 'convex', angle_degrees: -3 });
    assert.equal(zip.sections[0].texture_file, 'textures/A_B_PanelIDs.png');
    project.wall.sections[0].name = 42;
    assert.throws(() => serializer.write(project, { variant: 'zip' }), { name: 'TypeError', message: 'name.replace is not a function' });
    assert.doesNotThrow(() => serializer.write(project, { variant: 'file' }));
    assert.throws(() => serializer.write(project, { variant: 'csv' }), RangeError);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Strategy reads through the injected profile
// ---------------------------------------------------------------------------------------------------------------

describe('strategy reads (foreign profile values throw unsupportedStrategy)', () => {
  const project = Project.createDefault();
  const args = (mode) => ({ sections: project.wall.sections, meshMode: mode, layout: layoutProject(project) });
  const expectError = (key, value) => (e) => e instanceof Error && e.message === unsupportedStrategy(key, value).message;

  test('ObjExporter: winding (the header line) in every mode; stripNormals in combined and section mode only; combinedUV in combined mode only', () => {
    const winding = makeObj({ ...LegacyProfiles.mesh.obj, winding: 'cw' });
    for (const mode of MODES) assert.throws(() => winding.write(args(mode)), expectError('mesh.obj.winding', 'cw'), mode);

    const strip = makeObj({ ...LegacyProfiles.mesh.obj, stripNormals: 'smooth' });
    assert.throws(() => strip.write(args('combined')), expectError('mesh.obj.stripNormals', 'smooth'));
    assert.throws(() => strip.write(args('section')), expectError('mesh.obj.stripNormals', 'smooth'));
    assert.doesNotThrow(() => strip.write(args('panel')));

    const uv = makeObj({ ...LegacyProfiles.mesh.obj, combinedUV: 'atlas' });
    assert.throws(() => uv.write(args('combined')), expectError('mesh.obj.combinedUV', 'atlas'));
    assert.doesNotThrow(() => uv.write(args('section')));
    assert.doesNotThrow(() => uv.write(args('panel')));
  });

  test('GltfExporter: attributes, indexType and doubleSided in every mode', () => {
    for (const [key, value] of [['attributes', ['POSITION', 'TEXCOORD_0']], ['attributes', ['NORMAL']], ['attributes', ['NORMAL', 'POSITION']],
      ['attributes', ['POSITION', 'POSITION']], ['attributes', []], ['indexType', 'uint32'], ['doubleSided', 'yes']]) {
      const exporter = makeGltf({ ...LegacyProfiles.mesh.gltf, [key]: value });
      for (const mode of MODES) assert.throws(() => exporter.write(args(mode)), expectError(`mesh.gltf.${key}`, value), `${key} ${mode}`);
    }
  });

  test('the Phase-1 profiles do not throw; the default glTF encoder is chunkedBase64 (08 P2-1a) and an injected one is used', () => {
    for (const mode of MODES) {
      assert.doesNotThrow(() => LEGACY_OBJ.write(args(mode)));
      assert.doesNotThrow(() => LEGACY_GLTF.write(args(mode)));
    }
    const large = projectFromConfig(CONFIGS.large_wall);
    const largeArgs = { sections: large.wall.sections, meshMode: 'panel', layout: layoutProject(large) };
    assert.throws(() => LEGACY_GLTF.write(largeArgs), RangeError);
    // The default encoder (no encodeBase64 given) encodes the large buffer, exactly as Node's base64 does.
    const byDefault = makeGltf(LegacyProfiles.mesh.gltf).write(largeArgs);
    const byNode = makeGltf(LegacyProfiles.mesh.gltf, nodeBase64).write(largeArgs);
    assert.ok(byDefault.buffers[0].uri.startsWith('data:application/octet-stream;base64,'));
    assert.ok(byDefault.buffers[0].byteLength > 125000, `${byDefault.buffers[0].byteLength} bytes: above the spread limit`);
    assert.equal(json2(byDefault), json2(byNode));
    // Same text as the legacy encoder wherever the legacy encoder works.
    for (const mode of MODES) {
      assert.equal(json2(makeGltf(LegacyProfiles.mesh.gltf).write(args(mode))), json2(LEGACY_GLTF.write(args(mode))), mode);
    }
    assert.equal(legacySpreadBase64(new Uint8Array([1, 2, 3])), 'AQID');
  });
});

describe('chunkedBase64 (B-H3, 08 6.1)', () => {
  test('equals the Phase-1 spread encoder and Node base64 on random buffers of 0 ... 100,000 bytes', () => {
    const rand = rng(0xb64);
    const lengths = [0, 1, 2, 3, 4, 5, 32766, 32767, 32768, 32769, 65535, 65536, 65537, 98303, 98304, 100000];
    for (let k = 0; k < 24; k++) lengths.push(Math.floor(rand() * 100001));
    for (const n of lengths) {
      const bytes = Uint8Array.from({ length: n }, () => Math.floor(rand() * 256));
      const text = chunkedBase64(bytes);
      assert.equal(text, legacySpreadBase64(bytes), `${n} bytes vs the spread encoder`);
      assert.equal(text, nodeBase64(bytes), `${n} bytes vs Node`);
    }
  });

  test('does not throw at 10 MB, and pads only at the end', () => {
    const bytes = new Uint8Array(10 * 1024 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 131 + 7) & 255;
    const text = chunkedBase64(bytes);
    assert.equal(text, nodeBase64(bytes));
    assert.equal(text.indexOf('='), text.length - 2, 'one trailing "==" (10 MiB is 1 mod 3), none mid-stream');
    assert.throws(() => legacySpreadBase64(new Uint8Array(200000)), RangeError, 'the Phase-1 encoder overflows');
  });

  test('large_wall panel-mode glTF: the production exporter returns the document the legacy one could not', () => {
    const project = projectFromConfig(CONFIGS.large_wall);
    project.meshMode = 'panel';
    const writeArgs = { sections: project.wall.sections, meshMode: 'panel', layout: layoutProject(project) };
    const gltf = GLTF.write(writeArgs);
    assert.equal(json2(gltf), json2(makeGltf(Strategies.mesh.gltf, nodeBase64).write(writeArgs)));
    assert.equal(Buffer.from(gltf.buffers[0].uri.split(',')[1], 'base64').length, gltf.buffers[0].byteLength);
  });
});

describe("ProjectSerializer and ObjExporter: textures the ZIP left out (B-L4, 08 P2-1c)", () => {
  const project = projectOf([
    new WallSection({ id: 1, name: 'A', panelCols: 2, panelRows: 1, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32,
      curveIntensity: 0, angleOffset: 0, color: '#ff00aa' }),
    new WallSection({ id: 2, name: 'B', panelCols: 2, panelRows: 1, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32,
      curveIntensity: 5, angleOffset: 0, color: '#00ff66' }),
  ], 'section');
  const args = (meshMode, skipped) => ({ sections: project.wall.sections, meshMode, layout: layoutProject(project), skipped });

  test("'zip' JSON: texture_file null where skipped; the names are still computed (a numeric name still throws)", () => {
    const plain = serializer.write(project, { variant: 'zip' });
    const doc = serializer.write(project, { variant: 'zip', skipped: [false, true] });
    assert.deepEqual(doc.sections.map((s) => s.texture_file), ['textures/A_PanelIDs.png', null]);
    assert.equal(json2({ ...doc, sections: doc.sections.map((s) => ({ ...s, texture_file: 'x' })) }),
      json2({ ...plain, sections: plain.sections.map((s) => ({ ...s, texture_file: 'x' })) }), 'nothing else changes');
    assert.equal(json2(serializer.write(project, { variant: 'zip', skipped: [false, false] })), json2(plain));
    assert.equal(json2(serializer.write(project, { variant: 'file', skipped: [true, true] })), json2(serializer.write(project)));
    const named = projectOf([new WallSection({ ...project.wall.sections[0], name: 7 })], 'section');
    assert.throws(() => serializer.write(named, { variant: 'zip', skipped: [true] }), { message: 'name.replace is not a function' });
  });

  test('section-mode MTL: no map_Kd for a skipped section, the rest byte-identical; other modes ignore skipped', () => {
    const plain = OBJ.write(args('section', null));
    const out = OBJ.write(args('section', [false, true]));
    assert.equal(out.objContent, plain.objContent);
    assert.equal(out.mtlContent, plain.mtlContent.replace('d 1.0\nmap_Kd textures/Wall_2_PanelIDs.png\n\n', 'd 1.0\n\n'));
    assert.ok(out.mtlContent.endsWith('d 1.0\n\n'));
    for (const mode of ['combined', 'panel']) {
      const a = OBJ.write(args(mode, [true, true]));
      const b = OBJ.write(args(mode, null));
      assert.equal(objText(a), objText(b), mode);
    }
  });
});

describe("glTF index width: mesh.gltf.indexType 'auto' (B-L5, 08 6.2)", () => {
  /** A project with one flat section of cols x rows panels in meshMode. */
  const bigProject = (cols, rows, meshMode) => projectOf([new WallSection({ id: 0, name: 'Big', panelCols: cols, panelRows: rows,
    panelWidth: 500, panelHeight: 500, ledX: 8, ledY: 8, curveIntensity: 0, angleOffset: 0, color: '#00f0ff' })], meshMode);
  const writeArgs = (project) => ({ sections: project.wall.sections, meshMode: project.meshMode, layout: layoutProject(project) });
  /** The decoded index array of mesh m (primitive 0) and its component type. */
  const indicesOf = (doc, m = 0) => {
    const accessor = doc.accessors[doc.meshes[m].primitives[0].indices];
    const view = doc.bufferViews[accessor.bufferView];
    const bytes = Buffer.from(doc.buffers[0].uri.split(',')[1], 'base64');
    const Ctor = accessor.componentType === 5125 ? Uint32Array : Uint16Array;
    const copy = bytes.buffer.slice(bytes.byteOffset + view.byteOffset, bytes.byteOffset + view.byteOffset + accessor.count * Ctor.BYTES_PER_ELEMENT);
    return { componentType: accessor.componentType, indices: Array.from(new Ctor(copy)) };
  };
  const builderIndices = (project) => new WallMeshBuilder(Strategies.mesh.gltf).sectionGrid(layoutProject(project).sections[0]).indices;

  test("the production profile is 'auto'; LegacyProfiles keeps 'uint16'", () => {
    assert.equal(Strategies.mesh.gltf.indexType, 'auto');
    assert.equal(LegacyProfiles.mesh.gltf.indexType, 'uint16');
  });

  test("65,535 vertices (largest index 65,534): componentType 5123, byte-identical to indexType 'uint16'", () => {
    for (const mode of ['combined', 'section']) {
      const project = bigProject(254, 256, mode);
      const doc = GLTF.write(writeArgs(project));
      const { componentType, indices } = indicesOf(doc);
      assert.equal(componentType, 5123, mode);
      assert.equal(maxIndexOf(indices), 65534);
      assert.deepEqual(indices, builderIndices(project));
      assert.equal(json2(doc), json2(makeGltf({ ...Strategies.mesh.gltf, indexType: 'uint16' }).write(writeArgs(project))), `${mode}: same text as 'uint16'`);
    }
  });

  test('65,536 vertices (largest index 65,535): componentType 5125, indices round-trip exactly', () => {
    for (const mode of ['combined', 'section']) {
      const project = bigProject(255, 255, mode);
      const doc = GLTF.write(writeArgs(project));
      const { componentType, indices } = indicesOf(doc);
      assert.equal(componentType, 5125, mode);
      assert.equal(maxIndexOf(indices), 65535);
      assert.deepEqual(indices, builderIndices(project));
      assert.deepEqual(checkGltfDocument(doc), [], 'no 65,535 restart value in a 5123 accessor any more');
      // The Phase-1 profile wraps nothing here but writes the restart value 65,535 into a 5123 accessor.
      const legacy = makeGltf(LegacyProfiles.mesh.gltf).write(writeArgs(project));
      assert.equal(indicesOf(legacy).componentType, 5123);
      assert.ok(checkGltfDocument(legacy).some((e) => /65535|restart/.test(e)), checkGltfDocument(legacy).join('; '));
    }
  });

  test('a synthetic 70,000-vertex combined export: 5125 indices, passes tools/check-gltf (written to tests/unit/out/)', () => {
    const project = bigProject(279, 249, 'combined');   // 280 x 250 = 70,000 vertices
    const doc = GLTF.write(writeArgs(project));
    assert.equal(doc.accessors[0].count, 70000);
    const { componentType, indices } = indicesOf(doc);
    assert.equal(componentType, 5125);
    assert.equal(maxIndexOf(indices), 69999);
    assert.deepEqual(indices, builderIndices(project));
    assert.deepEqual(checkGltfDocument(doc), []);
    // For the manual Khronos glTF-Validator check of 08 8.6 (tests/unit/out/ is git-ignored).
    const outDir = path.join(HERE, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'p2-1b-70000-vertices.gltf'), json2(doc));
  });

  test("every harness config, in every mode, writes the same glTF text as the profile with indexType 'uint16'", () => {
    for (const [label, project] of handPicked()) {
      for (const mode of MODES) {
        if (label === 'empty wall' && mode === 'combined') continue;   // the legacy TypeError, in both
        project.meshMode = mode;
        assert.equal(json2(GLTF.write(writeArgs(project))), json2(makeGltf({ ...Strategies.mesh.gltf, indexType: 'uint16' }).write(writeArgs(project))),
          `${label} [${mode}]`);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 5. ProjectIO, Downloader and ExportPanel sequences (fakes)
// ---------------------------------------------------------------------------------------------------------------

/** Temporarily replaces globals (URL methods, Blob, FileReader) for one test body. */
async function withGlobals(overrides, body) {
  const saved = [];
  for (const [target, key, value] of overrides) {
    saved.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
    Object.defineProperty(target, key, { value, configurable: true, writable: true });
  }
  try {
    return await body();
  } finally {
    for (const [target, key, descriptor] of saved.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor); else delete target[key];
    }
  }
}

/** A ProjectIO over fakes that record every call into `log`. */
function fakeIO(project, log, extra = {}) {
  const downloader = {
    saveText: (content, filename, mimeType) => log.push(['saveText', filename, mimeType, content]),
    saveBlob: (blob, filename) => {
      // Like the real Downloader: URL.createObjectURL(null) throws (Chrome's message).
      if (blob === null) throw new TypeError("Failed to execute 'createObjectURL' on 'URL': Overload resolution failed.");
      log.push(['saveBlob', filename, blob]);
    },
  };
  const wallController = {
    layout: () => { log.push(['layout']); return layoutProject(project); },
    applyImport: (parsed) => log.push(['applyImport', parsed]),
  };
  const panelIds = {
    atlasSize: () => extra.atlasSize ?? { width: 640, height: 384 },
    sectionSize: (section) => (extra.sectionSize ? extra.sectionSize(section) : { width: 640, height: 384 }),
    atlasCanvas: (sections) => {
      log.push(['atlasCanvas', sections]);
      return { toBlob: (cb, type) => { log.push(['toBlob', type]); extra.toBlobCallback = cb; } };
    },
    sectionCanvas: (section, i, scale, startCol) => {
      log.push(['sectionCanvas', i, scale, startCol]);
      return { toDataURL: (type) => (log.push(['toDataURL', type]), (extra.dataUrlFor && extra.dataUrlFor(i)) ?? 'data:image/png;base64,QUJD') };
    },
  };
  class FakeZip {
    constructor() { log.push(['new JSZip']); }
    file(name, data, options) { log.push(['zip.file', name, options, data]); return this; }
    folder(name) {
      log.push(['zip.folder', name]);
      return { file: (n, data, options) => log.push(['folder.file', `${name}/${n}`, options, data]) };
    }
    async generateAsync(options) { log.push(['generateAsync', options]); return 'ZIP-BLOB'; }
  }
  const win = {
    setTimeout: (fn, ms) => { log.push(['setTimeout', ms]); extra.timer = fn; return 1; },
    console: { warn: (err) => log.push(['warn', err]) },
  };
  const dialogs = { alert: (msg) => log.push(['alert', msg]) };
  const safeDistance = { object3D: extra.group ?? null };
  return new ProjectIO({ project, wallController, serializer: extra.serializer ?? serializer, objExporter: OBJ,
    gltfExporter: GLTF, panelIds, safeDistance, downloader, JSZip: FakeZip, dialogs, brand: Brand, win });
}

/** The M-EXP-1 text of 08 3.3. */
const mExp1 = (label, message) => `${label} failed: ${message}. No file was downloaded.`;
/** The M-EXP-2, M-EXP-3 and M-EXP-4 texts of 08 3.3 (CANVAS_HARD_LIMITS: 32,767 px, 268 MP). */
const mExp2 = (w, h) => `The Panel ID image would be ${w}×${h} px, larger than this browser can create (32767 px per side, 268 MP). ` +
  'Reduce Pixels X/Y or the number of columns, or use Export All (ZIP), which writes one image per section.';
const mExp3 = (w, h) => `This browser could not create the ${w}×${h} px Panel ID image. Reduce Pixels X/Y or the number of columns.`;
const mExp4 = (names) => `The ZIP was created, but ${names.length} texture(s) were too large for this browser and were left out: ${names.join(', ')}.`;

describe('ProjectIO use cases', () => {
  test('exportJSON downloads the pretty-printed file document', () => {
    const project = Project.createDefault();
    const log = [];
    fakeIO(project, log).exportJSON();
    assert.deepEqual(log, [['saveText', 'led-wall-config.json', 'application/json', json2(serializer.write(project))]]);
  });

  test('exportOBJ: layout, OBJ now, MTL through win.setTimeout(Strategies.mtlDownloadDelayMs)', () => {
    const project = Project.createDefault();
    const log = [];
    const extra = {};
    fakeIO(project, log, extra).exportOBJ();
    const { objContent, mtlContent } = OBJ.write({ sections: project.wall.sections, meshMode: 'combined', layout: layoutProject(project) });
    assert.deepEqual(log, [['layout'], ['saveText', 'led-wall-config.obj', 'text/plain', objContent], ['setTimeout', 100]]);
    assert.equal(Strategies.mtlDownloadDelayMs, 100);
    extra.timer();
    assert.deepEqual(log.at(-1), ['saveText', 'led-wall-config.mtl', 'text/plain', mtlContent]);
  });

  test('exportGLTF downloads the pretty-printed document; a large panel wall downloads too (B-H3 fixed in 08 P2-1a)', () => {
    const project = Project.createDefault();
    const log = [];
    assert.equal(fakeIO(project, log).exportGLTF(), undefined);
    assert.deepEqual(log.map((e) => e[0]), ['layout', 'saveText']);
    assert.equal(log[1][1], 'led-wall-config.gltf');
    assert.equal(log[1][3], json2(GLTF.write({ sections: project.wall.sections, meshMode: 'combined', layout: layoutProject(project) })));

    const large = projectFromConfig(CONFIGS.large_wall);
    large.meshMode = 'panel';
    const log2 = [];
    fakeIO(large, log2).exportGLTF();
    assert.deepEqual(log2.map((e) => e[0]), ['layout', 'saveText']);
    assert.equal(log2[1][3], json2(GLTF.write({ sections: large.wall.sections, meshMode: 'panel', layout: layoutProject(large) })));
  });

  test('exportPanelIds is async, awaits toBlob and downloads the blob as panel-ids.png', async () => {
    const project = Project.createDefault();
    const log = [];
    const extra = {};
    const io = fakeIO(project, log, extra);
    assert.equal(ProjectIO.prototype.exportPanelIds.constructor.name, 'AsyncFunction');
    const promise = io.exportPanelIds();
    assert.ok(promise instanceof Promise);
    assert.deepEqual(log, [['atlasCanvas', project.wall.sections], ['toBlob', 'image/png']]);
    extra.toBlobCallback('PNG-BLOB');
    assert.equal(await promise, undefined);
    assert.deepEqual(log.at(-1), ['saveBlob', 'panel-ids.png', 'PNG-BLOB']);
  });

  test('exportPanelIds: an atlas beyond CANVAS_HARD_LIMITS alerts M-EXP-2 and creates no canvas (B-L4, 08 P2-1c)', async () => {
    for (const [width, height] of [[70000, 128], [32768, 10], [16384, 16385]]) {
      const log = [];
      await fakeIO(Project.createDefault(), log, { atlasSize: { width, height } }).exportPanelIds();
      assert.deepEqual(log, [['alert', mExp2(width, height)]], `${width}x${height}`);
    }
    const log = [];
    const extra = { atlasSize: { width: 32767, height: 8192 } };
    const promise = fakeIO(Project.createDefault(), log, extra).exportPanelIds();
    extra.toBlobCallback('PNG-BLOB');
    await promise;
    assert.deepEqual(log.map((e) => e[0]), ['atlasCanvas', 'toBlob', 'saveBlob'], 'the largest atlas that fits is exported');
  });

  test('exportPanelIds: a null toBlob result (a device limit) alerts M-EXP-3, downloads nothing, throws nothing', async () => {
    const log = [];
    const extra = {};
    const promise = fakeIO(Project.createDefault(), log, extra).exportPanelIds();
    extra.toBlobCallback(null);
    await promise;
    assert.deepEqual(log.slice(2), [['alert', mExp3(640, 384)]]);
  });

  test('exportPanelIds: the real atlas size of the p2_oversize_canvas wall is refused (PanelIdRenderer.atlasSize)', async () => {
    const project = projectOf([new WallSection({ id: 0, name: 'Oversize', panelCols: 70, panelRows: 2, panelWidth: 500,
      panelHeight: 500, ledX: 1000, ledY: 64, curveIntensity: 0, angleOffset: 0, color: '#00f0ff' })], 'section');
    const renderer = new PanelIdRenderer({ doc: null, style: project.panelIdStyle, logos: project.logos, theme: { canvas: {} } });
    const log = [];
    await fakeIO(project, log, { atlasSize: renderer.atlasSize(project.wall.sections) }).exportPanelIds();
    assert.deepEqual(log, [['alert', mExp2(70000, 128)]]);
  });

  test('exportZIP: legacy order (JSON zip variant, layout, OBJ, MTL, glTF, textures, generateAsync, download)', async () => {
    const project = projectFromConfig(CONFIGS.box_corner);
    const sections = project.wall.sections;
    const log = [];
    assert.equal(ProjectIO.prototype.exportZIP.constructor.name, 'AsyncFunction');
    await fakeIO(project, log).exportZIP();
    const layout = layoutProject(project);
    const { objContent, mtlContent } = OBJ.write({ sections, meshMode: 'combined', layout });
    const atlas = computeAtlas(sections);
    const expected = [
      ['new JSZip'],
      ['zip.file', 'led-wall-config.json', undefined, json2(serializer.write(project, { variant: 'zip' }))],
      ['layout'],
      ['zip.file', 'led-wall-config.obj', undefined, objContent],
      ['zip.file', 'led-wall-config.mtl', undefined, mtlContent],
      ['zip.file', 'led-wall-config.gltf', undefined, json2(GLTF.write({ sections, meshMode: 'combined', layout }))],
      ['zip.folder', 'textures'],
      ...sections.flatMap((s, i) => [
        ['sectionCanvas', i, null, atlas.entries[i].startCol],
        ['toDataURL', 'image/png'],
        ['folder.file', `textures/${zipTextureFileName(s, i)}`, { base64: true }, 'QUJD'],
      ]),
      ['generateAsync', { type: 'blob' }],
      ['saveBlob', 'led-wall-export.zip', 'ZIP-BLOB'],
    ];
    assert.deepEqual(log, expected);
    assert.deepEqual(sections.map((s, i) => atlas.entries[i].startCol), [0, 6, 10, 16]);
  });

  test('exportZIP: a large panel wall downloads; numeric names give M-EXP-1 (no rejection)', async () => {
    const large = projectFromConfig(CONFIGS.large_wall);
    large.meshMode = 'panel';
    const log = [];
    await fakeIO(large, log).exportZIP();
    assert.deepEqual(log.at(-1), ['saveBlob', 'led-wall-export.zip', 'ZIP-BLOB']);
    assert.ok(!log.some((e) => e[0] === 'alert'));

    const named = Project.createDefault();
    named.wall.sections[0].name = 7;
    const log2 = [];
    assert.equal(await fakeIO(named, log2).exportZIP(), undefined);
    assert.deepEqual(log2.map((e) => e[0]), ['new JSZip', 'alert', 'warn']);
    assert.equal(log2[1][1], mExp1('Export All (ZIP)', 'name.replace is not a function'));
    assert.ok(log2[2][1] instanceof TypeError);
  });

  test('exportZIP pre-check: an oversize section is skipped up front (JSON null, no map_Kd, no canvas) and named by M-EXP-4', async () => {
    const project = projectFromConfig(CONFIGS.flat3);
    project.meshMode = 'section';
    const sections = project.wall.sections;
    const tooBig = sections[1];
    const log = [];
    await fakeIO(project, log, { sectionSize: (s) => (s === tooBig ? { width: 70000, height: 128 } : { width: 640, height: 384 }) }).exportZIP();
    const skipped = sections.map((s) => s === tooBig);
    const layout = layoutProject(project);
    const json = json2(serializer.write(project, { variant: 'zip', skipped }));
    assert.equal(JSON.parse(json).sections[1].texture_file, null);
    assert.equal(JSON.parse(json).sections[0].texture_file, 'textures/Left_PanelIDs.png');
    const { objContent, mtlContent } = OBJ.write({ sections, meshMode: 'section', layout, skipped });
    assert.ok(!mtlContent.includes('map_Kd textures/Wall_2_PanelIDs.png'));
    assert.ok(mtlContent.includes('map_Kd textures/Wall_1_PanelIDs.png') && mtlContent.includes('map_Kd textures/Wall_3_PanelIDs.png'));
    const atlas = computeAtlas(sections);
    assert.deepEqual(log, [
      ['new JSZip'],
      ['zip.file', 'led-wall-config.json', undefined, json],
      ['layout'],
      ['zip.file', 'led-wall-config.obj', undefined, objContent],
      ['zip.file', 'led-wall-config.mtl', undefined, mtlContent],
      ['zip.file', 'led-wall-config.gltf', undefined, json2(GLTF.write({ sections, meshMode: 'section', layout }))],
      ['zip.folder', 'textures'],
      ...[0, 2].flatMap((i) => [
        ['sectionCanvas', i, null, atlas.entries[i].startCol],
        ['toDataURL', 'image/png'],
        ['folder.file', `textures/${zipTextureFileName(sections[i], i)}`, { base64: true }, 'QUJD'],
      ]),
      ['generateAsync', { type: 'blob' }],
      ['saveBlob', 'led-wall-export.zip', 'ZIP-BLOB'],
      ['alert', mExp4(['textures/Center_PanelIDs.png'])],
    ]);
  });

  test('exportZIP late skip: a data:, PNG is left out, the JSON and MTL entries are re-written, M-EXP-4 names it', async () => {
    const project = projectFromConfig(CONFIGS.flat3);
    project.meshMode = 'section';
    const sections = project.wall.sections;
    const log = [];
    await fakeIO(project, log, { dataUrlFor: (i) => (i === 2 ? 'data:,' : undefined) }).exportZIP();
    const skipped = [false, false, true];
    const layout = layoutProject(project);
    const files = log.filter((e) => e[0] === 'zip.file' || e[0] === 'folder.file').map((e) => e[1]);
    assert.deepEqual(files, ['led-wall-config.json', 'led-wall-config.obj', 'led-wall-config.mtl', 'led-wall-config.gltf',
      'textures/Left_PanelIDs.png', 'textures/Center_PanelIDs.png', 'led-wall-config.json', 'led-wall-config.mtl']);
    const rewrites = log.filter((e) => e[0] === 'zip.file').slice(-2);
    assert.equal(rewrites[0][3], json2(serializer.write(project, { variant: 'zip', skipped })));
    assert.equal(rewrites[1][3], OBJ.write({ sections, meshMode: 'section', layout, skipped }).mtlContent);
    assert.deepEqual(log.slice(-2), [['saveBlob', 'led-wall-export.zip', 'ZIP-BLOB'], ['alert', mExp4(['textures/Right_PanelIDs.png'])]]);
    // No left-out texture: no alert at all.
    const log2 = [];
    await fakeIO(project, log2).exportZIP();
    assert.ok(!log2.some((e) => e[0] === 'alert'));
  });

  test('exportSafeDistanceOBJ: alert without a group; with one, the OBJ Blob is downloaded (B-M1 fixed in 08 P2-5a)', async () => {
    const log = [];
    fakeIO(Project.createDefault(), log).exportSafeDistanceOBJ();
    assert.deepEqual(log, [['alert', 'Enable Safe Distance 3D visualization first']]);

    const group = { traverse: (cb) => cb({ isMesh: true, geometry: { attributes: { position: { count: 1, getX: () => 1, getY: () => 2, getZ: () => 3 } }, index: null } }) };
    const blobs = [];
    class FakeBlob { constructor(parts, options) { this.parts = parts; this.options = options; blobs.push(this); } }
    const log2 = [];
    await withGlobals([[globalThis, 'Blob', FakeBlob]], () => {
      assert.equal(fakeIO(Project.createDefault(), log2, { group }).exportSafeDistanceOBJ(), undefined);
    });
    assert.equal(blobs.length, 1);
    assert.deepEqual([blobs[0].parts, blobs[0].options], [[OBJ.writeSafeDistance(group)], { type: 'text/plain' }]);
    assert.deepEqual(log2, [['saveBlob', 'safe-distance-floor.obj', blobs[0]]], 'one download, no alert');
  });

  test('#runExport: every export reports a failure as M-EXP-1 with its label, then warns; nothing escapes', async () => {
    const empty = projectOf([], 'combined');
    const cannotReadColor = "Cannot read properties of undefined (reading 'color')";
    for (const [method, label] of [['exportOBJ', 'Export OBJ'], ['exportGLTF', 'Export glTF']]) {
      const log = [];
      assert.equal(fakeIO(empty, log)[method](), undefined, method);
      assert.deepEqual(log.map((e) => e[0]), ['layout', 'alert', 'warn'], method);
      assert.equal(log[1][1], mExp1(label, cannotReadColor));
      assert.ok(log[2][1] instanceof TypeError);
    }

    const boom = new RangeError('boom');
    const throwing = { write: () => { throw boom; } };
    const log = [];
    fakeIO(Project.createDefault(), log, { serializer: throwing }).exportJSON();
    assert.deepEqual(log, [['alert', mExp1('Export JSON', 'boom')], ['warn', boom]]);

    const log2 = [];
    await fakeIO(Project.createDefault(), log2, { serializer: throwing }).exportZIP();
    assert.deepEqual(log2, [['new JSZip'], ['alert', mExp1('Export All (ZIP)', 'boom')], ['warn', boom]]);

    const log3 = [];
    const group = { traverse: () => { throw boom; } };
    fakeIO(Project.createDefault(), log3, { group }).exportSafeDistanceOBJ();
    assert.deepEqual(log3, [['alert', mExp1('Export Safe Distance OBJ', 'boom')], ['warn', boom]]);

    // A thrown non-Error is reported through String().
    const log4 = [];
    fakeIO(Project.createDefault(), log4, { serializer: { write: () => { throw 'plain'; } } }).exportJSON();
    assert.deepEqual(log4, [['alert', mExp1('Export JSON', 'plain')], ['warn', 'plain']]);
  });

  test('importFromInputEvent: P-IMPORT (read, reset input synchronously; try/catch only around parse + read + apply)', async () => {
    const readers = [];
    class FakeFileReader {
      constructor() { readers.push(this); }
      readAsText(file) { this.file = file; this.onloadAtRead = typeof this.onload; }
    }
    await withGlobals([[globalThis, 'FileReader', FakeFileReader]], () => {
      const log = [];
      const io = fakeIO(Project.createDefault(), log);

      const empty = { target: { files: [], value: 'C:\\fakepath\\none.json' } };
      io.importFromInputEvent(empty);
      assert.equal(readers.length, 0);
      assert.equal(empty.target.value, 'C:\\fakepath\\none.json');

      const load = (text) => {
        const e = { target: { files: [{ name: 'wall.json' }], value: 'C:\\fakepath\\wall.json' } };
        io.importFromInputEvent(e);
        const reader = readers.at(-1);
        assert.equal(reader.file, e.target.files[0]);
        assert.equal(reader.onloadAtRead, 'function', 'onload is set before readAsText');
        assert.equal(e.target.value, '', 'the input is reset synchronously');
        log.length = 0;
        reader.onload({ target: { result: text } });
        return log.slice();
      };

      const ok = load(JSON.stringify(CONFIGS.flat3));
      assert.equal(ok.length, 1);
      assert.equal(ok[0][0], 'applyImport');
      assert.equal(ok[0][1].meshMode, 'combined');
      assert.deepEqual(ok[0][1].sections.map((s) => s.name), ['Left', 'Center', 'Right']);

      assert.deepEqual(load('{"foo": 1}'), []);
      assert.deepEqual(load('null'), [['alert', "Error parsing JSON file: Cannot read properties of null (reading 'sections')"]]);
      const syntax = run(() => JSON.parse('{oops')).error.message;
      assert.deepEqual(load('{oops'), [['alert', 'Error parsing JSON file: ' + syntax]]);
      assert.deepEqual(load('{"sections": [null]}'), [['alert', "Error parsing JSON file: Cannot read properties of null (reading 'id')"]]);
    });
  });
});

describe('Downloader', () => {
  test('saveBlob runs the legacy anchor sequence with URL looked up at call time, revoking in a 0 ms timer; saveText makes the Blob first', async () => {
    const log = [];
    const doc = {
      createElement: (tag) => {
        log.push(['createElement', tag]);
        const a = { click: () => log.push(['click', a.href, a.download]) };
        return a;
      },
      body: { appendChild: (el) => log.push(['appendChild', el.download]), removeChild: (el) => log.push(['removeChild', el.download]) },
    };
    class FakeBlob { constructor(parts, options) { log.push(['Blob', parts, options]); } }
    const timers = [];
    const win = { setTimeout: (fn, ms) => { log.push(['setTimeout', ms]); timers.push(fn); return 1; } };
    await withGlobals([
      [URL, 'createObjectURL', (blob) => (log.push(['createObjectURL']), 'blob:fake/1')],
      [URL, 'revokeObjectURL', (url) => log.push(['revokeObjectURL', url])],
      [globalThis, 'Blob', FakeBlob],
    ], () => {
      const downloader = new Downloader({ doc, win });
      assert.deepEqual(log, [], 'the constructor has no side effects');
      downloader.saveText('hello', 'a.txt', 'text/plain');
      assert.deepEqual(log.at(-1), ['setTimeout', 0], 'not revoked synchronously (08 P2-1a)');
      timers.forEach((fn) => fn());
    });
    assert.deepEqual(log, [
      ['Blob', ['hello'], { type: 'text/plain' }],
      ['createElement', 'a'],
      ['createObjectURL'],
      ['appendChild', 'a.txt'],
      ['click', 'blob:fake/1', 'a.txt'],
      ['removeChild', 'a.txt'],
      ['setTimeout', 0],
      ['revokeObjectURL', 'blob:fake/1'],
    ]);
  });
});

describe('ExportPanel', () => {
  test('bind() registers the listeners in legacy order (4482-4488) and routes them to ProjectIO', async () => {
    const order = [];
    const calls = [];
    const elements = {};
    const doc = {
      getElementById: (id) => (elements[id] ??= {
        id,
        listeners: {},
        addEventListener(type, fn) { order.push(`${id}:${type}`); this.listeners[type] = fn; },
        click() { calls.push(`${id}.click()`); },
      }),
    };
    const projectIO = {
      exportZIP: async () => calls.push('exportZIP'),
      exportPanelIds: async () => calls.push('exportPanelIds'),
      exportJSON: () => calls.push('exportJSON'),
      exportOBJ: () => calls.push('exportOBJ'),
      exportGLTF: () => calls.push('exportGLTF'),
      importFromInputEvent: (e) => calls.push(['importFromInputEvent', e]),
    };
    const panel = new ExportPanel({ doc, projectIO });
    assert.deepEqual(order, [], 'the constructor adds no listeners');
    panel.bind();
    assert.deepEqual(order, ['export-zip:click', 'export-panel-ids:click', 'export-json:click', 'export-obj:click',
      'export-gltf:click', 'import-json:click', 'import-input:change']);

    const zipResult = elements['export-zip'].listeners.click({});
    assert.ok(zipResult instanceof Promise, 'the async export promise is returned (it never rejects since 08 P2-1a)');
    await zipResult;
    await elements['export-panel-ids'].listeners.click({});
    elements['export-json'].listeners.click({});
    elements['export-obj'].listeners.click({});
    elements['export-gltf'].listeners.click({});
    elements['import-json'].listeners.click({});
    const changeEvent = { target: elements['import-input'] };
    elements['import-input'].listeners.change(changeEvent);
    assert.deepEqual(calls, ['exportZIP', 'exportPanelIds', 'exportJSON', 'exportOBJ', 'exportGLTF', 'import-input.click()',
      ['importFromInputEvent', changeEvent]]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 6. Structural guarantees (R10, R13)
// ---------------------------------------------------------------------------------------------------------------

describe('structure', () => {
  const source = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  const code = (rel) => source(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  test('io/ modules import only domain, geometry and legacy, and name no THREE / document / window', () => {
    for (const rel of ['js/io/ProjectSerializer.js', 'js/io/ObjExporter.js', 'js/io/GltfExporter.js']) {
      const text = code(rel);
      for (const m of text.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)) {
        assert.match(m[1], /^\.\.\/(domain|geometry|legacy)\/[A-Za-z]+\.js$/, `${rel} imports ${m[1]}`);
      }
      assert.doesNotMatch(text, /\b(THREE|document|window)\b/, rel);
    }
  });

  test('no try/catch except #runExport (R13 amendment, 08 P2-1a) and the legacy import one; exportZIP and exportPanelIds stay async', () => {
    for (const rel of ['js/io/ProjectSerializer.js', 'js/io/ObjExporter.js', 'js/io/GltfExporter.js', 'js/ui/ExportPanel.js']) {
      assert.doesNotMatch(code(rel), /\btry\s*\{|\bcatch\s*[({]/, rel);
    }
    const io = code('js/app/ProjectIO.js');
    const tries = [...io.matchAll(/\btry\s*\{/g)].map((m) => m.index);
    assert.equal(tries.length, 2);
    assert.equal([...io.matchAll(/\bcatch\s*\(/g)].length, 2);
    const runExportAt = io.indexOf('#runExport(label, fn) {');
    const importAt = io.indexOf('importFromInputEvent(e) {');
    assert.ok(runExportAt > 0 && importAt > 0);
    const owner = (at) => (at > importAt ? 'import' : at > runExportAt ? 'runExport' : 'other');
    assert.deepEqual(tries.map(owner).sort(), ['import', 'runExport'], 'one try in #runExport, one in importFromInputEvent');
    assert.ok(runExportAt < importAt, '#runExport is defined before importFromInputEvent');
    for (const name of ['exportZIP', 'exportPanelIds']) assert.equal(ProjectIO.prototype[name].constructor.name, 'AsyncFunction');
    for (const name of ['exportJSON', 'exportOBJ', 'exportGLTF', 'exportSafeDistanceOBJ', 'importFromInputEvent']) {
      assert.equal(ProjectIO.prototype[name].constructor.name, 'Function', name);
    }
  });
});


// ---------------------------------------------------------------------------------------------------------------
// Stage-facing exports (B-H2; docs/improvements/08-bugfix-roadmap.md 6.4, P2-2c / P2-2d)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Seeded projects with integer inputs only (01 6.3): 1-4 sections, cols 1-12, rows 1-6, curves -30..30 (about 30 %
 * flat), offsets -180..180, widths 100-1000 mm.
 */
function integerProjects(seed, count) {
  const rand = rng(seed);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const projects = [];
  for (let w = 0; w < count; w++) {
    const sections = [];
    for (let i = 0, n = int(1, 4); i < n; i++) {
      sections.push(new WallSection({ id: i, name: `S${i}`, panelCols: int(1, 12), panelRows: int(1, 6),
        panelWidth: int(100, 1000), panelHeight: int(100, 1000), ledX: 32, ledY: 32,
        curveIntensity: rand() < 0.3 ? 0 : int(-30, 30), angleOffset: int(-180, 180), color: '#00f0ff' }));
    }
    projects.push([`int#${w}`, projectOf(sections, 'combined')]);
  }
  return projects;
}

/** The hand-picked walls (harness configs included, the empty wall excluded) and 200 seeded integer walls. */
const orientationProjects = () => [...handPicked().filter(([label]) => label !== 'empty wall'), ...integerProjects(0x0b1, 200)];

describe('OBJ: stage-facing winding and per-vertex normals (B-H2, 08 P2-2c)', () => {
  const FACE_LINE = '# Faces: counter-clockwise front faces; vn point out of the LED surface (toward the stage)';
  const writeArgs = (project, meshMode) => ({ sections: project.wall.sections, meshMode, layout: layoutProject(project) });
  const lines = (text) => text.split('\n');
  /** The OBJ text without the lines that P2-2c changes: the orientation header line, `vn` and `f` lines. */
  const unchangedPart = (text) => lines(text).filter((l) => l !== FACE_LINE && !l.startsWith('vn ') && !l.startsWith('f ')).join('\n');

  test("the production profile winds 'ccw' with 'averaged' per-vertex normals; LegacyProfiles keeps the Phase-1 values", () => {
    assert.deepEqual({ ...Strategies.mesh.obj }, { winding: 'ccw', normals: 'averaged', stripNormals: 'per-vertex',
      combinedUV: 'per-section-overlap', panelNormal: 'facing' });
    assert.deepEqual({ ...LegacyProfiles.mesh.obj }, { winding: 'legacy-cw', normals: 'none', stripNormals: 'constant-z',
      combinedUV: 'per-section-overlap', panelNormal: 'facing' });
  });

  test('header: the 01 CR-3 line right after "# Mesh Mode: ..." in every mode; none with the Phase-1 profile', () => {
    const project = Project.createDefault();
    for (const mode of MODES) {
      const head = lines(OBJ.write(writeArgs(project, mode)).objContent).slice(0, 4);
      assert.deepEqual(head, ['# LED Wall Configuration OBJ Export', `# Mesh Mode: ${mode}`, FACE_LINE, '# Generated by LED Wall Configurator']);
      assert.ok(!LEGACY_OBJ.write(writeArgs(project, mode)).objContent.includes('# Faces:'), mode);
    }
  });

  test('every hand-picked wall in every mode: the MTL and every v, vt, o, usemtl and mtllib line equal the Phase-1 output', () => {
    for (const [label, project] of handPicked()) {
      for (const mode of MODES) {
        const now = run(() => OBJ.write(writeArgs(project, mode)));
        const old = run(() => LEGACY_OBJ.write(writeArgs(project, mode)));
        assert.equal(now.ok, old.ok, `${label} [${mode}]`);
        if (!now.ok) {
          assert.equal(describeError(now.error), describeError(old.error), `${label} [${mode}]`);
          continue;
        }
        assert.equal(now.value.mtlContent, old.value.mtlContent, `${label} [${mode}] MTL`);
        assert.equal(unchangedPart(now.value.objContent), unchangedPart(old.value.objContent), `${label} [${mode}] OBJ`);
      }
    }
  });

  test('strip modes: one vn per v (the builder normals, toFixed(6)) and faces a/a/a; panel mode: v, v+1, v+2 / v, v+2, v+3', () => {
    for (const [label, project] of orientationProjects()) {
      for (const mode of ['combined', 'section']) {
        const text = OBJ.write(writeArgs(project, mode)).objContent;
        const v = lines(text).filter((l) => l.startsWith('v ')).length;
        const vn = lines(text).filter((l) => l.startsWith('vn '));
        assert.equal(vn.length, v, `${label} [${mode}]`);
        for (const f of lines(text).filter((l) => l.startsWith('f '))) {
          for (const corner of f.slice(2).split(' ')) {
            const [a, t, n] = corner.split('/');
            assert.ok(a === t && t === n && Number(a) >= 1 && Number(a) <= v, `${label} [${mode}]: ${f}`);
          }
        }
        const builder = new WallMeshBuilder(Strategies.mesh.obj);
        const normals = layoutProject(project).sections.flatMap((sl) => builder.sectionGrid(sl).normals);
        const expected = [];
        for (let i = 0; i < normals.length; i += 3) expected.push(`vn ${normals[i].toFixed(6)} ${normals[i + 1].toFixed(6)} ${normals[i + 2].toFixed(6)}`);
        assert.deepEqual(vn, expected, `${label} [${mode}]`);
      }
      const panel = lines(OBJ.write(writeArgs(project, 'panel')).objContent).filter((l) => l.startsWith('f '));
      for (let k = 0; k < panel.length; k += 2) {
        const v = 1 + 4 * (k / 2), n = 1 + k / 2;
        assert.equal(panel[k], `f ${v}/${v}/${n} ${v + 1}/${v + 1}/${n} ${v + 2}/${v + 2}/${n}`, label);
        assert.equal(panel[k + 1], `f ${v}/${v}/${n} ${v + 2}/${v + 2}/${n} ${v + 3}/${v + 3}/${n}`, label);
      }
    }
  });

  test('tools/check-orientation passes for every object in every mode (hand-picked and 200 integer walls); the Phase-1 default wall faces away', (t) => {
    let objects = 0;
    for (const [label, project] of orientationProjects()) {
      for (const mode of MODES) {
        for (const o of checkObjText(OBJ.write(writeArgs(project, mode)).objContent)) {
          assert.equal(o.failures, 0, `${label} [${mode}] ${o.name}: ${o.first}`);
          objects++;
        }
        // The Phase-1 OBJ faces away from the stage wherever the wall faces +Z (a wall turned around by its offsets
        // can agree with the constant `vn 0 0 1` by accident, so only the default wall is asserted).
        if (label === 'default wall') {
          const legacy = checkObjText(LEGACY_OBJ.write(writeArgs(project, mode)).objContent);
          assert.ok(legacy.every((o) => o.failures === o.triangles), `${label} [${mode}]: the Phase-1 OBJ faces away`);
        }
      }
    }
    t.diagnostic(`${objects} OBJ objects pass`);
  });
});

describe('glTF: stage-facing winding and the NORMAL attribute (B-H2, 08 P2-2d)', () => {
  const writeArgs = (project, meshMode) => ({ sections: project.wall.sections, meshMode, layout: layoutProject(project) });
  /** The decoded data of accessor `a` (float or index) of a written document. */
  const accessorData = (doc, a) => {
    const accessor = doc.accessors[a];
    const view = doc.bufferViews[accessor.bufferView];
    const bytes = Buffer.from(doc.buffers[0].uri.split(',')[1], 'base64');
    const Ctor = accessor.componentType === 5126 ? Float32Array : accessor.componentType === 5125 ? Uint32Array : Uint16Array;
    const n = accessor.count * (accessor.type === 'VEC3' ? 3 : 1);
    const copy = bytes.buffer.slice(bytes.byteOffset + view.byteOffset, bytes.byteOffset + view.byteOffset + n * Ctor.BYTES_PER_ELEMENT);
    return Array.from(new Ctor(copy));
  };

  test("the production profile winds 'ccw' with 'averaged' normals, panelNormal 'facing' and attributes POSITION, NORMAL", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(Strategies.mesh.gltf)), { winding: 'ccw', normals: 'averaged', panelNormal: 'facing',
      attributes: ['POSITION', 'NORMAL'], indexType: 'auto', doubleSided: 'omit' });
    assert.deepEqual(JSON.parse(JSON.stringify(LegacyProfiles.mesh.gltf)), { winding: 'legacy-cw', normals: 'none',
      attributes: ['POSITION'], indexType: 'uint16', doubleSided: 'omit' });
  });

  test('every primitive has a unit NORMAL (VEC3 5126, own view 34962, no min/max); tools/check-gltf and check-orientation pass', (t) => {
    let primitives = 0;
    for (const [label, project] of orientationProjects()) {
      for (const mode of MODES) {
        const doc = GLTF.write(writeArgs(project, mode));
        assert.deepEqual(checkGltfDocument(doc), [], `${label} [${mode}]`);
        for (const r of checkGltfOrientation(doc)) assert.equal(r.failures, 0, `${label} [${mode}] ${r.name}: ${r.first}`);
        for (const mesh of doc.meshes) {
          for (const prim of mesh.primitives) {
            assert.deepEqual(Object.keys(prim.attributes), ['POSITION', 'NORMAL'], `${label} [${mode}]`);
            const normal = doc.accessors[prim.attributes.NORMAL];
            assert.equal(normal.componentType, 5126);
            assert.equal(normal.type, 'VEC3');
            assert.equal(normal.count, doc.accessors[prim.attributes.POSITION].count);
            assert.ok(!('min' in normal) && !('max' in normal));
            const view = doc.bufferViews[normal.bufferView];
            assert.equal(view.target, 34962);
            assert.notEqual(normal.bufferView, doc.accessors[prim.attributes.POSITION].bufferView);
            const n = accessorData(doc, prim.attributes.NORMAL);
            for (let i = 0; i < n.length; i += 3) assert.ok(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) < 1e-6);
            primitives++;
          }
        }
        assert.ok(doc.materials.every((m) => !('doubleSided' in m)), "doubleSided 'omit'");
      }
    }
    t.diagnostic(`${primitives} primitives`);
  });

  test('positions, min/max, materials, meshes and nodes equal the Phase-1 output; the indices are its triangles reversed', () => {
    const swapLastTwo = (idx) => { const out = []; for (let k = 0; k < idx.length; k += 3) out.push(idx[k], idx[k + 2], idx[k + 1]); return out; };
    const sortedTriangles = (idx) => { const tris = []; for (let k = 0; k < idx.length; k += 3) tris.push(`${idx[k]},${idx[k + 1]},${idx[k + 2]}`); return tris.sort(); };
    for (const [label, project] of orientationProjects().slice(0, 40)) {
      for (const mode of MODES) {
        const now = GLTF.write(writeArgs(project, mode));
        const old = makeGltf({ ...LegacyProfiles.mesh.gltf, indexType: 'auto' }).write(writeArgs(project, mode));
        assert.deepEqual(now.materials, old.materials, `${label} [${mode}]`);
        assert.deepEqual(now.nodes, old.nodes);
        assert.deepEqual(now.scenes, old.scenes);
        assert.deepEqual(now.meshes.map((m) => m.name), old.meshes.map((m) => m.name));
        now.meshes.forEach((mesh, m) => {
          const a = mesh.primitives[0], b = old.meshes[m].primitives[0];
          const pa = now.accessors[a.attributes.POSITION], pb = old.accessors[b.attributes.POSITION];
          assert.deepEqual([pa.min, pa.max, pa.count], [pb.min, pb.max, pb.count]);
          assert.deepEqual(accessorData(now, a.attributes.POSITION), accessorData(old, b.attributes.POSITION));
          // Same triangles, each with its last two vertices swapped (08 6.4): the CCW triangle set equals the legacy set reversed.
          assert.deepEqual(sortedTriangles(accessorData(now, a.indices)), sortedTriangles(swapLastTwo(accessorData(old, b.indices))), `${label} [${mode}]`);
        });
      }
    }
  });

  test('NORMAL equals the builder normals: the averaged strip normals, and 4 copies of the facing normal per panel', () => {
    const builder = new WallMeshBuilder(Strategies.mesh.gltf);
    for (const [label, project] of orientationProjects().slice(0, 40)) {
      const layout = layoutProject(project);
      const section = GLTF.write(writeArgs(project, 'section'));
      layout.sections.forEach((sl, i) => {
        assert.deepEqual(accessorData(section, section.meshes[i].primitives[0].attributes.NORMAL),
          Array.from(new Float32Array(builder.sectionGrid(sl).normals)), `${label} section ${i}`);
      });
      const combined = GLTF.write(writeArgs(project, 'combined'));
      assert.deepEqual(accessorData(combined, combined.meshes[0].primitives[0].attributes.NORMAL),
        Array.from(new Float32Array(layout.sections.flatMap((sl) => builder.sectionGrid(sl).normals))), label);
      const panel = GLTF.write(writeArgs(project, 'panel'));
      const panels = layout.sections.flatMap((sl) => sl.panels);
      panels.forEach((p, k) => {
        const f = builder.panelFacingNormal(p);
        assert.deepEqual(builder.panelNormals(p), [f.x, 0, f.z, f.x, 0, f.z, f.x, 0, f.z, f.x, 0, f.z]);
        assert.deepEqual(accessorData(panel, panel.meshes[k].primitives[0].attributes.NORMAL), Array.from(new Float32Array(builder.panelNormals(p))));
      });
    }
  });

  test("doubleSided 'true' (08 P2-2d, unused) writes doubleSided: true on every material; nothing else changes", () => {
    const project = projectFromConfig(CONFIGS.concave_offsets);
    for (const mode of MODES) {
      const plain = GLTF.write(writeArgs(project, mode));
      const two = makeGltf({ ...Strategies.mesh.gltf, doubleSided: 'true' }).write(writeArgs(project, mode));
      assert.ok(two.materials.length > 0 && two.materials.every((m) => m.doubleSided === true), mode);
      assert.deepEqual(two.materials.map(({ doubleSided, ...rest }) => rest), plain.materials);
      assert.deepEqual({ ...two, materials: null }, { ...plain, materials: null });
    }
  });

  test('large_wall combined: the NORMAL view grows the buffer from 79,728 to 121,056 bytes (01 2.4; chunked base64 since P2-1a)', () => {
    const project = projectFromConfig(CONFIGS.large_wall);
    const now = GLTF.write(writeArgs(project, 'combined'));
    const old = makeGltf({ ...LegacyProfiles.mesh.gltf, indexType: 'auto' }).write(writeArgs(project, 'combined'));
    assert.equal(old.buffers[0].byteLength, 79728);
    assert.equal(now.buffers[0].byteLength, 121056);
  });

  test('NORMAL without per-vertex normals is refused: strip modes name mesh.gltf.normals, panel mode mesh.panelNormal', () => {
    const project = Project.createDefault();
    const expectError = (key, value) => (e) => e instanceof Error && e.message === unsupportedStrategy(key, value).message;
    const noNormals = makeGltf({ ...LegacyProfiles.mesh.gltf, attributes: ['POSITION', 'NORMAL'] });
    assert.throws(() => noNormals.write(writeArgs(project, 'combined')), expectError('mesh.gltf.normals', 'none'));
    assert.throws(() => noNormals.write(writeArgs(project, 'section')), expectError('mesh.gltf.normals', 'none'));
    assert.throws(() => noNormals.write(writeArgs(project, 'panel')), expectError('mesh.panelNormal', undefined));
  });
});
