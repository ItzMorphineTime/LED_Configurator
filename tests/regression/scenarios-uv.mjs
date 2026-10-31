// UV feature golden-master scenarios (docs/improvements/04-uvs-uv-editor.md 8.2; UV-16): the Combined layouts and the
// panel UV options (uv_layouts), UV transforms set through the viewer and their exports in every mesh mode
// (uv_transforms), the viewer's editing, undo and key scoping (uv_viewer) and the wall hover readout and double-click
// (uv_hover). Forward goldens captured from the feature build.
//
// Like the other scenario files, every scenario talks to the page ONLY through the DOM and the DevTools protocol: ids,
// classes and data attributes (the UV canvas publishes its island corners in data-island), clicks, value changes
// followed by `input` / `change` events, real CDP keys and mouse input, and #import-input. They never call app functions.
//
// Deviations from 04 8.2, both because of the owner's sequencing (project file v2, 04 UV-5c, is not built: UV state is
// session-only): uv_transforms sets its transforms through the viewer instead of importing a v2 file, and its JSON
// "round trip" records that Export JSON carries no UV state and that a re-import starts from the identity. The screenshot
// pairs of 04's criteria 4 and 19 are judged in place (`*_pair` states with the pair-diff thresholds: more than 8 levels
// on at most 0.5 % of the pixels) instead of by a separate tools/pair-diff.mjs. Without spec 02 there is no uv_select.
//
// Exported as UV_SCENARIOS ({ name: { description, run } }) and spread into SCENARIOS after the feature scenarios.
import { CONFIGS } from './configs.mjs';
import { decodePNG, readZip } from './lib/formats.mjs';
import { MODIFIERS, OBJ_ZIP_DOWNLOAD } from './lib/app.mjs';

const GLTF_DOWNLOAD = Object.freeze({ expect: 1, timeoutMs: 30000 });
const ZIP_DOWNLOAD = Object.freeze({ expect: 1, timeoutMs: 120000, quietMs: 800 });

// ---- helpers (the semantics of the other scenario files) ----------------------------------------------------------

/** Run one step; a harness-level failure is recorded as an error (and fails comparison) instead of aborting. */
async function step(ctx, name, fn) {
    ctx.app.step = name;
    try {
        await fn();
    } catch (e) {
        ctx.app.errors.push({ kind: 'harness', step: name, message: String(e && e.message || e).split('\n')[0], raw: String(e && e.stack || e) });
    }
}

/** Click `selector` and record every download it produces under `<name>__<filename>`. */
async function dl(ctx, name, selector, opts = {}) {
    let files = [];
    await step(ctx, name, async () => {
        files = await ctx.app.captureDownloads(() => ctx.app.click(selector), opts);
        ctx.rec.downloads(name, files);
    });
    return files;
}

/** A screenshot of `selector` (the 3D canvas by default); returns the PNG (or null). */
async function shot(ctx, name, selector = '#three-canvas') {
    let png = null;
    await step(ctx, `shot:${name}`, async () => { png = await ctx.app.screenshotElement(selector); ctx.rec.screenshot(name, png); });
    return png;
}

/** Record the value of `probe()` as the state file `<name>.json`. */
async function record(ctx, name, probe) {
    await step(ctx, `state:${name}`, async () => ctx.rec.state(name, await probe()));
}

/** Evaluate a self-contained page function (serialised with toString) with JSON arguments. */
function pageCall(app, fn, ...args) {
    return app.eval(`(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(', ')})`, 30000);
}

/** Import a config object through #import-input; the import must apply. */
async function importCfg(ctx, label, config) {
    await step(ctx, label, async () => {
        const r = await ctx.app.importConfig(config, `${label}.json`);
        ctx.rec.state(`${label}_result`, r);
        if (!r.ok) throw new Error('import did not apply: ' + JSON.stringify(r));
    });
}

/** A real key press with nothing focused (AppPage.keyPress). */
async function press(ctx, key, opts) {
    await step(ctx, `key:${key}`, async () => { await ctx.app.blurActive(); await ctx.app.keyPress(key, opts); });
}

/** A real key press on the focused element (focus is set by the caller). */
async function pressFocused(ctx, key, opts) {
    await step(ctx, `key-focused:${key}`, () => ctx.app.keyPress(key, opts));
}

/** Focus an element through the DOM (el.focus()). */
const focus = (ctx, selector) => step(ctx, `focus:${selector}`, () => ctx.app.eval(`(() => { document.querySelector(${JSON.stringify(selector)}).focus(); return document.activeElement && document.activeElement.id; })()`));

/**
 * The pair-diff verdict of 04 8.2 (criteria 4 and 19): the share of pixels differing by more than 8 levels, which must
 * be at most 0.5 %.
 */
function pairVerdict(a, b) {
    if (!a || !b) return { verdict: 'MISSING' };
    const A = decodePNG(a), B = decodePNG(b);
    if (A.width !== B.width || A.height !== B.height) return { verdict: 'FAIL', reason: 'size' };
    let over = 0;
    let any = 0;
    for (let i = 0; i < A.rgba.length; i += 4) {
        const d = Math.max(Math.abs(A.rgba[i] - B.rgba[i]), Math.abs(A.rgba[i + 1] - B.rgba[i + 1]), Math.abs(A.rgba[i + 2] - B.rgba[i + 2]));
        if (d > 0) any++;
        if (d > 8) over++;
    }
    const percent = Math.round((over / (A.width * A.height)) * 1e4) / 1e2;
    const verdict = any === 0 ? 'IDENTICAL' : percent <= 0.5 ? 'PASS' : 'FAIL';
    return { verdict, overPercent: percent, pass: verdict !== 'FAIL' };
}

/** Page function: the viewer's observable state. */
function pageViewerState() {
    const $ = (id) => document.getElementById(id);
    const panel = $('uv-viewer');
    const sel = $('uv-viewer-section');
    const btn = $('toggle-uv-viewer');
    return {
        visible: !!panel && !panel.hidden,
        button: btn ? { active: btn.classList.contains('active'), pressed: btn.getAttribute('aria-pressed') } : null,
        header: $('uv-viewer-name') ? $('uv-viewer-name').textContent : null,
        section: sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : null,
        sections: sel ? [...sel.options].map((o) => o.textContent) : [],
        background: $('uv-viewer-background') ? $('uv-viewer-background').value : null,
        message: $('uv-viewer-message') && !$('uv-viewer-message').hidden ? $('uv-viewer-message').textContent : null,
        fields: ['uv-offset-u', 'uv-offset-v', 'uv-scale-u', 'uv-scale-v', 'uv-rotation'].map((id) => ($(id) ? $(id).value : null)),
        flips: ['uv-flip-u', 'uv-flip-v'].map((id) => ($(id) ? $(id).getAttribute('aria-pressed') : null)),
        source: ['uv-source-wh', 'uv-source-hw'].map((id) => ($(id) ? `${$(id).textContent}:${$(id).getAttribute('aria-pressed')}` : null)),
        undo: $('uv-undo') ? { disabled: $('uv-undo').disabled, title: $('uv-undo').title } : null,
        redo: $('uv-redo') ? { disabled: $('uv-redo').disabled, title: $('uv-redo').title } : null,
        chips: $('uv-status') ? [...$('uv-status').querySelectorAll('.uv-chip')].map((c) => c.textContent) : [],
        readout: $('uv-readout') ? $('uv-readout').textContent : null,
        island: $('uv-viewer-canvas') ? $('uv-viewer-canvas').dataset.island || null : null,
    };
}

/** Page function: every card's UV summary and the sidebar UV options. */
function pageUvSidebar() {
    const $ = (id) => document.getElementById(id);
    return {
        summaries: [...document.querySelectorAll('.section-uv-summary')].map((e) => e.textContent),
        combinedLayout: $('uv-combined-layout') ? $('uv-combined-layout').value : null,
        panelUvs: $('uv-panel-mode') ? $('uv-panel-mode').value : null,
        gltfUv1: $('uv-gltf-uv1') ? { checked: $('uv-gltf-uv1').checked, disabled: $('uv-gltf-uv1').disabled } : null,
        atlasNote: $('uv-atlas-note') ? [...$('uv-atlas-note').children].map((e) => e.textContent) : null,
    };
}

/** Page function: a handle's client position from the canvas's data-island (BL, BR, TR, TL; CSS px in the canvas). */
function pageIslandPoint(handle) {
    const c = document.getElementById('uv-viewer-canvas');
    const r = c.getBoundingClientRect();
    const pts = JSON.parse(c.dataset.island);
    const k = { bl: 0, br: 1, tr: 2, tl: 3 }[handle];
    if (k !== undefined) return { x: Math.round(r.left + pts[k][0]), y: Math.round(r.top + pts[k][1]) };
    return { x: Math.round(r.left + (pts[0][0] + pts[2][0]) / 2), y: Math.round(r.top + (pts[0][1] + pts[2][1]) / 2) };
}

/** Page function: the viewer's section dropdown set to the option with this text (change event). */
function pageViewSection(name) {
    const sel = document.getElementById('uv-viewer-section');
    const opt = [...sel.options].find((o) => o.textContent === name);
    if (!opt) return false;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

const viewerState = (app) => () => pageCall(app, pageViewerState);
const sidebarState = (app) => () => pageCall(app, pageUvSidebar);
const openViewer = (ctx) => step(ctx, 'open-viewer', async () => {
    if (!(await pageCall(ctx.app, pageViewerState)).visible) await ctx.app.click('#toggle-uv-viewer');
});
const closeViewer = (ctx) => step(ctx, 'close-viewer', async () => {
    if ((await pageCall(ctx.app, pageViewerState)).visible) await ctx.app.click('#toggle-uv-viewer');
});
const viewSection = (ctx, name) => step(ctx, `view-section:${name}`, async () => {
    if (!(await pageCall(ctx.app, pageViewSection, name))) throw new Error('no viewer option ' + name);
    await ctx.app.settle();
});

/** Export OBJ (one ZIP) and glTF under `<label>_<mode>__…`. */
async function exportsOf(ctx, label, mode) {
    const obj = await dl(ctx, `${label}_${mode}__export-obj`, '#export-obj', OBJ_ZIP_DOWNLOAD);
    const gltf = await dl(ctx, `${label}_${mode}__export-gltf`, '#export-gltf', GLTF_DOWNLOAD);
    return { obj, gltf };
}

// ---- scenario: uv_layouts -------------------------------------------------------------------------------------------

/**
 * mixed: the two Combined layouts (panel IDs: screenshot, OBJ, glTF, ZIP), Section mode with panel IDs (criterion 4:
 * the per-section Combined shot equals it), then Panel mode with section-space and per-panel UVs (screenshot, OBJ,
 * glTF; LED simulation for each, criterion 19: identical).
 */
async function uvLayoutsScenario(ctx) {
    const { app } = ctx;
    await importCfg(ctx, 'mixed_import', CONFIGS.mixed);
    await step(ctx, 'panel-ids-on', () => app.click('#toggle-panel-ids'));
    await step(ctx, 'mesh-combined', () => app.selectMeshMode('combined'));
    const shots = {};
    for (const layout of ['per-section', 'atlas']) {
        await step(ctx, `layout:${layout}`, () => app.setValue('#uv-combined-layout', layout, ['change']));
        await record(ctx, `${layout}_sidebar`, sidebarState(app));
        shots[layout] = await shot(ctx, `${layout}_combined`);
        await exportsOf(ctx, layout, 'combined');
        await dl(ctx, `${layout}_combined__export-zip`, '#export-zip', ZIP_DOWNLOAD);
    }
    await step(ctx, 'layout:per-section-again', () => app.setValue('#uv-combined-layout', 'per-section', ['change']));
    await step(ctx, 'mesh-section', () => app.selectMeshMode('section'));
    shots.section = await shot(ctx, 'section_mode');
    await record(ctx, 'criterion4_pair', async () => pairVerdict(shots['per-section'], shots.section));
    await step(ctx, 'mesh-panel', () => app.selectMeshMode('panel'));
    const led = {};
    for (const mode of ['section', 'panel']) {
        await step(ctx, `panel-uvs:${mode}`, () => app.setValue('#uv-panel-mode', mode, ['change']));
        await shot(ctx, `panel_uvs_${mode}`);
        await exportsOf(ctx, `panel_uvs_${mode}`, 'panel');
        await step(ctx, `led-on:${mode}`, () => app.click('#toggle-led-sim'));
        led[mode] = await shot(ctx, `panel_uvs_${mode}_ledsim`);
        await step(ctx, `panel-ids-back:${mode}`, () => app.click('#toggle-panel-ids'));
    }
    await record(ctx, 'criterion19_panel_ledsim_pair', async () => pairVerdict(led.section, led.panel));
    await record(ctx, 'final_sidebar', sidebarState(app));
}

// ---- scenario: uv_transforms -----------------------------------------------------------------------------------------

/**
 * flat3: through the viewer, Flip U on Left, a feed turn on Center (90°, Source rotated) and Offset U 0.25 with Scale
 * 50 % on Right; the summaries, then per mesh mode the OBJ and glTF and a panel-ID screenshot; LED simulation with the
 * transforms and after Reset on each section (criterion 19: identical); Export JSON (no UV state: session-only) and its
 * re-import (every section back to the identity).
 */
async function uvTransformsScenario(ctx) {
    const { app } = ctx;
    await importCfg(ctx, 'flat3_import', CONFIGS.flat3);
    await step(ctx, 'panel-ids-on', () => app.click('#toggle-panel-ids'));
    await openViewer(ctx);
    await viewSection(ctx, 'Left');
    await step(ctx, 'left:flip-u', () => app.click('#uv-flip-u'));
    await viewSection(ctx, 'Center');
    await step(ctx, 'center:turn-cw', () => app.click('#uv-rot-cw'));
    await viewSection(ctx, 'Right');
    await step(ctx, 'right:offset-u', () => app.setValue('#uv-offset-u', '0.25'));
    await step(ctx, 'right:scale', () => app.setValue('#uv-scale-u', '50'));
    await record(ctx, 'transforms_viewer', viewerState(app));
    await record(ctx, 'transforms_sidebar', sidebarState(app));
    await closeViewer(ctx);
    for (const mode of ['combined', 'section', 'panel']) {
        await step(ctx, `mesh-${mode}`, () => app.selectMeshMode(mode));
        await shot(ctx, `transforms_${mode}`);
        await exportsOf(ctx, 'transforms', mode);
    }
    await step(ctx, 'mesh-section-again', () => app.selectMeshMode('section'));
    await step(ctx, 'led-on', () => app.click('#toggle-led-sim'));
    const ledWith = await shot(ctx, 'transforms_ledsim');
    await openViewer(ctx);
    for (const name of ['Left', 'Center', 'Right']) {
        await viewSection(ctx, name);
        await step(ctx, `${name}:reset`, () => app.click('#uv-preset-reset'));
    }
    await closeViewer(ctx);
    const ledWithout = await shot(ctx, 'reset_ledsim');
    await record(ctx, 'criterion19_ledsim_pair', async () => pairVerdict(ledWith, ledWithout));
    await record(ctx, 'reset_sidebar', sidebarState(app));
    // session-only (04 UV-5c not built): the JSON holds no UV state, and a re-import starts from the identity
    await openViewer(ctx);
    await step(ctx, 'left:flip-v', () => app.click('#uv-flip-v'));
    await closeViewer(ctx);
    const json = await dl(ctx, 'session_only__export-json', '#export-json');
    await record(ctx, 'session_only_json_check', async () => {
        const text = json[0] ? Buffer.from(json[0].data).toString('utf8') : '';
        return { hasUvKeys: /"uv(_transform)?"\s*:|"pixel_map"/.test(text), bytes: text.length };
    });
    await importCfg(ctx, 'flat3_reimport', CONFIGS.flat3);
    await record(ctx, 'reimport_sidebar', sidebarState(app));
}

// ---- scenario: uv_viewer --------------------------------------------------------------------------------------------

/**
 * The default wall: U opens the viewer; an Offset U field commit, Flip U and a drag of the BR handle by (-40, 0) px; the
 * summary, fields and undo title; OBJ; three Ctrl+Z on the canvas give the pre-edit OBJ again; typing "0.1" into
 * Offset U previews then commits (no Reset from "0"), U typed there does not toggle; a W held on the canvas does not
 * orbit; in pilot mode U does nothing.
 */
async function uvViewerScenario(ctx) {
    const { app } = ctx;
    const before = await dl(ctx, 'initial_section__export-obj', '#export-obj', OBJ_ZIP_DOWNLOAD);
    await press(ctx, 'u');
    await record(ctx, 'opened', viewerState(app));
    await shot(ctx, 'viewer_canvas', '#uv-viewer-canvas');
    await step(ctx, 'offset-u', () => app.setValue('#uv-offset-u', '0.1'));
    await step(ctx, 'flip-u', () => app.click('#uv-flip-u'));
    await step(ctx, 'drag-br', async () => {
        const p = await pageCall(app, pageIslandPoint, 'br');
        await app.drag(p.x, p.y, -10, 0, 4);
    });
    await record(ctx, 'edited', viewerState(app));
    await record(ctx, 'edited_sidebar', sidebarState(app));
    await shot(ctx, 'edited_viewer', '#uv-viewer');
    await dl(ctx, 'edited_section__export-obj', '#export-obj', OBJ_ZIP_DOWNLOAD);
    await focus(ctx, '#uv-viewer-canvas');
    for (let k = 0; k < 3; k++) await pressFocused(ctx, 'z', { modifiers: MODIFIERS.Ctrl });
    await record(ctx, 'undone', viewerState(app));
    const after = await dl(ctx, 'undone_section__export-obj', '#export-obj', OBJ_ZIP_DOWNLOAD);
    await record(ctx, 'undo_postcheck', async () => {
        // the OBJ and MTL text inside the ZIPs (the archives themselves carry their creation time)
        const texts = (files) => {
            const zip = files.find((f) => f.filename.endsWith('.zip'));
            if (!zip) return null;
            return readZip(zip.data).filter((e) => /\.(obj|mtl)$/.test(e.name)).map((e) => `${e.name}\n${e.data.toString('utf8')}`).join('\n');
        };
        const a = texts(before);
        return { sameAsInitial: a !== null && a === texts(after) };
    });
    await pressFocused(ctx, 'Escape');
    // typing: digits and "." go into the field (no Reset from "0"); U typed there does not toggle the viewer
    await step(ctx, 'clear-offset', () => app.setValue('#uv-offset-u', '', []));
    await focus(ctx, '#uv-offset-u');
    for (const key of ['0', '.', '1']) await pressFocused(ctx, key);
    await pressFocused(ctx, 'u');
    await record(ctx, 'typed', viewerState(app));
    await step(ctx, 'blur-commit', async () => { await app.blurActive(); await app.settle(); });
    await record(ctx, 'typed_committed', viewerState(app));
    await record(ctx, 'typed_sidebar', sidebarState(app));
    // a held W on the canvas never reaches the orbit keys
    await focus(ctx, '#uv-viewer-canvas');
    const still = await shot(ctx, 'w_before');
    await step(ctx, 'hold-w', async () => {
        const base = { key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 };
        await app.page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: 'w', unmodifiedText: 'w' });
        await app.settle(400);
        await app.page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
        await app.settle();
    });
    const moved = await shot(ctx, 'w_after');
    await record(ctx, 'w_postcheck', async () => pairVerdict(still, moved));
    // pilot guard: U does nothing in pilot mode
    await closeViewer(ctx);
    await step(ctx, 'preview-on', () => app.click('#toggle-camera-preview'));
    await press(ctx, 'p');
    await press(ctx, 'u');
    await record(ctx, 'pilot_u', viewerState(app));
    await press(ctx, 'p');
    await step(ctx, 'preview-off', () => app.click('#toggle-camera-preview'));
    await press(ctx, 'u');
    await record(ctx, 'reopened', viewerState(app));
}

// ---- scenario: uv_hover ---------------------------------------------------------------------------------------------

/**
 * The default wall with the viewer open: the readout of the reset view's centre (only the section name and Panel C2
 * are asserted: the centre lies on a pixel boundary, 04 6.9); then flat3 and a double-click on its middle section
 * opens it in the viewer (no spec 02).
 */
async function uvHoverScenario(ctx) {
    const { app } = ctx;
    await step(ctx, 'view-reset', () => app.click('#view-reset'));
    await press(ctx, 'u');
    await step(ctx, 'hover-centre', async () => {
        const r = await app.canvasRect();
        await app.mouse('mouseMoved', Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2));
        await app.settle(200);
    });
    await record(ctx, 'centre_readout', async () => {
        const s = await pageCall(app, pageViewerState);
        const first = (s.readout || '').split('\n')[0];
        return { firstLine: first.split(' · LED')[0] };
    });
    await importCfg(ctx, 'flat3_import', CONFIGS.flat3);
    await step(ctx, 'view-reset-flat3', () => app.click('#view-reset'));
    await viewSection(ctx, 'Left');
    await step(ctx, 'dblclick-middle', async () => {
        const r = await app.canvasRect();
        const x = Math.round(r.x + r.w / 2);
        const y = Math.round(r.y + r.h / 2);
        await app.mouse('mouseMoved', x, y);
        for (const clickCount of [1, 2]) {
            await app.mouse('mousePressed', x, y, { clickCount });
            await app.mouse('mouseReleased', x, y, { clickCount });
        }
        await app.settle(200);
    });
    await record(ctx, 'dblclick_viewer', async () => {
        const s = await pageCall(app, pageViewerState);
        return { visible: s.visible, section: s.section, header: s.header };
    });
}

export const UV_SCENARIOS = {
    uv_layouts: {
        description: '04 UVs: the Combined per-section and atlas layouts, Section mode, and Panel mode with section-space and per-panel UVs (screenshots, OBJ, glTF, ZIP, the criterion 4 and 19 pairs).',
        run: uvLayoutsScenario,
    },
    uv_transforms: {
        description: '04 UVs: Flip U, a feed turn and offset/scale set in the viewer on flat3; exports and screenshots in every mesh mode; LED sim ignores them; session-only JSON.',
        run: uvTransformsScenario,
    },
    uv_viewer: {
        description: '04 UV viewer: U, a field commit, Flip U, a handle drag, Ctrl+Z x3 (the pre-edit OBJ again), typing scope, a held W, the pilot guard.',
        run: uvViewerScenario,
    },
    uv_hover: {
        description: '04 UV viewer: the wall hover readout at the reset view centre (C2) and a double-click on flat3\'s middle section.',
        run: uvHoverScenario,
    },
};
