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
import {
  quadIndices, WallMeshBuilder, maxIndexOf, indexWidth, atlasUvRect, sectionRangeForFace,
} from '../../js/geometry/WallMeshBuilder.js';
import { computeAtlas, sectionPxPerLed, panelPxPerLed, canvasFits, CANVAS_HARD_LIMITS } from '../../js/geometry/TextureAtlas.js';
import {
  panelModePxPerLed, PANEL_TEXTURE_BUDGET_PX, SECTION_TEXTURE_BUDGET_PX, MAX_CANVAS_SIDE,
} from '../../js/geometry/TextureBudget.js';
import {
  columnLabel, panelLabel, exportSectionName, exportPanelName, sanitizeFilename, textureFileNames, mtlTextureFile,
  atlasTexturePath,
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

  test('combinedGrid sectionRanges partition the index array in section order; vertexStart/vertexCount (08 P2-7a) follow the declared counts', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      const r = run(() => viewport.combinedGrid(computeWallLayout(sections), computeAtlas(sections)));
      if (!r.ok) return;
      const { sectionRanges, indices } = r.value;
      let next = 0;
      let vertex = 0;
      sectionRanges.forEach((range, i) => {
        const s = sections[i];
        const declared = (s.panelCols + 1) * (s.panelRows + 1);
        compareDeep(range, { sectionId: s.id, sectionIndex: i, indexStart: next, indexCount: range.indexCount,
          vertexStart: vertex, vertexCount: declared }, `${label}.sectionRanges[${i}]`, mm);
        next += range.indexCount;
        vertex += declared;
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

  test('sectionPxPerLed == 2056 (no override)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      sections.forEach((s, i) => {
        compareDeep(sectionPxPerLed(s.panelCols * s.ledX, s.panelRows * s.ledY), L.legacySectionScale(s, null), `${label}[${i}].section px/LED`, mm);
      });
    });
  });

  test('panelPxPerLed (B-M16 fixed in 08 P2-12d): the wall-wide budget of 07 6.12, one value per wall; the default wall keeps the legacy 16', () => {
    const panels = (n, led, fields = {}) => section({ panelCols: n, panelRows: 1, ledX: led, ledY: led, ...fields });
    // 07 6.12's worked examples.
    assert.equal(panelPxPerLed(Project.createDefault().wall.sections), 16, 'default wall: 15 panels of 32 x 32 LEDs');
    assert.equal(panelPxPerLed(Project.createDefault().wall.sections), L.legacyPanelScale(32, 32), 'the legacy value for the default wall');
    assert.equal(panelPxPerLed([panels(15, 176)]), 8, '15 panels of 176 x 176 (legacy 16)');
    assert.equal(panelPxPerLed([section({ panelCols: 80, panelRows: 40, ledX: 32, ledY: 32 })]), 3, 'large_wall size: 3,200 panels of 32 x 32 (legacy 16)');
    assert.equal(panelPxPerLed([panels(1, 1024)]), 4, 'one panel of 1024 x 1024: 4 (a 4096 px canvas)');
    // Wall-wide: the panels of every section count, and one value serves the whole rebuild.
    const a = panels(15, 176);
    assert.equal(panelPxPerLed([a, panels(15, 176, { id: 1 })]), 6, 'two such sections: floor(sqrt(33,554,432 / 929,280)) = 6');
    // Each canvas side stays within maxSide; below 1 px/LED the result is 1 (08 6.15).
    assert.equal(panelPxPerLed([panels(1, 512)], { maxSide: 1024 }), 2);
    assert.equal(panelPxPerLed([panels(1, 8192, { ledY: 8 })]), 1, 'ledX 8,192: floor(4096 / 8192) = 0, so 1 px/LED');
    // The canvas a rebuild would draw stays within the budget.
    for (const sections of [[panels(15, 176)], [section({ panelCols: 50, panelRows: 20, ledX: 64, ledY: 64 })]]) {
      const p = panelPxPerLed(sections);
      const total = sections.reduce((sum, s) => sum + s.panelCols * s.panelRows * (s.ledX * p) * (s.ledY * p), 0);
      assert.ok(total <= PANEL_TEXTURE_BUDGET_PX, `${total} px`);
      for (const s of sections) assert.ok(Math.max(s.ledX, s.ledY) * p <= MAX_CANVAS_SIDE);
    }
  });

  test('TextureBudget (07 X3, delivered by 08 P2-12d): the constants and panelModePxPerLed of 07 6.12', () => {
    assert.equal(SECTION_TEXTURE_BUDGET_PX, 16777216);
    assert.equal(PANEL_TEXTURE_BUDGET_PX, 33554432);
    assert.equal(MAX_CANVAS_SIDE, 4096);
    assert.deepEqual(panelModePxPerLed({ wallPanelLeds: 15360, maxLedSide: 32 }), { pxPerLed: 16, fits: true });
    assert.deepEqual(panelModePxPerLed({ wallPanelLeds: 464640, maxLedSide: 176 }), { pxPerLed: 8, fits: true });
    assert.deepEqual(panelModePxPerLed({ wallPanelLeds: 3276800, maxLedSide: 32 }), { pxPerLed: 3, fits: true });
    assert.deepEqual(panelModePxPerLed({ wallPanelLeds: 1048576, maxLedSide: 1024 }), { pxPerLed: 4, fits: true });
    assert.deepEqual(panelModePxPerLed({ wallPanelLeds: 33554433, maxLedSide: 32 }), { pxPerLed: 0, fits: false }, 'above 33,554,432 LEDs');
    assert.deepEqual(panelModePxPerLed({ wallPanelLeds: 1024, maxLedSide: 32 }, { maxSide: 256 }), { pxPerLed: 8, fits: true });
    let previous = Infinity;
    for (let leds = 1000; leds <= 40000000; leds *= 3) {
      const { pxPerLed } = panelModePxPerLed({ wallPanelLeds: leds, maxLedSide: 64 });
      assert.ok(pxPerLed <= previous && pxPerLed <= 4096 / 64, `monotonic in wallPanelLeds and within maxSide (${leds})`);
      previous = pxPerLed;
    }
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

  test('textureFileNames + start columns: the legacy ZIP names (4511, 4534-4543) where those were unique, always unique (B-L14 fixed in 08 P2-6b)', (t) => {
    let collided = 0;
    overAllWalls(t, ({ sections }, mm, label) => {
      const legacy = run(() => L.legacyZipTextures(sections));
      const names = run(() => textureFileNames(sections));
      if (!legacy.ok || !names.ok) {
        compareOutcome(names, legacy, `${label}.zip names (outcome)`, mm);
        return;
      }
      const legacyNames = legacy.value.files.map((f) => f.filename);
      const lower = names.value.map((n) => n.toLowerCase());
      compareDeep(new Set(lower).size, sections.length, `${label}.unique (case-insensitive)`, mm);
      if (new Set(legacyNames.map((n) => n.toLowerCase())).size === sections.length) {
        compareDeep(names.value, legacyNames, `${label}.names`, mm);
      } else {
        collided++;
        // A repeated name keeps the legacy base and gains a _2, _3, ... suffix.
        names.value.forEach((n, i) => {
          const base = legacyNames[i].slice(0, -'_PanelIDs.png'.length);
          const suffixed = n.startsWith(`${base}_`) && /^[0-9]+_PanelIDs[.]png$/.test(n.slice(base.length + 1));
          compareDeep(n === legacyNames[i] || suffixed, true, `${label}[${i}].suffixed legacy base`, mm);
        });
      }
      const { entries } = computeAtlas(sections);
      compareDeep(entries.map((e) => e.startCol), legacy.value.files.map((f) => f.startCol), `${label}.startCol`, mm);
    });
    t.diagnostic(`${collided} walls with colliding legacy names`);
  });

  test('textureFileNames (08 8.4): no collisions, case-insensitive, stable for unique names', () => {
    const named = (...names) => names.map((name) => section({ name }));
    assert.deepEqual(textureFileNames(named('A B', 'A_B', 'Dup', 'Dup', 'dup')),
      ['A_B_PanelIDs.png', 'A_B_2_PanelIDs.png', 'Dup_PanelIDs.png', 'Dup_2_PanelIDs.png', 'dup_3_PanelIDs.png']);
    assert.deepEqual(textureFileNames(named('Back', 'Side Right', 'Front', 'Return')),
      ['Back_PanelIDs.png', 'Side_Right_PanelIDs.png', 'Front_PanelIDs.png', 'Return_PanelIDs.png']);
    assert.deepEqual(textureFileNames(named('A_B_2', 'A B', 'A_B')), ['A_B_2_PanelIDs.png', 'A_B_PanelIDs.png', 'A_B_3_PanelIDs.png'],
      'a suffix never reuses a name already taken');
    assert.deepEqual(textureFileNames(named('', '', 'Wall_1')), ['Wall_1_PanelIDs.png', 'Wall_2_PanelIDs.png', 'Wall_1_2_PanelIDs.png']);
    assert.deepEqual(textureFileNames([]), []);
  });

  test('exportSectionName + mtlTextureFile of the legacy index names == the MTL section block (4607-4613)', (t) => {
    overAllWalls(t, ({ sections }, mm, label) => {
      let mtl = '';
      sections.forEach((s, i) => {
        mtl += `newmtl ${exportSectionName(i)}\n`;
        mtl += `Ka 0.1 0.1 0.1\nKs 0.5 0.5 0.5\nNs 100\nd 1.0\n`;
        mtl += `map_Kd ${mtlTextureFile(`Wall_${i + 1}_PanelIDs.png`)}\n\n`;
      });
      compareDeep(mtl, L.legacyMtlSectionText(sections), `${label}.mtl`, mm);
    });
  });

  test('sanitizeFilename keeps the legacy callee text: a numeric name throws "name.replace is not a function"', () => {
    assert.equal(sanitizeFilename('A B/c-d_e.f'), 'A_B_c-d_e_f');
    assert.throws(() => sanitizeFilename(42), { name: 'TypeError', message: 'name.replace is not a function' });
    assert.throws(() => textureFileNames([section({ name: 7 })]), { name: 'TypeError', message: 'name.replace is not a function' });
    assert.equal(textureFileNames([section({ name: 'a' }), section({ name: 'b' }), section({ name: 0 })])[2], 'Wall_3_PanelIDs.png');
    assert.equal(textureFileNames([section({ name: '' })])[0], 'Wall_1_PanelIDs.png');
  });

  test('atlasTexturePath (08 P2-7f): textures/ + the brand files\' panelIdsPng, never a literal (06 R-B3b)', () => {
    assert.equal(atlasTexturePath({ panelIdsPng: 'x-panel-ids.png' }), 'textures/x-panel-ids.png');
    assert.equal(atlasTexturePath({ panelIdsPng: 'morph-led-wall-panel-ids.png' }), 'textures/morph-led-wall-panel-ids.png');
  });

  test('names: exportSectionName, exportPanelName, mtlTextureFile (B-M2 fixed in 08 P2-6d: the texture file name)', () => {
    assert.equal(exportSectionName(0), 'Wall_1');
    assert.equal(exportPanelName(1, 2, 3), 'Wall_2_Panel_R3_C4');
    assert.equal(mtlTextureFile('Wall_5_PanelIDs.png'), 'textures/Wall_5_PanelIDs.png');
    const name = textureFileNames([section({ name: 'Main' })])[0];
    assert.equal(mtlTextureFile(name), `textures/${name}`, 'the MTL path is the ZIP entry and the JSON texture_file');
    assert.equal(mtlTextureFile(name), 'textures/Main_PanelIDs.png');
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

  test("quadIndices throws unsupportedStrategy for any winding other than 'ccw' and 'legacy-cw'", () => {
    assert.throws(() => quadIndices(0, 1, 3, 2, 'cw'), unsupported('mesh.winding', 'cw'));
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
    const b = new WallMeshBuilder({ ...LegacyProfiles.mesh.obj, normals: 'smooth' });
    assert.throws(() => b.sectionGrid(SMALL_LAYOUT.sections[0]), unsupported('mesh.normals', 'smooth'));
    assert.throws(() => obj.sectionGrid(SMALL_LAYOUT.sections[0], { normals: 'x' }), unsupported('mesh.normals', 'x'));
    const empty = computeWallLayout([section({ panelCols: -1, panelRows: -1 })]).sections[0];
    assert.throws(() => b.sectionGrid(empty), unsupported('mesh.normals', 'smooth'));
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

  test('a foreign panelNormal throws from panelFacingNormal; of the Phase-1 profiles only OBJ defines it', () => {
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

describe('canvasFits (B-L4, 08 6.3)', () => {
  test('CANVAS_HARD_LIMITS: 32,767 px per side, 268,435,456 px in area, frozen', () => {
    assert.deepEqual(CANVAS_HARD_LIMITS, { maxSide: 32767, maxArea: 268435456 });
    assert.ok(Object.isFrozen(CANVAS_HARD_LIMITS));
  });

  test('side boundaries: 32,767 fits, 32,768 does not; 1 is the minimum', () => {
    assert.equal(canvasFits(32767, 1), true);
    assert.equal(canvasFits(1, 32767), true);
    assert.equal(canvasFits(32768, 1), false);
    assert.equal(canvasFits(1, 32768), false);
    assert.equal(canvasFits(1, 1), true);
    for (const bad of [0, 0.5, -1, NaN, Infinity]) {
      assert.equal(canvasFits(bad, 10), false, String(bad));
      assert.equal(canvasFits(10, bad), false, String(bad));
    }
  });

  test('area boundaries: 268,435,456 fits, one pixel more does not', () => {
    assert.equal(canvasFits(16384, 16384), true, '16,384 x 16,384 = 268,435,456');
    assert.equal(canvasFits(16384, 16385), false);
    assert.equal(canvasFits(32767, 8192), true, '268,427,264');
    assert.equal(canvasFits(32767, 8193), false, '268,460,031');
    const wide = { maxSide: 1e12, maxArea: 268435456 };
    assert.equal(canvasFits(268435456, 1, wide), true);
    assert.equal(canvasFits(268435457, 1, wide), false);
  });

  test('the p2_oversize_canvas wall (70,000 x 128 px) does not fit; the default wall does', () => {
    const oversize = new WallSection({ id: 0, name: 'Oversize', panelCols: 70, panelRows: 2, panelWidth: 500, panelHeight: 500,
      ledX: 1000, ledY: 64, curveIntensity: 0, angleOffset: 0, color: '#00f0ff' });
    const atlas = computeAtlas([oversize]);
    assert.equal(atlas.totalLedX * atlas.pxPerLed, 70000);
    assert.equal(canvasFits(atlas.totalLedX * atlas.pxPerLed, atlas.totalLedY * atlas.pxPerLed), false);
    const small = computeAtlas(Project.createDefault().wall.sections);
    assert.equal(canvasFits(small.totalLedX * small.pxPerLed, small.totalLedY * small.pxPerLed), true);
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

// ---------------------------------------------------------------------------------------------------------------
// Stage-facing winding and normals (B-H1, B-H2, B-L3; docs/improvements/08-bugfix-roadmap.md 6.4, P2-2)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Seeded walls with integer inputs only (01 6.3: string and fractional counts give garbage geometry, B-L8 / B-L15):
 * 1-4 sections, cols 1-50, rows 1-20, curves -30..30 (about 30 % flat), offsets -180..180, widths 100-1000 mm.
 */
function integerWalls(seed, count) {
  const rand = rng(seed);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const walls = [];
  for (let w = 0; w < count; w++) {
    const n = int(1, 4);
    const sections = [];
    for (let i = 0; i < n; i++) {
      sections.push(new WallSection({
        id: i, name: `S${i}`, panelCols: int(1, 50), panelRows: rand() < 0.8 ? int(1, 4) : int(5, 20),
        panelWidth: int(100, 1000), panelHeight: int(100, 1000), ledX: 32, ledY: 32,
        curveIntensity: rand() < 0.3 ? 0 : int(-30, 30), angleOffset: int(-180, 180), color: '#00f0ff',
      }));
    }
    walls.push({ label: `int#${w}`, sections });
  }
  return walls;
}

/** The seeded integer walls plus the harness configurations (all integer, imported as the harness does). */
const INTEGER_WALLS = [...integerWalls(0x2a2a, 200), ...CONFIG_WALLS];

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.sqrt(dot3(a, a));

/**
 * The orientation check of tools/check-orientation.mjs over one grid: for every triangle (a, b, c) of `indices`
 * (relative to `base`), the geometric normal (b - a) x (c - a) against the stored normal of each corner.
 * @returns {{triangles: number, failures: number, minCos: number, first: string|null}}
 */
function orientation({ positions, normals, indices }, base = 0) {
  const p = (i) => [positions[3 * (i - base)], positions[3 * (i - base) + 1], positions[3 * (i - base) + 2]];
  const n = (i) => [normals[3 * (i - base)], normals[3 * (i - base) + 1], normals[3 * (i - base) + 2]];
  const r = { triangles: 0, failures: 0, minCos: Infinity, first: null };
  for (let k = 0; k < indices.length; k += 3) {
    const t = [indices[k], indices[k + 1], indices[k + 2]];
    const g = cross3(sub3(p(t[1]), p(t[0])), sub3(p(t[2]), p(t[0])));
    r.triangles++;
    for (const i of t) {
      const cos = dot3(g, n(i)) / (len3(g) * len3(n(i)));
      if (!(cos > 0)) {
        r.failures++;
        if (!r.first) r.first = `triangle ${k / 3} (${t.join(', ')}): cos ${cos} at vertex ${i}`;
        break;
      }
      r.minCos = Math.min(r.minCos, cos);
    }
  }
  return r;
}

describe('stage-facing winding (B-H1, B-H2; 08 6.4)', () => {
  test("quadIndices 'ccw' is [bl, br, tr, bl, tr, tl]; panel quads (BL=0, BR=1, TR=2, TL=3) give [0, 1, 2, 0, 2, 3]", () => {
    assert.deepEqual(quadIndices(10, 11, 20, 21, 'ccw'), [10, 11, 21, 10, 21, 20]);
    assert.deepEqual(quadIndices(0, 1, 3, 2, 'ccw'), [0, 1, 2, 0, 2, 3]);
    const ccw = new WallMeshBuilder({ ...LegacyProfiles.mesh.obj, winding: 'ccw' });
    for (const v of [0, 1, 5, 1001]) assert.deepEqual(ccw.panelQuadIndices(v), [v, v + 1, v + 2, v, v + 2, v + 3]);
  });

  test('per quad, the ccw triangles are the legacy-cw triangles with their last two vertices swapped (same bl-tr diagonal)', () => {
    const rand = rng(0x51de);
    for (let k = 0; k < 2000; k++) {
      const bl = Math.floor(rand() * 1e6), br = bl + 1, tl = bl + 2 + Math.floor(rand() * 60), tr = tl + 1;
      const now = quadIndices(bl, br, tl, tr, 'ccw');
      const old = quadIndices(bl, br, tl, tr, 'legacy-cw');
      const swap = ([a, b, c]) => [a, c, b];
      assert.deepEqual(now.slice(0, 3), swap(old.slice(3, 6)), 'new triangle 0 = legacy triangle 1, last two swapped');
      assert.deepEqual(now.slice(3, 6), swap(old.slice(0, 3)), 'new triangle 1 = legacy triangle 0, last two swapped');
    }
  });

  test('08 6.4 proof: a flat quad BL (0,0,0), BR (w,0,0), TR (w,h,0) faces +Z with ccw and -Z with legacy-cw', () => {
    const w = 0.5, h = 0.25;
    const P = [[0, 0, 0], [w, 0, 0], [0, h, 0], [w, h, 0]];   // bl, br, tl, tr
    const face = (winding) => {
      const q = quadIndices(0, 1, 2, 3, winding);
      return [0, 3].map((k) => cross3(sub3(P[q[k + 1]], P[q[k]]), sub3(P[q[k + 2]], P[q[k]])));
    };
    for (const g of face('ccw')) assert.deepEqual(g, [0, 0, w * h]);
    for (const g of face('legacy-cw')) assert.deepEqual(g, [0, 0, -w * h]);
  });

  test("the production viewport profile winds 'ccw' (08 P2-2a); LegacyProfiles keeps 'legacy-cw'", () => {
    assert.equal(Strategies.mesh.viewport.winding, 'ccw');
    assert.equal(LegacyProfiles.mesh.viewport.winding, 'legacy-cw');
    const grid = new WallMeshBuilder(Strategies.mesh.viewport).sectionGrid(SMALL_LAYOUT.sections[0]);
    const legacyGrid = viewport.sectionGrid(SMALL_LAYOUT.sections[0]);
    assert.deepEqual(grid.positions, legacyGrid.positions);
    assert.equal(grid.indices.length, legacyGrid.indices.length);
    assert.deepEqual(grid.indices.slice(0, 6), [0, 1, 4, 0, 4, 3]);
    assert.deepEqual(legacyGrid.indices.slice(0, 6), [0, 3, 4, 0, 4, 1]);
  });

  test('integer layouts: every production viewport triangle faces along its stored vertex normals; legacy-cw faces away', (t) => {
    const prod = new WallMeshBuilder(Strategies.mesh.viewport);
    let triangles = 0, minCos = Infinity;
    for (const { label, sections } of INTEGER_WALLS) {
      for (const sl of computeWallLayout(sections).sections) {
        const r = orientation(prod.sectionGrid(sl));
        assert.equal(r.failures, 0, `${label} section ${sl.sectionIndex}: ${r.first}`);
        triangles += r.triangles;
        minCos = Math.min(minCos, r.minCos);
        const legacy = orientation(viewport.sectionGrid(sl));
        assert.equal(legacy.failures, legacy.triangles, `${label} section ${sl.sectionIndex}: legacy-cw should face away everywhere`);
      }
    }
    t.diagnostic(`${triangles} triangles over ${INTEGER_WALLS.length} walls; minimum cos(face, vertex normal) ${minCos}`);
    assert.ok(triangles > 100000);
  });

  test('panel quads: the ccw corners BL, BR, TR, TL face along the facing normal for every heading', () => {
    const b = new WallMeshBuilder({ winding: 'ccw', panelNormal: 'facing' });
    for (const { sections } of INTEGER_WALLS.slice(0, 60)) {
      for (const sl of computeWallLayout(sections).sections) {
        for (const panel of sl.panels) {
          const c = b.panelCorners(panel, sl.panelW, sl.panelH).map(({ x, y, z }) => [x, y, z]);
          const nrm = b.panelFacingNormal(panel);
          const n = [nrm.x, nrm.y, nrm.z];
          const q = b.panelQuadIndices(0);
          for (const k of [0, 3]) {
            const g = cross3(sub3(c[q[k + 1]], c[q[k]]), sub3(c[q[k + 2]], c[q[k]]));
            assert.ok(dot3(g, n) / len3(g) > 0.999999, `heading ${panel.rotY}`);
          }
        }
      }
    }
  });
});

describe("viewport normals 'averaged' (B-L3; 08 6.4 with 01 CR-1)", () => {
  const averaged = new WallMeshBuilder({ ...LegacyProfiles.mesh.viewport, normals: 'averaged' });
  const rightPanel = new WallMeshBuilder({ ...LegacyProfiles.mesh.viewport, normals: 'right-panel' });
  /** The (nx, nz) of vertex column `col` (row 0) of a grid of `cols + 1` columns. */
  const column = (normals, col) => [normals[3 * col], normals[3 * col + 1], normals[3 * col + 2]];
  /** The panel (segment) normal of edges j -> j + 1, verbatim legacy 1610-1615. */
  const segment = (edges, j) => {
    const dx = edges[j + 1].x - edges[j].x;
    const dz = edges[j + 1].z - edges[j].z;
    const len = Math.sqrt(dx * dx + dz * dz);
    return [-dz / len, 0, dx / len];
  };
  const angleBetween = (a, b) => Math.atan2(len3(cross3(a, b)), dot3(a, b));

  test("the production viewport profile uses 'averaged' (08 P2-2b); LegacyProfiles keeps 'right-panel'", () => {
    assert.equal(Strategies.mesh.viewport.normals, 'averaged');
    assert.equal(LegacyProfiles.mesh.viewport.normals, 'right-panel');
    assert.equal(new WallMeshBuilder(Strategies.mesh.viewport).sectionGrid(SMALL_LAYOUT.sections[0]).normals.length, 9 * 3);
  });

  test('flat sections: Object.is-equal to the right-panel normals, within 1e-12 of (-sin a, 0, cos a), (0, 0, 1) at heading 0', (t) => {
    let vertices = 0;
    for (const { label, sections } of INTEGER_WALLS) {
      for (const sl of computeWallLayout(sections).sections) {
        if (!sl.isFlat) continue;
        const got = averaged.sectionGrid(sl).normals;
        const want = rightPanel.sectionGrid(sl).normals;
        assert.equal(got.length, want.length);
        for (let i = 0; i < got.length; i++) assert.ok(Object.is(got[i], want[i]), `${label} section ${sl.sectionIndex}: [${i}]`);
        const a = sl.edges[0].angle;
        for (let i = 0; i < got.length; i += 3) {
          assert.ok(Math.abs(got[i] + Math.sin(a)) < 1e-12 && got[i + 1] === 0 && Math.abs(got[i + 2] - Math.cos(a)) < 1e-12,
            `${label} section ${sl.sectionIndex}: (${got[i]}, ${got[i + 2]}) vs heading ${a}`);
        }
        if (a === 0) for (let i = 0; i < got.length; i += 3) assert.ok(got[i] === 0 && got[i + 2] === 1, `${label}: heading 0`);
        vertices += got.length / 3;
      }
    }
    t.diagnostic(`${vertices} flat-section vertices`);
  });

  test('large_wall L3 (40 deg): the flat short-circuit is per section (a per-vertex Object.is test would renormalise)', () => {
    const { sections } = CONFIG_WALLS.find(({ label }) => label === 'config:large_wall');
    const sl = computeWallLayout(sections).sections.find((s) => s.section.name === 'L3');
    assert.ok(sl && sl.isFlat, 'large_wall has a flat section named L3');
    assert.ok(Math.abs(sl.edges[0].angle - (40 * Math.PI) / 180) < 1e-12, `L3 heading ${sl.edges[0].angle}`);
    const C = sl.edges.length - 1;
    const n = Array.from({ length: C }, (_, j) => segment(sl.edges, j));
    // The edge positions are accumulated, so neighbouring panel normals differ in the last bit somewhere.
    const drifting = n.filter((v, j) => j > 0 && !(Object.is(v[0], n[j - 1][0]) && Object.is(v[2], n[j - 1][2]))).length;
    assert.ok(drifting > 0, 'L3 has bit-different neighbouring panel normals (the CR-1 case)');
    const got = averaged.sectionGrid(sl).normals;
    const want = rightPanel.sectionGrid(sl).normals;
    for (let i = 0; i < got.length; i++) assert.ok(Object.is(got[i], want[i]), `[${i}]`);
  });

  test('curved sections: interior columns are the unit bisector, |c|/2 from each adjacent panel normal; ends equal their panel normal', (t) => {
    let interior = 0;
    for (const { label, sections } of INTEGER_WALLS) {
      for (const sl of computeWallLayout(sections).sections) {
        if (sl.isFlat) continue;
        const C = sl.edges.length - 1;
        const half = Math.abs((sl.section.curveIntensity * Math.PI) / 180) / 2;
        const g = averaged.sectionGrid(sl);
        const rows = sl.section.panelRows + 1;
        for (let row = 0; row < rows; row++) {
          for (let k = 0; k <= C; k++) {
            const v = column(g.normals, row * (C + 1) + k);
            assert.ok(Math.abs(len3(v) - 1) < 1e-12 && v[1] === 0, `${label}: |n| at column ${k}`);
            if (k === 0) assert.deepEqual(v, segment(sl.edges, 0), `${label}: first column`);
            else if (k === C) assert.deepEqual(v, segment(sl.edges, C - 1), `${label}: last column`);
            else {
              const left = angleBetween(v, segment(sl.edges, k - 1));
              const right = angleBetween(v, segment(sl.edges, k));
              assert.ok(Math.abs(left - half) < 1e-12 && Math.abs(right - half) < 1e-12,
                `${label} column ${k}: ${left} / ${right} rad vs c/2 = ${half}`);
              interior++;
            }
          }
        }
      }
    }
    t.diagnostic(`${interior} interior curved-section vertices`);
    assert.ok(interior > 10000);
  });

  test('integer layouts: every production viewport triangle faces its averaged vertex normals, cos >= cos(|c|/2) - 1e-9', (t) => {
    const prod = new WallMeshBuilder(Strategies.mesh.viewport);
    let triangles = 0, minCos = Infinity;
    for (const { label, sections } of INTEGER_WALLS) {
      for (const sl of computeWallLayout(sections).sections) {
        const r = orientation(prod.sectionGrid(sl));
        assert.equal(r.failures, 0, `${label} section ${sl.sectionIndex}: ${r.first}`);
        const half = Math.abs((sl.section.curveIntensity * Math.PI) / 180) / 2;
        assert.ok(r.minCos >= Math.cos(half) - 1e-9, `${label} section ${sl.sectionIndex}: min cos ${r.minCos}`);
        triangles += r.triangles;
        minCos = Math.min(minCos, r.minCos);
      }
    }
    t.diagnostic(`${triangles} triangles; minimum cos(face, vertex normal) ${minCos} (cos 15 deg = ${Math.cos(Math.PI / 12)})`);
  });

  test("degenerate counts: panelCols 0 throws the legacy TypeError (flat or curved); strings and fractions do not throw", () => {
    for (const curveIntensity of [0, 5]) {
      const sl = computeWallLayout([section({ panelCols: 0, curveIntensity })]).sections[0];
      assert.throws(() => averaged.sectionGrid(sl), { name: 'TypeError', message: "Cannot read properties of undefined (reading 'x')" });
      assert.throws(() => rightPanel.sectionGrid(sl), { name: 'TypeError', message: "Cannot read properties of undefined (reading 'x')" });
    }
    for (const fields of [{ panelCols: '10', curveIntensity: '5' }, { panelCols: 2.5, curveIntensity: 3 }, { curveIntensity: '0' }, { panelRows: 2.5 }]) {
      const sl = computeWallLayout([section(fields)]).sections[0];
      assert.doesNotThrow(() => averaged.sectionGrid(sl), JSON.stringify(fields));
    }
  });

  test('every fuzzed wall: averaged throws exactly when right-panel throws (same type and message)', (t) => {
    let threw = 0;
    for (const { label, sections } of WALLS) {
      for (const sl of computeWallLayout(sections).sections) {
        const a = run(() => averaged.sectionGrid(sl));
        const b = run(() => rightPanel.sectionGrid(sl));
        assert.equal(a.ok, b.ok, label);
        if (!a.ok) {
          assert.equal(`${a.error.constructor.name}: ${a.error.message}`, `${b.error.constructor.name}: ${b.error.message}`, label);
          threw++;
        } else {
          assert.deepEqual(a.value.positions, b.value.positions);
          assert.deepEqual(a.value.indices, b.value.indices);
          assert.equal(a.value.normals.length, b.value.normals.length);
        }
      }
    }
    t.diagnostic(`${threw} sections throw the legacy TypeError in both`);
  });
});

describe('glTF builder profile and panel normals (B-H2; 08 P2-2d)', () => {
  test("the production glTF profile winds 'ccw' with 'averaged' normals and defines panelNormal 'facing'", () => {
    assert.equal(Strategies.mesh.gltf.winding, 'ccw');
    assert.equal(Strategies.mesh.gltf.normals, 'averaged');
    assert.equal(Strategies.mesh.gltf.panelNormal, 'facing');
    assert.ok(!('panelNormal' in LegacyProfiles.mesh.gltf));
    const b = new WallMeshBuilder(Strategies.mesh.gltf);
    assert.deepEqual(b.panelQuadIndices(0), [0, 1, 2, 0, 2, 3]);
    const n = b.panelFacingNormal(PANEL);
    assert.ok(Object.is(n.x, Math.sin(PANEL.rotY)) && n.y === 0 && Object.is(n.z, Math.cos(PANEL.rotY)));
  });

  test('panelNormals(panel) is panelFacingNormal x 4 (BL, BR, TR, TL); it throws where panelFacingNormal throws', () => {
    const b = new WallMeshBuilder(Strategies.mesh.gltf);
    for (const sl of SMALL_LAYOUT.sections) {
      for (const panel of sl.panels) {
        const n = b.panelFacingNormal(panel);
        const all = b.panelNormals(panel);
        assert.equal(all.length, 12);
        for (let k = 0; k < 12; k += 3) assert.ok(Object.is(all[k], n.x) && all[k + 1] === 0 && Object.is(all[k + 2], n.z));
      }
    }
    assert.throws(() => gltf.panelNormals(PANEL), unsupported('mesh.panelNormal', undefined));
  });

  test('PANEL_UVS: [0,0, 1,0, 1,1, 0,1] in the panelCorners order (the OBJ panel vt lines), frozen', () => {
    assert.deepEqual(WallMeshBuilder.PANEL_UVS, [0, 0, 1, 0, 1, 1, 0, 1]);
    assert.ok(Object.isFrozen(WallMeshBuilder.PANEL_UVS));
  });
});

describe('panel-mode section-space UVs (B-M16, B-L19; 08 P2-12d, 08 6.15)', () => {
  test('panelUvs: BL, BR, TR, TL equal ((col + u) / cols, (row + v) / rows); shared corners equal the strip UVs bit for bit', (t) => {
    const builder = new WallMeshBuilder(Strategies.mesh.viewport);
    let checked = 0;
    const walls = [...CONFIG_WALLS, { label: 'odd counts', sections: [section({ panelCols: 7, panelRows: 3 }), section({ id: 1, panelCols: 13, panelRows: 11, curveIntensity: 5 })] }];
    for (const { label, sections } of walls) {
      for (const sl of computeWallLayout(sections).sections) {
        const { panelCols: cols, panelRows: rows } = sl.section;
        const strip = builder.sectionGrid(sl, { uv: 'unit' }).uvs;
        const stripUv = (col, row) => [strip[2 * (row * (cols + 1) + col)], strip[2 * (row * (cols + 1) + col) + 1]];
        for (const panel of sl.panels) {
          const uvs = builder.panelUvs(panel, sl);
          assert.equal(uvs.length, 4);
          [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], k) => {
            assert.ok(Object.is(uvs[k][0], (panel.col + u) / cols) && Object.is(uvs[k][1], (panel.row + v) / rows), `${label} ${k}`);
            // The corner (panel.col + u, panel.row + v) of the section grid: the section-mode strip UV, bit for bit.
            const [su, sv] = stripUv(panel.col + u, panel.row + v);
            assert.ok(Object.is(uvs[k][0], su) && Object.is(uvs[k][1], sv), `${label} panel ${panel.col},${panel.row} corner ${k}`);
            checked++;
          });
        }
      }
    }
    t.diagnostic(`${checked} panel corners checked`);
  });
});

describe("pixel-accurate atlas UVs (B-M5; 08 P2-7a, 08 6.7)", () => {
  const production = new WallMeshBuilder(Strategies.mesh.viewport);
  const mixed = CONFIG_WALLS.find((w) => w.label === 'config:mixed').sections;

  test("the production viewport profile is 'atlas-pixel-accurate'; LegacyProfiles keeps 'atlas-u-full-v'", () => {
    assert.equal(Strategies.mesh.viewport.combinedUV, 'atlas-pixel-accurate');
    assert.equal(LegacyProfiles.mesh.viewport.combinedUV, 'atlas-u-full-v');
  });

  test('computeAtlas uvHeight = rows * ledY / totalLedY: exactly 1 for equal heights; the mixed config shares', () => {
    for (const { label, sections } of CONFIG_WALLS) {
      const atlas = computeAtlas(sections);
      atlas.entries.forEach((e, i) => {
        const s = sections[i];
        assert.ok(Object.is(e.uvHeight, (s.panelRows * s.ledY) / atlas.totalLedY), label);
        if (label !== 'config:mixed') assert.equal(e.uvHeight, 1, `${label}: equal heights`);
      });
    }
    // mixed: 3 x 64, 5 x 54, 2 x 64, 6 x 32 LED rows -> 192, 270, 128, 192 of 270.
    assert.deepEqual(computeAtlas(mixed).entries.map((e) => e.uvHeight), [192 / 270, 1, 128 / 270, 192 / 270]);
    assert.deepEqual(atlasUvRect(computeAtlas(mixed).entries[2]),
      { offsetU: computeAtlas(mixed).entries[2].uvOffsetX, widthU: computeAtlas(mixed).entries[2].uvWidth, heightV: 128 / 270 });
  });

  test("equal heights: 'atlas-pixel-accurate' UVs are Object.is-equal to the legacy 'atlas-u-full-v' UVs (08 criterion 28)", (t) => {
    let compared = 0;
    for (const { label, sections } of [...HAND_WALLS, ...CONFIG_WALLS, ...FUZZ_WALLS]) {
      const atlas = computeAtlas(sections);
      if (!atlas.entries.every((e) => e.uvHeight === 1)) continue;
      const a = run(() => production.combinedGrid(computeWallLayout(sections), atlas).uvs);
      const b = run(() => viewport.combinedGrid(computeWallLayout(sections), atlas).uvs);
      if (!a.ok || !b.ok) { assert.equal(a.ok, b.ok, label); continue; }
      assert.equal(a.value.length, b.value.length);
      for (let k = 0; k < a.value.length; k++) assert.ok(Object.is(a.value[k], b.value[k]), `${label} uv[${k}]`);
      compared++;
    }
    t.diagnostic(`${compared} equal-height walls compared`);
    assert.ok(compared > 50);
  });

  test('mixed heights: each section spans v 0..uvHeight, its own share of the bottom-aligned atlas (08 criterion 27)', () => {
    const atlas = computeAtlas(mixed);
    const g = production.combinedGrid(computeWallLayout(mixed), atlas);
    g.sectionRanges.forEach((range, i) => {
      const s = mixed[i];
      const vs = [];
      for (let k = range.vertexStart; k < range.vertexStart + range.vertexCount; k++) vs.push(g.uvs[2 * k + 1]);
      assert.equal(Math.min(...vs), 0, 'bottom edge at v = 0 (the atlas is bottom-aligned)');
      const vMax = Math.max(...vs);
      assert.ok(Object.is(vMax, atlas.entries[i].uvHeight), `${s.name}: v_max = rows * ledY / totalLedY`);
      // PanelIdRenderer.atlasCanvas draws the section at canvas y = (totalLedY - rows * ledY) * scale from the top, and
      // CanvasTexture.flipY puts the canvas top at v = 1: the section's top edge is v = 1 - y / height.
      const top = 1 - (atlas.totalLedY - s.panelRows * s.ledY) / atlas.totalLedY;
      assert.ok(Math.abs(vMax - top) < 1e-12, `${s.name}: top edge ${top}`);
      // u still covers the section's own atlas columns.
      const us = [];
      for (let k = range.vertexStart; k < range.vertexStart + range.vertexCount; k++) us.push(g.uvs[2 * k]);
      assert.ok(Object.is(Math.min(...us), atlas.entries[i].uvOffsetX));
      assert.ok(Math.abs(Math.max(...us) - (atlas.entries[i].uvOffsetX + atlas.entries[i].uvWidth)) < 1e-12);
    });
  });

  test('sectionRangeForFace: binary search over sectionRanges (02 6.13, E12); null past the last face', () => {
    const sections = [section({ panelCols: 5, panelRows: 3 }), section({ id: 1, panelCols: 5, panelRows: 3 }), section({ id: 2, panelCols: 8, panelRows: 2 })];
    const { sectionRanges } = production.combinedGrid(computeWallLayout(sections), computeAtlas(sections));
    assert.deepEqual(sectionRanges.map((r) => r.indexCount / 3), [30, 30, 32]);
    assert.deepEqual([0, 29, 30, 59, 60, 91].map((f) => sectionRangeForFace(sectionRanges, f).sectionIndex), [0, 0, 1, 1, 2, 2]);
    assert.equal(sectionRangeForFace(sectionRanges, 92), null);
    assert.equal(sectionRangeForFace([], 0), null);
    assert.equal(sectionRangeForFace(sectionRanges, 31), sectionRanges[1], 'the range object itself');
  });
});
