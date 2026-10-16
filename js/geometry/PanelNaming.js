/**
 * @module geometry/PanelNaming
 * Column letters, panel labels, export object names, filename sanitising and texture file names.
 * Legacy source: index.html@cd3fd3f 1991-1999 (getColumnLabel), 2022-2024 / 2083-2084 (panel labels),
 * 4496 (sanitizeFilename), 4511 / 4540 (ZIP texture names), 4609 / 4612 / 4622 (MTL and OBJ section names),
 * 4676 / 4888 (panel object names), 4867 (glTF section names).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free).
 */

import { Strategies, unsupportedStrategy } from '../legacy/LegacyCompat.js';

/**
 * Spreadsheet-style column letters (bijective base 26: 0 -> A, 25 -> Z, 26 -> AA). Works on numeric strings like
 * legacy, because `%` and Math.floor coerce.
 * Ports: index.html@cd3fd3f lines 1991-1999.
 * Side effects: none.
 * @param {number|string} index  zero-based global column
 * @returns {string}
 */
export function columnLabel(index) {
  let label = '';
  let idx = index;
  do {
    label = String.fromCharCode(65 + (idx % 26)) + label;
    idx = Math.floor(idx / 26) - 1;
  } while (idx >= 0);
  return label;
}

/**
 * A panel-ID label such as "C2".
 * Ports: index.html@cd3fd3f lines 2083-2084 (== 2022-2024).
 * Side effects: none.
 * @param {number|string} globalCol  start column + column within the section
 * @param {number} row  zero-based row
 * @returns {string} `${columnLabel(globalCol)}${row + 1}`
 */
export function panelLabel(globalCol, row) {
  return `${columnLabel(globalCol)}${row + 1}`;
}

/**
 * Export object/material name of a section (OBJ `o`/`usemtl`/`newmtl`, glTF mesh/node name).
 * Ports: index.html@cd3fd3f lines 4609, 4622, 4867.
 * Side effects: none.
 * @param {number} i  section index
 * @returns {string} `Wall_${i + 1}`
 */
export function exportSectionName(i) {
  return `Wall_${i + 1}`;
}

/**
 * Export object name of a panel (panel mode).
 * Ports: index.html@cd3fd3f lines 4676, 4888.
 * Side effects: none.
 * @param {number} i  section index
 * @param {number} row  panel row
 * @param {number} col  panel column within the section
 * @returns {string} `Wall_${i + 1}_Panel_R${row + 1}_C${col + 1}`
 */
export function exportPanelName(i, row, col) {
  return `Wall_${i + 1}_Panel_R${row + 1}_C${col + 1}`;
}

/**
 * Replaces every character outside [a-zA-Z0-9_-] with '_'. The parameter MUST stay named `name` (R1): a numeric
 * imported section name throws `TypeError: name.replace is not a function`, which reaches the console baseline.
 * Ports: index.html@cd3fd3f line 4496.
 * Side effects: none.
 * @param {string} name
 * @returns {string}
 * @throws {TypeError} name.replace is not a function (non-string names)
 */
export function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * File name of a section's panel-ID texture inside the ZIP `textures/` folder (also the JSON `texture_file` stem).
 * Ports: index.html@cd3fd3f lines 4511, 4540.
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection} section
 * @param {number} i  section index
 * @returns {string} `${sanitizeFilename(section.name || `Wall_${i + 1}`)}_PanelIDs.png`
 * @throws {Error} unsupportedStrategy if Strategies.zipTextureNaming is not the Phase-1 value; the sanitizeFilename
 *   TypeError for a non-string truthy name
 */
export function zipTextureFileName(section, i) {
  switch (Strategies.zipTextureNaming) {
    case 'sanitized-name':
      // LEGACY(B-L14): no de-duplication; duplicate names, or names that sanitise to the same string, collide and
      // overwrite each other in the ZIP.
      return `${sanitizeFilename(section.name || `Wall_${i + 1}`)}_PanelIDs.png`;
    default:
      throw unsupportedStrategy('zipTextureNaming', Strategies.zipTextureNaming);
  }
}

/**
 * The MTL `map_Kd` texture path of a section (section mode).
 * Ports: index.html@cd3fd3f line 4612.
 * Side effects: none.
 * @param {number} i  section index
 * @returns {string} `textures/Wall_${i + 1}_PanelIDs.png`
 * @throws {Error} unsupportedStrategy if Strategies.mtlTextureNaming is not the Phase-1 value
 */
export function mtlTextureFile(i) {
  switch (Strategies.mtlTextureNaming) {
    case 'index':
      // LEGACY(B-M2): index based, so it does not match zipTextureFileName for named sections.
      return `textures/Wall_${i + 1}_PanelIDs.png`;
    default:
      throw unsupportedStrategy('mtlTextureNaming', Strategies.mtlTextureNaming);
  }
}
