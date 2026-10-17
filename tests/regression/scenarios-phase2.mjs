// Phase 2 golden-master scenarios (docs/improvements/08-bugfix-roadmap.md, section 8.3; batch P2-0). They are
// captured against the UNFIXED code, so their baselines document the bugs; each later fix changes them on purpose,
// through its expected-change manifest (tests/regression/expected/<commit-id>.json).
//
// Like scenarios.mjs and scenarios-extra.mjs, every scenario talks to the page ONLY through the DOM and the DevTools
// protocol: ids, classes and data attributes, clicks, value changes followed by input/change events, CDP key events
// (with modifiers and auto-repeat), the hidden #import-input file input and DOM.setFileInputFiles. They never call app
// functions or read app globals.
//
// Conventions:
//   * Export steps are labelled `<mesh mode>__<button>` (for example `section__export-obj`, `combined__export-zip`) or
//     `<wall>__export-safe-distance`, so the segment-agnostic manifest patterns of 08 section 8.5
//     (`**/*section__export-obj__*.mtl`, `**/*combined__export-*`) cover these scenarios like the config scenarios.
//   * Payloads never reference a reachable URL (the `.invalid` top-level domain never resolves): the harness records
//     failed requests as errors, and the opt-in request log of `p2_project_v2` (network.json) proves that none is sent.
//   * Fresh pages inside a scenario use AppPage.reload(), so page loads never enter the request log; reload() keeps
//     the dialogs of the page it leaves, so dialogs.json lists the dialogs of every page of the scenario.
//
// Exported as PHASE2_SCENARIOS ({ name: { description, run, recordRequests? } }) and spread into SCENARIOS after the
// extra scenarios (see scenarios.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONFIGS } from './configs.mjs';
import { readZip } from './lib/formats.mjs';
import { OBJ_ZIP_DOWNLOAD } from './lib/app.mjs';
import * as ui from './lib/uiprobe.mjs';

const card = (i) => `#wall-sections > :nth-child(${i + 1})`;
const field = (i, f) => `${card(i)} input[data-field="${f}"]`;

/** The 16x8 two-colour test PNG of the `logos` scenario (left half #ff00aa, right half #ffdd00). */
const LOGO_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAAGUlEQVR4nGP4z7DqP158lwEvZhg1YDgYAACUU2DQjCHQwQAAAABJRU5ErkJggg==';

const sec = (name, id, cols, rows, w, h, lx, ly, curve, offset, color) => ({
    name, id,
    panel: { columns: cols, rows, width_mm: w, height_mm: h },
    led_resolution: { x: lx, y: ly },
    curvature: { angle_degrees: curve, angle_offset_degrees: offset },
    color,
});

// ---- generic helpers (same semantics as the helpers in scenarios.mjs) -------------------------

/** Run one step; a harness-level failure is recorded as an error (and fails comparison) instead of aborting. */
async function step(ctx, name, fn) {
    ctx.app.step = name;
    try {
        await fn();
    } catch (e) {
        ctx.app.errors.push({ kind: 'harness', step: name, message: String(e && e.message || e).split('\n')[0], raw: String(e && e.stack || e) });
    }
}

/** Click `selector` and record every download it produces under `<name>__<filename>` (an empty list is recorded too). */
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

/** Import a config object through #import-input; the import must apply (section count reached). */
async function importCfg(ctx, label, config, filename = `${label}.json`) {
    await step(ctx, label, async () => {
        const r = await ctx.app.importConfig(config, filename);
        ctx.rec.state(`${label}_result`, r);
        if (!r.ok) throw new Error('import did not apply: ' + JSON.stringify(r));
    });
}

/** Click a toggle only if its `.active` state differs from `on` (the state after an import may differ between builds). */
async function setToggle(ctx, name, selector, on) {
    await step(ctx, name, async () => {
        const active = await ctx.app.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.classList.contains('active') : null; })()`);
        if (active === null) throw new Error('toggle not found: ' + selector);
        if (active !== on) await ctx.app.click(selector);
    });
}

/** A fresh page in the same tab (AppPage.reload: page-load requests stay out of the request log). */
async function freshPage(ctx, label, afterReady = null) {
    await step(ctx, `reload:${label}`, () => ctx.app.reload({ afterReady }));
}

const KEYS = {
    g: { code: 'KeyG', vk: 71 },
    p: { code: 'KeyP', vk: 80 },
    Escape: { code: 'Escape', vk: 27 },
    Control: { code: 'ControlLeft', vk: 17 },
};
const CTRL = 2;   // CDP Input modifiers bit for Ctrl

/** One CDP key event. Printable keys carry `text` unless a modifier is held (as Chrome does). */
function keyEvent(app, type, key, { modifiers = 0, autoRepeat = false } = {}) {
    const k = KEYS[key];
    const printable = key.length === 1 && !modifiers && type === 'keyDown';
    return app.page.send('Input.dispatchKeyEvent', {
        type, key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers, autoRepeat,
        ...(printable ? { text: key, unmodifiedText: key } : {}),
    });
}

/** Write `data` to a temporary file and set it on the index-th logo file input; wait for `.has-logo` on its button. */
async function uploadLogo(ctx, label, index, filename, data) {
    const { app, rec } = ctx;
    await step(ctx, label, async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-regression-p2-'));
        try {
            const file = path.join(tmpDir, filename);
            fs.writeFileSync(file, data);
            const { result } = await app.page.send('Runtime.evaluate', {
                expression: `document.querySelectorAll('#section-logos-container input[type="file"]')[${index}] || null`,
                returnByValue: false,
            });
            if (!result || !result.objectId) throw new Error(`no logo file input #${index} in #section-logos-container`);
            await app.page.send('DOM.setFileInputFiles', { files: [file], objectId: result.objectId });
            await app.page.send('Runtime.releaseObject', { objectId: result.objectId }).catch(() => {});
            const r = await pageCall(app, pageWaitLogo, index);
            rec.state(`${label}_result`, r);
            await app.settle(300);
            if (!r.ok) throw new Error(`logo upload #${index}: ${r.reason}`);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
}

/** Import raw file text through #import-input and record the result (waits for the section count or a dialog). */
async function importText(ctx, label, text, expectedSections = null) {
    await step(ctx, label, async () => {
        const r = await pageCall(ctx.app, pageImportText, text, `${label}.json`, expectedSections);
        await ctx.app.settle(300);
        ctx.rec.state(`${label}_result`, r);
    });
}

// ---- page probes (self-contained: evaluated in the page) -------------------------------------

/** Wait until the index-th logo upload button shows `has-logo` (or 15 s). */
function pageWaitLogo(index) {
    return (async () => {
        const t0 = performance.now();
        while (performance.now() - t0 < 15000) {
            const btn = document.querySelectorAll('#section-logos-container .section-logo-upload-btn')[index];
            if (btn && btn.classList.contains('has-logo')) return { ok: true };
            await new Promise((r) => setTimeout(r, 25));
        }
        return { ok: false, reason: 'logo upload did not show up in the UI' };
    })();
}

/** Start an import through #import-input with raw file text; resolve when the wall changed (and has the expected section count) or a dialog appeared, or after 10 s. */
function pageImportText(text, filename, expectedSections) {
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
        const count = () => parseInt((document.getElementById('total-sections') || {}).textContent, 10);
        const t0 = performance.now();
        while (performance.now() - t0 < 10000) {
            if (window.__dialogs.length > before) break;
            if (mutated && (expectedSections === null || count() === expectedSections)) break;
            await new Promise((r) => setTimeout(r, 25));
        }
        mo.disconnect();
        return { mutated, newDialogs: window.__dialogs.length - before, totalSections: count() };
    })();
}

/** XSS probes (B-M4, B-L8): injected elements, and the injected `outline` of the colour `red;outline:3px solid lime`. */
function pageXssProbe() {
    return {
        xss_probe: !!document.getElementById('xss-probe'),
        xss_probe2: !!document.getElementById('xss-probe2'),
        color_outline_injected: [...document.querySelectorAll('#wall-sections .section-color')].map((el) => getComputedStyle(el).outlineStyle !== 'none'),
    };
}

/**
 * The section-logo list: per row its text, the upload button state and every data-* attribute of the row's elements
 * (a later build may expose more, for example the stored size of a logo).
 */
function pageLogoList() {
    const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const root = document.getElementById('section-logos-container');
    if (!root) return null;
    return [...root.children].map((row) => {
        const btn = row.querySelector('.section-logo-upload-btn');
        const data = [];
        for (const el of [row, ...row.querySelectorAll('*')]) {
            const attrs = {};
            for (const a of el.attributes) if (a.name.startsWith('data-') || a.name === 'title') attrs[a.name] = a.value;
            if (Object.keys(attrs).length) data.push({ tag: el.tagName.toLowerCase(), class: el.getAttribute('class') || '', ...attrs });
        }
        return {
            text: norm(row.textContent),
            hasLogo: btn ? btn.classList.contains('has-logo') : null,
            clearVisible: (() => { const c = row.querySelector('.section-logo-clear'); return c ? c.classList.contains('visible') : null; })(),
            position: (() => { const s = row.querySelector('select[data-field="position"]'); return s ? s.value : null; })(),
            scale: (() => { const s = row.querySelector('input[data-field="scale"]'); return s ? s.value : null; })(),
            data,
        };
    });
}

/** The `toggle_aria` probe (08 sections 6.18, 8.3): every `.toggle`, its `.active` state and its ARIA switch attributes (B-L36). */
function pageToggleAria() {
    return [...document.querySelectorAll('.toggle')].map((el) => ({
        id: el.id || null,
        active: el.classList.contains('active'),
        role: el.getAttribute('role'),
        ariaChecked: el.getAttribute('aria-checked'),
        tabindex: el.getAttribute('tabindex'),
    }));
}

/** Focus `selector` and report whether it holds the focus. */
function pageFocus(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    el.focus();
    return document.activeElement === el;
}

function pageActiveInfo(selector) {
    const a = document.activeElement;
    const el = document.querySelector(selector);
    return { activeElement: a && a !== document.body ? (a.id || a.tagName.toLowerCase()) : null, value: el ? el.value : null };
}

// ---- generated payloads ------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32). */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A 2,000,000-byte 24-bit BMP of seeded noise, 788 x 846 px. Rows are 2,364 bytes (no padding); the pixel array
 * starts at offset 56 (a 14-byte file header, a 40-byte BITMAPINFOHEADER and 2 bytes of gap), so the file is exactly
 * 56 + 2,364 x 846 = 2,000,000 bytes. Noise does not compress, so its PNG conversion exceeds 2 MB (08 section 6.16).
 */
export function noiseBmp() {
    const W = 788, H = 846, OFF = 56, ROW = W * 3, SIZE = OFF + ROW * H;
    const buf = Buffer.alloc(SIZE);
    buf.write('BM', 0, 'latin1');
    buf.writeUInt32LE(SIZE, 2);
    buf.writeUInt32LE(OFF, 10);
    buf.writeUInt32LE(40, 14);          // BITMAPINFOHEADER
    buf.writeInt32LE(W, 18);
    buf.writeInt32LE(H, 22);            // bottom-up
    buf.writeUInt16LE(1, 26);           // planes
    buf.writeUInt16LE(24, 28);          // bits per pixel
    buf.writeUInt32LE(0, 30);           // BI_RGB
    buf.writeUInt32LE(ROW * H, 34);
    buf.writeInt32LE(2835, 38);
    buf.writeInt32LE(2835, 42);
    const rand = rng(0xb3f00d);
    for (let i = OFF; i < SIZE; i += 4) buf.writeUInt32LE((rand() * 4294967296) >>> 0, i);
    return buf;
}

const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

/**
 * The stored SVG text (08 section 8.3, p2_project_v2 step 8; acceptance criterion 49), read from an Export All archive.
 * The page never shows a logo's bytes in the DOM, so the black-box harness reads them from the export: every `.svg`
 * entry of the archive (the 07 D6 ZIP variant stores logos as `assets/<id>.<ext>`) and every base64
 * `data:image/svg+xml` URI in its JSON entries (the inline variant), decoded as UTF-8, in archive order.
 * `zip` is null when the export produced no archive.
 */
export function storedSvgs(files) {
    const file = files.find((d) => /\.zip$/i.test(d.filename || '') && d.data && d.data.length);
    if (!file) return { zip: null, svgs: [] };
    const svgs = [];
    for (const e of readZip(file.data)) {
        if (e.isDir) continue;
        if (/\.svg$/i.test(e.name)) {
            svgs.push({ source: e.name, text: e.data.toString('utf8') });
        } else if (/\.json$/i.test(e.name)) {
            const re = /data:image\/svg\+xml;base64,([A-Za-z0-9+/]*={0,2})/g;
            const text = e.data.toString('utf8');
            let m, k = 0;
            while ((m = re.exec(text))) svgs.push({ source: `${e.name} (data URI ${k++})`, text: Buffer.from(m[1], 'base64').toString('utf8') });
        }
    }
    return { zip: file.filename, svgs };
}

/** An SVG logo with active and external content: <script>, <foreignObject> and an external href (never resolvable). */
const HOSTILE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="8" viewBox="0 0 16 8">'
    + '<script>document.documentElement.setAttribute("data-svg-script", "ran")</script>'
    + '<foreignObject width="16" height="8"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'
    + '<image href="https://logo.invalid/pixel.png" xlink:href="https://logo.invalid/pixel.png" width="1" height="1"/>'
    + '<rect width="16" height="8" fill="#ff00aa"/></svg>';

/**
 * An inline one-section v2 file (07 section 4.2 shape, panel IDs on) whose logo assets are hostile: an https:// URL, a
 * data:text/html URI, a data URI whose base64 length is not a multiple of 4, and the SVG above (the section's logo).
 */
function hostileV2File() {
    const asset = (name, mime, dataUri, payload) => {
        const sha = sha256hex(payload);
        return { id: 'a_' + sha.slice(0, 16), kind: 'logo', name, mime, bytes: payload.length, sha256: sha, storage: 'inline', data_uri: dataUri };
    };
    const svgBytes = Buffer.from(HOSTILE_SVG, 'utf8');
    const svg = asset('hostile.svg', 'image/svg+xml', 'data:image/svg+xml;base64,' + svgBytes.toString('base64'), svgBytes);
    return {
        version: '2.0',
        format: 'morph-led-project',
        sections: [{ ...sec('Hostile logos', 0, 4, 2, 500, 500, 32, 32, 0, 0, '#00f0ff'), logo: { asset_id: svg.id, position: 'center', scale: 0.3 } }],
        mesh_mode: 'combined',
        display: { content: 'panelIds', led_layout: 'single-dot', wireframe: false, show_frame: false, show_grid: true, show_safe_distance: false },
        assets: [
            asset('remote.png', 'image/png', 'https://logo.invalid/remote.png', Buffer.from('https://logo.invalid/remote.png')),
            asset('page.png', 'image/png', 'data:text/html;base64,PGI+eDwvYj4=', Buffer.from('<b>x</b>')),
            asset('truncated.png', 'image/png', 'data:image/png;base64,iVBORw0KGgo', Buffer.from('iVBORw0KGgo')),
            svg,
        ],
    };
}

// ---- scenario: p2_xss_names (B-M4, B-L8, B-L14, B-M2, B-L21) ---------------------------------

const XSS_CONFIG = {
    version: '1.0',
    sections: [
        sec('<b id="xss-probe">B</b>', 0, 2, 1, 500, 500, 32, 32, 0, 0, '#00f0ff'),
        sec('Say "hi"', 1, 2, 1, 500, 500, 32, 32, 0, 0, '#ff00aa'),
        sec('A B', 2, 2, 1, 500, 500, 32, 32, 0, 0, 'red;outline:3px solid lime'),
        sec('A_B', 3, 2, 1, 500, 500, 32, 32, 0, 0, '#00ff66'),
        sec('Dup', 4, 2, 1, 500, 500, 32, 32, 0, 0, '#ff6b35'),
        sec('Dup', 5, 2, 1, 500, 500, 32, 32, 0, 0, '#ffdd00'),
    ],
    mesh_mode: 'section',
};

async function xssNamesScenario(ctx) {
    const { app } = ctx;
    const probe = (name) => record(ctx, name, () => pageCall(app, pageXssProbe));
    await importCfg(ctx, 'import', XSS_CONFIG, 'xss_names.json');
    await record(ctx, 'sections_initial', () => app.sectionsSnapshot());
    await probe('xss_probe_00_initial');
    await step(ctx, 'panel-ids-on', () => app.click('#toggle-panel-ids'));
    await probe('xss_probe_01_panel_ids');
    await record(ctx, 'logos_01_panel_ids', () => pageCall(app, pageLogoList));
    // Live rename of the second card (index 1), one `input` event like a paste.
    await step(ctx, 'rename-card1', () => app.setValue(`${card(1)} .section-name-input`, '<i id="xss-probe2">i</i>', ['input']));
    await probe('xss_probe_02_renamed');
    await record(ctx, 'sections_renamed', () => app.sectionsSnapshot());
    await record(ctx, 'logos_02_renamed', () => pageCall(app, pageLogoList));
    await dl(ctx, 'section__export-obj', '#export-obj', OBJ_ZIP_DOWNLOAD);
    await dl(ctx, 'section__export-zip', '#export-zip', { expect: 1, timeoutMs: 120000, quietMs: 800 });
}

// ---- scenario: p2_zip_section_mode (B-M2, B-L7) ------------------------------------------------

async function zipSectionModeScenario(ctx) {
    const { app } = ctx;
    await importCfg(ctx, 'import', { ...CONFIGS.flat3, mesh_mode: 'section' }, 'flat3_section.json');
    await step(ctx, 'rename-center', () => app.setValue(`${card(1)} .section-name-input`, 'Center Stage', ['input']));
    await record(ctx, 'sections_renamed', () => app.sectionsSnapshot());
    await dl(ctx, 'section__export-obj', '#export-obj', OBJ_ZIP_DOWNLOAD);
    await dl(ctx, 'section__export-zip', '#export-zip', { expect: 1, timeoutMs: 120000, quietMs: 800 });
}

// ---- scenario: p2_curved_safe_distance (B-M15, B-L29, B-M1) ----------------------------------

/** One section, 6 x 4 panels of 500 mm, concave curve 30 degrees (r < D). */
const CONCAVE30 = { version: '1.0', sections: [sec('Concave 30', 0, 6, 4, 500, 500, 64, 64, 30, 0, '#ffdd00')], mesh_mode: 'combined' };

async function curvedSafeDistanceScenario(ctx) {
    const { app } = ctx;
    const walls = [
        ['concave_offsets', CONFIGS.concave_offsets],
        ['convex', CONFIGS.convex],
        ['box_corner', CONFIGS.box_corner],
        ['concave30', CONCAVE30],
    ];
    for (const [i, [wall, config]] of walls.entries()) {
        if (i > 0) await freshPage(ctx, wall);
        await importCfg(ctx, `${wall}_import`, config, `${wall}.json`);
        await step(ctx, `${wall}-preview-on`, () => app.click('#toggle-camera-preview'));
        await step(ctx, `${wall}-position`, async () => {
            await app.setValue('#camera-pos-x', '3');
            await app.setValue('#camera-pos-y', '1.5');
            await app.setValue('#camera-pos-z', '6');
        });
        await step(ctx, `${wall}-safe-distance-on`, () => app.click('#toggle-safe-distance'));
        await shot(ctx, wall);
        await dl(ctx, `${wall}__export-safe-distance`, '#export-safe-distance', { expect: 1, timeoutMs: 4000 });
    }
}

// ---- scenario: p2_zero_inputs (B-L9, B-L15, Q13) -----------------------------------------------

async function zeroInputsScenario(ctx) {
    const { app } = ctx;
    await step(ctx, 'preview-on', () => app.click('#toggle-camera-preview'));
    await step(ctx, 'camera-y-z-zero', async () => {
        await app.setValue('#camera-pos-y', '0');
        await app.setValue('#camera-pos-z', '0');
    });
    await record(ctx, 'camera_zero', () => app.cameraState());
    await step(ctx, 'card0-width-zero-cols-fraction', async () => {
        await app.setValue(field(0, 'panelWidth'), '0');
        await app.setValue(field(0, 'panelCols'), '2.5');
    });
    await record(ctx, 'sections_zero', () => app.sectionsSnapshot());
    await record(ctx, 'stats_zero', () => app.stats());
    await step(ctx, 'panel-ids-on-border-zero', async () => {
        await app.click('#toggle-panel-ids');
        await app.setValue('#panel-border-thickness', '0');
    });
    await record(ctx, 'ui_zero_border', () => app.uiState());
    await dl(ctx, 'combined__export-obj', '#export-obj', OBJ_ZIP_DOWNLOAD);
}

// ---- scenario: p2_oversize_canvas (B-L4) -------------------------------------------------------

/**
 * One section of 70 x 2 panels with 1000 x 64 LEDs each: a 70,000 x 128 px atlas and section texture. The harness
 * browser (Chrome 154) draws canvases up to 65,535 px per side and 268,435,456 px in area (measured), so the wall must
 * be wider than 65,535 px for the unfixed exports and viewport texture to fail there; a 50,000 px wall still renders
 * in Chrome (it fails only in browsers with the 32,767 px limit that 08 P2-1's guard uses).
 */
const OVERSIZE = { version: '1.0', sections: [sec('Oversize', 0, 70, 2, 500, 500, 1000, 64, 0, 0, '#00f0ff')], mesh_mode: 'section' };

async function oversizeCanvasScenario(ctx) {
    const { app } = ctx;
    await importCfg(ctx, 'import', OVERSIZE, 'oversize.json');
    await dl(ctx, 'section__export-panel-ids', '#export-panel-ids', { expect: 1, timeoutMs: 60000 });
    await dl(ctx, 'section__export-zip', '#export-zip', { expect: 1, timeoutMs: 60000, quietMs: 800 });
    await step(ctx, 'panel-ids-on', () => app.click('#toggle-panel-ids'));
    await shot(ctx, 'panel_ids_viewport');
}

// ---- scenario: p2_mixed_content (B-M5, B-L18) --------------------------------------------------

async function mixedContentScenario(ctx) {
    const { app } = ctx;
    await importCfg(ctx, 'import', CONFIGS.mixed, 'mixed.json');
    await step(ctx, 'ledsim-on', () => app.click('#toggle-led-sim'));
    await shot(ctx, 'ledsim_combined');
    await step(ctx, 'layout-square', () => app.setValue('#led-layout', 'square', ['change']));
    await shot(ctx, 'ledsim_square');
    await step(ctx, 'panel-ids-on', () => app.click('#toggle-panel-ids'));
    await shot(ctx, 'panel_ids_combined');
}

// ---- scenario: p2_shortcut_filters (B-L11, B-L25) ----------------------------------------------

async function shortcutFiltersScenario(ctx) {
    const { app } = ctx;
    const gizmo = (name) => record(ctx, name, async () => ({ gizmo: await app.gizmoState(), focus: await pageCall(app, pageActiveInfo, '#led-layout') }));

    // 1. `g` typed into a focused <select> (#led-layout is shown while the LED simulation is on).
    await step(ctx, 'ledsim-on', () => app.click('#toggle-led-sim'));
    await step(ctx, 'g-in-select', async () => {
        if (!await pageCall(app, pageFocus, '#led-layout')) throw new Error('could not focus #led-layout');
        await keyEvent(app, 'keyDown', 'g');
        await keyEvent(app, 'keyUp', 'g');
        await app.settle();
    });
    await gizmo('gizmo_01_g_in_select');

    // 2. Ctrl+G with nothing focused.
    await step(ctx, 'ctrl-g', async () => {
        await app.blurActive();
        await keyEvent(app, 'keyDown', 'Control', { modifiers: CTRL });
        await keyEvent(app, 'keyDown', 'g', { modifiers: CTRL });
        await keyEvent(app, 'keyUp', 'g', { modifiers: CTRL });
        await keyEvent(app, 'keyUp', 'Control');
        await app.settle();
    });
    await gizmo('gizmo_02_ctrl_g');

    // 3. `p` auto-repeated three times with the preview on.
    await step(ctx, 'preview-on', () => app.click('#toggle-camera-preview'));
    await step(ctx, 'p-autorepeat-x3', async () => {
        await app.blurActive();
        for (let i = 0; i < 3; i++) await keyEvent(app, 'keyDown', 'p', { autoRepeat: true });
        await keyEvent(app, 'keyUp', 'p');
        await app.settle();
    });
    await gizmo('gizmo_03_p_autorepeat');

    // 4. A view preset in pilot mode. Escape then one plain `p` enter pilot mode from either state of step 3.
    await step(ctx, 'enter-pilot', async () => {
        await app.blurActive();
        await app.keyPress('Escape');
        await app.keyPress('p');
    });
    await step(ctx, 'view-front-in-pilot', () => app.click('#view-front'));
    await shot(ctx, 'pilot_view_front');
    await gizmo('gizmo_04_view_front');
}

// ---- scenario: p2_project_v2 (B-L31, B-L35, B-L36; 08 sections 6.16, 6.17) -----------------------

async function projectV2Scenario(ctx) {
    const { app } = ctx;
    const preload = (a) => ui.preloadFonts(a);
    const camera = (name) => record(ctx, `camera_${name}`, () => app.cameraState());
    const uiState = (name) => record(ctx, `ui_${name}`, () => app.uiState());
    const aria = (name) => record(ctx, `toggle_aria_${name}`, () => pageCall(app, pageToggleAria));
    const logos = (name) => record(ctx, `logos_${name}`, () => pageCall(app, pageLogoList));
    const dialogs = (name) => record(ctx, `dialogs_${name}`, () => app.dialogs());
    const jsonText = (files) => (files.length && files[0].data.length ? files[0].data.toString('utf8') : null);

    // Every font face up front (before the first step), so web-font downloads never enter the request log.
    await preload(app);

    // 1. Camera: preview, custom filmback, focal length, pose, safe distance.
    await step(ctx, '01-camera', async () => {
        await app.click('#toggle-camera-preview');
        await app.setValue('#camera-filmback', 'custom', ['change']);
        await app.setValue('#filmback-width', '30');
        await app.setValue('#filmback-height', '20');
        await app.setValue('#camera-focal-length', '50');
        for (const [id, v] of [['pos-x', '2'], ['pos-y', '1.2'], ['pos-z', '4'], ['rot-x', '5'], ['rot-y', '-10'], ['rot-z', '2']]) {
            await app.setValue(`#camera-${id}`, v);
        }
        await app.click('#toggle-safe-distance');
    });
    await camera('01_setup');
    await aria('01_setup');

    // 2. Props: the person at (1, 3), rotated 45 degrees, scale 1.5; the car visible.
    await step(ctx, '02-props', async () => {
        await app.click('#toggle-person');
        await app.setValue('#person-pos-x', '1');
        await app.setValue('#person-pos-z', '3');
        await app.setValue('#person-rot-y', '45');
        await app.setValue('#person-scale', '1.5');
        await app.click('#toggle-car');
    });
    await uiState('02_props');
    await aria('02_props');

    // 3. Display: a second section (so that section 1 exists for the second logo), LED sim on then panel IDs on (the
    //    forced-off pair), panel-ID style, the PNG logo on section 0, the 2,000,000-byte noise BMP on section 1, wireframe.
    await step(ctx, '03-add-section', () => app.click('#add-section-btn'));
    await step(ctx, '03-ledsim-then-panel-ids', async () => {
        await app.click('#toggle-led-sim');
        await app.click('#toggle-panel-ids');
        await app.setValue('#panel-border-thickness', '12');
        await app.setValue('#panel-font-color', '#ff0000');
    });
    await uploadLogo(ctx, '03-logo-png-section0', 0, 'logo.png', Buffer.from(LOGO_PNG_BASE64, 'base64'));
    await uploadLogo(ctx, '03-logo-bmp-section1', 1, 'noise.bmp', noiseBmp());
    await step(ctx, '03-wireframe-on', () => app.click('#toggle-wireframe'));
    await uiState('03_display');
    await aria('03_display');
    await logos('03_uploaded');

    // 4. The first save.
    const first = await dl(ctx, 'v2_first__export-json', '#export-json');
    await dialogs('page1');

    // 5-6. A fresh page restores it; record the restored state, then save again.
    await freshPage(ctx, 'restore', preload);
    const firstText = jsonText(first);
    if (firstText) await importText(ctx, 'v2_first_import', firstText);
    await camera('06_restored');
    await uiState('06_restored');
    await aria('06_restored');
    await logos('06_restored');
    await shot(ctx, '06_restored');
    await dl(ctx, 'v2_second__export-json', '#export-json');

    // 7. Saved with the preview off, restored on a fresh page, then the preview turned on: the saved pose (Q19).
    await setToggle(ctx, '07-preview-off', '#toggle-camera-preview', false);
    await aria('07_preview_off');
    const off = await dl(ctx, 'v2_off__export-json', '#export-json');
    await dialogs('page2');
    await freshPage(ctx, 'restore-off', preload);
    const offText = jsonText(off);
    if (offText) await importText(ctx, 'v2_off_import', offText);
    await setToggle(ctx, '07-preview-on', '#toggle-camera-preview', true);
    await camera('07_reimported_preview_on');
    await aria('07_reimported_preview_on');

    // 8. A hostile inline v2 file: logos from an https:// URL, a data:text/html URI, malformed base64 and an active SVG.
    //    The stored SVG text is read from the Export All archive (storedSvgs: the DOM never shows a logo's bytes).
    await importText(ctx, 'v2_hostile_import', JSON.stringify(hostileV2File(), null, 2), 1);
    await dialogs('page3_after_hostile_import');
    await logos('08_hostile');
    await aria('08_hostile');
    await dl(ctx, 'combined__export-panel-ids', '#export-panel-ids', { expect: 1, timeoutMs: 60000 });
    const zip = await dl(ctx, 'combined__export-zip', '#export-zip', { expect: 1, timeoutMs: 120000, quietMs: 800 });
    await record(ctx, 'stored_svg_08_hostile', async () => storedSvgs(zip));
}

export const PHASE2_SCENARIOS = {
    p2_xss_names: {
        description: 'Phase 2 (B-M4, B-L8, B-L14, B-M2, B-L21): markup, quotes, spaces and duplicates in section names, a CSS-injecting colour; probes, rename, section-mode OBJ/MTL and ZIP.',
        run: xssNamesScenario,
    },
    p2_zip_section_mode: {
        description: 'Phase 2 (B-M2, B-L7): flat3 in section mode with a renamed section; MTL texture paths vs ZIP entries.',
        run: zipSectionModeScenario,
    },
    p2_curved_safe_distance: {
        description: 'Phase 2 (B-M15, B-L29, B-M1): the safe-distance floor on concave, convex, box-corner and a 30-degree concave wall; screenshot and Export Safe Distance OBJ each.',
        run: curvedSafeDistanceScenario,
    },
    p2_zero_inputs: {
        description: 'Phase 2 (B-L9, B-L15, Q13): zero camera Y/Z, zero panel width, fractional columns, zero border; states and combined OBJ.',
        run: zeroInputsScenario,
    },
    p2_oversize_canvas: {
        description: 'Phase 2 (B-L4): a 70,000 px wide wall (wider than the 65,535 px canvas limit of the harness browser); Export Panel IDs, Export All (ZIP) and the panel-ID viewport texture.',
        run: oversizeCanvasScenario,
    },
    p2_mixed_content: {
        description: 'Phase 2 (B-M5, B-L18): mixed section heights with LED sim (single dot, square) and panel IDs in combined mode.',
        run: mixedContentScenario,
    },
    p2_shortcut_filters: {
        description: 'Phase 2 (B-L11, B-L25): g in a focused select, Ctrl+G, auto-repeated p, a view preset in pilot mode.',
        run: shortcutFiltersScenario,
    },
    p2_project_v2: {
        description: 'Phase 2 (B-L31, B-L35, B-L36): full project save and restore (camera, props, display, panel-ID style, logos incl. a 2 MB BMP), preview-off save, hostile v2 logos and the stored SVG text; toggle_aria probes; records network.json.',
        run: projectV2Scenario,
        recordRequests: true,
    },
};
