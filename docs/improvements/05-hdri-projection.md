# Feature 5: HDRI upload projected onto the LED wall for previs, plus a reflective car

| | |
|---|---|
| **Status** | Implementation-ready specification (Phase 3 / Phase 4 feature). **Revision 3.1** applies the cross-spec consistency review (07 §0 C32-C62): the HDRI point is `'hdri-point'` / `HDRI Point` / kind `'projector'` / priority 9 with `isSelectable()` and `selection.revalidate()` instead of a hand deselect (C36); the bake and coverage read `WallController.currentLayout` (no `lastLayout`; `rebuildSeq` stays; 07 0.4, C60); the point's x/z range is ±100,000 m (C45); `H`/`Shift+H` match by key (C43); RB-2b and the badge token are dropped (C35); the Panel IDs section stays visible, collapsed (07 0.4); `setContentMode` is the only content writer (C49); the marker uses 06's colours and `RENDER_ORDER.HDRI_MARKER`; `PROJECT_REPLACED` is `apply` step 8 and `carModel.syncFromModel` step 3 (C41); revisions are assigned at merge (C40); the documentation part of T15 moves to 07's consolidated D0 (C58). **Revision 3**: rebased on spec 07 revision 2, section 0 (binding). Delivered as an **MVP release** of about 12.75 engineer-days plus increments that the owner approves one by one (10.2). **Plan review (2026-10-16):** the car increment gains a measurable quality bar (AC 33), a side-by-side render sign-off before T11, and a named higher-fidelity candidate, Khronos CarConcept (CC BY 4.0, 6.10, Q3); T10 grows by 0.5 d (car increment 5.5 d, everything about 29.25 d). The stale references to spec 01 "steps A and C" now use spec 08 P2-2 and spec 01 F1-5. |
| **Binding contracts** | `docs/ARCHITECTURE.md` and `docs/REFACTOR_PLAN.md`. **Spec 07 revision 2, section 0, wins over this spec wherever the two differ.** This revision applies every 07 0.2 row for spec 05 (decision record below). Spec 07 is authoritative for these contracts:<br>- the v2 envelope and extension protocol (07 4.2-4.7);<br>- the single renderer and layer table (07 R1-R3, 5.2);<br>- the `Selectable` v2 API (07 5.4.1) and `KEYMAP` (07 3.8);<br>- `ProjectSession` (07 5.5.2) and `History` (07 5.6.1);<br>- `core/sha256.js` (07 6.13), `vendor/three-addons.js` (07 5.7.4) and `app/Prefs.js`.<br>Where this spec needs a contract change in another document, 5.11 lists it. Amendments land in the same commit as the code (REFACTOR_PLAN section 7). The exception is the cross-spec reconciliation, which 07's consolidated docs-only D0 applies (07 C58; revision 3's T15 is withdrawn). |
| **Decision record: persistence** (the same decision is recorded in 07 0.1 C9 and C20) | Spec 07 r2 section 0 is adopted verbatim:<br>1. A **top-level, snake_case `hdri`** object: `hdri.{source, quality, backdrop, projection}`. It has its own source descriptor, `hdri.source = {name, bytes, sha256, path}`.<br>2. `assets[]` holds **logos only**. The kinds `hdri` and `model` stay reserved, and this spec writes neither.<br>3. The car model is `props.car.model`, with 07's leaves `{kind, asset_id, paint, finish, env_source}`.<br>4. `app/HdriCache.js` (T8b) is the **only IndexedDB store** (07 C20, rule S2). Spec 07 H4 `AssetPersistence` is withdrawn.<br>5. Hashing uses the `digest` function that `App` injects (`core/sha256.js sha256Hex`), not `AssetStore`.<br>6. The ZIP entry is `hdri/<name>`.<br>7. The version marker is `"version": "2.<revision>"` (07 C2).<br>Revision 2 of this spec had adopted 07 revision 1's shapes, which 07 revision 2 rejected: camelCase `environment.hdri`, `assets[]` kinds `hdri`/`model`, `AssetPersistence`, and the `schemaVersion`/`schemaRevision` keys. They are withdrawn here. If the owner ever prefers another shape, 07 section 0 and this table must change in the same docs commit. |
| **Legacy reference** | `index.html@cd3fd3f`. Line numbers below refer to that file. |
| **Sibling specs** | 01 normals, 02 section editing and offsets, 03 pivot, 04 UVs and UV viewer, 06 branding, **07 platform foundations**, 08 bug-fix roadmap, 09 additional ideas (measure tool, key `M`). All are in `docs/improvements/`. Section 2.4 states how this spec depends on each one. |
| **Hard prerequisites** | - Phase 1 merged, including 1C **H1** (`Strategies.dispose.wallTextures = true`, B-H5).<br>- **Spec 07 R1-R3** (single renderer, `LAYERS.ENVIRONMENT`, `PreviewPass`, render-on-demand) for everything that renders.<br>- **Spec 07 I1, I2 and I3** (keymap, selection v2, `TransformControls` and `vendor/three-addons.js`) for T6 and for the loader factories (T1).<br>- **Spec 07 D4, D5 and D6** (v2 serializer, `ProjectSession`, `core/sha256.js`, ZIP open) for T8.<br>There is no fallback path: revision 2's T0 and its "path B" are deleted (07 C12). |
| **Soft prerequisites** | - Spec 07 H1 (history record rows), E1 (`Notifier`) and D8.<br>- Spec 08 P2-2 (stage-facing winding and normals; spec 01 revision 2's step A moved there) and spec 01 F1-5 (`FrontSide` and the cabinet back shell, 01 T10).<br>- Spec 02 post-transforms.<br>- Spec 03 stage frame and `stageAnchored`.<br>- Spec 04 per-section UVs, `invertUv`, `wallPointFromBaseUv` and glTF `TEXCOORD_0` (only for the bake increment, T13). |
| **three.js** | **r128 is the plan of record** (07 C13 and Q1: stay on r128 through Feature 5). Every r128 API named here was checked against the r128 sources on jsdelivr (Appendix A). Section 6.11 specifies 07's later port step U3b. |

---

## 1. Summary and user value

**Problem.** Virtual-production teams use this configurator to plan an LED volume: its shape, the camera and the safe distance. They cannot yet see **content** on the wall. During previs the questions are:

- What part of the location (an HDRI) lands on the wall from the camera's point of view?
- Does the wall image line up with the world beyond the wall, or does it break with parallax?
- How do reflections from the wall look on a glossy car?

Today the wall can only show flat section colours, an LED-pixel pattern or panel-ID labels. The car is a set of translucent boxes.

**What this feature adds.** Items 1-6 are the MVP. Items 7-9 are increments, approved and shipped one at a time (10.2).

1. **HDRI upload.** Accepted formats are `.hdr` (Radiance RGBE) and LDR equirectangular `.jpg`/`.png`; `.exr` follows in increment T17. Files are dropped or chosen; nothing is uploaded to a server. Oversized files are rejected from their header, before any pixel is decoded (6.9). HDRI content needs WebGL 2. r128 tries WebGL 2 first, so only browsers with no WebGL 2 at all see the message in 3.6.
2. **A fourth wall content mode: `Colour | LED pixels | Panel IDs | HDRI`.** HDRI mode projects the panorama spherically onto the wall from a **projection point**.
   - The default point is the film camera's nodal point. A custom point can be dragged in the viewport.
   - The controls are yaw, pitch, roll, exposure (EV, with an **Auto** button) and the tone map (default `auto`).
   - It works in all three mesh modes and survives section offsets (spec 02) and the pivot (spec 03), because it uses world positions, not UVs.
3. **Preview parity.** The camera preview shows the same projection, drawn by spec 07's `PreviewPass` in the same WebGL context. With the projection point on the camera, the preview and pilot mode show that camera's parallax-correct image.
4. **An optional HDRI backdrop.** An infinite dome behind the stage (07's `ENVIRONMENT` layer) shows the environment that the wall is a window into. Seen from the projection point P, the wall and the dome line up seamlessly. Seen from anywhere else, the parallax break is visible, which is the key previs insight.
   - In `Film camera` mode P is the film camera, so the pilot view and the preview are always seamless, and the orbit view shows the break.
   - With a `Custom point`, any eye other than P shows it, including pilot mode.
5. **Persistence by reference.** The project file stores the HDRI as the top-level `hdri.source` descriptor (name, size, SHA-256, ZIP path), never its pixels. A missing file shows a "Relink" state. A ZIP can bundle the file under `hdri/<name>`, and opening that ZIP restores it.
6. **Shortcuts.** `H` toggles HDRI content, `Shift+H` the backdrop, and `,` / `.` turn the image. These are spec 07's existing `KEYMAP` rows.
7. **Increments for the look and convenience:**
   - an LED-pixel mask (T19);
   - the wall-coverage outline on the thumbnail (T20);
   - EXR (T17);
   - 2K/4K/8K quality tiers (T18);
   - "Remember on this device" auto-relink through `HdriCache` (T8b);
   - a bundled sample (T21).
8. **Increment: a reflective car** (T10-T12, T12b). A glTF car (`GLTFLoader`; recommended CarConcept, CC BY 4.0, with the CC0 Kenney Car Kit as the fallback, Q3), checked against a measurable quality bar (AC 33), uses `MeshPhysicalMaterial` with a clear coat. Its reflections come from one of three sources:
   - the HDRI (the location);
   - a live capture of the LED stage (`CubeCamera`, T12b), which shows only what the wall emits;
   - a neutral studio.

   If the model fails to load, the procedural legacy car is used.
9. **Increment: bake for export** (T13). The projection is sampled per LED into per-section PNG textures (or an atlas, following spec 04's combined layout) and a 1-px-per-LED "pixel map" PNG. These are referenced from the MTL and glTF. The same baker feeds the background of spec 04's UV viewer (spec 04's `hdriBaker` contract). This increment needs spec 04's UVs.

**Users.** Previs and VP supervisors, DPs and gaffers (what does the car reflect?), and LED-volume sales engineers (show a client their content on a proposed volume).

**Non-goals.**
- Video or image-sequence playback.
- Ground-projected (finite-radius) HDRIs.
- Per-section content assignment.
- User-uploaded car models (see Q14).
- Physically based LED brightness in nits.
- WebGL 1. On r128's WebGL 1 fallback context, HDRI content is unavailable and shows a message. The rest of the app is unchanged.
- **Inner/outer frustum split.** In `Film camera` mode the **whole** wall follows the camera. Real ICVFX stages track only the inner frustum and show a fixed-point outer frustum, and that outer frustum is most of what lights the car and reflects in it. This feature therefore does not depict a real volume's lighting in camera mode. The UI says so next to the projection-point select (3.3, `#hdri-point-note`). A `Custom point` at the stage centre approximates the outer frustum for lighting and reflection studies. An "Inner frustum only" option is Q17 (recommended for v1.1).
- Moving to current three inside this feature. Spec 07's U3b ports it after Feature 5 ships (6.11).

---

## 2. Current state

### 2.1 Legacy behaviour (`index.html@cd3fd3f`)

| Area | Today | Lines | Bugs |
|---|---|---|---|
| Renderer | `new THREE.WebGLRenderer({canvas, antialias: true})`. There is no `outputEncoding` and no `toneMapping`, so r128's defaults apply: `LinearEncoding` and `NoToneMapping`. Colours are written to the framebuffer exactly as stored, so every hex value is effectively a display (sRGB) value. r128 requests a `webgl2` context first and falls back to `webgl`. | 1436-1438 | none |
| Lights | Ambient 0.3 and a point light 0.8 at (5, 5, 10). They light nothing, because every material is unlit. | 1440-1443 | none |
| Wall materials | Three material triads, all `MeshBasicMaterial` with `DoubleSide`. The precedence is panel IDs, then LED sim, then colour. | 1664-1675, 1759-1769, 1783-1793 | B-H1 (winding hidden by DoubleSide), B-H5 (maps never disposed) |
| Content toggles | `#toggle-led-sim` and `#toggle-panel-ids` are mutually exclusive switches. Each turns the other off and rebuilds. The markup is at 940-994 (the "Display" and "Panel IDs" sections). | 4167-4199 | B-L36 (toggles not keyboard accessible) |
| Uploads | JSON import goes through a hidden `#import-input` (1179, 4967-5010). Logo upload uses `FileReader.readAsDataURL` and has no `onerror`. There is no other file input and no drag-and-drop, so a file dropped anywhere makes the browser navigate to it. | 2256-2278 | B-L8, B-L35 |
| Car | `createCarMesh` builds 9 boxes and cylinders with `MeshBasicMaterial` (opacity 0.85), with the length along X, headlights at +X and the origin on the floor. The gizmo anchor height is hard-coded to 0.5. | 2905-2972, 3131 | B-L22 (inert handles) |
| Preview | A second `WebGLRenderer` on `#camera-preview-canvas`, fixed at 320×180. It renders the whole scene, including helpers and the frustum-fill tint, with the filmback aspect stretched. | 3634-3645, 3742-3745, 1185-1199 | B-M9, B-M11, B-L32 (fixed by spec 07 R1/R2) |
| Selection | String ids `'camera' \| 'person' \| 'car'`. Picking happens on mousedown, and only while a gizmo mode is active. | 3427-3474 | B-M14, B-M12, B-L28 (fixed by spec 07 I2/I3) |
| Shortcuts | G, R, L, P and Escape (4410-4434); WASD, QE and the arrows (3766-3817) | | B-L11 (fixed by spec 07 I1) |
| Viewport overlays | `.viewport-controls` is a flex **column** at `top: 20px; right: 20px` (five 40 px buttons with 8 px gaps: y ≈ 20-252 px). `.gizmo-controls` is a column at `top: 20px; left: 20px`; the company logo sits at `left: 70px`. `.pilot-info` is at top centre (z-index 100, about 575 px wide). `.viewport-info` (the info badge) and `.selection-indicator` are at bottom-left. | CSS 458-523, 660-710; markup 1206-1260 | B-L24 |
| Exports | No textures beyond panel IDs. glTF has POSITION only. Base64 is encoded with a spread. There is no canvas-size guard. JSON v1 saves only `sections` and `mesh_mode`. | 4491-4965 | B-M7, B-H3, B-L4, B-L31 |

**Why the single renderer is a hard prerequisite (F0-e).** Textures, `PMREMGenerator` render targets and compiled programs belong to one GL context. Under the legacy design, the 4K HDRI would have to be uploaded twice, and the preview could not share the projection material's texture objects. Spec 07 R1/R2 merge the two contexts. This feature starts after them; it neither re-specifies nor stubs them.

### 2.2 What Phase 1 and spec 07 provide

| Seam | Where | Used for |
|---|---|---|
| `DisplaySettings.content` enum `ContentMode {COLOR, LED_SIM, PANEL_IDS}` | `domain/Project.js` | adds `HDRI: 'hdri'` (07 4.1 reserves it); the only wall content enum (07 C49) |
| `LEDMaterialFactory`, the only wall-material constructor | `render/LEDMaterialFactory.js` | the HDRI branch |
| `ResourceTracker`, `disposeObject3D` | `render/ResourceTracker.js` | disposal of the HDR texture and render targets |
| `SceneManager` with `LAYERS = {DEFAULT: 0, HELPERS: 1, ENVIRONMENT: 2, DEBUG: 3}`, `addHelper(o, {layer})`, `withPassHidden`, `invalidate`, `onRestored` | `render/SceneManager.js` (07 R1-R3, 5.9.3) | the marker (HELPERS), the dome (ENVIRONMENT), render-on-demand, context restore |
| `PreviewPass` (preview and still camera mask `DEFAULT \| ENVIRONMENT`) | `render/PreviewPass.js` (07 R2) | preview parity with no extra code |
| `PropView` → `CarPropView.buildMesh()` | `render/PropViews.js` | the base of `GltfCarPropView` (T11) |
| `SelectionManager` v2, `Selectable` v2, `TransformGizmo` over `TransformControls`, `PointerRay` (`layers.enableAll()`) | `interaction/` (07 I2, I3) | the projection-point Selectable `'hdri-point'` |
| `KEYMAP` and `viewportInput.registerActions(map)` | `interaction/Keymap.js`, `interaction/ViewportInput.js` (07 I1) | the four F5 rows that 07 3.8 already declares |
| `CineCamera` pose (`posX/Y/Z`) | `domain/CineCamera.js` | the default projection point |
| `WALL_REBUILT {layout, meshMode, view}`, `SELECTABLE_MOVED {id}` | `core/EventBus.js` | invalidates the stage probe (T12b); the gizmo follows the marker |
| `ProjectSerializer` v2, `ProjectSchema`, `ProjectValidator`, `ProjectSession.apply`/`openFile` | `io/`, `app/ProjectSession.js` (07 D1-D6) | the `hdri` and `props.car.model` rows (4.2), the restore hook, ZIP entries |
| `core/sha256.js sha256Hex(bytes, {subtle})` | 07 D6 | the injected `digest` |
| `vendor/three-addons.js createAddons({doc})` | 07 I3 (5.7.4) | the lazy loader factories |
| `app/Prefs.js` | 07 H3 | the `hdri_remember` device preference (T8b) |

### 2.3 Sibling-spec facts this spec relies on

- **Spec 01.**
  - Spec 08 P2-2 (formerly spec 01 step A) flips the winding to `'ccw'`; spec 01 F1-4 adds the per-section LED side.
  - Spec 01 F1-5 (T10, formerly step C) flips `mesh.viewport.side` to `'front'` and adds a cabinet **back shell** (`materials.backShell()`, BackSide). The HDRI material uses `LEDMaterialFactory.#side()` and is never applied to the back shell.
  - The debug toolbar adds `#toggle-normals` and `#debug-view-btn` to the `.viewport-controls` column. Its popover is anchored at `right: 72px; top: <#debug-view-btn offsetTop>` (about 317 px).
  - Its legend `#debug-view-legend` sits in the top-centre stack `#viewport-top-stack` (07 C51; `max-width: calc(100% - 320px)`), which moves below the pilot banner by a sibling selector.
  - Its debug shading is an orthogonal override over every content mode, this spec's HDRI material included; `MaterialOverride` restores the HDRI material before any dispose (07 C49).
  - Its normal lines move to `LAYERS.DEBUG` with 07 R1.
  - Shortcuts claimed: `N`, `Shift+N`.
- **Spec 02.**
  - Section `postTransform`s (offsets) are applied to stage-frame layout points.
  - The `Selectable.kind` enum and the `SELECTION_CHANGED.kind` payload list `'projector'` for this spec's point, whose id is `'hdri-point'` (07 C36; this spec, the owner, picks the id; 02 and 03 were amended by 07's consolidated D0).
  - 02 registers its section provider after "spec 05's `'hdri-point'` registration if present" (02 5.8). The id matches 07 and this spec.
  - **Info-badge text:** not changed by this spec (07 C35): per-feature tokens are frozen, only spec 01's ` N=normals` exists, and 07 I4a rewrites the badge once. `H` is documented in 07's `KEYMAP`-generated `ShortcutHelp`, the button titles and `#hdri-help`.
  - Shortcuts claimed: `F`, `[`, `]`, `Ctrl/⌘+D`, `Ctrl/⌘+A`, `Delete`/`Backspace`.
- **Spec 03.**
  - The viewport, camera, props and **the HDRI projection point** live in the **stage frame**: the origin is the pivot projected to the floor, and wall vertices are baked into that frame.
  - `PivotController` re-expresses every member of its injected `stageAnchored` list by −ΔO through `translateStage(dx, dz)` when *Keep stage layout* is on. Its doc comment already names "+ Feature 5 projection point".
  - `pickPriority` (pivot = 10).
  - Rebuild-policy rows carry named ids (07 0.4): spec 03 `F3-1..5`, spec 02 `F2-1..13`, this spec `F5-1..3`.
  - Shortcut claimed: `O`.
- **Spec 04.**
  - It defines the `hdriBaker` provider that this spec supplies in T13: `{hasHdri(): boolean, bakeSection(sectionId, w, h, plan): HTMLCanvasElement|null}` (04 5.3, `UvViewModel` deps).
  - Its "Spec 05 contract" (04 6.3):
    - the bake size is `plan.sourceW × plan.sourceH`;
    - the baker undoes the atlas rect, then calls `invertUv(plan.transform, plan.W, plan.H, u, v, out)` and `PixelMap.wallPointFromBaseUv(sl, u_b, v_b)`, **which already applies `sl.postTransform`**;
    - the combined `per-section` layout bakes per-section textures, and only the `atlas` layout bakes an atlas (04 R3).
  - The UV viewer opens by default at `top: 20px; right: 72px`, 380×440 px, `z-index: 30`.
  - Shortcut claimed: `U`.
- **Spec 07 revision 2.**
  - Section 0 decisions C2, C9, C12, C13, C14, C17, C18, C19 and C20, and the 0.2 rows for spec 05. This revision applies all of them.
  - The `KEYMAP` already contains this feature's rows: `hdri.toggleContent` (`H`), `hdri.toggleBackdrop` (`Shift+H`), and `hdri.yawMinus`/`hdri.yawPlus` (`Comma`/`Period`, Shift for ±45°, `allowInPilot`, `allowRepeat`).
  - Its keymap test fails if a landed feature's row has no registered action.
  - The movement guard `isMovementBlockedTarget` already blocks movement keys from every `INPUT` type and from `role=radio`/`radiogroup`.
- **Spec 08.** Its B-L31 v2 proposal is superseded by spec 07 (08 line 463). 07 r2 adopted the top-level `hdri` key that 08 also proposed.
- **Spec 09.** Shortcut claimed: `M` (measure). Its snap targets are wall meshes only, so the dome (`raycast = noop`) never interferes.

### 2.4 Relationship to specs 07, 04, 03 and 09

Spec 07's sequence (07 1.4) gates Feature 5 on R1-R3, on I3 for the projection-point gizmo, and on D5 for persistence. This spec has **no fallback implementation** of any spec 07 foundation.

| # | Foundation | Needed by | If it has not landed |
|---|---|---|---|
| 1 | Single renderer, layers, `PreviewPass` (07 R1, R2) | every rendering task (T3-T7) | Feature 5 waits. 07's critical path to R3 is about 4.5 days (07 10). |
| 2 | Render-on-demand (07 R3; a **hard** gate for T4 onward, 07 C55) | T4 (ticks call `invalidate`; uniforms are read per frame) | Feature 5 waits (same chain as row 1). |
| 3 | Keymap (07 I1), selection v2 and `TransformControls` (07 I2, I3), `vendor/three-addons.js` (07 I3) | T6 (marker, shortcuts), T1 (loaders) | T2-T5 and T7 can be built and unit-tested. The MVP release waits for T6. There is no separate `keydown` listener (07 C17, rule S5). |
| 4 | v2 schema, `ProjectSession`, `core/sha256.js`, ZIP open (07 D1-D6) | T8 | The HDRI is session-only until T8, and the release note says so. |
| 5 | `HdriCache` (IndexedDB) | T8b (increment) | Owned by **this** spec (07 C20). Nothing else in the roadmap uses IndexedDB. |
| 6 | History (07 H1) | record rows (5.12) | No record calls until H1. |
| 7 | three upgrade (07 workstream F) | none | r128 is the plan of record. U3b ports this feature afterwards (6.11). |
| 8 | `Notifier` (07 E1) | error toasts | The HDRI panel status (`role="alert"`) is always an error surface. |
| 9 | Spec 04 UVs | T13 (bake increment) | T13 waits. |
| 10 | Spec 03 pivot | `stageAnchored` | `hdriController` is appended after `carController` when spec 03 has landed. |

---

## 3. UX design

Controls marked **(T<n>)** belong to an increment (10.2) and are absent from the MVP markup. Everything else is in the MVP.

### 3.1 Placement

- **Sidebar, "Display" section** (legacy 940). It becomes **Wall Content**: a four-way segmented control sits at the top, and the legacy `#led-sim-options` block stays below it.
  - The two legacy toggle rows (`#toggle-led-sim`, `#toggle-panel-ids`) stay **in their original sections**, with their ids, classes and handlers. Each row's wrapper gets the `hidden` attribute.
  - They are compatibility proxies for the harness contract. The `toggles` scenario clicks them through `el.click()`, which works on hidden elements. They are never shown (Q4).
  - Their `.active` class (and `aria-checked`) is kept in sync with the model on every content change (5.2, `WallDisplayPanel`).
- **Sidebar, "Panel IDs" section** (legacy 958-994). **Stays visible** in every content mode, because the panel-ID style also drives Export Panel IDs (PNG), the ZIP textures, spec 04's UV-viewer Panel IDs background, spec 06's brand-mark PNG option and spec 09 X16. It is **collapsed by default while `content !== 'panelIds'`** and shows the hint "Also used by Panel ID exports" under its title (07 0.4). The legacy toggle proxies stay hidden (below).
- **Sidebar, new "HDRI Projection" section**, inserted between "Panel IDs" and "Camera Frustum Preview" (legacy 995). It is always visible, so a file can be loaded before the content mode is switched.
- **Sidebar, "Scene Props" → car options (T11)** (legacy 1140-1161). Four rows are added under the existing X, Z, rotation and scale inputs.
- **Export section** (legacy 1164-1180).
  - MVP (T8): one toggle, `#hdri-include-in-zip`, enabled only while an HDRI is `ready`.
  - T13: one select and one button.
- **Viewport.**
  - The projection-point marker (`LAYERS.HELPERS`).
  - The optional HDRI dome (`LAYERS.ENVIRONMENT`, 5.1).
  - A status badge, `#hdri-viewport-badge`:
    - **Position:** `position: absolute; top: 20px; right: 72px` (a 20 px margin, the 40 px button column and a 12 px gap), to the **left** of the `.viewport-controls` column, as spec 01's popover is. It is a single line with an ellipsis and at most 28 px tall, so it ends above spec 01's popover (which starts at about 317 px).
    - **Stacking against the UV viewer:** `z-index: 20`. That is below spec 04's UV viewer (30), which opens by default over this spot (top 20, right 72, 380×440). The viewer covers the badge while the two overlap. This is acceptable, because every badge message is also shown in `#hdri-status`.
    - **Clear of the top-centre zone:** `max-width: min(260px, calc(50% - 380px))`. Its left edge therefore stays at or right of 50% + 308 px, while the pilot banner `.pilot-info` (about 575 px wide, centred) ends at about 50% + 288 px.
      - While `.viewport` is narrower than 1000 px, the cap would leave less than 120 px, so the badge is hidden. `HdriPanel` toggles `data-compact` from a `ResizeObserver` on `.viewport`, and the CSS rule is `#hdri-viewport-badge[data-compact] { display: none }`. No layout property of `.viewport` changes.
      - While the top-centre stack `#viewport-top-stack` (07 C51: the restore banner, the share banner and spec 01's legend) shows any child, the badge moves to `top: 72px`. This uses a general-sibling selector on the stack's `[data-occupied]` state, which the stack's child owners toggle, the technique spec 01 itself uses for the pilot banner. It needs the DOM order `#pilot-info`, `.brand-watermark`, `#viewport-top-stack`, `#hdri-viewport-badge`.
      - In the shared `right: 72px` slot the z-order is spec 01's debug popover 110 > spec 04's UV viewer 30 > this badge 20 (07 C51).
    - **Visibility:** `hidden` unless `content === 'hdri'` or the HDRI state is `loading` or `missing`, so it never renders in an existing harness scenario.
  - A drag-and-drop overlay, `#hdri-drop-overlay`, is `hidden` except while a file is dragged over `.viewport`.
- **Info badge: not changed** (07 C35). Per-feature tokens are frozen and 07 I4a rewrites the badge once; revision 3's RB-2b step is dropped. The shortcuts are listed in spec 07's `?` dialog (generated from `KEYMAP`), in the button titles and in `#hdri-help`.

### 3.2 Wireframes

Sidebar (HDRI content active, a 4K file ready, film-camera projection point; rows tagged with a task id are increments):

```
┌ WALL CONTENT ───────────────────────────────────────────┐
│ ┌────────┬────────────┬───────────┬────────┐            │
│ │ Colour │ LED pixels │ Panel IDs │▐ HDRI ▌│  (radios)  │  #wall-content-mode (HDRI disabled until ready/missing)
│ └────────┴────────────┴───────────┴────────┘            │
│ LED layout [ Single dot ▾ ]  (LED mode; also HDRI, T19) │  #led-sim-options
└─────────────────────────────────────────────────────────┘
┌ HDRI PROJECTION ────────────────────────────────────────┐
│ H toggles HDRI · Shift+H backdrop · , . turn the image  │  #hdri-help
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ⤓ Drop .hdr · .jpg · .png          [Choose file…]   │ │  #hdri-drop (T17 adds .exr)
│ │                                    [Try sample] T21 │ │
│ └─────────────────────────────────────────────────────┘ │
│ ▣ venice_sunset_4k.hdr                          [✕]     │  #hdri-file-info / #hdri-clear
│   4096×2048 • 24.1 MB • HDR • Ready                     │  #hdri-status (aria-live)
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ░░▒▒▓▓ panorama thumbnail 2:1 ▓▓▒▒░░                │ │  #hdri-thumb (256×128 canvas)
│ │        ┌──────┐   ← wall coverage outline (T20)      │ │
│ │        └──────┘    │ image-centre line               │ │
│ └─────────────────────────────────────────────────────┘ │
│ Projection point   [ Film camera            ▾]          │  #hdri-point-mode
│ ⓘ Whole wall follows the camera (no outer frustum)      │  #hdri-point-note
│   X [  2.50 ]  Y [  0.75 ]  Z [  5.00 ]  m              │  #hdri-point-x/y/z (read-only here)
│ Yaw      ◀━━━━━━━━━●━━━━━━━━━▶  [   0.0 ] °             │  #hdri-yaw / #hdri-yaw-num
│ Pitch    ◀━━━━━━━━━●━━━━━━━━━▶  [   0.0 ] °             │
│ Roll     ◀━━━━━━━━━●━━━━━━━━━▶  [   0.0 ] °             │
│ Exposure ◀━━━━━━━━━●━━━━━━━━━▶  [   0.0 ] EV  [Auto]    │  #hdri-exposure / #hdri-auto-ev
│ Tone map           [ Auto (ACES filmic)     ▾]          │  #hdri-tonemap
│ LED pixel mask ◀●━━━━━━━━━━━━▶  [    0 ] %       T19    │  #hdri-led-mask
│ Show HDRI backdrop                              (○━━)   │  #hdri-backdrop (switch)
│ Quality            [ 4K (4096×2048)         ▾]   T18    │  #hdri-quality
│ Remember on this device                  (━━●)   T8b    │  #hdri-remember
│ [ Reset orientation ]   [ Forget cached HDRIs ] T8b     │
└─────────────────────────────────────────────────────────┘
```

Car options (T11, inside `#car-options`, after the scale row):

```
│ Model        [ Sports car (reflective) ▾]  #car-model        (Simple boxes | Sports car (reflective))
│ Paint        [■ #b01c1c                 ]  #car-paint        (disabled if the asset has no paint material)
│ Finish       [ Gloss ▾]                    #car-finish       (Gloss | Satin | Chrome)
│ Reflections  [ Auto (LED stage) ▾]         #car-env-source   (Auto | HDRI (location) | LED stage (T12b) | Studio)
│ ⓘ Loading model… / "CarConcept" by Eric Chadwick, CC BY 4.0  #car-model-status
```

Viewport (front view, HDRI on, custom point selected, backdrop on). Both toolbars are vertical columns; spec 01's two extra buttons are shown:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ [G] [logo]          (top centre: pilot-info / legend)     ┌────────────────┐ [▢]│
│ [R]                                     #hdri-viewport-badge│HDRI venice • −0.5 EV│ [┼]│
│ [W]                                                       └────────────────┘ [◎]│
│ [P]                                                                          [↺]│
│                                                                              [▦]│
│     ~~~~~~ backdrop dome (ENVIRONMENT layer) ~~~~~~                          ───│
│     ┌──────────────── LED wall shows projection ───────────────┐             [⟂]│
│     │            (seamless with the dome only from P)          │             [◐]│
│     └──────────────────────────────────────────────────────────┘                │
│                         ◆─→  projection marker (HELPERS; arrow = image          │
│                              centre direction; gizmo when selected)            │
│ Selected: HDRI Point                                       ┌ preview ─────────┐ │
│ [Drag to rotate • … ? all shortcuts]  (info badge)         │  same frame      │ │
└────────────────────────────────────────────────────────────┴──────────────────┴─┘
```

### 3.3 Controls

Abbreviations: "live" means applied on the `input` event as a uniform update with no rebuild. "Commit" means applied on `change`, with the value parsed, clamped and written back.

| Id | Element | Label / text | Range, step | Default | Units | Behaviour |
|---|---|---|---|---|---|---|
| `#wall-content-mode` | `fieldset` (visually hidden `legend` "Wall content") with 4 native `input[type=radio][name=wall-content][data-content]` styled as segments (the spec 07 X1 visually-hidden-radio pattern) | Colour / LED pixels / Panel IDs / HDRI | `color \| ledSim \| panelIds \| hdri` | `color` | - | `change` → `wallController.setContentMode(value)`.<br>The `hdri` radio is `disabled` (title "Load an HDRI first") unless the HDRI state is `ready` or `missing`. `WallContentPanel` mirrors that from `HDRI_CHANGED`. This keeps the content invariant of 4.2.<br>Native arrow keys move between the enabled radios. Spec 07's movement guard (`isMovementBlockedTarget` blocks every `INPUT` type and `role=radio`) keeps them from moving the orbit camera, so no extra key handling exists.<br>`checked` mirrors the model on every `DISPLAY_CONTENT_CHANGED` and `PROJECT_REPLACED`. |
| `#hdri-help` | `p` | "H toggles HDRI · Shift+H backdrop · , . turn the image (Shift: 45°)" | - | - | - | Static text |
| `#hdri-input` | `input[type=file]`, hidden | - | accept `.hdr,.jpg,.jpeg,.png` (T17 adds `.exr`) | - | - | `change` → `hdriController.loadFile(files[0])`; then `value = ''` (the legacy import idiom, 5009) |
| `#hdri-choose` | button | Choose file… | - | - | - | `#hdri-input.click()` |
| `#hdri-drop` | `div` drop zone | "Drop .hdr · .jpg · .png" | - | - | - | `dragover`: `preventDefault`, add `.drag-over`. `drop`: `preventDefault`; the first file → `loadFile`. |
| `#hdri-clear` | button (✕) | title "Remove HDRI" | - | - | - | `hdriController.clear()`. If the content was HDRI, it returns to the previous mode (4.2 invariant). |
| `#hdri-relink` | button, shown only in the `missing` state | Relink… | - | - | - | Opens `#hdri-input` with relink semantics (3.6) |
| `#hdri-thumb` | `canvas` 256×128 | - | - | - | - | The tone-mapped panorama (EV 0) and the image-centre line. T20 adds the wall-coverage outline in the theme accent. Repainted from the `HDRI_CHANGED` and `HDRI_PROJECTION_CHANGED` payloads, **coalesced to one repaint per animation frame** (the panel schedules one `requestAnimationFrame` for its own canvas). |
| `#hdri-point-mode` | select | Projection point | `camera` "Film camera", `custom` "Custom point" | `camera` | - | Commit. **Every** switch from `camera` to `custom` copies the current camera position into the custom point, so nothing jumps. Switching back to `camera` keeps the stored point. |
| `#hdri-point-note` | `p.hint`, shown in `camera` mode | "Whole wall follows the camera. Real volumes keep the outer frustum fixed; use a Custom point for lighting studies." | - | - | - | Static |
| `#hdri-point-x/y/z` | `input[type=number]` | X / Y / Z | x, z ∈ [−100000, 100000] (the stage-position bound of 07 C22, C45); y ∈ [0, 100]; step 0.05 | (0, 1.5, 5) | m (stage frame) | Commit (custom mode). In `camera` mode they are disabled and mirror the resolved point from `HDRI_PROJECTION_CHANGED` (`toFixed(2)`). Follow emissions are throttled to 10 Hz (5.3), so they update **within 100 ms** of any camera move (inputs, gizmo, pilot look and fly, reset, `translateStage`). The projection itself updates on the next frame. |
| `#hdri-yaw` + `#hdri-yaw-num` | range + number | Yaw | range `min −179.5, max 180, step 0.5`; number step 0.1; the model wraps to (−180, 180] | 0 | ° | Range: live. Number: commit with wrap. The range never reaches −180, so a wrapped value never jumps the knob to the other end. The mirror never writes into the element that has focus. |
| `#hdri-pitch` + `-num` | range + number | Pitch | [−90, 90]; step 0.5 / 0.1; clamps | 0 | ° | As yaw |
| `#hdri-roll` + `-num` | range + number | Roll | as yaw (range min −179.5); wraps | 0 | ° | As yaw |
| `#hdri-exposure` + `-num` | range + number | Exposure | [−10, +10]; step 0.1 | 0 | EV (multiplier 2^EV) | As yaw. The number field shows `toFixed(1)` **without** a plus sign (`input[type=number]` rejects a leading "+"). The badge shows the signed value (`+0.5 EV`). |
| `#hdri-auto-ev` | button | Auto | - | - | - | `hdriController.autoExposure()`: EV = `clamp(round1(log2(0.18 / Lavg)), −10, 10)` from the image's log-average luminance (6.9). It is a one-shot action, recorded in history like a typed value, and is disabled unless the state is `ready`. Title: "Set exposure from the image's average brightness". |
| `#hdri-tonemap` | select | Tone map | `auto` "Auto", `aces` "ACES filmic", `clip` "None (clip)" | `auto` | - | Commit. `auto` means ACES for `.hdr`/`.exr` and clip for `.jpg`/`.png`. The `auto` option's label shows the resolved value: "Auto (ACES filmic)" or "Auto (clip)". |
| `#hdri-backdrop` | `button.toggle[role=switch][aria-checked]` | Show HDRI backdrop | on/off | off | - | `hdriController.toggleBackdrop()` |
| `#hdri-reset-orientation` | button | Reset orientation | - | - | - | yaw = pitch = roll = 0, EV 0 |
| `#hdri-include-in-zip` | `button.toggle[role=switch]` (Export section) | Include HDRI file in ZIP | - | on if `bytes <= 50 MB`, else off | - | Session UI state (Q11). Enabled while an HDRI is `ready`. |
| `#hdri-led-mask` + `-num` **(T19)** | range + number | LED pixel mask | [0, 100]; step 5 / 1 | 0 | % | Live. Uses the current `#led-layout` tile pattern. With T19, `WallDisplayPanel` shows `#led-sim-options` in HDRI mode too (rule: `content === 'ledSim' \|\| content === 'hdri'`). Its label gains the hint "(also the HDRI pixel mask)". `#led-layout` keeps calling `wallController.setLedLayout`, which rebuilds only in LED-sim mode, as legacy. `HdriProjectionView.tick` sees the layout change and refreshes the mask tile. |
| `#hdri-quality` **(T18)** | select | Quality | `2k` "2K (2048×1024)", `4k`, `8k` | `4k`; `2k` on low-memory devices (6.9) | - | Commit. Re-decodes the session blob. `8k` is disabled when `maxTextureSize < 8192` or `lowMemory`, and asks for confirmation ("Uses about 300 MB of graphics memory"). `4k` is disabled when `maxTextureSize < 4096`. |
| `#hdri-remember` **(T8b)** | `button.toggle[role=switch]` | Remember on this device | on/off | on | - | `hdriController.setRemember(on)`. This is a device preference, stored by `app/Prefs.js` under the `hdri_remember` key of `morph-led-configurator:prefs` (07 4.8, C19); it is not part of the project. Hidden when `HdriCache.available` is false (no IndexedDB, for example in private mode). |
| `#hdri-forget` **(T8b)** | button | Forget cached HDRIs | - | - | - | `hdriController.forgetCached()` (it calls `HdriCache.clear()`), after a confirm `Dialog` |
| `#hdri-sample` **(T21)** | button | Try sample | - | - | - | `hdriController.loadBundled('sample')`. Hidden if no sample is bundled (Q7). |
| `#car-model` **(T11)** | select | Model | `procedural` "Simple boxes", `gltf` "Sports car (reflective)" | `procedural` until Q2 is decided | - | `carModelController.setModelKind` |
| `#car-paint` **(T11)** | `input[type=color]` | Paint | - | `#b01c1c` | sRGB hex | Live (`input`). The material colour is converted to linear. |
| `#car-finish` **(T11)** | select | Finish | `gloss`, `satin`, `chrome` | `gloss` | - | Commit |
| `#car-env-source` **(T12)** | select | Reflections | `auto`, `hdri` "HDRI (location)", `stage` "LED stage (live)" (T12b), `studio` "Studio" | `auto` | - | Commit. `hdri` is disabled until an HDRI is ready. `hdri` and `stage` are disabled without float render targets (3.6). |
| `#export-texture-content` **(T13)** | select (Export section) | Texture content | `panelIds` "Panel IDs", `hdri` "HDRI bake" | `panelIds` | - | Session UI state, not persisted (Q11). Enabled when an HDRI is ready and spec 04 UVs have landed. In panel mode it is also disabled while spec 04's `uv.panel_uvs` is `panel` (7.2). |
| `#hdri-export-pixelmap` **(T13)** | button (Export section) | Export HDRI pixel map | - | - | - | `projectIO.exportHdriPixelMap()` (7.4) |

Every new toggle is a `button` with `role="switch"` and `aria-checked`, so it is keyboard accessible from day one (the B-L36 lesson). Every numeric rule parses with `parseFloat` and tests `Number.isFinite`, never `||` (the B-L9 lesson; 4.1). Names that come from files are rendered with `textContent` only (the B-M4 lesson).

### 3.4 Viewport interactions

| Action | Result |
|---|---|
| Drag a file over the viewport | `.viewport` owns the `dragenter`/`dragleave`/`dragover`/`drop` listeners (bound by `HdriPanel`). A counter goes up on `dragenter` and down on `dragleave`. While it is above 0 and the drag carries files (`dataTransfer.types` includes `'Files'`), the full-viewport overlay `#hdri-drop-overlay` reads "Drop HDRI to project it on the wall" (`pointer-events: none`). `drop` and `dragend` reset the counter. A drop loads the file and, if it reaches `ready`, switches the content to HDRI. |
| Drop a file anywhere else (sidebar, header) | `HdriPanel` binds `document`-level `dragover` and `drop` handlers. For file drags outside the two zones they call `preventDefault()`, and `dragover` sets `dropEffect = 'none'`. The browser never navigates away, so unsaved work is kept. The dropped file is ignored, and `#hdri-status` shows the info line "Drop HDRI files on the viewport or the HDRI panel." |
| Click the marker (custom mode) | Spec 07's click-select (pointer-up, travel < 4 px) selects `'hdri-point'`. The badge reads `Selected: HDRI Point`. G/R and the toolbar gizmo modes work through `TransformControls`. |
| Translate gizmo on the marker | `applyTransform(t, 'drag', ctx)` moves the custom point to `start + (t.position − ctx.start.position)`, with Y clamped to ≥ 0 and `ctx.snap` applied relative to the start. Live, with no rebuild. The panel X/Y/Z inputs mirror the value. |
| Rotate gizmo on the marker | `applyTransform` converts the absolute `t.quaternion` to YXZ Euler yaw/pitch/roll in degrees (wrap and clamp per 4.1). `'cancel'` (Escape) restores the start snapshot. |
| Marker in `camera` mode | Drawn at the camera nodal point, but **not pickable**, because it coincides with the camera body's pick target. `#hdri-point-note` explains how to switch to a custom point. |
| The point becomes unpickable while selected | `clear()`, the `missing` state, a content change away from `hdri`, or a switch to `camera` mode. The Selectable's `isSelectable()` (`content === 'hdri'` && state ready && `pointMode === 'custom'`) turns false, and `HdriController` calls `selection.revalidate()` on each of those transitions (a direct call, never a bus subscriber). 07's `revalidate()` drops every id whose `isSelectable()`/`isPickable()` is false, so no special-cased deselect is needed (07 C36). |
| Pilot mode | No change. The main camera shows the camera's view, so with the point on the camera the wall image is parallax-correct. The dome stays visible (`ENVIRONMENT` is in 07's pilot mask `0b1101`). The marker is hidden with the other helpers (07 Q7). |

### 3.5 Keyboard shortcuts

**No new rows and no listener.** Spec 07 3.8 already declares this feature's four `KEYMAP` rows. T6 registers their actions, which 07's keymap test requires once the feature lands:

| Chord | Action id (07 3.8) | Flags (07 3.8) | Action registered by T6 |
|---|---|---|---|
| key `'h'` (`shift: false`; letters match by `e.key`, 07 C43) | `hdri.toggleContent` | `allowInPilot` | Toggles the wall content between HDRI and the previous mode. With the HDRI radio disabled (no HDRI `ready` or `missing`), it scrolls the HDRI section into view and flashes the drop zone instead. |
| key `'h'` with `shift: true` | `hdri.toggleBackdrop` | `allowInPilot` | Toggles the HDRI backdrop |
| `Comma` (`shift: 'any'`) | `hdri.yawMinus` | `allowInPilot`, `allowRepeat` | `(e) => hdriController.nudgeYaw(e.shiftKey ? -45 : -5)` |
| `Period` (`shift: 'any'`) | `hdri.yawPlus` | `allowInPilot`, `allowRepeat` | `(e) => hdriController.nudgeYaw(e.shiftKey ? 45 : 5)` |

```js
// App.js, after hdriController exists (07 5.4.4: actions are looked up at dispatch time, so the order does not matter)
viewportInput.registerActions({
  'hdri.toggleContent':  () => hdriController.toggleContent(),
  'hdri.toggleBackdrop': () => hdriController.toggleBackdrop(),
  'hdri.yawMinus':       (e) => hdriController.nudgeYaw(e.shiftKey ? -45 : -5),
  'hdri.yawPlus':        (e) => hdriController.nudgeYaw(e.shiftKey ? 45 : 5),
});
```

Two details of 07's row shape that these actions rely on (both already in 07 3.8):
- The `H` and `Shift+H` rows must not both match `Shift+H`, so an undeclared `shift` means "Shift up".
- The `Comma`/`Period` rows cover both Shift states ("Shift: ±45°" in 07 3.8). That is written `shift: 'any'`.

The dispatcher passes the `KeyboardEvent` to the action (`actions[id](e)`).

Spec 07's typing guard applies (`core/typingTarget.js`: INPUT except checkbox, radio, button, submit, reset, color, file and range; SELECT; TEXTAREA; contentEditable; and anything inside an open dialog). Its modifier rule applies too: no Ctrl/⌘/Alt unless the chord declares it. So `,` and `.` work while a range slider has focus, and do nothing in a number field.

**Conflict check** (every chord claimed anywhere; 07's `keymap.test.mjs` uniqueness test and static rule S6 enforce it):

| Source | Chords |
|---|---|
| Legacy | `G`, `R`, `L`, `P`, `Escape`, `W A S D`, `Q`/`E`, arrows |
| Spec 01 | `N`, `Shift+N` |
| Spec 02 | `F`, `[`, `]`, `Ctrl/⌘+D`, `Ctrl/⌘+A`, `Delete`/`Backspace` |
| Spec 03 | `O` |
| Spec 04 | `U` (global); the `uv-viewer` scope's `H` and `V` stop propagation inside the viewer (07 3.8), so they never reach this feature's `H` |
| Spec 07 | `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`, `Ctrl+Y`, `Ctrl/⌘+S`, `Ctrl/⌘+O`, `F`, `?` (`Shift+Slash`) |
| Spec 09 | `M` |
| **This spec** (rows owned by 07 3.8, F5) | `H`, `Shift+H`, `Comma`, `Period` (Shift for ±45°). They are free in every row above. None has a browser binding without Ctrl/⌘/Alt. 07's KEYMAP rule (C43): `H` matches by key, so it follows the printed letter on AZERTY and Dvorak; `Comma` and `Period` match by code. |

### 3.6 Feedback, empty and error states

`#hdri-status` has a `data-state` of `empty | loading | ready | missing | error`, mirrored from `HDRI_CHANGED`. It also carries `data-caps`, a JSON string of the device caps (`isWebGL2`, `maxTextureSize`, `floatTargets`, `lowMemory`), for diagnostics and the harness.
- The previous HDRI stays active until a new one is fully ready.
- If a second load starts while one is running, only the newest load's progress is shown, and the older load's result is discarded (5.3, load token).

| State | Panel | Wall (content = HDRI) | HDRI radio | Badge |
|---|---|---|---|---|
| `empty` | Drop zone, "No HDRI loaded", projection controls disabled | n/a: content cannot be HDRI (4.2 invariant) | disabled | hidden |
| `loading` | Phase text and a progress bar: "Reading file… 42%" → "Checking…" → "Decoding…" → "Preparing textures…" | Previous content | as before the load | "HDRI: loading…" (shown even when content ≠ HDRI) |
| `ready` | File info, thumbnail, controls enabled | Projection | enabled | `HDRI <name> • <signed EV> EV` |
| `missing` | "Missing HDRI: `<name>` (`<size>`). Choose the file to relink." plus `#hdri-relink` | Section colours (the Colour material) | enabled | "HDRI missing: relink in the HDRI panel" (warning colour; shown even when content ≠ HDRI) |
| `error` | The message (below) in `role="alert"`. The previous HDRI, if any, stays active. With spec 07 E1, also an error toast. | Unchanged | unchanged | unchanged |

Exact messages (`<x>` is a placeholder):

| Condition | Message | Blocking |
|---|---|---|
| No WebGL 2 context (`renderer.capabilities.isWebGL2` is false) | `HDRI projection needs WebGL 2. Try a current Chrome, Edge, Firefox or Safari.` (the drop zone and the inputs are disabled) | yes |
| Extension or magic bytes not recognised (including a Radiance file without the `#?` initial token) | `Unsupported file type. Use .hdr (Radiance), .jpg or .png.` (T17: `Use .hdr (Radiance), .exr (OpenEXR), .jpg or .png.`) | yes |
| OpenEXR magic before T17 | `OpenEXR files are not supported in this version. Convert to .hdr (Radiance).` | yes |
| Too large (file size) | `File is too large (<n> MB). The limit for <FORMAT> is <limit> MB.` | yes |
| Large (above 32 MB) | `Large file (<n> MB): loading may take a few seconds.` | no (info) |
| Header unreadable (PNG IHDR not found; JPEG SOF found neither by the segment walk nor by the measuring decode, 6.9) | `Could not read the image size from the file header.` | yes |
| Dimensions above the device cap (read before decoding) | `Image is <w>×<h>; the maximum on this device is <maxW>×<maxH>. Downscale it first.` | yes |
| Aspect | `Aspect ratio is <r>:1, not 2:1. This does not look like an equirectangular panorama; the projection will be distorted.` | no (warning) |
| Radiance header without `FORMAT=` | `Could not decode the HDR file (missing format specifier).` | yes |
| Unsupported Radiance orientation | `Unsupported Radiance orientation "<line>"; only "-Y <h> +X <w>" is supported.` | yes |
| Radiance header without a size line | `Could not decode the HDR file (missing image size specifier).` | yes |
| Corrupt or truncated HDR body: r128 `RGBELoader.parse` returned `null` (RLE data), or returned fewer than `4·w·h` bytes (flat data, which r128 returns unchecked) | `Could not decode the HDR file (corrupt or truncated data).` The loader's own `console.error` is captured, not printed (5.3). | yes |
| Any other HDR decode exception | `Could not decode the HDR file (<reason>).` | yes |
| EXR features, read from the header before decoding (T17) | `EXR <feature> is not supported. Re-save as a single-part scanline EXR with ZIP, PIZ or no compression.` where `<feature>` is `compression B44`, `compression B44A`, `tiled images`, `multi-part files` or `deep data` | yes |
| EXR decode (T17) | `Could not decode the EXR file (<reason>).` (`<reason>` is `String(e?.message ?? e)`: r128 `EXRLoader` throws plain strings) | yes |
| Loader script (network or SRI) | `Could not load the <HDR\|EXR> decoder (network). Try again.` | yes |
| LDR decode (every `createImageBitmap` fallback failed, 6.9) | `Could not read the image (<reason>).` | yes |
| Out of GPU memory, or `gl.getError()` after the upload | `Not enough graphics memory for this image.` (T18: `… for this quality. Try 2K.`, then an automatic fall back to `2k` once) | yes |
| Checksum mismatch on relink | `The chosen file differs from the saved one (checksum mismatch). Using it anyway.` | no |
| File dropped outside the drop zones | `Drop HDRI files on the viewport or the HDRI panel.` | no (info) |
| No float render targets (T12: no `EXT_color_buffer_float`) | `Reflections from the HDRI or the LED stage need float render targets; using the studio environment.` | no |
| Car model load failure (T11) | `Car model failed to load (<reason>); using the simple car.` | no |

---

## 4. Data model

### 4.1 Domain (pure: no THREE, no DOM)

**`js/domain/HdriSettings.js` (new)**

```js
export const HdriPointMode = Object.freeze({ CAMERA: 'camera', CUSTOM: 'custom' });
export const HdriToneMap   = Object.freeze({ AUTO: 'auto', ACES: 'aces', CLIP: 'clip' });
export const HdriQuality   = Object.freeze({ Q2K: '2k', Q4K: '4k', Q8K: '8k' });
export const HdriFormat    = Object.freeze({ HDR: 'hdr', EXR: 'exr', JPG: 'jpg', PNG: 'png' });

const MiB = 2 ** 20;
export const HDRI_LIMITS = Object.freeze({
  maxFileBytes: Object.freeze({ hdr: 100 * MiB, exr: 100 * MiB, jpg: 50 * MiB, png: 50 * MiB }),
  warnFileBytes: 32 * MiB,
  // HDR/EXR pixels are decoded in the JS heap (RGBE 4 B/px, EXR 8 B/px), so their caps are lower than LDR's.
  maxSourceHdr:          Object.freeze({ width: 8192,  height: 4096 }),
  maxSourceHdrLowMemory: Object.freeze({ width: 4096,  height: 2048 }),
  // LDR is decoded by the browser outside the JS heap, and only a working-size canvas is ever allocated (6.9).
  maxSourceLdr:          Object.freeze({ width: 16384, height: 8192 }),   // common 360-camera JPEGs are about 11K wide
  maxSourceLdrLowMemory: Object.freeze({ width: 8192,  height: 4096 }),
  headBytes: 262144,                       // header probe: the first 256 KB
  jpegWalkMaxSegments: 512,                // segment walk past the probe (6.9 step 3)
  aspectTolerance: 0.02,                   // |w/h - 2| <= 0.02: no warning
  workingWidth: 4096,                      // MVP: one working size ...
  workingWidthSmallGpu: 2048,              // ... or 2K when maxTextureSize < 4096
  qualityWidth: Object.freeze({ '2k': 2048, '4k': 4096, '8k': 8192 }),   // T18
  zipIncludeDefaultMaxBytes: 50 * MiB,
  sourceNameMax: 128,
});

/** Parse helper shared by every numeric rule: numbers pass through, strings go through parseFloat ('' -> NaN). */
const num = (raw) => (typeof raw === 'number' ? raw : parseFloat(raw));

/** @typedef {{name: string, bytes: number, sha256: string, path: string|null}} HdriSourceDescriptor
 *  The persisted reference (07 C9): never pixels. sha256 is 64 lowercase hex characters. */
export class HdriSettings {
  source = null;                               // HdriSourceDescriptor | null
  pointMode = 'camera';
  point = { x: 0, y: 1.5, z: 5 };              // metres, stage frame (spec 03); used when pointMode === 'custom'
  rotation = { yaw: 0, pitch: 0, roll: 0 };    // degrees, Euler 'YXZ' (pitch = X, yaw = Y, roll = Z)
  exposureEV = 0;
  toneMap = 'auto';
  ledMask = 0;                                 // 0..1 (UI from T19)
  backdrop = false;                            // view-only (4.2)
  quality = '4k';                              // view-only (4.2); honoured from T18 on, stored and round-tripped before that

  /** Numeric rules (B-L9-correct; '' and NaN give the default):
   *  yaw, roll:  raw => { const v = num(raw); return wrapDeg(Number.isFinite(v) ? v : 0) }
   *              wrapDeg maps to (-180, 180]: w = ((v % 360) + 540) % 360 - 180; return w === -180 ? 180 : w
   *  pitch:      raw => { const v = num(raw); return clamp(Number.isFinite(v) ? v : 0, -90, 90) }
   *  exposureEV: raw => { const v = num(raw); return clamp(Number.isFinite(v) ? v : 0, -10, 10) }
   *  ledMask:    raw => { const v = num(raw); return clamp(Number.isFinite(v) ? v : 0, 0, 1) }   (the UI passes percent / 100)
   *  pointX, pointZ: raw => { const v = num(raw); return clamp(Number.isFinite(v) ? v : 0, -100000, 100000) }
   *              (07 C22/C45: the same ±100,000 m bound as every stage position, so re-expression never clamps in practice)
   *  pointY:     raw => { const v = num(raw); return clamp(Number.isFinite(v) ? v : 1.5, 0, 100) }
   *  Enum rules: pointMode, toneMap, quality: unknown -> the default. backdrop: raw === true || raw === 'true'.
   *  These are the SAME functions the validator calls (07 4.3: the UI, the gizmo and the validator never disagree). */
  static FIELD_RULES
  /** Parses raw with FIELD_RULES[key]. Stores and returns the value. */
  setField(key, raw)
  /** descriptor | null. The caller (HdriController) builds the descriptor from a validated load: name sanitised with
   *  07's sanitizeString and truncated to HDRI_LIMITS.sourceNameMax, bytes = File.size, sha256 = digest output. */
  setSource(descriptor)
  /** Writes the resolved point into `out` ({x, y, z}; no allocation).
   *  pointMode === 'camera' ? (cine.posX, cine.posY, cine.posZ) : point */
  projectionPoint(cine, out)
  /** toneMap !== 'auto' ? toneMap : (format === 'hdr' || format === 'exr' ? 'aces' : 'clip'). format comes from the runtime source. */
  effectiveToneMap(format)
  /** camera -> custom (EVERY time): point = {x: cine.posX, y: cine.posY, z: cine.posZ}, each through its rule
   *  (x/z share the camera's ±100,000 m bound; y is clamped to [0, 100]). custom -> camera: point is kept.
   *  @returns true when the mode changed. */
  setPointMode(mode, cine)
  setPoint({ x, y, z })                        // each through its rule (gizmo, inputs)
  setRotation({ yaw, pitch, roll })            // each through its rule (gizmo)
  /** 'y' -> yaw, 'x' -> pitch, 'z' -> roll; wrap or clamp as above (keyboard nudges) */
  rotateBy(axis, deltaDeg)
  resetOrientation()                           // yaw = pitch = roll = 0; exposureEV = 0
  /** Spec 03 re-expression (Keep stage layout): point.x += dx; point.z += dz, through the clamp rules (its LIMITS, 07 C45),
   *  in BOTH point modes, so the stored point stays fixed relative to the wall even while it is unused. */
  translateStage(dx, dz)
  /** 07 hydration in place (never replaced: App injects this object by reference). The input is validated data, already
   *  mapped from v2 snake_case by HdriController.restore (5.3). */
  assign({ source, quality, backdrop, pointMode, point, rotation, exposureEV, toneMap, ledMask })
}
```

**`js/domain/Project.js` (changed)**

```js
export const ContentMode = Object.freeze({ COLOR: 'color', LED_SIM: 'ledSim', PANEL_IDS: 'panelIds', HDRI: 'hdri' });
class DisplaySettings {
  // unchanged members; the legacy setLedSim/setPanelIds keep their exact return semantics (4172-4176, 4192-4196)
  get hdriEnabled()                 // content === 'hdri'
  /** previous = content; content = mode; return previous.  Mode must be a ContentMode value. */
  setContent(mode)
}
class Project { hdri; /* new HdriSettings() in createDefault(); serialized as the top-level `hdri` (07 4.2) */ }
```

**`js/domain/Prop.js` (changed in T11, the car increment)**

```js
export const CarModelKind = Object.freeze({ PROCEDURAL: 'procedural', GLTF: 'gltf' });
export const CarFinish    = Object.freeze({ GLOSS: 'gloss', SATIN: 'satin', CHROME: 'chrome' });
export const CarEnvSource = Object.freeze({ AUTO: 'auto', HDRI: 'hdri', STAGE: 'stage', STUDIO: 'studio' });
/** The id of 07's skeleton (`props.car.model.asset_id`). T10's manifest must contain an entry with this id, or T10
 *  changes this constant and 07's skeleton together (a docs amendment in the same commit). */
export const DEFAULT_CAR_MODEL_ID = 'kenney-sedan-sports';
export class CarModelSettings {
  kind = 'procedural';              // Q2: flip to 'gltf' in its own re-baselined commit (RB-5)
  modelId = DEFAULT_CAR_MODEL_ID;   // a bundled-manifest id (6.10), serialized as asset_id; NOT an assets[] id (07 C9)
  paint = '#b01c1c';                // sRGB hex /^#[0-9a-f]{6}$/ (lowercased)
  finish = 'gloss';
  envSource = 'auto';
  /** 'auto': display.content === 'hdri' -> 'stage' (T12b; 'hdri' before it ships); else hdriReady -> 'hdri'; else 'studio' */
  resolveEnvSource({ content, hdriReady, stageAvailable })
  assign({ kind, modelId, paint, finish, envSource })   // 07 hydration in place
}
// CarProp gains: model = new CarModelSettings()
```

**Runtime-only state (never persisted).**
- The **session blob map** in `HdriController`: `sha256 → File | Blob`. It is filled by every successful load, by bundled fetches and by ZIP entries once they are hashed. It is never evicted during a session, because undo and the T18 quality re-decode need the bytes (5.12).
- The source info `{name, format, bytes, sha256, width, height, origin: 'file'|'zip'|'bundled'|'cache'}`, from the header and the descriptor.
- GPU textures and the retained CPU image (`EnvImage`, 5.3).
- The `loading`/`ready`/`missing`/`error` state and the load token.
- The previous non-HDRI content mode (for `H` and `clear()`).
- The export UI choices (Q11).

### 4.2 Project JSON v2: rows this spec adds (spec 07 extension protocol, 07 4.4)

Spec 07 4.2 reserves the top-level key **`hdri`** and **`props.car.model`** for this feature (07 4.4 rule 1, C9). Keys are snake_case with unit suffixes (07 schema-wide rules). Positions are in the **stage frame** of the file's own pivot (spec 03, 07 C7). Each row ships as an entry in `io/ProjectSchema.js`, with these four things (07 4.4 rule 3):
- "absent means default" behaviour;
- a round-trip unit test;
- a case in the reachability property test;
- its rule functions, which are the `HdriSettings.FIELD_RULES` and `CarModelSettings` rules that the UI uses.

**Rows added by T8 (MVP).** The keys are absent until T8 (07 C39). They are the MVP release's **one** revision bump, whose number is assigned at merge time and recorded in `ProjectSchema.REVISIONS`; `KNOWN_REVISION` is set (07 4.4 rule 4, C40).

| Path | Type | Default | Validator (07 6.7 codes) | View-only | Writers can produce (07 reachability rule) | Owner |
|---|---|---|---|---|---|---|
| `hdri` | object | every leaf at its default | not a plain object → defaults + `defaulted` | no | always written (4.2 writer rules) | F5 |
| `hdri.source` | `null \| object` | `null` | object → the four leaves below. If any leaf is invalid, the whole source becomes `null` + `defaulted`, and `display.content` falls back per its row. | no | `HdriController` load, relink and clear | F5 |
| `hdri.source.name` | string 1..128 | (required) | sanitized (07 `sanitizeString`), truncated to 128 (`truncated`); empty → source `null` | no | the controller stores the sanitised, truncated file name | F5 |
| `hdri.source.bytes` | integer | (required) | [1, 104857600] (100 MiB), else source `null` + `defaulted` | no | `File.size` after the 6.9 file-size check (≤ 100 MiB) | F5 |
| `hdri.source.sha256` | string `/^[0-9a-f]{64}$/` | (required) | anything else → source `null` + `defaulted` | no | `digest` output (lowercase hex) | F5 |
| `hdri.source.path` | `null \| string` `/^hdri\/[A-Za-z0-9._-]{1,128}$/` | `null` | invalid → `null` (`sanitized`) | no | the ZIP writer (`hdri/` + `safeZipName(name)`, 7.3); every other variant writes `null` | F5 |
| `hdri.quality` | `2k\|4k\|8k` | `4k` | unknown → default (`defaulted`) | **yes** | the model value (the MVP never changes it; T18's select) | F5 |
| `hdri.backdrop` | bool | `false` | `"true"`/`"false"` coerced | **yes** | the switch, `Shift+H` | F5 |
| `hdri.projection.point_mode` | `camera\|custom` | `camera` | unknown → default | no | select | F5 |
| `hdri.projection.point_m.x` / `.y` / `.z` | number (m, stage frame) | 0 / 1.5 / 5 | [−100000, 100000] / [0, 100] / [−100000, 100000] (`clamped`; 07 C22, C45) | no | every writer goes through the same clamp rules: inputs, gizmo, the camera copy on a mode switch, `translateStage` | F5 |
| `hdri.projection.rotation_deg.x` / `.y` / `.z` | number (°): x = pitch, y = yaw, z = roll; Euler `YXZ` (07's camera convention) | 0 | x clamped to [−90, 90]; y and z wrapped into (−180, 180] (`wrapped`, info) | no | the rule functions (wrap and clamp) | F5 |
| `hdri.projection.exposure_ev` | number | 0 | [−10, 10] | no | inputs, Auto EV (clamped) | F5 |
| `hdri.projection.tone_map` | `auto\|aces\|clip` | `auto` | unknown → default | no | select | F5 |
| `hdri.projection.led_mask` | number 0..1 | 0 | [0, 1] | no | the T19 slider (percent / 100); 0 before T19 | F5 |
| `display.content` (07's row) | `color\|ledSim\|panelIds\|hdri` | `color` | 07's rule, unchanged: `hdri` with `hdri.source === null` → `color` + `defaulted`. The validator therefore validates `hdri` **before** `display.content`. | no | the content invariant below guarantees that the app never writes `hdri` with a null source | P/F5 |

**Rows added by T11 (car increment).** The car increment's release makes its own single revision bump, assigned at merge (07 C40). Each leaf name and value is 07's skeleton entry (07 4.2).

| Path | Type | Default | Validator | View-only | Writers can produce | Owner |
|---|---|---|---|---|---|---|
| `props.car.model` | object | `{kind: 'procedural', asset_id: 'kenney-sedan-sports', paint: '#b01c1c', finish: 'gloss', env_source: 'auto'}` | not a plain object → default + `defaulted` | no | always written (07 skeleton) | F5 |
| `props.car.model.kind` | `procedural\|gltf` | `procedural` | unknown → default | no | `#car-model` | F5 |
| `props.car.model.asset_id` | string `/^[a-z0-9][a-z0-9-]{0,63}$/` | `DEFAULT_CAR_MODEL_ID` | Malformed → default (`sanitized`). A well-formed id unknown to this app version is **kept**, so it round-trips, and the car renders procedural with the T11 status message. It is a bundled-manifest id (6.10), not an `assets[]` id: kind `model` stays reserved (07 C9). | no | manifest ids only | F5 |
| `props.car.model.paint` | `#rrggbb` lowercase | `#b01c1c` | hex rule (`sanitized`); `#rgb` expands (`coerced`) | no | `<input type=color>` (lowercase) | F5 |
| `props.car.model.finish` | `gloss\|satin\|chrome` | `gloss` | unknown → default | no | select | F5 |
| `props.car.model.env_source` | `auto\|hdri\|stage\|studio` | `auto` | unknown → default | no | select | F5 |

There are **no amendments to 07 4.5 (assets)**. Revision 2's MIME allowlist, `bundled` storage, ZIP opt-out and `AssetStore.addFile` options are withdrawn. `assets[]` is untouched by this feature.

Example (the `file` variant; `…` marks spec 07 keys this spec does not touch; the revision number is assigned at merge, 07 C40):

```jsonc
{
  "version": "2.<n>",
  "generator": { "…": "…" },
  "format": "morph-led-project",
  "…": "…",
  "display": { "content": "hdri", "led_layout": "single-dot", "…": "…" },
  "props": {
    "person": { "…": "…" },
    "car": { "visible": true, "position_m": { "x": 4, "z": 3 }, "rotation_y_deg": 0, "scale": 1,
             "model": { "kind": "gltf", "asset_id": "kenney-sedan-sports", "paint": "#b01c1c",
                        "finish": "gloss", "env_source": "auto" } }
  },
  "hdri": {
    "source": { "name": "venice_sunset_4k.hdr", "bytes": 25292611,
                "sha256": "9c41f0e2b7d35a18…(64 hex)", "path": null },
    "quality": "4k",
    "backdrop": false,
    "projection": {
      "point_mode": "custom",
      "point_m": { "x": 2.5, "y": 1.6, "z": 6 },
      "rotation_deg": { "x": 0, "y": 35, "z": 0 },
      "exposure_ev": -0.5,
      "tone_map": "auto",
      "led_mask": 0
    }
  },
  "viewport": { "…": "…" },
  "assets": [],
  "…": "…"
}
```

**Writer rules (`ProjectSerializer.write`, all variants).**
- `hdri` is **always written**, with every leaf (defaults included), in the key order above, placed after `props` (07 4.2). Numbers are written unrounded. Projection settings are therefore persisted even while `source` is `null`; they are ordinary project state.
- `hdri.source` is `null` when no HDRI is referenced, otherwise the descriptor.
- **Content invariant.** `display.content === 'hdri'` implies `project.hdri.source !== null` in the live model. Three things maintain it:
  - the HDRI radio is disabled unless the state is `ready` or `missing` (3.3), and `H` with no HDRI only flashes the drop zone;
  - `clear()` switches the content back to the previous mode before it emits `empty` (5.3);
  - `restore()` assigns a validated file, in which the validator already enforces 07's rule.

  As a defence, the writer writes `display.content: 'color'` if the invariant is ever broken. A unit test drives every `HdriController` and `WallController` use case and asserts the invariant after each one. So **Save, then Open never changes the content mode and never produces the `defaulted` warning** (07 4.7 fidelity). The same holds for `history` snapshots.
- `hdri.source.path`:
  - `file` and `autosave` variants: `null`;
  - `zip` variant: `hdri/<safeZipName(name)>` when `#hdri-include-in-zip` is on and the session blob exists, else `null`;
  - `history` variant: always `null` (restore looks blobs up by `sha256` first, 4.3).
- `history` variant: `quality` and `backdrop` are omitted (view-only, 07 4.4 rule 5).
- **No HDRI or model pixels, and no data URI for them,** ever appear in any variant.
- `props.car.model` (T11) is always written with all five leaves.

### 4.3 Migration and import

| Input | Result |
|---|---|
| v1 file (07 4.6) | A v1 import is **wall-only**: `hdri`, the car model and `display.content` keep their current values. This spec raises no issues. |
| v2 written before T8 (no `hdri`) or before T11 (no `props.car.model`) | Defaults, with no issues (absent means default). |
| v2 with `display.content: "hdri"` and `hdri.source: null` (only possible from foreign or hand-edited files) | `display.content = "color"` + `defaulted` warning (07's rule). |
| v2 with a non-null `hdri.source` | `ProjectSession.apply` step 3 calls `hdriController.restore(v.hdri)` (5.3). It assigns the settings synchronously, then resolves the bytes without blocking `apply`, in this order:<br>1. **the same `sha256` is already decoded**: nothing is reloaded, and only `HDRI_PROJECTION_CHANGED` is emitted;<br>2. the **session blob map** (an earlier load in this session; undo; redo);<br>3. a **ZIP entry** at `source.path` handed over by `ProjectSession.openFile` (`provideZipEntries`, 5.3). It is hashed on use; a mismatch keeps it with the 3.6 checksum warning;<br>4. a **bundled sample** whose manifest `sha256` matches (T21);<br>5. an **`HdriCache` hit** by `sha256` (T8b);<br>6. otherwise the state is **`missing`**. The content stays `hdri`, and the wall shows section colours until the file is relinked.<br>Cases 2-5 go through the load path (state `loading`, then `ready`) and record no history. |
| v2 with invalid values | Sanitised per 4.2 with spec 07's issue codes, and shown in spec 07's import report. |
| A newer revision | 07's rule (`newer-revision` warning; unknown keys dropped outside `extensions`). |

---

## 5. Architecture

### 5.1 Render foundation (spec 07 R1-R3: hard prerequisite)

Feature 5 adds nothing to `SceneManager`'s frame, to `PreviewPass` or to `PreviewWindow`. It uses 07's layer table as follows:

| Object | Layer / mechanism | Main camera (`0b1111`) | Main in pilot (`0b1101`) | `PreviewPass` and stills (`DEFAULT \| ENVIRONMENT`) | Stage probe `CubeCamera` (T12b; `DEFAULT` only) | Pick |
|---|---|---|---|---|---|---|
| Projection on the wall | wall materials, `DEFAULT` | yes | yes | yes | yes (this is what the car reflects) | wall Selectables (spec 02) |
| Backdrop dome | `sceneManager.addHelper(dome, { layer: LAYERS.ENVIRONMENT })`; identity transform; `raycast = () => {}`; `frustumCulled = false`; `renderOrder = −1e6`; `depthTest = depthWrite = false` | yes | yes | yes (stills include the backdrop, which is wanted for previs) | **no** (layer) | never |
| Projection-point marker (octahedron plus `ArrowHelper`) | `sceneManager.addHelper(marker)` (`HELPERS`); 07's per-frame enforcement re-tags the arrow child; `renderOrder = RENDER_ORDER.HDRI_MARKER` (993, spec 01's registry; no literal); 06's colours with a `--scene-overlay-halo` edge outline | yes | no | no | no | `'hdri-point'` (`pickMeshes`; `PointerRay` uses `layers.enableAll()`) |
| `TransformControls` root (r128) | 07: layer `'default'` + `passHidden` | yes | no | no | hidden: the capture runs inside `sceneManager.withPassHidden(...)` | its own raycaster |
| glTF or procedural car (T11) | `DEFAULT` | yes | yes | yes | hidden through the probe's `exclude` list during capture | `'car'` |

**Stage-probe layer mask, stated explicitly.**
- In r128, `CubeCamera`'s six child cameras share the cube camera's own `layers` object (`cameraPX.layers = this.layers`, Appendix A). A new `CubeCamera` has the default mask `0b0001`.
- `StageReflectionProbe` never changes it, so the probe sees `DEFAULT` only: no helpers, no debug lines, and no dome. The dome needs no `exclude` entry; only the car is hidden by visibility.
- The probe camera is not registered with `addHelper`, so 07's per-frame layer enforcement never touches it.
- **Spec 07's layer table (5.2.1) lists the dome as "Preview / still: yes; CubeCamera: no"** (applied by 07's consolidated D0).

`SceneManager.setEnvironment(texture | null)`, `get environment()` and `setPunctualLightScale(k)` are this feature's additions, made in **T12** (car increment) as 07 0.2 directs.
- `setEnvironment` sets `scene.environment` and calls `invalidate('environment')`.
- `setPunctualLightScale` keeps references to the two legacy lights created in `init()`; the R5 allocation order is unchanged.

The MVP needs neither.

Revision 2's T0, its "path B" contract-replacement table and its section 6.8 are **deleted** (07 C12: spec 07 owns the single renderer).

### 5.2 Modules (new and changed)

"Task" names the task that adds the module (10.1). MVP tasks are T1-T9 and T14. Every other task is an increment.

| Path | Layer | New/changed | Task | Responsibility |
|---|---|---|---|---|
| `js/vendor/three-addons.js` | vendor | changed (07 owns it) | T1 | F5 uses its loader factories: `createHdrLoader` (MVP), `createExrLoader` (T17, with `fflate`), `createGltfLoader` (T11), `createRoomEnvironment` (T12). F5's requirements are listed in 5.3. |
| `js/domain/HdriSettings.js` | domain | new | T2 | 4.1 |
| `js/domain/Project.js` | domain | changed | T2 | `ContentMode.HDRI`, `setContent`, `Project.hdri` |
| `js/domain/Prop.js` | domain | changed | T11 | `CarModelSettings`, `DEFAULT_CAR_MODEL_ID` |
| `js/geometry/EquirectProjection.js` | geometry | new | T2 (T20: `wallCoverage`) | Pure twin of the shader maths (6.2-6.5): `worldToEnv(yaw, pitch, roll, out)`, `dirToUv`, `uvToDir`, `projectPoint`; `wallCoverage` (6.7, T20) |
| `js/geometry/EnvImageOps.js` | geometry | new | T2 | RGBE→linear, sRGB↔linear, area resample, row flip, **THREE-free `floatToHalf`/`halfToFloat`** (6.9), `sampleEquirect(img, u, v)` for the `half` and `srgb8` pixel kinds, thumbnail tone map, `acesR128`, `logAverageLuminance`, `autoExposureEv` |
| `js/geometry/HdriBake.js` | geometry | new | T13 | The per-texel bake function shared by the UV viewer and the exports (6.12) |
| `js/io/HdriFileInfo.js` | io | new | T2 (T17: EXR reader) | Magic sniffing; header readers for Radiance, PNG and JPEG (with the segment walk past the probe); limit checks (6.9). Pure. |
| `js/io/ProjectSchema.js`, `js/io/ProjectSerializer.js`, `js/io/ProjectValidator.js` | io | changed (07 modules) | T8 (T11) | The 4.2 rows, the writer rules and the content-invariant defence |
| `js/io/ObjExporter.js`, `js/io/GltfExporter.js` | io | changed | T13 | Texture references for the bake (7.2) |
| `js/render/ColorManagement.js` | render | new | T4 (T11: `patchSceneReferred`) | GLSL snippets (`ACES_GLSL`, `SCENE_TO_DISPLAY_GLSL`), `srgbHexToLinearColor`; `patchSceneReferred(material, uniforms)` for the car (Option L, 5.7) |
| `js/render/hdri/DeviceCaps.js` | render | new | T3 | `computeDeviceCaps(renderer, nav) -> DeviceCaps` (6.9) |
| `js/render/hdri/HdriDecoder.js` | render | new | T3 (T17: EXR) | Decodes a file into an `EnvImage` through the loader factories; captures r128's `console.error`; LDR resize fallbacks |
| `js/render/hdri/HdriEnvironment.js` | render | new | T3 (T12: reflection PMREM) | Owns the projection texture, the shared env uniforms, the thumbnail, the retained CPU image and, from T12, the HDRI reflection PMREM |
| `js/render/hdri/EnvironmentBuilder.js` | render | new | T12 (T12b: cube pass) | One `PMREMGenerator`, the rotate-to-world pass, the cube-to-equirect pass, the studio environment |
| `js/render/HdriProjectionMaterial.js` | render | new | T4 | `ShaderMaterial` factory for the wall and the dome (the name comes from ARCHITECTURE section 9) |
| `js/render/hdri/HdriProjectionView.js` | render | new | T4, T7 | Per-frame uniform sync, the marker (`HELPERS`) and the dome (`ENVIRONMENT`) |
| `js/render/hdri/StageReflectionProbe.js` | render | new | T12b | `CubeCamera` stage capture → equirect → PMREM, motion-gated |
| `js/render/CarAssetLibrary.js` | render | new | T11 | Manifest, glTF loading, normalisation, the shared instance |
| `js/render/GltfCarPropView.js` | render | new | T11 | `extends CarPropView`. A glTF instance or the legacy procedural car; finish and colour management. |
| `js/render/LEDMaterialFactory.js` | render | changed | T4 | New dep `hdri`. The HDRI branch comes first in `combined`, `section` and `panel`. |
| `js/render/SceneManager.js` | render | changed | T12 | `setEnvironment`, `environment`, `setPunctualLightScale` (07 0.2) |
| `js/app/HdriController.js` | app | new | T4, T6, T8 | Use cases, the per-frame `tick(now)`, the Selectable `'hdri-point'`, the session blob map, `restore` |
| `js/app/HdriCache.js` | app | new | T8b | The only IndexedDB store (07 C20, rule S2): blobs keyed by `sha256` |
| `js/app/CarModelController.js` | app | new | T11, T12, T12b | Model kind, finish, environment source; per-frame environment resolution (`tick(now)`) |
| `js/app/HdriBakeService.js` | app | new | T13 | Implements spec 04's `hdriBaker` and the export bake (6.12) |
| `js/app/WallController.js` | app | changed | T4 | `setContentMode(mode, {record})`, the only content writer (07 C49); `rebuildSeq` (incremented at the start of P1); reads spec 02's `currentLayout`, the single layout accessor (07 0.4; if this feature lands before spec 02, T4 adds `currentLayout` as the stage-frame layout of the last P1 rebuild); rebuild-policy rows `F5-1`..`F5-3` (5.5) |
| `js/app/PropController.js` | app | changed | T11 | `refreshView()`; `getTransform` uses `view.anchorY?.() ?? prop.gizmoAnchorY` |
| `js/app/ProjectIO.js`, `js/app/ProjectSession.js` (07) | app | changed | T8 (T11, T13) | `exportZIP` writes the `hdri/` entry; `openFile(zip)` calls `provideZipEntries`; `apply` step 3 calls `hdriController.restore(v.hdri)`; T11: `carModelController.syncFromModel()` in step 3 (07 C41); T13: bake textures and `exportHdriPixelMap()` |
| `js/app/App.js` | app | changed | all | Wiring (5.9) |
| `js/ui/WallContentPanel.js` | ui | new | T5 | `#wall-content-mode` (including the HDRI radio's disabled state) |
| `js/ui/HdriPanel.js` | ui | new | T5 | Every `#hdri-*` id, `#hdri-viewport-badge`, `#hdri-drop-overlay`, the `.viewport` and `document` drag handlers, the badge `ResizeObserver` |
| `js/ui/CarModelPanel.js` | ui | new | T11 | `#car-model`, `#car-paint`, `#car-finish`, `#car-env-source`, `#car-model-status` |
| `js/ui/WallDisplayPanel.js` | ui | changed | T5 (T19) | The `DISPLAY_CONTENT_CHANGED` mirror sets `.active` and `aria-checked` on **both** legacy proxies from `payload.content`, for every payload. The Panel IDs section stays visible; it is collapsed by default while `content !== 'panelIds'` (a user expand is kept for the session) and carries the hint "Also used by Panel ID exports" (3.1). T19: `#led-sim-options` is also shown in HDRI mode. |
| `js/ui/ExportPanel.js` | ui | changed | T8 (T13) | `#hdri-include-in-zip`; T13: `#export-texture-content`, `#hdri-export-pixelmap` |
| `js/theme/Theme.js` | theme | changed | T4 | `SceneTheme.hdri = { marker: 0xc51622, markerArrow: 0xc51622, markerOutline: 0x0a0a0a, markerSize: 0.06 }`: **06 §5.12's per-key values, the spec of record** (Feature 6 lands first, 07 §1.4). Each colour key lands with its token (`--scene-hdri-marker`, `--scene-overlay-halo`), its `COLOR_BINDINGS` row and this fallback in the same commit. The octahedron and the arrow cone get a 1 px `EdgesGeometry` outline in `markerOutline`; the arrow shaft is a two-tone overlay (halo plus dashed core, closed `Line`/`LineSegments`, never `LineLoop`), 06 D15. |
| `index.html`, `css/features/hdri.css` | markup / css | changed / new | T5 | 3.1-3.3. The stylesheet is in the `css/features/*` block of 07 C52's link order. No info-badge change (07 C35). |
| `assets/models/cars/manifest.json`, `assets/models/cars/*.glb`, `assets/LICENSES.md` | assets | new | T10 | 6.10 |
| `assets/hdri/manifest.json` + the sample `.hdr` | assets | new | T21 | Q7. The manifest carries each file's precomputed `sha256`. |

### 5.3 Public APIs (signatures)

**Loader factories (`js/vendor/three-addons.js`, owned by spec 07 5.7.4, task I3)**

F5 calls `addons.createHdrLoader()` (MVP), `createExrLoader()` (T17), `createGltfLoader()` (T11) and `createRoomEnvironment()` (T12). Each resolves on first use and shares one promise for concurrent calls. It rejects with `Error('Failed to load <name>')`, which F5 reports (3.6). F5's requirements on 07's classic (r128) branch:

| Factory | Classic script (r128, jsdelivr) | SRI (sha384, Appendix A) | Requirement |
|---|---|---|---|
| `createHdrLoader` | `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/RGBELoader.js` | `sha384-brr1wFCScwAi+SbB5QEzZ6kd5yjKCrFmRuUqxbw0XQSElYZz7XPg9+lVO8jdV0yX` | returns `new THREE.RGBELoader()` (default `type = UnsignedByteType`) |
| `createExrLoader` | `…/examples/js/libs/fflate.min.js`, **then** `…/examples/js/loaders/EXRLoader.js` | fflate `sha384-z5TPRpmZ+60mv8LqyHeCA0HTTbGjLyhJPjpEb4c4mgqrdWC1zM5Sn5pSRmknOjK8`; EXRLoader `sha384-X1uytzg9rnRkLC4gX4Usi13gnHZTMLjzQsxkQO+LPWSE0ZnV5dXjIK6WdsPM5Zrn` | r128 `EXRLoader` reads the **global `fflate`** at parse time for ZIP, ZIPS, PIZ and DWA. 07's factory list omits this dependency, and 07's consolidated D0 adds it to 07 5.7.4. |
| `createGltfLoader` | `…/examples/js/loaders/GLTFLoader.js` | `sha384-fljlqkjWlmSFjkESkQvm77heIZpoWmXEOzlCA7kOpGUH+95Zk0yGfQieWM2q136E` | no Draco, Meshopt or KTX2 (6.10) |
| `createRoomEnvironment` | `…/examples/js/environments/RoomEnvironment.js` | `sha384-UpJYDNQ/8wDmBlzh4lZ9VMbunag9yRAOGFiBWYVaf6/FCnrwc9qlto25EZVLhpph` | returns `new THREE.RoomEnvironment()` |

Lazy loading adds no startup cost, and scenarios that do not use the feature make no new network requests (AC 21). If 07 I3 shipped without the loader factories, T1 adds them to 07's module, to 07's contract. It never creates a second vendor module (07 C14).

**`js/io/HdriFileInfo.js`** (pure; every synchronous reader takes the first `HDRI_LIMITS.headBytes` bytes as a `Uint8Array`)

```js
/** Magic bytes: '#?' (0x23 0x3F) -> 'hdr'; 76 2F 31 01 -> 'exr'; 89 50 4E 47 0D 0A 1A 0A -> 'png'; FF D8 FF -> 'jpg'; else null.
 *  The extension is advisory: content wins, and a mismatch is a warning. Before T17, 'exr' is reported with its own message (3.6). */
export function sniffFormat(head, fileName)
/** Mirrors r128 RGBELoader RGBE_ReadHeader (Appendix A): line 1 must match /^#\?(\S+)/ (else 'bad initial token');
 *  then every line is scanned in order: lines starting with '#' are comments; FORMAT= matches /^\s*FORMAT=(\S+)\s*$/;
 *  the size line matches /^\s*-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/; scanning stops as soon as BOTH were seen.
 *  Before r128's rule, a line matching /^\s*[+-][XY]\s+\d+\s+[+-][XY]\s+\d+\s*$/ that is not '-Y h +X w' gives the
 *  'Unsupported Radiance orientation' error. End of the probe without FORMAT -> 'missing format specifier';
 *  without the size line -> 'missing image size specifier'. -> {width, height, format} | {error} */
export function parseRadianceHeader(head)
/** PNG: IHDR is the first chunk; width = u32be at byte 16, height = u32be at byte 20. -> {width, height} | {error} */
export function readPngSize(head)
/** JPEG: walk the segments from byte 2 (FF xx, u16be length). The first SOFn marker (C0-C3, C5-C7, C9-CB, CD-CF) gives
 *  height = u16be at +5 and width = u16be at +7. Stops at SOS (DA) -> {error}.
 *  If the walk reaches the end of `head` first -> {needsWalk: offset} (the next segment's offset in the file). */
export function readJpegSize(head)
/** Continues a JPEG segment walk past the probe without reading the file: each step reads only the 4-byte marker and
 *  length with blob.slice(offset, offset + 4).arrayBuffer() (and the 9-byte SOF header when found). At most
 *  HDRI_LIMITS.jpegWalkMaxSegments steps. Blob is a web and Node >= 18 global, so this stays unit-testable.
 *  -> Promise<{width, height} | {error}> */
export async function walkJpegSegments(blob, offset)
/** (T17) EXR: version = u32le at byte 4; tiled = version & 0x200, deep = version & 0x800, multipart = version & 0x1000.
 *  Then the header attributes (name\0 type\0 u32le size, value) until an empty name: dataWindow (box2i, 4 × i32le)
 *  -> width = xMax - xMin + 1, height = yMax - yMin + 1; compression (1 byte: 0 NO, 1 RLE, 2 ZIPS, 3 ZIP, 4 PIZ,
 *  5 PXR24, 6 B44, 7 B44A, 8 DWAA, 9 DWAB). -> {width, height, compression, tiled, deep, multipart} | {error} */
export function readExrHeader(head)
/** Dispatches on format. JPEG may return {needsWalk}; the caller then awaits walkJpegSegments. */
export function probeDimensions(format, head)
/** -> {ok, errors: string[], warnings: string[]}: file-size limits; the device cap for the format class
 *  (caps.maxSourceHdr for hdr/exr, caps.maxSourceLdr for jpg/png); aspect; EXR features (T17). All of it before any decode. */
export function checkHdriLimits({ format, bytes, width, height, exr }, caps)
/** 'venice sunset (4k).hdr' -> 'venice_sunset__4k_.hdr': [A-Za-z0-9._-] kept, others '_'; at most 128 characters,
 *  keeping the extension. Used for the ZIP path (7.3). */
export function safeZipName(name)
```

**`js/render/hdri/DeviceCaps.js`**

```js
/** @typedef {{isWebGL2: boolean, maxTextureSize: number, floatTargets: boolean, lowMemory: boolean,
 *             maxSourceHdr: {width, height}, maxSourceLdr: {width, height}, maxQuality: '2k'|'4k'|'8k'}} DeviceCaps
 *  Computed once, by App.init() right after sceneManager.init() (formulas in 6.9). */
export function computeDeviceCaps(renderer, nav)
```

**`js/render/hdri/HdriDecoder.js`**

```js
/** @typedef {{width:number, height:number, pixel: 'half'|'srgb8', data: Uint16Array|Uint8Array,
 *             channels: 3|4, rowOrder: 'bottom-up', sourceWidth:number, sourceHeight:number,
 *             stats: {maxLuminance:number, logAverageLuminance:number}}} EnvImage */
export class HdriDecoder {
  /** @param {{doc, win, addons: {createHdrLoader, createExrLoader}}} deps  (no allocation; R4) */
  constructor({ doc, win, addons })
  /** Called only after HdriFileInfo accepted the header. Output width Wt = workingWidth (6.9); height = round(Wt · H / W).
   *  Always bottom-up (6.3).
   *  hdr: loader = await addons.createHdrLoader() (kept); result = #parseRgbe(loader, buffer):
   *       - r128's parse() is synchronous and reports body errors only through console.error, returning null
   *         (Appendix A). So #parseRgbe swaps win.console.error for a collector, calls parse, and restores it in
   *         `finally`. Nothing else can run in between. The collected text never reaches the console; under ?debug=1 it
   *         is logged with console.debug.
   *       - result === null -> throw HdriDecodeError('corrupt or truncated data').
   *       - result.data.length < 4 · width · height -> the same error (for flat files, r128 returns the remaining bytes
   *         unchecked).
   *       - result.exposure (the EXPOSURE= header; default 1) is ignored on purpose (6.9).
   *       RGBE top-down -> area resample to linear -> floatToHalf -> flip to bottom-up.
   *  exr (T17): (await addons.createExrLoader()).setDataType(HalfFloatType).parse(buffer) -> half RGBA (r128 always outputs
   *       4 channels), bottom-up -> area resample (drop alpha). Thrown strings are normalised with String(e?.message ?? e).
   *  jpg/png: bitmap = await #ldrBitmap(blob, Wt, Ht) (6.9, the createImageBitmap fallback chain) -> drawImage onto a Wt×Ht
   *       canvas -> getImageData -> sRGB RGBA, top-down -> flip. Only the Wt×Ht canvas is created in the page; a
   *       full-size bitmap exists only in the last fallback step, and only inside the browser's decoder.
   *  onProgress(phase: 'decoding'|'resampling', fraction). The input buffer is released (not referenced) before the
   *  output is allocated. */
  async decode({ blob, buffer }, { format, width, height, workingWidth, onProgress })
  /** LDR dimension fallback (6.9 step 3): createImageBitmap(blob) -> {width, height}; bitmap.close(). */
  async measureLdr(blob)
}
```

**`js/render/hdri/HdriEnvironment.js`**

```js
export class HdriEnvironment {
  /** @param {{sceneManager, builder: EnvironmentBuilder|null}} deps   (builder from T12) */
  constructor({ sceneManager, builder })
  get ready()             // a projection texture exists
  get version()           // increments on every setImage/clear
  /** The SHARED env uniform objects, created lazily on first access and never replaced:
   *  { uEnv: {value: Texture}, uEnvEncoding: {value: 0|1} }  (0 linear half float, 1 sRGB 8-bit).
   *  Every wall material and the dome material reference these exact objects (HdriProjectionMaterial). */
  get uniforms()
  get projectionTexture() // DataTexture: half-float RGB (RGB16F) or sRGB8 RGBA, LinearFilter, no mipmaps,
                          // wrapS RepeatWrapping, wrapT ClampToEdgeWrapping, flipY false, unpackAlignment 1
  get encoding()          // 0 | 1
  get cpuImage()          // the EnvImage given to setImage (three keeps DataTexture.image.data anyway): the bake source
  get stats()             // cpuImage.stats (Auto EV)
  get thumbnail()         // HTMLCanvasElement 256×128, ACES or clip per format, EV 0
  get memoryBytes()       // estimated GPU bytes (shown in the panel tooltip)
  /** Creates the new projection texture. Then, synchronously and in this order (the replacement rule):
   *   1. uniforms.uEnv.value = new texture; uEnvEncoding.value = encoding;
   *   2. (T12) the cached reflection PMREM is dropped: if (sceneManager.environment === its texture) sceneManager.setEnvironment(null);
   *   3. only then the previous textures are disposed through the ResourceTracker.
   *  No uniform and no scene.environment ever references a disposed texture, so r128 never re-uploads a disposed one. */
  setImage(envImage, { format })
  /** Same rule: uEnv.value = a 1×1 black placeholder DataTexture (owned, disposed only in dispose()), encoding 0;
   *  drop the reflection PMREM as above; then dispose. */
  clear()
  /** (T12) Lazily builds and caches (one entry) the PMREM of the world-rotated HDRI for this rotation. When the rotation
   *  changes: build the new one, swap any scene.environment reference to it, then dispose the old one. Rotation is
   *  compared as three numbers (no string key, no allocation). @returns Texture */
  reflectionTexture(worldToEnv, yaw, pitch, roll)
  /** webglcontextrestored: r128 re-initialises its GL state, so DataTextures re-upload from image.data on next use.
   *  GPU-only render-target contents are lost: the reflection PMREM and the rotated source target are dropped here
   *  (dispose, cache cleared) and rebuilt lazily on the next reflectionTexture() call. */
  onContextRestored()
  dispose()
}
```

**`js/render/HdriProjectionMaterial.js`**

```js
export class HdriProjectionMaterial {
  /** Shared non-env uniforms ({uWorldToEnv, uProjPoint, uExposure, uToneMap, uLedTile, uLedMask}) are created lazily on
   *  first use (not in the constructor; R4). Until T19, uLedTile is a 1×1 white placeholder DataTexture and uLedMask 0.
   *  @param {{env: HdriEnvironment, ledTiles: LEDPixelTextureFactory, display: DisplaySettings}} deps */
  constructor({ env, ledTiles, display })
  get available()         // env.ready
  /** New THREE.ShaderMaterial({uniforms: {...env.uniforms, ...shared, uTileRepeat: {value: new Vector2(rx, ry)}},
   *  vertexShader, fragmentShader (6.5a), side, wireframe, toneMapped: false, fog: false, lights: false}).
   *  The uniform OBJECTS are shared by reference, never copied. Never cloned (clone() would copy the shared uniforms). */
  create({ tileRepeatX, tileRepeatY, side, wireframe })
  /** The dome material (6.5b): the same env and shared uniforms, side: THREE.BackSide, depthTest/depthWrite false. */
  createDome()
  /** Writes the shared non-env uniforms. Called every frame by HdriProjectionView.tick (no allocation). */
  sync({ point, worldToEnv /* number[9], column-major */, exposureEV, toneMap /* 'aces'|'clip' */, ledMask })
  /** (T19) Re-fetches the white LED tile (ledTiles.tile('#ffffff'), a clone owned here) when display.ledLayout changes;
   *  sets uLedTile.value to the new clone, then disposes the previous clone (the replacement rule). */
  refreshMaskTile()
  dispose()
}
```

**`js/render/hdri/HdriProjectionView.js`**

```js
export const HDRI_CHANGED_BITS = Object.freeze({ POINT: 1, ROTATION: 2, OTHER: 4 });
export class HdriProjectionView {
  /** @param {{sceneManager, project, materials: HdriProjectionMaterial, env: HdriEnvironment, theme: {scene}}} deps */
  constructor({ sceneManager, project, materials, env, theme })
  /** Per frame, allocation-free:
   *   hdri.projectionPoint(cine, this.#p); M = worldToEnv(yaw, pitch, roll, this.#m) (recomputed only when one of the three
   *     angles changed, compared as numbers);
   *   materials.sync(...);
   *   marker: created lazily (an octahedron of radius markerSize plus an ArrowHelper of length 0.35 along R_env·(+X canonical)),
   *     sceneManager.addHelper(marker), visible = env.ready && display.content === 'hdri';
   *   dome: created lazily (SphereGeometry(1, 64, 32) + materials.createDome()),
   *     sceneManager.addHelper(dome, {layer: LAYERS.ENVIRONMENT}), frustumCulled = false, renderOrder = -1e6,
   *     raycast = noop, identity transform; visible = env.ready && hdri.backdrop;
   *   (T19) display.ledLayout change -> materials.refreshMaskTile().
   *  @returns {number} a bitmask of HDRI_CHANGED_BITS. 0 means the projected image did not change: P, M, EV, tone map,
   *  mask, env.version and backdrop are all unchanged. Increments `version` when non-zero. Emits nothing (render layer). */
  tick()
  get version()
  get point()             // the resolved projection point of the last tick ({x, y, z}; read-only, reused)
  get dome()              // the dome mesh or null
  pickMeshes()            // [marker mesh] (the marker only, never the dome)
  dispose()
}
```

**`js/render/hdri/EnvironmentBuilder.js`** (T12; T12b adds `cubeToEquirect`). Float render targets are required: without `floatTargets` the controller offers only the `studio` source (3.6), so there is no RGBE or sRGB8 fallback target.

```js
export class EnvironmentBuilder {
  /** @param {{sceneManager, addons}} deps */
  constructor({ sceneManager, addons })
  /** Lazily creates `new THREE.PMREMGenerator(renderer)` and calls compileEquirectangularShader(). Returns a NEW
   *  WebGLRenderTarget (cubeUV) that the caller owns (and must dispose). */
  pmremFromEquirect(texture)
  /** Rotation pass (6.5c): the source equirect -> a world-aligned linear equirect in `out` (1024×512, HalfFloat RGBA).
   *  Creates `out` when it is null. @returns out */
  rotateToWorld(source, { encoding, worldToEnv }, out = null)
  /** (T12b) Stage pass (6.5c): a cube render target holding DISPLAY values -> a linear half-float equirect `out` (512×256).
   *  @returns out */
  cubeToEquirect(cubeTexture, out = null)
  /** The cached PMREM texture of the r128 RoomEnvironment, or null while it is not built yet. Never awaits. */
  studioTexture()
  /** Starts building it once (lazy-loads RoomEnvironment via addons; sigma 0.04); later calls return the same promise. */
  ensureStudio()          // -> Promise<Texture>
  /** webglcontextrestored: drops the PMREM generator's compiled state and the cached studio PMREM (rebuilt lazily). */
  onContextRestored()
  dispose()
}
```

**`js/render/hdri/StageReflectionProbe.js`** (T12b)

```js
export class StageReflectionProbe {
  /** Subscribes WALL_REBUILT -> markDirty() (a mirror of its own state: R3). Allocates nothing until the first capture.
   *  @param {{sceneManager, builder: EnvironmentBuilder, bus}} deps */
  constructor({ sceneManager, builder, bus })
  markDirty()
  get dirty(); get lastCapture()
  /** Captures unconditionally (the caller, CarModelController.tick, decides when; 6.6):
   *  lazily: cubeRT = new THREE.WebGLCubeRenderTarget(256, {format: RGBAFormat, type: UnsignedByteType, encoding: LinearEncoding,
   *          generateMipmaps: false}); cubeCamera = new THREE.CubeCamera(0.05, 200, cubeRT)   // layers left at mask 0b0001
   *  exclude.forEach(o => o.visible = false); sceneManager.withPassHidden(() => cubeCamera.update(renderer, scene)); restore;
   *  eq = builder.cubeToEquirect(cubeRT.texture, eq); next = builder.pmremFromEquirect(eq.texture);
   *  if (sceneManager.environment === old?.texture) sceneManager.setEnvironment(next.texture); old?.dispose();
   *  dirty = false; lastCapture = now; sceneManager.invalidate('stage-probe').
   *  The cube cameras see DEFAULT only (5.1), so helpers, debug lines and the dome are excluded by layer; `exclude` holds
   *  only the car. */
  capture(now, { at, exclude })
  get texture()           // the PMREM texture or null
  onContextRestored()     // markDirty(); the cube and equirect targets are kept (their contents are recaptured)
  dispose()
}
```

**`js/render/CarAssetLibrary.js`** and **`js/render/GltfCarPropView.js`** (T11)

```js
export class CarAssetLibrary {
  /** @param {{addons, win}} deps */
  constructor({ addons, win })
  async manifest()                    // fetch('assets/models/cars/manifest.json') once (a relative URL: works under the Pages sub-path)
  entryById(modelId)                  // manifest entry whose id matches, or null (unknown id: the caller falls back)
  /** (await addons.createGltfLoader()).load(entry.file) -> normalise (6.10) -> a shared Group. Rejects on error. */
  async load(modelId)
  isReady(modelId); instance(modelId) // instance: the ONE shared normalised Group (never cloned)
  dispose(modelId)                    // geometry, materials, textures (maps: true)
}

export class GltfCarPropView extends CarPropView {
  /** @param {{sceneManager, theme, model: CarModelSettings, assets: CarAssetLibrary, colorUniforms}} deps */
  constructor({ sceneManager, theme, model, assets, colorUniforms })
  /** model.kind === 'gltf' && assets.isReady(model.modelId) ? the shared instance (materials patched once via
   *  ColorManagement.patchSceneReferred and configured by applyFinish) : super.buildMesh()  (legacy procedural, verbatim) */
  buildMesh()
  /** Overrides create/remove: when root is the shared glTF instance, only sceneManager.remove(root) (never dispose it);
   *  the procedural branch keeps the legacy disposal (2906-2912 / 2985-2994). */
  create(); remove()
  get isGltf()
  anchorY()                           // glTF: Box3(instance).getCenter().y in model space × prop.scale; procedural: null
  applyFinish({ paint, finish })      // updates material parameters only (6.10); no rebuild
  get carObject()                     // the root to hide during the stage capture
}
```

**`js/app/HdriCache.js`** (T8b; the only IndexedDB store, 07 C20 and rule S2)

```js
export class HdriCache {
  /** @param {{win, clock, limits = {maxEntries: 3, maxBytes: 300 * 2 ** 20}}} deps
   *  Database 'morph-led-configurator', object store 'hdri', key = sha256; value = {blob, name, bytes, lastUsed}.
   *  Every call is wrapped in try/catch: on any failure (private mode, quota, blocked) the cache reports
   *  available = false and every method resolves to a no-op. */
  constructor({ win, clock, limits })
  get available()
  async get(sha256)                   // -> Blob | null; updates lastUsed
  async put(sha256, blob, { name, bytes })   // evicts least-recently-used entries beyond the limits (never the new one)
  async clear()
}
```

**`js/app/HdriController.js`**

```js
export class HdriController {
  /** @param {{project, env: HdriEnvironment, decoder: HdriDecoder, view: HdriProjectionView, wallController, selection,
   *           sceneManager, bus, fileInfo: {sniffFormat, probeDimensions, walkJpegSegments, parseRadianceHeader,
   *           checkHdriLimits, safeZipName}, geometry: {worldToEnv, wallCoverage},
   *           digest: (bytes: ArrayBuffer) => Promise<string>, cache: HdriCache|null, history: History|null,
   *           notifier: Notifier|null, prefs: Prefs|null, getDeviceCaps: () => DeviceCaps, clock: () => number, win}} deps
   *  - fileInfo is io/HdriFileInfo and geometry is geometry/EquirectProjection. App injects both: app/ may not import io/,
   *    and injection keeps the fakes simple.
   *  - digest is 07's `(bytes) => sha256Hex(bytes, {subtle: win.crypto?.subtle})` (07 0.2, 6.13). It has a pure-JS
   *    fallback outside secure contexts.
   *  - getDeviceCaps is read at load time, never in the constructor. App fills the caps object in init(), after the
   *    renderer exists (R4). */
  constructor(deps)
  get state(); get source()           // runtime state; source info {name, format, bytes, sha256, width, height, origin}

  /** Load token: token = ++#loadSeq at entry; after EVERY await, `if (token !== #loadSeq) return`. A stale result is
   *  dropped: an EnvImage is CPU-only and is simply released, because nothing was uploaded yet. Progress is emitted only
   *  for the newest token.
   *  0. if (!getDeviceCaps().isWebGL2) emit {state:'error', message: the WebGL 2 message}; return.
   *  1. emit HDRI_CHANGED{state:'loading', phase:'reading'}; head = await file.slice(0, headBytes).arrayBuffer();
   *     format = sniffFormat; dims = probeDimensions (JPEG {needsWalk} -> await walkJpegSegments(file, offset), then
   *     await decoder.measureLdr(file) if that fails too); checkHdriLimits(..., caps) -> on error emit {state:'error'}; return.
   *     (Nothing larger than 256 KB has been read at this point, apart from the 4-byte walk reads.)
   *  2. phase 'checking': buffer = await file.arrayBuffer(); sha = await digest(buffer). WebCrypto copies the bytes and
   *     releases the copy when it resolves. relink: matched = sha === project.hdri.source?.sha256 (else the 3.6 warning).
   *  3. envImage = await decoder.decode({blob: file, buffer}, {format, width, height, workingWidth (6.9), onProgress}).
   *  4. wasReady = env.ready; env.setImage(envImage, {format}) (replacement rule);
   *     project.hdri.setSource({name: sanitised, bytes: file.size, sha256: sha, path: null}); #blobs.set(sha, file);
   *     #source = {...}; (T8b) if (cache?.available && prefs?.get('hdri_remember') !== false) cache.put(sha, file, ...)
   *     (not awaited; a failure becomes a notifier warning).
   *  5. emit HDRI_CHANGED{state:'ready', source, warnings, thumbnail: env.thumbnail}; sceneManager.invalidate('hdri-ready').
   *  6. if (display.content === 'hdri' && !wasReady) wallController.rebuild()   (row F5-2: missing -> ready while content is HDRI)
   *  7. history?.record(relink ? `Relink HDRI "${name}"` : `Load HDRI "${name}"`).
   *  Errors at any step: emit {state:'error', message}; the previous HDRI stays. */
  async loadFile(file, { relink = false } = {})
  /** (T21) assets/hdri/manifest.json entry {id, sha256, name, file, bytes, author, licence, source} -> fetch(file) -> Blob
   *  -> the loadFile path (origin 'bundled'). */
  async loadBundled(id)
  /** Called by ProjectSession.openFile for a ZIP, before apply (07 amendment, 5.11): keeps the entries whose path starts
   *  with 'hdri/' for the next restore(). They are consumed (cleared) when that restore resolves. */
  provideZipEntries(entries /* Map<string, Blob> */)
  /** For ProjectIO.exportZIP: {path: 'hdri/' + safeZipName(source.name), blob} when an HDRI is referenced and its session
   *  blob exists; else null. ProjectIO writes the entry and passes the path to the serializer (7.3). */
  zipEntry()
  /** 07 ProjectSession.apply step 3: `hdriController.restore(v.hdri)`, where v.hdri is the VALIDATED v2 object.
   *  Synchronous part:
   *  - project.hdri.assign({source: v.source, quality: v.quality ?? live, backdrop: v.backdrop ?? live,
   *    pointMode: v.projection.point_mode, point: v.projection.point_m, rotation: {yaw: rotation_deg.y,
   *    pitch: rotation_deg.x, roll: rotation_deg.z}, exposureEV: exposure_ev, toneMap: tone_map, ledMask: led_mask})
   *    (`?? live`: the history variant omits the view-only fields, and 07 keeps them live on undo/redo).
   *  - v.source === null: ++#loadSeq; env.clear() if ready; emit {state:'empty'}. 07's step 7 rebuild then picks the
   *    colour material. No content change is needed, because the validated file already satisfies the invariant.
   *  Asynchronous part (not awaited by apply): the 4.3 resolution order. The previous image stays until the new one is
   *  ready; a readiness change while the content is HDRI rebuilds once (row F5-2). Never records history. */
  restore(v)
  /** ++#loadSeq; env.clear(); project.hdri.setSource(null); selection.revalidate() (3.4: isSelectable() is now false);
   *  if (display.content === 'hdri') wallController.setContentMode(#previousContent ?? 'color', {record: false})
   *    (the 4.2 invariant; this is the only rebuild);
   *  emit {state:'empty'}; history?.record('Remove HDRI'). */
  clear()
  /** EV = clamp(round(log2(0.18 / max(Lavg, 1e-6)) · 10) / 10, -10, 10), where Lavg = env.stats.logAverageLuminance
   *  (6.9); setField('exposureEV', EV); the emitted source is 'auto'. */
  autoExposure()
  setField(key, raw)                   // model; emit HDRI_PROJECTION_CHANGED{source:'input', key}; after point keys also
                                       // emit SELECTABLE_MOVED{id:'hdri-point'}; returns the stored value
  setPointMode(mode)                   // hdri.setPointMode(mode, cine) (copies the camera on EVERY camera->custom switch);
                                       // emit {source:'mode'}; SELECTABLE_MOVED; selection.revalidate() when switching to camera
  resetOrientation()                   // emit {source:'reset'}
  /** H. Not ready and not missing -> emit HDRI_CHANGED{state, flash: true} (the panel scrolls and flashes the drop zone).
   *  Otherwise toggle between 'hdri' and #previousContent (session) via wallController.setContentMode. */
  toggleContent()
  toggleBackdrop()                     // Shift+H and #hdri-backdrop (view-only: no history record)
  nudgeYaw(deltaDeg)                   // , .  -> rotateBy('y'); emit {source:'keyboard'}; history coalesceKey 'hdri:yaw'
  /** Spec 03 StageAnchored (appended to stageAnchored after carController): hdri.translateStage(dx, dz) (clamped through its
   *  LIMITS, 07 C45); emit HDRI_PROJECTION_CHANGED{source:'pivot'}; emit SELECTABLE_MOVED{id:'hdri-point'}. No rebuild.
   *  Part of the pivot use case's single history entry (07 C59); it never records on its own. */
  translateStage(dx, dz)
  setCoverageWanted(on)                // (T20) HdriPanel calls it from an IntersectionObserver on #hdri-thumb (a DOM handler)
  async setQuality(q)                  // (T18) re-decode the session blob (token rule); with no blob -> 'missing'
  setRemember(on); async forgetCached()   // (T8b) prefs.set('hdri_remember', on); cache.clear()
  /** Per frame, called by the App tick (07 5.2.2, 5.9 here) with `now`. Allocation-free:
   *   bits = view.tick(); if (bits) sceneManager.invalidate('hdri-projection');
   *   follow: compare the resolved point (3 numbers), the rotation (3 numbers), wallController.rebuildSeq and env.version
   *   with the values of the LAST EMITTED payload. If any differs and now - #lastEmitAt >= 100, refill the reused payload
   *   (6.13) and emit HDRI_PROJECTION_CHANGED{source:'follow'}. The loop calls tick on every animation frame (07 6.3), so a
   *   change that stops is emitted within 100 ms (trailing), and continuous motion is emitted at most 10 times a second.
   *   Input emissions update the same "last emitted" values, so a follow never repeats them. */
  tick(now)
  onContextRestored()                  // env.onContextRestored(); sceneManager.invalidate('context-restored')

  // Selectable 'hdri-point' (07 5.4.1 v2; 07 C36: this spec, the owner, picks the id)
  id = 'hdri-point'; label = 'HDRI Point'; kind = 'projector'; pickPriority = 9; historyLabel = 'Move HDRI point';
  isPickable()        // env.ready && display.content === 'hdri' && hdri.pointMode === 'custom'
  /** content === 'hdri' && state ready && pointMode === 'custom' (07 C36). HdriController calls selection.revalidate()
   *  on every transition that can turn it false (clear, missing, a content change away from hdri, a switch to camera). */
  isSelectable()
  pickMeshes()        // view.pickMeshes()
  bounds()            // a reused Box3 of ±0.25 m around the point (07 `F`: frame selection)
  allowedAxes(mode)   // isPickable() ? {x: true, y: true, z: true} : null   (translate and rotate)
  getTransform(out)   // out.position.set(point); out.quaternion.setFromEuler(#euler.set(pitch, yaw, roll in radians, 'YXZ'))
  /** 'start':  #snap = copies of point and rotation.
   *  'drag':   if t.position differs from ctx.start.position: d = t.position − ctx.start.position (with ctx.snap: each
   *            component rounded to ctx.snap.translateM, relative to the start); hdri.setPoint(#snap.point + d) (y >= 0).
   *            If t.quaternion differs from ctx.start.quaternion (|dot| < 1 − 1e-12): #euler.setFromQuaternion(t.quaternion,
   *            'YXZ'); hdri.setRotation({yaw, pitch, roll} in degrees) (with ctx.snap: the change from #snap rounded to
   *            ctx.snap.rotateDeg). Writing only what changed keeps a translate drag from re-deriving the angles (no
   *            gimbal flips near pitch ±90°).
   *            emit HDRI_PROJECTION_CHANGED{source:'gizmo'}; emit SELECTABLE_MOVED{id}.
   *  'end':    no extra write and no rebuild; the gizmo's History transaction commits with historyLabel.
   *  'cancel': hdri.setPoint(#snap.point); hdri.setRotation(#snap.rotation); emit both events.
   *  Idempotent for equal input. */
  applyTransform(t, phase, ctx)
}
```

**`js/app/CarModelController.js`** (T11; reflection sources in T12, `stage` in T12b)

```js
export class CarModelController {
  /** @param {{project, carController: PropController, carView: GltfCarPropView, assets: CarAssetLibrary,
   *           probe: StageReflectionProbe|null, env: HdriEnvironment, builder: EnvironmentBuilder, hdriView: HdriProjectionView,
   *           wallMeshMode: () => string, getDeviceCaps, sceneManager, bus, history, clock}} deps */
  constructor(deps)
  /** model.kind = kind; emit CAR_MODEL_CHANGED{state: 'loading'|'ready'|'fallback'}; if gltf and not ready ->
   *  await assets.load(modelId) (on failure or an unknown id: emit {state:'fallback', message});
   *  then if (car.visible) carController.refreshView() */
  async setModelKind(kind)
  setPaint(hex); setFinish(finish)     // model + carView.applyFinish; no rebuild
  setEnvSource(source)
  syncFromModel()                      // 07 apply step 3 (07 C41): setModelKind(model.kind) if it differs + applyFinish
  /** Per frame (App tick), never awaits, allocation-free (6.6). Calls sceneManager.invalidate('car-environment') itself
   *  when it changed the environment or captured:
   *  src = model.resolveEnvSource({content, hdriReady: env.ready, stageAvailable: !!probe && caps.floatTargets});
   *  if !car.visible || !carView.isGltf: tex = null.
   *  'hdri':   (needs caps.floatTargets, else 'studio') tex = env.reflectionTexture(M, yaw, pitch, roll) when the rotation
   *            has been unchanged for 100 ms or the last build is >= 100 ms old (leading + trailing throttle); otherwise
   *            the previous texture. Colour uniforms = {exposure: 2^EV, toneMap: effectiveToneMap}.
   *  'stage':  (T12b) motion = hdriView.version or the car/person pose-visibility key changed since the last tick
   *            (numbers, no strings); if motion: lastMotionAt = now; probe.markDirty();
   *            if probe.dirty && (now - lastMotionAt >= 150                       // trailing: 150 ms after motion stops
   *                               || (wallMeshMode() !== 'panel' && now - probe.lastCapture >= 500)):   // during motion
   *              probe.capture(now, {at: cached car Box3 centre, exclude: [carView.carObject]});
   *            tex = probe.texture; colour uniforms = {exposure: 1, toneMap: 'clip'}. (Panel mode never captures during
   *            motion: R6.)
   *  'studio': tex = builder.studioTexture(); if (!tex) builder.ensureStudio().then(() => sceneManager.invalidate('studio'))
   *            (one shared promise; the lights stay on until it resolves); colour uniforms = {exposure: 1, toneMap: 'aces'}.
   *  if (tex !== #env) { sceneManager.setEnvironment(tex); sceneManager.setPunctualLightScale(tex ? 0 : 1); #env = tex } */
  tick(now)
  onContextRestored()                  // builder.onContextRestored(); probe?.onContextRestored(); #env = undefined (re-set next tick)
}
```

**`js/app/WallController.js` (additions)**

```js
/** The ONLY content writer from this feature on (07 C49; ContentMode of domain/Project.js is the only enum):
 *  if (mode === display.content) return;
 *  if (mode === 'hdri' && project.hdri.source === null) return;   // the 4.2 invariant (the radio is disabled anyway)
 *  previous = display.setContent(mode);
 *  bus.emit(DISPLAY_CONTENT_CHANGED, {toggled: mode === 'color' ? previous : mode, on: mode !== 'color',
 *           forcedOff: mode !== 'color' && (previous === 'ledSim' || previous === 'panelIds'), content: mode, previous});
 *  if (previous === 'ledSim' || mode === 'ledSim') ledTiles.clearCache();   // E-2: toggling LED sim either way clears it
 *  this.rebuild();
 *  if (record) history?.record(`Wall content: ${mode}`) at the end.
 *  The legacy setLedSim(on) / setPanelIds(on) become thin wrappers over it: on -> setContentMode('ledSim' | 'panelIds');
 *  off -> setContentMode('color') iff that mode is the current one. They keep their legacy event fields and return values
 *  (unit-tested against the Phase-1 behaviour). Before this feature lands, spec 04's chip calls setPanelIds(true). */
setContentMode(mode, { record = true } = {})
/** spec 02's single layout accessor (07 0.4): the stage-frame layout, lazily re-laid out after every mutation including
 *  live transform-only drags. If this feature lands before spec 02, T4 adds it as the layout of the last P1 rebuild. */
get currentLayout()
get rebuildSeq()    // integer, incremented at the start of every P1 rebuild (this spec adds it)
```

The legacy `setLedSim`/`setPanelIds` payloads gain `content` and `previous`; the existing fields are unchanged. When `setLedSim(true)` runs while the content is `'hdri'`, `forcedOff` stays `false` (panel IDs were not on), and the mirrors read `previous: 'hdri'`. The legacy toggles can never select HDRI, so they cannot break the invariant.

**UI panels**

```js
/** Mirrors DISPLAY_CONTENT_CHANGED / PROJECT_REPLACED (checked) and HDRI_CHANGED (the hdri radio's disabled state). */
export class WallContentPanel { constructor({ doc, project, wallController, bus }); bind() }
/** Also binds the .viewport drag listeners (dragenter/dragleave counting), the document-level dragover/drop guard (3.4),
 *  the badge ResizeObserver (3.1) and, from T20, the #hdri-thumb IntersectionObserver. */
export class HdriPanel        { constructor({ doc, win, project, hdriController, bus }); bind() }
export class CarModelPanel    { constructor({ doc, project, carModelController, bus }); bind() }   // T11
```

### 5.4 Events (added to `Events`, ARCHITECTURE 3.2 / 5.2)

| Event | Payload | Emitted by (exact point) | Subscribers (mirrors) |
|---|---|---|---|
| **`hdri:changed`** (`HDRI_CHANGED`) | `{state: 'empty'\|'loading'\|'ready'\|'missing'\|'error', phase?, progress?, source: info\|null, message?, warnings?: string[], thumbnail?: HTMLCanvasElement, flash?: true}` | `HdriController` at every state transition of the newest load token (after the model write, before any rebuild), and from `toggleContent` with `flash` | `HdriPanel` (status, info, thumbnail, enablement, badge visibility, flash), `WallContentPanel` (HDRI radio `disabled`), `CarModelPanel` (enables the `hdri` env option, T11) |
| **`hdri:projectionChanged`** (`HDRI_PROJECTION_CHANGED`) | `{source: 'input'\|'auto'\|'mode'\|'reset'\|'keyboard'\|'gizmo'\|'pivot'\|'follow', key?, pointMode, point: {x, y, z}, rotation: {yaw, pitch, roll}, exposureEV, coverage: CoverageBuffer \| null}`. **One payload object is reused for every emit**, including its `point`, `rotation` and `coverage` members. Subscribers read it synchronously and copy primitives; they never keep a reference (6.13). `point` is the **resolved** projection point. `coverage` (T20) is filled only while `setCoverageWanted(true)` holds; otherwise it is `null`. | `HdriController` after each model write, and from `tick(now)` with `source: 'follow'` (throttled to 10 Hz, 5.3) | `HdriPanel`: input values (yaw/pitch/roll and EV `toFixed(1)`, point `toFixed(2)`; never the focused element); the thumbnail repaint, coalesced per animation frame. The panel never calls the controller from a subscriber (R3). |
| **`car:modelChanged`** (`CAR_MODEL_CHANGED`, T11) | `{state: 'loading'\|'ready'\|'fallback'\|'error', kind, modelId, message?, credit?}` | `CarModelController` | `CarModelPanel` |
| `display:contentChanged` (changed) | adds `content`, `previous`; `toggled` may be `'hdri'` or `'color'` | the unchanged points, plus `setContentMode` | `WallDisplayPanel` (**both** legacy proxies' `.active`/`aria-checked` from `content`, option blocks, the Panel IDs section's default collapse), `SectionLogosPanel` (unchanged rule), **`WallContentPanel`** (radio `checked`), **`HdriPanel`** (badge visibility) |
| `project:replaced` (07) | unchanged | `ProjectSession.apply` step 8 (07 §5.5.2 numbering, C41) | gains `WallContentPanel`, `HdriPanel` and (T11) `CarModelPanel` `syncFromModel()` |
| `selection:changed` (07) | `kind: 'projector'` for `'hdri-point'` | unchanged | `ViewportToolbar` (badge `HDRI Point`) |
| `selectable:moved` | `{id: 'hdri-point'}` | `HdriController` after every point write (inputs, gizmo, mode switch, `translateStage`) | `TransformGizmo` (its proxy re-syncs from `getTransform`) |
| `wall:rebuilt` | unchanged | unchanged | gains `StageReflectionProbe` (marks itself dirty, T12b) |

**Classification (07 C47):** `HDRI_CHANGED`, `HDRI_PROJECTION_CHANGED` and `CAR_MODEL_CHANGED` are **visual** events in the `Events` catalogue. Under spec 07 R3, `SceneManager` subscribes to every visual event for `invalidate`, so the new events also invalidate. Projection **uniforms** are not event-driven: `HdriProjectionView.tick()` reads the model every frame. That keeps camera-follow correct for every camera write path, including camera input commits, which emit no `CAMERA_POSE_CHANGED` (ARCHITECTURE 5.2), without touching `CameraHub.refresh` (R2). The per-frame cost is a comparison of a few numbers; it never renders by itself.

### 5.5 Rebuild policy (ARCHITECTURE 6.2 additions; `tests/unit/wall-controller.test.mjs` asserts them)

Rows carry **named ids** (07 0.4: `F6-1`, `F3-1..5`, `F2-1..13`, `F4-n`, `F5-1..3`, `X2-1`, …), so no spec's rows collide with another's whatever the landing order; 07's D0 applies the scheme to ARCHITECTURE 6.2.

| Id | Trigger | UI entry | Controller call | Rebuild | Other steps |
|---|---|---|---|---|---|
| F5-1 | Content control (any mode), `H`, `clear()` while HDRI | `WallContentPanel`, the 3.5 action, `HdriController.clear` | `setContentMode(mode)` | Always when the mode changes; never when it is unchanged, or when `hdri` is requested with no source | `DISPLAY_CONTENT_CHANGED`; LED sim → another mode clears the tile cache |
| F5-2 | HDRI ready or missing while `content === 'hdri'` (load, relink, restore) | `HdriController` | `wallController.rebuild()` | Only when **readiness** changes (colour ↔ projection material). Replacing a ready HDRI writes the shared env uniforms with **no** rebuild (5.3 replacement rule). | `HDRI_CHANGED` first |
| F5-3 | Projection fields, Auto EV, gizmo, keyboard yaw, backdrop; (T18) quality; (T19) LED mask; (T11/T12) car model, paint, finish, env source | panels, gizmo, keymap | `HdriController.*`, `CarModelController.*` | **Never** (a car model switch rebuilds only the car prop, through `PropController.refreshView`) | uniform or material-parameter updates in the frame tick |

### 5.6 `LEDMaterialFactory` integration

`combined(sections, atlas)`, `section(...)` and `panel(...)` get a first branch:
```
if (display.content === 'hdri' && hdri.available)
  return hdri.create({ tileRepeatX, tileRepeatY, side: this.#side(), wireframe: display.wireframe })
```
- The tile repeats are **the LED-sim repeats**, from one private helper `#ledRepeat(kind, …)` that both branches use:
  - combined: `(atlas.totalLedX, atlas.totalLedY)` (B-M5 semantics until spec 04 changes the UV rect);
  - section: `(cols·ledX, rows·ledY)`;
  - panel: `(ledX, ledY)`.
- With `content === 'hdri'` but `!available` (the `missing` state), the colour branch is used.
- The back shell (spec 01 F1-5) is unaffected.
- Wall-group disposal with `maps: true` (H1) disposes `material.map` only. The HDR texture and the mask tile are uniform values owned by `HdriEnvironment` and `HdriProjectionMaterial`, so a rebuild never disposes them.

### 5.7 Colour management decision (the impact on existing visuals)

The MVP needs no pipeline change. The projection is a `ShaderMaterial` that converts its own scene-referred radiance to display values: decode → exposure → tone map → `LinearTosRGB`, in 6.5. The decision below matters from the car increment on (T11/T12), because a lit `MeshPhysicalMaterial` is the first r128 built-in material that sees scene-referred light.

| Aspect | **Option L (r128, plan of record): display-referred pipeline with scoped scene-referred materials** | Option G: global sRGB output plus ACES (07 U3b, after the upgrade) |
|---|---|---|
| `renderer.outputEncoding` / `toneMapping` | unchanged (`LinearEncoding`, `NoToneMapping`) | after 07 U3: `outputColorSpace = SRGBColorSpace`. F5 sets `toneMapping = ACESFilmicToneMapping` only while a car environment is active (6.11). |
| Legacy materials (wall, frames, rig, frustum, safe zone, sprite, gizmo, props, grid and axes helpers) | untouched, **bit-identical** | each needs `toneMapped: false` (about 25 sites; 07 assigns this "(F5) tone mapping and lights policy" to U3b) |
| CanvasTextures (panel IDs, LED tiles, logos, label sprite) | untouched | `colorSpace = SRGBColorSpace` (done by 07 U3) |
| Clear colour, `scene.background` | unchanged | unchanged |
| HDRI projection (MVP) | the shader does decode → exposure → tone map → `LinearTosRGB` itself (6.5) | the shader does decode → exposure → tone map, then `#include <colorspace_fragment>` |
| PBR car (`MeshPhysicalMaterial`, T11) | `ColorManagement.patchSceneReferred` via `onBeforeCompile`: `#include <tonemapping_fragment>` → `gl_FragColor.rgb = sceneToDisplay(gl_FragColor.rgb);` and `#include <encodings_fragment>` → `gl_FragColor = LinearTosRGB(gl_FragColor);`, with `customProgramCacheKey = () => 'morph-scene-referred-1'`. Each `replace` asserts that its anchor exists (it throws in development). | native |
| Stage capture (T12b) | the cube target stores display values; the cube-to-equirect pass decodes them into a linear half-float target | render targets store linear values; `PMREMGenerator.fromCubemap` directly |
| Harness impact | **none** for existing scenarios | owned by 07 U2/U3/U3b re-baselines |
| Risk | coupling to two r128 chunk names (pinned version; tested) | one missed `toneMapped: false` site tone-maps a legacy colour while the car environment is active |

**Decision: Option L on r128 (plan of record), Option G in 07's U3b port.**
- "Display-referred" means every legacy colour is a display value written straight to the framebuffer, as today.
- New scene-referred content (HDR radiance, PBR lighting) converts itself to display values in its own shader, with one shared tone-map and encode implementation (`render/ColorManagement.js`).
- `toneMapped: false` is set on the new `ShaderMaterial`s for clarity and for the port. In r128, a `ShaderMaterial` is only tone-mapped if it includes `<tonemapping_fragment>`, and ours does not.

Lights (T12): the two legacy lights affect only lit materials, which means only the glTF car. While the car has an environment texture, `setPunctualLightScale(0)` turns them off, so no fixed highlight confuses previs. Their objects and order are kept (R5).

### 5.8 Ownership and state (ARCHITECTURE section 4 additions)

| State | Owner | Writers |
|---|---|---|
| `Project.hdri` (`HdriSettings`) | domain | `HdriSettings` methods via `HdriController`; `HdriSettings.assign` via `HdriController.restore` (07 `ProjectSession.apply` step 3) |
| `Project.display.content === 'hdri'` | domain | `DisplaySettings.setContent` via `WallController.setContentMode`; `DisplaySettings.assign` (07) |
| `Project.car.model` (T11) | domain | `CarModelController`; `CarModelSettings.assign` (07 apply step 3, `car.assign`) |
| Session blob map (`sha256 → Blob`), pending ZIP entries, the previous content mode | `HdriController` | `loadFile`, `loadBundled`, `provideZipEntries`, `restore` |
| HDR projection texture, shared env uniforms, thumbnail, retained CPU image; (T12) reflection PMREM and rotated target | `HdriEnvironment` (`ResourceTracker`) | `setImage`, `clear`, `reflectionTexture`, `onContextRestored` |
| Stage cube, equirect and PMREM (T12b) | `StageReflectionProbe` | `capture` |
| Studio PMREM, rotation and cube passes (T12) | `EnvironmentBuilder` | itself |
| Car glTF instance (T11) | `CarAssetLibrary` | `load`, `dispose` |
| Marker, dome | `HdriProjectionView` | `tick` |
| `scene.environment`, light scale (T12) | `SceneManager` | `setEnvironment`, `setPunctualLightScale`, called by `CarModelController`. Exception: `HdriEnvironment` and `StageReflectionProbe` may swap or null `scene.environment` **only** when it points at a texture they are about to dispose (the replacement rule). |
| Cached HDRI blobs on the device (T8b) | `HdriCache` (IndexedDB; the only store, 07 C20) | `HdriController` (`put`, `clear`) |
| `hdri_remember` device preference (T8b) | `app/Prefs.js` (07 C19) | `HdriController.setRemember` |
| Device caps | `App` (filled in `init`) | `computeDeviceCaps`, once |

DOM ids: as listed in 3.3. They are owned by `WallContentPanel`, `HdriPanel`, `CarModelPanel` and `ExportPanel` (the export ids).

### 5.9 Composition (`App.js`, ARCHITECTURE section 7 additions; constructors remain side-effect free, R4)

```
// construct phase (no THREE allocation)
deviceCaps    = { ready: false }                                  // filled in init(), below
getDeviceCaps = () => deviceCaps
digest        = (bytes) => sha256Hex(bytes, { subtle: win.crypto?.subtle })      // 07 0.2 row "05 5.3 (digest)"; core/sha256.js
addons        = createAddons({ doc })                             // spec 07 (constructed once by App, I3); F5 only uses it
hdriDecoder   = new HdriDecoder({ doc, win, addons })
envBuilder    = new EnvironmentBuilder({ sceneManager, addons })                       // T12
hdriEnv       = new HdriEnvironment({ sceneManager, builder: envBuilder ?? null })
hdriMaterials = new HdriProjectionMaterial({ env: hdriEnv, ledTiles, display })
materials     = new LEDMaterialFactory({ display, panelIds, ledTiles, hdri: hdriMaterials })        // changed deps
hdriView      = new HdriProjectionView({ sceneManager, project, materials: hdriMaterials, env: hdriEnv, theme })
hdriCache     = new HdriCache({ win, clock })                                          // T8b
hdriController = new HdriController({ project, env: hdriEnv, decoder: hdriDecoder, view: hdriView, wallController, selection,
                                      sceneManager, bus, fileInfo: HdriFileInfo, geometry: EquirectProjection, digest,
                                      cache: hdriCache ?? null, history: history ?? null, notifier: notifier ?? null,
                                      prefs: prefs ?? null, getDeviceCaps, clock, win })
selection.register(cameraController); …person; …car; (spec 03 pivot); selection.register(hdriController)
// then spec 02's selection.registerProvider(sectionSelection) (02 5.8: providers after every Selectable)
pivotController stageAnchored: [cameraController, personController, carController, hdriController]          // spec 03
probe         = new StageReflectionProbe({ sceneManager, builder: envBuilder, bus })                         // T12b
carAssets     = new CarAssetLibrary({ addons, win })                                                         // T11
carView       = new GltfCarPropView({ sceneManager, theme, model: car.model, assets: carAssets, colorUniforms })  // T11: replaces CarPropView
carModelController = new CarModelController({ …, probe: probe ?? null, getDeviceCaps })                     // T11
hdriBakeService = new HdriBakeService({ project, env: hdriEnv, wallController, doc })                         // T13
uvViewModel deps: hdriBaker: hdriBakeService                                                                  // spec 04, T13
viewportInput.registerActions({ 'hdri.toggleContent', 'hdri.toggleBackdrop', 'hdri.yawMinus', 'hdri.yawPlus' }) // 3.5
wallContentPanel, hdriPanel (and carModelPanel) constructed after displayPanel (subscription order: WallDisplayPanel,
SectionLogosPanel, WallContentPanel, HdriPanel; their targets are disjoint)

// init phase, right after sceneManager.init() (the renderer exists):
Object.assign(deviceCaps, computeDeviceCaps(sceneManager.renderer, navigator), { ready: true })   // 6.9
// sceneManager.onRestored (07 5.9.3) gains, before its invalidate:
//   hdriController.onContextRestored(); carModelController?.onContextRestored()
// ProjectSession (07 5.5.2): apply step 3 already calls hdriController.restore(v.hdri); step 3's car.assign hydrates
//   car.model (T11) and calls carModelController.syncFromModel() (T11; step 3, 07 C41); openFile(zip) calls
//   hdriController.provideZipEntries(entriesUnder('hdri/')) before apply; ProjectIO.exportZIP uses hdriController.zipEntry().
// setupUI phase, after exportPanel.bind(): wallContentPanel.bind(); hdriPanel.bind(); carModelPanel?.bind();
// loop (07 5.2.2: the tick only updates state; each tick invalidates by itself):
//   sceneManager.startLoop((dt, now) => { orbit.tick(dt); pilot.tick(dt); hdriController.tick(now); carModelController?.tick(now) })
// perf HUD (07 X4): HdriEnvironment reports its GPU bytes next to TextureBudget's totals; its limits stay in HDRI_LIMITS (07 C38)
```

`core/sha256.js` uses `win.crypto.subtle` in secure contexts (GitHub Pages over https, localhost) and its pure-JS FIPS 180-4 path elsewhere (07 6.13). Hashing a 100 MB HDRI on the pure-JS path takes a few seconds; that only happens on LAN-HTTP test devices.

### 5.10 Strategies and LEGACY registry

- **This feature adds no `Strategies` keys.** HDRI and the car are new data whose defaults reproduce today's output (content `color`, car `procedural`).
- It retires no `LEGACY_SITES` row. The preview rows are retired by spec 07 R1/R2.
- **Prerequisite H1** flips `dispose.wallTextures → true`, so the projection material's `map`-free disposal path is the only one.

### 5.11 ARCHITECTURE.md and sibling-spec amendments

ARCHITECTURE.md (same commit as the code of the named task):
1. **1.4 World conventions** (T2): add the equirect convention of 6.1 (`equirectUv`; u = 0.5 is canonical +X; v = 1 is up) and the definitions of `R_env` and `M` (6.2).
2. **2.2 file tree** (each task): add every new file of 5.2, with the work-package owner "Phase 3 F5 / T<n>".
3. **2.3 tests and tools** (T2-T9): add these files:
   - the unit tests `equirect-projection`, `env-image-ops`, `hdri-file-info`, `hdri-settings`, `hdri-schema`, `hdri-decoder`, `hdri-environment`, `hdri-controller` (`.test.mjs`); from T8b `hdri-cache`; from T11 `car-model-controller`; from T13 `hdri-baker`;
   - `tests/regression/scenarios-hdri.mjs`, `tests/regression/fixtures/make-hdri-fixtures.mjs` and its outputs;
   - the `hdri_flat` config.
4. **3.2 Events** (T4): add the keys `HDRI_CHANGED` and `HDRI_PROJECTION_CHANGED` (T11: `CAR_MODEL_CHANGED`). Document the `DISPLAY_CONTENT_CHANGED` payload additions and the reused-payload rule of `HDRI_PROJECTION_CHANGED`.
5. **3.5 domain** (T2, T11): `HdriSettings`, `ContentMode.HDRI`, `DisplaySettings.setContent`, `CarModelSettings`.
6. **3.6 geometry** (T2, T13): `EquirectProjection`, `EnvImageOps`, `HdriBake`.
7. **3.7 render** (T3, T4, T7, T11-T12b):
   - the new render modules;
   - the `LEDMaterialFactory` HDRI branch;
   - the marker on `HELPERS` and the dome on `ENVIRONMENT`;
   - `SceneManager.setEnvironment`, `environment` and `setPunctualLightScale` (T12).
8. **3.8 interaction** (T6): the `'hdri-point'` Selectable (`kind: 'projector'`).
9. **3.9 io** (T2, T8): `HdriFileInfo`; the `ProjectSchema` rows of 4.2.
10. **3.10 app** (T4, T6, T8, T8b, T11, T13):
    - `HdriController`, `HdriCache`, `CarModelController`, `HdriBakeService`;
    - `WallController.setContentMode` (the only content writer) and `rebuildSeq` (the layout is read through spec 02's `currentLayout`);
    - `PropController.refreshView`;
    - the `ProjectSession` hooks and the `ProjectIO` ZIP entry.
11. **3.11 ui** (T5): the three panels; the `WallDisplayPanel` mirror change (both proxies from `content`; the Panel IDs section collapsed, not hidden).
12. **Section 4** (T4): add the rows of 5.8.
13. **Section 5.2** (T4): add the events of 5.4.
14. **Section 6.2** (T4): add the rows `F5-1`..`F5-3` of 5.5 (named ids, 07 0.4).
15. **Section 6.12** (T4): the tick gains `hdriController.tick(now)` (and, from T11, `carModelController.tick(now)`).
16. **Section 7** (T4-T8): the construction and bootstrap order of 5.9.
17. **Section 9** (07's consolidated D0): **rewrite** the Feature 5 seam row to match the delivered design:
    - scissor rendering is in spec 07's `PreviewPass`, not in `SceneManager`;
    - the dome is on `LAYERS.ENVIRONMENT`;
    - `GltfCarPropView extends CarPropView`, not `PropView`;
    - colour management is in `render/ColorManagement.js` as per-material patches (Option L), or Option G after 07 U3b, not in `SceneManager`;
    - loaders come from 07's `vendor/three-addons.js` factories.

Spec 07 (applied by 07's consolidated D0, 07 C58, which replaces revision 3's T15 documentation task; the decisions themselves are already 07's):

| # | 07 section | Edit |
|---|---|---|
| a | 0.2, the four rows for spec 05 | Mark them applied by 05 revision 3. Add one note to 0.1 C9 and C20: "recorded identically in 05's decision record". |
| b | 5.2.1 layer table, dome row | "Preview / still / CubeCamera (F5)" becomes **preview and still: yes; CubeCamera: no**. r128 cube cameras share the `CubeCamera`'s default layer mask `0b0001` (05 5.1). |
| c | 5.2.2 "App tick" | `/* F5: hdriView.tick(); carModelController.tick(now) */` becomes `/* F5: hdriController.tick(now) (it runs hdriView.tick()); carModelController.tick(now) */`. The follow emission is an app-layer mirror (ARCHITECTURE 1.3). |
| d | 5.7.4 | `createExrLoader` loads `examples/js/libs/fflate.min.js` (global `fflate`) before `EXRLoader.js`. Add the SRI table of 05 5.3 / Appendix A. |
| e | 3.8 row shape | `shift?: boolean \| 'any'` (an undeclared value means `false`). The F5 rows `Comma`/`Period` use `'any'`. The dispatcher passes the `KeyboardEvent` to the action. Add a keymap-test case for both. |
| f | 4.2 skeleton | Expand `"hdri"` with 05's leaves (`source{name, bytes, sha256, path}`, `quality`, `backdrop`, `projection{point_mode, point_m, rotation_deg, exposure_ev, tone_map, led_mask}`). Document `props.car.model.asset_id` as a bundled-manifest id (05 6.10). The variant table's `hdri.source.path` row reads "`zip`: `hdri/<name>` when the HDRI file is included (05 7.3); `history`: `null`". |
| g | 5.5.1 | Serializer `write` options gain `hdriZipPath?: string \| null` (zip variant only). |
| h | 5.5.2 | `openFile(zip)`: before `apply`, hand every entry under `hdri/` to `hdriController.provideZipEntries(map)`. `apply` step 3 gains `carModelController.syncFromModel()` (T11; 07 C41), and `PROJECT_REPLACED` is step 8. `ProjectIO.exportZIP` writes `hdriController.zipEntry()` when the export toggle is on. |
| i | 4.8 | `morph-led-configurator:prefs` gains `hdri_remember: true` (T8b). |
| j | 5.9.3 | `onRestored` wiring gains `hdriController.onContextRestored()` and `carModelController.onContextRestored()`. |

Other sibling specs (applied by 07's consolidated D0):
- **Spec 02:** the id is `'hdri-point'` and the kind `'projector'` everywhere (02 5.5, 5.8, 10.3; 07 C36). No info-badge token (07 C35).
- **Spec 03:** `hdriController` is appended to `stageAnchored`, after `carController`. Its `translateStage` clamps through its `LIMITS`, emits its own mirror event and `SELECTABLE_MOVED`, with no rebuild; spec 03's kind union reads `'projector'`.
- **Spec 04:**
  - `UvViewModel` is constructed with `hdriBaker: hdriBakeService` (6.12).
  - 04 R3's note "05 §7.2 assumes an atlas in combined mode" is resolved: 7.2 follows `uv.combined_layout`.
  - No badge token from either spec (07 C35).

### 5.12 Invalidation and history record points

**Render-on-demand** (spec 07 R3). Every call names its reason for `?debug=1`. Each tick invalidates by itself (07 5.2.2), so `App` never invalidates on a tick's behalf.

| Point | Call |
|---|---|
| Projection changed (any source, including camera-follow) | `HdriController.tick(now)`: `if (view.tick()) sceneManager.invalidate('hdri-projection')` |
| HDRI ready / cleared / missing | `HdriController`: `invalidate('hdri-ready')` etc. (the `HDRI_CHANGED` bus subscription also invalidates) |
| Context restored | `HdriController.onContextRestored`: `invalidate('context-restored')` |
| Stage capture finished (T12b) | `StageReflectionProbe.capture`: `invalidate('stage-probe')` |
| Reflection PMREM rebuilt, environment swapped (T12) | `CarModelController.tick(now)`: `invalidate('car-environment')`; `SceneManager.setEnvironment` also invalidates |
| Studio environment ready (T12) | `builder.ensureStudio().then(() => sceneManager.invalidate('studio'))` |
| Car glTF loaded (T11) | `CAR_MODEL_CHANGED` (bus subscription) |

`holdContinuous` is not needed. Spec 07's loop calls the ticks on every animation frame (07 6.3), so the throttled trailing work (follow emission, reflection rebuild, stage capture) runs from the ticks and invalidates when it is done.

**History** (spec 07 H1; ignored while `history.recording` is false). View-only actions (backdrop, quality, remember, forget) are not recorded.

| Use case | Label | `coalesceKey` |
|---|---|---|
| `WallController.setContentMode` (not from `clear()`) | `Wall content: <mode>` | - |
| `HdriController.loadFile` / relink / `loadBundled` / `clear` | `Load HDRI "<name>"` / `Relink HDRI "<name>"` / `Load sample HDRI` / `Remove HDRI` | - |
| `HdriController.setField` | `HDRI <field>` | `hdri:<key>` |
| `HdriController.autoExposure` | `HDRI exposure (auto)` | `hdri:exposureEV` |
| `HdriController.setPointMode` / `resetOrientation` / `nudgeYaw` | `HDRI point mode` / `Reset HDRI orientation` / `HDRI yaw` | - / - / `hdri:yaw` |
| Gizmo drag on `'hdri-point'` | `historyLabel` (`Move HDRI point`) | transaction (07) |
| (T11/T12) `CarModelController.setModelKind` / `setPaint` / `setFinish` / `setEnvSource` | `Car model` / `Car paint` / `Car finish` / `Car reflections` | - / `car:paint` / - / - |

**Undo of an HDRI load or clear.** The snapshot carries the `hdri.source` descriptor. `restore()` finds the bytes in the session blob map, which is never evicted during a session, so undo needs no file dialog. Re-decoding takes about as long as the original load (6.13). While it runs, the previous image stays on screen.

---

## 6. Algorithms and math

### 6.1 Conventions

- Metres, Y up, and the wall front faces +Z. With the identity pivot, the world is the legacy layout frame. Otherwise all positions are in spec 03's **stage frame**. The projection point and the wall both live there, so the maths does not change.
- Angles are degrees in the model and radians in shaders. The Euler order is `'YXZ'` (pan, tilt, roll), as for the film camera. In three r128, `Euler(x = pitch, y = yaw, z = roll, 'YXZ')` gives `R = Ry(yaw)·Rx(pitch)·Rz(roll)`.
- Elementary rotations (right-handed, column vectors):
  ```
  Ry(a) = [[ cos a, 0, sin a], [0, 1, 0], [-sin a, 0, cos a]]
  Rx(a) = [[1, 0, 0], [0, cos a, -sin a], [0, sin a, cos a]]
  Rz(a) = [[cos a, -sin a, 0], [sin a, cos a, 0], [0, 0, 1]]
  ```
- **The equirect convention is three's own.** r128 `ShaderChunk.common` defines `equirectUv(dir)`: `u = atan(dir.z, dir.x)·(1/2π) + 0.5` and `v = asin(clamp(dir.y, −1, 1))·(1/π) + 0.5`. The r128 PMREM equirect shader and `WebGLCubeRenderTarget.fromEquirectangularTexture` use the same function, so the projection, the car reflections and any later use of `EquirectangularReflectionMapping` agree.
  - In this canonical frame the image centre (u = 0.5) is +X, u = 0.75 is +Z, u = 0.25 is −Z, and the seam (u = 0/1) is −X.
  - v = 1 is up.

### 6.2 Environment orientation

The user's orientation `(ψ yaw, θ pitch, φ roll)` places the image centre in the direction a film camera with that pan and tilt would look. At (0, 0, 0) the image centre faces −Z, which is the wall as seen from a projection point in front of it. In formulas:

```
R_env = Ry(ψ) · Rx(θ) · Rz(φ) · Ry(+π/2)          canonical env direction  ->  world direction
M     = R_envᵀ = Ry(−π/2) · Rz(−φ) · Rx(−θ) · Ry(−ψ)   world direction  ->  canonical env direction   (uniform uWorldToEnv)
```

`Ry(+π/2)` maps canonical +X to world −Z. It is the baseline that makes yaw 0 put the HDRI centre on the wall.

Verified mapping at (0, 0, 0), from `M = Ry(−π/2)`, which maps `(x, y, z) → (−z, y, x)`:

| World direction `d` | Meaning (viewer in front of the wall) | `c = M·d` | u | v | Image region |
|---|---|---|---|---|---|
| (0, 0, −1) | toward the wall | (1, 0, 0) | 0.50 | 0.5 | centre |
| (−1, 0, 0) | wall left | (0, 0, −1) | 0.25 | 0.5 | left of centre |
| (1, 0, 0) | wall right | (0, 0, 1) | 0.75 | 0.5 | right of centre |
| (0, 0, 1) | behind the viewer | (−1, 0, 0) | 0 ≡ 1 | 0.5 | seam |
| (0, 1, 0) | up | (0, 1, 0) | any | 1.0 | top row (sky) |
| (0, −1, 0) | down | (0, −1, 0) | any | 0.0 | bottom row |

Image left-to-right maps to wall left-to-right (it is not mirrored), as when standing inside the panorama.
- **Yaw +90°** sends the image centre to world −X, the same direction as a camera with pan (`rotY`) +90°.
- Positive pitch raises the image centre.
- Positive roll turns the horizon counter-clockwise as seen from the front: the left horizon point goes down.

**Closed form for pitch = roll = 0** (used as the independent harness oracle, 8.2): with `θ_d = atan2(d.x, −d.z)` (0 toward −Z, positive toward +X),
```
u = frac(0.5 + (θ_d + ψ) / 2π),     v = 0.5 + asin(d.y / |d|) / π
```

`EquirectProjection.worldToEnv(yawDeg, pitchDeg, rollDeg, out)` writes M into `out` (a `number[9]` or `Float64Array(9)`) in column-major order, the layout of THREE's `Matrix3.elements`, and returns `out`. The shader uniform is a `THREE.Matrix3` created once, refreshed with `fromArray(out)`. Callers detect a rotation change by comparing the three angles as numbers; there is no string key, so the per-frame path allocates nothing.

### 6.3 Texel addressing and image row order (the flipY check)

| Loader (r128) | What we take from it | Row order of its data | Our handling |
|---|---|---|---|
| `RGBELoader.parse` (type `UnsignedByteType`, the default) | RGBE bytes | top-down (file scanline order for `-Y H +X W`, the only orientation r128 accepts). Note: `RGBELoader.load()` would set `flipY = true`, but `parse()` sets nothing. | CPU decode to linear, area resample, half-float pack, flip to bottom-up |
| `EXRLoader.parse` (`setDataType(HalfFloatType)`, T17) | half floats, RGBA | already bottom-up: r128 writes row `height − 1 − y`, and its `load()` sets `flipY = false` | Resample only (drop alpha) |
| `createImageBitmap` (resized) + canvas `getImageData` | sRGB RGBA bytes | top-down | Flip |

All GPU textures are created by `HdriEnvironment` from bottom-up data with `flipY = false`.
- Row 0 is therefore v ≈ 0 (the bottom, the nadir), and the last row is v ≈ 1 (the zenith).
- This matches `equirectUv` (up gives v = 1). It is identical to what `TextureLoader`/`RGBELoader.load` produce with `flipY = true` from top-down images.
- Loader-specific flipY flags never reach a texture.

GPU sampling uses `LinearFilter`, `wrapS = RepeatWrapping`, `wrapT = ClampToEdgeWrapping` and no mipmaps. In WebGL 2, half-float (`RGB16F`) and `RGBA8` textures are filterable in core, and non-power-of-two textures may repeat. Bilinear sampling happens at `x = u·W − 0.5`, `y = v·H − 0.5`; x wraps across the seam (no seam line), and y is clamped at the poles.
- Without mipmaps, `atan` has no derivative discontinuity, so no seam artefact appears.
- The trade-off is minification shimmer on distant walls. T18's quality select mitigates it (Q9).

The CPU twin `sampleEquirect(img, u, v)` implements exactly this bilinear rule for both pixel kinds. It decodes each texel (half → float, or sRGB → linear) before interpolating. For sRGB the GPU filters the encoded bytes and decodes afterwards; the difference is below one 8-bit level for the panorama sizes used and is covered by the bake tolerance (AC 23).

Inverse (used by the rotation pass, the thumbnail and the tests):

```
φ = (u − 0.5)·2π,  θ = (v − 0.5)·π
c(u, v) = (cos θ · cos φ,  sin θ,  cos θ · sin φ)        // u = 0.5 -> +X; u = 0.75 -> +Z
```

### 6.4 Projection of one wall point

For a wall fragment at world position `X`. The vertex shader computes `modelMatrix · position`, so panel-mode plane transforms, spec 02 offsets and the spec 03 stage translation are all included:

```
d0 = X − P;   if dot(d0, d0) < 1e-10 → d = (0, 0, −1) else d = d0 / |d0|
c  = normalize(M · d)
(u, v) = equirectUv(c)
L  = sampleEnv(u, v)                              // linear radiance (hardware bilinear)
     decode: 0 linear (half float) → t.rgb;  1 sRGB (LDR) → sRGBToLinear(t).rgb   (r128 encodings_pars_fragment)
E  = L · 2^EV
D  = toneMap == ACES ? ACES_r128(E) : clamp(E, 0, 1)   // display-referred linear
D' = D · mix(1, sRGBToLinear(tile(uv · tileRepeat)).rgb, ledMask)    // ledMask = 0 until T19
out = LinearTosRGB(D')                                // r128 formula (pow 0.41666 · 1.055 − 0.055; 12.92 below 0.0031308)
```

`ACES_r128` copies r128's `ACESFilmicToneMapping` with `toneMappingExposure = 1` (three.js, MIT; attributed in the file):

```
c *= 1 / 0.6
c  = ACESInputMat · c        rows: (0.59719, 0.35458, 0.04823), (0.07600, 0.90834, 0.01566), (0.02840, 0.13383, 0.83777)
c  = RRTAndODTFit(c)         a = c·(c + 0.0245786) − 0.000090537;  b = c·(0.983729·c + 0.4329510) + 0.238081;  c = a / b
c  = ACESOutputMat · c       rows: (1.60475, −0.53108, −0.07367), (−0.10208, 1.10813, −0.00605), (−0.00327, −0.07276, 1.07602)
c  = clamp(c, 0, 1)
```

The GLSL `mat3(...)` literals in r128 are given **column by column**. The rows above are their transposes, written for the JS twin.

The **projection ignores UVs**. It is identical in combined, section and panel modes, and spec 04 UV edits do not affect it. Only the LED mask (T19) uses UVs.

### 6.5 Shaders

r128 compiles `ShaderMaterial`s as GLSL ES 3.00 on WebGL 2 (it adds the `#version 300 es` prefix and the `texture2D`/`varying` compatibility defines), and HDRI content requires WebGL 2 (3.6). The shaders below are nevertheless written so that they would also be valid GLSL ES 1.00.

(a) Wall projection (`HdriProjectionMaterial`; a `ShaderMaterial` in r128 gets `encodings_pars_fragment` in its prefix, verified in `WebGLProgram.js`):

```glsl
// vertex
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
```
```glsl
// fragment
#include <common>                               // PI, RECIPROCAL_PI2, saturate, equirectUv (r128)
uniform sampler2D uEnv;      uniform int uEnvEncoding;      // 0 linear (half float), 1 sRGB (8-bit)
uniform mat3 uWorldToEnv;    uniform vec3 uProjPoint;
uniform float uExposure;     uniform int uToneMap;          // uExposure = 2^EV; 0 clip, 1 ACES
uniform sampler2D uLedTile;  uniform vec2 uTileRepeat;  uniform float uLedMask;
varying vec3 vWorldPos;      varying vec2 vUv;
${ColorManagement.ACES_GLSL}                    // vec3 acesR128(vec3 c), the 6.4 formula
vec3 sampleEnv(vec2 uv) {
  vec4 t = texture2D(uEnv, uv);                 // hardware bilinear (LinearFilter)
  return (uEnvEncoding == 1) ? sRGBToLinear(t).rgb : t.rgb;
}
void main() {
  vec3 d0 = vWorldPos - uProjPoint;
  vec3 d = dot(d0, d0) < 1e-10 ? vec3(0.0, 0.0, -1.0) : normalize(d0);
  vec2 uv = equirectUv(normalize(uWorldToEnv * d));
  vec3 e = sampleEnv(uv) * uExposure;
  vec3 disp = (uToneMap == 1) ? acesR128(e) : clamp(e, 0.0, 1.0);
  vec3 tile = sRGBToLinear(texture2D(uLedTile, vUv * uTileRepeat)).rgb;
  disp *= mix(vec3(1.0), tile, uLedMask);
  gl_FragColor = LinearTosRGB(vec4(disp, 1.0));
}
```

With spec 01 F1-5 (FrontSide), back faces are culled and the back shell shows the cabinet back. Before F1-5 (DoubleSide), back faces show the projection too. That is accepted (Risk R7).

(b) Backdrop dome. It uses the same uniforms and only the view direction, so it sits at infinity from any viewpoint. The camera is at the sphere's centre and sees only its inside, so the material is **`side: THREE.BackSide`**. With the default `FrontSide` the dome would be culled and invisible; three's own background box uses `BackSide` for the same reason. The dome mesh keeps the identity transform, so `position` is already a world direction:

```glsl
// vertex: unit sphere, translation removed, depth at the far plane
varying vec3 vDir;
void main() {
  vDir = position;
  vec3 viewDir = (viewMatrix * vec4(position, 0.0)).xyz;   // w = 0: rotation only (three's transformDirection pattern)
  vec4 p = projectionMatrix * vec4(viewDir, 1.0);
  gl_Position = p.xyww;
}
// fragment: as (a) with d = normalize(vDir) and no LED mask
```

Revision 2 wrote `mat3(viewMatrix) * position`. Constructing a matrix from a matrix is "reserved for future use" in GLSL ES 1.00, and ANGLE rejects it there. The `w = 0` form is valid in both versions.

**Parity check:** at a wall pixel seen from P, `normalize(X − P)` equals the view direction. With the projection point on the camera, the wall and the dome are therefore continuous across the wall edge in pilot mode and in the preview (AC 9).

(c) Passes (T12, T12b; `EnvironmentBuilder`). Each is a full-screen quad, a `ShaderMaterial` and an `OrthographicCamera(−1, 1, 1, −1, 0, 1)`, rendered into a half-float `WebGLRenderTarget` between frames. They need `floatTargets` (`EXT_color_buffer_float`); without it, only the `studio` source is offered (3.6).
- **rotate-to-world (T12):** `c = uWorldToEnv · dirFromUv(vUv)`; `gl_FragColor = vec4(sampleEnv(equirectUv(c)), 1.0)` into a 1024×512 HalfFloat RGBA target (`encoding = LinearEncoding`, `LinearFilter`).
- **cube-to-equirect (T12b):** `gl_FragColor = vec4(sRGBToLinear(textureCube(uCube, dirFromUv(vUv))).rgb, 1.0)` into a 512×256 HalfFloat target. The cube stores display values. A render-target cube is sampled with the world direction unflipped, because `WebGLCubeRenderTarget` sets `_needsFlipEnvMap = false`.
- **Why not `PMREMGenerator.fromCubemap(cubeRT.texture)` directly:**
  - the r128 PMREM cubemap shader always samples `vec3(−dir.x, dir.yz)`, which is right for image cube textures but mirrors render-target cubes;
  - it also cannot know that the stored values are display-encoded.

  Going through an equirect sidesteps both problems, and both environment sources then share `pmremFromEquirect`.

### 6.6 Car environment pipelines (T12, T12b)

| Source | Pipeline | Car output transform | Rebuilt when |
|---|---|---|---|
| `hdri` (location, T12) | the projection texture → rotate-to-world (M) → linear 1024×512 → `pmremFromEquirect` | `LinearTosRGB(toneMap(radiance · 2^EV))` with the wall's EV and tone map, so the car and the wall share one camera transform | HDRI replaced; rotation changed (leading + trailing throttle, 100 ms); context restored |
| `stage` (LED volume, T12b) | `CubeCamera(0.05, 200)` at the car's Box3 centre, layer mask `DEFAULT` (5.1), the car hidden, inside `withPassHidden` → RGBA8 cube (display values) → cube-to-equirect → 512×256 half float → PMREM | `LinearTosRGB(clip(radiance))`. The wall emits display-referred light, so a mirror reflection of the wall matches the wall pixel (AC 18). | Dirty on `WALL_REBUILT`, on a `hdriView.version` change, on a car or person pose or visibility change, and on context restore. **Motion gating** (`CarModelController.tick`): a trailing capture 150 ms after the last change. During continuous change (pilot fly/look, gizmo drags, camera-follow): at most one capture per 500 ms in combined/section mode and **none** in panel mode. |
| `studio` (T12) | `pmrem.fromScene(new THREE.RoomEnvironment(), 0.04)` (r128 `examples/js/environments`), built once in the background (`ensureStudio`) | ACES, EV 0 | once (cached; again after a context restore); the punctual lights stay on until it is ready |

`scene.environment` is used, as the task requires. In r128 it applies only to `MeshStandardMaterial` and `MeshPhysicalMaterial` (`WebGLPrograms`: `material.isMeshStandardMaterial ? scene.environment : null`), so legacy materials are unaffected.

### 6.7 Wall coverage on the thumbnail (T20)

- **Outline.** Per section, the outline is the bottom edge (y = 0) over `edges[0..cols]`, followed by the top edge (y = rows·panelH) backwards. These come from `wallController.currentLayout` (stage frame, 07 C60; during a spec 02 transform-only drag it already holds the dragged geometry), with spec 02 post-transforms applied to each point.
- **Projection and seams.** Each point is projected with 6.4 to (u, v). The polyline is split wherever `|u_(i+1) − u_i| > 0.5` (a seam crossing), and drawn on the 256×128 thumbnail with v flipped for the canvas (`y = (1 − v)·128`). A small cross marks the image-centre direction.
- **Implementation.** It is pure and lives in `EquirectProjection.wallCoverage(layout, P, M, out)`. It writes into a reused `CoverageBuffer {count, lines: Float32Array[], lengths: Int32Array}`, whose arrays grow on demand and are never shrunk, so a steady state allocates nothing.
- **When it runs.** `HdriController` computes it only while `setCoverageWanted(true)` holds (the `#hdri-thumb` IntersectionObserver reports the canvas visible), and only when it emits `HDRI_PROJECTION_CHANGED` (at most 10 Hz for follow emissions).
- **Cost:** about 2·Σ(cols + 1) projections, under 1 ms for 200 sections.

### 6.8 Single-renderer frame

Deleted (07 C12). Spec 07 6.1 (`PreviewPass.render`) is the algorithm. Feature 5 adds nothing to it. The projection is a wall material (`DEFAULT`) and the dome is on `ENVIRONMENT`, so both appear in the preview and in stills (mask `DEFAULT | ENVIRONMENT`), while the marker (`HELPERS`) never does.

### 6.9 Decoding, limits and memory

**Device caps** (`computeDeviceCaps(renderer, nav)`, computed once in `App.init` after the renderer exists, read through `getDeviceCaps()`):
```
isIOS          = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
lowMemory      = (nav.deviceMemory ?? 8) <= 4 || isIOS
isWebGL2       = renderer.capabilities.isWebGL2
maxTextureSize = renderer.capabilities.maxTextureSize
floatTargets   = isWebGL2 && renderer.extensions.has('EXT_color_buffer_float')        // T12
maxSourceHdr   = lowMemory ? 4096×2048 : 8192×4096                                       (HDRI_LIMITS)
maxSourceLdr   = lowMemory ? 8192×4096 : 16384×8192
maxQuality     = lowMemory || maxTextureSize < 8192 ? (maxTextureSize >= 4096 ? '4k' : '2k') : '8k'    // T18
```
iOS limits a canvas to 16.7 MP. The largest canvas this feature creates there is the Wt×Ht LDR canvas (4096×2048 = 8.4 MP), which is below that limit.

**Order of checks.** Nothing larger than 256 KB is read before step 4, apart from 4-byte JPEG segment headers:
1. The file size from `File.size` is checked against `maxFileBytes[format-by-extension]`. It is re-checked with the sniffed format in step 3.
2. `head = file.slice(0, 262144)`; `sniffFormat(head)`.
3. Dimensions come from the header:
   - Radiance: `parseRadianceHeader`.
   - PNG: `readPngSize`, IHDR bytes 16-23.
   - JPEG: `readJpegSize`. If the first SOF lies beyond the probe (large XMP, MPF or extended-XMP APP segments are common in 360-camera files), the result is `{needsWalk}`. `walkJpegSegments` then continues with 4-byte reads, up to 512 segments. If that also fails, `decoder.measureLdr(file)` decodes once inside the browser to read the size (the file-size check has already passed; the JS heap is not used).
   - EXR (T17): `readExrHeader` (`dataWindow`, `compression`, tiled 0x200, deep 0x800, multipart 0x1000).

   `checkHdriLimits` then rejects oversized images (`maxSourceHdr` for HDR/EXR, `maxSourceLdr` for LDR) and, in T17, B44/B44A, tiled, deep and multipart EXRs. All of this happens **before any pixel allocation in the JS heap**.
4. Read the full buffer, hash it (`digest`), and decode.

**Working size.**
- MVP: `Wt = min(maxTextureSize >= 4096 ? 4096 : 2048, W)`.
- T18: `Wt = min(qualityWidth[quality], qualityWidth[maxQuality], maxTextureSize, W)`.

In both cases `Ht = round(Wt · H / W)`. There is no power-of-two rounding (WebGL 2 repeats non-power-of-two textures).

**Area resample** `resampleArea(src, W, H, Wt, Ht)` (HDR and EXR) is separable and box-weighted, with fractional footprints:
- each output texel averages the source texels it covers, weighted by overlap, in **linear** space;
- RGBE is decoded per source texel as `(byte / 255) · 2^(e − 128)` (r128's `RGBEByteToRGBFloat`);
- accumulation is in Float64 per output row, so the extra memory is O(row);
- it yields to the event loop every 64 output rows (`await` on a resolved promise), so progress can repaint (R4).

**Half floats.** `geometry/` may not import THREE (ARCHITECTURE 1.3), so `EnvImageOps.createFloatToHalf()` returns a THREE-free `(x) => uint16` function. It is a port of r128 `DataUtils.toHalfFloat` with the same bit algorithm and rounding (sign; exponent below 103 → signed zero; above 142 → Inf/NaN; below 113 → a denormal with rounding; otherwise rebias, plus rounding on the extra mantissa bit). It is attributed (MIT). Its scratch `Float32Array`/`Int32Array` views live in the closure, created once per decode, so there is no module-level mutable state (ARCHITECTURE 1.5). `halfToFloat` is ours (r128 has no `fromHalfFloat`). The unit test compares `floatToHalf` with r128 outputs that were computed once and pasted as plain numbers (8.1).

**LDR decode: the `createImageBitmap` fallback chain.** Engines that lack an option value reject with a `TypeError` instead of ignoring it, so each step is a separate `try`:
1. `createImageBitmap(blob, {resizeWidth: Wt, resizeHeight: Ht, resizeQuality: 'high', imageOrientation: 'from-image', colorSpaceConversion: 'default'})`.
2. On failure: `createImageBitmap(blob, {resizeWidth: Wt, resizeHeight: Ht})`.
3. On failure: `createImageBitmap(blob)` (a full-size bitmap inside the browser's decoder).

Whichever succeeds, if `bitmap.width !== Wt || bitmap.height !== Ht` (an engine ignored the resize), it is drawn with `drawImage(bitmap, 0, 0, Wt, Ht)` and `imageSmoothingQuality = 'high'` onto the Wt×Ht canvas. Then `bitmap.close()`. If step 3 fails too, the error is `Could not read the image (<reason>)`.

The browser's resize averages in sRGB space. That darkens high-contrast detail slightly; it is acceptable for LDR previews and avoids a full-size canvas.

**Radiance `EXPOSURE=` header: ignored on purpose.** r128 returns it as `result.exposure` (only non-negative decimals parse; the default is 1). It records a scale applied when the file was written. Dividing by it would make the absolute level "physically" right, but the absolute level of HDRIs varies by orders of magnitude anyway; the EV slider and Auto EV handle that. three's own loaders, and most viewers, ignore the header too. A unit test shows that a file with `EXPOSURE=2` renders identically to the same file without it.

**Auto EV.** `logAverageLuminance` is computed once per decode on a 512×256 grid of texel centres (`sampleEquirect`):
```
L    = 0.2126·R + 0.7152·G + 0.0722·B                      (linear; LDR goes through sRGBToLinear)
w    = cos(latitude) = cos((v − 0.5)·π)                    (solid-angle weight: equirect over-samples the poles)
Lavg = exp( Σ w·ln(1e-4 + L) / Σ w )
EV   = clamp( round(10 · log2(0.18 / max(Lavg, 1e-6))) / 10, −10, 10 )
```
`maxLuminance` (the largest L on the same grid) is also kept, for the file-info tooltip.

**GPU formats:**
- HDR/EXR: half-float RGB (`RGB16F`), `unpackAlignment = 1` (a row of an odd width is not 4-byte aligned), `uEnvEncoding = 0`.
- LDR: RGBA8 with `uEnvEncoding = 1`.

**Transient CPU peak per format** (JS heap; the file buffer is released before the output is allocated):

| Format | Source at the default cap, MVP working size (4K) | T18: same source, 8K quality | Low-memory cap |
|---|---|---|---|
| `.hdr` (8192×4096) | max(file ≤ 100 MB + its SHA-256 copy, file + RGBE 128 MiB, RGBE 128 MiB + half RGB output 48 MiB) ≈ **230 MiB** | RGBE 128 MiB + output 192 MiB ≈ **320 MiB** | 4096×2048: ≈ 32 + 48 MiB plus the file |
| `.exr` (T17, 8192×4096) | file ≤ 100 MB + r128 `EXRLoader` output (always 4 channels: W·H·8 = **256 MiB**) ≈ 360 MiB; then 256 + 48 MiB | 256 + 192 MiB ≈ **450 MiB** (8K EXR is therefore `maxQuality`-gated to devices with `deviceMemory > 4`) | 64 MiB + 48 MiB plus the file |
| `.jpg`/`.png` (up to 16384×8192) | browser decode (outside the JS heap; up to W·H·4 = 512 MiB at the cap) + a Wt×Ht canvas of 32 MiB + `ImageData` 32 MiB + output 32 MiB | 8K: canvas, `ImageData` and output 128 MiB each | cap 8192×4096: browser decode up to 128 MiB; ≤ 32 MiB each for our buffers |

**GPU memory** (estimates; a driver may pad RGB to RGBA):

| Configuration | Projection texture | Reflections | Total |
|---|---|---|---|
| MVP, 4K | 48-64 MiB | - | about 64 MiB |
| MVP on a small GPU (2K) | 12-16 MiB | - | about 16 MiB |
| T18, 8K | 192-256 MiB | - | about 256 MiB (needs confirmation) |
| T12, adds | - | rotated 1024×512 half RGBA (4 MiB) + PMREM (about 6 MiB) | + 10 MiB |
| T12b, adds | - | cube 1.5 MiB + equirect 1 MiB + PMREM about 6 MiB | + 8.5 MiB |

The retained CPU image (`cpuImage`) is the projection texture's own `image.data`, which three keeps anyway, so the bake costs no extra memory.

### 6.10 The car asset (T10, T11)

- **Manifest** (`assets/models/cars/manifest.json`): `{default, entries: [{id, name, file, sha256, author, licence: "CC0-1.0"|"CC-BY-4.0", attribution, source, forward: "+Z"|"-Z"|"+X"|"-X", up: "+Y", lengthM, materials: {paint: string[], glass: string[], tyre: string[]}, bytes, triangles, paintTriangles}]}`.
  - `attribution` is required for `CC-BY-4.0` entries (the credit line `#car-model-status` shows while the model is in use, and the line in `assets/LICENSES.md`); it is `null` for CC0.
  - `tyre` materials keep their authored values (never recoloured); the list exists so the quality bar (AC 33) can check the split.
  - `id` matches `/^[a-z0-9][a-z0-9-]{0,63}$/` and is the value persisted as `props.car.model.asset_id`.
  - `default` must equal `DEFAULT_CAR_MODEL_ID` (unit test).
  - `sha256` is computed by the T10 tooling. It is checked only in that tooling's test, so the app never hashes bundled files at runtime.
- **Normalisation at load:**
  1. rotate so that `forward` maps to +X (the legacy car's front, headlights at +X, 2955-2961);
  2. scale uniformly so the Box3 length along X equals `lengthM` (default 4.5, the legacy body length);
  3. translate so the footprint centre is at x = z = 0 and min.y = 0.

  The result is wrapped in a Group whose transform `PropView.updateTransform` writes. The legacy semantics are kept: position (posX, 0, posZ), `rotation.y`, uniform scale.
- **Materials:**
  - every `MeshStandardMaterial`/`MeshPhysicalMaterial` is replaced by a `MeshPhysicalMaterial` that copies map, normalMap and roughness or metalness from the source, then `patchSceneReferred(material, colorUniforms)`;
  - paint materials (from the manifest) get the finish preset and `color = srgbHexToLinearColor(paint)` (r128 `Color.convertSRGBToLinear`);
  - glass gets `{color: #0e1216 (linear), metalness 0, roughness 0.05, transparent: true, opacity: 0.35, clearcoat 1}`.

| Finish | metalness | roughness | clearcoat | clearcoatRoughness | Colour |
|---|---|---|---|---|---|
| `gloss` | 0.6 | 0.35 | 1.0 | 0.03 | paint |
| `satin` | 0.3 | 0.6 | 0.3 | 0.35 | paint |
| `chrome` | 1.0 | 0.05 | 0.0 | 0.0 | `#ffffff` (paint ignored); this is a mirror for checking reflections |

- **Single-material assets.** If the manifest lists no `paint` material (Kenney-style single-atlas assets), the finish applies to every material, and `#car-paint` is disabled ("This model has no separate paint material").
- **Budget.** At most 2.5 MB per `.glb`, 150k triangles and 2 textures of at most 2048². No Draco, Meshopt or KTX2, so no extra decoders are needed. The asset is lazy-loaded on first use and served from the same origin.
- **Asset preparation (T10):**
  1. Download from the source.
  2. Open in Blender: separate the body, glass and tyre materials; shade smooth with auto-smooth 30° (faceted low-poly bodies give broken reflections).
  3. Export `.glb` (glTF 2.0 binary, no compression).
  4. Run the Khronos glTF-Validator. A user reported validator errors on older Kenney glTF exports; re-exporting from FBX/OBJ through Blender avoids them.
  5. Compute `sha256`, and record the source URL, author, licence, attribution, size and triangle counts in the manifest and in `assets/LICENSES.md`.
  6. Run `tools/check-car-asset.mjs` (T10): it reports the total and per-material triangle counts, the material split and the share of paint-material vertex positions that carry more than one normal, and fails on any breach of the quality bar (AC 33).
  7. Render the candidates side by side (same HDRI, camera and `gloss` finish, with the legacy box car for scale) and attach the image to the T10 pull request; the owner signs it off before T11 starts (AC 33, Q2, Q3).

**Licence verification (web, 2026-10-16).**

| Source | Licence (as stated by the source) | Car models | Formats | Verdict |
|---|---|---|---|---|
| Kenney "Car Kit", kenney.nl/assets/car-kit | "Creative Commons CC0" (kenney.nl); "CC0 1.0 Universal" (kenney-assets.itch.io/car-kit) | yes (sedan, van, ambulance and more, per listings) | OBJ, FBX, glTF (itch.io listing) | **Fallback** (small; verify the bundled LICENSE file when downloading). Stylised and single-atlas, so it passes AC 33 only if the owner relaxes the bar (Q3) |
| Quaternius "Lowpoly Cars", quaternius.itch.io/lowpoly-cars, opengameart.org/content/lowpoly-cars | CC0 1.0 (the itch.io page links the deed; OpenGameArt lists CC0). One model (Cop SUV) is Patreon-gated. | yes | FBX, OBJ, Blend (no glTF; convert in Blender) | Alternative |
| Khronos glTF-Sample-Assets "CarConcept", github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept | "Creative Commons Attribution 4.0 International"; model and textures credited to Eric Chadwick, "© 2024, Darmstadt Graphics Group GmbH"; it started from a public-domain Sketchfab model by Unity Fan | yes (one concept car with three paint variants, curved body panels with clear-coat paint, glass with transmission, separate wheels and tyres) | glTF 2.0 (9.8-11.7 MB as published; uses `KHR_materials_clearcoat`, `_emissive_strength`, `_iridescence`, `_transmission`, `_variants` and `KHR_texture_transform`; Draco and KTX2 only in its compressed variant) | **Recommended higher-fidelity candidate** (Q3). T10 must bring it inside the budget: keep one paint variant, drop iridescence and the variants extension, re-bake to at most two 2048² textures, and remove the Khronos logo decals (trademarks are not covered by CC BY). Its triangle count is not published, so T10 measures it against AC 33. Credit: "CarConcept by Eric Chadwick, © 2024 Darmstadt Graphics Group GmbH, CC BY 4.0". |
| Poly Haven, polyhaven.com/license | "Our assets are all licensed as CC0." No credit needed | **no car model found** | - | Use for the **sample HDRI** (Q7, T21), not for the car |
| three.js `examples/models/gltf/ferrari.glb` | **not verified** (the model licence is separate from three's MIT code licence) | yes | glb, Draco-compressed per its example | **Do not ship** unless the licence is verified (and it needs DRACOLoader) |

CC0 covers copyright, not trademarks. Avoid models that replicate a real manufacturer's design or badges.

### 6.11 The U3b port (after Feature 5 ships; spec 07 C13)

Spec 07 recommends staying on r128 through Feature 5 (07 Q1). This section is the specification of 07's step **U3b**, which runs after 07 U3 (colour management on) and is owned with Feature 5. It replaces these r128 parts:

| r128 part | U3b replacement | Code affected |
|---|---|---|
| Classic loader scripts with SRI | 07's `vendor/three-addons.js` switches its loader factories to `import('three/addons/loaders/HDRLoader.js')` (named `RGBELoader.js` before r180), `EXRLoader.js`, `GLTFLoader.js` and `environments/RoomEnvironment.js` (07 U1). F5 code is unchanged, because it only calls the factories. | none in F5 |
| Option L (`patchSceneReferred`, the r128 chunk anchors) | Option G (5.7): `renderer.toneMapping = ACESFilmicToneMapping` (or `NoToneMapping` for the `stage` source's clip transform) and `toneMappingExposure = 2^EV` while the car has an environment. Every legacy, LED and helper material gets `toneMapped: false` (07 5.7.2 "(F5)" row). The projection shader ends with `#include <colorspace_fragment>` instead of `LinearTosRGB`. | `ColorManagement`, `HdriProjectionMaterial`, `GltfCarPropView`, `CarModelController` |
| Rotate-to-world pass | `scene.environmentRotation` (r162+), set from the Euler of `R_env`. A unit test compares one reflected direction with the 6.2 oracle. | `EnvironmentBuilder`, `HdriEnvironment` |
| Cube-to-equirect pass and the `fromCubemap` mirror workaround | `pmrem.fromCubemap(cubeRT.texture)` directly (fixed in later releases; render targets hold linear values under colour management) | `StageReflectionProbe` |
| `RGBELoader` `UnsignedByteType` + CPU RGBE decode | the loader's `HalfFloatType` default (r131+); the CPU path keeps only the area resample | `HdriDecoder` |
| `#parseRgbe`'s `console.error` capture | re-checked against the target release's loader (current `HDRLoader` throws on bad data); kept only if it still logs | `HdriDecoder` |
| `encoding` / `LinearEncoding` / `sRGBEncoding` | `colorSpace` (`LinearSRGBColorSpace`, `SRGBColorSpace`) | `HdriEnvironment`, `EnvironmentBuilder` |

Everything else is identical in both releases: the domain, the schema, the UI, the projection maths, the harness oracle and the bake. Spec 07 sizes U3b as M.

### 6.12 Bake (T13; implements spec 04's `hdriBaker` contract; requires spec 04 UVs and glTF `TEXCOORD_0`)

`HdriBakeService` implements spec 04's provider exactly, reusing spec 04's pure functions. It never re-derives the inverse mapping, and it never applies a post-transform itself:

```
hasHdri() = env.ready
bakeSection(sectionId, Wt, Ht, plan) -> HTMLCanvasElement | null:        // spec 04 5.3 / 6.3 "Spec 05 contract"
  if (!env.ready || !plan.valid) return null
  sl = wallController.currentLayout section with id sectionId           // STAGE frame (spec 03, 07 C60): P_hdri is stored in
                                                                        // the stage frame; ProjectIO's export layout (E) would
                                                                        // sample every texel P.y too low
  P, M, EV, toneMap = the current resolved projection state (point, worldToEnv, exposure, effective tone map)
  canvas Wt×Ht, top-left origin; img = ctx.createImageData(Wt, Ht); tmp = [0, 0]
  for y in 0..Ht−1, x in 0..Wt−1:
    u' = (x + 0.5)/Wt;  v' = 1 − (y + 0.5)/Ht                         // final UV, three/OBJ convention (glTF t = 1 − v is the exporter's)
    if (plan.rect) { u' = (u' − plan.rect.offsetU) / plan.rect.widthU; v' = v' / plan.rect.heightV }   // undo the atlas rect
    [u_b, v_b] = plan.transform ? invertUv(plan.transform, plan.W, plan.H, u', v', tmp) : [u', v']     // spec 04 5.3 signature
    if (u_b, v_b) ∉ [0,1]²: write the background (0, 0, 0, 255); continue                             // not covered by the section
    X = wallPointFromBaseUv(sl, u_b, v_b)     // spec 04 6.10: piecewise-flat like the mesh, with sl.postTransform ALREADY applied
    rgb = HdriBake.texel(X, P, M, env.cpuImage, EV, toneMap)           // 6.4 with sampleEquirect (the GPU's bilinear rule)
    write round(255 · LinearTosRGB(rgb)), alpha 255
  return canvas
```

There is deliberately **no** `transformPoint(sl.postTransform, X)` step. Revision 2 applied the spec 02 offset a second time, which baked every offset section from the wrong position. Its unit test ("postTransform is applied") would have approved that bug; 8.1 replaces it.

- **UV viewer** (spec 04): `UvViewModel` calls `bakeSection` with its own background size and the section's current plan. Spec 04's fallback to the checker background applies while `hasHdri()` is false.
- **Export size:** `Wt × Ht = plan.sourceW × plan.sourceH` from the section's **export plan** (density k = 1: one texel per LED source pixel). It is swapped for quarter-turn plans with `sourceRotated` (04 6.4), and is **not** `cols·ledX × rows·ledY`. With the identity transform, the texel centres are the LED centres.
- **Which textures** (spec 04 6.3 and 6.4; the domain setting `wall.uvLayout.combined`, persisted as `uv.combined_layout`):

| Mesh mode | UV setting | HDRI bake output |
|---|---|---|
| `section` | - | one PNG per section, `textures/<sectionTextureName>_HDRI.png` |
| `combined` | `per-section` (07 default) | one PNG per section, one material slot per geometry group (as spec 04's per-section combined layout) |
| `combined` | `atlas` | one atlas PNG, `textures/hdri_atlas.png`, of the atlas LED size (`atlas.totalLedX × atlas.totalLedY`, k = 1). For each atlas entry, the texels inside its rect are baked with that section's plan (rect undone first); all others are background. |
| `panel` | `uv.panel_uvs = 'section'` | one PNG per section (the panels sample their section's texture, 04 6.4) |
| `panel` | `uv.panel_uvs = 'panel'` (legacy per-panel UVs) | not available: `#export-texture-content` disables `hdri` with the title "Set Panel UVs to Section (UV settings) to bake HDRI textures in panel mode." |

- **Async variant.** Exports use `bakeSectionAsync(...)`, the same per-texel function, which yields every 1 M texels and reports progress.
- **Invalid counts.** Non-integer counts (B-L15, `plan.valid === false`) skip the section with a warning.
- **Throughput:** about 15-25 M texels per second in V8.
- **Limits:** at most 16384 px per side and 64 MP per image (the B-L4 lesson). Beyond that the message is `HDRI bake too large (<w>×<h>); lower the LED resolution or export per section.`
- **Pixel map** (7.4): it is in **LED space**, independent of UV edits. Each section's block (`cols·ledX × rows·ledY`) is baked with the identity plan (`transform: null, rect: null`). Blocks are placed side by side and bottom-aligned at 1 px per LED: the `panel-ids.png` arrangement (`computeAtlas`), but at `pxPerLed = 1`.

### 6.13 Performance

Reference machine (as in spec 07 5.9.5): a laptop with an integrated GPU of the Intel Iris Xe class, Chrome stable, a 1920×1080 viewport.

| Item | Target / measurement |
|---|---|
| Projection shader | About 30 ALU and 2 texture fetches per fragment, with one program per `side` variant shared by every wall mesh. Adds at most 1 ms GPU at 1080p with the wall covering the screen (manual check, Chrome performance panel). |
| Projection-parameter change | 0 rebuilds and 0 program compiles. It takes effect on the next frame; the uniform write costs under 0.05 ms of CPU. |
| Program compiles | The first switch to HDRI compiles once (about 30-80 ms). **Every wall rebuild in HDRI mode relinks** the program: `LEDWallView.rebuild` disposes all wall materials, which drops r128's program use count to 0 and deletes it. The relink is cheap (a few ms) thanks to the browser's program binary cache, and it is included in spec 07's rebuild budget. The first display of the dome and of the marker also compiles once each. |
| Per-frame tick | `HdriController.tick(now)` (+ T11 `CarModelController.tick(now)`) allocates **nothing**:<br>- out-parameters for the point and M;<br>- rotation changes compared as three numbers (no string keys);<br>- a cached Box3;<br>- **one reused `HDRI_PROJECTION_CHANGED` payload object**, whose `point`, `rotation` and `coverage` members are refilled in place.<br>Follow emissions are limited to 10 Hz; coverage is computed only while the thumbnail is visible (T20) and only at emission time. Under 0.1 ms when nothing changes. Verified by the `hdri-controller` unit test (payload identity across emits) and a manual allocation-timeline check during a pilot fly. |
| Load of a 4K `.hdr` (24 MB) | ≤ 2.5 s to `ready` on the reference machine: header checks under 10 ms, SHA-256 about 0.05 s, decode about 0.6 s, resample and convert about 0.5 s, upload about 30 ms. |
| Stage capture (T12b) | Combined or section mode: ≤ 25 ms (6 × 256² renders, plus 2 passes, plus PMREM), at most every 500 ms during motion. Panel mode with 3,200 meshes (19k draw calls) captures only 150 ms after motion stops and on `WALL_REBUILT`, never during motion (R6). |
| Context restore | `onContextRestored` drops the GPU-only targets (reflection PMREM, rotated target, studio PMREM) and marks the probe dirty. They are rebuilt lazily on the next tick that needs them. DataTextures re-upload by themselves. |
| Memory hygiene | After 10 load-and-replace cycles and a clear, `renderer.info.memory.textures` returns to its pre-load value, excluding the studio PMREM (AC 20). |

---

## 7. Export impact

### 7.1 JSON

- **T8 (MVP)** adds the top-level `hdri` object to **every** project file, because 07's skeleton writes it always, with `source: null` when no HDRI is referenced. It also bumps the minor `version` by one. Every JSON-exporting harness scenario therefore changes by exactly those two things (RB-3). Nothing else in an existing JSON output changes.
- **T11** adds `props.car.model` in the same way, with its own minor bump (RB-5a).
- With an HDRI loaded, `hdri.source` holds the descriptor (name, bytes, sha256; `path` in ZIPs only). `assets[]` is unchanged: logos only.

### 7.2 OBJ, MTL and glTF

There is **no change unless `#export-texture-content` is `hdri`**, which exists only after T13 and spec 04's UVs. The outputs follow the table in 6.12 (per-section textures, or an atlas only in the combined `atlas` layout).
- **OBJ/MTL:** `map_Kd textures/<sectionTextureName>_HDRI.png` per section, using spec 04's de-duplicated naming (the B-L14/B-M2 fix). In the combined `atlas` layout it is `map_Kd textures/hdri_atlas.png`, which needs spec 04's OBJ atlas UVs (the B-M6 fix). In panel mode with `uv.panel_uvs = 'section'`, the panel materials reference their section's texture.
- **glTF:**
  - adds `images` (a ZIP-relative `uri`, or an embedded data URI for the standalone glTF button, encoded with the chunked base64 of the B-H3 fix), `textures`, and `samplers` `{magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071}`;
  - each material gets `pbrMetallicRoughness.baseColorTexture: {index}`, `baseColorFactor: [1, 1, 1, 1]` and `extensions: {KHR_materials_unlit: {}}` (spec 04 Q9);
  - top-level `extensionsUsed: ["KHR_materials_unlit"]`, which is **not** in `extensionsRequired`, so viewers without the extension fall back to a lit base colour;
  - it requires `TEXCOORD_0` (spec 04 / B-M7).

### 7.3 ZIP

- With `#hdri-include-in-zip` on (MVP, T8), the ZIP gets one entry:
  - path `hdri/<safeZipName(source.name)>`;
  - the original bytes, from the session blob map. `zip.file(path, blob)`: JSZip 3.10.1 accepts a Blob.
  - The ZIP JSON's `hdri.source.path` holds that path (07 4.2 `zip` variant, through the serializer's `hdriZipPath` option).
- With it off, there is no entry, and `path` is `null`.
- Opening such a ZIP (07 `ProjectSession.openFile`, D6) hands the `hdri/` entries to `hdriController.provideZipEntries` before `apply`. `restore()` then reaches `ready` with no relink (4.3 step 3).
- The bundled sample (T21) is never copied into a ZIP. It is recognised by its `sha256` on restore (4.3 step 4).
- T13: `textures/*_HDRI.png` (or `textures/hdri_atlas.png`), plus the MTL and glTF references, when the bake is selected.
- No new entry exists unless an HDRI is loaded and the toggle is on, so existing ZIP entry lists do not change. The ZIP's JSON changes per 7.1.

### 7.4 PNG (T13)

`Export HDRI pixel map` writes `<brand prefix>hdri-pixel-map.png`. Feature 6's `Brand.files` gains `hdriPixelMap`; until then the name is `hdri-pixel-map.png`.
- It uses the 6.12 pixel-map arrangement: LED space, 1 px per LED, identity plan.
- It applies the B-L4 size guard, with a user-visible message.

### 7.5 Unchanged

The safe-distance OBJ and the panel-IDs PNG are unchanged. Exports never read the scene, so the marker, the dome and the car never appear in exports. (Spec 07's optional camera stills, R4, do render the scene: they include the projection and the dome, and exclude the marker.)

---

## 8. Testing

### 8.1 Unit tests (`node --test "tests/unit/**/*.test.mjs"`)

| File | Task | Covers |
|---|---|---|
| `equirect-projection.test.mjs` | T2 | - The 6.2 table (all six directions) at yaw = pitch = roll = 0.<br>- Yaw +90 sends the image centre to −X. Pitch +30 sends it to `(0, sin 30°, −cos 30°)`. Roll +90 maps the left horizon point to straight down.<br>- `worldToEnv` is orthonormal (`MᵀM = I` within 1e-12) and equals `R_envᵀ`. It also equals THREE r128 `Matrix4.makeRotationFromEuler(new Euler(p, y, r, 'YXZ'))` composed with `Ry(π/2)` and transposed (the oracle is copied as plain numbers). It writes into `out` and returns it.<br>- The closed form of 6.2 equals `projectPoint` for pitch = roll = 0 on 1,000 random points.<br>- Round trip `dirToUv(uvToDir(u, v)) ≈ (u, v)` on a 64×32 grid away from the poles.<br>- Seam continuity: u at 0.9999 and at 0.0001 sample adjacent texels.<br>- (T20) `wallCoverage` splits at the seam and reuses its buffers (the same array objects on the second call). |
| `env-image-ops.test.mjs` | T2 | - RGBE decode equals r128 `RGBEByteToRGBFloat` on 256 random quadruples.<br>- sRGB EOTF and OETF equal the r128 GLSL formulas (pow 0.41666) within 1e-6.<br>- **AC 5 round trip:** for every 8-bit level `n` in 0..255, `round(255·LinearTosRGB(clamp(sRGBToLinear(n/255))))` equals `n`.<br>- `resampleArea` preserves the mean (energy) within 1e-9 for integer and fractional ratios.<br>- The row flip is exact.<br>- **`floatToHalf` equals the r128 `DataUtils.toHalfFloat` outputs for 64 pasted inputs:** ±0, subnormals, the smallest normal, 1, 65504, 65519, 65520, ±Infinity, NaN and random values. `halfToFloat(floatToHalf(x))` holds within the half epsilon.<br>- `sampleEquirect` for `half` and `srgb8` equals bilinear of the decoded neighbours, with x wrapping and y clamping.<br>- `acesR128` matches a reference evaluation of the r128 GLSL constants, computed in the test from the copied constants with no hard-coded outputs: 0 → 0, monotonic on [0, 64], and ≤ 1 for large inputs.<br>- `logAverageLuminance` with the cos-latitude weight on a constant image equals that constant. `autoExposureEv` gives 0.0 for Lavg = 0.18, gives −1.0 for 0.36, and is clamped at ±10. |
| `hdri-file-info.test.mjs` | T2 (T17) | - Magic bytes for the four formats. An extension/content mismatch is a warning. EXR magic before T17 gives its own message.<br>- Radiance: `#?RADIANCE` + `FORMAT=32-bit_rle_rgbe` + blank + `-Y 1024 +X 2048` parses; `FORMAT` after a comment line parses; a missing `FORMAT=` gives "missing format specifier"; `+Y 1024 +X 2048` gives the orientation message; a missing size line gives "missing image size specifier".<br>- PNG IHDR, and JPEG SOF0/SOF2 sizes (including a JPEG with a 40 KB APP1 segment before the SOF).<br>- **A JPEG whose SOF lies at 1.3 MB** (20 × 64 KB APP segments): `readJpegSize` returns `{needsWalk}`, and `walkJpegSegments` finds the size with 4-byte reads (a spy counts the bytes read: at most 2 KB beyond the probe). A walk that hits SOS or 512 segments returns `{error}`.<br>- Limits at the boundaries:<br>  - 100 MB exactly is accepted, and one byte more fails;<br>  - HDR: 8192×4096 is accepted on the default cap, 8193 fails, and 4097×2048 fails on the low-memory cap;<br>  - **LDR: 16384×8192 is accepted, 16385 fails, and 8193×4096 fails on the low-memory cap.**<br>- The aspect warning fires at 1.97 but not at 1.99.<br>- `safeZipName` keeps the extension and the 128-character cap.<br>- (T17) EXR `dataWindow` size, the compression byte, and the tiled/deep/multipart flags, each rejected with the 3.6 message; B44/B44A rejected. |
| `hdri-settings.test.mjs` | T2 | - Rule tables: wrap (−180 → 180, 540 → 180, −190 → 170); pitch clamp; EV clamp; `''`, `'abc'` and NaN give the defaults (pointY 1.5, others 0); point y ≥ 0.<br>- `projectionPoint(cine, out)` in camera and custom mode writes into `out` without allocating.<br>- `setPointMode` copies the camera position on **every** camera → custom switch (twice in a row with a moved camera), clamping a camera at x = 150000 to 100000 (07 C45).<br>- `translateStage` shifts the stored point in both modes and clamps it.<br>- `effectiveToneMap`; `setSource(null)`; the `assign` round trip. |
| `hdri-schema.test.mjs` | T8 (T11) | 07 4.4 rule 3 for every 4.2 row:<br>- absent means default; round trip (`deepStrictEqual`); validator coercions, clamps and wraps with 07's codes;<br>- **every key under `hdri` and `props.car.model` is snake_case** (`/^[a-z0-9_]+$/`), and `hdri` follows `props` in key order;<br>- `hdri.source` with a bad `sha256` or `bytes`, or an empty `name`, → `null` + `defaulted`, and `display.content: 'hdri'` then → `color` + `defaulted`;<br>- `hdri.source.path` outside `/^hdri\/…$/` → `null`;<br>- the `history` variant omits `quality`/`backdrop`, and its `source.path` is `null`; the `zip` variant writes `hdriZipPath`;<br>- no `data:` string and no `assets[]` entry of kind `hdri`/`model` in any variant;<br>- **content invariant:** a model with `content = 'hdri'` and `source = null`, forced by hand, is written as `color`;<br>- the version minor equals `KNOWN_REVISION`;<br>- (T11) `asset_id`: malformed → default; well-formed but unknown → kept. |
| `hdri-decoder.test.mjs` (fake loaders) | T3 (T17) | - **r128 `parse` returning `null`** (with the loader's `console.error` called inside `parse`) → `HdriDecodeError('corrupt or truncated data')`; the fake `win.console.error` is **not** called afterwards, and it is restored even when `parse` throws.<br>- **A flat result with `data.length < 4·w·h`** → the same error.<br>- A file with `EXPOSURE=2` decodes to the same pixels as without it.<br>- **`createImageBitmap` fallback chain:** a fake that throws `TypeError` on `imageOrientation` → step 2; one that also throws on resize options → step 3 plus `drawImage` to Wt×Ht; a fake that returns the wrong size → `drawImage`. Only Wt×Ht canvases are created.<br>- The output is bottom-up, and the stats are present. |
| `hdri-environment.test.mjs` (fake THREE and renderer) | T3 (T12) | - **Replacement rule:** after `setImage(B)`, the old texture A is disposed, and at the moment of disposal neither `uniforms.uEnv.value` nor `sceneManager.environment` references A or its PMREM.<br>- `clear()` leaves `uEnv` on the placeholder.<br>- Replacing an HDR with a JPG sets `uEnvEncoding` from 0 to 1 synchronously.<br>- (T12) `onContextRestored` disposes the reflection PMREM, and the next `reflectionTexture` rebuilds it.<br>- (T19) `refreshMaskTile` swaps before disposing. |
| `hdri-controller.test.mjs` (fakes) | T4, T6, T8 | - **Load token:** start load A, start load B, and let A's decode resolve last. B is the active image, A's result is dropped, no texture is created for A, and the progress events after B's start carry only B.<br>- **WebGL 1 caps** → the WebGL 2 error and no decode. Caps are read through `getDeviceCaps` at load time (a caps object filled after construction is honoured).<br>- **Revalidate:** `isSelectable()` is false and `selection.revalidate()` is called (dropping `'hdri-point'`) when the point becomes unselectable (clear, missing, content change, camera mode); no direct `deselect` (07 C36).<br>- `SELECTABLE_MOVED{id:'hdri-point'}` after inputs, a mode switch, `translateStage` and the gizmo.<br>- **Selectable v2:** `applyTransform` start/drag/cancel restores the snapshot; a translate drag leaves the rotation untouched at pitch 89.9° (no re-derivation); snapping is relative to the start.<br>- **Follow emission:** with the camera moving every frame for 1 s (fake clock at 60 Hz), at most 11 `follow` emits occur, and the last one carries the final pose within 100 ms of the motion stopping. An unchanged pose emits nothing. A `rebuildSeq` change emits once.<br>- **Payload reuse:** every emit passes the same payload object, with the same `point` and `rotation` objects.<br>- **Content invariant** after every use case (load, clear while HDRI, H with nothing loaded, restore of null).<br>- **`clear()` while HDRI** calls `setContentMode(previous, {record: false})` once and records `Remove HDRI` once.<br>- **`restore(v)`:** the snake_case mapping; the same sha → no reload; a session blob hit; a ZIP entry hit (hashed, consumed); a missing entry → `missing`; a `null` source → `empty` with `env.clear()`.<br>- `zipEntry()` is `null` for a bundled source.<br>- `digest` is the injected function. |
| `hdri-cache.test.mjs` (fake IndexedDB) | T8b | LRU eviction at 3 entries and 300 MB (never the newest); `available = false`, with no throw, when `indexedDB.open` throws or is blocked; `clear()`. |
| `car-model-controller.test.mjs` (fakes) | T11, T12, T12b | - `tick()` never returns a promise and never awaits.<br>- `studio` pending → lights scale 1, then the texture after the promise resolves.<br>- No `floatTargets` → `hdri`/`stage` resolve to `studio`.<br>- Stage gating: panel mode never captures while motion continues; combined mode captures at most every 500 ms during motion; a trailing capture comes 150 ms after motion stops.<br>- `exclude` contains only the car, and the cube camera's layer mask is `0b0001`.<br>- An unknown `modelId` → `fallback`. |
| `wall-controller.test.mjs` (extended) | T4 | - Rows `F5-1`..`F5-3`: a mode change rebuilds once, and a same-mode click rebuilds 0 times; `setContentMode('hdri')` with no source rebuilds 0 times and changes nothing.<br>- LED sim → HDRI clears the tile cache once.<br>- Projection setters rebuild 0 times; readiness changes rebuild once, and an HDRI replacement 0 times.<br>- `rebuildSeq` increments once per rebuild, and `currentLayout` is the layout passed to the view after a rebuild. `setLedSim(true)`, `setLedSim(false)`, `setPanelIds(true)` and `setPanelIds(false)` go through `setContentMode` and keep their legacy events and return values. |
| `wall-display-panel.test.mjs` (extended) | T5 | After `setContentMode('ledSim')` (no click), `#toggle-led-sim.active` is true; a later proxy click turns LED sim **off** (content `color`). (T19) `#led-sim-options` is shown in HDRI mode. |
| `wall-content-panel.test.mjs` | T5 | The HDRI radio is disabled for `empty`, `loading` (from empty) and `error` (with nothing loaded), and enabled for `ready` and `missing`. `checked` follows `DISPLAY_CONTENT_CHANGED` and `PROJECT_REPLACED`. |
| `keymap.test.mjs` (spec 07, extended) | T6 | - The four F5 rows have registered actions once F5 lands (07's rule).<br>- `Shift+H` matches `hdri.toggleBackdrop` only.<br>- `Comma` with and without Shift matches `hdri.yawMinus` (`shift: 'any'`), and the action receives the event (−5 / −45).<br>- None fires in a number input; all fire with a range input focused. |
| `hdri-baker.test.mjs` | T13 | Spec 04 contract:<br>- An identity plan: texel (x, y) maps to `wallPointFromBaseUv` at the texel's base UV.<br>- An atlas plan undoes the rect.<br>- Texels outside [0,1]² get the background.<br>- **Signature:** `invertUv` is called as `(plan.transform, plan.W, plan.H, u, v, out)` (spy).<br>- **Rotated plan:** a quarter-turn transform with `sourceRotated` gives a `plan.sourceW × plan.sourceH` export canvas (W and H swapped). Each LED's texel equals the 6.4 projection of that LED centre within ±1 level.<br>- **Offset section:** a section with a spec 02 offset (position and rotation). The bake at every LED centre equals the 6.4 projection of the LED centre **taken from the built mesh** (vertices × `matrixWorld`) within ±1 level. A deliberately doubled `postTransform` fails this test (a negative control with a double-applying stub).<br>- A synthetic band env on a flat 4-column section, with P on the axis, gives the exact expected colours at the centre, left and right LEDs.<br>- **Layouts:** combined `per-section` gives N section canvases and no atlas; combined `atlas` gives one atlas canvas; panel with `panel_uvs = 'panel'` reports "not available".<br>- **The UV-viewer canvas (`bakeSection`) equals the export PNG pixels** for the same section, plan and env.<br>- The pixel map uses the identity plan.<br>- Size-limit errors. |

### 8.2 Harness (`tests/regression/scenarios-hdri.mjs`, registered in `scenarios.mjs`)

The harness never calls app functions. It drives the DOM and reads screenshots and DOM state.

**Storage isolation (required from T9 on).** The harness opens every page with `Target.createTarget` inside **one** Chrome process with one `--user-data-dir` (`tests/regression/lib/cdp.mjs`). Pages of the same origin therefore share IndexedDB and `localStorage`. Every "fresh page" step in this scenario goes through a helper:
- `freshPage({ clearStorage = true })` calls CDP `Storage.clearDataForOrigin({ origin, storageTypes: 'indexeddb,local_storage' })` before navigating, so no earlier step can satisfy a later restore.
- Step outputs therefore do not depend on scenario order or on T8b.
- The harness owners (spec 07 G3: "storage clear per scenario") should also consider one isolated browser context per scenario (`Target.createBrowserContext` + `createTarget({browserContextId})`), which makes the isolation structural.

**Fixtures** come from `tests/regression/fixtures/make-hdri-fixtures.mjs`, which is committed together with its outputs (a few hundred KB in total):
- `hdri-ramp-256x128.hdr`: flat (non-RLE) RGBE with the header lines `#?RADIANCE`, `FORMAT=32-bit_rle_rgbe`, an empty line and `-Y 128 +X 256`.
  - For texel centre `(u_c, v_c)` the linear values are `R = sRGBToLinear(u_c)`, `G = sRGBToLinear(v_c)`, `B = sRGBToLinear(0.5)`.
  - With the **clip** tone map at EV 0, the shader's `LinearTosRGB` undoes the encoding. **A displayed pixel's red level is therefore 255·u and its green level 255·v** of the panorama point it shows.
  - Blue is about 128 everywhere: a marker for "image pixel" against the 0x0a0a0f background (B = 15).
  - The generator asserts that the first scanline does not start with bytes `2, 2`, so r128 reads it flat.
- `hdri-ramp-256x128.png`: the same in sRGB 8-bit (`R = round(255·u_c)`, `G = round(255·v_c)`, `B = 128`).
- `hdri-flat-64x32.png`: every pixel (200, 100, 50).
- `not-an-hdri.hdr`: random bytes.
- `hdri-truncated-flat.hdr`: the flat ramp, cut after 60 % of its pixel bytes. r128 returns the short buffer unchecked.
- `hdri-truncated-rle.hdr`: the ramp written with new-style RLE scanlines (width 256 ≥ 8; each scanline starts `2, 2, 1, 0`), cut in the middle of scanline 40. r128 calls `rgbe_error` and returns `null`. The generator decodes its own untruncated RLE output back to the flat pixels before cutting.

**Oracle.** Expected levels are computed in the harness with the closed form of 6.2 (`u = frac(0.5 + (atan2(X.x − P.x, −(X.z − P.z)) + ψ)/2π)`, `v = 0.5 + asin(dy/|d|)/π`), plus inline copies of the sRGB and ACES formulas and of the Auto EV formula (6.9). It does not import app code, so a convention error in `EquirectProjection` cannot hide itself. Each probe averages a 3×3 block. The tolerance is ±4 levels (half-float quantisation and bilinear interpolation), unless stated otherwise.

**Locating wall points.** In `#view-front` the wall plane is parallel to the image plane (the front preset: θ = 0, φ = π/2), so screen position is an affine function of wall position. The harness finds the wall's screen rectangle by pixel search for the wall's current section colour, read from the harness palette hook (01 T2's `lib/palette.mjs`, the swatch values of `sectionsSnapshot`; 07 C53) rather than a literal colour band, excluding the overlay rects of the existing `pageOverlayRects` helper, with the grid off. It maps a wall point (x ∈ [0, 4], y ∈ [0, 2]) linearly into that rectangle.

**New config** `hdri_flat` in `configs.mjs`: one flat section, 8 × 4 panels of 500 mm (4 m × 2 m), 32 × 32 LEDs.

MVP steps (T9):

| # | Step | Output |
|---|---|---|
| 1 | Import `hdri_flat`; `#toggle-grid` off. Read the HDRI radio. Set `#hdri-input` to the ramp `.hdr` (page-side `DataTransfer`, as `pageImportText` does); wait for `#hdri-status[data-state="ready"]`. | `hdri_radio_state.json` (`disabled: true` before the load, `false` after); `hdri_status.json` (state, file-info text, warnings, and the caps from `#hdri-status[data-caps]`: `isWebGL2`, `maxTextureSize`, `floatTargets`) |
| 2 | Click `#wall-content-mode [data-content="hdri"]`. `#hdri-tonemap` = `clip` (`auto` would resolve to ACES for `.hdr`, and the ramp identity needs clip). `#hdri-point-mode` = custom; X 2, Y 1, Z 1 (P = (2, 1, 1): the wall subtends about ±63°, u ∈ [0.32, 0.68]). `#view-front`. | `hdri_front.screenshot.png`; `hdri_probe_front.json`:<br>- 9 probes along wall y = 1 at x = 0.2…3.8 (expected R from 84 to 171, strictly increasing left to right: image-left on wall-left);<br>- the probe straight ahead of P at x = 2 (R = G = 128);<br>- 3 probes at x = 2, y = 0.2 / 1.0 / 1.8 (G = 73 / 128 / 182: image-top up). |
| 3 | Yaw 90 via `#hdri-yaw-num` (`change`) | probes: expected R from 148 to 234 (u = 0.75 + atan(dx)/2π for dx = x − 2 ∈ [−1.8, 1.8]) |
| 4 | Exposure −3 (clip); then EV 0 with tone map `aces`; then click `#hdri-auto-ev`; then `#hdri-reset-orientation` (yaw 0, EV 0) and tone map `clip` | probes against the oracle with `2^−3` and with the ACES formula; `hdri_auto_ev.json`: the `#hdri-exposure-num` value equals the harness's own Auto EV of the fixture (exact, one decimal) |
| 5 | Mesh modes section and panel, then back to combined | `hdri_probe_modes.json`: every probe equals the combined-mode level within ±1 |
| 6 | Segmented control → LED pixels; click the hidden proxy `#toggle-led-sim`; read `app.uiState()`; segmented control → HDRI | `hdri_proxy.json`: LED sim off, content `color` (AC 11) |
| 7 | `#hdri-point-mode` = camera; `#toggle-camera-preview` on; `#camera-pos-x` 2, `-y` 1, `-z` 1.5; wait for two animation frames plus 150 ms (the 10 Hz follow throttle) | `hdri_follow.json`: `#hdri-point-x/y/z` read "2.00", "1.00", "1.50" (AC 25); the preview-centre probe (the centre of `#camera-preview-canvas`'s rect) gives R = G = 128 (the camera's optical axis hits the wall straight ahead); a screenshot including the preview |
| 8 | `#hdri-backdrop` on; `#view-side` | screenshot (dome visible; no helpers in the preview) |
| 9 | `#camera-pos-z` 5 (the wall edges are now inside the pilot view); press P (pilot); `#hdri-backdrop` **off**; screenshot A. Scan the canvas centre row from the left for the first pixel with B in [100, 160]: `edgeX`. `#hdri-backdrop` on (the camera does not move); screenshot B; probe B at `edgeX − 3` and `edgeX + 3`. | `hdri_pilot_seam.json`: the max channel difference (expected ≤ 4 levels: the ramp changes by about 0.1 level per pixel there, while a mirrored, offset or wrongly translated dome differs by tens of levels) |
| 10 | Pilot off (P); `#toggle-camera-preview` off (so the window cannot cover later probes). Keyboard (CDP `Input.dispatchKeyEvent`, trusted), with focus on `body`: `H` → content returns to `color` (the mode before HDRI); `H` → `hdri`; `.` twice; `Shift+.` once; then focus `#hdri-yaw-num` and press `.`; then `Shift+H` | `hdri_keys.json`: the contents after each `H`; `#hdri-yaw-num` reads `10.0`, then `55.0`, and is unchanged after the press inside the number field; `#hdri-backdrop[aria-checked]` toggled |
| 11 | Export JSON | `hdri_json_check.json`:<br>- `hdri.source` = `{name: "hdri-ramp-256x128.hdr", bytes: <fixture size>, sha256: <the harness's own SHA-256 of the fixture>, path: null}`;<br>- `display.content` is `"hdri"`;<br>- every key under `hdri` is snake_case;<br>- `assets` has no entry of kind `hdri` or `model`;<br>- no `data:` string outside a logo asset. |
| 12 | Export ZIP with `#hdri-include-in-zip` on; then off, and export again | `hdri_zip_entries.json`:<br>- first ZIP: the entry `hdri/hdri-ramp-256x128.hdr`, byte-identical to the fixture (SHA-256 compared), and the ZIP JSON's `hdri.source.path` equal to it;<br>- second ZIP: no `hdri/` entry, and `path: null`. |
| 13 | `freshPage({clearStorage: true})`: import the exported JSON; relink with the ramp **`.png`**. Then `freshPage({clearStorage: true})`: import the JSON; relink with the same `.hdr`. | `hdri_relink.json`: `missing` with the exact message (both pages); after the `.png`, `ready` with the checksum warning; after the `.hdr`, `ready` with no warning |
| 14 | `freshPage({clearStorage: true})`: open the first ZIP of step 12 (spec 07 D6) | `hdri_zip_open.json`: `ready` with no relink step |
| 15 | Upload `not-an-hdri.hdr`, `hdri-truncated-flat.hdr` and `hdri-truncated-rle.hdr` in turn | `hdri_errors.json`: the exact 3.6 messages in `#hdri-status` (unsupported type; corrupt or truncated data, twice); after each, the previous HDRI is still `ready` |
| 16 | (Still on the step-14 page.) Grid off if the import left it on; `#hdri-backdrop` off; content HDRI; `#hdri-point-mode` = custom, then X 2, Y 1, Z 1 re-entered (a switch to custom copies the camera position); `#hdri-reset-orientation` (the ZIP saved yaw 55 from step 10); `#view-front`; tone map `auto`. Upload the ramp `.png`. | `ready`; the resolved tone-map label reads "Auto (clip)"; the probes of step 2 within ±4 |
| 17 | Upload `hdri-flat-64x32.png` | 5 probes equal (200, 100, 50) within **±1** (AC 5) |
| 18 | Set `#hdri-input` to the `.hdr` and, immediately, to the `.png` (no wait in between) | the final state is `ready` with the `.png` name; the ramp `.png` probes (AC 26) |
| 19 | Page-side: create a `DataTransfer` holding the `.png` as a `File`; on `aside.control-panel` (the sidebar), dispatch `new DragEvent('dragover', {dataTransfer, bubbles: true, cancelable: true})` and then a `drop` event built the same way | `hdri_drop_guard.json`: both `dispatchEvent` calls return **`false`** (the guard called `preventDefault`); `dataTransfer.dropEffect === 'none'` after `dragover`; the info message in `#hdri-status` (AC 27). Synthetic drag events are untrusted, so the browser never navigates for them; `location.href` is therefore not asserted. |
| 20 | Console | `console.json` has no errors; in particular, no `THREE.RGBELoader` message from step 15 |

Increment steps, each added in its own task with its own RB step (8.3):

| Task | Step | Output |
|---|---|---|
| T8b | After step 12, add a page made **without** clearing storage (Remember is on by default, and step 1's load cached the file): import the JSON. Then click "Forget cached HDRIs" (confirm), and make another such page and import again. | `hdri_autorelink.json`: `ready` with origin `cache` and no relink on the first page; `missing` on the second. Steps 13 and 14 keep clearing storage, so their outputs do not change. |
| T17 | Upload a generated ZIP-compressed scanline EXR ramp (the generator writes it with Node's `zlib`) and a header-only B44 EXR | the ramp probes within ±4; the exact B44 message |
| T18 | `#hdri-quality` 2K, then 4K | the probes of step 2 within ±4 at both |
| T19 | `#hdri-led-mask` 100 %, then 0 | a screenshot at 100 %; `#led-sim-options` visible in HDRI mode |
| T20 | `#hdri-thumb` element screenshot with the outline | screenshot |
| T21 | `#hdri-sample` | `ready`, origin `bundled` |
| T11/T12 | Car on; `#car-model` = gltf; env `hdri`, then `studio`; car off again | screenshots (needs the bundled `.glb`, same origin); the `#car-model-status` text |
| T12b | Env `stage` with the chrome finish | screenshot |
| T13 | Export ZIP with texture content `hdri` (combined `per-section` layout) | the list of `textures/*_HDRI.png`; LED-centre probes of the PNGs against the viewport probes within ±2 (AC 23) |

### 8.3 Intentional golden changes (one commit each, with `--only` partial captures where possible)

The JSON-exporting scenarios are `default`, `flat3`, `concave_offsets`, `convex`, `mixed`, `box_corner`, `large_wall`, `ui_sections`, `logos` (ZIP JSON), `name_with_panel_ids` and `import_edge`, plus every JSON-exporting scenario that spec 07 added (for example `project_v2_roundtrip` and `undo_redo`). (`camera` and `toggles` export no JSON.) The PR of each schema step lists the exact set from a full harness run. Below, this set is called **JSON-LIST**.

Revision 2's RB-1 (the single-renderer re-baseline) is **deleted**: spec 07 R1/R2 own it (07 8.4).

| Step | Changes (expected FAIL or WARN) | Must stay identical | Re-baseline |
|---|---|---|---|
| **RB-2** T5 UI (content control, HDRI section, Panel IDs section collapsed by default with its hint, export toggle) | `ui_visual` sidebar screenshots and DOM/style probes in every state that probes the sidebar (`.global-section` titles and layout, buttons, selects, titles, labels, the Panel IDs section's collapsed state and hint) | **every canvas screenshot in every scenario** (the badge and the drop overlay are `hidden`, and the info badge is never changed by this feature, 07 C35); `toggles` (the legacy ids still drive it; `uiState` reads the toggles' own classes and the option blocks' own `display`); every export | `--only ui_visual` |
| **RB-3** T8: the `hdri` schema rows | every JSON output in JSON-LIST (and the `logos` ZIP JSON) changes by exactly two things: the `version` minor goes up by one, and a new top-level `hdri` object appears after `props` with every default (`source: null`, `quality: "4k"`, `backdrop: false`, the projection defaults). The diff is checked with a JSON diff, not by eye. | OBJ, MTL, glTF, PNG, screenshots, DOM state, ZIP entry lists | `--only <JSON-LIST>` |
| **RB-4** T9: the `hdri` scenario added | a new scenario: no baseline exists, so it is captured from the candidate after a manual review of every screenshot and probe JSON (whose pass flags must all be true) | everything else | `--only hdri` |
| **RB-7** T8b | `hdri`: the new auto-relink outputs only; `ui_visual` sidebar states (the Remember switch and the Forget button) | every existing `hdri` output (steps 13-14 clear storage first); every other scenario | `--only hdri,ui_visual` |
| **RB-8** T17, T18, T19, T20, T21 (one step each) | `hdri`: that increment's new outputs; `ui_visual` sidebar states where the increment adds a control (T18 select, T19 slider, T21 button; T17 changes the drop-zone text) | every existing output | `--only hdri,ui_visual` |
| **RB-5a** T11: the car schema rows and car UI | JSON-LIST JSON: the `version` minor goes up by one, and `props.car.model` appears with its defaults; `ui_visual` `#car-options` after `open-car` | screenshots (the car stays `procedural`) | `--only <JSON-LIST>,ui_visual` |
| **RB-5** (Q2) car default `gltf`, its own commit | the `toggles` car screenshots (states 14-16 and the view presets after them); `ui_visual` viewport states after `open-car`; `props.car.model.kind` in every JSON-LIST output | everything else | `--only toggles,ui_visual,<JSON-LIST>` |
| **RB-6** T13 bake | only `hdri` scenario outputs (the default export content stays `panelIds`) | every other scenario | `--only hdri` |

The procedure is the siblings':
1. Run the full harness.
2. Check that every FAIL is in the "Changes" column and that nothing in the "Must stay identical" column moved.
3. Re-capture with `--only`.

### 8.4 Manual checks

- A real 4K and (T18) 8K HDRI (Poly Haven, CC0): the orientation looks right from the front, with the sun or horizon where expected and nothing mirrored. Auto EV gives a usable exposure for an outdoor and an indoor HDRI.
- **Parallax.** With a **Custom point** in the orbit view: the wall and the backdrop line up when the orbit eye is moved to P, and break visibly when the eye moves sideways. In pilot mode with a Custom point: the same as the pilot camera flies away from P. In `Film camera` mode, the pilot view and the preview stay seamless (P follows the camera), and the orbit view shows the break.
- The preview equals the pilot view.
- (T12, T12b) Car reflections in each environment source. The `chrome` finish shows a sharp, unmirrored stage reflection: the text on a panel-ID wall reads correctly in the reflection, mirrored as a mirror would show it. AC 18's ±3-level check against a uniform-colour wall (`hdri-flat-64x32.png`) is done here with the DevTools colour picker.
- Real drag and drop onto the panel, onto the viewport and onto the sidebar (no navigation).
- Relink after a reload. (T8b) With "Remember on this device", an automatic relink; "Forget cached HDRIs" removes it.
- Undo/redo of an HDRI load, of a yaw drag and of a gizmo drag on the marker.
- Memory hygiene (6.13, AC 20). A 100 MB `.hdr` at the cap does not crash the tab, and the DevTools memory peak stays within 6.9. (T17) the same for a 100 MB EXR.
- A 360-camera JPEG of about 11K × 5.5K with large XMP segments loads (JPEG walk, LDR cap).
- Mobile Safari: the low-memory caps and no crash.
- A WebGL 1-only profile (Chrome started with `--disable-es3-apis`): the HDRI panel shows the WebGL 2 message, and the rest of the app works.
- Context loss (DevTools `WEBGL_lose_context`), then restore: the projection and (T12) the reflections come back.
- Keyboard: H, Shift+H, comma and period work, and do nothing while typing in a number field or with a select focused. The segmented control's arrow keys do not move the camera.
- Badge layout: at viewport widths of 1000, 1280 and 1920 px, the badge stays clear of the pilot banner (pilot on) and of the top-centre stack `#viewport-top-stack` (spec 01's legend with a debug mode on, the restore banner). It is hidden below 1000 px. It is covered, not overlapped, by an open UV viewer.

---

## 9. Acceptance criteria

Each criterion names the release that must meet it: **[MVP]** or the increment's task.

1. **Upload [MVP; EXR: T17].** `.hdr` (Radiance, `-Y H +X W`, RLE or flat), `.jpg` and `.png` load from the file chooser, from a drop onto `#hdri-drop`, and from a drop onto the viewport. Each reaches `ready`, with the name, dimensions, size and format shown. (T17) `.exr` (single-part scanline: NO, RLE, ZIPS, ZIP, PIZ, PXR24, DWAA or DWAB compression) loads after the lazy fflate and EXRLoader fetch.
2. **Limits [MVP].** These are rejected with the exact 3.6 messages, **from the header, before the full file is read or decoded**:
   - files above 100 MB (HDR) or 50 MB (LDR);
   - HDR images above the device cap (8192×4096, or 4096×2048 on low-memory devices and iOS);
   - LDR images above 16384×8192 (8192×4096 on low-memory devices);
   - unsupported magic bytes;
   - Radiance files without `FORMAT=` or with another orientation.

   The unit tests on `HdriFileInfo` cover this, and a spy shows that `file.arrayBuffer()` is never called. A JPEG whose SOF lies beyond the first 256 KB is measured by the segment walk, not rejected. The previously loaded HDRI stays active.
3. **Orientation [MVP].** With yaw = pitch = roll = 0 and P in front of a flat wall, the image centre (u = 0.5) appears at the wall point straight ahead of P, with image-left on wall-left and the top of the image up. Every probe of `hdri_probe_front.json` matches the independent oracle within ±4 levels (8.2), and the unit table (6.2) passes.
4. **Rotation [MVP].** Yaw +90° moves the image centre to world −X (the harness yaw-90 probes and the unit tests). Pitch +θ raises it. Roll +φ turns the horizon counter-clockwise as seen from the front (unit tests). The yaw and roll inputs wrap to (−180, 180]; pitch clamps to ±90.
5. **Exposure, tone map and Auto EV [MVP].**
   - EV scales radiance by 2^EV (harness probes at EV −3).
   - `auto` resolves to ACES for HDR/EXR and to clip for JPG/PNG.
   - The clip path is exact for LDR: the 256-level round-trip unit test passes, and the flat-colour PNG fixture renders (200, 100, 50) within ±1 level.
   - `Auto` sets EV from the cos-latitude-weighted log-average luminance (6.9), equal to the harness's independent computation (`hdri_auto_ev.json`).
6. **Mesh modes [MVP].** The projection is identical in combined, section and panel modes (every probe within ±1 level, `hdri_probe_modes.json`). With spec 02 offsets and a spec 03 pivot applied, the marker and the wall move together in the stage frame (a unit test on `translateStage` and the stage-frame layout; a manual check).
7. **No-rebuild edits [MVP].** Changing the point, yaw, pitch, roll, EV (including Auto), the tone map, the backdrop, or the gizmo on the marker causes **0** `WallController.rebuild()` calls (unit spy) and 0 program compiles (`renderer.info.programs.length` unchanged). This **excludes** the one-time compile of the dome and of the marker the first time each is shown.
8. **Camera follow [MVP].** With `Film camera`, moving the camera by inputs, gizmo, pilot look or pilot fly updates the projection on the next frame. This also holds while the camera preview is off (the last pose is used). Under spec 07 R3, the frame is re-rendered with no other input.
9. **Preview and pilot parity [MVP].** The preview renders the projection with the same textures (one WebGL context). With the backdrop on and P on the camera, the pilot-view colour difference 3 px either side of the wall's left edge is at most 4 levels (`hdri_pilot_seam.json`, the two-shot method of 8.2).
10. **Layers [MVP].** The preview and stills show the projection and the dome (`ENVIRONMENT`), never the marker (`HELPERS`). Pilot mode shows the dome and hides the marker. (T12b) The stage probe sees neither (a unit test on the cube camera's mask `0b0001`). The preview's letterbox, helper exclusion and corners are spec 07 R1/R2 criteria; they are not repeated here.
11. **Content control [MVP].**
    - The four-way control switches modes. The HDRI segment is disabled unless the HDRI state is `ready` or `missing`.
    - The legacy `#toggle-led-sim` and `#toggle-panel-ids` keep their exact behaviour (the `toggles` scenario is unchanged). Their `.active` class always matches the model, also after a change made through the segmented control or H (`hdri_proxy.json`; unit test).
    - Switching from LED sim to HDRI clears the tile cache.
    - The Panel ID options are visible only in Panel IDs mode.
12. **Empty, missing and the content invariant [MVP].**
    - With no HDRI, the content cannot be set to HDRI. H flashes the drop zone instead.
    - Removing the HDRI while the content is HDRI returns to the previous mode, as one undo step.
    - **Save, then Open, never changes the content mode and never raises a warning** for a file the app wrote (unit invariant test; `hdri_relink.json` imports the app's own file with no `defaulted` issue).
    - A foreign file whose `display.content` is `hdri` but whose `hdri.source` is `null` opens as `color` with 07's warning.
    - A project whose HDRI bytes are unavailable shows `missing` with the exact message. Relinking the same file restores it with no warning; a different file restores it with the checksum warning.
13. **Persistence [MVP].**
    - The v2 file contains `display.content` and a top-level snake_case `hdri` object with `source: {name, bytes, sha256, path}` (reference only), `quality`, `backdrop` and `projection` (07 C9).
    - `assets[]` holds no `hdri` or `model` entry.
    - No HDRI pixels and no data URI for them appear anywhere in the JSON (logos may still be inline per spec 07).
    - v1 files import wall-only and leave the HDRI state alone.
    - Invalid values are sanitised with spec 07's issue codes.
    - Every 4.2 row round-trips. T8 bumps the minor version once.
    - (T11) `props.car.model` with 07's five leaves.
14. **ZIP [MVP].** With "Include HDRI file" on:
    - the ZIP contains `hdri/<safe name>`, byte-identical to the source;
    - the ZIP JSON's `hdri.source.path` names it;
    - opening the ZIP restores `ready` without a relink.

    With it off, there is no entry and `path` is `null`.
15. **Marker [MVP].**
    - In custom mode the marker is pickable: id `'hdri-point'`, kind `'projector'`, priority 9 (below the pivot's 10).
    - Translate and rotate work through `TransformControls`, and Y never goes below 0.
    - The panel mirrors the values, and the gizmo follows every point write (`SELECTABLE_MOVED`).
    - Escape cancels a drag (`'cancel'` restores the start) and otherwise deselects.
    - The point is deselected when it becomes unselectable (clear, missing, content change, camera mode): `isSelectable()` turns false and `selection.revalidate()` drops it (07 C36).
    - In camera mode the marker is visible but not pickable, and camera-body picking is unaffected.
    - The selection badge reads `Selected: HDRI Point`.
16. **Shortcuts [MVP].**
    - H toggles HDRI content (or flashes the drop zone when no HDRI is loaded), and Shift+H toggles the backdrop.
    - Comma or period nudges the yaw by 5° (45° with Shift), with auto-repeat.
    - They are spec 07's existing `KEYMAP` rows with registered actions; no new row and no `keydown` listener exist (rule S5).
    - None fires in a typing target per 07's guard (a number input, a select, a textarea) or with Ctrl, ⌘ or Alt. They do fire with a range slider focused.
    - None conflicts with the legacy keys or with specs 01, 02, 03, 04, 07 and 09 (`keymap.test.mjs`).
    - `H` follows the printed letter on AZERTY and Dvorak (by key, 07 C43). The info badge is unchanged (07 C35).
17. **Car fallback [T11].** With `Sports car`, the glTF car appears, oriented with its front to +X, 4.5 m × scale long, with its base on the floor. The gizmo anchor is at its Box3 centre. If the `.glb` fails to load, or the saved `asset_id` is unknown, the procedural car appears and the status shows the 3.6 message. With `Simple boxes`, the legacy car is pixel-identical to before.
18. **Reflections [T12, T12b].**
    - `hdri`: the reflection rotates with yaw.
    - `stage` (T12b): a `chrome` car shows the LED wall content and a dark stage elsewhere. The wall's reflected colour on a flat chrome region matches the wall pixel within ±3 levels (**manual** check with the flat-colour fixture).
    - `studio`: neutral. The first frame after selecting it does not block (the texture arrives asynchronously).
    - Without float render targets, `hdri` and `stage` are disabled with the 3.6 message, and `studio` is used.
    - Changing the source triggers no wall rebuild.
19. **No legacy drift [MVP].** With content ≠ HDRI and the car `procedural`, every existing harness output is identical except exactly what RB-2 (sidebar `ui_visual` only) and RB-3 (JSON: the `version` minor and the default `hdri` object) list. In particular, RB-2 leaves every canvas screenshot unchanged. On r128, `renderer.outputEncoding` and `toneMapping` remain at r128's defaults (Option L).
20. **Disposal [MVP].** Replacing the HDRI 10 times and then clearing it returns `renderer.info.memory.textures` to its prior count (excluding, from T12, the cached studio PMREM). A wall rebuild never disposes the HDR texture. No shared uniform and no `scene.environment` ever references a disposed texture (unit test of the replacement rule).
21. **Lazy loading [MVP].** No new network requests occur at start-up. Loader scripts load from jsdelivr with SRI, through spec 07's factories, only on first use.
22. **Performance [MVP].** On the reference machine of 6.13 (Iris Xe-class integrated GPU, Chrome stable, 1920×1080), the 6.13 targets are met:
    - a 4K `.hdr` (24 MB) reaches `ready` in ≤ 2.5 s;
    - a projection edit costs 0 rebuilds;
    - an idle frame with HDRI content costs under 0.1 ms of tick time.
23. **Bake [T13].** With `Texture content = HDRI bake`:
    - the ZIP contains one PNG per section (or one atlas in the combined `atlas` layout), each at `plan.sourceW × plan.sourceH`;
    - the MTL `map_Kd` and the glTF `baseColorTexture` with `KHR_materials_unlit` reference them;
    - the CPU-baked LED colours equal the viewport projection within ±2 levels at LED centres, **including a section with a spec 02 offset and a section with a quarter-turn UV plan** (harness probe; `hdri-baker.test.mjs`);
    - spec 04's UV viewer shows the same pixels as its background;
    - in panel mode with per-panel UVs, the option is disabled with its title;
    - `Export HDRI pixel map` writes the LED-space map, or shows the B-L4-style message.
24. **Licensing [T10, T21].** `assets/LICENSES.md` lists every bundled asset (car and sample HDRI) with its source URL, author and licence, and the UI shows the car credit.
25. **Live readouts [MVP].** In camera mode, moving the camera (inputs, gizmo, pilot look or fly, reset, a pivot change) updates `#hdri-point-x/y/z` **within 100 ms**. A wall rebuild re-emits the projection state within 100 ms (`hdri_follow.json`; the unit test of the follow emission). (T20) The coverage outline follows the same emissions.
26. **Overlapping loads [MVP].** When a second file is chosen while a first is still loading, the second one ends active, whichever decode finishes last. The first one's result is discarded and allocates no GPU texture, and only the newest load's progress is shown.
27. **Drop safety [MVP].** For a file drag outside the two drop zones, the document guard cancels both `dragover` and `drop`: synthetic dispatches return `false`, and `dropEffect` is `'none'`. So a real drop never navigates the page away. The HDRI panel shows the info line.
28. **Corrupt files [MVP].** A truncated flat `.hdr` and a truncated RLE `.hdr` each fail with `Could not decode the HDR file (corrupt or truncated data).` The previous HDRI stays `ready`, and the console shows no `THREE.RGBELoader` error (`hdri_errors.json`, `console.json`).
29. **WebGL 2 [MVP].** On a WebGL 1 context, the HDRI panel shows the WebGL 2 message, its inputs are disabled, and nothing else in the app changes.
30. **Context restore [MVP; reflections: T12].** After `webglcontextlost` and `webglcontextrestored`, the projection reappears with no user action, and (T12) the reflections are rebuilt.
31. **Harness isolation [MVP; auto-relink: T8b].** Every fresh-page step of the `hdri` scenario clears origin storage first, so its outputs do not depend on scenario order. (T8b) A separate step proves the auto-relink, and "Forget cached HDRIs" removes it.
32. **Allocation-free tick [MVP].** During continuous camera motion, `HdriController.tick` allocates no objects: one payload object is reused, rotation changes are compared as numbers, and follow emissions are limited to 10 Hz (unit test; manual allocation timeline).
33. **Car quality bar [T10; gate for T11].** The bundled `.glb` that becomes the `gltf` car meets all of the following, checked by `tools/check-car-asset.mjs` and recorded in the manifest:
    - **Smooth, curved body after Blender prep:** the paint materials have at least 10,000 triangles, and at most 10 % of their vertex positions carry more than one normal (hard edges only, auto-smooth 30°), so the reflection of a straight horizon reads as one continuous curve along the body, not as facets.
    - **Separate materials:** at least one paint, one glass and one tyre material, listed in the manifest, so `#car-paint` is enabled and recolours the body only.
    - **Budget:** 10,000 to 150,000 triangles in total, at most 2.5 MB, at most two textures of at most 2048², no Draco, Meshopt or KTX2 (6.10).
    - **Sign-off:** the owner approves a side-by-side render (the same HDRI, camera and `gloss` finish for every candidate, with the legacy box car for scale) before T11 starts. The render and the approval are attached to the T10 pull request. A candidate that fails a bullet is not shipped; relaxing a bullet is an explicit owner decision recorded in Q3.

---

## 10. Task breakdown

### 10.1 Tasks

Effort: S ≤ 0.5 d, M 1-2 d, L 3-5 d, XL > 5 d.

| # | Task | Effort | Release | Depends on |
|---|---|---|---|---|
| T0 | **Deleted** (07 C12): the single renderer is spec 07 R1-R3 | - | - | - |
| T1 | Loader access: verify 07's `createHdrLoader` in `vendor/three-addons.js` (SRI, failure path, shared promise, a load-failure test page). If 07 I3 shipped without loader factories, add them to 07's module, to 07's contract (+0.5 d). | S (0.25 d) | MVP | 07 I3 |
| T2 | Pure modules with unit tests: `HdriSettings`; `ContentMode.HDRI` + `setContent`; `EquirectProjection` (without coverage); `EnvImageOps` (including the `floatToHalf` port and Auto EV); `HdriFileInfo` (Radiance, PNG, JPEG + segment walk, limits, `safeZipName`) | M (1.5 d) | MVP | Phase 1 |
| T3 | `DeviceCaps`; `HdriDecoder` (`.hdr` with the `console.error` capture and the null/short checks; the LDR fallback chain; `measureLdr`); `HdriEnvironment` (half/sRGB8 textures, replacement rule, thumbnail, stats, context restore) | M (1.5 d) | MVP | T1, T2, H1 (B-H5), 07 R1 |
| T4 | `HdriProjectionMaterial`, the `LEDMaterialFactory` branch, `WallController.setContentMode` (the only content writer; `setLedSim`/`setPanelIds` as wrappers) and `rebuildSeq` (plus `currentLayout` if spec 02 has not landed), the marker at `RENDER_ORDER.HDRI_MARKER` with 06's colours, the `DISPLAY_CONTENT_CHANGED` payload, `HdriProjectionView.tick` (marker), the `HdriController` core (load token, `restore` skeleton, the `clear` invariant, `tick(now)` with the reused payload and the 10 Hz follow, `autoExposure`), the `ColorManagement` GLSL, rebuild-policy tests | M (2 d) | MVP | T3, 07 R3 |
| T5 | UI: `WallContentPanel` (radio disabled rule), `HdriPanel` (drop zones, overlay counting, document guard, status states, thumbnail, inputs, Auto EV, badge placement and `ResizeObserver`), the `WallDisplayPanel` mirror fix (Panel IDs section collapsed with its hint), `css/features/hdri.css`, **RB-2** | M (2 d) | MVP | T4 |
| T6 | The `'hdri-point'` Selectable (v2: `isSelectable`, `allowedAxes`, `getTransform`, `applyTransform` with phases and relative snapping), the `revalidate()` calls on unselectable transitions, `registerActions` for 07's four rows, spec 03 `stageAnchored` (clamped `translateStage`) | M (1 d) | MVP | T4; 07 I1, I2, I3 |
| T7 | Backdrop dome on `ENVIRONMENT` (`BackSide`, the `w = 0` vertex shader) and the pilot seam check | S (0.5 d) | MVP | T4; 07 R1 |
| T8 | Persistence on 07 v2: the `hdri` rows in `ProjectSchema` and the validator; the writer rules (always written, invariant defence, variants, `hdriZipPath`); `restore(v)` with its resolution order (session map, ZIP entries, missing); relink; `provideZipEntries`/`zipEntry`; the ZIP entry; `#hdri-include-in-zip`; history rows; **RB-3** | M (1.5 d) | MVP | 07 D4, D5, D6 (H1 for the records); T5 |
| T9 | Harness: the fixture generator (flat, RLE, truncated), `hdri_flat`, the independent oracle, the wall-rectangle pixel search (colour from the palette hook, 07 C53), the two-shot seam probe, the keyboard step, the error files, the relink/ZIP fresh pages with storage clearing, the drop guard, **RB-4** | M (2 d) | MVP | T5-T8 |
| T14 | README "HDRI previs" section, the manual QA checklist (8.4), a performance pass on the reference machine | S (0.5 d) | MVP | T1-T9 |
| (T15) | **Withdrawn (07 C58).** The cross-spec edits of 5.11 and the ARCHITECTURE section 9 rewrite are applied by 07's consolidated D0 (counted in spec 07), before T6 and T8. The per-task ARCHITECTURE amendments stay with each task. | – | – | – |
| T8b | `HdriCache` (IndexedDB, LRU, availability), the Remember/Forget UI, the `hdri_remember` preference, auto-relink in `restore`, **RB-7** | M (1.5 d) | Increment | T8 |
| T17 | EXR: `createExrLoader` with fflate, `readExrHeader` and feature rejection, the decoder path, messages, fixture, **RB-8** | M (1 d) | Increment | T3, T9 |
| T18 | Quality tiers: `#hdri-quality`, `maxQuality`, 2K default on low-memory devices, the 8K confirmation, re-decode from the session blob, the out-of-memory fallback, **RB-8** | M (1.5 d) | Increment | T5 |
| T19 | LED pixel mask: slider, mask tile (`refreshMaskTile`), `#led-sim-options` in HDRI mode, **RB-8** | S (0.5 d) | Increment | T5 |
| T20 | Coverage outline: `wallCoverage` with pooled buffers, `setCoverageWanted` (IntersectionObserver), thumbnail drawing, **RB-8** | M (1 d) | Increment | T5 |
| T21 | Sample HDRI: a Poly Haven 1K `.hdr`, its manifest with `sha256`, `loadBundled`, restore by sha, `LICENSES.md`, **RB-8** | S (0.5 d) | Increment | T8 |
| T10 | Car asset: licence verification, Blender prep of the Q3 candidates (material split, smooth shading, CarConcept's budget cuts and logo removal), validator, `tools/check-car-asset.mjs` (AC 33), manifest (`default` = `DEFAULT_CAR_MODEL_ID`, attribution), `assets/LICENSES.md`, the side-by-side render for the owner's sign-off | M (1.5 d) | Car increment | Q3 |
| T11 | `CarAssetLibrary`, `GltfCarPropView` (fallback, normalisation, finish presets, the Option L patch), `PropController.refreshView`/`anchorY`, `CarModelPanel` (with the CC BY credit line when the entry has an `attribution`), the `props.car.model` schema rows, the apply hook, **RB-5a** (+ optional **RB-5**) | M (2 d) | Car increment | T1, T8, T10 and the owner's side-by-side sign-off (AC 33) |
| T12 | `EnvironmentBuilder` (PMREM, rotate pass, studio), the HDRI reflection PMREM with its throttle, `SceneManager.setEnvironment`/`setPunctualLightScale` (07 0.2), `CarModelController.tick` (`hdri`, `studio`), the float-target gate, context restore | M (2 d) | Car increment | T11 |
| T12b | `StageReflectionProbe` (cube pass, motion gating), the `stage` source and the `auto` rule | M (1.5 d) | Stage-reflection increment | T12 |
| T13 | Bake: `HdriBake` + `HdriBakeService` (spec 04 contract, 6.12), UV-viewer wiring, per-section or atlas textures per combined layout, the panel-UV rule, MTL/glTF references, the pixel map, **RB-6** | L (3.5 d) | Bake increment | Spec 04 per-section UVs + `TEXCOORD_0`, B-H3 chunked base64, the B-L4 guard, spec 02 post-transforms, T9 |
| T16 | **Deleted**: the WebGL 1 / RGBE fallback QA (WebGL 2 only) | - | - | - |

### 10.2 Release plan and totals

The owner asked for an HDRI upload projected on the wall, with basic controls for the projection point and the rotation; the car was optional. The **MVP** delivers exactly that, plus what makes it usable and safe to ship:
- `.hdr`, `.jpg` and `.png`;
- WebGL 2 only, with a clear message otherwise;
- one working size (4K, or 2K when `maxTextureSize` is small);
- Film-camera and custom projection points with the gizmo;
- yaw, pitch, roll and EV, with Auto EV and the auto tone map;
- the backdrop dome;
- by-reference JSON with manual relink and the ZIP option;
- 07's shortcuts;
- the harness scenario.

Everything else ships as an increment that the owner approves on its own (Q19).

| Release | Tasks | Effort |
|---|---|---|
| **MVP** | T1-T9, T14 | **about 12.75 engineer-days** |
| MVP reconciliation (docs) | – | 0 here: 07's consolidated D0 (07 C58) |
| Look and convenience increments (each optional) | T19 (0.5), T20 (1), T8b (1.5), T17 (1), T18 (1.5), T21 (0.5) | 6 days in total |
| Reflective car | T10, T11, T12 | 5.5 days |
| Stage reflections | T12b | 1.5 days |
| Bake for export | T13 | 3.5 days (after spec 04) |
| **Everything** | | **about 29.25 days** |

The plan review adds 0.5 day to T10 (the quality bar, the second candidate and the side-by-side render). Revision 3 counted about 31 days; revision 3.1 removes T15's 2-3 days (07's consolidated D0 does the documentation) and RB-2b's badge re-baseline (07 C35). Compared with revision 2 (32-35 days):
- T0 (−3 d), T16 (−1 d) and the WebGL 1/RGBE paths in T3, T12 and the harness (about −2 d) are gone;
- `HdriCache` is now built here, because 07 H4 is withdrawn (+1 d).

Spec 07's U3b port (M) is counted in spec 07's Track F.

**Recommended increment order.**
1. T19 and T20 (the look of the MVP).
2. T8b (auto-relink removes the most friction in daily use).
3. The car (T10-T12).
4. T13, as soon as spec 04's UVs land.
5. T12b after the car.
6. T17, T18 and T21 on demand.

**Critical path to the MVP**, from the Phase 1/2 merge: spec 07's chains (R1-R3: 4.5 d; I1-I3: 9 d; D1-D5/D6: about 13 d) run alongside T2-T5 and T7, which need only R1-R3 and fakes. T6 waits for I3, and T8 waits for D6. What remains after the later of the two is T6, T8, T9 and T14 (about 5 days). So the MVP can land about one working week after 07's I3 and D6, if T1-T5 and T7 were built in the meantime.

---

## 11. Risks and open questions

### 11.1 Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Spec 07 foundations (R1-R3, I1-I3, D4-D6) land later than planned | The MVP release slips | T2-T5 and T7 need only R1-R3 and fakes; T6 and T8 are the only tasks gated on I3 and D6. No fallback implementation is written (07 C12), so nothing is built twice. |
| R2 | `onBeforeCompile` chunk replacement (Option L, T11) is coupled to r128 chunk names | A silent no-op would give dark or over-bright cars | `patchSceneReferred` asserts that each anchor exists and throws in development; a unit test uses the r128 chunk text copied as fixtures; removed in 07 U3b |
| R3 | Memory on large HDRIs: HDR decode about 230 MiB at the default cap; (T18) 8K about 256 MiB GPU; (T17) EXR CPU peak up to 450 MiB; a 16K LDR is decoded by the browser at up to 512 MiB outside the JS heap; iOS tab limits are about 300-400 MB | Context loss or a tab crash | Header-only rejection before any decode (6.9); per-device source caps (lower on low-memory devices and iOS, and lower for HDR than for LDR); one 4K working size in the MVP; (T18) 8K gated and confirmed, with a one-time automatic fall back to 2K on an upload error; spec 07's `webglcontextlost` handling and this feature's `onContextRestored` |
| R4 | Main-thread decode blocks the UI (an 8K `.hdr` takes about 1.5-2 s) | Jank | Progress states; the resample yields every 64 rows; a classic-script Worker (`importScripts` of the pinned URLs) as a follow-up |
| R5 | The headless harness GPU (SwiftShader) differs from desktops: it supports WebGL 2, but float render targets may be missing | The car steps (T12) resolve to `studio` in the harness | `hdri_status.json` records the caps; the car steps assert the caps-dependent expectation; the MVP needs no render targets; baseline and candidate run on the same machine |
| R6 | Stage-capture cost in panel mode (3,200 meshes × 6 faces, T12b) | Frame hitches while dragging or flying | Motion gating in `CarModelController.tick`: no capture during motion in panel mode, at most every 500 ms in the other modes, and a trailing capture 150 ms after motion stops |
| R7 | Back faces show the projection before spec 01 F1-5 (DoubleSide) | An odd look from behind | Accept until F1-5; the back shell then handles it |
| R8 | Kenney models are stylised, low-poly and single-material | Reflections look faceted, and the paint cannot be recoloured | The quality bar (AC 33) rejects such an asset unless the owner relaxes it explicitly; Q3 names CarConcept (CC BY 4.0) as the higher-fidelity candidate and keeps Kenney only as the fallback; Blender prep (T10: split materials, smooth shading) and the side-by-side sign-off |
| R9 | Trademarked car designs in "free" models | Legal exposure in a public repository | Only generic designs; the licence is recorded in `assets/LICENSES.md`; CC0 does not grant trademark rights |
| R10 | jsdelivr is unavailable | The HDR (and later EXR and glTF) loaders fail | User-visible messages; the procedural-car fallback; JPG/PNG still work through `createImageBitmap` (`.hdr` needs the loader); vendoring the scripts into `js/vendor/three/` (same SRI) remains possible (07 11.1) |
| R11 | Harness churn from UI and schema additions | Review fatigue | RB steps are split by kind (UI, badge token, schema, scenario, each increment). The UI step keeps every canvas screenshot identical. The badge step's diffs are confined to one rectangle. Schema steps are checked with a JSON diff. |
| R12 | Specs 07, 02 and 04 drift from this spec again | Rework; two schemas | The decision record in the header, mirrored in 07 0.1. 07 section 0 is binding. 07's consolidated D0 applies every cross-spec edit in one docs commit (07 C58). 07 4.4 rule 6 requires an amendment for any path change. |
| R13 | Browser support of `createImageBitmap` options varies (unsupported enum values throw `TypeError`) | LDR loads fail on some engines | The three-step fallback chain (6.9) with unit tests; still no full-size canvas in the page |
| R14 | r128 `RGBELoader` reports corrupt bodies only through `console.error` and a `null` or short result | Unhelpful errors and console noise | `#parseRgbe` captures the console call during the synchronous `parse`, restores it in `finally`, and checks both `null` and short data. Truncated flat and RLE fixtures cover both paths. |
| R15 | The harness shares one Chrome profile, so IndexedDB and `localStorage` leak between pages | Order-dependent outputs once T8b lands | `freshPage({clearStorage: true})` on every fresh page; a dedicated auto-relink step (T8b); a recommended per-scenario browser context (07 G3) |
| R16 | Scope creep beyond the owner's "basic controls" | Feature 5 takes a month before anything ships | MVP first (about 12.75 d); every increment is approved on its own (Q19) |
| R17 | A future code path sets the HDRI content with no source | A saved file reopens in a different mode with a warning | `setContentMode` refuses it; the writer's defence; the invariant unit test runs over every use case |

### 11.2 Open questions for the owner (each with the recommended default)

| # | Question | Recommended default |
|---|---|---|
| Q1 | Colour pipeline for the car on r128: scoped (Option L) or global sRGB plus ACES (Option G)? | **Option L** on r128: zero drift in existing visuals. Option G comes with 07's U3b. |
| Q2 | Should the car default to the glTF model? | **Yes**, but in its own commit after the look is approved (RB-5). "Approved" means the side-by-side render of AC 33, signed off before T11. Until then it defaults to `procedural`. |
| Q3 | Which car asset? | **Khronos CarConcept (CC BY 4.0, by Eric Chadwick, © 2024 Darmstadt Graphics Group GmbH; 6.10)**, prepared in Blender to the 6.10 budget and the quality bar (AC 33), with its credit shown in `#car-model-status` and `assets/LICENSES.md`. **Fallback:** the Kenney Car Kit sports or sedan model (CC0), which is smaller but stylised and single-atlas, so it passes AC 33 only if you relax the bar explicitly. T10 prepares both, and you choose from the side-by-side render before T11. If CarConcept cannot meet the 2.5 MB budget after the cuts, the options are a larger budget for this one asset (stated in the manifest) or the Kenney fallback. |
| Q4 | Wall content UI: a segmented control with hidden legacy toggles as proxies, or a third toggle ("Project HDRI")? | **Segmented control.** The legacy toggle ids stay as hidden proxies, kept in sync with the model, until the harness scenarios migrate; they are then removed in a follow-up. |
| Q5 | Default projection point? | **The film camera's nodal point**; custom on demand. |
| Q6 | Default car reflections (`auto`)? | **LED stage when the wall shows HDRI (from T12b; HDRI before that), else HDRI when loaded, else studio.** This teaches that a volume only reflects what the wall emits. |
| Q7 | Bundle a sample HDRI for "Try sample" (and as a demo)? | **Yes, as increment T21.** A Poly Haven 1K `.hdr` (CC0, about 1.5 MB) in `assets/hdri/`, listed in `assets/LICENSES.md`, recognised on restore by its `sha256`. |
| Q8 | Remember HDRIs on the device (IndexedDB) so that reopening a project auto-relinks? | **Yes, as increment T8b, opt-out:** "Remember on this device" is on by default, with at most 3 HDRI blobs and 300 MB (least recently used evicted) and a "Forget cached HDRIs" button. `HdriCache` is the roadmap's only IndexedDB store (07 C20). |
| Q9 | Working quality? | **MVP: 4K** (2K when `maxTextureSize < 4096`). T18 adds 2K/4K/8K, with 2K by default on low-memory devices and 8K only with confirmation on capable devices. |
| Q10 | Default tone map? | **`auto`** (ACES for HDR/EXR, clip for LDR). The select stays in the MVP because it is one control and the field is persisted anyway. |
| Q11 | Persist export choices (bake on/off, include the HDRI in the ZIP) in the project JSON? | **No.** Session UI state only. Include the HDRI by default when it is ≤ 50 MB. |
| Q12 | Bake density (T13)? | **1 px per LED source pixel** (a true pixel map). Offer ×2 and ×4 later if DCC previews need it. |
| Q13 | EXR support? | **Increment T17 (lazy; adds fflate and EXRLoader, about 86 KB on first use).** `.hdr` covers most previs HDRIs. |
| Q14 | Allow user-uploaded car or vehicle `.glb` models? | **Not now.** Revisit with by-reference persistence like `hdri.source` (07 keeps the `model` asset kind reserved). |
| Q15 | Backface appearance before spec 01 F1-5? | **Accept** (R7). Do not add shader back-face logic that F1-5 makes redundant. |
| Q16 | Keyboard: are `H` and comma/period acceptable? | **Yes.** They are spec 07's existing `KEYMAP` rows, and they are free across the legacy keys and specs 01, 02, 03, 04, 07 and 09. |
| Q17 | Add an "Inner frustum only" projection option, so that `stage` reflections depict a real ICVFX setup? Inside the camera frustum it would project from the camera; elsewhere from the custom point or the stage centre, with a soft edge. | **Not in the MVP; yes in v1.1.** The MVP documents the limitation (1, `#hdri-point-note`). The option needs the frustum test in the shader (a camera view-projection uniform) and a blend-width control; about 2 days. |
| Q18 | three.js version for Feature 5? | **r128 (plan of record; 07 C13 and Q1).** 07's U3b ports Feature 5 after the upgrade (6.11). The "upgrade first" alternative costs about 3-5 extra days and delays Feature 5 (07 5.7.1). |
| Q19 | Ship the MVP first and approve each increment separately? | **Yes.** MVP (about 12.75 d) first. Then, in order: T19+T20, T8b, the car (T10-T12), T13 when spec 04 lands, T12b, and T17/T18/T21 on demand (10.2). |
| Q20 | The Radiance `EXPOSURE=` header: apply 1/exposure or ignore it? | **Ignore it**, as three's loaders and most viewers do. The EV slider and Auto EV handle absolute scale (6.9). |

---

## Appendix A: verification log (three.js r128, fetched from `cdn.jsdelivr.net/npm/three@0.128.0/` on 2026-10-16)

| Claim | Source checked |
|---|---|
| `equirectUv(dir)` is `atan(dir.z, dir.x)·RECIPROCAL_PI2 + 0.5`, `asin(clamp(dir.y))·RECIPROCAL_PI + 0.5` | `src/renderers/shaders/ShaderChunk/common.glsl.js` lines 121-127; `ShaderLib/equirect_frag.glsl.js` uses it |
| `RGBELoader`: default `type = UnsignedByteType`; supports `FloatType` and `HalfFloatType` (`THREE.DataUtils.toHalfFloat`); `load()` sets `flipY = true` and the encodings and filters; `parse()` does not; it accepts only `-Y h +X w` | `examples/js/loaders/RGBELoader.js` lines 10, 110, 353-481 |
| `RGBELoader` header (`RGBE_ReadHeader`): the first line `/^#\?(\S+)/` else "bad initial token"; `FORMAT=` via `/^\s*FORMAT=(\S+)\s*$/`; the size via `/^\s*\-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/`; the loop scans every line and breaks once both are valid; the errors "missing format specifier" and "missing image size specifier"; there is no blank-line rule. Flat data when `scanline_width < 8 \|\| > 0x7fff \|\| buffer[0] !== 2 \|\| buffer[1] !== 2 \|\| buffer[2] & 0x80` | `examples/js/loaders/RGBELoader.js` (re-checked 2026-10-16 in review) |
| **`RGBELoader` failure behaviour:** `rgbe_error` only calls `console.error('THREE.RGBELoader Read Error: …' / 'Bad File Format: …' / 'Error: …')` and returns `RGBE_RETURN_FAILURE` (−1); `parse()` then returns **`null`** (it does not throw). The flat branch of `RGBE_ReadPixels_RLE` returns `new Uint8Array(buffer)` **without a length check**. The success object is `{width, height, data, header, gamma, exposure, format, type}`. `EXPOSURE` is read with `/^\s*EXPOSURE\s*=\s*(\d+(\.\d+)?)\s*$/` (default 1.0). | `examples/js/loaders/RGBELoader.js` (fetched 2026-10-16, revision 3) |
| `EXRLoader`: requires the global `fflate` for ZIP, PIZ and DWA; supports NO, RLE, ZIPS, ZIP, PIZ, PXR24, DWAA and DWAB, but not B44/B44A; flips rows itself (`height − 1 − y`) and sets `flipY = false`; always outputs 4 channels (`numChannels = 4`); throws plain strings | `examples/js/loaders/EXRLoader.js` lines 1187-1193, 1750, 1911-1952, 2095-2178 (channels and throws checked in review) |
| `examples/js` files are IIFEs that assign `THREE.X = X` | the tails of `RGBELoader.js`, `GLTFLoader.js` and `EXRLoader.js` |
| `GLTFLoader` supports `KHR_materials_clearcoat` (→ `MeshPhysicalMaterial`), `KHR_materials_unlit` and `KHR_texture_transform`; Draco only with `setDRACOLoader`; sets sRGB on `map` and `emissiveMap` | `examples/js/loaders/GLTFLoader.js` lines 112-132, 321-326, 2673-2674 |
| `fflate.min.js` (0.6.9, MIT) and `environments/RoomEnvironment.js` exist for r128 | HTTP 200 |
| `PMREMGenerator`: `fromScene`, `fromEquirectangular`, `fromCubemap`, `compileEquirectangularShader`, `dispose`; the cubeUV target is `RGBEFormat`/`UnsignedByteType` with `encoding: _isLDR(texture) ? texture.encoding : RGBEEncoding`; the input is decoded from `texture.encoding`; the equirect shader does a **manual 4-tap bilinear** at texel centres (`f = fract(uv / texelSize − 0.5)`); the cubemap shader samples `vec3(−dir.x, dir.yz)` unconditionally | `src/extras/PMREMGenerator.js` lines 135-216, 249-265, 394-395, 541-547, `_allocateTargets`, `_getEquirectShader`, `_getCubemapShader` (bilinear and target encoding re-checked 2026-10-16) |
| `WebGLCubeRenderTarget(size, options)` sets `texture._needsFlipEnvMap = false`; `CubeCamera(near, far, renderTarget).update(renderer, scene)` | `src/renderers/WebGLCubeRenderTarget.js`, `src/cameras/CubeCamera.js` lines 9-100 |
| **`CubeCamera` child cameras share the cube camera's `layers`:** each of the six is created as `new PerspectiveCamera(fov, aspect, near, far)` followed by `cameraPX.layers = this.layers` (and likewise for the other five). A default `Object3D` has the layer mask `1`, so the probe sees layer 0 only unless its `layers` are changed. | `src/cameras/CubeCamera.js` (fetched 2026-10-16, revision 3) |
| `DataUtils.toHalfFloat(val)`: a shared `Float32Array`/`Int32Array` view; sign; an exponent below 103 → signed zero; above 142 → Inf/NaN; below 113 → a denormal with rounding; otherwise rebias and round on the extra mantissa bit ("faster than the OpenEXR implementation and includes rounding"). There is no `fromHalfFloat`. | `src/extras/DataUtils.js` (fetched 2026-10-16, revision 3) |
| Program parameters: `toneMapping: material.toneMapped ? renderer.toneMapping : NoToneMapping`; `outputEncoding` from the render target texture or the renderer; `scene.environment` only for `isMeshStandardMaterial`; `customProgramCacheKey()` in the key | `src/renderers/webgl/WebGLPrograms.js` lines 113-115, 174, 249, 271, 318 |
| Non-raw shaders get `encodings_pars_fragment` (`sRGBToLinear`, `LinearTosRGB`, `RGBEToLinear`, `LinearToRGBE`) in their prefix; the tone-mapping functions only when tone mapping is active. On WebGL 2, non-raw `ShaderMaterial`s are compiled as GLSL ES 3.00 with the compatibility defines. | `src/renderers/webgl/WebGLProgram.js` lines 404, 644-655; `ShaderChunk/encodings_pars_fragment.glsl.js` |
| ACES constants and `RRTAndODTFit` (with `/ 0.6`) | `ShaderChunk/tonemapping_pars_fragment.glsl.js` lines 35-75 |
| The `meshphysical` fragment ends with `#include <tonemapping_fragment>` and then `#include <encodings_fragment>` | `ShaderLib/meshphysical_frag.glsl.js` lines 120-121 |
| `Raycaster.layers` exists, and `intersectObject` tests `object.layers.test(raycaster.layers)`; `Layers.enableAll()` | `src/core/Raycaster.js` lines 14, 90; `src/core/Layers.js` line 21 |
| `WebGLRenderer`: WebGL 2 is tried first; `setViewport`/`setScissor` take CSS px × the pixel ratio; `EXT_color_buffer_float` is requested on WebGL 2; `OES_texture_float_linear` is requested | `src/renderers/WebGLRenderer.js` lines 213, 462, 494; `src/renderers/webgl/WebGLExtensions.js` lines 56, 71 |
| `Matrix3.setFromMatrix4/transpose/fromArray`, `Color.convertSRGBToLinear`, `MeshPhysicalMaterial.clearcoat/clearcoatRoughness/transmission`, `Texture.unpackAlignment` | `src/math/Matrix3.js`, `src/math/Color.js`, `src/materials/MeshPhysicalMaterial.js`, `src/textures/Texture.js` |
| WebGL 2 (OpenGL ES 3.0): `RGB16F`/`RGBA16F` are texture-filterable without extensions, and non-power-of-two textures support `REPEAT` | OpenGL ES 3.0.6 specification, table 3.13 and section 3.8.10 |

**SRI (sha384, computed from the served bytes):**

| File | Bytes |
|---|---|
| `RGBELoader.js` | 12,572 |
| `GLTFLoader.js` | 96,550 |
| `EXRLoader.js` | 55,846 |
| `fflate.min.js` | 30,081 |
| `RoomEnvironment.js` | 3,425 |

The hashes are in 5.3. They are handed to spec 07's `vendor/three-addons.js` (5.11 edit d).

**Licence sources:**
- [Kenney Car Kit](https://kenney.nl/assets/car-kit) ("Creative Commons CC0");
- [Kenney Car Kit on itch.io](https://kenney-assets.itch.io/car-kit) ("CC0 1.0 Universal"; OBJ, FBX, glTF);
- [Quaternius Lowpoly Cars](https://quaternius.itch.io/lowpoly-cars) and its [OpenGameArt copy](https://opengameart.org/content/lowpoly-cars) (CC0; FBX, OBJ, Blend);
- [Poly Haven licence](https://polyhaven.com/license) ("Our assets are all licensed as CC0");
- [Khronos glTF-Sample-Assets, CarConcept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept) ("Creative Commons Attribution 4.0 International"; checked on 2026-10-16 for the plan review).
