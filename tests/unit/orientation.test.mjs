// Unit tests of the whole-wall orientation (docs/improvements/03-pivot.md section 12, the owner's request of
// 2026-10-17; 12.12). F3-O1: the domain (test 1: OrientationAlign, WallPivot.orientation, setAlign, setYawOffset,
// parseYawOffset, isIdentity, clone, equals). F3-O2: the geometry (tests 2-4: wallCentre, the alignment yaw, the turned
// stage and export layouts, yawShift and stageChange).
// Run: node --test tests/unit/orientation.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  OrientationAlign, ORIENTATION_ALIGNS, YAW_OFFSET_LIMIT_DEG, WallPivot,
} from '../../js/domain/Wall.js';
import { WallSection } from '../../js/domain/WallSection.js';
import { Project } from '../../js/domain/Project.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';
import {
  computeWallLayout, layoutProject, framingBounds, resolvePivot, stageChange, yawShift,
} from '../../js/geometry/WallLayout.js';
import { alignmentYawDeg, turnXZ, wallCentre, yawTrig } from '../../js/geometry/WallOrientation.js';
import { WallMeshBuilder } from '../../js/geometry/WallMeshBuilder.js';
import { CONFIGS } from '../regression/configs.mjs';
import { Events, EventBus } from '../../js/core/EventBus.js';
import { Palette, Brand } from '../../js/theme/Theme.js';
import { CineCamera } from '../../js/domain/CineCamera.js';
import { WallController } from '../../js/app/WallController.js';
import { PivotController } from '../../js/app/PivotController.js';
import { ObjExporter } from '../../js/io/ObjExporter.js';
import { GltfExporter } from '../../js/io/GltfExporter.js';

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

describe('03 12.12 test 1: the orientation domain (12.4)', () => {
  test('OrientationAlign, ORIENTATION_ALIGNS (select order), YAW_OFFSET_LIMIT_DEG and the default (none, 0)', () => {
    assert.deepEqual({ ...OrientationAlign }, { CENTER_NEG_X: 'center-neg-x', NONE: 'none' });
    assert.ok(Object.isFrozen(OrientationAlign));
    assert.deepEqual(ORIENTATION_ALIGNS, ['center-neg-x', 'none']);
    assert.ok(Object.isFrozen(ORIENTATION_ALIGNS));
    assert.equal(YAW_OFFSET_LIMIT_DEG, 180);
    assert.equal(WallPivot.DEFAULT_ALIGN, 'none', "this unit keeps 'none' (12.11)");
    const pivot = new WallPivot();
    assert.deepEqual(pivot.orientation, { align: 'none', yawOffsetDeg: 0 });
    assert.equal(pivot.isIdentity, true);
  });

  test('parseYawOffset: finite -> clamped to +-180 and rounded to 0.1 degree, never orDefault, -0 normalised; idempotent', () => {
    const cases = [['0', 0], ['', null], ['abc', null], [200, 180], [-200, -180], ['12.34', 12.3], [-0.04, 0], [NaN, null],
      ['180', 180], ['-180', -180], ['180.04', 180], [' 7 ', 7], ['30deg', 30], [Infinity, null], [-Infinity, null],
      [undefined, null], [null, null], [0.05, 0.1], [-0.05, 0], [-0.06, -0.1], ['-12.35', -12.3], ['1e9', 180], [90, 90]];
    for (const [raw, want] of cases) {
      const got = WallPivot.parseYawOffset(raw);
      assert.ok(Object.is(got, want), `parseYawOffset(${String(raw)}) = ${got}, want ${want}`);
    }
    const rand = rng(12);
    for (let i = 0; i < 2000; i++) {
      const x = (rand() - 0.5) * (i % 2 ? 500 : 3);
      const once = WallPivot.parseYawOffset(x);
      assert.ok(Object.is(WallPivot.parseYawOffset(once), once), `idempotent at ${x}`);
      assert.ok(Object.is(WallPivot.parseYawOffset(String(x)), once), `text and number agree at ${x}`);
    }
  });

  test('setAlign: a known alignment stores and reports the change, replacing the object; an unknown one throws RangeError', () => {
    const pivot = new WallPivot();
    const before = pivot.orientation;
    assert.equal(pivot.setAlign('none'), false);
    assert.equal(pivot.setAlign('center-neg-x'), true);
    assert.equal(pivot.orientation.align, 'center-neg-x');
    assert.notEqual(pivot.orientation, before, 'replaced, not mutated');
    assert.deepEqual(before, { align: 'none', yawOffsetDeg: 0 }, 'a snapshot of the old object keeps its values');
    assert.equal(pivot.setAlign('center-neg-x'), false);
    assert.throws(() => pivot.setAlign('left'), { name: 'RangeError', message: 'Unknown orientation alignment "left"' });
    assert.throws(() => pivot.setAlign(undefined), RangeError);
    assert.equal(pivot.orientation.align, 'center-neg-x', 'nothing stored on a throw');
    assert.equal(pivot.isIdentity, false);
  });

  test('setYawOffset: parses, writes back the stored value, replaces the object; a rejected value writes nothing', () => {
    const pivot = new WallPivot();
    assert.equal(pivot.setYawOffset('30'), 30);
    assert.equal(pivot.isIdentity, false, 'a yaw offset alone is not the identity');
    const kept = pivot.orientation;
    assert.equal(pivot.setYawOffset('abc'), 30, 'rejected text writes nothing and returns the stored value');
    assert.equal(pivot.setYawOffset(''), 30);
    assert.equal(pivot.orientation, kept, 'a rejected value does not replace the object');
    assert.equal(pivot.setYawOffset(200), 180);
    assert.ok(Object.is(pivot.setYawOffset('0'), 0), "'0' is a valid yaw offset (no B-L9 fallback)");
    assert.equal(pivot.isIdentity, true);
    assert.equal(pivot.setYawOffset(-12.34), -12.3);
    assert.deepEqual(pivot.orientation, { align: 'none', yawOffsetDeg: -12.3 });
  });

  test('isIdentity, clone and equals cover the orientation; keepStageLayout still does not count for isIdentity', () => {
    const pivot = new WallPivot();
    pivot.setMode('wall-center');
    pivot.setOffset({ x: 1, y: 2, z: 3 });
    pivot.setAlign('center-neg-x');
    pivot.setYawOffset(15);
    const copy = pivot.clone();
    assert.notEqual(copy.orientation, pivot.orientation, 'deep copy');
    assert.deepEqual({ ...copy }, { ...pivot });
    assert.ok(copy.equals(pivot) && pivot.equals(copy));
    for (const change of [(p) => p.setAlign('none'), (p) => p.setYawOffset(16)]) {
      const other = pivot.clone();
      change(other);
      assert.equal(other.equals(pivot), false);
    }
    const id = new WallPivot();
    id.setKeepStageLayout(false);
    assert.equal(id.isIdentity, true);
    id.setAlign('center-neg-x');
    assert.equal(id.isIdentity, false, 'an alignment is not the identity');
    id.setAlign('none');
    assert.equal(id.isIdentity, true);
  });
});

// ---- F3-O2: the geometry (03 12.2, 12.3; tests 2-4) ------------------------------------------------------------

/** The legacy import mapping (4976-4988), as geometry.test.mjs loads the harness configurations. */
function importSections(data) {
  return data.sections.map((s, i) => new WallSection({
    id: s.id !== undefined ? s.id : i,
    name: s.name || `Wall ${i + 1}`,
    panelCols: s.panel?.columns || 5,
    panelRows: s.panel?.rows || 3,
    panelWidth: s.panel?.width_mm || 500,
    panelHeight: s.panel?.height_mm || 500,
    ledX: s.led_resolution?.x || 32,
    ledY: s.led_resolution?.y || 32,
    curveIntensity: s.curvature?.angle_degrees || 0,
    angleOffset: s.curvature?.angle_offset_degrees || 0,
    color: s.color || '#00f0ff',
  }));
}

const section = (fields) => new WallSection({ ...WallSection.createDefault(), ...fields });
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);

/** A pivot with the given mode, offset and orientation. */
function pivotOf(mode = 'bottom-left', offset = { x: 0, y: 0, z: 0 }, align = 'none', yawOffset = 0) {
  const p = new WallPivot();
  p.setMode(mode);
  p.setOffset(offset);
  p.setAlign(align);
  p.setYawOffset(yawOffset);
  return p;
}

/** A project holding `sections` (replaceAll) and the given pivot. */
function projectOf(sections, pivot = new WallPivot()) {
  const project = Project.createDefault();
  project.wall.replaceAll(sections);
  project.wall.pivot = pivot;
  return project;
}

const DEFAULT_WALL = () => [WallSection.createDefault()];
const CONCAVE_EVEN = () => [section({ panelCols: 10, curveIntensity: 3 })];
const CONCAVE_ODD = () => [section({ panelCols: 5, curveIntensity: 5 })];
const objBuilder = new WallMeshBuilder(Strategies.mesh.obj);

describe('03 12.12 test 2: wallCentre (12.2)', () => {
  test('the default wall: the middle of column 3 on the floor, normal (-0, 0, 1)', () => {
    const c = wallCentre(computeWallLayout(DEFAULT_WALL()));
    assert.deepEqual(c.point, { x: 1.25, y: 0, z: 0 });
    assert.ok(Object.is(c.normal.x, -0) && c.normal.y === 0 && c.normal.z === 1, JSON.stringify(c.normal));
  });

  test('an even concave wall: the column edge in the middle, with the bisector of its two columns (15 and 18 degrees)', () => {
    const layout = computeWallLayout(CONCAVE_EVEN());
    const c = wallCentre(layout);
    assert.deepEqual(c.point, { x: layout.sections[0].edges[5].x, y: 0, z: layout.sections[0].edges[5].z });
    const h = 16.5 * Math.PI / 180;
    near(c.normal.x, -Math.sin(h), 1e-12, 'n.x');
    near(c.normal.z, Math.cos(h), 1e-12, 'n.z');
  });

  test('flat3: on a column edge of the middle section (the mean of two equal normals); a translated copy carries it along', () => {
    const layout = computeWallLayout(importSections(CONFIGS.flat3));
    const c = wallCentre(layout);
    assert.deepEqual(c.point, { x: 3.5, y: 0, z: 0 });
    assert.equal(c.normal.z, 1);
    const moved = wallCentre(layout.translated(-2, 0.5, 3));
    assert.deepEqual(moved.point, { x: 1.5, y: 0.5, z: 3 }, 'y is the baseY of the frame');
  });

  test('null for an empty wall, a zero-width wall and a non-finite wall', () => {
    assert.equal(wallCentre(computeWallLayout([])), null);
    assert.equal(wallCentre(computeWallLayout([section({ panelWidth: 0 })])), null);
    assert.equal(wallCentre(computeWallLayout([section({ panelWidth: NaN })])), null);
    assert.equal(alignmentYawDeg(computeWallLayout([])), 0);
  });

  test('yawTrig is exact at the quarter turns; turnXZ is R_y (three.js rotation.y)', () => {
    assert.deepEqual(yawTrig(0), { cos: 1, sin: 0 });
    assert.deepEqual(yawTrig(90), { cos: 0, sin: 1 });
    assert.deepEqual(yawTrig(180), { cos: -1, sin: 0 });
    assert.deepEqual(yawTrig(-90), { cos: 0, sin: -1 });
    assert.deepEqual(yawTrig(450), { cos: 0, sin: 1 });
    const t = yawTrig(30);
    near(t.cos, Math.cos(Math.PI / 6), 1e-15, 'cos 30');
    assert.deepEqual(turnXZ(0, 1, yawTrig(90)), { x: 1, z: 0 }, '+Z -> +X');
    assert.deepEqual(turnXZ(1, 0, yawTrig(90)), { x: 0, z: -1 }, '+X -> -Z');
  });
});

describe('03 12.12 test 3: the alignment yaw and the turned stage layout (12.2, 12.3)', () => {
  test('the worked check: the default flat wall needs exactly +90; with wall-center it lands on x = 0, z from +1.25 to -1.25', () => {
    assert.ok(Object.is(alignmentYawDeg(computeWallLayout(DEFAULT_WALL())), 90));
    const project = projectOf(DEFAULT_WALL(), pivotOf('wall-center', undefined, 'center-neg-x'));
    const layout = layoutProject(project);
    const r = layout.pivot.resolution;
    assert.equal(r.align, 'center-neg-x');
    assert.ok(Object.is(r.alignYawDeg, 90) && Object.is(r.yawDeg, 90) && r.yawOffsetDeg === 0);
    assert.equal(layout.pivot.yawDeg, 90);
    const edges = layout.sections[0].edges;
    assert.deepEqual(edges.map((e) => e.x), [0, 0, 0, 0, 0, 0], 'every edge exactly on x = 0');
    assert.deepEqual(edges.map((e) => e.z), [1.25, 0.75, 0.25, -0.25, -0.75, -1.25]);
    for (const p of layout.sections[0].panels) assert.equal(p.rotY, Math.PI / 2);
    const grid = objBuilder.sectionGrid(layout.sections[0]);
    for (let k = 0; k < grid.normals.length; k += 3) {
      assert.deepEqual([grid.normals[k], grid.normals[k + 1], grid.normals[k + 2]], [1, 0, 0], 'every LED normal exactly +X');
    }
    for (const p of layout.sections[0].panels) {
      const n = objBuilder.panelFacingNormal(p);
      near(n.x, 1, 1e-15, 'panel normal x');
      near(n.z, 0, 1e-15, 'panel normal z');
    }
  });

  test('symmetric concave walls (odd and even) with wall-center: the middle lies on -X, the centre normal is +X', () => {
    for (const sections of [CONCAVE_ODD(), CONCAVE_EVEN()]) {
      const layout = layoutProject(projectOf(sections, pivotOf('wall-center', undefined, 'center-neg-x')));
      const c = wallCentre(layout);
      near(c.point.z, 0, 1e-12, 'centre z');
      assert.ok(c.point.x < -0.1, `centre x ${c.point.x} on -X, behind the pivot`);
      near(c.normal.x, 1, 1e-12, 'n.x');
      near(c.normal.z, 0, 1e-12, 'n.z');
    }
  });

  test('asymmetric and multi-section walls: the turned centre normal is +X in every pivot mode', () => {
    for (const key of ['concave_offsets', 'mixed', 'box_corner', 'convex', 'large_wall']) {
      for (const mode of ['bottom-left', 'mesh-center', 'wall-center']) {
        const layout = layoutProject(projectOf(importSections(CONFIGS[key]), pivotOf(mode, { x: 0.3, y: 0, z: -0.2 }, 'center-neg-x')));
        const n = wallCentre(layout).normal;
        near(n.x, 1, 1e-12, `${key} ${mode} n.x`);
        near(n.z, 0, 1e-12, `${key} ${mode} n.z`);
      }
    }
    const box = resolvePivot(computeWallLayout(importSections(CONFIGS.box_corner)), pivotOf('wall-center', undefined, 'center-neg-x'));
    near(box.alignYawDeg, 180, 1e-9, 'box_corner turns by 180');
  });

  test('the yaw offset adds to the alignment and wraps; with none the offset alone; an empty wall turns by the offset', () => {
    const raw = computeWallLayout(DEFAULT_WALL());
    assert.equal(resolvePivot(raw, pivotOf('bottom-left', undefined, 'center-neg-x', 30)).yawDeg, 120);
    assert.equal(resolvePivot(raw, pivotOf('bottom-left', undefined, 'center-neg-x', 100)).yawDeg, -170);
    const none = resolvePivot(raw, pivotOf('bottom-left', undefined, 'none', -45));
    assert.equal(none.alignYawDeg, 0);
    assert.equal(none.yawDeg, -45);
    const empty = resolvePivot(computeWallLayout([]), pivotOf('wall-center', undefined, 'center-neg-x', 12.5));
    assert.equal(empty.alignYawDeg, 0);
    assert.equal(empty.yawDeg, 12.5);
    const id = resolvePivot(raw, new WallPivot());
    assert.ok(Object.is(id.yawDeg, 0) && id.align === 'none' && id.alignYawDeg === 0);
  });

  test('a turned stage layout keeps lengths, heights and baseY; the turn is about the stage origin (the pivot on the floor)', () => {
    const sections = importSections(CONFIGS.mixed);
    const plain = layoutProject(projectOf(sections, pivotOf('mesh-center', { x: 1, y: 0.5, z: -2 })));
    const turned = layoutProject(projectOf(sections, pivotOf('mesh-center', { x: 1, y: 0.5, z: -2 }, 'none', 37)));
    const t = yawTrig(37);
    turned.sections.forEach((sl, i) => {
      const ref = plain.sections[i];
      assert.equal(sl.baseY, ref.baseY);
      sl.edges.forEach((e, k) => {
        const want = turnXZ(ref.edges[k].x, ref.edges[k].z, t);
        near(e.x, want.x, 1e-12, 'edge x');
        near(e.z, want.z, 1e-12, 'edge z');
        near(e.angle, ref.edges[k].angle - 37 * Math.PI / 180, 1e-15, 'heading');
      });
      sl.panels.forEach((p, k) => {
        assert.equal(p.y, ref.panels[k].y);
        near(p.rotY, ref.panels[k].rotY + 37 * Math.PI / 180, 1e-15, 'rotY');
      });
    });
  });
});

describe('03 12.12 test 4: frames under a yaw (12.3)', () => {
  test('export = stage - (0, P.y, 0) for the grids and the panel corners, with a yaw, in all three modes', () => {
    const sections = importSections(CONFIGS.concave_offsets);
    for (const mode of ['bottom-left', 'mesh-center', 'wall-center']) {
      const pivot = pivotOf(mode, { x: 0.5, y: 1, z: 2 }, 'center-neg-x', -20);
      const project = projectOf(sections, pivot);
      const stage = layoutProject(project);
      const exp = layoutProject(project, { frame: 'export' });
      const Py = stage.pivot.resolution.point.y;
      stage.sections.forEach((sl, i) => {
        const a = objBuilder.sectionGrid(sl).positions;
        const b = objBuilder.sectionGrid(exp.sections[i]).positions;
        for (let k = 0; k < a.length; k += 3) {
          near(b[k], a[k], 1e-12, 'x');
          near(b[k + 1], a[k + 1] - Py, 1e-12, 'y');
          near(b[k + 2], a[k + 2], 1e-12, 'z');
        }
        sl.panels.forEach((p, k) => {
          const ca = objBuilder.panelCorners(p, sl.panelW, sl.panelH);
          const cb = objBuilder.panelCorners(exp.sections[i].panels[k], sl.panelW, sl.panelH);
          ca.forEach((c, j) => {
            near(cb[j].x, c.x, 1e-12, 'corner x');
            near(cb[j].y, c.y - Py, 1e-12, 'corner y');
            near(cb[j].z, c.z, 1e-12, 'corner z');
          });
        });
      });
      assert.equal(layoutProject(project, { frame: 'layout' }).pivot.yawDeg, 0, 'the layout frame is never turned');
    }
  });

  test('the identity orientation keeps the walk itself; rotated() requires the raw walk', () => {
    const project = projectOf(DEFAULT_WALL(), pivotOf('bottom-left', undefined, 'none', 0));
    const raw = computeWallLayout(project.wall.sections);
    const out = layoutProject(project);
    assert.equal(out.pivot.yawDeg, 0);
    assert.deepEqual(out.sections[0].edges, raw.sections[0].edges);
    const stub = computeWallLayout(project.wall.sections, { postTransforms: [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]] });
    assert.throws(() => stub.rotated(90), /rotated\(\) expects the raw walk/);
  });

  test('the framing of a turned layout: the stage extent is unchanged, the facing turns by the yaw, wallZ is the turned walk start', () => {
    const sections = importSections(CONFIGS.concave_offsets);
    const plain = framingBounds(layoutProject(projectOf(sections, pivotOf('wall-center'))));
    const turnedLayout = layoutProject(projectOf(sections, pivotOf('wall-center', undefined, 'none', 50)));
    const turned = framingBounds(turnedLayout);
    near(turned.stageExtent.width, plain.stageExtent.width, 1e-9, 'width');
    near(turned.stageExtent.height, plain.stageExtent.height, 1e-12, 'height');
    const f = turnXZ(plain.facing.x, plain.facing.z, yawTrig(50));
    near(turned.facing.x, f.x, 1e-12, 'facing x');
    near(turned.facing.z, f.z, 1e-12, 'facing z');
    near(turned.wallZ, turnedLayout.firstEdge.z, 1e-12, 'wallZ: the z of the turned walk start');
    assert.equal(plain.wallZ, 0 - turnedLayout.pivot.resolution.stageOrigin.z, 'unturned: 0 - stageOrigin.z, as before');
  });

  test('yawShift and stageChange: the rigid map of 12.6 (s_b = R(dpsi) s_a + R(psi_b)(O_a - O_b)); null counts as the identity', () => {
    const raw = computeWallLayout(DEFAULT_WALL());
    const a = resolvePivot(raw, pivotOf('bottom-left'));
    const b = resolvePivot(raw, pivotOf('wall-center', undefined, 'center-neg-x'));
    assert.equal(yawShift(a, b), 90);
    assert.equal(yawShift(null, null), 0);
    const c = stageChange(a, b);
    assert.equal(c.yawDeg, 90);
    assert.deepEqual([c.cos, c.sin], [0, 1]);
    // a stage point s_a of the old map: its layout point, expressed in the new map, equals R(90) s_a + (dx, dz)
    for (const s of [{ x: 2, z: 3 }, { x: -1, z: 0.5 }]) {
      const L = { x: s.x + a.stageOrigin.x, z: s.z + a.stageOrigin.z };
      const want = turnXZ(L.x - b.stageOrigin.x, L.z - b.stageOrigin.z, yawTrig(90));
      const got = turnXZ(s.x, s.z, c);
      near(got.x + c.dx, want.x, 1e-12, 'x');
      near(got.z + c.dz, want.z, 1e-12, 'z');
    }
    const pure = stageChange(a, resolvePivot(raw, pivotOf('wall-center')));
    assert.equal(pure.yawDeg, 0);
    assert.ok(Object.is(pure.dx, -1.25) && Object.is(pure.dz, -0), 'a pure shift is -stageShift exactly');
  });
});

describe('03 12.3: the composition contract under a turn (spec 02 builds S_i from the turned section frame)', () => {
  /** spec 02's stub of 03 test 8: a matrix from the section's own edges and baseY (20 degrees about the chord midpoint, a
   *  shift along the chord basis). */
  function stubOffset(sl) {
    const f = sl.edges[0], l = sl.edges[sl.edges.length - 1];
    const o = { x: (f.x + l.x) / 2, y: sl.baseY, z: (f.z + l.z) / 2 };
    const len = Math.hypot(l.x - f.x, l.z - f.z) || 1;
    const u = { x: (l.x - f.x) / len, z: (l.z - f.z) / len };
    const n = { x: -u.z, z: u.x };
    const a = 20 * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const t = { x: 0.3 * u.x - 0.4 * n.x, y: 0.2, z: 0.3 * u.z - 0.4 * n.z };
    return (p) => {
      const dx = p.x - o.x, dz = p.z - o.z;
      return { x: o.x + c * dx + s * dz + t.x, y: p.y + t.y, z: o.z - s * dx + c * dz + t.z };
    };
  }

  test('building the stub on the turned layout equals building it on the raw walk, then translating and turning', () => {
    for (const key of ['concave_offsets', 'mixed', 'box_corner']) {
      const sections = importSections(CONFIGS[key]);
      const raw = computeWallLayout(sections);
      for (const yawOffset of [0, 37, -120]) {
        const project = projectOf(sections, pivotOf('wall-center', { x: 0.5, y: 0.25, z: -1 }, 'center-neg-x', yawOffset));
        for (const frame of ['stage', 'export']) {
          const out = layoutProject(project, { frame });
          const t = out.pivot.translation;
          const trig = yawTrig(out.pivot.yawDeg);
          out.sections.forEach((sl, i) => {
            const onTurned = stubOffset(sl);
            const onRaw = stubOffset(raw.sections[i]);
            const pts = objBuilder.sectionGrid(raw.sections[i]).positions;
            const moved = objBuilder.sectionGrid(sl).positions;
            for (let k = 0; k < pts.length; k += 3) {
              const v = onRaw({ x: pts[k], y: pts[k + 1], z: pts[k + 2] });
              const want = turnXZ(v.x + t.x, v.z + t.z, trig);
              const got = onTurned({ x: moved[k], y: moved[k + 1], z: moved[k + 2] });
              near(got.x, want.x, 1e-12, `${key} ${yawOffset} ${frame} x`);
              near(got.y, v.y + t.y, 1e-12, `${key} ${yawOffset} ${frame} y`);
              near(got.z, want.z, 1e-12, `${key} ${yawOffset} ${frame} z`);
            }
          });
        }
      }
    }
  });
});

// ---- 03 12.12 tests 5-8 (consumers): re-expression, controller, Reset and presets, exports ----------------------------

/** A real WallController + PivotController over `project`, with a real CineCamera as the one StageAnchored participant. */
function controllerRig(project) {
  const bus = new EventBus();
  const events = [];
  bus.on(Events.WALL_PIVOT_CHANGED, (p) => events.push(p));
  const view = { calls: 0, rebuild() { this.calls++; } };
  const wc = new WallController({
    project, view, ledTiles: { clearCache() {} }, orbit: { updateCameraPosition() {} }, hub: { refresh() {} },
    bus, palette: Palette, dialogs: { alert() {} },
  });
  wc.rebuild({ cause: 'init' });
  const cam = project.camera;
  const anchored = { id: 'camera', translateStage: (dx, dz) => cam.translateStage(dx, dz), reexpressStage: (c) => cam.reexpressStage(c) };
  const marker = { exists: true, hasResolution: true, visible: true, pickMeshes: () => [], setPreview() {}, clearPreview() {} };
  const interaction = { isDraggingGizmo: false, gestureCancelled: false, pilotMode: false, snap: { pivotM: 0.1 } };
  const selection = { id: null, isSelected() { return false; }, select() {}, deselect() {} };
  const gizmo = { mode: 'translate', setMode() {}, setSnapIncrements() {} };
  const pc = new PivotController({ project, wallController: wc, markerView: marker, stageAnchored: [anchored], selection, gizmo, interaction, bus });
  return { wc, pc, view, events };
}

/** The camera position in the wall's own (layout) frame: R_y(-psi)(s) + O, and its pan relative to the wall. */
function camInWall(project, wc) {
  const r = wc.pivotResolution;
  const c = project.camera;
  const t = turnXZ(c.posX, c.posZ, yawTrig(-r.yawDeg));
  return { x: t.x + r.stageOrigin.x, z: t.z + r.stageOrigin.z, pan: c.rotY - r.yawDeg };
}

const mod360 = (v) => ((v % 360) + 360) % 360;

describe('03 12.12 tests 5-6: Keep stage layout re-expresses rigidly; the controller rows F3-6 and F3-7', () => {
  test('align, yaw offset and pivot edits with keep on leave the camera in place relative to the wall', () => {
    const project = projectOf([section({ panelCols: 6, curveIntensity: 4 })], pivotOf('bottom-left'));
    const { wc, pc } = controllerRig(project);
    Object.assign(project.camera, { posX: 1.7, posZ: 4.2, rotY: 12 });
    const before = camInWall(project, wc);
    pc.setAlign('center-neg-x');
    pc.setYawOffset('30');
    pc.setMode('wall-center');
    pc.setOffsetAxis('x', '0.4');
    const after = camInWall(project, wc);
    near(after.x, before.x, 1e-9, 'x in the wall frame');
    near(after.z, before.z, 1e-9, 'z in the wall frame');
    const dPan = mod360(after.pan - before.pan);
    assert.ok(dPan < 1e-9 || 360 - dPan < 1e-9, `pan relative to the wall: ${dPan}`);
  });

  test('setAlign: one rebuild, WALL_PIVOT_CHANGED {align, yawShiftDeg: 90}; a no-op emits nothing; keep off keeps coordinates', () => {
    const project = projectOf(DEFAULT_WALL(), pivotOf('wall-center'));
    const { pc, view, events } = controllerRig(project);
    const calls = view.calls;
    pc.setAlign('center-neg-x');
    assert.equal(view.calls, calls + 1);
    assert.equal(events.at(-1).source, 'align');
    assert.equal(events.at(-1).yawShiftDeg, 90);
    const n = events.length;
    pc.setAlign('center-neg-x');
    assert.equal(events.length, n, 'no-op');
    pc.setKeepStageLayout(false);
    const pos = [project.camera.posX, project.camera.posZ];
    assert.equal(pc.setYawOffset('200'), 180);
    assert.deepEqual([project.camera.posX, project.camera.posZ], pos, 'keep off: coordinates kept');
  });

  test('a pivot drag under psi = 90: a stage +X drag of 0.3 m commits a layout offset z of +0.3', () => {
    const project = projectOf(DEFAULT_WALL(), pivotOf('wall-center', undefined, 'center-neg-x'));
    const { pc } = controllerRig(project);
    pc.beginGizmoDrag();
    pc.applyGizmoTranslate({ x: 0.3, y: 0, z: 0 }, {});
    pc.endGizmoDrag({ cancel: false });
    assert.deepEqual({ ...project.wall.pivot.offset }, { x: 0, y: 0, z: 0.3 });
  });
});

describe('03 12.12 test 7: Reset, the posZ fallback and the presets angle', () => {
  test('the aligned default wall: Reset at (5, 1.5, 0), pan 90, tilt atan2(-0.75, 5); presets face from +X', () => {
    const project = projectOf(DEFAULT_WALL(), pivotOf('wall-center', undefined, 'center-neg-x'));
    const f = framingBounds(layoutProject(project));
    assert.equal(f.aligned, true);
    assert.equal(f.viewYawDeg, 90);
    const cam = new CineCamera();
    cam.resetTo(f);
    assert.deepEqual([cam.posX, cam.posY, cam.posZ, cam.rotY, cam.rotZ], [5, 1.5, 0, 90, 0]);
    near(cam.rotX, Math.atan2(-0.75, 5) * 180 / Math.PI, 1e-12, 'tilt');
    assert.equal(f.frontZ, 0, 'a non-numeric Z puts the camera on the centre normal');
    assert.equal(cam.setField('posZ', 'abc', { wallZ: f.wallZ, frontZ: f.frontZ }), 0);
  });

  test('the identity keeps the legacy framing: viewYawDeg 0, frontZ = wallZ + 5, Reset unchanged', () => {
    const f = framingBounds(layoutProject(projectOf(DEFAULT_WALL())));
    assert.equal(f.aligned, false);
    assert.equal(f.viewYawDeg, 0);
    assert.equal(f.frontZ, 5);
    const cam = new CineCamera();
    cam.resetTo(f);
    assert.deepEqual([cam.posX, cam.posY, cam.posZ, cam.rotX, cam.rotY], [1.25, 0.75, 5, 0, 0]);
  });
});

describe('03 12.12 test 8: the export metadata of a turned wall', () => {
  const rgb = () => ({ r: 1, g: 1, b: 1 });
  const objExporter = new ObjExporter({ brand: Brand, colorToRgb: rgb, builder: new WallMeshBuilder(Strategies.mesh.obj) });
  const gltfExporter = new GltfExporter({ brand: Brand, colorToRgb: rgb, builder: new WallMeshBuilder(Strategies.mesh.gltf) });

  test('the OBJ # Orientation: line and the glTF orientation extras appear iff psi != 0; vertices on x = 0, normals +X', () => {
    const turned = projectOf(DEFAULT_WALL(), pivotOf('wall-center', undefined, 'center-neg-x'));
    const layout = layoutProject(turned, { frame: 'export' });
    const obj = objExporter.write({ sections: turned.wall.sections, meshMode: 'combined', layout }).objContent;
    assert.match(obj, /^# Orientation: yaw 90\.000000 deg about \+Y through the pivot \(align center-neg-x: 90\.000000 deg \+ offset 0\.000000 deg\)$/m);
    for (const m of obj.matchAll(/^v (\S+) \S+ \S+$/gm)) assert.equal(m[1], '0.000000', 'x = 0');
    for (const m of obj.matchAll(/^vn (\S+) (\S+) (\S+)$/gm)) assert.deepEqual([m[1], m[2], m[3]], ['1.000000', '0.000000', '0.000000']);
    const gltf = gltfExporter.write({ sections: turned.wall.sections, meshMode: 'section', layout });
    const doc = typeof gltf === 'string' ? JSON.parse(gltf) : (gltf.gltf ?? gltf);
    assert.deepEqual(doc.scenes[0].extras.pivot.orientation, { align: 'center-neg-x', yaw_deg: 90, align_yaw_deg: 90, yaw_offset_deg: 0 });
    const flat = projectOf(DEFAULT_WALL(), pivotOf('wall-center'));
    const obj0 = objExporter.write({ sections: flat.wall.sections, meshMode: 'combined', layout: layoutProject(flat, { frame: 'export' }) }).objContent;
    assert.doesNotMatch(obj0, /# Orientation:/);
  });
});
