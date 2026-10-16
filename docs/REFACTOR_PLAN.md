# Refactor plan: from one HTML file to native ES modules

This is the owner-facing plan for restructuring the LED wall configurator. The binding technical contract is `docs/ARCHITECTURE.md`; this document explains what will happen, in what order, how it is verified, and why this design was chosen.

## 1. Goals

1. **Maintainable structure.** Replace the 5,098-line `index.html` (860 lines of CSS, 3,800 lines of script, about 75 globals, about 120 functions and handlers) with 12 stylesheets and 45 focused ES modules plus an entry point, a composition root and two library shims. Each module has one job, explicit constructor-injected dependencies and documented methods.
2. **Zero behaviour change in this phase.** Every export (OBJ, MTL, glTF, JSON, panel-ID PNG, ZIP), every screen and every interaction stays identical, **including the known bugs**. The golden-master harness proves it.
3. **One-place bug fixes later.** Every output-affecting quirk is isolated behind one named compatibility switch or one tagged site, so each fix in Phase 2 is a small, separately verified change.
4. **Ready for the six planned features** (flipped normals + normals view, section selection and offsets, configurable pivot, clean UVs + UV editor, HDRI projection, Morph branding) without building them now.

## 2. Principles

- **No build step.** Plain files on GitHub Pages; `index.html` loads `js/main.js` as a module. three.js r128 and JSZip 3.10.1 keep loading from the same cdnjs URLs as classic scripts; modules reach them only through `js/vendor/three.js` and `js/vendor/jszip.js`.
- **Verbatim first.** Code is moved, not rewritten: every expression that affects an output is copied character for character. Only identifiers change.
- **Explicit order.** Anything whose order matters (the wall rebuild, the camera hub, every user action) is a sequence of direct method calls you can read top to bottom. A small event bus only keeps the DOM in sync (badges, readouts, input values), at exactly the moment the old code wrote them.
- **Pure core.** Domain objects, geometry and file writers have no three.js and no DOM, so they are tested in plain Node against the real exported files.
- **Nothing speculative.** Feature seams are cheap data (bounds, pivot points, mesh tags) and empty hooks, not unused frameworks.

## 3. Target structure (summary)

| Layer | Folder | What lives there |
|---|---|---|
| Entry and wiring | `js/main.js`, `js/app/App.js` | Builds every object and runs the original start-up order: `init()`, then `setupUI()`, then `setView('reset')`. |
| Use cases | `js/app/` | `WallController` (all wall edits and the rebuild), `CameraHub` + `CameraController` (camera preview, lens, pose), `PropController` (person, car), `ProjectIO` (exports, import). |
| User interface | `js/ui/` | One panel class per sidebar area plus the viewport toolbar. Panels call controllers and mirror state; they own their DOM ids. |
| Interaction | `js/interaction/` | Orbit camera, keyboard state, the shared pick ray, the selection registry, the transform gizmo, pilot mode, canvas and shortcut routing. |
| Rendering | `js/render/` | Scene/renderer/grid, the LED wall view, materials, LED-pixel and panel-ID textures, camera rig, safe-distance floor, preview window, props. |
| File formats | `js/io/` | JSON v1 serializer, OBJ/MTL and glTF writers. |
| Geometry | `js/geometry/` | The single wall layout walk, the single mesh builder (winding, normals, UVs), texture-atlas bookkeeping, naming. |
| Domain | `js/domain/` | `Project`, `Wall`, `WallSection`, `CineCamera`, `Prop`, `LogoLibrary`, display and panel-ID settings. |
| Shared | `js/core/`, `js/legacy/`, `js/theme/`, `js/vendor/` | Event bus; the legacy compatibility registry; every scene/canvas colour, font and export string; library shims. |
| Styles | `css/01-reset.css` ... `css/12-responsive.css` | The original stylesheet cut into 12 consecutive slices, linked in order. |

## 4. Decision record

### D1. Native ES modules, no build step, no npm runtime dependencies
Decided with the owner. The page stays a static site on GitHub Pages. Consequence: opening `index.html` from disk (`file://`) no longer works; local development needs a static server (section 8). All paths are relative so the Pages sub-path works, and a static check enforces exact file-name case because Pages is case-sensitive and Windows is not.

### D2. Keep three.js r128 for now
The refactor must reproduce today's pixels and draw order exactly, which depends on r128 internals. Upgrading three.js is a separate, later decision; the vendor shim makes switching to an ES-module build (importmap) a one-file change. Features 1 and 5 may load r128 `examples/js` helpers (VertexNormalsHelper, RGBELoader, GLTFLoader) through the same shim pattern.

### D3. Behaviour-preserving refactor with a legacy compatibility registry
Known bugs are not fixed in Phase 1. Each output-affecting quirk is either a switch in `js/legacy/LegacyCompat.js` (`Strategies`, for example `mesh.viewport.winding = 'legacy-cw'`) or a single site tagged `// LEGACY(B-xx)`, and every site is listed in `LEGACY_SITES` and in ARCHITECTURE.md section 8. A static check keeps the tags and the register in sync.

### D4. Architecture choice
Three complete proposals were written and scored by three independent reviewers against the code (behaviour preservation, maintainability, feature readiness, parallel implementability, simplicity):

| Proposal | Idea | Total score |
|---|---|---|
| Domain model (chosen base) | Rich domain objects (`WallSection`, `CineCamera`, `Prop`, ...) paired with views; ordered side effects as explicit pipelines; a small bus for mirrors only | 117 |
| Store driven | One observable store, typed actions, a two-phase event bus, a declarative rebuild-policy table | 114 |
| Incremental extraction | Mechanical move of the script, then an `AppContext`, then carving into files, then classes | 114 |

**Why the domain model won.** It gives the best structure for the six features (selectable objects, a content-mode enum ready for HDRI, a single texture-atlas source for clean UVs, a single winding function whose flip fixes both the viewport and the exports) while keeping order-sensitive behaviour as plain sequential calls, which is the lowest-risk runtime design that still gives real object structure. The store-driven design routed every click through actions, events and subscribers, which added the most indirection and the largest surface for subtle reordering. The incremental design preserved behaviour best but left business sequencing inside UI panels and needed a long transitional scaffold.

**What was grafted from the other proposals:**
- From *store driven*: the CSS split as **contiguous slices in original order** (identical cascade by construction); extending the golden master **before** refactoring (logos, gizmo drag, pilot look, preview-off-in-pilot, import edge cases, per-keystroke rename, preview resize); the 24-row rebuild-policy table with a spy unit test; a verbatim legacy "oracle" for differential tests; explicit `init()` instead of side-effecting constructors; mirror events instead of controllers calling panels, giving the observable layer that Features 2 and 4 need.
- From *incremental extraction*: the verbatim-first discipline and a separate delivery checkpoint (step I-1 runs the untouched script as a module before any logic moves); byte-identical (not merely 1e-5) export gates; the exact index association `(base + row * vertsPerRow) + col`; `PilotCameraDriver` split from `PilotController` (no circular dependency); a `selectable:moved` event so camera and props do not hold the gizmo; `SceneManager.addHelper` + `LAYERS` as the helpers-layer seam; one shared pick ray as in the original; FOV readouts written at the original point (twice on first enable); `framingBounds()` as the single flat-bounds switch; `tests/static/check.mjs`; deferring texture and gizmo disposal to separate post-refactor commits.

**Errors the reviewers found and how this design fixes them:**

| Found in | Error | Fix in this design |
|---|---|---|
| domain model, store driven, incremental | CSS split claimed "original order" but reordered rules across files | 12 contiguous slices + `tests/static/css-slices.mjs` proves concatenation equals the original |
| domain model | glTF strategy `doubleSided: false` would emit a key legacy never writes | `doubleSided: 'omit'` (no key) |
| domain model, incremental | texture and gizmo disposal in Phase 1 (gizmo disposal can change WebGL program ids and so draw order) | `Strategies.dispose.*` stay false; flipped in Phase 1C, one commit each, reverted on any diff |
| all three | the flattened safe-distance edge list would throw on an empty wall (`sections: []` import with safe distance on) | `WallLayout.flatEdges()` returns `[]`; the empty group is still added; the new `import_edge` scenario covers it |
| store driven | OBJ faces computed as `(index + 1)` would re-associate floating-point sums for fractional columns | the builder takes `indexBase` and computes `indexBase + row * vertsPerRow + col` exactly |
| store driven | new card expanded by index instead of by id | restore uses strict `section.id === addedId`, like the original |
| store driven | ambiguous cumulative-column value | `TextureAtlas.entries[i].startCol` is defined as the value *before* adding the section, with raw `+=` |
| store driven | construction graph had cycles | the only cycle (pilot <-> camera hub) is removed by `CameraHub` + `PilotCameraDriver`; construction order is fixed in ARCHITECTURE.md section 7 |
| store driven | debug-only assertions without a build | the event bus always throws on unknown names; rules are enforced by the static check |
| domain model | import flow read the mesh mode from raw JSON while the serializer also returned it | `ProjectSerializer.read` returns `{sections, meshMode}`; only that is used |
| domain model | prop gizmo follow ran after `scene.add` | `create -> applyTransform (incl. gizmo follow) -> addToScene`, the original order |
| domain model | dropped the duplicate FOV readout | kept |
| domain model | controllers called UI panels directly | controllers emit mirror events; panels subscribe; no app -> ui imports |
| incremental | dropping the duplicate stats update in the number handler (observable if the rebuild throws) | kept |
| incremental | both 4K warning markups merged into one string | both kept verbatim |
| incremental | prop gizmo anchor lacked the original existence check | `hasGizmoTarget()` mirrors the original gating |
| incremental | frozen theme could not take overrides | the theme is injected; Feature 6 injects a new object of the same shape |
| incremental | B-L31 missing from the quirk tables | listed |

## 5. Phases

### Phase 0: safety net (work package WP1)
1. Capture the golden-master baseline from the pristine `index.html@cd3fd3f`, twice, and confirm the two runs agree.
2. Extend the harness with seven deterministic scenarios that cover today's blind spots: `logos`, `gizmo_drag`, `pilot_look`, `preview_off_in_pilot` (B-H4), `import_edge` (B-L8 and the empty-wall case), `name_with_panel_ids`, `preview_resize`. Re-capture the baseline.
3. Add `tests/static/check.mjs` (layering, DOM-id ownership, file-name case, LEGACY parity, `Strategies` references, event usage, no module-level state, domain-field writers) and `tools/serve.mjs` (a local static server).

### Phase 1: structural refactor (no behaviour change)
**1A. Parallel module build (WP2-WP9, in the waves of section 7).** Each work package creates its own files from the original line ranges against the signatures in ARCHITECTURE.md:

| WP | Scope |
|---|---|
| WP2 | CSS split into 12 slices |
| WP3 | Foundation: vendor shims, event bus, legacy registry, theme, domain model, DOM helpers |
| WP4 | Geometry: layout walk, mesh builder, texture atlas, naming (+ verbatim oracle tests) |
| WP5 | IO: serializer, OBJ/glTF writers, export/import use cases, export panel (+ golden-file tests) |
| WP6 | Wall rendering: scene manager, wall view, materials, LED tiles, panel-ID canvases |
| WP7 | Stage: camera rig, safe distance, preview window, props, camera and prop controllers and panels |
| WP8 | Interaction: orbit, keyboard, selection, gizmo, pilot, input routing, viewport toolbar |
| WP9 | Wall controller and the section, logo, display and header panels |

Pure layers (domain, geometry, io and the app controllers) are verified in Node before anything is wired: exporters must be byte-identical to the baseline files for the default wall and the six harness configurations in all three mesh modes.

**1B. Integration (WP10)**, in checkpointed commits:
- **I-1 Delivery switch:** link the 12 stylesheets and run the *original* script, unchanged, as a module (`js/legacy/monolith.js`). The full harness must be identical. This isolates any CSS or module-loading surprise before logic moves.
- **I-2 Composition root:** replace the monolith with `App.js` wiring every module in the documented order; delete the monolith. Full harness identical.
- **I-3 Hardening:** static checks clean, two full harness runs identical, manual side-by-side checks, README updated.

**1C. Non-observable clean-ups**, one commit each, each followed by a full harness run and reverted on any difference:
- **H1** dispose wall textures on rebuild (B-H5: memory only) by setting `Strategies.dispose.wallTextures = true`. **Landed.** The tracker of `LEDWallView` now disposes the old wall's material maps (panel-ID `CanvasTexture`s and LED tile clones; each map belongs to one material, and the tile cache masters are never placed on a material, so they stay cached). Unit and static gates green; the full harness (`tests/regression/output/h1`) passed against the baseline with the same 13 WARNs as the accepted integration gate, every differing pixel a documented 1-level overlay-glyph flip, and no other difference. B-H5 left `LEGACY_SITES` (its 8.2 row is kept and marked landed).
- **H2** dispose gizmo resources (B-L12) by setting `Strategies.dispose.gizmo = true` (watch the `keyboard` screenshots: freeing materials can change WebGL program ids and so draw order). **Landed** (on top of H1). `TransformGizmo.rebuild/detach` now dispose the replaced or removed group's geometries and materials. Unit and static gates green; the full harness (`tests/regression/output/h2`) passed against the baseline with 12 WARNs, every differing pixel a documented 1-level overlay-glyph flip; the `keyboard` and `gizmo_drag` screenshots show no other difference, so no draw order changed. B-L12 left `LEGACY_SITES` (its 8.2 row is kept and marked landed).

### Phase 2: bug fixes (each one separately re-baselined)
Each fix flips one switch or edits one tagged site, updates `LEGACY_SITES`, and re-captures only the affected harness outputs in its own commit. Suggested order (bug ids from the verified defect list, `docs/DEFECTS.md`):
1. **B-H1 + B-H2** inverted winding and wrong/missing normals in the viewport and every export (the owner-reported "inverted normals"; this is the core of Feature 1).
2. **B-M4 + B-L8** unescaped names in HTML and unvalidated imports (security and robustness): real `legacyHtml` escaping and a `ProjectValidator` inside `ProjectSerializer.read`.
3. **B-H3 + B-L4** glTF/ZIP export failing on large walls; canvas-size guard and user-visible error messages.
4. **B-H4** stuck pilot mode when the preview is turned off; **B-M8** stale safe-distance floor.
5. **B-M1** safe-distance OBJ download (with **B-L29** face orientation, since the file becomes reachable).
6. **B-M3**, **B-M2 + B-L14 + B-L7** export consistency (ZIP JSON offsets, texture names, MTL delivery).
7. **B-L20** (unbounded LED tile cache). B-H5 and B-L12 landed in Phase 1C (H1, H2).
8. Interaction: **B-M12, B-L28, B-L22, B-L23** (gizmo), **B-M13, B-L27** (movement), **B-M14** (select on click), **B-L11, B-L25, B-L26**.
9. Preview: **B-M9, B-M11, B-L32, B-L33, B-L34**.
10. UVs and export completeness: **B-M5, B-M6, B-M7, B-L6, B-L5** (prerequisite for Feature 4).
11. Bounds: **B-M10, B-L2, B-M15** (together with Feature 3).
12. The rest: **B-L9, B-L10, B-L15, B-L16, B-L17, B-L18, B-L19, B-M16, B-L21, B-L31 (JSON v2), B-L35, B-L36, B-L24, B-L13, B-L3**, and the **B-L1** curve-convention decision (changes every curved export; owner decision first).

### Phase 3: features
Suggested order: **1** normals debug view (after the B-H1/B-H2 fix), **6** Morph branding (independent; can run any time after Phase 1), **3** configurable pivot, **2** section selection and per-section offsets, **4** clean UVs and the UV viewer/editor, **5** HDRI projection and the reflective car (needs the single-renderer preview and the helpers layer). ARCHITECTURE.md section 9 lists, per feature, what already exists after Phase 1 and what the feature adds.

## 6. Verification strategy

| Gate | What it proves | When |
|---|---|---|
| Golden master (`tests/regression`) | Every export, DOM state, dialog, console error and screenshot equals the original (`console.warn` is not recorded; screenshots allow only the documented 1-level overlay-glyph jitter, ARCHITECTURE.md 10), across 19 scenarios including computed styles and full-page UI screenshots | baseline in Phase 0; every checkpoint and merge in Phases 1-2 |
| Unit tests (`node --test "tests/unit/**/*.test.mjs"`) | Rule tables, layout, mesh builder, atlas and naming equal a verbatim copy of the old code (`Object.is` on every number over hundreds of random walls, including string and fractional inputs); exporters byte-identical to the baseline files; rebuild counts and camera-hub order with spies | every work package and merge |
| Static checks (`tests/static/`) | Layering, DOM-id ownership, file-name case, no globals, LEGACY register parity, every `Strategies` switch read, event usage, domain-field writers, CSS slices equal the original | every merge |
| Manual checks | WASD/QE orbit and pilot fly (including the inverted vertical), gizmo hover, window resize, preview resize, a GitHub Pages smoke test | end of Phase 1 and before release |

Rules: a failing comparison is never "fixed" by re-capturing the baseline during Phase 1. Baselines change only in Phase 2/3, one intended change per commit.

## 7. Work-package logistics

- Every file belongs to exactly one work package; packages communicate only through the signatures in ARCHITECTURE.md.
- Each work package (`work-packages.json`) lists its dependencies in three fields; only `requiresMerged` is used for scheduling:
  - `requiresMerged`: work packages whose code must already be merged because this package's **own acceptance tests import it** (for example, `tests/unit/geometry.test.mjs` imports the domain classes of WP3). A scheduler starts a package only when all of these are merged.
  - `interfaces`: modules and document sections that the package **codes against by signature only** (injected collaborators, types in JSDoc, static imports that its tests never load). They are never scheduled on. Several of them point both ways (for example, WP7's `CameraController` receives WP8's `SelectionManager` and `PilotController`, while WP8's gizmo drives `CameraController` through the `Selectable` typedef that WP8 defines), so treating them as scheduling edges would deadlock.
  - `requiresArtifacts`: generated local data that is not committed (the golden baseline under the git-ignored `tests/regression/output/`); it is produced by a documented command, not by merging a package.
- Waves (each wave starts when the previous one is merged):

| Wave | Work packages | Why |
|---|---|---|
| 1 | WP1, WP2, WP3 | no code dependencies (WP1 works on the original page, WP2 on the stylesheet, WP3 is the foundation) |
| 2 | WP4 | its tests import WP3 |
| 3 | WP5, WP6, WP7, WP8, WP9 (in parallel) | WP5, WP7 and WP9 tests import WP3 and WP4 (`layoutProject`, a real `Project` and `EventBus`); WP6 and WP8 have no unit tests and need only WP3, so with spare capacity they may start in wave 2 |
| 4 | WP10 | integration needs everything |

- Within wave 3 some modules import a sibling's file statically (`CameraRigView`, `SafeDistanceView`, `PropViews` and `TransformGizmo` import `render/ResourceTracker.js` from WP6). No unit test loads those modules, so this is an interface, not a scheduling edge; `node tests/static/check.mjs` reports the missing file until WP6 is merged, which is expected and is cleared at WP10.
- WP5's golden-file tests read `GOLDEN_DIR` (default `tests/regression/output/baseline`, captured with WP1's baseline procedure). The `default` and config scenarios they compare against predate WP1, so WP5 can capture the baseline itself with the same procedure; without a baseline the golden tests skip with a clear message, and WP5's acceptance requires them to have run.
- If an integration fix needs a contract change, ARCHITECTURE.md is amended in the same commit.

## 8. How to run locally

ES modules do not load from `file://`, so serve the folder over HTTP:

```bash
node tools/serve.mjs --port 8000      # zero-dependency server from this repo (serves .js as text/javascript)
# or
python -m http.server 8000            # any static server works if it serves .js as JavaScript
```

Then open http://localhost:8000/. If the browser console reports a MIME-type error for a `.js` file, your server is serving JavaScript as text/plain (some Windows setups do); use `tools/serve.mjs`.

Running the checks:

```bash
node --test "tests/unit/**/*.test.mjs"   # Node 22.7+; quote the glob; the directory form fails on Node 21+
node tests/static/check.mjs
node tests/static/css-slices.mjs
node tests/regression/run.mjs --root . --out tests/regression/output/candidate
node tests/regression/compare.mjs tests/regression/output/baseline tests/regression/output/candidate
```

The harness needs Node 22+, Chrome (or Edge) and internet access (three.js, JSZip and fonts come from CDNs). Capture the baseline and the candidate on the same machine and browser.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Floating-point drift from "tidied" maths (re-association, coercion) | Verbatim-copy rule; differential tests with `Object.is` against a verbatim oracle; byte-identical export gates |
| Draw-order changes (three.js sorts by object/material/program creation order) | No allocation in constructors; legacy allocation order in every builder; no new scene parents or layers; disposal changes deferred to Phase 1C; pixel-exact screenshots in the harness |
| Event ordering hidden in subscriptions | Ordered work is direct calls only; events are DOM mirrors with disjoint targets; unknown events throw |
| Listener-order changes (orbit vs gizmo; key state vs shortcuts) | Bootstrap reproduces the original registration phases; the `keyboard`, `gizmo_drag` and `pilot_look` scenarios check it |
| CSS cascade changes | Contiguous slices in original order, proven by script and by `ui_visual` (computed styles of about 100 properties per element, page and sidebar screenshots, narrow layout) |
| Module semantics (strict mode, deferred execution) | Verified: no implicit globals, no top-level `this`; step I-1 runs the untouched script as a module before anything else changes |
| Exception parity (`ReferenceError` for the safe-distance export, `RangeError` for large glTF, the import `try`) | Kept by construction (an undeclared `downloadBlob`, the spread encoder called at shallow depth, no new try/catch); the harness compares console output |
| Parallel work packages drifting from each other | One binding contract; file ownership; static checks; integration fixes recorded and the contract amended in the same commit |
| GitHub Pages differences (case-sensitive paths, sub-path URLs, caching) | Relative URLs; case check in the static gate; a Pages smoke test before release; optional `?v=` query on `js/main.js` if stale caches appear |
| Behaviour not covered automatically (WASD timing, hover) | Code moved verbatim; manual side-by-side checklist |
| Over-modularisation for a solo maintainer | 45 modules, one concept each, one composition root, no framework or DI container; every module spec in ARCHITECTURE.md cites the original line ranges it ports, and section 4 maps every old global to its new owner |
