// Unit tests for WP7's app layer: CameraHub (pipeline P2, ARCHITECTURE.md 6.3), CameraController (P-PREVIEW and the
// camera use cases, 6.5; Selectable 'camera', 3.10) and PropController (6.8; Selectables 'person' / 'car').
// The render, interaction and selection collaborators are recording stubs; the EventBus and the Project are real,
// and spy subscribers on every event record the order of emits relative to the direct calls.
// No THREE is needed: app/ imports none (Vector3 / Euler arguments are duck-typed fakes).
// Run: node --test tests/unit/camera-hub.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Events, EventBus } from '../../js/core/EventBus.js';
import { Project } from '../../js/domain/Project.js';
import { WallLayout, framingBounds } from '../../js/geometry/WallLayout.js';
import { CameraHub, CameraController } from '../../js/app/CameraController.js';
import { PropController } from '../../js/app/PropController.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVENT_KEY = Object.fromEntries(Object.entries(Events).map(([key, type]) => [type, key]));

/** A copy of the camera pose fields (to see what subscribers observe at emit time). */
const poseOf = (cine) => ({
  posX: cine.posX, posY: cine.posY, posZ: cine.posZ, rotX: cine.rotX, rotY: cine.rotY, rotZ: cine.rotZ,
  filmback: cine.filmback, filmbackWidth: cine.filmbackWidth, filmbackHeight: cine.filmbackHeight,
});

/** The P2 steps after the optional rig.create, when the safe-distance overlay is off. */
const P2_TAIL_NO_SAFE = [
  'rig.rebuildFrustum', 'rig.updateTransform', 'frameBounds', 'emit CAMERA_COVERAGE_CHANGED', 'preview.updateCamera',
  'safeDistance.remove', 'pilotDriver.refresh', 'emit SELECTABLE_MOVED',
];

/**
 * Builds a real Project + EventBus, recording stubs for every injected collaborator, a real CameraHub and a real
 * CameraController (or one wired to a spy hub when `spyHub` is set).
 * Every entry of `log` is { call, ...details }.
 */
function setup({ enabled = false, rigExists = false, showSafeDistance = false, previewInitialized = false,
  pilotActive = false, selectedId = null, spyHub = false } = {}) {
  const log = [];
  const project = Project.createDefault();
  const cine = project.camera;
  cine.enabled = enabled;
  project.display.showSafeDistance = showSafeDistance;

  const bus = new EventBus();
  for (const type of Object.values(Events)) {
    bus.on(type, (payload) => log.push({
      call: `emit ${EVENT_KEY[type]}`, payload, enabled: cine.enabled, pose: poseOf(cine),
      showSafeDistance: project.display.showSafeDistance, personVisible: project.person.visible,
    }));
  }

  const bodyMesh = { name: 'camera-body' };
  const rig = {
    exists: rigExists,
    bodyMesh: rigExists ? bodyMesh : null,
    create(c) { log.push({ call: 'rig.create', arg: c }); this.exists = true; this.bodyMesh = bodyMesh; },
    rebuildFrustum(c) { log.push({ call: 'rig.rebuildFrustum', arg: c }); },
    updateTransform(c) { log.push({ call: 'rig.updateTransform', arg: c }); },
    remove() { log.push({ call: 'rig.remove' }); this.exists = false; this.bodyMesh = null; },  // nulled since 08 P2-4a
    pickMeshes() { return [this.bodyMesh]; },
  };
  const preview = {
    initialized: previewInitialized,
    setVisible(on) { log.push({ call: 'preview.setVisible', arg: on }); },
    init() { log.push({ call: 'preview.init' }); this.initialized = true; },
    updateCamera() { log.push({ call: 'preview.updateCamera' }); },
  };
  const safeDistance = {
    create(args) { log.push({ call: 'safeDistance.create', arg: args }); },
    remove() { log.push({ call: 'safeDistance.remove' }); },
  };
  const pilotDriver = { refresh() { log.push({ call: 'pilotDriver.refresh' }); } };
  const pilot = {
    active: pilotActive,
    // Reproduces PilotController.toggle's guard: since 08 P2-4a (B-H4 fixed) it alerts and returns only when ENTERING
    // pilot mode with the preview off.
    toggle() {
      log.push({ call: 'pilot.toggle', enabled: cine.enabled });
      if (!this.active && !cine.enabled) { log.push({ call: 'dialogs.alert' }); return; }
      this.active = !this.active;
    },
  };
  const selection = {
    selectedId,
    isSelected(id) { log.push({ call: 'selection.isSelected', arg: id }); return this.selectedId === id; },
    deselect() { log.push({ call: 'selection.deselect' }); this.selectedId = null; },
  };
  const frameBounds = () => { log.push({ call: 'frameBounds' }); return framingBounds(project); };

  const hub = spyHub
    ? {
        refresh() { log.push({ call: 'hub.refresh', enabled: cine.enabled }); },
        syncSafeDistance() { log.push({ call: 'hub.syncSafeDistance' }); },
      }
    : new CameraHub({ project, rig, preview, safeDistance, pilotDriver, frameBounds, bus });
  const controller = new CameraController({ project, rig, preview, hub, pilot, selection, frameBounds, bus });

  return {
    log, project, cine, bus, rig, preview, safeDistance, pilotDriver, pilot, selection, hub, controller, bodyMesh,
    calls: () => log.map((e) => e.call),
    entry: (call) => log.find((e) => e.call === call),
  };
}

/** A duck-typed THREE.Vector3 (set returns this, like THREE). */
const fakeVector = () => ({ x: NaN, y: NaN, z: NaN, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
/** A duck-typed THREE.Euler that records set() calls. */
const fakeEuler = () => ({ order: 'XYZ', x: 0, y: 0, z: 0, sets: [], set(x, y, z) { this.sets.push([x, y, z]); this.x = x; this.y = y; this.z = z; return this; } });

// ---------------------------------------------------------------------------------------------------------------
// CameraHub
// ---------------------------------------------------------------------------------------------------------------

describe('CameraHub.refresh (P2, ARCHITECTURE.md 6.3)', () => {
  test('returns before any step while the preview is off', () => {
    const s = setup({ enabled: false, showSafeDistance: true });
    s.hub.refresh();
    assert.deepEqual(s.log, []);
  });

  test('first refresh: create, rebuild, transform, coverage, preview, safe distance, pilot, gizmo follow (in order)', () => {
    const s = setup({ enabled: true });
    s.hub.refresh();
    assert.deepEqual(s.calls(), ['rig.create', ...P2_TAIL_NO_SAFE]);
    for (const call of ['rig.create', 'rig.rebuildFrustum', 'rig.updateTransform']) {
      assert.equal(s.entry(call).arg, s.cine, `${call} receives the project's CineCamera`);
    }
  });

  test('the coverage payload is cine.coverage(frameBounds()) and the gizmo event names the camera', () => {
    const s = setup({ enabled: true, rigExists: true });
    s.cine.posZ = 7.25;
    s.hub.refresh();
    assert.deepEqual(s.entry('emit CAMERA_COVERAGE_CHANGED').payload, s.cine.coverage(framingBounds(s.project)));
    assert.deepEqual(Object.keys(s.entry('emit CAMERA_COVERAGE_CHANGED').payload),
      ['frameWidth', 'frameHeight', 'status', 'safeDistance']);
    assert.deepEqual(s.entry('emit SELECTABLE_MOVED').payload, { id: 'camera' });
  });

  test('creates the rig only when it is missing', () => {
    const s = setup({ enabled: true, rigExists: true });
    s.hub.refresh();
    assert.deepEqual(s.calls(), P2_TAIL_NO_SAFE);

    const t = setup({ enabled: true });
    t.hub.refresh();
    t.hub.refresh();
    assert.equal(t.calls().filter((c) => c === 'rig.create').length, 1);
    assert.equal(t.calls().filter((c) => c === 'rig.rebuildFrustum').length, 2);
  });

  test('uses the create branch of syncSafeDistance when the overlay is on (every refresh rebuilds it, B-L30)', () => {
    const s = setup({ enabled: true, rigExists: true, showSafeDistance: true });
    s.hub.refresh();
    s.hub.refresh();
    const one = ['rig.rebuildFrustum', 'rig.updateTransform', 'frameBounds', 'emit CAMERA_COVERAGE_CHANGED',
      'preview.updateCamera', 'frameBounds', 'safeDistance.create', 'pilotDriver.refresh', 'emit SELECTABLE_MOVED'];
    assert.deepEqual(s.calls(), [...one, ...one]);
  });
});

describe('CameraHub.syncSafeDistance (legacy updateSafeDistance 2778-2784)', () => {
  test('creates with a fresh layout, the camera and the frame bounds when both flags are on', () => {
    const s = setup({ enabled: true, showSafeDistance: true });
    s.hub.syncSafeDistance();
    // The bounds (and the layout) are argument expressions: evaluated before create() runs (PR7).
    assert.deepEqual(s.calls(), ['frameBounds', 'safeDistance.create']);
    const args = s.entry('safeDistance.create').arg;
    assert.deepEqual(Object.keys(args), ['layout', 'cine', 'bounds']);
    assert.ok(args.layout instanceof WallLayout);
    assert.equal(args.layout.sections.length, 1);
    assert.equal(args.layout.sections[0].section, s.project.wall.sections[0]);
    assert.equal(args.layout.flatEdges().length, s.project.wall.sections[0].panelCols + 1);
    assert.equal(args.cine, s.cine);
    assert.deepEqual(args.bounds, framingBounds(s.project));
  });

  test('the layout is computed from the live sections on every call', () => {
    const s = setup({ enabled: true, showSafeDistance: true });
    s.hub.syncSafeDistance();
    s.project.wall.appendLikeLast(['#00f0ff']);
    s.hub.syncSafeDistance();
    const creates = s.log.filter((e) => e.call === 'safeDistance.create');
    assert.equal(creates[0].arg.layout.sections.length, 1);
    assert.equal(creates[1].arg.layout.sections.length, 2);
    assert.notEqual(creates[0].arg.layout, creates[1].arg.layout);
  });

  test('removes when the overlay toggle is off', () => {
    const s = setup({ enabled: true, showSafeDistance: false });
    s.hub.syncSafeDistance();
    assert.deepEqual(s.calls(), ['safeDistance.remove']);
  });

  test('removes when the preview is off, even with the overlay toggle on', () => {
    const s = setup({ enabled: false, showSafeDistance: true });
    s.hub.syncSafeDistance();
    assert.deepEqual(s.calls(), ['safeDistance.remove']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// CameraController: preview, reset, filmback, inputs, safe distance
// ---------------------------------------------------------------------------------------------------------------

describe('CameraController.setPreviewEnabled (P-PREVIEW, ARCHITECTURE.md 6.5)', () => {
  test('on (first time): model, options mirror, window, renderer init, reset (pose event), then P2', () => {
    const s = setup({ enabled: false });
    s.controller.setPreviewEnabled(true);
    assert.deepEqual(s.calls(), [
      'emit CAMERA_PREVIEW_CHANGED', 'preview.setVisible', 'preview.init',
      'frameBounds', 'emit CAMERA_POSE_CHANGED',
      'rig.create', ...P2_TAIL_NO_SAFE,
    ]);
    const previewEvent = s.entry('emit CAMERA_PREVIEW_CHANGED');
    assert.deepEqual(previewEvent.payload, { enabled: true });
    assert.equal(previewEvent.enabled, true, 'cine.enabled is written before the emit');
    assert.equal(s.entry('preview.setVisible').arg, true);
    assert.deepEqual(s.entry('emit CAMERA_POSE_CHANGED').payload, { source: 'reset' });
    assert.equal(s.cine.enabled, true);
  });

  test('on (renderer already initialised): no second init', () => {
    const s = setup({ enabled: false, previewInitialized: true });
    s.controller.setPreviewEnabled(true);
    assert.ok(!s.calls().includes('preview.init'));
    assert.deepEqual(s.calls().slice(0, 4),
      ['emit CAMERA_PREVIEW_CHANGED', 'preview.setVisible', 'frameBounds', 'emit CAMERA_POSE_CHANGED']);
  });

  test('on with the overlay toggle on: the reset refresh creates the safe-distance group', () => {
    const s = setup({ enabled: false, showSafeDistance: true });
    s.controller.setPreviewEnabled(true);
    assert.ok(s.calls().includes('safeDistance.create'));
  });

  test('off in pilot mode with the camera selected: rig removed, pilot.toggle AFTER enabled = false leaves pilot mode (B-H4 fixed in 08 P2-4a), deselect', () => {
    const s = setup({ enabled: true, rigExists: true, previewInitialized: true, pilotActive: true, selectedId: 'camera' });
    s.controller.setPreviewEnabled(false);
    assert.deepEqual(s.calls(), [
      'emit CAMERA_PREVIEW_CHANGED', 'preview.setVisible', 'rig.remove', 'safeDistance.remove',
      'pilot.toggle',
      'selection.isSelected', 'selection.deselect',
    ]);
    assert.deepEqual(s.entry('emit CAMERA_PREVIEW_CHANGED').payload, { enabled: false });
    assert.equal(s.entry('emit CAMERA_PREVIEW_CHANGED').enabled, false);
    assert.equal(s.entry('preview.setVisible').arg, false);
    assert.equal(s.entry('pilot.toggle').enabled, false, 'toggle runs while cine.enabled is already false');
    assert.equal(s.pilot.active, false, 'pilot mode is left, with no alert (legacy: the guard alerted and the app stayed in pilot mode)');
    assert.equal(s.entry('selection.isSelected').arg, 'camera');
  });

  test('off removes the safe-distance group right after the rig (B-M8 fixed in 08 P2-4b); on again rebuilds it', () => {
    const s = setup({ enabled: true, rigExists: true, previewInitialized: true, showSafeDistance: true });
    s.controller.setPreviewEnabled(false);
    assert.ok(!s.calls().includes('safeDistance.create'));
    assert.deepEqual(s.calls(), ['emit CAMERA_PREVIEW_CHANGED', 'preview.setVisible', 'rig.remove', 'safeDistance.remove', 'selection.isSelected']);
    s.log.length = 0;
    s.controller.setPreviewEnabled(true);
    assert.ok(s.calls().includes('safeDistance.create'), 'the next enable shows it again (08 criterion 20, cam_15)');
  });

  test('off outside pilot mode with nothing selected: no toggle, no deselect', () => {
    const s = setup({ enabled: true, rigExists: true, previewInitialized: true, selectedId: 'person' });
    s.controller.setPreviewEnabled(false);
    assert.deepEqual(s.calls(), ['emit CAMERA_PREVIEW_CHANGED', 'preview.setVisible', 'rig.remove', 'safeDistance.remove', 'selection.isSelected']);
    assert.equal(s.selection.selectedId, 'person');
  });
});

describe('CameraController.resetPose (legacy resetCameraPosition 2550-2575)', () => {
  test('resetTo(frameBounds()), then the reset pose event (subscribers see the new pose), then P2', () => {
    const s = setup({ enabled: true, rigExists: true });
    Object.assign(s.cine, { posX: 9, posY: 9, posZ: 9, rotX: 9, rotY: 9, rotZ: 9 });
    s.controller.resetPose();
    assert.deepEqual(s.calls(), ['frameBounds', 'emit CAMERA_POSE_CHANGED', ...P2_TAIL_NO_SAFE]);
    const b = framingBounds(s.project);
    assert.deepEqual(s.entry('emit CAMERA_POSE_CHANGED').pose,
      { ...poseOf(s.cine), posX: b.totalWidth / 2, posY: b.maxHeight / 2, posZ: 5, rotX: 0, rotY: 0, rotZ: 0 });
    assert.deepEqual(s.entry('emit CAMERA_POSE_CHANGED').payload, { source: 'reset' });
  });

  test('calls the hub unconditionally (the hub guards on the preview flag)', () => {
    const s = setup({ enabled: false, spyHub: true });
    s.controller.resetPose();
    assert.deepEqual(s.calls(), ['frameBounds', 'emit CAMERA_POSE_CHANGED', 'hub.refresh']);

    const real = setup({ enabled: false });
    real.controller.resetPose();
    assert.deepEqual(real.calls(), ['frameBounds', 'emit CAMERA_POSE_CHANGED']);
  });
});

describe('CameraController.setFilmback (4251-4264)', () => {
  test('applyPreset, then the filmback event (subscribers see the preset size), then the hub iff enabled', () => {
    const s = setup({ enabled: true, spyHub: true });
    s.controller.setFilmback('super35');
    assert.deepEqual(s.calls(), ['emit CAMERA_FILMBACK_CHANGED', 'hub.refresh']);
    const ev = s.entry('emit CAMERA_FILMBACK_CHANGED');
    assert.deepEqual(ev.payload, { key: 'super35' });
    assert.equal(ev.pose.filmback, 'super35');
    assert.equal(ev.pose.filmbackWidth, 24.89);
    assert.equal(ev.pose.filmbackHeight, 18.66);
  });

  test('no hub refresh while the preview is off', () => {
    const s = setup({ enabled: false, spyHub: true });
    s.controller.setFilmback('mft');
    assert.deepEqual(s.calls(), ['emit CAMERA_FILMBACK_CHANGED']);
    assert.equal(s.cine.filmbackWidth, 17.3);
  });

  test("'custom' keeps the current size", () => {
    const s = setup({ enabled: false, spyHub: true });
    s.controller.setFilmback('arri-lf');
    s.controller.setFilmback('custom');
    assert.equal(s.cine.filmback, 'custom');
    assert.equal(s.cine.filmbackWidth, 36.70);
    assert.equal(s.cine.filmbackHeight, 25.54);
  });
});

describe('CameraController lens/pose inputs and safe-distance toggle', () => {
  test('setCameraField stores and returns the rule value; commitCameraField refreshes iff enabled', () => {
    const s = setup({ enabled: false, spyHub: true });
    assert.equal(s.controller.setCameraField('focalLength', '2000'), 800);
    assert.equal(s.cine.focalLength, 800);
    assert.equal(s.controller.setCameraField('posY', '0'), 1.5, 'B-L9 via orDefault');
    assert.equal(s.controller.setCameraField('posX', 'abc'), 0);
    s.controller.commitCameraField();
    assert.deepEqual(s.calls(), []);

    s.cine.enabled = true;
    s.controller.commitCameraField();
    assert.deepEqual(s.calls(), ['hub.refresh']);
  });

  test('setSafeDistanceEnabled: model, then the toggle event, then hub.syncSafeDistance', () => {
    const s = setup({ enabled: false, spyHub: true });
    s.controller.setSafeDistanceEnabled(true);
    assert.deepEqual(s.calls(), ['emit CAMERA_SAFE_DISTANCE_TOGGLED', 'hub.syncSafeDistance']);
    assert.deepEqual(s.entry('emit CAMERA_SAFE_DISTANCE_TOGGLED').payload, { enabled: true });
    assert.equal(s.entry('emit CAMERA_SAFE_DISTANCE_TOGGLED').showSafeDistance, true);
    assert.equal(s.project.display.showSafeDistance, true);
  });

  test('setSafeDistanceEnabled with the real hub: create iff both flags, else remove', () => {
    const on = setup({ enabled: true });
    on.controller.setSafeDistanceEnabled(true);
    assert.deepEqual(on.calls(), ['emit CAMERA_SAFE_DISTANCE_TOGGLED', 'frameBounds', 'safeDistance.create']);

    const off = setup({ enabled: false });
    off.controller.setSafeDistanceEnabled(true);
    assert.deepEqual(off.calls(), ['emit CAMERA_SAFE_DISTANCE_TOGGLED', 'safeDistance.remove']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// CameraController as the Selectable 'camera'
// ---------------------------------------------------------------------------------------------------------------

describe("CameraController as the Selectable 'camera'", () => {
  test('id, label, pick gating, pick meshes, gizmo target', () => {
    const s = setup({ enabled: false });
    assert.equal(s.controller.id, 'camera');
    assert.equal(s.controller.label, 'Camera');
    assert.equal(s.controller.isPickable(), false, 'preview off');
    assert.equal(s.controller.hasGizmoTarget(), false);

    s.cine.enabled = true;
    assert.equal(s.controller.isPickable(), false, 'no body mesh yet');

    s.rig.create(s.cine);
    assert.equal(s.controller.isPickable(), true);
    assert.deepEqual(s.controller.pickMeshes(), [s.bodyMesh]);
    assert.equal(s.controller.hasGizmoTarget(), true);

    s.rig.remove();   // the body mesh is never nulled: the preview flag gates picking
    assert.equal(s.controller.hasGizmoTarget(), false);
    s.cine.enabled = false;
    assert.equal(s.controller.isPickable(), false);
  });

  test('gizmoAnchor sets and returns out at the camera eye; orientGizmo writes YXZ radians', () => {
    const s = setup();
    Object.assign(s.cine, { posX: 1.25, posY: 2.5, posZ: 7, rotX: 10, rotY: -30, rotZ: 45 });
    const out = fakeVector();
    assert.equal(s.controller.gizmoAnchor(out), out);
    assert.deepEqual([out.x, out.y, out.z], [1.25, 2.5, 7]);

    const rotation = fakeEuler();
    s.controller.orientGizmo(rotation);
    assert.equal(rotation.order, 'YXZ');
    assert.deepEqual(rotation.sets, [[10 * Math.PI / 180, -30 * Math.PI / 180, 45 * Math.PI / 180]]);
  });

  test("applyGizmoTranslate: translateBy (posY clamped at 0), 'gizmo-translate' event, hub iff enabled", () => {
    const s = setup({ enabled: true, spyHub: true });
    Object.assign(s.cine, { posX: 1, posY: 0.5, posZ: 5 });
    s.controller.applyGizmoTranslate({ x: 0.25, y: -2, z: -1 });
    assert.deepEqual(s.calls(), ['emit CAMERA_POSE_CHANGED', 'hub.refresh']);
    const ev = s.entry('emit CAMERA_POSE_CHANGED');
    assert.deepEqual(ev.payload, { source: 'gizmo-translate' });
    assert.deepEqual([ev.pose.posX, ev.pose.posY, ev.pose.posZ], [1.25, 0, 4], 'model written before the emit');

    const off = setup({ enabled: false, spyHub: true });
    off.controller.applyGizmoTranslate({ x: 1, y: 1, z: 1 });
    assert.deepEqual(off.calls(), ['emit CAMERA_POSE_CHANGED']);
  });

  test("applyGizmoRotate: rotateBy, 'gizmo-rotate' event with the axis, hub iff enabled", () => {
    const s = setup({ enabled: true, spyHub: true });
    s.controller.applyGizmoRotate('x', -120);
    s.controller.applyGizmoRotate('y', 400);
    s.controller.applyGizmoRotate('z', 15.5);
    assert.deepEqual(s.calls(), [
      'emit CAMERA_POSE_CHANGED', 'hub.refresh', 'emit CAMERA_POSE_CHANGED', 'hub.refresh',
      'emit CAMERA_POSE_CHANGED', 'hub.refresh',
    ]);
    const events = s.log.filter((e) => e.call === 'emit CAMERA_POSE_CHANGED');
    assert.deepEqual(events.map((e) => e.payload), [
      { source: 'gizmo-rotate', axis: 'x' }, { source: 'gizmo-rotate', axis: 'y' }, { source: 'gizmo-rotate', axis: 'z' },
    ]);
    assert.equal(events[0].pose.rotX, -90, 'x clamped to [-90, 90] before the emit');
    assert.equal(events[1].pose.rotY, 400, 'y unbounded');
    assert.equal(events[2].pose.rotZ, 15.5);

    const off = setup({ enabled: false, spyHub: true });
    off.controller.applyGizmoRotate('y', 5);
    assert.deepEqual(off.calls(), ['emit CAMERA_POSE_CHANGED']);
  });

  test('a gizmo drag with the real hub refreshes P2 and ends with the gizmo follow event', () => {
    const s = setup({ enabled: true, rigExists: true });
    s.controller.applyGizmoTranslate({ x: 0, y: 0.1, z: 0 });
    assert.deepEqual(s.calls(), ['emit CAMERA_POSE_CHANGED', ...P2_TAIL_NO_SAFE]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// PropController
// ---------------------------------------------------------------------------------------------------------------

/** A PropController for the project's person or car with a recording view and selection. */
function setupProp(kind = 'person', { exists = false, selectedId = null } = {}) {
  const log = [];
  const project = Project.createDefault();
  const prop = project[kind];
  const bus = new EventBus();
  for (const type of Object.values(Events)) {
    bus.on(type, (payload) => log.push({
      call: `emit ${EVENT_KEY[type]}`, payload, visible: prop.visible,
      pose: { posX: prop.posX, posZ: prop.posZ, rotY: prop.rotY, scale: prop.scale },
    }));
  }
  const meshes = [{ name: `${kind}-mesh-0` }, { name: `${kind}-mesh-1` }];
  const view = {
    exists,
    create() { log.push({ call: 'view.create' }); this.exists = true; },
    addToScene() { log.push({ call: 'view.addToScene' }); },
    updateTransform(p) { log.push({ call: 'view.updateTransform', arg: p }); },
    remove() { log.push({ call: 'view.remove' }); this.exists = false; },
    pickMeshes() { return meshes; },
  };
  const selection = {
    selectedId,
    isSelected(id) { log.push({ call: 'selection.isSelected', arg: id }); return this.selectedId === id; },
    deselect() { log.push({ call: 'selection.deselect' }); this.selectedId = null; },
  };
  const controller = new PropController({ prop, view, selection, bus });
  return {
    log, project, prop, bus, view, selection, controller, meshes,
    calls: () => log.map((e) => e.call),
    entry: (call) => log.find((e) => e.call === call),
  };
}

describe('PropController (ARCHITECTURE.md 6.8)', () => {
  test('setVisible(true): model, options event, build, transform + gizmo follow, then scene add', () => {
    const s = setupProp('person');
    s.controller.setVisible(true);
    assert.deepEqual(s.calls(), [
      'emit PROP_VISIBILITY_CHANGED', 'view.create', 'view.updateTransform', 'emit SELECTABLE_MOVED', 'view.addToScene',
    ]);
    assert.deepEqual(s.entry('emit PROP_VISIBILITY_CHANGED').payload, { id: 'person', visible: true });
    assert.equal(s.entry('emit PROP_VISIBILITY_CHANGED').visible, true, 'prop.visible is written before the emit');
    assert.equal(s.entry('view.updateTransform').arg, s.prop);
    assert.deepEqual(s.entry('emit SELECTABLE_MOVED').payload, { id: 'person' });
  });

  test('setVisible(false): model, options event, remove, deselect iff selected', () => {
    const s = setupProp('car', { exists: true, selectedId: 'car' });
    s.prop.visible = true;
    s.controller.setVisible(false);
    assert.deepEqual(s.calls(), ['emit PROP_VISIBILITY_CHANGED', 'view.remove', 'selection.isSelected', 'selection.deselect']);
    assert.deepEqual(s.entry('emit PROP_VISIBILITY_CHANGED').payload, { id: 'car', visible: false });
    assert.equal(s.entry('selection.isSelected').arg, 'car');

    const t = setupProp('car', { exists: true, selectedId: 'camera' });
    t.controller.setVisible(false);
    assert.deepEqual(t.calls(), ['emit PROP_VISIBILITY_CHANGED', 'view.remove', 'selection.isSelected']);
  });

  test('applyTransform is a no-op while the view does not exist; setField stores the rule value', () => {
    const s = setupProp('person');
    s.controller.applyTransform();
    assert.deepEqual(s.calls(), []);
    assert.equal(s.controller.setField('scale', '5'), 2);
    assert.equal(s.controller.setField('rotY', '0'), 0);
    assert.equal(s.controller.setField('posX', ''), 0);
    assert.equal(s.prop.scale, 2);
  });

  test("gizmo translate: floor only (dy ignored), 'gizmo-translate' event, then transform", () => {
    const s = setupProp('person', { exists: true });
    s.controller.applyGizmoTranslate({ x: 0.5, y: 3, z: -0.25 });
    assert.deepEqual(s.calls(), ['emit PROP_POSE_CHANGED', 'view.updateTransform', 'emit SELECTABLE_MOVED']);
    const ev = s.entry('emit PROP_POSE_CHANGED');
    assert.deepEqual(ev.payload, { id: 'person', source: 'gizmo-translate' });
    assert.deepEqual([ev.pose.posX, ev.pose.posZ], [2.5, 1.75]);
  });

  test("gizmo rotate: only the Y ring acts ('gizmo-rotate' event, then transform)", () => {
    const s = setupProp('car', { exists: true });
    s.controller.applyGizmoRotate('x', 10);
    s.controller.applyGizmoRotate('z', 10);
    assert.deepEqual(s.calls(), []);
    s.controller.applyGizmoRotate('y', -12.5);
    assert.deepEqual(s.calls(), ['emit PROP_POSE_CHANGED', 'view.updateTransform', 'emit SELECTABLE_MOVED']);
    assert.deepEqual(s.entry('emit PROP_POSE_CHANGED').payload, { id: 'car', source: 'gizmo-rotate' });
    assert.equal(s.entry('emit PROP_POSE_CHANGED').pose.rotY, -12.5);
  });

  test('Selectable: id, label, pick gating, gizmo anchor and orientation', () => {
    const person = setupProp('person');
    assert.equal(person.controller.id, 'person');
    assert.equal(person.controller.label, 'Person');
    assert.equal(person.controller.isPickable(), false);
    assert.equal(person.controller.hasGizmoTarget(), false);
    person.controller.setVisible(true);
    assert.equal(person.controller.isPickable(), true);
    assert.equal(person.controller.hasGizmoTarget(), true);
    assert.equal(person.controller.pickMeshes(), person.meshes);
    const out = fakeVector();
    assert.equal(person.controller.gizmoAnchor(out), out);
    assert.deepEqual([out.x, out.y, out.z], [2, 0.9, 2]);

    const car = setupProp('car');
    assert.equal(car.controller.id, 'car');
    assert.equal(car.controller.label, 'Car');
    const carOut = car.controller.gizmoAnchor(fakeVector());
    assert.deepEqual([carOut.x, carOut.y, carOut.z], [4, 0.5, 3]);
    car.prop.rotY = 33;
    const rotation = fakeEuler();
    car.controller.orientGizmo(rotation);
    assert.equal(rotation.y, 33 * Math.PI / 180);
    assert.deepEqual(rotation.sets, [], 'only rotation.y is written');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Layering of the WP7 modules (ARCHITECTURE.md 1.3; the full gate is tests/static/check.mjs)
// ---------------------------------------------------------------------------------------------------------------

describe('WP7 module imports follow the layer table', () => {
  const importsOf = (rel) => [...readFileSync(join(ROOT, rel), 'utf8').matchAll(/^\s*import\s+[^'"]*from\s+['"]([^'"]+)['"]/gm)]
    .map((m) => m[1]);
  const cases = {
    'js/app/CameraController.js': ['../core/EventBus.js', '../geometry/WallLayout.js'],
    'js/app/PropController.js': ['../core/EventBus.js'],
    'js/ui/CameraPanel.js': ['../core/EventBus.js', '../domain/CineCamera.js', './dom.js'],
    'js/ui/PropsPanel.js': ['../core/EventBus.js', '../domain/Prop.js', './dom.js'],
    'js/render/CameraRigView.js': ['../vendor/three.js', '../core/EventBus.js', '../legacy/LegacyCompat.js', './ResourceTracker.js',
      '../core/renderOrder.js'],
    'js/render/SafeDistanceView.js': ['../vendor/three.js', '../geometry/SafeDistanceBand.js', './ResourceTracker.js'],
    'js/render/PreviewWindow.js': ['../vendor/three.js', '../legacy/LegacyCompat.js'],
    'js/render/PropViews.js': ['../vendor/three.js', './ResourceTracker.js'],
  };
  for (const [rel, expected] of Object.entries(cases)) {
    test(rel, () => {
      assert.deepEqual(importsOf(rel), expected);
    });
  }
});

describe('PilotController.toggle: the preview guard applies only on entry (08 P2-4a, B-H4)', () => {
  test('entering with the preview off alerts and stays out; leaving with the preview off restores the orbit view', async () => {
    globalThis.window ??= { THREE: {} };   // PilotController imports js/vendor/three.js (window.THREE); toggle uses no THREE
    const { PilotController } = await import('../../js/interaction/PilotController.js');
    const log = [];
    const camera = {
      position: { clone: () => 'saved-position', copy: (v) => log.push(['camera.position.copy', v]) },
      fov: 50,
      updateProjectionMatrix: () => log.push(['camera.updateProjectionMatrix']),
    };
    const cine = { enabled: false };
    const interaction = { pilotMode: false };
    const bus = new EventBus();
    bus.on(Events.PILOT_CHANGED, (p) => log.push(['PILOT_CHANGED', p.active]));
    const pilot = new PilotController({
      sceneManager: { camera },
      cine,
      driver: { enterView: () => log.push(['driver.enterView']) },
      orbit: {
        snapshot: () => 'orbit-state',
        restore: (s) => log.push(['orbit.restore', s]),
        updateCameraPosition: () => log.push(['orbit.updateCameraPosition']),
      },
      keyboard: {},
      interaction,
      hub: { refresh() {} },
      bus,
      dialogs: { alert: (m) => log.push(['alert', m]) },
    });
    pilot.toggle();
    assert.deepEqual(log, [['alert', 'Enable Camera Frustum Preview first to use Pilot Mode']], 'entry is still guarded');
    assert.equal(interaction.pilotMode, false);
    log.length = 0;
    cine.enabled = true;
    pilot.toggle();
    assert.deepEqual(log, [['PILOT_CHANGED', true], ['driver.enterView']]);
    log.length = 0;
    cine.enabled = false;   // the preview-off handler clears the flag before it leaves pilot mode
    pilot.toggle();
    assert.equal(interaction.pilotMode, false, 'left cleanly (legacy alerted and stayed in pilot mode)');
    assert.deepEqual(log, [['PILOT_CHANGED', false], ['camera.position.copy', 'saved-position'], ['orbit.restore', 'orbit-state'],
      ['camera.updateProjectionMatrix'], ['orbit.updateCameraPosition']]);
  });
});
