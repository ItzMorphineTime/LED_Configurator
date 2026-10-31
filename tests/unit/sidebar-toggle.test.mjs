// The collapsible side panel (ui/SidebarToggle; the owner's request of 2026-10-31): open by default, a click on the
// native handle collapses and expands it (the grid container's class, aria-expanded and the title move together) and
// every change calls the layout hook once; SceneManager.fitContainer resizes only when the container's size changed
// (never for an unchanged or empty container) and observeResize wires one ResizeObserver on the container.
// Run: node --test tests/unit/sidebar-toggle.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FakeTHREE, Object3D, Layers } from './fixtures/fake-three.mjs';

class PerspectiveCamera extends Object3D {
  constructor(fov, aspect) { super(); this.aspect = aspect; this.layers = new Layers(); this.updates = 0; }
  updateProjectionMatrix() { this.updates++; }
}
class WebGLRenderer {
  constructor({ canvas }) { this.domElement = canvas; this.sizes = []; this.w = 0; this.h = 0; }
  setSize(w, h) { this.sizes.push([w, h]); this.w = w; this.h = h; }
  getSize(target) { return target.set(this.w, this.h); }
  setPixelRatio() {}
  render() {}
}
globalThis.window = {
  THREE: {
    ...FakeTHREE, PerspectiveCamera, WebGLRenderer,
    AmbientLight: class extends Object3D {}, PointLight: class extends Object3D {},
    GridHelper: class extends Object3D {}, AxesHelper: class extends Object3D {},
  },
};
const { SidebarToggle, SIDEBAR_TITLES } = await import('../../js/ui/SidebarToggle.js');
const { SceneManager } = await import('../../js/render/SceneManager.js');
const { Theme } = await import('../../js/theme/Theme.js');
const { Project } = await import('../../js/domain/Project.js');

/** A fake document with #sidebar-toggle and #control-panel (whose parent is the grid container). */
function makeDoc() {
  const classes = new Set(['app-container']);
  const container = { classList: { contains: (c) => classes.has(c), toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); } } };
  const button = {
    attrs: { 'aria-expanded': 'true' }, title: SIDEBAR_TITLES.expanded, listeners: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
    click() { for (const l of this.listeners) if (l.type === 'click') l.fn(); },
  };
  const panel = { parentElement: container };
  const doc = { getElementById: (id) => ({ 'sidebar-toggle': button, 'control-panel': panel })[id] ?? null };
  return { doc, button, classes };
}

describe('ui/SidebarToggle', () => {
  test('open by default; a click collapses, a second expands; class, aria-expanded, title and one layout call each', () => {
    const { doc, button, classes } = makeDoc();
    let layouts = 0;
    const t = new SidebarToggle({ doc, onLayoutChange: () => layouts++ });
    assert.equal(button.listeners.length, 0, 'the constructor adds no listener (R4)');
    t.bind();
    assert.equal(t.collapsed, false);
    button.click();
    assert.equal(t.collapsed, true);
    assert.ok(classes.has('sidebar-collapsed'));
    assert.equal(button.attrs['aria-expanded'], 'false');
    assert.equal(button.title, SIDEBAR_TITLES.collapsed);
    assert.equal(layouts, 1);
    button.click();
    assert.equal(t.collapsed, false);
    assert.ok(!classes.has('sidebar-collapsed'));
    assert.equal(button.attrs['aria-expanded'], 'true');
    assert.equal(button.title, SIDEBAR_TITLES.expanded);
    assert.equal(layouts, 2);
  });

  test('expand() on an open panel and setCollapsed to the current state change nothing', () => {
    const { doc } = makeDoc();
    let layouts = 0;
    const t = new SidebarToggle({ doc, onLayoutChange: () => layouts++ });
    t.expand();
    t.setCollapsed(false);
    assert.equal(layouts, 0);
    t.setCollapsed(true);
    t.setCollapsed(true);
    assert.equal(layouts, 1);
    t.expand();
    assert.equal(t.collapsed, false);
    assert.equal(layouts, 2);
  });

  test('index.html: the handle is a button naming the panel, open by default, inside the viewport', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.match(html, /<aside class="control-panel" id="control-panel">/);
    assert.match(html, /<main class="viewport">\s*<canvas id="three-canvas"><\/canvas>\s*<button type="button" class="sidebar-toggle" id="sidebar-toggle" aria-controls="control-panel" aria-expanded="true"/);
  });
});

describe('SceneManager.fitContainer / observeResize', () => {
  function makeScene(win = { devicePixelRatio: 1 }) {
    const container = { clientWidth: 1000, clientHeight: 600 };
    const canvas = { parentElement: container };
    const sm = new SceneManager({ canvas, win, display: Project.createDefault().display, theme: Theme });
    return { sm, container };
  }

  test('before init it does nothing; afterwards it resizes only for a changed, non-empty container', () => {
    const { sm, container } = makeScene();
    assert.equal(sm.fitContainer(), false);
    sm.init();
    const renderer = sm.renderer;
    assert.deepEqual(renderer.sizes, [[1000, 600]]);
    assert.equal(sm.fitContainer(), false, 'unchanged');
    container.clientWidth = 1400;   // the side panel collapsed
    assert.equal(sm.fitContainer(), true);
    assert.deepEqual(renderer.sizes.at(-1), [1400, 600]);
    assert.equal(sm.camera.aspect, 1400 / 600);
    assert.equal(sm.fitContainer(), false, 'already fitted');
    container.clientWidth = 0;
    assert.equal(sm.fitContainer(), false, 'an empty container never sets an infinite aspect');
    assert.equal(renderer.sizes.length, 2);
  });

  test('observeResize observes the container once and fits on each report; skipped without ResizeObserver', () => {
    const observed = [];
    let report = null;
    class RO { constructor(fn) { report = fn; } observe(el) { observed.push(el); } }
    const { sm, container } = makeScene({ devicePixelRatio: 1, ResizeObserver: RO });
    sm.init();
    sm.observeResize();
    assert.deepEqual(observed, [container]);
    report();
    assert.equal(sm.renderer.sizes.length, 1, 'the first report of the unchanged size does nothing');
    container.clientWidth = 640;
    report();
    assert.deepEqual(sm.renderer.sizes.at(-1), [640, 600]);
    const bare = makeScene();
    bare.sm.init();
    assert.doesNotThrow(() => bare.sm.observeResize());
  });

  test('App fits the renderer on every toggle and observes the viewport after the UV viewer is bound', () => {
    const src = readFileSync(new URL('../../js/app/App.js', import.meta.url), 'utf8');
    assert.match(src, /new SidebarToggle\(\{ doc, onLayoutChange: \(\) => sceneManager\.fitContainer\(\) \}\)/);
    assert.ok(src.indexOf('sceneManager.observeResize();') > src.indexOf('uvViewer.bind();'));
  });
});
