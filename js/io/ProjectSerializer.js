/**
 * @module io/ProjectSerializer
 * Project JSON v1: the writer of the two legacy JSON documents (the 'file' download of Export JSON and the 'zip'
 * copy inside Export All ZIP) and the reader of imported documents. The reader is the version-dispatch seam:
 * Phase 1 reads every document as v1, exactly like legacy (which ignores `version`).
 * Legacy source: index.html@cd3fd3f 4942-4965 (exportJSON builder), 4499-4519 (exportZIP builder),
 * 4974-4988 (importJSON section mapping).
 * Layer: io (may import domain, geometry, legacy; THREE-free and DOM-free; the palette is injected).
 */

import { WallSection } from '../domain/WallSection.js';
import { zipTextureFileName } from '../geometry/PanelNaming.js';
import { Strategies, unsupportedStrategy } from '../legacy/LegacyCompat.js';

/**
 * The parsed content of an imported document.
 * @typedef {{sections: WallSection[], meshMode: *}} ParsedProject  meshMode is the raw `data.mesh_mode` (may be
 *   undefined or any JSON value; WallController.applyImport applies it only when truthy)
 */

/**
 * The 'zip' texture_file value: the path, or null when the ZIP left that texture out (08 P2-1c, B-L4). The path is
 * computed first in both cases, so a numeric imported name keeps throwing `name.replace is not a function`.
 * @param {string} path
 * @param {boolean[]|null} skipped
 * @param {number} i
 * @returns {string|null}
 */
function unlessSkipped(path, skipped, i) {
  return skipped && skipped[i] ? null : path;
}

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
   * Two explicit object literals, so the key order is exactly the legacy one:
   *   'file' (Export JSON, 4943-4963): curvature carries `angle_offset_degrees: s.angleOffset || 0`;
   *   'zip'  (Export All ZIP, 4499-4519): no angle offset (B-M3, selected through
   *          Strategies.zipJsonIncludesAngleOffset), plus `texture_file: textures/${zipTextureFileName(s, i)}`, or null
   *          for a section whose `skipped[i]` is true (its texture is not in the ZIP, 08 P2-1c; the name is still
   *          computed, so a numeric name keeps throwing).
   * Field values are copied raw (imported strings and NaN stay as they are; JSON.stringify writes NaN as null).
   * Ports: index.html@cd3fd3f lines 4943-4963 ('file') and 4499-4519 ('zip').
   * Side effects: none.
   * @param {import('../domain/Project.js').Project} project  reads project.wall.sections and project.meshMode
   * @param {{variant?: 'file'|'zip', skipped?: boolean[]|null}} [options]  skipped: 'zip' only (08 P2-1c)
   * @returns {object} the plain JSON document
   * @throws {TypeError} 'zip' variant with a non-string truthy section name: `name.replace is not a function`
   *   (sanitizeFilename, as legacy); RangeError for an unknown variant
   */
  write(project, { variant = 'file', skipped = null } = {}) {
    // LEGACY(B-L31): v1 saves only sections, mesh_mode and totals (no camera, props, panel-ID styling, logos or
    // display toggles), although the legacy README promised the full project state (README.md now lists what v1 saves).
    const wallSections = project.wall.sections;
    const meshMode = project.meshMode;
    switch (variant) {
      case 'file':
        return ProjectSerializer.#fileDocument(wallSections, meshMode);
      case 'zip':
        switch (Strategies.zipJsonIncludesAngleOffset) {
          case false:
            // LEGACY(B-M3): the ZIP's copy of the config drifted from Export JSON and drops angle_offset_degrees,
            // so re-importing the ZIP JSON resets every section offset to 0.
            return ProjectSerializer.#zipDocument(wallSections, meshMode, skipped);
          default:
            throw unsupportedStrategy('zipJsonIncludesAngleOffset', Strategies.zipJsonIncludesAngleOffset);
        }
      default:
        throw new RangeError(`Unknown ProjectSerializer variant ${JSON.stringify(variant)}`);
    }
  }

  /**
   * The Export JSON document, verbatim 4943-4963.
   * @param {WallSection[]} wallSections
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
   * The ZIP's JSON document, verbatim 4499-4519 (the inner sanitizeFilename of 4496 is PanelNaming's, reached
   * through zipTextureFileName; duplicate names collide, B-L14, tagged at PanelNaming.zipTextureFileName).
   * @param {WallSection[]} wallSections
   * @param {*} meshMode
   * @param {boolean[]|null} skipped  texture_file is null where skipped[i] (08 P2-1c)
   * @returns {object}
   */
  static #zipDocument(wallSections, meshMode, skipped) {
    const jsonData = {
      version: '1.0',
      sections: wallSections.map((s, i) => ({
        name: s.name || `Wall ${i + 1}`,
        id: s.id,
        panel: { columns: s.panelCols, rows: s.panelRows, width_mm: s.panelWidth, height_mm: s.panelHeight },
        led_resolution: { x: s.ledX, y: s.ledY, pixel_pitch_mm: parseFloat((s.panelWidth / s.ledX).toFixed(2)) },
        curvature: {
          type: s.curveIntensity === 0 ? 'flat' : (s.curveIntensity > 0 ? 'concave' : 'convex'),
          angle_degrees: s.curveIntensity
        },
        color: s.color,
        texture_file: unlessSkipped(`textures/${zipTextureFileName(s, i)}`, skipped, i)
      })),
      mesh_mode: meshMode,
      totals: {
        sections: wallSections.length,
        total_panels: wallSections.reduce((sum, s) => sum + s.panelCols * s.panelRows, 0),
        total_pixels: wallSections.reduce((sum, s) => sum + s.panelCols * s.panelRows * s.ledX * s.ledY, 0)
      }
    };
    return jsonData;
  }

  /**
   * Reads a parsed JSON document (the value of JSON.parse). This is the version-dispatch seam: Phase 1 reads
   * EVERY document as v1, because legacy ignores `version`. A later schema adds its reader here, dispatching
   * only AFTER the `data.sections` guard has been evaluated (reading `data.version` first would change the
   * TypeError message for `null`).
   * Ports: index.html@cd3fd3f lines 4975-4988.
   * Side effects: none.
   * @param {*} data  the parsed document
   * @returns {ParsedProject|null} null when `data.sections` is not a truthy array (legacy: silently ignored)
   * @throws {TypeError} when data is null or undefined (`Cannot read properties of null (reading 'sections')`),
   *   or when a section entry is null; the import's try/catch turns it into the legacy alert
   */
  read(data) {
    return this.#readV1(data);
  }

  /**
   * Schema v1 (and, in Phase 1, every other version): verbatim 4975-4988.
   * @param {*} data
   * @returns {ParsedProject|null}
   */
  #readV1(data) {
    if (data.sections && Array.isArray(data.sections)) {
      switch (Strategies.importValidation) {
        case 'none':
          break;
        default:
          throw unsupportedStrategy('importValidation', Strategies.importValidation);
      }
      // 06 T7 (4.3, Q20; spec 07 C11 carries the rule into migrateV1toV2): the Phase-1 palette fills missing colours.
      const sectionColors = this.#palette.legacySectionColors ?? this.#palette.sectionColors;
      // LEGACY(B-L8): no validation and no coercion: imported strings, NaN or duplicate ids, empty walls and unknown
      // mesh modes are accepted; `|| default` turns 0 and '' into the default. (Names are escaped where they are
      // rendered since 08 P2-3a, B-M4.)
      const sections = data.sections.map((s, i) => new WallSection({
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
        color: s.color || sectionColors[i % sectionColors.length]
      }));
      return { sections, meshMode: data.mesh_mode };
    }
    return null;
  }
}
