/**
 * @module io/ProjectValidator
 * The import validator (spec 07 4.7, 6.7, 6.8; 08 4.3, P2-3b: the wall subset of 07 D2). It checks the wall keys of a
 * v2-shaped document (`sections`, `mesh_mode`), corrects what it can (coerced, rounded, clamped, defaulted, sanitized,
 * truncated, reassigned-id warnings, 08 3.3 correction lines) and refuses what it cannot (no sections, more than
 * `Wall.MAX_SECTIONS`). It never spreads or assigns input objects: the result is built field by field from
 * `ProjectSchema`, so an imported document can neither inject markup through a colour nor pollute a prototype.
 * Its ranges are `WallSection.LIMITS`, the card rules' own (08 P2-8a), and its name rule is `sanitizeText`, the rule
 * of `WallSection.setName`, so every value the UI can produce passes unchanged (reachability, 08 criterion 16).
 * Legacy source: none (legacy validated nothing, B-L8).
 * Layer: io (pure; may import domain, geometry, legacy).
 */

import { clamp, roundInt, stripControls, truncateUnits, isValidSectionId, createIdAllocator } from '../domain/rules.js';
import { LIMITS, MESH_MODES, SECTION_NUMBER_ROWS, SECTION_GROUP_LABELS, SECTION_LABELS } from './ProjectSchema.js';
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
 * (defaulted, `Mesh mode: <from> → "combined"`).
 *
 * Idempotent: the project it returns validates again with no issue. Never reads or writes anything but the input.
 * Side effects: none.
 * @param {*} input  `{ sections, mesh_mode }`
 * @param {{limits?: typeof LIMITS, palette?: {sectionColors: ReadonlyArray<string>}, knownRevision?: number,
 *          exportLimits?: {maxSide: number, maxArea: number}}} [options]
 *   palette.sectionColors: the default colour of section i is sectionColors[i % length] (the serializer passes the
 *   legacy list for a v1 file, 07 4.3); knownRevision and exportLimits are accepted for the 07 signature and unused in
 *   the wall subset (no v2 revision is read before 08 P2-13e, and Phase 2 raises no `budget` warning, 08 4.3)
 * @returns {{ok: boolean, project: {sections: object[], mesh_mode: string|null}|null, issues: Issue[]}}
 */
export function validateProject(input, { limits = LIMITS, palette = { sectionColors: ['#d9d9d6'] } } = {}) {
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
  return { ok: true, project: { sections, mesh_mode: meshMode }, issues };
}

/**
 * One section: a fresh object in the v2 key order. Its correction lines are added to `issues` after its name is known,
 * so every line names the corrected section.
 * @param {*} s0
 * @param {number} i
 * @param {typeof LIMITS} limits
 * @param {string} defaultColor
 * @param {Issue[]} issues
 * @returns {object}
 */
function validateSection(s0, i, limits, defaultColor, issues) {
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

  for (const p of pending) {
    const line = p.text ?? `${p.label} ${formatValue(p.from)} → ${formatValue(p.to)}`;
    issues.push({ path: p.path, code: p.code, severity: 'warning', message: `Section ${i + 1} "${name}": ${line}`, from: p.from, to: p.to });
  }
  return {
    name,
    id: s.id !== undefined ? s.id : i,   // a missing id takes the index, silently (07 6.8; the v1 migration did the same)
    panel: { columns: values.panelCols, rows: values.panelRows, width_mm: values.panelWidth, height_mm: values.panelHeight },
    led_resolution: { x: values.ledX, y: values.ledY },
    curvature: { angle_degrees: values.curveIntensity, angle_offset_degrees: values.angleOffset },
    color,
    logo: null,
  };
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
