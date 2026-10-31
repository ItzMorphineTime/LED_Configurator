/**
 * @module core/EventBus
 * The frozen catalogue of mirror events and the synchronous EventBus that carries them.
 * Events are mirrors only (ARCHITECTURE.md R3, section 5): an emit sits at the exact point where the
 * legacy code wrote the DOM, every handler runs synchronously in subscription order, and nothing is
 * caught, so a throwing handler behaves exactly like the nested legacy function call it replaces.
 * Legacy source: none (new seam; replaces the direct DOM writes listed in ARCHITECTURE.md 5.2).
 * Layer: core (imports no other directory of js/).
 */

/**
 * The event catalogue (ARCHITECTURE.md 5.2). Keys are the constants used in code; values are the wire
 * names passed to {@link EventBus#on}, {@link EventBus#off} and {@link EventBus#emit}. The 19 Phase-1 mirror
 * events come first; each feature event added since carries its visual / non-visual class (07 C47).
 * @readonly
 * @enum {string}
 */
export const Events = Object.freeze({
  WALL_STATS_CHANGED:           'wall:statsChanged',
  WALL_SECTIONS_CHANGED:        'wall:sectionsChanged',
  WALL_SECTION_RENAMED:         'wall:sectionRenamed',
  WALL_MESH_MODE_CHANGED:       'wall:meshModeChanged',
  WALL_REBUILT:                 'wall:rebuilt',
  DISPLAY_CONTENT_CHANGED:      'display:contentChanged',
  CAMERA_PREVIEW_CHANGED:       'camera:previewChanged',
  CAMERA_FILMBACK_CHANGED:      'camera:filmbackChanged',
  CAMERA_LENS_CHANGED:          'camera:lensChanged',
  CAMERA_COVERAGE_CHANGED:      'camera:coverageChanged',
  CAMERA_POSE_CHANGED:          'camera:poseChanged',
  CAMERA_SAFE_DISTANCE_TOGGLED: 'camera:safeDistanceToggled',
  PROP_VISIBILITY_CHANGED:      'prop:visibilityChanged',
  PROP_POSE_CHANGED:            'prop:poseChanged',
  SELECTION_CHANGED:            'selection:changed',
  SELECTABLE_MOVED:             'selectable:moved',
  GIZMO_MODE_CHANGED:           'gizmo:modeChanged',
  GIZMO_SPACE_CHANGED:          'gizmo:spaceChanged',
  PILOT_CHANGED:                'pilot:changed',
  // Feature events, each classified visual (it changes what the canvas shows) or non-visual (07 C47).
  DEBUG_VIEW_CHANGED:           'debug:viewChanged',   // visual (01 F1-2): DebugViewController -> DebugViewControls
  WALL_PIVOT_CHANGED:           'wall:pivotChanged',   // visual (03 T4): PivotController, WallController.applyImport -> PivotPanel, PivotMarkerView
  UV_VIEWER_CHANGED:            'uv:viewerChanged',    // non-visual (04 UV-12): UvViewModel setters -> UVViewer
  UV_DATA_CHANGED:              'uv:dataChanged',      // non-visual (04 UV-12): UvViewModel.refresh -> UVViewer
  UV_TRANSFORM_CHANGED:         'uv:transformChanged', // visual (04 UV-12): UvController -> UVViewer, SectionListPanel (UV-14)
  UV_HOVER_CHANGED:             'uv:hoverChanged',     // visual (04 UV-12): UvViewModel.publishHover -> UVViewer, UvHighlightView (UV-15)
  UV_SETTINGS_CHANGED:          'uv:settingsChanged',  // visual (04 UV-14): UvController -> WallDisplayPanel
});

/** The set of valid wire names (never mutated). */
const KNOWN_EVENTS = new Set(Object.values(Events));

/**
 * Throws when `type` is not one of the catalogue values.
 * @param {string} type
 */
function assertKnown(type) {
  if (!KNOWN_EVENTS.has(type)) throw new Error(`Unknown event: ${type}`);
}

/**
 * Synchronous publish/subscribe bus for mirror events.
 * No wildcards, no async dispatch, no de-duplication, no once(), no batching.
 */
export class EventBus {
  /** @type {Map<string, Function[]>} wire name -> handlers in subscription order */
  #handlers = new Map();

  /**
   * Subscribe `handler` to `type`. Handlers run in subscription order (construction order, ARCHITECTURE.md 5.1).
   * The same handler may be subscribed more than once; it then runs once per subscription.
   * Side effects: none besides the registration.
   * @param {string} type  a value of {@link Events}
   * @param {(payload: any) => void} handler
   * @returns {() => void} unsubscribe: the first call is `off(type, handler)` (when the same handler is
   *   subscribed more than once, that removes its earliest subscription); later calls are no-ops
   * @throws {Error} `Unknown event: ${type}` if type is not a value of Events
   */
  on(type, handler) {
    assertKnown(type);
    let list = this.#handlers.get(type);
    if (!list) {
      list = [];
      this.#handlers.set(type, list);
    }
    list.push(handler);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.off(type, handler);
    };
  }

  /**
   * Remove one subscription of `handler` (the earliest one); no-op if it is not subscribed.
   * Side effects: none besides the removal.
   * @param {string} type  a value of {@link Events}
   * @param {Function} handler
   * @throws {Error} `Unknown event: ${type}` if type is not a value of Events
   */
  off(type, handler) {
    assertKnown(type);
    const list = this.#handlers.get(type);
    if (!list) return;
    const index = list.indexOf(handler);
    if (index !== -1) list.splice(index, 1);
  }

  /**
   * Call every handler of `type` synchronously with `payload`, iterating a snapshot of the handler list
   * (a handler added or removed during this emit does not change who is called in this emit).
   * Never catches: a handler exception propagates to the emitter and skips the remaining handlers
   * (legacy semantics of a nested function call).
   * Side effects: whatever the subscribed mirrors do.
   * @param {string} type  a value of {@link Events}
   * @param {*} [payload]
   * @throws {Error} `Unknown event: ${type}` if type is not a value of Events; rethrows handler exceptions
   */
  emit(type, payload) {
    assertKnown(type);
    const list = this.#handlers.get(type);
    if (!list || list.length === 0) return;
    for (const handler of list.slice()) handler(payload);
  }
}
