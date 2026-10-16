// Writes captured artifacts to disk and builds the per-scenario manifest entries.
import fs from 'node:fs';
import path from 'node:path';
import { sha256, readZip, kindForFilename } from './formats.mjs';

const safeName = (s) => String(s).replace(/[^a-zA-Z0-9._-]+/g, '_');

export class Recorder {
    constructor(outDir, scenario) {
        this.outDir = outDir;
        this.scenario = scenario;
        this.dir = path.join(outDir, safeName(scenario));
        fs.mkdirSync(this.dir, { recursive: true });
        this.outputs = {};
        this.downloadLog = [];   // [{ step, files: [...] }]
        this.stateLog = [];      // ordered state records
    }

    add(name, data, kind, meta = {}) {
        let key = name;
        for (let i = 2; this.outputs[key]; i++) key = `${name}#${i}`;
        const fname = safeName(key);
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
        fs.writeFileSync(path.join(this.dir, fname), buf);
        const entry = { file: `${safeName(this.scenario)}/${fname}`, sha256: sha256(buf), kind, bytes: buf.length, ...meta };
        if (kind === 'zip') {
            try {
                const entries = readZip(buf);
                const exDir = path.join(this.dir, fname + '.entries');
                entry.entries = entries.map((e) => {
                    if (!e.isDir) {
                        const p = path.join(exDir, ...e.name.split('/').map(safeName));
                        fs.mkdirSync(path.dirname(p), { recursive: true });
                        fs.writeFileSync(p, e.data);
                    }
                    return { name: e.name, isDir: e.isDir, size: e.data.length, sha256: e.isDir ? null : sha256(e.data) };
                });
            } catch (err) {
                entry.zipError = String(err.message || err);
            }
        }
        this.outputs[key] = entry;
        return key;
    }

    /** Record a JSON "state" observation (DOM text, stats, snapshots...). */
    state(name, obj) {
        this.stateLog.push(name);
        return this.add(`${name}.json`, JSON.stringify(obj, null, 2) + '\n', 'state');
    }

    /** Record all downloads produced by a step. Output names are `${step}__${filename}`. */
    downloads(step, dls) {
        this.downloadLog.push({ step, files: dls.map((d) => d.filename + (d.error ? ` (ERROR: ${d.error})` : '')) });
        for (const d of dls) {
            this.add(`${step}__${d.filename || 'unnamed'}`, d.data, kindForFilename(d.filename || ''), { mime: d.type });
        }
    }

    screenshot(name, png) {
        return this.add(`${name}.screenshot.png`, png, 'screenshot');
    }

    finish({ errors, dialogs, timings }) {
        this.add('downloads.json', JSON.stringify(this.downloadLog, null, 2) + '\n', 'state');
        this.add('dialogs.json', JSON.stringify(dialogs || [], null, 2) + '\n', 'state');
        this.add('console.json', JSON.stringify(errors || [], null, 2) + '\n', 'console');
        return { outputs: this.outputs, timings };
    }
}
