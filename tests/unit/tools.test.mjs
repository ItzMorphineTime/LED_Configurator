// Unit tests for the structural export checkers of docs/improvements/08-bugfix-roadmap.md section 8.2:
// tools/check-orientation.mjs (OBJ and glTF face orientation against the vertex normals; since 01 T1 also the .obj and
// .gltf entries of ZIP archives and directories walked recursively) and tools/check-gltf.mjs (the structural subset of
// the Khronos glTF rules, including the Math.fround rule for POSITION min/max).
// Hand-built good files pass; a reversed triangle, a 65,535 index in UNSIGNED_SHORT and a misaligned bufferView fail.
// Also tools/make-cap-wall.mjs (01 T1): the committed tests/fixtures/normals-max-wall.json is its output and imports as
// the largest importable wall (200 sections of 50 x 20 panels, combined).
// Run: node --test tests/unit/tools.test.mjs   (zero dependencies)

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { checkObjText, checkGltfOrientation, checkOrientationZip, checkOrientationPaths, collectFiles } from '../../tools/check-orientation.mjs';
import { checkGltfDocument } from '../../tools/check-gltf.mjs';
import { CAP_WALL, DEFAULT_OUT as CAP_WALL_FILE, capWallText } from '../../tools/make-cap-wall.mjs';
import { ProjectSerializer } from '../../js/io/ProjectSerializer.js';
import { sectionsFromProject } from '../../js/io/ProjectSchema.js';
import { Project } from '../../js/domain/Project.js';
import { Palette } from '../../js/theme/Theme.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';
import { layoutProject } from '../../js/geometry/WallLayout.js';
import { WallMeshBuilder } from '../../js/geometry/WallMeshBuilder.js';
import { computeAtlas } from '../../js/geometry/TextureAtlas.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.resolve(HERE, '..', '..', 'tools');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'led-tools-test-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// ---- hand-built files ----------------------------------------------------------------------------

/** A unit quad in the XY plane, counter-clockwise seen from +Z, with +Z vertex normals. */
const GOOD_OBJ = `# test
o Quad
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vt 0 0
vn 0 0 1
f 1/1/1 2/1/1 3/1/1
f 1//1 3//1 4//1
o Polygon
f -4//1 -3//1 -2//1 -1//1
`;

/** The next float32 above x (one ulp up). */
function nextFloat32Up(x) {
  const f = new Float32Array([x]);
  const u = new Uint32Array(f.buffer);
  u[0] += f[0] >= 0 ? 1 : -1;
  return f[0];
}

/**
 * A one-primitive glTF with embedded buffers. Layout: [pad] POSITION | NORMAL? | TEXCOORD_0? | indices.
 * `pad` bytes before the positions make a misaligned file; min/max default to the exact float32 extremes.
 */
function gltf({ positions, normals = null, uvs = null, indices = null, indexType = 5123, pad = 0, min = null, max = null, texCount = null }) {
  const parts = [];
  const views = [];
  const accessors = [];
  let offset = 0;
  const add = (bytes, target) => {
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    parts.push(bytes);
    offset += bytes.length;
    return views.length - 1;
  };
  if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
  const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
  const pos = new Float32Array(positions);
  const mn = [0, 1, 2].map((c) => Math.min(...[...pos].filter((_, i) => i % 3 === c)));
  const mx = [0, 1, 2].map((c) => Math.max(...[...pos].filter((_, i) => i % 3 === c)));
  const attributes = {};
  attributes.POSITION = accessors.push({ bufferView: add(f32(positions), 34962), byteOffset: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: min || mn, max: max || mx }) - 1;
  if (normals) attributes.NORMAL = accessors.push({ bufferView: add(f32(normals), 34962), byteOffset: 0, componentType: 5126, count: normals.length / 3, type: 'VEC3' }) - 1;
  if (uvs) attributes.TEXCOORD_0 = accessors.push({ bufferView: add(f32(uvs), 34962), byteOffset: 0, componentType: 5126, count: texCount ?? uvs.length / 2, type: 'VEC2' }) - 1;
  const primitive = { attributes, material: 0 };
  if (indices) {
    const bytes = indexType === 5125 ? Buffer.from(new Uint32Array(indices).buffer) : Buffer.from(new Uint16Array(indices).buffer);
    primitive.indices = accessors.push({ bufferView: add(bytes, 34963), byteOffset: 0, componentType: indexType, count: indices.length, type: 'SCALAR' }) - 1;
  }
  const data = Buffer.concat(parts);
  return {
    asset: { version: '2.0', generator: 'test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Quad', mesh: 0 }],
    meshes: [{ name: 'Quad', primitives: [primitive] }],
    materials: [{ name: 'M' }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: data.length, uri: `data:application/octet-stream;base64,${data.toString('base64')}` }],
  };
}

const QUAD = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
const UP = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
const CCW = [0, 1, 2, 0, 2, 3];
const goodGltf = () => gltf({ positions: QUAD, normals: UP, uvs: [0, 0, 1, 0, 1, 1, 0, 1], indices: CCW });

const write = (name, content) => {
  const p = path.join(TMP, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.isBuffer(content) || typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return p;
};

/** CRC-32 (IEEE), for the stored ZIP below. */
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** A minimal ZIP archive with stored (uncompressed) entries: [[name, string|Buffer], ...]; a name ending in '/' is a directory. */
function storedZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(content ?? '');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---- check-orientation -----------------------------------------------------------------------------

describe('tools/check-orientation.mjs', () => {
  test('a counter-clockwise OBJ with +Z normals passes, including fan-triangulated polygons and negative indices', () => {
    const objects = checkObjText(GOOD_OBJ);
    assert.deepEqual(objects.map((o) => [o.name, o.triangles, o.failures]), [['Quad', 2, 0], ['Polygon', 2, 0]]);
  });

  test('a reversed OBJ triangle fails (facing away), and a face without normals fails', () => {
    const reversed = GOOD_OBJ.replace('f 1//1 3//1 4//1', 'f 1//1 4//1 3//1');
    const [quad] = checkObjText(reversed);
    assert.equal(quad.failures, 1);
    assert.deepEqual(quad.reasons, { 'facing away': 1 });
    const [bare] = checkObjText('o A\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n');
    assert.deepEqual(bare.reasons, { 'no vertex normal': 1 });
    const [flat] = checkObjText('o A\nv 0 0 0\nv 1 0 0\nv 2 0 0\nvn 0 0 1\nf 1//1 2//1 3//1\n');
    assert.deepEqual(flat.reasons, { degenerate: 1 });
    const [side] = checkObjText('o A\nv 0 0 0\nv 1 0 0\nv 1 1 0\nvn 1 0 0\nf 1//1 2//1 3//1\n');
    assert.deepEqual(side.reasons, { perpendicular: 1 });
  });

  test('glTF: NORMAL along the CCW face normal passes; reversed indices or a missing NORMAL fail', () => {
    assert.deepEqual(checkGltfOrientation(goodGltf()).map((o) => [o.name, o.triangles, o.failures]), [['Quad', 2, 0]]);
    const [rev] = checkGltfOrientation(gltf({ positions: QUAD, normals: UP, indices: [0, 2, 1, 0, 3, 2] }));
    assert.equal(rev.failures, 2);
    const [none] = checkGltfOrientation(gltf({ positions: QUAD, indices: CCW }));
    assert.equal(none.failures, 2);
    assert.deepEqual(none.reasons, { 'no NORMAL attribute': 2 });
    const [nonIndexed] = checkGltfOrientation(gltf({ positions: [0, 0, 0, 1, 0, 0, 1, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1] }));
    assert.equal(nonIndexed.triangles, 1);
    assert.equal(nonIndexed.failures, 0);
  });

  test('command line: exit 0 when every object passes, 1 on any failure, 2 without files', () => {
    const run = (...files) => spawnSync(process.execPath, [path.join(TOOLS, 'check-orientation.mjs'), ...files], { encoding: 'utf8' });
    const good = run(write('good.obj', GOOD_OBJ), write('good.gltf', goodGltf()));
    assert.equal(good.status, 0, good.stdout);
    assert.match(good.stdout, /PASS {2}.*good\.obj :: Quad \(2 triangles\)/);
    const bad = run(write('good2.obj', GOOD_OBJ), write('reversed.obj', GOOD_OBJ.replace('f 1//1 3//1 4//1', 'f 1//1 4//1 3//1')));
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /FAIL {2}.*reversed\.obj :: Quad: 1 of 2 triangles \(facing away 1\)/);
    assert.equal(run().status, 2);
  });

  const REVERSED_OBJ = GOOD_OBJ.replace('f 1//1 3//1 4//1', 'f 1//1 4//1 3//1');

  test('ZIP archives (01 T1): every .obj and .gltf entry is checked, other entries and directories are skipped', () => {
    const zip = write('bundle.zip', storedZip([['textures/', ''], ['textures/a.png', 'png'], ['led-wall-config.obj', GOOD_OBJ],
      ['led-wall-config.gltf', JSON.stringify(goodGltf())], ['led-wall-config.json', '{}'], ['nested/reversed.obj', REVERSED_OBJ]]));
    const results = checkOrientationZip(zip);
    assert.deepEqual(results.map((r) => r.file), [`${zip}!led-wall-config.obj`, `${zip}!led-wall-config.gltf`, `${zip}!nested/reversed.obj`]);
    assert.deepEqual(results.map((r) => r.objects.map((o) => [o.name, o.failures])),
      [[['Quad', 0], ['Polygon', 0]], [['Quad', 0]], [['Quad', 1], ['Polygon', 0]]]);
    const broken = checkOrientationZip(write('broken.zip', 'not a zip archive'));
    assert.equal(broken.length, 1);
    assert.match(broken[0].error, /cannot read ZIP/);
    const unparsable = checkOrientationZip(write('unparsable.zip', storedZip([['x.gltf', '{ not json']])));
    assert.match(unparsable[0].error, /cannot check/);
  });

  test('directories (01 T1): walked recursively for *.obj, *.gltf and *.zip, sorted by name at each level', () => {
    const root = path.join(TMP, 'tree');
    write('tree/b/inner.obj', GOOD_OBJ);
    write('tree/a.gltf', goodGltf());
    write('tree/b/c/deep.zip', storedZip([['e.obj', GOOD_OBJ]]));
    write('tree/b/notes.txt', 'skip me');
    write('tree/b.zip.entries/f.obj', GOOD_OBJ);
    const rel = (f) => path.relative(root, f).split(path.sep).join('/');
    assert.deepEqual(collectFiles([root]).map(rel), ['a.gltf', 'b/c/deep.zip', 'b/inner.obj', 'b.zip.entries/f.obj']);
    const results = checkOrientationPaths([root]);
    assert.deepEqual(results.map((r) => rel(r.file)), ['a.gltf', 'b/c/deep.zip!e.obj', 'b/inner.obj', 'b.zip.entries/f.obj']);
    assert.ok(results.every((r) => !r.error && r.objects.every((o) => o.failures === 0)));
    assert.deepEqual(collectFiles([path.join(root, 'missing.obj')]), [path.join(root, 'missing.obj')]);
    assert.match(checkOrientationPaths([path.join(root, 'missing.obj')])[0].error, /cannot check/);
  });

  test('command line with a directory and a ZIP: exit 1 on any failure; --failures-only prints only FAIL lines and the summary', () => {
    const run = (...args) => spawnSync(process.execPath, [path.join(TOOLS, 'check-orientation.mjs'), ...args], { encoding: 'utf8' });
    const dir = path.join(TMP, 'cli');
    write('cli/ok.obj', GOOD_OBJ);
    write('cli/archive.zip', storedZip([['ok.gltf', JSON.stringify(goodGltf())]]));
    const good = run(dir);
    assert.equal(good.status, 0, good.stdout);
    assert.match(good.stdout, /PASS {2}.*archive\.zip!ok\.gltf :: Quad \(2 triangles\)/);
    assert.match(good.stdout, /3\/3 object\(s\) pass/);
    write('cli/sub/reversed.obj', REVERSED_OBJ);
    const bad = run('--failures-only', dir);
    assert.equal(bad.status, 1);
    assert.deepEqual(bad.stdout.trim().split(/\r?\n/).map((l) => l.slice(0, 6)), ['FAIL  ', '4/5 ob']);
    assert.match(bad.stdout, /reversed\.obj :: Quad: 1 of 2 triangles/);
    assert.equal(run('--bogus', dir).status, 2);
  });
});

// ---- check-gltf ------------------------------------------------------------------------------------

describe('tools/check-gltf.mjs', () => {
  test('a well-formed file passes (UNSIGNED_SHORT and UNSIGNED_INT indices)', () => {
    assert.deepEqual(checkGltfDocument(goodGltf()), []);
    assert.deepEqual(checkGltfDocument(gltf({ positions: QUAD, normals: UP, indices: CCW, indexType: 5125 })), []);
  });

  test('an index of 65,535 in UNSIGNED_SHORT (the primitive-restart value) fails', () => {
    const errors = checkGltfDocument(gltf({ positions: QUAD, normals: UP, indices: [0, 1, 2, 0, 2, 65535] }));
    assert.ok(errors.some((e) => /equal 65535, the primitive-restart value of UNSIGNED_SHORT/.test(e)), errors.join('\n'));
    const big = checkGltfDocument(gltf({ positions: QUAD, normals: UP, indices: [0, 1, 2, 0, 2, 4294967295], indexType: 5125 }));
    assert.ok(big.some((e) => /4294967295/.test(e)), big.join('\n'));
    const out = checkGltfDocument(gltf({ positions: QUAD, normals: UP, indices: [0, 1, 2, 0, 2, 4] }));
    assert.ok(out.some((e) => /index value\(s\) >= the vertex count 4/.test(e)), out.join('\n'));
  });

  test('a misaligned bufferView fails (component-size and 4-byte vertex-attribute alignment)', () => {
    const errors = checkGltfDocument(gltf({ positions: QUAD, normals: UP, indices: CCW, pad: 2 }));
    assert.ok(errors.some((e) => /bufferViews\[0\]: vertex-attribute bufferView byteOffset 2 is not 4-byte aligned/.test(e)), errors.join('\n'));
    assert.ok(errors.some((e) => /not a multiple of the component size 4/.test(e)), errors.join('\n'));
  });

  test('POSITION min/max: float64 extremes whose Math.fround equals the stored float32 extreme pass; one float32 ulp off fails', () => {
    const positions = [0.1, 0.2, 0.3, 1.1, 0.2, 0.3, 1.1, 1.7, 0.3, 0.1, 1.7, 0.3];
    // The legacy writer stores the float64 extremes of the float64 positions; the buffer holds their float32 roundings.
    assert.deepEqual(checkGltfDocument(gltf({ positions, normals: UP, indices: CCW, min: [0.1, 0.2, 0.3], max: [1.1, 1.7, 0.3] })), []);
    assert.notEqual(Math.fround(1.1), 1.1);
    const off = checkGltfDocument(gltf({ positions, normals: UP, indices: CCW, min: [0.1, 0.2, 0.3], max: [nextFloat32Up(1.1), 1.7, 0.3] }));
    assert.equal(off.length, 1, off.join('\n'));
    assert.match(off[0], /POSITION max\[0\]/);
    const missing = gltf({ positions, normals: UP, indices: CCW });
    delete missing.accessors[0].min;
    assert.ok(checkGltfDocument(missing).some((e) => /has no min\/max/.test(e)));
  });

  test('NORMAL must be unit length within 1e-6; TEXCOORD_0 needs the POSITION count', () => {
    const long = checkGltfDocument(gltf({ positions: QUAD, normals: [0, 0, 1, 0, 0, 1, 0, 0, 1.001, 0, 0, 1], indices: CCW }));
    assert.ok(long.some((e) => /1 NORMAL vector\(s\) not unit length/.test(e)), long.join('\n'));
    const tex = checkGltfDocument(gltf({ positions: QUAD, normals: UP, uvs: [0, 0, 1, 0, 1, 1], indices: CCW }));
    assert.ok(tex.some((e) => /TEXCOORD_0 count 3 != POSITION count 4/.test(e)), tex.join('\n'));
  });

  test('references, bounds and buffer lengths are checked', () => {
    const doc = goodGltf();
    doc.meshes[0].primitives[0].material = 3;
    doc.nodes[0].mesh = 2;
    doc.accessors[0].count = 5;
    doc.buffers[0].byteLength += 4;
    const errors = checkGltfDocument(doc);
    for (const re of [/material 3 does not exist/, /mesh 2 does not exist/, /count 5 needs 60 bytes/, /decoded \d+ bytes, byteLength says/]) {
      assert.ok(errors.some((e) => re.test(e)), `${re}\n${errors.join('\n')}`);
    }
  });

  test('command line: exit 0 when every file passes, 1 on any failure, 2 without files', () => {
    const run = (...files) => spawnSync(process.execPath, [path.join(TOOLS, 'check-gltf.mjs'), ...files], { encoding: 'utf8' });
    assert.equal(run(write('ok.gltf', goodGltf())).status, 0);
    const bad = run(write('ok2.gltf', goodGltf()), write('restart.gltf', gltf({ positions: QUAD, normals: UP, indices: [0, 1, 2, 0, 2, 65535] })));
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /FAIL {2}.*restart\.gltf/);
    assert.equal(run().status, 2);
  });
});

// ---- make-cap-wall ---------------------------------------------------------------------------------

describe('tools/make-cap-wall.mjs and tests/fixtures/normals-max-wall.json (01 T1, 8.3)', () => {
  test('the committed fixture is the generator output (line endings aside), and --check says so', () => {
    assert.equal(fs.readFileSync(CAP_WALL_FILE, 'utf8').replace(/\r\n/g, '\n'), capWallText());
    const check = spawnSync(process.execPath, [path.join(TOOLS, 'make-cap-wall.mjs'), '--check'], { encoding: 'utf8' });
    assert.equal(check.status, 0, check.stdout);
    const stale = write('stale-cap-wall.json', '{}');
    assert.equal(spawnSync(process.execPath, [path.join(TOOLS, 'make-cap-wall.mjs'), '--check', '--out', stale], { encoding: 'utf8' }).status, 1);
  });

  test('it imports as 200 sections (project file v2 since 08 P2-13e) of 50 x 20 panels in combined mode: 214,200 vertices and 200,000 quads', () => {
    const doc = JSON.parse(fs.readFileSync(CAP_WALL_FILE, 'utf8'));
    assert.equal(doc.version, '2.0');
    assert.equal(doc.mesh_mode, 'combined');
    assert.deepEqual(CAP_WALL, { sections: 200, panelCols: 50, panelRows: 20, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32 });
    const read = new ProjectSerializer({ palette: Palette }).read(doc);
    assert.deepEqual(read.issues, [], 'the cap wall imports with no issue (fidelity, 07 4.7)');
    const sections = sectionsFromProject(read.project);
    assert.equal(read.project.mesh_mode, 'combined');
    assert.equal(sections.length, 200);
    assert.ok(sections.every((s) => s.panelCols === 50 && s.panelRows === 20 && s.curveIntensity === 0), 'every section is 50 x 20, flat');
    const project = Project.createDefault();
    project.wall.replaceAll(sections);
    const grid = new WallMeshBuilder(Strategies.mesh.viewport).combinedGrid(layoutProject(project), computeAtlas(sections));
    assert.equal(grid.positions.length / 3, 214200);
    assert.equal(grid.indices.length / 6, 200000);
  });
});
