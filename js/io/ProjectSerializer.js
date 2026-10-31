/**
 * @module io/ProjectSerializer
 * The project file: the writer of the two JSON documents (the 'file' download of Export JSON and the 'zip' copy inside
 * Export All ZIP) and the reader of imported documents. Since 08 P2-13e (B-L31 fixed) both variants are project file
 * v2 (spec 07 4.2 in 07's key order, the Phase-2 subset of 08 4.6): the v1 keys unchanged (so a v1 reader that ignores
 * unknown keys reads the same wall, 07 C1) plus the mesh mode, display, panel-ID style, camera, props, the logo assets
 * and the extensions, with `"format": "morph-led-project"` and `"version": "2.<KNOWN_REVISION>"`. Feature keys are
 * absent until their feature's landing commit adds them (07 C39): see io/ProjectSchema's extension protocol. Revision 1
 * (M7a) adds the `generator` record (06 T8), the pivot and orientation with their derived resolution (03 T7), the
 * pivot-marker flag (03 T9), the UV settings, each section's UV transform and vertex edits, and the derived pixel maps
 * (04 UV-5c).
 * The reader is the version-dispatch seam (08 P2-3b, B-L8 fixed): it detects the version, migrates a v1 document with
 * the legacy `||` defaults and validates it (wall scope), or validates a v2 document whole (full scope); an import is
 * corrected and reported, or refused atomically, never accepted raw.
 * Legacy source: index.html@cd3fd3f 4942-4965 (exportJSON builder), 4499-4519 (exportZIP builder),
 * 4974-4988 (importJSON section mapping, now io/ProjectMigrations.migrateV1toV2).
 * Layer: io (may import domain, geometry, legacy; THREE-free and DOM-free; the palette is injected).
 */

import { computeWallLayout, resolvePivot } from '../geometry/WallLayout.js';
import { computeAtlas } from '../geometry/TextureAtlas.js';
import { pixelMapJson } from '../geometry/PixelMap.js';
import { detectVersion, migrateV1toV2 } from './ProjectMigrations.js';
import { validateProject } from './ProjectValidator.js';
import {
  FORMAT, VERSION, KNOWN_REVISION, DISPLAY_ROWS, PANEL_ID_STYLE_ROWS, CAMERA_ROWS, PROP_ROWS, PROPS, PROJECT_ROWS,
  blockFromDomain, assetZipPath,
} from './ProjectSchema.js';

/**
 * A fresh deep copy of a JSON value (the extensions; never a reference into the model).
 * @param {*} v
 * @returns {*}
 */
const cloneJson = (v) => JSON.parse(JSON.stringify(v ?? {}));

/** The writer's variants (07 4.2, 5.5.1): 08 P2-13e's 'file' and 'zip', 07 D4's 'history' and 'autosave'. */
export const VARIANTS = Object.freeze(['file', 'zip', 'history', 'autosave']);

/** The most data-URI characters an 'autosave' document inlines before its assets become 'missing' (07 4.2). */
export const MAX_INLINE_ASSET_BYTES = 1000000;

/** A copy of {x, y, z} in that key order. */
const xyz = (p) => ({ x: p.x, y: p.y, z: p.z });

/**
 * The derived blocks of a non-history document: each section's `pixel_map` and the top-level `atlas` (04 4.2,
 * PixelMap.pixelMapJson over the raw walk and computeAtlas; `atlas.texture_file` only when given) and the pivot's
 * `resolved_m` (03 4.2: the resolution of WallController.resolvePivotNow, layout frame, with the total yaw of 12.11;
 * null only for a non-finite layout).
 * @param {import('../domain/WallSection.js').WallSection[]} sections
 * @param {import('../domain/Wall.js').WallPivot} pivot
 * @param {string|null} atlasFile
 * @returns {{pixelMaps: object[], atlas: object, resolved: object|null}}
 */
function derivedBlocks(sections, pivot, atlasFile) {
  const layout = computeWallLayout(sections);
  const { sections: pixelMaps, atlas } = pixelMapJson(layout, computeAtlas(sections), { atlasFile });
  const r = resolvePivot(layout, pivot);
  const resolved = r === null ? null
    : { anchor: xyz(r.anchor), point: xyz(r.point), stage_origin: xyz(r.stageOrigin), yaw_deg: r.yawDeg };
  return { pixelMaps, atlas, resolved };
}

/** Writes and reads the project file (schema v2; v1 files are read). */
export class ProjectSerializer {
  /** @type {{sectionColors: string[], legacySectionColors?: string[]}} */
  #palette;
  /** @type {{name: string, version: string}|null} */
  #generator;

  /**
   * Side effects: none.
   * @param {{palette: {sectionColors: string[], legacySectionColors?: string[]},
   *          generator?: {name: string, version: string}|null}} deps  palette: the theme palette (Theme.Palette); a v1
   *   section without a colour gets legacySectionColors[i % 8] (06 T7, 4.3: the legacy global `sectionColors` of
   *   1379-1382, so an old file looks as authored), or sectionColors without a legacy list; a v2 section without a
   *   colour gets sectionColors[i % 8] (07 4.3). generator: the JSON generator record (06 T8, 07 C10, C62:
   *   {name: Brand.jsonGenerator.name, version: AppInfo.APP_VERSION}, injected by App), written as the second key of
   *   every non-history document; without one (tests, tools) no generator key is written
   */
  constructor({ palette, generator = null }) {
    this.#palette = palette;
    this.#generator = generator;
  }

  /**
   * Builds the JSON document of the project (call JSON.stringify(result, null, 2) to get the file text; no trailing
   * newline, no timestamp, 07 C10). Since 08 P2-13e (B-L31 fixed) the v2 document of 07 4.2 in its key order:
   *   version, [generator: {name, version}, the injected record (06 T8)], format, [project: name and notes, only while
   *   either differs from its default (07 D1)], sections[] (name, id, panel, led_resolution with the derived
   *   pixel_pitch_mm, curvature with the derived type, color, uv_transform (the full object, 04 4.2), uv_vertex_edits
   *   (UvVertexEdits.toJSON, [] for none or for edits made for another grid size), pixel_map (derived), logo, ['zip':
   *   texture_file], extensions), mesh_mode, pivot (WallPivot.toJSON plus the derived resolved_m), uv
   *   (UvSettings.toJSON), atlas (derived; 'zip': its texture_file when `atlasFile` is given), display (with the
   *   view-only show_pivot_marker), panel_id_style, camera, props {person, car}, assets[] (one inline logo per distinct
   *   image, in order of first use), totals (derived), extensions.
   *   'zip' (Export All ZIP): each section's `texture_file` is `'textures/' + textureNames[i]`, or null where
   *   textureNames[i] is null (its texture is not in the ZIP, 08 P2-1c). The names are PanelNaming.textureFileNames
   *   (08 P2-6b), computed once by the caller for the ZIP entries, this document and the MTL. Since 07 D6 each logo
   *   asset is `storage: 'zip'` with `path` = assetZipPath(id, mime) (`assets/<id>.<ext>`) instead of a data URI;
   *   the caller stores its bytes at that path.
   *   'history' (07 D4, 4.2: a snapshot of the session, never a file): no derived key (generator, pixel_pitch_mm,
   *   curvature.type, pixel_map, resolved_m, atlas, totals), no view-only key (the rows marked viewOnly:
   *   display.show_grid, display.show_pivot_marker) and each asset as `{id}` only (the image stays in the session's
   *   asset store).
   *   'autosave' (07 D4, 4.2): the 'file' document, except that when the inline assets together exceed
   *   `maxInlineAssetBytes` (characters of their data URIs) every asset is written as `storage: 'missing'`
   *   (metadata only).
   * Section values are the model's (validated on import, normalised by the card rules); a section without a name is
   * written as `Wall ${i + 1}` (the v1 fallback, which the validator would apply on read). A logo is written only
   * when its entry holds a stored image (LogoLoader's dataUri and assetId; 08 P2-13a). One writer for every variant;
   * no clock.
   * Ports: index.html@cd3fd3f lines 4943-4963 ('file') and 4499-4519 ('zip'): the v1 keys and their derived values.
   * Side effects: none.
   * @param {import('../domain/Project.js').Project} project
   * @param {{variant?: 'file'|'zip'|'history'|'autosave', textureNames?: (string|null)[]|null, atlasFile?: string|null,
   *          maxInlineAssetBytes?: number}} [options]  textureNames: required by 'zip' (one entry per section: a file
   *   name of the ZIP's textures folder, or null for a texture left out); atlasFile: 'zip' only, the archive path of the
   *   panel-ID atlas when it was written (04 4.2 atlas.texture_file); maxInlineAssetBytes: 'autosave' only (default
   *   1,000,000, 07 4.2)
   * @returns {object} the plain JSON document
   * @throws {TypeError} 'zip' variant without one textureNames entry per section; RangeError for an unknown variant
   */
  write(project, { variant = 'file', textureNames = null, atlasFile = null, maxInlineAssetBytes = MAX_INLINE_ASSET_BYTES } = {}) {
    const wallSections = project.wall.sections;
    if (variant === 'zip') {
      if (!Array.isArray(textureNames) || textureNames.length !== wallSections.length) {
        throw new TypeError("ProjectSerializer.write: the 'zip' variant needs one textureNames entry per section");
      }
    } else if (!VARIANTS.includes(variant)) {
      throw new RangeError(`Unknown ProjectSerializer variant ${JSON.stringify(variant)}`);
    }
    const history = variant === 'history';
    const derived = history ? null : derivedBlocks(wallSections, project.wall.pivot, variant === 'zip' ? atlasFile : null);

    // The logo assets: one per distinct stored image, in order of first use (07 4.5).
    const assets = [];
    const assetIds = new Set();
    const logoOf = (s) => {
      const e = project.logos.get(s.id);
      if (!e || !e.image || typeof e.dataUri !== 'string' || typeof e.assetId !== 'string') return null;
      if (!assetIds.has(e.assetId)) {
        assetIds.add(e.assetId);
        const meta = { id: e.assetId, kind: 'logo', name: e.name ?? '', mime: e.mime, bytes: e.bytes, sha256: e.sha256 };
        if (history) assets.push({ id: e.assetId });
        else if (variant === 'zip') assets.push({ ...meta, storage: 'zip', path: assetZipPath(e.assetId, e.mime) });
        else assets.push({ ...meta, storage: 'inline', data_uri: e.dataUri });
      }
      return { asset_id: e.assetId, position: e.position, scale: e.scale };
    };

    const sections = wallSections.map((s, i) => {
      const out = {
        name: s.name || `Wall ${i + 1}`,
        id: s.id,
        panel: { columns: s.panelCols, rows: s.panelRows, width_mm: s.panelWidth, height_mm: s.panelHeight },
        led_resolution: history ? { x: s.ledX, y: s.ledY }
          : { x: s.ledX, y: s.ledY, pixel_pitch_mm: parseFloat((s.panelWidth / s.ledX).toFixed(2)) },
        curvature: {
          ...(history ? {} : { type: s.curveIntensity === 0 ? 'flat' : (s.curveIntensity > 0 ? 'concave' : 'convex') }),
          angle_degrees: s.curveIntensity,
          angle_offset_degrees: s.angleOffset || 0,
        },
        color: s.color,
        uv_transform: s.uvTransform.toJSON(),
        uv_vertex_edits: s.uvVertexEdits && s.uvVertexEdits.matches(s.panelCols, s.panelRows) ? s.uvVertexEdits.toJSON() : [],
        ...(derived ? { pixel_map: derived.pixelMaps[i] } : {}),
        logo: logoOf(s),
      };
      if (variant === 'zip') out.texture_file = textureNames[i] === null ? null : `textures/${textureNames[i]}`;
      out.extensions = cloneJson(s.extensions);
      return out;
    });
    if (variant === 'autosave' && assets.reduce((n, a) => n + a.data_uri.length, 0) > maxInlineAssetBytes) {
      for (const a of assets) {
        delete a.data_uri;
        a.storage = 'missing';
      }
    }

    const props = {};
    for (const p of PROPS) props[p.key] = blockFromDomain(PROP_ROWS, project[p.key]);

    const meta = project.meta;
    const gen = this.#generator;
    return {
      version: VERSION,
      ...(gen && !history ? { generator: { name: gen.name, version: gen.version } } : {}),
      format: FORMAT,
      ...(meta && !meta.isDefault() ? { project: blockFromDomain(PROJECT_ROWS, meta) } : {}),
      sections,
      mesh_mode: project.meshMode,
      pivot: { ...project.wall.pivot.toJSON(), ...(derived ? { resolved_m: derived.resolved } : {}) },
      uv: project.uv.toJSON(),
      ...(derived ? { atlas: derived.atlas } : {}),
      display: blockFromDomain(history ? DISPLAY_ROWS.filter((r) => !r.viewOnly) : DISPLAY_ROWS, project.display),
      panel_id_style: blockFromDomain(PANEL_ID_STYLE_ROWS, project.panelIdStyle),
      camera: blockFromDomain(CAMERA_ROWS, project.camera),
      props,
      assets,
      ...(history ? {} : { totals: {
        sections: wallSections.length,
        total_panels: wallSections.reduce((sum, s) => sum + s.panelCols * s.panelRows, 0),
        total_pixels: wallSections.reduce((sum, s) => sum + s.panelCols * s.panelRows * s.ledX * s.ledY, 0),
      } }),
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
   *    warning), the v2 palette for a missing colour; `scope: 'full'`: the caller restores everything (08 6.17; a file
   *    without `pivot`, revision 0, keeps the session's pivot, 03 12.11).
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
