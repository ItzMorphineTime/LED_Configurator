/**
 * @module render/SafeDistanceView
 * The safe-distance floor visualisation (legacy `safeDistanceMesh`): a green-to-red band on the floor from the
 * wall out to the maximum distance D at which the film frame still fits the (flat) wall, the outline along its outer
 * edge and a "Max: D m" label sprite. Since 08 P2-5b (B-M15, B-L29 fixed) the band is geometry/SafeDistanceBand's
 * mitred, clamped strip facing +Y; its outer vertices closer than D (near concave features) take the amber 'clamped'
 * colour. The group is a registered helper and is also the source of the safe-distance OBJ export (ProjectIO reads
 * `object3D` and `lastBand`).
 * Legacy source: index.html@cd3fd3f 2586-2762 (createSafeDistanceMesh, minus the bounds copy 2597-2603 and the walk
 * copy 2614-2647, now WallLayout.flatEdges / framingBounds, and the per-column band 2649-2708, now
 * buildSafeDistanceBand), 2764-2776 (removeSafeDistanceMesh).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { buildSafeDistanceBand } from '../geometry/SafeDistanceBand.js';
import { disposeObject3D } from './ResourceTracker.js';

/**
 * The safe-distance floor band, outline and label.
 */
export class SafeDistanceView {
  /** @type {import('./SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {Document} */
  #doc;
  /** @type {{scene: object}} */
  #theme;
  /** @type {THREE.Group|null} legacy `safeDistanceMesh` */
  #group = null;
  /** @type {import('../geometry/SafeDistanceBand.js').SafeBand|null} the band of the current group (08 P2-5b) */
  #lastBand = null;

  /**
   * Stores the dependencies only (R4): nothing is allocated until create().
   * Side effects: none.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager, doc: Document, theme: {scene: object}}} deps
   *   doc: creates the label canvas at call time; theme: { scene: SceneTheme } (safeZone)
   */
  constructor({ sceneManager, doc, theme }) {
    this.#sceneManager = sceneManager;
    this.#doc = doc;
    this.#theme = theme;
  }

  /**
   * Side effects: none.
   * @returns {THREE.Group|null} legacy `safeDistanceMesh` (the group, or null when not shown); read by the
   *   safe-distance OBJ export
   */
  get object3D() {
    return this.#group;
  }

  /**
   * The band of the current group (08 P2-5b), read by the safe-distance OBJ export for its `# Clamped:` header line.
   * Side effects: none.
   * @returns {import('../geometry/SafeDistanceBand.js').SafeBand|null} null when no group is shown
   */
  get lastBand() {
    return this.#lastBand;
  }

  /**
   * Replaces the safe-distance group. D = cine.maxSafeDistance(bounds); band = buildSafeDistanceBand(layout, D)
   * (08 6.9: the mitred, clamped strip over layout.flatEdges(), every triangle +Y; B-M15 and B-L29 fixed in 08 P2-5b);
   * the floor mesh, the outline and the label only when the band has vertices. The group is added to the scene even
   * when the wall has no edges (an empty group, no throw). The legacy inner guard `if (!cameraPreviewEnabled) return`
   * (2589) is unreachable (the only caller checks the flag) and dropped. `layout` and `bounds` arrive precomputed from
   * CameraHub.syncSafeDistance (permitted reordering PR7).
   * Ports: index.html@cd3fd3f lines 2586-2762 (2591-2612 and 2614-2647 replaced by the arguments, 2649-2708 by
   *   buildSafeDistanceBand).
   * Side effects: removes and disposes the previous group; allocates the new group, then (when the band has vertices)
   *   the floor geometry, material and mesh, the line material, geometry and Line, the label canvas (DOM),
   *   CanvasTexture, SpriteMaterial and Sprite; adds the group to the scene as a helper; keeps the band as lastBand.
   * @param {{layout: import('../geometry/WallLayout.js').WallLayout,
   *          cine: import('../domain/CineCamera.js').CineCamera,
   *          bounds: {totalWidth: number, maxHeight: number}}} args
   * @returns {void}
   */
  create({ layout, cine, bounds }) {
    this.remove();

    const group = new THREE.Group();
    this.#group = group;

    // Safe distance = maximum distance where the frame still fits within the wall (MIN over both dimensions)
    const overallSafeDist = cine.maxSafeDistance(bounds);

    // The mitred, clamped band over the wall's floor edges (08 6.9)
    const band = buildSafeDistanceBand(layout, overallSafeDist);
    this.#lastBand = band;

    if (band.positions.length > 0) {
      this.#addFloor(group, band);
      this.#addOutline(group, band);
      this.#addLabel(group, band.labelAnchor, overallSafeDist);
    }

    this.#sceneManager.addHelper(group);
  }

  /**
   * Removes and disposes the group, including the label texture (maps: true).
   * Ports: index.html@cd3fd3f lines 2764-2776.
   * Side effects: removes the group helper from the scene; disposes its geometries, maps and materials; clears
   *   lastBand.
   * @returns {void}
   */
  remove() {
    if (this.#group) {
      this.#sceneManager.removeHelper(this.#group);
      disposeObject3D(this.#group, { maps: true });
      this.#group = null;
    }
    this.#lastBand = null;
  }

  /**
   * The translucent vertex-coloured floor mesh. Vertex colours by band colour: 'wall' -> safeZone.wallColor,
   * 'threshold' -> safeZone.thresholdColor, 'clamped' -> safeZone.clampedColor (an outer vertex closer than D,
   * 08 P2-5b). computeVertexNormals gives (0, 1, 0) everywhere (every triangle faces +Y); the OBJ export writes them.
   * Ports: index.html@cd3fd3f lines 2711-2726.
   * Side effects: allocates geometry, material, mesh (in this order) and adds the mesh to the group.
   * @param {THREE.Group} group
   * @param {import('../geometry/SafeDistanceBand.js').SafeBand} band
   */
  #addFloor(group, { positions, indices, colors }) {
    const zone = this.#theme.scene.safeZone;
    const rgb = { wall: zone.wallColor, threshold: zone.thresholdColor, clamped: zone.clampedColor };
    const colorArray = [];
    for (const c of colors) colorArray.push(...rgb[c]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: zone.floorOpacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
  }

  /**
   * The outline along the band's outer edge (its offset vertices in order, 08 6.9) at y = band.lineLift (0.02).
   * Ports: index.html@cd3fd3f lines 2728-2737.
   * Side effects: allocates the material BEFORE the geometry (legacy order), then the Line; adds it to the group.
   * @param {THREE.Group} group
   * @param {import('../geometry/SafeDistanceBand.js').SafeBand} band
   */
  #addOutline(group, { outline, lineLift }) {
    const zone = this.#theme.scene.safeZone;
    const lineMaterial = new THREE.LineBasicMaterial({ color: zone.lineColor, transparent: true, opacity: zone.lineOpacity, linewidth: 2 });
    const linePositions = [];
    outline.forEach(pt => {
      linePositions.push(pt.x, lineLift, pt.z);
    });
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const safeLine = new THREE.Line(lineGeom, lineMaterial);
    group.add(safeLine);
  }

  /**
   * The "Max: D m" label sprite (256 x 64 canvas, scale 2 x 0.5) at the band's label anchor: its middle offset vertex,
   * the legacy middle point of the safe line.
   * Ports: index.html@cd3fd3f lines 2739-2758.
   * Side effects: creates and draws a canvas (DOM); allocates CanvasTexture, SpriteMaterial and Sprite (in this
   *   order) and adds the sprite to the group.
   * @param {THREE.Group} group
   * @param {{x: number, z: number}} labelPos  band.labelAnchor
   * @param {number} overallSafeDist  D (metres)
   */
  #addLabel(group, labelPos, overallSafeDist) {
    const zone = this.#theme.scene.safeZone;

    // Text sprite for the distance label at the curve centre
    const canvas = this.#doc.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = zone.labelColor;
    ctx.font = zone.labelFont;
    ctx.textAlign = 'center';
    ctx.fillText(`Max: ${overallSafeDist.toFixed(2)}m`, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.set(labelPos.x, 0.5, labelPos.z);
    sprite.scale.set(2, 0.5, 1);
    group.add(sprite);
  }
}
