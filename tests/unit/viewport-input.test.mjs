// Unit tests for interaction/ViewportInput's path-B additions (docs/improvements/03-pivot.md 3.4, 5.4; 03 T5, test 16 of
// 8.1): the O key with its guards, the Escape order (cancel a hooked drag first, keeping the selection; the legacy branches
// otherwise) and the router's gesture swallowing (no gizmo move or hover while a cancelled drag's button is held).
// A fake document, window and canvas collect the listeners; the gizmo, selection and pilot are recording stubs.
// Run: node --test tests/unit/viewport-input.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FakeTHREE } from './fixtures/fake-three.mjs';

globalThis.window = { THREE: FakeTHREE };   // js/vendor/three.js reads window.THREE when InputState.js imports it
const { ViewportInput } = await import('../../js/interaction/ViewportInput.js');

/** A listener collector (document, window or canvas). */
const target = () => ({ listeners: [], addEventListener(type, fn) { this.listeners.push({ type, fn }); },
  fire(type, e = {}) { for (const l of this.listeners.filter((x) => x.type === type)) l.fn(e); } });

function makeRig({ hookTarget = true } = {}) {
  const log = [];
  const doc = target();
  const win = target();
  const canvas = target();
  const interaction = { pilotMode: false, isDraggingGizmo: false, gestureCancelled: false };
  const gizmoTarget = hookTarget ? { id: 'pivot', endGizmoDrag() {} } : { id: 'camera' };
  const gizmo = {
    mode: 'translate', target: gizmoTarget,
    setMode: (m) => log.push(`gizmo.setMode:${m}`), toggleSpace: () => log.push('gizmo.toggleSpace'),
    clearMode: () => log.push('gizmo.clearMode'),
    cancelDrag: () => { log.push('gizmo.cancelDrag'); return true; },
    onMouseDown: () => { log.push('gizmo.onMouseDown'); return false; },
    onMouseMove: () => log.push('gizmo.onMouseMove'), onHover: () => log.push('gizmo.onHover'),
    onMouseUp: () => log.push('gizmo.onMouseUp'),
  };
  const selection = { deselect: () => log.push('selection.deselect'), pickAt: () => log.push('selection.pickAt') };
  const pilot = {
    toggle: () => log.push('pilot.toggle'), onMouseDown: () => log.push('pilot.onMouseDown'),
    onMouseMove: () => log.push('pilot.onMouseMove'), onMouseUp: () => log.push('pilot.onMouseUp'), onWheel() {},
  };
  const vi = new ViewportInput({
    doc, win, sceneManager: { renderer: { domElement: canvas } }, interaction, gizmo, selection, pilot,
    onPivotShortcut: () => log.push('onPivotShortcut'),
  });
  vi.attachShortcuts();
  vi.attachPointer();
  const body = { tagName: 'BODY' };
  const key = (k, over = {}) => doc.fire('keydown', { key: k, target: body, ctrlKey: false, metaKey: false, altKey: false,
    shiftKey: false, repeat: false, ...over });
  return { log, doc, win, canvas, interaction, gizmo, key, body };
}

describe('the O key (03 3.4)', () => {
  test('a plain o or O on the body calls onPivotShortcut once each', () => {
    const r = makeRig();
    r.key('o');
    r.key('O', { shiftKey: true });
    assert.deepEqual(r.log, ['onPivotShortcut', 'onPivotShortcut']);
  });

  test('never for a typing target, a modifier, auto-repeat, pilot mode or a (cancelled) drag', () => {
    const r = makeRig();
    for (const t of [{ tagName: 'INPUT', type: 'text' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' },
      { tagName: 'DIV', isContentEditable: true }]) r.key('o', { target: t });
    for (const mod of ['ctrlKey', 'metaKey', 'altKey']) r.key('o', { [mod]: true });
    r.key('o', { repeat: true });
    r.interaction.pilotMode = true;
    r.key('o');
    r.interaction.pilotMode = false;
    r.interaction.isDraggingGizmo = true;
    r.key('o');
    r.interaction.isDraggingGizmo = false;
    r.interaction.gestureCancelled = true;
    r.key('o');
    assert.deepEqual(r.log, []);
  });
});

describe('Escape order (03 3.4, spec 02 3.5)', () => {
  test('during a drag on a target with endGizmoDrag: cancelDrag only (selection and mode kept)', () => {
    const r = makeRig();
    r.interaction.isDraggingGizmo = true;
    r.key('Escape');
    assert.deepEqual(r.log, ['gizmo.cancelDrag']);
  });

  test('during a drag on a legacy target (no hook): the legacy deselect branch, unchanged', () => {
    const r = makeRig({ hookTarget: false });
    r.interaction.isDraggingGizmo = true;
    r.key('Escape');
    assert.deepEqual(r.log, ['selection.deselect', 'gizmo.clearMode']);
  });

  test('no drag: pilot mode exits pilot; otherwise deselect and clear the mode (legacy)', () => {
    const r = makeRig();
    r.interaction.pilotMode = true;
    r.key('Escape');
    r.interaction.pilotMode = false;
    r.key('Escape');
    assert.deepEqual(r.log, ['pilot.toggle', 'selection.deselect', 'gizmo.clearMode']);
  });
});

describe('the router swallows a cancelled gesture (03 5.4)', () => {
  test('while gestureCancelled, mousemove calls neither gizmo.onMouseMove nor gizmo.onHover', () => {
    const r = makeRig();
    r.interaction.gestureCancelled = true;
    r.canvas.fire('mousemove', {});
    r.interaction.isDraggingGizmo = true;
    r.canvas.fire('mousemove', {});
    assert.deepEqual(r.log, []);
    r.interaction.gestureCancelled = false;
    r.canvas.fire('mousemove', {});
    r.interaction.isDraggingGizmo = false;
    r.canvas.fire('mousemove', {});
    assert.deepEqual(r.log, ['gizmo.onMouseMove', 'gizmo.onHover'], 'unchanged legacy routing otherwise');
  });
});
