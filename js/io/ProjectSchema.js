/**
 * @module io/ProjectSchema
 * The machine-readable rows the import validator walks (spec 07 4.4 rule 3), for the wall keys that 08 P2-3b validates:
 * the v2 paths of the section fields (identical to the v1 paths, 07 C1), their UI labels for the correction messages
 * (08 3.3) and their ranges, which are `WallSection.LIMITS` itself, so the card rules and the import cannot disagree
 * (08 4.4; 07 D1's rule). Also the inverse mapping from a validated project to domain sections. Feature keys are absent
 * until their feature's own landing commit adds them here (07 C39); the v2 file keys come with 08 P2-13e.
 * Legacy source: index.html@cd3fd3f 4974-4988 (the import's section mapping, now `sectionsFromProject`).
 * Layer: io (pure; may import domain, geometry, legacy).
 */

import { WallSection } from '../domain/WallSection.js';
import { Wall } from '../domain/Wall.js';
import { deepFreeze } from '../domain/rules.js';

/** The value of a project file's `format` key (07 4.2); a file may omit it (the version decides). */
export const FORMAT = 'morph-led-project';

/** The mesh modes a file may name (07 4.3); anything else becomes 'combined' with a warning. */
export const MESH_MODES = deepFreeze(['combined', 'section', 'panel']);

/**
 * The validator's limits: the section ranges (`WallSection.LIMITS`, 08 P2-8a), the section count (`Wall.MAX_SECTIONS`)
 * and the section name length (32 UTF-16 code units, the card input's maxlength).
 * @type {Readonly<{sections: typeof WallSection.LIMITS, maxSections: number, nameMaxLength: number}>}
 */
export const LIMITS = Object.freeze({ sections: WallSection.LIMITS, maxSections: Wall.MAX_SECTIONS, nameMaxLength: 32 });

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

/** The labels of the other section rows (08 3.3). */
export const SECTION_LABELS = deepFreeze({ name: 'Section Name', id: 'id', color: 'Panel Colour' });

/**
 * The domain sections of a validated project (the inverse of the v1 section mapping; every value is already valid).
 * Side effects: none.
 * @param {{sections: Array<{name: string, id: number, panel: {columns: number, rows: number, width_mm: number,
 *          height_mm: number}, led_resolution: {x: number, y: number},
 *          curvature: {angle_degrees: number, angle_offset_degrees: number}, color: string}>}} project
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
  }));
}
