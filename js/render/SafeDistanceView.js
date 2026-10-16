/**
 * @module render/SafeDistanceView
 * The safe-distance floor visualisation (legacy `safeDistanceMesh`): a green-to-red band on the floor from the
 * wall out to the maximum distance D at which the film frame still fits the (flat) wall, the outline at D and a
 * "Max: D m" label sprite. The group is a registered helper and is also the source of the safe-distance OBJ export
 * (ProjectIO reads `object3D`).
 * Legacy source: index.html@cd3fd3f 2586-2762 (createSafeDistanceMesh, minus the bounds copy 2597-2603 and the walk
 * copy 2614-2647, now WallLayout.flatEdges / framingBounds), 2764-2776 (removeSafeDistanceMesh).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { Strategies, unsupportedStrategy } from '../legacy/LegacyCompat.js';
import { disposeObject3D } from './ResourceTracker.js';

/**
 * @typedef {object} SafeBand
 * @property {number[]} vertices        floor quads, 4 vertices per column (x, 0.005, z)
 * @property {number[]} indices         2 triangles per column
 * @property {number[]} colors          wall colour x2, threshold colour x2 per column
 * @property {{x: number, z: number}[]} safeLinePoints  safeLeft of the first column, then every safeRight
 */

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
   * Replaces the safe-distance group. D = cine.maxSafeDistance(bounds); one quad per wall column, offset along
   * that column's own normal; the outline and the label only when there is at least one column. The group is
   * added to the scene even when the wall has no edges (an empty group, no throw). The legacy inner guard
   * `if (!cameraPreviewEnabled) return` (2589) is unreachable (the only caller checks the flag) and dropped.
   * `layout` and `bounds` arrive precomputed from CameraHub.syncSafeDistance (permitted reordering PR7).
   * Ports: index.html@cd3fd3f lines 2586-2762 (2591-2612 and 2614-2647 replaced by the arguments).
   * Side effects: removes and disposes the previous group; allocates the new group, then (when there are columns)
   *   the floor geometry, material and mesh, the line material, geometry and Line, the label canvas (DOM),
   *   CanvasTexture, SpriteMaterial and Sprite; adds the group to the scene as a helper.
   * @param {{layout: import('../geometry/WallLayout.js').WallLayout,
   *          cine: import('../domain/CineCamera.js').CineCamera,
   *          bounds: {totalWidth: number, maxHeight: number}}} args
   * @returns {void}
   * @throws {Error} unsupportedStrategy for a Strategies.safeDistanceBand other than 'per-column-own-normal'
   */
  create({ layout, cine, bounds }) {
    // LEGACY(B-M15, B-L29): un-mitred per-column quads, each offset along its own column normal (overlaps on
    // concave joins, wedge gaps on convex ones), wound so the floor faces -Y; outline = first safeLeft + every
    // safeRight.
    switch (Strategies.safeDistanceBand) {
      case 'per-column-own-normal':
        break;
      default:
        throw unsupportedStrategy('safeDistanceBand', Strategies.safeDistanceBand);
    }

    this.remove();

    const group = new THREE.Group();
    this.#group = group;

    // Safe distance = maximum distance where the frame still fits within the wall (MIN over both dimensions)
    const overallSafeDist = cine.maxSafeDistance(bounds);

    // Edge positions matching the wall walk exactly (flattened across sections)
    const allEdges = layout.flatEdges();

    const band = this.#band(allEdges, overallSafeDist);

    if (band.vertices.length > 0) {
      this.#addFloor(group, band);
      this.#addOutline(group, band.safeLinePoints);
      this.#addLabel(group, band.safeLinePoints, overallSafeDist);
    }

    this.#sceneManager.addHelper(group);
  }

  /**
   * Removes and disposes the group, including the label texture (maps: true).
   * Ports: index.html@cd3fd3f lines 2764-2776.
   * Side effects: removes the group helper from the scene; disposes its geometries, maps and materials.
   * @returns {void}
   */
  remove() {
    if (this.#group) {
      this.#sceneManager.removeHelper(this.#group);
      disposeObject3D(this.#group, { maps: true });
      this.#group = null;
    }
  }

  /**
   * The floor band arrays: per column i (edges i, i + 1), the wall points and the points offset by D along the
   * column's own normal (-dz / len, dx / len), at y = 0.005 (above the grid, against z-fighting).
   * Ports: index.html@cd3fd3f lines 2649-2708.
   * @param {{x: number, z: number}[]} allEdges
   * @param {number} overallSafeDist  D (metres)
   * @returns {SafeBand}
   */
  #band(allEdges, overallSafeDist) {
    const zone = this.#theme.scene.safeZone;

    // Floor mesh from the wall to the safe distance
    const vertices = [];
    const indices = [];
    const colors = [];
    let vertexIndex = 0;

    // Points of the safe distance line, which follows the wall shape
    const safeLinePoints = [];

    for (let i = 0; i < allEdges.length - 1; i++) {
      const leftEdge = allEdges[i];
      const rightEdge = allEdges[i + 1];

      // Panel facing direction (normal pointing toward the camera, +Z for a flat wall)
      const dx = rightEdge.x - leftEdge.x;
      const dz = rightEdge.z - leftEdge.z;

      // Normal perpendicular to the panel edge, pointing outward (toward the viewer)
      const edgeLen = Math.sqrt(dx * dx + dz * dz);
      const normalX = -dz / edgeLen;
      const normalZ = dx / edgeLen;

      // Wall edge points (on the floor)
      const wallLeft = { x: leftEdge.x, z: leftEdge.z };
      const wallRight = { x: rightEdge.x, z: rightEdge.z };

      // Safe distance points (extended along the normal by the OVERALL safe distance)
      const safeLeft = {
        x: leftEdge.x + normalX * overallSafeDist,
        z: leftEdge.z + normalZ * overallSafeDist
      };
      const safeRight = {
        x: rightEdge.x + normalX * overallSafeDist,
        z: rightEdge.z + normalZ * overallSafeDist
      };

      // Safe line points: the left point of the first column, then every right point
      if (i === 0) {
        safeLinePoints.push(safeLeft);
      }
      safeLinePoints.push(safeRight);

      // Vertices (on the floor, y = 0.005 to avoid z-fighting)
      vertices.push(wallLeft.x, 0.005, wallLeft.z);
      vertices.push(wallRight.x, 0.005, wallRight.z);
      vertices.push(safeRight.x, 0.005, safeRight.z);
      vertices.push(safeLeft.x, 0.005, safeLeft.z);

      // Colours: gradient from green (wall, safe) to red (threshold)
      const wallColor = zone.wallColor;
      const thresholdColor = zone.thresholdColor;
      colors.push(...wallColor, ...wallColor, ...thresholdColor, ...thresholdColor);

      // Two triangles
      indices.push(
        vertexIndex, vertexIndex + 1, vertexIndex + 2,
        vertexIndex, vertexIndex + 2, vertexIndex + 3
      );
      vertexIndex += 4;
    }

    return { vertices, indices, colors, safeLinePoints };
  }

  /**
   * The translucent vertex-coloured floor mesh.
   * Ports: index.html@cd3fd3f lines 2711-2726.
   * Side effects: allocates geometry, material, mesh (in this order) and adds the mesh to the group.
   * @param {THREE.Group} group
   * @param {SafeBand} band
   */
  #addFloor(group, { vertices, indices, colors }) {
    const zone = this.#theme.scene.safeZone;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
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
   * The outline at the safe distance, following the wall shape (y = 0.02).
   * Ports: index.html@cd3fd3f lines 2728-2737.
   * Side effects: allocates the material BEFORE the geometry (legacy order), then the Line; adds it to the group.
   * @param {THREE.Group} group
   * @param {{x: number, z: number}[]} safeLinePoints
   */
  #addOutline(group, safeLinePoints) {
    const zone = this.#theme.scene.safeZone;
    const lineMaterial = new THREE.LineBasicMaterial({ color: zone.lineColor, transparent: true, opacity: zone.lineOpacity, linewidth: 2 });
    const linePositions = [];
    safeLinePoints.forEach(pt => {
      linePositions.push(pt.x, 0.02, pt.z);
    });
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const safeLine = new THREE.Line(lineGeom, lineMaterial);
    group.add(safeLine);
  }

  /**
   * The "Max: D m" label sprite at the middle point of the safe line (256 x 64 canvas, scale 2 x 0.5).
   * Ports: index.html@cd3fd3f lines 2739-2758.
   * Side effects: creates and draws a canvas (DOM); allocates CanvasTexture, SpriteMaterial and Sprite (in this
   *   order) and adds the sprite to the group.
   * @param {THREE.Group} group
   * @param {{x: number, z: number}[]} safeLinePoints
   * @param {number} overallSafeDist  D (metres)
   */
  #addLabel(group, safeLinePoints, overallSafeDist) {
    const zone = this.#theme.scene.safeZone;

    // Centre point of the safe line for the label
    const midIndex = Math.floor(safeLinePoints.length / 2);
    const labelPos = safeLinePoints[midIndex];

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
