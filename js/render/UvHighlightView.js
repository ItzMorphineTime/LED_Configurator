/**
 * @module render/UvHighlightView
 * The hovered panel's outline on the 3D wall (docs/improvements/04-uvs-uv-editor.md 3.5, 5.6; UV-15, optional): one
 * explicitly closed THREE.Line (never LineLoop) through the four world corners of UV_HOVER_CHANGED.panelCorners3D, in
 * the viewer's crosshair colour, drawn on top (no depth test) at RENDER_ORDER.UV_HOVER_OUTLINE and registered with
 * SceneManager.addHelper (the HELPERS layer, so the camera preview never shows it). Its vertices are world coordinates,
 * so it is never parented to the wall group and follows every mesh mode and pivot frame. Allocated on the first hover
 * (nothing exists until the viewer is used) and only hidden afterwards; it is not a hover target and exports never read
 * the scene.
 * Legacy source: none (Feature 4).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { Events } from '../core/EventBus.js';
import { RENDER_ORDER } from '../core/renderOrder.js';

/** The hovered-panel outline. */
export class UvHighlightView {
  /** @type {import('./SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {{uv: {crosshair: string}}} */
  #theme;
  /** @type {THREE.Line|null} */
  #line = null;

  /**
   * Stores the collaborators and subscribes UV_HOVER_CHANGED (R4: nothing is allocated here).
   * Side effects: one bus subscription.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager, bus: import('../core/EventBus.js').EventBus,
   *          theme: {uv: {crosshair: string}}}} deps
   */
  constructor({ sceneManager, bus, theme }) {
    this.#sceneManager = sceneManager;
    this.#theme = theme;
    bus.on(Events.UV_HOVER_CHANGED, ({ panelCorners3D }) => this.#show(panelCorners3D));
  }

  /**
   * Mirror: shows the outline through the corners, or hides it.
   * Side effects: THREE allocation on the first hover; writes the line's positions and visibility.
   * @param {{x: number, y: number, z: number}[]|null} corners
   */
  #show(corners) {
    if (!corners || corners.length !== 4) {
      if (this.#line) this.#line.visible = false;
      return;
    }
    if (!this.#line) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(15), 3));
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(this.#theme.uv.crosshair), depthTest: false, depthWrite: false, transparent: true,
      });
      this.#line = new THREE.Line(geometry, material);
      this.#line.renderOrder = RENDER_ORDER.UV_HOVER_OUTLINE;
      this.#line.frustumCulled = false;
      this.#sceneManager.addHelper(this.#line);
    }
    const position = this.#line.geometry.attributes.position;
    for (let k = 0; k < 5; k++) {
      const p = corners[k % 4];
      position.setXYZ(k, p.x, p.y, p.z);
    }
    position.needsUpdate = true;
    this.#line.visible = true;
  }
}
