/**
 * @module io/ObjExporter
 * OBJ + MTL text of the wall in the three mesh modes (combined / section / panel) and the OBJ text of the
 * safe-distance floor. Pure string assembly over a WallLayout: vertex grids, indices, panel corners and the
 * panel facing normal come from the injected WallMeshBuilder (Strategies.mesh.obj profile), colours from the
 * injected colorToRgb, header strings and the MTL file name from the injected brand.
 * Legacy source: index.html@cd3fd3f 4556-4717 (generateOBJContent; its unused `scale` parameter is dropped),
 * 2792-2823 (exportSafeDistanceOBJ text; `vn`, `f a//a` and the `# Clamped:` line since 08 P2-5b).
 * Layer: io (may import domain, geometry, legacy; THREE-free and DOM-free).
 */

import { exportSectionName, exportPanelName, mtlTextureFile } from '../geometry/PanelNaming.js';
import { Strategies, unsupportedStrategy } from '../legacy/LegacyCompat.js';

/**
 * The orientation header line (01 CR-3, adopted by 08 P2-2c), written after `# Mesh Mode: ...` when the OBJ profile
 * winds 'ccw': it documents the convention in every file, for pipelines that compensated for the old inverted output.
 */
const FACE_CONVENTION_LINE = '# Faces: counter-clockwise front faces; vn point out of the LED surface (toward the stage)\n';

/**
 * The brand strings this writer uses (a subset of Theme.Brand).
 * @typedef {{objHeader: string, objGeneratorLine: string, mtlHeader: string, safeDistanceObjHeader: string,
 *            files: {mtl: string}}} ObjBrand
 */

/**
 * Colour parser injected by App (`(s) => new THREE.Color(s)`); tests inject a THREE r128 setStyle equivalent.
 * @typedef {(cssColor: *) => {r: number, g: number, b: number}} ColorToRgb
 */

/**
 * Duck-typed THREE.BufferAttribute (position, normal or index) of the safe-distance meshes.
 * @typedef {{count: number, getX(i: number): number, getY(i: number): number, getZ(i: number): number}} AttributeLike
 */

/**
 * Duck-typed child visited by the safe-distance traverse: only children with `isMesh` and a `geometry` are written.
 * @typedef {{isMesh?: boolean, geometry?: {attributes: {position: AttributeLike, normal?: AttributeLike},
 *            index: AttributeLike|null}}} MeshLike
 */

/**
 * Duck-typed THREE.Object3D of the safe-distance group.
 * @typedef {{traverse(cb: (child: MeshLike) => void): void}} Object3DLike
 */

/** Writes OBJ and MTL text. */
export class ObjExporter {
  /** @type {ObjBrand} */
  #brand;
  /** @type {ColorToRgb} */
  #colorToRgb;
  /** @type {import('../geometry/WallMeshBuilder.js').WallMeshBuilder} */
  #builder;

  /**
   * profile = builder.profile (the injected Strategies.mesh.obj); this class reads profile.winding (the header
   * line only), profile.stripNormals and profile.combinedUV; the builder reads profile.winding / normals /
   * panelNormal.
   * Side effects: none.
   * @param {{brand: ObjBrand, colorToRgb: ColorToRgb,
   *          builder: import('../geometry/WallMeshBuilder.js').WallMeshBuilder}} deps
   */
  constructor({ brand, colorToRgb, builder }) {
    this.#brand = brand;
    this.#colorToRgb = colorToRgb;
    this.#builder = builder;
  }

  /**
   * The OBJ and MTL text of the wall, the string assembly of 4556-4717 (line order, separators and toFixed
   * precision as legacy). Header: brand.objHeader, `# Mesh Mode: ${meshMode}`, the orientation line (01 CR-3)
   * when the profile winds 'ccw' (none for 'legacy-cw'), brand.objGeneratorLine. Dispatch: 'combined' / 'section' /
   * anything else is written as panels. Strip normals (#stripNormalLines): 'per-vertex' (08 P2-2c) writes one `vn`
   * per vertex from the builder normals and faces `f a/a/a`; 'constant-z' (Phase 1) one `vn 0 0 1` per object.
   *   combined: one object `LED_Wall_Combined` coloured by the first section (B-L6); all `v` lines of all
   *     sections, then all `vt` lines (0..1 per section, B-M6), then the normals, then the faces;
   *   section: one material and object per section; per-section `v`, `vt` and normals; `map_Kd` only for a
   *     texture the caller ships (08 P2-6c, B-L7 fixed): textureNames given and textureNames[i] not null. Both archives
   *     pass their texture names, null for a texture they left out (08 P2-1c): Export All (ZIP), and Export OBJ (ZIP)
   *     in section mode since 08 P2-6e (before it, Export OBJ passed none and its standalone MTL had no `map_Kd`).
   *     The path is that file's ZIP entry, `textures/<name>` (08 P2-6d, B-M2 fixed: legacy named it by index);
   *   panel: one object per panel with 4 vertices, 4 `vt`, its facing `vn` and two faces (builder.panelQuadIndices).
   * Ports: index.html@cd3fd3f lines 4556-4717.
   * Side effects: none.
   * @param {{sections: import('../domain/WallSection.js').WallSection[], meshMode: *,
   *          layout: import('../geometry/WallLayout.js').WallLayout, textureNames?: (string|null)[]|null}} args
   *   layout = layoutProject(project) of the same sections; textureNames (08 P2-6c; passed by Export All (ZIP) and, in
   *   section mode, by Export OBJ (ZIP), 08 P2-6e): the shipped texture file name of each section
   *   (PanelNaming.textureFileNames), null for a texture left out; absent or null: no map_Kd at all
   * @returns {{objContent: string, mtlContent: string}}
   * @throws {TypeError} combined mode on an empty wall (`sections[0].color`, as legacy);
   *   {Error} unsupportedStrategy for a foreign profile value
   */
  write({ sections, meshMode, layout, textureNames = null }) {
    const brand = this.#brand;
    let objContent = brand.objHeader;
    objContent += `# Mesh Mode: ${meshMode}\n`;
    objContent += this.#faceConventionLine();
    objContent += brand.objGeneratorLine;

    const text = { objContent, mtlContent: brand.mtlHeader };

    // The three mesh modes (B-L8 fixed in 08 P2-3b: the validator maps an unknown imported mode to 'combined', so the
    // throw is unreachable from the app; legacy wrote any unknown mode as panels).
    if (meshMode === 'combined') {
      this.#writeCombined(text, sections, layout);
    } else if (meshMode === 'section') {
      this.#writeSections(text, sections, layout, textureNames);
    } else if (meshMode === 'panel') {
      this.#writePanels(text, sections, layout);
    } else {
      throw new Error(`Unknown mesh mode ${JSON.stringify(meshMode)}`);
    }

    return { objContent: text.objContent, mtlContent: text.mtlContent };
  }

  /**
   * Combined mode, verbatim 4563-4604. The colour is read FIRST (before any text), then the UV option.
   * @param {{objContent: string, mtlContent: string}} text  appended to
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   */
  #writeCombined(text, sections, layout) {
    const profile = this.#builder.profile;
    let color;
    switch (Strategies.exportCombinedColor) {
      case 'first-section':
        // LEGACY(B-L6): the whole combined wall gets the first section's colour (and an empty wall throws the
        // legacy TypeError on `sections[0].color`).
        color = this.#colorToRgb(sections[0].color);
        break;
      default:
        throw unsupportedStrategy('exportCombinedColor', Strategies.exportCombinedColor);
    }
    let uv;
    switch (profile.combinedUV) {
      case 'per-section-overlap':
        // LEGACY(B-M6): every section's `vt` run spans 0..1 on its own, so the sections overlap in UV space and
        // match neither the viewport atlas nor the combined panel-ID PNG (Brand.files.panelIdsPng).
        uv = 'unit';
        break;
      default:
        throw unsupportedStrategy('mesh.obj.combinedUV', profile.combinedUV);
    }

    text.mtlContent += `newmtl LED_Wall_Combined\n`;
    text.mtlContent += `Kd ${color.r.toFixed(4)} ${color.g.toFixed(4)} ${color.b.toFixed(4)}\n`;
    text.mtlContent += `Ka 0.1 0.1 0.1\nKs 0.5 0.5 0.5\nNs 100\nd 1.0\n\n`;

    text.objContent += `mtllib ${this.#brand.files.mtl}\n\n`;
    text.objContent += 'o LED_Wall_Combined\n';
    text.objContent += 'usemtl LED_Wall_Combined\n';

    const grid = { positions: [], normals: [], uvs: [], indices: [] };
    let vertexOffset = 1;
    layout.sections.forEach((sl) => {
      const { vertexAdvance } = this.#builder.sectionGrid(sl, { indexBase: vertexOffset, uv }, grid);
      vertexOffset += vertexAdvance;
    });

    text.objContent += vertexLines(grid.positions);
    text.objContent += texCoordLines(grid.uvs);
    const { lines, normalIndex: n } = this.#stripNormalLines(grid.normals, 1);
    text.objContent += lines;

    const q = grid.indices;
    for (let k = 0; k < q.length; k += 6) {
      text.objContent += `f ${q[k]}/${q[k]}/${n(q[k])} ${q[k + 1]}/${q[k + 1]}/${n(q[k + 1])} ${q[k + 2]}/${q[k + 2]}/${n(q[k + 2])}\n`;
      text.objContent += `f ${q[k + 3]}/${q[k + 3]}/${n(q[k + 3])} ${q[k + 4]}/${q[k + 4]}/${n(q[k + 4])} ${q[k + 5]}/${q[k + 5]}/${n(q[k + 5])}\n`;
    }
  }

  /**
   * Section mode, verbatim 4606-4658: all materials first, then one object per section. The texture-coordinate
   * offset equals the vertex offset at every section (both start at 1 and advance by the declared count), so
   * each face's `t` is its `v`; with 'per-vertex' strip normals so is its `n` ('constant-z': one normal per section).
   * @param {{objContent: string, mtlContent: string}} text  appended to
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   * @param {(string|null)[]|null} textureNames  the shipped texture of each section; null (or a null entry): no map_Kd
   */
  #writeSections(text, sections, layout, textureNames) {
    sections.forEach((section, i) => {
      const color = this.#colorToRgb(section.color);
      text.mtlContent += `newmtl ${exportSectionName(i)}\n`;
      text.mtlContent += `Kd ${color.r.toFixed(4)} ${color.g.toFixed(4)} ${color.b.toFixed(4)}\n`;
      text.mtlContent += `Ka 0.1 0.1 0.1\nKs 0.5 0.5 0.5\nNs 100\nd 1.0\n`;
      // A texture is referenced only when the caller ships it (08 P2-6c, B-L7 fixed; a texture the ZIP left out,
      // 08 P2-1c, is null), by its ZIP entry path (08 P2-6d, B-M2 fixed).
      const shipped = Array.isArray(textureNames) && textureNames[i] != null;
      text.mtlContent += shipped ? `map_Kd ${mtlTextureFile(textureNames[i])}\n\n` : '\n';
    });

    text.objContent += `mtllib ${this.#brand.files.mtl}\n\n`;

    let vertexOffset = 1;
    let normalOffset = 1;

    layout.sections.forEach((sl, sectionIndex) => {
      text.objContent += `o ${exportSectionName(sectionIndex)}\n`;
      text.objContent += `usemtl ${exportSectionName(sectionIndex)}\n`;

      const grid = this.#builder.sectionGrid(sl, { indexBase: vertexOffset, uv: 'unit' });
      text.objContent += vertexLines(grid.positions);
      text.objContent += texCoordLines(grid.uvs);
      const { lines, normalIndex: n } = this.#stripNormalLines(grid.normals, normalOffset);
      text.objContent += lines;

      const q = grid.indices;
      for (let k = 0; k < q.length; k += 6) {
        text.objContent += `f ${q[k]}/${q[k]}/${n(q[k])} ${q[k + 1]}/${q[k + 1]}/${n(q[k + 1])} ${q[k + 2]}/${q[k + 2]}/${n(q[k + 2])}\n`;
        text.objContent += `f ${q[k + 3]}/${q[k + 3]}/${n(q[k + 3])} ${q[k + 4]}/${q[k + 4]}/${n(q[k + 4])} ${q[k + 5]}/${q[k + 5]}/${n(q[k + 5])}\n`;
      }

      vertexOffset += grid.vertexAdvance;
      normalOffset += 1;
      text.objContent += '\n';
    });
  }

  /**
   * Panel mode (and any unknown mode), verbatim 4660-4713: all materials first (no map_Kd), then one object per
   * panel, sections in order and panels row-major.
   * @param {{objContent: string, mtlContent: string}} text  appended to
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   */
  #writePanels(text, sections, layout) {
    sections.forEach((section, i) => {
      const color = this.#colorToRgb(section.color);
      text.mtlContent += `newmtl ${exportSectionName(i)}\n`;
      text.mtlContent += `Kd ${color.r.toFixed(4)} ${color.g.toFixed(4)} ${color.b.toFixed(4)}\n`;
      text.mtlContent += `Ka 0.1 0.1 0.1\nKs 0.5 0.5 0.5\nNs 100\nd 1.0\n\n`;
    });

    text.objContent += `mtllib ${this.#brand.files.mtl}\n\n`;

    const builder = this.#builder;
    let vertexOffset = 1;
    let texCoordOffset = 1;
    let normalOffset = 1;

    layout.sections.forEach(({ panels, panelW, panelH }, sectionIndex) => {
      panels.forEach((panel) => {
        text.objContent += `o ${exportPanelName(sectionIndex, panel.row, panel.col)}\n`;
        text.objContent += `usemtl ${exportSectionName(sectionIndex)}\n`;

        builder.panelCorners(panel, panelW, panelH).forEach((c) => {
          text.objContent += `v ${c.x.toFixed(6)} ${c.y.toFixed(6)} ${c.z.toFixed(6)}\n`;
        });

        text.objContent += `vt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\n`;

        const normal = builder.panelFacingNormal(panel);
        text.objContent += `vn ${normal.x.toFixed(6)} 0 ${normal.z.toFixed(6)}\n`;

        const v = builder.panelQuadIndices(vertexOffset);
        const t = builder.panelQuadIndices(texCoordOffset);
        const n = normalOffset;
        text.objContent += `f ${v[0]}/${t[0]}/${n} ${v[1]}/${t[1]}/${n} ${v[2]}/${t[2]}/${n}\n`;
        text.objContent += `f ${v[3]}/${t[3]}/${n} ${v[4]}/${t[4]}/${n} ${v[5]}/${t[5]}/${n}\n`;

        vertexOffset += 4;
        texCoordOffset += 4;
        normalOffset += 1;
        text.objContent += '\n';
      });
    });
  }

  /**
   * The orientation header line (01 CR-3) for the OBJ profile's winding: FACE_CONVENTION_LINE for 'ccw' (08 P2-2c),
   * nothing for the Phase-1 'legacy-cw' (kept for the LegacyProfiles oracle tests, whose text has no such line).
   * @returns {string}
   * @throws {Error} unsupportedStrategy('mesh.obj.winding', ...) for a foreign profile value
   */
  #faceConventionLine() {
    const profile = this.#builder.profile;
    switch (profile.winding) {
      case 'ccw':
        return FACE_CONVENTION_LINE;
      case 'legacy-cw':
        return '';
      default:
        throw unsupportedStrategy('mesh.obj.winding', profile.winding);
    }
  }

  /**
   * The normal lines of a combined object or of one section object, and the `n` of the face corner of vertex `v`.
   *   'per-vertex' (08 P2-2c, 08 6.4): one `vn nx ny nz` (toFixed(6)) per builder normal, in vertex order, so the
   *     corner of vertex v uses normal v (`f a/a/a`). The builder normals ('averaged') point out of the LED surface.
   *   'constant-z': the legacy literal `vn 0 0 1` of 4589 / 4635, and every corner uses `constantIndex`.
   * @param {number[]} normals  the builder normals of the object's vertices (profile.normals; unused by 'constant-z')
   * @param {number} constantIndex  the index of the single 'constant-z' normal (1 combined; the section's normalOffset)
   * @returns {{lines: string, normalIndex: (v: number) => number}}
   * @throws {Error} unsupportedStrategy('mesh.obj.stripNormals', ...) for a foreign profile value
   */
  #stripNormalLines(normals, constantIndex) {
    const profile = this.#builder.profile;
    switch (profile.stripNormals) {
      case 'per-vertex':
        return { lines: normalLines(normals), normalIndex: (v) => v };
      case 'constant-z':
        // constant-z: Phase-1 behaviour (B-H2: one `vn 0 0 1` for the whole strip, wrong for any curved or offset
        // section and contradicting the clockwise 'legacy-cw' faces), kept for the LegacyProfiles oracle tests.
        return { lines: 'vn 0 0 1\n', normalIndex: () => constantIndex };
      default:
        throw unsupportedStrategy('mesh.obj.stripNormals', profile.stripNormals);
    }
  }

  /**
   * The OBJ text of the safe-distance floor group (2792-2823; 08 P2-5b, B-L29 fixed): the brand header, plus, when the
   * band clamped any offset vertex, the line `# Clamped: ${n} of ${total} offset vertices are closer than D =
   * ${D.toFixed(2)} m (concave features)` before the header's blank line; then per mesh child (in traverse order) its
   * `v` lines (toFixed(6)), its `vn` lines from geometry.attributes.normal (toFixed(6); (0, 1, 0) for the +Y band), a
   * blank line and its faces `f a//a b//b c//c` (1-based; running vertex and normal offsets, equal while every mesh has
   * one normal per vertex). A mesh without a normal attribute writes no `vn` and faces `f a b c` (the Phase-1 form).
   * Duck-typed (traverse / isMesh / geometry.attributes.position, .normal / geometry.index): no THREE import.
   * Ports: index.html@cd3fd3f lines 2792-2823.
   * Side effects: none.
   * @param {Object3DLike} group  SafeDistanceView.object3D
   * @param {{clampedVertices: number, totalSafeVertices: number, distance: number}|null} [band]
   *   SafeDistanceView.lastBand (geometry/SafeDistanceBand); null or absent writes no `# Clamped:` line
   * @returns {string}
   */
  writeSafeDistance(group, band = null) {
    let objContent = this.#brand.safeDistanceObjHeader;
    if (band && band.clampedVertices > 0) {
      const line = `# Clamped: ${band.clampedVertices} of ${band.totalSafeVertices} offset vertices are closer than ` +
        `D = ${band.distance.toFixed(2)} m (concave features)\n`;
      objContent = objContent.endsWith('\n\n') ? `${objContent.slice(0, -1)}${line}\n` : objContent + line;
    }

    let vertexOffset = 1;
    let normalOffset = 1;

    group.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const positions = child.geometry.attributes.position;
        const normals = child.geometry.attributes.normal ?? null;
        const indices = child.geometry.index;

        // Export vertices
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          const z = positions.getZ(i);
          objContent += `v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}\n`;
        }

        // Export normals, one per vertex (08 P2-5b)
        if (normals) {
          for (let i = 0; i < normals.count; i++) {
            objContent += `vn ${normals.getX(i).toFixed(6)} ${normals.getY(i).toFixed(6)} ${normals.getZ(i).toFixed(6)}\n`;
          }
        }

        objContent += '\n';

        // Export faces
        if (indices) {
          for (let i = 0; i < indices.count; i += 3) {
            const a = indices.getX(i) + vertexOffset;
            const b = indices.getX(i + 1) + vertexOffset;
            const c = indices.getX(i + 2) + vertexOffset;
            if (normals) {
              const na = indices.getX(i) + normalOffset;
              const nb = indices.getX(i + 1) + normalOffset;
              const nc = indices.getX(i + 2) + normalOffset;
              objContent += `f ${a}//${na} ${b}//${nb} ${c}//${nc}\n`;
            } else {
              objContent += `f ${a} ${b} ${c}\n`;
            }
          }
        }

        vertexOffset += positions.count;
        if (normals) normalOffset += normals.count;
      }
    });

    return objContent;
  }
}

/**
 * The `v x y z` lines (toFixed(6)) of a flat position array (4576-4578, 4625-4627).
 * @param {number[]} positions
 * @returns {string}
 */
function vertexLines(positions) {
  let lines = '';
  for (let i = 0; i < positions.length; i += 3) {
    lines += `v ${positions[i].toFixed(6)} ${positions[i + 1].toFixed(6)} ${positions[i + 2].toFixed(6)}\n`;
  }
  return lines;
}

/**
 * The `vn x y z` lines (toFixed(6)) of a flat normal array (08 P2-2c, 08 6.4). As in `v` lines, a tiny negative
 * component prints as -0.000000; every OBJ importer reads it as 0.
 * @param {number[]} normals
 * @returns {string}
 */
function normalLines(normals) {
  let lines = '';
  for (let i = 0; i < normals.length; i += 3) {
    lines += `vn ${normals[i].toFixed(6)} ${normals[i + 1].toFixed(6)} ${normals[i + 2].toFixed(6)}\n`;
  }
  return lines;
}

/**
 * The `vt u v` lines (toFixed(6)) of a flat UV array (4584, 4631).
 * @param {number[]} uvs
 * @returns {string}
 */
function texCoordLines(uvs) {
  let lines = '';
  for (let i = 0; i < uvs.length; i += 2) {
    lines += `vt ${uvs[i].toFixed(6)} ${uvs[i + 1].toFixed(6)}\n`;
  }
  return lines;
}
