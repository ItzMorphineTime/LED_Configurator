/**
 * @module render/ResourceTracker
 * Shared disposal of three.js resources: the traverse-dispose of every legacy dispose block (`disposeObject3D`)
 * and a small tracker that remembers roots (and standalone resources) and disposes them in tracking order.
 * Policies: LEDWallView tracks its two group roots with `disposeMaps: true` (the B-H5 fix of Phase 1C H1; legacy
 * never disposed the wall textures; the switch `Strategies.dispose.wallTextures` was retired by 08 P2-12a);
 * SafeDistanceView calls disposeObject3D with `maps: true`; CameraRigView and PropViews use `maps: false`;
 * TransformGizmo always disposes its replaced or removed group (the B-L12 fix of Phase 1C H2; the switch
 * `Strategies.dispose.gizmo` was retired by 08 P2-12a).
 * This module carries no legacy tag.
 * Legacy source: index.html@cd3fd3f 1458-1474, 2321-2328, 2536-2548, 2764-2776, 2831-2837, 2894-2912, 2986-2992.
 * Layer: render (may import vendor/three, core, legacy, domain, geometry). Imports nothing: it only calls
 * `traverse` / `dispose` on the objects it is given.
 */

/**
 * Disposes every geometry and material below (and including) `root`, in traversal order.
 * For each node: if (child.geometry) child.geometry.dispose(); if (child.material): for each material (arrays
 * handled): if (maps && m.map) m.map.dispose(); m.dispose().
 * Geometry before material, map before material: the legacy order at every site.
 * Ports: index.html@cd3fd3f lines 1460-1466 (arrays), 1470-1473, 2324-2327, 2767-2772 (maps), 2833-2836.
 * Side effects: dispatches the THREE `dispose` events of those resources (the renderer frees GPU data).
 * Does not detach `root` from its parent.
 * @param {THREE.Object3D} root  any Object3D (its own geometry/material are disposed too)
 * @param {{maps?: boolean}} [options]  maps: also dispose each material's `map` texture (default false)
 * @returns {void}
 */
export function disposeObject3D(root, { maps = false } = {}) {
  // De-duplicated by identity (04 UV-7; 01 T10's rule): a material shared by many meshes (08 P2-12d's section material of
  // panel mode) or listed in a Material[] (04's per-section combined slots) is disposed once, with its map.
  const seen = new Set();
  const once = (resource) => {
    if (seen.has(resource)) return false;
    seen.add(resource);
    return true;
  };
  root.traverse((child) => {
    if (child.geometry && once(child.geometry)) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of materials) {
        if (!once(m)) continue;
        if (maps && m.map && once(m.map)) m.map.dispose();
        m.dispose();
      }
    }
  });
}

/**
 * @typedef {object} TrackedEntry
 * @property {*} resource                 an Object3D root, or a standalone Texture / BufferGeometry / Material
 * @property {(() => void)|undefined} detach  runs immediately before the entry is disposed
 */

/**
 * Remembers resources and disposes them together, in tracking order.
 */
export class ResourceTracker {
  /** @type {boolean} */
  #disposeMaps;
  /** @type {TrackedEntry[]} */
  #entries = [];

  /**
   * Stores the policy only (R4).
   * Side effects: none.
   * @param {{disposeMaps?: boolean}} [policy]  disposeMaps: also dispose material maps of tracked roots
   */
  constructor({ disposeMaps = false } = {}) {
    this.#disposeMaps = disposeMaps;
  }

  /**
   * Remember a root Object3D (disposed via disposeObject3D(root, {maps: disposeMaps})) or a standalone
   * Texture/BufferGeometry/Material (disposed via .dispose()). `detach` (optional) runs immediately before that
   * entry is disposed, e.g. () => sceneManager.remove(root).
   * Side effects: none (bookkeeping only).
   * @template R
   * @param {R} resource
   * @param {{detach?: () => void}} [options]
   * @returns {R} resource
   */
  track(resource, { detach } = {}) {
    this.#entries.push({ resource, detach });
    return resource;
  }

  /**
   * For each entry in tracking order: entry.detach?.(); dispose the entry. Then forget all entries.
   * Side effects: whatever the detach callbacks do (typically scene removal); THREE `dispose` events.
   * @returns {void}
   */
  dispose() {
    for (const entry of this.#entries) {
      entry.detach?.();
      this.#disposeResource(entry.resource);
    }
    this.#entries = [];
  }

  /**
   * Object3D roots are traversed; anything else is a standalone disposable.
   * @param {*} resource
   */
  #disposeResource(resource) {
    if (resource.isObject3D) disposeObject3D(resource, { maps: this.#disposeMaps });
    else resource.dispose();
  }
}
