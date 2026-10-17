// Unit tests for ui/PivotPanel (docs/improvements/03-pivot.md 3.2, 3.6, 5.3; 03 T6, test 17 of 8.1, AC 8, 18, 24) and the
// pivot rows of CameraPanel (3.5: #camera-wall-distance): the payload-derived status (every case delivered twice gives the
// same text, R3), the readout texts, the mirrors of the radios, offsets, Reset, the toggles and Select pivot, and the
// listeners (radio change, offset write-back, the switches' click / Space / Enter, the snap select).
// A fake DOM of plain objects; the real Project, EventBus, WallController (spy collaborators) and PivotController.
// Run: node --test tests/unit/pivot-panel.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Events, EventBus } from '../../js/core/EventBus.js';
import { Project } from '../../js/domain/Project.js';
import { WallPivot } from '../../js/domain/Wall.js';
import { Palette } from '../../js/theme/Theme.js';
import { WallController } from '../../js/app/WallController.js';
import { PivotController } from '../../js/app/PivotController.js';
import { PivotPanel, pivotReadoutText, pivotStatusText, rebuildStatusText } from '../../js/ui/PivotPanel.js';
import { CameraPanel } from '../../js/ui/CameraPanel.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A fake element: value, checked, disabled, classes, attributes, listeners, a parent for closest(). */
function el(id, extra = {}) {
  const classes = new Set(extra.classes ?? []);
  const e = {
    id, value: extra.value ?? '', checked: !!extra.checked, disabled: false, textContent: '', attrs: {}, listeners: [],
    parent: null, style: {},
    classList: { contains: (c) => classes.has(c), toggle: (c, f) => { const on = f ?? !classes.has(c); if (on) classes.add(c); else classes.delete(c); return on; },
      add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
    closest(sel) { return sel === '.pivot-mode-option' ? this.parent : null; },
    fire(type, e2 = {}) { let prevented = false; const ev = { key: '', ...e2, preventDefault() { prevented = true; } };
      for (const l of this.listeners.filter((x) => x.type === type)) l.fn(ev); return prevented; },
  };
  return e;
}

/** The panel's markup as fake elements, a real WallController (bootstrapped) and PivotController, the panel bound. */
function makeRig() {
  const project = Project.createDefault();
  const bus = new EventBus();
  const wc = new WallController({
    project, view: { rebuild() {} }, ledTiles: { clearCache() {} }, orbit: { updateCameraPosition() {} }, hub: { refresh() {} },
    bus, palette: Palette, dialogs: { alert() {} },
  });
  const selection = { id: null, isSelected(id) { return this.id === id; }, select(id) { this.id = id; bus.emit(Events.SELECTION_CHANGED, { id, label: 'Pivot', modes: ['translate'] }); },
    deselect() { this.id = null; bus.emit(Events.SELECTION_CHANGED, { id: null, label: null, modes: [] }); } };
  const interaction = { isDraggingGizmo: false, gestureCancelled: false, snap: { pivotM: 0.1 } };
  const gizmo = { mode: 'translate', setMode() {}, setSnapIncrements: (p) => Object.assign(interaction.snap, p) };
  const marker = { exists: true, hasResolution: true, visible: false, pickMeshes: () => [], setPreview() {}, clearPreview() {} };
  const pc = new PivotController({ project, wallController: wc, markerView: marker, stageAnchored: [], selection, gizmo, interaction, bus });
  const map = new Map();
  const labels = ['bottom-left', 'mesh-center', 'wall-center'].map((v) => {
    const label = el(`label-${v}`, { classes: v === 'bottom-left' ? ['pivot-mode-option', 'active'] : ['pivot-mode-option'] });
    const radio = el(`radio-${v}`, { value: v, checked: v === 'bottom-left' });
    radio.parent = label;
    return { label, radio };
  });
  const group = el('pivot-mode-select');
  group.querySelector = (sel) => labels.find(({ radio }) => sel === `input[name="pivot-mode"][value="${radio.value}"]`)?.radio ?? null;
  map.set('pivot-mode-select', group);
  for (const id of ['pivot-offset-x', 'pivot-offset-y', 'pivot-offset-z', 'pivot-reset-offset', 'pivot-select', 'pivot-snap',
    'toggle-pivot-keep-stage', 'toggle-pivot-marker', 'pivot-readout', 'pivot-status', 'pivot-align', 'pivot-yaw-offset', 'pivot-yaw-readout']) map.set(id, el(id));
  map.get('toggle-pivot-keep-stage').classList.add('active');
  const doc = { getElementById: (id) => map.get(id) ?? null };
  const panel = new PivotPanel({ doc, project, pivotController: pc, bus });
  panel.bind();
  wc.rebuild({ cause: 'init' });
  const $ = (id) => map.get(id);
  return { project, bus, wc, pc, panel, $, labels, interaction, selection };
}

const so = (x, z) => ({ x, z });
const res = (y = 0) => ({ mode: 'bottom-left', offset: { x: 0, y, z: 0 }, anchor: { x: 0, y: 0, z: 0 }, point: { x: 0, y, z: 0 },
  stageOrigin: { x: 0, y: 0, z: 0 } });

describe('test 17: the status is a pure function of the mirrored payloads (03 5.3, R3)', () => {
  /** Delivers each payload twice and returns the status text after each delivery. */
  const deliver = (r, steps) => steps.map(([type, payload]) => {
    r.bus.emit(type, payload);
    const first = r.$('pivot-status').textContent;
    r.bus.emit(type, payload);
    assert.equal(r.$('pivot-status').textContent, first, 'the same payload twice gives the same text');
    return first;
  });
  const pivot = { mode: 'wall-center', offset: { x: 0, y: 0, z: 0 }, keepStageLayout: true };
  const rebuilt = (cause, shift) => ({ layout: { pivot: { resolution: res() } }, cause, stageShift: shift });

  test('a mode change that moved the origin keeps its summary through the WALL_REBUILT {cause: pivot} of the same commit', () => {
    const r = makeRig();
    const texts = deliver(r, [
      [Events.WALL_PIVOT_CHANGED, { source: 'mode', pivot, resolution: res(), stageShift: so(1.25, 0), reexpressed: true, rebuilds: true }],
      [Events.WALL_REBUILT, rebuilt('pivot', so(1.25, 0))],
    ]);
    assert.deepEqual(texts, ['Stage origin moved +1.250, 0.000 m · camera and props kept their place',
      'Stage origin moved +1.250, 0.000 m · camera and props kept their place']);
  });

  test('keep off says "kept their coordinates"; negative shifts are signed', () => {
    assert.equal(pivotStatusText({ source: 'offset', resolution: res(), stageShift: so(-0.5, -2), reexpressed: false }),
      'Stage origin moved -0.500, -2.000 m · camera and props kept their coordinates');
  });

  test('wall edits: a shift shows the wall-edit message; a zero shift clears it', () => {
    const r = makeRig();
    const texts = deliver(r, [
      [Events.WALL_REBUILT, rebuilt('edit', so(1.25, 0))],
      [Events.WALL_REBUILT, rebuilt('edit', so(0, 0))],
    ]);
    assert.deepEqual(texts, ['Wall edit moved the stage origin by +1.250, 0.000 m (relative to the wall start) · camera and props kept their coordinates', '']);
  });

  test('a height-only change (rebuilds false), then a wall edit with a shift: the wall-edit message', () => {
    const r = makeRig();
    const texts = deliver(r, [
      [Events.WALL_PIVOT_CHANGED, { source: 'offset', pivot, resolution: res(1.5), stageShift: so(0, 0), reexpressed: false, rebuilds: false }],
      [Events.WALL_REBUILT, rebuilt('edit', so(0.5, 0))],
    ]);
    assert.equal(texts[0], 'Pivot height 1.500 m · affects exports only');
    assert.match(texts[1], /^Wall edit moved the stage origin by \+0\.500, 0\.000 m/);
  });

  test('import and init clear the status; keep-stage and marker leave it unchanged', () => {
    const r = makeRig();
    const texts = deliver(r, [
      [Events.WALL_PIVOT_CHANGED, { source: 'mode', pivot, resolution: res(), stageShift: so(1, 0), reexpressed: true, rebuilds: true }],
      [Events.WALL_PIVOT_CHANGED, { source: 'marker', pivot, resolution: res(), stageShift: so(0, 0), reexpressed: false, rebuilds: false }],
      [Events.WALL_PIVOT_CHANGED, { source: 'keep-stage', pivot, resolution: res(), stageShift: so(0, 0), reexpressed: false, rebuilds: false }],
      [Events.WALL_REBUILT, rebuilt('import', so(-1, 0))],
      [Events.WALL_PIVOT_CHANGED, { source: 'mode', pivot, resolution: res(), stageShift: so(1, 0), reexpressed: true, rebuilds: true }],
      [Events.WALL_REBUILT, rebuilt('init', so(0, 0))],
      [Events.WALL_PIVOT_CHANGED, { source: 'mode', pivot, resolution: res(), stageShift: so(1, 0), reexpressed: true, rebuilds: true }],
      [Events.WALL_PIVOT_CHANGED, { source: 'import', pivot, resolution: res(), stageShift: so(-1, 0), reexpressed: false, rebuilds: true }],
    ]);
    const moved = 'Stage origin moved +1.000, 0.000 m · camera and props kept their place';
    assert.deepEqual(texts, [moved, moved, moved, '', moved, '', moved, '']);
  });

  test('the panel keeps no private event history (only element references)', () => {
    const src = readFileSync(join(ROOT, 'js/ui/PivotPanel.js'), 'utf8');
    assert.doesNotMatch(src, /#(status|last)[A-Z]\w*\s*[;=]/, 'no #status* / #last* fields');
    const fields = [...src.matchAll(/^ {2}(?:\/\*\*[^*]*\*\/ )?#(\w+);/gm)].map((m) => m[1]);
    assert.deepEqual(fields.sort(), ['align', 'keep', 'marker', 'offsets', 'pivotController', 'project', 'radios', 'readout', 'reset', 'select', 'yawOffset', 'yawReadout',
      'snap', 'status'].sort());
  });
});

describe('the readout (03 3.2, 3.6)', () => {
  test('the pivot point in the layout frame; unavailable, empty wall and far-from-anchor texts', () => {
    const r = { mode: 'wall-center', offset: { x: 0, y: 0, z: 2 }, anchor: { x: 1.25, y: 0, z: 0 }, point: { x: 1.25, y: 0, z: 2 },
      stageOrigin: { x: 1.25, y: 0, z: 2 } };
    assert.deepEqual(pivotReadoutText(r, 1), { text: 'Pivot (from wall start): 1.250, 0.000, 2.000 m', warning: false });
    assert.deepEqual(pivotReadoutText(null, 1), { text: 'Pivot unavailable · invalid section values', warning: false });
    assert.equal(pivotReadoutText(r, 0).text, 'No wall sections · pivot at offset 1.250, 0.000, 2.000 m');
    const far = { ...r, offset: { x: 60, y: 0, z: 0 }, point: { x: 61.25, y: 0, z: 0 } };
    assert.deepEqual(pivotReadoutText(far, 1), { text: 'Pivot (from wall start): 61.250, 0.000, 0.000 m · Pivot is 60.0 m from the anchor', warning: true });
  });

  test('rebuildStatusText: pivot leaves the status; unknown causes too', () => {
    assert.equal(rebuildStatusText({ cause: 'pivot', stageShift: so(1, 0) }), null);
    assert.equal(rebuildStatusText({}), null);
  });
});

describe('PivotPanel mirrors and listeners with the real controller (03 3.2; AC 8, 18)', () => {
  test('a radio change sets the mode: radios, labels, readout and status follow', () => {
    const r = makeRig();
    const wall = r.labels[2];
    wall.radio.checked = true;
    wall.radio.fire('change');
    assert.equal(r.project.wall.pivot.mode, 'wall-center');
    assert.deepEqual(r.labels.map(({ radio, label }) => [radio.checked, label.classList.contains('active')]),
      [[false, false], [false, false], [true, true]]);
    assert.equal(r.$('pivot-readout').textContent, 'Pivot (from wall start): 1.250, 0.000, 0.000 m');
    assert.equal(r.$('pivot-status').textContent, 'Stage origin moved +1.250, 0.000 m · camera and props kept their place');
  });

  test('offset typing (AC 8): abc and empty revert, 2000 stores 1000.000, 0.0004 stores 0, 0 is accepted', () => {
    const r = makeRig();
    const x = r.$('pivot-offset-x');
    const type = (v) => { x.value = v; x.fire('change'); return x.value; };
    assert.equal(type('1.5'), '1.500');
    assert.equal(type('abc'), '1.500');
    assert.equal(type(''), '1.500');
    assert.equal(type('2000'), '1000.000');
    assert.equal(type('0.0004'), '0.000');
    assert.equal(r.project.wall.pivot.offset.x, 0);
    assert.equal(type('0'), '0.000');
    assert.equal(r.$('pivot-reset-offset').disabled, true, 'Reset is disabled at (0, 0, 0)');
    r.$('pivot-offset-z').value = '2';
    r.$('pivot-offset-z').fire('change');
    assert.equal(r.$('pivot-reset-offset').disabled, false);
    r.$('pivot-reset-offset').fire('click');
    assert.deepEqual(r.project.wall.pivot.offset, { x: 0, y: 0, z: 0 });
    assert.equal(r.$('pivot-offset-z').value, '0.000');
  });

  test('the switches: click, Space and Enter flip them; the mirror writes the class and aria-checked', () => {
    const r = makeRig();
    const keep = r.$('toggle-pivot-keep-stage');
    keep.fire('click');
    assert.equal(r.project.wall.pivot.keepStageLayout, false);
    assert.equal(keep.classList.contains('active'), false);
    assert.equal(keep.attrs['aria-checked'], 'false');
    assert.equal(keep.fire('keydown', { key: ' ' }), true, 'Space is consumed (no page scroll)');
    assert.equal(r.project.wall.pivot.keepStageLayout, true);
    assert.equal(keep.attrs['aria-checked'], 'true');
    keep.fire('keydown', { key: 'a' });
    assert.equal(r.project.wall.pivot.keepStageLayout, true, 'other keys do nothing');
    const marker = r.$('toggle-pivot-marker');
    const initial = r.project.display.showPivotMarker;   // DisplaySettings.DEFAULT_SHOW_PIVOT_MARKER (true since 03 T9)
    marker.fire('keydown', { key: 'Enter' });
    assert.equal(r.project.display.showPivotMarker, !initial);
    assert.equal(marker.classList.contains('active'), !initial);
    assert.equal(marker.attrs['aria-checked'], String(!initial));
    marker.fire('click');
    assert.equal(r.project.display.showPivotMarker, initial);
    assert.equal(marker.attrs['aria-checked'], String(initial));
  });

  test('Select pivot toggles the selection; its state mirrors SELECTION_CHANGED; the snap select sets the step', () => {
    const r = makeRig();
    r.$('pivot-select').fire('click');
    assert.equal(r.selection.id, 'pivot');
    assert.equal(r.$('pivot-select').classList.contains('active'), true);
    assert.equal(r.$('pivot-select').attrs['aria-pressed'], 'true');
    r.$('pivot-select').fire('click');
    assert.equal(r.$('pivot-select').attrs['aria-pressed'], 'false');
    r.$('pivot-snap').value = '0.5';
    r.$('pivot-snap').fire('change');
    assert.equal(r.interaction.snap.pivotM, 0.5);
  });

  test('an import keeps the session pivot in the panel (03 12.11) and clears the status', () => {
    const r = makeRig();
    r.pc.setMode('mesh-center');
    r.pc.setOffsetAxis('y', '2');
    r.wc.applyImport({ sections: r.project.wall.sections.slice(), meshMode: null });
    assert.equal(r.labels[1].radio.checked, true);
    assert.equal(r.$('pivot-offset-y').value, '2.000');
    assert.equal(r.$('pivot-status').textContent, '');
    assert.equal(r.project.wall.pivot.mode, 'mesh-center');
  });
});

describe('the Wall Pivot switches are named (03 3.2, AC 18)', () => {
  test('every role="switch" of index.html is labelled by its visible .toggle-label text (aria-labelledby)', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const switches = [...html.matchAll(/<div\b[^>]*\brole="switch"[^>]*>/g)].map((m) => m[0]);
    assert.deepEqual(switches.map((t) => /\bid="([^"]+)"/.exec(t)[1]), ['toggle-pivot-keep-stage', 'toggle-pivot-marker']);
    const expected = { 'toggle-pivot-keep-stage': 'Keep stage layout on pivot change', 'toggle-pivot-marker': 'Show pivot marker' };
    for (const tag of switches) {
      const id = /\bid="([^"]+)"/.exec(tag)[1];
      const ref = /\baria-labelledby="([^"]+)"/.exec(tag);
      assert.ok(ref, `#${id} has aria-labelledby`);
      const label = new RegExp(`<span class="toggle-label" id="${ref[1]}">([^<]*)</span>`).exec(html);
      assert.ok(label, `#${ref[1]} is a .toggle-label span`);
      assert.equal(label[1], expected[id]);
    }
  });
});

describe('CameraPanel: "Distance to wall plane" (03 3.5)', () => {
  test('CAMERA_COVERAGE_CHANGED writes #camera-wall-distance as distToWall.toFixed(2) + m', () => {
    const map = new Map();
    const doc = { getElementById: (id) => { if (!map.has(id)) map.set(id, el(id)); return map.get(id); } };
    const bus = new EventBus();
    new CameraPanel({ doc, project: Project.createDefault(), cameraController: {}, projectIO: {}, bus,
      theme: { ui: { status: { within: 'a', offCenter: 'b', exceeds: 'c' } } } });
    bus.emit(Events.CAMERA_COVERAGE_CHANGED, { frameWidth: 1.54, frameHeight: 1.03, status: 'within', safeDistance: 3, distToWall: 1.5 });
    assert.equal(map.get('camera-wall-distance').textContent, '1.50m');
  });
});
