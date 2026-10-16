// Unit tests for the pure geometry layer (js/geometry/*): WallLayout, WallMeshBuilder, TextureAtlas, PanelNaming.
// Every number they produce is compared with Object.is against the verbatim legacy oracle
// (tests/unit/oracle/legacy-geometry.mjs, copied from index.html@cd3fd3f) over the harness configurations and over
// >= 500 seeded fuzzed walls: 0-6 sections, integer and fractional counts, numeric strings, flat / concave / convex /
// string curves, +-90 / +-180 offsets, NaN / duplicate / string ids, plus rare degenerate counts (0, '', negative)
// whose legacy exceptions must be reproduced with the identical error type and message.
// The oracle builders are injected with LegacyProfiles.mesh.* (the exact Phase-1 profiles, 08 4.2), never with
// Strategies.mesh.*, so these comparisons stay meaningful after each Phase-2 flip of a production profile.
// Run: node --test tests/unit/geometry.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { WallSection } from '../../js/domain/WallSection.js';
import { Wall, PivotMode } from '../../js/domain/Wall.js';
import { Project } from '../../js/domain/Project.js';
import { LegacyProfiles, Strategies, unsupportedStrategy } from '../../js/legacy/LegacyCompat.js';
import { computeWallLayout, layoutProject, framingBounds, SectionLayout, WallLayout } from '../../js/geometry/WallLayout.js';
import { quadIndices, WallMeshBuilder, maxIndexOf, indexWidth } from '../../js/geometry/WallMeshBuilder.js';
import { computeAtlas, sectionPxPerLed, panelPxPerLed } from '../../js/geometry/TextureAtlas.js';
import {
  columnLabel, panelLabel, exportSectionName, exportPanelName, sanitizeFilename, zipTextureFileName, mtlTextureFile,
} from '../../js/geometry/PanelNaming.js';
import * as L from './oracle/legacy-geometry.mjs';
import { CONFIGS } from '../regression/configs.mjs';

// ---------------------------------------------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------------------------------------------

/** Accumulates Object.is mismatches (count + the first samples) and the number of values compared. */
class Mismatches {
  count = 0;
  compared = 0;
  samples = [];

  add(path, actual, expected) {
    this.count++;
    if (this.samples.length < 12) this.samples.push(`${path}: got ${fmt(actual)}, expected ${fmt(expected)}`);
  }

  report() {
    return `${this.count} mismatches (of ${this.compared} values compared):\n  ${this.samples.join('\n  ')}`;
  }
}

const fmt = (v) => (typeof v === 'string' ? JSON.stringify(v) : Object.is(v, -0) ? '-0' : String(v));
const isPrimitive = (v) => v === null || (typeof v !== 'object' && typeof v !== 'function');

/** Deep structural comparison; every primitive leaf with Object.is; object key lists must match in order. */
function compareDeep(actual, expected, path, mm) {
  if (isPrimitive(expected) || isPrimitive(actual)) {
    mm.compared++;
    if (!Object.is(actual, expected)) mm.add(path, actual, expected);
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      mm.add(`${path} (array expected)`, actual, expected);
      return;
    }
    mm.compared++;
    if (actual.length !== expected.length) mm.add(`${path}.length`, actual.length, expected.length);
    const n = Math.min(actual.length, expected.length);
    for (let i = 0; i < n; i++) compareDeep(actual[i], expected[i], `${path}[${i}]`, mm);
    return;
  }
  const ak = Object.keys(actual).join(','), ek = Object.keys(expected).join(',');
  mm.compared++;
  if (ak !== ek) mm.add(`${path} keys`, ak, ek);
  for (const k of Object.keys(expected)) compareDeep(actual[k], expected[k], `${path}.${k}`, mm);
}

/** Runs fn and captures its value or its exception. */
function run(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Compares two run() outcomes: both values deep-equal, or both threw the same error type and message. */
function compareOutcome(actual, expected, path, mm) {
  mm.compared++;
  if (actual.ok !== expected.ok) {
    mm.add(`${path} outcome`, actual.ok ? 'returned' : `threw ${actual.error}`, expected.ok ? 'returned' : `threw ${expected.error}`);
    return;
  }
  if (!actual.ok) {
    const a = `${actual.error.constructor.name}: ${actual.error.message}`;
    const e = `${expected.error.constructor.name}: ${expected.error.message}`;
    if (a !== e) mm.add(`${path} error`, a, e);
    return;
  }
  compareDeep(actual.value, expected.value, path, mm);
}

/** Asserts zero mismatches and reports the number of values compared. */
function assertNoMismatch(t, mm) {
  t.diagnostic(`${mm.compared} values compared with Object.is, ${mm.count} mismatches`);
  assert.equal(mm.count, 0, mm.report());
  assert.ok(mm.compared > 0, 'nothing was compared');
}

// ---------------------------------------------------------------------------------------------------------------
// Inputs: hand-picked walls, the golden-master configurations and >= 500 seeded fuzzed walls
// ---------------------------------------------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32). */
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

const COLS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 50, 2.5, 0.5, 1.5, 3.75, 7.2, '10', '5', '3', '2.5', '1'];
const ROWS = [1, 2, 3, 4, 5, 20, 2.5, 0.5, 1.25, '5', '3', '2', '1.5'];
const RARE_COUNTS = [0, -0, -1, -2.5, NaN, '', '0', 'abc'];
const SIZES = [500, 250, 600, 1000, 333.3, 337.5, 499.9, 50, 5000, 562.5, '500', '250', '337.5'];
const LEDS = [32, 64, 16, 8, 128, 96, 54, 7.5, 33, '32', '64'];
// 4.75, -9.5, 19, 9.5, -19, 89, -93 (and their strings) are association-sensitive: `(deg * Math.PI) / 180` differs in
// the last ulp from `deg * (Math.PI / 180)`, `(deg / 180) * Math.PI` and `Math.PI * (deg / 180)`, so a re-associated
// degree-to-radian conversion (R1) cannot pass. Most round values (0, 90, 45, 30, ...) give identical results.
const CURVES = [0, -0, 5, -5, 10, -10, 2.5, -7.25, 3.5, -1.5, 45, -45, 90, 0.1, 180, 4.75, -9.5, 19, '5', '-3', '0', '2.5', '-4.75'];
const RARE_CURVES = ['', 'x', NaN, null];
const OFFSETS = [0, 90, -90, 180, -180, 45, -45, 30, 15, -20, 12.5, 9.5, -19, 89, -93, '30', '-90', '180', '4.75'];
const RARE_OFFSETS = ['', null, undefined, NaN, 'abc'];
const NAMES = ['Wall 1', 'A B', 'A_B', 'Stage-Left', 'x/y:z*?', 'Ünïcödé wall', 'Curve C', 'L1', '   '];
const RARE_NAMES = ['', 0, 42];

/** A fuzzed WallSection with raw (possibly imported) field values. */
function fuzzSection(rand, i, previousId) {
  const pick = (pool) => pool[Math.floor(rand() * pool.length)];
  const count = (pool) => (rand() < 0.04 ? pick(RARE_COUNTS) : pick(pool));
  const r = rand();
  const id = r < 0.08 ? NaN : r < 0.16 ? `id-${i}` : r < 0.22 ? String(i) : r < 0.32 && previousId !== undefined ? previousId : i;
  return new WallSection({
    id,
    name: rand() < 0.03 ? pick(RARE_NAMES) : pick(NAMES),
    panelCols: count(COLS),
    panelRows: count(ROWS),
    panelWidth: rand() < 0.02 ? pick([0, -500, NaN, '']) : pick(SIZES),
    panelHeight: rand() < 0.02 ? pick([0, -500, NaN, '']) : pick(SIZES),
    ledX: rand() < 0.02 ? pick([0, NaN, '']) : pick(LEDS),
    ledY: rand() < 0.02 ? pick([0, NaN, '']) : pick(LEDS),
    curveIntensity: rand() < 0.05 ? pick(RARE_CURVES) : pick(CURVES),
    angleOffset: rand() < 0.05 ? pick(RARE_OFFSETS) : pick(OFFSETS),
    color: '#00f0ff',
  });
}

/** `count` fuzzed walls of 0..6 sections. */
function fuzzWalls(seed, count) {
  const rand = rng(seed);
  const walls = [];
  for (let w = 0; w < count; w++) {
    const n = Math.floor(rand() * 7);
    const sections = [];
    for (let i = 0; i < n; i++) sections.push(fuzzSection(rand, i, sections.length ? sections[sections.length - 1].id : undefined));
    walls.push({ label: `fuzz#${w}`, sections });
  }
  return walls;
}

/** The legacy import mapping 4976-4988 (palette colours irrelevant here), used to load the harness configs. */
function importSections(data) {
  return data.sections.map((s, i) => new WallSection({
    id: s.id !== undefined ? s.id : i,
    name: s.name || `Wall ${i + 1}`,
    panelCols: s.panel?.columns || 5,
    panelRows: s.panel?.rows || 3,
    panelWidth: s.panel?.width_mm || 500,
    panelHeight: s.panel?.height_mm || 500,
    ledX: s.led_resolution?.x || 32,
    ledY: s.led_resolution?.y || 32,
    curveIntensity: s.curvature?.angle_degrees || 0,
    angleOffset: s.curvature?.angle_offset_degrees || 0,
    color: s.color || '#00f0ff',
  }));
}

const section = (fields) => new WallSection({ ...WallSection.createDefault(), ...fields });

const HAND_WALLS = [
  { label: 'default', sections: [WallSection.createDefault()] },
  { label: 'empty', sections: [] },
  { label: 'fractional 2.5 x 2.5', sections: [section({ panelCols: 2.5, panelRows: 2.5, curveIntensity: 3 })] },
  { label: 'string counts', sections: [section({ panelCols: '10', panelRows: '5', panelWidth: '500', ledX: '32' })] },
  { label: 'string curve "0"', sections: [section({ curveIntensity: '0' }), section({ id: 1, curveIntensity: '5' })] },
  { label: 'cols 0 (legacy TypeError)', sections: [section({ panelCols: 0 })] },
  { label: 'duplicate and NaN ids', sections: [section({ id: 3 }), section({ id: 3 }), section({ id: NaN, angleOffset: -180 })] },
  { label: 'association-sensitive angles', sections: [
    section({ curveIntensity: 4.75, angleOffset: 89 }),
    section({ id: 1, curveIntensity: -9.5, angleOffset: -93 }),
    section({ id: 2, curveIntensity: '19', angleOffset: '4.75' }),
  ] },
];

/** True when a re-associated degree-to-radian conversion gives a different double than legacy `(deg * Math.PI) / 180`. */
const associationSensitive = (deg) => {
  const legacy = (deg * Math.PI) / 180;
  return !Object.is(legacy, deg * (Math.PI / 180)) && !Object.is(legacy, (deg / 180) * Math.PI)
    && !Object.is(legacy, Math.PI * (deg / 180));
};
const CONFIG_WALLS = Object.entries(CONFIGS).map(([name, data]) => ({ label: `config:${name}`, sections: importSections(data) }));
const FUZZ_WALLS = fuzzWalls(0x5eed4, 600);
const WALLS = [...HAND_WALLS, ...CONFIG_WALLS, ...FUZZ_WALLS];

const viewport = new WallMeshBuilder(LegacyProfiles.mesh.viewport);
const obj = new WallMeshBuilder(LegacyProfiles.mesh.obj);
const gltf = new WallMeshBuilder(LegacyProfiles.mesh.gltf);

/** Runs `check(wall, mm)` over every wall and asserts zero mismatches. */
function overAllWalls(t, check) {
  const mm = new Mismatches();
  for (const wall of WALLS) check(wall, mm, wall.label);
  assertNoMismatch(t, mm);
}

// ---------------------------------------------------------------------------------------------------------------
// Fuzzer coverage
// ---------------------------------------------------------------------------------------------------------------

describe('fuzzer', () => {
  test('produces >= 500 configurations covering every required input class', (t) => {
    assert.ok(FUZZ_WALLS.length >= 500, `${FUZZ_WALLS.length} fuzzed walls`);
    const all = FUZZ_WALLS.flatMap((w) => w.sections);
    const counts = {
      'section counts 0..6': new Set(FUZZ_WALLS.map((w) => w.sections.length)).size === 7,
      'fractional cols': all.some((s) => typeof s.panelCols === 'number' && s.panelCols % 1 !== 0),
      'fractional rows': all.some((s) => typeof s.panelRows === 'number' && s.panelRows % 1 !== 0),
      'numeric-string cols': all.some((s) => s.panelCols === '10'),
      'numeric-string width': all.some((s) => s.panelWidth === '500'),
      'numeric-string led': all.some((s) => s.ledX === '32'),
      'numeric-string rows': all.some((s) => s.panelRows === '5'),
      'curve 0': all.some((s) => s.curveIntensity === 0),
      'positive curve': all.some((s) => s.curveIntensity > 0),
      'negative curve': all.some((s) => s.curveIntensity < 0),
      'string curve': all.some((s) => typeof s.curveIntensity === 'string'),
      'association-sensitive curve': all.some((s) => s.curveIntensity !== 0 && associationSensitive(s.curveIntensity)),
      'association-sensitive offset': all.some((s) => associationSensitive(s.angleOffset || 0)),
      'offset +90': all.some((s) => s.angleOffset === 90),
      'offset -90': all.some((s) => s.angleOffset === -90),
      'offset +180': all.some((s) => s.angleOffset === 180),
      'offset -180': all.some((s) => s.angleOffset === -180),
      'NaN id': all.some((s) => Number.isNaN(s.id)),
      'string id': all.some((s) => typeof s.id === 'string'),
      'duplicate id': FUZZ_WALLS.some((w) => new Set(w.sections.map((s) => s.id)).size < w.sections.filter((s) => !Number.isNaN(s.id)).length),
      'zero cols': all.some((s) => s.panelCols === 0),
      'numeric name': all.some((s) => s.name === 42),
    };
    for (const [name, covered] of Object.entries(counts)) assert.ok(covered, `fuzzer does not cover: ${name}`);
    t.diagnostic(`${FUZZ_WALLS.length} fuzzed walls (${all.length} sections) + ${HAND_WALLS.length} hand-picked + ${CONFIG_WALLS.length} harness configs`);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// WallLayout vs the three legacy walks
// ---------------------------------------------------------------------------------------------------------------

/** The legacy viewport/export walk entry shape built from a SectionLayout. */
const asWalkEntry = (sl) => ({
  section: sl.section, sectionIndex: sl.sectionIndex, edgePositions: sl.edges, panelData: sl.panels,
  panelW: sl.panelW, panelH: sl.panelH, isFlat: sl.isFlat,
});

describe('computeWallLayout vs the legacy walks', () => {
  test('createLEDWall walk (1479-1549): edges, panels, panelW/H, isFlat, section, sectionIndex', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = L.legacyCreateLEDWallWalk(sections);
      const layout = computeWallLayout(sections);
      assert.ok(layout instanceof WallLayout);
      compareDeep(layout.sections.length, legacy.length, `${label}.length`, mm);
      layout.sections.forEach((sl, i) => {
        assert.ok(sl instanceof SectionLayout);
        compareDeep(asWalkEntry(sl), legacy[i], `${label}[${i}]`, mm);
        compareDeep(sl.sectionId, sections[i].id, `${label}[${i}].sectionId`, mm);
        compareDeep(sl.postTransform, null, `${label}[${i}].postTransform`, mm);
      });
    });
  });

  test('safe-distance walk (2614-2647): flatEdges() == allEdges, [] for an empty wall', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      compareDeep(computeWallLayout(sections).flatEdges(), L.legacySafeDistanceEdges(sections), `${label}.flatEdges`, mm);
    });
    assert.deepEqual(computeWallLayout([]).flatEdges(), []);
  });

  test('generateAllSectionsGeometry (5012-5080): edges, panels, panelW/H and vertices', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = L.generateAllSectionsGeometry(sections, 0.001);
      const layout = computeWallLayout(sections);
      compareDeep(layout.sections.length, legacy.length, `${label}.length`, mm);
      layout.sections.forEach((sl, i) => {
        const e = legacy[i];
        const p = `${label}[${i}]`;
        compareDeep(sl.section === e.section, true, `${p}.section identity`, mm);
        compareDeep(sl.sectionIndex, e.sectionIndex, `${p}.sectionIndex`, mm);
        compareDeep(sl.edges, e.edgePositions, `${p}.edges`, mm);
        compareDeep(sl.panels.map(({ x, y, z, rotY, col, row }) => ({ x, y, z, rotY, col, row })), e.panelData, `${p}.panels`, mm);
        compareDeep([sl.panelW, sl.panelH], [e.panelW, e.panelH], `${p}.panelW/H`, mm);
        compareDeep(obj.sectionGrid(sl).positions, e.vertices, `${p}.obj vertices`, mm);
        compareDeep(gltf.sectionGrid(sl).positions, e.vertices, `${p}.gltf vertices`, mm);
      });
    });
  });

  test('layoutProject(project) == computeWallLayout(project.wall.sections)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const project = Project.createDefault();
      project.wall.replaceAll(sections);
      const a = layoutProject(project), b = computeWallLayout(sections);
      compareDeep(a.sections.map(asWalkEntry), b.sections.map(asWalkEntry), label, mm);
    });
  });

  test('postTransforms seam: stored per section, never fed back into the cursor', () => {
    const sections = [section({ curveIntensity: 5 }), section({ id: 1, angleOffset: 30 })];
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 9, 9, 9, 1];
    const plain = computeWallLayout(sections);
    const withPost = computeWallLayout(sections, { postTransforms: [m] });
    assert.equal(withPost.sections[0].postTransform, m);
    assert.equal(withPost.sections[1].postTransform, null);
    assert.deepEqual(withPost.sections.map((sl) => [sl.edges, sl.panels]), plain.sections.map((sl) => [sl.edges, sl.panels]));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// WallMeshBuilder vs the legacy grid builders and the export loops
// ---------------------------------------------------------------------------------------------------------------

describe('WallMeshBuilder vs the legacy grids', () => {
  test('combinedGrid (viewport) == createCombinedMesh arrays (1580-1644)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = run(() => {
        const r = L.legacyCreateCombinedMeshArrays(L.legacyCreateLEDWallWalk(sections), sections);
        return { positions: r.vertPositions, normals: r.vertNormals, uvs: r.vertUvs, indices: r.indices };
      });
      const mine = run(() => {
        const r = viewport.combinedGrid(computeWallLayout(sections), computeAtlas(sections));
        return { positions: r.positions, normals: r.normals, uvs: r.uvs, indices: r.indices };
      });
      compareOutcome(mine, legacy, `${label}.combined`, mm);
    });
  });

  test('combinedGrid sectionRanges partition the index array in section order', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const r = run(() => viewport.combinedGrid(computeWallLayout(sections), computeAtlas(sections)));
      if (!r.ok) return;
      const { sectionRanges, indices } = r.value;
      let next = 0;
      sectionRanges.forEach((range, i) => {
        compareDeep(range, { sectionId: sections[i].id, sectionIndex: i, indexStart: next, indexCount: range.indexCount },
          `${label}.sectionRanges[${i}]`, mm);
        next += range.indexCount;
      });
      compareDeep(next, indices.length, `${label}.sectionRanges total`, mm);
    });
  });

  test("sectionGrid(uv 'unit') (viewport) == createSectionMeshes arrays (1711-1751) with TextureAtlas start columns", (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = run(() => L.legacyCreateSectionMeshesArrays(L.legacyCreateLEDWallWalk(sections)));
      const mine = run(() => {
        const atlas = computeAtlas(sections);
        return computeWallLayout(sections).sections.map((sl, i) => {
          const g = viewport.sectionGrid(sl, { uv: 'unit' });
          return { vertPositions: g.positions, vertNormals: g.normals, vertUvs: g.uvs, indices: g.indices, startCol: atlas.entries[i].startCol };
        });
      });
      compareOutcome(mine, legacy, `${label}.sections`, mm);
    });
  });

  test('sectionGrid(indexBase 1, running) indices == OBJ combined faces (4573, 4591-4604)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = L.legacyObjCombinedFaces(L.generateAllSectionsGeometry(sections, 0.001));
      const out = { positions: [], normals: [], uvs: [], indices: [] };
      let vertexOffset = 1;
      for (const sl of computeWallLayout(sections).sections) {
        vertexOffset += obj.sectionGrid(sl, { indexBase: vertexOffset }, out).vertexAdvance;
      }
      compareDeep(out.indices, legacy, `${label}.obj combined faces`, mm);
      compareDeep([out.normals.length, out.uvs.length], [0, 0], `${label}.obj no normals/uvs`, mm);
    });
  });

  test('sectionGrid(indexBase = running offset from 1) == OBJ section faces, v and vt (4617-4658)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = L.legacyObjSectionFaces(L.generateAllSectionsGeometry(sections, 0.001));
      const mine = [];
      let vertexOffset = 1;
      computeWallLayout(sections).sections.forEach((sl, i) => {
        const g = obj.sectionGrid(sl, { indexBase: vertexOffset });
        mine.push({ name: exportSectionName(i), faces: g.indices, texFaces: g.indices, normalOffset: i + 1 });
        vertexOffset += g.vertexAdvance;
      });
      compareDeep(mine, legacy, `${label}.obj sections`, mm);
    });
  });

  test('panelCorners / panelFacingNormal / panelQuadIndices == OBJ panel objects (4670-4713)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = L.legacyObjPanels(L.generateAllSectionsGeometry(sections, 0.001));
      const mine = [];
      let v = 1, n = 1;
      computeWallLayout(sections).sections.forEach((sl, i) => {
        for (const panel of sl.panels) {
          const normal = obj.panelFacingNormal(panel);
          const faces = obj.panelQuadIndices(v);
          mine.push({
            panelName: exportPanelName(i, panel.row, panel.col),
            corners: obj.panelCorners(panel, sl.panelW, sl.panelH),
            nx: normal.x, nz: normal.z, faces, texFaces: faces, n,
          });
          compareDeep(normal.y, 0, `${label}.panel normal y`, mm);
          v += 4;
          n += 1;
        }
      });
      compareDeep(mine, legacy, `${label}.obj panels`, mm);
    });
  });

  test('sectionGrid(indexBase 0, running) == glTF combined vertices and indices (4831-4848)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = L.legacyGltfCombined(L.generateAllSectionsGeometry(sections, 0.001));
      const out = { positions: [], normals: [], uvs: [], indices: [] };
      let indexOffset = 0;
      for (const sl of computeWallLayout(sections).sections) {
        indexOffset += gltf.sectionGrid(sl, { indexBase: indexOffset }, out).vertexAdvance;
      }
      compareDeep({ allVertices: out.positions, allIndices: out.indices }, legacy, `${label}.gltf combined`, mm);
    });
  });

  test('sectionGrid(indexBase 0) == glTF section meshes (4854-4868)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = L.legacyGltfSections(L.generateAllSectionsGeometry(sections, 0.001));
      const mine = computeWallLayout(sections).sections.map((sl, i) => {
        const g = gltf.sectionGrid(sl);
        return { name: exportSectionName(i), vertices: g.positions, indices: g.indices };
      });
      compareDeep(mine, legacy, `${label}.gltf sections`, mm);
    });
  });

  test('panelCorners / panelQuadIndices(0) == glTF panel meshes (4871-4891)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = L.legacyGltfPanels(L.generateAllSectionsGeometry(sections, 0.001));
      const mine = [];
      computeWallLayout(sections).sections.forEach((sl, i) => {
        for (const panel of sl.panels) {
          const vertices = [];
          for (const c of gltf.panelCorners(panel, sl.panelW, sl.panelH)) vertices.push(c.x, c.y, c.z);
          mine.push({ name: exportPanelName(i, panel.row, panel.col), vertices, indices: gltf.panelQuadIndices(0) });
        }
      });
      compareDeep(mine, legacy, `${label}.gltf panels`, mm);
    });
  });

  test('vertexAdvance == the legacy running vertexOffset of createCombinedMesh (1642)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const { book } = L.legacyCombinedMeshBookkeeping(L.legacyCreateLEDWallWalk(sections), sections);
      let vertexOffset = 0;
      computeWallLayout(sections).sections.forEach((sl, i) => {
        compareDeep(vertexOffset, book[i].vertexOffset, `${label}[${i}].vertexOffset`, mm);
        vertexOffset += gltf.sectionGrid(sl).vertexAdvance;
      });
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// TextureAtlas vs the legacy bookkeeping
// ---------------------------------------------------------------------------------------------------------------

describe('computeAtlas vs the legacy bookkeeping', () => {
  test('totals, pxPerLed, start columns and LED x offsets == createCombinedPanelIdCanvas (1681-1705)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = L.legacyCombinedPanelIdBookkeeping(sections);
      const atlas = computeAtlas(sections);
      compareDeep(
        { totalLedX: atlas.totalLedX, totalLedY: atlas.totalLedY, scale: atlas.pxPerLed,
          calls: atlas.entries.map((e) => ({ sectionIndex: e.sectionIndex, startCol: e.startCol, xOffset: e.ledOffsetX })) },
        { totalLedX: legacy.totalLedX, totalLedY: legacy.totalLedY, scale: legacy.scale,
          calls: legacy.calls.map(({ sectionIndex, startCol, xOffset }) => ({ sectionIndex, startCol, xOffset })) },
        `${label}.atlas`, mm);
      atlas.entries.forEach((e, i) => compareDeep(e.section === sections[i], true, `${label}.entries[${i}].section`, mm));
    });
  });

  test('uvWidth and uvOffsetX == createCombinedMesh (1586-1596, 1643)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = L.legacyCombinedMeshBookkeeping(L.legacyCreateLEDWallWalk(sections), sections);
      const atlas = computeAtlas(sections);
      compareDeep(
        { totalLedX: atlas.totalLedX, totalLedY: atlas.totalLedY, uv: atlas.entries.map(({ uvOffsetX, uvWidth }) => ({ uvOffsetX, uvWidth })) },
        { totalLedX: legacy.totalLedX, totalLedY: legacy.totalLedY, uv: legacy.book.map(({ uvOffsetX, uvWidth }) => ({ uvOffsetX, uvWidth })) },
        `${label}.uv`, mm);
    });
  });

  test('start columns == createIndividualPanels (1777-1800) and the exportZIP texture loop (4534-4543)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const atlas = computeAtlas(sections);
      const layout = computeWallLayout(sections);
      const panels = [];
      layout.sections.forEach((sl, i) => {
        for (const p of sl.panels) panels.push({ col: atlas.entries[i].startCol + p.col, row: p.row, ledX: sl.section.ledX, ledY: sl.section.ledY });
      });
      compareDeep(panels, L.legacyCreateIndividualPanelsBookkeeping(L.legacyCreateLEDWallWalk(sections)), `${label}.panels`, mm);
      // The exportZIP start columns (4534-4543) are compared with the file names in the PanelNaming tests.
    });
  });

  test('sectionPxPerLed == 2056 (no override) and panelPxPerLed == 2003', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      sections.forEach((s, i) => {
        compareDeep(sectionPxPerLed(s.panelCols * s.ledX, s.panelRows * s.ledY), L.legacySectionScale(s, null), `${label}[${i}].section px/LED`, mm);
        compareDeep(panelPxPerLed(s.ledX, s.ledY), L.legacyPanelScale(s.ledX, s.ledY), `${label}[${i}].panel px/LED`, mm);
      });
    });
  });

  test('empty wall: zero totals, pxPerLed 4, no entries (legacy arithmetic)', () => {
    assert.deepEqual(computeAtlas([]), { totalLedX: 0, totalLedY: 0, pxPerLed: 4, entries: [] });
  });

  test('string column counts concatenate exactly like legacy cumulativeCol', () => {
    const atlas = computeAtlas([section({ panelCols: '10' }), section({ id: 1, panelCols: 5 }), section({ id: 2 })]);
    assert.deepEqual(atlas.entries.map((e) => e.startCol), [0, '010', '0105']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// PanelNaming
// ---------------------------------------------------------------------------------------------------------------

describe('PanelNaming', () => {
  test('columnLabel == getColumnLabel (1991-1999) for 0..2000, numeric strings and odd values', (t) => {
    const mm = new Mismatches();
    for (let i = 0; i <= 2000; i++) compareDeep(columnLabel(i), L.getColumnLabel(i), `columnLabel(${i})`, mm);
    for (const v of ['0', '1', '25', '26', '27', '51', '52', '701', '702', '2000', '010', '0105', '2.5', ' 7 ', 2.5, 25.9, -1, -27, NaN, 1e6, '']) {
      compareDeep(columnLabel(v), L.getColumnLabel(v), `columnLabel(${fmt(v)})`, mm);
    }
    assertNoMismatch(t, mm);
    assert.deepEqual([0, 25, 26, 27, 51, 52, 701, 702].map(columnLabel), ['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });

  test('panelLabel == the panel-ID labels of createPanelIdTexture (2022-2024) and createSectionPanelIdCanvas (2083-2084)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const atlas = computeAtlas(sections);
      for (const p of L.legacyCreateIndividualPanelsBookkeeping(L.legacyCreateLEDWallWalk(sections))) {
        compareDeep(panelLabel(p.col, p.row), L.legacyPanelTextureLabel(p.col, p.row), `${label}.panel label`, mm);
      }
      atlas.entries.forEach(({ section: s, startCol }, i) => {
        for (let row = 0; row < s.panelRows; row++) {
          for (let col = 0; col < s.panelCols; col++) {
            compareDeep(panelLabel(startCol + col, row), L.legacySectionCanvasLabel(startCol, col, row), `${label}[${i}].canvas label`, mm);
          }
        }
      });
    });
  });

  test('zipTextureFileName + start columns == exportZIP texture_file (4511) and texture loop (4534-4543)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = run(() => L.legacyZipTextures(sections));
      const mine = run(() => {
        const { entries } = computeAtlas(sections);
        return {
          jsonTextureFiles: sections.map((s, i) => ({ texture_file: `textures/${zipTextureFileName(s, i)}` })),
          files: sections.map((s, i) => ({ filename: zipTextureFileName(s, i), startCol: entries[i].startCol })),
        };
      });
      compareOutcome(mine, legacy, `${label}.zip names`, mm);
    });
  });

  test('exportSectionName + mtlTextureFile == the MTL section block (4607-4613)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      let mtl = '';
      sections.forEach((s, i) => {
        mtl += `newmtl ${exportSectionName(i)}\n`;
        mtl += `Ka 0.1 0.1 0.1\nKs 0.5 0.5 0.5\nNs 100\nd 1.0\n`;
        mtl += `map_Kd ${mtlTextureFile(i)}\n\n`;
      });
      compareDeep(mtl, L.legacyMtlSectionText(sections), `${label}.mtl`, mm);
    });
  });

  test('sanitizeFilename keeps the legacy callee text: a numeric name throws "name.replace is not a function"', () => {
    assert.equal(sanitizeFilename('A B/c-d_e.f'), 'A_B_c-d_e_f');
    assert.throws(() => sanitizeFilename(42), { name: 'TypeError', message: 'name.replace is not a function' });
    assert.throws(() => zipTextureFileName(section({ name: 7 }), 0), { name: 'TypeError', message: 'name.replace is not a function' });
    assert.equal(zipTextureFileName(section({ name: 0 }), 2), 'Wall_3_PanelIDs.png');
    assert.equal(zipTextureFileName(section({ name: '' }), 0), 'Wall_1_PanelIDs.png');
  });

  test('names: exportSectionName, exportPanelName, mtlTextureFile (B-M2: index based)', () => {
    assert.equal(exportSectionName(0), 'Wall_1');
    assert.equal(exportPanelName(1, 2, 3), 'Wall_2_Panel_R3_C4');
    assert.equal(mtlTextureFile(4), 'textures/Wall_5_PanelIDs.png');
    assert.notEqual(mtlTextureFile(0), `textures/${zipTextureFileName(section({ name: 'Main' }), 0)}`);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Strategy switches (profiles), quad indices and the Feature 3 seams
// ---------------------------------------------------------------------------------------------------------------

/** A layout with quads, for the foreign-profile tests. */
const SMALL_LAYOUT = computeWallLayout([section({ panelCols: 2, panelRows: 2, curveIntensity: 5 })]);
const PANEL = SMALL_LAYOUT.sections[0].panels[0];
const unsupported = (key, value) => ({ name: 'Error', message: unsupportedStrategy(key, value).message });

describe('quadIndices and the builder profiles', () => {
  test("quadIndices(0, 1, 3, 2) is [0, 3, 2, 0, 2, 1]; the default winding is 'legacy-cw'", () => {
    assert.deepEqual(quadIndices(0, 1, 3, 2), [0, 3, 2, 0, 2, 1]);
    assert.deepEqual(quadIndices(0, 1, 3, 2, 'legacy-cw'), [0, 3, 2, 0, 2, 1]);
    assert.deepEqual(quadIndices(10, 11, 20, 21), [10, 20, 21, 10, 21, 11]);
  });

  test('quadIndices throws unsupportedStrategy for any other winding', () => {
    assert.throws(() => quadIndices(0, 1, 3, 2, 'ccw'), unsupported('mesh.winding', 'ccw'));
    assert.throws(() => quadIndices(0, 1, 3, 2, null), unsupported('mesh.winding', null));
  });

  test('panelQuadIndices(v) is [v, v + 3, v + 2, v, v + 2, v + 1] for every profile', () => {
    for (const builder of [viewport, obj, gltf]) {
      for (const v of [0, 1, 5, 1001, 2.5]) assert.deepEqual(builder.panelQuadIndices(v), [v, v + 3, v + 2, v, v + 2, v + 1]);
    }
  });

  test('LegacyProfiles holds exactly the Phase-1 mesh profiles (08 4.2), deep-frozen; Strategies has its own objects', () => {
    assert.deepEqual(LegacyProfiles, {
      mesh: {
        viewport: { winding: 'legacy-cw', normals: 'right-panel', combinedUV: 'atlas-u-full-v', side: 'double' },
        obj: { winding: 'legacy-cw', normals: 'none', stripNormals: 'constant-z', combinedUV: 'per-section-overlap', panelNormal: 'facing' },
        gltf: { winding: 'legacy-cw', normals: 'none', attributes: ['POSITION'], indexType: 'uint16', doubleSided: 'omit' },
      },
    });
    for (const o of [LegacyProfiles, LegacyProfiles.mesh, ...Object.values(LegacyProfiles.mesh), LegacyProfiles.mesh.gltf.attributes]) {
      assert.ok(Object.isFrozen(o));
    }
    for (const consumer of ['viewport', 'obj', 'gltf']) assert.notEqual(LegacyProfiles.mesh[consumer], Strategies.mesh[consumer]);
  });

  test('profile is the injected object', () => {
    assert.equal(viewport.profile, LegacyProfiles.mesh.viewport);
    assert.equal(obj.profile, LegacyProfiles.mesh.obj);
    assert.equal(gltf.profile, LegacyProfiles.mesh.gltf);
  });

  test('a foreign winding throws from sectionGrid, combinedGrid and panelQuadIndices', () => {
    for (const base of [LegacyProfiles.mesh.viewport, LegacyProfiles.mesh.obj, LegacyProfiles.mesh.gltf]) {
      const b = new WallMeshBuilder({ ...base, winding: 'x' });
      assert.throws(() => b.sectionGrid(SMALL_LAYOUT.sections[0]), unsupported('mesh.winding', 'x'));
      assert.throws(() => b.panelQuadIndices(0), unsupported('mesh.winding', 'x'));
    }
    const b = new WallMeshBuilder({ ...LegacyProfiles.mesh.viewport, winding: 'x' });
    assert.throws(() => b.combinedGrid(SMALL_LAYOUT, computeAtlas([SMALL_LAYOUT.sections[0].section])), unsupported('mesh.winding', 'x'));
  });

  test('a foreign normals value throws from sectionGrid (profile or opts.normals), even for an empty grid', () => {
    const b = new WallMeshBuilder({ ...LegacyProfiles.mesh.obj, normals: 'averaged' });
    assert.throws(() => b.sectionGrid(SMALL_LAYOUT.sections[0]), unsupported('mesh.normals', 'averaged'));
    assert.throws(() => obj.sectionGrid(SMALL_LAYOUT.sections[0], { normals: 'x' }), unsupported('mesh.normals', 'x'));
    const empty = computeWallLayout([section({ panelCols: -1, panelRows: -1 })]).sections[0];
    assert.throws(() => b.sectionGrid(empty), unsupported('mesh.normals', 'averaged'));
    // opts.normals overrides the profile (?? semantics): 'none' on the viewport builder pushes no normals.
    assert.equal(viewport.sectionGrid(SMALL_LAYOUT.sections[0], { normals: 'none' }).normals.length, 0);
    assert.equal(b.sectionGrid(SMALL_LAYOUT.sections[0], { normals: 'none' }).normals.length, 0);
  });

  test('a foreign combinedUV throws from combinedGrid, even for an empty wall; non-viewport profiles have none', () => {
    const b = new WallMeshBuilder({ ...LegacyProfiles.mesh.viewport, combinedUV: 'per-section' });
    assert.throws(() => b.combinedGrid(SMALL_LAYOUT, computeAtlas([SMALL_LAYOUT.sections[0].section])), unsupported('mesh.combinedUV', 'per-section'));
    assert.throws(() => b.combinedGrid(computeWallLayout([]), computeAtlas([])), unsupported('mesh.combinedUV', 'per-section'));
    assert.throws(() => obj.combinedGrid(SMALL_LAYOUT, computeAtlas([])), unsupported('mesh.combinedUV', 'per-section-overlap'));
    assert.throws(() => gltf.combinedGrid(SMALL_LAYOUT, computeAtlas([])), unsupported('mesh.combinedUV', undefined));
  });

  test('a foreign panelNormal throws from panelFacingNormal; only the OBJ profile defines it', () => {
    const b = new WallMeshBuilder({ ...LegacyProfiles.mesh.obj, panelNormal: 'x' });
    assert.throws(() => b.panelFacingNormal(PANEL), unsupported('mesh.panelNormal', 'x'));
    assert.throws(() => gltf.panelFacingNormal(PANEL), unsupported('mesh.panelNormal', undefined));
    assert.throws(() => viewport.panelFacingNormal(PANEL), unsupported('mesh.panelNormal', undefined));
    const n = obj.panelFacingNormal(PANEL);
    assert.ok(Object.is(n.x, Math.sin(PANEL.rotY)) && n.y === 0 && Object.is(n.z, Math.cos(PANEL.rotY)));
  });

  test('sectionGrid appends to the given out arrays and returns them; unknown uv options are rejected', () => {
    const out = { positions: [7], normals: [], uvs: [], indices: [9] };
    const g = viewport.sectionGrid(SMALL_LAYOUT.sections[0], { uv: 'unit', indexBase: 4 }, out);
    assert.equal(g.positions, out.positions);
    assert.equal(g.indices, out.indices);
    assert.equal(out.positions[0], 7);
    assert.equal(out.indices[0], 9);
    assert.equal(out.indices[1], 4);
    assert.equal(g.vertexAdvance, 9);
    assert.equal(out.positions.length, 1 + 9 * 3);
    assert.throws(() => viewport.sectionGrid(SMALL_LAYOUT.sections[0], { uv: 'atlas' }), TypeError);
  });

  test("fractional and string counts: declared vertexAdvance and raw vertsPerRow ('10' gives '101')", () => {
    const frac = computeWallLayout([section({ panelCols: 2.5, panelRows: 1 })]).sections[0];
    const gf = obj.sectionGrid(frac);
    assert.equal(gf.vertexAdvance, 3.5 * 2);
    assert.equal(gf.positions.length, 3 * 2 * 3);
    assert.deepEqual(gf.indices.slice(0, 6), [0, 3.5, 4.5, 0, 4.5, 1]);
    const str = computeWallLayout([section({ panelCols: '10', panelRows: 1 })]).sections[0];
    const gs = obj.sectionGrid(str);
    assert.equal(gs.vertexAdvance, 101 * 2);
    assert.deepEqual(gs.indices.slice(0, 6), [0, 101, 102, 0, 102, 1]);
  });
});

describe('index width (B-L5, 08 6.2)', () => {
  /** One flat section of cols x rows panels: (cols + 1) * (rows + 1) grid vertices. */
  const grid = (cols, rows) => {
    const section = new WallSection({ id: 0, name: 'Big', panelCols: cols, panelRows: rows, panelWidth: 500, panelHeight: 500,
      ledX: 8, ledY: 8, curveIntensity: 0, angleOffset: 0, color: '#00f0ff' });
    return new WallMeshBuilder(Strategies.mesh.gltf).sectionGrid(computeWallLayout([section]).sections[0]);
  };

  test("indexWidth: 'uint32' at or above 65,535 (the 5123 restart value), 'uint16' below", () => {
    assert.equal(indexWidth(65534), 'uint16');
    assert.equal(indexWidth(65535), 'uint32');
    assert.equal(indexWidth(65536), 'uint32');
    assert.equal(indexWidth(0), 'uint16');
    assert.equal(indexWidth(-Infinity), 'uint16', 'empty index array');
    assert.equal(indexWidth(4294967294), 'uint32');
  });

  test('maxIndexOf: a loop (no spread), NaN skipped, -Infinity for []', () => {
    assert.equal(maxIndexOf([]), -Infinity);
    assert.equal(maxIndexOf([3, NaN, 7, 1]), 7);
    assert.equal(maxIndexOf(new Uint32Array([5, 70000, 2])), 70000);
    const big = new Array(2000000).fill(1);
    big[1234567] = 99;
    assert.equal(maxIndexOf(big), 99, 'two million entries (a spread would overflow the stack)');
  });

  test('grids of exactly 65,535 and 65,536 vertices pick Uint16 and Uint32', () => {
    const below = grid(254, 256);     // 255 x 257 = 65,535 vertices, largest index 65,534
    assert.equal(below.positions.length / 3, 65535);
    assert.equal(maxIndexOf(below.indices), 65534);
    assert.equal(indexWidth(maxIndexOf(below.indices)), 'uint16');
    const at = grid(255, 255);        // 256 x 256 = 65,536 vertices, largest index 65,535
    assert.equal(at.positions.length / 3, 65536);
    assert.equal(maxIndexOf(at.indices), 65535);
    assert.equal(indexWidth(maxIndexOf(at.indices)), 'uint32');
  });
});

describe('framingBounds and the Feature 3 seams', () => {
  test('framingBounds(project) == project.wall.flatBounds() (the legacy flat loops)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const project = Project.createDefault();
      project.wall.replaceAll(sections);
      compareDeep(framingBounds(project), project.wall.flatBounds(), `${label}.framingBounds`, mm);
    });
  });

  test('empty wall: flatEdges [], firstEdge/lastEdge/bounds/pivotPoint null', () => {
    const empty = computeWallLayout([]);
    assert.deepEqual(empty.flatEdges(), []);
    assert.equal(empty.firstEdge, null);
    assert.equal(empty.lastEdge, null);
    assert.equal(empty.bounds(), null);
    for (const mode of Object.values(PivotMode)) assert.equal(empty.pivotPoint(mode), null);
  });

  test('flat 5 x 500 mm, 3 rows: bounds, bottom-left (0, 0, 0), wall-center (1.25, 0, 0), mesh-center', () => {
    const layout = computeWallLayout([WallSection.createDefault()]);
    assert.equal(layout.firstEdge, layout.sections[0].edges[0]);
    assert.equal(layout.lastEdge, layout.sections[0].edges[5]);
    assert.deepEqual(layout.bounds(), { min: { x: 0, y: 0, z: 0 }, max: { x: 2.5, y: 1.5, z: 0 } });
    assert.deepEqual(layout.pivotPoint(PivotMode.BOTTOM_LEFT), { x: 0, y: 0, z: 0 });
    assert.deepEqual(layout.pivotPoint(PivotMode.WALL_CENTER), { x: 1.25, y: 0, z: 0 });
    assert.deepEqual(layout.pivotPoint(PivotMode.MESH_CENTER), { x: 1.25, y: 0.75, z: 0 });
    assert.throws(() => layout.pivotPoint('centre'), RangeError);
  });

  test('two-section corner (2 x 1000 mm flat, then 2 x 1000 mm turned +90 deg): bounds and pivots', () => {
    const near = (a, b) => Math.abs(a - b) < 1e-12;
    const nearPoint = (p, q) => near(p.x, q.x) && near(p.y, q.y) && near(p.z, q.z);
    const layout = computeWallLayout([
      section({ panelCols: 2, panelRows: 2, panelWidth: 1000, panelHeight: 250 }),
      section({ id: 1, panelCols: 2, panelRows: 4, panelWidth: 1000, panelHeight: 250, angleOffset: 90 }),
    ]);
    assert.equal(layout.firstEdge, layout.sections[0].edges[0]);
    assert.equal(layout.lastEdge, layout.sections[1].edges[2]);
    assert.ok(near(layout.lastEdge.x, 2) && near(layout.lastEdge.z, 2), JSON.stringify(layout.lastEdge));
    const b = layout.bounds();
    assert.ok(nearPoint(b.min, { x: 0, y: 0, z: 0 }) && nearPoint(b.max, { x: 2, y: 1, z: 2 }), JSON.stringify(b));
    assert.deepEqual(layout.pivotPoint(PivotMode.BOTTOM_LEFT), { x: 0, y: 0, z: 0 });
    assert.ok(nearPoint(layout.pivotPoint(PivotMode.WALL_CENTER), { x: 1, y: 0, z: 1 }));
    assert.ok(nearPoint(layout.pivotPoint(PivotMode.MESH_CENTER), { x: 1, y: 0.5, z: 1 }));
    // flatEdges joins the two sections without duplicating the shared corner edge
    assert.equal(layout.flatEdges().length, 5);
  });

  test('bounds() equals the min/max of every builder position (fuzzed walls)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const layout = computeWallLayout(sections);
      const b = layout.bounds();
      if (b === null) {
        compareDeep(sections.length, 0, `${label}.bounds null`, mm);
        return;
      }
      const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
      for (const sl of layout.sections) {
        const p = gltf.sectionGrid(sl).positions;
        for (let k = 0; k < p.length; k += 3) {
          min.x = Math.min(min.x, p[k]); min.y = Math.min(min.y, p[k + 1]); min.z = Math.min(min.z, p[k + 2]);
          max.x = Math.max(max.x, p[k]); max.y = Math.max(max.y, p[k + 1]); max.z = Math.max(max.z, p[k + 2]);
        }
      }
      // Math.min/max propagate NaN while bounds() skips it; compare only walls without NaN coordinates.
      if ([min.x, min.y, min.z, max.x, max.y, max.z].some(Number.isNaN)) return;
      // bounds() compares with < / > (a new Feature 3 seam, not a legacy expression), so 0 and -0 are one value here.
      const unsigned = ({ x, y, z }) => ({ x: x + 0, y: y + 0, z: z + 0 });
      compareDeep({ min: unsigned(b.min), max: unsigned(b.max) }, { min: unsigned(min), max: unsigned(max) }, `${label}.bounds`, mm);
    });
  });

  test('an imported [] section list still lays out (flatEdges [] instead of a throw)', () => {
    const project = Project.createDefault();
    project.wall.replaceAll([]);
    assert.ok(project.wall instanceof Wall);
    assert.deepEqual(layoutProject(project).flatEdges(), []);
    assert.deepEqual(framingBounds(project), { totalWidth: 0, maxHeight: 0 });
  });
});
