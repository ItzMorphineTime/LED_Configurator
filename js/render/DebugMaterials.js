/**
 * @module render/DebugMaterials
 * The shared materials of the normals debug view (docs/improvements/01-normals.md 5.2, 6.8): the face-orientation
 * and normal-colour ShaderMaterials that LEDWallView shows over the content materials, and the vertex-coloured line
 * material of NormalsDebugView. Each is created on first use (nothing is allocated before the debug view is used, so
 * three's global id counters and the draw order of every other object stay as they were, R4/R5) and lives until
 * dispose(), which only App teardown calls: a wall rebuild never disposes them (MaterialOverride restores first).
 * Legacy source: none (Feature 1).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry). The theme is injected.
 */

import THREE from '../vendor/three.js';

/**
 * The shared vertex shader: the world normal of a rigid transform (01 6.1), without mat3(modelMatrix), which is not
 * GLSL ES 1.00 and would fail on r128's WebGL1 fallback.
 */
const VERTEX_SHADER = `
varying vec3 vWorldNormal;
void main() {
  vWorldNormal = (modelMatrix * vec4(normal, 0.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Face orientation: front faces uFront, back faces uBack (decided by gl_FrontFacing only), mildly shaded. */
const FACE_ORIENTATION_FRAGMENT = `
uniform vec3 uFront;
uniform vec3 uBack;
varying vec3 vWorldNormal;
void main() {
  vec3 n = length(vWorldNormal) > 0.0 ? normalize(vWorldNormal) : vec3(0.0, 0.0, 1.0);
  float shade = 0.6 + 0.4 * abs(dot(n, normalize(vec3(0.35, 0.6, 0.7))));
  gl_FragColor = vec4((gl_FrontFacing ? uFront : uBack) * shade, 1.0);
}
`;

/** Normal colours: the stored world normal mapped to RGB (n * 0.5 + 0.5), the same on both sides. */
const NORMAL_COLORS_FRAGMENT = `
varying vec3 vWorldNormal;
void main() {
  vec3 n = length(vWorldNormal) > 0.0 ? normalize(vWorldNormal) : vec3(0.0, 0.0, 1.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
`;

/**
 * The lazily created, shared debug materials.
 */
export class DebugMaterials {
  /** @type {{scene: {debug: {faceFront: number, faceBack: number}}}} */
  #theme;
  /** @type {THREE.ShaderMaterial|null} */
  #faceOrientation = null;
  /** @type {THREE.ShaderMaterial|null} */
  #normalColors = null;
  /** @type {THREE.LineBasicMaterial|null} */
  #line = null;

  /**
   * Stores the theme only (R4: no allocation in the constructor).
   * Side effects: none.
   * @param {{theme: {scene: {debug: {faceFront: number, faceBack: number}}}}} deps  theme.scene.debug (01 4.6)
   */
  constructor({ theme }) {
    this.#theme = theme;
  }

  /**
   * The face-orientation material (DoubleSide; uniforms uFront/uBack from theme.scene.debug), created on first use.
   * Side effects: the first call allocates one ShaderMaterial (a THREE id).
   * @returns {THREE.ShaderMaterial}
   */
  faceOrientation() {
    if (!this.#faceOrientation) {
      const debug = this.#theme.scene.debug;
      this.#faceOrientation = new THREE.ShaderMaterial({
        uniforms: { uFront: { value: new THREE.Color(debug.faceFront) }, uBack: { value: new THREE.Color(debug.faceBack) } },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FACE_ORIENTATION_FRAGMENT,
        side: THREE.DoubleSide,
      });
    }
    return this.#faceOrientation;
  }

  /**
   * The world-normal colour material (DoubleSide), created on first use.
   * Side effects: the first call allocates one ShaderMaterial (a THREE id).
   * @returns {THREE.ShaderMaterial}
   */
  normalColors() {
    if (!this.#normalColors) {
      this.#normalColors = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: NORMAL_COLORS_FRAGMENT,
        side: THREE.DoubleSide,
      });
    }
    return this.#normalColors;
  }

  /**
   * The override material of a shading mode: null for 'content' (the content materials show).
   * Side effects: may allocate the material (first use).
   * @param {string} mode  'content' | 'faceOrientation' | 'normalColors' (DebugShading)
   * @returns {THREE.ShaderMaterial|null}
   * @throws {RangeError} for any other mode (DebugViewController only passes DebugShading values)
   */
  forShading(mode) {
    switch (mode) {
      case 'content': return null;
      case 'faceOrientation': return this.faceOrientation();
      case 'normalColors': return this.normalColors();
      default: throw new RangeError(`Unknown debug shading ${JSON.stringify(mode)}`);
    }
  }

  /**
   * The normal-line material: one shared LineBasicMaterial({vertexColors: true, toneMapped: false}), created on first
   * use; each call sets depthTest = !onTop ("Draw on top" ignores depth).
   * Side effects: may allocate the material (first use); writes its depthTest.
   * @param {{onTop: boolean}} options
   * @returns {THREE.LineBasicMaterial}
   */
  lineMaterial({ onTop }) {
    if (!this.#line) this.#line = new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false });
    this.#line.depthTest = !onTop;
    return this.#line;
  }

  /**
   * Disposes every material created so far (App teardown only; never called by a wall rebuild).
   * Side effects: THREE dispose events.
   * @returns {void}
   */
  dispose() {
    for (const m of [this.#faceOrientation, this.#normalColors, this.#line]) if (m) m.dispose();
    this.#faceOrientation = null;
    this.#normalColors = null;
    this.#line = null;
  }
}
