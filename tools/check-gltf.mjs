#!/usr/bin/env node
// Structural glTF 2.0 check: the subset of the Khronos validation rules that the Phase 2 exporters rely on
// (docs/improvements/08-bugfix-roadmap.md, section 8.2). Node only, no dependencies.
//   node tools/check-gltf.mjs <file.gltf> [...]
// Exit code: 0 = every file passes, 1 = at least one structural error, 2 = usage error.
//
// Checked:
//   * buffers: embedded data URIs (or files next to the .gltf) decode to exactly `byteLength` bytes;
//   * bufferViews: valid buffer, within the buffer, byteStride a multiple of 4 in [4, 252];
//   * accessors: valid componentType / type / count, within their bufferView, `byteOffset` aligned to the component
//     size (accessor offset and accessor + bufferView offset); vertex attributes 4-byte aligned, and every bufferView
//     with target ARRAY_BUFFER starts on a 4-byte boundary;
//   * primitives: valid attribute, index and material references, equal attribute counts, triangle index counts a
//     multiple of 3, index values below the vertex count and never the primitive-restart value of their type (255 in
//     5121, 65,535 in 5123, 4,294,967,295 in 5125);
//   * POSITION: VEC3 float, `min` and `max` present and correct. They are compared after Math.fround: the legacy writer
//     stores the float64 extremes of values that the buffer holds as float32 (docs/DEFECTS.md, second rejected report),
//     so a stored extreme passes when Math.fround(stored) equals the float32 extreme exactly, and fails when it is
//     off by one float32 ulp;
//   * NORMAL: VEC3 float, unit length within 1e-6; TEXCOORD_0 and TEXCOORD_1: VEC2 with the POSITION count;
//   * nodes, scenes and meshes reference valid indices.
// The full Khronos glTF-Validator is a recorded manual step (08 section 8.6).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const COMPONENTS = {
    5120: { size: 1, read: (dv, o) => dv.getInt8(o), name: 'BYTE' },
    5121: { size: 1, read: (dv, o) => dv.getUint8(o), name: 'UNSIGNED_BYTE' },
    5122: { size: 2, read: (dv, o) => dv.getInt16(o, true), name: 'SHORT' },
    5123: { size: 2, read: (dv, o) => dv.getUint16(o, true), name: 'UNSIGNED_SHORT' },
    5125: { size: 4, read: (dv, o) => dv.getUint32(o, true), name: 'UNSIGNED_INT' },
    5126: { size: 4, read: (dv, o) => dv.getFloat32(o, true), name: 'FLOAT' },
};
export const TYPE_SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const RESTART = { 5121: 255, 5123: 65535, 5125: 4294967295 };
const ARRAY_BUFFER = 34962;

const isIndex = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

/**
 * Decode every buffer: base64 data URIs, or files relative to `baseDir`. Returns { buffers: (Buffer|null)[], errors }.
 */
export function loadBuffers(doc, baseDir = null) {
    const errors = [];
    const buffers = (doc.buffers || []).map((b, i) => {
        if (!Number.isInteger(b.byteLength) || b.byteLength < 1) errors.push(`buffers[${i}]: byteLength must be a positive integer`);
        let data = null;
        if (typeof b.uri === 'string' && b.uri.startsWith('data:')) {
            const comma = b.uri.indexOf(',');
            if (comma < 0 || !/;base64$/.test(b.uri.slice(0, comma))) errors.push(`buffers[${i}]: data URI is not base64`);
            else data = Buffer.from(b.uri.slice(comma + 1), 'base64');
        } else if (typeof b.uri === 'string' && baseDir) {
            const p = path.resolve(baseDir, decodeURIComponent(b.uri));
            if (fs.existsSync(p)) data = fs.readFileSync(p);
            else errors.push(`buffers[${i}]: external file ${b.uri} not found`);
        } else {
            errors.push(`buffers[${i}]: no embedded data (GLB binary chunks are not supported)`);
        }
        if (data && data.length !== b.byteLength) errors.push(`buffers[${i}]: decoded ${data.length} bytes, byteLength says ${b.byteLength}`);
        return data;
    });
    return { buffers, errors };
}

/**
 * Read accessor `index` as a flat array of numbers (count * components). Throws on an out-of-bounds read.
 * An accessor without a bufferView reads as zeros (sparse accessors are not supported).
 */
export function readAccessor(doc, buffers, index) {
    const acc = doc.accessors[index];
    const comp = COMPONENTS[acc.componentType];
    const nc = TYPE_SIZES[acc.type];
    if (!comp || !nc) throw new Error(`accessors[${index}]: unsupported componentType/type`);
    const values = new Array(acc.count * nc).fill(0);
    if (acc.bufferView === undefined) return values;
    const bv = doc.bufferViews[acc.bufferView];
    const buf = buffers[bv.buffer];
    if (!buf) throw new Error(`accessors[${index}]: buffer ${bv.buffer} has no data`);
    const stride = bv.byteStride || comp.size * nc;
    const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let i = 0; i < acc.count; i++) {
        for (let c = 0; c < nc; c++) {
            const off = base + i * stride + c * comp.size;
            if (off + comp.size > buf.length) throw new Error(`accessors[${index}]: read past the end of buffer ${bv.buffer}`);
            values[i * nc + c] = comp.read(dv, off);
        }
    }
    return values;
}

/**
 * The structural checks on a parsed glTF document. Returns the list of error strings (empty when it passes).
 */
export function checkGltfDocument(doc, { baseDir = null } = {}) {
    const errors = [];
    const err = (m) => errors.push(m);
    if (!doc || typeof doc !== 'object') return ['not a JSON object'];
    if (!doc.asset || doc.asset.version !== '2.0') err('asset.version must be "2.0"');

    const { buffers, errors: bufErrors } = loadBuffers(doc, baseDir);
    errors.push(...bufErrors);
    const nBuffers = (doc.buffers || []).length;
    const bufferViews = doc.bufferViews || [];
    const accessors = doc.accessors || [];
    const meshes = doc.meshes || [];
    const nodes = doc.nodes || [];
    const materials = doc.materials || [];

    bufferViews.forEach((bv, i) => {
        if (!isIndex(bv.buffer, nBuffers)) { err(`bufferViews[${i}]: buffer ${bv.buffer} does not exist`); return; }
        const off = bv.byteOffset || 0;
        if (!Number.isInteger(bv.byteLength) || bv.byteLength < 1) err(`bufferViews[${i}]: byteLength must be a positive integer`);
        if (!Number.isInteger(off) || off < 0) err(`bufferViews[${i}]: byteOffset must be a non-negative integer`);
        const declared = doc.buffers[bv.buffer].byteLength;
        if (off + bv.byteLength > declared) err(`bufferViews[${i}]: bytes ${off}..${off + bv.byteLength} exceed buffer ${bv.buffer} (${declared} bytes)`);
        if (bv.byteStride !== undefined && (!Number.isInteger(bv.byteStride) || bv.byteStride < 4 || bv.byteStride > 252 || bv.byteStride % 4)) {
            err(`bufferViews[${i}]: byteStride ${bv.byteStride} must be a multiple of 4 in [4, 252]`);
        }
        if (bv.target === ARRAY_BUFFER && off % 4) err(`bufferViews[${i}]: vertex-attribute bufferView byteOffset ${off} is not 4-byte aligned`);
    });

    const accessorOk = accessors.map((acc, i) => {
        const comp = COMPONENTS[acc.componentType];
        const nc = TYPE_SIZES[acc.type];
        let ok = true;
        if (!comp) { err(`accessors[${i}]: invalid componentType ${acc.componentType}`); ok = false; }
        if (!nc) { err(`accessors[${i}]: invalid type ${acc.type}`); ok = false; }
        if (!Number.isInteger(acc.count) || acc.count < 1) { err(`accessors[${i}]: count must be a positive integer`); ok = false; }
        if (!ok) return false;
        for (const k of ['min', 'max']) {
            if (acc[k] !== undefined && (!Array.isArray(acc[k]) || acc[k].length !== nc)) { err(`accessors[${i}]: ${k} must have ${nc} components`); ok = false; }
        }
        if (acc.bufferView === undefined) return ok;
        if (!isIndex(acc.bufferView, bufferViews.length)) { err(`accessors[${i}]: bufferView ${acc.bufferView} does not exist`); return false; }
        const bv = bufferViews[acc.bufferView];
        const aOff = acc.byteOffset || 0;
        const elem = comp.size * nc;
        const stride = bv.byteStride || elem;
        if (aOff % comp.size) { err(`accessors[${i}]: byteOffset ${aOff} is not a multiple of the component size ${comp.size}`); ok = false; }
        if (((bv.byteOffset || 0) + aOff) % comp.size) {
            err(`accessors[${i}]: offset ${(bv.byteOffset || 0) + aOff} into buffer ${bv.buffer} (bufferView ${acc.bufferView} byteOffset ${bv.byteOffset || 0} + ${aOff}) is not a multiple of the component size ${comp.size}`);
            ok = false;
        }
        const end = aOff + stride * (acc.count - 1) + elem;
        if (end > bv.byteLength) { err(`accessors[${i}]: count ${acc.count} needs ${end} bytes, bufferView ${acc.bufferView} has ${bv.byteLength}`); ok = false; }
        return ok;
    });

    const values = new Map();
    const read = (i) => {
        if (!values.has(i)) values.set(i, readAccessor(doc, buffers, i));
        return values.get(i);
    };

    meshes.forEach((mesh, m) => {
        (mesh.primitives || []).forEach((prim, p) => {
            const where = `meshes[${m}]${mesh.name ? ` "${mesh.name}"` : ''}.primitives[${p}]`;
            const attrs = prim.attributes || {};
            let vertexCount = null;
            for (const [name, accIndex] of Object.entries(attrs)) {
                if (!isIndex(accIndex, accessors.length)) { err(`${where}: attribute ${name} references missing accessor ${accIndex}`); continue; }
                const acc = accessors[accIndex];
                if (vertexCount === null) vertexCount = acc.count;
                else if (acc.count !== vertexCount) err(`${where}: attribute ${name} has count ${acc.count}, other attributes ${vertexCount}`);
                if (acc.bufferView !== undefined && isIndex(acc.bufferView, bufferViews.length)) {
                    const total = (bufferViews[acc.bufferView].byteOffset || 0) + (acc.byteOffset || 0);
                    if ((acc.byteOffset || 0) % 4 || total % 4) err(`${where}: attribute ${name} (accessor ${accIndex}) offset ${total} is not 4-byte aligned`);
                }
            }
            if (attrs.POSITION === undefined) err(`${where}: no POSITION attribute`);
            if (prim.material !== undefined && !isIndex(prim.material, materials.length)) err(`${where}: material ${prim.material} does not exist`);

            const pi = attrs.POSITION;
            if (isIndex(pi, accessors.length) && accessorOk[pi]) {
                const acc = accessors[pi];
                if (acc.type !== 'VEC3' || acc.componentType !== 5126) err(`${where}: POSITION must be VEC3 FLOAT`);
                else if (!Array.isArray(acc.min) || !Array.isArray(acc.max)) err(`${where}: POSITION accessor ${pi} has no min/max`);
                else {
                    try {
                        const v = read(pi);
                        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
                        for (let i = 0; i < v.length; i++) {
                            const c = i % 3;
                            if (v[i] < min[c]) min[c] = v[i];
                            if (v[i] > max[c]) max[c] = v[i];
                        }
                        for (let c = 0; c < 3; c++) {
                            if (Math.fround(acc.min[c]) !== min[c]) err(`${where}: POSITION min[${c}] ${acc.min[c]} (float32 ${Math.fround(acc.min[c])}) != data minimum ${min[c]}`);
                            if (Math.fround(acc.max[c]) !== max[c]) err(`${where}: POSITION max[${c}] ${acc.max[c]} (float32 ${Math.fround(acc.max[c])}) != data maximum ${max[c]}`);
                        }
                    } catch (e) { err(`${where}: ${e.message}`); }
                }
            }
            const ni = attrs.NORMAL;
            if (ni !== undefined && isIndex(ni, accessors.length) && accessorOk[ni]) {
                const acc = accessors[ni];
                if (acc.type !== 'VEC3' || acc.componentType !== 5126) err(`${where}: NORMAL must be VEC3 FLOAT`);
                else {
                    try {
                        const v = read(ni);
                        let bad = 0, first = '';
                        for (let i = 0; i < acc.count; i++) {
                            const len = Math.hypot(v[3 * i], v[3 * i + 1], v[3 * i + 2]);
                            if (!(Math.abs(len - 1) <= 1e-6)) { if (!bad) first = `vertex ${i} has length ${len}`; bad++; }
                        }
                        if (bad) err(`${where}: ${bad} NORMAL vector(s) not unit length within 1e-6 (first: ${first})`);
                    } catch (e) { err(`${where}: ${e.message}`); }
                }
            }
            for (const key of ['TEXCOORD_0', 'TEXCOORD_1']) {
                const ti = attrs[key];
                if (ti === undefined || !isIndex(ti, accessors.length)) continue;
                const acc = accessors[ti];
                if (acc.type !== 'VEC2') err(`${where}: ${key} must be VEC2`);
                if (isIndex(pi, accessors.length) && acc.count !== accessors[pi].count) err(`${where}: ${key} count ${acc.count} != POSITION count ${accessors[pi].count}`);
            }

            if (prim.indices !== undefined) {
                if (!isIndex(prim.indices, accessors.length)) { err(`${where}: indices accessor ${prim.indices} does not exist`); return; }
                const acc = accessors[prim.indices];
                if (acc.type !== 'SCALAR' || !(acc.componentType in RESTART)) { err(`${where}: indices must be SCALAR UNSIGNED_BYTE/SHORT/INT`); return; }
                if ((prim.mode === undefined || prim.mode === 4) && acc.count % 3) err(`${where}: ${acc.count} triangle indices is not a multiple of 3`);
                if (!accessorOk[prim.indices]) return;
                try {
                    const v = read(prim.indices);
                    const restart = RESTART[acc.componentType];
                    let restarts = 0, outOfRange = 0, firstOut = -1;
                    for (const x of v) {
                        if (x === restart) restarts++;
                        else if (vertexCount !== null && x >= vertexCount) { outOfRange++; if (firstOut < 0) firstOut = x; }
                    }
                    if (restarts) err(`${where}: ${restarts} index value(s) equal ${restart}, the primitive-restart value of ${COMPONENTS[acc.componentType].name}`);
                    if (outOfRange) err(`${where}: ${outOfRange} index value(s) >= the vertex count ${vertexCount} (first: ${firstOut})`);
                } catch (e) { err(`${where}: ${e.message}`); }
            }
        });
    });

    nodes.forEach((n, i) => {
        if (n.mesh !== undefined && !isIndex(n.mesh, meshes.length)) err(`nodes[${i}]: mesh ${n.mesh} does not exist`);
        for (const c of n.children || []) if (!isIndex(c, nodes.length)) err(`nodes[${i}]: child ${c} does not exist`);
    });
    (doc.scenes || []).forEach((s, i) => {
        for (const n of s.nodes || []) if (!isIndex(n, nodes.length)) err(`scenes[${i}]: node ${n} does not exist`);
    });
    if (doc.scene !== undefined && !isIndex(doc.scene, (doc.scenes || []).length)) err(`scene ${doc.scene} does not exist`);
    return errors;
}

/** Check one file. Returns { file, errors }. */
export function checkGltfFile(file) {
    let doc;
    try {
        doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return { file, errors: [`cannot read or parse: ${e.message}`] };
    }
    return { file, errors: checkGltfDocument(doc, { baseDir: path.dirname(file) }) };
}

export function main(argv = process.argv.slice(2), log = console.log) {
    const files = argv.filter((a) => !a.startsWith('--'));
    if (!files.length || argv.includes('--help')) {
        log('Usage: node tools/check-gltf.mjs <file.gltf> [...]');
        return files.length ? 0 : 2;
    }
    let failed = 0;
    for (const f of files) {
        const { errors } = checkGltfFile(f);
        if (!errors.length) { log(`PASS  ${f}`); continue; }
        failed++;
        log(`FAIL  ${f}`);
        for (const e of errors.slice(0, 20)) log(`        ${e}`);
        if (errors.length > 20) log(`        ... ${errors.length - 20} more`);
    }
    log(`${files.length - failed}/${files.length} glTF file(s) pass`);
    return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main());
