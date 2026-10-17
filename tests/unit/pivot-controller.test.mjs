// Unit tests for app/PivotController (docs/improvements/03-pivot.md 5.3, 5.5, 5.6, 6.5, 6.7; 03 T4, tests 10-15 of
// 8.1) and the pivot mirrors that land with it: CameraPanel's #camera-pos-z `min` (3.5) and the 'pivot' pose sources of
// CameraPanel and PropControls (5.5).
// A real Project, EventBus and WallController (with spy view, orbit, hub and tile cache) drive the controller; the
// stage-anchored participants, the marker view, the selection and the gizmo are recording stubs. app/ imports no THREE.
// Run: node --test tests/unit/pivot-controller.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Events, EventBus } from '../../js/core/EventBus.js';
import { Project } from '../../js/domain/Project.js';
import { WallSection } from '../../js/domain/WallSection.js';
import { WallPivot } from '../../js/domain/Wall.js';
import { Palette } from '../../js/theme/Theme.js';
import { WallController } from '../../js/app/WallController.js';
import { PivotController, PIVOT_SNAP_STEPS_M, dragTarget } from '../../js/app/PivotController.js';
import { CameraPanel, cameraZMinAttribute } from '../../js/ui/CameraPanel.js';
import { PropControls } from '../../js/ui/PropsPanel.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVENT_KEY = Object.fromEntries(Object.entries(Events).map(([key, type]) => [type, key]));

/** Bare section fields (the default 5 x 3 wall of 500 mm panels). */
const fields = (over = {}) => ({
  id: 0, name: 'Wall 1', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32,
  curveIntensity: 0, angleOffset: 0, color: '#00f0ff', ...over,
});

/**
 * The rig: a real Project / EventBus / WallController (spy collaborators) after its bootstrap rebuild, three
 * stage-anchored spies, a marker stub, a selection stub and a gizmo stub, and the PivotController under test.
 * `trace` records, in order, every collaborator call and every emitted event key.
 */
function makeRig({ sections = null, keep = true } = {}) {
  const project = Project.createDefault();
  if (sections) project.wall.replaceAll(sections.map((f) => new WallSection(f)));
  const bus = new EventBus();
  const trace = [];
  const events = [];
  for (const [key, type] of Object.entries(Events)) bus.on(type, (payload) => { events.push({ key, payload }); trace.push(key); });
  const view = { calls: 0, rebuild() { this.calls++; trace.push('view.rebuild'); } };
  const wc = new WallController({
    project, view, ledTiles: { clearCache() {} }, orbit: { updateCameraPosition() {} }, hub: { refresh() {} },
    bus, palette: Palette, dialogs: { alert() {} },
  });
  wc.rebuild({ cause: 'init' });
  const commitPivot = wc.commitPivot.bind(wc);
  wc.commitPivot = (after) => { trace.push('commitPivot'); commitPivot(after); };
  const anchored = ['camera', 'person', 'car'].map((id) => ({
    id, calls: [], translateStage(dx, dz) { this.calls.push([dx, dz]); trace.push(`translateStage:${id}`); },
  }));
  const marker = {
    exists: true, hasResolution: true, visible: true, previews: [], clears: 0, proxy: { name: 'proxy' },
    pickMeshes() { return [this.proxy]; },
    setPreview(dx, dy, dz) { this.previews.push([dx, dy, dz]); trace.push('marker.setPreview'); },
    clearPreview() { this.clears++; trace.push('marker.clearPreview'); },
  };
  const interaction = { isDraggingGizmo: false, gestureCancelled: false, pilotMode: false, snap: { pivotM: 0.1 } };
  const selection = {
    id: null,
    isSelected(id) { return this.id === id; },
    select(id) { this.id = id; trace.push(`select:${id}`); },
    deselect() { this.id = null; trace.push('deselect'); },
  };
  const gizmo = {
    mode: null, snapCalls: [],
    setMode(m) { this.mode = this.mode === m ? null : m; trace.push(`gizmo.setMode:${m}`); },
    setSnapIncrements(partial) { this.snapCalls.push(partial); Object.assign(interaction.snap, partial); },
  };
  const pc = new PivotController({
    project, wallController: wc, markerView: marker, stageAnchored: anchored, selection, gizmo, interaction, bus,
  });
  if (!keep) pc.setKeepStageLayout(false);
  trace.length = 0;
  events.length = 0;
  const emitted = (key) => events.filter((e) => e.key === key).map((e) => e.payload);
  return { project, bus, trace, events, emitted, view, wc, anchored, marker, interaction, selection, gizmo, pc };
}

/** A fake Vector3 / Euler for gizmoAnchor and orientGizmo (app/ never imports THREE). */
const vec = () => ({ x: NaN, y: NaN, z: NaN, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });

describe('P-PIVOT: mode, offset and reset (03 5.6; tests 10, 11, 13; rows F3-1 to F3-3)', () => {
  test('test 10: a mode change with keep on re-expresses camera, person, car by -dO, then the event, one rebuild, SELECTABLE_MOVED', () => {
    const r = makeRig();
    r.pc.setMode('wall-center');
    assert.deepEqual(r.trace, [
      'translateStage:camera', 'translateStage:person', 'translateStage:car',
      'WALL_PIVOT_CHANGED', 'commitPivot', 'view.rebuild', 'WALL_STATS_CHANGED', 'WALL_REBUILT', 'SELECTABLE_MOVED',
    ]);
    for (const a of r.anchored) assert.deepEqual(a.calls, [[-1.25, -0]], `${a.id}: -dO (03 6.8: dO = (1.25, 0))`);
    const [payload] = r.emitted('WALL_PIVOT_CHANGED');
    assert.deepEqual(Object.keys(payload), ['source', 'pivot', 'resolution', 'stageShift', 'reexpressed', 'rebuilds']);
    assert.equal(payload.source, 'mode');
    assert.equal(payload.pivot.mode, 'wall-center');
    assert.notEqual(payload.pivot, r.project.wall.pivot, 'a copy');
    assert.deepEqual(payload.resolution, r.wc.resolvePivotNow());
    assert.deepEqual(payload.stageShift, { x: 1.25, z: 0 });
    assert.equal(payload.reexpressed, true);
    assert.equal(payload.rebuilds, true);
    assert.equal(r.view.calls, 2, 'the bootstrap rebuild and exactly one pivot rebuild');
    assert.equal(r.emitted('WALL_REBUILT')[0].cause, 'pivot');
    assert.deepEqual(r.emitted('SELECTABLE_MOVED'), [{ id: 'pivot' }]);
  });

  test('test 10: a no-op change (same mode, same offset, an unparsable offset) emits nothing and rebuilds nothing', () => {
    const r = makeRig();
    r.pc.setMode('bottom-left');
    assert.equal(r.pc.setOffsetAxis('x', '0'), 0);
    assert.equal(r.pc.setOffsetAxis('x', 'abc'), 0, 'a rejected value returns the stored component');
    assert.equal(r.pc.setOffsetAxis('z', ''), 0);
    r.pc.resetOffset();
    assert.deepEqual(r.trace, []);
    assert.throws(() => r.pc.setMode('middle'), RangeError);
    assert.deepEqual(r.trace, [], 'an unknown mode throws before anything is written');
  });

  test('test 11: keep off: no translateStage, one rebuild, reexpressed false', () => {
    const r = makeRig({ keep: false });
    r.pc.setMode('mesh-center');
    assert.ok(r.anchored.every((a) => a.calls.length === 0));
    assert.equal(r.view.calls, 2);
    const [payload] = r.emitted('WALL_PIVOT_CHANGED');
    assert.equal(payload.reexpressed, false);
    assert.equal(payload.rebuilds, true);
  });

  test('test 13: a Y-only offset never rebuilds, caches `after`, re-expresses nothing; rebuilds is false', () => {
    const r = makeRig();
    assert.equal(r.pc.setOffsetAxis('y', '1.2345'), 1.235, 'stored rounded to 1 mm; the return value is for the write-back');
    assert.deepEqual(r.trace, ['WALL_PIVOT_CHANGED', 'commitPivot', 'SELECTABLE_MOVED']);
    assert.equal(r.view.calls, 1, 'only the bootstrap rebuild');
    assert.deepEqual(r.wc.pivotResolution, r.wc.resolvePivotNow(), 'commitPivot cached the new resolution');
    assert.equal(r.wc.pivotResolution.point.y, 1.235);
    const [payload] = r.emitted('WALL_PIVOT_CHANGED');
    assert.equal(payload.source, 'offset');
    assert.equal(payload.rebuilds, false);
    assert.equal(payload.reexpressed, false);
    assert.deepEqual(payload.stageShift, { x: 0, z: 0 });
    assert.ok(r.anchored.every((a) => a.calls.length === 0));
  });

  test('offset X and Z move the stage origin; resetOffset moves it back (source reset-offset)', () => {
    const r = makeRig();
    assert.equal(r.pc.setOffsetAxis('z', 2), 2);
    assert.deepEqual(r.anchored[0].calls, [[-0, -2]]);
    r.pc.resetOffset();
    assert.deepEqual(r.anchored[0].calls, [[-0, -2], [-0, 2]], 'the inverse shift');
    assert.deepEqual(r.emitted('WALL_PIVOT_CHANGED').map((p) => p.source), ['offset', 'reset-offset']);
    assert.equal(r.view.calls, 3);
    assert.ok(r.project.wall.pivot.isIdentity);
  });

  test('the 6.8 re-expression example on the real participants: camera (1.25, 1.5) -> (0, 1.5), person -> 0.75, car -> 2.75', async () => {
    const { CineCamera } = await import('../../js/domain/CineCamera.js');
    const r = makeRig();
    const cine = r.project.camera;
    cine.posX = 1.25; cine.posZ = 1.5;
    r.project.person.posX = 2; r.project.car.posX = 4;
    const real = [
      { id: 'camera', translateStage: (dx, dz) => cine.translateStage(dx, dz) },
      { id: 'person', translateStage: (dx, dz) => r.project.person.translateStage(dx, dz) },
      { id: 'car', translateStage: (dx, dz) => r.project.car.translateStage(dx, dz) },
    ];
    const pc = new PivotController({ project: r.project, wallController: r.wc, markerView: r.marker, stageAnchored: real,
      selection: r.selection, gizmo: r.gizmo, interaction: r.interaction, bus: r.bus });
    pc.setMode('wall-center');
    assert.deepEqual([cine.posX, cine.posZ], [0, 1.5]);
    assert.equal(r.project.person.posX, 0.75);
    assert.equal(r.project.car.posX, 2.75);
    assert.ok(CineCamera.LIMITS.posX.max >= 100000, 'clamped through LIMITS, far beyond any pivot shift');
  });
});

describe('toggles and snapping (row F3-5)', () => {
  test('keep-stage: event only when it changes; never a rebuild; TypeError for a non-boolean', () => {
    const r = makeRig();
    r.pc.setKeepStageLayout(true);
    assert.deepEqual(r.trace, [], 'unchanged: nothing');
    r.pc.setKeepStageLayout(false);
    assert.deepEqual(r.trace, ['WALL_PIVOT_CHANGED']);
    const [payload] = r.emitted('WALL_PIVOT_CHANGED');
    assert.deepEqual(payload, {
      source: 'keep-stage', pivot: payload.pivot, resolution: r.wc.pivotResolution, stageShift: { x: 0, z: 0 },
      reexpressed: false, rebuilds: false,
    });
    assert.equal(payload.pivot.keepStageLayout, false);
    assert.throws(() => r.pc.setKeepStageLayout('yes'), TypeError);
    assert.equal(r.view.calls, 1);
  });

  test('marker: writes display.showPivotMarker and emits source marker; never a rebuild', () => {
    const r = makeRig();
    r.pc.setMarkerVisible(true);
    assert.equal(r.project.display.showPivotMarker, true);
    r.pc.setMarkerVisible(false);
    assert.equal(r.project.display.showPivotMarker, false);
    assert.deepEqual(r.emitted('WALL_PIVOT_CHANGED').map((p) => [p.source, p.rebuilds, p.reexpressed]),
      [['marker', false, false], ['marker', false, false]]);
    assert.equal(r.view.calls, 1);
  });

  test('setSnapStep accepts only the #pivot-snap option values and merges {pivotM} through the gizmo', () => {
    const r = makeRig();
    assert.deepEqual([...PIVOT_SNAP_STEPS_M], [0.001, 0.01, 0.1, 0.5, 1]);
    r.interaction.snap.translateMm = 10;
    r.pc.setSnapStep(0.5);
    assert.deepEqual(r.gizmo.snapCalls, [{ pivotM: 0.5 }]);
    assert.deepEqual(r.interaction.snap, { pivotM: 0.5, translateMm: 10 }, 'a merge: other keys are kept');
    assert.throws(() => r.pc.setSnapStep(0.2), RangeError);
    assert.throws(() => r.pc.setSnapStep('0.1'), RangeError);
  });

  test('the index.html #pivot-snap options are exactly PIVOT_SNAP_STEPS_M (once the panel markup exists)', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const select = /<select id="pivot-snap"[\s\S]*?<\/select>/.exec(html);
    if (!select) return;   // the panel markup lands with 03 T6
    const values = [...select[0].matchAll(/value="([^"]+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(values, [...PIVOT_SNAP_STEPS_M]);
  });
});

describe('toggleSelect (the O key and #pivot-select, 03 3.4)', () => {
  test('selects the pivot and switches the gizmo to translate; again deselects', () => {
    const r = makeRig();
    r.pc.toggleSelect();
    assert.deepEqual(r.trace, ['select:pivot', 'gizmo.setMode:translate']);
    r.pc.toggleSelect();
    assert.deepEqual(r.trace.slice(2), ['deselect']);
    r.gizmo.mode = 'translate';
    r.trace.length = 0;
    r.pc.toggleSelect();
    assert.deepEqual(r.trace, ['select:pivot'], 'already translate: the mode is not toggled off');
    r.selection.id = null;
    r.gizmo.mode = 'rotate';
    r.trace.length = 0;
    r.pc.toggleSelect();
    assert.deepEqual(r.trace, ['select:pivot', 'gizmo.setMode:translate'], 'rotate switches to translate');
  });

  test('a no-op during a gizmo drag and while a cancelled drag\'s button is still held', () => {
    const r = makeRig();
    r.interaction.isDraggingGizmo = true;
    r.pc.toggleSelect();
    r.interaction.isDraggingGizmo = false;
    r.interaction.gestureCancelled = true;
    r.pc.toggleSelect();
    assert.deepEqual(r.trace, []);
  });
});

describe('Selectable \'pivot\' (the path-B hook set of 03 5.4, 07 C33)', () => {
  test('identity, kind, priority, allowedAxes (translate only), picking and the gizmo target', () => {
    const r = makeRig();
    assert.deepEqual([r.pc.id, r.pc.label, r.pc.kind, r.pc.pickPriority], ['pivot', 'Pivot', 'pivot', 10]);
    assert.deepEqual(r.pc.allowedAxes('translate'), { x: true, y: true, z: true });
    assert.equal(r.pc.allowedAxes('rotate'), null, 'test 12: rotate is unsupported, so SELECTION_CHANGED.modes = [translate]');
    assert.equal(r.pc.allowedAxes(null), null);
    assert.equal(r.pc.isPickable(), true);
    assert.deepEqual(r.pc.pickMeshes(), [r.marker.proxy]);
    for (const k of ['exists', 'hasResolution', 'visible']) {
      r.marker[k] = false;
      assert.equal(r.pc.isPickable(), false, `not pickable without ${k}`);
      r.marker[k] = true;
    }
    assert.equal(r.pc.hasGizmoTarget(), true);
    r.marker.exists = false;
    assert.equal(r.pc.hasGizmoTarget(), false, 'no gizmo target before the marker is allocated');
  });

  test('gizmoAnchor is the glyph (0, P.y, 0) of the cached resolution plus the preview; orientGizmo zeroes the rotation', () => {
    const r = makeRig();
    r.pc.setMode('mesh-center');
    const out = vec();
    assert.equal(r.pc.gizmoAnchor(out), out);
    assert.deepEqual([out.x, out.y, out.z], [0, 0.75, 0], 'AC 3: glyph (0, 0.75, 0) for mesh-center on the default wall');
    const rotation = vec();
    r.pc.orientGizmo(rotation, 'translate');
    assert.deepEqual([rotation.x, rotation.y, rotation.z], [0, 0, 0]);
  });
});

describe('gizmo drags and relative snapping (03 6.7, D9; test 12; row F3-4)', () => {
  const move = (x, y, z) => ({ x, y, z });

  test('dragTarget snaps the dragged distance, never the absolute value; an untouched axis keeps its stored value', () => {
    const offset = { x: 0.04, y: 0.123, z: -1 };
    assert.deepEqual(dragTarget(offset, { x: 0.26, y: 0, z: -0 }, 0.1), { x: 0.04 + 0.3, y: 0.123, z: -1 },
      'offset + the snapped distance (the commit rounds it through parseOffset)');
    assert.deepEqual(dragTarget(offset, { x: 0.26, y: 0, z: 0 }, 0), { x: 0.04 + 0.26, y: 0.123, z: -1 });
    assert.deepEqual(dragTarget(offset, { x: 0.0004, y: 0.00049, z: -0.0004 }, 0), offset, 'below 0.5 mm: nothing moves');
    assert.ok(Object.is(dragTarget(offset, { x: 0, y: 0.0001, z: 0 }, 0.1).y, 0.123));
  });

  test('N drag steps rebuild nothing; mouse-up commits once (one rebuild); the preview follows the snapped target', () => {
    const r = makeRig();
    r.pc.beginGizmoDrag();
    for (let k = 0; k < 13; k++) r.pc.applyGizmoTranslate(move(0.02, 0, 0), { space: 'world', axisWorld: move(1, 0, 0), snap: null });
    assert.equal(r.view.calls, 1, 'zero rebuilds during the drag');
    assert.deepEqual(r.emitted('SELECTABLE_MOVED').length, 13, 'the gizmo follows every step');
    assert.deepEqual(r.marker.previews.at(-1), [0.26, 0, 0]);
    assert.deepEqual(r.project.wall.pivot.offset, { x: 0, y: 0, z: 0 }, 'nothing is committed before mouse-up');
    const anchor = r.pc.gizmoAnchor(vec());
    assert.deepEqual([anchor.x, anchor.y, anchor.z], [0.26, 0, 0], 'the gizmo sits on the previewed glyph');
    r.trace.length = 0;
    r.pc.endGizmoDrag({ cancel: false });
    assert.equal(r.view.calls, 2, 'exactly one rebuild on release');
    assert.equal(r.project.wall.pivot.offset.x, 0.26);
    assert.deepEqual(r.trace.slice(0, 5), ['marker.clearPreview', 'translateStage:camera', 'translateStage:person',
      'translateStage:car', 'WALL_PIVOT_CHANGED']);
    assert.equal(r.emitted('WALL_PIVOT_CHANGED')[0].source, 'gizmo');
    const after = r.pc.gizmoAnchor(vec());
    assert.deepEqual([after.x, after.y, after.z], [0, 0, 0], 'the preview is cleared: the glyph is at the stage origin again');
  });

  test('cancel commits nothing, clears the preview and leaves the offset unchanged', () => {
    const r = makeRig();
    r.pc.beginGizmoDrag();
    r.pc.applyGizmoTranslate(move(0, 0, 1.3), { snap: null });
    r.trace.length = 0;
    r.pc.endGizmoDrag({ cancel: true });
    assert.deepEqual(r.trace, ['marker.clearPreview', 'SELECTABLE_MOVED']);
    assert.deepEqual(r.project.wall.pivot.offset, { x: 0, y: 0, z: 0 });
    assert.equal(r.view.calls, 1);
    assert.equal(r.marker.clears, 1);
  });

  test('off-grid untouched axis: offset (0, 0.123, 0), an X drag of 0.26 with ctx.snap {pivotM: 0.1} commits x = 0.3, y = 0.123', () => {
    const r = makeRig();
    r.pc.setOffsetAxis('y', '0.123');
    r.pc.beginGizmoDrag();
    for (const dx of [0.1, 0.1, 0.06]) r.pc.applyGizmoTranslate(move(dx, 0, 0), { snap: { pivotM: 0.1 } });
    assert.ok(r.marker.previews.every(([, dy]) => dy === 0), 'the preview never moves the glyph in Y');
    r.pc.endGizmoDrag({ cancel: false });
    assert.equal(r.project.wall.pivot.offset.x, 0.3);
    assert.ok(Object.is(r.project.wall.pivot.offset.y, 0.123));
  });

  test('without ctx.snap the same drag commits 0.26; a 0.4 mm drag commits nothing', () => {
    const r = makeRig();
    r.pc.beginGizmoDrag();
    r.pc.applyGizmoTranslate(move(0.26, 0, 0));
    r.pc.endGizmoDrag({ cancel: false });
    assert.equal(r.project.wall.pivot.offset.x, 0.26);
    const tiny = makeRig();
    tiny.pc.beginGizmoDrag();
    tiny.pc.applyGizmoTranslate(move(0.0004, 0, 0), { snap: null });
    tiny.trace.length = 0;
    tiny.pc.endGizmoDrag({ cancel: false });
    assert.deepEqual(tiny.trace, ['marker.clearPreview', 'SELECTABLE_MOVED'], 'target equals offset: no commit');
    assert.equal(tiny.view.calls, 1);
  });

  test('what you see is what you commit: releasing Ctrl before mouse-up keeps the last previewed (snapped) target', () => {
    const r = makeRig();
    r.pc.beginGizmoDrag();
    r.pc.applyGizmoTranslate(move(0.26, 0, 0), { snap: { pivotM: 0.5 } });
    r.pc.endGizmoDrag({ cancel: false });
    assert.equal(r.project.wall.pivot.offset.x, 0.5);
  });

  test('a commit is clamped through WallPivot.parseOffset (+-1000 m)', () => {
    const r = makeRig();
    r.pc.beginGizmoDrag();
    r.pc.applyGizmoTranslate(move(0, 0, 4000));
    r.pc.endGizmoDrag({ cancel: false });
    assert.equal(r.project.wall.pivot.offset.z, 1000);
  });

  test('applyGizmoRotate is a no-op', () => {
    const r = makeRig();
    r.pc.applyGizmoRotate('y', 15, {});
    assert.deepEqual(r.trace, []);
  });
});

describe('test 14: a wall-centre pivot after addSection (03 3.7, D6)', () => {
  test('the stage layout\'s wall-center anchor stays (0, 0, 0); the camera is untouched; WALL_REBUILT reports the shift', () => {
    const r = makeRig();
    r.pc.setMode('wall-center');
    const cameraCalls = r.anchored[0].calls.length;
    r.wc.addSection();
    const rebuilt = r.emitted('WALL_REBUILT').at(-1);
    assert.equal(rebuilt.cause, 'edit');
    assert.deepEqual(rebuilt.layout.pivotPoint('wall-center'), { x: 0, y: 0, z: 0 });
    assert.deepEqual(rebuilt.stageShift, { x: 1.25, z: 0 });
    assert.equal(r.anchored[0].calls.length, cameraCalls, 'section edits never re-express');
    assert.deepEqual(r.emitted('WALL_PIVOT_CHANGED').length, 1, 'only the mode change emitted the pivot event');
  });
});

describe('test 15: a null resolution (a NaN panel width before B-L8)', () => {
  test('no throw; hasGizmoTarget false; gizmoAnchor finite; the CameraPanel mirror writes min "0.1"; later subscribers still run', () => {
    const r = makeRig({ sections: [fields({ panelWidth: NaN })] });
    const camera = cameraPanelRig(r.bus);
    let later = 0;
    r.bus.on(Events.WALL_REBUILT, () => { later++; });
    r.pc.setMode('wall-center');
    assert.equal(r.wc.pivotResolution, null, 'wall-center needs the last edge: not finite');
    const [payload] = r.emitted('WALL_PIVOT_CHANGED');
    assert.equal(payload.resolution, null);
    assert.equal(payload.rebuilds, false, 'stageShift(null, null) is (0, 0): nothing moves');
    assert.equal(r.pc.hasGizmoTarget(), false);
    const out = r.pc.gizmoAnchor(vec());
    assert.deepEqual([out.x, out.y, out.z], [0, 0, 0], 'the preview from the origin, never a null dereference');
    assert.equal(camera.posZ.attrs.min, '0.1');
    r.wc.rebuild();
    assert.equal(later, 1, 'a WALL_REBUILT subscriber after the mirrors still runs');
    assert.equal(camera.posZ.attrs.min, '0.1');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The pivot mirrors of CameraPanel and PropControls (03 3.5, 5.5)
// ---------------------------------------------------------------------------------------------------------------

/** A fake element: value, attributes, a style object and listeners (enough for the panels' constructors). */
function fakeElement(id) {
  return {
    id, value: '', textContent: '', attrs: {}, style: {}, listeners: [],
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); },
      contains(c) { return this.set.has(c); }, toggle(c, f) { const on = f ?? !this.set.has(c); if (on) this.set.add(c); else this.set.delete(c); return on; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
  };
}

/** A fake document whose getElementById creates and remembers elements on demand. */
function fakeDoc() {
  const map = new Map();
  return { map, getElementById(id) { if (!map.has(id)) map.set(id, fakeElement(id)); return map.get(id); } };
}

/** A CameraPanel on its own project and a fake document; returns #camera-pos-x / #camera-pos-z and the project. */
function cameraPanelRig(bus, project = Project.createDefault()) {
  const doc = fakeDoc();
  new CameraPanel({ doc, project, cameraController: {}, projectIO: {}, bus, theme: { ui: { status: {} } } });
  return { project, posX: doc.getElementById('camera-pos-x'), posZ: doc.getElementById('camera-pos-z') };
}

describe('CameraPanel: the #camera-pos-z min attribute (03 3.5) and the pivot pose mirror (5.5)', () => {
  test('cameraZMinAttribute: the posZ floor floored to the 0.1 grid; "0.1" at wallZ = +0 and -0', () => {
    assert.equal(cameraZMinAttribute(-2.3397), '-2.3');
    assert.equal(cameraZMinAttribute(-2), '-1.9');
    assert.equal(cameraZMinAttribute(2), '2.1');
    assert.equal(cameraZMinAttribute(0), '0.1');
    assert.equal(cameraZMinAttribute(-0), '0.1');
  });

  test('WALL_PIVOT_CHANGED and WALL_REBUILT set min from the resolution; a null resolution gives "0.1"', () => {
    const bus = new EventBus();
    const c = cameraPanelRig(bus);
    const so = (z) => ({ stageOrigin: { x: 1.25, y: 0, z } });
    bus.emit(Events.WALL_PIVOT_CHANGED, { resolution: so(2) });
    assert.equal(c.posZ.attrs.min, '-1.9', 'AC 19: wall-center + (0, 0, 2) on the default wall');
    bus.emit(Events.WALL_REBUILT, { layout: { pivot: { resolution: so(2.3397) } } });
    assert.equal(c.posZ.attrs.min, '-2.3', 'AC 19: concave_offsets with wall-center');
    bus.emit(Events.WALL_REBUILT, { layout: { pivot: { resolution: null } } });
    assert.equal(c.posZ.attrs.min, '0.1');
    bus.emit(Events.WALL_PIVOT_CHANGED, { resolution: so(0) });
    assert.equal(c.posZ.attrs.min, '0.1', 'on the wall plane: the markup value');
  });

  test('CAMERA_POSE_CHANGED {source: pivot} writes pos-x and pos-z with toFixed(2) only', () => {
    const bus = new EventBus();
    const c = cameraPanelRig(bus);
    c.project.camera.posX = 0;
    c.project.camera.posZ = 1.5;
    bus.emit(Events.CAMERA_POSE_CHANGED, { source: 'pivot' });
    assert.equal(c.posX.value, '0.00');
    assert.equal(c.posZ.value, '1.50');
  });
});

describe('PropControls: the pivot pose mirror (03 5.5)', () => {
  test('PROP_POSE_CHANGED {id, source: pivot} writes this prop\'s pos-x and pos-z with toFixed(2)', () => {
    const bus = new EventBus();
    const doc = fakeDoc();
    const project = Project.createDefault();
    new PropControls({ doc, prefix: 'person', controller: {}, prop: project.person, bus });
    project.person.posX = 0.75;
    bus.emit(Events.PROP_POSE_CHANGED, { id: 'car', source: 'pivot' });
    assert.equal(doc.getElementById('person-pos-x').value, '', 'another prop: ignored');
    bus.emit(Events.PROP_POSE_CHANGED, { id: 'person', source: 'pivot' });
    assert.equal(doc.getElementById('person-pos-x').value, '0.75');
    assert.equal(doc.getElementById('person-pos-z').value, '2.00');
  });
});

describe('PivotController module boundaries (ARCHITECTURE.md 1.3; 03 8.2)', () => {
  test('imports only core and geometry (no ui/, render/, interaction/, no THREE)', () => {
    const src = readFileSync(join(ROOT, 'js/app/PivotController.js'), 'utf8');
    const imports = [...src.matchAll(/^\s*import\s+[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    assert.deepEqual(imports, ['../core/EventBus.js', '../geometry/WallLayout.js']);
  });

  test('WallPivot fields are written only through WallPivot methods (no direct assignment in the controller)', () => {
    const src = readFileSync(join(ROOT, 'js/app/PivotController.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\.(mode|offset|keepStageLayout)\s*=[^=]/);
    assert.ok(new WallPivot().equals(new WallPivot()));
  });

  test('the event is the catalogue entry wall:pivotChanged', () => {
    assert.equal(EVENT_KEY['wall:pivotChanged'], 'WALL_PIVOT_CHANGED');
  });

});
