// Unit tests for interaction/SelectionManager's path-B additions (docs/improvements/03-pivot.md 5.4; 03 T5, test 18 of
// 8.1): the required `kind` (inferred only for the legacy ids), the pickAt rule (pickPriority counts only against wall,
// i.e. section, hits; otherwise the nearest hit wins, the legacy rule bit for bit) and the SELECTION_CHANGED `modes`.
// Fake meshes, hits and gizmo; no THREE (SelectionManager imports only core/EventBus).
// Run: node --test tests/unit/selection.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Events, EventBus } from '../../js/core/EventBus.js';
import { SelectionManager } from '../../js/interaction/SelectionManager.js';

/** A Selectable stub whose pickMeshes() is one fake mesh. */
function selectable(id, { kind, pickPriority, allowedAxes, pickable = true } = {}) {
  const s = { id, label: id.toUpperCase(), mesh: { name: id, userData: {} } };
  if (kind !== undefined) s.kind = kind;
  if (pickPriority !== undefined) s.pickPriority = pickPriority;
  if (allowedAxes) s.allowedAxes = allowedAxes;
  s.isPickable = () => pickable;
  s.pickMeshes = () => [s.mesh];
  return s;
}

/**
 * A SelectionManager with a fake gizmo (mode translate unless given) and a fake pointer ray whose raycaster returns, for
 * the meshes it is asked about, the hits of `rig.hits` (each [selectable, distance]) in distance order.
 */
function makeRig({ mode = 'translate' } = {}) {
  const bus = new EventBus();
  const changes = [];
  bus.on(Events.SELECTION_CHANGED, (p) => changes.push(p));
  const gizmo = { mode, attached: [], attach(t) { this.attached.push(t?.id ?? null); }, detach() { this.attached.push('detach'); } };
  const rig = { hits: [] };
  const pointerRay = {
    fromEvent: () => ({
      intersectObjects: (meshes) => rig.hits
        .filter(([s]) => meshes.includes(s.mesh))
        .map(([s, distance]) => ({ object: s.mesh, distance }))
        .sort((a, b) => a.distance - b.distance),
    }),
  };
  const interaction = { isDraggingGizmo: false, pilotMode: false };
  const selection = new SelectionManager({ bus, gizmo, pointerRay, interaction });
  rig.selection = selection;
  rig.changes = changes;
  rig.gizmo = gizmo;
  rig.interaction = interaction;
  return rig;
}

describe('register: kind is required for every Selectable added after Phase 1 (03 5.4)', () => {
  test('the legacy ids camera, person and car get their kind inferred; a new id without kind throws', () => {
    const r = makeRig();
    for (const id of ['camera', 'person', 'car']) r.selection.register(selectable(id));
    assert.equal(r.selection.kindOf(r.selection.find('camera')), 'camera');
    assert.equal(r.selection.kindOf(r.selection.find('person')), 'prop');
    assert.equal(r.selection.kindOf(r.selection.find('car')), 'prop');
    assert.throws(() => r.selection.register(selectable('pivot')), /kind/);
    r.selection.register(selectable('pivot', { kind: 'pivot', pickPriority: 10 }));
    assert.equal(r.selection.kindOf(r.selection.find('pivot')), 'pivot');
  });
});

describe('pickAt: pickPriority counts only against wall hits (test 18)', () => {
  /** The 6.8 stage-origin layouts: camera, person, car, the pivot (10), spec 05's HDRI point (9) and a wall section. */
  function scene() {
    const r = makeRig();
    const s = {
      camera: selectable('camera'),
      person: selectable('person'),
      car: selectable('car'),
      pivot: selectable('pivot', { kind: 'pivot', pickPriority: 10 }),
      hdri: selectable('hdri-point', { kind: 'projector', pickPriority: 9 }),
      section: selectable('section:0', { kind: 'section', pickPriority: 0 }),
      section2: selectable('section:1', { kind: 'section' }),
    };
    for (const k of ['camera', 'person', 'car', 'pivot', 'hdri', 'section', 'section2']) r.selection.register(s[k]);
    return { r, s };
  }
  const pick = (r, hits) => { r.hits = hits; r.selection.pickAt({}); return r.selection.selectedId; };

  test('a nearer camera body or person wins over the pivot behind it', () => {
    const { r, s } = scene();
    assert.equal(pick(r, [[s.camera, 3], [s.pivot, 4.5]]), 'camera');
    const t = scene();
    assert.equal(pick(t.r, [[t.s.person, 4], [t.s.pivot, 6]]), 'person');
  });

  test('through a wall hit: the pivot (positive priority) wins over the section in front; a camera (priority 0) does not', () => {
    const { r, s } = scene();
    assert.equal(pick(r, [[s.section, 2], [s.pivot, 4.5]]), 'pivot');
    const t = scene();
    assert.equal(pick(t.r, [[t.s.section, 2], [t.s.camera, 4]]), 'section:0');
  });

  test('the highest priority among non-wall hits behind the wall; equal priorities: the nearer', () => {
    const { r, s } = scene();
    assert.equal(pick(r, [[s.section, 2], [s.hdri, 3], [s.pivot, 5]]), 'pivot');
    const t = scene();
    const twin = selectable('pivot-twin', { kind: 'pivot', pickPriority: 10 });
    t.r.selection.register(twin);
    assert.equal(pick(t.r, [[t.s.section, 2], [t.s.pivot, 5], [twin, 6]]), 'pivot');
    const u = scene();
    assert.equal(pick(u.r, [[u.s.section, 2], [u.s.section2, 3]]), 'section:0', 'only walls: the nearest');
  });

  test('without section hits (before spec 02) every hit list gives the nearest hit (legacy)', () => {
    const { r, s } = scene();
    assert.equal(pick(r, [[s.pivot, 1], [s.camera, 2]]), 'pivot');
    const t = scene();
    assert.equal(pick(t.r, [[t.s.hdri, 2], [t.s.pivot, 2.5], [t.s.car, 3]]), 'hdri-point');
    const u = scene();
    assert.equal(pick(u.r, [[u.s.car, 7]]), 'car');
  });

  test('legacy behaviour kept: a miss deselects; a hit on the selected object does nothing; no gizmo mode: no pick', () => {
    const { r, s } = scene();
    assert.equal(pick(r, [[s.car, 7]]), 'car');
    const before = r.changes.length;
    pick(r, [[s.car, 7]]);
    assert.equal(r.changes.length, before, 'the selected object again: nothing');
    assert.equal(pick(r, []), null);
    assert.deepEqual(r.changes.at(-1), { id: null, label: null, modes: [] });
    const off = makeRig({ mode: null });
    off.selection.register(s.car);
    assert.equal(pick(off, [[s.car, 1]]), null);
  });
});

describe('SELECTION_CHANGED.modes: the modes whose allowedAxes is not null (03 5.4, 07 5.4.1)', () => {
  test('legacy targets: both modes; the pivot: translate only; deselect: []', () => {
    const r = makeRig();
    r.selection.register(selectable('camera'));
    r.selection.register(selectable('pivot', { kind: 'pivot', allowedAxes: (m) => (m === 'translate' ? { x: true, y: true, z: true } : null) }));
    r.selection.select('camera');
    r.selection.select('pivot');
    r.selection.deselect();
    assert.deepEqual(r.changes, [
      { id: 'camera', label: 'CAMERA', modes: ['translate', 'rotate'] },
      { id: 'pivot', label: 'PIVOT', modes: ['translate'] },
      { id: null, label: null, modes: [] },
    ]);
    assert.deepEqual(r.gizmo.attached, ['camera', 'pivot', 'detach'], 'emitted before attach / detach, as legacy');
  });
});
