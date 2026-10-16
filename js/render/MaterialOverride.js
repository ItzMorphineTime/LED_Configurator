/**
 * @module render/MaterialOverride
 * Stash and restore of the original materials of meshes while a shared override material (the normals debug view's
 * face-orientation or normal-colour shading, docs/improvements/01-normals.md 5.2) is shown on them. The override is
 * one material per call; the stash keeps `mesh.material` by reference, so a Material[] (spec 04's per-section
 * combined layout) comes back intact. LEDWallView restores before it disposes a wall, so a rebuild never disposes the
 * shared debug materials and every original is disposed with its own wall (AC 12).
 * Legacy source: none (Feature 1).
 * Layer: render (imports nothing; it only reads and writes `material` on the objects it is given, so it is
 * Node-tested with plain objects).
 */

/**
 * The material stash of one view (LEDWallView owns one).
 */
export class MaterialOverride {
  /** @type {Map<object, *>} mesh -> its original material (or material array), in apply order */
  #stash = new Map();

  /**
   * For each mesh: stash its current material if it is not stashed yet, then show `material`. Idempotent; a second
   * call with another override keeps the first stash (the original), so restore() always brings back the original.
   * Side effects: writes mesh.material of every given mesh.
   * @param {Iterable<{material: *}>} meshes
   * @param {*} material  the override (one material: r128 then draws the whole index range and ignores the geometry
   *   groups, 04 2.3 row 01-1)
   * @returns {void}
   */
  apply(meshes, material) {
    for (const mesh of meshes) {
      if (!this.#stash.has(mesh)) this.#stash.set(mesh, mesh.material);
      mesh.material = material;
    }
  }

  /**
   * Puts every stashed material back on its mesh, in apply order, and clears the stash.
   * Side effects: writes mesh.material of every stashed mesh.
   * @returns {number} the number of meshes restored (0 when nothing was stashed)
   */
  restore() {
    let restored = 0;
    for (const [mesh, original] of this.#stash) {
      mesh.material = original;
      restored++;
    }
    this.#stash.clear();
    return restored;
  }

  /** Side effects: none. @returns {boolean} whether an override is shown (the stash is not empty) */
  get active() {
    return this.#stash.size > 0;
  }
}
