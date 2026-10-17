// Unit tests for render/PivotMarkerView (docs/improvements/03-pivot.md 3.3, 5.3, 5.8; 03 T5; test 15's marker part; AC 3,
// 12, 20) and SceneManager.addPreRender (07 C46): no allocation before init, the stage-frame placement of the glyph, ghost,
// drop and link lines, the visibility rule, the selection colour, the drag preview, the minimum on-screen size, the null
// resolution, the render order, layers and two-tone materials (06 5.12: no LineLoop), and dispose.
// three.js is tests/unit/fixtures/fake-three.mjs (plus the few classes SceneManager.init needs) installed as window.THREE.
// Run: node --test tests/unit/pivot-marker.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FakeTHREE, Vector3, Object3D, Layers } from './fixtures/fake-three.mjs';

const draws = [];
class PerspectiveCamera extends Object3D {
  constructor(fov) { super(); this.fov = fov; this.layers = new Layers(); }
  updateProjectionMatrix() {}
}
class WebGLRenderer {
  constructor({ canvas }) { this.domElement = canvas; }
  setSize() {} setPixelRatio() {}
  render(scene, camera) { draws.push(['render', camera]); }
}
const SceneFakes = {
  ...FakeTHREE, PerspectiveCamera, WebGLRenderer,
  AmbientLight: class extends Object3D {}, PointLight: class extends Object3D {},
  GridHelper: class extends Object3D { constructor(...a) { super(); this.args = a; } }, AxesHelper: class extends Object3D {},
};
globalThis.window = { THREE: SceneFakes };
const { PivotMarkerView } = await import('../../js/render/PivotMarkerView.js');
const { SceneManager, LAYERS } = await import('../../js/render/SceneManager.js');
const { Events, EventBus } = await import('../../js/core/EventBus.js');
const { RENDER_ORDER } = await import('../../js/core/renderOrder.js');
const { Theme } = await import('../../js/theme/Theme.js');
const { Project } = await import('../../js/domain/Project.js');
const { WallSection } = await import('../../js/domain/WallSection.js');
const { WallPivot } = await import('../../js/domain/Wall.js');
const { computeWallLayout, resolvePivot } = await import('../../js/geometry/WallLayout.js');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ST = Theme.scene.pivot;

/** The resolution of a pivot on a wall of the given sections (default: the 5 x 3 wall of 500 mm panels). */
function resolutionOf(mode, offset = { x: 0, y: 0, z: 0 }, sections = null) {
  const project = Project.createDefault();
  if (sections) project.wall.replaceAll(sections.map((f) => new WallSection(f)));
  const pivot = new WallPivot();
  pivot.setMode(mode);
  pivot.setOffset(offset);
  return resolvePivot(computeWallLayout(project.wall.sections), pivot);
}

function makeRig({ show = false } = {}) {
  const bus = new EventBus();
  const helpers = [];
  const sceneManager = { addHelper: (g) => helpers.push(g), removeHelper: (g) => helpers.splice(helpers.indexOf(g), 1) };
  const display = Project.createDefault().display;
  display.showPivotMarker = show;
  const view = new PivotMarkerView({ sceneManager, bus, display, theme: Theme });
  return { bus, helpers, display, view };
}

/** Every Object3D of the marker. */
const nodes = (view) => { const out = []; view.group.traverse((o) => out.push(o)); return out; };
const glyph = (view) => view.group.children.at(-1);
const xyz = (v) => [v.x, v.y, v.z];

describe('PivotMarkerView: construction and init (R4, 03 5.8)', () => {
  test('the constructor allocates nothing; WALL_REBUILT before init is ignored', () => {
    const r = makeRig();
    r.bus.emit(Events.WALL_REBUILT, { layout: { pivot: { resolution: resolutionOf('mesh-center') } } });
    assert.equal(r.view.exists, false);
    assert.equal(r.view.group, null);
    assert.deepEqual(r.helpers, []);
    assert.deepEqual(r.view.pickMeshes(), []);
    r.view.updateScale({ position: new Vector3(), fov: 50 }, 900);   // no-op before init
  });

  test('init registers one helper: every group at RENDER_ORDER.PIVOT_MARKER, everything on LAYERS.HELPERS', () => {
    const r = makeRig();
    r.view.init(resolutionOf('bottom-left'));
    assert.equal(r.view.exists, true);
    assert.deepEqual(r.helpers, [r.view.group]);
    for (const o of nodes(r.view)) {
      assert.equal(o.layers.mask, 1 << LAYERS.HELPERS, 'on HELPERS: the preview camera never sees it');
      if (o.isGroup) assert.equal(o.renderOrder, RENDER_ORDER.PIVOT_MARKER, 'r128 group order 996 on every group');
    }
    r.view.init(resolutionOf('mesh-center'));
    assert.equal(r.helpers.length, 1, 'init runs once');
  });

  test('two-tone materials drawn through the wall; dashed cores on LineSegments (never a LineLoop, 06 U12)', () => {
    const r = makeRig();
    r.view.init(resolutionOf('bottom-left'));
    const drawables = nodes(r.view).filter((o) => o.material);
    for (const o of drawables) {
      if (o.material.visible === false) continue;   // the pick proxy
      assert.equal(o.material.depthTest, false);
      assert.equal(o.material.depthWrite, false);
      assert.equal(o.material.transparent, true);
      assert.equal(o.material.opacity, ST.opacity);
      assert.notEqual(o.material.color.getHex(), 0x4488ff, 'never the person colour the harness picks by');
    }
    const dashed = drawables.filter((o) => o.material.isLineDashedMaterial);
    assert.equal(dashed.length, 4, 'cross, ghost, link and drop cores');
    for (const o of dashed) {
      assert.ok(o.isLineSegments);
      assert.ok(o.geometry.getAttribute('lineDistance'), 'line distances for the dashes');
      assert.equal(o.material.dashSize, ST.dash);
      assert.equal(o.renderOrder, 1, 'the core after its halo');
    }
    const halos = drawables.filter((o) => o.material.color.getHex() === ST.haloColor);
    assert.equal(halos.length, 5, 'four line halos and the octahedron halo');
    for (const o of halos) assert.equal(o.renderOrder, 0);
    assert.equal(r.view.pickMeshes().length, 1);
    assert.equal(r.view.pickMeshes()[0].material.visible, false, 'the pick proxy is never drawn');
    assert.equal(r.view.pickMeshes()[0].geometry.args[0], ST.pickRadius);
  });
});

describe('placement in the stage frame (03 5.3)', () => {
  test('mesh-center on the default wall: glyph (0, 0.75, 0) (AC 3), drop line on, no ghost or link', () => {
    const r = makeRig({ show: true });
    r.view.init(resolutionOf('mesh-center'));
    assert.deepEqual(xyz(r.view.glyphPosition(new Vector3())), [0, 0.75, 0]);
    assert.deepEqual(xyz(glyph(r.view).position), [0, 0.75, 0]);
    const [ghost, linkHalo, linkCore, dropHalo, dropCore] = r.view.group.children;
    assert.equal(ghost.visible, false);
    assert.equal(linkCore.visible, false);
    assert.equal(dropCore.visible && dropHalo.visible, true);
    const p = dropCore.geometry.getAttribute('position');
    assert.deepEqual([p.getX(0), p.getY(0), p.getZ(0), p.getX(1), p.getY(1), p.getZ(1)], [0, 0, 0, 0, 0.75, 0]);
    assert.deepEqual([...dropCore.geometry.getAttribute('lineDistance').array], [0, 0.75]);
    assert.equal(linkHalo.visible, false);
  });

  test('an offset: the ghost at the anchor (-offset.x, A.y, -offset.z) with the link to the glyph; floor pivot: no drop', () => {
    const r = makeRig({ show: true });
    r.view.init(resolutionOf('wall-center', { x: 0.5, y: 0, z: 2 }));
    const [ghost, , linkCore, , dropCore] = r.view.group.children;
    assert.deepEqual(xyz(ghost.position), [-0.5, 0, -2]);
    assert.equal(ghost.visible, true);
    assert.equal(linkCore.visible, true);
    assert.equal(dropCore.visible, false);
    assert.deepEqual(xyz(glyph(r.view).position), [0, 0, 0], 'the pivot is the stage origin');
  });

  test('a height-only WALL_PIVOT_CHANGED moves the glyph vertically; WALL_REBUILT follows the new anchor', () => {
    const r = makeRig({ show: true });
    r.view.init(resolutionOf('bottom-left'));
    r.bus.emit(Events.WALL_PIVOT_CHANGED, { resolution: resolutionOf('bottom-left', { x: 0, y: 1.5, z: 0 }) });
    assert.deepEqual(xyz(glyph(r.view).position), [0, 1.5, 0]);
    const tall = resolutionOf('mesh-center', undefined, [{ id: 0, name: 'W', panelCols: 5, panelRows: 5, panelWidth: 500,
      panelHeight: 500, ledX: 32, ledY: 32, curveIntensity: 0, angleOffset: 0, color: '#ffffff' }]);
    r.bus.emit(Events.WALL_REBUILT, { layout: { pivot: { resolution: tall } } });
    assert.deepEqual(xyz(glyph(r.view).position), [0, 1.25, 0]);
  });

  test('the drag preview moves the glyph, the drop and the link; the ghost stays; clearPreview restores', () => {
    const r = makeRig({ show: true });
    r.view.init(resolutionOf('mesh-center'));
    r.view.setPreview(0.3, 0, -1);
    const [ghost, , linkCore] = r.view.group.children;
    assert.deepEqual(xyz(glyph(r.view).position), [0.3, 0.75, -1]);
    assert.deepEqual(xyz(r.view.glyphPosition(new Vector3())), [0.3, 0.75, -1]);
    assert.deepEqual(xyz(ghost.position), [0, 0.75, 0]);
    assert.equal(ghost.visible, true, 'a non-zero effective offset shows the ghost and the link');
    assert.equal(linkCore.visible, true);
    r.view.clearPreview();
    assert.deepEqual(xyz(glyph(r.view).position), [0, 0.75, 0]);
    assert.equal(ghost.visible, false);
  });
});

describe('visibility and colour (03 3.3)', () => {
  test('shown by default (03 T9); with the marker toggle off, shown only while the pivot is selected', () => {
    const shown = makeRig({ show: Project.createDefault().display.showPivotMarker });
    shown.view.init(resolutionOf('bottom-left'));
    assert.equal(shown.view.visible, true, 'DEFAULT_SHOW_PIVOT_MARKER is true since step C');
    const r = makeRig();
    r.view.init(resolutionOf('bottom-left'));
    assert.equal(r.view.visible, false, 'the toggle off');
    r.bus.emit(Events.SELECTION_CHANGED, { id: 'pivot', label: 'Pivot', modes: ['translate'] });
    assert.equal(r.view.visible, true);
    r.bus.emit(Events.SELECTION_CHANGED, { id: 'camera', label: 'Camera', modes: ['translate', 'rotate'] });
    assert.equal(r.view.visible, false);
    r.display.showPivotMarker = true;
    r.bus.emit(Events.WALL_PIVOT_CHANGED, { source: 'marker', resolution: resolutionOf('bottom-left') });
    assert.equal(r.view.visible, true);
    r.bus.emit(Events.PILOT_CHANGED, { active: true });
    assert.equal(r.view.visible, false, '03 T9: hidden in pilot mode (AC 12), so the pick proxy is not pickable either');
    r.bus.emit(Events.SELECTION_CHANGED, { id: 'pivot' });
    assert.equal(r.view.visible, false, 'also while selected');
    r.bus.emit(Events.PILOT_CHANGED, { active: false });
    assert.equal(r.view.visible, true);
  });

  test('the cores turn Morph Red while the pivot is selected; the ghost keeps the anchor colour', () => {
    const r = makeRig({ show: true });
    r.view.init(resolutionOf('wall-center', { x: 1, y: 0, z: 0 }));
    const cores = () => nodes(r.view).filter((o) => o.renderOrder === 1 && o.material?.visible !== false)
      .map((o) => o.material.color.getHex());
    assert.deepEqual(cores().sort(), [ST.anchorColor, ST.anchorColor, ST.color, ST.color, ST.color].sort());
    r.bus.emit(Events.SELECTION_CHANGED, { id: 'pivot' });
    assert.deepEqual(cores().sort(), [ST.anchorColor, ST.anchorColor, ST.color, ST.selectedColor, ST.selectedColor].sort(),
      'the cross and the octahedron cores; the drop line keeps the idle colour');
    r.bus.emit(Events.SELECTION_CHANGED, { id: null });
    assert.ok(!cores().includes(ST.selectedColor));
  });

  test('test 15: a null resolution hides the marker; glyphPosition is the finite preview; hasResolution false', () => {
    const r = makeRig({ show: true });
    r.view.init(null);
    assert.equal(r.view.visible, false);
    assert.equal(r.view.hasResolution, false);
    assert.deepEqual(xyz(r.view.glyphPosition(new Vector3(NaN, NaN, NaN))), [0, 0, 0]);
    r.view.setPreview(0.2, 0, 0);
    assert.deepEqual(xyz(r.view.glyphPosition(new Vector3())), [0.2, 0, 0], 'never dereferences the null resolution');
    r.bus.emit(Events.WALL_PIVOT_CHANGED, { resolution: resolutionOf('mesh-center') });
    assert.equal(r.view.visible, true, 'a later finite resolution shows it again');
  });
});

describe('the minimum on-screen size (03 3.3)', () => {
  const wpp = (d, fov, h) => 2 * d * Math.tan(fov * Math.PI / 360) / h;

  test('far away the cross keeps 24 px per arm; close up it keeps its world size (s = 1); a no-op while hidden', () => {
    const r = makeRig({ show: true });
    r.view.init(resolutionOf('bottom-left'));
    const far = { position: new Vector3(0, 0, 30), fov: 50 };
    r.view.updateScale(far, 940);
    const s = glyph(r.view).scale.x;
    assert.ok(Math.abs(s * ST.glyphHalfSize / wpp(30, 50, 940) - ST.minScreenHalfSizePx) < 1e-9, '24 px per arm at 30 m');
    assert.equal(r.view.group.children[0].scale.x, s, 'the ghost is scaled alike');
    r.view.updateScale({ position: new Vector3(0, 0, 1), fov: 50 }, 940);
    assert.equal(glyph(r.view).scale.x, 1);
    r.display.showPivotMarker = false;
    r.bus.emit(Events.WALL_PIVOT_CHANGED, { resolution: resolutionOf('bottom-left') });
    r.view.updateScale(far, 940);
    assert.equal(glyph(r.view).scale.x, 1, 'hidden: untouched');
    r.display.showPivotMarker = true;
    r.bus.emit(Events.WALL_PIVOT_CHANGED, { resolution: resolutionOf('bottom-left') });
    r.view.updateScale(far, 0);
    assert.equal(glyph(r.view).scale.x, 1, 'a zero-height canvas: untouched');
  });
});

describe('dispose', () => {
  test('removes the helper and disposes every geometry and material exactly once', () => {
    const r = makeRig();
    r.view.init(resolutionOf('mesh-center'));
    const resources = new Set();
    for (const o of nodes(r.view)) { if (o.geometry) resources.add(o.geometry); if (o.material) resources.add(o.material); }
    r.view.dispose();
    assert.deepEqual(r.helpers, []);
    for (const res of resources) assert.equal(res.disposed, 1);
    assert.equal(r.view.exists, false);
  });
});

describe('SceneManager.addPreRender (07 C46) and App\'s registration (03 5.8)', () => {
  test('the hooks run in order before every main render with the main camera', () => {
    const container = { clientWidth: 1200, clientHeight: 940 };
    const canvas = { parentElement: container, clientHeight: 940 };
    const sm = new SceneManager({ canvas, win: { devicePixelRatio: 1 }, display: Project.createDefault().display, theme: Theme });
    sm.init();
    const log = [];
    sm.addPreRender((camera) => log.push(['a', camera === sm.camera]));
    sm.addPreRender(() => log.push(['b']));
    draws.length = 0;
    sm.render();
    sm.render();
    assert.deepEqual(log, [['a', true], ['b'], ['a', true], ['b']]);
    assert.equal(draws.length, 2);
  });

  test('App registers the marker\'s updateScale through addPreRender and allocates the marker last', () => {
    const src = readFileSync(join(ROOT, 'js/app/App.js'), 'utf8');
    assert.match(src, /sceneManager\.addPreRender\(\(camera\) => pivotMarker\.updateScale\(camera, sceneManager\.canvas\.clientHeight\)\)/);
    const init = src.indexOf('pivotMarker.init(wallController.pivotResolution)');
    assert.ok(init > src.indexOf("orbit.setView('reset');"), 'after the reset view');
    assert.ok(init < src.indexOf('runFontGate('), 'the last synchronous bootstrap step');
  });
});
