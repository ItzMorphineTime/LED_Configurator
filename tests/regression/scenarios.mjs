// Golden-master scenarios. Each scenario starts from a fresh page load and drives the app
// ONLY through the DOM. Every observation is written through the Recorder.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIGS } from './configs.mjs';
import { decodePNG, readZip } from './lib/formats.mjs';
import * as ui from './lib/uiprobe.mjs';
import { OBJ_ZIP_DOWNLOAD } from './lib/app.mjs';
import { EXTRA_SCENARIOS } from './scenarios-extra.mjs';
import { PHASE2_SCENARIOS } from './scenarios-phase2.mjs';
import { FEATURE_SCENARIOS } from './scenarios-features.mjs';
import { PLATFORM_SCENARIOS } from './scenarios-platform.mjs';

const MODES = ['combined', 'section', 'panel'];
const card = (i) => `#wall-sections > :nth-child(${i + 1})`;
const field = (i, f) => `${card(i)} input[data-field="${f}"]`;

/** Run one step; a harness-level failure is recorded as an error (and fails comparison) instead of aborting. */
async function step(ctx, name, fn) {
    ctx.app.step = name;
    try {
        await fn();
    } catch (e) {
        ctx.app.errors.push({ kind: 'harness', step: name, message: String(e && e.message || e).split('\n')[0], raw: String(e && e.stack || e) });
    }
}

async function dl(ctx, name, selector, opts = {}) {
    let files = [];
    await step(ctx, name, async () => {
        files = await ctx.app.captureDownloads(() => ctx.app.click(selector), opts);
        ctx.rec.downloads(name, files);
    });
    return files;
}

async function shot(ctx, name) {
    await step(ctx, `shot:${name}`, async () => ctx.rec.screenshot(name, await ctx.app.screenshotCanvas()));
}

async function importCfg(ctx, key, config = CONFIGS[key], label = 'import') {
    await step(ctx, label, async () => {
        const r = await ctx.app.importConfig(config, `${key}.json`);
        ctx.rec.state(`${label}_result`, r);
        if (!r.ok) throw new Error('import did not apply: ' + JSON.stringify(r));
    });
}

const jsonOf = (files, name) => {
    const f = files.find((x) => x.filename.endsWith(name));
    return f ? JSON.parse(f.data.toString('utf8')) : null;
};

/**
 * Standard per-config capture:
 *   stats / mesh-mode radio state / section cards after import, Export JSON,
 *   for each mesh mode: Export OBJ (one ZIP since 08 P2-6e: OBJ, MTL, the textures the MTL references), Export glTF,
 *   then (back in combined mode) Panel IDs on (+ optional styling), Export Panel IDs PNG,
 *   Export All ZIP, Export JSON, final stats.
 */
async function configCapture(ctx, { configKey = null, panelIdStyle = null, zipJsonRoundTrip = false } = {}) {
    const { app, rec } = ctx;
    if (configKey) await importCfg(ctx, configKey);
    await step(ctx, 'initial-state', async () => {
        rec.state('stats_initial', await app.stats());
        rec.state('mesh_mode_initial', await app.meshModeState());
        rec.state('sections_initial', await app.sectionsSnapshot());
    });
    await dl(ctx, 'initial__export-json', '#export-json');
    for (const mode of MODES) {
        await step(ctx, `select-mode-${mode}`, async () => {
            await app.selectMeshMode(mode);
            rec.state(`${mode}__mesh_mode`, await app.meshModeState());
        });
        await dl(ctx, `${mode}__export-obj`, '#export-obj', OBJ_ZIP_DOWNLOAD);
        await dl(ctx, `${mode}__export-gltf`, '#export-gltf', { expect: 1, timeoutMs: 30000 });
    }
    await step(ctx, 'panel-ids-on', async () => {
        await app.selectMeshMode('combined');
        await app.click('#toggle-panel-ids');
        if (panelIdStyle) await panelIdStyle(app);
        rec.state('ui_panel_ids', await app.uiState());
    });
    await shot(ctx, 'panel_ids_combined');
    await dl(ctx, 'final__export-panel-ids', '#export-panel-ids', { expect: 1, timeoutMs: 60000 });
    const zipFiles = await dl(ctx, 'final__export-zip', '#export-zip', { expect: 1, timeoutMs: 120000, quietMs: 800 });
    const jsonFiles = await dl(ctx, 'final__export-json', '#export-json');
    await step(ctx, 'final-state', async () => rec.state('stats_final', await app.stats()));

    // Round trip: re-import the app's own exported JSON and export again.
    const exported = jsonOf(jsonFiles, '.json');
    if (exported) {
        await importCfg(ctx, 'roundtrip', exported, 'roundtrip_import');
        await dl(ctx, 'roundtrip__export-json', '#export-json');
    }
    // Optional: re-import the JSON that is embedded in the ZIP export.
    if (zipJsonRoundTrip && zipFiles.length) {
        await step(ctx, 'zip-json-extract', async () => {
            const entry = readZip(zipFiles[0].data).find((e) => e.name.endsWith('.json'));
            if (!entry) throw new Error('no JSON entry in ZIP');
            ctx.zipJson = JSON.parse(entry.data.toString('utf8'));
        });
        if (ctx.zipJson) {
            await importCfg(ctx, 'zipjson', ctx.zipJson, 'zipjson_import');
            await dl(ctx, 'zipjson_roundtrip__export-json', '#export-json');
        }
    }
}

// --- Scenario implementations -------------------------------------------------------------

async function cameraScenario(ctx) {
    const { app, rec } = ctx;
    await importCfg(ctx, 'flat3');
    const cam = async (name) => step(ctx, `cam:${name}`, async () => rec.state(`cam_${name}`, await app.cameraState()));
    await cam('00_disabled');
    await step(ctx, 'enable-preview', () => app.click('#toggle-camera-preview'));
    await cam('01_enabled');
    await shot(ctx, '01_camera_enabled');
    await step(ctx, 'filmback-super35', () => app.setValue('#camera-filmback', 'super35', ['change']));
    await cam('02_super35');
    await step(ctx, 'filmback-custom', () => app.setValue('#camera-filmback', 'custom', ['change']));
    await cam('03_custom');
    await step(ctx, 'filmback-wh', async () => {
        await app.setValue('#filmback-width', '30');
        await app.setValue('#filmback-height', '20');
    });
    await cam('04_custom_30x20');
    await step(ctx, 'focal-50', () => app.setValue('#camera-focal-length', '50'));
    await cam('05_focal_50');
    await step(ctx, 'focal-5-clamped', () => app.setValue('#camera-focal-length', '5'));
    await cam('06_focal_5_clamped');
    await step(ctx, 'focal-35', () => app.setValue('#camera-focal-length', '35'));
    await step(ctx, 'position', async () => {
        await app.setValue('#camera-pos-x', '2.5');
        await app.setValue('#camera-pos-y', '1.8');
        await app.setValue('#camera-pos-z', '4');
    });
    await cam('07_position');
    await step(ctx, 'rotation', async () => {
        await app.setValue('#camera-rot-x', '5');
        await app.setValue('#camera-rot-y', '-10');
        await app.setValue('#camera-rot-z', '2');
    });
    await cam('08_rotation');
    await shot(ctx, '08_camera_moved');
    await step(ctx, 'far-away', () => app.setValue('#camera-pos-z', '20'));
    await cam('09_far');
    await step(ctx, 'within-bounds', async () => {
        await app.setValue('#camera-rot-x', '0');
        await app.setValue('#camera-rot-y', '0');
        await app.setValue('#camera-rot-z', '0');
        await app.setValue('#camera-pos-x', '3.5');
        await app.setValue('#camera-pos-y', '0.75');
        await app.setValue('#camera-pos-z', '1');
    });
    await cam('09b_within_bounds');
    await step(ctx, 'off-center', () => app.setValue('#camera-pos-x', '0'));
    await cam('09c_off_center');
    await step(ctx, 'clamps', async () => {
        await app.setValue('#camera-rot-x', '120');
        await app.setValue('#camera-pos-y', '-3');
    });
    await cam('10_clamps');
    await step(ctx, 'reset', () => app.click('#reset-camera'));
    await cam('11_reset');
    await step(ctx, 'preset-arri-lf', () => app.setValue('#camera-filmback', 'arri-lf', ['change']));
    await cam('12_arri_lf');
    await step(ctx, 'safe-distance-on', () => app.click('#toggle-safe-distance'));
    await cam('13_safe_distance');
    await shot(ctx, '13_safe_distance');
    await dl(ctx, 'export-safe-distance', '#export-safe-distance', { expect: 1, timeoutMs: 4000 });
    await step(ctx, 'preview-off', () => app.click('#toggle-camera-preview'));
    await cam('14_preview_off');
    await shot(ctx, '14_preview_off');
    await step(ctx, 'preview-on-again', () => app.click('#toggle-camera-preview'));
    await cam('15_preview_on_again');
    await step(ctx, 'stats', async () => rec.state('stats_final', await app.stats()));
}

async function uiScenario(ctx) {
    const { app, rec } = ctx;
    let n = 0;
    const snap = async (label) => step(ctx, `snap:${label}`, async () => {
        const id = String(n++).padStart(2, '0');
        rec.state(`ui_${id}_${label}`, { stats: await app.stats(), sections: await app.sectionsSnapshot() });
    });
    await snap('initial');
    await step(ctx, 'add-1', () => app.click('#add-section-btn'));
    await snap('after_add_1');
    await step(ctx, 'add-2', () => app.click('#add-section-btn'));
    await snap('after_add_2');

    // Edit the second card.
    await step(ctx, 'edit-cols', () => app.setValue(field(1, 'panelCols'), '8'));
    await snap('card1_cols_8');
    await step(ctx, 'edit-rows', () => app.setValue(field(1, 'panelRows'), '4'));
    await step(ctx, 'edit-ledx', () => app.setValue(field(1, 'ledX'), '64'));
    await snap('card1_rows_4_ledx_64');
    await step(ctx, 'edit-curve', () => app.setValue(field(1, 'curveIntensity'), '5'));
    await step(ctx, 'edit-offset', () => app.setValue(field(1, 'angleOffset'), '-15'));
    await snap('card1_curve_offset');
    await step(ctx, 'edit-name', () => app.setValue(`${card(1)} .section-name-input`, 'Stage Left', ['input']));
    // The 4th swatch of card 1, by index (06 T7, 8.3): palette-independent; Ember since 06 T7, #ff6b35 before.
    await step(ctx, 'edit-swatch', () => app.click(`${card(1)} .color-swatch-small:nth-child(4)`));
    await snap('card1_name_swatch');
    await step(ctx, 'edit-custom-color', () => app.setValue(`${card(1)} input[type="color"]`, '#123456', ['input']));
    await snap('card1_custom_color');

    // Out-of-range values on the first card (clamping behaviour).
    await step(ctx, 'clamp-cols', () => app.setValue(field(0, 'panelCols'), '999'));
    await step(ctx, 'clamp-rows', () => app.setValue(field(0, 'panelRows'), '0'));
    await step(ctx, 'clamp-width', () => app.setValue(field(0, 'panelWidth'), '10'));
    await step(ctx, 'clamp-height', () => app.setValue(field(0, 'panelHeight'), '-5'));
    await step(ctx, 'clamp-ledx', () => app.setValue(field(0, 'ledX'), '2'));
    await step(ctx, 'clamp-offset', () => app.setValue(field(0, 'angleOffset'), '500'));
    await step(ctx, 'clamp-curve-empty', () => app.setValue(field(0, 'curveIntensity'), ''));
    await snap('card0_clamped');

    // 4K canvas warning on a renamed card and on a default-named card, then revert one.
    await step(ctx, '4k-card1', async () => {
        await app.setValue(field(1, 'panelCols'), '50');
        await app.setValue(field(1, 'ledX'), '128');
    });
    await snap('card1_4k_warning');
    await step(ctx, '4k-card0', () => app.setValue(field(0, 'ledX'), '128'));
    await snap('card0_4k_warning');
    await step(ctx, '4k-card1-revert', () => app.setValue(field(1, 'ledX'), '32'));
    await snap('card1_4k_reverted');

    await step(ctx, 'collapse-card2', () => app.click(`${card(2)} .section-header`));
    await snap('card2_header_toggled');

    await dl(ctx, 'edited__export-json', '#export-json');
    await dl(ctx, 'edited__export-obj', '#export-obj', OBJ_ZIP_DOWNLOAD);

    await step(ctx, 'delete-card0', () => app.click(`${card(0)} .section-delete`));
    await snap('after_delete_card0');
    await step(ctx, 'delete-card0-again', () => app.click(`${card(0)} .section-delete`));
    await snap('after_delete_to_one');
    await step(ctx, 'add-after-delete', () => app.click('#add-section-btn'));
    await snap('after_add_3');
    await dl(ctx, 'final__export-json', '#export-json');
}

async function togglesScenario(ctx) {
    const { app, rec } = ctx;
    const ui = async (name) => step(ctx, `ui:${name}`, async () => rec.state(`ui_${name}`, await app.uiState()));
    await ui('00_initial');
    await shot(ctx, '00_base');
    await step(ctx, 'wireframe-on', () => app.click('#toggle-wireframe'));
    await shot(ctx, '01_wireframe');
    await step(ctx, 'wireframe-off', () => app.click('#toggle-wireframe'));
    await step(ctx, 'frame-on', () => app.click('#toggle-frame'));
    await shot(ctx, '02_frames');
    await step(ctx, 'frame-off', () => app.click('#toggle-frame'));
    await step(ctx, 'ledsim-on', () => app.click('#toggle-led-sim'));
    await ui('03_ledsim');
    await shot(ctx, '03_ledsim_single-dot');
    for (const layout of ['rgb-triangle', 'rgb-stripe', 'rgb-horizontal', 'square', 'single-dot']) {
        await step(ctx, `layout-${layout}`, () => app.setValue('#led-layout', layout, ['change']));
        await shot(ctx, `04_ledsim_${layout}`);
    }
    await step(ctx, 'ledsim-section', () => app.selectMeshMode('section'));
    await shot(ctx, '05_ledsim_section');
    await step(ctx, 'ledsim-panel', () => app.selectMeshMode('panel'));
    await shot(ctx, '06_ledsim_panel');
    await step(ctx, 'ledsim-combined', () => app.selectMeshMode('combined'));
    await step(ctx, 'panelids-on', () => app.click('#toggle-panel-ids'));
    await ui('07_panelids_on_disables_ledsim');
    await shot(ctx, '07_panelids_combined');
    await step(ctx, 'panelids-section', () => app.selectMeshMode('section'));
    await shot(ctx, '08_panelids_section');
    await step(ctx, 'panelids-panel', () => app.selectMeshMode('panel'));
    await shot(ctx, '09_panelids_panel');
    await step(ctx, 'ledsim-on-disables-panelids', () => app.click('#toggle-led-sim'));
    await ui('10_ledsim_on_disables_panelids');
    await step(ctx, 'ledsim-off', () => app.click('#toggle-led-sim'));
    await step(ctx, 'back-combined', () => app.selectMeshMode('combined'));
    await step(ctx, 'grid-off', () => app.click('#toggle-grid'));
    await shot(ctx, '11_grid_off');
    await step(ctx, 'grid-on', () => app.click('#toggle-grid'));
    await step(ctx, 'person-on', () => app.click('#toggle-person'));
    await shot(ctx, '12_person_default');
    await step(ctx, 'person-move', async () => {
        await app.setValue('#person-pos-x', '1');
        await app.setValue('#person-pos-z', '1.5');
        await app.setValue('#person-rot-y', '45');
        await app.setValue('#person-scale', '1.5');
    });
    await shot(ctx, '13_person_moved');
    await step(ctx, 'car-on', () => app.click('#toggle-car'));
    await shot(ctx, '14_car_default');
    await step(ctx, 'car-move', async () => {
        await app.setValue('#car-pos-x', '3');
        await app.setValue('#car-pos-z', '4');
        await app.setValue('#car-rot-y', '-30');
        await app.setValue('#car-scale', '0.8');
    });
    await shot(ctx, '15_car_moved');
    await step(ctx, 'props-clamp', async () => {
        await app.setValue('#person-scale', '9');
        await app.setValue('#car-rot-y', '400');
    });
    await ui('16_props_clamped');
    for (const v of ['front', 'side', 'top', 'reset']) {
        await step(ctx, `view-${v}`, () => app.click(`#view-${v}`));
        await shot(ctx, `17_view_${v}`);
    }
    await step(ctx, 'orbit-drag', async () => {
        const r = await app.canvasRect();
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        await app.mouse('mouseMoved', cx, cy);
        await app.mouse('mousePressed', cx, cy);
        for (let i = 1; i <= 6; i++) await app.mouse('mouseMoved', cx + i * 20, cy + i * 6, { button: 'left', buttons: 1 });
        await app.mouse('mouseReleased', cx + 120, cy + 36);
        await app.settle();
    });
    await shot(ctx, '18_orbit_drag');
    await step(ctx, 'wheel-zoom', async () => {
        const r = await app.canvasRect();
        await app.page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.x + r.w / 2, y: r.y + r.h / 2, deltaX: 0, deltaY: 300 });
        await app.settle();
    });
    await shot(ctx, '19_wheel_zoom');
    await ui('20_final');
}

/**
 * Whether a canvas pixel belongs to the person prop (MeshBasic 0x4488ff @ 0.85), re-derived for the Studio Grey default
 * wall (docs/improvements/06-morph-branding.md 8.3, T7). The person composites to (59, 117, 218) over the 0x0a0a0a
 * background, (71, 141, 252) over Sky and (90, 148, 249) over the #d9d9d6 wall: the first branch takes the first two,
 * the second the person over a light wall. The second branch rejects Sky itself (88, 166, 232: b < 240, g > 160), Iris
 * and Steel (r > 95), every neutral grey (b - r < 145) and the chrome (no blue). Every person pick happens with the
 * camera preview off, so no frustum covers the person (two layers of the 0.05 fill over the background would still give
 * (77, 130, 220), inside the first branch). Used by findPersonPixel and the gizmo_drag scenario (isPerson); a function
 * declaration, so the import cycle with scenarios-extra.mjs is safe.
 */
export function isPersonPixel(r, g, b) {
    return (b >= 200 && r >= 40 && r <= 80 && g >= 95 && g <= 170) || (b >= 240 && r >= 81 && r <= 95 && g >= 135 && g <= 160);
}

/**
 * With REGRESSION_DEBUG_DIR set, keep a searched screenshot and what was found (06 T7: the person picks are checked to
 * lie on the person's body, 8.3). Writes nothing otherwise, so it never changes an output.
 * @param {string} step  the step name (the file stem)
 * @param {Buffer} png   the searched screenshot
 * @param {object} data  the hit and anything else worth keeping
 */
export function debugDump(step, png, data) {
    const dir = process.env.REGRESSION_DEBUG_DIR;
    if (!dir) return;
    const base = path.join(dir, step.replace(/[^\w.-]+/g, '_'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(base + '.png', png);
    fs.writeFileSync(base + '.json', JSON.stringify(data, null, 2));
}

/**
 * Find the centre-most pixel of the person prop (MeshBasic 0x4488ff @ 0.85 opacity, isPersonPixel) in a canvas
 * screenshot. Exported for the normals_debug scenario (01 T8, B9); a function declaration, so the import cycle with
 * scenarios-extra.mjs is safe.
 */
export function findPersonPixel(png) {
    const { width, height, rgba } = decodePNG(png);
    let sx = 0, sy = 0, n = 0;
    const hits = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
            if (isPersonPixel(r, g, b)) { sx += x; sy += y; n++; hits.push([x, y]); }
        }
    }
    if (n < 20) return null;
    const mx = sx / n, my = sy / n;
    let best = hits[0], bd = Infinity;
    for (const [x, y] of hits) { const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = [x, y]; } }
    return { x: best[0], y: best[1], count: n };
}

async function keyboardScenario(ctx) {
    const { app, rec } = ctx;
    let n = 0;
    const g = async (label) => step(ctx, `gizmo:${label}`, async () => {
        rec.state(`kb_${String(n++).padStart(2, '0')}_${label}`, await app.gizmoState());
    });
    const press = async (key) => step(ctx, `key:${key}`, async () => { await app.blurActive(); await app.keyPress(key); });

    await g('initial');
    for (const [key, label] of [['g', 'G_translate'], ['g', 'G_again_off'], ['r', 'R_rotate'], ['g', 'G_switch_translate'],
        ['l', 'L_local'], ['l', 'L_world'], ['p', 'P_without_camera'], ['Escape', 'Escape']]) {
        await press(key);
        await g(label);
    }

    // Selection of the person prop by clicking its pixels in translate mode.
    await step(ctx, 'person-on', () => app.click('#toggle-person'));
    await press('g');
    await g('person_G');
    await step(ctx, 'select-person', async () => {
        const png = await app.screenshotCanvas();
        const hit = findPersonPixel(png);
        debugDump(`keyboard_${app.step}`, png, { hit });
        // Only `found` is recorded: exact pixel coordinates would make this state brittle to
        // sub-pixel rendering differences that the screenshot comparison already tolerates.
        rec.state('person_pick', { found: !!hit });
        if (hit) {
            const r = await app.canvasRect();
            const x = r.x + hit.x, y = r.y + hit.y;
            await app.mouse('mouseMoved', x, y);
            await app.mouse('mousePressed', x, y);
            await app.mouse('mouseReleased', x, y);
            await app.settle();
        }
    });
    await g('person_selected');
    await shot(ctx, 'person_selected_translate_gizmo');
    await press('r');
    await g('person_R');
    await shot(ctx, 'person_rotate_gizmo');
    await press('l');
    await g('person_L_local');
    await press('Escape');
    await g('person_Escape');

    // Pilot mode with camera preview enabled.
    await step(ctx, 'camera-on', () => app.click('#toggle-camera-preview'));
    await press('p');
    await g('pilot_P_on');
    await shot(ctx, 'pilot_view');
    await press('Escape');
    await g('pilot_Escape_off');
    await press('p');
    await g('pilot_P_on_again');
    await step(ctx, 'pilot-button', () => app.click('#gizmo-pilot'));
    await g('pilot_button_off');
    await step(ctx, 'gizmo-buttons', async () => {
        await app.click('#gizmo-rotate');
        await app.click('#gizmo-space');
    });
    await g('buttons_rotate_space');
    await shot(ctx, 'final_view');
}

/**
 * UI/CSS golden master. For a sequence of UI states it records (see ui-spec.mjs and lib/uiprobe.mjs):
 *   NN_<state>.styles.json              computed styles + rects of the probed elements (exact)
 *   NN_<state>.text.json                title, header/button/label/option texts, rendered text (exact)
 *   NN_<state>.viewport.screenshot.png  the 1600x1000 page with both WebGL canvases hidden
 *   NN_<state>.sidebar.screenshot.png   the sidebar's full scroll height, stitched from scrolled slices
 * Light states (gizmo buttons) only record the overlay styles.
 */
async function uiVisualScenario(ctx) {
    const { app, rec } = ctx;
    const MAIN = ['page', 'sidebar', 'card0', 'overlay', 'camera-window'];
    let n = 0;
    const capture = async (label, { styles = null, text = false, viewport = false, sidebar = false } = {}) => {
        const base = `${String(n++).padStart(2, '0')}_${label}`;
        await step(ctx, `ui:${base}:quiesce`, () => ui.quiesce(app));
        if (styles) await step(ctx, `ui:${base}:styles`, async () => rec.state(`${base}.styles`, await ui.captureStyles(app, styles)));
        if (text) await step(ctx, `ui:${base}:text`, async () => rec.state(`${base}.text`, await ui.captureText(app)));
        if (viewport) await step(ctx, `ui:${base}:viewport`, async () => rec.screenshot(`${base}.viewport`, await ui.screenshotViewport(app)));
        if (sidebar) await step(ctx, `ui:${base}:sidebar`, async () => rec.screenshot(`${base}.sidebar`, await ui.screenshotScroller(app, '.control-panel')));
    };

    await step(ctx, 'preload-fonts', () => ui.preloadFonts(app));
    await capture('initial', { styles: MAIN, text: true, viewport: true, sidebar: true });

    // Gizmo buttons and the selection indicator, in a clean scene (default wall + person prop).
    await step(ctx, 'person-on', () => app.click('#toggle-person'));
    await step(ctx, 'gizmo-translate', () => app.click('#gizmo-translate'));
    await capture('gizmo_translate', { styles: ['overlay'] });
    await step(ctx, 'select-person', async () => {
        const png = await app.screenshotCanvas();
        const hit = findPersonPixel(png);
        debugDump(`ui_visual_${app.step}`, png, { hit });
        rec.state('selection_pick', { found: !!hit });
        if (!hit) return;
        const r = await app.canvasRect();
        const x = r.x + hit.x, y = r.y + hit.y;
        await app.mouse('mouseMoved', x, y);
        await app.mouse('mousePressed', x, y);
        await app.mouse('mouseReleased', x, y);
        await app.settle();
    });
    await capture('selection_visible', { styles: ['overlay'], text: true, viewport: true });
    await step(ctx, 'deselect', async () => { await app.blurActive(); await app.keyPress('Escape'); });
    await step(ctx, 'gizmo-rotate-local', async () => {
        await app.click('#gizmo-rotate');
        await app.click('#gizmo-space');
    });
    await capture('gizmo_rotate_local', { styles: ['overlay'] });
    await step(ctx, 'gizmo-back-to-default', async () => {
        await app.click('#gizmo-space');
        await app.click('#gizmo-rotate');
    });

    // Every optional panel that can be open at once. LED sim and panel IDs exclude each other,
    // so panel IDs get their own state below.
    await step(ctx, 'open-led-sim', () => app.click('#toggle-led-sim'));
    await step(ctx, 'open-camera-preview', () => app.click('#toggle-camera-preview'));
    await step(ctx, 'custom-filmback', () => app.setValue('#camera-filmback', 'custom', ['change']));
    await step(ctx, 'safe-distance-on', () => app.click('#toggle-safe-distance'));
    await step(ctx, 'open-car', () => app.click('#toggle-car'));
    await capture('options_ledsim_camera_props', { styles: MAIN, text: true, viewport: true, sidebar: true });

    // Pilot mode needs the camera preview: active pilot button + the pilot-info banner.
    await step(ctx, 'pilot-on', () => app.click('#gizmo-pilot'));
    await capture('gizmo_pilot', { styles: ['overlay'], text: true, viewport: true });
    await step(ctx, 'pilot-off', () => app.click('#gizmo-pilot'));

    // Panel IDs (turns LED sim off) with the section-logo UI; section 0 gets a logo.
    await step(ctx, 'open-panel-ids', () => app.click('#toggle-panel-ids'));
    await step(ctx, 'upload-logo', async () => {
        const r = await ui.uploadSectionLogo(app, 0, ui.logoPNG());
        rec.state('logo_upload', r);
        if (!r.ok) throw new Error('logo upload: ' + r.reason);
    });
    await capture('options_panelids_logo', { styles: [...MAIN, 'logos'], text: true, viewport: true, sidebar: true });

    // A second section, added and expanded (the first stays expanded too).
    await step(ctx, 'add-section', () => app.click('#add-section-btn'));
    await capture('two_sections', { styles: [...MAIN, 'card1', 'logos'], text: true, viewport: true, sidebar: true });

    // Collapsed card + the 4K warning on the other card.
    await step(ctx, 'collapse-card0', () => app.click(`${card(0)} .section-header`));
    await step(ctx, '4k-warning-card1', async () => {
        await app.setValue(field(1, 'panelCols'), '50');
        await app.setValue(field(1, 'ledX'), '128');
    });
    await capture('collapsed_and_4k_warning', { styles: [...MAIN, 'card1', 'logos'], text: true, viewport: true, sidebar: true });

    // Narrow window: the @media (max-width: 900px) layout.
    await step(ctx, 'narrow-viewport', () => ui.setViewport(app, 800, 1000));
    await capture('narrow_800', { styles: (e) => e.layout, viewport: true });
    await step(ctx, 'restore-viewport', () => ui.setViewport(app, 1600, 1000));
}

export const SCENARIOS = {
    default: {
        description: 'Default app state (no import): all mesh modes and exports.',
        run: (ctx) => configCapture(ctx, {}),
    },
    flat3: {
        description: 'Flat multi-section wall (3 sections).',
        run: (ctx) => configCapture(ctx, { configKey: 'flat3' }),
    },
    concave_offsets: {
        description: 'Concave curved sections with +/- section angle offsets; import defaults (missing name/color/id).',
        run: (ctx) => configCapture(ctx, { configKey: 'concave_offsets' }),
    },
    convex: {
        description: 'Convex (negative curve) section imported in panel mesh mode.',
        run: (ctx) => configCapture(ctx, { configKey: 'convex' }),
    },
    mixed: {
        description: 'Mixed panel sizes, LED resolutions and row counts; custom panel-ID border/font/section-label styling.',
        run: (ctx) => configCapture(ctx, {
            configKey: 'mixed',
            panelIdStyle: async (app) => {
                await app.setValue('#panel-border-thickness', '16');
                await app.setValue('#panel-font-size', '40');
                await app.setValue('#panel-font-color', '#ffcc00');
                await app.setValue('#section-label-size', '120');
                await app.setValue('#section-label-color', '#33ff99');
            },
        }),
    },
    box_corner: {
        description: 'Box/corner layout from 90-degree section offsets; section labels turned off.',
        run: (ctx) => configCapture(ctx, {
            configKey: 'box_corner',
            zipJsonRoundTrip: true,
            panelIdStyle: async (app) => {
                await app.click('#toggle-section-labels');
                await app.setValue('#panel-border-thickness', '4');
            },
        }),
    },
    large_wall: {
        description: 'Stress: 4 sections x 40x20 panels (3,200 panels) through every export.',
        run: (ctx) => configCapture(ctx, { configKey: 'large_wall' }),
    },
    camera: {
        description: 'Camera frustum preview: filmback/focal/position/rotation inputs, safe distance + its OBJ export.',
        run: cameraScenario,
    },
    ui_sections: {
        description: 'Section cards: add/edit/clamp/4K warning/collapse/delete with stats + structural snapshots.',
        run: uiScenario,
    },
    toggles: {
        description: 'Visual toggles (wireframe, frames, LED sim layouts, panel IDs, grid, props, views, orbit) with viewport screenshots.',
        run: togglesScenario,
    },
    keyboard: {
        description: 'Keyboard shortcuts G/R/L/P/Escape, prop selection by click, pilot mode.',
        run: keyboardScenario,
    },
    ui_visual: {
        description: 'UI/CSS: computed-style + text snapshots and canvas-masked page/sidebar screenshots across panel, card, gizmo and narrow-layout states.',
        run: uiVisualScenario,
    },
    // The extra scenarios of scenarios-extra.mjs, registered after the original entries.
    ...EXTRA_SCENARIOS,
    // The Phase 2 scenarios of scenarios-phase2.mjs (08 section 8.3), registered after the extra scenarios.
    ...PHASE2_SCENARIOS,
    // The feature scenarios of scenarios-features.mjs (03 section 8.3: the wall pivot).
    ...FEATURE_SCENARIOS,
    // The platform scenarios of scenarios-platform.mjs (07 section 8.3: the camera preview of R1/R2), registered last.
    ...PLATFORM_SCENARIOS,
};
