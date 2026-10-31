/**
 * @module io/ProjectSerializer
 * The project file: the writer of the two JSON documents (the 'file' download of Export JSON and the 'zip' copy inside
 * Export All ZIP) and the reader of imported documents. Since 08 P2-13e (B-L31 fixed) both variants are project file
 * v2 (spec 07 4.2 in 07's key order, the Phase-2 subset of 08 4.6): the v1 keys unchanged (so a v1 reader that ignores
 * unknown keys reads the same wall, 07 C1) plus the mesh mode, display, panel-ID style, camera, props, the logo assets
 * and the extensions, with `"format": "morph-led-project"` and `"version": "2.<KNOWN_REVISION>"`. Feature keys are
 * absent until their feature's landing commit adds them (07 C39): see io/ProjectSchema's extension protocol.
 * The reader is the version-dispatch seam (08 P2-3b, B-L8 fixed): it detects the version, migrates a v1 document with
 * the legacy `||` defaults and validates it (wall scope), or validates a v2 document whole (full scope); an import is
 * corrected and reported, or refused atomically, never accepted raw.
 * Legacy source: index.html@cd3fd3f 4942-4965 (exportJSON builder), 4499-4519 (exportZIP builder),
 * 4974-4988 (importJSON section mapping, now io/ProjectMigrations.migrateV1toV2).
 * Layer: io (may import domain, geometry, legacy; THREE-free and DOM-free; the palette is injected).
 */

import { detectVersion, migrateV1toV2 } from './ProjectMigrations.js';
import { validateProject } from './ProjectValidator.js';
import {
  FORMAT, VERSION, KNOWN_REVISION, DISPLAY_ROWS, PANEL_ID_STYLE_ROWS, CAMERA_ROWS, PROP_ROWS, PROPS, blockFromDomain,
} from './ProjectSchema.js';

/**
 * A fresh deep copy of a JSON value (the extensions; never a reference into the model).
 * @param {*} v
 * @returns {*}
 */
const cloneJson = (v) => JSON.parse(JSON.stringify(v ?? {}));

/** Writes and reads the project file (schema v2; v1 files are read). */
export class ProjectSerializer {
  /** @type {{sectionColors: string[], legacySectionColors?: string[]}} */
  #palette;

  /**
   * Side effects: none.
   * @param {{palette: {sectionColors: string[], legacySectionColors?: string[]}}} deps  the theme palette
   *   (Theme.Palette); a v1 section without a colour gets legacySectionColors[i % 8] (06 T7, 4.3: the legacy global
   *   `sectionColors` of 1379-1382, so an old file looks as authored), or sectionColors without a legacy list; a v2
   *   section without a colour gets sectionColors[i % 8] (07 4.3)
   */
  constructor({ palette }) {
    this.#palette = palette;
  }

  /**
   * Builds the JSON document of the project (call JSON.stringify(result, null, 2) to get the file text; no trailing
   * newline, no timestamp, 07 C10). Since 08 P2-13e (B-L31 fixed) the v2 document of 07 4.2 in its key order:
   *   version, format, sections[] (name, id, panel, led_resolution with the derived pixel_pitch_mm, curvature with the
   *   derived type, color, logo, ['zip': texture_file], extensions), mesh_mode, display, panel_id_style, camera,
   *   props {person, car}, assets[] (one inline logo per distinct image, in order of first use), totals (derived),
   *   extensions.
   *   'zip' (Export All ZIP): each section's `texture_file` is `'textures/' + textureNames[i]`, or null where
   *   textureNames[i] is null (its texture is not in the ZIP, 08 P2-1c). The names are PanelNaming.textureFileNames
   *   (08 P2-6b), computed once by the caller for the ZIP entries, this document and the MTL.
   * Section values are the model's (validated on import, normalised by the card rules); a section without a name is
   * written as `Wall ${i + 1}` (the v1 fallback, which the validator would apply on read). A logo is written only
   * when its entry holds a stored image (LogoLoader's dataUri and assetId; 08 P2-13a).
   * Ports: index.html@cd3fd3f lines 4943-4963 ('file') and 4499-4519 ('zip'): the v1 keys and their derived values.
   * Side effects: none.
   * @param {import('../domain/Project.js').Project} project
   * @param {{variant?: 'file'|'zip', textureNames?: (string|null)[]|null}} [options]  textureNames: required by 'zip'
   *   (one entry per section: a file name of the ZIP's textures folder, or null for a texture left out)
   * @returns {object} the plain JSON document
   * @throws {TypeError} 'zip' variant without one textureNames entry per section; RangeError for an unknown variant
   */
  write(project, { variant = 'file', textureNames = null } = {}) {
    const wallSections = project.wall.sections;
    if (variant === 'zip') {
      if (!Array.isArray(textureNames) || textureNames.length !== wallSections.length) {
        throw new TypeError("ProjectSerializer.write: the 'zip' variant needs one textureNames entry per section");
      }
    } else if (variant !== 'file') {
      throw new RangeError(`Unknown ProjectSerializer variant ${JSON.stringify(variant)}`);
    }

    // The logo assets: one per distinct stored image, in order of first use (07 4.5).
    const assets = [];
    const assetIds = new Set();
    const logoOf = (s) => {
      const e = project.logos.get(s.id);
      if (!e || !e.image || typeof e.dataUri !== 'string' || typeof e.assetId !== 'string') return null;
      if (!assetIds.has(e.assetId)) {
        assetIds.add(e.assetId);
        assets.push({ id: e.assetId, kind: 'logo', name: e.name ?? '', mime: e.mime, bytes: e.bytes, sha256: e.sha256,
          storage: 'inline', data_uri: e.dataUri });
      }
      return { asset_id: e.assetId, position: e.position, scale: e.scale };
    };

    const sections = wallSections.map((s, i) => {
      const out = {
        name: s.name || `Wall ${i + 1}`,
        id: s.id,
        panel: { columns: s.panelCols, rows: s.panelRows, width_mm: s.panelWidth, height_mm: s.panelHeight },
        led_resolution: { x: s.ledX, y: s.ledY, pixel_pitch_mm: parseFloat((s.panelWidth / s.ledX).toFixed(2)) },
        curvature: {
          type: s.curveIntensity === 0 ? 'flat' : (s.curveIntensity > 0 ? 'concave' : 'convex'),
          angle_degrees: s.curveIntensity,
          angle_offset_degrees: s.angleOffset || 0,
        },
        color: s.color,
        logo: logoOf(s),
      };
      if (variant === 'zip') out.texture_file = textureNames[i] === null ? null : `textures/${textureNames[i]}`;
      out.extensions = cloneJson(s.extensions);
      return out;
    });

    const props = {};
    for (const p of PROPS) props[p.key] = blockFromDomain(PROP_ROWS, project[p.key]);

    return {
      version: VERSION,
      format: FORMAT,
      sections,
      mesh_mode: project.meshMode,
      display: blockFromDomain(DISPLAY_ROWS, project.display),
      panel_id_style: blockFromDomain(PANEL_ID_STYLE_ROWS, project.panelIdStyle),
      camera: blockFromDomain(CAMERA_ROWS, project.camera),
      props,
      assets,
      totals: {
        sections: wallSections.length,
        total_panels: wallSections.reduce((sum, s) => sum + s.panelCols * s.panelRows, 0),
        total_pixels: wallSections.reduce((sum, s) => sum + s.panelCols * s.panelRows * s.ledX * s.ledY, 0),
      },
      extensions: cloneJson(project.extensions),
    };
  }

  /**
   * Reads a parsed JSON document (the value of JSON.parse) through the import pipeline of 08 4.3 (P2-3b; 07 5.5.1):
   * `detectVersion` (07 4.6: not a project, a newer major version or no `sections` list is an error), then
   *  - v1: `migrateV1toV2` (the legacy `||` defaults; a missing colour from `palette.legacySectionColors ??
   *    sectionColors`, 06 4.3) and `validateProject` over the migrated wall keys, with the same colour list as the
   *    default of an invalid colour (07 4.3). A v1 import is wall-only (`scope: 'wall'`): the caller replaces the
   *    sections and, when `project.mesh_mode` is not null, the mesh mode, and keeps everything else.
   *  - v2 (08 P2-13e): `validateProject` on the v2 path with the file's revision (a newer one gives the newer-revision
   *    warning), the v2 palette for a missing colour; `scope: 'full'`: the caller restores everything (08 6.17).
   * Ports: index.html@cd3fd3f lines 4975-4988 (the `data.sections` guard and the `||` mapping, now in migrateV1toV2).
   * Side effects: none (never throws for a JSON value; never writes `data`).
   * @param {*} data  the parsed document
   * @param {{exportLimits?: {maxSide: number, maxArea: number}}} [options]  passed to the validator (07 signature;
   *   unused in Phase 2, which raises no `budget` warning)
   * @returns {{ok: boolean, project: object|null, issues: import('./ProjectValidator.js').Issue[], sourceVersion: 1|2|null,
   *            scope: 'wall'|'full'}}
   *   ok === false (some issue has severity 'error') => project === null; sourceVersion is null when detection failed
   */
  read(data, { exportLimits } = {}) {
    const detected = detectVersion(data);
    if (detected.error) return { ok: false, project: null, issues: [detected.error], sourceVersion: null, scope: 'wall' };
    if (detected.kind === 'v2') {
      const result = validateProject(data, { palette: { sectionColors: this.#palette.sectionColors },
        knownRevision: KNOWN_REVISION, revision: detected.revision, exportLimits });
      return { ok: result.ok, project: result.project, issues: result.issues, sourceVersion: 2, scope: 'full' };
    }
    const migrated = migrateV1toV2(data, { palette: this.#palette });
    const colors = this.#palette.legacySectionColors ?? this.#palette.sectionColors;
    const result = validateProject({ sections: migrated.wall.sections, mesh_mode: migrated.wall.mesh_mode },
      { palette: { sectionColors: colors }, exportLimits });
    return { ok: result.ok, project: result.project, issues: [...migrated.issues, ...result.issues], sourceVersion: 1, scope: 'wall' };
  }
}
