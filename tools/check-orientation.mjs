#!/usr/bin/env node
// Face-orientation check (specified in docs/improvements/01-normals.md section 8.1, shipped by
// docs/improvements/08-bugfix-roadmap.md P2-0, section 8.2). Node only, no dependencies.
//   node tools/check-orientation.mjs <file.obj|file.gltf> [...]
// For every triangle of every object, the geometric normal of its counter-clockwise winding, (b - a) x (c - a), must
// have a positive dot product with the vertex normal stored at each of its three vertices. A triangle fails when a
// vertex faces away (dot < 0), is perpendicular or the triangle is degenerate (dot = 0), or has no vertex normal at all
// (an OBJ face without `/n` references, a glTF primitive without NORMAL). Polygons are fan-triangulated.
// Prints one PASS/FAIL line per object (OBJ `o`/`g` groups; glTF mesh primitives).
// Exit code: 0 = every object passes, 1 = at least one failing triangle (or an unreadable file), 2 = usage error.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBuffers, readAccessor } from './check-gltf.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A per-object tally: triangles, failures by reason and the first failing triangle. */
class ObjectReport {
    constructor(name) {
        this.name = name;
        this.triangles = 0;
        this.failures = 0;
        this.reasons = {};
        this.first = null;
    }

    fail(reason, detail) {
        this.failures++;
        this.reasons[reason] = (this.reasons[reason] || 0) + 1;
        if (!this.first) this.first = detail;
    }

    /**
     * Check one triangle. `p` holds its three positions, `n` its three vertex normals (null where missing), `label`
     * names it in the report.
     */
    triangle(p, n, label) {
        this.triangles++;
        if (p.some((v) => !v)) { this.fail('bad vertex index', `${label}: vertex index out of range`); return; }
        if (n.some((v) => !v)) { this.fail('no vertex normal', `${label}: no vertex normal`); return; }
        const g = cross(sub(p[1], p[0]), sub(p[2], p[0]));
        if (g[0] === 0 && g[1] === 0 && g[2] === 0) { this.fail('degenerate', `${label}: zero-area triangle`); return; }
        for (let k = 0; k < 3; k++) {
            const d = dot(g, n[k]);
            if (d > 0) continue;
            this.fail(d < 0 ? 'facing away' : 'perpendicular', `${label}: geometric normal (${g.map((x) => +x.toPrecision(6)).join(', ')}) `
                + `vs vertex normal (${n[k].join(', ')}) at corner ${k}: dot ${+d.toPrecision(6)}`);
            return;
        }
    }
}

/** Check OBJ text. Returns an array of ObjectReport (one per `o`/`g` group that has faces). */
export function checkObjText(text) {
    const v = [], vn = [];
    const objects = [];
    let current = null;
    const object = () => {
        if (!current) { current = new ObjectReport('(no object name)'); objects.push(current); }
        return current;
    };
    const resolve = (raw, count) => {
        if (raw === undefined || raw === '') return null;
        const i = parseInt(raw, 10);
        if (!Number.isInteger(i) || i === 0) return -1;
        return i > 0 ? i - 1 : count + i;
    };
    const lines = text.split(/\r?\n/);
    for (let ln = 0; ln < lines.length; ln++) {
        const t = lines[ln].trim().split(/\s+/);
        switch (t[0]) {
            case 'v': v.push([Number(t[1]), Number(t[2]), Number(t[3])]); break;
            case 'vn': vn.push([Number(t[1]), Number(t[2]), Number(t[3])]); break;
            case 'o':
            case 'g':
                current = new ObjectReport(t.slice(1).join(' ') || '(unnamed)');
                objects.push(current);
                break;
            case 'f': {
                const corners = t.slice(1).map((tok) => {
                    const [vi, , ni] = tok.split('/');
                    const a = resolve(vi, v.length), b = resolve(ni, vn.length);
                    return { p: a !== null && a >= 0 ? v[a] : undefined, n: b === null ? null : b >= 0 ? (vn[b] || undefined) : undefined };
                });
                for (let k = 1; k + 1 < corners.length; k++) {
                    const c = [corners[0], corners[k], corners[k + 1]];
                    object().triangle(c.map((x) => x.p), c.map((x) => x.n), `line ${ln + 1}`);
                }
                break;
            }
            default: break;
        }
    }
    return objects.filter((o) => o.triangles > 0);
}

/** Check a parsed glTF document (embedded buffers, or files relative to `baseDir`). Returns ObjectReport[]. */
export function checkGltfOrientation(doc, { baseDir = null } = {}) {
    const { buffers, errors } = loadBuffers(doc, baseDir);
    if (errors.length) throw new Error(errors.join('; '));
    const reports = [];
    (doc.meshes || []).forEach((mesh, m) => {
        const prims = mesh.primitives || [];
        prims.forEach((prim, p) => {
            const name = `${mesh.name || `mesh ${m}`}${prims.length > 1 ? ` primitive ${p}` : ''}`;
            const r = new ObjectReport(name);
            reports.push(r);
            const mode = prim.mode === undefined ? 4 : prim.mode;
            const attrs = prim.attributes || {};
            if (attrs.POSITION === undefined) { r.fail('no POSITION', 'no POSITION attribute'); return; }
            const pos = readAccessor(doc, buffers, attrs.POSITION);
            const nrm = attrs.NORMAL === undefined ? null : readAccessor(doc, buffers, attrs.NORMAL);
            const count = doc.accessors[attrs.POSITION].count;
            const idx = prim.indices === undefined ? [...Array(count).keys()] : readAccessor(doc, buffers, prim.indices);
            const tris = [];
            if (mode === 4) for (let i = 0; i + 2 < idx.length; i += 3) tris.push([idx[i], idx[i + 1], idx[i + 2]]);
            else if (mode === 5) for (let i = 0; i + 2 < idx.length; i++) tris.push(i % 2 ? [idx[i + 1], idx[i], idx[i + 2]] : [idx[i], idx[i + 1], idx[i + 2]]);
            else if (mode === 6) for (let i = 1; i + 1 < idx.length; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
            else return;   // points and lines have no faces
            const at = (arr, i) => (i >= 0 && i < count ? [arr[3 * i], arr[3 * i + 1], arr[3 * i + 2]] : undefined);
            tris.forEach((t, k) => r.triangle(t.map((i) => at(pos, i)), t.map((i) => (nrm ? at(nrm, i) : undefined)), `triangle ${k} (indices ${t.join(', ')})`));
            if (!nrm && r.triangles) r.reasons = { 'no NORMAL attribute': r.failures };
        });
    });
    return reports;
}

/** Check one .obj or .gltf file. Returns { file, objects: ObjectReport[], error? }. */
export function checkOrientationFile(file) {
    try {
        const text = fs.readFileSync(file, 'utf8');
        if (/\.gltf$/i.test(file)) return { file, objects: checkGltfOrientation(JSON.parse(text), { baseDir: path.dirname(file) }) };
        if (/\.obj$/i.test(file)) return { file, objects: checkObjText(text) };
        return { file, objects: [], error: 'not an .obj or .gltf file' };
    } catch (e) {
        return { file, objects: [], error: `cannot check: ${e.message}` };
    }
}

export function main(argv = process.argv.slice(2), log = console.log) {
    const files = argv.filter((a) => !a.startsWith('--'));
    if (!files.length || argv.includes('--help')) {
        log('Usage: node tools/check-orientation.mjs <file.obj|file.gltf> [...]');
        return files.length ? 0 : 2;
    }
    let failedObjects = 0, failedFiles = 0, total = 0;
    for (const f of files) {
        const { objects, error } = checkOrientationFile(f);
        if (error) { failedFiles++; log(`FAIL  ${f}: ${error}`); continue; }
        if (!objects.length) log(`PASS  ${f}: no triangles`);
        for (const o of objects) {
            total++;
            if (!o.failures) { log(`PASS  ${f} :: ${o.name} (${o.triangles} triangles)`); continue; }
            failedObjects++;
            const why = Object.entries(o.reasons).map(([k, n]) => `${k} ${n}`).join(', ');
            log(`FAIL  ${f} :: ${o.name}: ${o.failures} of ${o.triangles} triangles (${why}); first: ${o.first}`);
        }
    }
    log(`${total - failedObjects}/${total} object(s) pass${failedFiles ? `; ${failedFiles} file(s) could not be checked` : ''}`);
    return failedObjects || failedFiles ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main());
