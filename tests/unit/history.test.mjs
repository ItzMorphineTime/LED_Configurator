// Unit tests of the one undo stack (spec 07 H1, H2; 5.6.1, 6.10): app/History over a fake session (run, record, no-op
// edits, nesting, coalescing, the apply suspension, transactions, the limits, HISTORY_CHANGED and onCommitted), the
// history chords and their text-field guard (ui/HistoryControls historyShortcut, core/typingTarget isTextEditTarget),
// HistoryControls over a fake DOM, and the real use cases over a real ProjectSession: a section edit, the mesh mode, a
// pivot drag and a UV vertex drag undone and redone step by step; the pivot orientation, keep-stage-layout and the UV
// settings; a rename, New and Open undone; undo back to the saved state is clean.
// Run: node --test tests/unit/history.test.mjs   (zero dependencies)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { EventBus, Events } from '../../js/core/EventBus.js';
import { isTextEditTarget } from '../../js/core/typingTarget.js';
import { NO_HISTORY } from '../../js/core/historyRecorder.js';
import { Project } from '../../js/domain/Project.js';
import { History, HISTORY_LIMITS } from '../../js/app/History.js';
import { WallController } from '../../js/app/WallController.js';
import { PivotController } from '../../js/app/PivotController.js';
import { UvController } from '../../js/app/UvController.js';
import { UvViewModel } from '../../js/app/UvViewModel.js';
import { HistoryControls, historyShortcut, historyTitles } from '../../js/ui/HistoryControls.js';
import { ProjectSerializer } from '../../js/io/ProjectSerializer.js';
import { Palette } from '../../js/theme/Theme.js';
import { historySession } from './fixtures/session-history.mjs';

// ---- History over a fake session ---------------------------------------------------------------------------------

/** A session whose project is a plain object; apply replaces it (and may run a use case, as the real apply does). */
function fakeSession() {
  return {
    state: { a: 0, b: 0 },
    applying: false,
    reasons: [],
    onApply: null,
    capture() { return JSON.stringify(this.state); },
    apply(v2, { reason, scope }) {
      assert.equal(scope, 'full');
      this.applying = true;
      try {
        this.reasons.push(reason);
        this.state = { ...v2 };
        if (this.onApply) this.onApply();
      } finally {
        this.applying = false;
      }
    },
  };
}

function rig({ limits } = {}) {
  let now = 1000;
  const bus = new EventBus();
  const events = [];
  bus.on(Events.HISTORY_CHANGED, (p) => events.push(p));
  let committed = 0;
  const history = new History({ bus, clock: () => now, limits, onCommitted: () => { committed++; } });
  const session = fakeSession();
  history.attach(session);
  history.reset();
  const edit = (label, patch, options) => history.run(label, () => Object.assign(session.state, patch), options);
  return { history, session, events, edit, committed: () => committed, tick: (ms) => { now += ms; } };
}

describe('History: run, record, undo and redo (07 6.10)', () => {
  test('one entry per run, labels, undo and redo apply the snapshots through the session', () => {
    const r = rig();
    assert.deepEqual(r.history.state, { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null, depth: 0 });
    assert.equal(r.events.length, 1, 'reset emits');
    assert.equal(r.committed(), 0, 'reset does not commit');
    assert.equal(r.edit('Set A', { a: 1 }), r.session.state, 'run returns fn\'s result');
    r.edit('Set B', { b: 2 });
    assert.deepEqual([r.history.undoLabel, r.history.depth], ['Set B', 2]);
    assert.equal(r.history.current, JSON.stringify({ a: 1, b: 2 }));
    assert.ok(r.history.undo());
    assert.deepEqual(r.session.state, { a: 1, b: 0 });
    assert.deepEqual([r.history.undoLabel, r.history.redoLabel], ['Set A', 'Set B']);
    r.history.undo();
    assert.deepEqual(r.session.state, { a: 0, b: 0 });
    assert.equal(r.history.undo(), false, 'nothing left');
    r.history.redo();
    r.history.redo();
    assert.deepEqual(r.session.state, { a: 1, b: 2 });
    assert.equal(r.history.redo(), false);
    assert.deepEqual(r.session.reasons, ['undo', 'undo', 'redo', 'redo']);
    assert.equal(r.committed(), 6, 'onCommitted after every record, undo and redo');
    assert.deepEqual(r.events.at(-1), { canUndo: true, canRedo: false, undoLabel: 'Set B', redoLabel: null, depth: 2 });
  });

  test('a no-op edit records nothing; nested runs record once with the outer label; an exception records nothing', () => {
    const r = rig();
    r.edit('Nothing', { a: 0 });
    assert.equal(r.history.canUndo, false);
    r.history.run('Outer', () => {
      r.edit('Inner 1', { a: 1 });
      r.edit('Inner 2', { b: 1 });
    });
    assert.deepEqual([r.history.depth, r.history.undoLabel], [1, 'Outer']);
    assert.throws(() => r.history.run('Boom', () => { r.session.state.a = 5; throw new Error('boom'); }), /boom/);
    assert.equal(r.history.undoLabel, 'Outer');
    r.edit('Next', { b: 2 });
    assert.equal(r.history.undoLabel, 'Next', 'the next record carries the change the failed run left');
  });

  test('coalescing: one key within the window merges; another key, the window or an undo starts an entry', () => {
    const r = rig();
    r.edit('Type 1', { a: 1 }, { coalesceKey: 'k' });
    r.tick(500);
    r.edit('Type 2', { a: 2 }, { coalesceKey: 'k' });
    assert.deepEqual([r.history.depth, r.history.undoLabel], [1, 'Type 2'], 'merged, newest label');
    r.tick(500);
    r.edit('Type 3', { a: 3 }, { coalesceKey: 'k' });
    assert.equal(r.history.depth, 1, 'a sliding window: 500 ms after the previous record');
    r.tick(751);
    r.edit('Type 4', { a: 4 }, { coalesceKey: 'k' });
    assert.equal(r.history.depth, 2, 'outside the window');
    r.edit('Other', { b: 1 }, { coalesceKey: 'j' });
    r.edit('Other 2', { b: 2 }, { coalesceKey: 'k' });
    assert.equal(r.history.depth, 4, 'another key in between');
    r.history.undo();
    r.edit('After undo', { b: 3 }, { coalesceKey: 'k' });
    assert.deepEqual([r.history.depth, r.history.canRedo], [4, false], 'never merged into an undone state; the redo branch is dropped');
    r.edit('Back', { b: 1 }, { coalesceKey: 'z' });
    r.edit('Back again', { b: 2 }, { coalesceKey: 'z' });
    r.edit('Back to start', { b: 1 }, { coalesceKey: 'z' });
    assert.equal(r.history.depth, 5);
    r.edit('Cancel out', { b: 3 }, { coalesceKey: 'z' });
    assert.equal(r.history.depth, 4, 'merged back to the state before it: the entry goes');
    assert.equal(r.history.undoLabel, 'After undo');
    assert.equal(r.history.run('x', () => 1, { coalesceKey: 'z', coalesceMs: 0 }), 1);
  });

  test('nothing records while the session applies or while an undo applies (the use cases apply reuses)', () => {
    const r = rig();
    r.edit('Set A', { a: 1 });
    r.session.onApply = () => r.edit('Reused use case', { b: 9 });
    r.history.undo();
    assert.deepEqual([r.history.depth, r.history.canRedo], [0, true]);
    assert.equal(r.session.state.b, 9, 'the use case ran, unrecorded');
    r.session.onApply = null;
    r.session.applying = true;
    assert.equal(r.history.recording, false);
    assert.equal(r.history.record('During apply'), false);
    r.session.applying = false;
    assert.equal(r.history.recording, true);
  });

  test('the limits: at most maxSteps undo steps and maxBytes of snapshots, the oldest go first', () => {
    const r = rig({ limits: { maxSteps: 3, maxBytes: Infinity } });
    for (let k = 1; k <= 5; k++) r.edit(`Edit ${k}`, { a: k });
    assert.equal(r.history.depth, 3);
    while (r.history.undo());
    assert.deepEqual(r.session.state, { a: 2, b: 0 }, 'the two oldest steps were dropped');
    const snap = JSON.stringify({ a: 10, b: 0 }).length * 2;
    const small = rig({ limits: { maxSteps: 100, maxBytes: snap * 2 } });
    for (let k = 10; k <= 14; k++) small.edit(`Edit ${k}`, { a: k });
    assert.equal(small.history.depth, 1, 'two snapshots fit');
    assert.deepEqual(HISTORY_LIMITS, { maxSteps: 100, maxBytes: 32 * 1024 * 1024 });
  });

  test('transactions: one entry per drag, nothing for a no-op drag, Escape and undo cancel', () => {
    const r = rig();
    r.history.begin('Move camera');
    r.session.state.a = 1;
    r.edit('Move camera', { a: 2 });
    assert.equal(r.history.depth, 0, 'a record with the transaction\'s label is absorbed');
    assert.ok(r.history.inTransaction);
    r.history.commit();
    assert.deepEqual([r.history.depth, r.history.undoLabel, r.history.inTransaction], [1, 'Move camera', false]);
    r.history.begin('Move person');
    r.history.commit();
    assert.equal(r.history.depth, 1, 'a drag that ends where it started records nothing');
    r.history.begin('Move pivot');
    r.session.state.b = 1;
    r.edit('Rename', { a: 7 });
    assert.deepEqual([r.history.depth, r.history.inTransaction], [1, true], 'another action inside a drag is absorbed');
    r.history.commit();
    assert.deepEqual([r.history.depth, r.history.undoLabel, r.session.state], [2, 'Move pivot', { a: 7, b: 1 }]);
    r.history.begin('Move car');
    r.session.state.b = 5;
    r.history.cancel({ revert: false });
    assert.equal(r.session.state.b, 5, 'revert: false leaves the live state (the target restored itself)');
    r.session.state.b = 1;
    r.history.begin('Move car');
    r.session.state.b = 6;
    r.history.cancel();
    assert.deepEqual([r.session.state.b, r.session.reasons.at(-1)], [1, 'undo'], 'revert applies the newest entry');
    r.history.begin('Move car');
    r.session.state.b = 8;
    r.history.undo();
    assert.deepEqual([r.session.state, r.history.inTransaction], [{ a: 2, b: 0 }, false], 'undo cancels, then steps back');
  });

  test('a recorder without a stack (NO_HISTORY) runs the use case and records nothing', () => {
    assert.equal(NO_HISTORY.run('x', () => 42), 42);
    assert.equal(NO_HISTORY.record('x'), false);
    assert.equal(NO_HISTORY.undo(), false);
  });
});

// ---- the chords, the guard and the header buttons (07 H2) ---------------------------------------------------------

describe('HistoryControls: the chords, the text-field guard and the header buttons (07 H2)', () => {
  test('historyShortcut: Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo; never with Alt or unmodified', () => {
    const rows = [
      [{ ctrlKey: true, key: 'z' }, 'undo'], [{ metaKey: true, key: 'z' }, 'undo'], [{ ctrlKey: true, shiftKey: true, key: 'Z' }, 'redo'],
      [{ metaKey: true, shiftKey: true, key: 'Z' }, 'redo'], [{ ctrlKey: true, key: 'y' }, 'redo'], [{ metaKey: true, key: 'y' }, 'redo'],
      [{ ctrlKey: true, shiftKey: true, key: 'Y' }, null], [{ ctrlKey: true, altKey: true, key: 'z' }, null], [{ key: 'z' }, null],
      [{ shiftKey: true, key: 'Z' }, null], [{ ctrlKey: true, key: 's' }, null], [{ ctrlKey: true, key: 'a' }, null],
      [{ ctrlKey: true, key: 'я', code: 'KeyZ' }, 'undo'], [{ ctrlKey: true, key: 'н', code: 'KeyY' }, 'redo'],
    ];
    for (const [e, want] of rows) assert.equal(historyShortcut(e), want, JSON.stringify(e));
  });

  test('isTextEditTarget: text-like inputs, textareas and contenteditable; not selects, buttons, toggles or dialogs', () => {
    const el = (tagName, extra = {}) => ({ tagName, ...extra });
    for (const type of ['text', 'number', 'search', 'email', 'url', 'tel', 'password', '', undefined]) {
      assert.equal(isTextEditTarget(el('INPUT', { type })), true, String(type));
    }
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'range', 'image', 'hidden']) {
      assert.equal(isTextEditTarget(el('INPUT', { type })), false, type);
    }
    assert.equal(isTextEditTarget(el('TEXTAREA')), true);
    assert.equal(isTextEditTarget(el('DIV', { isContentEditable: true })), true);
    assert.equal(isTextEditTarget(el('SELECT')), false);
    assert.equal(isTextEditTarget(el('BUTTON', { closest: () => ({ tagName: 'DIV', hidden: false }) })), false, 'inside a dialog');
    assert.equal(isTextEditTarget(el('CANVAS')), false);
    for (const t of [null, undefined, 'x', {}]) assert.equal(isTextEditTarget(t), false);
  });

  /** HistoryControls over a fake DOM with a stub history. */
  function controls({ busy = false } = {}) {
    const button = () => ({ disabled: true, title: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
    const els = { 'history-undo': button(), 'history-redo': button() };
    const doc = { getElementById: (id) => els[id] };
    const win = { listeners: [], addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture }); } };
    const calls = [];
    const history = { inTransaction: false, undo: () => { calls.push('undo'); return true; }, redo: () => { calls.push('redo'); return true; } };
    const bus = new EventBus();
    const hc = new HistoryControls({ doc, win, history, bus, isBusy: () => busy });
    assert.equal(win.listeners.length, 0, 'R4: no listener before bind');
    hc.bind();
    const key = (init, target = { tagName: 'BODY' }) => {
      const e = { ...init, target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
      win.listeners[0].fn(e);
      return e;
    };
    return { els, win, calls, history, bus, key };
  }

  test('the buttons follow HISTORY_CHANGED: disabled while empty, "Undo <label>" / "Redo <label>"', () => {
    const c = controls();
    c.bus.emit(Events.HISTORY_CHANGED, { canUndo: true, canRedo: false, undoLabel: 'Mesh mode: Individual Panels', redoLabel: null, depth: 1 });
    assert.deepEqual([c.els['history-undo'].disabled, c.els['history-undo'].title], [false, 'Undo Mesh mode: Individual Panels']);
    assert.deepEqual([c.els['history-redo'].disabled, c.els['history-redo'].title], [true, 'Nothing to redo']);
    assert.deepEqual(historyTitles(null), { undo: 'Nothing to undo', redo: 'Nothing to redo' });
    c.els['history-undo'].listeners.click();
    c.els['history-redo'].listeners.click();
    assert.deepEqual(c.calls, ['undo', 'redo']);
  });

  test('the chords: one capture-phase window listener; consumed outside text fields, left to the browser inside them', () => {
    const c = controls();
    assert.deepEqual([c.win.listeners.length, c.win.listeners[0].type, c.win.listeners[0].capture], [1, 'keydown', true]);
    let e = c.key({ ctrlKey: true, key: 'z' });
    assert.deepEqual([e.prevented, e.stopped], [true, true]);
    c.key({ metaKey: true, shiftKey: true, key: 'Z' }, { tagName: 'CANVAS' });
    c.key({ ctrlKey: true, key: 'y' }, { tagName: 'SELECT' });
    c.key({ ctrlKey: true, key: 'z', repeat: true }, { tagName: 'BUTTON' });
    assert.deepEqual(c.calls, ['undo', 'redo', 'redo', 'undo'], 'the UV canvas, a select and a button included; auto-repeat repeats');
    e = c.key({ ctrlKey: true, key: 'z' }, { tagName: 'INPUT', type: 'number' });
    assert.deepEqual([e.prevented, e.stopped, c.calls.length], [false, false, 4], 'native text undo in a number field');
    e = c.key({ ctrlKey: true, key: 'z' }, { tagName: 'TEXTAREA' });
    assert.equal(e.prevented, false);
    e = c.key({ ctrlKey: true, key: 's' });
    assert.equal(e.prevented, false, 'not a history chord');
    c.history.inTransaction = true;
    e = c.key({ ctrlKey: true, key: 'z' });
    assert.deepEqual([e.prevented, c.calls.length], [true, 4], 'during a drag: consumed, nothing undone');
  });

  test('a drag (isBusy) blocks the buttons and the chords', () => {
    const c = controls({ busy: true });
    const e = c.key({ ctrlKey: true, key: 'z' });
    c.els['history-undo'].listeners.click();
    assert.deepEqual([e.prevented, c.calls], [true, []]);
  });
});

// ---- the real use cases over a real session -----------------------------------------------------------------------

/** A new project with the real WallController, PivotController and UvController over a real ProjectSession and History. */
function world() {
  let now = 0;
  const project = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
  const bus = new EventBus();
  const replaced = [];
  bus.on(Events.PROJECT_REPLACED, (p) => replaced.push(p.reason));
  const pivotEvents = [];
  bus.on(Events.WALL_PIVOT_CHANGED, (p) => pivotEvents.push(p.source));
  const history = new History({ bus, clock: () => now });
  const view = { rebuild() {}, updateSectionUvs: () => true, resolveHit: () => null, panelCornersWorld: () => null };
  const wc = new WallController({
    project, view, ledTiles: { clearCache() {} }, orbit: { updateCameraPosition() {} }, hub: { refresh() {} }, bus,
    palette: Palette, dialogs: { alert() {} }, history,
  });
  const marker = { exists: true, hasResolution: true, visible: true, setPreview() {}, clearPreview() {}, pickMeshes: () => [] };
  const pivot = new PivotController({
    project, wallController: wc, markerView: marker, stageAnchored: [], history, bus,
    selection: { isSelected: () => false, select() {}, deselect() {} }, gizmo: { mode: 'translate', setMode() {}, setSnapIncrements() {} },
    interaction: { isDraggingGizmo: false, gestureCancelled: false, pilotMode: false, snap: { pivotM: 0 } },
  });
  const viewModel = new UvViewModel({
    project, bus, panelIds: { sectionCanvas: () => null, atlasCanvas: () => null }, ledTiles: { tileCanvas: () => null },
  });
  const uv = new UvController({ project, wallController: wc, view, viewModel, history, bus, raf: () => {}, maxTextureSize: () => 16384 });
  wc.addRebuildObserver(uv);
  wc.rebuild({ cause: 'init' });
  const { session } = historySession({ project, wallController: wc, bus, history, features: { pivot, uv } });
  session.markClean({ pristineNew: true });
  return { project, bus, history, session, wc, pivot, uv, viewModel, replaced, pivotEvents, main: () => project.wall.sections[0], tick: (ms) => { now += ms; } };
}

/** The state the four-step scenario touches. */
const scenarioState = (w) => ({
  cols: w.main().panelCols, meshMode: w.project.meshMode, offsetX: w.project.wall.pivot.offset.x,
  edits: w.main().uvVertexEdits ? w.main().uvVertexEdits.keys() : [],
});

describe('History over the real use cases (07 5.6.1)', () => {
  test('a section edit, the mesh mode, a pivot drag and a UV vertex drag: four undos step back, four redos replay', () => {
    const w = world();
    const states = [scenarioState(w)];
    const labels = [];
    const step = (fn) => { fn(); w.tick(1000); states.push(scenarioState(w)); labels.push(w.history.undoLabel); };
    step(() => {
      const value = w.wc.setSectionField(w.main(), 'panelCols', String(w.main().panelCols + 1));
      assert.equal(value, w.main().panelCols);
      w.wc.commitSectionEdit();
    });
    step(() => w.wc.setMeshMode('panel'));
    step(() => {
      w.history.begin('Move pivot');   // TransformGizmo.onMouseDown
      w.pivot.beginGizmoDrag();
      w.pivot.applyGizmoTranslate({ x: 0.5, y: 0, z: 0 }, { snap: null });
      w.pivot.endGizmoDrag({ cancel: false });
      w.history.commit();              // TransformGizmo.onMouseUp
    });
    step(() => {
      const id = w.main().id;
      w.uv.openViewer(id);
      w.uv.setEditMode('vertices');
      w.uv.selectVertices([1]);
      assert.ok(w.uv.beginVertexDrag(id, 1, [0.2, 0]));
      w.uv.updateVertexDrag([0.25, 0.05], { alt: true });
      w.uv.endVertexDrag();
    });
    const name = w.main().name;
    assert.deepEqual(labels, [`Edit Columns (${name})`, 'Mesh mode: Individual Panels', 'Move pivot', `UV vertex drag (${name})`]);
    assert.notDeepEqual(states[3], states[4]);
    for (let k = 3; k >= 0; k--) {
      assert.ok(w.history.undo());
      assert.deepEqual(scenarioState(w), states[k], `after undoing step ${k + 1}`);
    }
    assert.equal(w.history.canUndo, false);
    assert.equal(w.session.dirty, false, 'back at the bootstrap state: clean');
    for (let k = 1; k <= 4; k++) {
      assert.ok(w.history.redo());
      assert.deepEqual(scenarioState(w), states[k], `after redoing step ${k}`);
    }
    assert.deepEqual(w.replaced, Array(8).fill(0).map((_, k) => (k < 4 ? 'undo' : 'redo')), 'one apply per step');
    assert.equal(w.viewModel.sectionId, w.main().id, 'the viewer stays on its section');
  });

  test('the pivot orientation, keep-stage-layout and the UV settings are restored; the marker toggle is not recorded', () => {
    const w = world();
    w.pivot.setYawOffset(15);
    w.tick(1000);
    w.pivot.setKeepStageLayout(false);
    w.uv.setCombinedLayout('atlas');
    w.pivot.setMarkerVisible(false);
    assert.deepEqual([w.history.depth, w.history.undoLabel], [3, 'UV layout: atlas']);
    w.history.undo();
    assert.equal(w.project.uv.combinedLayout, 'per-section');
    w.history.undo();
    assert.equal(w.project.wall.pivot.keepStageLayout, true);
    w.history.undo();
    assert.equal(w.project.wall.pivot.orientation.yawOffsetDeg, 0);
    assert.equal(w.project.display.showPivotMarker, false, 'view-only: the live value stays');
    assert.ok(w.pivotEvents.filter((s) => s === 'import').length >= 3, 'the pivot panel and marker hear of every restore');
  });

  test('rename (coalesced), New and Open are undoable: the previous project comes back', async () => {
    const w = world();
    w.session.setName('Main');
    w.session.setName('Main Stage');
    assert.deepEqual([w.history.depth, w.history.undoLabel], [1, 'Rename project']);
    w.wc.addSection();
    const before = w.session.capture();
    w.session.newProject();
    assert.deepEqual([w.history.undoLabel, w.project.wall.count, w.session.name], ['New project', 1, 'Untitled stage']);
    w.history.undo();
    assert.equal(w.session.capture(), before, 'undo of New: the previous project');
    assert.equal(w.session.name, 'Main Stage');
    const other = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
    other.meta.setName('Opened');
    other.meshMode = 'combined';
    const text = JSON.stringify(new ProjectSerializer({ palette: Palette }).write(other));
    assert.equal(await w.session.openFile({ name: 'opened.json', size: text.length, text }), true);
    assert.deepEqual([w.history.undoLabel, w.session.name, w.project.meshMode, w.session.dirty], ['Open "opened.json"', 'Opened', 'combined', false]);
    w.history.undo();
    assert.equal(w.session.capture(), before, 'undo of Open: the previous project');
    assert.equal(w.session.dirty, true, 'not the opened file');
    w.history.redo();
    assert.equal(w.session.dirty, false, 'redo back to the opened file: clean again');
    assert.deepEqual(w.replaced, ['new', 'undo', 'open', 'undo', 'redo']);
  });

  test('undoing back to the saved state makes the project clean (the session\'s snapshot comparison)', () => {
    const w = world();
    w.wc.setWireframe(true);
    w.session.markClean();
    w.wc.setLedSim(true);
    assert.equal(w.session.dirty, true);
    w.history.undo();
    assert.equal(w.session.dirty, false);
    w.history.undo();
    assert.equal(w.session.dirty, true, 'before the save');
  });
});
