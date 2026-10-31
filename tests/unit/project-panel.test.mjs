// The Project section (spec 07 3.3, D8; ui/ProjectPanel): the Save file name (projectFileName), the name rule
// (ProjectMeta.setName = the validator's), the dirty transitions of a rename and a Save through the real session, the
// confirm flows of Open and New (dirty vs clean, OK vs Cancel), the two chords (Ctrl/Cmd+S, Ctrl/Cmd+O: consumed, run
// once, a pending text edit committed first) and the throttled re-check of the indicator and the title.
// Run: node --test tests/unit/project-panel.test.mjs   (zero dependencies)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { EventBus, Events } from '../../js/core/EventBus.js';
import { Project, ProjectMeta } from '../../js/domain/Project.js';
import { ProjectSerializer } from '../../js/io/ProjectSerializer.js';
import { stateFromProject } from '../../js/io/ProjectSchema.js';
import { ProjectSession, projectFileName } from '../../js/app/ProjectSession.js';
import { ProjectIO } from '../../js/app/ProjectIO.js';
import { ProjectPanel, projectShortcut, projectDocTitle, DISCARD_MESSAGE, REFRESH_MS } from '../../js/ui/ProjectPanel.js';
import { createDialogs } from '../../js/ui/dom.js';
import { Brand, Palette } from '../../js/theme/Theme.js';

const serializer = new ProjectSerializer({ palette: Palette });
const PRODUCT = Brand.productName;

describe('projectFileName (the Save download name)', () => {
  test('a safe slug of the name; the default name, an unusable name and a reserved name give the brand file name', () => {
    const cases = [
      ['Main Stage', 'main-stage.json'],
      ['  Studio  B / XR #2 ', 'studio-b-xr-2.json'],
      ['Bühne – Süd', 'buhne-sud.json'],
      ['ＡＢＣ　１２３', 'abc-123.json'],       // full-width forms fold (NFKD)
      ['--x--', 'x.json'],
      [ProjectMeta.DEFAULT_NAME, Brand.files.json],
      ['舞台', Brand.files.json],
      ['!!!', Brand.files.json],
      ['CON', Brand.files.json],
      ['lpt1', Brand.files.json],
      ['console', 'console.json'],
    ];
    for (const [name, want] of cases) assert.equal(projectFileName(name, Brand), want, name);
    assert.equal(Brand.files.json, 'morph-led-wall.json');
    const long = projectFileName('ab '.repeat(30), Brand);
    assert.ok(long.length <= 64 + '.json'.length && !long.includes('-.json'), long);
  });
});

describe('ProjectMeta.setName and the session (07 C28, 5.5.2)', () => {
  test('setName stores what the validator reads back: controls stripped, cut to 64, trimmed, empty gives the default', () => {
    for (const raw of ['  Main Stage  ', 'A‮B\u0007C', 'x'.repeat(80), '   ', '', ' 🎬'.repeat(40)]) {
      const meta = new ProjectMeta();
      const stored = meta.setName(raw);
      const project = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
      const doc = JSON.parse(JSON.stringify(serializer.write(project)));
      doc.project = { name: raw };
      const read = serializer.read(doc);
      assert.ok(read.ok);
      assert.equal(stored, stateFromProject(read.project).meta?.name ?? ProjectMeta.DEFAULT_NAME, JSON.stringify(raw));
      assert.ok(stored.length >= 1 && stored.length <= ProjectMeta.NAME_MAX_LENGTH);
    }
  });

  test('a rename makes the project dirty; Save downloads the Export JSON document named after the project and is clean', () => {
    const project = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
    const downloads = [];
    const downloader = { saveText: (text, name) => downloads.push({ name, text }) };
    const session = new ProjectSession({ project, serializer, downloader, brand: Brand });
    const io = new ProjectIO({ project, serializer, downloader, dialogs: { alert: () => {} }, brand: Brand, win: {}, session });
    session.markClean({ pristineNew: true });
    assert.equal(session.dirty, false);
    assert.equal(session.setName('  Main Stage '), 'Main Stage');
    assert.equal(session.name, 'Main Stage');
    assert.equal(session.dirty, true);
    io.saveProject();
    assert.equal(session.dirty, false);
    io.exportJSON();
    assert.deepEqual(downloads.map((d) => d.name), ['main-stage.json', Brand.files.json]);
    assert.equal(downloads[0].text, downloads[1].text, 'Save writes the same bytes as Export JSON');
    assert.equal(JSON.parse(downloads[0].text).project.name, 'Main Stage');
    session.setName('');
    assert.deepEqual([session.name, session.dirty], [ProjectMeta.DEFAULT_NAME, true]);
  });

  test('a failed Save reports M-EXP-1 with the label "Save Project" and stays dirty', () => {
    const project = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
    const alerts = [];
    const downloader = { saveText: () => { throw new Error('blocked'); } };
    const session = new ProjectSession({ project, serializer, downloader, brand: Brand });
    const io = new ProjectIO({ project, serializer, downloader, dialogs: { alert: (m) => alerts.push(m) }, brand: Brand,
      win: { console: { warn: () => {} } }, session });
    session.markClean();
    session.setName('X');
    io.saveProject();
    assert.deepEqual(alerts, ['Save Project failed: blocked. No file was downloaded.']);
    assert.equal(session.dirty, true);
  });

  test('createDialogs.confirm looks win.confirm up at call time and answers a boolean', () => {
    const win = { confirm: () => { throw new Error('cached'); } };
    const dialogs = createDialogs(win);
    const asked = [];
    win.confirm = (m) => { asked.push(m); return asked.length === 1; };
    assert.equal(dialogs.confirm(DISCARD_MESSAGE), true);
    assert.equal(dialogs.confirm(DISCARD_MESSAGE), false);
    assert.deepEqual(asked, ['Discard unsaved changes?', 'Discard unsaved changes?']);
  });
});

describe('projectShortcut and projectDocTitle', () => {
  test('Ctrl or Cmd with S or O, no Alt and no Shift; a non-Latin layout by the physical key', () => {
    const k = (key, mods = {}, code = `Key${key.toUpperCase()}`) => projectShortcut({ key, code, ...mods });
    assert.equal(k('s', { ctrlKey: true }), 'save');
    assert.equal(k('S', { metaKey: true }), 'save', 'Caps Lock');
    assert.equal(k('o', { ctrlKey: true }), 'open');
    assert.equal(k('o', { metaKey: true }), 'open');
    assert.equal(k('ы', { ctrlKey: true }, 'KeyS'), 'save', 'a Cyrillic layout');
    assert.equal(k('s', {}), null);
    assert.equal(k('o', {}), null);
    assert.equal(k('s', { ctrlKey: true, shiftKey: true }), null);
    assert.equal(k('s', { ctrlKey: true, altKey: true }), null, 'AltGr is Ctrl+Alt');
    assert.equal(k('z', { ctrlKey: true }), null);
    assert.equal(k('a', { ctrlKey: true }), null, 'the UV viewer\'s Ctrl+A');
    assert.equal(k('Control', { ctrlKey: true }, 'ControlLeft'), null);
  });

  test('the title names the project and ends with " •" while dirty', () => {
    assert.equal(projectDocTitle(PRODUCT, 'Untitled stage', false), 'Morph LED Configurator — Untitled stage');
    assert.equal(projectDocTitle(PRODUCT, 'Main', true), 'Morph LED Configurator — Main •');
  });
});

// ---- the panel over a fake DOM ----------------------------------------------------------------------------------

/** A fake element: listeners by type, click(), blur() (fires the pending change), focus(). */
function el(id, props = {}) {
  return {
    id, value: '', hidden: false, files: null, tagName: 'DIV', calls: [], listeners: {}, ...props,
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    fire(type, extra = {}) {
      const e = { type, target: this, ...extra };
      for (const fn of this.listeners[type] ?? []) fn(e);
      return e;
    },
    click() { this.calls.push('click'); this.fire('click'); },
    blur() { this.calls.push('blur'); this.fire('change'); },
    focus() { this.calls.push('focus'); },
  };
}

/** A keydown event that records preventDefault and stopPropagation. */
function key(k, mods = {}) {
  return { key: k, code: `Key${k.toUpperCase()}`, repeat: false, ...mods, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
}

/** The panel over fakes: a session whose `dirty` the test sets, a ProjectIO and dialogs that record. */
function rig({ answers = [] } = {}) {
  const els = {};
  for (const id of ['project-name', 'project-dirty', 'project-new', 'project-open', 'project-save', 'project-open-input']) els[id] = el(id);
  els['project-name'].tagName = 'INPUT';
  els['project-name'].type = 'text';
  els['project-name'].value = 'Untitled stage';
  const log = [];
  const timers = new Map();
  let nextTimer = 1;
  const winListeners = [];
  const docListeners = [];
  const doc = {
    title: 'Morph LED Configurator', activeElement: null,
    getElementById: (id) => els[id] ?? null,
    addEventListener: (type, fn, capture) => docListeners.push({ type, fn, capture }),
  };
  const win = {
    addEventListener: (type, fn, capture) => winListeners.push({ type, fn, capture }),
    setTimeout: (fn, ms) => { timers.set(nextTimer, { fn, ms }); return nextTimer++; },
    clearTimeout: (id) => timers.delete(id),
  };
  const session = {
    dirty: false, name: 'Untitled stage',
    setName(raw) { log.push(`setName ${raw}`); this.name = raw.trim() || 'Untitled stage'; this.dirty = true; return this.name; },
    newProject() { log.push('newProject'); this.name = 'Untitled stage'; this.dirty = false; },
  };
  const projectIO = {
    saveProject() { log.push(`saveProject ${session.name}`); session.dirty = false; },
    importFromInputEvent(e) {
      log.push(`open ${e.target.files[0].name}`);
      e.target.value = '';
      session.name = 'Opened';
      session.dirty = false;
      return Promise.resolve(true);
    },
  };
  const dialogs = { asked: [], confirm(msg) { this.asked.push(msg); return answers.length ? answers.shift() : true; } };
  const bus = new EventBus();
  const panel = new ProjectPanel({ doc, win, session, projectIO, bus, dialogs, brand: Brand });
  const keydown = (e) => { for (const l of winListeners) if (l.type === 'keydown') l.fn(e); return e; };
  const runTimers = () => { const pending = [...timers.values()]; timers.clear(); for (const t of pending) t.fn(); return pending.length; };
  return { els, doc, win, session, projectIO, dialogs, bus, panel, log, timers, winListeners, docListeners, keydown, runTimers };
}

describe('ui/ProjectPanel', () => {
  test('the constructor only looks up and subscribes; bind adds the listeners (keydown on the window, capture phase)', () => {
    const r = rig();
    assert.equal(r.winListeners.length + r.docListeners.length, 0, 'R4: no DOM listener while constructing');
    assert.equal(Object.values(r.els).reduce((n, e) => n + Object.keys(e.listeners).length, 0), 0);
    r.panel.bind();
    assert.deepEqual(r.winListeners.map((l) => [l.type, l.capture]), [['keydown', true]]);
    assert.deepEqual(r.docListeners.map((l) => [l.type, l.capture]),
      [['input', true], ['change', true], ['click', true], ['pointerup', true], ['keyup', true]]);
  });

  test('refresh: the indicator is hidden while clean; the title names the project, with " •" while dirty', () => {
    const r = rig();
    r.panel.bind();
    assert.equal(r.panel.refresh(), false);
    assert.equal(r.els['project-dirty'].hidden, true);
    assert.equal(r.doc.title, 'Morph LED Configurator — Untitled stage');
    r.session.dirty = true;
    assert.equal(r.panel.refresh(), true);
    assert.equal(r.els['project-dirty'].hidden, false);
    assert.equal(r.doc.title, 'Morph LED Configurator — Untitled stage •');
  });

  test('a rename (change) stores the name through the session, shows it and is dirty at once', () => {
    const r = rig();
    r.panel.bind();
    r.panel.refresh();
    const name = r.els['project-name'];
    name.value = '  Main  ';
    name.fire('change');
    assert.deepEqual(r.log, ['setName   Main  ']);
    assert.equal(name.value, 'Main');
    assert.equal(r.els['project-dirty'].hidden, false);
    assert.equal(r.doc.title, 'Morph LED Configurator — Main •');
    name.value = 'typo';
    name.fire('keydown', { key: 'Escape' });
    assert.equal(name.value, 'Main', 'Escape puts the stored name back');
  });

  test('New: clean applies without asking; dirty asks, Cancel changes nothing, OK applies; the name field and title follow', () => {
    const r = rig({ answers: [false, true] });
    r.panel.bind();
    r.els['project-new'].click();
    assert.deepEqual([r.dialogs.asked.length, r.log], [0, ['newProject']]);
    r.session.dirty = true;
    r.session.name = 'Edited';
    r.els['project-name'].value = 'Edited';
    r.els['project-new'].click();
    assert.deepEqual([r.dialogs.asked, r.log], [[DISCARD_MESSAGE], ['newProject']], 'Cancel: nothing applied');
    assert.equal(r.session.dirty, true);
    r.els['project-new'].click();
    assert.deepEqual([r.dialogs.asked.length, r.log], [2, ['newProject', 'newProject']]);
    assert.equal(r.els['project-name'].value, 'Untitled stage');
    assert.deepEqual([r.els['project-dirty'].hidden, r.doc.title], [true, 'Morph LED Configurator — Untitled stage']);
  });

  test('Open: the button opens the picker; a chosen file while dirty asks first (Cancel resets the picker); clean opens at once', async () => {
    const r = rig({ answers: [false, true] });
    r.panel.bind();
    const input = r.els['project-open-input'];
    r.els['project-open'].click();
    assert.deepEqual(input.calls, ['click'], 'the picker');
    assert.equal(r.dialogs.asked.length, 0, 'nothing is asked before a file is chosen');
    input.files = [];
    assert.equal(input.fire('change') && r.log.length, 0, 'no file: nothing');
    r.session.dirty = true;
    input.files = [{ name: 'a.json' }];
    input.value = 'C:\\fakepath\\a.json';
    input.fire('change');
    assert.deepEqual([r.dialogs.asked, r.log, input.value], [[DISCARD_MESSAGE], [], ''], 'Cancel: not opened, picker reset');
    input.value = 'C:\\fakepath\\a.json';
    assert.equal(await r.panel.openChosen({ target: input }), true);
    assert.deepEqual([r.dialogs.asked.length, r.log], [2, ['open a.json']]);
    assert.deepEqual([r.els['project-dirty'].hidden, r.doc.title], [true, 'Morph LED Configurator — Opened']);
    r.bus.emit(Events.PROJECT_REPLACED, { reason: 'open', scope: 'full' });
    assert.equal(r.els['project-name'].value, 'Opened', 'PROJECT_REPLACED shows the opened name');
    assert.equal(await r.panel.openChosen({ target: input }), true, 'clean: no question');
    assert.equal(r.dialogs.asked.length, 2);
  });

  test('Save commits the focused text field first (its change), then saves; the indicator clears', () => {
    const r = rig();
    r.panel.bind();
    const name = r.els['project-name'];
    r.doc.activeElement = name;
    name.value = 'Typed';
    r.els['project-save'].click();
    assert.deepEqual(r.log, ['setName Typed', 'saveProject Typed'], 'the typed name is in the saved file');
    assert.deepEqual(name.calls, ['blur', 'focus'], 'the focus returns to the field');
    assert.deepEqual([r.els['project-dirty'].hidden, r.doc.title], [true, 'Morph LED Configurator — Typed']);
  });

  test('Ctrl/Cmd+S and Ctrl/Cmd+O: consumed and run once; an auto-repeat is consumed only; other keys pass untouched', () => {
    const r = rig();
    r.panel.bind();
    const s = r.keydown(key('s', { ctrlKey: true }));
    assert.deepEqual([s.prevented, s.stopped, r.log], [true, true, ['saveProject Untitled stage']]);
    const again = r.keydown(key('s', { ctrlKey: true, repeat: true }));
    assert.deepEqual([again.prevented, again.stopped, r.log.length], [true, true, 1], 'no second download');
    const o = r.keydown(key('o', { metaKey: true }));
    assert.deepEqual([o.prevented, o.stopped, r.els['project-open-input'].calls], [true, true, ['click']]);
    for (const e of [key('s'), key('o'), key('s', { ctrlKey: true, shiftKey: true }), key('z', { ctrlKey: true }),
      key('a', { ctrlKey: true }), key('y', { ctrlKey: true }), key('n', { shiftKey: true }), { key: 'Escape', code: 'Escape' }]) {
      const out = r.keydown({ ...e, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });
      assert.ok(!out.prevented && !out.stopped, `${e.key} passes`);
    }
    assert.equal(r.log.length, 1);
  });

  test('in a text field (a UV viewer field, the name field) the chord commits the typed value first, then runs', () => {
    const r = rig();
    r.panel.bind();
    const uvField = el('uv-offset-u', { tagName: 'INPUT', type: 'number', value: '0.25' });
    uvField.addEventListener('change', () => r.log.push(`commit ${uvField.value}`));
    r.doc.activeElement = uvField;
    r.keydown(key('s', { ctrlKey: true }));
    assert.deepEqual(r.log, ['commit 0.25', 'saveProject Untitled stage']);
    assert.deepEqual(uvField.calls, ['blur', 'focus']);
    const checkbox = el('uv-gltf-uv1', { tagName: 'INPUT', type: 'checkbox' });
    r.doc.activeElement = checkbox;
    r.keydown(key('o', { ctrlKey: true }));
    assert.deepEqual(checkbox.calls, [], 'a checkbox has nothing pending: no blur');
    assert.deepEqual(r.els['project-open-input'].calls, ['click']);
  });

  test('edit signals schedule one re-check at most every REFRESH_MS; refresh cancels a pending one', () => {
    const r = rig();
    r.panel.bind();
    r.panel.refresh();
    r.session.dirty = true;
    r.bus.emit(Events.WALL_REBUILT, {});
    r.bus.emit(Events.CAMERA_POSE_CHANGED, {});
    for (const l of r.docListeners) l.fn({});
    assert.equal(r.timers.size, 1);
    assert.equal([...r.timers.values()][0].ms, REFRESH_MS);
    assert.equal(r.els['project-dirty'].hidden, true, 'not yet');
    assert.equal(r.runTimers(), 1);
    assert.equal(r.els['project-dirty'].hidden, false);
    r.bus.emit(Events.UV_DATA_CHANGED, {});
    assert.equal(r.timers.size, 1);
    r.panel.refresh();
    assert.equal(r.timers.size, 0);
    r.bus.emit(Events.SELECTION_CHANGED, {});
    r.bus.emit(Events.UV_HOVER_CHANGED, {});
    assert.equal(r.timers.size, 0, 'selection and hover are no edits');
  });
});
