/** @module render/ResourceTracker  Fixture (good): the leaf utility that interaction/ may import. */
import THREE from '../vendor/three.js';

export function disposeObject3D(root) {
    return root instanceof THREE.Object3D;
}
