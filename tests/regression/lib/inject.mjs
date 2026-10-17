// Script injected into every page (Page.addScriptToEvaluateOnNewDocument) BEFORE app code runs.
// It only hooks standard browser APIs (never app internals):
//   * URL.createObjectURL            -> remember Blob by its object URL
//   * HTMLAnchorElement#click        -> record {filename, blob} for <a download> and suppress navigation
//   * capture-phase 'click' listener -> same, for anchors clicked via dispatchEvent
//   * window.alert/confirm/prompt    -> record message instead of blocking the page
//   * HTMLCanvasElement#getContext   -> remember each canvas that got a WebGL context (07 R2: the app must create
//                                       exactly one); the returned context is never changed
// Exposes window.__captured (downloads), window.__dialogs, window.__readCaptured(i) and window.__glCanvases().
export const INJECT_SOURCE = String.raw`
(() => {
    if (window.__harnessInstalled) return;
    Object.defineProperty(window, '__harnessInstalled', { value: true });
    const blobByUrl = new Map();
    const captured = [];
    const dialogs = [];
    Object.defineProperty(window, '__captured', { value: captured });
    Object.defineProperty(window, '__dialogs', { value: dialogs });

    const origCreate = URL.createObjectURL;
    URL.createObjectURL = function (obj) {
        const url = origCreate.call(URL, obj);
        try { if (obj instanceof Blob) blobByUrl.set(url, obj); } catch (e) { /* ignore */ }
        return url;
    };

    function record(a) {
        const href = a.href || a.getAttribute('href') || '';
        const filename = a.download || a.getAttribute('download') || '';
        captured.push({
            filename,
            href,
            blob: blobByUrl.get(href) || null,
            t: performance.now(),
        });
    }

    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        if (this.hasAttribute('download')) { record(this); return; }
        return origClick.call(this);
    };
    window.addEventListener('click', (e) => {
        const t = e.target;
        const a = t && t.closest ? t.closest('a[download]') : null;
        if (a) { e.preventDefault(); record(a); }
    }, true);

    // The canvases that received a WebGL context, in creation order. Only a non-null webgl / webgl2 /
    // experimental-webgl result is recorded, once per canvas; 2D contexts are ignored.
    const glCanvases = [];
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const context = origGetContext.call(this, type, ...rest);
        if (context && /webgl/i.test(String(type)) && !glCanvases.some((e) => e.canvas === this)) {
            glCanvases.push({ canvas: this, type: String(type) });
        }
        return context;
    };
    Object.defineProperty(window, '__glCanvases', {
        value: () => glCanvases.map((e) => ({ id: e.canvas.id || null, type: e.type, connected: e.canvas.isConnected })),
    });

    window.alert = function (msg) { dialogs.push({ type: 'alert', message: String(msg) }); };
    window.confirm = function (msg) { dialogs.push({ type: 'confirm', message: String(msg) }); return true; };
    window.prompt = function (msg, def) { dialogs.push({ type: 'prompt', message: String(msg) }); return def === undefined ? null : def; };

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => { const s = String(fr.result); resolve(s.slice(s.indexOf(',') + 1)); };
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
        });
    }

    Object.defineProperty(window, '__readCaptured', {
        value: async function (i) {
            const c = captured[i];
            if (!c) return null;
            let blob = c.blob;
            if (!blob && c.href) {
                try { blob = await (await fetch(c.href)).blob(); } catch (e) { blob = null; }
            }
            if (!blob) return { filename: c.filename, type: '', size: -1, base64: '', error: 'blob not available for ' + c.href.slice(0, 64) };
            return { filename: c.filename, type: blob.type || '', size: blob.size, base64: await blobToBase64(blob) };
        },
    });
})();
`;
