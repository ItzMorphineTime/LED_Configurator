/**
 * @module io/ProjectValidator
 * The import validator (spec 07 4.7, 6.7, 6.8; 08 4.3, P2-3b: the wall subset of 07 D2; 08 P2-13e: the v2 path). It
 * checks the wall keys of a v2-shaped document (`sections`, `mesh_mode`; a migrated v1 file) or, on the v2 path, a
 * whole v2 file (every block of io/ProjectSchema: display, panel-ID style, camera, props, the logo assets and the
 * section logos, the extensions; since revision 1 (M7a) the pivot, the UV settings and each section's UV transform and
 * vertex edits; unknown and not-yet-applied keys are dropped with a dropped-unknown info), corrects
 * what it can (coerced, rounded, clamped, defaulted, sanitized, truncated, reassigned-id, missing-asset,
 * invalid-reference, newer-revision warnings, 08 3.3 correction lines) and refuses what it cannot (no sections, more
 * than `Wall.MAX_SECTIONS`). It never spreads or assigns input objects: the result is built field by field from
 * `ProjectSchema`, so an imported document can neither inject markup through a colour nor pollute a prototype.
 * Its ranges are `WallSection.LIMITS`, the card rules' own (08 P2-8a), and its name rule is `sanitizeText`, the rule
 * of `WallSection.setName`, so every value the UI can produce passes unchanged (reachability, 08 criterion 16).
 * Legacy source: none (legacy validated nothing, B-L8).
 * Layer: io (pure; may import domain, geometry, legacy).
 */

import { clamp, roundInt, stripControls, truncateUnits, isValidSectionId, createIdAllocator, MAX_LOGO_BYTES } from '../domain/rules.js';
import { FILMBACK_PRESETS } from '../domain/CineCamera.js';
import { UvTransform } from '../domain/UvSettings.js';
import { logoAssetName, parseLogoDataUri } from '../domain/LogoRules.js';
import { canvasFits, CANVAS_HARD_LIMITS } from '../geometry/TextureAtlas.js';
import {
  LIMITS, MESH_MODES, SECTION_NUMBER_ROWS, SECTION_GROUP_LABELS, SECTION_LABELS, SECTION_DERIVED_KEYS, SECTION_KEYS,
  FORMAT, KNOWN_REVISION, TOP_LEVEL_KEYS, DERIVED_TOP_LEVEL_KEYS, KNOWN_UNAPPLIED_KEYS, DISPLAY_ROWS, PANEL_ID_STYLE_ROWS,
  CAMERA_ROWS, PROP_ROWS, PROPS, LOGO_ROWS, PROJECT_ROWS, MAX_PANELS_BUDGET, ASSET_PATH_RE, ASSET_EXTENSIONS, getPath, setPath,
  PIVOT_ROWS, PIVOT_DERIVED_KEYS, UV_ROWS, UV_TRANSFORM_LABELS,
} from './ProjectSchema.js';
import { ImportMessages, isPlainObject } from './ProjectMigrations.js';

/** A number written as text (07 6.7 num): optional sign, digits with an optional fraction, optional exponent. */
const NUMERIC_STRING_RE = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;
/** `#rrggbb` and `#rgb` (07 6.7 hex). */
const HEX6_RE = /^#[0-9a-f]{6}$/i;
const HEX3_RE = /^#[0-9a-f]{3}$/i;

/**
 * @typedef {object} Issue  the 07 4.7 issue shape
 * @property {string} path      v2 path, e.g. 'sections[2].panel.columns'
 * @property {'parse-error'|'too-large'|'unsupported-format'|'newer-version'|'no-sections'|'limit-exceeded'|'coerced'|
 *   'clamped'|'rounded'|'wrapped'|'defaulted'|'truncated'|'sanitized'|'reassigned-id'|'missing-asset'|
 *   'invalid-reference'|'dropped-unknown'|'newer-revision'|'migrated'|'budget'} code
 * @property {'info'|'warning'|'error'} severity
 * @property {string} message  plain text (08 3.3)
 * @property {*} [from]
 * @property {*} [to]
 */

/**
 * A value in a correction line (08 3.3): strings with JSON.stringify, numbers as they are, anything else
 * `(invalid)`; at most 40 characters.
 * Side effects: none.
 * @param {*} v
 * @returns {string}
 */
export function formatValue(v) {
  const text = typeof v === 'string' ? JSON.stringify(v) : typeof v === 'number' ? String(v) : '(invalid)';
  return text.length > 40 ? text.slice(0, 40) : text;
}

/**
 * 07 6.7 num: a number stays, a numeric string becomes its number, anything else NaN.
 * @param {*} v
 * @returns {number}
 */
function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUMERIC_STRING_RE.test(v)) return Number(v);
  return NaN;
}

/**
 * One numeric field (07 6.7 finiteValue + number): a numeric string is coerced; a missing value takes the default
 * silently; anything unusable (wrong type, NaN, ±Infinity, '1e400') takes the default with a warning; an integer field
 * is rounded; the value is clamped to [min, max]. Each step that changes the value reports through `report`.
 * @param {*} v
 * @param {{min: number, max: number, int: boolean, default: number}} spec
 * @param {(code: string, from: *, to: *) => void} report
 * @returns {number}
 */
function numberField(v, spec, report) {
  let x = num(v);
  if (Number.isFinite(x)) {
    if (typeof v === 'string') report('coerced', v, x);
  } else if (v === undefined) {
    x = spec.default;
  } else {
    report('defaulted', v, spec.default);
    x = spec.default;
  }
  if (spec.int && !Number.isInteger(x)) {
    const y = roundInt(x);
    report('rounded', x, y);
    x = y;
  }
  if (x < spec.min || x > spec.max) {
    const y = clamp(x, spec.min, spec.max);
    report('clamped', x, y);
    x = y;
  }
  return x;
}

/**
 * The section name (07 6.7 name, 08 amendment A3): a string stays, a finite number becomes its text (coerced), a
 * missing name takes the default silently and anything else with a warning; then the 07 strip set is removed
 * (sanitized) and the text is cut to `maxLength` UTF-16 code units without splitting a surrogate pair (truncated),
 * never trimmed; an empty result takes the default (defaulted). The same rule as WallSection.setName.
 * @param {*} v
 * @param {string} fallback  `Wall ${i + 1}`
 * @param {number} maxLength
 * @param {(code: string, from: *, to: *) => void} report
 * @returns {string}
 */
function nameField(v, fallback, maxLength, report) {
  let s;
  if (typeof v === 'string') {
    s = v;
  } else if (typeof v === 'number' && Number.isFinite(v)) {
    s = String(v);
    report('coerced', v, s);
  } else if (v === undefined) {
    return fallback;
  } else {
    report('defaulted', v, fallback);
    return fallback;
  }
  const stripped = stripControls(s);
  if (stripped !== s) report('sanitized', s, stripped);
  const cut = truncateUnits(stripped, maxLength);
  if (cut !== stripped) report('truncated', stripped, cut);
  if (cut === '') {
    report('defaulted', cut, fallback);
    return fallback;
  }
  return cut;
}

/**
 * The section colour (07 6.7 hex): `#rrggbb` is lower-cased silently, `#rgb` is expanded (coerced), anything else
 * takes the default (sanitized), which also stops CSS injected through a colour (B-M4 defence in depth).
 * @param {*} v
 * @param {string} fallback
 * @param {(code: string, from: *, to: *) => void} report
 * @returns {string}
 */
function colorField(v, fallback, report) {
  if (typeof v === 'string' && HEX6_RE.test(v)) return v.toLowerCase();
  if (typeof v === 'string' && HEX3_RE.test(v)) {
    const out = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
    report('coerced', v, out);
    return out;
  }
  if (v === undefined) return fallback;
  report('sanitized', v, fallback);
  return fallback;
}

/**
 * Validates the wall keys of a v2-shaped document (07 4.7 signature; 08 P2-3b implements the wall subset).
 *
 * Errors (then `ok === false`, `project === null` and nothing else is reported): `input` not a plain object
 * (unsupported-format, M-IMP-4a); `sections` not an array (no-sections, M-IMP-1); no sections (no-sections, M-IMP-2);
 * more than `limits.maxSections` (limit-exceeded, M-IMP-3).
 *
 * Corrections (warnings, 08 3.3 lines `Section <i+1> "<corrected name>": <label> <from> → <to>`): per section, in file
 * key order: a non-object section (defaulted), the name, a non-object `panel` / `led_resolution` / `curvature` group
 * (defaulted), the eight numbers (`ProjectSchema.SECTION_NUMBER_ROWS` over `WallSection.LIMITS`) and the colour; then
 * the ids of 07 6.8 (the first occurrence of each valid id keeps it, every other id is renumbered from max + 1 with the
 * 2^31 - 1 fallback: reassigned-id); then `mesh_mode`: `null` or absent keeps the current mode (no issue; the v1
 * migration maps a falsy mode to null), `combined | section | panel` applies, anything else becomes `combined`
 * (defaulted, `Mesh mode: <from> → "combined"`); last (07 D2, 4.7) the `budget` warnings of the corrected wall: its
 * panel-ID atlas at 1 px per LED does not fit `exportLimits`, or it has more than MAX_PANELS_BUDGET panels (the file
 * still opens; the warning is a note, not a correction, and it is raised again for the same wall).
 *
 * The v2 path (08 P2-13e; `revision` given) validates a whole v2 file instead: see validateV2.
 *
 * Idempotent: the project it returns validates again with no issue. Never reads or writes anything but the input.
 * Side effects: none.
 * @param {*} input  `{ sections, mesh_mode }`, or a v2 file on the v2 path
 * @param {{limits?: typeof LIMITS, palette?: {sectionColors: ReadonlyArray<string>}, knownRevision?: number,
 *          revision?: number, exportLimits?: {maxSide: number, maxArea: number}}} [options]
 *   palette.sectionColors: the default colour of section i is sectionColors[i % length] (the serializer passes the
 *   legacy list for a v1 file, 07 4.3); revision: the file's v2 revision (the minor version; detectVersion), which
 *   selects the v2 path; knownRevision: ProjectSchema.KNOWN_REVISION by default; exportLimits: the canvas limits of the
 *   `budget` check (07 4.7; default TextureAtlas.CANVAS_HARD_LIMITS; the validator never probes the browser)
 * @returns {{ok: boolean, project: object|null, issues: Issue[]}}
 */
export function validateProject(input, { limits = LIMITS, palette = { sectionColors: ['#d9d9d6'] }, knownRevision = KNOWN_REVISION,
  revision, exportLimits = CANVAS_HARD_LIMITS } = {}) {
  if (Number.isInteger(revision)) return validateV2(input, { limits, palette, knownRevision, revision, exportLimits });
  const fail = (path, code, message) => ({ ok: false, project: null, issues: [{ path, code, severity: 'error', message }] });
  if (!isPlainObject(input)) return fail('', 'unsupported-format', ImportMessages.notAProject);
  const raw = input.sections;
  if (!Array.isArray(raw)) return fail('sections', 'no-sections', ImportMessages.noSectionsList);
  if (raw.length === 0) return fail('sections', 'no-sections', ImportMessages.noSections);
  if (raw.length > limits.maxSections) {
    return fail('sections', 'limit-exceeded', ImportMessages.tooManySections(raw.length, limits.maxSections));
  }

  const issues = [];
  const colors = palette.sectionColors;
  const sections = raw.map((s0, i) => validateSection(s0, i, limits, colors[i % colors.length], issues));
  reassignIds(sections, issues);
  const meshMode = meshModeField(input.mesh_mode, issues);
  budgetIssues(sections, exportLimits, (issue) => issues.push(issue));
  return { ok: true, project: { sections, mesh_mode: meshMode }, issues };
}

/**
 * The `budget` warnings of a validated wall (07 4.7, 6.7; 07 D2): its panel-ID atlas (the sum of columns x LED columns
 * by the tallest rows x LED rows) does not fit `exportLimits` even at 1 px per LED (TextureBudget's fitPxPerLed of
 * 07 X3 at its minimum density), or it has more than MAX_PANELS_BUDGET panels. Warnings only: the file still opens.
 * @param {object[]} sections  validated sections (v2 shape)
 * @param {{maxSide: number, maxArea: number}} exportLimits
 * @param {(issue: Issue) => void} push
 */
function budgetIssues(sections, exportLimits, push) {
  let ledX = 0;
  let ledY = 0;
  let panels = 0;
  for (const s of sections) {
    ledX += s.panel.columns * s.led_resolution.x;
    ledY = Math.max(ledY, s.panel.rows * s.led_resolution.y);
    panels += s.panel.columns * s.panel.rows;
  }
  if (!canvasFits(ledX, ledY, exportLimits)) {
    push({ path: 'sections', code: 'budget', severity: 'warning', message: ImportMessages.textureBudget(ledX, ledY, exportLimits) });
  }
  if (panels > MAX_PANELS_BUDGET) {
    push({ path: 'sections', code: 'budget', severity: 'warning', message: ImportMessages.panelBudget(panels, MAX_PANELS_BUDGET) });
  }
}

/**
 * One section: a fresh object in the v2 key order. Its correction lines are added to `issues` after its name is known,
 * so every line names the corrected section. On the v2 path (`v2` given, 08 P2-13e) the section also gets its UV
 * transform and vertex edits (revision 1, M7a: uvTransformField, uvVertexEditsField), its logo (logoField) and its
 * extensions, and every unknown key is dropped with a dropped-unknown info (derived keys silently).
 * @param {*} s0
 * @param {number} i
 * @param {typeof LIMITS} limits
 * @param {string} defaultColor
 * @param {Issue[]} issues
 * @param {{assets: Map<string, object>, kinds: Map<string, *>}|null} [v2]  the validated logo assets by id and the kind
 *   of every asset id of the file
 * @returns {object}
 */
function validateSection(s0, i, limits, defaultColor, issues, v2 = null) {
  const base = `sections[${i}]`;
  const pending = [];
  const reporter = (path, label) => (code, from, to) => pending.push({ path, label, code, from, to });

  let s = s0;
  if (!isPlainObject(s0)) {
    pending.push({ path: base, label: 'Section', code: 'defaulted', from: s0, to: null, text: 'not a section, replaced by a default section' });
    s = {};
  }
  const name = nameField(s.name, `Wall ${i + 1}`, limits.nameMaxLength, reporter(`${base}.name`, SECTION_LABELS.name));
  const groups = {};
  for (const group of Object.keys(SECTION_GROUP_LABELS)) {
    const g = s[group];
    if (g === undefined || isPlainObject(g)) {
      groups[group] = g ?? {};
    } else {
      pending.push({ path: `${base}.${group}`, label: SECTION_GROUP_LABELS[group], code: 'defaulted', from: g, to: null, text: `${SECTION_GROUP_LABELS[group]} ${formatValue(g)} → defaults` });
      groups[group] = {};
    }
  }
  const values = {};
  for (const row of SECTION_NUMBER_ROWS) {
    values[row.field] = numberField(groups[row.group][row.key], limits.sections[row.field],
      reporter(`${base}.${row.group}.${row.key}`, row.label));
  }
  const color = colorField(s.color, defaultColor, reporter(`${base}.color`, SECTION_LABELS.color));
  let logo = null;
  let extensions = null;
  let uv = null;
  if (v2) {
    uv = {
      uv_transform: uvTransformField(s.uv_transform, `${base}.uv_transform`, pending),
      uv_vertex_edits: uvVertexEditsField(s.uv_vertex_edits, `${base}.uv_vertex_edits`, values.panelCols, values.panelRows, pending),
    };
    logo = logoField(s.logo, `${base}.logo`, v2, pending);
    extensions = extensionsField(s.extensions, `${base}.extensions`, (p) => pending.push(p));
    const drop = (path) => pending.push({ path, code: 'dropped-unknown', severity: 'info', text: `ignored "${path.slice(base.length + 1)}"` });
    for (const key of Object.keys(s)) if (!SECTION_KEYS.includes(key)) drop(`${base}.${key}`);
    for (const group of Object.keys(SECTION_GROUP_LABELS)) {
      if (!isPlainObject(s[group])) continue;
      const known = [...SECTION_NUMBER_ROWS.filter((r) => r.group === group).map((r) => r.key), ...(SECTION_DERIVED_KEYS[group] ?? [])];
      for (const key of Object.keys(s[group])) if (!known.includes(key)) drop(`${base}.${group}.${key}`);
    }
  }

  for (const p of pending) {
    const line = p.text ?? `${p.label} ${formatValue(p.from)} → ${formatValue(p.to)}`;
    issues.push({ path: p.path, code: p.code, severity: p.severity ?? 'warning', message: `Section ${i + 1} "${name}": ${line}`, from: p.from, to: p.to });
  }
  const out = {
    name,
    id: s.id !== undefined ? s.id : i,   // a missing id takes the index, silently (07 6.8; the v1 migration did the same)
    panel: { columns: values.panelCols, rows: values.panelRows, width_mm: values.panelWidth, height_mm: values.panelHeight },
    led_resolution: { x: values.ledX, y: values.ledY },
    curvature: { angle_degrees: values.curveIntensity, angle_offset_degrees: values.angleOffset },
    color,
    ...(uv ?? {}),
    logo,
  };
  if (v2) out.extensions = extensions;
  return out;
}

/**
 * 07 6.8: the first occurrence of each valid id (an integer in [0, 2^31 - 1]) keeps it; every other id (a duplicate,
 * a string, a fraction, a negative, a missing v2 id) gets the next free id, in section order (reassigned-id). The v1
 * migration has already filled a missing id with the section index.
 * @param {object[]} sections  the validated sections; their `id` is rewritten in place (fresh objects)
 * @param {Issue[]} issues
 */
function reassignIds(sections, issues) {
  const used = new Set();
  const keeps = sections.map((s) => {
    if (isValidSectionId(s.id) && !used.has(s.id)) {
      used.add(s.id);
      return true;
    }
    return false;
  });
  const allocator = createIdAllocator(used);
  sections.forEach((s, i) => {
    if (keeps[i]) return;
    const from = s.id;
    s.id = allocator.next();
    issues.push({ path: `sections[${i}].id`, code: 'reassigned-id', severity: 'warning',
      message: `Section ${i + 1} "${s.name}": ${SECTION_LABELS.id} ${formatValue(from)} → ${s.id}`, from, to: s.id });
  });
}

/**
 * `mesh_mode`: null or absent keeps the current mode (no issue); a known mode applies; anything else becomes
 * 'combined' with a warning (legacy rendered an unknown mode as panels, B-L8).
 * @param {*} v
 * @param {Issue[]} issues
 * @returns {string|null}
 */
function meshModeField(v, issues) {
  if (v === null || v === undefined) return null;
  if (MESH_MODES.includes(v)) return v;
  issues.push({ path: 'mesh_mode', code: 'defaulted', severity: 'warning',
    message: `Mesh mode: ${formatValue(v)} → ${formatValue('combined')}`, from: v, to: 'combined' });
  return 'combined';
}

// ---- the v2 path (08 P2-13e; 07 4.2-4.7) ---------------------------------------------------------------------

/** Own keys that are never copied, at any level (07 4.7 security rules). */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** A namespaced extension key (07 4.4 rule 4), e.g. "morph.stage_notes". */
const EXTENSION_KEY_RE = /^[a-z0-9-]+\.[A-Za-z0-9_.-]+$/;
/** The deepest extension value and the largest extensions object (07 4.4 rule 4). */
const EXTENSION_MAX_DEPTH = 8;
const EXTENSION_MAX_CHARS = 256 * 1024;
/** An asset id a file may use (the app writes 'a_' + 16 hex, 07 6.13). */
const ASSET_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
/** A SHA-256 in hex. */
const SHA256_RE = /^[0-9a-fA-F]{64}$/;

/** The nested groups of the v2 blocks in correction messages ("Camera position: 7 → defaults"). */
const GROUP_LABELS = Object.freeze({ position_m: 'position', rotation_deg: 'rotation', offset_m: 'offset', orientation: 'orientation' });

/** A value of a v2 correction line: booleans as text, everything else as formatValue (08 3.3). */
const formatBlockValue = (v) => (typeof v === 'boolean' ? String(v) : formatValue(v));

/**
 * A boolean field (07 6.7): a boolean stays; "true" / "false" are coerced; a missing value takes the default
 * silently; anything else takes the default with a warning.
 * @param {*} v
 * @param {boolean} fallback
 * @param {(code: string, from: *, to: *) => void} report
 * @returns {boolean}
 */
function boolField(v, fallback, report) {
  if (typeof v === 'boolean') return v;
  if (v === undefined) return fallback;
  if (v === 'true' || v === 'false') {
    report('coerced', v, v === 'true');
    return v === 'true';
  }
  report('defaulted', v, fallback);
  return fallback;
}

/**
 * A text field (07 4.3 `project.name` / `project.notes`, 6.7, C28): a string, or a finite number as its text (coerced);
 * the control and bidi characters stripped (sanitized), cut to `row.maxLength` UTF-16 code units without splitting a
 * pair (truncated), then trimmed when the row says so (sanitized); an empty result takes a non-empty default
 * (defaulted). A missing value takes the default silently, anything else the default with a warning. Idempotent.
 * @param {*} v
 * @param {{maxLength: number, trim?: boolean}} row
 * @param {string} fallback
 * @param {(code: string, from: *, to: *) => void} report
 * @returns {string}
 */
function textField(v, row, fallback, report) {
  let s;
  if (typeof v === 'string') {
    s = v;
  } else if (typeof v === 'number' && Number.isFinite(v)) {
    s = String(v);
    report('coerced', v, s);
  } else if (v === undefined) {
    return fallback;
  } else {
    report('defaulted', v, fallback);
    return fallback;
  }
  const stripped = stripControls(s);
  if (stripped !== s) report('sanitized', s, stripped);
  const cut = truncateUnits(stripped, row.maxLength);
  if (cut !== stripped) report('truncated', stripped, cut);
  const out = row.trim ? cut.trim() : cut;
  if (out !== cut) report('sanitized', cut, out);
  if (out === '' && fallback !== '') {
    report('defaulted', out, fallback);
    return fallback;
  }
  return out;
}

/**
 * An enum field: a member stays; a missing value takes the default silently; anything else the fallback with a warning.
 * @param {*} v
 * @param {ReadonlyArray<string>} values
 * @param {string} fallback  for a missing value
 * @param {string} unknown   for an unknown value
 * @param {(code: string, from: *, to: *) => void} report
 * @returns {string}
 */
function enumField(v, values, fallback, unknown, report) {
  if (typeof v === 'string' && values.includes(v)) return v;
  if (v === undefined) return fallback;
  report('defaulted', v, unknown);
  return unknown;
}

/**
 * A deep copy of a JSON value without forbidden keys, or undefined when it nests deeper than `depthLeft` or holds a
 * non-JSON value. Every dropped forbidden key is reported through `drop`.
 * @param {*} v
 * @param {number} depthLeft
 * @param {string} path
 * @param {(path: string) => void} drop
 * @returns {*}
 */
function cloneJson(v, depthLeft, path, drop) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (depthLeft <= 0) return undefined;
  if (Array.isArray(v)) {
    const out = [];
    for (let k = 0; k < v.length; k++) {
      const c = cloneJson(v[k], depthLeft - 1, `${path}[${k}]`, drop);
      if (c === undefined) return undefined;
      out.push(c);
    }
    return out;
  }
  if (!isPlainObject(v)) return undefined;
  const out = {};
  for (const key of Object.keys(v)) {
    if (FORBIDDEN_KEYS.has(key)) {
      drop(`${path}.${key}`);
      continue;
    }
    const c = cloneJson(v[key], depthLeft - 1, `${path}.${key}`, drop);
    if (c === undefined) return undefined;
    out[key] = c;
  }
  return out;
}

/**
 * An `extensions` object (07 4.4 rule 4): namespaced keys only, JSON values at most EXTENSION_MAX_DEPTH deep and at
 * most EXTENSION_MAX_CHARS serialized, copied fresh and never interpreted. A bad key or a forbidden key is dropped
 * (dropped-unknown info); a value too deep, or the whole object too large, is dropped with a warning.
 * @param {*} v
 * @param {string} path
 * @param {(issue: {path: string, code: string, severity?: string, text: string}) => void} push
 * @returns {object}
 */
function extensionsField(v, path, push) {
  if (v === undefined) return {};
  if (!isPlainObject(v)) {
    push({ path, code: 'defaulted', text: `Extensions ${formatValue(v)} → none` });
    return {};
  }
  const drop = (p) => push({ path: p, code: 'dropped-unknown', severity: 'info', text: `ignored "${p}"` });
  const out = {};
  for (const key of Object.keys(v)) {
    if (FORBIDDEN_KEYS.has(key) || !EXTENSION_KEY_RE.test(key)) {
      drop(`${path}.${key}`);
      continue;
    }
    const clean = cloneJson(v[key], EXTENSION_MAX_DEPTH, `${path}.${key}`, drop);
    if (clean === undefined) {
      push({ path: `${path}.${key}`, code: 'sanitized', text: `Extension "${key}": dropped (not plain data or nested too deep)` });
      continue;
    }
    out[key] = clean;
  }
  if (JSON.stringify(out).length > EXTENSION_MAX_CHARS) {
    push({ path, code: 'sanitized', text: 'Extensions: dropped (larger than 256 KB)' });
    return {};
  }
  return out;
}

/**
 * A section's logo (07 4.3): null or absent gives none; an object must name a validated logo asset (missing-asset;
 * invalid-reference for an asset of another kind), its position is one of LOGO_POSITIONS ('center' otherwise) and its
 * scale lies in [0.05, 1].
 * @param {*} v
 * @param {string} path
 * @param {{assets: Map<string, object>, kinds: Map<string, *>}} v2
 * @param {object[]} pending  the section's pending correction lines
 * @returns {{asset_id: string, position: string, scale: number}|null}
 */
function logoField(v, path, { assets, kinds }, pending) {
  if (v === undefined || v === null) return null;
  if (!isPlainObject(v)) {
    pending.push({ path, code: 'defaulted', from: v, to: null, text: `Logo ${formatValue(v)} → no logo` });
    return null;
  }
  const id = v.asset_id;
  if (typeof id !== 'string' || !assets.has(id)) {
    const wrongKind = typeof id === 'string' && kinds.has(id) && kinds.get(id) !== 'logo';
    pending.push({ path: `${path}.asset_id`, code: wrongKind ? 'invalid-reference' : 'missing-asset', from: id, to: null,
      text: `Logo ${formatValue(id)} → no logo (${wrongKind ? 'not a logo image' : 'the image is missing'})` });
    return null;
  }
  const report = (key, label) => (code, from, to) => pending.push({ path: `${path}.${key}`, label, code, from, to });
  const position = enumField(v.position, LOGO_ROWS.positions, 'center', 'center', report('position', 'Logo position'));
  const scale = numberField(v.scale, { min: LOGO_ROWS.scale.min, max: LOGO_ROWS.scale.max, int: false, default: LOGO_ROWS.scale.default },
    report('scale', 'Logo scale'));
  for (const key of Object.keys(v)) {
    if (!['asset_id', 'position', 'scale'].includes(key)) pending.push({ path: `${path}.${key}`, code: 'dropped-unknown', severity: 'info', text: `ignored "logo.${key}"` });
  }
  return { asset_id: id, position, scale };
}

/**
 * A section's `uv_transform` (04 4.2, UV-5c; revision 1): absent gives the identity silently; null or any other
 * non-object the identity with a warning; each leaf by UvTransform.RULES, reported: offsets finite (else 0, defaulted)
 * and clamped to [-8, 8]; a scale of 0 or not finite is 1 (defaulted), a negative scale is its absolute value and
 * toggles its flip (coerced), then [0.01, 16] (clamped); the rotation finite (else 0) and normalised into (-180, 180]
 * (wrapped, info); the flips and source_rotated as booleans ("true" / "false" coerced). Unknown leaves are dropped.
 * Side effects: pushes to `pending`.
 * @param {*} v
 * @param {string} path  'sections[i].uv_transform'
 * @param {object[]} pending  the section's pending correction lines
 * @returns {{offset_u: number, offset_v: number, scale_u: number, scale_v: number, rotation_degrees: number,
 *            flip_u: boolean, flip_v: boolean, source_rotated: boolean}} in UvTransform.toJSON's key order
 */
function uvTransformField(v, path, pending) {
  const out = UvTransform.identity().toJSON();
  if (v === undefined) return out;
  if (!isPlainObject(v)) {
    pending.push({ path, code: 'defaulted', from: v, to: null, text: `UV transform ${formatValue(v)} → identity` });
    return out;
  }
  const report = (key) => (code, from, to) => pending.push({ path: `${path}.${key}`, code, from, to,
    text: `${UV_TRANSFORM_LABELS[key]} ${formatBlockValue(from)} → ${formatBlockValue(to)}`,
    ...(code === 'wrapped' ? { severity: 'info' } : {}) });
  for (const key of ['flip_u', 'flip_v', 'source_rotated']) out[key] = boolField(v[key], false, report(key));
  for (const key of ['offset_u', 'offset_v']) out[key] = numberField(v[key], { min: -8, max: 8, int: false, default: 0 }, report(key));
  for (const [key, flip] of [['scale_u', 'flip_u'], ['scale_v', 'flip_v']]) {
    const raw = v[key];
    const r = report(key);
    let x = num(raw);
    if (raw === undefined) {
      x = 1;
    } else if (!Number.isFinite(x) || x === 0) {
      r('defaulted', raw, 1);
      x = 1;
    } else {
      if (typeof raw === 'string') r('coerced', raw, x);
      if (x < 0) {
        r('coerced', x, -x);
        x = -x;
        out[flip] = !out[flip];
      }
      if (x < 0.01 || x > 16) {
        const y = clamp(x, 0.01, 16);
        r('clamped', x, y);
        x = y;
      }
    }
    out[key] = x;
  }
  const rawRot = v.rotation_degrees;
  let rot = num(rawRot);
  if (rawRot === undefined) {
    rot = 0;
  } else if (!Number.isFinite(rot)) {
    report('rotation_degrees')('defaulted', rawRot, 0);
    rot = 0;
  } else {
    if (typeof rawRot === 'string') report('rotation_degrees')('coerced', rawRot, rot);
    const wrapped = UvTransform.normalizeRotation(rot);
    if (wrapped !== rot) report('rotation_degrees')('wrapped', rot, wrapped);
    rot = wrapped;
  }
  out.rotation_degrees = rot;
  for (const key of Object.keys(v)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) pending.push({ path: `${path}.${key}`, code: 'dropped-unknown', severity: 'info', text: `ignored "uv_transform.${key}"` });
  }
  return out;
}

/**
 * A section's `uv_vertex_edits` (revision 1, M7a; the owner's per-vertex UV edits of 2026-10-31): a list of
 * {row, col, du, dv}, base-space deltas of the vertices of the section's (columns + 1) x (rows + 1) panel-corner grid
 * (row 0 at the bottom). Absent gives none silently; a non-list none with a warning. An entry that is not an object, a
 * vertex whose col / row is not an integer inside the grid of the section's (validated) columns and rows
 * (invalid-reference) and a repeated vertex are dropped with a warning; du and dv follow UvVertexEdits' delta rule
 * (finite, else 0 with a warning; clamped to [-8, 8]; |d| < 1e-12 is 0, rounded); a zero delta is no edit (dropped
 * silently); unknown keys are dropped (info). The result is sorted by vertex (row, then col), as UvVertexEdits.toJSON
 * writes it.
 * Side effects: pushes to `pending`.
 * @param {*} v
 * @param {string} path  'sections[i].uv_vertex_edits'
 * @param {number} cols  the section's validated panel columns
 * @param {number} rows  the section's validated panel rows
 * @param {object[]} pending
 * @returns {Array<{row: number, col: number, du: number, dv: number}>}
 */
function uvVertexEditsField(v, path, cols, rows, pending) {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    pending.push({ path, code: 'defaulted', from: v, to: null, text: `UV vertex edits ${formatValue(v)} → none` });
    return [];
  }
  const byKey = new Map();
  v.forEach((e, j) => {
    const p = `${path}[${j}]`;
    if (!isPlainObject(e)) {
      pending.push({ path: p, code: 'defaulted', from: e, to: null, text: `UV vertex edit ${j + 1}: ${formatValue(e)} → dropped` });
      return;
    }
    const { col, row } = e;
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col > cols || row > rows) {
      pending.push({ path: p, code: 'invalid-reference', from: { col, row }, to: null,
        text: `UV vertex edit at column ${formatValue(col)}, row ${formatValue(row)} → dropped (outside the ${cols} × ${rows} panel grid)` });
      return;
    }
    const key = row * (cols + 1) + col;
    if (byKey.has(key)) {
      pending.push({ path: p, code: 'defaulted', from: { col, row }, to: null, text: `UV vertex edit at column ${col}, row ${row} → dropped (repeated)` });
      return;
    }
    const delta = (name) => {
      const label = `UV vertex (column ${col}, row ${row}) ${name}`;
      const r = (code, from, to) => pending.push({ path: `${p}.${name}`, label, code, from, to });
      const d = numberField(e[name], { min: -8, max: 8, int: false, default: 0 }, r);
      if (d !== 0 && Math.abs(d) < 1e-12) {
        r('rounded', d, 0);
        return 0;
      }
      return d;
    };
    const du = delta('du');
    const dv = delta('dv');
    for (const k of Object.keys(e)) {
      if (!['row', 'col', 'du', 'dv'].includes(k)) pending.push({ path: `${p}.${k}`, code: 'dropped-unknown', severity: 'info', text: `ignored "uv_vertex_edits[].${k}"` });
    }
    if (du !== 0 || dv !== 0) byKey.set(key, { row, col, du, dv });
  });
  return [...byKey.keys()].sort((a, b) => a - b).map((k) => byKey.get(k));
}

/**
 * The logo assets (07 4.5, 08 6.16): each entry must be a plain object of kind 'logo' with a valid, unique id, stored
 * inline, with a data URI that parseLogoDataUri accepts and whose MIME equals `mime`; at most `maxLogoAssets` are kept
 * (the rest are dropped, each with a warning). `bytes` is recomputed from the data (derived), `name` sanitised; a
 * `sha256` that is not 64 hex characters is replaced by '' (the loader recomputes it, 07 4.5 integrity).
 * @param {*} raw
 * @param {typeof LIMITS} limits
 * @param {(issue: Issue) => void} push
 * @returns {{list: object[], byId: Map<string, object>, kinds: Map<string, *>}}
 */
function validateAssets(raw, limits, push) {
  const list = [];
  const byId = new Map();
  const kinds = new Map();
  if (raw === undefined) return { list, byId, kinds };
  if (!Array.isArray(raw)) {
    push({ path: 'assets', code: 'defaulted', severity: 'warning', message: `Logo images: ${formatValue(raw)} → none`, from: raw, to: [] });
    return { list, byId, kinds };
  }
  raw.forEach((a, k) => {
    const path = `assets[${k}]`;
    const name = isPlainObject(a) ? logoAssetName(a.name) : '';
    const label = `Logo "${name || `asset ${k + 1}`}"`;
    const warn = (code, why) => push({ path, code, severity: 'warning', message: `${label}: dropped (${why})`, from: a, to: null });
    if (!isPlainObject(a)) {
      warn('sanitized', 'not an asset');
      return;
    }
    if (typeof a.id === 'string' && !kinds.has(a.id)) kinds.set(a.id, a.kind);
    if (a.kind !== 'logo') {
      push({ path, code: 'dropped-unknown', severity: 'info', message: `${label}: ignored (kind ${formatValue(a.kind)})` });
      return;
    }
    if (typeof a.id !== 'string' || !ASSET_ID_RE.test(a.id) || byId.has(a.id)) {
      warn('sanitized', 'invalid or repeated id');
      return;
    }
    if (list.length >= limits.maxLogoAssets) {
      warn('sanitized', `more than ${limits.maxLogoAssets} logo images`);
      return;
    }
    const sha256 = typeof a.sha256 === 'string' && SHA256_RE.test(a.sha256) ? a.sha256.toLowerCase() : '';
    let asset;
    if (a.storage === 'zip') {
      // 07 D6: a ZIP entry of the project's archive, `assets/<id>.<ext>` (no other folder, no traversal); its bytes
      // are read and checked when the archive is opened (a JSON opened alone drops it then)
      if (typeof a.path !== 'string' || !ASSET_PATH_RE.test(a.path) || !Object.prototype.hasOwnProperty.call(ASSET_EXTENSIONS, a.mime)
        || !Number.isInteger(a.bytes) || a.bytes < 0 || a.bytes > MAX_LOGO_BYTES) {
        warn('sanitized', 'not a PNG, JPEG, WebP or SVG entry of the archive');
        return;
      }
      asset = { id: a.id, kind: 'logo', name, mime: a.mime, bytes: a.bytes, sha256, storage: 'zip', path: a.path };
    } else if (a.storage !== 'inline') {
      warn('missing-asset', 'the image is not stored in this file');
      return;
    } else {
      const parsed = parseLogoDataUri(a.data_uri);
      if (!parsed || parsed.mime !== a.mime) {
        warn('sanitized', 'not a PNG, JPEG, WebP or SVG data URL');
        return;
      }
      asset = { id: a.id, kind: 'logo', name, mime: parsed.mime, bytes: parsed.bytes, sha256, storage: 'inline', data_uri: a.data_uri };
    }
    for (const key of Object.keys(a)) {
      if (!['id', 'kind', 'name', 'mime', 'bytes', 'sha256', 'storage', 'data_uri', 'path'].includes(key)) {
        push({ path: `${path}.${key}`, code: 'dropped-unknown', severity: 'info', message: `${label}: ignored "${key}"` });
      }
    }
    list.push(asset);
    byId.set(a.id, asset);
  });
  return { list, byId, kinds };
}

/**
 * One block of the v2 file (io/ProjectSchema rows): a fresh object in row order. An absent block or value takes the
 * default silently; a block or nested group that is not an object takes the defaults with a warning; each value is
 * checked by its row type (bool, number, int, enum, hex), then a number row's `parse` (the domain rule, e.g. the 1 mm
 * of WallPivot.parseOffset: rounded); every unknown key is dropped (dropped-unknown info), the `derived` ones silently.
 * @param {*} v
 * @param {ReadonlyArray<import('./ProjectSchema.js').BlockRow>} rows
 * @param {string} path      'display', 'camera', 'props.person', ...
 * @param {string} blockLabel  the block's label in messages ('Display', 'Camera', 'Person', ...)
 * @param {string} prefix    the prefix of the row labels ('Person ', '')
 * @param {object} defaults  per-field defaults that replace a row's default (the prop positions)
 * @param {(issue: Issue) => void} push
 * @param {ReadonlyArray<string>} [derived]  derived keys of the block, ignored without an issue (pivot.resolved_m)
 * @returns {object}
 */
function validateBlock(v, rows, path, blockLabel, prefix, defaults, push, derived = []) {
  let block = v;
  if (v !== undefined && !isPlainObject(v)) {
    push({ path, code: 'defaulted', severity: 'warning', message: `${blockLabel}: ${formatValue(v)} → defaults`, from: v, to: null });
    block = undefined;
  }
  block = block ?? {};
  const out = {};
  // nested groups that are not objects
  const groups = new Set(rows.filter((r) => r.key.includes('.')).map((r) => r.key.split('.')[0]));
  const badGroups = new Set();
  for (const g of groups) {
    const gv = block[g];
    if (gv !== undefined && !isPlainObject(gv)) {
      push({ path: `${path}.${g}`, code: 'defaulted', severity: 'warning', message: `${blockLabel} ${GROUP_LABELS[g] ?? g}: ${formatValue(gv)} → defaults`, from: gv, to: null });
      badGroups.add(g);
    }
  }
  for (const row of rows) {
    const raw = badGroups.has(row.key.split('.')[0]) ? undefined : getPath(block, row.key);
    const dflt = Object.prototype.hasOwnProperty.call(defaults, row.field) ? defaults[row.field] : row.default;
    const label = `${prefix}${row.label}`;
    const report = (code, from, to) => push({ path: `${path}.${row.key}`, code, severity: 'warning',
      message: `${label}: ${formatBlockValue(from)} → ${formatBlockValue(to)}`, from, to });
    let value;
    switch (row.type) {
      case 'bool': value = boolField(raw, dflt, report); break;
      case 'enum': value = enumField(raw, row.values, dflt, row.fallback ?? dflt, report); break;
      case 'hex': value = colorField(raw, dflt, report); break;
      case 'text': value = textField(raw, row, dflt, report); break;
      default:
        value = numberField(raw, { min: row.min, max: row.max, int: row.type === 'int', default: dflt }, report);
        if (row.parse) {
          const parsed = row.parse(value);
          if (parsed !== value) report('rounded', value, parsed);
          value = parsed;
        }
    }
    setPath(out, row.key, value);
  }
  // unknown keys, at the block level and inside the nested groups
  const top = new Set(rows.map((r) => r.key.split('.')[0]));
  for (const key of Object.keys(block)) {
    if (!top.has(key)) {
      if (derived.includes(key)) continue;
      push({ path: `${path}.${key}`, code: 'dropped-unknown', severity: 'info', message: `${blockLabel}: ignored "${key}"` });
    } else if (groups.has(key) && isPlainObject(block[key])) {
      const sub = rows.filter((r) => r.key.startsWith(`${key}.`)).map((r) => r.key.slice(key.length + 1));
      for (const k of Object.keys(block[key])) {
        if (!sub.includes(k)) push({ path: `${path}.${key}.${k}`, code: 'dropped-unknown', severity: 'info', message: `${blockLabel}: ignored "${key}.${k}"` });
      }
    }
  }
  return out;
}

/**
 * The v2 path of validateProject (08 P2-13e; 07 4.6 "Any v2 revision goes straight to validateProject with absent means
 * default"): the same errors as the wall subset; then, in this order, the logo assets, the `project` block (07 D1:
 * name and notes, kept only when the file has the key), the sections (with their UV transforms and vertex edits, logos
 * and extensions) and their ids (07 6.8), the mesh mode (absent: 'combined', 07 4.3), the `pivot` block (revision 1,
 * 03 T7: kept only when the file has the key, so a file without one keeps the session's pivot; its `resolved_m` is
 * derived), the `uv` block (04 UV-5c: absent gives the defaults), the display (with the view-only
 * show_pivot_marker), panel-ID style, camera and prop blocks (a preset filmback takes the preset's size, info if
 * different), the top-level extensions, and every unknown or not-yet-applied key (one dropped-unknown info each;
 * generator, atlas and totals are derived and ignored silently).
 * Unreferenced assets are dropped (dropped-unknown info). A file of a newer revision (07 D2, 4.4 rule 4) opens with one
 * newer-revision warning, first in the list, that names its format version and every key this build ignored (section
 * indexes folded); unknown keys inside `extensions` are kept verbatim, every other unknown key is dropped. Last, the
 * `budget` warnings of the wall (budgetIssues).
 * The result is a normalised v2 file: version "2.<knownRevision>", format, [project], sections, mesh_mode, [pivot], uv,
 * display, panel_id_style, camera, props, assets, extensions, so validating it again gives no issue but the same budget notes
 * (idempotence) and a file the app wrote validates to itself without its derived keys (fidelity, 07 4.7).
 * Side effects: none.
 * @param {*} input
 * @param {{limits: typeof LIMITS, palette: {sectionColors: ReadonlyArray<string>}, knownRevision: number, revision: number,
 *          exportLimits: {maxSide: number, maxArea: number}}} options
 * @returns {{ok: boolean, project: object|null, issues: Issue[]}}
 */
function validateV2(input, { limits, palette, knownRevision, revision, exportLimits }) {
  const fail = (path, code, message) => ({ ok: false, project: null, issues: [{ path, code, severity: 'error', message }] });
  if (!isPlainObject(input)) return fail('', 'unsupported-format', ImportMessages.notAProject);
  const raw = input.sections;
  if (!Array.isArray(raw)) return fail('sections', 'no-sections', ImportMessages.noSectionsList);
  if (raw.length === 0) return fail('sections', 'no-sections', ImportMessages.noSections);
  if (raw.length > limits.maxSections) {
    return fail('sections', 'limit-exceeded', ImportMessages.tooManySections(raw.length, limits.maxSections));
  }

  const issues = [];
  const push = (issue) => issues.push(issue);
  const assetIssues = [];
  const assets = validateAssets(input.assets, limits, (issue) => assetIssues.push(issue));
  const projectBlock = input.project === undefined ? null
    : validateBlock(input.project, PROJECT_ROWS, 'project', 'Project', '', {}, push);

  const colors = palette.sectionColors;
  const sections = raw.map((s0, i) => validateSection(s0, i, limits, colors[i % colors.length], issues,
    { assets: assets.byId, kinds: assets.kinds }));
  reassignIds(sections, issues);

  let meshMode = 'combined';
  if (input.mesh_mode !== undefined) {
    if (MESH_MODES.includes(input.mesh_mode)) {
      meshMode = input.mesh_mode;
    } else {
      push({ path: 'mesh_mode', code: 'defaulted', severity: 'warning',
        message: `Mesh mode: ${formatValue(input.mesh_mode)} → ${formatValue('combined')}`, from: input.mesh_mode, to: 'combined' });
    }
  }

  const pivot = input.pivot === undefined ? null
    : validateBlock(input.pivot, PIVOT_ROWS, 'pivot', 'Pivot', '', {}, push, PIVOT_DERIVED_KEYS);
  const uv = validateBlock(input.uv, UV_ROWS, 'uv', 'UV', '', {}, push);
  const display = validateBlock(input.display, DISPLAY_ROWS, 'display', 'Display', '', {}, push);
  const panelIdStyle = validateBlock(input.panel_id_style, PANEL_ID_STYLE_ROWS, 'panel_id_style', 'Panel ID style', '', {}, push);
  const camera = validateBlock(input.camera, CAMERA_ROWS, 'camera', 'Camera', '', {}, push);
  if (camera.filmback !== 'custom') {
    const preset = FILMBACK_PRESETS[camera.filmback];
    for (const [key, size] of [['filmback_width_mm', preset.width], ['filmback_height_mm', preset.height]]) {
      if (camera[key] !== size) {
        push({ path: `camera.${key}`, code: 'coerced', severity: 'info', message: `${key}: ${formatValue(camera[key])} → ${size} (the preset's size)`, from: camera[key], to: size });
        camera[key] = size;
      }
    }
  }
  let propsIn = input.props;
  if (propsIn !== undefined && !isPlainObject(propsIn)) {
    push({ path: 'props', code: 'defaulted', severity: 'warning', message: `Props: ${formatValue(propsIn)} → defaults`, from: propsIn, to: null });
    propsIn = undefined;
  }
  propsIn = propsIn ?? {};
  const props = {};
  for (const p of PROPS) props[p.key] = validateBlock(propsIn[p.key], PROP_ROWS, `props.${p.key}`, p.label, `${p.label} `, p.defaults, push);
  for (const key of Object.keys(propsIn)) {
    if (!PROPS.some((p) => p.key === key)) push({ path: `props.${key}`, code: 'dropped-unknown', severity: 'info', message: `Props: ignored "${key}"` });
  }
  const extensions = extensionsField(input.extensions, 'extensions',
    (p) => push({ path: p.path, code: p.code, severity: p.severity ?? 'warning', message: p.text }));

  for (const key of Object.keys(input)) {
    if (TOP_LEVEL_KEYS.includes(key) || DERIVED_TOP_LEVEL_KEYS.includes(key)) continue;
    const why = KNOWN_UNAPPLIED_KEYS.includes(key) ? 'not used by this version' : 'unknown';
    push({ path: key, code: 'dropped-unknown', severity: 'info', message: `Ignored "${key}" (${why})` });
  }

  // only the referenced assets are kept, in file order
  const used = new Set(sections.filter((s) => s.logo).map((s) => s.logo.asset_id));
  const kept = [];
  for (const asset of assets.list) {
    if (used.has(asset.id)) kept.push(asset);
    else assetIssues.push({ path: 'assets', code: 'dropped-unknown', severity: 'info', message: `Logo "${asset.name}": ignored (not used by any section)` });
  }
  issues.push(...assetIssues);

  if (revision > knownRevision) {
    // the keys outside `extensions` (a malformed extension key is not a newer setting), other than whole asset entries
    // (an unused asset, an asset of another kind) and the forbidden keys, section indexes folded
    const ignored = [...new Set(issues
      .filter((i) => i.code === 'dropped-unknown' && !/^assets(\[\d+\])?$/.test(i.path) && !/(^|\.)extensions\./.test(i.path)
        && !FORBIDDEN_KEYS.has(i.path.slice(i.path.lastIndexOf('.') + 1)))
      .map((i) => i.path.replace(/\[\d+\]/g, '[]')))];
    issues.unshift({ path: 'version', code: 'newer-revision', severity: 'warning',
      message: ImportMessages.newerRevision(String(input.version), knownRevision, ignored), from: input.version, to: `2.${knownRevision}` });
  }
  budgetIssues(sections, exportLimits, push);

  return {
    ok: true,
    project: {
      version: `2.${knownRevision}`, format: FORMAT, ...(projectBlock ? { project: projectBlock } : {}), sections,
      mesh_mode: meshMode, ...(pivot ? { pivot } : {}), uv, display, panel_id_style: panelIdStyle, camera, props,
      assets: kept, extensions,
    },
    issues,
  };
}
