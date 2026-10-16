/**
 * @module core/renderOrder
 * Every non-default Object3D.renderOrder slot of the app, of every spec, in one registry (docs/improvements/
 * 01-normals.md 5.5, CR-10; 07 0.4). Each slot is used by its owning spec when that spec lands; no two overlays share
 * a value. Static rule 11 (tests/static/check.mjs): no numeric renderOrder literal >= 900 anywhere else under js/;
 * lower values (0, 1, the backdrop) may be written in place but are listed here for documentation.
 * Legacy source: index.html@cd3fd3f 3006 (the gizmo group's renderOrder = 999).
 * Layer: core (imports no other directory of js/).
 */

/**
 * The render-order registry. Higher values draw later within three's transparent / opaque lists.
 * @readonly
 * @enum {number}
 */
export const RENDER_ORDER = Object.freeze({
  HDRI_BACKDROP: -1e6,        // spec 05 backdrop dome
  DEFAULT: 0,
  RIG_CORE: 1,                // spec 06 CameraRigView dashed core over its halo (halo at DEFAULT)
  INNER_FRUSTUM_OVERLAY: 990, // spec 09 X9 InnerFrustumView (depth-tested; below every line overlay)
  MEASURE: 992,               // spec 09 X13 MeasureView
  HDRI_MARKER: 993,           // spec 05 projection-point marker
  UV_HOVER_OUTLINE: 994,      // spec 04 UvHighlightView
  NORMAL_LINES_ON_TOP: 995,   // spec 01 normal lines with "Draw on top"
  PIVOT_MARKER: 996,          // spec 03 PivotMarkerView
  HIGHLIGHT_HALO: 997,        // spec 06 halo of SectionHighlightView
  SECTION_HIGHLIGHT: 998,     // spec 02 SectionHighlightView (spec 06's dashed core)
  GIZMO: 999,                 // TransformGizmo (the legacy value)
});
