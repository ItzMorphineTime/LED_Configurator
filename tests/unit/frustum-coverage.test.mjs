// Unit tests of geometry/FrustumCoverage.js, the rotation-aware coverage analyser of 08 P2-11a (B-M10 fixed;
// docs/improvements/08-bugfix-roadmap.md 6.10 and the P2-11 row of 8.4), and of the WallLayout geometry it reads
// (columnQuads, worldVertices, extentAcross, chordFacing): unrotated poses on flat3 reproduce the legacy coverage numbers
// and status bit for bit (except a frame entirely off the wall), a 90-degree pan and a camera behind the wall are offWall,
// box-corner hits pick the nearest quad, the projected-quad overlap catches a frame that crosses a column without a ray
// hit, the corner depths are camera-space depths (the far corner is the hit point), the quads are memoised and follow a
// postTransform, and the whole analysis is equivariant under a rotation of wall and camera about the vertical axis (no
// assumption that the wall runs along +X facing +Z).
// Run: node --test tests/unit/frustum-coverage.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { WallSection } from '../../js/domain/WallSection.js';
import { CineCamera } from '../../js/domain/CineCamera.js';
import { Project } from '../../js/domain/Project.js';
import { computeWallLayout, layoutProject } from '../../js/geometry/WallLayout.js';
import {
  analyzeCoverage, cameraBasis, frameDistance, nearestHit, quadOverlapsFrame, FRAME_CORNERS, MAX_FRUSTUM_DEPTH_M,
} from '../../js/geometry/FrustumCoverage.js';

const same = (a, b, label) => assert.ok(Object.is(a, b), `${label}: ${a} vs ${b}`);
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);

/** One section (500 mm panels unless given). */
const section = (id, fields) => new WallSection({ ...WallSection.createDefault(), id, name: `S${id}`, ...fields });

/** The harness flat3 wall: 4 + 6 + 4 flat columns of 500 mm, 3 rows (7 x 1.5 m). */
const FLAT3 = [
  section(0, { panelCols: 4, panelRows: 3 }),
  section(1, { panelCols: 6, panelRows: 3 }),
  section(2, { panelCols: 4, panelRows: 3 }),
];

/** A project with the given sections (identity pivot). */
function projectOf(sections) {
  const project = Project.createDefault();
  project.wall.replaceAll(sections);
  return project;
}

/** A camera with the given lens and pose. */
function camera({ fw = 36, fh = 24, focal = 35, pos = [0, 1.5, 5], rot = [0, 0, 0] } = {}) {
  const cam = new CineCamera();
  Object.assign(cam, {
    filmbackWidth: fw, filmbackHeight: fh, focalLength: focal,
    posX: pos[0], posY: pos[1], posZ: pos[2], rotX: rot[0], rotY: rot[1], rotZ: rot[2],
  });
  return cam;
}

const lensOf = (cam) => ({ hFov: cam.hFov(), vFov: cam.vFov() });

/** calculateFrustumIntersection 2473-2531 without the DOM (the legacy flat-rectangle test, identity pivot). */
function legacyCoverage(cam, sections) {
  const hFov = 2 * Math.atan(cam.filmbackWidth / (2 * cam.focalLength));
  const vFov = 2 * Math.atan(cam.filmbackHeight / (2 * cam.focalLength));
  const distToWall = cam.posZ;
  const frameWidth = 2 * Math.tan(hFov / 2) * distToWall;
  const frameHeight = 2 * Math.tan(vFov / 2) * distToWall;
  let totalWallWidth = 0, maxWallHeight = 0;
  sections.forEach((s) => {
    totalWallWidth += s.panelCols * s.panelWidth * 0.001;
    maxWallHeight = Math.max(maxWallHeight, s.panelRows * s.panelHeight * 0.001);
  });
  const frameLeft = cam.posX - frameWidth / 2;
  const frameRight = cam.posX + frameWidth / 2;
  const frameBottom = cam.posY - frameHeight / 2;
  const frameTop = cam.posY + frameHeight / 2;
  const within = frameLeft >= 0 && frameRight <= totalWallWidth && frameBottom >= 0 && frameTop <= maxWallHeight;
  const fits = frameWidth <= totalWallWidth && frameHeight <= maxWallHeight;
  const status = within ? 'within' : (fits ? 'offCenter' : 'exceeds');
  const offWall = frameRight < 0 || frameLeft > totalWallWidth || frameTop < 0 || frameBottom > maxWallHeight;
  return { frameWidth, frameHeight, status, offWall, width: totalWallWidth, height: maxWallHeight, frameLeft, frameRight, frameBottom, frameTop };
}

/** The column-major 4x4 matrix of a rotation by `deg` about +Y (three.js sign: +X goes to -Z for +90). */
function rotationY(deg) {
  const r = deg * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

/** A layout with the same postTransform injected into every section (the Feature 2 seam). */
const transformedLayout = (sections, m) => computeWallLayout(sections, { postTransforms: sections.map(() => m) });

describe('08 P2-11a: FrustumCoverage.analyzeCoverage', () => {
  test('flat3, unrotated poses over a grid: the legacy numbers and status bit for bit, except a frame off the wall', () => {
    const layout = layoutProject(projectOf(FLAT3));
    let compared = 0, offWall = 0;
    for (const [fw, fh, focal] of [[36, 24, 35], [30, 20, 50], [24.89, 18.66, 18]]) {
      for (const x of [-3.1, -0.4, 1.75, 3.5, 5.2, 7.3, 10.9]) {
        for (const y of [0, 0.75, 1.42, 2.6, 4.9]) {
          for (const z of [0.5, 1, 2.5, 5, 12.3, 20]) {
            const cam = camera({ fw, fh, focal, pos: [x, y, z] });
            const legacy = legacyCoverage(cam, FLAT3);
            const got = analyzeCoverage(layout, cam, lensOf(cam), { width: legacy.width, height: legacy.height });
            same(got.distance, z, 'D0 = posZ');
            same(got.frameWidth, legacy.frameWidth, 'frameWidth');
            same(got.frameHeight, legacy.frameHeight, 'frameHeight');
            if (legacy.offWall) {
              assert.equal(got.status, 'offWall', `entirely off the wall at (${x}, ${y}, ${z})`);
              offWall++;
            } else {
              assert.equal(got.status, legacy.status, `status at (${x}, ${y}, ${z}) ${fw}x${fh}@${focal}`);
              compared++;
            }
          }
        }
      }
    }
    assert.ok(compared > 300 && offWall > 50, `the grid reaches every case (${compared} compared, ${offWall} off the wall)`);
  });

  test('beside the half circle (the 03 6.6 wall, legacy Reset pose): D0 is the plane of the column the axis passes closest to', () => {
    const layout = computeWallLayout([section(0, { panelCols: 10, curveIntensity: 18 })]);
    const cam = camera({ pos: [2.5, 0.75, 5] });
    const got = analyzeCoverage(layout, cam, lensOf(cam), { width: 5, height: 1.5 });
    // column 3's plane passes 0.07 m in front of the camera (6.10's rule 2 would take it); column 1 is the closest column
    near(got.distance, 3.3746, 1e-4, 'D0');
    assert.equal(got.status, 'exceeds', 'the frame overlaps the arc and is taller than the wall');
  });

  test('a frame entirely above the wall and one wider than the whole wall', () => {
    const layout = layoutProject(projectOf(FLAT3));
    const above = camera({ pos: [3.5, 6, 1] });
    assert.equal(legacyCoverage(above, FLAT3).status, 'offCenter', 'legacy: fits, so off-center');
    assert.equal(analyzeCoverage(layout, above, lensOf(above), { width: 7, height: 1.5 }).status, 'offWall');
    const wide = camera({ pos: [3.5, 0.75, 20] });
    assert.equal(analyzeCoverage(layout, wide, lensOf(wide), { width: 7, height: 1.5 }).status, 'exceeds');
  });

  test('a 90-degree pan from the reset pose is offWall (08 AC 40); its frame size is still measured on the wall plane', () => {
    const project = projectOf(FLAT3);
    const layout = layoutProject(project);
    const cam = camera({ pos: [3.5, 0.75, 5], rot: [0, 90, 0] });
    const got = analyzeCoverage(layout, cam, lensOf(cam), { width: 7, height: 1.5 });
    assert.equal(got.status, 'offWall');
    assert.equal(got.distance, null, 'looking along -X: no wall plane ahead');
    assert.deepEqual([got.frameWidth, got.frameHeight], [null, null]);
    assert.deepEqual(got.cornerDepths, [15, 15, 15, 15]);
  });

  test('a camera behind the wall facing it is offWall with D0 = null (only front-facing quads count)', () => {
    const layout = layoutProject(projectOf([WallSection.createDefault()]));
    const cam = camera({ pos: [1.25, 0.75, -3], rot: [0, 180, 0] });
    const got = analyzeCoverage(layout, cam, lensOf(cam), { width: 2.5, height: 1.5 });
    assert.equal(got.status, 'offWall');
    assert.equal(got.distance, null);
    assert.deepEqual(got.cornerHits, [false, false, false, false]);
    const front = camera({ pos: [1.25, 0.75, 1] });
    assert.equal(analyzeCoverage(layout, front, lensOf(front), { width: 2.5, height: 1.5 }).status, 'within');
  });

  test('tilt 90 (looking straight up, cam_10_clamps) has no wall plane ahead: offWall', () => {
    const layout = layoutProject(projectOf(FLAT3));
    const cam = camera({ pos: [3.5, 0, 1], rot: [90, 0, 0] });
    const got = analyzeCoverage(layout, cam, lensOf(cam), { width: 7, height: 1.5 });
    assert.equal(got.status, 'offWall');
    assert.equal(got.distance, null);
  });

  test('a rotated camera: D0 is the optical-axis distance to the wall plane, not posZ (cam_08_rotation)', () => {
    const layout = layoutProject(projectOf(FLAT3));
    const cam = camera({ fw: 30, fh: 20, pos: [2.5, 1.8, 4], rot: [5, -10, 2] });
    const got = analyzeCoverage(layout, cam, lensOf(cam), { width: 7, height: 1.5 });
    const f = cameraBasis(5, -10, 2).forward;
    near(got.distance, 4 / -f.z, 1e-12, 'D0 = posZ / cos(pan) cos(tilt)');
    assert.equal(got.status, 'exceeds');
  });

  test('box-corner hits pick the nearest quad', () => {
    // Back along +X, Side along +Z at x = 3 (facing -X), Front along -X at z = 2 (facing -Z)
    const sections = [
      section(0, { panelCols: 6, panelRows: 3 }),
      section(1, { panelCols: 4, panelRows: 3, angleOffset: 90 }),
      section(2, { panelCols: 6, panelRows: 3, angleOffset: 90 }),
    ];
    const layout = computeWallLayout(sections);
    const quads = layout.columnQuads();
    // From inside the box looking down -Z: the Front section (z = 2, facing -Z) is behind, the Back (z = 0) ahead
    const o = { x: 1.5, y: 0.75, z: 1 };
    same(nearestHit(o, { x: 0, y: 0, z: -1 }, quads), 1, 'the back wall, 1 m ahead');
    // Looking +X from inside: the Side section at x = 3 faces -X, 1.5 m ahead
    near(nearestHit(o, { x: 1, y: 0, z: 0 }, quads), 1.5, 1e-12, 'the side wall');
    // Behind the Front section (outside the box at z = 3) looking -Z: the Front's back face is skipped, the Back's front
    // face (z = 0) is hit through it at t = 3, so no nearer hit exists
    near(nearestHit({ x: 1.5, y: 0.75, z: 3 }, { x: 0, y: 0, z: -1 }, quads), 3, 1e-12, 'back faces never count');
  });

  test('a wide, short frame across a tall column touches the wall with no ray hit (projected-quad overlap)', () => {
    // One tall narrow column (0.2 m x 10 m) centred on x = 0; a wide, short frame whose rays all miss it
    const sections = [section(0, { panelCols: 1, panelRows: 20, panelWidth: 200, panelHeight: 500 })];
    const layout = computeWallLayout(sections);
    const quads = layout.columnQuads();
    const cam = camera({ fw: 100, fh: 2, focal: 35, pos: [0.1 + 1.2, 5, 1] });   // frame 2.86 m x 0.06 m, centre at x 1.3
    const got = analyzeCoverage(layout, cam, lensOf(cam), { width: 0.2, height: 10 });
    assert.deepEqual(got.cornerHits, [false, false, false, false], 'no corner hits the column');
    assert.equal(nearestHit({ x: cam.posX, y: cam.posY, z: cam.posZ }, cameraBasis(0, 0, 0).forward, quads), null, 'nor the centre');
    assert.ok(quadOverlapsFrame(quads[0], { x: cam.posX, y: cam.posY, z: cam.posZ }, cameraBasis(0, 0, 0),
      Math.tan(cam.hFov() / 2), Math.tan(cam.vFov() / 2)), 'the projected column crosses the frame');
    assert.equal(got.status, 'exceeds', 'it touches the wall (not offWall); the frame is wider than the column');
    const away = camera({ fw: 100, fh: 2, focal: 35, pos: [5, 5, 1] });
    assert.equal(analyzeCoverage(layout, away, lensOf(away), { width: 0.2, height: 10 }).status, 'offWall');
  });

  test('corner depths are camera-space depths: the far corner (sx·tx·z, sy·ty·z, -z) is the hit point', () => {
    const layout = layoutProject(projectOf(FLAT3));
    const cam = camera({ pos: [3.2, 0.8, 1.2], rot: [3, -12, 4] });
    const got = analyzeCoverage(layout, cam, lensOf(cam), { width: 7, height: 1.5 });
    assert.deepEqual(got.cornerHits, [true, true, true, true]);
    const { forward: f, right: r, up: u } = cameraBasis(cam.rotX, cam.rotY, cam.rotZ);
    const tx = Math.tan(cam.hFov() / 2), ty = Math.tan(cam.vFov() / 2);
    FRAME_CORNERS.forEach(({ sx, sy }, c) => {
      const z = got.cornerDepths[c];
      // camera space (sx·tx·z, sy·ty·z, -z) -> world: o + x·r + y·u + z·f
      const w = ['x', 'y', 'z'].map((k) => cam[`pos${k.toUpperCase()}`] + sx * tx * z * r[k] + sy * ty * z * u[k] + z * f[k]);
      near(w[2], 0, 1e-9, `corner ${c} lies on the wall plane z = 0`);
      assert.ok(w[0] >= 0 && w[0] <= 7 && w[1] >= 0 && w[1] <= 1.5, `corner ${c} on the wall`);
    });
    // A corner without a hit takes D0; with no D0 either it takes 15
    const high = camera({ pos: [3.5, 1.4, 1] });   // the top corners clear the 1.5 m wall, the bottom ones hit it
    const g2 = analyzeCoverage(layout, high, lensOf(high), { width: 7, height: 1.5 });
    assert.deepEqual(g2.cornerHits, [false, false, true, true]);
    assert.deepEqual([g2.cornerDepths[0], g2.cornerDepths[1]], [1, 1], 'no hit: D0');
    assert.equal(MAX_FRUSTUM_DEPTH_M, 15);
  });

  test('03 6.8 re-expression: a camera kept with the wall keeps its coverage; one left behind is off-center', () => {
    // Default wall, Reset, Z 1.5; bottom-left -> wall-center moves the stage origin by 1.25 m
    const extent = { width: 2.5, height: 1.5 };
    const before = analyzeCoverage(layoutProject(projectOf([WallSection.createDefault()])), camera({ pos: [1.25, 0.75, 1.5] }),
      lensOf(camera()), extent);
    assert.deepEqual([before.status, before.frameWidth.toFixed(2), before.frameHeight.toFixed(2), before.distance],
      ['within', '1.54', '1.03', 1.5]);
    const centred = projectOf([WallSection.createDefault()]);
    centred.wall.pivot.setMode('wall-center');
    const layout = layoutProject(centred);
    const kept = analyzeCoverage(layout, camera({ pos: [0, 0.75, 1.5] }), lensOf(camera()), extent);
    assert.deepEqual(kept, before, 'keep stage layout: the camera moved with the wall, the coverage is unchanged');
    assert.equal(analyzeCoverage(layout, camera({ pos: [1.25, 0.75, 1.5] }), lensOf(camera()), extent).status, 'offCenter',
      'keep off: the frame (right edge 2.02 > 1.25) is off the centred wall');
    centred.wall.pivot.setOffset({ x: 0, y: 0, z: 2 });
    const pushed = analyzeCoverage(layoutProject(centred), camera({ pos: [0, 0.75, -0.5] }), lensOf(camera()), extent);
    assert.equal(pushed.distance, 1.5, 'a stage origin 2 m in front of the wall: posZ -0.5 is 1.5 m from it');
  });

  test('the analysis is equivariant under a rotation of the wall and the camera about the vertical axis', () => {
    const sections = [
      section(0, { panelCols: 6, panelRows: 4, curveIntensity: 5 }),
      section(1, { panelCols: 5, panelRows: 4, curveIntensity: 3.5, angleOffset: 15 }),
    ];
    const base = computeWallLayout(sections);
    const poses = [
      { pos: [2.4, 1.2, 4.5], rot: [0, 0, 0] }, { pos: [3, 1.5, 6], rot: [-4, -25, 3] },
      { pos: [1, 0.5, 1.5], rot: [10, 30, -8] }, { pos: [2.5, 1, 3], rot: [0, 120, 0] },
    ];
    for (const yaw of [37, 90, -135]) {
      const turned = transformedLayout(sections, rotationY(yaw));
      const ry = yaw * Math.PI / 180;
      for (const p of poses) {
        const cam = camera(p);
        const [x, , z] = p.pos;
        const rotated = camera({ pos: [x * Math.cos(ry) + z * Math.sin(ry), p.pos[1], -x * Math.sin(ry) + z * Math.cos(ry)],
          rot: [p.rot[0], p.rot[1] + yaw, p.rot[2]] });
        const a = analyzeCoverage(base, cam, lensOf(cam), { width: 5, height: 2 });
        const b = analyzeCoverage(turned, rotated, lensOf(rotated), { width: 5, height: 2 });
        assert.equal(b.status, a.status, `status at yaw ${yaw}`);
        assert.deepEqual(b.cornerHits, a.cornerHits);
        if (a.distance === null) assert.equal(b.distance, null);
        else near(b.distance, a.distance, 1e-9, `D0 at yaw ${yaw}`);
        a.cornerDepths.forEach((d, i) => near(b.cornerDepths[i], d, 1e-9, `depth ${i} at yaw ${yaw}`));
      }
    }
  });
});

describe('08 P2-11a: WallLayout.columnQuads, worldVertices, extentAcross, chordFacing', () => {
  test('columnQuads is memoised per layout instance and has one quad per column', () => {
    const layout = computeWallLayout(FLAT3);
    const quads = layout.columnQuads();
    assert.equal(layout.columnQuads(), quads, 'the same array object');
    assert.equal(quads.length, 14);
    assert.ok(Object.isFrozen(quads));
    const q = quads[5];
    assert.deepEqual([q.p0, q.a, q.b, q.n], [{ x: 2.5, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: 1 }]);
    assert.deepEqual([q.sectionIndex, q.column], [1, 1]);
    assert.notEqual(computeWallLayout(FLAT3).columnQuads(), quads, 'a new layout computes its own');
    assert.notEqual(layout.translated(1, 0, 0).columnQuads(), quads, 'a translated copy computes its own');
  });

  test('the quad normals face the stage side of the walk (+Z for angle 0, -Z after a 180-degree offset)', () => {
    const flipped = computeWallLayout([section(0, { panelCols: 2, angleOffset: 180 })]).columnQuads();
    near(flipped[0].n.z, -1, 1e-15, 'n.z');
    near(flipped[0].n.x, 0, 1e-15, 'n.x');
  });

  test('worldVertices: every grid corner per section, in the generative order; the box equals generativeBounds()', () => {
    const layout = layoutProject(projectOf(FLAT3));
    const verts = layout.worldVertices();
    assert.equal(layout.worldVertices(), verts, 'memoised');
    assert.equal(verts.length, 3);
    assert.equal(verts[1].length, 3 * 7 * 4, '(cols + 1) x (rows + 1) points per section');
    const box = layout.generativeBounds();
    let max = -Infinity;
    for (const list of verts) for (let i = 0; i < list.length; i += 3) max = Math.max(max, list[i]);
    same(max, box.max.x, 'max x');
    assert.deepEqual([...verts[0].slice(0, 6)], [0, 0, 0, 0.5, 0, 0]);
  });

  test('an injected postTransform transforms columnQuads, worldVertices and chordFacing', () => {
    const m = rotationY(90);
    const layout = transformedLayout(FLAT3, m);
    const q = layout.columnQuads()[0];
    near(q.a.z, -0.5, 1e-15, 'a turned from +X to -Z');
    near(q.n.x, 1, 1e-15, 'n turned from +Z to +X');
    const v = layout.worldVertices()[0];
    near(v[3 * 1 + 2], -0.5, 1e-15, 'the second vertex at z = -0.5');
    const facing = layout.chordFacing();
    near(facing.x, 1, 1e-15, 'facing.x');
    near(facing.z, 0, 1e-15, 'facing.z');
    const moved = transformedLayout(FLAT3, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1]).columnQuads()[0];
    assert.deepEqual(moved.p0, { x: 2, y: 3, z: 4 }, 'translation applies to points, not to a, b or n');
    assert.deepEqual(moved.a, { x: 0.5, y: 0, z: 0 });
  });

  test('extentAcross: a flat wall along X, along Z (90-degree offset) and at 45 degrees has the same width (08 AC 42)', () => {
    const along = (offset) => {
      const layout = computeWallLayout([section(0, { panelCols: 5, panelRows: 3, angleOffset: offset })]);
      return layout.extentAcross(layout.chordFacing());
    };
    same(along(0), 2.5, 'along +X');
    near(along(90), 2.5, 1e-12, 'along +Z');
    near(along(45), 2.5, 1e-12, 'at 45 degrees');
    near(along(-160), 2.5, 1e-12, 'at -160 degrees');
  });

  test('chordFacing: the chord normal (-0, 0, 1) of a flat wall along +X; a concave half circle faces back across its chord', () => {
    const flat = computeWallLayout([WallSection.createDefault()]).chordFacing();
    same(flat.x, -0, 'facing.x');
    same(flat.z, 1, 'facing.z');
    const arc = computeWallLayout([section(0, { panelCols: 10, curveIntensity: 18 })]).chordFacing();
    near(arc.x, -0.988, 1e-3, 'the 03 6.6 half circle: facing.x');
    near(arc.z, -0.156, 1e-3, 'facing.z');
    // A closed ring has no chord (its ends meet): (0, 0, 1), 08 6.10
    assert.deepEqual(computeWallLayout([section(0, { panelCols: 20, curveIntensity: 18 })]).chordFacing(), { x: 0, y: 0, z: 1 });
  });

  test('the layout geometry is empty for an empty wall', () => {
    const layout = computeWallLayout([]);
    assert.deepEqual(layout.columnQuads(), []);
    assert.deepEqual(layout.worldVertices(), []);
    same(layout.extentAcross({ x: 0, y: 0, z: 1 }), 0, 'extentAcross of nothing');
    assert.deepEqual(layout.chordFacing(), { x: 0, y: 0, z: 1 });
    const cam = camera();
    assert.equal(analyzeCoverage(layout, cam, lensOf(cam), { width: 0, height: 0 }).status, 'offWall');
  });

  test("frameDistance prefers a plane hit inside a column's horizontal extent over a nearer plane outside it", () => {
    // A step: S0 along +X at z = 0 (x 0..1), S1 along +Z at x = 1, S2 along +X at z = 1 (x 1..2)
    const sections = [
      section(0, { panelCols: 2 }), section(1, { panelCols: 2, angleOffset: 90 }), section(2, { panelCols: 2, angleOffset: -90 }),
    ];
    const quads = computeWallLayout(sections).columnQuads();
    const down = { x: 0, y: 0, z: -1 };
    same(frameDistance({ x: 0.5, y: 0.75, z: 5 }, down, quads), 5, 'S0 contains the hit; the nearer S2 plane does not');
    near(frameDistance({ x: 1.5, y: 0.75, z: 5 }, down, quads), 4, 1e-12, 'S2 contains the hit');
    near(frameDistance({ x: 3, y: 0.75, z: 5 }, down, quads), 4, 1e-12, 'no column contains it: the column it passes closest to (S2, 1 m)');
    same(frameDistance({ x: -0.6, y: 0.75, z: 5 }, down, quads), 5, 'left of the step: S0 (0.6 m away) wins over the nearer S2 plane (1.6 m away)');
    assert.equal(frameDistance({ x: 3, y: 0.75, z: 5 }, { x: 0, y: 0, z: 1 }, quads), null, 'no wall plane ahead');
  });
});
