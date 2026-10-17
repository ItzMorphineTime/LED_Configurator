// Unit tests for 07 R2, the camera preview drawn by the main renderer (docs/improvements/07-platform-foundations.md 3.6,
// 5.2.2, 6.1; AC 1, 3, 4; 08 6.14 and criteria 38-39 for B-M9 and B-L32): geometry/PreviewFit.js (the per-axis clamps,
// the letterbox, the device-pixel rectangles), render/PreviewPass.js (the scissor pass with a fake renderer that floors
// v * dpr as three r128 does; updateCamera's legacy labels) and render/PreviewWindow.js after its reduction (no renderer,
// the resize drag with the per-axis clamps, contentRect, setLabels), plus the one-renderer rule of the sources.
// three.js is a small recording fake installed as window.THREE before the render modules are imported.
// Run: node --test tests/unit/preview-pass.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

class Vector2 { constructor() { this.x = 0; this.y = 0; } set(x, y) { this.x = x; this.y = y; return this; } }
class Color {
  constructor(v = 0) { this.v = v; }
  copy(c) { this.v = c.v; return this; }
}
class PerspectiveCamera {
  constructor(fov, aspect, near, far) {
    Object.assign(this, { fov, aspect, near, far });
    this.layers = { mask: 1 };
    this.position = { set: (x, y, z) => { this.pos = [x, y, z]; } };
    this.rotation = { order: 'XYZ', set: (x, y, z) => { this.rot = [x, y, z]; } };
    this.projectionUpdates = 0;
  }
  updateProjectionMatrix() { this.projectionUpdates++; }
}
globalThis.window = { THREE: { Vector2, Color, PerspectiveCamera } };

const { PREVIEW_SIZE_LIMITS, clampPreviewSize, letterboxRect, cssForDevicePx, previewDeviceRects } =
  await import('../../js/geometry/PreviewFit.js');
const { PreviewPass } = await import('../../js/render/PreviewPass.js');
const { PreviewWindow } = await import('../../js/render/PreviewWindow.js');
const { LAYER_MASKS } = await import('../../js/render/SceneManager.js');
const { Project } = await import('../../js/domain/Project.js');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---- a fake WebGLRenderer that applies three r128's floor(v * pixelRatio) --------------------------------------------

class FakeRenderer {
  constructor({ dpr, width, height }) {
    this.dpr = dpr;
    this.size = { x: width, y: height };
    this.viewport = [0, 0, Math.floor(width * dpr), Math.floor(height * dpr)];
    this.scissor = [...this.viewport];
    this.scissorTest = false;
    // a clear colour other than the bars' black, so the restore after the pass is observable
    this.clearColor = new Color(0x2a3b4c);
    this.clearAlpha = 0.75;
    this.log = [];
    this.onRender = null;
  }
  #device(x, y, w, h) { return [x, y, w, h].map((v) => Math.floor(v * this.dpr)); }
  getPixelRatio() { return this.dpr; }
  getSize(target) { return target.set(this.size.x, this.size.y); }
  getClearColor(target) { return target.copy(this.clearColor); }
  getClearAlpha() { return this.clearAlpha; }
  setClearColor(c, a) { this.clearColor = typeof c === 'number' ? new Color(c) : new Color(c.v); this.clearAlpha = a; this.log.push(['setClearColor', this.clearColor.v, a]); }
  setScissorTest(on) { this.scissorTest = on; this.log.push(['setScissorTest', on]); }
  setViewport(x, y, w, h) { this.viewport = this.#device(x, y, w, h); this.log.push(['viewport', ...this.viewport]); }
  setScissor(x, y, w, h) { this.scissor = this.#device(x, y, w, h); this.log.push(['scissor', ...this.scissor]); }
  clear(c, d, s) { this.log.push(['clear', c, d, s, [...this.scissor], this.clearColor.v]); }
  render(scene, camera) {
    this.log.push(['render', [...this.viewport], [...this.scissor], this.scissorTest]);
    if (this.onRender) this.onRender(scene, camera);
  }
}

/** A PreviewPass over fakes: the main canvas at (canvasLeft, canvasTop), the placeholder rect `content` (CSS px). */
function pass({ dpr = 1, width = 1200, height = 940, canvasLeft = 400, canvasTop = 60, content, visible = true, enabled = true,
  filmback = null } = {}) {
  const renderer = new FakeRenderer({ dpr, width, height });
  const hidden = [];
  const sceneManager = {
    renderer,
    canvas: { getBoundingClientRect: () => ({ left: canvasLeft, top: canvasTop }) },
    withPassHidden: (fn) => { hidden.push('in'); try { return fn(); } finally { hidden.push('out'); } },
  };
  const labels = [];
  const previewWindow = {
    visible,
    contentRect: () => content,
    setLabels: (l) => labels.push(l),
  };
  const cine = Project.createDefault().camera;
  cine.enabled = enabled;
  if (filmback) { cine.filmbackWidth = filmback[0]; cine.filmbackHeight = filmback[1]; }
  const p = new PreviewPass({ sceneManager, cine, previewWindow });
  p.updateCamera();
  return { p, renderer, hidden, labels, cine, previewWindow };
}

/** The default window: 320 x 180 outer at bottom/right 20 px, 1 px border: the placeholder is 318 x 178 at (1261, 801). */
const DEFAULT_CONTENT = { left: 1261, top: 801, right: 1579, bottom: 979 };

describe('PreviewFit (07 3.6, 6.1; 08 6.14)', () => {
  test('clampPreviewSize clamps each axis on its own to 200-800 x 120-600', () => {
    assert.deepEqual({ ...PREVIEW_SIZE_LIMITS }, { minWidth: 200, maxWidth: 800, minHeight: 120, maxHeight: 600 });
    assert.deepEqual(clampPreviewSize(320, 180), { w: 320, h: 180 });
    assert.deepEqual(clampPreviewSize(800, 8), { w: 800, h: 120 }, '100 x 1 mm at the widest: no 12,000 px blow-out (B-L32)');
    assert.deepEqual(clampPreviewSize(200, 20000), { w: 200, h: 600 }, '1 x 100 mm');
    assert.deepEqual(clampPreviewSize(100, 50), { w: 200, h: 120 });
  });

  test('letterboxRect keeps the aspect within 1e-9, fits the box and centres the image', () => {
    for (const [bw, bh, a] of [[318, 178, 1.5], [318, 178, 40.96 / 21.6], [798, 118, 10], [198, 598, 0.01], [400, 300, 4 / 3]]) {
      const r = letterboxRect(bw, bh, a);
      assert.ok(Math.abs(r.vw / r.vh - a) < 1e-9, `${bw}x${bh} @ ${a}`);
      assert.ok(r.vw <= bw + 1e-9 && r.vh <= bh + 1e-9);
      assert.ok(Math.abs(r.vw - bw) < 1e-9 || Math.abs(r.vh - bh) < 1e-9, 'touches two sides');
      assert.ok(Math.abs(r.vx - (bw - r.vw) / 2) < 1e-9 && Math.abs(r.vy - (bh - r.vh) / 2) < 1e-9);
    }
    assert.deepEqual(letterboxRect(318, 178, 1.5), { vx: 25.5, vy: 0, vw: 267, vh: 178 }, 'the default window at Full Frame');
    assert.deepEqual(letterboxRect(318, 178, NaN), { vx: 0, vy: 0, vw: 318, vh: 178 }, 'an invalid aspect fills the box');
    assert.deepEqual(letterboxRect(318, 178, Infinity), { vx: 0, vy: 0, vw: 318, vh: 178 });
  });

  test('cssForDevicePx floors back to the device pixel for dpr 1, 1.25, 1.5, 2 and 3', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 3]) {
      for (let n = 0; n <= 4000; n++) assert.equal(Math.floor(cssForDevicePx(n, dpr) * dpr), n, `${n} @ ${dpr}`);
    }
  });

  test('previewDeviceRects: the clipped window rect, the letterboxed image inside it, the y flip on the integer height', () => {
    const r = previewDeviceRects({ canvasRect: { left: 400, top: 60 }, contentRect: DEFAULT_CONTENT, dpr: 1,
      size: { x: 1200, y: 940 }, aspect: 1.5 });
    assert.deepEqual(r, { W: 1200, H: 940, box: { x: 861, y: 21, w: 318, h: 178 }, image: { x: 886, y: 21, w: 267, h: 178 } });
    // off the canvas on the left: clipped at x = 0
    const clipped = previewDeviceRects({ canvasRect: { left: 400, top: 60 }, contentRect: { left: 381, top: 861, right: 1581, bottom: 979 },
      dpr: 1, size: { x: 1200, y: 940 }, aspect: 10 });
    assert.equal(clipped.box.x, 0);
    assert.equal(clipped.box.w, 1181);
    // tiny or invisible: not drawn
    assert.equal(previewDeviceRects({ canvasRect: { left: 0, top: 0 }, contentRect: { left: 10, top: 10, right: 59, bottom: 100 },
      dpr: 1, size: { x: 800, y: 600 }, aspect: 1.5 }), null);
    assert.equal(previewDeviceRects({ canvasRect: { left: 0, top: 0 }, contentRect: { left: 900, top: 10, right: 1000, bottom: 100 },
      dpr: 1, size: { x: 800, y: 600 }, aspect: 1.5 }), null, 'right of the canvas');
  });
});

describe('PreviewPass.render: the scissor pass in device pixels (07 6.1, AC 3)', () => {
  const RECTS = [
    DEFAULT_CONTENT,
    { left: 1261.4, top: 800.6, right: 1579.3, bottom: 978.7 },
    { left: 1013.25, top: 512.75, right: 1578.5, bottom: 978.25 },
    { left: 777.1, top: 860.9, right: 1578.9, bottom: 979.1 },
  ];
  for (const dpr of [1, 1.25, 1.5, 2]) {
    for (const [i, content] of RECTS.entries()) {
      for (const filmback of [[36, 24], [40.96, 21.6], [100, 1]]) {
        test(`dpr ${dpr}, rect ${i}, filmback ${filmback.join('x')}: every rect is the intended integer rect; full restore`, () => {
          const { p, renderer, hidden } = pass({ dpr, width: 1199, height: 941, canvasLeft: 400.5, canvasTop: 59.75, content, filmback });
          const scene = {};
          let drawn = null;
          renderer.onRender = (s, camera) => { drawn = { s, camera, hidden: hidden.length % 2 === 1 }; };
          p.render(scene);
          const want = previewDeviceRects({ canvasRect: { left: 400.5, top: 59.75 }, contentRect: content, dpr,
            size: { x: 1199, y: 941 }, aspect: filmback[0] / filmback[1] });
          const H = Math.floor(941 * dpr);
          assert.equal(want.H, H, 'the integer drawing-buffer height');
          const vps = renderer.log.filter((e) => e[0] === 'viewport').map((e) => e.slice(1));
          const scs = renderer.log.filter((e) => e[0] === 'scissor').map((e) => e.slice(1));
          const box = [want.box.x, want.box.y, want.box.w, want.box.h];
          const img = [want.image.x, want.image.y, want.image.w, want.image.h];
          assert.deepEqual(vps[0], box, 'pass 1 viewport = the window rect');
          assert.deepEqual(scs[0], box, 'pass 1 scissor = the window rect');
          const clear = renderer.log.find((e) => e[0] === 'clear');
          assert.deepEqual(clear.slice(1, 4), [true, true, false]);
          assert.equal(clear[5], 0x000000, 'black bars');
          assert.deepEqual(vps[1], img, 'pass 2 viewport = the image rect');
          assert.deepEqual(scs[1], img, 'pass 2 scissor = the image rect');
          assert.ok(img[0] >= box[0] && img[1] >= box[1] && img[0] + img[2] <= box[0] + box[2] && img[1] + img[3] <= box[1] + box[3],
            'the image lies inside the window rect');
          const A = filmback[0] / filmback[1];
          assert.ok(Math.abs(img[2] - img[3] * A) <= Math.max(1, A), `aspect within 1 device px: ${img[2]} x ${img[3]} @ ${A}`);
          assert.ok(Math.abs(img[2] / A - img[3]) <= 1 || Math.abs(img[2] - img[3] * A) <= 1);
          assert.ok(drawn && drawn.s === scene && drawn.camera === p.camera, 'one draw through the preview camera');
          assert.equal(drawn.hidden, true, 'inside withPassHidden');
          assert.deepEqual(vps.at(-1), [0, 0, Math.floor(1199 * dpr), Math.floor(941 * dpr)],
            'the main viewport is restored to exactly renderer.getSize() (no device pixel lost)');
          assert.equal(renderer.scissorTest, false);
          assert.equal(renderer.clearColor.v, 0x2a3b4c, 'the clear colour before the pass is restored');
          assert.equal(renderer.clearAlpha, 0.75, 'the clear alpha before the pass is restored');
        });
      }
    }
  }

  test('nothing is drawn while the preview is off, the window hidden, or the rect under 50 x 30 CSS px', () => {
    for (const opts of [{ enabled: false }, { visible: false },
      { content: { left: 1261, top: 801, right: 1300, bottom: 979 } }]) {
      const { p, renderer } = pass({ content: DEFAULT_CONTENT, ...opts });
      p.render({});
      assert.deepEqual(renderer.log, [], JSON.stringify(opts));
    }
  });

  test('a draw that throws still restores the clear colour, the scissor test and the full viewport', () => {
    const { p, renderer } = pass({ content: DEFAULT_CONTENT });
    renderer.onRender = () => { throw new Error('context lost'); };
    assert.throws(() => p.render({}), /context lost/);
    assert.equal(renderer.scissorTest, false);
    assert.deepEqual(renderer.viewport, [0, 0, 1200, 940]);
    assert.equal(renderer.clearColor.v, 0x2a3b4c);
    assert.equal(renderer.clearAlpha, 0.75);
  });

  test('the camera aspect follows a filmback change made without a hub refresh', () => {
    const { p, cine } = pass({ content: DEFAULT_CONTENT });
    const before = p.camera.projectionUpdates;
    cine.filmbackWidth = 40.96;
    cine.filmbackHeight = 21.6;
    p.render({});
    assert.equal(p.camera.aspect, 40.96 / 21.6);
    assert.equal(p.camera.projectionUpdates, before + 1);
    p.render({});
    assert.equal(p.camera.projectionUpdates, before + 1, 'unchanged aspect: no update');
  });
});

describe('PreviewPass.updateCamera: the legacy camera maths and labels (moved from PreviewWindow)', () => {
  test('the camera: vertical FOV, filmback aspect, near 0.1, far 100, YXZ pose, mask DEFAULT | ENVIRONMENT', () => {
    const { p, cine, labels } = pass({ content: DEFAULT_CONTENT });
    const cam = p.camera;
    assert.equal(cam.fov, cine.vFov() * 180 / Math.PI);
    assert.equal(cam.aspect, cine.aspect());
    assert.deepEqual([cam.near, cam.far], [0.1, 100]);
    assert.equal(cam.layers.mask, LAYER_MASKS.PREVIEW);
    assert.equal(cam.rotation.order, 'YXZ');
    assert.deepEqual(cam.pos, [cine.posX, cine.posY, cine.posZ]);
    assert.deepEqual(cam.rot, [cine.rotX * Math.PI / 180, cine.rotY * Math.PI / 180, cine.rotZ * Math.PI / 180]);
    assert.deepEqual(labels, [{ info: '35mm • Full', fov: 'H: 54.4° V: 37.8°', res: '1620×1080' }],
      'the legacy texts (B-L34 stays open: 08 P2-10c)');
  });

  test('a second call updates the same camera', () => {
    const { p, cine } = pass({ content: DEFAULT_CONTENT });
    const cam = p.camera;
    cine.focalLength = 50;
    p.updateCamera();
    assert.equal(p.camera, cam);
    assert.equal(cam.fov, cine.vFov() * 180 / Math.PI);
  });
});

describe('PreviewWindow after 07 R2: the DOM frame only', () => {
  /** A fake DOM: the handle and the document record their listeners; offsetWidth/Height follow the inline size. */
  function frame(cine) {
    const listeners = {};
    const on = (target) => (type, fn) => { (listeners[`${target}:${type}`] ??= []).push(fn); };
    const windowEl = {
      style: { display: 'none', width: '320px', height: '180px' },
      get offsetWidth() { return parseFloat(this.style.width); },
      get offsetHeight() { return parseFloat(this.style.height); },
    };
    const label = () => ({ textContent: '' });
    const canvas = { getBoundingClientRect: () => ({ left: 1, top: 2, right: 3, bottom: 4 }) };
    const elements = { windowEl, canvas, resizeHandle: { addEventListener: on('handle') }, info: label(), fov: label(), res: label() };
    const doc = { addEventListener: on('doc'), body: { style: { cursor: '' } } };
    const pw = new PreviewWindow({ doc, cine, elements });
    const fire = (key, e) => listeners[key].forEach((fn) => fn(e));
    const drag = (from, dx) => {
      fire('handle:mousedown', { clientX: from, clientY: 0, preventDefault() {}, stopPropagation() {} });
      fire('doc:mousemove', { clientX: from - dx, clientY: 0 });
      fire('doc:mouseup', {});
    };
    return { pw, elements, listeners, drag, doc };
  }

  test('init registers the resize listeners once; initialized and visible', () => {
    const cine = Project.createDefault().camera;
    const { pw, listeners, elements } = frame(cine);
    assert.equal(pw.initialized, false);
    pw.init();
    pw.init();
    assert.equal(pw.initialized, true);
    assert.deepEqual(Object.keys(listeners).sort(), ['doc:mousemove', 'doc:mouseup', 'handle:mousedown']);
    assert.ok(Object.values(listeners).every((l) => l.length === 1), 'registered once');
    assert.equal(pw.visible, false);
    pw.setVisible(true);
    assert.equal(elements.windowEl.style.display, 'block');
    assert.equal(pw.visible, true);
    pw.setVisible(false);
    assert.equal(pw.visible, false);
  });

  test('contentRect is the placeholder\'s client rect; setLabels writes the three labels', () => {
    const { pw, elements } = frame(Project.createDefault().camera);
    assert.deepEqual(pw.contentRect(), { left: 1, top: 2, right: 3, bottom: 4 });
    pw.setLabels({ info: 'a', fov: 'b', res: 'c' });
    assert.deepEqual([elements.info.textContent, elements.fov.textContent, elements.res.textContent], ['a', 'b', 'c']);
  });

  test('the resize drag keeps the legacy width clamp and aspect, then clamps each axis on its own (B-L32)', () => {
    const cine = Project.createDefault().camera;
    const { pw, elements, drag, doc } = frame(cine);
    pw.init();
    drag(500, 1000);
    assert.equal(elements.windowEl.style.width, '800px');
    assert.equal(elements.windowEl.style.height, `${800 / 1.5}px`, 'Full Frame at the width limit: the legacy 800 x 533');
    assert.equal(doc.body.style.cursor, '');
    elements.windowEl.style.width = '420px';
    cine.filmbackWidth = 100;
    cine.filmbackHeight = 10;
    drag(500, 100);
    assert.deepEqual([elements.windowEl.style.width, elements.windowEl.style.height], ['520px', '120px'],
      'preview_resize\'s 100 x 10 drag: 520 x 120 (legacy 1200 x 120)');
    cine.filmbackWidth = 100;
    cine.filmbackHeight = 1;
    drag(500, 1000);
    assert.deepEqual([elements.windowEl.style.width, elements.windowEl.style.height], ['800px', '120px'], '100 x 1 mm');
    cine.filmbackWidth = 1;
    cine.filmbackHeight = 100;
    drag(500, -1000);
    assert.deepEqual([elements.windowEl.style.width, elements.windowEl.style.height], ['200px', '600px'], '1 x 100 mm');
  });
});

describe('one WebGL renderer (07 AC 1)', () => {
  /** Every .js file under js/, as [relative path, source]. */
  function sources(dir = join(ROOT, 'js')) {
    const out = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...sources(full));
      else if (name.endsWith('.js')) out.push([relative(ROOT, full).replace(/\\/g, '/'), readFileSync(full, 'utf8')]);
    }
    return out;
  }

  test('only render/SceneManager.js constructs a WebGLRenderer, once', () => {
    const makers = sources().filter(([rel]) => !rel.startsWith('js/vendor/'))
      .map(([rel, src]) => [rel, (src.match(/new THREE\.WebGLRenderer\(/g) || []).length]).filter(([, n]) => n > 0);
    assert.deepEqual(makers, [['js/render/SceneManager.js', 1]]);
  });

  test('App injects the preview pass into SceneManager, the hub refreshes the pass, and the tick renders one frame', () => {
    const app = readFileSync(join(ROOT, 'js/app/App.js'), 'utf8');
    assert.match(app, /sceneManager\.setPasses\(\[previewPass\]\)/);
    assert.match(app, /new CameraHub\(\{[^}]*preview: previewPass/);
    assert.match(app, /sceneManager\.renderFrame\(\);/);
    assert.doesNotMatch(app, /preview\.render\(/);
  });
});
