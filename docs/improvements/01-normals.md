# Feature 1: Stage-facing normals by default, plus a viewport normals debug view

| | |
|---|---|
| Status | Draft for implementation, revision 3 (Phase 3 Feature 1, built on spec 08 P2-2). **Revision 3.1** applies the cross-spec consistency review (07 §0 C32-C62): the cap fixture follows the 200-section limit (07 C22); `face_orientation` is absent until T9b, which adds it with one revision bump assigned at merge (C39, C40), and the `wall.conventions`/`display.debug` import rule is deleted; the popover's Escape becomes registry priority 70 from 07 I1 (C42); the render-order registry gains the slots of 09, 05 and 04 and its static rule applies to every spec; `LEDWallView.withContentMaterials(fn)` keeps debug shading out of stills (C48); the shading radio reads "As displayed" (C49); the legend joins `#viewport-top-stack` (C51); this spec is the named owner of `.view-btn.active`, `disposeObject3D` de-duplication and `pickMeshes()` (C52); probes read a live palette hook (C53); rect allowances are a `rects` field of `--expect` manifests (C57); T11 keeps only this spec's own docs (C58). Revision 3 fixes the Part B test state, the `ui_visual` re-baseline rectangles, the F1-1 event gate, the cap fixture, the exact-equality checks, the cabinet colour, and the contracts shared with specs 02, 03, 05, 06, 07 and 08 (v2 key, `SECTION_FIELDS`, `SECTION_CHANGED`, typing guard, stylesheet location, render order). |
| Date | 2026-10-16 |
| Binding contracts | `docs/ARCHITECTURE.md` (modules, events, `Strategies`, `LEGACY_SITES`, section 9 seams), `docs/REFACTOR_PLAN.md` (phases, re-baseline rules), spec 08 (owner of the Phase 2 fixes this feature builds on) |
| Legacy source | `index.html@cd3fd3f` (line numbers below refer to it) |
| **Single owner of the flip** | **Spec 08 is the only normative source** for B-H1, B-H2 and B-L3: the winding, the averaged normals, OBJ `vn` and glTF `NORMAL`. That means its commits P2-2a-d, its algorithm in §6.4, its manifests in §10 and its effort (2 d). Spec 08 P2-5b owns B-L29 (the safe-distance floor faces +Y). This spec does not re-specify any of them. Section 2.4 lists their observable result as prerequisites, and section 10.3 sends spec 08 three change requests (CR-1 to CR-3). |
| Bugs fixed here | The `.view-btn.active` half of B-L24: T7 is its one named owner (07 C52; 06 T11 and 08 P2-13d's fallback are dropped). 06 T4a owns the badge-overlap half. |
| Delivered here | (1) A user-facing **LED side** control: a per-section select plus "Flip LED Side (All Sections)". (2) `FrontSide` wall materials with a cabinet-back shell. (3) The normals debug view. (4) Orientation verification: 08 P2-0's `tools/check-orientation.mjs` is extended to ZIPs and directories, and a golden test runs it. |
| Hard prerequisites | Phase 1 merged. Spec 08 P2-0 (`LegacyProfiles`, `compare.mjs --expect`, `tools/check-orientation.mjs`), P2-1a (B-H3 chunked base64), P2-2a-d, P2-3b (`ProjectValidator`, `Wall.MAX_SECTIONS = 200`, 07 C22) and P2-5b (mitred band). |
| Soft prerequisites | 08 P2-13e (JSON v2 writer): the LED side is persisted only once it exists; T9b then adds the key (4.5). 08 P2-11 (`FrustumCoverage`): coverage applies the section facing once it exists (6.4). 08 P2-9b (B-L11 shortcut filter): shares `core/typingTarget.js` (3.4, CR-9). |

---

## 1. Summary and user value

**Problem.** Before Phase 2, every wall the app produced faced the wrong way geometrically. Triangles were wound clockwise as seen from the stage (+Z), and the exports carried constant or missing normals (B-H1, B-H2, B-L3). The owner asked for normals that are "flipped by default".

Spec 08 P2-2 fixes the geometry for every consumer. After it, three gaps remain, and this feature closes them:

1. **"By default" implies a choice, and there is none.** Some walls are laid out clockwise around the stage: walls built from the far side, back-to-back walls, pillars. Their LED side faces away from the stage, and the user has no way to say so.
2. **The viewport still hides orientation.** P2-2 keeps `MeshBasicMaterial` + `DoubleSide` (08 Q3: "keep DoubleSide until Feature 1's face-orientation view exists"). A wall facing the wrong way therefore looks correct in the app and wrong in Unreal.
3. **There is no way to inspect normals.** Users cannot check orientation inside the app before export.

**What this feature does.**

1. **LED side control.** Each section card gets an "LED Side" select: `Stage side (default)` or `Reversed`. Below "Add Wall Section" there is a "Flip LED Side (All Sections)" button. A reversed section has its winding swapped and its normals negated in the viewport, OBJ, glTF, safe-distance band and frustum coverage. The value is model data (`WallSection.faceOrientation`) and is persisted in JSON v2 as `face_orientation`.
2. **What you see is what the engine sees.** Wall materials switch to `FrontSide`. A dark matte "cabinet back" shell keeps the wall visible from behind. A section facing the wrong way now shows its cabinet back to the stage. This lands only after items 1 and 3 exist (08 Q3).
3. **Normals debug view** in the viewport toolbar:
   - **Normal lines:** vertex normals (what lighting uses) and face normals (what culling uses), drawn as one merged `LineSegments`.
   - **Face orientation:** blue for front faces and red for back faces, as in Blender.
   - **Normal colours:** world-space normals shown as RGB.
4. **Orientation verification.** `tools/check-orientation.mjs` (shipped by 08 P2-0 for OBJ and glTF files) is extended to ZIPs and directories, so it checks any export. A golden test runs the same check over every OBJ/glTF the harness produces, including the files inside ZIPs.

**For whom.**

- **Owner and Morph operators:** they can export to Unreal or Blender with no manual normal flips, see orientation in the app before export, and fix a wall built the "wrong way" with one click.
- **Pipeline users:** they get documented conventions (counter-clockwise front faces, normals out of the LED surface) and a checker they can run on their own files.
- **Later features:**
  - Feature 5 relies on correct normals and `FrontSide` for lit and environment-mapped materials.
  - Feature 2 picks sections from either side, because the back shell is pickable (5.5). It also moves the LED side controls into its section card and batch bar (CR-5).
  - Feature 4's UVs are unaffected.

---

## 2. Current state

### 2.1 Legacy behaviour (index.html@cd3fd3f)

| Site | Lines | Behaviour | Bug | Fixed by |
|---|---|---|---|---|
| Combined strip indices | 1630-1640 (push at 1638) | `(bl, tl, tr, bl, tr, br)`: clockwise seen from +Z, so the face normal is `(sin a, 0, −cos a)` | B-H1 | 08 P2-2a |
| Section strip indices | 1744-1751 (push at 1749) | same | B-H1 | 08 P2-2a |
| Strip vertex normals | 1604-1625, 1723-1739 | `(−dz/len, 0, dx/len)`: the normal of the panel to the **right**; the last column copies the previous panel. This is the exact opposite of the face normal. | B-H1, B-L3 | 08 P2-2a/b |
| Panel mode (viewport) | 1782 `PlaneGeometry`, `rotation.y = rotY` | **Consistent:** counter-clockwise from +Z with a +Z normal | none | – |
| Wall materials | 1670-1674, 1764-1768, 1788-1792 | `MeshBasicMaterial`, `side: THREE.DoubleSide`, unlit. This hides any orientation error. | B-H1 (concealment) | 08 P2-2a retires the LEGACY tag and keeps `'double'` as a design choice. **This spec** switches to `'front'` (F1-5). |
| OBJ faces | combined 4599-4600, section 4648-4649, panel 4705-4706 | Clockwise from +Z in all modes | B-H2 | 08 P2-2c |
| OBJ normals | 4589, 4635 (`vn 0 0 1` once per object); panel 4698-4700 | Constant +Z for strips, even when curved | B-H2 | 08 P2-2c |
| glTF indices | combined 4844, section 4863, panel `[0, 3, 2, 0, 2, 1]` at 4887 | Clockwise from +Z | B-H2 | 08 P2-2d |
| glTF attributes | 4819 `{ POSITION }`; materials 4739-4746 have no `doubleSided` | No NORMAL | B-H2, B-M7 | 08 P2-2d (NORMAL), P2-7c (TEXCOORD_0) |
| Safe-distance floor | indices 2703-2706; `computeVertexNormals` 2715 | Faces −Y | B-L29 | 08 P2-5b |
| Helpers | grid 1446, axes 1449 | All on layer 0 | (B-M11) | spec 07 R1 (F0-e) or 08 P2-10a |
| Viewport toolbar | markup 1206-1234; CSS `.viewport-controls` 495, `.view-btn` 714 | Five buttons. `#toggle-grid` toggles `.active`, but no `.view-btn.active` rule exists. | B-L24 (the `.active` half; the badge-overlap half stays with Feature 6) | **this spec** (F1-2) |
| Keyboard guards | `KeyboardState` 3843-3846 (ignores INPUT/SELECT/TEXTAREA); shortcuts 4410-4411 (ignore INPUT/TEXTAREA) | Any focused `INPUT`, including a checkbox, disables WASD, arrows, Q/E, G/R/L/P. The shortcut handler also ignores no SELECT, modifier or repeat. | B-L11 | **08 P2-9b** (`InputState.isShortcutIgnoredTarget`: INPUT of every type, TEXTAREA, SELECT, contenteditable; modifiers; repeat). 07 I1 later replaces it with `core/typingTarget.js`. This spec shares that one module (CR-9) and keeps its own keys usable through the blur rule of 3.2. |
| Help badge | 1204 | `Drag to rotate • Scroll to zoom • WASD to move • G=translate R=rotate L=space P=pilot` | – | this spec adds `N=normals` (F1-2) |

### 2.2 Refactored code on disk and in ARCHITECTURE.md

These `js/` directories exist on disk: `core/` (`EventBus.js`), `domain/` (`CineCamera`, `LogoLibrary`, `Project`, `Prop`, `Wall`, `WallSection`), `geometry/` (`PanelNaming`, `TextureAtlas`, `WallLayout`, `WallMeshBuilder`), `interaction/` (`InputState`, `OrbitController`, `PilotController`, `SelectionManager`, `TransformGizmo`, `ViewportInput`), `legacy/` (`LegacyCompat`), `render/` (`LEDMaterialFactory`, `LEDWallView`, `ResourceTracker`, `SceneManager`, `textures/`), `theme/` (`Theme.js`), `ui/` (`ViewportToolbar`, `dom`) and `vendor/`.

Not on disk yet: `app/`, `io/`, the remaining `ui/` panels and the other render views. ARCHITECTURE.md remains the source of truth for every name used below.

Facts checked in the files on disk:

| Concern | Where | State on disk |
|---|---|---|
| Winding | `geometry/WallMeshBuilder.js` `quadIndices(bl, br, tl, tr, winding = 'legacy-cw')` | Only `'legacy-cw'` is accepted. Tagged `LEGACY(B-H1, B-H2)`. **The default argument keeps the bug as the silent default**, and this spec removes it (5.2). |
| Strip normals | `WallMeshBuilder.sectionGrid`, cases `'right-panel'` (LEGACY B-L3) and `'none'` | `vertsPerRow` is the raw `panelCols + 1`. `LEGACY(B-L8, B-L15)`: a string `'10'` gives `'101'`, and `2.5` gives `3.5`. |
| Material side | `render/LEDMaterialFactory.js` `#side()`; every wall material passes `side: this.#side()` | `'double'` |
| Mesh tags | `render/LEDWallView.js` | `userData.kind = 'led-wall'`, `mode`, `sectionId`, `sectionIndex`, `col`, `row`. Combined mode carries `sectionRanges`. `meshes()` and `sectionNodes()` exist. |
| Layers | `render/SceneManager.js` `LAYERS = {DEFAULT: 0, HELPERS: 1}`, `addHelper` | Registry only. Layers are not applied (R6). |
| Theme | `theme/Theme.js` `SceneTheme = deepFreeze({...})` | Frozen literal object. New keys must be written **inside** the literal (4.6). |
| Domain | `domain/WallSection.js` `SECTION_FIELDS` (11 legacy fields); the constructor assigns exactly those keys. Unit tests compare `SECTION_FIELDS` with the 11-name list (`domain.test.mjs` 297-311, 489; `wall-controller.test.mjs` 692). | `domain/Wall.js` already carries `pivot` (`WallPivot`, the Feature 3 seam). `Wall.appendLikeLast` builds the new section from an explicit object literal. |

ARCHITECTURE seams this feature uses:

- `WallController.rebuild()` step 6 emits `WALL_REBUILT {layout, meshMode, view}` (no subscriber yet).
- `ResourceTracker` handles disposal.
- `ui/ViewportToolbar.js` owns `#view-*` and `#toggle-grid`.
- `ui/SectionListPanel.js` owns `#wall-sections`, `#add-section-btn` and every card.
- The import rules: `ui/` may import `core/` but not `interaction/`; `interaction/` and `render/` may import `core/`.

### 2.3 three.js r128 API check

Everything was checked against the `three@0.128.0` sources.

| API | r128 | Use here |
|---|---|---|
| `Layers.set/enable/disable/test`, `Object3D.layers` (one per object) | core | `HELPERS` layer for normal lines |
| `WebGLRenderer.projectObject` tests `object.layers.test(camera.layers)` per object, then recurses into children regardless | core (source checked) | The layer must be set on the `LineSegments` itself. A parent's layer does not propagate. |
| `Raycaster.layers` + the `intersectObject` layer test | core (source checked) | Lines are never hit by the shared `PointerRay` |
| `Mesh.raycast` → `checkIntersection`: `BackSide` tests `(c, b, a)` with back-face culling; `FrontSide` tests `(a, b, c)` with culling; `DoubleSide` tests without culling | core (source checked) | A `FrontSide` LED mesh is hit from the front and a `BackSide` shell is hit from behind, so picking works from both sides with no `DoubleSide` workaround (spec 02 R6) |
| `renderBufferDirect`: `frontFaceCW = object.isMesh && matrixWorld.determinant() < 0` | core (source checked) | Invariant: wall transforms are rigid (det = +1), so face orientation comes from index order only |
| `Object3D.updateWorldMatrix(updateParents, updateChildren)` | core | Panel meshes have a stale `matrixWorld` until the next render, so refresh it before reading |
| `Matrix3.getNormalMatrix(m4)` | core | Normals to world space, through one reused scratch matrix (6.7.1) |
| `LineSegments`, `LineBasicMaterial({vertexColors: true})`, `BufferGeometry.setDrawRange`, `BufferAttribute.needsUpdate` | core | Merged normal lines with reused buffers |
| `ShaderMaterial` (built-in `position/normal/modelMatrix/...` declarations prepended) | core | Face-orientation and world-normal debug materials |
| `MeshNormalMaterial` | core, but it outputs **view-space** normals | Evaluated and not used: its colours shift while orbiting |
| `InstancedMesh` | core (since r109) | Evaluated for arrowheads and not used (6.7.6) |
| `VertexNormalsHelper` | **not core**: `examples/js/helpers/VertexNormalsHelper.js` | Not used: it needs one `LineSegments` per mesh (3,200 draw calls for `large_wall` in panel mode), reads attribute normals only and cannot decimate |
| `FaceNormalsHelper` | **absent** (removed with `Geometry` in r125) | Face normals come from our own code |
| `PlaneGeometry(w, h)` 1×1 | core: vertices TL, TR, BL, BR; indices `[0, 2, 1, 2, 3, 1]`, counter-clockwise from +Z on the BL–TR diagonal | Panel mode stays as it is. Reversed sections flip it in place (6.5). |

### 2.4 State after the spec 08 prerequisites (what this feature starts from)

| Item | After the prerequisite | Owner |
|---|---|---|
| Viewport strip winding | `quadIndices(..., 'ccw')` = `[bl, br, tr, bl, tr, tl]`, the same BL–TR diagonal | 08 P2-2a (empty manifest) |
| Viewport normals | `'averaged'` (08 §6.4; see CR-1) | 08 P2-2b (empty manifest) |
| Viewport material side | `'double'`, kept as a design choice; the LEGACY row is retired | 08 P2-2a. **F1-5 flips it to `'front'`.** |
| OBJ | One `vn` per vertex (`toFixed(6)`), `f a/a/a b/b/b c/c/c`. Panel faces `v, v+1, v+2 / v, v+2, v+3`, with one facing `vn` per panel. | 08 P2-2c |
| glTF | A `NORMAL` accessor (5126, VEC3, no min/max), counter-clockwise indices, the panel facing normal ×4, `doubleSided` omitted | 08 P2-2d |
| glTF size | `large_wall` combined grows from 79,728 B to 121,056 B, inside the 120-130 KB failure band of the old spread encoder | 08 P2-1a lands first |
| Oracle fixture | `LegacyProfiles` (frozen Phase-1 mesh profiles, injected by the oracle tests) | 08 P2-0 |
| Safe-distance band | `geometry/SafeDistanceBand.js#buildSafeDistanceBand`: mitred, faces +Y, OBJ `vn` | 08 P2-5b |
| Import validation | `ProjectValidator`: numbers are coerced and clamped (the B-L8 garbage geometry is gone) | 08 P2-3b |
| JSON v2 writer | `ProjectSerializer` v2 | 08 P2-13e (soft prerequisite) |
| Profiles home | `Strategies.mesh` moves to `geometry/MeshProfiles.js` (`MeshProfiles.viewport.side`, ...) at the end of Phase 2 | 08 P2-13g |

**Verified in Node** (scratch checks, using the legacy layout walk copied from 1483-1549):

| Check | Result |
|---|---|
| Legacy winding, (face normal) · (stored normal), over 3,000 fuzzed walls (3,976,878 triangle-vertex samples) | < 0 everywhere |
| `'ccw'` winding, same check | > 0 everywhere |
| `'ccw'` or `'ccw' + reversed` (random σ per section, 30 % flat sections, CR-1 averaging), with σ-scaled normals; 3,000 fuzzed walls (2,202,486 samples over the first two rows) | > 0 everywhere; minimum 0.966 = cos 15° |
| Averaged normals against the face normal | never below cos 15° = 0.966 (half a curve step) |
| Panel corners BL, BR, TR, TL with `[0,1,2,0,2,3]` | face agrees with `vn` for every heading |
| **Flat-section drift (CR-1).** Edge positions are accumulated (`currentX += panelW·cos a`), so neighbouring segment normals of a flat section at a non-axis heading can differ in the last bit. | On the 7 harness configs: `large_wall` L3 (40°) has 4 distinct segment normals over 40 columns. 08 §6.4's per-vertex `Object.is` short-circuit fails at 4 of 134 flat-section vertices. The result is not bit-equal to `'right-panel'` there (max 5.2e-15 from the analytic normal). |
| Back faces seen at the bootstrap/reset pose (θ = 0.3, φ = π/2.5), the pose of the config scenario screenshots | `box_corner` has 27 back-facing panels in view. `large_wall` has back-facing panels, none in view. The other five configs have 0. The F1-5 manifest is still derived mechanically (8.4), because 08's `p2_*` scenarios add 180°-offset sections and cameras behind the wall. |
| Colour difference to Pivot Gold `#F2B705` (spec 06 rule ΔE00 ≥ 20) | Old vertex-line yellow `#FFD23F`: **7.0 (fails)**. New lime `#B8F03C`: 27.3. Magenta `#FF4FD8`: 67.5. Blue `#2F6BFF`: 69.3. Red `#FF3344`: 45.9. Cabinet `#403C37`: 58.1. |
| Cabinet colour against the scene (background `#0A0A0F`, grid minor `#1A1A24`, grid centre `#2A2A3A`) | Revision 2's `#16161E` had 1.10:1 contrast to the background, 1.04:1 to the minor grid lines, and sat 0.5 RGB units from the background/grid blend hull, so a wall seen from behind was nearly invisible and the probe could match grid blends. **`#403C37`** (warm graphite): 1.81:1 to the background, 1.58:1 to the minor lines; ΔE00 15.8 / 14.5 / 13.7 to background / minor / centre; at least 28.6 RGB units from every background/grid blend. |

---

## 3. UX design

### 3.1 Placement

The debug view lives in the **viewport toolbar** (`.viewport-controls`, the top-right column). It is a viewport-only diagnostic and must be reachable while orbiting and in pilot mode. The LED side control lives in the **sidebar** with the other section properties, because it is project data.

```
 viewport (top-right corner)                                   overlay y (px)
                                                     ┌────┐
                                                     │ ▢  │ #view-front         20-60
                                                     │ ┼  │ #view-side          68-108
                                                     │ ◎  │ #view-top          116-156
                                                     │ ↺  │ #view-reset        164-204
                                                     │ ▦  │ #toggle-grid       212-252  (.active now styled: B-L24)
                                                     ├────┤ .view-divider      260-269  (new; 1 px + 4 px margins)
 ┌─ Debug view ─────────────────────────── × ┐       │ ⟂  │ #toggle-normals    277-317  (new; N)
 │ SHADING                                     │◄────│ ◐▾ │ #debug-view-btn    325-365  (new; opens the popover;
 │ (•) Content   ( ) Face orientation          │     ├────┤                              Shift+N cycles shading)
 │ ( ) Normal colours (world)                  │     │ UV │ #toggle-uv-viewer  373-413  (spec 04, if present)
 │ NORMAL LINES                                │     └────┘
 │ [x] Vertex normals (lighting)               │
 │ [ ] Face normals (winding)                  │
 │ Length  ×1.00  [====●=========]             │
 │ [ ] Draw on top (ignore depth)              │
 │ 24 vertex lines · 0.117 m                   │  ← #debug-normals-stats (owned by NormalsDebugView)
 └─────────────────────────────────────────────┘

 top-centre legend chip (#debug-view-legend), shown only while a debug mode is active:
   ┌──────────────────────────────────────────────────────────┐
   │ Face orientation   ■ front (LED side)   ■ back            │
   │ Normal colours (world)   X→red  Y→green  Z→blue           │
   │ Normals   lime = vertex (lighting) · magenta = face (winding) │
   └──────────────────────────────────────────────────────────┘
```

**Toolbar order.** The order is `#toggle-grid`, `.view-divider`, `#toggle-normals`, `#debug-view-btn`. Spec 04's `#toggle-uv-viewer` goes **after** `#debug-view-btn` (CR-7), so the debug button's position does not depend on whether spec 04 has landed.

**Popover placement.** `#debug-view-popover` is a direct child of `.viewport-overlay` (a sibling of `.viewport-controls`, **not** a child of it). Its containing block is therefore the overlay, which is `position: absolute` on all four sides.

- CSS: `position: absolute; right: 72px` (20 px margin + 40 px button + 12 px gap), `width: 264px`, `max-height: calc(100% - 40px)`, `overflow-y: auto`, `pointer-events: all`, `z-index: 110` (above `.pilot-info`'s 100). The `right: 72px` slot is shared, with the z-order debug popover 110 > spec 04's UV viewer 30 > spec 05's HDRI badge 20 (07 C51).
- `top` is computed in `DebugViewControls.#placePopover()` from `getBoundingClientRect`, relative to the overlay. It does **not** use `offsetTop`, which would be measured against `.viewport-controls` and come out 20 px off.

```
o = overlay.getBoundingClientRect();  b = btn.getBoundingClientRect();
h = popover.offsetHeight                         // measured while shown; already limited by max-height
lo = 20;  hi = o.height - 20
top = b.top - o.top                              // open downward: top edge aligned with the button
if (top + h > hi) top = (b.bottom - o.top) - h   // open upward: bottom edge aligned with the button
top = max(lo, min(top, hi - h))                  // clamp; when h > hi - lo the popover sits at 20 px and scrolls
popover.style.top = round(top) + 'px';  popover.dataset.placement = (opened upward ? 'up' : 'down')
```

`#placePopover()` runs on open, and on `win` `resize` while the popover is open. The listener is added on open and removed on close.

**Fit check** (40 px buttons, 8 px gap, a 9 px divider, the column at `top: 20px`):

| Item | Value |
|---|---|
| Column with Feature 1 (7 buttons + divider) | 7·40 + 7·8 + 9 = 345 px, overlay y 20-365 |
| Column with spec 04's button (8 buttons + divider) | 393 px, y 20-413 |
| `#debug-view-btn` | y 325-365 |
| Popover content | about 310 px: title 32, two group labels 40, 3 radios 72, 2 checkboxes 48, length row 36, on-top 24, stats up to 2 lines 32, padding 24 |
| Opens **downward** when | overlay height ≥ 325 + 310 + 20 = 655 px (harness 1600×1000: 940 px) |
| Opens **upward** when | 385 ≤ height < 655. This covers a 1366×768 laptop (viewport about 570-590 px) and the ≤ 900 px-wide layout (viewport = H − 410) for 795 ≤ H < 1065. |
| Clamped and scrolls when | height < 385 px. Every control stays reachable through the popover's own scroll. |
| Column overflow | Below 385 px of overlay height (433 px with spec 04) the column itself no longer fits. The overlay is `innerHeight − 60` in the wide layout and `innerHeight − 410` in the ≤ 900 px layout (`03-layout.css`, `12-responsive.css`). `css/features/debug-view.css` therefore adds the fallback **only** under `@media (max-height: 444px)` and `@media (max-width: 900px) and (max-height: 794px)`: `.viewport-controls { max-height: calc(100% - 40px); overflow-y: auto; padding: 4px; margin: -4px; }` and `.viewport-controls > * { flex-shrink: 0; }`. The 4 px padding keeps focus rings and spec 06 glows inside the scroll box (`overflow-y: auto` forces `overflow-x: auto`, which would clip them). Spec 04's button raises both thresholds by 48 px (CR-7). Above the thresholds no rule applies, so no harness screenshot changes. |

**Legend placement (07 C51).** `#debug-view-legend` is the last child of the top-centre stack `#viewport-top-stack` (`top: 20px; left: 50%; transform: translateX(-50%)`, `max-width: calc(100% - 320px)`, a vertical flex column; text wraps), which holds, in this order, 07's restore banner, 09's share banner and this legend. That keeps it clear of spec 06's reserved zone (x ≤ 140) and of the toolbar column (x ≥ W − 80) at any width. If this feature lands first, T7 adds the stack element with the legend as its only child.

The pilot banner `.pilot-info` occupies the same spot (z-index 100, about 575 px wide, bottom edge at 59 px). The whole stack therefore moves below it with `.pilot-info.visible ~ #viewport-top-stack { top: 72px; }`. This needs the DOM order `#pilot-info`, then spec 06's `.brand-watermark` if present, then `#viewport-top-stack`; the general-sibling selector skips the watermark.

Bottom-centre was rejected: the help badge (about 650 px wide) and the camera preview (bottom-right, 320×180) occupy the bottom edge. On viewports narrower than about 1090 px, an upward-opened popover can cover the right end of the legend. That is acceptable, because the popover is transient and user-opened.

**LED side controls (sidebar).**

```
 ┌─ Wall 1 ───────── 5×3 • 160×96px • Flat • Reversed ── × ▾ ┐   ← summary suffix only when reversed
 │ Section Name  [Wall 1                                   ]  │
 │ Columns [5]        Rows [3]                                 │
 │ ...                                                         │
 │ Angle Between Panels (°) [0]    Section Offset (°) [0]      │
 │ LED Side  [ Stage side (default)  ▾ ]                       │   ← select[data-section-flag="faceOrientation"]
 │ Panel Color  ■ ■ ■ ■ ■ ■ [custom]                           │
 └─────────────────────────────────────────────────────────────┘
 [ +  Add Wall Section            ]
 [ ⇄  Flip LED Side (All Sections) ]                               ← #flip-all-sections
```

Feature 2 later moves the select under its card's "Advanced" disclosure. It also moves the button, **keeping the id `#flip-all-sections`**, into its section toolbar (owned by `SectionToolbar` from 02 T12), where it applies to the selected sections, or to all sections when nothing is selected (CR-5).

### 3.2 Controls

**Debug view.**

| Control | Element / id | Type | Label, title, ARIA | Range / values | Default | Effect |
|---|---|---|---|---|---|---|
| Normal lines | `#toggle-normals` | `button.view-btn` (toggle) | title and `aria-label` "Show normals (N)", `aria-pressed` | on / off | off | `settings.normals.enabled` |
| Debug menu | `#debug-view-btn` | `button.view-btn` | title and `aria-label` "Debug view (Shift+N cycles shading)", `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls="debug-view-popover"` | opens or closes the popover | closed | none; `.active` while shading ≠ content |
| Popover | `#debug-view-popover` | `div`, `role="dialog"`, `aria-modal="false"`, `aria-labelledby="debug-view-title"`, `tabindex="-1"`, `hidden` | – | – | hidden | non-modal; no focus trap |
| Title | `#debug-view-title` | `h2` | "Debug view" | – | – | – |
| Shading | `input[name="debug-shading"]`: `#debug-shading-content`, `#debug-shading-face`, `#debug-shading-normals` | native radio | "As displayed", "Face orientation", "Normal colours (world)" (the first label is not "Content", which would read like the wall content mode of 07 C49) | `'content' \| 'faceOrientation' \| 'normalColors'` | `content` | `settings.shading`, applied as a material override on the wall meshes, orthogonal to the wall content mode (colour, LED sim, panel IDs, HDRI) |
| Vertex normals | `#debug-normals-vertex` | native checkbox | "Vertex normals (lighting)" | bool | checked | adds the vertex-normal lines (lime) |
| Face normals | `#debug-normals-face` | native checkbox | "Face normals (winding)" | bool | unchecked | adds the face-normal lines (magenta), one per quad |
| Length | `#debug-normals-scale` + `#debug-normals-scale-value` (`span`) | `input[type=range]` | "Length", value text "×1.00" | 0.25-4.00, step 0.25 | 1.00 | `settings.normals.lengthScale` (multiplies the auto length, 6.7.4) |
| Draw on top | `#debug-normals-ontop` | native checkbox | "Draw on top (ignore depth)" | bool | off | line material `depthTest = !onTop`, `renderOrder = RENDER_ORDER.NORMAL_LINES_ON_TOP` (995, 5.5) |
| Stats | `#debug-normals-stats` | `p` (**not** a live region and not an `<output>`, whose implicit `role=status` would announce every rebuild) | text from `formatNormalStats` (3.5), e.g. "3,444 vertex + 3,200 face lines · 0.774 m" | read-only | empty | written by `NormalsDebugView` after each rebuild |
| Announcer | `#debug-view-status` | `div`, `role="status"`, class `visually-hidden` | short messages: "Normal lines on", "Shading: Face orientation", "Length ×2.00" | – | empty | written by `DebugViewControls` on `DEBUG_VIEW_CHANGED` only (never on wall rebuilds), debounced 400 ms, so a range drag announces once |
| Close | `#debug-view-close` | button | "×", `aria-label="Close debug view"` | – | – | closes the popover; focus returns to `#debug-view-btn` |
| Legend | `#debug-view-legend` | `div`, `aria-hidden="true"` (the announcer carries the information) | see 3.1 | – | hidden | shown while shading ≠ content or lines are on. Each colour square is a `span.debug-legend-swatch` whose `--swatch` custom property `DebugViewControls` sets from `theme.scene.debug` (and `theme.scene.wallBack`), so the stylesheet holds no colour literal (spec 06 R-B1) and the colours have one source. |

Numbers are formatted by `formatCount` (en-US grouping: a fixed regex, no `Intl`, no locale), so the harness state and screenshots are identical on every machine. Lengths are shown in metres with 3 decimals.

The popover uses **native** inputs (checkbox, radio, range), not the legacy `div.toggle` switches, so it is keyboard and screen-reader accessible (unlike B-L36).

**LED side.**

| Control | Element / id | Type | Label, ARIA | Values | Default | Effect |
|---|---|---|---|---|---|---|
| LED side (per card) | `select.section-face-select[data-section-flag="faceOrientation"]` in a new `.section-row.single` after the angle/offset row. The attribute is spec 02's (`data-section-flag`), **not** `data-field`: the card's generic `data-field` handler parses values with `WallSection.parseField` (`parseFloat`), which would turn `'reversed'` into `NaN`. | native select | label "LED Side", `aria-label="LED side of <section name>"` (set with `setAttribute`, and rewritten by the rename path of `SectionListPanel` whenever the section name changes), options `stage` "Stage side (default)" and `reversed` "Reversed". `title` is "Saved in project files (JSON v2)", or, before 08 P2-13e, "Not saved in project files until JSON v2". | `stage \| reversed` | `stage` | its own `change` listener: `wallController.setSectionFaceOrientation(section, value)`, then `#patchCard` (select value + summary suffix " • Reversed"), then `wallController.commitSectionEdit()` |
| Flip all | `#flip-all-sections` | `button.flip-all-btn` (secondary style; below `#add-section-btn`) | "Flip LED Side (All Sections)", title "Swap the LED side of every section" | action | – | `wallController.flipAllFaceOrientations()`, then every card is patched, then `commitSectionEdit()` |

**Popover behaviour.**

- Clicking `#debug-view-btn` toggles the popover. On open:
  - `#placePopover()` runs;
  - `aria-expanded="true"` is set;
  - **keyboard open** (the button's `click` has `detail === 0`, i.e. Enter or Space; the harness's `el.click()` also gives 0): focus moves to the checked shading radio;
  - **pointer open** (`detail ≥ 1`): focus stays where the browser put it (the button), so viewport keys keep working.
- A `pointerdown` outside the popover and the button closes it without consuming the event, so an orbit drag still starts. Focus is not moved, because the user is clicking elsewhere.
- **Escape while the popover is open** (focus anywhere) closes it.
  - **Until 07 I1:** one `keydown` listener on `doc` in the **capture** phase, added on open and removed on close, handles it. It acts **only** when `e.key === 'Escape'` (every other key passes untouched, so N, G and WASD are never swallowed), and it calls `e.stopPropagation()`, so the event never reaches the legacy bubble-phase document handler (deselect, exit pilot): the first Escape closes the popover, a second Escape deselects.
  - **From 07 I1:** the capture-phase listener is replaced by the Escape registry entry at **priority 70**, `debugControls.isPopoverOpen() && (debugControls.closePopover(), true)` (07 C42), conditioned on the popover being open rather than on focus (a pointer change leaves focus on `BODY`). It runs after a gizmo-drag cancel (80) and a reorder cancel (75), before the pilot exit (60). The `debug-popover` widget scope still sees Escape first while focus is inside the popover.
  - In both cases, if focus was inside the popover, focus returns to `#debug-view-btn`; otherwise focus is not moved.
- **Pointer-initiated changes blur the control**, so focus goes back to `BODY`:
  - A `pointerdown` inside the popover sets `#pointerChange = true`.
  - The next `change` (radio, checkbox, or range on release) calls `doc.activeElement.blur()` when the active element is inside the popover, then clears the flag.
  - The flag is also cleared by a `setTimeout(0)` scheduled on `pointerup`/`pointercancel` (the `change` of a click fires in the same task, before the timer), and by any `keydown` inside the popover. A click on a label gap or on the stats text therefore never leaves a stale flag that would later blur a keyboard-initiated change.
  - With focus on `BODY`, every guard lets WASD, the arrows, Q/E, G/R/L/P and N through: the legacy guards (3843: INPUT/SELECT/TEXTAREA; 4411: INPUT/TEXTAREA), 08 P2-9b's `isShortcutIgnoredTarget`, and 07 I1's typing and movement guards (which block any target inside `[role=dialog]` or `[data-key-scope]`, so focusing the popover container would **not** work once I1 lands).
  - Keyboard-initiated changes keep focus on the control, so arrow-key navigation inside the radio group still works. While keyboard focus is inside the popover, N is ignored (07 §3.8 dialog rule, 3.4); Escape first.

### 3.3 Viewport behaviour

| Situation | Behaviour |
|---|---|
| Wall seen from the front (default) | Pixels are unchanged by every Feature 1 step except the toolbar and help-badge regions (F1-2) and, at F1-5, possible draw-order swaps where coplanar lines meet the wall (8.4). |
| Wall seen from behind, debug off | **From F1-5:** the LED surface is culled (`FrontSide`), and a dark matte cabinet back (`theme.scene.wallBack`, default `0x403c37`, warm graphite) is drawn instead. It stays clearly visible against the background and the grid (2.4). Panel IDs, LED sim and colours show on the LED side only, as on a real wall. |
| A section whose LED side faces away from the viewer (reversed, or built from the far side) | Its cabinet back shows to that side. This is the visible cue to use "LED Side" or "Flip LED Side (All Sections)". |
| Wireframe on | The back shell is hidden, because wire lines are not culled and would double-draw. The debug override materials follow `display.wireframe`. In wireframe, face orientation shows every line blue (WebGL reports `gl_FrontFacing = true` for lines), and the legend says so. |
| Face orientation | Every LED mesh is drawn with one shared `DoubleSide` shader: front faces blue (`0x2f6bff`) and back faces red (`0xff3344`), with a mild `0.6 + 0.4·abs(n·L)` shade so curvature stays readable. The back shell is hidden, so it never covers the red. |
| Normal colours | The world normal is mapped to RGB (`n·0.5 + 0.5`). A wall facing +Z is lavender (128, 128, 255), one facing −X is teal (0, 128, 128), and one facing −Z is olive (128, 128, 0). |
| Normal lines | One merged `LineSegments` on `LAYERS.HELPERS`. Lime = stored vertex normals (lighting). Magenta = face normals from the triangle winding (culling). Each line fades from 35 % brightness at the surface to full brightness at the tip. |
| Section drag (Feature 2) | The lines follow live through `SECTION_CHANGED` (`'section:changed'`) with `live: true` (5.3). The length is kept until the drag ends. |
| Camera preview window | Normal lines are **not** rendered there (`HELPERS`; the preview camera sees layer 0 only). Shading overrides **are** visible in the live preview, because they are material swaps (Q10). The legend says "(also in camera preview)". |
| Stills and screenshots (07 R4, 09 X4) | Never show debug shading unless the caller passes `include.debug`: `PreviewPass.capture` and `captureCanvas` run inside `LEDWallView.withContentMaterials(fn)`, which restores the original materials, runs `fn` and re-applies the override (07 C48). |
| Wall content modes (colour, LED sim, panel IDs, HDRI) | Debug shading is an orthogonal override over **every** content mode, spec 05's HDRI material included (07 C49). `MaterialOverride` restores the content material before any dispose, so a content change or rebuild never disposes the shared debug materials. |
| Pilot mode | Lines and shading show in the main view, which is the pilot view. The legend moves below the pilot banner (3.1). |
| Picking and gizmo | Unchanged. Lines are on `HELPERS`, their `raycast` is a no-op, and they are in no `pickMeshes()` list. Legacy picking considers only the camera body, the person and the car, and only while a gizmo mode is set (3429). From F1-5, `pickMeshes()` lists the back shells with the same section tags as the LED meshes (5.5, unit-tested); picking a section from behind becomes observable with Feature 2's section picking. |
| Exports | Unaffected by every debug setting. Exporters read the layout, never the scene. |

### 3.4 Keyboard shortcuts and focus

| Key | Action | Conflict check |
|---|---|---|
| `N` | Toggle normal lines (same as `#toggle-normals`) | Free. Existing keys: G translate, R rotate, L space, P pilot, Escape, WASD and the arrows (orbit, pilot), Q/E (orbit, pilot). `KeyboardState` records every `e.code` but only acts on its own keys. Spec 04 uses `U`. |
| `Shift+N` | Cycle shading: As displayed → Face orientation → Normal colours → As displayed | Free. The legacy handler matches only g/r/l/p/Escape. |
| `Escape` (popover open, focus anywhere) | Close the popover (first Escape only; the next one deselects as before) | Until 07 I1: the popover's capture-phase `doc` listener (3.2), which stops propagation for Escape only. From 07 I1: Escape registry priority 70 (07 C42). |

**Guards for the new handler (until 07 I1).** A separate `document` `keydown` listener (bubble phase), registered **after** `ViewportInput.attachShortcuts`, so the legacy listener order is unchanged.

- Ignore the key when `isTypingTarget(e.target)` is true. This is the one shared truth table below, in `js/core/typingTarget.js` (CR-9).
- Ignore it when `e.ctrlKey || e.metaKey || e.altKey`, so `Ctrl+N` (new window) does nothing here.
- Ignore it when `e.repeat`, so holding N does not flicker.
- Match `e.key.toLowerCase() === 'n'` (the key label, like G/R/L/P), and tell the two actions apart with `e.shiftKey`.

`isTypingTarget(t)` is **07 §3.8's truth table verbatim** (07 C18 makes `core/typingTarget.js` the single definition). Feature 1 does not change it:

| `isTypingTarget(t)` | Result |
|---|---|
| `null` / no element | false |
| `TEXTAREA`, `SELECT` | true |
| `INPUT` with `type` in {checkbox, radio, button, submit, reset, color, file, range} | **false** |
| any other `INPUT` (text, number, search, ...) | true |
| `isContentEditable` | true |
| inside an open `[role=dialog]` (modal or not, including the debug popover) | true. Escape never goes through this check: the popover's own Escape listener (3.2) and 07's Escape chain handle it first. |
| anything else, including `BODY` and the toolbar buttons | false |

**One module, three callers.** 08 P2-9b is the one named owner of `core/typingTarget.js` (07 C52): it creates the module with the table above and makes `InputState.isShortcutIgnoredTarget` delegate to it, so the app never has two guards with different tables. Feature 1's T7 only consumes it, and 07 I1 only extends it.

**After 07 I1** (07 §0.2, its row for spec 01): the separate listener is removed. `N` (`debug.normals`) and `Shift+N` (`debug.cycleShading`) become `KEYMAP` rows (scope `global`, allowed in pilot; letters match by `e.key`, 07 C43), registered by `DebugViewControls` through `viewportInput.registerActions(...)`. The popover close becomes the Escape registry entry at priority 70, conditioned on `debugControls.isPopoverOpen()` rather than on focus inside the popover (07 C42), because a pointer change leaves focus on `BODY`; it replaces the capture-phase listener.

### 3.5 Feedback, empty and error states

| State | Feedback |
|---|---|
| Lines on | `#toggle-normals.active`, `aria-pressed="true"`, the legend line "Normals …", stats text, announcer "Normal lines on" |
| Shading ≠ content | `#debug-view-btn.active`; the legend shows the colour key; announcer "Shading: Face orientation" |
| Lines on, but both line types unchecked | stats "No line type selected" (`.warning`) |
| Empty layout (cannot occur after 08 P2-3b; kept as a guard) | stats "No wall geometry" |
| Over the line cap (6.7.3) | stats "Showing 1 of every k normals (N total, cap 150,000)" (`.warning`); the largest importable wall (200 sections) reaches it with vertex lines alone |
| Normal stats | `formatNormalStats`: `"<v> vertex lines · <L> m"`, `"<f> face lines · <L> m"` or `"<v> vertex + <f> face lines · <L> m"`, with counts from `formatCount` and `L = lengthM.toFixed(3)` |
| A section reversed | Card summary suffix " • Reversed"; the select shows "Reversed"; the viewport shows its cabinet back from the stage (from F1-5) |
| Debug shader fails to compile (driver issue) | three logs the shader error. The override shows nothing useful, and the user can switch back to "As displayed". No crash and no persistence. |

---

## 4. Data model

### 4.1 `WallSection.faceOrientation` (domain, persisted)

| Field | Type | Values | Default | Rule |
|---|---|---|---|---|
| `faceOrientation` | string enum | `'stage'`: the LED side faces where the layout puts the stage (normal = edge direction rotated −90° about +Y; +Z for a flat first section). `'reversed'`: winding swapped and normals negated. | `'stage'` | `WallSection.normalizeFaceOrientation(v)` returns `v === 'reversed' ? 'reversed' : 'stage'` |

Changes to `js/domain/WallSection.js`:

- `static FACE_ORIENTATIONS = Object.freeze(['stage', 'reversed'])` and `static normalizeFaceOrientation(v)`.
- **`SECTION_FIELDS` gains `'faceOrientation'`, appended at the end.** This is the contract of spec 07 (its `domain/WallSection.js` row: "Features add `'faceOrientation'` (F1), `'offset'` and `'locked'` (F2) ... appended at the end") and of spec 02, which appends `'offset'`, `'locked'` and `'detached'` after it and copies it in `clone()`. If 07's `'extensions'` has landed first, `'faceOrientation'` goes after it; either way it is the last key at the time Feature 1 lands.
  - New export `LEGACY_SECTION_FIELDS = Object.freeze([...11 legacy names])`; `SECTION_FIELDS = Object.freeze([...LEGACY_SECTION_FIELDS, /* 07 'extensions' if landed */ 'faceOrientation'])`.
  - The constructor keeps its loop (the B-L8 "no coercion" rule applies to the legacy fields only), then normalises the new key in place: `this.faceOrientation = WallSection.normalizeFaceOrientation(this.faceOrientation)`. The key already exists from the loop, so the own-key order equals `SECTION_FIELDS`.
  - The value is therefore **never `undefined`**, including for v1 imports, `createDefault()` and sections built from any reader.
- `setFaceOrientation(v)`: stores the normalised value and returns it.
- The `summary` getter (the `.section-summary` text, e.g. `'5×3 • 160×96px • Flat'`) appends `' • Reversed'` when reversed. Stage-facing summaries are unchanged.
- `Wall.appendLikeLast` adds `faceOrientation: last.faceOrientation` (already normalised) to its object literal, consistent with "like last". Spec 02's `clone()` copies it through `SECTION_FIELDS`.
- **Test re-baseline (T9a, test code only, no golden output):** the tests that compare a section with a legacy object literal switch to the `LEGACY_SECTION_FIELDS` projection: `domain.test.mjs` 297-301 (the list itself: `SECTION_FIELDS` now has 12 entries and `LEGACY_SECTION_FIELDS` the old 11), 304-311 (`Object.keys(s)` still equals `SECTION_FIELDS`; the value loop runs over `LEGACY_SECTION_FIELDS` and checks `s.faceOrientation === 'stage'` separately), 489, and `wall-controller.test.mjs` 692. The `LegacyProfiles` oracle tests compare geometry, not sections, and are unaffected.

Writers (ARCHITECTURE section 4, amended in T9b, 5.8): the `WallSection` constructor (reached through `createDefault`, `appendLikeLast`, spec 02's `clone` and every reader), `setFaceOrientation`, and through it `WallController.setSectionFaceOrientation` and `flipAllFaceOrientations`. The static domain-writer rule reads that table.

### 4.2 Evaluation: flip by default, plus a user override

| Option | Use case | Cost | Decision |
|---|---|---|---|
| Fixed stage-facing convention | The overwhelming case: walls built left to right around the stage | 0 (08 P2-2) | **Default**, always on |
| Per-section `faceOrientation` with a UI in Feature 1 | Pillars, back-to-back walls, walls built from the far side, mixed layouts | builder flag, panel-plane flip, safe band and coverage σ, one select per card and one button | **Accepted, shipped in Feature 1** (T9a, T9b). It is the user-visible "choose otherwise" that "flipped by default" implies. |
| Per-project "flip all" **flag** | Walls laid out clockwise | trivial | **Rejected as stored state.** A project flag on top of per-section values gives two sources of truth. "Flip LED Side (All Sections)" is an **action** that rewrites the per-section values instead. |
| Export-only "legacy inverted winding" | Pipelines that compensated for the old bug | an extra profile path | **Rejected** (Q5). The LED side control already covers it, applied consistently to viewport and export (CR-4 tells spec 08 to drop its "export option" wording). |
| Mirror UVs when reversed | Content reads correctly from the reversed side | interacts with Feature 4's UV modes | **Not in Feature 1.** Reversal flips facing only; mirroring is Feature 4's "Flip U" (Q3). |

### 4.3 `SectionLayout.facing` (geometry, derived)

- `computeWallLayout` adds `facing: section.faceOrientation === 'reversed' ? -1 : 1` to each `SectionLayout`, which stays frozen. This is the **single derived source** that the builder, safe band and coverage read.
- `WallLayout.flatEdgeFacing()` returns σ per `flatEdges()` segment, in the same order. Segment `i` belongs to the section of `allEdges[i+1]`.
- Under spec 02, every `floorRuns()[r]` gains `facing: number[]` per segment (CR-5).
- The positions, edges and UVs of a reversed section are identical to the stage-facing ones (Q3).

### 4.4 `DebugViewSettings` (domain, **not** persisted)

New file `js/domain/DebugViewSettings.js` (pure). These are viewer preferences, not project data. They are never serialised and reset on reload.

```js
export const DebugShading = Object.freeze({ CONTENT: 'content', FACE_ORIENTATION: 'faceOrientation', NORMAL_COLORS: 'normalColors' });
export const SHADING_CYCLE = Object.freeze(['content', 'faceOrientation', 'normalColors']);

export class DebugViewSettings {
  shading = 'content';
  normals = { enabled: false, vertex: true, face: false, lengthScale: 1, onTop: false };
  /** v = parseFloat(raw); if (!Number.isFinite(v) || v <= 0) return 1;   // zero, negative, empty, NaN: reset to ×1
   *  return Math.min(4, Math.max(0.25, Math.round(v * 4) / 4)) */
  static parseLengthScale(raw)
  /** SHADING_CYCLE[(SHADING_CYCLE.indexOf(this.shading) + 1) % 3] */
  nextShading()
  /** {shading, normals: {...normals}}: a frozen copy for event payloads */
  snapshot()
}
```

### 4.5 Project JSON schema v2

The v2 writer and validator are owned by 08 P2-13e and P2-3b. Their shape, keys and key order are **07 §4.2** (08 §4 names it authoritative; 07 §4.3 is "the authority for paths"; 07 C4 and C5 already settled this feature's two keys). This feature adds exactly one field:

| Path (07 §4.3) | Position in the section object (07 §4.2) | Type | Required | Default | Validation (07 §4.7 issue shape) |
|---|---|---|---|---|---|
| `sections[i].face_orientation` | immediately **after `curvature`**, before F2's `offset` and `locked`, and before `color` (spec 02 relies on the same position) | `"stage" \| "reversed"` | no | `"stage"` | Case-sensitive. Absent gives `"stage"` silently. Any other value gives `"stage"` plus the issue `{path: 'sections[i].face_orientation', code: 'defaulted', severity: 'warning', message: 'unknown LED side "<v>", using "stage"', from: <v>, to: 'stage'}`. |

- **The key is absent until T9b** (07 C39, 07 §4.4 rule 3): no earlier writer writes it, 08 P2-13e included. T9b adds the `ProjectSchema` row, the round-trip and reachability tests and **one** revision bump for this feature release, whose number is assigned at merge time and recorded in `ProjectSchema.REVISIONS` (07 C40). F1-4 re-baselines every JSON export (8.4).
- **Writer (v2, from T9b):** always writes `face_orientation: section.faceOrientation ?? 'stage'` for every section, so it can never emit `undefined`, in the shared serializer. The ZIP JSON entry gets it too, because 08 P2-6a makes both use one serializer.
- **Readers:** v1 has no key; the constructor normalises it to `'stage'`. v2 runs the validator rule above, then passes the value to the constructor. No geometry migration is needed, because JSON stores no geometry.
- **No wall-level key, no debug block, no feature-private migration (07 C4, C5, C39).** No released writer ever produced `wall.conventions` or `display.debug`, so this spec has no import rule for them: a stray key is handled by the validator's generic `dropped-unknown` rule like any other unknown key, and the one migration path is 07's `migrateV1toV2` (07 §4.4 rule 7).
- **Before 08 P2-13e:** the value is session-only. The select's `title` says so (3.2), and the release note states it.
- The v1 writer is **unchanged**, so the v1 golden outputs do not move.
- Debug settings are **not** part of the schema.

### 4.6 Theme additions (`js/theme/Theme.js`) and spec 06 tokens

The keys are written as **literal keys inside** the frozen `SceneTheme` object. Nothing is ever assigned after `deepFreeze`.

```js
export const SceneTheme = deepFreeze({
  background: 0x0a0a0f,
  // ... every existing key unchanged ...
  wallBack: 0x403c37,                                   // F1: cabinet-back shell (wall seen from behind; warm graphite, 2.4)
  debug: {                                              // F1: debug view
    faceFront: 0x2f6bff, faceBack: 0xff3344,            // face orientation (convention colours; never brand them)
    vertexNormal: 0xb8f03c, faceNormal: 0xff4fd8,       // normal-line tips
    lineBaseFactor: 0.35,                               // base colour = tip × factor
  },
});
```

Spec 06's ThemeBridge must produce the same keys. Under spec 06's general rule, each one needs a `--scene-*` token, a `COLOR_BINDINGS` row, a `Theme.js` fallback and ΔE00 ≥ 20 from Pivot Gold (CR-8). `#403C37` is the cabinet colour **everywhere** (07 0.4): the `Theme.js` fallback, `--scene-wall-back`, the `COLOR_BINDINGS` row, 06 §5.12's per-key table and the harness palette hook (8.2):

| Key | Token | Value | ΔE00 to `#F2B705` |
|---|---|---|---|
| `wallBack` | `--scene-wall-back` | `#403C37` | 58.1 |
| `debug.faceFront` | `--scene-face-front` | `#2F6BFF` | 69.3 |
| `debug.faceBack` | `--scene-face-back` | `#FF3344` | 45.9 |
| `debug.vertexNormal` | `--scene-normals` (spec 06's name) | `#B8F03C` (lime) | 27.3 |
| `debug.faceNormal` | `--scene-normals-face` | `#FF4FD8` (magenta) | 67.5 |

**Why lime rather than spec 06's Sky `#58A6E8`, and not the old yellow.**

- The old yellow `#FFD23F` is ΔE00 7.0 from Pivot Gold, which breaks spec 06's U6 rule.
- Sky is ΔE00 18.9 from the face-orientation blue, so it disappears exactly when both debug modes are on.
- Lime is ΔE00 40.7 from the default wall cyan and 75.9 from the face blue, with 14.7:1 contrast on the scene background.
- Its luminance is close to cyan (1.04:1). The 35 % base gradient and "Draw on top" compensate.

---

## 5. Architecture

### 5.1 Module map

| Path | Status | Responsibility in this feature | Task |
|---|---|---|---|
| `js/geometry/WallMeshBuilder.js` | changed | `quadIndices` with a required `winding` and `reversed`; σ in `sectionGrid`; `panelQuadIndices`/`panelFacingNormal` with `reversed`; `panelShell(sl)` | T9a, T10 |
| `js/geometry/WallLayout.js` | changed | `SectionLayout.facing`, `flatEdgeFacing()` | T9a |
| `js/geometry/SafeDistanceBand.js` (08 P2-5b) | changed | per-segment σ, split vertex where σ changes, +Y index order (6.4) | T9a |
| `js/geometry/FrustumCoverage.js` (08 P2-11) | changed | per-quad stage normal × σ (6.4) | T9a |
| `js/geometry/NormalLines.js` | **new** (pure) | auto length, decimation (`MAX_NORMAL_LINES = 150,000`), vertex- and face-line writers, `uploadCount`, `formatCount`, `formatNormalStats` | T3 |
| `js/geometry/MeshProfiles.js` (after 08 P2-13g) or `js/legacy/LegacyCompat.js` | changed | `viewport.side: 'double' → 'front'` | T10 |
| `js/io/ProjectSerializer.js`, `js/io/ProjectValidator.js`, `js/io/ProjectSchema.js` (08) | changed | the `face_orientation` schema row, write, read and rule, with this feature's revision bump (4.5) | T9b |
| `js/render/LEDMaterialFactory.js` | changed | `#side()` case `'front'`; `backShell()`; `isFrontSided()` | T10 |
| `js/render/LEDWallView.js` | changed | `setDebugShading` through `MaterialOverride`; `withContentMaterials(fn)` for stills (07 C48); panel-plane flip for reversed sections; back shells; `pickMeshes()` (its one named owner, 07 C52); `sectionNodes().backMeshes` | T5, T9a, T10 |
| `js/render/MaterialOverride.js` | **new** | stash and restore of original materials; imports nothing, so it is Node-tested | T5 |
| `js/render/wallMeshTags.js` | **new** | `backShellUserData`, `pickList`; imports nothing, so it is Node-tested (AC 10) | T10 |
| `js/render/DebugMaterials.js` | **new** | shared face-orientation and normal-colour `ShaderMaterial`s and the line material | T5 |
| `js/render/NormalsDebugView.js` | **new** | merged normal `LineSegments` on `HELPERS`; subscribes to `WALL_REBUILT` (and, from spec 02, `SECTION_CHANGED` with `live`); writes `#debug-normals-stats` once that element exists (T7) | T4 (stats element: T7) |
| `js/render/SceneManager.js` | changed | `init()`: `camera.layers.enable(LAYERS.HELPERS)`. This is idempotent; 07 R1 later owns the layer table and moves the lines to `LAYERS.DEBUG`. | T4 |
| `js/render/ResourceTracker.js` | changed | `disposeObject3D` de-duplicates shared geometry and materials within one call (this spec is its one named owner, 07 C52; spec 04 UV-7 consumes it) | T10 |
| `js/core/EventBus.js` | changed | `DEBUG_VIEW_CHANGED`, added in the **same step as its subscriber** `DebugViewControls` (ARCHITECTURE 5.1 rule 7) | **T7** |
| `js/core/typingTarget.js` (08 P2-9b) | consumed | `isTypingTarget(t)`: 07 §3.8's table, the single definition, created by 08 P2-9b (07 C18, C52) | T7 |
| `js/core/renderOrder.js` | **new** | `RENDER_ORDER` registry of every overlay slot of **every** spec, the single source (5.5, CR-10; 07 0.4) | T4 |
| `js/interaction/TransformGizmo.js` | changed (one line, value unchanged) | `group.renderOrder = RENDER_ORDER.GIZMO` instead of the literal `999`, so the new static rule (8.1) holds | T4 |
| `js/domain/WallSection.js`, `js/domain/Wall.js` | changed | `faceOrientation`, `LEGACY_SECTION_FIELDS`, `SECTION_FIELDS` + `'faceOrientation'` (4.1) | T9a |
| `js/domain/DebugViewSettings.js` | **new** | debug preferences (4.4) | T6 |
| `js/app/DebugViewController.js` | **new** | debug-view use cases. T6: model write, then the render call. T7 adds `bus` and `#emit()` of `DEBUG_VIEW_CHANGED`. | T6, T7 |
| `js/app/WallController.js` | changed | `setSectionFaceOrientation`, `flipAllFaceOrientations` | T9b |
| `js/ui/DebugViewControls.js` | **new** | toolbar buttons, popover (placement, focus, blur rule, Escape: capture listener until 07 I1, then registry priority 70), legend in `#viewport-top-stack`, announcer, N / Shift+N | T7 |
| `js/ui/SectionListPanel.js` | changed | LED Side row (`data-section-flag`), `#flip-all-sections`, summary suffix, aria-label on rename | T9b |
| `js/app/App.js` | changed | construction and wiring (5.7) | T6, T7, T9b, T10 |
| `index.html` | changed | toolbar buttons, divider, popover (incl. `#debug-normals-stats`), legend and announcer markup in `.viewport-overlay`; `<link>` to `css/features/debug-view.css`; `#flip-all-sections`; help-badge text `… P=pilot N=normals` | T7, T9b |
| `css/features/debug-view.css` | **new** | `.view-btn.active` (this spec's T7 is its one named owner, 07 C52), `.view-divider`, `.debug-popover*`, `.debug-legend*` (swatches via `var(--swatch)`), `#viewport-top-stack` (if this feature lands first), `.visually-hidden`, the `@media` overflow fallback of `.viewport-controls` (3.1), `.section-face-select`, `.flip-all-btn`. Linked in the `css/features/*` block of 07 C52's link order (`00-fonts`, `01-11`, `css/features/*`, `12-responsive`, `20-29`, `99-utilities`); carries its own `@media` rules. Colours only through `02-tokens.css` custom properties (spec 06 R-B1); spec 06 T4a maps the `.view-btn.active` rule to role tokens. | T7, T9b |
| `css/09-viewport-tools.css` | header comment only | the `Legacy note B-L24` paragraph loses its `.view-btn.active` sentence and keeps the overlap half (5.4) | T7 |
| `tests/static/css-slices.mjs` | unchanged | 07 S7 runs it with `--report-only`, scoped to `01-12`, from the first intentional CSS change, so `css/features/` is never scanned (07 C52) | - |
| `tools/check-orientation.mjs` | **extended** (08 P2-0 ships the OBJ/glTF file form) | ZIP entries and recursive directories | T1 |
| `tools/make-cap-wall.mjs`, `tests/fixtures/normals-max-wall.json` | **new** | the largest importable wall (**200** sections × 50×20, `Wall.MAX_SECTIONS`, v1 file, combined) for the manual cap timing (8.3) | T1 |
| `tests/regression/compare.mjs`, `tests/regression/measure-rects.mjs` (**new**), `tests/regression/lib/palette.mjs` (**new**) | changed / new | rect allowances as a `rects` field on `--expect` manifest entries (per-pixel rule, frame-size check) and `--diff-bbox` reporting; the rectangle measurement tool (8.4); the live palette hook `livePalette(page)` that colour probes read instead of literals (07 C53). Part of the harness-only PR series 08 P2-0 → this T2 → 07 G3 (07 C57). | T2 |
| `tests/regression/run.mjs` | changed | `--probe-backfaces` instrumented run for the F1-5 manifest (8.4); never produces a promotable baseline | T10 |
| `tests/regression/scenarios-extra.mjs`, `scenarios.mjs`, `lib/app.mjs`, `lib/probe.mjs` | changed / new | the `normals_debug` scenario; `screenshotElement`, `pointerClick`, `overlayRects`; N keys with modifiers; probe helpers; `findPersonPixel` exported | T8 |

### 5.2 Signatures

#### `js/geometry/WallMeshBuilder.js`

```js
/** `winding` is REQUIRED: the Phase 1 default 'legacy-cw' is removed, so the old bug can never be a silent default.
 *  'ccw'                  -> [bl, br, tr, bl, tr, tl]   (08 P2-2a; same BL–TR diagonal as legacy and PlaneGeometry)
 *  'ccw' + reversed       -> [bl, tr, br, bl, tl, tr]   (2nd/3rd index of each triangle swapped)
 *  'legacy-cw'            -> [bl, tl, tr, bl, tr, br]   (LegacyProfiles oracle only)
 *  'legacy-cw' + reversed -> throw unsupportedStrategy('mesh.winding+reversed', winding)
 *  any other value, including undefined -> throw unsupportedStrategy('mesh.winding', winding) */
export function quadIndices(bl, br, tl, tr, winding, reversed = false)

export class WallMeshBuilder {
  /** 08 §6.4 'averaged' (with CR-1) or 'right-panel'/'none', then F1: σ = sl.facing ?? 1;
   *  every pushed normal is multiplied by σ; indices: quadIndices(bl, br, tl, tr, this.profile.winding, σ < 0) */
  sectionGrid(sl, opts, out)
  combinedGrid(layout, atlas)                     // unchanged signature; σ is applied per section through sectionGrid
  panelCorners(panel, panelW, panelH)             // unchanged
  /** quadIndices(base, base + 1, base + 3, base + 2, profile.winding, reversed); 'ccw': [b, b+1, b+2, b, b+2, b+3] */
  panelQuadIndices(base, reversed = false)
  /** 'facing': {x: Math.sin(panel.rotY), y: 0, z: Math.cos(panel.rotY)}, negated when reversed */
  panelFacingNormal(panel, reversed = false)
  /** The back shell of ONE section in panel mode, in base-layout coordinates (no postTransform):
   *  positions from panelCorners for every panel of sl; indices panelQuadIndices(4k, sl.facing < 0); no normals or UVs.
   *  @returns {{positions: number[], indices: number[]}}   (4·panels vertices, 6·panels indices) */
  panelShell(sl)
}
```

#### `js/geometry/NormalLines.js` (pure, Node-tested)

```js
export const MAX_NORMAL_LINES = 150000;   // 6.7.3: reachable by the largest importable wall with both line kinds on
/** 6.7.4. @param {WallLayout} layout @param {number} scale @returns {number} metres (0 for an empty layout) */
export function autoNormalLength(layout, scale = 1)
/** Math.max(1, Math.ceil(total / cap)) */
export function decimationStride(total, cap = MAX_NORMAL_LINES)
/** {vertexLines, faceLines} for a list of descriptors {vertexCount, indexCount}. A face line is one quad
 *  (indexCount / 6), or one triangle when indexCount % 6 !== 0. */
export function countNormalLines(meshes, { vertex, face })
/** Appends vertex-normal lines. src = {positions, normals, matrix: ArrayLike<number>(16) column-major,
 *  normalMatrix: ArrayLike<number>(9) column-major}. out = {positions: Float32Array, colors: Float32Array,
 *  count, seen} (seen = the running sample counter). opts = {length, stride, tip: [r,g,b], baseFactor}.
 *  Writes 2 vertices per kept sample; allocates nothing. @returns {number} lines written */
export function writeVertexNormalLines(out, src, opts)
/** One face-normal line per quad (index groups of 6), or per triangle if index.length % 6 !== 0.
 *  src = {positions, index: ArrayLike<number> | null, matrix, normalMatrix}. @returns {number} lines written */
export function writeFaceNormalLines(out, src, opts)
/** Floats to upload per attribute for `written` lines: 2 vertices × 3 components (6.7.5 updateRange) */
export function uploadCount(written)
/** en-US digit grouping with a fixed regex (no Intl, no locale): 3444 -> '3,444' */
export function formatCount(n)
/** The #debug-normals-stats text and its warning flag (3.5): {text, warning} */
export function formatNormalStats({ vertexLines, faceLines, total, stride, lengthM, vertex, face, empty })
```

#### `js/render/MaterialOverride.js` (imports nothing, Node-tested with plain objects)

```js
export class MaterialOverride {
  /** For each mesh: if it is not stashed yet, stash mesh.material; then mesh.material = material. Idempotent.
   *  The stash holds mesh.material by reference, so a Material[] (spec 04's per-section Combined layout) is restored
   *  intact. The debug material is applied as one material: r128 then draws the whole index range and ignores the
   *  geometry groups (04 2.3 row 01-1). */
  apply(meshes, material)
  /** Puts every stashed material back on its mesh and clears the stash. @returns {number} restored count */
  restore()
  get active()   // stash size > 0
}
```

#### `js/render/wallMeshTags.js` (imports nothing, Node-tested with plain objects; T10)

```js
/** {kind: 'led-wall-back', mode, sectionId, sectionIndex, sectionRanges} copied from the LED mesh's userData
 *  (panel mode: from the section's first panel mesh; col and row are not copied);
 *  sectionRanges is the SAME array reference (combined mode), or absent when the LED mesh has none. */
export function backShellUserData(ledUserData)
/** From a list of objects (the wall group's descendants in add order): {meshes, backMeshes, pick}, where meshes are
 *  kind 'led-wall', backMeshes kind 'led-wall-back', and pick = [...meshes, ...backMeshes]. */
export function pickList(objects)
```

#### `js/render/DebugMaterials.js`

```js
export class DebugMaterials {
  /** @param {{theme: {scene: SceneTheme}}} deps   (no allocation in the constructor) */
  constructor({ theme })
  faceOrientation()          // lazily created, shared ShaderMaterial (DoubleSide); uniforms uFront/uBack from theme.scene.debug
  normalColors()             // lazily created, shared ShaderMaterial (DoubleSide)
  forShading(mode)           // mode -> material, or null for 'content'
  lineMaterial({ onTop })    // lazily created LineBasicMaterial({vertexColors: true, toneMapped: false}); depthTest = !onTop
  dispose()                  // App teardown only; never called by a wall rebuild
}
```

#### `js/render/LEDMaterialFactory.js`

```js
/** #side(): switch (profile.side) { case 'double': return THREE.DoubleSide; case 'front': return THREE.FrontSide;
 *  default: throw unsupportedStrategy('mesh.viewport.side', profile.side) }
 *  profile = Strategies.mesh.viewport (MeshProfiles.viewport after 08 P2-13g) */
/** A new MeshBasicMaterial({color: theme.scene.wallBack, side: THREE.BackSide, wireframe: false}).
 *  One per rebuild, shared by every back-shell mesh of that rebuild, and disposed with the wall group. deps gain theme. */
backShell()
/** this.#side() === THREE.FrontSide (LEDWallView builds the back shells only then) */
isFrontSided()
```

#### `js/render/LEDWallView.js`

```js
export class LEDWallView {
  /** deps gain debugMaterials: DebugMaterials */
  constructor({ sceneManager, materials, builder, theme, debugMaterials })
  /** Phase 1 steps (and spec 02's), amended:
   *  0. #override.restore(): put the originals back BEFORE step 1, so step 1 disposes real materials and never
   *     the shared debug materials
   *  1-3. as before; #buildPanels flips the PlaneGeometry of reversed sections in place (6.5)
   *  3b. if (materials.isFrontSided()) #buildBackShells(meshMode, layout)   (6.9)
   *  4-5. frames, scene.add
   *  6. if (#shading !== 'content') #applyShading()
   *  Stores display (for wireframe) as #display. */
  rebuild({ layout, meshMode, display })
  /** 07 C48: for stills and screenshots. If an override is active: #override.restore(); try { return fn() }
   *  finally { re-apply the current shading (#applyShading()) }. Otherwise just fn(). Restores the back-mesh
   *  visibility the same way. Synchronous; PreviewPass.capture and 09's captureCanvas call it unless include.debug. */
  withContentMaterials(fn)
  meshes()          // LED meshes only (userData.kind === 'led-wall'), in add order
  backMeshes()      // userData.kind === 'led-wall-back'
  pickMeshes()      // (F1-5; owned here, 07 C52; consumed by specs 02 and 04) meshes() followed by backMeshes(); a flat list, so no recursive
                    // raycast is needed. meshes(), backMeshes() and pickMeshes() delegate to wallMeshTags.pickList,
                    // and #buildBackShells tags each shell with wallMeshTags.backShellUserData, so both are
                    // Node-tested with plain objects (AC 10); the first viewport consumer is Feature 2.
  sectionNodes()    // entries gain backMeshes: Mesh[]
  /** 'content': #override.restore(); back meshes visible = !#display.wireframe.
   *  Otherwise: mat = debugMaterials.forShading(mode); mat.wireframe = #display.wireframe;
   *  #override.apply(meshes(), mat); back meshes hidden. Idempotent. No event. */
  setDebugShading(mode)
  /** spec 02's transform-only fast path, amended: in panel mode it also writes the shell matrix of each affected
   *  section (6.9). Combined/section shells share geometry with their LED mesh and follow automatically. */
  updateSectionTransforms(layout, sectionIds)
}
```

#### `js/render/NormalsDebugView.js`

```js
export class NormalsDebugView {
  /** Subscribes in the constructor (R3: touches only its own LineSegments and its stats element):
   *   WALL_REBUILT ({layout, view}) => { #last = {layout, view}; if (settings.normals.enabled) sync() }
   *   SECTION_CHANGED ({live}) => { if (live && settings.normals.enabled && #last) sync({keepLength: true}) }
   *     ('section:changed', spec 02 5.3 and ARCHITECTURE 9. The key does not exist before Feature 2; spec 02 T6 adds
   *      this subscription line with exactly this handler, including keepLength: CR-5.)
   *  elements.stats is optional: F1-1 constructs the view before the markup exists (T7 adds #debug-normals-stats
   *  and its lookup); every stats write is guarded by `if (this.#stats)`.
   *  @param {{sceneManager: SceneManager, bus: EventBus, settings: DebugViewSettings, materials: DebugMaterials,
   *           theme: {scene: SceneTheme}, elements?: {stats?: HTMLElement|null}}} deps */
  constructor({ sceneManager, bus, settings, materials, theme, elements = {} })
  get object3D()      // LineSegments | null
  get stats()         // {vertexLines, faceLines, total, stride, lengthM} | null
  /** Re-reads the settings. Disabled, or no layout yet: #remove(). Enabled: (re)build per 6.7, reusing buffers
   *  when capacity allows; keepLength reuses the previous L (live drags). lines.layers.set(LAYERS.HELPERS);
   *  lines.raycast = () => {}; frustumCulled = false; matrixAutoUpdate = false; userData.helper = true;
   *  renderOrder = onTop ? RENDER_ORDER.NORMAL_LINES_ON_TOP : RENDER_ORDER.DEFAULT; sceneManager.addHelper(lines)
   *  on first build; if the stats element exists: textContent and .warning from formatNormalStats. */
  sync({ keepLength = false } = {})
  dispose()           // sceneManager.removeHelper(lines); geometry.dispose(); lines = null; stats text ''
}
```

#### `js/app/DebugViewController.js`

```js
export class DebugViewController {
  /** @param {{settings: DebugViewSettings, wallView: LEDWallView, normalsView: NormalsDebugView, bus?: EventBus}} deps
   *  F1-1 (T6) has no bus and no event: each use case writes the model, then makes its render call.
   *  F1-2 (T7) adds `bus`, the DEBUG_VIEW_CHANGED key and #emit() together with the event's subscriber
   *  (DebugViewControls), so ARCHITECTURE 5.1 rule 7 and the static "emitted and subscribed" check hold at every step. */
  constructor({ settings, wallView, normalsView, bus })
  toggleNormals()                   // settings.normals.enabled = !enabled; #emit(); normalsView.sync()
  setNormalLineKinds({ vertex, face })   // assign the booleans provided; #emit(); normalsView.sync()
  setLengthScale(raw)               // settings.normals.lengthScale = DebugViewSettings.parseLengthScale(raw); #emit();
                                    // normalsView.sync(); returns the stored value
  setOnTop(on)                      // settings.normals.onTop = !!on; #emit(); normalsView.sync()
  setShading(mode)                  // settings.shading = (mode is a DebugShading value ? mode : 'content'); #emit();
                                    // wallView.setDebugShading(settings.shading)
  cycleShading()                    // setShading(settings.nextShading())
  /** private #emit() (from T7): bus.emit(DEBUG_VIEW_CHANGED, settings.snapshot())  (R2: model, then mirror, then render).
   *  In T6 the #emit() calls are absent; T7 inserts them at the positions shown. */
}
```

#### `js/ui/DebugViewControls.js`

```js
export class DebugViewControls {
  /** Owns #toggle-normals, #debug-view-btn, #debug-view-popover and every control inside it except
   *  #debug-normals-stats, plus #debug-view-legend and #debug-view-status. Subscribes DEBUG_VIEW_CHANGED -> #mirror(snapshot):
   *  button .active and aria-pressed, radios/checkboxes/range/value text, legend visibility and text,
   *  and #announce(message) (debounced 400 ms). Sets each legend swatch's --swatch from theme.scene.
   *  @param {{doc: Document, win: Window, controller: DebugViewController, bus: EventBus, theme: {scene: SceneTheme}}} deps */
  constructor({ doc, win, controller, bus, theme })
  /** Button, popover and input listeners (change for radios/checkboxes, input + change for the range), the
   *  outside-pointerdown close, until 07 I1 the open-only capture-phase Escape listener on doc (Escape only, 3.2),
   *  the pointer-change blur rule and its flag clearing (3.2), keyboard-vs-pointer open focus, and the resize
   *  listener while open. From 07 I1: viewportInput.registerEscapeHandler(70, () => this.isPopoverOpen() &&
   *  (this.closePopover(), true)) instead of the capture listener (07 C42). */
  bind()
  /** true while the popover is shown (read by the Escape registry entry at priority 70) */
  isPopoverOpen()
  /** closes the popover; focus returns to #debug-view-btn iff it was inside the popover */
  closePopover()
  /** Until 07 I1: doc keydown, bubble phase, registered after ViewportInput.attachShortcuts:
   *  if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
   *  if (e.key.toLowerCase() === 'n') { e.shiftKey ? controller.cycleShading() : controller.toggleNormals() }
   *  After 07 I1: registers the actions debug.normals / debug.cycleShading through viewportInput.registerActions
   *  instead of adding a listener (3.4). */
  bindShortcuts()
}
```

#### `js/core/typingTarget.js` and `js/core/renderOrder.js`

```js
// js/core/typingTarget.js: 07 §3.8 verbatim (07 C18). Created by 08 P2-9b, its one named owner (07 C52); T7 consumes it.
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'range']);
/** The truth table of 3.4 (07 §3.8). */
export function isTypingTarget(t)
// 07 I1 adds isMovementBlockedTarget(t) to the same module; Feature 1 does not use it.

// js/core/renderOrder.js: every non-default renderOrder slot of the app, in one place (5.5, CR-10). The single source for
// every spec (07 0.4); each slot lands with its owning spec, and no spec writes a literal >= 900 elsewhere.
export const RENDER_ORDER = Object.freeze({
  HDRI_BACKDROP: -1e6,        // spec 05 backdrop dome
  DEFAULT: 0,
  RIG_CORE: 1,                // spec 06 CameraRigView dashed core over its halo (halo at DEFAULT)
  INNER_FRUSTUM_OVERLAY: 990, // spec 09 X9 InnerFrustumView (depth-tested; below every line overlay)
  MEASURE: 992,               // spec 09 X13 MeasureView
  HDRI_MARKER: 993,           // spec 05 projection-point marker
  UV_HOVER_OUTLINE: 994,      // spec 04 UvHighlightView
  NORMAL_LINES_ON_TOP: 995,   // F1 "Draw on top"
  PIVOT_MARKER: 996,          // spec 03 PivotMarkerView
  HIGHLIGHT_HALO: 997,        // spec 06 halo of SectionHighlightView
  SECTION_HIGHLIGHT: 998,     // spec 02 SectionHighlightView (spec 06's dashed core)
  GIZMO: 999,                 // TransformGizmo (legacy value)
});
```

#### `js/app/WallController.js` and `js/ui/SectionListPanel.js` (T9b)

```js
// WallController (model only; the caller then runs commitSectionEdit(), as in the number-field flow, PR4)
setSectionFaceOrientation(section, value)   // section.setFaceOrientation(value); returns the stored value
flipAllFaceOrientations()                   // each section: 'stage' <-> 'reversed'; returns the new values in order

// SectionListPanel
bindFlipAllButton()                         // #flip-all-sections click -> flipAllFaceOrientations(); patch every card
                                            // (select value, summary); wallController.commitSectionEdit()
// card change handler (its own listener, not the data-field number handler):
//   select[data-section-flag="faceOrientation"] -> setSectionFaceOrientation -> #patchCard -> commitSectionEdit()
// rename path: also rewrites the select's aria-label "LED side of <new name>"
```

No event is needed: the panel patches its own cards, and `rebuild()` emits `WALL_REBUILT`.

### 5.3 Events

| Event | Payload | Emitted by (exact point) | Subscribers |
|---|---|---|---|
| `debug:viewChanged` (`DEBUG_VIEW_CHANGED`) **new in F1-2 (T7)**; classified **visual** in the `Events` catalogue (07 C47) | `{shading, normals: {enabled, vertex, face, lengthScale, onTop}}` | `DebugViewController` after every settings write, before the render call | `DebugViewControls` (mirror and announcer), added in the same step (5.1 rule 7) |
| `wall:rebuilt` (`WALL_REBUILT`), existing | `{layout, meshMode, view}` | `WallController.rebuild` step 6 | **new:** `NormalsDebugView` (the first real subscriber of the seam; F1-1) |
| `section:changed` (`SECTION_CHANGED`), spec 02 (ARCHITECTURE 9's name) | `{ids, fields, source, live}` | `WallController`; for `live: true`, after `view.updateSectionTransforms` | **plus** `NormalsDebugView` (live only: `sync({keepLength: true})`, so lines follow drags). Spec 02 T6 adds this subscription (CR-5). |

**No other event is needed.**

- The shading override is re-applied by `LEDWallView.rebuild` itself, as a direct step. It is not a subscription, so ordering stays explicit (R2).
- The stats text is written by `NormalsDebugView` into the element it owns, inside its own subscriber. It never emits (R3).

### 5.4 Profile and `Strategies` changes

The B-H1, B-H2 and B-L3 flips and their `LEGACY_SITES` retirements belong to spec 08 (P2-2a-d, 08 §4.1). This feature changes one kept key:

| Step | Key: old → new | Nature | LEGACY rows |
|---|---|---|---|
| F1-2 | none (CSS) | B-L24 is split: this step adds `.view-btn.active` (in `css/features/debug-view.css`). The badge overlap stays open for Feature 6 (or 08 P2-13d). | **Narrowed, not retired:** the `Legacy note B-L24` paragraph in the header of `css/09-viewport-tools.css` drops its `.view-btn.active` sentence and keeps the overlap sentence; `css/07-viewport.css`'s note (overlap only) is unchanged. ARCHITECTURE 8.2 (quirk register) and 8.3 (the two documentation entries) are narrowed to the overlap half in the same commit. The bug id therefore stays in `LEGACY_SITES`. |
| F1-5 | `mesh.viewport.side: 'double' → 'front'` (in `MeshProfiles.viewport` after 08 P2-13g) | A kept design-choice key. 08 §4.1 says "`'front'` would be a Feature 1/5 option (Q3)". `LegacyProfiles` keeps `'double'`. | none (08 P2-2a already retired `LEDMaterialFactory.js#side`) |

- Reversal is **model data** (`sl.facing`), not a strategy. Every profile handles it, and `'legacy-cw'` rejects it explicitly.
- `mesh.gltf.attributes` is read with spec 04's iterate-and-switch rule (implemented with 08 P2-2d's NORMAL case). Feature 1 adds no case.
- `mesh.gltf.doubleSided` stays `'omit'` (Q6).

### 5.5 Render layers, render order and helper exclusion

| Consumer | Mechanism | Guarantee |
|---|---|---|
| Main camera | `SceneManager.init`: `camera.layers.enable(LAYERS.HELPERS)` right after the camera is created | Lines render in the main view and in pilot mode. When 07 R1 lands, the lines move to `LAYERS.DEBUG` (3), which 07 keeps visible in pilot (07 §0.2). |
| Camera preview (`PreviewWindow`, or 07 R2's scissor pass) | Its camera keeps layer 0 only (from 07 R1: `DEFAULT \| ENVIRONMENT`). Feature 1 does not touch it. | Lines never appear in the preview |
| Picking (`PointerRay`, `SelectionManager.pickAt`, `TransformGizmo`) | The raycaster's default mask is layer 0; `lines.raycast = () => {}`; lines are in no `pickMeshes()` list | Still excluded once 07 R1 calls `PointerRay.layers.enableAll()` |
| Back shells (from F1-5) | In `pickMeshes()`. They are `BackSide`, so r128 hits them from behind (2.3). Their `userData` copies the LED mesh tags (`sectionId`, `sectionIndex`, and `sectionRanges` in combined mode); a panel-mode shell covers one section, so `sectionId` alone resolves it. `WallSectionSelectable` (spec 02) resolves the section the same way. | `pickMeshes()` contents are unit-tested here. Picking from behind is observable once Feature 2 picks sections (legacy picks only the camera, person and car); spec 02 R6 is resolved by these shells. |
| Render order | `RENDER_ORDER` in `core/renderOrder.js` (5.2): spec 05 backdrop −1e6, spec 06 rig core 1, spec 09 inner-frustum overlay 990 (depth-tested), spec 09 measurement 992, spec 05 HDRI marker 993, spec 04 UV hover outline 994, lines on top 995, spec 03 pivot marker 996, spec 06 highlight halo 997, spec 02 section highlight 998, gizmo 999 | No two overlays share a value (CR-10). Static rule (8.1, and 07 S10 for every spec): no numeric `renderOrder` literal **≥ 900** outside `core/renderOrder.js`; lower values (0, 1, the backdrop) are allowed in place but are listed in the registry for documentation. |
| Exports | Exporters read `layoutProject(project)`, never the scene. `exportSafeDistanceOBJ` reads only the band geometry. | Exports are identical with debug on or off (AC 8). Rule for any future scene-graph exporter: skip objects where `!object.layers.test(defaultLayers)` or `userData.helper === true`. |
| Existing helpers (grid, axes, rig, safe distance, gizmo) | **Untouched by this spec.** Moving them to `HELPERS` is B-M11 / F0-e: spec 07 R1 (or 08 P2-10a's preview hiding). | No preview pixel changes from this feature (CR-6 corrects spec 03's expectation) |

### 5.6 Ownership

**DOM ids:**

- `DebugViewControls` owns `#toggle-normals`, `#debug-view-btn`, `#debug-view-popover`, `#debug-view-title`, `#debug-shading-content`, `#debug-shading-face`, `#debug-shading-normals`, `#debug-normals-vertex`, `#debug-normals-face`, `#debug-normals-scale`, `#debug-normals-scale-value`, `#debug-normals-ontop`, `#debug-view-close`, `#debug-view-legend` and `#debug-view-status`.
- `NormalsDebugView` owns `#debug-normals-stats`. `App.js` looks it up and injects it, following the `PreviewWindow` precedent (amend the App lookup list in ARCHITECTURE 3.11). The markup, the lookup and the ownership entry all land in F1-2 (T7), so the static DOM-id check never names a missing id.
- `SectionListPanel` owns `#flip-all-sections` (until spec 02 T12 moves it, id kept, to `SectionToolbar`) and every `select[data-section-flag="faceOrientation"]`, because it owns every card.

**Writers:**

- `DebugViewSettings` fields are written only by `DebugViewController`.
- `WallSection.faceOrientation` is written by the constructor (readers), `setFaceOrientation`, and through it by `WallController.setSectionFaceOrientation` / `flipAllFaceOrientations`.
- `LEDWallView` is the only writer of wall mesh `.material` and `.visible`, through `MaterialOverride` for overrides.

### 5.7 Composition (`App.js`)

```
// F1-1 (T4-T6). Construct after sceneManager, before the bootstrap rebuild.
debugSettings   = new DebugViewSettings()
debugMaterials  = new DebugMaterials({ theme })
wallView        = new LEDWallView({ sceneManager, materials, builder: viewportBuilder, theme, debugMaterials })
normalsView     = new NormalsDebugView({ sceneManager, bus, settings: debugSettings, materials: debugMaterials, theme })
                                                       // subscribes WALL_REBUILT; no stats element yet
debugController = new DebugViewController({ settings: debugSettings, wallView, normalsView })   // no bus, no event

// F1-2 (T7) amends the same lines:
normalsView     = new NormalsDebugView({ ..., elements: { stats: byId(doc, 'debug-normals-stats') } })
debugController = new DebugViewController({ settings: debugSettings, wallView, normalsView, bus })
debugControls   = new DebugViewControls({ doc, win, controller: debugController, bus, theme })
// setupUI phase, after toolbar.bind(), viewportInput.attachShortcuts(), viewportInput.attachPointer(), sectionList.bind...()
debugControls.bind(); debugControls.bindShortcuts()

// F1-4 (T9b): sectionList.bindFlipAllButton()
// F1-5 (T10): materials = new LEDMaterialFactory({ display, panelIds, ledTiles, theme })   // + theme (backShell colour)
```

`NormalsDebugView` is constructed before `wallController.rebuild()` (bootstrap), so it caches the first layout even while disabled. Caching keeps a reference only and allocates nothing.

### 5.8 Amendments to ARCHITECTURE.md (same commit as the code, per REFACTOR_PLAN 7)

1. 2.1 and 2.2: the new files, including `css/features/debug-view.css` (07 C52's link order) and `core/renderOrder.js` (and its use in `TransformGizmo`).
2. 3.4: `SceneTheme.wallBack` and `debug`.
3. 3.5: `WallSection.faceOrientation`, `LEGACY_SECTION_FIELDS`, `SECTION_FIELDS` + `'faceOrientation'`; `DebugViewSettings`.
4. 3.6: `SectionLayout.facing`, `flatEdgeFacing`, `quadIndices` (required winding plus `reversed`), `panelQuadIndices`, `panelFacingNormal`, `panelShell`, `NormalLines`.
5. 3.7: `LEDWallView` (override, shells, `pickMeshes`), `LEDMaterialFactory`, `SceneManager.init`, `MaterialOverride`, `DebugMaterials`, `NormalsDebugView`, `disposeObject3D` de-duplication.
6. 3.9: `face_orientation` in v2 (07 §4.2 position), its `ProjectSchema` row and revision.
7. 3.10 and 3.11: `DebugViewController`, `DebugViewControls`, the `WallController` and `SectionListPanel` additions, and the App lookup list.
8. **4 (state model and writers):** new rows `WallSection.faceOrientation` (writers: the `WallSection` constructor via its callers, `setFaceOrientation` via `WallController.setSectionFaceOrientation` / `flipAllFaceOrientations`) and `DebugViewSettings.shading`, `.normals.*` (writer: `DebugViewController`). The static domain-writer rule reads this table, so the rows land with the code that writes them (T6, T9a/b).
9. 5.2: the event table (`DEBUG_VIEW_CHANGED` in F1-2, not F1-1).
10. 7: the bootstrap.
11. 8.1: the `side` row.
12. **8.2 and 8.3:** the B-L24 quirk-register row and its two documentation entries narrowed to the badge-overlap half (F1-2, same commit as `.view-btn.active` and the `css/09-viewport-tools.css` header edit).
13. 9: Feature 1 marked done.
14. 10: the static rule (render-order literal ≥ 900, for every spec).

---

## 6. Algorithms and math

### 6.1 Conventions

- Units are metres. Y is up. The wall stands on y = 0.
- **Stage side** is the side the normal points to. For an edge heading `a`, the stage-facing normal is `n = (−sin a, 0, cos a)`: the edge direction rotated −90° about +Y, which is +Z for the first flat section. A reversed section uses `σ·n` with σ = −1.
- Front faces are **counter-clockwise when seen from the side the normal points to**. This is the three.js, glTF and OBJ convention.
- The origin is the first section's first bottom-edge vertex in legacy. Feature 3 bakes its pivot into the layout (spec 03 D4), which does not affect normals.
- All wall transforms are **rigid** (det = +1). Feature 2's offsets are rotation plus translation, and `layoutProject` asserts `det > 0` for every `postTransform`. A mirrored transform would make three flip `frontFace` (`frontFaceCW`) while the exporters would not.

### 6.2 Winding (normative: 08 §6.4; Feature 1 adds `reversed`)

For a grid cell with `bl = base + row·vpr + col`, `br = bl + 1`, `tl = base + (row+1)·vpr + col`, `tr = tl + 1`:

```
ccw (stage)     : (bl, br, tr), (bl, tr, tl)       // 08 P2-2a
ccw + reversed  : (bl, tr, br), (bl, tl, tr)       // F1 (T9a)
legacy-cw       : (bl, tl, tr), (bl, tr, br)       // LegacyProfiles oracle only
```

All three split along the BL–TR diagonal, so per-triangle UV interpolation is unchanged.

- Flat wall: `(br − bl) × (tr − bl) = (dx,0,0) × (dx,h,0) = (0, 0, dx·h)`, which is +Z.
- Reversed: `(tr − bl) × (br − bl) = (0, 0, −dx·h)`, which is −Z, matching σ·n.
- Panel quads with corners BL=0, BR=1, TR=2, TL=3: `'ccw'` gives `[0,1,2,0,2,3]`, and reversed gives `[0,2,1,0,3,2]`.

### 6.3 Strip normals (normative: 08 §6.4 with CR-1; Feature 1 adds σ)

```
// 08 §6.4 'averaged', amended by CR-1 (section-level flat short-circuit)
if (sl.isFlat)  normals = 'right-panel' normals of sl, verbatim     // bit-identical; no renormalisation at all
else            column k: k == 0 -> n[0];  k == C -> n[C-1];  else normalize(n[k-1] + n[k])
                where n[j] = (−dz/len, 0, dx/len) from E[j] -> E[j+1]  (verbatim legacy 1610-1615)
// F1 (T9a): every normal multiplied by σ = sl.facing; the same normal for every row of a column
```

**Why CR-1.** 08's per-vertex `Object.is(n[k-1], n[k])` short-circuit only fires when neighbouring segment normals are bit-equal. Edge positions are accumulated, so on a flat section at a non-axis heading they can differ in the last bit (2.4: `large_wall` L3). The result is then a renormalised bisector that is not `Object.is`-equal to `'right-panel'`, which breaks 08's own test row for P2-2. The section-level test `sl.isFlat` (`curveIntensity === 0`) makes the equality hold by construction.

**Properties** (unit-tested, with σ ∈ {+1, −1}):

1. `||n| − 1| < 1e-12` for every vertex.
2. **Flat section** with heading `a = sl.edges[0].angle`:
   - every normal is within 1e-12 of `σ·(−sin a, 0, cos a)`;
   - every normal is `Object.is`-equal, component-wise, to σ × the `'right-panel'` output (given CR-1);
   - at `a = 0` and σ = +1 every normal is exactly `(0, 0, 1)` under `===` (the x component may be `−0`).
   - **Not** `(0, 0, 1)` in general: `box_corner` Side Right faces −X and Front faces −Z, `large_wall` L3 sits at 40°, and `mixed` "Small 250" at 36.5°.
3. **Curved section** with step `c`: an interior vertex is exactly `|c|/2` (within 1e-12 rad) from each adjacent face normal; end vertices equal their single face normal.
4. **Orientation:** for every triangle, `dot(face normal, vertex normal) > 0` at all three vertices, and `≥ cos(|c|/2) − 1e-9`.

**Input domain of the geometric properties (1-4):** integer numeric inputs only (cols 1-50, rows 1-20, curves −30…30, offsets −180…180, a random σ per section). String and fractional values (B-L8, B-L15) produce `vertsPerRow` such as `'101'` or `3.5`, so indices go out of range or become fractional, positions come out `undefined` and dot products become `NaN`. Those inputs are fuzzed **only** for "does not throw" and for the `LegacyProfiles` oracle equality. After 08 P2-3b they can no longer reach the builder from an import.

Averaging is **per section**. Section seams are not welded: each section has its own vertex grid, so the seam keeps a hard crease, matching separate physical sections (Q4).

### 6.4 Reversed sections (T9a)

σ = `sl.facing` (4.3).

| Consumer | Rule |
|---|---|
| Builder (viewport, OBJ, glTF) | `quadIndices(..., winding, σ < 0)`; every normal × σ; `panelQuadIndices(base, σ < 0)`; `panelFacingNormal(panel, σ < 0)` |
| Viewport panel mode | `PlaneGeometry` flipped in place (6.5) |
| Safe-distance band (extends 08 §6.9) | See below |
| Frustum coverage (08 P2-11 §6.10) | the per-quad stage normal `n = normalize(−a.z, 0, a.x)` becomes `σ·n`, so a reversed section is "seen" only from its LED side |
| UVs, positions, panel names | unchanged (Q3) |

**Safe-distance band with reversed segments** (`buildSafeDistanceBand`):

```
σ_j = layout.flatEdgeFacing()[j]            (spec 02: floorRuns()[r].facing[j])
m_j := σ_j · m_j                             // the band lies on the LED side of each segment
vertex k (interior): if σ_{k-1} ≠ σ_k -> split vertex (no mitre; offsets D·m_{k-1} and D·m_k), like 08's fold-back case
                     else the 08 mitre rule unchanged
indices: build 08's two triangles per segment, then for each triangle
         if ((v1 − v0) × (v2 − v0)).y < 0 swap v1 and v2              // every band face points +Y for either σ
```

Check: 08's stage-side order gives +Y (08 §6.9 "+Y check"). With σ = −1 the safe vertices mirror to the other side of the polyline, so the same index order gives −Y, and the swap restores +Y. The OBJ `vn 0 1 0` written by 08 P2-5b therefore stays correct.

### 6.5 Panel mode in the viewport

`PlaneGeometry(panelW, panelH)` is already counter-clockwise with a +Z normal, so stage-facing sections do not change. For reversed sections, `#buildPanels` flips the plane in place right after creating it:

```
idx = geometry.index.array;   for (i = 0; i < idx.length; i += 3) swap(idx[i+1], idx[i+2])
nor = geometry.attributes.normal.array;  for (j = 0; j < nor.length; j++) nor[j] = −nor[j]
```

A mirroring scale (`scale.z = −1`) is **not** used. It would rely on `frontFaceCW`, and r128's `Mesh.raycast` back-face test runs in local space, so it would mis-pick under `FrontSide`.

The flip moves no vertex, so the plane's local +x still runs along the column order and no panel mesh carries `userData.uMirrored` (spec 04 6.9 reads it as `false`; 04 2.3 row 01-3). A later flip that moved vertices so that local +x ran against the column order would have to set `uMirrored = true` on that mesh.

### 6.6 Line counts

| Wall | Vertex lines (strip modes) | Face lines | Vertex lines (panel mode) |
|---|---|---|---|
| default 5×3 | 24 | 15 | 60 |
| flat3 | 68 | 42 | 168 |
| mixed | 112 | 74 | 296 |
| box_corner | 88 | 54 | 216 |
| large_wall | 3,444 | 3,200 | 12,800 |
| one 50×20 section | 1,071 | 1,000 | 4,000 |
| **largest importable wall**: 200 sections × 50×20 (`Wall.MAX_SECTIONS = 200`, 07 C22 and 08 P2-3b; the cap fixture of 8.3) | 214,200 | 200,000 | 800,000 (panel mode: 200,000 meshes, one per panel; not a usable configuration) |

On that wall, strip modes give 214,200 lines (vertex only) or 414,200 (both kinds). With `MAX_NORMAL_LINES = 150,000`, vertex lines alone decimate with stride 2 (107,100 written) and both kinds with stride 3 (138,067 written), so the decimation path runs in a real, usable configuration (combined mode). The cap stays 150,000; the manual check of 8.3 re-measures the sync time on this wall, and the owner may raise the cap to 250,000 if that measurement allows (both kinds would then write 207,100 lines with stride 2).

### 6.7 Normal lines

#### 6.7.1 Sources (no allocation per mesh)

`view.meshes()` lists the LED meshes only. `NormalsDebugView` owns one scratch `THREE.Matrix3` (`#nm`), one `Float64Array(9)` (`#nmEl`) and one reused descriptor object (`#src`). For each mesh:

```
mesh.updateWorldMatrix(true, false)                 // panel meshes: matrixWorld is stale until the next render
#nmEl.set(#nm.getNormalMatrix(mesh.matrixWorld).elements)   // inverse-transpose 3×3, copied out of the scratch
#src.positions = geometry.attributes.position.array;  #src.normals = geometry.attributes.normal?.array
#src.index = geometry.index?.array ?? null;  #src.matrix = mesh.matrixWorld.elements;  #src.normalMatrix = #nmEl
```

That is 3,200 `getNormalMatrix` calls per rebuild for `large_wall` in panel mode, with zero allocations.

#### 6.7.2 Lines

**Vertex line** (one per vertex; panel mode has 4 per panel, at its corners):

```
p = M·(x, y, z, 1)      →  x' = M0·x + M4·y + M8·z + M12, etc.
n = normalize(N·(nx, ny, nz))   →  nx' = N0·nx + N3·ny + N6·nz, etc.
segment: p → p + n·L ;  colours: base = tip·lineBaseFactor at p, tip at p + n·L
```

**Face line** (one per quad; every wall geometry has 6 indices per quad, including `PlaneGeometry`):

```
(a, b, c, d, e, f) = index[6q … 6q+5]
n_local = (P_b − P_a) × (P_c − P_a) + (P_e − P_d) × (P_f − P_d)      // winding-derived, area-weighted
skip if |n_local| = 0
centroid_local = mean of the unique vertices among a…f   (4 for a quad)
p = M·centroid_local ;  n = normalize(N·n_local) ;  segment p → p + n·L
```

The face normal is computed in **local** space and then transformed by N, so it matches what three culls. If `index.length % 6 ≠ 0`, the writer falls back to one line per triangle at its centroid.

A **lime vertex line and a magenta face line pointing opposite ways** is exactly the B-H1 signature. After P2-2 they always agree within `|c|/2` (6.3).

#### 6.7.3 Caps and decimation

```
total  = (vertex ? Σ vertexCount : 0) + (face ? Σ quadCount : 0)
stride = decimationStride(total, MAX_NORMAL_LINES)            // 150,000
kept   = ceil(total / stride)                                 // ≤ 150,000
```

Sampling uses a running counter `seen` across all meshes and both kinds: a sample is kept iff `seen++ % stride === 0`. This spreads the kept lines evenly across sections. A cap of 150,000 lines needs 150k × 2 vertices × 3 floats × 4 B = 3.6 MB of positions plus 3.6 MB of colours, in one draw call. Examples on the largest importable wall (200 sections × 50×20): vertex lines only give total 214,200, stride 2, kept 107,100, and the warning "Showing 1 of every 2 normals (214,200 total, cap 150,000)"; both kinds give total 414,200, stride 3, kept 138,067.

#### 6.7.4 Auto length (scales with wall size)

```
p_min = min over sections of min(sl.panelW, sl.panelH)               // metres
b = layout.bounds();  d = b ? |b.max − b.min| : 0                    // vertex-box diagonal
L0 = min(max(0.5·p_min, 0.01·d), 0.04·d)
L  = clamp(L0 · settings.normals.lengthScale, 0.005, 5)
```

Half the smallest panel gives a readable density close up. The 1-4 % of diagonal band keeps lines visible in an overview of a large wall and short on a small one.

| Wall | Length at ×1 |
|---|---|
| default | 0.117 m |
| flat3 | 0.250 m |
| mixed | 0.125 m |
| box_corner | 0.180 m |
| large_wall | 0.774 m |
| 50×20 section of 5 m panels | 2.693 m |
| one 50 mm panel | 0.005 m (floor clamp) |

During live drags (`keepLength`), `L` is kept from the last full sync, because the layout in `#last` is the pre-drag one.

#### 6.7.5 Buffers and lifecycle

- **One** `LineSegments` holds a `BufferGeometry` with `position` and `color` `Float32BufferAttribute`s. Capacity is in lines: `min(MAX_NORMAL_LINES, max(1024, nextPowerOfTwo(kept)))`.
- On rebuild, if `kept ≤ capacity` the arrays are rewritten in place, then for both attributes `updateRange.offset = 0; updateRange.count = 6·written` (2 vertices × 3 floats per line) **before** `needsUpdate = true`, and `setDrawRange(0, 2·written)` is called. r128's `WebGLAttributes` then uploads only the written prefix with `bufferSubData` (and resets `updateRange.count` to −1 afterwards), instead of the whole capacity (up to 3.6 MB per attribute) on every colour-picker `input` event. Otherwise the new capacity is allocated and the old geometry disposed.
- **Optional optimisation (no AC depends on it):** skip the rebuild when the new `geometryKey` equals the previous one. The key is built from `meshMode`, the debug settings that affect lines (`vertex`, `face`, `lengthScale`), and, for each `SectionLayout`, its id, `facing`, panel counts, panel size, `postTransform` and its first and last edge vertex. A colour-only rebuild leaves the key unchanged, because the lines depend only on positions, normals and indices, never on materials.
- Settings on the line object: `frustumCulled = false`, `matrixAutoUpdate = false`, identity transform (positions are in world space), `layers.set(HELPERS)`, `raycast = noop`, `userData.helper = true`.
- **Disable:** `removeHelper`, then dispose the geometry. The shared material stays.
- **Cost:** O(total) per `WALL_REBUILT`. Colour-picker drags rebuild the wall on every `input` event (ARCHITECTURE 6.2 rows 3, 16 and 19), so the writers allocate nothing per line.
- `performance.mark('normals:sync-start')` and `performance.measure('normals:sync', 'normals:sync-start')` wrap each sync. They are visible in DevTools and used by AC 14's browser timing; this is a platform API, not an app global.

#### 6.7.6 Instancing versus merged lines (decision)

`InstancedMesh` arrows (a cone plus a shaft) would give thickness and heads. They cost 64 B per instance for the matrix, a quaternion per normal on every rebuild, and lighting or material work for little benefit. Merged `LineSegments` cost 48 B per line including colour, use one draw call and do no per-instance maths.

**Decision:** merged lines with a base-to-tip colour gradient. Instanced cone tips when `total ≤ 20,000` are an optional later addition.

### 6.8 Debug shading materials (GLSL, r128 `ShaderMaterial`)

```glsl
// shared vertex shader
varying vec3 vWorldNormal;
void main() {
  vWorldNormal = (modelMatrix * vec4(normal, 0.0)).xyz; // rigid transforms only (6.1). Not mat3(modelMatrix):
                                                        // the mat3-from-mat4 constructor is not GLSL ES 1.00, so it
                                                        // would fail on r128's WebGL1 fallback
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// faceOrientation fragment   (side: DoubleSide; uniforms uFront, uBack = THREE.Color)
uniform vec3 uFront; uniform vec3 uBack;
varying vec3 vWorldNormal;
void main() {
  vec3 n = length(vWorldNormal) > 0.0 ? normalize(vWorldNormal) : vec3(0.0, 0.0, 1.0);
  float shade = 0.6 + 0.4 * abs(dot(n, normalize(vec3(0.35, 0.6, 0.7))));
  gl_FragColor = vec4((gl_FrontFacing ? uFront : uBack) * shade, 1.0);
}

// normalColors fragment   (side: DoubleSide)
varying vec3 vWorldNormal;
void main() {
  vec3 n = length(vWorldNormal) > 0.0 ? normalize(vWorldNormal) : vec3(0.0, 0.0, 1.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
```

- Face orientation is decided **only** by `gl_FrontFacing`, which three corrects for mirrored objects. The stored normal only modulates brightness.
- Normal colours show the **stored** normal on both sides without flipping, so a wrong normal is visible from either side. The harness also uses normal colours to locate sections whatever the camera pose (8.2).
- `MeshNormalMaterial` was rejected: it is view-space, so its colours change as the user orbits.

### 6.9 Cabinet back shell (F1-5)

| Mesh mode | Shell |
|---|---|
| Combined, section | For each LED mesh: `shell = new THREE.Mesh(mesh.geometry, backMat)`, added as a **child of the LED mesh** with an identity local transform. It shares the geometry (no extra memory) and inherits every transform. Spec 02's fast path rewrites the shared attribute arrays in place, so the shell follows drags with no extra code. |
| Panel | **One shell per section**, from `builder.panelShell(sl)`, in base-layout coordinates: `matrixAutoUpdate = false`, `matrix.fromArray(sl.postTransform)` (identity while it is `null`), added to the wall group (or to spec 02's per-section group when it exists). `updateSectionTransforms` rewrites the matrix of each affected section's shell (CR-5). That costs one extra draw call per section, not one per panel. Because each shell covers exactly one section, it needs no `sectionRanges` and no `shellVertexRange`: spec 02's merged `panelShell(layout)` with section ranges is replaced by this per-section form (CR-5). |

- **Tags:** `userData = wallMeshTags.backShellUserData(led.userData)` = `{kind: 'led-wall-back', mode, sectionId, sectionIndex}`. A combined shell copies `sectionRanges` by reference from its LED mesh, so `faceIndex` resolves to the same section (the geometry and index order are shared). Every shell copies exactly the `sectionId`/`sectionIndex` values its LED mesh carries in that mode.
- **Colour:** `theme.scene.wallBack` = `#403C37` (2.4, Q1). An edge outline (`EdgesGeometry`) was considered and is not part of Feature 1: the colour alone has 1.81:1 contrast to the background and is far from every grid blend.
- **Material:** `materials.backShell()` (`BackSide`), one per rebuild.
- **Visibility:** `visible = !display.wireframe && #shading === 'content'`.
- **Z-fighting:** for any pixel, exactly one of {LED front face, shell back face} survives culling, so there is none. Panel shells use the same `panelCorners` arithmetic as the exports and match the plane transform to float precision.
- **Disposal:** `disposeObject3D` keeps a per-call `Set` of disposed geometries and materials, so shared resources are disposed once. A double `dispose()` is already a no-op in r128; the `Set` makes that explicit.

---

## 7. Export impact

### 7.1 From the prerequisites (owned by spec 08; listed for completeness)

| Format | Change | Commit |
|---|---|---|
| OBJ | per-vertex `vn` (`toFixed(6)`), `f v/t/n` with `n = v` in strip modes; counter-clockwise faces; panel faces `v, v+1, v+2 / v, v+2, v+3`. Strip OBJs grow by about 32 B per vertex. | 08 P2-2c |
| glTF | a `NORMAL` accessor per primitive; counter-clockwise indices; no `doubleSided`. About +12 B per vertex: `large_wall` combined goes from 79,728 B to 121,056 B. | 08 P2-1a, P2-2d |
| Safe-distance OBJ | faces +Y, `vn` | 08 P2-5b |
| OBJ header | CR-3 asks P2-2c to add one constant comment line after `# Mesh Mode: …`, in the same commit that already changes every OBJ: `# Faces: counter-clockwise front faces; vn point out of the LED surface (toward the stage)`. If spec 08 declines, the README section and the release note carry the convention, and Feature 1 does **not** add an extra OBJ-wide re-baseline for it. | 08 P2-2c (requested) |

`vn` formatting is 08's plain `toFixed(6)`, the same as the existing `v` and `vt` lines. `-0.000000` can appear, as it already can in `v` lines. Every OBJ importer parses it as 0, and `tools/check-orientation.mjs` treats it as 0.

### 7.2 From this feature

| Format | Change |
|---|---|
| OBJ | Reversed sections: faces with the 2nd and 3rd indices swapped and `vn` negated, in strip and panel modes. No change when every section is stage-facing, which is true of every harness scenario. |
| MTL | none |
| glTF | Reversed sections: indices swapped and `NORMAL` negated. Same harness note. |
| JSON v1 | none |
| JSON v2 | `sections[i].face_orientation`, right after `curvature`, added by T9b with this feature's revision bump (07 C39, C40); observable once 08 P2-13e exists, which writes no `face_orientation` itself, so every harness JSON export changes at F1-4 (8.4) |
| ZIP | OBJ and glTF entries as above; the JSON entry carries `face_orientation` with v2 (same serializer); texture PNGs unchanged |
| Safe-distance OBJ | Reversed segments: the band lies on the LED side, still facing +Y |
| Panel-ID PNG | none |
| Debug view | **Nothing** in any export depends on debug settings (AC 8) |
| `FrontSide` + back shell | none (viewport only) |

---

## 8. Testing

### 8.1 Unit tests (Node, `node --test "tests/unit/**/*.test.mjs"`)

**`tests/unit/geometry.test.mjs` (amended, T9a)**

- The oracle tests keep injecting `LegacyProfiles` (08 P2-0). Their fuzz keeps the string and fractional values while B-L8 and B-L15 are open, for "does not throw" and oracle equality **only**.
- New property tests over integer fuzz (6.3 domain: 1-6 sections, a random σ per section), with the live profiles: properties 1-4 of 6.3 for `sectionGrid` and `combinedGrid`.
- **Reversed:** a reversed section yields `σ·` the stage normals and swapped triangles. Its positions and UVs are `Object.is`-equal to the stage-facing build.
- **`quadIndices`:** a table test of all variants. `winding` undefined throws, and `'legacy-cw'` plus `reversed` throws.
- **Panels:** `panelQuadIndices` and `panelFacingNormal` stay consistent for headings 0…2π, with and without `reversed`. `panelShell(sl)` produces `4·panels` vertices and `6·panels` indices whose face normals equal `σ·` the facing normal.
- **Layout:** `SectionLayout.facing` and `flatEdgeFacing()` length and order.

**`tests/unit/safe-distance-band.test.mjs` (08's file, extended in T9a)**

- All-stage input gives output identical to 08's tests.
- A reversed segment's safe vertices lie on the `−m` side, and every band triangle has normal y > 0.
- A σ change at a vertex produces a split vertex (two safe vertices).

**`tests/unit/normal-lines.test.mjs` (new, T3)**

- `autoNormalLength` matches the 6.7.4 table within 1e-3.
- `decimationStride` boundaries: 150,000 gives 1, 150,001 gives 2.
- `writeVertexNormalLines` with an identity matrix and with a rotation + translation matrix: the endpoint equals `p + L·n` within 1e-6.
- `writeFaceNormalLines`: a clockwise quad gives a −Z line and a counter-clockwise quad a +Z line. This proves the face line reveals winding.
- Stride sampling is spread across meshes; the colours are base and tip.
- `formatCount(3444) === '3,444'` and `formatCount(150000) === '150,000'`. `formatNormalStats` returns the exact 3.5 strings, including the warning text.
- **Cap benchmark (AC 14a), the largest importable wall:** 200 synthetic strip descriptors × 1,071 vertices (6-index quads, 1,000 quads each; `Wall.MAX_SECTIONS = 200`):
  - vertex only: total 214,200, stride 2, exactly 107,100 lines written, and the text "Showing 1 of every 2 normals (214,200 total, cap 150,000)";
  - both kinds: total 414,200 lines, stride 3, exactly 138,067 lines written (≤ 150,000), and the text "Showing 1 of every 3 normals (414,200 total, cap 150,000)";
  - panel-mode shape (unit only, not a usable configuration): 200,000 descriptors × 4 vertices and 6 indices, both kinds: total 1,000,000, stride 7, 142,858 written;
  - the elapsed time is logged, not asserted.
- `uploadCount(written) === 6 * written` (the pure helper `NormalsDebugView` assigns to both `updateRange.count`; render modules are not Node-tested, so the upload size itself is checked manually in 8.3).

**`tests/unit/export-orientation.test.mjs` (new, T1)**

This is the acceptance oracle for orientation. It parses OBJ text, decodes glTF data URIs and opens ZIPs with `readZip` from `tests/regression/lib/formats.mjs`.

- **Golden:** walks `GOLDEN_DIR` **recursively** (`**/*.obj`, `**/*.gltf`, `**/*.zip`; this covers the `*.zip.entries/` folders and the ZIP files of `logos`, the config scenarios and others). For every triangle it asserts `dot(geometric normal, vertex normal) > 0` at all three vertices.
- **Fuzz:** 500 integer walls with random σ, through the in-memory OBJ and glTF exporters, all three mesh modes.
- The same parser backs `tools/check-orientation.mjs <file|dir>...`. 08 P2-0 ships the OBJ/glTF file form; T1 extends it to ZIP files (entries read with `readZip`) and to directories (recursive). It prints per-object pass/fail and exits 1 on any failure. Pipeline users can run it on their own exports.

**Other unit tests**

- `domain.test.mjs`:
  - `DebugViewSettings.parseLengthScale` over `0, '', NaN, -1, 0.1, 0.3, '2.6', 9` gives `1, 1, 1, 1, 0.25, 0.25, 2.5, 4`.
  - `nextShading` cycles.
  - `normalizeFaceOrientation('x') === 'stage'`.
  - `new WallSection({...v1 fields})` gives `faceOrientation === 'stage'` (never undefined), and `Object.keys` equals `SECTION_FIELDS` (12 keys, `faceOrientation` last); the 11 legacy values are compared over `LEGACY_SECTION_FIELDS` (4.1).
  - `appendLikeLast` copies the orientation.
  - `flipAllFaceOrientations` toggles each section.
  - The summary suffix " • Reversed" appears only when reversed.
- `serializer.test.mjs` (08's file): a v2 round trip preserves `'reversed'`; the key sits right after `curvature`; the writer emits `'stage'` for a section object whose field was deleted (the `?? 'stage'` guard); a v1 file gives `'stage'`; an unknown value gives `'stage'` plus the `defaulted` issue at `sections[i].face_orientation`; T9b's commit bumps `KNOWN_REVISION` once and records `face_orientation` in `ProjectSchema.REVISIONS`; a stray `wall.conventions` or `display.debug` key gets only the generic `dropped-unknown` info issue (no feature-specific rule, 07 C39).
- `led-wall-view.test.mjs` (T5, with `MaterialOverride` stubs): `withContentMaterials(fn)` runs `fn` with the original materials on every LED mesh and re-applies the active shading afterwards, also when `fn` throws; with shading "As displayed" it only calls `fn` (07 C48).
- `debug-view-controller.test.mjs` (new):
  - T6: with spies, each use case writes the model, then calls `normalsView.sync()` or `wallView.setDebugShading()` exactly once; no bus is needed. `setOnTop(true)` sets `settings.normals.onTop === true`.
  - T7 extends it: the model write, then exactly one `DEBUG_VIEW_CHANGED`, then the render call, in that order (R2).
- `debug-view-controls.test.mjs` (new, T7; `ui/` modules take an injected `doc`/`win`, so plain event-target stubs suffice): a `keydown` with `repeat: true` does not toggle; before 07 I1 the Escape capture listener exists only while the popover is open, acts only on `'Escape'`, and stops propagation only then; from 07 I1 the registry entry at priority 70 returns `true` only while `isPopoverOpen()` and closes the popover; the pointer-change flag is cleared by the post-`pointerup` timer and by a `keydown`, so a later keyboard change keeps focus.
- `wall-mesh-tags.test.mjs` (new, T10): `backShellUserData` copies `mode`, `sectionId` and `sectionIndex`, sets `kind: 'led-wall-back'`, and keeps the same `sectionRanges` reference; `pickList` over a mixed list returns LED meshes in add order, then shells in add order, and ignores frames and helpers (AC 10).
- `material-override.test.mjs` (new): `apply` twice stashes the original once; `restore` returns it and clears; a mesh whose material is a `Material[]` gets the same array object back (04 2.3 row 01-1); a rebuild-order simulation shows `restore` before a fake dispose never passes the debug material to `dispose` (AC 12).
- `typing-target.test.mjs` (08's file, P2-9b; 07 C52): 07 §3.8's truth table, including `BODY` and buttons returning false, the excluded input types returning false, and any element inside an open `[role=dialog]` (modal or not) returning true.
- `tests/static/check.mjs` stays green after **every** step:
  - layering (`NormalLines` and `MaterialOverride` import nothing from THREE; `DebugViewControls` imports only `core` and `ui`);
  - DOM-id ownership (5.6): `#debug-normals-stats` and the other debug ids enter the ownership table in F1-2 together with their markup;
  - every `Strategies` leaf referenced;
  - every `Events` key emitted and subscribed: `DEBUG_VIEW_CHANGED` exists only from F1-2, where both its emitter and its subscriber land;
  - domain fields written only by the writers of ARCHITECTURE section 4 (rows added with the code, 5.8);
  - LEGACY parity (the narrowed B-L24 entries in F1-2);
  - **new rule:** no numeric `renderOrder` literal **≥ 900** outside `core/renderOrder.js` (5.5). It applies to every spec's files (07 S10).

### 8.2 Harness scenario `normals_debug` (`tests/regression/scenarios-extra.mjs`, T8)

It drives the page through the DOM and web-platform APIs only, as every other scenario does.

**Lib additions (T8):**

- `app.screenshotElement(selector)`, a generalisation of `screenshotCanvas`.
- `app.pointerClick(selector)`: a CDP `mousePressed`/`mouseReleased` at the element's rect centre (click `detail` 1). The existing `app.click` calls `el.click()` (`detail` 0), which fires no `pointerdown` and moves no focus, so it cannot exercise the rules of 3.2.
- `app.overlayRects(selectors, origin)`: the `getBoundingClientRect` of each selector that is present and visible, translated by `−origin` (the captured element's rect), padded by 4 px.
- `KEYS` gains `n` (`KeyN`, vk 78), `Enter` (vk 13) and `ArrowDown` (vk 40). `keyPress(key, {modifiers, noText})` gains CDP `modifiers` (Shift = 8, Ctrl = 2, Alt = 1; with Shift the `key` and `text` are `'N'`), used for `N`, `Shift+N`, `Ctrl+N` and `Alt+N`, and `noText`, which sends the `keyDown` without `text` so no character is inserted into a focused text input (the page's `keydown` listeners still see `key: 'n'`).
- `findPersonPixel` is exported from `scenarios.mjs` (no behaviour change).
- New `lib/probe.mjs`:
  - `colorMask(png, rgb, tol)`: pixels whose every channel is within `tol`;
  - `largestComponent(mask)`: the largest 4-connected component, `{size, bbox, pixels}`;
  - `probePoint(mask)`: within the largest component, the pixel nearest its centroid whose 3×3 neighbourhood is entirely in the mask, or `null`;
  - `sampleRGB(png, x, y)`: the 3×3 median;
  - `classifyFace(rgb)`: `'front'` if `b > r + 60`, `'back'` if `r > b + 60`, otherwise `'other'`;
  - `diffStats(pngA, pngB, excludeRects)`: `{maxDiff, diffPixels}` over the pixels outside `excludeRects` (max channel difference, and the count of pixels with any difference);
  - `withinJitter(stats)`: `stats.maxDiff ≤ 1 && stats.diffPixels ≤ 16`. This is the harness's documented nondeterminism (README "Known nondeterminism": 1 level in 1-8 overlay-glyph pixels, also in the preview window), with a 2× margin. Every in-scenario image comparison uses it; none uses exact equality.
  - `PALETTE`: the probe colours, **read from the live palette hook** (`lib/palette.mjs livePalette(page)`, T2: the section swatch values of `sectionsSnapshot` and the `--scene-*` tokens, so `PALETTE.wall` and `PALETTE.cabinet` follow 06 T5/T7's palette and token changes), never literals (07 C53). Only the normal-colour triples stay constants (they are the shader's convention, not theme data). 06 T5/T7 and 07 U3 declare the probe JSON outputs (`content_probes`, `face_probes`) in their own manifests (11.1).
- All pixel work uses `decodePNG` from `lib/formats.mjs`.

**Image comparisons inside the scenario.** The golden JSON records the verdict `{pass: withinJitter(stats)}` only. The raw `{maxDiff, diffPixels}` vary between runs within the jitter, so a golden file that stored them would differ between the two captures of F1-3; they are printed to the runner's stdout (one line per comparison) for triage instead.

**Camera poses.** Probe locations are found by **colour**, never by projecting with an assumed orbit target. 08 P2-11c moves the orbit target from the flat-bounds centre to the layout centre, and Feature 3 may move it to the pivot. The expected sides depend only on the view **direction**, which is target-independent at these distances. A Node check (ray-cast occlusion against every wall quad, 50° vertical FOV, 1200×940 canvas, overlay rectangles excluded) covered 5 candidate targets: flat centre (4.5, 0.75, 0), layout and mesh centre (1.5, 0.75, 1.5), pivot bottom-left (0, 0, 0) and pivot mid-floor (0, 0, 1.5). For both box poses, every section had visible sample points with the expected side. The smallest was Return in `boxP2`, with at least 22 of 100 samples (a region of about 35×30 px); every other section had at least 112.

| Pose | Steps (each starts with `#view-reset`, then `#view-front`) | Orbit after the steps |
|---|---|---|
| `front` | none | θ = 0, φ = π/2, d = 8 |
| `behind` | drag 314 px right (canvas centre ± 157 px, 20 px moves) | θ = −3.14 |
| `boxP1` | drag 79 px right and 60 px down; wheel `deltaY` +700 | θ = −0.79, φ = 0.971, d = 15 |
| `boxP2` | drag 236 px left and 60 px down; wheel `deltaY` +700 | θ = 2.36, φ = 0.971, d = 15 |

**Part A: content mode** (runs on every page, including the original `index.html`):

| # | Steps | Records |
|---|---|---|
| A1 | Default wall, pose `front`. Screenshot `a1_front`. | `content_probes.front`: `{wallColourFound: largestComponent(colorMask(PALETTE.wall, 8)).size ≥ 400, cabinetVisible: largestComponent(colorMask(PALETTE.cabinet, 6)).size ≥ 400}` (today `#00f0ff` and `#403c37`, read from the palette hook). Two guards keep grid lines from counting as cabinet: the colour is at least 28.6 RGB units from every blend of the background with either grid colour (2.4), far beyond the tolerance of 6, and a match needs one connected region of at least 400 px (a 20×20 block), which sub-pixel grid rows near the horizon cannot form. |
| A2 | Pose `behind`. Screenshot `a2_behind`. | `content_probes.behind` (same fields) |
| A3 | Import `box_corner`; panel IDs off. Pose `boxP1`. Screenshot `a3_box_p1`. | `content_probes.boxP1`: `{found: {Back, Side Right, Front, Return}` (each: largest component of its section colour ≥ 400 px; Return's region is about 35×30 px at its smallest, 8.2 poses), `cabinetVisible}` |
| A4 | Pose `boxP2`. Screenshot `a4_box_p2`. | `content_probes.boxP2` |

If `#toggle-normals` is absent (the original page or a pre-F1 build), the scenario records `debug_skipped.json` = `{skipped: true, reason: "#toggle-normals not present"}` and stops after Part A.

**Part B: debug view** (one fresh page). Part B runs on a single page, so **every step states its precondition and the state it leaves**. The reference state is:

> **S0** = the bootstrap state: default wall, mesh mode **combined**, content colour, wireframe off, frames off, props off, preview off, no gizmo mode, nothing selected, not in pilot, debug settings at their defaults (lines off, vertex on, face off, ×1, on top off, shading content), popover closed, focus on `BODY`, window 1600×1000, pose `front`.

A step whose "Leaves" column says S0 restores every item it changed, in the order given. Each step asserts its precondition (the relevant classes and checked states) before acting and records a `precondition_failed` entry, instead of continuing silently, when one does not hold.

| # | Pre | Steps | Records / expected | Leaves |
|---|---|---|---|---|
| B0 | S0 | Export OBJ and glTF in mesh modes combined, section and panel, in that order (mode radio between them). **Set mesh mode back to combined.** Export JSON, ZIP and panel-ID PNG. | hashes kept in memory (ZIP: per-entry hashes) | S0 (mode combined, asserted) |
| B1 | S0 | Click `#toggle-normals`. Screenshot `b1_vertex_normals`. | `#toggle-normals` classes and `aria-pressed`; stats text `"24 vertex lines · 0.117 m"` (combined mode) | lines on |
| B2 | lines on | `app.click('#debug-view-btn')` (`detail` 0: keyboard-style open), record `document.activeElement.id` = `debug-shading-content`. Check `#debug-normals-face`: screenshot `b2_vertex_face`. Set `#debug-normals-scale` to `2` (input + change): screenshot `b3_scale2`. | stats `"24 vertex + 15 face lines · 0.233 m"`; `#debug-view-status` text after 500 ms | lines on, face on, ×2, popover open |
| B3 | as left by B2 | Select `#debug-shading-normals`. Pose `front`: `probePoint(colorMask(lavender (128,128,255), 24))` gives p. Select `#debug-shading-face` and sample p. Repeat at pose `behind`. Screenshots `b4_face_front`, `b5_face_behind`. | `face_probes.default`: `{front: 'front', behind: 'back'}` | shading face, pose `behind` |
| B4 | as left by B3 | Pose `front`. Select `#debug-shading-normals`: screenshot `b6_normal_colors`. | – | shading normals, pose `front` |
| B5 | as left by B4 | Select `#debug-shading-face`. Mesh mode section: screenshot `b7_section`; panel: `b8_panel`. Mesh mode combined. | override survives rebuilds and works on `PlaneGeometry` | shading face, combined |
| B6 | as left by B5 | Wireframe on: screenshot `b9_wire_on`; off: `b10_wire_off`. Restore S0: shading content, lines off, face unchecked, scale 1, `#debug-view-close`, pose `front`. Screenshot `b11_content` and compare it with `a1_front` (Part A, another page load) by `diffStats`, excluding `app.overlayRects(['.viewport-controls', '.viewport-info', '#debug-view-legend'])`. | `content_restored.json`: `{pass: withinJitter}` (AC 11) | S0 |
| B7 | S0 (asserted: mode combined, props and preview off, wireframe off, pose `front`) | **Export isolation.** Lines on, face on, ×4, on top on, shading face (popover open). Repeat B0's exports exactly (same order; ends in combined). Then restore S0's debug settings and close the popover. | `exports_isolation.json`: `{obj, mtl, gltf, json, zipEntries, panelIdsPng}` all `true` (hash-equal to B0; the project state is identical to B0's apart from the debug settings, which no export reads) | S0 |
| B8 | S0 | **Keyboard and focus.** (1) Focus a section-name input, press `n` with `noText` (the name stays unchanged, so blurring fires no `change`): no change. (2) Blur; `Ctrl+N` and `Alt+N`: no change. (3) `N`: lines on; `Shift+N`: shading face. (4) `app.pointerClick('#debug-view-btn')` (pointer open): record `activeElement.id` (`debug-view-btn`). (5) `app.pointerClick('#debug-normals-vertex')`: record `activeElement.tagName` (`BODY`), then `N` (lines toggle) and `g` (gizmo translate mode set). (6) `Escape`: popover closed, gizmo mode still translate. (7) `Escape`: gizmo mode cleared (legacy deselect). (8) Focus `#debug-view-btn`, press `Enter` (keyboard open): `activeElement.id` = the checked shading radio; `ArrowDown`: shading changes, focus stays on a radio; `N`: lines unchanged (inside `[role=dialog]`, 3.4); `Escape`: popover closed, focus on `#debug-view-btn`. Restore S0: shading content (`Shift+N` as needed), `#debug-normals-vertex` re-checked (step 5 unchecked it), lines off, popover closed, blur. | `keyboard.json` with the state after each numbered action (lines on/off, vertex checked, shading, gizmo mode, popover open, `activeElement`) | S0 |
| B9 | S0 | **Picking.** `#view-reset` (the bootstrap pose, as in `ui_visual`'s `selection_visible`). Click `#toggle-person` (person at its default (2, 2) in front of the default wall) and **`#gizmo-translate`** (legacy picking needs a gizmo mode, 3429). Lines on, face on, on top on. `findPersonPixel` on a canvas capture, then CDP press and release there. Record `#selection-indicator` visibility and text. Restore S0: blur, `Escape` (deselect), `#toggle-person`, debug settings, pose `front`. | `picking.json`: the person is selected | S0 |
| B10 | S0 | **Preview isolation.** Click `#toggle-camera-preview`, assert `.active`. Lines on, face on, on top on: `screenshotElement('#camera-preview-canvas')` gives A (kept as an output). Lines off: B. `diffStats(A, B, rects of the preview window's header and footer labels relative to the canvas)`. | `preview_isolation.json`: `{pass: withinJitter}` | preview on, debug at S0 |
| B11 | preview on (asserted: `#toggle-camera-preview.active`) | **Pilot legend.** Shading face (popover opened, radio selected, `#debug-view-close`; focus is then on the button, which no guard blocks). Press `p`; record `pilotStarted = #pilot-info.classList.contains('visible')`. Record the `#debug-view-legend` and `#pilot-info` rects. `Escape` (popover closed, so the legacy handler exits pilot); record `pilotExited`. Restore S0: shading content, click `#toggle-camera-preview`. | `pilot_legend.json`: `{pilotStarted: true, legendVisible: true, intersects: false, pilotExited: true}`. If `pilotStarted` is false, `intersects` is not evaluated and the step fails. | S0 |
| B12 | S0 | **Popover fit.** `setViewport(1366, 650)` (overlay = 650 − 60 = 590 px): open the popover (`app.click`, which works even when the button is scrolled inside the column) and record its rect within the overlay rect and `dataset.placement`. Close. `setViewport(800, 760)` (≤ 900 px layout, overlay = 760 − 410 = 350 px): same, plus whether `.viewport-controls` scrolls. Close; `setViewport(1600, 1000)`. | `popover_fit.json`: `{inside: true, placement: 'up'}` then `{inside: true, placement: 'down' or 'up', scrollable: true, columnScrolls: true}`, and the last control's rect reachable by scrolling | S0 |
| B13 | S0 | **Box corner** (last, because it replaces the wall). Import `box_corner`; panel IDs off. At `boxP1` and at `boxP2`: normal colours, then locate lavender (Back), teal (0,128,128) (Side Right + Return, which share their normal and their expectation) and olive (128,128,0) (Front); then face orientation and sample. Screenshots `b12_box_p1`, `b13_box_p2`. | `face_probes.boxP1 = {lavender: 'front', teal: 'front', olive: 'back'}`; `face_probes.boxP2 = {lavender: 'back', teal: 'back', olive: 'front'}` | end of scenario |

Part B has no dependency on other scenarios except `b11_content`'s comparison with Part A's `a1_front` (same scenario, tolerance comparison). Export isolation is checked against the scenario's own B0 exports.

### 8.3 Manual checks

- **Memory:** `renderer.info.memory.geometries` and `textures` return to their starting values after 50 rebuilds with lines and face orientation on (DevTools, a local debugging session).
- **Blender 4.x:** exported OBJ and glTF, including one with a reversed section, show the Face Orientation overlay all blue from each section's LED side.
- **Validator:** 08's `tools/check-gltf.mjs` passes, and the Khronos glTF-Validator web page (08 §8.2) reports 0 errors and no `ACCESSOR_NON_UNIT` on the `default`, `mixed` and `large_wall` exports and on one export with a reversed section.
- **Unreal:** the import shows the wall lit and visible from the stage side with back-face culling on.
- **Cap timing (AC 14b):** import `tests/fixtures/normals-max-wall.json`: **200 sections of 50×20** (the largest file 08 P2-3b accepts, `Wall.MAX_SECTIONS = 200`, 07 C22), v1 format, combined mode; generated by `tools/make-cap-wall.mjs`.
  - Vertex lines only: 214,200 total, stride 2, 107,100 drawn, and the stats show "Showing 1 of every 2 normals (214,200 total, cap 150,000)". Then add face lines: 414,200 total, stride 3, 138,067 drawn.
  - For each, `performance.getEntriesByName('normals:sync')` should show under 50 ms on the reference machine (desktop Chrome), and `renderer.info.render.calls` should increase by exactly 1 when the lines are enabled (DevTools). Record the numbers in the PR. If the sync time leaves room, the owner may raise `MAX_NORMAL_LINES` to 250,000 in the same PR (6.6); otherwise it stays 150,000.
  - Upload size: in a local debugging session, wrap the context's `bufferSubData` from the DevTools console to log the data length, then drag the colour picker with lines on: each sync uploads `6·written` floats per attribute, not the full capacity (6.7.5).
  - Panel mode on this wall (200,000 meshes) is not timed: the app itself is not usable there. Decimation in that shape is covered by the unit benchmark (8.1).

### 8.4 Steps, intentional golden changes and the re-baseline procedure

Every step is one commit. Each one uses **08 §8.1's procedure verbatim** (steps 1-7): write the expected manifest `tests/regression/expected/F1-<n>.json` first, run a full candidate (never `--only`), gate with `compare.mjs --expect`, review, promote the whole candidate, then re-run and require `compare.mjs baseline candidate` to exit 0.

Three Feature 1 additions apply to every step:

- `node tools/check-orientation.mjs tests/regression/output/baseline` must pass after promotion. It walks recursively, so ZIP entries are covered.
- **Harness-code steps** (F1-3) follow the README rule "re-capture both baselines": capture twice, require the two captures to compare at 0 FAIL, then promote the new scenario into `baseline` **and** `baseline2`.
- **Harness tooling that does not change outputs** (T2's `measure-rects.mjs`, the `rects` field of `--expect` manifest entries and the palette hook, T10's `run.mjs --probe-backfaces`, which is off by default and writes outside `baseline`) needs no re-capture: the step's ordinary full candidate run, without the flag, must show only that step's manifest.

Lists are **derived from the baseline manifest**, never typed by hand:

```bash
B=tests/regression/output/baseline
# every export with geometry (OBJ, glTF, ZIP) per scenario
node -e "const m=require('./$B/manifest.json');for(const[s,v]of Object.entries(m.scenarios))for(const k of Object.keys(v.outputs))if(/\.(obj|gltf|zip)$/.test(k))console.log(s+'/'+k)"
# every state file that contains a section-card snapshot (cards change in F1-4)
grep -l '"inputs"' $B/*/*.json
# every JSON export (v2 key in F1-4, if 08 P2-13e has landed)
node -e "const m=require('./$B/manifest.json');for(const[s,v]of Object.entries(m.scenarios))for(const k of Object.keys(v.outputs))if(/export-json|export-zip/.test(k))console.log(s+'/'+k)"
# every #three-canvas capture (canvas-relative frame; includes the DOM overlays drawn over the canvas)
node -e "const m=require('./$B/manifest.json');for(const[s,v]of Object.entries(m.scenarios))for(const k of Object.keys(v.outputs))if(/\.screenshot\.png$/.test(k)&&s!=='ui_visual')console.log(s+'/'+k)"
# every ui_visual page capture (page frame, canvases masked: header, sidebar and overlay DOM are visible)
node -e "const m=require('./$B/manifest.json');for(const k of Object.keys(m.scenarios.ui_visual.outputs))if(/\.(viewport|sidebar)\.screenshot\.png$/.test(k))console.log('ui_visual/'+k)"
```

**Two kinds of screenshot.** `#three-canvas` captures (`app.screenshotCanvas`) are 1200×940 at the harness window of 1600×1000 and contain the canvas plus the DOM overlays drawn over it (toolbar column, help badge). `ui_visual/*.viewport.screenshot.png` are **full-page** captures (`uiprobe.screenshotViewport`: 1600×1000, or 800×1000 for `narrow_800`, with both canvases masked), so they also contain the header and the sidebar. `ui_visual/*.sidebar.screenshot.png` are the stitched sidebar scroller. Each step below treats them separately.

**Allowed rectangles are measured, not typed** (T2; 07 C57). `node tests/regression/measure-rects.mjs --root . --manifest tests/regression/expected/F1-2.json` opens the **candidate** page with the harness lib at each capture size (1600×1000 and 800×1000), records the `getBoundingClientRect` of `.viewport-controls`, `.viewport-info` (the help badge) and `#three-canvas`, pads each by 8 px (focus rings, shadows, anti-aliasing), and writes the `rects` field of one `--expect` entry per capture frame (the same mechanism 07 I4a's badge rewrite uses):

```jsonc
[ { "glob": "*/*.screenshot.png", "notGlob": "ui_visual/**", "size": [1200, 940],     // canvas frame: rects minus the canvas origin
    "rects": [ /* column */ {...}, /* badge */ {...} ] },
  { "glob": "ui_visual/*.viewport.screenshot.png", "notGlob": "ui_visual/*narrow_800*", "size": [1600, 1000],   // page frame
    "rects": [ ... ] },
  { "glob": "ui_visual/*narrow_800*.viewport.screenshot.png", "size": [800, 1000], "rects": [ ... ] } ]
```

The candidate rectangles contain the baseline ones: the column only gains buttons below the existing ones and the badge only gains text at its end (` N=normals`, the only per-feature badge token, 07 C35), both with unchanged anchors (top-right and bottom-left). `compare.mjs --expect` then reports a screenshot diff of an entry with `rects` as EXPECTED only when **every differing pixel** lies inside the union of the entry's rects (a per-pixel test: a bounding-box test would fail, because the column and the badge sit in opposite corners), and only when the PNG size equals the entry's `size` (a differing capture of another size, for example a camera-preview capture, is a FAIL "rect frame mismatch"; unchanged captures pass whatever their size). `--diff-bbox` prints the bounding box of the differing pixels outside the rects, for review.

| Step (commit) | Tasks | Expected manifest (`expect` / `mayChange`) | Must stay identical |
|---|---|---|---|
| **F1-0** tooling | T1, T2 | none: no app change. The unit and golden tests run, and `check-orientation` passes on the current baseline. | everything |
| **F1-1** debug core (no UI) | T3-T6 | **empty** (invariance; `camera.layers.enable(HELPERS)` changes nothing while nothing is on `HELPERS`) | everything |
| **F1-2** debug UI | T7 | `expect` (glob entries, `modified`): `ui_visual/*.text.json` (badge "N=normals"); every `#three-canvas` capture (glob `*/*.screenshot.png` minus `ui_visual/**`) and `ui_visual/*.viewport.screenshot.png` (both contain the toolbar column, where `#toggle-grid` now shows `.active`, and the badge). `mayChange`: `ui_visual/*.styles.json`. Gate: `compare.mjs --expect tests/regression/expected/F1-2.json --diff-bbox`, whose screenshot entries carry the measured per-frame `rects` above. Any differing pixel outside them is a FAIL. | all exports and state files; `ui_visual/*.sidebar.screenshot.png` (the sidebar does not change until F1-4); every pixel outside the measured rectangles (debug is off by default) |
| **F1-3** harness | T8 | `added`: `normals_debug/**` | every other output (full run, 0 diff); the two captures of `normals_debug` compare at 0 FAIL (WARN within the documented overlay jitter only; the scenario's own JSON verdicts are jitter-proof, 8.2) |
| **F1-4** LED side | T9a, T9b | `expect`: every file from the `grep '"inputs"'` list (each card now has the select, and its option labels are in the card text); `ui_sections/ui_*.json`; `ui_visual/*.sidebar.screenshot.png` and **`ui_visual/*.viewport.screenshot.png`** (page captures include the sidebar: the first card is expanded, so the LED Side row and `#flip-all-sections` move what is below them). `mayChange`: `ui_visual/*.text.json`, `ui_visual/*.styles.json`. JSON exports: if 08 P2-13e has landed, every JSON-export and ZIP output from the list (T9b adds `face_orientation` and this feature's revision bump; no earlier writer writes the key, 07 C39). | every OBJ, glTF, MTL and PNG export; every **`#three-canvas`** capture (the 3D view does not change: every harness section is stage-facing), including every `normals_debug` capture; every non-screenshot `normals_debug` output |
| **F1-5** FrontSide + back shell | T10 | **Derived by an instrumented run, not typed** (below). `expect`: `normals_debug/content_probes.json` plus every `#three-canvas` capture with `backPixels > 0` (this includes `normals_debug/a2_behind`, `a3_box_p1`, `a4_box_p2` and `box_corner`'s captures at the reset pose, and any 08 `p2_*` capture with a 180°-offset section or a camera behind the wall). `mayChange`: every other `#three-canvas` capture taken in content shading (three's opaque sort is program id first, and the side change creates new programs, so pixels where coplanar lines meet the wall, such as frame lines and the grid's z = 0 line at the wall base, can swap draw order). Review rule: each `mayChange` capture that differs must differ only along such lines; the reviewer records its `--diff-bbox` in the compare report. | every export; every `ui_*` output; every capture taken in debug shading (the override materials are `DoubleSide` and the shells are hidden); `normals_debug/face_probes.json`, `keyboard.json`, `exports_isolation.json`, `picking.json`, `preview_isolation.json`, `pilot_legend.json`, `popover_fit.json`, `content_restored.json`; `a1_front` |

**F1-5 manifest derivation** (T10). Run T10's harness code against a worktree of the **F1-4 commit** (still `DoubleSide`, with the face-orientation view), the same `--root` pattern as 08 §8.1 step 0:

```bash
git worktree add ../led-f1-4 <F1-4 commit>
node tests/regression/run.mjs --root ../led-f1-4 --out tests/regression/output/probe-f1-5 --probe-backfaces
git worktree remove ../led-f1-4
```

`--probe-backfaces` wraps `app.screenshotCanvas`: after each normal capture it reads the checked `input[name=debug-shading]`; if it is `content`, it calls `app.click('#debug-shading-face')` (`el.click()`: no pointer event, no focus change, popover state untouched), captures again, counts pixels with `classifyFace(rgb) === 'back'`, and restores with `app.click('#debug-shading-content')`. It writes `probe-f1-5/backfaces.json` = `[{output, shading, backPixels}]` and **no golden outputs** (the directory is never promoted). The `expect` list (written with `"each": true`, so every listed capture must actually change) is every `output` with `shading === 'content' && backPixels > 0`; the `mayChange` list is the remaining content-shading captures; captures with `shading !== 'content'` must stay identical. The command and the resulting `backfaces.json` are attached to the F1-5 PR.

`content_probes.json` must change exactly as follows at F1-5:

| Pose | Before F1-5 (`DoubleSide`) | After F1-5 |
|---|---|---|
| `front` | wall colour found, cabinet not visible | unchanged |
| `behind` | wall colour found (mirrored), cabinet not visible | wall colour **not** found, cabinet **visible** |
| `boxP1` | all 4 section colours found | Front **not** found; Back, Side Right, Return found; cabinet visible |
| `boxP2` | all 4 found | Back, Side Right, Return **not** found; Front found; cabinet visible |

The compare report of each step (`f1-<n>-compare.txt`) is attached to the commit or PR description. The baseline directory is git-ignored, so the report is the record of the intended delta.

### 8.5 Input to spec 08's P2-2 manifests (CR-2)

This list is derived from the current `baseline/manifest.json` with the first command of 8.4. 08 P2-2c lists the config scenarios, `ui_sections` and its own `p2_*` scenarios. It does **not** list `import_edge` or `logos`, and P2-2d also misses them. 08 line 1044 already asks for this re-check.

| Scenario | OBJ | glTF | ZIP (OBJ + glTF entries) | Curved |
|---|---|---|---|---|
| `default`, `flat3`, `box_corner` | 3 each | 3 each | 1 each | no |
| `concave_offsets`, `convex`, `mixed` | 3 each | 3 each | 1 each | yes |
| `large_wall` | 3 | 2 (3 after P2-1a) | 1 | yes |
| `ui_sections` | 1 (`edited__export-obj`) | 0 | 0 | yes (`ui_05` sets a curve) |
| `import_edge` | 4 (`ii_{combined,section,panel}`, `iii_weird`) | 4 | 0 | yes (5°) |
| `logos` | 0 | 0 | 6 | no |
| 08's `p2_*` scenarios | as listed in 08 | as listed in 08 | as listed in 08 | – |

Suggested `expect` patterns for P2-2c and d: `{default,flat3,concave_offsets,convex,mixed,box_corner,large_wall,import_edge,ui_sections}/*.obj`, the matching `*.gltf`, and `**/*export-zip*.zip`. After promotion, 08's step 6 (re-run, compare at 0 FAIL) proves that no stale OBJ, glTF or ZIP remains.

---

## 9. Acceptance criteria

1. **Export orientation.** After F1-0, `export-orientation.test.mjs` and `tools/check-orientation.mjs` pass for every OBJ and glTF under `GOLDEN_DIR`, searched recursively (including every ZIP and `*.zip.entries/` file), and for 500 fuzzed integer walls with random reversed sections in all three modes. The check is `dot(geometric normal, vertex normal) > 0` at all three vertices of every triangle.
2. **Normal properties.** The 6.3 properties hold over the integer fuzz:
   - unit length within 1e-12;
   - flat sections within 1e-12 of `σ·(−sin a, 0, cos a)` and `Object.is`-equal to σ × `'right-panel'` (given CR-1);
   - `(0, 0, 1)` exactly only at heading 0 with σ = +1;
   - curved interior normals exactly `|c|/2` from each adjacent face normal.
3. **glTF structure.** Every primitive has `NORMAL` with `count` equal to `POSITION`'s, decoded lengths within 1e-6 of 1, and no `doubleSided` key. These are checked in `io.test.mjs` (08), by 08's `tools/check-gltf.mjs`, and again by the golden orientation test. The Khronos validator run is a recorded manual step (8.3).
4. **Viewport invariance.**
   - F1-1 has an empty manifest and 0 diffs.
   - F1-2: every differing pixel of every `#three-canvas` and `ui_visual/*.viewport` capture lies inside the measured toolbar-column and help-badge rectangles of that capture's frame (the `rects` of the `--expect` entries, 8.4); `ui_visual/*.sidebar` captures are unchanged.
   - F1-3 changes nothing outside `normals_debug`.
   - F1-4 leaves every `#three-canvas` capture unchanged; the `ui_visual` page and sidebar captures change only through the LED Side row and `#flip-all-sections` (reviewed).
5. **FrontSide and cabinet back.** After F1-5, `normals_debug/content_probes.json` changes exactly as in the 8.4 table: the default wall seen from behind shows the cabinet colour `#403C37` (a connected region of at least 400 px) and not the wall colour, and the box poses lose exactly the back-seen section colours. The front pose is unchanged. Every capture that `backfaces.json` lists with `backPixels > 0` changed, and every capture taken in debug shading did not.
6. **Face orientation view.** `normals_debug/face_probes.json` equals: default `{front: 'front', behind: 'back'}`; `boxP1` `{lavender: 'front', teal: 'front', olive: 'back'}`; `boxP2` `{lavender: 'back', teal: 'back', olive: 'front'}`. It is unchanged by F1-5.
7. **Normal lines.** `N` and `#toggle-normals` toggle the lines and `aria-pressed`. For the default wall in combined mode (B1 starts from S0, 8.2) the stats read exactly `"24 vertex lines · 0.117 m"`, and with face lines at ×2 `"24 vertex + 15 face lines · 0.233 m"`. Panel mode shows 4·panels vertex lines.
8. **Exports isolated.** `normals_debug/exports_isolation.json` is all `true`: OBJ, MTL, glTF (each mesh mode), JSON, ZIP entries and panel-ID PNG exported with every debug option on are hash-equal to those exported from the same project state with debug off (B0 versus B7, both from S0).
9. **Preview isolation.** The camera preview canvas with lines on and off differs by no more than the harness's documented jitter (`withinJitter`: max channel difference ≤ 1 and at most 16 differing pixels, with the preview's header and footer labels excluded): `preview_isolation.json` `{pass: true}`.
10. **Picking unchanged.** With lines, face lines and on-top enabled and the gizmo in translate mode, `normals_debug` selects the person prop by its pixels (`picking.json`). After F1-5, `pickMeshes()` returns the LED meshes followed by the back shells, and each shell's `userData` (`kind: 'led-wall-back'`, `sectionId`, `sectionIndex`, and in combined mode the same `sectionRanges` array) matches its LED mesh's tags (unit test). Picking a section from behind in the viewport is an acceptance criterion of Feature 2, the first feature that picks sections.
11. **Override survives rebuilds.** Face orientation stays applied after a mesh-mode change, wireframe on and off, and colour edits. Choosing Content restores a screenshot within `withinJitter` of `a1_front`, overlay rectangles excluded (`content_restored.json` `{pass: true}`).
12. **No leaks.** `material-override.test.mjs` passes: debug materials are never disposed by a rebuild, and originals are restored exactly once. The manual 50-rebuild memory check (8.3) shows no geometry or texture growth.
13. **Shortcuts and focus** (`keyboard.json`, B8, and `debug-view-controls.test.mjs`).
    - `n` in a text input does nothing, and neither do `Ctrl+N` or `Alt+N`. A held `N` toggles once.
    - A pointer-opened popover leaves focus on `#debug-view-btn`. After a pointer click on a popover control, `document.activeElement` is `BODY`, `N` toggles the lines and `G` sets translate mode.
    - With the popover open, the first `Escape` closes it and leaves the gizmo mode unchanged; the second `Escape` clears it (legacy deselect). From 07 I1 this holds through the registry entry at priority 70, also when focus is on `BODY` after a pointer change.
    - A keyboard-opened popover focuses the checked shading radio; arrow keys change the shading with focus kept on a radio; `N` is ignored while focus is inside the popover; `Escape` closes it and returns focus to `#debug-view-btn`.
    - A click on a non-control part of the popover followed by a keyboard change does not move focus (stale-flag test).
14. **Caps.** (a) The unit benchmark of the largest importable wall (200 sections × 50×20) writes, with vertex lines only, exactly 107,100 lines with stride 2 and the exact warning text "Showing 1 of every 2 normals (214,200 total, cap 150,000)"; with both kinds, exactly 138,067 lines with stride 3 (≤ 150,000) and "Showing 1 of every 3 normals (414,200 total, cap 150,000)". (b) The manual browser check on `normals-max-wall.json` (200 sections × 50×20, combined) shows `normals:sync` < 50 ms for both settings and exactly +1 draw call.
15. **Popover and legend fit.** `popover_fit.json`: the popover lies inside the overlay and every control is reachable at overlay heights of 590 px (opens upward) and 350 px (clamped and scrollable; the toolbar column scrolls). `pilot_legend.json`: `pilotStarted` and `legendVisible` are true, the legend does not intersect `#pilot-info`, and Escape exits pilot.
16. **LED side.**
    - The card select (`select[data-section-flag="faceOrientation"]`) and "Flip LED Side (All Sections)" change `faceOrientation` and rebuild. The select's `aria-label` follows a rename.
    - A reversed section shows its cabinet back from the stage after F1-5 and passes AC 1 in every export.
    - Its safe-distance band lies on its LED side with +Y faces (`safe-distance-band.test.mjs`), and coverage uses `σ·n`.
    - A v1 import gives `'stage'`. A v2 round trip preserves `'reversed'`, written right after `curvature`. An unknown value imports as `'stage'` with the `defaulted` warning at `sections[i].face_orientation`. No writer emits the key before T9b, and T9b's commit bumps the revision once. The value is never `undefined`, and `Object.keys(section)` equals `SECTION_FIELDS`.
17. **Announcements.** `#debug-view-status` changes only on `DEBUG_VIEW_CHANGED`, at most once per 400 ms. `#debug-normals-stats` is not a live region. Stats text is identical on every machine (fixed formatter).
18. **Gates.** Unit, static and full golden-master gates are green after **each** step's promotion, F1-1 included: at F1-1 no `Events` key exists without both an emitter and a subscriber, and no DOM id is owned before its markup exists. No new console errors appear in any scenario. 08's step 6 self-consistency compare exits 0.
19. **Cabinet colour.** `theme.scene.wallBack` is `#403C37` (or the owner's Q1 choice) in the `Theme.js` fallback, `--scene-wall-back`, the `COLOR_BINDINGS` row and spec 06's per-key table alike, with at least 1.5:1 contrast to the scene background and at least 20 RGB units from every background/grid blend, so `content_probes` cannot match grid lines.
20. **Debug shading stays out of stills.** A 07 R4 camera still or a 09 X4 screenshot taken with face orientation on shows the content materials unless `include.debug` is true; the live preview keeps the shading (Q10, 07 C48). With HDRI content (spec 05), face orientation overrides the HDRI material and "As displayed" restores it, with no disposal of either (unit).

---

## 10. Task breakdown

### 10.1 Tasks

Effort: S ≤ 0.5 d, M 1-2 d, L 3-5 d, XL > 5 d. The prerequisites owned by spec 08 (P2-1 1.5 d, P2-2 2 d, P2-5 2 d) are **not** counted here.

| # | Task | Effort | Depends on |
|---|---|---|---|
| T1 | Extend 08's `tools/check-orientation.mjs` (ZIP entries, recursive directories); `export-orientation.test.mjs` (golden plus integer fuzz with σ); `tools/make-cap-wall.mjs` and `tests/fixtures/normals-max-wall.json` (**200** × 50×20) | M (1 d) | 08 P2-0 (the checker), P2-2d |
| T2 | Harness-only PR, the second of 07 C57's series (after 08 P2-0, before 07 G3): the `rects` field of `--expect` manifest entries (per-pixel rule, frame-size check) and `--diff-bbox`, unit-tested with synthetic PNG pairs; `tests/regression/measure-rects.mjs`; the live palette hook `lib/palette.mjs` (07 C53); README section | M (1 d) | 08 P2-0 (`--expect`) |
| T3 | `geometry/NormalLines.js` (writers, caps, auto length, `uploadCount`, `formatCount`, `formatNormalStats`) + `normal-lines.test.mjs` incl. the cap benchmark | M (1.5 d) | Phase 1 WP4 |
| T4 | `render/NormalsDebugView.js` (buffers with `updateRange`, scratch matrices, layers, optional stats element), `core/renderOrder.js` (+ the `TransformGizmo` literal and the static rule), `SceneManager.init` layer enable | M (1 d) | T3, WP6 |
| T5 | `render/DebugMaterials.js` (GLSL 6.8), `render/MaterialOverride.js` + test (including the `Material[]` case), `LEDWallView.setDebugShading` with restore-before-dispose and re-apply in `rebuild`, `withContentMaterials(fn)` + test (07 C48) | M (1.5 d) | WP6 |
| T6 | `DebugViewSettings`, `DebugViewController` **without** bus or event, App wiring (5.7, F1-1 part), ARCHITECTURE section 4 rows for `DebugViewSettings`, controller spy test; **F1-1** gate (no new `Events` key, no new DOM id) | M (1 d) | T4, T5 |
| T7 | UI: markup (buttons, divider, popover incl. `#debug-normals-stats`, legend in `#viewport-top-stack`, announcer, badge text ` N=normals`, the only per-feature badge token, 07 C35), `css/features/debug-view.css` (incl. `.view-btn.active`, of which T7 is the one named owner, 07 C52; the `@media` overflow fallback), `DebugViewControls` (mirror, placement, keyboard/pointer open focus, blur rule, Escape capture listener until 07 I1 then registry 70, debounced announcer, N / Shift+N, "As displayed" label), `DEBUG_VIEW_CHANGED` (visual) + `#emit()` + `bus` dependency, the stats lookup and ownership entry, consumes 08 P2-9b's `core/typingTarget.js`, the B-L24 note narrowing; **F1-2** re-baseline with measured `--expect` `rects` | M (2 d) | T6, T2, WP8, 08 P2-9b |
| T8 | Harness: `normals_debug` (Part A, Part B with S0 preconditions), `lib/probe.mjs` (`largestComponent`, `diffStats`, `withinJitter`, `PALETTE` from the palette hook), `screenshotElement`, `pointerClick`, `overlayRects`, N keys with modifiers, `findPersonPixel` export; two captures and flake triage; **F1-3** | L (3 d) | T7, WP1 |
| T9a | LED side, domain and geometry: `WallSection` (4.1: `LEGACY_SECTION_FIELDS`, `SECTION_FIELDS` + key, normalisation, summary) and the unit-test projection re-baseline, `Wall.appendLikeLast`, `SectionLayout.facing` + `flatEdgeFacing`, builder `reversed` + required winding, `panelShell(sl)`, panel-plane flip, safe band σ (6.4) + tests, coverage σ | M (2 d) | T8 (so `normals_debug` guards it), 08 P2-5b, P2-3b; P2-11 for coverage |
| T9b | LED side, persistence and UI: v2 field (`ProjectSchema` row, one revision bump assigned at merge, 07 C40), validator rule + serializer tests, `WallController` methods, `SectionListPanel` row (`data-section-flag`) + `#flip-all-sections` + summary + aria-label on rename, ARCHITECTURE section 4 rows; **F1-4** re-baseline (T9a and T9b land as one step, F1-4) | M (2 d) | T9a; P2-13e for persistence |
| T10 | `side: 'front'`, `backShell()` (`#403C37`), back shells (children; per-section in panel mode, Feature 2-aware transform path), `pickMeshes()` and the `disposeObject3D` de-dup (this spec is the one named owner of both, 07 C52), `sectionNodes().backMeshes`, `wallBack` theme; `run.mjs --probe-backfaces` and the derived manifest; **F1-5** re-baseline review | M (2.5 d) | T7 (face orientation exists, 08 Q3), T9a/T9b (the user remedy exists), owner sign-off on Q1/Q2/Q5 |
| T11 | Docs: the ARCHITECTURE amendments (5.8, landing with each step), a README "Orientation and normals" section with before/after screenshots and the checker usage, and a release note for pipeline users. The cross-spec notes (10.3) are applied by 07's consolidated D0 (07 C58), not here. | S (0.5 d) | lands with each step |

**Total ≈ 19 dev-days (XL overall)**, including about 2 d of re-baseline review and flake triage spread over F1-2, F1-3, F1-4 and F1-5. Revision 3 counted 19.5 d; revision 3.1 moves T11's cross-spec half-day into 07's consolidated D0. Revision 2's 16 d under-counted the harness scenario (17 steps, new probes, CDP modifiers, two viewport sizes, double capture), the LED side (domain, layout, builder, band, coverage, serializer, validator, controller, UI and a test re-baseline) and the shell work (three mesh modes, the Feature 2-aware transform path, disposal de-duplication, the derived F1-5 manifest).

| Area | Tasks | Effort |
|---|---|---|
| Debug view | T3-T7 | 7 d |
| Harness and tooling | T1, T2, T8 | 5 d |
| LED side | T9a, T9b | 4 d |
| FrontSide + back shell | T10 | 2.5 d |
| Docs | T11 | 0.5 d |

### 10.2 Order and dependencies

```
08 P2-0 → P2-1a → P2-2a-d → (P2-3b, P2-5b)                         [spec 08, prerequisites]
      └→ F1-0 (T1, T2) → F1-1 (T3-T6) → F1-2 (T7) → F1-3 (T8) → F1-4 (T9a + T9b) → F1-5 (T10)
                                                                               ↑ owner sign-off Q1, Q2, Q5
```

- F1-1 adds no event and no DOM id: `DEBUG_VIEW_CHANGED`, its emitter and its subscriber, the markup and every DOM-id ownership entry land together in F1-2, so the static gate is green at F1-1 (AC 18).
- **F1-5 is gated** on F1-2 (face orientation view exists: 08 Q3), on F1-4 (a user remedy exists for walls laid out the other way: the reason "flipped by default" is safe to make visible) and on owner sign-off.
- F1-4 does **not** need 08 P2-13e. Without it the value is session-only and says so (4.5).
- **Feature 2** relocates the LED side controls and adds the `SECTION_CHANGED` live subscription (CR-5). **Feature 3** needs no work: its pivot is baked into the layout (spec 03 D4), so lines follow through `WALL_REBUILT` and exports through the layout. **Feature 4**'s `TEXCOORD_0` extends the same attribute list. **Feature 5** consumes the correct normals, `FrontSide` and `LAYERS.HELPERS`. **Feature 6**'s ThemeBridge carries `scene.wallBack` and `scene.debug` (CR-8).

### 10.3 Cross-spec change requests

These requests are applied to the target specs by 07's consolidated D0 (07 C58).

| # | Target | Request | Why |
|---|---|---|---|
| CR-1 | 08 §6.4, test row P2-2 | Replace the per-vertex `Object.is` short-circuit with a section-level one: `if (sl.isFlat) return the 'right-panel' normals verbatim`. Restate the test: flat sections are `Object.is`-equal to `'right-panel'` and within 1e-12 of `(−sin a, 0, cos a)`, and `(0,0,1)` only at heading 0. Run the geometric properties over integer inputs only (6.3). | The per-vertex check fails at 4 vertices of `large_wall` L3 (2.4), so 08's own test cannot pass as written. String and fractional fuzz produce NaN geometry. |
| CR-2 | 08 P2-2c/d manifests | Add `import_edge` (4 OBJ, 4 glTF), `logos` (6 ZIP, OBJ and glTF entries) and confirm `ui_sections` (1 OBJ), per 8.5. | Otherwise those outputs show as undeclared diffs, or are promoted stale. |
| CR-3 | 08 P2-2c | Add the constant OBJ header comment (7.1) in the same commit. | Documents the convention in every file with no extra re-baseline. Optional. |
| CR-4 | 08 R1, P2-2 "Unblocks", Q2 | Replace "Feature 1 adds an explicit 'Face orientation: Stage-facing / Reversed' **export** option" with "Feature 1 adds a per-section LED side (model data, applied to viewport and exports alike) and switches the viewport to `FrontSide`". No `doubleSided` export option in Feature 1 (Q6). | One source of truth. An export-only option would make viewport and export disagree. |
| CR-5 | spec 02 (every stale reference to spec 01) | (a) **Event:** `NormalsDebugView` subscribes to `SECTION_CHANGED` (`'section:changed'`, spec 02's own name) with `live: true`; spec 02 T6 adds the subscription with the handler of 5.2, which calls `sync({keepLength: true})`, not `sync()` (the cached layout is pre-drag, 6.7.4). (b) **Ownership:** spec 01 owns `WallSection.faceOrientation`, `normalizeFaceOrientation`, `setFaceOrientation`, `WallController.setSectionFaceOrientation` and `flipAllFaceOrientations`, **and ships the minimal UI** (card select, `#flip-all-sections`) in F1-4. Spec 02's "spec 01 delegates the LED side field and Flip all to this feature (spec 01 3.6, Q2, T13)" becomes "spec 01 ships them (3.1, 3.2, Q2, T9b); spec 02 relocates them": the select moves under its card's "Advanced" disclosure, the button **keeps the id `#flip-all-sections`** and moves into spec 02's section toolbar, owned by `SectionToolbar` from 02 T12 (spec 02 removes `SectionListPanel.bindFlipAllButton` in the same commit), and spec 02's generalised setter delegates to spec 01's. (c) **Step names:** spec 02's "spec 01 T13" is T9a/T9b (step **F1-4**); "spec 01 step C" is T10 (step **F1-5**); "hidden until spec 01 T13" becomes "present from F1-4". (d) **Attribute:** spec 01 adopts spec 02's `select[data-section-flag="faceOrientation"]`; no change in spec 02. (e) **Panel shells:** spec 01 builds **one shell per section** with `builder.panelShell(sl)` (base-layout coordinates, `matrix = sl.postTransform`), not one merged `panelShell(layout)`. Spec 02 therefore drops the shell `sectionRanges`, `shellVertexRange` and the per-panel corner rewrite: its fast path writes `shell.matrix.fromArray(sl.postTransform ?? IDENTITY)` for each affected section, and picking resolves the shell through `userData.sectionId`. (f) `pickMeshes()` (defined by spec 01 at F1-5) returns LED meshes then back shells; `WallSectionSelectable` accepts `kind: 'led-wall-back'`; spec 02's R6 is resolved by these shells (there is no temporary `DoubleSide` to drop). (g) `SectionHighlightView` uses `RENDER_ORDER.HIGHLIGHT_HALO` and `RENDER_ORDER.SECTION_HIGHLIGHT`, quoted by name (CR-10). (h) `faceOrientation` joins its field rule table and its `SECTION_FIELDS` order note stays valid (4.1: appended last, before 02's `'offset'`, `'locked'`, `'detached'`). (i) `floorRuns()[r].facing` as already specified there. (j) Its stylesheet request (02 T14) is satisfied: spec 01 uses `css/features/debug-view.css`. | Removes every stale cross-reference: the event name, the shell shape, the step names, the attribute and the ownership of the field, setters and UI. |
| CR-6 | spec 03 | Correct the Feature 1 notes: lines follow the baked pivot through `WALL_REBUILT` (D4), not through a root `matrixWorld`. Applying `LAYERS.HELPERS` to the **existing** helpers (pivot marker included) is B-M11 / F0-e (spec 07 R1, or 08 P2-10a's preview hiding), not spec 01. | Spec 01 never moves existing helpers. |
| CR-7 | spec 04 | `#toggle-uv-viewer` goes after `#debug-view-btn`. The badge text is **not** changed by spec 04 (07 C35: per-feature tokens are frozen; only ` N=normals` exists, and 07 I4a rewrites the badge once). Its commit raises the two `@media` thresholds of the column overflow fallback (3.1) by 48 px (444 → 492, 794 → 842). Spec 01 adopts spec 04's iterate-and-switch `attributes` rule. | Fixed toolbar geometry (3.1). One read rule. |
| CR-8 | spec 06 | Tokens `--scene-normals` = `#B8F03C` (not Sky `#58A6E8`, which is ΔE00 18.9 from the face-front blue), `--scene-normals-face`, `--scene-face-front`, `--scene-face-back` and `--scene-wall-back` = `#403C37` (06 §5.12's per-key table too), with `COLOR_BINDINGS` rows and parity entries (4.6). The `.view-btn.active` rule belongs to this spec's T7 (07 C52; spec 06 T11 is dropped, and 06 T4a maps the rule to role tokens). Spec 06's utilities stylesheet is `99-utilities.css` in 07 C52's link order: spec 01 uses no numbered `css/13-*` file. | Spec 06's own U6 rule rejects the old yellow (ΔE00 7.0); no numbered-file collision. |
| CR-9 | **08 P2-9b**; 07 I1; specs 02, 05 | (a) **08 P2-9b** creates `js/core/typingTarget.js` with 07 §3.8's `isTypingTarget(t)` truth table and makes `InputState.isShortcutIgnoredTarget` delegate to it (or be replaced by it), instead of its own table (INPUT of every type); it is the module's one named owner (07 C52). Its `p2_shortcut_filters` steps are unaffected (they use a SELECT, Ctrl and repeat). (b) **07 I1:** no change to the truth table (it already excludes `range` and `reset`). The debug popover's Escape entry is the registry entry at priority 70, conditioned on `debugControls.isPopoverOpen()`, not on focus inside the popover, because a pointer change blurs the control (3.2; 07 C42). The movement guard stays as written: after a pointer change focus is on `BODY`, which it does not block. (c) `interaction/InputState.js` (02, 05) and `interaction/Keymap.js` (07) re-export `isTypingTarget` rather than redefine it. | One truth table for B-L11 instead of two with different results on checkboxes, radios and ranges; the popover keeps working under every guard. |
| CR-10 | specs 02, 03, 04, 05, 06, 09, `TransformGizmo` | Use `RENDER_ORDER` from `core/renderOrder.js` (5.2), the single registry: spec 03's pivot marker uses `PIVOT_MARKER` 996 (998 is the section highlight); spec 06's `SectionHighlightView` halo/core use `HIGHLIGHT_HALO` 997 and `SECTION_HIGHLIGHT` 998, and its `CameraRigView` core uses `RIG_CORE` 1; spec 05's backdrop uses `HDRI_BACKDROP` and its projection marker `HDRI_MARKER` 993; spec 04's `UvHighlightView` uses `UV_HOVER_OUTLINE` 994; spec 09's `MeasureView` uses `MEASURE` 992 and `InnerFrustumView` `INNER_FRUSTUM_OVERLAY` 990 (depth-tested); spec 02's highlight uses the two highlight slots by name; the gizmo uses `GIZMO` 999. Normal lines on top use 995, below every selection overlay. The static rule covers literals ≥ 900 only, in every spec's files. | Revision 2 collided with spec 03 (998) and spec 06 (997/998); 04, 05 and 09 had no slot. |
| CR-11 | **08 P2-13e** (§4 v2 example) | P2-13e writes **neither** `sections[i].face_orientation` nor `wall.conventions` nor `display.debug` (07 C39: feature keys are absent until the feature's own landing commit). T9b adds `face_orientation` with this feature's revision bump. There is no special import rule: stray `wall.conventions`/`display.debug` keys are dropped by the generic `dropped-unknown` handling. Validator issue path: `sections[i].face_orientation`. | One rule for every feature key; no feature-private migration. |

---

## 11. Risks and open questions

### 11.1 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Spec 08 declines CR-1 | 08's `Object.is` test fails on `large_wall` L3, or the test gets weakened | Feature 1's own property tests use the 1e-12 tolerance against the analytic normal, which passes either way. The bit-exact assertion is only made where CR-1 is in force. |
| Downstream pipelines that compensated for the old inverted output | Walls become double-flipped after P2-2 | Release note, README section with before/after screenshots, `tools/check-orientation.mjs`, the CR-3 header comment, and the LED side control for genuinely reversed sections |
| Users whose wall was laid out clockwise see cabinet backs from the stage after F1-5 | Surprise | F1-5 lands only after F1-4 ships the LED side control and "Flip LED Side (All Sections)", and after owner sign-off. The face-orientation view and legend explain the colours. |
| LED side is session-only if Feature 1 lands before 08 P2-13e | A reversed setting is lost on save/reload | The select's `title` and the release note say so. P2-13e is in Phase 2, which normally precedes Feature 1. |
| The material override disposes the shared debug materials or leaks the originals | Context loss or memory growth | `MaterialOverride.restore()` runs as step 0 of `rebuild`; unit test; AC 12 |
| Screenshot re-baselines touch every viewport screenshot in F1-2 | Reviewer fatigue could hide a regression | The `rects` of the `--expect` entries make the toolbar-only rule mechanical and per-pixel, with rectangles measured from the DOM per capture frame (canvas, wide page, narrow page), so a wrong frame is a FAIL rather than a silent pass; one commit per step; debug is off by default |
| New programs and materials (back shell, `side` change) shift three's sort ties | Pixel noise where coplanar lines meet the wall in F1-5 | Declared under `mayChange` from the instrumented `--probe-backfaces` run, with the review rule of 8.4. The probes (JSON verdicts) are the real gate. |
| The orbit target changes (08 P2-11c, Feature 3 pivot) | Hard-coded projection probes would break | Probes locate sections by colour, and the expected sides depend only on the view direction (checked for 5 targets) |
| Spec 07 U3's colour-management switch (07 C54), or spec 06 T5/T7's palette and token changes, change rendered colours | The probe colours stop matching, so `content_probes.json` and `face_probes.json` change | Probes read the wall and cabinet colours from the live palette hook (`lib/palette.mjs`), never literals (07 C53). 06 T5/T7 and 07 U3 declare both files in their manifests; U3 also updates the normal-colour triples if needed. The face classifier compares channels (`b > r + 60`) and does not depend on exact values. |
| Feature 2 transform-only updates do not emit `WALL_REBUILT` | Stale normal lines during drags | `SECTION_CHANGED` (`'section:changed'`) `{live}` subscription added by spec 02 T6 (CR-5); `keepLength` and `updateRange` keep it cheap |
| Mirrored transforms (det < 0) introduced later | Viewport (`frontFaceCW`) and exports disagree | Rigid-transform invariant with an assert in `layoutProject` (6.1) |
| Lime lines have low luminance contrast on the default cyan wall (1.04:1) | Lines harder to see on that colour | Hue difference ΔE00 40.7, the dark base of each line, and "Draw on top" |
| `gl_FrontFacing` bugs on some mobile GPUs | Wrong face-orientation colours there | Debug-only; documented in the legend's `title` |
| A new stylesheet breaks the Phase 1 `css-slices` gate, or the responsive rules stop being last | CI red, or narrow-layout rules overridden | New rules live in `css/features/debug-view.css`, linked before `12-responsive.css` with their own `@media` rules (07 C52's link order); the gate runs report-only and scoped to `01-12` from the first intentional CSS change (07 S7) |
| Pixel comparisons inside the scenario flake on the documented 1-level overlay jitter | F1-3's double capture fails, or AC 9/11 become flaky | No exact equality anywhere: `withinJitter` (max diff ≤ 1, ≤ 16 pixels) with overlay rectangles excluded; the golden JSON stores the verdict only (8.2) |
| Part B steps leak state into later steps | Wrong expectations (stats in panel mode, isolation exports differing, pilot never starting) | Every step names its precondition and the state it leaves, relative to S0, and asserts the precondition (8.2) |
| A later three upgrade (r150+) removes `examples/js` | none for this feature | Core APIs only. `ShaderMaterial` GLSL with `gl_FragColor` still compiles under three's GLSL3 conversion. |

### 11.2 Open questions for the owner (each with a recommended default)

**Q1, Q2 and Q5 need explicit owner sign-off before F1-5 (FrontSide) lands.**

| # | Question | Recommended default |
|---|---|---|
| Q1 | Seen from behind, what should the wall look like after the `FrontSide` switch: a dark cabinet back, see-through, or the old double-sided look? | **Dark matte cabinet back in warm graphite `#403C37`.** It is physically correct and exposes sections facing the wrong way. Unlike revision 2's `#16161E` (1.10:1 against the background, almost invisible, the "invisible wall looks like a bug" concern of 08 Q3), it has 1.81:1 contrast to the background and ΔE00 ≥ 13.7 from both grid colours, so the wall stays clearly visible while orbiting and is never confused with the grid. A thin edge outline can be added later if the owner wants more definition. |
| Q2 | Ship a per-section LED side with a minimal UI in Feature 1 (card select + "Flip LED Side (All Sections)"), rather than waiting for Feature 2? | **Yes.** It is the user-visible choice that "flipped by default" implies, and the safety net that F1-5 needs. Feature 2 relocates it. **No** per-project flag. |
| Q3 | When a section is reversed, should its content (UVs, panel-ID columns) also mirror so it reads correctly from the new front? | **No.** Reversal flips facing only; mirroring is Feature 4's "Flip U". Revisit if reversed sections become common. |
| Q4 | Smooth normals across section seams when the seam angle is small? | **No.** Every section boundary is a hard crease, matching separate physical sections. |
| Q5 | Offer a "legacy inverted export" option for existing pipelines? | **No.** Provide the release note, the checker tool and (if CR-3 is accepted) the OBJ header comment. The LED side covers walls that genuinely face the other way. |
| Q6 | Write `doubleSided: true` in glTF materials, or offer it as an option? | **No.** Single-sided is correct now. Revisit only if an engine user asks. |
| Q7 | Persist debug view settings between sessions (localStorage)? | **No** for this release: session-only, default off. |
| Q8 | Normal-colour mode: world space or view space (`MeshNormalMaterial`)? | **World space** (stable colours while orbiting; also used by the harness probes). |
| Q9 | Shortcuts `N` (lines) and `Shift+N` (cycle shading)? | **Yes, as specified.** |
| Q10 | Should debug shading also appear in the camera preview window? | **Accept it in the live preview** (it is a scene material swap) and say so in the legend. Lines are already excluded. Stills and screenshots exclude it unless asked (`withContentMaterials`, 07 C48). |
| Q11 | Default normal-line kinds when first enabled? | **Vertex normals only.** Face normals are opt-in, for diagnosing winding. |
| Q12 | Where should "Flip LED Side (All Sections)" live until Feature 2? | **Below "Add Wall Section"** in the sidebar. Feature 2 moves it, id kept, into its section toolbar. |
| Q13 | Normal-line colours: lime/magenta (this spec) or spec 06's Sky? | **Lime `#B8F03C` / magenta `#FF4FD8`**: they pass spec 06's gold-distance rule and stay distinct from the face-orientation blue (4.6). |
