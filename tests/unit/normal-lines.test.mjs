// Unit tests for js/geometry/NormalLines.js, the arithmetic of the normals debug view (docs/improvements/01-normals.md
// 6.6, 6.7, 8.1; 01 T3): the auto length table, the decimation stride, the line counts of the harness walls, the two
// writers (world transform, normal matrix, winding-derived face normals, colours, the running sample counter), the
// upload size, the en-US count formatting and the stats strings, and the cap benchmark of acceptance criterion 14a on
// the largest importable wall (200 sections x 50x20). The writers allocate nothing, so the benchmark also times them
// (logged, not asserted).
// Run: node --test tests/unit/normal-lines.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_NORMAL_LINES, autoNormalLength, decimationStride, countNormalLines, writeVertexNormalLines, writeFaceNormalLines,
  uploadCount, formatCount, formatNormalStats,
} from '../../js/geometry/NormalLines.js';
import { WallSection } from '../../js/domain/WallSection.js';
import { Project } from '../../js/domain/Project.js';
import { Palette } from '../../js/theme/Theme.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';
import { layoutProject } from '../../js/geometry/WallLayout.js';
import { WallMeshBuilder } from '../../js/geometry/WallMeshBuilder.js';
import { computeAtlas } from '../../js/geometry/TextureAtlas.js';
import { ProjectSerializer } from '../../js/io/ProjectSerializer.js';
import { sectionsFromProject } from '../../js/io/ProjectSchema.js';
import { CONFIGS } from '../regression/configs.mjs';

const IDENTITY4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const TIP = [0.8, 0.6, 0.2];
const out = (lines) => ({ positions: new Float32Array(lines * 6), colors: new Float32Array(lines * 6), count: 0, seen: 0 });
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

/** The project of a harness config (tests/regression/configs.mjs), read by the app's own v1 reader (validated since 08 P2-3b). */
function configProject(name) {
  if (name === 'default') return Project.createDefault();
  const read = new ProjectSerializer({ palette: Palette }).read(CONFIGS[name]);
  assert.ok(read.ok, name);
  const project = Project.createDefault();
  project.wall.replaceAll(sectionsFromProject(read.project));
  if (read.project.mesh_mode) project.meshMode = read.project.mesh_mode;
  return project;
}
const oneSection = (fields) => {
  const project = Project.createDefault();
  project.wall.replaceAll([new WallSection({ id: 0, name: 'S', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500,
    ledX: 32, ledY: 32, curveIntensity: 0, angleOffset: 0, color: '#00f0ff', ...fields })]);
  return project;
};

describe('autoNormalLength (01 6.7.4)', () => {
  test('the 6.7.4 table, within 1e-3 m', () => {
    const table = {
      default: 0.117, flat3: 0.250, mixed: 0.125, box_corner: 0.180, large_wall: 0.774,
    };
    for (const [name, metres] of Object.entries(table)) close(autoNormalLength(layoutProject(configProject(name))), metres, 1e-3, name);
    close(autoNormalLength(layoutProject(oneSection({ panelCols: 50, panelRows: 20, panelWidth: 5000, panelHeight: 5000 }))), 2.693, 1e-3, '50x20 of 5 m');
    assert.equal(autoNormalLength(layoutProject(oneSection({ panelCols: 1, panelRows: 1, panelWidth: 50, panelHeight: 50 }))), 0.005, 'floor clamp');
  });

  test('the scale multiplies, clamped to [0.005, 5] m; an empty or missing layout gives 0', () => {
    const layout = layoutProject(Project.createDefault());
    close(autoNormalLength(layout, 2), 0.2332, 1e-4, 'x2');
    assert.equal(autoNormalLength(layoutProject(oneSection({ panelCols: 50, panelRows: 20, panelWidth: 5000, panelHeight: 5000 })), 4), 5);
    assert.equal(autoNormalLength(null), 0);
    assert.equal(autoNormalLength({ sections: [], bounds: () => null }), 0);
  });
});

describe('decimation and counts (01 6.6, 6.7.3)', () => {
  test('decimationStride: 150,000 -> 1, 150,001 -> 2, 0 -> 1, and a custom cap', () => {
    assert.equal(MAX_NORMAL_LINES, 150000);
    assert.equal(decimationStride(150000), 1);
    assert.equal(decimationStride(150001), 2);
    assert.equal(decimationStride(0), 1);
    assert.equal(decimationStride(10, 4), 3);
  });

  test('countNormalLines: vertices, quads (6 indices) or triangles, and kinds that are off count 0', () => {
    const meshes = [{ vertexCount: 24, indexCount: 90 }, { vertexCount: 4, indexCount: 6 }, { vertexCount: 3, indexCount: 3 }];
    assert.deepEqual(countNormalLines(meshes, { vertex: true, face: true }), { vertexLines: 31, faceLines: 15 + 1 + 1 });
    assert.deepEqual(countNormalLines(meshes, { vertex: false, face: true }), { vertexLines: 0, faceLines: 17 });
    assert.deepEqual(countNormalLines(meshes, { vertex: true, face: false }), { vertexLines: 31, faceLines: 0 });
  });

  test('the 6.6 table: vertex and face lines in the strip modes, vertex lines in panel mode', () => {
    const table = { default: [24, 15, 60], flat3: [68, 42, 168], mixed: [112, 74, 296], box_corner: [88, 54, 216], large_wall: [3444, 3200, 12800] };
    const builder = new WallMeshBuilder(Strategies.mesh.viewport);
    for (const [name, [v, f, p]] of Object.entries(table)) {
      const project = configProject(name);
      const layout = layoutProject(project);
      const grid = builder.combinedGrid(layout, computeAtlas(project.wall.sections));
      const combined = countNormalLines([{ vertexCount: grid.positions.length / 3, indexCount: grid.indices.length }], { vertex: true, face: true });
      assert.deepEqual(combined, { vertexLines: v, faceLines: f }, `${name} combined`);
      const sections = layout.sections.map((sl) => { const g = builder.sectionGrid(sl, { uv: 'unit' }); return { vertexCount: g.positions.length / 3, indexCount: g.indices.length }; });
      assert.deepEqual(countNormalLines(sections, { vertex: true, face: true }), { vertexLines: v, faceLines: f }, `${name} section`);
      const panels = layout.sections.flatMap((sl) => sl.panels.map(() => ({ vertexCount: 4, indexCount: 6 })));
      assert.deepEqual(countNormalLines(panels, { vertex: true, face: true }), { vertexLines: p, faceLines: p / 4 }, `${name} panel`);
    }
  });

  test('uploadCount: 2 vertices x 3 floats per written line', () => {
    assert.equal(uploadCount(0), 0);
    assert.equal(uploadCount(7), 42);
    assert.equal(uploadCount(MAX_NORMAL_LINES), 900000);
  });
});

describe('writers (01 6.7.1, 6.7.2)', () => {
  const quad = { positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1] };

  test('vertex lines with the identity: p -> p + L n, base colour at p, tip colour at the end', () => {
    const o = out(8);
    const n = writeVertexNormalLines(o, { ...quad, matrix: IDENTITY4, normalMatrix: IDENTITY3 }, { length: 0.5, stride: 1, tip: TIP, baseFactor: 0.35 });
    assert.equal(n, 4);
    assert.equal(o.count, 4);
    assert.equal(o.seen, 4);
    const line = (k) => Array.from(o.positions.subarray(6 * k, 6 * k + 6));
    assert.deepEqual(line(2), [1, 1, 0, 1, 1, 0.5]);
    const c = Array.from(o.colors.subarray(0, 6));
    [0.8 * 0.35, 0.6 * 0.35, 0.2 * 0.35, 0.8, 0.6, 0.2].forEach((v, i) => close(c[i], v, 1e-6, `colour ${i}`));
  });

  test('vertex lines with a rotation and translation: the endpoint is M p + L N n within 1e-6', () => {
    const a = 0.7;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    // Rotation about +Y by a, then translation (2, -1, 3); column-major.
    const m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 2, -1, 3, 1];
    const nm = [c, 0, -s, 0, 1, 0, s, 0, c];
    const o = out(4);
    writeVertexNormalLines(o, { ...quad, matrix: m, normalMatrix: nm }, { length: 2, stride: 1, tip: TIP, baseFactor: 0.35 });
    // vertex (1, 1, 0) with normal (0, 0, 1): p' = (c + 2, 0, -s + 3); n' = (s, 0, c)
    const got = Array.from(o.positions.subarray(12, 18));
    const want = [c + 2, 0, -s + 3, c + 2 + 2 * s, 0, -s + 3 + 2 * c];
    want.forEach((v, i) => close(got[i], v, 1e-6, `component ${i}`));
  });

  test('vertex lines: normals are renormalised after the normal matrix; zero normals and missing normals draw nothing', () => {
    const o = out(4);
    const scaled = [2, 0, 0, 0, 2, 0, 0, 0, 2];
    writeVertexNormalLines(o, { positions: [0, 0, 0, 1, 0, 0], normals: [0, 0, 3, 0, 0, 0], matrix: IDENTITY4, normalMatrix: scaled },
      { length: 1, stride: 1, tip: TIP, baseFactor: 0.35 });
    assert.equal(o.count, 1, 'the zero normal is skipped');
    assert.equal(o.seen, 2, 'but counted as a sample');
    close(o.positions[5], 1, 1e-6, 'unit length after renormalising');
    const p = out(4);
    assert.equal(writeVertexNormalLines(p, { positions: [0, 0, 0, 1, 0, 0, 2, 0, 0], normals: null, matrix: IDENTITY4, normalMatrix: IDENTITY3 },
      { length: 1, stride: 1, tip: TIP, baseFactor: 0.35 }), 0);
    assert.equal(p.seen, 3);
  });

  test('face lines follow the winding: a counter-clockwise quad gives +Z, a clockwise one -Z, from the quad centroid', () => {
    const opts = { length: 1, stride: 1, tip: TIP, baseFactor: 0.35 };
    const ccw = out(1);
    assert.equal(writeFaceNormalLines(ccw, { positions: quad.positions, index: [0, 1, 2, 0, 2, 3], matrix: IDENTITY4, normalMatrix: IDENTITY3 }, opts), 1);
    assert.deepEqual(Array.from(ccw.positions), [0.5, 0.5, 0, 0.5, 0.5, 1]);
    const cw = out(1);
    writeFaceNormalLines(cw, { positions: quad.positions, index: [0, 2, 1, 0, 3, 2], matrix: IDENTITY4, normalMatrix: IDENTITY3 }, opts);
    assert.deepEqual(Array.from(cw.positions), [0.5, 0.5, 0, 0.5, 0.5, -1]);
  });

  test('face lines: one per triangle when the index count is not a multiple of 6; non-indexed and degenerate meshes', () => {
    const opts = { length: 1, stride: 1, tip: TIP, baseFactor: 0.35 };
    const tri = out(4);
    assert.equal(writeFaceNormalLines(tri, { positions: quad.positions, index: [0, 1, 2, 0, 2, 3, 0, 1, 2], matrix: IDENTITY4, normalMatrix: IDENTITY3 }, opts), 3);
    const first = Array.from(tri.positions.subarray(0, 6));
    [2 / 3, 1 / 3, 0, 2 / 3, 1 / 3, 1].forEach((v, i) => close(first[i], v, 1e-6, `triangle centroid ${i}`));
    const flat = out(2);
    assert.equal(writeFaceNormalLines(flat, { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], index: null, matrix: IDENTITY4, normalMatrix: IDENTITY3 }, opts), 1);
    const degenerate = out(2);
    assert.equal(writeFaceNormalLines(degenerate, { positions: [0, 0, 0, 1, 0, 0, 2, 0, 0], index: [0, 1, 2], matrix: IDENTITY4, normalMatrix: IDENTITY3 }, opts), 0);
    assert.equal(degenerate.seen, 1);
  });

  test('the running counter spreads the samples across meshes and both kinds', () => {
    const o = out(8);
    const opts = { length: 1, stride: 2, tip: TIP, baseFactor: 0.35 };
    const tri = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], index: [0, 1, 2], matrix: IDENTITY4, normalMatrix: IDENTITY3 };
    assert.equal(writeVertexNormalLines(o, tri, opts), 2);   // samples 0, 1, 2 -> keep 0 and 2
    assert.equal(writeFaceNormalLines(o, tri, opts), 0);     // sample 3 -> skipped
    assert.equal(writeVertexNormalLines(o, tri, opts), 2);   // samples 4, 5, 6 -> keep 4 and 6
    assert.equal(o.count, 4);
    assert.equal(o.seen, 7);
  });
});

describe('formatting (01 3.5)', () => {
  test('formatCount groups digits with a fixed regex', () => {
    assert.equal(formatCount(3444), '3,444');
    assert.equal(formatCount(150000), '150,000');
    assert.equal(formatCount(0), '0');
    assert.equal(formatCount(999), '999');
    assert.equal(formatCount(1000000), '1,000,000');
    assert.equal(formatCount(214200), '214,200');
  });

  test('formatNormalStats gives the exact 3.5 strings and warning flags', () => {
    const base = { vertexLines: 24, faceLines: 15, total: 39, stride: 1, lengthM: 0.11661903789690602 };
    assert.deepEqual(formatNormalStats({ ...base, vertex: true, face: false }), { text: '24 vertex lines · 0.117 m', warning: false });
    assert.deepEqual(formatNormalStats({ ...base, vertex: false, face: true }), { text: '15 face lines · 0.117 m', warning: false });
    assert.deepEqual(formatNormalStats({ ...base, lengthM: 0.23323807579381204, vertex: true, face: true }), { text: '24 vertex + 15 face lines · 0.233 m', warning: false });
    assert.deepEqual(formatNormalStats({ ...base, vertexLines: 3444, faceLines: 3200, lengthM: 0.774, vertex: true, face: true }), { text: '3,444 vertex + 3,200 face lines · 0.774 m', warning: false });
    assert.deepEqual(formatNormalStats({ ...base, vertex: false, face: false }), { text: 'No line type selected', warning: true });
    assert.deepEqual(formatNormalStats({ ...base, vertex: true, face: true, empty: true }), { text: 'No wall geometry', warning: false });
    assert.deepEqual(formatNormalStats({ vertexLines: 214200, faceLines: 0, total: 214200, stride: 2, lengthM: 5, vertex: true, face: false }),
      { text: 'Showing 1 of every 2 normals (214,200 total, cap 150,000)', warning: true });
  });
});

describe('cap benchmark: the largest importable wall (01 AC 14a)', () => {
  // 200 strip descriptors of one 50 x 20 section: a 51 x 21 vertex grid (1,071 vertices), 1,000 quads of 6 indices.
  const COLS = 50, ROWS = 20;
  const vpr = COLS + 1;
  const positions = new Float32Array(vpr * (ROWS + 1) * 3);
  const normals = new Float32Array(vpr * (ROWS + 1) * 3);
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      const v = r * vpr + c;
      positions.set([c * 0.5, r * 0.5, 0], 3 * v);
      normals.set([0, 0, 1], 3 * v);
    }
  }
  const index = new Uint32Array(COLS * ROWS * 6);
  for (let r = 0, k = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const bl = r * vpr + c, br = bl + 1, tl = bl + vpr, tr = tl + 1;
      index.set([bl, br, tr, bl, tr, tl], k);
      k += 6;
    }
  }
  const strip = { positions, normals, index, matrix: IDENTITY4, normalMatrix: IDENTITY3 };
  const descriptors = Array.from({ length: 200 }, () => ({ vertexCount: 1071, indexCount: 6000 }));

  /** Count, decimate and write like NormalsDebugView.sync: per mesh, vertex then face lines, one running counter. */
  function run(meshes, src, kinds) {
    const { vertexLines, faceLines } = countNormalLines(meshes, kinds);
    const total = vertexLines + faceLines;
    const stride = decimationStride(total);
    const o = out(MAX_NORMAL_LINES);
    const opts = { length: 0.25, stride, tip: TIP, baseFactor: 0.35 };
    const t0 = performance.now();
    for (let m = 0; m < meshes.length; m++) {
      if (kinds.vertex) writeVertexNormalLines(o, src, opts);
      if (kinds.face) writeFaceNormalLines(o, src, opts);
    }
    return { total, stride, written: o.count, ms: performance.now() - t0, text: formatNormalStats({ vertexLines, faceLines, total, stride, lengthM: 0.25, ...kinds }).text };
  }

  test('vertex lines only: 214,200 total, stride 2, exactly 107,100 written', (t) => {
    const r = run(descriptors, strip, { vertex: true, face: false });
    assert.deepEqual([r.total, r.stride, r.written], [214200, 2, 107100]);
    assert.equal(r.text, 'Showing 1 of every 2 normals (214,200 total, cap 150,000)');
    t.diagnostic(`write ${r.ms.toFixed(1)} ms`);
  });

  test('both kinds: 414,200 total, stride 3, exactly 138,067 written (<= 150,000)', (t) => {
    const r = run(descriptors, strip, { vertex: true, face: true });
    assert.deepEqual([r.total, r.stride, r.written], [414200, 3, 138067]);
    assert.ok(r.written <= MAX_NORMAL_LINES);
    assert.equal(r.text, 'Showing 1 of every 3 normals (414,200 total, cap 150,000)');
    t.diagnostic(`write ${r.ms.toFixed(1)} ms`);
  });

  test('panel-mode shape (unit only): 200,000 descriptors of 4 vertices and 6 indices, both kinds: 1,000,000 total, stride 7, 142,858 written', (t) => {
    const panel = { positions: quad4(), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), index: new Uint16Array([0, 1, 2, 0, 2, 3]), matrix: IDENTITY4, normalMatrix: IDENTITY3 };
    const r = run(Array.from({ length: 200000 }, () => ({ vertexCount: 4, indexCount: 6 })), panel, { vertex: true, face: true });
    assert.deepEqual([r.total, r.stride, r.written], [1000000, 7, 142858]);
    t.diagnostic(`write ${r.ms.toFixed(1)} ms`);
  });

  function quad4() { return new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]); }
});
