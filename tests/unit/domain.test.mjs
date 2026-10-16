// Unit tests for the pure domain model (js/domain/*): every rule table and every ported expression is compared with
// an inline verbatim copy of the legacy code (index.html@cd3fd3f) using Object.is, over a fixed input grid and over
// seeded fuzzed sections that include string fields, fractions, zeros, negatives and NaN.
// Run: node --test tests/unit/domain.test.mjs   (zero dependencies; Node 22.7+, because js/ has no package.json "type" and Node must detect ESM syntax)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { MM_TO_M, SECTION_FIELDS, WallSection } from '../../js/domain/WallSection.js';
import { PivotMode, WallPivot, Wall } from '../../js/domain/Wall.js';
import { ContentMode, DisplaySettings, PanelIdStyle, Project } from '../../js/domain/Project.js';
import { LogoLibrary } from '../../js/domain/LogoLibrary.js';
import { FILMBACK_PRESETS, CineCamera } from '../../js/domain/CineCamera.js';
import { Prop, PersonProp, CarProp } from '../../js/domain/Prop.js';

/** The raw input grid required by the work package. */
const INPUTS = ['', '0', '-0', '1', '2.5', '50', '51', '-3', 'abc', '1e3', ' 7 ', '0x10', 'NaN', 'Infinity', '-181', '361'];
/** Extra raw inputs that sit on or near every clamp of every rule. */
const EXTRA_INPUTS = ['0.5', '0.09', '0.1', '1.5', '7.9', '8', '20.5', '32', '-90.5', '90.01', '100.5', '179.9', '180',
  '359.99', '400.2', '5000.1', '799.9', '800.01', '1e-7', '-0.000001', '3abc', '.5', '-Infinity', '  '];
const ALL_INPUTS = [...INPUTS, ...EXTRA_INPUTS];

/** Asserts Object.is equality with a readable message. */
function same(actual, expected, label) {
  assert.ok(Object.is(actual, expected), `${label}: got ${String(actual)}, expected ${String(expected)}`);
}

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

const NUMERIC_POOL = [0, -0, 1, 2, 3, 5, 7, 10, 2.5, 0.3, 7.25, -1, -2.5, 50, 64, 333.3, 500, 1000, 4096,
  '10', '3', '2.5', '0', '', ' 4 ', 'abc', NaN, -15, 12.75];
const ANGLE_POOL = [0, -0, 1, 2.5, -2.5, 10, -10, 45, 90, -180, 0.1, '5', '-3', '', 'x', NaN, 7.3];

/** A fuzzed section with possibly odd raw values (legacy accepted all of these through import). */
function fuzzSection(rand, i) {
  const pick = (pool) => pool[Math.floor(rand() * pool.length)];
  return new WallSection({
    id: rand() < 0.1 ? String(i) : i,
    name: rand() < 0.2 ? '' : `S${i}`,
    panelCols: pick(NUMERIC_POOL),
    panelRows: pick(NUMERIC_POOL),
    panelWidth: pick(NUMERIC_POOL),
    panelHeight: pick(NUMERIC_POOL),
    ledX: pick(NUMERIC_POOL),
    ledY: pick(NUMERIC_POOL),
    curveIntensity: pick(ANGLE_POOL),
    angleOffset: pick(ANGLE_POOL),
    color: '#00f0ff',
  });
}

function fuzzWalls(seed, count = 300) {
  const rand = rng(seed);
  const walls = [];
  for (let w = 0; w < count; w++) {
    const n = Math.floor(rand() * 6);   // includes empty walls
    walls.push(Array.from({ length: n }, (_, i) => fuzzSection(rand, i)));
  }
  return walls;
}

// ---------------------------------------------------------------------------------------------------------------
// Verbatim legacy copies (index.html@cd3fd3f). Only the surrounding function wrappers are new.
// ---------------------------------------------------------------------------------------------------------------

/** 4028-4036 (the number-input change handler, minus the DOM). */
function legacySectionField(field, raw) {
  let value = parseFloat(raw);
  if (field === 'panelCols') value = Math.max(1, Math.min(50, value || 1));
  else if (field === 'panelRows') value = Math.max(1, Math.min(20, value || 1));
  else if (field === 'panelWidth') value = Math.max(50, Math.min(5000, value || 500));
  else if (field === 'panelHeight') value = Math.max(50, value || 500);
  else if (field === 'ledX' || field === 'ledY') value = Math.max(8, value || 32);
  else if (field === 'curveIntensity') value = value || 0;
  else if (field === 'angleOffset') value = Math.max(-180, Math.min(180, value || 0));
  return value;
}

/** 4201, 4206, 4220 (parseInt without radix). */
const LEGACY_PANEL_ID_RULES = {
  borderThickness: (v) => Math.max(1, Math.min(32, parseInt(v) || 8)),
  fontSize: (v) => Math.max(0, Math.min(200, parseInt(v) || 0)),
  sectionLabelFontSize: (v) => Math.max(0, Math.min(400, parseInt(v) || 0)),
};

/** 2298. */
const legacyScalePercent = (v) => Math.max(5, Math.min(100, parseInt(v) || 30));

/** 4267-4314: [expression, writes this.value back]. */
const LEGACY_CAMERA_RULES = {
  filmbackWidth: [(v) => Math.max(1, Math.min(100, parseFloat(v) || 36)), true],
  filmbackHeight: [(v) => Math.max(1, Math.min(100, parseFloat(v) || 24)), true],
  focalLength: [(v) => Math.max(8, Math.min(800, parseFloat(v) || 35)), true],
  posX: [(v) => parseFloat(v) || 0, false],
  posY: [(v) => Math.max(0, parseFloat(v) || 1.5), true],
  posZ: [(v) => Math.max(0.1, parseFloat(v) || 5), true],
  rotX: [(v) => Math.max(-90, Math.min(90, parseFloat(v) || 0)), true],
  rotY: [(v) => Math.max(-180, Math.min(360, parseFloat(v) || 0)), true],
  rotZ: [(v) => Math.max(-180, Math.min(180, parseFloat(v) || 0)), true],
};

/** 4345-4358 (person) == 4376-4389 (car). */
const LEGACY_PROP_RULES = {
  posX: [(v) => parseFloat(v) || 0, false],
  posZ: [(v) => parseFloat(v) || 0, false],
  rotY: [(v) => Math.max(-180, Math.min(180, parseFloat(v) || 0)), true],
  scale: [(v) => Math.max(0.5, Math.min(2, parseFloat(v) || 1)), true],
};

/** updateStats 2308-2313, returning what 2314-2317 display. */
function legacyUpdateStats(wallSections) {
  let totalPixels = 0, totalPanels = 0, totalArc = 0;
  wallSections.forEach(s => {
    totalPixels += s.panelCols * s.panelRows * s.ledX * s.ledY;
    totalPanels += s.panelCols * s.panelRows;
    totalArc += s.panelCols * Math.abs(s.curveIntensity);
  });
  return { totalPixels, totalPanels, totalSections: wallSections.length, totalArc };
}

/** exportJSON totals 4958-4962. */
function legacyJsonTotals(wallSections) {
  return {
    sections: wallSections.length,
    total_panels: wallSections.reduce((sum, s) => sum + s.panelCols * s.panelRows, 0),
    total_pixels: wallSections.reduce((sum, s) => sum + s.panelCols * s.panelRows * s.ledX * s.ledY, 0),
  };
}

/** The flat-bounds loop 2488-2493 (== 2552-2557, 2591 + 2598-2603, 3757-3762). */
function legacyFlatBounds(wallSections) {
  const scale = 0.001;
  let totalWallWidth = 0, maxWallHeight = 0;
  wallSections.forEach(s => {
    totalWallWidth += s.panelCols * s.panelWidth * scale;
    maxWallHeight = Math.max(maxWallHeight, s.panelRows * s.panelHeight * scale);
  });
  return { totalWidth: totalWallWidth, maxHeight: maxWallHeight };
}

/** addSection 4088-4103 (the push included), on a plain legacy state object. */
function legacyAddSection(state, sectionColors) {
  const wallSections = state.wallSections;
  const last = wallSections[wallSections.length - 1];
  const newColorIndex = wallSections.length % sectionColors.length;
  const newSection = {
    id: state.nextSectionId++,
    name: `Wall ${wallSections.length + 1}`,
    panelCols: last.panelCols,
    panelRows: last.panelRows,
    panelWidth: last.panelWidth,
    panelHeight: last.panelHeight,
    ledX: last.ledX,
    ledY: last.ledY,
    curveIntensity: last.curveIntensity,
    angleOffset: 0,
    color: sectionColors[newColorIndex],
  };
  wallSections.push(newSection);
  return newSection;
}

/** renderWallSections derived values 3898, 3904-3908, 3958 and the patch values 4043-4054. */
function legacyCardValues(section) {
  const curveType = section.curveIntensity === 0 ? 'Flat' : (section.curveIntensity > 0 ? 'Concave' : 'Convex');
  const canvasWidth = section.panelCols * section.ledX;
  const canvasHeight = section.panelRows * section.ledY;
  const summary = `${section.panelCols}×${section.panelRows} • ${canvasWidth}×${canvasHeight}px • ${curveType}`;
  const exceeds4K = (canvasWidth > 3840 || canvasHeight > 2160) && (canvasWidth > 2160 || canvasHeight > 3840);
  const hint3958 = `${curveType}${section.curveIntensity !== 0 ? ` (${section.curveIntensity > 0 ? '+' : ''}${section.curveIntensity}°)` : ''}`;
  const value = section.curveIntensity;
  const ct = value === 0 ? 'Flat' : (value > 0 ? 'Concave' : 'Convex');
  const hint4044 = `${ct}${value !== 0 ? ` (${value > 0 ? '+' : ''}${value}°)` : ''}`;
  return { curveType, canvasWidth, canvasHeight, summary, exceeds4K, hint3958, hint4044 };
}

/** calculateFrustumIntersection 2473-2531 without the DOM; the status text is returned instead of written. */
function legacyCoverage(cameraSettings, wallSections) {
  const hFov = 2 * Math.atan(cameraSettings.filmbackWidth / (2 * cameraSettings.focalLength));
  const vFov = 2 * Math.atan(cameraSettings.filmbackHeight / (2 * cameraSettings.focalLength));
  const distToWall = cameraSettings.posZ;
  const frameWidth = 2 * Math.tan(hFov / 2) * distToWall;
  const frameHeight = 2 * Math.tan(vFov / 2) * distToWall;
  const scale = 0.001;
  let totalWallWidth = 0, maxWallHeight = 0;
  wallSections.forEach(s => {
    totalWallWidth += s.panelCols * s.panelWidth * scale;
    maxWallHeight = Math.max(maxWallHeight, s.panelRows * s.panelHeight * scale);
  });
  const fitsWidth = frameWidth <= totalWallWidth;
  const fitsHeight = frameHeight <= maxWallHeight;
  const camCenterX = cameraSettings.posX;
  const camCenterY = cameraSettings.posY;
  const frameLeft = camCenterX - frameWidth / 2;
  const frameRight = camCenterX + frameWidth / 2;
  const frameBottom = camCenterY - frameHeight / 2;
  const frameTop = camCenterY + frameHeight / 2;
  const withinBounds = frameLeft >= 0 && frameRight <= totalWallWidth &&
                      frameBottom >= 0 && frameTop <= maxWallHeight;
  let text;
  if (withinBounds) text = 'Within bounds';
  else if (fitsWidth && fitsHeight) text = 'Off-center';
  else text = 'Exceeds wall';
  const maxSafeDistWidth = totalWallWidth / (2 * Math.tan(hFov / 2));
  const maxSafeDistHeight = maxWallHeight / (2 * Math.tan(vFov / 2));
  const safeDistance = Math.min(maxSafeDistWidth, maxSafeDistHeight);
  return { frameWidth, frameHeight, text, safeDistance };
}
const STATUS_OF_TEXT = { 'Within bounds': 'within', 'Off-center': 'offCenter', 'Exceeds wall': 'exceeds' };

/** createSafeDistanceMesh 2591-2612 (D only). */
function legacySafeDistance(cameraSettings, wallSections) {
  const scale = 0.001;
  const hFov = 2 * Math.atan(cameraSettings.filmbackWidth / (2 * cameraSettings.focalLength));
  const vFov = 2 * Math.atan(cameraSettings.filmbackHeight / (2 * cameraSettings.focalLength));
  let totalWallWidth = 0;
  let maxWallHeight = 0;
  wallSections.forEach(s => {
    totalWallWidth += s.panelCols * s.panelWidth * scale;
    maxWallHeight = Math.max(maxWallHeight, s.panelRows * s.panelHeight * scale);
  });
  const maxSafeDistW = totalWallWidth / (2 * Math.tan(hFov / 2));
  const maxSafeDistH = maxWallHeight / (2 * Math.tan(vFov / 2));
  return Math.min(maxSafeDistW, maxSafeDistH);
}

/** handlePilotKeyboard 3578-3611 with the key lookups replaced by booleans. */
function legacyPilotFly(cameraSettings, keys, forward, right, pilotMoveSpeed) {
  let moved = false;
  if (keys.forward) {
    cameraSettings.posX += forward.x * pilotMoveSpeed;
    cameraSettings.posY += forward.y * pilotMoveSpeed;
    cameraSettings.posZ += forward.z * pilotMoveSpeed;
    moved = true;
  }
  if (keys.back) {
    cameraSettings.posX -= forward.x * pilotMoveSpeed;
    cameraSettings.posY -= forward.y * pilotMoveSpeed;
    cameraSettings.posZ -= forward.z * pilotMoveSpeed;
    moved = true;
  }
  if (keys.left) {
    cameraSettings.posX -= right.x * pilotMoveSpeed;
    cameraSettings.posZ -= right.z * pilotMoveSpeed;
    moved = true;
  }
  if (keys.right) {
    cameraSettings.posX += right.x * pilotMoveSpeed;
    cameraSettings.posZ += right.z * pilotMoveSpeed;
    moved = true;
  }
  if (keys.down) {
    cameraSettings.posY -= pilotMoveSpeed;
    moved = true;
  }
  if (keys.up) {
    cameraSettings.posY += pilotMoveSpeed;
    moved = true;
  }
  cameraSettings.posY = Math.max(0.1, cameraSettings.posY);
  return moved;
}

const POSE_KEYS = ['posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ'];
const plainPose = (cam) => Object.fromEntries(POSE_KEYS.map((k) => [k, cam[k]]));

function fuzzCamera(rand) {
  const cam = new CineCamera();
  const span = (lo, hi) => lo + (hi - lo) * rand();
  cam.filmbackWidth = [36, 24.89, 17.3, span(1, 100)][Math.floor(rand() * 4)];
  cam.filmbackHeight = [24, 18.66, 13, span(1, 100)][Math.floor(rand() * 4)];
  cam.focalLength = [35, 8, 800, 50, span(8, 800)][Math.floor(rand() * 5)];
  cam.posX = span(-5, 25);
  cam.posY = span(0, 10);
  cam.posZ = span(0.1, 40);
  cam.rotX = span(-90, 90);
  cam.rotY = span(-180, 360);
  cam.rotZ = span(-180, 180);
  return cam;
}

// ---------------------------------------------------------------------------------------------------------------
// WallSection
// ---------------------------------------------------------------------------------------------------------------

describe('WallSection', () => {
  test('MM_TO_M and SECTION_FIELDS', () => {
    same(MM_TO_M, 0.001, 'MM_TO_M');
    assert.deepEqual(SECTION_FIELDS, ['id', 'name', 'panelCols', 'panelRows', 'panelWidth', 'panelHeight',
      'ledX', 'ledY', 'curveIntensity', 'angleOffset', 'color']);
    assert.ok(Object.isFrozen(SECTION_FIELDS));
  });

  test('constructor copies exactly SECTION_FIELDS, in order, without coercion (B-L8)', () => {
    const fields = {
      color: '#123456', extra: 'ignored', id: 'abc', name: 42, panelCols: '10', panelRows: 2.5, panelWidth: NaN,
      panelHeight: '', ledX: null, ledY: undefined, curveIntensity: '5', angleOffset: -0,
    };
    const s = new WallSection(fields);
    assert.deepEqual(Object.keys(s), [...SECTION_FIELDS]);
    for (const key of SECTION_FIELDS) same(s[key], fields[key], key);
    assert.equal('extra' in s, false);
  });

  test('createDefault equals the legacy bootstrap section (1395-1407)', () => {
    const s = WallSection.createDefault();
    assert.ok(s instanceof WallSection);
    assert.deepEqual({ ...s }, {
      id: 0, name: 'Wall 1', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500,
      ledX: 32, ledY: 32, curveIntensity: 0, angleOffset: 0, color: '#00f0ff',
    });
    assert.notEqual(WallSection.createDefault(), s, 'a fresh object per call');
  });

  test('defaultName', () => {
    assert.equal(WallSection.defaultName(0), 'Wall 1');
    assert.equal(WallSection.defaultName(9), 'Wall 10');
  });

  test('FIELD_RULES / parseField / setField equal the legacy handler over the input grid (Object.is)', () => {
    assert.deepEqual(Object.keys(WallSection.FIELD_RULES),
      ['panelCols', 'panelRows', 'panelWidth', 'panelHeight', 'ledX', 'ledY', 'curveIntensity', 'angleOffset']);
    assert.ok(Object.isFrozen(WallSection.FIELD_RULES));
    const fields = [...Object.keys(WallSection.FIELD_RULES), 'color', 'name', 'id', 'toString', 'constructor',
      'hasOwnProperty', 'unknown'];
    for (const field of fields) {
      for (const raw of ALL_INPUTS) {
        const expected = legacySectionField(field, raw);
        same(WallSection.parseField(field, raw), expected, `parseField(${field}, ${JSON.stringify(raw)})`);
        if (Object.hasOwn(WallSection.FIELD_RULES, field)) {
          same(WallSection.FIELD_RULES[field](parseFloat(raw)), expected, `FIELD_RULES.${field}(${JSON.stringify(raw)})`);
        }
        const s = WallSection.createDefault();
        same(s.setField(field, raw), expected, `setField(${field}) return`);
        same(s[field], expected, `setField(${field}) stored`);
      }
    }
  });

  test('B-L15: fractional counts are stored unrounded', () => {
    const s = WallSection.createDefault();
    assert.equal(s.setField('panelCols', '2.5'), 2.5);
    assert.equal(s.setField('ledX', '9.75'), 9.75);
  });

  test('setColor, rename and ensureName', () => {
    const s = WallSection.createDefault();
    s.setColor('#ff00aa');
    assert.equal(s.color, '#ff00aa');
    assert.equal(s.rename('Left', 3), 'Left');
    assert.equal(s.name, 'Left');
    assert.equal(s.rename('', 3), 'Wall 4', 'an empty input falls back to the default name');
    s.name = '';
    s.ensureName(1);
    assert.equal(s.name, 'Wall 2');
    s.ensureName(7);
    assert.equal(s.name, 'Wall 2', 'ensureName never overwrites a truthy name');
    s.name = 0;
    s.ensureName(0);
    assert.equal(s.name, 'Wall 1');
  });

  test('derived card values equal the legacy expressions over fuzzed sections', () => {
    const rand = rng(17);
    const sections = Array.from({ length: 2000 }, (_, i) => fuzzSection(rand, i));
    sections.push(new WallSection({ ...WallSection.createDefault(), curveIntensity: -0 }));
    sections.push(new WallSection({ ...WallSection.createDefault(), curveIntensity: '0' }));
    for (const s of sections) {
      const legacy = legacyCardValues(s);
      same(s.curveType, legacy.curveType, 'curveType');
      same(s.canvasWidth, legacy.canvasWidth, 'canvasWidth');
      same(s.canvasHeight, legacy.canvasHeight, 'canvasHeight');
      same(s.summary, legacy.summary, 'summary');
      same(s.exceeds4K, legacy.exceeds4K, 'exceeds4K');
      same(s.curveHint, legacy.hint3958, 'curveHint (3958)');
      same(s.curveHint, legacy.hint4044, 'curveHint (4044)');
    }
  });

  test('derived card values: exact characters', () => {
    const s = WallSection.createDefault();
    assert.equal(s.summary, '5×3 • 160×96px • Flat');
    assert.equal(s.curveHint, 'Flat');
    s.curveIntensity = 5;
    assert.equal(s.curveHint, 'Concave (+5°)');
    s.curveIntensity = -2.5;
    assert.equal(s.curveHint, 'Convex (-2.5°)');
    assert.equal(s.summary, '5×3 • 160×96px • Convex');
  });

  test('exceeds4K (B-L17: per section only)', () => {
    const at = (w, h) => new WallSection({ ...WallSection.createDefault(), panelCols: w, ledX: 1, panelRows: h, ledY: 1 }).exceeds4K;
    assert.equal(at(3840, 2160), false);
    assert.equal(at(2160, 3840), false);
    assert.equal(at(3841, 2160), true);
    assert.equal(at(2160, 3841), true);
    assert.equal(at(3841, 100), true);
    assert.equal(at(2161, 2161), true);
    assert.equal(at(2000, 3000), false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Wall
// ---------------------------------------------------------------------------------------------------------------

describe('Wall', () => {
  test('defaults: one default section, nextSectionId 1, identity pivot', () => {
    const wall = new Wall();
    assert.equal(wall.count, 1);
    assert.deepEqual({ ...wall.sections[0] }, { ...WallSection.createDefault() });
    assert.equal(wall.nextSectionId, 1);
    assert.ok(wall.pivot instanceof WallPivot);
    assert.equal(wall.pivot.isIdentity, true);
  });

  test('PivotMode and WallPivot', () => {
    assert.deepEqual({ ...PivotMode }, { BOTTOM_LEFT: 'bottom-left', MESH_CENTER: 'mesh-center', WALL_CENTER: 'wall-center' });
    assert.ok(Object.isFrozen(PivotMode));
    const pivot = new WallPivot();
    assert.equal(pivot.mode, 'bottom-left');
    assert.deepEqual(pivot.offset, { x: 0, y: 0, z: 0 });
    pivot.offset.y = 0.5;
    assert.equal(pivot.isIdentity, false);
    pivot.offset.y = 0;
    pivot.mode = PivotMode.WALL_CENTER;
    assert.equal(pivot.isIdentity, false);
  });

  test('totals equals the legacy updateStats loop and the JSON reduce expressions (fuzzed, Object.is)', () => {
    for (const sections of fuzzWalls(1)) {
      const wall = new Wall({ sections });
      const totals = wall.totals();
      const legacy = legacyUpdateStats(sections);
      const json = legacyJsonTotals(sections);
      assert.deepEqual(Object.keys(totals), ['totalPixels', 'totalPanels', 'totalSections', 'totalArc']);
      same(totals.totalPixels, legacy.totalPixels, 'totalPixels');
      same(totals.totalPanels, legacy.totalPanels, 'totalPanels');
      same(totals.totalSections, legacy.totalSections, 'totalSections');
      same(totals.totalArc, legacy.totalArc, 'totalArc');
      same(totals.totalPixels, json.total_pixels, 'total_pixels (JSON)');
      same(totals.totalPanels, json.total_panels, 'total_panels (JSON)');
      same(totals.totalSections, json.sections, 'sections (JSON)');
    }
  });

  test('totals of the default wall', () => {
    assert.deepEqual(new Wall().totals(), { totalPixels: 15360, totalPanels: 15, totalSections: 1, totalArc: 0 });
  });

  test('flatBounds equals the legacy loop (fuzzed, Object.is) and is computed live', () => {
    for (const sections of fuzzWalls(2)) {
      const bounds = new Wall({ sections }).flatBounds();
      const legacy = legacyFlatBounds(sections);
      assert.deepEqual(Object.keys(bounds), ['totalWidth', 'maxHeight']);
      same(bounds.totalWidth, legacy.totalWidth, 'totalWidth');
      same(bounds.maxHeight, legacy.maxHeight, 'maxHeight');
    }
    const wall = new Wall();
    assert.deepEqual(wall.flatBounds(), { totalWidth: 2.5, maxHeight: 1.5 });
    wall.sections[0].panelCols = 10;
    assert.equal(wall.flatBounds().totalWidth, 5);
    assert.deepEqual(new Wall({ sections: [] }).flatBounds(), { totalWidth: 0, maxHeight: 0 });
  });

  test('appendLikeLast equals the legacy addSection literal (fuzzed, Object.is) and pushes onto the live array', () => {
    const palette = ['#00f0ff', '#ff00aa', '#00ff66', '#ff6b35', '#ffdd00', '#aa66ff', '#66ffaa', '#ff6666'];
    const rand = rng(3);
    for (const sections of fuzzWalls(4, 200)) {
      if (sections.length === 0) continue;
      const nextId = [1, 7, '5', NaN, -Infinity, 2.5][Math.floor(rand() * 6)];
      const wall = new Wall({ sections: sections.slice(), nextSectionId: nextId });
      const live = wall.sections;
      const state = { wallSections: sections.map((s) => ({ ...s })), nextSectionId: nextId };
      for (let k = 0; k < 3; k++) {
        const added = wall.appendLikeLast(palette);
        const legacy = legacyAddSection(state, palette);
        assert.ok(added instanceof WallSection);
        assert.deepEqual(Object.keys(added), Object.keys(legacy));
        for (const key of SECTION_FIELDS) same(added[key], legacy[key], `added.${key}`);
        same(wall.nextSectionId, state.nextSectionId, 'nextSectionId');
        assert.equal(wall.sections, live, 'push keeps the live array');
        assert.equal(wall.sections[wall.count - 1], added);
        assert.equal(wall.count, state.wallSections.length);
      }
    }
  });

  test('appendLikeLast on the default wall', () => {
    const wall = new Wall();
    const added = wall.appendLikeLast(['#a', '#b', '#c']);
    assert.deepEqual({ ...added }, {
      id: 1, name: 'Wall 2', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500,
      ledX: 32, ledY: 32, curveIntensity: 0, angleOffset: 0, color: '#b',
    });
    assert.equal(wall.nextSectionId, 2);
  });

  test('appendLikeLast on an empty wall after replaceAll([]): TypeError, nextSectionId stays -Infinity', () => {
    const wall = new Wall();
    wall.replaceAll([]);
    same(wall.nextSectionId, -Infinity, 'after the empty import');
    assert.throws(() => wall.appendLikeLast(['#00f0ff']), TypeError);
    same(wall.nextSectionId, -Infinity, '-Infinity++ is -Infinity');
    assert.equal(wall.count, 0);
  });

  test('appendLikeLast on new Wall({ sections: [] }): TypeError after the allocator moved from 1 to 2', () => {
    const wall = new Wall({ sections: [] });
    assert.equal(wall.nextSectionId, 1);
    assert.throws(() => wall.appendLikeLast(['#00f0ff']),
      (err) => err instanceof TypeError && /panelCols/.test(err.message));
    assert.equal(wall.nextSectionId, 2);
    assert.equal(wall.count, 0);
  });

  test("replaceAll with ['abc'] ids gives NaN, and appendLikeLast then hands out NaN ids", () => {
    const wall = new Wall();
    const imported = [new WallSection({ ...WallSection.createDefault(), id: 'abc' })];
    wall.replaceAll(imported);
    assert.equal(wall.sections, imported, 'the given array is stored, not copied');
    same(wall.nextSectionId, NaN, 'Math.max("abc") + 1');
    const added = wall.appendLikeLast(['#00f0ff', '#ff00aa']);
    same(added.id, NaN, 'new id');
    same(wall.nextSectionId, NaN, 'NaN++');
    assert.equal(added.color, '#ff00aa');
  });

  test('replaceAll follows legacy coercion of ids (Math.max over the spread)', () => {
    const make = (id) => new WallSection({ ...WallSection.createDefault(), id });
    const wall = new Wall();
    wall.replaceAll([make('5'), make(2)]);
    same(wall.nextSectionId, 6, 'numeric string');
    wall.replaceAll([make(0), make(1), make(2)]);
    same(wall.nextSectionId, 3, 'plain ids');
    wall.replaceAll([make(1), make(undefined)]);
    same(wall.nextSectionId, NaN, 'undefined id');
    wall.replaceAll([make('3'), make('12')]);
    same(wall.nextSectionId, 13, 'numeric comparison, not string order');
    const legacy = (secs) => Math.max(...secs.map(s => s.id)) + 1;
    for (const sections of fuzzWalls(5, 100)) {
      wall.replaceAll(sections);
      same(wall.nextSectionId, legacy(sections), 'fuzzed');
    }
  });

  test('removeById removes every duplicate (strict equality) and replaces the array', () => {
    const make = (id) => new WallSection({ ...WallSection.createDefault(), id });
    const wall = new Wall({ sections: [make(1), make(1), make(2), make(3)] });
    const before = wall.sections;
    wall.removeById(1);
    assert.deepEqual(wall.sections.map((s) => s.id), [2, 3]);
    assert.notEqual(wall.sections, before, 'a new array, like legacy filter');
    assert.equal(before.length, 4, 'the old array is untouched');
    wall.removeById('2');
    assert.deepEqual(wall.sections.map((s) => s.id), [2, 3], 'strict: "2" does not remove 2');
    const nan = new Wall({ sections: [make(NaN), make(4)] });
    nan.removeById(NaN);
    assert.equal(nan.count, 2, 'NaN !== NaN, so NaN ids are never removed');
    wall.removeById(99);
    assert.deepEqual(wall.sections.map((s) => s.id), [2, 3]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Project, DisplaySettings, PanelIdStyle
// ---------------------------------------------------------------------------------------------------------------

describe('DisplaySettings', () => {
  test('defaults (legacy globals 1279-1294)', () => {
    const d = new DisplaySettings();
    assert.deepEqual({ ...d }, {
      wireframe: false, showFrame: false, content: 'color', ledLayout: 'single-dot', showGrid: true, showSafeDistance: false,
    });
    assert.equal(d.ledSimEnabled, false);
    assert.equal(d.panelIdsEnabled, false);
    assert.deepEqual({ ...ContentMode }, { COLOR: 'color', LED_SIM: 'ledSim', PANEL_IDS: 'panelIds' });
    assert.ok(Object.isFrozen(ContentMode));
  });

  test('LED sim and panel IDs exclude each other; the return value says whether the other was forced off', () => {
    const d = new DisplaySettings();
    assert.equal(d.setLedSim(true), false);
    assert.equal(d.content, 'ledSim');
    assert.equal(d.setPanelIds(true), true, 'LED sim forced off');
    assert.equal(d.ledSimEnabled, false);
    assert.equal(d.panelIdsEnabled, true);
    assert.equal(d.setLedSim(true), true, 'panel IDs forced off');
    assert.equal(d.content, 'ledSim');
    assert.equal(d.setPanelIds(false), false, 'turning panel IDs off while LED sim is on changes nothing');
    assert.equal(d.content, 'ledSim');
    assert.equal(d.setLedSim(false), false);
    assert.equal(d.content, 'color');
    assert.equal(d.setPanelIds(true), false);
    assert.equal(d.setPanelIds(false), false);
    assert.equal(d.content, 'color');
  });

  test('matches the legacy two-boolean handlers (4167-4199) over random toggle sequences', () => {
    const rand = rng(11);
    for (let run = 0; run < 200; run++) {
      // Legacy state: two booleans plus the two toggle classes.
      let ledSimEnabled = false, panelIdsEnabled = false, ledClass = false, panelClass = false;
      // New state: DisplaySettings plus the same two classes (mirrored by the panel on forcedOff).
      const d = new DisplaySettings();
      let newLedClass = false, newPanelClass = false;
      for (let step = 0; step < 12; step++) {
        if (rand() < 0.5) {
          ledClass = !ledClass;
          ledSimEnabled = ledClass;
          if (ledSimEnabled && panelIdsEnabled) { panelIdsEnabled = false; panelClass = false; }
          newLedClass = !newLedClass;
          if (d.setLedSim(newLedClass)) newPanelClass = false;
        } else {
          panelClass = !panelClass;
          panelIdsEnabled = panelClass;
          if (panelIdsEnabled && ledSimEnabled) { ledSimEnabled = false; ledClass = false; }
          newPanelClass = !newPanelClass;
          if (d.setPanelIds(newPanelClass)) newLedClass = false;
        }
        assert.equal(d.ledSimEnabled, ledSimEnabled);
        assert.equal(d.panelIdsEnabled, panelIdsEnabled);
        assert.equal(newLedClass, ledClass);
        assert.equal(newPanelClass, panelClass);
      }
    }
  });
});

describe('PanelIdStyle', () => {
  test('defaults (1295-1296, 1387-1390)', () => {
    assert.deepEqual({ ...new PanelIdStyle() }, {
      borderThickness: 8, fontSize: 0, fontColor: '#ffffff', sectionLabelEnabled: true, sectionLabelFontSize: 0,
      sectionLabelColor: '#888888',
    });
  });

  test('RULES and set() equal the legacy parseInt expressions over the input grid (Object.is)', () => {
    assert.deepEqual(Object.keys(PanelIdStyle.RULES), Object.keys(LEGACY_PANEL_ID_RULES));
    assert.ok(Object.isFrozen(PanelIdStyle.RULES));
    for (const [key, legacy] of Object.entries(LEGACY_PANEL_ID_RULES)) {
      for (const raw of ALL_INPUTS) {
        const expected = legacy(raw);
        same(PanelIdStyle.RULES[key](raw), expected, `RULES.${key}(${JSON.stringify(raw)})`);
        const style = new PanelIdStyle();
        same(style.set(key, raw), expected, `set(${key}) return`);
        same(style[key], expected, `set(${key}) stored`);
      }
    }
  });

  test('non-numeric keys are stored as given', () => {
    const style = new PanelIdStyle();
    assert.equal(style.set('fontColor', '#ff0000'), '#ff0000');
    assert.equal(style.set('sectionLabelColor', 'not-a-colour'), 'not-a-colour');
    assert.equal(style.set('sectionLabelEnabled', false), false);
    assert.equal(style.fontColor, '#ff0000');
    assert.equal(style.sectionLabelEnabled, false);
  });

  test('inherited names are not rule keys (own-key lookup)', () => {
    for (const key of ['toString', 'constructor', 'hasOwnProperty']) {
      const style = new PanelIdStyle();
      assert.equal(style.set(key, '12'), '12', `set(${key}) stores the raw value`);
      assert.equal(style[key], '12');
    }
  });
});

describe('Project', () => {
  test('createDefault builds the legacy start-up aggregate', () => {
    const p = Project.createDefault();
    assert.ok(p.wall instanceof Wall);
    assert.equal(p.meshMode, 'combined');
    assert.ok(p.display instanceof DisplaySettings);
    assert.ok(p.panelIdStyle instanceof PanelIdStyle);
    assert.ok(p.logos instanceof LogoLibrary);
    assert.ok(p.camera instanceof CineCamera);
    assert.ok(p.person instanceof PersonProp);
    assert.ok(p.car instanceof CarProp);
    assert.notEqual(Project.createDefault().wall, p.wall, 'fresh parts per project');
  });

  test('constructor stores the given parts and meshMode (imported strings are kept, B-L8)', () => {
    const wall = new Wall();
    const p = new Project({ wall, meshMode: 'weird', display: new DisplaySettings() });
    assert.equal(p.wall, wall);
    assert.equal(p.meshMode, 'weird');
    assert.equal(new Project({ wall }).meshMode, 'combined');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// LogoLibrary
// ---------------------------------------------------------------------------------------------------------------

describe('LogoLibrary', () => {
  test('parseScalePercent equals the legacy expression over the input grid (Object.is)', () => {
    for (const raw of ALL_INPUTS) {
      same(LogoLibrary.parseScalePercent(raw), legacyScalePercent(raw), `parseScalePercent(${JSON.stringify(raw)})`);
    }
    assert.equal(LogoLibrary.parseScalePercent('150'), 100);
    assert.equal(LogoLibrary.parseScalePercent('abc'), 30);
    assert.equal(LogoLibrary.parseScalePercent('25'), 25);
  });

  test('ensure creates a fresh { position: "center", scale: 0.3 } per key and returns the existing entry after', () => {
    const logos = new LogoLibrary();
    const a = logos.ensure(1);
    assert.deepEqual(a, { position: 'center', scale: 0.3 });
    const b = logos.ensure(2);
    assert.notEqual(a, b);
    assert.equal(logos.ensure(1), a);
    assert.equal(logos.get(1), a);
  });

  test('setImage / hasImage / get / remove (2196-2197, 2266-2269, 2282)', () => {
    const logos = new LogoLibrary();
    const img = { width: 16 };
    same(logos.get(0), undefined, 'get of a missing key');
    same(logos.hasImage(0), undefined, 'hasImage of a missing key is the falsy && operand');
    logos.setImage(0, img);
    assert.equal(logos.hasImage(0), img, 'hasImage returns the image (verbatim && expression)');
    assert.deepEqual(logos.get(0), { position: 'center', scale: 0.3, image: img });
    logos.ensure(5);
    same(logos.hasImage(5), undefined, 'entry without image');
    logos.remove(0);
    same(logos.get(0), undefined, 'removed');
    assert.doesNotThrow(() => logos.remove(42));
  });

  test('setPosition / setScale act only on existing entries and report it', () => {
    const logos = new LogoLibrary();
    assert.equal(logos.setPosition(3, 'top-left'), false);
    assert.equal(logos.setScale(3, 0.5), false);
    same(logos.get(3), undefined, 'no entry was created');
    logos.ensure(3);
    assert.equal(logos.setPosition(3, 'top-left'), true);
    assert.equal(logos.setScale(3, 0.5), true);
    assert.deepEqual(logos.get(3), { position: 'top-left', scale: 0.5 });
  });

  test('keys follow plain-object property-key coercion (B-L8)', () => {
    const logos = new LogoLibrary();
    const img = {};
    logos.setImage(parseInt('7'), img);          // UI handlers pass parseInt(dataset.sectionId)
    assert.equal(logos.hasImage(7), img);         // the renderer passes section.id
    assert.equal(logos.hasImage('7'), img);       // a numeric-string id matches too ('7' === String(7))
    logos.setImage(parseInt('abc'), img);         // a string id 'abc' becomes NaN in the UI handlers
    same(logos.get('abc'), undefined, "'abc' never matches the NaN key");
    assert.equal(logos.get(NaN), logos.get('NaN'));
    assert.ok(logos.get(NaN));
    logos.remove('7');
    same(logos.get(7), undefined, 'remove uses the same coercion');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// CineCamera
// ---------------------------------------------------------------------------------------------------------------

describe('CineCamera', () => {
  test('defaults equal legacy cameraSettings (1320-1331) and cameraPreviewEnabled (1299)', () => {
    assert.deepEqual({ ...new CineCamera() }, {
      enabled: false, filmback: 'full-frame', filmbackWidth: 36, filmbackHeight: 24, focalLength: 35,
      posX: 0, posY: 1.5, posZ: 5, rotX: 0, rotY: 0, rotZ: 0,
    });
  });

  test('FILMBACK_PRESETS is the verbatim, deep-frozen legacy table (1306-1318)', () => {
    assert.deepEqual(FILMBACK_PRESETS, {
      'full-frame': { name: 'Full Frame (36×24mm)', width: 36, height: 24 },
      'super35': { name: 'Super 35 (24.89×18.66mm)', width: 24.89, height: 18.66 },
      'arri-lf': { name: 'ARRI LF (36.70×25.54mm)', width: 36.70, height: 25.54 },
      'arri-alexa': { name: 'ARRI Alexa (28.17×18.13mm)', width: 28.17, height: 18.13 },
      'red-v-raptor': { name: 'RED V-RAPTOR (40.96×21.60mm)', width: 40.96, height: 21.60 },
      'red-komodo': { name: 'RED KOMODO (27.03×14.26mm)', width: 27.03, height: 14.26 },
      'sony-venice': { name: 'Sony VENICE (36×24mm)', width: 36, height: 24 },
      'bmpcc-6k': { name: 'BMPCC 6K (23.10×12.99mm)', width: 23.10, height: 12.99 },
      'aps-c': { name: 'APS-C (23.6×15.6mm)', width: 23.6, height: 15.6 },
      'mft': { name: 'Micro 4/3 (17.3×13mm)', width: 17.3, height: 13 },
      'custom': { name: 'Custom', width: 36, height: 24 },
    });
    assert.ok(Object.isFrozen(FILMBACK_PRESETS));
    for (const preset of Object.values(FILMBACK_PRESETS)) assert.ok(Object.isFrozen(preset));
  });

  test('FIELD_RULES and setField equal the legacy expressions over the input grid; writeBack flags match', () => {
    assert.deepEqual(Object.keys(CineCamera.FIELD_RULES), Object.keys(LEGACY_CAMERA_RULES));
    assert.ok(Object.isFrozen(CineCamera.FIELD_RULES));
    for (const [field, [legacy, writeBack]] of Object.entries(LEGACY_CAMERA_RULES)) {
      assert.equal(CineCamera.FIELD_RULES[field].writeBack, writeBack, `${field}.writeBack`);
      assert.ok(Object.isFrozen(CineCamera.FIELD_RULES[field]));
      for (const raw of ALL_INPUTS) {
        const expected = legacy(raw);
        same(CineCamera.FIELD_RULES[field].parse(raw), expected, `${field}.parse(${JSON.stringify(raw)})`);
        const cam = new CineCamera();
        same(cam.setField(field, raw), expected, `setField(${field}) return`);
        same(cam[field], expected, `setField(${field}) stored`);
      }
    }
    assert.equal(new CineCamera().setField('posY', '0'), 1.5, "B-L9: '0' gives 1.5");
  });

  test('applyPreset (4252-4259): presets copy the size; custom keeps the current size', () => {
    const cam = new CineCamera();
    assert.equal(cam.applyPreset('super35'), FILMBACK_PRESETS.super35);
    assert.deepEqual([cam.filmback, cam.filmbackWidth, cam.filmbackHeight], ['super35', 24.89, 18.66]);
    cam.filmbackWidth = 50;
    cam.filmbackHeight = 10;
    assert.equal(cam.applyPreset('custom'), FILMBACK_PRESETS.custom);
    assert.deepEqual([cam.filmback, cam.filmbackWidth, cam.filmbackHeight], ['custom', 50, 10]);
    assert.throws(() => cam.applyPreset('nope'), TypeError, 'unknown key: legacy reads preset.width of undefined');
    assert.equal(cam.filmback, 'nope', 'the key was stored before the throw, as legacy');
  });

  test('default 36x24 / 35 mm camera: HFOV 54.4, VFOV 37.8, aspect 1.50 (as displayed)', () => {
    const cam = new CineCamera();
    assert.equal(`${(cam.hFov() * 180 / Math.PI).toFixed(1)}°`, '54.4°');
    assert.equal(`${(cam.vFov() * 180 / Math.PI).toFixed(1)}°`, '37.8°');
    assert.equal(`${cam.aspect().toFixed(2)}:1`, '1.50:1');
  });

  test('hFov / vFov / aspect equal the legacy expressions (fuzzed, Object.is)', () => {
    const rand = rng(21);
    for (let i = 0; i < 500; i++) {
      const cam = fuzzCamera(rand);
      same(cam.hFov(), 2 * Math.atan(cam.filmbackWidth / (2 * cam.focalLength)), 'hFov');
      same(cam.vFov(), 2 * Math.atan(cam.filmbackHeight / (2 * cam.focalLength)), 'vFov');
      same(cam.aspect(), cam.filmbackWidth / cam.filmbackHeight, 'aspect');
      same(cam.hFov() * 180 / Math.PI,
        2 * Math.atan(cam.filmbackWidth / (2 * cam.focalLength)) * 180 / Math.PI, 'preview degrees (3703)');
    }
  });

  test('coverage: the three statuses', () => {
    const cam = new CineCamera();
    const wall = new Wall();
    const exceeds = cam.coverage(wall.flatBounds());
    assert.equal(exceeds.status, 'exceeds', 'default camera vs default 2.5 x 1.5 m wall');
    assert.equal(`${exceeds.frameWidth.toFixed(2)}m`, '5.14m');
    assert.equal(`${exceeds.frameHeight.toFixed(2)}m`, '3.43m');
    assert.equal(`≤ ${exceeds.safeDistance.toFixed(2)}m`, '≤ 2.19m');

    const big = { totalWidth: 20, maxHeight: 10 };
    cam.posX = 10;
    cam.posY = 5;
    assert.equal(cam.coverage(big).status, 'within');
    cam.posX = 1;
    assert.equal(cam.coverage(big).status, 'offCenter', 'fits in both dimensions but not where it points');
    cam.posX = 10;
    cam.posZ = 50;
    assert.equal(cam.coverage(big).status, 'exceeds');
    assert.deepEqual(Object.keys(cam.coverage(big)), ['frameWidth', 'frameHeight', 'status', 'safeDistance']);
  });

  test('coverage and maxSafeDistance equal calculateFrustumIntersection / createSafeDistanceMesh (fuzzed, Object.is)', () => {
    const rand = rng(23);
    const walls = fuzzWalls(24, 400);
    for (const sections of walls) {
      const cam = fuzzCamera(rand);
      const bounds = new Wall({ sections }).flatBounds();
      const coverage = cam.coverage(bounds);
      const legacy = legacyCoverage(cam, sections);
      same(coverage.frameWidth, legacy.frameWidth, 'frameWidth');
      same(coverage.frameHeight, legacy.frameHeight, 'frameHeight');
      same(coverage.safeDistance, legacy.safeDistance, 'safeDistance');
      assert.equal(coverage.status, STATUS_OF_TEXT[legacy.text]);
      same(cam.maxSafeDistance(bounds), legacySafeDistance(cam, sections), 'maxSafeDistance (2610-2612)');
    }
  });

  test('resetTo equals resetCameraPosition 2559-2564 (fuzzed, Object.is)', () => {
    for (const sections of fuzzWalls(25, 100)) {
      const cam = fuzzCamera(rng(sections.length + 1));
      cam.resetTo(new Wall({ sections }).flatBounds());
      const { totalWidth, maxHeight } = legacyFlatBounds(sections);
      same(cam.posX, totalWidth / 2, 'posX');
      same(cam.posY, maxHeight / 2, 'posY');
      assert.deepEqual([cam.posZ, cam.rotX, cam.rotY, cam.rotZ], [5, 0, 0, 0]);
    }
  });

  test('presetShortName (B-L34: first word of the preset name)', () => {
    const cam = new CineCamera();
    const expected = {
      'full-frame': 'Full', 'super35': 'Super', 'arri-lf': 'ARRI', 'arri-alexa': 'ARRI', 'red-v-raptor': 'RED',
      'red-komodo': 'RED', 'sony-venice': 'Sony', 'bmpcc-6k': 'BMPCC', 'aps-c': 'APS-C', 'mft': 'Micro', 'custom': 'Custom',
    };
    for (const [key, word] of Object.entries(expected)) {
      cam.filmback = key;
      assert.equal(cam.presetShortName(), word, key);
      assert.equal(cam.presetShortName(), FILMBACK_PRESETS[cam.filmback]?.name.split(' ')[0] || 'Custom');
    }
    cam.filmback = 'unknown';
    assert.equal(cam.presetShortName(), 'Custom');
  });

  test('translateBy (B-L10): posY clamped at 0, X and Z unclamped (fuzzed vs 3338-3340)', () => {
    const rand = rng(31);
    for (let i = 0; i < 500; i++) {
      const cam = fuzzCamera(rand);
      const legacy = plainPose(cam);
      const m = { x: (rand() - 0.5) * 20, y: (rand() - 0.5) * 20, z: (rand() - 0.5) * 20 };
      cam.translateBy(m.x, m.y, m.z);
      legacy.posX += m.x;
      legacy.posY = Math.max(0, legacy.posY + m.y);
      legacy.posZ += m.z;
      for (const k of POSE_KEYS) same(cam[k], legacy[k], k);
    }
    const cam = new CineCamera();
    cam.translateBy(0, -10, -100);
    assert.deepEqual([cam.posY, cam.posZ], [0, -95]);
  });

  test('rotateBy (B-L28) adds the signed delta: bit-identical to legacy `rot - angle` with delta = -1 * angle', () => {
    const rand = rng(37);
    for (let i = 0; i < 1000; i++) {
      const cam = fuzzCamera(rand);
      const legacy = plainPose(cam);
      const axis = ['x', 'y', 'z'][Math.floor(rand() * 3)];
      const angle = [(rand() - 0.5) * 400, 0, -0, 1e-12, -180, 90][Math.floor(rand() * 6)];
      cam.rotateBy(axis, -1 * angle);   // Strategies.gizmoRotateSign * angle
      if (axis === 'x') legacy.rotX = Math.max(-90, Math.min(90, legacy.rotX - angle));
      else if (axis === 'y') legacy.rotY -= angle;
      else legacy.rotZ = Math.max(-180, Math.min(180, legacy.rotZ - angle));
      for (const k of POSE_KEYS) same(cam[k], legacy[k], `${axis} ${k}`);
    }
    const cam = new CineCamera();
    cam.rotateBy('x', 500);
    cam.rotateBy('z', -500);
    cam.rotateBy('y', 1000);
    assert.deepEqual([cam.rotX, cam.rotY, cam.rotZ], [90, 1000, -180]);
  });

  test('pilotLook equals 3551-3552 (fuzzed, Object.is)', () => {
    const rand = rng(41);
    for (let i = 0; i < 500; i++) {
      const cam = fuzzCamera(rand);
      const legacy = plainPose(cam);
      const deltaX = Math.round((rand() - 0.5) * 400);
      const deltaY = Math.round((rand() - 0.5) * 400);
      cam.pilotLook(deltaX, deltaY);
      legacy.rotY -= deltaX * 0.3;
      legacy.rotX = Math.max(-90, Math.min(90, legacy.rotX - deltaY * 0.3));
      for (const k of POSE_KEYS) same(cam[k], legacy[k], k);
    }
  });

  test('pilotFly equals 3578-3611 for every key combination (fuzzed, Object.is)', () => {
    const rand = rng(43);
    const names = ['forward', 'back', 'left', 'right', 'down', 'up'];
    for (let i = 0; i < 2000; i++) {
      const cam = fuzzCamera(rand);
      if (rand() < 0.2) cam.posY = rand() * 0.2;
      const legacy = plainPose(cam);
      const mask = i % 64;
      const keys = Object.fromEntries(names.map((n, b) => [n, Boolean(mask & (1 << b))]));
      const forward = { x: rand() - 0.5, y: rand() - 0.5, z: rand() - 0.5 };
      const right = { x: rand() - 0.5, y: 0, z: rand() - 0.5 };
      const speed = [0.05, 0.01, 0.3, 0.0425, rand() * 0.3][Math.floor(rand() * 5)];
      const moved = cam.pilotFly(keys, forward, right, speed);
      const legacyMoved = legacyPilotFly(legacy, keys, forward, right, speed);
      assert.equal(moved, legacyMoved);
      for (const k of POSE_KEYS) same(cam[k], legacy[k], `${k} mask ${mask}`);
    }
  });

  test('pilotFly clamps posY at 0.1 even when nothing moves (B-L10)', () => {
    const cam = new CineCamera();
    cam.posY = 0.05;
    const none = { forward: false, back: false, left: false, right: false, down: false, up: false };
    assert.equal(cam.pilotFly(none, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, 0.05), false);
    assert.equal(cam.posY, 0.1);
    cam.posY = -3;
    cam.pilotFly(none, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, 0.05);
    assert.equal(cam.posY, 0.1);
    cam.posY = 2;
    cam.pilotFly(none, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, 0.05);
    assert.equal(cam.posY, 2, 'above the floor nothing changes');
    cam.posY = 0.12;
    assert.equal(cam.pilotFly({ ...none, down: true }, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, 0.05), true);
    assert.equal(cam.posY, 0.1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Prop
// ---------------------------------------------------------------------------------------------------------------

describe('Prop', () => {
  test('PersonProp and CarProp defaults (1336-1351, 3129, 3131)', () => {
    const person = new PersonProp();
    const car = new CarProp();
    assert.ok(person instanceof Prop && car instanceof Prop);
    assert.deepEqual(
      [person.kind, person.label, person.gizmoAnchorY, person.visible, person.posX, person.posZ, person.rotY, person.scale],
      ['person', 'Person', 0.9, false, 2, 2, 0, 1]);
    assert.deepEqual(
      [car.kind, car.label, car.gizmoAnchorY, car.visible, car.posX, car.posZ, car.rotY, car.scale],
      ['car', 'Car', 0.5, false, 4, 3, 0, 1]);
    const custom = new Prop({ kind: 'person', label: 'X', posX: 1, posZ: 2, rotY: 30, scale: 1.5, gizmoAnchorY: 0.7 });
    assert.deepEqual([custom.rotY, custom.scale, custom.gizmoAnchorY], [30, 1.5, 0.7]);
  });

  test('FIELD_RULES and setField equal the legacy expressions over the input grid; writeBack flags match', () => {
    assert.deepEqual(Object.keys(Prop.FIELD_RULES), Object.keys(LEGACY_PROP_RULES));
    assert.ok(Object.isFrozen(Prop.FIELD_RULES));
    for (const [field, [legacy, writeBack]] of Object.entries(LEGACY_PROP_RULES)) {
      assert.equal(Prop.FIELD_RULES[field].writeBack, writeBack, `${field}.writeBack`);
      for (const raw of ALL_INPUTS) {
        const expected = legacy(raw);
        same(Prop.FIELD_RULES[field].parse(raw), expected, `${field}.parse(${JSON.stringify(raw)})`);
        for (const prop of [new PersonProp(), new CarProp()]) {
          same(prop.setField(field, raw), expected, `${prop.kind}.setField(${field}) return`);
          same(prop[field], expected, `${prop.kind}.setField(${field}) stored`);
        }
      }
    }
  });

  test('translateBy ignores dy (B-L22) and equals 3348-3349', () => {
    const rand = rng(51);
    for (let i = 0; i < 300; i++) {
      const prop = rand() < 0.5 ? new PersonProp() : new CarProp();
      const m = { x: (rand() - 0.5) * 10, y: (rand() - 0.5) * 10, z: (rand() - 0.5) * 10 };
      const legacy = { posX: prop.posX, posZ: prop.posZ };
      prop.translateBy(m.x, m.y, m.z);
      legacy.posX += m.x;
      legacy.posZ += m.z;
      same(prop.posX, legacy.posX, 'posX');
      same(prop.posZ, legacy.posZ, 'posZ');
      assert.equal(prop.rotY, 0);
    }
  });

  test('rotateBy acts only on y and returns whether it did (B-L22)', () => {
    const prop = new PersonProp();
    assert.equal(prop.rotateBy('x', 10), false);
    assert.equal(prop.rotateBy('z', 10), false);
    assert.equal(prop.rotY, 0);
    assert.equal(prop.rotateBy('y', -1 * 12.5), true);
    same(prop.rotY, 0 - 12.5, 'rotY -= angle');
    assert.equal(prop.rotateBy('y', 400), true);
    same(prop.rotY, -12.5 + 400, 'unclamped, like legacy');
  });
});
