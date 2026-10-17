// Unit tests for the 06 T5 scene overlays (docs/improvements/06-morph-branding.md 3.8, 5.7, 6.6, 6.7, 8.1, D15):
// U13 render/frameColor.js (the adaptive panel frames, and LEDWallView giving each section's frames its colour) and
// U12 for the frustum of render/CameraRigView.js (a dashed outline is LineSegments or a closed Line, never a LineLoop
// with a LineDashedMaterial; the closing segment's line distances increase), plus the rest of the two-tone frustum and
// the camera body's edge outline; and 08 P2-10a (B-M11): render/PreviewWindow.js hides every registered helper for the
// preview render only. A recording fake THREE is installed as window.THREE before the render modules are imported
// (js/vendor/three.js reads window.THREE when it is evaluated); its computeLineDistances follow three r128.
// Run: node --test tests/unit/scene-overlays.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Theme } from '../../js/theme/Theme.js';
import { EventBus } from '../../js/core/EventBus.js';
import { RENDER_ORDER } from '../../js/core/renderOrder.js';
import { Project } from '../../js/domain/Project.js';
import { WallSection } from '../../js/domain/WallSection.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';
import { layoutProject } from '../../js/geometry/WallLayout.js';
import { WallMeshBuilder } from '../../js/geometry/WallMeshBuilder.js';
import { relativeLuminance, contrastRatio, frameColorFor } from '../../js/render/frameColor.js';

// ---- a recording fake THREE ---------------------------------------------------------------------------------------

/** Every disposed resource, by name, in order. */
const disposed = [];
let nextId = 0;
class FakeObject3D {
  constructor() {
    this.isObject3D = true; this.children = []; this.parent = null; this.userData = {}; this.renderOrder = 0; this.visible = true;
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } };
    this.rotation = { order: 'XYZ', set() {} };
  }
  add(child) { child.parent = this; this.children.push(child); }
  remove(child) { this.children = this.children.filter((c) => c !== child); child.parent = null; }
  traverse(cb) { cb(this); this.children.forEach((c) => c.traverse(cb)); }
}
class FakeAttribute {
  constructor(array, itemSize) { this.array = Array.from(array); this.itemSize = itemSize; this.count = this.array.length / itemSize; }
}
class FakeGeometry {
  constructor(kind = 'BufferGeometry', source = null) { this.kind = kind; this.source = source; this.attributes = {}; this.index = null; this.name = `${kind}-${nextId++}`; }
  setAttribute(name, attribute) { this.attributes[name] = attribute; }
  setIndex(index) { this.index = index; }
  dispose() { disposed.push(this.name); }
}
class FakeMaterial {
  constructor(kind, params = {}) { Object.assign(this, params); this.kind = kind; this.name = `${kind}-${nextId++}`; }
  dispose() { disposed.push(this.name); }
}
/** three r128 Line.computeLineDistances: cumulative along the polyline. */
function lineDistances(positions) {
  const p = (i) => positions.array.slice(i * 3, i * 3 + 3);
  const d = [0];
  for (let i = 1; i < positions.count; i++) d[i] = d[i - 1] + Math.hypot(...p(i).map((v, k) => v - p(i - 1)[k]));
  return d;
}
/** three r128 LineSegments.computeLineDistances: each segment (i, i + 1) continues from the previous segment's end. */
function segmentDistances(positions) {
  const p = (i) => positions.array.slice(i * 3, i * 3 + 3);
  const d = [];
  for (let i = 0; i < positions.count; i += 2) {
    d[i] = i === 0 ? 0 : d[i - 1];
    d[i + 1] = d[i] + Math.hypot(...p(i + 1).map((v, k) => v - p(i)[k]));
  }
  return d;
}
class FakeMesh extends FakeObject3D { constructor(geometry, material) { super(); this.kind = 'Mesh'; this.geometry = geometry; this.material = material; } }
class FakeLine extends FakeObject3D {
  constructor(geometry, material) { super(); this.kind = 'Line'; this.geometry = geometry; this.material = material; }
  computeLineDistances() { this.geometry.setAttribute('lineDistance', new FakeAttribute(lineDistances(this.geometry.attributes.position), 1)); return this; }
}
class FakeLineLoop extends FakeLine { constructor(g, m) { super(g, m); this.kind = 'LineLoop'; } }
class FakeLineSegments extends FakeLine {
  constructor(g, m) { super(g, m); this.kind = 'LineSegments'; }
  computeLineDistances() { this.geometry.setAttribute('lineDistance', new FakeAttribute(segmentDistances(this.geometry.attributes.position), 1)); return this; }
}
const FakeTHREE = {
  Group: class extends FakeObject3D { constructor() { super(); this.kind = 'Group'; } },
  Mesh: FakeMesh, Line: FakeLine, LineLoop: FakeLineLoop, LineSegments: FakeLineSegments,
  BufferGeometry: class extends FakeGeometry { constructor() { super('BufferGeometry'); } },
  BoxGeometry: class extends FakeGeometry { constructor(w, h, d) { super('BoxGeometry'); this.size = [w, h, d]; } },
  PlaneGeometry: class extends FakeGeometry { constructor() { super('PlaneGeometry'); } },
  EdgesGeometry: class extends FakeGeometry { constructor(source) { super('EdgesGeometry', source); } },
  Float32BufferAttribute: FakeAttribute, BufferAttribute: FakeAttribute,
  Uint32BufferAttribute: class { constructor(array) { this.array = array; } },
  MeshBasicMaterial: class extends FakeMaterial { constructor(p) { super('MeshBasicMaterial', p); } },
  LineBasicMaterial: class extends FakeMaterial { constructor(p) { super('LineBasicMaterial', p); } },
  LineDashedMaterial: class extends FakeMaterial { constructor(p) { super('LineDashedMaterial', p); } },
  Color: class { constructor() { this.r = 0; this.g = 0; this.b = 0; } },
  DoubleSide: 2,
  // The preview's second renderer and camera (PreviewWindow.init / updateCamera). render() calls the hook of the test.
  WebGLRenderer: class {
    constructor(params) { this.params = params; this.onRender = null; }
    setSize(w, h) { this.size = [w, h]; }
    setPixelRatio(r) { this.pixelRatio = r; }
    render(scene, camera) { if (this.onRender) this.onRender(scene, camera); }
  },
  PerspectiveCamera: class extends FakeObject3D {
    constructor(fov, aspect, near, far) { super(); Object.assign(this, { fov, aspect, near, far }); }
    updateProjectionMatrix() {}
  },
};
globalThis.window = { THREE: FakeTHREE };
const { CameraRigView } = await import('../../js/render/CameraRigView.js');
const { LEDWallView } = await import('../../js/render/LEDWallView.js');
const { PreviewWindow } = await import('../../js/render/PreviewWindow.js');

// ---- U13: frameColorFor (06 6.7) ----------------------------------------------------------------------------------

const LIGHT = Theme.scene.frame;
const DARK = Theme.scene.frameOnLight;
const COLOUR_DISPLAY = { panelIdsEnabled: false, ledSimEnabled: false, content: 'color', wireframe: false };
/** 06 3.9's palette (06 T7 makes it Palette.sectionColors; listed here so U13 does not depend on that step). */
const PALETTE = { 'Studio Grey': '#d9d9d6', 'Signal Red': '#c51622', Sky: '#58a6e8', Ember: '#e2803c', Jade: '#14a37f',
  Rose: '#e68ac0', Iris: '#7462d8', Steel: '#6c6c6c' };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

describe('U13 frameColorFor: the adaptive panel frames (06 6.7)', () => {
  test('relativeLuminance and contrastRatio reproduce 06 6.1\'s reference ratios, for #rrggbb strings and 0xrrggbb numbers', () => {
    const near = (a, b, want) => assert.ok(Math.abs(contrastRatio(a, b) - want) < 0.005, `${a}/${b}: ${contrastRatio(a, b)} vs ${want}`);
    near('#0A0A0A', '#FFFFFF', 19.80);
    near('#0A0A0A', '#F2B705', 10.89);
    near('#FFFFFF', '#C51622', 5.98);
    near(0xc51622, 0x0a0a0a, 3.31);
    assert.equal(relativeLuminance('#ffffff'), 1);
    assert.equal(relativeLuminance(0x000000), 0);
    assert.equal(relativeLuminance('#C51622'), relativeLuminance(0xc51622));
    assert.throws(() => relativeLuminance('#abc'), TypeError);
    assert.throws(() => relativeLuminance('red'), TypeError);
  });

  test('the theme frames are #D4D4D4 (light) and #0A0A0A (dark)', () => {
    assert.equal(LIGHT, 0xd4d4d4);
    assert.equal(DARK, 0x0a0a0a);
  });

  test('the dark frame on Studio Grey, Sky, Ember, Jade, Rose, Iris and Steel; the light frame on Signal Red', () => {
    for (const [name, colour] of Object.entries(PALETTE)) {
      const want = name === 'Signal Red' ? LIGHT : DARK;
      assert.equal(frameColorFor(colour, COLOUR_DISPLAY, Theme.scene), want, name);
      assert.equal(frameColorFor(colour.toUpperCase(), COLOUR_DISPLAY, Theme.scene), want, `${name} (upper case)`);
    }
  });

  test('the light frame on textures and see-through panels: panel IDs, LED sim, HDRI content, wireframe', () => {
    const grey = PALETTE['Studio Grey'];
    assert.equal(frameColorFor(grey, { ...COLOUR_DISPLAY, panelIdsEnabled: true }, Theme.scene), LIGHT);
    assert.equal(frameColorFor(grey, { ...COLOUR_DISPLAY, ledSimEnabled: true }, Theme.scene), LIGHT);
    assert.equal(frameColorFor(grey, { ...COLOUR_DISPLAY, content: 'hdri' }, Theme.scene), LIGHT);
    assert.equal(frameColorFor(grey, { ...COLOUR_DISPLAY, wireframe: true }, Theme.scene), LIGHT);
  });

  test('the light frame for a colour that is not #rrggbb (free strings until spec 07\'s setColor rule)', () => {
    for (const colour of ['white', '#fff', '#12345', '', 'rgb(255, 255, 255)', null, undefined, 0xffffff]) {
      assert.equal(frameColorFor(colour, COLOUR_DISPLAY, Theme.scene), LIGHT, String(colour));
    }
  });

  test('a 4,096-colour sweep (16 levels per channel) never goes below 3.65:1; the palette minimum is 3.77 (Steel)', () => {
    let worst = Infinity;
    for (let r = 0; r < 16; r++) {
      for (let g = 0; g < 16; g++) {
        for (let b = 0; b < 16; b++) {
          const colour = hex(r * 0x110000 + g * 0x1100 + b * 0x11);
          worst = Math.min(worst, contrastRatio(colour, frameColorFor(colour, COLOUR_DISPLAY, Theme.scene)));
        }
      }
    }
    assert.ok(worst >= 3.65, `worst ${worst}`);
    const palette = Object.values(PALETTE).map((c) => contrastRatio(c, frameColorFor(c, COLOUR_DISPLAY, Theme.scene)));
    assert.ok(Math.abs(Math.min(...palette) - 3.77) < 0.005, `palette minimum ${Math.min(...palette)}`);
    assert.ok(contrastRatio(LIGHT, '#0a0a0a') >= 13.36 - 0.005, 'the light frame on the near-black textures');
  });

  test('LEDWallView gives each section\'s frames its adaptive colour, and rebuilds them with the display', () => {
    const project = Project.createDefault();
    const section = (id, color) => new WallSection({ id, name: `S${id}`, panelCols: 2, panelRows: 1, panelWidth: 500,
      panelHeight: 500, ledX: 32, ledY: 32, curveIntensity: 0, angleOffset: 0, color });
    project.wall.replaceAll([section(0, PALETTE['Studio Grey']), section(1, PALETTE['Signal Red'])]);
    project.display.showFrame = true;
    const materials = { beginRebuild() {}, combined: () => new FakeTHREE.MeshBasicMaterial({}),
      section: () => new FakeTHREE.MeshBasicMaterial({}), panel: () => new FakeTHREE.MeshBasicMaterial({}) };
    const view = new LEDWallView({ sceneManager: { add() {}, remove() {} }, materials,
      builder: new WallMeshBuilder(Strategies.mesh.viewport), theme: Theme, debugMaterials: {} });
    const frameColours = () => view.frameGroup.children.map((f) => f.material.color);
    view.rebuild({ layout: layoutProject(project), meshMode: 'combined', display: project.display });
    assert.deepEqual(frameColours(), [DARK, DARK, LIGHT, LIGHT], 'two grey panels, two red panels');
    project.display.wireframe = true;
    view.rebuild({ layout: layoutProject(project), meshMode: 'combined', display: project.display });
    assert.deepEqual(frameColours(), [LIGHT, LIGHT, LIGHT, LIGHT], 'wireframe: light frames');
  });
});

// ---- U12 and the rest of the two-tone frustum (06 6.6) -------------------------------------------------------------

/** A CameraRigView with a fake scene, its emitted lens events and a default camera. */
function rig() {
  const helpers = new Set();
  const sceneManager = { addHelper: (o) => helpers.add(o), removeHelper: (o) => helpers.delete(o) };
  const view = new CameraRigView({ sceneManager, bus: new EventBus(), theme: Theme });
  const cine = Project.createDefault().camera;
  return { view, cine, helpers };
}
const linesOf = (group) => group.children.filter((c) => c.kind === 'LineSegments' || c.kind === 'Line' || c.kind === 'LineLoop');
/** Every object of a tree (the root included). */
const walk = (root) => { const out = []; root.traverse((o) => out.push(o)); return out; };

describe('U12 closed dashed outlines and the two-tone frustum (06 6.6, D15)', () => {
  test('the frustum is a solid halo under a dashed core: two LineSegments sharing one geometry, halo first', () => {
    const { view, cine } = rig();
    view.create(cine);
    const lines = linesOf(view.group);
    assert.equal(lines.length, 2);
    const [halo, core] = lines;
    const style = Theme.scene.frustumLines;
    assert.equal(halo.kind, 'LineSegments');
    assert.equal(core.kind, 'LineSegments');
    assert.equal(halo.geometry, core.geometry, 'one geometry');
    assert.equal(halo.material.kind, 'LineBasicMaterial');
    assert.equal(halo.material.color, style.haloColor);
    assert.equal(core.material.kind, 'LineDashedMaterial');
    assert.equal(core.material.color, style.color);
    assert.equal(core.material.dashSize, 0.15);
    assert.equal(core.material.gapSize, 0.10);
    assert.equal(halo.renderOrder, RENDER_ORDER.DEFAULT);
    assert.equal(core.renderOrder, RENDER_ORDER.RIG_CORE);
    assert.ok(core.renderOrder > halo.renderOrder, 'the core draws after the halo');
    for (const line of [halo, core]) {
      assert.equal(line.material.transparent, false, 'opaque at the theme opacity 1.0');
      assert.equal(line.material.opacity, 1);
    }
    assert.equal(core.geometry.attributes.position.count, 24, '12 segments: near and far rectangles, 4 edges');
  });

  test('the core has line distances after every rebuildFrustum; each segment increases, the closing one included', () => {
    const { view, cine } = rig();
    view.create(cine);
    for (const focal of [24, 85]) {
      cine.focalLength = focal;
      view.rebuildFrustum(cine);
      const [, core] = linesOf(view.group);
      const d = core.geometry.attributes.lineDistance;
      assert.ok(d, 'computeLineDistances ran on the core');
      assert.equal(d.count, core.geometry.attributes.position.count);
      for (let i = 0; i < d.count; i += 2) assert.ok(d.array[i + 1] > d.array[i], `segment ${i / 2} increases`);
      const n = d.count;
      assert.ok(d.array[n - 1] > d.array[n - 2], 'the closing segment\'s last value > its second-last value');
    }
  });

  test('a scene walk finds no LineLoop with a LineDashedMaterial; every dashed line is LineSegments or a closed Line', () => {
    const { view, cine } = rig();
    view.create(cine);
    const dashed = walk(view.group).filter((o) => o.material && o.material.kind === 'LineDashedMaterial');
    assert.equal(dashed.length, 1);
    for (const o of dashed) {
      assert.notEqual(o.kind, 'LineLoop');
      if (o.kind === 'Line') {
        const p = o.geometry.attributes.position;
        assert.deepEqual(p.array.slice(-3), p.array.slice(0, 3), 'a closed Line repeats its first vertex');
      } else {
        assert.equal(o.kind, 'LineSegments');
      }
    }
  });

  test('rebuildFrustum replaces the halo and the core and disposes the shared geometry and both materials', () => {
    const { view, cine } = rig();
    view.create(cine);
    const [halo, core] = linesOf(view.group);
    disposed.length = 0;
    view.rebuildFrustum(cine);
    for (const name of [halo.geometry.name, halo.material.name, core.material.name]) assert.ok(disposed.includes(name), name);
    const [halo2, core2] = linesOf(view.group);
    assert.notEqual(halo2, halo);
    assert.notEqual(core2, core);
    assert.equal(linesOf(view.group).length, 2, 'no stale line stays in the group');
  });

  test('remove() drops the group and nulls bodyMesh (08 P2-4a; legacy kept a stale cameraBodyMesh)', () => {
    const { view, cine, helpers } = rig();
    view.create(cine);
    assert.ok(view.bodyMesh);
    view.remove();
    assert.equal(view.group, null);
    assert.equal(view.bodyMesh, null);
    assert.equal(helpers.size, 0, 'the helper is unregistered');
  });

  test('the camera body is opaque Signal Red with a Morph Black edge outline child that is never picked', () => {
    const { view, cine, helpers } = rig();
    view.create(cine);
    assert.ok(helpers.has(view.group));
    const body = view.bodyMesh;
    const style = Theme.scene.cameraBody;
    assert.equal(body.material.color, style.color);
    assert.equal(body.material.opacity, 1);
    assert.equal(body.material.transparent, false);
    assert.equal(body.children.length, 1);
    const [outline] = body.children;
    assert.equal(outline.kind, 'LineSegments');
    assert.equal(outline.geometry.kind, 'EdgesGeometry');
    assert.equal(outline.geometry.source, body.geometry, 'the edges of the body box');
    assert.equal(outline.material.kind, 'LineBasicMaterial');
    assert.equal(outline.material.color, style.outlineColor);
    assert.deepEqual(view.pickMeshes(), [body]);
    disposed.length = 0;
    view.remove();
    for (const name of [outline.geometry.name, outline.material.name, body.geometry.name, body.material.name]) {
      assert.ok(disposed.includes(name), `remove() disposes ${name}`);
    }
    assert.equal(helpers.size, 0);
  });
});

// ---- 08 P2-10a (B-M11): the preview hides the registered helpers (08 6.14) ------------------------------------------

/** An initialised PreviewWindow over fake elements, with the real CineCamera of a default project. */
function preview() {
  const listener = { addEventListener() {} };
  const label = () => ({ textContent: '' });
  const elements = { windowEl: { style: {} }, canvas: {}, resizeHandle: listener, info: label(), fov: label(), res: label() };
  const cine = Project.createDefault().camera;
  const win = new PreviewWindow({ doc: { ...listener, body: { style: {} } }, win: { devicePixelRatio: 1 }, cine, elements });
  win.init();
  return { win, cine };
}

describe('PreviewWindow.render hides every registered helper for the preview render only (08 P2-10a, B-M11)', () => {
  /** The helpers of the live app: the grid, the axes (hidden here, as the grid toggle hides the grid), the rig, a gizmo. */
  function helperSet() {
    const { view, cine, helpers } = rig();
    view.create(cine);
    const grid = new FakeTHREE.Group();
    const axes = new FakeTHREE.Group();
    axes.visible = false;
    const gizmo = new FakeTHREE.Group();
    for (const h of [grid, axes, gizmo]) helpers.add(h);
    return { helpers, rigGroup: view.group, grid, axes, gizmo };
  }

  test('every helper is invisible during the draw, and each keeps its own flag afterwards', () => {
    const { win, cine } = preview();
    const { helpers, rigGroup, axes } = helperSet();
    const scene = new FakeTHREE.Group();
    const seen = [];
    win.renderer.onRender = (s, camera) => seen.push({ s, camera, visible: [...helpers].map((h) => h.visible) });
    cine.enabled = true;
    win.render(scene, helpers);
    assert.equal(seen.length, 1, 'one preview draw');
    assert.equal(seen[0].s, scene);
    assert.equal(seen[0].camera, win.camera, 'through the preview camera');
    assert.deepEqual(seen[0].visible, [false, false, false, false], 'rig, grid, axes and gizmo hidden during the draw');
    assert.deepEqual([...helpers].map((h) => h.visible), [true, true, false, true], 'restored: the hidden axes stay hidden');
    assert.ok(helpers.has(rigGroup) && rigGroup.visible, 'the rig with its frustum fill is visible again for the main view');
    assert.equal(axes.visible, false);
  });

  test('nothing is drawn or touched while the preview is off', () => {
    const { win, cine } = preview();
    const { helpers } = helperSet();
    let draws = 0;
    win.renderer.onRender = () => { draws++; };
    cine.enabled = false;
    const before = [...helpers].map((h) => h.visible);
    win.render(new FakeTHREE.Group(), helpers);
    assert.equal(draws, 0);
    assert.deepEqual([...helpers].map((h) => h.visible), before);
  });

  test('a draw that throws still restores every flag', () => {
    const { win, cine } = preview();
    const { helpers } = helperSet();
    win.renderer.onRender = () => { throw new Error('context lost'); };
    cine.enabled = true;
    assert.throws(() => win.render(new FakeTHREE.Group(), helpers), /context lost/);
    assert.deepEqual([...helpers].map((h) => h.visible), [true, true, false, true]);
  });
});
