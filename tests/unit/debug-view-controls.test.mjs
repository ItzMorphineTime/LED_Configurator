// Unit tests for js/ui/DebugViewControls.js (docs/improvements/01-normals.md 3.1-3.5, 5.2, 8.1; 01 T7, AC 13 and 17).
// ui/ modules take an injected `doc` / `win`, so a small fake DOM of plain event targets is enough: elements with a
// parent chain, capture and bubble listeners, focus, `hidden`, classes and attributes, and a manual timer queue. The
// real DebugViewController, DebugViewSettings and EventBus are used, with spy views, so every command goes through the
// DEBUG_VIEW_CHANGED mirror exactly as in the app.
// Run: node --test tests/unit/debug-view-controls.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { DebugViewControls, announcement, popoverPlacement } from '../../js/ui/DebugViewControls.js';
import { DebugViewController } from '../../js/app/DebugViewController.js';
import { DebugViewSettings } from '../../js/domain/DebugViewSettings.js';
import { EventBus } from '../../js/core/EventBus.js';

// ---- a minimal fake DOM ---------------------------------------------------------------------------

class FakeClassList {
  #set = new Set();
  constructor(names = []) { for (const n of names) this.#set.add(n); }
  add(n) { this.#set.add(n); }
  remove(n) { this.#set.delete(n); }
  contains(n) { return this.#set.has(n); }
  toggle(n, force) {
    const on = force === undefined ? !this.#set.has(n) : !!force;
    if (on) this.#set.add(n); else this.#set.delete(n);
    return on;
  }
}

class FakeElement {
  constructor(doc, tagName, { id = '', type = '', attrs = {}, dataset = {}, classes = [] } = {}) {
    this.doc = doc;
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.type = type;
    this.value = '';
    this.checked = false;
    this.hidden = false;
    this.textContent = '';
    this.offsetHeight = 0;
    this.rect = { top: 0, bottom: 0, height: 0 };
    this.parentElement = null;
    this.children = [];
    this.dataset = { ...dataset };
    this.classList = new FakeClassList(classes);
    this.attrs = { ...attrs };
    this.style = { props: {}, setProperty(k, v) { this.props[k] = v; } };
    this.listeners = [];
  }
  append(...kids) { for (const k of kids) { k.parentElement = this; this.children.push(k); } return this; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(type, fn, capture = false) { this.listeners.push({ type, fn, capture: capture === true || capture?.capture === true }); }
  removeEventListener(type, fn, capture = false) {
    const c = capture === true || capture?.capture === true;
    const i = this.listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === c);
    if (i >= 0) this.listeners.splice(i, 1);
  }
  contains(other) { for (let n = other; n; n = n.parentElement) if (n === this) return true; return false; }
  closest(selector) {
    for (let n = this; n; n = n.parentElement) {
      if (selector.includes('[role="dialog"]') && n.attrs.role === 'dialog') return n;
      if (selector.includes('dialog') && n.tagName === 'DIALOG') return n;
    }
    return null;
  }
  focus() { this.doc.activeElement = this; }
  blur() { if (this.doc.activeElement === this) this.doc.activeElement = this.doc.body; }
  getBoundingClientRect() { return { ...this.rect }; }
  /** Descendants matching one attribute selector such as '[data-legend]' (all the module needs). */
  querySelectorAll(selector) {
    const key = /^\[data-([a-z]+)\]$/.exec(selector)[1];
    const out = [];
    const walk = (n) => { for (const k of n.children) { if (key in k.dataset) out.push(k); walk(k); } };
    walk(this);
    return out;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement(this, 'body');
    this.activeElement = this.body;
    this.byIdMap = new Map();
    this.listeners = [];
  }
  getElementById(id) { return this.byIdMap.get(id) ?? null; }
  addEventListener(type, fn, capture = false) { this.listeners.push({ type, fn, capture: capture === true }); }
  removeEventListener(type, fn, capture = false) {
    const i = this.listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === (capture === true));
    if (i >= 0) this.listeners.splice(i, 1);
  }
  count(type, capture) { return this.listeners.filter((l) => l.type === type && l.capture === capture).length; }
}

/** A manual timer queue (setTimeout / clearTimeout) and window listeners. */
class FakeWindow {
  now = 0;
  timers = [];
  listeners = [];
  #id = 0;
  setTimeout(fn, ms) { const id = ++this.#id; this.timers.push({ id, at: this.now + ms, fn }); return id; }
  clearTimeout(id) { this.timers = this.timers.filter((t) => t.id !== id); }
  advance(ms) {
    this.now += ms;
    for (;;) {
      const due = this.timers.filter((t) => t.at <= this.now).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      due.fn();
    }
  }
  addEventListener(type, fn) { this.listeners.push({ type, fn }); }
  removeEventListener(type, fn) { this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn)); }
}

/**
 * Dispatches an event the DOM way: document capture listeners, then the target and its ancestors (bubble), then the
 * document bubble listeners, stopping when a listener calls stopPropagation.
 */
function fire(doc, target, type, init = {}) {
  let stopped = false;
  const e = { type, target, detail: 0, key: '', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false,
    ...init, stopPropagation() { stopped = true; }, get propagationStopped() { return stopped; } };
  for (const l of doc.listeners.filter((x) => x.type === type && x.capture)) { if (stopped) break; l.fn(e); }
  for (let n = target; n && !stopped; n = n.parentElement) {
    if (n === doc.body) break;
    for (const l of n.listeners.filter((x) => x.type === type && !x.capture)) l.fn(e);
  }
  if (!stopped) for (const l of doc.listeners.filter((x) => x.type === type && !x.capture)) l.fn(e);
  return e;
}

/** The markup of 3.1/3.2 as fake elements, the real controller, settings and bus, and the controls (bound). */
function setup() {
  const doc = new FakeDocument();
  const win = new FakeWindow();
  const el = (tag, opts) => { const e = new FakeElement(doc, tag, opts); if (opts?.id) doc.byIdMap.set(opts.id, e); return e; };
  const overlay = el('div', { classes: ['viewport-overlay'] });
  overlay.rect = { top: 60, bottom: 1000, height: 940 };
  doc.body.append(overlay);
  const column = el('div', { classes: ['viewport-controls'] });
  const toggleNormals = el('button', { id: 'toggle-normals', attrs: { 'aria-pressed': 'false' } });
  const menu = el('button', { id: 'debug-view-btn', attrs: { 'aria-expanded': 'false' } });
  menu.rect = { top: 60 + 325, bottom: 60 + 365, height: 40 };
  column.append(toggleNormals, menu);
  const popover = el('div', { id: 'debug-view-popover', attrs: { role: 'dialog', 'aria-modal': 'false' } });
  popover.hidden = true;
  popover.offsetHeight = 326;
  const radio = (id, value) => { const r = el('input', { id, type: 'radio' }); r.value = value; return r; };
  const radios = [radio('debug-shading-content', 'content'), radio('debug-shading-face', 'faceOrientation'),
    radio('debug-shading-normals', 'normalColors')];
  radios[0].checked = true;
  const vertex = el('input', { id: 'debug-normals-vertex', type: 'checkbox' });
  vertex.checked = true;
  const face = el('input', { id: 'debug-normals-face', type: 'checkbox' });
  const scale = el('input', { id: 'debug-normals-scale', type: 'range' });
  scale.value = '1';
  const scaleValue = el('span', { id: 'debug-normals-scale-value' });
  scaleValue.textContent = '×1.00';
  const onTop = el('input', { id: 'debug-normals-ontop', type: 'checkbox' });
  const close = el('button', { id: 'debug-view-close' });
  const stats = el('p', { id: 'debug-normals-stats' });
  popover.append(close, ...radios, vertex, face, scale, scaleValue, onTop, stats);
  const legend = el('div', { id: 'debug-view-legend' });
  legend.hidden = true;
  const row = (key, swatches) => {
    const r = el('div', { dataset: { legend: key } });
    r.hidden = true;
    for (const s of swatches) r.append(el('span', { dataset: { swatch: s } }));
    return r;
  };
  legend.append(row('faceOrientation', ['faceFront', 'faceBack']), row('normalColors', []), row('normals', ['vertexNormal', 'faceNormal']));
  const status = el('div', { id: 'debug-view-status', attrs: { role: 'status' } });
  const textInput = el('input', { type: 'text' });
  overlay.append(column, popover, legend, status, textInput);

  const settings = new DebugViewSettings();
  const renders = [];
  const bus = new EventBus();
  const controller = new DebugViewController({
    settings, bus,
    wallView: { setDebugShading: (m) => renders.push(['shading', m]) },
    normalsView: { sync: () => renders.push(['sync']) },
  });
  const theme = { scene: { debug: { faceFront: 0x2f6bff, faceBack: 0xff3344, vertexNormal: 0xb8f03c, faceNormal: 0xff4fd8, lineBaseFactor: 0.35 } } };
  const controls = new DebugViewControls({ doc, win, controller, bus, theme });
  // A stand-in for the legacy bubble-phase shortcut handler (ViewportInput.attachShortcuts), registered before ours.
  const legacyKeys = [];
  doc.addEventListener('keydown', (e) => legacyKeys.push(e.key));
  controls.bind();
  controls.bindShortcuts();
  return { doc, win, settings, renders, controls, toggleNormals, menu, popover, radios, vertex, face, scale, scaleValue,
    onTop, close, stats, legend, status, textInput, legacyKeys };
}

/** A user change of a checkbox: the browser flips `checked`, then fires change at it. */
function toggleCheckbox(t, box) {
  box.checked = !box.checked;
  fire(t.doc, box, 'change');
}

// ---- tests --------------------------------------------------------------------------------------------

describe('DebugViewControls: N / Shift+N (3.4)', () => {
  test('N toggles the lines, Shift+N cycles the shading', () => {
    const t = setup();
    fire(t.doc, t.doc.body, 'keydown', { key: 'n' });
    assert.equal(t.settings.normals.enabled, true);
    fire(t.doc, t.doc.body, 'keydown', { key: 'N', shiftKey: true });
    assert.equal(t.settings.shading, 'faceOrientation');
    assert.equal(t.settings.normals.enabled, true, 'Shift+N does not toggle the lines');
  });

  test('a held N (repeat: true) does not toggle', () => {
    const t = setup();
    fire(t.doc, t.doc.body, 'keydown', { key: 'n' });
    fire(t.doc, t.doc.body, 'keydown', { key: 'n', repeat: true });
    fire(t.doc, t.doc.body, 'keydown', { key: 'n', repeat: true });
    assert.equal(t.settings.normals.enabled, true);
  });

  test('Ctrl+N, Alt+N and Meta+N do nothing', () => {
    const t = setup();
    for (const mod of ['ctrlKey', 'altKey', 'metaKey']) fire(t.doc, t.doc.body, 'keydown', { key: 'n', [mod]: true });
    assert.equal(t.settings.normals.enabled, false);
    assert.deepEqual(t.renders, []);
  });

  test('n in a text input is ignored; a toolbar button or BODY is not a typing target', () => {
    const t = setup();
    fire(t.doc, t.textInput, 'keydown', { key: 'n' });
    assert.equal(t.settings.normals.enabled, false);
    fire(t.doc, t.menu, 'keydown', { key: 'n' });
    assert.equal(t.settings.normals.enabled, true);
  });

  test('N is ignored while keyboard focus is inside the open popover ([role=dialog])', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 0 });
    assert.equal(t.doc.activeElement, t.radios[0]);
    fire(t.doc, t.radios[0], 'keydown', { key: 'n' });
    assert.equal(t.settings.normals.enabled, false);
  });
});

describe('DebugViewControls: popover open, close and focus (3.2)', () => {
  test('a keyboard open (click detail 0) focuses the checked shading radio; aria-expanded follows', () => {
    const t = setup();
    t.radios[0].checked = false;
    t.radios[2].checked = true;
    fire(t.doc, t.menu, 'click', { detail: 0 });
    assert.equal(t.controls.isPopoverOpen(), true);
    assert.equal(t.popover.hidden, false);
    assert.equal(t.menu.getAttribute('aria-expanded'), 'true');
    assert.equal(t.doc.activeElement, t.radios[2]);
    fire(t.doc, t.menu, 'click', { detail: 0 });
    assert.equal(t.controls.isPopoverOpen(), false);
    assert.equal(t.menu.getAttribute('aria-expanded'), 'false');
  });

  test('a pointer open (detail 1) leaves focus where the browser put it (the button)', () => {
    const t = setup();
    t.menu.focus();
    fire(t.doc, t.menu, 'click', { detail: 1 });
    assert.equal(t.controls.isPopoverOpen(), true);
    assert.equal(t.doc.activeElement, t.menu);
  });

  test('placement: downward at the button top in the 940 px overlay, top written in px with data-placement', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 1 });
    assert.equal(t.popover.style.top, '325px');
    assert.equal(t.popover.dataset.placement, 'down');
  });

  test('closePopover returns focus to the button only when focus was inside the popover', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 0 });
    t.controls.closePopover();
    assert.equal(t.doc.activeElement, t.menu, 'focus was on a radio');
    t.doc.activeElement = t.doc.body;
    fire(t.doc, t.menu, 'click', { detail: 1 });
    t.textInput.focus();
    t.controls.closePopover();
    assert.equal(t.doc.activeElement, t.textInput, 'focus was outside: not moved');
  });

  test('#debug-view-close closes the popover and focus returns to the button', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 0 });
    t.close.focus();
    fire(t.doc, t.close, 'click', { detail: 1 });
    assert.equal(t.controls.isPopoverOpen(), false);
    assert.equal(t.doc.activeElement, t.menu);
  });

  test('an outside pointerdown closes the popover without consuming the event or moving focus', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 0 });
    let canvasSaw = false;
    t.doc.addEventListener('pointerdown', () => { canvasSaw = true; });
    fire(t.doc, t.popover.children[3], 'pointerdown');   // inside: stays open
    assert.equal(t.controls.isPopoverOpen(), true);
    fire(t.doc, t.menu, 'pointerdown');                   // the button: its click toggles instead
    assert.equal(t.controls.isPopoverOpen(), true);
    const before = t.doc.activeElement;
    const e = fire(t.doc, t.doc.body.children[0], 'pointerdown');   // the overlay (outside both)
    assert.equal(t.controls.isPopoverOpen(), false);
    assert.equal(e.propagationStopped, false);
    assert.equal(canvasSaw, true);
    assert.equal(t.doc.activeElement, before);
    assert.equal(t.doc.count('pointerdown', true), 0, 'the outside listener is removed on close');
  });

  test('the resize listener exists only while the popover is open', () => {
    const t = setup();
    assert.equal(t.win.listeners.length, 0);
    fire(t.doc, t.menu, 'click', { detail: 1 });
    assert.deepEqual(t.win.listeners.map((l) => l.type), ['resize']);
    t.controls.closePopover();
    assert.equal(t.win.listeners.length, 0);
  });
});

describe('DebugViewControls: Escape (3.2, until 07 I1)', () => {
  test('the capture-phase Escape listener exists only while the popover is open', () => {
    const t = setup();
    assert.equal(t.doc.count('keydown', true), 0);
    fire(t.doc, t.menu, 'click', { detail: 1 });
    assert.equal(t.doc.count('keydown', true), 1);
    t.controls.closePopover();
    assert.equal(t.doc.count('keydown', true), 0);
  });

  test('it acts only on Escape: other keys pass untouched and reach the legacy handler', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 1 });
    t.doc.activeElement = t.doc.body;
    for (const key of ['g', 'w', 'n']) {
      const e = fire(t.doc, t.doc.body, 'keydown', { key });
      assert.equal(e.propagationStopped, false, key);
    }
    assert.deepEqual(t.legacyKeys, ['g', 'w', 'n']);
    assert.equal(t.controls.isPopoverOpen(), true);
    assert.equal(t.settings.normals.enabled, true, 'N toggled with focus on BODY');
  });

  test('the first Escape closes the popover and stops propagation; the second reaches the legacy handler', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 1 });
    t.doc.activeElement = t.doc.body;
    const first = fire(t.doc, t.doc.body, 'keydown', { key: 'Escape' });
    assert.equal(first.propagationStopped, true);
    assert.equal(t.controls.isPopoverOpen(), false);
    assert.deepEqual(t.legacyKeys, [], 'the legacy handler never saw the first Escape');
    assert.equal(t.doc.activeElement, t.doc.body, 'focus was not inside: not moved');
    const second = fire(t.doc, t.doc.body, 'keydown', { key: 'Escape' });
    assert.equal(second.propagationStopped, false);
    assert.deepEqual(t.legacyKeys, ['Escape']);
  });

  test('Escape with focus inside the popover returns focus to the button', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 0 });
    fire(t.doc, t.doc.activeElement, 'keydown', { key: 'Escape' });
    assert.equal(t.controls.isPopoverOpen(), false);
    assert.equal(t.doc.activeElement, t.menu);
  });
});

describe('DebugViewControls: the pointer-change blur rule (3.2, AC 13)', () => {
  test('a pointer change blurs the control, so focus goes back to BODY', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 1 });
    fire(t.doc, t.vertex, 'pointerdown');
    t.vertex.focus();                                   // the browser focuses the checkbox on mousedown
    fire(t.doc, t.vertex, 'pointerup');
    toggleCheckbox(t, t.vertex);                        // click -> change, in the same task as pointerup
    assert.equal(t.settings.normals.vertex, false, 'the model was written');
    assert.equal(t.doc.activeElement, t.doc.body);
    t.win.advance(0);
  });

  test('the post-pointerup timer clears the flag: a click on a non-control part, then a keyboard change keeps focus', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 0 });          // focus on the checked radio
    fire(t.doc, t.stats, 'pointerdown');                  // the stats text: no change follows
    fire(t.doc, t.stats, 'pointerup');
    t.win.advance(0);                                     // the setTimeout(0) clears the stale flag
    t.radios[1].focus();
    t.radios[1].checked = true;
    fire(t.doc, t.radios[1], 'change');                   // a keyboard change (arrow key in the radio group)
    assert.equal(t.settings.shading, 'faceOrientation');
    assert.equal(t.doc.activeElement, t.radios[1], 'focus kept on the radio');
  });

  test('a keydown inside the popover clears the flag too', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 0 });
    fire(t.doc, t.stats, 'pointerdown');                  // no pointerup yet (or the timer has not run)
    fire(t.doc, t.radios[0], 'keydown', { key: 'ArrowDown' });
    t.radios[1].focus();
    t.radios[1].checked = true;
    fire(t.doc, t.radios[1], 'change');
    assert.equal(t.doc.activeElement, t.radios[1]);
  });

  test('a keyboard change without any pointerdown keeps focus', () => {
    const t = setup();
    fire(t.doc, t.menu, 'click', { detail: 0 });
    t.face.focus();
    toggleCheckbox(t, t.face);
    assert.equal(t.settings.normals.face, true);
    assert.equal(t.doc.activeElement, t.face);
  });
});

describe('DebugViewControls: the DEBUG_VIEW_CHANGED mirror (3.2, 3.5)', () => {
  test('buttons: #toggle-normals .active and aria-pressed; #debug-view-btn .active while shading is not content', () => {
    const t = setup();
    fire(t.doc, t.toggleNormals, 'click', { detail: 1 });
    assert.equal(t.toggleNormals.classList.contains('active'), true);
    assert.equal(t.toggleNormals.getAttribute('aria-pressed'), 'true');
    assert.equal(t.menu.classList.contains('active'), false);
    t.radios[2].checked = true;
    fire(t.doc, t.radios[2], 'change');
    assert.equal(t.menu.classList.contains('active'), true);
    assert.deepEqual(t.radios.map((r) => r.checked), [false, false, true]);
    fire(t.doc, t.toggleNormals, 'click', { detail: 1 });
    assert.equal(t.toggleNormals.getAttribute('aria-pressed'), 'false');
  });

  test('inputs follow the settings, including a Shift+N cycle; the length text is "×" + 2 decimals', () => {
    const t = setup();
    t.scale.value = '2.6';
    fire(t.doc, t.scale, 'input');
    assert.equal(t.scale.value, '2.5', 'the stored (parsed) value is written back');
    assert.equal(t.scaleValue.textContent, '×2.50');
    fire(t.doc, t.doc.body, 'keydown', { key: 'N', shiftKey: true });
    assert.deepEqual(t.radios.map((r) => r.checked), [false, true, false]);
    t.onTop.checked = true;
    fire(t.doc, t.onTop, 'change');
    assert.equal(t.settings.normals.onTop, true);
  });

  test('legend: shown while shading is not content or the lines are on, one row per active mode', () => {
    const t = setup();
    const rows = () => t.legend.children.map((r) => [r.dataset.legend, !r.hidden]);
    fire(t.doc, t.toggleNormals, 'click', { detail: 1 });
    assert.equal(t.legend.hidden, false);
    assert.deepEqual(rows(), [['faceOrientation', false], ['normalColors', false], ['normals', true]]);
    fire(t.doc, t.doc.body, 'keydown', { key: 'N', shiftKey: true });
    assert.deepEqual(rows(), [['faceOrientation', true], ['normalColors', false], ['normals', true]]);
    fire(t.doc, t.doc.body, 'keydown', { key: 'n' });
    fire(t.doc, t.doc.body, 'keydown', { key: 'N', shiftKey: true });
    assert.deepEqual(rows(), [['faceOrientation', false], ['normalColors', true], ['normals', false]]);
    fire(t.doc, t.doc.body, 'keydown', { key: 'N', shiftKey: true });
    assert.equal(t.legend.hidden, true);
  });

  test('legend swatches get --swatch from theme.scene.debug (no colour in the stylesheet)', () => {
    const t = setup();
    const swatches = t.legend.querySelectorAll('[data-swatch]').map((s) => [s.dataset.swatch, s.style.props['--swatch']]);
    assert.deepEqual(swatches, [['faceFront', '#2f6bff'], ['faceBack', '#ff3344'], ['vertexNormal', '#b8f03c'], ['faceNormal', '#ff4fd8']]);
  });

  test('the announcer is debounced 400 ms: a range drag announces once, with the last value', () => {
    const t = setup();
    for (const v of ['1.25', '1.5', '1.75', '2']) {
      t.scale.value = v;
      fire(t.doc, t.scale, 'input');
      t.win.advance(100);
    }
    fire(t.doc, t.scale, 'change');                       // release: same value, nothing new to say
    assert.equal(t.status.textContent, '');
    t.win.advance(399);
    assert.equal(t.status.textContent, 'Length ×2.00');
    assert.equal(t.win.timers.length, 0);
  });

  test('announcer messages and the stats element: the controls never write #debug-normals-stats', () => {
    const t = setup();
    fire(t.doc, t.doc.body, 'keydown', { key: 'n' });
    t.win.advance(400);
    assert.equal(t.status.textContent, 'Normal lines on');
    fire(t.doc, t.doc.body, 'keydown', { key: 'N', shiftKey: true });
    t.win.advance(400);
    assert.equal(t.status.textContent, 'Shading: Face orientation');
    assert.equal(t.stats.textContent, '', 'stats belong to NormalsDebugView');
  });
});

describe('announcement and popoverPlacement (pure)', () => {
  const s = (shading, normals = {}) => ({ shading, normals: { enabled: false, vertex: true, face: false, lengthScale: 1, onTop: false, ...normals } });

  test('announcement names the first setting that changed, or null', () => {
    assert.equal(announcement(s('content'), s('content', { enabled: true })), 'Normal lines on');
    assert.equal(announcement(s('content'), s('content', { vertex: false })), 'Vertex normals off');
    assert.equal(announcement(s('content'), s('content', { face: true })), 'Face normals on');
    assert.equal(announcement(s('content'), s('content', { lengthScale: 0.25 })), 'Length ×0.25');
    assert.equal(announcement(s('content'), s('content', { onTop: true })), 'Draw on top on');
    assert.equal(announcement(s('content'), s('normalColors')), 'Shading: Normal colours (world)');
    assert.equal(announcement(s('faceOrientation'), s('content')), 'Shading: As displayed');
    assert.equal(announcement(s('content'), s('content')), null);
  });

  test('placement follows the 3.1 fit table: down, up, clamped', () => {
    // Harness 1600x1000: overlay 940 px, button at 325-365, popover 326 px (as built): opens downward.
    assert.deepEqual(popoverPlacement({ top: 60, height: 940 }, { top: 385, bottom: 425 }, 326), { top: 325, placement: 'down' });
    // 1366x650: overlay 590 px: upward, bottom edge at the button's bottom edge (365 - 326 = 39).
    assert.deepEqual(popoverPlacement({ top: 60, height: 590 }, { top: 385, bottom: 425 }, 326), { top: 39, placement: 'up' });
    // <= 900 px layout at 800x760: overlay 350 px, the popover limited to 310 px by its max-height: clamped to 20 px.
    assert.deepEqual(popoverPlacement({ top: 60, height: 350 }, { top: 385, bottom: 425 }, 310), { top: 20, placement: 'up' });
    // Between: overlay 380 px, the whole popover fits, but not up to the button's bottom edge: top = 380 - 20 - 326.
    assert.deepEqual(popoverPlacement({ top: 0, height: 380 }, { top: 325, bottom: 365 }, 326), { top: 34, placement: 'up' });
    // Smallest downward fit: 325 + 326 + 20 = 671 px.
    assert.equal(popoverPlacement({ top: 0, height: 671 }, { top: 325, bottom: 365 }, 326).placement, 'down');
    assert.equal(popoverPlacement({ top: 0, height: 670 }, { top: 325, bottom: 365 }, 326).placement, 'up');
  });
});
