// Project-file scenarios of spec 07 (docs/improvements/07-platform-foundations.md 8.3; task D2): the v1 migration
// matrix and the hostile import set, kept small. Like every scenario file, they talk to the page ONLY through the DOM
// (the hidden #import-input file input, ids and classes) and never call app functions or read app globals.
//
// Exported as PROJECT_SCENARIOS ({ name: { description, run } }) and spread into SCENARIOS after the UV scenarios.
import { CONFIGS } from './configs.mjs';
import { MODIFIERS } from './lib/app.mjs';

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

/** What a hostile import could have changed: card titles (text), images, injected markers and the section count. */
function pageHostileProbe() {
    return {
        titles: [...document.querySelectorAll('#wall-sections .section-title')].map((el) => el.textContent),
        images: document.querySelectorAll('img').length,
        injected: !!document.getElementById('xss-hostile') || document.body.hasAttribute('data-xss'),
        polluted: ({}).polluted !== undefined,
        sections: (document.getElementById('total-sections') || {}).textContent,
    };
}

// ---- import_v1_matrix (07 8.3, D2) ------------------------------------------------------------------------------

/**
 * Every v1 config of configs.mjs imported in turn into one page (wall scope: the camera, props, display and orbit framing
 * of the session stay; the wall re-centres as the legacy import did), each followed by the stats, the section cards, the
 * glTF export in the mesh mode the file set and a viewport screenshot.
 */
async function importV1MatrixScenario(ctx) {
    const { app, rec } = ctx;
    for (const [key, config] of Object.entries(CONFIGS)) {
        await step(ctx, `${key}-import`, async () => {
            const r = await app.importConfig(config, `${key}.json`);
            rec.state(`${key}_import_result`, r);
            if (!r.ok) throw new Error('import did not apply: ' + JSON.stringify(r));
        });
        await record(ctx, `${key}_state`, async () => ({ stats: await app.stats(), mesh: await app.meshModeState(), cards: await app.sectionsSnapshot() }));
        await step(ctx, `${key}__export-gltf`, async () => {
            rec.downloads(`${key}__export-gltf`, await app.captureDownloads(() => app.click('#export-gltf'), { expect: 1, timeoutMs: 30000 }));
        });
        await step(ctx, `shot:${key}`, async () => rec.screenshot(`${key}_view`, await app.screenshotCanvas()));
    }
}

// ---- import_hostile (07 8.3, D2) --------------------------------------------------------------------------------

const sec = (name, id, extra = {}) => ({
    name, id,
    panel: { columns: 2, rows: 1, width_mm: 500, height_mm: 500 },
    led_resolution: { x: 32, y: 32 },
    curvature: { angle_degrees: 0, angle_offset_degrees: 0 },
    color: '#00f0ff',
    ...extra,
});

/** One v2 file of a newer revision with every correctable hostile value (07 8.3 import_hostile), as raw JSON text. */
function hostileText() {
    const doc = {
        version: '2.7',
        format: 'morph-led-project',
        project: { name: '<b>Stage</b>‮', notes: 'n' },
        sections: [
            sec('<img id="xss-hostile" src="x.invalid" onerror="document.body.setAttribute(\'data-xss\', 1)">', 5),
            sec('Say "hi"', 5, { panel: { columns: '10', rows: 1, width_mm: 500, height_mm: 500 } }),
            sec('Huge', 'NaN', { panel: { columns: 100000, rows: 1, width_mm: 500, height_mm: 500 }, led_resolution: { x: '1e400', y: 32 } }),
            sec('Top', 2147483647, { uv_transform: { offset_u: 1 } }),
        ],
        mesh_mode: 'combined',
        pivot: { mode: 'wall-center' },
        extensions: { 'acme.kept': { a: [1, 2] } },
    };
    // own __proto__ / constructor / prototype keys, as JSON.parse creates them from a hostile file
    return JSON.stringify(doc, null, 2).replace('"extensions": {', '"extensions": { "__proto__": { "polluted": true }, "constructor": { "prototype": { "polluted": true } },')
        .replace('"mesh_mode": "combined",', '"mesh_mode": "combined", "__proto__": { "polluted": true },');
}

/** The refused files (07 8.3): each changes nothing and alerts one message. */
const REFUSED = [
    ['newer_major', JSON.stringify({ version: '3.0', sections: [{}] })],
    ['other_format', JSON.stringify({ format: 'other', sections: [{}] })],
    ['invalid_json', '{"sections": [ {"name": "x" '],
    ['no_sections_key', JSON.stringify({ version: '2.0', mesh_mode: 'panel' })],
    ['empty_sections', JSON.stringify({ version: '2.0', sections: [] })],
    ['sections_201', JSON.stringify({ version: '1.0', sections: Array.from({ length: 201 }, (_, i) => ({ id: i })) })],
];

async function importHostileScenario(ctx) {
    const { app } = ctx;
    await record(ctx, '00_before', () => pageCall(app, pageHostileProbe));
    await step(ctx, 'hostile-import', async () => ctx.rec.state('hostile_import_result', await pageCall(app, pageImportText, hostileText(), 'hostile.json', 4)));
    await app.settle(300);
    await record(ctx, '01_hostile', () => pageCall(app, pageHostileProbe));
    await record(ctx, '01_hostile_cards', () => app.sectionsSnapshot());
    for (const [label, text] of REFUSED) {
        await step(ctx, `${label}-import`, async () => ctx.rec.state(`${label}_result`, await pageCall(app, pageImportText, text, `${label}.json`, null)));
        await app.settle(200);
    }
    await record(ctx, '02_after_refusals', () => pageCall(app, pageHostileProbe));
    await record(ctx, 'dialogs', () => app.dialogs());
}

// ---- project_v2_roundtrip (07 8.3, D8) --------------------------------------------------------------------------

/** The Project section as the user sees it: the name field, the unsaved-changes indicator, the title, the card state. */
function pageProjectState() {
    const dirty = document.getElementById('project-dirty');
    const card = document.getElementById('project-section');
    const name = document.getElementById('project-name');
    return {
        name: name ? name.value : null,
        unsavedShown: dirty ? !dirty.hidden : null,
        title: document.title,
        cardOpen: card ? !card.classList.contains('collapsed') : null,
    };
}

/** Open a project through the Project section's picker (#project-open-input) with raw file text; resolve when the name field shows `expectName`, or after 10 s. */
function pageOpenProject(text, filename, expectName) {
    return (async () => {
        const input = document.getElementById('project-open-input');
        if (!input) return { ok: false, reason: 'no #project-open-input' };
        const before = window.__dialogs.length;
        const dt = new DataTransfer();
        dt.items.add(new File([text], filename, { type: 'application/json' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const name = () => document.getElementById('project-name').value;
        const t0 = performance.now();
        while (performance.now() - t0 < 10000 && name() !== expectName) await new Promise((r) => setTimeout(r, 25));
        return { ok: name() === expectName, name: name(), newDialogs: window.__dialogs.slice(before), inputReset: input.value === '' };
    })();
}

/**
 * 07 8.3 project_v2_roundtrip, through the Project section: non-default values (the name; the preview on, then a lens and
 * a pose; both props shown, the person moved; LED simulation with a layout; a panel-ID font size), Ctrl+S, a fresh page,
 * Open the saved file (#project-open-input), Save (#project-save): the two files are byte-identical and the camera and
 * display/prop DOM states after Open equal those before Save. Then New on a clean project (no question) and New after an
 * edit (one "Discard unsaved changes?"). Logos are p2_project_v2's.
 */
async function projectRoundtripScenario(ctx) {
    const { app, rec } = ctx;
    const numeric = (state) => JSON.stringify(state, (k, v) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v));
    const dialogCount = async () => (await app.dialogs()).length;
    await record(ctx, '00_fresh', () => pageCall(app, pageProjectState));
    await step(ctx, 'name', () => app.setValue('#project-name', 'Roundtrip Stage'));
    await step(ctx, 'preview-on', () => app.click('#toggle-camera-preview'));
    await step(ctx, 'lens', () => app.setValue('#camera-focal-length', '50'));
    await step(ctx, 'pose', () => app.setValue('#camera-pos-x', '1.5'));
    await step(ctx, 'person-on', () => app.click('#toggle-person'));
    await step(ctx, 'person-x', () => app.setValue('#person-pos-x', '1'));
    await step(ctx, 'car-on', () => app.click('#toggle-car'));
    await step(ctx, 'led-sim', () => app.click('#toggle-led-sim'));
    await step(ctx, 'led-layout', () => app.setValue('#led-layout', 'rgb-stripe'));
    await step(ctx, 'panel-font', () => app.setValue('#panel-font-size', '40'));
    await app.settle(300);
    await record(ctx, '01_edited', () => pageCall(app, pageProjectState));
    const beforeCamera = await app.cameraState();
    const beforeUi = await app.uiState();
    rec.state('01_edited_camera', beforeCamera);
    rec.state('01_edited_ui', beforeUi);
    let first = null;
    await step(ctx, 'save-ctrl-s', async () => {
        first = (await app.captureDownloads(() => app.keyPress('s', { modifiers: MODIFIERS.Ctrl }), { expect: 1 }))[0] ?? null;
        rec.downloads('save_1', first ? [first] : []);
    });
    await app.settle(300);
    await record(ctx, '02_saved', () => pageCall(app, pageProjectState));
    await step(ctx, 'reload', () => app.reload());
    await record(ctx, '03_fresh_page', () => pageCall(app, pageProjectState));
    await step(ctx, 'open', async () => {
        const r = await pageCall(app, pageOpenProject, first ? first.data.toString('utf8') : '{}', first ? first.filename : 'none.json', 'Roundtrip Stage');
        rec.state('open_result', r);
        if (!r.ok) throw new Error('the saved file did not open: ' + JSON.stringify(r));
    });
    await app.settle(300);
    await record(ctx, '04_opened', () => pageCall(app, pageProjectState));
    const afterCamera = await app.cameraState();
    const afterUi = await app.uiState();
    rec.state('04_opened_camera', afterCamera);
    rec.state('04_opened_ui', afterUi);
    let second = null;
    await step(ctx, 'save-button', async () => {
        second = (await app.captureDownloads(() => app.click('#project-save'), { expect: 1 }))[0] ?? null;
        rec.downloads('save_2', second ? [second] : []);
    });
    await record(ctx, 'postcheck', async () => ({
        fileNames: [first && first.filename, second && second.filename],
        identical: !!first && !!second && first.data.equals(second.data),
        nameInFile: first ? (JSON.parse(first.data.toString('utf8')).project || {}).name ?? null : null,
        // numerically: after an open the panels write their fixed decimals ("1.50" for a typed "1.5")
        cameraAfterOpenEqualsSaved: numeric(afterCamera) === numeric(beforeCamera),
        uiAfterOpenEqualsSaved: numeric(afterUi) === numeric(beforeUi),
    }));
    const n0 = await dialogCount();
    await step(ctx, 'new-clean', () => app.click('#project-new'));
    await app.settle(300);
    await record(ctx, '05_new_clean', async () => ({ ...await pageCall(app, pageProjectState), newDialogs: (await dialogCount()) - n0 }));
    await step(ctx, 'edit', () => app.setValue('#person-pos-x', '2'));
    await app.settle(300);
    await record(ctx, '06_edited', () => pageCall(app, pageProjectState));
    const n1 = await dialogCount();
    await step(ctx, 'new-dirty', () => app.click('#project-new'));
    await app.settle(300);
    await record(ctx, '07_new_after_edit', async () => ({ ...await pageCall(app, pageProjectState), newDialogs: (await app.dialogs()).slice(n1) }));
}

export const PROJECT_SCENARIOS = {
    import_v1_matrix: {
        description: '07 D2: the six v1 configs imported in turn (wall scope): stats, cards, glTF in the file\'s mesh mode and the re-centred view after each.',
        run: importV1MatrixScenario,
    },
    import_hostile: {
        description: '07 D2: a newer-revision v2 file with markup and quote names, __proto__ keys, numeric strings, huge and 1e400 values, duplicate, NaN and 2^31-1 ids; then six refused files (3.0, other format, invalid JSON, no sections key, empty, 201 sections). Dialogs, card titles, image count.',
        run: importHostileScenario,
    },
    project_v2_roundtrip: {
        description: '07 D8: the Project section: non-default name, camera, props, LED sim and panel-ID style; Ctrl+S; a fresh page; Open the saved file; Save: identical bytes; New when clean (no question) and after an edit (one confirm).',
        run: projectRoundtripScenario,
    },
};
