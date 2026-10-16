// Extra golden-master scenarios (work package WP1). They cover the code paths the original 12
// scenarios never reach: section logos, per-keystroke renames with panel IDs on, pilot mode
// (look, preview off while piloting), gizmo drags, the preview resize handle and import edge cases.
//
// Like scenarios.mjs, every scenario talks to the page ONLY through the DOM and the DevTools
// protocol: element ids, classes and data attributes, clicks, value changes followed by
// input/change events, real CDP keyboard and mouse input, the hidden #import-input file input and
// DOM.setFileInputFiles. They never call app functions or read app globals, so the same scenarios
// run unchanged against the original single-file app and the ES-module refactor.
//
// Exported as EXTRA_SCENARIOS ({ name: { description, run } }) and spread into SCENARIOS after the
// original entries (see scenarios.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodePNG } from './lib/formats.mjs';

const MODES = ['combined', 'section', 'panel'];

/**
 * A 16x8 RGBA PNG: left half #ff00aa, right half #ffdd00. Non-square, so the logo aspect-ratio
 * code path is exercised, and two-coloured, so a mirrored or mispositioned logo shows up in the
 * exported panel-ID images.
 */
const LOGO_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAAGUlEQVR4nGP4z7DqP158lwEvZhg1YDgYAACUU2DQjCHQwQAAAABJRU5ErkJggg==';

/** The name typed into the first card in `name_with_panel_ids`: contains the shortcut letters g, r, p and l, and markup (B-M4). */
const TYPED_NAME = 'Grip <i>L</i>';

// ---- generic helpers (same semantics as the helpers in scenarios.mjs) ------------------------

/** Run one step; a harness-level failure is recorded as an error (and fails comparison) instead of aborting. */
async function step(ctx, name, fn) {
    ctx.app.step = name;
    try {
        await fn();
    } catch (e) {
        ctx.app.errors.push({ kind: 'harness', step: name, message: String(e && e.message || e).split('\n')[0], raw: String(e && e.stack || e) });
    }
}

/** Click `selector` and record every download it produces (an empty list is recorded too). */
async function dl(ctx, name, selector, opts = {}) {
    let files = [];
    await step(ctx, name, async () => {
        files = await ctx.app.captureDownloads(() => ctx.app.click(selector), opts);
        ctx.rec.downloads(name, files);
    });
    return files;
}

/** Viewport screenshot clipped to #three-canvas. */
async function shot(ctx, name) {
    await step(ctx, `shot:${name}`, async () => ctx.rec.screenshot(name, await ctx.app.screenshotCanvas()));
}

/** Record the value of `probe()` as the state file `<name>.json`. */
async function record(ctx, name, probe) {
    await step(ctx, `state:${name}`, async () => ctx.rec.state(name, await probe()));
}

/** Evaluate a self-contained page function (serialised with toString) with JSON arguments. */
function pageCall(app, fn, ...args) {
    return app.eval(`(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(', ')})`, 30000);
}

/** Press one of the keys known to AppPage.keyPress (g, r, l, p, Escape) with nothing focused. */
async function press(ctx, key) {
    await step(ctx, `key:${key}`, async () => { await ctx.app.blurActive(); await ctx.app.keyPress(key); });
}

/** Reload the app in the same tab (a fresh page for the next sub-case). Console errors keep accumulating on the AppPage. */
async function freshPage(ctx, label) {
    await step(ctx, `reload:${label}`, async () => {
        const { app } = ctx;
        const loaded = app.page.once('Page.loadEventFired', 60000);
        const nav = await app.page.send('Page.navigate', { url: app.appUrl });
        if (nav.errorText) throw new Error('Navigation failed: ' + nav.errorText);
        await loaded;
        await app.waitReady();
    });
}

/** A left-button drag with CDP mouse events: move to the start, press, `steps` moves of (dx, dy), release. */
async function drag(app, x, y, dx, dy, steps) {
    await app.mouse('mouseMoved', x, y);
    await app.mouse('mousePressed', x, y);
    for (let i = 1; i <= steps; i++) await app.mouse('mouseMoved', x + i * dx, y + i * dy, { button: 'left', buttons: 1 });
    await app.mouse('mouseReleased', x + steps * dx, y + steps * dy);
    await app.settle();
}

/** Mouse press + release at one point (a click as the canvas pointer handlers see it). */
async function clickAt(app, x, y) {
    await app.mouse('mouseMoved', x, y);
    await app.mouse('mousePressed', x, y);
    await app.mouse('mouseReleased', x, y);
    await app.settle();
}

/**
 * Real typing through CDP key events into the focused element: keyDown (with `text`, so Chrome
 * inserts the character and fires `input`) and keyUp. The document keydown listeners see every key,
 * so a typed g/r/l/p only stays harmless while the shortcut handlers ignore INPUT targets.
 */
async function typeKey(app, key) {
    const letter = /^[a-z]$/i.test(key);
    const named = { ' ': ['Space', 32], Backspace: ['Backspace', 8] }[key];
    const code = letter ? 'Key' + key.toUpperCase() : named ? named[0] : '';
    const vk = letter ? key.toUpperCase().charCodeAt(0) : named ? named[1] : 0;
    const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    const text = key === 'Backspace' ? {} : { text: key, unmodifiedText: key };
    await app.page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...text });
    await app.page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

// ---- page probes (self-contained: evaluated in the page) -------------------------------------

function pageLogosState() {
    const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const cls = (el) => (el ? [...el.classList].sort() : null);
    const root = document.getElementById('section-logos-container');
    if (!root) return null;
    return [...root.children].map((row) => {
        const q = (s) => row.querySelector(s);
        const btn = q('.section-logo-upload-btn');
        const file = q('input[type="file"]');
        const sel = q('select[data-field="position"]');
        const scale = q('input[data-field="scale"]');
        return {
            text: norm(row.textContent),
            uploadButton: btn ? { classes: cls(btn), sectionId: btn.getAttribute('data-section-id'), text: norm(btn.textContent) } : null,
            fileInput: file ? { sectionId: file.getAttribute('data-section-id'), files: file.files ? file.files.length : null } : null,
            clear: cls(q('.section-logo-clear')),
            position: {
                classes: cls(q('.section-logo-position')),
                value: sel ? sel.value : null,
                selectedAttr: sel ? [...sel.options].filter((o) => o.hasAttribute('selected')).map((o) => o.value) : null,
            },
            scale: { classes: cls(q('.section-logo-scale')), value: scale ? scale.value : null, valueAttr: scale ? scale.getAttribute('value') : null },
        };
    });
}

function pageSectionTitles() {
    return [...document.querySelectorAll('#wall-sections .section-title')].map((t) => ({ text: t.textContent, html: t.innerHTML }));
}

function pageNameInputs() {
    return [...document.querySelectorAll('#wall-sections .section-name-input')].map((i) => i.value);
}

function pageLogoTexts() {
    return [...document.querySelectorAll('#section-logos-container > *')].map((el) => el.textContent.replace(/\s+/g, ' ').trim());
}

function pageMeshModes() {
    return {
        options: [...document.querySelectorAll('.mesh-mode-option')].map((o) => ({ mode: o.getAttribute('data-mode'), active: o.classList.contains('active') })),
        radios: [...document.querySelectorAll('input[name="mesh-mode"]')].map((i) => ({ value: i.value, checked: i.checked })),
    };
}

function pageWallSectionsInfo() {
    const root = document.getElementById('wall-sections');
    return {
        childCount: root ? root.children.length : null,
        collapsed: root ? [...root.children].map((c) => c.classList.contains('collapsed')) : null,
        deleteIds: root ? [...root.querySelectorAll('.section-delete')].map((b) => b.getAttribute('data-id')) : null,
    };
}

function pagePreviewSize() {
    const w = document.getElementById('camera-preview-window');
    const c = document.getElementById('camera-preview-canvas');
    return {
        window: w ? { styleWidth: w.style.width, styleHeight: w.style.height, offsetWidth: w.offsetWidth, offsetHeight: w.offsetHeight, display: w.style.display } : null,
        canvas: c ? { width: c.getAttribute('width'), height: c.getAttribute('height'), styleWidth: c.style.width, styleHeight: c.style.height } : null,
        bodyCursor: document.body.style.cursor,
    };
}

function pageRect(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, display: getComputedStyle(el).display };
}

function pageInputValues(ids) {
    const out = {};
    for (const id of ids) { const el = document.getElementById(id); out[id] = el ? el.value : null; }
    return out;
}

/** Start an import through #import-input with raw file text; resolve when #wall-sections changed, a dialog appeared, or after 2 s. */
function pageImportText(text, filename) {
    return (async () => {
        const input = document.getElementById('import-input');
        if (!input) return { ok: false, reason: 'no #import-input' };
        const container = document.getElementById('wall-sections');
        let mutated = false;
        const mo = new MutationObserver(() => { mutated = true; });
        if (container) mo.observe(container, { childList: true, subtree: true });
        const before = window.__dialogs.length;
        const dt = new DataTransfer();
        dt.items.add(new File([text], filename, { type: 'application/json' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const t0 = performance.now();
        while (performance.now() - t0 < 2000) {
            if (mutated || window.__dialogs.length > before) break;
            await new Promise((r) => setTimeout(r, 25));
        }
        mo.disconnect();
        const ts = document.getElementById('total-sections');
        return { ok: true, mutated, newDialogs: window.__dialogs.length - before, inputValue: input.value, totalSections: ts ? ts.textContent : null };
    })();
}

/** Wait until the index-th logo upload button shows `has-logo` (or 10 s). */
function pageWaitLogo(index) {
    return (async () => {
        const t0 = performance.now();
        while (performance.now() - t0 < 10000) {
            const btn = document.querySelectorAll('#section-logos-container .section-logo-upload-btn')[index];
            if (btn && btn.classList.contains('has-logo')) return { ok: true };
            await new Promise((r) => setTimeout(r, 25));
        }
        return { ok: false, reason: 'logo upload did not show up in the UI' };
    })();
}

/** Focus `selector` (the index-th match) and select its whole text, like a user about to retype a field. */
function pageFocusSelect(selector, index) {
    const el = document.querySelectorAll(selector)[index];
    if (!el) return false;
    el.focus();
    el.select();
    return document.activeElement === el;
}

/**
 * Canvas-relative rects (with a 4 px margin) of the visible overlays above #three-canvas: the
 * buttons, badges and logo of .viewport-overlay and the camera preview window. Pixel searches skip
 * them, so only the WebGL rendering is searched.
 */
function pageOverlayRects() {
    const c = document.getElementById('three-canvas').getBoundingClientRect();
    return [...document.querySelectorAll('.viewport-overlay > *, #camera-preview-window')].map((el) => {
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || b.width === 0 || b.height === 0) return null;
        return { x: Math.floor(b.left - c.left) - 4, y: Math.floor(b.top - c.top) - 4, w: Math.ceil(b.width) + 8, h: Math.ceil(b.height) + 8 };
    }).filter(Boolean);
}

/** A point of #three-canvas that is not covered by an overlay, near its top-left corner (to park the mouse). */
function pageCanvasParkPoint() {
    const c = document.getElementById('three-canvas');
    const b = c.getBoundingClientRect();
    for (const [fx, fy] of [[0.02, 0.3], [0.02, 0.5], [0.3, 0.02], [0.5, 0.3]]) {
        const x = Math.round(b.left + b.width * fx), y = Math.round(b.top + b.height * fy);
        if (document.elementFromPoint(x, y) === c) return { x, y };
    }
    return null;
}

const readLogos = (app) => pageCall(app, pageLogosState);
const readPreviewSize = (app) => pageCall(app, pagePreviewSize);

// ---- pixel search in canvas screenshots -------------------------------------------------------

// Blended colours of the scene objects on the background 0x0a0a0f (MeshBasicMaterial, transparent):
//   gizmo red   0xff4444 @ 0.35 -> ~(96, 30, 34)     gizmo green 0x44ff44 @ 0.35 -> ~(30, 96, 34)
//   camera body 0xff6600 @ 0.80 -> ~(206, 84, 3)     person      0x4488ff @ 0.85 (see findPersonPixel)
// The ranges also accept the same blends over the floor grid lines and the 0.08 frustum tint.
const isGizmoRed = (r, g, b) => r >= 78 && r <= 128 && g <= 56 && b <= 60 && r - Math.max(g, b) >= 40;
const isGizmoGreen = (r, g, b) => g >= 78 && g <= 128 && r <= 56 && b <= 60 && g - Math.max(r, b) >= 40;
const isCameraBody = (r, g, b) => r >= 170 && g >= 60 && g <= 105 && b <= 45;
const isPerson = (r, g, b) => b >= 200 && r >= 40 && r <= 80 && g >= 95 && g <= 170;

/**
 * Find a pixel of a solid region of matching colour in a canvas screenshot.
 * Only "interior" pixels count (every pixel within `radius` matches too), so the chosen point lies
 * well inside the object and a mouse press there hits it with the app's raycaster.
 *   pick 'centroid': the interior pixel closest to the centroid of all matches
 *   pick 'maxX' / 'maxY': the right-most / lowest interior pixel (ties: first in scan order)
 * `exclude` is a list of canvas-relative rects (e.g. the preview window overlay).
 * Returns { x, y, count } in canvas pixels, or null when fewer than `minCount` pixels match.
 */
function findRegionPixel(png, match, { pick = 'centroid', radius = 2, minCount = 20, exclude = [] } = {}) {
    const { width, height, rgba } = decodePNG(png);
    const hit = new Uint8Array(width * height);
    let n = 0, sx = 0, sy = 0;
    const excluded = (x, y) => exclude.some((e) => x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (!excluded(x, y) && match(rgba[i], rgba[i + 1], rgba[i + 2])) { hit[y * width + x] = 1; n++; sx += x; sy += y; }
        }
    }
    if (n < minCount) return null;
    const interior = (x, y) => {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= width || yy >= height || !hit[yy * width + xx]) return false;
            }
        }
        return true;
    };
    const mx = sx / n, my = sy / n;
    let best = null, bestScore = -Infinity;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!hit[y * width + x] || !interior(x, y)) continue;
            const score = pick === 'maxX' ? x : pick === 'maxY' ? y : -((x - mx) ** 2 + (y - my) ** 2);
            if (score > bestScore) { bestScore = score; best = { x, y }; }
        }
    }
    return best ? { ...best, count: n } : null;
}

/**
 * Screenshot the canvas, find a region by colour, and return its page coordinates (or null).
 * Set REGRESSION_DEBUG_DIR to keep each searched screenshot and the chosen pixel for inspection.
 */
async function locate(app, match, opts = {}) {
    const exclude = await pageCall(app, pageOverlayRects);
    const png = await app.screenshotCanvas();
    const hit = findRegionPixel(png, match, { ...opts, exclude });
    if (process.env.REGRESSION_DEBUG_DIR) {
        const base = path.join(process.env.REGRESSION_DEBUG_DIR, `${app.step.replace(/[^\w.-]+/g, '_')}`);
        fs.mkdirSync(process.env.REGRESSION_DEBUG_DIR, { recursive: true });
        fs.writeFileSync(base + '.png', png);
        fs.writeFileSync(base + '.json', JSON.stringify({ hit, exclude }, null, 2));
    }
    if (!hit) return null;
    const r = await app.canvasRect();
    return { x: r.x + hit.x, y: r.y + hit.y };
}

/** Move the mouse onto a free spot of the canvas, so the gizmo hover state is reset before a screenshot. */
async function parkMouse(app) {
    const p = await pageCall(app, pageCanvasParkPoint);
    if (p) { await app.mouse('mouseMoved', p.x, p.y); await app.settle(); }
}

// ---- scenario: logos -----------------------------------------------------------------------

/**
 * Section logos with panel IDs on: upload, position, scale clamps, clear, panel IDs off.
 * Covers: index.html@cd3fd3f lines 2052-2187 (logo drawing), 2189-2305 (logo list and handlers).
 */
async function logosScenario(ctx) {
    const { app, rec } = ctx;
    const logos = (name) => record(ctx, `logos_${name}`, () => readLogos(app));
    const exportBoth = async (label) => {
        await dl(ctx, `${label}__export-panel-ids`, '#export-panel-ids', { expect: 1, timeoutMs: 60000 });
        await dl(ctx, `${label}__export-zip`, '#export-zip', { expect: 1, timeoutMs: 120000, quietMs: 800 });
    };
    const setSelect = (value) => app.setValue('#section-logos-container select[data-field="position"]', value, ['change']);
    const setScale = (value) => app.setValue('#section-logos-container input[data-field="scale"]', value, ['change']);

    await step(ctx, 'panel-ids-on', () => app.click('#toggle-panel-ids'));
    await logos('00_panel_ids_on');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-regression-logo-'));
    try {
        const file = path.join(tmpDir, 'logo.png');
        fs.writeFileSync(file, Buffer.from(LOGO_PNG_BASE64, 'base64'));
        await step(ctx, 'upload-logo', async () => {
            const { result } = await app.page.send('Runtime.evaluate', {
                expression: `document.querySelectorAll('#section-logos-container input[type="file"]')[0] || null`,
                returnByValue: false,
            });
            if (!result || !result.objectId) throw new Error('no logo file input in #section-logos-container');
            await app.page.send('DOM.setFileInputFiles', { files: [file], objectId: result.objectId });
            await app.page.send('Runtime.releaseObject', { objectId: result.objectId }).catch(() => {});
            const r = await pageCall(app, pageWaitLogo, 0);
            rec.state('logo_upload', r);
            await app.settle(200);
            if (!r.ok) throw new Error('logo upload: ' + r.reason);
        });
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    await logos('01_uploaded');
    await shot(ctx, '01_uploaded_combined');
    await exportBoth('01_uploaded');

    await step(ctx, 'position-top-left', () => setSelect('top-left'));
    await logos('02_top_left');
    await exportBoth('02_top_left');
    await step(ctx, 'position-bottom-right', () => setSelect('bottom-right'));
    await logos('03_bottom_right');
    await exportBoth('03_bottom_right');

    await step(ctx, 'scale-150', () => setScale('150'));
    await logos('04_scale_150');
    await exportBoth('04_scale_150');
    await step(ctx, 'scale-abc', () => setScale('abc'));
    await logos('05_scale_abc');
    await exportBoth('05_scale_abc');
    await step(ctx, 'scale-25', () => setScale('25'));
    await logos('06_scale_25');
    await exportBoth('06_scale_25');

    // With panel IDs off the logo controls still update the model, but nothing is rebuilt.
    await step(ctx, 'panel-ids-off', () => app.click('#toggle-panel-ids'));
    await step(ctx, 'position-center-while-off', () => setSelect('center'));
    await logos('07_off_position_center');
    await step(ctx, 'clear-logo', () => app.click('#section-logos-container .section-logo-clear'));
    await logos('08_cleared');
    await step(ctx, 'panel-ids-on-again', () => app.click('#toggle-panel-ids'));
    await logos('09_panel_ids_on_again');
    await dl(ctx, '09_cleared__export-panel-ids', '#export-panel-ids', { expect: 1, timeoutMs: 60000 });
}

// ---- scenario: name_with_panel_ids -------------------------------------------------------------

/**
 * Per-keystroke rename with panel IDs on, then an empty name.
 * Covers: index.html@cd3fd3f lines 4014-4023 (name input), 2189-2254 (logo list), 4410-4434 (shortcut guard).
 */
async function nameWithPanelIdsScenario(ctx) {
    const { app, rec } = ctx;
    const nameState = async () => ({
        inputs: await pageCall(app, pageNameInputs),
        titles: await pageCall(app, pageSectionTitles),
        logos: await pageCall(app, pageLogoTexts),
    });

    await step(ctx, 'panel-ids-on', () => app.click('#toggle-panel-ids'));
    await record(ctx, 'name_00_initial', nameState);

    // Retype the first card's name one key at a time (select all, then type: the first key replaces "Wall 1").
    const typed = [];
    await step(ctx, 'type-name', async () => {
        if (!await pageCall(app, pageFocusSelect, '#wall-sections .section-name-input', 0)) throw new Error('could not focus the first name input');
        for (const ch of TYPED_NAME) {
            await typeKey(app, ch);
            await app.settle(100);
            typed.push({ key: ch, ...await nameState() });
        }
    });
    await step(ctx, 'record-typing', async () => rec.state('name_01_per_keystroke', typed));
    await record(ctx, 'name_02_gizmo_after_typing', () => app.gizmoState());
    await shot(ctx, 'name_02_typed');
    await dl(ctx, 'name_02_typed__export-panel-ids', '#export-panel-ids', { expect: 1, timeoutMs: 60000 });
    await dl(ctx, 'name_02_typed__export-json', '#export-json');

    // Clear the field: the model falls back to "Wall 1" while the input stays empty.
    await step(ctx, 'clear-name', async () => {
        if (!await pageCall(app, pageFocusSelect, '#wall-sections .section-name-input', 0)) throw new Error('could not focus the first name input');
        await typeKey(app, 'Backspace');
        await app.settle(100);
    });
    await record(ctx, 'name_03_cleared', nameState);
    await dl(ctx, 'name_03_cleared__export-json', '#export-json');
    await dl(ctx, 'name_03_cleared__export-panel-ids', '#export-panel-ids', { expect: 1, timeoutMs: 60000 });
    await record(ctx, 'name_04_after_exports', nameState);
}

// ---- scenario: preview_off_in_pilot (B-H4) --------------------------------------------------

/**
 * B-H4: the camera preview turned off while piloting.
 * Covers: index.html@cd3fd3f lines 3477-3509 (pilot toggle), 4229-4249 (preview toggle).
 */
async function previewOffInPilotScenario(ctx) {
    const { app } = ctx;
    const snap = (name) => record(ctx, name, async () => ({
        gizmo: await app.gizmoState(),
        camera: await app.cameraState(),
        dialogs: await app.dialogs(),
    }));

    await step(ctx, 'preview-on', () => app.click('#toggle-camera-preview'));
    await press(ctx, 'p');
    await snap('pilot_00_on');
    await shot(ctx, 'pilot_00_on');
    // Turning the preview off while piloting: the toggle-off path calls the pilot toggle after the
    // preview flag is already false, so it alerts and stays in pilot mode.
    await step(ctx, 'preview-off', () => app.click('#toggle-camera-preview'));
    await snap('pilot_01_preview_off');
    await shot(ctx, 'pilot_01_preview_off');
    await press(ctx, 'p');
    await snap('pilot_02_P_alerts_again');
    await press(ctx, 'Escape');
    await snap('pilot_03_Escape_alerts_again');
    // Recovery: the preview back on re-drives the pilot view; P then leaves pilot mode.
    await step(ctx, 'preview-on-again', () => app.click('#toggle-camera-preview'));
    await snap('pilot_04_preview_on_again');
    await press(ctx, 'p');
    await snap('pilot_05_P_exits');
    await shot(ctx, 'pilot_05_exited');
}

// ---- scenario: pilot_look ----------------------------------------------------------------------

/**
 * Pilot mouse look, the wheel in pilot mode and the exit.
 * Covers: index.html@cd3fd3f lines 3477-3562, 3622-3631, 3835-3840, 4437-4479.
 */
async function pilotLookScenario(ctx) {
    const { app } = ctx;
    const cam = (name) => record(ctx, name, async () => ({ camera: await app.cameraState(), gizmo: await app.gizmoState() }));

    await step(ctx, 'preview-on', () => app.click('#toggle-camera-preview'));
    await press(ctx, 'p');
    await cam('look_00_pilot_on');
    await step(ctx, 'look-drag', async () => {
        const r = await app.canvasRect();
        await drag(app, r.x + r.w / 2, r.y + r.h / 2, 20, 6, 6);
    });
    await cam('look_01_after_drag');
    await shot(ctx, 'look_01_after_drag');
    // The orbit wheel handler must ignore the wheel in pilot mode (the pilot handler only changes the fly speed).
    await step(ctx, 'wheel-in-pilot', async () => {
        const r = await app.canvasRect();
        await app.page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.x + r.w / 2, y: r.y + r.h / 2, deltaX: 0, deltaY: 300 });
        await app.settle();
    });
    await shot(ctx, 'look_02_after_wheel');
    await press(ctx, 'p');
    await cam('look_03_pilot_off');
    await shot(ctx, 'look_03_pilot_off');
}

// ---- scenario: gizmo_drag ----------------------------------------------------------------------

/**
 * Locate a gizmo handle by colour and drag it 60 px to the right in 6 steps. Records
 * `<label>_handle.json` as { found: true } or { skipped: true, reason } (coordinates are not recorded:
 * the values the drag produces are).
 */
async function dragHandle(ctx, label, match, pick) {
    const { app, rec } = ctx;
    await step(ctx, `drag:${label}`, async () => {
        await parkMouse(app);
        const p = await locate(app, match, { pick });
        if (!p) {
            rec.state(`${label}_handle`, { skipped: true, reason: 'handle colour not found in the canvas screenshot' });
            return;
        }
        rec.state(`${label}_handle`, { found: true });
        await drag(app, p.x, p.y, 10, 0, 6);
    });
}

/**
 * Translate and rotate drags on the person and on the film camera.
 * Covers: index.html@cd3fd3f lines 2997-3474 (gizmo, selection, viewport click), 4437-4479 (pointer routing).
 */
async function gizmoDragScenario(ctx) {
    const { app, rec } = ctx;
    const personValues = () => pageCall(app, pageInputValues, ['person-pos-x', 'person-pos-z', 'person-rot-y', 'person-scale']);

    // Person: translate mode first (picking only works with a gizmo mode), then pick by colour.
    await step(ctx, 'person-on', () => app.click('#toggle-person'));
    await press(ctx, 'g');
    await step(ctx, 'pick-person', async () => {
        const p = await locate(app, isPerson, { pick: 'centroid', radius: 1 });
        rec.state('person_pick', { found: !!p });
        if (p) await clickAt(app, p.x, p.y);
    });
    await record(ctx, 'person_00_selected', () => app.gizmoState());
    await dragHandle(ctx, 'person_x_arrow', isGizmoRed, 'maxX');
    await record(ctx, 'person_01_translated', personValues);
    await shot(ctx, 'person_01_translated');
    await press(ctx, 'r');
    await dragHandle(ctx, 'person_y_ring', isGizmoGreen, 'maxY');
    await record(ctx, 'person_02_rotated', personValues);
    await shot(ctx, 'person_02_rotated');

    // Camera: hiding the person deselects it; enable the preview and pick the orange body box.
    // At the default orbit distance (8) the film camera sits on the bottom edge of the view, so
    // zoom out first (orbit wheel: distance 8 + 400 * 0.01 = 12).
    await step(ctx, 'person-off', () => app.click('#toggle-person'));
    await step(ctx, 'preview-on', () => app.click('#toggle-camera-preview'));
    await step(ctx, 'zoom-out', async () => {
        const r = await app.canvasRect();
        await app.page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.x + r.w / 2, y: r.y + r.h / 2, deltaX: 0, deltaY: 400 });
        await app.settle();
    });
    await press(ctx, 'g');
    await step(ctx, 'pick-camera', async () => {
        await parkMouse(app);
        const p = await locate(app, isCameraBody, { pick: 'centroid', radius: 2 });
        rec.state('camera_pick', { found: !!p });
        if (p) await clickAt(app, p.x, p.y);
    });
    await record(ctx, 'camera_00_selected', () => app.gizmoState());
    await dragHandle(ctx, 'camera_x_arrow', isGizmoRed, 'maxX');
    await record(ctx, 'camera_01_translated', () => app.cameraState());
    await shot(ctx, 'camera_01_translated');
    await press(ctx, 'r');
    await dragHandle(ctx, 'camera_y_ring', isGizmoGreen, 'maxY');
    await record(ctx, 'camera_02_rotated', () => app.cameraState());
    await shot(ctx, 'camera_02_rotated');
    await record(ctx, 'camera_03_gizmo', () => app.gizmoState());
}

// ---- scenario: preview_resize ------------------------------------------------------------------

/**
 * The preview resize handle, aspect-locked, then the B-L32 clamp blow-out.
 * Covers: index.html@cd3fd3f lines 3647-3700 (setupPreviewResize), 4251-4276 (filmback inputs).
 */
async function previewResizeScenario(ctx) {
    const { app } = ctx;
    const dragHandleBy = (label) => step(ctx, label, async () => {
        const r = await pageCall(app, pageRect, '#camera-preview-resize');
        if (!r) throw new Error('no #camera-preview-resize');
        await drag(app, Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2), -20, -10, 5);
    });

    await step(ctx, 'preview-on', () => app.click('#toggle-camera-preview'));
    await record(ctx, 'resize_00_initial', () => readPreviewSize(app));
    await dragHandleBy('resize-drag-1');
    await record(ctx, 'resize_01_dragged', () => readPreviewSize(app));
    await shot(ctx, 'resize_01_dragged');

    // A very wide custom filmback: the height clamp recomputes the width from the aspect (B-L32).
    await step(ctx, 'filmback-custom', () => app.setValue('#camera-filmback', 'custom', ['change']));
    await step(ctx, 'filmback-100x10', async () => {
        await app.setValue('#filmback-width', '100');
        await app.setValue('#filmback-height', '10');
    });
    await record(ctx, 'resize_02_custom_100x10', async () => ({ size: await readPreviewSize(app), camera: await app.cameraState() }));
    await dragHandleBy('resize-drag-2');
    await record(ctx, 'resize_03_blow_out', () => readPreviewSize(app));
    await shot(ctx, 'resize_03_blow_out');
}

// ---- scenario: import_edge ---------------------------------------------------------------------

/** Import raw file text through #import-input and record the import result. */
async function importText(ctx, label, text) {
    await step(ctx, `import:${label}`, async () => {
        const r = await pageCall(ctx.app, pageImportText, text, `${label}.json`);
        await ctx.app.settle(200);
        ctx.rec.state(`${label}_import`, r);
    });
}

const wallState = (app) => async () => ({
    stats: await app.stats(),
    wallSections: await pageCall(app, pageWallSectionsInfo),
    sections: await app.sectionsSnapshot(),
});

const section = (extra) => ({
    name: 'Edge',
    panel: { columns: 4, rows: 2, width_mm: 500, height_mm: 500 },
    led_resolution: { x: 32, y: 32 },
    curvature: { angle_degrees: 5, angle_offset_degrees: 0 },
    color: '#00f0ff',
    ...extra,
});

/**
 * Import edge cases (B-L8) on fresh pages.
 * Covers: index.html@cd3fd3f lines 4967-5010 (importJSON), 4081-4146 (add/delete), 4491-4965 (exports).
 */
async function importEdgeScenario(ctx) {
    const { app } = ctx;
    const dialogs = (label) => record(ctx, `${label}_dialogs`, () => app.dialogs());

    // (i) Empty wall with the preview and safe distance on (empty safe-distance group, no error);
    //     then add (TypeError), the combined OBJ/glTF exports (TypeError on sections[0]) and JSON.
    await step(ctx, 'i-preview-and-safe-distance-on', async () => {
        await app.click('#toggle-camera-preview');
        await app.click('#toggle-safe-distance');
    });
    await importText(ctx, 'i_empty', JSON.stringify({ version: '1.0', sections: [], mesh_mode: 'combined' }));
    await record(ctx, 'i_empty_state', async () => ({ ...await wallState(app)(), camera: await app.cameraState() }));
    await shot(ctx, 'i_empty');
    await step(ctx, 'i-add-section', () => app.click('#add-section-btn'));
    await record(ctx, 'i_after_add', wallState(app));
    await dl(ctx, 'i__export-obj', '#export-obj', { expect: 2, timeoutMs: 4000 });
    await dl(ctx, 'i__export-gltf', '#export-gltf', { expect: 1, timeoutMs: 4000 });
    await dl(ctx, 'i__export-json', '#export-json');
    await dialogs('i');

    // (ii) Numbers imported as strings are not coerced.
    await freshPage(ctx, 'ii');
    await importText(ctx, 'ii_strings', JSON.stringify({
        version: '1.0',
        sections: [{
            name: 'Strings', id: 0,
            panel: { columns: '10', rows: '3', width_mm: '500', height_mm: '500' },
            led_resolution: { x: '32', y: '32' },
            curvature: { angle_degrees: '5', angle_offset_degrees: '0' },
            color: '#ff00aa',
        }],
        mesh_mode: 'combined',
    }));
    await record(ctx, 'ii_strings_state', wallState(app));
    await dl(ctx, 'ii__export-json', '#export-json');
    for (const mode of MODES) {
        await step(ctx, `ii-mode-${mode}`, () => app.selectMeshMode(mode));
        await dl(ctx, `ii_${mode}__export-obj`, '#export-obj', { expect: 2 });
        await dl(ctx, `ii_${mode}__export-gltf`, '#export-gltf', { expect: 1, timeoutMs: 30000 });
    }
    await record(ctx, 'ii_final_stats', () => app.stats());
    await dialogs('ii');

    // (iii) Unknown mesh mode: no label active, radios untouched, panels rendered and exported.
    await freshPage(ctx, 'iii');
    await importText(ctx, 'iii_weird_mode', JSON.stringify({ version: '1.0', sections: [section({})], mesh_mode: 'weird' }));
    await record(ctx, 'iii_mesh_modes_after_import', () => pageCall(app, pageMeshModes));
    await shot(ctx, 'iii_weird_mode');
    await dl(ctx, 'iii_weird__export-obj', '#export-obj', { expect: 2 });
    await dl(ctx, 'iii_weird__export-gltf', '#export-gltf', { expect: 1, timeoutMs: 30000 });
    await step(ctx, 'iii-click-combined', () => app.selectMeshMode('combined'));
    await record(ctx, 'iii_mesh_modes_after_combined', () => pageCall(app, pageMeshModes));
    await dialogs('iii');

    // (iv) Duplicate ids [1, 1, 2] plus a section without id: deleting the first card removes both id-1 sections.
    await freshPage(ctx, 'iv');
    await importText(ctx, 'iv_duplicate_ids', JSON.stringify({
        version: '1.0',
        sections: [section({ id: 1, name: 'A' }), section({ id: 1, name: 'B' }), section({ id: 2, name: 'C' }), section({ name: 'D', id: undefined })],
        mesh_mode: 'combined',
    }));
    await record(ctx, 'iv_after_import', wallState(app));
    await step(ctx, 'iv-delete-first', () => app.click('#wall-sections > :nth-child(1) .section-delete'));
    await record(ctx, 'iv_after_delete', wallState(app));
    await dl(ctx, 'iv__export-json', '#export-json');
    await dialogs('iv');

    // (v) A string id: the allocator becomes NaN, the added card gets id NaN and is not expanded.
    await freshPage(ctx, 'v');
    await importText(ctx, 'v_string_id', JSON.stringify({ version: '1.0', sections: [section({ id: 'abc', name: 'Str' })], mesh_mode: 'combined' }));
    await record(ctx, 'v_after_import', wallState(app));
    await step(ctx, 'v-add-section', () => app.click('#add-section-btn'));
    await record(ctx, 'v_after_add', wallState(app));
    await dl(ctx, 'v__export-json', '#export-json');
    await dialogs('v');

    // (vi) No sections: nothing changes. (vii) `null`: alert. (viii) Malformed JSON: alert.
    await freshPage(ctx, 'vi');
    await record(ctx, 'vi_before', wallState(app));
    await importText(ctx, 'vi_no_sections', JSON.stringify({ foo: 1 }));
    await record(ctx, 'vi_after', wallState(app));
    await importText(ctx, 'vii_null', 'null');
    await record(ctx, 'vii_after', wallState(app));
    await importText(ctx, 'viii_malformed', '{"version": "1.0", "sections": [');
    await record(ctx, 'viii_after', wallState(app));
    await dialogs('vi_viii');
}

export const EXTRA_SCENARIOS = {
    import_edge: {
        description: 'Import edge cases (B-L8): empty wall with safe distance, string numbers, unknown mesh mode, duplicate/string ids, no sections, null, malformed JSON.',
        run: importEdgeScenario,
    },
    logos: {
        description: 'Section logos with panel IDs: upload (DOM.setFileInputFiles), position, scale clamps, clear; PNG + ZIP after each texture change.',
        run: logosScenario,
    },
    name_with_panel_ids: {
        description: 'Per-keystroke rename (real key events, markup in the name) with panel IDs on; clearing falls back to "Wall 1".',
        run: nameWithPanelIdsScenario,
    },
    preview_off_in_pilot: {
        description: 'B-H4: turning the camera preview off in pilot mode alerts and stays in pilot; P and Escape alert again.',
        run: previewOffInPilotScenario,
    },
    pilot_look: {
        description: 'Pilot mouse-look drag: rotation inputs, frustum readouts, preview labels; wheel ignored by the orbit in pilot.',
        run: pilotLookScenario,
    },
    gizmo_drag: {
        description: 'Gizmo drags located by colour: person X arrow and Y ring, camera X arrow and Y ring.',
        run: gizmoDragScenario,
    },
    preview_resize: {
        description: 'Camera preview resize handle: aspect-locked drag, then the B-L32 clamp blow-out with a 100x10 mm filmback.',
        run: previewResizeScenario,
    },
};
