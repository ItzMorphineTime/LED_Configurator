/**
 * @module io/ProjectSchema
 * The machine-readable table of the project file (spec 07 4.2-4.4; 08 P2-3b for the wall keys, 08 P2-13e for the v2
 * file): the key order the writer emits, the rows the validator walks and the mapping back to domain values. Every
 * range is the domain's own (`WallSection.LIMITS`, `CineCamera.LIMITS`, `Prop.LIMITS`, the input rules' clamps), so
 * the UI, the writer and the import cannot disagree (07 4.3 reachability; 08 4.4).
 *
 * Extension protocol (07 4.4): a feature key is absent until its feature's own landing commit (C39), which
 *  - adds the key to TOP_LEVEL_KEYS / SECTION_KEYS at its 07 4.2 position, or a row to a block table (DISPLAY_ROWS,
 *    PANEL_ID_STYLE_ROWS, CAMERA_ROWS, PROP_ROWS) whose row order is the file's key order;
 *  - bumps KNOWN_REVISION once per feature release and records the keys in REVISIONS (C40);
 *  - adds the writer and validator entry (io/ProjectSerializer, io/ProjectValidator; a block row needs none) and the
 *    restore step (app/ProjectIO.#applyV2), with "absent means default" and a round-trip test.
 * Until then the reader drops such a key with a `dropped-unknown` info (KNOWN_UNAPPLIED_KEYS names the 07 v2.0 keys
 * whose state does not exist yet).
 * Legacy source: index.html@cd3fd3f 4974-4988 (the import's section mapping, now `sectionsFromProject`).
 * Layer: io (pure; may import domain, geometry, legacy).
 */

import { WallSection } from '../domain/WallSection.js';
import { Wall } from '../domain/Wall.js';
import { FILMBACK_PRESETS, CineCamera } from '../domain/CineCamera.js';
import { Prop } from '../domain/Prop.js';
import { LOGO_POSITIONS, LOGO_SCALE } from '../domain/LogoRules.js';
import { deepFreeze, MAX_LOGO_ASSETS } from '../domain/rules.js';
import { ProjectMeta } from '../domain/Project.js';

/** The value of a project file's `format` key (07 4.2); a file may omit it (the version decides). */
export const FORMAT = 'morph-led-project';

/**
 * The newest v2 revision this build reads and writes (07 4.4 rule 4, C40): 0 is v2.0, the Phase-2 keys of 08 P2-13e.
 * Each feature release that adds keys bumps it once and records them in REVISIONS.
 */
export const KNOWN_REVISION = 0;

/** The `version` this build writes: "2.<KNOWN_REVISION>". */
export const VERSION = `2.${KNOWN_REVISION}`;

/** Revision -> the keys it introduced (07 C40; the dropped-unknown and newer-revision messages read it). */
export const REVISIONS = deepFreeze({
  0: ['version', 'format', 'project', 'sections', 'mesh_mode', 'display', 'panel_id_style', 'camera', 'props', 'assets',
    'totals', 'extensions'],
});

/** The mesh modes a file may name (07 4.3); anything else becomes 'combined' with a warning. */
export const MESH_MODES = deepFreeze(['combined', 'section', 'panel']);

/**
 * The top-level keys the writer emits, in the file's key order (07 4.2, the Phase-2 subset of 08 4.6). `project` (07 D1)
 * is written only while the project's name or notes differ from the defaults (absent means default), so every file of a
 * project without them keeps its bytes.
 */
export const TOP_LEVEL_KEYS = deepFreeze(['version', 'format', 'project', 'sections', 'mesh_mode', 'display',
  'panel_id_style', 'camera', 'props', 'assets', 'totals', 'extensions']);

/** The keys of one section the writer emits, in the file's key order (07 4.2); texture_file only in the 'zip' variant. */
export const SECTION_KEYS = deepFreeze(['name', 'id', 'panel', 'led_resolution', 'curvature', 'color', 'logo',
  'texture_file', 'extensions']);

/** Derived keys: written for downstream tools, ignored on read without an issue (07 4.2). */
export const DERIVED_TOP_LEVEL_KEYS = deepFreeze(['generator', 'totals']);

/**
 * The 07 v2.0 keys whose state does not exist yet (07 4.2, 08 4.6): known, validated as present and dropped with one
 * dropped-unknown info each. A feature's landing commit moves its key from here into the tables above.
 */
export const KNOWN_UNAPPLIED_KEYS = deepFreeze(['pivot', 'uv', 'atlas', 'hdri', 'production', 'measurements', 'viewport']);

/** More panels than this raise the `budget` warning on import (07 4.7, 6.7). */
export const MAX_PANELS_BUDGET = 20000;

/** The LED pixel layouts of the #led-layout select (07 4.3). */
export const LED_LAYOUTS = deepFreeze(['single-dot', 'rgb-triangle', 'rgb-stripe', 'rgb-horizontal', 'square']);

/** The display contents of a v2.0 file (07 4.3); 'hdri' is Feature 5's and reads as 'color' with a warning until then. */
export const CONTENT_MODES = deepFreeze(['color', 'ledSim', 'panelIds']);

/**
 * The validator's limits: the section ranges (`WallSection.LIMITS`, 08 P2-8a), the section count (`Wall.MAX_SECTIONS`),
 * the section name length (32 UTF-16 code units, the card input's maxlength) and the logo asset count.
 * @type {Readonly<{sections: typeof WallSection.LIMITS, maxSections: number, nameMaxLength: number, maxLogoAssets: number}>}
 */
export const LIMITS = Object.freeze({ sections: WallSection.LIMITS, maxSections: Wall.MAX_SECTIONS, nameMaxLength: 32,
  maxLogoAssets: MAX_LOGO_ASSETS });

/**
 * The numeric section rows in the file's key order (07 4.2): `group` and `key` give the path inside a section
 * (`sections[i].<group>.<key>`), `field` the WallSection field (and its LIMITS row), `label` the card label used in the
 * correction messages (08 3.3, with the British labels of 06 T4c).
 * @type {ReadonlyArray<Readonly<{group: string, key: string, field: string, label: string}>>}
 */
export const SECTION_NUMBER_ROWS = deepFreeze([
  { group: 'panel', key: 'columns', field: 'panelCols', label: 'Columns' },
  { group: 'panel', key: 'rows', field: 'panelRows', label: 'Rows' },
  { group: 'panel', key: 'width_mm', field: 'panelWidth', label: 'Width (mm)' },
  { group: 'panel', key: 'height_mm', field: 'panelHeight', label: 'Height (mm)' },
  { group: 'led_resolution', key: 'x', field: 'ledX', label: 'Pixels X' },
  { group: 'led_resolution', key: 'y', field: 'ledY', label: 'Pixels Y' },
  { group: 'curvature', key: 'angle_degrees', field: 'curveIntensity', label: 'Panel Angle (°)' },
  { group: 'curvature', key: 'angle_offset_degrees', field: 'angleOffset', label: 'Section Offset (°)' },
]);

/** The labels of the section groups, for a group that is present but not an object. */
export const SECTION_GROUP_LABELS = deepFreeze({ panel: 'Panel', led_resolution: 'LED resolution', curvature: 'Curvature' });

/** The derived keys of the section groups (written, ignored on read; 07 4.2). */
export const SECTION_DERIVED_KEYS = deepFreeze({ led_resolution: ['pixel_pitch_mm'], curvature: ['type'] });

/** The labels of the other section rows (08 3.3). */
export const SECTION_LABELS = deepFreeze({ name: 'Section Name', id: 'id', color: 'Panel Colour', logo: 'Logo' });

/**
 * @typedef {object} BlockRow  one value of a v2 block (08 P2-13e): its file path inside the block (`position_m.x`), the
 *   domain field it maps to, its type and range, its default ("absent means default", 07 4.4 rule 3) and the UI label
 *   of the correction messages (08 3.3)
 * @property {string} key
 * @property {string} field
 * @property {'bool'|'number'|'int'|'enum'|'hex'|'text'} type
 * @property {number} [maxLength]  text: the most UTF-16 code units (never splitting a pair)
 * @property {boolean} [trim]      text: trimmed after the control characters are stripped
 * @property {number} [min]
 * @property {number} [max]
 * @property {ReadonlyArray<string>} [values]  enum values
 * @property {*} default
 * @property {string} label
 * @property {boolean} [viewOnly]  view-only (07 4.4 rule 5): excluded from a future history variant
 */

/**
 * `project` (07 4.3, D1) <-> `project.meta` (ProjectMeta): the name (sanitizeText to 64 units, trimmed, empty gives the
 * default) and the notes (sanitizeText to 4000 units, not trimmed). No UI writes them yet (07 D8 adds the name field).
 */
export const PROJECT_ROWS = deepFreeze([
  { key: 'name', field: 'name', type: 'text', maxLength: 64, trim: true, default: ProjectMeta.DEFAULT_NAME, label: 'Project name' },
  { key: 'notes', field: 'notes', type: 'text', maxLength: 4000, trim: false, default: '', label: 'Project notes' },
]);

/** `display` (07 4.3) <-> `project.display` (DisplaySettings). */
export const DISPLAY_ROWS = deepFreeze([
  { key: 'content', field: 'content', type: 'enum', values: CONTENT_MODES, default: 'color', label: 'Display content' },
  { key: 'led_layout', field: 'ledLayout', type: 'enum', values: LED_LAYOUTS, default: 'single-dot', label: 'LED Pixel Layout' },
  { key: 'wireframe', field: 'wireframe', type: 'bool', default: false, label: 'Wireframe' },
  { key: 'show_frame', field: 'showFrame', type: 'bool', default: false, label: 'Show Panel Frames' },
  { key: 'show_grid', field: 'showGrid', type: 'bool', default: true, label: 'Grid', viewOnly: true },
  { key: 'show_safe_distance', field: 'showSafeDistance', type: 'bool', default: false, label: 'Show Safe Distance 3D' },
]);

/** `panel_id_style` (07 4.3) <-> `project.panelIdStyle` (PanelIdStyle; the ranges of PanelIdStyle.RULES). */
export const PANEL_ID_STYLE_ROWS = deepFreeze([
  { key: 'border_thickness', field: 'borderThickness', type: 'int', min: 1, max: 32, default: 8, label: 'Border Thickness (px)' },
  { key: 'font_size', field: 'fontSize', type: 'int', min: 0, max: 200, default: 0, label: 'Label Font Size (0=auto)' },
  { key: 'font_color', field: 'fontColor', type: 'hex', default: '#ffffff', label: 'Label Font Colour' },
  { key: 'section_label_enabled', field: 'sectionLabelEnabled', type: 'bool', default: true, label: 'Show Section Names' },
  { key: 'section_label_font_size', field: 'sectionLabelFontSize', type: 'int', min: 0, max: 400, default: 0, label: 'Section Label Size (0=auto)' },
  { key: 'section_label_color', field: 'sectionLabelColor', type: 'hex', default: '#888888', label: 'Section Label Colour' },
]);

const CAM = CineCamera.LIMITS;
/**
 * `camera` (07 4.3) <-> `project.camera` (CineCamera): the input rules' ranges, the ±100,000 m writer bounds of the
 * position (CineCamera.LIMITS) and an unbounded pan (07 4.3: any finite number). The filmback size of a preset is the
 * preset's (the validator overwrites it, 07 4.3).
 */
export const CAMERA_ROWS = deepFreeze([
  { key: 'enabled', field: 'enabled', type: 'bool', default: false, label: 'Enable Camera Preview' },
  { key: 'filmback', field: 'filmback', type: 'enum', values: Object.keys(FILMBACK_PRESETS), default: 'full-frame', fallback: 'custom', label: 'Filmback / Sensor' },
  { key: 'filmback_width_mm', field: 'filmbackWidth', type: 'number', min: 1, max: 100, default: 36, label: 'Sensor Width (mm)' },
  { key: 'filmback_height_mm', field: 'filmbackHeight', type: 'number', min: 1, max: 100, default: 24, label: 'Sensor Height (mm)' },
  { key: 'focal_length_mm', field: 'focalLength', type: 'number', min: 8, max: 800, default: 35, label: 'Focal Length (mm)' },
  { key: 'position_m.x', field: 'posX', type: 'number', min: CAM.posX.min, max: CAM.posX.max, default: 0, label: 'Camera X Position (m)' },
  { key: 'position_m.y', field: 'posY', type: 'number', min: CAM.posY.min, max: CAM.posY.max, default: 1.5, label: 'Camera Y Height (m)' },
  { key: 'position_m.z', field: 'posZ', type: 'number', min: CAM.posZ.min, max: CAM.posZ.max, default: 5, label: 'Camera Z Position (m)' },
  { key: 'rotation_deg.x', field: 'rotX', type: 'number', min: -90, max: 90, default: 0, label: 'Camera Tilt (°)' },
  { key: 'rotation_deg.y', field: 'rotY', type: 'number', min: -Infinity, max: Infinity, default: 0, label: 'Camera Pan (°)' },
  { key: 'rotation_deg.z', field: 'rotZ', type: 'number', min: -180, max: 180, default: 0, label: 'Camera Roll (°)' },
]);

/**
 * `props.person` / `props.car` (07 4.3) <-> the Prop: the position within Prop.LIMITS, an unbounded rotation (any finite
 * number) and the scale rule's range. The defaults are the legacy poses (person (2, 2), car (4, 3)).
 */
export const PROP_ROWS = deepFreeze([
  { key: 'visible', field: 'visible', type: 'bool', default: false, label: 'Show' },
  { key: 'position_m.x', field: 'posX', type: 'number', min: Prop.LIMITS.posX.min, max: Prop.LIMITS.posX.max, default: null, label: 'X Position (m)' },
  { key: 'position_m.z', field: 'posZ', type: 'number', min: Prop.LIMITS.posZ.min, max: Prop.LIMITS.posZ.max, default: null, label: 'Z Position (m)' },
  { key: 'rotation_y_deg', field: 'rotY', type: 'number', min: -Infinity, max: Infinity, default: 0, label: 'Rotation (°)' },
  { key: 'scale', field: 'scale', type: 'number', min: 0.5, max: 2, default: 1, label: 'Scale' },
]);

/** The props of a v2 file: key, UI label prefix and the default position (07 4.3). */
export const PROPS = deepFreeze([
  { key: 'person', label: 'Person', defaults: { posX: 2, posZ: 2 } },
  { key: 'car', label: 'Car', defaults: { posX: 4, posZ: 3 } },
]);

/** The file extension of each logo MIME type (07 4.5), for an asset's ZIP entry. */
export const ASSET_EXTENSIONS = deepFreeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' });

/** A logo asset's ZIP entry path (07 4.5, D6): `assets/` + its id + the extension of its MIME type. */
export const ASSET_PATH_RE = /^assets\/[A-Za-z0-9_.-]{1,64}\.(png|jpg|webp|svg)$/;

/**
 * The ZIP entry of a logo asset in Export All (07 4.5, D6): `assets/<id>.<ext>`.
 * Side effects: none.
 * @param {string} id    the asset id ('a_' + 16 hex)
 * @param {string} mime  one of LOGO_MIMES
 * @returns {string}
 */
export function assetZipPath(id, mime) {
  return `assets/${id}.${ASSET_EXTENSIONS[mime] ?? 'bin'}`;
}

/** The logo of a section (07 4.3): asset_id, position (LOGO_POSITIONS) and scale ([0.05, 1]). */
export const LOGO_ROWS = deepFreeze({ positions: LOGO_POSITIONS, scale: LOGO_SCALE });

/**
 * The value at a dotted path of a plain object ('position_m.x'), or undefined.
 * Side effects: none.
 * @param {*} obj
 * @param {string} path
 * @returns {*}
 */
export function getPath(obj, path) {
  let v = obj;
  for (const k of path.split('.')) {
    if (v === null || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(v, k)) return undefined;
    v = v[k];
  }
  return v;
}

/**
 * Writes `value` at a dotted path, creating plain objects on the way (in call order, so the rows' order is the key
 * order of the result).
 * Side effects: writes into `obj`.
 * @param {object} obj
 * @param {string} path
 * @param {*} value
 */
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!Object.prototype.hasOwnProperty.call(o, k)) o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

/**
 * A block of the file from a domain object: each row's domain field at its path, in row order.
 * Side effects: none.
 * @param {ReadonlyArray<BlockRow>} rows
 * @param {object} domain  e.g. project.display
 * @returns {object}
 */
export function blockFromDomain(rows, domain) {
  const out = {};
  for (const row of rows) setPath(out, row.key, domain[row.field]);
  return out;
}

/**
 * The domain values of a validated block: { field: value } in row order.
 * Side effects: none.
 * @param {ReadonlyArray<BlockRow>} rows
 * @param {object} block  a block of a successful validateProject
 * @returns {object}
 */
export function blockToDomain(rows, block) {
  const out = {};
  for (const row of rows) out[row.field] = getPath(block, row.key);
  return out;
}

/**
 * The domain sections of a validated project (the inverse of the v1 section mapping; every value is already valid).
 * A v2 section's `extensions` are kept on the section (07 4.4: preserved verbatim).
 * Side effects: none.
 * @param {{sections: Array<{name: string, id: number, panel: {columns: number, rows: number, width_mm: number,
 *          height_mm: number}, led_resolution: {x: number, y: number},
 *          curvature: {angle_degrees: number, angle_offset_degrees: number}, color: string, extensions?: object}>}} project
 *   the `project` of a successful validateProject
 * @returns {WallSection[]} fresh sections, fields in SECTION_FIELDS order
 */
export function sectionsFromProject(project) {
  return project.sections.map((s) => new WallSection({
    id: s.id,
    name: s.name,
    panelCols: s.panel.columns,
    panelRows: s.panel.rows,
    panelWidth: s.panel.width_mm,
    panelHeight: s.panel.height_mm,
    ledX: s.led_resolution.x,
    ledY: s.led_resolution.y,
    curveIntensity: s.curvature.angle_degrees,
    angleOffset: s.curvature.angle_offset_degrees,
    color: s.color,
    extensions: s.extensions,
  }));
}

/**
 * The domain state of a validated v2 project (08 P2-13e; what app/ProjectIO.#applyV2 restores, 08 6.17): the
 * sections, the mesh mode, the display, panel-ID style, camera and prop values keyed by their domain fields, the
 * section logos ({sectionId, assetId, position, scale}) and the logo assets, and the top-level extensions.
 * Side effects: none.
 * @param {object} project  the `project` of a successful v2 validateProject
 * @returns {{sections: WallSection[], meshMode: string, display: object, panelIdStyle: object, camera: object,
 *            person: object, car: object, logos: Array<{sectionId: number, assetId: string, position: string, scale: number}>,
 *            assets: object[], extensions: object, meta: {name: string, notes: string}|null}}  meta: null without a
 *   `project` key (absent means default, 07 D1)
 */
export function stateFromProject(project) {
  return {
    sections: sectionsFromProject(project),
    meshMode: project.mesh_mode,
    display: blockToDomain(DISPLAY_ROWS, project.display),
    panelIdStyle: blockToDomain(PANEL_ID_STYLE_ROWS, project.panel_id_style),
    camera: blockToDomain(CAMERA_ROWS, project.camera),
    person: blockToDomain(PROP_ROWS, project.props.person),
    car: blockToDomain(PROP_ROWS, project.props.car),
    logos: project.sections.filter((s) => s.logo).map((s) => ({
      sectionId: s.id, assetId: s.logo.asset_id, position: s.logo.position, scale: s.logo.scale,
    })),
    assets: project.assets,
    extensions: project.extensions,
    meta: project.project ? blockToDomain(PROJECT_ROWS, project.project) : null,
  };
}
