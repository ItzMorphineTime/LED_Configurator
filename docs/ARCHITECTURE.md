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

- `index.html` keeps its `<head>` exactly (including the invalid `<meta author="Joe Loe">`), keeps loading three.js r128 and JSZip 3.10.1 as **classic** scripts from the same cdnjs URLs and Google Fonts from the same URL, then links the 12 stylesheets in `css/` in numeric order. Lines 872-1276 (the `<body>` tag, the markup 873-1275 and the blank line before the script) stay byte-identical. The inline `<script>` is replaced, at the same position at the end of `<body>`, by `<script type="module" src="js/main.js"></script>`. **Phase 1 only:** this byte-identity (R8) ended with 06 T1, the first intentional markup change. Since then the stylesheet links follow the one link order of 2.1 (07 C52), ending with `css/99-utilities.css`, and the static inline `style=""` attributes are classes of that sheet; only the JS-owned `display` / `width` / `height` stay inline (static rule 12, 06 R-B2). 06 T4a changed the head (the title "Morph LED Configurator", a valid author meta, description, `theme-color`, `color-scheme`, the Open Graph text and the font URL with Montserrat); 06 T4b added the favicons, the apple-touch icon and `og:image` from `assets/brand/` (2.3), all relative to the page except the absolute `og:image`; 06 T5 set the final font URL (JetBrains Mono 400-700, with the weight 700 that the canvas labels draw, and Montserrat 400-700; Outfit and JetBrains Mono 300 are no longer requested).
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
        |   CameraController, PropController, ProjectIO, the font gate (fontGate, 06 T5). Never calls ui; publishes mirror events.
        v
      interaction/  orbit, keyboard, pointer ray, selection registry, transform gizmo, pilot   render/  THREE views and canvases (+ frameColor, pure)
        |                                                                                         |
        +-------------------------------------+---------------------------------------------------+
                                              v
      io/        pure writers/readers: ProjectSerializer (v1), ObjExporter, GltfExporter, ProjectValidator (THREE-free, DOM-free)
      geometry/  pure: WallLayout, WallMeshBuilder, TextureAtlas, PanelNaming, NormalLines, SafeDistanceBand (THREE-free, DOM-free)
      domain/    pure entities: Project, Wall, WallSection, CineCamera, Prop, LogoLibrary, ...     (THREE-free, DOM-free)
      core/ EventBus + Events, typingTarget, renderOrder     legacy/ LegacyCompat (Strategies, legacy helpers, LEGACY_SITES)     theme/ Theme constants, ThemeBridge (pure)
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
- The layout frame L (below) is the legacy world: its origin is the first section's first bottom edge vertex (the `bottom-left` pivot). Since 03 T2 `layoutProject` produces the stage frame S (the viewport, picking, the safe zone, framing and every pose; its origin is the pivot projected onto the floor, which stays y = 0) and, for the exports from 03 T3, the export frame E (its origin is the pivot). At the default pivot (bottom-left, zero offset) L = S = E, and `layoutProject` returns the walk itself. `ledWallGroup` keeps an identity transform; vertices are baked in the stage frame (there is never a wall root transform, 07 C32).
- Angles: section fields are degrees; the layout walk works in radians with the legacy association `(deg * Math.PI) / 180`.
- Euler order for the film camera, preview camera and local gizmo: `'YXZ'` with (tilt = rotX, pan = rotY, roll = rotZ).
- **Curve convention (B-L1, decided 2026-10-16: kept).** The walk starts with heading 0 along +X, and each section applies its curve step `c` **before** each panel's move. For a section with heading-in `H`, angle offset `a` and `N` panel columns, panel k (0-based) has heading `H + a + (k+1)·c` and the section exits with heading `H + a + N·c`, which is the next section's `H`. Adjacent panels are always exactly `c` apart, so multi-section curves stay continuous; a curved first section starts rotated by `c` against +X (a one-column section with a 10° curve is one panel at 10°). The owner kept this convention at Phase 2 kickoff (08 Q10, recorded in 08 §5.6; 07 C6), so it is documented behaviour and not a defect to fix. `Strategies.curveBeforeFirstPanel` (8.1) stays until 08 P2-13f retires it; the legacy convention is then the only code path, and no output changes. Project files carry no convention key (v2.0). If the convention ever changes, an additive revision adds a top-level `curvature_convention` key (absent means this convention) and `computeWallLayout` reads `layoutOptions.curveConvention` (07 C6).

**Coordinate frames and the frame of each consumer** (07 C60, 03 §5.1). Three frames are named. Phase 1 and Phase 2 code never needed to distinguish them, because the pivot was the identity and all three coincided with the legacy world above. Every consumer reads the frame listed for it here. The pivot API that the table and the pipeline below name (`resolvePivot`, `translated()` and the `frame` option of `layoutProject`) landed with 03 T2 (3.6); the pivot stays the identity, and the three frames coincide, until 03 T4 and T6 let the user change it (session-only until project file v2, the owner's decision of 2026-10-17).

| Frame | Origin | Produced by | Consumers |
|---|---|---|---|
| **Layout (L)** | The first section's first bottom edge vertex (the legacy world) | `computeWallLayout(sections)` (the verbatim walk, oracle-tested; B-L1 convention above) | `resolvePivot`, unit tests, the `pivot.resolved_m` readouts |
| **Stage (S)**, `x_S = R_y(ψ)(x_L − O)`, O = (P.x, 0, P.z) (ψ = 0 unless the orientation is used, F3-O2) | The pivot P projected onto the floor; the floor stays y = 0 | `layoutProject(project)` (default `frame: 'stage'`), read through `WallController.currentLayout` (spec 02's single layout accessor; before it lands, the layout of the last P1 rebuild) | `LEDWallView` (wall and frames), picking, gizmo anchors, spec 02's outlines and transform-only fast path, spec 01's normal lines (`matrixWorld`), spec 04's hover readout (`panelCornersWorld`), spec 05's shader (`modelMatrix·position`) and its T13 bake, 08's `FrustumCoverage` and `CameraHub`, the safe-distance band (`SafeDistanceView`), `framingBounds`, `OrbitController`, spec 09's inner frustum, measurement snapping and X15 plan SVG, and every stored pose (camera, props, HDRI point, measurements, orbit) |
| **Export (E)**, `x_E = R_y(ψ)(x_L − P) = x_S − (0, P.y, 0)` | The pivot P | `layoutProject(project, {frame: 'export'})` | `ObjExporter`, `GltfExporter`, the ZIP, spec 09's X11 stage packs. The safe-distance OBJ is the stage band translated by (0, −P.y, 0) (03 §7.1). |

- Texture content (spec 04's UVs, spec 05's bake, panel IDs) does not depend on the frame. The trap this table prevents: spec 05's bake must read the **stage** layout, because the projection point is stored in the stage frame; the export layout would sample every texel P.y too low.
- **There is never a wall root transform** (07 C32). Each frame is baked into the vertex positions by `layoutProject`, and the identity transform of the wall group is an invariant (Feature 3 adds its unit test, 03 §5.1). The pipeline is: the raw walk (every `postTransform` `null`), `resolvePivot` on it from generative quantities only, `translated(t)` with `t` = −O (stage), −P (export) or 0 (layout), then (F3-O2) `rotated(ψ)` when the wall yaw ψ of the stage or export frame is not 0, then spec 02's `applySectionOffsets(out)`, which builds each section matrix from the translated (and turned) layout (section 9, Feature 3 row).
- **Orientation (03 §12, the owner's request of 2026-10-17; steps F3-O1 to F3-O7).** The stage and export frames gain the wall yaw ψ, a turn about +Y through the pivot (the sign of three.js `rotation.y`): x_S = R_y(ψ)(x_L − O) and x_E = R_y(ψ)(x_L − P) = x_S − (0, P.y, 0), with R_y(ψ)(x, y, z) = (x·cos ψ + z·sin ψ, y, −x·sin ψ + z·cos ψ). ψ = wrapDeg(ψa + yawOffsetDeg), where ψa, the alignment of `WallPivot.orientation.align`, turns the LED normal at the wall's centre point (the arc-length midpoint of the bottom edge chain) to −X with `'center-pos-x'` ("Centre on +X (LED faces −X)", 03 12.16, the owner's reference `LED_Wall_Gen.blend`) or to +X with `'center-neg-x'` ("Centre on −X (LED faces +X)"), and is 0 with `'none'` (target azimuths `Wall.ALIGN_NORMAL_AZIMUTH_DEG`). `layoutProject` turns the translated raw walk (`WallLayout.rotated`) before spec 02's `applySectionOffsets`, so every consumer of the table above follows without orientation code and there is still no wall root transform. ψ = 0 (`'none'` with a zero offset, the class default and the legacy aggregate `Project.createDefault`) keeps the frames above bit for bit; new projects (`Project.createNew`, App) start with `wall-center`, Centre on +X (since 2026-10-31; Centre on −X before) and section meshes (03 12.11, 12.16), with the person and car placed in front of the LED face (`Prop.placeInFront`, `Project.NEW_PROJECT_PROPS`). The consumers (F3-O3..O6): Keep stage layout re-expresses rigidly (`stageChange`, `reexpressStage`), the aligned Reset and the view presets read the `framingBounds` fields `centre`, `aligned`, `viewYawDeg` and the posZ fallback its `frontZ`, the exports carry the orientation metadata. Landed in F3-O2 (`geometry/WallOrientation.js`, 3.6); the yaw's cosine and sine are exact at multiples of 90° (`yawTrig`), so the default flat wall turned by 90° lies exactly on x = 0 with LED normals exactly +X.

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
- **Reading `Strategies`:** each key is read only at the site(s) named in section 8.1, "Read by" (one function per key; `exportCombinedColor`, read by each exporter at its own legacy colour point, was retired by 08 P2-7d); the exact statement is in that module's section-3 entry and in its work package. Code that reads an **enumerated** key (string or boolean) `switch`es on it and throws `unsupportedStrategy(key, value)` in the `default` branch for any value other than the Phase-1 legacy value. A later fix adds the new case, flips the value and re-baselines. Exempt from switch-and-throw, because they are used as values: the numeric keys `mtlDownloadDelayMs`, `frustumDepthM`, `previewRendererSize` (retired by 07 R2), `gizmoRotateSign`, `pilotForwardYSign`, and the two `dispose.*` policy booleans (passed as `disposeMaps` / used as an `if` condition: both branches already exist, so the Phase 1C flip to `true` is a one-line value change). The array key `mesh.gltf.attributes` is read by iterating it and switching each element over the supported attributes (`'POSITION'`, and `'NORMAL'` since 08 P2-2d; `'TEXCOORD_0'` arrives with 08 P2-7c), with `'POSITION'` first and no repeats, throwing `unsupportedStrategy` otherwise (04 5.5). The `mesh.*` profile keys are read through the profile object injected into `WallMeshBuilder` and the exporters (`this.profile.winding`, `profile.stripNormals`, ...), never by re-importing `Strategies.mesh.*` in the consumer; rule 8 counts `profile.<leaf>` as a reference.

### 1.6 Binding implementation rules (R1-R14)

| # | Rule | Why |
|---|---|---|
| R1 | **Port verbatim.** Copy every legacy expression that feeds an output, a DOM string or a THREE object exactly: operand order and association (`(deg * Math.PI) / 180`, `vertexOffset + row * vertsPerRow + col`), `\|\| default`, `toFixed(n)`, template literals byte for byte (whitespace included), object-literal property order and evaluation order. Allowed edits: identifier substitution per the state map (section 4), hoisting a field read into a local, `this` in DOM handlers replaced by an explicit element variable, moving code into methods. Exception to identifier substitution: V8 prints the callee text of a failing call in `TypeError: <callee> is not a function` (and `<callee> is not a constructor`), and that text reaches the console baseline or the import alert. At every call whose callee can be a non-function for some imported value, keep the legacy callee text, receiver identifier included. Known site: `PanelNaming.sanitizeFilename`'s parameter stays `name`, because a numeric imported section name makes the ZIP export throw `name.replace is not a function`. Not allowed: re-association, coercion (`Number()`, `parseInt` where legacy did not), precomputing, merging two templates into one, spreading large arrays into calls (append with loops) except where the spread *is* the preserved quirk (B-H3). | Exports must match within 1e-5 (in practice byte-identical), screenshots pixel-exact, DOM text exact, JS coercion of imported strings (B-L8) and fractional counts (B-L15) identical. |
| R2 | **Ordered side effects are direct calls** inside the pipelines and use cases of section 6. | Order is visible in code; no hidden ordering contract. |
| R3 | **Events are mirrors only.** A subscriber may only update DOM elements or THREE objects that its own module owns, idempotently, from the payload and current state. It never mutates domain state, never calls a controller or use case, never emits. Subscribers of the same event touch disjoint targets. **Single declared exception:** `SectionListPanel.render()`, which runs inside its `WALL_SECTIONS_CHANGED` subscriber, calls `section.ensureName(index)` (the legacy render-time fill, 3901). It is idempotent and in practice never writes, because names are always truthy after `createDefault`, `appendLikeLast`, `rename` and import; and even if it wrote, the only later reader in the same emit (`SectionLogosPanel`) runs after it, which is the legacy `renderWallSections` -> `renderSectionLogosUI` order (4105-4106, 4134-4135). | Subscriber order cannot matter, so the bus cannot reorder legacy behaviour. |
| R4 | **Constructors are side-effect free:** they store dependencies, may look up DOM elements by id (ui and `App.js` only, no mutation), may subscribe to the bus. They never allocate THREE `Object3D`/`Material`/`BufferGeometry`/`Texture`, never touch the DOM otherwise, never add listeners, timers or rAF. (`Vector2/3`, `Plane`, `Raycaster`, `Color`, `Euler` carry no ids and may be created anywhere.) | three r128 sorts render items by `program.id`, `material.id`, `z`, `object.id`; all ids come from global counters, so allocation order must equal legacy order. |
| R5 | **THREE allocation and `scene.add` order equal legacy order** in every builder (geometry -> texture -> material -> mesh, exactly as the legacy statement order). | Same as R4 (draw-order ties at section junctions and at the grid line z = 0). |
| R6 | **No new renderables, no new scene-graph parents in Phase 1.** Helpers are *registered* (`SceneManager.addHelper`). **Replaced by 07 R1 (render layers):** each registered helper root carries a layer of 07 5.2.1's table (`LAYERS`: DEFAULT 0, HELPERS 1, ENVIRONMENT 2, DEBUG 3), re-applied to its whole subtree at the start of every rendered frame; camera masks: main `0b1111`, main while piloting `0b1101`, preview `0b0101`. The hand-written gizmo is a `'default'` helper (layer 0) hidden around the preview pass by `withPassHidden`. | Preview pixels (B-M11) and draw order stay identical: layers never change the sort order; only the pilot view loses the HELPERS layer (07 Q7). |
| R7 | **Every output-affecting quirk lives at exactly one site:** a `Strategies` key read by code or a registered `LEGACY(B-xx)` tag. | Each later fix is a one-place change. |
| R8 | **Markup is byte-identical; CSS is contiguous slices** of the original `<style>` in original order. Inline `style=""` attributes stay. **A Phase-1 rule: it ended with 06 T1**, which moved the static inline styles to `css/99-utilities.css` (computed styles unchanged, proved by the harness), deleted the dead CSS and switched `css-slices.mjs` to `--report-only` (07 S7). | The cascade is identical by construction; `ui_visual` stays identical. |
| R9 | **No globals, call-time browser globals** (section 1.5). | Constraint: no app state on `window`; legacy semantics of `alert` etc. |
| R10 | **Pure layers are Node-testable:** `core`, `legacy`, `theme`, `domain`, `geometry`, `io` import no THREE and touch no DOM. | Exporters are byte-compared against golden files in plain Node before any wiring. |
| R11 | **Listener registration order is reproduced:** orbit canvas listeners and keyboard-state listeners in the init phase; panel listeners, shortcut keys and canvas pointer routing in the setupUI phase, in legacy statement order (section 7). | Same handler order on shared targets (`mousedown`, `keydown`, ...). |
| R12 | **Domain values are never coerced or validated in Phase 1** (B-L8). **Phase 2 (08 P2-3b):** an import is validated before it reaches the domain (`io/ProjectValidator.js`, B-L8 fixed); the domain constructors still never coerce. Id-keyed lookups use plain-object property-key semantics (`obj[id]`, i.e. `String(id)` for primitives). | Imported strings, NaN and duplicate ids behave exactly as today. |
| R13 | **Exceptions are never caught** except where legacy caught them (the import `try/catch`). Sync/async shape of every export function is preserved (`exportZIP` and `exportPanelIds` stay `async`; **amended by 08 P2-6e:** `exportOBJ` became `async` when it started to build one ZIP, the owner's decision). **Amended by 08 P2-1a:** `ProjectIO.#runExport`, which wraps every export and reports a failure as the M-EXP-1 alert, and the export size guards (08 P2-1c) are the sanctioned exceptions. | Console baseline (uncaught errors, unhandled rejections) and import alerts stay identical. |
| R14 | **Reorderings are allowed only if listed in section 6.0**, each with its proof of non-observability. | Keeps "verbatim" auditable. |


---

## 2. File tree

The `WP` column names the work package that creates the file (see `docs/REFACTOR_PLAN.md` and the work-package list). Every file belongs to exactly one work package. Totals (Phase 1): 12 stylesheets; 45 application modules plus `main.js`, the composition root `App.js` and 2 vendor shims. Files added since name their spec step instead of a work package (for example `01 F1-2`).

### 2.1 Stylesheets (`css/`): slices of the original `<style>`, linked in this order

Each file contains a header comment followed by the original lines **verbatim and in order** (leading indentation may be removed; nothing else changes). Concatenating the files in numeric order, minus their header comments, reproduced lines 12-869 of the original modulo whitespace in Phase 1, so the cascade was identical by construction. There are no CSS comments and no `url()` in the original, so moving the rules changes no paths. **Since 06 T1** the files are no longer exact slices: T1 deleted the dead rules `.grid-lines` (07) and `.section-color-0..7` (10), and later steps (06 T4a onwards) rewrite rules on purpose. `tests/static/css-slices.mjs` therefore runs with `--report-only` (07 S7): it still lists every difference from the original, and nothing fails on it.

**Link order** (07 C52, the one order for every spec; the numeric prefix is the link order): `00-fonts.css` (06 T13, when self-hosting lands), `01`-`11`, `css/features/*.css` (specs 01-05), `12-responsive.css`, spec 09's `20`-`29` block, and **`css/99-utilities.css` last of all** (06 T1).

| File | Original lines | Content | WP |
|---|---|---|---|
| `css/01-reset.css` | 12-16 | `*` reset (margin, padding, box-sizing) | WP2 |
| `css/02-tokens.css` | 18-31 | `:root` custom properties: the single theme-token file (Feature 6 seam). 06 T3 adds layer 4 (06 5.1), the roles that `theme/ThemeBridge.js` reads: `--scene-background`, `--scene-grid-center`, `--scene-grid-line`, `--scene-frame`, `--scene-camera-body`, `--scene-frustum`, `--scene-safe-wall`, `--scene-safe-threshold`, `--scene-safe-line`, `--scene-safe-label`, spec 01's `--scene-face-front`, `--scene-face-back`, `--scene-normals`, `--scene-normals-face` (01 CR-8; `--scene-wall-back` lands with its key in 01 F1-5), `--canvas-background` and `--status-within` / `--status-off-center` / `--status-exceeds`, each resolving to `#rrggbb` and equal to its `Theme.js` fallback (U4). They held the legacy values until 06 T5, which switched them to the Morph values of 06 3.8 (mostly `var()` aliases of layers 1-2; spec 01's four tokens unchanged) and added `--scene-frame-on-light` (the dark panel frame of 06 6.7) and `--scene-overlay-halo` (the Morph Black halo of every two-tone overlay and edge outline, 06 D15). 06 T4a replaced the legacy token block with layers 1-3 (06 5.1): the brand primitives `--morph-*`, the derived dark-UI primitives `--ui-*` and the semantic roles (`--color-*`, `--cta-background`, `--shadow-overlay`, `--font-ui`, `--font-mono`), which every stylesheet references; no other stylesheet holds a colour literal or a legacy token name (static rules 13 and 14) | WP2 |
| `css/03-layout.css` | 33-46 | `body` (06 T4a: `--font-ui`, role colours), `.app-container` grid; 06 T4a: the `:focus-visible` ring of buttons, selects and `.toggle` (`--color-focus-ring`, 2 px, offset 2 px) | WP2 |
| `css/04-header.css` | 48-102 | `.header` (06 T4a: the three-column grid [lockup, history slot of 07 H2, stats]), `.brand-lockup` and `.product-name` (06 T4a; the `.logo*` rules deleted), `.brand-wordmark`, `.brand-monogram`, `.brand-divider` (06 T4b: the 144 px wordmark, the 36 px monogram shown at <= 520 px, the 1 x 24 px divider), `.header-stats`, `.stat*` | WP2 |
| `css/05-control-panel.css` | 104-295 | `.control-panel` (+ scrollbar), section cards (`.wall-section*`, `.section-*`), `.input-field*`, `.curve-hint`, `.add-section-btn*` | WP2 |
| `css/06-controls.css` | 297-444 | `.global-section*`, `.mesh-mode-*`, `.toggle-container`, `.toggle*`, **first** `.export-btn` block (425-444) | WP2 |
| `css/07-viewport.css` | 446-524 | `.viewport`, `#three-canvas`, `.viewport-overlay`, `.viewport-info` (06 T4a3: `anchor-name: --help-badge`, the anchor of the selection badge), `.info-badge`, `.viewport-controls`, `.gizmo-controls` (the dead `.grid-lines` was deleted in 06 T1, with the commented-out element in the markup; `.company-logo`, the third-party logo, in 06 T4a); 06 T4b: `.brand-watermark` (44 px monogram at top 24 / left 80) and `.pilot-info.visible ~ .brand-watermark` (hidden while the pilot banner shows) | WP2 |
| `css/08-section-logos.css` | 526-602 | `.section-logo-*` | WP2 |
| `css/09-viewport-tools.css` | 604-735 | `.gizmo-mode-btn*` (06 T4a: 18 px icons; the active pilot button keeps the focus ring, its Morph Black edge a box-shadow while focused), `.pilot-info*` (06 T4a: `.pilot-info__icon`), `.gizmo-divider`, `.selection-indicator*` (06 T4a: the opaque chip at `bottom: 64px`, B-L24; 06 T4a3: anchored 12 px above `.viewport-info`, so a two-line help badge never overlaps it), `.view-btn*` | WP2 |
| `css/10-section-extras.css` | 737-811 | `.section-color-picker`, `.color-swatch-small*`, `.color-input-custom*`, `.section-warning*`, `.warning-indicator` (the dead `.section-color-0..7` were deleted in 06 T1) | WP2 |
| `css/11-export.css` | 813-857 | `.export-section`, `.export-row`, **second** `.export-btn` block, `.export-btn.secondary*`, `.import-input` | WP2 |
| `css/12-responsive.css` | 859-869 | `@media (max-width: 900px)` (must stay the last of the slices; since 06 T1 the link order puts spec 09's `20`-`29` and `css/99-utilities.css` after it, see below); 06 T4b: at <= 900 px the divider hidden and the product name visually hidden (the heading keeps its accessible name), and a second query, `@media (max-width: 520px)`, swaps the wordmark for the monogram | WP2 |

**Feature stylesheets** are not slices. They live in `css/features/`, are linked in the `css/features/*` block of 07 C52's link order (`00-fonts`, `01`-`11`, `css/features/*`, `12-responsive`, `20`-`29`, `99-utilities`), so `12-responsive.css` stays the last of the slices, and they carry their own `@media` rules. `tests/static/css-slices.mjs` scans only `css/01-*.css` to `css/12-*.css` (07 S7):

| File | Content | Step |
|---|---|---|
| `css/features/debug-view.css` | `.view-btn.active` (the `.view-btn.active` half of B-L24; its one named owner, 07 C52; 06 T4a: a strong border and a primary icon), `.view-divider`, `.debug-popover*`, `#viewport-top-stack` and `.pilot-info.visible ~ #viewport-top-stack`, `.debug-legend*` (swatches through `var(--swatch)`; the legend takes pointer events so its `title` shows on hover, and its notes keep the secondary text colour, F1-2b), `.debug-normals-stats`, `.visually-hidden`, the `@media (max-height: 492px), (max-width: 900px) and (max-height: 842px)` overflow fallback of `.viewport-controls` (444 / 794 until 04 UV-14 added `#toggle-uv-viewer`: +48 px, 01 CR-7). Colours only through the role tokens of `02-tokens.css` (06 T4a migrated it from the legacy tokens). | 01 F1-2 |
| `css/features/pivot.css` | The Wall Pivot panel (03 3.2): `.pivot-mode-select`, `.pivot-mode-option*` (the seven `.mesh-mode-*` visual rules repeated under their own classes, role tokens, no tinted fill), the visually hidden but focusable radios (`display: block`, never `none`; static rule 19) with a `:focus-within` ring, `.section-row.pivot-offset-row` (three columns), `.pivot-actions` (and its button size, disabled and pressed states), `.pivot-snap-row` / `.pivot-snap-label` (the select itself is a `.ui-select`), `.pivot-readout` (with `--pivot-warning: var(--color-warning)`), `.pivot-hint`, `.pivot-status`, `.pivot-warning`. | 03 T6 |
| `css/features/floating-panel.css` | `.floating-panel*` (04 3.1): z-index 30, header / extra slot / close / body / bottom-left resize handle, `[hidden]`, the `@media (max-width: 900px)` bottom sheet (60 % of `.viewport`, at least `min(200px, 100%)`, no move or resize). Role tokens only. | 04 UV-10 |
| `css/features/uv-viewer.css` | The viewer's content (`.uv-viewer__*`, `.uv-row`, `.uv-num`, `.uv-btn`, `.uv-seg*`, `.uv-chip*`, `.uv-hint`, `.uv-readout`), the sidebar `.uv-options` / `.uv-check` / `.uv-atlas-note` and the card's `.section-uv-*`. Role tokens only (the canvas colours are the `--uv-*` tokens read through ThemeBridge). | 04 UV-12, UV-14 |
| `css/features/sidebar.css` | The collapsible side panel (2026-10-31): `.app-container.sidebar-collapsed` (the viewport takes the whole width, the whole height at <= 900 px; the hidden panel is `visibility: hidden`), the `.sidebar-toggle` handle (left edge, vertically centred; bottom edge at <= 900 px; z-index 35; inset focus ring) and its chevron. Role tokens only. | 2026-10-31 |
| `css/features/section-selection.css` | The selected section's card (`.wall-section.is-selected`: accent border and header bar; `.is-flashing`: a one-off accent ring, instant under reduced motion) and the section menu (`.context-menu*`, z-index 120, inset focus ring). Role tokens only. | 2026-10-31 |

**`css/99-utilities.css`** (06 T1, 06 5.2/5.3) is not a slice either and is linked **last** of all stylesheets. It holds only the classes that replaced the static inline `style=""` attributes of `index.html` and of the two panel templates, with the values copied from those inline styles: the spacing utilities `.mt-6/10/12/16`, `.mb-8/10`, `.section-row--flush`, `.btn-block`; `.ui-select` (`#led-layout`, `#camera-filmback`); `.input-field .color-input-full`; `.subsection-title` (+ `--tight`, the class had no rule before); the read-outs `.readout`, `.readout-row` (+ `--gap`, `--last`), `.readout-label`, `.readout-value`, and the initial status colours `.status-pending` (`#frustum-status-text`, `var(--status-off-center)` since 06 T3) and `.status-ok` (`#safe-distance`, `var(--status-within)`), which `CameraPanel` still overrides through `style.color` at runtime, so the initial and the runtime status colours come from one token; the preview window's static look `.preview-window`, `__resize`, `__icon`, `__header`, `__footer` (`display`, `width` and `height` stay inline: `PreviewWindow` owns them; the canvas keeps its inline size); the logo rows `.logo-row`, `__title`, `__label`, `__input` (`SectionLogosPanel`); `.curve-hint--small` (the cards' offset hint, `SectionListPanel`). An inline style beat every rule and a class does not, so the sheet is linked last (a utility wins over every earlier rule of its specificity) and a utility is qualified where a legacy rule is more specific (`.input-field .color-input-full`). The harness proved the computed styles unchanged (06 8.4 T1). 06 T4a mapped its colours to role tokens (static rule 13), restyled the read-outs (`.readout-value` primary JetBrains Mono 500) and the preview window (1 px Signal Red border, 1 px Morph Black outline, `--shadow-overlay`, `--color-scrim` bars, the grip in `currentColor`) and added `.preview-window__title` (the camera icon and "Camera View").

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
    renderOrder.js                         01 F1-1  RENDER_ORDER: every non-default renderOrder slot of every spec (01 5.5,
                                                 CR-10); static rule 11 forbids literals >= 900 elsewhere
    sectionIds.js                          2026-10-31  sectionSelectionId(id) = 'section:' + String(id), sectionKeyOf,
                                                 isSectionKey: the selection ids of wall sections (02 5.2's sectionIdOf)
  legacy/
    LegacyCompat.js                        WP3   Strategies (deep-frozen switches), LegacyProfiles, legacy helpers (orDefault;
                                                 legacyHtml deleted by 08 P2-3a), unsupportedStrategy, LEGACY_SITES
  theme/
    Theme.js                               WP3   SceneTheme, CanvasTheme, UiColors, Palette, Brand, Theme (ThemeBridge-ready shape);
                                                 06 T5: the Morph scene, canvas and status values, frameOnLight,
                                                 cameraBody.outlineColor, frustumLines.haloColor / dashSize / gapSize,
                                                 CanvasTheme.preloadFonts
    ThemeBridge.js                         06 T2  buildTheme(base, readVar, {warn, bindFonts}): a Theme-shaped, deep-frozen
                                                 theme whose colour and (since 06 T5) font leaves come from CSS custom
                                                 properties; COLOR_BINDINGS, FONT_BINDINGS, UNBRANDED, BIND_FONTS_DEFAULT,
                                                 parseHexColor, parseCssColor (pure, imports nothing; wired in App by 06 T3)
  domain/
    rules.js                               08 P2-8a  clamp, roundInt, deepFreeze: the shared numeric rules of the UI rule
                                                 tables and (from 08 P2-3b) the import validator (08 4.4; imports nothing);
                                                 08 P2-3b: sanitizeText (stripControls, truncateUnits), MAX_SECTION_ID,
                                                 isValidSectionId, createIdAllocator (07 6.8), MAX_IMPORT_BYTES and its parts;
                                                 03 T1: STAGE_POSITION_LIMIT_M (the +-100,000 m bound of 07 C22)
    WallSection.js                         WP3   WallSection entity (legacy field names, field rules, derived labels), MM_TO_M;
                                                 08 P2-8a: LIMITS, the rounding and capped field rules; 04 UV-5a: the
                                                 uvTransform accessor (a private field, not in SECTION_FIELDS) and
                                                 setUvTransform (stores a clone)
    Wall.js                                WP3   Wall (ordered sections, id allocator, totals; the legacy flat bounds left with 08 P2-11c), WallPivot, PivotMode;
                                                 08 P2-3b: MAX_SECTIONS, canAddSection, the 07 6.8 nextSectionId;
                                                 08 P2-3b2: allocateId (07 6.8 nextFree over the live ids);
                                                 03 T1: the WallPivot API and rules, PIVOT_MODES, PIVOT_OFFSET_LIMIT_M
    Project.js                             WP3   Project aggregate, DisplaySettings (content enum), ContentMode, PanelIdStyle;
                                                 03 T1: DisplaySettings.showPivotMarker, DEFAULT_SHOW_PIVOT_MARKER;
                                                 04 UV-5a: Project.uv (a UvSettings, injected, never replaced)
    UvSettings.js                          04 UV-5a  UvLayout, PanelUvMode, UvTransform (04 4.1: rules, identity,
                                                 isIdentityFor, summaryFor, JSON shapes), UvVertexEdits (per-vertex
                                                 base-space deltas, bound to a grid size) and UvSettings (combinedLayout
                                                 'per-section' | 'atlas', panelUvs 'section' | 'panel', gltfCanvasTexcoord1);
                                                 session-only until 04 UV-5c (project file v2)
    LogoLibrary.js                         WP3   Section logos keyed by section id (plain-object key semantics)
    CineCamera.js                          WP3   Film camera: lens, pose, enabled flag, FILMBACK_PRESETS, FOV/safe-D math,
                                                 field rules, gizmo/pilot pose arithmetic; 03 T1: LIMITS, translateStage, the posZ
                                                 rule's wall-plane context; 08 P2-11a: coverage() moved to FrustumCoverage;
                                                 08 P2-11c: resetTo(framing), the posZ rule without minimum, RESET_DISTANCE_M
    Prop.js                                WP3   Prop base (pose, visibility, field rules, gizmo arithmetic), PersonProp, CarProp;
                                                 03 T1: LIMITS, translateStage
    DebugViewSettings.js                   01 F1-1  DebugShading, SHADING_CYCLE, DebugViewSettings (normals debug view
                                                 preferences; not persisted)
  geometry/
    WallLayout.js                          WP4   The single cursor walk: computeWallLayout, layoutProject, framingBounds,
                                                 SectionLayout, WallLayout (flatEdges, firstEdge/lastEdge, bounds, pivotPoint);
                                                 03 T2: baseY, generativeBounds, translated, resolvePivot, stageShift, the
                                                 frames of layoutProject; 08 P2-11a: columnQuads, worldVertices (memoised per
                                                 instance), extentAcross, chordFacing; 08 P2-11c: framingBounds 'layout'
                                                 (FramingPolicy's generativeBox, wallBox, stageExtent; memoised per layout);
                                                 F3-O2: rotated, the orientation of resolvePivot, yawShift, stageChange,
                                                 layoutProject's turn of the stage and export frames
    WallOrientation.js                     F3-O2  The whole-wall orientation's geometry (03 12.2): yawTrig (exact at
                                                 quarter turns), turnXZ, azimuthDeg, wallCentre (the arc-length midpoint of
                                                 the bottom edge chain and its LED normal), alignmentYawDeg; imports
                                                 domain/rules
    WallMeshBuilder.js                     WP4   quadIndices + WallMeshBuilder: the one owner of winding, normals, UVs, panel quads;
                                                 maxIndexOf, indexWidth (index component width, 08 P2-1b); 04 UV-6: the
                                                 SectionUvPlan uv option, sectionUvs, combinedGrid(layout, atlas, plans) with
                                                 the case 'plan', panelUvs(panel, sl, plan)
    TextureAtlas.js                        WP4   computeAtlas (LED totals, px/LED, start columns, x offsets, UV offsets),
                                                 sectionPxPerLed, panelPxPerLed (wall-wide budget since 08 P2-12d);
                                                 CANVAS_HARD_LIMITS, canvasFits (08 P2-1c); 04 UV-7: sectionTextureScale (the
                                                 16 MP viewport budget of every section canvas, 04 6.4)
    UvMapper.js                            04 UV-6  The UV transform maths of 04 6.3-6.8: applyUv / invertUv (identity
                                                 short-circuit), planSectionUvs / planSectionUv (the SectionUvPlan of every
                                                 consumer), sectionUv, sectionGridUv (vertex edits), presets,
                                                 quarterTurn, pixelAccuracy, drag maths, the vertex maths (warp / unwarp,
                                                 uvDeltaToBase)
    PixelMap.js                            04 UV-6  Base UV <-> pixel / panel / atlas pixel, wallPointFromBaseUv (04 6.10),
                                                 describeHit (hover), pixelMapJson (the derived 4.2 blocks)
    TextureBudget.js                       08 P2-12d  07 X3's module, delivered early: SECTION_TEXTURE_BUDGET_PX,
                                                 PANEL_TEXTURE_BUDGET_PX (wall-wide), MAX_CANVAS_SIDE, panelModePxPerLed
                                                 (07 6.12; imports nothing)
    PanelNaming.js                         WP4   Column letters, panel labels, export object names, filename sanitising, texture names
    NormalLines.js                         01 F1-1  Normal-line arithmetic: auto length, cap + decimation stride, line counts,
                                                 vertex / face line writers (no allocation), upload size, stats text
    SafeDistanceBand.js                    08 P2-5b  buildSafeDistanceBand: the mitred, clamped safe-distance band of one
                                                 polyline (every triangle +Y, clamped offsets counted); bandRunOfLayout
    PreviewFit.js                          07 R2  The preview's per-axis window clamps (B-L32), letterbox (B-M9) and the
                                                 integer device-pixel rects of the scissor pass (07 6.1); imports domain/rules
    FrustumCoverage.js                     08 P2-11a  analyzeCoverage: the rotation-aware coverage of the film camera (five
                                                 rays and the projected-quad overlap over WallLayout.columnQuads(), D0, the
                                                 statuses offWall/within/offCenter/exceeds, the corner depths); cameraBasis,
                                                 nearestHit, frameDistance, quadOverlapsFrame, MAX_FRUSTUM_DEPTH_M (imports
                                                 nothing)
  render/
    ResourceTracker.js                     WP6   disposeObject3D(root, {maps}) + ResourceTracker; 04 UV-7: disposeObject3D
                                                 de-duplicates geometries, materials (Material[] members) and maps
    SceneManager.js                        WP6   Scene, main camera, renderer, lights, grid, axes (explicit init()), helper registry,
                                                 LAYERS, grid toggle, resize, render loop; 03 T5: addPreRender (07 C46); 07 R1:
                                                 LAYER_MASKS, addHelper(o, {layer}), tagHelper, per-frame layer enforcement,
                                                 withPassHidden, setHelpersVisibleInMain, the ?debug=1 helper audit; 2026-10-31:
                                                 fitContainer() and observeResize() (one ResizeObserver on the viewport)
    LEDWallView.js                         WP6   Wall + frame groups from a WallLayout; mode dispatch; mesh tagging; section nodes;
                                                 debug-shading override and withContentMaterials (01 F1-1); 06 T5: each
                                                 section's frames in its adaptive frame colour; 04 UV-7/UV-9: UVs from the
                                                 rebuild's UV plans, one combined geometry group per section, budgeted
                                                 section canvases, the per-panel option uv.panel_uvs = 'panel'; 04 UV-11:
                                                 updateSectionUvs (the live path, 6.12), resolveHit and panelCornersWorld
                                                 (6.9), sectionNodes' vertexRange
    UvHighlightView.js                     04 UV-15  The hovered panel's outline on the wall: one closed THREE.Line, no depth
                                                 test, RENDER_ORDER.UV_HOVER_OUTLINE, a HELPERS helper (UV_HOVER_CHANGED)
    SectionHighlightView.js                2026-10-31  The selected section's tint and two-tone outline (halo + dashed
                                                 core, one closed THREE.Line, RENDER_ORDER.HIGHLIGHT_HALO / SECTION_HIGHLIGHT)
                                                 from layout.worldVertices(); a HELPERS helper, lazy; SELECTION_CHANGED, WALL_REBUILT
    frameColor.js                          06 T5  relativeLuminance, contrastRatio, frameColorFor: the adaptive panel-frame
                                                 colour (06 6.7; pure, imports nothing)
    MaterialOverride.js                    01 F1-1  Stash / restore of mesh materials under a shared override material
    DebugMaterials.js                      01 F1-1  Lazily created face-orientation and normal-colour ShaderMaterials, line material
    NormalsDebugView.js                    01 F1-1  Merged normal-line LineSegments on LAYERS.DEBUG since 07 R1 (WALL_REBUILT subscriber)
    LEDMaterialFactory.js                  WP6   The only constructor of wall materials (panel IDs > LED sim > colour); 04 UV-7:
                                                 combined(sections, atlas, layout, sectionScale) -> Material[] per section in
                                                 the per-section layout; section/sectionShared take the budgeted scale
    textures/LEDPixelTextureFactory.js     WP6   installCanvasPolyfills, LED tile cache, 5 tile painters, tiled clones; 04 UV-12:
                                                 tileCanvas (the plain tile canvas of the UV viewer, no texture)
    textures/PanelIdRenderer.js            WP6   Panel / section / atlas panel-ID canvases (styling, section names, logos);
                                                 06 T5: takePendingFonts (the font gate's (font, text) pairs)
    CameraRigView.js                       WP7   Film-camera rig: body (pick target), frustum lines + fill, transform; lens event;
                                                 06 T5: the body's edge outline, the two-tone frustum (halo + dashed core);
                                                 08 P2-11b: each far corner at the analyser's depth (the frustum ends at the
                                                 wall), MAX_FRUSTUM_DEPTH_M
    SafeDistanceView.js                    WP7   Safe-distance floor band, outline, "Max" sprite; exposes its group for OBJ export
    PreviewWindow.js                       WP7   The preview window's DOM: display, inline size, resize handle (07 R2: per-axis
                                                 clamps), the labels, the placeholder's client rect (no renderer since 07 R2)
    PreviewPass.js                         07 R2  The camera preview as a scissor pass of the main renderer (one WebGL
                                                 context): the preview camera (DEFAULT | ENVIRONMENT), letterbox, labels
    PropViews.js                           WP7   PropView base, PersonPropView, CarPropView (procedural meshes)
    PivotMarkerView.js                     03 T5  The pivot marker: two-tone glyph (dashed cross, octahedron core), pick proxy,
                                                 drop line, anchor ghost and link; stage frame, LAYERS.HELPERS, 996; min size
  interaction/
    InputState.js                          WP8   InteractionState, KeyboardState, PointerRay (one shared Raycaster), target guards
                                                 (the shortcut guard re-exports core/typingTarget.js since 08 P2-9b); 03 T5:
                                                 gestureCancelled, snap, the ray tests every layer
    OrbitController.js                     WP8   Custom spherical orbit: drag, wheel, WASD/QE offset, presets, retarget, snapshot
    SelectionManager.js                    WP8   Selectable registry, selection state, raycast picking; Selectable typedef;
                                                 03 T5: the path-B hook set, kind, the pick priority rule, SELECTION_CHANGED.modes;
                                                 04 UV-11 (path B of 07 I2): addObserver (after every select / deselect),
                                                 addHoverHitObserver (inert until spec 02's hoverAt)
    WallHoverProbe.js                      04 UV-15  The UV viewer's wall hover in its own-raycast mode: one raycast per frame
                                                 of the front LED meshes while the viewer is open; double-click to view
    TransformGizmo.js                      WP8   Hand-written translate/rotate gizmo bound to the selected Selectable; 03 T5: the
                                                 shared hook lifecycle, cancelDrag, allowedAxes, snap, the pivot re-anchor
    PilotController.js                     WP8   PilotCameraDriver (drives the main camera) + PilotController (toggle, look, fly, speed)
    ViewportInput.js                       WP8   Shortcut keys (G/R/L/P/Esc; 03 T5: O, the Escape cancel) + canvas pointer routing
                                                 (pilot | gizmo | pick; 03 T5: the swallowed gesture); 04 UV-12 (path B):
                                                 U (commands.toggleUvViewer, not in pilot mode), handlesDoubleClick
  io/
    ProjectSerializer.js                   WP5   Project JSON v1 write ('file' | 'zip' variants) and read; version dispatch seam;
                                                 08 P2-3b: read = detectVersion -> migrateV1toV2 -> validateProject
    ProjectSchema.js                       08 P2-3b  The validator's rows (FORMAT, MESH_MODES, LIMITS = WallSection.LIMITS,
                                                 SECTION_NUMBER_ROWS, labels) and sectionsFromProject (07 4.4 rule 3)
    ProjectMigrations.js                   08 P2-3b  detectVersion (07 4.6), migrateV1toV2 (07 6.9), ImportMessages, isPlainObject
    ProjectValidator.js                    08 P2-3b  validateProject (07 4.7, 6.7, 6.8; the wall subset of 07 D2), formatValue
    ObjExporter.js                         WP5   OBJ + MTL text (combined / section / panel) + safe-distance OBJ text; 04 UV-8a,
                                                 UV-9: vt from the export UV plans (uvSettings, uvPlans), map_Kd by 04 7.1
    GltfExporter.js                        WP5   glTF 2.0 JSON with embedded base64 buffer (combined / section / panel); 04 UV-8b,
                                                 UV-9: TEXCOORD_0 from the export UV plans, TEXCOORD_1 = the combined canvas, and with
                                                 `textures` (the ZIP) images, one sampler, baseColorTexture, KHR_materials_unlit
  app/
    App.js                                 WP10  Composition root: construct -> bootstrap (init, setupUI, setView)
    WallController.js                      WP9   Wall use cases + rebuild pipeline (legacy createLEDWall) + stats; 04 UV-11:
                                                 addRebuildObserver (P1 step 5b, commitRename's onSectionRenamed)
    UvController.js                        04 UV-11  The UV use cases (5.3): viewer commands, field preview / commit / cancel,
                                                 flips, feed turns, Source, presets, nudges, Copy to all, drags, undo / redo,
                                                 settings, hover; the live path of 6.12 (no rebuild); a selection and a
                                                 rebuild observer; emits UV_TRANSFORM_CHANGED and UV_SETTINGS_CHANGED
    SectionSelection.js                    2026-10-31  Wall sections as Selectables (kind 'section', no gizmo): the pick
                                                 provider of SelectionManager (view.meshes(), view.sectionOfHit) and a rebuild
                                                 observer (prune after edits and renames, deselect after an import)
    UvViewModel.js                         04 UV-11  The viewer state (in memory) and SectionUvData, chips and background
                                                 canvases (4 MP budget); emits UV_VIEWER_CHANGED, UV_DATA_CHANGED,
                                                 UV_HOVER_CHANGED
    UvFallbackHistory.js                   04 UV-11  Path B: the UV-only undo stack (record / undo / redo, labels, 750 ms
                                                 coalescing, prune, clear); replaced by 07's History in 04 UV-18
    CameraController.js                    WP7   CameraHub (legacy updateCameraFrustum + updateSafeDistance) and CameraController
                                                 (preview/lens/pose use cases, Selectable 'camera')
    PropController.js                      WP7   Prop use cases (show/hide, fields, transform, Selectable 'person'/'car')
    PivotController.js                     03 T4  Wall-pivot use cases through P-PIVOT (mode, offset, reset, keep-stage and
                                                 marker toggles, Ctrl-drag snap step, O-key selection toggle) and the
                                                 Selectable 'pivot' (the path-B hook set, relative drag snapping)
    ProjectIO.js                           WP5   Downloader + export/import use cases (JSON, OBJ, glTF, PNG, ZIP, safe-distance OBJ)
    DebugViewController.js                 01 F1-1  Debug-view use cases: settings write, DEBUG_VIEW_CHANGED (the bus since 01 F1-2),
                                                 then the render call
    fontGate.js                            06 T5  runFontGate: loads the canvas preload fonts and the pending (font, text)
                                                 pairs, then rebuildIfPanelIds once if any was pending (6.2 row F6-1)
  ui/
    dom.js                                 WP3   byId, flipToggle, setDisplay, createDialogs; 08 P2-3a: escapeHtml (B-M4)
    HeaderStats.js                         WP9   #total-pixels / #total-panels / #total-sections / #total-arc
    SectionListPanel.js                    WP9   #wall-sections cards (verbatim templates; 06 T1: the offset hint's class;
                                                 06 T4c: "Panel Angle (°)", "Panel Colour", title "Custom colour"; 06 T7:
                                                 the swatches from the injected palette's cardSwatches), card handlers,
                                                 collapse snapshot/restore, #add-section-btn; 04 UV-14: the card's UV
                                                 Mapping row (summary, Edit UVs…; UV_TRANSFORM_CHANGED mirror)
    SectionLogosPanel.js                   WP9   #section-logos-container rows (verbatim template; 06 T1: logo-row classes instead
                                                 of the inline styles; 06 T4c: the "Centre" position labels) +
                                                 upload/clear/position/scale
    WallDisplayPanel.js                    WP9   Mesh-mode labels, wireframe/frame, LED sim + layout, panel IDs + styling inputs;
                                                 04 UV-14: #uv-options (combined layout, panel UVs, glTF canvas TEXCOORD_1, the
                                                 atlas note; UV_SETTINGS_CHANGED mirror)
    FloatingPanel.js                       04 UV-10  A movable, resizable, closable panel in the viewport: focus handling, the
                                                 <= 900 px bottom sheet, re-clamping, the auto-offset above the preview window
    UVViewer.js                            04 UV-12  #uv-viewer and #toggle-uv-viewer: selects, fields, buttons, chips, readout,
                                                 canvas gestures and the focus-scoped keys (3.6 path B); the UV event mirrors
    UVCanvas.js                            04 UV-12  The viewer's 2D canvas: view transform, drawing (6.11), handle hit-testing,
                                                 data-island
    CameraPanel.js                         WP7   Camera Frustum Preview section: toggles, lens, pose inputs, readouts, reset,
                                                 safe-distance controls; 03 T4: the #camera-pos-z min (removed by 08 P2-11c); 03 T6: "Distance to wall
                                                 plane" (#camera-wall-distance), the "Z Position (m)" label (markup)
    PropsPanel.js                          WP7   PropControls (one instance per prop prefix 'person' | 'car')
    PivotPanel.js                          03 T6  The Wall Pivot section: mode radios, offsets, Reset, Select pivot (O), the
                                                 Ctrl-drag snap, the keep-stage and marker switches; payload-derived readout
                                                 and status (pivotReadoutText, pivotStatusText, rebuildStatusText); F3-O6:
                                                 the Orientation block (#pivot-align, #pivot-yaw-offset, yawReadoutText)
    Collapsible.js                         F3-O8  The collapsible sidebar cards (Mesh Options, Wall Pivot; collapsed at
                                                 start): bindCollapsibles(root), setCollapsibleExpanded(card, on); the title
                                                 is a native button (aria-expanded, aria-controls); no model state
    SidebarToggle.js                       2026-10-31  #sidebar-toggle (chevron handle on the viewport's edge) shows / hides
                                                 #control-panel (open by default; .sidebar-collapsed on .app-container);
                                                 onLayoutChange = sceneManager.fitContainer(); no model state, no events
    SectionContextMenu.js                  2026-10-31  The section menu of a right click (Change settings, Edit UVs…,
                                                 Deselect): role="menu" in the viewport, arrow keys, Escape, outside-click /
                                                 wheel / resize close; menuKeyAction, clampMenuPosition
    ViewportToolbar.js                     WP8   View presets, grid button, gizmo buttons, selection badge, pilot banner
    ExportPanel.js                         WP5   Export buttons, #import-json -> #import-input, file input change
    DebugViewControls.js                   01 F1-2  #toggle-normals, #debug-view-btn, the debug popover, #debug-view-legend
                                                 (in #viewport-top-stack), #debug-view-status; N / Shift+N; DEBUG_VIEW_CHANGED mirror
```

During integration only, `js/legacy/monolith.js` (WP10) temporarily holds the verbatim legacy script (step I-1) and is deleted in step I-2.

### 2.3 Tests and tools

```
tests/
  regression/                              existing golden-master harness (run.mjs, compare.mjs, lib/...)
    scenarios.mjs                          WP1 (edit: registers the extra scenarios); 08 P2-0 (registers the Phase 2 scenarios);
                                                 B2-0: registers the platform scenarios last;
                                                 06 T7: the ui_sections swatch click by index (the 4th swatch), the one
                                                 person predicate isPersonPixel for the Studio Grey wall (also gizmo_drag's
                                                 isPerson), debugDump (REGRESSION_DEBUG_DIR) for every person pick
    compare.mjs                            WP1; 08 P2-0: `--expect` expected-change manifests and the `JITTER` status from
                                                 expected/_nondeterminism.json (08 8.2; the Phase-1 WARN_ONLY list is gone);
                                                 01 T2: `exclude`, the rect allowances `rects` + `size` (per-pixel rule,
                                                 frame-size check) and --diff-bbox; 06 T1: --ignore-keys a,b (drops those
                                                 JSON keys on both sides: the class-key cross-check of 06 8.4); 06 T6b:
                                                 --rename old=new[,...] (the baseline's download names, ZIP entry names and
                                                 file-name tokens mapped first: the identity check of the rename)
    measure-rects.mjs                      01 T2  writes the measured `rects` and `size` of the manifest entries that
                                                 carry a `measure` object (DOM rects of the candidate page per frame)
    lib/palette.mjs                        01 T2  livePalette(app): probe colours from the running page (section colours,
                                                 --scene-* tokens, else the served SceneTheme), never literals (07 C53);
                                                 06 T5: frameOnLight (--scene-frame-on-light)
    lib/probe.mjs                          01 T8  pixel probes of normals_debug: colorMask, largestComponent, probePoint,
                                                 sampleRGB, classifyFace, diffStats, withinJitter, readProbePalette
    lib/server.mjs                         WP1 (conditional edit: optional port argument for tools/serve.mjs; default unchanged)
    lib/inject.mjs                         WP1 (downloads, dialogs); B2-0: the HTMLCanvasElement#getContext hook,
                                                 window.__glCanvases() (each canvas that got a WebGL context; 07 AC 1)
    lib/app.mjs, lib/recorder.mjs          08 P2-0: the opt-in request log (`recordRequests`, network.json), AppPage.reload();
                                                 08 P2-6e: OBJ_ZIP_DOWNLOAD, the one-ZIP download options of every Export OBJ step
                                                 (keeps the dialogs of the page it leaves: dialogs.json lists every page's);
                                                 01 T8: screenshotElement, pointerClick, overlayRects, keyPress modifiers / noText
                                                 and the keys n, Enter, ArrowDown (unchanged events for every existing call);
                                                 06 T4a: FONT_PRELOADS + Montserrat (bold, 600, 400); 06 T5: the Outfit
                                                 entries dropped; 03 T8: keyPress repeat (CDP autoRepeat), the keys o and
                                                 Tab, AppPage.drag(x, y, dx, dy, steps, {modifiers, beforeRelease}) moved
                                                 from scenarios-extra.mjs (the same events without options)
    ui-spec.mjs, lib/uiprobe.mjs           WP1   the ui_visual probes; 06 T4a: CSS_TOKENS = the layer-3 role tokens,
                                                 page/brand-lockup and page/product-name replace the four logo entries,
                                                 the overlay/company-logo entries deleted, header.logo reads .product-name,
                                                 FONT_FACES + Montserrat 400-700; 06 T4b: page/brand-wordmark,
                                                 page/brand-monogram, page/brand-divider (with product-name, recorded in the
                                                 narrow state), overlay/brand-watermark, header.brandAlt; 06 T5: FONT_FACES =
                                                 JetBrains Mono 400-700 and Montserrat 400-700 (Outfit dropped)
    scenarios-extra.mjs                    WP1   logos, gizmo_drag, pilot_look, preview_off_in_pilot, import_edge,
                                                 name_with_panel_ids, preview_resize; 01 F1-3: normals_debug (01 8.2: content
                                                 probes on every page, the debug view on the module build); 06 T5: the
                                                 gizmo_drag colour matchers for the Morph scene (isCameraBody for the opaque
                                                 Signal Red body, isGizmoRed g >= 24 against its anti-aliased edges); 03 T8:
                                                 its three drags call AppPage.drag
    scenarios-phase2.mjs                   08 P2-0  the eight p2_* scenarios of 08 8.3, captured against the unfixed code;
                                                 B3-0: p2_true_framing (Reset, coverage, D and the frustum on the 18-degree
                                                 half circle and a wall along +Z, a camera behind the wall), before 08 P2-11
    scenarios-features.mjs                 03 T8  the five pivot_* scenarios of 03 8.3 (forward goldens; pivot_roundtrip and
                                                 pivot_validation in their session-only form until 03 T7), with the offset
                                                 and cancel post-checks
    scenarios-platform.mjs                 B2-0  07 8.3's preview_clean and preview_compositing (the owner's stale-rectangle
                                                 report of 2026-10-17), captured on the two-canvas build before 07 R2
    scenarios-uv.mjs                       04 UV-16  uv_layouts, uv_transforms, uv_viewer, uv_hover (04 8.2; forward goldens;
                                                 the criterion 4 / 19 screenshot pairs judged in place as *_pair states)
    expected/                              08 P2-0  <commit-id>.json expected-change manifests (one per golden-changing commit,
                                                 any spec); _nondeterminism.json, the only standing allowance
    README.md                              WP1 (edit: documents the extra scenarios); 08 P2-0 (Phase 2 scenarios and the
                                                 "Phase 2 re-baselining" procedure)
  static/
    check.mjs                              WP1   layering, DOM-id ownership, call-time globals, import case, LEGACY parity,
                                                 Strategies references, event subscribers, module-level state, domain field writers;
                                                 01 F1-1: rule 11, no renderOrder literal >= 900 outside core/renderOrder.js;
                                                 01 F1-2: App.js looks up exactly eight ids (rule 4: + #debug-normals-stats);
                                                 06 T1: rule 12 (06 R-B2), the inline style="" attributes of index.html
                                                 declare only display / width / height, without tokens or colour literals;
                                                 06 T4a: rule 13 (R-B1, no colour literal in a CSS declaration value outside
                                                 css/02-tokens.css), rule 14 (R-B3a, no legacy token name, third-party logo or
                                                 legacy cyan in index.html, css/, js/), rule 15 (R-B5, one export-btn--primary
                                                 element and one var(--cta-background) declaration); 06 T4b: rule 16 (R-B4,
                                                 every assets/brand/ reference case-exact, every brand file but NOTICE.md
                                                 referenced); 06 T6b: rule 17 (R-B3b, no legacy product or file name: Outfit,
                                                 LED Wall Configurator, led-wall-config, led-wall-export, the whole tokens
                                                 panel-ids.png, PanelIDs_Atlas.png, safe-distance-floor.obj, with the token
                                                 boundary of compare.mjs --rename: panel-ids.png.bak does not match);
                                                 03 T6 (03 8.2): rule 18 (the pivot markup: no pivot-* + mesh-mode-* class, no
                                                 data-mode on a pivot element, no inline style in #pivot-section or on the
                                                 distance row, the frozen help-badge text of 07 C35), rule 19 (the pivot radios
                                                 never display: none), rule 20 (isDraggingGizmo, gestureCancelled and snap
                                                 written only by TransformGizmo)
    fixtures/                              WP1   synthetic trees used to self-test check.mjs (06 T1: + index.html in good/bad;
                                                 06 T4a: + css/ in good/bad, the bad tree's legacy residue; 06 T4b: +
                                                 assets/brand/ in good/bad; 06 T6b: the bad tree's legacy names, and its
                                                 near misses, which the self-test asserts are not reported (CLEAN_IN_BAD); 03 T6:
                                                 the bad tree's pivot markup, radio and state-writer cases, the good tree's
                                                 correct pivot markup, css/features/pivot.css and a hidden mesh-mode radio)
    css-slices.mjs                         WP2   proves css/01-*.css .. css/12-*.css == original lines 12-869 (normalised) in
                                                 link order (normalisation: CSS whitespace only, i.e. space, tab, LF, CR, FF;
                                                 each file must hold exactly one leading header comment and no other comment);
                                                 01 F1-2: scoped to the 01-12 slices (07 S7), so css/features/ is never scanned;
                                                 06 T1: --report-only (07 S7: every difference is printed, exit 0), the gate
                                                 mode since 06 T1 changed the slices
  unit/                                    run with: node --test "tests/unit/**/*.test.mjs"
                                           (quoted glob, Node 22.7+: `--test` globs need Node 21+, and the repository has
                                           no package.json, so the typeless js/*.js modules load as ESM only through
                                           module-syntax detection, unflagged since Node 22.7; `node --test tests/unit/`
                                           FAILS on Node 21+ because arguments are globs, not directories; the glob skips
                                           oracle/*.mjs)
    core.test.mjs                          WP3   EventBus semantics, LegacyCompat helpers, LEGACY_SITES shape
    domain.test.mjs                        WP3   rule tables vs legacy expressions, Wall/CineCamera/Prop/LogoLibrary semantics
    oracle/legacy-geometry.mjs             WP4   verbatim THREE-free copies of the legacy layout walks and grid builders
    collapsible.test.mjs                   F3-O8  ui/Collapsible (click flips class, aria-expanded and hidden) and the two
                                                 collapsed cards of index.html
    orientation.test.mjs                   F3-O1  the whole-wall orientation (03 12.12): the domain rules (test 1);
                                                 F3-O2: wallCentre, the alignment yaw (the flat wall exactly +90 on x = 0, the
                                                 symmetric concave middle on -X, asymmetric and multi-section walls, the empty
                                                 wall), the turned stage and export frames, yawShift, stageChange (tests 2-4);
                                                 F3-O3..O7: rigid re-expression, setAlign / setYawOffset, the turned drag, the
                                                 aligned Reset and frontZ, the OBJ / glTF orientation metadata, createNew
    pivot.test.mjs                         03 T2  Feature 3's geometry (03 8.1 tests 1-9): the 6.8 anchors, resolvePivot,
                                                 stageShift, the frames of layoutProject, translated(), the export frame of
                                                 the grids and panel corners, the framing ('flat-pivot', then 'layout' since
                                                 08 P2-11c: step F), the composition contract with
                                                 spec 02 (a stub offset builder; spec 02's E17); test 9 skipped (B-L1 kept)
    pivot-panel.test.mjs                   03 T6  PivotPanel (03 8.1 test 17: the status from the payloads, twice each; the
                                                 readout texts; the mirrors and listeners with the real controller: the
                                                 radios, the offset write-back of AC 8, the switches' click / Space / Enter,
                                                 Select pivot, the snap step, the import reset) and #camera-wall-distance
    pivot-marker.test.mjs                  03 T5  PivotMarkerView (test 15's marker part): no allocation before init, the
                                                 stage-frame glyph / ghost / drop / link, visibility and selected colour, the
                                                 preview, the minimum screen size, null resolution, order, layers, two-tone
                                                 dashes, dispose; SceneManager.addPreRender and App's registration
    gizmo.test.mjs                         03 T5  The shared path-B gizmo lifecycle (hooks, ctx, cancelDrag, detach, allowedAxes,
                                                 setSnapIncrements), test 19 (gesture swallowing with a real orbit and router)
                                                 and test 20 (the WALL_REBUILT re-anchor with real WallController/PivotController)
    selection.test.mjs                     03 T5  test 18: kind required, the pick rule (priority only against wall hits), modes
    viewport-input.test.mjs                03 T5  test 16: the O key and its guards, the Escape order, the router's swallowing
    fixtures/fake-three.mjs                03 T5  a small, mathematically real three.js stand-in (vectors, plane, ray, layers,
                                                 objects, materials, buffer geometry) for those tests
    pivot-controller.test.mjs              03 T4  PivotController (03 8.1 tests 10-15): P-PIVOT's order and re-expression,
                                                 keep off, Y-only offsets, the toggles and snap step, toggleSelect, the
                                                 Selectable hooks, relative drag snapping and cancel, the wall-centre add,
                                                 a null resolution; CameraPanel's #camera-pos-z min and the 'pivot' pose mirrors
    geometry.test.mjs                      WP4   Object.is equality vs the oracle over fuzzed sections (strings, fractions, NaN ids);
                                                 since 08 P2-0 the oracle builders are injected with LegacyProfiles.mesh.*;
                                                 08 P2-12d: panelUvs, TextureBudget and the wall-wide panelPxPerLed (07 6.12);
                                                 08 P2-7a: uvHeight, the pixel-accurate combined UVs, vertex ranges,
                                                 sectionRangeForFace
    oracle/legacy-io.mjs                   WP5   verbatim THREE-free copies of generateAllSectionsGeometry, OBJ, glTF, JSON writers
    io.test.mjs                            WP5   byte equality vs oracle (LegacyProfiles.mesh.*, since 08 P2-0) and vs golden
                                                 harness files (GOLDEN_DIR; Strategies.mesh.*); since 08 P2-1b it writes the
                                                 synthetic 70,000-vertex glTF to the git-ignored unit/out/ (manual validator check)
    camera-hub.test.mjs                    WP7   CameraHub/CameraController pipeline order with spies
    wall-controller.test.mjs               WP9   rebuild policy: run counts and tile-cache clears for the 24 legacy sites
                                                 (06 T5: and row F6-1 through runFontGate);
                                                 legacy parity runs the legacy source with TEMPLATE_EDITS applied (06 T1: the
                                                 class map of the logo rows and the offset hint; 06 T4c: the British copy of
                                                 the card and of the logo position options)
    compare.test.mjs                       08 P2-0  compare.mjs --expect semantics and JITTER on synthetic output trees;
                                                 01 T2: rects, size, exclude and --diff-bbox on synthetic PNG pairs;
                                                 06 T1: --ignore-keys; 06 T6b: --rename (output keys, ZIP entries, file-name
                                                 tokens; usage errors)
    normal-lines.test.mjs                  01 F1-1  NormalLines: auto length table, strides, 6.6 line counts, writers, stats
                                                 strings, the AC 14a cap benchmark (200 sections x 50x20)
    material-override.test.mjs             01 F1-1  MaterialOverride with plain objects (Material[] kept; restore before dispose)
    led-wall-view.test.mjs                 01 F1-1  LEDWallView debug shading and withContentMaterials (fake THREE);
                                                 03 T3: no wall root transform in any mode and pivot (07 C32)
    debug-view-controller.test.mjs         01 F1-1  DebugViewController: model write, then exactly one render call (spies);
                                                 01 F1-2: exactly one DEBUG_VIEW_CHANGED between the two (R2)
    debug-view-controls.test.mjs           01 F1-2  DebugViewControls on a fake DOM: N / Shift+N filters (typing target,
                                                 modifiers, repeat), popover open/close focus, the open-only capture Escape
                                                 listener, the pointer-change blur rule and its flag clearing, the mirror, the
                                                 400 ms announcer, popover placement; F1-2c: imports only core/ and ui/dom.js
    harness-lib.test.mjs                   01 T2  measure-rects.mjs (measure objects, rectangles, formatting) and
                                                 lib/palette.mjs (colour parsing, token / SceneTheme resolution); 01 T8:
                                                 lib/probe.mjs on synthetic images; 03 T8: AppPage.keyPress (repeat, o, Tab)
                                                 and AppPage.drag on a recording fake page
    tools.test.mjs                         08 P2-0  tools/check-orientation.mjs and tools/check-gltf.mjs on hand-built files;
                                                 since 01 T1 the ZIP and directory forms, and tools/make-cap-wall.mjs against
                                                 the committed fixture
    export-orientation.test.mjs            01 T1  the orientation oracle (01 AC 1): every OBJ/glTF under GOLDEN_DIR, ZIP
                                                 entries included (the open 08 defects listed with their fixing commit),
                                                 and 500 seeded integer walls through the OBJ and glTF writers, all modes
    typing-target.test.mjs                 08 P2-9b  the 07 3.8 truth table of core/typingTarget.js (plain objects) and the
                                                 InputState re-exports (fake THREE)
    uv-mapper.test.mjs                     04 UV-5a/UV-6  UvTransform / UvSettings rules and JSON shapes, the
                                                 WallSection and Project fields; UvMapper (identity bit for bit, inverse,
                                                 rectangle and no-shear invariants, exact quarter turns and flips, presets,
                                                 pixel accuracy, drags, plans of every mode); identity plans == 'unit' and
                                                 'atlas-pixel-accurate' (Object.is), per-section islands fill 0..1, vertex
                                                 ranges, panelUvs(…, plan); PixelMap
    uv-controller.test.mjs                 04 UV-11  UvController with UvViewModel and UvFallbackHistory: drags (no rebuild,
                                                 one entry at the end, cancel), field preview / commit / cancel and
                                                 coalescing, one entry per button, Copy to all re-fit, undo / redo, one
                                                 refresh per frame, the observers, settings rebuilds, the hover readout
    led-wall-view-uv.test.mjs              04 UV-11  updateSectionUvs per mode (ranges, updateRange union, no allocation,
                                                 LED-mask no-op), resolveHit (strips, panel planes, uMirrored), panelCornersWorld
    floating-panel.test.mjs                04 UV-10  defaultRect / clampRect, mount idempotent, auto-offset, user move, sheet
    wall-hover-probe.test.mjs              04 UV-15  one raycast per frame, skips, back faces, setEnabled, dblclick
    validator.test.mjs                     08 P2-3b  the import pipeline (08 4.3, 8.4): detectVersion, migrateV1toV2 and
                                                 validateProject row by row with the 07 issue shape and the 3.3 texts, ids
                                                 (07 6.8), idempotence over 2,000 seeded documents, the harness configs (no
                                                 correction), the reachability of every card-rule value, no prototype pollution
    frustum-coverage.test.mjs              08 P2-11a  analyzeCoverage (08 6.10, 8.4): unrotated poses on flat3 equal the
                                                 legacy numbers and status bit for bit (a frame off the wall is offWall), a
                                                 90-degree pan, tilt 90 and a camera behind the wall are offWall, box-corner hits
                                                 pick the nearest quad, the projected-quad overlap, camera-space corner depths,
                                                 03 6.8's re-expression, equivariance under a yaw of wall and camera;
                                                 WallLayout.columnQuads (memoised), worldVertices, extentAcross, chordFacing
                                                 and their postTransform; 08 P2-11c: the layout framing (flat walls bit for
                                                 bit, 03 test 21, AC 42/43, Reset under a yaw, the stage extent, the
                                                 fallback), wrapDeg, finiteOr, the Z rule
    safe-distance-band.test.mjs            08 P2-5b  buildSafeDistanceBand (08 6.9, 8.4): flat walls equal the legacy quads,
                                                 the mitre invariant, the worked cases (concave30 at two D, box_corner with
                                                 its documented overlap, concave_offsets, mixed), fold-back splits, facing
                                                 -1, 10,000 random walls with no -Y triangle, and the OBJ text of a band
                                                 (vn, f a//a, the # Clamped: line, the orientation check)
    materials.test.mjs                     08 P2-1d  PanelIdRenderer sizes and null canvases, LEDMaterialFactory's colour
                                                 fallback and its warning, LEDWallView's index attribute (08 P2-1e);
                                                 08 P2-12d: sectionShared, panel mode with panel IDs (one material per
                                                 section, section-space PlaneGeometry UVs; LED sim and colour unchanged),
                                                 the wall-wide per-panel px/LED; 08 P2-7e: the combined LED-sim
                                                 material (white tile x vertex colours) and the normalised tile cache key
                                                 (fake THREE installed as window.THREE)
    theme.test.mjs                         06 T2  theme/ThemeBridge (06 8.1): U1 colour parsing, U2 the bridged theme's
                                                 shape, leaf types, freezing (functions shared, never frozen) and the
                                                 --scene-frame override (AC 8), U3 missing / malformed tokens (the fallback
                                                 leaf, one warning per variable); 06 T3: U4 token parity (css/02-tokens.css
                                                 parsed, var() chains resolved, every bridged leaf Object.is its fallback),
                                                 U10 the Theme walk, U11 the UNBRANDED conventions; 06 T4a: U6 gold
                                                 exclusivity and legacy identity of the layer 1-3 tokens (CIEDE2000 >= 20
                                                 from Pivot Gold, >= 15 from the legacy cyan and magenta); 06 T5: U6 over
                                                 every token layer and the Theme colour leaves (spec 01's debug colours
                                                 exempt from the identity check only; the palette in 06 T7), and
                                                 BIND_FONTS_DEFAULT true, so U4 compares the font leaves too; 06 T6a:
                                                 U9 the brand strings (ASCII, jsonGenerator = { name: productName });
                                                 06 T6b: U9 the file names; 06 T7: U6 for the palette, U7 palette
                                                 distinctness (06 3.9's table in every vision mode, the 6.3 thresholds),
                                                 U8 the injected default colour
    contrast.test.mjs                      06 T4a  U5 contrast (spec 07's X2 file): every UI pair of 06 3.12 from the parsed
                                                 tokens (text, red text and icons, status, on-colour, Signal Red graphics on
                                                 opaque surfaces, the focus ring, the red indicators' Morph Black neighbours,
                                                 chip text over any scene, the active swatch rings) and the forbidden pairs
                                                 below 3:1 as documentation; 06 T7: the scene rows (adaptive frames >= 3.65,
                                                 the outlined camera body, the two-tone frustum, each against the background
                                                 and every palette colour; the rejected designs below 3:1)
    scene-overlays.test.mjs                06 T5  U13 frameColor.js (the palette's frame choices, textures and wireframe,
                                                 free strings, a 4,096-colour sweep >= 3.65:1) and LEDWallView's per-section
                                                 frame colours; U12 the two-tone frustum of CameraRigView (LineSegments
                                                 sharing one geometry, halo then dashed core, line distances increasing on
                                                 every segment, no LineLoop with a LineDashedMaterial) and the body's edge
                                                 outline (fake THREE with r128's computeLineDistances); B-M11 (08 P2-10a,
                                                 mechanism since 07 R1): the preview camera's mask is DEFAULT | ENVIRONMENT,
                                                 one draw through it, nothing drawn while the preview is off
    render-layers.test.mjs                 07 R1  LAYERS and the masks; addHelper's layer and per-frame enforcement,
                                                 tagHelper, 'default' roots and withPassHidden (a hidden root stays hidden,
                                                 restored when fn throws), removeHelper, setHelpersVisibleInMain, the
                                                 ?debug=1 audit; PilotController.toggle's call; the views' and App's wiring
    preview-pass.test.mjs                  07 R2  PreviewFit (per-axis clamps, letterbox within 1e-9, cssForDevicePx at
                                                 dpr 1-3, the device rects); PreviewPass.render with a fake renderer that
                                                 floors v * dpr (dpr 1, 1.25, 1.5, 2, fractional rects, three filmbacks:
                                                 exact integer rects, the aspect within 1 device px, the y flip on the
                                                 integer height, the exact restore, withPassHidden, nothing while off or
                                                 tiny, a throwing draw restores); updateCamera's legacy labels; the reduced
                                                 PreviewWindow (resize clamps, contentRect, setLabels); one WebGLRenderer
    font-gate.test.mjs                     06 T5  runFontGate with fakes (0 or exactly 1 rebuildIfPanelIds, each pending
                                                 pair loaded with its text, failures tolerated, never rejects) and
                                                 PanelIdRenderer.takePendingFonts (checked with the actual texts,
                                                 deduplicated, cleared by the take, each pair requested once)
    fixtures/legacy-brand.mjs              06 T6a  LEGACY_BRAND, the Phase-1 Brand verbatim (frozen): the brand of the
                                                 oracle-compared exporters of io.test.mjs (the oracle writes the legacy
                                                 strings); the golden comparisons use Theme.brand
    fixtures/legacy-theme.mjs              06 T3  the Phase-1 values of the UNBRANDED leaves and spec 01's face-orientation
                                                 colours (U11)
    fixtures/css-tokens.mjs                06 T4a  the :root declarations of css/02-tokens.css with var() resolution (U4,
                                                 U5, U6)
    fixtures/colour-math.mjs               06 T4a  token colour parsing, compositing, WCAG contrast, CIELAB and CIEDE2000;
                                                 06 T7: the Machado dichromacy simulation of 06 6.3 (U7)
  fixtures/
    normals-max-wall.json                  01 T1  the largest importable wall (200 sections of 50 x 20, v1, combined) for the
                                                 manual normals cap timing (01 8.3); written by tools/make-cap-wall.mjs
tools/
  serve.mjs                                WP1   zero-dependency static server for local development (correct .js MIME type)
  check-orientation.mjs                    08 P2-0  OBJ/glTF face orientation against the vertex normals (01 8.1, 08 8.2);
                                                 01 T1: ZIP entries and directories walked recursively, --failures-only
  make-cap-wall.mjs                        01 T1  writes tests/fixtures/normals-max-wall.json (--check: compares) with the app's
                                                 JSON v1 writer
  check-gltf.mjs                           08 P2-0  structural glTF subset: bounds, alignment, index values, POSITION min/max
                                                 after Math.fround, unit NORMALs, TEXCOORD_0 count, references (08 8.2)
.github/
  workflows/ci.yml                         07 G1  static checks and unit tests on pushes to refactor/** and feature/** and on
                                                 pull requests (no npm install; actions pinned by commit SHA, 07 Q13);
                                                 06 T1: css-slices.mjs --report-only (07 S7)
  dependabot.yml                           07 G1  weekly updates of the pinned GitHub Actions
index.html                                 WP10  head + markup verbatim; 12 <link>s; <script type="module" src="js/main.js">;
                                           01 F1-2: the feature markup (view divider, #toggle-normals, #debug-view-btn, the
                                                 debug popover, #viewport-top-stack with the legend, #debug-view-status), the
                                                 css/features/debug-view.css <link> before 12-responsive.css, badge " N=normals";
                                           06 T1: the css/99-utilities.css <link> last; the static inline styles became its
                                                 classes (only JS-owned display / width / height stay inline, rule 12); the
                                                 commented-out .grid-lines element removed;
                                           06 T4a: the head (title "Morph LED Configurator", valid author, description,
                                                 theme-color, color-scheme, Open Graph text, the font URL + Montserrat 400-700),
                                                 the text-only <h1 class="brand-lockup"> header, the third-party logo deleted,
                                                 #export-zip.export-btn--primary, camera SVGs instead of the emoji in the pilot
                                                 banner and the preview header, the resize grip in currentColor;
                                           06 T4b: the favicon links (64 and 128 px PNGs first, the SVG last with
                                                 sizes="any"), the apple-touch icon, og:image (absolute), the wordmark lockup
                                                 (wordmark, monogram, divider, "LED Configurator" in the <h1>) and the viewport
                                                 watermark after #pilot-info
assets/brand/                              06 T4b  the owner-approved Morph brand files (06 5.8), copied byte for byte from
                                                 the private, git-ignored "Morph Brand Assets/" (SHA-256 compared at import):
                                                 morph-wordmark-dark.svg, morph-monogram-dark.svg, morph-favicon.svg,
                                                 morph-favicon.png, morph-favicon@2x.png, morph-app-icon-dark@2x.png, plus
                                                 NOTICE.md (the Morph marks are not licensed under Apache-2.0); 06 T9 added the
                                                 two README lockups, morph-primary-horizontal.svg (light GitHub theme) and
                                                 morph-dark-event-lockup.svg (dark), the 8 files of 06 5.8. Static rule 16
                                                 keeps every reference case-exact and every file referenced
.gitattributes                             06 T4b  assets/brand/*.svg and *.png are -text: no line-ending conversion of the
                                                 published brand bytes
README.md                                  WP10  "How to run locally" section updated (static server required); 06 T9: the
                                                 Morph lockup in both GitHub themes (<picture>), the product name, the
                                                 C51622 / 0A0A0A badges, the export file names and the "Brand and licence"
                                                 section (the Morph marks are not covered by Apache-2.0)
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
  // Feature events, each classified visual or non-visual (07 C47).
  DEBUG_VIEW_CHANGED:           'debug:viewChanged',   // visual (01 F1-2): DebugViewController -> DebugViewControls
  WALL_PIVOT_CHANGED:           'wall:pivotChanged',   // visual (03 T4): PivotController, WallController.applyImport -> PivotPanel, PivotMarkerView
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

**`js/core/renderOrder.js`** (01 F1-1, 01 5.5 and CR-10; 07 0.4): the single registry of every non-default `Object3D.renderOrder` slot of every spec. Static rule 11: no numeric `renderOrder` literal >= 900 anywhere else under `js/`; lower values may be written in place and are listed here for documentation.
```js
export const RENDER_ORDER = Object.freeze({ HDRI_BACKDROP: -1e6, DEFAULT: 0, RIG_CORE: 1, INNER_FRUSTUM_OVERLAY: 990, MEASURE: 992,
  HDRI_MARKER: 993, UV_HOVER_OUTLINE: 994, NORMAL_LINES_ON_TOP: 995, PIVOT_MARKER: 996, HIGHLIGHT_HALO: 997, SECTION_HIGHLIGHT: 998,
  GIZMO: 999 });   // each slot is used by its owning spec when it lands; TransformGizmo uses GIZMO (the legacy 999)
```

### 3.3 `js/legacy/LegacyCompat.js`

The single home of every output-affecting legacy switch and helper. The file header comment points to section 8 of this document as the human-readable register.

```js
export const Strategies = deepFreeze({
  mesh: {
    viewport: { winding: 'ccw', normals: 'averaged', combinedUV: 'plan', side: 'double' },
    obj:      { winding: 'ccw', normals: 'averaged', stripNormals: 'per-vertex',
                combinedUV: 'plan', panelNormal: 'facing' },
    gltf:     { winding: 'ccw', normals: 'averaged', panelNormal: 'facing', attributes: ['POSITION', 'NORMAL', 'TEXCOORD_0'],
                combinedUV: 'plan', indexType: 'auto',
                doubleSided: 'omit' },                     // 'omit' = the material object has NO doubleSided key
  },                                               // gltf.indexType: 'auto' since 08 P2-1b (B-L5), Phase-1 'uint16';
                                                   // viewport.winding: 'ccw' since 08 P2-2a (B-H1), Phase-1 'legacy-cw';
                                                   // viewport.normals: 'averaged' since 08 P2-2b (B-L3), Phase-1 'right-panel';
                                                   // obj winding/normals/stripNormals since 08 P2-2c (B-H2), Phase-1
                                                   // 'legacy-cw' / 'none' / 'constant-z'; gltf winding/normals/attributes
                                                   // since 08 P2-2d (B-H2), Phase-1 'legacy-cw' / 'none' / ['POSITION'],
                                                   // and the new leaf gltf.panelNormal (08 P2-2d);
                                                   // viewport.combinedUV: 'atlas-pixel-accurate' since 08 P2-7a (B-M5),
                                                   // Phase-1 'atlas-u-full-v'; obj.combinedUV: 'atlas-pixel-accurate'
                                                   // since 08 P2-7b (B-M6), Phase-1 'per-section-overlap';
                                                   // gltf.attributes + 'TEXCOORD_0' and the new leaf gltf.combinedUV since
                                                   // 08 P2-7c (B-M7)
  framingBounds: 'layout',                         // since 08 P2-11c (B-L2, B-M10): FramingPolicy's three named boxes of
                                                   // the stage layout; Phase-1 'flat', 03 T2's 'flat-pivot' (both deleted)
  curveBeforeFirstPanel: true,                     // B-L1
  gizmoRotateSign: -1,                             // B-M12
  pilotForwardYSign: -1,                           // B-M13
});                                                // dispose.wallTextures / dispose.gizmo (B-H5, B-L12: true since
                                                   // Phase 1C H1 / H2) retired by 08 P2-12a: always dispose;
                                                   // exportCombinedColor (B-L6) retired by 08 P2-7d: per-section materials;
                                                   // combinedLedSimColor (B-L18) retired by 08 P2-7e: white tile x vertex colours;
                                                   // previewRendersHelpers (B-M11) retired by 08 P2-10a: the preview hides helpers;
                                                   // previewRendererSize (B-M9) retired by 07 R2: one renderer, a scissor pass;
                                                   // frustumDepthM (B-L33) retired by 08 P2-11b: the frustum ends at the wall
                                                   // (CameraRigView.MAX_FRUSTUM_DEPTH_M = 15 is the analyser's fallback)

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

// legacyHtml (the identity "escaper" of B-M4) was deleted by 08 P2-3a: ui/dom.js escapeHtml replaces it (3.11).

/** Register of every tagged legacy site (sections 8.2 and 8.3). Frozen array of
 *  { id: 'B-M14', site: 'js/interaction/ViewportInput.js#attachPointer', behaviour: '...', fix: '...' }.
 *  Entries whose site is not under js/ (CSS, markup) are documentation-only. */
export const LEGACY_SITES
```
`deepFreeze` is module-private. `LegacyProfiles` is not a switch: it has no read site in `js/` and is not covered by the `Strategies` rule of the static check; when a Phase-2 commit flips a `Strategies.mesh.*` key, the builder keeps the legacy case for it (08 5.1 rule 3), and global keys (`exportCombinedColor`, ...) cannot be injected, so the oracle cases that depend on a retired global key become explicit expected-value tests in that commit (08 P2-1a retired `gltfBase64` and deleted `legacySpreadBase64`; `tests/unit/io.test.mjs` injects a verbatim copy of that encoder into its oracle exporter). The `behaviour` and `fix` strings of each `LEGACY_SITES` entry are the 8.2 cell texts with only the markdown escape `\|` unescaped to `|` (inline backticks are kept as written); the 8.2 register is stored once and expanded per 8.3 site. Phase 1 implemented only the legacy value of every key, except the `dispose.*` keys flipped by the non-observable Phase 1C clean-ups (a landed fix keeps its 8.2 row and loses its 8.3 rows, so `LEGACY_SITES` no longer lists it). Phase 2 retires keys as 08 4.1 lists them (the key, its switch and its 8.1 row are deleted in the fixing commit); retired so far: `combinedLedSimColor` (08 P2-7e: a white tile times the vertex colours), `previewRendersHelpers` (08 P2-10a: the camera preview hides the registered helpers during its render), `exportCombinedColor` (08 P2-7d: per-section materials), `dispose.wallTextures` and `dispose.gizmo` (08 P2-12a: Phase 1C had set both to `true`, so the wall maps and the gizmo groups are always disposed), `gltfBase64` (08 P2-1a), `importValidation` (08 P2-3b), `safeDistanceBand` (08 P2-5b), `zipJsonIncludesAngleOffset` (08 P2-6a), `zipTextureNaming` (08 P2-6b), `mtlDownloadDelayMs` (08 P2-6c; the constant `ProjectIO.MTL_DOWNLOAD_DELAY_MS` it became left with the second download in 08 P2-6e), `mtlTextureNaming` (08 P2-6d); flipped so far: `mesh.gltf.indexType` (`'auto'`, 08 P2-1b), `mesh.viewport.winding` (`'ccw'`, 08 P2-2a), `mesh.viewport.normals` (`'averaged'`, 08 P2-2b), `mesh.obj.winding` / `.normals` / `.stripNormals` (`'ccw'` / `'averaged'` / `'per-vertex'`, 08 P2-2c), `mesh.gltf.winding` / `.normals` / `.attributes` (`'ccw'` / `'averaged'` / `['POSITION', 'NORMAL']`, 08 P2-2d), `mesh.viewport.combinedUV` (`'atlas-pixel-accurate'`, 08 P2-7a), `mesh.obj.combinedUV` (`'atlas-pixel-accurate'`, 08 P2-7b), `mesh.gltf.attributes` (`['POSITION', 'NORMAL', 'TEXCOORD_0']`, 08 P2-7c); added: `mesh.gltf.panelNormal` (`'facing'`, 08 P2-2d), `mesh.gltf.combinedUV` (`'atlas-pixel-accurate'`, 08 P2-7c; read only when `TEXCOORD_0` is written, so `LegacyProfiles` has no such leaf). Every leaf key (arrays such as `mesh.gltf.attributes` are leaves; `previewRendererSize` was one until 07 R2 retired it) has the read site given in section 8.1 and spelled out in that module's entry below; how it is read (switch-and-throw, value, array comparison) follows section 1.5.

### 3.4 `js/theme/Theme.js`

Every scene, canvas and export literal, copied verbatim with its exact type (number vs string), plus the feature keys written as literal keys inside the frozen objects (never assigned afterwards): `SceneTheme.debug` (01 F1-1, 01 4.6: `faceFront: 0x2f6bff`, `faceBack: 0xff3344`, `vertexNormal: 0xb8f03c`, `faceNormal: 0xff4fd8`, `lineBaseFactor: 0.35`; spec 06's ThemeBridge must produce the same keys, 01 CR-8). `SceneTheme.wallBack` follows with 01 F1-5. `SceneTheme.pivot` (03 T1, 03 4.1 with the values of 06 5.12: `color: 0xf7f7f5`, `selectedColor: 0xc51622`, `anchorColor: 0xa3a3a3`, `haloColor: 0x0a0a0a` (the two-tone cores and their Morph Black halo, 06 D15), `opacity: 0.9`, `glyphHalfSize: 0.25`, `coreRadius: 0.06`, `pickRadius: 0.15`, `dash: 0.05`, `minScreenHalfSizePx: 24`; read by 03 T5's `PivotMarkerView`). Since 06 T5 the scene, canvas and status values are the Morph values of docs/improvements/06-morph-branding.md 3.8 and 5.4 (the palette and the brand strings follow in 06 T6a, T6b and T7), with the keys `frameOnLight`, `cameraBody.outlineColor`, `frustumLines.haloColor`, `frustumLines.dashSize` / `gapSize` and `CanvasTheme.preloadFonts`. Since 06 T6a the `Brand` strings name "Morph LED Configurator" (ASCII only, because several OBJ importers read Latin-1), and `Brand.jsonGenerator` is the frozen `{ name }` half of the JSON generator record that spec 07's v2 writer composes as `{ name: brand.jsonGenerator.name, version: appVersion }` (06 4.2; the Phase-1 v1 writer has no generator); `shortName`, `company` and `homepage` are new. Only `App.js` imports this module; every consumer receives `theme` (or one of its parts) by injection, so Feature 6 swaps in a ThemeBridge-built object **of the same shape** in one line (no mutation of these frozen objects); 06 T3 made that swap, and these values are the fallbacks of the tokens of `css/02-tokens.css`, kept equal by the U4 parity test (ThemeBridge below).

```js
export const SceneTheme = Object.freeze({
  background: 0x0a0a0a,                                                     // 1431 (06 T5 values from here on, 06 3.8)
  grid: { size: 100, divisions: 100, centerColor: 0x333333, color: 0x1c1c1c, position: [0, 0, 0] },   // 03 T10 (Q8, B6); legacy 1446-1447: 50 x 50 at (12.5, 0, 12.5)
  axesSize: 0.5,                                                            // 1449
  lights: { ambient: { color: 0xffffff, intensity: 0.3 },
            point: { color: 0xffffff, intensity: 0.8, position: [5, 5, 10] } },   // 1440-1443
  frame: 0xd4d4d4,                                                          // 1563: the light frame (06 6.7)
  frameOnLight: 0x0a0a0a,                                                   // 06 T5: the dark frame of light sections
  cameraBody: { color: 0xc51622, opacity: 1.0, outlineColor: 0x0a0a0a },    // 2334; outlineColor 06 T5
  frustumLines: { color: 0xf7f7f5, haloColor: 0x0a0a0a, opacity: 1.0, dashSize: 0.15, gapSize: 0.10 },   // 2407
  frustumFill: { color: 0xf7f7f5, opacity: 0.05 },                          // 2425-2426
  safeZone: { wallColor: [0x3d / 255, 0xd6 / 255, 0x8c / 255], thresholdColor: [0xc5 / 255, 0x16 / 255, 0x22 / 255],
              clampedColor: [0xff / 255, 0x86 / 255, 0x40 / 255],   // 08 P2-5b: an outer vertex closer than D (08 6.9)
              floorOpacity: 0.5, lineColor: 0xf2555a, lineOpacity: 0.9, labelColor: '#f2555a',
              labelFont: "600 32px 'Montserrat', system-ui, sans-serif" },   // 2698-2749
  person: { body: 0x4488ff, dark: 0x2244aa, opacity: 0.85 },                // 2840-2841
  car: { body: { color: 0xff4444, opacity: 0.85 }, dark: { color: 0x222222, opacity: 0.9 },
         glass: { color: 0x88ccff, opacity: 0.5 }, lights: 0xffffaa },      // 2915-2917, 2960
  gizmo: { x: 0xff4444, y: 0x44ff44, z: 0x4444ff, idleOpacity: 0.35, hoverOpacity: 1.0, dimmedOpacity: 0.15 },
         // 3010, 3029-3089, 3225, 3264. Axis colours are a convention: never brand them.
});
export const CanvasTheme = Object.freeze({
  background: '#0a0a0a',                                                    // 1693, 1821, 2009, 2064
  panelBorderColors: ['#ff0000', '#00ff00', '#0000ff'],                     // 1384 (frozen array; unchanged, 06 D12)
  panelLabelFont: (px) => `bold ${px}px 'JetBrains Mono', ui-monospace, monospace`,    // 2034, 2092
  panelSectionNameFont: (px) => `${px}px 'JetBrains Mono', ui-monospace, monospace`,   // 2042
  sectionLabelFont: (px) => `bold ${px}px 'Montserrat', system-ui, sans-serif`,        // 2107
  sectionLabelAlpha: 0.6,                                                   // 2110
  logoAlpha: 0.8,                                                           // 2181
  preloadFonts: ["bold 32px 'JetBrains Mono'", "32px 'JetBrains Mono'", "bold 32px 'Montserrat'", "600 32px 'Montserrat'"],   // 06 T5
});
export const UiColors = Object.freeze({
  status: { within: '#3dd68c', offCenter: '#ff8640', exceeds: '#f2555a' },  // 2518-2524
});
const SECTION_COLORS = Object.freeze(['#d9d9d6', '#c51622', '#58a6e8', '#e2803c', '#14a37f', '#e68ac0', '#7462d8', '#6c6c6c']);   // 06 T7
export const Palette = Object.freeze({
  sectionColors: SECTION_COLORS,                                            // 1379-1382 (added sections: index n % 8)
  cardSwatches: SECTION_COLORS,                                             // 3970-3975: the same array; the card renders it
  defaultSectionColor: '#d9d9d6',                                           // 1406 (Studio Grey)
  legacySectionColors: Object.freeze(['#00f0ff', '#ff00aa', '#00ff66', '#ff6b35', '#ffdd00', '#aa66ff', '#66ffaa', '#ff6666']),
                                                                            // the Phase-1 palette: the v1 import colour fill only
});
const PRODUCT_NAME = 'Morph LED Configurator';                           // 06 T6a (06 D1)
const FILE_PREFIX = 'morph-led-wall';                                     // 06 T6b (06 D9, Q11)
export const Brand = Object.freeze({
  productName: PRODUCT_NAME,
  jsonGenerator: { name: PRODUCT_NAME },                                    // 06 4.2: writers add version: appVersion
  shortName: 'LED Configurator',
  company: 'Morph',
  homepage: 'https://itzmorphinetime.github.io/LED_Configurator/',
  filePrefix: FILE_PREFIX,                                                  // 06 T6b
  objHeader: '# Morph LED Configurator - LED wall OBJ export\n',            // 4557
  objGeneratorLine: '# Generated by Morph LED Configurator\n\n',             // 4559
  mtlHeader: '# Morph LED Configurator - LED wall materials\n\n',           // 4561
  gltfGenerator: PRODUCT_NAME,                                              // 4721 (no version, 06 Q12)
  safeDistanceObjHeader: '# Safe Distance Floor Mesh\n# Exported from Morph LED Configurator\n\n',   // 2792
  files: { json: `${FILE_PREFIX}.json`, obj: `${FILE_PREFIX}.obj`, mtl: `${FILE_PREFIX}.mtl`, gltf: `${FILE_PREFIX}.gltf`,
           zip: `${FILE_PREFIX}-export.zip`, panelIdsPng: `${FILE_PREFIX}-panel-ids.png`,
           objZip: `${FILE_PREFIX}-obj.zip`,   // 08 P2-6e: the Export OBJ archive (obj, mtl, textures/)
           safeDistanceObj: `${FILE_PREFIX}-safe-distance.obj`, hdriPixelMap: `${FILE_PREFIX}-hdri-pixel-map.png` },   // 06 T6b
});
export const Theme = Object.freeze({ scene: SceneTheme, canvas: CanvasTheme, ui: UiColors, palette: Palette, brand: Brand });
```
(All nested objects and arrays are frozen, through a module-private `deepFreeze` of `Theme.js` itself, because `theme/` may not import `legacy/`; the three font-helper functions of `CanvasTheme` are values and stay unfrozen. The OBJ `mtllib` line is written from `Brand.files.mtl`. Since 06 T6b every download name derives from `Brand.filePrefix` (`morph-led-wall`; Phase 1: `led-wall-config.*`, `led-wall-export.zip`, `panel-ids.png`, `safe-distance-floor.obj`), with `files.json === filePrefix + '.json'`, so spec 09's `brandFilePrefix(brand)` returns `filePrefix` (06 U9); `hdriPixelMap` is spec 05's. The ZIP's section textures keep their `textures/<section>_PanelIDs.png` names.)

#### `js/theme/ThemeBridge.js` (06 T2; docs/improvements/06-morph-branding.md 5.5, 6.2)

Pure (no DOM, no THREE, imports nothing; layer `theme`). It builds an object of `Theme`'s exact shape whose colour leaves (and, since `BIND_FONTS_DEFAULT` became `true` in 06 T5, the canvas and safe-zone font leaves) come from CSS custom properties read through an injected reader; every other leaf is copied from the base theme. 06 D7: the CSS tokens are the runtime source, `Theme.js` holds the identical fallbacks, and a permanent colour change is the token and its fallback in one commit, kept equal by the U4 parity test (06 T3).

```js
export const COLOR_BINDINGS   // frozen [path, cssVar, kind] rows; kind 'num' (0xrrggbb), 'hex' ('#rrggbb'), 'rgb01' ([r, g, b] / 255),
                              // 'css' ('#rrggbb' or canonical 'rgba(r, g, b, a)'); every path is an existing Theme leaf of that type
export const FONT_BINDINGS    // frozen [path, '--font-ui' | '--font-mono', make(fontFamilyList)] rows (canvas fonts, safe-zone label)
export const UNBRANDED        // the colour leaves that are functional conventions: lights, person, car, gizmo axes, panel-ID borders
export const BIND_FONTS_DEFAULT = true;    // false from 06 T2 to T4a, true since 06 T5; App and U4 both omit the option
export function parseHexColor(raw)   // {hex, num, rgb01} | null; exactly /^#[0-9a-fA-F]{6}$/ after trim; rgb01 = parseInt(hh, 16) / 255
export function parseCssColor(raw)   // '#rrggbb' | 'rgba(r, g, b, a)' | null
/** Fresh objects and arrays, deep-frozen; function leaves shared with base by reference and never frozen (base is
 *  never mutated). Never throws for a missing or malformed token: that leaf keeps the base value, and warn is called
 *  once per variable name with `ThemeBridge: ${name} is missing or invalid (${JSON.stringify(raw)}); using the Theme.js
 *  fallback`. A binding path missing from base is a table error and throws: every COLOR_BINDINGS and FONT_BINDINGS
 *  path is checked before any token is read, so the throw depends neither on the tokens nor on bindFonts. */
export function buildTheme(base, readVar, { warn = () => {}, bindFonts = BIND_FONTS_DEFAULT } = {})
```

**Wiring (06 T3):** `App` builds `theme = buildTheme(Theme, (name) => win.getComputedStyle(doc.documentElement).getPropertyValue(name), { warn: (m) => win.console.warn(m) })` (section 7; no `bindFonts` option, so `BIND_FONTS_DEFAULT` applies, as in U4), and every consumer receives that object instead of `Theme`, with unchanged constructor signatures. While the layer-4 tokens hold the legacy values the bridged theme equals `Theme` leaf for leaf (U4), so the switch is not observable. A missing or malformed token keeps the `Theme.js` fallback of its leaves and warns once on the console (06 3.11).

The 06 T2 rows bind the legacy scene, canvas and status colours (`scene.background`, `grid.centerColor`, `grid.color`, `frame`, `cameraBody.color`, `frustumLines.color` and `frustumFill.color` (both `--scene-frustum`), `safeZone.wallColor` / `thresholdColor` (`rgb01`), `safeZone.lineColor`, `safeZone.labelColor`, `canvas.background`, `ui.status.*`); 06 T3 adds spec 01's `scene.debug.faceFront`, `faceBack`, `vertexNormal` and `faceNormal` (01 CR-8; not `UNBRANDED`). The keys that later steps add land with their rows: 06 T5 added `scene.frameOnLight` (`--scene-frame-on-light`), `scene.cameraBody.outlineColor` and `scene.frustumLines.haloColor` (both `--scene-overlay-halo`, which therefore warns once when missing) and flipped `BIND_FONTS_DEFAULT`, so the four `FONT_BINDINGS` leaves come from `--font-mono` / `--font-ui` (equal to the `Theme.js` strings, U4); 01 F1-5 adds `scene.wallBack` with `--scene-wall-back`; 08 P2-5b added `scene.safeZone.clampedColor` (`--scene-safe-clamped` = `--ui-orange-400`, `rgb01`: the amber of the clamped band edge, 06 5.12's 08 row); 03 T1 added `scene.pivot.color` (`--scene-pivot` = `--morph-neutral-50`), `selectedColor` (`--scene-pivot-selected` = `--morph-red-600`), `anchorColor` (`--scene-pivot-anchor` = `--ui-grey-400`) and `haloColor` (`--scene-overlay-halo`), with their U5 rows in `contrast.test.mjs` (worst 4.37, 3.31 and 3.31 over the background and every palette colour); the other sibling specs add their keys of 06 5.12. Tests: `theme.test.mjs` U1-U3 (06 T2), U4 token parity, U10 (every Theme leaf under `scene`, `canvas`, `ui` is bound, `UNBRANDED`, a function or non-colour by its key) and U11 (`UNBRANDED` leaves equal their Phase-1 values in `tests/unit/fixtures/legacy-theme.mjs`) (06 T3).

### 3.5 Domain (pure)

#### `js/domain/WallSection.js`
```js
export const MM_TO_M = 0.001;   // replaces the 8 local `const scale = 0.001`
export const SECTION_FIELDS = Object.freeze(['id', 'name', 'panelCols', 'panelRows', 'panelWidth', 'panelHeight',
                                             'ledX', 'ledY', 'curveIntensity', 'angleOffset', 'color']);

export class WallSection {
  /** Assigns exactly the SECTION_FIELDS keys from `fields`, in SECTION_FIELDS order, as own enumerable
   *  properties, with NO coercion (R12). Since 08 P2-3b (B-L8 fixed) an import reaches it only through the validator
   *  (io/ProjectSchema.sectionsFromProject). */
  constructor(fields)

  /** {id: 0, name: 'Wall 1', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32,
   *   curveIntensity: 0, angleOffset: 0, color}  (1395-1407); 06 T7: the colour is injected (Project.createDefault passes
   *   Theme.palette.defaultSectionColor); the literal default '#d9d9d6' only lets new Wall() work in Node (U8) */
  static createDefault({ color = '#d9d9d6' } = {})

  /** `Wall ${index + 1}` */
  static defaultName(index)

  /** 08 P2-8a (07 4.1, 4.3; 08 4.4): plain frozen data { field: { min, max, int, default } }; FIELD_RULES read min, max
   *  and int from it (and, from 08 P2-3b, so does the validator), `default` is the validator's (v1 import) default.
   *  panelCols 1..50 int 5; panelRows 1..20 int 3; panelWidth 50..5000 500; panelHeight 50..100000 500;
   *  ledX / ledY 8..65536 int 32; curveIntensity -180..180 0; angleOffset -180..180 0 */
  static LIMITS

  /** 4030-4036, applied to v = parseFloat(raw), with the 08 P2-8a rounding and caps (B-L15 fixed). B-L9 via orDefault
   *  (tagged in LegacyCompat) until 08 P2-8b. With L = LIMITS[field]: x = orDefault(v, fallback);
   *  clamp(L.int ? roundInt(x) : x, L.min, L.max) (domain/rules.js), the fallbacks being the legacy ones:
   *  panelCols, panelRows 1; panelWidth, panelHeight 500; ledX, ledY 32; curveIntensity, angleOffset 0.
   *  panelWidth and angleOffset give the legacy values (clamp equals Math.max(lo, Math.min(hi, x)) for every number
   *  orDefault returns); columns, rows and LEDs are rounded; panel height, the LEDs and the curve gain their caps. */
  static FIELD_RULES

  /** const v = parseFloat(raw); return Object.prototype.hasOwnProperty.call(FIELD_RULES, field) ? FIELD_RULES[field](v) : v;
   *  (own-key test: a plain `FIELD_RULES[field]` lookup is truthy for inherited names such as 'constructor';
   *  the legacy if/else chain 4030-4036 returned the raw parseFloat for every field it did not name;
   *  not `Object.hasOwn`, which is newer than the browser floor of 1.2) */
  static parseField(field, raw)

  /** this[field] = WallSection.parseField(field, raw); returns the stored value. */
  setField(field, raw)
  /** 08 P2-3b (07 C28, 08 A3): this.name = sanitizeText(String(raw), 32) (the 07 strip set removed, 32 UTF-16 units
   *  without splitting a surrogate pair, never trimmed: the validator's own rule); returns the stored name. */
  setName(raw)
  /** this.color = color */
  setColor(color)
  /** if (!this.setName(raw)) this.name = WallSection.defaultName(index); returns this.name (4016; for a name without
   *  controls the legacy raw || default; 08 P2-3b). */
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

export const PIVOT_MODES = Object.freeze(['bottom-left', 'mesh-center', 'wall-center']);   // 03 T1: radio order; the validator's enum
export const PIVOT_OFFSET_LIMIT_M = 1000;                                                      // 03 T1 (4.1, Q11)
export const OrientationAlign = Object.freeze({ CENTER_POS_X: 'center-pos-x', CENTER_NEG_X: 'center-neg-x', NONE: 'none' });  // 03 12.1, 12.16
export const ORIENTATION_ALIGNS = Object.freeze(['center-pos-x', 'center-neg-x', 'none']);                     // the #pivot-align order
export const ALIGN_NORMAL_AZIMUTH_DEG = Object.freeze({ 'center-pos-x': -90, 'center-neg-x': 90 });            // 03 12.16; alignNormalAzimuthDeg(align)
export const YAW_OFFSET_LIMIT_DEG = 180;                                                        // F3-O1 (03 12.4)

export class WallPivot {            // Feature 3 (03 T1, 4.1); session-only until project file v2 (03 header, owner 2026-10-17)
  mode = PivotMode.BOTTOM_LEFT;
  offset = { x: 0, y: 0, z: 0 };    // metres, layout axes; REPLACED (never mutated in place) by every setter
  keepStageLayout = true;           // re-express camera and props on explicit pivot and orientation edits (D6, Q4; 03 12.6)
  static DEFAULT_ALIGN = 'none'     // F3-O1 (03 12.11): the alignment of a new pivot; the owner's default flips it in its own commit
  orientation = { align: WallPivot.DEFAULT_ALIGN, yawOffsetDeg: 0 }   // F3-O1 (03 12.1): the whole-wall yaw about +Y through the
                                   // pivot (three.js rotation.y sign); REPLACED (never mutated in place) by its setters
  get isIdentity()                 // mode === BOTTOM_LEFT && offset x, y, z all === 0 && orientation is ('none', 0)
                                   // (keepStageLayout does not count)
  /** PIVOT_MODES.includes(mode) ? (changed = this.mode !== mode, this.mode = mode, changed)
   *  : throw new RangeError(`Unknown pivot mode ${JSON.stringify(mode)}`)   (the pivotPoint error type) */
  setMode(mode)
  /** axis 'x' | 'y' | 'z' (else RangeError); v = WallPivot.parseOffset(raw); v === null ? this.offset[axis]
   *  : (this.offset = {...this.offset, [axis]: v}, v)   (the stored component, for the input's write-back) */
  setOffsetAxis(axis, raw)
  setOffset(vec)                   // setOffsetAxis for x, y, z in order; returns this.offset
  resetOffset()                    // this.offset = {x: 0, y: 0, z: 0}
  setKeepStageLayout(on)           // typeof on === 'boolean' ? (changed, store) : throw TypeError
  /** F3-O1 (03 12.4): ORIENTATION_ALIGNS.includes(align) ? (changed, orientation = {...orientation, align})
   *  : throw new RangeError(`Unknown orientation alignment ${JSON.stringify(align)}`) */
  setAlign(align)
  /** F3-O1: v = WallPivot.parseYawOffset(raw); v === null ? orientation.yawOffsetDeg
   *  : (orientation = {...orientation, yawOffsetDeg: v}, v)   (the stored value, for the input's write-back) */
  setYawOffset(raw)
  /** v = typeof raw === 'number' ? raw : parseFloat(raw); Number.isFinite(v)
   *  ? Math.max(-1000, Math.min(1000, Math.round(v * 1000) / 1000)) || 0 : null. Never orDefault (0 is valid, B-L9 does not
   *  apply); -0 is normalised; idempotent. */
  static parseOffset(raw)
  /** F3-O1: v = typeof raw === 'number' ? raw : parseFloat(raw); Number.isFinite(v)
   *  ? Math.max(-180, Math.min(180, Math.round(v * 10) / 10)) || 0 : null (degrees, 0.1 degree). Never orDefault; -0 is
   *  normalised; idempotent. */
  static parseYawOffset(raw)
  clone()                          // deep copy (the orientation included)
  equals(other)                    // mode, the three offset components, keepStageLayout and the two orientation fields, by ===
}

export class Wall {
  constructor({ sections = [WallSection.createDefault()], nextSectionId = 1, pivot = new WallPivot() } = {})
  /** The live array (legacy `wallSections`). Mutated by push in appendLikeLast; REPLACED (new array) by
   *  removeById and replaceAll, exactly like legacy. Callers that need a stable copy must slice(). */
  get sections()
  static MAX_SECTIONS = 200        // 08 P2-3b (07 4.1, 4.3): Add Section refuses a 201st (M-SEC-1), the validator a file with more
  nextSectionId                    // public field (legacy global 1409)
  pivot                            // public field (WallPivot)
  get count()                      // sections.length

  /** 07 6.8 nextFree over the live ids (07 4.1; 08 P2-3b2): while nextSectionId is a valid id that a live section
   *  uses, nextSectionId++; then return nextSectionId++ when it is <= 2^31 - 1 and unused, else the smallest id no live
   *  section uses (nextSectionId stays). Whenever nextSectionId is above every live id (every state except right after
   *  an import whose ids reach 2^31 - 1, where replaceAll's fallback can lie below live ids) it is the legacy
   *  `nextSectionId++` (4089); legacy handed out live ids there (duplicates, which Delete removed together). */
  allocateId()

  /** Verbatim 4088-4103 except the id (allocateId, 08 P2-3b2). Evaluation order matters: `id: this.allocateId()` and
   *  the name are evaluated BEFORE `last.panelCols` (an empty wall, which legacy reached through an import of
   *  `sections: []`, B-L8, incremented the allocator before the TypeError; since 08 P2-3b the wall is never empty).
   *  const last = sections[sections.length - 1]; const newColorIndex = sections.length % sectionColors.length;
   *  new WallSection({ id: this.allocateId(), name: `Wall ${sections.length + 1}`, panelCols: last.panelCols,
   *    panelRows: last.panelRows, panelWidth: last.panelWidth, panelHeight: last.panelHeight, ledX: last.ledX,
   *    ledY: last.ledY, curveIntensity: last.curveIntensity, angleOffset: 0, color: sectionColors[newColorIndex] })
   *  then sections.push(it). @returns {WallSection} */
  appendLikeLast(sectionColors)

  /** this.#sections = this.#sections.filter(s => s.id !== id)  (removes every duplicate, B-L8; 4133). */
  removeById(id)

  /** this.#sections = sections; this.nextSectionId = createIdAllocator(new Set(valid ids)).next()  (4976, 4989; 08 P2-3b,
   *  07 6.8: max + 1, the legacy Math.max(...ids) + 1 for the validator's ids, or the smallest unused id once that would
   *  pass 2^31 - 1, which allocateId then steps past the live ids from; recomputed on every import, never stored; legacy
   *  kept -Infinity for [] and NaN for string ids, B-L8). */
  replaceAll(sections)
  /** this.count < Wall.MAX_SECTIONS  (08 P2-3b) */
  canAddSection()

  /** Verbatim 2309-2313 in section order:
   *  totalPixels += cols*rows*ledX*ledY; totalPanels += cols*rows; totalArc += cols*Math.abs(curveIntensity);
   *  @returns {{totalPixels, totalPanels, totalSections: sections.length, totalArc}} */
  totals()
  // flatBounds() (the four legacy copies 2489-2493, 2553-2557, 2598-2603, 3758-3762; LEGACY(B-L2, B-M10)) was deleted
  // by 08 P2-11c: the framing reads the stage layout (WallLayout.framingBounds, 3.6)
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
  static DEFAULT_SHOW_PIVOT_MARKER = true;           // 03 T1 (4.1): false until step C; true since 03 T9 (Q9); the v2 reader's default too
  showPivotMarker = DisplaySettings.DEFAULT_SHOW_PIVOT_MARKER;   // 03 T1; view-only, session-only
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
  meshMode;      // 'combined' | 'section' | 'panel' (since 08 P2-3b an import maps an unknown mode to 'combined'; legacy kept it, B-L8)
  display;       // DisplaySettings
  panelIdStyle;  // PanelIdStyle
  logos;         // LogoLibrary
  camera;        // CineCamera
  person;        // PersonProp
  car;           // CarProp
  static createDefault({ defaultSectionColor } = {})
      // new Project({ wall: new Wall({ sections: [WallSection.createDefault({ color: defaultSectionColor })] }),
      //   display: new DisplaySettings(), panelIdStyle: new PanelIdStyle(), logos: new LogoLibrary(), camera: new CineCamera(),
      //   person: new PersonProp(), car: new CarProp() })   (06 T7: the first section's colour injected; undefined: the default)
      // The legacy aggregate: meshMode 'combined', the identity pivot (the oracles and most unit tests start here).
  static NEW_PROJECT_MESH_MODE = 'section';
  static createNew({ defaultSectionColor } = {})
      // 03 12.11 (the owner's defaults of 2026-10-17; App's bootstrap): createDefault, then meshMode = 'section' and
      // wall.pivot = WallPivot.createForNewProject() ('wall-center', Centre on +X since 03 12.16), then the person and
      // car placeInFront of the LED face (NEW_PROJECT_PROPS). index.html's initial radio, select, readout and prop
      // input states mirror it.
}
```

#### `js/domain/LogoLibrary.js`
Logos are deliberately **not** stored on `WallSection`: legacy keys them by id across deletes (and across imports until 08 P2-3d, B-L21), so they outlive section objects.
```js
export class LogoLibrary {
  // #entries = {} : a plain object; every method indexes it with the given key unchanged, so keys follow
  // JS property-key coercion exactly like legacy `sectionLogos[id]` (UI handlers pass parseInt(dataset.sectionId),
  // the renderer and delete pass section.id; both give the same key for the validated integer ids of 08 P2-3b, B-L8
  // fixed; legacy ids such as 'a', '07' or 1.5 never matched a parseInt key).
  get(sectionId)                    // this.#entries[sectionId]
  hasImage(sectionId)               // this.#entries[sectionId] && this.#entries[sectionId].image   (verbatim 2196 expression)
  ensure(sectionId)                 // if (!entries[id]) entries[id] = { position: 'center', scale: 0.3 } (a fresh object); return entries[id]
  setImage(sectionId, image)        // this.ensure(sectionId).image = image   (2266-2269)
  remove(sectionId)                 // delete this.#entries[sectionId]       (2282, 4131)
  setPosition(sectionId, position)  // if (entries[id]) { entries[id].position = position; return true } return false   (2290-2291)
  setScale(sectionId, fraction)     // same shape for .scale                                                    (2301-2302)
  clear()                           // this.#entries = {}   (08 P2-3d, B-L21: an import resets the logos)
  set(sectionId, entry)             // this.#entries[sectionId] = { ...entry }   (08 P2-3d: the logos an import installs after clear())
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
   *  posZ: { parse: (r, ctx = {wallZ: 0}) => finiteOr(parseFloat(r), r3(ctx.wallZ + 5)), writeBack: true }
   *        (08 P2-11c, Q13, 03 4.1 step F: no minimum, so 0 and negative values are kept (B-L10's Z half); a non-numeric
   *        entry is 5 m in front of the wall's start plane, ctx.wallZ its stage z; r3(v) = Math.round(v * 1000) / 1000;
   *        03 T1's branch on ctx.wallZ === 0 and its minimum r3(wallZ + 0.1) are gone)
   *  rotX: { parse: r => Math.max(-90, Math.min(90, orDefault(parseFloat(r), 0))), writeBack: true }
   *  rotY: { parse: r => Math.max(-180, Math.min(360, orDefault(parseFloat(r), 0))), writeBack: true }
   *  rotZ: { parse: r => Math.max(-180, Math.min(180, orDefault(parseFloat(r), 0))), writeBack: true } */
  static FIELD_RULES
  /** 03 T1: the 07 C22 writer bounds (deep-frozen): posX, posZ {min: -100000, max: 100000}, posY {min: 0, max: 100000}
   *  (domain/rules.js STAGE_POSITION_LIMIT_M). Read by translateStage; 08 P2-13e makes every other writer clamp too. */
  static LIMITS
  setField(field, raw, ctx = {wallZ: 0})   // this[field] = FIELD_RULES[field].parse(raw, ctx); returns it (only posZ reads ctx)
  /** 03 T1 (6.5, 07 C45): posX = clamp(posX + dx, LIMITS.posX); posZ = clamp(posZ + dz, LIMITS.posZ); y and rotations
   *  untouched. The pivot re-expression of the stage-anchored camera (CameraController.translateStage). */
  translateStage(dx, dz)
  /** const preset = FILMBACK_PRESETS[key]; this.filmback = key; if (key !== 'custom') { this.filmbackWidth = preset.width;
   *  this.filmbackHeight = preset.height; } return preset;   (4252-4259) */
  applyPreset(key)

  hFov()     // 2 * Math.atan(this.filmbackWidth / (2 * this.focalLength))   radians, the shared legacy expression
  vFov()     // 2 * Math.atan(this.filmbackHeight / (2 * this.focalLength))
  aspect()   // this.filmbackWidth / this.filmbackHeight
  /** Math.min(extent.width / (2 * Math.tan(hFov / 2)), extent.height / (2 * Math.tan(vFov / 2)))
   *  (2529-2531 == 2610-2612; hFov/vFov from the methods above); since 08 P2-11c extent is the framing's stageExtent
   *  (the wall seen face-on), it was the flat {totalWidth, maxHeight} */
  maxSafeDistance(extent)
  // coverage(bounds) (2473-2531, LEGACY(B-M10)) was deleted by 08 P2-11a: the coverage is geometry/FrustumCoverage's
  // analyzeCoverage, called by CameraHub.coverage() (3.6, 3.10)
  static RESET_DISTANCE_M = 5;   // 08 P2-11c: how far in front of the wall Reset stands (the legacy 5)
  /** 2559-2564, since 08 P2-11c (6.10; B-L2 fixed; 03 step F): c = framing.wallBox.center, f = framing.facing;
   *  posX = c.x + 5 * f.x; posY = c.y; posZ = c.z + 5 * f.z; rotX = 0; rotY = wrapDeg(Math.atan2(f.x, f.z) * 180 / Math.PI);
   *  rotZ = 0 (forward = -facing: it looks at the centre; any Z; a flat wall along +X gives the legacy (W/2, H/2, 5),
   *  rotY +0, bit for bit) */
  resetTo(framing)
  /** LEGACY(B-L34): FILMBACK_PRESETS[this.filmback]?.name.split(' ')[0] || 'Custom' */
  presetShortName()

  // Gizmo arithmetic (the Selectable 'camera' is CameraController; it calls these)
  /** posX += dx; posY = Math.max(0, posY + dy); posZ += dz   (3338-3340; untagged since 08 P2-11c: the input rule has no
   *  Z minimum either, so input and gizmo agree; B-L10 keeps the pilot's 0.1 floor) */
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
  static LIMITS                       // 03 T1: posX, posZ {min: -100000, max: 100000} (07 C22 writer bounds, deep-frozen)
  setField(field, raw)                // stores and returns FIELD_RULES[field].parse(raw)
  /** posX += dx; posZ += dz; dy ignored. LEGACY(B-L22) (3348-3349) */
  translateBy(dx, dy, dz)
  /** 03 T1 (6.5, 07 C45): posX = clamp(posX + dx, LIMITS.posX); posZ = clamp(posZ + dz, LIMITS.posZ) */
  translateStage(dx, dz)
  /** axis === 'y' ? (rotY += deltaDeg, true) : false. LEGACY(B-L22) (3389-3399) */
  rotateBy(axis, deltaDeg)
  placeInFront(point, azDeg, distance, side)   // 03 12.16: distance out along the LED normal, side to the right, rotY = az
}
export class PersonProp extends Prop { constructor() { super({ kind: 'person', label: 'Person', posX: 2, posZ: 2, gizmoAnchorY: 0.9 }); } }
export class CarProp    extends Prop { constructor() { super({ kind: 'car',    label: 'Car',    posX: 4, posZ: 3, gizmoAnchorY: 0.5 }); } }
```

#### `js/domain/DebugViewSettings.js` (01 F1-1, 01 4.4)
```js
export const DebugShading = Object.freeze({ CONTENT: 'content', FACE_ORIENTATION: 'faceOrientation', NORMAL_COLORS: 'normalColors' });
export const SHADING_CYCLE = Object.freeze(['content', 'faceOrientation', 'normalColors']);
export class DebugViewSettings {      // viewer preferences: never serialised, reset on reload (01 Q7)
  shading = 'content';
  normals = { enabled: false, vertex: true, face: false, lengthScale: 1, onTop: false };
  /** v = parseFloat(raw); !Number.isFinite(v) || v <= 0 -> 1; else Math.min(4, Math.max(0.25, Math.round(v * 4) / 4)) */
  static parseLengthScale(raw)
  nextShading()                     // SHADING_CYCLE[(indexOf(shading) + 1) % 3]
  snapshot()                        // frozen {shading, normals: {...normals}} for event payloads (01 T7)
}
```
Its fields are written only by `app/DebugViewController.js` (section 4).

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

/** 03 T2 (6.2): a = layoutL.pivotPoint(pivot.mode) ?? {x: 0, y: 0, z: 0} (empty wall: the layout origin);
 *  P = a + pivot.offset; P not finite -> null (a non-finite layout: the identity fallback);
 *  else {mode, offset: {...offset}, anchor: a, point: P, stageOrigin: {x: P.x, y: 0, z: P.z}} (layout frame),
 *  plus (F3-O2, 03 12.4) the orientation: align and yawOffsetDeg (pivot.orientation, or 'none' / 0 for an object
 *  without one), alignYawDeg = alignmentYawDeg(layoutL, alignNormalAzimuthDeg(align)) for 'center-pos-x' (-90) and
 *  'center-neg-x' (90), else 0, yawDeg = wrapDeg(alignYawDeg +
 *  yawOffsetDeg) (+0 at the identity). Generative quantities only: a section offset never moves the pivot (03 5.10 #1);
 *  the alignment depends on the sections only. */
export function resolvePivot(layoutL, pivot)          // PivotResolution | null
/** 03 T2: {x: so(b).x - so(a).x, z: so(b).z - so(a).z}, so(null) = (0, 0, 0)   (the stage-origin change, layout frame) */
export function stageShift(a, b)
/** F3-O2 (03 12.4): yaw(b) - yaw(a) in degrees, unwrapped; a null resolution counts as 0 */
export function yawShift(a, b)
/** F3-O2 (03 12.6): the rigid map s_b = R(dPsi) s_a + R(psi_b)(O_a - O_b) of a stage point that keeps its place relative to
 *  the wall: {yawDeg: dPsi, cos, sin: yawTrig(dPsi), dx, dz: R(psi_b)(-stageShift(a, b))}; at psi_b = 0, (dx, dz) is
 *  exactly -stageShift (the 6.5 re-expression bit for bit) */
export function stageChange(a, b)
/** 03 T3: r.mode === 'bottom-left' && r.offset.x === 0 && r.offset.y === 0 && r.offset.z === 0 (the exporters write
 *  pivot metadata only for a non-identity resolution, 03 7.1, 7.2, Q10) */
export function isIdentityResolution(r)

/** THE single entry point used by every consumer (LEDWallView via WallController, SafeDistanceView via CameraHub,
 *  exporters via ProjectIO with {frame: 'export'}, 03 T3). 03 T2 (6.3, 1.4): raw = computeWallLayout(sections) (every
 *  postTransform null); resolution = resolvePivot(raw, project.wall.pivot); t = frame === 'layout' || !resolution ? 0
 *  : frame === 'export' ? -P : -(P.x, 0, P.z) ('stage', the default); out = t is all zero (-0 included) ? raw (the
 *  same object, bit-identical) : raw.translated(t); F3-O2 (03 12.3): yawDeg = frame === 'layout' || !resolution ? 0
 *  : resolution.yawDeg, and out = out.rotated(yawDeg) when yawDeg !== 0 (the turn about the pivot's vertical); spec 02
 *  inserts applySectionOffsets(out) here (07 C32); out.pivot = {resolution, frame, translation: t, yawDeg}. Any other
 *  frame throws RangeError. */
export function layoutProject(project, { frame = 'stage' } = {})

/** 08 P2-11c (6.10; B-L2 fixed; 03 step F): the framing of a layout, injected as `frameBounds` (App:
 *  framingBounds(wallController.currentLayout)); memoised per layout instance (a WeakMap), frozen.
 *  switch (Strategies.framingBounds) { case 'layout': FramingPolicy's three named boxes (07 C34), each consumer naming
 *    its box: {generativeBox: framingBox(generativeBounds()) (the orbit target before 07 I4b), wallBox:
 *    framingBox(bounds()) (Reset's centre), stageExtent: {width: extentAcross(facing, include), height: the y range}
 *    over every section without a column whose |n.y| > 0.9 (a ceiling or a floor) (D and fits), facing: chordFacing() (Reset stands on it),
 *    wallZ: 0 + start.z (the wall start plane's z: the posZ rule's context), start = pivot.translation turned by
 *    pivot.yawDeg (F3-O2; the translation itself at a zero yaw)}; framingBox(b) = {min, max, center: (min + max) / 2};
 *    a wall without finite grid vertices falls back to a zero box at the walk's start (0 + start.x, 0, wallZ), stageExtent {0, 0}, facing (0, 0, 1) (the empty wall's 'flat-pivot' framing; no NaN);
 *  default: throw unsupportedStrategy(...) }   (Phase-1 'flat' deleted in 03 T2, 'flat-pivot' in P2-11c)
 *  A flat wall along +X at the identity gives the legacy target (W/2, H/2, 0), Reset and D bit for bit. */
export function framingBounds(layout)

export class SectionLayout {
  /** One options object (built only by computeWallLayout and translated): postTransform is stored as given
   *  (`postTransforms[i] ?? null`); baseY defaults to 0 (03 T2). */
  constructor({ section, sectionIndex, panelW, panelH, isFlat, edges, panels, postTransform = null, baseY = 0 })
  section; sectionIndex; sectionId;     // sectionId === section.id
  panelW; panelH; isFlat;
  edges;            // [{x, z, angle}] (legacy edgePositions), length panelCols + 1 for integer counts
  panels;           // [{x, y, z, rotY, col, row, sectionIndex}] (legacy panelData), row-major
  postTransform;    // Feature 2 hook: column-major 4x4 array or null. ALWAYS null in Phase 1, never read, never fed
                    // back into the cursor.
  baseY;            // 03 T2 (6.1, 6.4): the bottom of every column; 0 in the walk and the stage frame, -P.y in the
                    // export frame; the same for every section of one layout
  /** 03 T2: a new SectionLayout with every field copied, edges {x + dx, z + dz, angle}, panels {x + dx, y + dy, z + dz,
   *  rotY, col, row, sectionIndex}, baseY + dy, postTransform null (called by WallLayout.translated) */
  translated(dx, dy, dz)
  /** F3-O2 (03 12.3): a new SectionLayout with every field copied, edges {turnXZ(x, z), angle - yawRad}, panels
   *  {turnXZ(x, z), y, rotY + yawRad, col, row, sectionIndex}, baseY unchanged, postTransform null (called by
   *  WallLayout.rotated) */
  rotated(trig, yawRad)
}

export class WallLayout {
  constructor({ sections })   // built only by computeWallLayout and translated()
  sections;         // SectionLayout[]
  pivot = null;     // 03 T2: {resolution, frame, translation} (+ yawDeg since F3-O2), set by layoutProject only
  /** Legacy safe-distance `allEdges` (2619-2647): [] when there are no sections; otherwise sections[0].edges[0]
   *  followed by every section's edges.slice(1), in order. MUST return [] (not throw) for an empty wall:
   *  legacy imports of `sections: []` with preview + safe distance on add an empty group and do not throw. The one
   *  polyline of the safe-distance band (SafeDistanceBand.bandRunOfLayout; B-M15 fixed in 08 P2-5b, no tag left). */
  flatEdges()
  get firstEdge()   // sections[0].edges[0] or null when empty            (Feature 3)
  get lastEdge()    // last section's last edge or null when empty         (Feature 3)
  /** 03 T2: the generative box (FramingPolicy's generativeBox, 07 C34): the axis-aligned box of every grid vertex before
   *  spec 02's offsets (loops row <= panelRows, col <= panelCols over edges, y = baseY === 0 ? row * panelH
   *  : baseY + row * panelH), {min:{x,y,z}, max:{x,y,z}} or null when empty; frames excluded; spec 02 T3 makes it
   *  attached-only. Computed on demand (a fresh object per call) with plain < / > comparisons: NaN coordinates are
   *  skipped, 0 and -0 are not distinguished, and a wall whose sections have no grid vertex gives
   *  {min: +Infinity x3, max: -Infinity x3}. */
  generativeBounds()
  bounds()          // 08 P2-11c: the transformed box of worldVertices() (07 C34's wallBox; = generativeBounds() while no
                    // section carries a postTransform, i.e. in Phase 2)
  /** 03 T2 (6.1, the y policy settled, B5; amended by the owner on 2026-10-17, B1-pivot-floor): with y0 =
   *  sections[0].baseY (0 in the layout frame, so the floor modes return the Phase-1 values bit for bit), every mode is
   *  a floor mode: 'bottom-left': {x: firstEdge.x, y: y0, z: firstEdge.z}; 'wall-center': the midpoint of firstEdge and
   *  lastEdge at y0 (the owner's "middle of entire wall"); 'mesh-center' ("Wall mesh centre on floor"): the x/z centre
   *  of generativeBounds() at y0 (until 2026-10-17 the box centre, y included; a raised pivot is now an Offset Y; its
   *  x/z are NaN, so resolvePivot gives null, only for a wall without grid vertices). null when empty; an unknown mode
   *  throws RangeError. On a translated copy every mode follows the translation. */
  pivotPoint(mode)
  /** 03 T2 (6.4): throws Error('translated() expects the raw walk: apply section offsets after the pivot translation')
   *  if any section has a postTransform (the one composition rule, 03 5.10 #2, 07 C32); else a new WallLayout of
   *  sl.translated(dx, dy, dz) per section, with no pivot block. Pure. */
  translated(dx, dy, dz)
  /** F3-O2 (03 12.3): throws Error('rotated() expects the raw walk: apply section offsets after the orientation') if any
   *  section has a postTransform; else a new WallLayout of sl.rotated(yawTrig(yawDeg), yawDeg * PI / 180) per section
   *  (R_y about the frame origin's vertical: (x cos + z sin, y, -x sin + z cos), the three.js rotation.y sign), with no
   *  pivot block. Pure; layoutProject never calls it with 0. */
  rotated(yawDeg)
  /** 08 P2-11a (6.10), memoised per instance (frozen; the same array on every call; a translated copy computes its
   *  own): per section column k, p0 = T(e[k].x, baseY, e[k].z), a = T_vec(e[k+1] - e[k]), b = T_vec(0, panelRows *
   *  panelH, 0), n = normalize(a x b), aa = a.a, bb = b.b, {sectionIndex, column: k}; T = the section's postTransform
   *  (identity while null). n is the stage side of the column (+Z for a flat wall along +X) and turns with the wall; a
   *  column with no finite, non-zero a x b is left out. Read by FrustumCoverage on every pose change. */
  columnQuads()      // ReadonlyArray<ColumnQuad>
  /** 08 P2-11a (6.10), memoised: one xyz-interleaved Float64Array per section of every grid corner (row 0..panelRows
   *  outer, col 0..panelCols inner, y = baseY === 0 ? row * panelH : baseY + row * panelH, after the postTransform). */
  worldVertices()    // ReadonlyArray<Float64Array>
  /** 08 P2-11a (6.10): max(v.chord) - min(v.chord) over worldVertices() of the included sections, chord = (facing.z, 0,
   *  -facing.x): the width seen face-on, invariant under a yaw of the wall (the same along X, along Z and at 45 degrees);
   *  0 when nothing is included. */
  extentAcross(facing, include = null)
  /** 08 P2-11a (6.10): normalize(-(last.z - first.z), 0, last.x - first.x) from the first edge of the walk to the last
   *  (each through its section's postTransform): (-0, 0, 1) for a flat wall along +X; (0, 0, 1) for a chord shorter than
   *  1e-9 m (a closed ring, an empty wall). */
  chordFacing()
}
```

#### `js/geometry/WallOrientation.js` (F3-O2; docs/improvements/03-pivot.md 12.2; imports `domain/rules.js`)
```js
/** The exact (cos, sin) of a yaw in degrees at every multiple of 90; Math.cos / Math.sin of deg * PI / 180 otherwise. */
export function yawTrig(deg)                  // {cos, sin}
/** R_y(psi)(x, z) = {x: x cos + z sin, z: -x sin + z cos} (three.js rotation.y; +Z -> +X at 90 degrees) */
export function turnXZ(x, z, trig)
/** atan2(v.x, v.z) in degrees: +Z is 0, +X is 90; azimuthDeg(R_y(psi) v) = azimuthDeg(v) + psi (mod 360) */
export function azimuthDeg(v)
/** The arc-length midpoint of layout.flatEdges() and its LED normal (-dz / l, 0, dx / l), in the layout's frame: inside a
 *  column, that column's normal; within 1e-9 * max(1, Lt) of a column edge, the edge and the normalised mean of the two
 *  adjacent normals; y = sections[0].baseY; zero-length columns skipped; null for an empty wall, no positive length or a
 *  non-finite length. Equivariant under translation and turn. */
export function wallCentre(layout)            // {point, normal} | null
/** wrapDeg(targetDeg - azimuthDeg(wallCentre(layout).normal)): the yaw that turns the centre normal to the azimuth
 *  targetDeg (90: +X, 'center-neg-x', the default; -90: -X, 'center-pos-x', 03 12.16); exactly 90 / -90 for a flat
 *  wall along +X; 0 without a centre */
export function alignmentYawDeg(layout, targetDeg = 90)
```

#### `js/geometry/FrustumCoverage.js`: the coverage analyser (08 P2-11a, B-M10; 08 6.10)
```js
export const MAX_FRUSTUM_DEPTH_M = 15;   // a corner depth with no hit and no wall plane ahead (the legacy depth, B-L33)
export const FRAME_CORNERS;              // frozen [{sx: -1, sy: 1}, {1, 1}, {1, -1}, {-1, -1}]: TL, TR, BR, BL
/** The columns of three.js r128 makeRotationFromEuler 'YXZ' (rotation.set(tilt, pan, roll), as CameraRigView applies
 *  it): right = R(1, 0, 0), up = R(0, 1, 0), forward = R(0, 0, -1) = (-sin pan cos tilt, sin tilt, -cos pan cos tilt);
 *  (-0, 0, -1), (1, 0, 0), (0, 1, 0) exactly for zero angles. */
export function cameraBasis(rotXDeg, rotYDeg, rotZDeg)
/** The smallest t of a front-facing quad (d.n < -1e-9, t = ((p0 - o).n) / (d.n) > 0) whose point has s, v in [0, 1]
 *  (tolerance 1e-9, so a ray through a column joint hits); null for none. */
export function nearestHit(o, d, quads)
/** D0: over the front-facing column planes hit at t > 0, the t of the smallest gap between the hit and the column's
 *  horizontal extent (0 inside, 0 <= s <= 1 at any height; else the distance outside it, (-s or s - 1) |a|), the
 *  smallest t among equal gaps; null when no plane lies ahead. A hit inside a column wins (08 6.10's rule 1); when the
 *  axis misses every column, the column it passes closest to gives the plane (as built; 6.10's rule 2 took the nearest
 *  plane of any column). posZ - c for a flat wall at z = c, unrotated. */
export function frameDistance(o, f, quads)
/** The corners to camera space (x = v.r, y = v.u, z = v.f), clipped at z >= 1e-6, projected to (x/z, y/z), separating-axis
 *  test against [-tx, tx] x [-ty, ty] (its two axes, then each edge normal); touching counts. */
export function quadOverlapsFrame(q, o, basis, tx, ty)
/** tx = tan(hFov / 2), ty = tan(vFov / 2); D0 = frameDistance; W = 2 * tx * D0, H = 2 * ty * D0 (null without D0; the
 *  legacy expressions, so a flat wall and an unrotated camera give the legacy values bit for bit); each corner ray
 *  normalize(f + sx tx r + sy ty u) and its nearestHit; status: 'offWall' when D0 is null or nothing touches (no ray
 *  hit and no front-facing quad overlapping the frame), else 'within' (all four corners hit), else 'offCenter' (W <=
 *  extent.width && H <= extent.height), else 'exceeds'; cornerDepths: t_c / sqrt(1 + tx^2 + ty^2) for a hit (the far
 *  corner (sx tx z, sy ty z, -z) is the hit point), else D0, else MAX_FRUSTUM_DEPTH_M. Pure: reads the layout's memo.
 *  @returns {{status, frameWidth, frameHeight, distance, cornerDepths: number[4], centreDepth, cornerHits: boolean[4]}} */
export function analyzeCoverage(layout, pose, lens, extent)
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
/** 08 P2-7a (08 6.7): {offsetU: entry.uvOffsetX, widthU: entry.uvWidth, heightV: entry.uvHeight}, the pixel-accurate atlas
 *  rect of a computeAtlas entry; shared by the viewport combined grid, the combined OBJ (P2-7b) and glTF (P2-7c). */
export function atlasUvRect(entry)
/** 08 P2-7a (02 6.13's code; 07 C52, the one owner): binary search for the range with indexStart <= faceIndex * 3 <
 *  indexStart + indexCount; null when none. r128 Mesh.raycast reports faceIndex over the whole index buffer. */
export function sectionRangeForFace(ranges, faceIndex)

export class WallMeshBuilder {
  /** @param {object} profile  one of Strategies.mesh.viewport | .obj | .gltf (stored as given; App passes the frozen object).
   *  Every profile read in this class (and in the exporters, through builder.profile) is `profile.<leaf>`:
   *  winding (passed to quadIndices, which switches), normals (sectionGrid), combinedUV (combinedGrid),
   *  panelNormal (panelFacingNormal). */
  constructor(profile)
  get profile()

  /** One section's vertex grid, verbatim 1598-1640 / 1716-1751 / 5041-5048, pushing into `out` (append with loops,
   *  never spread). For row = 0..panelRows (<=), y = sl.baseY === 0 ? row * sl.panelH : sl.baseY + row * sl.panelH
   *  (03 T2, 6.4: the identity branch is the verbatim legacy expression); for col = 0..panelCols (<=), edge = sl.edges[col]:
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
   *      (offsetU + (col / panelCols) * widthU, row / panelRows)  (the Phase-1 atlas rect, B-M5); uv = {offsetU, widthU,
   *      heightV} (08 P2-7a, 08 6.7) -> the same u and (row / panelRows) * heightV (heightV = 1 gives row / panelRows bit
   *      for bit); uv === null (or undefined) -> nothing pushed; any other non-object uv throws TypeError (a programmer
   *      error, not a strategy)
   *  Indices: vertsPerRow = section.panelCols + 1 (raw: string cols concatenate, B-L8); for row < panelRows,
   *    col < panelCols: bl = indexBase + row * vertsPerRow + col; br = bl + 1;
   *    tl = indexBase + (row + 1) * vertsPerRow + col; tr = tl + 1;   (exact left-to-right association; fractional
   *    imported counts, B-L8; the card rules round the counts since 08 P2-8a, B-L15 fixed)
   *    indices.push(...quadIndices(bl, br, tl, tr, profile.winding))
   *  vertexAdvance = (section.panelCols + 1) * (section.panelRows + 1)   (the DECLARED count; it differs from the pushed
   *    count only for an imported fractional count, B-L8)
   *  @param {SectionLayout} sl
   *  @param {{indexBase?: number, uv?: 'unit'|{offsetU:number,widthU:number,heightV?:number}|null, normals?: 'averaged'|'right-panel'|'none'}} [opts]
   *         defaults: indexBase 0, uv null, normals profile.normals
   *  @param {{positions:number[], normals:number[], uvs:number[], indices:number[]}} [out]  defaults to fresh arrays
   *  The normals switch runs once per call, before any output (a foreign value throws even for an empty grid); the
   *  winding is read once into a local and passed to quadIndices per quad (a foreign winding throws only when the
   *  section has at least one quad). Phase-1 values never reach a default branch.
   *  @returns {{positions, normals, uvs, indices, vertexAdvance}}  (the out arrays) */
  sectionGrid(sl, opts, out)

  /** Combined mesh (1579-1644): calls sectionGrid for each section in order into shared arrays with
   *  indexBase = running vertexOffset (starts 0, += vertexAdvance) and the uv option from
   *  switch (this.profile.combinedUV) { case 'atlas-pixel-accurate': uv = atlasUvRect(atlas.entries[i]) (08 P2-7a, 08 6.7;
   *  B-M5 fixed: v = (row / panelRows) * uvHeight); case 'atlas-u-full-v' (the Phase-1 case, kept for LegacyProfiles):
   *  uv = {offsetU: atlas.entries[i].uvOffsetX, widthU: atlas.entries[i].uvWidth}; default: throw
   *  unsupportedStrategy('mesh.combinedUV', ...) }; the switch runs once per call, before any output (it throws even for
   *  an empty wall).
   *  @returns {{positions, normals, uvs, indices,
   *            sectionRanges: [{sectionId, sectionIndex, indexStart, indexCount, vertexStart, vertexCount}]}}
   *  sectionRanges: the picking seam of Features 2 and 4 (07 C52: 08 P2-7a owns the vertex ranges and sectionRangeForFace);
   *  vertexStart = the section's running vertexOffset, vertexCount = its declared vertexAdvance (equal to the pushed
   *  counts for every validated wall) */
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
  /** 08 P2-12d (08 6.15; 04 5.3's panelUvs without a UV plan): the section-space UVs of a panel quad, BL, BR, TR, TL:
   *  [[(panel.col + lu) / panelCols, (panel.row + lv) / panelRows] for (lu, lv) of PANEL_UVS]. Corners shared with a
   *  neighbouring panel equal the section-mode strip UVs bit for bit. Reads no profile key. LEDWallView writes them into
   *  the panel PlaneGeometry when the content is panel IDs. */
  panelUvs(panel, sl)
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
 *     uvOffsetX,   // running sum of previous uvWidth values (`uvOffsetX += uvWidth`)                         (1643)
 *     uvHeight }   // (section.panelRows * section.ledY) / totalLedY: the bottom-aligned section's share of the atlas
 *                  // height (08 P2-7a, 08 6.7; exactly 1 when all sections have the same LED height)
 *  @returns {{totalLedX, totalLedY, pxPerLed, entries}} */
export function computeAtlas(sections)
/** Math.max(1, Math.min(4, Math.floor(4096 / Math.max(w, h))))  section canvas px/LED (2056) */
export function sectionPxPerLed(w, h)
/** 08 P2-12d (B-M16 fixed; 08 6.15, 07 6.12): the px/LED of every per-panel canvas of one rebuild, from the WALL-WIDE
 *  budget: wallPanelLeds = sum of panelCols * panelRows * ledX * ledY, maxLedSide = the largest ledX or ledY;
 *  panelModePxPerLed({wallPanelLeds, maxLedSide}, {maxSide}) -> its pxPerLed when it fits, else 1 (an integer in 1..16;
 *  the default wall keeps the legacy 16). Legacy (2003) gave each panel Math.max(4, Math.min(16, Math.floor(4096 /
 *  Math.max(ledX, ledY)))) with no budget. Only 04's uv.panel_uvs = 'panel' option reaches the per-panel canvases. */
export function panelPxPerLed(sections, { maxSide = MAX_CANVAS_SIDE } = {})
/** 08 6.3 (B-L4, 08 P2-1c): Object.freeze({ maxSide: 32767, maxArea: 268435456 }), the largest canvas every supported
 *  browser can create (Chrome draws up to 65,535 px per side; 07's CanvasProbe later probes device limits). */
export const CANVAS_HARD_LIMITS
/** w >= 1 && h >= 1 && w <= limits.maxSide && h <= limits.maxSide && w * h <= limits.maxArea (NaN and 0 do not fit). */
export function canvasFits(w, h, limits = CANVAS_HARD_LIMITS)
```

#### `js/geometry/TextureBudget.js` (08 P2-12d; 07 X3's module delivered early, 07 C25, C38; imports nothing)
```js
export const SECTION_TEXTURE_BUDGET_PX = 16777216   // all section canvases of one rebuild (04 UV-7 computes its px/LED against it)
export const PANEL_TEXTURE_BUDGET_PX = 33554432     // all per-panel canvases of one rebuild, WALL-WIDE (04's 'panel' option only)
export const MAX_CANVAS_SIDE = 4096                 // each canvas side <= min(renderer maxTextureSize, 4096)
/** 07 6.12: p = min(floor(sqrt(budgetPixels / wallPanelLeds)), floor(maxSide / maxLedSide), 16);
 *  p >= 1 -> {pxPerLed: p, fits: true}, else {pxPerLed: 0, fits: false}. Defaults: PANEL_TEXTURE_BUDGET_PX, MAX_CANVAS_SIDE. */
export function panelModePxPerLed({ wallPanelLeds, maxLedSide }, { budgetPixels, maxSide } = {})
```
07 X3 later adds `fitPxPerLed`, `estimateGpuBytes` and the probed limits to this module; the exports keep their legacy densities and the `CANVAS_HARD_LIMITS` guard.

#### `js/geometry/PanelNaming.js`
```js
export function columnLabel(index)          // verbatim 1991-1999 (bijective base-26: 0 -> A, 26 -> AA)
export function panelLabel(globalCol, row)  // `${columnLabel(globalCol)}${row + 1}`
export function exportSectionName(i)        // `Wall_${i + 1}`
export function exportPanelName(i, row, col)  // `Wall_${i + 1}_Panel_R${row + 1}_C${col + 1}`
/** name.replace(/[^a-zA-Z0-9_-]/g, '_')   (4496). The parameter MUST stay named `name` (R1): a numeric imported
 *  section name throws `TypeError: name.replace is not a function`, which reaches the console baseline. */
export function sanitizeFilename(name)
/** 08 6.6 (B-L14 fixed in 08 P2-6b; zipTextureFileName and Strategies.zipTextureNaming are gone): per section the legacy
 *  name (4511, 4540) `${sanitizeFilename(s.name || `Wall_${i + 1}`)}_PanelIDs.png`, made unique case-insensitively by
 *  appending _2, _3, ... to a base already used (names without a collision are unchanged). The one list of the ZIP texture
 *  entries and the ZIP JSON texture_file; never null (a caller nulls a left-out texture, 08 6.3).
 *  @returns {string[]} one unique name per section */
export function textureFileNames(sections)
/** `textures/${fileName}` (4612's folder): the ZIP entry path of a textureFileNames entry, so the MTL map_Kd, the ZIP
 *  texture and the JSON texture_file name the same file (08 P2-6d, B-M2 fixed: legacy wrote textures/Wall_<i>_PanelIDs.png
 *  by index; Strategies.mtlTextureNaming is retired). */
export function mtlTextureFile(fileName)
/** 08 P2-7f (08 6.3, 6.8; 04 2.3 rows 08-7, 08-8): `textures/${files.panelIdsPng}`, the archive path of the combined atlas
 *  (the image of Export Panel IDs) and the combined MTL map_Kd; built from the injected Theme.brand.files, never a literal
 *  (06 R-B3b). */
export function atlasTexturePath(files)
```


#### `js/geometry/NormalLines.js` (01 F1-1, 01 5.2, 6.6, 6.7; imports nothing)
```js
export const MAX_NORMAL_LINES = 150000;
export function autoNormalLength(layout, scale = 1)   // min(max(0.5 p_min, 0.01 d), 0.04 d) x scale, clamped to [0.005, 5] m; 0 when empty
export function decimationStride(total, cap = MAX_NORMAL_LINES)   // Math.max(1, Math.ceil(total / cap))
export function countNormalLines(meshes, { vertex, face })        // {vertexLines, faceLines}: vertices; quads (6 indices) or triangles
export function writeVertexNormalLines(out, src, opts)  // p = M x, n = normalize(N n); kept iff out.seen++ % stride === 0; no allocation
export function writeFaceNormalLines(out, src, opts)    // per quad: winding-derived area-weighted normal from the centroid
export function uploadCount(written)                    // 6 * written (updateRange.count of both attributes)
export function formatCount(n)                          // '3,444' (fixed regex, no Intl)
export function formatNormalStats({ vertexLines, faceLines, total, stride, lengthM, vertex, face, empty })   // {text, warning} (01 3.5)
```
Matrices arrive as plain column-major arrays (`Matrix4.elements`, `Matrix3.elements`); `out = {positions, colors, count, seen}` holds the caller's reused `Float32Array`s.

#### `js/geometry/SafeDistanceBand.js` (08 P2-5b, 08 6.9; B-M15 and B-L29 fixed; imports nothing)
```js
export const SAFE_BAND_EPS = 0.001;   // the clamp margin (m)
/** The single run of a WallLayout: {points: layout.flatEdges(), facing: all +1 (01's flatEdgeFacing() later),
 *  sectionOfVertex: per vertex its sections as {curveDeg, panelW} (a section's own edges; a join vertex in both)}. */
export function bandRunOfLayout(layout)
/** 08 6.9 over one run {points, facing?, sectionOfVertex?} (02 6.12, CR-08-a) or a WallLayout (wrapped by
 *  bandRunOfLayout): consecutive coincident points merge; per segment t, L, m = σ(-t.z, 0, t.x); per interior vertex the
 *  signed turn θ, split = σ changes || 1 + m[k-1]·m[k] < 0.03, τ = split ? 0 : max(0, tan(σθ/2)); lim[j] = max(0, L - eps)
 *  / (τ[j] + τ[j+1]) (+∞ for 0); d[k] = max(0, min(D, lim[k-1], lim[k], r_s - eps over the concave sections of k)),
 *  r_s = panelW / (2 tan(c/2)); offset vertices w + d·m at the ends, two at a split, else the mitre
 *  w + d·(m[k-1] + m[k]) / (1 + m[k-1]·m[k]). Vertices: the wall points, then the offset vertices, all at y = lift; colours
 *  'wall', 'threshold' (d === D) or 'clamped' (counted); per segment (w[j], E, w[j+1]), (w[j], S, E) for σ > 0 (mirrored
 *  for σ < 0), a triangle with doubled area < 1e-12 m² dropped: every triangle faces +Y. outline = the offset vertices,
 *  labelAnchor = outline[floor(n / 2)] (the legacy label index).
 *  @returns {{positions, colors, indices, outline, labelAnchor, clampedVertices, totalSafeVertices, distance: D, lift,
 *            lineLift}} empty arrays and labelAnchor null for fewer than two distinct points */
export function buildSafeDistanceBand(input, D, { lift = 0.005, lineLift = 0.02, eps = SAFE_BAND_EPS } = {})
```
Flat walls give the legacy quad positions (deduplicated: one wall and one offset vertex per edge) with the legacy diagonal, so `camera/13_safe_distance` is unchanged. The clamp is local: overlaps between non-adjacent segments (a U-shaped stage narrower than 2 D, `box_corner`) are documented and not removed (08 6.9, Q18).

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
Policies: `LEDWallView` tracks only its two group roots with `disposeMaps: true` (the B-H5 fix of Phase 1C H1, whose switch `Strategies.dispose.wallTextures` 08 P2-12a retired: the old wall's material maps, i.e. the panel-ID `CanvasTexture`s and the LED tile clones, are disposed; each map belongs to exactly one material (in panel mode with panel IDs one material and its map are shared by the panels of a section since 08 P2-12d, so the traverse disposes them once per panel; in three r128 a second `dispose` event finds no listener and is a no-op), and the tile cache masters are never placed on a material, so they are never disposed here), using one tracker per rebuild: `rebuild()` step 2 creates it and step 1 of the next rebuild disposes it; `SafeDistanceView` uses `disposeObject3D(group, { maps: true })` (legacy 2770); `CameraRigView` and `PropViews` use `maps: false`; `TransformGizmo` always disposes its replaced or removed group (geometries and materials, no maps; the B-L12 fix of Phase 1C H2, whose switch `Strategies.dispose.gizmo` 08 P2-12a retired). `ResourceTracker.js` itself carries no tag. Feature 5 (HDR/PMREM) and the Phase 1C flips used the same class.

#### `js/render/SceneManager.js`
```js
export const LAYERS = Object.freeze({ DEFAULT: 0, HELPERS: 1, ENVIRONMENT: 2, DEBUG: 3 });   // 07 R1 (07 5.2.1 layer table)
export const LAYER_MASKS = Object.freeze({ MAIN: 0b1111, MAIN_PILOT: 0b1101, PREVIEW: 0b0101 });   // 07 6.2

export class SceneManager {
  /** deps only (R4): no THREE allocation in the constructor.
   *  @param {{canvas: HTMLCanvasElement, win: Window, display: DisplaySettings, theme: {scene: SceneTheme}}} deps */
  constructor({ canvas, win, display, theme })

  /** Legacy init body 1427-1449, same statement order:
   *  container = canvas.parentElement; scene = new THREE.Scene(); scene.background = new THREE.Color(theme.scene.background);
   *  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000); camera.position.set(0, 0, 8);
   *  camera.layers.mask = LAYER_MASKS.MAIN   (07 R1: every layer; no id, no pixel change outside pilot mode);
   *  audit = /[?&]debug=1(?:&|$)/.test(win.location?.search ?? '')
   *  renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setSize(container.clientWidth, container.clientHeight);
   *  renderer.setPixelRatio(Math.min(win.devicePixelRatio, 2));
   *  scene.add(new THREE.AmbientLight(0xffffff, 0.3)); pointLight = new THREE.PointLight(0xffffff, 0.8); pointLight.position.set(5, 5, 10);
   *  scene.add(pointLight); grid = new THREE.GridHelper(50, 50, 0x2a2a3a, 0x1a1a24); grid.position.set(12.5, 0, 12.5)
   *  (legacy values; 03 T10: theme.scene.grid is 100 x 100 at (0, 0, 0), centred on the stage origin);
   *  this.addHelper(grid); this.addHelper(new THREE.AxesHelper(0.5))   (values from theme.scene) */
  init()

  get scene(); get camera(); get renderer(); get canvas(); get grid(); get axes()   // valid after init()
  /** scene.add / scene.remove for content objects (wall, frames, props). */
  add(object3D)
  remove(object3D)
  /** 07 R1 (5.2.1, 6.2): #helperRoots.set(o, layer); layer === 'default' -> #passHidden.add(o); scene.add(o); unless
   *  'default', o.traverse(n => n.layers.set(layer)). Layers: HELPERS (default: grid, axes, camera rig, safe-distance
   *  group, pivot marker), DEBUG (normal lines), ENVIRONMENT (Feature 5's dome), 'default' (the hand-written gizmo:
   *  layer 0, hidden around the preview pass, still drawn in pilot mode until 08 P2-9j, B-L26). */
  addHelper(object3D, { layer = LAYERS.HELPERS } = {})
  /** Re-tags the subtree of o now with the layer of the registered root that contains it (no-op otherwise or under a
   *  'default' root); optional, the per-frame enforcement covers it. */
  tagHelper(object3D)
  /** scene.remove(o); #helperRoots.delete(o); #passHidden.delete(o) */
  removeHelper(object3D)
  /** on ? camera.layers.enable(HELPERS) : camera.layers.disable(HELPERS)   (07 Q7; PilotController.toggle) */
  setHelpersVisibleInMain(on)
  /** saved = each #passHidden root's visible; all false; try { return fn() } finally { restore each saved value } */
  withPassHidden(fn)
  /** showGrid = !showGrid; if (grid) grid.visible = showGrid  (2578-2583). Mutates display.showGrid. */
  toggleGrid()
  /** win.addEventListener('resize', () => this.onResize())  (1453) */
  attachResize()
  /** Verbatim 3877-3882 (container = renderer.domElement.parentElement). */
  onResize()
  /** Legacy animate 3884-3890: const frame = () => { win.requestAnimationFrame(frame); tick(); }; frame();
   *  The first frame runs synchronously, before setupUI, exactly like legacy. */
  startLoop(tick)
  /** 03 T5 (07 C46; 07 R3 moves it onto the frame graph): registers a hook run before every main render with the main camera */
  addPreRender(hook)
  /** 07 R2: #passes = [...passes]   (App: [previewPass]; injection avoids the PreviewPass -> SceneManager import cycle) */
  setPasses(passes)
  /** One frame (07 5.2.1): #enforceHelperLayers() (every registered root's subtree re-tagged, 07 6.2); under ?debug=1 every
   *  120th frame the audit (a node with userData.helper === true under no registered root: win.console.warn('unregistered
   *  helper', n)); for (hook of #preRender) hook(camera); renderer.render(scene, camera) (03 T5: the pivot marker's
   *  updateScale); for (pass of #passes) pass.render(scene) (07 R2: the camera preview) */
  renderFrame()
  render()           // alias of renderFrame() (07 5.2.1)
}
```
State: `#scene`, `#camera`, `#renderer`, `#grid`, `#axes`, `#helperRoots: Map<Object3D, layer>` and `#passHidden: Set` (07 R1; `get helpers()` and P2-10a's visibility loop are gone), `#audit`, `#framesRendered`, `#preRender` (03 T5), `#passes` (07 R2). The main camera is shared by reference with `OrbitController`, `PilotCameraDriver`, `PilotController` and `PointerRay` (they read `sceneManager.camera` at use time).

#### `js/render/LEDWallView.js`
```js
export class LEDWallView {
  /** @param {{sceneManager: SceneManager, materials: LEDMaterialFactory, builder: WallMeshBuilder (viewport profile),
   *           theme: {scene: SceneTheme}, debugMaterials: DebugMaterials}} deps   (debugMaterials: 01 F1-1) */
  constructor({ sceneManager, materials, builder, theme, debugMaterials })
  get wallGroup(); get frameGroup()     // legacy ledWallGroup / frameGroup

  /** Legacy createLEDWall body minus layout and tail (1458-1477, 1551-1572), in this order:
   *  0. (01 F1-1) #override.restore(): the content materials go back before step 1, so a rebuild disposes the real
   *     materials and never the shared debug ones; #display = display
   *  1. #tracker.dispose() (the previous rebuild's tracker, if any): for the previous wall group then the previous frame
   *     group: sceneManager.remove(group)
   *     then disposeObject3D(group, {maps: true}) (the B-H5 fix of Phase 1C H1; 08 P2-12a retired its switch:
   *     maps are disposed too); apart from the maps this is exactly legacy remove-wall, dispose-wall, remove-frames,
   *     dispose-frames (1458-1474).
   *  2. wallGroup = new THREE.Group(); frameGroup = new THREE.Group();
   *     #tracker = new ResourceTracker({ disposeMaps: true });
   *     #tracker.track(wallGroup, {detach: () => sceneManager.remove(wallGroup)}); the same for frameGroup
   *  3. sections = layout.sections.map(sl => sl.section); atlas = computeAtlas(sections)   (pure, no THREE ids);
   *     materials.beginRebuild()   (08 P2-1d: the panel-ID fallback warning is given once per section and rebuild)
   *     meshMode === 'combined' -> #buildCombined; === 'section' -> #buildSections; === 'panel' -> #buildPanels;
   *     else throw Error('Unknown mesh mode "<mode>"') (08 P2-3b, B-L8 fixed: unreachable after the validator; legacy
   *     rendered any unknown mode as panels)   (1551-1557)
   *  4. if (display.showFrame) #buildFrames(layout, display)   (06 T5: adaptive colours)     (1559-1569)
   *  5. sceneManager.add(wallGroup); if (display.showFrame) sceneManager.add(frameGroup)    (1571-1572)
   *  6. (01 F1-1) if (#shading !== 'content') #applyShading()   (a direct step, not a subscription, R2)
   *  @param {{layout: WallLayout, meshMode: string, display: DisplaySettings}} args */
  rebuild({ layout, meshMode, display })

  /** 01 F1-1 (01 5.2). 'content': #override.restore(). Otherwise mat = debugMaterials.forShading(mode);
   *  mat.wireframe = display.wireframe; #override.apply(meshes(), mat). Idempotent; kept across rebuilds; no event. */
  setDebugShading(mode)
  /** 07 C48: stills and screenshots. Override shown: #override.restore(); try { return fn() } finally { #applyShading() };
   *  otherwise fn(). Synchronous; PreviewPass.capture (07 R4) and 09's captureCanvas call it unless include.debug. */
  withContentMaterials(fn)

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
- `#buildPanels(layout, atlas, display)` (1776-1802): per `sl` (index `i`): with `display.panelIdsEnabled` (08 P2-12d, 08 6.15; B-M16 and, for the viewport, B-L19 fixed) first `shared = materials.sectionShared(sl.section, sl.sectionIndex, atlas.entries[i].startCol)`, one material per section; then per `panel` of `sl.panels`: `geometry = new THREE.PlaneGeometry(sl.panelW, sl.panelH)`; with panel IDs the panel's section-space UVs `builder.panelUvs(panel, sl)` are written into the PlaneGeometry's `uv` attribute (its vertex order TL, TR, BL, BR takes the builder corners `[3, 2, 0, 1]`, module-private `writePanelUvs`) and `material = shared`; otherwise (LED sim, colour: unchanged) `material = materials.panel(sl.section, sl.sectionIndex, atlas.entries[i].startCol + panel.col, panel.row)` (raw `+`, B-L8) on the PlaneGeometry's own 0..1 UVs; mesh; `position.set(panel.x, panel.y, panel.z)`; `rotation.y = panel.rotY`; `userData = { kind: 'led-wall', mode: 'panel', sectionId, sectionIndex, col: panel.col, row: panel.row }`; add.
- `#buildFrames(layout, display)` (1560-1568): per section `color = frameColorFor(sl.section.color, display, theme.scene)` (06 T5, 6.7: `theme.scene.frame` (light) or `theme.scene.frameOnLight` (dark), whichever contrasts more with the section colour; light with panel IDs, LED sim, HDRI content (spec 05) or wireframe, and for a colour that is not `#rrggbb`; >= 3.65:1 for any colour); per panel: `new THREE.EdgesGeometry(new THREE.BoxGeometry(sl.panelW, sl.panelH, 0.02))`, `new THREE.LineSegments(frameGeometry, new THREE.LineBasicMaterial({ color }))`, position, `rotation.y`, `frameGroup.add`. (The inner BoxGeometry is not tracked, as legacy never disposed it.) Every change of colour, content mode or wireframe rebuilds (6.2), so the frame colour never goes stale.

`userData` tags are non-observable (the wall is never raycast in Phase 1).

`indexAttribute(indices)` (module-private, 08 P2-1e; the viewport side of B-L5, 08 6.2): `indexWidth(maxIndexOf(indices)) === 'uint32' ? new THREE.Uint32BufferAttribute(indices, 1) : indices`. Below a largest index of 65,535 the plain array is passed as before, and r128's `setIndex` stores it as Uint16 (no output changes); r128 alone switches to Uint32 only above 65,535, so a combined mesh of exactly 65,536 vertices would have stored the primitive-restart value 65,535 in a Uint16 index and lost a triangle. Panel mode uses `PlaneGeometry` (4 vertices) and is unaffected.

#### `js/render/MaterialOverride.js` (01 F1-1; imports nothing, Node-tested with plain objects)
```js
export class MaterialOverride {
  apply(meshes, material)   // per mesh: stash mesh.material once (a Material[] by reference), then mesh.material = material
  restore()                 // every stashed material back on its mesh, stash cleared; @returns the count
  get active()              // stash not empty
}
```

#### `js/render/DebugMaterials.js` (01 F1-1, 01 6.8)
```js
export class DebugMaterials {
  constructor({ theme })    // no allocation (R4): every material is created on first use, so nothing changes until used
  faceOrientation()         // shared ShaderMaterial, DoubleSide: gl_FrontFacing ? uFront : uBack (theme.scene.debug), shaded
  normalColors()            // shared ShaderMaterial, DoubleSide: world normal * 0.5 + 0.5 (modelMatrix * vec4(normal, 0.0))
  forShading(mode)          // 'content' -> null; 'faceOrientation' | 'normalColors' -> the material; else RangeError
  lineMaterial({ onTop })   // shared LineBasicMaterial({vertexColors: true, toneMapped: false}); depthTest = !onTop
  dispose()                 // App teardown only; never called by a wall rebuild
}
```

#### `js/render/NormalsDebugView.js` (01 F1-1, 01 5.2, 6.7)
```js
export class NormalsDebugView {
  /** Subscribes WALL_REBUILT ({layout, view}) => { #last = {layout, view}; if (settings.normals.enabled) sync() } (R3: only its
   *  own LineSegments and stats element). elements.stats is #debug-normals-stats (owned here; App looks it up and injects it
   *  since 01 F1-2); every stats write is guarded, so the view also works without it.
   *  Allocates nothing with a THREE id (one scratch Matrix3, a Float64Array(9), reused descriptors). */
  constructor({ sceneManager, bus, settings, materials, theme, elements = {} })
  get object3D(); get stats()
  /** Off or no rebuild seen: remove. On: count, stride, length (keepLength for live drags), grow buffers to
   *  min(150,000, max(1024, nextPow2(kept))) lines, write vertex then face lines per mesh with one running counter, upload
   *  the written prefix (updateRange), setDrawRange; the LineSegments is on LAYERS.DEBUG only (07 R1; visible in pilot
   *  mode, never in the preview), raycast no-op, frustumCulled false, matrixAutoUpdate false, userData.helper, renderOrder
   *  RENDER_ORDER.NORMAL_LINES_ON_TOP or DEFAULT, added with sceneManager.addHelper(lines, { layer: LAYERS.DEBUG }); timed by performance mark/measure 'normals:sync' (latest only). */
  sync({ keepLength = false } = {})
  dispose()                 // removeHelper, geometry.dispose(); the shared line material stays
}
```

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
   *  else ledSim: MeshBasicMaterial({ map: ledTiles.tiled(atlas.totalLedX, atlas.totalLedY, new THREE.Color("white")),
   *               vertexColors: true, side, wireframe }) (08 P2-7e, B-L18 fixed: the white tile times the per-section
   *               vertex colours; `Strategies.combinedLedSimColor` retired; legacy had no vertexColors, so the LEDs were
   *               white); the repeat totalLedX x totalLedY is one tile per LED, since 08 P2-7a (B-M5 fixed) also
   *               vertically: each section spans v 0..uvHeight
   *  else:        MeshBasicMaterial({ vertexColors: true, side, wireframe }) */
  combined(sections, atlas)
  /** panelIds: panelIds.sectionCanvas(section, sectionIndex, null, startCol) -> CanvasTexture (+needsUpdate) -> material;
   *  ledSim: ledTiles.tiled(section.panelCols * section.ledX, section.panelRows * section.ledY, section.color);
   *  else: { color: new THREE.Color(section.color), side, wireframe } */
  section(section, sectionIndex, startCol)
  /** 08 P2-12d (08 6.15): the material shared by every panel of one section in panel mode with panel IDs: section(section,
   *  sectionIndex, startCol), so the panels sample the section canvas (logo and section-label size included, B-L19) through
   *  their section-space UVs; at most one panel-ID canvas per section (B-M16). 04 UV-9 adds the budgeted `scale`. */
  sectionShared(section, sectionIndex, startCol)
  /** panelIds: canvas = panelIds.panelCanvas(globalCol, row, section.ledX, section.ledY, section, scale) -> CanvasTexture
   *  (+needsUpdate) (since 08 P2-12d reached only by 04's uv.panel_uvs = 'panel' option; `scale` is the rebuild's
   *  wall-wide panelPxPerLed, default the PanelIdRenderer default);
   *  ledSim: ledTiles.tiled(section.ledX, section.ledY, section.color); else colour (as section()) */
  panel(section, sectionIndex, globalCol, row, scale = undefined)

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
  /** Verbatim 1807-1856, except the cache key `${new THREE.Color(color).getHexString()}-${display.ledLayout}` (08 P2-7e:
   *  legacy stringified the argument, so a THREE.Color gave "[object Object]"). On a miss: 64x64 canvas, background
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
  /** Verbatim 2002-2046 (the per-panel canvas; since 08 P2-12d reached only by 04's uv.panel_uvs = 'panel' option).
   *  scale = the rebuild's wall-wide panelPxPerLed(sections), default panelPxPerLed([section]) (B-M16 fixed: legacy
   *  gave each panel 4-16 px/LED with no budget); border colour
   *  panelBorderColors[(col + row) % 3]; borderThickness = style.borderThickness * scale / 4; label
   *  `${columnLabel(col)}${(row + 1).toString()}`; fontSize = style.fontSize * scale / 4 || min(w, h) * 0.4 (=== 0 test);
   *  section name at fontSize * 0.25 when style.sectionLabelEnabled && section && section.name.
   *  LEGACY(B-L19): no logo, sectionLabelFontSize ignored (reachable only with uv.panel_uvs = 'panel').
   *  @returns {HTMLCanvasElement|null}  null, with no canvas created, when ledX * scale x ledY * scale does not satisfy
   *  canvasFits (08 P2-1d) */
  panelCanvas(col, row, ledX, ledY, section, scale = panelPxPerLed([section]))
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
   *  panelSize(section, scale = panelPxPerLed([section])): {width: ledX * scale, height: ledY * scale}
   *  sectionSize(section, overrideScale): w = panelCols * ledX, h = panelRows * ledY, scale = overrideScale ||
   *    sectionPxPerLed(w, h); {width: w * scale, height: h * scale}
   *  atlasSize(sections, atlas = computeAtlas(sections)): {width: totalLedX * pxPerLed, height: totalLedY * pxPerLed} */
  panelSize(section, scale = panelPxPerLed([section]))
  sectionSize(section, overrideScale)
  atlasSize(sections, atlas = computeAtlas(sections))
  /** 06 T5 (06 5.6, the font gate): before each fillText (panel label, section name, section label) the renderer calls
   *  doc.fonts?.check?.(font, text) with the actual text (a missing FontFaceSet or a throwing check counts as loaded);
   *  a false check records [font, text] (deduplicated, in draw order) and, the first time a pair is recorded, calls
   *  doc.fonts.load(font, text) fire-and-forget (rejection swallowed). takePendingFonts() returns the recorded pairs and
   *  clears the list. Drawing itself is unchanged. */
  takePendingFonts()
}
```

#### `js/render/CameraRigView.js`
```js
export class CameraRigView {
  static MAX_FRUSTUM_DEPTH_M = 15;   // 08 P2-11b: FrustumCoverage.MAX_FRUSTUM_DEPTH_M, the depth of a corner without one
  /** @param {{sceneManager: SceneManager, bus: EventBus, theme: {scene: SceneTheme}}} deps */
  constructor({ sceneManager, bus, theme })
  get exists()       // !!group   (legacy previewCameraGroup truthiness)
  get group()
  get bodyMesh()     // legacy cameraBodyMesh: set by create(), nulled by remove() since 08 P2-4a (legacy kept it, 2536-2548)
  /** Verbatim 2321-2344: if (group) { sceneManager.removeHelper(group); disposeObject3D(group) }; group = new THREE.Group();
   *  bodyGeom = new THREE.BoxGeometry(0.15, 0.1, 0.2); bodyMat = MeshBasicMaterial({color, transparent: opacity < 1, opacity});
   *  bodyMesh = new THREE.Mesh(bodyGeom, bodyMat); bodyMesh.position.z = 0.15;
   *  (06 T5, D15) bodyMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeom),
   *    new THREE.LineBasicMaterial({ color: cameraBody.outlineColor })))   (the edge outline; never picked); group.add(bodyMesh);
   *  this.rebuildFrustum(cine, cornerDepths)   (first build: emits CAMERA_LENS_CHANGED, the duplicate legacy write is kept);
   *  sceneManager.addHelper(group); this.updateTransform(cine) */
  create(cine, cornerDepths = null)
  /** Verbatim 2346-2429 minus the dead wallIntersectionPlane branch:
   *  remove + dispose the previous lines (halo and core: the shared geometry, both materials) and fill (if any);
   *  hFov = cine.hFov(); vFov = cine.vFov();
   *  bus.emit(CAMERA_LENS_CHANGED, { hFov, vFov, filmbackWidth: cine.filmbackWidth, filmbackHeight: cine.filmbackHeight })
   *    (exactly at the legacy readout point 2369-2371);
   *  08 P2-11b (B-L33 fixed): nearPlane = 0.2; depths = (cornerDepths ?? [MAX_FRUSTUM_DEPTH_M x 4]) each floored at
   *  nearPlane; far corner c (TL, TR, BR, BL) = (sx * tx * d_c, sy * ty * d_c, -d_c) with tx = tan(hFov / 2),
   *  ty = tan(vFov / 2) (the analyser's camera-space depths: the corner ray's hit, so neither lines nor fill poke
   *  through the wall; all 15 is the legacy rig bit for bit); corners and the 24 line vertices in legacy push order; lines (06 T5, two-tone, 06 6.6): one BufferGeometry + Float32BufferAttribute, drawn by the halo
   *  LineSegments(LineBasicMaterial{haloColor, transparent: opacity < 1, opacity}) at renderOrder RENDER_ORDER.DEFAULT
   *  and the core LineSegments(LineDashedMaterial{color, dashSize, gapSize, transparent, opacity}) at
   *  RENDER_ORDER.RIG_CORE, with core.computeLineDistances() (each segment its own distance range; never a LineLoop);
   *  fill: BufferGeometry + BufferAttribute(Float32Array of the 30 vertices) + Mesh(MeshBasicMaterial{color, transparent,
   *  opacity 0.08, side: DoubleSide, depthWrite: false}); both added to group. */
  rebuildFrustum(cine, cornerDepths = null)
  /** Verbatim 2431-2449: if (!group) return; position.set(posX, posY, posZ); rotation.order = 'YXZ';
   *  rotation.set(rotX * Math.PI / 180, rotY * Math.PI / 180, rotZ * Math.PI / 180) */
  updateTransform(cine)
  /** Verbatim 2536-2548: if (group) { sceneManager.removeHelper(group); disposeObject3D(group); group = bodyMesh = linesHalo =
   *  linesCore = fill = null } (bodyMesh nulled since 08 P2-4a, the 08 2.2 observation). Does not touch the safe-distance
   *  group: CameraController.setPreviewEnabled(false) removes it right after, through hub.syncSafeDistance() (08 P2-4b). */
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
  get lastBand()     // 08 P2-5b: the SafeBand of the current group (null when none); read by the safe-distance OBJ export
  /** 2586-2762 minus the walk and bounds copies (08 P2-5b: B-M15 and B-L29 fixed, Strategies.safeDistanceBand retired):
   *  this.remove(); group = new THREE.Group();  D = cine.maxSafeDistance(extent) (08 P2-11c: the framing's stageExtent);
   *  band = buildSafeDistanceBand(layout, D)
   *  (geometry/SafeDistanceBand, 3.6: the mitred, clamped strip over layout.flatEdges(), every triangle +Y); lastBand = band.
   *  (layout and bounds arrive precomputed from CameraHub.syncSafeDistance: PR7)
   *  if (band.positions.length > 0): mesh (BufferGeometry + position + color (per band colour: 'wall' wallColor,
   *  'threshold' thresholdColor, 'clamped' clampedColor) + setIndex + computeVertexNormals ((0, 1, 0)) +
   *  MeshBasicMaterial{vertexColors, transparent, opacity 0.5, DoubleSide, depthWrite false}); line (LineBasicMaterial{color,
   *  transparent, opacity 0.8, linewidth 2} created BEFORE its BufferGeometry, the band outline at y = band.lineLift = 0.02);
   *  label sprite: 256x64 canvas, fillStyle labelColor, font labelFont, textAlign center, fillText(`Max: ${D.toFixed(2)}m`,
   *  128, 40), CanvasTexture, SpriteMaterial({map, transparent: true}), Sprite at (labelPos.x, 0.5, labelPos.z) with
   *  labelPos = band.labelAnchor (the legacy middle index), scale (2, 0.5, 1).
   *  ALWAYS sceneManager.addHelper(group), even when there are no edges (empty wall: [] edges, empty group, no throw).
   *  The legacy inner guard `if (!cameraPreviewEnabled) return` (2589) is unreachable (its only caller checks it) and dropped.
   *  03 T3 (7.1): right after the group is allocated, group.userData.stageOrigin = {x, z} of
   *  layout.pivot?.resolution?.stageOrigin ?? {x: 0, z: 0} (layout frame), read by the safe-distance OBJ.
   *  @param {{layout: WallLayout, cine: CineCamera, extent: {width, height}}} args   (08 P2-11c: the framing's stageExtent;
   *  `bounds` with the flat {totalWidth, maxHeight} before) */
  create({ layout, cine, extent })
  /** Verbatim 2764-2776: if (group) { sceneManager.removeHelper(group); disposeObject3D(group, { maps: true }); group = null };
   *  lastBand = null */
  remove()
}
```
Note for id-based comparisons: three r128 Sprites share one module-level geometry, created by the first Sprite ever made; `remove()` disposes it through the label sprite (`maps: true` traversal), exactly as legacy 2767-2772 did. Any comparison of allocation ids must treat that geometry as shared.

#### `js/render/PreviewWindow.js`
**Since 07 R2** (B-M9, B-L32 fixed; 07 3.6, 5.2.2): the DOM frame only. The second `WebGLRenderer`, its camera, `render()` and `updateCamera()` are gone (the camera and the labels' texts are `PreviewPass`'s); `#camera-preview-canvas` is a layout placeholder (`display: block; visibility: hidden` in `css/99-utilities.css`, its inline 100% size, no WebGL context, no width/height attributes) whose client rect is the preview rectangle; `.preview-window` is transparent with square corners.
```js
export class PreviewWindow {   // owns #camera-preview-window and its children (elements are injected by App)
  /** @param {{doc: Document, cine: CineCamera, elements: {windowEl, canvas, resizeHandle, info, fov, res}}} deps
   *  (`windowEl` = #camera-preview-window; the key is not called `window`, see check rule 3) */
  constructor({ doc, cine, elements })
  get initialized()  // the resize listeners are registered (legacy `if (!previewRenderer)`)
  get visible()      // elements.windowEl.style.display !== 'none'
  /** elements.windowEl.style.display = on ? 'block' : 'none'  (4234) */
  setVisible(on)
  /** if (!#resize) #setupResize()   (3634-3645: only the resize registration is left) */
  init()
  contentRect()      // elements.canvas.getBoundingClientRect(): the preview rectangle (CSS px)
  setLabels({ info, fov, res })   // the three textContent writes
  /** private #setupResize(): verbatim 3647-3700 (handle mousedown with preventDefault + stopPropagation, doc mousemove and
   *  doc mouseup listeners added on the FIRST init only; body cursor); newWidth = Math.max(200, Math.min(800, startWidth +
   *  deltaX)); newHeight = newWidth / (filmbackWidth / filmbackHeight); {w, h} = PreviewFit.clampPreviewSize(newWidth,
   *  newHeight) (07 R2, B-L32 fixed: each axis on its own; legacy re-derived the width from the clamped height);
   *  windowEl.style.width/height = `${w}px` / `${h}px`. */
}
```
**Before 07 R2** (kept for the record):
```js
export class PreviewWindow {
  constructor({ doc, win, cine, elements })
  get initialized()  // !!renderer   (legacy `if (!previewRenderer)`)
  get camera(); get renderer()
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
  /** 07 R1: if (!cine.enabled || !renderer || !camera) return; renderer.render(scene, camera). The camera's layer mask is
   *  LAYER_MASKS.PREVIEW (set when updateCamera creates it), so no HELPERS or DEBUG object reaches the preview, and App calls
   *  this inside sceneManager.withPassHidden (the gizmo). Until 07 R1 (08 P2-10a, B-M11 fixed; 08 6.14):
   *  for each helper: save helper.visible, then helper.visible = false; try { renderer.render(scene, camera) } finally
   *  { restore every saved flag in order }. helpers = sceneManager.helpers (the App tick). No layer is assigned, so the
   *  main view, picking (gizmo handles, camera body) and a helper hidden by the user (the grid toggle) are unaffected.
   *  `Strategies.previewRendersHelpers` is retired; legacy rendered the whole scene, so the frustum fill's near quad
   *  tinted the full frame orange and the grid, axes, rig, safe-distance floor and gizmo showed. */
  render(scene)
  /** private #setupResize(): verbatim 3647-3700 (handle mousedown with preventDefault + stopPropagation, doc mousemove and
   *  doc mouseup listeners added on the FIRST init only: init() calls it while the private #resize state, which it creates
   *  (the legacy closure state of 3650-3651), is null; body cursor; clamps 200-800 / 120-600 with the filmback aspect;
   *  LEGACY(B-L32) width recomputed from the clamped height without re-clamping; renderer.setSize(newWidth, newHeight)). */
}
```

#### `js/render/PreviewPass.js` (07 R2; 07 5.2.2, 6.1)
```js
export class PreviewPass {   // the camera preview drawn by the main renderer into the main canvas, after the main pass
  /** deps only (R4). @param {{sceneManager: SceneManager, cine: CineCamera, previewWindow: PreviewWindow}} deps
   *  (07 names the window `window`; the key is `previewWindow`: check rule 3) */
  constructor({ sceneManager, cine, previewWindow })
  get camera()       // the preview PerspectiveCamera (created by the first updateCamera), mask LAYER_MASKS.PREVIEW
  /** Verbatim 3702-3740 (moved from PreviewWindow.updateCamera): hFovDeg / vFovDeg (legacy association); aspect = cine.aspect();
   *  PerspectiveCamera(vFovDeg, aspect, 0.1, 100) on the first call (mask LAYER_MASKS.PREVIEW), else fov/aspect +
   *  updateProjectionMatrix; position; rotation.order 'YXZ'; rotation.set(tilt, pan, roll); previewWindow.setLabels({info:
   *  `${cine.focalLength}mm • ${cine.presetShortName()}`, fov: `H: ${hFovDeg.toFixed(1)}° V: ${vFovDeg.toFixed(1)}°`, res:
   *  `${Math.round(1080 * aspect)}×1080`}). LEGACY(B-L34) fake resolution, first-word preset name (08 P2-10c lands here). */
  updateCamera()
  /** 07 6.1: if (!cine.enabled || !camera || !previewWindow.visible) return; dpr = renderer.getPixelRatio(); S = renderer.getSize();
   *  rects = PreviewFit.previewDeviceRects({canvasRect: sceneManager.canvas.getBoundingClientRect(), contentRect:
   *  previewWindow.contentRect(), dpr, size: S, aspect: filmbackWidth / filmbackHeight}) (integer device px, y from the
   *  bottom on the integer drawing-buffer height; null under 50 x 30 CSS px: return); save the clear colour and alpha;
   *  setScissorTest(true); viewport = scissor = the box; setClearColor(0x000000, 1); clear(true, true, false) (the bars);
   *  viewport = scissor = the letterboxed image (PreviewFit.letterboxRect, rounded, centred); the camera's aspect follows
   *  the filmback if it changed; sceneManager.withPassHidden(() => renderer.render(scene, camera)) (scene.background clears
   *  the image box); finally: restore the clear colour, setScissorTest(false), setViewport(0, 0, S.x, S.y). Every CSS value
   *  passed to three is PreviewFit.cssForDevicePx(n, dpr) = (n + 0.5) / dpr, which three floors back to n. */
  render(scene)
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


#### `js/render/PivotMarkerView.js` (03 T5; docs/improvements/03-pivot.md 3.3, 5.3)
```js
export class PivotMarkerView {
  /** R4: no allocation. Mirrors (its own objects only): WALL_REBUILT({layout}) -> #place(layout.pivot.resolution) (ignored
   *  until init); WALL_PIVOT_CHANGED({resolution}) -> #place(resolution) + visibility; SELECTION_CHANGED({id}) -> the
   *  selected colour + visibility.  @param {{sceneManager, bus, display: DisplaySettings, theme: {scene: SceneTheme}}} deps */
  constructor({ sceneManager, bus, display, theme })
  /** Once, the LAST bootstrap step (5.8): the root group (renderOrder RENDER_ORDER.PIVOT_MARKER on every group: r128's group
   *  order), the glyph (a dashed cross of +-glyphHalfSize and an octahedron core of coreRadius, each a light core over a
   *  Morph Black halo, 06 5.12; the octahedron halo is the same shape x 1.35, drawn first; the invisible pick proxy
   *  SphereGeometry(pickRadius, 12, 8) with MeshBasicMaterial({visible: false})), the anchor ghost (a dashed cross of
   *  +-0.12 m in anchorColor), the dashed link and drop segments; every material transparent, opacity 0.9, depthTest and
   *  depthWrite off; every object on LAYERS.HELPERS (the preview camera never sees it; the main camera does); halos at
   *  renderOrder 0, cores at 1 inside the group order; sceneManager.addHelper(group); #place(resolution). */
  init(resolution)
  get exists(); get visible(); get hasResolution(); get group()
  pickMeshes()            // [the pick proxy] ([] before init)
  /** stage frame: resolution ? (preview.x, P.y + preview.y, preview.z) : the preview alone (never reads null) */
  glyphPosition(out)
  setPreview(dx, dy, dz)  // the glyph, the drop and the link follow; the ghost stays (no allocation: positions written in place)
  clearPreview()
  /** s = max(1, minScreenHalfSizePx * (2 d tan(degToRad(fov) / 2) / heightPx) / glyphHalfSize) on the glyph and the ghost;
   *  d = the camera's distance to the glyph. No-op before init, while hidden or for heightPx <= 0. A pre-render hook. */
  updateScale(camera, heightPx)
  dispose()               // removeHelper + the tracker (maps: false)
}
```
Placement (`#place`): glyph at `(0, P.y, 0)` plus the preview; ghost at `A - O = (-offset.x, A.y, -offset.z)`, shown (with the link
from it to the glyph) while the effective offset (offset plus preview) is non-zero; the drop line from `(gx, 0, gz)` to the glyph
while `|gy| > 1e-6`. Visibility: `hasResolution && !pilot && (display.showPivotMarker || the pivot is selected)` (the pilot term since 03 T9, from `PILOT_CHANGED`). A null resolution hides
the marker and skips every geometry update. The cross and octahedron cores are `selectedColor` while the pivot is selected.

### 3.8 Interaction

#### `js/interaction/InputState.js`
```js
/** Shared, tiny interaction flags (breaks the orbit / gizmo / pilot cycles). Single writers:
 *  pilotMode <- PilotController.toggle only; isDraggingGizmo, gestureCancelled and snap <- TransformGizmo only (03 T5). */
export class InteractionState {
  pilotMode = false; isDraggingGizmo = false;
  gestureCancelled = false;   // 03 T5 (5.4): set by cancelDrag; cleared by onMouseUp and at the start of onMouseDown
  snap = { pivotM: 0.1 };     // 03 T5 (D9): the Ctrl/Cmd-drag increments; written only through setSnapIncrements (a merge)
}

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
  /** @param {{sceneManager: SceneManager}} deps   (creates one THREE.Raycaster and one THREE.Vector2: no ids);
   *  03 T5: raycaster.layers.enableAll(), so the pivot marker's pick proxy on LAYERS.HELPERS is pickable (picking and
   *  hover raycast only their explicit lists, all on layer 0 before, so no other pick changes); since 07 R1 the camera
   *  body (HELPERS) relies on it too */
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
  /** @param {{sceneManager, keyboard: KeyboardState, interaction: InteractionState,
   *          frameBounds: () => Framing}} deps  the framing of the stage layout (08 P2-11c) */
  constructor({ sceneManager, keyboard, interaction, frameBounds })
  angle = { theta: 0, phi: Math.PI / 2 };                       // legacy cameraAngle; REPLACED by a new object in setView/restore
  distance = 8;                                                 // legacy cameraDistance
  target;  offset;                                              // THREE.Vector3 (legacy targetPosition / targetOffset)
  /** Verbatim 3820-3840 on canvas = sceneManager.renderer.domElement, registered in this order: mousedown (ignored while
   *  interaction.isDraggingGizmo || interaction.pilotMode), mousemove (also ignored while interaction.gestureCancelled, 03 T5:
   *  the swallowed gesture of a cancelled gizmo drag; 0.01 rad/px, phi clamped [0.1, PI - 0.1]),
   *  mouseup, mouseleave, wheel (if pilot: return; preventDefault; distance clamped [2, 30] by deltaY * 0.01).
   *  Then calls updateCameraPosition() where legacy did. Registered in the init phase (before ViewportInput). */
  attach()
  /** 3756-3764; since 08 P2-11c (B-L2 fixed; 03 step F): c = frameBounds().generativeBox.center;
   *  target.set(c.x + offset.x, c.y + offset.y, c.z + offset.z) (the centre of the real wall, whatever its curve, offsets,
   *  pivot or direction; a flat wall along +X at the identity is legacy-exact except the sign of a zero z) */
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
/** @typedef {object} Selectable   implemented by CameraController ('camera'), PropController ('person', 'car') and, since
 *  03 T5, PivotController ('pivot'); Feature 2 adds the section Selectables, Feature 5 a projection-point Selectable.
 *  The optional members are the path-B hook set of 03 5.4 (07 C33, one-to-one with 07's Selectable v2; spec 02 reuses it);
 *  legacy targets implement none of them and behave exactly as in Phase 1.
 * @property {string} id                       'camera' | 'person' | 'car' | 'pivot' | ...
 * @property {string} label                    badge text: 'Camera' | 'Person' | 'Car' (legacy names map 3161) | 'Pivot'
 * @property {'camera'|'prop'|'pivot'|'projector'|'section'} [kind]   REQUIRED for every Selectable added after Phase 1
 *                                             (register throws); inferred only for 'camera' -> 'camera', 'person'/'car' -> 'prop'
 * @property {number} [pickPriority]           default 0; outranks wall (section) hits only. Pivot 10, HDRI point 9.
 * @property {(mode) => {x, y, z: boolean} | null} [allowedAxes]   default all axes in both modes; null = mode unsupported
 *                                             (no handles; left out of SELECTION_CHANGED.modes); a false axis: no handle
 * @property {() => boolean} isPickable        legacy pick gating (3441, 3446, 3455)
 * @property {() => import('three').Object3D[]} pickMeshes   meshes to raycast, in legacy push order (3442-3461)
 * @property {() => boolean} hasGizmoTarget    legacy updateGizmoPosition gating (previewCameraGroup / personMesh / carMesh, 3126-3134)
 * @property {(out: import('three').Vector3) => import('three').Vector3} gizmoAnchor   sets and returns `out`
 * @property {(rotation: import('three').Euler, mode) => void} orientGizmo   local-space orientation (3107-3118); the mode is
 *                                             the gizmo mode (legacy targets ignore it)
 * @property {() => void} [beginGizmoDrag]     TransformGizmo.onMouseDown, on a handle hit
 * @property {(opts: {cancel: boolean}) => void} [endGizmoDrag]   the ONLY end hook: {cancel: false} on the mouse-up that ends a
 *                                             drag; {cancel: true} from cancelDrag() (Escape) and detach() during a drag
 * @property {(movement, ctx) => void} applyGizmoTranslate   domain write + pose event + refresh; ctx = {space, axisWorld,
 *                                             snap} (axisWorld the unit drag axis in world space; snap = interaction.snap iff
 *                                             Ctrl/Cmd is held, else null); legacy targets ignore ctx
 * @property {(axis: 'x'|'y'|'z', deltaDeg: number, ctx) => void} applyGizmoRotate      deltaDeg already signed (Strategies.gizmoRotateSign)
 */
export class SelectionManager {
  /** @param {{bus, gizmo: TransformGizmo, pointerRay: PointerRay, interaction: InteractionState}} deps */
  constructor({ bus, gizmo, pointerRay, interaction })
  /** Registration order is the raycast tie order: App registers camera, person, car, then the pivot (03 5.8).
   *  03 T5: throws for a Selectable without kind unless its id is a legacy one (the kind is then inferred). */
  register(selectable)
  kindOf(selectable)               // 03 T5: the declared or inferred kind; null when not registered
  get selectedId()                 // legacy selectedObject: 'camera' | 'person' | 'car' | null
  get selected()                   // the registered Selectable or null
  isSelected(id)                   // selectedId === id
  find(id)
  /** 3139-3143: selectedId = id; selected = find(id); bus.emit(SELECTION_CHANGED, {id, label: selected?.label, modes}); gizmo.attach(selected)
   *  (03 T5: modes = ['translate', 'rotate'].filter(m => !selected?.allowedAxes || selected.allowedAxes(m) !== null), emitted before attach)
   *  (`?.`: an unregistered id, unreachable because pickAt only selects registered ids, shows the toolbar's 'Unknown'
   *  fallback like legacy `names[selectedObject] || 'Unknown'` instead of throwing) */
  select(id)
  /** 3145-3153: selectedId = null; selected = null; bus.emit(SELECTION_CHANGED, {id: null, label: null, modes: []}); gizmo.detach() */
  deselect()
  /** Legacy handleViewportClick 3427-3474, LEGACY(B-M14) (called on mousedown):
   *  if (interaction.isDraggingGizmo || interaction.pilotMode) return; if (!gizmo.mode) return;
   *  raycaster = pointerRay.fromEvent(event); list = []; for each registered s with s.isPickable(): for each m of s.pickMeshes():
   *  { m.userData.selectType = s.id; list.push(m) }; hits = raycaster.intersectObjects(list, false);
   *  hit -> { const t = choose(hits).object.userData.selectType; if (t && t !== selectedId) select(t) }  miss -> deselect()
   *  03 T5 (5.4) choose(hits): the nearest hit wins unless it is a wall (kind 'section') hit; then the hit with the highest
   *  positive pickPriority (strictly higher, so the nearer of equals) wins, else the wall hit. Before spec 02 no wall is
   *  pickable, so this is the legacy hits[0] bit for bit. */
  pickAt(event)
}
```

#### `js/interaction/TransformGizmo.js`
```js
export class TransformGizmo {
  /** Subscribes to SELECTABLE_MOVED in the constructor: ({id}) => { if (target && target.id === id) this.updatePosition() };
   *  03 T5 (5.4): and to WALL_REBUILT: () => { if (target?.kind === 'pivot') updatePosition() } (the anchor is read from
   *  WallController's cache, set before the event, so the subscriber order does not matter; spec 02 extends it to sections).
   *  The axis colours (handle materials and userData.color) and the idle / hover / dimmed opacities (0.35 / 1.0 / 0.15)
   *  quoted below are read from the injected theme.scene.gizmo (x, y, z, idleOpacity, hoverOpacity, dimmedOpacity).
   *  @param {{sceneManager, pointerRay: PointerRay, interaction: InteractionState, bus, theme: {scene: SceneTheme}}} deps */
  constructor({ sceneManager, pointerRay, interaction, bus, theme })
  get mode()          // 'translate' | 'rotate' | null   (legacy gizmoMode)
  get space()         // 'world' | 'local'               (legacy gizmoSpace)
  get group(); get target(); get activeAxis(); get hoveredAxis()
  /** target = selectable; rebuild()   (the createGizmo call inside selectObject, 3142) */
  attach(target)
  /** 03 T5: if (interaction.isDraggingGizmo && target?.endGizmoDrag) cancelDrag(); then
   *  3146-3152: target = null; hoveredAxis = null; if (group) { sceneManager.removeHelper(group);
   *  disposeObject3D(group) (the B-L12 fix of Phase 1C H2; 08 P2-12a retired its switch); group = null } */
  detach()
  /** 3169-3180: mode = (mode === requested) ? null : requested; bus.emit(GIZMO_MODE_CHANGED, {mode}); rebuild() */
  setMode(requested)
  /** Escape branch 4427-4430: mode = null; bus.emit(GIZMO_MODE_CHANGED, {mode: null}); rebuild() */
  clearMode()
  /** 3182-3193: space = space === 'world' ? 'local' : 'world'; bus.emit(GIZMO_SPACE_CHANGED, {space}); if (group) updateOrientation() */
  toggleSpace()
  /** Verbatim createGizmo 2997-3099: if (group) { sceneManager.removeHelper(group); disposeObject3D(group); group = null }
   *  if (!target || !mode) return; 03 T5: axes = target.allowedAxes?.(mode); if (axes === null) return (no group, no handles);
   *  group = new THREE.Group(); group.renderOrder = RENDER_ORDER.GIZMO (999, core/renderOrder.js); handles = {};
   *  (03 T5: an axis with axes[k] === false gets no arrow or ring; legacy targets have no allowedAxes);
   *  translate arrows / rotate tori built in the exact legacy allocation order (material per axis via the private
   *  material(color) factory: MeshBasicMaterial{color, transparent: true, opacity: idleOpacity, depthTest: false, depthWrite: false});
   *  updateOrientation(); updatePosition(); sceneManager.addHelper(group, { layer: 'default' }) (07 R1: layer 0, hidden
   *  around the preview pass by withPassHidden, still drawn in pilot mode: B-L26 is 08 P2-9j's).
   *  MUST NOT reset hoveredAxis (legacy keeps a stale hover across rebuilds). LEGACY(B-L22): every handle is built for props too.
   *  LEGACY(B-L26): pilot mode does not hide the gizmo. */
  rebuild()
  /** 3101-3120: if (!group || !target) return; group.rotation.set(0, 0, 0); if (space === 'local') target.orientGizmo(group.rotation, mode) */
  updateOrientation()
  /** 3122-3137: if (!group || !target) return; if (!target.hasGizmoTarget()) return; group.position.copy(target.gizmoAnchor(new THREE.Vector3())).
   *  LEGACY(B-L23): position-only follow; orientation is not refreshed outside drags. */
  updatePosition()
  /** Verbatim 3195-3230: if (!group || interaction.isDraggingGizmo || interaction.pilotMode) return; ray via pointerRay.fromEvent;
   *  collect handle meshes (child.userData = {...handle.userData}); newHovered; if changed: opacity hover 1.0 / idle 0.35. */
  onHover(event)
  /** 03 T5: interaction.gestureCancelled = false (defensively, every press);
   *  verbatim 3232-3307: if (!group || !target || interaction.pilotMode) return false; ... on hit: activeAxis,
   *  interaction.isDraggingGizmo = true, opacities 1.0 / 0.15, drag plane (translate: camera-facing plane containing the axis,
   *  local axes via group.quaternion; rotate: plane normal = axis), raycaster.ray.intersectPlane(dragPlane, dragStart);
   *  03 T5: target.beginGizmoDrag?.(); return true.  miss: return false. */
  onMouseDown(event)
  /** Verbatim 3309-3409: if (!interaction.isDraggingGizmo || !activeAxis || !group) return; ray; currentPoint (return if no hit);
   *  translate: movement = axisDir * (delta . axisDir) -> target.applyGizmoTranslate(movement, ctx);
   *  rotate: angle = atan2((startDir x currentDir) . dragPlane.normal, startDir . currentDir) * (180 / Math.PI);
   *          target.applyGizmoRotate(activeAxis, Strategies.gizmoRotateSign * angle, ctx)   LEGACY(B-M12);
   *  (03 T5: ctx = {space, axisWorld: axisDir or the rotate plane normal, snap: (ctrlKey || metaKey) ? interaction.snap : null});
   *          if (space === 'local') updateOrientation();
   *  then dragStart.copy(currentPoint); updatePosition(). */
  onMouseMove(event)
  /** Verbatim 3411-3425: wasDragging = interaction.isDraggingGizmo; interaction.isDraggingGizmo = false; activeAxis = null;
   *  if (group) opacities by hoveredAxis; 03 T5: interaction.gestureCancelled = false;
   *  if (wasDragging && target) target.endGizmoDrag?.({cancel: false}) (once: only the first of the canvas and window calls) */
  onMouseUp()
  /** 03 T5 (Escape): if (!interaction.isDraggingGizmo || !target?.endGizmoDrag) return false;
   *  target.endGizmoDrag({cancel: true}); isDraggingGizmo = false; gestureCancelled = true; activeAxis = null;
   *  opacities by hoveredAxis; updateOrientation(); updatePosition(); return true */
  cancelDrag()
  setSnapIncrements(partial)       // 03 T5: Object.assign(interaction.snap, partial) (the only writer of snap)
}
```
State: `#mode`, `#space = 'world'`, `#target`, `#group`, `#handles`, `#activeAxis`, `#hoveredAxis`, `#dragStart` (Vector3), `#dragPlane` (Plane).
**Gesture swallowing (03 5.4).** The orbit's canvas `mousedown` runs before the router's, so when a gizmo drag is cancelled with the
button held the orbit is armed with the press point; `interaction.gestureCancelled` keeps its `mousemove` (and the router's move and
hover) silent until the release, so the view never jumps by the dragged distance. When nothing is cancelled the flag is never set. `interaction/` may import `render/ResourceTracker.js` (a leaf utility) for the Phase 1C disposal flip; it imports nothing else from `render/`.

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
  /** 3477-3509: if (!interaction.pilotMode && !cine.enabled) { dialogs.alert('Enable Camera Frustum Preview first to use Pilot
   *    Mode'); return }   (08 P2-4a, B-H4 fixed: the guard applies only on entry; legacy also blocked exiting once the preview
   *    was off);
   *  interaction.pilotMode = !interaction.pilotMode; bus.emit(PILOT_CHANGED, {active});
   *  sceneManager.setHelpersVisibleInMain(!interaction.pilotMode)   (07 R1, Q7: no grid, axes, rig, safe distance or marker
   *    in the pilot view);
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
  /** @param {{doc, win, sceneManager, interaction, gizmo: TransformGizmo, selection: SelectionManager, pilot: PilotController,
   *           onPivotShortcut: () => void}} deps   onPivotShortcut: 03 T5, App passes () => pivotController.toggleSelect() */
  constructor({ doc, win, sceneManager, interaction, gizmo, selection, pilot, onPivotShortcut })
  /** 4410-4434 (doc keydown, registered AFTER KeyboardState's), with the 08 P2-9b filters (B-L11 fixed, 08 6.11):
   *  if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;   (Shift is allowed)
   *  e.key.toLowerCase() 'g' -> gizmo.setMode('translate'); 'r' -> gizmo.setMode('rotate'); 'l' -> gizmo.toggleSpace();
   *  'p' -> pilot.toggle(); 'o' (03 T5, 3.4) -> unless pilotMode || isDraggingGizmo || gestureCancelled: onPivotShortcut();
   *  e.key === 'Escape' -> (03 T5) isDraggingGizmo && gizmo.target?.endGizmoDrag ? gizmo.cancelDrag() (selection and mode kept)
   *  : interaction.pilotMode ? pilot.toggle() : (selection.deselect(), gizmo.mode && gizmo.clearMode()).
   *  isTypingTarget comes through InputState's re-export. */
  attachShortcuts()
  /** Verbatim 4437-4479 on canvas = sceneManager.renderer.domElement (registered AFTER the orbit listeners):
   *  mousedown: pilot ? pilot.onMouseDown(e) : (handled = gizmo.onMouseDown(e); if (!handled && gizmo.mode) selection.pickAt(e))
   *             LEGACY(B-M14): selection on mousedown, misses (orbit starts, right clicks) deselect;
   *  mousemove: pilot ? pilot.onMouseMove(e) : interaction.gestureCancelled ? nothing (03 T5)
   *             : (interaction.isDraggingGizmo ? gizmo.onMouseMove(e) : gizmo.onHover(e));
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
  /** @param {{palette: {sectionColors: string[], legacySectionColors?: string[]}}} deps */
  constructor({ palette })
  /** Verbatim 4943-4963 ('file'), written as one explicit object literal so key order is exact; 'zip' (4499-4519) is that
   *  document plus texture_file as the last key of each section (08 P2-6a, B-M3 fixed: legacy built its own copy, which
   *  dropped angle_offset_degrees, so a re-imported ZIP JSON lost every section offset):
   *  { version: '1.0', sections: sections.map((s, i) => ({ name: s.name || `Wall ${i + 1}`, id: s.id,
   *      panel: { columns: s.panelCols, rows: s.panelRows, width_mm: s.panelWidth, height_mm: s.panelHeight },
   *      led_resolution: { x: s.ledX, y: s.ledY, pixel_pitch_mm: parseFloat((s.panelWidth / s.ledX).toFixed(2)) },
   *      curvature: { type: s.curveIntensity === 0 ? 'flat' : (s.curveIntensity > 0 ? 'concave' : 'convex'),
   *                   angle_degrees: s.curveIntensity,
   *                   angle_offset_degrees: s.angleOffset || 0 },          // both variants since 08 P2-6a
   *      color: s.color,
   *      texture_file: textureNames[i] === null ? null : `textures/${textureNames[i]}` })),   // 'zip' only (added to the 'file' document)
   *    mesh_mode: project.meshMode,
   *    totals: { sections: sections.length,
   *              total_panels: sections.reduce((sum, s) => sum + s.panelCols * s.panelRows, 0),
   *              total_pixels: sections.reduce((sum, s) => sum + s.panelCols * s.panelRows * s.ledX * s.ledY, 0) } }
   *  LEGACY(B-L31): v1 saves only sections, mesh_mode and totals.
   *  Any other variant throws RangeError('Unknown ProjectSerializer variant ...') (no legacy counterpart; App and
   *  ProjectIO pass only 'file' and 'zip').
   *  'zip' requires textureNames (08 P2-6b): one entry per section, PanelNaming.textureFileNames with null for a texture the
   *  ZIP left out (08 P2-1c, B-L4: texture_file null); otherwise it throws TypeError. The caller computes the names once
   *  for the texture entries, this document and the MTL.
   *  @param {Project} project  @param {{variant?: 'file'|'zip', textureNames?: (string|null)[]|null}} [options]  @returns {object} */
  write(project, { variant = 'file', textureNames = null } = {})
  /** 08 P2-3b (B-L8 fixed; 08 4.3, 07 5.5.1): d = detectVersion(data) (07 4.6); an error returns
   *  { ok: false, project: null, issues: [d.error], sourceVersion: null, scope: 'wall' }. A v1 document:
   *  m = migrateV1toV2(data, { palette }) (the verbatim legacy || mapping of 4975-4988 into the v2 section shape; a
   *  missing colour from palette.legacySectionColors ?? palette.sectionColors, 06 T7, 4.3), then
   *  r = validateProject({ sections: m.wall.sections, mesh_mode: m.wall.mesh_mode }, { palette: { sectionColors: that
   *  same list }, exportLimits }) and returns { ok: r.ok, project: r.project, issues: [...m.issues, ...r.issues],
   *  sourceVersion: 1, scope: 'wall' }. Never throws for a JSON value; never writes data. Every version 2.x and above is
   *  refused as newer until 08 P2-13e (owner decision 2026-10-17: no v2 file now). Strategies.importValidation is retired.
   *  @returns {{ok, project: {sections: object[], mesh_mode: string|null}|null, issues: Issue[], sourceVersion: 1|null, scope: 'wall'}} */
  read(data, { exportLimits } = {})
}
```

#### `js/io/ProjectSchema.js`, `js/io/ProjectMigrations.js`, `js/io/ProjectValidator.js` (08 P2-3b; the wall subset of 07 D2/D3, in 07's final modules and signatures)
```js
// ProjectSchema.js (pure; imports domain): the rows the validator walks (07 4.4 rule 3)
export const FORMAT = 'morph-led-project';
export const MESH_MODES = ['combined', 'section', 'panel'];
export const LIMITS = { sections: WallSection.LIMITS, maxSections: Wall.MAX_SECTIONS, nameMaxLength: 32 };   // no copy of a range
export const SECTION_NUMBER_ROWS   // [{group: 'panel', key: 'columns', field: 'panelCols', label: 'Columns'}, ... 8 rows in file key order]
export const SECTION_GROUP_LABELS, SECTION_LABELS   // the 08 3.3 labels ('Panel Angle (°)', 'Panel Colour': the 06 T4c card labels)
export function sectionsFromProject(project) -> WallSection[]   // the inverse v1 mapping over a validated project (app/ gets it injected)

// ProjectMigrations.js (pure)
export function detectVersion(data) -> { kind: 'v1' } | { error: Issue }
  // not a plain object -> unsupported-format (M-IMP-4a); an own `format` key !== FORMAT -> unsupported-format; a `version`
  // string /^(\d+)\.(\d+)$/ with major >= 2 -> newer-version (M-IMP-4b; every major >= 2 until 08 P2-13e); a sections
  // array -> v1 (any other version: legacy ignored it); otherwise no-sections (M-IMP-1; legacy ignored the file, V-6)
export function migrateV1toV2(data, { palette }) -> { scope: 'wall', wall: { sections, mesh_mode: data.mesh_mode || null },
                                                      issues: [migrated info, defaulted per non-object section] }
export const ImportMessages   // the M-IMP-1..4 texts of 08 3.3

// ProjectValidator.js (pure)
export function validateProject(input, { limits = LIMITS, palette, knownRevision, exportLimits } = {}) -> { ok, project, issues }
  // errors (project null, atomic): not an object, no sections list, 0 sections (M-IMP-2), > MAX_SECTIONS (M-IMP-3);
  // corrections (warnings, 08 3.3 line `Section <i+1> "<name>": <label> <from> → <to>`), per section in file key order:
  // name (coerced / sanitized / truncated / defaulted; sanitizeText, no trim), a non-object group (defaulted), the eight
  // numbers over WallSection.LIMITS (07 6.7: coerced, rounded, clamped, defaulted; a missing field is silent), colour
  // (#rgb coerced, anything but #rrggbb sanitized to palette.sectionColors[i % n]; #RRGGBB lower-cased silently); then the
  // ids (07 6.8: first occurrence keeps it, others reassigned-id from max + 1); then mesh_mode (null keeps the mode,
  // unknown -> 'combined' defaulted). Builds fresh objects field by field (no spread), reads no __proto__ key; idempotent.
export function formatValue(v)   // strings JSON.stringify-ed, numbers as they are, else '(invalid)'; at most 40 characters
```

#### `js/io/ObjExporter.js`
```js
export class ObjExporter {
  /** @param {{brand: Brand, colorToRgb, builder: WallMeshBuilder (Strategies.mesh.obj profile)}} deps
   *  profile = builder.profile (the injected Strategies.mesh.obj); this class reads profile.winding (the header line
   *  only), profile.stripNormals and profile.combinedUV; the builder reads profile.winding / normals / panelNormal. */
  constructor({ brand, colorToRgb, builder })
  /** Verbatim string assembly 4556-4717 (line order, separators and toFixed precision exactly as legacy):
   *  header: brand.objHeader + `# Mesh Mode: ${meshMode}\n` + #faceConventionLine() + the two pivot lines of 03 7.1 (03 T3:
   *  `# Pivot: <mode> anchor <a> offset <o> (layout m); file origin = pivot` and `# Stage placement: origin at stage (0 <P.y> 0)
   *  (Y up, metres)`, toFixed(6), only for a non-identity layout.pivot.resolution) + brand.objGeneratorLine; mtl starts
   *  with brand.mtlHeader. private #faceConventionLine() (01 CR-3, 08 P2-2c): switch (profile.winding) { case 'ccw': return
   *  '# Faces: counter-clockwise front faces; vn point out of the LED surface (toward the stage)\n'; case 'legacy-cw':
   *  return ''; default: throw unsupportedStrategy('mesh.obj.winding', ...) }.
   *  Dispatch: 'combined' / 'section' / 'panel', else throw Error('Unknown mesh mode "<mode>"') (08 P2-3b, B-L8 fixed;
   *  legacy wrote any other mode as panels).
   *  combined (atlasFile: 08 P2-7f, the archive path of the combined atlas the caller ships, else null)
   *    (08 P2-7d, 08 6.8: B-L6 fixed; `Strategies.exportCombinedColor` retired, legacy coloured the whole wall with
   *    section 0's `LED_Wall_Combined` material and threw a TypeError on an empty wall): uvFor = switch (profile.combinedUV) { case 'atlas-pixel-accurate'
   *    (08 P2-7b, B-M6 fixed; 08 6.7): atlas = computeAtlas(sections), uvFor(i) = atlasUvRect(atlas.entries[i]) (the viewport's
   *    combined UVs); case 'per-section-overlap' (the Phase-1 case, kept for LegacyProfiles): uvFor(i) = 'unit'; default: throw
   *    unsupportedStrategy('mesh.obj.combinedUV', ...) };
   *    mtl per section `newmtl Wall_${i+1}\nKd r g b (toFixed(4), the section colour)\nKa 0.1 0.1 0.1\nKs 0.5 0.5 0.5\nNs 100\nd 1.0\n`
   *    + (atlasFile ? `map_Kd ${atlasFile}\n\n` : '\n') (08 P2-7f: both archives in combined mode pass the atlas they ship);
   *    obj `mtllib ${brand.files.mtl}\n\n`, `o LED_Wall_Combined\n`;
   *    grids: builder.sectionGrid(sl, {indexBase: vertexOffset, uv: uvFor(i)}) per section with vertexOffset starting at 1
   *    (+= vertexAdvance); then ALL `v x y z` (toFixed(6)) lines of all sections, then ALL `vt u v` (toFixed(6))
   *    (since 08 P2-7b each section's own rect of the combined atlas; single sections unchanged), then {lines, normalIndex: n} = #stripNormalLines(grid.normals, 1) and
   *    its lines, then per section `usemtl Wall_${i+1}\n` and, per 6 indices q of that section's index range:
   *    `f ${q0}/${q0}/${n(q0)} ${q1}/${q1}/${n(q1)} ${q2}/${q2}/${n(q2)}\n` + the same for q3..q5.
   *  private #stripNormalLines(normals, constantIndex): switch (profile.stripNormals) { case 'per-vertex' (08 P2-2c):
   *    {lines: one `vn ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}\n` per builder normal, normalIndex: v => v} (faces
   *    `f a/a/a`); case 'constant-z' (the Phase-1 case, kept for LegacyProfiles; B-H2): {lines: 'vn 0 0 1\n' (the legacy
   *    literal of 4589 and 4635), normalIndex: () => constantIndex}; default: throw unsupportedStrategy('mesh.obj.stripNormals', ...) }
   *  section: mtl per section `newmtl Wall_${i+1}` ... `d 1.0\n` + `map_Kd ${mtlTextureFile(textureNames[i])}\n\n` (the ZIP
   *    entry path of that texture, 08 P2-6d: B-M2 fixed) only for a texture the caller ships (textureNames given and
   *    textureNames[i] not null; 08 P2-6c, B-L7 fixed), else `\n` instead of the map_Kd line: both archives pass their
   *    names, null for a texture they left out (08 P2-1c): Export All's ZIP, and Export OBJ's ZIP in section mode since
   *    08 P2-6e (before it Export OBJ passed none, so its standalone MTL had no map_Kd);
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
  write({ sections, meshMode, layout, textureNames = null, atlasFile = null })
  /** 2792-2823 (08 P2-5b: B-L29 fixed): brand.safeDistanceObjHeader, with `# Clamped: ${n} of ${total} offset vertices are
   *  closer than D = ${D.toFixed(2)} m (concave features)` inserted before its blank line when band.clampedVertices > 0;
   *  group.traverse(child => child.isMesh && child.geometry): `v` lines from position.getX/Y/Z(i).toFixed(6), `vn` lines from
   *  geometry.attributes.normal (toFixed(6); (0, 1, 0)), a blank line, faces `f a//a b//b c//c` from index.getX + the running
   *  vertex and normal offsets (both start 1). A mesh without a normal attribute writes no `vn` and `f a b c` (the Phase-1
   *  text). Duck-typed: no THREE import. band: SafeDistanceView.lastBand, or null. 03 T3 (7.1): each axis k with
   *  translate[k] !== 0 writes (v + translate[k]).toFixed(6) (the identity translation keeps the bytes). */
  writeSafeDistance(group, band = null, { translate = {x: 0, y: 0, z: 0} } = {})
}
```

#### `js/io/GltfExporter.js`
```js
export class GltfExporter {
  /** @param {{brand: Brand, colorToRgb, builder: WallMeshBuilder (Strategies.mesh.gltf profile),
   *           encodeBase64?: (bytes: Uint8Array) => string}} deps
   *  profile = builder.profile (the injected Strategies.mesh.gltf); #addMesh reads profile.attributes / indexType / doubleSided
   *  (the three writers ask #attributeList() first whether NORMAL and TEXCOORD_0 are written); the combined writer reads
   *  profile.combinedUV only when TEXCOORD_0 is written (08 P2-7c); the builder reads profile.winding / normals / panelNormal.
   *  encodeBase64 defaults to chunkedBase64 (08 P2-1a, B-H3; the Phase-1 `gltfBase64` switch and its spread encoder are retired) */
  constructor({ brand, colorToRgb, builder, encodeBase64 })
  /** Verbatim 4719-4909. gltf = { asset: {version: "2.0", generator: brand.gltfGenerator}, scene: 0, scenes: [{nodes: []}], nodes: [],
   *  meshes: [], accessors: [], bufferViews: [], buffers: [], materials: [] } (this key order). 03 T3 (7.2): after the mode
   *  writers, a non-identity layout.pivot.resolution r adds scenes[0].extras = {pivot: {mode, offset_m, anchor_layout_m,
   *  point_layout_m}} ([x, y, z] arrays; the scene keys are then nodes, extras); positions are in the layout's frame.
   *  #addMesh(name, primitives = [{attrs: {positions, normals?, uvs?}, indices, color, materialName?}]) (08 5.2, P2-2d, P2-7c;
   *  per-primitive attrs since 08 P2-7d), verbatim
   *  4737-4828 for the Phase-1 profile (one primitive, POSITION only). Its strategy reads come first, before any output:
   *  #attributeList() iterates profile.attributes and switches each element (case 'POSITION', case 'NORMAL', case 'TEXCOORD_0'
   *  (08 P2-7c); default: throw
   *  unsupportedStrategy('mesh.gltf.attributes', profile.attributes)), 'POSITION' first, no repeats (04 5.5); #indexFormat(indices)
   *  per primitive: switch (profile.indexType) { case 'uint16': Uint16 (5123; the Phase-1 case, kept for LegacyProfiles);
   *  case 'auto' (08 P2-1b): indexWidth(maxIndexOf(indices)) === 'uint32' ? Uint32Array, 5125 : Uint16Array, 5123; default:
   *  throw }; #doubleSided(): switch (profile.doubleSided) { case 'omit': false (no doubleSided key: single-sided, correct
   *  with the 'ccw' winding, 08 Q2); case 'true' (08 P2-2d, unused): true; default: throw }; NORMAL needs one normal per
   *  position (else unsupportedStrategy('mesh.gltf.normals', profile.normals)) and TEXCOORD_0 one uv per position (else
   *  unsupportedStrategy('mesh.gltf.attributes', ...)). Then: per primitive a material {name:
   *  materialName ?? name + "_Material", pbrMetallicRoughness: {baseColorFactor: [r, g, b, 1.0], metallicFactor: 0.0,
   *  roughnessFactor: 0.8}} (+ doubleSided: true for 'true'); then per primitive, per attribute in list order a Float32Array view (target 34962)
   *  + 4-byte padding and a VEC3 5126 accessor: POSITION with min/max from the float64 positions, NORMAL without min/max;
   *  TEXCOORD_0 (08 P2-7c, 08 6.7, 04 7.3; #addTexCoords): a Float32Array of (u, 1 - v) (glTF's top-left UV origin; the
   *  builder keeps v up), its own view (target 34962) + padding and a VEC2 5126 accessor without min/max;
   *  per primitive the index array chosen above (B-L5 fixed in 08 P2-1b) view (target 34963) + padding and its accessor;
   *  mesh {name, primitives: [{attributes: {POSITION, NORMAL, TEXCOORD_0} (that primitive's own), indices, material}]} (B-M7 fixed: NORMAL in
   *  08 P2-2d, TEXCOORD_0 in 08 P2-7c); node {name, mesh}; scenes[0].nodes.push.
   *  combined (08 P2-7d, 08 6.8, 04 7.3: B-L6 fixed; `Strategies.exportCombinedColor` retired): uvFor = private
   *    #combinedUvOption(sections): without TEXCOORD_0 () => null (the leaf is never read); with it switch
   *    (profile.combinedUV) { case 'atlas-pixel-accurate': atlas = computeAtlas(sections), uvFor(i) = atlasUvRect(atlas.entries[i])
   *    (the viewport's combined UVs); default: throw unsupportedStrategy('mesh.gltf.combinedUV', ...) }; per section a primitive
   *    {attrs: builder.sectionGrid(sl, {indexBase: 0, uv: uvFor(i)}), indices, color: colorToRgb(section.color),
   *    materialName: `Wall_${i+1}_Material`}; addMesh('LED_Wall_Combined', primitives): one mesh and one node, each primitive
   *    with its own accessors (the vertex data equals legacy's, which never shared a vertex across sections).
   *  section: per section grid with indexBase 0 and uv 'unit' when TEXCOORD_0 is written (positions, normals, uvs);
   *    color = colorToRgb(section.color) after the indices;
   *    addMesh(exportSectionName(i), ...).
   *  panel: per section color first; per panel: vertices = the 4 builder.panelCorners flattened (x, y, z); normals =
   *    builder.panelNormals(panel) when the attributes list NORMAL; uvs = WallMeshBuilder.PANEL_UVS when they list
   *    TEXCOORD_0 (per-panel 0..1 until 04 UV-9); indices = builder.panelQuadIndices(0) ('ccw': [0, 1, 2, 0, 2, 3]);
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
   *           hub: CameraHub, bus: EventBus, palette: {sectionColors: string[]}, dialogs: Dialogs}} deps
   *  dialogs: M-SEC-1 (08 P2-3b) */
  constructor({ project, view, ledTiles, orbit, hub, bus, palette, dialogs })
  layout({ frame = 'stage' } = {})   // layoutProject(project, {frame})  (fresh, from live sections; 'export' for ProjectIO, 03 T3)
  /** 03 T3 (5.6): the cached resolution of the last rebuild (step 1) or commitPivot; null before the first rebuild */
  get pivotResolution()
  /** 08 P2-11a: the stage layout of the last rebuild (cached in rebuild step 1; computed and cached on demand before the
   *  first rebuild): its memoised columnQuads() serve every pose change of the coverage analyser */
  get currentLayout()
  resolvePivotNow()              // 03 T3: resolvePivot(computeWallLayout(project.wall.sections), project.wall.pivot) (pure)
  /** 03 T3 (5.6; the pivot rebuild decision): stageShift(cache, after) non-zero ? rebuild({cause: 'pivot'})
   *  : cache = after (a height-only change rebuilds nothing). Called by 03 T4's PivotController. */
  commitPivot(after)
  /** P1 (section 6.1): legacy createLEDWall. 03 T3: cause 'init' (bootstrap), 'pivot' (commitPivot), 'import'
   *  (applyImport) or 'edit' (the default, every other call site), carried by WALL_REBUILT with stageShift. */
  rebuild({ cause = 'edit' } = {})
  /** bus.emit(WALL_STATS_CHANGED, project.wall.totals())  (legacy updateStats call sites 1574, 4073) */
  publishStats()
  /** P-ADD (section 6.4). 08 P2-3b: if (!project.wall.canAddSection()) { dialogs.alert(`A wall can have at most
   *  ${Wall.MAX_SECTIONS} sections.`) (M-SEC-1); return } */
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
  /** P-IMPORT tail (section 6.10): project.logos.clear(); if (logos) for ([id, entry] of logos) project.logos.set(id, entry)
   *  (08 P2-3d, B-L21 fixed; a v1 import passes logos: null); wall.replaceAll(sections); if (meshMode) { project.meshMode =
   *  meshMode; bus.emit(WALL_MESH_MODE_CHANGED, {mode: meshMode}) } bus.emit(WALL_SECTIONS_CHANGED, {reason: 'import'});
   *  rebuild({cause: 'import'}). With panel IDs on, SectionLogosPanel re-renders the logo list on that event.
   *  03 T4 (5.5): right after the pivot assignment, bus.emit(WALL_PIVOT_CHANGED, {source: 'import', pivot: clone,
   *  resolution: resolvePivotNow(), stageShift: stageShift(cache, resolution), reexpressed: false, rebuilds: true}).
   *  03 T3 (4.4, Q14): project.wall.pivot = pivot ?? new WallPivot() right after replaceAll (the identity for every file
   *  until project file v2; no re-expression: an import is a load). */
  applyImport({ sections, meshMode, logos = null, pivot = null })
}
```

#### `js/app/CameraController.js`
```js
export class CameraHub {               // legacy updateCameraFrustum + updateSafeDistance
  /** @param {{project, rig: CameraRigView, preview: PreviewPass, safeDistance: SafeDistanceView,
   *           pilotDriver: PilotCameraDriver, frameBounds, stageLayout, bus}} deps   (07 R2: the hub's preview is the
   *           pass; 08 P2-11a: stageLayout = () => wallController.currentLayout) */
  constructor({ project, rig, preview, safeDistance, pilotDriver, frameBounds, stageLayout, bus })
  /** P2 (section 6.3). */
  refresh()
  /** 08 P2-11a (6.10): c = analyzeCoverage(stageLayout(), cine, {hFov, vFov}, extent) with extent =
   *  frameBounds().stageExtent (08 P2-11c; the flat {totalWidth, maxHeight} before); returns {frameWidth: c.frameWidth,
   *  frameHeight: c.frameHeight, status: c.status, safeDistance: cine.maxSafeDistance(extent), distToWall: c.distance}
   *  (fits and D read the same extent, so they always agree) */
  coverage()
  /** 2778-2784: if (display.showSafeDistance && cine.enabled) safeDistance.create({layout: layoutProject(project), cine,
   *  extent: frameBounds().stageExtent}) else safeDistance.remove() (08 P2-11c: the stage extent; `bounds` before). The
   *  layout and extent are argument expressions, so they are evaluated before create() removes the old group and
   *  allocates the new one (legacy: after; PR7).
   *  LEGACY(B-L30): runs on every pose change via refresh(). */
  syncSafeDistance()
}

export class CameraController {        // use cases + Selectable 'camera'
  /** @param {{project, rig: CameraRigView, preview: PreviewWindow, hub: CameraHub, pilot: PilotController,
   *           selection: SelectionManager, frameBounds, bus}} deps */
  constructor({ project, rig, preview, hub, pilot, selection, frameBounds, bus })
  /** P-PREVIEW (section 6.5). */
  setPreviewEnabled(on)
  /** 2550-2575: cine.resetTo(frameBounds()) (08 P2-11c: in front of the wall, looking at it); bus.emit(CAMERA_POSE_CHANGED,
   *  {source: 'reset'}); hub.refresh() */
  resetPose()
  /** 4251-4264: cine.applyPreset(key); bus.emit(CAMERA_FILMBACK_CHANGED, {key}); if (cine.enabled) hub.refresh() */
  setFilmback(key)
  /** cine.setField(field, raw, {wallZ: frameBounds().wallZ}) (model only; 03 T3: the posZ rule's wall-plane context; since
   *  08 P2-11c the framing's wallZ, used only for a non-numeric Z entry).
   *  @returns the stored value */
  setCameraField(field, raw)
  /** 03 T3 (5.6, StageAnchored): cine.translateStage(dx, dz) (clamped through CineCamera.LIMITS);
   *  bus.emit(CAMERA_POSE_CHANGED, {source: 'pivot'}); no hub refresh (the pivot commit's rebuild runs it) */
  translateStage(dx, dz)
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
  /** 03 T3 (5.6, StageAnchored): prop.translateStage(dx, dz) (clamped through Prop.LIMITS);
   *  bus.emit(PROP_POSE_CHANGED, {id, source: 'pivot'}); applyTransform() (re-expressed even while hidden) */
  translateStage(dx, dz)
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

#### `js/app/PivotController.js` (03 T4; docs/improvements/03-pivot.md 5.3, 5.6, 6.5, 6.7)
```js
export const PIVOT_SNAP_STEPS_M = [0.001, 0.01, 0.1, 0.5, 1]   // the #pivot-snap option values (frozen)
/** 03 6.7: per axis d = step > 0 ? roundMm(Math.round(pending / step) * step) : roundMm(pending);
 *  target = d === 0 ? offset (bit for bit) : offset + d. roundMm(v) = Math.round(v * 1000) / 1000 || 0 */
export function dragTarget(offset, pending, step)
export class PivotController {        // Selectable 'pivot': id 'pivot', label 'Pivot', kind 'pivot', pickPriority 10
  /** @param {{project, wallController: WallController, markerView: PivotMarkerView, stageAnchored: StageAnchored[],
   *           selection: SelectionManager, gizmo: TransformGizmo, interaction: InteractionState, bus}} deps
   *  stageAnchored = [cameraController, personController, carController] (re-expression order; 07 C45 appends more) */
  constructor({ project, wallController, markerView, stageAnchored, selection, gizmo, interaction, bus })
  get pivot()                         // project.wall.pivot
  setMode(mode)                       // #commit(p => p.setMode(mode), 'mode')            row F3-1 (RangeError: nothing written)
  setOffsetAxis(axis, raw)            // #commit(p => p.setOffsetAxis(axis, raw), 'offset'); returns pivot.offset[axis]  row F3-2
  resetOffset()                       // #commit(p => p.resetOffset(), 'reset-offset')      row F3-3
  /** if (pivot.setKeepStageLayout(on)) emit WALL_PIVOT_CHANGED {source: 'keep-stage', stageShift: (0, 0),
   *  reexpressed: false, rebuilds: false, resolution: wallController.pivotResolution}   row F3-5 */
  setKeepStageLayout(on)
  /** display.showPivotMarker = on; emit WALL_PIVOT_CHANGED {source: 'marker', ... rebuilds: false}   row F3-5 */
  setMarkerVisible(on)
  setSnapStep(m)                      // m in PIVOT_SNAP_STEPS_M (else RangeError); gizmo.setSnapIncrements({pivotM: m})
  /** O key / #pivot-select: no-op while interaction.pilotMode || interaction.isDraggingGizmo || interaction.gestureCancelled; selected ?
   *  selection.deselect() : (selection.select('pivot'); if (gizmo.mode !== 'translate') gizmo.setMode('translate')) */
  toggleSelect()
  // Selectable (the path-B hook set of 03 5.4, 07 C33; the gizmo calls the hooks from 03 T5)
  allowedAxes(mode)                   // 'translate' -> {x: true, y: true, z: true}; anything else -> null (unsupported)
  isPickable()                        // markerView.exists && markerView.hasResolution && markerView.visible
  pickMeshes()                        // markerView.pickMeshes()  (the invisible pick proxy)
  hasGizmoTarget()                    // markerView.exists && wallController.pivotResolution !== null
  gizmoAnchor(out)                    // stage frame: out.set(preview.x, (r ? r.point.y : 0) + preview.y, preview.z), r = the cache
  orientGizmo(rotation, mode)         // rotation.set(0, 0, 0)
  beginGizmoDrag()                    // pending = 0; target = {...offset}; preview = 0
  /** pending += movement; target = dragTarget(offset, pending, ctx?.snap ? ctx.snap.pivotM : 0); preview = target - offset;
   *  markerView.setPreview(preview); emit SELECTABLE_MOVED {id: 'pivot'}. No rebuild during a drag. */
  applyGizmoTranslate(movement, ctx)
  applyGizmoRotate(axis, deltaDeg, ctx)   // no-op (allowedAxes('rotate') is null)
  /** clear the preview; {cancel: false} with a target that differs from the offset: #commit(p => p.setOffset(target), 'gizmo')
   *  (row F3-4); otherwise (cancel, or nothing moved): emit SELECTABLE_MOVED {id: 'pivot'} only */
  endGizmoDrag({ cancel })
}
```
P-PIVOT (`#commit(mutate, source)`, 03 5.6): `snapshot = pivot.clone(); mutate(pivot); if (pivot.equals(snapshot)) return;`
`after = wallController.resolvePivotNow(); shift = stageShift(wallController.pivotResolution, after); moved = shift.x !== 0 || shift.z !== 0;`
`if (moved && pivot.keepStageLayout)` every participant's `translateStage(-shift.x, -shift.z)` (each clamped through its LIMITS, each emitting its own
`'pivot'` pose event); `emit WALL_PIVOT_CHANGED {source, pivot: clone, resolution: after, stageShift: shift, reexpressed, rebuilds: moved}`;
`wallController.commitPivot(after)` (one rebuild with cause `'pivot'` iff the stage origin moved, else the cache only);
`emit SELECTABLE_MOVED {id: 'pivot'}`. The controller never calls `rebuild()`; WallController stays the rebuild decider (6.2).

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
   *           JSZip, dialogs, brand: Brand, win: Window, sectionsFromProject}} deps
   *  sectionsFromProject: io/ProjectSchema.sectionsFromProject (08 P2-3b; injected by App, app/ may not import io/) */
  constructor({ project, wallController, serializer, objExporter, gltfExporter, panelIds, safeDistance, downloader, JSZip, dialogs, brand, win, sectionsFromProject })
  /** 08 P2-1a (B-H3), 08 3.3 M-EXP-1: every export body below runs as #runExport(label, fn), label = 'Export JSON' |
   *  'Export OBJ (ZIP)' (08 P2-6e; 'Export OBJ' before) | 'Export glTF' | 'Export Panel IDs' | 'Export All (ZIP)' |
   *  'Export Safe Distance OBJ'. A synchronous throw or a rejection of the promise fn returns is caught:
   *  dialogs.alert(`${label} failed: ${err.message}. No file was downloaded.`), then win.console.warn(err) (a non-Error is
   *  reported through String(err)). The returned promise of an async export never rejects. (R13 amendment, 1.6.) */
  #runExport(label, fn)
  /** 4942-4965: downloader.saveText(JSON.stringify(serializer.write(project, {variant: 'file'}), null, 2), brand.files.json, 'application/json') */
  exportJSON()
  /** 08 P2-6e (the owner's decision of 2026-10-17; replaces 08 Q7's two downloads, B-L7 fixed): async, one download.
   *  #writeObjZip(): zip = new JSZip(); layout = wallController.layout({frame: 'export'}) (03 T3); plan = meshMode === 'section' ?
   *  #planSectionTextures(sections) : null; atlasPlan = meshMode === 'combined' ? #planAtlas(sections) : null (08 P2-7f);
   *  {objContent, mtlContent} = objExporter.write({sections, meshMode, layout, textureNames: plan?.textureNames,
   *  atlasFile: atlasPlan?.file}); zip.file(brand.files.obj, objContent); zip.file(brand.files.mtl, mtlContent);
   *  section textures (#addSectionTextures into zip.folder('textures')) and the atlas (#addAtlasTexture); if one was left
   *  out late (`data:,`) the MTL entry is written again without its map_Kd; content = await zip.generateAsync({type:
   *  'blob'}); downloader.saveBlob(content, brand.files.objZip); #reportLeftOut(plan, atlasPlan) (M-EXP-4). The OBJ's
   *  mtllib names brand.files.mtl, and every map_Kd names a file of the archive at that path: the section textures in
   *  section mode, the atlas in combined mode (since 08 P2-7f), nothing in panel mode. Legacy (4911-4917) downloaded the
   *  OBJ and, 100 ms later, the MTL, which a browser could block, so importers found no materials. */
  async exportOBJ()
  /** 4919-4924: saveText(JSON.stringify(gltfExporter.write({..., layout: wallController.layout({frame: 'export'})}),
   *  null, 2), brand.files.gltf, 'application/json')   (the export frame since 03 T3) */
  exportGLTF()
  /** 4926-4940 (stays async), with the 08 6.3 size guard (B-L4 fixed in 08 P2-1c): atlas = computeAtlas(sections);
   *  {width, height} = panelIds.atlasSize(sections, atlas); if (!canvasFits(width, height)) { dialogs.alert(M-EXP-2); return }
   *  canvas = panelIds.atlasCanvas(sections, atlas); blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
   *  if (blob === null) { dialogs.alert(M-EXP-3); return }  downloader.saveBlob(blob, brand.files.panelIdsPng).
   *  M-EXP-2/3 are the exact 08 3.3 texts (CANVAS_HARD_LIMITS: 32767 px per side, Math.round(maxArea / 1e6) = 268 MP). */
  async exportPanelIds()
  /** 4491-4554, same order, with the 08 6.3 size guard (B-L4 fixed in 08 P2-1c): zip = new JSZip();
   *  0. names = textureFileNames(sections)  (unique, 08 P2-6b: B-L14 fixed);
   *  1. skipped[i] = !canvasFits(panelIds.sectionSize(sections[i], null))  (pure arithmetic, before anything is written);
   *     textureNames[i] = skipped[i] ? null : names[i]; atlasPlan = #planAtlas(sections) (08 P2-7f, every mesh mode:
   *     path = atlasTexturePath(brand.files), skipped = !canvasFits(panelIds.atlasSize(sections, atlas)));
   *  2. zip.file(brand.files.json, JSON.stringify(serializer.write(project, {variant: 'zip', textureNames}), null, 2));
   *     layout = wallController.layout({frame: 'export'}) (03 T3); OBJ + MTL files (objExporter.write({..., textureNames, atlasFile: combined mode ?
   *     atlasPlan.file : null}), 08 P2-6c, P2-7f: only the combined MTL maps the atlas, its UVs are atlas-placed); glTF file;
   *  3. folder = zip.folder('textures'); atlas = computeAtlas(sections); for i not skipped: canvas = panelIds.sectionCanvas(
   *     sections[i], i, null, atlas.entries[i].startCol); dataUrl = canvas.toDataURL('image/png'); `data:,` (a device limit
   *     below the hard limit) -> late.push(i); else folder.file(names[i], base64, {base64: true});
   *     then (08 P2-7f, Q5) #addAtlasTexture(zip, sections, atlasPlan): unless skipped, panelIds.atlasCanvas(sections,
   *     atlas).toDataURL('image/png') -> zip.file(atlasPlan.path, base64, {base64: true}), or a late skip on `data:,`;
   *  4. if a section texture was late: skipped[i] = true and textureNames[i] = null for each, then the JSON entry is
   *     written again; if a section texture or the atlas was late, the MTL entry is written again (JSZip keeps their
   *     position);
   *  content = await zip.generateAsync({type: 'blob'}); downloader.saveBlob(content, brand.files.zip);
   *  5. if any skipped: dialogs.alert(M-EXP-4) with every left-out entry name: `textures/${names[i]}` in section order,
   *     then the atlas path. The body is the private #writeZip(), run by #runExport (08 P2-1a: a failure is the M-EXP-1
   *     alert instead of an unhandled rejection). */
  async exportZIP()
  /** Shared by exportZIP and exportOBJ (08 P2-6e): #planSectionTextures(sections) -> {names: textureFileNames(sections),
   *  skipped: !canvasFits(panelIds.sectionSize(s, null)) per section, textureNames: names with null where skipped} (step 1);
   *  #addSectionTextures(folder, sections, plan) draws each planned texture (start columns from computeAtlas) into folder as
   *  names[i], a `data:,` PNG skipped late (plan updated), and returns whether one was (steps 3-4); #reportLeftOut(plan)
   *  alerts M-EXP-4 with `textures/${names[i]}` for every skipped texture (step 5), then the atlas path when atlasPlan was
   *  skipped. 08 P2-7f: #planAtlas(sections) -> {path: atlasTexturePath(brand.files), skipped, file: skipped ? null : path};
   *  #addAtlasTexture(zip, sections, atlasPlan) draws the atlas canvas and adds it at atlasPlan.path, or skips it late. */
  #planSectionTextures(sections); #addSectionTextures(folder, sections, plan); #reportLeftOut(plan, atlasPlan)
  #planAtlas(sections); #addAtlasTexture(zip, sections, atlasPlan)
  /** 2786-2827: group = safeDistance.object3D; if (!group) { dialogs.alert('Enable Safe Distance 3D visualization first'); return }
   *  sb = group.userData?.stageOrigin ?? {x: 0, z: 0}; P = wallController.pivotResolution?.point ?? {x: 0, y: 0, z: 0};
   *  text = objExporter.writeSafeDistance(group, safeDistance.lastBand, {translate: {x: sb.x - P.x, y: -P.y, z: sb.z - P.z}})
   *  (03 T3, 7.1: into the current export frame, a stale group included); blob = new Blob([text], {type: 'text/plain'});
   *  downloader.saveBlob(blob, brand.files.safeDistanceObj)   (B-M1 fixed in 08 P2-5a: legacy called the undefined
   *  `downloadBlob` and threw a ReferenceError; since 08 P2-5b the band is mitred, clamped and +Y, with `vn` lines and the
   *  `# Clamped:` header line: B-M15 and B-L29 fixed) */
  exportSafeDistanceOBJ()
  /** P-IMPORT (section 6.10), legacy importJSON 4967-5010. The parameter keeps the legacy name `e`, because the
   *  FileReader onload callback inside it names its own argument `event` (legacy importJSON(e) / reader.onload = (event) => ...). */
  importFromInputEvent(e)
}
```


#### `js/app/DebugViewController.js` (01 F1-1, 01 5.2)
```js
export class DebugViewController {
  /** Each use case writes DebugViewSettings, then #emit() = bus.emit(DEBUG_VIEW_CHANGED, settings.snapshot()), then makes its
   *  one render call (R2: model, mirror, render). F1-1 had no bus and no event; 01 T7 (F1-2) added both together with the
   *  subscriber DebugViewControls (5.1 rule 7). */
  constructor({ settings, wallView, normalsView, bus })
  toggleNormals()                        // normals.enabled = !enabled; #emit(); normalsView.sync(); @returns the new state
  setNormalLineKinds({ vertex, face })   // the booleans given; #emit(); normalsView.sync()
  setLengthScale(raw)                    // normals.lengthScale = DebugViewSettings.parseLengthScale(raw); #emit(); sync(); @returns it
  setOnTop(on)                           // normals.onTop = !!on; #emit(); normalsView.sync()
  setShading(mode)                       // shading = DebugShading value or 'content'; #emit(); wallView.setDebugShading(shading)
  cycleShading()                         // setShading(settings.nextShading())
}
```

### 3.11 UI (DOM panels)

Every panel follows the same shape:
- `constructor(deps)`: stores collaborators, looks up its own elements by id/selector (no mutation), and subscribes to its mirror events (so the subscriptions exist before the bootstrap rebuild).
- `bind()` (or a more specific `bind*()`): adds DOM listeners. `App.start()` calls it at the legacy `setupUI` position (section 7).
- Handlers call controllers (down). Event handlers only mirror (R3).
- Each DOM id is owned by exactly one module (the static check enforces it). `App.js` additionally looks up `#three-canvas` (for `SceneManager`), exactly these six ids for `PreviewWindow`: `#camera-preview-window`, `#camera-preview-canvas`, `#camera-preview-resize`, `#camera-preview-info`, `#camera-preview-fov`, `#camera-preview-res`, and `#debug-normals-stats` for `NormalsDebugView`, which owns it (01 F1-2, 01 5.6). (`#camera-preview-options` belongs to `CameraPanel`.)

#### `js/ui/dom.js`
```js
export const byId = (doc, id) => doc.getElementById(id);
/** 08 P2-3a (B-M4, 08 6.5): String(s) with & < > " ' replaced by &amp; &lt; &gt; &quot; &#39; (HTML_ESC); every
 *  interpolation of a section value in a ui/ innerHTML template goes through it (text content and double-quoted
 *  attribute values). Non-strings go through String(), which is what a template literal does with them. */
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESC[c]);
/** 08 P2-3c (B-L16, 08 6.5): titleEl.textContent = name; if (warn) append titleEl.ownerDocument.createTextNode(' ') and a
 *  <span class="warning-indicator">⚠</span> (created through titleEl.ownerDocument, no global document): the markup
 *  the card template renders, for any name. Used by the live rename and #patchCard. */
export function setTitleWithWarning(titleEl, name, warn)
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
   *  @param {{doc, project: Project, wallController: WallController, bus, palette: {cardSwatches}}} deps
   *  palette (06 T7): the card renders one swatch per palette.cardSwatches colour, each on its own line with the legacy
   *  indentation (the six legacy colours would give the legacy markup byte for byte) */
  constructor({ doc, project, wallController, bus, palette })
  /** #add-section-btn click -> wallController.addSection()  (4154) */
  bindAddButton()
  /** Verbatim renderWallSections 3893-4078: container.innerHTML = ''; renderedSections = wall.sections.slice();
   *  for each (section, index): section.ensureName(index); warning block template (verbatim 3909-3916, multi-line, ONLY in render);
   *  card = div.className 'wall-section collapsed'; card.innerHTML = verbatim template 3920-3980 (06 T1: the offset hint is
   *  <div class="curve-hint curve-hint--small"> instead of its inline font-size: 9px; 06 T4c: the labels "Panel Angle (°)"
   *  and "Panel Colour" and the title "Custom colour"; 08 P2-8a: step="1" on the columns, rows and Pixels X/Y inputs,
   *  max="100000" on panel height, max="65536" on Pixels X/Y, min="-180" max="180" on the panel angle) with EVERY interpolation of a
   *  section value passed through escapeHtml() (ui/dom.js; B-M4 fixed in 08 P2-3a): name (title and input value), colour (dot style and colour input),
   *  id, the numeric field values (imported strings are not coerced, B-L8), summary (it contains the raw panelCols /
   *  panelRows) and hint; the six swatches stay literal; the 4K warning's canvasWidth / canvasHeight are products of two
   *  fields, always numbers, and go through escapeHtml too (a no-op; 08 P2-3a escapes every interpolation);
   *  the delete button only when wall.count > 1; summary = section.summary; hint = section.curveHint;
   *  title ⚠ when section.exceeds4K; append; then the card listeners in legacy order:
   *   1. .section-header click: if (!e.target.closest('.section-delete')) card.classList.toggle('collapsed')
   *   2. .section-delete click: e.stopPropagation(); wallController.deleteSection(section.id)
   *   3. each .color-swatch-small click: e.stopPropagation(); remove 'active' from all swatches; add to this one;
   *      color = swatch.dataset.color; dot style.background = color; custom input value = color; wallController.setSectionColor(section, color)
   *   4. .color-input-custom input: e.stopPropagation(); remove 'active' from all swatches; dot style.background = e.target.value;
   *      wallController.setSectionColor(section, e.target.value)
   *   5. .section-name-input input: e.stopPropagation(); name = wallController.renameSection(section, e.target.value, index);
   *      setTitleWithWarning(title, name, !!card.querySelector('.warning-indicator'))   (08 P2-3c; legacy: title.innerHTML = name + ...);
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
- `#patchCard(card, section, field)`: verbatim 4040-4071 (no `value` parameter: the hint comes from `section.curveHint`, which equals the legacy local `value` after `setField`). Curve hint (first `.curve-hint` of the card) from `section.curveHint` when `field === 'curveIntensity'`; summary from `section.summary`; 4K warning: insert the **single-line** warning `innerHTML` (verbatim 4061, distinct from the render template) before the first child of `.section-content`, write the title with `setTitleWithWarning(titleEl, section.name, true)` (08 P2-3c, B-L16 fixed: legacy inserted the ⚠ after the first `Wall \d+` match of the title's markup, so a renamed section got none); remove the warning and write the title with `setTitleWithWarning(titleEl, section.name, false)` when no longer exceeding; update the span text when it still exceeds.
- `#onSectionsChanged({ reason, addedId })` (WALL_SECTIONS_CHANGED subscriber):
  - `reason === 'import'`: `render(); expandFirst();` (4998-5001).
  - `reason === 'add'` / `'delete'`: `states = #snapshotCollapsed(); render(); #restoreCollapsed(states, reason === 'add', addedId)`.
- `#snapshotCollapsed()`: verbatim 4083-4086 with the rendered list: `doc.querySelectorAll('.wall-section').forEach((el, idx) => states[renderedSections[idx].id] = el.classList.contains('collapsed'))`, where `renderedSections` is the copy taken by the previous `render()` (see PR2).
- `#restoreCollapsed(states, expandNew, addedId)`: verbatim 4109-4116 / 4138-4143 over `doc.querySelectorAll('.wall-section')` with `section = project.wall.sections[idx]`: when `expandNew && section.id === addedId` remove `'collapsed'` (strict equality: a NaN id never matches, exactly like legacy); otherwise `if (states[section.id] !== undefined) el.classList.toggle('collapsed', states[section.id])`.

#### `js/ui/SectionLogosPanel.js`
```js
export class SectionLogosPanel {
  /** Owns #section-logos-container. Subscribes:
   *   WALL_SECTIONS_CHANGED: if (project.display.panelIdsEnabled) render()   (4106, 4135; every reason, the import included since 08 P2-3d, B-L21)
   *   WALL_SECTION_RENAMED: render()                                                              (4020; the controller already gated it)
   *   DISPLAY_CONTENT_CHANGED: if (toggled === 'panelIds' && on) render()                          (4197)
   *  @param {{doc, project: Project, wallController: WallController, bus}} deps */
  constructor({ doc, project, wallController, bus })
  /** Verbatim renderSectionLogosUI 2189-2254: if (!container) return; innerHTML = ''; per section: hasLogo = logos.hasImage(section.id);
   *  logoData = logos.get(section.id) || { position: 'center', scale: 0.3 }; div.className = 'logo-row' (06 T1; legacy:
   *  div.style.cssText); template verbatim except the 06 T1 classes of css/99-utilities.css that replaced its inline styles
   *  (the name div logo-row__title, the two labels logo-row__label, the scale input logo-row__input; the file input keeps
   *  its inline display: none), with
   *  escapeHtml(section.name || 'Wall ' + (index + 1)) (B-M4 fixed in 08 P2-3a) and every raw section.id interpolation
   *  (the seven data-section-id attributes; imported ids can be arbitrary strings) also through escapeHtml; computed
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
   *  CAMERA_POSE_CHANGED, CAMERA_SAFE_DISTANCE_TOGGLED (formats below). (03 T4's WALL_PIVOT_CHANGED and WALL_REBUILT
   *  mirrors of the #camera-pos-z min attribute left with 08 P2-11c, which removes the Z minimum and the attribute.)
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
- `CAMERA_COVERAGE_CHANGED({frameWidth, frameHeight, status, safeDistance, distToWall})`: (03 T6, 3.5) `#camera-wall-distance` = `` `${distToWall.toFixed(2)}m` `` (the "Distance to wall plane" row; since 08 P2-11a the analyser's D0, the optical-axis distance to the wall plane the camera is aimed at); `#frustum-width` = `` `${frameWidth.toFixed(2)}m` ``, `#frustum-height` likewise (08 P2-11a: each of the three reads "—" when its value is null, no wall plane ahead); `#frustum-status-text`: `offWall` (08 P2-11a, M-COV-1) -> 'Not aimed at wall' + `statusEl.style.color = theme.ui.status.exceeds`; `within` -> 'Within bounds' + `statusEl.style.color = theme.ui.status.within`; `offCenter` -> 'Off-center' + `theme.ui.status.offCenter`; `exceeds` -> 'Exceeds wall' + `theme.ui.status.exceeds` (textContent then colour, as 2516-2524; `statusEl.style.color` is a DOM style write, which check rule 10 does not count); `#safe-distance` = `` `≤ ${safeDistance.toFixed(2)}m` `` (2484-2533).
- `CAMERA_POSE_CHANGED({source, axis})` (input `.value` writes):
  - `'reset'`: pos-x `cine.posX.toFixed(1)`, pos-y `cine.posY.toFixed(1)`, pos-z `cine.posZ`, rot-x/y/z raw values (2567-2572);
    since 08 P2-11c pos-z `roundTo(cine.posZ, 1000)` and rot-x/y/z `roundTo(v, 10)` (`Math.round(v * k) / k || 0`: 1 mm and 0.1
    degree without trailing zeros, so the legacy "5" and "0" are unchanged and a Reset facing a curved or turned wall shows
    no float noise; the model keeps the exact pose);
  - `'gizmo-translate'`: pos-x/y/z `toFixed(2)` (3342-3344);
  - `'gizmo-rotate'`: only `#camera-rot-${axis}` `toFixed(1)` (axis 'x', 'y', else 'z'; 3378/3381/3384);
  - `'pilot-look'`: rot-x then rot-y `toFixed(1)` (3554-3555);
  - `'pilot-move'`: pos-x/y/z `toFixed(2)` (3614-3616);
  - `'pivot'` (03 T4, the re-expression of a pivot edit): pos-x and pos-z `toFixed(2)`.
- `CAMERA_SAFE_DISTANCE_TOGGLED({enabled})`: `#export-safe-distance` display (4325).
- (03 T4's `WALL_PIVOT_CHANGED` / `WALL_REBUILT` mirror of the `#camera-pos-z` `min` attribute and the exported
  `cameraZMinAttribute` were removed by 08 P2-11c with the attribute itself: the Z input has no minimum, Q13.)

#### `js/ui/PropsPanel.js`
```js
export class PropControls {            // new PropControls({doc, prefix: 'person', ...}) and ({..., prefix: 'car', ...})
  /** Owns #toggle-<prefix>, #<prefix>-options, #<prefix>-pos-x, #<prefix>-pos-z, #<prefix>-rot-y, #<prefix>-scale.
   *  Subscribes PROP_VISIBILITY_CHANGED and PROP_POSE_CHANGED, ignoring payloads whose id !== prefix:
   *   visibility: #<prefix>-options display (4335 / 4366);
   *   pose 'gizmo-translate': pos-x, pos-z = toFixed(2) (3351-3352 / 3358-3359); 'gizmo-rotate': rot-y = toFixed(1) (3391 / 3397);
   *   'pivot' (03 T4): pos-x, pos-z = toFixed(2).
   *  @param {{doc, prefix: 'person'|'car', controller: PropController, prop: Prop, bus}} deps */
  constructor({ doc, prefix, controller, prop, bus })
  /** 4332-4361 / 4363-4392: toggle click -> controller.setVisible(flipToggle(el));
   *  pos-x, pos-z, rot-y, scale change -> v = controller.setField(field, el.value); if (Prop.FIELD_RULES[field].writeBack) el.value = v;
   *  controller.applyTransform() */
  bind()
}
```

#### `js/ui/PivotPanel.js` (03 T6; docs/improvements/03-pivot.md 3.2, 3.6, 5.3)
```js
export const PIVOT_WARNING_DISTANCE_M = 50
/** layout-frame readout: null -> 'Pivot unavailable · invalid section values'; no sections -> 'No wall sections · pivot at
 *  offset <x, y, z> m'; else 'Pivot (from wall start): <x>, <y>, <z> m' (toFixed(3)), + ' · Pivot is <d> m from the
 *  anchor' with warning: true when |offset| > 50 m (the line gets .pivot-warning) */
export function pivotReadoutText(resolution, sectionCount)   // {text, warning}
/** 'mode' | 'offset' | 'reset-offset' | 'gizmo': stageShift != 0 ? 'Stage origin moved <+dx>, <+dz> m · camera and props kept
 *  their place' (reexpressed) | '... kept their coordinates' : 'Pivot height <y> m · affects exports only' ('' for a null
 *  resolution); 'import': ''; 'keep-stage' | 'marker': null (unchanged). Signs: '+' only for a positive value. */
export function pivotStatusText(payload)                      // string | null
/** cause 'init' | 'import': ''; 'edit': stageShift != 0 ? 'Wall edit moved the stage origin by <+dx>, <+dz> m (relative to
 *  the wall start) · camera and props kept their coordinates' : ''; 'pivot' (and anything else): null (unchanged) */
export function rebuildStatusText(payload)                    // string | null
export class PivotPanel {
  /** Owns #pivot-mode-select (its .pivot-mode-option labels and pivot-mode radios), #pivot-offset-x/y/z, #pivot-reset-offset,
   *  #pivot-select, #pivot-snap, #toggle-pivot-keep-stage, #toggle-pivot-marker, #pivot-readout, #pivot-status.
   *  Subscribes (pure functions of the payload, R3; no event history):
   *   WALL_PIVOT_CHANGED -> radios checked + label .active, offsets toFixed(3), #pivot-reset-offset.disabled iff (0, 0, 0),
   *     the switches' .active + aria-checked (keep from the payload, marker from display.showPivotMarker), readout, status
   *   WALL_REBUILT -> readout from layout.pivot.resolution; status = rebuildStatusText(payload) unless null
   *   SELECTION_CHANGED -> #pivot-select .active + aria-pressed (selected id === 'pivot')
   *  @param {{doc, project: Project, pivotController: PivotController, bus}} deps */
  constructor({ doc, project, pivotController, bus })
  /** radio change (never a label click, B-L13) -> setMode; offset change -> el.value = setOffsetAxis(axis, el.value).toFixed(3);
   *  #pivot-reset-offset -> resetOffset(); #pivot-select -> toggleSelect(); #pivot-snap change -> setSnapStep(Number(value));
   *  the two role="switch" toggles: click, Space, Enter -> setKeepStageLayout(!pivot.keepStageLayout) /
   *  setMarkerVisible(!display.showPivotMarker) (the mirror writes the class and aria-checked) */
  bind()
}
```

#### `js/ui/ViewportToolbar.js`
```js
export class ViewportToolbar {
  /** Owns #view-front/side/top/reset, #toggle-grid, #gizmo-translate, #gizmo-rotate, #gizmo-space, #gizmo-pilot,
   *  #selection-indicator, #pilot-info. Subscribes:
   *   SELECTION_CHANGED({id, label, modes}): id ? (add 'visible'; .selected-name = label || 'Unknown') : (remove 'visible'; 'None')  (3155-3167);
   *     03 T5: + ' (translate only)' while the gizmo mode is 'rotate' and the cached modes lack 'rotate' (re-evaluated on
   *     GIZMO_MODE_CHANGED for such a selection only; a legacy target's badge is never rewritten there)
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
   *  export-obj -> exportOBJ() (the button reads "Export OBJ (ZIP)" with a title saying it downloads one ZIP, 08 P2-6e);
   *  export-gltf -> exportGLTF(); #import-json click -> #import-input.click();
   *  #import-input change -> projectIO.importFromInputEvent(e). Listeners return the promise of async exports (an unhandled
   *  rejection stays unhandled, as legacy). */
  bind()
}
```

#### `js/ui/DebugViewControls.js` (01 F1-2, 01 3.1-3.5, 5.2)
```js
export class DebugViewControls {
  /** Owns #toggle-normals, #debug-view-btn, #debug-view-popover, #debug-view-title, #debug-shading-content/-face/-normals,
   *  #debug-normals-vertex, #debug-normals-face, #debug-normals-scale, #debug-normals-scale-value, #debug-normals-ontop,
   *  #debug-view-close, #debug-view-legend and #debug-view-status (not #debug-normals-stats: NormalsDebugView's).
   *  Subscribes DEBUG_VIEW_CHANGED -> mirror(snapshot): #toggle-normals .active + aria-pressed; #debug-view-btn .active while
   *  shading !== 'content'; radios, checkboxes, range and "×N.NN" text; legend rows (face / normal colours by shading, the
   *  normals row while the lines are on; the legend hidden when no row shows); the announcer (the first changed setting,
   *  e.g. "Normal lines on", "Shading: Face orientation", "Length ×2.00", written 400 ms after the last change).
   *  Imports only core (EventBus, typingTarget) and ui/dom.js. @param {{doc, win, controller: DebugViewController, bus, theme}} deps */
  constructor({ doc, win, controller, bus, theme })
  /** Sets each legend swatch's --swatch from theme.scene.debug; #toggle-normals click -> controller.toggleNormals();
   *  #debug-view-btn click -> close, or open (keyboard open iff e.detail === 0); #debug-view-close click -> closePopover();
   *  radios change -> setShading(value); vertex / face change -> setNormalLineKinds; range input + change -> setLengthScale;
   *  on-top change -> setOnTop. Pointer-change blur rule: popover pointerdown sets a flag; the next change blurs the focused
   *  control inside the popover and clears it; a setTimeout(0) after pointerup / pointercancel and any keydown inside clear it. */
  bind()
  /** Document keydown, bubble phase, registered after ViewportInput.attachShortcuts:
   *  if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
   *  if (e.key.toLowerCase() === 'n') { e.shiftKey ? controller.cycleShading() : controller.toggleNormals() } */
  bindShortcuts()
  isPopoverOpen()            // !popover.hidden (07 C42's Escape entry at priority 70 reads it from 07 I1 on)
  /** popover.hidden = false; placement (popoverPlacement: down at the button top, else up at its bottom, clamped to the
   *  overlay with 20 px margins; style.top and data-placement); aria-expanded; adds the capture-phase document keydown
   *  listener (Escape only: stopPropagation + closePopover; until 07 I1), the capture-phase outside-pointerdown close and the
   *  window resize re-placement; a keyboard open focuses the checked shading radio. */
  openPopover({ keyboard = false } = {})
  /** Hides it, removes the three listeners; focus returns to #debug-view-btn iff it was inside the popover (an outside
   *  pointerdown passes moveFocus: false). */
  closePopover({ moveFocus = true } = {})
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
   *  the legacy setupUI() phase and setView('reset'), then (06 T5) starts the font gate. Nothing is attached to window. */
  start()
}
```
`App` is the only module that imports `theme/Theme.js` (and, since 06 T3, `theme/ThemeBridge.js`), `vendor/jszip.js` and every class. It defines `colorToRgb = (s) => new THREE.Color(s)`, `frameBounds = () => framingBounds(wallController.currentLayout)` (08 P2-11c: the framing of the stage layout of the last rebuild, memoised per layout; evaluated lazily, after `wallController` exists) and `stageLayout = () => wallController.currentLayout` (08 P2-11a: the hub's coverage analyser), and the frame tick `() => { orbit.tickKeyboard(); pilot.tickKeyboard(); sceneManager.renderFrame(); }` (legacy animate 3886-3889; since 07 R2 `renderFrame()` draws the main pass and then the injected `previewPass`, `sceneManager.setPasses([previewPass])`, inside `withPassHidden`; 08 P2-10a passed the helper set to the second renderer, which 07 R1 replaced by the preview camera's layer mask and `withPassHidden`, and 07 R2 deleted that renderer).


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
| `frustumHelper` (1301) | `CameraRigView` private `#linesHalo` / `#linesCore` (06 T5: the two-tone frustum, one shared geometry) | `CameraRigView.rebuildFrustum/remove` |
| `frustumOutline` (1302) | `CameraRigView` private `#fill` (it is the fill mesh) | same |
| `wallIntersectionPlane` (1303) | **dropped (dead)**: never created, only nulled (2546) and null-checked (2358-2362) | - |
| `filmbackPresets` (1306) | `domain/CineCamera.js FILMBACK_PRESETS` (frozen) | - |
| `cameraSettings` (1320) | `Project.camera` (`CineCamera`, same field names) | `CineCamera` methods only (`setField`, `applyPreset`, `resetTo`, `translateBy`, `rotateBy`, `pilotLook`, `pilotFly`; 03 T1 `translateStage`, the pivot re-expression), called by `CameraController` and `PilotController` |
| `personMesh` (1334) | `PersonPropView.object3D` | `PropView.create/remove` |
| `carMesh` (1335) | `CarPropView.object3D` | same |
| `showPerson` (1336) | `Project.person.visible` | `PropController.setVisible` |
| `showCar` (1337) | `Project.car.visible` | same |
| `personSettings` (1339) | `Project.person` (`PersonProp`: posX, posZ, rotY, scale) | `Prop` methods (`setField`, `translateBy`, `rotateBy`; 03 T1 `translateStage`) via `PropController` |
| `carSettings` (1346) | `Project.car` (`CarProp`) | same |
| `previewCamera` (1354) | `PreviewPass.camera` (07 R2; `PreviewWindow.camera` before) | `PreviewPass.updateCamera` |
| `previewRenderer` (1355) | deleted by 07 R2 (the main renderer draws the preview; `PreviewWindow.initialized` now means the resize listeners are registered); never disposed before, as legacy | - |
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
| `cameraBodyMesh` (1372) | `CameraRigView.bodyMesh` (nulled by `remove()` since 08 P2-4a; legacy never nulled it) | `CameraRigView.create`, `CameraRigView.remove` |
| `pilotMoveSpeed` (1375) | `PilotController.moveSpeed` | `PilotController.onWheel` |
| `isPilotLooking` (1376) | `PilotController` private `#looking` | `PilotController` mouse handlers, `toggle` |
| `pilotLastMouse` (1377) | `PilotController` private `#lastMouse` | same |
| `sectionColors` (1379) | `Theme.Palette.sectionColors` (injected as `palette` into `WallController`, `ProjectSerializer` and, since 06 T7, `SectionListPanel` for the card swatches); since 06 T7 the Morph palette, with the Phase-1 colours kept as `Palette.legacySectionColors` for the v1 import fill | - |
| `panelBorderColors` (1384) | `Theme.CanvasTheme.panelBorderColors` (injected into `PanelIdRenderer`) | - |
| `panelIdFontColor` (1387) | `Project.panelIdStyle.fontColor` | `PanelIdStyle.set` |
| `sectionLabelEnabled` (1388) | `Project.panelIdStyle.sectionLabelEnabled` | same |
| `sectionLabelFontSize` (1389) | `Project.panelIdStyle.sectionLabelFontSize` | same |
| `sectionLabelColor` (1390) | `Project.panelIdStyle.sectionLabelColor` | same |
| `sectionLogos` (1393) | `Project.logos` (`LogoLibrary`, plain-object keys) | `LogoLibrary` methods via `SectionLogosPanel` and `WallController.deleteSection` |
| `wallSections` (1395) | `Project.wall.sections` (`WallSection[]`; pushed on add, replaced on delete/import) | `Wall` methods, `WallSection` methods (via `WallController`; `ensureName` at render time) |
| `nextSectionId` (1409) | `Project.wall.nextSectionId` | `Wall.allocateId` (through `appendLikeLast`), `Wall.replaceAll` |
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
| DOM inline `style.display` of option blocks, `#custom-filmback`, `#export-safe-distance`, `#camera-preview-window`; `#frustum-status-text` colour; preview window size (the canvas inline size until 07 R2) | DOM, owned by the module that writes it (`WallDisplayPanel`, `CameraPanel`, `PropControls`, `PreviewWindow`) | owners |

| (01 F1-1, not legacy) normals debug view settings | `DebugViewSettings.shading`, `.normals.enabled`, `.normals.vertex`, `.normals.face`, `.normals.lengthScale`, `.normals.onTop` (not persisted) | `DebugViewController` only (its use cases; static rule 10 ALLOWLIST) |
| (01 F1-1, not legacy) the debug-shading override | `LEDWallView` private `#shading`, `#override` (`MaterialOverride` stash) and the wall meshes' `.material` | `LEDWallView.setDebugShading/rebuild/withContentMaterials` (through `MaterialOverride`) |
| (01 F1-1, not legacy) the normal lines | `NormalsDebugView.object3D` (its `LineSegments` and buffers), `#last` | `NormalsDebugView` (its `WALL_REBUILT` handler, `sync`, `dispose`) |
| (03 T1, not legacy) the wall pivot | `Project.wall.pivot` (`WallPivot`: `mode`, `offset`, `keepStageLayout` and, since F3-O1, `orientation` = `{align, yawOffsetDeg}` (03 §12); session-only until project file v2, the owner's decision of 2026-10-17) | `WallPivot` methods only (`setMode`, `setOffsetAxis`, `setOffset`, `resetOffset`, `setKeepStageLayout`, and since F3-O1 `setAlign`, `setYawOffset`), called from `PivotController` (03 T4; the orientation use cases from F3-O3); the field `Project.wall.pivot` itself is assigned only by `WallController.applyImport` (03 4.4) |
| (03 T5, not legacy) the cancelled-gesture flag and the snap increments | `InteractionState.gestureCancelled` (set by `cancelDrag`, cleared by `onMouseUp` and the next `onMouseDown`), `InteractionState.snap` (`{pivotM: 0.1}`; spec 02 adds its keys; session-only) | `TransformGizmo` only (`snap` through `setSnapIncrements`, a merge) |
| (03 T5, not legacy) the pivot marker | `PivotMarkerView` private `#group` (its glyph, ghost, drop and link objects), `#resolution`, `#preview`, `#selected` | `PivotMarkerView` (`init`, its three mirrors, `setPreview` / `clearPreview` from `PivotController`, `updateScale` from the pre-render hook) |
| (03 T1, not legacy) the pivot-marker flag | `Project.display.showPivotMarker` (initially `DisplaySettings.DEFAULT_SHOW_PIVOT_MARKER`, `true` since 03 step C, T9; session-only) | `PivotController.setMarkerVisible` (03 T4) |

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
| `wall:sectionsChanged` (`WALL_SECTIONS_CHANGED`) | `{reason: 'add'\|'delete'\|'import', addedId?}` | `WallController.addSection/deleteSection` right after the model change (legacy re-render point 4105 / 4134); `applyImport` (4998) | `SectionListPanel` (snapshot, render, restore; or render + expandFirst for import), `SectionLogosPanel` (render iff panel IDs are on, for every reason; the import since 08 P2-3d, B-L21) |
| `wall:sectionRenamed` (`WALL_SECTION_RENAMED`) | `{}` | `WallController.commitRename()` only when panel IDs are on (4020) | `SectionLogosPanel` (render) |
| `wall:meshModeChanged` (`WALL_MESH_MODE_CHANGED`) | `{mode}` | `WallController.setMeshMode` (after the model write, 4160) and `applyImport` iff `meshMode` is truthy (4992-4995) | `WallDisplayPanel` (label `.active` by equality; idempotent after a click) |
| `wall:rebuilt` (`WALL_REBUILT`) | `{layout: WallLayout, meshMode, view: LEDWallView, cause: 'init'\|'pivot'\|'import'\|'edit', stageShift: {x, z}}` (`cause` and `stageShift` since 03 T3, additive: the stage-origin change against the resolution cached before this rebuild; `layout.pivot` holds `{resolution, frame: 'stage', translation}`) | `WallController.rebuild()` last step (after the hub) | `NormalsDebugView` (01 F1-1: caches `{layout, view}`, re-syncs the lines while they are on); `PivotMarkerView` (03 T5: placement) and `TransformGizmo` (03 T5: re-anchors a pivot target); `PivotPanel` (03 T6: readout, status by `cause`); seam for Features 2, 4, 5 |
| `display:contentChanged` (`DISPLAY_CONTENT_CHANGED`) | `{toggled: 'ledSim'\|'panelIds', on: boolean, forcedOff: boolean}` | `WallController.setLedSim/setPanelIds` after the model update, before cache clear and rebuild (4170-4176, 4190-4197) | `WallDisplayPanel` (option blocks, forced-off toggle), `SectionLogosPanel` (render iff `toggled === 'panelIds' && on`) |
| `camera:previewChanged` (`CAMERA_PREVIEW_CHANGED`) | `{enabled}` | `CameraController.setPreviewEnabled` after `cine.enabled = on` (4233) | `CameraPanel` (`#camera-preview-options` display) |
| `camera:filmbackChanged` (`CAMERA_FILMBACK_CHANGED`) | `{key}` | `CameraController.setFilmback` after `cine.applyPreset` (4254-4262) | `CameraPanel` (`#custom-filmback`, size inputs) |
| `camera:lensChanged` (`CAMERA_LENS_CHANGED`) | `{hFov, vFov, filmbackWidth, filmbackHeight}` (radians, mm) | `CameraRigView.rebuildFrustum` at the legacy readout point (2369-2371); twice on the first enable, as legacy | `CameraPanel` (`#camera-hfov/vfov/aspect`) |
| `camera:coverageChanged` (`CAMERA_COVERAGE_CHANGED`) | `{frameWidth, frameHeight, status, safeDistance, distToWall}` (`distToWall` since 03 T3: posZ - wallZ; since 08 P2-11a the analyser's D0; `status` gains `'offWall'`, and `frameWidth`, `frameHeight`, `distToWall` are null when no wall plane lies ahead) | `CameraHub.refresh` step 5 (2460) | `CameraPanel` (frame size, status text + colour, max distance; 03 T6: `#camera-wall-distance` from `distToWall`) |
| `camera:poseChanged` (`CAMERA_POSE_CHANGED`) | `{source: 'reset'\|'gizmo-translate'\|'gizmo-rotate'\|'pilot-look'\|'pilot-move'\|'pivot', axis?}` (`'pivot'` since 03 T3; its input mirror since 03 T4) | `CameraController.resetPose` (2567), `applyGizmoTranslate` (3342), `applyGizmoRotate` (3378/3381/3384), `PilotController.onMouseMove` (3554), `tickKeyboard` (3614), `CameraController.translateStage` (03 T3): always after the model write, before the hub | `CameraPanel` (input values, per-source precision) |
| `camera:safeDistanceToggled` (`CAMERA_SAFE_DISTANCE_TOGGLED`) | `{enabled}` | `CameraController.setSafeDistanceEnabled` (4325) | `CameraPanel` (`#export-safe-distance` display) |
| `prop:visibilityChanged` (`PROP_VISIBILITY_CHANGED`) | `{id, visible}` | `PropController.setVisible` after the model write (4335 / 4366) | `PropControls` with that prefix (`#<id>-options`) |
| `prop:poseChanged` (`PROP_POSE_CHANGED`) | `{id, source: 'gizmo-translate'\|'gizmo-rotate'\|'pivot'}` (`'pivot'` since 03 T3; its mirror since 03 T4) | `PropController.applyGizmoTranslate/Rotate` (3351, 3358, 3391, 3397), `PropController.translateStage` (03 T3) | `PropControls` with that prefix |
| `selection:changed` (`SELECTION_CHANGED`) | `{id, label, modes}` (`null`s and `modes: []` on deselect; `modes` since 03 T5: the gizmo modes whose `allowedAxes` is not `null`) | `SelectionManager.select` (before `gizmo.attach`), `deselect` (before `gizmo.detach`) (3141, 3148) | `ViewportToolbar` (badge; the translate-only suffix since 03 T5), `PivotMarkerView` (03 T5: colour, visibility), `PivotPanel` (03 T6: `#pivot-select`), `SectionListPanel` (2026-10-31: the selected card's `is-selected`), `SectionHighlightView` (2026-10-31: the tint and outline of a `section:<id>` selection) |
| `selectable:moved` (`SELECTABLE_MOVED`) | `{id}` | `CameraHub.refresh` last step (2466-2468), `PropController.applyTransform` (2889, 2980), `PivotController` (03 T4: the drag preview, the end of a drag or cancel, the end of P-PIVOT) | `TransformGizmo` (`updatePosition()` iff its target has that id) |
| `gizmo:modeChanged` (`GIZMO_MODE_CHANGED`) | `{mode}` | `TransformGizmo.setMode/clearMode` before `rebuild` (3176-3177, 4428-4429) | `ViewportToolbar` |
| `gizmo:spaceChanged` (`GIZMO_SPACE_CHANGED`) | `{space}` | `TransformGizmo.toggleSpace` before re-orientation (3184-3188) | `ViewportToolbar` |
| `pilot:changed` (`PILOT_CHANGED`) | `{active}` | `PilotController.toggle` right after the flip (3484-3485) | `ViewportToolbar` (button + banner), `PivotMarkerView` (03 T9: hidden in pilot) |
| `wall:pivotChanged` (`WALL_PIVOT_CHANGED`) | `{source: 'mode'\|'offset'\|'reset-offset'\|'gizmo'\|'import'\|'keep-stage'\|'marker', pivot: {mode, offset, keepStageLayout} (a copy), resolution: PivotResolution\|null, stageShift: {x, z}, reexpressed, rebuilds}`; a visual event (07 C47), 03 T4 | `PivotController.#commit` after the model write and the re-expression, before `wallController.commitPivot`; `setKeepStageLayout` / `setMarkerVisible` (`rebuilds: false`, the cached resolution); `WallController.applyImport` after the pivot assignment, before every other import event and the rebuild (`rebuilds: true`, `resolvePivotNow()`) | `PivotMarkerView` (placement, visibility; 03 T5); `PivotPanel` (03 T6: radios, offsets, Reset, switches, readout, status) |
| `debug:viewChanged` (`DEBUG_VIEW_CHANGED`) | `{shading, normals: {enabled, vertex, face, lengthScale, onTop}}` (a frozen `DebugViewSettings.snapshot()`); a visual event (07 C47) | `DebugViewController` after every settings write, before its render call (01 F1-2) | `DebugViewControls` (buttons, inputs, legend, announcer); added in the same step as the emitter (5.1 rule 7) |
| `uv:viewerChanged` (`UV_VIEWER_CHANGED`) | `{open, sectionId, pinned, background, space, aspect, editMode}` (space 'section'|'atlas'|'canvas', editMode 'island'|'vertices'); non-visual (07 C47), 04 UV-12 | `UvViewModel.setOpen/setSection/setPinned/setBackground/setSpace/setAspect/setEditMode` after the state write (only when the value changed) | `UVViewer` (panel shown or hidden, header, selects, pin, the channel select, the Edit switch and its rows, `#toggle-uv-viewer` `.active` and `aria-pressed`) |
| `uv:dataChanged` (`UV_DATA_CHANGED`) | `{sectionId, data: SectionUvData}` (04 5.4; `data.message` set for the empty and error states); non-visual, 04 UV-12 | `UvViewModel.refresh` while the viewer is open: `UvController.onWallRebuilt`, `onSectionRenamed`, the viewer commands and, at most once per animation frame, the live edits | `UVViewer` (canvas data, fields when not focused, chips, undo/redo, message) |
| `uv:transformChanged` (`UV_TRANSFORM_CHANGED`) | `{sectionId, transform: {offsetU, offsetV, scaleU, scaleV, rotation, flipU, flipV, sourceRotated}, summary, source: 'preview'\|'field'\|'drag'\|'preset'\|'flip'\|'turn'\|'source'\|'nudge'\|'copy'\|'history', live}`; visual, 04 UV-12 | `UvController` after each domain write of a UV use case (once per pointer move during drags, once per `input` while previewing; per restored section on undo/redo) | `UVViewer` (numeric fields), `SectionListPanel` (the card's `.section-uv-summary`, UV-14) |
| `uv:hoverChanged` (`UV_HOVER_CHANGED`) | `{source: 'wall'\|'uv-canvas', hit: HitDescription\|null, panelCorners3D: [{x, y, z} x4]\|null}`; visual, 04 UV-12 | `UvViewModel.publishHover` (from `UvController.onWallHover`, `probeUv`, `closeViewer`) | `UVViewer` (readout, crosshair), `UvHighlightView` (the hovered panel's outline on the wall, UV-15) |
| `uv:settingsChanged` (`UV_SETTINGS_CHANGED`) | `{combinedLayout, panelUvs, gltfCanvasTexcoord1, atlas: {widthLed, heightLed, pngPxPerLed, pngWidth, pngHeight, overTexture, fitsCanvas, maxTextureSize} \| null, sectionTextures: {reduced, pxPerLed} \| null}`; visual, 04 UV-14 | `UvController.setCombinedLayout/setPanelUvs/setGltfCanvasTexcoord1` (and their undo/redo) before the rebuild; `UvController.onWallRebuilt` (P1 step 8, so the bootstrap rebuild fills the note) | `WallDisplayPanel` (`#uv-combined-layout`, `#uv-panel-mode`, `#uv-gltf-uv1`, `#uv-atlas-note`) |

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
| PR7 | Pure precomputation is hoisted ahead of allocations or DOM writes in three more places: (a) `CameraHub.syncSafeDistance` evaluates `layoutProject(project)` and `frameBounds()` (its `stageExtent` since 08 P2-11c) as arguments, before `SafeDistanceView.create` runs `remove()` and `new THREE.Group()` (legacy computed the bounds and the walk after both, 2595-2647); (b) `CameraHub.refresh` evaluates the coverage (`cine.coverage(frameBounds())` until 08 P2-11a, then the analyser, which since 08 P2-11b also runs before the rig is rebuilt, its corner depths shaping the frustum) before `CameraPanel` writes `#frustum-width` / `#frustum-height` (legacy wrote those two first, 2484-2485, then computed the bounds, 2487-2493); (c) `ProjectIO.exportZIP` computes the start columns with `computeAtlas(sections)` before the texture loop (legacy accumulated `cumulativeCol` inside it, 4534-4542). | The hoisted code is pure JS over plain objects (the same walk, bounds loop and atlas bookkeeping as PR1): it allocates no THREE ids, touches no DOM, cannot throw, and reads only model state that the skipped-over steps do not change (`remove()`, `new THREE.Group()`, `textContent` writes, canvas creation and `toDataURL` never write the model). |

Boundaries of these proofs (recorded at WP10 integration from the WP4, WP6 and WP9 reviews). None of them is visible in the golden master; each was weighed and accepted rather than coded around:

- (a) PR6 and console warnings. three r128's `Color` calls `console.warn('THREE.Color: Unknown color ...')` for an invalid colour string. Legacy created one `Color` per section in section and panel mode, in every content mode (1714, 1779); the factory creates one per colour material (per section in section mode, per panel in panel mode) and none in LED-sim or panel-ID mode. So for an imported invalid colour the number of those warnings differs, and in section mode with a string column count such as `'0'` legacy printed the warning before throwing from the right-panel normal while the port throws without it. The harness records only exceptions, `console.error` and `console.assert`, never `console.warn`.
- (b) PR1 and PR7 "cannot throw". Arithmetic or comparison on an imported JSON object whose `toString` and `valueOf` are not callable (for example `panel.columns = {"toString":0,"valueOf":0}`) throws `TypeError: Cannot convert object to primitive value`. The import itself behaves as legacy (the card render throws first, and the import `try` alerts). On a later rebuild trigger, legacy removed the old wall before its walk threw (the scene is left without a wall), while `WallController.rebuild` throws in `layoutProject` before `view.rebuild` (the old wall stays visible).
- (c) PR2 "every change to the section array re-renders the cards". (Phase 1 record; since 08 P2-3b an import reaches `replaceAll` only with at most 200 validated sections and integer ids, and `replaceAll` no longer spreads the ids, so this boundary is unreachable.) `Wall.replaceAll` assigns the array and only then evaluates `Math.max(...ids)`, which throws for more than about 100k imported sections (`RangeError` from the spread) or for an object id like the one in (b). The import alerts and the cards are not re-rendered. On the next add or delete, legacy maps the old cards to the new ids (or, for an object id, throws in its snapshot before the push), while `SectionListPanel` maps them to the ids it last rendered (for an object id it pushes the section, increments `nextSectionId`, clears `#wall-sections` in `render()` and then throws).
- Not a reordering: after a mesh-mode label click, the `WALL_MESH_MODE_CHANGED` mirror re-runs `classList.toggle('active', ...)` on every option (legacy touched the labels only in the click handler and on import). The extra calls change no class.

### 6.1 P1: wall rebuild, `WallController.rebuild()` (legacy `createLEDWall`, 1457-1577)

```
1. prev = #pivotResolution; layout = layoutProject(project)         // 1479-1549 (PR1); the stage frame (03 T3, 5.6)
   #pivotResolution = layout.pivot.resolution; shift = stageShift(prev, #pivotResolution)
2. atlas = computeAtlas(sections); sectionScale = sectionTextureScale(sections)                  // 04 6.13 steps 2-3 (UV-7;
   uvPlans = planSectionUvs({layout, atlas, settings: project.uv, meshMode, applyTransforms:      // pure, no ids)
                             !isLedMaskContent(display.content)})
   view.rebuild({ layout, meshMode: project.meshMode, display, atlas, uvPlans, sectionScale, uvSettings: project.uv })
                                                                    // 1458-1477 dispose + groups, 1551-1557 dispatch,
                                                                    // 1559-1569 frames, 1571-1572 scene.add
3. this.publishStats()  -> emit WALL_STATS_CHANGED (HeaderStats)    // 1574
4. orbit.updateCameraPosition()                                     // 1575  the wall's generative box centre (08 P2-11c, via framingBounds); moves the camera even in pilot
5. if (project.camera.enabled) hub.refresh()                        // 1576  P2; re-drives the pilot view after step 4
5b. for (o of rebuildObservers) o.onWallRebuilt({layout, atlas, plans: uvPlans, sectionScale, cause})   // 04 6.13 step 8
                                                                    // (UV-11): UvController caches the live path's inputs,
                                                                    // fixes the viewed section, emits UV_SETTINGS_CHANGED
6. emit WALL_REBUILT { layout, meshMode, view, cause, stageShift: shift }   // new seam; cause and stageShift since 03 T3
```
`commitRename()` calls `o.onSectionRenamed?.()` on every rebuild observer first, always, before its panel-ID branch (04 5.3).
Exceptions in steps 1-5 propagate unchanged (for example, an import of garbage is caught by the import `try`, see 6.10).

### 6.2 The 24 `createLEDWall()` call sites (rebuild policy)

This table is the documentation of `WallController`'s rebuild policy and is repeated in its module header. `tests/unit/wall-controller.test.mjs` asserts every row's run count and tile-cache clears with spies.

| # | Legacy line | Trigger | UI entry | Controller call(s) | Rebuild | Other steps, in order |
|---|---|---|---|---|---|---|
| 1 | 1451 | bootstrap | `App.start` | `rebuild({cause: 'init'})` (03 T3) | always | none (hub skipped: preview off) |
| 2 | 4000 | swatch click | `SectionListPanel` | `setSectionColor` | always | swatch classes, dot, custom input (PR4) |
| 3 | 4010 | custom colour `input` | `SectionListPanel` | `setSectionColor` | always | clear swatches, dot (PR4) |
| 4 | 4021 | name `input` | `SectionListPanel` | `renameSection`, `commitRename` | iff panel IDs | title patch; `WALL_SECTION_RENAMED` (logo list) iff panel IDs |
| 5 | 4074 | number `change` | `SectionListPanel` | `setSectionField`, `commitSectionEdit` | always, stats first | write-back, card patch, `WALL_STATS_CHANGED` twice (before and inside the rebuild) |
| 6 | 4118 | `#add-section-btn` | `SectionListPanel.bindAddButton` | `addSection` | always, unless the wall has `Wall.MAX_SECTIONS` (M-SEC-1 alert, nothing else; 08 P2-3b) | `WALL_SECTIONS_CHANGED{add}` (cards, collapse, logo list iff panel IDs) |
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
| 24 | 5002 | import `FileReader.onload` | `ExportPanel` -> `ProjectIO` | `applyImport` | iff the validated read is ok (08 P2-3b), inside the `try`, with `cause: 'import'` (03 T3) | the pivot reset to the identity (03 4.4; no re-expression) and `WALL_PIVOT_CHANGED{import}` (03 T4), labels iff `mesh_mode`, `WALL_SECTIONS_CHANGED{import}`; then M-IMP-5 iff corrected |
| F3-1 | - | pivot mode radio `change` | `PivotPanel` (03 T6) | `PivotController.setMode` -> `WallController.commitPivot` | iff the stage origin moved (`cause: 'pivot'`) | re-express iff keep (camera, person, car: `translateStage`); `WALL_PIVOT_CHANGED{mode}`; `SELECTABLE_MOVED{pivot}` |
| F3-2 | - | pivot offset input `change` | `PivotPanel` (03 T6) | `setOffsetAxis` -> `commitPivot` | iff the x or z of the origin moved (never for y: the cache only) | write-back `toFixed(3)` |
| F3-3 | - | `#pivot-reset-offset` | `PivotPanel` (03 T6) | `resetOffset` -> `commitPivot` | iff the origin moved | - |
| F3-4 | - | gizmo mouse-up after a pivot drag | `TransformGizmo.onMouseUp` (03 T5) | `PivotController.endGizmoDrag({cancel: false})` -> `commitPivot` | iff the origin moved; **zero** rebuilds during the drag | Escape (`cancelDrag` -> `endGizmoDrag({cancel: true})`) commits nothing |
| F3-5 | - | keep-stage or marker toggle | `PivotPanel` (03 T6) | `setKeepStageLayout` / `setMarkerVisible` | never | `WALL_PIVOT_CHANGED` only |
| F6-1 | - | web fonts settled (06 5.6, the font gate) | `App.start` (`runFontGate`, fire-and-forget after the reset view) | `rebuildIfPanelIds` | iff a panel-ID canvas was drawn with a pending (font, text) **and** panel IDs are on (at most once; never in the harness) | none |

No other path calls `rebuild()` (rows F6-1 and `commitPivot`'s rows F3-1 to F3-4, 03 T4, are the call sites added since Phase 1 so far; `PivotController` never calls `rebuild()` itself). Never de-duplicate or debounce (row 8 rebuilds twice per click; rows 3, 16, 19 rebuild on every `input` event).

**Row ids** (07 §0.4, applied by 07 D0). Rows 1-24 are the legacy call sites and keep their numbers; tests and specs cite them by number (for example rows 3, 16 and 19). Every row added after Phase 1 carries a **named id** `<owner>-<n>` instead of the next free number, so rows from specs that land in any order never collide:
- `F<k>-<n>` for feature spec 0k (Feature k), `X<i>-<n>` for spec 09's item X<i>;
- reserved so far: `F2-1`..`F2-13` (02 §5.4), `F3-1`..`F3-5` (03 §5.6), `F4-<n>` (04, for any call site it adds), `F5-1`..`F5-3` (05 §5.5), `F6-1` (06 §5.6, the font gate); spec 09's items take `X<i>-<n>` ids in the commits that add their use cases;
- a row lands in this table, and in `tests/unit/wall-controller.test.mjs`, in the commit that adds its call site, never ahead of the code; rows that rebuild nothing (for example `F2-10`, a selection change) are listed too, so the table names every use case that could rebuild;
- an id is never renumbered or reused; amending a legacy row (for example 08 P2-8d's one rebuild per click for row 8) keeps its number.

### 6.3 P2: camera hub, `CameraHub.refresh()` (legacy `updateCameraFrustum`, 2451-2469)

```
if (!cine.enabled) return                                            // 2452
{payload, cornerDepths} = analysis                                    // 08 P2-11b: analyzeCoverage first (pure; PR7)
if (!rig.exists) rig.create(cine, cornerDepths)                      // 2454-2456: builds the frustum once (emits CAMERA_LENS_CHANGED)
rig.rebuildFrustum(cine, cornerDepths)                               // 2458: emits CAMERA_LENS_CHANGED again (kept, as legacy)
rig.updateTransform(cine)                                            // 2459
emit CAMERA_COVERAGE_CHANGED payload                                  // 2460  08 P2-11a: analyzeCoverage on stageLayout(); PR7
preview.updateCamera()                                               // 2461  (preview camera and labels; PreviewPass since 07 R2)
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

**Field edit** (number `change`, 4026-4075): `SectionListPanel` -> `wallController.setSectionField(section, field, raw)` -> `input.value = value` (PR4) -> `#patchCard` (hint, summary, 4K box and title ⚠ from the model since 08 P2-3c, B-L16) -> `wallController.commitSectionEdit()` = `publishStats()` (emit `WALL_STATS_CHANGED`) -> `rebuild()` (P1, which publishes stats again).

**Colour** (3992-4011): swatch: classes -> dot -> custom input -> `setSectionColor` (model, then P1). Custom input: clear swatches -> dot -> `setSectionColor`.

**Name** (4014-4023): `renameSection` (model) -> title `innerHTML` patch -> `commitRename()` = iff panel IDs: emit `WALL_SECTION_RENAMED` (logo list render) -> P1.

**P-ADD** `WallController.addSection()` (4081-4119):
```
if (!project.wall.canAddSection()) { dialogs.alert(M-SEC-1); return }   // 08 P2-3b (Wall.MAX_SECTIONS = 200)
s = project.wall.appendLikeLast(palette.sectionColors)       // 4088-4103 (the wall is never empty since 08 P2-3b)
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
if (on) { if (!preview.initialized) preview.init(); this.resetPose(); }          // 4235-4237 (init = the resize listeners; 07 R2 deleted the renderer and camera)
else {
  rig.remove()                                               // 4239
  hub.syncSafeDistance()                                     // 08 P2-4b (B-M8 fixed): enabled is false, so the floor is removed
                                                             // (legacy left it in the scene); the next enable rebuilds it
  if (pilot.active) pilot.toggle()                           // 4241-4243 enabled is already false; leaves pilot mode cleanly since 08 P2-4a (B-H4)
  if (selection.isSelected('camera')) selection.deselect()   // 4245-4247
}
```
**Reset** (2550-2575, also `#reset-camera`): `cine.resetTo(frameBounds())` (08 P2-11c: 5 m in front of the wall along its facing, looking at the wall box centre) -> emit `CAMERA_POSE_CHANGED{reset}` (inputs: X/Y `toFixed(1)`, Z to 1 mm and the rotations to 0.1 degree since 08 P2-11c) -> `hub.refresh()`.
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
- **Release** (canvas and window mouseup): `gizmo.onMouseUp()` (both fire; idempotent; 03 T5: the first one after a drag calls `target.endGizmoDrag?.({cancel: false})`, and every one clears `gestureCancelled`).
- **Escape** (4421-4432): 03 T5: a drag whose target implements `endGizmoDrag` -> `gizmo.cancelDrag()` only (`endGizmoDrag({cancel: true})`, selection and mode kept, the rest of the gesture swallowed); else pilot ? `pilot.toggle()` : `selection.deselect()` then `if (gizmo.mode) gizmo.clearMode()` (emit `GIZMO_MODE_CHANGED{null}` -> rebuild, which only removes).
- **O** (03 T5, 3.4; not in pilot, not during a (cancelled) drag): `pivotController.toggleSelect()`: selected ? `deselect()` : `select('pivot')` then `gizmo.setMode('translate')` unless already translate.
- **Pivot drag** (03 T5, rows F3-4): `beginGizmoDrag` on the handle hit; each move `applyGizmoTranslate(movement, ctx)` previews the marker only (`SELECTABLE_MOVED{pivot}`, no rebuild); the release commits P-PIVOT once; a rebuild of any cause re-anchors a selected pivot (`WALL_REBUILT`).
- **Prop hide / preview off**: conditional `deselect()` (6.5, 6.8).

### 6.10 Pilot mode and import

**Toggle** (P key, `#gizmo-pilot`, Escape, preview-off; 3477-3509): see `PilotController.toggle` (section 3.8).
**Look** (canvas drag in pilot, 3544-3558): `cine.pilotLook` -> emit `CAMERA_POSE_CHANGED{pilot-look}` -> `if (enabled) hub.refresh()` (whose `pilotDriver.refresh()` re-aims the main camera).
**Fly** (every frame while keys are held, 3564-3620): `cine.pilotFly` (silent posY clamp every frame) -> if moved: emit `CAMERA_POSE_CHANGED{pilot-move}` -> `if (enabled) hub.refresh()`.
**Wheel** (4475-4479): `pilot.onWheel(e)` (speed).

**P-IMPORT** `ProjectIO.importFromInputEvent(e)` (4967-5010):
```
file = e.target.files[0]; if (!file) return
if (file.size > MAX_IMPORT_BYTES) { dialogs.alert(M-IMP-6); e.target.value = ''; return }   // 08 P2-3b: never read
reader = new FileReader()
reader.onload = (event) => {
  try {
    data = JSON.parse(event.target.result)          // a parse error keeps the legacy alert text (V-5)
    r = serializer.read(data)                       // 08 P2-3b: detectVersion -> migrateV1toV2 -> validateProject
    if (!r.ok) { dialogs.alert(first error issue's message); return }   // M-IMP-1..4; nothing changes (atomic)
    wallController.applyImport({ sections: sectionsFromProject(r.project), meshMode: r.project.mesh_mode, logos: null })
                                                    // replaceAll (+ nextSectionId, 07 6.8) -> [meshMode iff not null: model +
                                                    // emit WALL_MESH_MODE_CHANGED] -> emit WALL_SECTIONS_CHANGED{import} -> P1
    if (r has warnings) dialogs.alert(M-IMP-5)      // up to 10 correction lines, then "…and n more"
  } catch (err) { dialogs.alert('Error parsing JSON file: ' + err.message) }
}                                                  // applyImport resets the logos (logos: null for v1; B-L21 fixed in 08 P2-3d)
reader.onerror = () => dialogs.alert(M-IMP-7)      // 08 P2-3b (legacy had no handler)
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

`SceneManager.startLoop(tick)`: `requestAnimationFrame(frame)` first, then `orbit.tickKeyboard()` -> `pilot.tickKeyboard()` (may run P2) -> `sceneManager.renderFrame()` (3884-3890): the helper layers re-tagged first (07 R1), the pre-render hooks, the main pass, then `previewPass.render(scene)` (07 R2: the scissor pass of the main renderer into the main canvas; guarded by `cine.enabled`, the window's visibility and its 50 x 30 CSS px minimum; the preview camera's mask leaves out HELPERS and DEBUG, and `withPassHidden` the gizmo: B-M11, fixed by 08 P2-10a, mechanism since 07 R1). The first frame runs synchronously inside the init phase.

### 6.13 Exports

All exports read the live project and a fresh `layoutProject(project, {frame: 'export'})` (since 03 T3: the file origin is the pivot; at the default pivot the walk itself), and a non-identity pivot adds the OBJ header lines and the glTF `scenes[0].extras.pivot` (03 7); none reads the scene except the safe-distance OBJ (its group, written in the current export frame through its `userData.stageOrigin` stamp). See `ProjectIO` (section 3.10) for the exact sequences of `exportJSON`, `exportOBJ` (async since 08 P2-6e: one ZIP, `brand.files.objZip`, with the OBJ, the MTL and the textures its `map_Kd` lines reference: the section textures in section mode, the combined atlas in combined mode since 08 P2-7f; legacy: the OBJ, then the MTL after 100 ms), `exportGLTF`, `exportPanelIds` (async, `toBlob`), `exportZIP` (async; JSON -> OBJ -> MTL -> glTF -> textures -> the combined atlas (08 P2-7f, every mode; only the combined MTL maps it) -> `generateAsync` -> download) and `exportSafeDistanceOBJ` (alert or download; 08 P2-5a). Export Panel IDs and Export All (ZIP) check every canvas against `CANVAS_HARD_LIMITS` before drawing it (08 P2-1c): an oversize atlas alerts M-EXP-2 and a null `toBlob` result M-EXP-3, with no download; the ZIP leaves oversize (or `data:,`) section textures and atlas out, writes `texture_file: null` and no `map_Kd` for them, and alerts M-EXP-4 after the download. Every export runs inside `ProjectIO.#runExport` (08 P2-1a): an export that throws or rejects shows the M-EXP-1 alert `<label> failed: <message>. No file was downloaded.` and warns in the console instead of raising an uncaught exception or an unhandled rejection (legacy's empty-wall combined OBJ/glTF TypeError of `import_edge`, which the validator removed in 08 P2-3b and 08 P2-7d made impossible). Console and dialog behaviour must match the baseline of the parent commit.

---

## 7. Bootstrap sequence (`App.start()`)

Reproduces `init(); setupUI(); setView('reset');` (5093-5095). `main.js` has already run `installCanvasPolyfills()`.

```
// ---- construct (R4: no THREE allocation, no DOM mutation, no listeners; bus subscriptions only) ----
theme = buildTheme(Theme, (name) => win.getComputedStyle(doc.documentElement).getPropertyValue(name),
                   { warn: (m) => win.console.warn(m) });   // 06 T3 (was theme = Theme); bindFonts: BIND_FONTS_DEFAULT (true since 06 T5)
brand = theme.brand; bus = new EventBus(); dialogs = createDialogs(win)
project = Project.createDefault({ defaultSectionColor: theme.palette.defaultSectionColor })   // 06 T7
frameBounds = () => framingBounds(wallController.currentLayout); colorToRgb = (s) => new THREE.Color(s)   // 08 P2-11c
stageLayout = () => wallController.currentLayout                                // 08 P2-11a
interaction = new InteractionState(); keyboard = new KeyboardState({ doc, win })
sceneManager = new SceneManager({ canvas: byId(doc, 'three-canvas'), win, display: project.display, theme })
pointerRay = new PointerRay({ sceneManager })
ledTiles = new LEDPixelTextureFactory({ doc, display, theme }); panelIds = new PanelIdRenderer({ doc, style, logos, theme })
materials = new LEDMaterialFactory({ display, panelIds, ledTiles, win })
debugSettings = new DebugViewSettings(); debugMaterials = new DebugMaterials({ theme })        // 01 F1-1 (no allocation)
wallView = new LEDWallView({ sceneManager, materials, builder: new WallMeshBuilder(Strategies.mesh.viewport), theme, debugMaterials })
normalsView = new NormalsDebugView({ sceneManager, bus, settings: debugSettings, materials: debugMaterials, theme,
                                      elements: { stats: #debug-normals-stats } })   // subscribes WALL_REBUILT before the bootstrap rebuild
debugController = new DebugViewController({ settings: debugSettings, wallView, normalsView, bus })   // emits DEBUG_VIEW_CHANGED (F1-2)
rig = new CameraRigView({ sceneManager, bus, theme }); safeDistance = new SafeDistanceView({ sceneManager, doc, theme })
preview = new PreviewWindow({ doc, cine, elements: { windowEl: #camera-preview-window, canvas: #camera-preview-canvas,
                              resizeHandle: #camera-preview-resize, info: #camera-preview-info, fov: #camera-preview-fov,
                              res: #camera-preview-res } })
previewPass = new PreviewPass({ sceneManager, cine, previewWindow: preview }); sceneManager.setPasses([previewPass])   // 07 R2
personView = new PersonPropView({ sceneManager, theme }); carView = new CarPropView({ sceneManager, theme })
pivotMarker = new PivotMarkerView({ sceneManager, bus, display, theme })     // 03 T5: subscriptions only (allocated last)
headerStats = new HeaderStats({ doc, bus })                                   // subscribed before the bootstrap rebuild
orbit = new OrbitController({ sceneManager, keyboard, interaction, frameBounds })
gizmo = new TransformGizmo({ sceneManager, pointerRay, interaction, bus, theme })
selection = new SelectionManager({ bus, gizmo, pointerRay, interaction })
pilotDriver = new PilotCameraDriver({ sceneManager, cine, rig, interaction })
hub = new CameraHub({ project, rig, preview, safeDistance, pilotDriver, frameBounds, stageLayout, bus })
pilot = new PilotController({ sceneManager, cine, driver: pilotDriver, orbit, keyboard, interaction, hub, bus, dialogs })
cameraController = new CameraController({ project, rig, preview, hub, pilot, selection, frameBounds, bus })
personController = new PropController({ prop: person, view: personView, selection, bus })
carController = new PropController({ prop: car, view: carView, selection, bus })
selection.register(cameraController); selection.register(personController); selection.register(carController)   // pick tie order
wallController = new WallController({ project, view: wallView, ledTiles, orbit, hub, bus, palette: theme.palette, dialogs })
pivotController = new PivotController({ project, wallController, markerView: pivotMarker,          // 03 T5 (5.8)
  stageAnchored: [cameraController, personController, carController], selection, gizmo, interaction, bus })
selection.register(pivotController)       // 03 T5: last in the pick tie order (its priority counts against walls only)
serializer = new ProjectSerializer({ palette: theme.palette })
objExporter = new ObjExporter({ brand, colorToRgb, builder: new WallMeshBuilder(Strategies.mesh.obj) })
gltfExporter = new GltfExporter({ brand, colorToRgb, builder: new WallMeshBuilder(Strategies.mesh.gltf) })
projectIO = new ProjectIO({ project, wallController, serializer, objExporter, gltfExporter, panelIds, safeDistance,
                            downloader: new Downloader({ doc, win }), JSZip, dialogs, brand, win, sectionsFromProject })
sectionList = new SectionListPanel({ doc, project, wallController, bus, palette: theme.palette })   // 06 T7: the swatches
displayPanel = new WallDisplayPanel({ doc, wallController, bus })
pivotPanel = new PivotPanel({ doc, project, pivotController, bus })           // 03 T6: after the display panel (sidebar order)
logosPanel = new SectionLogosPanel({ doc, project, wallController, bus })     // after sectionList and displayPanel (5.2)
cameraPanel = new CameraPanel({ doc, project, cameraController, projectIO, bus, theme })
personControls = new PropControls({ doc, prefix: 'person', controller: personController, prop: person, bus })
carControls = new PropControls({ doc, prefix: 'car', controller: carController, prop: car, bus })
toolbar = new ViewportToolbar({ doc, orbit, sceneManager, gizmo, pilot, bus })
viewportInput = new ViewportInput({ doc, win, sceneManager, interaction, gizmo, selection, pilot,
                                   onPivotShortcut: () => pivotController.toggleSelect() })   // 03 T5: the O key
exportPanel = new ExportPanel({ doc, projectIO })
debugControls = new DebugViewControls({ doc, win, controller: debugController, bus, theme })   // subscribes DEBUG_VIEW_CHANGED
tick = () => { orbit.tickKeyboard(); pilot.tickKeyboard(); sceneManager.renderFrame() }   // 07 R2: the main pass, then the preview pass

// ---- legacy init() (1426-1455) ----
sceneManager.init()                       // 1427-1449: scene, camera, renderer, lights, grid, axes
sceneManager.addPreRender((camera) => pivotMarker.updateScale(camera, sceneManager.canvas.clientHeight))   // 03 T5, 07 C46
wallController.rebuild({ cause: 'init' })   // 1451: P1 (stats via HeaderStats, orbit target; hub skipped); cause since 03 T3
orbit.attach()                            // 1452 setupControls: canvas mousedown, mousemove, mouseup, mouseleave, wheel
keyboard.attach()                         // 1452 setupControls: doc keydown, doc keyup, win blur
sceneManager.attachResize()               // 1453
sceneManager.startLoop(tick)              // 1454: first frame runs synchronously, before setupUI

// ---- legacy setupUI() (4148-4489), statement order ----
sectionList.render(); sectionList.expandFirst(); sectionList.bindAddButton()   // 4149-4154
displayPanel.bind()                       // 4156-4227
pivotPanel.bind()                         // 03 T6: the Wall Pivot panel (radios, offsets, buttons, snap, switches)
cameraPanel.bind()                        // 4230-4329
personControls.bind(); carControls.bind() // 4332-4392
toolbar.bind()                            // 4394-4407
viewportInput.attachShortcuts()           // 4410-4434 (doc keydown, after KeyboardState's)
viewportInput.attachPointer()             // 4437-4479 (canvas listeners after the orbit ones; win mouseup; wheel passive:false)
exportPanel.bind()                        // 4481-4488
debugControls.bind(); debugControls.bindShortcuts()   // 01 F1-2: after every legacy listener (N / Shift+N after the shortcuts)

// ---- legacy setView('reset') (5095) ----
orbit.setView('reset')

// ---- 03 T5 (5.8): the pivot marker is allocated LAST (every legacy THREE id and the r128 draw order unchanged) ----
pivotMarker.init(wallController.pivotResolution)

// ---- 06 T5 (06 5.6): the font gate, fire-and-forget (6.2 row F6-1; it rebuilds at most once, never in the harness) ----
runFontGate({ fonts: doc.fonts, preloadFonts: theme.canvas.preloadFonts, panelIds, wallController,
              onError: (err) => win.console.error(err) })
```
`display`, `style`, `logos`, `cine`, `person`, `car` are `project.display`, `project.panelIdStyle`, `project.logos`, `project.camera`, `project.person`, `project.car`. Listener order on shared targets after bootstrap: canvas `mousedown`/`mousemove`/`mouseup`/`wheel`: orbit then router; canvas `mouseleave`: orbit only; document `keydown`: keyboard state, then shortcuts, then the debug view's N / Shift+N (01 F1-2); document `keyup`: keyboard state; window: `resize` (SceneManager), `blur` (KeyboardState), `mouseup` (router); document `mousemove`/`mouseup`: preview resize, added on the first preview enable. While the debug popover is open (01 F1-2) the document also has a capture-phase `keydown` (Escape only) and a capture-phase `pointerdown` (outside close), and the window a `resize` listener; all three are removed on close.


---

## 8. Legacy compatibility registry

Phase 1 preserves every output-affecting defect. A later fix changes exactly one site (a `Strategies` value plus its new code branch, or one tagged site), deletes or updates the `LEGACY_SITES` entry and re-baselines only the affected harness outputs, in a commit of its own.

### 8.1 `Strategies` switches (`js/legacy/LegacyCompat.js`)

| Key = Phase-1 value | Bug | Preserved behaviour | Read by (exact read; the statement is in the module's section-3 entry) | How read (1.5) | The later fix |
|---|---|---|---|---|---|
| `mesh.viewport.winding = 'ccw'` (08 P2-2a; Phase-1 value `'legacy-cw'`, kept as a case for `LegacyProfiles`) | B-H1 (fixed) | Landed: combined/section strips wound `(bl, br, tr)/(bl, tr, tl)`, counter-clockwise toward the stage (08 6.4); `'legacy-cw'` wound them `(bl, tl, tr)/(bl, tr, br)` (clockwise from +Z) against +Z normals | viewport `WallMeshBuilder` (`LEDWallView`'s builder): `sectionGrid` passes `this.profile.winding` to `quadIndices` | switch in `quadIndices` | landed in 08 P2-2a (invariance gate, empty `expect`: the same diagonal and unlit DoubleSide materials keep coverage and plain colours; the reviewed `mayChange` screenshots are the wireframe line directions, 1-level UV-interpolation rounding on textured walls and one edge-on pixel, 08 6.4); panel mode (`PlaneGeometry`) was already correct |
| `mesh.viewport.side = 'double'` | – (design choice since 08 P2-2a) | DoubleSide: the orbit can go behind the wall (it no longer hides a winding defect, B-H1 is fixed) | `LEDMaterialFactory.#side()`: `Strategies.mesh.viewport.side` | switch | optional `'front'` (Feature 1 F1-5 with its back shell, or Feature 5) |
| `mesh.viewport.normals = 'averaged'` (08 P2-2b; Phase-1 value `'right-panel'`, kept as a case for `LegacyProfiles`) | B-L3 (fixed) | Landed: a curved section's interior vertex normal is the unit bisector of its two adjacent panel normals and its end columns keep their panel normal; a flat section keeps the `'right-panel'` normals verbatim (08 6.4 with 01 CR-1: the test is per section, `sl.isFlat`); `'right-panel'` was the normal of the panel to the right, the last column copying the previous | `WallMeshBuilder.sectionGrid`: `opts.normals ?? this.profile.normals` | switch | landed in 08 P2-2b (invariance gate: the unlit `MeshBasicMaterial` never reads normals) |
| `mesh.viewport.combinedUV = 'plan'` (04 UV-7; 08 P2-7a's `'atlas-pixel-accurate'` stays a supported case, equal to `'plan'` with the atlas layout and identity transforms; Phase-1 value `'atlas-u-full-v'`, kept as a case for `LegacyProfiles`) | B-M5 (fixed) | 04 UV-7: the UVs of `UvMapper.planSectionUvs` (per-section 0..1 by default, or atlas-placed, with the UV transforms). 08 P2-7a landed: combined v = (row/rows) * `uvHeight` (08 6.7), each bottom-aligned section samples its own share of the atlas, so panel IDs and the LED-sim repeat are pixel-accurate; equal heights give `uvHeight` 1 and the legacy v bit for bit; `'atlas-u-full-v'` gave every section v = row/rows over the full atlas height | `WallMeshBuilder.combinedGrid`: `this.profile.combinedUV` | switch | landed in 08 P2-7a; 04 UV-7 later adds the case `'plan'` and selects it (`'atlas-pixel-accurate'` stays a supported case) |
| `mesh.obj.winding = 'ccw'` (08 P2-2c; Phase-1 value `'legacy-cw'`, kept as a case for `LegacyProfiles`) | B-H2 (OBJ half fixed) | Landed: OBJ strip faces wound counter-clockwise toward the stage and panel faces `v, v+1, v+2 / v, v+2, v+3`; `'legacy-cw'` wrote clockwise strips and panel faces `v, v+3, v+2 / v, v+2, v+1` | OBJ `WallMeshBuilder`: `sectionGrid` and `panelQuadIndices` pass `this.profile.winding` to `quadIndices`; `ObjExporter.#faceConventionLine()`: `profile.winding` (the 01 CR-3 header line, written for `'ccw'` only) | switch in `quadIndices`; switch in `#faceConventionLine` | landed in 08 P2-2c |
| `mesh.obj.normals = 'averaged'` (08 P2-2c; Phase-1 value `'none'`, kept as a case for `LegacyProfiles`) | B-H2 (OBJ half fixed) | Landed: the OBJ grids carry the 08 6.4 averaged normals (flat sections bit-equal to `'right-panel'`, 01 CR-1); `'none'` pushed no normals (the writer emitted the constant `vn` instead) | `WallMeshBuilder.sectionGrid` (OBJ builder): `this.profile.normals` | switch | landed in 08 P2-2c |
| `mesh.obj.stripNormals = 'per-vertex'` (08 P2-2c; Phase-1 value `'constant-z'`, kept as a case for `LegacyProfiles`) | B-H2 (OBJ half fixed) | Landed: one `vn` per vertex from the builder normals (`toFixed(6)`) and strip faces `f a/a/a`; `'constant-z'` wrote one `vn 0 0 1` per combined/section object | `ObjExporter.#stripNormalLines(normals, constantIndex)`: `profile.stripNormals` | switch | landed in 08 P2-2c |
| `mesh.obj.panelNormal = 'facing'` | – (consistent since 08 P2-2c) | Panel `vn (sin rotY, 0, cos rotY)`, which agrees with the `'ccw'` panel faces (08 6.4; it contradicted the `'legacy-cw'` faces, B-H2) | `WallMeshBuilder.panelFacingNormal`: `this.profile.panelNormal` | switch | unchanged (08 4.1) |
| `mesh.obj.combinedUV = 'plan'` (04 UV-8a: the `vt` of the export UV plans, per-section 0..1 by default or atlas-placed, with the UV transforms; `'atlas-pixel-accurate'` stays a case; 08 P2-7b; Phase-1 value `'per-section-overlap'`, kept as a case for `LegacyProfiles`) | B-M6 (fixed) | Landed: the combined OBJ `vt` are the viewport's pixel-accurate atlas UVs (`atlasUvRect` of each `computeAtlas` entry, 08 6.7), so they map the combined panel-ID image exactly; single-section walls keep the legacy `vt`; `'per-section-overlap'` wrote 0..1 per section, overlapping | `ObjExporter.write`, combined branch (after the colour): `profile.combinedUV` | switch | landed in 08 P2-7b; 04 UV-8a later adds `'plan'` and selects it |
| `mesh.gltf.winding = 'ccw'` (08 P2-2d; Phase-1 value `'legacy-cw'`, kept as a case for `LegacyProfiles`) | B-H2 (fixed) | Landed: glTF strip indices counter-clockwise toward the stage and panel `[0, 1, 2, 0, 2, 3]`; `'legacy-cw'` wrote clockwise strips and panel `[0, 3, 2, 0, 2, 1]` | glTF `WallMeshBuilder`: `sectionGrid` and `panelQuadIndices` pass `this.profile.winding` to `quadIndices` | switch in `quadIndices` | landed in 08 P2-2d |
| `mesh.gltf.normals = 'averaged'` (08 P2-2d; Phase-1 value `'none'`, kept as a case for `LegacyProfiles`) | B-H2, B-M7 (NORMAL half; fixed) | Landed: the glTF grids carry the 08 6.4 averaged normals, written as `NORMAL`; `'none'` pushed none | `WallMeshBuilder.sectionGrid` (glTF builder): `this.profile.normals` | switch | landed in 08 P2-2d |
| `mesh.gltf.panelNormal = 'facing'` (new leaf in 08 P2-2d; absent from `LegacyProfiles`) | – | The panel `NORMAL`: 4 copies of `(sin rotY, 0, cos rotY)` (`panelNormals`) | `WallMeshBuilder.panelFacingNormal` (glTF builder): `this.profile.panelNormal` | switch | – |
| `mesh.gltf.attributes = ['POSITION', 'NORMAL', 'TEXCOORD_0']` (08 P2-2d added `NORMAL`, 08 P2-7c `TEXCOORD_0`; Phase-1 value `['POSITION']`, kept as a case for `LegacyProfiles`) | B-M7 (fixed) | Landed: every primitive carries `NORMAL` (08 P2-2d) and `TEXCOORD_0` (08 P2-7c, written (u, 1 - v)): combined the atlas UVs of `combinedUV`, section 0..1, panel `PANEL_UVS`; Phase 1 wrote `POSITION` only | `GltfExporter.#attributeList()`, called first by `#addMesh` and by the three writers (whether NORMAL and TEXCOORD_0 are written): `profile.attributes` | array: iterate and switch each element, `'POSITION'` first, no repeats, or throw (1.5, 04 5.5) | landed in 08 P2-7c |
| `mesh.gltf.combinedUV = 'plan'` (04 UV-8b: TEXCOORD_0 of the export UV plans; `'atlas-pixel-accurate'` stays a case; new leaf in 08 P2-7c; absent from `LegacyProfiles`, whose attributes have no `TEXCOORD_0`) | B-M7 | The combined `TEXCOORD_0`: the viewport's pixel-accurate atlas UVs (`atlasUvRect`, 08 6.7) | `GltfExporter.#combinedUvOption()`, only when the attributes list `TEXCOORD_0`: `profile.combinedUV` | switch | 04 UV-8b later adds `'plan'` and selects it |
| `mesh.gltf.indexType = 'auto'` (08 P2-1b; Phase-1 value `'uint16'`, kept as a case for `LegacyProfiles`) | B-L5 (fixed) | Landed: Uint32 (5125) as soon as the largest index reaches 65,535 (`indexWidth`, 08 6.2); `'uint16'` always wrote 5123 and wrapped above 65,535 vertices | `GltfExporter.#addMesh`: `profile.indexType` | switch | landed in 08 P2-1b (invariance gate: every harness glTF is unchanged); the viewport index attribute (untagged) landed in 08 P2-1e |
| `mesh.gltf.doubleSided = 'omit'` | – (correct since 08 P2-2d) | The material object has **no** `doubleSided` key: single-sided, which shows the `'ccw'` wall from the stage and keeps a wrongly facing wall visible as an error (08 Q2) | `GltfExporter.#doubleSided()` (called first by `#addMesh`): `profile.doubleSided` | switch | `case 'true'` (08 P2-2d) writes `doubleSided: true`, for a later export option; no profile uses it |
| `framingBounds = 'layout'` (08 P2-11c; Phase-1 `'flat'` and 03 T2's `'flat-pivot'`, both deleted: the key has one read site) | B-L2, B-M10 (fixed) | Landed: `FramingPolicy`'s three named boxes of the stage layout (07 C34): `generativeBox` for the orbit target, `wallBox` and the chord `facing` for Reset, `stageExtent` for D and the coverage's `fits`; legacy-exact for a flat wall along +X at the identity | `WallLayout.framingBounds`: `Strategies.framingBounds` (memoised per layout; the consumers get it injected as `frameBounds`) | switch | 08 P2-13g moves it to `geometry/FramingPolicy.js` |
| `curveBeforeFirstPanel = true` | B-L1 | Curve step applied before the first panel's move | `WallLayout.computeWallLayout` (first statement): `Strategies.curveBeforeFirstPanel` | switch (`case true`) | owner decision: **kept** (2026-10-16, 1.4); 08 P2-13f retires the switch with no output change |
| `gizmoRotateSign = -1` | B-M12 | Rotation opposite to the drag | `TransformGizmo.onMouseMove`: `Strategies.gizmoRotateSign * angle` | value | `+1` |
| `pilotForwardYSign = -1` | B-M13 | Pilot W/S vertical inverted | `PilotController.tickKeyboard`: `Strategies.pilotForwardYSign * Math.sin(tilt)` | value | `+1` (or `getWorldDirection`) |

"Referenced", for check rule 8: a leaf path `a.b.c` of `Strategies` (arrays are leaves) counts as referenced when the text `Strategies.a.b.c` occurs, outside comments, in a `js/` file other than `LegacyCompat.js`. For a leaf under `mesh.<consumer>.`, the text `profile.<leaf>` also counts, with any receiver (`this.profile.winding`, `this.#profile.stripNormals`, `builder.profile.attributes`). Every row above satisfies this through its "Read by" statement.

### 8.2 Quirk register (every bug id; mirrors `LEGACY_SITES`)

| Bug | Preserved behaviour (behaviour-inventory id) | Single site | Fix lands as |
|---|---|---|---|
| B-H1 | Viewport strip winding vs normals (C-5) | `Strategies.mesh.viewport.winding` (fixed; `side` stays `'double'` as a design choice) | Landed in 08 P2-2a (`mesh.viewport.winding = 'ccw'`; `mesh.viewport.side = 'double'` stays as a design choice; no tag site) |
| B-H2 | Export winding, constant/contradicting normals, no doubleSided (R-5, S-2) | `Strategies.mesh.obj/gltf` (fixed) | Landed in 08 P2-2c (OBJ: `mesh.obj` winding `'ccw'`, normals `'averaged'`, stripNormals `'per-vertex'`) and 08 P2-2d (glTF: `mesh.gltf` winding `'ccw'`, normals `'averaged'`, panelNormal `'facing'`, attributes with `NORMAL`); no tag site |
| B-H3 | glTF RangeError; ZIP dies silently (S-3, U-4) | `GltfExporter`'s default encoder; `ProjectIO` exports (fixed; `Strategies.gltfBase64` retired) | Landed in 08 P2-1a (`chunkedBase64` encoder; `ProjectIO.#runExport` reports every export failure; no tag site) |
| B-H4 | Preview off in pilot: alert, stuck in pilot (O-8) | `PilotController.toggle` guard (fixed) | Landed in 08 P2-4a (`PilotController.toggle` applies the preview guard only when entering pilot mode, so turning the preview off leaves pilot mode cleanly; `CameraRigView.remove` nulls `bodyMesh`; no tag site) |
| B-H5 | Wall textures leak (memory only) | `LEDWallView.rebuild` (`disposeMaps: true`; fixed; the switch `Strategies.dispose.wallTextures` retired by 08 P2-12a) | Landed in Phase 1C H1 (`dispose.wallTextures = true`; the key retired by 08 P2-12a: every wall rebuild disposes the old material maps; no tag site) |
| B-M1 | Safe-distance OBJ throws ReferenceError (K-3) | `ProjectIO.exportSafeDistanceOBJ` (fixed) | Landed in 08 P2-5a (`downloader.saveBlob`; no tag site) |
| B-M2 | Index-based MTL texture path (R-3) | `PanelNaming.mtlTextureFile` (fixed; `Strategies.mtlTextureNaming` retired) | Landed in 08 P2-6d (`PanelNaming.mtlTextureFile(fileName)` is `textures/<fileName>`: the MTL `map_Kd` names the same `textureFileNames` entry as the ZIP texture and the JSON `texture_file`; `Strategies.mtlTextureNaming` retired; no tag site) |
| B-M3 | ZIP JSON lacks angle offsets (U-1) | `ProjectSerializer.write` (fixed; `Strategies.zipJsonIncludesAngleOffset` retired) | Landed in 08 P2-6a (the ZIP JSON is the `'file'` document plus `texture_file` per section, so it keeps `angle_offset_degrees` and re-imports exactly; `Strategies.zipJsonIncludesAngleOffset` retired; no tag site) |
| B-M4 | Unescaped names/colours/values in innerHTML (V-8) | `ui/dom.js escapeHtml` (every template interpolation in `SectionListPanel`, `SectionLogosPanel`; fixed) | Landed in 08 P2-3a (`ui/dom.js escapeHtml` on every template interpolation of `SectionListPanel` and `SectionLogosPanel`, the live rename included; `legacyHtml` deleted; the colour validation is 08 P2-3b's; no tag site) |
| B-M5 | Combined V full height (E-5) | `Strategies.mesh.viewport.combinedUV` + `LEDMaterialFactory.combined` repeat (fixed) | Landed in 08 P2-7a (`mesh.viewport.combinedUV = 'atlas-pixel-accurate'`: v = (row / rows) * `uvHeight`, the section's share of the bottom-aligned atlas from `TextureAtlas.computeAtlas`, so combined panel IDs and the LED-sim repeat are pixel-accurate on sections of different heights; no tag site) |
| B-M6 | Overlapping combined OBJ UVs (R-6) | `Strategies.mesh.obj.combinedUV` (fixed) | Landed in 08 P2-7b (`mesh.obj.combinedUV = 'atlas-pixel-accurate'`: the combined OBJ `vt` are the viewport's pixel-accurate atlas UVs, `atlasUvRect` of each `computeAtlas` entry, so they match the combined panel-ID image; no tag site) |
| B-M7 | glTF POSITION only (S-2) | `Strategies.mesh.gltf.attributes` (fixed) | Landed in 08 P2-7c (`TEXCOORD_0` on every primitive, written (u, 1 - v): combined the pixel-accurate atlas UVs of the new leaf `mesh.gltf.combinedUV = 'atlas-pixel-accurate'`, section 0..1 per section, panel `PANEL_UVS`; `NORMAL` landed in 08 P2-2d; no tag site) |
| B-M8 | Safe-distance group survives preview off (K-2) | `CameraController.setPreviewEnabled` (fixed) | Landed in 08 P2-4b (`CameraController.setPreviewEnabled(false)` calls `hub.syncSafeDistance()` after `rig.remove()`, which removes the floor; the next enable rebuilds it; no tag site) |
| B-M9 | Preview 320x180 stretch (L-1) | `PreviewPass.render` (fixed; `Strategies.previewRendererSize` retired) | Landed in 07 R2 (the second renderer is deleted: the main renderer draws the preview into the main canvas by scissor at the client rect of the placeholder `#camera-preview-canvas`, letterboxed to the filmback aspect with black bars, `PreviewPass` and `PreviewFit.letterboxRect`; no window refit; `Strategies.previewRendererSize` retired; no tag site) |
| B-M10 | Coverage from posZ against a flat rectangle (J-7, J-8) | `FrustumCoverage.analyzeCoverage` (fixed) | Landed in 08 P2-11a (`FrustumCoverage.analyzeCoverage` over the memoised `WallLayout.columnQuads()`: five rays and the projected-quad overlap; `CineCamera.coverage` deleted; status `offWall`) and 08 P2-11c (`fits` reads `FramingPolicy`'s `stageExtent`, the same measure as D); no tag site |
| B-M11 | Preview renders helpers and tint (L-4) | `PreviewWindow.render` (fixed; `Strategies.previewRendersHelpers` retired) | Landed in 08 P2-10a (`PreviewWindow.render(scene, helpers)` sets `visible = false` on every helper registered through `SceneManager.addHelper` for the preview render only and restores each flag afterwards (08 6.14), so the preview shows no grid, axes, rig, frustum tint, safe-distance floor or gizmo; no layer is assigned; `Strategies.previewRendersHelpers` retired; no tag site). Mechanism replaced by 07 R1: the preview camera's layer mask `DEFAULT \| ENVIRONMENT` and `SceneManager.withPassHidden` for the gizmo |
| B-M12 | Rotate gizmo direction inverted (N-9) | `Strategies.gizmoRotateSign` | `+1` |
| B-M13 | Pilot vertical inverted (O-5) | `Strategies.pilotForwardYSign` | `+1` |
| B-M14 | Select on mousedown; misses deselect (N-5) | `ViewportInput.attachPointer` (tag) | select on click under 4 px travel |
| B-M15 | Overlapping/gapped safe-distance quads | `SafeDistanceView.create` + `geometry/SafeDistanceBand.js` (fixed; `Strategies.safeDistanceBand` retired) | Landed in 08 P2-5b (`geometry/SafeDistanceBand.js buildSafeDistanceBand`: a mitred strip over `WallLayout.flatEdges()`, clamped near concave turns and concave curves so it never folds, clamped offset vertices tinted `safeZone.clampedColor` and counted in the OBJ `# Clamped:` line; `Strategies.safeDistanceBand` retired; no tag site) |
| B-M16 | Panel-mode 4-16 px/LED per panel (E-10) | `LEDWallView.#buildPanels` + `TextureAtlas.panelPxPerLed` (fixed) | Landed in 08 P2-12d (panel mode with panel IDs samples one section canvas per section, shared by its panels through section-space UVs; `TextureAtlas.panelPxPerLed` applies the wall-wide `PANEL_TEXTURE_BUDGET_PX` of `geometry/TextureBudget.js` to the per-panel canvases, which only 04's `uv.panel_uvs = 'panel'` option still reaches; no tag site) |
| B-L1 | Curve before the first panel (B-5) | `Strategies.curveBeforeFirstPanel` | owner decision |
| B-L2 | Flat bounds for target/reset/D (H-3, J-1, J-9) | `Strategies.framingBounds` (fixed) | Landed in 08 P2-11c (`framingBounds = 'layout'`: `FramingPolicy`'s `generativeBox` for the orbit target, `wallBox` and the chord `facing` for Reset (`center + 5·facing`, `rotY` through `wrapDeg`), `stageExtent` for D and `fits`; `Wall.flatBounds` deleted; 03 step F; no tag site) |
| B-L3 | Right-panel normals | `Strategies.mesh.viewport.normals` (fixed) | Landed in 08 P2-2b (`mesh.viewport.normals = 'averaged'` with the 01 CR-1 flat-section short-circuit; no tag site) |
| B-L4 | No canvas-size guard (`toBlob` null throws, ZIP `data:,`) | `ProjectIO.exportPanelIds/exportZIP`, `PanelIdRenderer` + `LEDMaterialFactory` (fixed) | Landed in 08 P2-1c (export size guards: `canvasFits`, M-EXP-2/3/4, ZIP pre-check and late skip) and 08 P2-1d (viewport: a null panel-ID canvas falls back to the section colour with a console warning); no tag site |
| B-L5 | Uint16 glTF indices | `Strategies.mesh.gltf.indexType`, `LEDWallView` index attribute (fixed) | Landed in 08 P2-1b (glTF `mesh.gltf.indexType = 'auto'`, `indexWidth`) and 08 P2-1e (viewport: Uint32 index attribute from a largest index of 65,535); no tag site |
| B-L6 | Combined exports use section 0's colour | `ObjExporter` + `GltfExporter` combined writers (fixed; `Strategies.exportCombinedColor` retired) | Landed in 08 P2-7d (one material per section in the combined exports: OBJ `newmtl Wall_<i+1>` with `usemtl` before each section's faces, glTF one primitive per section with its own accessors and `Wall_<i+1>_Material`; `LED_Wall_Combined` stays the object and mesh name; `Strategies.exportCombinedColor` retired; no tag site) |
| B-L7 | MTL second download, textures missing | `ObjExporter.write` + `ProjectIO.exportOBJ` (fixed; `Strategies.mtlDownloadDelayMs` retired) | Landed in 08 P2-6c (the standalone MTL has no `map_Kd`: `ObjExporter.write` references a texture only when the caller ships it (`textureNames`); `Strategies.mtlDownloadDelayMs` retired as `ProjectIO.MTL_DOWNLOAD_DELAY_MS`; the possibly blocked second download was an ARCHITECTURE 8.4 observation until 08 P2-6e, the owner's decision: Export OBJ downloads one ZIP with the OBJ, the MTL and every texture the MTL references; no tag site) |
| B-L8 | No import validation; unknown mode renders as panels; raw coercion | `ProjectSerializer.read` + `io/ProjectValidator.js` (fixed) | Landed in 08 P2-3b (`ProjectSerializer.read`: `detectVersion`, `migrateV1toV2` and `validateProject` of `io/ProjectMigrations.js`, `io/ProjectValidator.js`, `io/ProjectSchema.js`; `Strategies.importValidation` retired; `Wall.MAX_SECTIONS` with M-SEC-1; the size limit and the read error; the three-mode dispatch; `WallSection.setName`; no tag site) |
| B-L9 | `\|\| default` turns 0 into the default (D-7, J-5, V-3) | `orDefault` | change `orDefault` or per rule |
| B-L10 | Gizmo posY >= 0 vs pilot >= 0.1 per frame; Z unclamped | `CineCamera.pilotFly` (tag; the Z half fixed) | validated setter; the Z half landed in 08 P2-11c (no Z minimum in the input rule either, so input, gizmo and pilot agree on Z; `CineCamera.translateBy` untagged); the pilot floor stays for 08 P2-8c |
| B-L11 | Shortcuts ignore SELECT focus, modifiers, repeat (W-1) | `core/typingTarget.js isTypingTarget` + `ViewportInput.attachShortcuts` (fixed) | Landed in 08 P2-9b (`core/typingTarget.js isTypingTarget` with the 07 3.8 truth table, re-exported by `InputState` as `isShortcutIgnoredTarget`; `ViewportInput.attachShortcuts` also ignores Ctrl, Meta, Alt and auto-repeat; no tag site) |
| B-L12 | Gizmo resources leak (memory only) | `TransformGizmo.rebuild/detach` (fixed; the switch `Strategies.dispose.gizmo` retired by 08 P2-12a) | Landed in Phase 1C H2 (`dispose.gizmo = true`; the key retired by 08 P2-12a: the replaced or removed gizmo group is always disposed; no tag site) |
| B-L13 | Mesh-mode handler fires twice (C-4) | `WallDisplayPanel.bind` (tag + warning) | "mode unchanged -> no-op" guard, never radio `change` |
| B-L14 | Colliding ZIP texture names (U-3) | `PanelNaming.textureFileNames` (fixed; `Strategies.zipTextureNaming` retired) | Landed in 08 P2-6b (`PanelNaming.textureFileNames`: the legacy names made unique case-insensitively with `_2`, `_3` suffixes, the one list of the ZIP texture entries and the JSON `texture_file`; `zipTextureFileName` deleted; `Strategies.zipTextureNaming` retired; no tag site) |
| B-L15 | Fractional integer fields (D-8); declared vertex advance | `WallSection.FIELD_RULES` (fixed; the imported half of `WallMeshBuilder.sectionGrid` is B-L8's) | Landed in 08 P2-8a (`WallSection.LIMITS`; the card rules round columns, rows and LEDs and cap panel height, LEDs and curve; `step="1"` and the `max` attributes on the card inputs; no tag site) |
| B-L16 | 4K ⚠ via `/Wall \d+/` (D-10) | `SectionListPanel.#patchCard` (fixed) | Landed in 08 P2-3c (`ui/dom.js setTitleWithWarning`: the live rename and `SectionListPanel#patchCard` rebuild the title from the model; no tag site) |
| B-L17 | 4K check per section only | `WallSection.exceeds4K` (tag) | wall-level check |
| B-L18 | Combined LED sim white (E-4) | `LEDMaterialFactory.combined` + `LEDPixelTextureFactory.tile` cache key (fixed; `Strategies.combinedLedSimColor` retired) | Landed in 08 P2-7e (the combined LED-sim material multiplies a white tile by the per-section vertex colours, `vertexColors: true`; the LED tile cache key is the normalised `getHexString()` of the colour; `Strategies.combinedLedSimColor` retired; no tag site) |
| B-L19 | Panel mode: no logos, fixed label size (F-4, G-4) | `PanelIdRenderer.panelCanvas` (tag; reachable only with `uv.panel_uvs = 'panel'` since 08 P2-12d) | viewport default fixed in 08 P2-12d (panel IDs sample the section canvas); the per-panel canvas is reachable only with `uv.panel_uvs = 'panel'` (04 UV-9, with the panel-mode export UVs) |
| B-L20 | Unbounded LED tile cache | `LEDPixelTextureFactory.tile` (tag) | LRU or one shared tile |
| B-L21 | Import keeps logos; no logo-list re-render (G-8) | `WallController.applyImport` + `SectionLogosPanel` (fixed) | Landed in 08 P2-3d (`WallController.applyImport` resets the logo library (`LogoLibrary.clear`) and installs only the logos it is given; `SectionLogosPanel` re-renders on import with panel IDs on; no tag site) |
| B-L22 | Prop Y arrow and X/Z rings inert (N-7) | `Prop.translateBy/rotateBy` + `TransformGizmo.rebuild` (tags) | `Selectable.allowedAxes()` |
| B-L23 | Local gizmo orientation stale (N-10) | `TransformGizmo.updatePosition` / `SELECTABLE_MOVED` handler (tag) | also re-orient |
| B-L24 | Badge overlaps help badge (the `.view-btn.active` half landed in 01 F1-2) | `css/09-viewport-tools.css` `.selection-indicator` (fixed; CSS is untagged) | Landed in 06 T4a (`.selection-indicator` at `bottom: 64px`, stacked above `.viewport-info`; the `.view-btn.active` half in 01 F1-2; no tag site) |
| B-L25 | View presets work in pilot (W-2) | `OrbitController.setView` (tag) | guard |
| B-L26 | Gizmo visible in pilot | `PilotController.toggle` (tag) | hide/detach |
| B-L27 | Frame-rate-dependent movement (I-3) | `OrbitController.tickKeyboard`, `PilotController.tickKeyboard` (tags) | `dt` from `startLoop` |
| B-L28 | World rings write Euler channels | `CineCamera.rotateBy` (tag) | quaternion composition |
| B-L29 | Safe-distance floor faces -Y | `geometry/SafeDistanceBand.js` + `ObjExporter.writeSafeDistance` (fixed) | Landed in 08 P2-5b (every band triangle wound to face +Y; the safe-distance OBJ writes `vn` and `f a//a` faces; no tag site) |
| B-L30 | Pose changes rebuild frustum + safe distance | `CameraHub.refresh` (tag) | pose-only refresh |
| B-L31 | JSON v1 saves only sections + mesh_mode (Q-3) | `ProjectSerializer.write` (tag) | v2 writer |
| B-L32 | Preview resize clamp blow-out | `PreviewWindow` resize handler (fixed) | Landed in 07 R2 (the resize drag keeps the legacy width clamp and aspect, then clamps each axis on its own to 200-800 x 120-600 with `PreviewFit.clampPreviewSize`; no tag site) |
| B-L33 | Frustum fixed 15 m | `CameraRigView.rebuildFrustum` (fixed; `Strategies.frustumDepthM` retired) | Landed in 08 P2-11b (each far corner of the frustum lines and fill at the camera-space depth `FrustumCoverage.analyzeCoverage` resolves: the corner ray's hit on the wall, else D0, else `MAX_FRUSTUM_DEPTH_M` = 15 m; `Strategies.frustumDepthM` retired; no tag site) |
| B-L34 | Preview header first word; fake resolution (L-3) | `CineCamera.presetShortName` + `PreviewPass.updateCamera` (tags; `PreviewWindow.updateCamera` until 07 R2) | short names |
| B-L35 | Logo load: no error / zero-size guard | `SectionLogosPanel` upload + `PanelIdRenderer` logo drawing (tags) | guards |
| B-L36 | Toggles not keyboard accessible | `index.html` markup (documentation entry; markup is untagged) | markup + `flipToggle` keys |

`tests/static/check.mjs` verifies: per `js/` file, the set of ids in its `LEGACY(...)` tags equals the set of `LEGACY_SITES` ids whose site is in that file (the exact rows are in 8.3; rule 6); every `Strategies` leaf is referenced in the sense defined under 8.1 (rule 8).

### 8.3 Exact LEGACY tag sites (`LEGACY_SITES` entries)

`LEGACY_SITES` contains exactly one entry `{ id, site, behaviour, fix }` per (bug id, site) pair below; `site` is the backticked string in the first column, copied verbatim (a row with two ids gives two entries with the same site). Each work package places a `// LEGACY(<ids>): <behaviour>` comment at every row whose file it owns. One comment may carry several ids (`// LEGACY(B-H1, B-H2): ...`). The static check (rule 6) compares, per `js/` file, the ids of its tags with the ids of the rows whose site starts with that file's path. A tag is a comment containing `LEGACY(` followed by a comma-separated list of ids matching `/B-[HML]\d+/` and `)`; any other mention of a bug id omits the `LEGACY(` prefix (section 1.5). Rows outside `js/` are documentation-only (their entries exist in `LEGACY_SITES`, the check ignores them).

| Site | Ids |
|---|---|
| `js/legacy/LegacyCompat.js#orDefault` | B-L9 |
| `js/domain/WallSection.js#exceeds4K` | B-L17 |
| `js/domain/CineCamera.js#presetShortName` | B-L34 |
| `js/domain/CineCamera.js#rotateBy` | B-L28 |
| `js/domain/CineCamera.js#pilotFly` | B-L10 |
| `js/domain/Prop.js#translateBy` | B-L22 |
| `js/domain/Prop.js#rotateBy` | B-L22 |
| `js/geometry/WallLayout.js#computeWallLayout` | B-L1 |
| `js/io/ProjectSerializer.js#write` | B-L31 |
| `js/render/textures/LEDPixelTextureFactory.js#tile` | B-L20 |
| `js/render/textures/PanelIdRenderer.js#panelCanvas` | B-L19 |
| `js/render/textures/PanelIdRenderer.js#sectionCanvas` | B-L35 |
| `js/render/PreviewPass.js#updateCamera` | B-L34 |
| `js/interaction/OrbitController.js#tickKeyboard` | B-L27 |
| `js/interaction/OrbitController.js#setView` | B-L25 |
| `js/interaction/SelectionManager.js#pickAt` | B-M14 |
| `js/interaction/TransformGizmo.js#rebuild` | B-L22, B-L26 |
| `js/interaction/TransformGizmo.js#updatePosition` | B-L23 |
| `js/interaction/TransformGizmo.js#onMouseMove` | B-M12 |
| `js/interaction/PilotController.js#toggle` | B-L26 |
| `js/interaction/PilotController.js#tickKeyboard` | B-M13, B-L27 |
| `js/interaction/ViewportInput.js#attachPointer` | B-M14 |
| `js/app/WallController.js#setMeshMode` | B-L13 |
| `js/app/CameraController.js#CameraHub.refresh` | B-L30 |
| `js/ui/SectionLogosPanel.js#onUpload` | B-L35 |
| `js/ui/WallDisplayPanel.js#bind` | B-L13 |
| `index.html` (markup, untagged; documentation-only) | B-L36 |

Every bug id from B-H1 to B-H5, B-M1 to B-M16 and B-L1 to B-L36 appears at least once, except a landed fix: its 8.2 row stays (its "Fix lands as" cell starts with `Landed`) and its rows here are deleted together with its tags, so `LEGACY_SITES` no longer lists it (`tests/unit/core.test.mjs` derives the landed ids from 8.2). Landed so far: B-H5 (Phase 1C H1; its only site was a tag in `LEDWallView.rebuild`, which keeps B-L8) and B-L12 (Phase 1C H2; its sites were tags in `TransformGizmo.rebuild`, which keeps B-L22 and B-L26, and `TransformGizmo.detach`, which has no tag left); in Phase 2, B-M1 (08 P2-5a; its sites were `legacyMissingDownloadBlob`, deleted, and the tag in `ProjectIO.exportSafeDistanceOBJ`, which has no tag left) and B-H3 (08 P2-1a; its sites were `legacySpreadBase64`, deleted with `Strategies.gltfBase64`, and tags in `GltfExporter.write`, which keeps B-L6 and B-L8, and `ProjectIO.exportZIP`, which keeps B-L4 and B-L14) and B-L5 (08 P2-1b; its only site was the tag in `GltfExporter.addMesh`, which keeps B-H2 and B-M7) and B-L4 (08 P2-1c; its sites were the tags in `ProjectIO.exportPanelIds`, which has no tag left, and `ProjectIO.exportZIP`, which keeps B-L14; its viewport half never had a tag and is fixed by 08 P2-1d) and B-H1 (08 P2-2a; its sites were the tags in `WallMeshBuilder.quadIndices`, which keeps B-H2 until 08 P2-2d, and `LEDMaterialFactory.side`, whose `'double'` value is now a design choice) and B-L3 (08 P2-2b; its only site was the tag in `WallMeshBuilder.sectionGrid`, which keeps B-L15 and B-L8) and B-H2 (08 P2-2c and P2-2d; its sites were the tags in `ObjExporter.write`'s `#stripNormalLine`, which left with P2-2c (`write` keeps B-M6, B-L6 and B-L8), `WallMeshBuilder.quadIndices`, which has no tag left, and `GltfExporter.addMesh`, which keeps B-M7) and B-L11 (08 P2-9b; its sites were the tags in `InputState.isShortcutIgnoredTarget`, now a re-export of `core/typingTarget.js isTypingTarget`, and `ViewportInput.attachShortcuts`, which has no tag left) and B-L15 (08 P2-8a; its sites were the tags in `WallSection.FIELD_RULES`, which has no tag left, and `WallMeshBuilder.sectionGrid`, which keeps B-L8 for unvalidated imported counts) and B-M4 (08 P2-3a; its sites were `legacyHtml`, deleted, and the tags in `SectionListPanel.render`, which has no tag left, `SectionLogosPanel.render` and `ProjectSerializer.read`, which kept B-L8 until 08 P2-3b) and B-H4 (08 P2-4a; its sites were the tags in `PilotController.toggle`, which keeps B-L26, and `CameraController.setPreviewEnabled`, which kept B-M8 until 08 P2-4b) and B-M8 (08 P2-4b; its only site was the tag in `CameraController.setPreviewEnabled`, which has no tag left) and B-M15 and B-L29 (08 P2-5b; their sites were `Strategies.safeDistanceBand`, retired, and the tags in `SafeDistanceView.create` (both ids) and `WallLayout.flatEdges` (B-M15), which have no tag left) and B-M3 (08 P2-6a; its sites were `Strategies.zipJsonIncludesAngleOffset`, retired, and the tag in `ProjectSerializer.write`, which keeps B-L31) and B-L14 (08 P2-6b; its sites were `Strategies.zipTextureNaming` and `PanelNaming.zipTextureFileName`, both deleted, and the tag in `ProjectIO.exportZIP`, which has no tag left) and B-L7 (08 P2-6c; its sites were `Strategies.mtlDownloadDelayMs`, retired, and the tag in `ProjectIO.exportOBJ`, which has no tag left; the residual second download was an 8.4 observation until 08 P2-6e made Export OBJ one ZIP) and B-M2 (08 P2-6d; its sites were `Strategies.mtlTextureNaming`, retired, and the tag in `PanelNaming.mtlTextureFile`, which has no tag left) and B-M11 (08 P2-10a; its sites were `Strategies.previewRendersHelpers`, retired, and the tags in `SceneManager.addHelper` and `PreviewWindow.render`, which have no tag left) and B-L18 (08 P2-7e; its sites were `Strategies.combinedLedSimColor`, retired, and the tags in `LEDMaterialFactory.combined`, which has no tag left, and `LEDPixelTextureFactory.tile`, which keeps B-L20) and B-L6 (08 P2-7d; its sites were `Strategies.exportCombinedColor`, retired, and the tags in `ObjExporter.write` and `GltfExporter.write` (their combined writers), which have no tag left) and B-M7 (08 P2-7c; its only site was the tag in `GltfExporter.addMesh`, which has no tag left) and B-M6 (08 P2-7b; its only site was the tag in `ObjExporter.write`'s `#writeCombined`, which keeps B-L6) and B-M5 (08 P2-7a; its sites were the tags in `WallMeshBuilder.combinedGrid`, which has no tag left, and `LEDMaterialFactory.combined`, which keeps B-L18) and B-M16 (08 P2-12d; its sites were the tags in `TextureAtlas.panelPxPerLed`, which has no tag left, and `PanelIdRenderer.panelCanvas`, which keeps B-L19, reachable only with 04's `uv.panel_uvs = 'panel'`) and B-L21 (08 P2-3d; its sites were the tags in `WallController.applyImport` and `SectionLogosPanel`'s constructor, which have no tag left) and B-L16 (08 P2-3c; its only site was the tag in `SectionListPanel.patchCard`, now `setTitleWithWarning`) and B-L8 (08 P2-3b; its sites were `Strategies.importValidation`, retired, and the tags in `WallSection`'s constructor, `Wall.appendLikeLast` and `replaceAll`, `LogoLibrary.get`, `WallMeshBuilder.sectionGrid`, `ProjectSerializer.read`, `LEDWallView.rebuild` and `SectionLogosPanel.render`, which have no tag left, and `ObjExporter.write` and `GltfExporter.write`, which keep B-M6 / B-L6); in Phase 3, B-L24 (its `.view-btn.active` half in 01 F1-2, `css/features/debug-view.css`; its badge-overlap half in 06 T4a, `.selection-indicator` at `bottom: 64px` in `css/09-viewport-tools.css`; its two documentation-only entries, the `Legacy note B-L24` paragraphs of the `css/07-viewport.css` and `css/09-viewport-tools.css` header comments, left with 06 T4a, whose header comments now say where it landed), and B-M9 and B-L32 (07 R2, which took over 08 P2-10b, 07 C31; their sites were `Strategies.previewRendererSize`, retired, and the tags in `PreviewWindow.init` and `PreviewWindow.setupResize`, which have no tag left; B-L34's `PreviewWindow.updateCamera` tag moved with the code to `PreviewPass.updateCamera`).

How rule 6 reads these rows (as implemented in `tests/static/check.mjs`): the comparison is per file, so a tag may sit in a private helper that only the named method calls (for example `ProjectSerializer.#readV1` for `#read`, `ObjExporter.#writeCombined` for `#write`, `GltfExporter.#writeCombined` for `#write`); a tag wrapped across JSDoc continuation lines counts as one tag (placeholders are still rejected); and a row whose `js/` file does not exist is reported, so a typo in a site path cannot bypass the check.

### 8.4 Observations without a bug id (documentation only)

The verified defect list (`docs/DEFECTS.md`, last section) also records observations that were not classified as defects. Some of them affect output; verbatim porting preserves all of them. They have no B-id, so they are **not** `LEGACY_SITES` entries and carry no `LEGACY(` tag (rule 6 is unaffected). The table names the one place that a later change would edit; any such change re-baselines the affected harness outputs like a bug fix.

| Observation | Affects | Single place after Phase 1 |
|---|---|---|
| In pilot mode the main camera keeps the viewport aspect, so its horizontal FOV differs from the preview and the frustum | pilot screenshots | `PilotCameraDriver.enterView` (sets only `fov`) |
| Font-gate limitations (06 T5 loads JetBrains Mono 700 and redraws the panel IDs once when the web fonts settle, 6.2 row F6-1): text drawn after the gate has settled (for example a section renamed to a name in a font subset not yet cached) uses the fallback font until the next rebuild, which `PanelIdRenderer` prepares by requesting that subset on the first draw; the safe-distance label sprite is not redrawn by the gate, only on the next camera change | panel-ID textures, PNG/ZIP exports drawn before the font arrives; the safe-distance label | `app/fontGate.js` + `PanelIdRenderer.takePendingFonts` |
| The frustum geometry is built twice on the first enable (duplicate lens readout) | DOM write count only | `CameraHub.refresh` + `CameraRigView.create` |
| Delivery timing (new with ES modules, not a legacy defect): the inline script was parser-blocking and created the renderer before the first paint; the module graph loads asynchronously, so the browser can paint the static markup (empty stats, no cards) before `App.start()` runs. The final DOM, canvas and every output are unchanged; the overlay badge text composited over the canvas can differ by 1 level in a few glyph pixels (accepted jitter, section 10) | first frames only; overlay glyph pixels in screenshots | `index.html` script tag (`blocking="render"` or a head placement would be a delivery change) |

---

## 9. Feature seams

| Feature | What exists after Phase 1 | What the feature adds |
|---|---|---|
| **1. Normals flipped by default + normals debug view** | One winding function (`quadIndices`) and per-consumer profiles in `Strategies.mesh` used by the viewport, OBJ and glTF; `side` in the viewport profile; `LEDWallView.meshes()`; `WALL_REBUILT`; `SceneManager.addHelper` + `LAYERS`; `ResourceTracker`; the toolbar button pattern. | The flips are Phase-2 commits 08 P2-2a–d, one consumer per commit (`docs/improvements/08-bugfix-roadmap.md`): `'ccw'` winding and `'averaged'` normals in `WallMeshBuilder`, OBJ per-vertex `vn` and the glTF `NORMAL` attribute. Feature 1 adds the debug view and options only: `render/NormalsDebugView.js` (LineSegments from attributes x `matrixWorld`, subscribes to `WALL_REBUILT`, registered as a helper, disposed with a tracker); a `#toggle-normals` view button and a `.view-btn.active` rule (B-L24). Landed so far (docs/improvements/01-normals.md 8.4): F1-0a, F1-0b and F1-0c (tooling), F1-1 (the debug core without UI: `NormalLines`, `NormalsDebugView`, `DebugMaterials`, `MaterialOverride`, `LEDWallView.setDebugShading` / `withContentMaterials`, `DebugViewSettings`, `DebugViewController`, `core/renderOrder.js`), F1-2 (the debug UI: `#toggle-normals`, `#debug-view-btn` and its popover, the legend in `#viewport-top-stack`, the announcer, N / Shift+N, `DEBUG_VIEW_CHANGED`, `css/features/debug-view.css` with `.view-btn.active`, the help-badge token ` N=normals`), F1-3 (the `normals_debug` harness scenario), F1-2b and F1-2c (review follow-ups of F1-2: legend legibility, the `DebugViewControls` import-boundary test). |
| **2. Section selection, property editing, per-section offsets** | `WallSection` with stable ids; `SectionLayout.postTransform` hook (null, never fed back into the cursor); mesh tags `userData.{kind, mode, sectionId, sectionIndex, col, row}` and combined `sectionRanges`; `LEDWallView.sectionNodes()`; the `Selectable` registry and generic gizmo; field rule tables; `WallController` as the single writer of section state; mirror events to cards; `ProjectSerializer.read` version-dispatch point. | `WallSection.offset {position, rotation}` + rules; `layoutProject` builds per-section `postTransforms`; the builder applies them to positions/normals; `LEDWallView` adds per-section groups (section/panel) or bakes (combined) and a transform-only update path; `WallSectionSelectable` (pick by `userData` / `faceIndex` -> `sectionRanges`); select-on-click (B-M14 fix); a `section:changed` event emitted by `WallController` so cards, an inspector and the UV viewer update reactively; safe distance per floor run: `floorRuns()`, each run through 08 P2-5b's `buildSafeDistanceBand` (02 6.12, CR-08-a); schema v2. Exporters follow automatically through the layout. |
| **3. Configurable pivot + offset** | `WallPivot`/`PivotMode` in `Wall` (identity); `WallLayout.firstEdge/lastEdge/bounds()/pivotPoint(mode)` including "middle of entire wall" = midpoint of the first section's first edge and the last section's last edge on the floor; the single `framingBounds` switch for the four flat-bounds consumers; the single `layoutProject()` entry. | A baked translation in `layoutProject`: stage frame `−(P.x, 0, P.z)`, export frame `−P`, P = anchor + offset (1.4). The raw walk is translated first, and spec 02's `applySectionOffsets(out)` builds its section matrices from the translated layout (07 C32). **No wall root transform, ever:** the identity `wallGroup` transform is a unit-tested invariant (03 §5.1, §5.9 #2). `ui/PivotPanel`; a pivot Selectable + marker view; switch `framingBounds` to pivot/bounds (fixes B-L2); optional re-expression of camera/prop poses; schema v2. Landed so far (docs/improvements/03-pivot.md 10; session-only, the owner's decision of 2026-10-17): T13 (the sign-off of 5.10.1), T1 (the domain: the `WallPivot` API, the pose `LIMITS` and `translateStage`, the `posZ` context, `SceneTheme.pivot`), T2 (the geometry: `baseY`, `generativeBounds`, `translated`, `resolvePivot`, `stageShift`, the frames of `layoutProject`, `framingBounds` `'flat-pivot'`), T3 (the consumers: the orbit target, Reset and coverage on the `'flat-pivot'` bounds, the `posZ` context, `WallController`'s pivot cache, `rebuild({cause})`, `commitPivot` and the import reset, the export frame with the OBJ header lines and glTF `extras`, the safe-distance OBJ `translate`, both `translateStage` participants), T4 (`app/PivotController`: P-PIVOT, rows F3-1 to F3-5, the Selectable 'pivot', `WALL_PIVOT_CHANGED`), T5 (`render/PivotMarkerView` and the shared path-B gizmo hook set: kind, pick priority, `allowedAxes`, `beginGizmoDrag` / `endGizmoDrag({cancel})` / `cancelDrag`, gesture swallowing, the O key, the re-anchor), T6 (`ui/PivotPanel`, `css/features/pivot.css`, "Z Position", "Distance to wall plane", static rules 18-20), T9 (the marker shown by default, hidden in pilot), T10 (the grid centred on the stage origin), T8 (the harness library changes and the five `pivot_*` scenarios) and T12 (the README "Pivot" section); the owner change of 2026-10-17 (B1-pivot-floor: `mesh-center` is the bounding-box centre on the floor). Waiting: T7, schema v2 (and the v2 half of T9), with project file v2 at M7a; step F is 08's P2-11c (landed on 2026-10-17). **Orientation** (03 §12, the owner's request of 2026-10-17; it supersedes T14): `WallPivot.orientation` (Centre on −X / None, a yaw offset) and the yaw ψ baked into the stage and export frames by `layoutProject` after the translation (`WallLayout.rotated`, `geometry/WallOrientation.js`); the rigid re-expression of the stage-anchored poses; Reset and the view presets facing the LED; the orientation export metadata; the panel's Orientation block. Planned in F3-O0, landing in F3-O1 to F3-O7 (03 12.13), with `'none'` the default until the next unit. |
| **4. Clean 0..1 UVs + UV viewer/editor** | UV strategies in one builder function per consumer; `TextureAtlas` as the single source of offsets, widths and start columns (yields per-section `uvRects`); `PanelIdRenderer.sectionCanvas()` for the viewer background; mesh tags; the selection registry; `PreviewWindow`'s resize handle as the floating-panel pattern. | `'per-section'` / `'atlas-pixel-accurate'` strategies (fix B-M5/B-M6) and a baked per-section `uvTransform`; glTF TEXCOORD_0. The `'atlas-pixel-accurate'` strategies (the viewport one landed in 08 P2-7a, the OBJ one in 08 P2-7b, the new `mesh.gltf.combinedUV` leaf with glTF `TEXCOORD_0` in 08 P2-7c) and the per-section combined materials and glTF primitives (08 P2-7d), the combined vertex ranges and `sectionRangeForFace` (08 P2-7a) are Phase 2's; Feature 4 adds `'plan'`; the viewport panel-ID path of panel mode (one section canvas per section, `WallMeshBuilder.panelUvs`, `LEDMaterialFactory.sectionShared`, `geometry/TextureBudget.js`) is 08 P2-12d, and 04 UV-9 adds the panel-mode export UVs and the `uv.panel_uvs` option; `ui/UVViewer.js` and `ui/UVCanvas.js` (2D canvas). Amended by 04 UV-11/UV-16: the viewer does not subscribe `SELECTION_CHANGED` and `WALL_REBUILT` (under R3 a ui subscriber can neither compute UVs nor call a controller); `UvController` is a `SelectionManager` observer (`addObserver`) and a `WallController` rebuild observer (`addRebuildObserver`), and `UvViewModel` feeds the viewer through `UV_DATA_CHANGED`. `ui/FloatingPanel.js` is new (migrating `PreviewWindow`'s chrome onto it is left to spec 05 or 07 R2). |
| **5. HDRI projection (+ reflective car)** | `DisplaySettings.content` enum (`'color' \| 'ledSim' \| 'panelIds'`, ready for `'hdri'`); `LEDMaterialFactory` as the only wall-material constructor; `ResourceTracker` for HDR/PMREM disposal; `SceneManager` owns the main renderer and the helper registry; the second renderer was encapsulated in `PreviewWindow` until 07 R2 replaced it by `PreviewPass` (one renderer); `PropView` base with `buildMesh()`; `CineCamera` lens math for the default projection point. | `ContentMode.HDRI` + `render/HdriProjectionMaterial.js` (wall and dome); `ui/HdriPanel.js` + the projection-point Selectable (`'hdri-point'`, kind `'projector'`, 07 C36); the second renderer is replaced by spec 07's `PreviewPass` (scissor rendering, R1/R2; `SceneManager` keeps only `setEnvironment` and `setPunctualLightScale`), which excludes `LAYERS.HELPERS` (B-M9/B-M11, first fixed by 08 P2-10 or 07 R1/R2, 07 C31); the backdrop dome on `LAYERS.ENVIRONMENT`; `GltfCarPropView extends CarPropView`; colour management in `render/ColorManagement.js` as per-material patches (Option L on r128; Option G after 07 U3b); loaders from 07's `vendor/three-addons.js` factories (spec 05 §5.11 #17). |
| **6. Morph branding** | `css/02-tokens.css` holds every `:root` token; `Theme.js` holds every scene/canvas colour, font, palette and export string, and every consumer receives it by injection from `App`; header and watermark markup in one place in `index.html`. | Role-based tokens; `theme/ThemeBridge.js` reading CSS variables into an object of `Theme`'s shape (one line in `App`); new `Brand` strings and filenames (+ a JSON `generator` field in v2); Morph logo SVG, favicon, valid author meta; inline styles -> classes; card swatches from `Palette`; re-baseline `ui_visual` and exports separately. Gizmo axis colours stay XYZ = RGB. Landed so far (docs/improvements/06-morph-branding.md 8.4): T1 (the static inline styles of `index.html` and the two panel templates became the classes of `css/99-utilities.css`, linked last; dead CSS removed; `css-slices.mjs --report-only`; static rule 12; `compare.mjs --ignore-keys`), T2 (`theme/ThemeBridge.js`, pure and not wired, with U1-U3), T3 (layer-4 tokens with the legacy values and spec 01's four debug tokens, ThemeBridge wired in `App`, `.status-*` on `--status-*`, U4/U10/U11), T4a (the ungated Morph chrome: token layers 1-3 with the brand values and every stylesheet on role tokens, static rules 13-15; the text-only `<h1>` header in the three-column grid; the third-party logo deleted; the head metas and Montserrat; the component states of 06 3.5, including the opaque selection badge at `bottom: 64px`, B-L24; U5 in `contrast.test.mjs`, U6), T4b (the owner-approved brand artwork: the six app files in `assets/brand/` with `NOTICE.md`, the favicons, the apple-touch icon and `og:image`, the wordmark lockup with the monogram at <= 520 px, the viewport watermark hidden in pilot mode, static rule 16), T4c (British English in the visible labels and tooltips: "Colour", "Centre", and "Panel Angle (°)" for the one label that wrapped), T5 (the Morph scene and canvas: layer-4 brand values with `--scene-frame-on-light` and `--scene-overlay-halo`, adaptive panel frames, the outlined opaque camera body, the two-tone dashed frustum, JetBrains Mono 700 and Montserrat on the canvases with `BIND_FONTS_DEFAULT` true, the font gate of row F6-1), T6a (the Morph export headers and generator strings, `Brand.jsonGenerator`, `shortName`, `company`, `homepage`; the oracle tests keep the Phase-1 strings through `LEGACY_BRAND`), T6b (every download name derived from `Brand.filePrefix = 'morph-led-wall'`, `Brand.files.hdriPixelMap`, `compare.mjs --rename`, static rule 17), T7 (the 8-colour Morph palette with Studio Grey `#d9d9d6` as the injected default, the card swatches from the palette, the v1 colour fill from `Palette.legacySectionColors`, U5 scene rows, U7, U8), T9 (the README with the Morph lockups via `<picture>`, the product name, the brand badge colours and the Brand and licence section; the two README lockups complete the 8 files of 06 5.8). |

---

## 10. Verification contracts

| Gate | Command | Passes when |
|---|---|---|
| Unit (pure layers) | `node --test "tests/unit/**/*.test.mjs"` (quoted glob; Node 22.7+: Node 21+ treats `--test` arguments as globs, so the directory form `node --test tests/unit/` fails with "Cannot find module", and the typeless `js/*.js` modules (there is no package.json) load as ESM only through module-syntax detection, unflagged since Node 22.7; the glob does not match the `oracle/*.mjs` helpers) | all green. Required per module: rule tables equal the legacy expressions over a seeded grid (0, '', NaN, negatives, fractions, numeric strings); `computeWallLayout`, `WallMeshBuilder`, `TextureAtlas`, `PanelNaming` equal the verbatim oracle with `Object.is` on every number over fuzzed sections (string fields, fractional cols, NaN/duplicate ids, empty walls); `ObjExporter`, `GltfExporter`, `ProjectSerializer` produce **byte-identical** text/JSON to the oracle (the oracle comparisons inject `LegacyProfiles.mesh.*`, the exact Phase-1 profiles, from 08 P2-0 on) and to the golden harness files of `default` and the 6 config scenarios in all 3 modes (when `GOLDEN_DIR` exists); `CameraHub`/`CameraController` step order with spies; `WallController` rebuild counts for every row of 6.2. Two Node-vs-Chrome facts the byte comparisons handle: (1) the goldens were captured in Chrome, whose `Math.atan2` is correctly rounded, while Node 24's V8 still uses fdlibm's `atan2` (last-ulp differences for about 20% of arguments), so any Node-side byte comparison of full-precision `atan2`-derived values against a Chrome golden (the panel-mode glTF accessor min/max of curved walls) installs a correctly rounded `atan2` for the duration of the test; (2) the NaN bit pattern written into a `Float32Array` is implementation-defined (B-L8 garbage imports give NaN positions), so the oracle fuzz canonicalises NaN inside float32 POSITION views on both sides before comparing; the goldens contain no NaN and are compared raw. |
| Static | `node tests/static/check.mjs`, `node tests/static/css-slices.mjs --report-only` (since 06 T1; 07 S7) | layering table; DOM-id ownership; no `window`/`document` globals outside `vendor/`, `ui/dom.js`, `App.js`, `main.js` (injected `doc`/`win` everywhere else); import specifiers relative, `.js`, case-exact; no module-level `let`/`var`; LEGACY parity (8.3); every `Strategies` leaf referenced (8.1); every `Events` key emitted and (except `WALL_REBUILT`) subscribed; domain fields written only by the writers of section 4; no numeric `renderOrder` literal >= 900 outside `core/renderOrder.js` (rule 11, 01 F1-1; every spec, 07 S10); the inline `style=""` attributes of `index.html` declare only `display`, `width` and `height`, with no `var(--...)` and no colour literal (rule 12, 06 R-B2, since 06 T1); no colour literal in a declaration value of any stylesheet but `css/02-tokens.css` (rule 13, 06 R-B1, since 06 T4a); no legacy token name, third-party logo or legacy cyan in `index.html`, `css/` or `js/` (rule 14, 06 R-B3a, since 06 T4a); exactly one `export-btn--primary` element and one `var(--cta-background)` declaration (rule 15, 06 R-B5, since 06 T4a); every `assets/brand/` reference case-exact and every brand file but `NOTICE.md` referenced (rule 16, 06 R-B4, since 06 T4b); no legacy product or file name (`Outfit`, `LED Wall Configurator`, `led-wall-config`, `led-wall-export`, the whole tokens `panel-ids.png`, `PanelIDs_Atlas.png`, `safe-distance-floor.obj`) in `index.html`, `css/` or `js/` (rule 17, 06 R-B3b, since 06 T6b); the pivot markup keeps its own classes (no `pivot-*` with a `mesh-mode-*` class, no `data-mode` on a pivot element), no inline style in `#pivot-section` or on the distance row, and the help badge keeps its frozen text (rule 18, 03 8.2, since 03 T6); the pivot radios are never `display: none` (rule 19, since 03 T6); `isDraggingGizmo`, `gestureCancelled` and `snap` are written only by `TransformGizmo` (rule 20, since 03 T6); CSS slices: the differences of `css/01-*.css` .. `css/12-*.css` from lines 12-869 are reported, not failed, since 06 T1 changed the slices on purpose (`--report-only`, 07 S7; feature stylesheets in `css/features/` and `css/99-utilities.css` are never scanned). Interpretation (as implemented): a `window`/`document` token in a pure-layer file is reported under both the globals rule and the purity rule; the domain-writer rule treats every assignment operator as a write (`=`, all compound and logical assignments, `++`, `--`). |
| Golden master | `node tests/regression/run.mjs --root . --out <cand>` (always a full run) then `node tests/regression/compare.mjs <baseline> <cand> --expect tests/regression/expected/<commit-id>.json` (Phase 2 onwards; Phase 1 compared without `--expect`) | exit 0. **Phase 2 onwards (08 P2-0; every spec, every golden-changing commit): the baseline of a commit is the harness output of its parent commit (08 8.1); every golden-changing commit carries an expected-change manifest `tests/regression/expected/<commit-id>.json`, in which every difference must be declared and every declared change must happen (a within-tolerance PASS never satisfies an entry; an invariance commit has an empty `expect` list); `tests/regression/expected/_nondeterminism.json` is the only standing allowance (the overlay-glyph jitter described below, reported as `JITTER` within at most 1 level and 8 pixels on the listed screenshots); `run.mjs --only` is for local iteration and never produces a promoted baseline; export commits also run `tools/check-orientation.mjs` and `tools/check-gltf.mjs` on the candidate outputs; a step whose screenshots may change only in known regions (01 F1-2, 06 T4b, 07 I4a) declares measured `rects` and `size` on its `--expect` entries (01 T2: every differing pixel inside them, except the allowlisted jitter of that screenshot outside them (F1-0c), and the capture of that size, or FAIL) and is reviewed with `--diff-bbox`. The procedure is documented in `tests/regression/README.md` ("Phase 2 re-baselining").** Phase 1: the baseline is captured from the pristine `index.html@cd3fd3f` (twice, self-consistent), including the extra scenarios of `tests/regression/scenarios-extra.mjs`. The only accepted WARNs are the 1-level overlay-glyph jitters documented in `tests/regression/README.md` ("Known nondeterminism"): a maximum channel difference of 1 in a few pixels that all lie on glyphs of DOM text composited over a WebGL canvas (the help badge, the pilot banner, the camera preview window's header and footer labels). Each such pixel is bistable: it flips between the same two values, in both directions, between captures. The original shows it too (between its two baseline captures, and in the `keyboard` screenshots WP1 first documented). With ES-module delivery the page can paint before `App.start()` runs (8.4), and the flips occur more often; they occur equally with the verbatim legacy script loaded as a module (integration step I-1). A same-browser A/B run showed identical overlay-free canvas pixels and an identical draw list (object, material and geometry ids, and draw order) for the original and the candidate. Any other WARN, a difference above 1 level, or a pixel outside those overlays is investigated and never accepted by re-capturing the baseline. |
| Continuous integration (07 G1) | `.github/workflows/ci.yml` on every push to `refactor/**` and `feature/**`, on every pull request, and as the reusable check of the later deploy workflow | the Static gate (`check.mjs`, `css-slices.mjs --report-only` since 06 T1) and the Unit gate pass on Node 22 with no `npm install`; the golden-file unit tests skip there (no `GOLDEN_DIR`), so the golden master stays a local gate (08 8.1) until 07 G4 runs it in CI |
| Manual (not automatable) | side by side with the original | WASD/QE orbit and pilot fly incl. the inverted vertical (B-M13); hover highlight; window resize; a GitHub Pages smoke test (case-sensitive paths, sub-path URLs). |

---

## 11. Implementer checklist (re-check before every merge)

1. Every arithmetic expression, string template and object literal copied verbatim (R1)? No re-association, coercion, merged templates or large spreads?
2. THREE objects created and added in the legacy order; nothing allocated in constructors; no new parents, renderables or layers (R4-R6)?
3. Every ordered step a direct call; every event a pure mirror emitted at the legacy DOM-write point (R2, R3)?
4. Domain values uncoerced; id-keyed maps with plain-object key semantics (R12)?
5. Every quirk you touched is a `Strategies` key read at its 8.1 site (switch-and-throw, value or array comparison per 1.5) or a registered `LEGACY(B-xx)` tag (R7)? Every other bug mention written without the `LEGACY(` prefix?
6. Markup and templates byte-identical (R8, Phase 1; since 06 T1 except the declared edits: the 99-utilities classes of `index.html`, 06 T4c's British copy, 08 P2-8a's card input attributes and rules, and the `TEMPLATE_EDITS` of `wall-controller.test.mjs`, which the legacy-parity tests apply to the legacy source); listeners attached in the legacy phase and order (R11)?
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

**01 F1-0a, orientation tooling (01 T1)** (manifest `tests/regression/expected/F1-0a.json`, an invariance gate: empty `expect`; no application or harness file changes):
- 2.3: `tools/check-orientation.mjs` checks the `.obj` and `.gltf` entries of ZIP archives and walks directories recursively (`--failures-only` prints only the failures); `tests/unit/export-orientation.test.mjs` (the orientation oracle of 01 AC 1 over `GOLDEN_DIR` and 500 seeded integer walls; the golden objects that still fail for open 08 defects, B-L29, B-L8 and B-L15, are listed with their fixing commit and must keep failing until that commit deletes the row); `tools/make-cap-wall.mjs` and `tests/fixtures/normals-max-wall.json` (01 8.3).

**01 F1-0b, rect allowances and the palette hook (01 T2; the second commit of the harness-only series, 07 C57)** (manifest `tests/regression/expected/F1-0b.json`, an invariance gate: empty `expect`; no application change, no capture changes):
- 2.3: `compare.mjs` manifest entries gain `exclude` and the rect allowances `rects` + `size` (a difference is accepted only when every differing pixel lies inside the rectangles and the image has the entry's frame size; otherwise FAIL), and `--diff-bbox`; `tests/regression/measure-rects.mjs` writes the measured rectangles of the entries that carry a `measure` object; `tests/regression/lib/palette.mjs` (`livePalette`, 07 C53); `tests/unit/harness-lib.test.mjs`; the rect section of `compare.test.mjs`.
- 10: rect-limited re-baselines (01 F1-2, 06 T4b, 07 I4a) declare measured `rects` on their `--expect` entries.

**01 F1-0c, the rect rule tolerates the allowlisted jitter (review follow-up of F1-0b)** (manifest `tests/regression/expected/F1-0c.json`, an invariance gate: empty `expect`; only `compare.mjs`, its tests and the docs change):
- 2.3, 10: a rect entry accepts pixels outside its rectangles only as the standing jitter: on a screenshot listed in `_nondeterminism.json`, outside pixels within that entry's bounds (<= `maxLevel`, <= `maxPixels`); anything else outside stays a FAIL. Without it, a rect-limited re-baseline that changes the badge of `camera/08_camera_moved` or `13_safe_distance` would fail whenever their preview-header glyphs flip.

**01 F1-1, the normals debug core without UI (01 T3-T6)** (manifest `tests/regression/expected/F1-1.json`, an invariance gate: empty `expect`; nothing is allocated, rendered or listened to until a debug option is switched on, and F1-1 adds no switch):
- 1.3, 2.2, 3.2: `core/renderOrder.js` (`RENDER_ORDER`, 01 5.5, CR-10), used by `TransformGizmo` (`RENDER_ORDER.GIZMO` = the legacy 999; 3.8); 10, 2.3: static rule 11 (no `renderOrder` literal >= 900 elsewhere) and rule 10's writers of `DebugViewSettings`.
- 3.4: `SceneTheme.debug` (01 4.6). 3.5: `DebugViewSettings`. 3.6: `NormalLines`.
- 3.7: `SceneManager.init` enables `LAYERS.HELPERS` on the main camera (only the normal lines use it); `LEDWallView` gains `debugMaterials`, rebuild steps 0 (restore) and 6 (re-apply), `setDebugShading` and `withContentMaterials` (07 C48); new `MaterialOverride`, `DebugMaterials`, `NormalsDebugView` (the first `WALL_REBUILT` subscriber, 5.2).
- 3.10, 7: `DebugViewController` (no bus and no event until F1-2) and its construction in `App`; 4: the debug-view state rows. No `Events` key and no DOM id is added (01 AC 18).
- 2.3: `normal-lines`, `material-override`, `led-wall-view` and `debug-view-controller` tests; `core.test.mjs` (SceneTheme, RENDER_ORDER) and `domain.test.mjs` (DebugViewSettings).

**01 F1-2, the normals debug UI (01 T7)** (manifest `tests/regression/expected/F1-2.json`: the `ui_visual` text snapshots, and every `#three-canvas` capture and every `ui_visual` page capture limited to the measured toolbar-column and help-badge rectangles of its frame; `ui_visual` styles may change; debug is off by default, so nothing else changes):
- 2.1: `css/features/debug-view.css` (the first feature stylesheet, linked before `12-responsive.css`, 07 C52) with `.view-btn.active`, the `.view-btn.active` half of B-L24. 8.2 and 8.3: the B-L24 row and the `css/09-viewport-tools.css` note narrowed to the badge overlap (06 T4a); the id stays in `LEGACY_SITES`.
- 2.2, 3.11: `ui/DebugViewControls.js` (the toolbar buttons, the popover, the legend in `#viewport-top-stack`, the announcer, N / Shift+N with the shared typing guard, the open-only capture-phase Escape listener until 07 I1); App looks up `#debug-normals-stats` for `NormalsDebugView` (3.7, 3.11, static rule 4: eight App ids). 2.3: `index.html` feature markup and the badge token ` N=normals` (07 C35).
- 3.2, 5.2: `DEBUG_VIEW_CHANGED` (`debug:viewChanged`, visual, 07 C47), emitted by `DebugViewController` (3.10: `bus`, model -> event -> render call) and subscribed by `DebugViewControls` in the same step (5.1 rule 7). 7: their construction and binding, and the listener order.
- 2.3, 10: `css-slices.mjs` is scoped to the `css/01-*.css` .. `css/12-*.css` slices (07 S7; the slices themselves are unchanged, so the full check still runs, not `--report-only`); `debug-view-controls.test.mjs`; the controller test checks the event order.

**01 F1-3, the normals_debug harness scenario (01 T8)** (manifest `tests/regression/expected/F1-3.json`: `normals_debug/**` added; every other output identical; harness code only, so the scenario was captured twice and the two captures compare at 0 FAIL):
- 2.3: `scenarios-extra.mjs` registers `normals_debug` (01 8.2: Part A content probes on every page, Part B the debug view with S0 preconditions, image verdicts within the documented jitter only); `lib/probe.mjs`; `lib/app.mjs` gains `screenshotElement`, `pointerClick`, `overlayRects` and key modifiers (`keyPress` sends the old events when called without options); `findPersonPixel` is exported from `scenarios.mjs`; `harness-lib.test.mjs` covers the probes. 9: Feature 1's landed steps.

**01 F1-2b, legend legibility (review follow-up of F1-2)** (manifest `tests/regression/expected/F1-2b.json`: the nine `normals_debug` captures that show a legend note, each; nothing else changes):
- 2.1: `css/features/debug-view.css`: the legend notes keep `--text-secondary` (5.5:1 on the legend background) in italics instead of `--text-dim` (2.2:1, below WCAG AA for 11 px text), and `.debug-legend` takes pointer events (cursor `help`), so its `title`, the `gl_FrontFacing` caveat of 01 11.1, shows on hover; it had inherited `pointer-events: none` from `.viewport-overlay`, so the title could never show.

**01 F1-2c, the DebugViewControls import boundary (review follow-up of F1-2)** (manifest `tests/regression/expected/F1-2c.json`, an invariance gate: empty `expect`; a unit test only):
- 2.3: `debug-view-controls.test.mjs` checks that `ui/DebugViewControls.js` imports only `core/` and `ui/dom.js` (01 8.1, 3.11). Static rule 1 allows a `ui/` module `legacy/` and `domain/` too, so nothing enforced the narrower boundary before.

**06 T1, inline styles to classes (Feature 6's first step, docs/improvements/06-morph-branding.md 8.4)** (manifest `tests/regression/expected/F6-T1.json`: only class keys change, the `classes` arrays of the `ui_visual` style snapshots that probe the sidebar or the preview window and the `class` of the buttons, selects and logo-row labels in every `ui_visual` text snapshot and of the logo-row scale input in the three 08 P2-0 logo-list probes (`p2_xss_names` logos_01/02, `p2_project_v2` logos_03); the cross-check `compare.mjs --ignore-keys classes,class` reports every output identical or equivalent, so every computed style, rect, text and screenshot is unchanged):
- 1.2, 1.6 R8, 11 item 6: R8 (byte-identical markup, exact CSS slices) was a Phase-1 rule and ended with 06 T1.
- 2.1: `css/99-utilities.css`, linked last (07 C52's link order), holds the classes that replaced the static inline styles; the dead `.grid-lines` (07, with its commented-out element) and `.section-color-0..7` (10) are deleted; `css-slices.mjs` runs `--report-only` (07 S7).
- 2.2, 3.11: the `SectionListPanel` template gives the offset hint `curve-hint curve-hint--small`; `SectionLogosPanel` sets `div.className = 'logo-row'` and its template uses `logo-row__title`, `logo-row__label` and `logo-row__input`. The legacy-parity tests apply the same declared edits (`TEMPLATE_EDITS`) to the legacy source, so every other byte and DOM write is still compared.
- 2.3, 10: static rule 12 (06 R-B2: inline styles of `index.html` declare only `display`, `width`, `height`, without tokens or colour literals) with `index.html` fixtures in `good/` and `bad/`; `css-slices.mjs --report-only` in the static gate and in CI; `compare.mjs --ignore-keys` (06 8.3) and its tests.
- 9: Feature 6's landed steps.

**06 T2, ThemeBridge without wiring (docs/improvements/06-morph-branding.md 5.5, 6.2, 8.4)** (manifest `tests/regression/expected/F6-T2.json`, an invariance gate: empty `expect`; nothing imports the new module until 06 T3):
- 1.3, 2.2, 3.4: `theme/ThemeBridge.js` (pure, layer `theme`, imports nothing): `COLOR_BINDINGS` (the legacy scene, canvas and status colours), `FONT_BINDINGS`, `UNBRANDED`, `BIND_FONTS_DEFAULT = false`, `parseHexColor`, `parseCssColor` and `buildTheme`, whose `deepFreeze` skips functions so the shared `CanvasTheme` font helpers stay unfrozen.
- 2.3: `tests/unit/theme.test.mjs` (U1-U3, including the `--scene-frame` override of 06 AC 8).
- 9: Feature 6's landed steps.

**06 T3, ThemeBridge wired with the legacy-valued layer-4 tokens (docs/improvements/06-morph-branding.md 5.1, 5.5, 5.6, 8.4)** (manifest `tests/regression/expected/F6-T3.json`, an invariance gate: empty `expect`; the tokens hold the `Theme.js` fallbacks, so the bridged theme equals `Theme` leaf for leaf):
- 2.1: `css/02-tokens.css` gains layer 4 (`--scene-*`, `--canvas-background`, `--status-*`, `#rrggbb`, the legacy values until 06 T5) with spec 01's four debug-view tokens (01 CR-8); `--scene-wall-back` lands with `scene.wallBack` in 01 F1-5. `.status-pending` / `.status-ok` of `css/99-utilities.css` read `var(--status-off-center)` / `var(--status-within)`.
- 3.4, 3.12, 7: `App` injects `theme = buildTheme(Theme, getComputedStyle(documentElement) reader, { warn: console.warn })` instead of `Theme` (no `bindFonts` option: `BIND_FONTS_DEFAULT`, `false` until 06 T5); `COLOR_BINDINGS` gains `scene.debug.faceFront`, `faceBack`, `vertexNormal`, `faceNormal`.
- 2.3: `theme.test.mjs` U4 (token parity: the `:root` block parsed, `var()` chains resolved, every bridged leaf `Object.is` its fallback, fonts unbound while `BIND_FONTS_DEFAULT` is false), U10 (the Theme walk) and U11 (`tests/unit/fixtures/legacy-theme.mjs`: the Phase-1 values of the `UNBRANDED` leaves and spec 01's face-orientation colours).
- 9: Feature 6's landed steps.

**06 T1b, the last slice is not the last stylesheet (review follow-up of 06 T1)** (manifest `tests/regression/expected/F6-T1b.json`, an invariance gate: empty `expect`; comments and documentation only):
- 2.1: the `css/12-responsive.css` row and that file's header comment say it is the last of the slices, not the last stylesheet: since 06 T1, 07 C52's link order puts spec 09's `20`-`29` block and `css/99-utilities.css` after it. The `css-slices.mjs` check list says the same.
- 08 8.1 step 1 (the per-commit procedure) runs `css-slices.mjs --report-only` (07 S7), as the static gate, CI and REFACTOR_PLAN 8 have since 06 T1.

**06 T2b, a ThemeBridge table error throws whatever the tokens read (review follow-up of 06 T2)** (manifest `tests/regression/expected/F6-T2b.json`, an invariance gate: empty `expect`; every bound path exists in `Theme`, so `App` builds the same theme):
- 3.4: `buildTheme` checks every `COLOR_BINDINGS` and `FONT_BINDINGS` path against the base theme before it reads a token. Before, a row whose path was missing threw only when its token parsed; with a missing or malformed token it only warned, so a table error could hide behind a token error. It now throws whatever the tokens read and whatever `bindFonts` is.
- 2.3: `theme.test.mjs` U2 asserts that (no token read and no warning before the throw; a font row throws with `bindFonts` false or true).

**06 T4a, the ungated Morph chrome (docs/improvements/06-morph-branding.md 3.1-3.6, 3.12, 5.1-5.3, 8.4)** (manifest `tests/regression/expected/F6-T4a.json`: every `ui_visual` styles and text snapshot and every screenshot of every scenario; nothing else):
- 1.2: the head is no longer the legacy head: the title "Morph LED Configurator", a valid author meta, description, `theme-color`, `color-scheme`, the Open Graph text and the font URL with Montserrat 400-700 (JetBrains Mono 300-600 and Outfit unchanged, so no canvas glyph changes until 06 T5).
- 2.1: `css/02-tokens.css` replaces the legacy token block with layers 1-3 (brand primitives, derived dark-UI primitives, semantic roles); every stylesheet, `css/features/debug-view.css` included, references only role tokens; `03-layout.css` gains the `:focus-visible` ring; `04-header.css` the three-column header grid with `.brand-lockup` and `.product-name` (the history slot of 07 H2 stays empty); `07-viewport.css` loses `.company-logo`; `09-viewport-tools.css` places the opaque selection badge at `bottom: 64px`; `99-utilities.css` gains `.preview-window__title`.
- 2.3, 10: static rules 13 (06 R-B1), 14 (06 R-B3a) and 15 (06 R-B5) with `css/` fixtures; `contrast.test.mjs` (U5, the UI rows of 06 3.12); `theme.test.mjs` U6 (layers 1-3); the shared test helpers `fixtures/css-tokens.mjs` and `fixtures/colour-math.mjs`; the harness probes of `ui-spec.mjs` and `lib/uiprobe.mjs` and the Montserrat preloads of `lib/app.mjs`.
- 8.2, 8.3: B-L24 landed (06 T4a, the badge overlap; its `.view-btn.active` half in 01 F1-2): its 8.2 fix cell starts with `Landed`, its two documentation-only 8.3 rows and the `Legacy note B-L24` paragraphs of the two stylesheet headers are gone, and `LEGACY_SITES` no longer lists it (`core.test.mjs`: `PHASE3_LANDED`).
- 8.4: the head row is narrowed to the missing favicon (06 T4b deletes it).
- 9: Feature 6's landed steps.

**06 T4b, the owner-approved Morph brand artwork (docs/improvements/06-morph-branding.md 3.2, 3.3, 3.7, 5.8, 8.2 R-B4, 8.4; owner approval Q2/A8)** (manifest `tests/regression/expected/F6-T4b.json`: the `ui_visual` styles and text snapshots, the `ui_visual` page captures inside the header and watermark rectangles (`00_initial` also the toolbar columns and the help badge, which Chrome re-rasterises in that one masked capture), and every `#three-canvas` capture outside the pilot states inside the measured watermark rectangle):
- 1.2, 2.3 (file tree): `assets/brand/` holds the six app files of 06 5.8, byte-identical to the brand source, with `NOTICE.md`; `.gitattributes` keeps their bytes from line-ending conversion. The head links the favicons, the apple-touch icon and `og:image`.
- 2.1: the wordmark lockup (`04-header.css`), the viewport watermark (`07-viewport.css`; `will-change: transform` gives it its own compositing layer, so adding it does not re-rasterise the overlay buttons, a side effect the T4b gate found) and their `<= 900 px` / `<= 520 px` rules (`12-responsive.css`).
- 2.3, 10: static rule 16 (06 R-B4) with `assets/brand/` fixtures; the harness probes of the lockup and the watermark and `header.brandAlt`.
- 8.4: the head row is deleted (the author meta became valid in 06 T4a, the favicons landed here).
- 9: Feature 6's landed steps.

**06 T4c, British copy (docs/improvements/06-morph-branding.md 3.1, 8.4; Q14/B14)** (manifest `tests/regression/expected/F6-T4c.json`: the section-state and logo-row probes that record card or logo-row text, the `ui_visual` text and sidebar snapshots, the page captures and the styles of the states with an expanded card; no export, no canvas capture):
- 2.2, 3.11: the card template says "Panel Angle (°)" (the one label T4a's label-fit check found wrapping, now on one line), "Panel Colour" and "Custom colour"; the logo row's position options say "Centre" (their values, like every JSON key, are unchanged); `index.html` says "Label Font Colour" and "Section Label Colour".
- 2.3, 11: `wall-controller.test.mjs` `TEMPLATE_EDITS` applies the same copy to the legacy source, so the parity tests keep comparing every other byte.
- 9: Feature 6's landed steps.

**06 T4a2, the active pilot button keeps its focus ring (review follow-up of 06 T4a)** (manifest `tests/regression/expected/F6-T4a2.json`, an invariance gate: empty `expect`; the harness never gives the pilot button keyboard focus):
- 2.1: `css/09-viewport-tools.css` adds `.gizmo-mode-btn.pilot.active:focus-visible`. The Morph Black `outline` of the active pilot button (06 3.5) outranked the `button:focus-visible` ring of `03-layout.css`, so a keyboard user who switched pilot mode on lost the focus indicator (06 3.5 asks for the focus ring on every gizmo button). While it has keyboard focus the ring takes the outline and the Morph Black edge is a 1 px `box-shadow`; 06 3.5 says so.

**06 T4a3, the selection badge clears a wrapped help badge (review follow-up of 06 T4a, B-L24)** (manifest `tests/regression/expected/F6-T4a3.json`, an invariance gate: empty `expect`; at both harness sizes the help badge is one line, so the anchored value is exactly 64 px):
- 2.1: the help text wraps to two lines (46 px instead of 32 px) wherever the viewport is narrower than about 673 px (windows of about 901-1072 px, and below about 673 px in the single-column layout), and the fixed `bottom: 64px` of `.selection-indicator` then overlapped the help badge by 2 px, B-L24's symptom (06 AC 17: "never overlap"). `.viewport-info` now carries `anchor-name: --help-badge` (`07-viewport.css`) and `.selection-indicator` `bottom: calc(anchor(--help-badge top, 52px) + 12px)` after its `bottom: 64px` fallback (`09-viewport-tools.css`): 12 px above the help badge at every width (measured at 1600, 1100, 1024, 960, 800, 600 and 380 px). 06 2.4, 5.2 and AC 17 say so. The 8.2 row keeps its `bottom: 64px` wording (the value at every width where the help text fits on one line).

**06 T5, the Morph scene and canvas (docs/improvements/06-morph-branding.md 3.8, 5.1, 5.4-5.7, 6.6, 6.7, 8.1, 8.3, 8.4)** (manifest `tests/regression/expected/F6-T5.json`: every canvas-clipped screenshot, every exported panel-ID PNG and ZIP texture, the `statusColor` key of the 35 `cameraState` records, the `ui_visual` styles of the states that probe the status readouts and the sidebar captures that show them):
- 1.2: the final font URL (JetBrains Mono 400-700, Montserrat 400-700; no Outfit, no JetBrains Mono 300).
- 1.3, 2.2: `render/frameColor.js` (pure, imports nothing) and `app/fontGate.js` (app layer, imports nothing; everything injected).
- 2.1, 3.4: layer 4 of `css/02-tokens.css` and the `Theme.js` fallbacks hold the Morph values of 06 3.8, with `--scene-frame-on-light` / `frameOnLight` and `--scene-overlay-halo` / `cameraBody.outlineColor` and `frustumLines.haloColor` (new `COLOR_BINDINGS` rows), the non-colour keys `frustumLines.dashSize` / `gapSize` and `CanvasTheme.preloadFonts`; `BIND_FONTS_DEFAULT` is `true`, so the canvas and safe-zone fonts come from `--font-mono` / `--font-ui`.
- 3.7: `LEDWallView.#buildFrames(layout, display)` gives each section's frames its adaptive colour; `CameraRigView` draws the frustum as a halo `LineSegments` under a dashed core `LineSegments` on one geometry (`RENDER_ORDER.DEFAULT` / `RIG_CORE`) and gives the opaque body an edge outline child; `PanelIdRenderer.takePendingFonts`.
- 3.12, 6.2, 7: `App.start` ends with `runFontGate` (row F6-1: `rebuildIfPanelIds` at most once, iff a panel-ID canvas was drawn with a pending (font, text) and panel IDs are on; never in the harness, where every font is preloaded and every text is ASCII).
- 4: `frustumHelper` is `#linesHalo` / `#linesCore`.
- 2.3: `scene-overlays.test.mjs` (U12, U13), `font-gate.test.mjs`, the row-F6-1 case of `wall-controller.test.mjs`, `theme.test.mjs` U6 over every layer and the Theme colour leaves; the harness font lists, the palette hook's `frameOnLight` and the `gizmo_drag` colour matchers.
- 8.4: the JetBrains Mono 700 row is reduced to the two font-gate limitations.
- 9: Feature 6's landed steps.

**06 T6a, the Morph export header and generator strings (docs/improvements/06-morph-branding.md 4.2, 5.4, 7, 8.1 U9, 8.4)** (manifest `tests/regression/expected/F6-T6a.json`: every OBJ (lines 1 and 4; line 3 is the 01 CR-3 orientation line), MTL (line 1), glTF (`asset.generator`) and safe-distance OBJ (line 2) export and every ZIP through those entries; no file name changes):
- 3.4: `Brand.productName`, the OBJ/MTL/safe-distance comment headers and `gltfGenerator` name "Morph LED Configurator"; new `Brand.jsonGenerator` (`{ name }`, frozen), `shortName`, `company`, `homepage`. `Brand.files` keeps the Phase-1 names until 06 T6b.
- 2.3: `tests/unit/fixtures/legacy-brand.mjs` (`LEGACY_BRAND`): `io.test.mjs` builds its oracle-compared exporters with it; the golden comparisons and the use-case tests use `Theme.brand`; `theme.test.mjs` U9 (the string half).
- 9: Feature 6's landed steps.

**06 T6b, the download file names from Brand.filePrefix (docs/improvements/06-morph-branding.md 5.4, 7, 8.1 U9, 8.2 R-B3b, 8.3, 8.4; D9)** (manifest `tests/regression/expected/F6-T6b.json`: every download under a Phase-1 name removed and added under its `Brand.files` name, the 18 `downloads.json` that list downloads and the `p2_project_v2` probe that records the archive name; `compare.mjs --rename` with the seven pairs reports every output and every ZIP entry identical):
- 3.4: `Brand.filePrefix = 'morph-led-wall'`; `Brand.files` derived from it (`.json`, `.obj`, `.mtl`, `.gltf`, `-export.zip`, `-panel-ids.png`, `-safe-distance.obj`, and `-hdri-pixel-map.png` for spec 05).
- 2.3: `compare.mjs --rename` and its tests; `io.test.mjs` derives every golden path from `Brand.files` (`golden(step, kind, key)`) and its `ProjectIO` log assertions from the injected brand; `export-orientation.test.mjs` matches its open-defect outputs by any download name; `theme.test.mjs` U9 (the file names, `files.json === filePrefix + '.json'`, the OBJ `mtllib` line); the harness README (product name, file names, `--rename`).
- 10: static rule 17 (06 R-B3b), enabled after the last of 06 T5 and T6b.
- 9: Feature 6's landed steps.

**06 T7, the Morph section palette (docs/improvements/06-morph-branding.md 3.9, 4.1, 4.3, 5.4, 5.7, 6.3, 8.1, 8.3, 8.4; D8, Q8, Q20, Q22)** (manifest `tests/regression/expected/F6-T7.json`: the section-state snapshots with an active swatch, the exports and canvas captures that carry the default or an added section colour, the `ui_visual` swatch probes and captures; every export and capture of the imported configs unchanged):
- 3.4: `Palette.sectionColors` (= `cardSwatches`, the same array) is Studio Grey, Signal Red, Sky, Ember, Jade, Rose, Iris, Steel; `defaultSectionColor` `#d9d9d6`; `legacySectionColors` keeps the Phase-1 palette for the v1 import fill only.
- 3.5, 7: `WallSection.createDefault({ color })` and `Project.createDefault({ defaultSectionColor })`; `App` injects `theme.palette.defaultSectionColor`.
- 3.9: `ProjectSerializer` fills a v1 section without a colour from `palette.legacySectionColors[i % 8]` (an old file looks as authored; colours in a file are kept verbatim).
- 3.11, 4, 7: `SectionListPanel` takes `palette` and renders the card swatches from `palette.cardSwatches`.
- 2.3: `theme.test.mjs` U6 (palette), U7, U8; `contrast.test.mjs` the scene rows; `fixtures/colour-math.mjs` the dichromacy simulation; `domain.test.mjs`, `io.test.mjs` (the oracle's legacy global `sectionColors` is `legacySectionColors`), `wall-controller.test.mjs` (`TEMPLATE_EDITS` maps the six legacy swatch lines to the palette's eight; the parity project starts from the legacy bootstrap colour); `tools/make-cap-wall.mjs` keeps its committed v1 fixture on the legacy palette; the harness swatch selector by index, `isPersonPixel` and `debugDump`.
- 9: Feature 6's landed steps.

**06 T9, the README (docs/improvements/06-morph-branding.md 5.8, 9 AC 18-19, 10; Q2/A8, Q16)** (manifest `tests/regression/expected/F6-T9.json`, an invariance gate: empty `expect`; no app file changes):
- 2.3 (file tree): `assets/brand/` gains `morph-primary-horizontal.svg` and `morph-dark-event-lockup.svg`, copied byte for byte from the brand source (SHA-256 equal), so it holds exactly the 8 owner-approved files of 06 5.8 plus `NOTICE.md` (which lists them); `README.md` shows them with `<picture>` (320 px), names the product, uses the Signal Red / Morph Black badge colours, names the export files and states in "Brand and licence" that the Morph marks are excluded from Apache-2.0. Static rule 16 holds (both files are referenced by the README). The GitHub social preview image is uploaded by the owner in the repository settings (no file in the repository).
- 9: Feature 6's landed steps.

**06 T6b2, rule 17 matches a legacy file name only as a whole token (review follow-up of 06 T6b)** (manifest `tests/regression/expected/F6-T6b2.json`, an invariance gate: empty `expect`; `tests/static` and documentation only):
- 2.3, 10: static rule 17 (06 R-B3b) used the token boundary `(?![A-Za-z0-9_-])` after a legacy file name, so `panel-ids.png.bak`, which the bad fixture documents as a near miss, was reported as `panel-ids.png`. It now uses the boundary of `compare.mjs --rename` (a `.` after the name ends the token only when it does not continue the name), and the static self-test asserts that the bad fixture's near-miss line is not reported (`CLEAN_IN_BAD`); before, the self-test checked only that each expected violation occurred.

**06 T6a2, two stale references of 06 T5 and T6a corrected (review follow-up of 06 T5 and T6a)** (manifest `tests/regression/expected/F6-T6a2.json`, an invariance gate: empty `expect`; a comment, a manifest reason and documentation only):
- 12: the 06 T6a entry above and the `F6-T6a.json` reason of its OBJ entry said lines 1 and 3; the T6a diff changed lines 1 and 4 (line 3 is the 01 CR-3 orientation line since 08 P2-2c), as its commit message and 06 7 and 8.4 say.
- 2.2: the header of `render/frameColor.js` named its test file `frame-color.test.mjs`; U13 lives in `scene-overlays.test.mjs` (2.3).

**08 P2-8a, B-L15 landed** (manifest `tests/regression/expected/P2-8a.json`: every card snapshot (the seven `sections_initial`, the 16 `ui_sections` states, the nine `import_edge` wall states, `p2_xss_names`, `p2_zip_section_mode`) for the new input attributes, and `p2_zero_inputs`' card, stats and combined OBJ for Columns 2.5 -> 3; merged before the validator of 08 P2-3b):
- 2.2: `domain/rules.js` (`clamp`, `roundInt`, `deepFreeze`; imports nothing), the shared numeric rules of the UI rule tables and, from 08 P2-3b, the import validator (08 4.4).
- 3.5: `WallSection.LIMITS` (07 4.1, 4.3: `{ field: { min, max, int, default } }`, deep-frozen); `FIELD_RULES` read `min`, `max` and `int` from it: the integer fields (columns, rows, LEDs) are rounded, and panel height (100,000 mm), the LEDs (65,536) and the curve (±180°) gain their sanity caps; panel width and the angle offset keep their legacy values. The `orDefault` fallbacks stay until 08 P2-8b.
- 3.6: `WallMeshBuilder.sectionGrid` keeps its B-L8 tag only (unvalidated imported counts until 08 P2-3b).
- 3.11 (R1/R8 template note, 08 5.5): the card template gains `step="1"` on the four integer inputs, `max="100000"` on panel height, `max="65536"` on Pixels X/Y and `min="-180" max="180"` on the panel angle; the legacy-parity tests apply them, and the rule changes of the number handler, as `TEMPLATE_EDITS` (11 item 6).
- 8.2: the B-L15 row is kept with a `Landed` fix cell; 8.3: the row `WallSection.js#FIELD_RULES` is deleted and B-L15 leaves `WallMeshBuilder.js#sectionGrid`, so `LEGACY_SITES` no longer lists it.
- 2.3: `domain.test.mjs` (the 4.4 rule table, `LIMITS`, the reachability property of every card rule over the grid and 10,000 seeded inputs, `rules`); `export-orientation.test.mjs` loses the B-L15 `OPEN_DEFECTS` row (`p2_zero_inputs`' combined OBJ passes).

**08 P2-3a, B-M4 landed** (manifest `tests/regression/expected/P2-3a.json`: `p2_xss_names` (the two card snapshots, the three XSS probes, the two logo lists) and `name_with_panel_ids/name_01_per_keystroke`; = 07 D7):
- 2.2, 3.11: `ui/dom.js escapeHtml(s)` (08 6.5: `& < > " '` -> `&amp; &lt; &gt; &quot; &#39;` after `String(s)`); every interpolation of a section value in the `SectionListPanel` card template (name, colour, id, the numeric fields, summary, hint, the computed 4K canvas size) and in the `SectionLogosPanel` row template (name, the seven ids), and the live rename's title, go through it. The colour still reaches `style` unvalidated until 08 P2-3b (escaping does not stop `red;outline:...`).
- 3.3: `legacyHtml` is deleted (`tests/unit/core.test.mjs` asserts it is gone).
- 3.9: the B-M4 id leaves `ProjectSerializer.read`'s tag (B-L8 stays until 08 P2-3b).
- 8.2: the B-M4 row is kept with a `Landed` fix cell; 8.3: the rows `LegacyCompat.js#legacyHtml` and `SectionListPanel.js#render` are deleted, and B-M4 leaves `SectionLogosPanel.js#render` and `ProjectSerializer.js#read` (both keep B-L8), so `LEGACY_SITES` no longer lists it.
- 2.3, 11 item 6: `wall-controller.test.mjs` applies the escaping to the legacy templates and the live rename as `TEMPLATE_EDITS` (escapeHtml is passed into the legacy closure), so the parity tests keep comparing every other byte; `core.test.mjs` tests `escapeHtml`.

**08 P2-3b, B-L8 landed** (manifest `tests/regression/expected/P2-3b.json`: `import_edge` (every case's import result, states, dialogs and exports that the validator changes; the (i) OBJ, MTL and glTF are new downloads), `p2_xss_names` (the corrected colour: dialogs, cards, probes, MTL, ZIP), `p2_project_v2` step 8 (the inline v2 file is refused), `p2_oversize_canvas` (70 columns clamped to 50); the wall subset of 07 D2/D3, in 07's final modules and signatures):
- 1.3, 2.2, 3.9: `io/ProjectSchema.js` (the rows: `FORMAT`, `MESH_MODES`, `LIMITS` = `WallSection.LIMITS` + `Wall.MAX_SECTIONS` + the 32-unit name, `SECTION_NUMBER_ROWS`, the 08 3.3 labels; `sectionsFromProject`), `io/ProjectMigrations.js` (`detectVersion`, 07 4.6; `migrateV1toV2`, the legacy `||` mapping, 07 6.9; `ImportMessages`), `io/ProjectValidator.js` (`validateProject`, 07 4.7, 6.7, 6.8; `formatValue`). `ProjectSerializer.read(data, {exportLimits})` returns `{ok, project, issues, sourceVersion, scope}`; every version 2.x and above is refused (M-IMP-4b) while no v2 reader exists (owner decision 2026-10-17: no v2 file now).
- 3.3, 8.1: `Strategies.importValidation` is retired (`core.test.mjs` asserts it is gone).
- 2.2, 3.5: `domain/rules.js` gains `sanitizeText` (`stripControls`, `truncateUnits`; 07 C28, 08 A3: no trim), `MAX_SECTION_ID`, `isValidSectionId`, `createIdAllocator` (07 6.8) and `MAX_IMPORT_BYTES` with its parts (08 4.3, A1); `Wall.MAX_SECTIONS = 200`, `canAddSection()`, and `replaceAll` recomputes `nextSectionId` with the 07 6.8 allocator (the legacy `max + 1` for valid ids); `WallSection.setName(raw)` (`sanitizeText(String(raw), 32)`) and `rename` through it.
- 3.7, 3.9: `LEDWallView.rebuild`, `ObjExporter.write` and `GltfExporter.write` dispatch on the three modes and throw `Unknown mesh mode` otherwise (unreachable after the validator).
- 3.10, 6.2 rows 6 and 24, 6.4, 6.10, 7: `WallController` takes `dialogs` and `addSection` alerts M-SEC-1 at 200 sections; `ProjectIO` takes `sectionsFromProject` (app/ may not import io/), refuses a file over `MAX_IMPORT_BYTES` before reading (M-IMP-6), alerts a read error (M-IMP-7), alerts the first error of a refused file and applies a valid one, then M-IMP-5 lists the corrections.
- 1.6 R12: an import is validated before it reaches the domain; the domain constructors still never coerce.
- 8.2: the B-L8 row is kept with a `Landed` fix cell; 8.3: the B-L8 rows at `WallSection.js#constructor`, `Wall.js#appendLikeLast`, `Wall.js#replaceAll`, `LogoLibrary.js#get`, `WallMeshBuilder.js#sectionGrid`, `ProjectSerializer.js#read`, `LEDWallView.js#rebuild` and `SectionLogosPanel.js#render` are deleted and B-L8 leaves `ObjExporter.js#write` and `GltfExporter.js#write`, so `LEGACY_SITES` no longer lists it.
- 2.3: `validator.test.mjs` (new); `io.test.mjs` (the read oracle becomes "identical on every valid legacy wall with no correction, corrected or refused otherwise", the unknown-mode exports an explicit expected value, the import use case with every message); `domain.test.mjs` (`setName` equals the validator on 1,000 random strings, `MAX_SECTIONS`, the allocator); `wall-controller.test.mjs` (M-SEC-1, the 200-section round trip of criterion 16, the parity import of the validated document); `export-orientation.test.mjs` loses the B-L8 `OPEN_DEFECTS` row.

**08 P2-3c, B-L16 landed** (manifest `tests/regression/expected/P2-3c.json`: `ui_sections/ui_09_card1_4k_warning` and `ui_10_card0_4k_warning`, whose renamed card 1 now shows the ⚠):
- 3.11: `ui/dom.js setTitleWithWarning(titleEl, name, warn)` (08 6.5): the title text from the model, then `' '` and the warning span when `warn`, created through `titleEl.ownerDocument`. `SectionListPanel`'s live rename and `#patchCard` write the title with it (the regex insert and removal are gone), so a renamed section crossing 4K shows the ⚠ like a default-named one.
- 6.4: the field-edit flow's title ⚠ follows the model.
- 8.2: the B-L16 row is kept with a `Landed` fix cell; 8.3: the row `SectionListPanel.js#patchCard` is deleted, so `LEGACY_SITES` no longer lists it.
- 2.3, 11 item 6: `core.test.mjs` tests `setTitleWithWarning`; `wall-controller.test.mjs` applies it to the legacy rename and patch as `TEMPLATE_EDITS` (passed into the legacy closure; the fake document gains `ownerDocument` and `createTextNode`).

**08 P2-3d, B-L21 landed** (manifest `tests/regression/expected/P2-3d.json`, an invariance gate: empty `expect`; no harness step imports while panel IDs are on or logos are loaded):
- 3.5: `LogoLibrary.clear()` and `set(sectionId, entry)` (a fresh copy).
- 3.10, 6.10: `WallController.applyImport({sections, meshMode, logos = null})` resets the logo library first and installs only the logos it is given (a v1 import gives none: `ProjectIO` passes `logos: null`), then replaces the sections; 07 D5's `ProjectSession` later removes the `logos` argument (08 5.6).
- 3.11, 5.2: `SectionLogosPanel` re-renders on `WALL_SECTIONS_CHANGED` for every reason when panel IDs are on, the import included.
- 8.2: the B-L21 row is kept with a `Landed` fix cell; 8.3: the rows `WallController.js#applyImport` and `SectionLogosPanel.js#constructor` are deleted, so `LEGACY_SITES` no longer lists it.
- 2.3: `wall-controller.test.mjs` (the reset and the installed logos, the legacy import tail edited as `IMPORT_EDITS` so the parity scenario's import, made with panel IDs on and a logo loaded, compares the reset and the logo-list render); `domain.test.mjs` (`clear`, `set`).

**08 P2-4a, B-H4 landed** (manifest `tests/regression/expected/P2-4a.json`: `preview_off_in_pilot`'s states, dialogs and the screenshots after the preview is turned off):
- 3.8: `PilotController.toggle` alerts only when entering pilot mode with the preview off (`!interaction.pilotMode && !cine.enabled`); the preview-off handler, which clears `cine.enabled` before it leaves pilot mode, now restores the orbit view with no alert, and P, Escape and the pilot button work again. Entering pilot mode with the preview off still alerts (`keyboard` is unchanged).
- 3.7, 4, 8.4: `CameraRigView.remove` nulls `bodyMesh` (the 08 2.2 observation; picking was already gated by the preview flag), so the 8.4 row is deleted.
- 6.5: the preview-off flow leaves pilot mode cleanly.
- 8.2: the B-H4 row is kept with a `Landed` fix cell; 8.3: B-H4 leaves `PilotController.js#toggle` (B-L26 stays) and `CameraController.js#setPreviewEnabled` (B-M8 stays until 08 P2-4b), so `LEGACY_SITES` no longer lists it.
- 2.3: `camera-hub.test.mjs` (the preview-off sequence leaves pilot mode with no alert; `PilotController.toggle`'s entry-only guard with fakes); `scene-overlays.test.mjs` (`remove()` nulls `bodyMesh`).

**08 P2-4b, B-M8 landed** (manifest `tests/regression/expected/P2-4b.json`: `camera/14_preview_off`, which no longer shows the safe-distance floor):
- 3.7, 3.10, 6.5: `CameraController.setPreviewEnabled(false)` calls `hub.syncSafeDistance()` right after `rig.remove()`; with `cine.enabled` false it removes the floor (legacy left it in the scene, stale, while its toggle was hidden with the preview options). Turning the preview on again rebuilds it through `resetPose`'s refresh when Safe Distance is still on (`camera/cam_15` unchanged, 08 criterion 20).
- 8.2: the B-M8 row is kept with a `Landed` fix cell; 8.3: the row `CameraController.js#setPreviewEnabled` is deleted, so `LEGACY_SITES` no longer lists it.
- 2.3: `camera-hub.test.mjs` (the preview-off sequence removes the floor after the rig; the next enable creates it again).

**08 P2-3b2, Add Section never reuses a live id (review follow-up of 08 P2-3b, B-L8)** (manifest `tests/regression/expected/P2-3b2.json`, an invariance gate: empty `expect`; no harness scenario imports an id near 2^31 - 1):
- 3.5, 4: `Wall.allocateId()` (07 4.1, delivered early; 07 6.8 `nextFree` over the live ids) gives `appendLikeLast` its id. P2-3b's `replaceAll` falls back to the smallest unused id when `max + 1` would pass 2^31 - 1; that id can lie below live ids, and the legacy `nextSectionId++` then handed out ids that live sections already used (an import of ids `[2147483647, 1]` followed by two adds gave `0, 1`: a duplicate 1, which Delete removed together with the imported section and which the next import renumbered). `allocateId` steps over live ids, takes the smallest unused id above the range, and equals the legacy `nextSectionId++` whenever `nextSectionId` is above every live id (every other state). A `nextSectionId` that is not a valid id (unreachable since 08 P2-3b) is handed out as legacy did while unused and otherwise takes the fallback, so the call always ends.
- 6.0 (boundary (c)): marked as a Phase 1 record that 08 P2-3b made unreachable.
- 2.3: `domain.test.mjs` (the legacy fuzz of `appendLikeLast` now starts the allocator above every live id; `allocateId` at the top of the range, after a delete, from odd values, and a 300-run add/delete property: every id stays a unique valid id); `wall-controller.test.mjs` (an import of `[2147483647, 1]`, two adds give `0, 2`, the saved file re-imports with no correction, Delete removes one section).

**08 P2-5b, B-M15 and B-L29 landed** (manifest `tests/regression/expected/P2-5b.json`: the safe-distance OBJs of `camera` and `p2_curved_safe_distance` and the four `p2_curved_safe_distance` screenshots; `camera/13_safe_distance` may change, flat walls give the legacy positions):
- 1.3, 2.2, 3.6: `geometry/SafeDistanceBand.js` (new, pure): `buildSafeDistanceBand(input, D, opts)` over one run `{points, facing, sectionOfVertex}` or a `WallLayout` (`bandRunOfLayout`, the single run of `flatEdges()`; 02 6.12, CR-08-a): the 08 6.9 mitred strip, clamped near concave turns and concave curves (inradius) so it never folds, every triangle +Y, offset vertices closer than D marked `'clamped'` and counted.
- 3.7: `SafeDistanceView.create` draws the band (vertex colours wall / threshold / clamped; the outline along the offset vertices; the label at `band.labelAnchor`, the legacy middle index) and keeps it as `lastBand`; `remove()` clears it. 3.4: `SceneTheme.safeZone.clampedColor` with `--scene-safe-clamped` (`--ui-orange-400`, the F6 off-centre amber; 08 named the key `scene.safeDistanceClamped` with `#ffaa00`, which 06 5.12 rule 2 rejects as gold-like, so the key follows the `safeZone` group and the F6 amber, recorded in 06 5.12 and 08 5.2).
- 3.9, 3.10: `ObjExporter.writeSafeDistance(group, band)` writes `vn` and `f a//a` faces and, when the band clamped any vertex, the `# Clamped:` header line; `ProjectIO.exportSafeDistanceOBJ` passes `safeDistance.lastBand`.
- 3.3, 8.1: `Strategies.safeDistanceBand` is retired; 8.2 keeps the B-M15 and B-L29 rows with `Landed` fix cells; 8.3: the rows `WallLayout.js#flatEdges` and `SafeDistanceView.js#create` are deleted, so `LEGACY_SITES` no longer lists either id. 9: the Feature 2 row calls the band builder once per floor run.
- 2.3: `safe-distance-band.test.mjs` (new); `io.test.mjs` (the export passes `lastBand`); `core.test.mjs`, `camera-hub.test.mjs` (the import list); `export-orientation.test.mjs` loses its last `OPEN_DEFECTS` row (B-L29): every golden OBJ and glTF now passes the orientation check.

**08 P2-6a, B-M3 landed** (manifest `tests/regression/expected/P2-6a.json`: the JSON entry of every ZIP, and `box_corner/zipjson_roundtrip__export-json`, which now equals `final__export-json`):
- 3.9: `ProjectSerializer.write(project, {variant: 'zip'})` is the `'file'` document plus `texture_file` as the last key of each section: one literal for both variants, so the ZIP JSON keeps `angle_offset_degrees` and re-imports to the same wall (08 criterion 24). The legacy ZIP literal is gone.
- 3.3, 8.1: `Strategies.zipJsonIncludesAngleOffset` is retired; 8.2 keeps the B-M3 row with a `Landed` fix cell; 8.3: `ProjectSerializer.js#write` keeps B-L31 only.
- 2.3: `io.test.mjs` (the oracle's `json:zip` expectation is the legacy file document plus the legacy `texture_file`; the 08 8.4 test "the 'zip' JSON equals the 'file' JSON plus `texture_file`" over every harness config); `core.test.mjs`.

**08 P2-6b, B-L14 landed** (manifest `tests/regression/expected/P2-6b.json`: the ZIP of `p2_xss_names`, whose `A B`/`A_B` and `Dup`/`Dup` textures no longer overwrite each other):
- 3.6: `PanelNaming.textureFileNames(sections)` (08 6.6): the legacy names made unique case-insensitively with `_2`, `_3` suffixes; names without a collision are unchanged. `zipTextureFileName` is deleted.
- 3.9: `ProjectSerializer.write(project, {variant: 'zip', textureNames})`: the names come from the caller (required for `'zip'`); a `null` entry writes `texture_file: null`. The `skipped` option is gone.
- 3.10: `exportZIP` computes `names = textureFileNames(sections)` once and uses it for the texture entries, the JSON (`textureNames`, null where skipped) and M-EXP-4; the OBJ writer keeps `skipped` until 08 P2-6c/d.
- 3.3, 8.1: `Strategies.zipTextureNaming` is retired; 8.2 keeps the B-L14 row with a `Landed` fix cell; 8.3: the rows `PanelNaming.js#zipTextureFileName` and `ProjectIO.js#exportZIP` are deleted.
- 2.3: `geometry.test.mjs` (the legacy names wherever they were unique, otherwise a suffixed legacy base, always unique; the 08 8.4 cases), `io.test.mjs` (the serializer's `textureNames`, the ZIP use cases), `core.test.mjs`.

**08 P2-6c, B-L7 landed** (manifest `tests/regression/expected/P2-6c.json`: every standalone section-mode MTL, `**/*section__export-obj__*.mtl`, loses its `map_Kd` lines):
- 3.9: `ObjExporter.write({sections, meshMode, layout, textureNames = null})`: a section-mode material references its texture only when the caller ships it (`textureNames[i]` not null); the path stays index-based until 08 P2-6d (B-M2). The `skipped` option is gone; the ZIP passes its `textureNames` (null where a texture is left out).
- 3.10: `ProjectIO.exportOBJ` passes no names, so the standalone MTL references nothing it does not deliver; `ProjectIO.MTL_DOWNLOAD_DELAY_MS = 100` replaces `Strategies.mtlDownloadDelayMs`. 8.4 gains the residual observation (the second download may be blocked, accepted by 08 Q7).
- 3.3, 8.1: `Strategies.mtlDownloadDelayMs` is retired; 8.2 keeps the B-L7 row with a `Landed` fix cell; 8.3: the row `ProjectIO.js#exportOBJ` is deleted.
- 2.3: `io.test.mjs` (the oracle writer ships every legacy index-named texture, so the legacy section MTL stays byte-identical; the standalone section MTL has no `map_Kd`; the ZIP's null names), `core.test.mjs`.

**08 P2-6d, B-M2 landed** (manifest `tests/regression/expected/P2-6d.json`: the MTL entry of the section-mode ZIPs of `p2_zip_section_mode` and `p2_xss_names`):
- 3.6: `PanelNaming.mtlTextureFile(fileName)` returns `textures/${fileName}`; 3.9: `ObjExporter` writes `map_Kd ${mtlTextureFile(textureNames[i])}`. The ZIP's MTL, texture entries and JSON `texture_file` now name the same file for every section (08 criterion 25): legacy pointed a renamed section, or every section after a deleted one, at an index-named file that the ZIP did not hold.
- 3.3, 8.1: `Strategies.mtlTextureNaming` is retired; 8.2 keeps the B-M2 row with a `Landed` fix cell; 8.3: the row `PanelNaming.js#mtlTextureFile` is deleted. P2-6 is complete.
- 2.3: `geometry.test.mjs` (the legacy MTL block from the legacy index names; `mtlTextureFile` of a texture name), `io.test.mjs` (criterion 25 over duplicate, case-different and empty names; the left-out texture), `core.test.mjs`.

**08 P2-6e, Export OBJ downloads one ZIP** (the owner's decision of 2026-10-17, which replaces 08 Q7's two downloads; the second half of B-L7; manifest `tests/regression/expected/P2-6e.json`: every `*__export-obj__*.obj` and `.mtl` output is replaced by one `*__export-obj__*.zip`, the `downloads.json` of the twelve scenarios that export OBJ, and `ui_visual`'s text records and five full-height sidebar captures of the button):
- 3.4: `Brand.files.objZip` = `${FILE_PREFIX}-obj.zip` (`morph-led-wall-obj.zip`).
- 3.10: `ProjectIO.exportOBJ` is async and downloads one archive holding `brand.files.obj`, `brand.files.mtl` (named by the OBJ's `mtllib` line) and, in section mode, every texture its `map_Kd` lines reference, at those paths. The texture names, the canvas pre-check, the late `data:,` skip (the MTL entry is written again without that texture) and M-EXP-4 are Export All's, factored into `#planSectionTextures`, `#addSectionTextures` and `#reportLeftOut` (`exportZIP`'s call order is unchanged). `MTL_DOWNLOAD_DELAY_MS` and the timer are gone; the M-EXP-1 label is `Export OBJ (ZIP)`. Legacy's second download could be blocked, so Blender imported the OBJ without materials (the owner's report).
- 3.11, `index.html`: `#export-obj` reads "Export OBJ (ZIP)", with the title "Downloads one ZIP: the OBJ, its MTL and the textures the MTL uses".
- 6.13: the export sequences. 8.2: the B-L7 fix cell names P2-6e; 8.4: the residual-download row is deleted (resolved).
- 2.3: the harness expects one download per Export OBJ step (`lib/app.mjs OBJ_ZIP_DOWNLOAD`, used by `scenarios.mjs`, `scenarios-extra.mjs` and `scenarios-phase2.mjs`); `normals_debug` hashes the archive's entries; `io.test.mjs` (the use cases in every mode, the texture paths, the left-out textures, the golden OBJ and MTL read from the archive entries), `theme.test.mjs` U9 and `core.test.mjs` (`objZip`).

**08 P2-6e2, Export OBJ's texture names in the ObjExporter text and the specs (review follow-up of 08 P2-6e)** (manifest `tests/regression/expected/P2-6e2.json`, an invariance gate: empty `expect`; a comment and documentation only):
- 3.9 and the header of `ObjExporter.write`: both archives pass texture names (Export All's ZIP, and Export OBJ's ZIP in section mode since 08 P2-6e); the text still said that Export OBJ passes none, so its standalone MTL has no `map_Kd` (P2-6c's rule, which P2-6e replaced).
- 08 5.6 (the B-M3, B-M2, B-L14, B-L7 row) and 04 8 (the `io.test.mjs` row and the UV-8a and UV-9 manifest rows) cited the same rule; they now follow 04 7.1 and 7.5 as amended by P2-6e: Export OBJ's ZIP writes `map_Kd` by the ZIP rules and ships every file it names, so UV-8a (combined `per-section` `map_Kd`) also changes the combined Export OBJ ZIPs and extends `ProjectIO`'s Export OBJ texture plan to combined mode.

**08 P2-12a, the `dispose.*` switches retired** (manifest `tests/regression/expected/P2-12a.json`, an invariance gate: empty `expect`; Phase 1C H1/H2 had already landed B-H5 and B-L12 as the values `true`):
- 3.3, 8.1: `Strategies.dispose` (`wallTextures`, `gizmo`) is deleted and its two 8.1 rows with it; 8.2 keeps the B-H5 and B-L12 rows (their single site is now the code that always disposes, and their fix cells name the retirement). No 8.3 row changes (the landed fixes had none).
- 3.7: `LEDWallView.rebuild` creates its tracker with `disposeMaps: true`; the `ResourceTracker` policies. 3.8: `TransformGizmo.rebuild/detach` always call `disposeObject3D(group)`.
- 2.3: `core.test.mjs` (`Strategies` has no `dispose` key; the Phase 1C landed fixes are listed with their steps).

**08 P2-12d, panel mode samples the section canvas; B-M16 landed** (manifest `tests/regression/expected/P2-12d.json`: `toggles/09_panelids_panel`; `toggles/06_ledsim_panel` identical):
- 2.2, 3.6: `geometry/TextureBudget.js` (07 X3's module, delivered early: `SECTION_TEXTURE_BUDGET_PX`, `PANEL_TEXTURE_BUDGET_PX`, `MAX_CANVAS_SIDE`, `panelModePxPerLed` with 07 6.12's signature); `TextureAtlas.panelPxPerLed(sections, {maxSide})` is wall-wide (one px/LED per rebuild, 1..16; the default wall keeps 16); `WallMeshBuilder.panelUvs(panel, sl)` (section-space corners, bit-equal to the strip UVs at shared corners).
- 3.7: `LEDWallView.#buildPanels(layout, atlas, display)`: with panel IDs one `materials.sectionShared` material per section, shared by its panels, whose PlaneGeometry UVs are rewritten into section space; LED sim and colour unchanged. `LEDMaterialFactory.sectionShared` (the section material); `panel(..., scale)` and `PanelIdRenderer.panelCanvas/panelSize(..., scale)` take the wall-wide px/LED (04's `uv.panel_uvs = 'panel'` option only). The `ResourceTracker` policy note on the shared panel material.
- 8.2: B-M16 `Landed`; B-L19's fix cell names the viewport fix and 04 UV-9. 8.3: the row `TextureAtlas.js#panelPxPerLed` is deleted; `PanelIdRenderer.js#panelCanvas` keeps B-L19 only. 9: the Feature 4 row names P2-12d's part.
- 2.3: `geometry.test.mjs`, `materials.test.mjs`, `core.test.mjs`.

**08 P2-7a, B-M5 landed: pixel-accurate combined UVs in the viewport** (manifest `tests/regression/expected/P2-7a.json`: `mixed/panel_ids_combined` and `p2_mixed_content/panel_ids_combined`; the two `p2_mixed_content` LED-sim screenshots are `mayChange` and stayed identical, because at that framing the mipmapped tile averages to one flat grey per section; every equal-height wall is unchanged):
- 3.3, 8.1: `Strategies.mesh.viewport.combinedUV = 'atlas-pixel-accurate'` (`'atlas-u-full-v'` stays a case for `LegacyProfiles`). 8.2: B-M5 `Landed`; 8.3: the row `WallMeshBuilder.js#combinedGrid` is deleted and `LEDMaterialFactory.js#combined` keeps B-L18 only.
- 3.6: `computeAtlas` entries gain `uvHeight`; the `sectionGrid` uv option `{offsetU, widthU, heightV}`; `atlasUvRect(entry)`; `combinedGrid`'s `case 'atlas-pixel-accurate'` and its `sectionRanges` `vertexStart`/`vertexCount` (07 C52); `sectionRangeForFace(ranges, faceIndex)` (02 6.13's search, its one owner). 3.7: the combined LED-sim repeat comment. 9: the Feature 4 row.
- 2.3: `geometry.test.mjs` (`uvHeight`, equal heights bit-identical, `mixed`'s v_max at each section's top edge, vertex ranges, `sectionRangeForFace`), `core.test.mjs`.

**08 P2-7b, B-M6 landed: the combined OBJ `vt` are the pixel-accurate atlas UVs** (manifest `tests/regression/expected/P2-7b.json`: the OBJ entry of the combined Export OBJ ZIPs and of the Export All ZIPs of the five multi-section configs, and `ui_sections/edited`; every single-section combined OBJ is unchanged):
- 3.3, 8.1: `Strategies.mesh.obj.combinedUV = 'atlas-pixel-accurate'` (`'per-section-overlap'` stays a case for `LegacyProfiles`). 8.2: B-M6 `Landed`; 8.3: `ObjExporter.js#write` keeps B-L6 only.
- 3.9: `ObjExporter`'s combined branch takes `atlasUvRect(computeAtlas(sections).entries[i])` per section (io may import geometry).
- 2.3: `io.test.mjs` (the combined `vt` equal the viewport UVs; only the `vt` lines change; single sections byte-identical; `mixed`'s rects), `core.test.mjs`.

**08 P2-7c, B-M7 landed: glTF `TEXCOORD_0`** (manifest `tests/regression/expected/P2-7c.json`: every `*__export-gltf__*.gltf` and every ZIP's glTF entry):
- 3.3, 8.1: `Strategies.mesh.gltf.attributes = ['POSITION', 'NORMAL', 'TEXCOORD_0']` and the new leaf `mesh.gltf.combinedUV = 'atlas-pixel-accurate'` (04 2.3 row 08-3; read only when `TEXCOORD_0` is written, so `LegacyProfiles` needs none). 8.2: B-M7 `Landed`; 8.3: the row `GltfExporter.js#addMesh` is deleted.
- 3.9: `GltfExporter`: `#attributeList` accepts `'TEXCOORD_0'`; `#addTexCoords` writes (u, 1 - v) (glTF's top-left UV origin; three's GLTFLoader sets `flipY = false`); the combined writer takes `#combinedUvOption` (the viewport's `atlasUvRect` UVs), the section writer uv `'unit'`, the panel writer `PANEL_UVS`. POSITION, NORMAL, indices and materials are unchanged.
- 2.3: `io.test.mjs` (the accessor shape on every primitive, the values per mode, the V flip, the `combinedUV` read rule, the unchanged data), `core.test.mjs`.

**08 P2-7d, B-L6 landed: one material per section in the combined exports** (manifest `tests/regression/expected/P2-7d.json`: every combined Export OBJ ZIP (OBJ and MTL entries), every combined glTF, and the OBJ, MTL and glTF entries of every combined ZIP):
- 3.3, 8.1: `Strategies.exportCombinedColor` is retired (its row deleted); 1.5 no longer names it. 8.2: B-L6 `Landed`; 8.3: the rows `ObjExporter.js#write` and `GltfExporter.js#write` are deleted (no tag left in either file).
- 3.9: the combined OBJ writes `newmtl Wall_<i+1>` per section (Kd from the section colour, then Ka/Ks/Ns/d as the section materials) and `usemtl Wall_<i+1>` before each section's faces, in the one object `LED_Wall_Combined`; the combined glTF is one mesh `LED_Wall_Combined` with one primitive per section, each with its own POSITION / NORMAL / TEXCOORD_0 / index accessors and `Wall_<i+1>_Material`; `#addMesh` takes per-primitive `attrs` (one-primitive meshes keep their layout). An empty wall no longer throws (unreachable since 08 P2-3b).
- 2.3: `io.test.mjs` (the combined oracle cases become explicit expected values derived from the legacy section-mode outputs, 08 4.2; the materials, `usemtl` blocks, primitives and own accessors; the unchanged vertex data; `#runExport`'s failure case uses an unknown mode), `core.test.mjs`.

**08 P2-7e, B-L18 landed: the combined LED sim takes the section colours** (manifest `tests/regression/expected/P2-7e.json`: the combined LED-sim screenshots of `toggles` and `p2_mixed_content`):
- 3.3, 8.1: `Strategies.combinedLedSimColor` is retired (its row deleted). 8.2: B-L18 `Landed`; 8.3: the row `LEDMaterialFactory.js#combined` is deleted, `LEDPixelTextureFactory.js#tile` keeps B-L20.
- 3.7: `LEDMaterialFactory.combined`'s LED-sim branch is `MeshBasicMaterial({map: white tile, vertexColors: true, side, wireframe})`; `LEDPixelTextureFactory.tile` keys its cache by `new THREE.Color(color).getHexString()` and the layout.
- 2.3: `materials.test.mjs` (the material, the white tile and its repeat, the normalised key), `core.test.mjs`.

**08 P2-7f, the combined atlas in every ZIP** (Q5; no bug id; manifest `tests/regression/expected/P2-7f.json`: every ZIP whose atlas fits gains the atlas entry, every combined MTL entry its `map_Kd`, and `p2_oversize_canvas/dialogs.json` lists the skipped atlas):
- 3.6: `PanelNaming.atlasTexturePath(files)` = `textures/${files.panelIdsPng}` (never a literal, 06 R-B3b). 3.9: `ObjExporter.write({..., atlasFile = null})`: in combined mode every `newmtl Wall_<i+1>` gains `map_Kd ${atlasFile}`.
- 3.10, 6.13: `exportZIP` ships the atlas (the Export Panel IDs image) in every mesh mode when `canvasFits` passes (`#planAtlas`, `#addAtlasTexture`; skipped up front or late like a section texture; M-EXP-4 lists it after the sections); only the combined MTL references it. `exportOBJ`'s ZIP ships it in combined mode, whose MTL now references it (P2-6e's rule: every file the MTL names is in the archive).
- 2.3: `io.test.mjs` (the use cases in every mode, the up-front and late skips, the golden ZIP and OBJ ZIP texture listings), `geometry.test.mjs` (`atlasTexturePath`).

**08 P2-10a, B-M11 landed: the camera preview hides the registered helpers** (manifest `tests/regression/expected/P2-10a.json`: every screenshot taken while the preview window is shown, the 08 PREVIEW_SHOTS list re-checked against the P2-7f baseline, plus `normals_debug/b10_preview_lines_on`; `p2_project_v2/06_restored` is left out because the v1 file restores no camera, so the preview is off there):
- 3.3, 8.1: `Strategies.previewRendersHelpers` is retired (its row deleted). 8.2: B-M11 `Landed`; 8.3: the rows `SceneManager.js#addHelper` and `PreviewWindow.js#render` are deleted (no tag left in either method). 1.6 R6: still no layer.
- 3.7 `PreviewWindow`: `render(scene, helpers)` saves and clears `visible` on every helper, draws, and restores each flag in order (also when the draw throws), 08 6.14; `unsupportedStrategy` is no longer imported. 3.7 `SceneManager`: `LAYERS`, `addHelper` and `helpers` document the preview's use of the registry. 3.12, 6.12, 7: the App tick passes `sceneManager.helpers`.
- 2.3: `scene-overlays.test.mjs` (the helpers are hidden during the draw only; a hidden helper stays hidden; a throwing draw restores every flag; nothing changes while the preview is off), `core.test.mjs`.

**03 T1, the pivot domain** (Feature 3 step A, first commit; docs/improvements/03-pivot.md 4.1, 10; manifest `tests/regression/expected/F3-T1.json`, an invariance commit: nothing reads the new members yet, so no output changes; the pivot is session-only until project file v2, the owner's decision of 2026-10-17):
- 2.2, 3.5 `Wall`: `PIVOT_MODES`, `PIVOT_OFFSET_LIMIT_M = 1000` and the `WallPivot` API (`keepStageLayout = true`, `setMode` with `RangeError`, `setOffsetAxis` / `setOffset` / `resetOffset` replacing the offset object, `setKeepStageLayout` with `TypeError`, `parseOffset`: finite, clamped to ±1000, 1 mm, never `orDefault`, −0 normalised; `clone`, `equals`). `Project`: `DisplaySettings.showPivotMarker` from `DEFAULT_SHOW_PIVOT_MARKER = false`. `CineCamera`: `LIMITS` (the 07 C22 bounds through `rules.js STAGE_POSITION_LIMIT_M`), `translateStage(dx, dz)` clamped through them, `setField(field, raw, ctx = {wallZ: 0})` and the `posZ` rule's wall-plane branch (the legacy expression whenever `ctx.wallZ === 0`). `Prop`: `LIMITS`, `translateStage`.
- 3.4: `SceneTheme.pivot` (06 5.12's values) with `--scene-pivot`, `--scene-pivot-selected`, `--scene-pivot-anchor` and the four `COLOR_BINDINGS` rows (the halo on `--scene-overlay-halo`); U5 pivot rows in `contrast.test.mjs`.
- 4: state rows for `Project.wall.pivot` and `display.showPivotMarker` (their writers land in 03 T3 and T4).
- Deviations from 03 10's T1 row, recorded there: `CineCamera.resetTo` / `coverage` read `minX` / `wallZ` from 03 T3 (the `'flat-pivot'` bounds arrive in T2), and `Events.WALL_PIVOT_CHANGED` lands with its first emitter and subscriber (static rule 7).
- 2.3: `domain.test.mjs` (the `WallPivot` API and `parseOffset` (03 8.1 test 7), the `posZ` context at ±0 bit-identical to legacy and at `wallZ = -2.3397`, `LIMITS`, both `translateStage`), `core.test.mjs`, `contrast.test.mjs`.

**03 T2, the pivot geometry** (Feature 3 step A, second commit; 03 6.1-6.4, 6.6, 10; manifest `tests/regression/expected/F3-T2.json`, an invariance commit: at the default pivot `layoutProject` returns the walk itself and `'flat-pivot'` adds +0 fields the consumers do not read yet, so no output changes):
- 1.4: the world bullet and the frames paragraph say that `layoutProject` produces the frames since 03 T2.
- 2.2, 3.6 `WallLayout`: `SectionLayout.baseY` and `translated`; `WallLayout.pivot`, `generativeBounds()` (the Phase-1 `bounds()` box with `baseY`; `bounds()` delegates to it until spec 02), `pivotPoint` with the floor modes at `sections[0].baseY` and `mesh-center` on `generativeBounds()` (the y policy settled: half the tallest section, B5; superseded by B1-pivot-floor below: on the floor), `translated(dx, dy, dz)` on the raw walk only; `resolvePivot`, `stageShift`; `layoutProject(project, {frame = 'stage'})` (identity: the walk itself); `framingBounds(project, resolution)` with `'flat-pivot'`. 3.6 `WallMeshBuilder`: `sectionGrid`'s `y = baseY === 0 ? row * panelH : baseY + row * panelH`.
- 3.3, 8.1: `Strategies.framingBounds = 'flat-pivot'`; 8.3 keeps the `WallLayout.js#framingBounds` row (B-L2, B-M10), whose tag now says "flat bounds, translated by the stage origin".
- 2.3: `pivot.test.mjs` (new: 03 8.1 tests 1-6 and 8, test 9 skipped), `geometry.test.mjs` (`'flat-pivot'` at the identity, and `layoutProject` at the identity pivot is the walk itself in every frame over the fuzzed walls, 03 test 3), `core.test.mjs`.

**03 T3, the pivot consumers** (Feature 3 step A, third commit; 03 4.1, 5.2, 5.5, 5.6, 6.5, 6.6, 7, 10; manifest `tests/regression/expected/F3-T3.json`, an invariance commit: at the default pivot the stage and export frames are the layout frame, `minX` and `wallZ` are +0 and no pivot metadata is written, so no output changes):
- 3.5 `CineCamera`: `coverage` reads the `'flat-pivot'` rectangle (`distToWall = posZ - wallZ`, edges against `minX`) and returns `distToWall`; `resetTo` puts the camera at `minX + totalWidth / 2`, `wallZ + 5` (moved here from 03 T1, recorded in 03 10).
- 3.6: `isIdentityResolution`. 3.7 `SafeDistanceView.create` stamps `group.userData.stageOrigin`. 3.8 `OrbitController.updateTargetPosition` on the `'flat-pivot'` bounds.
- 3.9 `ObjExporter`: the two pivot header lines after the orientation line and before the generator line, only for a non-identity resolution; `writeSafeDistance(group, band, {translate})` (the `band` argument of 08 P2-5b stays second). `GltfExporter`: `scenes[0].extras.pivot` after the nodes, only for a non-identity resolution.
- 3.10 `WallController`: `layout({frame})`, `pivotResolution`, `resolvePivotNow`, `commitPivot`, `rebuild({cause})` with `cause` and `stageShift` on `WALL_REBUILT`, `applyImport` assigns the file's pivot or the identity before its `'import'` rebuild (03 4.4; the `WALL_PIVOT_CHANGED{import}` emission lands with the event key, 03 10). `CameraController.setCameraField` passes `{wallZ: frameBounds().wallZ}`; `CameraController.translateStage` and `PropController.translateStage` (the `StageAnchored` participants of 03 T4). `CameraHub`'s coverage payload carries `distToWall`. `ProjectIO`: `exportOBJ`, `exportGLTF` and `exportZIP` read `layout({frame: 'export'})`; `exportSafeDistanceOBJ` passes `translate = (sb.x - P.x, -P.y, sb.z - P.z)`.
- 3.12, 7: `frameBounds = () => framingBounds(project, wallController.pivotResolution)`; the bootstrap rebuild is `rebuild({cause: 'init'})`. 5.2: the `WALL_REBUILT`, `CAMERA_COVERAGE_CHANGED`, `CAMERA_POSE_CHANGED` and `PROP_POSE_CHANGED` payload rows. 6.1, 6.2 (rows 1 and 24), 6.13. 9: the F3 row.
- 10 (static rule 10): `pivot` joins the domain fields, and `WallController` (receiver `wall`) is its one allowed writer outside `js/domain/` (03 8.2, the field half; the rest of 8.2 lands with 03 T6).
- 2.3: `pivot.test.mjs` (test 6's consumer part: the orbit target, Reset, every coverage output and the `posZ` rule `Object.is`-equal to the Phase-1 `'flat'` expressions at the identity over seeded walls, poses and orbit offsets; the off-identity values), `domain.test.mjs`, `camera-hub.test.mjs`, `wall-controller.test.mjs` (the cache, the cause and shift, `commitPivot`, the import reset), `io.test.mjs` (identity bytes, the 6.8 export table, the header, the glTF float32 y values and `extras`, the safe-distance `translate`, the export frame of `ProjectIO`), `led-wall-view.test.mjs` (no wall root transform in any mode and pivot, 07 C32).

**03 T3b, the 'flat-pivot' type of the orbit's frame bounds (review follow-up of 03 T3)** (manifest `tests/regression/expected/F3-T3b.json`, an invariance gate: empty `expect`; comments and documentation only):
- 3.8 `OrbitController`: the `frameBounds` dependency is typed `{totalWidth, maxHeight, minX, wallZ}` here and on the `#frameBounds` field, the `'flat-pivot'` fields `updateTargetPosition` reads since 03 T3 (both still named the Phase-1 `{totalWidth, maxHeight}`).
- The module header of `ProjectIO` says the wall exports read `WallController.layout({frame: 'export'})` and the safe-distance OBJ re-expresses its group into the export frame (it still named the argument-less `layout()`).

**03 T4, the pivot controller** (Feature 3 step A, fourth commit; docs/improvements/03-pivot.md 5.3, 5.5, 5.6, 6.5, 6.7, 10; manifest `tests/regression/expected/F3-T4.json`, an invariance commit: nothing in the app calls `PivotController` before 03 T5 wires it, and the import's new `WALL_PIVOT_CHANGED` reaches only `CameraPanel`, which writes `#camera-pos-z`'s markup `min` "0.1" back at the identity, so no output changes):
- 2.2, 3.10: `app/PivotController.js` (new): `PIVOT_SNAP_STEPS_M`, `dragTarget` (03 6.7: the dragged distance is snapped, never the absolute value; an untouched axis keeps its stored value bit for bit) and `PivotController`: the use cases of rows F3-1 to F3-5 through P-PIVOT (`#commit`: model write through `WallPivot`, no-op when unchanged, the stage-origin shift against `WallController`'s cache, the re-expression of the `StageAnchored` participants iff keep stage layout, `WALL_PIVOT_CHANGED`, `commitPivot`, `SELECTABLE_MOVED`), `setSnapStep`, `toggleSelect`, and the Selectable 'pivot' (`kind`, `pickPriority` 10, `allowedAxes` null for rotate, `gizmoAnchor` from the cache plus the drag preview, `beginGizmoDrag` / `applyGizmoTranslate` / `endGizmoDrag({cancel})`).
- 3.2, 5.2: `Events.WALL_PIVOT_CHANGED` ('wall:pivotChanged', visual, 07 C47) with its first emitters (`PivotController`, `WallController.applyImport`) and its first subscriber (`CameraPanel`), static rule 7. 3.10 `WallController.applyImport` emits it right after the pivot assignment (03 4.4, 5.5).
- 3.11 `CameraPanel`: the `#camera-pos-z` `min` mirror on `WALL_PIVOT_CHANGED` and `WALL_REBUILT` with the exported `cameraZMinAttribute(wallZ)` (03 3.5), and the `'pivot'` pose mirror; `PropControls`: the `'pivot'` pose mirror. 5.2: the two pose rows say so. Both move here from 03 T6 (recorded in 03 10): the min mirror is the event's subscriber in the commit that adds it (5.1 rule 7), and the pose mirrors are the 5.5 subscribers of the events P-PIVOT emits.
- 6.2: rows F3-1 to F3-5 and the amended row 24 (also in `WallController`'s module header); `PivotController` never calls `rebuild()`.
- 4: the pivot rows already name the writers (`WallPivot` methods via `PivotController`; `PivotController.setMarkerVisible`). 10 (static rule 10): `showPivotMarker` joins the domain fields, `PivotController` (receiver `display`) is its one allowed writer.
- 2.3: `pivot-controller.test.mjs` (new: 03 8.1 tests 10-15, test 15's marker part lands with `PivotMarkerView` in 03 T5), `wall-controller.test.mjs` (the import's `WALL_PIVOT_CHANGED`), `core.test.mjs` (the catalogue).

**03 T5, the pivot marker and the shared path-B gizmo hook set** (Feature 3 step A, fifth and last commit; docs/improvements/03-pivot.md 3.3, 3.4, 5.3, 5.4, 5.8, 10; 07 C33, C46; manifest `tests/regression/expected/F3-T5.json`, an invariance commit: the marker is allocated last and stays hidden, and every hook is optional, so no output changes):
- 2.2, 3.7: `render/PivotMarkerView.js` (new: the two-tone glyph, pick proxy, drop line, anchor ghost and link in the stage frame, on `LAYERS.HELPERS`, every group at `RENDER_ORDER.PIVOT_MARKER`; visibility, selected colour, preview, minimum screen size). `SceneManager.addPreRender` (07 C46): hooks run in `render()` before the draw.
- 3.8 `InputState`: `InteractionState.gestureCancelled` and `.snap` (writer: `TransformGizmo` only); `PointerRay`'s ray tests every layer. `OrbitController`: the pointer `mousemove` guard gains `gestureCancelled`. `SelectionManager`: the Selectable typedef becomes the path-B hook set; `register` requires `kind` (inferred for camera, person, car), `kindOf`; `pickAt` chooses by the 03 5.4 rule (priority only against wall hits; the legacy nearest hit without them); `SELECTION_CHANGED.modes`. `TransformGizmo`: `beginGizmoDrag` on a hit, `ctx = {space, axisWorld, snap}`, `endGizmoDrag({cancel: false})` on the ending mouse-up, `cancelDrag()`, the detach cancel, `allowedAxes` (null: no group; false: no handle), `orientGizmo(rotation, mode)`, `setSnapIncrements`, the `WALL_REBUILT` re-anchor of a pivot target. `ViewportInput`: the `O` key (`onPivotShortcut`) with its guards, the Escape cancel branch, the router's swallowed gesture. 3.8 also documents the gesture swallowing.
- 3.11 `ViewportToolbar`: the badge suffix " (translate only)" from the cached `modes` (moved here from 03 T6, with the payload field it reads). 3.12, 7: `pivotMarker` (after `carView`), `pivotController` and its registration (after `wallController`), `onPivotShortcut`, the `addPreRender` registration and `pivotMarker.init(wallController.pivotResolution)` after the reset view. 4: the cancelled-gesture flag, the snap increments and the marker. 5.2: the `selection:changed`, `selectable:moved`, `wall:rebuilt` and `wall:pivotChanged` rows. 6.9: Release, Escape, O and the pivot drag.
- Deviations from 03 10's T5 row, recorded there: `PivotMarkerView` imports `render/SceneManager.js` for `LAYERS` (as `NormalsDebugView` does; 03 8.2 listed only `vendor/three.js`, `core`, `geometry` and `ResourceTracker`); every marker line is a dashed light core over a Morph Black halo (06 5.12, the spec of record, over 03 3.3's solid white cross); the ghost and the link follow the effective offset (offset plus drag preview), so a drag from a zero offset shows the anchor; 03 5.4's `modes` expression is corrected (`(sel.allowedAxes?.(m) ?? {}) !== null` turned `null` into `{}`).
- 2.3: `gizmo.test.mjs`, `selection.test.mjs`, `viewport-input.test.mjs`, `pivot-marker.test.mjs` and `fixtures/fake-three.mjs` (new; 03 8.1 tests 16, 18, 19, 20, test 15's marker part and the shared gizmo tests).

**03 T6, the Wall Pivot panel** (Feature 3 step B; docs/improvements/03-pivot.md 3.2, 3.5, 3.6, 5.3, 8.2, 10; manifest `tests/regression/expected/F3-T6.json`: the `ui_visual` sidebar screenshots, texts and styles change, every canvas screenshot and every other output stays identical):
- `index.html`: the "Wall Pivot" section after Mesh Options (03 3.2's markup, the snap select a `.ui-select`, plus the hint "Session only: the pivot is not saved in project files yet."), the camera label "Z Position (m)" and the first `.frustum-status` row "Distance to wall plane" (`#camera-wall-distance`, the existing read-out classes), the `css/features/pivot.css` link in the features block (07 C52). No help-badge change (07 C35).
- 2.1: `css/features/pivot.css` (new). 2.2, 3.11: `ui/PivotPanel.js` (new: `pivotReadoutText`, `pivotStatusText`, `rebuildStatusText`, the payload-derived mirrors and the listeners); `CameraPanel` writes `#camera-wall-distance` from `distToWall`. 3.12, 7: `pivotPanel` constructed after `displayPanel` and bound right after it. 5.2: the `wall:pivotChanged`, `wall:rebuilt`, `selection:changed` and `camera:coverageChanged` subscriber cells.
- 10, 2.3: static rules 18 (the pivot markup and the frozen help-badge text), 19 (the pivot radios never `display: none`) and 20 (the gizmo interaction state written only by `TransformGizmo`), with their bad-fixture cases and good-fixture near misses (03 8.2).
- Deviations from 03 10's T6 row, recorded there: the distance row uses the read-out classes instead of `.pivot-distance-*`; the snap select is a `.ui-select`; the session-only hint; a zero in the status line prints `0.000`; the far-from-anchor warning is appended to the readout.
- 2.3: `pivot-panel.test.mjs` (new; 03 8.1 test 17 and the panel's mirrors and listeners). The harness README's markup contract lists the pivot ids.

**03 T9, the pivot marker shown by default** (Feature 3 step C; docs/improvements/03-pivot.md 3.3, 4.1, Q9, 8.4; manifest `tests/regression/expected/F3-T9.json`: the `#three-canvas` screenshots that show the stage origin, the `ui_visual` switch state and the page-wide switch probe change; no export, pose or selection output does):
- 3.5 `Project`: `DisplaySettings.DEFAULT_SHOW_PIVOT_MARKER = true` (B-M11 is fixed by 08 P2-10a, so the camera preview never shows the marker; it is also on `LAYERS.HELPERS`); `index.html`'s `#toggle-pivot-marker` starts `active` with `aria-checked="true"`. 4: the flag's row.
- 3.7 `PivotMarkerView`: hidden in pilot mode (a `PILOT_CHANGED` mirror; 03 3.3 and AC 12: "hidden and unpickable in pilot", so the pilot view, a previs view like the camera preview, stays clean now that the marker is shown by default; Q9). 5.2: `pilot:changed` gains the subscriber.
- The v2 read and write of `display.show_pivot_marker` (the other half of 03 T9) waits for project file v2 with 03 T7 (M7a; the owner's session-only sequence), recorded in 03 10.
- 2.3: `domain.test.mjs` (the default), `pivot-marker.test.mjs` (shown by default), `pivot-panel.test.mjs` (the switch from the default).

**03 T10, the floor grid centred on the stage origin** (Feature 3 step D; docs/improvements/03-pivot.md 5.2, 5.7, Q8, 8.4; the owner's B6 = Q8 option c; manifest `tests/regression/expected/F3-T10.json`: the `#three-canvas` screenshots that show the floor change, nothing else):
- 3.4 `Theme`: `SceneTheme.grid = {size: 100, divisions: 100, centerColor, color, position: [0, 0, 0]}` (was 50 x 50 at (12.5, 0, 12.5)): whole-metre lines over +-50 m around the stage origin, the pivot on the floor, so the grid's centre lines cross where the axes and the marker are, in every pivot mode. The grid colours and their tokens are unchanged. 3.7 `SceneManager.init` reads it as before (no API change; not a `Strategies` switch, 03 5.7).
- 2.3: `core.test.mjs` (the `SceneTheme` snapshot).

**03 T8a, the harness library changes of the pivot scenarios** (Feature 3 step E, first commit; docs/improvements/03-pivot.md 8.3, 10; manifest `tests/regression/expected/F3-T8a.json`, an invariance commit: 03 8.3 asks that the re-capture after a `lib/` change compare identical, and it did):
- 2.3: `tests/regression/lib/app.mjs`: `KEYS` gains `o` and `Tab`; `keyPress(key, {modifiers, noText, repeat})` (`repeat`: CDP `autoRepeat` on the keyDown); `AppPage.drag(x, y, dx, dy, steps, {modifiers, beforeRelease})`, moved from `scenarios-extra.mjs` (its three drags call it with the defaults: the same CDP events in the same order). `harness-lib.test.mjs` covers both on a recording fake page. The harness README documents them.

**03 T8b, the pivot scenarios** (Feature 3 step E; docs/improvements/03-pivot.md 8.3, 8.4, 10; manifest `tests/regression/expected/F3-T8b.json`: 148 added `pivot_*` outputs, every existing output identical):
- 2.3: `tests/regression/scenarios-features.mjs` (new, `FEATURE_SCENARIOS`, registered after the Phase 2 scenarios): `pivot_modes` (each mode and an offset on four walls, the export-frame OBJ and glTF, the offset post-check of AC 7 on x, y and z), `pivot_stage` (keep stage layout on and off, AC 5, 6, 13, 19), `pivot_gizmo` (O, the X-arrow drag, Ctrl snapping, the Escape cancel with the `cancel_after` / `cancel_before` post-check, translate only, the radio focus), `pivot_roundtrip` and `pivot_validation` in their session-only form until 03 T7. `scenarios-extra.mjs` exports `pageMeshModes`, `isGizmoRed`, `locate` and `parkMouse` for it. The harness README documents the scenarios.

**03 T6b, Select pivot ignored in pilot mode (review follow-up of 03 T4/T6)** (docs/improvements/03-pivot.md 3.2, 3.4, 5.3; AC 9, 12; manifest `tests/regression/expected/F3-T6b.json`, an invariance gate: no scenario clicks `#pivot-select` in pilot mode):
- 3.10 `PivotController.toggleSelect` (the use case of the `O` key and of `#pivot-select`) is also a no-op in pilot mode. `ViewportInput` already ignored the `O` key there, but the button, "the same as the O key" (03 3.2), selected the pivot in pilot mode and built its translate gizmo around the marker that pilot mode hides (03 T9).
- 2.3: `pivot-controller.test.mjs` (pilot mode: no select, no deselect; it works again afterwards).

**03 T6c, accessible names of the Wall Pivot switches (review follow-up of 03 T6)** (docs/improvements/03-pivot.md 3.2; AC 18; manifest `tests/regression/expected/F3-T6c.json`, an invariance gate: no probe records `aria-labelledby` or span ids):
- `index.html`: `#toggle-pivot-keep-stage` and `#toggle-pivot-marker` (`role="switch"`) are named by their visible `.toggle-label` spans through `aria-labelledby` (`#pivot-keep-stage-label`, `#pivot-marker-label`); without a name assistive technology announced an unnamed switch. 03 3.2's markup is amended.
- 2.3: `pivot-panel.test.mjs` (every `role="switch"` of `index.html` is labelled by its `.toggle-label` text).

**03 T12, the README "Pivot" section** (docs/improvements/03-pivot.md 5.9, 10; manifest `tests/regression/expected/F3-T12.json`, an invariance gate: documentation only):
- Every 5.9 amendment landed with its code commit (03 T1-T6, T9, T10, T8; the entries above). 9: the Feature 3 row lists the landed tasks and what waits (T7 and the v2 half of T9 with project file v2 at M7a; step F is 08's P2-11c).
- `README.md`: the "Pivot" section (the modes, the offset, the marker, O and the drag with Ctrl snapping and the Escape cancel, keep stage layout and the stage origin, the exports at the pivot, placement in Blender and Unreal, a raised pivot, the session-only note) and the changelog line.

**B1-pivot-floor, the "Wall mesh centre" pivot on the floor** (the owner's request of 2026-10-17: "Middle of the wall pivot mode should be on the floor"; docs/improvements/03-pivot.md D1, 3.1, 3.2, 3.6, 5.4, 6.1, 6.8, 8.1, AC 3, 17, 23, Q2 answered (c); IMPROVEMENT_PLAN B5; manifest `tests/regression/expected/B1-pivot-floor.json`: the `pivot_modes` mesh-center readouts, exports and screenshots, the two `pivot_stage` mesh-center states and screenshots, `pivot_gizmo/focus_01_arrow_down.json` and the `ui_visual` label text and sidebar screenshots change; nothing else):
- 3.6 `WallLayout.pivotPoint('mesh-center')` is `{x, z: the generativeBounds() centre; y: y0}`, the floor of the other two modes, so every mode is a floor mode and a raised pivot is an Offset Y. The stage frame never read P.y, so the viewport changes only by the marker glyph (now on the floor, no drop line); the export frame of `mesh-center` rises by the old P.y (the OBJ pivot header and the glTF `extras.pivot` give the new anchor). A NaN panel height no longer makes the `mesh-center` resolution `null`; a wall without grid vertices still does.
- `index.html`: the radio label reads "Wall mesh centre on floor (bounding box)". `README.md`: the Pivot section and the raised-pivot note.
- 2.3: `pivot.test.mjs` (the 6.8 anchors, `Object.is(y, 0)` in every mode, the plan-only box, the NaN cases, the export grid range with and without Offset Y), `geometry.test.mjs`, `io.test.mjs` (the 6.8 table with a raised row, the OBJ header and glTF `extras`, the safe-distance translate with Offset Y), `pivot-marker.test.mjs` (the floor glyph without a drop line; the raised glyph through Offset Y), `pivot-controller.test.mjs`, `gizmo.test.mjs` (test 20 with a stale gizmo position) and `wall-controller.test.mjs`.

**B1-pivot-floor-b, spec 02's export test with a raised pivot (review follow-up of B1-pivot-floor)** (docs/improvements/02-section-editing-offsets.md AC 20; manifest `tests/regression/expected/B1-pivot-floor-b.json`, an invariance gate: documentation only):
- Spec 02's AC 20 checks that the exports equal the viewport translated by `(0, −P.y, 0)` with a `bottom-left` and a `mesh-center` pivot. Since `mesh-center` sits on the floor both have `P.y = 0`, so the case now uses `mesh-center` + Offset Y 0.75 to keep exercising the translation.

**B2-0, the camera-preview scenarios before the single renderer** (the owner's report of 2026-10-17: a rectangle of the main viewport, the preview's size mirrored vertically, stops updating after the preview window is enlarged and the view orbited; docs/improvements/07-platform-foundations.md 8.3, AC 1-4; manifest `tests/regression/expected/B2-0.json`: the `preview_compositing` and `preview_clean` outputs added, every existing output identical):
- 2.3: `tests/regression/lib/inject.mjs` hooks `HTMLCanvasElement.prototype.getContext` and exposes `window.__glCanvases()` (each canvas that received a WebGL context; the returned context is unchanged). `tests/regression/scenarios-platform.mjs` (new, `PLATFORM_SCENARIOS`, registered last): `preview_compositing` (the owner's steps; the WebGL canvases, full-page screenshots, the pure-black share of the mirrored rectangle) and 07 8.3's `preview_clean` (moved from 07 R2's commit to this one, so its baseline documents the two-canvas preview). Neither headless SwiftShader nor a one-off headless GPU run (ANGLE D3D11) reproduces the stale rectangle, so the structural check is the canvas list: two WebGL canvases here, one after 07 R2 (AC 1). `#camera-preview-canvas` is read only through its client rect, which stays the preview rectangle when 07 R2 makes the canvas a layout placeholder. The harness README documents both.

**07 R1, render layers** (docs/improvements/07-platform-foundations.md 5.2.1, 6.2, 8.4 row "R1 layers, after 08 P2-10a-c" (P2-10b/c have not landed; they touch no layer), Q7; manifest `tests/regression/expected/07-R1.json`: the five canvas screenshots taken while piloting change (`keyboard/pilot_view`, `pilot_look/look_0{1,2}`, `preview_off_in_pilot/pilot_0{0,5}`, `p2_shortcut_filters/pilot_view_front`); every preview rectangle, every other screenshot, export and state is identical):
- 1.6 R6 is replaced by the layer table. 3.7 `SceneManager`: `LAYERS` gains `ENVIRONMENT` (2) and `DEBUG` (3); `LAYER_MASKS` (main `0b1111`, pilot `0b1101`, preview `0b0101`); `addHelper(o, {layer})` (HELPERS by default; `'default'` keeps layer 0 and joins the pass-hidden set), `tagHelper`, `removeHelper`, `setHelpersVisibleInMain`, `withPassHidden`; `render()` re-tags every registered root first; the `?debug=1` audit; `get helpers()` is gone. `PreviewWindow`: the preview camera's mask is `LAYER_MASKS.PREVIEW`; `render(scene)` loses P2-10a's visibility loop. `NormalsDebugView`: the lines are `DEBUG` (visible in pilot mode, never in the preview). `CameraRigView`, `SafeDistanceView`, `PivotMarkerView`, the grid and the axes: `HELPERS`. 3.8 `TransformGizmo`: the hand-written gizmo is a `'default'` helper (still drawn in pilot mode: B-L26 stays with 08 P2-9j); `PilotController.toggle` calls `setHelpersVisibleInMain(!pilotMode)` (Q7: no grid, axes, rig with its frustum fill or safe-distance floor in the pilot view; the pivot marker was already hidden there by 03 T9); `PointerRay` already tests every layer (03 T5). 3.12, 6.12, 7: the tick runs the preview inside `sceneManager.withPassHidden`. 8.2: the B-M11 row names the new mechanism.
- `README.md`: the pilot-view release note. 07 5.2.1: the as-built note.
- 2.3: `render-layers.test.mjs` (new), `scene-overlays.test.mjs` (the preview camera's mask replaces the P2-10a hiding tests), `camera-hub.test.mjs` (`PilotController.toggle` order, the `PreviewWindow` imports), `fixtures/fake-three.mjs` (`Layers.disable`).

**07 R2, the camera preview drawn by the main renderer: B-M9 and B-L32 landed** (the owner's report of 2026-10-17: the stale rectangle of two overlapping WebGL canvases; docs/improvements/07-platform-foundations.md 3.6, 5.2.2, 6.1, AC 1-4; 07 8.4 row "R2 single renderer, before 08 P2-10", which takes over 08 P2-10b, 07 C31; manifest `tests/regression/expected/07-R2.json`: every canvas screenshot with the preview window shown, the `preview_resize` states, the `preview_compositing` and `preview_clean` outputs, `normals_debug/b10_preview_lines_on`, the camera-window probes of `ui_visual`; every export, label and screenshot without the window is identical):
- 2.2, 3.7: `render/PreviewPass.js` (new: the scissor pass in integer device pixels, the preview camera with mask DEFAULT | ENVIRONMENT, the legacy labels through `PreviewWindow.setLabels`) and `geometry/PreviewFit.js` (new, pure: `clampPreviewSize`, `letterboxRect`, `previewDeviceRects`, `cssForDevicePx`). `PreviewWindow` loses the second `WebGLRenderer`, its camera, `render` and `updateCamera`; it keeps the display, the resize handle (now with the per-axis clamps, B-L32) and gains `visible`, `contentRect` and `setLabels`; its `win` dependency is gone. `SceneManager`: `setPasses`, `renderFrame` (the main pass, then each pass; `render` is its alias). 3.10: the hub's `preview` is the pass. 3.12, 6.12, 7: `previewPass` is constructed after the window and injected with `sceneManager.setPasses([previewPass])`; the tick is `orbit.tickKeyboard(); pilot.tickKeyboard(); sceneManager.renderFrame()`. 4: `previewCamera` is `PreviewPass.camera`; `previewRenderer` is gone.
- `css/99-utilities.css`: `.preview-window` is transparent with square corners; `#camera-preview-canvas` is a layout placeholder (`display: block; visibility: hidden`; no WebGL context, no width/height attributes) whose client rect is the preview rectangle. The markup is unchanged.
- 3.3, 8.1: `Strategies.previewRendererSize` is retired (its row deleted). 8.2: B-M9 and B-L32 `Landed in 07 R2`; 8.3: the rows `PreviewWindow.js#init` (B-M9) and `PreviewWindow.js#setupResize` (B-L32) are deleted, `PreviewWindow.js#updateCamera` (B-L34) becomes `PreviewPass.js#updateCamera` (B-L34 stays open for 08 P2-10c, which lands in `PreviewPass`, 07 5.11). 9: the Feature 5 row.
- Deviations from 07 5.2.2, recorded there: `PreviewPass`'s window dependency is named `previewWindow` (check rule 3 forbids a `window` identifier); it takes no `win`; `PreviewFit.previewDeviceRects` holds 6.1's arithmetic so it is unit-tested without a renderer; `invalidate('preview-resize')` and `setSize` wait for R3 and D5.
- `README.md`: the camera-view window release note. 07 5.2.2 and 08 P2-10: the as-built notes.
- 2.3: `preview-pass.test.mjs` (new), `core.test.mjs` (the Strategies keys; B-M9 and B-L32 landed in 07 R2), `render-layers.test.mjs` (the pass draws inside `withPassHidden`), `camera-hub.test.mjs` (the imports of `PreviewWindow` and `PreviewPass`), `scene-overlays.test.mjs` (its preview section moved to `preview-pass.test.mjs`).

**07 R2-b, the frame tick after 07 R2 (review follow-up of 07 R2)** (manifest `tests/regression/expected/07-R2-b.json`, an invariance gate: documentation, a comment and a unit test):
- 3.12 and 6.12 still described the 07 R1 tick (`sceneManager.render()`, then `sceneManager.withPassHidden(() => preview.render(scene))`); they now name `sceneManager.renderFrame()`, which draws the main pass and then the injected preview pass, as 7 already did. `CameraController.setPreviewEnabled`'s comment no longer says a preview renderer is created on the first enable (it registers the resize handle).
- 2.3: `preview-pass.test.mjs`'s fake renderer starts with a non-black clear colour and alpha, so the restore of the clear colour after the pass is asserted (the bars' black made it unobservable).

**B3-0, the true-framing scenario before 08 P2-11** (docs/improvements/08-bugfix-roadmap.md 6.10, 8.3, AC 40-43; manifest `tests/regression/expected/B3-0.json`: the `p2_true_framing` outputs added, every existing output identical):
- 2.3: `tests/regression/scenarios-phase2.mjs` gains `p2_true_framing`, registered after `p2_project_v2`: the 18-degree half circle of 03 6.6 (Reset, the safe distance, a 90-degree pan), a flat 5 x 3 section turned 90 degrees by its section offset (the wall along +Z: Reset and D, 08 AC 42) and the default wall seen from behind (Pan 180, Z -3). Each state is `cameraState()` plus the `#camera-wall-distance` text; two screenshots show the orbit target, the Reset pose and the frustum. Captured on the build before 08 P2-11, so its baseline documents B-L2, B-M10, B-L33 and the Z minimum of Q13; each P2-11 commit changes it on purpose. The harness README documents it.

**08 P2-11a, the rotation-aware coverage analyser (B-M10's rays)** (docs/improvements/08-bugfix-roadmap.md 6.10, 8.4, AC 40; manifest `tests/regression/expected/P2-11a.json`: the rotated camera states (`camera/cam_{08,09,10}`, `gizmo_drag/camera_02_rotated`, `pilot_look/look_0{1,3}`, `p2_project_v2/camera_01_setup`), the four `p2_true_framing` states and the `#camera-wall-distance` tooltip in seven `ui_visual` text snapshots change; every unrotated state in front of a flat wall is identical):
- 2.2, 3.6: `geometry/FrustumCoverage.js` (new, pure): `analyzeCoverage(layout, pose, lens, extent)` (five rays and the projected-quad overlap over the memoised column quads; D0; the statuses `offWall`, `within`, `offCenter`, `exceeds`; the camera-space corner depths), `cameraBasis`, `nearestHit`, `frameDistance`, `quadOverlapsFrame`, `MAX_FRUSTUM_DEPTH_M`, `FRAME_CORNERS`. `WallLayout` gains `columnQuads()` and `worldVertices()` (memoised per instance, after the postTransform seam), `extentAcross(facing, include)` and `chordFacing()`.
- 3.5: `CineCamera.coverage` is deleted (LEGACY(B-M10) site removed). 3.10: `WallController.currentLayout` (the stage layout of the last rebuild); `CameraHub` takes `stageLayout` and its `coverage()` builds the payload (`fits` and `safeDistance` still from the flat framing bounds until P2-11c). 3.11: `CameraPanel` shows "Not aimed at wall" (exceeds colour, M-COV-1) for `offWall` and "—" for a null distance or frame size; `#camera-wall-distance` is D0 and its tooltip says so. 3.12, 7: `stageLayout = () => wallController.currentLayout`. 5.2: the payload row. 6.3: step 5.
- 8.1: the `framingBounds` row (the coverage rays no longer read it). 8.2: the B-M10 row (the rays landed; `fits` waits for P2-11c); 8.3: the `CineCamera.js#coverage` row is deleted.
- Deviations from 08 6.10, recorded in 08 10 (P2-11 as built): the fourth argument `extent` and the `cornerHits` result; only front-facing quads count for the overlap; s and v accept 1e-9 at column joints; D0's second rule takes the plane of the column the optical axis passes closest to, not the nearest plane of any column (the first gate run showed the nearest plane, of a far column of the half circle, passing 0.07 m in front of the camera and giving a 0.07 m frame).
- `README.md`: the coverage release note and the two "Distance to wall plane" sentences. 03 3.5 and 6.6: as-built notes.
- 2.3: `frustum-coverage.test.mjs` (new); `camera-hub.test.mjs` (the hub's `stageLayout`, the analyser payload, a 90-degree pan, the import list); `domain.test.mjs` (the `coverage()` tests leave; `maxSafeDistance` stays); `pivot.test.mjs` (test 6's consumers without `coverage()`, the analyser's distance to the moved wall).

**08 P2-11b, the frustum ends at the wall (B-L33 landed)** (docs/improvements/08-bugfix-roadmap.md 6.10, AC 41; manifest `tests/regression/expected/P2-11b.json`: the canvas screenshots that show the camera rig change; every state, export and label is identical):
- 3.7 `CameraRigView`: `create(cine, cornerDepths)` and `rebuildFrustum(cine, cornerDepths)` build each far corner (TL, TR, BR, BL) of the lines and the fill at its camera-space depth, `(sx * tx * d, sy * ty * d, -d)`, floored at the near plane; without depths every corner is at `MAX_FRUSTUM_DEPTH_M` (15 m, the legacy rig bit for bit). `CameraRigView.MAX_FRUSTUM_DEPTH_M` is `FrustumCoverage.MAX_FRUSTUM_DEPTH_M`. 3.10, 6.3: the hub analyses first (pure, PR7) and passes the analyser's `cornerDepths` to `create` and `rebuildFrustum`; the payload is the same analysis.
- 3.3, 8.1: `Strategies.frustumDepthM` is retired (its row deleted). 8.2: B-L33 `Landed in 08 P2-11b`; 8.3: the `CameraRigView.js#rebuildFrustum` row is deleted. 08 10: the P2-11b as-built note (the near-plane floor; `#farSlots` and `updateFrustumDepths` stay with P2-12c).
- `README.md`: the frustum release note.
- 2.3: `scene-overlays.test.mjs` (the far corners of the lines and of the fill at the depths, on 08 6.10's slot lists, within 1e-6 m; the 15 m default; the near-plane floor), `camera-hub.test.mjs` (the analysis first; the depths passed to the rig; the import list), `core.test.mjs` (the Strategies keys; B-L33 landed).

**08 P2-11c, true framing: B-L2 landed, B-M10 and B-L10's Z half completed (03 step F)** (docs/improvements/08-bugfix-roadmap.md 6.10, 4.4, Q13, AC 42, 43; docs/improvements/03-pivot.md 6.6 step F, 4.1, 3.5, tests 19 and 21; manifest `tests/regression/expected/P2-11c.json`: the orbit target on the curved, cornered and mixed walls (the config screenshots, `p2_mixed_content`, `pivot_modes`, `import_edge/iii_weird_mode`, the box-corner `normals_debug` views), Reset facing the wall (`p2_curved_safe_distance`, `p2_true_framing`), concave30's D (2.92 -> 1.88 m in its safe-distance OBJ), Z 0 and -5 kept (`p2_zero_inputs/camera_zero`, `pivot_stage`), and no `min` attribute (the `pivot_stage` states); every flat wall along +X at the identity is identical; check-orientation, check-gltf and a headless Blender import of the concave30 safe-distance OBJ pass):
- 3.6 `WallLayout`: `framingBounds(layout)` (the signature takes the stage layout; memoised per layout) returns `FramingPolicy`'s named boxes (07 C34) `{generativeBox, wallBox, stageExtent, facing, wallZ}`; the fallback for a wall without finite grid vertices is a zero box at the walk's start; `bounds()` is the transformed box of `worldVertices()` (07 C34's `wallBox`; equal to `generativeBounds()` in Phase 2). 3.3, 8.1: `Strategies.framingBounds = 'layout'` (`'flat-pivot'` deleted).
- 3.5: `Wall.flatBounds` is deleted (no reader left). `CineCamera.resetTo(framing)` stands 5 m (`RESET_DISTANCE_M`) in front of the wall along its chord `facing`, level, `rotY = wrapDeg(atan2(facing.x, facing.z))`, looking at `wallBox.center`; `maxSafeDistance(extent)` takes the stage extent `{width, height}`; the posZ rule is `finiteOr(parseFloat(r), r3(ctx.wallZ + 5))` (no minimum, Q13; 03 4.1's step-F form); `translateBy` loses its LEGACY(B-L10) tag. `domain/rules.js` gains `finiteOr` and `wrapDeg` (08 4.4), ahead of P2-8b/c.
- 3.8 `OrbitController.updateTargetPosition`: `generativeBox.center + offset` (LEGACY(B-L2) removed). 3.10: the hub's `fits` and `safeDistance` and `syncSafeDistance`'s `extent` read `stageExtent`; `resetPose` and `setCameraField` read the framing. 3.7 `SafeDistanceView.create({layout, cine, extent})`. 3.11 `CameraPanel`: 03 T4's `#camera-pos-z` `min` mirror and `cameraZMinAttribute` are removed; the Reset mirror writes Z to 1 mm and the rotations to 0.1 degree (`roundTo`, the legacy "5" and "0" unchanged). `index.html`: `#camera-pos-z` loses `min="0.1"`. 3.12, 7: `frameBounds = () => framingBounds(wallController.currentLayout)`. 5.2: CameraPanel no longer subscribes `WALL_PIVOT_CHANGED` / `WALL_REBUILT`. 6.1 step 4, 6.5 Reset, 6.0 PR7.
- 8.2: B-L2 and B-M10 `Landed in 08 P2-11c` / `08 P2-11a ... and 08 P2-11c`; B-L10's Z half noted; 8.3: the rows `Wall.js#flatBounds`, `CineCamera.js#translateBy`, `WallLayout.js#framingBounds` and `OrbitController.js#updateTargetPosition` are deleted. 9: the F3 row (step F landed).
- Deviations from 08 6.10 and 03 6.6, recorded in 08 10 (P2-11 as built) and 03 6.6: the framing returns the named boxes, not the flat `{min, max, center, width, height, facing}` with the flat-pivot fields; `wallZ` is the walk start's z in the layout's frame; the stage extent counts a section without columns; the Reset mirror's display precision. The next unit's whole-wall orientation belongs in the walk, so every box, the facing, the quads and the stage extent follow it.
- `README.md`: the Reset, orbit, Max Distance and Z Position release note. 03: the step-F as-built note.
- 2.3: `frustum-coverage.test.mjs` (the framing: memo and keys, flat walls bit for bit, the pivot translation, 03 test 21's half circle, a 180-degree section (rotY 180, negative Z), the same D along X, Z and 45 degrees with Reset 5 m in front (08 AC 42, 43), Reset under a yaw of the wall, the stage extent without a ceiling section, the no-NaN fallback, `wrapDeg`, `finiteOr`, the Z rule); `pivot.test.mjs` (test 6 for step F; the flat consumers bit for bit); `domain.test.mjs` (the posZ rule, `resetTo`, `maxSafeDistance(extent)`; `flatBounds` gone); `geometry.test.mjs`, `camera-hub.test.mjs`, `pivot-controller.test.mjs` (no min attribute), `gizmo.test.mjs`, `safe-distance-band.test.mjs`, `core.test.mjs` (the Strategies value; B-L2 and B-M10 landed).

**B3-r, documentation follow-up of unit B3 (08 P2-11; review)** (manifest `tests/regression/expected/B3-r.json`, an invariance gate: documentation only):
- 3.6: the FrustumCoverage block (added by 08 P2-11a) was followed by a stray code fence, which inverted every later fence of this document (the headings from `js/geometry/WallMeshBuilder.js` on rendered inside code blocks); the stray line is removed.
- The harness README's baseline fact for `p2_true_framing` records what 08 P2-11a, P2-11b and P2-11c changed, like the other entries of that list.

**F3-O0, the orientation design (03 §12; the owner's request of 2026-10-17)** (manifest `tests/regression/expected/F3-O0.json`, an invariance gate: documentation only):
- `docs/improvements/03-pivot.md` section 12 defines the whole-wall orientation: `WallPivot.orientation = {align: 'center-neg-x' | 'none', yawOffsetDeg}`, the centre point and its normal, the alignment yaw, the frames, the consumers, the rigid re-expression, Reset and the view presets, the exports, the panel block, the rebuild rows F3-6 and F3-7, the tests and the steps F3-O1 to F3-O7; the header, D12, Q7 (answered) and T14 (superseded) follow.
- 1.4 records the planned turn of the stage and export frames; section 9's Feature 3 row records the orientation seam. No served file changes: every output must stay identical.

**F3-O1, the orientation domain (03 §12.4)** (manifest `tests/regression/expected/F3-O1.json`, an invariance gate: nothing calls the new rules yet):
- 3.5 `js/domain/Wall.js`: `OrientationAlign`, `ORIENTATION_ALIGNS`, `YAW_OFFSET_LIMIT_DEG`; `WallPivot.DEFAULT_ALIGN` (`'none'` in this unit), `orientation = {align, yawOffsetDeg}` (replaced by its setters), `setAlign` (`RangeError` outside the enum), `setYawOffset` and `parseYawOffset` (finite, clamped to ±180°, 0.1°, never `orDefault`, −0 normalised, idempotent); `isIdentity`, `clone` and `equals` cover the orientation.
- 4: the `Project.wall.pivot` row names the orientation and its two setters.
- 2.3: `tests/unit/orientation.test.mjs` (03 12.12 test 1); `domain.test.mjs`'s WallPivot defaults gain the orientation.

**F3-O2, the orientation geometry (03 §12.2, 12.3)** (manifest `tests/regression/expected/F3-O2.json`, an invariance gate: the default orientation ('none', 0) gives ψ = 0, so `layoutProject` never turns):
- 1.4: the stage and export frames are x_S = R_y(ψ)(x_L − O) and x_E = R_y(ψ)(x_L − P); the pipeline turns the translated walk (`rotated(ψ)`) before spec 02's section offsets; the orientation bullet records the landing.
- 2.2, 3.6: `geometry/WallOrientation.js` (new, pure): `yawTrig`, `turnXZ`, `azimuthDeg`, `wallCentre`, `alignmentYawDeg`. `WallLayout.js`: `SectionLayout.rotated`, `WallLayout.rotated` (raw walk only), the orientation fields of `resolvePivot` (`align`, `yawOffsetDeg`, `alignYawDeg`, `yawDeg`), `yawShift`, `stageChange`, `layoutProject`'s turn and its `pivot.yawDeg`, and the framing's `wallZ` at the turned walk start.
- 2.3: `orientation.test.mjs` tests 2-4 and the composition contract under a turn (03 12.3: spec 02's stub section matrix built on the turned layout equals the raw one translated and turned).

**04 UV-5a and UV-6, the UV domain and maths (docs/improvements/04-uvs-uv-editor.md 4.1, 5.3, 6.2-6.10)** (an invariance step: no consumer reads a plan yet, `'atlas-pixel-accurate'` stays active):
- 2.2, 3.5: `domain/UvSettings.js` (new): `UvLayout`, `PanelUvMode`, `UvTransform`, `UvSettings` (defaults: Combined layout `'per-section'`, the owner's decision; panel UVs `'section'`; no glTF TEXCOORD_1). `WallSection.uvTransform` is an accessor over a private field with `setUvTransform(t)` (a clone), so `SECTION_FIELDS` keeps the 11 legacy fields (a deviation from 04 4.1, which appends the key; it keeps the legacy-parity tests and `{...section}` copies unchanged). `Project.uv` (constructor default `new UvSettings()`). UV state is session-only: project file v2 and 04 UV-5c have not landed (the owner skipped UV-5c for now).
- 2.2, 3.6: `geometry/UvMapper.js` and `geometry/PixelMap.js` (new, pure); `WallLayout.transformPoint` is exported for `PixelMap.wallPointFromBaseUv`. `WallMeshBuilder`: the `SectionUvPlan` uv option (an identity plan is the `'unit'` writer itself, so identity outputs are bit-identical), `sectionUvs(sl, plan)`, `combinedGrid(layout, atlas, plans)` with the case `'plan'` (default plans: per-section, no transforms), `panelUvs(panel, sl, plan)`.
- 2.3: `tests/unit/uv-mapper.test.mjs`.

**04 UV-7, the per-section Combined layout in the viewport, the section-texture budget, and the viewport half of UV-9** (docs/improvements/04-uvs-uv-editor.md 5.1, 6.4, 6.5, 6.13; Q1, Q17):
- 3.3, 8.1: `Strategies.mesh.viewport.combinedUV = 'plan'` (`'atlas-pixel-accurate'` stays a supported case).
- 6.1 P1 step 2 (04 6.13 steps 2-3): `WallController.rebuild` computes the atlas, `sectionTextureScale(sections)` and `planSectionUvs({layout, atlas, settings: project.uv, meshMode, applyTransforms: !isLedMaskContent(display.content)})` and passes them with `uvSettings` to `LEDWallView.rebuild` (which computes defaults when a caller passes none). The rebuild-observer hook (`addRebuildObserver`) is left to 04 UV-11.
- 3.7: the combined mesh gets one geometry group per section (`addGroup(indexStart, indexCount, i)`); `LEDMaterialFactory.combined(sections, atlas, combinedLayout, sectionScale)` returns a `Material[]` in the per-section layout for panel IDs (slot i = the Section-mode material) and LED sim (slot i = the white tile repeated (cols_i·ledX_i, rows_i·ledY_i) times the vertex colours); colour content keeps one vertex-colour material. Section mode and panel mode take their UVs from the plans (the UV transforms apply; LED-mask content keeps base UVs). Every section canvas of the viewport follows `TextureAtlas.sectionTextureScale` (16 MP, 04 Q17: only `large_wall` among the harness walls is reduced, 3 -> 2 px/LED). With `uv.panel_uvs = 'panel'` panel mode with panel IDs draws the per-panel canvases at the wall-wide `panelPxPerLed` with the PlaneGeometry's own UVs. `disposeObject3D` de-duplicates by identity.
- 3.12: until 04 UV-14 adds the sidebar UV options, `App` reads `?uv_layout=atlas` and `?panel_uvs=panel` from the URL query into `project.uv` (session-only).
- LED simulation in panel mode keeps one material per panel with the per-panel UVs (as 08 P2-12d landed; 04 6.5 assumed section-space LED-sim UVs), so `toggles/06_ledsim_panel` does not change.
- 2.3: `uv-mapper.test.mjs` (`sectionTextureScale`), `materials.test.mjs` (per-section slots, the single-section LED-sim equality with the atlas material, groups and per-section 0..1 islands on the combined mesh); the fake geometries of `led-wall-view`, `scene-overlays` and `materials` tests gain `addGroup`.

**04 UV-8a, UV-8b and the export half of UV-9: exports from the UV plans** (docs/improvements/04-uvs-uv-editor.md 7.1-7.5, D5, D6, D9, Q3, Q9):
- 3.3, 8.1: `Strategies.mesh.obj.combinedUV = 'plan'` and `Strategies.mesh.gltf.combinedUV = 'plan'` (`'atlas-pixel-accurate'` stays a case of both).
- 3.9 `ObjExporter.write({..., uvSettings, uvPlans})` and `GltfExporter.write({..., uvSettings, uvPlans, textures})`: the export plans are `planSectionUvs(..., applyTransforms: true)` of `uvSettings` (default: the defaults) unless the caller passes them. OBJ `vt` and glTF TEXCOORD_0 (t = 1 − v) are the plans' UVs in every mode: combined per-section 0..1 (or atlas-placed), section mode the section's transformed 0..1 (identity bytes unchanged), panel mode the section-space panel corners (`vt` toFixed(6); `uv.panel_uvs = 'panel'` keeps the literal `vt 0 0 / 1 0 / 1 1 / 0 1` and glTF `PANEL_UVS`). MTL `map_Kd` (04 7.1): the section's shipped texture in section mode, combined per-section and panel section space; the atlas in the combined atlas layout; nothing for per-panel UVs or a left-out texture. The ZIP glTF (`textures: {sectionFiles, atlasFile}`) follows the same rules: one sampler `{9729, 9987, 33071, 33071}`, one image per distinct file (relative URI), one texture per image, `baseColorTexture` with a white factor and `KHR_materials_unlit` on each textured material, `extensionsUsed: ['KHR_materials_unlit']` iff any (never `extensionsRequired`); the standalone glTF stays untextured. `uv.gltfAtlasTexcoord1` adds TEXCOORD_1 (the atlas-layout UVs) to the per-section combined primitives (no UI until 04 UV-14).
- 3.10 `ProjectIO`: both exporters get `uvSettings: project.uv`. Export OBJ (ZIP) ships exactly what its MTL references (`#mtlTextureRefs`): the section textures in section mode, combined per-section and panel section space, the atlas in the combined atlas layout. Export All (ZIP) still ships every texture and the atlas; its glTF gets `textures` and is re-written with the MTL when a texture is left out late.
- Deviation from 04 8.3: the panel-mode MTL of both ZIPs now maps the section textures (04 7.1's rule for section-space panel UVs; 8.3's manifest rows had listed every MTL as unchanged by UV-8a and UV-9), and the Export OBJ ZIP of panel mode ships those textures.
- 2.3: `io.test.mjs` (the oracle writers use the per-panel UV option; plan-based OBJ and glTF UVs, panel `vt`, the ZIP texture rules, TEXCOORD_1, a transformed section's t = 1 − v, the use cases of both archives, the golden files under the new rules).
- Re-baseline (UV-7..UV-9, one full run): screenshots `{mixed, box_corner, large_wall}/panel_ids_combined` and the `p2_mixed_content` panel-ID shot change (per-section textures; `large_wall` at the budgeted 2 px/LED), `flat3` and `concave_offsets` stay within tolerance, every single-section, LED-sim, Section- and Panel-mode screenshot is unchanged; the combined OBJ ZIPs ship the section textures instead of the atlas; panel-mode OBJ ZIPs gain the section textures; combined (multi-section) and panel-mode OBJ / glTF UVs; every Export All ZIP's glTF gains its textures. The `ui_visual` `mesh-mode-option/input` border-radius rows were already stale in the previous baseline (an A/B run of d6bf8d2 shows them too). The harness README notes a web-font glitch that can disturb a whole run.

**04 UV-10 to UV-16: the UV viewer and editor, path B** (docs/improvements/04-uvs-uv-editor.md 3, 5.2-5.6, 6.9, 6.11, 6.12, 8.2; the owner's decisions: spec 07's keymap, global history, selection v2 and preferences do not exist, so the path-B fallbacks are built; UV-5c, UV-17 and UV-18 are not):
- 2.1: `css/features/floating-panel.css` and `css/features/uv-viewer.css` (new, linked after `pivot.css`, before `12-responsive.css`); `debug-view.css`'s column overflow thresholds rise by 48 px for `#toggle-uv-viewer` (492 / 842, 01 CR-7). `02-tokens.css` gains the `--uv-*` canvas tokens; `Theme.uv` (`UvViewerTheme`) and its `COLOR_BINDINGS` / `FONT_BINDINGS` rows.
- 2.2, 3.7: `LEDWallView.updateSectionUvs` (the live path of 04 6.12: one section's UVs rewritten in place, the combined range through `updateRange`, widened to the union with a pending range; a no-op for LED-mask content), `resolveHit` and `panelCornersWorld` (6.9), `sectionNodes().vertexRange`; panel meshes are tagged `sectionUvs`. `render/UvHighlightView.js` (new, UV-15). `LEDPixelTextureFactory.tileCanvas`.
- 2.2, 3.8: `SelectionManager.addObserver` / `addHoverHitObserver` (the path-B form of 07 I2: observers after every `select` / `deselect`, after the gizmo; the hover-hit list is inert until spec 02's `hoverAt`); `ViewportInput` gains `commands.toggleUvViewer` (U, guarded like G/R/L/P and never in pilot mode; no existing key clashes) and `handlesDoubleClick` (false); `interaction/WallHoverProbe.js` (new, own-raycast mode, UV-15).
- 2.2, 3.10: `app/UvController.js`, `app/UvViewModel.js`, `app/UvFallbackHistory.js` (new). `WallController.addRebuildObserver`: P1 step 5b and `commitRename` (6.1).
- 2.2, 3.11: `ui/FloatingPanel.js`, `ui/UVViewer.js`, `ui/UVCanvas.js` (new; the panel's keydown listener is path B's declared key scope of 04 3.6); `WallDisplayPanel` owns `#uv-options` and mirrors `UV_SETTINGS_CHANGED`, and its `DISPLAY_CONTENT_CHANGED` mirror also sets the toggled control's `active` (idempotent after a click; the [Show Panel IDs] chip turns panel IDs on without one); `SectionListPanel` renders the card's UV row and mirrors `UV_TRANSFORM_CHANGED`. The UV listeners are added only when a `UvController` is injected (the legacy parity fixtures have none).
- 3.12, 7: `App` builds `ViewportInput` before the panels (its constructor only stores), then `WallHoverProbe`, `UvViewModel` and `UvController` (registered with `selection.addObserver` and `wallController.addRebuildObserver` before the bootstrap rebuild), `UvHighlightView` after the pivot marker and `UVViewer` with the panels; `uvProbe.attach()` follows `viewportInput.attachPointer()` and `uvViewer.bind()` follows `debugControls.bindShortcuts()`. The `?uv_layout=` / `?panel_uvs=` stopgap of UV-7 / UV-9 is retired: the sidebar options replace it.
- 5.2: `UV_VIEWER_CHANGED`, `UV_DATA_CHANGED` (non-visual), `UV_TRANSFORM_CHANGED`, `UV_HOVER_CHANGED` (UV-12) and `UV_SETTINGS_CHANGED` (UV-14) (visual), each with its subscriber in the same commit. 9: the Feature 4 seam row is amended (observers instead of subscriptions).
- Deviations: the viewer's default size is 380 x 600 (04 3.1's 440 left the canvas at its minimum under the controls; it is still clamped to 90 % of the viewport and shrunk above the preview window); `#uv-units` is a select; the chip "▲ Resampled · offset between source pixels" covers a 100 % scale with a sub-pixel offset; the 04 8.2 screenshot pairs are judged inside the scenarios (no `tools/pair-diff.mjs`); `uv_transforms` sets its transforms in the viewer (no v2 import).
- 2.3: `tests/unit/uv-controller.test.mjs`, `led-wall-view-uv.test.mjs`, `floating-panel.test.mjs`, `wall-hover-probe.test.mjs` (new); `wall-controller.test.mjs` declares the card's UV row as a template edit; `core.test.mjs` the five events and `Theme.uv`. `tests/regression/scenarios-uv.mjs` (new): `uv_layouts`, `uv_transforms`, `uv_viewer`, `uv_hover`.
- Re-baseline (one full run, 40 scenarios, no errors): every section card's text gains " UV Mapping Identity Edit UVs…" and its button list the Edit UVs… button (the config scenarios, `ui_sections`, `import_edge`, `p2_xss_names`, `p2_zip_section_mode`, `p2_zero_inputs`); `ui_visual` (the UV Mapping subsection title, taller cards and sidebar, the toolbar column 48 px taller, its page screenshots); `preview_compositing` (page screenshots, and the mirror probe's pixel count, whose overlay mask now includes the new button); every viewport screenshot within tolerance, its pixels over 8 levels in the toolbar column (the new button); plus the four `uv_*` scenarios. No export, console or dialog output changed. The browser moved from Chrome 156.0.8078.48 to .79 between the two captures (1-level glyph differences in overlays and texture PNGs, within tolerance). A headless Blender 5.2 import of `uv_transforms`' Section-mode OBJ ZIP and glTF gives the expected UV ranges (Right: u 0.5-1, v 0.25-0.75), loads the three section textures and warns about nothing.

**Centre on +X and the combined-canvas TEXCOORD_1 (the owner's requests of 2026-10-31; reference `BlenderReference/LED_Wall_Gen.blend`, local only):**
- 03 12.16: `OrientationAlign.CENTER_POS_X` (`'center-pos-x'`, "Centre on +X (LED faces −X)"), first in `ORIENTATION_ALIGNS` and the `WallPivot.NEW_PROJECT_ALIGN`; `Wall.ALIGN_NORMAL_AZIMUTH_DEG` / `alignNormalAzimuthDeg` give the target azimuth (−90 / 90) that `alignmentYawDeg(layout, targetDeg)`, `resolvePivot`, the framing's `aligned` / `viewYawDeg` (Reset, the default camera, the view presets) and the Pivot panel's read-out use. `rules.quarterExactTrig` (moved from CineCamera) and `Prop.placeInFront`; `Project.createNew` places the person and car in front of the LED face (`NEW_PROJECT_PROPS`); `index.html` starts the select, read-out and prop inputs at the new values. `createDefault` and the class defaults are unchanged.
- `UvSettings.gltfCanvasTexcoord1` (renamed from `gltfAtlasTexcoord1`, JSON `gltf_canvas_texcoord1`; default **on**): `GltfExporter` writes TEXCOORD_1 on every primitive of every mesh mode, in Export glTF and the ZIP glTF, whenever the profile writes TEXCOORD_0: `UvMapper.combinedCanvas` (x_i = Σ_{j<i} w_j, w_i = panelCols·ledX, h_i = panelRows·ledY, W = Σ w_j) and `canvasUvs` (u1 = (x_i + u0·w_i)/W, v1 = v0·h_i/W) applied to the section-space UVs after the UV transform (section-mode plans; panel meshes their section-space corners, whatever `panel_uvs` says), stored t = 1 − v. It replaces 04 7.3's optional atlas TEXCOORD_1 (combined per-section only). `#uv-gltf-uv1` keeps its id, is checked and always enabled; OBJ keeps UV channel 0. `tools/check-gltf.mjs` checks TEXCOORD_1 like TEXCOORD_0.
- 2.3: `orientation.test.mjs` (12.16), `io.test.mjs` ("glTF TEXCOORD_1: the combined canvas"), `uv-mapper` / `uv-controller` tests follow the rename; the harness re-baselines once (the default yaw, camera, props and views; every glTF gains TEXCOORD_1).

**UV editor: fixed canvas size, per-vertex editing and the UV2 view (the owner's requests of 2026-10-31):**
- The viewer's canvas changes size only with the panel: the readout reserves three lines (`white-space: pre`, clipped with an ellipsis, the full text as its title), the status chips two lines on their own row (more scroll inside), the hint three lines (clamped, one text per edit mode); undo / redo moved beside the presets; the Island and Vertices rows share one grid cell (`.uv-swap`, the inactive pane `visibility: hidden`). The default height is 380 x 660.
- Data model: `UvSettings.UvVertexEdits`, a sparse map from a vertex of the (panelCols + 1) x (panelRows + 1) panel-corner grid (key = row * (cols + 1) + col) to a delta in the island's BASE space, so uv = T(base + delta) and island moves, scales, rotations, flips and the presets keep the edits; bound to the grid size it was made for. `WallSection.uvVertexEdits` / `setUvVertexEdits` (a clone; null for none; not a SECTION_FIELDS key, so copies start without edits). Session-only like the transform.
- `UvMapper`: every plan carries `deltas` (the edits under the transform's conditions, identity or not, and only for the matching grid size); `sectionGridUv(plan, col, row, cols, rows)` writes every grid UV (WallMeshBuilder's grid writer and `panelUvs`, whose shared corners therefore move together; the viewer grid), bit-identical without edits; `vertexDeltaAt` / `warpBaseUv` / `unwarpBaseUv` (the BL-TR triangles of the strip meshes) serve the hover readouts (`PixelMap.describeHit`, `UvController.probeUv`); `uvDeltaToBase` converts canvas drags through the inverse of T's linear part. The viewport live path, the three mesh modes, OBJ, glTF (TEXCOORD_1 is derived from the edited UV0) and the ZIPs follow through the plans; per-panel UVs and LED-mask content ignore the edits.
- `UvController`: `setEditMode`, `selectVertices` / `selectAllVertices` / `clearVertexSelection` (no history), `begin/update/end/cancelVertexDrag` (the grabbed vertex snaps to whole source pixels; Alt free; Shift a tenth of the travel), `setVertexUv` (one vertex: its value; several: the centroid), `nudgeVertices`, `resetSelectedVertices`, `resetAllVertexEdits`; one 'vertices' history entry per commit (`UvFallbackHistory.prune(keep(id, entry))`); `onWallRebuilt` drops edits whose grid size changed, with a notice chip, and prunes their history states. `UvViewModel`: `editMode` (in UV_VIEWER_CHANGED), the selection (`mergeSelection`), one-off notes, `data.vertices` {edited, selection, selectionUv}; the bounds use the edited grid; an exact transform with edits reads "▲ Resampled · n edited vertices". `UVCanvas`: vertex handles, the selection box, polyline wireframe (`nearestPoint`, `pointsInBox`). `UVViewer`: the Edit switch, Vertex U / V (UV or px), Reset selected / Reset all vertex edits, the gestures, Ctrl/⌘+A and Escape anywhere in the panel but a field, arrows nudging the selection.
- UV2 in the viewer: the Space buttons became one channel select (`#uv-viewer-channel`: UV1 · Section (0–1), UV1 · Atlas, UV2 · Combined canvas; `UV_SPACES` gains 'canvas'). `UvViewModel` computes `data.canvasView` {W, stripV = totalLedY / W, the panel-ID atlas canvas, islands in wall order (`gridOutline` of each section's TEXCOORD_1 grid: `UvMapper.combinedCanvas` / `canvasUvs` of the section-space plans, exactly the exporter's), the viewed section's grid, island frame and canvas entry} and UV2's own chips (it follows UV1 and is TEXCOORD_1 / UVMap.001, OBJ has UV1 only; not exported while `gltfCanvasTexcoord1` is off). `UVCanvas` draws it read-only (the atlas in its strip, outlines, labels, the current section highlighted, the wall hover mapped onto the canvas); the View options read Auto / Texture / Square (UV) so the channel and View selects share one bar.
- 2.3: `tests/unit/uv-vertex-edits.test.mjs` (new; its UV2 test compares the viewer's canvas positions with the exported TEXCOORD_1).
- Re-baseline (one full run, 40 scenarios, no errors; `uv_viewer` re-captured once after a hint wording change): `ui_visual` (the page button list: the Space buttons became the Edit switch and the vertex reset buttons), `uv_transforms` and `uv_viewer` (the canvas is 210 px tall instead of 181 in the 380 x 660 panel, so the island's screen corners change, and with them the result of `uv_viewer`'s screen-pixel corner drag and its OBJ export; the viewer screenshots). Every other export, console and dialog output is unchanged. A headless Blender 5.2 import of a Section-mode glTF with four moved vertices (a rotated, scaled, source-rotated and curved section included) reads the expected UVMap and UVMap.001 values at every loop of each moved vertex (max error 3e-8).

**Collapsible side panel (the owner's request of 2026-10-31):**
- 2.1: `css/features/sidebar.css` (new, linked after `uv-viewer.css`, before `12-responsive.css`). Markup: the aside is `#control-panel`; `#sidebar-toggle` (a native button, `aria-controls="control-panel"`, `aria-expanded`, title "Hide side panel" / "Show side panel") follows `#three-canvas` inside `.viewport`, so it stays reachable while the panel is hidden. No keyboard shortcut.
- 2.2, 3.7, 3.11: `ui/SidebarToggle.js` (new; owns both ids; open by default, session-only, no events). `SceneManager.fitContainer()` resizes only when the container's client size differs from the renderer's (never for a 0 px container); `observeResize()` adds one `ResizeObserver` (looked up on `win` at call time) on the viewport, so the renderer, the camera aspect and the preview region follow the panel; `FloatingPanel's` own observer re-clamps the UV viewer. App calls `fitContainer()` on every toggle and `observeResize()` after `uvViewer.bind()`.
- 2.3: `tests/unit/sidebar-toggle.test.mjs` (new).

**Wall section selection and the section menu (the owner's request of 2026-10-31; the single-selection part of spec 02 3a without offsets, batch editing, hover or a section gizmo):**
- Input (3.8 `ViewportInput`): a CLICK selects, a press and release of the same button whose pointer never travelled `CLICK_SLOP_PX` (4 px); the press is recorded on mousedown (with whether the gizmo or the B-M14 pick took it: `pickAt` now returns whether it hit), its travel on mousemove, and the canvas mouseup runs `#release` after `gizmo.onMouseUp()`; the window mouseup forgets it. Left click: `SelectionManager.hitAt` (the registered pick meshes and the providers' meshes raycast together, chosen by `#choose`, so camera, props and pivot keep their priority) selects a section, or deselects on empty space; right click on a section: select, then `commands.openSectionMenu`; nothing in pilot mode; a canvas `contextmenu` listener suppresses the browser menu (right-drags still orbit, the orbit listeners take any button). B-M14 is unchanged for legacy targets; a mousedown miss keeps a selected section, so an orbit drag never deselects one. The wall double-click (`WallHoverProbe`) is unchanged.
- 3.8 `SelectionManager`: `registerProvider` (spec 02's PickProvider: `isPickable`, `pickMeshes`, `resolveHit`, `find`), `find` through the providers, `kindOf` of a provider's Selectable, `hitAt`, `prune`. The SELECTION_CHANGED payload is unchanged (`{id, label, modes}`; a section has `modes: []`, and the badge adds no "(translate only)" suffix then).
- 3.10 `app/SectionSelection.js` (new): the provider over `wallView.meshes()`, resolved by `LEDWallView.sectionOfHit` (3.7; `sectionOfWallHit`: the combined mesh's face ranges, i.e. its geometry groups, and the section / panel mesh tags); section Selectables (`'section:' + String(id)`, core/sectionIds.js; label = the name; `allowedAxes` null in both modes, so G and R build no handles); a rebuild observer: `prune()` after every rebuild and rename (a deleted section is deselected, a renamed one re-announced for the badge), `deselect()` after an import.
- 3.7 `render/SectionHighlightView.js` (new): the tint (depth-tested, no depth write, polygon offset, not raycast) and the two-tone outline over `layout.worldVertices()` of the selected section, re-resolved by id on every `WALL_REBUILT`; a HELPERS helper (never in the preview, the pilot view or the exports); allocated on the first section selection only. Theme: `SceneTheme.selection` ({color, haloColor, fillOpacity, dashSize, gapSize}, 06 5.12's values) with `--scene-selection` and its `COLOR_BINDINGS` rows.
- 3.11: `SectionListPanel` mirrors `SELECTION_CHANGED` (`is-selected`, `aria-current`; re-applied after every render) and gains `revealSection(id)`; `ui/SectionContextMenu.js` (new) and `css/features/section-selection.css` (new, after `sidebar.css`); "Change settings" = `sidebar.expand()` + `revealSection`, "Edit UVs…" = `uvController.openViewer(id)`. The UV viewer follows a selected section through its existing selection observer (04 5.3) unless pinned.
- 2.3: `tests/unit/section-selection.test.mjs` (new); `core.test.mjs` lists `SceneTheme.selection`.
- Re-baseline of both 2026-10-31 changes (one full run, 40 scenarios, no errors; 39 passed, 1 failed): `ui_visual` fails only on its page button list (`#sidebar-toggle` joins it after `#three-canvas`); every computed-style record, state, text, export and console output is unchanged apart from the known 1-level `L4_PanelIDs.png` flake. The canvas, page and viewport screenshots warn within tolerance: the handle on the viewport's left edge (or its bottom edge at 800 px), plus anti-aliasing changes of up to 85 levels on the SVG icons of the overlay buttons, the preview window's title and the UV viewer (the new overlay button changes Chrome's layer assignment, as the watermark did in 06 T4b). No scenario clicks a wall section: the person and camera picks run in a gizmo mode and are taken by the B-M14 pick, and the UV double-click scenario records the same viewer state. A headless check with the harness library: collapsing the panel resizes `#three-canvas` from 1200 x 940 to 1600 x 940 (drawing buffer included) and back, and at 800 px wide from 800 x 490 to 800 x 840.
