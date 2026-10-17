// Unit tests for geometry/SafeDistanceBand.js, the mitred, clamped safe-distance band of 08 P2-5b
// (docs/improvements/08-bugfix-roadmap.md 6.9 and the P2-5 row of 8.4; B-M15 and B-L29 fixed): flat walls give the legacy
// quad positions, every mitred vertex is at distance d from both of its segment lines, concave arcs and corners clamp
// to the values of 6.9's worked cases, every triangle faces +Y (also over 10,000 random walls), fold-backs split, and
// the clamp count feeds the OBJ `# Clamped:` header line.
// Run: node --test tests/unit/safe-distance-band.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { WallSection } from '../../js/domain/WallSection.js';
import { Project } from '../../js/domain/Project.js';
import { computeWallLayout, layoutProject, framingBounds } from '../../js/geometry/WallLayout.js';
import { buildSafeDistanceBand, bandRunOfLayout, SAFE_BAND_EPS } from '../../js/geometry/SafeDistanceBand.js';
import { ProjectSerializer } from '../../js/io/ProjectSerializer.js';
import { sectionsFromProject } from '../../js/io/ProjectSchema.js';
import { ObjExporter } from '../../js/io/ObjExporter.js';
import { WallMeshBuilder } from '../../js/geometry/WallMeshBuilder.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';
import { Brand, Palette } from '../../js/theme/Theme.js';
import { checkObjText } from '../../tools/check-orientation.mjs';
import { CONFIGS } from '../regression/configs.mjs';

/** Deterministic PRNG (mulberry32), the generator of the other unit tests. */
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

const serializer = new ProjectSerializer({ palette: Palette });

/** The project of a harness config (read and validated as the import does) and its default-camera D. */
function configProject(config) {
  const project = Project.createDefault();
  const r = serializer.read(config);
  assert.ok(r.ok, 'the config imports');
  project.wall.replaceAll(sectionsFromProject(r.project));
  return { project, layout: layoutProject(project), D: project.camera.maxSafeDistance(framingBounds(project)) };
}

/** One section of `cols` panels of `widthMm`, curve `curve`, offset `offset`. */
const section = (id, cols, widthMm, curve, offset = 0) => new WallSection({ id, name: `S${id}`, panelCols: cols, panelRows: 2,
  panelWidth: widthMm, panelHeight: 500, ledX: 32, ledY: 32, curveIntensity: curve, angleOffset: offset, color: '#ffffff' });

/** The 08 6.9 test wall concave30: one section, 6 x 4 panels of 500 mm, curve 30°. */
const CONCAVE30 = [section(0, 6, 500, 30)];

/** [x, z] of vertex i. */
const xz = (band, i) => [band.positions[3 * i], band.positions[3 * i + 2]];

/** The doubled signed area (the y component of (b - a) x (c - a)) of every triangle. */
function triangleYs(band) {
  const out = [];
  for (let t = 0; t < band.indices.length; t += 3) {
    const [a, b, c] = [band.indices[t], band.indices[t + 1], band.indices[t + 2]].map((i) => xz(band, i));
    out.push((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]));
  }
  return out;
}

/** The number of wall (polyline) vertices: they come first. */
const wallCount = (band) => band.colors.filter((c) => c === 'wall').length;

/** The stage normal of the segment p -> q. */
function stageNormal(p, q) {
  const l = Math.hypot(q.x - p.x, q.z - p.z);
  return [-(q.z - p.z) / l, (q.x - p.x) / l];
}

/** The offset distance d of every offset vertex k of an unsplit run: (offset - w[k]) . m (of segment k, or k - 1 at the end). */
function offsetDistances(band, points) {
  return band.outline.map((o, k) => {
    const j = Math.min(k, points.length - 2);
    const m = stageNormal(points[j], points[j + 1]);
    return (o.x - points[k].x) * m[0] + (o.z - points[k].z) * m[1];
  });
}

describe('buildSafeDistanceBand: shape and flat walls (08 6.9)', () => {
  test('a flat wall gives the legacy per-column quad positions, deduplicated, and no clamped vertex', () => {
    const { layout, D } = configProject(CONFIGS.flat3);
    const band = buildSafeDistanceBand(layout, D);
    const edges = layout.flatEdges();
    // Legacy 2649-2708: per column, the wall points and the points offset by D along the column normal.
    const legacy = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const [nx, nz] = stageNormal(edges[i], edges[i + 1]);
      for (const e of [edges[i], edges[i + 1]]) legacy.push([e.x, e.z], [e.x + nx * D, e.z + nz * D]);
    }
    const key = ([x, z]) => `${x.toFixed(9)},${z.toFixed(9)}`;
    const unique = [...new Set(legacy.map(key))].sort();
    const ours = [];
    for (let i = 0; i < band.positions.length / 3; i++) ours.push(key(xz(band, i)));
    assert.deepEqual(ours.slice().sort(), unique, 'the same points, each once');
    assert.equal(band.positions.length / 3, 2 * edges.length, 'one wall and one offset vertex per edge');
    for (let i = 1; i < band.positions.length; i += 3) assert.equal(band.positions[i], 0.005, 'every vertex at the legacy lift');
    assert.equal(band.clampedVertices, 0);
    assert.equal(band.totalSafeVertices, edges.length);
    assert.equal(band.distance, D);
    assert.ok(band.colors.every((c, i) => (i < edges.length ? c === 'wall' : c === 'threshold')));
    // The outline runs along the offset vertices; the label sits at the legacy middle index.
    assert.equal(band.outline.length, edges.length);
    assert.deepEqual(band.labelAnchor, band.outline[Math.floor(band.outline.length / 2)]);
    assert.ok(triangleYs(band).every((y) => y > 0), 'every triangle faces +Y (B-L29)');
    assert.equal(band.indices.length, 6 * (edges.length - 1), 'two triangles per column');
  });

  test('the legacy flat quad diagonal is kept: (w[j], E, w[j+1]) and (w[j], S, E)', () => {
    const run = { points: [{ x: 0, z: 0 }, { x: 1, z: 0 }] };
    const band = buildSafeDistanceBand(run, 2);
    assert.deepEqual(band.positions, [0, 0.005, 0, 1, 0.005, 0, 0, 0.005, 2, 1, 0.005, 2]);
    assert.deepEqual(band.indices, [0, 3, 1, 0, 2, 3]);
    assert.deepEqual(triangleYs(band), [2, 2]);
  });

  test('fewer than two distinct points give an empty band; coincident points merge; options set the lifts', () => {
    for (const points of [[], [{ x: 1, z: 2 }], [{ x: 1, z: 2 }, { x: 1, z: 2 }]]) {
      const band = buildSafeDistanceBand({ points }, 3);
      assert.deepEqual([band.positions, band.indices, band.outline, band.labelAnchor, band.totalSafeVertices], [[], [], [], null, 0]);
    }
    assert.equal(buildSafeDistanceBand(computeWallLayout([]), 3).positions.length, 0, 'an empty wall');
    const merged = buildSafeDistanceBand({ points: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 1, z: 0 }] }, 1, { lift: 0.1, lineLift: 0.3 });
    assert.equal(merged.positions.length / 3, 4);
    assert.equal(merged.positions[1], 0.1);
    assert.equal(merged.lineLift, 0.3);
  });

  test('bandRunOfLayout: the flatEdges points, facing +1, and the junction vertex in both of its sections', () => {
    const layout = computeWallLayout([section(0, 2, 500, 0), section(1, 3, 400, 5, 20)]);
    const run = bandRunOfLayout(layout);
    assert.equal(run.points.length, 6);
    assert.deepEqual(run.facing, [1, 1, 1, 1, 1]);
    assert.deepEqual(run.sectionOfVertex.map((s) => s.length), [1, 1, 2, 1, 1, 1]);
    assert.deepEqual(run.sectionOfVertex[2].map((s) => s.curveDeg), [0, 5]);
    assert.equal(run.sectionOfVertex[5][0].panelW, 0.4);
    assert.deepEqual(buildSafeDistanceBand(run, 2), buildSafeDistanceBand(layout, 2), 'the layout form wraps the run form');
  });
});

describe('buildSafeDistanceBand: mitre and clamp (08 6.9 worked cases)', () => {
  test('every mitred vertex is at distance d from both of its segment lines', () => {
    for (const config of [CONFIGS.concave_offsets, CONFIGS.convex, CONFIGS.mixed, CONFIGS.box_corner, CONFIGS.large_wall]) {
      const { layout, D } = configProject(config);
      const band = buildSafeDistanceBand(layout, D);
      const points = layout.flatEdges();
      assert.equal(band.outline.length, points.length, 'no split vertex in the configs');
      for (let k = 1; k < points.length - 1; k++) {
        const o = band.outline[k];
        const d0 = (o.x - points[k].x) * stageNormal(points[k - 1], points[k])[0] + (o.z - points[k].z) * stageNormal(points[k - 1], points[k])[1];
        const d1 = (o.x - points[k].x) * stageNormal(points[k], points[k + 1])[0] + (o.z - points[k].z) * stageNormal(points[k], points[k + 1])[1];
        assert.ok(Math.abs(d0 - d1) < 1e-9, `vertex ${k}: ${d0} vs ${d1}`);
        assert.ok(d0 <= D + 1e-12 && d0 > 0);
        assert.equal(band.colors[points.length + k], Math.abs(d0 - D) < 1e-12 ? 'threshold' : 'clamped');
      }
    }
  });

  test('concave30 (r < D, D = 1.88 m and 2.92 m): interior d = 0.499 / (2 tan 15°), ends d = r - 0.001, +Y, inside the circumcircle', () => {
    const layout = computeWallLayout(CONCAVE30);
    const points = layout.flatEdges();
    const r = 0.5 / (2 * Math.tan(Math.PI / 12));
    const R = 0.5 / (2 * Math.sin(Math.PI / 12));
    // The centre of curvature: the circumcentre of the first three wall points.
    const [a, b, c] = points;
    const den = 2 * (a.x * (b.z - c.z) + b.x * (c.z - a.z) + c.x * (a.z - b.z));
    const sq = (p) => p.x * p.x + p.z * p.z;
    const centre = { x: (sq(a) * (b.z - c.z) + sq(b) * (c.z - a.z) + sq(c) * (a.z - b.z)) / den,
      z: (sq(a) * (c.x - b.x) + sq(b) * (a.x - c.x) + sq(c) * (b.x - a.x)) / den };
    for (const p of points) assert.ok(Math.abs(Math.hypot(p.x - centre.x, p.z - centre.z) - R) < 1e-9, 'the wall lies on the circumcircle');
    for (const D of [1.88, 2.92]) {
      const band = buildSafeDistanceBand(layout, D);
      const ys = triangleYs(band);
      assert.equal(ys.length, 12);
      assert.ok(ys.every((y) => y > 0), `D ${D}: every kept triangle faces +Y with a positive area`);
      const d = offsetDistances(band, points);
      for (let k = 1; k < points.length - 1; k++) assert.ok(Math.abs(d[k] - (0.5 - SAFE_BAND_EPS) / (2 * Math.tan(Math.PI / 12))) < 1e-12, `interior ${k}`);
      for (const k of [0, points.length - 1]) assert.ok(Math.abs(d[k] - (r - SAFE_BAND_EPS)) < 1e-12, `end ${k}`);
      for (const o of band.outline) assert.ok(Math.hypot(o.x - centre.x, o.z - centre.z) <= R, 'no offset vertex beyond the circumradius');
      assert.equal(band.clampedVertices, 7);
      assert.equal(band.totalSafeVertices, 7);
      assert.ok(band.colors.slice(7).every((col) => col === 'clamped'));
    }
  });

  test('box_corner (D = 2.19 m): the corners and their neighbours clamp to 0.499 m, +Y, and the Back/Front overlap is present', () => {
    const { layout, D } = configProject(CONFIGS.box_corner);
    assert.ok(Math.abs(D - 2.1875) < 1e-3);
    const band = buildSafeDistanceBand(layout, D);
    const points = layout.flatEdges();
    assert.ok(triangleYs(band).every((y) => y > 0));
    const d = offsetDistances(band, points);
    const clampedAt = d.map((v, k) => (Math.abs(v - D) > 1e-12 ? k : -1)).filter((k) => k >= 0);
    assert.deepEqual(clampedAt, [5, 6, 7, 9, 10, 11], 'the two concave 90° corners (6, 10) and their panel neighbours');
    for (const k of clampedAt) assert.ok(Math.abs(d[k] - (0.5 - SAFE_BAND_EPS)) < 1e-12, `vertex ${k}: ${d[k]}`);
    assert.equal(band.clampedVertices, 6);
    // Out of scope (08 6.9, Q18): the Front band reaches over the Back wall, because D exceeds the 2 m opening. A future
    // trimmed offset polyline removes this overlap and changes this assertion deliberately.
    const n = wallCount(band);
    const front = [];
    for (let t = 0; t < band.indices.length; t += 3) {
      const tri = band.indices.slice(t, t + 3);
      const walls = tri.filter((i) => i < n);
      if (walls.some((i) => i >= 11 && i <= 15) && walls.every((i) => i >= 10 && i <= 16)) front.push(tri.map((i) => xz(band, i)));
    }
    const inside = (p, [a, b, c]) => {
      const s = (u, v, w) => (v[1] - u[1]) * (w[0] - u[0]) - (v[0] - u[0]) * (w[1] - u[1]);
      return s(a, b, p) > 0 && s(b, c, p) > 0 && s(c, a, p) > 0;
    };
    // The midpoints of the Back wall's panels (its edge points lie on the edges between the Front band's quads).
    const backMidpoints = points.slice(0, 6).map((p, k) => [(p.x + points[k + 1].x) / 2, (p.z + points[k + 1].z) / 2]);
    assert.ok(backMidpoints.filter((p) => front.some((tri) => inside(p, tri))).length >= 4, 'the Back wall lies inside the Front band');
  });

  test('concave_offsets: exactly three clamped vertices (2.416, 2.416, 2.58 m), coloured clamped; flat walls clamp nothing', () => {
    const { layout, D } = configProject(CONFIGS.concave_offsets);
    const band = buildSafeDistanceBand(layout, D);
    const d = offsetDistances(band, layout.flatEdges());
    const clamped = d.map((v, k) => [k, v]).filter(([, v]) => Math.abs(v - D) > 1e-12);
    assert.deepEqual(clamped.map(([k]) => k), [5, 6, 7], 'before, at and after the A -> B junction');
    assert.deepEqual(clamped.map(([, v]) => +v.toFixed(3)), [2.416, 2.416, 2.58]);
    assert.equal(band.clampedVertices, 3);
    assert.equal(band.totalSafeVertices, 16);
    const n = wallCount(band);
    assert.deepEqual(band.colors.slice(n).map((c, k) => (c === 'clamped' ? k : -1)).filter((k) => k >= 0), [5, 6, 7]);
    for (const config of [CONFIGS.flat3, CONFIGS.convex, CONFIGS.large_wall]) {
      const flat = configProject(config);
      assert.equal(buildSafeDistanceBand(flat.layout, flat.D).clampedVertices, 0);
    }
    const mixed = configProject(CONFIGS.mixed);
    const md = offsetDistances(buildSafeDistanceBand(mixed.layout, mixed.D), mixed.layout.flatEdges());
    assert.deepEqual(md.filter((v) => Math.abs(v - mixed.D) > 1e-12).map((v) => +v.toFixed(3)), [0.929, 0.929], 'mixed: the Wide -> Small junction and its neighbour');
  });

  test('a fold-back above 166° splits into two offset vertices; a sharp concave curve clamps to 0, never negative', () => {
    const run = { points: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0.2, z: 0.05 }] };
    const band = buildSafeDistanceBand(run, 0.5);
    assert.equal(band.totalSafeVertices, 4, 'the fold vertex has two offset vertices');
    assert.deepEqual(xz(band, 4), [1, 0.5], 'the first ends segment 0 along its own normal');
    assert.ok(triangleYs(band).every((y) => y > 0));
    const sharp = buildSafeDistanceBand(computeWallLayout([section(0, 3, 500, 180)]), 2);
    assert.ok(triangleYs(sharp).every((y) => y > 0));
    assert.ok(sharp.outline.every((o) => Number.isFinite(o.x) && Number.isFinite(o.z)), 'finite offsets');
    assert.ok(sharp.clampedVertices > 0);
  });

  test('facing -1 mirrors the band to the other side, still +Y', () => {
    const points = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0.2 }];
    const band = buildSafeDistanceBand({ points, facing: [-1, -1] }, 1);
    assert.deepEqual(band.outline[0], { x: 0, z: -1 }, 'offset along -m');
    band.outline.forEach((o, k) => assert.ok(o.z < points[k].z, `offset ${k} on the -m side`));
    assert.ok(triangleYs(band).every((y) => y > 0));
  });
});

describe('buildSafeDistanceBand: fuzz (08 8.4)', () => {
  test('10,000 random walls (1-4 sections, curves to ±60°, offsets to ±180°, D to 15 m): no -Y triangle', (t) => {
    const rand = rng(0x5afe);
    const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
    let triangles = 0, clamped = 0;
    for (let w = 0; w < 10000; w++) {
      const sections = [];
      for (let i = 0, n = int(1, 4); i < n; i++) {
        sections.push(section(i, int(1, 12), int(50, 1500), rand() < 0.3 ? 0 : (rand() * 120 - 60), rand() * 360 - 180));
      }
      const D = 0.05 + rand() * 14.95;
      const band = buildSafeDistanceBand(computeWallLayout(sections), D);
      for (const y of triangleYs(band)) {
        if (!(y > 0)) assert.fail(`wall #${w}: a triangle with doubled area ${y}`);
        triangles++;
      }
      assert.ok(band.positions.every(Number.isFinite), `wall #${w}: finite positions`);
      clamped += band.clampedVertices;
    }
    t.diagnostic(`${triangles} triangles, ${clamped} clamped offset vertices`);
    assert.ok(clamped > 1000, 'the clamp is exercised');
  });
});

describe('the safe-distance OBJ of a band (08 P2-5b; ObjExporter.writeSafeDistance)', () => {
  const OBJ = new ObjExporter({ brand: Brand, colorToRgb: () => ({ r: 1, g: 1, b: 1 }), builder: new WallMeshBuilder(Strategies.mesh.obj) });
  /** A duck-typed group of one mesh with the band's positions, its +Y normals and its indices. */
  const groupOf = (band) => {
    const attr = (values, itemSize) => ({ count: values.length / itemSize, getX: (i) => values[i * itemSize],
      getY: (i) => values[i * itemSize + 1], getZ: (i) => values[i * itemSize + 2] });
    const normals = [];
    for (let i = 0; i < band.positions.length / 3; i++) normals.push(0, 1, 0);
    const mesh = { isMesh: true, geometry: { attributes: { position: attr(band.positions, 3), normal: attr(normals, 3) },
      index: attr(band.indices, 1) } };
    return { traverse(cb) { cb(this); cb(mesh); cb({ isLine: true, geometry: {} }); } };
  };

  test('clamped bands carry the # Clamped: header line before the blank line; flat bands do not', () => {
    const { layout, D } = configProject(CONFIGS.concave_offsets);
    const band = buildSafeDistanceBand(layout, D);
    const text = OBJ.writeSafeDistance(groupOf(band), band);
    const header = Brand.safeDistanceObjHeader.slice(0, -1);
    assert.ok(text.startsWith(`${header}# Clamped: 3 of 16 offset vertices are closer than D = ${D.toFixed(2)} m (concave features)\n\n`));
    const flat = configProject(CONFIGS.flat3);
    const flatBand = buildSafeDistanceBand(flat.layout, flat.D);
    const flatText = OBJ.writeSafeDistance(groupOf(flatBand), flatBand);
    assert.ok(flatText.startsWith(`${Brand.safeDistanceObjHeader}v `));
    assert.ok(!flatText.includes('# Clamped'));
    assert.ok(!OBJ.writeSafeDistance(groupOf(band)).includes('# Clamped'), 'no band, no line');
  });

  test('one vn per vertex, faces f a//a, and every face passes the orientation check (08 criterion 22)', () => {
    for (const config of [CONFIGS.flat3, CONFIGS.concave_offsets, CONFIGS.box_corner, CONFIGS.convex]) {
      const { layout, D } = configProject(config);
      const band = buildSafeDistanceBand(layout, D);
      const text = OBJ.writeSafeDistance(groupOf(band), band);
      const lines = text.split('\n');
      assert.equal(lines.filter((l) => l.startsWith('vn ')).length, band.positions.length / 3);
      assert.ok(lines.filter((l) => l.startsWith('vn ')).every((l) => l === 'vn 0.000000 1.000000 0.000000'));
      const faces = lines.filter((l) => l.startsWith('f '));
      assert.equal(faces.length, band.indices.length / 3);
      assert.ok(faces.every((f) => f.split(' ').slice(1).every((c) => /^(\d+)\/\/\1$/.test(c))));
      const reports = checkObjText(text);
      assert.ok(reports.length > 0 && reports.every((r) => r.failures === 0), JSON.stringify(reports.map((r) => r.first)));
    }
  });
});
