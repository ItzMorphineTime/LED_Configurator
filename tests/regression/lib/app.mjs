// Black-box driver for the LED configurator page. Interacts ONLY through the DOM
// (ids / classes / data-attributes, clicks, input+change events, keyboard/mouse input,
// and the hidden #import-input file input). Never touches app globals or functions.
import { INJECT_SOURCE } from './inject.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fonts the app uses when drawing panel-ID canvases. Pre-loading them via the standard
// FontFaceSet API makes canvas text rendering deterministic (otherwise the first draw may
// race the web-font download and fall back to a system font).
const FONT_PRELOADS = [
    "bold 32px 'JetBrains Mono'",
    "32px 'JetBrains Mono'",
    "bold 32px 'Outfit'",
    "32px 'Outfit'",
];

const KEYS = {
    g: { code: 'KeyG', vk: 71, text: 'g' },
    r: { code: 'KeyR', vk: 82, text: 'r' },
    l: { code: 'KeyL', vk: 76, text: 'l' },
    p: { code: 'KeyP', vk: 80, text: 'p' },
    Escape: { code: 'Escape', vk: 27 },
};

function normalizeMessage(s, origin) {
    let m = String(s || '');
    if (origin) m = m.split(origin).join('<root>/');
    m = m.split('\n')[0];                                   // drop stack traces
    m = m.replace(/(https?:\/\/[^\s)]+?):\d+:\d+/g, '$1');   // drop :line:col
    m = m.replace(/blob:[^\s)]+/g, 'blob:<url>');
    return m.trim();
}

export class AppPage {
    constructor(page, appUrl) {
        this.page = page;
        this.appUrl = appUrl;
        this.origin = new URL(appUrl).origin + '/';
        this.step = 'load';
        this.errors = [];      // { kind, step, message, raw }
        this.requests = new Map();
    }

    static async open(browser, appUrl, { width = 1600, height = 1000 } = {}) {
        const page = await browser.newPage();
        const app = new AppPage(page, appUrl);
        app._wireEvents();
        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('Network.enable');
        await page.send('Network.setCacheDisabled', { cacheDisabled: false });
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT_SOURCE });
        await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
        await page.send('Page.bringToFront').catch(() => {});
        const loaded = page.once('Page.loadEventFired', 60000);
        const nav = await page.send('Page.navigate', { url: appUrl });
        if (nav.errorText) throw new Error('Navigation failed: ' + nav.errorText);
        await loaded;
        await app.waitReady();
        app.step = 'ready';
        return app;
    }

    _wireEvents() {
        const p = this.page;
        p.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => {
            const raw = d.exception?.description || d.exception?.value || d.text || 'unknown exception';
            this.errors.push({ kind: 'exception', step: this.step, message: normalizeMessage(raw, this.origin), raw: String(raw).slice(0, 2000) });
        });
        p.on('Runtime.consoleAPICalled', ({ type, args }) => {
            if (type !== 'error' && type !== 'assert') return;
            const raw = (args || []).map((a) => a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : (a.description || a.unserializableValue || a.type)).join(' ');
            this.errors.push({ kind: 'console.' + type, step: this.step, message: normalizeMessage(raw, this.origin), raw: raw.slice(0, 2000) });
        });
        p.on('Network.requestWillBeSent', ({ requestId, request }) => { this.requests.set(requestId, request.url); });
        p.on('Network.loadingFailed', ({ requestId, errorText, canceled }) => {
            const url = this.requests.get(requestId) || '?';
            if (canceled || url.startsWith('data:') || url.startsWith('blob:') || url.endsWith('/favicon.ico')) return;
            this.errors.push({ kind: 'network', step: this.step, message: normalizeMessage(`${errorText} ${url}`, this.origin), raw: `${errorText} ${url}` });
        });
        p.on('Network.responseReceived', ({ response }) => {
            if (response.status >= 400 && !response.url.endsWith('/favicon.ico')) {
                this.errors.push({ kind: 'network', step: this.step, message: normalizeMessage(`HTTP ${response.status} ${response.url}`, this.origin), raw: `HTTP ${response.status} ${response.url}` });
            }
        });
        // Fallback in case a dialog slips past the injected alert() override.
        p.on('Page.javascriptDialogOpening', ({ message, type }) => {
            this.errors.push({ kind: 'native-dialog', step: this.step, message: `${type}: ${message}`, raw: message });
            p.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
        });
    }

    eval(expr, timeoutMs) { return this.page.evaluate(expr, timeoutMs); }

    /** Robust readiness: #total-panels shows a non-zero number, the canvas exists, fonts settled. */
    async waitReady(timeoutMs = 45000) {
        const t0 = Date.now();
        let last = null;
        while (Date.now() - t0 < timeoutMs) {
            last = await this.eval(`(() => {
                const tp = document.getElementById('total-panels');
                const c = document.getElementById('three-canvas');
                const n = tp ? parseInt(String(tp.textContent).replace(/[^0-9]/g, ''), 10) : NaN;
                const r = c ? c.getBoundingClientRect() : null;
                return { ok: !!(c && n > 0 && r && r.width > 0), text: tp ? tp.textContent : null, state: document.readyState };
            })()`).catch((e) => ({ ok: false, err: String(e) }));
            if (last.ok) break;
            await sleep(100);
        }
        if (!last || !last.ok) throw new Error('App did not become ready: ' + JSON.stringify(last) + ' errors=' + JSON.stringify(this.errors.slice(0, 5)));
        await this.eval(`(async () => {
            try { await Promise.all(${JSON.stringify(FONT_PRELOADS)}.map((f) => document.fonts.load(f))); } catch (e) {}
            try { await document.fonts.ready; } catch (e) {}
        })()`, 30000);
        await sleep(400);
        await this.frames(2);
    }

    frames(n = 2) {
        return this.eval(`new Promise((res) => { let k = ${n}; const f = () => (--k <= 0 ? res(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`, 20000);
    }

    async settle(ms = 150) { await sleep(ms); await this.waitAnimations(); await this.frames(2); }

    /**
     * Wait for running finite CSS transitions/animations (Web Animations API) to finish, so computed
     * styles and screenshots are not captured mid-transition (the app uses 0.2-0.3s transitions).
     */
    waitAnimations(timeoutMs = 3000) {
        return this.eval(`(async () => {
            if (!document.getAnimations) return 0;
            const finite = document.getAnimations().filter((a) => {
                try { const t = a.effect && a.effect.getComputedTiming(); return t && Number.isFinite(t.endTime) && a.playState === 'running'; } catch (e) { return false; }
            });
            await Promise.race([
                Promise.all(finite.map((a) => a.finished.catch(() => null))),
                new Promise((r) => setTimeout(r, ${timeoutMs})),
            ]);
            return finite.length;
        })()`, timeoutMs + 5000);
    }

    async exists(selector) {
        return this.eval(`!!document.querySelector(${JSON.stringify(selector)})`);
    }

    async click(selector) {
        const ok = await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
        if (!ok) throw new Error('click: element not found: ' + selector);
        await this.settle();
    }

    /** Set a form control value and dispatch input + change (bubbling), like a user edit + commit. */
    async setValue(selector, value, events = ['input', 'change']) {
        const ok = await this.eval(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return false;
            el.value = ${JSON.stringify(String(value))};
            for (const t of ${JSON.stringify(events)}) el.dispatchEvent(new Event(t, { bubbles: true }));
            return true;
        })()`);
        if (!ok) throw new Error('setValue: element not found: ' + selector);
        await this.settle();
    }

    /** Import a config by feeding a JSON File to the hidden #import-input and waiting for the UI to update. */
    async importConfig(config, name = 'config.json') {
        const json = JSON.stringify(config, null, 2);
        const expectedSections = Array.isArray(config.sections) ? config.sections.length : null;
        const result = await this.eval(`(async () => {
            const input = document.getElementById('import-input');
            if (!input) return { ok: false, reason: 'no #import-input' };
            const container = document.getElementById('wall-sections');
            let mutated = false;
            const mo = new MutationObserver(() => { mutated = true; });
            if (container) mo.observe(container, { childList: true, subtree: true });
            const dt = new DataTransfer();
            dt.items.add(new File([${JSON.stringify(json)}], ${JSON.stringify(name)}, { type: 'application/json' }));
            input.files = dt.files;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            const t0 = performance.now();
            const want = ${JSON.stringify(expectedSections)};
            while (performance.now() - t0 < 10000) {
                const secs = parseInt((document.getElementById('total-sections') || {}).textContent, 10);
                if (mutated && (want === null || secs === want)) break;
                await new Promise((r) => setTimeout(r, 25));
            }
            mo.disconnect();
            const secs = parseInt((document.getElementById('total-sections') || {}).textContent, 10);
            return { ok: mutated && (want === null || secs === want), mutated, sections: secs };
        })()`, 20000);
        await sleep(250);
        await this.frames(2);
        return result;
    }

    /** Switch mesh mode through the radio UI (#mesh-mode-select). Clicks the option label like a user. */
    async selectMeshMode(mode) {
        const ok = await this.eval(`(() => {
            const root = document.getElementById('mesh-mode-select') || document;
            const input = root.querySelector('input[name="mesh-mode"][value=${JSON.stringify(mode)}]');
            const target = (input && input.closest('label')) || root.querySelector('[data-mode=${JSON.stringify(mode)}]') || input;
            if (!target) return false;
            target.click();
            return true;
        })()`);
        if (!ok) throw new Error('mesh mode option not found: ' + mode);
        await this.settle(200);
    }

    async meshModeState() {
        return this.eval(`(() => {
            const root = document.getElementById('mesh-mode-select');
            if (!root) return null;
            return [...root.querySelectorAll('input[name="mesh-mode"]')].map((i) => {
                const label = i.closest('label');
                return { value: i.value, checked: i.checked, labelActive: label ? label.classList.contains('active') : null };
            });
        })()`);
    }

    /**
     * Perform `action` (an async fn) and collect downloads it triggers.
     * Waits until at least `expect` new downloads arrived (or timeout), then a quiet period for stragglers.
     */
    async captureDownloads(action, { expect = 1, timeoutMs = 20000, quietMs = 500 } = {}) {
        const start = await this.eval('window.__captured.length');
        const errStart = this.errors.length;
        await action();
        const t0 = Date.now();
        let n = start;
        let errSeenAt = 0;
        while (Date.now() - t0 < timeoutMs) {
            n = await this.eval('window.__captured.length');
            if (n - start >= expect) break;
            // An exception after the click usually means the export died; don't wait the full timeout.
            if (this.errors.length > errStart) {
                if (!errSeenAt) errSeenAt = Date.now();
                else if (Date.now() - errSeenAt > 1500) break;
            }
            await sleep(50);
        }
        // Quiet period: catch late extra downloads (e.g. the MTL that follows the OBJ by ~100ms).
        let stableSince = Date.now();
        while (Date.now() - stableSince < quietMs) {
            await sleep(50);
            const m = await this.eval('window.__captured.length');
            if (m !== n) { n = m; stableSince = Date.now(); }
        }
        const out = [];
        for (let i = start; i < n; i++) {
            const d = await this.eval(`window.__readCaptured(${i})`, 120000);
            out.push({ filename: d.filename, type: d.type, size: d.size, data: Buffer.from(d.base64 || '', 'base64'), error: d.error });
        }
        return out;
    }

    async dialogs() { return this.eval('window.__dialogs.slice()'); }

    async screenshotCanvas() {
        await this.waitAnimations();
        await this.frames(2);
        const r = await this.eval(`(() => { const c = document.getElementById('three-canvas'); const b = c.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
        const res = await this.page.send('Page.captureScreenshot', {
            format: 'png',
            clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 },
            captureBeyondViewport: false,
            fromSurface: true,
        });
        return Buffer.from(res.data, 'base64');
    }

    async stats() {
        return this.eval(`(() => {
            const t = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };
            return { totalPixels: t('total-pixels'), totalPanels: t('total-panels'), totalSections: t('total-sections'), totalArc: t('total-arc') };
        })()`);
    }

    /** Normalized structural snapshot of #wall-sections (no raw innerHTML). */
    async sectionsSnapshot() {
        return this.eval(`(() => {
            const root = document.getElementById('wall-sections');
            if (!root) return null;
            return [...root.children].map((card, i) => ({
                index: i,
                collapsed: card.classList.contains('collapsed'),
                text: card.textContent.replace(/\\s+/g, ' ').trim(),
                inputs: [...card.querySelectorAll('input, select, textarea')].map((el) => {
                    const o = { tag: el.tagName.toLowerCase(), type: el.type || '', class: el.getAttribute('class') || '', value: el.value };
                    for (const a of el.attributes) if (a.name.startsWith('data-')) o[a.name] = a.value;
                    for (const n of ['min', 'max', 'step', 'maxlength']) if (el.hasAttribute(n)) o[n] = el.getAttribute(n);
                    return o;
                }),
                buttons: [...card.querySelectorAll('button')].map((b) => {
                    const o = { class: b.getAttribute('class') || '' };
                    for (const a of b.attributes) if (a.name.startsWith('data-')) o[a.name] = a.value;
                    return o;
                }),
                activeSwatches: [...card.querySelectorAll('[data-color].active')].map((s) => s.getAttribute('data-color')),
            }));
        })()`);
    }

    async cameraState() {
        return this.eval(`(() => {
            const t = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };
            const v = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
            const disp = (id) => { const el = document.getElementById(id); return el ? getComputedStyle(el).display : null; };
            const color = (id) => { const el = document.getElementById(id); return el ? getComputedStyle(el).color : null; };
            const texts = {};
            for (const id of ['camera-hfov', 'camera-vfov', 'camera-aspect', 'frustum-width', 'frustum-height', 'frustum-status-text', 'safe-distance', 'camera-preview-info', 'camera-preview-fov', 'camera-preview-res']) texts[id] = t(id);
            const values = {};
            for (const id of ['camera-filmback', 'filmback-width', 'filmback-height', 'camera-focal-length', 'camera-pos-x', 'camera-pos-y', 'camera-pos-z', 'camera-rot-x', 'camera-rot-y', 'camera-rot-z']) values[id] = v(id);
            const display = {};
            for (const id of ['camera-preview-options', 'camera-preview-window', 'custom-filmback', 'export-safe-distance']) display[id] = disp(id);
            const toggles = {};
            for (const id of ['toggle-camera-preview', 'toggle-safe-distance']) { const el = document.getElementById(id); toggles[id] = el ? el.classList.contains('active') : null; }
            return { texts, values, display, toggles, statusColor: color('frustum-status-text') };
        })()`);
    }

    /** Class lists / visibility of the toggles and option panels. */
    async uiState() {
        return this.eval(`(() => {
            const cls = (id) => { const el = document.getElementById(id); return el ? [...el.classList].sort() : null; };
            const disp = (id) => { const el = document.getElementById(id); return el ? getComputedStyle(el).display : null; };
            const v = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
            const toggles = {};
            for (const id of ['toggle-wireframe', 'toggle-frame', 'toggle-led-sim', 'toggle-panel-ids', 'toggle-section-labels', 'toggle-camera-preview', 'toggle-safe-distance', 'toggle-person', 'toggle-car', 'toggle-grid']) toggles[id] = cls(id);
            const display = {};
            for (const id of ['led-sim-options', 'panel-id-options', 'person-options', 'car-options', 'camera-preview-options', 'camera-preview-window']) display[id] = disp(id);
            const values = {};
            for (const id of ['led-layout', 'panel-border-thickness', 'panel-font-size', 'panel-font-color', 'section-label-size', 'section-label-color', 'person-pos-x', 'person-pos-z', 'person-rot-y', 'person-scale', 'car-pos-x', 'car-pos-z', 'car-rot-y', 'car-scale']) values[id] = v(id);
            return { toggles, display, values };
        })()`);
    }

    async gizmoState() {
        return this.eval(`(() => {
            const cls = (id) => { const el = document.getElementById(id); return el ? [...el.classList].sort() : null; };
            const sel = document.getElementById('selection-indicator');
            const pilot = document.getElementById('pilot-info');
            const space = document.getElementById('gizmo-space');
            const vis = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { display: cs.display, visibility: cs.visibility, opacity: cs.opacity, visibleClass: el.classList.contains('visible') }; };
            return {
                translate: cls('gizmo-translate'), rotate: cls('gizmo-rotate'), space: cls('gizmo-space'), pilot: cls('gizmo-pilot'),
                spaceText: space ? space.textContent.trim() : null, spaceTitle: space ? space.title : null,
                selectionText: sel ? sel.textContent.replace(/\\s+/g, ' ').trim() : null,
                selectionVisible: vis(sel),
                pilotInfoVisible: vis(pilot),
            };
        })()`);
    }

    async blurActive() {
        await this.eval(`(() => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); return true; })()`);
    }

    async keyPress(key) {
        const k = KEYS[key];
        if (!k) throw new Error('unknown key ' + key);
        const base = { key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
        await this.page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) });
        await this.page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
        await this.settle();
    }

    async mouse(type, x, y, extra = {}) {
        await this.page.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1, ...extra });
    }

    async canvasRect() {
        return this.eval(`(() => { const b = document.getElementById('three-canvas').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
    }

    async close() { await this.page.close(); }
}
