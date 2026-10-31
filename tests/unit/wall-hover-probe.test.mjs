// Unit tests for js/interaction/WallHoverProbe.js (docs/improvements/04-uvs-uv-editor.md 3.5, 5.3, 8.1; UV-15) in its
// own-raycast mode, with a fake rAF queue, a fake PointerRay counting raycasts and a fake InteractionState: disabled it
// never raycasts; N mousemoves within one frame give one raycast; held buttons, gizmo drags and pilot mode skip it;
// setEnabled(false) delivers onHover(null) once; a hit from behind (DoubleSide faces) is delivered as null; the raycast
// targets are targets() only; doubleClick: false registers no dblclick listener.
// Run: node --test tests/unit/wall-hover-probe.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  transformDirection() { return this; }   // identity world matrices in these tests
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
}
globalThis.window = { THREE: { Vector3 } };
const { WallHoverProbe } = await import('../../js/interaction/WallHoverProbe.js');

function setup({ doubleClick = true, hits = null } = {}) {
  const listeners = {};
  const canvas = { addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); } };
  const frames = [];
  const win = { requestAnimationFrame: (fn) => frames.push(fn) };
  const interaction = { pilotMode: false, isDraggingGizmo: false };
  const targets = [{ name: 'front-mesh' }];
  let raycasts = 0;
  let lastTargets = null;
  const front = { object: { matrixWorld: null }, face: { normal: new Vector3(0, 0, 1) }, point: {} };
  const pointerRay = {
    fromEvent: () => ({
      ray: { direction: new Vector3(0, 0, -1) },
      intersectObjects: (objs) => { raycasts++; lastTargets = objs; return hits ?? [front]; },
    }),
  };
  const delivered = [];
  const doubleClicks = [];
  const probe = new WallHoverProbe({
    sceneManager: { renderer: { domElement: canvas } }, pointerRay, interaction, win, targets: () => targets,
    onHover: (hit) => delivered.push(hit), onDoubleClick: (hit) => doubleClicks.push(hit), doubleClick,
  });
  const fire = (type, e = {}) => (listeners[type] || []).forEach((fn) => fn({ buttons: 0, clientX: 1, clientY: 1, ...e }));
  const flush = () => frames.splice(0).forEach((fn) => fn());
  return { probe, listeners, fire, flush, interaction, delivered, doubleClicks, raycasts: () => raycasts, lastTargets: () => lastTargets, targets, front };
}

describe('WallHoverProbe (own-raycast mode)', () => {
  test('the constructor attaches nothing; disabled, mousemoves never raycast', () => {
    const s = setup();
    assert.deepEqual(Object.keys(s.listeners), []);
    s.probe.attach();
    assert.deepEqual(Object.keys(s.listeners).sort(), ['dblclick', 'mouseleave', 'mousemove']);
    s.fire('mousemove');
    s.flush();
    assert.equal(s.raycasts(), 0);
  });

  test('enabled: N mousemoves in one frame give one raycast of targets() and one delivery', () => {
    const s = setup();
    s.probe.attach();
    s.probe.setEnabled(true);
    for (let k = 0; k < 5; k++) s.fire('mousemove', { clientX: k });
    assert.equal(s.raycasts(), 0, 'nothing before the frame');
    s.flush();
    assert.equal(s.raycasts(), 1);
    assert.equal(s.lastTargets(), s.targets);
    assert.deepEqual(s.delivered, [s.front]);
  });

  test('skipped while a button is held, while the gizmo is dragged and in pilot mode', () => {
    const s = setup();
    s.probe.attach();
    s.probe.setEnabled(true);
    s.fire('mousemove', { buttons: 1 });
    s.flush();
    s.interaction.isDraggingGizmo = true;
    s.fire('mousemove');
    s.flush();
    s.interaction.isDraggingGizmo = false;
    s.interaction.pilotMode = true;
    s.fire('mousemove');
    s.flush();
    assert.equal(s.raycasts(), 0);
  });

  test('setEnabled(false) delivers onHover(null) once; a back-face hit is delivered as null', () => {
    const back = { object: { matrixWorld: null }, face: { normal: new Vector3(0, 0, -1) }, point: {} };
    const s = setup({ hits: [back] });
    s.probe.attach();
    s.probe.setEnabled(true);
    s.fire('mousemove');
    s.flush();
    assert.deepEqual(s.delivered, [], 'the first null after nothing is not delivered');
    const t = setup();
    t.probe.attach();
    t.probe.setEnabled(true);
    t.fire('mousemove');
    t.flush();
    t.probe.setEnabled(false);
    t.probe.setEnabled(false);
    assert.deepEqual(t.delivered, [t.front, null]);
  });

  test('a double-click on the front of the wall is delivered even while the hover is disabled; doubleClick false adds no listener', () => {
    const s = setup();
    s.probe.attach();
    s.fire('dblclick');
    assert.deepEqual(s.doubleClicks, [s.front]);
    const n = setup({ doubleClick: false });
    n.probe.attach();
    assert.equal(n.listeners.dblclick, undefined);
  });
});
