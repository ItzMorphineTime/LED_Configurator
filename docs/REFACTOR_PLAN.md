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
The authoritative plan is `docs/improvements/08-bugfix-roadmap.md` (batch cards in its section 10, bug ownership across the specs in its section 5.6). Each commit fixes one bug id for one consumer: it flips one switch or edits one tagged site, updates `LEGACY_SITES`, and is re-baselined on its own through 08 section 8.1 (the baseline is the parent commit's output, the intended changes are declared first in `tests/regression/expected/<commit-id>.json`, and `compare.mjs --expect` gates a full harness run). Merge order and batch membership (08 section 1; bug ids from the verified defect list, `docs/DEFECTS.md`):

**Owner-visible block**
1. **P2-0** Phase 2 tooling (no bug id): `compare.mjs --expect`, the nondeterminism allowlist, the eight `p2_*` harness scenarios, `LegacyProfiles`, the structural export checkers.
2. **P2-5a** **B-M1**: Export Safe Distance OBJ downloads (one line), merged before P2-1a wraps every export in its error alert. **Landed** (manifest `P2-5a`).
3. **P2-1** **B-H3, B-L5, B-L4**: exports never fail silently (chunked base64, 32-bit indices from 65,535 on, canvas-size guards and messages). **Landed** (manifests P2-1a to P2-1e: B-H3; B-L5 glTF and viewport; B-L4 exports and viewport).
4. **P2-2** **B-H1, B-H2, B-L3**: stage-facing winding and real normals in the viewport and every export (the owner-reported "inverted normals"). It must follow P2-1: adding `NORMAL` puts `large_wall`'s glTF buffer at 121,056 bytes, inside the band where the legacy spread encoder throws `RangeError` (B-H3). **Landed** (manifests P2-2a to P2-2d: B-H1 viewport winding; B-L3 viewport normals; B-H2 OBJ and glTF).
5. **P2-8a** **B-L15**: integer counts and sanity caps in the UI rules, before the validator. **Landed** (manifest `P2-8a`).
6. **P2-3** **B-M4, B-L8, B-L16, B-L21**: escaped names and validated imports. **P2-3a landed** (manifest `P2-3a`: B-M4). **P2-3b landed** (manifest `P2-3b`: B-L8). **P2-3c landed** (manifest `P2-3c`: B-L16). **P2-3d landed** (manifest `P2-3d`: B-L21); P2-3 is complete.
7. **P2-4** **B-H4, B-M8**: a clean preview-off (no stuck pilot mode, no stale safe-distance floor). **P2-4a landed** (manifest `P2-4a`: B-H4). **P2-4b landed** (manifest `P2-4b`: B-M8); P2-4 is complete.
8. **P2-5b** **B-L29, B-M15**: the mitred, clamped safe-distance band.
9. **P2-6** **B-M3, B-L14, B-L7, B-M2**: consistent, lossless bundles (ZIP JSON offsets, texture names, MTL delivery).
10. **P2-12d** **B-M16, B-L19**: panel-mode textures (P2-12a is not needed: B-H5 and B-L12 landed in Phase 1C, H1 and H2).
11. **P2-7** **B-M5, B-M6, B-M7, B-L6, B-L18**: UVs match textures (prerequisite for Feature 4).

**Feature-gate block**
12. **P2-8b–d** **B-L9, B-L10** (pilot half), **B-L13**: numeric input semantics.
13. **P2-9a–d** **B-M14, B-L11, B-M12, B-L22**: click-select, shortcut filters, gizmo rotation sign, prop axes. Landed so far: P2-9b (B-L11, the shared typing guard `core/typingTarget.js` and the modifier and repeat filters; manifest P2-9b).
14. **P2-13a** **B-L35**: logo guards, sanitising and the post-conversion size cap.
15. **P2-13e** **B-L31**: the v2 project file (07 section 4.2).

**Remainder**
16. **P2-9e–j** **B-L23, B-L28, B-M13, B-L27, B-L25, B-L26**: gizmo local space, quaternion rotation, pilot movement, presets in pilot mode.
17. **P2-10** **B-M11, B-M9, B-L32, B-L34**: the preview window.
18. **P2-11** **B-M10, B-L33, B-L2, B-L10** (Z half): true framing and coverage, co-scheduled with Feature 3.
19. **P2-12b, P2-12c** **B-L20, B-L30**: the LED tile cache LRU and the pose-only camera refresh.
20. **P2-13b, c, f, g** **B-L17, B-L36, B-L1**: the wall texture warning, toggle accessibility, the curve-convention code (the owner kept the convention, 08 Q10) and the final clean-up.

B-L24 is fixed by Feature 1 (01 T7, landed as 01 F1-2) and Feature 6 (06 T4a, landed). Phase 3 feature tasks merge as soon as their own gates have merged (08 section 1.1), interleaved with these commits, one merge at a time, each through the same gate.

### Phase 3: features
Suggested order: **1** normals debug view (after the B-H1/B-H2 fix), **6** Morph branding (independent; can run any time after Phase 1), **3** configurable pivot, **2** section selection and per-section offsets, **4** clean UVs and the UV viewer/editor, **5** HDRI projection and the reflective car (needs the single-renderer preview and the helpers layer). ARCHITECTURE.md section 9 lists, per feature, what already exists after Phase 1 and what the feature adds. Feature 1 (docs/improvements/01-normals.md section 8.4 steps) landed so far: F1-0a (orientation tooling: check-orientation over ZIPs and directories, the export-orientation test, the cap-wall fixture), F1-0b (harness: the `rects` allowances of `compare.mjs --expect`, `--diff-bbox`, `measure-rects.mjs`, the palette hook), F1-1 (the debug core without UI: normal lines, debug shading, settings and controller, the render-order registry), F1-0c (review follow-up of F1-0b: the rect rule tolerates the allowlisted jitter outside the rects), F1-2 (the debug UI: toolbar buttons, popover, legend, announcer, N / Shift+N, `DEBUG_VIEW_CHANGED`, `.view-btn.active`; off by default), F1-3 (the `normals_debug` harness scenario and `lib/probe.mjs`), F1-2b and F1-2c (review follow-ups of F1-2: the legend notes legible and its title reachable; the `DebugViewControls` import-boundary test). Feature 6 (docs/improvements/06-morph-branding.md section 8.4 steps) landed so far: T1 (the static inline styles became the classes of `css/99-utilities.css`, linked last; dead CSS removed; `css-slices.mjs --report-only`; static rule 12; `compare.mjs --ignore-keys`), T2 (`theme/ThemeBridge.js`: pure, with the U1-U3 tests), T3 (the layer-4 tokens of `css/02-tokens.css` with the legacy values and spec 01's four debug-view tokens; ThemeBridge wired in `App`; `.status-*` on the `--status-*` tokens; the U4 parity, U10 and U11 tests), T4a (the ungated Morph chrome: token layers 1-3 with the brand values and every stylesheet on role tokens; the text-only header; the third-party logo deleted; the head metas and Montserrat; the component states, including the selection badge stacked above the help badge, which lands B-L24; static rules 13-15; the U5 contrast and U6 tests), T4b (the owner-approved brand artwork in `assets/brand/` with `NOTICE.md`: favicons, apple-touch icon, `og:image`, the wordmark lockup and the viewport watermark; static rule 16), T4c (British English in the visible labels and tooltips, and "Panel Angle (°)" for the one label that wrapped).

## 6. Verification strategy

| Gate | What it proves | When |
|---|---|---|
| Golden master (`tests/regression`) | Every export, DOM state, dialog, console error and screenshot equals the original (`console.warn` is not recorded; screenshots allow only the documented 1-level overlay-glyph jitter, ARCHITECTURE.md 10), across 19 scenarios including computed styles and full-page UI screenshots (27 with the eight Phase 2 scenarios added by 08 P2-0; from Phase 2 on, every output equals the parent commit's except the changes declared in the commit's expected-change manifest) | baseline in Phase 0; every checkpoint and merge in Phases 1-2 |
| Unit tests (`node --test "tests/unit/**/*.test.mjs"`) | Rule tables, layout, mesh builder, atlas and naming equal a verbatim copy of the old code (`Object.is` on every number over hundreds of random walls, including string and fractional inputs); exporters byte-identical to the baseline files; rebuild counts and camera-hub order with spies | every work package and merge |
| Static checks (`tests/static/`) | Layering, DOM-id ownership, file-name case, no globals, LEGACY register parity, every `Strategies` switch read, event usage, domain-field writers, CSS slices equal the original (reported, not failed, since 06 T1: `--report-only`, 07 S7), inline styles of `index.html` only `display` / `width` / `height` (since 06 T1) | every merge |
| Manual checks | WASD/QE orbit and pilot fly (including the inverted vertical), gizmo hover, window resize, preview resize, a GitHub Pages smoke test | end of Phase 1 and before release |

Rules: a failing comparison is never "fixed" by re-capturing the baseline during Phase 1. Baselines change only in Phase 2/3, one intended change per commit, each with an expected-change manifest (`tests/regression/expected/<commit-id>.json`, `docs/improvements/08-bugfix-roadmap.md` sections 8.1 and 8.2). From Phase 2 on, in every spec, the baseline of a commit is its parent commit's output, the gate is `compare.mjs --expect` on a full run, and `tests/regression/expected/_nondeterminism.json` is the only standing allowance.

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
node tests/static/css-slices.mjs --report-only   # since 06 T1 the slices differ from the original on purpose (07 S7)
node tests/regression/run.mjs --root . --out tests/regression/output/candidate
node tests/regression/compare.mjs tests/regression/output/baseline tests/regression/output/candidate
# Phase 2 onwards: --expect tests/regression/expected/<commit-id>.json (tests/regression/README.md, "Phase 2 re-baselining")
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
