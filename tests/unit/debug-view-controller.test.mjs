// Unit tests for js/app/DebugViewController.js (docs/improvements/01-normals.md 5.2, 5.3, 8.1; 01 T6 and T7), with spies:
// each use case writes DebugViewSettings first, then emits exactly one DEBUG_VIEW_CHANGED with a frozen snapshot of the
// settings (F1-2, T7), then makes exactly one render call (NormalsDebugView.sync or LEDWallView.setDebugShading): model,
// mirror, render (R2).
// Run: node --test tests/unit/debug-view-controller.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { DebugViewController } from '../../js/app/DebugViewController.js';
import { DebugViewSettings } from '../../js/domain/DebugViewSettings.js';
import { EventBus, Events } from '../../js/core/EventBus.js';

/** The controller with spy views and a real bus whose one subscriber records each event; every record holds the
 *  settings seen at that moment. */
function setup() {
  const settings = new DebugViewSettings();
  const calls = [];
  const normalsView = { sync: (...args) => calls.push({ call: 'normalsView.sync', args, seen: settings.snapshot() }) };
  const wallView = { setDebugShading: (...args) => calls.push({ call: 'wallView.setDebugShading', args, seen: settings.snapshot() }) };
  const bus = new EventBus();
  bus.on(Events.DEBUG_VIEW_CHANGED, (payload) => calls.push({ call: 'emit', args: [payload], seen: settings.snapshot() }));
  return { settings, calls, controller: new DebugViewController({ settings, wallView, normalsView, bus }) };
}

/** The render calls only (the event is checked separately). */
const renders = (calls) => calls.filter((c) => c.call !== 'emit');

describe('DebugViewController (model write, then one render call)', () => {
  test('toggleNormals flips normals.enabled, then syncs the lines once', () => {
    const { settings, calls, controller } = setup();
    assert.equal(controller.toggleNormals(), true);
    assert.equal(settings.normals.enabled, true);
    assert.deepEqual(renders(calls).map((c) => c.call), ['normalsView.sync']);
    assert.equal(renders(calls)[0].seen.normals.enabled, true, 'the model was written before the render call');
    assert.deepEqual(renders(calls)[0].args, []);
    assert.equal(controller.toggleNormals(), false);
    assert.equal(renders(calls).length, 2);
  });

  test('setNormalLineKinds assigns only the kinds given', () => {
    const { settings, calls, controller } = setup();
    controller.setNormalLineKinds({ face: true });
    assert.deepEqual([settings.normals.vertex, settings.normals.face], [true, true]);
    controller.setNormalLineKinds({ vertex: false });
    assert.deepEqual([settings.normals.vertex, settings.normals.face], [false, true]);
    assert.deepEqual(renders(calls).map((c) => c.call), ['normalsView.sync', 'normalsView.sync']);
    assert.equal(renders(calls)[1].seen.normals.vertex, false);
  });

  test('setLengthScale stores the parsed value and returns it', () => {
    const { settings, calls, controller } = setup();
    assert.equal(controller.setLengthScale('2.6'), 2.5);
    assert.equal(settings.normals.lengthScale, 2.5);
    assert.equal(controller.setLengthScale(0), 1);
    assert.deepEqual(renders(calls).map((c) => c.seen.normals.lengthScale), [2.5, 1]);
  });

  test('setOnTop(true) sets normals.onTop === true, then syncs once', () => {
    const { settings, calls, controller } = setup();
    controller.setOnTop(true);
    assert.equal(settings.normals.onTop, true);
    controller.setOnTop(0);
    assert.equal(settings.normals.onTop, false);
    assert.deepEqual(renders(calls).map((c) => [c.call, c.seen.normals.onTop]), [['normalsView.sync', true], ['normalsView.sync', false]]);
  });

  test('setShading stores a valid mode (anything else as "content") and passes it to the wall view once', () => {
    const { settings, calls, controller } = setup();
    assert.equal(controller.setShading('faceOrientation'), 'faceOrientation');
    assert.equal(settings.shading, 'faceOrientation');
    assert.equal(controller.setShading('bogus'), 'content');
    assert.deepEqual(renders(calls).map((c) => [c.call, c.args[0], c.seen.shading]),
      [['wallView.setDebugShading', 'faceOrientation', 'faceOrientation'], ['wallView.setDebugShading', 'content', 'content']]);
  });

  test('cycleShading walks content -> faceOrientation -> normalColors -> content', () => {
    const { calls, controller } = setup();
    assert.deepEqual([controller.cycleShading(), controller.cycleShading(), controller.cycleShading()], ['faceOrientation', 'normalColors', 'content']);
    assert.equal(renders(calls).length, 3);
    assert.ok(renders(calls).every((c) => c.call === 'wallView.setDebugShading'));
  });

  test('no use case touches the other view (lines and shading are independent)', () => {
    const { calls, controller } = setup();
    controller.toggleNormals();
    controller.setShading('normalColors');
    controller.setLengthScale(3);
    assert.deepEqual(renders(calls).map((c) => c.call), ['normalsView.sync', 'wallView.setDebugShading', 'normalsView.sync']);
  });
});

describe('DebugViewController DEBUG_VIEW_CHANGED (F1-2: model write, then one event, then the render call)', () => {
  const USE_CASES = [
    ['toggleNormals', (c) => c.toggleNormals(), 'normalsView.sync'],
    ['setNormalLineKinds', (c) => c.setNormalLineKinds({ face: true }), 'normalsView.sync'],
    ['setLengthScale', (c) => c.setLengthScale('2'), 'normalsView.sync'],
    ['setOnTop', (c) => c.setOnTop(true), 'normalsView.sync'],
    ['setShading', (c) => c.setShading('normalColors'), 'wallView.setDebugShading'],
    ['cycleShading', (c) => c.cycleShading(), 'wallView.setDebugShading'],
  ];

  for (const [name, run, render] of USE_CASES) {
    test(`${name}: exactly one event between the settings write and the render call`, () => {
      const { settings, calls, controller } = setup();
      const before = settings.snapshot();
      run(controller);
      assert.deepEqual(calls.map((c) => c.call), ['emit', render]);
      const [payload] = calls[0].args;
      assert.notDeepEqual(calls[0].seen, before, 'the model was written before the event');
      assert.deepEqual(payload, settings.snapshot(), 'the payload is the snapshot after the write');
      assert.deepEqual(calls[1].seen, payload, 'the render call sees the same settings');
    });
  }

  test('the payload is a frozen copy {shading, normals: {enabled, vertex, face, lengthScale, onTop}}', () => {
    const { settings, calls, controller } = setup();
    controller.setLengthScale('2');
    const [payload] = calls[0].args;
    assert.deepEqual(payload, { shading: 'content', normals: { enabled: false, vertex: true, face: false, lengthScale: 2, onTop: false } });
    assert.ok(Object.isFrozen(payload) && Object.isFrozen(payload.normals));
    assert.notEqual(payload.normals, settings.normals, 'not the live settings object');
  });

  test('a call that stores the same value still emits once (the mirror decides what changed)', () => {
    const { calls, controller } = setup();
    controller.setLengthScale(1);
    controller.setShading('content');
    assert.deepEqual(calls.map((c) => c.call), ['emit', 'normalsView.sync', 'emit', 'wallView.setDebugShading']);
  });
});
