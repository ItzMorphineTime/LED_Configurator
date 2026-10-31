// Unit tests for js/ui/FloatingPanel.js (docs/improvements/04-uvs-uv-editor.md 3.1, 8.1; UV-10): the pure geometry
// (defaultRect with the auto-offset above the camera preview window, clampRect) and the panel on a small fake DOM with a
// fake ResizeObserver: the constructor attaches nothing, mount() is idempotent, reflow re-clamps on host changes, the
// auto-offset follows the preview window until the user moves the panel, and the narrow layout clears the geometry.
// Run: node --test tests/unit/floating-panel.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FloatingPanel, defaultRect, clampRect } from '../../js/ui/FloatingPanel.js';

const DEFAULTS = { top: 20, right: 72, width: 380, height: 440 };
const MIN = { width: 300, height: 320 };

describe('FloatingPanel geometry (04 3.1)', () => {
  test('defaultRect: top-right placement, and the height shrinks above an overlapping preview window to 8 px above it', () => {
    assert.deepEqual(defaultRect(1200, 800, DEFAULTS, MIN, null), { left: 748, top: 20, width: 380, height: 440 });
    // preview window at the bottom right (bottom/right 20 px, 320 x 180): top at 800 - 20 - 180 = 600, no overlap
    assert.equal(defaultRect(1200, 800, DEFAULTS, MIN, { left: 860, top: 600, right: 1180, bottom: 780 }).height, 440);
    // a 800 x 600 preview: top at 180, so the viewer's bottom is 172
    assert.equal(defaultRect(1200, 800, DEFAULTS, MIN, { left: 380, top: 180, right: 1180, bottom: 780 }).height, MIN.height);
    assert.equal(defaultRect(1200, 800, DEFAULTS, MIN, { left: 700, top: 400, right: 1180, bottom: 780 }).height, 400 - 8 - 20);
  });

  test('clampRect: size within [min, 90 % of the host], the width and the header inside the host', () => {
    assert.deepEqual(clampRect({ left: 900, top: -10, width: 380, height: 440 }, 1000, 600, MIN, 36), { left: 620, top: 0, width: 380, height: 440 });
    assert.deepEqual(clampRect({ left: 10, top: 590, width: 380, height: 700 }, 1000, 600, MIN, 36), { left: 10, top: 564, width: 380, height: 540 });
    // a host smaller than the minimum: the 90 % cap wins
    assert.deepEqual(clampRect({ left: 0, top: 0, width: 380, height: 440 }, 300, 300, MIN, 36), { left: 0, top: 0, width: 270, height: 270 });
  });
});

/** A minimal element for the panel: classList, style, children, listeners, attributes, a fixed bounding rect. */
class FakeElement {
  constructor(tag, rect = null) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = [];
    this.attributes = {};
    this.style = {};
    this.hidden = false;
    this.className = '';
    this.classes = new Set();
    this.classList = {
      add: (c) => this.classes.add(c), remove: (c) => this.classes.delete(c), contains: (c) => this.classes.has(c),
    };
    this.rect = rect;
    this.clientWidth = rect ? rect.width : 0;
    this.clientHeight = rect ? rect.height : 0;
    this.offsetHeight = 36;
  }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  addEventListener(type, fn) { this.listeners.push([type, fn]); }
  setAttribute(k, v) { this.attributes[k] = v; }
  contains(node) { return node === this || this.children.some((c) => c.contains && c.contains(node)); }
  closest() { return null; }
  getBoundingClientRect() {
    const r = this.rect || { left: 0, top: 0, width: 0, height: 0 };
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height };
  }
}

function setupPanel({ narrow = false } = {}) {
  const observed = [];
  let roCallback = null;
  const winListeners = [];
  const win = {
    matchMedia: () => ({ matches: narrow }),
    addEventListener: (type, fn) => winListeners.push([type, fn]),
    ResizeObserver: class {
      constructor(cb) { roCallback = cb; }
      observe(el) { observed.push(el); }
    },
  };
  const doc = { createElement: (tag) => new FakeElement(tag), activeElement: null };
  const host = new FakeElement('main', { left: 0, top: 0, width: 1200, height: 800 });
  const avoid = new FakeElement('div', { left: 0, top: 0, width: 0, height: 0 });   // hidden: 0 x 0
  const panel = new FloatingPanel({ doc, win, host, id: 'uv-viewer', title: 'UV Viewer', defaults: DEFAULTS, min: MIN,
    avoidElement: () => avoid });
  return { panel, host, avoid, win, doc, observed, winListeners, ro: () => roCallback && roCallback() };
}

describe('FloatingPanel on a fake DOM (04 3.1)', () => {
  test('the constructor attaches nothing; mount() is idempotent and observes the host and the avoid element', () => {
    const s = setupPanel();
    assert.equal(s.host.children.length, 0);
    assert.equal(s.winListeners.length, 0);
    s.panel.mount();
    s.panel.mount();
    assert.equal(s.host.children.length, 1);
    assert.equal(s.winListeners.length, 1);
    assert.deepEqual(s.observed, [s.host, s.avoid]);
    assert.equal(s.panel.element.hidden, true);
    assert.equal(s.panel.element.id, 'uv-viewer');
  });

  test('show() lays the default out; the auto-offset follows the preview window; host resizes re-clamp', () => {
    const s = setupPanel();
    s.panel.show();
    assert.deepEqual(s.panel.rect, { left: 748, top: 20, width: 380, height: 440 });
    // the preview window appears (bottom right, 800 x 400): the ResizeObserver reflows the default rectangle
    s.avoid.rect = { left: 380, top: 380, width: 800, height: 400 };
    s.ro();
    assert.equal(s.panel.rect.height, 380 - 8 - 20);
    // the host shrinks: 90 % caps and the position keeps the panel inside
    s.host.clientWidth = 600;
    s.host.clientHeight = 400;
    s.host.rect = { left: 0, top: 0, width: 600, height: 400 };
    s.avoid.rect = { left: 0, top: 0, width: 0, height: 0 };
    s.ro();
    assert.deepEqual(s.panel.rect, { left: 600 - 72 - 380, top: 20, width: 380, height: 360 });
  });

  test('a header drag moves the panel and stops the auto-offset for the session', () => {
    const s = setupPanel();
    s.panel.show();
    const header = s.panel.element.children[0];
    const fire = (type, e) => header.listeners.filter(([t]) => t === type).forEach(([, fn]) => fn(e));
    const ev = (x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, target: header, preventDefault() {} });
    fire('pointerdown', ev(800, 30));
    fire('pointermove', ev(700, 130));
    fire('pointerup', ev(700, 130));
    assert.deepEqual(s.panel.rect, { left: 648, top: 120, width: 380, height: 440 });
    s.avoid.rect = { left: 380, top: 380, width: 800, height: 400 };
    s.ro();
    assert.deepEqual(s.panel.rect, { left: 648, top: 120, width: 380, height: 440 }, 'no auto-offset after a user move');
  });

  test('narrow layout: the sheet class and no inline geometry', () => {
    const s = setupPanel({ narrow: true });
    s.panel.show();
    assert.equal(s.panel.rect, null);
    assert.ok(s.panel.element.classes.has('floating-panel--sheet'));
    assert.equal(s.panel.element.style.left, '');
  });

  test('hide() moves focus out of the panel', () => {
    const s = setupPanel();
    s.panel.show();
    let blurred = false;
    const inner = new FakeElement('button');
    inner.blur = () => { blurred = true; };
    s.panel.body.appendChild(inner);
    s.doc.activeElement = inner;
    s.panel.hide();
    assert.equal(s.panel.element.hidden, true);
    assert.equal(blurred, true);
  });
});
