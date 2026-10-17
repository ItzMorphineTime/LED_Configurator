// Unit tests for the debug-shading override of js/render/LEDWallView.js (docs/improvements/01-normals.md 5.2, 8.1;
// acceptance criteria 11, 12 and 20; 01 T5; 07 C48), with a recording fake THREE installed as window.THREE before the
// module is imported (js/vendor/three.js reads window.THREE when it is evaluated):
// 1. setDebugShading shows the shared debug material on every LED mesh in every mesh mode and "content" restores the
//    originals; the override follows display.wireframe and survives rebuilds, which restore the originals first, so a
//    rebuild disposes every original exactly once and never the debug material;
// 2. withContentMaterials(fn) runs fn with the original materials and re-applies the shading afterwards, also when fn
//    throws; with "content" shading it only calls fn.
// Run: node --test tests/unit/led-wall-view.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Project } from '../../js/domain/Project.js';
import { WallSection } from '../../js/domain/WallSection.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';
import { layoutProject } from '../../js/geometry/WallLayout.js';
import { WallPivot } from '../../js/domain/Wall.js';
import { WallMeshBuilder } from '../../js/geometry/WallMeshBuilder.js';

/** Every disposed resource, by name, in order. */
const disposed = [];
let nextId = 0;
class FakeObject3D {
  constructor() {
    this.isObject3D = true; this.children = []; this.userData = {};
    this.position = { sets: [], set(...xyz) { this.sets.push(xyz); } }; this.rotation = {};
  }
  add(child) { this.children.push(child); }
  traverse(cb) { cb(this); this.children.forEach((c) => c.traverse(cb)); }
}
class FakeGeometry {
  constructor() { this.attributes = {}; this.index = null; this.name = `geometry-${nextId++}`; }
  setAttribute(name, attribute) { this.attributes[name] = attribute; }
  setIndex(index) { this.index = index; }
  dispose() { disposed.push(this.name); }
}
class FakeMesh extends FakeObject3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.isMesh = true; } }
const FakeTHREE = {
  Group: FakeObject3D, Mesh: FakeMesh, BufferGeometry: FakeGeometry, PlaneGeometry: FakeGeometry,
  Float32BufferAttribute: class { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; } },
  Uint32BufferAttribute: class { constructor(array) { this.array = array; } },
  Color: class { constructor(c) { this.c = c; this.r = 0; this.g = 0; this.b = 0; } },
};
globalThis.window = { THREE: FakeTHREE };
const { LEDWallView } = await import('../../js/render/LEDWallView.js');

/** A material stand-in that records its disposal. */
const material = (name) => ({ name, wireframe: false, dispose() { disposed.push(name); } });

/** The view with a fake scene, a material factory that names every material it makes, and two debug materials. */
function setup(meshMode = 'combined', pivot = null) {
  const project = Project.createDefault();
  project.wall.replaceAll([
    new WallSection({ id: 0, name: 'A', panelCols: 2, panelRows: 1, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32, curveIntensity: 0, angleOffset: 0, color: '#00f0ff' }),
    new WallSection({ id: 1, name: 'B', panelCols: 1, panelRows: 2, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32, curveIntensity: 10, angleOffset: 0, color: '#ff00aa' }),
  ]);
  if (pivot) project.wall.pivot = pivot;
  let made = 0;
  const materials = {
    beginRebuild() {},
    combined: () => material(`content-${made++}`),
    section: () => material(`content-${made++}`),
    panel: () => material(`content-${made++}`),
  };
  const debug = { faceOrientation: material('debug-face'), normalColors: material('debug-normals') };
  const debugMaterials = {
    forShading(mode) {
      if (mode === 'content') return null;
      if (!debug[mode]) throw new RangeError(mode);
      return debug[mode];
    },
  };
  const scene = new Set();
  const sceneManager = { add: (o) => scene.add(o), remove: (o) => scene.delete(o) };
  const view = new LEDWallView({ sceneManager, materials, builder: new WallMeshBuilder(Strategies.mesh.viewport),
    theme: { scene: { frame: 0x4a4a5a } }, debugMaterials });
  const rebuild = () => view.rebuild({ layout: layoutProject(project), meshMode, display: project.display });
  return { project, view, debug, rebuild };
}
const names = (view) => view.meshes().map((m) => m.material.name);

describe('LEDWallView.setDebugShading (01 5.2, AC 11)', () => {
  for (const mode of ['combined', 'section', 'panel']) {
    test(`${mode} mode: every LED mesh shows the debug material; "content" restores the originals`, () => {
      const { view, debug, rebuild } = setup(mode);
      rebuild();
      const originals = names(view);
      assert.equal(originals.length, { combined: 1, section: 2, panel: 4 }[mode]);
      view.setDebugShading('faceOrientation');
      assert.ok(view.meshes().every((m) => m.material === debug.faceOrientation));
      view.setDebugShading('normalColors');
      assert.ok(view.meshes().every((m) => m.material === debug.normalColors));
      view.setDebugShading('content');
      assert.deepEqual(names(view), originals);
    });
  }

  test('the override follows display.wireframe and survives rebuilds; a rebuild disposes each original once, never the debug material', () => {
    disposed.length = 0;
    const { project, view, debug, rebuild } = setup('section');
    view.setDebugShading('faceOrientation');           // before the first rebuild: nothing to override yet
    rebuild();
    const first = view.meshes().map((m) => m);
    assert.ok(first.every((m) => m.material === debug.faceOrientation), 'applied by rebuild step 6');
    assert.equal(debug.faceOrientation.wireframe, false);
    project.display.wireframe = true;
    rebuild();
    assert.ok(view.meshes().every((m) => m.material === debug.faceOrientation));
    assert.equal(debug.faceOrientation.wireframe, true);
    assert.ok(first.every((m) => m.material.name.startsWith('content-')), 'the old meshes got their originals back before disposal');
    assert.deepEqual(disposed.filter((n) => n.startsWith('content-')), ['content-0', 'content-1']);
    assert.ok(!disposed.some((n) => n.startsWith('debug-')));
    view.setDebugShading('content');
    assert.deepEqual(names(view), ['content-2', 'content-3']);
  });
});

describe('LEDWallView.withContentMaterials (07 C48, AC 20)', () => {
  test('fn runs with the original materials; the shading is re-applied afterwards and fn\'s value returned', () => {
    const { view, debug, rebuild } = setup('section');
    rebuild();
    view.setDebugShading('normalColors');
    const seen = view.withContentMaterials(() => names(view));
    assert.deepEqual(seen, ['content-0', 'content-1']);
    assert.ok(view.meshes().every((m) => m.material === debug.normalColors));
  });

  test('the shading is re-applied when fn throws, and the error propagates', () => {
    const { view, debug, rebuild } = setup('combined');
    rebuild();
    view.setDebugShading('faceOrientation');
    assert.throws(() => view.withContentMaterials(() => { throw new Error('capture failed'); }), /capture failed/);
    assert.ok(view.meshes().every((m) => m.material === debug.faceOrientation));
  });

  test('with "content" shading it only calls fn', () => {
    const { view, rebuild } = setup('panel');
    rebuild();
    const before = view.meshes().map((m) => m.material);
    let calls = 0;
    assert.equal(view.withContentMaterials(() => { calls++; return 7; }), 7);
    assert.equal(calls, 1);
    assert.deepEqual(view.meshes().map((m) => m.material), before);
  });
});

describe('no wall root transform, ever (07 C32, 03 5.1, 8.1): the frames are baked by layoutProject', () => {
  for (const meshMode of ['combined', 'section', 'panel']) {
    test(`${meshMode} mode: the wall and frame groups keep the identity transform after every rebuild, for every pivot`, () => {
      const pivots = [null];
      for (const mode of ['bottom-left', 'wall-center', 'mesh-center']) {
        const pivot = new WallPivot();
        pivot.setMode(mode);
        pivot.setOffset({ x: 0.5, y: 1, z: 2 });
        pivots.push(pivot);
      }
      for (const pivot of pivots) {
        const { view, rebuild, project } = setup(meshMode, pivot);
        rebuild();
        rebuild();
        for (const group of [view.wallGroup, view.frameGroup]) {
          assert.deepEqual(group.position.sets, [], 'no position on a group');
          assert.deepEqual(group.rotation, {}, 'no rotation on a group');
          assert.equal(group.scale, undefined, 'no scale on a group');
          assert.equal(group.quaternion, undefined, 'no quaternion on a group');
        }
        if (meshMode === 'panel') {
          // the panel meshes stand at the stage-frame panel centres (the walk translated by -(P.x, 0, P.z))
          const stage = layoutProject(project);
          const centres = stage.sections.flatMap((sl) => sl.panels.map((pnl) => [pnl.x, pnl.y, pnl.z]));
          assert.deepEqual(view.meshes().map((m) => m.position.sets.at(-1)), centres);
        }
      }
    });
  }
});
