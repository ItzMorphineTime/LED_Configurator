/**
 * @module io/GltfExporter
 * glTF 2.0 JSON of the wall in the three mesh modes (combined / section / panel) with one embedded base64 buffer.
 * Vertex grids, normals, indices and panel corners come from the injected WallMeshBuilder (Strategies.mesh.gltf
 * profile), colours from the injected colorToRgb, the generator string from the injected brand.
 * JSON.stringify(gltf, null, 2) is the caller's job (ProjectIO). Since 03 T3 the positions are in the layout's frame
 * (ProjectIO passes the export frame, whose origin is the pivot) and a non-identity pivot adds scenes[0].extras.pivot.
 * Legacy source: index.html@cd3fd3f 4719-4909 (generateGLTFContent, inner addMesh 4737-4828).
 * Layer: io (may import domain, geometry, legacy; THREE-free and DOM-free).
 */

import { exportSectionName, exportPanelName } from '../geometry/PanelNaming.js';
import { maxIndexOf, indexWidth, atlasUvRect, WallMeshBuilder } from '../geometry/WallMeshBuilder.js';
import { computeAtlas } from '../geometry/TextureAtlas.js';
import { isIdentityResolution } from '../geometry/WallLayout.js';
import { unsupportedStrategy } from '../legacy/LegacyCompat.js';

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
 * Base64 of a byte array of any size: the default encoder of GltfExporter (08 6.1; B-H3 fixed in 08 P2-1a). The
 * binary string is built with String.fromCharCode over chunks of 32,768 bytes (below the V8, about 125k, and
 * JavaScriptCore, about 65k, argument limits), and ONE btoa encodes the whole string, so no '=' padding appears
 * mid-stream. The text therefore equals the legacy btoa(String.fromCharCode(...bytes)) for every buffer the legacy
 * spread could encode (it is the same binary string); the legacy spread threw RangeError above about 125 KB.
 * Exported for its unit test only (08 8.4).
 * Side effects: none.
 * @param {Uint8Array} bytes
 * @returns {string} base64 text
 */
export function chunkedBase64(bytes) {
  const CHUNK = 0x8000;
  const parts = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
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
   * indexType / doubleSided (the three writers also ask #attributeList whether NORMAL and TEXCOORD_0 are written); the
   * combined writer reads profile.combinedUV, only when TEXCOORD_0 is written (08 P2-7c); the builder reads
   * profile.winding / normals / panelNormal.
   * Side effects: none.
   * @param {{brand: {gltfGenerator: string}, colorToRgb: ColorToRgb,
   *          builder: import('../geometry/WallMeshBuilder.js').WallMeshBuilder,
   *          encodeBase64?: (bytes: Uint8Array) => string}} deps  encodeBase64 defaults to chunkedBase64 (the oracle
   *   tests inject a copy of the Phase-1 spread encoder)
   */
  constructor({ brand, colorToRgb, builder, encodeBase64 = chunkedBase64 }) {
    this.#brand = brand;
    this.#colorToRgb = colorToRgb;
    this.#builder = builder;
    this.#encodeBase64 = encodeBase64;
  }

  /**
   * The glTF document of the wall, verbatim 4719-4909. Top-level key order: asset, scene, scenes, nodes, meshes,
   * accessors, bufferViews, buffers, materials. Dispatch: 'combined' / 'section' / anything else as panels.
   *   combined: one mesh `LED_Wall_Combined` with one primitive per section (08 P2-7d, 08 6.8; B-L6 fixed): each with
   *     its own POSITION / NORMAL / TEXCOORD_0 / index accessors for that section's grid (indices from 0) and its own
   *     material `Wall_<i+1>_Material` in the section colour (legacy: one primitive and one `LED_Wall_Combined_Material`
   *     coloured by section 0);
   *   section: one mesh per section (indices from 0), coloured by that section after its indices;
   *   panel: one mesh per panel (the 4 builder corners, indices panelQuadIndices(0), the facing normal x4), colour per
   *     section first.
   * The attributes follow profile.attributes: POSITION, NORMAL since 08 P2-2d (the builder's 08 6.4 normals) and
   * TEXCOORD_0 since 08 P2-7c (B-M7 fixed; 08 6.7: written as (u, 1 - v), glTF's top-left UV origin): combined the
   * pixel-accurate atlas UVs (profile.combinedUV), section (col / cols, row / rows), panel PANEL_UVS; the 'ccw' indices
   * of 08 P2-2d face the stage, consistent with NORMAL.
   * The buffer is encoded with the injected encoder (default chunkedBase64, any size).
   * Feature 3 (03 T3, 7.2): POSITION and its min/max are in the layout's frame (no node translation is written); with a
   * non-identity pivot and a resolution (layout.pivot), scenes[0].extras = {pivot: {mode, offset_m, anchor_layout_m,
   * point_layout_m}} (arrays [x, y, z]), assigned after the nodes, so the scene's keys are nodes, extras; at the
   * identity nothing is added and the document is unchanged.
   * Ports: index.html@cd3fd3f lines 4719-4909.
   * Side effects: none.
   * @param {{sections: import('../domain/WallSection.js').WallSection[], meshMode: *,
   *          layout: import('../geometry/WallLayout.js').WallLayout}} args  layout = layoutProject(project,
   *   {frame: 'export'}) of the same sections (03 T3)
   * @returns {object} the glTF document (plain JSON)
   * @throws {Error} unsupportedStrategy for a foreign profile (an empty wall no longer throws in combined mode since
   *   08 P2-7d; the validator never lets one in, 08 P2-3b)
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

    // The three mesh modes (B-L8 fixed in 08 P2-3b: the validator maps an unknown imported mode to 'combined', so the
    // throw is unreachable from the app; legacy wrote any unknown mode as panels).
    if (meshMode === 'combined') {
      this.#writeCombined(state, sections, layout);
    } else if (meshMode === 'section') {
      this.#writeSections(state, layout);
    } else if (meshMode === 'panel') {
      this.#writePanels(state, layout);
    } else {
      throw new Error(`Unknown mesh mode ${JSON.stringify(meshMode)}`);
    }

    // 03 7.2: the pivot metadata, only for a non-identity pivot with a resolution (after the nodes: key order nodes, extras)
    const r = layout.pivot?.resolution ?? null;
    if (r !== null && !isIdentityResolution(r)) {
      const v = (p) => [p.x, p.y, p.z];
      const pivot = { mode: r.mode, offset_m: v(r.offset), anchor_layout_m: v(r.anchor), point_layout_m: v(r.point) };
      // 03 12.8: the orientation, only for a turned wall (no node rotation: the vertices are baked)
      if ((r.yawDeg ?? 0) !== 0) {
        pivot.orientation = { align: r.align, yaw_deg: r.yawDeg, align_yaw_deg: r.alignYawDeg, yaw_offset_deg: r.yawOffsetDeg };
      }
      gltf.scenes[0].extras = { pivot };
    }

    const totalLength = state.allBufferData.reduce((sum, arr) => sum + arr.length, 0);
    const combinedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of state.allBufferData) {
      combinedBuffer.set(arr, offset);
      offset += arr.length;
    }

    // The default encoder is chunkedBase64 (B-H3 fixed in 08 P2-1a: the legacy spread threw RangeError above
    // ~125 KB, so large panel-mode walls could not be exported).
    const base64 = this.#encodeBase64(combinedBuffer);
    gltf.buffers.push({
      byteLength: combinedBuffer.length,
      uri: "data:application/octet-stream;base64," + base64
    });

    return gltf;
  }

  /**
   * Combined mode (4830-4851 restructured by 08 P2-7d, 08 6.8; B-L6 fixed; 04 7.3): one mesh `LED_Wall_Combined` and one
   * node, with one primitive per section: its own grid (indices from 0; with TEXCOORD_0 the uv option of
   * #combinedUvOption, the pixel-accurate atlas rect of 08 6.7), its own accessors and its own material
   * `Wall_<i+1>_Material` in the section colour. The vertex data equals the legacy single primitive's (legacy never
   * shared a vertex across sections); only the buffer views, the accessors and the materials are split per section.
   * Legacy (`Strategies.exportCombinedColor = 'first-section'`, retired) coloured the whole wall with section 0.
   * @param {BufferState} state
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   */
  #writeCombined(state, sections, layout) {
    const uvFor = this.#combinedUvOption(sections);
    const primitives = layout.sections.map((sl, sectionIndex) => {
      const grid = this.#builder.sectionGrid(sl, { indexBase: 0, uv: uvFor(sectionIndex) });
      return {
        attrs: { positions: grid.positions, normals: grid.normals, uvs: grid.uvs },
        indices: grid.indices,
        color: this.#colorToRgb(sl.section.color),
        materialName: `${exportSectionName(sectionIndex)}_Material`,
      };
    });
    this.#addMesh(state, 'LED_Wall_Combined', primitives);
  }

  /**
   * The sectionGrid uv option of each section of the combined mesh. Without TEXCOORD_0 in profile.attributes: null for
   * every section (the Phase-1 profile has no combinedUV leaf, and it is never read). With TEXCOORD_0 (08 P2-7c; 04 2.3
   * row 08-3) the new leaf profile.combinedUV: 'atlas-pixel-accurate' -> atlasUvRect(computeAtlas(sections).entries[i]),
   * the viewport's pixel-accurate atlas UVs (08 6.7), so the combined glTF maps the combined panel-ID image
   * (Brand.files.panelIdsPng) exactly.
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @returns {(sectionIndex: number) => ({offsetU: number, widthU: number, heightV: number}|null)}
   * @throws {Error} unsupportedStrategy('mesh.gltf.combinedUV', ...) for a foreign value when TEXCOORD_0 is written;
   *   unsupportedStrategy('mesh.gltf.attributes', ...) from #attributeList
   */
  #combinedUvOption(sections) {
    if (!this.#attributeList().includes('TEXCOORD_0')) return () => null;
    const profile = this.#builder.profile;
    switch (profile.combinedUV) {
      case 'atlas-pixel-accurate': {
        const atlas = computeAtlas(sections);
        return (sectionIndex) => atlasUvRect(atlas.entries[sectionIndex]);
      }
      default:
        throw unsupportedStrategy('mesh.gltf.combinedUV', profile.combinedUV);
    }
  }

  /**
   * Section mode, verbatim 4853-4868: per section its grid (indices from 0), then its colour, then its mesh. With
   * TEXCOORD_0 (08 P2-7c) the grid carries the section's own 0..1 UVs (uv 'unit', the UVs of the section texture).
   * @param {BufferState} state
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   */
  #writeSections(state, layout) {
    const uv = this.#attributeList().includes('TEXCOORD_0') ? 'unit' : null;
    layout.sections.forEach((sl, sectionIndex) => {
      const grid = this.#builder.sectionGrid(sl, { indexBase: 0, uv });
      const color = this.#colorToRgb(sl.section.color);
      this.#addMesh(state, exportSectionName(sectionIndex),
        [{ attrs: { positions: grid.positions, normals: grid.normals, uvs: grid.uvs }, indices: grid.indices, color }]);
    });
  }

  /**
   * Panel mode (and any unknown mode), verbatim 4870-4891: per section its colour first, then one mesh per panel
   * (row-major) from the 4 builder corners (BL, BR, TR, TL) flattened x, y, z and panelQuadIndices(0). When the
   * profile's attributes list NORMAL (08 P2-2d), the normals are builder.panelNormals(panel): 4 copies of the facing
   * normal; otherwise the builder is not asked for them (the Phase-1 glTF profile has no panelNormal). With TEXCOORD_0
   * (08 P2-7c) the UVs are WallMeshBuilder.PANEL_UVS (per-panel 0..1, as the OBJ panel `vt`; 04 UV-9 later offers
   * section-space UVs). The attribute list is checked first (#attributeList), so a foreign list throws its own error
   * before any builder call.
   * @param {BufferState} state
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   */
  #writePanels(state, layout) {
    const builder = this.#builder;
    const withNormals = this.#attributeList().includes('NORMAL');
    const withUvs = this.#attributeList().includes('TEXCOORD_0');
    layout.sections.forEach(({ section, panels, panelW, panelH }, sectionIndex) => {
      const color = this.#colorToRgb(section.color);

      panels.forEach((panel) => {
        const vertices = [];
        for (const c of builder.panelCorners(panel, panelW, panelH)) vertices.push(c.x, c.y, c.z);
        const normals = withNormals ? builder.panelNormals(panel) : [];
        const uvs = withUvs ? WallMeshBuilder.PANEL_UVS.slice() : [];

        const indices = builder.panelQuadIndices(0);
        const name = exportPanelName(sectionIndex, panel.row, panel.col);
        this.#addMesh(state, name, [{ attrs: { positions: vertices, normals, uvs }, indices, color }]);
      });
    });
  }

  /**
   * Adds one mesh: its materials, the attribute and index buffer views (each padded to 4 bytes), their accessors, the
   * mesh, one node and its scene entry. Verbatim 4737-4828 for the Phase-1 profile (one primitive, POSITION only);
   * every profile read comes first (#attributeList, #indexFormat per primitive, #doubleSided), before any output.
   *   attributes follow profile.attributes, in its order (04 5.5): POSITION (Float32Array, target 34962, min/max from
   *     the float64 values), NORMAL (08 P2-2d: Float32Array, its own view with target 34962, no min/max; it needs one
   *     normal per position in attrs.normals), TEXCOORD_0 (08 P2-7c: VEC2 5126, its own view with target 34962, no
   *     min/max, written (u, 1 - v); it needs one uv per position in attrs.uvs);
   *   primitives: each with its own attribute accessors (in attribute order), then its own index view and accessor (the
   *     index width of its own indices), and its own material (materialName, default name + "_Material"); the materials
   *     of all primitives come first. Section and panel meshes have one primitive; the combined mesh one per section
   *     (08 P2-7d), so a one-primitive mesh keeps the legacy layout: materials, attributes, indices.
   * @param {BufferState} state
   * @param {string} name
   * @param {{attrs: {positions: number[], normals?: number[], uvs?: number[]}, indices: number[],
   *          color: {r: number, g: number, b: number}, materialName?: string}[]} primitives  attrs: flat float64 arrays
   *   (min/max are computed from the positions, not from the Float32Array); uvs in the OBJ / three convention (v up)
   * @throws {Error} unsupportedStrategy('mesh.gltf.attributes' | 'mesh.gltf.indexType' | 'mesh.gltf.doubleSided' |
   *   'mesh.gltf.normals', ...) for a foreign or inconsistent profile value
   */
  #addMesh(state, name, primitives) {
    const { gltf } = state;
    const attributes = this.#attributeList();
    const formats = primitives.map((p) => this.#indexFormat(p.indices));
    const doubleSided = this.#doubleSided();
    for (const { attrs } of primitives) {
      if (attributes.includes('NORMAL') && !(attrs.normals && attrs.normals.length === attrs.positions.length)) {
        throw unsupportedStrategy('mesh.gltf.normals', this.#builder.profile.normals);
      }
      if (attributes.includes('TEXCOORD_0') && !(attrs.uvs && attrs.uvs.length / 2 === attrs.positions.length / 3)) {
        throw unsupportedStrategy('mesh.gltf.attributes', attributes);
      }
    }

    const materialIndices = primitives.map(({ color, materialName }) => {
      const materialIndex = gltf.materials.length;
      const material = {
        name: materialName ?? name + "_Material",
        pbrMetallicRoughness: {
          baseColorFactor: [color.r, color.g, color.b, 1.0],
          metallicFactor: 0.0,
          roughnessFactor: 0.8
        }
      };
      if (doubleSided) material.doubleSided = true;
      gltf.materials.push(material);
      return materialIndex;
    });

    const written = primitives.map(({ attrs, indices }, p) => {
      const accessors = {};
      for (const attribute of attributes) {
        switch (attribute) {
          case 'POSITION':
            accessors.POSITION = this.#addVec3(state, attrs.positions, true);
            break;
          case 'NORMAL':
            accessors.NORMAL = this.#addVec3(state, attrs.normals, false);
            break;
          case 'TEXCOORD_0':
            accessors.TEXCOORD_0 = this.#addTexCoords(state, attrs.uvs);
            break;
          default:
            throw unsupportedStrategy('mesh.gltf.attributes', attributes);
        }
      }

      const { IndexArray, componentType } = formats[p];
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
        componentType,
        count: indices.length,
        type: "SCALAR"
      });
      return { accessors, indexAccessor };
    });

    const currentMeshIndex = state.meshIndex++;
    gltf.meshes.push({
      name: name,
      primitives: written.map(({ accessors, indexAccessor }, p) => ({
        attributes: accessors,
        indices: indexAccessor,
        material: materialIndices[p]
      }))
    });

    const nodeIndex = gltf.nodes.length;
    gltf.nodes.push({ name: name, mesh: currentMeshIndex });
    gltf.scenes[0].nodes.push(nodeIndex);
  }

  /**
   * One VEC3 float attribute: its Float32Array bytes, its buffer view (target 34962) and 4-byte padding, then its
   * accessor, verbatim the POSITION part of 4737-4828; with `withBounds` the accessor gets min/max computed from the
   * float64 `values` (POSITION), without it none (NORMAL, 08 6.4).
   * @param {BufferState} state
   * @param {number[]} values  flat float64 x, y, z
   * @param {boolean} withBounds
   * @returns {number} the accessor index
   */
  #addVec3(state, values, withBounds) {
    const { gltf } = state;
    const vertexBuffer = new Float32Array(values);
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

    const accessor = {
      bufferView: vertexBufferView,
      byteOffset: 0,
      componentType: 5126,
      count: values.length / 3,
      type: "VEC3"
    };
    if (withBounds) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < values.length; i += 3) {
        minX = Math.min(minX, values[i]);
        maxX = Math.max(maxX, values[i]);
        minY = Math.min(minY, values[i + 1]);
        maxY = Math.max(maxY, values[i + 1]);
        minZ = Math.min(minZ, values[i + 2]);
        maxZ = Math.max(maxZ, values[i + 2]);
      }
      accessor.min = [minX, minY, minZ];
      accessor.max = [maxX, maxY, maxZ];
    }

    const accessorIndex = state.accessorIndex++;
    gltf.accessors.push(accessor);
    return accessorIndex;
  }

  /**
   * One TEXCOORD_0 attribute (08 P2-7c, 08 6.7; 04 7.3): the uvs written as (u, 1 - v) into a Float32Array (glTF puts
   * the UV origin at the top-left of the image and three's GLTFLoader sets texture.flipY = false, while the builder
   * keeps the OBJ / three convention, v up), its own buffer view (target 34962) padded to 4 bytes, then a VEC2 FLOAT
   * accessor with count = uvs.length / 2 and no min/max.
   * @param {BufferState} state
   * @param {number[]} uvs  flat float64 u, v (v up)
   * @returns {number} the accessor index
   */
  #addTexCoords(state, uvs) {
    const { gltf } = state;
    const texCoords = new Float32Array(uvs.length);
    for (let i = 0; i < uvs.length; i += 2) {
      texCoords[i] = uvs[i];
      texCoords[i + 1] = 1 - uvs[i + 1];
    }
    const bytes = new Uint8Array(texCoords.buffer);
    state.allBufferData.push(bytes);

    const bufferView = gltf.bufferViews.length;
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset: state.byteOffset,
      byteLength: bytes.length,
      target: 34962
    });
    state.byteOffset += bytes.length;
    const padding = (4 - (state.byteOffset % 4)) % 4;
    if (padding > 0) {
      state.allBufferData.push(new Uint8Array(padding));
      state.byteOffset += padding;
    }

    const accessorIndex = state.accessorIndex++;
    gltf.accessors.push({
      bufferView,
      byteOffset: 0,
      componentType: 5126,
      count: uvs.length / 2,
      type: "VEC2"
    });
    return accessorIndex;
  }

  /**
   * The attribute list of the profile, checked before any output (04 5.5 read rule): every element is switched over
   * the supported attributes ('POSITION', 'NORMAL', and 'TEXCOORD_0' since 08 P2-7c), 'POSITION' must come first and
   * none may repeat.
   * @returns {readonly string[]} profile.attributes
   * @throws {Error} unsupportedStrategy('mesh.gltf.attributes', attributes) otherwise
   */
  #attributeList() {
    const attributes = this.#builder.profile.attributes;
    const seen = new Set();
    for (const attribute of attributes) {
      switch (attribute) {
        case 'POSITION':
        case 'NORMAL':
        case 'TEXCOORD_0':
          break;
        default:
          throw unsupportedStrategy('mesh.gltf.attributes', attributes);
      }
      if (seen.has(attribute)) throw unsupportedStrategy('mesh.gltf.attributes', attributes);
      seen.add(attribute);
    }
    if (attributes[0] !== 'POSITION') throw unsupportedStrategy('mesh.gltf.attributes', attributes);
    return attributes;
  }

  /**
   * The index array type and component type of one primitive (profile.indexType).
   * @param {number[]} indices
   * @returns {{IndexArray: Uint16ArrayConstructor|Uint32ArrayConstructor, componentType: 5123|5125}}
   * @throws {Error} unsupportedStrategy('mesh.gltf.indexType', ...) for a foreign profile value
   */
  #indexFormat(indices) {
    const profile = this.#builder.profile;
    switch (profile.indexType) {
      case 'uint16':
        // uint16: Phase-1 behaviour (B-L5: always Uint16, componentType 5123, wrapping above 65,535 vertices), kept
        // for the LegacyProfiles oracle tests.
        return { IndexArray: Uint16Array, componentType: 5123 };
      case 'auto':
        // 08 P2-1b (B-L5, 08 6.2): Uint32 (5125) as soon as the largest index reaches 65,535, the 5123 restart value.
        return indexWidth(maxIndexOf(indices)) === 'uint32'
          ? { IndexArray: Uint32Array, componentType: 5125 }
          : { IndexArray: Uint16Array, componentType: 5123 };
      default:
        throw unsupportedStrategy('mesh.gltf.indexType', profile.indexType);
    }
  }

  /**
   * Whether the materials get `doubleSided: true` (profile.doubleSided).
   *   'omit': no doubleSided key, so viewers cull back faces (glTF's default). Since the 'ccw' winding of 08 P2-2d
   *     the culled side is the back of the LED surface; glTF stays single-sided so a wrongly facing wall is visible as
   *     an error (08 Q2).
   *   'true' (08 P2-2d, for a later export option; no profile uses it yet): `doubleSided: true` on every material.
   * @returns {boolean}
   * @throws {Error} unsupportedStrategy('mesh.gltf.doubleSided', ...) for a foreign profile value
   */
  #doubleSided() {
    const profile = this.#builder.profile;
    switch (profile.doubleSided) {
      case 'omit':
        return false;
      case 'true':
        return true;
      default:
        throw unsupportedStrategy('mesh.gltf.doubleSided', profile.doubleSided);
    }
  }
}
