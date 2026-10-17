/**
 * @module geometry/PanelNaming
 * Column letters, panel labels, export object names, filename sanitising and texture file names.
 * Legacy source: index.html@cd3fd3f 1991-1999 (getColumnLabel), 2022-2024 / 2083-2084 (panel labels),
 * 4496 (sanitizeFilename), 4511 / 4540 (ZIP texture names, unique since 08 P2-6b), 4609 / 4612 / 4622 (MTL and OBJ
 * section names), 4676 / 4888 (panel object names), 4867 (glTF section names).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free). It imports nothing.
 */

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
 * The panel-ID texture file names of the sections, unique (08 6.6; B-L14 fixed in 08 P2-6b): per section
 * `${candidate}_PanelIDs.png` with candidate = sanitizeFilename(section.name || `Wall_${i + 1}`), the legacy name, made
 * unique case-insensitively (archives are unpacked onto case-insensitive file systems on Windows and macOS) by appending
 * `_2`, `_3`, ... to a base already used. Names without a collision are the legacy names, so existing ZIP texture
 * entries keep their names. The single source of the ZIP texture entries, the ZIP JSON `texture_file` and the MTL
 * `map_Kd` (08 P2-6d). It never returns null: a caller that leaves a texture out replaces that entry with
 * null (08 6.3).
 * Ports: index.html@cd3fd3f lines 4511, 4540 (the legacy name of each section; legacy did not de-duplicate, so equal or
 *   equally sanitised names overwrote each other in the ZIP).
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection[]} sections
 * @returns {string[]} one unique file name per section, in section order
 * @throws {TypeError} name.replace is not a function (sanitizeFilename) for a non-string truthy name
 */
export function textureFileNames(sections) {
  const used = new Set();
  const names = [];
  sections.forEach((section, i) => {
    const base = sanitizeFilename(section.name || `Wall_${i + 1}`);
    let candidate = base;
    for (let k = 2; used.has(candidate.toLowerCase()); k++) candidate = `${base}_${k}`;
    used.add(candidate.toLowerCase());
    names.push(`${candidate}_PanelIDs.png`);
  });
  return names;
}

/**
 * The MTL `map_Kd` texture path of a section texture file (section mode): the ZIP entry path of that file, so the MTL
 * names exactly the texture the archive holds (08 P2-6d, B-M2 fixed: legacy wrote `textures/Wall_${i + 1}_PanelIDs.png`
 * by index, which matched no texture of a named section; Strategies.mtlTextureNaming is retired).
 * Ports: index.html@cd3fd3f line 4612 (the `textures/` folder).
 * Side effects: none.
 * @param {string} fileName  a textureFileNames entry
 * @returns {string} `textures/${fileName}`
 */
export function mtlTextureFile(fileName) {
  return `textures/${fileName}`;
}

/**
 * The archive path of the combined panel-ID atlas (08 P2-7f, 08 6.3, 6.8; 04 2.3 rows 08-7 and 08-8): the atlas image
 * of Export Panel IDs (Brand.files.panelIdsPng) in the archives' `textures/` folder, the one name of the ZIP entry and of
 * the combined MTL `map_Kd`. Built from the injected brand files, never from a literal (06 R-B3b), so a rename of
 * Brand.files.panelIdsPng renames the entry.
 * Side effects: none.
 * @param {{panelIdsPng: string}} files  Theme.brand.files
 * @returns {string} `textures/${files.panelIdsPng}`
 */
export function atlasTexturePath(files) {
  return `textures/${files.panelIdsPng}`;
}
