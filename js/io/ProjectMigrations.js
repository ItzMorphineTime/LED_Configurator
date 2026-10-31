/**
 * @module io/ProjectMigrations
 * Version detection and the v1 migration of an imported document (spec 07 4.6 and 6.9; 08 P2-3b, the wall subset of
 * 07 D3): `detectVersion` is the only dispatch, and `migrateV1toV2` reproduces the legacy `||` defaults of the v1 import
 * exactly (so a valid v1 file gives the same wall as the legacy import, with no correction), producing the v2-shaped
 * wall keys that the validator then checks. Since 08 P2-13e a "2.<m>" version dispatches to the v2 reader (any revision m;
 * the validator reports a newer one) and only a major version above 2 is refused as newer (M-IMP-4b).
 * Legacy source: index.html@cd3fd3f 4975-4988 (the `data.sections` guard and the `||` mapping).
 * Layer: io (pure; may import domain, geometry, legacy).
 */

import { FORMAT } from './ProjectSchema.js';

/** `version` strings of the form "<major>.<minor>" (07 4.6). */
const VERSION_RE = /^(\d+)\.(\d+)$/;

/** The import error texts of 08 3.3 that detection and validation produce (issue.message). */
export const ImportMessages = Object.freeze({
  /** M-IMP-4a */
  notAProject: 'Import failed: this is not an LED wall project file.',
  /** M-IMP-4b @param {string} version @returns {string} */
  newerVersion: (version) => `Import failed: this project was saved by a newer version of the app (version ${version}).`,
  /** M-IMP-1 */
  noSectionsList: 'Import failed: the file does not contain a "sections" list.',
  /** M-IMP-2 */
  noSections: 'Import failed: the file contains no wall sections.',
  /** M-IMP-3 @param {number} n @param {number} max @returns {string} */
  tooManySections: (n, max) => `Import failed: ${n} sections is more than the maximum of ${max}.`,
  /** the `migrated` info (not listed in M-IMP-5) */
  migrated: 'Converted from a version 1 project file.',
  /** the `newer-revision` warning (07 4.4 rule 4; listed in M-IMP-5) */
  newerRevision: 'Some settings were saved by a newer version and were ignored.',
});

/**
 * A plain object (07 6.7): what JSON.parse gives for `{...}`; arrays, null and class instances are not.
 * Side effects: none.
 * @param {*} v
 * @returns {boolean}
 */
export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
}

/**
 * An issue of the 07 4.7 shape.
 * @param {string} path  v2 path ('' for the document)
 * @param {string} code
 * @param {'info'|'warning'|'error'} severity
 * @param {string} message
 * @returns {{path: string, code: string, severity: string, message: string}}
 */
function issue(path, code, severity, message) {
  return { path, code, severity, message };
}

/**
 * Detects the schema of a parsed document, in the order of 07 4.6: not a plain object -> unsupported-format;
 * a `format` key other than "morph-led-project" -> unsupported-format; a `version` string "N.M" with N > 2 ->
 * newer-version, with N = 2 -> v2 with revision M (08 P2-13e); a `sections` array -> v1 (the version may be "1.0",
 * absent or anything else: legacy ignored it); otherwise no-sections (legacy ignored such a file silently, V-6).
 * Side effects: none.
 * @param {*} data  the value of JSON.parse
 * @returns {{kind: 'v1'} | {kind: 'v2', revision: number} |
 *           {error: {path: string, code: string, severity: 'error', message: string}}}
 */
export function detectVersion(data) {
  if (!isPlainObject(data)) return { error: issue('', 'unsupported-format', 'error', ImportMessages.notAProject) };
  if (Object.prototype.hasOwnProperty.call(data, 'format') && data.format !== FORMAT) {
    return { error: issue('format', 'unsupported-format', 'error', ImportMessages.notAProject) };
  }
  const version = data.version;
  if (typeof version === 'string') {
    const m = VERSION_RE.exec(version);
    if (m && Number(m[1]) > 2) return { error: issue('version', 'newer-version', 'error', ImportMessages.newerVersion(version)) };
    if (m && Number(m[1]) === 2) return { kind: 'v2', revision: Number(m[2]) };
  }
  if (Array.isArray(data.sections)) return { kind: 'v1' };
  return { error: issue('sections', 'no-sections', 'error', ImportMessages.noSectionsList) };
}

/**
 * The v1 migration (07 6.9): every section mapped with the legacy `||` defaults (so `0`, `''` and `null` take the
 * default silently, exactly as the legacy import did, V-3) into the v2 section shape; a section entry that is not a
 * plain object is replaced by `{}` with a `defaulted` warning (legacy threw on it); `mesh_mode` is kept iff truthy
 * (`null` keeps the current mode). The palette fills a missing colour: `palette.legacySectionColors ??
 * palette.sectionColors` (06 4.3, 07 C11), so an old file looks as authored. No value is validated here.
 * Side effects: none (never writes `data`).
 * @param {{sections: Array<*>, mesh_mode?: *}} data  a document detectVersion called v1
 * @param {{palette: {sectionColors: ReadonlyArray<string>, legacySectionColors?: ReadonlyArray<string>}}} deps
 * @returns {{scope: 'wall', wall: {sections: object[], mesh_mode: *}, issues: object[]}}  issues: the `migrated` info,
 *   then one `defaulted` warning per non-object section
 */
export function migrateV1toV2(data, { palette }) {
  const colors = palette.legacySectionColors ?? palette.sectionColors;
  const issues = [issue('', 'migrated', 'info', ImportMessages.migrated)];
  const sections = data.sections.map((s0, i) => {
    let s = s0;
    if (!isPlainObject(s0)) {
      s = {};
      issues.push({ ...issue(`sections[${i}]`, 'defaulted', 'warning',
        `Section ${i + 1} "Wall ${i + 1}": not a section, replaced by a default section`), from: s0, to: {} });
    }
    return {
      name: s.name || `Wall ${i + 1}`,
      id: s.id !== undefined ? s.id : i,
      panel: {
        columns: s.panel?.columns || 5,
        rows: s.panel?.rows || 3,
        width_mm: s.panel?.width_mm || 500,
        height_mm: s.panel?.height_mm || 500,
      },
      led_resolution: { x: s.led_resolution?.x || 32, y: s.led_resolution?.y || 32 },
      curvature: {
        angle_degrees: s.curvature?.angle_degrees || 0,
        angle_offset_degrees: s.curvature?.angle_offset_degrees || 0,
      },
      color: s.color || colors[i % colors.length],
      logo: null,
    };
  });
  return { scope: 'wall', wall: { sections, mesh_mode: data.mesh_mode || null }, issues };
}
