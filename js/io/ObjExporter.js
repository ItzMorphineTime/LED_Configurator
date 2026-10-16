/**
 * @module io/ObjExporter
 * OBJ + MTL text of the wall in the three mesh modes (combined / section / panel) and the OBJ text of the
 * safe-distance floor. Pure string assembly over a WallLayout: vertex grids, indices, panel corners and the
 * panel facing normal come from the injected WallMeshBuilder (Strategies.mesh.obj profile), colours from the
 * injected colorToRgb, header strings and the MTL file name from the injected brand.
 * Legacy source: index.html@cd3fd3f 4556-4717 (generateOBJContent; its unused `scale` parameter is dropped),
 * 2792-2823 (exportSafeDistanceOBJ text).
 * Layer: io (may import domain, geometry, legacy; THREE-free and DOM-free).
 */

import { exportSectionName, exportPanelName, mtlTextureFile } from '../geometry/PanelNaming.js';
import { Strategies, unsupportedStrategy } from '../legacy/LegacyCompat.js';

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
 * Duck-typed THREE.BufferAttribute (position or index) of the safe-distance meshes.
 * @typedef {{count: number, getX(i: number): number, getY(i: number): number, getZ(i: number): number}} AttributeLike
 */

/**
 * Duck-typed child visited by the safe-distance traverse: only children with `isMesh` and a `geometry` are written.
 * @typedef {{isMesh?: boolean, geometry?: {attributes: {position: AttributeLike}, index: AttributeLike|null}}} MeshLike
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
   * profile = builder.profile (the injected Strategies.mesh.obj); this class reads profile.stripNormals and
   * profile.combinedUV; the builder reads profile.winding / normals / panelNormal.
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
   * The OBJ and MTL text of the wall, verbatim string assembly of 4556-4717 (line order, separators and toFixed
   * precision exactly as legacy). Dispatch: 'combined' / 'section' / anything else is written as panels.
   *   combined: one object `LED_Wall_Combined` coloured by the first section (B-L6); all `v` lines of all
   *     sections, then all `vt` lines (0..1 per section, B-M6), one constant `vn`, then the faces;
   *   section: one material and object per section; per-section `vt`, one `vn` per section; `map_Kd` names the
   *     texture by index (B-M2, tagged at PanelNaming.mtlTextureFile);
   *   panel: one object per panel with 4 vertices, 4 `vt`, its facing `vn` and two faces.
   * Ports: index.html@cd3fd3f lines 4556-4717.
   * Side effects: none.
   * @param {{sections: import('../domain/WallSection.js').WallSection[], meshMode: *,
   *          layout: import('../geometry/WallLayout.js').WallLayout}} args  layout = layoutProject(project) of
   *   the same sections
   * @returns {{objContent: string, mtlContent: string}}
   * @throws {TypeError} combined mode on an empty wall (`sections[0].color`, as legacy);
   *   {Error} unsupportedStrategy for a foreign profile value
   */
  write({ sections, meshMode, layout }) {
    const brand = this.#brand;
    let objContent = brand.objHeader;
    objContent += `# Mesh Mode: ${meshMode}\n`;
    objContent += brand.objGeneratorLine;

    const text = { objContent, mtlContent: brand.mtlHeader };

    if (meshMode === 'combined') {
      this.#writeCombined(text, sections, layout);
    } else if (meshMode === 'section') {
      this.#writeSections(text, sections, layout);
    } else {
      // LEGACY(B-L8): any other mesh mode (an unvalidated imported string) is written as individual panels.
      this.#writePanels(text, sections, layout);
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
        // match neither the viewport atlas nor panel-ids.png.
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
    text.objContent += this.#stripNormalLine();

    const q = grid.indices;
    for (let k = 0; k < q.length; k += 6) {
      text.objContent += `f ${q[k]}/${q[k]}/1 ${q[k + 1]}/${q[k + 1]}/1 ${q[k + 2]}/${q[k + 2]}/1\n`;
      text.objContent += `f ${q[k + 3]}/${q[k + 3]}/1 ${q[k + 4]}/${q[k + 4]}/1 ${q[k + 5]}/${q[k + 5]}/1\n`;
    }
  }

  /**
   * Section mode, verbatim 4606-4658: all materials first, then one object per section. The texture-coordinate
   * offset equals the vertex offset at every section (both start at 1 and advance by the declared count), so
   * each face's `t` is its `v`.
   * @param {{objContent: string, mtlContent: string}} text  appended to
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   */
  #writeSections(text, sections, layout) {
    sections.forEach((section, i) => {
      const color = this.#colorToRgb(section.color);
      text.mtlContent += `newmtl ${exportSectionName(i)}\n`;
      text.mtlContent += `Kd ${color.r.toFixed(4)} ${color.g.toFixed(4)} ${color.b.toFixed(4)}\n`;
      text.mtlContent += `Ka 0.1 0.1 0.1\nKs 0.5 0.5 0.5\nNs 100\nd 1.0\n`;
      // The index-based texture path is B-M2 (tagged at PanelNaming.mtlTextureFile).
      text.mtlContent += `map_Kd ${mtlTextureFile(i)}\n\n`;
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
      text.objContent += this.#stripNormalLine();

      const q = grid.indices;
      const n = normalOffset;
      for (let k = 0; k < q.length; k += 6) {
        text.objContent += `f ${q[k]}/${q[k]}/${n} ${q[k + 1]}/${q[k + 1]}/${n} ${q[k + 2]}/${q[k + 2]}/${n}\n`;
        text.objContent += `f ${q[k + 3]}/${q[k + 3]}/${n} ${q[k + 4]}/${q[k + 4]}/${n} ${q[k + 5]}/${q[k + 5]}/${n}\n`;
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
   * The single normal line of a combined object or of one section object (the legacy literal of 4589 / 4635).
   * @returns {string}
   * @throws {Error} unsupportedStrategy('mesh.obj.stripNormals', ...) for a foreign profile value
   */
  #stripNormalLine() {
    const profile = this.#builder.profile;
    switch (profile.stripNormals) {
      case 'constant-z':
        // LEGACY(B-H2): one constant `vn 0 0 1` for the whole strip, wrong for any curved or offset section and
        // contradicting the clockwise face winding (the builder's quadIndices).
        return 'vn 0 0 1\n';
      default:
        throw unsupportedStrategy('mesh.obj.stripNormals', profile.stripNormals);
    }
  }

  /**
   * The OBJ text of the safe-distance floor group, verbatim 2792-2823: the brand header, then per mesh child (in
   * traverse order) its `v` lines (toFixed(6)), a blank line and its `f a b c` lines (1-based, running offset).
   * Duck-typed (traverse / isMesh / geometry.attributes.position / geometry.index): no THREE import.
   * Ports: index.html@cd3fd3f lines 2792-2823.
   * Side effects: none.
   * @param {Object3DLike} group  SafeDistanceView.object3D
   * @returns {string}
   */
  writeSafeDistance(group) {
    let objContent = this.#brand.safeDistanceObjHeader;

    let vertexOffset = 1;

    group.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const positions = child.geometry.attributes.position;
        const indices = child.geometry.index;

        // Export vertices
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          const z = positions.getZ(i);
          objContent += `v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}\n`;
        }

        objContent += '\n';

        // Export faces
        if (indices) {
          for (let i = 0; i < indices.count; i += 3) {
            const a = indices.getX(i) + vertexOffset;
            const b = indices.getX(i + 1) + vertexOffset;
            const c = indices.getX(i + 2) + vertexOffset;
            objContent += `f ${a} ${b} ${c}\n`;
          }
        }

        vertexOffset += positions.count;
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
