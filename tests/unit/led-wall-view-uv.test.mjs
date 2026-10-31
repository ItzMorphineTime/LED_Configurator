// Unit tests for spec 04's live UV path and hover resolution in js/render/LEDWallView.js (docs/improvements/
// 04-uvs-uv-editor.md 6.9, 6.12, 8.1; UV-11, UV-15), with a small fake THREE installed as window.THREE before the module
// is imported (js/vendor/three.js reads window.THREE when it is evaluated). Meshes have identity world matrices, so
// world and local coordinates coincide.
// Run: node --test tests/unit/led-wall-view-uv.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Project } from '../../js/domain/Project.js';
import { WallSection } from '../../js/domain/WallSection.js';
import { UvTransform } from '../../js/domain/UvSettings.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';
import { layoutProject } from '../../js/geometry/WallLayout.js';
import { computeAtlas } from '../../js/geometry/TextureAtlas.js';
import { WallMeshBuilder } from '../../js/geometry/WallMeshBuilder.js';
import { planSectionUv, planSectionUvs } from '../../js/geometry/UvMapper.js';

const created = { geometries: 0, materials: 0 };
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  fromBufferAttribute(a, i) { this.x = a.array[i * 3]; this.y = a.array[i * 3 + 1]; this.z = a.array[i * 3 + 2]; return this; }
}
/** Barycentric weights of p in (a, b, c) (three's Triangle.getBarycoord formula). */
const getBarycoord = (p, a, b, c, target) => {
  const v0 = [c.x - a.x, c.y - a.y, c.z - a.z];
  const v1 = [b.x - a.x, b.y - a.y, b.z - a.z];
  const v2 = [p.x - a.x, p.y - a.y, p.z - a.z];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d00 = dot(v0, v0); const d01 = dot(v0, v1); const d02 = dot(v0, v2); const d11 = dot(v1, v1); const d12 = dot(v1, v2);
  const inv = 1 / (d00 * d11 - d01 * d01);
  const u = (d11 * d02 - d01 * d12) * inv;
  const v = (d00 * d12 - d01 * d02) * inv;
  target.x = 1 - u - v; target.y = v; target.z = u;
  return target;
};
class Attr {
  constructor(array, itemSize) { this.array = Float32Array.from(array); this.itemSize = itemSize; this.updateRange = { offset: 0, count: -1 }; this.needsUpdate = false; }
  setXY(k, u, v) { this.array[k * 2] = u; this.array[k * 2 + 1] = v; }
}
class Object3D {
  constructor() { this.children = []; this.userData = {}; this.position = { set() {} }; this.rotation = {}; }
  add(c) { this.children.push(c); }
  traverse(cb) { cb(this); this.children.forEach((c) => c.traverse(cb)); }
  worldToLocal(v) { return v; }
  localToWorld(v) { return v; }
  updateWorldMatrix() {}
}
class Geometry {
  constructor() { this.attributes = {}; created.geometries++; }
  setAttribute(n, a) { this.attributes[n] = a; }
  setIndex(i) { this.index = i; }
  addGroup() {}
  dispose() {}
}
class PlaneGeometry extends Geometry {
  constructor(w, h) {
    super();
    this.parameters = { width: w, height: h };
    // three r128 order: TL, TR, BL, BR
    this.attributes.position = new Attr([-w / 2, h / 2, 0, w / 2, h / 2, 0, -w / 2, -h / 2, 0, w / 2, -h / 2, 0], 3);
    this.attributes.uv = new Attr([0, 1, 1, 1, 0, 0, 1, 0], 2);
  }
}
class Mesh extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; } }
globalThis.window = {
  THREE: {
    Group: Object3D, Mesh, BufferGeometry: Geometry, PlaneGeometry, Vector3, Triangle: { getBarycoord },
    Float32BufferAttribute: Attr, Uint32BufferAttribute: Attr,
    Color: class { constructor() { this.r = 0; this.g = 0; this.b = 0; } },
  },
};
const { LEDWallView } = await import('../../js/render/LEDWallView.js');

const section = (id, cols, rows) => new WallSection({
  id, name: `S${id}`, panelCols: cols, panelRows: rows, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32,
  curveIntensity: 0, angleOffset: 0, color: '#d9d9d6',
});

function setup(meshMode, content = 'panelIds') {
  const project = Project.createDefault();
  project.wall.replaceAll([section(1, 3, 2), section(2, 2, 2)]);
  if (content === 'panelIds') project.display.setPanelIds(true);
  if (content === 'ledSim') project.display.setLedSim(true);
  const material = () => { created.materials++; return { dispose() {} }; };
  const materials = { beginRebuild() {}, combined: material, section: material, panel: material, sectionShared: material };
  const builder = new WallMeshBuilder(Strategies.mesh.viewport);
  const view = new LEDWallView({ sceneManager: { add() {}, remove() {} }, materials, builder, theme: { scene: { frame: 0 } },
    debugMaterials: { forShading: () => null } });
  const layout = layoutProject(project);
  const atlas = computeAtlas(layout.sections.map((sl) => sl.section));
  view.rebuild({ layout, meshMode, display: project.display, atlas, uvSettings: project.uv,
    uvPlans: planSectionUvs({ layout, atlas, settings: project.uv, meshMode, applyTransforms: content !== 'ledSim' }) });
  const planOf = (i, t) => {
    layout.sections[i].section.setUvTransform(t);
    return planSectionUv(layout.sections[i], i, { atlas, settings: project.uv, meshMode, applyTransforms: true });
  };
  return { project, view, layout, builder, planOf };
}

describe('LEDWallView.updateSectionUvs (04 6.12)', () => {
  test('combined: writes the section\'s vertex range only, widens a pending updateRange, allocates nothing', () => {
    const { view, layout, builder, planOf } = setup('combined');
    const mesh = view.meshes()[0];
    const attr = mesh.geometry.attributes.uv;
    const before = Float32Array.from(attr.array);
    const counts = { ...created };
    const plan = planOf(1, new UvTransform({ flipU: true }));
    assert.equal(view.updateSectionUvs(2, plan), true);
    assert.deepEqual(created, counts, 'no geometry or material');
    const r = mesh.userData.sectionRanges[1];
    const expected = builder.sectionUvs(layout.sections[1], plan);
    assert.deepEqual(Array.from(attr.array.slice(r.vertexStart * 2, r.vertexStart * 2 + expected.length)), Array.from(Float32Array.from(expected)));
    assert.deepEqual(Array.from(attr.array.slice(0, r.vertexStart * 2)), Array.from(before.slice(0, r.vertexStart * 2)), 'section 1 untouched');
    assert.deepEqual(attr.updateRange, { offset: r.vertexStart * 2, count: expected.length });
    view.updateSectionUvs(1, planOf(0, new UvTransform({ offsetU: 0.1 })));
    assert.deepEqual(attr.updateRange, { offset: 0, count: (r.vertexStart * 2) + expected.length }, 'the union of both writes');
    assert.equal(attr.needsUpdate, true);
  });

  test('section mode rewrites the section mesh; LED-mask content is a no-op', () => {
    const s = setup('section');
    const plan = s.planOf(0, new UvTransform({ rotation: 90, sourceRotated: true }));
    assert.equal(s.view.updateSectionUvs(1, plan), true);
    const attr = s.view.meshes()[0].geometry.attributes.uv;
    assert.deepEqual(Array.from(attr.array), Array.from(Float32Array.from(s.builder.sectionUvs(s.layout.sections[0], plan))));
    const led = setup('section', 'ledSim');
    assert.equal(led.view.updateSectionUvs(1, led.planOf(0, new UvTransform({ flipU: true }))), false);
  });

  test('panel mode rewrites the corners of the panels that sample the section canvas (TL, TR, BL, BR)', () => {
    const s = setup('panel');
    const plan = s.planOf(0, new UvTransform({ flipU: true }));
    assert.equal(s.view.updateSectionUvs(1, plan), true);
    const mesh = s.view.meshes().find((m) => m.userData.sectionIndex === 0 && m.userData.col === 0 && m.userData.row === 0);
    const corners = s.builder.panelUvs({ col: 0, row: 0 }, s.layout.sections[0], plan);   // BL, BR, TR, TL
    const want = [corners[3], corners[2], corners[0], corners[1]].flat();
    assert.deepEqual(Array.from(mesh.geometry.attributes.uv.array), Array.from(Float32Array.from(want)));
    const colour = setup('panel', 'color');
    assert.equal(colour.view.updateSectionUvs(1, colour.planOf(0, new UvTransform({ flipU: true }))), false, 'per-panel colour materials');
  });
});

describe('LEDWallView.resolveHit and panelCornersWorld (04 6.9)', () => {
  test('combined strips: the face\'s section range and the barycentric base UV, whatever the UV transform', () => {
    const { view, layout } = setup('combined');
    const mesh = view.meshes()[0];
    const r = mesh.userData.sectionRanges[1];          // section 2: 2 x 2 panels, 3 x 3 vertices
    const indices = mesh.geometry.index;
    const faceIndex = r.indexStart / 3 + 3;            // a face of section 2's second quad row
    const [a, b, c] = Array.from(indices).slice(faceIndex * 3, faceIndex * 3 + 3);
    const pos = mesh.geometry.attributes.position.array;
    const P = (k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
    const point = new Vector3(...[0, 1, 2].map((d) => (P(a)[d] + P(b)[d] + P(c)[d]) / 3));
    const uvOf = (k) => { const local = k - r.vertexStart; const col = local % 3; return [col / 2, (local - col) / 3 / 2]; };
    const want = [0, 1].map((d) => (uvOf(a)[d] + uvOf(b)[d] + uvOf(c)[d]) / 3);
    layout.sections[1].section.setUvTransform(new UvTransform({ rotation: 45, scaleU: 0.5, scaleV: 0.5 }));
    const hit = view.resolveHit({ object: mesh, point, face: { a, b, c }, faceIndex });
    assert.equal(hit.sectionId, 2);
    assert.equal(hit.sectionIndex, 1);
    assert.ok(Math.abs(hit.baseU - want[0]) < 1e-9 && Math.abs(hit.baseV - want[1]) < 1e-9, `${hit.baseU},${hit.baseV} vs ${want}`);
    assert.equal(hit.panelCorners3D.length, 4);
  });

  test('section strips: vertex base 0; the panel corners are the grid loop BL, BR, TR, TL', () => {
    const { view } = setup('section');
    const mesh = view.meshes()[0];                     // section 1: 3 x 2 panels, 4 x 3 vertices
    const pos = mesh.geometry.attributes.position.array;
    const P = (k) => new Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    // the centre of panel (col 1, row 1): the mean of its four corners
    const ks = [1 * 4 + 1, 1 * 4 + 2, 2 * 4 + 2, 2 * 4 + 1];
    const centre = ks.map(P).reduce((m, v) => new Vector3(m.x + v.x / 4, m.y + v.y / 4, m.z + v.z / 4), new Vector3());
    const tri = Array.from(mesh.geometry.index);
    let face = -1;
    for (let f = 0; f < tri.length / 3 && face < 0; f++) {
      const t = tri.slice(f * 3, f * 3 + 3);
      if (t.every((k) => ks.includes(k)) && t.includes(ks[0]) && t.includes(ks[2])) face = f;
    }
    const [a, b, c] = tri.slice(face * 3, face * 3 + 3);
    const hit = view.resolveHit({ object: mesh, point: centre, face: { a, b, c }, faceIndex: face });
    assert.ok(Math.abs(hit.baseU - 1.5 / 3) < 1e-9 && Math.abs(hit.baseV - 1.5 / 2) < 1e-9);
    assert.deepEqual([hit.col, hit.row], [1, 1]);
    assert.deepEqual(hit.panelCorners3D, ks.map((k) => { const v = P(k); return { x: v.x, y: v.y, z: v.z }; }));
  });

  test('panel planes: the local hit, uMirrored honoured; anything not tagged led-wall resolves to null', () => {
    const { view } = setup('panel');
    const mesh = view.meshes().find((m) => m.userData.sectionIndex === 0 && m.userData.col === 2 && m.userData.row === 1);
    const { width, height } = mesh.geometry.parameters;
    const point = new Vector3(-width / 4, height / 4, 0);   // local (0.25, 0.75) of the panel
    let hit = view.resolveHit({ object: mesh, point });
    assert.ok(Math.abs(hit.baseU - (2 + 0.25) / 3) < 1e-9 && Math.abs(hit.baseV - (1 + 0.75) / 2) < 1e-9);
    mesh.userData.uMirrored = true;
    hit = view.resolveHit({ object: mesh, point });
    assert.ok(Math.abs(hit.baseU - (2 + 0.75) / 3) < 1e-9);
    assert.equal(view.resolveHit({ object: { userData: { kind: 'led-wall-back' } }, point }), null);
    assert.equal(view.resolveHit(null), null);
  });
});
