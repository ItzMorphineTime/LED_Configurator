// Unit tests for 07 R1, the render layers (docs/improvements/07-platform-foundations.md 5.2.1, 6.2; AC 2 and the R1 rows
// of 8.4): the layer table and the camera masks, SceneManager's helper registry (addHelper with a layer, the per-frame
// enforcement, tagHelper, the 'default' roots and withPassHidden, removeHelper, the pilot toggle of HELPERS, the
// ?debug=1 audit), PilotController.toggle's call, and the wiring of the views and App (the gizmo is a 'default' helper,
// the normal lines are DEBUG, the preview runs inside withPassHidden).
// three.js is tests/unit/fixtures/fake-three.mjs plus the few classes SceneManager.init needs, installed as window.THREE.
// Run: node --test tests/unit/render-layers.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FakeTHREE, Object3D, Group, Layers } from './fixtures/fake-three.mjs';

const draws = [];
class PerspectiveCamera extends Object3D {
  constructor(fov) { super(); this.fov = fov; this.layers = new Layers(); }
  updateProjectionMatrix() {}
}
class WebGLRenderer {
  constructor({ canvas }) { this.domElement = canvas; }
  setSize() {} setPixelRatio() {}
  render(scene, camera) { draws.push({ scene, camera, mask: camera.layers.mask }); }
}
const SceneFakes = {
  ...FakeTHREE, PerspectiveCamera, WebGLRenderer,
  AmbientLight: class extends Object3D {}, PointLight: class extends Object3D {},
  GridHelper: class extends Object3D {}, AxesHelper: class extends Object3D {},
};
globalThis.window = { THREE: SceneFakes };
const { SceneManager, LAYERS, LAYER_MASKS } = await import('../../js/render/SceneManager.js');
const { PilotController } = await import('../../js/interaction/PilotController.js');
const { EventBus } = await import('../../js/core/EventBus.js');
const { Theme } = await import('../../js/theme/Theme.js');
const { Project } = await import('../../js/domain/Project.js');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** An initialised SceneManager over a fake canvas; `search` is the page's location.search. */
function sceneManager({ search = '', warn = null } = {}) {
  const container = { clientWidth: 1200, clientHeight: 940 };
  const canvas = { parentElement: container, clientHeight: 940 };
  const win = { devicePixelRatio: 1, location: { search }, console: { warn: warn ?? (() => {}) } };
  const sm = new SceneManager({ canvas, win, display: Project.createDefault().display, theme: Theme });
  sm.init();
  return sm;
}

/** A group with one child mesh, as a view builds its helper root. */
function root() {
  const g = new Group();
  g.add(new Object3D());
  return g;
}

describe('the layer table and the camera masks (07 5.2.1, 6.2)', () => {
  test('four layers; main 0b1111, pilot 0b1101, preview 0b0101', () => {
    assert.deepEqual({ ...LAYERS }, { DEFAULT: 0, HELPERS: 1, ENVIRONMENT: 2, DEBUG: 3 });
    assert.equal(LAYER_MASKS.MAIN, 0b1111);
    assert.equal(LAYER_MASKS.MAIN_PILOT, 0b1101);
    assert.equal(LAYER_MASKS.PREVIEW, 0b0101);
    assert.ok(Object.isFrozen(LAYERS) && Object.isFrozen(LAYER_MASKS));
  });

  test('init: the main camera sees every layer; the grid and the axes are HELPERS', () => {
    const sm = sceneManager();
    assert.equal(sm.camera.layers.mask, LAYER_MASKS.MAIN);
    assert.equal(sm.grid.layers.mask, 1 << LAYERS.HELPERS);
    assert.equal(sm.axes.layers.mask, 1 << LAYERS.HELPERS);
  });

  test('setHelpersVisibleInMain toggles HELPERS only', () => {
    const sm = sceneManager();
    sm.setHelpersVisibleInMain(false);
    assert.equal(sm.camera.layers.mask, LAYER_MASKS.MAIN_PILOT);
    sm.setHelpersVisibleInMain(false);
    assert.equal(sm.camera.layers.mask, LAYER_MASKS.MAIN_PILOT, 'idempotent');
    sm.setHelpersVisibleInMain(true);
    assert.equal(sm.camera.layers.mask, LAYER_MASKS.MAIN);
  });
});

describe('SceneManager helper registry (07 R1, 6.2)', () => {
  test('addHelper tags the whole subtree with HELPERS by default, or with the given layer, and adds the root to the scene', () => {
    const sm = sceneManager();
    const a = root();
    const b = root();
    sm.addHelper(a);
    sm.addHelper(b, { layer: LAYERS.DEBUG });
    assert.ok(sm.scene.children.includes(a) && sm.scene.children.includes(b));
    a.traverse((n) => assert.equal(n.layers.mask, 1 << LAYERS.HELPERS));
    b.traverse((n) => assert.equal(n.layers.mask, 1 << LAYERS.DEBUG));
  });

  test('a child added to a registered root later is re-tagged at the next render (per-frame enforcement)', () => {
    const sm = sceneManager();
    const a = root();
    sm.addHelper(a);
    const late = new Object3D();
    const lateChild = new Object3D();
    late.add(lateChild);
    a.add(late);
    assert.equal(late.layers.mask, 1, 'Object3D.layers is not inherited');
    draws.length = 0;
    sm.render();
    assert.equal(late.layers.mask, 1 << LAYERS.HELPERS);
    assert.equal(lateChild.layers.mask, 1 << LAYERS.HELPERS);
    assert.equal(draws.length, 1);
    assert.equal(draws[0].camera, sm.camera);
  });

  test('tagHelper re-tags at once under its registered root; an object under no root is untouched', () => {
    const sm = sceneManager();
    const a = root();
    sm.addHelper(a, { layer: LAYERS.DEBUG });
    const late = new Object3D();
    a.children[0].add(late);
    sm.tagHelper(late);
    assert.equal(late.layers.mask, 1 << LAYERS.DEBUG);
    const stray = new Object3D();
    sm.tagHelper(stray);
    assert.equal(stray.layers.mask, 1);
  });

  test("a 'default' root keeps layer 0 and is hidden only inside withPassHidden", () => {
    const sm = sceneManager();
    const gizmo = root();
    sm.addHelper(gizmo, { layer: 'default' });
    sm.render();
    gizmo.traverse((n) => assert.equal(n.layers.mask, 1, 'never re-tagged: the main and the pilot view keep drawing it'));
    const seen = sm.withPassHidden(() => gizmo.visible);
    assert.equal(seen, false, 'hidden during the pass');
    assert.equal(gizmo.visible, true, 'restored');
  });

  test('withPassHidden keeps a root hidden for another reason hidden, and restores every flag when fn throws', () => {
    const sm = sceneManager();
    const shown = root();
    const hidden = root();
    hidden.visible = false;
    sm.addHelper(shown, { layer: 'default' });
    sm.addHelper(hidden, { layer: 'default' });
    sm.withPassHidden(() => assert.deepEqual([shown.visible, hidden.visible], [false, false]));
    assert.deepEqual([shown.visible, hidden.visible], [true, false]);
    assert.throws(() => sm.withPassHidden(() => { throw new Error('context lost'); }), /context lost/);
    assert.deepEqual([shown.visible, hidden.visible], [true, false]);
  });

  test('withPassHidden leaves the HELPERS and DEBUG roots alone (the preview camera mask excludes them)', () => {
    const sm = sceneManager();
    const rig = root();
    sm.addHelper(rig);
    sm.withPassHidden(() => assert.equal(rig.visible, true));
  });

  test('removeHelper unregisters: no re-tag at the next render, no hiding in withPassHidden', () => {
    const sm = sceneManager();
    const a = root();
    const gizmo = root();
    sm.addHelper(a);
    sm.addHelper(gizmo, { layer: 'default' });
    sm.removeHelper(a);
    sm.removeHelper(gizmo);
    assert.ok(!sm.scene.children.includes(a) && !sm.scene.children.includes(gizmo));
    a.traverse((n) => n.layers.set(LAYERS.DEFAULT));
    sm.render();
    a.traverse((n) => assert.equal(n.layers.mask, 1));
    sm.withPassHidden(() => assert.equal(gizmo.visible, true));
  });

  test('the ?debug=1 audit warns every 120 rendered frames about a helper-marked node outside every registered root', () => {
    const warnings = [];
    const sm = sceneManager({ search: '?debug=1', warn: (m, n) => warnings.push([m, n]) });
    const registered = root();
    registered.children[0].userData.helper = true;
    sm.addHelper(registered);
    const stray = new Object3D();
    stray.userData.helper = true;
    sm.add(stray);
    for (let i = 0; i < 119; i++) sm.render();
    assert.deepEqual(warnings, []);
    sm.render();
    assert.deepEqual(warnings, [['unregistered helper', stray]]);
    const quiet = [];
    const off = sceneManager({ warn: () => quiet.push(1) });
    off.add(stray);
    for (let i = 0; i < 240; i++) off.render();
    assert.deepEqual(quiet, [], 'no audit without ?debug=1');
  });
});

describe('PilotController.toggle turns the main view\'s HELPERS layer off while piloting (07 R1, Q7)', () => {
  test('entry: off; exit: on; a refused entry changes nothing', () => {
    const log = [];
    const camera = { position: { clone: () => 'p', copy() {} }, fov: 50, updateProjectionMatrix() {} };
    const cine = { enabled: false };
    const interaction = { pilotMode: false };
    const pilot = new PilotController({
      sceneManager: { camera, setHelpersVisibleInMain: (on) => log.push(on) },
      cine, driver: { enterView() {} },
      orbit: { snapshot: () => 'o', restore() {}, updateCameraPosition() {} },
      keyboard: {}, interaction, hub: { refresh() {} }, bus: new EventBus(), dialogs: { alert() {} },
    });
    pilot.toggle();
    assert.deepEqual(log, [], 'the preview guard refused the entry');
    cine.enabled = true;
    pilot.toggle();
    pilot.toggle();
    assert.deepEqual(log, [false, true]);
  });
});

describe('the wiring of the layers (07 5.2.1 layer table)', () => {
  test("the gizmo is a 'default' helper; the normal lines are DEBUG; the rig, safe distance and marker use the HELPERS default", () => {
    assert.match(read('js/interaction/TransformGizmo.js'), /addHelper\(gizmoGroup, \{ layer: 'default' \}\)/);
    const normals = read('js/render/NormalsDebugView.js');
    assert.match(normals, /addHelper\(lines, \{ layer: LAYERS\.DEBUG \}\)/);
    assert.match(normals, /lines\.layers\.set\(LAYERS\.DEBUG\)/);
    assert.match(read('js/render/CameraRigView.js'), /addHelper\(this\.#group\);/);
    assert.match(read('js/render/SafeDistanceView.js'), /addHelper\(group\);/);
    assert.match(read('js/render/PivotMarkerView.js'), /addHelper\(group\);/);
  });

  test('App runs the camera preview inside withPassHidden; nothing reads a helper set any more', () => {
    const app = read('js/app/App.js');
    assert.match(app, /sceneManager\.withPassHidden\(\(\) => preview\.render\(sceneManager\.scene\)\)/);
    assert.doesNotMatch(app, /sceneManager\.helpers/);
  });
});
