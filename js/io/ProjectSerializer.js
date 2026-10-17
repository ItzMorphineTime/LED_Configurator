/**
 * @module io/ProjectSerializer
 * Project JSON v1: the writer of the two legacy JSON documents (the 'file' download of Export JSON and the 'zip'
 * copy inside Export All ZIP) and the reader of imported documents. The reader is the version-dispatch seam: since
 * 08 P2-3b (B-L8 fixed) it detects the version, migrates a v1 document with the legacy `||` defaults and validates it
 * (io/ProjectMigrations, io/ProjectValidator; spec 07 4.6, 4.7), so an import is corrected and reported, or refused
 * atomically, never accepted raw.
 * Legacy source: index.html@cd3fd3f 4942-4965 (exportJSON builder), 4499-4519 (exportZIP builder),
 * 4974-4988 (importJSON section mapping, now io/ProjectMigrations.migrateV1toV2).
 * Layer: io (may import domain, geometry, legacy; THREE-free and DOM-free; the palette is injected).
 */

import { detectVersion, migrateV1toV2 } from './ProjectMigrations.js';
import { validateProject } from './ProjectValidator.js';

/** Writes and reads the project JSON (schema v1). */
export class ProjectSerializer {
  /** @type {{sectionColors: string[], legacySectionColors?: string[]}} */
  #palette;

  /**
   * Side effects: none.
   * @param {{palette: {sectionColors: string[], legacySectionColors?: string[]}}} deps  the theme palette
   *   (Theme.Palette); a v1 section without a colour gets legacySectionColors[i % 8] (06 T7, 4.3: the legacy global
   *   `sectionColors` of 1379-1382, so an old file looks as authored), or sectionColors without a legacy list
   */
  constructor({ palette }) {
    this.#palette = palette;
  }

  /**
   * Builds the JSON document of the project (call JSON.stringify(result, null, 2) to get the legacy file text).
   * One explicit object literal, so the key order is exactly the legacy one:
   *   'file' (Export JSON, 4943-4963): curvature carries `angle_offset_degrees: s.angleOffset || 0`;
   *   'zip'  (Export All ZIP, 4499-4519): since 08 P2-6a (B-M3 fixed) the 'file' document plus
   *          `texture_file: 'textures/' + textureNames[i]` as the last key of each section, or null where textureNames[i] is
   *          null (its texture is not in the ZIP, 08 P2-1c). The names are PanelNaming.textureFileNames (08 P2-6b, B-L14
   *          fixed: unique), computed once by the caller for the ZIP entries, this document and the MTL. Legacy's own
   *          copy dropped angle_offset_degrees.
   * Field values are copied raw (imported strings and NaN stay as they are; JSON.stringify writes NaN as null).
   * Ports: index.html@cd3fd3f lines 4943-4963 ('file') and 4499-4519 ('zip').
   * Side effects: none.
   * @param {import('../domain/Project.js').Project} project  reads project.wall.sections and project.meshMode
   * @param {{variant?: 'file'|'zip', textureNames?: (string|null)[]|null}} [options]  textureNames: required by 'zip'
   *   (one entry per section: a file name of the ZIP's textures folder, or null for a texture left out)
   * @returns {object} the plain JSON document
   * @throws {TypeError} 'zip' variant without one textureNames entry per section; RangeError for an unknown variant
   */
  write(project, { variant = 'file', textureNames = null } = {}) {
    // LEGACY(B-L31): v1 saves only sections, mesh_mode and totals (no camera, props, panel-ID styling, logos or
    // display toggles), although the legacy README promised the full project state (README.md now lists what v1 saves).
    const wallSections = project.wall.sections;
    const meshMode = project.meshMode;
    switch (variant) {
      case 'file':
        return ProjectSerializer.#fileDocument(wallSections, meshMode);
      case 'zip':
        if (!Array.isArray(textureNames) || textureNames.length !== wallSections.length) {
          throw new TypeError("ProjectSerializer.write: the 'zip' variant needs one textureNames entry per section");
        }
        return ProjectSerializer.#zipDocument(wallSections, meshMode, textureNames);
      default:
        throw new RangeError(`Unknown ProjectSerializer variant ${JSON.stringify(variant)}`);
    }
  }

  /**
   * The Export JSON document, verbatim 4943-4963.
   * @param {import('../domain/WallSection.js').WallSection[]} wallSections
   * @param {*} meshMode
   * @returns {object}
   */
  static #fileDocument(wallSections, meshMode) {
    const exportData = {
      version: '1.0',
      sections: wallSections.map((s, i) => ({
        name: s.name || `Wall ${i + 1}`,
        id: s.id,
        panel: { columns: s.panelCols, rows: s.panelRows, width_mm: s.panelWidth, height_mm: s.panelHeight },
        led_resolution: { x: s.ledX, y: s.ledY, pixel_pitch_mm: parseFloat((s.panelWidth / s.ledX).toFixed(2)) },
        curvature: {
          type: s.curveIntensity === 0 ? 'flat' : (s.curveIntensity > 0 ? 'concave' : 'convex'),
          angle_degrees: s.curveIntensity,
          angle_offset_degrees: s.angleOffset || 0
        },
        color: s.color
      })),
      mesh_mode: meshMode,
      totals: {
        sections: wallSections.length,
        total_panels: wallSections.reduce((sum, s) => sum + s.panelCols * s.panelRows, 0),
        total_pixels: wallSections.reduce((sum, s) => sum + s.panelCols * s.panelRows * s.ledX * s.ledY, 0)
      }
    };
    return exportData;
  }

  /**
   * The ZIP's JSON document (08 P2-6a, B-M3 fixed): the 'file' document of #fileDocument (one literal, so the two
   * copies can no longer drift: legacy 4499-4519 built its own copy without angle_offset_degrees, and re-importing it
   * reset every section offset) plus `texture_file` as the last key of each section: `textures/${textureNames[i]}`, or
   * null where textureNames[i] is null (a texture the ZIP left out, 08 P2-1c).
   * @param {import('../domain/WallSection.js').WallSection[]} wallSections
   * @param {*} meshMode
   * @param {(string|null)[]} textureNames  PanelNaming.textureFileNames, with null for a texture left out
   * @returns {object}
   */
  static #zipDocument(wallSections, meshMode, textureNames) {
    const jsonData = ProjectSerializer.#fileDocument(wallSections, meshMode);
    jsonData.sections.forEach((section, i) => {
      section.texture_file = textureNames[i] === null ? null : `textures/${textureNames[i]}`;
    });
    return jsonData;
  }

  /**
   * Reads a parsed JSON document (the value of JSON.parse) through the import pipeline of 08 4.3 (P2-3b; 07 5.5.1):
   * `detectVersion` (07 4.6: not a project, a newer version or no `sections` list is an error), then for a v1 document
   * `migrateV1toV2` (the legacy `||` defaults; a missing colour from `palette.legacySectionColors ?? sectionColors`,
   * 06 4.3) and `validateProject` over the migrated wall keys, with the same colour list as the default of an invalid
   * colour (07 4.3). A v1 import is wall-only (`scope: 'wall'`): the caller replaces the sections and, when
   * `project.mesh_mode` is not null, the mesh mode, and keeps everything else.
   * Before 08 P2-13e every version 2.x and above is refused (newer-version, M-IMP-4b).
   * Ports: index.html@cd3fd3f lines 4975-4988 (the `data.sections` guard and the `||` mapping, now in migrateV1toV2).
   * Side effects: none (never throws for a JSON value; never writes `data`).
   * @param {*} data  the parsed document
   * @param {{exportLimits?: {maxSide: number, maxArea: number}}} [options]  passed to the validator (07 signature;
   *   unused in Phase 2, which raises no `budget` warning)
   * @returns {{ok: boolean, project: {sections: object[], mesh_mode: string|null}|null,
   *            issues: import('./ProjectValidator.js').Issue[], sourceVersion: 1|null, scope: 'wall'}}
   *   ok === false (some issue has severity 'error') => project === null; sourceVersion is null when detection failed
   */
  read(data, { exportLimits } = {}) {
    const detected = detectVersion(data);
    if (detected.error) return { ok: false, project: null, issues: [detected.error], sourceVersion: null, scope: 'wall' };
    const migrated = migrateV1toV2(data, { palette: this.#palette });
    const colors = this.#palette.legacySectionColors ?? this.#palette.sectionColors;
    const result = validateProject({ sections: migrated.wall.sections, mesh_mode: migrated.wall.mesh_mode },
      { palette: { sectionColors: colors }, exportLimits });
    return { ok: result.ok, project: result.project, issues: [...migrated.issues, ...result.issues], sourceVersion: 1, scope: 'wall' };
  }
}
