// Autosave (spec 07 H3; app/Autosave, app/Prefs, ui/RestoreBanner, the Project section's switch): the slot format and
// its checksum, the newest valid slot, the alternation, the debounce and the lifecycle writes, the pristine-new skip,
// the quota fallback, storage that is missing or blocked, `?autosave=off`, the switch (the device preference), and the
// restore banner's Restore and Discard over a real ProjectSession and History, with a Map-backed fake localStorage.
// Run: node --test tests/unit/autosave.test.mjs   (zero dependencies)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { EventBus, Events } from '../../js/core/EventBus.js';
import { Project } from '../../js/domain/Project.js';
import { History } from '../../js/app/History.js';
import { WallController } from '../../js/app/WallController.js';
import { Prefs, PREFS_KEY } from '../../js/app/Prefs.js';
import {
  Autosave, AUTOSAVE_SLOT_KEYS, AUTOSAVE_DEBOUNCE_MS, AutosaveNotes, encodeSlot, readSlotHeader, verifySlot, newestValidSlot,
  isQuotaError,
} from '../../js/app/Autosave.js';
import { RestoreBanner, relativeTime, restoreBannerText } from '../../js/ui/RestoreBanner.js';
import { ProjectPanel } from '../../js/ui/ProjectPanel.js';
import { Brand, Palette } from '../../js/theme/Theme.js';
import { historySession } from './fixtures/session-history.mjs';

const [SLOT0, SLOT1] = AUTOSAVE_SLOT_KEYS;

/** A localStorage over a Map; `failSet(key, value)` may return an error to throw from setItem. */
class MemoryStorage {
  constructor() {
    this.map = new Map();
    this.failSet = () => null;
    this.writes = [];
  }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    const err = this.failSet(key, String(value));
    if (err) throw err;
    this.writes.push(key);
    this.map.set(key, String(value));
  }
  removeItem(key) { this.map.delete(key); }
}

const quotaError = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError', code: 22 });

/** A window with the storage (or a throwing localStorage getter), fake timers and recorded listeners. */
function fakeWin({ storage = new MemoryStorage(), blocked = false } = {}) {
  const timers = new Map();
  let next = 1;
  const listeners = [];
  const win = {
    setTimeout: (fn, ms) => { timers.set(next, { fn, ms }); return next++; },
    clearTimeout: (id) => { timers.delete(id); },
    addEventListener: (type, fn) => listeners.push({ type, fn }),
  };
  Object.defineProperty(win, 'localStorage', {
    get() {
      if (blocked) throw Object.assign(new Error('The operation is insecure.'), { name: 'SecurityError' });
      return storage;
    },
  });
  const runTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const t of pending) t.fn();
    return pending.length;
  };
  return { win, storage, timers, listeners, runTimers };
}

/**
 * A new project with a real WallController, ProjectSession and History, and an Autosave on `env` (a fakeWin), wired as
 * App wires it (History's onCommitted schedules). `start()` is not called.
 */
function world(env, { now = 1_000_000, suppressed = false } = {}) {
  let t = 0;
  const project = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
  const bus = new EventBus();
  const statuses = [];
  bus.on(Events.AUTOSAVE_STATUS, (s) => statuses.push(s));
  const history = new History({ bus, clock: () => t });
  const view = { rebuild() {}, updateSectionUvs: () => true, resolveHit: () => null, panelCornersWorld: () => null };
  const wc = new WallController({
    project, view, ledTiles: { clearCache() {} }, orbit: { updateCameraPosition() {} }, hub: { refresh() {} }, bus,
    palette: Palette, dialogs: { alert() {} }, history,
  });
  wc.rebuild({ cause: 'init' });
  const { session, alerts } = historySession({ project, wallController: wc, bus, history });
  session.markClean({ pristineNew: true });
  const clock = { now };
  const autosave = new Autosave({
    session, prefs: new Prefs({ win: env.win }), bus, win: env.win, clock: () => clock.now, appVersion: '9.9.9', suppressed,
  });
  history.setOnCommitted(() => autosave.schedule());
  const edit = (cols) => {
    t += 1000;
    wc.setSectionField(project.wall.sections[0], 'panelCols', String(cols));
    wc.commitSectionEdit();
  };
  return { project, bus, history, wc, session, alerts, autosave, statuses, clock, edit, cols: () => project.wall.sections[0].panelCols };
}

/** The stored records of the two slots (readSlotHeader, or null). */
const slots = (storage) => AUTOSAVE_SLOT_KEYS.map((key) => readSlotHeader(storage.getItem(key)));

describe('the slot format (07 H3)', () => {
  test('a header line with the length and SHA-256 of the project text, then the text; it verifies', () => {
    const text = JSON.stringify({ version: '2.1', sections: [{ name: 'Wall "1"\n' }] });
    const raw = encodeSlot({ seq: 3, savedAt: 1234, appVersion: '2.0.0', name: 'Main', dirty: true }, text);
    const [line] = raw.split('\n', 1);
    const header = JSON.parse(line);
    assert.equal(header.format, 'morph-led-autosave');
    assert.equal(header.v, 1);
    assert.equal(header.seq, 3);
    assert.equal(header.saved_at, 1234);
    assert.equal(header.app_version, '2.0.0');
    assert.equal(header.length, text.length);
    assert.match(header.sha256, /^[0-9a-f]{64}$/);
    const record = readSlotHeader(raw);
    assert.equal(record.text, text);
    assert.equal(record.name, 'Main');
    assert.equal(record.dirty, true);
    assert.ok(verifySlot(record));
  });

  test('a truncated, edited or headless value does not verify or does not read; nothing else is a record', () => {
    const text = '{"version":"2.1","sections":[{"name":"A"}]}';
    const raw = encodeSlot({ seq: 1, savedAt: 1, appVersion: '', name: '', dirty: false }, text);
    assert.equal(verifySlot(readSlotHeader(raw.slice(0, -5))), false, 'truncated');
    assert.equal(verifySlot(readSlotHeader(raw.replace('"A"', '"B"'))), false, 'same length, other bytes');
    for (const bad of [null, 42, '', text, `{"format":"other","v":1,"seq":1,"length":1,"sha256":"x"}\n1`,
      `{"format":"morph-led-autosave","v":1,"seq":0,"length":1,"sha256":"x"}\n1`, `not json\n${text}`]) {
      assert.equal(readSlotHeader(bad), null, String(bad).slice(0, 40));
    }
  });

  test('the newest valid slot wins: the highest seq that verifies; a corrupt newer slot loses to an older valid one', () => {
    const a = encodeSlot({ seq: 4, savedAt: 40, appVersion: '', name: 'four', dirty: true }, '{"n":4}');
    const b = encodeSlot({ seq: 5, savedAt: 50, appVersion: '', name: 'five', dirty: true }, '{"n":5}');
    assert.deepEqual(newestValidSlot([a, b]), { slot: 1, seq: 5, savedAt: 50, name: 'five', dirty: true, text: '{"n":5}' });
    assert.equal(newestValidSlot([b, a]).slot, 0);
    assert.equal(newestValidSlot([a, b.replace('{"n":5}', '{"n":6}')]).name, 'four', 'the corrupt newer slot loses');
    assert.equal(newestValidSlot([a, b.slice(0, b.length - 2)]).name, 'four', 'a half-written newer slot loses');
    assert.equal(newestValidSlot([null, 'garbage']), null);
    assert.ok(isQuotaError(quotaError()));
    assert.ok(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }));
    assert.equal(isQuotaError(new TypeError('x')), false);
  });
});

describe('app/Prefs (07 C19)', () => {
  test('defaults, a stored value, a value of another type, and a storage that throws', () => {
    const env = fakeWin();
    const prefs = new Prefs({ win: env.win });
    assert.equal(prefs.get('autosave'), true);
    assert.equal(prefs.set('autosave', false), true);
    assert.deepEqual(JSON.parse(env.storage.getItem(PREFS_KEY)), { v: 1, autosave: false });
    assert.equal(prefs.get('autosave'), false);
    env.storage.setItem(PREFS_KEY, '{"autosave":"no"}');
    assert.equal(prefs.get('autosave'), true, 'another type reads as the default');
    env.storage.setItem(PREFS_KEY, '[1]');
    assert.equal(prefs.get('autosave'), true);
    const blocked = new Prefs({ win: fakeWin({ blocked: true }).win });
    assert.equal(blocked.get('autosave'), true);
    assert.equal(blocked.set('autosave', false), false);
  });
});

describe('app/Autosave: writing (07 H3, 6.11)', () => {
  test('R4: the constructor touches no storage; start() probes once, emits the status once, offers nothing on empty storage', () => {
    const env = fakeWin();
    const w = world(env);
    assert.equal(env.storage.writes.length, 0);
    assert.equal(w.statuses.length, 0);
    assert.equal(w.autosave.start(), null);
    assert.deepEqual(env.storage.writes, ['morph-led-configurator:autosave:probe']);
    assert.equal(env.storage.map.size, 0, 'the probe is removed');
    assert.equal(w.statuses.length, 1);
    assert.equal(w.statuses[0].state, 'idle');
    assert.equal(w.statuses[0].enabled, true);
  });

  test('debounce: the last committed change writes once, AUTOSAVE_DEBOUNCE_MS after it; then the slots alternate with seq', () => {
    const env = fakeWin();
    const w = world(env);
    w.autosave.start();
    w.edit(11);
    w.edit(6);
    w.edit(7);
    assert.equal(env.timers.size, 1, 'one pending timer');
    assert.equal([...env.timers.values()][0].ms, AUTOSAVE_DEBOUNCE_MS);
    assert.equal(AUTOSAVE_DEBOUNCE_MS, 2000);
    assert.equal(slots(env.storage)[0], null, 'nothing before the timer');
    assert.equal(w.autosave.status.state, 'pending');
    assert.equal(env.runTimers(), 1);
    const [first, none] = slots(env.storage);
    assert.equal(none, null);
    assert.equal(first.seq, 1);
    assert.equal(first.savedAt, 1_000_000);
    assert.equal(first.name, 'Untitled stage');
    assert.equal(first.dirty, true);
    assert.equal(first.text, w.session.capture('autosave'));
    assert.ok(verifySlot(first));
    assert.equal(w.autosave.status.state, 'saved');
    assert.equal(w.autosave.status.savedAt, 1_000_000);
    w.edit(8);
    env.runTimers();
    w.edit(9);
    env.runTimers();
    const [a, b] = slots(env.storage);
    assert.deepEqual([a.seq, b.seq], [3, 2], 'slot 1 then slot 0 again');
    assert.equal(JSON.parse(a.text).sections[0].panel.columns, 9);
    assert.equal(JSON.parse(b.text).sections[0].panel.columns, 8, 'the previous write is kept');
  });

  test('pagehide and visibilitychange to hidden write a pending change at once; nothing pending writes nothing', () => {
    const env = fakeWin();
    const w = world(env);
    const docListeners = [];
    const doc = { visibilityState: 'visible', addEventListener: (type, fn) => docListeners.push({ type, fn }) };
    w.autosave.attachLifecycle(doc);
    assert.deepEqual(env.listeners.map((l) => l.type), ['pagehide']);
    assert.deepEqual(docListeners.map((l) => l.type), ['visibilitychange']);
    w.autosave.start();
    w.edit(11);
    env.listeners[0].fn();
    assert.equal(env.timers.size, 0, 'the debounce is cancelled');
    assert.equal(slots(env.storage)[0].seq, 1);
    env.listeners[0].fn();
    assert.equal(slots(env.storage)[1], null, 'nothing pending: no write');
    w.edit(6);
    docListeners[0].fn();
    assert.equal(slots(env.storage)[1], null, 'still visible: no write');
    doc.visibilityState = 'hidden';
    docListeners[0].fn();
    assert.equal(slots(env.storage)[1].seq, 2);
  });

  test('a pristine new project is never written: the slots keep the work from before an accidental New', () => {
    const env = fakeWin();
    const w = world(env);
    w.autosave.start();
    w.autosave.schedule();
    env.runTimers();
    assert.equal(env.storage.getItem(SLOT0), null, 'the untouched bootstrap project');
    w.edit(11);
    env.runTimers();
    const before = env.storage.getItem(SLOT0);
    assert.ok(before);
    w.session.newProject();
    assert.equal(w.session.isPristineNew, true);
    assert.equal(env.runTimers(), 1, "New's history entry scheduled a write");
    assert.equal(env.storage.getItem(SLOT0), before);
    assert.equal(env.storage.getItem(SLOT1), null, 'nothing written');
    assert.equal(w.autosave.status.state, 'idle');
    w.edit(6);
    env.runTimers();
    assert.equal(slots(env.storage)[1].seq, 2, 'an edit after New writes again');
  });

  test('quota: the write is retried without the inline logos (with a note), then reported as full; a later change retries', () => {
    const env = fakeWin();
    const session = {
      name: 'Logos', dirty: true, isPristineNew: false,
      capture: (variant, { maxInlineAssetBytes } = {}) => (maxInlineAssetBytes === 0 ? '{"assets":"missing"}' : '{"assets":"data:image/png;base64,AAAA"}'),
    };
    const bus = new EventBus();
    const autosave = new Autosave({ session, prefs: new Prefs({ win: env.win }), bus, win: env.win, clock: () => 7 });
    autosave.start();
    env.storage.failSet = (key, value) => (value.includes('data:image') ? quotaError() : null);
    autosave.schedule();
    assert.equal(autosave.flush(), true);
    assert.equal(slots(env.storage)[0].text, '{"assets":"missing"}');
    assert.deepEqual([autosave.status.state, autosave.status.message], ['saved', AutosaveNotes.noLogos]);
    env.storage.failSet = (key) => (key === SLOT1 ? quotaError() : null);
    autosave.schedule();
    assert.equal(autosave.flush(), false);
    assert.deepEqual([autosave.status.state, autosave.status.message], ['error', AutosaveNotes.full]);
    assert.equal(slots(env.storage)[0].seq, 1, 'the last good slot is untouched');
    env.storage.failSet = () => null;
    autosave.schedule();
    assert.equal(autosave.flush(), true);
    assert.deepEqual([autosave.status.state, autosave.status.message], ['saved', null]);
    assert.equal(slots(env.storage)[1].seq, 2, 'the failed slot is the next one written');
    env.storage.failSet = () => new TypeError('boom');
    autosave.schedule();
    assert.equal(autosave.flush(), false);
    assert.deepEqual([autosave.status.state, autosave.status.message], ['error', AutosaveNotes.failed('boom')]);
  });

  test('storage unavailable (a throwing getter, or a probe write that throws): quietly off with a note, nothing written', () => {
    for (const env of [fakeWin({ blocked: true }), (() => {
      const e = fakeWin();
      e.storage.failSet = () => Object.assign(new Error('denied'), { name: 'SecurityError' });
      return e;
    })()]) {
      const w = world(env);
      assert.equal(w.autosave.start(), null);
      assert.equal(w.autosave.status.state, 'unavailable');
      assert.equal(w.autosave.status.message, AutosaveNotes.unavailable);
      assert.equal(w.autosave.status.available, false);
      w.edit(11);
      assert.equal(env.timers.size, 0);
      assert.equal(w.autosave.flush(), false);
      assert.equal(w.autosave.setEnabled(false), true, 'the switch is inert');
      assert.equal(env.storage.map.size, 0);
    }
  });

  test('the switch: off persists the preference and cancels the pending write; on writes the change made meanwhile', () => {
    const env = fakeWin();
    const w = world(env);
    w.autosave.start();
    w.edit(11);
    assert.equal(w.autosave.setEnabled(false), false);
    assert.deepEqual(JSON.parse(env.storage.getItem(PREFS_KEY)), { v: 1, autosave: false });
    assert.equal(env.timers.size, 0, 'the pending write is cancelled');
    assert.equal(w.autosave.status.state, 'disabled');
    w.edit(6);
    assert.equal(env.timers.size, 0);
    assert.equal(w.autosave.flush(), false);
    assert.equal(env.storage.getItem(SLOT0), null);
    const again = world(env);
    again.autosave.start();
    assert.equal(again.autosave.enabled, false, 'a new page reads the preference');
    assert.equal(again.statuses.at(-1).state, 'disabled');
    assert.equal(w.autosave.setEnabled(true), true);
    assert.equal(env.timers.size, 1);
    env.runTimers();
    assert.equal(JSON.parse(slots(env.storage)[0].text).sections[0].panel.columns, 6);
  });

  test('?autosave=off (suppressed): no offer, no read of the slots, no write, the preference unchanged, the switch off', () => {
    const env = fakeWin();
    const a = world(env);
    a.autosave.start();
    a.edit(11);
    env.runTimers();
    const stored = env.storage.getItem(SLOT0);
    const b = world(env, { suppressed: true });
    assert.equal(b.autosave.start(), null);
    assert.deepEqual([b.autosave.status.state, b.autosave.status.suppressed, b.autosave.status.enabled], ['disabled', true, false]);
    b.edit(9);
    assert.equal(env.timers.size, 0);
    assert.equal(b.autosave.setEnabled(true), false);
    assert.equal(env.storage.getItem(PREFS_KEY), null);
    assert.equal(env.storage.getItem(SLOT0), stored);
    assert.equal(env.storage.getItem(SLOT1), null);
  });
});

describe('app/Autosave: the restore offer (07 H3, 3.4)', () => {
  /** World A edits (columns 7, a name) and writes; returns the storage and A's history capture. */
  function previousSession() {
    const env = fakeWin();
    const a = world(env);
    a.autosave.start();
    a.edit(7);
    a.session.setName('Autosaved stage');
    env.runTimers();
    return { env, a, saved: a.session.capture('history') };
  }

  test('Restore: the offer pauses writing; the project comes back as one undoable "Restore session" step, still dirty', async () => {
    const { env, a, saved } = previousSession();
    const b = world(env, { now: 1_000_000 + 5 * 60 * 1000 });
    const fresh = b.session.capture('history');
    const offer = b.autosave.start();
    assert.deepEqual(offer, { savedAt: 1_000_000, name: 'Autosaved stage' });
    assert.equal(b.autosave.paused, true);
    assert.deepEqual([b.statuses.at(-1).state, b.statuses.at(-1).message], ['paused', AutosaveNotes.paused]);
    b.edit(3);
    assert.equal(env.timers.size, 0, 'no write while the offer is pending');
    assert.equal(b.autosave.flush(), false);
    assert.equal(slots(env.storage)[1], null);
    assert.equal(await b.autosave.restore(), true);
    assert.equal(b.session.capture('history'), saved, 'the autosaved project');
    assert.equal(b.cols(), 7);
    assert.equal(b.session.name, 'Autosaved stage');
    assert.equal(b.history.undoLabel, 'Restore session');
    assert.equal(b.session.dirty, true, 'not in a file');
    assert.deepEqual(b.alerts, []);
    assert.equal(b.autosave.paused, false);
    assert.equal(await b.autosave.restore(), false, 'once per offer');
    assert.equal(env.timers.size, 1, 'the change made meanwhile and the restore are written');
    env.runTimers();
    const [s0, s1] = slots(env.storage);
    assert.deepEqual([s0.seq, s1.seq], [1, 2]);
    assert.equal(s1.text, a.session.capture('autosave'));
    b.history.undo();
    assert.equal(b.cols(), 3, 'Ctrl+Z goes back to the edit made before Restore');
    b.history.undo();
    assert.equal(b.session.capture('history'), fresh, 'and then to the fresh project');
    assert.equal(b.session.isPristineNew, true);
    env.runTimers();
    assert.equal(slots(env.storage)[0].seq, 1, 'the fresh project is not written');
  });

  test('with the preference off the offer still comes (no paused note); after Restore nothing is written', async () => {
    const { env, saved } = previousSession();
    new Prefs({ win: env.win }).set('autosave', false);
    const b = world(env);
    assert.ok(b.autosave.start());
    assert.deepEqual([b.autosave.status.state, b.autosave.status.message, b.autosave.paused], ['disabled', null, true]);
    assert.equal(await b.autosave.restore(), true);
    assert.equal(b.session.capture('history'), saved);
    assert.equal(b.autosave.status.state, 'disabled');
    assert.equal(env.timers.size, 0);
  });

  test('Restore of work that was saved to a file gives a clean project', async () => {
    const env = fakeWin();
    const a = world(env);
    a.autosave.start();
    a.edit(4);
    a.session.markClean();   // as Save does
    a.autosave.schedule();
    env.runTimers();
    assert.equal(slots(env.storage)[0].dirty, false);
    const b = world(env);
    b.autosave.start();
    assert.equal(await b.autosave.restore(), true);
    assert.equal(b.cols(), 4);
    assert.equal(b.session.dirty, false);
  });

  test('Discard: both slots go and the next page offers nothing; a change made while the banner showed is written after', () => {
    const { env } = previousSession();
    const b = world(env);
    assert.ok(b.autosave.start());
    b.autosave.discard();
    assert.equal(env.storage.getItem(SLOT0), null);
    assert.equal(env.storage.getItem(SLOT1), null);
    assert.equal(b.autosave.paused, false);
    assert.equal(b.autosave.status.state, 'idle');
    assert.equal(env.timers.size, 0);
    const c = world(env);
    assert.equal(c.autosave.start(), null);
    assert.equal(c.autosave.paused, false);
    const again = previousSession();
    const d = world(again.env);
    assert.ok(d.autosave.start());
    d.edit(2);
    assert.equal(again.env.timers.size, 0);
    d.autosave.discard();
    assert.equal(d.autosave.status.state, 'pending');
    again.env.runTimers();
    const [s0, s1] = slots(again.env.storage);
    assert.deepEqual([s0.seq, s1], [1, null], 'a fresh pair of slots');
    assert.equal(JSON.parse(s0.text).sections[0].panel.columns, 2);
  });

  test('no offer for a slot that holds the fresh project; a corrupt newest slot offers the older valid one', () => {
    const env = fakeWin();
    const probe = world(env);
    env.storage.map.set(SLOT0, encodeSlot({ seq: 1, savedAt: 5, appVersion: '9.9.9', name: 'Untitled stage', dirty: true },
      probe.session.capture('autosave')));
    assert.equal(world(env).autosave.start(), null);
    const { env: env2, a } = previousSession();
    const good = env2.storage.getItem(SLOT0);
    const newer = encodeSlot({ seq: 2, savedAt: 9, appVersion: '9.9.9', name: 'Newer', dirty: true }, a.session.capture('autosave'));
    env2.storage.map.set(SLOT1, newer.replace('"columns":7', '"columns":8'));
    const b = world(env2);
    assert.equal(b.autosave.start().name, 'Autosaved stage', 'the checksum rejects the edited slot');
    assert.equal(env2.storage.getItem(SLOT0), good);
  });

  test('an offer that does not validate is refused like an Open (one alert); the slots are kept and writing resumes', async () => {
    const env = fakeWin();
    env.storage.map.set(SLOT0, encodeSlot({ seq: 1, savedAt: 5, appVersion: '9.9.9', name: 'Odd', dirty: true },
      JSON.stringify({ version: '9.0', sections: [{}] })));
    const b = world(env);
    assert.equal(b.autosave.start().name, 'Odd');
    assert.equal(await b.autosave.restore(), false);
    assert.equal(b.alerts.length, 1);
    assert.equal(b.autosave.paused, false);
    assert.ok(env.storage.getItem(SLOT0));
  });
});

// ---- ui: the banner and the switch -----------------------------------------------------------------------------

/** A fake element: listeners by type, click(), dataset, attributes, classList. */
function el(id) {
  const classes = new Set();
  return {
    id, hidden: true, textContent: '', title: '', tabIndex: 0, dataset: {}, attrs: {}, listeners: {},
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    fire(type, extra = {}) {
      const e = { type, target: this, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
      for (const fn of this.listeners[type] ?? []) fn(e);
      return e;
    },
    click() { this.fire('click'); },
  };
}

const docOf = (ids) => {
  const els = Object.fromEntries(ids.map((id) => [id, el(id)]));
  return { els, doc: { getElementById: (id) => els[id] ?? null, addEventListener() {} } };
};

describe('ui/RestoreBanner (07 3.4)', () => {
  test('relative time and the question', () => {
    const now = 10 * 86400000;
    const cases = [[now, 'a moment ago'], [now - 59000, 'a moment ago'], [now + 5000, 'a moment ago'], [now - 60000, '1 minute ago'],
      [now - 5 * 60000, '5 minutes ago'], [now - 3600000, '1 hour ago'], [now - 23 * 3600000, '23 hours ago'],
      [now - 30 * 3600000, 'yesterday'], [now - 3 * 86400000, '3 days ago'], [NaN, 'a moment ago']];
    for (const [then, want] of cases) assert.equal(relativeTime(then, now), want, String(then));
    assert.equal(restoreBannerText({ savedAt: now - 120000, name: 'Main stage' }, now), 'Restore unsaved work from 2 minutes ago — Main stage?');
    assert.equal(restoreBannerText({ savedAt: now, name: '  ' }, now), 'Restore unsaved work from a moment ago — Untitled stage?');
  });

  test('show, then Restore or Discard: the banner hides first and calls Autosave once', async () => {
    const { els, doc } = docOf(['autosave-banner', 'autosave-banner-text', 'autosave-restore', 'autosave-discard']);
    const calls = [];
    const autosave = { restore: async () => { calls.push('restore'); return true; }, discard: () => calls.push('discard') };
    const banner = new RestoreBanner({ doc, autosave, clock: () => 3_600_000 });
    assert.equal(Object.values(els).reduce((n, e) => n + Object.keys(e.listeners).length, 0), 0, 'R4');
    banner.bind();
    banner.show({ savedAt: 0, name: '<b>Stage</b>' });
    assert.equal(banner.visible, true);
    assert.equal(els['autosave-banner-text'].textContent, 'Restore unsaved work from 1 hour ago — <b>Stage</b>?');
    els['autosave-restore'].click();
    assert.equal(els['autosave-banner'].hidden, true);
    banner.show({ savedAt: 0, name: 'x' });
    els['autosave-discard'].click();
    assert.equal(banner.visible, false);
    assert.deepEqual(calls, ['restore', 'discard']);
  });
});

describe('ui/ProjectPanel: the Autosave switch and note (07 3.3)', () => {
  function panelRig() {
    const ids = ['project-name', 'project-dirty', 'project-new', 'project-open', 'project-save', 'project-open-input',
      'toggle-autosave', 'autosave-note'];
    const { els, doc } = docOf(ids);
    const win = { addEventListener() {}, setTimeout: () => 1, clearTimeout() {} };
    const bus = new EventBus();
    const autosave = {
      enabled: true, calls: [],
      setEnabled(on) { this.calls.push(on); this.enabled = on; return on; },
    };
    const session = { dirty: false, name: 'Untitled stage' };
    const panel = new ProjectPanel({ doc, win, session, projectIO: {}, bus, dialogs: {}, brand: Brand, autosave });
    const status = (s) => bus.emit(Events.AUTOSAVE_STATUS, {
      state: 'idle', message: null, savedAt: null, enabled: true, available: true, suppressed: false, ...s,
    });
    return { els, bus, autosave, panel, status };
  }

  test('click, Space and Enter flip the preference; other keys do nothing', () => {
    const r = panelRig();
    r.panel.bind();
    const toggle = r.els['toggle-autosave'];
    toggle.click();
    assert.equal(toggle.fire('keydown', { key: ' ' }).prevented, true);
    toggle.fire('keydown', { key: 'Enter' });
    assert.equal(toggle.fire('keydown', { key: 'a' }).prevented, false);
    assert.deepEqual(r.autosave.calls, [false, true, false]);
  });

  test('AUTOSAVE_STATUS draws the switch and the note', () => {
    const r = panelRig();
    const toggle = r.els['toggle-autosave'];
    const note = r.els['autosave-note'];
    r.status({ state: 'saved', savedAt: 5 });
    assert.equal(toggle.classList.contains('active'), true);
    assert.deepEqual([toggle.attrs['aria-checked'], toggle.attrs['aria-disabled'], toggle.tabIndex], ['true', 'false', 0]);
    assert.deepEqual([note.hidden, note.textContent, note.dataset.state], [true, '', 'saved']);
    r.status({ state: 'disabled', enabled: false });
    assert.equal(toggle.classList.contains('active'), false);
    assert.equal(toggle.attrs['aria-checked'], 'false');
    r.status({ state: 'saved', message: AutosaveNotes.noLogos });
    assert.deepEqual([note.hidden, note.textContent], [false, AutosaveNotes.noLogos]);
    r.status({ state: 'unavailable', available: false, message: AutosaveNotes.unavailable });
    assert.deepEqual([toggle.classList.contains('active'), toggle.attrs['aria-disabled'], toggle.tabIndex], [false, 'true', -1]);
    r.status({ state: 'disabled', enabled: false, suppressed: true });
    assert.equal(toggle.attrs['aria-disabled'], 'true');
    assert.match(toggle.title, /autosave=off/);
    assert.deepEqual([note.hidden, note.dataset.state], [true, 'disabled']);
  });
});
