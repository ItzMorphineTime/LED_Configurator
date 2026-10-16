/**
 * @module render/PropViews
 * The procedural reference props in the viewport (legacy `personMesh` / `carMesh`): a PropView base that owns
 * the root group's lifecycle and transform, and the two builders, PersonPropView and CarPropView, whose THREE
 * allocation order is the legacy statement order (R5). Props are content objects (SceneManager.add), not helpers.
 * Legacy source: index.html@cd3fd3f 2830-2903 (createPersonMesh, updatePersonTransform, removePersonMesh),
 * 2905-2994 (createCarMesh, updateCarTransform, removeCarMesh), 3447-3461 (pick meshes).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { disposeObject3D } from './ResourceTracker.js';

/**
 * Base view of a prop: one root group, built by the subclass's buildMesh(), disposed with maps: false.
 * The scene add is a separate step (addToScene) because legacy applied the transform (and the gizmo follow)
 * between building and adding.
 */
export class PropView {
  /** @type {import('./SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {THREE.Group|null} legacy `personMesh` / `carMesh` */
  #root = null;

  /**
   * Stores the dependencies only (R4): nothing is allocated until create().
   * Side effects: none.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager, theme: {scene: object}}} deps
   *   theme: { scene: SceneTheme }; read by the subclass constructors, which keep their own part (person / car)
   */
  constructor({ sceneManager }) {
    this.#sceneManager = sceneManager;
  }

  /** Side effects: none. @returns {boolean} whether the root exists (legacy `personMesh` / `carMesh` truthiness) */
  get exists() {
    return !!this.#root;
  }

  /** Side effects: none. @returns {THREE.Group|null} the root group or null (legacy `personMesh` / `carMesh`) */
  get object3D() {
    return this.#root;
  }

  /**
   * Builds a new root. An existing root is removed and disposed first but not nulled (it is replaced right away).
   * Does NOT add the new root to the scene (see addToScene).
   * Ports: index.html@cd3fd3f lines 2831-2839 / 2906-2914 (the body of the build is buildMesh()).
   * Side effects: may remove and dispose the previous root; allocates the new root (buildMesh).
   * @returns {void}
   */
  create() {
    if (this.#root) {
      this.#sceneManager.remove(this.#root);
      disposeObject3D(this.#root);
    }

    this.#root = this.buildMesh();
  }

  /**
   * Adds the root to the scene.
   * Ports: index.html@cd3fd3f line 2880 / 2971.
   * Side effects: scene.add(root).
   * @returns {void}
   */
  addToScene() {
    this.#sceneManager.add(this.#root);
  }

  /**
   * Applies the prop pose (on the floor) and scale. The caller guarantees the root exists.
   * Ports: index.html@cd3fd3f lines 2885-2887 / 2976-2978.
   * Side effects: writes the root position, rotation.y and scale.
   * @param {import('../domain/Prop.js').Prop} prop
   * @returns {void}
   */
  updateTransform(prop) {
    const root = this.#root;
    root.position.set(prop.posX, 0, prop.posZ);
    root.rotation.y = prop.rotY * Math.PI / 180;
    root.scale.setScalar(prop.scale);
  }

  /**
   * Removes and disposes the root (no maps) and forgets it.
   * Ports: index.html@cd3fd3f lines 2894-2903 / 2985-2994.
   * Side effects: scene.remove(root); disposes its geometries and materials.
   * @returns {void}
   */
  remove() {
    if (this.#root) {
      this.#sceneManager.remove(this.#root);
      disposeObject3D(this.#root);
      this.#root = null;
    }
  }

  /**
   * The meshes to raycast, in traversal order (the root itself is a Group, so only its mesh children).
   * Ports: index.html@cd3fd3f lines 3447-3452 / 3456-3461 (the userData tagging is SelectionManager's).
   * Side effects: none.
   * @returns {THREE.Mesh[]} [] when there is no root
   */
  pickMeshes() {
    const meshes = [];
    if (!this.#root) return meshes;
    this.#root.traverse(child => {
      if (child.isMesh) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  /**
   * Abstract: builds a new root group in the legacy allocation order.
   * Side effects: allocates THREE objects.
   * @returns {THREE.Group}
   */
  buildMesh() {
    throw new Error('PropView.buildMesh() is abstract');
  }
}

/**
 * The person prop: legs, torso, arms, neck and head (about 1.78 m tall).
 */
export class PersonPropView extends PropView {
  /** @type {{body: number, dark: number, opacity: number}} SceneTheme.person */
  #style;

  /**
   * Side effects: none.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager, theme: {scene: object}}} deps
   */
  constructor(deps) {
    super(deps);
    this.#style = deps.theme.scene.person;
  }

  /**
   * Ports: index.html@cd3fd3f lines 2839-2877.
   * Side effects: allocates the group, the two materials, then geometry/meshes part by part.
   * @returns {THREE.Group}
   */
  buildMesh() {
    const style = this.#style;
    const personMesh = new THREE.Group();
    const personMaterial = new THREE.MeshBasicMaterial({ color: style.body, transparent: true, opacity: style.opacity });
    const darkMaterial = new THREE.MeshBasicMaterial({ color: style.dark, transparent: true, opacity: style.opacity });

    // Legs (two cylinders)
    const legGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.85, 8);
    const leftLeg = new THREE.Mesh(legGeom, darkMaterial);
    leftLeg.position.set(-0.1, 0.425, 0);
    personMesh.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeom, darkMaterial);
    rightLeg.position.set(0.1, 0.425, 0);
    personMesh.add(rightLeg);

    // Torso (box)
    const torsoGeom = new THREE.BoxGeometry(0.4, 0.55, 0.22);
    const torso = new THREE.Mesh(torsoGeom, personMaterial);
    torso.position.set(0, 1.125, 0);
    personMesh.add(torso);

    // Arms (two cylinders)
    const armGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8);
    const leftArm = new THREE.Mesh(armGeom, personMaterial);
    leftArm.position.set(-0.28, 1.1, 0);
    personMesh.add(leftArm);
    const rightArm = new THREE.Mesh(armGeom, personMaterial);
    rightArm.position.set(0.28, 1.1, 0);
    personMesh.add(rightArm);

    // Neck
    const neckGeom = new THREE.CylinderGeometry(0.06, 0.08, 0.12, 8);
    const neck = new THREE.Mesh(neckGeom, personMaterial);
    neck.position.set(0, 1.46, 0);
    personMesh.add(neck);

    // Head (sphere)
    const headGeom = new THREE.SphereGeometry(0.13, 16, 12);
    const head = new THREE.Mesh(headGeom, personMaterial);
    head.position.set(0, 1.65, 0);
    personMesh.add(head);

    return personMesh;
  }
}

/**
 * The car prop: body, cabin, windshield, rear window, four wheels and two headlights (about 4.5 m long).
 */
export class CarPropView extends PropView {
  /** @type {{body: {color: number, opacity: number}, dark: {color: number, opacity: number},
   *          glass: {color: number, opacity: number}, lights: number}} SceneTheme.car */
  #style;

  /**
   * Side effects: none.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager, theme: {scene: object}}} deps
   */
  constructor(deps) {
    super(deps);
    this.#style = deps.theme.scene.car;
  }

  /**
   * Ports: index.html@cd3fd3f lines 2914-2968 (including the final carMesh.scale.setScalar(1)).
   * Side effects: allocates the group, the three materials, then geometry/meshes part by part.
   * @returns {THREE.Group}
   */
  buildMesh() {
    const style = this.#style;
    const carMesh = new THREE.Group();
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: style.body.color, transparent: true, opacity: style.body.opacity });
    const darkMaterial = new THREE.MeshBasicMaterial({ color: style.dark.color, transparent: true, opacity: style.dark.opacity });
    const glassMaterial = new THREE.MeshBasicMaterial({ color: style.glass.color, transparent: true, opacity: style.glass.opacity });

    // Main body (lower)
    const bodyLowerGeom = new THREE.BoxGeometry(4.5, 0.8, 1.8);
    const bodyLower = new THREE.Mesh(bodyLowerGeom, bodyMaterial);
    bodyLower.position.set(0, 0.55, 0);
    carMesh.add(bodyLower);

    // Cabin (upper)
    const cabinGeom = new THREE.BoxGeometry(2.2, 0.7, 1.6);
    const cabin = new THREE.Mesh(cabinGeom, bodyMaterial);
    cabin.position.set(-0.3, 1.25, 0);
    carMesh.add(cabin);

    // Windshield (angled)
    const windshieldGeom = new THREE.BoxGeometry(0.05, 0.65, 1.5);
    const windshield = new THREE.Mesh(windshieldGeom, glassMaterial);
    windshield.position.set(0.75, 1.2, 0);
    windshield.rotation.z = -0.5;
    carMesh.add(windshield);

    // Rear window
    const rearWindowGeom = new THREE.BoxGeometry(0.05, 0.55, 1.5);
    const rearWindow = new THREE.Mesh(rearWindowGeom, glassMaterial);
    rearWindow.position.set(-1.35, 1.2, 0);
    rearWindow.rotation.z = 0.4;
    carMesh.add(rearWindow);

    // Wheels (4)
    const wheelGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16);
    const wheelPositions = [
      { x: 1.4, z: 0.9 }, { x: 1.4, z: -0.9 },
      { x: -1.4, z: 0.9 }, { x: -1.4, z: -0.9 }
    ];
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeom, darkMaterial);
      wheel.position.set(pos.x, 0.35, pos.z);
      wheel.rotation.x = Math.PI / 2;
      carMesh.add(wheel);
    });

    // Headlights
    const lightGeom = new THREE.BoxGeometry(0.05, 0.15, 0.3);
    const lightMat = new THREE.MeshBasicMaterial({ color: style.lights });
    [-0.6, 0.6].forEach(z => {
      const light = new THREE.Mesh(lightGeom, lightMat);
      light.position.set(2.25, 0.55, z);
      carMesh.add(light);
    });

    // Real-world size already (about 4.5 m long): unit scale, as legacy
    carMesh.scale.setScalar(1);

    return carMesh;
  }
}
