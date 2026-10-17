// Unit tests of Feature 3's geometry (docs/improvements/03-pivot.md 8.1, tests 1-9; 03 T2): the anchors of 6.1, the
// pivot resolution and stage shift of 6.2, layoutProject's frames (6.3, 5.1), WallLayout.translated (6.4), the
// 'flat-pivot' framing bounds (6.6, step A) and the composition contract with spec 02 (5.10 #2, the equivariance test
// spec 02 reruns as its E17). Test 3's fuzzed identity part lives in geometry.test.mjs, next to the fuzzer.
// Run: node --test tests/unit/pivot.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { WallSection } from '../../js/domain/WallSection.js';
import { PivotMode, PIVOT_MODES, WallPivot } from '../../js/domain/Wall.js';
import { Project } from '../../js/domain/Project.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';
import {
  computeWallLayout, layoutProject, framingBounds, resolvePivot, stageShift, SectionLayout, WallLayout,
} from '../../js/geometry/WallLayout.js';
import { WallMeshBuilder } from '../../js/geometry/WallMeshBuilder.js';
import { CONFIGS } from '../regression/configs.mjs';

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

/** The seven harness walls of 6.8: the default wall and the six configurations. */
const WALLS = {
  default: [WallSection.createDefault()],
  ...Object.fromEntries(Object.entries(CONFIGS).map(([name, data]) => [name, importSections(data)])),
};

/** 6.8's anchor table (4 dp; the unit-test oracle values), layout frame. mesh-center is on the floor (owner, 2026-10-17). */
const ANCHORS = {
  default:         { 'bottom-left': [0, 0, 0], 'wall-center': [1.25, 0, 0], 'mesh-center': [1.25, 0, 0] },
  flat3:           { 'bottom-left': [0, 0, 0], 'wall-center': [3.5, 0, 0], 'mesh-center': [3.5, 0, 0] },
  concave_offsets: { 'bottom-left': [0, 0, 0], 'wall-center': [2.5960, 0, 2.3397], 'mesh-center': [2.5960, 0, 2.3397] },
  convex:          { 'bottom-left': [0, 0, 0], 'wall-center': [1.8779, 0, -0.6102], 'mesh-center': [1.8779, 0, -0.6102] },
  mixed:           { 'bottom-left': [0, 0, 0], 'wall-center': [4.6976, 0, 0.9830], 'mesh-center': [4.6976, 0, 0.9830] },
  box_corner:      { 'bottom-left': [0, 0, 0], 'wall-center': [0, 0, 1.5], 'mesh-center': [1.5, 0, 1.5] },
  large_wall:      { 'bottom-left': [0, 0, 0], 'wall-center': [36.0745, 0, 13.1300], 'mesh-center': [36.0745, 0, 13.1300] },
};

const near = (a, b, eps) => Math.abs(a - b) <= eps;
const nearVec = (p, q, eps, label) => {
  for (const k of ['x', 'y', 'z']) assert.ok(near(p[k], q[k], eps), `${label}.${k}: ${p[k]} vs ${q[k]}`);
};
const vec = ([x, y, z]) => ({ x, y, z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** A pivot with the given mode and offset. */
function pivotOf(mode, offset = { x: 0, y: 0, z: 0 }) {
  const p = new WallPivot();
  p.setMode(mode);
  p.setOffset(offset);
  return p;
}

/** A project holding `sections` (replaceAll) and the given pivot. */
function projectOf(sections, pivot = new WallPivot()) {
  const project = Project.createDefault();
  project.wall.replaceAll(sections);
  project.wall.pivot = pivot;
  return project;
}

const gltfBuilder = new WallMeshBuilder(Strategies.mesh.gltf);
const objBuilder = new WallMeshBuilder(Strategies.mesh.obj);

/** Every builder position of a layout (glTF profile, section grids in order) as {x, y, z}. */
function gridPoints(layout, builder = gltfBuilder) {
  const out = [];
  for (const sl of layout.sections) {
    const p = builder.sectionGrid(sl).positions;
    for (let k = 0; k < p.length; k += 3) out.push({ x: p[k], y: p[k + 1], z: p[k + 2] });
  }
  return out;
}

/** Every panel corner of a layout (the panel-mode exports). */
function cornerPoints(layout, builder = objBuilder) {
  const out = [];
  for (const sl of layout.sections) for (const panel of sl.panels) out.push(...builder.panelCorners(panel, sl.panelW, sl.panelH));
  return out;
}

const OFFSETS = [{ x: 0.5, y: 1, z: 2 }, { x: -3, y: 0.25, z: -1.5 }];

// ---- 1. anchors ---------------------------------------------------------------------------------------------------

describe('03 test 1: pivotPoint anchors (6.1, 6.8)', () => {
  test('the 6.8 table within 1e-4 for the seven harness walls and the three modes', () => {
    for (const [name, sections] of Object.entries(WALLS)) {
      const layout = computeWallLayout(sections);
      for (const mode of PIVOT_MODES) nearVec(layout.pivotPoint(mode), vec(ANCHORS[name][mode]), 1e-4, `${name} ${mode}`);
    }
  });

  test('layout frame: every mode returns y with Object.is(y, 0) (all three are floor modes); unknown modes throw RangeError', () => {
    for (const sections of Object.values(WALLS)) {
      const layout = computeWallLayout(sections);
      assert.ok(Object.is(layout.pivotPoint(PivotMode.BOTTOM_LEFT).y, 0));
      assert.ok(Object.is(layout.pivotPoint(PivotMode.WALL_CENTER).y, 0));
      assert.ok(Object.is(layout.pivotPoint(PivotMode.MESH_CENTER).y, 0), 'mesh-center sits on the floor (owner, 2026-10-17)');
      assert.deepEqual(layout.pivotPoint(PivotMode.BOTTOM_LEFT), { x: 0, y: 0, z: 0 });
      assert.throws(() => layout.pivotPoint('middle'), { name: 'RangeError', message: 'Unknown pivot mode "middle"' });
    }
  });

  test('an empty wall gives null in every mode', () => {
    for (const mode of PIVOT_MODES) assert.equal(computeWallLayout([]).pivotPoint(mode), null);
  });

  test('mesh-center is the generativeBounds x/z centre on the floor (y0 = sections[0].baseY), whatever the heights (6.1)', () => {
    const layout = computeWallLayout([section({ panelRows: 3 }), section({ id: 1, panelRows: 5, panelHeight: 400 })]);
    assert.deepEqual(layout.generativeBounds(), layout.bounds());
    const b = layout.generativeBounds();
    assert.ok(near(b.max.y, 2.0, 1e-12), 'the box still spans the tallest section');
    assert.deepEqual(layout.pivotPoint(PivotMode.MESH_CENTER), { x: (b.min.x + b.max.x) / 2, y: 0, z: (b.min.z + b.max.z) / 2 });
    const moved = layout.translated(1, 2, 3).pivotPoint(PivotMode.MESH_CENTER);
    assert.deepEqual(moved, { x: (b.min.x + b.max.x) / 2 + 1, y: 2, z: (b.min.z + b.max.z) / 2 + 3 }, 'y follows the floor (baseY)');
  });
});

// ---- 2. resolvePivot and stageShift -------------------------------------------------------------------------------

describe('03 test 2: resolvePivot and stageShift (6.2)', () => {
  test('P = anchor + offset; stageOrigin = (P.x, 0, P.z); the resolution copies mode and offset', () => {
    for (const [name, sections] of Object.entries(WALLS)) {
      const layout = computeWallLayout(sections);
      for (const mode of PIVOT_MODES) {
        for (const o of OFFSETS) {
          const pivot = pivotOf(mode, o);
          const r = resolvePivot(layout, pivot);
          const a = layout.pivotPoint(mode);
          assert.equal(r.mode, mode);
          assert.deepEqual(r.offset, o);
          assert.notEqual(r.offset, pivot.offset, 'a copy');
          assert.deepEqual(r.anchor, a);
          assert.deepEqual(r.point, add(a, o), `${name} ${mode}`);
          assert.deepEqual(r.stageOrigin, { x: r.point.x, y: 0, z: r.point.z });
          assert.ok(Object.is(r.stageOrigin.y, 0));
        }
      }
    }
  });

  test('non-finite walls: null where the anchor is not finite, a resolution in bottom-left', () => {
    // bounds() skips NaN coordinates (03 8.1 test 2 as corrected by 03 T2). mesh-center reads only the plan extent of the
    // box since it sits on the floor (owner, 2026-10-17): a NaN panel height leaves it finite, and with a NaN width the
    // finite first edge alone spans the box; only a wall without grid vertices gives the empty box
    const nanWidth = computeWallLayout([section({ panelWidth: NaN })]);
    assert.equal(resolvePivot(nanWidth, pivotOf('wall-center')), null);
    assert.deepEqual(resolvePivot(nanWidth, pivotOf('mesh-center')).point, { x: 0, y: 0, z: 0 });
    assert.deepEqual(resolvePivot(nanWidth, pivotOf('bottom-left')).point, { x: 0, y: 0, z: 0 });
    const nanHeight = computeWallLayout([section({ panelHeight: NaN })]);
    assert.deepEqual(resolvePivot(nanHeight, pivotOf('mesh-center')).point, { x: 1.25, y: 0, z: 0 });
    assert.deepEqual(resolvePivot(nanHeight, pivotOf('bottom-left')).point, { x: 0, y: 0, z: 0 });
    const nanBoth = computeWallLayout([section({ panelWidth: NaN, panelHeight: NaN })]);
    assert.equal(resolvePivot(nanBoth, pivotOf('wall-center')), null);
    assert.deepEqual(resolvePivot(nanBoth, pivotOf('mesh-center')).point, { x: 0, y: 0, z: 0 });
    const noVertices = computeWallLayout([section({ panelCols: -1, panelRows: -1 })]);
    assert.equal(resolvePivot(noVertices, pivotOf('mesh-center')), null, 'the empty box of a wall without grid vertices');
  });

  test('an empty wall resolves to the anchor (0, 0, 0) plus the offset (non-null)', () => {
    const r = resolvePivot(computeWallLayout([]), pivotOf('mesh-center', { x: 1, y: 2, z: 3 }));
    assert.deepEqual(r.anchor, { x: 0, y: 0, z: 0 });
    assert.deepEqual(r.point, { x: 1, y: 2, z: 3 });
    assert.deepEqual(r.stageOrigin, { x: 1, y: 0, z: 3 });
  });

  test('stageShift(null, null) is (0, 0); stageShift(a, b) = so(b) - so(a); null counts as the origin', () => {
    assert.deepEqual(stageShift(null, null), { x: 0, z: 0 });
    const layout = computeWallLayout(WALLS.concave_offsets);
    const a = resolvePivot(layout, pivotOf('bottom-left'));
    const b = resolvePivot(layout, pivotOf('wall-center', { x: 0, y: 5, z: 2 }));
    const s = stageShift(a, b);
    assert.ok(near(s.x, 2.5960, 1e-4) && near(s.z, 4.3397, 1e-4), JSON.stringify(s));
    assert.deepEqual(stageShift(null, b), { x: b.stageOrigin.x, z: b.stageOrigin.z });
    assert.deepEqual(stageShift(b, null), { x: 0 - b.stageOrigin.x, z: 0 - b.stageOrigin.z });
    const yOnly = resolvePivot(layout, pivotOf('bottom-left', { x: 0, y: 3, z: 0 }));
    assert.deepEqual(stageShift(a, yOnly), { x: 0, z: 0 }, 'a height-only change does not move the stage origin');
  });
});

// ---- 3. layoutProject frames --------------------------------------------------------------------------------------

describe('03 test 3: layoutProject frames (6.3)', () => {
  test('identity pivot: the raw walk itself (translated() is never called), Object.is on every number, pivot block', () => {
    const original = WallLayout.prototype.translated;
    WallLayout.prototype.translated = () => { throw new Error('the identity path must not translate'); };
    try {
      for (const [name, sections] of Object.entries(WALLS)) {
        for (const frame of ['stage', 'export', 'layout']) {
          const out = layoutProject(projectOf(sections), { frame });
          const raw = computeWallLayout(sections);
          out.sections.forEach((sl, i) => {
            assert.equal(sl.section, sections[i]);
            sl.edges.forEach((e, k) => { for (const key of ['x', 'z', 'angle']) assert.ok(Object.is(e[key], raw.sections[i].edges[k][key]), `${name} ${frame}`); });
            sl.panels.forEach((p, k) => { for (const key of ['x', 'y', 'z', 'rotY']) assert.ok(Object.is(p[key], raw.sections[i].panels[k][key])); });
            assert.ok(Object.is(sl.baseY, 0));
          });
          assert.equal(out.pivot.frame, frame);
          assert.deepEqual(out.pivot.resolution.point, { x: 0, y: 0, z: 0 });
          const t = out.pivot.translation;
          assert.ok(t.x === 0 && t.y === 0 && t.z === 0);
        }
      }
    } finally {
      WallLayout.prototype.translated = original;
    }
  });

  test('the default frame is the stage frame; an unknown frame throws RangeError', () => {
    const project = projectOf(WALLS.default, pivotOf('wall-center'));
    assert.equal(layoutProject(project).pivot.frame, 'stage');
    assert.throws(() => layoutProject(project, { frame: 'world' }), { name: 'RangeError', message: 'Unknown layout frame "world"' });
  });

  test('stage translation (-P.x, 0, -P.z), export -P, layout 0; a null resolution translates nothing', () => {
    const project = projectOf(WALLS.concave_offsets, pivotOf('mesh-center', { x: 0.5, y: 1, z: 2 }));
    const r = resolvePivot(computeWallLayout(project.wall.sections), project.wall.pivot);
    assert.deepEqual(layoutProject(project).pivot.translation, { x: -r.point.x, y: 0, z: -r.point.z });
    assert.deepEqual(layoutProject(project, { frame: 'export' }).pivot.translation, { x: -r.point.x, y: -r.point.y, z: -r.point.z });
    assert.deepEqual(layoutProject(project, { frame: 'layout' }).pivot.translation, { x: 0, y: 0, z: 0 });
    for (const frame of ['stage', 'export', 'layout']) assert.deepEqual(layoutProject(project, { frame }).pivot.resolution, r);
    const nan = projectOf([section({ panelWidth: NaN })], pivotOf('wall-center'));
    const out = layoutProject(nan, { frame: 'export' });
    assert.equal(out.pivot.resolution, null);
    assert.deepEqual(out.pivot.translation, { x: 0, y: 0, z: 0 });
  });
});

// ---- 4. translated() ------------------------------------------------------------------------------------------------

describe('03 test 4: WallLayout.translated (6.4)', () => {
  test('edges, panels and baseY are shifted exactly; angles and rotY unchanged; section fields copied', () => {
    for (const [name, sections] of Object.entries(WALLS)) {
      const raw = computeWallLayout(sections);
      const [dx, dy, dz] = [-1.25, 0.75, 3.5];
      const copy = raw.translated(dx, dy, dz);
      assert.ok(copy instanceof WallLayout && copy !== raw);
      copy.sections.forEach((sl, i) => {
        const o = raw.sections[i];
        assert.ok(sl instanceof SectionLayout);
        for (const key of ['section', 'sectionIndex', 'sectionId', 'panelW', 'panelH', 'isFlat']) assert.ok(Object.is(sl[key], o[key]), `${name}.${key}`);
        assert.equal(sl.postTransform, null);
        assert.ok(Object.is(sl.baseY, o.baseY + dy));
        sl.edges.forEach((e, k) => assert.deepEqual(e, { x: o.edges[k].x + dx, z: o.edges[k].z + dz, angle: o.edges[k].angle }));
        sl.panels.forEach((p, k) => {
          const q = o.panels[k];
          assert.deepEqual(p, { x: q.x + dx, y: q.y + dy, z: q.z + dz, rotY: q.rotY, col: q.col, row: q.row, sectionIndex: q.sectionIndex });
        });
        assert.notEqual(sl.edges, o.edges);
      });
      assert.deepEqual(raw.sections.map((sl) => sl.baseY), raw.sections.map(() => 0), 'the original is untouched');
    }
  });

  test('bounds(), generativeBounds() and pivotPoint(m) of the copy equal the originals shifted, in all three modes', () => {
    for (const [name, sections] of Object.entries(WALLS)) {
      const raw = computeWallLayout(sections);
      const d = { x: 2.5, y: -0.5, z: -7 };
      const copy = raw.translated(d.x, d.y, d.z);
      for (const which of ['bounds', 'generativeBounds']) {
        const a = raw[which](), b = copy[which]();
        nearVec(b.min, add(a.min, d), 1e-12, `${name}.${which}.min`);
        nearVec(b.max, add(a.max, d), 1e-12, `${name}.${which}.max`);
      }
      for (const mode of PIVOT_MODES) nearVec(copy.pivotPoint(mode), add(raw.pivotPoint(mode), d), 1e-12, `${name} ${mode}`);
    }
  });

  test('with offsets: pivotPoint of the stage layout is A - O = (-o.x, A.y, -o.z), of the export layout A - P = -o', () => {
    for (const name of ['default', 'concave_offsets', 'box_corner']) {
      for (const mode of PIVOT_MODES) {
        for (const o of OFFSETS) {
          const project = projectOf(WALLS[name], pivotOf(mode, o));
          const A = computeWallLayout(WALLS[name]).pivotPoint(mode);
          nearVec(layoutProject(project).pivotPoint(mode), { x: -o.x, y: A.y, z: -o.z }, 1e-12, `${name} ${mode} stage`);
          nearVec(layoutProject(project, { frame: 'export' }).pivotPoint(mode), { x: -o.x, y: -o.y, z: -o.z }, 1e-12, `${name} ${mode} export`);
        }
      }
    }
  });

  test('the precondition: a non-null postTransform throws; a raw layout gives null postTransforms', () => {
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 9, 9, 9, 1];
    const withPost = computeWallLayout([section({}), section({ id: 1 })], { postTransforms: [null, m] });
    assert.throws(() => withPost.translated(1, 0, 0),
      { name: 'Error', message: 'translated() expects the raw walk: apply section offsets after the pivot translation' });
    const copy = computeWallLayout(WALLS.mixed).translated(1, 2, 3);
    assert.ok(copy.sections.every((sl) => sl.postTransform === null));
    assert.equal(copy.pivot, null, 'the pivot block is set by layoutProject only');
  });
});

// ---- 5. frames of the builder output -------------------------------------------------------------------------------

describe('03 test 5: export = stage - (0, P.y, 0) for the grids and the panel corners (5.1)', () => {
  test('sectionGrid positions and panelCorners, all three modes, with offsets', () => {
    for (const name of ['default', 'convex', 'mixed']) {
      for (const mode of PIVOT_MODES) {
        for (const o of [{ x: 0, y: 0, z: 0 }, ...OFFSETS]) {
          const project = projectOf(WALLS[name], pivotOf(mode, o));
          const stage = layoutProject(project);
          const exp = layoutProject(project, { frame: 'export' });
          const Py = stage.pivot.resolution.point.y;
          const [gs, ge] = [gridPoints(stage), gridPoints(exp)];
          assert.equal(gs.length, ge.length);
          gs.forEach((p, i) => nearVec(ge[i], sub(p, { x: 0, y: Py, z: 0 }), 1e-9, `${name} ${mode} grid[${i}]`));
          const [cs, ce] = [cornerPoints(stage), cornerPoints(exp)];
          cs.forEach((p, i) => nearVec(ce[i], sub(p, { x: 0, y: Py, z: 0 }), 1e-9, `${name} ${mode} corner[${i}]`));
        }
      }
    }
  });

  test('mesh-center on the default wall: the export grid y range is [0, 1.5] (on the floor); Offset Y 0.75 gives [-0.75, 0.75]', () => {
    const ys = (layout) => gridPoints(layout).map((p) => p.y);
    const range = (layout) => [Math.min(...ys(layout)), Math.max(...ys(layout))];
    const first = (layout) => { const p = gridPoints(layout)[0]; return `v ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}`; };
    const project = projectOf(WALLS.default, pivotOf('mesh-center'));
    assert.deepEqual(range(layoutProject(project, { frame: 'export' })), [0, 1.5]);
    assert.deepEqual(range(layoutProject(project)), [0, 1.5]);
    assert.equal(first(layoutProject(project, { frame: 'export' })), 'v -1.250000 0.000000 0.000000');
    const raised = projectOf(WALLS.default, pivotOf('mesh-center', { x: 0, y: 0.75, z: 0 }));
    assert.deepEqual(range(layoutProject(raised, { frame: 'export' })), [-0.75, 0.75]);
    assert.deepEqual(range(layoutProject(raised)), [0, 1.5], 'the stage grid stands on the floor');
    assert.equal(first(layoutProject(raised, { frame: 'export' })), 'v -1.250000 -0.750000 0.000000');
  });

  test('wall-center on the default wall: the first export vertex is (-1.25, 0, 0) (6.8)', () => {
    const project = projectOf(WALLS.default, pivotOf('wall-center'));
    const first = gridPoints(layoutProject(project, { frame: 'export' }))[0];
    assert.equal(`v ${first.x.toFixed(6)} ${first.y.toFixed(6)} ${first.z.toFixed(6)}`, 'v -1.250000 0.000000 0.000000');
    const raised = projectOf(WALLS.default, pivotOf('wall-center', { x: 0, y: 0, z: 2 }));
    const p = gridPoints(layoutProject(raised, { frame: 'export' }))[0];
    assert.equal(`v ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}`, 'v -1.250000 0.000000 -2.000000');
  });
});

// ---- 6. framingBounds 'layout' (step F = 08 P2-11c; the 'flat-pivot' case of step A is deleted) -------------------------

describe("03 test 6: framingBounds 'layout' (6.6 step F = 08 P2-11c)", () => {
  test("Strategies.framingBounds is 'layout'", () => {
    assert.equal(Strategies.framingBounds, 'layout');
  });

  test('the framing of the stage layout follows the stage origin; wallZ is +0 at the identity, 0 - stageOrigin.z otherwise', () => {
    for (const sections of Object.values(WALLS)) {
      const f = framingBounds(layoutProject(projectOf(sections)));
      assert.ok(Object.is(f.wallZ, 0), 'never -0 at the identity');
      assert.deepEqual(Object.keys(f), ['generativeBox', 'wallBox', 'stageExtent', 'facing', 'wallZ', 'centre', 'aligned', 'viewYawDeg', 'frontZ']);
    }
    for (const name of ['concave_offsets', 'box_corner', 'mixed']) {
      const identity = framingBounds(layoutProject(projectOf(WALLS[name])));
      const project = projectOf(WALLS[name], pivotOf('wall-center'));
      const r = resolvePivot(computeWallLayout(project.wall.sections), project.wall.pivot);
      const f = framingBounds(layoutProject(project));
      assert.ok(Object.is(f.wallZ, 0 - r.stageOrigin.z), name);
      nearVec(f.generativeBox.center, {
        x: identity.generativeBox.center.x - r.stageOrigin.x, y: identity.generativeBox.center.y, z: identity.generativeBox.center.z - r.stageOrigin.z,
      }, 1e-12, `${name} centre`);
      assert.ok(near(f.stageExtent.width, identity.stageExtent.width, 1e-12), `${name}: a translation keeps the width`);
    }
  });
});

// ---- 8. composition contract ----------------------------------------------------------------------------------------

/**
 * A stub of spec 02's section-offset builder (02 6.5): the matrix is derived from the section's own edges and baseY
 * (origin = chord midpoint at baseY, basis from the chord), rotating the section 20 degrees about that origin's Y axis
 * and then translating it by (0.3, 0.2, -0.4) along the chord basis.
 * @returns {(p: {x, y, z}) => {x, y, z}}
 */
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

describe('03 test 8: composition contract (5.10 #2; spec 02 reruns it as E17)', () => {
  test('building the stub on translated(t) equals building it on the raw walk and then applying T(t)', () => {
    for (const name of ['default', 'concave_offsets', 'mixed', 'box_corner']) {
      const raw = computeWallLayout(WALLS[name]);
      for (const mode of PIVOT_MODES) {
        for (const o of OFFSETS) {
          const project = projectOf(WALLS[name], pivotOf(mode, o));
          for (const frame of ['stage', 'export']) {
            const out = layoutProject(project, { frame });
            const t = out.pivot.translation;
            out.sections.forEach((sl, i) => {
              const onTranslated = stubOffset(sl);
              const onRaw = stubOffset(raw.sections[i]);
              const pts = gltfBuilder.sectionGrid(raw.sections[i]).positions;
              const moved = gltfBuilder.sectionGrid(sl).positions;
              for (let k = 0; k < pts.length; k += 3) {
                const v = { x: pts[k], y: pts[k + 1], z: pts[k + 2] };
                const w = { x: moved[k], y: moved[k + 1], z: moved[k + 2] };
                nearVec(onTranslated(w), add(onRaw(v), t), 1e-12, `${name} ${mode} ${frame}`);
              }
            });
          }
        }
      }
    }
  });
});

// ---- 9. B-L1 migration ------------------------------------------------------------------------------------------------

test('03 test 9: the B-L1 between-panels migration (skipped: the owner kept the convention, 6.9; 08 Q10)', { skip: 'no between-panels branch exists (B-L1 decided 2026-10-16: kept)' }, () => {});

// ---- 6 (consumers, step F = 08 P2-11c): flat walls at the identity keep the legacy 'flat' values ----------------------

/** A minimal THREE for OrbitController (Vector3 with set; the main camera is a plain object). */
class Vec3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
globalThis.window = { THREE: { Vector3: Vec3 } };
const { OrbitController } = await import('../../js/interaction/OrbitController.js');
const { CineCamera } = await import('../../js/domain/CineCamera.js');
const { analyzeCoverage } = await import('../../js/geometry/FrustumCoverage.js');

/** Seeded walls of 0..4 sections with numeric fields (zeros, fractions, negative curves and offsets). */
function seededWalls(seed, count) {
  let state = seed >>> 0;
  const rand = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const walls = [];
  for (let w = 0; w < count; w++) {
    const n = Math.floor(rand() * 5);
    const sections = [];
    for (let i = 0; i < n; i++) {
      sections.push(section({ id: i, panelCols: pick([0, 1, 2, 5, 7, 12]), panelRows: pick([0, 1, 3, 4]),
        panelWidth: pick([500, 250, 333.3, 1000]), panelHeight: pick([500, 562.5, 250]),
        curveIntensity: pick([0, -0, 5, -7.25, 18, 3.5]), angleOffset: pick([0, 15, -20, 90]) }));
    }
    walls.push(sections);
  }
  return walls;
}

/** The Phase-1 'flat' consumer expressions (03 6.6, the oracle of the identity proof). */
const LEGACY = {
  flat(sections) {
    let totalWidth = 0, maxHeight = 0;
    for (const s of sections) {
      totalWidth += s.panelCols * s.panelWidth * 0.001;
      maxHeight = Math.max(maxHeight, s.panelRows * s.panelHeight * 0.001);
    }
    return { totalWidth, maxHeight };
  },
  target: (b, off) => [b.totalWidth / 2 + off.x, b.maxHeight / 2 + off.y, off.z],
  reset: (b) => ({ posX: b.totalWidth / 2, posY: b.maxHeight / 2, posZ: 5 }),
  safeDistance(cam, b) {
    const hFov = cam.hFov(), vFov = cam.vFov();
    return Math.min(b.totalWidth / (2 * Math.tan(hFov / 2)), b.maxHeight / (2 * Math.tan(vFov / 2)));
  },
};

describe("03 test 6 (consumers, step F = 08 P2-11c): flat walls along +X at the identity keep the legacy 'flat' values", () => {
  // 08 P2-11a: the coverage is the analyser's (frustum-coverage.test.mjs). 08 P2-11c: the orbit target, Reset and D read
  // the 'layout' framing; for a flat wall along +X at the identity they are the legacy values (bit for bit when the walk's
  // sums are exact, as for the harness walls; within 1e-12 m for widths such as 333.3 mm).
  test('the orbit target (x and y, z up to the sign of zero), resetTo and the safe distance', () => {
    const offsets = [{ x: 0, y: 0, z: 0 }, { x: -0, y: -0, z: -0 }, { x: 1.5, y: -2.25, z: 0.75 }, { x: -3, y: 0.5, z: -0 }];
    const poses = [[0, 1.5, 5], [1.25, 0.75, 1.5], [-2, 0, 0.1], [10, 3, 25], [-0, -0, -0]];
    // the seeded walls made flat along +X (curve 0, offset 0) with positive counts
    const flatWalls = [WALLS.default, WALLS.flat3, ...seededWalls(0x3a3a, 300)
      .map((ss) => ss.map((x) => section({ ...x, curveIntensity: 0, angleOffset: 0 })))
      .filter((ss) => ss.length > 0 && ss.every((x) => x.panelCols > 0 && x.panelRows > 0))];
    let checks = 0;
    for (const sections of flatWalls) {
      const exact = sections === WALLS.default || sections === WALLS.flat3;
      const eq = (a, b, label) => assert.ok(exact ? Object.is(a, b) : near(a, b, 1e-12), `${label}: ${a} vs ${b}`);
      const f = framingBounds(layoutProject(projectOf(sections)));
      const flat = LEGACY.flat(sections);
      for (const off of offsets) {
        const orbit = new OrbitController({ sceneManager: null, keyboard: null, interaction: null, frameBounds: () => f });
        orbit.offset.set(off.x, off.y, off.z);
        orbit.updateTargetPosition();
        const [x, y, z] = LEGACY.target(flat, off);
        eq(orbit.target.x, x, 'target x');
        eq(orbit.target.y, y, 'target y');
        assert.ok(orbit.target.z === z, 'target z');
        checks++;
      }
      for (const [posX, posY, posZ] of poses) {
        const cam = new CineCamera();
        Object.assign(cam, { posX, posY, posZ });
        eq(cam.maxSafeDistance(f.stageExtent), LEGACY.safeDistance(cam, flat), 'safeDistance');
        cam.resetTo(f);
        const r = LEGACY.reset(flat);
        eq(cam.posX, r.posX, 'posX');
        eq(cam.posY, r.posY, 'posY');
        assert.ok(Object.is(cam.posZ, 5) && Object.is(cam.rotY, 0), 'posZ 5, rotY +0');
        checks++;
      }
    }
    assert.ok(checks > 500, `${checks} checks`);
  });

  test("off the identity: the target and Reset follow the stage origin; the analyser's distance is to the moved wall (6.5, 6.8)", () => {
    const project = projectOf(WALLS.default, pivotOf('wall-center', { x: 0, y: 0, z: 2 }));
    const layout = layoutProject(project);
    const f = framingBounds(layout);
    assert.equal(f.wallZ, -2);
    const orbit = new OrbitController({ sceneManager: null, keyboard: null, interaction: null, frameBounds: () => f });
    orbit.updateTargetPosition();
    assert.deepEqual([orbit.target.x, orbit.target.y, orbit.target.z], [0, 0.75, -2], 'the centre of the translated flat wall');
    const cam = new CineCamera();
    cam.resetTo(f);
    assert.deepEqual([cam.posX, cam.posY, cam.posZ], [0, 0.75, 3], '5 m in front of the wall plane');
    assert.equal(analyzeCoverage(layout, cam, { hFov: cam.hFov(), vFov: cam.vFov() }, f.stageExtent).distance, 5);
    assert.ok(Object.is(cam.setField('posZ', '0', { wallZ: f.wallZ }), 0));
    assert.equal(cam.setField('posZ', '-5', { wallZ: f.wallZ }), -5, 'no minimum since step F (Q13)');
    assert.equal(cam.setField('posZ', '', { wallZ: f.wallZ }), 3, 'r3(wallZ + 5)');
  });
});
