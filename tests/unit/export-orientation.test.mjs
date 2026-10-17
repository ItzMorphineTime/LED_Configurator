// The acceptance oracle for export orientation (docs/improvements/01-normals.md 8.1, acceptance criterion 1; 01 T1):
// for every triangle of every OBJ and glTF, dot(geometric normal of the counter-clockwise winding, vertex normal) > 0
// at all three vertices, through the parser of tools/check-orientation.mjs.
// 1. Golden: every *.obj, *.gltf and *.zip under GOLDEN_DIR, walked recursively (the *.zip.entries/ folders and the
//    ZIP archives of the config scenarios, logos, ... included; each archive's .obj and .gltf entries are opened).
//    Until the spec 08 commits that own them land, a few golden objects still fail for defects outside Feature 1;
//    they are listed in OPEN_DEFECTS with their bug id and fixing commit. Every listed pattern must still match at
//    least one failing object, so the commit that fixes one of them has to delete its row here.
// 2. Fuzz: 500 seeded integer walls (01 6.3 domain: 1-6 sections, cols 1-50, rows 1-20, curves -30..30 with about 30 %
//    flat, offsets -180..180) through the in-memory OBJ and glTF exporters in all three mesh modes. Every section is
//    stage-facing until the LED side exists (01 T9a adds a random reversed flag per section to this fuzz).
// Run: node --test tests/unit/export-orientation.test.mjs   (zero dependencies; the golden part skips without GOLDEN_DIR)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WallSection } from '../../js/domain/WallSection.js';
import { Project } from '../../js/domain/Project.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';
import { layoutProject } from '../../js/geometry/WallLayout.js';
import { WallMeshBuilder } from '../../js/geometry/WallMeshBuilder.js';
import { ObjExporter } from '../../js/io/ObjExporter.js';
import { GltfExporter } from '../../js/io/GltfExporter.js';
import { Brand } from '../../js/theme/Theme.js';
import { checkObjText, checkGltfOrientation, checkOrientationPaths } from '../../tools/check-orientation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GOLDEN_DIR = path.resolve(REPO, process.env.GOLDEN_DIR || 'tests/regression/output/baseline');
const MODES = ['combined', 'section', 'panel'];

/**
 * Golden objects that still fail for a defect owned by a later spec 08 commit (01 header: hard prerequisites).
 * `pattern` is tested against '<path relative to GOLDEN_DIR, with forward slashes>[!<zip entry>] :: <object name>'; the
 * download file name is matched by any name (06 T6b renamed the exports), so the patterns follow Brand.files.
 */
const OPEN_DEFECTS = Object.freeze([
  { pattern: /(^|\/|__)export-safe-distance__[^/ ]+\.obj :: /, bug: 'B-L29', fixedBy: '08 P2-5b',
    why: 'the safe-distance floor OBJ has no vn lines (and its triangles face -Y)' },
  { pattern: /^import_edge\/ii_(combined|section)__export-(obj|gltf)__[^/ ]+\.(obj|gltf) :: /, bug: 'B-L8', fixedBy: '08 P2-3b',
    why: 'counts imported as strings give a vertsPerRow of "101", so indices run past the vertex count' },
]);

/** Deterministic PRNG (mulberry32), the generator of the other unit tests. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** '#rrggbb' -> 0..1 channels (the exporters only copy colours into MTL / materials; orientation ignores them). */
function colorToRgb(style) {
  const m = typeof style === 'string' ? /^#([0-9a-f]{6})$/i.exec(style) : null;
  if (!m) return { r: 1, g: 1, b: 1 };
  return { r: parseInt(m[1].slice(0, 2), 16) / 255, g: parseInt(m[1].slice(2, 4), 16) / 255, b: parseInt(m[1].slice(4, 6), 16) / 255 };
}

describe('golden exports: every OBJ and glTF under GOLDEN_DIR faces along its normals (01 AC 1)', () => {
  const skip = fs.existsSync(GOLDEN_DIR) ? false : `GOLDEN_DIR ${GOLDEN_DIR} does not exist (capture the baseline or set GOLDEN_DIR)`;

  test('every triangle of every object passes, except the listed open defects, which must still fail', { skip }, (t) => {
    const results = checkOrientationPaths([GOLDEN_DIR]);
    const rel = (file) => path.relative(GOLDEN_DIR, file).split(path.sep).join('/');
    const unexpected = [];
    const exempted = new Map(OPEN_DEFECTS.map((d) => [d, 0]));
    let objects = 0, triangles = 0, archivesEntries = 0;
    for (const { file, objects: reports, error } of results) {
      if (file.includes('.zip!')) archivesEntries++;
      if (error) { unexpected.push(`${rel(file)}: ${error}`); continue; }
      for (const o of reports) {
        objects++;
        triangles += o.triangles;
        if (!o.failures) continue;
        const key = `${rel(file)} :: ${o.name}`;
        const known = OPEN_DEFECTS.find((d) => d.pattern.test(key));
        if (known) exempted.set(known, exempted.get(known) + 1);
        else unexpected.push(`${key}: ${o.failures} of ${o.triangles} triangles; first: ${o.first}`);
      }
    }
    assert.ok(objects > 0, 'no OBJ or glTF object found under GOLDEN_DIR');
    assert.deepEqual(unexpected, [], 'objects that face away from their normals');
    for (const [d, n] of exempted) {
      assert.ok(n > 0, `the open defect ${d.bug} (${d.why}) no longer fails anywhere: ${d.fixedBy} has landed, delete its OPEN_DEFECTS row`);
    }
    t.diagnostic(`${objects} objects (${triangles} triangles, ${archivesEntries} ZIP entries) checked; `
      + `open defects: ${[...exempted].map(([d, n]) => `${d.bug} ${n}`).join(', ')}`);
  });
});

describe('fuzz: 500 integer walls in every mesh mode, OBJ and glTF (01 6.3 domain)', () => {
  const objExporter = new ObjExporter({ brand: Brand, colorToRgb, builder: new WallMeshBuilder(Strategies.mesh.obj) });
  const gltfExporter = new GltfExporter({ brand: Brand, colorToRgb, builder: new WallMeshBuilder(Strategies.mesh.gltf) });

  test('every triangle has a positive dot product with the vertex normal at all three corners', (t) => {
    const rand = rng(0xf1a0);
    const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
    let objects = 0, triangles = 0;
    for (let w = 0; w < 500; w++) {
      const sections = [];
      for (let i = 0, n = int(1, 6); i < n; i++) {
        sections.push(new WallSection({ id: i, name: `S${i}`, panelCols: int(1, 50), panelRows: int(1, 20),
          panelWidth: int(100, 1000), panelHeight: int(100, 1000), ledX: 32, ledY: 32,
          curveIntensity: rand() < 0.3 ? 0 : int(-30, 30), angleOffset: int(-180, 180), color: '#00f0ff' }));
      }
      const project = Project.createDefault();
      project.wall.replaceAll(sections);
      const layout = layoutProject(project);
      for (const meshMode of MODES) {
        const args = { sections: project.wall.sections, meshMode, layout };
        const reports = [...checkObjText(objExporter.write(args).objContent), ...checkGltfOrientation(gltfExporter.write(args))];
        for (const o of reports) {
          if (o.failures) assert.fail(`wall #${w} [${meshMode}] ${o.name}: ${o.failures} of ${o.triangles} triangles; first: ${o.first}`);
          objects++;
          triangles += o.triangles;
        }
      }
    }
    t.diagnostic(`${objects} objects, ${triangles} triangles`);
  });
});
