// Unit tests for the shared path-B gizmo lifecycle of interaction/TransformGizmo (docs/improvements/03-pivot.md 5.4,
// 07 C33; 03 T5): the hook calls (beginGizmoDrag, ctx = {space, axisWorld, snap}, endGizmoDrag({cancel})), cancelDrag and
// the gesture swallowing with a real OrbitController and ViewportInput router (test 19), the detach cancel, allowedAxes
// (null: no handles; false: no handle for that axis), setSnapIncrements, the WALL_REBUILT re-anchor of a pivot target with
// a real WallController and PivotController (test 20), and that legacy targets keep their behaviour.
// three.js is replaced by tests/unit/fixtures/fake-three.mjs (real vector maths) installed as window.THREE. The pointer
// ray maps a mouse event to a ray from (clientX / 100, -clientY / 100, 10) looking down -Z, and hits the handle named by
// the event's `handle` field.
// Run: node --test tests/unit/gizmo.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FakeTHREE, Vector3, Raycaster } from './fixtures/fake-three.mjs';

globalThis.window = { THREE: FakeTHREE };   // js/vendor/three.js reads window.THREE when it is evaluated
const { TransformGizmo } = await import('../../js/interaction/TransformGizmo.js');
const { OrbitController } = await import('../../js/interaction/OrbitController.js');
const { ViewportInput } = await import('../../js/interaction/ViewportInput.js');
const { InteractionState } = await import('../../js/interaction/InputState.js');
const { SelectionManager } = await import('../../js/interaction/SelectionManager.js');
const { Events, EventBus } = await import('../../js/core/EventBus.js');
const { Theme } = await import('../../js/theme/Theme.js');
const { Project } = await import('../../js/domain/Project.js');
const { WallSection } = await import('../../js/domain/WallSection.js');
const { WallController } = await import('../../js/app/WallController.js');
const { PivotController } = await import('../../js/app/PivotController.js');
const { wallImport } = await import('./fixtures/wall-import.mjs');

/** A listener collector that dispatches in registration order (a canvas or the window). */
const eventTarget = () => ({
  listeners: [],
  addEventListener(type, fn) { this.listeners.push({ type, fn }); },
  fire(type, e = {}) { for (const l of this.listeners.filter((x) => x.type === type)) l.fn({ preventDefault() {}, ...e }); },
});

/** The fake pointer ray of the file header. */
const pointerRay = {
  fromEvent(e) {
    const rc = new Raycaster();
    rc.ray.origin.set(e.clientX / 100, -e.clientY / 100, 10);
    rc.ray.direction.set(0, 0, -1);
    rc.intersectObjects = (meshes) => {
      const m = e.handle ? meshes.find((x) => x.userData.axis === e.handle) : null;
      return m ? [{ object: m, distance: 1 }] : [];
    };
    return rc;
  },
};

/** A Selectable with the path-B hooks that records every call (or a legacy one without them). */
function hookTarget({ hooks = true, allowedAxes, kind = 'pivot', id = 'pivot' } = {}) {   // kind null: a legacy target
  const calls = [];
  const t = {
    id, label: id, calls,
    isPickable: () => true, pickMeshes: () => [], hasGizmoTarget: () => true,
    gizmoAnchor: (out) => out.set(0, 0, 0),
    orientGizmo: (rotation, mode) => calls.push(['orientGizmo', mode]),
    applyGizmoTranslate: (movement, ctx) => calls.push(['translate', movement.clone(), ctx]),
    applyGizmoRotate: (axis, deg, ctx) => calls.push(['rotate', axis, ctx]),
  };
  if (kind) t.kind = kind;
  if (allowedAxes) t.allowedAxes = allowedAxes;
  if (hooks) {
    t.beginGizmoDrag = () => calls.push(['begin']);
    t.endGizmoDrag = (opts) => calls.push(['end', opts]);
  }
  return t;
}

/** A gizmo on a fake scene, a real InteractionState and EventBus. */
function gizmoRig() {
  const bus = new EventBus();
  const interaction = new InteractionState();
  const helpers = [];
  const sceneManager = {
    camera: { position: new Vector3(0, 0, 10), fov: 50, lookAt() {} },
    addHelper: (g) => helpers.push(g), removeHelper: (g) => helpers.splice(helpers.indexOf(g), 1),
  };
  const gizmo = new TransformGizmo({ sceneManager, pointerRay, interaction, bus, theme: Theme });
  return { bus, interaction, sceneManager, helpers, gizmo };
}

const press = (g, x, y, extra = {}) => g.gizmo.onMouseDown({ clientX: x, clientY: y, ...extra });
const move = (g, x, y, extra = {}) => g.gizmo.onMouseMove({ clientX: x, clientY: y, ...extra });

describe('the hook lifecycle (03 5.4)', () => {
  test('beginGizmoDrag on a handle hit only; ctx = {space, axisWorld, snap}, snap iff Ctrl/Cmd; axisWorld parallel to movement', () => {
    const g = gizmoRig();
    const t = hookTarget();
    g.gizmo.attach(t);
    g.gizmo.setMode('translate');
    assert.equal(press(g, 100, 100), false, 'a miss');
    assert.deepEqual(t.calls.filter((c) => c[0] === 'begin'), []);
    assert.equal(press(g, 100, 100, { handle: 'x' }), true);
    assert.deepEqual(t.calls.filter((c) => c[0] === 'begin'), [['begin']]);
    move(g, 220, 100);
    move(g, 230, 100, { ctrlKey: true });
    move(g, 240, 100, { metaKey: true });
    const steps = t.calls.filter((c) => c[0] === 'translate');
    assert.equal(steps.length, 3);
    for (const [, movement, ctx] of steps) {
      assert.deepEqual(Object.keys(ctx), ['space', 'axisWorld', 'snap']);
      assert.equal(ctx.space, 'world');
      assert.deepEqual(ctx.axisWorld, { x: 1, y: 0, z: 0 });
      assert.ok(Math.abs(Math.hypot(ctx.axisWorld.x, ctx.axisWorld.y, ctx.axisWorld.z) - 1) < 1e-12);
      assert.equal(movement.y, 0);
      assert.equal(movement.z, 0);
    }
    assert.ok(Math.abs(steps[0][1].x - 1.2) < 1e-12, '120 px at 1 cm/px');
    assert.equal(steps[0][2].snap, null);
    assert.equal(steps[1][2].snap, g.interaction.snap);
    assert.equal(steps[2][2].snap, g.interaction.snap);
  });

  test('endGizmoDrag({cancel: false}) exactly once across the canvas and window mouse-ups; nothing after a click without a drag', () => {
    const g = gizmoRig();
    const t = hookTarget();
    g.gizmo.attach(t);
    g.gizmo.setMode('translate');
    press(g, 100, 100, { handle: 'x' });
    move(g, 150, 100);
    g.gizmo.onMouseUp();
    g.gizmo.onMouseUp();
    assert.deepEqual(t.calls.filter((c) => c[0] === 'end'), [['end', { cancel: false }]]);
    g.gizmo.onMouseUp();
    assert.equal(t.calls.filter((c) => c[0] === 'end').length, 1);
  });

  test('cancelDrag: false and no change for a target without the hook; with it: endGizmoDrag({cancel: true}), the flags, no commit', () => {
    const g = gizmoRig();
    const legacy = hookTarget({ hooks: false, id: 'camera', kind: null });
    g.gizmo.attach(legacy);
    g.gizmo.setMode('translate');
    press(g, 100, 100, { handle: 'x' });
    assert.equal(g.gizmo.cancelDrag(), false);
    assert.equal(g.interaction.isDraggingGizmo, true, 'nothing changed');
    assert.equal(g.interaction.gestureCancelled, false);
    g.gizmo.onMouseUp();

    const t = hookTarget();
    g.gizmo.attach(t);
    assert.equal(g.gizmo.cancelDrag(), false, 'no drag: false');
    press(g, 100, 100, { handle: 'x' });
    move(g, 220, 100);
    assert.equal(g.gizmo.cancelDrag(), true);
    assert.deepEqual(t.calls.filter((c) => c[0] === 'end'), [['end', { cancel: true }]]);
    assert.equal(g.interaction.isDraggingGizmo, false);
    assert.equal(g.interaction.gestureCancelled, true);
    assert.equal(g.gizmo.activeAxis, null);
    g.gizmo.onMouseUp();
    assert.equal(t.calls.filter((c) => c[0] === 'end').length, 1, 'the following mouse-up commits nothing');
    assert.equal(g.interaction.gestureCancelled, false, 'and ends the swallowed gesture');
  });

  test('a new press clears a stuck gestureCancelled (defensive)', () => {
    const g = gizmoRig();
    g.interaction.gestureCancelled = true;
    press(g, 0, 0);
    assert.equal(g.interaction.gestureCancelled, false);
  });

  test('detach during a hooked drag cancels it first', () => {
    const g = gizmoRig();
    const t = hookTarget();
    g.gizmo.attach(t);
    g.gizmo.setMode('translate');
    press(g, 100, 100, { handle: 'y' });
    g.gizmo.detach();
    assert.deepEqual(t.calls.filter((c) => c[0] === 'end'), [['end', { cancel: true }]]);
    assert.equal(g.interaction.isDraggingGizmo, false);
    assert.equal(g.gizmo.group, null);
    assert.deepEqual(g.helpers, []);
  });

  test('allowedAxes: null builds no handles (no group); a false axis gets no handle; legacy targets keep all of them', () => {
    const g = gizmoRig();
    const t = hookTarget({ allowedAxes: (m) => (m === 'translate' ? { x: true, y: false, z: true } : null) });
    g.gizmo.attach(t);
    g.gizmo.setMode('translate');
    const axes = () => g.gizmo.group.children.map((c) => c.userData.axis);
    assert.deepEqual(axes(), ['x', 'z']);
    g.gizmo.setMode('rotate');
    assert.equal(g.gizmo.group, null, 'rotate is unsupported: no handles at all');
    assert.deepEqual(g.helpers, []);
    assert.equal(press(g, 100, 100, { handle: 'x' }), false, 'nothing to grab, so the press can pick');
    const legacy = hookTarget({ hooks: false, id: 'car', kind: null });
    g.gizmo.attach(legacy);
    assert.deepEqual(axes(), ['x', 'y', 'z'], 'rotate rings for a legacy target (B-L22 kept)');
    g.gizmo.setMode('translate');
    assert.deepEqual(axes(), ['x', 'y', 'z']);
  });

  test('orientGizmo receives the gizmo mode in local space', () => {
    const g = gizmoRig();
    const t = hookTarget();
    g.gizmo.attach(t);
    g.gizmo.toggleSpace();
    g.gizmo.setMode('translate');
    assert.deepEqual(t.calls.filter((c) => c[0] === 'orientGizmo').at(-1), ['orientGizmo', 'translate']);
  });

  test('setSnapIncrements merges into interaction.snap', () => {
    const g = gizmoRig();
    assert.deepEqual(g.interaction.snap, { pivotM: 0.1 });
    g.gizmo.setSnapIncrements({ translateMm: 10, rotateDeg: 5 });
    g.gizmo.setSnapIncrements({ pivotM: 0.5 });
    assert.deepEqual(g.interaction.snap, { pivotM: 0.5, translateMm: 10, rotateDeg: 5 });
  });

  test('a legacy target without hooks: the same calls as Phase 1 plus an ignored ctx argument', () => {
    const g = gizmoRig();
    const legacy = hookTarget({ hooks: false, id: 'person', kind: null });
    g.gizmo.attach(legacy);
    g.gizmo.setMode('translate');
    press(g, 100, 100, { handle: 'z' });
    move(g, 100, 100);
    g.gizmo.onMouseUp();
    assert.equal(legacy.calls.filter((c) => c[0] === 'translate').length, 1);
    assert.equal(g.interaction.gestureCancelled, false);
  });
});

describe('test 19: gesture swallowing with a real OrbitController and the ViewportInput router (03 5.4)', () => {
  /** Orbit listeners first, then the router's, on one fake canvas (the legacy registration order). */
  function gestureRig() {
    const g = gizmoRig();
    const canvas = eventTarget();
    const win = eventTarget();
    const camera = { position: new Vector3(0, 0, 8), fov: 50, lookAt() {} };
    const sceneManager = { renderer: { domElement: canvas }, camera };
    const orbit = new OrbitController({
      sceneManager, keyboard: { isDown: () => false }, interaction: g.interaction,
      frameBounds: () => ({ generativeBox: { center: { x: 1.25, y: 0.75, z: 0 } } }),   // 08 P2-11c: the framing's box
    });
    orbit.attach();
    const picks = [];
    const vi = new ViewportInput({
      doc: eventTarget(), win, sceneManager, interaction: g.interaction, gizmo: g.gizmo,
      selection: { pickAt: () => picks.push('pick'), deselect() {} },
      pilot: { onMouseDown() {}, onMouseMove() {}, onMouseUp() {}, onWheel() {}, toggle() {} },
      onPivotShortcut() {},
    });
    vi.attachPointer();
    let hovers = 0;
    const onHover = g.gizmo.onHover.bind(g.gizmo);
    g.gizmo.onHover = (e) => { hovers++; onHover(e); };
    const t = hookTarget();
    g.gizmo.attach(t);
    g.gizmo.setMode('translate');
    orbit.setView('reset');
    return { ...g, canvas, win, camera, orbit, t, picks, hovers: () => hovers };
  }

  test('after cancelDrag, moves with the button held neither orbit nor hover; the mouse-up ends the gesture', () => {
    const r = gestureRig();
    const theta = r.orbit.angle.theta;
    const phi = r.orbit.angle.phi;
    const pos = r.camera.position.clone();
    r.canvas.fire('mousedown', { clientX: 100, clientY: 100, handle: 'x' });
    r.canvas.fire('mousemove', { clientX: 220, clientY: 100 });
    assert.equal(r.gizmo.cancelDrag(), true);
    r.canvas.fire('mousemove', { clientX: 260, clientY: 140 });
    r.canvas.fire('mousemove', { clientX: 300, clientY: 180 });
    assert.ok(Object.is(r.orbit.angle.theta, theta) && Object.is(r.orbit.angle.phi, phi), 'no orbit jump');
    assert.deepEqual([r.camera.position.x, r.camera.position.y, r.camera.position.z], [pos.x, pos.y, pos.z]);
    assert.equal(r.hovers(), 0, 'no gizmo hover while the button is held');
    r.canvas.fire('mouseup', {});
    assert.equal(r.interaction.gestureCancelled, false);
    r.canvas.fire('mousedown', { clientX: 300, clientY: 300 });
    r.canvas.fire('mousemove', { clientX: 340, clientY: 300 });
    assert.ok(Object.is(r.orbit.angle.theta, theta - (340 - 300) * 0.01), 'a plain 40 px drag orbits by exactly 0.4 rad');
  });

  test('without a cancel the flag is never set and a legacy drag orbits nothing while dragging the gizmo (identity)', () => {
    const r = gestureRig();
    const theta = r.orbit.angle.theta;
    r.canvas.fire('mousedown', { clientX: 100, clientY: 100, handle: 'x' });
    r.canvas.fire('mousemove', { clientX: 140, clientY: 100 });
    assert.equal(r.interaction.gestureCancelled, false);
    assert.ok(Object.is(r.orbit.angle.theta, theta));
    r.canvas.fire('mouseup', {});
    assert.deepEqual(r.t.calls.filter((c) => c[0] === 'end'), [['end', { cancel: false }]]);
  });

  test('a release on the window instead of the canvas also clears the flag', () => {
    const r = gestureRig();
    r.canvas.fire('mousedown', { clientX: 100, clientY: 100, handle: 'x' });
    r.gizmo.cancelDrag();
    r.win.fire('mouseup', {});
    assert.equal(r.interaction.gestureCancelled, false);
  });
});

describe('test 20: the WALL_REBUILT re-anchor of a selected pivot (03 5.4)', () => {
  function anchorRig() {
    const g = gizmoRig();
    const project = Project.createDefault();
    const spies = [];
    g.bus.on(Events.WALL_REBUILT, () => spies.push(['before', g.gizmo.group?.position.y]));
    const wc = new WallController({
      project, view: { rebuild() {} }, ledTiles: { clearCache() {} }, orbit: { updateCameraPosition() {} },
      hub: { refresh() {} }, bus: g.bus, palette: Theme.palette, dialogs: { alert() {} },
    });
    const selection = new SelectionManager({ bus: g.bus, gizmo: g.gizmo, pointerRay, interaction: g.interaction });
    const marker = { exists: true, hasResolution: true, visible: true, pickMeshes: () => [], setPreview() {}, clearPreview() {} };
    const pc = new PivotController({
      project, wallController: wc, markerView: marker, stageAnchored: [], selection, gizmo: g.gizmo,
      interaction: g.interaction, bus: g.bus,
    });
    selection.register(pc);
    wc.rebuild({ cause: 'init' });
    g.bus.on(Events.WALL_REBUILT, () => spies.push(['after', g.gizmo.group?.position.y]));
    return { ...g, project, wc, pc, selection, spies };
  }

  test('mesh-center + offset y 0.75, rows 3 -> 5: WALL_REBUILT re-anchors the gizmo on P.y, whatever the order', () => {
    const r = anchorRig();
    r.pc.toggleSelect();
    r.pc.setMode('mesh-center');
    assert.equal(r.gizmo.group.position.y, 0, 'mesh-center sits on the floor (owner request 2026-10-17, 03 6.1)');
    r.pc.setOffsetAxis('y', '0.75');
    assert.equal(r.gizmo.group.position.y, 0.75);
    const section = r.project.wall.sections[0];
    r.wc.setSectionField(section, 'panelRows', '5');
    r.gizmo.group.position.y = 99;   // a stale anchor: only the WALL_REBUILT re-anchor can restore it
    r.spies.length = 0;
    r.wc.commitSectionEdit();
    assert.equal(r.gizmo.group.position.y, 0.75, 'the floor anchor ignores the rows; P.y is the offset');
    assert.deepEqual(r.spies.at(-1), ['after', 0.75], 'a later WALL_REBUILT subscriber already sees the anchor');
  });

  test('an import (which keeps the session-only pivot, 03 12.11) re-anchors too', () => {
    const r = anchorRig();
    r.pc.toggleSelect();
    r.pc.setMode('mesh-center');
    r.pc.setOffsetAxis('y', '1.25');
    assert.equal(r.gizmo.group.position.y, 1.25);
    wallImport({ project: r.project, wc: r.wc, bus: r.bus }, { sections: [new WallSection({ ...WallSection.createDefault(), panelRows: 7 })] });
    assert.equal(r.gizmo.group.position.y, 1.25, 'the session pivot on the imported (v1) wall');
  });

  test('a camera target is left untouched by WALL_REBUILT', () => {
    const r = anchorRig();
    const camera = hookTarget({ hooks: false, id: 'camera', kind: null });
    camera.gizmoAnchor = (out) => out.set(1, 2, 3);
    r.selection.register(camera);
    r.selection.select('camera');
    r.gizmo.setMode('translate');
    r.gizmo.group.position.set(9, 9, 9);
    r.wc.rebuild();
    assert.deepEqual([r.gizmo.group.position.x, r.gizmo.group.position.y, r.gizmo.group.position.z], [9, 9, 9]);
  });
});
