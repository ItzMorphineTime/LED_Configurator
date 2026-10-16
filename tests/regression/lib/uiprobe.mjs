// UI/CSS probes used by the `ui_visual` scenario. Like the rest of the harness they only use
// standard DOM APIs (querySelectorAll, getComputedStyle, getBoundingClientRect, innerText, scrollTop,
// file inputs) and CDP input/screenshot commands. They never touch app globals or functions.
//
// The page-side functions below are serialised with Function#toString and evaluated in the page,
// so they must be self-contained (no references to module scope).
import { decodePNG, encodePNG } from './formats.mjs';
import { STYLE_PROPS, CSS_TOKENS, UI_ELEMENTS } from '../ui-spec.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MASK_ID = '__regression_ui_mask';
// Hides the WebGL canvases for UI screenshots, so 3D rendering can never leak into them. The
// .viewport background (#three-canvas) and the preview window's black background show instead.
const MASK_CSS = '#three-canvas, #camera-preview-canvas { visibility: hidden !important; }';

// Every weight the Google Fonts URL serves, loaded up front so text revealed later (opened panels,
// new cards) never races a web-font download. The sample text pulls in the unicode-range subsets.
// Montserrat 400-700 since 06 T4a (06 8.3); 06 T5 drops Outfit and JetBrains Mono 300 and adds JetBrains Mono 700.
const FONT_FACES = [
    ['Outfit', [300, 400, 500, 600, 700]],
    ['JetBrains Mono', [300, 400, 500, 600]],
    ['Montserrat', [400, 500, 600, 700]],
];
const FONT_SAMPLE = 'AaZz09 °×•—–…→✓⚠';

/** Where the mouse is parked before a capture: inside the header padding, which has no :hover rules. */
const PARK = { x: 2, y: 2 };

export async function preloadFonts(app) {
    await app.eval(`(async () => {
        const loads = [];
        for (const [family, weights] of ${JSON.stringify(FONT_FACES)}) {
            for (const w of weights) loads.push(document.fonts.load(w + ' 16px "' + family + '"', ${JSON.stringify(FONT_SAMPLE)}).catch(() => []));
        }
        await Promise.all(loads);
        await document.fonts.ready;
        return true;
    })()`, 30000);
}

/**
 * Bring the UI to a stable state before any capture: no focused control (no :focus-within border,
 * no caret), the mouse parked away from anything with :hover rules, transitions finished (the
 * toggles' ::after knob animates for 0.3 s), fonts settled, the sidebar scrolled to the top.
 */
export async function quiesce(app) {
    await app.blurActive();
    await app.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: PARK.x, y: PARK.y, button: 'none', clickCount: 0 });
    await app.eval(`(() => { const cp = document.querySelector('.control-panel'); if (cp) cp.scrollTop = 0; return true; })()`);
    await sleep(400);
    await app.waitAnimations();
    await app.eval('document.fonts.ready.then(() => true)', 30000);
    await app.frames(2);
}

// ---- computed styles ---------------------------------------------------------------------------

function pageCaptureStyles(spec, props, tokens) {
    const r2 = (v) => Math.round(v * 2) / 2;
    const elements = {};
    for (const e of spec) {
        let list;
        try { list = document.querySelectorAll(e.sel); } catch (err) { elements[e.label] = { selector: e.sel, error: String(err.message || err) }; continue; }
        const el = list[e.index || 0];
        const entry = { selector: e.sel + (e.index ? ` [${e.index}]` : '') + (e.pseudo || ''), matches: list.length, found: !!el };
        if (el) {
            const cs = getComputedStyle(el, e.pseudo || null);
            if (!e.pseudo) {
                const b = el.getBoundingClientRect();
                entry.rect = { x: r2(b.left), y: r2(b.top), w: r2(b.width), h: r2(b.height) };
                entry.classes = [...el.classList].sort();
            }
            const styles = {};
            if (e.pseudo) styles.content = cs.getPropertyValue('content');
            for (const p of props) styles[p] = cs.getPropertyValue(p);
            entry.styles = styles;
        }
        elements[e.label] = entry;
    }
    const rootCs = getComputedStyle(document.documentElement);
    const cssTokens = {};
    for (const t of tokens) cssTokens[t] = rootCs.getPropertyValue(t).trim();
    const cp = document.querySelector('.control-panel');
    return {
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        cssTokens,
        controlPanelScroll: cp ? { scrollHeight: cp.scrollHeight, clientHeight: cp.clientHeight, scrollWidth: cp.scrollWidth, clientWidth: cp.clientWidth } : null,
        elements,
    };
}

/**
 * Computed-style snapshot of the UI_ELEMENTS entries selected by `filter`
 * (an array of group names, or a predicate over the entry).
 */
export async function captureStyles(app, filter) {
    const pick = typeof filter === 'function' ? filter : (e) => filter.includes(e.group);
    const spec = UI_ELEMENTS.filter(pick).map(({ label, sel, index, pseudo }) => ({ label, sel, index, pseudo }));
    return app.eval(`(${pageCaptureStyles.toString()})(${JSON.stringify(spec)}, ${JSON.stringify(STYLE_PROPS)}, ${JSON.stringify(CSS_TOKENS)})`, 60000);
}

// ---- text content -----------------------------------------------------------------------------

function pageCaptureText() {
    const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const desc = (el) => {
        const o = { tag: el.tagName.toLowerCase() };
        if (el.id) o.id = el.id;
        if (el.classList.length) o.class = [...el.classList].sort().join(' ');
        for (const a of el.attributes) if (a.name.startsWith('data-')) o[a.name] = a.value;
        return o;
    };
    const texts = (sel) => [...document.querySelectorAll(sel)].map((el) => norm(el.textContent));
    const one = (sel) => { const el = document.querySelector(sel); return el ? norm(el.textContent) : null; };
    return {
        title: document.title,
        lang: document.documentElement.getAttribute('lang'),
        header: { logo: texts('.product-name'), statValues: texts('.stat-value'), statLabels: texts('.stat-label') },
        globalSectionTitles: texts('.global-section-title'),
        subsectionTitles: texts('.subsection-title'),
        toggleLabels: texts('.toggle-label'),
        meshModeLabels: texts('.mesh-mode-label'),
        buttons: [...document.querySelectorAll('button')].map((b) => ({ ...desc(b), text: norm(b.textContent), title: b.getAttribute('title'), ariaLabel: b.getAttribute('aria-label') })),
        labels: [...document.querySelectorAll('label')].map((l) => ({ ...desc(l), text: norm(l.textContent), for: l.getAttribute('for') })),
        selects: [...document.querySelectorAll('select')].map((s) => ({
            ...desc(s),
            value: s.value,
            options: [...s.options].map((o) => ({ value: o.value, text: norm(o.text), selected: o.selected, disabled: o.disabled })),
        })),
        titleAttributes: [...document.querySelectorAll('[title]')].map((el) => ({ ...desc(el), title: el.getAttribute('title') })),
        ariaLabels: [...document.querySelectorAll('[aria-label]')].map((el) => ({ ...desc(el), ariaLabel: el.getAttribute('aria-label') })),
        placeholders: [...document.querySelectorAll('[placeholder]')].map((el) => ({ ...desc(el), placeholder: el.getAttribute('placeholder') })),
        cards: [...document.querySelectorAll('#wall-sections > *')].map((card) => ({
            title: norm(card.querySelector('.section-title')?.textContent),
            summary: norm(card.querySelector('.section-summary')?.textContent),
            warning: card.querySelector('.section-warning') ? norm(card.querySelector('.section-warning').textContent) : null,
            hints: [...card.querySelectorAll('.curve-hint')].map((h) => norm(h.textContent)),
        })),
        sectionLogos: [...document.querySelectorAll('#section-logos-container > *')].map((el) => norm(el.textContent)),
        overlay: {
            infoBadge: one('.info-badge'),
            selectionIndicator: one('#selection-indicator'),
            pilotInfo: one('#pilot-info'),
            gizmoSpace: one('#gizmo-space'),
            cameraWindow: texts('#camera-preview-window span'),
        },
        cameraInfo: texts('.camera-info > div'),
        frustumStatus: texts('.frustum-status > div'),
        // Rendered text in layout order (respects display:none, so it reflects what is visible).
        innerText: document.body.innerText.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean),
    };
}

/** Text-content snapshot: title, headers, buttons, labels, options, titles and the rendered body text. */
export async function captureText(app) {
    return app.eval(`(${pageCaptureText.toString()})()`, 30000);
}

// ---- screenshots --------------------------------------------------------------------------------

async function setMask(app, on) {
    await app.eval(`(() => {
        let s = document.getElementById(${JSON.stringify(MASK_ID)});
        if (${on ? 'true' : 'false'}) {
            if (!s) { s = document.createElement('style'); s.id = ${JSON.stringify(MASK_ID)}; s.textContent = ${JSON.stringify(MASK_CSS)}; document.head.appendChild(s); }
        } else if (s) {
            s.remove();
        }
        return true;
    })()`);
    await app.frames(2);
}

async function capture(app, clip) {
    const res = await app.page.send('Page.captureScreenshot', {
        format: 'png',
        clip: { ...clip, scale: 1 },
        captureBeyondViewport: false,
        fromSurface: true,
    });
    return Buffer.from(res.data, 'base64');
}

/** Screenshot of the whole viewport (the page is a 100vh grid, so this is the full page), canvases masked. */
export async function screenshotViewport(app) {
    await setMask(app, true);
    try {
        const vp = await app.eval('({ w: window.innerWidth, h: window.innerHeight })');
        return await capture(app, { x: 0, y: 0, width: vp.w, height: vp.h });
    } finally {
        await setMask(app, false);
    }
}

/**
 * Full scroll height of an overflow:auto container (the sidebar), canvases masked.
 * captureBeyondViewport cannot reach content clipped by an inner scroller, so the container is
 * scrolled through its height (plain scrollTop), each window is captured, and the slices are
 * stitched into one PNG. scrollTop is restored afterwards.
 */
export async function screenshotScroller(app, selector) {
    const sel = JSON.stringify(selector);
    await setMask(app, true);
    const info = await app.eval(`(() => {
        const el = document.querySelector(${sel});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, ct: el.clientTop, ch: el.clientHeight, sh: el.scrollHeight, st: el.scrollTop };
    })()`);
    if (!info) { await setMask(app, false); throw new Error('screenshotScroller: element not found: ' + selector); }
    try {
        const x = Math.round(info.x), y = Math.round(info.y), w = Math.round(info.w), h = Math.round(info.h);
        const maxScroll = Math.max(0, info.sh - info.ch);
        const outH = h + maxScroll;
        const out = new Uint8Array(w * outH * 4);
        const stops = [];
        for (let s = 0; s < maxScroll; s += Math.max(1, info.ch)) stops.push(s);
        stops.push(maxScroll);
        for (let k = 0; k < stops.length; k++) {
            const actual = await app.eval(`(() => { const el = document.querySelector(${sel}); el.scrollTop = ${stops[k]}; return Math.round(el.scrollTop); })()`);
            await app.frames(2);
            const img = decodePNG(await capture(app, { x, y, width: w, height: h }));
            const cw = Math.min(w, img.width);
            // First slice also contributes the top border rows, the last slice the bottom border rows.
            const from = k === 0 ? 0 : info.ct;
            const to = k === stops.length - 1 ? Math.min(h, img.height) : Math.min(info.ct + info.ch, img.height);
            for (let row = from; row < to; row++) {
                const dst = actual + row;
                if (dst < 0 || dst >= outH) continue;
                out.set(img.rgba.subarray(row * img.width * 4, row * img.width * 4 + cw * 4), dst * w * 4);
            }
        }
        return encodePNG(w, outH, out);
    } finally {
        await app.eval(`(() => { const el = document.querySelector(${sel}); if (el) el.scrollTop = ${info.st}; return true; })()`).catch(() => {});
        await setMask(app, false);
    }
}

// ---- interactions -------------------------------------------------------------------------------

/** A small solid-colour PNG used as a section logo. */
export function logoPNG(size = 16, rgba = [255, 0, 170, 255]) {
    const px = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) px.set(rgba, i * 4);
    return encodePNG(size, size, px);
}

/**
 * Upload a logo for the index-th section through its file input in #section-logos-container
 * (exactly what a user's file pick does), then wait for the UI to show it.
 */
export async function uploadSectionLogo(app, index, png) {
    const r = await app.eval(`(async () => {
        const input = document.querySelectorAll('#section-logos-container input[type="file"]')[${index}];
        if (!input) return { ok: false, reason: 'no logo file input #${index}' };
        const bytes = Uint8Array.from(atob(${JSON.stringify(png.toString('base64'))}), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], 'logo.png', { type: 'image/png' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const t0 = performance.now();
        while (performance.now() - t0 < 10000) {
            const btn = document.querySelectorAll('#section-logos-container .section-logo-upload-btn')[${index}];
            if (btn && btn.classList.contains('has-logo')) return { ok: true };
            await new Promise((res) => setTimeout(res, 25));
        }
        return { ok: false, reason: 'logo upload did not show up in the UI' };
    })()`, 20000);
    await app.settle(200);
    return r;
}

/** Change the emulated viewport (fires a window resize, like resizing the browser window). */
export async function setViewport(app, width, height) {
    await app.page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    await app.settle(200);
}
