// Minimal Chrome launcher + Chrome DevTools Protocol client (zero dependencies).
// Uses Node's global WebSocket (Node >= 22) and fetch.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findChrome() {
    for (const p of CHROME_CANDIDATES) {
        try { if (fs.statSync(p).isFile()) return p; } catch { /* next */ }
    }
    throw new Error('No Chrome/Edge executable found. Set CHROME_PATH.');
}

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A CDP connection to the browser endpoint. Sessions are multiplexed with flatten=true. */
export class CDPConnection {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Set();
        this.closed = false;
        ws.addEventListener('message', (ev) => this._onMessage(ev.data));
        ws.addEventListener('close', () => {
            this.closed = true;
            for (const { reject } of this.pending.values()) reject(new Error('CDP connection closed'));
            this.pending.clear();
        });
    }

    static connect(wsUrl) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            ws.addEventListener('open', () => resolve(new CDPConnection(ws)), { once: true });
            ws.addEventListener('error', (e) => reject(new Error('WebSocket error: ' + (e.message || 'unknown'))), { once: true });
        });
    }

    _onMessage(data) {
        const msg = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
        if (msg.id !== undefined) {
            const p = this.pending.get(msg.id);
            if (!p) return;
            this.pending.delete(msg.id);
            if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}${msg.error.data ? ' (' + msg.error.data + ')' : ''}`));
            else p.resolve(msg.result);
        } else if (msg.method) {
            for (const l of this.listeners) {
                try { l(msg.method, msg.params || {}, msg.sessionId); } catch (e) { console.error('listener error', e); }
            }
        }
    }

    send(method, params = {}, sessionId = undefined, timeoutMs = 60000) {
        if (this.closed) return Promise.reject(new Error('CDP connection closed'));
        const id = this.nextId++;
        const msg = { id, method, params };
        if (sessionId) msg.sessionId = sessionId;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`CDP timeout after ${timeoutMs}ms: ${method}`));
                }
            }, timeoutMs);
            this.pending.set(id, {
                method,
                resolve: (v) => { clearTimeout(timer); resolve(v); },
                reject: (e) => { clearTimeout(timer); reject(e); },
            });
            this.ws.send(JSON.stringify(msg));
        });
    }

    onEvent(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

    close() { try { this.ws.close(); } catch { /* ignore */ } }
}

/** A page target session. */
export class PageSession {
    constructor(conn, targetId, sessionId) {
        this.conn = conn;
        this.targetId = targetId;
        this.sessionId = sessionId;
        this.handlers = new Map();
        this._off = conn.onEvent((method, params, sid) => {
            if (sid !== this.sessionId) return;
            const hs = this.handlers.get(method);
            if (hs) for (const h of [...hs]) h(params);
        });
    }
    send(method, params = {}, timeoutMs) { return this.conn.send(method, params, this.sessionId, timeoutMs); }
    on(method, fn) {
        if (!this.handlers.has(method)) this.handlers.set(method, new Set());
        this.handlers.get(method).add(fn);
        return () => this.handlers.get(method)?.delete(fn);
    }
    once(method, timeoutMs = 30000, predicate = () => true) {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => { off(); reject(new Error(`Timed out waiting for ${method}`)); }, timeoutMs);
            const off = this.on(method, (p) => {
                if (!predicate(p)) return;
                clearTimeout(t); off(); resolve(p);
            });
        });
    }
    /** Evaluate an expression in the page; awaits promises and returns by value. Throws on page-side exceptions. */
    async evaluate(expression, timeoutMs = 60000) {
        const res = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        }, timeoutMs);
        if (res.exceptionDetails) {
            const d = res.exceptionDetails;
            const desc = d.exception?.description || d.exception?.value || d.text;
            throw new Error('Page evaluation failed: ' + desc);
        }
        return res.result?.value;
    }
    async close() {
        this._off();
        try { await this.conn.send('Target.closeTarget', { targetId: this.targetId }, undefined, 10000); } catch { /* ignore */ }
    }
}

/** Launch a headless Chrome and connect to it. Returns { conn, version, newPage(), close() }. */
export async function launchChrome(opts = {}) {
    const chromePath = opts.chromePath || findChrome();
    const width = opts.width || 1600;
    const height = opts.height || 1000;
    const port = await freePort();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-regression-chrome-'));
    const args = [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        `--window-size=${width},${height}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--force-device-scale-factor=1',
        '--hide-scrollbars',
        '--mute-audio',
        '--lang=en-US',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-extensions',
        '--disable-sync',
        '--disable-component-update',
        '--disable-default-apps',
        '--font-render-hinting=none',
        'about:blank',
    ];
    const proc = spawn(chromePath, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 20000) stderr = stderr.slice(-20000); });

    let killed = false;
    const hardKill = () => {
        if (killed) return;
        killed = true;
        try {
            if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
            else proc.kill('SIGKILL');
        } catch { /* ignore */ }
    };
    const onExit = () => hardKill();
    process.on('exit', onExit);

    // Discover the browser websocket endpoint.
    let version = null;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (proc.exitCode !== null) throw new Error('Chrome exited early: ' + stderr.slice(-2000));
        try {
            const r = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (r.ok) { version = await r.json(); break; }
        } catch { /* not up yet */ }
        await sleep(150);
    }
    if (!version) { hardKill(); throw new Error('Could not reach Chrome DevTools endpoint. stderr: ' + stderr.slice(-2000)); }
    const conn = await CDPConnection.connect(version.webSocketDebuggerUrl);

    async function newPage() {
        const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
        return new PageSession(conn, targetId, sessionId);
    }

    async function close() {
        try { await conn.send('Browser.close', {}, undefined, 5000); } catch { /* ignore */ }
        conn.close();
        // Give Chrome a moment to exit gracefully, then make sure the whole tree is gone.
        const t0 = Date.now();
        while (proc.exitCode === null && Date.now() - t0 < 3000) await sleep(100);
        hardKill();
        process.off('exit', onExit);
        for (let i = 0; i < 10; i++) {
            try { fs.rmSync(userDataDir, { recursive: true, force: true }); break; } catch { await sleep(300); }
        }
    }

    return { conn, version, newPage, close, chromePath };
}
