// Feature golden-master scenarios: the wall pivot (docs/improvements/03-pivot.md 8.3; 03 T8, step E of 8.4). They are
// forward goldens, captured from the feature build once its acceptance criteria were checked by hand.
//
// Like the other scenario files, every scenario talks to the page ONLY through the DOM and the DevTools protocol: ids,
// classes and data attributes, clicks, value changes followed by `change` events, real CDP keys (O, R, Escape,
// ArrowDown) and mouse drags (AppPage.drag, with Ctrl held for snapping and an Escape before the release), the hidden
// #import-input file input. They never call app functions or read app globals.
//
// The pivot is session-only until project file v2 (the owner's decision of 2026-10-17; 03 header, "Sequencing"): an
// import resets it to the identity and Export JSON writes no pivot block. pivot_roundtrip and pivot_validation therefore
// record that behaviour (the v2 round trip and the v2 validator rows of 03 8.3 come with 03 T7); every other scenario is
// 03 8.3's.
//
// Conventions: export steps are labelled `<state>_<mesh mode>__<button>`, so the segment-agnostic patterns of 08 8.5
// (`**/*combined__export-*`, `**/*section__export-gltf__*`) cover these outputs too. Post-checks are recorded as
// `*_postcheck.json` states, so a regression shows up as a FAIL of that file.
//
// Exported as FEATURE_SCENARIOS ({ name: { description, run } }) and spread into SCENARIOS after the Phase 2 scenarios.
import { CONFIGS } from './configs.mjs';
import { decodePNG, readZip } from './lib/formats.mjs';
import { MODIFIERS, OBJ_ZIP_DOWNLOAD } from './lib/app.mjs';
import { isGizmoRed, locate, pageMeshModes, parkMouse } from './scenarios-extra.mjs';

const MODES = ['bottom-left', 'mesh-center', 'wall-center'];
/** The switch order of pivot_stage (03 8.3: bottom-left -> wall-center -> mesh-center). */
const STAGE_MODES = ['bottom-left', 'wall-center', 'mesh-center'];
const GLTF_DOWNLOAD = Object.freeze({ expect: 1, timeoutMs: 30000 });

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

/** Click `selector` and record every download it produces under `<name>__<filename>`. */
async function dl(ctx, name, selector, opts = {}) {
    let files = [];
    await step(ctx, name, async () => {
        files = await ctx.app.captureDownloads(() => ctx.app.click(selector), opts);
        ctx.rec.downloads(name, files);
    });
    return files;
}

/** Viewport screenshot clipped to #three-canvas; returns the PNG (or null). */
async function shot(ctx, name) {
    let png = null;
    await step(ctx, `shot:${name}`, async () => { png = await ctx.app.screenshotCanvas(); ctx.rec.screenshot(name, png); });
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

/** Press a key known to AppPage.keyPress with nothing focused. */
async function press(ctx, key, opts) {
    await step(ctx, `key:${key}`, async () => { await ctx.app.blurActive(); await ctx.app.keyPress(key, opts); });
}

/** A fresh page in the same tab. */
async function freshPage(ctx, label) {
    await step(ctx, `reload:${label}`, () => ctx.app.reload());
}

// ---- pivot actions and probes ------------------------------------------------------------------------------

/** Choose a pivot mode by clicking its radio card (the label; the radio's change event reaches the panel). */
const setMode = (ctx, mode) => step(ctx, `pivot-mode:${mode}`, () => ctx.app.click(`label.pivot-mode-option[data-pivot-mode="${mode}"]`));

/** Type a value into one offset input (change event), like a user. */
const setOffset = (ctx, axis, value) => step(ctx, `pivot-offset-${axis}:${value}`, () => ctx.app.setValue(`#pivot-offset-${axis}`, value, ['change']));

/** The Wall Pivot panel as the user sees it. */
function pagePivotState() {
    const $ = (id) => document.getElementById(id);
    const sw = (el) => (el ? { active: el.classList.contains('active'), ariaChecked: el.getAttribute('aria-checked') } : null);
    const readout = $('pivot-readout');
    const select = $('pivot-select');
    return {
        modes: [...document.querySelectorAll('#pivot-mode-select .pivot-mode-option')].map((label) => {
            const radio = label.querySelector('input');
            return { mode: label.getAttribute('data-pivot-mode'), active: label.classList.contains('active'), checked: !!(radio && radio.checked) };
        }),
        offsets: ['x', 'y', 'z'].map((a) => ($(`pivot-offset-${a}`) || {}).value ?? null),
        resetDisabled: $('pivot-reset-offset') ? $('pivot-reset-offset').disabled : null,
        select: select ? { active: select.classList.contains('active'), ariaPressed: select.getAttribute('aria-pressed') } : null,
        snap: ($('pivot-snap') || {}).value ?? null,
        keepStage: sw($('toggle-pivot-keep-stage')),
        marker: sw($('toggle-pivot-marker')),
        readout: readout ? { text: readout.textContent, warning: readout.classList.contains('pivot-warning') } : null,
        status: ($('pivot-status') || {}).textContent ?? null,
    };
}

/** The camera and prop inputs and the coverage read-outs that a pivot change can re-express or recompute. */
function pageStageState() {
    const $ = (id) => document.getElementById(id);
    const v = (id) => ($(id) || {}).value ?? null;
    const t = (id) => ($(id) || {}).textContent ?? null;
    const values = {};
    for (const id of ['camera-pos-x', 'camera-pos-y', 'camera-pos-z', 'camera-rot-x', 'camera-rot-y', 'camera-rot-z',
        'person-pos-x', 'person-pos-z', 'car-pos-x', 'car-pos-z']) values[id] = v(id);
    const texts = {};
    for (const id of ['frustum-width', 'frustum-height', 'frustum-status-text', 'safe-distance', 'camera-wall-distance',
        'pivot-status', 'pivot-readout']) texts[id] = t(id);
    return { values, texts, cameraPosZMin: $('camera-pos-z') ? $('camera-pos-z').getAttribute('min') : null };
}

/** Focus the checked pivot radio (keyboard access, 03 3.2) and report what has the focus. */
function pageFocusCheckedPivotRadio() {
    const r = document.querySelector('#pivot-mode-select input[name="pivot-mode"]:checked');
    if (r) r.focus();
    const a = document.activeElement;
    return { name: a ? a.getAttribute('name') : null, value: a ? a.value : null, type: a ? a.type : null };
}

/** The checked pivot radio. */
function pageCheckedPivotMode() {
    const r = document.querySelector('#pivot-mode-select input[name="pivot-mode"]:checked');
    return r ? r.value : null;
}

const pivotState = (app) => () => pageCall(app, pagePivotState);
const stageState = (app) => () => pageCall(app, pageStageState);

// ---- export parsing for the post-checks ----------------------------------------------------------------------

/** The `v` lines of the OBJ inside an Export OBJ ZIP download, as [x, y, z] numbers. */
function objVertices(files) {
    const zip = files.find((f) => f.filename.endsWith('.zip'));
    if (!zip) return null;
    const obj = readZip(zip.data).find((e) => e.name.endsWith('.obj'));
    if (!obj) return null;
    return obj.data.toString('utf8').split('\n').filter((l) => l.startsWith('v ')).map((l) => l.trim().split(/\s+/).slice(1, 4).map(Number));
}

/** Every POSITION value of an embedded-buffer glTF download, mesh by mesh, as float32 numbers [x, y, z]. */
function gltfPositions(files) {
    const f = files.find((x) => x.filename.endsWith('.gltf'));
    if (!f) return null;
    const gltf = JSON.parse(f.data.toString('utf8'));
    const buffers = gltf.buffers.map((b) => Buffer.from(b.uri.slice(b.uri.indexOf(',') + 1), 'base64'));
    const out = [];
    for (const mesh of gltf.meshes) {
        for (const prim of mesh.primitives) {
            const acc = gltf.accessors[prim.attributes.POSITION];
            const view = gltf.bufferViews[acc.bufferView];
            const buf = buffers[view.buffer];
            const base = buf.byteOffset + (view.byteOffset || 0) + (acc.byteOffset || 0);
            const stride = view.byteStride || 12;
            const dv = new DataView(buf.buffer);
            for (let i = 0; i < acc.count; i++) {
                const o = base + i * stride;
                out.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]);
            }
        }
    }
    return out;
}

/**
 * The offset post-check (03 AC 7): moving the pivot by delta moves every exported vertex by -delta. OBJ: within the
 * printed precision (two toFixed(6) roundings, 1e-6). glTF: within 2^-22 * max(1, |old|, |delta|) per component (two
 * float32 roundings). Reports the counts and the largest error of each, and ok.
 */
function offsetPostCheck(beforeObj, afterObj, beforeGltf, afterGltf, delta) {
    const check = (a, b, tol) => {
        if (!a || !b) return { ok: false, reason: 'missing export' };
        if (a.length !== b.length) return { ok: false, reason: `vertex counts ${a.length} vs ${b.length}` };
        let maxErr = 0, ok = true;
        for (let i = 0; i < a.length; i++) {
            for (let k = 0; k < 3; k++) {
                const err = Math.abs(b[i][k] - (a[i][k] - delta[k]));
                if (err > maxErr) maxErr = err;
                if (err > tol(a[i][k], delta[k])) ok = false;
            }
        }
        return { ok, count: a.length, maxErrBelow: ok ? 'tolerance' : maxErr };
    };
    return {
        delta,
        obj: check(beforeObj, afterObj, () => 1e-6),
        gltf: check(beforeGltf, afterGltf, (old, d) => 2 ** -22 * Math.max(1, Math.abs(old), Math.abs(d))),
    };
}

/** The harness screenshot rule (compare.mjs defaults: > 8 levels on > 0.5 % of the pixels is a FAIL). */
function screenshotVerdict(a, b) {
    if (!a || !b) return { verdict: 'MISSING' };
    const A = decodePNG(a), B = decodePNG(b);
    if (A.width !== B.width || A.height !== B.height) return { verdict: 'FAIL', reason: 'size' };
    let any = 0, over = 0, maxDiff = 0;
    for (let i = 0; i < A.rgba.length; i += 4) {
        const d = Math.max(Math.abs(A.rgba[i] - B.rgba[i]), Math.abs(A.rgba[i + 1] - B.rgba[i + 1]), Math.abs(A.rgba[i + 2] - B.rgba[i + 2]));
        if (d > 0) any++;
        if (d > 8) over++;
        if (d > maxDiff) maxDiff = d;
    }
    const verdict = any === 0 ? 'IDENTICAL' : over <= 0.005 * A.width * A.height ? (maxDiff <= 1 ? 'WARN (overlay-glyph jitter)' : 'WARN') : 'FAIL';
    return { verdict, pass: verdict !== 'FAIL' };
}

// ---- scenario: pivot_modes -------------------------------------------------------------------------------------

/**
 * Every pivot mode, then an offset of (0.5, 1, 2), on four walls (the default and three imported v1 configs): the
 * readout, the combined OBJ (ZIP) and the section glTF in the export frame, a screenshot; mixed also in every mesh mode
 * for the two centred modes. The offset post-check per wall, the mesh-mode cards untouched (pageMeshModes), and a final
 * Export JSON (no pivot block: session-only).
 */
async function pivotModesScenario(ctx) {
    const { app } = ctx;
    for (const key of ['default', 'concave_offsets', 'mixed', 'box_corner']) {
        if (key !== 'default') await importCfg(ctx, `${key}_import`, CONFIGS[key]);
        const exportsOf = {};
        const capture = async (label, meshModes) => {
            const state = `${key}_${label}`;
            await record(ctx, `${state}_pivot`, pivotState(app));
            for (const mode of meshModes) {
                await step(ctx, `${state}:mesh-${mode}`, () => app.selectMeshMode(mode));
                if (mode === 'combined' || meshModes.length > 2) {
                    const files = await dl(ctx, `${state}_${mode}__export-obj`, '#export-obj', OBJ_ZIP_DOWNLOAD);
                    if (mode === 'combined') exportsOf[`${label}:obj`] = files;
                }
                if (mode === 'section' || meshModes.length > 2) {
                    const files = await dl(ctx, `${state}_${mode}__export-gltf`, '#export-gltf', GLTF_DOWNLOAD);
                    if (mode === 'section') exportsOf[`${label}:gltf`] = files;
                }
            }
            await step(ctx, `${state}:mesh-combined`, () => app.selectMeshMode('combined'));
            await shot(ctx, state);
        };
        for (const mode of MODES) {
            await setMode(ctx, mode);
            const all = key === 'mixed' && mode !== 'bottom-left';
            await capture(mode, all ? ['combined', 'section', 'panel'] : ['combined', 'section']);
        }
        await setOffset(ctx, 'x', '0.5');
        await setOffset(ctx, 'y', '1');
        await setOffset(ctx, 'z', '2');
        await capture('wall-center_offset', ['combined', 'section']);
        await record(ctx, `${key}_offset_postcheck`, async () => offsetPostCheck(
            objVertices(exportsOf['wall-center:obj'] || []), objVertices(exportsOf['wall-center_offset:obj'] || []),
            gltfPositions(exportsOf['wall-center:gltf'] || []), gltfPositions(exportsOf['wall-center_offset:gltf'] || []),
            [0.5, 1, 2]));
    }
    await record(ctx, 'mesh_modes', () => pageCall(app, pageMeshModes));
    await dl(ctx, 'final__export-json', '#export-json');
}

// ---- scenario: pivot_stage -------------------------------------------------------------------------------------

/** The camera preview on (its Reset runs), Z Position 1.5, the person and the car on (03 6.8's re-expression example). */
async function stageSetup(ctx) {
    const { app } = ctx;
    await step(ctx, 'stage-setup', async () => {
        await app.click('#toggle-camera-preview');
        await app.settle();
        await app.setValue('#camera-pos-z', '1.5', ['change']);
        await app.click('#toggle-person');
        await app.click('#toggle-car');
        await app.settle();
    });
}

/**
 * Keep stage layout on, then (on a fresh page with the same setup) off: bottom-left -> wall-center -> mesh-center, each
 * with the camera and prop inputs, the coverage read-outs, "Distance to wall plane", the status and a screenshot (AC 5,
 * 6). Then, keep off and wall-center: Add Section (the wall-edit status, nothing re-expressed, AC 13); offset z = 2 and
 * the Z Position field: its min, a typed 0 and a typed -5 (AC 19, before step F).
 */
async function pivotStageScenario(ctx) {
    const { app } = ctx;
    for (const keep of ['keep_on', 'keep_off']) {
        if (keep === 'keep_off') {
            await freshPage(ctx, 'keep-off');
            await stageSetup(ctx);
            await step(ctx, 'keep-off', () => app.click('#toggle-pivot-keep-stage'));
            await record(ctx, 'keep_off_switch', pivotState(app));
        } else {
            await stageSetup(ctx);
        }
        for (const mode of STAGE_MODES) {
            if (mode !== 'bottom-left') await setMode(ctx, mode);
            await record(ctx, `${keep}_${mode}`, stageState(app));
            await shot(ctx, `${keep}_${mode}`);
        }
    }
    await setMode(ctx, 'wall-center');
    await step(ctx, 'add-section', () => app.click('#add-section-btn'));
    await record(ctx, 'add_section_wall-center', stageState(app));
    await shot(ctx, 'add_section_wall-center');
    await setOffset(ctx, 'z', '2');
    await record(ctx, 'offset_z2', stageState(app));
    await step(ctx, 'camera-z-0', () => app.setValue('#camera-pos-z', '0', ['change']));
    await record(ctx, 'camera_z_0', stageState(app));
    await step(ctx, 'camera-z-minus-5', () => app.setValue('#camera-pos-z', '-5', ['change']));
    await record(ctx, 'camera_z_minus_5', stageState(app));
}

// ---- scenario: pivot_gizmo -------------------------------------------------------------------------------------

/** Locate the pivot gizmo's X arrow (its tip: the right-most gizmo-red pixel, 03 8.3) and drag it by 120 px. */
async function dragPivotX(ctx, label, opts = {}) {
    const { app, rec } = ctx;
    let handle = null;
    await step(ctx, `drag:${label}`, async () => {
        await parkMouse(app);
        handle = await locate(app, isGizmoRed, { pick: 'maxX' });
        if (!handle) {
            rec.state(`${label}_handle`, { skipped: true, reason: 'gizmo X arrow not found in the canvas screenshot' });
            return;
        }
        rec.state(`${label}_handle`, { found: true });
        await app.drag(handle.x, handle.y, 10, 0, 12, typeof opts === 'function' ? opts(handle) : opts);
    });
    return handle;
}

/**
 * The pivot gizmo (03 8.3, AC 9-11, 18): offset z = 2 and the top view put the gizmo over the empty floor; O selects;
 * a 120 px X drag commits once (OBJ export); a Ctrl drag snaps the dragged distance and keeps the off-grid Y; Escape
 * during a drag (then two moves with the button held) cancels, keeps the selection and swallows the gesture (the
 * cancel_after screenshot equals cancel_before: the cancel post-check); a second Escape deselects; O then R shows
 * "translate only" and no handles; the checked radio takes the focus and ArrowDown changes the mode.
 */
async function pivotGizmoScenario(ctx) {
    const { app } = ctx;
    const both = async () => ({ gizmo: await app.gizmoState(), pivot: await pageCall(app, pagePivotState) });
    await setOffset(ctx, 'z', '2');
    await step(ctx, 'view-top', () => app.click('#view-top'));
    await press(ctx, 'o');
    await record(ctx, 'gizmo_00_selected', both);

    await dragPivotX(ctx, 'x_arrow');
    await record(ctx, 'gizmo_01_dragged', both);
    await shot(ctx, 'gizmo_01_dragged');
    await dl(ctx, 'gizmo_01_combined__export-obj', '#export-obj', OBJ_ZIP_DOWNLOAD);

    await setOffset(ctx, 'y', '0.123');
    await dragPivotX(ctx, 'x_arrow_ctrl', { modifiers: MODIFIERS.Ctrl });
    await record(ctx, 'gizmo_02_snapped', both);

    await step(ctx, 'park-before-cancel', () => parkMouse(app));
    const before = await shot(ctx, 'cancel_before');
    await dragPivotX(ctx, 'x_arrow_cancel', (h) => ({
        beforeRelease: async () => {
            await app.keyPress('Escape');
            await app.mouse('mouseMoved', h.x + 120 + 80, h.y, { button: 'left', buttons: 1 });
            await app.mouse('mouseMoved', h.x + 120 + 40, h.y, { button: 'left', buttons: 1 });
        },
    }));
    await record(ctx, 'gizmo_03_cancelled', both);
    await step(ctx, 'park-after-cancel', () => parkMouse(app));
    const after = await shot(ctx, 'cancel_after');
    await record(ctx, 'cancel_postcheck', async () => screenshotVerdict(before, after));

    await press(ctx, 'Escape');
    await record(ctx, 'gizmo_04_deselected', both);

    await press(ctx, 'o');
    await press(ctx, 'r');
    await record(ctx, 'gizmo_05_rotate', both);
    await step(ctx, 'park-rotate', () => parkMouse(app));
    await shot(ctx, 'gizmo_05_rotate');

    await record(ctx, 'focus_00_radio', () => pageCall(app, pageFocusCheckedPivotRadio));
    await step(ctx, 'key:ArrowDown', () => app.keyPress('ArrowDown'));
    await record(ctx, 'focus_01_arrow_down', async () => ({ checked: await pageCall(app, pageCheckedPivotMode), pivot: await pageCall(app, pagePivotState) }));
}

// ---- scenario: pivot_roundtrip (session-only) ------------------------------------------------------------------

/**
 * 03 8.3's round trip, while the pivot is session-only: an identity export, then wall-center + (0, 0, 2) with its
 * exports, Export JSON (v1: no pivot block), re-import it (the pivot resets to the identity, nothing re-expressed),
 * export again. The post-check: both JSON exports are identical, and the exports after the import equal the identity
 * exports (the same file always gives the same exports, 03 Q14).
 */
async function pivotRoundtripScenario(ctx) {
    const { app } = ctx;
    const text = (files, ext) => { const f = files.find((x) => x.filename.endsWith(ext)); return f ? f.data.toString('utf8') : null; };
    const objText = (files) => {
        const zip = files.find((f) => f.filename.endsWith('.zip'));
        const obj = zip ? readZip(zip.data).find((e) => e.name.endsWith('.obj')) : null;
        return obj ? obj.data.toString('utf8') : null;
    };
    const idObj = await dl(ctx, 'identity_combined__export-obj', '#export-obj', OBJ_ZIP_DOWNLOAD);
    const idGltf = await dl(ctx, 'identity_combined__export-gltf', '#export-gltf', GLTF_DOWNLOAD);
    await setMode(ctx, 'wall-center');
    await setOffset(ctx, 'z', '2');
    await record(ctx, 'rt_01_pivot', pivotState(app));
    await dl(ctx, 'rt_01_combined__export-obj', '#export-obj', OBJ_ZIP_DOWNLOAD);
    await dl(ctx, 'rt_01_combined__export-gltf', '#export-gltf', GLTF_DOWNLOAD);
    const json1 = await dl(ctx, 'rt_01__export-json', '#export-json');
    const exported = text(json1, '.json');
    if (exported) await importCfg(ctx, 'rt_reimport', JSON.parse(exported));
    await record(ctx, 'rt_02_pivot_after_import', pivotState(app));
    const obj2 = await dl(ctx, 'rt_02_combined__export-obj', '#export-obj', OBJ_ZIP_DOWNLOAD);
    const gltf2 = await dl(ctx, 'rt_02_combined__export-gltf', '#export-gltf', GLTF_DOWNLOAD);
    const json2 = await dl(ctx, 'rt_02__export-json', '#export-json');
    await record(ctx, 'rt_postcheck', async () => ({
        jsonHasPivotKey: exported ? Object.hasOwn(JSON.parse(exported), 'pivot') : null,
        jsonIdentical: text(json1, '.json') !== null && text(json1, '.json') === text(json2, '.json'),
        objAfterImportIsIdentity: objText(idObj) !== null && objText(idObj) === objText(obj2),
        gltfAfterImportIsIdentity: text(idGltf, '.gltf') !== null && text(idGltf, '.gltf') === text(gltf2, '.gltf'),
    }));
}

// ---- scenario: pivot_validation (session-only) -----------------------------------------------------------------

/**
 * 03 8.3's validation, while the pivot is session-only: a v1 file that carries a hand-written pivot block with invalid
 * values is imported over a non-identity pivot: the pivot resets to bottom-left / (0, 0, 0) / keep on, the file's block is
 * not applied (dialogs and console recorded). Then the offset typing of AC 8: abc, empty, 2000, 0.0004 and 0.
 */
async function pivotValidationScenario(ctx) {
    const { app } = ctx;
    await setMode(ctx, 'mesh-center');
    await setOffset(ctx, 'y', '3');
    await step(ctx, 'keep-off', () => app.click('#toggle-pivot-keep-stage'));
    const config = JSON.parse(JSON.stringify(CONFIGS.concave_offsets));
    config.pivot = { mode: 'middle', offset_m: { x: 'abc', y: 5000, z: -0.0004 }, keep_stage_layout: 'yes' };
    await importCfg(ctx, 'hand_edited_import', config);
    await record(ctx, 'after_import_pivot', pivotState(app));
    await record(ctx, 'after_import_dialogs', () => app.dialogs());
    const typed = {};
    for (const value of ['abc', '', '2000', '0.0004', '0']) {
        await setOffset(ctx, 'x', value);
        await step(ctx, `read:${value}`, async () => { typed[JSON.stringify(value)] = await app.eval(`document.getElementById('pivot-offset-x').value`); });
    }
    await record(ctx, 'offset_typing', async () => typed);
    await record(ctx, 'final_pivot', pivotState(app));
}

export const FEATURE_SCENARIOS = {
    pivot_modes: {
        description: '03 pivot: each mode and an offset on four walls: readout, OBJ/glTF in the export frame, screenshots, the offset post-check.',
        run: pivotModesScenario,
    },
    pivot_stage: {
        description: '03 pivot: keep stage layout on/off re-expression of camera and props, coverage, Distance to wall plane, wall edits, Z Position min.',
        run: pivotStageScenario,
    },
    pivot_gizmo: {
        description: '03 pivot: O, the X-arrow drag, Ctrl snapping, Escape cancel with gesture swallowing, rotate (translate only), radio focus.',
        run: pivotGizmoScenario,
    },
    pivot_roundtrip: {
        description: '03 pivot (session-only): Export JSON carries no pivot; a re-import resets it; the exports after it are the identity exports.',
        run: pivotRoundtripScenario,
    },
    pivot_validation: {
        description: '03 pivot (session-only): a hand-edited pivot block in a v1 file is not applied; the offset typing rules.',
        run: pivotValidationScenario,
    },
};
