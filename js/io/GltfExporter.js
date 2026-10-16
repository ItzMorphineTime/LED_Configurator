/**
 * @module io/GltfExporter
 * glTF 2.0 JSON of the wall in the three mesh modes (combined / section / panel) with one embedded base64 buffer.
 * Vertex grids, indices and panel corners come from the injected WallMeshBuilder (Strategies.mesh.gltf profile),
 * colours from the injected colorToRgb, the generator string from the injected brand. JSON.stringify(gltf, null, 2)
 * is the caller's job (ProjectIO).
 * Legacy source: index.html@cd3fd3f 4719-4909 (generateGLTFContent, inner addMesh 4737-4828).
 * Layer: io (may import domain, geometry, legacy; THREE-free and DOM-free).
 */

import { exportSectionName, exportPanelName } from '../geometry/PanelNaming.js';
import { Strategies, unsupportedStrategy, legacySpreadBase64 } from '../legacy/LegacyCompat.js';

/**
 * Colour parser injected by App (`(s) => new THREE.Color(s)`); tests inject a THREE r128 setStyle equivalent.
 * @typedef {(cssColor: *) => {r: number, g: number, b: number}} ColorToRgb
 */

/**
 * The per-write buffer bookkeeping of the legacy closure (4732-4735).
 * @typedef {object} BufferState
 * @property {object} gltf             the document being built
 * @property {Uint8Array[]} allBufferData  byte chunks in buffer order (vertex bytes, padding, index bytes, padding)
 * @property {number} byteOffset       running byte offset into the single buffer
 * @property {number} accessorIndex    next accessor index
 * @property {number} meshIndex        next mesh index
 */

/**
 * The default base64 encoder, chosen by Strategies.gltfBase64 (module-private).
 * @returns {(bytes: Uint8Array) => string}
 * @throws {Error} unsupportedStrategy('gltfBase64', ...) for any value other than 'spread'
 */
function gltfBase64Encoder() {
  switch (Strategies.gltfBase64) {
    case 'spread':
      return legacySpreadBase64;
    default:
      throw unsupportedStrategy('gltfBase64', Strategies.gltfBase64);
  }
}

/** Writes glTF 2.0 documents. */
export class GltfExporter {
  /** @type {{gltfGenerator: string}} */
  #brand;
  /** @type {ColorToRgb} */
  #colorToRgb;
  /** @type {import('../geometry/WallMeshBuilder.js').WallMeshBuilder} */
  #builder;
  /** @type {(bytes: Uint8Array) => string} */
  #encodeBase64;

  /**
   * profile = builder.profile (the injected Strategies.mesh.gltf); #addMesh reads profile.attributes /
   * indexType / doubleSided; the builder reads profile.winding / normals.
   * Side effects: none.
   * @param {{brand: {gltfGenerator: string}, colorToRgb: ColorToRgb,
   *          builder: import('../geometry/WallMeshBuilder.js').WallMeshBuilder,
   *          encodeBase64?: (bytes: Uint8Array) => string}} deps  encodeBase64 defaults to the encoder selected by
   *   Strategies.gltfBase64 (legacySpreadBase64), evaluated here
   * @throws {Error} unsupportedStrategy('gltfBase64', ...) when no encoder is injected and the strategy is foreign
   */
  constructor({ brand, colorToRgb, builder, encodeBase64 = gltfBase64Encoder() }) {
    this.#brand = brand;
    this.#colorToRgb = colorToRgb;
    this.#builder = builder;
    this.#encodeBase64 = encodeBase64;
  }

  /**
   * The glTF document of the wall, verbatim 4719-4909. Top-level key order: asset, scene, scenes, nodes, meshes,
   * accessors, bufferViews, buffers, materials. Dispatch: 'combined' / 'section' / anything else as panels.
   *   combined: one mesh `LED_Wall_Combined` (all section grids, indices offset per section from 0), coloured by
   *     the first section AFTER the loop (B-L6);
   *   section: one mesh per section (indices from 0), coloured by that section after its indices;
   *   panel: one mesh per panel (the 4 builder corners, indices panelQuadIndices(0)), colour per section first.
   * The buffer is encoded with the injected encoder at shallow stack depth, directly from here.
   * Ports: index.html@cd3fd3f lines 4719-4909.
   * Side effects: none.
   * @param {{sections: import('../domain/WallSection.js').WallSection[], meshMode: *,
   *          layout: import('../geometry/WallLayout.js').WallLayout}} args  layout = layoutProject(project) of
   *   the same sections
   * @returns {object} the glTF document (plain JSON)
   * @throws {RangeError} 'Maximum call stack size exceeded' from the legacy encoder for buffers above ~125 KB
   *   (NOT caught); {TypeError} combined mode on an empty wall; {Error} unsupportedStrategy for a foreign profile
   */
  write({ sections, meshMode, layout }) {
    const gltf = {
      asset: { version: "2.0", generator: this.#brand.gltfGenerator },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [],
      meshes: [],
      accessors: [],
      bufferViews: [],
      buffers: [],
      materials: []
    };

    /** @type {BufferState} */
    const state = { gltf, allBufferData: [], byteOffset: 0, accessorIndex: 0, meshIndex: 0 };

    if (meshMode === 'combined') {
      this.#writeCombined(state, sections, layout);
    } else if (meshMode === 'section') {
      this.#writeSections(state, layout);
    } else {
      // LEGACY(B-L8): any other mesh mode (an unvalidated imported string) is written as individual panels.
      this.#writePanels(state, layout);
    }

    const totalLength = state.allBufferData.reduce((sum, arr) => sum + arr.length, 0);
    const combinedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of state.allBufferData) {
      combinedBuffer.set(arr, offset);
      offset += arr.length;
    }

    // LEGACY(B-H3): the default encoder is btoa(String.fromCharCode(...bytes)), which throws RangeError
    // ("Maximum call stack size exceeded") above ~125 KB (large panel-mode walls). Called directly from here at
    // shallow stack depth and deliberately NOT caught: the glTF export throws, the ZIP export rejects unhandled.
    const base64 = this.#encodeBase64(combinedBuffer);
    gltf.buffers.push({
      byteLength: combinedBuffer.length,
      uri: "data:application/octet-stream;base64," + base64
    });

    return gltf;
  }

  /**
   * Combined mode, verbatim 4830-4851: every section grid appended with loops (indices offset by the running
   * declared vertex count, from 0), then the colour, then one mesh.
   * @param {BufferState} state
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   */
  #writeCombined(state, sections, layout) {
    const allVertices = [];
    const allIndices = [];
    let indexOffset = 0;

    layout.sections.forEach((sl) => {
      const grid = this.#builder.sectionGrid(sl, { indexBase: indexOffset, uv: null });
      for (let i = 0; i < grid.positions.length; i++) allVertices.push(grid.positions[i]);
      for (let i = 0; i < grid.indices.length; i++) allIndices.push(grid.indices[i]);
      indexOffset += grid.vertexAdvance;
    });

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
    this.#addMesh(state, 'LED_Wall_Combined', allVertices, allIndices, color);
  }

  /**
   * Section mode, verbatim 4853-4868: per section its grid (indices from 0), then its colour, then its mesh.
   * @param {BufferState} state
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   */
  #writeSections(state, layout) {
    layout.sections.forEach((sl, sectionIndex) => {
      const grid = this.#builder.sectionGrid(sl, { indexBase: 0, uv: null });
      const color = this.#colorToRgb(sl.section.color);
      this.#addMesh(state, exportSectionName(sectionIndex), grid.positions, grid.indices, color);
    });
  }

  /**
   * Panel mode (and any unknown mode), verbatim 4870-4891: per section its colour first, then one mesh per panel
   * (row-major) from the 4 builder corners (BL, BR, TR, TL) flattened x, y, z and panelQuadIndices(0).
   * @param {BufferState} state
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   */
  #writePanels(state, layout) {
    const builder = this.#builder;
    layout.sections.forEach(({ section, panels, panelW, panelH }, sectionIndex) => {
      const color = this.#colorToRgb(section.color);

      panels.forEach((panel) => {
        const vertices = [];
        for (const c of builder.panelCorners(panel, panelW, panelH)) vertices.push(c.x, c.y, c.z);

        const indices = builder.panelQuadIndices(0);
        const name = exportPanelName(sectionIndex, panel.row, panel.col);
        this.#addMesh(state, name, vertices, indices, color);
      });
    });
  }

  /**
   * Adds one material, the position and index buffer views (each padded to 4 bytes), their accessors, one mesh,
   * one node and its scene entry. Verbatim 4737-4828 after the profile reads, which come first.
   * @param {BufferState} state
   * @param {string} name
   * @param {number[]} vertices  flat float64 positions (min/max are computed from these, not from the Float32Array)
   * @param {number[]} indices
   * @param {{r: number, g: number, b: number}} color
   * @throws {Error} unsupportedStrategy('mesh.gltf.attributes' | 'mesh.gltf.indexType' | 'mesh.gltf.doubleSided', ...)
   *   for a foreign profile value
   */
  #addMesh(state, name, vertices, indices, color) {
    const { gltf } = state;
    const profile = this.#builder.profile;
    if (profile.attributes.length !== 1 || profile.attributes[0] !== 'POSITION') {
      throw unsupportedStrategy('mesh.gltf.attributes', profile.attributes);
    }
    let IndexArray;
    let indexComponentType;
    switch (profile.indexType) {
      case 'uint16':
        // LEGACY(B-L5): indices are always Uint16 (componentType 5123); above 65,535 vertices they wrap silently.
        IndexArray = Uint16Array;
        indexComponentType = 5123;
        break;
      default:
        throw unsupportedStrategy('mesh.gltf.indexType', profile.indexType);
    }
    switch (profile.doubleSided) {
      case 'omit':
        // LEGACY(B-H2): the material object has NO doubleSided key, so viewers back-face cull the clockwise
        // (from +Z) winding and the wall disappears when seen from the front.
        break;
      default:
        throw unsupportedStrategy('mesh.gltf.doubleSided', profile.doubleSided);
    }

    const materialIndex = gltf.materials.length;
    gltf.materials.push({
      name: name + "_Material",
      pbrMetallicRoughness: {
        baseColorFactor: [color.r, color.g, color.b, 1.0],
        metallicFactor: 0.0,
        roughnessFactor: 0.8
      }
    });

    const vertexBuffer = new Float32Array(vertices);
    const vertexBytes = new Uint8Array(vertexBuffer.buffer);
    state.allBufferData.push(vertexBytes);

    const vertexBufferView = gltf.bufferViews.length;
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset: state.byteOffset,
      byteLength: vertexBytes.length,
      target: 34962
    });
    state.byteOffset += vertexBytes.length;
    const vertPadding = (4 - (state.byteOffset % 4)) % 4;
    if (vertPadding > 0) {
      state.allBufferData.push(new Uint8Array(vertPadding));
      state.byteOffset += vertPadding;
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      minX = Math.min(minX, vertices[i]);
      maxX = Math.max(maxX, vertices[i]);
      minY = Math.min(minY, vertices[i + 1]);
      maxY = Math.max(maxY, vertices[i + 1]);
      minZ = Math.min(minZ, vertices[i + 2]);
      maxZ = Math.max(maxZ, vertices[i + 2]);
    }

    const positionAccessor = state.accessorIndex++;
    gltf.accessors.push({
      bufferView: vertexBufferView,
      byteOffset: 0,
      componentType: 5126,
      count: vertices.length / 3,
      type: "VEC3",
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    });

    const indexBuffer = new IndexArray(indices);
    const indexBytes = new Uint8Array(indexBuffer.buffer);
    state.allBufferData.push(indexBytes);

    const indexBufferView = gltf.bufferViews.length;
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset: state.byteOffset,
      byteLength: indexBytes.length,
      target: 34963
    });
    state.byteOffset += indexBytes.length;
    const idxPadding = (4 - (state.byteOffset % 4)) % 4;
    if (idxPadding > 0) {
      state.allBufferData.push(new Uint8Array(idxPadding));
      state.byteOffset += idxPadding;
    }

    const indexAccessor = state.accessorIndex++;
    gltf.accessors.push({
      bufferView: indexBufferView,
      byteOffset: 0,
      componentType: indexComponentType,
      count: indices.length,
      type: "SCALAR"
    });

    const currentMeshIndex = state.meshIndex++;
    gltf.meshes.push({
      name: name,
      primitives: [{
        // LEGACY(B-M7): POSITION only (profile.attributes === ['POSITION']): no NORMAL, no TEXCOORD_0, so no
        // texture can be applied downstream and normals must be derived from the inverted winding.
        attributes: { POSITION: positionAccessor },
        indices: indexAccessor,
        material: materialIndex
      }]
    });

    const nodeIndex = gltf.nodes.length;
    gltf.nodes.push({ name: name, mesh: currentMeshIndex });
    gltf.scenes[0].nodes.push(nodeIndex);
  }
}
