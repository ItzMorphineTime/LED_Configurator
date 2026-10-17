// Platform golden-master scenarios (docs/improvements/07-platform-foundations.md 8.3): the camera preview of 07 R1/R2.
//
//   preview_compositing  the owner's 2026-10-17 report: with the camera preview on, enlarging the preview window with its
//                        resize handle and orbiting left a rectangle of the main viewport (the preview's size, mirrored
//                        vertically: top right instead of bottom right) black or stale. A browser compositing bug of two
//                        overlapping WebGL canvases. Records the WebGL canvases the page created (window.__glCanvases of
//                        lib/inject.mjs; 07 AC 1: exactly one after 07 R2), full-page screenshots after two orbit drags and
//                        the pure-black share of that mirrored rectangle.
//   preview_clean        07 8.3: preview on, the person selected in translate mode, Safe Distance on; the preview at
//                        Full Frame and RED V-RAPTOR (40.96 x 21.6 mm), then a custom 100 x 10 mm filmback with the window
//                        dragged to its widest (800 x 120 once the clamps are per axis, B-L32). Screenshots of the canvas
//                        and of the window; the labels, the window and placeholder rects, the window's corner radius and
//                        background, and the gizmo-coloured pixels inside the preview rectangle (07 AC 2-4).
//
// Both are captured on the build before 07 R2 (harness-only commit B2-0), so their baselines document the two-canvas
// preview; 07 R2 then changes them with its own manifest.
//
// Like the other scenario files, every scenario talks to the page ONLY through the DOM and the DevTools protocol (ids,
// classes, clicks, value changes, CDP mouse input) and the standard-API hooks of lib/inject.mjs. #camera-preview-canvas
// is used only through its client rect (07 3.6: from 07 R2 on it is a layout placeholder with no WebGL context, and the
// main canvas draws the preview at its place), so the scenarios read the same on both builds.
//
// Exported as PLATFORM_SCENARIOS ({ name: { description, run } }) and spread into SCENARIOS after the feature scenarios.
import { decodePNG } from './lib/formats.mjs';
import { isGizmoRed, locate, parkMouse } from './scenarios-extra.mjs';
import { isPersonPixel } from './scenarios.mjs';

// ---- generic helpers (same semantics as the helpers of the other scenario files) ------------------------------

/** Run one step; a harness-level failure is recorded as an error (and fails comparison) instead of aborting. */
async function step(ctx, name, fn) {
    ctx.app.step = name;
    try {
        await fn();
    } catch (e) {
        ctx.app.errors.push({ kind: 'harness', step: name, message: String(e && e.message || e).split('\n')[0], raw: String(e && e.stack || e) });
    }
}

/** Record the value of `probe()` as the state file `<name>.json`. */
async function record(ctx, name, probe) {
    await step(ctx, `state:${name}`, async () => ctx.rec.state(name, await probe()));
}

/** Evaluate a self-contained page function (serialised with toString) with JSON arguments. */
function pageCall(app, fn, ...args) {
    return app.eval(`(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(', ')})`, 30000);
}

/** Press a key known to AppPage.keyPress with nothing focused. */
async function press(ctx, key) {
    await step(ctx, `key:${key}`, async () => { await ctx.app.blurActive(); await ctx.app.keyPress(key); });
}

/** Mouse press + release at one point (a click as the canvas pointer handlers see it). */
async function clickAt(app, x, y) {
    await app.mouse('mouseMoved', x, y);
    await app.mouse('mousePressed', x, y);
    await app.mouse('mouseReleased', x, y);
    await app.settle();
}

/** Screenshot clipped to #three-canvas (the preview window is drawn over it); returns the PNG (or null). */
async function shot(ctx, name) {
    let png = null;
    await step(ctx, `shot:${name}`, async () => { png = await ctx.app.screenshotCanvas(); ctx.rec.screenshot(name, png); });
    return png;
}

/** Screenshot clipped to the bounding box of `selector`. */
async function shotElement(ctx, name, selector) {
    await step(ctx, `shot:${name}`, async () => ctx.rec.screenshot(name, await ctx.app.screenshotElement(selector)));
}

/** The whole 1600 x 1000 page, from the compositor surface (where the owner saw the stale rectangle); returns the PNG. */
async function pageShot(ctx, name) {
    let png = null;
    await step(ctx, `shot:${name}`, async () => {
        const { app } = ctx;
        await app.waitAnimations();
        await app.frames(2);
        const res = await app.page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
        png = Buffer.from(res.data, 'base64');
        ctx.rec.screenshot(name, png);
    });
    return png;
}

/** Drag the preview's resize handle (top left; the window is anchored bottom right) by `steps` moves of (dx, dy). */
async function dragResizeHandle(ctx, label, dx, dy, steps) {
    await step(ctx, label, async () => {
        const r = await pageCall(ctx.app, pageRect, '#camera-preview-resize');
        if (!r) throw new Error('no #camera-preview-resize');
        await ctx.app.drag(Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2), dx, dy, steps);
    });
}

// ---- page probes (self-contained: evaluated in the page) -----------------------------------------------------

/** The client rect of `selector` in page px (two decimals), or null. */
function pageRect(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const r2 = (v) => Math.round(v * 100) / 100;
    return { x: r2(b.left), y: r2(b.top), w: r2(b.width), h: r2(b.height) };
}

/**
 * The preview as the page lays it out: the WebGL canvases (lib/inject.mjs), the rects of the main canvas, the window
 * and #camera-preview-canvas, the window's inline size, display, corner radius and background, the canvas attributes
 * and the three labels.
 */
function pagePreview() {
    const r2 = (v) => Math.round(v * 100) / 100;
    const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: r2(b.left), y: r2(b.top), w: r2(b.width), h: r2(b.height) }; };
    const w = document.getElementById('camera-preview-window');
    const c = document.getElementById('camera-preview-canvas');
    const ws = w ? getComputedStyle(w) : null;
    const cs = c ? getComputedStyle(c) : null;
    const text = (id) => { const el = document.getElementById(id); return el ? el.textContent : null; };
    return {
        glCanvases: window.__glCanvases(),
        mainCanvas: rect(document.getElementById('three-canvas')),
        window: w ? {
            rect: rect(w), styleWidth: w.style.width, styleHeight: w.style.height, display: w.style.display,
            borderRadius: ws.borderTopLeftRadius, backgroundColor: ws.backgroundColor,
        } : null,
        previewCanvas: c ? {
            rect: rect(c), width: c.getAttribute('width'), height: c.getAttribute('height'), visibility: cs.visibility,
        } : null,
        labels: { info: text('camera-preview-info'), fov: text('camera-preview-fov'), res: text('camera-preview-res') },
    };
}

/**
 * The page rects (padded by 4 px) of the visible overlays drawn over the main canvas: .viewport-overlay's children and
 * the preview window. The mirrored-rectangle probe skips them, so it reads only WebGL pixels.
 */
function pageOverlayRects() {
    return [...document.querySelectorAll('.viewport-overlay > *, #camera-preview-window')].map((el) => {
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || b.width === 0 || b.height === 0) return null;
        return { x: Math.floor(b.left) - 4, y: Math.floor(b.top) - 4, w: Math.ceil(b.width) + 8, h: Math.ceil(b.height) + 8 };
    }).filter(Boolean);
}

/** A point of #three-canvas, left of centre, that no overlay covers (an orbit drag starts there), or null. */
function pageOrbitPoint() {
    const c = document.getElementById('three-canvas');
    const b = c.getBoundingClientRect();
    for (const [fx, fy] of [[0.3, 0.45], [0.3, 0.3], [0.2, 0.5], [0.4, 0.6]]) {
        const x = Math.round(b.left + b.width * fx), y = Math.round(b.top + b.height * fy);
        if (document.elementFromPoint(x, y) === c) return { x, y };
    }
    return null;
}

// ---- pixel probes ------------------------------------------------------------------------------------------------

/**
 * The owner's stale rectangle: the preview window's rect mirrored about the main canvas's horizontal centre line
 * (same x range; top right when the window sits bottom right). Counts its pixels outside every overlay and the
 * pure-black ones (max channel <= 4; the scene background is Morph Black 0x0a0a0a and nothing in the default scene
 * renders darker), in a full-page screenshot.
 */
function mirrorStats(png, preview, overlays) {
    const { width, height, rgba } = decodePNG(png);
    const c = preview.mainCanvas, w = preview.window && preview.window.rect;
    if (!c || !w) return null;
    const x0 = Math.max(Math.ceil(w.x), Math.ceil(c.x)), x1 = Math.min(Math.floor(w.x + w.w), Math.floor(c.x + c.w), width);
    const top = c.y + (c.y + c.h - (w.y + w.h));
    const y0 = Math.max(Math.ceil(top), Math.ceil(c.y)), y1 = Math.min(Math.floor(top + w.h), Math.floor(c.y + c.h), height);
    const covered = (x, y) => overlays.some((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
    let pixels = 0, black = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            if (covered(x, y)) continue;
            const i = (y * width + x) * 4;
            pixels++;
            if (Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) <= 4) black++;
        }
    }
    return { rect: { x0, y0, x1, y1 }, pixels, black, blackFraction: pixels ? Math.round((black / pixels) * 10000) / 10000 : null };
}

const isGizmoGreen = (r, g, b) => g >= 78 && g <= 128 && r <= 56 && b <= 60 && g - Math.max(r, b) >= 40;

/**
 * Gizmo-coloured pixels (isGizmoRed / isGizmoGreen of the gizmo_drag scenario) inside the preview rectangle (the
 * #camera-preview-canvas rect, without the window's header, footer and resize handle and without the viewport overlays
 * drawn over it, such as the selection badge) of a #three-canvas screenshot. 0 means the gizmo is absent from the
 * preview (B-M11).
 */
function previewGizmoPixels(png, preview, bars) {
    const { width, height, rgba } = decodePNG(png);
    const c = preview.mainCanvas, p = preview.previewCanvas && preview.previewCanvas.rect;
    if (!c || !p) return null;
    const x0 = Math.max(Math.ceil(p.x - c.x), 0), x1 = Math.min(Math.floor(p.x + p.w - c.x), width);
    const y0 = Math.max(Math.ceil(p.y - c.y), 0), y1 = Math.min(Math.floor(p.y + p.h - c.y), height);
    const inBar = (x, y) => bars.some((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
    let red = 0, green = 0, pixels = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            if (inBar(x, y)) continue;
            const i = (y * width + x) * 4;
            pixels++;
            if (isGizmoRed(rgba[i], rgba[i + 1], rgba[i + 2])) red++;
            if (isGizmoGreen(rgba[i], rgba[i + 1], rgba[i + 2])) green++;
        }
    }
    return { pixels, red, green };
}

// ---- scenario: preview_compositing -------------------------------------------------------------------------------

/**
 * The owner's reproduction: preview on, the window enlarged with its resize handle (+280 px wide: 600 x 400 at Full
 * Frame), then two orbit drags, each followed by a full-page screenshot and the mirrored-rectangle probe.
 */
async function previewCompositingScenario(ctx) {
    const { app } = ctx;
    await step(ctx, 'preview-on', () => app.click('#toggle-camera-preview'));
    await record(ctx, '00_preview_on', () => pageCall(app, pagePreview));
    await dragResizeHandle(ctx, 'enlarge', -20, -10, 14);
    await record(ctx, '01_enlarged', () => pageCall(app, pagePreview));
    for (const [i, dx] of [[2, 12], [3, -18]]) {
        await step(ctx, `orbit-${i}`, async () => {
            const p = await pageCall(app, pageOrbitPoint);
            if (!p) throw new Error('no free canvas point for the orbit drag');
            await app.drag(p.x, p.y, dx, 0, 10);
        });
        const png = await pageShot(ctx, `0${i}_orbit.page`);
        await record(ctx, `0${i}_orbit`, async () => {
            const preview = await pageCall(app, pagePreview);
            const overlays = await pageCall(app, pageOverlayRects);
            const mirror = png ? mirrorStats(png, preview, overlays) : null;
            return { ...preview, mirror, staleSuspected: !!(mirror && mirror.blackFraction > 0.05) };
        });
    }
}

// ---- scenario: preview_clean -------------------------------------------------------------------------------------

/**
 * 07 8.3 preview_clean: the person selected in translate mode (picked with the preview off, as every person pick),
 * then preview and Safe Distance on; per filmback a canvas and a window screenshot and the preview state.
 */
async function previewCleanScenario(ctx) {
    const { app } = ctx;
    const capture = async (label) => {
        const png = await shot(ctx, `${label}.canvas`);
        await shotElement(ctx, `${label}.window`, '#camera-preview-window');
        await record(ctx, label, async () => {
            const preview = await pageCall(app, pagePreview);
            const bars = await app.overlayRects(['#camera-preview-window > div', '.viewport-overlay > *'], '#three-canvas', 2);
            return { ...preview, gizmoInPreview: png ? previewGizmoPixels(png, preview, bars) : null, gizmo: await app.gizmoState() };
        });
    };

    await step(ctx, 'person-on', () => app.click('#toggle-person'));
    await press(ctx, 'g');
    await step(ctx, 'select-person', async () => {
        await parkMouse(app);
        const p = await locate(app, isPersonPixel, { pick: 'centroid', radius: 2 });
        ctx.rec.state('person_pick', { found: !!p });
        if (p) await clickAt(app, p.x, p.y);
    });
    await step(ctx, 'preview-on', () => app.click('#toggle-camera-preview'));
    await step(ctx, 'safe-distance-on', () => app.click('#toggle-safe-distance'));
    await step(ctx, 'park', () => parkMouse(app));
    await capture('00_full_frame');

    await step(ctx, 'filmback-red-v-raptor', () => app.setValue('#camera-filmback', 'red-v-raptor', ['change']));
    await capture('01_red_v_raptor');

    await step(ctx, 'filmback-custom', () => app.setValue('#camera-filmback', 'custom', ['change']));
    await step(ctx, 'filmback-100x10', async () => {
        await app.setValue('#filmback-width', '100');
        await app.setValue('#filmback-height', '10');
    });
    await dragResizeHandle(ctx, 'widest', -40, -10, 15);
    await step(ctx, 'park-2', () => parkMouse(app));
    await capture('02_custom_100x10_widest');
}

export const PLATFORM_SCENARIOS = {
    preview_compositing: {
        description: '07 R2 / owner report: preview on, window enlarged, two orbit drags; the WebGL canvases, full-page screenshots and the mirrored-rectangle probe.',
        run: previewCompositingScenario,
    },
    preview_clean: {
        description: '07 8.3: person selected, preview and Safe Distance on, at Full Frame, RED V-RAPTOR and a 100x10 mm custom filmback dragged widest; screenshots and the preview state.',
        run: previewCleanScenario,
    },
};
