# Morph LED Configurator: Architecture (binding contract)

**Status:** binding for Phase 1 (the behaviour-preserving structural refactor) and the baseline for every later phase.
**Source of truth for legacy behaviour:** `index.html` at commit `cd3fd3f` (branch `refactor/modular-architecture`). Line numbers below refer to that file: CSS 11-870, markup 872-1276, script 1277-5096.
**Companion documents:** `docs/REFACTOR_PLAN.md` (phases, decisions, verification), `tests/regression/README.md` (golden-master harness and DOM contract). Bug ids (`B-H1`, `B-M5`, `B-L8`, ...) are the ids of the verified defect list (`docs/DEFECTS.md`, line numbers of `index.html@cd3fd3f`) that the refactor preserves; each one is listed with its single isolation site in section 8.

Parallel implementers code against the signatures in this document without talking to each other. If code and this document disagree, this document wins until it is amended in the same commit that changes the code.

Contents:
1. Overview, layers and conventions
2. File tree
3. Module specifications
4. State model (where every legacy global lives)
5. Event catalogue
6. Update flows (ordered pipelines)
7. Bootstrap sequence
8. Legacy compatibility registry
9. Feature seams
10. Verification contracts
11. Implementer checklist
12. Amendment log

---

## 1. Overview, layers and conventions

### 1.1 What the application is

A single-page, static web app (GitHub Pages, no build step) that configures curved and multi-section LED walls, shows them in three.js r128, simulates a cine camera frustum with a live preview, places reference props, and exports OBJ/MTL, glTF, JSON, PNG panel-ID atlases and a ZIP bundle.

Phase 1 turns the 3,800-line inline script and the 860-line inline stylesheet into native ES modules and 12 stylesheets **without changing any observable behaviour**, including the known bugs. Every output-affecting quirk is isolated behind one named compatibility point so that each later fix is a one-place change with its own re-baseline.

### 1.2 Delivery

- `index.html` keeps its `<head>` exactly (including the invalid `<meta author="Joe Loe">`), keeps loading three.js r128 and JSZip 3.10.1 as **classic** scripts from the same cdnjs URLs and Google Fonts from the same URL, then links the 12 stylesheets in `css/` in numeric order. Lines 872-1276 (the `<body>` tag, the markup 873-1275 and the blank line before the script) stay byte-identical. The inline `<script>` is replaced, at the same position at the end of `<body>`, by `<script type="module" src="js/main.js"></script>`.
- All URLs are relative (`css/...`, `js/...`) so the site works under the GitHub Pages sub-path `/LED_Configurator/`.
- Modules obtain THREE and JSZip only through the shims `js/vendor/three.js` and `js/vendor/jszip.js`. Switching to ESM three later (importmap) is a change to `js/vendor/three.js` plus one `<script type="importmap">`.
- `file://` no longer works (ES modules need HTTP). Local development uses any static server (see `docs/REFACTOR_PLAN.md`, "How to run locally").
- Module scripts are deferred and the module graph loads asynchronously, so the browser may paint the static markup before `App.start()` runs (the legacy inline script ran before the first paint). Nothing observable depends on it except overlay-glyph jitter in screenshots (8.4, 10).
- **Minimum browsers:** the modules use ES2022 class syntax (private `#` fields and methods, static fields), so the page needs Chrome/Edge 84, Firefox 90 or Safari 15 (iOS 15). Older browsers reject the module graph at parse time and show only the static markup. This is the one accepted difference from legacy, whose inline script (optional chaining at most) ran on Chrome 80, Firefox 74 and Safari 13.1. No module may use a built-in that is newer than this floor: own-key tests use `Object.prototype.hasOwnProperty.call`, not `Object.hasOwn` (Chrome 93, Firefox 92, Safari 15.4). The golden master runs only in current Chrome and cannot catch such a regression. `README.md` ("Browser Support") states the same minimum versions.

### 1.3 Layers and dependency rules

```
                      js/main.js  ->  js/app/App.js   (composition root: constructs, wires, runs the legacy bootstrap)
                                         |
        +--------------------------------+---------------------------------------------+
        v                                v                                             v
      ui/   DOM panels: bind DOM listeners, call controllers (down), mirror events (up)
        |  (receives app controllers, interaction controllers and SceneManager by injection; imports only core, legacy, domain statics, ui/dom)
        v
      app/  use cases and ordered pipelines: WallController (rebuild = createLEDWall), CameraHub (= updateCameraFrustum),
        |   CameraController, PropController, ProjectIO. Never calls ui; publishes mirror events.
        v
      interaction/  orbit, keyboard, pointer ray, selection registry, transform gizmo, pilot   render/  THREE views and canvases
        |                                                                                         |
        +-------------------------------------+---------------------------------------------------+
                                              v
      io/        pure writers/readers: ProjectSerializer (v1), ObjExporter, GltfExporter          (THREE-free, DOM-free)
      geometry/  pure: WallLayout, WallMeshBuilder, TextureAtlas, PanelNaming                     (THREE-free, DOM-free)
      domain/    pure entities: Project, Wall, WallSection, CineCamera, Prop, LogoLibrary, ...     (THREE-free, DOM-free)
      core/ EventBus + Events, typingTarget     legacy/ LegacyCompat (Strategies, legacy helpers, LEGACY_SITES)     theme/ Theme constants
      vendor/ three.js, jszip.js shims (window.THREE / window.JSZip)
```

Import rules (enforced by `tests/static/check.mjs`; an import means a static `import` statement). The "May import" column lists the **other** layers a module may import; in addition, every module may import modules of **its own top-level directory** under `js/` (subdirectories count as the same directory, so `render/textures/` is `render/`). The specification relies on this: `domain/Wall.js` -> `domain/WallSection.js`, `domain/Project.js` -> `Wall`, `WallSection`, `LogoLibrary`, `CineCamera`, `Prop`; `render/LEDWallView.js`, `CameraRigView.js`, `SafeDistanceView.js`, `PropViews.js` -> `render/ResourceTracker.js`; `interaction/ViewportInput.js` -> `interaction/InputState.js`; `ui/*` -> `ui/dom.js`. The only same-directory exception: nothing except `main.js` imports `app/App.js`.

| Layer (directory) | May import (besides its own directory) | Must not import |
|---|---|---|
| `vendor/` | nothing (reads `window.THREE`, `window.JSZip`) | everything |
| `core/`, `legacy/`, `theme/` | no other directory of `js/` | every other directory |
| `domain/` | `legacy/` | THREE, DOM, every other layer |
| `geometry/` | `domain/`, `legacy/` | THREE, DOM, `io/`, `render/`, ... |
| `io/` | `domain/`, `geometry/`, `legacy/` | THREE (colour parsing is injected as `colorToRgb`), DOM, `theme/` (brand/palette are injected) |
| `render/` | `vendor/three.js`, `core/`, `legacy/`, `domain/`, `geometry/` | `ui/`, `app/`, `interaction/`, `io/`, `theme/` (theme is injected) |
| `interaction/` | `vendor/three.js`, `core/`, `legacy/`, and from `render/` only the leaf utility `render/ResourceTracker.js` | `ui/`, `app/`, the rest of `render/`, `domain/`, `io/`, `theme/` (collaborators are injected) |
| `app/` (except `App.js`) | `core/`, `legacy/`, `domain/`, `geometry/` | `ui/`, `vendor/`, `render/`, `interaction/`, `io/` (collaborators are injected) |
| `ui/` | `core/`, `legacy/`, `domain/` (static rule tables only), `ui/dom.js` | `vendor/`, `render/`, `interaction/`, `app/`, `io/`, `geometry/`, `theme/` (collaborators and the theme are injected) |
| `app/App.js`, `main.js` | everything | - |

"Injected" means a constructor parameter. Types of injected collaborators appear only in JSDoc (`@param {import('../render/LEDWallView.js').LEDWallView} view` is allowed because JSDoc imports are not runtime imports).

Direction of communication:
- **Commands go down as direct method calls**: ui -> app/interaction -> domain/render.
- **Ordered side effects are direct calls inside named pipelines** (`WallController.rebuild`, `CameraHub.refresh`, the use cases in section 6). No ordered step is ever triggered by an event.
- **Mirrors go up as synchronous events**: a controller emits a catalogue event at exactly the point where the legacy code wrote the DOM; ui panels (and the gizmo, for its own position) subscribe and mirror state. See section 5 for the rules.

### 1.4 World conventions (implicit in legacy, now documented)

- Units are metres. Section sizes are stored in millimetres and converted with `MM_TO_M = 0.001` (the 8 legacy `const scale = 0.001` sites: 1479, 2488, 2552, 2591, 3757, 4493, 4912, 4920).
- Y is up; the wall stands on the floor `y = 0`; sections are bottom-aligned.
- The wall front faces **+Z** (default orbit camera, film camera, safe-distance floor all on +Z).
- **Front faces (08 6.4):** triangles are wound counter-clockwise seen from the front (+Z for a flat wall), and normals point to the stage. The viewport strips follow this since 08 P2-2a (`mesh.viewport.winding = 'ccw'`; panel mode's `PlaneGeometry` always did); the OBJ writer since 08 P2-2c (`mesh.obj.winding = 'ccw'`, one averaged `vn` per vertex, and the orientation header line of 01 CR-3); the glTF writer since 08 P2-2d (`mesh.gltf.winding = 'ccw'` and a `NORMAL` attribute with the same normals). The normals are never negated: the safe zone, coverage and camera code depend on +Z being the front.
- The world origin is the first section's first bottom edge vertex (implicit pivot `bottom-left`; the layout frame L below, which is also the stage and export frame while the pivot is the default). `ledWallGroup` keeps an identity transform; vertices are baked in world space.
- Angles: section fields are degrees; the layout walk works in radians with the legacy association `(deg * Math.PI) / 180`.
- Euler order for the film camera, preview camera and local gizmo: `'YXZ'` with (tilt = rotX, pan = rotY, roll = rotZ).
- **Curve convention (B-L1, decided 2026-10-16: kept).** The walk starts with heading 0 along +X, and each section applies its curve step `c` **before** each panel's move. For a section with heading-in `H`, angle offset `a` and `N` panel columns, panel k (0-based) has heading `H + a + (k+1)·c` and the section exits with heading `H + a + N·c`, which is the next section's `H`. Adjacent panels are always exactly `c` apart, so multi-section curves stay continuous; a curved first section starts rotated by `c` against +X (a one-column section with a 10° curve is one panel at 10°). The owner kept this convention at Phase 2 kickoff (08 Q10, recorded in 08 §5.6; 07 C6), so it is documented behaviour and not a defect to fix. `Strategies.curveBeforeFirstPanel` (8.1) stays until 08 P2-13f retires it; the legacy convention is then the only code path, and no output changes. Project files carry no convention key (v2.0). If the convention ever changes, an additive revision adds a top-level `curvature_convention` key (absent means this convention) and `computeWallLayout` reads `layoutOptions.curveConvention` (07 C6).

**Coordinate frames and the frame of each consumer** (07 C60, 03 §5.1). Three frames are named. Until Feature 3 (spec 03, the pivot) lands, the pivot is the identity and all three coincide with the legacy world above, so Phase 1 and Phase 2 code never needs to distinguish them. Every consumer added later reads the frame listed for it here. The pivot API that the table and the pipeline below name (`resolvePivot`, `translated()` and the `frame` option of `layoutProject`) is added by Feature 3 with its section 3.6 amendment (03 §5.9 #3), not by this table: until then `layoutProject(project)` returns `computeWallLayout(project.wall.sections)` (3.6), which is the layout, stage and export frame at once.

| Frame | Origin | Produced by | Consumers |
|---|---|---|---|
| **Layout (L)** | The first section's first bottom edge vertex (the legacy world) | `computeWallLayout(sections)` (the verbatim walk, oracle-tested; B-L1 convention above) | `resolvePivot`, unit tests, the `pivot.resolved_m` readouts |
| **Stage (S)**, `x_S = x_L − O`, O = (P.x, 0, P.z) | The pivot P projected onto the floor; the floor stays y = 0 | `layoutProject(project)` (default `frame: 'stage'`), read through `WallController.currentLayout` (spec 02's single layout accessor; before it lands, the layout of the last P1 rebuild) | `LEDWallView` (wall and frames), picking, gizmo anchors, spec 02's outlines and transform-only fast path, spec 01's normal lines (`matrixWorld`), spec 04's hover readout (`panelCornersWorld`), spec 05's shader (`modelMatrix·position`) and its T13 bake, 08's `FrustumCoverage` and `CameraHub`, the safe-distance band (`SafeDistanceView`), `framingBounds`, `OrbitController`, spec 09's inner frustum, measurement snapping and X15 plan SVG, and every stored pose (camera, props, HDRI point, measurements, orbit) |
| **Export (E)**, `x_E = x_L − P = x_S − (0, P.y, 0)` | The pivot P | `layoutProject(project, {frame: 'export'})` | `ObjExporter`, `GltfExporter`, the ZIP, spec 09's X11 stage packs. The safe-distance OBJ is the stage band translated by (0, −P.y, 0) (03 §7.1). |

- Texture content (spec 04's UVs, spec 05's bake, panel IDs) does not depend on the frame. The trap this table prevents: spec 05's bake must read the **stage** layout, because the projection point is stored in the stage frame; the export layout would sample every texel P.y too low.
- **There is never a wall root transform** (07 C32). Each frame is baked into the vertex positions by `layoutProject`, and the identity transform of the wall group is an invariant (Feature 3 adds its unit test, 03 §5.1). The pipeline is: the raw walk (every `postTransform` `null`), `resolvePivot` on it from generative quantities only, `translated(t)` with `t` = −O (stage), −P (export) or 0 (layout), then spec 02's `applySectionOffsets(out)`, which builds each section matrix from the translated layout (section 9, Feature 3 row).

### 1.5 Code conventions

- **One concept per file.** Class modules are `PascalCase.js`; function/helper modules are `camelCase.js` (`dom.js`, `three.js`). Private state uses `#fields`. Constants exported from a module are `UPPER_SNAKE` or frozen `PascalCase` objects (`Strategies`, `Events`, `Theme`).
- **File header** (every module):
  ```js
  /**
   * @module render/LEDWallView
   * Builds and disposes the LED wall and panel-frame groups from a WallLayout; tags meshes.
   * Legacy source: index.html@cd3fd3f 1457-1577, 1646-1678, 1710-1802.
   * Layer: render (may import vendor/three, core, legacy, domain, geometry).
   */
  ```
- **JSDoc on every exported symbol and public method**: `@param`, `@returns`, and a `Side effects:` line (DOM, scene, events emitted). Typedefs for injected collaborators (e.g. `Selectable`, `Dialogs`) live in the module that consumes them.
- **No globals:** no app state on `window`; no module-level mutable state (`let`/`var` at module top level is forbidden). The only global mutation is the `roundRect` polyfill (a no-op in browsers that have `roundRect`).
- **Browser globals** (`alert`, `URL.createObjectURL`, `requestAnimationFrame`, `devicePixelRatio`, `FileReader`, `Image`, `Blob`) are looked up **at call time** through the injected `win`/`doc` objects or directly at the call site, never cached at construction. This is the legacy semantics (the harness installs its hooks before any app code runs, so call-time lookup is about fidelity, not about the harness).
- **Imports:** relative specifiers with the `.js` extension, spelled with the exact on-disk case (GitHub Pages is case-sensitive; Windows is not). `import THREE from '../vendor/three.js';` and `import JSZip from '../vendor/jszip.js';` are the only ways to reach the libraries.
- **LEGACY tags:** every preserved defect site carries `// LEGACY(B-xx): <what is preserved and why>` and is registered in `LEGACY_SITES` (section 8). Tags use the form `// LEGACY(B-xx): ...` or, for a site serving several bugs, `// LEGACY(B-xx, B-yy): ...`; the exact sites are listed in section 8.3, and a file's tags must name exactly the ids of its 8.3 rows (check rule 6). **The token `LEGACY(` is reserved for those tags.** Any other comment that mentions a bug (a JSDoc remark, a cross-reference to a site in another file) writes the id without it, e.g. `(B-M2, tagged at PanelNaming.mtlTextureFile)`. The JSDoc in section 3 follows this convention: every `LEGACY(...)` that appears in a module's specification is one of that module's 8.3 rows, so copying the JSDoc verbatim keeps rule 6 green.
- **Reading `Strategies`:** each key is read only at the site(s) named in section 8.1, "Read by" (one function per key, except `exportCombinedColor`, which each exporter reads at its own legacy colour point); the exact statement is in that module's section-3 entry and in its work package. Code that reads an **enumerated** key (string or boolean) `switch`es on it and throws `unsupportedStrategy(key, value)` in the `default` branch for any value other than the Phase-1 legacy value. A later fix adds the new case, flips the value and re-baselines. Exempt from switch-and-throw, because they are used as values: the numeric keys `mtlDownloadDelayMs`, `frustumDepthM`, `previewRendererSize`, `gizmoRotateSign`, `pilotForwardYSign`, and the two `dispose.*` policy booleans (passed as `disposeMaps` / used as an `if` condition: both branches already exist, so the Phase 1C flip to `true` is a one-line value change). The array key `mesh.gltf.attributes` is read by iterating it and switching each element over the supported attributes (`'POSITION'`, and `'NORMAL'` since 08 P2-2d; `'TEXCOORD_0'` arrives with 08 P2-7c), with `'POSITION'` first and no repeats, throwing `unsupportedStrategy` otherwise (04 5.5). The `mesh.*` profile keys are read through the profile object injected into `WallMeshBuilder` and the exporters (`this.profile.winding`, `profile.stripNormals`, ...), never by re-importing `Strategies.mesh.*` in the consumer; rule 8 counts `profile.<leaf>` as a reference.

### 1.6 Binding implementation rules (R1-R14)

| # | Rule | Why |
|---|---|---|
| R1 | **Port verbatim.** Copy every legacy expression that feeds an output, a DOM string or a THREE object exactly: operand order and association (`(deg * Math.PI) / 180`, `vertexOffset + row * vertsPerRow + col`), `\|\| default`, `toFixed(n)`, template literals byte for byte (whitespace included), object-literal property order and evaluation order. Allowed edits: identifier substitution per the state map (section 4), hoisting a field read into a local, `this` in DOM handlers replaced by an explicit element variable, moving code into methods. Exception to identifier substitution: V8 prints the callee text of a failing call in `TypeError: <callee> is not a function` (and `<callee> is not a constructor`), and that text reaches the console baseline or the import alert. At every call whose callee can be a non-function for some imported value, keep the legacy callee text, receiver identifier included. Known site: `PanelNaming.sanitizeFilename`'s parameter stays `name`, because a numeric imported section name makes the ZIP export throw `name.replace is not a function`. Not allowed: re-association, coercion (`Number()`, `parseInt` where legacy did not), precomputing, merging two templates into one, spreading large arrays into calls (append with loops) except where the spread *is* the preserved quirk (B-H3). | Exports must match within 1e-5 (in practice byte-identical), screenshots pixel-exact, DOM text exact, JS coercion of imported strings (B-L8) and fractional counts (B-L15) identical. |
| R2 | **Ordered side effects are direct calls** inside the pipelines and use cases of section 6. | Order is visible in code; no hidden ordering contract. |
| R3 | **Events are mirrors only.** A subscriber may only update DOM elements or THREE objects that its own module owns, idempotently, from the payload and current state. It never mutates domain state, never calls a controller or use case, never emits. Subscribers of the same event touch disjoint targets. **Single declared exception:** `SectionListPanel.render()`, which runs inside its `WALL_SECTIONS_CHANGED` subscriber, calls `section.ensureName(index)` (the legacy render-time fill, 3901). It is idempotent and in practice never writes, because names are always truthy after `createDefault`, `appendLikeLast`, `rename` and import; and even if it wrote, the only later reader in the same emit (`SectionLogosPanel`) runs after it, which is the legacy `renderWallSections` -> `renderSectionLogosUI` order (4105-4106, 4134-4135). | Subscriber order cannot matter, so the bus cannot reorder legacy behaviour. |
| R4 | **Constructors are side-effect free:** they store dependencies, may look up DOM elements by id (ui and `App.js` only, no mutation), may subscribe to the bus. They never allocate THREE `Object3D`/`Material`/`BufferGeometry`/`Texture`, never touch the DOM otherwise, never add listeners, timers or rAF. (`Vector2/3`, `Plane`, `Raycaster`, `Color`, `Euler` carry no ids and may be created anywhere.) | three r128 sorts render items by `program.id`, `material.id`, `z`, `object.id`; all ids come from global counters, so allocation order must equal legacy order. |
| R5 | **THREE allocation and `scene.add` order equal legacy order** in every builder (geometry -> texture -> material -> mesh, exactly as the legacy statement order). | Same as R4 (draw-order ties at section junctions and at the grid line z = 0). |
| R6 | **No new renderables, no new scene-graph parents, no layers in Phase 1.** Helpers are *registered* (`SceneManager.addHelper`) but stay on layer 0. | Preview pixels (B-M11) and draw order stay identical. |
| R7 | **Every output-affecting quirk lives at exactly one site:** a `Strategies` key read by code or a registered `LEGACY(B-xx)` tag. | Each later fix is a one-place change. |
| R8 | **Markup is byte-identical; CSS is contiguous slices** of the original `<style>` in original order. Inline `style=""` attributes stay. | The cascade is identical by construction; `ui_visual` stays identical. |
| R9 | **No globals, call-time browser globals** (section 1.5). | Constraint: no app state on `window`; legacy semantics of `alert` etc. |
| R10 | **Pure layers are Node-testable:** `core`, `legacy`, `theme`, `domain`, `geometry`, `io` import no THREE and touch no DOM. | Exporters are byte-compared against golden files in plain Node before any wiring. |
| R11 | **Listener registration order is reproduced:** orbit canvas listeners and keyboard-state listeners in the init phase; panel listeners, shortcut keys and canvas pointer routing in the setupUI phase, in legacy statement order (section 7). | Same handler order on shared targets (`mousedown`, `keydown`, ...). |
| R12 | **Domain values are never coerced or validated in Phase 1** (B-L8). Id-keyed lookups use plain-object property-key semantics (`obj[id]`, i.e. `String(id)` for primitives). | Imported strings, NaN and duplicate ids behave exactly as today. |
| R13 | **Exceptions are never caught** except where legacy caught them (the import `try/catch`). Sync/async shape of every export function is preserved (`exportZIP` and `exportPanelIds` stay `async`). **Amended by 08 P2-1a:** `ProjectIO.#runExport`, which wraps every export and reports a failure as the M-EXP-1 alert, and the export size guards (08 P2-1c) are the sanctioned exceptions. | Console baseline (uncaught errors, unhandled rejections) and import alerts stay identical. |
| R14 | **Reorderings are allowed only if listed in section 6.0**, each with its proof of non-observability. | Keeps "verbatim" auditable. |


---

## 2. File tree

The `WP` column names the work package that creates the file (see `docs/REFACTOR_PLAN.md` and the work-package list). Every file belongs to exactly one work package. Totals: 12 stylesheets; 45 application modules plus `main.js`, the composition root `App.js` and 2 vendor shims.

### 2.1 Stylesheets (`css/`): contiguous slices of the original `<style>`, linked in this order

Each file contains a header comment followed by the original lines **verbatim and in order** (leading indentation may be removed; nothing else changes). Concatenating the files in numeric order, minus their header comments, reproduces lines 12-869 of the original modulo whitespace, so the cascade is identical by construction. There are no CSS comments and no `url()` in the original, so moving the rules changes no paths.

| File | Original lines | Content | WP |
|---|---|---|---|
| `css/01-reset.css` | 12-16 | `*` reset (margin, padding, box-sizing) | WP2 |
| `css/02-tokens.css` | 18-31 | `:root` custom properties: the single theme-token file (Feature 6 seam) | WP2 |
| `css/03-layout.css` | 33-46 | `body`, `.app-container` grid | WP2 |
| `css/04-header.css` | 48-102 | `.header`, `.logo*`, `.header-stats`, `.stat*` | WP2 |
| `css/05-control-panel.css` | 104-295 | `.control-panel` (+ scrollbar), section cards (`.wall-section*`, `.section-*`), `.input-field*`, `.curve-hint`, `.add-section-btn*` | WP2 |
| `css/06-controls.css` | 297-444 | `.global-section*`, `.mesh-mode-*`, `.toggle-container`, `.toggle*`, **first** `.export-btn` block (425-444) | WP2 |
| `css/07-viewport.css` | 446-524 | `.viewport`, `#three-canvas`, `.viewport-overlay`, dead `.grid-lines`, `.viewport-info`, `.info-badge`, `.viewport-controls`, `.gizmo-controls`, `.company-logo` | WP2 |
| `css/08-section-logos.css` | 526-602 | `.section-logo-*` | WP2 |
| `css/09-viewport-tools.css` | 604-735 | `.gizmo-mode-btn*`, `.pilot-info*`, `.gizmo-divider`, `.selection-indicator*`, `.view-btn*` | WP2 |
| `css/10-section-extras.css` | 737-811 | dead `.section-color-0..7`, `.section-color-picker`, `.color-swatch-small*`, `.color-input-custom*`, `.section-warning*`, `.warning-indicator` | WP2 |
| `css/11-export.css` | 813-857 | `.export-section`, `.export-row`, **second** `.export-btn` block, `.export-btn.secondary*`, `.import-input` | WP2 |
| `css/12-responsive.css` | 859-869 | `@media (max-width: 900px)` (must stay last) | WP2 |

### 2.2 JavaScript (`js/`)

```
js/
  main.js                                  WP10  Entry: installCanvasPolyfills(); new App({ doc: document, win: window }).start()
  vendor/
    three.js                               WP3   const THREE = window.THREE; export default THREE; export { THREE };
    jszip.js                               WP3   const JSZip = window.JSZip; export default JSZip; export { JSZip };
  core/
    EventBus.js                            WP3   Events catalogue (frozen) + synchronous EventBus (throws on unknown event names)
    typingTarget.js                        08 P2-9b  isTypingTarget(t): the one typing guard (07 3.8 truth table; 07 C18, C52)
  legacy/
    LegacyCompat.js                        WP3   Strategies (deep-frozen switches), LegacyProfiles, legacy helpers (orDefault,
                                                 legacyHtml), unsupportedStrategy, LEGACY_SITES
  theme/
    Theme.js                               WP3   SceneTheme, CanvasTheme, UiColors, Palette, Brand, Theme (ThemeBridge-ready shape)
  domain/
    WallSection.js                         WP3   WallSection entity (legacy field names, field rules, derived labels), MM_TO_M
    Wall.js                                WP3   Wall (ordered sections, id allocator, totals, legacy flat bounds), WallPivot, PivotMode
    Project.js                             WP3   Project aggregate, DisplaySettings (content enum), ContentMode, PanelIdStyle
    LogoLibrary.js                         WP3   Section logos keyed by section id (plain-object key semantics)
    CineCamera.js                          WP3   Film camera: lens, pose, enabled flag, FILMBACK_PRESETS, FOV/coverage/safe-D math,
                                                 field rules, gizmo/pilot pose arithmetic
    Prop.js                                WP3   Prop base (pose, visibility, field rules, gizmo arithmetic), PersonProp, CarProp
  geometry/
    WallLayout.js                          WP4   The single cursor walk: computeWallLayout, layoutProject, framingBounds,
                                                 SectionLayout, WallLayout (flatEdges, firstEdge/lastEdge, bounds, pivotPoint)
    WallMeshBuilder.js                     WP4   quadIndices + WallMeshBuilder: the one owner of winding, normals, UVs, panel quads;
                                                 maxIndexOf, indexWidth (index component width, 08 P2-1b)
    TextureAtlas.js                        WP4   computeAtlas (LED totals, px/LED, start columns, x offsets, UV offsets),
                                                 sectionPxPerLed, panelPxPerLed; CANVAS_HARD_LIMITS, canvasFits (08 P2-1c)
    PanelNaming.js                         WP4   Column letters, panel labels, export object names, filename sanitising, texture names
  render/
    ResourceTracker.js                     WP6   disposeObject3D(root, {maps}) + ResourceTracker
    SceneManager.js                        WP6   Scene, main camera, renderer, lights, grid, axes (explicit init()), helper registry,
                                                 LAYERS, grid toggle, resize, render loop
    LEDWallView.js                         WP6   Wall + frame groups from a WallLayout; mode dispatch; mesh tagging; section nodes
    LEDMaterialFactory.js                  WP6   The only constructor of wall materials (panel IDs > LED sim > colour)
    textures/LEDPixelTextureFactory.js     WP6   installCanvasPolyfills, LED tile cache, 5 tile painters, tiled clones
    textures/PanelIdRenderer.js            WP6   Panel / section / atlas panel-ID canvases (styling, section names, logos)
    CameraRigView.js                       WP7   Film-camera rig: body (pick target), frustum lines + fill, transform; lens event
    SafeDistanceView.js                    WP7   Safe-distance floor band, outline, "Max" sprite; exposes its group for OBJ export
    PreviewWindow.js                       WP7   Second WebGLRenderer, preview camera, preview labels, resize handle
    PropViews.js                           WP7   PropView base, PersonPropView, CarPropView (procedural meshes)
  interaction/
    InputState.js                          WP8   InteractionState, KeyboardState, PointerRay (one shared Raycaster), target guards
                                                 (the shortcut guard re-exports core/typingTarget.js since 08 P2-9b)
    OrbitController.js                     WP8   Custom spherical orbit: drag, wheel, WASD/QE offset, presets, retarget, snapshot
    SelectionManager.js                    WP8   Selectable registry, selection state, raycast picking; Selectable typedef
    TransformGizmo.js                      WP8   Hand-written translate/rotate gizmo bound to the selected Selectable
    PilotController.js                     WP8   PilotCameraDriver (drives the main camera) + PilotController (toggle, look, fly, speed)
    ViewportInput.js                       WP8   Shortcut keys (G/R/L/P/Esc) + canvas pointer routing (pilot | gizmo | pick)
  io/
    ProjectSerializer.js                   WP5   Project JSON v1 write ('file' | 'zip' variants) and read; version dispatch seam
    ObjExporter.js                         WP5   OBJ + MTL text (combined / section / panel) + safe-distance OBJ text
    GltfExporter.js                        WP5   glTF 2.0 JSON with embedded base64 buffer (combined / section / panel)
  app/
    App.js                                 WP10  Composition root: construct -> bootstrap (init, setupUI, setView)
    WallController.js                      WP9   Wall use cases + rebuild pipeline (legacy createLEDWall) + stats
    CameraController.js                    WP7   CameraHub (legacy updateCameraFrustum + updateSafeDistance) and CameraController
                                                 (preview/lens/pose use cases, Selectable 'camera')
    PropController.js                      WP7   Prop use cases (show/hide, fields, transform, Selectable 'person'/'car')
    ProjectIO.js                           WP5   Downloader + export/import use cases (JSON, OBJ, glTF, PNG, ZIP, safe-distance OBJ)
  ui/
    dom.js                                 WP3   byId, flipToggle, setDisplay, createDialogs
    HeaderStats.js                         WP9   #total-pixels / #total-panels / #total-sections / #total-arc
    SectionListPanel.js                    WP9   #wall-sections cards (verbatim templates), card handlers, collapse snapshot/restore,
                                                 #add-section-btn
    SectionLogosPanel.js                   WP9   #section-logos-container rows (verbatim template) + upload/clear/position/scale
    WallDisplayPanel.js                    WP9   Mesh-mode labels, wireframe/frame, LED sim + layout, panel IDs + styling inputs
    CameraPanel.js                         WP7   Camera Frustum Preview section: toggles, lens, pose inputs, readouts, reset,
                                                 safe-distance controls
    PropsPanel.js                          WP7   PropControls (one instance per prop prefix 'person' | 'car')
    ViewportToolbar.js                     WP8   View presets, grid button, gizmo buttons, selection badge, pilot banner
    ExportPanel.js                         WP5   Export buttons, #import-json -> #import-input, file input change
```

During integration only, `js/legacy/monolith.js` (WP10) temporarily holds the verbatim legacy script (step I-1) and is deleted in step I-2.

### 2.3 Tests and tools

```
tests/
  regression/                              existing golden-master harness (run.mjs, compare.mjs, lib/...)
    scenarios.mjs                          WP1 (edit: registers the extra scenarios); 08 P2-0 (registers the Phase 2 scenarios)
    compare.mjs                            WP1; 08 P2-0: `--expect` expected-change manifests and the `JITTER` status from
                                                 expected/_nondeterminism.json (08 8.2; the Phase-1 WARN_ONLY list is gone)
    lib/server.mjs                         WP1 (conditional edit: optional port argument for tools/serve.mjs; default unchanged)
    lib/app.mjs, lib/recorder.mjs          08 P2-0: the opt-in request log (`recordRequests`, network.json), AppPage.reload()
                                                 (keeps the dialogs of the page it leaves: dialogs.json lists every page's)
    scenarios-extra.mjs                    WP1   logos, gizmo_drag, pilot_look, preview_off_in_pilot, import_edge,
                                                 name_with_panel_ids, preview_resize
    scenarios-phase2.mjs                   08 P2-0  the eight p2_* scenarios of 08 8.3, captured against the unfixed code
    expected/                              08 P2-0  <commit-id>.json expected-change manifests (one per golden-changing commit,
                                                 any spec); _nondeterminism.json, the only standing allowance
    README.md                              WP1 (edit: documents the extra scenarios); 08 P2-0 (Phase 2 scenarios and the
                                                 "Phase 2 re-baselining" procedure)
  static/
    check.mjs                              WP1   layering, DOM-id ownership, call-time globals, import case, LEGACY parity,
                                                 Strategies references, event subscribers, module-level state, domain field writers
    fixtures/                              WP1   synthetic trees used to self-test check.mjs
    css-slices.mjs                         WP2   proves css/*.css == original lines 12-869 (normalised) in link order
                                                 (normalisation: CSS whitespace only, i.e. space, tab, LF, CR, FF; each file
                                                 must hold exactly one leading header comment and no other comment)
  unit/                                    run with: node --test "tests/unit/**/*.test.mjs"
                                           (quoted glob, Node 22.7+: `--test` globs need Node 21+, and the repository has
                                           no package.json, so the typeless js/*.js modules load as ESM only through
                                           module-syntax detection, unflagged since Node 22.7; `node --test tests/unit/`
                                           FAILS on Node 21+ because arguments are globs, not directories; the glob skips
                                           oracle/*.mjs)
    core.test.mjs                          WP3   EventBus semantics, LegacyCompat helpers, LEGACY_SITES shape
    domain.test.mjs                        WP3   rule tables vs legacy expressions, Wall/CineCamera/Prop/LogoLibrary semantics
    oracle/legacy-geometry.mjs             WP4   verbatim THREE-free copies of the legacy layout walks and grid builders
    geometry.test.mjs                      WP4   Object.is equality vs the oracle over fuzzed sections (strings, fractions, NaN ids);
                                                 since 08 P2-0 the oracle builders are injected with LegacyProfiles.mesh.*
    oracle/legacy-io.mjs                   WP5   verbatim THREE-free copies of generateAllSectionsGeometry, OBJ, glTF, JSON writers
    io.test.mjs                            WP5   byte equality vs oracle (LegacyProfiles.mesh.*, since 08 P2-0) and vs golden
                                                 harness files (GOLDEN_DIR; Strategies.mesh.*); since 08 P2-1b it writes the
                                                 synthetic 70,000-vertex glTF to the git-ignored unit/out/ (manual validator check)
    camera-hub.test.mjs                    WP7   CameraHub/CameraController pipeline order with spies
    wall-controller.test.mjs               WP9   rebuild policy: run counts and tile-cache clears for the 24 legacy sites
    compare.test.mjs                       08 P2-0  compare.mjs --expect semantics and JITTER on synthetic output trees
    tools.test.mjs                         08 P2-0  tools/check-orientation.mjs and tools/check-gltf.mjs on hand-built files
    typing-target.test.mjs                 08 P2-9b  the 07 3.8 truth table of core/typingTarget.js (plain objects) and the
                                                 InputState re-exports (fake THREE)
    materials.test.mjs                     08 P2-1d  PanelIdRenderer sizes and null canvases, LEDMaterialFactory's colour
                                                 fallback and its warning, LEDWallView's index attribute (08 P2-1e)
                                                 (fake THREE installed as window.THREE)
tools/
  serve.mjs                                WP1   zero-dependency static server for local development (correct .js MIME type)
  check-orientation.mjs                    08 P2-0  OBJ/glTF face orientation against the vertex normals (01 8.1, 08 8.2)
  check-gltf.mjs                           08 P2-0  structural glTF subset: bounds, alignment, index values, POSITION min/max
                                                 after Math.fround, unit NORMALs, TEXCOORD_0 count, references (08 8.2)
.github/
  workflows/ci.yml                         07 G1  static checks and unit tests on pushes to refactor/** and feature/** and on
                                                 pull requests (no npm install; actions pinned by commit SHA, 07 Q13)
  dependabot.yml                           07 G1  weekly updates of the pinned GitHub Actions
index.html                                 WP10  head + markup verbatim; 12 <link>s; <script type="module" src="js/main.js">
README.md                                  WP10  "How to run locally" section updated (static server required)
docs/ARCHITECTURE.md, docs/REFACTOR_PLAN.md       this contract and the plan (amended by whoever changes a contract)
```


---

## 3. Module specifications

Notation: `#x` is a private field; "deps" are constructor parameters (always one options object); every method is synchronous unless marked `async`; "Emits" lists bus events (section 5); "Legacy" gives the source lines that are ported verbatim (R1). Methods not listed here are private (`#name`) and may be added freely.

### 3.1 Vendor shims

**`js/vendor/three.js`**
```js
const THREE = window.THREE;   // three.js r128, loaded by a classic <script> in <head>
export default THREE;
export { THREE };
```
**`js/vendor/jszip.js`**: the same shape for `window.JSZip` (3.10.1).

No other module reads `window.THREE` or `window.JSZip`.

### 3.2 `js/core/EventBus.js`

```js
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
});

export class EventBus {
  /** Subscribe. Throws Error(`Unknown event: ${type}`) if type is not a value of Events.
   *  Handlers run in subscription order. @returns {() => void} unsubscribe */
  on(type, handler)
  /** Remove one handler (no-op if absent). Throws on unknown type. When the same handler is subscribed
   *  several times (there is no de-duplication), the earliest matching subscription is removed. The
   *  unsubscribe function returned by on() is idempotent: a second call removes nothing. */
  off(type, handler)
  /** Call every handler synchronously with `payload`, iterating a snapshot of the handler list.
   *  Throws on unknown type. Never catches: a handler exception propagates to the emitter and
   *  skips the remaining handlers (legacy semantics of a nested function call). */
  emit(type, payload)
}
```
State: `#handlers: Map<string, Function[]>`. No wildcards, no async, no de-duplication, no once().

**`js/core/typingTarget.js`** (08 P2-9b, B-L11; the one typing guard, 07 C18; its one named owner is 08 P2-9b, 07 C52). Pure: it reads only the target's `tagName`, `type`, `isContentEditable` and `closest`, so it is Node-tested with plain objects (`tests/unit/typing-target.test.mjs`).
```js
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'range']);
/** 07 3.8 (01 3.4): true for an INPUT whose type is not in NON_TEXT_INPUT_TYPES, a SELECT, a TEXTAREA, an element
 *  with isContentEditable, and any element inside an open [role=dialog] (or open <dialog>), modal or not;
 *  false otherwise (null, BODY, the document, buttons, checkboxes, radios, ranges, ...). */
export function isTypingTarget(t)
```
Consumers: `interaction/InputState.js` re-exports it (also as `isShortcutIgnoredTarget` until 07 I1), `ViewportInput.attachShortcuts` (through that re-export), 01 T7's `DebugViewControls.bindShortcuts`; 07 I1 adds `isMovementBlockedTarget(t)` to the same module.

### 3.3 `js/legacy/LegacyCompat.js`

The single home of every output-affecting legacy switch and helper. The file header comment points to section 8 of this document as the human-readable register.

```js
export const Strategies = deepFreeze({
  mesh: {
    viewport: { winding: 'ccw', normals: 'averaged', combinedUV: 'atlas-u-full-v', side: 'double' },
    obj:      { winding: 'ccw', normals: 'averaged', stripNormals: 'per-vertex',
                combinedUV: 'per-section-overlap', panelNormal: 'facing' },
    gltf:     { winding: 'ccw', normals: 'averaged', panelNormal: 'facing', attributes: ['POSITION', 'NORMAL'],
                indexType: 'auto', doubleSided: 'omit' },  // 'omit' = the material object has NO doubleSided key
  },                                               // gltf.indexType: 'auto' since 08 P2-1b (B-L5), Phase-1 'uint16';
                                                   // viewport.winding: 'ccw' since 08 P2-2a (B-H1), Phase-1 'legacy-cw';
                                                   // viewport.normals: 'averaged' since 08 P2-2b (B-L3), Phase-1 'right-panel';
                                                   // obj winding/normals/stripNormals since 08 P2-2c (B-H2), Phase-1
                                                   // 'legacy-cw' / 'none' / 'constant-z'; gltf winding/normals/attributes
                                                   // since 08 P2-2d (B-H2), Phase-1 'legacy-cw' / 'none' / ['POSITION'],
                                                   // and the new leaf gltf.panelNormal (08 P2-2d)
  exportCombinedColor: 'first-section',            // B-L6
  mtlTextureNaming: 'index',                       // B-M2
  zipTextureNaming: 'sanitized-name',              // B-L14 (no de-duplication)
  mtlDownloadDelayMs: 100,                         // B-L7
  zipJsonIncludesAngleOffset: false,               // B-M3
  importValidation: 'none',                        // B-L8
  framingBounds: 'flat',                           // B-L2, B-M10
  curveBeforeFirstPanel: true,                     // B-L1
  safeDistanceBand: 'per-column-own-normal',       // B-M15, B-L29
  frustumDepthM: 15,                               // B-L33
  previewRendererSize: [320, 180],                 // B-M9
  previewRendersHelpers: true,                     // B-M11
  gizmoRotateSign: -1,                             // B-M12
  pilotForwardYSign: -1,                           // B-M13
  combinedLedSimColor: 'white',                    // B-L18
  dispose: { wallTextures: true, gizmo: true },    // B-H5 fixed (Phase 1C H1); B-L12 fixed (Phase 1C H2)
});

/** The exact Phase-1 mesh profiles (08 P2-0, docs/improvements/08-bugfix-roadmap.md 4.2). Production code never
 *  reads these; the oracle tests inject them into WallMeshBuilder / ObjExporter / GltfExporter so that the
 *  "builder == verbatim oracle" tests stay meaningful after each Phase-2 flip of Strategies.mesh. Every value here
 *  must stay a supported case of the builder and the exporters. The only legacy-profile fixture. */
export const LegacyProfiles = deepFreeze({
  mesh: {
    viewport: { winding: 'legacy-cw', normals: 'right-panel', combinedUV: 'atlas-u-full-v', side: 'double' },
    obj:      { winding: 'legacy-cw', normals: 'none', stripNormals: 'constant-z',
                combinedUV: 'per-section-overlap', panelNormal: 'facing' },
    gltf:     { winding: 'legacy-cw', normals: 'none', attributes: ['POSITION'], indexType: 'uint16',
                doubleSided: 'omit' },
  },
});

/** @returns {Error} Error(`Unsupported strategy ${key}=${JSON.stringify(value)}`) */
export function unsupportedStrategy(key, value)

/** LEGACY(B-L9): `v || d` (0, '', NaN fall back to the default). Every input rule table uses it. */
export const orDefault = (v, d) => v || d;

/** LEGACY(B-M4): returns s unchanged; every template interpolation of user text goes through it,
 *  so escaping is a one-function fix. */
export const legacyHtml = (s) => s;

/** Register of every tagged legacy site (sections 8.2 and 8.3). Frozen array of
 *  { id: 'B-M14', site: 'js/interaction/ViewportInput.js#attachPointer', behaviour: '...', fix: '...' }.
 *  Entries whose site is not under js/ (CSS, markup) are documentation-only. */
export const LEGACY_SITES
```
`deepFreeze` is module-private. `LegacyProfiles` is not a switch: it has no read site in `js/` and is not covered by the `Strategies` rule of the static check; when a Phase-2 commit flips a `Strategies.mesh.*` key, the builder keeps the legacy case for it (08 5.1 rule 3), and global keys (`exportCombinedColor`, ...) cannot be injected, so the oracle cases that depend on a retired global key become explicit expected-value tests in that commit (08 P2-1a retired `gltfBase64` and deleted `legacySpreadBase64`; `tests/unit/io.test.mjs` injects a verbatim copy of that encoder into its oracle exporter). The `behaviour` and `fix` strings of each `LEGACY_SITES` entry are the 8.2 cell texts with only the markdown escape `\|` unescaped to `|` (inline backticks are kept as written); the 8.2 register is stored once and expanded per 8.3 site. Phase 1 implements only the legacy value of every key, except the `dispose.*` keys flipped by the non-observable Phase 1C clean-ups (8.1; a landed fix keeps its 8.2 row and loses its 8.3 rows, so `LEGACY_SITES` no longer lists it). Phase 2 retires keys as 08 4.1 lists them (the key, its switch and its 8.1 row are deleted in the fixing commit); retired so far: `gltfBase64` (08 P2-1a); flipped so far: `mesh.gltf.indexType` (`'auto'`, 08 P2-1b), `mesh.viewport.winding` (`'ccw'`, 08 P2-2a), `mesh.viewport.normals` (`'averaged'`, 08 P2-2b), `mesh.obj.winding` / `.normals` / `.stripNormals` (`'ccw'` / `'averaged'` / `'per-vertex'`, 08 P2-2c), `mesh.gltf.winding` / `.normals` / `.attributes` (`'ccw'` / `'averaged'` / `['POSITION', 'NORMAL']`, 08 P2-2d); added: `mesh.gltf.panelNormal` (`'facing'`, 08 P2-2d). Every leaf key (arrays such as `mesh.gltf.attributes` and `previewRendererSize` are leaves) has the read site given in section 8.1 and spelled out in that module's entry below; how it is read (switch-and-throw, value, array comparison) follows section 1.5.

### 3.4 `js/theme/Theme.js`

Every scene, canvas and export literal, copied verbatim with its exact type (number vs string). Only `App.js` imports this module; every consumer receives `theme` (or one of its parts) by injection, so Feature 6 swaps in a ThemeBridge-built object **of the same shape** in one line (no mutation of these frozen objects).

```js
export const SceneTheme = Object.freeze({
  background: 0x0a0a0f,                                                     // 1431
  grid: { size: 50, divisions: 50, centerColor: 0x2a2a3a, color: 0x1a1a24, position: [12.5, 0, 12.5] },   // 1446-1447
  axesSize: 0.5,                                                            // 1449
  lights: { ambient: { color: 0xffffff, intensity: 0.3 },
            point: { color: 0xffffff, intensity: 0.8, position: [5, 5, 10] } },   // 1440-1443
  frame: 0x4a4a5a,                                                          // 1563
  cameraBody: { color: 0xff6600, opacity: 0.8 },                            // 2334
  frustumLines: { color: 0xffaa00, opacity: 0.7 },                          // 2407
  frustumFill: { color: 0xffaa00, opacity: 0.08 },                          // 2425-2426
  safeZone: { wallColor: [0.2, 1, 0.4], thresholdColor: [1, 0.2, 0.2], floorOpacity: 0.5,
              lineColor: 0xff4444, lineOpacity: 0.8, labelColor: '#ff4444', labelFont: 'bold 32px Arial' },   // 2698-2749
  person: { body: 0x4488ff, dark: 0x2244aa, opacity: 0.85 },                // 2840-2841
  car: { body: { color: 0xff4444, opacity: 0.85 }, dark: { color: 0x222222, opacity: 0.9 },
         glass: { color: 0x88ccff, opacity: 0.5 }, lights: 0xffffaa },      // 2915-2917, 2960
  gizmo: { x: 0xff4444, y: 0x44ff44, z: 0x4444ff, idleOpacity: 0.35, hoverOpacity: 1.0, dimmedOpacity: 0.15 },
         // 3010, 3029-3089, 3225, 3264. Axis colours are a convention: never brand them.
});
export const CanvasTheme = Object.freeze({
  background: '#0a0a0f',                                                    // 1693, 1821, 2009, 2064
  panelBorderColors: ['#ff0000', '#00ff00', '#0000ff'],                     // 1384 (frozen array)
  panelLabelFont: (px) => `bold ${px}px 'JetBrains Mono', monospace`,       // 2034, 2092
  panelSectionNameFont: (px) => `${px}px 'JetBrains Mono', monospace`,      // 2042
  sectionLabelFont: (px) => `bold ${px}px 'Outfit', sans-serif`,            // 2107
  sectionLabelAlpha: 0.6,                                                   // 2110
  logoAlpha: 0.8,                                                           // 2181
});
export const UiColors = Object.freeze({
  status: { within: '#00ff66', offCenter: '#ffaa00', exceeds: '#ff4444' },  // 2518-2524
});
export const Palette = Object.freeze({
  sectionColors: ['#00f0ff', '#ff00aa', '#00ff66', '#ff6b35', '#ffdd00', '#aa66ff', '#66ffaa', '#ff6666'],   // 1379-1382
  cardSwatches: ['#00f0ff', '#ff00aa', '#00ff66', '#ff6b35', '#ffffff', '#ffdd00'],   // 3970-3975 (documentation:
                                                                                     // the card template keeps them literal in Phase 1)
  defaultSectionColor: '#00f0ff',                                           // 1406
});
export const Brand = Object.freeze({
  productName: 'LED Wall Configurator',
  objHeader: '# LED Wall Configuration OBJ Export\n',                       // 4557
  objGeneratorLine: '# Generated by LED Wall Configurator\n\n',             // 4559
  mtlHeader: '# LED Wall Materials\n\n',                                    // 4561
  gltfGenerator: 'LED Wall Configurator',                                   // 4721
  safeDistanceObjHeader: '# Safe Distance Floor Mesh\n# Exported from LED Wall Configurator\n\n',   // 2792
  files: { json: 'led-wall-config.json', obj: 'led-wall-config.obj', mtl: 'led-wall-config.mtl',
           gltf: 'led-wall-config.gltf', zip: 'led-wall-export.zip', panelIdsPng: 'panel-ids.png',
           safeDistanceObj: 'safe-distance-floor.obj' },
});
export const Theme = Object.freeze({ scene: SceneTheme, canvas: CanvasTheme, ui: UiColors, palette: Palette, brand: Brand });
```
(All nested objects and arrays are frozen, through a module-private `deepFreeze` of `Theme.js` itself, because `theme/` may not import `legacy/`; the three font-helper functions of `CanvasTheme` are values and stay unfrozen. The OBJ `mtllib led-wall-config.mtl` line is written from `Brand.files.mtl`.)

### 3.5 Domain (pure)

#### `js/domain/WallSection.js`
```js
export const MM_TO_M = 0.001;   // replaces the 8 local `const scale = 0.001`
export const SECTION_FIELDS = Object.freeze(['id', 'name', 'panelCols', 'panelRows', 'panelWidth', 'panelHeight',
                                             'ledX', 'ledY', 'curveIntensity', 'angleOffset', 'color']);

export class WallSection {
  /** Assigns exactly the SECTION_FIELDS keys from `fields`, in SECTION_FIELDS order, as own enumerable
   *  properties, with NO coercion or validation (LEGACY(B-L8): imported strings/NaN stay as they are). */
  constructor(fields)

  /** {id: 0, name: 'Wall 1', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32,
   *   curveIntensity: 0, angleOffset: 0, color: '#00f0ff'}  (1395-1407) */
  static createDefault()

  /** `Wall ${index + 1}` */
  static defaultName(index)

  /** Verbatim 4030-4036, applied to v = parseFloat(raw). B-L9 via orDefault (tagged in LegacyCompat); LEGACY(B-L15) no rounding.
   *  panelCols: v => Math.max(1, Math.min(50, orDefault(v, 1)))
   *  panelRows: v => Math.max(1, Math.min(20, orDefault(v, 1)))
   *  panelWidth: v => Math.max(50, Math.min(5000, orDefault(v, 500)))
   *  panelHeight: v => Math.max(50, orDefault(v, 500))
   *  ledX / ledY: v => Math.max(8, orDefault(v, 32))
   *  curveIntensity: v => orDefault(v, 0)
   *  angleOffset: v => Math.max(-180, Math.min(180, orDefault(v, 0))) */
  static FIELD_RULES

  /** const v = parseFloat(raw); return Object.prototype.hasOwnProperty.call(FIELD_RULES, field) ? FIELD_RULES[field](v) : v;
   *  (own-key test: a plain `FIELD_RULES[field]` lookup is truthy for inherited names such as 'constructor';
   *  the legacy if/else chain 4030-4036 returned the raw parseFloat for every field it did not name;
   *  not `Object.hasOwn`, which is newer than the browser floor of 1.2) */
  static parseField(field, raw)

  /** this[field] = WallSection.parseField(field, raw); returns the stored value. */
  setField(field, raw)
  /** this.color = color */
  setColor(color)
  /** this.name = raw || WallSection.defaultName(index); returns this.name (4016). */
  rename(raw, index)
  /** if (!this.name) this.name = WallSection.defaultName(index)  (render-time fill, 3901). */
  ensureName(index)

  /** this.curveIntensity === 0 ? 'Flat' : (this.curveIntensity > 0 ? 'Concave' : 'Convex') */
  get curveType()
  /** `${curveType}${c !== 0 ? ` (${c > 0 ? '+' : ''}${c}°)` : ''}` with c = this.curveIntensity (3958 == 4044). */
  get curveHint()
  /** this.panelCols * this.ledX */
  get canvasWidth()
  /** this.panelRows * this.ledY */
  get canvasHeight()
  /** `${panelCols}×${panelRows} • ${canvasWidth}×${canvasHeight}px • ${curveType}` (3906 == 4051) */
  get summary()
  /** (w > 3840 || h > 2160) && (w > 2160 || h > 3840) with w/h = canvasWidth/Height. LEGACY(B-L17): per section only. */
  get exceeds4K()
}
```
Fields keep the legacy names so ported code reads `section.panelCols` unchanged. Ids are never written after construction.

#### `js/domain/Wall.js`
```js
export const PivotMode = Object.freeze({ BOTTOM_LEFT: 'bottom-left', MESH_CENTER: 'mesh-center', WALL_CENTER: 'wall-center' });

export class WallPivot {            // Feature 3 seam; Phase 1 is always the identity
  mode = PivotMode.BOTTOM_LEFT;
  offset = { x: 0, y: 0, z: 0 };
  get isIdentity()                 // mode === BOTTOM_LEFT && offset x, y, z all === 0
}

export class Wall {
  constructor({ sections = [WallSection.createDefault()], nextSectionId = 1, pivot = new WallPivot() } = {})
  /** The live array (legacy `wallSections`). Mutated by push in appendLikeLast; REPLACED (new array) by
   *  removeById and replaceAll, exactly like legacy. Callers that need a stable copy must slice(). */
  get sections()
  nextSectionId                    // public field (legacy global 1409)
  pivot                            // public field (WallPivot)
  get count()                      // sections.length

  /** Verbatim 4088-4103. Evaluation order matters: `id: this.nextSectionId++` and the name are evaluated
   *  BEFORE `last.panelCols`, so an empty wall increments the allocator and then throws TypeError (B-L8).
   *  const last = sections[sections.length - 1]; const newColorIndex = sections.length % sectionColors.length;
   *  new WallSection({ id: this.nextSectionId++, name: `Wall ${sections.length + 1}`, panelCols: last.panelCols,
   *    panelRows: last.panelRows, panelWidth: last.panelWidth, panelHeight: last.panelHeight, ledX: last.ledX,
   *    ledY: last.ledY, curveIntensity: last.curveIntensity, angleOffset: 0, color: sectionColors[newColorIndex] })
   *  then sections.push(it). @returns {WallSection} */
  appendLikeLast(sectionColors)

  /** this.#sections = this.#sections.filter(s => s.id !== id)  (removes every duplicate, B-L8; 4133). */
  removeById(id)

  /** this.#sections = sections; this.nextSectionId = Math.max(...sections.map(s => s.id)) + 1  (4976, 4989;
   *  -Infinity for [] and NaN for non-numeric ids are preserved, B-L8). */
  replaceAll(sections)

  /** Verbatim 2309-2313 in section order:
   *  totalPixels += cols*rows*ledX*ledY; totalPanels += cols*rows; totalArc += cols*Math.abs(curveIntensity);
   *  @returns {{totalPixels, totalPanels, totalSections: sections.length, totalArc}} */
  totals()

  /** LEGACY(B-L2, B-M10): totalWidth += s.panelCols * s.panelWidth * MM_TO_M;
   *  maxHeight = Math.max(maxHeight, s.panelRows * s.panelHeight * MM_TO_M); computed live on every call.
   *  @returns {{totalWidth, maxHeight}}  (== the four legacy copies 2489-2493, 2553-2557, 2598-2603, 3758-3762) */
  flatBounds()
}
```

#### `js/domain/Project.js`
```js
export const ContentMode = Object.freeze({ COLOR: 'color', LED_SIM: 'ledSim', PANEL_IDS: 'panelIds' });

export class DisplaySettings {
  wireframe = false;                 // legacy wireframeEnabled
  showFrame = false;                 // legacy showFrame
  content = ContentMode.COLOR;       // replaces ledSimEnabled + panelIdsEnabled (they are never both true)
  ledLayout = 'single-dot';          // legacy ledLayout
  showGrid = true;                   // legacy showGrid
  showSafeDistance = false;          // legacy safeDistanceEnabled
  get ledSimEnabled()                // content === 'ledSim'
  get panelIdsEnabled()              // content === 'panelIds'
  /** on: forced = (content === 'panelIds'); content = 'ledSim'. off: if (content === 'ledSim') content = 'color'.
   *  @returns {boolean} true if panel IDs were forced off (4172-4176) */
  setLedSim(on)
  /** Mirror image of setLedSim (4192-4196). @returns {boolean} true if LED sim was forced off */
  setPanelIds(on)
}

export class PanelIdStyle {
  borderThickness = 8; fontSize = 0; fontColor = '#ffffff';
  sectionLabelEnabled = true; sectionLabelFontSize = 0; sectionLabelColor = '#888888';   // 1295-1296, 1387-1390
  /** Verbatim 4201/4206/4220 (parseInt WITHOUT radix):
   *  borderThickness: raw => Math.max(1, Math.min(32, orDefault(parseInt(raw), 8)))
   *  fontSize: raw => Math.max(0, Math.min(200, orDefault(parseInt(raw), 0)))
   *  sectionLabelFontSize: raw => Math.max(0, Math.min(400, orDefault(parseInt(raw), 0))) */
  static RULES
  /** this[key] = Object.prototype.hasOwnProperty.call(RULES, key) ? RULES[key](rawOrValue) : rawOrValue: the numeric
   *  keys (own keys of RULES) go through RULES; fontColor, sectionLabelColor, sectionLabelEnabled are stored as given
   *  (not `Object.hasOwn`: browser floor, 1.2).
   *  @returns the stored value */
  set(key, rawOrValue)
}

export class Project {
  constructor({ wall, meshMode = 'combined', display, panelIdStyle, logos, camera, person, car })
  wall;          // Wall
  meshMode;      // 'combined' | 'section' | 'panel' | any imported string (B-L8: unknown renders as panels; tagged at LEDWallView.rebuild)
  display;       // DisplaySettings
  panelIdStyle;  // PanelIdStyle
  logos;         // LogoLibrary
  camera;        // CineCamera
  person;        // PersonProp
  car;           // CarProp
  static createDefault()   // new Project({ wall: new Wall(), display: new DisplaySettings(), panelIdStyle: new PanelIdStyle(),
                           //   logos: new LogoLibrary(), camera: new CineCamera(), person: new PersonProp(), car: new CarProp() })
}
```

#### `js/domain/LogoLibrary.js`
Logos are deliberately **not** stored on `WallSection`: legacy keys them by id across deletes and imports (B-L21), so they outlive section objects.
```js
export class LogoLibrary {
  // #entries = {} : a plain object; every method indexes it with the given key unchanged, so keys follow
  // JS property-key coercion exactly like legacy `sectionLogos[id]` (UI handlers pass parseInt(dataset.sectionId),
  // the renderer and delete pass section.id; LEGACY(B-L8): an id matches a parseInt key only when
  // String(parseInt(String(id))) === String(id), so numeric-string ids such as '7' and NaN ids match, while ids
  // such as 'a', '07' or 1.5 never do).
  get(sectionId)                    // this.#entries[sectionId]
  hasImage(sectionId)               // this.#entries[sectionId] && this.#entries[sectionId].image   (verbatim 2196 expression)
  ensure(sectionId)                 // if (!entries[id]) entries[id] = { position: 'center', scale: 0.3 } (a fresh object); return entries[id]
  setImage(sectionId, image)        // this.ensure(sectionId).image = image   (2266-2269)
  remove(sectionId)                 // delete this.#entries[sectionId]       (2282, 4131)
  setPosition(sectionId, position)  // if (entries[id]) { entries[id].position = position; return true } return false   (2290-2291)
  setScale(sectionId, fraction)     // same shape for .scale                                                    (2301-2302)
  /** Math.max(5, Math.min(100, orDefault(parseInt(raw), 30)))  (2298) */
  static parseScalePercent(raw)
}
```

#### `js/domain/CineCamera.js`
```js
export const FILMBACK_PRESETS = /* verbatim 1306-1318, deep-frozen, including 'custom': {name:'Custom', width:36, height:24} */;

export class CineCamera {
  enabled = false;                                             // legacy cameraPreviewEnabled
  filmback = 'full-frame'; filmbackWidth = 36; filmbackHeight = 24; focalLength = 35;
  posX = 0; posY = 1.5; posZ = 5; rotX = 0; rotY = 0; rotZ = 0;   // legacy cameraSettings field names (1320-1331)

  /** Verbatim 4266-4317. writeBack mirrors whether legacy assigned `this.value` afterwards.
   *  filmbackWidth:  { parse: r => Math.max(1, Math.min(100, orDefault(parseFloat(r), 36))), writeBack: true }
   *  filmbackHeight: { parse: r => Math.max(1, Math.min(100, orDefault(parseFloat(r), 24))), writeBack: true }
   *  focalLength:    { parse: r => Math.max(8, Math.min(800, orDefault(parseFloat(r), 35))), writeBack: true }
   *  posX: { parse: r => orDefault(parseFloat(r), 0), writeBack: false }
   *  posY: { parse: r => Math.max(0, orDefault(parseFloat(r), 1.5)), writeBack: true }      (B-L9 via orDefault: '0' gives 1.5)
   *  posZ: { parse: r => Math.max(0.1, orDefault(parseFloat(r), 5)), writeBack: true }
   *  rotX: { parse: r => Math.max(-90, Math.min(90, orDefault(parseFloat(r), 0))), writeBack: true }
   *  rotY: { parse: r => Math.max(-180, Math.min(360, orDefault(parseFloat(r), 0))), writeBack: true }
   *  rotZ: { parse: r => Math.max(-180, Math.min(180, orDefault(parseFloat(r), 0))), writeBack: true } */
  static FIELD_RULES
  setField(field, raw)              // this[field] = FIELD_RULES[field].parse(raw); returns it
  /** const preset = FILMBACK_PRESETS[key]; this.filmback = key; if (key !== 'custom') { this.filmbackWidth = preset.width;
   *  this.filmbackHeight = preset.height; } return preset;   (4252-4259) */
  applyPreset(key)

  hFov()     // 2 * Math.atan(this.filmbackWidth / (2 * this.focalLength))   radians, the shared legacy expression
  vFov()     // 2 * Math.atan(this.filmbackHeight / (2 * this.focalLength))
  aspect()   // this.filmbackWidth / this.filmbackHeight
  /** Math.min(bounds.totalWidth / (2 * Math.tan(hFov / 2)), bounds.maxHeight / (2 * Math.tan(vFov / 2)))
   *  (2529-2531 == 2610-2612; hFov/vFov from the methods above) */
  maxSafeDistance(bounds)
  /** LEGACY(B-M10) verbatim 2473-2531: distToWall = posZ; frameWidth = 2 * Math.tan(hFov / 2) * distToWall;
   *  frameHeight likewise; fitsWidth/fitsHeight; frameLeft/Right/Bottom/Top around (posX, posY); rotation ignored;
   *  wall = [0, totalWidth] x [0, maxHeight]; safeDistance = this.maxSafeDistance(bounds) (the same expressions,
   *  hFov()/vFov() recomputed: pure, identical values); the unused legacy locals wallCenterX/Y are dropped.
   *  @returns {{frameWidth, frameHeight, status: 'within'|'offCenter'|'exceeds', safeDistance}} */
  coverage(bounds)
  /** posX = bounds.totalWidth / 2; posY = bounds.maxHeight / 2; posZ = 5; rotX = 0; rotY = 0; rotZ = 0  (2559-2564) */
  resetTo(bounds)
  /** LEGACY(B-L34): FILMBACK_PRESETS[this.filmback]?.name.split(' ')[0] || 'Custom' */
  presetShortName()

  // Gizmo arithmetic (the Selectable 'camera' is CameraController; it calls these)
  /** posX += dx; posY = Math.max(0, posY + dy); posZ += dz   LEGACY(B-L10) (3338-3340) */
  translateBy(dx, dy, dz)
  /** x: rotX = Math.max(-90, Math.min(90, rotX + deltaDeg)); y: rotY += deltaDeg;
   *  any other axis (the legacy `else`, normally 'z'): rotZ = Math.max(-180, Math.min(180, rotZ + deltaDeg)).  deltaDeg already carries Strategies.gizmoRotateSign,
   *  so `rotX + (-a)` is bit-identical to legacy `rotX - a` (3376-3384). LEGACY(B-L28): Euler channels. */
  rotateBy(axis, deltaDeg)

  // Pilot arithmetic
  /** rotY -= deltaX * 0.3; rotX = Math.max(-90, Math.min(90, rotX - deltaY * 0.3))  (3551-3552) */
  pilotLook(deltaX, deltaY)
  /** Verbatim 3578-3611 with keys = {forward, back, left, right, down, up} booleans and plain {x,y,z} vectors:
   *  per pressed key, in this order, the legacy += / -= statements (forward: x,y,z += forward*speed; back: -=;
   *  left: x,z -= right*speed; right: +=; down: posY -= speed; up: posY += speed); then ALWAYS
   *  posY = Math.max(0.1, posY)  LEGACY(B-L10) silent per-frame clamp.  @returns {boolean} moved */
  pilotFly(keys, forward, right, speed)
}
```

#### `js/domain/Prop.js`
```js
export class Prop {
  constructor({ kind, label, posX, posZ, rotY = 0, scale = 1, gizmoAnchorY })
  kind; label; gizmoAnchorY;          // 'person'|'car'; 'Person'|'Car'; 0.9 | 0.5 (3129, 3131)
  visible = false;                    // legacy showPerson / showCar
  posX; posZ; rotY; scale;            // legacy personSettings / carSettings
  /** Verbatim 4345-4358 (car 4376-4389):
   *  posX: { parse: r => orDefault(parseFloat(r), 0), writeBack: false }
   *  posZ: { parse: r => orDefault(parseFloat(r), 0), writeBack: false }
   *  rotY: { parse: r => Math.max(-180, Math.min(180, orDefault(parseFloat(r), 0))), writeBack: true }
   *  scale: { parse: r => Math.max(0.5, Math.min(2, orDefault(parseFloat(r), 1))), writeBack: true } */
  static FIELD_RULES
  setField(field, raw)                // stores and returns FIELD_RULES[field].parse(raw)
  /** posX += dx; posZ += dz; dy ignored. LEGACY(B-L22) (3348-3349) */
  translateBy(dx, dy, dz)
  /** axis === 'y' ? (rotY += deltaDeg, true) : false. LEGACY(B-L22) (3389-3399) */
  rotateBy(axis, deltaDeg)
}
export class PersonProp extends Prop { constructor() { super({ kind: 'person', label: 'Person', posX: 2, posZ: 2, gizmoAnchorY: 0.9 }); } }
export class CarProp    extends Prop { constructor() { super({ kind: 'car',    label: 'Car',    posX: 4, posZ: 3, gizmoAnchorY: 0.5 }); } }
```

### 3.6 Geometry (pure)

#### `js/geometry/WallLayout.js`: the single cursor walk
Replaces the three identical walks at 1482-1549 (viewport), 2614-2647 (safe distance) and 5012-5080 (exports).
```js
/** Verbatim 1483-1549 (the arithmetic is identical in all three legacy copies):
 *  let currentX = 0, currentZ = 0, currentAngle = 0;
 *  per section: panelW = section.panelWidth * MM_TO_M; panelH = section.panelHeight * MM_TO_M;
 *  curveAngleRad = (section.curveIntensity * Math.PI) / 180; isFlat = section.curveIntensity === 0;
 *  currentAngle += ((section.angleOffset || 0) * Math.PI) / 180;
 *  edges = [{x: currentX, z: currentZ, angle: currentAngle}];
 *  for (col = 0; col < section.panelCols; col++) { if (!isFlat) currentAngle += curveAngleRad;   // LEGACY(B-L1)
 *     currentX += panelW * Math.cos(currentAngle); currentZ += panelW * Math.sin(currentAngle); edges.push({...}) }
 *  panels (rows outer, cols inner): {x: (l.x + r.x) / 2, y: row * panelH + panelH / 2 (as `y + panelH / 2` with y = row * panelH),
 *     z: (l.z + r.z) / 2, rotY: -Math.atan2(r.z - l.z, r.x - l.x), col, row, sectionIndex}
 *  First statement: switch (Strategies.curveBeforeFirstPanel) { case true: break;
 *    default: throw unsupportedStrategy('curveBeforeFirstPanel', Strategies.curveBeforeFirstPanel) }
 *  @param {WallSection[]} sections  read raw, never coerced
 *  @param {{postTransforms?: (number[]|null)[]}} [options]  Feature 2 seam; Phase 1 callers never pass it
 *  @returns {WallLayout} */
export function computeWallLayout(sections, { postTransforms = null } = {})

/** THE single entry point used by every consumer (LEDWallView via WallController, SafeDistanceView via CameraHub,
 *  exporters via ProjectIO): computeWallLayout(project.wall.sections). Features 2 and 3 add options here only. */
export function layoutProject(project)

/** The single switch for the four flat-bounds consumers (orbit target, camera reset, coverage status, safe-D):
 *  switch (Strategies.framingBounds) { case 'flat': return project.wall.flatBounds();   // LEGACY(B-L2, B-M10)
 *  default: throw unsupportedStrategy(...) }   @returns {{totalWidth, maxHeight}} */
export function framingBounds(project)

export class SectionLayout {
  /** One options object (built only by computeWallLayout): postTransform is stored as given (`postTransforms[i] ?? null`). */
  constructor({ section, sectionIndex, panelW, panelH, isFlat, edges, panels, postTransform = null })
  section; sectionIndex; sectionId;     // sectionId === section.id
  panelW; panelH; isFlat;
  edges;            // [{x, z, angle}] (legacy edgePositions), length panelCols + 1 for integer counts
  panels;           // [{x, y, z, rotY, col, row, sectionIndex}] (legacy panelData), row-major
  postTransform;    // Feature 2 hook: column-major 4x4 array or null. ALWAYS null in Phase 1, never read, never fed
                    // back into the cursor.
}

export class WallLayout {
  constructor({ sections })   // built only by computeWallLayout
  sections;         // SectionLayout[]
  /** Legacy safe-distance `allEdges` (2619-2647): [] when there are no sections; otherwise sections[0].edges[0]
   *  followed by every section's edges.slice(1), in order. MUST return [] (not throw) for an empty wall:
   *  legacy imports of `sections: []` with preview + safe distance on add an empty group and do not throw. */
  flatEdges()
  get firstEdge()   // sections[0].edges[0] or null when empty            (Feature 3)
  get lastEdge()    // last section's last edge or null when empty         (Feature 3)
  /** True axis-aligned box of every grid vertex (loops row <= panelRows, col <= panelCols over edges, y = row * panelH),
   *  {min:{x,y,z}, max:{x,y,z}} or null when empty. Computed on demand (a fresh object per call) with plain < / >
   *  comparisons: NaN coordinates are skipped, 0 and -0 are not distinguished, and a wall whose sections have no grid
   *  vertex gives {min: +Infinity x3, max: -Infinity x3}. Unused in Phase 1; unit-tested. */
  bounds()
  /** 'bottom-left': {x: firstEdge.x, y: 0, z: firstEdge.z}; 'wall-center': midpoint of firstEdge and lastEdge, y 0
   *  (the owner's "middle of entire wall"); 'mesh-center': centre of bounds() (y policy decided in Feature 3).
   *  null when empty; an unknown mode throws RangeError. Unused in Phase 1; unit-tested. */
  pivotPoint(mode)
}
```

#### `js/geometry/WallMeshBuilder.js`: the one owner of winding, normals and UVs
```js
/** winding 'ccw' (08 6.4; every production profile: viewport 08 P2-2a, OBJ P2-2c, glTF P2-2d) -> [bl, br, tr, bl, tr, tl],
 *  which gives panel [0, 1, 2, 0, 2, 3];
 *  winding 'legacy-cw' -> [bl, tl, tr, bl, tr, br] (the Phase-1 order, B-H1/B-H2, kept for LegacyProfiles; untagged). Any other
 *  value throws unsupportedStrategy('mesh.winding', winding) (the key style of 'mesh.normals', 'mesh.combinedUV',
 *  'mesh.panelNormal'). 'legacy-cw' reproduces all 8 legacy index sites: viewport 1638 / 1749, OBJ 4599-4600 /
 *  4648-4649, glTF 4844 / 4863, and panel quads with corners BL=0, BR=1, TR=2, TL=3: quadIndices(0, 1, 3, 2) =
 *  [0, 3, 2, 0, 2, 1] (glTF 4887) and OBJ `v, v+3, v+2 / v, v+2, v+1` = quadIndices(v, v+1, v+3, v+2) (4705-4706).
 *  Both split along the bl-tr diagonal: 'ccw' triangle 0 is 'legacy-cw' triangle 1 with its last two vertices swapped,
 *  and 'ccw' triangle 1 is 'legacy-cw' triangle 0 swapped the same way (08 6.4). */
export function quadIndices(bl, br, tl, tr, winding = 'legacy-cw')

/** The largest value of an index array by a loop (no spread); NaN entries are skipped; [] gives -Infinity. (08 P2-1b) */
export function maxIndexOf(indices)
/** 08 6.2 (B-L5): maxIndex >= 65535 ? 'uint32' : 'uint16'. 65,535 is the restart value of 5123 (forbidden by glTF 2.0,
 *  applied by WebGL2), so 32-bit indices start AT it. Read by GltfExporter (indexType 'auto', 08 P2-1b) and LEDWallView
 *  (08 P2-1e). */
export function indexWidth(maxIndex)

export class WallMeshBuilder {
  /** @param {object} profile  one of Strategies.mesh.viewport | .obj | .gltf (stored as given; App passes the frozen object).
   *  Every profile read in this class (and in the exporters, through builder.profile) is `profile.<leaf>`:
   *  winding (passed to quadIndices, which switches), normals (sectionGrid), combinedUV (combinedGrid),
   *  panelNormal (panelFacingNormal). */
  constructor(profile)
  get profile()

  /** One section's vertex grid, verbatim 1598-1640 / 1716-1751 / 5041-5048, pushing into `out` (append with loops,
   *  never spread). For row = 0..panelRows (<=), y = row * sl.panelH; for col = 0..panelCols (<=), edge = sl.edges[col]:
   *    positions.push(edge.x, y, edge.z)
   *    normals = opts.normals ?? this.profile.normals, read with
   *      switch (normals) { case 'averaged': ...; case 'right-panel': ...; case 'none': ...; default: throw unsupportedStrategy('mesh.normals', normals) }:
   *      'averaged' (08 6.4 with 01 CR-1; the viewport since 08 P2-2b): if sl.isFlat, the 'right-panel' normals verbatim
   *      (bit-identical by construction: the test is per section, because accumulated edge positions make neighbouring
   *      panel normals of a flat section at a non-axis heading differ in the last bit); otherwise, with C = edges.length - 1
   *      and n[j] = (-dz/len, 0, dx/len) of edges j -> j+1 (the 1610-1615 arithmetic), column 0 -> n[0], column C -> n[C-1],
   *      any other column -> normalize(n[col-1] + n[col]); every row of a column gets the same normal, never negated,
   *      and no averaging across section junctions; a section without a column pair throws the 'right-panel' TypeError;
   *      'right-panel' (the Phase-1 case, kept for LegacyProfiles; B-L3 fixed): verbatim 1607-1625 (normal of the panel
   *      to the right; the last column uses the previous edge pair), pushed as (nx, 0, nz); 'none': nothing pushed
   *    uvs: uv === 'unit' -> (col / panelCols, row / panelRows); uv = {offsetU, widthU} ->
   *      (offsetU + (col / panelCols) * widthU, row / panelRows)  (B-M5, tagged at combinedGrid); uv === null (or
   *      undefined) -> nothing pushed; any other non-object uv throws TypeError (a programmer error, not a strategy)
   *  Indices: vertsPerRow = section.panelCols + 1 (raw: string cols concatenate, B-L8); for row < panelRows,
   *    col < panelCols: bl = indexBase + row * vertsPerRow + col; br = bl + 1;
   *    tl = indexBase + (row + 1) * vertsPerRow + col; tr = tl + 1;   (exact left-to-right association, B-L15)
   *    indices.push(...quadIndices(bl, br, tl, tr, profile.winding))
   *  vertexAdvance = (section.panelCols + 1) * (section.panelRows + 1)   (the DECLARED count, B-L15)
   *  @param {SectionLayout} sl
   *  @param {{indexBase?: number, uv?: 'unit'|{offsetU:number,widthU:number}|null, normals?: 'averaged'|'right-panel'|'none'}} [opts]
   *         defaults: indexBase 0, uv null, normals profile.normals
   *  @param {{positions:number[], normals:number[], uvs:number[], indices:number[]}} [out]  defaults to fresh arrays
   *  The normals switch runs once per call, before any output (a foreign value throws even for an empty grid); the
   *  winding is read once into a local and passed to quadIndices per quad (a foreign winding throws only when the
   *  section has at least one quad). Phase-1 values never reach a default branch.
   *  @returns {{positions, normals, uvs, indices, vertexAdvance}}  (the out arrays) */
  sectionGrid(sl, opts, out)

  /** Combined mesh (1579-1644): calls sectionGrid for each section in order into shared arrays with
   *  indexBase = running vertexOffset (starts 0, += vertexAdvance) and the uv option from
   *  switch (this.profile.combinedUV) { case 'atlas-u-full-v': uv = {offsetU: atlas.entries[i].uvOffsetX,
   *  widthU: atlas.entries[i].uvWidth}; break; default: throw unsupportedStrategy('mesh.combinedUV', ...) }; the switch
   *  runs once per call, before any output (it throws even for an empty wall).
   *  @returns {{positions, normals, uvs, indices,
   *            sectionRanges: [{sectionId, sectionIndex, indexStart, indexCount}]}}  (sectionRanges: Feature 2 picking seam) */
  combinedGrid(layout, atlas)

  /** Verbatim 4680-4690 == 4875-4885: hw = panelW / 2; hh = panelH / 2; cos = Math.cos(panel.rotY); sin = Math.sin(panel.rotY);
   *  [BL {x: panel.x + (-hw) * cos, y: panel.y - hh, z: panel.z - (-hw) * sin},
   *   BR {x: panel.x + (hw) * cos,  y: panel.y - hh, z: panel.z - (hw) * sin},
   *   TR {x: panel.x + (hw) * cos,  y: panel.y + hh, z: panel.z - (hw) * sin},
   *   TL {x: panel.x + (-hw) * cos, y: panel.y + hh, z: panel.z - (-hw) * sin}] */
  panelCorners(panel, panelW, panelH)
  /** quadIndices(base, base + 1, base + 3, base + 2, profile.winding): 'ccw' [base, base+1, base+2, base, base+2, base+3];
   *  'legacy-cw' [base, base+3, base+2, base, base+2, base+1] */
  panelQuadIndices(base)
  /** switch (this.profile.panelNormal) { case 'facing': return {x: Math.sin(panel.rotY), y: 0, z: Math.cos(panel.rotY)};
   *  default: throw unsupportedStrategy('mesh.panelNormal', ...) }  (4698-4699; the OBJ profile, and the glTF profile since
   *  08 P2-2d, define panelNormal; it is the normalised 'ccw' face normal of panelCorners, 08 6.4) */
  panelFacingNormal(panel)
  /** 08 P2-2d: panelFacingNormal(panel) for each of the 4 corners, flattened: [x, y, z] x 4 (the glTF panel NORMAL) */
  panelNormals(panel)
  /** 08 5.2: Object.freeze([0, 0, 1, 0, 1, 1, 0, 1]), the panel UVs in the order BL, BR, TR, TL (the OBJ panel `vt` lines
   *  of 4696); for the glTF panel TEXCOORD_0 of 08 P2-7c */
  static PANEL_UVS
}
```
Every array is plain JS (float64). Viewport callers wrap them in `Float32BufferAttribute`; the glTF writer builds `Float32Array`s but computes min/max from the float64 values as legacy does (4766-4775).

#### `js/geometry/TextureAtlas.js`
```js
/** Single source of the LED atlas bookkeeping (replaces 4 cumulativeCol loops and 2 totals loops):
 *  totalLedX += s.panelCols * s.ledX; totalLedY = Math.max(totalLedY, s.panelRows * s.ledY)       (1586-1590 == 1681-1685)
 *  pxPerLed = Math.max(1, Math.min(4, Math.floor(4096 / Math.max(totalLedX, totalLedY))))        (1687)
 *  entries[i] = { section, sectionIndex,
 *     startCol,    // value of the running `cumulativeCol` BEFORE adding this section (0 for the first);
 *                  // accumulated with raw `+= section.panelCols` (string cols concatenate exactly like legacy)
 *     ledOffsetX,  // value of the running `xOffset` BEFORE this section; += section.panelCols * section.ledX   (1703)
 *     uvWidth,     // (section.panelCols * section.ledX) / totalLedX                                           (1596)
 *     uvOffsetX }  // running sum of previous uvWidth values (`uvOffsetX += uvWidth`)                         (1643)
 *  @returns {{totalLedX, totalLedY, pxPerLed, entries}} */
export function computeAtlas(sections)
/** Math.max(1, Math.min(4, Math.floor(4096 / Math.max(w, h))))  section canvas px/LED (2056) */
export function sectionPxPerLed(w, h)
/** LEGACY(B-M16): Math.max(4, Math.min(16, Math.floor(4096 / Math.max(ledX, ledY))))  panel canvas px/LED (2003) */
export function panelPxPerLed(ledX, ledY)
/** 08 6.3 (B-L4, 08 P2-1c): Object.freeze({ maxSide: 32767, maxArea: 268435456 }), the largest canvas every supported
 *  browser can create (Chrome draws up to 65,535 px per side; 07's CanvasProbe later probes device limits). */
export const CANVAS_HARD_LIMITS
/** w >= 1 && h >= 1 && w <= limits.maxSide && h <= limits.maxSide && w * h <= limits.maxArea (NaN and 0 do not fit). */
export function canvasFits(w, h, limits = CANVAS_HARD_LIMITS)
```

#### `js/geometry/PanelNaming.js`
```js
export function columnLabel(index)          // verbatim 1991-1999 (bijective base-26: 0 -> A, 26 -> AA)
export function panelLabel(globalCol, row)  // `${columnLabel(globalCol)}${row + 1}`
export function exportSectionName(i)        // `Wall_${i + 1}`
export function exportPanelName(i, row, col)  // `Wall_${i + 1}_Panel_R${row + 1}_C${col + 1}`
/** name.replace(/[^a-zA-Z0-9_-]/g, '_')   (4496). The parameter MUST stay named `name` (R1): a numeric imported
 *  section name throws `TypeError: name.replace is not a function`, which reaches the console baseline. */
export function sanitizeFilename(name)
/** LEGACY(B-L14): no de-duplication. switch (Strategies.zipTextureNaming) { case 'sanitized-name':
 *  return `${sanitizeFilename(section.name || `Wall_${i + 1}`)}_PanelIDs.png`;  (4511, 4540)
 *  default: throw unsupportedStrategy('zipTextureNaming', Strategies.zipTextureNaming) } */
export function zipTextureFileName(section, i)
/** LEGACY(B-M2): switch (Strategies.mtlTextureNaming) { case 'index': return `textures/Wall_${i + 1}_PanelIDs.png`; (4612)
 *  default: throw unsupportedStrategy('mtlTextureNaming', Strategies.mtlTextureNaming) }. Does not match zipTextureFileName. */
export function mtlTextureFile(i)
```


### 3.7 Render (THREE views and canvases)

All render modules import THREE via `import THREE from '../vendor/three.js'` (`../../vendor/three.js` under `textures/`). They receive `theme` parts by injection and never import `theme/`.

#### `js/render/ResourceTracker.js`
```js
/** Shared traverse-dispose used by every legacy dispose block. For each node: if (child.geometry) child.geometry.dispose();
 *  if (child.material): for each material (arrays handled): if (maps && m.map) m.map.dispose(); m.dispose().
 *  Geometry before material, map before material: the legacy order at every site. */
export function disposeObject3D(root, { maps = false } = {})

export class ResourceTracker {
  /** @param {{disposeMaps: boolean}} policy */
  constructor({ disposeMaps = false } = {})
  /** Remember a root Object3D (disposed via disposeObject3D(root, {maps: disposeMaps})) or a standalone
   *  Texture/BufferGeometry/Material (disposed via .dispose()). `detach` (optional) runs immediately before that
   *  entry is disposed, e.g. () => sceneManager.remove(root). @returns {resource} */
  track(resource, { detach } = {})
  /** For each entry in tracking order: entry.detach?.(); dispose the entry. Then forget all entries. */
  dispose()
}
```
Policies: `LEDWallView` tracks only its two group roots with `disposeMaps: Strategies.dispose.wallTextures` (true since Phase 1C H1, the B-H5 fix: the old wall's material maps, i.e. the panel-ID `CanvasTexture`s and the LED tile clones, are disposed; each map belongs to exactly one material, and the tile cache masters are never placed on a material, so they are never disposed here), using one tracker per rebuild: `rebuild()` step 2 creates it (this is where the key is read) and step 1 of the next rebuild disposes it; `SafeDistanceView` uses `disposeObject3D(group, { maps: true })` (legacy 2770); `CameraRigView` and `PropViews` use `maps: false`; `TransformGizmo` disposes its replaced or removed group (geometries and materials, no maps) iff `Strategies.dispose.gizmo` (true since Phase 1C H2, the B-L12 fix). `ResourceTracker.js` itself carries no tag. Both `dispose.*` keys are used as values (section 1.5), not switched on. Feature 5 (HDR/PMREM) and the Phase 1C flips use the same class.

#### `js/render/SceneManager.js`
```js
export const LAYERS = Object.freeze({ DEFAULT: 0, HELPERS: 1 });   // Feature 1/5 seam; NOT applied in Phase 1 (R6)

export class SceneManager {
  /** deps only (R4): no THREE allocation in the constructor.
   *  @param {{canvas: HTMLCanvasElement, win: Window, display: DisplaySettings, theme: {scene: SceneTheme}}} deps */
  constructor({ canvas, win, display, theme })

  /** Legacy init body 1427-1449, same statement order:
   *  container = canvas.parentElement; scene = new THREE.Scene(); scene.background = new THREE.Color(theme.scene.background);
   *  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000); camera.position.set(0, 0, 8);
   *  renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setSize(container.clientWidth, container.clientHeight);
   *  renderer.setPixelRatio(Math.min(win.devicePixelRatio, 2));
   *  scene.add(new THREE.AmbientLight(0xffffff, 0.3)); pointLight = new THREE.PointLight(0xffffff, 0.8); pointLight.position.set(5, 5, 10);
   *  scene.add(pointLight); grid = new THREE.GridHelper(50, 50, 0x2a2a3a, 0x1a1a24); grid.position.set(12.5, 0, 12.5);
   *  this.addHelper(grid); this.addHelper(new THREE.AxesHelper(0.5))   (values from theme.scene) */
  init()

  get scene(); get camera(); get renderer(); get canvas(); get grid(); get axes()   // valid after init()
  /** scene.add / scene.remove for content objects (wall, frames, props). */
  add(object3D)
  remove(object3D)
  /** scene.add / scene.remove plus membership in #helpers (grid, axes, camera rig, safe-distance group, gizmo).
   *  LEGACY(B-M11): no layer is assigned in Phase 1, so the preview still renders helpers. */
  addHelper(object3D)
  removeHelper(object3D)
  get helpers()                     // ReadonlySet<Object3D>  (Feature 1/5 seam)
  /** showGrid = !showGrid; if (grid) grid.visible = showGrid  (2578-2583). Mutates display.showGrid. */
  toggleGrid()
  /** win.addEventListener('resize', () => this.onResize())  (1453) */
  attachResize()
  /** Verbatim 3877-3882 (container = renderer.domElement.parentElement). */
  onResize()
  /** Legacy animate 3884-3890: const frame = () => { win.requestAnimationFrame(frame); tick(); }; frame();
   *  The first frame runs synchronously, before setupUI, exactly like legacy. */
  startLoop(tick)
  /** renderer.render(scene, camera) */
  render()
}
```
State: `#scene`, `#camera`, `#renderer`, `#grid`, `#axes`, `#helpers: Set`. The main camera is shared by reference with `OrbitController`, `PilotCameraDriver`, `PilotController` and `PointerRay` (they read `sceneManager.camera` at use time).

#### `js/render/LEDWallView.js`
```js
export class LEDWallView {
  /** @param {{sceneManager: SceneManager, materials: LEDMaterialFactory, builder: WallMeshBuilder (viewport profile),
   *           theme: {scene: SceneTheme}}} deps */
  constructor({ sceneManager, materials, builder, theme })
  get wallGroup(); get frameGroup()     // legacy ledWallGroup / frameGroup

  /** Legacy createLEDWall body minus layout and tail (1458-1477, 1551-1572), in this order:
   *  1. #tracker.dispose() (the previous rebuild's tracker, if any): for the previous wall group then the previous frame
   *     group: sceneManager.remove(group)
   *     then disposeObject3D(group, {maps: Strategies.dispose.wallTextures}) (true since Phase 1C H1, the B-H5 fix:
   *     maps are disposed too); apart from the maps this is exactly legacy remove-wall, dispose-wall, remove-frames,
   *     dispose-frames (1458-1474).
   *  2. wallGroup = new THREE.Group(); frameGroup = new THREE.Group();
   *     #tracker = new ResourceTracker({ disposeMaps: Strategies.dispose.wallTextures });
   *     #tracker.track(wallGroup, {detach: () => sceneManager.remove(wallGroup)}); the same for frameGroup
   *  3. sections = layout.sections.map(sl => sl.section); atlas = computeAtlas(sections)   (pure, no THREE ids);
   *     materials.beginRebuild()   (08 P2-1d: the panel-ID fallback warning is given once per section and rebuild)
   *     meshMode === 'combined' -> #buildCombined; === 'section' -> #buildSections;
   *     ELSE -> #buildPanels   LEGACY(B-L8): any unknown imported mode renders as panels   (1551-1557)
   *  4. if (display.showFrame) #buildFrames(layout)                                         (1559-1569)
   *  5. sceneManager.add(wallGroup); if (display.showFrame) sceneManager.add(frameGroup)    (1571-1572)
   *  @param {{layout: WallLayout, meshMode: string, display: DisplaySettings}} args */
  rebuild({ layout, meshMode, display })

  /** Feature seams (non-observable in Phase 1): */
  meshes()          // Mesh[] children of wallGroup, in add order
  sectionNodes()    // Map<String(sectionId), {sectionId, sectionIndex, meshes: Mesh[], indexRange: {indexStart, indexCount} | null}>
                    // built from the mesh userData tags; with duplicate or coerced-equal ids (B-L8: 7 and '7') the first
                    // section with a key owns the node (its sectionIndex, indexRange) and later duplicates append meshes
}
```
Builders (private, allocation order = legacy statement order, R5):
- `#buildCombined(layout, sections, atlas)` (1579-1678; `sections` is the array step 3 already mapped): `g = builder.combinedGrid(layout, atlas)`; `geometry = new THREE.BufferGeometry()`; `setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3))`, then `'normal'` (3), `'uv'` (2), `setIndex(indexAttribute(g.indices))`; colours: per section `const color = new THREE.Color(section.color)` and for `row <= panelRows`, `col <= panelCols` push `color.r, color.g, color.b`; `setAttribute('color', ...)`; `material = materials.combined(sections, atlas)`; `mesh = new THREE.Mesh(geometry, material)`; `mesh.userData = { kind: 'led-wall', mode: 'combined', sectionRanges: g.sectionRanges }`; `wallGroup.add(mesh)`.
- `#buildSections(layout, atlas)` (1710-1774): per `sl` (index `i`): `grid = builder.sectionGrid(sl, { uv: 'unit' })`; `new THREE.BufferGeometry()` + position/normal/uv attributes + `setIndex(indexAttribute(grid.indices))`; `material = materials.section(sl.section, sl.sectionIndex, atlas.entries[i].startCol)`; mesh; `userData = { kind: 'led-wall', mode: 'section', sectionId: sl.sectionId, sectionIndex: i }`; add.
- `#buildPanels(layout, atlas)` (1776-1802): per `sl`, per `panel` of `sl.panels`: `geometry = new THREE.PlaneGeometry(sl.panelW, sl.panelH)`; `material = materials.panel(sl.section, sl.sectionIndex, atlas.entries[i].startCol + panel.col, panel.row)` (raw `+`, B-L8); mesh; `position.set(panel.x, panel.y, panel.z)`; `rotation.y = panel.rotY`; `userData = { kind: 'led-wall', mode: 'panel', sectionId, sectionIndex, col: panel.col, row: panel.row }`; add.
- `#buildFrames(layout)` (1560-1568): per panel: `new THREE.EdgesGeometry(new THREE.BoxGeometry(sl.panelW, sl.panelH, 0.02))`, `new THREE.LineSegments(frameGeometry, new THREE.LineBasicMaterial({ color: theme.scene.frame }))`, position, `rotation.y`, `frameGroup.add`. (The inner BoxGeometry is not tracked, as legacy never disposed it.)

`userData` tags are non-observable (the wall is never raycast in Phase 1).

`indexAttribute(indices)` (module-private, 08 P2-1e; the viewport side of B-L5, 08 6.2): `indexWidth(maxIndexOf(indices)) === 'uint32' ? new THREE.Uint32BufferAttribute(indices, 1) : indices`. Below a largest index of 65,535 the plain array is passed as before, and r128's `setIndex` stores it as Uint16 (no output changes); r128 alone switches to Uint32 only above 65,535, so a combined mesh of exactly 65,536 vertices would have stored the primitive-restart value 65,535 in a Uint16 index and lost a triangle. Panel mode uses `PlaneGeometry` (4 vertices) and is unaffected.

#### `js/render/LEDMaterialFactory.js`
```js
export class LEDMaterialFactory {   // the ONLY constructor of wall materials (legacy triads 1664-1675, 1759-1769, 1783-1793)
  /** @param {{display: DisplaySettings, panelIds: PanelIdRenderer, ledTiles: LEDPixelTextureFactory, win: Window}} deps
   *  win: console for the 08 P2-1d warning */
  constructor({ display, panelIds, ledTiles, win })
  /** Called by LEDWallView.rebuild (step 3): the fallback warning below may be given again, once per section. (08 P2-1d) */
  beginRebuild()
  /** panelIds on: canvas = panelIds.atlasCanvas(sections, atlas); texture = new THREE.CanvasTexture(canvas);
   *               texture.needsUpdate = true; MeshBasicMaterial({ map: texture, side, wireframe })
   *  else ledSim: MeshBasicMaterial({ map: ledTiles.tiled(atlas.totalLedX, atlas.totalLedY, color), side, wireframe }) with
   *               color from switch (Strategies.combinedLedSimColor) { case 'white': color = new THREE.Color("white"); break;
   *               default: throw unsupportedStrategy('combinedLedSimColor', ...) } evaluated in the third-argument position
   *               (after atlas.totalLedY, as legacy evaluated the argument list). A switch cannot be an argument, so the
   *               switch sits in a local closure inside combined()'s LED-sim branch, called as the third argument.
   *               LEGACY(B-L18) white; LEGACY(B-M5) repeat over totalLedY
   *  else:        MeshBasicMaterial({ vertexColors: true, side, wireframe }) */
  combined(sections, atlas)
  /** panelIds: panelIds.sectionCanvas(section, sectionIndex, null, startCol) -> CanvasTexture (+needsUpdate) -> material;
   *  ledSim: ledTiles.tiled(section.panelCols * section.ledX, section.panelRows * section.ledY, section.color);
   *  else: { color: new THREE.Color(section.color), side, wireframe } */
  section(section, sectionIndex, startCol)
  /** panelIds: canvas = panelIds.panelCanvas(globalCol, row, section.ledX, section.ledY, section) -> CanvasTexture (+needsUpdate);
   *  ledSim: ledTiles.tiled(section.ledX, section.ledY, section.color); else colour (as section()) */
  panel(section, sectionIndex, globalCol, row)

  /** private: the `side` of every wall material. DoubleSide is a design choice since 08 P2-2a (B-H1 fixed: the strips
   *  are wound counter-clockwise toward the stage; the orbit can go behind the wall), so the method has no tag.
   *  switch (Strategies.mesh.viewport.side) { case 'double': return THREE.DoubleSide;
   *    default: throw unsupportedStrategy('mesh.viewport.side', Strategies.mesh.viewport.side) } */
  #side()
}
```
Precedence: `display.panelIdsEnabled` first, then `display.ledSimEnabled`, then colour (the colour branch creates its `THREE.Color` here, after the geometry: PR6). **Panel-ID fallback (08 P2-1d, B-L4, 08 6.3):** when `atlasCanvas` / `sectionCanvas` / `panelCanvas` returns `null` (the canvas would exceed `CANVAS_HARD_LIMITS`), the mesh gets its colour material instead (combined: `{ vertexColors: true, side, wireframe }`; section and panel: `#colorMaterial(section)`), and `` win.console.warn(`Panel IDs are not shown for "${name}": its ${w}×${h} px texture exceeds this browser's canvas limit.`) `` is called at most once per section (combined: once for the atlas, `name` = the section names joined with ", ") between two `beginRebuild()` calls, with the size from `panelIds.atlasSize/sectionSize/panelSize`. `side`: `this.#side()` (a constant: no ids, cannot throw in Phase 1). `wireframe: display.wireframe`. The texture is always created before its material (legacy argument evaluation order).

#### `js/render/textures/LEDPixelTextureFactory.js`
```js
/** Verbatim 1411-1424: if (!proto.roundRect) proto.roundRect = function (x, y, w, h, r) {...}.
 *  Called once by main.js before anything else (legacy ran it at script top level). */
export function installCanvasPolyfills(proto = CanvasRenderingContext2D.prototype)

export class LEDPixelTextureFactory {
  /** @param {{doc: Document, display: DisplaySettings, theme: {canvas: CanvasTheme}}} deps */
  constructor({ doc, display, theme })
  /** Verbatim 1807-1856. Cache key `${color}-${display.ledLayout}` (a THREE.Color argument stringifies to
   *  "[object Object]"; latent, see B-L18). On a miss: new THREE.Color(color), 64x64 canvas, background
   *  theme.canvas.background, painter by layout (default 'single-dot'), new THREE.CanvasTexture(canvas) with
   *  RepeatWrapping x2, LinearFilter, LinearMipmapLinearFilter, needsUpdate; stored as master.
   *  Always returns master.clone(). LEGACY(B-L20): unbounded cache. */
  tile(color)
  /** tile(color) then texture.repeat.set(ledX, ledY)  (1980-1984) */
  tiled(ledX, ledY, color)
  /** Object.values(cache).forEach(t => t.dispose()); cache = {}  (1986-1989) */
  clearCache()
}
```
The five painters (`single-dot`, `rgb-triangle`, `rgb-stripe` (vertical), `rgb-horizontal`, `square`) are module-private functions moved verbatim from 1858-1978 (`drawRGBStripe(ctx, size, ledColor, vertical)` serves both stripe layouts).

#### `js/render/textures/PanelIdRenderer.js`
```js
export class PanelIdRenderer {   // pure 2D canvas; creates no THREE objects; shared by viewport, PNG and ZIP exports
  /** Reads style and logos at draw time, exactly like legacy reads its globals.
   *  @param {{doc: Document, style: PanelIdStyle, logos: LogoLibrary, theme: {canvas: CanvasTheme}}} deps */
  constructor({ doc, style, logos, theme })
  /** Verbatim 2002-2046 (panel mode). scale = panelPxPerLed(ledX, ledY) (LEGACY(B-M16)); border colour
   *  panelBorderColors[(col + row) % 3]; borderThickness = style.borderThickness * scale / 4; label
   *  `${columnLabel(col)}${(row + 1).toString()}`; fontSize = style.fontSize * scale / 4 || min(w, h) * 0.4 (=== 0 test);
   *  section name at fontSize * 0.25 when style.sectionLabelEnabled && section && section.name.
   *  LEGACY(B-L19): no logo, sectionLabelFontSize ignored.
   *  @returns {HTMLCanvasElement|null}  null, with no canvas created, when ledX * scale x ledY * scale does not satisfy
   *  canvasFits (08 P2-1d; ledX >= 8,192 never does, scale >= 4) */
  panelCanvas(col, row, ledX, ledY, section)
  /** Verbatim 2052-2187 (flipped rows, cumulative column labels from startCol, centred section name, logo via
   *  the private #drawLogo 2115-2184 with logos.get(section.id); LEGACY(B-L35): no zero-size guard, tagged in
   *  sectionCanvas at the #drawLogo call). sectionIndex is unused (kept for signature parity).
   *  @returns {HTMLCanvasElement|null}  null, with no canvas created, when the sectionSize(section, overrideScale) canvas
   *  does not satisfy canvasFits (08 P2-1d) */
  sectionCanvas(section, sectionIndex, overrideScale, startCol = 0)
  /** Verbatim 1680-1708 using the atlas: scale = atlas.pxPerLed; canvas totalLedX*scale x totalLedY*scale filled with
   *  the background; per section i: sectionCanvas(section, i, scale, atlas.entries[i].startCol) drawn at
   *  (atlas.entries[i].ledOffsetX * scale, (atlas.totalLedY - section.panelRows * section.ledY) * scale).
   *  @returns {HTMLCanvasElement|null}  null, with no canvas created, when the atlasSize canvas does not satisfy canvasFits
   *  (08 P2-1d); the section canvases of an atlas that fits always fit (they are drawn at the atlas scale) */
  atlasCanvas(sections, atlas = computeAtlas(sections))
  /** 08 P2-1c (B-L4, 08 6.3): the size each canvas above would get, by arithmetic only (no canvas is created), so the
   *  exports can test canvasFits before drawing:
   *  panelSize(section): scale = panelPxPerLed(section.ledX, section.ledY); {width: ledX * scale, height: ledY * scale}
   *  sectionSize(section, overrideScale): w = panelCols * ledX, h = panelRows * ledY, scale = overrideScale ||
   *    sectionPxPerLed(w, h); {width: w * scale, height: h * scale}
   *  atlasSize(sections, atlas = computeAtlas(sections)): {width: totalLedX * pxPerLed, height: totalLedY * pxPerLed} */
  panelSize(section)
  sectionSize(section, overrideScale)
  atlasSize(sections, atlas = computeAtlas(sections))
}
```

#### `js/render/CameraRigView.js`
```js
export class CameraRigView {
  /** @param {{sceneManager: SceneManager, bus: EventBus, theme: {scene: SceneTheme}}} deps */
  constructor({ sceneManager, bus, theme })
  get exists()       // !!group   (legacy previewCameraGroup truthiness)
  get group()
  get bodyMesh()     // legacy cameraBodyMesh: set by create(), NEVER nulled by remove() (legacy 2536-2548)
  /** Verbatim 2321-2344: if (group) { sceneManager.removeHelper(group); disposeObject3D(group) }; group = new THREE.Group();
   *  bodyGeom = new THREE.BoxGeometry(0.15, 0.1, 0.2); bodyMat = MeshBasicMaterial({color, transparent: true, opacity});
   *  bodyMesh = new THREE.Mesh(bodyGeom, bodyMat); bodyMesh.position.z = 0.15; group.add(bodyMesh);
   *  this.rebuildFrustum(cine)   (first build: emits CAMERA_LENS_CHANGED, the duplicate legacy write is kept);
   *  sceneManager.addHelper(group); this.updateTransform(cine) */
  create(cine)
  /** Verbatim 2346-2429 minus the dead wallIntersectionPlane branch:
   *  remove + dispose the previous lines and fill (if any); hFov = cine.hFov(); vFov = cine.vFov();
   *  bus.emit(CAMERA_LENS_CHANGED, { hFov, vFov, filmbackWidth: cine.filmbackWidth, filmbackHeight: cine.filmbackHeight })
   *    (exactly at the legacy readout point 2369-2371);
   *  frustumDepth = Strategies.frustumDepthM (15, LEGACY(B-L33)); nearPlane = 0.2; corners and the 24 line vertices in
   *  legacy push order; lines: BufferGeometry + Float32BufferAttribute + LineSegments(LineBasicMaterial{color, transparent, opacity 0.7});
   *  fill: BufferGeometry + BufferAttribute(Float32Array of the 30 vertices) + Mesh(MeshBasicMaterial{color, transparent,
   *  opacity 0.08, side: DoubleSide, depthWrite: false}); both added to group. */
  rebuildFrustum(cine)
  /** Verbatim 2431-2449: if (!group) return; position.set(posX, posY, posZ); rotation.order = 'YXZ';
   *  rotation.set(rotX * Math.PI / 180, rotY * Math.PI / 180, rotZ * Math.PI / 180) */
  updateTransform(cine)
  /** Verbatim 2536-2548: if (group) { sceneManager.removeHelper(group); disposeObject3D(group); group = lines = fill = null }.
   *  Does not touch the safe-distance group (B-M8, tagged at CameraController.setPreviewEnabled). bodyMesh keeps its
   *  stale reference. */
  remove()
  pickMeshes()       // [bodyMesh]
}
```

#### `js/render/SafeDistanceView.js`
```js
export class SafeDistanceView {
  /** @param {{sceneManager: SceneManager, doc: Document, theme: {scene: SceneTheme}}} deps */
  constructor({ sceneManager, doc, theme })
  get object3D()     // legacy safeDistanceMesh (group or null); read by the safe-distance OBJ export
  /** Verbatim 2586-2762 minus the walk and bounds copies:
   *  switch (Strategies.safeDistanceBand) { case 'per-column-own-normal': break;
   *    default: throw unsupportedStrategy('safeDistanceBand', Strategies.safeDistanceBand) }   (first statement)
   *  this.remove(); group = new THREE.Group();  D = cine.maxSafeDistance(bounds);  allEdges = layout.flatEdges();
   *  (layout and bounds arrive precomputed from CameraHub.syncSafeDistance: PR7)
   *  for i < allEdges.length - 1: per-column quad (wallLeft, wallRight, safeRight, safeLeft) offset along that column's
   *  own normal (-dz/len, dx/len) by D, y = 0.005; colours wallColor x2, thresholdColor x2; indices (v, v+1, v+2, v, v+2, v+3)
   *  LEGACY(B-M15, B-L29); safeLinePoints = [safeLeft of i = 0, then every safeRight].
   *  if (vertices.length > 0): mesh (BufferGeometry + position + color + setIndex + computeVertexNormals +
   *  MeshBasicMaterial{vertexColors, transparent, opacity 0.5, DoubleSide, depthWrite false}); line (LineBasicMaterial{color,
   *  transparent, opacity 0.8, linewidth 2} created BEFORE its BufferGeometry, y = 0.02); label sprite: 256x64 canvas,
   *  fillStyle labelColor, font labelFont, textAlign center, fillText(`Max: ${D.toFixed(2)}m`, 128, 40), CanvasTexture,
   *  SpriteMaterial({map, transparent: true}), Sprite at (labelPos.x, 0.5, labelPos.z) with labelPos =
   *  safeLinePoints[Math.floor(safeLinePoints.length / 2)], scale (2, 0.5, 1).
   *  ALWAYS sceneManager.addHelper(group), even when there are no edges (empty wall: [] edges, empty group, no throw).
   *  The legacy inner guard `if (!cameraPreviewEnabled) return` (2589) is unreachable (its only caller checks it) and dropped.
   *  @param {{layout: WallLayout, cine: CineCamera, bounds: {totalWidth, maxHeight}}} args */
  create({ layout, cine, bounds })
  /** Verbatim 2764-2776: if (group) { sceneManager.removeHelper(group); disposeObject3D(group, { maps: true }); group = null } */
  remove()
}
```
Note for id-based comparisons: three r128 Sprites share one module-level geometry, created by the first Sprite ever made; `remove()` disposes it through the label sprite (`maps: true` traversal), exactly as legacy 2767-2772 did. Any comparison of allocation ids must treat that geometry as shared.

#### `js/render/PreviewWindow.js`
```js
export class PreviewWindow {   // owns #camera-preview-window and its children (elements are injected by App)
  /** @param {{doc: Document, win: Window, cine: CineCamera,
   *           elements: {windowEl, canvas, resizeHandle, info, fov, res}}} deps
   *  (`windowEl` = #camera-preview-window; the key is not called `window`, see check rule 3) */
  constructor({ doc, win, cine, elements })
  get initialized()  // !!renderer   (legacy `if (!previewRenderer)`)
  get camera(); get renderer()
  /** elements.windowEl.style.display = on ? 'block' : 'none'  (4234) */
  setVisible(on)
  /** Verbatim 3634-3645: renderer = new THREE.WebGLRenderer({ canvas: elements.canvas, antialias: true });
   *  renderer.setSize(...Strategies.previewRendererSize) (LEGACY(B-M9): 320x180 outer size, also sets the canvas inline size);
   *  renderer.setPixelRatio(Math.min(win.devicePixelRatio, 2)); this.updateCamera(); this.#setupResize() */
  init()
  /** Verbatim 3702-3740: hFovDeg = cine.hFov() * 180 / Math.PI; vFovDeg = cine.vFov() * 180 / Math.PI (legacy association);
   *  aspect = cine.aspect(); create PerspectiveCamera(vFovDeg, aspect, 0.1, 100) on first call, else update fov/aspect +
   *  updateProjectionMatrix; position (posX, posY, posZ); rotation.order = 'YXZ'; rotation.set(tilt, pan, roll);
   *  info.textContent = `${cine.focalLength}mm • ${cine.presetShortName()}`; fov.textContent = `H: ${hFovDeg.toFixed(1)}° V: ${vFovDeg.toFixed(1)}°`;
   *  res.textContent = `${Math.round(1080 * aspect)}×1080` (as `const baseHeight = 1080; width = Math.round(baseHeight * aspect)`).
   *  LEGACY(B-L34) fake resolution, first-word preset name. */
  updateCamera()
  /** Verbatim 3742-3745: if (!cine.enabled || !renderer || !camera) return;
   *  switch (Strategies.previewRendersHelpers) { case true: renderer.render(scene, camera); break;
   *    default: throw unsupportedStrategy('previewRendersHelpers', Strategies.previewRendersHelpers) }
   *  LEGACY(B-M11): renders the whole scene including helpers (they stay on layer 0). */
  render(scene)
  /** private #setupResize(): verbatim 3647-3700 (handle mousedown with preventDefault + stopPropagation, doc mousemove and
   *  doc mouseup listeners added on the FIRST init only: init() calls it while the private #resize state, which it creates
   *  (the legacy closure state of 3650-3651), is null; body cursor; clamps 200-800 / 120-600 with the filmback aspect;
   *  LEGACY(B-L32) width recomputed from the clamped height without re-clamping; renderer.setSize(newWidth, newHeight)). */
}
```

#### `js/render/PropViews.js`
```js
export class PropView {
  /** @param {{sceneManager: SceneManager, theme: {scene: SceneTheme}}} deps
   *  The base reads only sceneManager (its state is #private, which subclasses cannot read); PersonPropView and
   *  CarPropView take the same deps object, call super(deps) and keep deps.theme.scene.person / .car themselves,
   *  so the call shape stays `new PersonPropView({ sceneManager, theme })` and buildMesh() stays parameterless. */
  constructor({ sceneManager, theme })
  get exists()       // !!root
  get object3D()     // root group or null (legacy personMesh / carMesh)
  /** if (root) { sceneManager.remove(root); disposeObject3D(root) }  (root is NOT nulled, 2831-2837 / 2906-2912);
   *  root = this.buildMesh(). Does NOT add to the scene. */
  create()
  /** sceneManager.add(root)  (2880 / 2971) */
  addToScene()
  /** Verbatim 2885-2887: root.position.set(prop.posX, 0, prop.posZ); root.rotation.y = prop.rotY * Math.PI / 180;
   *  root.scale.setScalar(prop.scale). Caller guarantees root exists. */
  updateTransform(prop)
  /** Verbatim 2894-2903: if (root) { sceneManager.remove(root); disposeObject3D(root); root = null } */
  remove()
  /** Meshes to raycast: root.traverse(child => child.isMesh && push), traversal order (3447-3452). */
  pickMeshes()
  /** abstract: returns a new THREE.Group built in legacy allocation order */
  buildMesh()
}
export class PersonPropView extends PropView { buildMesh() /* verbatim 2839-2877 */ }
export class CarPropView    extends PropView { buildMesh() /* verbatim 2914-2968, including carMesh.scale.setScalar(1) */ }
```


### 3.8 Interaction

#### `js/interaction/InputState.js`
```js
/** Shared, tiny interaction flags (breaks the orbit / gizmo / pilot cycles). Single writers:
 *  pilotMode <- PilotController.toggle only; isDraggingGizmo <- TransformGizmo only. */
export class InteractionState { pilotMode = false; isDraggingGizmo = false; }

export const isKeyStateIgnoredTarget = (t) => t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA';  // 3845
/** The shortcut guard is the one typing guard (08 P2-9b fixed B-L11): re-exported, never redefined (01 CR-9);
 *  the name isShortcutIgnoredTarget stays until 07 I1 deletes it (07 C18). */
export { isTypingTarget, isTypingTarget as isShortcutIgnoredTarget } from '../core/typingTarget.js';

export class KeyboardState {     // legacy keysPressed (3753)
  /** @param {{doc: Document, win: Window}} deps */
  constructor({ doc, win })
  isDown(code)                   // !!keys[code]
  /** Verbatim 3843-3854: doc keydown -> if (isKeyStateIgnoredTarget(e.target)) return; keys[e.code] = true;
   *  doc keyup -> keys[e.code] = false; win blur -> every known key = false. Registered in the init phase. */
  attach()
}

export class PointerRay {        // legacy shared `raycaster` + `mouse` (1368-1369): ONE instance shared by gizmo and picking
  /** @param {{sceneManager: SceneManager}} deps   (creates one THREE.Raycaster and one THREE.Vector2: no ids) */
  constructor({ sceneManager })
  get raycaster(); get ndc()
  /** canvas = sceneManager.renderer.domElement; rect = canvas.getBoundingClientRect();
   *  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
   *  raycaster.setFromCamera(ndc, sceneManager.camera); @returns the shared raycaster (replaces the 4 copies
   *  3198-3203, 3235-3240, 3312-3317, 3431-3436) */
  fromEvent(event)
}
```

#### `js/interaction/OrbitController.js`
```js
export class OrbitController {
  static MOVE_SPEED = 0.08;                                     // legacy moveSpeed (3754)
  /** @param {{sceneManager, keyboard: KeyboardState, interaction: InteractionState, frameBounds: () => {totalWidth, maxHeight}}} deps */
  constructor({ sceneManager, keyboard, interaction, frameBounds })
  angle = { theta: 0, phi: Math.PI / 2 };                       // legacy cameraAngle; REPLACED by a new object in setView/restore
  distance = 8;                                                 // legacy cameraDistance
  target;  offset;                                              // THREE.Vector3 (legacy targetPosition / targetOffset)
  /** Verbatim 3820-3840 on canvas = sceneManager.renderer.domElement, registered in this order: mousedown (ignored while
   *  interaction.isDraggingGizmo || interaction.pilotMode), mousemove (0.01 rad/px, phi clamped [0.1, PI - 0.1]),
   *  mouseup, mouseleave, wheel (if pilot: return; preventDefault; distance clamped [2, 30] by deltaY * 0.01).
   *  Then calls updateCameraPosition() where legacy did. Registered in the init phase (before ViewportInput). */
  attach()
  /** LEGACY(B-L2) via the injected frameBounds (framingBounds): b = frameBounds();
   *  target.set(b.totalWidth / 2 + offset.x, b.maxHeight / 2 + offset.y, offset.z)  (3756-3764) */
  updateTargetPosition()
  /** Verbatim 3857-3863: updateTargetPosition(); spherical placement of sceneManager.camera; camera.lookAt(target). */
  updateCameraPosition()
  /** Verbatim 3766-3817: if (interaction.pilotMode) return; forward/right from angle.theta; WASD/arrows/QE via
   *  keyboard.isDown(code); step MOVE_SPEED per frame (LEGACY(B-L27): no delta time); if moved updateCameraPosition(). */
  tickKeyboard()
  /** Verbatim 3865-3875 ('front' | 'side' | 'top' | anything else = reset: theta 0.3, phi PI / 2.5, distance 8, offset 0).
   *  LEGACY(B-L25): no pilot guard. */
  setView(view)
  snapshot()     // { angle: { ...angle }, distance, offset: offset.clone() }   (for pilot save, 3488-3494)
  restore(s)     // angle = { ...s.angle }; distance = s.distance; offset.copy(s.offset)   (3500-3502)
}
```

#### `js/interaction/SelectionManager.js`
```js
/** @typedef {object} Selectable   implemented by CameraController ('camera') and PropController ('person', 'car');
 *  Feature 2 adds WallSectionSelectable, Feature 3 a pivot Selectable, Feature 5 a projection-point Selectable.
 * @property {string} id                       'camera' | 'person' | 'car'
 * @property {string} label                    badge text: 'Camera' | 'Person' | 'Car' (legacy names map 3161)
 * @property {() => boolean} isPickable        legacy pick gating (3441, 3446, 3455)
 * @property {() => import('three').Object3D[]} pickMeshes   meshes to raycast, in legacy push order (3442-3461)
 * @property {() => boolean} hasGizmoTarget    legacy updateGizmoPosition gating (previewCameraGroup / personMesh / carMesh, 3126-3134)
 * @property {(out: import('three').Vector3) => import('three').Vector3} gizmoAnchor   sets and returns `out`
 * @property {(rotation: import('three').Euler) => void} orientGizmo   local-space orientation (3107-3118)
 * @property {(movement: import('three').Vector3) => void} applyGizmoTranslate   domain write + pose event + refresh
 * @property {(axis: 'x'|'y'|'z', deltaDeg: number) => void} applyGizmoRotate      deltaDeg already signed (Strategies.gizmoRotateSign)
 */
export class SelectionManager {
  /** @param {{bus, gizmo: TransformGizmo, pointerRay: PointerRay, interaction: InteractionState}} deps */
  constructor({ bus, gizmo, pointerRay, interaction })
  /** Registration order is the raycast tie order: App registers camera, person, car. */
  register(selectable)
  get selectedId()                 // legacy selectedObject: 'camera' | 'person' | 'car' | null
  get selected()                   // the registered Selectable or null
  isSelected(id)                   // selectedId === id
  find(id)
  /** 3139-3143: selectedId = id; selected = find(id); bus.emit(SELECTION_CHANGED, {id, label: selected?.label}); gizmo.attach(selected)
   *  (`?.`: an unregistered id, unreachable because pickAt only selects registered ids, shows the toolbar's 'Unknown'
   *  fallback like legacy `names[selectedObject] || 'Unknown'` instead of throwing) */
  select(id)
  /** 3145-3153: selectedId = null; selected = null; bus.emit(SELECTION_CHANGED, {id: null, label: null}); gizmo.detach() */
  deselect()
  /** Legacy handleViewportClick 3427-3474, LEGACY(B-M14) (called on mousedown):
   *  if (interaction.isDraggingGizmo || interaction.pilotMode) return; if (!gizmo.mode) return;
   *  raycaster = pointerRay.fromEvent(event); list = []; for each registered s with s.isPickable(): for each m of s.pickMeshes():
   *  { m.userData.selectType = s.id; list.push(m) }; hits = raycaster.intersectObjects(list, false);
   *  hit -> { const t = hits[0].object.userData.selectType; if (t && t !== selectedId) select(t) }  miss -> deselect() */
  pickAt(event)
}
```

#### `js/interaction/TransformGizmo.js`
```js
export class TransformGizmo {
  /** Subscribes to SELECTABLE_MOVED in the constructor: ({id}) => { if (target && target.id === id) this.updatePosition() }.
   *  The axis colours (handle materials and userData.color) and the idle / hover / dimmed opacities (0.35 / 1.0 / 0.15)
   *  quoted below are read from the injected theme.scene.gizmo (x, y, z, idleOpacity, hoverOpacity, dimmedOpacity).
   *  @param {{sceneManager, pointerRay: PointerRay, interaction: InteractionState, bus, theme: {scene: SceneTheme}}} deps */
  constructor({ sceneManager, pointerRay, interaction, bus, theme })
  get mode()          // 'translate' | 'rotate' | null   (legacy gizmoMode)
  get space()         // 'world' | 'local'               (legacy gizmoSpace)
  get group(); get target(); get activeAxis(); get hoveredAxis()
  /** target = selectable; rebuild()   (the createGizmo call inside selectObject, 3142) */
  attach(target)
  /** 3146-3152: target = null; hoveredAxis = null; if (group) { sceneManager.removeHelper(group);
   *  if (Strategies.dispose.gizmo) disposeObject3D(group) (true since Phase 1C H2, the B-L12 fix); group = null } */
  detach()
  /** 3169-3180: mode = (mode === requested) ? null : requested; bus.emit(GIZMO_MODE_CHANGED, {mode}); rebuild() */
  setMode(requested)
  /** Escape branch 4427-4430: mode = null; bus.emit(GIZMO_MODE_CHANGED, {mode: null}); rebuild() */
  clearMode()
  /** 3182-3193: space = space === 'world' ? 'local' : 'world'; bus.emit(GIZMO_SPACE_CHANGED, {space}); if (group) updateOrientation() */
  toggleSpace()
  /** Verbatim createGizmo 2997-3099: if (group) { sceneManager.removeHelper(group); [dispose per Strategies.dispose.gizmo]; group = null }
   *  if (!target || !mode) return; group = new THREE.Group(); group.renderOrder = 999; handles = {};
   *  translate arrows / rotate tori built in the exact legacy allocation order (material per axis via the private
   *  material(color) factory: MeshBasicMaterial{color, transparent: true, opacity: idleOpacity, depthTest: false, depthWrite: false});
   *  updateOrientation(); updatePosition(); sceneManager.addHelper(group).
   *  MUST NOT reset hoveredAxis (legacy keeps a stale hover across rebuilds). LEGACY(B-L22): every handle is built for props too.
   *  LEGACY(B-L26): pilot mode does not hide the gizmo. */
  rebuild()
  /** 3101-3120: if (!group || !target) return; group.rotation.set(0, 0, 0); if (space === 'local') target.orientGizmo(group.rotation) */
  updateOrientation()
  /** 3122-3137: if (!group || !target) return; if (!target.hasGizmoTarget()) return; group.position.copy(target.gizmoAnchor(new THREE.Vector3())).
   *  LEGACY(B-L23): position-only follow; orientation is not refreshed outside drags. */
  updatePosition()
  /** Verbatim 3195-3230: if (!group || interaction.isDraggingGizmo || interaction.pilotMode) return; ray via pointerRay.fromEvent;
   *  collect handle meshes (child.userData = {...handle.userData}); newHovered; if changed: opacity hover 1.0 / idle 0.35. */
  onHover(event)
  /** Verbatim 3232-3307: if (!group || !target || interaction.pilotMode) return false; ... on hit: activeAxis,
   *  interaction.isDraggingGizmo = true, opacities 1.0 / 0.15, drag plane (translate: camera-facing plane containing the axis,
   *  local axes via group.quaternion; rotate: plane normal = axis), raycaster.ray.intersectPlane(dragPlane, dragStart); return true.
   *  miss: return false. */
  onMouseDown(event)
  /** Verbatim 3309-3409: if (!interaction.isDraggingGizmo || !activeAxis || !group) return; ray; currentPoint (return if no hit);
   *  translate: movement = axisDir * (delta . axisDir) -> target.applyGizmoTranslate(movement);
   *  rotate: angle = atan2((startDir x currentDir) . dragPlane.normal, startDir . currentDir) * (180 / Math.PI);
   *          target.applyGizmoRotate(activeAxis, Strategies.gizmoRotateSign * angle)   LEGACY(B-M12);
   *          if (space === 'local') updateOrientation();
   *  then dragStart.copy(currentPoint); updatePosition(). */
  onMouseMove(event)
  /** Verbatim 3411-3425: interaction.isDraggingGizmo = false; activeAxis = null; if (group) opacities by hoveredAxis. */
  onMouseUp()
}
```
State: `#mode`, `#space = 'world'`, `#target`, `#group`, `#handles`, `#activeAxis`, `#hoveredAxis`, `#dragStart` (Vector3), `#dragPlane` (Plane). `interaction/` may import `render/ResourceTracker.js` (a leaf utility) for the Phase 1C disposal flip; it imports nothing else from `render/`.

#### `js/interaction/PilotController.js`
```js
export class PilotCameraDriver {       // drives the MAIN camera from the CineCamera; no dependency on the hub (breaks the cycle)
  /** @param {{sceneManager, cine: CineCamera, rig: CameraRigView, interaction: InteractionState}} deps */
  constructor({ sceneManager, cine, rig, interaction })
  /** Verbatim enterPilotView 3511-3530: if (!cine.enabled || !rig.exists) return; camera.position.set(posX, posY, posZ);
   *  lookDir (0,0,-1) rotated by tilt about X then pan about Y; camera.lookAt(position + lookDir); camera.rotateZ(rotZ * Math.PI / 180);
   *  camera.fov = cine.vFov() * (180 / Math.PI)  (keep this association: it differs from the preview's * 180 / Math.PI);
   *  camera.updateProjectionMatrix() */
  enterView()
  /** updatePilotView 3532-3536: if (interaction.pilotMode) enterView() */
  refresh()
}

export class PilotController {
  /** @param {{sceneManager, cine: CineCamera, driver: PilotCameraDriver, orbit: OrbitController, keyboard: KeyboardState,
   *           interaction: InteractionState, hub: CameraHub, bus, dialogs: {alert(msg: string): void}}} deps */
  constructor({ sceneManager, cine, driver, orbit, keyboard, interaction, hub, bus, dialogs })
  get active()                         // interaction.pilotMode
  moveSpeed = 0.05;                    // legacy pilotMoveSpeed
  /** 3477-3509: if (!cine.enabled) { dialogs.alert('Enable Camera Frustum Preview first to use Pilot Mode'); return }
   *    LEGACY(B-H4): the guard also blocks EXITING once the preview is off;
   *  interaction.pilotMode = !interaction.pilotMode; bus.emit(PILOT_CHANGED, {active});
   *  entering: saved = { position: camera.position.clone(), orbit: orbit.snapshot(), fov: camera.fov }; driver.enterView();
   *  leaving: if (saved) { camera.position.copy(saved.position); orbit.restore(saved.orbit); camera.fov = saved.fov;
   *           camera.updateProjectionMatrix(); orbit.updateCameraPosition() } looking = false.
   *  LEGACY(B-L26): the gizmo is left visible. */
  toggle()
  onMouseDown(event)   // 3538-3542: if (!active) return; looking = true; lastMouse = {x: clientX, y: clientY}
  /** 3544-3558: if (!active || !looking) return; deltas; lastMouse = {...}; cine.pilotLook(deltaX, deltaY);
   *  bus.emit(CAMERA_POSE_CHANGED, {source: 'pilot-look'}); if (cine.enabled) hub.refresh() */
  onMouseMove(event)
  onMouseUp()          // 3560-3562: looking = false
  onWheel(event)       // verbatim 3622-3631: if (!active) return; event.preventDefault(); speed x0.85 (min 0.01) / x1.15 (max 0.3)
  /** 3564-3620: if (!active) return; pan = rotY * Math.PI / 180; tilt = rotX * Math.PI / 180;
   *  forward = new THREE.Vector3(-Math.sin(pan) * Math.cos(tilt), Strategies.pilotForwardYSign * Math.sin(tilt),
   *                              -Math.cos(pan) * Math.cos(tilt)).normalize()   LEGACY(B-M13);
   *  right = new THREE.Vector3(Math.cos(pan), 0, -Math.sin(pan)).normalize();
   *  keys = {forward: W||ArrowUp, back: S||ArrowDown, left: A||ArrowLeft, right: D||ArrowRight, down: Q, up: E} from keyboard.isDown;
   *  moved = cine.pilotFly(keys, forward, right, moveSpeed)   (silent clamp: B-L10, tagged at CineCamera.pilotFly;
   *  LEGACY(B-L27) no dt);
   *  if (moved) { bus.emit(CAMERA_POSE_CHANGED, {source: 'pilot-move'}); if (cine.enabled) hub.refresh() } */
  tickKeyboard()
}
```

#### `js/interaction/ViewportInput.js`
```js
export class ViewportInput {
  /** @param {{doc, win, sceneManager, interaction, gizmo: TransformGizmo, selection: SelectionManager, pilot: PilotController}} deps */
  constructor({ doc, win, sceneManager, interaction, gizmo, selection, pilot })
  /** 4410-4434 (doc keydown, registered AFTER KeyboardState's), with the 08 P2-9b filters (B-L11 fixed, 08 6.11):
   *  if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;   (Shift is allowed)
   *  e.key.toLowerCase() 'g' -> gizmo.setMode('translate'); 'r' -> gizmo.setMode('rotate'); 'l' -> gizmo.toggleSpace();
   *  'p' -> pilot.toggle(); e.key === 'Escape' -> interaction.pilotMode ? pilot.toggle()
   *  : (selection.deselect(), gizmo.mode && gizmo.clearMode()).  isTypingTarget comes through InputState's re-export. */
  attachShortcuts()
  /** Verbatim 4437-4479 on canvas = sceneManager.renderer.domElement (registered AFTER the orbit listeners):
   *  mousedown: pilot ? pilot.onMouseDown(e) : (handled = gizmo.onMouseDown(e); if (!handled && gizmo.mode) selection.pickAt(e))
   *             LEGACY(B-M14): selection on mousedown, misses (orbit starts, right clicks) deselect;
   *  mousemove: pilot ? pilot.onMouseMove(e) : (interaction.isDraggingGizmo ? gizmo.onMouseMove(e) : gizmo.onHover(e));
   *  mouseup:   pilot ? pilot.onMouseUp() : gizmo.onMouseUp();
   *  win mouseup: gizmo.onMouseUp(); pilot.onMouseUp();
   *  wheel {passive: false}: if (pilot) pilot.onWheel(e).   ("pilot" = interaction.pilotMode) */
  attachPointer()
}
```

### 3.9 IO (pure)

Exporters receive `layout` (from `layoutProject`) and raw `sections`; they never read the scene. Colour parsing is injected as `colorToRgb(cssColor) -> {r, g, b}` (`App` passes `(s) => new THREE.Color(s)`; Node tests pass a hex parser equal to THREE r128 `setStyle` for `#rrggbb`).

#### `js/io/ProjectSerializer.js`
```js
export class ProjectSerializer {
  /** @param {{palette: {sectionColors: string[]}}} deps */
  constructor({ palette })
  /** Verbatim 4943-4963 ('file') and 4499-4519 ('zip'), written as two explicit object literals so key order is exact:
   *  { version: '1.0', sections: sections.map((s, i) => ({ name: s.name || `Wall ${i + 1}`, id: s.id,
   *      panel: { columns: s.panelCols, rows: s.panelRows, width_mm: s.panelWidth, height_mm: s.panelHeight },
   *      led_resolution: { x: s.ledX, y: s.ledY, pixel_pitch_mm: parseFloat((s.panelWidth / s.ledX).toFixed(2)) },
   *      curvature: { type: s.curveIntensity === 0 ? 'flat' : (s.curveIntensity > 0 ? 'concave' : 'convex'),
   *                   angle_degrees: s.curveIntensity,
   *                   angle_offset_degrees: s.angleOffset || 0 },          // 'file' only (LEGACY(B-M3)): the 'zip' branch is
   *                   // selected by switch (Strategies.zipJsonIncludesAngleOffset) { case false: <zip literal without the key>;
   *                   //   default: throw unsupportedStrategy('zipJsonIncludesAngleOffset', ...) }, read once per write()
   *      color: s.color,
   *      texture_file: `textures/${zipTextureFileName(s, i)}` })),           // 'zip' only
   *    mesh_mode: project.meshMode,
   *    totals: { sections: sections.length,
   *              total_panels: sections.reduce((sum, s) => sum + s.panelCols * s.panelRows, 0),
   *              total_pixels: sections.reduce((sum, s) => sum + s.panelCols * s.panelRows * s.ledX * s.ledY, 0) } }
   *  LEGACY(B-L31): v1 saves only sections, mesh_mode and totals.
   *  Any other variant throws RangeError('Unknown ProjectSerializer variant ...') (no legacy counterpart; App and
   *  ProjectIO pass only 'file' and 'zip').
   *  'zip' with `skipped` (08 P2-1c, B-L4): texture_file is null for a section whose skipped[i] is true (its texture is not
   *  in the ZIP); the path is computed first anyway, so a numeric name still throws. 08 P2-6 replaces skipped with null
   *  textureNames.
   *  @param {Project} project  @param {{variant?: 'file'|'zip', skipped?: boolean[]|null}} [options]  @returns {object} */
  write(project, { variant = 'file', skipped = null } = {})
  /** Verbatim 4975-4988. Phase 1 reads EVERY version as v1 (legacy ignores `version`); this is the version-dispatch seam.
   *  Evaluates `data.sections && Array.isArray(data.sections)` first, so `data === null` throws TypeError inside the
   *  caller's try (V-5 alert); returns null otherwise (V-6: silently ignored). Then, before the map:
   *  switch (Strategies.importValidation) { case 'none': break; default: throw unsupportedStrategy('importValidation', ...) }
   *  (the Phase 2 ProjectValidator becomes a new case here).
   *  sections = data.sections.map((s, i) => new WallSection({ id: s.id !== undefined ? s.id : i, name: s.name || `Wall ${i + 1}`,
   *    panelCols: s.panel?.columns || 5, panelRows: s.panel?.rows || 3, panelWidth: s.panel?.width_mm || 500,
   *    panelHeight: s.panel?.height_mm || 500, ledX: s.led_resolution?.x || 32, ledY: s.led_resolution?.y || 32,
   *    curveIntensity: s.curvature?.angle_degrees || 0, angleOffset: s.curvature?.angle_offset_degrees || 0,
   *    color: s.color || palette.sectionColors[i % palette.sectionColors.length] }))
   *  LEGACY(B-L8, B-M4): no validation, no escaping.
   *  @returns {{sections: WallSection[], meshMode: any} | null}  meshMode = data.mesh_mode (raw, may be undefined) */
  read(data)
}
```

#### `js/io/ObjExporter.js`
```js
export class ObjExporter {
  /** @param {{brand: Brand, colorToRgb, builder: WallMeshBuilder (Strategies.mesh.obj profile)}} deps
   *  profile = builder.profile (the injected Strategies.mesh.obj); this class reads profile.winding (the header line
   *  only), profile.stripNormals and profile.combinedUV; the builder reads profile.winding / normals / panelNormal. */
  constructor({ brand, colorToRgb, builder })
  /** Verbatim string assembly 4556-4717 (line order, separators and toFixed precision exactly as legacy):
   *  header: brand.objHeader + `# Mesh Mode: ${meshMode}\n` + #faceConventionLine() + brand.objGeneratorLine; mtl starts
   *  with brand.mtlHeader. private #faceConventionLine() (01 CR-3, 08 P2-2c): switch (profile.winding) { case 'ccw': return
   *  '# Faces: counter-clockwise front faces; vn point out of the LED surface (toward the stage)\n'; case 'legacy-cw':
   *  return ''; default: throw unsupportedStrategy('mesh.obj.winding', ...) }.
   *  Dispatch: 'combined' / 'section' / else panel (LEGACY(B-L8)).
   *  combined: FIRST the colour, LEGACY(B-L6): switch (Strategies.exportCombinedColor) { case 'first-section':
   *    color = colorToRgb(sections[0].color); break; default: throw unsupportedStrategy('exportCombinedColor', ...) }
   *    (throws TypeError on an empty wall, B-L8); then uv = switch (profile.combinedUV) { case 'per-section-overlap':
   *    'unit'; default: throw unsupportedStrategy('mesh.obj.combinedUV', ...) };
   *    mtl `newmtl LED_Wall_Combined\nKd r g b (toFixed(4))\nKa 0.1 0.1 0.1\nKs 0.5 0.5 0.5\nNs 100\nd 1.0\n\n`;
   *    obj `mtllib ${brand.files.mtl}\n\n`, `o LED_Wall_Combined\n`, `usemtl LED_Wall_Combined\n`;
   *    grids: builder.sectionGrid(sl, {indexBase: vertexOffset, uv}) per section with vertexOffset starting at 1
   *    (+= vertexAdvance); then ALL `v x y z` (toFixed(6)) lines of all sections, then ALL `vt u v` (toFixed(6))
   *    (LEGACY(B-M6) overlapping 0..1 per section), then {lines, normalIndex: n} = #stripNormalLines(grid.normals, 1) and
   *    its lines, then per 6 indices q: `f ${q0}/${q0}/${n(q0)} ${q1}/${q1}/${n(q1)} ${q2}/${q2}/${n(q2)}\n` + the same for q3..q5.
   *  private #stripNormalLines(normals, constantIndex): switch (profile.stripNormals) { case 'per-vertex' (08 P2-2c):
   *    {lines: one `vn ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}\n` per builder normal, normalIndex: v => v} (faces
   *    `f a/a/a`); case 'constant-z' (the Phase-1 case, kept for LegacyProfiles; B-H2): {lines: 'vn 0 0 1\n' (the legacy
   *    literal of 4589 and 4635), normalIndex: () => constantIndex}; default: throw unsupportedStrategy('mesh.obj.stripNormals', ...) }
   *  section: mtl per section `newmtl Wall_${i+1}` ... `d 1.0\n` + `map_Kd ${mtlTextureFile(i)}\n\n` (index-based path:
   *    B-M2, tagged at PanelNaming.mtlTextureFile), or `\n` instead of the map_Kd line when skipped[i] (the ZIP left that
   *    texture out, 08 P2-1c; Export OBJ passes no skipped);
   *    obj `mtllib ...\n\n`; per section: `o Wall_${i+1}\n usemtl Wall_${i+1}\n`, v lines, vt lines, the lines of
   *    #stripNormalLines(grid.normals, normalOffset), faces `f ${v}/${t}/${n} ...` with t === v (texCoordOffset equals
   *    vertexOffset at every section) and n = normalIndex(v): v for 'per-vertex', normalOffset (starts 1, +1 per section) for
   *    'constant-z'; then '\n'.
   *  panel: mtl per section without map_Kd (`d 1.0\n\n`); per panel (sections in order, panels row-major):
   *    `o ${exportPanelName(i, row, col)}\n usemtl Wall_${i+1}\n`, 4 v lines from builder.panelCorners (toFixed(6)),
   *    `vt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\n`, `vn ${n.x.toFixed(6)} 0 ${n.z.toFixed(6)}\n` from builder.panelFacingNormal,
   *    faces from builder.panelQuadIndices(vertexOffset) and (texCoordOffset) with /${normalOffset} ('ccw': v, v+1, v+2 / v, v+2, v+3);
   *    offsets += 4, normalOffset += 1; '\n'.
   *  @returns {{objContent: string, mtlContent: string}} */
  write({ sections, meshMode, layout, skipped = null })
  /** Verbatim 2792-2823: brand.safeDistanceObjHeader; group.traverse(child => child.isMesh && child.geometry): `v` lines from
   *  position.getX/Y/Z(i).toFixed(6), '\n', `f a b c` from index.getX + running vertexOffset (starts 1). Duck-typed: no THREE import. */
  writeSafeDistance(group)
}
```

#### `js/io/GltfExporter.js`
```js
export class GltfExporter {
  /** @param {{brand: Brand, colorToRgb, builder: WallMeshBuilder (Strategies.mesh.gltf profile),
   *           encodeBase64?: (bytes: Uint8Array) => string}} deps
   *  profile = builder.profile (the injected Strategies.mesh.gltf); #addMesh reads profile.attributes / indexType / doubleSided
   *  (#writePanels asks #attributeList() first whether NORMAL is written); the builder reads profile.winding / normals / panelNormal.
   *  encodeBase64 defaults to chunkedBase64 (08 P2-1a, B-H3; the Phase-1 `gltfBase64` switch and its spread encoder are retired) */
  constructor({ brand, colorToRgb, builder, encodeBase64 })
  /** Verbatim 4719-4909. gltf = { asset: {version: "2.0", generator: brand.gltfGenerator}, scene: 0, scenes: [{nodes: []}], nodes: [],
   *  meshes: [], accessors: [], bufferViews: [], buffers: [], materials: [] } (this key order).
   *  #addMesh(name, attrs = {positions, normals?}, primitives = [{indices, color, materialName?}]) (08 5.2, P2-2d), verbatim
   *  4737-4828 for the Phase-1 profile (one primitive, POSITION only). Its strategy reads come first, before any output:
   *  #attributeList() iterates profile.attributes and switches each element (case 'POSITION', case 'NORMAL'; default: throw
   *  unsupportedStrategy('mesh.gltf.attributes', profile.attributes)), 'POSITION' first, no repeats (04 5.5); #indexFormat(indices)
   *  per primitive: switch (profile.indexType) { case 'uint16': Uint16 (5123; the Phase-1 case, kept for LegacyProfiles);
   *  case 'auto' (08 P2-1b): indexWidth(maxIndexOf(indices)) === 'uint32' ? Uint32Array, 5125 : Uint16Array, 5123; default:
   *  throw }; #doubleSided(): switch (profile.doubleSided) { case 'omit': false (no doubleSided key: single-sided, correct
   *  with the 'ccw' winding, 08 Q2); case 'true' (08 P2-2d, unused): true; default: throw }; and NORMAL needs one normal per
   *  position (else unsupportedStrategy('mesh.gltf.normals', profile.normals)). Then: per primitive a material {name:
   *  materialName ?? name + "_Material", pbrMetallicRoughness: {baseColorFactor: [r, g, b, 1.0], metallicFactor: 0.0,
   *  roughnessFactor: 0.8}} (+ doubleSided: true for 'true'); per attribute in list order a Float32Array view (target 34962)
   *  + 4-byte padding and a VEC3 5126 accessor: POSITION with min/max from the float64 positions, NORMAL without min/max;
   *  per primitive the index array chosen above (B-L5 fixed in 08 P2-1b) view (target 34963) + padding and its accessor;
   *  mesh {name, primitives: [{attributes: {POSITION, NORMAL}, indices, material}]} (no TEXCOORD_0 until 08 P2-7c,
   *  LEGACY(B-M7)); node {name, mesh}; scenes[0].nodes.push.
   *  combined: per section builder.sectionGrid(sl, {indexBase: indexOffset (starts 0), uv: null}) appended to allVertices /
   *    allNormals / allIndices with loops; AFTER the loop the colour, LEGACY(B-L6): switch (Strategies.exportCombinedColor) {
   *    case 'first-section': color = colorToRgb(sections[0].color); break; default: throw unsupportedStrategy(...) };
   *    addMesh('LED_Wall_Combined', ...).
   *  section: per section grid with indexBase 0 (positions, normals); color = colorToRgb(section.color) after the indices;
   *    addMesh(exportSectionName(i), ...).
   *  panel: per section color first; per panel: vertices = the 4 builder.panelCorners flattened (x, y, z); normals =
   *    builder.panelNormals(panel) when the attributes list NORMAL; indices = builder.panelQuadIndices(0) ('ccw': [0, 1, 2, 0, 2, 3]);
   *    addMesh(exportPanelName(i, row, col), ...).
   *  Buffer: concatenate, then uri = 'data:application/octet-stream;base64,' + encodeBase64(combinedBuffer)
   *  (default chunkedBase64: any size). @returns {object} gltf */
  write({ sections, meshMode, layout })
}

/** 08 6.1 (B-H3 fixed in 08 P2-1a): parts = String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)) per 32,768-byte
 *  chunk, then ONE btoa(parts.join('')) (no mid-stream padding). Equal to the legacy btoa(String.fromCharCode(...bytes))
 *  wherever that worked (byte-identical glTF below ~125 KB). Exported only for its unit test. */
export function chunkedBase64(bytes)
```

### 3.10 App (use cases and ordered pipelines)

App controllers never import or call `ui/`. They mutate the domain, call render/interaction collaborators in legacy order, and emit mirror events at the legacy DOM-write points.

#### `js/app/WallController.js`
The module header contains the rebuild-policy table of section 6.2 (it is the only module that decides wall rebuilds besides the bootstrap).
```js
export class WallController {
  /** @param {{project: Project, view: LEDWallView, ledTiles: LEDPixelTextureFactory, orbit: OrbitController,
   *           hub: CameraHub, bus: EventBus, palette: {sectionColors: string[]}}} deps */
  constructor({ project, view, ledTiles, orbit, hub, bus, palette })
  layout()                       // layoutProject(project)  (fresh, from live sections)
  /** P1 (section 6.1): legacy createLEDWall. */
  rebuild()
  /** bus.emit(WALL_STATS_CHANGED, project.wall.totals())  (legacy updateStats call sites 1574, 4073) */
  publishStats()
  /** P-ADD (section 6.4). */
  addSection()
  /** P-DEL (section 6.4). No-op when project.wall.count <= 1. */
  deleteSection(id)
  /** section.setField(field, raw) (model only). @returns the stored value */
  setSectionField(section, field, raw)
  /** publishStats(); rebuild()  (4073-4074: the stats-first duplicate is kept; it is observable when rebuild throws) */
  commitSectionEdit()
  /** section.setColor(color); rebuild()  (4000, 4010) */
  setSectionColor(section, color)
  /** section.rename(raw, index) (model only). @returns the stored name */
  renameSection(section, raw, index)
  /** if (project.display.panelIdsEnabled) { bus.emit(WALL_SECTION_RENAMED, {}); rebuild() }  (4019-4022) */
  commitRename()
  /** project.meshMode = mode; bus.emit(WALL_MESH_MODE_CHANGED, {mode}); rebuild()  (4160-4161).
   *  Called twice per label click (LEGACY(B-L13), DOM-inherent); never de-duplicate. */
  setMeshMode(mode)
  setWireframe(on)               // display.wireframe = on; rebuild()   (4165)
  setShowFrame(on)               // display.showFrame = on; rebuild()   (4166)
  /** forcedOff = display.setLedSim(on); bus.emit(DISPLAY_CONTENT_CHANGED, {toggled: 'ledSim', on, forcedOff});
   *  ledTiles.clearCache(); rebuild()   (4168-4178) */
  setLedSim(on)
  /** display.ledLayout = layout; ledTiles.clearCache(); if (display.ledSimEnabled) rebuild()   (4181-4183) */
  setLedLayout(layout)
  /** forcedOff = display.setPanelIds(on); bus.emit(DISPLAY_CONTENT_CHANGED, {toggled: 'panelIds', on, forcedOff});
   *  rebuild()   (4188-4198; the logo list re-renders inside the emit when `on`) */
  setPanelIds(on)
  /** project.panelIdStyle.set(key, rawOrValue) (model only). @returns the stored value */
  setPanelIdStyle(key, rawOrValue)
  /** if (project.display.panelIdsEnabled) rebuild()  (style inputs 4203-4226 and logo handlers 2272-2303) */
  rebuildIfPanelIds()
  /** P-IMPORT tail (section 6.10): wall.replaceAll(sections); if (meshMode) { project.meshMode = meshMode;
   *  bus.emit(WALL_MESH_MODE_CHANGED, {mode: meshMode}) } bus.emit(WALL_SECTIONS_CHANGED, {reason: 'import'}); rebuild().
   *  LEGACY(B-L21): logos are neither reset nor re-rendered. */
  applyImport({ sections, meshMode })
}
```

#### `js/app/CameraController.js`
```js
export class CameraHub {               // legacy updateCameraFrustum + updateSafeDistance
  /** @param {{project, rig: CameraRigView, preview: PreviewWindow, safeDistance: SafeDistanceView,
   *           pilotDriver: PilotCameraDriver, frameBounds, bus}} deps */
  constructor({ project, rig, preview, safeDistance, pilotDriver, frameBounds, bus })
  /** P2 (section 6.3). */
  refresh()
  /** 2778-2784: if (display.showSafeDistance && cine.enabled) safeDistance.create({layout: layoutProject(project), cine,
   *  bounds: frameBounds()}) else safeDistance.remove(). The layout and bounds are argument expressions, so they are
   *  evaluated before create() removes the old group and allocates the new one (legacy: after; PR7).
   *  LEGACY(B-L30): runs on every pose change via refresh(). */
  syncSafeDistance()
}

export class CameraController {        // use cases + Selectable 'camera'
  /** @param {{project, rig: CameraRigView, preview: PreviewWindow, hub: CameraHub, pilot: PilotController,
   *           selection: SelectionManager, frameBounds, bus}} deps */
  constructor({ project, rig, preview, hub, pilot, selection, frameBounds, bus })
  /** P-PREVIEW (section 6.5). */
  setPreviewEnabled(on)
  /** 2550-2575: cine.resetTo(frameBounds()); bus.emit(CAMERA_POSE_CHANGED, {source: 'reset'}); hub.refresh() */
  resetPose()
  /** 4251-4264: cine.applyPreset(key); bus.emit(CAMERA_FILMBACK_CHANGED, {key}); if (cine.enabled) hub.refresh() */
  setFilmback(key)
  /** cine.setField(field, raw) (model only). @returns the stored value */
  setCameraField(field, raw)
  /** if (cine.enabled) hub.refresh()  (the `if (cameraPreviewEnabled) updateCameraFrustum()` tail of 4266-4317) */
  commitCameraField()
  /** 4322-4327: display.showSafeDistance = on; bus.emit(CAMERA_SAFE_DISTANCE_TOGGLED, {enabled: on}); hub.syncSafeDistance() */
  setSafeDistanceEnabled(on)
  // Selectable 'camera'
  id = 'camera'; label = 'Camera';
  isPickable()            // cine.enabled && !!rig.bodyMesh   (3441)
  pickMeshes()            // rig.pickMeshes()
  hasGizmoTarget()        // rig.exists                       (3126)
  gizmoAnchor(out)        // out.set(cine.posX, cine.posY, cine.posZ)
  orientGizmo(rotation)   // rotation.order = 'YXZ'; rotation.set(rotX * Math.PI / 180, rotY * Math.PI / 180, rotZ * Math.PI / 180)
  /** 3337-3346: cine.translateBy(m.x, m.y, m.z); bus.emit(CAMERA_POSE_CHANGED, {source: 'gizmo-translate'}); if (cine.enabled) hub.refresh() */
  applyGizmoTranslate(movement)
  /** 3375-3387: cine.rotateBy(axis, deltaDeg); bus.emit(CAMERA_POSE_CHANGED, {source: 'gizmo-rotate', axis}); if (cine.enabled) hub.refresh() */
  applyGizmoRotate(axis, deltaDeg)
}
```

#### `js/app/PropController.js`
```js
export class PropController {          // one instance per prop; Selectable prop.kind
  /** @param {{prop: Prop, view: PropView, selection: SelectionManager, bus}} deps */
  constructor({ prop, view, selection, bus })
  get id()                // prop.kind
  get label()             // prop.label
  /** 4332-4342 / 4363-4373 after the toggle class flip: prop.visible = on; bus.emit(PROP_VISIBILITY_CHANGED, {id, visible: on});
   *  on: view.create(); this.applyTransform(); view.addToScene()   (legacy create -> update*Transform (incl. gizmo follow) -> scene.add)
   *  off: view.remove(); if (selection.isSelected(id)) selection.deselect() */
  setVisible(on)
  /** prop.setField(field, raw) (model only). @returns the stored value */
  setField(field, raw)
  /** 2883-2892 / 2974-2983: if (!view.exists) return; view.updateTransform(prop); bus.emit(SELECTABLE_MOVED, {id}) */
  applyTransform()
  // Selectable
  isPickable()            // prop.visible && view.exists   (3446, 3455)
  pickMeshes()            // view.pickMeshes()
  hasGizmoTarget()        // view.exists
  gizmoAnchor(out)        // out.set(prop.posX, prop.gizmoAnchorY, prop.posZ)
  orientGizmo(rotation)   // rotation.y = prop.rotY * Math.PI / 180
  /** 3347-3360: prop.translateBy(m.x, m.y, m.z); bus.emit(PROP_POSE_CHANGED, {id, source: 'gizmo-translate'}); applyTransform() */
  applyGizmoTranslate(movement)
  /** 3388-3399: if (prop.rotateBy(axis, deltaDeg)) { bus.emit(PROP_POSE_CHANGED, {id, source: 'gizmo-rotate'}); applyTransform() } */
  applyGizmoRotate(axis, deltaDeg)
}
```

#### `js/app/ProjectIO.js`
```js
export class Downloader {              // the single anchor sequence (5082-5091 == 4547-4553 == 4932-4938)
  /** @param {{doc: Document, win: Window}} deps */
  constructor({ doc, win })
  /** a = doc.createElement('a'); href = URL.createObjectURL(blob); a.href = href; a.download = filename; doc.body.appendChild(a);
   *  a.click(); doc.body.removeChild(a); win.setTimeout(() => URL.revokeObjectURL(href), 0)   (URL looked up at call time;
   *  the revoke is deferred since 08 P2-1a, legacy revoked synchronously, 8.4) */
  saveBlob(blob, filename)
  /** saveBlob(new Blob([content], {type: mimeType}), filename) */
  saveText(content, filename, mimeType)
}

export class ProjectIO {
  /** @param {{project, wallController: WallController, serializer: ProjectSerializer, objExporter: ObjExporter,
   *           gltfExporter: GltfExporter, panelIds: PanelIdRenderer, safeDistance: SafeDistanceView, downloader: Downloader,
   *           JSZip, dialogs, brand: Brand, win: Window}} deps */
  constructor({ project, wallController, serializer, objExporter, gltfExporter, panelIds, safeDistance, downloader, JSZip, dialogs, brand, win })
  /** 08 P2-1a (B-H3), 08 3.3 M-EXP-1: every export body below runs as #runExport(label, fn), label = 'Export JSON' |
   *  'Export OBJ' | 'Export glTF' | 'Export Panel IDs' | 'Export All (ZIP)' | 'Export Safe Distance OBJ'. A synchronous throw
   *  or a rejection of the promise fn returns is caught: dialogs.alert(`${label} failed: ${err.message}. No file was
   *  downloaded.`), then win.console.warn(err) (a non-Error is reported through String(err)). The returned promise of an
   *  async export never rejects. Errors of the MTL timer of exportOBJ are not covered. (R13 amendment, 1.6.) */
  #runExport(label, fn)
  /** 4942-4965: downloader.saveText(JSON.stringify(serializer.write(project, {variant: 'file'}), null, 2), brand.files.json, 'application/json') */
  exportJSON()
  /** 4911-4917: layout = wallController.layout(); {objContent, mtlContent} = objExporter.write({sections, meshMode, layout});
   *  saveText(objContent, brand.files.obj, 'text/plain'); win.setTimeout(() => saveText(mtlContent, brand.files.mtl, 'text/plain'),
   *  Strategies.mtlDownloadDelayMs)   LEGACY(B-L7) */
  exportOBJ()
  /** 4919-4924: saveText(JSON.stringify(gltfExporter.write({...}), null, 2), brand.files.gltf, 'application/json') */
  exportGLTF()
  /** 4926-4940 (stays async), with the 08 6.3 size guard (B-L4 fixed in 08 P2-1c): atlas = computeAtlas(sections);
   *  {width, height} = panelIds.atlasSize(sections, atlas); if (!canvasFits(width, height)) { dialogs.alert(M-EXP-2); return }
   *  canvas = panelIds.atlasCanvas(sections, atlas); blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
   *  if (blob === null) { dialogs.alert(M-EXP-3); return }  downloader.saveBlob(blob, brand.files.panelIdsPng).
   *  M-EXP-2/3 are the exact 08 3.3 texts (CANVAS_HARD_LIMITS: 32767 px per side, Math.round(maxArea / 1e6) = 268 MP). */
  async exportPanelIds()
  /** 4491-4554, same order, with the 08 6.3 size guard (B-L4 fixed in 08 P2-1c): zip = new JSZip();
   *  1. skipped[i] = !canvasFits(panelIds.sectionSize(sections[i], null))  (pure arithmetic, before anything is written);
   *  2. zip.file(brand.files.json, JSON.stringify(serializer.write(project, {variant: 'zip', skipped}), null, 2));
   *     layout = wallController.layout(); OBJ + MTL files (objExporter.write({..., skipped})); glTF file;
   *  3. folder = zip.folder('textures'); atlas = computeAtlas(sections); for i not skipped: canvas = panelIds.sectionCanvas(
   *     sections[i], i, null, atlas.entries[i].startCol); dataUrl = canvas.toDataURL('image/png'); `data:,` (a device limit
   *     below the hard limit) -> late.push(i); else folder.file(zipTextureFileName(sections[i], i), base64, {base64: true})
   *     (LEGACY(B-L14): same names overwrite);
   *  4. if late: skipped[i] = true for each, then the JSON and MTL entries are written again (JSZip keeps their position);
   *  content = await zip.generateAsync({type: 'blob'}); downloader.saveBlob(content, brand.files.zip);
   *  5. if any skipped: dialogs.alert(M-EXP-4) with every left-out entry name `textures/${zipTextureFileName(s, i)}`.
   *  Before 08 P2-7f the ZIP holds no atlas, so only section textures are guarded. The body is the private #writeZip(),
   *  run by #runExport (08 P2-1a: a failure is the M-EXP-1 alert instead of an unhandled rejection). */
  async exportZIP()
  /** 2786-2827: group = safeDistance.object3D; if (!group) { dialogs.alert('Enable Safe Distance 3D visualization first'); return }
   *  text = objExporter.writeSafeDistance(group); blob = new Blob([text], {type: 'text/plain'});
   *  downloader.saveBlob(blob, brand.files.safeDistanceObj)   (B-M1 fixed in 08 P2-5a: legacy called the undefined
   *  `downloadBlob` and threw a ReferenceError; the band keeps its legacy per-column geometry until 08 P2-5b) */
  exportSafeDistanceOBJ()
  /** P-IMPORT (section 6.10), legacy importJSON 4967-5010. The parameter keeps the legacy name `e`, because the
   *  FileReader onload callback inside it names its own argument `event` (legacy importJSON(e) / reader.onload = (event) => ...). */
  importFromInputEvent(e)
}
```


### 3.11 UI (DOM panels)

Every panel follows the same shape:
- `constructor(deps)`: stores collaborators, looks up its own elements by id/selector (no mutation), and subscribes to its mirror events (so the subscriptions exist before the bootstrap rebuild).
- `bind()` (or a more specific `bind*()`): adds DOM listeners. `App.start()` calls it at the legacy `setupUI` position (section 7).
- Handlers call controllers (down). Event handlers only mirror (R3).
- Each DOM id is owned by exactly one module (the static check enforces it). `App.js` additionally looks up `#three-canvas` (for `SceneManager`) and exactly these six ids for `PreviewWindow`: `#camera-preview-window`, `#camera-preview-canvas`, `#camera-preview-resize`, `#camera-preview-info`, `#camera-preview-fov`, `#camera-preview-res`. (`#camera-preview-options` belongs to `CameraPanel`.)

#### `js/ui/dom.js`
```js
export const byId = (doc, id) => doc.getElementById(id);
/** The legacy toggle idiom: el.classList.toggle('active'); return el.classList.contains('active'); */
export function flipToggle(el)
/** el.style.display = visible ? 'block' : 'none' */
export function setDisplay(el, visible)
/** @returns {{alert(msg: string): void}} calling win.alert(msg) at call time */
export function createDialogs(win)
```

#### `js/ui/HeaderStats.js`
```js
export class HeaderStats {
  /** Subscribes WALL_STATS_CHANGED -> update(payload). Owns #total-pixels, #total-panels, #total-sections, #total-arc. */
  constructor({ doc, bus })
  /** 2314-2317: totalPixels.toLocaleString(); totalPanels; totalSections; `${totalArc.toFixed(1)}°` (textContent). */
  update({ totalPixels, totalPanels, totalSections, totalArc })
}
```

#### `js/ui/SectionListPanel.js`
```js
export class SectionListPanel {
  /** Owns #wall-sections, #add-section-btn and every card element. Subscribes WALL_SECTIONS_CHANGED (see below).
   *  @param {{doc, project: Project, wallController: WallController, bus}} deps */
  constructor({ doc, project, wallController, bus })
  /** #add-section-btn click -> wallController.addSection()  (4154) */
  bindAddButton()
  /** Verbatim renderWallSections 3893-4078: container.innerHTML = ''; renderedSections = wall.sections.slice();
   *  for each (section, index): section.ensureName(index); warning block template (verbatim 3909-3916, multi-line, ONLY in render);
   *  card = div.className 'wall-section collapsed'; card.innerHTML = verbatim template 3920-3980 with EVERY interpolation of a
   *  section value passed through legacyHtml() (LEGACY(B-M4)): name (title and input value), colour (dot style and colour input),
   *  id, the numeric field values (imported strings are not coerced, B-L8), summary (it contains the raw panelCols /
   *  panelRows) and hint; the six swatches stay literal; the 4K warning's canvasWidth / canvasHeight are products of two
   *  fields, always numbers, and stay unwrapped;
   *  the delete button only when wall.count > 1; summary = section.summary; hint = section.curveHint;
   *  title ⚠ when section.exceeds4K; append; then the card listeners in legacy order:
   *   1. .section-header click: if (!e.target.closest('.section-delete')) card.classList.toggle('collapsed')
   *   2. .section-delete click: e.stopPropagation(); wallController.deleteSection(section.id)
   *   3. each .color-swatch-small click: e.stopPropagation(); remove 'active' from all swatches; add to this one;
   *      color = swatch.dataset.color; dot style.background = color; custom input value = color; wallController.setSectionColor(section, color)
   *   4. .color-input-custom input: e.stopPropagation(); remove 'active' from all swatches; dot style.background = e.target.value;
   *      wallController.setSectionColor(section, e.target.value)
   *   5. .section-name-input input: e.stopPropagation(); name = wallController.renameSection(section, e.target.value, index);
   *      title.innerHTML = legacyHtml(name) + (card.querySelector('.warning-indicator') ? ' <span class="warning-indicator">⚠</span>' : '');
   *      wallController.commitRename()
   *   6. .section-name-input click: e.stopPropagation()
   *   7. each input[type="number"] change: field = e.target.dataset.field;
   *      value = wallController.setSectionField(section, field, e.target.value); e.target.value = value;
   *      #patchCard(card, section, field); wallController.commitSectionEdit()
   *      and click: e.stopPropagation() */
  render()
  /** 4150-4152 / 5000-5001: first `.wall-section` in the document -> remove 'collapsed' */
  expandFirst()
}
```
Private:
- `#patchCard(card, section, field)`: verbatim 4040-4071 (no `value` parameter: the hint comes from `section.curveHint`, which equals the legacy local `value` after `setField`). Curve hint (first `.curve-hint` of the card) from `section.curveHint` when `field === 'curveIntensity'`; summary from `section.summary`; 4K warning: insert the **single-line** warning `innerHTML` (verbatim 4061, distinct from the render template) before the first child of `.section-content`, add the title ⚠ through `titleEl.innerHTML.replace(/Wall \d+/, '$& <span class="warning-indicator">⚠</span>')` only if the title has none (LEGACY(B-L16)); remove the warning and the ⚠ when no longer exceeding; update the span text when it still exceeds.
- `#onSectionsChanged({ reason, addedId })` (WALL_SECTIONS_CHANGED subscriber):
  - `reason === 'import'`: `render(); expandFirst();` (4998-5001).
  - `reason === 'add'` / `'delete'`: `states = #snapshotCollapsed(); render(); #restoreCollapsed(states, reason === 'add', addedId)`.
- `#snapshotCollapsed()`: verbatim 4083-4086 with the rendered list: `doc.querySelectorAll('.wall-section').forEach((el, idx) => states[renderedSections[idx].id] = el.classList.contains('collapsed'))`, where `renderedSections` is the copy taken by the previous `render()` (see PR2).
- `#restoreCollapsed(states, expandNew, addedId)`: verbatim 4109-4116 / 4138-4143 over `doc.querySelectorAll('.wall-section')` with `section = project.wall.sections[idx]`: when `expandNew && section.id === addedId` remove `'collapsed'` (strict equality: a NaN id never matches, exactly like legacy); otherwise `if (states[section.id] !== undefined) el.classList.toggle('collapsed', states[section.id])`.

#### `js/ui/SectionLogosPanel.js`
```js
export class SectionLogosPanel {
  /** Owns #section-logos-container. Subscribes:
   *   WALL_SECTIONS_CHANGED: if (reason !== 'import' && project.display.panelIdsEnabled) render()   (4106, 4135; LEGACY(B-L21) for import)
   *   WALL_SECTION_RENAMED: render()                                                              (4020; the controller already gated it)
   *   DISPLAY_CONTENT_CHANGED: if (toggled === 'panelIds' && on) render()                          (4197)
   *  @param {{doc, project: Project, wallController: WallController, bus}} deps */
  constructor({ doc, project, wallController, bus })
  /** Verbatim renderSectionLogosUI 2189-2254: if (!container) return; innerHTML = ''; per section: hasLogo = logos.hasImage(section.id);
   *  logoData = logos.get(section.id) || { position: 'center', scale: 0.3 }; div.style.cssText verbatim; template verbatim with
   *  legacyHtml(section.name || 'Wall ' + (index + 1)) (LEGACY(B-M4)) and every raw section.id interpolation
   *  (the seven data-section-id attributes; imported ids can be arbitrary strings) also through legacyHtml; computed
   *  numbers (the scale percentage) and the conditional class / 'selected' strings stay unwrapped; append; then listeners: file inputs change -> #onUpload,
   *  .section-logo-clear click -> #onClear, select[data-field="position"] change -> #onPosition, input[data-field="scale"] change -> #onScale. */
  render()
}
```
Private handlers (verbatim 2256-2305), ids parsed with `parseInt(dataset.sectionId)`:
- `#onUpload(e)`: `file = e.target.files[0]; if (!file) return; sectionId = parseInt(e.target.dataset.sectionId); reader = new FileReader(); reader.onload = (event) => { img = new Image(); img.onload = () => { logos.setImage(sectionId, img); this.render(); wallController.rebuildIfPanelIds(); }; img.src = event.target.result; }; reader.readAsDataURL(file);` LEGACY(B-L35): no `onerror`.
- `#onClear(e)`: `sectionId = parseInt(e.currentTarget.dataset.sectionId); logos.remove(sectionId); this.render(); wallController.rebuildIfPanelIds();`
- `#onPosition(e)`: `if (logos.setPosition(parseInt(e.target.dataset.sectionId), e.target.value)) wallController.rebuildIfPanelIds();`
- `#onScale(e)`: `pct = LogoLibrary.parseScalePercent(e.target.value); e.target.value = pct; if (logos.setScale(parseInt(...), pct / 100)) wallController.rebuildIfPanelIds();`

#### `js/ui/WallDisplayPanel.js`
```js
export class WallDisplayPanel {
  /** Owns .mesh-mode-option labels, #toggle-wireframe, #toggle-frame, #toggle-led-sim, #led-sim-options, #led-layout,
   *  #toggle-panel-ids, #panel-id-options, #panel-border-thickness, #panel-font-size, #panel-font-color,
   *  #toggle-section-labels, #section-label-size, #section-label-color.
   *  Subscribes WALL_MESH_MODE_CHANGED: options.forEach(o => o.classList.toggle('active', o.dataset.mode === mode))  (4993-4995;
   *  the radio `checked` state is NOT touched, V-2) and DISPLAY_CONTENT_CHANGED (below).
   *  @param {{doc, wallController: WallController, bus}} deps */
  constructor({ doc, wallController, bus })
  /** Registers 4156-4227 in legacy order:
   *  - each .mesh-mode-option LABEL click: remove 'active' from all, add to this one, wallController.setMeshMode(opt.dataset.mode).
   *    LEGACY(B-L13): stays a label click listener (fires twice per click). Do NOT switch to the radio 'change' event: after an
   *    import the radio `checked` state is stale and a click on the stale-checked option must still switch modes.
   *  - #toggle-wireframe: wallController.setWireframe(flipToggle(el)); #toggle-frame: setShowFrame(flipToggle(el))
   *  - #toggle-led-sim: wallController.setLedSim(flipToggle(el)); #led-layout change: wallController.setLedLayout(this.value)
   *  - #toggle-panel-ids: wallController.setPanelIds(flipToggle(el))
   *  - #panel-border-thickness / #panel-font-size / #section-label-size change:
   *      v = wallController.setPanelIdStyle(key, el.value); el.value = v; wallController.rebuildIfPanelIds()
   *  - #panel-font-color / #section-label-color input: wallController.setPanelIdStyle(key, el.value); rebuildIfPanelIds()
   *  - #toggle-section-labels: wallController.setPanelIdStyle('sectionLabelEnabled', flipToggle(el)); rebuildIfPanelIds() */
  bind()
}
```
`DISPLAY_CONTENT_CHANGED({ toggled, on, forcedOff })` mirror: `toggled === 'ledSim'`: `#led-sim-options` display = on ? block : none; if `forcedOff`: remove `active` from `#toggle-panel-ids` and hide `#panel-id-options` (4170-4176). `toggled === 'panelIds'`: `#panel-id-options` display; if `forcedOff`: remove `active` from `#toggle-led-sim` and hide `#led-sim-options` (4190-4196).

#### `js/ui/CameraPanel.js`
```js
export class CameraPanel {
  /** Owns every id of the "Camera Frustum Preview" section except the preview window itself (#toggle-camera-preview,
   *  #camera-preview-options, #camera-filmback, #custom-filmback, #filmback-width, #filmback-height, #camera-focal-length,
   *  #camera-hfov, #camera-vfov, #camera-aspect, #camera-pos-x/y/z, #camera-rot-x/y/z, #frustum-width, #frustum-height,
   *  #frustum-status-text, #safe-distance, #toggle-safe-distance, #reset-camera, #export-safe-distance).
   *  Subscribes: CAMERA_PREVIEW_CHANGED, CAMERA_FILMBACK_CHANGED, CAMERA_LENS_CHANGED, CAMERA_COVERAGE_CHANGED,
   *  CAMERA_POSE_CHANGED, CAMERA_SAFE_DISTANCE_TOGGLED (formats below).
   *  @param {{doc, project: Project, cameraController: CameraController, projectIO: ProjectIO, bus, theme: {ui: UiColors}}} deps */
  constructor({ doc, project, cameraController, projectIO, bus, theme })
  /** Registers 4230-4329 in legacy order:
   *  #toggle-camera-preview click -> cameraController.setPreviewEnabled(flipToggle(el));
   *  #camera-filmback change -> cameraController.setFilmback(this.value);
   *  #filmback-width, #filmback-height, #camera-focal-length, #camera-pos-x, #camera-pos-y, #camera-pos-z, #camera-rot-x,
   *  #camera-rot-y, #camera-rot-z change -> v = cameraController.setCameraField(field, el.value);
   *     if (CineCamera.FIELD_RULES[field].writeBack) el.value = v; cameraController.commitCameraField();
   *  #reset-camera click -> cameraController.resetPose();
   *  #toggle-safe-distance click -> cameraController.setSafeDistanceEnabled(flipToggle(el));
   *  #export-safe-distance click -> projectIO.exportSafeDistanceOBJ() */
  bind()
}
```
Mirror formats (verbatim legacy strings; `cine = project.camera` read at event time):
- `CAMERA_PREVIEW_CHANGED({enabled})`: `#camera-preview-options` display (4233).
- `CAMERA_FILMBACK_CHANGED({key})`: `#custom-filmback` display = `key === 'custom'`; if not custom: `#filmback-width.value = cine.filmbackWidth; #filmback-height.value = cine.filmbackHeight` (4254-4262).
- `CAMERA_LENS_CHANGED({hFov, vFov, filmbackWidth, filmbackHeight})`: `#camera-hfov` = `` `${(hFov * 180 / Math.PI).toFixed(1)}°` ``, `#camera-vfov` likewise, `#camera-aspect` = `` `${(filmbackWidth / filmbackHeight).toFixed(2)}:1` `` (2369-2371).
- `CAMERA_COVERAGE_CHANGED({frameWidth, frameHeight, status, safeDistance})`: `#frustum-width` = `` `${frameWidth.toFixed(2)}m` ``, `#frustum-height` likewise; `#frustum-status-text`: `within` -> 'Within bounds' + `statusEl.style.color = theme.ui.status.within`; `offCenter` -> 'Off-center' + `theme.ui.status.offCenter`; `exceeds` -> 'Exceeds wall' + `theme.ui.status.exceeds` (textContent then colour, as 2516-2524; `statusEl.style.color` is a DOM style write, which check rule 10 does not count); `#safe-distance` = `` `≤ ${safeDistance.toFixed(2)}m` `` (2484-2533).
- `CAMERA_POSE_CHANGED({source, axis})` (input `.value` writes):
  - `'reset'`: pos-x `cine.posX.toFixed(1)`, pos-y `cine.posY.toFixed(1)`, pos-z `cine.posZ`, rot-x/y/z raw values (2567-2572);
  - `'gizmo-translate'`: pos-x/y/z `toFixed(2)` (3342-3344);
  - `'gizmo-rotate'`: only `#camera-rot-${axis}` `toFixed(1)` (axis 'x', 'y', else 'z'; 3378/3381/3384);
  - `'pilot-look'`: rot-x then rot-y `toFixed(1)` (3554-3555);
  - `'pilot-move'`: pos-x/y/z `toFixed(2)` (3614-3616).
- `CAMERA_SAFE_DISTANCE_TOGGLED({enabled})`: `#export-safe-distance` display (4325).

#### `js/ui/PropsPanel.js`
```js
export class PropControls {            // new PropControls({doc, prefix: 'person', ...}) and ({..., prefix: 'car', ...})
  /** Owns #toggle-<prefix>, #<prefix>-options, #<prefix>-pos-x, #<prefix>-pos-z, #<prefix>-rot-y, #<prefix>-scale.
   *  Subscribes PROP_VISIBILITY_CHANGED and PROP_POSE_CHANGED, ignoring payloads whose id !== prefix:
   *   visibility: #<prefix>-options display (4335 / 4366);
   *   pose 'gizmo-translate': pos-x, pos-z = toFixed(2) (3351-3352 / 3358-3359); 'gizmo-rotate': rot-y = toFixed(1) (3391 / 3397).
   *  @param {{doc, prefix: 'person'|'car', controller: PropController, prop: Prop, bus}} deps */
  constructor({ doc, prefix, controller, prop, bus })
  /** 4332-4361 / 4363-4392: toggle click -> controller.setVisible(flipToggle(el));
   *  pos-x, pos-z, rot-y, scale change -> v = controller.setField(field, el.value); if (Prop.FIELD_RULES[field].writeBack) el.value = v;
   *  controller.applyTransform() */
  bind()
}
```

#### `js/ui/ViewportToolbar.js`
```js
export class ViewportToolbar {
  /** Owns #view-front/side/top/reset, #toggle-grid, #gizmo-translate, #gizmo-rotate, #gizmo-space, #gizmo-pilot,
   *  #selection-indicator, #pilot-info. Subscribes:
   *   SELECTION_CHANGED({id, label}): id ? (add 'visible'; .selected-name = label || 'Unknown') : (remove 'visible'; 'None')  (3155-3167)
   *   GIZMO_MODE_CHANGED({mode}): #gizmo-translate.classList.toggle('active', mode === 'translate'); #gizmo-rotate likewise (3176-3177, 4428-4429)
   *   GIZMO_SPACE_CHANGED({space}): text 'W' | 'L'; toggle 'world' / 'local'; title 'World Space (L to toggle)' | 'Local Space (L to toggle)' (3184-3188)
   *   PILOT_CHANGED({active}): #gizmo-pilot toggle 'active'; #pilot-info toggle 'visible' (3484-3485)
   *  @param {{doc, orbit: OrbitController, sceneManager: SceneManager, gizmo: TransformGizmo, pilot: PilotController, bus}} deps */
  constructor({ doc, orbit, sceneManager, gizmo, pilot, bus })
  /** 4394-4407: view buttons -> orbit.setView('front'|'side'|'top'|'reset'); #toggle-grid -> classList.toggle('active') then
   *  sceneManager.toggleGrid() (the button class and display.showGrid are independent, as legacy); #gizmo-translate ->
   *  gizmo.setMode('translate'); #gizmo-rotate -> gizmo.setMode('rotate'); #gizmo-space -> gizmo.toggleSpace(); #gizmo-pilot -> pilot.toggle() */
  bind()
}
```

#### `js/ui/ExportPanel.js`
```js
export class ExportPanel {
  /** Owns #export-zip, #export-panel-ids, #export-json, #export-obj, #export-gltf, #import-json, #import-input.
   *  @param {{doc, projectIO: ProjectIO}} deps */
  constructor({ doc, projectIO })
  /** 4482-4488 in order: export-zip -> projectIO.exportZIP(); export-panel-ids -> exportPanelIds(); export-json -> exportJSON();
   *  export-obj -> exportOBJ(); export-gltf -> exportGLTF(); #import-json click -> #import-input.click();
   *  #import-input change -> projectIO.importFromInputEvent(e). Listeners return the promise of async exports (an unhandled
   *  rejection stays unhandled, as legacy). */
  bind()
}
```

### 3.12 Composition root and entry

#### `js/main.js`
```js
import { installCanvasPolyfills } from './render/textures/LEDPixelTextureFactory.js';
import { App } from './app/App.js';
installCanvasPolyfills();                      // legacy top-level polyfill (1411-1424) ran before init()
new App({ doc: document, win: window }).start();
```

#### `js/app/App.js`
```js
export class App {
  /** @param {{doc: Document, win: Window}} deps */
  constructor({ doc, win })
  /** Runs section 7 exactly: construct (no side effects except bus subscriptions), then the legacy init() phase,
   *  the legacy setupUI() phase and setView('reset'). Nothing is attached to window. */
  start()
}
```
`App` is the only module that imports `theme/Theme.js`, `vendor/jszip.js` and every class. It defines `colorToRgb = (s) => new THREE.Color(s)` and `frameBounds = () => framingBounds(project)`, and the frame tick `() => { orbit.tickKeyboard(); pilot.tickKeyboard(); sceneManager.render(); preview.render(sceneManager.scene); }` (legacy animate 3886-3889).


---

## 4. State model: where every legacy global lives

Writers listed here are the only allowed writers (checked by `tests/static/check.mjs`). "DOM" means the state stays in the DOM, as in legacy.

| Legacy global (line) | New owner and member | Writers |
|---|---|---|
| `scene` (1278) | `SceneManager.scene` | `SceneManager.init` |
| `camera` (1278) | `SceneManager.camera` (shared by reference) | `SceneManager.init/onResize`, `OrbitController.updateCameraPosition`, `PilotCameraDriver.enterView`, `PilotController.toggle` (restore) |
| `renderer` (1278) | `SceneManager.renderer` | `SceneManager.init` |
| `ledWallGroup` (1278) | `LEDWallView.wallGroup` | `LEDWallView.rebuild` |
| `frameGroup` (1278) | `LEDWallView.frameGroup` | `LEDWallView.rebuild` |
| `showFrame` (1279) | `Project.display.showFrame` | `WallController.setShowFrame` |
| `wireframeEnabled` (1280) | `Project.display.wireframe` | `WallController.setWireframe` |
| `ledSimEnabled` (1281) | `Project.display.content === 'ledSim'` (getter `ledSimEnabled`) | `DisplaySettings.setLedSim/setPanelIds` (via `WallController`) |
| `ledLayout` (1282) | `Project.display.ledLayout` | `WallController.setLedLayout` |
| `meshMode` (1283) | `Project.meshMode` | `WallController.setMeshMode/applyImport` |
| `gridHelper` (1286) | `SceneManager.grid` | `SceneManager.init` |
| `showGrid` (1287) | `Project.display.showGrid` | `SceneManager.toggleGrid` |
| `safeDistanceEnabled` (1290) | `Project.display.showSafeDistance` | `CameraController.setSafeDistanceEnabled` |
| `safeDistanceMesh` (1291) | `SafeDistanceView.object3D` | `SafeDistanceView.create/remove` |
| `panelIdsEnabled` (1294) | `Project.display.content === 'panelIds'` (getter `panelIdsEnabled`) | `DisplaySettings.setPanelIds/setLedSim` (via `WallController`) |
| `panelBorderThickness` (1295) | `Project.panelIdStyle.borderThickness` | `PanelIdStyle.set` (via `WallController.setPanelIdStyle`) |
| `panelFontSize` (1296) | `Project.panelIdStyle.fontSize` | same |
| `cameraPreviewEnabled` (1299) | `Project.camera.enabled` | `CameraController.setPreviewEnabled` |
| `previewCameraGroup` (1300) | `CameraRigView.group` (`exists`) | `CameraRigView.create/remove` |
| `frustumHelper` (1301) | `CameraRigView` private `#lines` | `CameraRigView.rebuildFrustum/remove` |
| `frustumOutline` (1302) | `CameraRigView` private `#fill` (it is the fill mesh) | same |
| `wallIntersectionPlane` (1303) | **dropped (dead)**: never created, only nulled (2546) and null-checked (2358-2362) | - |
| `filmbackPresets` (1306) | `domain/CineCamera.js FILMBACK_PRESETS` (frozen) | - |
| `cameraSettings` (1320) | `Project.camera` (`CineCamera`, same field names) | `CineCamera` methods only (`setField`, `applyPreset`, `resetTo`, `translateBy`, `rotateBy`, `pilotLook`, `pilotFly`), called by `CameraController` and `PilotController` |
| `personMesh` (1334) | `PersonPropView.object3D` | `PropView.create/remove` |
| `carMesh` (1335) | `CarPropView.object3D` | same |
| `showPerson` (1336) | `Project.person.visible` | `PropController.setVisible` |
| `showCar` (1337) | `Project.car.visible` | same |
| `personSettings` (1339) | `Project.person` (`PersonProp`: posX, posZ, rotY, scale) | `Prop` methods (`setField`, `translateBy`, `rotateBy`) via `PropController` |
| `carSettings` (1346) | `Project.car` (`CarProp`) | same |
| `previewCamera` (1354) | `PreviewWindow.camera` | `PreviewWindow.updateCamera` |
| `previewRenderer` (1355) | `PreviewWindow.renderer` (`initialized`); never disposed, as legacy | `PreviewWindow.init` |
| `gizmoMode` (1358) | `TransformGizmo.mode` | `TransformGizmo.setMode/clearMode` |
| `gizmoSpace` (1359) | `TransformGizmo.space` | `TransformGizmo.toggleSpace` |
| `selectedObject` (1360) | `SelectionManager.selectedId` (the Selectable is `selected`; the gizmo holds the same object as `target`) | `SelectionManager.select/deselect` |
| `gizmoGroup` (1361) | `TransformGizmo.group` | `TransformGizmo.rebuild/detach` |
| `gizmoHandles` (1362) | `TransformGizmo` private `#handles` | `TransformGizmo.rebuild` |
| `isDraggingGizmo` (1363) | `InteractionState.isDraggingGizmo` | `TransformGizmo.onMouseDown/onMouseUp` |
| `activeGizmoAxis` (1364) | `TransformGizmo.activeAxis` | same |
| `hoveredGizmoAxis` (1365) | `TransformGizmo.hoveredAxis` (NOT reset by `rebuild`) | `TransformGizmo.onHover/detach` |
| `dragStartPoint` (1366) | `TransformGizmo` private `#dragStart` | `TransformGizmo.onMouseDown/onMouseMove` |
| `dragPlane` (1367) | `TransformGizmo` private `#dragPlane` | `TransformGizmo.onMouseDown` |
| `raycaster` (1368) | `PointerRay.raycaster` (one shared instance, as legacy) | `PointerRay.fromEvent` |
| `mouse` (1369) | `PointerRay.ndc` | `PointerRay.fromEvent` |
| `pilotMode` (1370) | `InteractionState.pilotMode` (`PilotController.active`) | `PilotController.toggle` only |
| `savedCameraState` (1371) | `PilotController` private `#saved` = `{position, orbit: OrbitController.snapshot(), fov}` | `PilotController.toggle` |
| `cameraBodyMesh` (1372) | `CameraRigView.bodyMesh` (never nulled, as legacy) | `CameraRigView.create` |
| `pilotMoveSpeed` (1375) | `PilotController.moveSpeed` | `PilotController.onWheel` |
| `isPilotLooking` (1376) | `PilotController` private `#looking` | `PilotController` mouse handlers, `toggle` |
| `pilotLastMouse` (1377) | `PilotController` private `#lastMouse` | same |
| `sectionColors` (1379) | `Theme.Palette.sectionColors` (injected as `palette` into `WallController` and `ProjectSerializer`) | - |
| `panelBorderColors` (1384) | `Theme.CanvasTheme.panelBorderColors` (injected into `PanelIdRenderer`) | - |
| `panelIdFontColor` (1387) | `Project.panelIdStyle.fontColor` | `PanelIdStyle.set` |
| `sectionLabelEnabled` (1388) | `Project.panelIdStyle.sectionLabelEnabled` | same |
| `sectionLabelFontSize` (1389) | `Project.panelIdStyle.sectionLabelFontSize` | same |
| `sectionLabelColor` (1390) | `Project.panelIdStyle.sectionLabelColor` | same |
| `sectionLogos` (1393) | `Project.logos` (`LogoLibrary`, plain-object keys) | `LogoLibrary` methods via `SectionLogosPanel` and `WallController.deleteSection` |
| `wallSections` (1395) | `Project.wall.sections` (`WallSection[]`; pushed on add, replaced on delete/import) | `Wall` methods, `WallSection` methods (via `WallController`; `ensureName` at render time) |
| `nextSectionId` (1409) | `Project.wall.nextSectionId` | `Wall.appendLikeLast/replaceAll` |
| `ledPixelTextureCache` (1805) | `LEDPixelTextureFactory` private `#cache` | `LEDPixelTextureFactory.tile/clearCache` |
| `isDragging` (3747) | `OrbitController` private `#dragging` | `OrbitController` listeners |
| `previousMousePosition` (3747) | `OrbitController` private `#prevMouse` | same |
| `cameraAngle` (3748) | `OrbitController.angle` (replaced by a new object in `setView`/`restore`) | `OrbitController` |
| `cameraDistance` (3748) | `OrbitController.distance` | `OrbitController` |
| `targetPosition` (3749) | `OrbitController.target` | `OrbitController.updateTargetPosition` |
| `targetOffset` (3750) | `OrbitController.offset` | `OrbitController.tickKeyboard/setView/restore` |
| `keysPressed` (3753) | `KeyboardState` private `#keys` | `KeyboardState` listeners |
| `moveSpeed` (3754) | `OrbitController.MOVE_SPEED` (static) | - |
| local `scale = 0.001` x8 (1479, 2488, 2552, 2591, 3757, 4493, 4912, 4920) | `domain/WallSection.js MM_TO_M` | - |
| local `scale` param of `generateOBJContent` (4556) | **dropped (unused parameter)** | - |
| `init` locals `canvas`, `container`, `pointLight`, unnamed `AxesHelper` (1427-1449) | `SceneManager` (`canvas` injected; `axes` field; `pointLight` stays a local of `init()`) | `SceneManager.init` |
| `setupPreviewResize` closure state `isResizing`, `startX`, `startY`, `startWidth`, `startHeight` (3650-3651) | `PreviewWindow` private `#resize` | `PreviewWindow` resize listeners |
| DOM `.active` on the 9 `div.toggle` (931, 935, 943, 963, 980, 999, 1100, 1111, 1138) | DOM, flipped by `flipToggle` in the owning panel and read back (legacy idiom); forced off by `WallDisplayPanel`'s `DISPLAY_CONTENT_CHANGED` mirror | owning panels |
| DOM `.active` on `#toggle-grid` (1228) | DOM (`ViewportToolbar`); independent of `display.showGrid`, as legacy | `ViewportToolbar` |
| DOM `.active` on `.mesh-mode-option` labels | DOM (`WallDisplayPanel`); radio `checked` untouched on import | `WallDisplayPanel` |
| DOM `.collapsed` on cards | DOM (`SectionListPanel`); snapshot/restore only on add/delete, lost on every other re-render (legacy) | `SectionListPanel` |
| DOM gizmo button classes/text/title, `#selection-indicator.visible` + `.selected-name`, `#pilot-info.visible` | DOM (`ViewportToolbar` mirrors) | `ViewportToolbar` |
| DOM inline `style.display` of option blocks, `#custom-filmback`, `#export-safe-distance`, `#camera-preview-window`; `#frustum-status-text` colour; preview window size and canvas inline size | DOM, owned by the module that writes it (`WallDisplayPanel`, `CameraPanel`, `PropControls`, `PreviewWindow`) | owners |

`InteractionState` is a shared read surface; its writers are listed above. `Project` and its parts are read by many modules but written only through the methods listed.

---

## 5. Event catalogue

### 5.1 Bus rules (binding)

1. `emit` is synchronous; handlers run in subscription order, which is construction order (section 7). There is no async dispatch, wildcard, de-duplication or batching.
2. The bus never catches. A handler exception propagates to the emitter, exactly like the nested legacy function call it replaces.
3. Unknown event names throw in `on`, `off` and `emit`.
4. Every emit sits at the exact legacy DOM-write point of the step it replaces. Everything that must happen after it (model, scene, rebuild, hub) is a direct call by the emitter after `emit` returns.
5. Subscribers follow R3 (mirrors only; disjoint targets; no domain writes, no controller calls, no nested emits). The single declared exception is `SectionListPanel.render()`'s `section.ensureName(index)` inside the `WALL_SECTIONS_CHANGED` subscriber (see R3: idempotent, never writes in practice, and its only later reader runs in the legacy order).
6. Subscriptions are made in constructors, so they exist before the bootstrap rebuild (e.g. `HeaderStats` must receive the first `WALL_STATS_CHANGED`).
7. A new event requires a subscriber in the same change (no speculative events). The single declared exception is `WALL_REBUILT`, the feature seam.

### 5.2 Events

| Event (constant) | Payload | Emitted by (exact point) | Phase-1 subscribers (mirror) |
|---|---|---|---|
| `wall:statsChanged` (`WALL_STATS_CHANGED`) | `{totalPixels, totalPanels, totalSections, totalArc}` | `WallController.publishStats()`: P1 step 3 (legacy 1574) and `commitSectionEdit` (4073) | `HeaderStats` |
| `wall:sectionsChanged` (`WALL_SECTIONS_CHANGED`) | `{reason: 'add'\|'delete'\|'import', addedId?}` | `WallController.addSection/deleteSection` right after the model change (legacy re-render point 4105 / 4134); `applyImport` (4998) | `SectionListPanel` (snapshot, render, restore; or render + expandFirst for import), `SectionLogosPanel` (render iff `reason !== 'import'` and panel IDs are on) |
| `wall:sectionRenamed` (`WALL_SECTION_RENAMED`) | `{}` | `WallController.commitRename()` only when panel IDs are on (4020) | `SectionLogosPanel` (render) |
| `wall:meshModeChanged` (`WALL_MESH_MODE_CHANGED`) | `{mode}` | `WallController.setMeshMode` (after the model write, 4160) and `applyImport` iff `meshMode` is truthy (4992-4995) | `WallDisplayPanel` (label `.active` by equality; idempotent after a click) |
| `wall:rebuilt` (`WALL_REBUILT`) | `{layout: WallLayout, meshMode, view: LEDWallView}` | `WallController.rebuild()` last step (after the hub) | none in Phase 1 (seam for Features 1, 2, 4, 5) |
| `display:contentChanged` (`DISPLAY_CONTENT_CHANGED`) | `{toggled: 'ledSim'\|'panelIds', on: boolean, forcedOff: boolean}` | `WallController.setLedSim/setPanelIds` after the model update, before cache clear and rebuild (4170-4176, 4190-4197) | `WallDisplayPanel` (option blocks, forced-off toggle), `SectionLogosPanel` (render iff `toggled === 'panelIds' && on`) |
| `camera:previewChanged` (`CAMERA_PREVIEW_CHANGED`) | `{enabled}` | `CameraController.setPreviewEnabled` after `cine.enabled = on` (4233) | `CameraPanel` (`#camera-preview-options` display) |
| `camera:filmbackChanged` (`CAMERA_FILMBACK_CHANGED`) | `{key}` | `CameraController.setFilmback` after `cine.applyPreset` (4254-4262) | `CameraPanel` (`#custom-filmback`, size inputs) |
| `camera:lensChanged` (`CAMERA_LENS_CHANGED`) | `{hFov, vFov, filmbackWidth, filmbackHeight}` (radians, mm) | `CameraRigView.rebuildFrustum` at the legacy readout point (2369-2371); twice on the first enable, as legacy | `CameraPanel` (`#camera-hfov/vfov/aspect`) |
| `camera:coverageChanged` (`CAMERA_COVERAGE_CHANGED`) | `{frameWidth, frameHeight, status, safeDistance}` | `CameraHub.refresh` step 5 (2460) | `CameraPanel` (frame size, status text + colour, max distance) |
| `camera:poseChanged` (`CAMERA_POSE_CHANGED`) | `{source: 'reset'\|'gizmo-translate'\|'gizmo-rotate'\|'pilot-look'\|'pilot-move', axis?}` | `CameraController.resetPose` (2567), `applyGizmoTranslate` (3342), `applyGizmoRotate` (3378/3381/3384), `PilotController.onMouseMove` (3554), `tickKeyboard` (3614): always after the model write, before the hub | `CameraPanel` (input values, per-source precision) |
| `camera:safeDistanceToggled` (`CAMERA_SAFE_DISTANCE_TOGGLED`) | `{enabled}` | `CameraController.setSafeDistanceEnabled` (4325) | `CameraPanel` (`#export-safe-distance` display) |
| `prop:visibilityChanged` (`PROP_VISIBILITY_CHANGED`) | `{id, visible}` | `PropController.setVisible` after the model write (4335 / 4366) | `PropControls` with that prefix (`#<id>-options`) |
| `prop:poseChanged` (`PROP_POSE_CHANGED`) | `{id, source: 'gizmo-translate'\|'gizmo-rotate'}` | `PropController.applyGizmoTranslate/Rotate` (3351, 3358, 3391, 3397) | `PropControls` with that prefix |
| `selection:changed` (`SELECTION_CHANGED`) | `{id, label}` (`null`s on deselect) | `SelectionManager.select` (before `gizmo.attach`), `deselect` (before `gizmo.detach`) (3141, 3148) | `ViewportToolbar` (badge) |
| `selectable:moved` (`SELECTABLE_MOVED`) | `{id}` | `CameraHub.refresh` last step (2466-2468), `PropController.applyTransform` (2889, 2980) | `TransformGizmo` (`updatePosition()` iff its target has that id) |
| `gizmo:modeChanged` (`GIZMO_MODE_CHANGED`) | `{mode}` | `TransformGizmo.setMode/clearMode` before `rebuild` (3176-3177, 4428-4429) | `ViewportToolbar` |
| `gizmo:spaceChanged` (`GIZMO_SPACE_CHANGED`) | `{space}` | `TransformGizmo.toggleSpace` before re-orientation (3184-3188) | `ViewportToolbar` |
| `pilot:changed` (`PILOT_CHANGED`) | `{active}` | `PilotController.toggle` right after the flip (3484-3485) | `ViewportToolbar` (button + banner) |

Ordering guarantees per multi-subscriber event: `WALL_SECTIONS_CHANGED` runs `SectionListPanel` then `SectionLogosPanel` (construction order); `DISPLAY_CONTENT_CHANGED` runs `WallDisplayPanel` then `SectionLogosPanel`. Their targets are disjoint, so the order is not observable.


---

## 6. Update flows (ordered pipelines)

Each flow lists the exact call/emit sequence. "->" is a direct call; "emit X" runs the X mirrors synchronously at that point. Line numbers give the legacy order that the sequence reproduces.

### 6.0 Permitted reorderings (the only ones; R14)

| # | Reordering | Proof that it is not observable |
|---|---|---|
| PR1 | `WallController.rebuild` computes the layout before `LEDWallView` disposes the old wall and creates the new groups; legacy walked after both. `LEDWallView.rebuild` then computes the atlas once in its step 3 (after the dispose and the new groups, before the builders); legacy computed the same totals and running offsets inside the builders, interleaved with their allocations. | The walk and the atlas are pure JS on plain objects: they allocate no THREE ids, touch no DOM and cannot throw for any primitive section value (sections are always `WallSection` objects; arithmetic on strings or NaN yields values, not exceptions). Boundary: see (b) below the table. |
| PR2 | Add/delete take the collapse snapshot after the model change (inside the `WALL_SECTIONS_CHANGED` mirror) instead of before it. | The snapshot reads only the still-unchanged DOM cards and `SectionListPanel`'s copy of the section list taken at the last render. Section ids are never written after construction and every change to the section array re-renders the cards, so `renderedSections[idx].id === legacy wallSections[idx].id` at snapshot time. If `appendLikeLast` throws (empty wall), legacy's snapshot had no effect either. Boundary: see (c) below the table. |
| PR3 | On add/delete the logo list re-renders after the collapse restore (legacy: before it). | Disjoint DOM subtrees (`#wall-sections` vs `#section-logos-container`); no rendering or reads in between. |
| PR4 | Within one handler, model writes are grouped before the DOM writes that legacy interleaved with them (card field write-back, colour dot and custom input, the filmback select's custom block and size inputs, the LED-sim / panel-ID forced-off toggles). | Field assignments, `classList` and `style`/`value` writes cannot throw, and nothing between them reads the other's target (the DOM writes use the same values the model receives). |
| PR5 | `deselect` resets `hoveredAxis` after (instead of before) the badge update. | No reader of `hoveredAxis` runs in between. |
| PR6 | The `THREE.Color` used by a section/panel colour material is created inside `LEDMaterialFactory` (after the geometry) instead of before the geometry. | `THREE.Color` carries no id. Boundary: see (a) below the table. |
| PR7 | Pure precomputation is hoisted ahead of allocations or DOM writes in three more places: (a) `CameraHub.syncSafeDistance` evaluates `layoutProject(project)` and `frameBounds()` as arguments, before `SafeDistanceView.create` runs `remove()` and `new THREE.Group()` (legacy computed the bounds and the walk after both, 2595-2647); (b) `CameraHub.refresh` evaluates `cine.coverage(frameBounds())` (bounds loop and coverage maths) before `CameraPanel` writes `#frustum-width` / `#frustum-height` (legacy wrote those two first, 2484-2485, then computed the bounds, 2487-2493); (c) `ProjectIO.exportZIP` computes the start columns with `computeAtlas(sections)` before the texture loop (legacy accumulated `cumulativeCol` inside it, 4534-4542). | The hoisted code is pure JS over plain objects (the same walk, bounds loop and atlas bookkeeping as PR1): it allocates no THREE ids, touches no DOM, cannot throw, and reads only model state that the skipped-over steps do not change (`remove()`, `new THREE.Group()`, `textContent` writes, canvas creation and `toDataURL` never write the model). |

Boundaries of these proofs (recorded at WP10 integration from the WP4, WP6 and WP9 reviews). None of them is visible in the golden master; each was weighed and accepted rather than coded around:

- (a) PR6 and console warnings. three r128's `Color` calls `console.warn('THREE.Color: Unknown color ...')` for an invalid colour string. Legacy created one `Color` per section in section and panel mode, in every content mode (1714, 1779); the factory creates one per colour material (per section in section mode, per panel in panel mode) and none in LED-sim or panel-ID mode. So for an imported invalid colour the number of those warnings differs, and in section mode with a string column count such as `'0'` legacy printed the warning before throwing from the right-panel normal while the port throws without it. The harness records only exceptions, `console.error` and `console.assert`, never `console.warn`.
- (b) PR1 and PR7 "cannot throw". Arithmetic or comparison on an imported JSON object whose `toString` and `valueOf` are not callable (for example `panel.columns = {"toString":0,"valueOf":0}`) throws `TypeError: Cannot convert object to primitive value`. The import itself behaves as legacy (the card render throws first, and the import `try` alerts). On a later rebuild trigger, legacy removed the old wall before its walk threw (the scene is left without a wall), while `WallController.rebuild` throws in `layoutProject` before `view.rebuild` (the old wall stays visible).
- (c) PR2 "every change to the section array re-renders the cards". `Wall.replaceAll` assigns the array and only then evaluates `Math.max(...ids)`, which throws for more than about 100k imported sections (`RangeError` from the spread) or for an object id like the one in (b). The import alerts and the cards are not re-rendered. On the next add or delete, legacy maps the old cards to the new ids (or, for an object id, throws in its snapshot before the push), while `SectionListPanel` maps them to the ids it last rendered (for an object id it pushes the section, increments `nextSectionId`, clears `#wall-sections` in `render()` and then throws).
- Not a reordering: after a mesh-mode label click, the `WALL_MESH_MODE_CHANGED` mirror re-runs `classList.toggle('active', ...)` on every option (legacy touched the labels only in the click handler and on import). The extra calls change no class.

### 6.1 P1: wall rebuild, `WallController.rebuild()` (legacy `createLEDWall`, 1457-1577)

```
1. layout = layoutProject(project)                                  // 1479-1549 (PR1)
2. view.rebuild({ layout, meshMode: project.meshMode, display })    // 1458-1477 dispose + groups, 1551-1557 dispatch,
                                                                    // 1559-1569 frames, 1571-1572 scene.add
3. this.publishStats()  -> emit WALL_STATS_CHANGED (HeaderStats)    // 1574
4. orbit.updateCameraPosition()                                     // 1575  flat target (B-L2, via framingBounds); moves the camera even in pilot
5. if (project.camera.enabled) hub.refresh()                        // 1576  P2; re-drives the pilot view after step 4
6. emit WALL_REBUILT { layout, meshMode, view }                     // new seam, no Phase-1 subscribers
```
Exceptions in steps 1-5 propagate unchanged (for example, an import of garbage is caught by the import `try`, see 6.10).

### 6.2 The 24 `createLEDWall()` call sites (rebuild policy)

This table is the documentation of `WallController`'s rebuild policy and is repeated in its module header. `tests/unit/wall-controller.test.mjs` asserts every row's run count and tile-cache clears with spies.

| # | Legacy line | Trigger | UI entry | Controller call(s) | Rebuild | Other steps, in order |
|---|---|---|---|---|---|---|
| 1 | 1451 | bootstrap | `App.start` | `rebuild()` | always | none (hub skipped: preview off) |
| 2 | 4000 | swatch click | `SectionListPanel` | `setSectionColor` | always | swatch classes, dot, custom input (PR4) |
| 3 | 4010 | custom colour `input` | `SectionListPanel` | `setSectionColor` | always | clear swatches, dot (PR4) |
| 4 | 4021 | name `input` | `SectionListPanel` | `renameSection`, `commitRename` | iff panel IDs | title patch; `WALL_SECTION_RENAMED` (logo list) iff panel IDs |
| 5 | 4074 | number `change` | `SectionListPanel` | `setSectionField`, `commitSectionEdit` | always, stats first | write-back, card patch, `WALL_STATS_CHANGED` twice (before and inside the rebuild) |
| 6 | 4118 | `#add-section-btn` | `SectionListPanel.bindAddButton` | `addSection` | always | `WALL_SECTIONS_CHANGED{add}` (cards, collapse, logo list iff panel IDs) |
| 7 | 4145 | `.section-delete` | `SectionListPanel` card | `deleteSection` | always unless `count <= 1` (then nothing at all) | logo entry removed, `WALL_SECTIONS_CHANGED{delete}` |
| 8 | 4161 | mesh-mode label click (fires twice) | `WallDisplayPanel` | `setMeshMode` x2 | always, twice per click (LEGACY(B-L13)) | label classes, `WALL_MESH_MODE_CHANGED` |
| 9 | 4165 | `#toggle-wireframe` | `WallDisplayPanel` | `setWireframe` | always | toggle class |
| 10 | 4166 | `#toggle-frame` | `WallDisplayPanel` | `setShowFrame` | always | toggle class |
| 11 | 4178 | `#toggle-led-sim` | `WallDisplayPanel` | `setLedSim` | always, after `ledTiles.clearCache()` | `DISPLAY_CONTENT_CHANGED{ledSim}` |
| 12 | 4183 | `#led-layout` change | `WallDisplayPanel` | `setLedLayout` | iff LED sim (cache cleared always) | - |
| 13 | 4198 | `#toggle-panel-ids` | `WallDisplayPanel` | `setPanelIds` | always (no cache clear) | `DISPLAY_CONTENT_CHANGED{panelIds}` (logo list iff on) |
| 14 | 4203 | `#panel-border-thickness` change | `WallDisplayPanel` | `setPanelIdStyle`, `rebuildIfPanelIds` | iff panel IDs | write-back |
| 15 | 4208 | `#panel-font-size` change | same | same | iff panel IDs | write-back |
| 16 | 4212 | `#panel-font-color` input | same | same | iff panel IDs | - |
| 17 | 4217 | `#toggle-section-labels` | same | same | iff panel IDs | toggle class |
| 18 | 4222 | `#section-label-size` change | same | same | iff panel IDs | write-back |
| 19 | 4226 | `#section-label-color` input | same | same | iff panel IDs | - |
| 20 | 2272 | logo `img.onload` | `SectionLogosPanel` | `rebuildIfPanelIds` | iff panel IDs | logo entry set, logo list render |
| 21 | 2285 | logo clear | `SectionLogosPanel` | `rebuildIfPanelIds` | iff panel IDs | entry deleted, logo list render |
| 22 | 2292 | logo position change | `SectionLogosPanel` | `rebuildIfPanelIds` | iff the entry exists and panel IDs | - |
| 23 | 2303 | logo scale change | `SectionLogosPanel` | `rebuildIfPanelIds` | iff the entry exists and panel IDs | write-back always |
| 24 | 5002 | import `FileReader.onload` | `ExportPanel` -> `ProjectIO` | `applyImport` | always, inside the `try` | labels iff `mesh_mode`, `WALL_SECTIONS_CHANGED{import}` |

No other path calls `rebuild()`. Never de-duplicate or debounce (row 8 rebuilds twice per click; rows 3, 16, 19 rebuild on every `input` event).

**Row ids** (07 §0.4, applied by 07 D0). Rows 1-24 are the legacy call sites and keep their numbers; tests and specs cite them by number (for example rows 3, 16 and 19). Every row added after Phase 1 carries a **named id** `<owner>-<n>` instead of the next free number, so rows from specs that land in any order never collide:
- `F<k>-<n>` for feature spec 0k (Feature k), `X<i>-<n>` for spec 09's item X<i>;
- reserved so far: `F2-1`..`F2-13` (02 §5.4), `F3-1`..`F3-5` (03 §5.6), `F4-<n>` (04, for any call site it adds), `F5-1`..`F5-3` (05 §5.5), `F6-1` (06 §5.6, the font gate); spec 09's items take `X<i>-<n>` ids in the commits that add their use cases;
- a row lands in this table, and in `tests/unit/wall-controller.test.mjs`, in the commit that adds its call site, never ahead of the code; rows that rebuild nothing (for example `F2-10`, a selection change) are listed too, so the table names every use case that could rebuild;
- an id is never renumbered or reused; amending a legacy row (for example 08 P2-8d's one rebuild per click for row 8) keeps its number.

### 6.3 P2: camera hub, `CameraHub.refresh()` (legacy `updateCameraFrustum`, 2451-2469)

```
if (!cine.enabled) return                                            // 2452
if (!rig.exists) rig.create(cine)                                    // 2454-2456: builds the frustum once (emits CAMERA_LENS_CHANGED)
rig.rebuildFrustum(cine)                                             // 2458: emits CAMERA_LENS_CHANGED again (kept, as legacy)
rig.updateTransform(cine)                                            // 2459
emit CAMERA_COVERAGE_CHANGED cine.coverage(frameBounds())            // 2460  B-M10 (tagged at CineCamera.coverage); PR7
preview.updateCamera()                                               // 2461  (preview labels)
this.syncSafeDistance()                                              // 2462  LEGACY(B-L30) rebuilt on every call
pilotDriver.refresh()                                                // 2463  re-drives the main camera iff pilot
emit SELECTABLE_MOVED { id: 'camera' }                               // 2466-2468: the gizmo follows iff the camera is selected
```

The 16 legacy `updateCameraFrustum()` call sites:

| Legacy site | New path |
|---|---|
| `createLEDWall` 1576 | P1 step 5 |
| `resetCameraPosition` 2574 | `CameraController.resetPose` -> `hub.refresh()` |
| gizmo translate on camera 3346 | `TransformGizmo.onMouseMove` -> `CameraController.applyGizmoTranslate` -> `if (enabled) hub.refresh()` |
| gizmo rotate on camera 3387 | `-> CameraController.applyGizmoRotate` -> same |
| pilot mouse-look 3557 | `PilotController.onMouseMove` -> `if (enabled) hub.refresh()` |
| pilot keys 3618 | `PilotController.tickKeyboard` -> same |
| filmback select 4263 | `CameraPanel` -> `CameraController.setFilmback` -> `if (enabled) hub.refresh()` |
| filmback width 4269, height 4275, focal 4281 | `CameraPanel` -> `setCameraField` -> write-back -> `commitCameraField` -> `if (enabled) hub.refresh()` |
| pos-x 4286, pos-y 4292, pos-z 4298 | same (pos-x has no write-back) |
| rot-x 4304, rot-y 4310, rot-z 4316 | same |

### 6.4 Section cards

**Field edit** (number `change`, 4026-4075): `SectionListPanel` -> `wallController.setSectionField(section, field, raw)` -> `input.value = value` (PR4) -> `#patchCard` (hint, summary, 4K box and title ⚠, LEGACY(B-L16)) -> `wallController.commitSectionEdit()` = `publishStats()` (emit `WALL_STATS_CHANGED`) -> `rebuild()` (P1, which publishes stats again).

**Colour** (3992-4011): swatch: classes -> dot -> custom input -> `setSectionColor` (model, then P1). Custom input: clear swatches -> dot -> `setSectionColor`.

**Name** (4014-4023): `renameSection` (model) -> title `innerHTML` patch -> `commitRename()` = iff panel IDs: emit `WALL_SECTION_RENAMED` (logo list render) -> P1.

**P-ADD** `WallController.addSection()` (4081-4119):
```
s = project.wall.appendLikeLast(palette.sectionColors)       // 4088-4103 (throws TypeError on an empty wall, after nextSectionId++)
emit WALL_SECTIONS_CHANGED { reason: 'add', addedId: s.id }  // SectionListPanel: snapshot (PR2) -> render -> restore (expand iff id === addedId)
                                                             // SectionLogosPanel: render iff panel IDs (PR3)
this.rebuild()                                               // 4118
```
**P-DEL** `WallController.deleteSection(id)` (4121-4146):
```
if (project.wall.count <= 1) return                          // 4122
project.logos.remove(id)                                     // 4131
project.wall.removeById(id)                                  // 4133 (removes every duplicate id, B-L8)
emit WALL_SECTIONS_CHANGED { reason: 'delete' }              // render + restore (no expand); logo list iff panel IDs
this.rebuild()                                               // 4145
```

### 6.5 Camera preview and camera inputs

**P-PREVIEW** `CameraController.setPreviewEnabled(on)` (4230-4249), after `CameraPanel` flipped the toggle class:
```
cine.enabled = on                                            // 4232
emit CAMERA_PREVIEW_CHANGED { enabled: on }                  // 4233 #camera-preview-options
preview.setVisible(on)                                       // 4234 #camera-preview-window
if (on) { if (!preview.initialized) preview.init(); this.resetPose(); }          // 4235-4237 (init = renderer, camera, resize listeners)
else {
  rig.remove()                                               // 4239  LEGACY(B-M8): the safe-distance group is left in the scene
  if (pilot.active) pilot.toggle()                           // 4241-4243 LEGACY(B-H4): enabled is already false -> alert, stays in pilot
  if (selection.isSelected('camera')) selection.deselect()   // 4245-4247
}
```
**Reset** (2550-2575, also `#reset-camera`): `cine.resetTo(frameBounds())` -> emit `CAMERA_POSE_CHANGED{reset}` (inputs: X/Y `toFixed(1)`, Z and rotations raw) -> `hub.refresh()`.
**Filmback** (4251-4264): `cine.applyPreset(key)` -> emit `CAMERA_FILMBACK_CHANGED` -> `if (enabled) hub.refresh()`.
**Lens/pose inputs** (4266-4317): `setCameraField` -> write-back iff `FIELD_RULES[field].writeBack` -> `commitCameraField()`.
**Safe distance** (4322-4327): toggle class -> `setSafeDistanceEnabled(on)`: model -> emit `CAMERA_SAFE_DISTANCE_TOGGLED` -> `hub.syncSafeDistance()` (create iff both flags, else remove).
**Export safe distance** (4329): `ProjectIO.exportSafeDistanceOBJ()` (6.13).

### 6.6 Display content toggles

**LED sim** (4167-4179): `WallDisplayPanel` flips the class -> `setLedSim(on)`: `forcedOff = display.setLedSim(on)` -> emit `DISPLAY_CONTENT_CHANGED{ledSim}` (`#led-sim-options`; if forced: panel-IDs toggle class off + `#panel-id-options` hidden) -> `ledTiles.clearCache()` -> P1.
**Panel IDs** (4187-4199): flip -> `setPanelIds(on)`: `forcedOff = display.setPanelIds(on)` -> emit `DISPLAY_CONTENT_CHANGED{panelIds}` (`#panel-id-options`; if forced: LED-sim class off + options hidden; logo list render iff on) -> P1.
**Layout** (4180-4184): `setLedLayout(value)`: model -> `clearCache()` -> P1 iff LED sim.
**Mesh mode** (4156-4163): label classes (remove all, add clicked) -> `setMeshMode(mode)`: model -> emit `WALL_MESH_MODE_CHANGED` (idempotent) -> P1. The label listener fires twice per click.
**Wireframe / frames / styling inputs**: rows 9, 10, 14-19 of 6.2.

### 6.7 Section logos (2256-2305)

Upload: `FileReader.onload` -> `Image.onload` -> `logos.setImage(parseInt(id), img)` -> `logosPanel.render()` -> `rebuildIfPanelIds()`. Clear: `logos.remove` -> `render()` -> `rebuildIfPanelIds()`. Position: `if (logos.setPosition(...)) rebuildIfPanelIds()`. Scale: `pct = LogoLibrary.parseScalePercent(value)` -> write-back -> `if (logos.setScale(..., pct / 100)) rebuildIfPanelIds()`.

### 6.8 Props (person, car)

**Show/hide** (4332-4342 / 4363-4373): `PropControls` flips the class -> `PropController.setVisible(on)`: `prop.visible = on` -> emit `PROP_VISIBILITY_CHANGED` (options block) -> on: `view.create()` (dispose old root if any, build) -> `applyTransform()` (transform, then emit `SELECTABLE_MOVED`) -> `view.addToScene()`; off: `view.remove()` -> `if (selection.isSelected(id)) selection.deselect()`.
**Inputs** (4344-4392): `setField(field, raw)` -> write-back iff `Prop.FIELD_RULES[field].writeBack` -> `applyTransform()`.
**Transform** (2883-2892 / 2974-2983): `applyTransform()`: `if (!view.exists) return` -> `view.updateTransform(prop)` -> emit `SELECTABLE_MOVED{id}` (gizmo position iff selected).

### 6.9 Selection and gizmo

- **Mode** (G/R keys, buttons; 3169-3180): `gizmo.setMode(m)` -> emit `GIZMO_MODE_CHANGED` -> `rebuild()`.
- **Space** (L key, button; 3182-3193): `gizmo.toggleSpace()` -> emit `GIZMO_SPACE_CHANGED` -> `updateOrientation()` iff a group exists.
- **Pick** (canvas mousedown, 4439-4448; LEGACY(B-M14)): pilot -> `pilot.onMouseDown`; else `handled = gizmo.onMouseDown(e)`; `if (!handled && gizmo.mode) selection.pickAt(e)`: hit with a new id -> `select(id)`: emit `SELECTION_CHANGED` -> `gizmo.attach(selectable)` (rebuild); miss -> `deselect()`: emit `SELECTION_CHANGED{null}` -> `gizmo.detach()`.
- **Hover** (canvas mousemove without drag): `gizmo.onHover(e)`.
- **Drag** (mousemove while dragging, 3309-3409): translate -> `target.applyGizmoTranslate(movement)`: camera: `cine.translateBy` -> emit `CAMERA_POSE_CHANGED{gizmo-translate}` -> `if (enabled) hub.refresh()` (whose last step moves the gizmo); prop: `prop.translateBy` -> emit `PROP_POSE_CHANGED` -> `applyTransform()` (emits `SELECTABLE_MOVED`). Rotate -> `target.applyGizmoRotate(axis, -angleDeg)`, then `updateOrientation()` iff local. Then `dragStart.copy(current)`; `updatePosition()`.
- **Release** (canvas and window mouseup): `gizmo.onMouseUp()` (both fire; idempotent).
- **Escape** (4421-4432): pilot ? `pilot.toggle()` : `selection.deselect()` then `if (gizmo.mode) gizmo.clearMode()` (emit `GIZMO_MODE_CHANGED{null}` -> rebuild, which only removes).
- **Prop hide / preview off**: conditional `deselect()` (6.5, 6.8).

### 6.10 Pilot mode and import

**Toggle** (P key, `#gizmo-pilot`, Escape, preview-off; 3477-3509): see `PilotController.toggle` (section 3.8).
**Look** (canvas drag in pilot, 3544-3558): `cine.pilotLook` -> emit `CAMERA_POSE_CHANGED{pilot-look}` -> `if (enabled) hub.refresh()` (whose `pilotDriver.refresh()` re-aims the main camera).
**Fly** (every frame while keys are held, 3564-3620): `cine.pilotFly` (silent posY clamp every frame) -> if moved: emit `CAMERA_POSE_CHANGED{pilot-move}` -> `if (enabled) hub.refresh()`.
**Wheel** (4475-4479): `pilot.onWheel(e)` (speed).

**P-IMPORT** `ProjectIO.importFromInputEvent(e)` (4967-5010):
```
file = e.target.files[0]; if (!file) return
reader = new FileReader()
reader.onload = (event) => {
  try {
    data = JSON.parse(event.target.result)
    parsed = serializer.read(data)                 // null -> silently ignored (V-6); data === null -> TypeError -> alert
    if (parsed) wallController.applyImport(parsed) // replaceAll (+ nextSectionId) -> [meshMode iff truthy: model + emit
                                                   // WALL_MESH_MODE_CHANGED] -> emit WALL_SECTIONS_CHANGED{import} -> P1
  } catch (err) { dialogs.alert('Error parsing JSON file: ' + err.message) }
}                                                  // B-L21 (tagged at WallController.applyImport): logos neither reset nor re-rendered
reader.readAsText(file)
e.target.value = ''                                // synchronous reset (5009)
```

### 6.11 Orbit, views, grid and resize

- Canvas drag / wheel (3821-3840): `OrbitController` listeners (ignored while dragging the gizmo or in pilot) -> `updateCameraPosition()`.
- WASD/QE (every frame, 3766-3817): `orbit.tickKeyboard()` (skipped in pilot) -> `updateCameraPosition()` iff moved.
- View buttons (4394-4397): `orbit.setView(name)` (also in pilot mode: B-L25, tagged at `OrbitController.setView`).
- Grid button (4398-4401): button class toggle -> `sceneManager.toggleGrid()`.
- Window resize (1453): `sceneManager.onResize()`. Preview resize handle: `PreviewWindow` private listeners (registered on the first preview enable).

### 6.12 P3: frame tick

`SceneManager.startLoop(tick)`: `requestAnimationFrame(frame)` first, then `orbit.tickKeyboard()` -> `pilot.tickKeyboard()` (may run P2) -> `sceneManager.render()` -> `preview.render(scene)` (guarded; whole scene: B-M11, tagged at `PreviewWindow.render`) (3884-3890). The first frame runs synchronously inside the init phase.

### 6.13 Exports

All exports read the live project and a fresh `layoutProject(project)`; none reads the scene except the safe-distance OBJ (its group). See `ProjectIO` (section 3.10) for the exact sequences of `exportJSON`, `exportOBJ` (OBJ, then MTL after 100 ms), `exportGLTF`, `exportPanelIds` (async, `toBlob`), `exportZIP` (async; JSON -> OBJ -> MTL -> glTF -> textures -> `generateAsync` -> download) and `exportSafeDistanceOBJ` (alert or download; 08 P2-5a). Export Panel IDs and Export All (ZIP) check every canvas against `CANVAS_HARD_LIMITS` before drawing it (08 P2-1c): an oversize atlas alerts M-EXP-2 and a null `toBlob` result M-EXP-3, with no download; the ZIP leaves oversize (or `data:,`) section textures out, writes `texture_file: null` and no `map_Kd` for them, and alerts M-EXP-4 after the download. Every export runs inside `ProjectIO.#runExport` (08 P2-1a): an export that throws or rejects shows the M-EXP-1 alert `<label> failed: <message>. No file was downloaded.` and warns in the console instead of raising an uncaught exception or an unhandled rejection (for example the empty-wall combined OBJ/glTF TypeError of `import_edge`). Console and dialog behaviour must match the baseline of the parent commit.

---

## 7. Bootstrap sequence (`App.start()`)

Reproduces `init(); setupUI(); setView('reset');` (5093-5095). `main.js` has already run `installCanvasPolyfills()`.

```
// ---- construct (R4: no THREE allocation, no DOM mutation, no listeners; bus subscriptions only) ----
theme = Theme; brand = theme.brand; bus = new EventBus(); dialogs = createDialogs(win)
project = Project.createDefault()
frameBounds = () => framingBounds(project); colorToRgb = (s) => new THREE.Color(s)
interaction = new InteractionState(); keyboard = new KeyboardState({ doc, win })
sceneManager = new SceneManager({ canvas: byId(doc, 'three-canvas'), win, display: project.display, theme })
pointerRay = new PointerRay({ sceneManager })
ledTiles = new LEDPixelTextureFactory({ doc, display, theme }); panelIds = new PanelIdRenderer({ doc, style, logos, theme })
materials = new LEDMaterialFactory({ display, panelIds, ledTiles, win })
wallView = new LEDWallView({ sceneManager, materials, builder: new WallMeshBuilder(Strategies.mesh.viewport), theme })
rig = new CameraRigView({ sceneManager, bus, theme }); safeDistance = new SafeDistanceView({ sceneManager, doc, theme })
preview = new PreviewWindow({ doc, win, cine, elements: { windowEl: #camera-preview-window, canvas: #camera-preview-canvas,
                              resizeHandle: #camera-preview-resize, info: #camera-preview-info, fov: #camera-preview-fov,
                              res: #camera-preview-res } })
personView = new PersonPropView({ sceneManager, theme }); carView = new CarPropView({ sceneManager, theme })
headerStats = new HeaderStats({ doc, bus })                                   // subscribed before the bootstrap rebuild
orbit = new OrbitController({ sceneManager, keyboard, interaction, frameBounds })
gizmo = new TransformGizmo({ sceneManager, pointerRay, interaction, bus, theme })
selection = new SelectionManager({ bus, gizmo, pointerRay, interaction })
pilotDriver = new PilotCameraDriver({ sceneManager, cine, rig, interaction })
hub = new CameraHub({ project, rig, preview, safeDistance, pilotDriver, frameBounds, bus })
pilot = new PilotController({ sceneManager, cine, driver: pilotDriver, orbit, keyboard, interaction, hub, bus, dialogs })
cameraController = new CameraController({ project, rig, preview, hub, pilot, selection, frameBounds, bus })
personController = new PropController({ prop: person, view: personView, selection, bus })
carController = new PropController({ prop: car, view: carView, selection, bus })
selection.register(cameraController); selection.register(personController); selection.register(carController)   // pick tie order
wallController = new WallController({ project, view: wallView, ledTiles, orbit, hub, bus, palette: theme.palette })
serializer = new ProjectSerializer({ palette: theme.palette })
objExporter = new ObjExporter({ brand, colorToRgb, builder: new WallMeshBuilder(Strategies.mesh.obj) })
gltfExporter = new GltfExporter({ brand, colorToRgb, builder: new WallMeshBuilder(Strategies.mesh.gltf) })
projectIO = new ProjectIO({ project, wallController, serializer, objExporter, gltfExporter, panelIds, safeDistance,
                            downloader: new Downloader({ doc, win }), JSZip, dialogs, brand, win })
sectionList = new SectionListPanel({ doc, project, wallController, bus })
displayPanel = new WallDisplayPanel({ doc, wallController, bus })
logosPanel = new SectionLogosPanel({ doc, project, wallController, bus })     // after sectionList and displayPanel (5.2)
cameraPanel = new CameraPanel({ doc, project, cameraController, projectIO, bus, theme })
personControls = new PropControls({ doc, prefix: 'person', controller: personController, prop: person, bus })
carControls = new PropControls({ doc, prefix: 'car', controller: carController, prop: car, bus })
toolbar = new ViewportToolbar({ doc, orbit, sceneManager, gizmo, pilot, bus })
viewportInput = new ViewportInput({ doc, win, sceneManager, interaction, gizmo, selection, pilot })
exportPanel = new ExportPanel({ doc, projectIO })
tick = () => { orbit.tickKeyboard(); pilot.tickKeyboard(); sceneManager.render(); preview.render(sceneManager.scene) }

// ---- legacy init() (1426-1455) ----
sceneManager.init()                       // 1427-1449: scene, camera, renderer, lights, grid, axes
wallController.rebuild()                  // 1451: P1 (stats via HeaderStats, orbit target; hub skipped)
orbit.attach()                            // 1452 setupControls: canvas mousedown, mousemove, mouseup, mouseleave, wheel
keyboard.attach()                         // 1452 setupControls: doc keydown, doc keyup, win blur
sceneManager.attachResize()               // 1453
sceneManager.startLoop(tick)              // 1454: first frame runs synchronously, before setupUI

// ---- legacy setupUI() (4148-4489), statement order ----
sectionList.render(); sectionList.expandFirst(); sectionList.bindAddButton()   // 4149-4154
displayPanel.bind()                       // 4156-4227
cameraPanel.bind()                        // 4230-4329
personControls.bind(); carControls.bind() // 4332-4392
toolbar.bind()                            // 4394-4407
viewportInput.attachShortcuts()           // 4410-4434 (doc keydown, after KeyboardState's)
viewportInput.attachPointer()             // 4437-4479 (canvas listeners after the orbit ones; win mouseup; wheel passive:false)
exportPanel.bind()                        // 4481-4488

// ---- legacy setView('reset') (5095) ----
orbit.setView('reset')
```
`display`, `style`, `logos`, `cine`, `person`, `car` are `project.display`, `project.panelIdStyle`, `project.logos`, `project.camera`, `project.person`, `project.car`. Listener order on shared targets after bootstrap: canvas `mousedown`/`mousemove`/`mouseup`/`wheel`: orbit then router; canvas `mouseleave`: orbit only; document `keydown`: keyboard state then shortcuts; document `keyup`: keyboard state; window: `resize` (SceneManager), `blur` (KeyboardState), `mouseup` (router); document `mousemove`/`mouseup`: preview resize, added on the first preview enable.


---

## 8. Legacy compatibility registry

Phase 1 preserves every output-affecting defect. A later fix changes exactly one site (a `Strategies` value plus its new code branch, or one tagged site), deletes or updates the `LEGACY_SITES` entry and re-baselines only the affected harness outputs, in a commit of its own.

### 8.1 `Strategies` switches (`js/legacy/LegacyCompat.js`)

| Key = Phase-1 value | Bug | Preserved behaviour | Read by (exact read; the statement is in the module's section-3 entry) | How read (1.5) | The later fix |
|---|---|---|---|---|---|
| `mesh.viewport.winding = 'ccw'` (08 P2-2a; Phase-1 value `'legacy-cw'`, kept as a case for `LegacyProfiles`) | B-H1 (fixed) | Landed: combined/section strips wound `(bl, br, tr)/(bl, tr, tl)`, counter-clockwise toward the stage (08 6.4); `'legacy-cw'` wound them `(bl, tl, tr)/(bl, tr, br)` (clockwise from +Z) against +Z normals | viewport `WallMeshBuilder` (`LEDWallView`'s builder): `sectionGrid` passes `this.profile.winding` to `quadIndices` | switch in `quadIndices` | landed in 08 P2-2a (invariance gate, empty `expect`: the same diagonal and unlit DoubleSide materials keep coverage and plain colours; the reviewed `mayChange` screenshots are the wireframe line directions, 1-level UV-interpolation rounding on textured walls and one edge-on pixel, 08 6.4); panel mode (`PlaneGeometry`) was already correct |
| `mesh.viewport.side = 'double'` | – (design choice since 08 P2-2a) | DoubleSide: the orbit can go behind the wall (it no longer hides a winding defect, B-H1 is fixed) | `LEDMaterialFactory.#side()`: `Strategies.mesh.viewport.side` | switch | optional `'front'` (Feature 1 F1-5 with its back shell, or Feature 5) |
| `mesh.viewport.normals = 'averaged'` (08 P2-2b; Phase-1 value `'right-panel'`, kept as a case for `LegacyProfiles`) | B-L3 (fixed) | Landed: a curved section's interior vertex normal is the unit bisector of its two adjacent panel normals and its end columns keep their panel normal; a flat section keeps the `'right-panel'` normals verbatim (08 6.4 with 01 CR-1: the test is per section, `sl.isFlat`); `'right-panel'` was the normal of the panel to the right, the last column copying the previous | `WallMeshBuilder.sectionGrid`: `opts.normals ?? this.profile.normals` | switch | landed in 08 P2-2b (invariance gate: the unlit `MeshBasicMaterial` never reads normals) |
| `mesh.viewport.combinedUV = 'atlas-u-full-v'` | B-M5 | Combined V = row/rows for every section | `WallMeshBuilder.combinedGrid`: `this.profile.combinedUV` | switch | `'atlas-pixel-accurate'` / `'per-section'` (Feature 4) |
| `mesh.obj.winding = 'ccw'` (08 P2-2c; Phase-1 value `'legacy-cw'`, kept as a case for `LegacyProfiles`) | B-H2 (OBJ half fixed) | Landed: OBJ strip faces wound counter-clockwise toward the stage and panel faces `v, v+1, v+2 / v, v+2, v+3`; `'legacy-cw'` wrote clockwise strips and panel faces `v, v+3, v+2 / v, v+2, v+1` | OBJ `WallMeshBuilder`: `sectionGrid` and `panelQuadIndices` pass `this.profile.winding` to `quadIndices`; `ObjExporter.#faceConventionLine()`: `profile.winding` (the 01 CR-3 header line, written for `'ccw'` only) | switch in `quadIndices`; switch in `#faceConventionLine` | landed in 08 P2-2c |
| `mesh.obj.normals = 'averaged'` (08 P2-2c; Phase-1 value `'none'`, kept as a case for `LegacyProfiles`) | B-H2 (OBJ half fixed) | Landed: the OBJ grids carry the 08 6.4 averaged normals (flat sections bit-equal to `'right-panel'`, 01 CR-1); `'none'` pushed no normals (the writer emitted the constant `vn` instead) | `WallMeshBuilder.sectionGrid` (OBJ builder): `this.profile.normals` | switch | landed in 08 P2-2c |
| `mesh.obj.stripNormals = 'per-vertex'` (08 P2-2c; Phase-1 value `'constant-z'`, kept as a case for `LegacyProfiles`) | B-H2 (OBJ half fixed) | Landed: one `vn` per vertex from the builder normals (`toFixed(6)`) and strip faces `f a/a/a`; `'constant-z'` wrote one `vn 0 0 1` per combined/section object | `ObjExporter.#stripNormalLines(normals, constantIndex)`: `profile.stripNormals` | switch | landed in 08 P2-2c |
| `mesh.obj.panelNormal = 'facing'` | – (consistent since 08 P2-2c) | Panel `vn (sin rotY, 0, cos rotY)`, which agrees with the `'ccw'` panel faces (08 6.4; it contradicted the `'legacy-cw'` faces, B-H2) | `WallMeshBuilder.panelFacingNormal`: `this.profile.panelNormal` | switch | unchanged (08 4.1) |
| `mesh.obj.combinedUV = 'per-section-overlap'` | B-M6 | Combined OBJ `vt` 0..1 per section, overlapping | `ObjExporter.write`, combined branch (after the colour): `profile.combinedUV` | switch | atlas UVs from the builder |
| `mesh.gltf.winding = 'ccw'` (08 P2-2d; Phase-1 value `'legacy-cw'`, kept as a case for `LegacyProfiles`) | B-H2 (fixed) | Landed: glTF strip indices counter-clockwise toward the stage and panel `[0, 1, 2, 0, 2, 3]`; `'legacy-cw'` wrote clockwise strips and panel `[0, 3, 2, 0, 2, 1]` | glTF `WallMeshBuilder`: `sectionGrid` and `panelQuadIndices` pass `this.profile.winding` to `quadIndices` | switch in `quadIndices` | landed in 08 P2-2d |
| `mesh.gltf.normals = 'averaged'` (08 P2-2d; Phase-1 value `'none'`, kept as a case for `LegacyProfiles`) | B-H2, B-M7 (NORMAL half; fixed) | Landed: the glTF grids carry the 08 6.4 averaged normals, written as `NORMAL`; `'none'` pushed none | `WallMeshBuilder.sectionGrid` (glTF builder): `this.profile.normals` | switch | landed in 08 P2-2d |
| `mesh.gltf.panelNormal = 'facing'` (new leaf in 08 P2-2d; absent from `LegacyProfiles`) | – | The panel `NORMAL`: 4 copies of `(sin rotY, 0, cos rotY)` (`panelNormals`) | `WallMeshBuilder.panelFacingNormal` (glTF builder): `this.profile.panelNormal` | switch | – |
| `mesh.gltf.attributes = ['POSITION', 'NORMAL']` (08 P2-2d; Phase-1 value `['POSITION']`, kept as a case for `LegacyProfiles`) | B-M7 | No TEXCOORD_0 (`NORMAL` landed in 08 P2-2d) | `GltfExporter.#attributeList()`, called first by `#addMesh` and by `#writePanels` (whether NORMAL is written): `profile.attributes` | array: iterate and switch each element, `'POSITION'` first, no repeats, or throw (1.5, 04 5.5) | add `TEXCOORD_0` (08 P2-7c) |
| `mesh.gltf.indexType = 'auto'` (08 P2-1b; Phase-1 value `'uint16'`, kept as a case for `LegacyProfiles`) | B-L5 (fixed) | Landed: Uint32 (5125) as soon as the largest index reaches 65,535 (`indexWidth`, 08 6.2); `'uint16'` always wrote 5123 and wrapped above 65,535 vertices | `GltfExporter.#addMesh`: `profile.indexType` | switch | landed in 08 P2-1b (invariance gate: every harness glTF is unchanged); the viewport index attribute (untagged) landed in 08 P2-1e |
| `mesh.gltf.doubleSided = 'omit'` | – (correct since 08 P2-2d) | The material object has **no** `doubleSided` key: single-sided, which shows the `'ccw'` wall from the stage and keeps a wrongly facing wall visible as an error (08 Q2) | `GltfExporter.#doubleSided()` (called first by `#addMesh`): `profile.doubleSided` | switch | `case 'true'` (08 P2-2d) writes `doubleSided: true`, for a later export option; no profile uses it |
| `exportCombinedColor = 'first-section'` | B-L6 | Combined MTL Kd and glTF baseColor from `sections[0]` (TypeError on an empty wall) | `ObjExporter.write` (first statement of the combined branch) and `GltfExporter.write` (after the combined loop): `Strategies.exportCombinedColor`, each at its legacy colour point | switch | per-section materials or COLOR_0 |
| `mtlTextureNaming = 'index'` | B-M2 | `map_Kd textures/Wall_<i>_PanelIDs.png` | `PanelNaming.mtlTextureFile`: `Strategies.mtlTextureNaming` | switch | use `zipTextureFileName` |
| `zipTextureNaming = 'sanitized-name'` | B-L14 | Colliding sanitised names overwrite in the ZIP | `PanelNaming.zipTextureFileName`: `Strategies.zipTextureNaming` | switch | de-duplicate |
| `mtlDownloadDelayMs = 100` | B-L7 | MTL as a second download 100 ms later; textures not delivered | `ProjectIO.exportOBJ`: `win.setTimeout(..., Strategies.mtlDownloadDelayMs)` | value | bundle (ZIP) |
| `zipJsonIncludesAngleOffset = false` | B-M3 | ZIP JSON lacks `angle_offset_degrees` | `ProjectSerializer.write`, `'zip'` variant: `Strategies.zipJsonIncludesAngleOffset` | switch (`case false`) | `true` |
| `importValidation = 'none'` | B-L8 | `\|\|` defaults only; strings, NaN/duplicate ids, empty walls, unknown modes accepted | `ProjectSerializer.read`, after the `data.sections` guard: `Strategies.importValidation` (`Wall.replaceAll` reads no strategy; it carries its own B-L8 tag) | switch | `ProjectValidator` inside `read()` |
| `framingBounds = 'flat'` | B-L2, B-M10 | Orbit target, camera reset, coverage status and safe-distance D use flat bounds | `WallLayout.framingBounds`: `Strategies.framingBounds` (the 4 consumers get it injected as `frameBounds`) | switch | true bounds or the pivot (Feature 3) |
| `curveBeforeFirstPanel = true` | B-L1 | Curve step applied before the first panel's move | `WallLayout.computeWallLayout` (first statement): `Strategies.curveBeforeFirstPanel` | switch (`case true`) | owner decision: **kept** (2026-10-16, 1.4); 08 P2-13f retires the switch with no output change |
| `safeDistanceBand = 'per-column-own-normal'` | B-M15, B-L29 | Un-mitred per-column quads; faces point -Y; outline = first safeLeft + every safeRight | `SafeDistanceView.create` (first statement): `Strategies.safeDistanceBand` | switch | mitred offsets, flipped index order |
| `frustumDepthM = 15` | B-L33 | Frustum drawn to 15 m | `CameraRigView.rebuildFrustum`: `frustumDepth = Strategies.frustumDepthM` | value | clip at the wall |
| `previewRendererSize = [320, 180]` | B-M9 | Fixed 320x180 outer size, filmback-aspect stretch | `PreviewWindow.init`: `renderer.setSize(...Strategies.previewRendererSize)` | value | size from the client box, refit per lens |
| `previewRendersHelpers = true` | B-M11 | Preview renders grid, axes, gizmo, rig fill tint | `PreviewWindow.render`, after the guard: `Strategies.previewRendersHelpers` (helpers stay on layer 0) | switch (`case true`) | put helpers on `LAYERS.HELPERS`, exclude from the preview camera |
| `gizmoRotateSign = -1` | B-M12 | Rotation opposite to the drag | `TransformGizmo.onMouseMove`: `Strategies.gizmoRotateSign * angle` | value | `+1` |
| `pilotForwardYSign = -1` | B-M13 | Pilot W/S vertical inverted | `PilotController.tickKeyboard`: `Strategies.pilotForwardYSign * Math.sin(tilt)` | value | `+1` (or `getWorldDirection`) |
| `combinedLedSimColor = 'white'` | B-L18 | Combined LED sim ignores section colours | `LEDMaterialFactory.combined`, LED-sim branch: `Strategies.combinedLedSimColor` | switch | vertex colours + normalised cache key |
| `dispose.wallTextures = true` (Phase 1C H1; legacy value `false`) | B-H5 (fixed) | Landed: wall rebuilds dispose the old wall's material maps (legacy never disposed them) | `LEDWallView.rebuild`: `disposeObject3D(group, {maps: Strategies.dispose.wallTextures})` (tracker policy) | value | landed in Phase 1C step H1: full golden master identical to the baseline apart from the documented overlay-glyph jitter (run `h1`) |
| `dispose.gizmo = true` (Phase 1C H2; legacy value `false`) | B-L12 (fixed) | Landed: the replaced or removed gizmo group's geometries and materials are disposed (legacy never disposed them) | `TransformGizmo.rebuild/detach`: `if (Strategies.dispose.gizmo) disposeObject3D(group)` | value (`if`) | landed in Phase 1C step H2: full golden master, including the `keyboard` and `gizmo_drag` screenshots, identical to the baseline apart from the documented overlay-glyph jitter (run `h2`), so the freed materials changed no draw order |

"Referenced", for check rule 8: a leaf path `a.b.c` of `Strategies` (arrays are leaves) counts as referenced when the text `Strategies.a.b.c` occurs, outside comments, in a `js/` file other than `LegacyCompat.js`. For a leaf under `mesh.<consumer>.`, the text `profile.<leaf>` also counts, with any receiver (`this.profile.winding`, `this.#profile.stripNormals`, `builder.profile.attributes`). Every row above satisfies this through its "Read by" statement.

### 8.2 Quirk register (every bug id; mirrors `LEGACY_SITES`)

| Bug | Preserved behaviour (behaviour-inventory id) | Single site | Fix lands as |
|---|---|---|---|
| B-H1 | Viewport strip winding vs normals (C-5) | `Strategies.mesh.viewport.winding` (fixed; `side` stays `'double'` as a design choice) | Landed in 08 P2-2a (`mesh.viewport.winding = 'ccw'`; `mesh.viewport.side = 'double'` stays as a design choice; no tag site) |
| B-H2 | Export winding, constant/contradicting normals, no doubleSided (R-5, S-2) | `Strategies.mesh.obj/gltf` (fixed) | Landed in 08 P2-2c (OBJ: `mesh.obj` winding `'ccw'`, normals `'averaged'`, stripNormals `'per-vertex'`) and 08 P2-2d (glTF: `mesh.gltf` winding `'ccw'`, normals `'averaged'`, panelNormal `'facing'`, attributes with `NORMAL`); no tag site |
| B-H3 | glTF RangeError; ZIP dies silently (S-3, U-4) | `GltfExporter`'s default encoder; `ProjectIO` exports (fixed; `Strategies.gltfBase64` retired) | Landed in 08 P2-1a (`chunkedBase64` encoder; `ProjectIO.#runExport` reports every export failure; no tag site) |
| B-H4 | Preview off in pilot: alert, stuck in pilot (O-8) | `CameraController.setPreviewEnabled` (order) + `PilotController.toggle` guard | exit pilot before clearing `enabled` |
| B-H5 | Wall textures leak (memory only) | `Strategies.dispose.wallTextures` | Landed in Phase 1C H1 (`dispose.wallTextures = true`; no tag site) |
| B-M1 | Safe-distance OBJ throws ReferenceError (K-3) | `ProjectIO.exportSafeDistanceOBJ` (fixed) | Landed in 08 P2-5a (`downloader.saveBlob`; no tag site) |
| B-M2 | Index-based MTL texture path (R-3) | `PanelNaming.mtlTextureFile` | name-based |
| B-M3 | ZIP JSON lacks angle offsets (U-1) | `Strategies.zipJsonIncludesAngleOffset` | `true` |
| B-M4 | Unescaped names/colours/values in innerHTML (V-8) | `legacyHtml` (every template interpolation in `SectionListPanel`, `SectionLogosPanel`) | real escaping + import validation |
| B-M5 | Combined V full height (E-5) | `Strategies.mesh.viewport.combinedUV` + `LEDMaterialFactory.combined` repeat | new UV strategy (Feature 4) |
| B-M6 | Overlapping combined OBJ UVs (R-6) | `Strategies.mesh.obj.combinedUV` | atlas UVs |
| B-M7 | glTF POSITION only (S-2) | `Strategies.mesh.gltf.attributes` | `NORMAL` landed in 08 P2-2d; `TEXCOORD_0` with 08 P2-7c |
| B-M8 | Safe-distance group survives preview off (K-2) | `CameraController.setPreviewEnabled` (tag) | `safeDistance.remove()` there |
| B-M9 | Preview 320x180 stretch (L-1) | `Strategies.previewRendererSize` | client-box sizing |
| B-M10 | Coverage from posZ against a flat rectangle (J-7, J-8) | `CineCamera.coverage` + `framingBounds` | layout-aware analyser |
| B-M11 | Preview renders helpers and tint (L-4) | `Strategies.previewRendersHelpers` (`PreviewWindow.render`) | helpers layer |
| B-M12 | Rotate gizmo direction inverted (N-9) | `Strategies.gizmoRotateSign` | `+1` |
| B-M13 | Pilot vertical inverted (O-5) | `Strategies.pilotForwardYSign` | `+1` |
| B-M14 | Select on mousedown; misses deselect (N-5) | `ViewportInput.attachPointer` (tag) | select on click under 4 px travel |
| B-M15 | Overlapping/gapped safe-distance quads | `Strategies.safeDistanceBand` | mitred band |
| B-M16 | Panel-mode 4-16 px/LED per panel (E-10) | `TextureAtlas.panelPxPerLed` (tag) | atlas UVs or budget |
| B-L1 | Curve before the first panel (B-5) | `Strategies.curveBeforeFirstPanel` | owner decision |
| B-L2 | Flat bounds for target/reset/D (H-3, J-1, J-9) | `Strategies.framingBounds` | true bounds / pivot |
| B-L3 | Right-panel normals | `Strategies.mesh.viewport.normals` (fixed) | Landed in 08 P2-2b (`mesh.viewport.normals = 'averaged'` with the 01 CR-1 flat-section short-circuit; no tag site) |
| B-L4 | No canvas-size guard (`toBlob` null throws, ZIP `data:,`) | `ProjectIO.exportPanelIds/exportZIP`, `PanelIdRenderer` + `LEDMaterialFactory` (fixed) | Landed in 08 P2-1c (export size guards: `canvasFits`, M-EXP-2/3/4, ZIP pre-check and late skip) and 08 P2-1d (viewport: a null panel-ID canvas falls back to the section colour with a console warning); no tag site |
| B-L5 | Uint16 glTF indices | `Strategies.mesh.gltf.indexType`, `LEDWallView` index attribute (fixed) | Landed in 08 P2-1b (glTF `mesh.gltf.indexType = 'auto'`, `indexWidth`) and 08 P2-1e (viewport: Uint32 index attribute from a largest index of 65,535); no tag site |
| B-L6 | Combined exports use section 0's colour | `Strategies.exportCombinedColor` | per-section |
| B-L7 | MTL second download, textures missing | `Strategies.mtlDownloadDelayMs` | bundle |
| B-L8 | No import validation; unknown mode renders as panels; raw coercion | `Strategies.importValidation` + `LEDWallView.rebuild` dispatch `else` (tag) + `WallSection` constructor (tag) | validator |
| B-L9 | `\|\| default` turns 0 into the default (D-7, J-5, V-3) | `orDefault` | change `orDefault` or per rule |
| B-L10 | Gizmo posY >= 0 vs pilot >= 0.1 per frame; Z unclamped | `CineCamera.translateBy`, `CineCamera.pilotFly` (tags) | validated setter |
| B-L11 | Shortcuts ignore SELECT focus, modifiers, repeat (W-1) | `core/typingTarget.js isTypingTarget` + `ViewportInput.attachShortcuts` (fixed) | Landed in 08 P2-9b (`core/typingTarget.js isTypingTarget` with the 07 3.8 truth table, re-exported by `InputState` as `isShortcutIgnoredTarget`; `ViewportInput.attachShortcuts` also ignores Ctrl, Meta, Alt and auto-repeat; no tag site) |
| B-L12 | Gizmo resources leak (memory only) | `Strategies.dispose.gizmo` | Landed in Phase 1C H2 (`dispose.gizmo = true`; no tag site) |
| B-L13 | Mesh-mode handler fires twice (C-4) | `WallDisplayPanel.bind` (tag + warning) | "mode unchanged -> no-op" guard, never radio `change` |
| B-L14 | Colliding ZIP texture names (U-3) | `Strategies.zipTextureNaming` | de-duplicate |
| B-L15 | Fractional integer fields (D-8); declared vertex advance | `WallSection.FIELD_RULES` + `WallMeshBuilder.sectionGrid` (tags) | `Math.round` + `step` |
| B-L16 | 4K ⚠ via `/Wall \d+/` (D-10) | `SectionListPanel.#patchCard` (tag) | title from the model |
| B-L17 | 4K check per section only | `WallSection.exceeds4K` (tag) | wall-level check |
| B-L18 | Combined LED sim white (E-4) | `Strategies.combinedLedSimColor` + `LEDPixelTextureFactory.tile` cache key (tag) | colour + key fix |
| B-L19 | Panel mode: no logos, fixed label size (F-4, G-4) | `PanelIdRenderer.panelCanvas` (tag) | shared drawer / atlas UVs |
| B-L20 | Unbounded LED tile cache | `LEDPixelTextureFactory.tile` (tag) | LRU or one shared tile |
| B-L21 | Import keeps logos; no logo-list re-render (G-8) | `WallController.applyImport` + `SectionLogosPanel` import exclusion (tags) | reset + render |
| B-L22 | Prop Y arrow and X/Z rings inert (N-7) | `Prop.translateBy/rotateBy` + `TransformGizmo.rebuild` (tags) | `Selectable.allowedAxes()` |
| B-L23 | Local gizmo orientation stale (N-10) | `TransformGizmo.updatePosition` / `SELECTABLE_MOVED` handler (tag) | also re-orient |
| B-L24 | Badge overlaps help badge; no `.view-btn.active` style | `css/07-viewport.css`, `css/09-viewport-tools.css` (documentation entry; CSS is untagged) | CSS change + `ui_visual` re-baseline |
| B-L25 | View presets work in pilot (W-2) | `OrbitController.setView` (tag) | guard |
| B-L26 | Gizmo visible in pilot | `PilotController.toggle` (tag) | hide/detach |
| B-L27 | Frame-rate-dependent movement (I-3) | `OrbitController.tickKeyboard`, `PilotController.tickKeyboard` (tags) | `dt` from `startLoop` |
| B-L28 | World rings write Euler channels | `CineCamera.rotateBy` (tag) | quaternion composition |
| B-L29 | Safe-distance floor faces -Y | `Strategies.safeDistanceBand` | swap order |
| B-L30 | Pose changes rebuild frustum + safe distance | `CameraHub.refresh` (tag) | pose-only refresh |
| B-L31 | JSON v1 saves only sections + mesh_mode (Q-3) | `ProjectSerializer.write` (tag) | v2 writer |
| B-L32 | Preview resize clamp blow-out | `PreviewWindow` resize handler (tag) | clamp both axes |
| B-L33 | Frustum fixed 15 m | `Strategies.frustumDepthM` | clip at wall |
| B-L34 | Preview header first word; fake resolution (L-3) | `CineCamera.presetShortName` + `PreviewWindow.updateCamera` (tags) | short names |
| B-L35 | Logo load: no error / zero-size guard | `SectionLogosPanel` upload + `PanelIdRenderer` logo drawing (tags) | guards |
| B-L36 | Toggles not keyboard accessible | `index.html` markup (documentation entry; markup is untagged) | markup + `flipToggle` keys |

`tests/static/check.mjs` verifies: per `js/` file, the set of ids in its `LEGACY(...)` tags equals the set of `LEGACY_SITES` ids whose site is in that file (the exact rows are in 8.3; rule 6); every `Strategies` leaf is referenced in the sense defined under 8.1 (rule 8).

### 8.3 Exact LEGACY tag sites (`LEGACY_SITES` entries)

`LEGACY_SITES` contains exactly one entry `{ id, site, behaviour, fix }` per (bug id, site) pair below; `site` is the backticked string in the first column, copied verbatim (a row with two ids gives two entries with the same site). Each work package places a `// LEGACY(<ids>): <behaviour>` comment at every row whose file it owns. One comment may carry several ids (`// LEGACY(B-H1, B-H2): ...`). The static check (rule 6) compares, per `js/` file, the ids of its tags with the ids of the rows whose site starts with that file's path. A tag is a comment containing `LEGACY(` followed by a comma-separated list of ids matching `/B-[HML]\d+/` and `)`; any other mention of a bug id omits the `LEGACY(` prefix (section 1.5). Rows outside `js/` are documentation-only (their entries exist in `LEGACY_SITES`, the check ignores them).

| Site | Ids |
|---|---|
| `js/legacy/LegacyCompat.js#orDefault` | B-L9 |
| `js/legacy/LegacyCompat.js#legacyHtml` | B-M4 |
| `js/domain/WallSection.js#constructor` | B-L8 |
| `js/domain/WallSection.js#FIELD_RULES` | B-L15 |
| `js/domain/WallSection.js#exceeds4K` | B-L17 |
| `js/domain/Wall.js#appendLikeLast` | B-L8 |
| `js/domain/Wall.js#replaceAll` | B-L8 |
| `js/domain/Wall.js#flatBounds` | B-L2, B-M10 |
| `js/domain/LogoLibrary.js#get` | B-L8 |
| `js/domain/CineCamera.js#coverage` | B-M10 |
| `js/domain/CineCamera.js#presetShortName` | B-L34 |
| `js/domain/CineCamera.js#translateBy` | B-L10 |
| `js/domain/CineCamera.js#rotateBy` | B-L28 |
| `js/domain/CineCamera.js#pilotFly` | B-L10 |
| `js/domain/Prop.js#translateBy` | B-L22 |
| `js/domain/Prop.js#rotateBy` | B-L22 |
| `js/geometry/WallLayout.js#computeWallLayout` | B-L1 |
| `js/geometry/WallLayout.js#flatEdges` | B-M15 |
| `js/geometry/WallLayout.js#framingBounds` | B-L2, B-M10 |
| `js/geometry/WallMeshBuilder.js#sectionGrid` | B-L15, B-L8 |
| `js/geometry/WallMeshBuilder.js#combinedGrid` | B-M5 |
| `js/geometry/TextureAtlas.js#panelPxPerLed` | B-M16 |
| `js/geometry/PanelNaming.js#zipTextureFileName` | B-L14 |
| `js/geometry/PanelNaming.js#mtlTextureFile` | B-M2 |
| `js/io/ProjectSerializer.js#write` | B-M3, B-L31 |
| `js/io/ProjectSerializer.js#read` | B-L8, B-M4 |
| `js/io/ObjExporter.js#write` | B-M6, B-L6, B-L8 |
| `js/io/GltfExporter.js#write` | B-L6, B-L8 |
| `js/io/GltfExporter.js#addMesh` | B-M7 |
| `js/render/SceneManager.js#addHelper` | B-M11 |
| `js/render/LEDWallView.js#rebuild` | B-L8 |
| `js/render/LEDMaterialFactory.js#combined` | B-M5, B-L18 |
| `js/render/textures/LEDPixelTextureFactory.js#tile` | B-L18, B-L20 |
| `js/render/textures/PanelIdRenderer.js#panelCanvas` | B-L19, B-M16 |
| `js/render/textures/PanelIdRenderer.js#sectionCanvas` | B-L35 |
| `js/render/CameraRigView.js#rebuildFrustum` | B-L33 |
| `js/render/SafeDistanceView.js#create` | B-M15, B-L29 |
| `js/render/PreviewWindow.js#init` | B-M9 |
| `js/render/PreviewWindow.js#updateCamera` | B-L34 |
| `js/render/PreviewWindow.js#render` | B-M11 |
| `js/render/PreviewWindow.js#setupResize` | B-L32 |
| `js/interaction/OrbitController.js#updateTargetPosition` | B-L2 |
| `js/interaction/OrbitController.js#tickKeyboard` | B-L27 |
| `js/interaction/OrbitController.js#setView` | B-L25 |
| `js/interaction/SelectionManager.js#pickAt` | B-M14 |
| `js/interaction/TransformGizmo.js#rebuild` | B-L22, B-L26 |
| `js/interaction/TransformGizmo.js#updatePosition` | B-L23 |
| `js/interaction/TransformGizmo.js#onMouseMove` | B-M12 |
| `js/interaction/PilotController.js#toggle` | B-H4, B-L26 |
| `js/interaction/PilotController.js#tickKeyboard` | B-M13, B-L27 |
| `js/interaction/ViewportInput.js#attachPointer` | B-M14 |
| `js/app/WallController.js#setMeshMode` | B-L13 |
| `js/app/WallController.js#applyImport` | B-L21 |
| `js/app/CameraController.js#CameraHub.refresh` | B-L30 |
| `js/app/CameraController.js#setPreviewEnabled` | B-H4, B-M8 |
| `js/app/ProjectIO.js#exportOBJ` | B-L7 |
| `js/app/ProjectIO.js#exportZIP` | B-L14 |
| `js/ui/SectionListPanel.js#render` | B-M4 |
| `js/ui/SectionListPanel.js#patchCard` | B-L16 |
| `js/ui/SectionLogosPanel.js#render` | B-M4, B-L8 |
| `js/ui/SectionLogosPanel.js#onUpload` | B-L35 |
| `js/ui/SectionLogosPanel.js#constructor` | B-L21 |
| `js/ui/WallDisplayPanel.js#bind` | B-L13 |
| `css/07-viewport.css` (header comment; documentation-only) | B-L24 |
| `css/09-viewport-tools.css` (header comment; documentation-only) | B-L24 |
| `index.html` (markup, untagged; documentation-only) | B-L36 |

Every bug id from B-H1 to B-H5, B-M1 to B-M16 and B-L1 to B-L36 appears at least once, except a landed fix: its 8.2 row stays (its "Fix lands as" cell starts with `Landed`) and its rows here are deleted together with its tags, so `LEGACY_SITES` no longer lists it (`tests/unit/core.test.mjs` derives the landed ids from 8.2). Landed so far: B-H5 (Phase 1C H1; its only site was a tag in `LEDWallView.rebuild`, which keeps B-L8) and B-L12 (Phase 1C H2; its sites were tags in `TransformGizmo.rebuild`, which keeps B-L22 and B-L26, and `TransformGizmo.detach`, which has no tag left); in Phase 2, B-M1 (08 P2-5a; its sites were `legacyMissingDownloadBlob`, deleted, and the tag in `ProjectIO.exportSafeDistanceOBJ`, which has no tag left) and B-H3 (08 P2-1a; its sites were `legacySpreadBase64`, deleted with `Strategies.gltfBase64`, and tags in `GltfExporter.write`, which keeps B-L6 and B-L8, and `ProjectIO.exportZIP`, which keeps B-L4 and B-L14) and B-L5 (08 P2-1b; its only site was the tag in `GltfExporter.addMesh`, which keeps B-H2 and B-M7) and B-L4 (08 P2-1c; its sites were the tags in `ProjectIO.exportPanelIds`, which has no tag left, and `ProjectIO.exportZIP`, which keeps B-L14; its viewport half never had a tag and is fixed by 08 P2-1d) and B-H1 (08 P2-2a; its sites were the tags in `WallMeshBuilder.quadIndices`, which keeps B-H2 until 08 P2-2d, and `LEDMaterialFactory.side`, whose `'double'` value is now a design choice) and B-L3 (08 P2-2b; its only site was the tag in `WallMeshBuilder.sectionGrid`, which keeps B-L15 and B-L8) and B-H2 (08 P2-2c and P2-2d; its sites were the tags in `ObjExporter.write`'s `#stripNormalLine`, which left with P2-2c (`write` keeps B-M6, B-L6 and B-L8), `WallMeshBuilder.quadIndices`, which has no tag left, and `GltfExporter.addMesh`, which keeps B-M7) and B-L11 (08 P2-9b; its sites were the tags in `InputState.isShortcutIgnoredTarget`, now a re-export of `core/typingTarget.js isTypingTarget`, and `ViewportInput.attachShortcuts`, which has no tag left). B-L24 has two documentation-only entries, one per stylesheet: the header comment of each of the two stylesheets carries a paragraph `Legacy note B-L24 (documentation-only, preserved): ...`, which does not use the reserved token `LEGACY(` (CSS is untagged; rule 6 scans only `js/`); grep `B-L24` or `Legacy note` to find it.

How rule 6 reads these rows (as implemented in `tests/static/check.mjs`): the comparison is per file, so a tag may sit in a private helper that only the named method calls (for example `ProjectSerializer.#readV1` for `#read`, `ObjExporter.#writeCombined` for `#write`, `GltfExporter.#writeCombined` for `#write`); a tag wrapped across JSDoc continuation lines counts as one tag (placeholders are still rejected); and a row whose `js/` file does not exist is reported, so a typo in a site path cannot bypass the check.

### 8.4 Observations without a bug id (documentation only)

The verified defect list (`docs/DEFECTS.md`, last section) also records observations that were not classified as defects. Some of them affect output; verbatim porting preserves all of them. They have no B-id, so they are **not** `LEGACY_SITES` entries and carry no `LEGACY(` tag (rule 6 is unaffected). The table names the one place that a later change would edit; any such change re-baselines the affected harness outputs like a bug fix.

| Observation | Affects | Single place after Phase 1 |
|---|---|---|
| In pilot mode the main camera keeps the viewport aspect, so its horizontal FOV differs from the preview and the frustum | pilot screenshots | `PilotCameraDriver.enterView` (sets only `fov`) |
| JetBrains Mono is drawn at weight 700 on canvases although only 300-600 are loaded, and canvas drawing does not wait for `document.fonts.load` | panel-ID textures, PNG/ZIP exports, screenshots | `Theme.CanvasTheme.panelLabelFont` (+ `PanelIdRenderer` draw timing) |
| `cameraBodyMesh` is not nulled by `removeCameraPreview`; picking relies on the preview flag | picking | `CameraRigView.bodyMesh` / `CameraController.isPickable` |
| The frustum geometry is built twice on the first enable (duplicate lens readout) | DOM write count only | `CameraHub.refresh` + `CameraRigView.create` |
| `<meta author="Joe Loe">` is invalid markup; there is no favicon | head markup | `index.html` head (Feature 6) |
| Delivery timing (new with ES modules, not a legacy defect): the inline script was parser-blocking and created the renderer before the first paint; the module graph loads asynchronously, so the browser can paint the static markup (empty stats, no cards) before `App.start()` runs. The final DOM, canvas and every output are unchanged; the overlay badge text composited over the canvas can differ by 1 level in a few glyph pixels (accepted jitter, section 10) | first frames only; overlay glyph pixels in screenshots | `index.html` script tag (`blocking="render"` or a head placement would be a delivery change) |

---

## 9. Feature seams

| Feature | What exists after Phase 1 | What the feature adds |
|---|---|---|
| **1. Normals flipped by default + normals debug view** | One winding function (`quadIndices`) and per-consumer profiles in `Strategies.mesh` used by the viewport, OBJ and glTF; `side` in the viewport profile; `LEDWallView.meshes()`; `WALL_REBUILT`; `SceneManager.addHelper` + `LAYERS`; `ResourceTracker`; the toolbar button pattern. | The flips are Phase-2 commits 08 P2-2a–d, one consumer per commit (`docs/improvements/08-bugfix-roadmap.md`): `'ccw'` winding and `'averaged'` normals in `WallMeshBuilder`, OBJ per-vertex `vn` and the glTF `NORMAL` attribute. Feature 1 adds the debug view and options only: `render/NormalsDebugView.js` (LineSegments from attributes x `matrixWorld`, subscribes to `WALL_REBUILT`, registered as a helper, disposed with a tracker); a `#toggle-normals` view button and a `.view-btn.active` rule (B-L24). |
| **2. Section selection, property editing, per-section offsets** | `WallSection` with stable ids; `SectionLayout.postTransform` hook (null, never fed back into the cursor); mesh tags `userData.{kind, mode, sectionId, sectionIndex, col, row}` and combined `sectionRanges`; `LEDWallView.sectionNodes()`; the `Selectable` registry and generic gizmo; field rule tables; `WallController` as the single writer of section state; mirror events to cards; `ProjectSerializer.read` version-dispatch point. | `WallSection.offset {position, rotation}` + rules; `layoutProject` builds per-section `postTransforms`; the builder applies them to positions/normals; `LEDWallView` adds per-section groups (section/panel) or bakes (combined) and a transform-only update path; `WallSectionSelectable` (pick by `userData` / `faceIndex` -> `sectionRanges`); select-on-click (B-M14 fix); a `section:changed` event emitted by `WallController` so cards, an inspector and the UV viewer update reactively; safe distance per section instead of `flatEdges()`; schema v2. Exporters follow automatically through the layout. |
| **3. Configurable pivot + offset** | `WallPivot`/`PivotMode` in `Wall` (identity); `WallLayout.firstEdge/lastEdge/bounds()/pivotPoint(mode)` including "middle of entire wall" = midpoint of the first section's first edge and the last section's last edge on the floor; the single `framingBounds` switch for the four flat-bounds consumers; the single `layoutProject()` entry. | A baked translation in `layoutProject`: stage frame `−(P.x, 0, P.z)`, export frame `−P`, P = anchor + offset (1.4). The raw walk is translated first, and spec 02's `applySectionOffsets(out)` builds its section matrices from the translated layout (07 C32). **No wall root transform, ever:** the identity `wallGroup` transform is a unit-tested invariant (03 §5.1, §5.9 #2). `ui/PivotPanel`; a pivot Selectable + marker view; switch `framingBounds` to pivot/bounds (fixes B-L2); optional re-expression of camera/prop poses; schema v2. |
| **4. Clean 0..1 UVs + UV viewer/editor** | UV strategies in one builder function per consumer; `TextureAtlas` as the single source of offsets, widths and start columns (yields per-section `uvRects`); `PanelIdRenderer.sectionCanvas()` for the viewer background; mesh tags; the selection registry; `PreviewWindow`'s resize handle as the floating-panel pattern. | `'per-section'` / `'atlas-pixel-accurate'` strategies (fix B-M5/B-M6) and a baked per-section `uvTransform`; glTF TEXCOORD_0; `ui/UVViewer.js` (2D canvas; subscribes to `SELECTION_CHANGED` and `WALL_REBUILT`); `ui/FloatingPanel.js` extracted from `PreviewWindow`. |
| **5. HDRI projection (+ reflective car)** | `DisplaySettings.content` enum (`'color' \| 'ledSim' \| 'panelIds'`, ready for `'hdri'`); `LEDMaterialFactory` as the only wall-material constructor; `ResourceTracker` for HDR/PMREM disposal; `SceneManager` owns the main renderer and the helper registry; the second renderer is encapsulated in `PreviewWindow`; `PropView` base with `buildMesh()`; `CineCamera` lens math for the default projection point. | `ContentMode.HDRI` + `render/HdriProjectionMaterial.js` (wall and dome); `ui/HdriPanel.js` + the projection-point Selectable (`'hdri-point'`, kind `'projector'`, 07 C36); the second renderer is replaced by spec 07's `PreviewPass` (scissor rendering, R1/R2; `SceneManager` keeps only `setEnvironment` and `setPunctualLightScale`), which excludes `LAYERS.HELPERS` (B-M9/B-M11, first fixed by 08 P2-10 or 07 R1/R2, 07 C31); the backdrop dome on `LAYERS.ENVIRONMENT`; `GltfCarPropView extends CarPropView`; colour management in `render/ColorManagement.js` as per-material patches (Option L on r128; Option G after 07 U3b); loaders from 07's `vendor/three-addons.js` factories (spec 05 §5.11 #17). |
| **6. Morph branding** | `css/02-tokens.css` holds every `:root` token; `Theme.js` holds every scene/canvas colour, font, palette and export string, and every consumer receives it by injection from `App`; header and watermark markup in one place in `index.html`. | Role-based tokens; `theme/ThemeBridge.js` reading CSS variables into an object of `Theme`'s shape (one line in `App`); new `Brand` strings and filenames (+ a JSON `generator` field in v2); Morph logo SVG, favicon, valid author meta; inline styles -> classes; card swatches from `Palette`; re-baseline `ui_visual` and exports separately. Gizmo axis colours stay XYZ = RGB. |

---

## 10. Verification contracts

| Gate | Command | Passes when |
|---|---|---|
| Unit (pure layers) | `node --test "tests/unit/**/*.test.mjs"` (quoted glob; Node 22.7+: Node 21+ treats `--test` arguments as globs, so the directory form `node --test tests/unit/` fails with "Cannot find module", and the typeless `js/*.js` modules (there is no package.json) load as ESM only through module-syntax detection, unflagged since Node 22.7; the glob does not match the `oracle/*.mjs` helpers) | all green. Required per module: rule tables equal the legacy expressions over a seeded grid (0, '', NaN, negatives, fractions, numeric strings); `computeWallLayout`, `WallMeshBuilder`, `TextureAtlas`, `PanelNaming` equal the verbatim oracle with `Object.is` on every number over fuzzed sections (string fields, fractional cols, NaN/duplicate ids, empty walls); `ObjExporter`, `GltfExporter`, `ProjectSerializer` produce **byte-identical** text/JSON to the oracle (the oracle comparisons inject `LegacyProfiles.mesh.*`, the exact Phase-1 profiles, from 08 P2-0 on) and to the golden harness files of `default` and the 6 config scenarios in all 3 modes (when `GOLDEN_DIR` exists); `CameraHub`/`CameraController` step order with spies; `WallController` rebuild counts for every row of 6.2. Two Node-vs-Chrome facts the byte comparisons handle: (1) the goldens were captured in Chrome, whose `Math.atan2` is correctly rounded, while Node 24's V8 still uses fdlibm's `atan2` (last-ulp differences for about 20% of arguments), so any Node-side byte comparison of full-precision `atan2`-derived values against a Chrome golden (the panel-mode glTF accessor min/max of curved walls) installs a correctly rounded `atan2` for the duration of the test; (2) the NaN bit pattern written into a `Float32Array` is implementation-defined (B-L8 garbage imports give NaN positions), so the oracle fuzz canonicalises NaN inside float32 POSITION views on both sides before comparing; the goldens contain no NaN and are compared raw. |
| Static | `node tests/static/check.mjs`, `node tests/static/css-slices.mjs` | layering table; DOM-id ownership; no `window`/`document` globals outside `vendor/`, `ui/dom.js`, `App.js`, `main.js` (injected `doc`/`win` everywhere else); import specifiers relative, `.js`, case-exact; no module-level `let`/`var`; LEGACY parity (8.3); every `Strategies` leaf referenced (8.1); every `Events` key emitted and (except `WALL_REBUILT`) subscribed; domain fields written only by the writers of section 4; CSS slices reproduce lines 12-869. Interpretation (as implemented): a `window`/`document` token in a pure-layer file is reported under both the globals rule and the purity rule; the domain-writer rule treats every assignment operator as a write (`=`, all compound and logical assignments, `++`, `--`). |
| Golden master | `node tests/regression/run.mjs --root . --out <cand>` (always a full run) then `node tests/regression/compare.mjs <baseline> <cand> --expect tests/regression/expected/<commit-id>.json` (Phase 2 onwards; Phase 1 compared without `--expect`) | exit 0. **Phase 2 onwards (08 P2-0; every spec, every golden-changing commit): the baseline of a commit is the harness output of its parent commit (08 8.1); every golden-changing commit carries an expected-change manifest `tests/regression/expected/<commit-id>.json`, in which every difference must be declared and every declared change must happen (a within-tolerance PASS never satisfies an entry; an invariance commit has an empty `expect` list); `tests/regression/expected/_nondeterminism.json` is the only standing allowance (the overlay-glyph jitter described below, reported as `JITTER` within at most 1 level and 8 pixels on the listed screenshots); `run.mjs --only` is for local iteration and never produces a promoted baseline; export commits also run `tools/check-orientation.mjs` and `tools/check-gltf.mjs` on the candidate outputs. The procedure is documented in `tests/regression/README.md` ("Phase 2 re-baselining").** Phase 1: the baseline is captured from the pristine `index.html@cd3fd3f` (twice, self-consistent), including the extra scenarios of `tests/regression/scenarios-extra.mjs`. The only accepted WARNs are the 1-level overlay-glyph jitters documented in `tests/regression/README.md` ("Known nondeterminism"): a maximum channel difference of 1 in a few pixels that all lie on glyphs of DOM text composited over a WebGL canvas (the help badge, the pilot banner, the camera preview window's header and footer labels). Each such pixel is bistable: it flips between the same two values, in both directions, between captures. The original shows it too (between its two baseline captures, and in the `keyboard` screenshots WP1 first documented). With ES-module delivery the page can paint before `App.start()` runs (8.4), and the flips occur more often; they occur equally with the verbatim legacy script loaded as a module (integration step I-1). A same-browser A/B run showed identical overlay-free canvas pixels and an identical draw list (object, material and geometry ids, and draw order) for the original and the candidate. Any other WARN, a difference above 1 level, or a pixel outside those overlays is investigated and never accepted by re-capturing the baseline. |
| Continuous integration (07 G1) | `.github/workflows/ci.yml` on every push to `refactor/**` and `feature/**`, on every pull request, and as the reusable check of the later deploy workflow | the Static gate (`check.mjs`, `css-slices.mjs`) and the Unit gate pass on Node 22 with no `npm install`; the golden-file unit tests skip there (no `GOLDEN_DIR`), so the golden master stays a local gate (08 8.1) until 07 G4 runs it in CI |
| Manual (not automatable) | side by side with the original | WASD/QE orbit and pilot fly incl. the inverted vertical (B-M13); hover highlight; window resize; a GitHub Pages smoke test (case-sensitive paths, sub-path URLs). |

---

## 11. Implementer checklist (re-check before every merge)

1. Every arithmetic expression, string template and object literal copied verbatim (R1)? No re-association, coercion, merged templates or large spreads?
2. THREE objects created and added in the legacy order; nothing allocated in constructors; no new parents, renderables or layers (R4-R6)?
3. Every ordered step a direct call; every event a pure mirror emitted at the legacy DOM-write point (R2, R3)?
4. Domain values uncoerced; id-keyed maps with plain-object key semantics (R12)?
5. Every quirk you touched is a `Strategies` key read at its 8.1 site (switch-and-throw, value or array comparison per 1.5) or a registered `LEGACY(B-xx)` tag (R7)? Every other bug mention written without the `LEGACY(` prefix?
6. Markup and templates byte-identical; listeners attached in the legacy phase and order (R8, R11)?
7. No `try/catch` added (the only sanctioned ones since 08 P2-1a: `ProjectIO.#runExport` and the export size guards); async/sync shape unchanged (R13)?
8. Imports follow the layer table and are case-exact; no globals (R9)?
9. Unit, static and full golden-master gates green? From Phase 2 on: the commit's expected-change manifest written first, the parent commit's output as the baseline, and `compare.mjs --expect` exiting 0 (10)?

---

## 12. Amendment log

**WP10 integration** (the contract issues raised by WP1-WP9 and their reviews, resolved in this document; the code was already conforming unless noted):
- 1.2, 8.4, 10: module-delivery timing (first paint before `App.start()`) and the accepted 1-level overlay-glyph screenshot jitter (DOM text over a WebGL canvas), with its evidence.
- 2.3, 10: unit tests need Node 22.7+ (ESM syntax detection of the typeless `js/*.js` files), not 21+; css-slices normalisation (CSS whitespace only, exactly one header comment per file); the Node-vs-Chrome `atan2` and float32 NaN handling of the byte comparisons; the static-check interpretations of rules 3/9 and 10.
- 3.2: `off()` removes the earliest matching subscription; the unsubscribe function is idempotent.
- 3.3: how the `LEGACY_SITES` strings are derived from 8.2. 3.4: `Theme.js` has its own private `deepFreeze`.
- 3.5: own-key rule lookups (`Object.hasOwn`) in `WallSection.parseField` and `PanelIdStyle.set`; `CineCamera.rotateBy` keeps the legacy `else` for any non-x/y axis; `coverage()` uses `maxSafeDistance()`; the B-L8 key-matching rule of `LogoLibrary` stated exactly (the code comment in `LogoLibrary.get` was corrected the same way; tag ids unchanged).
- 3.6: `SectionLayout` / `WallLayout` constructors; `bounds()` / `pivotPoint()` edge cases; `unsupportedStrategy('mesh.winding', ...)`; once-per-call strategy switches in `sectionGrid` / `combinedGrid`; the `uv` option's undefined/invalid values; B-M5 tagged at `combinedGrid` only.
- 3.7: per-rebuild `ResourceTracker` in `LEDWallView`; `sectionNodes()` with duplicate ids; `#buildCombined(layout, sections, atlas)`; the `combinedLedSimColor` closure; `#drawLogo`; the shared r128 Sprite geometry; the `#setupResize` guard; `PropView`'s base constructor reads only `sceneManager`.
- 3.8: `SelectionManager.select` emits `selected?.label`; the gizmo colours and opacities come from `theme.scene.gizmo`.
- 3.9 / 3.10: `ProjectSerializer.write` throws `RangeError` for an unknown variant; `ProjectIO.importFromInputEvent(e)` keeps the legacy parameter name.
- 3.11: `#patchCard(card, section, field)`; which interpolations go through `legacyHtml` (all `section.id`s in the logo rows; not the computed canvas size).
- 6.0: the boundaries of the PR1, PR2, PR6 and PR7 proofs (console warnings for invalid colours; crafted object values; `replaceAll` throwing after the assignment) and the idempotent mesh-mode mirror after a click.
- 8.3: the B-L24 CSS "Legacy note" form; tags in private helpers; wrapped tags; missing-file reports.

**Phase 1C clean-ups** (non-observable flips of `Strategies.dispose.*`, each verified by a full golden-master run against the baseline):
- H1 landed: `dispose.wallTextures = true` (B-H5 fixed). 3.3, 3.7 (`ResourceTracker` policies, `LEDWallView.rebuild` step 1), 8.1, 8.2 (row kept, fix cell `Landed ...`), 8.3 (B-H5 removed from `LEDWallView.js#rebuild`; landed fixes have no 8.3 rows and no `LEGACY_SITES` entries).
- H2 landed: `dispose.gizmo = true` (B-L12 fixed). 3.3, 3.7 (`ResourceTracker` policies), 3.8 (`TransformGizmo.detach`), 8.1, 8.2 (row kept, fix cell `Landed ...`), 8.3 (B-L12 removed from `TransformGizmo.js#rebuild`; the `TransformGizmo.js#detach` row deleted).

**Final review fixes** (no observable change in current browsers; the golden-master baseline is untouched):
- 1.2: the minimum browsers (Chrome/Edge 84, Firefox 90, Safari 15, set by the private class methods) and the rule that no module uses a newer built-in. 3.5: `WallSection.parseField` and `PanelIdStyle.set` test own keys with `Object.prototype.hasOwnProperty.call` instead of `Object.hasOwn` (Chrome 93, Firefox 92, Safari 15.4). It gives the same result for these frozen plain rule tables, and it supersedes the `Object.hasOwn` wording of the WP10 entry above.
- 2.3 / 10 (static gate): `tests/static/check.mjs` no longer exempts `js/legacy/monolith.js`, which was deleted in integration step I-2. Every `.js` file under `js/` is checked, so a file recreated at that path gets the same rules as any other module.
- 1.5: the six interaction and toolbar classes (`OrbitController`, `SelectionManager`, `TransformGizmo`, `PilotController`, `ViewportInput`, `ViewportToolbar`) gained their missing class-level JSDoc.

**07 D0, the consolidated reconciliation** (documentation only, 2026-10-16; no code and no golden output changes):
- Header, 8.4: the verified defect list is `docs/DEFECTS.md` (line numbers of `index.html@cd3fd3f`).
- 1.4: the B-L1 curve convention, **kept** by the owner's decision (08 Q10, 07 C6), stated as documented behaviour; the layout, stage and export frames and the frame each consumer reads (07 C60, 03 §5.1); no wall root transform (07 C32). The pivot API the frames table names is marked as Feature 3's (03 §5.9 #3); until it lands, `layoutProject(project)` stays the 3.6 signature.
- 6.2: named ids for the rows that later specs add (07 §0.4); legacy rows 1-24 keep their numbers.
- 8.1: the `curveBeforeFirstPanel` fix column records the decision (8.2 and `LEGACY_SITES` are unchanged until 08 P2-13f).
- 9: the Feature 3 row (a baked translation, never a wall root transform; 03 §5.9 #2) and the Feature 5 row (`PreviewPass`, `LAYERS.ENVIRONMENT`, `CarPropView`, `render/ColorManagement.js`, `vendor/three-addons.js`; 05 §5.11 #17) are rewritten.

**08 P2-0, Phase 2 enablement** (harness, tests, tools and documentation; no application behaviour change, every existing golden output unchanged; the eight `p2_*` scenarios are new outputs):
- 2.3: `tests/regression/compare.mjs --expect` and `tests/regression/expected/` (expected-change manifests, `_nondeterminism.json`), `scenarios-phase2.mjs`, the opt-in request log in `lib/app.mjs` / `lib/recorder.mjs`, `tests/unit/compare.test.mjs`, `tests/unit/tools.test.mjs`, `tools/check-orientation.mjs`, `tools/check-gltf.mjs`. The empty Phase-1 `WARN_ONLY` list of `compare.mjs` is removed: `_nondeterminism.json` is the only standing allowance.
- 3.3: `LegacyProfiles`, the exact Phase-1 mesh profiles that the oracle tests inject (08 4.2); the only legacy-profile fixture.
- 10: the golden-master gate from Phase 2 on (baseline = the parent commit's output; one expected-change manifest per golden-changing commit, in any spec; `_nondeterminism.json` the only standing allowance; full runs only; the structural checkers for export commits); the unit gate's oracle comparisons use `LegacyProfiles`.
- 11: checklist item 9 names the Phase 2 gate.

**07 G1, continuous integration** (no code and no golden output changes):
- 2.3: `.github/workflows/ci.yml` (07 5.8.1: static checks and unit tests on pushes to `refactor/**` and `feature/**` and on pull requests; Node 22, no `npm install`; actions pinned by commit SHA, 07 Q13) and `.github/dependabot.yml` (keeps the pins current).
- 10: the continuous-integration row.

**08 P2-0 follow-up (manifest P2-0b)** (harness only; no application behaviour change):
- 2.3: `AppPage.reload()` keeps the dialogs of the page it leaves and `run.mjs` writes every page's dialogs to `dialogs.json` (`AppPage.allDialogs()`); `p2_project_v2` names its `toggle_aria` probes `toggle_aria_<step>.json` (08 6.18, 8.3; P2-13c's manifest pattern) and records the stored SVG text of step 8 (`stored_svg_08_hostile.json`, read from the Export All archive; 08 8.3, criterion 49).

**08 P2-5a, B-M1 landed** (manifest `tests/regression/expected/P2-5a.json`; the first Phase 2 fix, merged before P2-1a wraps every export in its error alert):
- 3.10, 6.13: `ProjectIO.exportSafeDistanceOBJ` downloads the floor OBJ through `downloader.saveBlob(blob, brand.files.safeDistanceObj)`. The band keeps its legacy per-column geometry (faces -Y, B-L29; un-mitred, B-M15) until 08 P2-5b.
- 2.2, 3.3: `legacyMissingDownloadBlob` is deleted.
- 8.2: the B-M1 row is kept with a `Landed` fix cell; 8.3: its rows `LegacyCompat.js#legacyMissingDownloadBlob` and `ProjectIO.js#exportSafeDistanceOBJ` are deleted, so `LEGACY_SITES` no longer lists B-M1.

**08 P2-1a, B-H3 landed** (manifest `tests/regression/expected/P2-1a.json`):
- 1.6 R13 amended (08 5.5): `ProjectIO.#runExport` and the export size guards are the sanctioned exceptions to "exceptions are never caught"; 11 item 7 says so.
- 3.9: `GltfExporter`'s default encoder is the exported `chunkedBase64` (08 6.1); the `gltfBase64` switch is retired (3.3, 8.1 row deleted) and `legacySpreadBase64` is deleted (2.2, 3.3). Every glTF the legacy encoder could write is byte-identical.
- 3.10, 6.13, 7: every export runs as `#runExport(label, fn)`, which turns a throw or a rejection into the M-EXP-1 alert plus a console warning; `exportPanelIds` awaits `toBlob`; the ZIP body is the private `#writeZip`; `Downloader` takes `win` and revokes the object URL in a 0 ms timer (the 8.4 observation "revoked synchronously" is removed).
- 8.2: the B-H3 row is kept with a `Landed` fix cell; 8.3: the row `LegacyCompat.js#legacySpreadBase64` is deleted and B-H3 leaves `GltfExporter.js#write` and `ProjectIO.js#exportZIP`.

**08 P2-1b, B-L5 landed for glTF** (manifest `tests/regression/expected/P2-1b.json`, an invariance gate: empty `expect`):
- 3.3, 8.1: `Strategies.mesh.gltf.indexType` is `'auto'`; `'uint16'` stays a supported case for `LegacyProfiles` (08 5.1 rule 3).
- 2.2, 3.6: `WallMeshBuilder.js` exports `maxIndexOf(indices)` and `indexWidth(maxIndex)` (08 6.2: 32-bit indices from 65,535 on, the 5123 restart value).
- 3.9: `GltfExporter.#addMesh` writes Uint32 (5125) indices when the largest index reaches 65,535 and Uint16 (5123) otherwise; every harness glTF keeps 5123 and is unchanged. 2.3: `io.test.mjs` writes the synthetic 70,000-vertex glTF of 08 8.6 to `tests/unit/out/` (git-ignored).
- 8.2: the B-L5 row is kept with a `Landed` fix cell (the viewport index attribute, untagged, follows in 08 P2-1e); 8.3: B-L5 leaves `GltfExporter.js#addMesh`.

**08 P2-1c, B-L4 landed for the exports** (manifest `tests/regression/expected/P2-1c.json`):
- 2.2, 3.6: `TextureAtlas.js` exports `CANVAS_HARD_LIMITS` (32,767 px per side, 268,435,456 px) and `canvasFits(w, h, limits)` (08 6.3).
- 3.7: `PanelIdRenderer.panelSize/sectionSize/atlasSize`, the canvas sizes by arithmetic only.
- 3.9: `ProjectSerializer.write(project, {variant: 'zip', skipped})` writes `texture_file: null` and `ObjExporter.write({..., skipped})` omits the section-mode `map_Kd` for a texture the ZIP left out (a boolean per section until 08 P2-6 brings null texture names).
- 3.10, 6.13: Export Panel IDs refuses an oversize atlas with M-EXP-2 (no canvas) and reports a null `toBlob` result with M-EXP-3; Export All (ZIP) runs the pre-check, the late `data:,` skip with the JSON/MTL re-write, and M-EXP-4 after the download (08 3.3 texts).
- 8.2: the B-L4 row is kept with a `Landed` fix cell that names P2-1d for the viewport half; 8.3: the row `ProjectIO.js#exportPanelIds` is deleted and B-L4 leaves `ProjectIO.js#exportZIP`.

**08 P2-1d, B-L4 landed for the viewport** (manifest `tests/regression/expected/P2-1d.json`; the viewport half had no tag):
- 3.7: `PanelIdRenderer.atlasCanvas/sectionCanvas/panelCanvas` return `null` and create no canvas when the canvas would exceed `CANVAS_HARD_LIMITS`; `LEDMaterialFactory` (new dependency `win`, new `beginRebuild()`) then gives that mesh its colour material and warns once per section and rebuild; `LEDWallView.rebuild` step 3 calls `materials.beginRebuild()`. 7: `App` passes `win`.
- 8.2: the B-L4 row is closed (`Landed` in P2-1c and P2-1d). 2.3: `tests/unit/materials.test.mjs` (fake THREE) checks the sizes, the null canvases, the fallback and the warning spy.

**08 P2-1e, B-L5 landed for the viewport** (manifest `tests/regression/expected/P2-1e.json`, an invariance gate: empty `expect`; the viewport index width had no tag, 08 2.2 observation):
- 3.7: `LEDWallView`'s combined and section builders pass `indexAttribute(indices)`, a `THREE.Uint32BufferAttribute` once the largest index reaches 65,535 (`indexWidth`, `maxIndexOf`), else the plain array as before; no harness wall reaches it, so every output is unchanged. 2.3: `materials.test.mjs` covers 65,535 and 65,536 vertices in both modes.
- 8.1, 8.2: the B-L5 row records both landings (P2-1b glTF, P2-1e viewport). With P2-1e the P2-1 batch (B-H3, B-L5, B-L4) is complete.

**08 P2-2a, B-H1 landed** (manifest `tests/regression/expected/P2-2a.json`, an invariance gate: empty `expect`; reviewed `mayChange` screenshots: `toggles/01_wireframe` for its line directions, the textured-wall screenshots whose UVs are interpolated from the reordered vertices (at most 1 level, a few dozen pixels each) and one edge-on pixel of `toggles/17_view_top`; 08 6.4 is corrected to say so):
- 1.4: the front-face convention (counter-clockwise seen from the front, normals toward the stage; 08 5.5).
- 3.3, 8.1: `Strategies.mesh.viewport.winding` is `'ccw'`; `'legacy-cw'` stays a supported case for `LegacyProfiles` (08 5.1 rule 3). `mesh.viewport.side = 'double'` stays as a design choice (08 4.1), and its 8.1 row no longer names a bug.
- 3.6: `quadIndices` gains `case 'ccw'` (`[bl, br, tr, bl, tr, tl]`; panel quads `[0, 1, 2, 0, 2, 3]`), the same bl-tr diagonal as `'legacy-cw'`, whose tag keeps only B-H2 until 08 P2-2d. 3.7: `LEDMaterialFactory.#side` loses its tag.
- 8.2: the B-H1 row is kept with a `Landed` fix cell; 8.3: B-H1 leaves `WallMeshBuilder.js#quadIndices` and the row `LEDMaterialFactory.js#side` is deleted.
- 9: the Feature 1 row (08 5.5): the flips are the Phase-2 commits 08 P2-2a–d; Feature 1 adds the debug view and options only.

**08 P2-2b, B-L3 landed** (manifest `tests/regression/expected/P2-2b.json`, an invariance gate: empty `expect`):
- 3.3, 8.1: `Strategies.mesh.viewport.normals` is `'averaged'`; `'right-panel'` stays a supported case for `LegacyProfiles` (08 5.1 rule 3).
- 3.6: `sectionGrid` gains `case 'averaged'` (08 6.4 with 01 CR-1): a flat section (`sl.isFlat`) keeps the `'right-panel'` normals verbatim, a curved one gets its panel normal at the end columns and the unit bisector of the two adjacent panel normals elsewhere. The unlit viewport materials never read normals, so no output changes; the OBJ and glTF writers adopt the same normals in 08 P2-2c and P2-2d.
- 8.2: the B-L3 row is kept with a `Landed` fix cell; 8.3: B-L3 leaves `WallMeshBuilder.js#sectionGrid` (B-L15 and B-L8 stay).

**08 P2-2c, B-H2 landed for OBJ** (manifest `tests/regression/expected/P2-2c.json`: every `**/*__export-obj__*.obj` and every `**/*__export-zip__*.zip`, `each`; 01 CR-2's `import_edge`, `logos` and `ui_sections` outputs by construction):
- 1.4: the OBJ writer follows the front-face convention.
- 3.3, 8.1: `Strategies.mesh.obj` winds `'ccw'` with `'averaged'` normals and `'per-vertex'` strip normals; the Phase-1 values stay supported cases for `LegacyProfiles`. `mesh.obj.panelNormal = 'facing'` is unchanged and now consistent (08 6.4), so its 8.1 row no longer names a bug. `mesh.obj.winding` has a second read, `ObjExporter.#faceConventionLine`.
- 3.9: `ObjExporter` writes the 01 CR-3 header line after `# Mesh Mode: ...` for a `'ccw'` profile; `#stripNormalLine()` becomes `#stripNormalLines(normals, constantIndex)` with `case 'per-vertex'` (one `vn` per vertex, `toFixed(6)`, faces `f a/a/a`); panel faces `v, v+1, v+2 / v, v+2, v+3` with the unchanged facing `vn`. MTL, glTF, JSON and the safe-distance OBJ are unchanged.
- 8.2: the B-H2 fix cell records the OBJ landing (glTF follows in 08 P2-2d); 8.3: B-H2 leaves `ObjExporter.js#write` (B-M6, B-L6 and B-L8 stay).

**08 P2-2d, B-H2 landed for glTF** (manifest `tests/regression/expected/P2-2d.json`: every `**/*__export-gltf__*.gltf` and every `**/*__export-zip__*.zip`, `each`; 01 CR-2's `import_edge` and `logos` outputs by construction). With P2-2d the P2-2 batch (B-H1, B-H2, B-L3) is complete:
- 1.4: the glTF writer follows the front-face convention. 1.5: the read rule of `mesh.gltf.attributes` (iterate and switch, 04 5.5).
- 3.3, 8.1: `Strategies.mesh.gltf` winds `'ccw'` with `'averaged'` normals, the new leaf `panelNormal: 'facing'` and `attributes: ['POSITION', 'NORMAL']`; the Phase-1 values stay supported cases for `LegacyProfiles` (which has no `panelNormal`). `doubleSided` keeps `'omit'` (correct now: single-sided, 08 Q2) and gains the unused `case 'true'`.
- 3.6: `quadIndices`' `'legacy-cw'` case loses its tag (no production profile uses it); `WallMeshBuilder.panelNormals(panel)` (4 x `panelFacingNormal`) and `static PANEL_UVS` (08 5.2, for 08 P2-7c).
- 3.9: `GltfExporter.#addMesh(name, attrs, primitives)` (08 5.2) writes the attributes in list order (`NORMAL`: VEC3 5126 in its own view, target 34962, no min/max) and one index view, accessor and material per primitive; every caller passes one primitive, so materials, positions, POSITION min/max, meshes and nodes are unchanged. Panel meshes carry 4 copies of the facing normal. `large_wall`'s combined buffer grows from 79,728 to 121,056 bytes (01 2.4), which the chunked encoder of 08 P2-1a writes.
- 8.2: the B-H2 row is closed (`Landed` in P2-2c and P2-2d); the B-M7 fix cell records `NORMAL`. 8.3: the row `WallMeshBuilder.js#quadIndices` is deleted and B-H2 leaves `GltfExporter.js#addMesh` (B-M7 stays).

**08 P2-9b, B-L11 landed** (manifest `tests/regression/expected/P2-9b.json`: `p2_shortcut_filters/gizmo_01_g_in_select` and `gizmo_03_p_autorepeat`, each; landed ahead of P2-9a, which it does not depend on):
- 1.3, 2.2, 3.2: `js/core/typingTarget.js isTypingTarget(t)`, the one typing guard with the 07 3.8 truth table (07 C18; 08 P2-9b is its one named owner, 07 C52): text-like `INPUT`, `SELECT`, `TEXTAREA`, contenteditable and anything inside an open dialog are typing; checkbox, radio, button, submit, reset, color, file and range inputs are not. 2.3: `tests/unit/typing-target.test.mjs`.
- 3.8: `InputState` re-exports it as `isTypingTarget` and as `isShortcutIgnoredTarget` (until 07 I1; 01 CR-9), and `ViewportInput.attachShortcuts` ignores a key when `isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat` (08 6.11; Shift is allowed). `KeyboardState` (movement) is unchanged.
- 8.2: the B-L11 row is kept with a `Landed` fix cell; 8.3: the rows `InputState.js#isShortcutIgnoredTarget` and `ViewportInput.js#attachShortcuts` are deleted, so `LEGACY_SITES` no longer lists B-L11.
