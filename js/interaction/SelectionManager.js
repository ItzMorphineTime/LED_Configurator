/**
 * @module interaction/SelectionManager
 * The registry of Selectables (camera, person, car), the selection state (legacy `selectedObject`) and
 * raycast picking (legacy handleViewportClick). Defines the Selectable typedef that the app controllers
 * implement and the TransformGizmo drives.
 * 03 T5 (docs/improvements/03-pivot.md 5.4; 07 C33): the path-B hook set of the Selectable typedef (shared with spec 02),
 * the required `kind` (inferred only for the three legacy ids), the pickAt rule (pickPriority counts only against wall,
 * i.e. section, hits; otherwise the nearest hit wins, the legacy rule) and the `modes` of SELECTION_CHANGED.
 * 2026-10-31 (the owner's request; spec 02's PickProvider without its multi-selection): registerProvider (the wall
 * sections, app/SectionSelection), find() through the providers, the click pick hitAt() (ViewportInput, on a release
 * within the click threshold), prune() after rebuilds, and a press that misses keeps a selected section (only a click,
 * Escape or the context menu deselects it, so an orbit drag never does).
 * Legacy source: index.html@cd3fd3f 1360 (selectedObject), 3139-3153 (selectObject, deselectObject),
 * 3427-3474 (handleViewportClick).
 * Layer: interaction (may import vendor/three, core, legacy, interaction, and render/ResourceTracker only).
 */
import { Events } from '../core/EventBus.js';

/**
 * @typedef {object} Selectable   implemented by CameraController ('camera'), PropController ('person', 'car') and, since
 *  03 T5, PivotController ('pivot'); Feature 2 adds the section Selectables, Feature 5 a projection-point Selectable.
 *  The optional members are the path-B hook set of 03 5.4 (07 C33, one-to-one with 07's Selectable v2); legacy targets
 *  implement none of them and behave exactly as in Phase 1.
 * @property {string} id                       'camera' | 'person' | 'car' | 'pivot' | ...
 * @property {string} label                    badge text: 'Camera' | 'Person' | 'Car' (legacy names map 3161) | 'Pivot'
 * @property {'camera'|'prop'|'pivot'|'projector'|'section'} [kind]   REQUIRED for every Selectable added after Phase 1
 *                                             (register throws without it); inferred only for the legacy ids
 *                                             ('camera' -> 'camera'; 'person', 'car' -> 'prop')
 * @property {number} [pickPriority]           default 0; outranks wall (section) hits only (pickAt). Pivot 10, HDRI point 9.
 * @property {(mode: 'translate'|'rotate') => ({x: boolean, y: boolean, z: boolean}|null)} [allowedAxes]
 *                                             default every axis in both modes; null = the mode is unsupported (no
 *                                             handles, left out of SELECTION_CHANGED.modes); a false axis gets no handle
 * @property {() => boolean} isPickable        legacy pick gating (3441, 3446, 3455)
 * @property {() => import('three').Object3D[]} pickMeshes   meshes to raycast, in legacy push order (3442-3461)
 * @property {() => boolean} hasGizmoTarget    legacy updateGizmoPosition gating (previewCameraGroup / personMesh / carMesh, 3126-3134)
 * @property {(out: import('three').Vector3) => import('three').Vector3} gizmoAnchor   sets and returns `out`
 * @property {(rotation: import('three').Euler, mode?: 'translate'|'rotate') => void} orientGizmo   local-space orientation
 *                                             (3107-3118); the second argument is the gizmo mode (legacy targets ignore it)
 * @property {() => void} [beginGizmoDrag]     TransformGizmo.onMouseDown, on a handle hit
 * @property {(opts: {cancel: boolean}) => void} [endGizmoDrag]   the ONLY end hook: {cancel: false} on the mouse-up that
 *                                             ends a drag (commit); {cancel: true} from TransformGizmo.cancelDrag() (Escape)
 *                                             and detach() during a drag (restore). Absent: the drag cannot be cancelled.
 * @property {(movement: import('three').Vector3, ctx?: DragContext) => void} applyGizmoTranslate   domain write + pose
 *                                             event + refresh (legacy targets ignore ctx)
 * @property {(axis: 'x'|'y'|'z', deltaDeg: number, ctx?: DragContext) => void} applyGizmoRotate   deltaDeg already signed
 *                                             (Strategies.gizmoRotateSign)
 */

/**
 * @typedef {object} DragContext   the context of one gizmo drag step (03 5.4)
 * @property {'world'|'local'} space
 * @property {{x: number, y: number, z: number}} axisWorld   the unit drag axis in world space
 * @property {{pivotM: number}|null} snap      interaction.snap iff Ctrl/Cmd is held, else null
 */

/** The kinds of the three Phase-1 Selectables, which declare none (03 5.4: inferred only for these ids). */
const LEGACY_KINDS = Object.freeze({ camera: 'camera', person: 'prop', car: 'prop' });

/** The gizmo modes, in the order of SELECTION_CHANGED.modes. */
const GIZMO_MODES = Object.freeze(['translate', 'rotate']);

/**
 * @typedef {object} PickProvider   a source of Selectables that are not registered one by one (2026-10-31: the wall
 *  sections, app/SectionSelection; spec 02's PickProvider without multi-selection)
 * @property {() => boolean} isPickable
 * @property {() => import('three').Object3D[]} pickMeshes   raycast by the click pick (hitAt) only, never by pickAt
 * @property {(hit: object) => string|null} resolveHit       the selection id under a raw intersection (null: click-through)
 * @property {(id: string) => Selectable|null} find          the Selectable of an id it owns (declares its kind), else null
 */

/**
 * The Selectable registry and the current selection. Owns the legacy global `selectedObject` (selectedId, the id
 * of a registered Selectable). select() / deselect() attach and detach the TransformGizmo and emit
 * SELECTION_CHANGED, which ViewportToolbar mirrors.
 * Wiring (App): registers the camera, person and car controllers in that order (the raycast tie order).
 * ViewportInput calls pickAt() on canvas mousedown and deselect() on Escape; CameraController and PropController
 * call deselect() when their selected object is hidden.
 */
export class SelectionManager {
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;
  /** @type {import('./TransformGizmo.js').TransformGizmo} */
  #gizmo;
  /** @type {import('./InputState.js').PointerRay} */
  #pointerRay;
  /** @type {import('./InputState.js').InteractionState} */
  #interaction;
  /** @type {Selectable[]} registration order = raycast tie order */
  #selectables = [];
  /** @type {Map<Selectable, string>} the kind of each registered Selectable (declared, or inferred for a legacy id) */
  #kinds = new Map();
  /** @type {string|null} legacy `selectedObject` */
  #selectedId = null;
  /** @type {Selectable|null} */
  #selected = null;
  /** @type {PickProvider[]} 2026-10-31: registration order */
  #providers = [];
  /** @type {WeakSet<Selectable>} the Selectables the providers made (kindOf reads their declared kind) */
  #provided = new WeakSet();

  /**
   * Stores the collaborators.
   * Side effects: none.
   * @param {{bus: import('../core/EventBus.js').EventBus, gizmo: import('./TransformGizmo.js').TransformGizmo,
   *          pointerRay: import('./InputState.js').PointerRay,
   *          interaction: import('./InputState.js').InteractionState}} deps
   */
  constructor({ bus, gizmo, pointerRay, interaction }) {
    this.#bus = bus;
    this.#gizmo = gizmo;
    this.#pointerRay = pointerRay;
    this.#interaction = interaction;
  }

  /** @type {{onSelectionChanged(payload: SelectionPayload): void}[]} 04 5.3 (path B of 07 I2): ordered observers */
  #observers = [];
  /** @type {((hit: object|null) => void)[]} 04 5.3: hover-hit observers (fed by spec 02's hoverAt; none in Phase 1) */
  #hoverHitObservers = [];

  /**
   * @typedef {object} SelectionPayload  04 5.3 (07 I2's observer payload, path B on the Phase-1 manager)
   * @property {string|null} primaryId
   * @property {Selectable|null} primary   the primary member's own Selectable
   * @property {'camera'|'prop'|'section'|'pivot'|'projector'|null} kind
   * @property {string[]} ids
   * @property {'api'} origin
   */

  /**
   * Registers a selection observer (04 5.3, the path-B form of 07 I2's addObserver): `o.onSelectionChanged(payload)` is
   * called exactly once after every SELECTION_CHANGED, after gizmo.attach / detach. Direct ordered calls (R2), not events.
   * App registers the UvController (it follows `kind === 'section'`, which only spec 02's section Selectables produce).
   * Side effects: none besides the registration.
   * @param {{onSelectionChanged(payload: SelectionPayload): void}} o
   */
  addObserver(o) {
    this.#observers.push(o);
  }

  /**
   * Registers a hover-hit observer (04 5.3). Spec 02's hoverAt passes its nearest raw wall intersection (or null) to
   * these; the Phase-1 manager has no hover raycast, so until spec 02 T23 nothing calls them and the UV hover probe
   * raycasts on its own (WallHoverProbe, own-raycast mode).
   * Side effects: none besides the registration.
   * @param {(hit: object|null) => void} fn
   */
  addHoverHitObserver(fn) {
    this.#hoverHitObservers.push(fn);
  }

  /** Calls every observer with the payload (the single post-change point of select and deselect). */
  #notifyObservers(payload) {
    for (const o of this.#observers) o.onSelectionChanged(payload);
  }

  /**
   * Registers a Selectable. Registration order is the raycast tie order: App registers camera, person, car
   * (the legacy push order 3440-3462), then the pivot (03 5.8).
   * Side effects: none besides the registration.
   * @param {Selectable} selectable
   * @throws {Error} for a Selectable without `kind` whose id is not one of the legacy ids (03 5.4)
   */
  register(selectable) {
    const kind = selectable.kind ?? LEGACY_KINDS[selectable.id];
    if (!kind) throw new Error(`Selectable ${JSON.stringify(selectable.id)} must declare its kind (03 5.4)`);
    this.#kinds.set(selectable, kind);
    this.#selectables.push(selectable);
  }

  /**
   * Registers a pick provider (2026-10-31), after every Selectable registration: find() asks the providers after the
   * registered Selectables, and the click pick (hitAt) raycasts their meshes.
   * Side effects: none besides the registration.
   * @param {PickProvider} provider
   */
  registerProvider(provider) {
    this.#providers.push(provider);
  }

  /**
   * Side effects: none.
   * @param {Selectable|null} selectable
   * @returns {string|null} its kind (declared, or inferred for a legacy id; the declared kind of a provider's
   *   Selectable), null when it is neither registered nor made by a provider
   */
  kindOf(selectable) {
    return this.#kinds.get(selectable) ?? (selectable && this.#provided.has(selectable) ? selectable.kind ?? null : null);
  }

  /** Side effects: none. @returns {string|null} legacy selectedObject: 'camera' | 'person' | 'car' | null */
  get selectedId() {
    return this.#selectedId;
  }

  /** Side effects: none. @returns {Selectable|null} the selected registered Selectable or null */
  get selected() {
    return this.#selected;
  }

  /**
   * Side effects: none.
   * @param {string} id
   * @returns {boolean} selectedId === id (legacy `selectedObject === id`)
   */
  isSelected(id) {
    return this.#selectedId === id;
  }

  /**
   * Side effects: none.
   * @param {string} id
   * @returns {Selectable|null} the registered Selectable with that id, else the first provider's Selectable for it
   *   (2026-10-31), or null
   */
  find(id) {
    const registered = this.#selectables.find((s) => s.id === id);
    if (registered) return registered;
    for (const p of this.#providers) {
      const s = p.find(id);
      if (s) {
        this.#provided.add(s);
        return s;
      }
    }
    return null;
  }

  /**
   * Selects a registered Selectable: state, badge mirror, then the gizmo (rebuilt for the new target).
   * 03 5.4: the payload carries `modes`, the gizmo modes whose allowedAxes is not null (both for a legacy target); it is
   * emitted before gizmo.attach, so its subscribers cache it instead of reading gizmo.target.
   * Ports: index.html@cd3fd3f lines 3139-3143.
   * Side effects: emits SELECTION_CHANGED {id, label, modes} (badge), then gizmo.attach(selected) (rebuild), then the
   *   observers (04 5.3).
   * @param {string} id
   */
  select(id) {
    this.#selectedId = id;
    this.#selected = this.find(id);
    const selected = this.#selected;
    const modes = GIZMO_MODES.filter((m) => !selected?.allowedAxes || selected.allowedAxes(m) !== null);
    this.#bus.emit(Events.SELECTION_CHANGED, { id, label: selected?.label, modes });
    this.#gizmo.attach(selected);
    this.#notifyObservers({ primaryId: id, primary: selected, kind: this.kindOf(selected), ids: id != null ? [id] : [], origin: 'api' });
  }

  /**
   * Clears the selection: state, badge mirror, then the gizmo (removed; hover reset).
   * Ports: index.html@cd3fd3f lines 3145-3153 (hoveredAxis is reset by gizmo.detach, after the badge: PR5).
   * Side effects: emits SELECTION_CHANGED {id: null, label: null, modes: []}, then gizmo.detach(), then the observers
   *   (04 5.3, kind null).
   */
  deselect() {
    this.#selectedId = null;
    this.#selected = null;
    this.#bus.emit(Events.SELECTION_CHANGED, { id: null, label: null, modes: [] });
    this.#gizmo.detach();
    this.#notifyObservers({ primaryId: null, primary: null, kind: null, ids: [], origin: 'api' });
  }

  /**
   * Legacy handleViewportClick (called on canvas mousedown when the gizmo did not take the event).
   * 03 5.4: the hit is chosen by #choose (pickPriority only against wall hits); without wall hits, which is every hit list
   * before spec 02 makes sections pickable, it is the nearest hit, the legacy rule bit for bit.
   * Ports: index.html@cd3fd3f lines 3427-3474.
   * 2026-10-31: returns whether a registered target was hit (ViewportInput then leaves the press to it, never to the
   * click pick), and a miss keeps a selected section (kind 'section'): a press is not a click.
   * Side effects: tags pick meshes with userData.selectType; may select() or deselect().
   * @param {MouseEvent} event
   * @returns {boolean} a pick mesh was hit
   */
  pickAt(event) {
    // LEGACY(B-M14): picking runs on mousedown (not on click), so every miss, including the start of an
    // orbit drag or a right click, deselects; a hit on the already selected object does nothing.
    if (this.#interaction.isDraggingGizmo || this.#interaction.pilotMode) return false;
    if (!this.#gizmo.mode) return false;

    const raycaster = this.#pointerRay.fromEvent(event);
    const intersects = raycaster.intersectObjects(this.#collectPickMeshes(), false);

    if (intersects.length > 0) {
      const entries = intersects.map((hit) => ({ hit, sel: this.find(hit.object.userData.selectType) }));
      const selectType = this.#choose(entries).hit.object.userData.selectType;
      if (selectType && selectType !== this.#selectedId) {
        this.select(selectType);
      }
      return true;
    }
    if (this.kindOf(this.#selected) !== 'section') this.deselect();
    return false;
  }

  /**
   * The click pick (2026-10-31; ViewportInput calls it for a press and release within the click threshold): the
   * registered targets' pick meshes and every pickable provider's meshes (the wall sections, in every mesh mode) are
   * raycast together and the hit is chosen by #choose, so a camera body, prop or pivot in front of a section, and the
   * pivot (pickPriority) behind one, keep the click. A provider hit that resolves to no id is clicked through.
   * Side effects: tags the registered pick meshes with userData.selectType (as pickAt); selects nothing.
   * @param {MouseEvent} event
   * @returns {{id: string, kind: string|null}|null} the chosen hit's selection id and kind; null for empty space, in pilot
   *   mode and during a gizmo drag
   */
  hitAt(event) {
    if (this.#interaction.isDraggingGizmo || this.#interaction.pilotMode) return null;
    const meshes = this.#collectPickMeshes();
    /** @type {Map<object, PickProvider>} */
    const providerOf = new Map();
    for (const p of this.#providers) {
      if (!p.isPickable()) continue;
      for (const m of p.pickMeshes()) {
        if (providerOf.has(m)) continue;
        providerOf.set(m, p);
        meshes.push(m);
      }
    }
    if (meshes.length === 0) return null;
    const hits = this.#pointerRay.fromEvent(event).intersectObjects(meshes, false);
    const entries = [];
    for (const hit of hits) {
      const p = providerOf.get(hit.object);
      const id = p ? p.resolveHit(hit) : hit.object.userData.selectType;
      if (id === null || id === undefined) continue;
      entries.push({ hit, id, sel: this.find(id) });
    }
    if (entries.length === 0) return null;
    const chosen = this.#choose(entries);
    return { id: chosen.id, kind: this.kindOf(chosen.sel) };
  }

  /**
   * Re-resolves a section selection after the wall changed (2026-10-31; app/SectionSelection calls it after rebuilds and
   * renames): a section that no longer exists is deselected; one whose label changed (a rename) is selected again, so the
   * badge shows the new name. Any other selection is left alone (legacy targets always exist).
   * Side effects: maybe deselect() or select(the same id).
   */
  prune() {
    const selected = this.#selected;
    if (this.kindOf(selected) !== 'section') return;
    const now = this.find(this.#selectedId);
    if (!now) this.deselect();
    else if (now.label !== selected.label) this.select(this.#selectedId);
  }

  /**
   * The pick rule of 03 5.4: when the nearest hit is not a wall (section) hit, it wins (camera, prop, pivot, projector:
   * the legacy nearest-first rule). When it is a wall hit, the hit with the highest positive pickPriority behind it wins
   * (strictly higher, so the nearer of equal priorities), and the wall hit itself when there is none.
   * @template {{sel: Selectable|null}} E
   * @param {E[]} entries  one per hit, raycaster order (nearest first, not empty), each with the hit's Selectable
   * @returns {E} the chosen entry
   */
  #choose(entries) {
    const kindOf = (e) => this.kindOf(e.sel);
    const prio = (e) => e.sel?.pickPriority ?? 0;
    const first = entries[0];
    if (kindOf(first) !== 'section') return first;
    let best = null;
    for (const e of entries) {
      if (kindOf(e) === 'section' || prio(e) <= 0) continue;
      if (!best || prio(e) > prio(best)) best = e;
    }
    return best ?? first;
  }

  /**
   * The meshes to raycast, in registration order, each tagged with its Selectable's id.
   * Ports: index.html@cd3fd3f lines 3438-3462.
   * @returns {import('three').Object3D[]}
   */
  #collectPickMeshes() {
    const selectables = [];
    for (const selectable of this.#selectables) {
      if (!selectable.isPickable()) continue;
      for (const mesh of selectable.pickMeshes()) {
        mesh.userData.selectType = selectable.id;
        selectables.push(mesh);
      }
    }
    return selectables;
  }
}
