# Feature 3: Configurable wall pivot point and pivot offset

| | |
|---|---|
| **Status** | Implementation-ready specification (Phase 3). **Plan review (2026-10-16):** Q5 now states its export consequence and is raised in the plan next to Q2; Q1 gains an optional per-device default for new projects through 07's `app/Prefs` (T17, C19); D5 notes that detaching a chain section (spec 02 T17) is a generative edit. **Revision 3.1** applies the cross-spec consistency review (07 §0 C32-C62): the single composition pipeline is recorded as 07 C32 (5.10); the path-B hook set becomes `allowedAxes(mode)` (`null` = unsupported, replacing `allowedModes`) and `endGizmoDrag({cancel})` (no `cancelGizmoDrag`, no argument-less `endGizmoDrag`; C33); the HDRI point's kind is `'projector'` (C36); the marker uses `RENDER_ORDER.PIVOT_MARKER` (996) and two-tone 06 colours, and its pick proxy is on `HELPERS` (C56); scalers register through `SceneManager.addPreRender` (C46); every `translateStage` clamps through `LIMITS` and the orbit joins `stageAnchored` from 07 I4b (C45); step F reads `FramingPolicy`'s three named boxes (C34) and is counted only in 08 (T11 dropped); feature keys are absent until T7 (C39); this spec adds no help-badge token (C35); T13 keeps only the owner sign-off (07 D0 does the documentation). Revision 3: resolves the review of revision 2. Changes: spec 02's current hook set and composition rule are adopted unchanged (5.10.1); a cancelled drag now swallows the rest of the mouse gesture (5.4); step F is the roadmap's P2-11c commit itself (6.6); the help-badge edit moves to spec 02's step D2; the JSON and ZIP allowed kinds of steps A′ and C are corrected; pick priority applies only against wall hits; the gizmo re-anchors on rebuilds; the panel status is derived from event payloads; the CSS, harness and estimate details are completed. |
| **Builds on** | `docs/ARCHITECTURE.md` (binding contract), `docs/REFACTOR_PLAN.md` (Phase 3 order: 1, 6, **3**, 2, 4, 5; Phase 2 item 11 pairs B-M10, B-L2 and B-M15 with this feature). |
| **Legacy reference** | `index.html@cd3fd3f`. Line numbers below refer to that file. Bug ids refer to the verified defect list ([`docs/DEFECTS.md`](../DEFECTS.md): `B-H*`, `B-M*`, `B-L*`). Roadmap ids (`P2-*`) refer to `docs/improvements/08-bugfix-roadmap.md`. |
| **Hard prerequisites** | Phase 1 merged (WP1-WP10). **Merge gates (roadmap §1.1, F3 row): P2-3, P2-8 and P2-13e (persistence only).** Only T7 (persistence, step A′) actually depends on them: on P2-3 for its B-L8 `ProjectValidator`, and on P2-13e for the B-L31 v2 writer. P2-8 is kept as a merge gate for ordering only. No task depends on it: offsets never use `orDefault`, the `posZ` branch handles B-L9 itself where it matters (4.1), and B-L15 is documented (2.3). Every task is identity-exact with or without it. If the owner wants F3 earlier, P2-8 can become a soft gate without any change to this spec. |
| **Gating tasks** | **T13 is a hard gate for T5:** the owner signs off the shared hook set and the amendments of 5.10.1 (already applied to spec 02 and spec 07 by 07's consolidated D0) before T5 starts. **T13 is done:** signed off by the owner on 2026-10-16 (IMPROVEMENT_PLAN §8, A7: the recommended default), recorded in 5.10.1 and in spec 02 §10.3, and confirmed on 2026-10-17 when the owner made this feature and spec 04 the next priority. Step C (marker visible by default, T9) waits until B-M11 is fixed, by roadmap P2-10a **or** spec 07 R1 (07 C31, C55); P2-10a landed on 2026-10-17. |
| **Sequencing (owner, 2026-10-17)** | "Fastest, session-only" (IMPROVEMENT_PLAN §8, decided 2026-10-17): this feature is built **without** project file v2. T7 (step A′) waits for M7a (08 P2-13e with P2-8b-d, 07 D1-D7), and with it the v2 half of T9. Until then the pivot, its offset and the keep-stage toggle last for the session only: Export JSON and Export All (ZIP) write no `pivot` block, and an import (always a v1 file) resets the pivot to the identity (4.4, Q14). Every other task (T1-T6, T10, T12) is unchanged; the panel and the README release note say that the pivot is not saved. |
| **Coordinates with** | Spec 02 (per-section offsets and the shared `Selectable`/`TransformGizmo` hook set; the agreed contract is in 5.10). Spec 05 and spec 07 (helper layers, F0-e; 07's I3 gizmo port and picking rule). Spec 06 (theme keys and the export-header re-baseline). Roadmap P2-11 (P2-11c **is** step F), P2-10a (B-M11), P2-8 (B-L9), P2-5 (B-M1/B-M15), and the B-L1 decision (6.9). |

---

## 0. Decisions at a glance

| # | Decision | Section |
|---|---|---|
| D1 | There are three anchor modes: `bottom-left` (today's behaviour and the default), `mesh-center` (the true bounding-box centre, **including y = half the tallest section**) and `wall-center` (the midpoint of the first section's first bottom vertex and the last section's last bottom vertex, y = 0). Other readings of "middle of wall mesh" (the surface centre, per-section origins) are raised with the owner in Q2 and Q13; the mode enum is the extension point (6.1). | 6.1, 11.2 |
| D2 | **Pivot point P = anchor(mode) + offset.** The offset is a Vec3 in metres, in layout axes. It moves the pivot relative to the wall, as in a DCC. It does **not** move the wall relative to the pivot: exported vertices are `x_E = x_L − P`. Spec 02's current revision already uses this sign and placement (its 6.17: no root group, no separate `W`; 5.10.1 #4). | 4.1, 6.2 |
| D3 | **Three frames.** The *layout* frame is the legacy world. In the *stage* frame the origin is the pivot projected onto the floor, O = (P.x, 0, P.z). In the *export* frame the origin is the pivot P itself. The viewport, camera, props, safe zone and grid live in the stage frame, where the floor is always y = 0. Every export is written in the export frame, so the DCC pivot is the file origin. | 5.1 |
| D4 | **The pivot is baked into the layout, not applied as a scene-graph root transform.** `layoutProject(project, {frame})` translates the raw walk once. Spec 02 then builds its per-section matrices from the translated geometry (spec 02 6.6, translation-equivariant). Every consumer (wall view, frames, safe zone, framing, picking, exporters) reads the translated layout. Nothing re-derives the transform. | 5.2, 5.10, 6.3 |
| D5 | The anchor is computed from the **generative** layout: the cursor walk and `generativeBounds()`, before spec 02's per-section offsets. Moving one section (its offsets or a gizmo drag) never moves the pivot. Adding, resizing or detaching a chain section is a generative edit and can move the `wall-center` and `mesh-center` anchors; `#pivot-status` reports the stage-origin shift (3.6; 02 6.17). | 5.10 |
| D6 | **Keep stage layout** is a persisted toggle, on by default. When the user changes the pivot (mode, offset or drag), the camera and props are re-expressed by −ΔO, so they keep their placement relative to the wall. Section edits and imports never re-express: stage coordinates are the source of truth between explicit pivot edits (rationale in 3.7; Q15). | 3.7, 6.5 |
| D7 | Dragging the pivot marker moves only the marker (a pending offset). The single commit and rebuild happen on mouse-up. Escape during the drag cancels **the drag only**, through the shared `endGizmoDrag({cancel: true})` hook (07 C33). The pivot stays selected, and the rest of the mouse gesture is swallowed: no orbit and no gizmo hover until the button is released (5.4). A second Escape deselects (spec 02's Escape order). | 3.3, 5.4, 6.7 |
| D8 | When the pivot is the identity (bottom-left, zero offset), every existing output is **byte- and pixel-identical** after step A. The visible additions (panel, marker, grid, true framing) each land in their own re-baselined step. | 8.4 |
| D9 | **One snapping model, shared with spec 02:** snapping is active only while Ctrl/⌘ is held during a gizmo drag, and it snaps the **dragged distance** (relative), never the absolute value. Axes that are not dragged keep their stored value bit-for-bit. | 6.7, 5.10.1 |
| D10 | **Framing:** step A switches `Strategies.framingBounds` to `'flat-pivot'` (translation-correct, identity-exact). Step F is the roadmap's **P2-11c commit itself**: `'layout'` framing as roadmap §6.10 defines it with `FramingPolicy`'s three named boxes (08 P2-13g, 07 C34): `generativeBox` (attached, pre-offset: the pre-I4b orbit re-target and this spec's `mesh-center` anchor), `wallBox` (`bounds()`, transformed, all sections: camera Reset and 07's `F`/open framing) and `stageExtent` (sections with \|n.y\| ≤ 0.9: D, frame width and height, `fits`), plus `facing`, the `resetTo` pan and the camera Z minimum removed, evaluated on `layoutProject(project)`. It is implemented once, by the roadmap, and counted only there (this spec has no step-F task); if P2-11c has landed before this spec, step F is empty. | 6.6, 8.4 |
| D11 | **One hook set, one composition rule** (07 C32, C33). The path-B `Selectable`/`TransformGizmo` hooks map one-to-one onto 07's Selectable v2: `kind`, `pickPriority`, `allowedAxes(mode)` returning `{x, y, z}` or `null` (`null` = the mode is unsupported; it replaces `allowedModes`, so the pivot returns `null` for `'rotate'`), `orientGizmo(rotation, mode)`, `beginGizmoDrag()`, `applyGizmoTranslate/Rotate(…, ctx)` with `ctx = {space, axisWorld, snap}`, and `endGizmoDrag({cancel})` only. `TransformGizmo.cancelDrag()` calls `target.endGizmoDrag({cancel: true})` and sets `interaction.gestureCancelled`. The composition rule: translate the raw walk, then `applySectionOffsets(out)` builds the section offsets from the translated geometry (07 C32). This spec lands both first (T5, T2), and spec 02 reuses them. If this feature lands after 07 I3, it implements Selectable v2 directly instead (path A, 5.4). | 5.4, 5.10 |

---

## 1. Summary and user value

**Problem.** The wall's pivot (origin) is hard-wired to the first section's first bottom vertex (`currentX = currentZ = 0`, 1483-1485). Every OBJ and glTF export puts the DCC/engine pivot at the far-left bottom corner. Virtual-production users then have to re-centre the wall by hand in Unreal, Blender or Maya each time, and redo it after every change.

The viewport's stage reference has the same bias:
- the orbit target, camera reset and frustum analysis all assume a flat wall starting at the origin (B-L2, B-M10);
- the camera "Z Distance from Wall" is just `posZ`.

**Users.**
- Stage designers and VP technicians who export the wall into a game engine (nDisplay, Disguise, Unity) or a DCC. They need the asset origin at a known stage reference: the wall centre on the floor, the volume's geometric centre, or a surveyed point such as the tracking origin, given as an offset.
- Previs users, who want camera and prop coordinates expressed relative to that same stage origin.

**Value.**
- A pivot mode and a Vec3 offset make every export land correctly in the target scene with zero manual repositioning.
- The pivot persists in the project file.
- Camera and prop coordinates read in the same frame as the exported asset.
- The orbit view and camera Reset centre on the real wall, whichever pivot is chosen. B-L2 is fixed by step F, the roadmap's P2-11c.

---

## 2. Current state

### 2.1 Legacy behaviour (`index.html@cd3fd3f`)

| Concern | Legacy behaviour | Lines |
|---|---|---|
| Implicit pivot | The cursor walk starts at `currentX = 0, currentZ = 0, currentAngle = 0`. Rows start at `y = row * panelH`, so the first section's first bottom vertex is the world origin. | 1483-1485, 1516-1525 |
| Wall placement | `ledWallGroup` has an identity transform. Combined and section vertices are baked in world space (`vertPositions.push(edge.x, y, edge.z)`). Panel meshes use `position.set(data.x, data.y, data.z)`. | 1602, 1720, 1796 |
| Grid and axes | `GridHelper(50, 50, …)` sits at `(12.5, 0, 12.5)`, so its lines fall at half-metre positions relative to the origin (verified against the r128 GridHelper source: centre lines at local 0, step 1 m) and it covers x, z ∈ [−12.5, 37.5], mostly in front of the wall. `AxesHelper(0.5)` sits at the origin. | 1446-1449 |
| Orbit target | `(Σ cols·w / 2 + off.x, maxH / 2 + off.y, off.z)`: a flat-wall assumption (B-L2). | 3756-3764 |
| Camera reset | `(W/2, H/2, 5)`, zero rotation (B-L2). | 2550-2575 (2559-2561) |
| Frame-at-wall status | `distToWall = posZ`. The wall is assumed to be `[0, W] × [0, H]` at z = 0, and rotation is ignored (B-M10). | 2471-2534 (2477, 2487-2493, 2506-2507) |
| Safe distance | The scalar D uses flat bounds. The band geometry follows the real walk (third copy) and overlaps or gaps on curves (B-M15). | 2595-2612, 2614-2647, 2668-2683 |
| Camera Z input | Labelled "Z Distance from Wall (m)", `min="0.1" step="0.1"`. The rule is `Math.max(0.1, parseFloat(v) \|\| 5)`, so typing 0 gives 5 (B-L9). No pilot or gizmo clamp exists on posZ. | 1060-1061, 4295-4299 |
| Camera height and props | `posY ≥ 0` (input and gizmo), the pilot clamp `posY ≥ 0.1` (3611), and props are placed at `y = 0` (2885, 2976). All of these assume the floor is y = 0. | 1056, 3340, 3611, 2885, 2976 |
| Mesh-mode radio cards | Every `.mesh-mode-option` label in the document gets the mesh-mode click handler (4156-4163), and the import mirror toggles `.active` on every `.mesh-mode-option` by `data-mode` (4993-4995). `.mesh-mode-option input { display: none; }` (353-355). | 325-375, 912-927, 4156-4163, 4993-4995 |
| Exports | `generateAllSectionsGeometry` (5012-5080) re-walks the layout and writes absolute coordinates. glTF nodes carry no translation (4826). The OBJ header is fixed (4556-4559). | 4556-4559, 4719-4721, 4826, 5012-5080 |
| Safe-distance OBJ | Writes the group's local `position` attributes, which are world coordinates because the group has an identity transform. It currently throws (B-M1). The group can be stale after the preview is turned off (B-M8). | 2786-2827, 2536-2548 |
| Persistence | JSON v1 has no pivot (B-L31). | 4942-4965 |

### 2.2 What Phase 1 provides (the seams this spec uses)

- **`js/domain/Wall.js`:**
  - `PivotMode = { BOTTOM_LEFT: 'bottom-left', MESH_CENTER: 'mesh-center', WALL_CENTER: 'wall-center' }`;
  - `WallPivot` with `mode`, `offset` and `isIdentity`;
  - `Wall.pivot`, which is always the identity in Phase 1;
  - `Wall.flatBounds()`, which carries LEGACY(B-L2, B-M10).
- **`js/geometry/WallLayout.js`:**
  - `computeWallLayout` (the single verbatim walk, with the B-L1 switch);
  - `layoutProject(project)`, the single entry point. Its documentation says "Features 2 and 3 add options here only";
  - `framingBounds(project)`, the single flat-bounds switch, with `Strategies.framingBounds = 'flat'`;
  - `WallLayout.firstEdge`, `lastEdge`, `bounds()` and `pivotPoint(mode)`. These are unit-tested but unused, and the mesh-centre y policy is left open: this spec settles it. `pivotPoint` throws `RangeError` for an unknown mode, and this spec keeps that;
  - the `SectionLayout.postTransform` hook (spec 02). Spec 02 removes the Phase 1 `postTransforms` option of `computeWallLayout` and writes the hook only in `applySectionOffsets`, after this spec's translation (5.10).
- **`js/geometry/WallMeshBuilder.js`:** `sectionGrid` (`y = row * sl.panelH`), `panelCorners`.
- **`js/render/LEDWallView.js`:** world-space baking, mesh tags, `sectionNodes()`, and `WALL_REBUILT {layout, meshMode, view}`.
- **`js/render/SceneManager.js`:** `grid`, `axes`, `addHelper`, `LAYERS` (not applied to existing helpers until F0-e, which spec 07 R1 delivers; spec 01 CR-6), `startLoop(tick)`. Roadmap P2-10a already hides every registered helper during the preview render (`preview.render(scene, sceneManager.helpers)`).
- **`js/interaction/OrbitController.updateTargetPosition`** (LEGACY(B-L2)), and `CineCamera.resetTo / coverage / maxSafeDistance` (LEGACY(B-M10) at `coverage`).
- **`js/interaction/SelectionManager`** (Selectable registry, `pickAt` LEGACY(B-M14)), **`TransformGizmo`** (`attach`, `detach`, `target`, `onMouseUp`, `SELECTABLE_MOVED`) and **`InputState.InteractionState`** (`pilotMode`, `isDraggingGizmo`).
- **`js/ui/WallDisplayPanel`** owns **every** `.mesh-mode-option` label in the document (it queries the class globally, as legacy 4156 does) and **`ViewportToolbar`** owns the selection badge (with `gizmo` injected).
- **`js/io/ObjExporter`, `GltfExporter`:** they receive `layout` from `ProjectIO` through `wallController.layout()` and never read the scene, except `writeSafeDistance(group)`.
- **`js/io/ProjectSerializer`:** the v1 writer, with `read()` as the version-dispatch seam.
- **Harness:** `scenarios-extra.mjs` `pageMeshModes()` records every `.mesh-mode-option` in the page (the `import_edge` state outputs), and `lib/app.mjs` `selectMeshMode` clicks inside `#mesh-mode-select`.

Consequence for this spec: the pivot radio cards must **not** reuse the `.mesh-mode-option` class. Doing so would bind the mesh-mode handler to them (clicking "Wall centre" would set `meshMode = 'wall-center'`), let the import mirror clear their `.active` state, inherit `input { display: none }`, and change the `import_edge` golden state. They get their own `.pivot-mode-*` classes (3.2).

### 2.3 Related defects

| Bug | Relevance | Handling in this spec |
|---|---|---|
| B-L1 | The curve step before the first panel decides where the last edge, and so the `wall-center` and `mesh-center` anchors, end up for curved walls. | Feature 3 does not depend on the decision. Anchors always follow whatever the walk produces. See 6.9 for the exact migration and its precondition. |
| B-L2 | Flat framing (orbit target, camera reset, D). With a centred pivot it gets worse: for the 10 × 500 mm wall at 18° (true x ∈ [−0.50, 1.33]) and `wall-center`, the flat target lands at stage (2.75, H/2, −1.58), off the wall. | Step A makes it **translation-correct** (`'flat-pivot'`, identity-exact). Step F is the roadmap's P2-11c (task T11 if P2-11c has not landed). It switches to `'layout'` framing of the stage layout, which puts the target at the bounds centre (0.66, H/2, 0.00), and it retires LEGACY(B-L2) at the orbit target and Reset. |
| B-M10 | Coverage uses `posZ` against a flat rectangle. | Distance and edges become relative to the translated flat wall (`wallZ`, `minX`). The new readout is labelled **"Distance to wall plane"** to say so. The rotation-aware analyser stays the roadmap's P2-11a. |
| B-M11 | The preview renders helpers. | The marker is a registered helper (`addHelper`). It disappears from the preview once B-M11 is fixed. Roadmap P2-10a does this by hiding registered helpers in the preview render; spec 07 R1 does it with `LAYERS.HELPERS` and the preview camera's mask (07 C31). Step C (marker on by default) waits for whichever of these lands first (Q9). |
| B-M15 | Safe-distance floor quads overlap or gap on curved walls. | **Not fixed here, no interaction.** The band is built by `SafeDistanceView` from `layoutProject(project)`, so it follows the pivot automatically, and its shape is translation-invariant. REFACTOR_PLAN groups it with Feature 3 only because the code is adjacent; the fix stays the roadmap's P2-5 (mitred band) and can land before or after this feature. |
| B-M8 | A stale safe-distance group survives turning the preview off. | The safe-distance OBJ re-expresses a stale group into the current export frame (7.1), so a later pivot change cannot export it in the wrong place. |
| B-L9 | `orDefault` turns 0 into the default. | New pivot inputs **never** use `orDefault`: 0 is a valid offset. Before step F, the camera `posZ` rule uses `Number.isFinite` whenever the stage origin is off the wall plane, so Z = 0 can be entered exactly when it becomes meaningful (4.1). Step F (P2-11c) removes the Z minimum altogether. |
| B-L10 | The gizmo bypasses validation. | Pivot gizmo writes go through `WallPivot.setOffset` (clamp and rounding). |
| B-L11 | Shortcuts ignore SELECT focus, modifiers and repeat. | The new `O` shortcut applies its own guards (3.4) whether or not B-L11 is fixed. |
| B-L13 | Mesh-mode label click fires twice. | The pivot radios listen to `change` on the input, never to label `click`. |
| B-L22 | Prop gizmo handles that do nothing. | The pivot's `allowedAxes('rotate')` returns `null` (07 C33), so it gets no rotate rings; `allowedAxes('translate')` returns all three axes. |
| B-M14 | Selection on mousedown. | Pivot picking works with either behaviour. `pickPriority` (5.4) keeps the marker pickable through the wall: it outranks wall (section) hits only, never a nearer camera or prop. |
| B-L8, B-L31 | No validation and no v2 persistence. | The pivot fields and their validation rules are defined here (4.2, 4.3). They need the Phase-2 v2 writer (P2-13e) and the validator (P2-3). Before B-L8, a non-finite layout gives a `null` resolution, which every consumer handles (3.6). |
| B-L15 | Fractional `panelCols` (fixed by roadmap P2-8). | Before P2-8 rounds counts, `lastEdge` (`edges[ceil(cols)]`) and `bounds()` (loops `col <= cols`) can disagree on a fractional count. This is documented, not handled. It is one reason P2-8 stays a merge gate (header). |
| B-L24, B-L36 | Missing active styles; toggles not keyboard accessible. | The new controls ship accessible (3.2). |

---

## 3. UX design

### 3.1 Concepts the user sees

- **Pivot:** the point that becomes the origin of every exported mesh. A white marker shows it in the viewport.
- **Stage origin:** the point on the floor directly below or above the pivot. The grid centre lines and the RGB axes cross here, and camera and prop coordinates are measured from it. For the floor-level modes (`bottom-left`, `wall-center`, and any offset with y = 0), the stage origin *is* the pivot.
- **Anchor:** where the selected mode places the pivot before the offset. When the offset is non-zero, a dimmed ghost marks it.

The panel says this in one line under the readout: *"Exports: mesh origin = pivot. Viewport: grid origin = pivot on the floor."*

### 3.2 Sidebar panel "Wall Pivot"

**Location.** A new `.global-section` directly **after "Mesh Options" and before "Display"**: a wall-level setting next to the other mesh options. It is not placed before Mesh Options because that section carries the inline `style="margin-top: 16px"`, which would double the gap.

```
┌ ▌WALL PIVOT ─────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────────┐ │
│ │ (•) Bottom-left corner                           │ │  #pivot-mode-select.pivot-mode-select
│ └──────────────────────────────────────────────────┘ │  (radio cards; .pivot-mode-option, styled
│ ┌──────────────────────────────────────────────────┐ │   like .mesh-mode-option but NOT that class)
│ │ ( ) Wall mesh centre (bounding box)              │ │
│ └──────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────┐ │
│ │ ( ) Wall centre on floor (first ↔ last edge)     │ │
│ └──────────────────────────────────────────────────┘ │
│  Offset X (m)     Offset Y (m)     Offset Z (m)       │
│  [   0.000 ]      [   0.000 ]      [   0.000 ]        │  #pivot-offset-x/y/z
│  [ Reset offset ]          [ ◎ Select pivot (O) ]     │  #pivot-reset-offset, #pivot-select
│  Ctrl-drag snap  [ 10 cm      ▾]                      │  #pivot-snap
│  Keep stage layout on pivot change         [■■■○]     │  #toggle-pivot-keep-stage
│  Show pivot marker                         [■■■○]     │  #toggle-pivot-marker
│ ┌──────────────────────────────────────────────────┐ │
│ │ Pivot (from wall start): 1.250, 0.750, 0.000 m   │ │  #pivot-readout
│ │ Exports: mesh origin = pivot                     │ │
│ │ Stage origin moved +1.250, 0.000 m · camera and  │ │  #pivot-status (aria-live)
│ │ props kept their place                           │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

| Control | Id / markup | Type | Label | Range / options | Default | Units | Behaviour |
|---|---|---|---|---|---|---|---|
| Mode | `<div class="pivot-mode-select" id="pivot-mode-select" role="radiogroup" aria-label="Pivot mode">` containing three cards (markup below). **Never** the `mesh-mode-option` class or a `data-mode` attribute (2.2). | radio group | "Bottom-left corner" / "Wall mesh centre (bounding box)" / "Wall centre on floor (first ↔ last edge)" | `bottom-left`, `mesh-center`, `wall-center` | `bottom-left` | – | Listens for **`change` on the radio**, not label `click` (B-L13). Calls `pivotController.setMode(value)`. The mirror sets both `checked` and the label's `.active`. |
| Offset X/Y/Z | `<input type="number" id="pivot-offset-x" step="0.001" min="-1000" max="1000" value="0">` (likewise y, z), each inside its own `.input-field` with a `<label for>`, in one `.section-row.pivot-offset-row` (3 columns; markup below) | number | "Offset X (m)", "Offset Y (m)", "Offset Z (m)" | [−1000, 1000] | 0 | metres. Stored rounded to 0.001 (1 mm). `step="0.001"` matches the storage resolution, so a stored value such as 1.235 is never a step mismatch. | On `change`: `v = pivotController.setOffsetAxis(axis, el.value)`, then `el.value = v.toFixed(3)` (write-back). A non-numeric or empty entry reverts to the stored value. It never uses `orDefault` (B-L9). |
| Reset offset | `<button class="export-btn secondary" id="pivot-reset-offset">` inside `.pivot-actions` | button | "Reset offset" | – | – | – | `pivotController.resetOffset()`. Disabled while the offset is (0, 0, 0). |
| Select pivot | `<button class="export-btn secondary" id="pivot-select" aria-pressed="false">` inside `.pivot-actions` | toggle button | "◎ Select pivot (O)" | – | not pressed | – | Same as the `O` key (3.4). `.active` and `aria-pressed` mirror whether the pivot is selected. The label also documents the `O` key, because this spec adds no help-badge token (3.4). |
| Ctrl-drag snap | `<label class="pivot-snap-label" for="pivot-snap">` + `<select id="pivot-snap" class="pivot-snap">` inside `.pivot-snap-row` | select | "Ctrl-drag snap" | 1 mm (0.001), 1 cm (0.01), 10 cm (0.1), 50 cm (0.5), 1 m (1) | 10 cm | metres | `pivotController.setSnapStep(Number(value))`, which writes `interaction.snap.pivotM` through `gizmo.setSnapIncrements` (the shared model, D9). Applies only to gizmo drags while Ctrl/⌘ is held. Session-only, not persisted. `title`: "Hold Ctrl (⌘ on Mac) while dragging the pivot to move in steps of this size." |
| Keep stage layout | `<div class="toggle active" id="toggle-pivot-keep-stage" role="switch" tabindex="0" aria-checked="true">` | toggle | "Keep stage layout on pivot change" | on / off | on | – | `pivotController.setKeepStageLayout(on)`. Persisted. Has a tooltip (`title`): "Move the camera and props with the wall when the pivot changes, so their placement relative to the wall is kept." |
| Show marker | `<div class="toggle" id="toggle-pivot-marker" role="switch" tabindex="0" aria-checked="false">` until step C, then `class="toggle active"`, `aria-checked="true"` | toggle | "Show pivot marker" | on / off | off until step C, then on (Q9) | – | `pivotController.setMarkerVisible(on)`. While the pivot is selected, the marker is shown regardless of this toggle. |
| Readout | `<div id="pivot-readout">`, the first line of the `.pivot-readout` box | text | – | – | – | m, 3 decimals | `Pivot (from wall start): ${x}, ${y}, ${z} m`, the pivot point in the **layout** frame. It refreshes on `WALL_PIVOT_CHANGED` and on every `WALL_REBUILT`, because section edits move the anchor. |
| Status | `<div class="pivot-status" id="pivot-status" aria-live="polite">` | text | – | – | empty | – | Holds the last pivot change summary, or the stage-origin shift caused by a wall edit (3.6). The text is derived from the payload of the event being mirrored alone (5.3): `WALL_PIVOT_CHANGED`, or `WALL_REBUILT` with its `cause` and `stageShift`. |

**Markup** (inserted after the Mesh Options `.global-section`; no inline `style=""` anywhere):

```html
<div class="global-section" id="pivot-section">
  <div class="global-section-title">Wall Pivot</div>
  <div class="pivot-mode-select" id="pivot-mode-select" role="radiogroup" aria-label="Pivot mode">
    <label class="pivot-mode-option active" data-pivot-mode="bottom-left">
      <input type="radio" name="pivot-mode" value="bottom-left" checked>
      <span class="pivot-mode-radio"></span>
      <span class="pivot-mode-label">Bottom-left corner</span>
    </label>
    <label class="pivot-mode-option" data-pivot-mode="mesh-center">
      <input type="radio" name="pivot-mode" value="mesh-center">
      <span class="pivot-mode-radio"></span>
      <span class="pivot-mode-label">Wall mesh centre (bounding box)</span>
    </label>
    <label class="pivot-mode-option" data-pivot-mode="wall-center">
      <input type="radio" name="pivot-mode" value="wall-center">
      <span class="pivot-mode-radio"></span>
      <span class="pivot-mode-label">Wall centre on floor (first ↔ last edge)</span>
    </label>
  </div>
  <div class="section-row pivot-offset-row">
    <div class="input-field"><label for="pivot-offset-x">Offset X (m)</label>
      <input type="number" id="pivot-offset-x" step="0.001" min="-1000" max="1000" value="0"></div>
    <div class="input-field"><label for="pivot-offset-y">Offset Y (m)</label>
      <input type="number" id="pivot-offset-y" step="0.001" min="-1000" max="1000" value="0"></div>
    <div class="input-field"><label for="pivot-offset-z">Offset Z (m)</label>
      <input type="number" id="pivot-offset-z" step="0.001" min="-1000" max="1000" value="0"></div>
  </div>
  <div class="pivot-actions">
    <button class="export-btn secondary" id="pivot-reset-offset" disabled>Reset offset</button>
    <button class="export-btn secondary" id="pivot-select" aria-pressed="false">◎ Select pivot (O)</button>
  </div>
  <div class="pivot-snap-row">
    <label class="pivot-snap-label" for="pivot-snap">Ctrl-drag snap</label>
    <select id="pivot-snap" class="pivot-snap" title="Hold Ctrl (⌘ on Mac) while dragging the pivot to move in steps of this size.">
      <option value="0.001">1 mm</option><option value="0.01">1 cm</option>
      <option value="0.1" selected>10 cm</option><option value="0.5">50 cm</option><option value="1">1 m</option>
    </select>
  </div>
  <div class="toggle-container">
    <span class="toggle-label">Keep stage layout on pivot change</span>
    <div class="toggle active" id="toggle-pivot-keep-stage" role="switch" tabindex="0" aria-checked="true"
         title="Move the camera and props with the wall when the pivot changes, so their placement relative to the wall is kept."></div>
  </div>
  <div class="toggle-container">
    <span class="toggle-label">Show pivot marker</span>
    <div class="toggle" id="toggle-pivot-marker" role="switch" tabindex="0" aria-checked="false"></div>
  </div>
  <div class="pivot-readout">
    <div id="pivot-readout">Pivot (from wall start): 0.000, 0.000, 0.000 m</div>
    <div class="pivot-hint">Exports: mesh origin = pivot. Viewport: grid origin = pivot on the floor.</div>
    <div class="pivot-status" id="pivot-status" aria-live="polite"></div>
  </div>
</div>
```

`.global-section`, `.global-section-title`, `.section-row`, `.input-field` (and its `label`/`input` rules), `.toggle-container`, `.toggle-label`, `.toggle` and `.export-btn.secondary` are existing classes, used unchanged. `#pivot-readout` is the line that gets `.pivot-warning` (3.6).

**Accessibility.** The radio inputs are visually hidden but focusable. Because the labels do not carry `.mesh-mode-option`, no `display: none` rule reaches them. The pivot stylesheet still sets `display: block` explicitly, so that a future shared rule cannot hide them:

```css
.pivot-mode-option { position: relative; }                       /* containing block for the hidden input */
.pivot-mode-option input { display: block; position: absolute; opacity: 0; width: 1px; height: 1px;
                           margin: 0; pointer-events: none; }
.pivot-mode-option:focus-within { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
```

Tab reaches the checked radio, and the arrow keys move between the radios natively (they share one `name`). The two new toggles have `role="switch"`, `tabindex="0"` and `aria-checked`, and they toggle on Space and Enter: the pattern B-L36 asks for.

**Styles.** A new feature stylesheet, `css/features/pivot.css`. It holds only `.pivot-*` rules (plus the camera row of 3.5), uses existing tokens and has no inline `style=""`:
- `.pivot-mode-select` repeats the `.mesh-mode-select` layout (`display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px`);
- `.pivot-mode-option`, `:hover`, `.active`, `.pivot-mode-radio` and its `.active` / `::after` rules repeat the seven `.mesh-mode-*` visual rules of `css/06-controls.css` (legacy 325-378: the same tokens `--bg-secondary`, `--border-color` and `--accent-cyan`, and the same `rgba(0, 240, 255, 0.1)` active fill), plus the accessibility rules above. The existing slice is not edited, so the CSS slice proof is unaffected;
- `.pivot-mode-label { font-size: 12px; }` (the `.mesh-mode-label` rule, legacy 380-382);
- `.section-row.pivot-offset-row { grid-template-columns: repeat(3, 1fr); }`. The two-class selector beats the two-column `.section-row` rule (legacy 225-230) whatever the link order;
- `.pivot-actions { display: flex; gap: 8px; margin-bottom: 12px; }`, the flex container that `.export-btn { flex: 1 }` expects (as in the export panel);
- `.pivot-snap-row { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 10px; margin-bottom: 6px; }` and `.pivot-snap-label { font-size: 12px; color: var(--text-secondary); }`;
- `.pivot-snap { width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 6px; border-radius: 4px; font-size: 12px; }`: the legacy inline style of `#led-layout` and `#camera-filmback` (948, 1004), moved into a class;
- `.pivot-readout { --pivot-warning: var(--color-warning); margin-top: 6px; padding: 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; }`, `.pivot-hint, .pivot-status { color: var(--text-secondary); margin-top: 4px; }` and `.pivot-readout .pivot-warning { color: var(--pivot-warning); }`. The warning is 06's `--color-warning` role (06 §5.12 row for `--pivot-warning`). No colour is set from JavaScript;
- the camera row of 3.5: `.pivot-distance-row { display: flex; justify-content: space-between; margin-bottom: 4px; }`, `.pivot-distance-label { color: var(--text-secondary); }` and `.pivot-distance-value { color: var(--accent-cyan); }` (the values of the legacy inline styles of the neighbouring `.frustum-status` rows, 1081-1083).

**Feature 6 lands first** (07 §1.4, Track 1), so this stylesheet ships with 06's role tokens, never the legacy names above: surfaces `--color-surface-*`, borders `--color-border-*`, text `--color-text-*`, accent `--color-accent` with no tinted fill (the `.mesh-mode-option` roles of 06 3.5), focus `--color-focus-ring`, warning `--color-warning` (06 §5.12 rule 4). The legacy names in the bullets above apply only if this feature were to land before 06 T5, in which case 06 T5 maps them.

It is linked in the `css/features/*` block of 07 C52's link order (after `css/11-export.css`, before `css/12-responsive.css`). `tests/static/css-slices.mjs` runs with `--report-only` scoped to `01-12` (07 S7, C52), so `css/features/` is never scanned.

### 3.3 Viewport

**Pivot marker** (`render/PivotMarkerView`; registered with `SceneManager.addHelper`; `renderOrder` `RENDER_ORDER.PIVOT_MARKER` = 996 from spec 01's `core/renderOrder.js` registry, below `HIGHLIGHT_HALO` 997, `SECTION_HIGHLIGHT` 998 and `GIZMO` 999; no numeric literal, 01's static rule):

```
                 ┊                       dashed drop line (only when the pivot y ≠ 0)
          ───────◆───────                pivot glyph at stage (0, P.y, 0): white cross ±0.25 m on X, Y and Z
                 ┊                       + octahedron r = 0.06 m (selected: Morph Red); both grow to keep a
                 ┊                         minimum on-screen size (below)
   ══════════════╋══════════════         floor: grid centre lines + RGB axes cross at the stage origin
        ◇┄┄┄┄┄┄┄┄┘                       anchor ghost (grey cross ±0.12 m) + dashed link (only when offset ≠ 0)
```

- **Materials:** `LineBasicMaterial` and `MeshBasicMaterial` with `depthTest: false`, `depthWrite: false`, `transparent: true`, `opacity: 0.9`, so the marker stays visible through the wall. Dashed lines use `LineDashedMaterial({dashSize: 0.05, gapSize: 0.05})` plus `LineSegments.computeLineDistances()`. Both exist in r128 core; `computeLineDistances` is defined on `Line`, and `LineSegments` overrides it.
- **Colours:** the `SceneTheme.pivot` keys (4.1), with 06 §5.12's per-key values and treatment (the spec of record, landed in the same commit: a token, a `COLOR_BINDINGS` row and a `Theme` fallback): the cross and core in 06's two-tone overlay style (a Morph Black halo under a light core), selected `#C51622`. The marker must never use the person colour `0x4488ff`, because the harness picks the person by that colour.
- **Pick proxy:** an invisible `Mesh(SphereGeometry(0.15, 12, 8), MeshBasicMaterial({visible: false}))` at the glyph position, **tagged `HELPERS` like the rest of the marker** (07 C56). r128 `Mesh.raycast` returns early only for an undefined material, and `Raycaster.intersectObject` tests only `layers`, never `visible`. Pickability comes from `PointerRay.layers.enableAll()` and the explicit `pickMeshes()` list, so the proxy is pickable but never drawn; in pilot it is hidden and unpickable, consistent with `O` being `notInPilot`.
- **Minimum screen size:** the glyph group (cross, core and pick proxy) and the ghost cross are scaled by `s = max(1, minPx · worldPerPixel / glyphHalfSize)`, with `worldPerPixel = 2 · d · tan(THREE.MathUtils.degToRad(camera.fov) / 2) / canvasHeightPx` (`camera.fov` is in degrees in r128), `d` the main camera's distance to the glyph and `minPx = SceneTheme.pivot.minScreenHalfSizePx = 24`. The cross is therefore never shorter than 24 px per arm and the pick sphere never smaller than about 14 px in radius, also at the 30 m orbit distances used for `large_wall`. Drop and link lines are positional and not scaled. `PivotMarkerView.updateScale` is registered with `sceneManager.addPreRender` and runs on every rendered frame, after the camera update and before the passes (07 §5.2.2, C46; 5.8).
- **Visibility:** `hasResolution && (display.showPivotMarker || selection.isSelected('pivot'))`. With a `null` resolution (3.6) the marker is hidden and not pickable.
- **Exclusions:** the marker is never in exports, because exporters never read the scene. Once B-M11 is fixed (roadmap P2-10a hides registered helpers in the preview render; spec 07 R1 puts them on `LAYERS.HELPERS`, which the preview camera's mask excludes) it is never in the preview. Until then it appears in the camera preview whenever it is visible, which is why step C waits for that fix (Q9).

**Selection and dragging**
- The pivot is a `Selectable` (`id 'pivot'`, label `'Pivot'`, `kind 'pivot'`). Clicking the marker selects it when a gizmo mode is active (legacy rule) or, after B-M14, by click. The badge shows "Selected: Pivot".
- **Picking against other objects:** the pivot's `pickPriority` lets it win only over **wall** hits (spec 02's section hits) in front of it, so the marker behind the wall stays clickable. Against the camera body, the person, the car and spec 05's HDRI point (`'hdri-point'`), the nearest hit wins as in legacy. In the centred modes the stage origin is exactly where talent, props and the re-expressed camera stand (camera at x = 0 after the 6.8 switch, person at (0, 0, 2) in front of a `wall-center` pivot), so clicking them selects them, not the marker behind them (5.4).
- **Translate only:** the pivot's `allowedAxes('rotate')` returns `null` (07 C33). In rotate mode the gizmo builds no handles for it, and the badge shows "Selected: Pivot (translate only)" (from `SELECTION_CHANGED.modes`).
- **Drag** (any of X, Y, Z):
  - Only the glyph moves, by the pending delta. The wall, grid, camera and props stay still, and the anchor ghost and the dashed links update live. No wall rebuild happens during the drag.
  - **Ctrl/⌘ held:** the dragged distance on the dragged axis snaps to the "Ctrl-drag snap" step (relative snapping; 6.7). Released: the distance is rounded to 1 mm. Axes that are not dragged keep their stored value exactly.
  - **On release** the pending delta is committed to `offset`, which triggers the pivot pipeline (5.6) exactly once:
    - with **keep stage layout on**, the wall, camera and props stay where they are on screen and the grid, axes and marker settle where the marker was dropped;
    - with it off, the camera and props keep their stage coordinates, so they shift relative to the wall.
  - **Escape during a drag** cancels the drag only. The glyph snaps back, the offset is unchanged, and the pivot stays selected. Until the mouse button is released, moving the mouse does nothing: the view does not orbit and no gizmo handle is hover-highlighted (5.4, gesture swallowing). A second Escape deselects (legacy).
  - **After a rebuild** (a section edit, an import, or a mode change that changes the anchor height) the gizmo re-anchors on the marker immediately, because `TransformGizmo` re-anchors pivot targets on `WALL_REBUILT` (5.4).
- **Space:** world and local are identical for the pivot, which has no rotation. `L` has no visible effect.

### 3.4 Keyboard

| Key | Action | Guards |
|---|---|---|
| **O** (new) | Toggle pivot selection. If the pivot is not selected: `selection.select('pivot')`, then `if (gizmo.mode !== 'translate') gizmo.setMode('translate')`. If it is selected: `selection.deselect()`. | Ignored when the target is INPUT, TEXTAREA, **SELECT** or `[contenteditable]`; when `ctrlKey`, `metaKey` or `altKey` is held (Ctrl+O is the browser's open-file shortcut); on `e.repeat`; in pilot mode; and while a gizmo drag is active or a cancelled drag's button is still held (`interaction.isDraggingGizmo \|\| interaction.gestureCancelled`). |
| Escape (changed order, spec 02 3.5 verbatim; from 07 I1 the registry entries 80, 60 and 0 of 07 §3.8) | 1) If a gizmo drag is active **and** the target implements `endGizmoDrag`, call `gizmo.cancelDrag()` (which calls `endGizmoDrag({cancel: true})`) and stop. The selection is kept, and the rest of the gesture is swallowed (5.4). 2) Else, if pilot is on, exit pilot (legacy). 3) Else, deselect and clear the gizmo mode (legacy). Legacy targets (camera, props) have no drag hooks, so a mid-drag Escape on them keeps the legacy behaviour exactly. | unchanged |

**Conflict check.** The existing bindings are:
- `G`, `R`, `L`, `P`, `Escape` (`ViewportInput.attachShortcuts`);
- `W`, `A`, `S`, `D`, `Q`, `E` and the arrow keys, read by `e.code` through `KeyboardState` for orbit and pilot;
- the mouse wheel;
- spec 02 (planned): `F`, `[`, `]`, Ctrl/⌘+D, Ctrl/⌘+A, Delete/Backspace, and Ctrl/⌘ held during a drag for snapping, which this spec shares.

`O` matches `e.key` `'o'` case-insensitively (07 C43: letters by key, so it follows the printed letter on AZERTY and Dvorak). It is unused by all of them, and it is a row of 07's final `KEYMAP` (`notInPilot`, `notWhileDragging`). `KeyboardState` records every code but only reads WASD, QE and the arrows.

**Help badge: not edited by this spec, and no token is added** (07 C35). The `.info-badge` text (1204) lies inside `.viewport-overlay`, within the `#three-canvas` rect that `AppPage.screenshotCanvas()` clips. Any text change therefore alters every viewport screenshot in every scenario. Per-feature tokens are frozen (only spec 01's ` N=normals` exists); the badge is rewritten once by 07 I4a (`… • G/R/L/P • ? all shortcuts`). The `O` key is documented by the "◎ Select pivot (O)" button label (3.2), by 07's `KEYMAP`-generated `ShortcutHelp` and by the README "Pivot" section (T12).

### 3.5 Camera panel changes (needed once the stage origin can move)

- The label "Z Distance from Wall (m)" (1060) becomes **"Z Position (m)"**. `posZ` is a stage coordinate, and it equals the distance only for a flat wall with an identity pivot. Roadmap P2-11c makes the same relabel; whichever lands first changes the text, and the other finds it already done.
- A new first row in `.frustum-status`: **"Distance to wall plane:"**. Markup: `<div class="pivot-distance-row"><span class="pivot-distance-label">Distance to wall plane:</span><span class="pivot-distance-value" id="camera-wall-distance" title="Distance along Z from the camera to the wall's start plane (flat-wall approximation)">--</span></div>` (classes in 3.2). The value is set to `${distToWall.toFixed(2)}m`. It comes from the coverage computation (6.6) and is owned by `CameraPanel`. The wording is deliberate: the value is `posZ − wallZ`, the B-M10 flat-plane model, not a distance to the curved surface. When the roadmap's P2-11a analyser replaces coverage, this row shows its `D0` (the distance along the optical axis to the hit wall plane) under the same label.
- **The `min` attribute of `#camera-pos-z` (until step F).** It is `"0.1"` while `wallZ === 0` (the markup is unchanged). Otherwise it is `minAttr = (Math.floor(Math.round(minZ * 1000) / 100) / 10).toFixed(1)`, i.e. the clamp value `minZ` (4.1) **floored to the 0.1 grid**. Here `wallZ = 0 - resolution.stageOrigin.z` and `minZ = Math.round((wallZ + 0.1) * 1000) / 1000`.
  - Why floored: with `step="0.1"` the HTML step base is the `min` value. An off-grid `min` such as `-2.240` (from `concave_offsets` with `wall-center`, `wallZ = −2.3397`) would make a typed `0` a step mismatch (`:invalid`), and the spinner would step through −2.24 + 0.1k (0.06, 0.16, …). With `min="-2.3"` the step grid stays on whole tenths, so 0 and every tenth are valid and the spinner steps through them.
  - The exact clamp stays in the rule: the field never stores less than `minZ` (−2.24 in the example). The only effect of the lower attribute is that the spinner's lowest step (−2.3) is clamped to −2.24 by the rule on `change`, and the write-back shows the clamped value.
  - For `wallZ = −2` (offset z = 2 on the default wall), `minZ = −1.9` lies on the grid and `minAttr = "-1.9"`.
  - `CameraPanel` updates the attribute on `WALL_PIVOT_CHANGED` (`payload.resolution`) and on `WALL_REBUILT` (`layout.pivot.resolution`). A `null` resolution uses `wallZ = 0`.
  - **Step F (P2-11c) removes the attribute and its update code**, because P2-11c removes the Z minimum (roadmap Q13).
- **Typing 0 now works when it matters.** With the stage origin off the wall plane (for example `wall-center` + offset z = 2, so `wallZ = −2`), typing `0` in Z Position stores 0: the camera stands on the stage origin. At `wallZ === 0` the legacy B-L9 behaviour is kept bit-for-bit until the roadmap's P2-8b fixes it everywhere (4.1). After step F, any finite value is stored (4.1).

### 3.6 Feedback, empty and error states

| Situation | Feedback |
|---|---|
| Mode or offset changed and the stage origin moved, keep on | `#pivot-status`: `Stage origin moved ${dx>=0?'+':''}${dx.toFixed(3)}, ${dz…} m · camera and props kept their place`. The camera and prop inputs update (pose events with `source: 'pivot'`). |
| Same, keep off | `Stage origin moved … m · camera and props kept their coordinates` |
| Only the pivot height changed (Y offset, or wall-centre ↔ mesh-centre on a monotonic wall) | `Pivot height ${P.y.toFixed(3)} m · affects exports only`. No rebuild happens. |
| A section edit moved the stage origin relative to the wall start (centred modes) | `Wall edit moved the stage origin by ${dx}, ${dz} m (relative to the wall start) · camera and props kept their coordinates`, from `WALL_REBUILT {cause: 'edit', stageShift}`. Any later `'edit'` rebuild replaces it: with its own shift message, or with an empty status when its `stageShift` is zero. |
| Import | The status is cleared (`WALL_PIVOT_CHANGED{source: 'import'}`, then `WALL_REBUILT{cause: 'import'}`); the panel mirrors the file's pivot. |
| The pivot is more than 50 m from the anchor | The readout line gets class `.pivot-warning` (CSS `--pivot-warning`): `Pivot is ${d.toFixed(1)} m from the anchor`. |
| Empty wall (`sections: []`; reachable only before B-L8's validator) | The anchor is (0, 0, 0), so the resolution is non-null (anchor 0 plus the offset), and the readout says `No wall sections · pivot at offset`. The JSON `resolved_m` carries that resolution (4.2). Nothing throws. |
| Non-finite layout (NaN or string fields before the validator): `resolution === null` | The layout is **not** translated (identity fallback). The readout says `Pivot unavailable · invalid section values`. The marker is hidden; `isPickable()` and `hasGizmoTarget()` are `false`; `glyphPosition` and `gizmoAnchor` return the preview offset from the origin (they never read `null`); `CameraPanel` uses `wallZ = 0` (min `"0.1"`); exports use the untranslated layout and write no pivot header; the JSON writes `resolved_m: null`. No subscriber throws, so later `WALL_REBUILT` subscribers still run. |
| Invalid offset typed | The value reverts to the stored value. There is no alert. |
| Rotate mode while the pivot is selected | No handles. The badge says `Pivot (translate only)`. |
| `O` pressed in pilot mode or mid-drag | Ignored. The pilot banner already lists the active keys. |

### 3.7 What moves when the pivot changes

ΔO = O_new − O_old (x, z only; layout frame). "Screen" means relative to the orbit view, which re-targets the wall bounds on every rebuild (H-3).

| Object | Pivot edit, keep **on** | Pivot edit, keep **off** | Pivot-height-only edit | Section edit / import |
|---|---|---|---|---|
| Wall, frames, safe-zone band (stage coords) | −ΔO | −ΔO | unchanged | recomputed; with `wall-center` or `mesh-center` the wall stays centred on the stage origin |
| Grid, axes (fixed at the stage origin) | fixed (on screen they jump by +ΔO relative to the wall) | fixed | unchanged | fixed |
| Camera pose, person, car (stage coords) | −ΔO (re-expressed: inputs change, placement relative to the wall is kept) | unchanged (they shift relative to the wall) | unchanged | unchanged (no re-expression) |
| Orbit target / view | before 07 I4b: follows the wall bounds (legacy H-3), so the wall stays still on screen. From I4b the orbit no longer re-centres on edits; it is a `StageAnchored` participant instead (07 C45): its target and camera move by −ΔO, so the wall still stays still on screen | before I4b: same; from I4b: unchanged (no re-expression), so the wall moves on screen with keep off | unchanged | before I4b: same; from I4b: unchanged (no re-centre) |
| Marker | at stage (0, P.y, 0) | same | moves vertically | follows the new anchor |
| Frustum readouts | unchanged (pose and wall moved together) | recomputed | unchanged | recomputed |
| Exports | follow the new pivot | same | same | same |

**Why section edits do not re-express (D6).** Stage coordinates are the source of truth between explicit pivot edits, as with a tracking system whose origin is surveyed: the user chose a centred origin so that positions read relative to the wall centre. A camera placed at x = 0 in front of a `wall-center` wall therefore stays centred on the wall as sections are added; re-expressing would push it off-centre by ΔO. With `bottom-left` the anchor never moves on section edits, so the question does not arise. The cost is that, in the centred modes, the wall slides relative to a camera placed against one particular section. `#pivot-status` reports every such shift (3.6), and Q15 asks the owner whether keep-stage-layout should also apply to section edits.

---

## 4. Data model

### 4.1 Domain (pure layer: no THREE, no DOM)

**`js/domain/Wall.js`** (extends the Phase 1 seam):

```js
export const PivotMode = Object.freeze({ BOTTOM_LEFT: 'bottom-left', MESH_CENTER: 'mesh-center', WALL_CENTER: 'wall-center' });
export const PIVOT_MODES = Object.freeze([PivotMode.BOTTOM_LEFT, PivotMode.MESH_CENTER, PivotMode.WALL_CENTER]);
export const PIVOT_OFFSET_LIMIT_M = 1000;

export class WallPivot {
  mode = PivotMode.BOTTOM_LEFT;
  offset = { x: 0, y: 0, z: 0 };          // metres, layout axes (X along the wall start, Y up, Z toward the stage)
  keepStageLayout = true;                 // re-express the camera and props on explicit pivot edits

  get isIdentity()                        // mode === BOTTOM_LEFT && offset.x === 0 && offset.y === 0 && offset.z === 0
  /** PIVOT_MODES.includes(mode) ? (changed = this.mode !== mode, this.mode = mode, changed)
   *                             : throw new RangeError(`Unknown pivot mode ${JSON.stringify(mode)}`)   (the Phase 1 pivotPoint error type) */
  setMode(mode)
  /** v = WallPivot.parseOffset(raw); if (v === null) return this.offset[axis]; this.offset = {...this.offset, [axis]: v}; return v.
   *  axis must be 'x' | 'y' | 'z' (anything else throws). The offset object is REPLACED, never mutated in place,
   *  so a resolution snapshot keeps its values. */
  setOffsetAxis(axis, raw)
  /** setOffsetAxis for each axis of {x, y, z} (numbers); returns this.offset */
  setOffset(vec)
  resetOffset()                           // this.offset = {x: 0, y: 0, z: 0}
  /** typeof on === 'boolean' ? (changed = this.keepStageLayout !== on, this.keepStageLayout = on, changed) : throw TypeError */
  setKeepStageLayout(on)
  /** Number-or-string -> metres: v = typeof raw === 'number' ? raw : parseFloat(raw);
   *  Number.isFinite(v) ? Math.max(-LIMIT, Math.min(LIMIT, Math.round(v * 1000) / 1000)) : null.
   *  NEVER orDefault: 0 is valid (B-L9). Math.round(-0.0004 * 1000) / 1000 === -0 is normalised to 0 (`|| 0`).
   *  Idempotent: parseOffset(parseOffset(x)) === parseOffset(x) for every finite x. */
  static parseOffset(raw)
  clone()                                 // deep copy
  equals(other)                           // mode, the 3 offset components and keepStageLayout, by ===
}
```

`Wall` is unchanged except that `pivot` is now actually written: by `WallPivot` methods called from `PivotController` (every field, including `keepStageLayout` through `setKeepStageLayout`) and by `WallController.applyImport` (assignment of a validated `WallPivot`). No other module writes `Wall.pivot` or a `WallPivot` field (static check, 8.2).

**`js/domain/Project.js`: `DisplaySettings`** gains `showPivotMarker`, initialised from a new static `DisplaySettings.DEFAULT_SHOW_PIVOT_MARKER`. The constant is `false` from step A and becomes `true` in step C (T9). The JSON reader uses the same constant as its default for a missing key (4.2), so the file default and the in-app default can never disagree.

**`js/domain/CineCamera.js`:**

```js
/** Re-expression after a pivot change. Clamped through CineCamera.LIMITS (the ±100,000 m writer bounds of 07 C22), so
 *  every value it writes is reachable and the validator never clamps it on reload (07 C45). The bound is far beyond any
 *  pivot shift, so in practice the distance to the wall is preserved, because the wall moved by the same amount.
 *  posX = clamp(posX + dx, LIMITS.posX); posZ = clamp(posZ + dz, LIMITS.posZ). */
translateStage(dx, dz)
```

`FIELD_RULES.posZ.parse` takes a context and has a pivot-aware branch:

```js
const r3 = (v) => Math.round(v * 1000) / 1000;
posZ: {
  parse: (r, ctx) => {
    if (ctx.wallZ === 0) return Math.max(0.1, orDefault(parseFloat(r), 5));     // legacy rule, verbatim (B-L9 kept at the identity)
    const v = parseFloat(r);
    const minZ = r3(ctx.wallZ + 0.1);
    return Number.isFinite(v) ? Math.max(minZ, v) : Math.max(minZ, r3(ctx.wallZ + 5));   // 0 is a valid stage coordinate
  },
  writeBack: true,
}
```

- `setField(field, raw, ctx = { wallZ: 0 })` passes `ctx` to every rule. The other rules ignore it.
- `ctx.wallZ === 0` is true for `+0` and `−0`, so the identity pivot and every pivot whose stage origin lies on the wall plane (z = 0) run the legacy expression bit-for-bit. Only a pivot that moves the stage origin off the wall plane reaches the new branch, where the B-L9 fallback would be wrong: there, 0 means "on the stage origin".
- When the roadmap's P2-8b (B-L9) lands, both branches become `Math.max(r3(wallZ + 0.1), finiteOr(v, r3(wallZ + 5)))`. At `wallZ = 0` that is `Math.max(0.1, finiteOr(v, 5))`, P2-8b's own rule, so P2-8b deletes the branch. Either order works.
- **Step F (P2-11c, roadmap Q13)** removes the minimum: the rule becomes `parse: (r, ctx) => finiteOr(parseFloat(r), r3(ctx.wallZ + 5))`. At `wallZ = 0` this is P2-11c's own `finiteOr(v, 5)`. With a pivot off the wall plane, a non-numeric entry puts the camera 5 m in front of the wall start plane rather than 5 m from the stage origin. Whichever of P2-11c and this spec lands second writes this form.
- `resetTo(bounds)` with `'flat-pivot'` bounds: `posX = bounds.minX + bounds.totalWidth / 2; posY = bounds.maxHeight / 2; posZ = bounds.wallZ + 5;` with the rotations zeroed. With `'layout'` framing (step F): the roadmap's §6.10 rule, evaluated on the stage layout. The camera goes to `center + 5·facing` with `rotY = atan2(facing.x, facing.z)·180/π + 0` and `rotX = rotZ = 0`, so it looks at `center`.
- `coverage(bounds)`: see 6.6.

**`js/domain/Prop.js`:** `translateStage(dx, dz)` performs `posX = clamp(posX + dx, Prop.LIMITS.posX); posZ = clamp(posZ + dz, Prop.LIMITS.posZ)` (07 C45).

**`js/theme/Theme.js`** gains `SceneTheme.pivot = { color: 0xf7f7f5, selectedColor: 0xc51622, anchorColor: 0xa3a3a3, haloColor: 0x0a0a0a, opacity: 0.9, glyphHalfSize: 0.25, coreRadius: 0.06, pickRadius: 0.15, dash: 0.05, minScreenHalfSizePx: 24 }`. **06 §5.12's per-key table is the spec of record** for these values (07 0.4): this spec lands each key with its token, `COLOR_BINDINGS` row and `Theme` fallback in the same commit, and draws the cross as 06's two-tone overlay (a Morph Black halo plus a light core from closed `Line`/`LineSegments` geometry, never `LineLoop`). The gizmo XYZ colours are untouched.

### 4.2 Project JSON v2 fields

The v2 envelope, version string, validator report and the top-level placement of camera, props and display objects are spec 07's (§4.2, built partly by the Phase-2 B-L31 writer). This spec adds the fields below. `pivot` is a **top-level** key, a sibling of `sections` and `mesh_mode` (07 C7); there is no nested alternative (07 C39). **The keys are absent until this feature's own landing commit** (07 §4.4 rule 3): T7 adds `pivot`, and `display.show_pivot_marker` from step C, with one revision bump assigned at merge time (07 C40). 08 P2-13e writes neither key.

| JSON path | Type | Default when missing | Validation (ProjectValidator) | Read | Write |
|---|---|---|---|---|---|
| `pivot.mode` | string enum `"bottom-left" \| "mesh-center" \| "wall-center"` | `"bottom-left"` | not in the enum: default + warning `pivot.mode` | yes | yes |
| `pivot.offset_m.x` | number (metres) | `0` | `WallPivot.parseOffset` (finite; clamp ±1000; round 1 mm); otherwise `0` + warning | yes | yes |
| `pivot.offset_m.y` | number (metres) | `0` | same | yes | yes |
| `pivot.offset_m.z` | number (metres) | `0` | same | yes | yes |
| `pivot.keep_stage_layout` | boolean | `true` | not a boolean: `true` + warning | yes | yes |
| `pivot.resolved_m.anchor` | `{x, y, z}` numbers, layout frame | – | ignored on read | **no** (informational) | yes |
| `pivot.resolved_m.point` | `{x, y, z}`, layout frame | – | ignored | no | yes |
| `pivot.resolved_m.stage_origin` | `{x, y: 0, z}`, layout frame | – | ignored | no | yes |
| `display.show_pivot_marker` | boolean | `DisplaySettings.DEFAULT_SHOW_PIVOT_MARKER`: `true` from step C on (07 §4.3's documented default) | not a boolean: the default + warning | **from step C on.** Before step C the schema has no row for the key, so a stray key is `dropped-unknown` (info) and the marker stays off until B-M11 is fixed (Q9). | **from step C on**: the live `display.showPivotMarker` (view-only). Before step C no writer writes the key (07 C39). |

Written numbers are not rounded (`JSON.stringify` of the stored values). `resolved_m` values come from `PivotResolution` (6.2). For an empty wall they hold the non-null empty-wall resolution (anchor (0, 0, 0) plus the offset, 6.2). `resolved_m` is `null` only for a non-finite layout. The pivot block is written for every project, including the identity pivot.

**Identity block is a constant.** For the identity pivot on any wall (empty and non-finite walls included: the bottom-left anchor reads only `edges[0]`, which the walk places at the origin before any other value is used, and the empty wall falls back to (0, 0, 0)), the block is `{"mode": "bottom-left", "offset_m": {0, 0, 0}, "keep_stage_layout": true, "resolved_m": {"anchor": {0, 0, 0}, "point": {0, 0, 0}, "stage_origin": {0, 0, 0}}}`, because the bottom-left anchor is always the layout origin. No earlier writer writes it (07 C39), so step A′ adds it to every exported project JSON (8.4).

Example (default wall, wall-centre pivot, 2 m toward the stage):

```json
{
  "version": "2.<n>",
  "sections": [ … ],
  "mesh_mode": "combined",
  "pivot": {
    "mode": "wall-center",
    "offset_m": { "x": 0, "y": 0, "z": 2 },
    "keep_stage_layout": true,
    "resolved_m": {
      "anchor": { "x": 1.25, "y": 0, "z": 0 },
      "point": { "x": 1.25, "y": 0, "z": 2 },
      "stage_origin": { "x": 1.25, "y": 0, "z": 2 }
    }
  },
  "camera": { "…": "positions in the STAGE frame of this pivot" }
}
```

**Frame rule for every v2 pose (07 C45, 07 §4.2).** Camera, prop and HDRI projection-point positions, 09's `measurements[]` and `viewport.orbit` are stored in the **stage frame** defined by the file's own pivot. Re-importing the file restores the exact arrangement without re-expression.

### 4.3 Validation

`ProjectValidator` is the Phase-2 `case` inside `ProjectSerializer.read`. It applies the table above. The rules are the same functions the UI uses (`WallPivot.parseOffset`, `PIVOT_MODES`), so a hand-edited file and a typed value behave identically.

### 4.4 Migration and import semantics

| Input | Result |
|---|---|
| v1 file (no `pivot`) | `new WallPivot()` (identity), through 07's single migration path (`migrateV1toV2`); this spec adds no migration of its own (07 §4.4 rule 7). The geometry and exports match what the v1 file produced, which was always bottom-left. |
| v2 file without `pivot` | identity |
| v2 file with `pivot` | validated `WallPivot` |
| Any import while the current project has a non-identity pivot | The pivot is **replaced** by the file's value (identity for v1). **No re-expression:** an import is a load, not an edit. The camera keeps its stage coordinates, as in legacy, where import never touched the camera. |

Resetting on a pivot-less import is the recommended default (Q14): the same file then always produces the same exports, whatever the session state. The alternative (keep the session's pivot when the file has none) is friendlier for users who work in one mode and load v1 wall configs; it is a one-line change in `applyImport` if the owner prefers it.

`ProjectSerializer.read` returns `{ sections, meshMode, pivot }` (and whatever else v2 adds). For v1 data `pivot` is `new WallPivot()`. `WallController.applyImport({sections, meshMode, pivot})` assigns `project.wall.pivot = pivot ?? new WallPivot()` after `replaceAll` and **before** the rebuild. It then emits `WALL_PIVOT_CHANGED {source: 'import', rebuilds: true}` (5.5) and rebuilds with `rebuild({cause: 'import'})`. When spec 07's D5 replaces `applyImport` with `ProjectSession.apply`, the assignment and the event move to its step 3 (this spec registers the `features.pivot` hydrator, 07 C41) and the rebuild of its step 7 keeps `cause: 'import'` (07 §5.5.2 numbering).

---

## 5. Architecture

### 5.1 Frames (to be added to ARCHITECTURE.md section 1.4)

| Frame | Origin | Produced by | Consumers |
|---|---|---|---|
| **Layout (L)** | The first section's first bottom vertex (the legacy world) | `computeWallLayout(sections)` (verbatim walk, oracle-tested, unchanged) | `resolvePivot`, unit tests, the `pivot.resolved_m` readouts |
| **Stage (S)**, `x_S = x_L − O`, with O = (P.x, 0, P.z) | The pivot projected onto the floor. The floor is y = 0. | `layoutProject(project)` (default `frame: 'stage'`), read through `WallController.currentLayout` | `LEDWallView` (wall and frames), picking, gizmo anchors, spec 02's outlines and transform-only fast path, spec 01's normal lines (`matrixWorld`), spec 04's hover readout (`panelCornersWorld`), spec 05's shader (`modelMatrix·position`) and T13 bake, spec 08's `FrustumCoverage` and `CameraHub`, the safe-distance band (`SafeDistanceView`), `framingBounds`, `OrbitController`, spec 09's inner frustum, measurement snapping and X15 plan SVG, and every stored pose (camera, props, HDRI point, measurements, orbit) |
| **Export (E)**, `x_E = x_L − P = x_S − (0, P.y, 0)` | The pivot P | `layoutProject(project, {frame: 'export'})` | `ObjExporter`, `GltfExporter`, the ZIP, spec 09's X11 stage packs; the safe-distance OBJ is the stage band translated by (0, −P.y, 0) (`ObjExporter.writeSafeDistance` via `translate`, 7.1) |

At the identity pivot, L = S = E, and `layoutProject` returns the untranslated layout object itself.

**Frame per consumer (07 C60).** The table above is the list that 07's D0 copies into ARCHITECTURE §1.4. Texture content (spec 04's UVs, spec 05's bake, panel IDs) is independent of the frame. The trap it prevents: spec 05's bake must read the **stage** layout, because the projection point is stored in the stage frame; reusing `ProjectIO`'s export layout would sample every texel P.y too low.

**Why the stage floor stays at y = 0 (rejected alternative: the full 3D pivot as the viewport origin).** If the viewport origin sat at a `mesh-center` pivot (mid-height) or at a raised offset, six legacy sites would break or need state-dependent rules:
- the camera `posY ≥ 0` rule, which would forbid camera heights below mid-wall;
- the gizmo `posY ≥ 0`;
- the pilot clamp `posY ≥ 0.1`;
- props at `y = 0`;
- the safe-zone band at `y = 0.005`;
- the grid at `y = 0`.

The "Y Height" label would also stop meaning height. VP stage coordinate systems (tracking, nDisplay) are floor-based, so the floor is the natural vertical datum. The pivot height therefore affects only the exports and the marker. It is still exact: the DCC pivot is P in all three axes.

**Why bake instead of a root transform (rejected alternative: `wallRoot.position = −P` in `LEDWallView`, as section 9 of ARCHITECTURE.md sketched).** A root group would cover the wall meshes only. The safe-zone group, framing bounds, coverage, the exporters and the safe-distance OBJ (which reads raw `position` attributes) would each need the same transform re-applied, which is the five-copies problem the refactor removed. Baking in `layoutProject` gives one implementation and keeps the legacy invariant "`wallGroup` has an identity transform", which is now a **unit-tested invariant** (07 C32: there is never a wall root transform, for any feature). The cost (a full rebuild per committed change) is paid only on discrete commits. Drags never rebuild (D7).

### 5.2 Module changes

| File | Change |
|---|---|
| `js/core/EventBus.js` | The frozen `Events` catalogue gains `WALL_PIVOT_CHANGED: 'wall:pivotChanged'` (the bus throws on unknown names). `tests/unit/core.test.mjs` adds it to its event list. |
| `js/domain/Wall.js` | `WallPivot` API (including `setKeepStageLayout`), `PIVOT_MODES` and `PIVOT_OFFSET_LIMIT_M` (4.1) |
| `js/domain/Project.js` | `DisplaySettings.showPivotMarker` and the static `DEFAULT_SHOW_PIVOT_MARKER` (4.1) |
| `js/domain/CineCamera.js` | `translateStage`; the `posZ` rule context and pivot-aware branch (step F: no minimum, 4.1); `resetTo` and `coverage` read `minX`/`wallZ` (6.6); step F: `resetTo(framing)` of roadmap §6.10 |
| `js/domain/Prop.js` | `translateStage` |
| `js/theme/Theme.js` | `SceneTheme.pivot`. In step D, `SceneTheme.grid` changes per the owner's answer to Q8 (recommended `{size: 100, divisions: 100, position: [0, 0, 0]}`). |
| `js/geometry/WallLayout.js` | `SectionLayout.baseY`; `generativeBounds()` (the Phase 1 `bounds()` semantics, which equal `FramingPolicy`'s `generativeBox`; spec 02 T3 makes it attached-only, identical until a section is detached; `bounds()` delegates to it until spec 02 makes `bounds()` transformed); `bounds()` honours `baseY`; `pivotPoint(mode)` with floor modes at `sections[0].baseY`, `mesh-center` on `generativeBounds()`, and `RangeError` on unknown modes; `translated(dx, dy, dz)` on the raw walk only (it throws if any `postTransform` is non-null; 5.10); `WallLayout.pivot`; `resolvePivot()`; `stageShift(a, b)`; `layoutProject(project, {frame})`; `framingBounds(project, resolution)` with the `'flat-pivot'` case (step A). Step F (P2-11c): the `'layout'` case of roadmap §6.10, with `worldVertices()` and `extentAcross(facing)` added if P2-11a has not landed (6.1-6.6). |
| `js/geometry/WallMeshBuilder.js` | `sectionGrid`: `const y = sl.baseY === 0 ? row * sl.panelH : sl.baseY + row * sl.panelH` (the identity branch is the verbatim legacy expression) |
| `js/legacy/LegacyCompat.js` | `Strategies.framingBounds: 'flat'` becomes `'flat-pivot'` (step A), then `'layout'` (step F). `LEGACY_SITES` text updates (5.7). |
| `js/render/PivotMarkerView.js` | **new** (5.3) |
| `js/render/SafeDistanceView.js` | `create` stamps `group.userData.stageOrigin = {x, z}` from `layout.pivot.resolution?.stageOrigin ?? {x: 0, z: 0}` (7.1) |
| `js/render/SceneManager.js` | no API change. Step D changes the grid through the injected theme value. |
| `js/interaction/InputState.js` | `InteractionState.snap = { pivotM: 0.1 }` (spec 02 adds `translateMm`, `rotateDeg` to the same object); `InteractionState.gestureCancelled = false` (5.4; writer: `TransformGizmo` only) |
| `js/interaction/SelectionManager.js` | The `Selectable` typedef becomes the path-B hook set of 5.4 (07 C33, one-to-one with Selectable v2): `kind` (required for every Selectable added after Phase 1; `register` throws without it; inferred only for the legacy ids), `pickPriority`, `allowedAxes(mode)` (`{x, y, z}` or `null` = mode unsupported), `orientGizmo(rotation, mode)`, `beginGizmoDrag()`, `endGizmoDrag({cancel})`, and the `ctx` argument of `applyGizmoTranslate/Rotate`. `pickAt` applies `pickPriority` only against wall (section) hits; otherwise the nearest hit wins (5.4). `select` adds `modes` (the modes whose `allowedAxes` is not `null`) to the `SELECTION_CHANGED` payload. |
| `js/interaction/TransformGizmo.js` | The shared lifecycle of 5.4: `beginGizmoDrag` on a handle hit; `ctx = {space, axisWorld, snap}` on every move; `endGizmoDrag({cancel: false})` on mouse-up iff a drag was active; `cancelDrag()` (calls `endGizmoDrag({cancel: true})`, sets `gestureCancelled`); `onMouseUp`/`onMouseDown` clear `gestureCancelled`; `detach()` cancels an active drag first; `rebuild()` builds no handles when `allowedAxes(mode)` is `null` and none for an axis it sets to `false`; `setSnapIncrements(partial)` (merge); a `WALL_REBUILT` subscription that re-anchors pivot targets (spec 02 adds sections). |
| `js/interaction/OrbitController.js` | Pointer `mousemove` also returns while `interaction.gestureCancelled` (5.4). `updateTargetPosition`: `'flat-pivot'` `target.set(b.minX + b.totalWidth / 2 + offset.x, b.maxHeight / 2 + offset.y, b.wallZ + offset.z)`; step F `'layout'`: `target = b.center + offset` (roadmap §6.10) |
| `js/interaction/ViewportInput.js` | New dep `onPivotShortcut: () => void`; an `'o'` branch with the guards of 3.4 (from 07 I1 a `KEYMAP` row); the Escape cancel branch of 3.4 (drag active and `gizmo.target?.endGizmoDrag`; from 07 I1 the registry entry 80); the router `mousemove` calls neither `gizmo.onMouseMove` nor `gizmo.onHover` while `interaction.gestureCancelled` (5.4) |
| `js/io/ObjExporter.js` | conditional pivot header lines (7.1); `writeSafeDistance(group, { translate = {x: 0, y: 0, z: 0} } = {})` |
| `js/io/GltfExporter.js` | conditional `scenes[0].extras.pivot` (7.2) |
| `js/io/ProjectSerializer.js` | v2 pivot write and read (4.2-4.4); owned jointly with the B-L31 writer |
| `js/app/WallController.js` | `layout({frame} = {})`; `rebuild({cause = 'edit'} = {})` (`'init'` from the bootstrap, `'pivot'` from `commitPivot`, `'import'` from `applyImport`, `'edit'` from every other call site); `#pivotResolution` cache set in rebuild step 1, which also computes `stageShift(previous, new)`; `WALL_REBUILT` gains `cause` and `stageShift` (5.5); `get pivotResolution()`; `resolvePivotNow()`; **`commitPivot(after)`** (the rebuild-or-cache decision stays in WallController, ARCHITECTURE 6.2); `applyImport` sets the pivot and emits `WALL_PIVOT_CHANGED{import}` |
| `js/app/CameraController.js` | `CameraHub` passes the coverage payload with `distToWall`. `CameraController.setCameraField` passes `{wallZ: frameBounds().wallZ}`. New `translateStage(dx, dz)` (stage-anchored participant; clamps through `CineCamera.LIMITS`, 07 C45). |
| `js/app/PropController.js` | `translateStage(dx, dz)` (stage-anchored participant; clamps through `Prop.LIMITS`) |
| `js/app/PivotController.js` | **new** (5.3) |
| `js/app/ProjectIO.js` | `exportOBJ`, `exportGLTF` and `exportZIP` use `wallController.layout({frame: 'export'})`. `exportSafeDistanceOBJ` passes the `translate` of 7.1. |
| `js/app/App.js` | constructs and wires the new modules (5.8). `frameBounds = () => framingBounds(project, wallController.pivotResolution)`. Registers `pivotMarker.updateScale` with `sceneManager.addPreRender` (07 §5.2.2, C46); it does not edit the tick. |
| `js/ui/PivotPanel.js` | **new** (5.3) |
| `js/ui/CameraPanel.js` | label text (markup), `#camera-wall-distance`, the `#camera-pos-z` `min`, the `source: 'pivot'` mirror |
| `js/ui/PropsPanel.js` | the `source: 'pivot'` mirror (pos-x, pos-z `toFixed(2)`) |
| `js/ui/ViewportToolbar.js` | badge suffix " (translate only)" when the last `SELECTION_CHANGED.modes` excludes `'rotate'` and the gizmo mode is `rotate`. It already subscribes to both events. No label comparison. |
| `index.html` | the "Wall Pivot" section markup (3.2), the camera label and row (3.5), `<link>` to `css/features/pivot.css`. **Not** the help-badge text (3.4: no token; 07 C35). |
| `css/features/pivot.css` | **new** (3.2) |
| `tests/static/check.mjs` | DOM-id ownership for the new ids; the class-collision check (8.2). (`css-slices.mjs` is 07 S7's report-only check scoped to `01-12`; nothing to amend.) |

### 5.3 New modules (signatures)

**`js/app/PivotController.js`** (layer `app`; imports `core`, `domain`, `geometry`; collaborators injected):

```js
/** @typedef {object} StageAnchored   a stage-frame object re-expressed on explicit pivot edits
 *  @property {string} id
 *  @property {(dx: number, dz: number) => void} translateStage   domain write + its own pose mirror event; NO hub refresh */

export class PivotController {
  /** @param {{project: Project, wallController: WallController, markerView: PivotMarkerView,
   *           stageAnchored: StageAnchored[], selection: SelectionManager, gizmo: TransformGizmo,
   *           interaction: InteractionState, bus: EventBus}} deps
   *  stageAnchored order = re-expression order: [cameraController, personController, carController]
   *  (+ Feature 5's HDRI point, + 09's MeasurementController, + 07's OrbitController from I4b; 07 C45).
   *  Every participant clamps through its own LIMITS. */
  constructor({ project, wallController, markerView, stageAnchored, selection, gizmo, interaction, bus })

  get pivot()                         // project.wall.pivot
  /** #commit(p => p.setMode(mode), 'mode') */
  setMode(mode)
  /** returns the stored component (for write-back); #commit(p => p.setOffsetAxis(axis, raw), 'offset') */
  setOffsetAxis(axis, raw)
  resetOffset()                       // #commit(p => p.resetOffset(), 'reset-offset')
  /** if (pivot.setKeepStageLayout(on)) emit WALL_PIVOT_CHANGED{source: 'keep-stage', stageShift: {x: 0, z: 0}, reexpressed: false, rebuilds: false} */
  setKeepStageLayout(on)
  /** display.showPivotMarker = on; emit WALL_PIVOT_CHANGED{source: 'marker', ..., rebuilds: false} (the marker view mirrors visibility) */
  setMarkerVisible(on)
  /** gizmo.setSnapIncrements({ pivotM: m }); m must be one of the #pivot-snap option values (else throws) */
  setSnapStep(m)
  /** O key and #pivot-select: toggle selection (3.4). No-op while interaction.isDraggingGizmo || interaction.gestureCancelled. */
  toggleSelect()

  // ---- Selectable 'pivot' (the path-B hook set of 5.4, 07 C33) ----
  id = 'pivot'; label = 'Pivot'; kind = 'pivot'; pickPriority = 10;
  /** {x: true, y: true, z: true} for 'translate'; null for 'rotate' (mode unsupported: no rotate handles, and
   *  SELECTION_CHANGED.modes = ['translate']). */
  allowedAxes(mode)
  isPickable()                        // markerView.exists && markerView.hasResolution && markerView.visible
  pickMeshes()                        // markerView.pickMeshes()
  hasGizmoTarget()                    // markerView.exists && wallController.pivotResolution !== null
  /** STAGE frame. Reads the WallController cache, which rebuild step 1 and commitPivot set BEFORE WALL_REBUILT /
   *  SELECTABLE_MOVED are emitted, so the result never depends on the order of WALL_REBUILT subscribers (5.4 re-anchor):
   *  const r = wallController.pivotResolution; out.set(#preview.x, (r ? r.point.y : 0) + #preview.y, #preview.z) */
  gizmoAnchor(out)
  orientGizmo(rotation, mode)         // rotation.set(0, 0, 0) in both modes (the pivot has no rotation)
  /** #pending = {x: 0, y: 0, z: 0}; #target = {...offset}; #preview = {x: 0, y: 0, z: 0} */
  beginGizmoDrag()
  /** #pending += movement; #target = dragTarget(offset, #pending, ctx?.snap ? ctx.snap.pivotM : 0) (6.7);
   *  #preview = #target − offset per axis; markerView.setPreview(#preview); bus.emit(SELECTABLE_MOVED, {id: 'pivot'}).
   *  ctx.space and ctx.axisWorld are not needed: stage deltas equal world deltas, and the pivot has no rotation. */
  applyGizmoTranslate(movement, ctx)
  applyGizmoRotate(axis, deltaDeg, ctx) // no-op (never called: allowedAxes('rotate') is null)
  /** The only end hook.
   *  cancel === false (mouse-up after a drag): const t = #target; #clearPreview();
   *    if (t equals offset) { bus.emit(SELECTABLE_MOVED, {id: 'pivot'}); return }
   *    #commit(p => p.setOffset(t), 'gizmo')
   *  cancel === true (Escape mid-drag through TransformGizmo.cancelDrag(), or detach() during a drag):
   *    #clearPreview(); bus.emit(SELECTABLE_MOVED, {id: 'pivot'}). Commits nothing. */
  endGizmoDrag({ cancel })
  // #clearPreview(): #preview = {x: 0, y: 0, z: 0}; markerView.clearPreview()
}
```

**`js/render/PivotMarkerView.js`** (layer `render`):

```js
export class PivotMarkerView {
  /** R4: no allocation. Subscribes (mirrors of its own objects only):
   *   WALL_REBUILT({layout})           -> #place(layout.pivot.resolution)   (ignored until init)
   *   WALL_PIVOT_CHANGED({resolution}) -> #place(resolution); #applyVisibility()
   *   SELECTION_CHANGED({id})          -> colour (selected vs idle); #applyVisibility()
   *  @param {{sceneManager: SceneManager, bus: EventBus, display: DisplaySettings, theme: {scene: SceneTheme}}} deps */
  constructor({ sceneManager, bus, display, theme })
  /** Allocates the group (glyph cross, core octahedron, pick proxy, drop line, anchor ghost, link line) and
   *  sceneManager.addHelper(group); then #place(resolution). Called ONCE, as the LAST bootstrap step (5.8). */
  init(resolution)
  get exists(); get visible(); get hasResolution(); get group()
  pickMeshes()                        // [pickProxy]
  /** STAGE frame. resolution ? out.set(0 + preview.x, resolution.point.y + preview.y, 0 + preview.z)
   *                         : out.set(preview.x, preview.y, preview.z)   (never dereferences a null resolution) */
  glyphPosition(out)
  setPreview(dx, dy, dz)              // glyph + drop line + link follow; anchor ghost stays
  clearPreview()
  /** Minimum screen size (3.3): s = max(1, minPx * 2 * d * tan(THREE.MathUtils.degToRad(camera.fov) / 2) / heightPx / glyphHalfSize)
   *  on the glyph and ghost groups (camera.fov is in degrees in r128). */
   *  No-op before init or while hidden. Called by the App frame tick before sceneManager.render(). */
  updateScale(camera, heightPx)
  dispose()                           // ResourceTracker (maps: false)
}
```

`#place(null)` stores `null`, hides the group and skips every geometry update. Stage positions otherwise: glyph at `(0, P.y, 0)`; anchor ghost at `(A.x − O.x, A.y, A.z − O.z)`; drop line from `(gx, 0, gz)` to the glyph when `|glyph.y| > 1e-6`; link line from the ghost to the glyph when the offset is non-zero. The small dashed geometries are rebuilt in `#place` and `setPreview` (a few vertices) and disposed through the tracker.

**`js/ui/PivotPanel.js`** (layer `ui`; imports `core`, `legacy`, `domain` (the static `PIVOT_MODES` only) and `ui/dom.js`):

```js
export class PivotPanel {
  /** Owns #pivot-mode-select (+ its .pivot-mode-option labels and pivot-mode radios), #pivot-offset-x/y/z, #pivot-reset-offset,
   *  #pivot-select, #pivot-snap, #toggle-pivot-keep-stage, #toggle-pivot-marker, #pivot-readout, #pivot-status.
   *  Every mirror is a pure function of the payload it receives (R3: idempotent, no private event history).
   *  Subscribes:
   *   WALL_PIVOT_CHANGED -> radios checked + .active, inputs toFixed(3), reset disabled state, toggles, readout;
   *                         status = pivotStatusText(payload):
   *                           'mode' | 'offset' | 'reset-offset' | 'gizmo':
   *                               stageShift ≠ 0 ? the "Stage origin moved …" text (3.6; "kept their place" iff reexpressed,
   *                               else "kept their coordinates") : `Pivot height ${resolution.point.y.toFixed(3)} m · affects exports only`
   *                           'import' -> ''          'keep-stage' | 'marker' -> status unchanged (no write)
   *   WALL_REBUILT       -> readout from layout.pivot.resolution; status by `cause` (5.5):
   *                           'pivot'            -> unchanged: the WALL_PIVOT_CHANGED of the same commit already wrote it
   *                           'init' | 'import'  -> ''
   *                           'edit'             -> stageShift ≠ 0 ? the wall-edit text of 3.6 : ''
   *   SELECTION_CHANGED  -> #pivot-select .active / aria-pressed
   *  @param {{doc, project: Project, pivotController: PivotController, bus}} deps */
  constructor({ doc, project, pivotController, bus })
  /** radio change -> setMode; offset change -> write-back; reset click; select click -> toggleSelect();
   *  snap change -> pivotController.setSnapStep(Number(value)); toggles click + Space/Enter keydown -> setKeepStageLayout / setMarkerVisible */
  bind()
}
```

Because `WallController` puts `cause` and `stageShift` into the `WALL_REBUILT` payload (5.5), the panel needs no hidden ordering contract between `WALL_PIVOT_CHANGED` and the next `WALL_REBUILT`. Delivering the same payload twice gives the same text. A height-only change (`rebuilds: false`, no rebuild) cannot leave state behind that would swallow the next section edit's message.

### 5.4 `Selectable` contract and the shared gizmo lifecycle (`SelectionManager`, `TransformGizmo`; the path-B hook set of 07 C33)

**One hook set, mapped one-to-one onto 07's Selectable v2** (07 §5.4.1 mapping table). This spec implements it in T5 and amends ARCHITECTURE 3.8 once; spec 02 reuses it. Legacy selectables (`CameraController`, `PropController`) implement none of the optional members and behave exactly as today.

**Path A note.** If this feature lands **after** 07 I3, it implements Selectable v2 directly instead of this set: `allowedAxes(mode)` as below, `getTransform(out, {mode})` (from `gizmoAnchor` and `orientGizmo`), `applyTransform(t, phase, ctx)` with `'start'` = `beginGizmoDrag`, `'drag'` = `applyGizmoTranslate` on the delta from `ctx.start`, `'end'` = `endGizmoDrag({cancel: false})`, `'cancel'` = `endGizmoDrag({cancel: true})`, and `historyLabel = 'Move pivot'`; `TransformControls` then owns the pointer and `gestureCancelled` is not needed. With the recommended order (07 C58: I1-I3 before spec 02's gizmo work), the conversion of an already-landed pivot is part of 07 I3 (about 1 d, counted there).

```js
 * @property {'camera'|'prop'|'pivot'|'projector'|'section'} kind
 *           REQUIRED for every Selectable added after Phase 1: register() throws without it. Inferred only for the three
 *           legacy ids ('camera' -> 'camera'; 'person', 'car' -> 'prop'). The pivot declares 'pivot'; spec 05's HDRI point
 *           ('hdri-point') declares 'projector' (07 C36).
 * @property {number} [pickPriority]      default 0. Outranks WALL (section) hits only; see the pickAt rule below.
 *                                        Pivot 10 (this spec), HDRI point 9 (spec 05).
 * @property {(mode) => {x: boolean, y: boolean, z: boolean} | null} [allowedAxes]   default all true in both modes.
 *                                        null = the mode is unsupported: TransformGizmo.rebuild builds no handles, and the
 *                                        mode is left out of SELECTION_CHANGED.modes. A false axis gets no handle (B-L22).
 *                                        The pivot: all axes for 'translate', null for 'rotate'.
 * @property {(hit) => string|null} [resolveHit]      spec 02 (providers)
 * @property {(rotation: THREE.Euler, mode) => void} orientGizmo   the second argument is the gizmo mode; legacy targets ignore it
 * @property {() => void} [beginGizmoDrag]            TransformGizmo.onMouseDown, on a handle hit
 * @property {(opts: {cancel: boolean}) => void} [endGizmoDrag]   the ONLY end hook. {cancel: false}: TransformGizmo.onMouseUp,
 *                                        iff a drag was active: commit. {cancel: true}: TransformGizmo.cancelDrag() (Escape)
 *                                        and detach() during a drag: restore. Absent: the drag cannot be cancelled, and
 *                                        Escape keeps the legacy behaviour.
 * applyGizmoTranslate(movement, ctx) / applyGizmoRotate(axis, deltaDeg, ctx):
 *           ctx = { space, axisWorld, snap }: axisWorld is the unit drag axis in world space; snap is interaction.snap
 *           iff Ctrl/⌘ is held, else null. Legacy targets ignore ctx.
```

**`pickAt`: priority counts only against wall hits.** `hits` are the resolved hits in raycaster order, nearest first. `owner(h)` resolves a hit to its Selectable: `userData.selectType` in Phase 1, and spec 02's per-call owner map (`#nearestResolved`) later.

```js
const kindOf = (h) => owner(h).kind;
const prio   = (h) => owner(h).pickPriority ?? 0;
const first  = hits[0];
if (!first) return miss();
if (kindOf(first) !== 'section') return first;           // camera, prop, pivot, projector: the NEAREST hit wins (legacy rule)
let best = null;                                           // the nearest hit is the wall: look through it
for (const h of hits) {
  if (kindOf(h) === 'section' || prio(h) <= 0) continue;   // only a positive priority beats a wall hit
  if (!best || prio(h) > prio(best)) best = h;             // strict >: the nearest among equal priorities
}
return best ?? first;
```

- **Before spec 02**, the wall is not pickable at all, so `pickAt` is the legacy nearest-first pick, bit for bit. The marker is pickable "through the wall" trivially.
- **With spec 02**, a click on the wall in front of the marker selects the pivot, and a click on the wall elsewhere selects the section. The camera body, the person and the car in front of the marker are always picked before it, even though the marker's pick sphere keeps a radius of at least about 14 px on screen (3.3). This matters in the centred modes: once step C makes the marker visible by default, the stage origin is exactly where talent, props and the re-expressed camera stand.
- Spec 02's `#nearestResolved` (02 5.2, "the highest priority among resolved hits, then the nearest") and spec 07's picking text (§3 interaction table: "Overlapping hits resolve by `pickPriority`, then distance"; §5.4.1 `pickPriority`) adopt this rule. The amendment is recorded by T13 (5.10.1 #6).

`select(id)` emits `SELECTION_CHANGED` with `modes = ['translate', 'rotate'].filter(m => !sel.allowedAxes || sel.allowedAxes(m) !== null)` (corrected in T5: the earlier `(sel.allowedAxes?.(m) ?? {}) !== null` turned a `null` into `{}` and so kept every mode) (the modes whose `allowedAxes` is not `null`, as 07 §5.4.1 derives it; `[]` on deselect). The payload is emitted before `gizmo.attach`, so `ViewportToolbar` must not read `gizmo.target` there; it caches `modes` instead. Spec 07 §5.4.1 keeps the same field.

**`TransformGizmo`** (shared with spec 02; Phase 3 order makes this spec implement it, in T5):

```js
// onMouseDown, on a handle hit: interaction.gestureCancelled = false; ...legacy...; interaction.isDraggingGizmo = true;
//                               target.beginGizmoDrag?.()
// onMouseMove: ctx = { space: this.space, axisWorld: {x, y, z} /* the unit drag axis in world space */,
//                      snap: (event.ctrlKey || event.metaKey) ? interaction.snap : null }
//   translate: target.applyGizmoTranslate(movement, ctx); rotate: target.applyGizmoRotate(axis, sign * angle, ctx)
// onMouseUp:   const wasDragging = interaction.isDraggingGizmo; /* legacy 3411-3425 body */
//              interaction.gestureCancelled = false;                     // the swallowed gesture ends here
//              if (wasDragging && target) target.endGizmoDrag?.({ cancel: false })
/** @returns {boolean} whether a drag was cancelled */
cancelDrag()   // if (!interaction.isDraggingGizmo || !target?.endGizmoDrag) return false;
               // target.endGizmoDrag({ cancel: true }); interaction.isDraggingGizmo = false; interaction.gestureCancelled = true;
               // activeAxis = null; opacities by hoveredAxis; updateOrientation(); updatePosition(); return true
detach()       // if (interaction.isDraggingGizmo && target?.endGizmoDrag) this.cancelDrag(); then the legacy body
setSnapIncrements(partial)   // Object.assign(interaction.snap, partial): a merge; each spec passes only its own keys
// rebuild(): no handles at all when target.allowedAxes?.(this.mode) === null; per axis, none when
//            target.allowedAxes?.(this.mode)?.[k] === false
// updateScale(camera): registered with sceneManager.addPreRender by spec 02 path B (07 C46)
// constructor: bus.on(WALL_REBUILT, () => { if (target?.kind === 'pivot') updatePosition() })
//              (spec 02 extends the condition to 'section', with updateOrientation(): its 5.3)
```

**Gesture swallowing after a cancel.** The orbit `mousedown` listener is registered first (legacy 3821, init phase). When the gizmo's handle press is processed, the orbit has already set `isDragging = true`, with `previousMousePosition` at the press point. Its `mousemove` returns only while `isDraggingGizmo` is true (3826-3827). If `cancelDrag()` only cleared `isDraggingGizmo` while the button is still held, the first move after Escape would therefore orbit the view by the whole drag distance: 0.01 rad/px, so a 120 px drag would make a jump of about 1.2 rad. Legacy never cleared the flag before mouse-up, so that would be a regression. Hence the flag `InteractionState.gestureCancelled`:
- It is set only by `cancelDrag()`. It is cleared by `onMouseUp()` (both the canvas and the window `mouseup` call it, 4462-4472) and, defensively, at the start of the next `onMouseDown()`. Its writer is `TransformGizmo` alone, like `isDraggingGizmo` (ARCHITECTURE 4).
- `OrbitController`'s pointer `mousemove` returns while `interaction.isDraggingGizmo || interaction.gestureCancelled` (and pilot, as today).
- The `ViewportInput` router's `mousemove` calls neither `gizmo.onMouseMove` nor `gizmo.onHover` while the flag is set, so no handle lights up while the button is held. Spec 02's 3b hover scheduler and click-select (`#press` is `null` after a handled press) need no change.
- The orbit's own `mouseup` and `mouseleave` listeners (3833-3834) still reset `isDragging`, so leaving the canvas and re-entering with the button held cannot orbit either.
- When nothing is cancelled, the flag is never set, so every legacy path is unchanged (step A identity).

**Re-anchoring after rebuilds.** `SELECTABLE_MOVED {id: 'pivot'}` is emitted by P-PIVOT, by the drag preview and by cancel. A rebuild with another cause can also move the marker: a section edit or an import that changes `P.y` (the `mesh-center` height) or the anchor in plan. Mirrors may not emit events (R3), so instead `TransformGizmo` re-anchors a selected pivot on `WALL_REBUILT`. The anchor is read from `wallController.pivotResolution`, which rebuild step 1 sets before the event, so the order of `WALL_REBUILT` subscribers does not matter (5.3 `gizmoAnchor`).

`onMouseUp` stays idempotent across the canvas and window `mouseup` calls, because only the first call sees `wasDragging === true`. After `cancelDrag()`, the later mouse-up sees `false`, commits nothing and clears `gestureCancelled`.

**Later ports.** Spec 07's I3 port to r128 `THREE.TransformControls` (07 §5.4.1) maps this set one-to-one onto `applyTransform(t, phase, ctx)`: `beginGizmoDrag` → `'start'`, `applyGizmo*` → `'drag'`, `endGizmoDrag({cancel: false})` → `'end'`, `endGizmoDrag({cancel: true})` → `'cancel'`; `allowedAxes(mode)` keeps its meaning (`null` = mode unsupported; booleans → `showX/Y/Z`). There, `TransformControls` owns the pointer, and `dragging-changed` sets `orbit.enabled`, which replaces `gestureCancelled`. Snapping stays relative to the drag start in the target (6.7), so `setTranslationSnap` is not used.

### 5.5 Events

| Event | Payload | Emitted by (exact point) | Subscribers (mirrors) |
|---|---|---|---|
| **`wall:pivotChanged`** (`WALL_PIVOT_CHANGED`, new) | `{source: 'mode'\|'offset'\|'reset-offset'\|'gizmo'\|'import'\|'keep-stage'\|'marker', pivot: {mode, offset: {x, y, z}, keepStageLayout}, resolution: PivotResolution\|null, stageShift: {x, z}, reexpressed: boolean, rebuilds: boolean}` | `PivotController.#commit` after the model write and the re-expression, **before** `wallController.commitPivot`. Also `PivotController.setKeepStageLayout` / `setMarkerVisible` (`rebuilds: false`, `resolution` = the cached `wallController.pivotResolution`), and `WallController.applyImport` after the pivot assignment, before the rebuild (`rebuilds: true`, `resolution` = `resolvePivotNow()`). | `PivotPanel`, `PivotMarkerView`, `CameraPanel` (`#camera-pos-z` `min`) |
| `wall:rebuilt` (existing) | `{layout, meshMode, view}` **plus** `cause: 'init'\|'pivot'\|'import'\|'edit'` and `stageShift: {x, z}` (the stage-origin change against the resolution cached before this rebuild, layout frame; `stageShift(null, r)` at `'init'`). `layout` now carries `layout.pivot = {resolution, frame: 'stage', translation}`. Both new fields are additive; Phase 1 subscribers ignore them. | `WallController.rebuild({cause})`, last step (unchanged point) | gains `PivotMarkerView`, `PivotPanel` (readout, status by `cause`/`stageShift`), `CameraPanel` (`min` refresh) and `TransformGizmo` (re-anchor of a pivot target, 5.4) |
| `selection:changed` (existing) | gains `modes: ('translate'\|'rotate')[]` (the modes whose `allowedAxes` is not `null`, 5.4); spec 02 adds `ids`, `kind`, `origin` | unchanged points | `ViewportToolbar` (badge suffix) |
| `camera:coverageChanged` (existing) | gains `distToWall` | unchanged | `CameraPanel` writes `#camera-wall-distance` |
| `camera:poseChanged` (existing) | new `source: 'pivot'` | `CameraController.translateStage` | `CameraPanel`: pos-x, pos-z `toFixed(2)` |
| `prop:poseChanged` (existing) | new `source: 'pivot'` | `PropController.translateStage` | `PropControls`: pos-x, pos-z `toFixed(2)` |
| `selectable:moved` (existing) | `{id: 'pivot'}` | `PivotController` (drag preview, cancel, end of commit) | `TransformGizmo` (unchanged handler) |

### 5.6 Pipelines

**P-PIVOT: `PivotController.#commit(mutate, source)`**

```
const pivot = project.wall.pivot
const snapshot = pivot.clone()
mutate(pivot)                                                   // WallPivot method (clamped and rounded)
if (pivot.equals(snapshot)) return                              // nothing changed: no event, no rebuild
const before = wallController.pivotResolution                  // cached from the last rebuild or commit (O_old)
const after = wallController.resolvePivotNow()                 // pure: resolvePivot(computeWallLayout(sections), pivot)
const shift = stageShift(before, after)                        // geometry helper: so(after) − so(before), so(null) = (0, 0)
const moved = shift.x !== 0 || shift.z !== 0
const reexpressed = moved && pivot.keepStageLayout
if (reexpressed) for (const p of stageAnchored) p.translateStage(-shift.x, -shift.z)    // camera, person, car, HDRI point, measurements,
                                                                                        // orbit (07 I4b): pose mirrors, each clamped
                                                                                        // through its LIMITS; never recorded on their own
emit WALL_PIVOT_CHANGED { source, pivot: pivot.clone(), resolution: after, stageShift: shift, reexpressed, rebuilds: moved }
wallController.commitPivot(after)          // WallController decides (ARCHITECTURE 6.2 ownership):
                                           //   stageShift(this.#pivotResolution, after) non-zero ? this.rebuild({cause: 'pivot'})
                                           //     (P1: stage layout -> view -> stats -> orbit retarget -> hub.refresh iff camera
                                           //     enabled -> WALL_REBUILT{cause: 'pivot', stageShift}; caches `after`)
                                           //   : this.#pivotResolution = after       (height-only: framing uses O only)
emit SELECTABLE_MOVED { id: 'pivot' }      // the gizmo follows the marker if the pivot is selected (also for height-only)
// From 07 H1, the whole commit runs inside one history.run('Pivot …', …): ONE entry that includes every translateStage
// write (camera, props, HDRI point, measurements, orbit; 07 C59).
```

**`WallController.rebuild({cause = 'edit'} = {})` step 1** becomes:

```
const prev = this.#pivotResolution                       // null before the first rebuild
layout = layoutProject(project)                          // stage frame (6.3)
this.#pivotResolution = layout.pivot.resolution
const shift = stageShift(prev, this.#pivotResolution)    // carried to the WALL_REBUILT payload of the last step
```

Every existing call site passes nothing (`'edit'`), except the bootstrap (`'init'`), `commitPivot` (`'pivot'`) and `applyImport` (`'import'`). The ARCHITECTURE 6.2 rows keep their rebuild counts; only the payload gains fields.

- `CameraController.translateStage(dx, dz)`: `cine.translateStage(dx, dz); bus.emit(CAMERA_POSE_CHANGED, {source: 'pivot'})`. No hub refresh, because the rebuild runs it.
- `PropController.translateStage(dx, dz)`: `prop.translateStage(dx, dz); bus.emit(PROP_POSE_CHANGED, {id, source: 'pivot'}); this.applyTransform()`. `applyTransform` returns early when the view does not exist. The pose is re-expressed even while the prop is hidden.
- `PivotController` never calls `rebuild()`. `WallController` remains the only module that decides wall rebuilds besides the bootstrap; `commitPivot` is its new use case.

**Rebuild policy (new rows for ARCHITECTURE.md 6.2 and `tests/unit/wall-controller.test.mjs`).** Rows carry **named ids** (07 0.4: `F3-1`..`F3-5`), not contested numbers; 07's D0 applies the scheme to ARCHITECTURE 6.2.

| Id | Trigger | UI entry | Controller call(s) | Rebuild | Other steps |
|---|---|---|---|---|---|
| F3-1 | pivot mode radio `change` | `PivotPanel` | `PivotController.setMode` → `WallController.commitPivot` | iff the stage origin moved | re-express iff keep; `WALL_PIVOT_CHANGED{mode}` |
| F3-2 | offset input `change` | `PivotPanel` | `setOffsetAxis` → `commitPivot` | iff the x or z of the origin moved (never for y) | write-back `toFixed(3)` |
| F3-3 | `#pivot-reset-offset` | `PivotPanel` | `resetOffset` → `commitPivot` | iff the origin moved | – |
| F3-4 | gizmo mouse-up after a pivot drag | `TransformGizmo.onMouseUp` | `PivotController.endGizmoDrag({cancel: false})` → `commitPivot` | iff the origin moved | **zero** rebuilds during the drag; Escape (`cancelDrag` → `endGizmoDrag({cancel: true})`) commits nothing |
| F3-5 | keep-stage or marker toggle | `PivotPanel` | `setKeepStageLayout` / `setMarkerVisible` | never | event only |
| import row (amended) | import | `ProjectIO` | `applyImport` (07 D5: `ProjectSession.apply`) | always (unchanged), with `cause: 'import'` | pivot assignment + `WALL_PIVOT_CHANGED{import}` before the rebuild; no re-expression |

**Drag flow.**
1. `TransformGizmo.onMouseDown` hits a handle and calls `beginGizmoDrag()`.
2. On every `onMouseMove`, `PivotController.applyGizmoTranslate(movement, ctx)` runs: the marker preview moves and `SELECTABLE_MOVED` fires, so the gizmo follows.
3. On mouse-up, `onMouseUp` calls `endGizmoDrag({cancel: false})`, which runs P-PIVOT once.
4. Escape mid-drag runs `gizmo.cancelDrag()` only (the pivot implements `endGizmoDrag`). That calls `endGizmoDrag({cancel: true})`: the preview clears and nothing is committed. It also sets `gestureCancelled`, so the moves that follow neither orbit the view nor hover the gizmo (5.4). The pivot stays selected. The later mouse-up finds no active drag and clears the flag. A second Escape deselects.

### 5.7 `Strategies` and the LEGACY registry

| Change | Detail |
|---|---|
| Step A: `Strategies.framingBounds: 'flat'` becomes `'flat-pivot'` | `framingBounds` gains `case 'flat-pivot'` (6.6) and keeps the switch-and-throw. The `'flat'` case is deleted in the same commit, because the key has one read site. **Identity-exact:** no harness output changes (proved in 6.6 and tested in 8.1). |
| Step F (= the roadmap's P2-11c commit): `'flat-pivot'` becomes `'layout'` | **Exactly** P2-11c as roadmap §6.10 and the P2-11 table define it, with `FramingPolicy`'s three named boxes (07 C34): `generativeBox` (orbit target before 07 I4b), `wallBox` (`center` for `resetTo`), and `stageExtent` for `width = extentAcross(facing)` (rotation-invariant; it replaces the axis-aligned `max.x − min.x`), `height`, D and `fits`, plus the chord-normal `facing` and `resetTo(framing)` with its pan. The camera Z minimum is removed (roadmap Q13), and the input relabel is already done in step B. All of it is evaluated on `layoutProject(project)`, the stage layout, so it is pivot-aware with no extra code. The `'flat-pivot'` fields `{totalWidth, maxHeight, minX, wallZ}` are kept in the returned object: `coverage` reads them until P2-11a deletes it, and the `posZ` fallback reads `wallZ` (4.1). If the box is empty or not finite, the whole flat-pivot framing object is returned instead (6.6). **One implementation, one re-baseline, counted once (in 08):** step F is P2-11c's own commit, landed by the roadmap as soon as P2-11 lands (07 §1.4 sequencing); if it has landed before this spec, step F is empty. This spec has no step-F task. The roadmap's `'pivot'` alias is not needed. |
| `LEGACY_SITES` | Step A: `js/geometry/WallLayout.js#framingBounds` (B-L2, B-M10) stays, with the behaviour text "flat bounds (Σ arc width × max height), translated by the stage origin". Step F: the rows that P2-11c removes are removed (roadmap P2-11 table): `WallLayout.js#framingBounds`, `OrbitController.js#updateTargetPosition` and `CineCamera.js#translateBy` (B-L10). The fourth, `Wall.js#flatBounds`, is removed too if P2-11a has landed. Otherwise it stays, re-tagged B-M10 only, because `coverage` still reads the flat-pivot fields; P2-11a removes it with `coverage`. `js/domain/CineCamera.js#coverage` keeps LEGACY(B-M10) until P2-11a. B-M15 tags (`SafeDistanceView.js#create`, `WallLayout.js#flatEdges`) are untouched (2.3). |
| `curveBeforeFirstPanel` | untouched (6.9) |
| New keys | none. The grid change (step D) is a `Theme` value, not a quirk switch. |

### 5.8 Bootstrap (ARCHITECTURE.md section 7 amendments)

**Construct phase** (no allocation, R4):
- after `carView`: `pivotMarker = new PivotMarkerView({ sceneManager, bus, display, theme })`;
- immediately after `wallController` (it needs `wallController`, the camera and prop controllers, `selection`, `gizmo` and `interaction`): `pivotController = new PivotController({ project, wallController, markerView: pivotMarker, stageAnchored: [cameraController, personController, carController], selection, gizmo, interaction, bus })`; spec 05 appends its HDRI point, spec 09 its `MeasurementController`, and 07 I4b the `OrbitController` (07 C45);
- then `selection.register(pivotController)`. This comes after the camera, person and car registrations, so the pivot is last in tie order. Its priority decides picks anyway;
- `viewportInput` receives `onPivotShortcut: () => pivotController.toggleSelect()`;
- after `displayPanel`: `pivotPanel = new PivotPanel({ doc, project, pivotController, bus })`.

`frameBounds` becomes `() => framingBounds(project, wallController.pivotResolution)`. The closure is evaluated lazily, and the cache is set in P1 step 1 before any reader runs (P1 step 4 and the hub).

The bootstrap rebuild (ARCHITECTURE 6.2 row 1) becomes `wallController.rebuild({cause: 'init'})`. `TransformGizmo` subscribes to `WALL_REBUILT` in its constructor (5.4). Its handler reads only `wallController.pivotResolution` through the target, so its position among the `WALL_REBUILT` subscribers is irrelevant. With no target selected at bootstrap, it does nothing.

**setupUI phase:** `pivotPanel.bind()` right after `displayPanel.bind()`, matching the sidebar order.

**Frame tick:** owned by 07 §5.2.2; this spec does not quote or edit it. `App` registers `sceneManager.addPreRender((camera) => pivotMarker.updateScale(camera, canvas.clientHeight))` (07 C46), which runs on every rendered frame after the camera update and before the passes. `updateScale` is a no-op before `init` and while the marker is hidden, so step A stays pixel-identical. (If this spec lands before 07 R3, `addPreRender` is the same hook on the Phase-1 render loop: it runs before `sceneManager.render()`.)

**Last step, after `orbit.setView('reset')`:** `pivotMarker.init(wallController.pivotResolution)`. Allocating last keeps every legacy THREE id, and so the r128 draw order, unchanged (R4/R5 rationale). With `showPivotMarker = false`, step A is pixel-identical.

### 5.9 ARCHITECTURE.md amendments (made in the implementing commits, R7)

1. **1.4 world conventions:** replace the "world origin" bullet with the three frames of 5.1, and note that `wallGroup` keeps an identity transform and vertices are baked in the stage frame.
2. **Section 9, Feature 3 row:** replace "a root group in `LEDWallView` … (`-pivot + offset`)" with "baked translation in `layoutProject`; stage frame `−(P.x, 0, P.z)`, export frame `−P`; P = anchor + offset; the raw walk is translated first and spec 02's `applySectionOffsets(out)` builds its section matrices from the translated layout (07 C32); no wall root transform, ever (the identity `wallGroup` transform is a unit-tested invariant)". 07's D0 makes this rewrite.
3. **3.6:** settle the `pivotPoint('mesh-center')` y policy as the box centre on `generativeBounds()`, the floor modes at `sections[0].baseY`, and add `translated` (raw walk only), `baseY`, `generativeBounds`, `resolvePivot`, `stageShift` and `layoutProject(project, {frame})`.
4. **3.8:** the `Selectable` typedef of 5.4 (the path-B hook set of 07 C33, `kind` required for new Selectables), the `pickAt` rule (priority against wall hits only), `InteractionState.snap` and `InteractionState.gestureCancelled`, and the `TransformGizmo` lifecycle (`beginGizmoDrag`, `endGizmoDrag({cancel})`, `cancelDrag` → `endGizmoDrag({cancel: true})`, `allowedAxes(mode)` with `null`, `setSnapIncrements`, `ctx = {space, axisWorld, snap}`, the `WALL_REBUILT` re-anchor). `OrbitController`'s pointer `mousemove` guard gains `gestureCancelled`.
5. **4:** state rows for `Project.wall.pivot` (writers: `WallPivot` methods via `PivotController`, `WallController.applyImport`), `display.showPivotMarker` (`PivotController.setMarkerVisible`) and `InteractionState.gestureCancelled` (writer: `TransformGizmo` only).
6. **5.1/5.2:** `Events.WALL_PIVOT_CHANGED`, the events of 5.5, the `WALL_REBUILT` `cause` and `stageShift` fields, and the `SELECTION_CHANGED.modes` payload field.
7. **6.2:** rows `F3-1`..`F3-5`, the amended import row, `rebuild({cause})`, and `WallController.commitPivot` as the pivot rebuild decision.
8. **7:** bootstrap additions and the `addPreRender` registration (5.8).
9. **8.1/8.3:** the `framingBounds` values (`'flat-pivot'`, then P2-11c's `'layout'`) and behaviour text.

### 5.10 Composition with per-section offsets (contract for spec 02)

**Canonical transform of a generative vertex v** (layout frame, column vectors):

```
x_frame = T_frame · S_i · v          T_frame = T(−O) (stage) or T(−P) (export), P = anchor + offset; S_i = section i's offset matrix
```

1. **The anchor is generative.** `resolvePivot` evaluates `pivotPoint(mode)` on the walk's edges and on `generativeBounds()`, **never** on post-transformed geometry. A section offset never moves the pivot (D5). In particular, offsetting section 0 with the `bottom-left` pivot moves section 0, not the rest of the wall.
2. **The composition rule (the only one; recorded as 07 C32): translate the raw walk, then build S_i from the translated geometry.** Spec 02 6.6 uses the same pipeline; revision 2's conjugation inside `translated()` is deleted, and no `conjugateTranslation` exists. `layoutProject` runs `computeWallLayout` (the verbatim walk plus spec 02's two-pass Detached host walk, B-L1 convention; every `postTransform` is `null`: spec 02 removes the Phase 1 `postTransforms` option), then `resolvePivot` on the raw walk from generative quantities only (edges, `firstEdge`/`lastEdge`, attached-only `generativeBounds()`), then `translated(t)` with `t` = −O (stage), −P (export) or 0 (layout). Spec 02's `applySectionOffsets(out)` follows: it builds `S_i` from the **translated** section frame (`O_s`, `B`, `baseY`) and asserts `det > 0`. Then `out.pivot = {resolution, frame, translation}` is set. Spec 02 derives `S_i` from the section's own edges and `baseY` (frame origin `O_i`, basis `B_i`, rotation origin `o`), so `S_i` built on the translated section equals `T(t) · S_i · T(−t)` (spec 02 6.5, "translation equivariance"). Applied to `T(t) v`, it gives `T(t) · S_i · v`, the canonical transform above. `translated()` enforces the order: it **throws** `Error('translated() expects the raw walk: apply section offsets after the pivot translation')` if any `postTransform` is non-null.
3. **Derived caches are not copied.** `translated()` copies edges, panels, `baseY` and every other walk-produced field (spec 02's `detached` flag included). Lazily derived values (spec 02's `SectionLayout.frame`, `bounds()`, `sectionBounds(i)`, `originWorld(i)`) are recomputed on the copy from the translated data, so `frame.origin` and every anchor move with the layout and the frame axes are unchanged.
4. **Gizmo deltas.** The stage frame is a pure translation of the layout frame, with no rotation. Spec 02 can therefore add stage-space gizmo deltas directly to `section.offset.position` (through its section basis B; its 6.8 uses `ctx.axisWorld`). If pivot alignment (Q7) is ever added, those deltas must be rotated back by −yaw.
5. **Safe zone, bounds and picking** read the translated (and offset) layout, so they need no pivot awareness.

#### 5.10.1 The shared contract with spec 02 (current revision), and the amendments T13 records

Revision 2 of this spec and the then-current spec 02 had swapped positions: each adopted the other's earlier hook names. This revision is written against spec 02's **current** text (its 2.2 seams, 3.5 Escape row, 3.5.1 keymap and badge, 5.2 `TransformGizmo`/`ViewportInput` blocks, 5.3 events, §5.5 hook table and 6.5/6.6 composition). It adopts that text wherever spec 02 has one. The right-hand column is the single authority that T5 implements.

| # | Topic | Spec 02 (current revision) | Agreed contract | Amendment needed in |
|---|---|---|---|---|
| 1 | Hook set | §5.5 table: `kind` required (`register` throws), `pickPriority`, `allowedAxes(mode)`, `resolveHit`, `orientGizmo(rotation, mode)`, `beginGizmoDrag()`, `endGizmoDrag({cancel})`, `ctx = {space, axisWorld, snap}` | **One set, 07 C33** (5.4): `allowedAxes(mode)` returns `{x, y, z}` or `null` (`null` replaces `allowedModes`); `endGizmoDrag({cancel})` is the only end hook (no `cancelGizmoDrag`, no argument-less `endGizmoDrag`); `TransformGizmo.cancelDrag()` calls `endGizmoDrag({cancel: true})` and sets `gestureCancelled`. The pivot implements `kind`, `pickPriority`, `allowedAxes` (`null` for `'rotate'`), `orientGizmo`, `beginGizmoDrag`, `applyGizmoTranslate` and `endGizmoDrag`. This spec implements the whole set in T5; spec 02 reuses it. | 02 2.2 and 5.5 (applied by 07 D0); 07 C15 mapping (applied) |
| 2 | Escape mid-drag | 3.5: cancel only when the target implements the end hook; otherwise legacy | **Adopted** (3.4). Addition: the cancelled gesture is swallowed until mouse-up through `InteractionState.gestureCancelled` (5.4), which `OrbitController`'s pointer `mousemove` and the router's `mousemove` (no `onMouseMove`, no `onHover`) honour. | 02 5.2 (`ViewportInput` mousemove line; `TransformGizmo.cancelDrag` sets the flag) |
| 3 | Snapping | `ctx.snap` iff Ctrl/⌘; `snap = {translateMm, rotateDeg}`; `setSnapIncrements({translateMm, rotateDeg})` "its only writer" | One model, D9. `InteractionState.snap = {translateMm: 10, rotateDeg: 5, pivotM: 0.1}`. `TransformGizmo.setSnapIncrements(partial)` is the only writer and **merges**, so spec 02 passes only its own keys. | 02 5.2 (`setSnapIncrements` comment: partial merge), 4.1 snap row (adds `pivotM`) |
| 4 | Composition | 6.5/6.6: translate, then `applySectionOffsets` builds `S_i` from the translated geometry (equivariant); `postTransforms` option removed | **Adopted unchanged** (5.10 #2). This spec deletes its conjugation and makes `translated()` throw on a non-null `postTransform`. Shared equivariance test: this spec's unit test 8 with a stub builder, spec 02's E17 with the real `offsetMatrix`. | – |
| 5 | Floor references | `sectionFrame.origin.y = sl.baseY ?? 0`; the row loops | Consistent: `baseY = −P.y` in the export frame. The anchors of this spec now also use `sections[0].baseY` (6.1). | – |
| 6 | Picking priority | 5.2 `#nearestResolved`, 5.5: "the highest priority among resolved hits, then the nearest" | **Changed:** `pickPriority` outranks **section (wall) hits only**. Among camera, prop, pivot and HDRI-point hits the nearest wins (5.4). Without this, the pivot and spec 05's point would steal clicks from a nearer camera or prop. | 02 5.2 and 5.5 `pickPriority` row; 07 §3 interaction table ("Overlapping hits …") and §5.4.1 `pickPriority` |
| 7 | `SELECTION_CHANGED` payload | `{id, label, ids, kind, origin}` | Adds `modes` (the modes whose `allowedAxes` is not `null`, 5.4); 07 §5.4.1 derives it the same way. | 02 5.3 `selection:changed` row |
| 8 | `WALL_REBUILT` payload | "unchanged payload `{layout, meshMode, view}`" | Gains `cause` and `stageShift` (5.5, this spec, additive). Spec 02's subscribers ignore them. | 02 5.3 `wall:rebuilt` row |
| 9 | Gizmo re-anchor on `WALL_REBUILT` | `TransformGizmo` re-anchors and re-orients iff the target kind is `'section'` | This spec lands the subscription for `'pivot'` (re-anchor only; the anchor comes from the `WallController` cache, so subscriber order does not matter). Spec 02 extends the condition to `'section'` with re-orientation. | 02 5.2 (`constructor` comment: "extends spec 03's subscription") |
| 10 | `generativeBounds()` | listed among spec 02's `WallLayout` additions | Added by this spec (lands first) with the Phase 1 `bounds()` semantics; `pivotPoint` uses it. Spec 02 then makes `bounds()` transformed and keeps `generativeBounds()` as "the same with M treated as null". | 02 5.1 `WallLayout` row (already added) |
| 11 | Rebuild-policy row ids | named ids (07 0.4): spec 02 `F2-1`..`F2-13`, this spec `F3-1`..`F3-5` | Consistent; no number collisions. | – |
| 12 | Help-badge text | no feature adds a token except spec 01's ` N=normals`; 07 I4a rewrites the badge once (07 C35) | **Adopted.** This spec does not edit `.info-badge` and adds no token (3.4). | – |
| 13 | `pivot_gizmo` re-capture | 8.3 step C re-captures spec 03's `pivot_gizmo` Escape step | Not needed. The pivot implements the end hook with `{cancel: true}`, so this spec's forward golden already records "Selected: Pivot" after a cancelled drag. Spec 02 drops that item. | 02 8.3 step C, 10.3 |
| 14 | Framing (02 5.7) | `'flat'` or spec 03's `'flat-pivot'` until the B-L2/B-M10 fixes | Consistent. Step F is P2-11c, and its `worldVertices()` reads spec 02's transformed layout automatically. | – |

**T13 is a hard gate for T5.** The amendments of the last column were applied to spec 02 and spec 07 by 07's consolidated D0 (07 C58); T13 is now the owner's sign-off only, recorded in both documents before T5 starts. **Signed off by the owner on 2026-10-16** (IMPROVEMENT_PLAN §8, A7); recorded here and in spec 02 §10.3. **Confirmed on 2026-10-17**, when the owner made this feature the next priority (session-only, path B, IMPROVEMENT_PLAN §8): the right-hand column stands unchanged, and T13 is done. T5 then implements the right-hand column once, and the gizmo unit tests (8.1) encode it for both specs.

---

## 6. Algorithms and math

Conventions: metres, Y up, the wall front faces +Z, the layout origin is the first section's first bottom vertex, and plain `{x, y, z}` objects are used (the geometry layer is THREE-free).

### 6.1 Anchors (`WallLayout.pivotPoint(mode)`, layout frame)

Let `f = firstEdge` (`sections[0].edges[0]`) and `l = lastEdge` (the last section's last edge). Each `edge = {x, z, angle}`. The bottom of every column is at `y = sl.baseY`, which is 0 in the layout frame and the same for every section of one layout (a translation adds the same `dy` to all of them). Let `y0 = this.sections[0].baseY`.

```
'bottom-left' : { x: f.x,               y: y0,                        z: f.z }
'wall-center' : { x: (f.x + l.x) / 2,   y: y0,                        z: (f.z + l.z) / 2 }
'mesh-center' : b = generativeBounds();  { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 }
otherwise     : throw new RangeError(`Unknown pivot mode ${JSON.stringify(mode)}`)   (the Phase 1 error type, kept)
empty wall    : null
```

In the layout frame `y0 = 0`, so the floor modes return the Phase 1 values bit for bit (`0` is the same `+0` the Phase 1 literal produced). On a translated copy, the floor anchors follow the floor (`baseY = dy`), so `copy.pivotPoint(m)` equals the original's `pivotPoint(m)` shifted by `(dx, dy, dz)` in **every** mode. In particular, `pivotPoint(m)` of the stage layout is `A − O = (−o.x, A.y, −o.z)`, and of the export layout `A − P = −o`, where `A` is the layout-frame anchor, `o` the offset, and `O`, `P` as in 5.1.

`generativeBounds()` is `FramingPolicy`'s `generativeBox` (07 C34): the axis-aligned box over every grid vertex before spec 02's offsets, over the **attached** sections only once spec 02 T3 lands (identical until a section is detached, so a detached ceiling never moves the pivot). In plan it is the edges; in height it runs from `sl.baseY` to `sl.baseY + panelRows · panelH`. For bottom-aligned walls `min.y = 0` and `max.y = max over sections of panelRows · panelHeight · 0.001`, so mesh-centre y is **half the tallest section's height**. Frames (0.02 m deep boxes) are excluded. The bounding box is the one DCCs call "bounds centre"; the area centroid is not used.

**Extension point (Q2, Q13).** A further mode costs one `PivotMode` entry, one `PIVOT_MODES` entry (which the validator and the radio list read), one radio card and one `pivotPoint` case. The candidate the owner may want is the **surface centre** (`surface-center`, optional task T15): the point on the LED surface halfway along the wall, where the content centre sits.

```
'surface-center' : L = Σ over sections, columns k of |e[k+1] − e[k]|  (horizontal chord lengths, generative edges)
                   walk the columns again until the accumulated length reaches L / 2 (O(n));
                   in the column (sl, k) where it does: u = (L/2 − acc) / |e[k+1] − e[k]|,
                   x = e[k].x + u·(e[k+1].x − e[k].x), z likewise, y = sl.baseY + sl.section.panelRows · sl.panelH / 2
                   empty wall: null; L === 0: fall back to 'wall-center'
```

On a flat wall it equals `mesh-center` when all sections share one height; on a curved wall it lies on the surface, by the sagitta behind or in front of the chord midpoint.

### 6.2 Pivot resolution (`resolvePivot(layoutL, pivot)` in `js/geometry/WallLayout.js`)

```js
/** @typedef {{mode, offset: {x,y,z}, anchor: {x,y,z}, point: {x,y,z}, stageOrigin: {x,y,z}}} PivotResolution  (layout frame) */
export function resolvePivot(layoutL, pivot) {
  const a = layoutL.pivotPoint(pivot.mode) ?? { x: 0, y: 0, z: 0 };     // empty wall -> anchor at the layout origin
  const o = pivot.offset;
  const P = { x: a.x + o.x, y: a.y + o.y, z: a.z + o.z };
  if (!Number.isFinite(P.x) || !Number.isFinite(P.y) || !Number.isFinite(P.z)) return null;   // B-L8 garbage: identity fallback
  return { mode: pivot.mode, offset: { ...o }, anchor: a, point: P, stageOrigin: { x: P.x, y: 0, z: P.z } };
}

/** Stage-origin change between two resolutions; null counts as the origin. */
export function stageShift(a, b) {
  const sa = a ? a.stageOrigin : ZERO, sb = b ? b.stageOrigin : ZERO;
  return { x: sb.x - sa.x, z: sb.z - sa.z };
}
```

Frame translations: `stage: t = −stageOrigin = (−P.x, 0, −P.z)`; `export: t = −P`; when `resolution === null`, `t = (0, 0, 0)`.

### 6.3 `layoutProject(project, { frame = 'stage' } = {})`

```js
export function layoutProject(project, { frame = 'stage' } = {}) {
  const raw = computeWallLayout(project.wall.sections);                 // verbatim walk (layout frame); every postTransform is null
  const resolution = resolvePivot(raw, project.wall.pivot);             // generative quantities only (5.10 #1)
  const t = frame === 'layout' || !resolution ? ZERO
          : frame === 'export' ? { x: -resolution.point.x, y: -resolution.point.y, z: -resolution.point.z }
          : /* 'stage' */      { x: -resolution.stageOrigin.x, y: 0, z: -resolution.stageOrigin.z };
  const out = (t.x === 0 && t.y === 0 && t.z === 0) ? raw : raw.translated(t.x, t.y, t.z);   // identity: SAME object, bit-identical
  // spec 02 inserts applySectionOffsets(out) here: S_i is built from the TRANSLATED section frame (O_s, B, baseY),
  // det > 0 asserted (5.10 #2, spec 02 6.6; recorded as 07 C32)
  out.pivot = { resolution, frame, translation: t };
  return out;
}
```

Any other `frame` value throws `RangeError(`Unknown layout frame ${JSON.stringify(frame)}`)`. `t.x === 0` is also true for `−0`, so a −0 translation takes the identity path.

`WallController.rebuild({cause})` step 1 is given in 5.6: it caches `layout.pivot.resolution` and computes the `stageShift` of the `WALL_REBUILT` payload. `resolvePivotNow()` returns `resolvePivot(computeWallLayout(project.wall.sections), project.wall.pivot)`. `commitPivot(after)` is defined in 5.6.

### 6.4 `WallLayout.translated(dx, dy, dz)` (pure copy)

**Precondition: the raw walk.** If any `sl.postTransform !== null`, `translated()` throws `Error('translated() expects the raw walk: apply section offsets after the pivot translation')` (5.10 #2). There is no conjugation: the single composition rule is "translate, then build the section offsets" (spec 02 6.6).

For every `SectionLayout sl`, a new `SectionLayout` with the same `section`, `sectionIndex`, `sectionId`, `panelW`, `panelH`, `isFlat` and every other walk-produced field (spec 02's `detached`), plus:

```
edges  = sl.edges.map(e => ({ x: e.x + dx, z: e.z + dz, angle: e.angle }))
panels = sl.panels.map(p => ({ x: p.x + dx, y: p.y + dy, z: p.z + dz, rotY: p.rotY, col: p.col, row: p.row, sectionIndex: p.sectionIndex }))
baseY  = sl.baseY + dy
postTransform = null                       // guaranteed by the precondition; spec 02's applySectionOffsets writes it afterwards
// no lazily derived cache (frame, bounds) is copied; the copy recomputes them from its own data (5.10 #3)
```

`firstEdge`, `lastEdge`, `flatEdges()`, `bounds()`, `generativeBounds()` and `pivotPoint()` are then computed on the copy. Angles and `rotY` are unchanged, because a translation has no rotation. In the builder, `sectionGrid` computes `y = sl.baseY === 0 ? row * sl.panelH : sl.baseY + row * sl.panelH`. The identity branch is the verbatim legacy expression, so even `−0` bytes in a glTF are unchanged. `panelCorners` already uses `panel.y ± hh`.

### 6.5 Re-expression

The stage origin moves by ΔO = (O_new.x − O_old.x, 0, O_new.z − O_old.z), so every stage-frame point of the wall moves by −ΔO. Re-expression applies the same −ΔO to each `StageAnchored` participant: `posX −= ΔO.x; posZ −= ΔO.z`. Y and the rotations are untouched, because the stage floor and axes do not change. Distances between the camera, props and wall are therefore invariant. In particular `coverage` (6.6) is unchanged, because `posZ − wallZ` and `posX − minX` are both invariant.

**Participants and clamps (07 C45).** The participants are the camera, person and car (this spec), spec 05's HDRI point, spec 09's measurements and, from 07 I4b, the `OrbitController` (target and camera move together, so the wall stays still on screen once the legacy re-centre is gone). **Every `translateStage` clamps through its owner's `LIMITS`**, the writer bounds of 07 C22: ±100,000 m for every stage position (the HDRI point's x/z range is widened to match; its y is untouched). A pivot shift is at most a few kilometres (offset ±1000 m plus the wall extent), so re-expression never clamps in practice, and every value it writes is reachable (the validator never clamps it on reload). The writes are part of the pivot use case's single history entry (5.6).

Floating-point note: repeated mode toggles accumulate rounding of about 1e-16 m in poses. This is accepted. The difference is formed from the two resolved origins, not accumulated from deltas.

### 6.6 Framing

**Step A: `'flat-pivot'` (translation-correct flat bounds, identity-exact).**

```js
// js/geometry/WallLayout.js
function flatPivot(project, resolution) {                           // module-private; also read by the step-F case
  const b = project.wall.flatBounds();                              // LEGACY(B-L2, B-M10): flat shape
  const so = resolution ? resolution.stageOrigin : ZERO;
  return { totalWidth: b.totalWidth, maxHeight: b.maxHeight, minX: 0 - so.x, wallZ: 0 - so.z };
}
export function framingBounds(project, resolution = resolvePivot(computeWallLayout(project.wall.sections), project.wall.pivot)) {
  switch (Strategies.framingBounds) {
    case 'flat-pivot': return flatPivot(project, resolution);
    case 'layout': /* step F, below */
    default: throw unsupportedStrategy('framingBounds', Strategies.framingBounds);
  }
}
```

`0 − x` (not `−x`) yields `+0` at the identity. The flat wall is modelled as the rectangle x ∈ [minX, minX + totalWidth], y ∈ [0, maxHeight] in the plane z = wallZ. This is the legacy rectangle, translated into the stage frame.

| Consumer | New expression | Identity proof (minX = wallZ = +0) |
|---|---|---|
| `OrbitController.updateTargetPosition` | `target.set(b.minX + b.totalWidth / 2 + offset.x, b.maxHeight / 2 + offset.y, b.wallZ + offset.z)` | `(0 + w/2) + off.x`: `0 + a === a` for every a ≠ −0, and `w/2` is never −0, because `totalWidth` starts at 0 and adds products. z: `0 + off.z` differs from legacy only in the sign of zero, which `lookAt` and rendering cannot observe. |
| `CineCamera.resetTo` | `posX = b.minX + b.totalWidth / 2; posY = b.maxHeight / 2; posZ = b.wallZ + 5` | `0 + w/2 === w/2`; `0 + 5 === 5`. The input mirror writes `"5"`. |
| `CineCamera.coverage` | `distToWall = posZ - b.wallZ`; frame sizes from `distToWall`; `withinBounds = frameLeft >= b.minX && frameRight <= b.minX + totalWidth && frameBottom >= 0 && frameTop <= maxHeight`; returns `{frameWidth, frameHeight, status, safeDistance, distToWall}` | `posZ − 0 === posZ`; `>= 0` is unchanged; `0 + W === W` |
| `CineCamera.maxSafeDistance` | unchanged (sizes only) | – |
| `CameraController.setCameraField('posZ')` | ctx `{ wallZ: b.wallZ }` | the `ctx.wallZ === 0` branch is the legacy expression verbatim (4.1) |

The unit test (8.1) asserts `Object.is` equality of every consumer output between the Phase-1 `'flat'` expressions and `'flat-pivot'` at the identity pivot, over fuzzed walls.

**Step F: `'layout'` = the roadmap's P2-11c, exactly (true framing of the stage layout; fixes B-L2 for every pivot).**

Step F is not a second definition. It is roadmap §6.10's `'layout'` case with `FramingPolicy`'s three named boxes (08 P2-13g, 07 C34), the `resetTo(framing)` rule, the safe-distance rule and the camera Z rule (Q13), applied to `layoutProject(project)`. Because that layout is already in the stage frame, the result is pivot-aware with no pivot code. The only additions are the flat-pivot fields, kept for the readers that still need them, and the non-finite fallback. Each consumer names its box:
- `generativeBox` (`L.generativeBounds()`: attached sections, pre-offset): the automatic orbit re-target on every rebuild before 07 I4b, and this spec's `mesh-center` anchor (6.1);
- `wallBox` (`L.bounds()`: transformed, all sections including detached ones): `center` for `resetTo`, and 07's `F`/Reset/open/new/restore framing from I4b on;
- `stageExtent` (`worldVertices` of the sections whose LED normal has \|n.y\| ≤ 0.9): `width`, `height`, the safe distance D and `fits`.

On every harness wall (no offsets, no detached or horizontal sections) the three boxes coincide with the box of `worldVertices()`, so P2-11c's results are identical. The sketch below uses that single box; the roadmap's implementation reads the named boxes.

```js
case 'layout': {
  const L = layoutProject(project);                          // stage frame (spec 02: after applySectionOffsets)
  const flat = flatPivot(project, resolution);               // the 'flat-pivot' object above: coverage reads it until P2-11a,
                                                             // the posZ rule reads wallZ (4.1)
  const V = L.worldVertices();                               // roadmap §6.10: every grid corner, after postTransforms
  const box = boxOf(V);                                      // {min, max}; ±Infinity when V is empty
  const center = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 };
  const facing = chordNormal(L.firstEdge, L.lastEdge);       // normalize(−(l.z − f.z), 0, l.x − f.x); (0, 0, 1) if degenerate
  const width = L.extentAcross(facing);                      // max(v·chord) − min(v·chord), chord = (facing.z, 0, −facing.x)
  const height = box.max.y - box.min.y;
  if (!isFiniteVec(center) || !Number.isFinite(width) || !Number.isFinite(height)) return flatFraming(flat);
  return { ...flat, min: box.min, max: box.max, center, width, height, facing };
}
// flatFraming(f) = { ...f, min: {x: f.minX, y: 0, z: f.wallZ}, max: {x: f.minX + f.totalWidth, y: f.maxHeight, z: f.wallZ},
//                    center: {x: f.minX + f.totalWidth / 2, y: f.maxHeight / 2, z: f.wallZ},
//                    width: f.totalWidth, height: f.maxHeight, facing: {x: 0, y: 0, z: 1} }
```

- **Fallback.** It covers every wall without finite grid vertices, not only an empty section list. With negative or NaN counts the box is `{+Infinity, −Infinity}`, so `center` is NaN, and the orbit target would otherwise become NaN. On such a wall it gives the flat-pivot framing, which `resetTo` and the orbit handle exactly as in step A.
- **Width.** It is the rotation-invariant `extentAcross(facing)`, never the axis-aligned `max.x − min.x`. The axis-aligned width is 0 for a wall along Z and loses about 30 % at 45°. The same `width` and `height` feed the safe distance `D` and the analyser's `fits` (roadmap §6.10).
- **`worldVertices()` and `extentAcross(facing)`** are P2-11a's geometry methods; P2-11c (the roadmap) adds `stageExtent` (07 C34). They are pure and change no output by themselves.

Consumers (roadmap §6.10):
- the orbit target is `center + offset`;
- `resetTo(framing)` places the camera at `center + 5·facing` with `rotY = atan2(facing.x, facing.z)·180/π + 0` and `rotX = rotZ = 0`, so it looks at `center`;
- the safe distance is `D = min(width / (2·tx), height / (2·ty))`;
- the camera `posZ` rule loses its minimum (4.1), and the `#camera-pos-z` `min` attribute is removed (3.5);
- `coverage` and "Distance to wall plane" keep the flat-pivot fields until P2-11a replaces coverage with the analyser.

Worked example (the B-L2 wall: 10 × 500 mm at 18°, layout x ∈ [−0.50, 1.33], z ∈ [0, 3.16]; `wall-center` puts O at layout (−0.25, 0, 1.58)):

| | Orbit target x, z (stage) | Reset position x, z (stage) / pan | Width used for D | On the wall? |
|---|---|---|---|---|
| `'flat-pivot'` | x = −so.x + 2.5 = **2.75**, z = **−1.58** | (2.75, −1.58 + 5 = 3.42) / 0° | 5.00 (Σ arc) | No: the wall spans stage x ∈ [−0.25, 1.58] |
| `'layout'` (P2-11c) | x = **0.66**, z = **0.00** (box centre) | **(−4.27, −0.78)** / **−99.0°** (`center + 5·facing`, `facing` = (−0.988, 0, −0.156)) | **3.20** (`extentAcross`; the axis-aligned width would be 1.83) | Yes: the target is the box centre and the camera faces the concave front |

For centred pivots on monotonic walls (6 of the 7 harness configs), `center` in plan is the stage origin, so the view and the Reset aim point centre on the pivot the user just chose.

**One re-baseline.** Every existing scenario has the identity pivot, so step F's expected manifest is exactly the roadmap's P2-11c manifest, restricted to the scenarios that exist (8.4). If P2-11c has already landed, step F is empty and no re-baseline happens here.

### 6.7 Gizmo drag and snapping (relative; D9)

```
beginGizmoDrag:   pending = (0, 0, 0); target = offset
applyGizmoTranslate(movement, ctx):
  pending += movement                                   // stage (= layout) deltas from TransformGizmo, unsnapped
  s = ctx?.snap ? ctx.snap.pivotM : 0                   // Ctrl/⌘ held -> the "Ctrl-drag snap" step; else no snapping
  for k in x, y, z:
    d_k = s > 0 ? round_mm(Math.round(pending.k / s) * s) : round_mm(pending.k)   // the DRAGGED DISTANCE is snapped
    target.k = d_k === 0 ? offset.k : offset.k + d_k                              // untouched axis: offset.k, bit-identical
  preview = target − offset                             // marker glyph displacement in the stage frame
endGizmoDrag({cancel: false}): target equals offset ? no commit : commit setOffset(target)   // parseOffset: clamp ±1000, 1 mm
endGizmoDrag({cancel: true}):  no commit; preview = (0, 0, 0)
round_mm(v) = Math.round(v * 1000) / 1000 || 0
```

`movement` is the gizmo's incremental world vector, which is always parallel to `ctx.axisWorld`. The pivot does not need `axisWorld` itself: its stage deltas equal world deltas, and it has no rotation, so local and world space coincide.

- **Why relative.** Absolute grid snapping (`round((offset + pending) / s) · s` on every axis) would move an axis the user is not dragging: with `offset.y = 0.123` and an X drag at s = 0.1, the glyph would jump by −0.023 m in Y on the first move and commit `y = 0.1`. Relative snapping keeps every stored value the user typed and matches spec 02 6.6 ("offset from start + snapped acc").
- **Untouched axes stay exact.** The legacy translate drag produces `movement = axisDir · scalar`, so the non-dragged components of `pending` are ±0 and `d_k = 0`; `target.k` is then `offset.k` itself, and `parseOffset` is idempotent on it. Any noise below 0.5 mm (local space, rounding) also rounds to `d_k = 0`.
- **What you see is what you commit.** The commit uses the last previewed `target`, so releasing Ctrl just before mouse-up does not change the result.
- The gizmo's own `dragStart` keeps following the raw pointer. Snapping is applied only to the preview and the commit, so there is no drift.

### 6.8 Worked example (default wall: 5 × 3 panels of 500 mm, flat)

| Pivot | P (layout) | O | Wall in the stage frame (x range) | Combined OBJ first `v` line (export) | OBJ y range |
|---|---|---|---|---|---|
| bottom-left | (0, 0, 0) | (0, 0, 0) | [0, 2.5] | `v 0.000000 0.000000 0.000000` | [0, 1.5] |
| wall-center | (1.25, 0, 0) | (1.25, 0, 0) | [−1.25, 1.25] | `v -1.250000 0.000000 0.000000` | [0, 1.5] |
| mesh-center | (1.25, 0.75, 0) | (1.25, 0, 0) | [−1.25, 1.25] | `v -1.250000 -0.750000 0.000000` | [−0.75, 0.75] |
| wall-center + (0, 0, 2) | (1.25, 0, 2) | (1.25, 0, 2) | [−1.25, 1.25] at z = −2 | `v -1.250000 0.000000 -2.000000` | [0, 1.5] |

**Re-expression example.** Camera preview on, Reset, then Z Position set to 1.5. The pose is (1.25, 0.75, 1.5), with 35 mm full frame. The frame is 1.54 × 1.03 m, so the status is "Within bounds". The person is at (2, 0, 2) and the car at (4, 0, 3).

Switching bottom-left → wall-center with keep on gives ΔO = (1.25, 0):
- the camera moves to (0.00, 0.75, 1.5). `#camera-pos-x` shows `0.00`;
- the person moves to (0.75, 2) and the car to (2.75, 3);
- frame size, status ("Within bounds"), D and "Distance to wall plane" (1.50 m) are unchanged.

With keep off, the camera stays at (1.25, 0.75, 1.5), and the coverage recomputes against x ∈ [−1.25, 1.25]. Frame right edge 2.02 > 1.25 while the frame still fits, so the status becomes "Off-center". At the default Z of 5 m the 5.14 m frame exceeds the 2.5 m wall in both cases. (The default wall is flat, so these values are the same under `'flat-pivot'` and `'layout'`. After P2-11a the analyser reproduces them for this unrotated camera: roadmap §6.10, bit-compatibility.)

**Picking at the stage origin.** After this switch the camera stands at stage (0, 0.75, 1.5), directly in front of the marker at the stage origin (0, 0, 0) for an orbit view from the front, and the person stands at (0.75, 0, 2). Talent placed at (0, 0, 2), the natural "centre stage" spot, stands directly in front of the marker too. Under the 5.4 rule, a click on the camera body or on the person selects them, never the marker behind them (unit test 18).

**Anchors for the harness configurations** (legacy walk with `curveBeforeFirstPanel = true`, 4 dp; the unit-test oracle values):

| Config | bottom-left | wall-center | mesh-center | Layout bounds |
|---|---|---|---|---|
| default | 0, 0, 0 | 1.2500, 0, 0 | 1.2500, 0.7500, 0 | x [0, 2.5], y [0, 1.5], z [0, 0] |
| flat3 | 0, 0, 0 | 3.5000, 0, 0 | 3.5000, 0.7500, 0 | x [0, 7], z [0, 0] |
| concave_offsets | 0, 0, 0 | 2.5960, 0, 2.3397 | 2.5960, 1.0000, 2.3397 | x [0, 5.1919], y [0, 2], z [0, 4.6795] |
| convex | 0, 0, 0 | 1.8779, 0, −0.6102 | 1.8779, 1.0000, −0.6102 | x [0, 3.7557], z [−1.2203, 0] |
| mixed | 0, 0, 0 | 4.6976, 0, 0.9830 | 4.6976, 0.8438, 0.9830 | x [0, 9.3951], y [0, 1.6875], z [0, 1.9660] |
| box_corner | 0, 0, 0 | **0.0000**, 0, 1.5000 | **1.5000**, 0.7500, 1.5000 | x [0, 3], z [0, 3] |
| large_wall | 0, 0, 0 | 36.0745, 0, 13.1300 | 36.0745, 5.0000, 13.1300 | x [0, 72.149], y [0, 10], z [0, 26.2601] |

On monotonic walls the bounding-box x/z coincides with the chord midpoint, so `mesh-center` differs from `wall-center` only in y. `box_corner`, whose wall folds back to x = 0, shows the two modes diverging in plan. This is why Q2 asks the owner what "middle of wall mesh" was meant to be.

### 6.9 The curve-convention caveat (B-L1)

- **What is independent of B-L1:** `bottom-left` (`edges[0]` is placed before any curve step).
- **What depends on it:** `wall-center` and `mesh-center` depend on where the last edge and the box end up.
  - Example: 10 panels × 500 mm at 3° with no offset.
  - Legacy ("before the panel"): the chord runs from (0, 0) to (4.7401, 1.4041) at **16.5°** = (N+1)·c/2, and the wall centre is (2.3700, 0, 0.7020).
  - A "between panels" convention: **13.5°** = (N−1)·c/2, with the centre at (2.4035, 0, 0.5770).
- **Neither convention makes a curved wall's chord parallel to X**, because the walk starts with heading 0. "Middle of entire wall" is the chord midpoint, off the curved surface by the sagitta, and the exported wall is yawed by roughly half its total arc. That is why chord alignment is raised as Q7.
- **Exact migration, and its precondition.** Let a section with heading-in `H`, angle offset `a`, curve `c` and `N` panels be walked:
  - legacy: panel k (0-based) has heading `H + a + (k+1)·c`, and the section exits with heading `H + a + N·c`;
  - "between panels", **defined so that the exit heading is the heading of the last panel**: panel k has `H + a + k·c`, exit `H + a + (N−1)·c`.

  Migrating `a' = a + c` for every curved section gives panel k `H + a + (k+1)·c` and exit `H + a + N·c`: every panel heading and the exit heading equal legacy, so every following section starts identically and multi-section walls migrate exactly (up to float re-association, about 1e-15). If the B-L1 fix instead also adds `c` after the last panel (exit `H + a + N·c` before migration), the migrated exit becomes `H + a + (N+1)·c` and every following section gains an extra `c`: the migration is then **not** exact for multi-section walls. The B-L1 spec must therefore adopt the exit-heading definition above. Unit test 9 (8.1) checks it on `mixed` and on the 10 × 3° wall once the B-L1 branch exists.
- **Decision (08 Q10, 07 C6; decided 2026-10-16): the convention is kept** and documented in ARCHITECTURE §1.4, so no migration exists and saved pivots stay pivot-neutral. Feature 3 does **not** wait for B-L1's code (08 P2-13f): anchors are always recomputed from the current walk. If the convention is ever changed, that change adds 07 C6's top-level `curvature_convention` key (absent means the legacy convention) together with the exact migration above, so v2 files saved before it keep their pivots.

---

## 7. Export impact

### 7.1 OBJ / MTL

- **Frame.** Every `v` value is in the export frame, in all three mesh modes, because `ProjectIO` passes `wallController.layout({frame: 'export'})`.
  - Strips: the builder `y = baseY + row·panelH`.
  - Panel corners: from the translated `panel.{x, y, z}`.
  - `vt`, `vn`, faces and MTL are unchanged.
- **Header.** Only when `!pivot.isIdentity` and the resolution is non-null, after `# Mesh Mode: …\n` and before `brand.objGeneratorLine`:
  ```
  # Pivot: ${mode} anchor ${ax} ${ay} ${az} offset ${ox} ${oy} ${oz} (layout m); file origin = pivot
  # Stage placement: origin at stage (0 ${P.y} 0) (Y up, metres)
  ```
  All numbers are `toFixed(6)`. At identity, nothing is written, so the bytes are unchanged. Feature 6's header re-baseline may make the lines unconditional (Q10).
- **Safe-distance OBJ.** The band group's local `position` attributes are in the stage frame **of the pivot that was current when the group was built**, which may be stale (B-M8: the preview was turned off, then the pivot changed). `SafeDistanceView.create` therefore stamps `group.userData.stageOrigin = {x, z}` (layout frame), and `ProjectIO.exportSafeDistanceOBJ` passes
  ```
  translate = { x: sb.x − P.x, y: −P.y, z: sb.z − P.z }      // sb = group.userData.stageOrigin ?? {x: 0, z: 0}; P = current resolution point ?? 0
  ```
  so a stage point `s` is written as `s + sb − P`, the current export frame. `writeSafeDistance(group, {translate})` writes `(v + t_k).toFixed(6)` per axis iff `t_k !== 0` for that axis. For a fresh group, `sb = (P.x, P.z)`, so `translate = (0, −P.y, 0)` and the floor lines up with the wall export; at identity every component is 0 and the bytes are unchanged. This is relevant once B-M1 is fixed.

### 7.2 glTF

- **Frame.** POSITION values and their `min`/`max` are in the export frame (baked). **No node `translation`** is written, which matches OBJ (no transforms) and keeps one convention. The rejected alternative, a root node carrying `translation: −P`, would leave the vertices in the layout frame and give OBJ and glTF different semantics.
- **Metadata.** Only when `!pivot.isIdentity` and the resolution is non-null: `gltf.scenes[0].extras = { pivot: { mode, offset_m: [x, y, z], anchor_layout_m: [..], point_layout_m: [..] } }`, assigned after the nodes are pushed, so key order is `nodes`, `extras`. glTF 2.0 allows `extras` on a scene, and the Blender importer exposes them as custom properties.

### 7.3 JSON, ZIP, PNG

| Output | Change |
|---|---|
| JSON (v2) | The `pivot` block (4.2) is always written from T7 on (one revision bump, number assigned at merge, 07 C40), and camera and prop poses are in the stage frame. No earlier writer writes it (07 C39), so step A′ adds it to every exported project JSON. `display.show_pivot_marker` is added with the live value from step C on, which adds the key to every exported project JSON in step C. |
| ZIP | Its JSON entry follows the JSON rules (the same steps A′ and C), and its OBJ, MTL and glTF follow the rules above. Textures are unchanged. The harness compares archives by entry list and entry content, so a JSON entry change shows up both as the `*__export-zip__*.zip` output and as its extracted `*.zip.entries/**/*.json`. |
| Panel-ID PNG and ZIP textures | **unchanged**: UVs and canvases do not depend on the pivot |
| Viewport screenshots | unchanged at identity until steps C (marker on), D (grid) and F (true framing) |

---

## 8. Testing

### 8.1 Unit tests (`node --test "tests/unit/**/*.test.mjs"`)

**`tests/unit/pivot.test.mjs` (new)**

1. `pivotPoint` equals the table in 6.8 within 1e-4 for all seven configs and the three modes. In the layout frame the floor modes return `y` with `Object.is(y, 0)` (Phase 1 values unchanged). Unknown modes throw **`RangeError`**. An empty wall returns `null`.
2. `resolvePivot`:
   - offset arithmetic;
   - `stageOrigin.y === 0`;
   - a NaN panel width gives `null` in `wall-center` and a NaN panel height gives `null` in `mesh-center`, and both give a non-null resolution in `bottom-left` (corrected in T2: `generativeBounds()` skips NaN coordinates, so a NaN width alone leaves the mesh-centre box finite);
   - a wall whose sections have no grid vertices (negative counts) gives `null` in `mesh-center` (empty box);
   - an empty wall gives the anchor (0, 0, 0) plus the offset (non-null);
   - `stageShift(null, null)` is (0, 0) and `stageShift(a, b)` is `so(b) − so(a)`.
3. `layoutProject` at the identity pivot returns the **same object** as `computeWallLayout`, and `Object.is` holds on every number. It is also identity-exact for every fuzzed wall (strings, fractions, NaN ids) from `geometry.test.mjs`.
4. `translated(dx, dy, dz)`:
   - every edge, panel and `baseY` is shifted exactly, and spec 02's walk fields (`detached`, when present) are copied;
   - angles and `rotY` are unchanged;
   - `bounds()`, `generativeBounds()` and `pivotPoint(m)` of the copy equal the originals shifted by `(dx, dy, dz)`, **in all three modes**, including the floor modes, whose `y` follows `baseY` (6.1);
   - with **non-zero offsets** (for example (0.5, 1, 2) and (−3, 0.25, −1.5) on `default`, `concave_offsets` and `box_corner`), `pivotPoint(m)` of the **stage** layout equals `A − O = (−o.x, A.y, −o.z)`, and of the **export** layout `A − P = −o`, within 1e-12;
   - **the precondition:** a layout with a non-null stub `postTransform` makes `translated()` throw. A raw layout gives a copy whose `postTransform`s are all `null`. No cached derived value is copied: a stub lazy `frame` getter on the copy reads the translated edges.
5. Frames:
   - `export` positions = `stage` positions − (0, P.y, 0) for `sectionGrid` output and `panelCorners`, in all three modes;
   - with `mesh-center`, the default wall's combined grid y range is [−0.75, 0.75].
6. `framingBounds`:
   - `'flat-pivot'` at identity equals the legacy `'flat'` expressions (kept in the test as an oracle), over the fuzzed walls and a grid of camera poses and orbit offsets: `Object.is` for the orbit target x and y, the `resetTo` pose, every `coverage` output and the `posZ` rule; `===` for the orbit target z (only the sign of zero can differ, `0 + -0`, which is unobservable);
   - `'layout'` (step F; reuses the roadmap's P2-11c test vectors where P2-11c has landed): for the B-L2 wall with `wall-center`, `center` is (0.664, H/2, 0.000), `facing` is (−0.988, 0, −0.156), `width` is 3.196 (`extentAcross`, not the axis-aligned 1.828) and the Reset pose is (−4.274, H/2, −0.782) with pan −99.0°, all within 1e-3 (6.6). For the default and `flat3` walls, `width`, the orbit target and the Reset pose are `Object.is`-equal to the `'flat-pivot'` values. A wall with no finite grid vertices returns the flat-pivot framing (finite `center`, no NaN).
7. `WallPivot.parseOffset`: `'0'` → 0, `''` → null, `'abc'` → null, `'1e9'` → 1000, `-0.0004` → 0 (not −0), `1.23456` → 1.235, `NaN` → null; idempotent over a seeded grid. `setKeepStageLayout` rejects non-booleans. `setMode('middle')` throws `RangeError`.
8. Composition contract (5.10 #2; the shared equivariance test, which spec 02 reruns as its E17 with the real `offsetMatrix`). A stub section-offset builder derives its matrix from the section's own edges and `baseY`, like spec 02 6.5 (origin = chord midpoint at `baseY`, basis from the chord). It rotates the section 20° about that origin and translates it. For the stage and export translations `t` of several pivots: building the stub on `translated(t)` gives the same world vertices as building it on the raw walk and then applying `T(t)`, within 1e-12.
9. B-L1 migration (6.9), **skipped until the B-L1 "between panels" branch exists**: for `mixed` (multi-section, curved) and the 10 × 3° wall, the between-panels walk with `a' = a + c` reproduces every legacy panel position and heading and every section's exit heading within 1e-12.

**`tests/unit/pivot-controller.test.mjs` (new; spies, a real `Project` and `EventBus`)**

10. Mode change with keep on: the call order is `translateStage` (camera, person, car), then `WALL_PIVOT_CHANGED` (`rebuilds: true`), then `commitPivot` → `rebuild` ×1, then `SELECTABLE_MOVED`. The deltas equal −ΔO. A no-op change (same mode) emits nothing.
11. Keep off: no `translateStage`, and `rebuild` ×1.
12. Drag and snapping:
    - N `applyGizmoTranslate` calls give 0 rebuilds; `endGizmoDrag({cancel: false})` gives 1 commit; `endGizmoDrag({cancel: true})` gives 0 commits, an unchanged offset and a cleared preview;
    - `allowedAxes('translate')` is `{x: true, y: true, z: true}` and `allowedAxes('rotate')` is `null`, so `SELECTION_CHANGED.modes` is `['translate']`;
    - **off-grid untouched axis:** with `offset = (0, 0.123, 0)`, an X drag of 0.26 m with `ctx.snap = {pivotM: 0.1}` commits `x = 0.3` and `y` with `Object.is(y, 0.123)`; the preview never moves the glyph in Y;
    - without `ctx.snap`, the same drag commits `x = 0.26`; a drag of 0.0004 m commits nothing (`target` equals `offset`).
13. Y-only offset: `rebuild` ×0, `commitPivot` caches `after`, no `translateStage`, `WALL_PIVOT_CHANGED.rebuilds === false`.
14. A wall-centre pivot after `addSection()`: the stage layout's `wall-center` anchor is (0, 0, 0). The wall stays centred and the camera is untouched.
15. Null resolution (a NaN `panelWidth` in a section, before B-L8): `PivotMarkerView` places nothing, is hidden, `glyphPosition` returns finite values; `isPickable()` and `hasGizmoTarget()` are `false`; the `CameraPanel` mirror writes `min="0.1"`; a spy subscribed to `WALL_REBUILT` after them still runs (no throw).
16. `tests/unit/viewport-input.test.mjs` (new; fake `doc`, fake events): `O` calls `onPivotShortcut` once for a plain `o`/`O` keydown on the body; never for an INPUT, TEXTAREA, SELECT or `[contenteditable]` target, with `ctrlKey`, `metaKey` or `altKey`, with `repeat`, in pilot mode, or while `interaction.isDraggingGizmo`. Escape during a drag on a target **with** `endGizmoDrag` calls `gizmo.cancelDrag()` (which calls `endGizmoDrag({cancel: true})`) and neither `selection.deselect()` nor `gizmo.clearMode()`. Escape during a drag on a legacy target (no hook) runs the legacy deselect branch unchanged. While `interaction.gestureCancelled`, the router's `mousemove` calls neither `gizmo.onMouseMove` nor `gizmo.onHover`.
17. `PivotPanel` status (fake `doc` with stub elements; every case also delivers its payload a second time and asserts the same text, R3 idempotence):
    - `WALL_PIVOT_CHANGED{source: 'mode', stageShift ≠ 0}` then `WALL_REBUILT{cause: 'pivot'}` keeps the pivot summary;
    - `WALL_REBUILT{cause: 'edit', stageShift ≠ 0}` shows the wall-edit message; `WALL_REBUILT{cause: 'edit', stageShift: (0, 0)}` clears it;
    - `WALL_PIVOT_CHANGED{rebuilds: false}` (height text) followed by `WALL_REBUILT{cause: 'edit', stageShift ≠ 0}` shows the wall-edit message;
    - `WALL_REBUILT{cause: 'import'}` and `{cause: 'init'}` clear the status; `WALL_PIVOT_CHANGED{source: 'marker'}` leaves it unchanged;
    - the panel has no private fields other than its element references (a static check that the class declares no `#status*` or `#last*` field).
18. **Picking rule** (`tests/unit/selection.test.mjs`, fake meshes and hits, no THREE), 5.4:
    - the camera body hit at distance 3 and the pivot proxy hit at distance 4.5 on the same ray → the camera; the person at 4 and the pivot at 6 → the person (the 6.8 stage-origin layouts);
    - a section hit at 2 and the pivot at 4.5 → the pivot; a section hit at 2 and the camera at 4 (priority 0) → the section;
    - a section hit at 2, the HDRI point (`'hdri-point'`, kind `'projector'`, priority 9) at 3 and the pivot (10) at 5 → the pivot; two equal-priority hits behind the wall → the nearer;
    - with no section hits at all (before spec 02), every hit list gives the nearest hit (legacy);
    - `register` throws for a new id without `kind`.
19. **Gesture swallowing** (`tests/unit/gizmo.test.mjs`; a real `OrbitController` and `TransformGizmo` on a fake canvas that dispatches the listeners in legacy registration order: orbit first, then the router):
    - mousedown on a pivot handle at (100, 100), moves to (220, 100), then `cancelDrag()`, then moves to (260, 140): the orbit `theta`/`phi` and the camera position are unchanged (`Object.is`), and `gizmo.onHover` is never called;
    - a canvas `mouseup` clears `gestureCancelled`; a following plain drag of 40 px orbits by exactly 0.4 rad (legacy rate, so the guard did not leak);
    - with no cancel, `gestureCancelled` is never set, and a legacy camera-target drag produces the same orbit and target writes as before (identity);
    - a release on the window instead of the canvas (window `mouseup` → `onMouseUp`) also clears the flag.
20. **Gizmo re-anchor** (`gizmo.test.mjs` with a real `WallController` and `PivotController`, stub views): with the pivot selected in `mesh-center` on the default wall, `setSectionField(rows: 3 → 5)` rebuilds (`cause: 'edit'`), and the gizmo group's position y equals the new `P.y` (1.25) right after `WALL_REBUILT`, whatever the subscription order (the test registers a second `WALL_REBUILT` spy before and after the gizmo). An import that changes the anchor does the same. With a camera target selected, `WALL_REBUILT` leaves the gizmo position untouched.

**Amended existing tests**

- `core.test.mjs`: `Events.WALL_PIVOT_CHANGED` in the catalogue list, classified **visual** (07 C47).
- `geometry.test.mjs`: **the identity transform of `wallGroup` is an invariant** (07 C32): after every rebuild in every mode and pivot, `wallGroup.position`, `quaternion` and `scale` are the identity (no wall root transform, for any feature).
- `wall-controller.test.mjs`: rows `F3-1`..`F3-5`, the amended import row, and `commitPivot` (rebuild iff the stage origin moved, else cache). `WALL_REBUILT` carries `cause` (`'init'` at bootstrap, `'pivot'`, `'import'`, `'edit'` for every other row) and the `stageShift` against the previously cached resolution.
- `domain.test.mjs`: the `posZ` rule with `ctx.wallZ = 0` (and `−0`) is bit-identical to legacy over the seeded grid; with `ctx.wallZ = −2.3397`, `'0'` → 0, `''` → 2.660, `'-5'` → −2.24 (no float noise); `translateStage`. After step F: `'-5'` → −5 and `''` → 2.660 at `wallZ = −2.3397`, and the `wallZ = 0` branch equals P2-11c's `finiteOr(v, 5)`. `CameraPanel`'s `min` helper: `wallZ = −2.3397` → `"-2.3"`, `wallZ = −2` → `"-1.9"`, `wallZ = 2` → `"2.1"`, `wallZ = 0` → `"0.1"`.
- `io.test.mjs`:
  - at the identity pivot, OBJ, glTF and safe-distance OBJ stay **byte-identical** to the golden files;
  - with a non-identity pivot, the conditional header and `extras`, and the export-frame values (the default wall table in 6.8);
  - safe-distance `translate`: a group stamped with an old stage origin is written in the current export frame;
  - v2 serializer round-trip, validator rules (4.3) and v1 migration (4.4);
  - `resolved_m` for an empty wall is the non-null empty-wall resolution, and `null` only for a non-finite layout;
  - `display.show_pivot_marker`: before step C the key is neither written by T7 nor read (a file with `true` leaves `showPivotMarker === false`); from step C, a missing key reads as `DisplaySettings.DEFAULT_SHOW_PIVOT_MARKER` (`true`) and the live value is written.
- `camera-hub.test.mjs`: the coverage payload carries `distToWall`.
- `gizmo.test.mjs` (or the existing interaction test; the shared hook-set tests that spec 02 reuses): `beginGizmoDrag` on a hit; `ctx = {space, axisWorld, snap}` with `snap` iff Ctrl/⌘ and `axisWorld` a unit vector parallel to every `movement`; `endGizmoDrag({cancel: false})` once across two mouse-ups; `cancelDrag()` returns `false` and changes nothing for a target without `endGizmoDrag`; with the hook, `cancelDrag()` calls `endGizmoDrag({cancel: true})`, sets `gestureCancelled`, and the following mouse-up commits nothing; `detach` during a drag cancels it; no handles at all in a mode where `allowedAxes(mode)` is `null`; no handle for an axis that `allowedAxes(mode)` sets to `false`; `setSnapIncrements({pivotM: 0.5})` keeps `translateMm` and `rotateDeg`; `pivotMarker.updateScale` and `gizmo.updateScale` are registered through `addPreRender` and run once per rendered frame (07 C46).

### 8.2 Static checks (`tests/static/check.mjs`)

- DOM-id ownership:
  - `PivotPanel` owns the ids listed in 5.3;
  - `CameraPanel` adds `#camera-wall-distance`.
- **Class collision:** no element in `index.html` carries both a `pivot-*` and a `mesh-mode-*` class, and no `.pivot-*` element has a `data-mode` attribute (2.2).
- **Focusable radios:** `css/features/pivot.css` sets `display` to a value other than `none` on `.pivot-mode-option input`, and no stylesheet has a `display: none` rule whose selector matches `.pivot-mode-option input`.
- Layering:
  - `PivotController` (app) imports only `core`, `domain` and `geometry`;
  - `PivotMarkerView` (render) imports `vendor/three.js`, `core`, `geometry` (for the typedef only), `render/ResourceTracker.js` and `render/SceneManager.js` (`LAYERS` only; T5);
  - `PivotPanel` imports `core`, `legacy`, `domain` and `ui/dom.js`.
- Every new event is emitted and subscribed (`WALL_PIVOT_CHANGED` is in the `Events` catalogue).
- Domain-field writers: `Wall.pivot` and `WallPivot` fields only through the listed writers (`WallPivot` methods called from `PivotController`, and `WallController.applyImport`).
- State writers: `interaction.gestureCancelled` and `interaction.isDraggingGizmo` are assigned only in `js/interaction/TransformGizmo.js`; `interaction.snap` is written only through `setSnapIncrements`.
- Help badge: the `.info-badge` text in `index.html` is unchanged by this feature's commits (07 C35: per-feature tokens are frozen, and only 07 I4a rewrites the badge).
- No inline styles in the new markup: no element inside `#pivot-section`, and not the `#camera-wall-distance` row, carries a `style` attribute.
- Render order: no numeric `renderOrder` literal ≥ 900 in this feature's files (spec 01's rule; `RENDER_ORDER.PIVOT_MARKER` only).
- `css-slices.mjs` is 07 S7's report-only check scoped to `01-12`, so `css/features/` is never scanned.

### 8.3 Harness scenarios (`tests/regression/scenarios-features.mjs`, registered in `scenarios.mjs`)

These scenarios drive the DOM only. New ids are added to the README contract (`pivot-mode-select`, `pivot-offset-x/y/z`, `pivot-reset-offset`, `pivot-select`, `pivot-snap`, `toggle-pivot-keep-stage`, `toggle-pivot-marker`, `pivot-readout`, `pivot-status`, `camera-wall-distance`).

**Harness library changes (part of T8).**
- `lib/app.mjs` `KEYS` gains `o` (`KeyO`, 79), `Tab` (9) and `ArrowDown` (40).
- `AppPage.keyPress(key, { modifiers = 0, repeat = false } = {})`: CDP `modifiers` bitmask (Alt 1, Ctrl 2, Meta 4, Shift 8) and `autoRepeat`. The defaults reproduce today's events exactly.
- The `drag` helper moves from `scenarios-extra.mjs` into `AppPage.drag(x, y, dx, dy, steps, { modifiers = 0, beforeRelease = null } = {})`; `beforeRelease` runs after the last move and before `mouseReleased` (used to press Escape mid-drag); `modifiers` is sent on every mouse event (Ctrl-drag snapping). `scenarios-extra.mjs` calls the moved helper with the defaults.
- Per the README, a `lib/` change requires re-capturing both baselines. These changes are additive with identical defaults, so the re-capture must compare identical: that compare is part of T8's proof.
- **Not in the harness:** the `O` modifier, repeat, pilot and drag guards (unit test 16: a CDP Ctrl+O on the body could open the browser's file dialog), the marker's world position (unit test via `glyphPosition`), rebuild counts (unit tests 10-13) and pick ordering with spec 02's wall hits (unit test 18). These acceptance criteria are marked "unit" in section 9.
- **Locating the pivot's X arrow.** At the identity pivot, a red-pixel search would be ambiguous: the AxesHelper's red X line and the marker's white cross arm lie on the gizmo's X arrow, along the wall's bottom edge, over wall colours on which `isGizmoRed` is not calibrated. Nothing is exposed on `window` for a JS projection (R9). `pivot_gizmo` therefore first types Offset Z `2` (the stage origin, and with it the gizmo, moves 2 m in front of the wall start plane, over empty floor), then clicks `#view-top`. It then uses the WP1 technique of `gizmo_drag`: `parkMouse`, then `locate(app, isGizmoRed, {pick: 'maxX'})`. `maxX` is the arrow tip, beyond the 0.5 m AxesHelper and the marker cross, over the dark floor, as in spec 02's `section_gizmo`. If no pixel is found, the step records `{skipped: true}` (WP1 convention), and a missing drag output FAILs the comparison.

| Scenario | Steps | Outputs |
|---|---|---|
| `pivot_modes` | For `default`, `concave_offsets`, `mixed`, `box_corner` (imported as v1): click each mode radio, then set offset (0.5, 1, 2). Per state: read `#pivot-readout`, export OBJ (combined) and glTF (section), screenshot. For `mixed`, also all three mesh modes for `wall-center` and `mesh-center`. Ends with Export JSON (v2). Also records `pageMeshModes()` once, which must be unaffected by the pivot cards. | about 70 |
| `pivot_stage` | Camera preview on, person and car on. Switch `bottom-left` → `wall-center` → `mesh-center` with keep on, then repeat with keep off. Per step record camera pos/rot inputs, prop inputs, `#frustum-*`, `#safe-distance`, `#camera-wall-distance`, `#pivot-status`, and a screenshot. Then, in `wall-center`, add a section and record the same plus `#pivot-status` (wall-edit message). Then set offset z = 2, type `0` into `#camera-pos-z` and record its value (`0`) and `min`: `-1.9` before step F, and no `min` attribute after step F (8.4 order: E is captured after F, so the golden records the post-F state). | about 36 |
| `pivot_gizmo` | Type Offset Z `2`, click `#view-top`, press `o`. Record the badge and the translate button state. **Drag:** locate the X arrow (see above) and drag it by 120 px (`AppPage.drag`); record the offsets and the screenshot, then export OBJ. **Snap:** type Offset Y `0.123`, Ctrl-drag the X arrow (`modifiers: 2`); record the offsets (X moved by a multiple of 0.1 m, Y still `0.123`). **Cancel with moves:** `parkMouse`, take screenshot `cancel_before`, then drag the X arrow by 120 px with `beforeRelease: async () => { press Escape; mouseMoved +80 px, −40 px (two moves, button held); }`. Record the offsets (unchanged) and the badge (still "Selected: Pivot"). Then `parkMouse` (the same park point) and take screenshot `cancel_after`. A post-check script compares `cancel_after` with `cancel_before` using the harness screenshot rule. IDENTICAL, or a WARN from the documented overlay-glyph jitter, passes; a FAIL means an orbit jump or a leftover hover (a 1.2 rad orbit changes far more than 0.5 % of the pixels). The forward golden records both screenshots. Press Escape again: deselected. **Rotate:** press `o`, then `r`: badge "Selected: Pivot (translate only)" and screenshot (no rings). **Focus:** `radio.focus()` on the checked pivot radio, record `document.activeElement.name`, press `ArrowDown`, record the checked value and `#pivot-readout`. | about 18 |
| `pivot_roundtrip` | Set `wall-center` + (0, 0, 2). Export JSON, re-import it, export OBJ, glTF and JSON again: identical to the first export. | about 8 |
| `pivot_validation` | Import v2 files with `mode: "middle"`, `offset_m: {x: "abc", y: 5000, z: -0.0004}` and `keep_stage_layout: "yes"`. Record the panel state (bottom-left, 0 / 1000 / 0, keep on), `dialogs.json` and the console. Then type `abc`, empty, `2000`, `0.0004` and `0` into Offset X, recording the input value after each. | about 9 |

These baselines are **forward goldens**, captured from the feature build once its acceptance criteria are checked by hand. They cannot come from the pristine original.

### 8.4 Golden outputs and re-baseline steps (each step is its own commit and its own harness run)

**Procedure for steps that change existing outputs (A′, B, C, D, F).** Run the **full** harness (no `--only`) on the candidate and compare it with the current baseline. Every FAIL must be of the kinds the step allows (column "Allowed changes"). Then promote the whole candidate capture as the new baseline: since every other output compared identical, this is equivalent to re-baselining only the allowed kinds. The list of affected outputs is whatever the compare report lists; the names in the table are expectations, not the scope. Any FAIL of a disallowed kind (for example an OBJ diff in a screenshot-only step) is a regression to investigate, not to re-baseline.

| Step | Task(s) | Change | Allowed changes | Expected (non-exhaustive) | Re-baseline |
|---|---|---|---|---|---|
| **A** | T1-T5 | Domain, geometry, consumers, controller, marker plumbing (`showPivotMarker = false`, allocated last), `framingBounds = 'flat-pivot'`, export frame, shared gizmo hooks | **none** | Zero FAIL, zero WARN beyond the documented `keyboard` jitters. The identity pivot makes L = S = E. | none. This step *proves* D8. |
| **A′** | T7 | The v2 serializer writes the `pivot` block (and reads it), with one revision bump assigned at merge (07 C40). `display.show_pivot_marker` is **not** touched before step C (4.2). | exported project JSON (`**/*__export-json__*.json`), the ZIP archives (`**/*__export-zip__*.zip`) and their extracted JSON entries (`**/*.zip.entries/**/*.json`), in each case only by the `pivot` key and the `version` minor | every scenario's Export JSON, and the JSON inside every ZIP, gains `pivot` with the constant identity block (4.2). No earlier writer writes it (07 C39; 08 P2-13e's manifest contains neither key). | full run, promote |
| **B** | T6 | `PivotPanel` markup and CSS, the camera label "Z Position (m)" (unless P2-11c already changed it), the "Distance to wall plane" row. **No help-badge change** (3.4: no token, 07 C35). | `ui_visual` style, text and sidebar screenshots | states 00, 04, 06, 07, 08 and `narrow_800`. Every canvas screenshot in every scenario must stay identical: nothing inside `#three-canvas`'s clip changes, so a viewport FAIL is a regression. `import_edge` state (`pageMeshModes`) and the `camera` scenario must stay identical (no new recorded ids; the pivot cards are not `.mesh-mode-option`). **As run (T6):** 08 P2-13's `p2_project_v2/toggle_aria_*.json` (a page-wide probe of every `.toggle`, which landed after this table was written) also gains the panel's two switches; nothing else in it changes. | full run (proves the rest identical), then promote; equivalent to `--only ui_visual` when nothing else FAILs |
| **C** | T9 (after B-M11 is fixed: P2-10a **or** spec 07 R1) | `DisplaySettings.DEFAULT_SHOW_PIVOT_MARKER = true`, with the `active` class and `aria-checked="true"` of `#toggle-pivot-marker`; the v2 reader and writer start handling `display.show_pivot_marker` (4.2) | viewport (`#three-canvas`) screenshots; `ui_visual` toggle class/knob; exported project JSON, ZIP archives and their extracted JSON entries, **only** by the `display.show_pivot_marker` key | Screenshots: every scenario that takes a viewport screenshot: `default`, the six configs, `toggles`, `keyboard`, `camera`, and the WP1 extras (`gizmo_drag`, `pilot_look`, `preview_off_in_pilot`, `logos`, `name_with_panel_ids`, `preview_resize`, `import_edge`), plus any feature scenarios already captured. JSON: every Export JSON and ZIP JSON entry gains the key with `true` (no earlier writer writes it, 07 C39). The camera preview canvas is unchanged, because the B-M11 fix keeps helpers out of it. If the owner overrides Q9 and C runs before that fix, preview screenshots may change too. | full run, promote |
| **D** | T10 (Q8) | Grid per Q8 (recommended `GridHelper(100, 100)` centred on the stage origin) | viewport screenshots (and preview screenshots, which show the grid) | the same scenario set as C | full run, promote |
| **F** | none here: the roadmap's P2-11c commit (with `FramingPolicy`'s named boxes; empty if P2-11c has landed) | `framingBounds = 'layout'` as P2-11c defines it (B-L2), the camera Z minimum removed (B-L10 Z half, roadmap Q13) | exactly the roadmap's P2-11c manifest kinds: viewport and preview screenshots on curved and angled walls; `camera` state values after Reset; safe-distance D and OBJ where width-limited; the camera Z input value, `min` attribute and label | **The roadmap's P2-11c manifest, restricted to scenarios that exist:** `{concave_offsets, convex, mixed, box_corner, large_wall}/panel_ids_combined.screenshot.png`, `p2_mixed_content/*.screenshot.png`, `p2_curved_safe_distance/*.screenshot.png`, `p2_curved_safe_distance/*concave30*.obj` (D 2.92 → 1.88 m), `p2_zero_inputs/*` (camera Z 0); `mayChange`: `ui_visual/*.text.json`, `ui_visual/*.styles.json`. `flat3`/`default`-based outputs must stay identical. Every existing scenario has the identity pivot, so this is the same re-baseline P2-11c would make alone: **one** re-baseline, never two. | full run, promote |
| **E** | T8 | Add the scenarios of 8.3 (and the harness-lib changes, whose baseline re-capture must be identical) | new outputs only | – | capture the new scenarios |

**Order.** The recommended order is A → B → C → D → F → E, with A′ whenever the v2 writer exists. Every re-baseline of existing outputs then happens before the forward goldens are captured, so E is captured once on the final behaviour. Because C, D and F use the full-run procedure, a different order still works (for example, C waiting for the B-M11 fix until after E): the later step simply re-baselines the pivot scenarios' outputs too. In that case the allowed kinds of the later step include the pivot scenarios' screenshots and JSON of the same kinds.

**Budget.** Steps A (zero-diff proof), A′, B, C and D are five full-harness runs, each followed by a review of the compare report (step F's run belongs to 08's P2-11c commit). E adds a capture and the identical-baseline proof of the `lib/` change. Task T16 (section 10) budgets these runs explicitly.

---

## 9. Acceptance criteria

Each criterion names how it is checked: (harness), (unit), (static) or (manual).

1. With the default pivot, after step A, `node tests/regression/compare.mjs <baseline> <candidate>` exits 0, and every OBJ, MTL, glTF, JSON, PNG and screenshot output is identical. (harness)
2. `layoutProject(project)` with the identity pivot returns the object produced by `computeWallLayout`: the unit test asserts `===`. (unit)
3. For the default wall:
   - `wall-center` makes the combined OBJ's first vertex line `v -1.250000 0.000000 0.000000`; (harness)
   - `mesh-center` makes it `v -1.250000 -0.750000 0.000000`, with every OBJ `v` y in [−0.75, 0.75]; (harness)
   - in both modes the viewport wall stands on the floor (stage `baseY = 0`) and `glyphPosition` is (0, 0.75, 0) for `mesh-center`. (unit)
4. The anchor values of table 6.8 are reproduced within 1e-4 for every harness configuration and mode. (unit)
5. Set up the default wall with camera preview on, Reset, Z Position 1.5, person and car on, and keep on. Switching `bottom-left` → `wall-center` then: (harness)
   - sets `#camera-pos-x` to `0.00`, person pos-x to `0.75` and car pos-x to `2.75`;
   - leaves `#frustum-width`, `#frustum-height`, `#frustum-status-text` ("Within bounds"), `#safe-distance` and `#camera-wall-distance` (`1.50m`) unchanged.
6. With keep off, the same switch leaves every camera and prop input unchanged and changes `#frustum-status-text` from "Within bounds" to "Off-center". (harness)
7. Changing only Offset Y triggers **no** wall rebuild (spy count unchanged) and moves only the marker (unit). It changes every OBJ and glTF y value by −Δy:
   - OBJ: `|y_new − (y_old − Δy)| ≤ 1e-6`, the printed precision: two `toFixed(6)` roundings of at most 5e-7 each (harness);
   - glTF, exactly: every POSITION y equals `Math.fround(baseY + row·panelH)` of the export layout, with `baseY = −P.y` (unit);
   - glTF, against the previous export: `|y_new − (y_old − Δy)| ≤ 2^-22 · max(1, |y_old|, |Δy|)`. Each float32 rounding contributes at most `2^-24·|value|`, and `|y_new| ≤ |y_old| + |Δy|`, so the two roundings can reach `1.5 · 2^-23 · max`; `2^-22` covers that (harness post-check);
   - layout float64 values within 1e-9 m (unit);
   - x and z are unchanged.
8. Typing `abc` or clearing an offset reverts to the stored value. `2000` stores and shows `1000.000`. `0.0004` stores `0`. `0` is accepted (no B-L9 fallback). (harness)
9. `O` selects the pivot (badge "Selected: Pivot"), activates translate mode if it was off or rotate, and pressing it again deselects (harness). `O` does nothing when focus is in an INPUT, SELECT, TEXTAREA or `[contenteditable]`, when Ctrl, Meta or Alt is held, on auto-repeat, in pilot mode, or during a gizmo drag (unit).
10. Dragging a pivot axis handle causes 0 wall rebuilds during the drag and exactly 1 on release (unit). Without Ctrl/⌘ the committed offset is the stored offset plus the dragged distance rounded to 1 mm; with Ctrl/⌘ held, plus the dragged distance rounded to the "Ctrl-drag snap" step (10 cm by default). Axes that were not dragged keep their stored value bit-for-bit, including off-grid values such as 0.123 (unit + harness). Escape during the drag leaves the offset unchanged and the pivot selected. Moving the mouse after Escape and before the release neither orbits the view nor highlights a gizmo handle: the `cancel_after` screenshot matches `cancel_before` (unit test 19 + harness). A second Escape deselects (harness). On a legacy camera or prop target, Escape mid-drag behaves exactly as in legacy (unit).
11. In rotate mode with the pivot selected, no gizmo handles are drawn and the badge reads "Selected: Pivot (translate only)". (harness)
12. The marker is visible through the wall (`depthTest: false`, `RENDER_ORDER.PIVOT_MARKER` 996), and its cross is never shorter than 24 px per arm on screen (unit for the scale, manual for the look). It stays pickable through a wall hit in front of it (`pickPriority`, with spec 02). The camera body, the person, the car and spec 05's HDRI point are picked before it whenever they are nearer: priority counts only against wall hits (unit test 18). It is never present in any exported file (unit). Once B-M11 is fixed (P2-10a, or 07 R1), it is absent from the camera preview, and its pick proxy (on `HELPERS`) is hidden and unpickable in pilot (manual).
13. With a `wall-center` pivot, adding a section keeps the wall's chord midpoint at the stage origin, no camera or prop input changes, and `#pivot-status` reports the stage-origin shift relative to the wall start. (unit + harness)
14. JSON v2 export → import → export reproduces the pivot block, the panel state, and byte-identical OBJ and glTF. Importing any v1 file sets the pivot to bottom-left / (0, 0, 0) without moving the camera. (harness)
15. A v2 file with an invalid pivot (8.3 `pivot_validation`) loads with mode `bottom-left`, offset (0, 1000, 0) and keep on, with validator warnings and no console error. (harness)
16. The non-identity OBJ header lines and glTF `scenes[0].extras.pivot` are present iff `!pivot.isIdentity` (and the resolution is non-null). (unit)
17. The safe-distance OBJ (once B-M1 is fixed), exported with `mesh-center`, has floor vertices at `y = 0.005 − P.y` (to 6 dp). A group built under an earlier pivot (preview turned off, then the pivot changed) is written in the current export frame. (unit)
18. The pivot panel's radios are reachable and operable by keyboard: the checked radio takes focus and `ArrowDown` changes the mode (harness); Tab order reaches them (manual); no CSS hides them (static). Both new toggles have `role="switch"`, reflect `aria-checked`, and toggle on Space and Enter (harness for the attribute, manual for the keys).
19. **Before step F:** with a pivot whose stage origin is off the wall plane (default wall, `wall-center` + offset (0, 0, 2), `wallZ = −2`), typing `0` in Z Position stores and shows `0`, typing `-5` stores `−1.9`, and the `min` attribute is `-1.9`. For `concave_offsets` with `wall-center` (`wallZ = −2.3397`), the attribute is `-2.3` (on the 0.1 grid, so a typed `0` is not `:invalid`), and `-5` stores `−2.24`. At the identity pivot the field behaves exactly as legacy (`0` → `5`, `min="0.1"`) (unit + harness). **After step F:** any finite value is stored, there is no `min` attribute, and a non-numeric entry gives `wallZ + 5` (unit).
20. With a non-finite layout (`resolution === null`, possible before B-L8), no exception is thrown, the marker is hidden and not pickable, the readout says `Pivot unavailable · invalid section values`, `#camera-pos-z` keeps `min="0.1"`, the JSON writes `resolved_m: null`, and exports are the untranslated layout without pivot metadata. For an empty wall, `resolved_m` holds the anchor (0, 0, 0) plus the offset. (unit)
21. After step F (the roadmap's P2-11c), for the 10 × 500 mm wall at 18° with a `wall-center` pivot:
    - the orbit target lies at the stage-layout box centre in plan (x ≈ 0.66, z ≈ 0.00), not at (2.75, −1.58);
    - Reset puts the camera at `center + 5·facing` ≈ (−4.27, H/2, −0.78) with pan ≈ −99.0°, aimed at that centre;
    - the width used for D is `extentAcross(facing)` ≈ 3.20 m.

    For flat walls these values are unchanged. A wall without finite grid vertices falls back to the flat-pivot framing, with no NaN target. Step F re-baselines exactly the roadmap's P2-11c manifest, once. (unit + harness via the step-F manifest)
22. `node tests/static/check.mjs` and `node --test "tests/unit/**/*.test.mjs"` pass, including the tests of 8.1 and 8.2. (static + unit)
23. With the pivot selected, a section edit or an import that changes the anchor (for example, more rows in `mesh-center`) moves the gizmo onto the marker in the same frame, without any other input. (unit test 20)
24. The `PivotPanel` status is a pure function of the mirrored event payloads: delivering any `WALL_PIVOT_CHANGED` or `WALL_REBUILT` payload twice gives the same text, and the panel keeps no event history. (unit test 17)
25. This spec does not change the `.info-badge` text and adds no token to it (07 C35). No viewport screenshot changes in step B. (static + harness)
26. Exported JSON and ZIP JSON change only in the steps that allow them (A′: the `pivot` key; C: `display.show_pivot_marker`). Before step C, a v2 file with `display.show_pivot_marker: true` does not turn the marker on (the key is `dropped-unknown`). (harness + unit)
27. After 07 I4b, a "Keep stage layout" mode change leaves the wall at the same screen position (the orbit is re-expressed with the camera and props), every re-expressed position stays within its `LIMITS`, and the change is one history entry (07 C45, C59). (unit + manual)
28. The identity transform of `wallGroup` holds after every rebuild (07 C32). (unit)

---

## 10. Task breakdown

Effort scale: S ≤ 0.5 d, M 1-2 d, L 3-5 d, XL > 5 d.

| # | Task | Effort | Depends on |
|---|---|---|---|
| T1 | Domain: the `WallPivot` API and rules (`setKeepStageLayout`, `RangeError`), `PIVOT_MODES`; `DisplaySettings.showPivotMarker` and `DEFAULT_SHOW_PIVOT_MARKER` (false); `CineCamera.translateStage`, the `posZ` rule context and pivot-aware branch, `resetTo`/`coverage` with `minX`/`wallZ`; `Prop.translateStage`; `SceneTheme.pivot`; `Events.WALL_PIVOT_CHANGED`; unit tests. **As built (one commit per task, each identity-exact):** T1 also adds `CineCamera.LIMITS` and `Prop.LIMITS` with the ±100,000 m writer bounds of 07 C22 (`domain/rules.js` `STAGE_POSITION_LIMIT_M`; `posZ.min` is −100,000, because the Z input's minimum is its rule's, not a bound), since 08 P2-13e, which was to add them, waits for M7a; `SceneTheme.pivot` lands with its tokens, `COLOR_BINDINGS` rows and U5 rows (06 5.12). Two items move: `resetTo`/`coverage` reading `minX`/`wallZ` go to T3, because the `'flat-pivot'` bounds that carry those fields arrive in T2 (a consumer reading them first would get `undefined`); `Events.WALL_PIVOT_CHANGED` lands with its first emitter and subscriber, because static rule 7 rejects a catalogue key that nothing emits or subscribes. | M (1 d) | Phase 1 merged |
| T2 | Geometry: `baseY`, `generativeBounds()`, `bounds()` with `baseY`, the `pivotPoint` y policy (floor modes at `sections[0].baseY`) and `RangeError`, `translated()` with its raw-walk precondition, `resolvePivot`, `stageShift`, `layoutProject({frame})` with spec 02's insertion point, `framingBounds` `'flat-pivot'` + Strategies flip, the builder `baseY` branch; tests 1-9. **As built:** tests 1-6 and 8 are `tests/unit/pivot.test.mjs` (test 6's consumer part lands with T3, which switches the consumers), test 3's fuzzed identity part is in `geometry.test.mjs` next to the fuzzer, test 9 is skipped (B-L1 kept); until T3 wires `WallController`'s cache, `framingBounds` resolves the live pivot through its default argument. | M (1.5 d) | T1 |
| T3 | Consumers: `OrbitController` target, `CameraHub` coverage payload, `CameraController.setCameraField` ctx and `translateStage`, `PropController.translateStage`; the `WallController` cache, `layout(opts)`, `rebuild({cause})` and the `WALL_REBUILT` `cause`/`stageShift` fields, `resolvePivotNow`, `commitPivot`; `SafeDistanceView` stamp; `ProjectIO` export frame and safe-distance `translate`; `ObjExporter` header + `writeSafeDistance(translate)`; `GltfExporter` extras; io and wall-controller tests. **As built:** T3 also lands T1's `resetTo`/`coverage` on `minX`/`wallZ` (with `distToWall` in the coverage result), App's cached `frameBounds` and the bootstrap `rebuild({cause: 'init'})` (5.8), and the session-only half of T7's `applyImport` step: the pivot assignment (the identity for every file until project file v2, 4.4) and `cause: 'import'`; its `WALL_PIVOT_CHANGED{import}` emission lands with the event key (T1 row). `writeSafeDistance` is `(group, band, {translate})`, because 08 P2-5b added `band` second. The two pivot header lines follow 01 CR-3's orientation line and precede the generator line (7.1). Static rule 10 counts `pivot` as a domain field with `WallController` its one writer outside the domain (the field half of 8.2). | M (1.5 d) | T2 |
| T4 | `PivotController` (P-PIVOT, `StageAnchored` with clamped `translateStage`, the path-B Selectable hooks, relative snapping, cache-based `gizmoAnchor`), the events of 5.5, rebuild-policy rows `F3-1`..`F3-5`; `pivot-controller.test.mjs` tests 10-15. **As built:** T4 lands `Events.WALL_PIVOT_CHANGED` with its emitters (`PivotController`, `WallController.applyImport`) and, because static rule 7 needs a subscriber in the same commit, `CameraPanel`'s `#camera-pos-z` `min` mirror and the exported `cameraZMinAttribute` helper (moved here from T6); the `'pivot'` pose mirrors of `CameraPanel` and `PropControls` (5.5's subscribers of the pose events P-PIVOT emits) move here from T6 too. `PivotController` is wired into `App` by T5, with the marker it needs (5.8), so T4 changes no output; test 15's `PivotMarkerView` part lands with T5. Static rule 10 counts `showPivotMarker` as a domain field with `PivotController` its one writer. | M (1.5 d) | T3 |
| T5 | `PivotMarkerView` (incl. `updateScale` with `degToRad` registered through `addPreRender`, the pick proxy on `HELPERS`, `RENDER_ORDER.PIVOT_MARKER`, 06's two-tone colours, null handling) + bootstrap init-last. The path-B hook set of 5.4 (07 C33): required `kind`, `allowedAxes(mode)` with `null`, `orientGizmo(rotation, mode)`, `beginGizmoDrag`, `endGizmoDrag({cancel})`/`cancelDrag`, the `detach` cancel, `ctx = {space, axisWorld, snap}`, `setSnapIncrements` (merge), `InteractionState.snap`. Gesture swallowing (`gestureCancelled` in `TransformGizmo`, `OrbitController` and the router). The `WALL_REBUILT` re-anchor. `SelectionManager.pickAt` (priority against wall hits only) and the `modes` payload. `ViewportInput` `O` and Escape order. Unit tests 16, 18-20 and the gizmo tests. **As built:** `SceneManager.addPreRender` is added here (07 C46; it runs in `render()` before the draw until 07 R3); the marker imports `render/SceneManager.js` for `LAYERS` (as `NormalsDebugView` does; 8.2 is amended); every marker line, the cross included, is a dashed light core over a Morph Black halo (06 5.12, the spec of record for the look); the anchor ghost and the link follow the effective offset (offset plus drag preview), so a drag from a zero offset shows where the anchor is; `ViewportToolbar`'s " (translate only)" badge suffix lands here with the `modes` field it reads (moved from T6); `SelectionManager.kindOf` exposes the declared or inferred kind; the `O` guard is the shared typing guard (07 C18), so a focused radio, checkbox or button does not block it, like G/R/L/P; 5.4's `modes` expression is corrected (`(sel.allowedAxes?.(m) ?? {}) !== null` coalesced `null` into `{}`, which kept every mode). Test 15's marker part is `pivot-marker.test.mjs`. | L (3.5 d) | T4, **T13 (hard gate: signed off in both specs)**. B-M14 if it has landed. |
| T6 | `PivotPanel` (payload-derived status) + markup + `css/features/pivot.css` (all rules of 3.2); `CameraPanel` label, row and the floored `min` helper (the helper and its mirror land with T4, recorded there); `PropControls` / `ViewportToolbar` mirrors (the pose mirrors land with T4); static checks of 8.2; unit test 17; harness README contract. No help-badge change. **As built:** the "Distance to wall plane" row uses the existing read-out classes (`.readout-row`, `.readout-label`, `.readout-value`, which 06 T1 made of the inline styles the `.pivot-distance-*` rules were to copy), so `pivot.css` has no `.pivot-distance-*` rules; the snap select is a `.ui-select` (06's class for the same former inline style) with `.pivot-snap` kept as a hook; the panel adds the hint "Session only: the pivot is not saved in project files yet." (the header's "Sequencing"); a zero in the status line prints `0.000`, not `+0.000` (3.2's example; 3.6's `dx >= 0 ? '+' : ''` would sign it); the far-from-anchor warning is appended to the readout line rather than replacing the coordinates; the 8.2 checks are static rules 18 (markup and the frozen badge text), 19 (radios) and 20 (state writers), with the domain-field half in rule 10 (T3, T4); the ViewportToolbar suffix landed with T5. | M (2 d) | T5 |
| T7 | Serialization: v2 pivot write and read, `resolved_m` (null only for a non-finite layout), validator rules, v1 migration, `applyImport` pivot + event + `cause: 'import'`; the pre-step-C rule for `display.show_pivot_marker` (not written by T7, ignored on read). **Deferred by the owner (2026-10-17) to M7a** (header, "Sequencing"): the pivot is session-only until then. | M (1 d) | T4, **P2-13e (B-L31 v2 writer)**, **P2-3 (B-L8 ProjectValidator)** |
| T8 | Harness: the library changes of 8.3 (`KEYS`, `keyPress` options, `AppPage.drag` with `modifiers`/`beforeRelease`) with the identical-baseline proof; the five scenarios of 8.3, with the offset-and-top-view arrow location and the two post-checks (`cancel_after` vs `cancel_before`; the glTF `2^-22` y tolerance); manual acceptance of every criterion marked (manual); step E capture (about 141 forward goldens) | L (3 d) | T6, T7, T10, and 08's P2-11c (for a single capture; see 8.4 order) |
| T9 | Marker visible by default (`DEFAULT_SHOW_PIVOT_MARKER = true`) and the v2 read/write of `display.show_pivot_marker` from now on | S (0.5 d) | T6, T7, **B-M11 fixed: roadmap P2-10a or spec 07 R1** (Q9) |
| T10 | Grid per Q8 | S (0.5 d) | T6, owner answer to Q8 |
| (T11) | **Withdrawn (07 C58).** Step F is the roadmap's P2-11c commit, counted only in spec 08. The pivot cases of test 6 (`'layout'` part) are part of T2's test file and run when P2-11c lands. | – | – |
| T12 | ARCHITECTURE.md amendments (5.9; the F3 row of section 9 is rewritten by 07's D0), README "Pivot" section (DCC placement guidance: Unreal Z-up, Y→Z; the `O` key, which is also in 07's `ShortcutHelp`) | S (0.5 d) | lands with the T2-T7 commits |
| T13 | Owner sign-off of the shared contract of 5.10.1 (its amendments are already applied to specs 02 and 07 by 07's consolidated D0), recorded in both documents. **Done:** signed off on 2026-10-16 (A7), recorded in 5.10.1 and 02 §10.3, confirmed on 2026-10-17. | S (0.5 d) | **hard gate for T5** |
| T16 | Harness runs and re-baselines for steps A (zero-diff proof), A′, B, C and D: five full runs, each with a compare-report review against the step's allowed kinds, and promotion (8.4); step F's run is 08's | M (2 d) | each with its step's task |
| T14 (optional, Q7) | Pivot alignment `align: 'chord'`: stage yaw so the first→last chord is parallel to +X; rotates poses on re-expression; v2 field `pivot.align` | M | T8, the B-L1 decision |
| T15 (optional, Q2) | `surface-center` mode (6.1 extension) | S | T8, owner answer to Q2 |
| T17 (optional, Q1) | Per-device default for new projects: a "Use for new projects" button in `PivotPanel` stores the current mode in 07's `app/Prefs` as the `:prefs` member `pivot_default_mode` (C19; absent or unknown = `bottom-left`); New (07 D8) and a first start without autosave read it. Opening or importing a file never reads it (Q14: files decide their own pivot), and the harness clears storage (07 G3), so no golden changes. Unit tests for the read and the fallback. | S (0.5 d) | T6, 07 H3 (`Prefs`), 07 D8 (New) |

**Total: 13 tasks (T1-T10, T12, T13, T16), about 19 engineer-days (range 17-21), plus the optional T14 (M), T15 (S) and T17 (S, 0.5 d).** Revision 3 counted about 21.5 days; revision 3.1 removes T11 (P2-11c is counted only in spec 08) and T13's documentation day (07's consolidated D0 does it), 07 C58. Revision 2 estimated 16 days. The increase comes from three things: T5 and T8 are each a full L (marker, the shared hook set, picking, gesture swallowing, re-anchor and shortcuts; harness-lib work, five scenarios with about 141 forward goldens, and manual acceptance of every criterion); the six full-harness runs are now budgeted explicitly (T16); and the cross-spec sign-off now covers two documents (T13). Step F (P2-11c) is counted only in spec 08.

**Critical path:** T13 → T5; T1 → T2 → T3 → T4 → T5 → T6 → T10 → T8, with T16's runs at each step boundary (step F follows whenever 08 lands P2-11c). T7 runs in parallel once P2-3 and P2-13e exist. T9 runs when B-M11 is fixed.

**Cross-spec dependencies**
- **Spec 01:** none for gating. Per its CR-6, moving existing helpers (the pivot marker included) to `LAYERS.HELPERS` is not spec 01's work.
- **B-M11 (gates step C, T9):** whichever lands first of roadmap P2-10a (the preview render hides registered helpers) and spec 07 R1 (helpers on `LAYERS.HELPERS`; 07 C31, C55). The marker is a registered helper, so either fix removes it from the preview with no work here.
- **Spec 02:**
  - the shared contract of 5.10.1 (spec 02's hook set, Escape rule, snapping and composition rule, adopted unchanged; this spec's additions: gesture swallowing, picking scope, `WALL_REBUILT` fields, pivot re-anchor), recorded by T13 and signed off before T5;
  - the shared lifecycle is implemented by T5 (Phase 3 order puts Feature 3 first) and reused by spec 02;
  - spec 02 inherits `layoutProject({frame})` and its insertion point for `applySectionOffsets` (after `translated()`, 07 C32), `generativeBounds()` (attached-only from its T3), and `translated()` (raw walk only);
  - no spec adds a help-badge token except spec 01; 07 I4a rewrites the badge once (07 C35).
- **Spec 05:** the HDRI point (`'hdri-point'`, kind `'projector'`, 07 C36) becomes a `StageAnchored` participant whose `translateStage` clamps through its widened ±100,000 m x/z range (07 C45); its `pickPriority` 9 follows the 5.4 rule.
- **Spec 09:** `MeasurementController` is a `StageAnchored` participant (clamped to ±100,000 m).
- **Spec 06:**
  - `SceneTheme.pivot` and `--pivot-warning` are bridged;
  - its OBJ-header re-baseline may make the pivot header unconditional.
- **Spec 07:** the picking text (§3 and §5.4.1) adopts the 5.4 rule. The I3 port maps the hook set one-to-one onto `applyTransform` phases (5.4); if this feature lands after I3 it implements Selectable v2 directly. D5's `ProjectSession.apply` takes over `applyImport`'s pivot step (4.4) through the `features.pivot` hydrator. The `display.show_pivot_marker` default `true` matches step C. `SceneManager.addPreRender` (07 C46) runs `updateScale`. From I4b the `OrbitController` joins `stageAnchored` (07 C45). H1 records the pivot commit as one entry including every `translateStage` (07 C59).
- **Phase 2 bug fixes (roadmap ids):**
  - merge gates (roadmap §1.1): P2-3 (B-L8 validator) and P2-13e (B-L31 v2 writer), which T7 needs, and P2-8, kept for ordering only (header);
  - P2-8b / B-L9 (collapses the `posZ` branch; not blocking);
  - P2-10a (B-M11; gates step C);
  - P2-11: P2-11a's analyser replaces `coverage`; **P2-11c is step F** (counted only in spec 08, with `FramingPolicy`'s named boxes, 07 C34);
  - P2-5 (B-M1 for criterion 17; B-M15 is independent);
  - B-L11 (recommended; the `O` guards do not rely on it);
  - B-M14 (recommended);
  - B-L1 (recommended to decide first; not blocking; must adopt the exit-heading definition of 6.9).

---

## 11. Risks and open questions

### 11.1 Risks

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Users confuse the stage origin (on the floor) with the pivot (which may be raised) | Medium / medium | The marker draws a dashed drop line. The readout and the one-line explanation (3.1) are shown. The OBJ header states the stage placement. |
| A full rebuild on each committed pivot change is slow for huge walls with panel IDs (and leaks textures if Phase 1C H1 has not landed) | Medium / low | Commits are discrete and drags never rebuild (D7). If needed, F0-d's transform-only path (spec 02) can later apply a uniform translation without re-texturing. |
| The two specs drift apart again (revision 2 and the then-current spec 02 had each adopted the other's old hook names) | Medium / high | This revision adopts spec 02's current text verbatim wherever it has one (5.10.1). The few additions are listed with the exact spec-02 (and spec-07) sections to amend. T13 is a hard gate for T5, signed off in both documents. T5 implements the hook set once, and the shared gizmo unit tests encode it for both specs. |
| Spec 02's matrices are applied before the pivot translation (or twice) | Low / high | One composition rule (5.10 #2): `translated()` throws on a non-null `postTransform`, and `applySectionOffsets` runs after it, inside `layoutProject`. Unit tests 4 and 8 (shared with spec 02's E17) cover it. |
| A cancelled drag leaves the orbit armed, and the view jumps on the next mouse move | Medium / medium (regression vs legacy) | `gestureCancelled` swallows the gesture until mouse-up (5.4); unit test 19 and the `pivot_gizmo` cancel-with-moves step. |
| The marker steals clicks from a camera or prop standing on the stage origin | Medium / medium (once step C shows it by default) | `pickPriority` counts only against wall hits (5.4); unit test 18. |
| A later B-L1 flip silently changes `wall-center` and `mesh-center` pivots of saved projects | Medium / medium | 6.9: the exact migration `a' = a + c` (with the exit-heading definition) plus a recorded convention keep geometry and pivots identical; unit test 9. |
| Keep stage layout re-expresses after the user has already placed the camera in the new frame, so it "moves unexpectedly" | Low / low | The status line reports every re-expression. The toggle is persistent. Imports and section edits never re-express. |
| In centred modes, a section edit slides the wall relative to a camera placed against one section | Medium / low | Deliberate (3.7); `#pivot-status` reports the shift; Q15 asks the owner. |
| A stale safe-distance group (B-M8) is exported in an old frame after a pivot change | Low / medium | The group is stamped with its stage origin and re-expressed on export (7.1); unit-tested. |
| Floating-point drift in poses from repeated re-expression | Low / negligible | Deltas are formed from resolved origins. The drift is about 1e-16 m. |
| Screenshot churn hides a real regression inside steps C, D or F | Medium / medium | Each step lists its allowed output kinds (8.4), JSON and ZIP entries included. Any other FAIL is a regression to investigate, not to re-baseline. The help badge is not edited here, so step B touches no canvas screenshot. |
| Step F re-baselines the same screenshots twice (once here, once in P2-11c) | Low / medium | Step F **is** P2-11c, implemented and counted once, in spec 08 (6.6, 07 C58). |
| An unsigned −0 in translated values changes glTF float bytes | Low / low | The identity path returns the raw layout, the builder `baseY === 0` branch is verbatim, and `0 − x` is used in framing |
| The harness pixel-pick of the person (colour `0x4488ff`) hits the marker | Low / medium | The marker colours exclude `0x4488ff`, and the marker sits at the origin, away from the person (2, 2) |
| Users expect always-on snapping (revision 1 behaviour) | Low / low | The select is labelled "Ctrl-drag snap" with a tooltip; Q16 lets the owner choose otherwise for both specs at once. |

### 11.2 Open questions for the owner (each with a recommended default)

| # | Question | Recommended default |
|---|---|---|
| Q1 | Should **new** projects default to `wall-center` instead of `bottom-left`? | **`bottom-left`** for now. Every existing pipeline and file stays identical. Revisit after users try the modes; switching later is a one-line default change plus a re-baseline. A user who always works in another mode can make it their own default with the optional T17 ("Use for new projects", stored per device in 07's `app/Prefs`, C19), which changes no file and no golden. |
| Q2 | What is "middle of wall mesh"? (a) the 3D bounding-box centre (y = half the tallest section; current `mesh-center`); (b) the **surface centre**: the point on the LED surface halfway along the wall at mid-height, where the content centre sits (6.1, O(n)); (c) the bounding-box centre on the floor. On 6 of the 7 harness walls (a) and `wall-center` differ only in y, so (b) may be what was meant. | **(a) for `mesh-center`** (what DCCs call the bounds centre), and add (b) as a fourth mode `surface-center` ("Wall surface centre (content centre)", optional T15, S) if the owner confirms the content-centre reading. (c) is reachable with Offset Y. |
| Q3 | Should the viewport origin rise to the pivot height (a full 3D origin), or stay on the floor? | **Stay on the floor** (5.1). The pivot height is exact in exports only. |
| Q4 | Keep stage layout on by default? | **On** |
| Q5 | Should the pivot anchor include per-section offsets (the live mesh) or only the generated wall? | **Generated wall only** (D5). It is stable while sections are nudged. **Consequence:** once spec 02 offsets or detached sections exist (risers, leaned flats, soffits, ceilings), `mesh-center` is the centre of the generated chain, not of the exported mesh, and `wall-center` ignores detached sections; the file origin then sits off the centre of the exported geometry by the offsets' effect. Use the pivot offset to correct it, or a later "Use current mesh" button (S, after spec 02 3a) that stores the difference between the transformed `bounds()` centre and the anchor as the offset. Choose "live mesh" only if exports must always be centred on the final geometry; the pivot then moves while sections are dragged and nudged. |
| Q6 | Offset axes: world/layout axes, or wall-chord-aligned axes? | **World/layout axes.** They are simple and predictable, and they match the grid and gizmo. |
| Q7 | Add pivot **alignment**, so the exported wall faces +Z squarely (a yaw that makes the first→last chord parallel to X; a curved 10×3° wall is yawed by 16.5° today)? | **Not in this feature.** Ship as T14 (`pivot.align: 'none' \| 'chord'`, default `'none'`) once B-L1 is decided. It rotates the stage frame and therefore camera and prop rotations too. |
| Q8 | How should the floor grid relate to the stage origin? Today `GridHelper(50, 50)` at (12.5, 0, 12.5) covers x, z ∈ [−12.5, 37.5] (mostly in front of the wall) with lines at half-metres. Options: (a) `GridHelper(50, 50)` at the origin: lines through whole metres, but coverage [−25, 25], so half of it lies behind a bottom-left wall and `large_wall` (72 m) loses floor; (b) keep size 50 at a whole-metre offset such as (12, 0, 12): whole-metre lines, legacy-like coverage in front, but asymmetric around a centred wall; (c) `GridHelper(100, 100)` centred on the stage origin: whole-metre lines, ±50 m in every direction for every pivot mode, 202 instead of 102 lines (negligible cost). | **(c)** (step D). It follows the DCC convention, covers the stage for every pivot mode, and keeps the grid centre lines on the stage origin where the axes cross. |
| Q9 | Should the pivot marker be visible by default? | **Yes, but only once B-M11 is fixed** (step C waits for it). The fix comes from roadmap P2-10a (the preview render hides registered helpers) or from spec 07 R1 (`LAYERS.HELPERS`), whichever lands first; spec 01 does not do it (its CR-6). Before then, the marker would also appear in the camera preview and pilot view used for previs. Until then it ships off, files cannot turn it on (4.2), and `O` / "Select pivot" still show it while selected. |
| Q10 | Should the export metadata (OBJ comment, glTF extras) be written always or only for non-default pivots? | **Only for non-default pivots** until Feature 6 re-baselines the OBJ headers. Then **always**. |
| Q11 | Offset units: metres (stage scale) or millimetres (like the section fields)? | **Metres, 1 mm resolution.** The JSON key `offset_m` makes the unit explicit. |
| Q12 | Should importing a file re-express the camera and props into the file's pivot frame? | **No.** An import is a load. v2 files carry their own stage-frame poses, and v1 files never stored poses. |
| Q13 | Should section and panel export modes give each exported object its own origin (per-section or per-panel pivots)? | **No, not in this feature.** All objects share the wall pivot so they assemble in place in the DCC. Per-object origins would need glTF node translations (and have no OBJ equivalent); they are a separate follow-up if requested. |
| Q14 | On importing a v1 file (or a v2 file without `pivot`), reset the pivot to the identity or keep the session's pivot? | **Reset** (4.4). The same file then always produces the same exports. Keeping is friendlier for users who work in one mode and load v1 wall configs; it is a one-line change in `applyImport`. |
| Q15 | In the centred modes, should keep-stage-layout also re-express the camera and props when a section edit moves the stage origin? | **No** (D6, 3.7). Stage coordinates are the source of truth between explicit pivot edits, so a camera centred on the wall stays centred as the wall grows. `#pivot-status` reports each shift. |
| Q16 | Snapping gesture for gizmo drags (pivot and sections): Ctrl/⌘-held (spec 02) or always on with Ctrl to disable? And one shared translate increment, or per target? | **Ctrl/⌘-held, per-target increments** (D9, 5.10.1 #3): free dragging stays the default, as in Blender, and the pivot's metre-scale steps differ from the sections' millimetre steps. Changing the gesture later is one line in `TransformGizmo.onMouseMove` for both specs. |
| Q17 | Merge gates: keep roadmap §1.1's P2-8 as a hard gate for F3, or relax it to a soft gate so the non-persistent pivot work can merge earlier? | **Keep it** (header). Nothing in this spec depends on P2-8, so relaxing it later needs no spec change. |
