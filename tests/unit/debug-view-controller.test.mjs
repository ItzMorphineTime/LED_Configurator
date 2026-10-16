// Unit tests for js/app/DebugViewController.js as of F1-1 (docs/improvements/01-normals.md 5.2, 8.1; 01 T6), with spies:
// each use case writes DebugViewSettings first and then makes exactly one render call (NormalsDebugView.sync or
// LEDWallView.setDebugShading); there is no bus and no event until F1-2 (T7), which extends this file with the
// DEBUG_VIEW_CHANGED order (model write, one event, render call).
// Run: node --test tests/unit/debug-view-controller.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { DebugViewController } from '../../js/app/DebugViewController.js';
import { DebugViewSettings } from '../../js/domain/DebugViewSettings.js';

/** The controller with spy views that record each call and the settings they saw at that moment. */
function setup() {
  const settings = new DebugViewSettings();
  const calls = [];
  const normalsView = { sync: (...args) => calls.push({ call: 'normalsView.sync', args, seen: settings.snapshot() }) };
  const wallView = { setDebugShading: (...args) => calls.push({ call: 'wallView.setDebugShading', args, seen: settings.snapshot() }) };
  return { settings, calls, controller: new DebugViewController({ settings, wallView, normalsView }) };
}

describe('DebugViewController (F1-1: model write, then one render call)', () => {
  test('toggleNormals flips normals.enabled, then syncs the lines once', () => {
    const { settings, calls, controller } = setup();
    assert.equal(controller.toggleNormals(), true);
    assert.equal(settings.normals.enabled, true);
    assert.deepEqual(calls.map((c) => c.call), ['normalsView.sync']);
    assert.equal(calls[0].seen.normals.enabled, true, 'the model was written before the render call');
    assert.deepEqual(calls[0].args, []);
    assert.equal(controller.toggleNormals(), false);
    assert.equal(calls.length, 2);
  });

  test('setNormalLineKinds assigns only the kinds given', () => {
    const { settings, calls, controller } = setup();
    controller.setNormalLineKinds({ face: true });
    assert.deepEqual([settings.normals.vertex, settings.normals.face], [true, true]);
    controller.setNormalLineKinds({ vertex: false });
    assert.deepEqual([settings.normals.vertex, settings.normals.face], [false, true]);
    assert.deepEqual(calls.map((c) => c.call), ['normalsView.sync', 'normalsView.sync']);
    assert.equal(calls[1].seen.normals.vertex, false);
  });

  test('setLengthScale stores the parsed value and returns it', () => {
    const { settings, calls, controller } = setup();
    assert.equal(controller.setLengthScale('2.6'), 2.5);
    assert.equal(settings.normals.lengthScale, 2.5);
    assert.equal(controller.setLengthScale(0), 1);
    assert.deepEqual(calls.map((c) => c.seen.normals.lengthScale), [2.5, 1]);
  });

  test('setOnTop(true) sets normals.onTop === true, then syncs once', () => {
    const { settings, calls, controller } = setup();
    controller.setOnTop(true);
    assert.equal(settings.normals.onTop, true);
    controller.setOnTop(0);
    assert.equal(settings.normals.onTop, false);
    assert.deepEqual(calls.map((c) => [c.call, c.seen.normals.onTop]), [['normalsView.sync', true], ['normalsView.sync', false]]);
  });

  test('setShading stores a valid mode (anything else as "content") and passes it to the wall view once', () => {
    const { settings, calls, controller } = setup();
    assert.equal(controller.setShading('faceOrientation'), 'faceOrientation');
    assert.equal(settings.shading, 'faceOrientation');
    assert.equal(controller.setShading('bogus'), 'content');
    assert.deepEqual(calls.map((c) => [c.call, c.args[0], c.seen.shading]),
      [['wallView.setDebugShading', 'faceOrientation', 'faceOrientation'], ['wallView.setDebugShading', 'content', 'content']]);
  });

  test('cycleShading walks content -> faceOrientation -> normalColors -> content', () => {
    const { calls, controller } = setup();
    assert.deepEqual([controller.cycleShading(), controller.cycleShading(), controller.cycleShading()], ['faceOrientation', 'normalColors', 'content']);
    assert.equal(calls.length, 3);
    assert.ok(calls.every((c) => c.call === 'wallView.setDebugShading'));
  });

  test('no use case touches the other view (lines and shading are independent)', () => {
    const { calls, controller } = setup();
    controller.toggleNormals();
    controller.setShading('normalColors');
    controller.setLengthScale(3);
    assert.deepEqual(calls.map((c) => c.call), ['normalsView.sync', 'wallView.setDebugShading', 'normalsView.sync']);
  });
});
