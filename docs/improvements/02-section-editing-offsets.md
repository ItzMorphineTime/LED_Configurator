# Feature 2: Section selection, property editing and per-section transform offsets

| | |
|---|---|
| **Status** | Implementation-ready specification (Phase 3), revision 3. Nothing here is built yet. **Plan review (2026-10-16):** Detached sections (T17) are **deferred to 3b by default**, because they change the generative walk and go beyond the owner's "basic offsets" (Q25; the 3a/3b totals in 10.1 and 10.2 follow); 6.17 no longer claims that detaching never moves the wall pivot (detaching is a generative edit), and 8.1 adds the unit test for it. **Revision 3.1** applies the cross-spec consistency review (07 §0 C32-C62): `applySectionOffsets(out)` runs after `translated()` on the translated section frame, with no conjugation (C32); the path-B hook set is 07 C33's (03 T5 implements it); framing reads `FramingPolicy`'s three named boxes (C34); the HDRI point is `'hdri-point'` (C36); observers are 07 I2's (C37); the selection colours are 06's two-tone values; the Escape registry gains priority 75 for the 3b reorder drag (C42); `Delete`/`Backspace` act only on four targets (C44); `gizmo.updateScale` registers with `addPreRender` (C46); path A is the recommended order (C58), and T14's documentation is done by 07's consolidated D0. Revision 3 reconciles this spec with the landed-first contracts of spec 03 (gizmo hooks, Escape order, `modes`, relative snapping, `postTransform` pipeline, framing), spec 01 (per-section panel shells, `RENDER_ORDER`, the LED side controls and `#flip-all-sections`) and the binding section 0 of spec 07 (`position_m`, `KEYMAP`, Selectable v2, `History`, `ProjectSession.apply`, `OrbitController.frame`). It also anchors Detached sections to a host section by id, makes `locked` data-only in 3a, fixes the re-baseline sets, tolerances and harness steps, and re-estimates the work. |
| **Binding base** | `docs/ARCHITECTURE.md` (module specs, events, `Strategies`/`LEGACY_SITES`, section 9 seams) and `docs/REFACTOR_PLAN.md`. **Spec 07 section 0 is binding** where it decides a cross-spec conflict (2.4). Where this spec changes a contract, section 5.9 lists the ARCHITECTURE.md amendment that must land in the same commit. |
| **Legacy reference** | `index.html@cd3fd3f` (line numbers below refer to that file). Bug ids are from the verified defect list (`B-H*`, `B-M*`, `B-L*`). Behaviour ids (`N-5`, `D-4`, ...) are from the behaviour inventory. Roadmap ids (`P2-*`) are from spec 08. |
| **Phase 3 position** | REFACTOR_PLAN order 1, 6, **3**, **2**, 4, 5. Spec 01 (normals) and spec 03 (pivot) land **before** this spec, and this spec builds on their contracts (2.2). Spec 07's foundations may or may not have landed when this spec starts: section 2.4 gives a path A (landed) and a path B (fallback) for each one. Each dependency has a stated fallback. |
| **Sibling specs** | Spec 01 (normals + normals view), Spec 03 (configurable pivot), Spec 04 (UVs + UV viewer), Spec 05 (HDRI), Spec 06 (branding), **Spec 07 (platform foundations)**, Spec 08 (bug-fix roadmap), Spec 09 (additional ideas), all under `docs/improvements/`. |
| **Hard prerequisites** | Phase 1 complete. Phase 2: B-M14, B-M12, B-L8 (validator, unique numeric ids), B-L31 (JSON v2 writer), B-L11 (`isTypingTarget`), B-L15 (integer counts). In path A these come from spec 07 I1, I2, I3, D2 and D4. See 2.3, 2.4 and section 10. |
| **Scope split** | **3a (MVP)**: picking and list sync, multi-select and batch editing, offset fields and reset, LED side relocation (spec 01 hand-over), gizmo translate/rotate with cancel (scaled to stay visible on large walls), v2 fields (`locked` persisted but inert), floor runs. **3b (extras)**: lock behaviour and UI, reorder, duplicate, hover, snapping, keyboard shortcuts and framing, undo record rows (spec 07 H1), and **by default the Detached flag with a host section (T17, Q25)**, which moves into 3a only if the owner wants soffits, ceilings and risers in the MVP. Every UI row, task and criterion below carries its phase; the rows marked [3a] that concern Detached follow T17 (10.1, "If T17 is deferred"). |

---

## 1. Summary and user value

**Problem.** A wall today is defined only by a chain of sections. Each section starts at the end of the previous one, plus a cumulative heading change (`angleOffset`). There is no way to:
- click a section in the 3D view and see which card it is;
- edit several sections at once (for example, set 12 sections to 176x176 px);
- nudge one section 50 mm toward the stage, raise a wall onto a 250 mm riser, or lean a wall back 5°, without breaking the chain for every later section;
- add a soffit, ceiling or riser strip without leaving a hole in the wall.

**Who it is for.** Virtual-production and LED-stage designers who build a volume from a generative layout and then need to match the real build: risers, soffits, ceilings and leaning flats.

**What this feature delivers.**
1. **Selection [3a].** Click any section in the viewport in all three mesh modes, from the front or from behind. The section is outlined and tinted, and its card is highlighted, expanded and scrolled into view. Shift-click adds to the selection and Ctrl-click (⌘-click on macOS) toggles, as spec 07 3.7 defines for the viewport. Selecting from the list outlines the section in the viewport. Hover feedback is added in 3b.
2. **Easier property editing [3a].** A section toolbar offers select all, expand all, collapse all, flip the LED side (spec 01's `#flip-all-sections`, moved into the toolbar: it acts on the selection, or on every section when nothing is selected) and delete selected. A **batch editor** appears when two or more sections are selected. Collapse state survives every re-render. 3b adds duplicate, move up and down, drag reorder and lock.
3. **Per-section transform offsets [3a].** Each section gets a position offset (mm in the UI, metres in the file) and a rotation offset (degrees). Both are expressed in the section's own frame and applied about a chosen rotation origin. The offset is applied **after** the generative layout and is never fed back into the cursor walk. Changing columns, curve or heading on any section therefore still regenerates the wall, and every offset keeps its meaning. Offsets can be edited in numeric fields or with the G/R gizmo. Snapping is added in 3b.
4. **Detached sections [3b by default, Q25].** A per-section flag, "Detached: does not move the following sections", with a **host** ("Starts at"): a detached section starts where its host section starts, and the layout chain skips it. The host is stored by section id, so reordering keeps the pairing, and deleting or detaching a host re-anchors its dependants without moving them (6.2). A soffit, ceiling or riser therefore no longer consumes chain length, and no hole opens at floor level. Workflows are in 3.7. Detached is opt-in and the walk is unchanged for every wall without it. Because it is the only change to the generative walk, it is deferred to 3b by default; Q25 asks the owner whether it belongs in the MVP after all. Ticking Detached on a section of the chain is a generative edit: the following sections close the gap, and a centred wall pivot can move (6.17).
5. **Consistency everywhere [3a].** Offsets and the Detached flag are honoured by the viewport in all modes, the panel frames, the selection outline, the safe-distance floor, the true bounds, the normals view and every export (OBJ, glTF, JSON v2, ZIP). With all offsets at zero and no detached section, every geometry output stays byte-identical to the pre-feature build. The automatic orbit target reads the generative bounds of the attached sections, so it never jumps while the user edits offsets; camera Reset and `F` frame the transformed wall on demand, and the safe distance D follows the stage-facing sections (6.11, 07 C34).

**Not an offset use case.** Correcting a corner angle between two sections is a job for **Heading Change** (`angleOffset`), which turns this and all following sections and keeps the chain closed. A Pan offset turns only this one section and opens a gap at its junctions.

---

## 2. Current state

### 2.1 Legacy behaviour (index.html@cd3fd3f)

| Area | Lines | What it does today | Consequence for this feature |
|---|---|---|---|
| Layout walk | 1482-1549 (copies 2614-2647, 5012-5080) | The cursor `(currentX, currentZ, currentAngle)` carries across sections. `angleOffset` is added to the heading before the section (1495-1496) and **propagates to every later section** (B-4). The curve step is applied before each panel (1508, B-L1). | The offset must sit after this walk. `angleOffset` stays the generative heading control. The Detached flag is the only walk change, and it is identity when unused (6.2). |
| Wall meshes | combined 1579-1678, section 1710-1774, panel 1776-1802 | Combined: one `BufferGeometry` with no groups and no `userData` (1677). Section: one mesh per section. Panel: one `PlaneGeometry` per panel at `(x, y, z)` with `rotation.y`. `ledWallGroup` keeps an identity transform, and strip vertices are baked in world space. | Nothing identifies a section. Combined picking needs a face-to-section table. |
| Frames | 1559-1569 | `EdgesGeometry(BoxGeometry)` per panel at the panel centre and `rotY`. | Frames must follow the offsets. |
| Picking | `handleViewportClick` 3427-3474, routing 4437-4448 | Picking raycasts only the camera body, person and car. It runs on **mousedown** and only while a gizmo mode is active (N-3). A miss deselects, so an orbit drag loses the selection (**B-M14**). | The wall is never raycast. |
| Selection | 3139-3167 | `selectedObject` is one of `'camera' \| 'person' \| 'car'`, and the badge uses a names map. | Single string ids only. |
| Gizmo | `createGizmo` 2997-3099, orientation 3101-3120, drag 3232-3409 | Hand-written arrows and tori. In local space the translate axis is `axisDir.applyQuaternion(gizmoGroup.quaternion)` (3270-3277). Rotation is inverted (**B-M12**), the world rings write Euler channels (**B-L28**), props get inert handles (**B-L22**), the local orientation goes stale (**B-L23**), and resources leak (**B-L12**). | The ported `TransformGizmo` + `Selectable` contract is the extension point. The local orientation must match the frame the offset is stored in (6.8). |
| Section cards | `renderWallSections` 3892-4079 | The cards are an innerHTML accordion with unescaped names (**B-M4**; the Phase 2 fix escapes them, it does not convert them). A header click toggles `.collapsed`. Collapse state lives only in the DOM and is snapshot and restored on add and delete (4083-4086, 4109-4116), the only legacy re-renders besides init and import. Fields commit on `change` and trigger a full rebuild (4026-4075). The 4K ⚠ is patched through a regex (**B-L16**). | There is no selected state, no batch edit, no duplicate, reorder or lock, and no offset fields. This feature converts the cards to DOM APIs (T11). |
| Add/Delete | 4081-4146 | Add clones the last section (`angleOffset` 0). Delete guards the last section and removes the logo entry. | Duplicate and reorder must follow the same id and logo rules. |
| Shortcuts | key state 3843-3854, shortcuts 4410-4434 | Key state tracks `e.code` (WASD, arrows, QE) and ignores INPUT, SELECT and TEXTAREA. The shortcut handler matches `e.key` for G, R, L, P and Escape, ignores INPUT and TEXTAREA, and filters neither modifiers nor repeat (**B-L11**). | New keys must avoid every key in the post-Phase-3 keymap (3.5.1; spec 07 `KEYMAP` in path A) and must not trigger orbit movement when used with Ctrl or Cmd. |
| Safe distance | 2586-2762 | It flattens every section into one `allEdges` list, pushing only the very first edge (2632-2634), so it assumes contiguous sections. D uses flat bounds (2598-2612, **B-L2**). The quads are un-mitred (**B-M15**) and face down (**B-L29**). | With offsets or detached sections it would draw a quad bridging the gap. It needs per-run edges. |
| Bounds / frustum | 2489-2493, 2553-2557, 2598-2603, 3758-3762; coverage 2471-2534 | Four flat-bounds copies (**B-L2**). Coverage ignores rotation and the real geometry (**B-M10**). | Spec 03 (landed first) switches the orbit target, Reset and D to `framingBounds = 'layout'` (its step F). This spec decides which bounds that reads (6.11). Coverage keeps the flat model until P2-11a. |
| Exports | `generateAllSectionsGeometry` 5012-5080; JSON 4942-4965; ZIP JSON 4499-4519; import 4967-5010 | Exporters re-walk the layout. JSON v1 hard-codes its fields, and the import whitelists them (4975-4988, **B-L8**). The ZIP JSON has drifted (**B-M3**). | Offsets must flow through the single layout. The serializer needs v2 fields. |
| Help badge | 1203-1205 | `.viewport-info .info-badge`: "Drag to rotate • Scroll to zoom • WASD to move • G=translate R=rotate L=space P=pilot", inside `.viewport-overlay`, so inside every canvas screenshot clip. | Any text change re-baselines every canvas screenshot. **This spec does not change it** (3.5.1). |

### 2.2 Seams this feature builds on

**Phase 1 (ARCHITECTURE.md)**
- `WallSection` with stable `id` (3.5). `SECTION_FIELDS` and `FIELD_RULES`. `WallController` is the single writer of section state (3.10).
- `SectionLayout.postTransform` (always `null` in Phase 1, "never fed back into the cursor"). `WallLayout.bounds()`, `firstEdge`, `lastEdge`, `pivotPoint(mode)` and `flatEdges()` (3.6). The Phase 1 `computeWallLayout(sections, {postTransforms})` option cannot carry offsets, because an offset matrix needs the walk's own edges; this spec replaces it with `applySectionOffsets` (6.6).
- `WallMeshBuilder.sectionGrid`, `panelCorners`, `panelFacingNormal`, and `combinedGrid().sectionRanges`, the "Feature 2 picking seam" (3.6).
- `LEDWallView` mesh tags `userData.{kind, mode, sectionId, sectionIndex, col, row}`, `mesh.userData.sectionRanges` in combined mode, `meshes()` and `sectionNodes()` (3.7).
- The `Selectable` typedef, `SelectionManager`, `TransformGizmo`, `PointerRay` (one shared raycaster) and `InteractionState` (3.8).
- `WALL_REBUILT`, the feature seam (5.2). ARCHITECTURE section 9 names the Feature 2 event `section:changed`. This spec uses exactly that name, as the constant `SECTION_CHANGED` (5.3).
- `ProjectSerializer.read` version dispatch, and `ProjectValidator` (the Phase 2 B-L8 fix).
- `SceneManager.addHelper` and `LAYERS.HELPERS` (3.7, F0-e). `createDialogs(win)` in `ui/dom.js` (path B only; spec 07 E2 deletes it).

**Spec 03 (pivot), landed before this spec** (03 5.4, 5.10 and 6.3-6.7 are the contracts quoted here)
- `layoutProject(project, { frame = 'stage' })`: walk, then `resolvePivot`, then a baked translation (`translated(dx, dy, dz)`). The frames are layout (L), stage (S, origin `(P.x, 0, P.z)`) and export (E, origin `P`). `SectionLayout.baseY` (0 except in the export frame). `layout.pivot`. `generativeBounds()` (03 T2).
- **The composition pipeline, recorded as 07 C32 (03 5.10 #2):** `computeWallLayout` (the verbatim walk plus this spec's two-pass Detached host walk; every `postTransform` null) → `resolvePivot` on the raw walk (generative quantities only) → `translated(t)` on the raw walk (it throws on a non-null `postTransform`; no `conjugateTranslation` exists) → **`applySectionOffsets(out)`**, which builds `S_i` from the **translated** section frame (`O_s`, `B`, `baseY`) and asserts `det > 0` → `out.pivot = {resolution, frame, translation}` (6.6). Translation equivariance makes the result equal to building in the layout frame and translating afterwards; this spec's E17 and spec 03's unit test 8 are one shared test.
- **The shared path-B gizmo hook set, 07 C33** (implemented by spec 03 T5, reused here): `Selectable.kind` (`'pivot'` added), `pickPriority` (pivot 10), `allowedAxes(mode)` returning `{x, y, z}` or `null` (`null` = the mode is unsupported; it replaces `allowedModes`), `beginGizmoDrag()`, `applyGizmoTranslate(movement, ctx)` and `applyGizmoRotate(axis, deltaDeg, ctx)` with `ctx = {space, axisWorld, snap}`, and `endGizmoDrag({cancel})` as the only end hook; `TransformGizmo.cancelDrag()` calls `target.endGizmoDrag({cancel: true})` and sets `interaction.gestureCancelled`; `detach()` cancels an active drag first; `setSnapIncrements(partial)` and `InteractionState.snap = { translateMm: 10, rotateDeg: 5, pivotM: 0.1 }` (03 5.10.1 #3). The set maps one-to-one onto 07's Selectable v2 (07 §5.4.1).
- `SELECTION_CHANGED` gains `modes` = the modes whose `allowedAxes` is not `null` (03 5.4, 07 §5.4.1), which drives the badge suffix "Selected: Pivot (translate only)". This spec keeps it and adds `ids`, `kind` and `origin`.
- **The Escape order of 03 3.4** (ungated): 1) a gizmo drag is active → `gizmo.cancelDrag()` and stop (the selection is kept); 2) pilot on → exit pilot; 3) deselect and clear the mode. From 07 I1 it is the registry chain 80/75/70/60/40/0 (07 C42); this spec's only addition is priority 75 for the 3b sidebar reorder drag.
- **One snapping model (03 D9):** Ctrl/⌘ held during a drag snaps the **dragged distance or angle**, relative to the drag start, never the absolute value. This spec follows it for both gizmo spaces (6.8).
- **Framing (03 D10, step F = 08 P2-11c):** `framingBounds = 'layout'` with `FramingPolicy`'s three named boxes (08 P2-13g, 07 C34): `generativeBox` (attached sections, pre-offset: the pre-I4b automatic orbit re-target and the pivot's `mesh-center`), `wallBox` (`bounds()`, transformed, all sections: camera Reset, `F`, open/new/restore framing) and `stageExtent` (sections with \|n.y\| ≤ 0.9: D, frame width and height, `fits`). This spec makes `generativeBounds()` attached-only (T3) and `bounds()` transformed (6.11).
- `ViewportInput`'s injected-callback pattern (`onPivotShortcut`). The `css/features/*.css` convention: linked before `css/12-responsive.css` in 07 C52's link order; `tests/static/css-slices.mjs` runs report-only and scoped to `01-12` (07 S7), so it never scans `css/features/`.
- **Fallback if spec 03 has not landed:** `layoutProject(project)` is `applySectionOffsets(computeWallLayout(sections))` with no translation, `baseY` is treated as 0, `generativeBounds()` is added by T3, and T9 implements spec 03 5.4 verbatim (hooks, `cancelDrag`, detach cancel, Escape order, `modes`), plus the css-slices amendment (T12).

**Spec 01 (normals), landed before this spec** (01 3.1, 5.2, 6.9 and CR-5/CR-10 are the contracts quoted here)
- `WallSection.faceOrientation` (`'stage' | 'reversed'`), `setFaceOrientation`, and the model-only `WallController.setSectionFaceOrientation(section, value)` and `flipAllFaceOrientations()` (the caller then runs `commitSectionEdit()`).
- **Spec 01 T9 ships the LED side UI itself:** a per-card `select.section-face-select[data-section-flag="faceOrientation"]` (spec 01 deliberately avoids `data-field`, whose generic handler would `parseFloat` the value into NaN) in a `.section-row.single` after the angle/offset row, the summary suffix " • Reversed", and the `#flip-all-sections` button ("Flip LED Side (All Sections)") below `#add-section-btn`, owned by `SectionListPanel`. Spec 01 3.1 and CR-5(e) ask this feature to **move the select under the card's "Advanced" disclosure** and to **turn the button into a batch action that applies to the selected sections, or to every section when nothing is selected**. This spec does exactly that (3.3) and keeps the id `#flip-all-sections`.
- **Spec 01 T10 (its step F1-5): `FrontSide` LED material and cabinet back shells** tagged `userData.kind = 'led-wall-back'` (01 6.9):
  - combined and section mode: each shell is a child of its LED mesh and **shares its geometry**; a combined shell copies `sectionRanges` by reference;
  - panel mode: **one shell per section**, built by `builder.panelShell(sl)` in base-layout coordinates, with `matrixAutoUpdate = false` and `matrix.fromArray(sl.postTransform)` (identity while it is `null`); `updateSectionTransforms` rewrites that matrix (CR-5c). Its `userData` carries `sectionId` and `sectionIndex`.
  - `LEDWallView.meshes()` excludes the shells; `backMeshes()`, `pickMeshes()` (owned by spec 01 T10, 07 C52; this spec consumes it) and `sectionNodes()` entries' `backMeshes` expose them.
- `WallLayout.flatEdgeFacing()`: the facing sign σ (+1 stage, −1 reversed) per segment, aligned with `flatEdges()`.
- `NormalsDebugView` (subscribes `WALL_REBUILT`). Spec 01 5.2 subscribes it to this feature's live event with `({live}) => { if (live && settings.normals.enabled && #last) sync({keepLength: true}) }`. Spec 01 calls the constant `WALL_SECTION_CHANGED`; this spec's constant is `SECTION_CHANGED` (`'section:changed'`, ARCHITECTURE 9), and change request CR-01-a (applied by 07's consolidated D0) renames it in spec 01. The key does not exist before this feature, so the subscription lands with T6.
- `js/core/renderOrder.js` `RENDER_ORDER`: spec 01's registry is the single source of every render-order slot, and this spec quotes it **by name only** (`HIGHLIGHT_HALO`, `SECTION_HIGHLIGHT`, `GIZMO`; no numeric literal ≥ 900 outside that file, spec 01's static rule). `js/core/typingTarget.js` `isTypingTarget(t)` (created by 08 P2-9b, 07 C52).
- **Fallback if spec 01 has not landed:** the LED side select and `#flip-all-sections` do not exist (nothing to relocate), `backMeshes()` is treated as `[]`, σ is +1, T13 adds `core/renderOrder.js` with spec 01's whole registry (names and values of 01 §5.2), and the `NormalsDebugView` subscription is added with spec 01.

### 2.3 Bugs this feature depends on or touches

| Bug | Relation |
|---|---|
| B-M14 | **Hard prerequisite.** Select on mouse-up with less than 4 px travel (bugfix roadmap P2-9a; spec 07 I2's capture-phase press record in path A). Wall picking without it would deselect on every orbit drag across the wall. This spec removes the remaining gizmo-mode gating of picks (Q8). |
| B-M12 | **Hard prerequisite.** The rotate gizmo sign (P2-9c, or spec 07 I3 by construction). Without it, section rotation offsets turn opposite to the drag. |
| B-L8 | **Hard prerequisite.** Selection ids rely on the validator's unique numeric ids (`section:${id}`; spec 07 6.8 in path A). Detached hosts are stored by id (`anchor_section_id`), so the same rule keeps them valid. |
| B-L31 | **Hard prerequisite.** The JSON v2 writer (P2-13e, or spec 07 D4). This spec adds fields to it, with the key names of spec 07 C3 in **both** paths (4.3). |
| B-L11 | **Hard prerequisite.** The shared `isTypingTarget` guard (INPUT, TEXTAREA, SELECT, contenteditable). Path A: the shortcuts are spec 07 `KEYMAP` rows. Path B: the B-L11 fix makes the legacy router ignore Ctrl, Cmd and Alt, so this spec's Ctrl/⌘ shortcuts live in their own listener (3.5). |
| B-L15 | **Hard prerequisite** (P2-8: integer `panelCols` and `panelRows`). The live fast path writes at `vertexStart * 3`, which must be an integer. Fallback before the fix: a full rebuild per move (6.15). |
| B-M4 | Soft. The Phase 2 fix (or spec 07 D7) escapes names in the innerHTML templates. T11 converts the cards to DOM APIs (`textContent`, attribute setters), so the escaping becomes unnecessary for the cards. |
| B-L22, B-L23, B-L28 | Soft. Path B: section targets re-orient on rebuild (a partial B-L23 fix for sections only) and compose rotations with matrices. Legacy targets are unchanged unless their own Phase 2 fixes landed. Sections implement spec 03's `allowedAxes(mode)` (all axes in both modes; none when locked, 3b). Path A: spec 07 I3 fixes all three by construction. |
| B-L1 | T3 is gated only on the owner's **recorded** decision (08 Q10, answered at Phase 2 kickoff and recorded in 08 §5.6 and ARCHITECTURE §1.4; 07 C6), because the section frame is derived from the generative edges (R3). 08 P2-13f's code may land at any time. |
| B-L2, B-M10 | Step F (08 P2-11c, `framingBounds = 'layout'`) normally lands before this spec, with `FramingPolicy`'s three named boxes (07 C34): the automatic orbit re-target reads `generativeBox` (this spec makes `generativeBounds()` attached-only), so it stays still while offsets are edited; Reset and `F` read `wallBox`; D reads `stageExtent` (6.11). With identity offsets and no detached section the three boxes coincide. Coverage (B-M10) keeps the flat model until P2-11a, which must ray-test the transformed `panelQuads()`. |
| B-M15, B-L29 | **Conditional.** Spec 08 P2-5b (mitred band, `SafeDistanceBand.js`) is normally landed before this feature. If it is, this spec calls its band builder once per floor run (6.12). If it is still open, its `LEGACY_SITES` row moves from `WallLayout.js#flatEdges` to `WallLayout.js#floorRuns`. Spec 02 owns `floorRuns()`; spec 08 owns the band of one polyline (CR-08-a). |
| B-L24 | Not touched. This spec does not change the help-badge text (3.5.1), so it does not make the badge overlap worse. |
| B-L9 | Not repeated. Offset fields never use `orDefault`. An empty or non-numeric entry reverts to the stored value (3.3). |
| B-L14 | Copy names are made unique (4.1). |
| B-M1 | Soft. Without it, the safe-distance OBJ cannot be downloaded to verify the floor-run change. |

### 2.4 Relationship to spec 07 (platform foundations): conditional paths

Spec 07 section 0 is **binding** over this spec where it decides a conflict (C3, C15, C16, C17, C32-C62 and its 0.2 edits to spec 02). **Path A is the recommended order (07 C58):** 07 schedules I1-I3 before this feature's gizmo work (and D2, D4, D5 before its persistence, H1 before 3b), so the path-B scaffolding is never built. Path B stays written out in sections 3-6 only as the fallback if the owner answers Q26 "B"; it never builds a second, incompatible version of a spec 07 foundation. T8 and T9 are estimated for both (section 10).

| # | Foundation (spec 07 task) | Path A: landed before T8 (spec 07's recommended order) | Path B: not landed (fallback) |
|---|---|---|---|
| 1 | Persisted offset unit and key (07 C3, 4.6) | **Both paths:** `offset.position_m` (metres, ±100 m, 0.1 mm grid), written `Math.round(mm * 10) / 10000` and read `mm = Math.round(m * 10000) / 10`. The UI and `SectionOffset` stay in millimetres. There is only one v2 file format. | same |
| 2 | Schema, validator, serializer (07 D1, D2, D4) | The 4.3 rows go into `io/ProjectSchema.js` (07 4.4 extension protocol: one revision bump for the release, number assigned at merge (07 C40), "absent means default", round-trip and reachability tests); the validator calls `SectionOffset.RULES`; ids are reassigned by 07 6.8 before `anchor_section_id` is checked. | The B-L31 writer (P2-13e) and the B-L8 `ProjectValidator` with the same keys and rules (4.2). |
| 3 | Import and open (07 D5 `ProjectSession.apply`) | `WallController.applyImport` no longer exists. Deselect is `apply` step 2 and re-selection is step 10 (`selection.selectMany` with the remembered ids that still resolve; 07 §5.5.2 numbering). P-IMPORT adds nothing. CR-07-d (adopted): step 10 restores `section:` ids only for reason `undo`/`redo`, because after open or import an equal numeric id names an unrelated section. | P-IMPORT as in 5.4 (`applyImport` deselects a section selection first). |
| 4 | Selection registry (07 I2, `SelectionManager` v2) | `SectionSelection` is a `SelectableProvider` (`prefix 'section:'`, `resolve`, `all`, `group`). Click picking, `pickPriority`, the `'add'`/`'toggle'`/`'range'` modes, `revalidate()` (= this spec's `prune`) and the observer hooks `addObserver`/`addHoverHitObserver` (07 C37) are spec 07's. This spec adds the provider and, in 3b (T23), the `hoverAt`/`setHover`/`clearHover` bodies of 07's single hover raycast. | This spec's `SelectionManager` changes (5.2). |
| 5 | Gizmo (07 I3, `TransformControls` through a proxy) | The section Selectable implements Selectable v2 (5.5, path A column): `allowedAxes`, `getTransform`, `applyTransform(t, phase, ctx)` with the **delta from the drag start**, `historyLabel` and `bounds`. `orientGizmo`, the gizmo scaling and the `WALL_REBUILT` re-anchor are not built (`TransformControls` is screen-sized and `sync()`s on `WALL_REBUILT`). | The path-B hook set of 07 C33 (spec 03 T5; 5.5, path B column) plus this spec's additions: `orientGizmo(rotation, mode)`, re-anchor on `WALL_REBUILT`, and distance scaling for section targets, registered with `sceneManager.addPreRender` (6.13, 07 C46). |
| 6 | Keyboard (07 I1, `KEYMAP`) | No listener. The rows `sections.delete` (only when the target is `#three-canvas`, `body`, `#wall-sections` or `#section-toolbar`, 07 C44), `sections.selectAll`, `sections.duplicate`, `sections.prev`, `sections.next` already exist in 07 3.8; this spec registers their actions with `viewportInput.registerActions(...)` and, in 3b, the Escape handler at priority 75 for the reorder drag (07 C42). `F` is 07's `view.frame`. The `KeyboardState` modifier filter is 07's. | `ViewportInput.attachSectionShortcuts()` and the `KeyboardState` modifier filter (3.5). |
| 7 | Undo (07 H1, `app/History.js`, the only stack, C16) | Record rows (5.4): offset fields (`section:<id>:offset.<path>`), Detached and host, LED side, batch edits, reset, delete, duplicate, reorder, lock; gizmo drags are 07's transactions. | No undo. Delete always confirms (R9). |
| 8 | Framing (07 I4a/I4b, `OrbitController.frame(box3)`) | `F` and double-click call `orbit.frame(box)` with the selection's `bounds()` (07 6.14). `frameSphere` and `#zoomMax` are not built. 07's `wallBox` reads the transformed `bounds()`; it is evaluated only on boot, open, `F` and Reset (I4b), so it never jumps during edits. | `OrbitController.frameSphere` (5.2). The automatic re-centring uses 6.11's rule. |
| 9 | Dialogs (07 E1, E2) | `confirm` is `dialog.open({title, body, actions: [{id: 'delete', label: 'Delete', danger: true}, {id: 'cancel', label: 'Cancel'}]})` (asynchronous); `alert` is `notifier.warn`. Rule S3 forbids `confirm(`. | `createDialogs(win)` gains `confirm` (5.2). |
| 10 | Snap context (07 5.4.1 `GizmoCtx`) | `ctx.snap` is `interaction.snap` while `interaction.snapHeld`; sections read `translateMm` and `rotateDeg` from it (CR-07-c types `GizmoCtx.snap` as the shared `InteractionState.snap`). | Spec 03's `ctx.snap`. |

Path A also applies spec 07's remaining 0.2 edits to this spec: `SELECTION_CHANGED` keeps `ids`, `kind`, `origin` and `modes`; `SectionSelection.group` becomes the provider `group`; this spec's `'range'` mode and `origin` field are kept.

---

## 3. UX design

### 3.1 Vocabulary (used verbatim in UI copy and docs)

- **Generative layout**: the chain built from columns, rows, panel size, curve and heading change. Sections connect end to end.
- **Heading Change (°)**: the existing `angleOffset`. It turns **this and all following sections**. Today it is labelled "Section Offset (°)". It is relabelled (Q12). Use it to correct corner angles.
- **Transform Offset**: the new per-section position and rotation. It moves **only this section**, after the layout. Following sections stay where the generative layout puts them, so a gap or overlap can appear at the junction. That is intended.
- **Detached**: a per-section flag. A detached section starts where its **host** starts ("Starts at", an attached section chosen by the user and stored by id), with the host's heading before the host's Heading Change. The chain continues as if the detached section were not there. It is the tool for soffits, ceilings and risers (3.7, 6.2).
- **Attached section**: any section that is not detached. At least one section always stays attached.
- **Section frame**: the axes the offset is expressed in:
  - **X Along**: along the section's chord, from its first column edge to its last;
  - **Y Up**: world up;
  - **Z Out**: the layout's front side of the section, toward the stage (+Z for a flat section at heading 0). It is the **generative** front and does **not** change with the LED side: on a section whose LED side is Reversed, the LED face points along −Z Out.
- **Rotation origin**: the point of the section that the rotation offset turns about, and where the gizmo sits: Bottom centre (default), Centre, or Bottom left. It is unrelated to the wall **Pivot** of spec 03, which is the export origin of the whole wall.

### 3.2 Layout of the sidebar

```
┌ aside.control-panel ───────────────────────────────────────────────┐
│ #section-toolbar                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 2 of 5 selected   [All] [⊞] [⊟] [⇄ Flip LED side] [🗑]        │  │  3a (⇄ = #flip-all-sections)
│  │                   [⧉] [↑] [↓] [🔒]   Snap [10 mm ▾] [5° ▾]     │  │  3b
│  └──────────────────────────────────────────────────────────────┘  │
│ #section-batch-panel   (only when ≥ 2 sections are selected)        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Editing 2 sections · 1 locked section skipped     [Deselect] │  │
│  │ Columns [ 5 ]        Rows [ Mixed ]                          │  │
│  │ Width (mm) [ 500 ]   Height (mm) [ 500 ]                     │  │
│  │ Pixels X [ 176 ]     Pixels Y [ 176 ]                        │  │
│  │ Angle Between Panels (°) [ Mixed ]  Heading Change (°) [ 0 ] │  │
│  │ Panel Color  ■ ■ ■ ■ □ ■ [custom]   LED side [ Mixed ▾ ]      │  │
│  │ Transform Offset                              [Reset offsets]│  │
│  │  [■ Detached (mixed)]   Starts at [ Mixed ▾ ]                │  │
│  │  X Along (mm) [ 0 ]   Y Up (mm) [ Mixed ]  Z Out (mm) [ 0 ]  │  │
│  │  Tilt X (°)  [ 0 ]   Pan Y (°) [ 0 ]      Roll Z (°) [ 0 ]   │  │
│  │  Rotation origin [ Bottom centre ▾ ]          [🔒 Lock all]  │  │  (lock: 3b)
│  └──────────────────────────────────────────────────────────────┘  │
│ #wall-sections  (role="list", aria-label="Wall sections")           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │⋮⋮ ■ Wall 2                                    🔓  ✕   ˅      │  │  card: not selected
│  │    5×3 • 160×96px • Flat                                     │  │
│  ├══════════════════════════════════════════════════════════════┤  │
│  ┃⋮⋮ ■ Soffit  ⊕ Detached                        🔓  ✕   ˅      ┃  │  .selected.primary
│  ┃    5×1 • 160×32px • Flat                                     ┃  │  (accent left border)
│  ┃ Section Name [ Soffit ]                                      ┃  │
│  ┃ Columns [5]   Rows [1]   Width (mm) [500] Height (mm) [500]  ┃  │
│  ┃ Pixels X [32] Pixels Y [32]                                  ┃  │
│  ┃ Angle Between Panels (°) [0]   Heading Change (°) [0]        ┃  │
│  ┃   Flat                         Turns this and all following  ┃  │
│  ┃ Panel Color ■ ■ ■ ■ □ ■ [custom]                             ┃  │
│  ┃ ▾ Transform Offset (moves only this section)       [Reset]   ┃  │
│  ┃   [☑ Detached: does not move the following sections]        ┃  │
│  ┃   Starts at [ Wall 2 ▾ ]                                     ┃  │
│  ┃   X Along (mm) [ 0 ]   Y Up (mm) [ 1500 ]  Z Out (mm) [ 0 ]  ┃  │
│  ┃   Tilt X (°) [ 90 ]    Pan Y (°) [ 0 ]     Roll Z (°) [ 0 ]  ┃  │
│  ┃   Rotation origin [ Bottom centre ▾ ]                        ┃  │
│  ┃   ⚠ Section dips 120 mm below the floor   (only when true)   ┃  │
│  ┃ ▸ Advanced                                                   ┃  │
│  ┃     LED side [ Stage side (default) ▾ ]                      ┃  │
│  └──────────────────────────────────────────────────────────────┘  │
│ [+ Add Wall Section]  (unchanged, #add-section-btn; spec 01's       │
│                        #flip-all-sections no longer sits below it)  │
└─────────────────────────────────────────────────────────────────────┘

Drag handle ⋮⋮ and lock 🔓 appear in 3b. Viewport overlay (unchanged positions; the badge text changes):
  Selected: Soffit          or   Selected: 3 sections   or   Selected: Wall 4 (locked, 3b)
```

### 3.3 Controls

All new ids and classes are owned by the module named in section 5.1. Numeric inputs commit on `change`, like the existing fields (D-5). Every user-text interpolation uses `textContent` or attribute setters.

**Section toolbar (`#section-toolbar`, new markup directly before `#wall-sections`, owned by `SectionToolbar`)**

| Control | Id | Type | Label / title | Behaviour | Enabled when | Phase |
|---|---|---|---|---|---|---|
| Selection count | `#section-select-count` | span | `No selection` / `1 selected` / `N of M selected` | mirror of `SELECTION_CHANGED` (section kind only) | always | 3a |
| Select all | `#section-select-all` | button | "All", title "Select all sections (Ctrl/⌘+A)" | `sectionCommands.selectAll()`: every section, locked ones included | ≥ 1 section | 3a |
| Expand all | `#section-expand-all` | icon button | title "Expand all cards" | `SectionListPanel.expandAll()`: removes `collapsed` from every card and updates the collapse map | always | 3a |
| Collapse all | `#section-collapse-all` | icon button | title "Collapse all cards" | `SectionListPanel.collapseAll()` | always | 3a |
| Flip LED side | `#flip-all-sections` (spec 01's id, kept, **moved** here from below `#add-section-btn`; owned by `SectionToolbar` from T12 on) | `button.flip-all-btn` | "⇄ Flip LED side"; title "Flip the LED side of the selected sections" when sections are selected, otherwise "Flip the LED side of every section" | `sectionCommands.flipLedSide()` → `wallController.flipFaceOrientations(ids)` with `ids` = the selected section ids, or every section id when no section is selected (spec 01 CR-5e). Toggles each editable section `stage ↔ reversed`. One rebuild. | ≥ 1 editable target section. Absent if spec 01 T9 has not landed. | 3a |
| Delete | `#section-delete-selected` | icon button | title "Delete selected (Del)" | `sectionCommands.deleteSelected()`: confirm `Delete N section(s)?` (plus ` M detached section(s) starting at them will start at the next attached section instead.` when M > 0, and ` This cannot be undone.` in path B), then `wallController.deleteSections(ids)` | ≥ 1 deletable selected section, and deleting them leaves ≥ 1 attached section. Otherwise disabled with the title "At least one attached section must remain". | 3a |
| Duplicate | `#section-duplicate` | icon button | title "Duplicate (Ctrl/⌘+D)" | `sectionCommands.duplicateSelected()` | ≥ 1 selected | 3b |
| Move up | `#section-move-up` | icon button | title "Move up (changes the layout chain and panel column letters)" | `wallController.moveSection(id, index - 1)` | exactly 1 selected, not first, not locked | 3b |
| Move down | `#section-move-down` | icon button | title "Move down (changes the layout chain and panel column letters)" | `moveSection(id, index + 1)` | exactly 1 selected, not last, not locked | 3b |
| Lock | `#section-lock` | toggle button, `aria-pressed` | "Lock" / "Unlock" | if any selected section is unlocked, lock all selected; otherwise unlock all | ≥ 1 selected | 3b |
| Snap move | `#section-snap-mm` | select | options 1, 5, **10**, 25, 50, 100 (mm) | `gizmo.setSnapIncrements({translateMm})` (spec 03's merge). Applied only while Ctrl/⌘ is held during a drag, to the dragged distance (relative, 6.8). | always | 3b |
| Snap rotate | `#section-snap-deg` | select | options 0.5, 1, **5**, 15, 45 (°) | `gizmo.setSnapIncrements({rotateDeg})` | always | 3b |

**Card header additions (inside `.section-header`)**

| Element | Class | Type | Behaviour | Phase |
|---|---|---|---|---|
| Title button | `.section-title` | existing span, now `role="button"`, `tabindex="0"`, `aria-pressed` = selected | The keyboard target for selection (below). The name is written with `textContent`. The 4K ⚠ is a separate `span.warning-indicator` (no regex, retiring the B-L16 template patch). | 3a |
| Offset badge | `.section-offset-badge` | `span` "⊕" | Visible iff `section.hasOffset`. Its title is `section.offsetSummary`, for example `Offset X 0 · Y 1500 · Z 0 mm · Tilt 90° · Pan 0° · Roll 0° · origin bottom-centre`. | 3a |
| Detached chip | `.section-detached-badge` | `span` "Detached" | Visible iff `section.detached`. Title: "Starts where <host name> starts and does not move the following sections". The legacy `summary` line is unchanged. | 3a |
| Chevron | `.section-toggle` (existing) | div → `button` with `aria-expanded` and `aria-label="Collapse"`/`"Expand"` | **Toggles collapse only** (`stopPropagation`). It never changes the selection. | 3a |
| Delete | `.section-delete` (existing) | button | Unchanged (single id). Hidden when locked (3b). | 3a |
| Drag handle | `.section-drag-handle` | `span` (svg ⋮⋮), title "Drag to reorder (changes the layout chain)" | Pointer-based reorder (not HTML5 drag-and-drop, so it works with touch and with plain CDP mouse events): `pointerdown` + `setPointerCapture`; `pointermove` computes the drop index with `dropIndex(cardRects, clientY, fromIndex)` (a pure function, unit-tested) and shows a 2 px drop line; `pointerup` calls `wallController.moveSection(id, toIndex)`; `pointercancel` cancels, and so does Escape, through the Escape registry at priority 75: `sectionList.reorderActive && (sectionList.cancelReorder(), true)` (07 C42; path B: the same check first in this spec's listener). Hidden when the section is locked or `count === 1`. | 3b |
| Lock | `.section-lock` | `button`, `aria-pressed`, title "Lock section" / "Unlock section" | `wallController.setSectionsLocked([id], !locked)`. `stopPropagation`. | 3b |

**Header click semantics** (`.section-header`, excluding the controls above). `.section-header` gets `user-select: none`, so Shift-click never selects header text.
- **Plain click** (`e.detail <= 1`; clicks with `e.detail > 1` are ignored). `e.detail === 0` covers programmatic clicks (`el.click()`, the harness) and assistive-technology activation. If the section is not the sole selection, select it (replace) and expand it. If it is already the sole selection, toggle collapse. Add selects the new section, so the legacy "click a just-added card's header to collapse it" still collapses.
- **Ctrl-click (⌘-click on macOS).** Toggle membership in the selection (`mode: 'toggle'`). The collapse state does not change.
- **Shift-click.** Select the range from the anchor (the last plain-clicked or toggled section) to this one (`mode: 'range'`, the list convention). The collapse state does not change. In the viewport, Shift **adds** instead (3.4, spec 07 3.7): a list has an order to range over, the 3D view does not.
- **Double-click on the header [3a].** Select the section and **expand it** (re-opening it if the first click of the double-click collapsed it). **[3b]** It also frames the section in the viewport (the same as `F`).
- **Keyboard.** The title button has `tabindex="0"`. Enter or Space does the same as a plain click. With Ctrl/⌘ or Shift held it does the same as the modified clicks. (Path A: these keys are bound with spec 07's `bindButtonKeys`, the `button-like` scope.)
- **ARIA.** `#wall-sections` has `role="list"`; each card has `role="listitem"`; the primary card has `aria-current="true"`; selection state is `aria-pressed` on the title button. No `listbox`/`option` roles are used, because the cards contain inputs and buttons.
- **Hover [3b].** `mouseenter` / `mouseleave` on a card calls `selection.setHover('section:<id>' | null)`, so the viewport shows the hover outline.

**Card content additions (after "Panel Color")**

| Field | Selector | Type | Label | Range / step | Default | Units | Phase |
|---|---|---|---|---|---|---|---|
| Group | `details.section-offset` | `<details>` | summary "Transform Offset (moves only this section)", hint "Moves only this section, after the layout. Following sections are not affected." | Open by default iff `hasOffset` or `detached`. The open state is kept in the panel map. | closed | - | 3a |
| Reset | `.section-offset-reset` | button | "Reset" | `wallController.resetSectionOffsets([id])`. Disabled when the offset is identity (and, from 3b, when the section is locked). | - | - | 3a |
| Detached | `input[type="checkbox"][data-section-flag="detached"]` | checkbox | "Detached: does not move the following sections", title "Starts where its host section starts; the layout chain skips it. Use for soffits, ceilings and risers." | Ticking it sets the host to the nearest attached section above (else below) in the list (6.2.1). Disabled on the last attached section, with the title "At least one section must stay attached". | unchecked | - | 3a |
| Starts at | `select[data-section-flag="anchorId"]` | select | "Starts at", title "The attached section whose start this section shares" | one option per **attached** section, by name, in list order (`value` = section id); shown only while Detached is ticked | the default host (above) | - | 3a |
| Position X | `input[data-offset="position.x"]` | number | "X Along (mm)" | min −100000, max 100000, `step="any"` | 0 | mm | 3a |
| Position Y | `input[data-offset="position.y"]` | number | "Y Up (mm)" | same | 0 | mm | 3a |
| Position Z | `input[data-offset="position.z"]` | number | "Z Out (mm)", title "Toward the stage side of the layout (unchanged by LED side)" | same | 0 | mm | 3a |
| Rotation X | `input[data-offset="rotation.x"]` | number | "Tilt X (°)", title "+ leans the top toward the stage" | min −180, max 180, `step="any"` | 0 | ° | 3a |
| Rotation Y | `input[data-offset="rotation.y"]` | number | "Pan Y (°)", title "+ turns the face from +Z toward +X" | same | 0 | ° | 3a |
| Rotation Z | `input[data-offset="rotation.z"]` | number | "Roll Z (°)" | same | 0 | ° | 3a |
| Rotation origin | `select[data-offset="origin"]` | select | "Rotation origin" | `bottom-center` "Bottom centre", `center` "Centre", `bottom-left` "Bottom left" | `bottom-center` | - | 3a |
| Below-floor warning | `.section-warning.below-floor` | div | "Section dips N mm below the floor" | shown when the transformed min y < −1 mm (6.11) | hidden | mm | 3a |
| Advanced | `details.section-advanced` | `<details>` | summary "Advanced" | closed unless LED side is Reversed | closed | - | 3a |
| LED side | spec 01's `select.section-face-select[data-section-flag="faceOrientation"]`, **moved** from its `.section-row.single` into `details.section-advanced` (selector, class, `aria-label` and title unchanged; spec 01's " • Reversed" summary suffix kept) | select | "LED Side" | `stage` "Stage side (default)", `reversed` "Reversed" | `stage` | - | 3a (absent if spec 01 T9 has not landed) |

`step="any"` keeps every stored value (0.1 mm, 0.01°) valid, so gizmo-written values such as 12.37° never render `:invalid`, and the spinner arrows still step by 1.

The tilt/pan/roll names match the camera panel's Tilt/Pan/Roll. The rotation is applied as pan, then tilt, then roll (intrinsic `YXZ`, the project's Euler convention). The help text says so.

**Write-back after `change`.**
- An empty or non-numeric entry is **not** written: the input reverts to the stored value, and nothing is emitted or rebuilt. This matches spec 03's pivot offset inputs, and B-L9 is not repeated.
- Otherwise the input shows the stored, normalised value. Position is written as `value.toFixed(1)` with any trailing `.0` stripped. Rotation is written with `toFixed(2)`, with trailing zeros stripped.
- A Rotation origin change keeps the section in place (6.9) and writes back the compensated position values.

**Locked card [3b]:** `.wall-section.locked`. Every input, select, checkbox and swatch in the card is `disabled` except the name input and the lock button. The drag handle and delete button are hidden. The offset group shows a "Locked" hint.

**`locked` in 3a: data only.** The `locked` flag is read, validated, kept and written from step A (4.3), but in 3a nothing enforces it: `editable()` ignores it, picking does not click through, and no card shows a lock. A file saved by a 3b build with locked sections therefore opens in a 3a build fully editable and round-trips its flags unchanged. Enforcement and the lock UI arrive together in 3b (T20).

**Batch panel (`#section-batch-panel`, owned by `SectionBatchPanel`) [3a]**
- Visible iff ≥ 2 sections are selected.
- Heading: `Editing N sections`, plus ` · M locked section(s) skipped` when M > 0 (3b). A [Deselect] button clears the selection.
- Fields: the same as the card, without the name: Columns, Rows, Width, Height, Pixels X, Pixels Y, Angle Between Panels, Heading Change, colour swatches plus custom colour, LED side, Detached and Starts at, the six offset fields, Rotation origin, [Reset offsets], and [Lock all] / [Unlock all] (3b).
- **Mixed values:** when the editable selected sections disagree on a field, the input is empty with `placeholder="Mixed"` and `data-mixed="true"`; a select shows an extra disabled first option "Mixed"; the Detached checkbox is `indeterminate`. Otherwise the shared value is shown.
- **Freshness:** the panel re-reads its values on `SELECTION_CHANGED`, `WALL_SECTIONS_CHANGED` and `SECTION_CHANGED`. The single-card paths (`commitSectionEdit` after `setSectionField`, `setSectionColor`, `commitRename`) emit `SECTION_CHANGED` too (5.3), so editing card 1's Columns from 5 to 8 while two sections are selected turns the batch field into "Mixed" at once.
- **Committing:** a numeric field commits only when `raw.trim() !== ''` and `parseFloat(raw)` is finite. An empty or non-numeric entry is a no-op: the input reverts to its previous display (the shared value, or the empty `Mixed` placeholder), and nothing is written. A FIELD_RULES default (B-L9) can therefore never be written to every selected section from an empty input. A valid value is parsed, clamped and written to every **editable** selected section in **one** rebuild (`wallController.batchSetField` / `batchSetColor` / `setSectionOffsetField` / `setSectionsFaceOrientation` / `setSectionsDetached` / `setSectionsAnchor`).
- When every selected section is locked (3b), all inputs are disabled and the panel shows "All selected sections are locked".

"Editable" means the section exists and, from 3b on, is not locked. In 3a every existing section is editable.

### 3.4 Viewport interactions

| Gesture | Result | Notes | Phase |
|---|---|---|---|
| Click on a section (press + release, < 4 px travel, left button) | Select (replace). The outline and a translucent tint are drawn (6.13). The badge reads `Selected: <name>`. The **primary** card is selected, expanded and `scrollIntoView({block: 'nearest'})`. | Uses B-M14's click detection. **Works without a gizmo mode** (an intentional change to N-3, Q8). Hits on the back-shell meshes (spec 01) resolve to their section, so a click from behind selects the section the user sees. | 3a |
| Shift-click on a section | **Add** it to the selection (`mode: 'add'`, spec 07 3.7); an already selected section stays selected. The gizmo moves to the median rotation origin. Only the primary card is expanded and revealed. | Mixing kinds is not allowed: selecting a section clears a camera, prop, pivot or HDRI-point (`'hdri-point'`, kind `'projector'`) selection, and the other way round. A modified click on empty space changes nothing. | 3a |
| Ctrl-click (⌘-click on macOS) on a section | **Toggle** membership (`mode: 'toggle'`). | `mod(e) = isMac ? e.metaKey : e.ctrlKey` (spec 07 6.4). On macOS, Ctrl-click is the system secondary click: it counts as a plain click, and the canvas `contextmenu` event is `preventDefault`ed so no menu opens. | 3a |
| Click on empty space | Deselect all (legacy miss). | | 3a |
| Release outside the canvas after a press on it | Nothing. The press record is cleared by a `window` `mouseup` and by the canvas `mouseleave`, so a later release over the canvas can never complete a stale click. | Path B (5.2). Path A: CR-07-b asks spec 07's press record for the same rule (`pointerup`/`pointercancel` on `window`). | 3a |
| Click on a locked section | Click-through: the next resolved hit behind it is used, otherwise empty space. | Locked sections can still be selected from the list. In 3a `locked` is inert (3.3). | 3b |
| Press-drag-release more than 4 px | Orbit only. Selection unchanged. | B-M14. | 3a |
| `G` / `R` with sections selected | Translate or rotate gizmo at the primary rotation origin (one section) or the median rotation origin (several). In local space (`L`) the **translate** arrows follow the section frame (X Along, Y Up, Z Out), the axes of the numeric fields, and the **rotate** rings follow the section's current orientation (frame × rotation offset). | The existing toolbar buttons and keys. Orientation by mode: 6.8. Path B: for section targets the gizmo is scaled with camera distance so its arrows stay at least 90 px long (6.13; `gizmo.updateScale` registered with `addPreRender`, 07 C46); camera, prop and pivot targets keep the legacy fixed size. Path A: `TransformControls` is screen-sized already. | 3a |
| Gizmo translate drag | Live: only the dragged sections move (fast path, no rebuild). Card offset inputs update live. With several sections, each receives the **same world delta**. | World space: the stored offset is `start + 1000·Bᵀ·Δ`. Local space: one arrow changes exactly one position field. | 3a |
| Gizmo rotate drag | Live rotation about each section's own rotation origin ("individual origins"). | Euler fields stay continuous with the drag start (6.10). | 3a |
| Release | One full rebuild: frames, safe distance, hub refresh and debug views re-sync. The orbit target does not move (6.11). | | 3a |
| `Escape` during a drag | Cancel: offsets are restored to the pre-drag values, then one rebuild if anything moved. The selection is kept. | Spec 03's Escape order: `gizmo.cancelDrag()` → `endGizmoDrag({cancel: true})` (3.5). | 3a |
| Ctrl/⌘ held during a gizmo drag | Snap (6.8, spec 03 D9): the dragged **distance** along the dragged axis is a multiple of the snap mm in both world and local space; the dragged **angle** is a multiple of the snap degrees. Values not dragged keep their stored value. | Read from the mouse event's `ctrlKey \|\| metaKey` (path B) or `interaction.snapHeld` (path A). | 3b |
| Hover over a section (no button held) | Thin hover outline (6.13). Canvas `cursor: pointer`. The card gets `.hovered`. | One raycast per animation frame. Uses the same nearest-hit list as clicking, so hovering the person, the camera body, the pivot marker or a gizmo handle outlines nothing. Never shown while a button is held, during a gizmo drag, in pilot mode, or after the pointer left the canvas. | 3b |
| Double-click a section | Select it and frame it (`F`; `orbit.frame` in path A). | | 3b |

### 3.5 Keyboard shortcuts

**Placement.**
- **Escape:** this spec adds **no** viewport Escape branch. Spec 03 (landed first) already runs the ungated order of 03 3.4: an active gizmo drag is cancelled with `gizmo.cancelDrag()` (which calls `target.endGizmoDrag({cancel: true})`) and the selection is kept; otherwise pilot exits; otherwise deselect and clear the mode. Spec 07's Escape chain (07 3.8: 80/75/70/60/40/0) has the same order. Section targets implement `endGizmoDrag({cancel: true})` as "restore the pre-drag offsets" (5.5). The one addition is 3b's sidebar reorder drag: Escape cancels it through registry priority 75 (07 C42), registered by T21.
- **Path A (spec 07 I1 landed; recommended):** the 3b keys are the existing `KEYMAP` rows of 07 3.8: `sections.delete` (`Delete`/`Backspace`, `notInPilot`, and only when the target is `#three-canvas`, `body`, `#wall-sections` or `#section-toolbar`, so a focused toolbar button never deletes; 07 C44), `sections.selectAll` (`mod+A`, `viewportOnly`, `notInPilot`), `sections.duplicate` (`mod+D`, `notInPilot`, `preventDefault`), `sections.prev` / `sections.next` (`BracketLeft`/`BracketRight` by `e.code`, `notInPilot`), and `F` = 07's own `view.frame`. This spec only registers the actions with `viewportInput.registerActions({...})`, calling `sectionCommands`. No listener is added (07 rule S5), and 07's `KeyboardState` already ignores Ctrl/Cmd/Alt.
- **Path B (fallback):** the 3b keys live in a separate `document` `keydown` listener, `ViewportInput.attachSectionShortcuts()`, registered after `attachShortcuts` and after spec 01's `bindShortcuts()` (the spec 01 pattern; the legacy listener order is unchanged). It calls the injected `sectionCommands` (5.2), never `WallController` directly. It moves into `KEYMAP` when 07 I1 lands.
  - **Guards:** ignore when `isTypingTarget(e.target)`, when `e.repeat`, and in pilot mode. Plain keys (F, [, ], Delete, Backspace) also require `!e.ctrlKey && !e.metaKey && !e.altKey`. The Ctrl/⌘ keys require `mod(e) && !e.altKey && !e.shiftKey`. `Ctrl/⌘+A` also requires the target to be the canvas or `body` (07's `viewportOnly`). Delete and Backspace also require the target to be `#three-canvas`, `body`, `#wall-sections` or `#section-toolbar` (07 C44).
  - **Matching:** letters use `e.key.toLowerCase()`, like G/R/L/P, N (spec 01) and O (spec 03), so AZERTY and Dvorak users press the key that is labelled F, D or A. The bracket keys are the documented exception (below).
  - **`KeyboardState` change (T25):** its keydown handler ignores keydowns with `ctrlKey || metaKey || altKey` (07 5.4.4's rule). Otherwise Ctrl/⌘+D and Ctrl/⌘+A would record `KeyD` and `KeyA` and orbit while the keys are held. On macOS, keyups of other keys are not delivered while ⌘ is held, which would leave the key stuck. Keyups are always processed. No existing harness step presses Ctrl/⌘ with W, A, S, D, Q, E or an arrow key.

| Key | Action | Matching and conflicts | Phase |
|---|---|---|---|
| `Escape` | Spec 03's order (above). During a section drag: the pre-drag offsets are restored and the section stays selected. | No change by this spec. | 3a (behaviour), owned by spec 03 |
| `F` | Frame the selection, or the whole wall when nothing is selected (6.14) | `e.key` `f`. Free in the post-Phase-3 keymap. No browser binding without Ctrl. Path A: 07's `view.frame`. | 3b |
| `[` / `]` | Select the previous / next section (wraps). With no section selected, `]` selects the first section and `[` the last. | Matched by **physical key** (`e.code` `BracketLeft` / `BracketRight`, the two keys to the right of P on every ANSI/ISO keyboard), as in many DCCs. On layouts where those keys print other characters (AZERTY: `^ $`), the physical keys still work. Help text shows them as `[ ]`. | 3b |
| `Ctrl/⌘+D` | Duplicate the selected sections; `preventDefault()` | `e.key` `d`. Prevents the browser bookmark dialog. | 3b |
| `Ctrl/⌘+A` | Select all sections; `preventDefault()` | `e.key` `a`. Only on the canvas or `body`, so text select-all keeps working everywhere else. | 3b |
| `Delete` / `Backspace` | Delete the selected sections, after a confirm. A **no-op** when the selection is not sections (camera, prop, pivot, HDRI point). | `e.key`. Not bound today. Ignored while typing, and unless the target is `#three-canvas`, `body`, `#wall-sections` or `#section-toolbar` (07 C44). | 3b |
| Ctrl/⌘ held during a gizmo drag | Snap | Read from the mouse event (path B) or `interaction.snapHeld` (path A). Not a keydown shortcut. | 3b |

#### 3.5.1 Post-Phase-3 keymap (conflict check)

In path A the single registry is spec 07's `KEYMAP` (07 3.8), and its uniqueness test covers every chord. This table is the conflict check for path B and lists the same chords.

| Key | Owner | Action | Matched by |
|---|---|---|---|
| G / R / L / P | legacy | translate / rotate / space / pilot | `e.key` |
| Escape | legacy + spec 03 | cancel drag → exit pilot → deselect and clear mode | `e.key` |
| W A S D, arrows, Q E | legacy `KeyboardState` | orbit offset / pilot fly | `e.code` |
| N, Shift+N | spec 01 | normal lines / cycle shading | `e.key` |
| O | spec 03 | toggle pivot selection | `e.key` |
| F, `[`, `]`, Ctrl/⌘+D, Ctrl/⌘+A, Delete, Backspace | spec 02 (3b) | 3.5 | `e.key` (brackets: `e.code`) |
| Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y | spec 07 (H2) | undo / redo (the single `History`) | `e.key` |
| U | spec 04 | UV viewer | `e.key` |
| H, Shift+H, `,`, `.` | spec 05 | HDRI content / backdrop / yaw nudge | `e.key` (comma, period: `e.code`) |
| M | spec 09 | measure tool | `e.key` |

**Help text: no badge change.** This spec does **not** edit `.info-badge` (which sits inside every canvas screenshot clip, so each edit would re-baseline every canvas screenshot in every scenario). Per-feature tokens are frozen (07 C35): only spec 01 adds one (` N=normals`, in its own F1-2 step); specs 03, 04 and 05 add none; 07 I4a rewrites the badge once (`Drag to rotate • Right-drag to pan • Scroll to zoom • WASD to move • G/R/L/P • ? all shortcuts`). This spec's keys are documented in:
- the button titles (Select all "(Ctrl/⌘+A)", Delete "(Del)", Duplicate "(Ctrl/⌘+D)", Move up/down);
- the README "Editing sections" section (T16, T28);
- path A: spec 07's generated `?` shortcut help (`ShortcutHelp`, built from the `KEYMAP` rows).

### 3.6 Feedback, empty and error states

| State | Feedback |
|---|---|
| No selection | Toolbar: count `No selection`; Delete (and Duplicate, Move, Lock in 3b) disabled. Batch panel hidden. Badge hidden (legacy). |
| One section selected | Card `.selected.primary`; outline and tint; badge `Selected: <name>` (plus ` (locked)` in 3b). |
| N ≥ 2 selected | Cards `.selected` (one `.primary`); outlines and tints (the primary in the primary colour); badge `Selected: N sections`; batch panel visible. |
| Selected section renamed or (un)locked | The badge follows: `ViewportToolbar` mirrors `SECTION_CHANGED` with `fields` containing `name` or `locked` when a changed id is selected. |
| Locked section clicked in the viewport [3b] | Click-through. Locked sections can still be selected from the list, and then show `(locked)` and no gizmo (`allowedAxes` gives no axis). |
| File with `locked: true` opened in a 3a build | Kept and re-saved unchanged; no effect and no indicator until 3b (3.3). |
| Batch edit with some sections locked [3b] | Edits apply to the unlocked ones. The panel heading shows "M locked section(s) skipped". |
| Delete would leave no attached section | The toolbar delete is disabled with the title "At least one attached section must remain". The Delete key shows the alert `At least one attached section must remain.` and deletes nothing (no partial delete). |
| Delete a host of detached sections | The confirm text names the count; the dependants are re-anchored to the next attached section (else the previous one) without moving when possible (6.2.1). Their "Starts at" selects update. |
| Detach a host | Its dependants are re-anchored the same way, without moving. No dialog. |
| Reorder [3b] | No toast. The tooltips on Move and the drag handle warn "changes the layout chain and panel column letters". Detached sections keep their host (by id), so they move with it. |
| Offset makes the section dip below the floor | Card warning (3.3). Nothing is clamped. |
| Offset pushes a section away from its neighbours | No warning (intended). The hint in the offset group explains it. |
| Detached section | Header chip "Detached" (title adds `· starts at <host name>`). The safe-distance band treats it as its own floor run, or skips it when it faces up or down. |
| Empty or non-numeric entry | The input reverts to the stored value. No alert, no rebuild. |
| Import with invalid offset values | Values are sanitised by the validator (4.2). After import, one report lists up to 5 adjustments: `Imported with adjustments:\n• sections[2].offset.rotation_deg.x: not a number, set to 0` (path B: an alert; path A: spec 07's import report). |
| Pilot mode | No picking or hover (legacy guard). Escape exits pilot. |
| A rebuild removed a selected section (delete) | `selection.prune()` (path A: `revalidate()`) after the rebuild. Import first deselects any section selection (5.4; path A: `ProjectSession.apply` step 2). |

### 3.7 Workflows (help text and README)

The first three workflows need the Detached flag (T17, in 3b by default, Q25), and their help text ships with T17. Where a row distinguishes "3a" (Add a section) from "3b" (Duplicate), both variants work once T17 has shipped. The last two workflows need only 3a.

| Goal | Steps | Result |
|---|---|---|
| **Soffit above a wall section** | **3a:** Add a section (it appears at the end of the list). Give it Wall 2's columns, panel width, curve and Heading Change. Tick **Detached** and set **Starts at** = Wall 2. Set Rows 1, **Y Up** = Wall 2's height in mm (3 rows × 500 = 1500), **Tilt** 90. **3b:** Duplicate Wall 2 (the copy has all its fields), tick Detached (the host defaults to Wall 2, the attached section just above the copy), then Rows 1, Y Up 1500, Tilt 90. | The soffit starts exactly where Wall 2 starts (same position and heading), lies flat at the top of Wall 2 and faces down toward the floor. The following sections are not moved, and there is no hole. Reordering or deleting other sections never moves it; deleting Wall 2 re-anchors it without moving it (6.2.1). |
| **Ceiling over the volume** | Add a section, tick Detached, pick **Starts at** = the section where the ceiling should start, set Tilt 90, Y Up = ceiling height, and position it with X Along and Z Out. | Same as above, anywhere in the volume. |
| **Riser strip in front of a wall** | Add (3a) or duplicate (3b) a section like the wall, tick Detached with Starts at = the wall, set Rows 1, Tilt −90 (faces up), Z Out = setback in mm. | A floor-facing strip in front of the wall. The safe-distance band skips it (it faces up). |
| **Wall on a riser, leaning back** | On the wall itself (not detached): Y Up 250, Tilt −5. | Only this section moves; the following sections keep their generative place (a small gap at the junction is expected). |
| **Corner angle correction** | Use **Heading Change**, not Pan. | The chain stays closed. |

---

## 4. Data model

### 4.1 Domain

**New module `js/domain/SectionOffset.js`**

```js
export const RotationOrigin = Object.freeze({
  BOTTOM_CENTER: 'bottom-center',   // default: chord midpoint at the section's base
  CENTER: 'center',                 // chord midpoint at half the section height
  BOTTOM_LEFT: 'bottom-left',       // the section's first bottom edge vertex (edges[0])
});
export const ROTATION_ORIGINS = Object.freeze(Object.values(RotationOrigin));
export const OFFSET_LIMITS = Object.freeze({ positionMm: 100000, rotationDeg: 180 });

export class SectionOffset {
  // Private state: no public field can be assigned from outside js/domain/ (rule 10 has nothing to allow).
  #position = { x: 0, y: 0, z: 0 };   // millimetres, section frame (x along chord, y up, z = generative front)
  #rotation = { x: 0, y: 0, z: 0 };   // degrees, intrinsic Euler 'YXZ' in the section frame (pan y, then tilt x, then roll z)
  #origin = RotationOrigin.BOTTOM_CENTER;

  get position()                  // frozen copy {x, y, z}
  get rotation()                  // frozen copy {x, y, z}
  get origin()
  /** All six components === 0 (the origin is irrelevant for an identity offset). */
  get isIdentity()
  clone()                         // deep copy
  equals(other)                   // component-wise ===, origin ===
  /** Tolerant constructor used by WallSection and the validator: missing/invalid components become 0,
   *  an unknown origin becomes BOTTOM_CENTER. Accepts a SectionOffset, a domain-shaped object
   *  {position, rotation, origin} (position in MILLIMETRES), or undefined. Never throws. The serializer converts the
   *  file's offset.position_m (metres) with mm = Math.round(m * 10000) / 10 before calling it (4.3, spec 07 4.6). */
  static from(raw)
  static identity()
  /** Normalisers (applied to an already-parsed number). Rotation is ROUNDED FIRST, then wrapped, then rounded again
   *  (to remove the float noise of the wrap), so the stored value is always on the 0.01° grid AND inside (-180, 180]:
   *  position: v => Number.isFinite(v) ? normZero(Math.round(clamp(v, -100000, 100000) * 10) / 10) : 0
   *  rotation: v => { if (!Number.isFinite(v)) return 0; let r = round2(wrap180(round2(v))); if (r === -180) r = 180;
   *                   return normZero(r) }        // -179.996 -> round2 -> -180 -> wrap -> 180 (never -180)
   *  origin:   v => ROTATION_ORIGINS.includes(v) ? v : RotationOrigin.BOTTOM_CENTER
   *  round2(v): Math.round(v * 100) / 100
   *  wrap180(v): r = ((v % 360) + 360) % 360; return r > 180 ? r - 360 : r     // range (-180, 180]
   *  normZero(v): v + 0   (turns -0 into +0) */
  static RULES
  /** Numeric paths: v = typeof raw === 'number' ? raw : parseFloat(raw); Number.isFinite(v) ? v : null.
   *  '' and 'abc' give null (no B-L9 default). 'origin': the string itself. */
  static parse(path, raw)
  /** path: 'position.x' | 'position.y' | 'position.z' | 'rotation.x' | 'rotation.y' | 'rotation.z' | 'origin'.
   *  parse === null -> writes nothing and returns null. Otherwise stores RULES(...) and returns the stored value. */
  set(path, raw)
  setPosition({ x, y, z })        // each through RULES.position (used by drags)
  setRotation({ x, y, z })        // degrees, each through RULES.rotation (used by drags)
  assign(other)                   // copy every value from another SectionOffset (cancel, undo)
  reset()                         // position and rotation to 0; the origin is kept
  /** Origin change that keeps the placement: the caller (WallController) computes the compensated position with
   *  geometry/SectionTransform.compensateOriginChange (6.9), because the domain cannot import geometry. */
  setOriginKeepingPlacement(origin, positionMm)
}
```

**`js/domain/WallSection.js` (changed)**
- `SECTION_FIELDS` gains `'offset'`, `'locked'`, `'detached'` and `'anchorId'`, appended at the end (after spec 01's `'faceOrientation'`), so existing key order is kept. (Spec 07 4.1 lists `'offset'` and `'locked'`; `'detached'` and `'anchorId'` are added by change request CR-07-a.)
- The constructor assigns `this.offset = SectionOffset.from(fields.offset)`, `this.locked = fields.locked === true`, `this.detached = fields.detached === true` and `this.anchorId = this.detached && Number.isInteger(fields.anchorId) ? fields.anchorId : null`. Every section always holds its own `SectionOffset` instance, never a shared reference. `offset` is never reassigned after construction.
- New methods: `setLocked(on)` (`this.locked = on === true`); `setDetached(on, anchorId = null)` (`this.detached = on === true; this.anchorId = this.detached && Number.isInteger(anchorId) ? anchorId : null`); `setAnchor(anchorId)` (only while detached; integer or `null`). The **choice** of a host (6.2.1) is made by `Wall` and `WallController`, never by the section itself.
- `createDefault()` and `Wall.appendLikeLast()` give `offset: SectionOffset.identity()`, `locked: false`, `detached: false` and `anchorId: null`. This matches legacy add, which resets `angleOffset` to 0: offsets and the Detached flag are not copied from the last section. (`faceOrientation` is copied, per spec 01.)
- New `clone({ id, name })` returns a `WallSection` with every field copied (offset deep-copied; `faceOrientation`, `detached` and `anchorId` copied, so a copy of a soffit shares its host; `locked: false`).
- New getters `hasOffset` (`!this.offset.isIdentity`) and `offsetSummary` (the badge title in 3.3).
- The legacy getters (`summary`, `curveHint`, `exceeds4K`, ...) are unchanged.

**`js/domain/Wall.js` (changed)**: all mutators replace the array, like `removeById` does.
```js
findById(id)                    // sections.find(s => s.id === id) ?? null
indexOfId(id)                   // sections.findIndex(s => s.id === id)
attachedCount()                 // sections.filter(s => !s.detached).length
/** 6.2.1. The host a newly detached section gets: the nearest attached section ABOVE `id` in list order, else the
 *  nearest attached section BELOW it, else null. `pendingDetached` (Set of ids) counts as detached (batch edits). */
defaultAnchorFor(id, pendingDetached = new Set())
/** 6.2.1. Where the dependants of `hostId` go when the host is deleted or detached: the nearest attached section AFTER
 *  the host in list order (it inherits the host's start exactly), else the nearest attached section BEFORE it, else null.
 *  `excluded` (Set of ids) are treated as absent or detached (the sections being deleted or detached). */
reanchorTargetFor(hostId, excluded = new Set())
dependantsOf(hostId)            // sections.filter(s => s.detached && s.anchorId === hostId)
/** Inserts `section` at `index` (clamped to [0, count]); this.#sections = [...copy with insertion]. */
insertAt(index, section)                                                       // 3b
/** Moves the section with `id` to `toIndex` (clamped); no-op if absent or already there. @returns {boolean} moved */
move(id, toIndex)                                                              // 3b
/** For each id in LIST ORDER (not argument order), locked sources included (copying does not modify the source):
 *  copy = section.clone({ id: this.nextSectionId++, name: uniqueCopyName(section.name, takenNames) }) inserted directly
 *  after its source (after earlier copies of the same pass). @returns {WallSection[]} the copies in list order */
duplicate(ids)                                                                 // 3b
/** LEGACY(B-L2, B-M10) flat bounds, now skipping sections with detached === true (identical when none is detached):
 *  a detached soffit must not widen the flat framing rectangle that coverage still reads. */
flatBounds()
```
`uniqueCopyName(name, taken)` produces `"${name} copy"`, then `"${name} copy 2"`, `"${name} copy 3"`, and so on. The base name is truncated so the result is ≤ 32 characters (the name `maxlength`). This avoids B-L14 collisions for copies.

**`js/domain/LogoLibrary.js` (changed, 3b)**: `copy(fromId, toId)` creates a new entry `{ image, position, scale }` for `toId`, sharing the `Image` and copying the position and scale. No-op when `fromId` has no entry.

**Non-persisted editor state** (deliberately not in the domain or the JSON):

| State | Owner | Writers |
|---|---|---|
| selected ids, primary id, range anchor | `SelectionManager` (`#ids: string[]`, `#primary`, `#anchor`) | `select`, `selectMany`, `deselect`, `prune` |
| hover id, hover-pickable flag (3b) | `SelectionManager.#hover`, `#hoverPickable` | `hoverAt`, `setHover`, `clearHover` |
| drag session | `WallController.#drag` | `beginSectionDrag`, `dragSections`, `endSectionDrag` |
| drag accumulation (path B only: the hand-written gizmo passes increments) | `WallSectionSelectable.#acc`, `#accDeg` | `beginGizmoDrag`, `applyGizmoTranslate`, `applyGizmoRotate` |
| last layout | `WallController.#currentLayout` | `rebuild`, `dragSections`, `#invalidate` (sets `null`; read lazily) |
| press record (path B) | `ViewportInput.#press` | canvas `mousedown`; cleared by canvas `mouseup`, `window` `mouseup` and canvas `mouseleave` |
| card collapsed map, offset-group and advanced-group open maps | `SectionListPanel.#collapsed`, `#offsetOpen`, `#advancedOpen`: `Map<id, boolean>` | panel handlers; reset on import |
| snap increments (3b) | `InteractionState.snap.translateMm` (10) and `.rotateDeg` (5), the keys spec 03 already defines next to its `pivotM` | `TransformGizmo.setSnapIncrements(partial)` (merge; called by `SectionToolbar`) |
| framing zoom limit (3b, path B only) | `OrbitController.#zoomMax` (30 = legacy) | `frameSphere`, `setView('reset')` |

### 4.2 Validation (`ProjectValidator`: the Phase 2 B-L8 fix in path B, spec 07 D2 in path A; extended)

The validator calls the same `SectionOffset.RULES` functions as the UI and the gizmo, so every value a writer can produce is inside the validator's range (spec 07 4.3 reachability rule) and Save then Open never changes a project.

| Path | Accepts | Sanitisation (with a warning entry when the key was present but invalid) |
|---|---|---|
| `offset` | object or absent | absent: identity, no warning. Non-object: identity, warning. |
| `offset.position_m.{x,y,z}` | finite number or numeric string | `parseFloat`, then `mm = Math.round(m * 10000) / 10` (spec 07 4.6), then `SectionOffset.RULES.position` (clamp ±100000 mm, 0.1 mm). Non-finite: 0. |
| `offset.rotation_deg.{x,y,z}` | finite number or numeric string | `parseFloat`, then `RULES.rotation` (round to 0.01°, wrap into (−180, 180]; spec 07's `wrapped` info when the value changed only by wrapping). Non-finite: 0. |
| `offset.rotation_order` | absent or `'YXZ'` | Anything else: rotation reset to 0, warning ("only YXZ is supported"). |
| `offset.frame` | absent or `'section'` | Anything else: offset reset to identity, warning. (Reserved for a future `'world'` frame.) |
| `offset.rotation_origin` | one of `ROTATION_ORIGINS` | Anything else: `'bottom-center'`, warning. |
| `locked` | boolean | `=== true`. Non-boolean: `false`, warning. |
| `detached` | boolean | `=== true`. Non-boolean: `false`, warning. |
| `anchor_section_id` | integer or `null` | Read **after** id reassignment (spec 07 6.8 keeps the first occurrence of each id, so a reference keeps pointing at it). Not detached: always `null` (no warning). Detached and the value is not the id of an attached section: replaced by `defaultAnchorFor` (6.2.1), warning. |
| all sections detached | - | The first section becomes attached (`detached: false`, `anchor_section_id: null`), warning ("at least one section must stay attached"); the others' anchors are then validated. |
| unknown keys inside `offset` (for example a future `propagate`) | ignored | warning (spec 07: `dropped-unknown`). Not round-tripped. |

### 4.3 Project JSON schema v2 (fields this spec adds)

The v2 envelope (`"version": "2.<revision>"`, `"format": "morph-led-project"`, camera, props, display, `pivot` from spec 03, and so on) belongs to spec 07 (D4) in path A and to the B-L31 fix in path B. This spec adds four keys to every element of `sections[]`, with spec 07's key style (snake_case; `_m` for world offsets, C3). The keys are absent until this feature's own landing commit (step A, 07 C39); from then on they are **always written**, including identity values, so external pipeline tools can rely on them (Q13). `locked`, `detached` and `anchor_section_id` are written from the first step (A), even though the lock UI is 3b (and even if Q25 moves Detached to 3b), so the JSON goldens change once. Path A: each row below is also a row of spec 07's `io/ProjectSchema.js` and its 4.3 field table (07 4.4 protocol: **one** revision bump for this feature release, its number assigned at merge time and recorded in `ProjectSchema.REVISIONS`, 07 C40; "absent means default"; round-trip and reachability tests).

**Persisted key names (Q24, to settle with the owner before step A).** Spec 07 C3 is binding: `position_m`, not `position_mm`. For the rotation origin this spec keeps `rotation_origin`, as spec 07 0.2 says ("the other `offset` leaves are unchanged"); spec 07's 4.2 skeleton line `"pivot": "bottom-center"` predates that edit, and CR-07-a asks spec 07 to correct it, because `pivot` would collide with spec 03's top-level `pivot` in every reader's mind.

| Dotted path | Type | Default | Range / values | Meaning | Writers |
|---|---|---|---|---|---|
| `sections[].offset.position_m.x` | number | 0 | [−100, 100] m on the 0.0001 m (0.1 mm) grid | Along the section chord (section frame X) | card, batch, gizmo (`SectionOffset.RULES.position`, then `Math.round(mm * 10) / 10000`) |
| `sections[].offset.position_m.y` | number | 0 | same | World up | same |
| `sections[].offset.position_m.z` | number | 0 | same | Generative front of the section (section frame Z), independent of `face_orientation` | same |
| `sections[].offset.rotation_deg.x` | number | 0 | (−180, 180], 0.01° | Tilt about the section X axis | card, batch, gizmo (`RULES.rotation`) |
| `sections[].offset.rotation_deg.y` | number | 0 | same | Pan about Y | same |
| `sections[].offset.rotation_deg.z` | number | 0 | same | Roll about the section Z axis | same |
| `sections[].offset.rotation_order` | string | `"YXZ"` | `"YXZ"` only | Intrinsic order: pan, then tilt, then roll | constant |
| `sections[].offset.frame` | string | `"section"` | `"section"` only | The axes the offset is expressed in (6.3) | constant |
| `sections[].offset.rotation_origin` | string | `"bottom-center"` | `"bottom-center" \| "center" \| "bottom-left"` | Rotation origin (6.4) | card, batch |
| `sections[].locked` | boolean | `false` | | Edit lock (enforced from 3b) | 3b lock UI; kept as read in 3a |
| `sections[].detached` | boolean | `false` | at least one section is attached | Does not advance the layout chain (6.2) | card, batch |
| `sections[].anchor_section_id` | integer \| null | `null` | the id of an attached section while `detached`; `null` otherwise | The host: the detached section starts where this section starts (6.2) | card, batch, `WallController` re-anchoring (6.2.1) |

The conversion `mm ↔ m` is exact on the 0.1 mm grid (|round(mm·10)| ≤ 10⁶, far below 2⁵³), so a file is byte-stable after its first save (spec 07 4.6).

Example section in a v2 file (key position: after `curvature` and spec 01's `face_orientation`, before `color`, matching spec 07's 4.2 skeleton; the harness ignores key order):
```json
{
  "name": "Soffit",
  "id": 3,
  "panel": { "columns": 5, "rows": 1, "width_mm": 500, "height_mm": 500 },
  "led_resolution": { "x": 32, "y": 32, "pixel_pitch_mm": 15.63 },
  "curvature": { "type": "flat", "angle_degrees": 0, "angle_offset_degrees": 0 },
  "face_orientation": "stage",
  "offset": {
    "position_m": { "x": 0, "y": 1.5, "z": 0 },
    "rotation_deg": { "x": 90, "y": 0, "z": 0 },
    "rotation_order": "YXZ",
    "frame": "section",
    "rotation_origin": "bottom-center"
  },
  "locked": false,
  "detached": true,
  "anchor_section_id": 1,
  "color": "#d9d9d6"
}
```
The ZIP's JSON is written by the same serializer (`variant: 'zip'`), so it carries the same keys (B-M3 is already fixed by v2). Spec 07's `history` and `autosave` variants carry them too (none of them is view-only).

### 4.4 Migration

| Input | Result |
|---|---|
| v1 file (`version: "1.0"` or missing) | Every section gets `SectionOffset.identity()`, `locked: false`, `detached: false` and `anchorId: null`. No warnings. (Path A: spec 07 4.6 "feature defaults".) |
| v2 file without `offset` / `locked` / `detached` / `anchor_section_id` on a section | Identity / `false` / `false` / `null`. No warnings. |
| v2 file with invalid values | Sanitised per 4.2. Warnings are shown once after import. |
| Writing | Always v2 with the four keys. No v1 writer is kept, because the v2 writer (07 D4 or B-L31) owns the version bump. |

---

## 5. Architecture

### 5.1 Modules added and changed

| Path | Layer | New / changed | Responsibility in this feature | Phase |
|---|---|---|---|---|
| `js/core/sectionIds.js` | core | **new** | The pure id helpers `sectionSelectableId(id)` and `sectionIdOf(selectableId)`. They live in `core/` so that `ui/` (`SectionListPanel`, `SectionBatchPanel`), `app/`, `render/` and `interaction/` may all import them (ARCHITECTURE 2.1 layering table). | 3a |
| `js/core/renderOrder.js` | core | **new only if spec 01 has not landed** | Spec 01's whole `RENDER_ORDER` registry, identical names and values (spec 01 is its single source) | 3a |
| `js/domain/SectionOffset.js` | domain | **new** | `SectionOffset`, `RotationOrigin`, `OFFSET_LIMITS`, normalisation rules | 3a |
| `js/domain/WallSection.js` | domain | changed | `offset`, `locked`, `detached`, `anchorId`, `setLocked`, `setDetached`, `setAnchor`, `clone`, `hasOffset`, `offsetSummary` | 3a |
| `js/domain/Wall.js` | domain | changed | `findById`, `indexOfId`, `attachedCount`, `defaultAnchorFor`, `reanchorTargetFor`, `dependantsOf`, `flatBounds` detached rule (3a); `insertAt`, `move`, `duplicate`, `uniqueCopyName` (3b) | 3a/3b |
| `js/domain/LogoLibrary.js` | domain | changed | `copy(fromId, toId)` | 3b |
| `js/geometry/SectionTransform.js` | geometry | **new** | Pure math: section frame, rotation origin, offset matrix, Euler YXZ (principal and nearest), axis-angle, gizmo delta conversion and relative snapping, origin compensation, mat4/mat3 helpers (plain arrays, column-major like `THREE.Matrix4.elements`) | 3a |
| `js/geometry/WallLayout.js` | geometry | changed | The two-pass walk with Detached hosts (6.2); `applySectionOffsets(out)` **after** `translated()`, on the translated section frame (6.6, 07 C32); `SectionLayout.frame` and `detached`; transformed `bounds()` (`FramingPolicy`'s `wallBox`); `generativeBounds()` amended to the attached sections (`generativeBox`, 6.11, 07 C34); `indexOfSection(id)`, `sectionBounds(i)`, `originWorld(i)`, `sectionPerimeter(i)`, `panelQuads()`, `floorRuns()`; the `firstEdge`/`lastEdge` amendments | 3a |
| `js/geometry/WallMeshBuilder.js` | geometry | changed | Applies `postTransform` to positions and normals; `panelWorldMatrix`. Consumes 08 P2-7's vertex ranges in `combinedGrid` and `sectionRangeForFace` (their owner, 07 C52; spec 04 consumes them too). Spec 01's `panelShell(sl)` is **unchanged** (base-layout coordinates; the view applies the matrix). | 3a |
| `js/io/ProjectSerializer.js` (+ `ProjectValidator`; path A: + `ProjectSchema.js`) | io | changed | v2 `offset` (with the `position_m` conversion) / `locked` / `detached` / `anchor_section_id` write and read (4.3, 4.2) | 3a |
| `js/io/ObjExporter.js`, `js/io/GltfExporter.js` | io | changed | Pass `sl.postTransform` to `panelCorners` / `panelFacingNormal` (strip grids are already transformed by the builder) | 3a |
| `js/render/LEDWallView.js` | render | changed | Panel and frame composition, extended `sectionNodes()`, `updateSectionTransforms` fast path (incl. the panel-mode shell **matrix**, spec 01 6.9); consumes spec 01 T10's `pickMeshes()` (LED and back-shell meshes; 07 C52) | 3a |
| `js/render/SectionHighlightView.js` | render | **new** | Two-tone selection outlines (06 D15: halo plus dashed core from closed `THREE.Line` geometry, never `LineLoop`) and translucent tints (3a), hover outline (3b); helpers; `RENDER_ORDER.HIGHLIGHT_HALO` / `SECTION_HIGHLIGHT` | 3a |
| `js/render/SafeDistanceView.js` | render | changed | Builds the band per `layout.floorRuns()` entry (with σ) instead of once over `flatEdges()`; with P2-5b it calls spec 08's band builder once per run | 3a |
| `js/render/NormalsDebugView.js` | render | changed (spec 01 module) | Subscribes `SECTION_CHANGED` with `live === true` (spec 01 5.2's handler, under this spec's constant) | 3a |
| `js/interaction/InputState.js` | interaction | changed (path B only) | `KeyboardState` ignores keydowns with Ctrl/⌘/Alt (3b). `InteractionState.snap` already exists (spec 03). | 3b |
| `js/interaction/SelectionManager.js` | interaction | changed (path B); spec 07 I2's v2 in path A | Path B: kinds, pick providers, multi-selection (`'replace' \| 'add' \| 'toggle' \| 'range'`), click picking (3a), hover picking (3b), `prune`, origin-tagged events, the observer call points (07 C37). Path A: only the hover bodies of 07's single hover raycast (3b, T23); `addObserver`/`addHoverHitObserver` are 07 I2's. | 3a |
| `js/interaction/TransformGizmo.js` | interaction | changed (path B only) | `orientGizmo(rotation, mode)`, re-anchor on `WALL_REBUILT`, distance scaling for section targets registered with `sceneManager.addPreRender` (3a; 07 C46). Spec 03 T5 already provides the hook set of 07 C33 (`ctx = {space, axisWorld, snap}`, `endGizmoDrag({cancel})`), `cancelDrag`, the detach cancel and `setSnapIncrements`. | 3a |
| `js/interaction/ViewportInput.js` | interaction | changed | Path B: click routing without gizmo-mode gating, `add`/`toggle` modes with `mod(e)`, press clearing, canvas `contextmenu` (3a); hover throttling and guards, double-click, cursor, `attachSectionShortcuts` via injected `sectionCommands` (3b). Path A: `registerActions` for the five `sections.*` actions and the hover throttling (3b). | 3a/3b |
| `js/interaction/OrbitController.js` | interaction | changed (path B only) | `frameSphere({center, radius})`, `#zoomMax`. Path A uses spec 07's `frame(box3)`. | 3b |
| `js/app/SectionSelection.js` | app | **new** | `SectionSelection` (pick provider; a `SelectableProvider` in path A), `WallSectionSelectable`, `SectionGroupSelectable` | 3a |
| `js/app/SectionCommands.js` | app | **new** | Selection-to-use-case commands shared by the toolbar and the keyboard: `selectAll`, `deleteSelected`, `flipLedSide` (3a); `duplicateSelected`, `selectAdjacent`, `frameSelection` (3b) | 3a/3b |
| `js/app/WallController.js` | app | changed | Offset, Detached and host, LED side, batch and delete-many use cases; drag session (deltas from the drag start); `currentLayout` with invalidation (the **single** layout accessor of every spec, 07 0.4: specs 05 and 09 read it too); `SECTION_CHANGED` on the single-card paths (3a); lock, duplicate, reorder (3b); path A: `History` record rows | 3a/3b |
| `js/app/App.js` | app | changed | Wiring (5.8) | 3a/3b |
| `js/ui/dom.js` | ui | changed (path B only) | `createDialogs(win)` gains `confirm(msg)`, calling `win.confirm(msg)` at call time (the harness stub replaces `window.confirm`). Path A: spec 07 deletes `createDialogs`; `App` adapts `Dialog`/`Notifier` (2.4 row 9). | 3a |
| `js/ui/SectionListPanel.js` | ui | changed | DOM-built cards, selection classes, header semantics, chevron, offset group, Detached and Starts at, spec 01's LED side select moved under Advanced, collapse and open maps, below-floor warning, reveal (3a); lock, pointer reorder, hover (3b). It no longer owns `#flip-all-sections` (spec 01's `bindFlipAllButton` moves to `SectionToolbar`). | 3a/3b |
| `js/ui/SectionToolbar.js` | ui | **new** | `#section-toolbar`, including spec 01's relocated `#flip-all-sections` | 3a |
| `js/ui/SectionBatchPanel.js` | ui | **new** | `#section-batch-panel` | 3a |
| `js/ui/Vec3Field.js` | ui | **new** | A reusable three-number field used by the card and the batch panel | 3a |
| `js/ui/ViewportToolbar.js` | ui | changed | Badge label from the payload (spec 03's `modes` suffix kept); follows renames and lock changes of selected sections (deps gain `selection`) | 3a |
| `js/theme/Theme.js` | theme | changed | `SceneTheme.selection` with 06 §5.12's values, each with its token, `COLOR_BINDINGS` row and fallback in the same commit | 3a |
| `index.html` | markup | changed | `#section-toolbar` (with spec 01's `#flip-all-sections` moved into it), `#section-batch-panel` before `#wall-sections`; `role="list"` on `#wall-sections`; `<link>` to the stylesheet. The help badge is **not** changed. | 3a |
| `css/features/section-editor.css` | css | **new** | Toolbar (including `#flip-all-sections` in its new place), batch panel, `.selected`, `.primary`, `.hovered`, `.locked`, reorder states, offset and advanced groups, `.section-header { user-select: none }`, a `.view-btn.active`-style pressed state; 06's role tokens only. Linked in the `css/features/*` block of 07 C52's link order. | 3a |
| `tests/static/css-slices.mjs` | test | unchanged | 07 S7 runs it with `--report-only`, scoped to `01-12`, from the first intentional CSS change (07 C52), so `css/features/` is never scanned. | - |
| `tests/static/check.mjs` | test | changed | Rule 4 (new ids; `#flip-all-sections` moves from `SectionListPanel` to `SectionToolbar`), rule 7 (new events), rule 10: `DOMAIN_FIELDS` gains `offset`, `locked`, `detached`, `anchorId`; no `ALLOWLIST` entry is added, because every write goes through a domain method; spec 01's static `RENDER_ORDER` rule covers `SectionHighlightView` | 3a |

**Stylesheet convention across specs (07 C52).** One link order: `00-fonts`, `01`-`11`, `css/features/*` (specs 01-05), `12-responsive`, `20`-`29` (09), `99-utilities` (06).

### 5.2 Public APIs (signatures)

**`js/geometry/SectionTransform.js`**, pure and Node-testable. Matrices are `number[16]`, column-major (index = col × 4 + row). 3×3 matrices are `number[9]`, column-major.
```js
/** @returns {{origin:{x,y,z}, xAxis:{x,y,z}, yAxis:{x,y,z}, zAxis:{x,y,z}, chordLength:number, height:number}} (6.3) */
export function sectionFrame(sl)
/** @returns {{x,y,z}} the rotation origin in frame coordinates (relative to frame.origin) (6.4) */
export function originLocal(frame, origin)
/** null iff offset.isIdentity; otherwise the matrix of 6.5 in the frame of `sl`. applySectionOffsets calls it on the
 *  TRANSLATED layout, after spec 03's translated() (6.6, 07 C32); there is no conjugation step. */
export function offsetMatrix(sl, offset)
export function rotationYXZ(xRad, yRad, zRad)         // number[9], identical to THREE r128 makeRotationFromEuler(…, 'YXZ')
export function eulerYXZFromMatrix(m3)               // {x, y, z} radians, identical to THREE r128 Euler.setFromRotationMatrix 'YXZ'
/** The equivalent triple nearest to `ref` (radians); at gimbal keeps ref.z and solves y (6.10). */
export function eulerYXZNearest(m3, ref)
export function axisAngle(axis, rad)                 // number[9] (Rodrigues)
export function quaternionFromMatrix3(m3)            // {x, y, z, w}, identical to THREE r128 Quaternion.setFromRotationMatrix (path A)
export function frameBasis(frame)                    // number[9] B = [xAxis | yAxis | zAxis]
export function transformPoint(m4, x, y, z)          // {x, y, z}
export function transformDirection(m4, x, y, z)      // {x, y, z}, upper 3x3 only
export function mat4Multiply(a, b)                   // a · b
export function det3(m3)
/** World translation delta (metres) -> local position delta (mm): 1000 · Bᵀ·d (6.8) */
export function worldDeltaToLocalMm(frame, d)
/** Snapped displacement s' (metres) along the dragged axis (6.8): RELATIVE to the drag start in both spaces (spec 03 D9):
 *  s' = Math.round(1000·s / snapMm) · snapMm / 1000. */
export function snapAxisDisplacement(s, { snapMm })
/** Rotation from the drag snapshot: space 'world' -> R' = Bᵀ·Q·B·R0; 'local' -> R' = R0·Q.
 *  Returns UNROUNDED degrees, chosen by eulerYXZNearest(R', start); SectionOffset.setRotation rounds them. (6.8) */
export function composeRotation(frame, startRotationDeg, axis /* 'x'|'y'|'z' */, deltaDeg, space)
/** Path A free-rotation handles: R' = Bᵀ·Q·B·R0 with Q the world delta rotation (a 3x3 from spec 07's dq). (6.8) */
export function composeWorldRotation(frame, startRotationDeg, q3)
/** Position (mm) that keeps the placement when the rotation origin changes from o0 to o1. (6.9) */
export function compensateOriginChange(sl, offset, newOrigin)
export const DEG2RAD = (deg) => (deg * Math.PI) / 180;   // the legacy association
```

**`js/geometry/WallLayout.js`** (additions and amendments)
```js
/** The walk becomes the two-pass walk of 6.2 (attached chain first, then each detached section from its host's start).
 *  With no section.detached === true the arithmetic is the verbatim Phase 1 walk (pass 2 is empty).
 *  The Phase 1 `postTransforms` option is REMOVED (an offset matrix needs the walk's own edges, so it cannot be passed in):
 *  applySectionOffsets is the single writer of postTransform. */
export function computeWallLayout(sections)
/** sl.postTransform = offsetMatrix(sl, sl.section.offset) for every section (null for identity), computed from the
 *  TRANSLATED section frame of `layout` (O_s, B and baseY of the stage, export or layout copy). Asserts det3(N) > 0
 *  (spec 01 6.1). Mutates and returns `layout`, which is always the fresh object produced by translated() (or the raw
 *  walk itself at the identity translation). 07 C32. */
export function applySectionOffsets(layout)
/** The single pipeline (07 C32, spec 03 5.10 #2): walk -> resolvePivot on the raw walk (generative only) ->
 *  translated(t) on the raw walk (throws on a non-null postTransform; no conjugation) -> applySectionOffsets(out)
 *  -> out.pivot = {resolution, frame, translation}. (6.6) */
export function layoutProject(project, { frame = 'stage' } = {})

class SectionLayout {
  postTransform;      // number[16] | null (null iff identity offset); written only by applySectionOffsets, after translated()
  get detached()      // this.section.detached === true (a getter, so spec 03's translated() needs no change)
  get frame()         // lazily computed sectionFrame(this), generative (pre-offset), in this layout's frame (not copied by translated())
}
class WallLayout {
  get hasPostTransforms()            // some section has a non-null postTransform
  indexOfSection(sectionId)          // index in `sections`, or -1 (lazy Map; the stale-layout guard of 5.4)
  bounds()                           // TRANSFORMED, every section (detached included): every grid vertex through its postTransform
  /** AMENDED (spec 03 T2 adds it with the Phase 1 bounds() semantics): pre-offset box of the ATTACHED sections only:
   *  FramingPolicy's generativeBox (07 C34). Identical to spec 03's definition when no section is detached. Read by
   *  pivotPoint('mesh-center') (spec 03 D5) and by the pre-I4b automatic orbit re-target (6.11), so neither offsets nor
   *  detached sections move the pivot or the orbit target. */
  generativeBounds()
  sectionBounds(i)                   // transformed box of section i
  originWorld(i)                     // frame.origin + B·(originLocal + t): the gizmo anchor (6.8), in this layout's frame
  sectionPerimeter(i)                // number[] (x, y, z)*, closed loop, transformed (6.11)
  *panelQuads()                      // {sectionIndex, sectionId, col, row, corners:[BL,BR,TR,TL]} transformed
  floorRuns()                        // [{sectionIndices: number[], edges: [{x, z}], facing: number[]}] (6.12); owned by this spec
  flatEdges()                        // kept (unit tests, spec 01's flatEdgeFacing); SafeDistanceView no longer reads it
  get firstEdge()                    // AMENDED: edges[0] of the first section with !detached (validation keeps one attached)
  get lastEdge()                     // AMENDED: last edge of the last section with !detached
  pivotPoint(mode)                   // unchanged code: 'mesh-center' reads generativeBounds() (now attached-only)
}
```
With no detached section and no offsets, `flatEdges()` deep-equals `floorRuns()[0].edges` (same values, different arrays), `flatEdgeFacing()` deep-equals `floorRuns()[0].facing`, and `generativeBounds()` deep-equals `bounds()`.

**`js/geometry/WallMeshBuilder.js`** (additions)
```js
/** sectionGrid: after computing (edge.x, y, edge.z) with spec 03's y = sl.baseY === 0 ? row * sl.panelH : sl.baseY + row * sl.panelH
 *  and the normal, if (sl.postTransform) apply transformPoint / transformDirection. When sl.postTransform === null the code
 *  path is byte-for-byte the previous path. */
sectionGrid(sl, opts, out)
/** combinedGrid: sectionRanges entries carry vertexStart and vertexCount (added by 08 P2-7, their owner; 07 C52):
 *  [{sectionId, sectionIndex, indexStart, indexCount, vertexStart, vertexCount}] */
combinedGrid(layout, atlas)
panelCorners(panel, panelW, panelH, postTransform = null)   // corners transformed iff postTransform
panelFacingNormal(panel, postTransform = null)              // rotated iff postTransform
/** postTransform · T(panel.x, panel.y, panel.z) · Ry(panel.rotY) as number[16]; used by LEDWallView for panels and frames */
panelWorldMatrix(panel, postTransform)
/** Spec 01's panel-mode back shell of ONE section, UNCHANGED: base-layout coordinates (no postTransform),
 *  4·panels vertices and 6·panels indices. LEDWallView applies sl.postTransform as the shell's matrix (spec 01 6.9). */
panelShell(sl)
/** Binary search on faceIndex * 3 over sectionRanges; returns the range entry or null (6.13). Owned by 08 P2-7 (07 C52);
 *  listed here because this spec is its main consumer. */
export function sectionRangeForFace(sectionRanges, faceIndex)
```

**`js/render/LEDWallView.js`** (additions)
```js
/** Spec 01 T10's (07 C52), consumed here: meshes() (LED, userData.kind 'led-wall') followed by backMeshes() (spec 01
 *  shells, kind 'led-wall-back'; [] before spec 01 step F1-5). Hidden meshes stay pickable: r128 Raycaster tests layers,
 *  not `visible`. */
pickMeshes()
/** Map<String(sectionId), {sectionId, sectionIndex, meshes, backMeshes, indexRange, vertexRange: {vertexStart, vertexCount}|null,
 *  panels: Mesh[], frames: LineSegments[]}>   (panel mode: backMeshes holds the section's one shell) */
sectionNodes()
/** Transform-only fast path (6.15). Returns false, without touching anything, when it cannot run (non-integer counts before
 *  B-L15, or a section absent from the current nodes); the caller then does a full rebuild.
 *  @param {WallLayout} layout  @param {Array<number>} sectionIds  @returns {boolean} */
updateSectionTransforms(layout, sectionIds)
```
- `#buildCombined`: the back shell (spec 01, shared geometry) carries `userData.sectionRanges` = the **same array** as the LED mesh (spec 01 6.9 already copies it by reference).
- `#buildPanels` and `#buildFrames`: if `sl.postTransform === null`, the previous code runs unchanged. Otherwise `panelWorldMatrix` is decomposed into the object's position, quaternion and scale (`matrixAutoUpdate` stays true).
- Panel-mode shells are spec 01's, per section: `matrixAutoUpdate = false`, `matrix.fromArray(sl.postTransform ?? IDENTITY16)`, `userData = {kind: 'led-wall-back', mode, sectionId, sectionIndex}`. They resolve by `sectionId` (no `sectionRanges` needed).

**`js/render/SectionHighlightView.js`** (new)
```js
import { RENDER_ORDER } from '../core/renderOrder.js';      // spec 01's registry (T13 adds the file if spec 01 has not landed)
import { sectionIdOf } from '../core/sectionIds.js';
export class SectionHighlightView {
  /** Subscribes SELECTION_CHANGED, SELECTION_HOVER_CHANGED (3b), WALL_REBUILT, SECTION_CHANGED (live only). Mirrors only;
   *  owns its group. Allocates NOTHING until the first refresh with a non-empty outline set (never during bootstrap, so
   *  legacy THREE ids and draw order are unchanged).
   *  @param {{sceneManager, bus, theme: {scene: SceneTheme}, layoutSource: () => WallLayout}} deps */
  constructor({ sceneManager, bus, theme, layoutSource })
  /** Rebuilds the highlight for the last selection payload (ids, primary) and hover id. Each section is located with
   *  layout.indexOfSection(sectionId); a section missing from the layout is skipped (no throw). Per selected section:
   *  - outline (two-tone, 06 D15 and 6.6): ONE explicitly closed THREE.Line geometry over sectionPerimeter(i) (the first
   *    point appended at the end; never LineLoop), drawn twice: halo LineBasicMaterial({color: selection.halo,
   *    depthTest: false}) at RENDER_ORDER.HIGHLIGHT_HALO, then core LineDashedMaterial({color, dashSize, gapSize from
   *    selection.selectedDash, depthTest: false}) at RENDER_ORDER.SECTION_HIGHLIGHT (below RENDER_ORDER.GIZMO), with
   *    computeLineDistances() after every geometry update;
   *  - tint: one Mesh over the section's panelQuads() (2 triangles per panel), MeshBasicMaterial({color, transparent: true,
   *    opacity: fillOpacity, depthTest: true, depthWrite: false, side: DoubleSide, polygonOffset: true,
   *    polygonOffsetFactor: -1, polygonOffsetUnits: -1}), raycast = noop. WebGL ignores LineBasicMaterial.linewidth, so the
   *    1 px outline alone almost disappears on large walls; the tint stays visible at any distance (R12).
   *  Hover (3b): outline only, the same two-tone pair with selection.hoverDash. Everything is disposed through
   *  ResourceTracker({disposeMaps: true}); the group is registered with sceneManager.addHelper. */
  refresh()
}
```
`SceneTheme.selection = { primary: 0xf7f7f5, secondary: 0xa3a3a3, hover: 0xf7f7f5, halo: 0x0a0a0a, opacity: 1.0, hoverOpacity: 1.0, fillOpacity: 0.18, selectedDash: [0.12, 0.06], hoverDash: [0.03, 0.03] }`: **06 §5.12's per-key values, the spec of record** (Feature 6 lands first, 07 §1.4). Each colour key lands with its token (`--scene-selection`, `--scene-selection-secondary`, `--scene-overlay-halo`), its `COLOR_BINDINGS` row and its `Theme` fallback in this feature's commit, so 06's U6 and U10 tests pass. Hover is told apart from selection by its dash pattern, not by opacity. These are not the gizmo axis colours and not the person colour `0x4488ff`, which the harness searches for.

**`js/interaction/SelectionManager.js`** (path B: changed; path A: spec 07 I2's `SelectionManager` v2 provides all of this except the hover bodies, and `SectionSelection` plugs in as a `SelectableProvider`). Legacy single-select behaviour is the special case `ids.length <= 1`.
```js
/** @typedef {object} PickProvider   e.g. SectionSelection (path A: spec 07's SelectableProvider with prefix 'section:')
 * @property {() => boolean} isPickable
 * @property {() => Object3D[]} pickMeshes
 * @property {(hit: Intersection) => string|null} resolveHit   selectable id or null (null = click-through)
 * @property {(id: string) => Selectable|null} find
 * @property {(ids: string[], primaryId: string) => Selectable} group   composite target for multi-selection
 * @property {(fromId: string, toId: string) => string[]} range        ids between two ids in list order
 */
/** @param {{bus, gizmo: TransformGizmo, pointerRay: PointerRay, interaction: InteractionState}} deps (unchanged) */
register(selectable)                 // throws if the id is not 'camera'|'person'|'car' and selectable.kind is missing (5.5)
registerProvider(provider)           // after every Selectable registration
get selectedIds()                    // frozen copy
get primaryId()                      // last selected; === legacy selectedId when ≤ 1
get selectedId()                     // alias of primaryId (compat)
get selectedKind()                   // kind of the selection, or null
get selected()                       // gizmo target: find(primary), or provider.group(ids) when ids.length > 1
get hoverId(); get hoverPickable()   // 3b
isSelected(id)
find(id)                             // registered selectables first, then providers
/** mode: 'replace' | 'add' | 'toggle' | 'range'; origin: 'viewport' | 'list' | 'keyboard' | 'api'.
 *  'add' never removes; 'toggle' adds or removes; 'range' (the list) selects anchor..id in list order.
 *  A different kind replaces the selection. Every path ends in #changed(payload) below. */
select(id, { mode = 'replace', origin = 'api' } = {})
selectMany(ids, { primaryId, origin = 'api' } = {})
deselect({ origin = 'api' } = {})
/** Drop ids whose find() is null (after delete/import). Calls #changed only if the selection changed. */
prune()
/** Same ids; gizmo.attach(this.selected) again (it builds no handles where allowedAxes(mode) gives none). No event.
 *  Used after lock changes (3b). */
refreshTarget()
/** private, the single post-change point of every path above:
 *    bus.emit(SELECTION_CHANGED, {id: primary, label, ids, kind, origin, modes})   // modes: spec 03 5.4
 *    selected ? gizmo.attach(selected) : gizmo.detach()
 *    #notifyObservers({primaryId, primary: find(primaryId), kind, ids, origin})    // addObserver observers (07 C37, used
 *                                                                                 // by spec 04): exactly once */
#changed(origin)
/** Click picking (called by ViewportInput on mouse-up after < 4 px travel). No gizmo-mode gating (Q8).
 *  if (interaction.isDraggingGizmo || interaction.pilotMode) return. top = #nearestResolved(event) (6.13).
 *  top: (mode 'add' or 'toggle') && kinds are both 'section' -> select(top.id, {mode, origin: 'viewport'});
 *       otherwise select(top.id, {origin: 'viewport'}) iff it changes anything.
 *  miss: 'add'/'toggle' -> no change; 'replace' -> deselect({origin: 'viewport'}) (legacy miss). */
pickAt(event, { mode = 'replace' } = {})
/** 3b. Hover picking: if gizmo.hoveredAxis -> hover null; else {top, wallHit} = #nearestResolved(event);
 *  #hoverPickable = !!top; hover id = top && find(top.id)?.kind === 'section' ? top.id : null.
 *  Emits SELECTION_HOVER_CHANGED when the id changes. Then the hover-hit observers (addHoverHitObserver, 07 C37; spec 04)
 *  receive wallHit: the nearest raw intersection with a wall mesh (locked sections included), or null. This is the
 *  single hover raycast of the app (spec 04 switches to it from its own probe once T23 lands). */
hoverAt(event)
setHover(id)                         // 3b, from the list (card mouseenter)
clearHover()                         // 3b; the hover-hit observers receive null
/** Badge text for the current selection: selected.label, or `${n} sections`. */
currentLabel()
```
`#nearestResolved` builds a `Map<Object3D, owner>` per call. The legacy `userData.selectType` write is kept for legacy selectables only. Wall meshes are shared between sections, so they are never tagged. `addObserver(o)` and `addHoverHitObserver(fn)` are 07 I2's `SelectionManager` v2 members (07 C37), direct ordered calls (R2) at the points above; in path B (fallback) spec 04 adds the same two methods on this manager, so spec 04 can land before or after this spec.

**`js/interaction/TransformGizmo.js`** (path B only; spec 03 T5 has already implemented the hook set of 07 C33: `beginGizmoDrag`, `endGizmoDrag({cancel})`, `cancelDrag()`, the detach cancel, `allowedAxes(mode)` with `null`, `ctx = {space, axisWorld, snap}`, `setSnapIncrements(partial)`). Legacy targets behave exactly as before. This spec adds:
```js
// onMouseMove: ctx = { space: this.space, axisWorld: {x, y, z}, snap: (event.ctrlKey || event.metaKey) ? interaction.snap : null }
//              (spec 03's ctx, unchanged; sections are the target that reads axisWorld)
// updateOrientation(): group.rotation.set(0, 0, 0); if (space === 'local') target.orientGizmo(group.rotation, this.mode)
//                      (NEW second argument: the gizmo mode; targets that ignore it are unaffected)
// constructor: also subscribes WALL_REBUILT: if (target && target.kind === 'section') { updateOrientation(); updatePosition(); }
/** NEW, registered by App with sceneManager.addPreRender((camera) => gizmo.updateScale(camera, canvas.clientHeight))
 *  (07 §5.2.2, C46; spec 03's PivotMarkerView.updateScale uses the same hook): runs on every rendered frame:
 *  s = target?.kind === 'section' ? max(1, MIN_ARROW_PX · worldPerPixel / ARROW_LENGTH) : 1; group.scale.setScalar(s)
 *  with worldPerPixel = 2 · d · tan(fov/2) / canvasHeightPx, d = |camera.position − group.position|,
 *  ARROW_LENGTH = 0.84 m (the legacy arrow), MIN_ARROW_PX = 90. Legacy targets keep s = 1 (keyboard goldens unchanged).
 *  The handles are scaled meshes, so the hit tolerance scales with them. No-op while detached or in pilot. */
updateScale(camera, canvasHeightPx)
```
`cancelDrag()` calls `target.endGizmoDrag({cancel: true})` (spec 03); the section target restores its offsets there (5.5). There is no `cancelGizmoDrag` and no `allowedModes`.

**`js/interaction/ViewportInput.js`** (path B: changed routing, replacing the B-M14 tag site; path A: spec 07 5.4.4 owns the pointer routing and this spec adds only `registerActions` and the 3b hover throttling). Mouse events, as legacy (the router's canvas listeners are registered after the orbit ones).
```
deps gain: sectionCommands (plain object, JSDoc-typed; injected callbacks, like spec 03's onPivotShortcut), win
mod(e) = isMac ? e.metaKey : e.ctrlKey          (isMac: spec 07 6.4's platformOf(win))
mousedown (button 0, not pilot): handled = gizmo.onMouseDown(e); #press = handled ? null : {x, y};
             #cancelHoverFrame(); selection.clearHover()                                        [hover parts: 3b]
mousemove:   #inside = true; #buttons = e.buttons;
             pilot -> pilot.onMouseMove(e); dragging gizmo -> gizmo.onMouseMove(e); else gizmo.onHover(e);
             3b: if (e.buttons === 0 && !pilot && !interaction.isDraggingGizmo) #scheduleHover(e)
mouseup:     wasDrag = interaction.isDraggingGizmo; gizmo.onMouseUp();
             if (#press && !wasDrag && e.button === 0 && hypot(dx, dy) < 4)
                 selection.pickAt(e, {mode: e.shiftKey ? 'add' : mod(e) ? 'toggle' : 'replace'});
             #press = null
window mouseup (registered after the canvas listener; the canvas handler runs first for releases on the canvas):
             #press = null                       // a release outside the canvas never leaves a stale press behind
mouseleave:  (new router listener, after the orbit one) #press = null; #inside = false;
             3b: #cancelHoverFrame(); selection.clearHover(); cursor ''
contextmenu: e.preventDefault()                  // macOS Ctrl-click (secondary click) opens no menu over the canvas
dblclick:    3b: if (!pilot) { selection.pickAt(e); if (selection.selectedKind === 'section') sectionCommands.frameSelection() }
#scheduleHover(e): #lastEvent = e; if (!#raf) #raf = win.requestAnimationFrame(() => { #raf = 0;
             if (#press || #buttons !== 0 || !#inside || interaction.isDraggingGizmo || interaction.pilotMode) return;
             selection.hoverAt(#lastEvent); canvas.style.cursor = selection.hoverPickable ? 'pointer' : '' })
#cancelHoverFrame(): if (#raf) win.cancelAnimationFrame(#raf); #raf = 0
attachShortcuts(): unchanged by this spec (spec 03 owns the Escape drag-cancel branch)
attachSectionShortcuts(): 3b listener of 3.5, calling sectionCommands.* only (path B)
```
The rAF callback re-checks every condition, so a mouse move followed by a press (every harness press is `mouseMoved` then `mousePressed`) or by `mouseleave` never re-sets the hover.

**`js/interaction/OrbitController.js`** (3b, path B only; path A uses spec 07's `frame(box3)`, 07 6.14)
```js
static FRAME_MAX_DISTANCE = 500;     // metres; the camera far plane is 1000 (1433)
/** b = frameBounds(); base = #baseTarget(b) (the updateTargetPosition expression without `offset`, factored out so that
 *  spec 03's 'flat-pivot' and 'layout' both work); offset = center − base;
 *  vFov = camera.fov·π/180; hFov = 2·atan(tan(vFov/2)·camera.aspect);
 *  distance = clamp(radius / sin(min(hFov, vFov)/2) · 1.1, 2, FRAME_MAX_DISTANCE); #zoomMax = Math.max(30, distance);
 *  updateCameraPosition(). */
frameSphere({ center, radius })
// wheel: distance = Math.max(2, Math.min(this.#zoomMax, distance + e.deltaY * 0.01))   (#zoomMax === 30: the legacy expression)
// setView('reset') also sets #zoomMax = 30
```

**`js/core/sectionIds.js`** (new; pure, imported by `app/`, `ui/`, `render/` and `interaction/`)
```js
export const sectionSelectableId = (sectionId) => `section:${sectionId}`;
export const sectionIdOf = (selectableId) => {
  const m = /^section:(-?\d+)$/.exec(String(selectableId));
  return m ? Number(m[1]) : null;
};
```

**`js/app/SectionSelection.js`** (new; app layer, no THREE import). The adapter differs by path (2.4 row 5); `WallController` sees the same calls in both paths: a drag start, the **total** (already snapped) world delta from the drag start, and an end or a cancel.
```js
export class SectionSelection {        // path B: PickProvider; path A: spec 07 SelectableProvider (prefix 'section:')
  /** @param {{project, wallController: WallController, view: LEDWallView,
   *           makeBox3?: ({min, max}) => THREE.Box3}} deps   (makeBox3: path A only, injected by App) */
  constructor({ project, wallController, view, makeBox3 })
  isPickable()                          // project.wall.count > 0
  pickMeshes()                          // view.pickMeshes()
  resolveHit(hit)                       // 6.13; null for unknown, and for locked from 3b on
  find(id)                              // cached WallSectionSelectable per section id; null if the section no longer exists
  resolve(id)                           // path A name of find(id)
  all()                                 // path A: every WallSectionSelectable (07 6.4 pickAt iterates providers' all())
  group(ids, primaryId)                 // SectionGroupSelectable (cached per selection change)
  range(fromId, toId)                   // list order
  idsInOrder()                          // all section selectable ids in list order (for [ ] and select-all)
}
export class WallSectionSelectable {   // Selectable
  kind = 'section'; multi = true; pickPriority = 0
  get id(); get sectionId(); get label()                     // section.name (+ ' (locked)' from 3b)
  isPickable()                          // false: picking goes through the provider; the selectable is never registered
  /** Spec 03 5.4 / spec 07 5.4.1. All three axes in both modes. 3b, locked: path B {x: false, y: false, z: false},
   *  path A null. Also all false / null when wallController.currentLayout.indexOfSection(sectionId) < 0. */
  allowedAxes(mode)

  // ---- path B (spec 03's hand-written gizmo) ----
  hasGizmoTarget()                      // section exists && axes allowed && currentLayout.indexOfSection(sectionId) >= 0
  /** const L = wallController.currentLayout; const i = L.indexOfSection(sectionId);
   *  if (i >= 0) { const p = L.originWorld(i); out.set(p.x, p.y, p.z) } return out; */
  gizmoAnchor(out)
  /** i as above; if (i < 0) return; m = mode === 'rotate' ? B·R(offset) : B; e = eulerYXZFromMatrix(m);
   *  rotation.order = 'YXZ'; rotation.set(e.x, e.y, e.z)   (6.8) */
  orientGizmo(rotation, mode)
  beginGizmoDrag()                      // #acc = {x: 0, y: 0, z: 0}; #accDeg = 0;
                                        // wallController.beginSectionDrag([sectionId], { primaryId: sectionId })
  /** #acc += movement; u = ctx.axisWorld;
   *  d = ctx.snap ? u · snapAxisDisplacement(#acc · u, {snapMm: ctx.snap.translateMm}) : #acc   (6.8, relative, D9)
   *  wallController.dragSections({ translateWorld: d }) */
  applyGizmoTranslate(movement, ctx)
  /** #accDeg += deltaDeg; δ = ctx.snap ? Math.round(#accDeg / ctx.snap.rotateDeg) * ctx.snap.rotateDeg : #accDeg;
   *  wallController.dragSections({ rotate: { axis, deltaDeg: δ, space: ctx.space } }) */
  applyGizmoRotate(axis, deltaDeg, ctx)
  /** Spec 03 5.4: onMouseUp passes {cancel: false} iff a drag was active; TransformGizmo.cancelDrag() (Escape, and
   *  detach() during a drag) passes {cancel: true}. */
  endGizmoDrag({ cancel })              // wallController.endSectionDrag({ cancel })

  // ---- path A (spec 07 Selectable v2 over TransformControls) ----
  historyLabel                          // `Transform section "${name}"`
  /** position = originWorld(i); quaternion = quaternionFromMatrix3(mode === 'rotate' ? B·R0 : B) (SectionTransform, no THREE).
   *  The mode argument is CR-07-e: TransformGizmo passes {mode: this.mode} from attach() and sync(), and setMode() calls
   *  sync(), so local translate arrows follow B (one field per arrow, 6.8) and local rings follow B·R0. */
  getTransform(out, { mode = 'translate' } = {})
  /** 'start': wallController.beginSectionDrag([sectionId], {primaryId: sectionId})
   *  'drag' / 'end', decoded per spec 07 6.5, always from ctx.start:
   *     translate handles: d = t.position − ctx.start.position, snapped per dragged axis in ctx.space axes (07 6.5);
   *                        wallController.dragSections({ translateWorld: d })
   *     single-axis rotate handles: {axis, deltaDeg} from dq = t.quaternion · ctx.start.quaternion⁻¹ (07 6.5, snap
   *                        applied there); wallController.dragSections({ rotate: {axis, deltaDeg, space: ctx.space} })
   *     free rotation ('E', 'XYZE'): wallController.dragSections({ rotateWorld: matrix3(dq) })
   *  'end' then: wallController.endSectionDrag({cancel: false})
   *  'cancel': wallController.endSectionDrag({cancel: true}) */
  applyTransform(t, phase, ctx)
  bounds()                              // makeBox3(currentLayout.sectionBounds(i)) or null: for F (07 6.14)
}
export class SectionGroupSelectable {  // the same interface, kind 'section'; anchor = component-wise median of the members'
                                       // originWorld; orientation = the primary's; label `${n} sections`; historyLabel
                                       // `Transform ${n} sections`; bounds = union of the members' sectionBounds;
                                       // drag calls pass every editable member id and primaryId
}
```

**`js/app/SectionCommands.js`** (new)
```js
export class SectionCommands {
  /** @param {{project, wallController, selection: SelectionManager, sectionSelection: SectionSelection,
   *           orbit: OrbitController, dialogs: {alert(msg), confirm(msg): boolean | Promise<boolean>}}} deps
   *  dialogs: path B createDialogs(win); path A App's adapter over spec 07's Notifier and Dialog (2.4 row 9). */
  constructor(deps)
  selectedSectionIds()            // numeric ids of the selected sections, list order ([] unless selectedKind === 'section')
  selectAll({ origin = 'api' } = {})   // selection.selectMany(sectionSelection.idsInOrder(), {origin}); the keyboard passes 'keyboard'
  /** async. No-op unless selectedKind === 'section'. If deleting would leave no attached section:
   *  dialogs.alert('At least one attached section must remain.') and return. Else if
   *  await dialogs.confirm(<3.3 Delete text, with the re-anchor count>): wallController.deleteSections(ids). */
  deleteSelected()
  /** ids = selectedSectionIds(); if (ids.length === 0) ids = every section id; wallController.flipFaceOrientations(ids) */
  flipLedSide()
  duplicateSelected()             // 3b: wallController.duplicateSections(ids)
  selectAdjacent(step)            // 3b: [ = -1, ] = +1, wrapping; origin 'keyboard'
  /** 3b, 6.14: box = union of currentLayout.sectionBounds(i) for the selection (or currentLayout.bounds()); return if null.
   *  Path B: orbit.frameSphere({center, radius}). Path A: orbit.frame(makeBox3(box)) (spec 07 6.14). */
  frameSelection()
}
```

**`js/app/WallController.js`** (additions). "Editable" ids are those that exist and, from 3b on, are not locked (every method skips the others, except `setSectionsLocked` and `duplicateSections`). In 3a `editable(ids)` is "the ids that exist".
```js
/** deps gain `selection` (SelectionManager, constructed earlier) and, in path A, `history` (spec 07 H1; App passes a no-op
 *  recorder before H1). WallController imports the pure sectionSelectableId from ../core/sectionIds.js; it has NO
 *  SectionSelection dependency (no constructor cycle). */
constructor({ project, view, ledTiles, orbit, hub, bus, palette, selection, history = null })
get currentLayout()                                   // #currentLayout ?? (#currentLayout = this.layout())
/** private: #currentLayout = null. Called by EVERY model mutator after its writes and before its first emit. */
#invalidate()
/** CHANGED (single-card paths): setSectionField records the pending {id, field}; commitSectionEdit() then runs
 *  #invalidate(); emit SECTION_CHANGED{ids: [id], fields: [field], source: 'card', live: false}; rebuild().
 *  setSectionColor emits the same with fields ['color'] before its rebuild. */
commitSectionEdit()
setSectionColor(section, color)
/** @returns the stored value of the first edited section, or null when `raw` does not parse (nothing written, no event) */
setSectionOffsetField(ids, path, raw, { source = 'card' } = {})
resetSectionOffsets(ids)
/** on: each editable id that is attached becomes detached with host = wall.defaultAnchorFor(id, pending), and the
 *  dependants of each newly detached section are re-anchored to wall.reanchorTargetFor(hostId, pending) (6.2.1). If the
 *  call would leave no attached section, the last remaining one is skipped. off: detached = false, anchorId = null.
 *  @returns {{changed: number[], reanchored: number[], keptAttached: number|null}} */
setSectionsDetached(ids, on)
/** Each editable detached id gets anchorId (an attached section's id; anything else is ignored and returns null). */
setSectionsAnchor(ids, anchorId)
/** Generalises spec 01's setSectionFaceOrientation(section, value), which is kept (model-only) for spec 01's callers. */
setSectionsFaceOrientation(ids, value)
/** Each editable id toggles stage <-> reversed; one rebuild. Spec 01's model-only flipAllFaceOrientations() is kept for its
 *  tests; the UI no longer calls it. */
flipFaceOrientations(ids)
beginSectionDrag(ids, { primaryId })
/** The TOTAL delta from the drag start (already snapped by the Selectable adapter); exactly one of the three is non-null:
 *  translateWorld {x, y, z} metres; rotate {axis: 'x'|'y'|'z', deltaDeg, space: 'world'|'local'};
 *  rotateWorld number[9] (path A free rotation). (6.8) */
dragSections({ translateWorld = null, rotate = null, rotateWorld = null })
endSectionDrag({ cancel = false } = {})
/** @returns {{deleted: number, refused: boolean, reanchored: number[]}}  refused (nothing deleted) when the editable ids
 *  would leave no attached section */
deleteSections(ids)                                   // generalises deleteSection(id) (kept, delegates)
batchSetField(ids, field, raw)                        // returns null without writing when parseFloat(raw) is not finite
batchSetColor(ids, color)
setSectionsLocked(ids, locked)                        // 3b
duplicateSections(ids)                                // 3b
moveSection(id, toIndex)                              // 3b
```
The exact sequences, and the path A `History` record rows, are in 5.4.

**`js/ui/Vec3Field.js`**
```js
export class Vec3Field {
  /** @param {{doc, labels: [string, string, string], dataPrefix: string /* e.g. 'position' */, min, max,
   *           onCommit: (axis: 'x'|'y'|'z', raw: string) => number|null}} opts   builds DOM (step="any"); listeners on 'change'.
   *  onCommit returning null restores the previous display (stored value or the Mixed placeholder). */
  constructor(opts)
  get element()
  /** values: {x, y, z} numbers or null (mixed -> '' + placeholder 'Mixed' + data-mixed) */
  setValues(values, { decimals })
  setDisabled(disabled)
}
```

**`js/ui/SectionToolbar.js`**, **`js/ui/SectionBatchPanel.js`**: the `constructor(deps)` + `bind()` pattern of ARCHITECTURE 3.11. Both map selection ids with `sectionIdOf` from `js/core/sectionIds.js` (ui may import `core/`; it may not import `app/`).
- `SectionToolbar` deps: `{ doc, project, sectionCommands, sectionList, wallController, selection, gizmo, bus }`. It owns `#section-toolbar` and spec 01's relocated `#flip-all-sections` (its `click` listener replaces spec 01's `SectionListPanel.bindFlipAllButton`).
- `SectionBatchPanel` deps: `{ doc, project, wallController, selection, bus }`. It builds the numeric id list for `batchSetField` as `selection.selectedIds.map(sectionIdOf).filter((id) => id !== null)`.
- Both subscribe `SELECTION_CHANGED`, `WALL_SECTIONS_CHANGED` and `SECTION_CHANGED` (which the single-card paths now emit, so the batch panel never shows a stale shared value).

**`js/ui/SectionListPanel.js`**: deps gain `selection` and `sectionSelection`. New public `expandAll()`, `collapseAll()` (called by `SectionToolbar`; they write only the panel's own cards and map). Spec 01's LED side `select` moves into `details.section-advanced`; `bindFlipAllButton` is removed (the button now belongs to `SectionToolbar`).

**`js/ui/dom.js`** (path B only): `createDialogs(win)` returns `{ alert(msg) { win.alert(msg) }, confirm(msg) { return win.confirm(msg) } }`. Both look up the method at call time. Path A: spec 07 E2 deletes `createDialogs` and static rule S3 forbids `confirm(`; `App` passes `{ alert: (m) => notifier.warn(m), confirm: (m) => dialog.open({title: 'Delete sections', body: m, actions: [{id: 'delete', label: 'Delete', danger: true}, {id: 'cancel', label: 'Cancel', primary: true}]}).then((id) => id === 'delete') }`.

### 5.3 Events

| Event | Payload | Emitted by (exact point) | Subscribers (mirror only, disjoint targets) |
|---|---|---|---|
| **new** `section:changed` (`SECTION_CHANGED`; the name of ARCHITECTURE section 9; spec 01 calls it `WALL_SECTION_CHANGED`, renamed by CR-01-a) | `{ids: number[], fields: string[], source: 'card'\|'batch'\|'gizmo'\|'reset'\|'lock'\|'rename'\|'cancel'\|'detached'\|'anchor'\|'faceOrientation', live: boolean}` | `WallController`, after the model write and `#invalidate()`. Non-live: before `rebuild()`. Live: after `view.updateSectionTransforms`. The single-card paths emit it too: `commitSectionEdit` (`fields: [field]`, `source: 'card'`), `setSectionColor` (`['color']`), `commitRename` (`{fields: ['name'], source: 'rename', live: false}`, always, before the legacy panel-ID branch). Detached changes list the re-anchored dependants in `ids` too. | `SectionListPanel` (offset inputs, badges, chips, Starts at selects, lock state, below-floor warning on `live`), `SectionBatchPanel` (shared and mixed values), `SectionToolbar` (button state), `SectionHighlightView` (outlines and tints when `live`), `ViewportToolbar` (badge text when a selected section's `name` or `locked` changed), **`NormalsDebugView` (mandatory; spec 01 5.2): `({live}) => { if (live && settings.normals.enabled && #last) sync({keepLength: true}) }`**. The fast path updates the mesh attributes and matrices in place, and `sync()` reads them from the cached view (spec 01 6.7.1 calls `updateWorldMatrix`), so the normal lines follow gizmo drags without a full rebuild. |
| **new** `selection:hoverChanged` (`SELECTION_HOVER_CHANGED`, 3b; spec 07 5.10 lists it as F2's) | `{id: string\|null}` | `SelectionManager.hoverAt/setHover/clearHover` when the value changes | `SectionHighlightView` (hover outline), `SectionListPanel` (`.hovered`) |
| changed `selection:changed` | `{id, label, ids: string[], kind: 'camera'\|'prop'\|'pivot'\|'projector'\|'section'\|null, origin, modes}` (`id` = primary; `modes` is spec 03's field, `('translate'\|'rotate')[]`, the modes whose `allowedAxes` is not `null`; `null`s, `ids: []` and `modes: []` on deselect). Spec 07 5.4.1 emits the same payload in path A. | unchanged points (before `gizmo.attach/detach`, then the `addObserver` observers, 5.2) | `ViewportToolbar` (badge, with spec 03's "(translate only)" suffix from `modes`), **plus** `SectionListPanel` (`.selected`/`.primary`/`aria-*`; expand and reveal **the primary card only** when `origin === 'viewport'` or `'keyboard'`), `SectionToolbar`, `SectionBatchPanel`, `SectionHighlightView`. Spec 04 does **not** subscribe: it uses `SelectionManager.addObserver` (07 C37). |
| changed `wall:sectionsChanged` | `reason` adds `'duplicate'` (`addedIds: number[]`) and `'reorder'` (`movedId, toIndex`) (3b) | `WallController.duplicateSections/moveSection`, after the model change | `SectionListPanel` (render, keeping the collapse map; expand the duplicates), `SectionLogosPanel` (render iff panel IDs are on), `SectionToolbar` (button enablement), `SectionBatchPanel` |
| `wall:rebuilt` (unchanged payload) | `{layout, meshMode, view}` | unchanged | **plus** `SectionHighlightView.refresh()`, `TransformGizmo` (path B: re-anchor and re-orient iff the target kind is `section`; path A: spec 07's `sync()`), `SectionListPanel` (below-floor warnings from `layout.sectionBounds(i)`) |

Bus rule 7 holds: each new event has subscribers in the same change. **Classification (07 C47):** `SECTION_CHANGED` and `SELECTION_HOVER_CHANGED` are **visual** events in the `Events` catalogue (render-on-demand invalidates on them).

### 5.4 Ordered pipelines (direct calls, R2) and rebuild policy

**Layout invalidation rule.** `#currentLayout` caches the last layout. Every mutator calls `#invalidate()` after its model writes and before its first emit. Every reader (`gizmoAnchor`, `orientGizmo`, `getTransform`, `allowedAxes`, `hasGizmoTarget`, `SectionHighlightView`, `SectionCommands.frameSelection`) goes through `currentLayout` (lazily re-laid out when `null`) and resolves sections **by id** (`indexOfSection`), never by a selection-derived index. A section missing from the layout yields no anchor, no outline and no gizmo axes. In addition, every pipeline that changes the section list changes the selection only **after** `rebuild()`.

**History (path A only).** Every use case below ends with one `history.record(label, {coalesceKey})` call **after** its rebuild (spec 07 5.6.1 "record points"); the rows are listed after the pipelines. Gizmo drags are spec 07's transactions (`begin` on the handle press, `commit` on release, `cancel({revert: false})` on Escape), so `dragSections` and `endSectionDrag` never call `record`. In path B there is no `history` and these calls do not exist.

```
P-PICK (path B: ViewportInput mouse-up, < 4 px, left button, not pilot, no gizmo drag happened; path A: spec 07 6.4)
  selection.pickAt(e, {mode}) -> emit SELECTION_CHANGED{origin:'viewport'} -> gizmo.attach(selected) | gizmo.detach()
      -> addObserver observers (07 C37)

P-OFFSET-FIELD (card / batch input change)
  v = wallController.setSectionOffsetField(ids, path, raw, {source})
      if (SectionOffset.parse(path, raw) === null) return null          // no write, no event, no rebuild
      before = this.currentLayout                                      // valid: read before any write
      for s of editable(ids):
          path === 'origin' ? s.offset.setOriginKeepingPlacement(raw, compensateOriginChange(before.sections[before.indexOfSection(s.id)], s.offset, raw))
                            : s.offset.set(path, raw)
      this.#invalidate()
      emit SECTION_CHANGED{ids, fields:['offset.' + path], source, live:false}
      this.rebuild()                       // P1; WALL_REBUILT re-anchors the gizmo and the outlines; the orbit target stays (6.11)
  panel: v === null ? restore the previous display : write v back (PR4 pattern)

P-DRAG (the adapter in SectionSelection differs by path; WallController is identical)
  handle press -> path B: target.beginGizmoDrag() / path A: applyTransform(t, 'start', ctx)
      -> wallController.beginSectionDrag(ids, {primaryId}):
      #drag = { ids: editable(ids), primaryId, start: Map(id -> offset.clone()), changed: false }
  each move -> path B: applyGizmoTranslate/Rotate (the adapter accumulates and snaps, 5.2) / path A: applyTransform(t, 'drag',
      ctx) (07 6.5 decodes and snaps the delta from ctx.start) -> wallController.dragSections({translateWorld | rotate | rotateWorld}):
      for each id: offset.assign(start) then setPosition / setRotation from the snapshot plus the TOTAL delta (6.8)
      this.#invalidate(); layout = this.layout(); #currentLayout = layout; #drag.changed = true
      if (!view.updateSectionTransforms(layout, ids)) this.rebuild()     // fallback (6.15)
      emit SECTION_CHANGED{ids, fields:['offset'], source:'gizmo', live:true}
    gizmo then: path B: dragStart.copy(current); updatePosition() (anchor from currentLayout); local rotate: updateOrientation()
                path A: sync() (07 5.4.2: the proxy is re-read from getTransform)
  release -> path B: target.endGizmoDrag({cancel: false}) / path A: applyTransform(t, 'end', ctx)
      -> wallController.endSectionDrag():
      d = #drag; #drag = null; if (d?.changed) this.rebuild()           // exactly one full rebuild per drag
  Escape while dragging -> gizmo.cancelDrag() -> path B: target.endGizmoDrag({cancel: true}) (spec 03 5.4) / path A:
      applyTransform(ctx.start, 'cancel', ctx) (07 6.5) -> wallController.endSectionDrag({cancel: true}):
      d = #drag; #drag = null; if (!d) return; for id: offset.assign(d.start.get(id)); this.#invalidate();
      emit SECTION_CHANGED{source:'cancel', live:false}; if (d.changed) this.rebuild()
      (TransformGizmo.detach() during a drag runs the same cancel first, spec 03 5.4.)

P-DETACHED   r = wallController.setSectionsDetached(ids, on)   (6.2.1)
             on:  pending = editable(ids) that are attached; if (wall.attachedCount() - pending.length < 1) drop the last
                  of pending (r.keptAttached); for s of pending in list order:
                      for d of wall.dependantsOf(s.id): d.setAnchor(wall.reanchorTargetFor(s.id, pendingSet))   (r.reanchored)
                  for s of pending: s.setDetached(true, wall.defaultAnchorFor(s.id, pendingSet))
             off: for s of editable(ids) that are detached: s.setDetached(false)          // anchorId -> null
             #invalidate(); emit SECTION_CHANGED{ids: changed + reanchored, fields:['detached','anchorId'], source:'detached'}; rebuild()
P-ANCHOR     for s of editable(ids) that are detached: s.setAnchor(anchorId) iff anchorId names an attached section; else return null
             #invalidate(); emit SECTION_CHANGED{fields:['anchorId'], source:'anchor'}; rebuild()
P-FACE       for s of editable(ids): s.setFaceOrientation(value), or toggle stage <-> reversed (flipFaceOrientations);
             #invalidate(); emit SECTION_CHANGED{fields:['faceOrientation'], source:'faceOrientation'}; rebuild()
P-RESET      edited = editable(ids).filter(s => s.hasOffset); if none: return; s.offset.reset() each; #invalidate();
             emit SECTION_CHANGED{fields:['offset'], source:'reset'}; rebuild()
P-BATCH      if (!Number.isFinite(parseFloat(raw))) return null; for s of editable(ids): s.setField(field, raw); #invalidate();
             publishStats(); emit SECTION_CHANGED{fields:[field], source:'batch'}; rebuild()
P-CARD (changed)  setSectionField(section, field, raw) as Phase 1 (remembers {id, field}); commitSectionEdit(): #invalidate();
             emit SECTION_CHANGED{ids:[id], fields:[field], source:'card', live:false}; rebuild()  (setSectionColor: the same
             with fields ['color'])
P-DELETE-MANY  del = editable(ids) in list order; if (del.length === 0) return {deleted: 0};
             if (wall.attachedCount() - del.filter(s => !s.detached).length < 1) return {refused: true}
             delSet = set of del ids; for each attached s in del: for d of wall.dependantsOf(s.id) not in delSet:
                 d.setAnchor(wall.reanchorTargetFor(s.id, delSet))       // keeps d in place when the next attached exists (6.2.1)
             for id of del: logos.remove(id); wall.removeById(id); #invalidate();
             emit WALL_SECTIONS_CHANGED{reason:'delete'}; rebuild(); selection.prune()   (path A: revalidate())
P-ADD (changed)   after the existing sequence (append, emit, rebuild):
             if (selection.selectedKind === null || selection.selectedKind === 'section')
                 selection.select(sectionSelectableId(s.id), {origin:'api'})      // a camera/prop/pivot/projector selection is kept
P-IMPORT (path B, changed)  first statement of applyImport: if (selection.selectedKind === 'section') selection.deselect({origin:'api'});
             then the legacy tail (replaceAll, mesh mode, emit, rebuild). Deselecting first prevents an old id from matching a
             new section with the same id during the rebuild.
P-IMPORT (path A)  ProjectSession.apply step 2 deselects and step 10 re-selects through selectMany (07 5.5.2 numbering;
             section ids only for undo/redo, CR-07-d); this spec adds nothing.
P-DUPLICATE (3b)  copies = wall.duplicate(ids); for c: logos.copy(sourceId, c.id); #invalidate();
             emit WALL_SECTIONS_CHANGED{reason:'duplicate', addedIds}; rebuild();
             selection.selectMany(copies.map(c => sectionSelectableId(c.id)), {primaryId: last copy, origin:'api'})   // after rebuild
P-REORDER (3b)    if (!wall.move(id, toIndex)) return; #invalidate(); emit WALL_SECTIONS_CHANGED{reason:'reorder', movedId, toIndex};
             rebuild()                      // detached sections keep their host by id
P-LOCK (3b)       s.setLocked(locked) for each; #invalidate(); emit SECTION_CHANGED{fields:['locked'], source:'lock'};
             selection.refreshTarget()   (re-attaches the gizmo to the same ids; locked members get no axes)
```

**History record rows (path A, spec 07 5.6.1 "Feature rows"; added with T27).**

| Use case | Label | `coalesceKey` |
|---|---|---|
| `setSectionOffsetField` (card) | `Edit offset <path> (<name>)` | `section:<id>:offset.<path>` (07 0.2) |
| `setSectionOffsetField` (batch) | `Edit offset <path> (N sections)` | `sections:<sorted ids>:offset.<path>` |
| `resetSectionOffsets` | `Reset offsets (<name> \| N sections)` | - |
| `setSectionsDetached` / `setSectionsAnchor` | `Detach section` / `Attach section` / `Change host (<name>)` | - |
| `setSectionsFaceOrientation` / `flipFaceOrientations` | `LED side (<name>)` / `Flip LED side (N sections)` | - |
| `batchSetField` / `batchSetColor` | `Edit <Field> (N sections)` / `Change colour (N sections)` | `sections:<sorted ids>:<field>` |
| `deleteSections` | `Delete N section(s)` | - |
| gizmo drag | `selectable.historyLabel` (`Transform section "<name>"` / `Transform N sections`) | spec 07 transaction |
| `duplicateSections` / `moveSection` / `setSectionsLocked` (3b) | `Duplicate N section(s)` / `Move section "<name>"` / `Lock` / `Unlock` | - |
| selection, hover, collapse, expand | not recorded (07 5.6.1) | - |

Rebuild-policy rows appended to ARCHITECTURE 6.2 and asserted by `wall-controller.test.mjs`. Rows carry **named ids** (`F2-1`..`F2-13`; 07 0.4) instead of numbers, so they never collide with spec 03's `F3-*` or any other spec's rows:

| Id | Trigger | Controller call | Full rebuilds | Fast-path updates | Phase |
|---|---|---|---|---|---|
| F2-1 | offset field `change` (card) | `setSectionOffsetField` | 1, or 0 when the entry does not parse | 0 | 3a |
| F2-2 | batch field / colour / offset / LED side / Detached / host commit (N sections) | `batchSetField` / `batchSetColor` / `setSectionOffsetField` / `setSectionsFaceOrientation` / `setSectionsDetached` / `setSectionsAnchor` | 1 (independent of N), or 0 when the entry does not parse | 0 | 3a |
| F2-3 | gizmo drag move | `dragSections` | 0 (1 only in the pre-B-L15 fallback) | 1 per move | 3a |
| F2-4 | gizmo drag release | `endSectionDrag` | 1 if anything moved, else 0 | 0 | 3a |
| F2-5 | Escape during drag | `endSectionDrag({cancel:true})` | 1 if anything moved, else 0 | 0 | 3a |
| F2-6 | reset offsets | `resetSectionOffsets` | 1, or 0 if all identity | 0 | 3a |
| F2-7 | Detached toggle or host change (card) | `setSectionsDetached` / `setSectionsAnchor` | 1, or 0 if nothing changed | 0 | 3a |
| F2-8 | LED side (card) / Flip LED side (toolbar) | `setSectionsFaceOrientation` / `flipFaceOrientations` | 1 | 0 | 3a |
| F2-9 | delete selected | `deleteSections` | 1, or 0 if nothing deletable or refused | 0 | 3a |
| F2-10 | selection / hover change | - | 0 | 0 | 3a |
| F2-11 | duplicate | `duplicateSections` | 1 | 0 | 3b |
| F2-12 | reorder (pointer drag, Move up/down) | `moveSection` | 1, or 0 if no move | 0 | 3b |
| F2-13 | lock / unlock | `setSectionsLocked` | 0 | 0 | 3b |

Undo and redo are spec 07's rows (`History.undo/redo` → `ProjectSession.apply` → one rebuild); this spec adds no row for them.

### 5.5 Shared `Selectable` / `TransformGizmo` hook set

There is **one** contract per path, and neither is defined here: path B is the hook set of **07 C33**, written out in **spec 03 5.4** (implemented by spec 03 T5, which lands first), and it maps one-to-one onto path A, **spec 07 5.4.1** (Selectable v2). This spec only implements them for sections and adds the members marked "02". Legacy selectables (`CameraController`, `PropController`) implement none of the optional members and behave exactly as today.

| Member | Path B: spec 03 5.4 | Path A: spec 07 5.4.1 | Introduced by | Sections implement |
|---|---|---|---|---|
| `kind` | `'camera' \| 'prop' \| 'pivot' \| 'projector' \| 'section'`; required for every Selectable added after Phase 1 (a new id without `kind` throws in `register`); inferred only for `'camera'` → `'camera'` and `'person'`, `'car'` → `'prop'`. Spec 03's pivot: `'pivot'`; spec 05's HDRI point: kind `'projector'`, id `'hdri-point'`, label `HDRI Point` (07 C36). | same union (07 typedef) | 02, 03, 05 | `'section'` |
| `multi` | - (sections only; implied by `kind === 'section'`) | `true` for sections | 07 | `true` |
| `pickPriority` | default 0; a positive priority outranks **wall (section) hits only**; among all other hits the nearest wins (03 5.4 `pickAt`, 07 6.4). Pivot 10 (03), HDRI point 9 (05). | same | 03 | 0 (default) |
| `allowedAxes(mode)` | `{x, y, z} \| null`: `null` = the mode is not supported (it replaces `allowedModes`, 07 C33); a false axis builds no handle | same | 03 (B-L22) | all three axes in both modes; 3b locked: `null` in both paths |
| `resolveHit(hit)` | on providers: `(Intersection) => string \| null` (null = click-through) | same | 02 | via `SectionSelection` |
| `beginGizmoDrag()` | `onMouseDown` on a handle hit | `applyTransform(t, 'start', ctx)` | 03 | yes |
| `endGizmoDrag({cancel})` | `onMouseUp`: `{cancel: false}` iff a drag was active; `cancelDrag()` (Escape, and `detach()` during a drag): `{cancel: true}` | `applyTransform(t, 'end', ctx)` / `applyTransform(ctx.start, 'cancel', ctx)` | 03 | yes: `endSectionDrag({cancel})` (commit or restore) |
| `applyGizmoTranslate(movement, ctx)` / `applyGizmoRotate(axis, deltaDeg, ctx)` | incremental values; `ctx = {space, axisWorld, snap}` (03, 07 C33) | `applyTransform(t, 'drag', ctx)` with `ctx = {space, snap, start, axis}`, delta from `ctx.start` (07 6.5) | 03 | yes (5.2 adapters) |
| `gizmoAnchor(out)` / `orientGizmo(rotation, mode)` | Phase 1 members; the `mode` argument is 02's (ignored by targets that do not need it) | `getTransform(out, {mode})` (the `{mode}` argument is CR-07-e) | Phase 1, 02 | yes (6.8) |
| `hasGizmoTarget()` | Phase 1 member | replaced by `allowedAxes(mode) !== null` | Phase 1 | yes (path B) |
| `historyLabel`, `bounds()` | - | 07 | 07 | yes (path A) |

`allowedModes`, `cancelGizmoDrag` and an argument-less `endGizmoDrag()` are **not** part of either contract: 07 C33 settles one path-B hook set that maps one-to-one onto Selectable v2 (03 D11 and 5.10.1 #1 apply it), and 07 C15's mapping table has no rows for them. `SELECTION_CHANGED.modes` is the list of modes whose `allowedAxes` is not `null`, exactly as spec 03 5.4 and 07 5.4.1 state, so a section shows no badge suffix.

**Escape and spec 03's pivot.** Escape mid-drag is spec 03's ungated order (3.5): `gizmo.cancelDrag()` → `pivot.endGizmoDrag({cancel: true})` clears the pending marker drag, the pivot stays selected, and a second Escape deselects (03 D7, AC10). This spec changes nothing there, so spec 03's `pivot_gizmo` golden is **not** re-captured by this spec.

### 5.6 Render layers, helpers and ownership

- `SectionHighlightView`'s group and the gizmo are helpers (`sceneManager.addHelper`). Once F0-e (or spec 07 R1) applies the layers, both are on `LAYERS.HELPERS` and are excluded from the preview camera, exports (which never read the scene) and picking. The raycaster tests layers (verified in r128 `intersectObject`: `object.layers.test(raycaster.layers)`), and `SelectionManager` intersects only selectable and provider meshes in any case. The tint meshes also set `raycast = () => {}`.
- **Render order:** `RENDER_ORDER.HIGHLIGHT_HALO` for the outline halos and `RENDER_ORDER.SECTION_HIGHLIGHT` for the dashed cores and tints, from spec 01's `core/renderOrder.js` registry, quoted by name; never a literal, so spec 01's static rule holds.
- Highlight objects are disposed through a `ResourceTracker({disposeMaps: true})` on each refresh. They are never parented to `wallGroup`, so `LEDWallView` disposal is unaffected.
- **DOM ownership:**
  - `#section-toolbar` and its children, including spec 01's relocated `#flip-all-sections`: `SectionToolbar` (spec 01 5.6 assigned the button to `SectionListPanel`; the static DOM-id ownership rule is updated in the same commit, T12);
  - `#section-batch-panel`: `SectionBatchPanel`;
  - `#wall-sections` attributes and every card (including spec 01's LED side select, now under Advanced): `SectionListPanel`;
  - the canvas `style.cursor`: `ViewportInput` (documented as a shared-element style write, like `#frustum-status-text` colour);
  - `#selection-indicator`: `ViewportToolbar`;
  - `.info-badge` text: static markup in `index.html`, **not changed by this spec** (3.5.1).

### 5.7 `Strategies` and `LEGACY_SITES`

- **No new `Strategies` keys.** Offsets and the Detached flag are new data with an identity default, not legacy quirks. Identity values reproduce the pre-feature output exactly (8.3 step B).
- **Retired / moved tags:**
  - `B-M14` at `js/interaction/SelectionManager.js#pickAt` and `js/interaction/ViewportInput.js#attachPointer` must already be retired by the Phase 2 fix (or spec 07 I2). If not, this feature retires them in T8, with the re-baseline in step C.
  - `B-M15`: if spec 08 P2-5b has landed, nothing moves and the mitred band is built per floor run. If it is still open, its row moves from `js/geometry/WallLayout.js#flatEdges` to `js/geometry/WallLayout.js#floorRuns` and the outline rule "first safeLeft + every safeRight" applies per run.
  - `B-L23` gets a partial fix in path B: section targets re-orient on `WALL_REBUILT`. The legacy targets keep their tag until the Phase 2 fix (or spec 07 I3, which retires it).
  - `B-L16`: the card template regex is gone with the DOM-built cards (T11). If the Phase 2 fix has not retired the tag, T11 retires it.
- **Framing (07 C34, 6.11):** step F (08 P2-11c) switches `framingBounds` to `'layout'` with `FramingPolicy`'s three named boxes. Because `rebuild()` step 4 re-targets the orbit after **every** rebuild before 07 I4b, that re-target reads **`generativeBox`** (`generativeBounds()`: pre-offset, attached sections only), so the orbit target never jumps after an offset commit or a gizmo release. Camera Reset, `F` and 07's open/new/restore framing read **`wallBox`** (`bounds()`: transformed, every section) on explicit actions only. D, the frame width and height and `fits` read **`stageExtent`** (sections whose LED normal has \|n.y\| ≤ 0.9). At identity the three boxes coincide, so there is no golden change (CR-03-b). Frame selection (`F` with a selection, double-click) uses the transformed section boxes. `Wall.flatBounds()` (still read by coverage, B-M10, until P2-11a) skips detached sections.
- **Unchanged and documented interplay:**
  - `safeDistanceBand` (B-M15, B-L29): the band shape strategy (or P2-5b's builder) is applied per floor run.
  - `mesh.*` profiles (B-H1, B-H2, spec 01): normals are rotated by the same matrices regardless of winding.

### 5.8 Bootstrap (ARCHITECTURE section 7 amendment)

**Construct phase** (no THREE allocation, R4):
- `wallController = new WallController({ project, view: wallView, ledTiles, orbit, hub, bus, palette, selection, history })`: `selection` is constructed earlier (ARCHITECTURE 7), so there is no cycle. `history` is spec 07's (path A; a no-op recorder before H1) or absent (path B).
- After spec 03's block (`pivotController`, `selection.register(pivotController)`) and spec 05's `'hdri-point'` registration if present:
  - `sectionSelection = new SectionSelection({ project, wallController, view: wallView, makeBox3 })` (`makeBox3` path A only);
  - `selection.registerProvider(sectionSelection)`: after every Selectable registration;
  - `sectionCommands = new SectionCommands({ project, wallController, selection, sectionSelection, orbit, dialogs })` (`dialogs` per 2.4 row 9);
  - `highlight = new SectionHighlightView({ sceneManager, bus, theme, layoutSource: () => wallController.currentLayout })`.
- `sectionList = new SectionListPanel({ doc, project, wallController, selection, sectionSelection, bus })` (amended deps, same position), then immediately `sectionToolbar = new SectionToolbar({ doc, project, sectionCommands, sectionList, wallController, selection, gizmo, bus })` and `sectionBatch = new SectionBatchPanel({ doc, project, wallController, selection, bus })`, all before `logosPanel` (WALL_SECTIONS_CHANGED subscription order: list, toolbar, batch, logos; the targets are disjoint).
- `toolbar = new ViewportToolbar({ ..., selection })`; `viewportInput = new ViewportInput({ ..., sectionCommands, win })`.
- `NormalsDebugView` (spec 01) gains its `SECTION_CHANGED` subscription in its constructor; its position is unchanged.

**setupUI phase** (R11; every new listener sits on a new element or follows the legacy listeners on shared targets):
- `sectionToolbar.bind(); sectionBatch.bind()` right after `sectionList.bindAddButton()` (sidebar order). Spec 01's `sectionList.bindFlipAllButton()` call is removed; `sectionToolbar.bind()` binds `#flip-all-sections` instead.
- Path B: `viewportInput.attachShortcuts()` (legacy position, with spec 03's Escape branch) and `viewportInput.attachPointer()` (legacy position; the new canvas `mouseleave`, `contextmenu` and `dblclick` listeners and the `window` `mouseup` listener are added after the existing ones);
- 3b, path B: `viewportInput.attachSectionShortcuts()` after spec 01's `debugControls.bindShortcuts()` and before spec 04's and spec 05's listeners. The keys are disjoint, so the order is not observable. Path A: `viewportInput.registerActions({ 'sections.delete': () => sectionCommands.deleteSelected(), 'sections.selectAll': () => sectionCommands.selectAll({origin: 'keyboard'}), 'sections.duplicate': () => sectionCommands.duplicateSelected(), 'sections.prev': () => sectionCommands.selectAdjacent(-1), 'sections.next': () => sectionCommands.selectAdjacent(+1) })`.

**Per-frame scaler (path B):** `App` registers `sceneManager.addPreRender((camera) => gizmo.updateScale(camera, canvas.clientHeight))` next to spec 03's `pivotMarker.updateScale` registration (07 §5.2.2 owns the tick, C46). It runs on every rendered frame and is a no-op unless the target is a section, so every existing output is unchanged.

**No allocation at bootstrap.** `SectionHighlightView` allocates lazily (5.2) and the selection is empty at start, so legacy THREE ids and draw order are unchanged.

### 5.9 ARCHITECTURE.md amendments (same commit as the code)

1. **1.4** world conventions: the section frame (X Along, Y Up, Z Out = generative front) and the Detached walk rule (host by id, 6.2).
2. **2.1** stylesheets: `css/features/section-editor.css` in 07 C52's link order. Layering note: `core/sectionIds.js`.
3. **2.2** file tree: the new modules of 5.1.
4. **2.3** tests and tools: the new unit tests, `tests/regression/scenarios-sections.mjs`, and the `sectionsSnapshot` format change.
5. **3.4** theme: `SceneTheme.selection`.
6. **3.5** domain: `SECTION_FIELDS` plus `offset`, `locked`, `detached`, `anchorId`; the `SectionOffset` module spec; `WallSection` methods; the `Wall` additions (host helpers) and the `flatBounds` detached rule; `LogoLibrary.copy`.
7. **3.6** geometry: the two-pass walk; removal of the `postTransforms` option; `applySectionOffsets(out)` and its place in `layoutProject` (**after** `translated()`, on the translated section frame; no conjugation; 07 C32); the `SectionLayout.postTransform` comment ("written only by `applySectionOffsets` from `section.offset`, after the pivot translation; null iff identity; never read by the walk"); the `WallLayout` additions, `generativeBounds()` restricted to attached sections (`generativeBox`), the `firstEdge`/`lastEdge` amendments and `FramingPolicy`'s named boxes (07 C34); the builder additions (spec 01's `panelShell(sl)` unchanged).
8. **3.7** render: the `LEDWallView` additions (panel-mode shell matrices); `SectionHighlightView`; `SafeDistanceView.create` input `floorRuns()`; the `NormalsDebugView` live subscription.
9. **3.8** interaction: path B: the hook set of 07 C33 with this spec's additions (5.5), `PickProvider`, the `SelectionManager` / `TransformGizmo` / `ViewportInput` / `OrbitController` changes, the observer call points (07 C37), the `KeyboardState` modifier filter. Path A: the section `SelectableProvider` and Selectable v2 members.
10. **3.10** app: the `WallController` additions and deps; `SectionSelection`; `SectionCommands`.
11. **3.11** ui: `createDialogs` `confirm` (path B); the new panels; `SectionListPanel` (DOM-built cards; header semantics replace "header click toggles collapsed"); `#flip-all-sections` ownership; `ViewportToolbar` deps.
12. **4** state model: the rows of 4.1 "Non-persisted editor state"; the `.collapsed` DOM row becomes the panel's JS map; `OrbitController.offset` and `distance` writers gain `frameSphere` (path B); `WallSection.offset/locked/detached/anchorId` writers (`WallSection` methods via `WallController`, the v2 reader).
13. **5** events: the rows of 5.3.
14. **6.2** rows `F2-1`..`F2-13`; **6.4** section cards; **6.9** the new pick and drag flows.
15. **7** bootstrap: 5.8.
16. **8.2 / 8.3**: the retired B-M14 rows (if not already retired); the B-M15 row (conditional, 5.7); B-L23 partial; B-L16.
17. **9**, Feature 2 row: "done", with the event named `section:changed`; "`layoutProject` builds per-section `postTransforms`" becomes "`applySectionOffsets(out)` builds them on the translated layout, after `translated()` (07 C32); no wall root transform".
18. **10** verification contracts: the rule-10 field list, the unit-test list.

---

## 6. Algorithms and math

### 6.1 Conventions

- **Units.** Metres in geometry. Offsets are held in mm and degrees in the domain and the UI (metres in the file, 4.3), and converted with `MM_TO_M = 0.001` and `DEG2RAD(d) = (d * Math.PI) / 180` (the legacy association).
- **Axes.** Y is up. The wall front faces +Z for heading 0. The cursor heading `a` gives the direction `(cos a, 0, sin a)`. Positive curve bends toward +Z. Panel `rotY = −a`.
- **Frames.** Spec 03's frames: layout (L, the legacy world), stage (S = L − (P.x, 0, P.z)) and export (E = L − P). Spec 03's `translated()` bakes the pivot translation into the raw walk first, and this spec then builds every offset matrix in **that** frame (S or E; L only for `frame: 'layout'`), from the translated section frame (6.6, 07 C32). The other functions of this section (frame, anchor, bounds, perimeter, floor runs) work in whatever frame their `SectionLayout` is in, from its own (translated) edges, `baseY` and `postTransform`; there is no separate root transform, ever (the identity `wallGroup` transform is a unit-tested invariant). `sl.baseY` is the section's base height in that frame (0 in L and S, −P.y in E; 0 when spec 03 has not landed).
- **Matrices.** Column-major `number[16]` (THREE `Matrix4.elements` layout). Points are column vectors: `p' = M·p`.
- **Euler.** Intrinsic `'YXZ'`: `R = Ry(pan) · Rx(tilt) · Rz(roll)`, identical to r128 `Matrix4.makeRotationFromEuler` with `order === 'YXZ'`. With `a=cos x, b=sin x, c=cos y, d=sin y, e=cos z, f=sin z` (row i, column j):
  ```
  r11 = c*e + d*f*b   r12 = d*e*b - c*f   r13 = a*d
  r21 = a*f           r22 = a*e           r23 = -b
  r31 = c*f*b - d*e   r32 = d*f + c*e*b   r33 = a*c
  ```
  This was verified against `three@0.128.0/build/three.js` (`makeRotationFromEuler`, the YXZ branch). Principal extraction (r128 `Euler.setFromRotationMatrix`, YXZ), always with |x| ≤ 90°:
  ```
  x = asin(-clamp(r23, -1, 1)); if (|r23| < 0.9999999) { y = atan2(r13, r33); z = atan2(r21, r22) } else { y = atan2(-r31, r11); z = 0 }
  ```

### 6.2 Detached sections in the walk (host by id)

```
// pass 1: the attached chain = the verbatim Phase 1 walk over the sections with detached !== true, in list order
start = new Map()                                       // sectionId -> cursor BEFORE the section's Heading Change
let currentX = 0, currentZ = 0, currentAngle = 0
for (i, s) of sections in list order, s.detached !== true:
    start.set(s.id, { x: currentX, z: currentZ, angle: currentAngle })
    out[i] = <verbatim body: angleOffset, edges, curve steps, panels (sectionIndex = i)>
// pass 2: detached sections, list order; they never move the chain cursor
for (i, s) of sections in list order, s.detached === true:
    h = resolveAnchor(s)                                // 6.2.1
    c = h !== null ? start.get(h) : { x: 0, z: 0, angle: 0 }
    let currentX = c.x, currentZ = c.z, currentAngle = c.angle      // local cursor
    out[i] = <verbatim body>
return new WallLayout({ sections: out })                // LIST order (sectionIndex = list index), as before
```
- A detached section starts where its **host** starts, with the host's heading **before** the host's Heading Change. A detached copy with the same fields therefore overlays its host exactly (`Object.is` on every edge, E13): the copy applies the same Heading Change and curve from the same cursor values.
- The attached sections form the chain exactly as if the detached sections were absent (E13), wherever the detached sections sit in the list.
- With no detached section, pass 2 is empty and pass 1 is the verbatim walk (the `start` map only stores values). The oracle tests (`Object.is` over fuzzed walls) still hold.
- **Consequences:** `firstEdge`/`lastEdge` skip detached sections (5.2), so spec 03's `wall-center` anchor ignores soffits; `generativeBounds()` (pivot `mesh-center` and framing, 6.11) and `Wall.flatBounds()` skip them; `Wall.totals()` counts their panels, pixels and arc (they are real hardware); the texture atlas and the panel-ID column letters are unchanged (they follow list order).
- **Ticking or unticking Detached is a generative edit.** It removes the section from the attached chain (or returns it), so the following attached sections re-chain, and `lastEdge` and `generativeBounds()` can change. In spec 03's `wall-center` and `mesh-center` modes the anchor then moves, exactly as it does when a section is added or resized; `bottom-left` never moves, because the first attached section always starts at the layout origin. Adding a section that is detached from the start (Duplicate + Detached on the copy) leaves the chain, and so the pivot, where it was (6.17).

#### 6.2.1 Choosing and keeping the host

```
attached(s)               = s.detached !== true
resolveAnchor(s)          = (a = byId(s.anchorId)) && attached(a) ? a.id : nearestAttached(s)   // defensive; validation and
                                                                                               // WallController keep anchorId valid
nearestAttached(s)        = the nearest attached section ABOVE s in list order, else the nearest attached BELOW, else null
defaultAnchorFor(id, P)   = nearestAttached(id), with the sections in P counted as detached       // ticking Detached
reanchorTargetFor(h, X)   = the nearest attached section AFTER h in list order, else the nearest attached BEFORE h, with the
                            sections in X counted as absent (deleted) or detached                    // host deleted / detached
```
- **Why "after" for re-anchoring.** When host `h` is deleted or becomes detached, the next attached section `n` after it inherits `h`'s former start exactly: the chain reaches `n` from the end of the attached section before `h`, which is where `h` started, with the same cursor values. Moving the dependants to `n` therefore leaves them **bit-identical in place** (E18, E19). Only when `h` was the last attached section do they move (to the previous attached section's start); the delete confirm text says how many are re-anchored.
- **Invariants:** at least one section is attached (the UI disables Detached on the last attached section, `deleteSections` refuses, the validator re-attaches the first section of an all-detached file); every detached section's `anchorId` names an attached section after every use case (`WallController` is the only writer).
- **Reorder (3b)** never changes `anchorId`: a soffit stays with its wall wherever either one moves in the list.

### 6.3 Section frame (computed from the generative layout, pre-offset)

```js
function sectionFrame(sl) {
  const e = sl.edges, e0 = e[0], eN = e[e.length - 1];        // e.length - 1, never panelCols (B-L15 safe)
  let dx = eN.x - e0.x, dz = eN.z - e0.z;
  let L = Math.hypot(dx, dz);
  if (L > 1e-9) { dx /= L; dz /= L; }
  else {                                                        // closed loop (e.g. 360° of curve): use the first panel
    dx = e[1].x - e0.x; dz = e[1].z - e0.z; const l1 = Math.hypot(dx, dz); dx /= l1; dz /= l1; L = 0;
  }
  return {
    origin: { x: (e0.x + eN.x) / 2, y: sl.baseY ?? 0, z: (e0.z + eN.z) / 2 },  // chord midpoint at the section base
    xAxis: { x: dx, y: 0, z: dz },                                // "Along"
    yAxis: { x: 0, y: 1, z: 0 },                                  // "Up"
    zAxis: { x: -dz, y: 0, z: dx },                               // "Out" = xAxis × yAxis = the legacy front normal formula
    chordLength: L,
    height: sl.section.panelRows * sl.panelH,                     // metres
  };
}
```
`B = [xAxis | yAxis | zAxis]` is a pure rotation about Y (`B = Ry(−atan2(dz, dx))`). `B⁻¹ = Bᵀ`. For a flat section at heading 0, `B = I`. The frame ignores `faceOrientation`: Z Out is the generative front (3.1).

### 6.4 Rotation origin (frame coordinates, relative to `origin`)

| `origin` | `o` | Point before offset |
|---|---|---|
| `bottom-center` (default) | `(0, 0, 0)` | chord midpoint at the section base |
| `center` | `(0, H/2, 0)` | chord midpoint at half the height. For curved sections this lies off the panel surface by at most the sagitta. |
| `bottom-left` | `(−L/2, 0, 0)` | `edges[0]` at the base (exactly) |

### 6.5 Offset matrix

With `t = position × 0.001` (the stored millimetres as metres, frame coordinates), `R = rotationYXZ(DEG2RAD(rx), DEG2RAD(ry), DEG2RAD(rz))`, origin `O`, basis `B` and rotation origin `o`:

```
M = T(O) · B · T(o + t) · R · T(−o) · Bᵀ · T(−O)
```
Closed form used by `offsetMatrix` (fewer operations, no 4×4 chain):
```
N = B · R · Bᵀ                                  (3×3 linear part; also the normal matrix, since M is rigid)
c = O + B·(o + t − R·o) − N·O                   (translation column)
M = [ N  c ; 0 0 0 1 ]
```
**Properties (unit-tested):**
- `M · (O + B·o) = O + B·(o + t)`: the rotation origin only translates by `t`.
- `M` is rigid: `det N = 1` and `NᵀN = I` to 1e-12. `applySectionOffsets` asserts `det3(N) > 0` (spec 01 6.1: a mirrored transform would make the viewport and the exporters disagree on front faces).
- `offset.isIdentity ⇒ offsetMatrix === null`, so no arithmetic is performed and outputs are bit-identical to the pre-feature build.
- The matrix depends only on this section's generative geometry and offset. It is never written back into `currentX/currentZ/currentAngle`. Section `i + 1`'s edges are `Object.is`-identical with or without an offset on section `i`.
- **Translation equivariance (the property the pipeline relies on, 07 C32).** `O`, `B` and `o` are derived from the section's own edges and `baseY`. Translating the section by `v` gives `O' = O + v` with `B` and `o` unchanged, so building `M` from the translated geometry yields `T(v)·M·T(−v)`. That is why `applySectionOffsets(out)` can run **after** `translated()` (6.6): the stage and export layouts both get the canonical `T_frame · S_i · v` with no conjugation code. E17, shared with spec 03's unit test 8 as one equivariance test, checks it to 1e-12.

### 6.6 `applySectionOffsets` and the order inside `layoutProject` (07 C32, spec 03 5.10 #2: translate the raw walk, then build the offsets)

```js
export function layoutProject(project, { frame = 'stage' } = {}) {      // spec 03 6.3, completed by ONE line
  const raw = computeWallLayout(project.wall.sections);                 // two-pass walk (6.2), layout frame; B-L1 convention;
                                                                        // every postTransform null
  const resolution = resolvePivot(raw, project.wall.pivot);             // GENERATIVE anchor on the raw walk: edges,
                                                                        // firstEdge/lastEdge, attached-only generativeBounds()
  const t = /* spec 03: −O (stage), −P (export) or 0 (layout) */;
  const out = (t.x === 0 && t.y === 0 && t.z === 0) ? raw : raw.translated(t.x, t.y, t.z);   // throws on a non-null
                                                                        // postTransform; no conjugateTranslation exists
  applySectionOffsets(out);                                             // THIS SPEC: S_i from the TRANSLATED section frame
                                                                        // (O_s, B, baseY); det > 0 asserted
  out.pivot = { resolution, frame, translation: t };
  return out;
}
export function applySectionOffsets(layout) {
  for (const sl of layout.sections) {
    const M = offsetMatrix(sl, sl.section.offset);                      // null for identity
    if (M && !(det3(upper3x3(M)) > 0)) throw new Error('Section offset must be rigid');
    sl.postTransform = M;
  }
  return layout;
}
```
- **Why this order (07 C32).** It is the single pipeline that spec 03 implements and tests (03 6.3, 6.4, its unit test 8): `translated()` runs on the raw walk and throws if any `postTransform` is set, so offsets can never be applied before the pivot translation or twice, and no conjugation code exists. By translation equivariance (6.5) the result equals the intent of building in the layout frame and translating afterwards; E17 and spec 03's unit test 8 are one shared test. Spec 03's 6.3 comment already marks the insertion point (CR-03-a). The framing boxes (CR-03-b, 6.11) are separate. **There is never a wall root transform:** `wallGroup` keeps the identity transform, a unit-tested invariant.
- `translated()` copies the walk-produced fields and no lazy cache, so `sl.frame`, `originWorld(i)`, `sectionBounds(i)` and `bounds()` recompute on the copy from translated data (03 5.10 #3), and `applySectionOffsets(out)` reads that translated `sl.frame`; `SectionLayout.detached` is a getter on `section`, so `translated()` needs no change for it.
- The viewport, the picking, the gizmo anchors, the outlines and the frame-selection boxes all read the **stage** layout from `WallController.currentLayout`, so they need no pivot awareness. The exporters read the **export** layout (`wallController.layout({frame: 'export'})`), which differs from the stage layout only by the translation `(0, −P.y, 0)` (spec 03 5.1). Both carry matrices built from their own translated frames, which are translates of each other (equivariance).

### 6.7 Applying the transform

| Consumer | Rule |
|---|---|
| Strip vertices (combined, section; all exporters) | `p' = transformPoint(M, edge.x, y, edge.z)` with spec 03's `y`, computed in `WallMeshBuilder.sectionGrid` right after the previous values. |
| Strip normals | `n' = transformDirection(M, nx, ny, nz)`. No renormalisation is needed (rigid). Spec 01's `averaged` normals and its σ sign are applied before the transform. |
| Panel quads (exports) | `panelCorners(panel, w, h, M)` transforms the 4 corners. `panelFacingNormal(panel, M)` rotates the facing normal. |
| Panel-mode back shell (spec 01 6.9) | Built untransformed by `panelShell(sl)`; the view sets `shell.matrix.fromArray(M ?? IDENTITY16)` with `matrixAutoUpdate = false`. The fast path rewrites only that matrix. |
| Panel meshes and frames (viewport) | `W_panel = M · T(panel.x, panel.y, panel.z) · Ry(panel.rotY)`, decomposed into position, quaternion and scale. `Ry(θ)` uses three's convention: `(cos θ, 0, −sin θ)` for +X. Spec 01's in-place plane flip for reversed sections is unaffected (it edits the geometry, not the transform). |
| UVs, vertex colours, indices, textures | Unchanged. Offsets never change texture content. Reorder changes column letters through the existing cumulative columns. |
| Stats (`Wall.totals()`) | Unchanged. Total Arc excludes offsets, as it already excludes `angleOffset`. |

### 6.8 Gizmo orientation, deltas and snapping (from the drag snapshot; no accumulated rounding)

**Orientation (local space).** Path B: `orientGizmo(rotation, mode)` sets the gizmo group; path A: `getTransform(out, {mode})` sets the proxy quaternion (CR-07-e). Both give:
- **translate:** `B`, the section frame. The arrows are X Along, Y Up and Z Out, the axes of the numeric fields. The legacy translate path moves along `axisDir.applyQuaternion(gizmoGroup.quaternion)` (3270-3277), and `TransformControls` in local space moves along the proxy's axes, so a local arrow drag of `Δ` metres moves the section by `Δ·B·e_k`, and the stored offset changes by `1000·Bᵀ·(Δ·B·e_k) = 1000·Δ·e_k`: **exactly one field changes**.
- **rotate:** `B·R0`, the section's current orientation. The rings turn about the section's own axes.

World space: the group (or proxy) has no rotation. For a multi-selection the anchor is the component-wise median of the members' `originWorld`, and the orientation is the primary member's.

**Translate.** `WallController.dragSections` receives the **total** world translation `d` from the drag start (metres; the stage frame is a pure translation of the layout frame, so world and stage deltas are equal). The adapters produce it (5.2):
```
path B: acc += m (the incremental movement, always parallel to the unit drag axis u = ctx.axisWorld)
        d = snap ? u · snapAxisDisplacement(acc · u, { snapMm: snap.translateMm }) : acc
        snapAxisDisplacement(s, {snapMm: q}) = Math.round(1000·s / q) · q / 1000        // RELATIVE in both spaces (03 D9)
path A: d = t.position − ctx.start.position; with ctx.snap, each dragged axis component in ctx.space axes is rounded to a
        multiple of the increment and the other components are exactly 0 (07 6.5)

WallController, for each id:  Δ = worldDeltaToLocalMm(frame_id, d) = 1000 × { d·xAxis, d.y, d·zAxis }
                              offset.setPosition({ x: start.x + Δ.x, y: start.y + Δ.y, z: start.z + Δ.z })   (RULES.position: 0.1 mm)
```
- **Snapping is relative** (spec 03 D9, 03 5.10.1 #2): the dragged distance is a multiple of the increment; the stored value is `start + k·q`, not a multiple of `q`. In local space this changes exactly one field, by a multiple of `q`; in world space the motion stays on the dragged world axis. Fields that are not dragged keep their stored value bit-for-bit (`Δ = 0` → `start + 0 === start`, and `RULES.position` is idempotent on stored values). Revision 2's absolute local grid is withdrawn, so no amendment to spec 03 D9 is needed.
- With several sections selected, the same `d` is used for each, through each section's own `B`. Every section therefore moves by the same world vector.

**Rotate.** `dragSections` receives the **total** angle from the drag start, `rotate = {axis, deltaDeg, space}` (path B: the adapter's accumulation, snapped as `Math.round(acc / q) · q` when Ctrl/⌘ is held; path A: decoded from `dq = t.quaternion · ctx.start.quaternion⁻¹` and snapped by 07 6.5), or path A's free rotation `rotateWorld` (no snapping):
```
R0 = rotationYXZ(start.rotation in radians)
Q  = axisAngle(unit(axis), DEG2RAD(deltaDeg))          (rotateWorld: Q = the given matrix)
world space: R' = Bᵀ · Q · B · R0         (rotation about the world axis through the section's rotation origin)
local space: R' = R0 · Q                   (rotation about the section's current local axis, i.e. about B·R0·e_axis in world)
offset.setRotation(degrees(eulerYXZNearest(R', start.rotation in radians)))     (6.10; RULES.rotation rounds to 0.01°)
offset.position unchanged                  (the rotation origin stays fixed)
```
A drag uses one axis, because the gizmo's active axis is fixed for the drag. In local space the ring orientation `B·R'` keeps the same local axis during the drag (`R0·Q·e_axis = R0·e_axis`), so the legacy per-move `updateOrientation()` (or 07's `sync()`) is consistent.

**Anchor:** `originWorld(i) = O + B·(o + t)`, in the layout's own frame (stage for the viewport).

**Cancel:** `offset.assign(start)` for each id.

**Storage quantisation.** Every stored value is rounded (position 0.1 mm per frame component, rotation 0.01° per Euler component). The pure functions (`worldDeltaToLocalMm`, `composeRotation`, `compensateOriginChange`) are exact to float precision and are unit-tested at 1e-9 / 1e-12; anything read back from a `SectionOffset` is tested against the quantisation bound instead: ±0.05 mm per frame component (±0.087 mm = 0.05·√3 mm as a world distance), ±0.005° per Euler component (AC 10, AC 11).

### 6.9 Rotation origin change that keeps the placement

The placement is `x ↦ o + t + R·(x − o)` in frame coordinates. Changing `o0 → o1` while keeping every point fixed requires:
```
t1 = t0 + (I − R)·(o0 − o1)        (metres; stored as mm through RULES.position)
```
`compensateOriginChange` returns the new position in mm **unrounded** (it keeps every point fixed to float precision), and `setOriginKeepingPlacement` stores the origin and the position through `RULES.position`, so the stored placement is kept within the quantisation bound (±0.087 mm, 6.8). The UI writes the compensated values back. With `R = I`, `t1 = t0` exactly.

### 6.10 Normalisation, display and Euler continuity

- Rotation display: stored value, `toFixed(2)`, trailing zeros stripped. Position: `toFixed(1)`, stripped.
- **Continuity-preserving extraction (`eulerYXZNearest(m, ref)`).** Every rotation has two YXZ triples, `(x, y, z)` and `(π − x, y + π, z + π)` (wrapped to (−π, π]), except at gimbal (`cos x = 0`), where only `y − z` (x = +90°) or `y + z` (x = −90°) is determined.
  ```
  x = asin(-clamp(r23, -1, 1))
  if (|r23| < 0.9999999):
      A = {x, y: atan2(r13, r33), z: atan2(r21, r22)}                   // the r128 principal triple
      B = {x: wrap(π − x), y: wrap(A.y + π), z: wrap(A.z + π)}
      return dist(A, ref) <= dist(B, ref) ? A : B                       // dist = Σ |wrap(a_k − ref_k)|
  else:                                                                 // gimbal: keep the start roll, solve pan
      φ = atan2(-r31, r11)                                              // = y − z (x = +90°) or y + z (x = −90°)
      z = ref.z; y = wrap(r23 < 0 ? φ + z : φ − z); x = r23 < 0 ? π/2 : −π/2
  ```
  Without it, the fields jump: a section typed as Tilt 120 comes back from any gizmo rotation as Tilt 60, Pan 180, Roll 180 (the r128 principal form, |tilt| ≤ 90°), and a soffit or ceiling at exactly Tilt 90 folds its roll into its pan (`pan' = pan − roll`, `roll' = 0`). With it, Tilt 120 stays 120 (E14) and a Tilt 90 section keeps its roll (E15). The placement is exact either way.
- Typed values are stored as typed (normalised). Extraction only happens after gizmo rotations.

### 6.11 Bounds, perimeter, framing and below-floor test

```
sectionBounds(i): for row 0..panelRows (<=), col 0..edges.length-1: q = M ? transformPoint(M, e.x, y(row), e.z) : (e.x, y(row), e.z); min/max
bounds(): union of sectionBounds(i) over EVERY section (detached included); null when empty.
generativeBounds(): the same loops with M treated as null, over the ATTACHED sections only (sl.detached === false); null when
                    there is none. Identical to spec 03's definition (Phase 1 bounds() semantics) when nothing is detached.
belowFloor(i) = sectionBounds(i).min.y < -0.001   (evaluated on the stage layout, whose floor is y = 0; warning text uses Math.round(-min.y * 1000) mm)
sectionPerimeter(i): transformed points of: bottom row col 0..C (y = base) ; right column rows 1..R at col C ;
                     top row cols C-1..0 at y = base + H ; left column rows R-1..1 at col 0 ; then the first point again
                     (explicitly closed for a THREE.Line; never LineLoop, 06 6.6)
```

**Which box each consumer reads (07 C34: `FramingPolicy`'s three named boxes, 08 P2-13g).** Before 07 I4b, `WallController.rebuild()` step 4 re-targets the orbit after **every** rebuild, and this spec rebuilds after every offset commit and gizmo release. If that re-target read the transformed `bounds()`, a ceiling at Y Up 5000 would lift the orbit target by about 2.5 m the moment the drag ends. Therefore:

| Consumer | Box | Effect of offsets and detached sections |
|---|---|---|
| Automatic orbit re-target on every rebuild (before 07 I4b; I4a's legacy re-centring) | **`generativeBox`** = `generativeBounds()` of the stage layout: attached sections, pre-offset | none: the view never jumps while editing; it still follows columns, rows, curve and Heading Change, as today |
| Pivot `mesh-center` (spec 03 D5) | `generativeBox` (unchanged code) | none: offsetting a section, or adding one that is detached from the start, never moves the pivot; adding, resizing or detaching a chain section is a generative edit and can (6.17) |
| Camera Reset (`resetTo(framing)` centre), `F` with nothing selected, 07's open/new/restore framing (07 6.14, from I4b) | **`wallBox`** = `bounds()`: transformed, every section including detached ones | read only on those explicit actions, never after an edit (07 3.7); ceilings are framed |
| Safe distance D, frame width and height, `fits` | **`stageExtent`**: `worldVertices` of the sections whose LED normal has \|n.y\| ≤ 0.9 (09 Q16) | follows the real stage-facing wall after the commit's rebuild (never during a drag); ceilings, floors and risers never inflate D |
| `facing` for Reset (03 6.6) | `firstEdge`/`lastEdge` (skip detached) | none |
| Coverage, `posZ` rule (B-M10 flat model until P2-11a) | `Wall.flatBounds()` (skips detached) | none |
| Frame selection `F` and double-click (3b) | `sectionBounds(i)` of the selection: transformed | follows what the user sees |
| B-M10 coverage analyser (P2-11a, later) | ray-tests `panelQuads()`/`columnQuads` (transformed, all sections) | follows the real wall; this spec recommends that "distance to wall" become the hit distance along the optical axis (Q16) |

With identity offsets and no detached or horizontal section, the three boxes coincide, so step F's goldens are unchanged (unit test, 8.1). AC 33 states the user-visible guarantee.

### 6.12 Safe-distance floor runs (replaces `flatEdges()` in `SafeDistanceView.create`)

```js
floorRuns() {
  const runs = [];
  let chain = null, chainLast = null, chainPrevSl = null;          // the open run of non-detached sections
  this.sections.forEach((sl, i) => {
    const M = sl.postTransform;
    const sigma = sl.section.faceOrientation === 'reversed' ? -1 : 1;   // spec 01 σ (undefined before spec 01: +1)
    if (M) {                                                         // skip sections that face up/down (ceilings, risers)
      const n = transformDirection(M, sl.frame.zAxis.x, 0, sl.frame.zAxis.z);
      if (Math.abs(n.y) > 0.9) { if (!sl.detached) { chain = null; chainLast = null; chainPrevSl = null; } return; }
    }
    const pts = [];
    for (let k = 0; k < sl.edges.length; k++) {                      // loops, never spread
      const e = sl.edges[k];
      if (M) { const q = transformPoint(M, e.x, sl.baseY ?? 0, e.z); pts.push({ x: q.x, z: q.z }); }   // project onto the floor
      else pts.push({ x: e.x, z: e.z });
    }
    const facing = []; for (let k = 1; k < pts.length; k++) facing.push(sigma);   // σ per segment, aligned with edges
    if (sl.detached) { runs.push({ sectionIndices: [i], edges: pts, facing }); return; }   // never joins the chain
    const contiguous = chain !== null && ((M === null && chainPrevSl.postTransform === null)
        ? true                                                       // both generative: the walk guarantees exact continuity
        : Math.abs(pts[0].x - chainLast.x) <= 1e-9 && Math.abs(pts[0].z - chainLast.z) <= 1e-9);
    if (contiguous) { for (let k = 1; k < pts.length; k++) chain.edges.push(pts[k]); for (const f of facing) chain.facing.push(f); }
    else { chain = { sectionIndices: [], edges: pts, facing }; runs.push(chain); }
    chain.sectionIndices.push(i); chainLast = pts[pts.length - 1]; chainPrevSl = sl;
  });
  return runs;
}
```
- **Identity offsets, no detached section:** exactly one run whose `edges` equal legacy `allEdges` (2619-2647) element for element, and whose `facing` equals spec 01's `flatEdgeFacing()`. The band, the line and the label are therefore byte-identical. An empty wall gives `[]`, matching the Phase 1 empty-wall guarantee.
- A detached section anywhere in the list does not break the attached sections' run: the two-pass walk (6.2) makes consecutive attached sections contiguous whatever lies between them in the list, and `floorRuns()` visits them in list order.
- **Ownership (CR-08-a).** This spec owns `WallLayout.floorRuns()` and the per-run loop in `SafeDistanceView`. Spec 08 P2-5b owns the mitred, clamped band of **one** polyline (`SafeDistanceBand.js`). Spec 08 5.5 (§9 Feature 2 row) and its F2 gate table currently say P2-5b delivers the "band per floor run" that Feature 2 reuses; CR-08-a (applied by 07's consolidated D0) restates that as "P2-5b delivers the band builder over one polyline; Feature 2 adds `floorRuns()` and calls it once per run", and to give the builder a run-shaped input: `buildSafeDistanceBand({points, facing, sectionOfVertex}, D, opts)`, with today's `buildSafeDistanceBand(layout, D)` kept as the wrapper over the single run of `flatEdges()`.
- **`SafeDistanceView.create`:**
  - one `Mesh` holding every run's band, with each segment's offset normal multiplied by its `facing` σ (spec 01 6.4); a column whose projected length is < 1e-9 is skipped, which is only possible when transformed;
  - **B-M15 fixed** (expected; spec 08 P2-5b): the mitred, clamped builder runs once per run, never across runs, so a gap between runs is never bridged. **B-M15 open:** the legacy per-column formula per run, and the `LEGACY_SITES` row moves to `floorRuns` (5.7);
  - **one `THREE.Line` per run** (`safeLeft` of the run's first column, then every `safeRight`; with P2-5b, the run's outline), the material created before the geometry as legacy does;
  - the label at the middle point of the concatenated line points.

  The allocation order for one run equals the pre-feature build.
- D is the scalar of 08 P2-11c's `'layout'` framing, from `FramingPolicy`'s `stageExtent` (6.11, 07 C34): sections facing up or down are excluded from D exactly as `floorRuns()` excludes them from the band; D is recomputed on the commit's rebuild, never during a drag.

### 6.13 Picking, hover and visibility (all three modes)

```js
resolveHit(hit) {                                   // SectionSelection
  const ud = hit.object.userData;
  if (ud.kind !== 'led-wall' && ud.kind !== 'led-wall-back') return null;
  const sectionId = ud.sectionRanges                 // combined LED mesh and its shared-geometry shell
      ? sectionRangeForFace(ud.sectionRanges, hit.faceIndex)?.sectionId
      : ud.sectionId;                                // section and panel meshes, section-mode shells, panel-mode shells (per section)
  if (sectionId === undefined || sectionId === null) return null;
  const s = project.wall.findById(sectionId);
  if (!s) return null;
  return LOCK_ENFORCED && s.locked ? null : sectionSelectableId(sectionId);   // locked: click-through from 3b (3a: inert)
}
export function sectionRangeForFace(ranges, faceIndex) {
  const i = faceIndex * 3; let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, r = ranges[mid];
    if (i < r.indexStart) hi = mid - 1; else if (i >= r.indexStart + r.indexCount) lo = mid + 1; else return r;
  }
  return null;
}
```
`LOCK_ENFORCED` is not a runtime flag: T20 (3b) adds the `s.locked` test, and 3a has `return sectionSelectableId(sectionId)`.
- **`#nearestResolved(event)`** (path B; shared by `pickAt` and `hoverAt`): one list in registration order (legacy selectables with `isPickable()`, then providers), `raycaster.intersectObjects(list, false)`, each hit resolved through its owner (`resolveHit` or the owner's `id`; null is skipped, which implements click-through), then spec 03 5.4's rule: a positive `pickPriority` outranks wall (section) hits only, and among all other hits the nearest wins. It also returns `wallHit`, the nearest raw hit whose owner is the section provider, for the hover-hit observers (07 C37). Hovering the person, the car, the camera body or the pivot marker therefore never outlines the wall section behind it, and hover and click always agree. Path A: spec 07 6.4's `pickAt` does the same over `providers.flatMap(p => p.all())`.
- **Verified in r128 `Mesh.raycast`.** For a single (non-array) material, an indexed geometry yields `faceIndex = Math.floor(i / 3)` over the whole index buffer, and `geometry.groups` is ignored. Geometry groups are therefore **not** needed for picking. `sectionRanges` (already in the Phase 1 contract) is the mapping table, shared by reference with the combined back shell.
- **Back faces.** After spec 01 step F1-5 (T10) the LED material is `FrontSide`, and r128 `checkIntersection` culls back-face hits. The back shell (`BackSide`) is hit instead, and it resolves to the same section. In panel mode the per-section shell carries `sectionId`, and r128 raycasts it through its `matrixWorld`, i.e. the section's `postTransform`. A click from behind therefore selects the section the user sees. No material is modified during picking.
- The bounding sphere must be recomputed after the fast path. `Mesh.raycast` rejects rays against a stale `geometry.boundingSphere` before testing triangles. Panel-mode shells keep their geometry; the fast path sets `matrixWorldNeedsUpdate = true` after writing their matrix.
- **Hover (3b):** the outline is the same two-tone pair over the explicitly closed `sectionPerimeter` line (halo plus core in `theme.scene.selection.hover`, dash pattern `hoverDash`; 06 D15). The rAF guards are in 5.2.
- **Visibility on large walls (3a).** WebGL draws `LineBasicMaterial` at 1 px whatever its `linewidth`, so the outline alone nearly vanishes when `large_wall` is framed at about 100 m. Each selected section therefore also gets the translucent tint of 5.2 (`fillOpacity` 0.18, depth-tested with polygon offset, so it never shows through other geometry). In path B the hand-written gizmo (0.84 m arrows, a few pixels long at 100 m) is scaled for section targets so its arrows stay at least `MIN_ARROW_PX = 90` px long (`TransformGizmo.updateScale`, registered with `sceneManager.addPreRender`, 5.2, 07 C46), following spec 03's 24 px marker rule; camera, prop and pivot targets keep `s = 1`, so the `keyboard` and `gizmo_drag` goldens are unchanged. In path A `TransformControls` is screen-sized already. A `Line2` (fat line) outline was considered and rejected: it needs three more r128 example scripts for a cosmetic gain.

### 6.14 Frame selection (`F`, double-click; 3b)

```
L = wallController.currentLayout (stage frame)
box = union of L.sectionBounds(L.indexOfSection(id)) for the selected sections (or L.bounds() when none; return if null)
path B: center = (box.min + box.max) / 2 ; radius = max(0.5, |box.max − box.min| / 2)
        orbit.frameSphere({ center, radius })       // distance uses min(hFov, vFov), clamped to [2, 500] (5.2)
path A: orbit.frame(makeBox3(box))                  // spec 07 6.14: d = 1.15 · r / sin(min(fov, fovH)/2), keeps the view
                                                    // direction, maxDistance = max(30, 4·r)
```
Example (path B): `large_wall` (x [0, 72.149], y [0, 10], z [0, 26.260] m): radius 38.7 m; at the default vertical FOV of 50° and a wide viewport, distance = 38.7 / sin(25°) × 1.1 ≈ 100.7 m, inside the 500 m limit (the wheel limit of 30 m would have cut it off).

### 6.15 The transform-only fast path (`LEDWallView.updateSectionTransforms`)

```
if (any section of `layout` has a non-integer panelCols or panelRows) return false      // pre-B-L15 inputs: caller rebuilds
for id of sectionIds: node = #nodes.get(String(id)); i = layout.indexOfSection(id); if (!node || i < 0) return false
for id of sectionIds:
  sl = layout.sections[i]
  combined: g = builder.sectionGrid(sl, { indexBase: 0, uv: null }); write g.positions and g.normals into the combined
            position/normal arrays at node.vertexRange.vertexStart * 3 (integer by B-L15)
  section:  the same into the section mesh's own arrays from index 0
  panel:    per panel mesh: tmp.fromArray(builder.panelWorldMatrix(panel, sl.postTransform)).decompose(position, quaternion, scale)
            (identity: position.set + rotation.set(0, rotY, 0), the previous values);
            panel-mode shell (spec 01 6.9, one per section, in node.backMeshes): shell.matrix.fromArray(sl.postTransform ?? IDENTITY16);
            shell.matrixWorldNeedsUpdate = true          // geometry untouched (base-layout coordinates)
  frames (when shown): per panel, the same decomposition as the panel mesh
for each touched geometry: attribute.needsUpdate = true; geometry.computeBoundingSphere(); geometry.boundingBox = null
   (combined and section shells share the LED geometry, so they follow automatically)
return true
```
**Allocation:** only plain arrays proportional to the dragged sections' vertex count (the `sectionGrid` output) and one temporary `Matrix4`. No THREE geometry, material or texture is created, and no texture is touched. Revision 2's merged panel-mode shell with per-section vertex ranges (`shellVertexRange`, `panelShell(layout).sectionRanges`) is withdrawn: spec 01 builds one shell per section with a matrix, which is cheaper to update (one matrix instead of 4 corners per panel).

### 6.16 Worked examples (exact test vectors for `tests/unit/section-transform.test.mjs` and `geometry.test.mjs`)

The default section is 5 × 3 panels of 500 mm, flat, heading 0, layout frame. Its frame: `O = (1.25, 0, 0)`, `xAxis = (1, 0, 0)`, `zAxis = (0, 0, 1)`, `L = 2.5`, `H = 1.5`, `B = I`.

| # | Offset / input | Expected |
|---|---|---|
| E1 | identity | `offsetMatrix === null`; builder output `Object.is`-equal to the pre-feature build |
| E2 | position (0, 250, −100) mm | every vertex `+ (0, 0.25, −0.1)`; normals unchanged |
| E3 | rotation y = 90, origin bottom-center | `(0,0,0) → (1.25, 0, 1.25)`; `(2.5,0,0) → (1.25, 0, −1.25)`; normal `(0,0,1) → (1,0,0)` (±1e-12) |
| E4 | rotation x = 10, origin bottom-center | top-left `(0, 1.5, 0) → (0, 1.4772116295, 0.2604722665)`; normal `→ (0, −0.1736481777, 0.9848077530)` |
| E5 | section with `angleOffset` 30, 2 × 1 panels of 1000 mm, flat; position z = 100 mm | frame `xAxis = (0.8660254038, 0, 0.5)`, `zAxis = (−0.5, 0, 0.8660254038)`; every vertex `+ (−0.05, 0, 0.0866025404)` |
| E6 | two default sections; E3 on section 0 | section 1 edges and vertices `Object.is`-identical to the no-offset case |
| E7 | E5 frame, **world** translate drag of `(0.1, 0, 0)` m | `worldDeltaToLocalMm` = `(86.60254038, 0, −50)` mm (±1e-9); stored `(86.6, 0, −50)` mm; world movement of the stored offset `(0.1, 0, 0)` within the quantisation bound (±0.087 mm, 6.8) |
| E8 | E3, then origin changed to bottom-left | compensated `position = (1250, 0, 1250)` mm; vertex `(0,0,0)` stays at `(1.25, 0, 1.25)` |
| E9 | `RULES.rotation` (round first, then wrap): 190, −180, 540, −0.004, −179.996, 359.99, 180.004 | −170, 180, 180, 0 (and not −0), **180** (not −180), −0.01, 180 |
| E10 | `RULES.position`: 123.456, 2e6, NaN; `parse('position.x', '')`, `parse(…, 'abc')` | 123.5, 100000, 0; null, null (no write) |
| E11 | three flat sections; section 1 position z = 500 mm | `floorRuns()` returns 3 runs (`[0]`, `[1]`, `[2]`); without the offset, 1 run deep-equal to `{edges: flatEdges(), facing: flatEdgeFacing()}` |
| E12 | combined `sectionRanges` for cols 5/5/8 × rows 3/3/2 (30, 30 and 32 triangles) | `sectionRangeForFace` maps faces 0, 29, 30, 59, 60, 91 to sections 0, 0, 1, 1, 2, 2 and face 92 to null |
| E13 | three default sections A, B, C; a copy B′ of B with `detached: true, anchorId: B.id`, inserted after B (list A, B, B′, C) | B′'s edges `Object.is`-equal to B's; C's edges `Object.is`-equal to the wall without B′; `lastEdge` = C's last edge; `floorRuns()` = 2 runs (`[0, 1, 3]` chain and the detached `[2]`). Moving B′ to the end of the list (A, B, C, B′) changes none of these edges (host by id). |
| E14 | start rotation (x 120°, 0, 0); a world-Y drag of 0° | `eulerYXZNearest` returns (120, 0, 0); the r128 principal extraction would return (60, 180, 180) |
| E15 | start (tilt 90, pan 30, roll 20); world-Y drag +10° (gimbal) | stored (90, 40, 20); the r128 principal extraction would give (90, 20, 0); matrices equal ±1e-12 |
| E16 | E5 frame, **local** X drag of 0.1 m (arrows oriented by B) | `Δposition = (100, 0, 0)` mm; world movement `(0.0866025404, 0, 0.05)` |
| E17 | E5 section translated by spec 03's `(−1, 0, −2)`; E3-style rotation (**one shared test with spec 03's unit test 8**, 07 C32) | `offsetMatrix(translated)` (what `layoutProject` stores, built after `translated()`) equals `T(v)·offsetMatrix(original)·T(−v)` ±1e-12, so every vertex equals the raw-walk build translated by `v`; `originWorld` of the translated layout equals `offsetMatrix(translated)` applied to the translated rotation origin ±1e-12 (6.5) |
| E18 | E13's wall; delete B | B′ is re-anchored to C (`reanchorTargetFor`); B′'s edges `Object.is`-equal to its edges before the delete; C's start equals B's former start |
| E19 | E13's wall; tick Detached on B | B gets host A (`defaultAnchorFor`); B′ is re-anchored to C; B′'s edges `Object.is`-equal to before; B now starts where A starts (the walk of B's own fields from A's start cursor); C starts where B started |
| E20 | E19 with C deleted too (B was the last attached section after A) | the delete is allowed (A stays attached); B′ is re-anchored to A, the previous attached section; the confirm text counts 1 re-anchored section |
| E21 | relative snap, q = 10 mm: local X drag of 0.0123 m from `position.x = 37.3` | `snapAxisDisplacement` = 0.010 m; stored 47.3 (not 50); `position.y`, `.z` bit-identical to the start |
| E22 | relative snap, world X drag of 0.0123 m on the E5 frame, q = 10 mm | world displacement 0.010 m along X; stored `start + (8.7, 0, −5.0)` mm (`8.660…` and `−5` rounded to 0.1 mm) |

### 6.17 Interplay with `angleOffset` and with spec 03 (pivot)

- **`angleOffset` (Heading Change)** is part of the generative walk. It rotates the cursor before the section, and that rotation carries to every following section (B-4). It also rotates the section frame, so a section's offset follows its heading. **The yaw (Pan) offset** rotates only this section, about its rotation origin, after the walk. Following sections start at this section's *generative* last edge. Both can be combined, and their order is fixed: the walk (`angleOffset`, curve, Detached) first, then the offset.
- **Composition with spec 03:** `x_frame = T_frame · S_i · v` (spec 03 5.10), realised exactly as 07 C32 (spec 03 5.10 #2) prescribes: `translated()` moves the raw walk by `T_frame`, and `applySectionOffsets(out)` then builds `S'_i = T_frame · S_i · T_frame⁻¹` from the translated section frame (equivariance, 6.5), which the builder applies to the translated vertex `T_frame · v` (6.6). There is no root group and no separate `W`: the stage translation is already in the layout, so it is never applied twice.
- **Pivot stability:** spec 03 resolves the anchor from generative quantities only (edges, `firstEdge`/`lastEdge`, `generativeBounds()`), and `resolvePivot` runs on the raw walk before any section matrix exists (6.6). `generativeBounds()` and `firstEdge`/`lastEdge` also skip detached sections. Offsetting a section (fields, Reset, batch) or dragging it with the gizmo therefore never moves the wall pivot (spec 03 D5): `WALL_REBUILT.stageShift` is (0, 0) for every offset edit, in every pivot mode.
- **Detaching is different.** Ticking or unticking Detached changes the attached chain (6.2), so it is a generative edit like adding, deleting or resizing a section. In `wall-center` and `mesh-center` it can move the anchor, and with it the stage origin: the rebuild carries `cause: 'edit'` and a non-zero `stageShift`, spec 03's `#pivot-status` shows the stage-origin shift (03 3.6, Q15), and the camera and props keep their stage coordinates (03 D6). In `bottom-left` the anchor never moves. The unit test is in 8.1 (`wall-controller.test.mjs`, "Pivot interplay").
- **Exports vs viewport:** the export layout is the stage layout translated by `(0, −P.y, 0)`. Section 7's guarantee is stated with that translation.

---

## 7. Export impact

| Output | All offsets identity, no detached section (every existing harness scenario) | With offsets / detached sections |
|---|---|---|
| OBJ combined / section | **byte-identical** | `v` lines transformed. `vn`: rotated per-vertex normals (spec 01's normals, rotated by `N`). `vt`, `f` and object names unchanged. |
| OBJ panel | **byte-identical** | 4 transformed corners per panel; `vn` rotated by `N`. |
| MTL | **byte-identical** | unchanged |
| glTF | **byte-identical** | POSITION transformed (accessor min/max recomputed from the float64 values as today); NORMAL rotated. Node graph unchanged: transforms are **baked**, with no per-section node matrices or `extras` (Q19). |
| JSON (`exportJSON`, ZIP JSON, round trips; path A also the `history` and `autosave` variants) | **changes**: every section gains `offset` (identity, `position_m` in metres), `locked: false`, `detached: false` and `anchor_section_id: null` (step A) | values as stored (positions as `Math.round(mm * 10) / 10000` m) |
| Panel-ID PNG, ZIP textures | **byte-identical** | unchanged. Offsets never affect textures. Reordering changes column letters, as today. |
| Safe-distance OBJ (needs B-M1) | **byte-identical** | band per floor run (6.12); sections facing up or down are excluded |
| Viewport screenshots | identical, except where a step selects or hovers a section (8.3); the help badge is not changed | outlines, tints, offsets |

**Guarantee:** for every mode and format, the exported vertex positions equal the viewport's positions **translated by spec 03's export-frame offset `(0, −P.y, 0)`**, to within 1e-6 m. They are equal when `P.y = 0` (every floor-level pivot, and always before spec 03). The viewport and the exporters use the same builder and the same `layoutProject` (behaviour B-9 preserved).

---

## 8. Testing

### 8.1 Unit tests (`node --test "tests/unit/**/*.test.mjs"`)

| File | Cases |
|---|---|
| `tests/unit/section-transform.test.mjs` (new) | E1-E10, E14-E17, E21, E22. `rotationYXZ` against the hard-coded r128 formula for 200 seeded angle triples (`Object.is` on all 9 elements); `quaternionFromMatrix3` against the r128 formula. **Round trips on matrices, not angles:** `rotationYXZ(eulerYXZFromMatrix(m))` and `rotationYXZ(eulerYXZNearest(m, ref))` equal `m` within 1e-12 element-wise for 500 fuzzed matrices including x = ±90° exactly; `eulerYXZNearest(rotationYXZ(a), a)` returns `a` (wrapped) within 1e-9 off gimbal and keeps `a.z` exactly at gimbal. Rigidity of `offsetMatrix` for 500 fuzzed offsets on fuzzed curved and angled sections. Rotation-origin invariance (6.5). Translation equivariance (E17, one shared test with spec 03's unit test 8). **Pure functions at float precision:** `compensateOriginChange` (unrounded result) keeps all grid points fixed ±1e-9 m; `worldDeltaToLocalMm`; `composeRotation` world vs local ±1e-12. **Stored values at the quantisation bound (6.8):** after `setOriginKeepingPlacement`, every grid point stays within ±0.087 mm; a stored rotation's matrix equals the unrounded one within the bound of ±0.005° per Euler component. `snapAxisDisplacement` is relative in both spaces: the displacement is a multiple of q; in local space exactly one field changes; in world space the motion stays on the axis. |
| `tests/unit/geometry.test.mjs` (extended) | With every offset identity and no detached section: `layoutProject`, `sectionGrid`, `combinedGrid`, `panelCorners`, `panelShell` and `flatEdges` are `Object.is`-equal to the previous oracle over the existing fuzz corpus, and `generativeBounds()` deep-equals `bounds()`. The two-pass walk: E13, E18-E20, plus fuzzed walls with random detached flags and hosts (every attached section's edges equal the walk with the detached sections removed; every detached section's edges equal the walk of its fields from its host's start; moving detached sections around the list changes no edge). `resolveAnchor` fallbacks (missing host, detached host). Downstream invariance (E6) over fuzzed walls. `bounds()` with offsets equals a brute-force transform of every vertex; `generativeBounds()` is unchanged by any offset and ignores detached sections. `floorRuns()` with identity deep-equals `{edges: flatEdges(), facing: flatEdgeFacing()}`; E11; a detached section between two attached ones leaves one chain run. `sectionRangeForFace` over fuzzed range tables (E12). `firstEdge`/`lastEdge` with detached sections. `pivotPoint('mesh-center')` unchanged by offsets and by adding a detached section. `layoutProject` order (07 C32): `translated()` on a layout with a non-null `postTransform` throws; `applySectionOffsets` runs on the translated copy, and the stage and export layouts' vertices differ exactly by their translations; the identity transform of `wallGroup` is an invariant (no wall root transform). The `det3 > 0` assert. |
| `tests/unit/framing.test.mjs` (extended; spec 03's file) | With 08 P2-11c's `'layout'` framing and `FramingPolicy`'s boxes (07 C34): for fuzzed walls, the automatic orbit target (`generativeBox`) is `Object.is`-equal before and after setting a random offset on a random section, and before and after adding a detached ceiling (AC 33); `wallBox` includes the ceiling; `stageExtent` (and so D) ignores a section whose LED normal has \|n.y\| > 0.9. With no offsets and no detached or horizontal section the three boxes coincide and the framing is `Object.is`-equal to step F's expected values (no golden change). |
| `tests/unit/domain.test.mjs` (extended) | `SectionOffset.RULES`, `parse` and `set` (E9 including −179.996 → 180, E10; '' and 'abc' write nothing). `assign`, `reset`, `setOriginKeepingPlacement`. The getters return frozen copies. `WallSection` constructor normalisation (never a shared offset instance; `anchorId` is `null` unless detached), `setLocked`, `setDetached`, `setAnchor`, `clone` (copies `detached` and `anchorId`). `Wall.flatBounds` skips detached sections. `Wall.defaultAnchorFor`, `reanchorTargetFor` (after, else before; with pending and excluded sets), `dependantsOf`, `attachedCount`. 3b: `Wall.duplicate` ids, names, placement and offset deep copy; `Wall.move` clamping and no-op; `uniqueCopyName` with the 32-character limit; `LogoLibrary.copy`. |
| `tests/unit/io.test.mjs` (extended; path A: spec 07's `project-v2.test.mjs` cases) | v2 write has the keys of 4.3 for identity and non-identity values; `position_m` equals `Math.round(mm * 10) / 10000` and reads back to the same mm (byte-stable second save). Read: v1 gives identity; v2 round trip is exact; every row of 4.2 sanitises with a warning (including invalid and detached hosts, and an all-detached file); `anchor_section_id` survives spec 07 6.8's id reassignment. Path A: the reachability property test includes every `SectionOffset.RULES` output. **Identity byte-equality:** OBJ and glTF from a v1 import and from a v2 import of the same wall with explicit zero offsets are byte-identical in all 3 modes. Transformed exports: OBJ `v` lines and glTF POSITION equal `transformPoint` of the untransformed vertices. Export layout = stage layout − (0, P.y, 0) with a `mesh-center` pivot. |
| `tests/unit/wall-controller.test.mjs` (extended) | Spies for rows `F2-1`..`F2-13` (full rebuild count, fast-path count). Drag (both adapters, fake gizmo): N moves give 0 rebuilds and N fast paths, release gives 1 rebuild; release without movement gives 0; a double `onMouseUp` gives 1; the fast path returning false gives one rebuild per move; `endGizmoDrag({cancel: true})` restores the exact start offsets and keeps the selection; `detach()` during a drag cancels. Unparsable entries give 0 rebuilds and no event. **Single-card events:** `commitSectionEdit` and `setSectionColor` emit `SECTION_CHANGED` once, before their rebuild. **Stale-layout regression:** with a gizmo mode active and the last section selected, `duplicateSections([lastId])` does not throw, `view.sectionNodes().size === wall.count`, and the gizmo anchor equals the copy's `originWorld`. `deleteSections` keeps ≥ 1 attached section and refuses without partial deletes; it re-anchors dependants of deleted hosts (E18, E20); `prune` runs after the rebuild. `setSectionsDetached` re-anchors dependants (E19) and never detaches the last attached section. Add selects the new section unless a camera, prop, pivot or projector is selected. Path B: import deselects a section selection before the rebuild. Every mutator invalidates `currentLayout` (spy on `layout()`). Path A: each use case records exactly one `History` entry with the label and coalesce key of 5.4, after its rebuild; drags record none. 3a: `locked: true` sections are edited like any other. 3b: locked sections are skipped by batch, offset, delete and reorder. **Pivot interplay (6.17; with spec 03 landed; part of T17b):** on `concave_offsets` with a `wall-center` pivot, `setSectionsDetached([lastId], true)` rebuilds once with `cause: 'edit'`; the new stage-frame `wall-center` anchor is the chord midpoint of the remaining attached sections (±1e-12 against `resolvePivot` on the walk without the last section), and `WALL_REBUILT.stageShift` equals `so(after) − so(before)` and is non-zero; delivering that payload to spec 03's `PivotPanel` (its unit test 17 fixture) writes the wall-edit stage-origin message to `#pivot-status`; camera and prop poses are unchanged (03 D6). The same detach in `bottom-left` gives `stageShift` (0, 0). An offset edit, a Reset and a committed gizmo drag on any section give `stageShift` (0, 0) in all three pivot modes. |
| `tests/unit/selection.test.mjs` (new; fake meshes and hits, no THREE; path B) | Provider resolution order, spec 03's pick rule (priority beats wall hits only, otherwise the nearest), and click-through on null resolutions. Back-shell hits resolve to their section (`sectionRanges` in combined mode, `sectionId` in section and panel mode). Kind mixing replaces the selection (including `'projector'`). `replace`, `add`, `toggle` and `range` semantics; a modified click on empty space changes nothing. `register` throws for a new id without `kind`. The `SELECTION_CHANGED` payload (with `modes`), and the order emit → `gizmo.attach/detach` → the `addObserver` observers, exactly once per path. `prune`. 3b: hover events fire only when the id changes; hover over a prop hit nearer than a section gives `null`; hover is `null` while `gizmo.hoveredAxis` is set; the hover-hit observers receive the raw wall hit. |
| `tests/unit/viewport-input.test.mjs` (new; path B; fake canvas, window and gizmo) | A press on the canvas and a release outside, then a release over the canvas near the press point, picks nothing (`window` `mouseup` and `mouseleave` clear `#press`). `mod(e)` is `metaKey` on a mac platform and `ctrlKey` elsewhere; Shift gives `'add'`. The canvas `contextmenu` is prevented. Delete with a focused toolbar button deletes nothing (07 C44). Escape during a sidebar reorder drag cancels the reorder before any deselect (priority 75, 07 C42). |
| `tests/unit/gizmo-scale.test.mjs` (new; path B) | `updateScale` gives `s = 1` for camera, prop and pivot targets at every distance, and keeps a section target's arrow ≥ 90 px at 100 m; it is registered through `addPreRender` and runs once per rendered frame (07 C46). |
| `tests/unit/section-list.test.mjs` (new; pure helpers) | 3a: the header click rule (`detail` 0 and 1 act, 2 and more are ignored; a double-click on a sole-selected card ends expanded). 3b: `dropIndex(cardRects, clientY, fromIndex)` for every midpoint boundary, first and last positions, and no-op drops. |
| `tests/unit/orbit-frame.test.mjs` (new, 3b, path B) | `frameSphere` distance with `min(hFov, vFov)` for a narrow and a wide aspect; `large_wall` fits (distance ≤ 500); the wheel expression with `#zoomMax === 30` is `Object.is`-equal to the legacy expression over a seeded grid. |
| `tests/unit/keymap.test.mjs` (path A; spec 07's file) | The five `sections.*` rows have registered actions once this feature lands (07's "every row of a landed feature has a registered action" rule). |

### 8.2 Golden-master harness (`tests/regression`)

**T0 (before any feature code; harness only).**
- In `uiScenario` (scenarios.mjs line 224, `collapse-card2`) and `uiVisualScenario` (line 483, `collapse-card0`) the collapse clicks change from `.section-header` to `.section-toggle`. In the legacy app the toggle is inside the header and both clicks bubble to the same header listener, so a run against the pristine baseline must report **identical**. This proves the harness change is neutral before the new header semantics land.
- `sectionsSnapshot()` (`tests/regression/lib/app.mjs` line 284) gains four booleans per card from its classes: `selected`, `primary`, `locked`, `hovered`. It already records each card's text, every input/select with its `data-*` attributes, and every button, so the new card markup is captured without further format changes. The format change is refreshed on the **pre-feature** build in its own step (D0, 8.3).

**New configs in `configs.mjs`:**
- `offsets_v2` (v2 format, a realistic stage):
  - section 0 "Wall 1": 5 × 3 flat; on a riser and leaning back: position (0, 0.25, −0.1) m, tilt −5;
  - section 1 "Wall 2": 5 × 3 flat, no offset;
  - section 2 "Soffit": a detached copy of Wall 2 with `anchor_section_id` = Wall 2's id, rows 1, position y 1.5 m, tilt 90 (a canopy along the top of Wall 2, facing down; no hole);
  - section 3 "Wing": Heading Change −20, curve 3, pan 10, roll 5, rotation origin `center`, LED side reversed (if spec 01 T9 has landed). **No `locked` flag** in 3a: `locked` is inert until 3b, and 3b's `section_list_ops` covers it.
- `offsets_identity_v2`: the `flat3` wall written as v2 with explicit zero offsets, `detached: false` and `anchor_section_id: null`.

**New scenarios in `tests/regression/scenarios-sections.mjs`**, registered from `scenarios.mjs` like `scenarios-extra.mjs` (and spec 03's `scenarios-features.mjs`). All are **forward goldens**, captured from the feature build once their criteria have been checked by hand. Every pointer sequence ends with `mouseMoved` to a parked point off the wall (the `parkMouse` helper) before screenshots. A section is always located by colour **before** it is selected (or after an Escape), because the selection tint changes its colour.

| Scenario | Phase | Steps | Outputs |
|---|---|---|---|
| `offsets` | 3a | `configCapture` with `offsets_v2` (all modes, every export, ZIP JSON round trip) plus screenshots of the front and top views | about 30 |
| `offsets_identity` | 3a | `configCapture` with `offsets_identity_v2`. A small post-check script asserts that its OBJ, glTF and PNG files equal `flat3`'s byte for byte. | about 28 |
| `section_select` | 3a | Setup: default wall plus 2 added sections ("Wall 2", "Wall 3"), then section 1's Rows set to 2 on its card, so Rows differs across sections. Steps: (1) per mesh mode: Escape, then click a wall pixel of section 2 found by colour search (`locate()` with the section's colour read from the harness palette hook or the swatch value in `sectionsSnapshot`, never a literal; 07 C53); record the badge text, the card classes (`selected`, `primary`, collapsed) and a screenshot (outline and tint visible); (2) Shift-click section 1 (`add`); record the batch panel visibility and count; Ctrl-click section 1 (`toggle`, removed) and Shift-click it again; (3) record that the batch Rows field shows the **Mixed** placeholder; set batch Rows to '' and record that nothing changed and the placeholder is kept; set batch Columns to 4 and record stats and JSON; (4) a press-drag-release of 120 px over the wall leaves the selection unchanged; record `{hoveredCards: count('.wall-section.hovered'), cursor: canvas.style.cursor}` (expected 0 and ''); a press on the wall, a release outside the canvas, then a click-free `mouseMoved`/`mouseReleased` over the canvas near the press point: selection unchanged (stale press); (5) after spec 01 step F1-5: Escape, `#view-front`, then a horizontal drag of 314 px (canvas centre ± 157 px in 20 px moves; 0.01 rad/px gives θ ≈ π, spec 01's `behind` pose), so the camera looks at the wall from −Z; click the **leftmost** cabinet block (`probePoint` of the cabinet colour `theme.scene.wallBack` over the left 20 % of its mask): from behind the wall is mirrored, so it belongs to the last section; expected badge `Selected: Wall 3`; (6) Escape deselects; (7) clicking empty sky deselects | about 28 |
| `section_offsets_ui` | 3a | Type every offset field on card 1, including out-of-range values (200000, 270) and '' / 'abc' (reverted, no rebuild); change the rotation origin (compensation write-back recorded); Reset; Detached on (host defaults to card 0) and off (stats, OBJ); with card 2 detached on card 1, delete card 1 and record card 2's Starts at and its OBJ vertices (unchanged, re-anchored); LED side Reversed via the select under Advanced; `#flip-all-sections` with one section selected and with none (OBJ `vn`); Export JSON and OBJ | about 18 |
| `section_gizmo` | 3a (snap steps 3b) | Select section 2, press G, switch to `#view-top` so the X arrow lies over the floor and not over a magenta or green wall (`isGizmoRed` is calibrated on the dark background); find the red X-arrow pixels (the WP1 `gizmo_drag` technique; the X handle is red in both gizmo paths); drag 80 px; Export JSON (offset value) and OBJ. 3b: Ctrl-drag in world space (assert `(value − start) % 10 === 0` along the dragged axis and the other fields unchanged), then L and a Ctrl-drag in local space (assert `(value − start) % 10 === 0` and the other two position fields bit-identical: relative snapping, spec 03 D9). R and a Y-ring drag (green ring, top view: pan changes); a second drag with Escape restores it and keeps the section selected. A `large_wall` step (3a): select a section, G, record the gizmo arrow length in pixels (≥ 90 px, 6.13). | about 16 |
| `section_list_ops` | 3b | Duplicate (Ctrl+D and the button), Move up/down, **pointer reorder** by dragging `.section-drag-handle` with the plain-CDP `drag()` helper (the reorder is pointer-based, so no `Input.setInterceptDrags` / `dispatchDragEvent` is needed), a reorder of a host with a detached dependant (the dependant keeps its host and its OBJ vertices), Collapse all / Expand all, collapse map preserved across a duplicate, Delete selected (path B: the confirm is recorded in `dialogs.json`; path A: the dialog DOM is recorded and its Delete button clicked), Delete key with every attached section selected (alert or warn toast, nothing deleted), lock (inputs disabled, viewport click-through recorded, badge `(locked)`) | about 22 |
| `section_hover` | 3b | Move over section 2: screenshot with the hover outline, card `.hovered`, cursor `pointer`. Move over the person (on): no outline. Press: outline gone. `mouseleave`: gone. Re-run the `keyboard` orbit-drag sequence and the `ui_visual` person pick: no outline and no `.hovered` card afterwards (the hover-hygiene assertion). | about 10 |

**Hover hygiene for existing scenarios.** Hover lands in 3b. With the guards of 5.2, a press always clears the hover and a pending rAF never re-sets it, and the nearest-hit rule keeps the person pick from outlining the wall. Step E2 (8.3) therefore expects every existing scenario to stay IDENTICAL. Any hover outline in an existing recorded screenshot is a FAIL to investigate, not to re-baseline. The `gizmo_drag` park point (canvas left edge, 2 % x) is checked in E2 to lie off the wall; an outline there would only appear in the unrecorded `locate()` screenshot, because every recorded screenshot follows a press.

### 8.3 Intentional golden changes and re-baseline steps (one commit each)

Every step uses spec 08 §8.1's procedure (the one spec 01 8.4 follows): write the expected manifest `tests/regression/expected/F2-<step>.json` first, run a full candidate (never `--only` for the gate itself), gate with `compare.mjs --expect`, review, promote, then re-run and require a clean compare. The globs below are the manifest contents.

| Step | Lands with | Expected harness result (globs under the candidate output) | Re-baseline |
|---|---|---|---|
| T0 | harness collapse clicks | IDENTICAL against the pristine baseline | none |
| **D0** | `sectionsSnapshot` format (T0), run on the **pre-feature** build | Only the snapshot-bearing states change, by the four new `false` booleans: `{default,flat3,concave_offsets,convex,mixed,box_corner,large_wall}/sections_initial.json`; `ui_sections/ui_[0-9][0-9]_*.json`; `import_edge/{i_empty_state,i_after_add,ii_strings_state,iv_after_import,iv_after_delete,v_after_import,v_after_add,vi_before,vi_after,vii_after,viii_after}.json`; Phase 2 states that record snapshots (`p2_zero_inputs/*`, `p2_xss_names/sections_*`) | verify the diff contains only the four keys |
| **A** | T1 + T5 (domain + v2 fields) | Only JSON outputs change, by the `offset` (with `position_m`), `locked`, `detached` and `anchor_section_id` keys (path A: plus this release's one `version` revision bump, its number assigned at merge, 07 C40): `**/*__export-json__*.json`, `**/*__export-zip__*.zip` and `**/*__export-zip__*.zip.entries/**/*.json`. Everything else IDENTICAL. Q24 (key names) must be settled before this step. | verify the diff contains only those keys |
| **B** | T2-T4, T6, T7, T17a (geometry, exports, views, the Detached walk) | **Every existing output IDENTICAL** (the exit-0 gate), including spec 03's step F framing goldens (6.11: `generativeBounds()` equals `bounds()` at identity). New `offsets` / `offsets_identity` baselines are captured, reviewed manually (positions spot-checked against the E-vectors) and merged. | New scenarios only |
| **C** | T8-T10, T13 (selection, gizmo, controller, highlight) | Add now selects the new section (P-ADD), so the **viewport badge** reads "Selected: Wall 2" in **every state recorded after an `#add-section-btn` click until the next deselect or import**. Today that is `ui_visual/07_two_sections.{viewport.screenshot.png,text.json,styles.json}`, `ui_visual/08_collapsed_and_4k_warning.{viewport.screenshot.png,text.json,styles.json}` and `ui_visual/09_narrow_800.{viewport.screenshot.png,styles.json}` (no deselect happens before `narrow_800`; `ui_visual` masks the canvas, so the outline and tint do not show). `ui_sections` and `import_edge` record no badge and do **not** change here (their card flags change in D1). `keyboard/*` only if B-M14's own re-baseline did not already cover click-select. Spec 03's `pivot_gizmo` is **not** in this set (its Escape behaviour is spec 03's, 5.5). Every export IDENTICAL. New `section_select`, `section_offsets_ui`, `section_gizmo` baselines. | `ui_visual[,keyboard]` plus the new scenarios |
| **D1** | T11, T12 (cards, toolbar, batch panel, CSS, markup) | Card text, inputs and buttons change (offset group, Detached and Starts at, spec 01's LED side select moved under Advanced, chips, "Heading Change" label and hint), and the card class mirror lands, so the `selected`/`primary` flags of P-ADD appear: every snapshot file of D0 (in `ui_sections` from `ui_01_after_add_1` on; in `import_edge` `i_after_add` and `v_after_add` and the later states until an import); `#flip-all-sections` moves from below `#add-section-btn` into `#section-toolbar`; `ui_visual/*.styles.json`, `ui_visual/*.text.json`, `ui_visual/*.sidebar.screenshot.png`, `ui_visual/09_narrow_800.*`. Every export and canvas screenshot IDENTICAL. | Same scenario list as D0 plus `ui_visual` |
| **E1** | T20-T24 UI (3b: lock button, drag handle, toolbar buttons, snap selects) | The same file set as D1 | Merge with D1 when 3a and 3b ship in one release |
| **E2** | 3b scenarios | New `section_list_ops`, `section_hover` baselines. Every existing scenario IDENTICAL (hover hygiene). | New scenarios only |

There is **no help-badge step**: this spec does not change `.info-badge` (3.5.1), so no canvas screenshot of any existing scenario changes for a hint. A failing comparison outside the expected set blocks the step (REFACTOR_PLAN section 6 rule).

### 8.4 Manual checks

- A gizmo drag at 60 fps on `large_wall` (3,200 panels) in combined and panel mode. Fast-path time below 4 ms per move, measured with `performance.now()` in a debug build.
- With spec 01's normal lines on, the lines follow a gizmo drag live.
- Hover raycasts with no visible stutter (3b).
- Cards are keyboard accessible (Tab, Enter, Space, Ctrl/Shift variants); a screen reader announces the list, the current card and the pressed state; activating a header with a screen reader (`detail === 0`) selects it.
- macOS: ⌘-click toggles in the viewport and the list; Ctrl-click acts as a plain click and opens no context menu over the canvas; Cmd variants of the shortcuts; no stuck orbit key after Cmd+D (3b).
- On `large_wall` framed whole (about 100 m away): the selected section's tint is clearly visible, and the gizmo arrows are at least 90 px long and draggable (path B).
- After an offset commit and after a gizmo release, the orbit target does not move (AC 33).
- Pointer reorder with touch on a tablet (3b).
- A GitHub Pages smoke test.

---

## 9. Acceptance criteria

1. **[3a] Identity.** With all offsets identity and no detached section, every OBJ, MTL, glTF, PNG and safe-distance output of every pre-existing harness scenario is byte-identical to the pre-feature baseline. JSON outputs differ only by the added `offset`, `locked`, `detached` and `anchor_section_id` keys (path A: plus spec 07's revision bump) (step A).
2. **[3a] Pick, all modes.** Clicking (press + release under 4 px) on a section in combined, section and panel mode selects exactly that section, with or without a gizmo mode. The badge reads `Selected: <name>`. The card has `.selected.primary` and is expanded and scrolled into view. The outline and the tint are visible.
3. **[3a] Combined and back-face mapping.** For every section of a fuzzed combined wall, a ray through that section's panel centres resolves to that section's id (unit test with `sectionRangeForFace` plus `section_select`). After spec 01 step F1-5, a click on the back of a section, in every mode (panel mode through its per-section shell), selects that section (back-shell hit), never a farther one.
4. **[3a] Click vs drag.** A press-drag-release over the wall of more than 4 px never changes the selection (B-M14). A press on the canvas released outside it never completes a later click.
5. **[3a] Multi-select.** In the viewport, Shift-click adds and Ctrl-click (⌘-click on macOS) toggles. In the list, Shift-click selects a range and Ctrl/⌘-click toggles. On macOS, Ctrl-click opens no context menu over the canvas. Selecting a camera, prop, pivot or HDRI point clears the section selection, and the other way round. Only the primary card is expanded on a viewport selection.
6. **List ↔ viewport sync.** [3a] Selecting from the list outlines the section in the viewport. [3b] Hovering a card shows the hover outline; hovering the wall marks the card `.hovered`; hovering a prop or the pivot marker outlines nothing.
7. **[3a] Offset locality.** Setting `position.z = 100` on section k moves every vertex of section k by exactly 0.1 m along its frame Z (±1e-9). Every vertex of every other section is `Object.is`-equal to the value before.
8. **[3a] Rotation about the origin.** For each rotation origin, the origin point maps to `origin + B·t` (±1e-9), and the E3, E4 and E8 vectors hold (E8 for the stored, compensated position: ±0.087 mm).
9. **[3a] Regeneration.** After an upstream change (columns, curve, Heading Change or reorder), a downstream section keeps its stored offset values and is re-placed relative to its new generative frame. Nothing about offsets enters the cursor walk (code review plus test E6).
10. **[3a] Gizmo translate.** The pure conversion is exact: `worldDeltaToLocalMm` gives `1000·Bᵀ·(Δ, 0, 0)` (±1e-9 mm; E7). Stored values are quantised: in world space, dragging the X arrow by Δ metres moves every selected section by (Δ, 0, 0) within ±0.087 mm (±0.05 mm per frame component, 6.8), and each stored component is within ±0.05 mm of `start + 1000·Bᵀ·(Δ, 0, 0)`. In local space the arrows are oriented by the section frame B: dragging the local X arrow by Δ moves the section by `Δ·xAxis` and changes **only** `position.x`, by `1000·Δ` within ±0.05 mm (E16); `position.y` and `.z` stay bit-identical.
11. **[3a] Gizmo rotate.** A world-Y ring drag of +θ rotates the section by Ry(θ) about its rotation origin; for a section with zero tilt and roll, only the pan changes, by +θ (B-M12 fixed). For a local-X ring drag of +δ, `composeRotation` returns Euler angles whose matrix equals `R0·Rx(δ)` (±1e-9), and each **stored** Euler component is within ±0.005° of those angles; for a section with **zero roll**, only the tilt changes, by +δ (±0.005°). The Euler fields stay continuous with the drag start (E14, E15).
12. **[3a] Drag cost.** A drag with N moves performs 0 full rebuilds during the moves and exactly 1 on release (spy test). The cards' offset inputs update during the drag.
13. **Cancel and snap.** [3a] Escape during a drag (spec 03's order: `gizmo.cancelDrag()` → `endGizmoDrag({cancel: true})`) restores the exact pre-drag offset values, rebuilds once if anything moved, and keeps the selection; `detach()` during a drag does the same. [3b] With Ctrl/⌘ held, snapping is **relative** (spec 03 D9) in both spaces: the dragged distance along the dragged axis is a multiple of the snap mm (world: the motion stays on the world axis; local: exactly one field changes, by a multiple of the snap mm), fields that are not dragged keep their stored value bit-for-bit, and the dragged angle is a multiple of the snap degrees.
14. **[3a] Detached.** A detached copy of a section, with identical fields and that section as its host, overlays it exactly wherever it sits in the list (E13). The attached sections are `Object.is`-identical to the wall without the detached section. `firstEdge`/`lastEdge`, spec 03's `wall-center` and `mesh-center` anchors, the framing bounds and `Wall.flatBounds()` ignore detached sections. Deleting or detaching a host re-anchors its dependants to the next attached section without moving them (E18, E19), or to the previous one when there is no next (E20). At least one section always stays attached. The `offsets_v2` soffit leaves no gap at floor level.
15. **[3a] LED side.** Spec 01's LED side select, now under the card's Advanced disclosure, and the batch panel set `faceOrientation`. `#flip-all-sections`, now in the section toolbar, toggles the selected sections, or every section when nothing is selected, in one rebuild. Z Out keeps its direction when the LED side changes.
16. **[3a] Batch edit.** Setting Columns = 4 on N selected sections sets `panelCols = 4` on every editable selected section in one rebuild. Fields with differing values show the "Mixed" placeholder. Clearing a Mixed field (or typing a non-number) writes nothing and restores the placeholder. Editing one of the selected sections on its own card updates the batch panel at once (shared value or Mixed).
17. **[3a] Collapse state.** Collapse and expand state survives every re-render (add, delete, panel-ID toggles; 3b: duplicate, reorder), except import, which shows only the first card expanded (legacy V-2). A double-click on a header leaves the card expanded, also when the card was already the sole selection. A header activated with `detail === 0` (programmatic or assistive-technology click) acts as a plain click.
18. **[3a] Frames and panel mode** follow the offsets (screenshot in `offsets`).
19. **[3a] Safe distance.** With offsets or detached sections, the floor band is built per contiguous floor run and never bridges a discontinuity. Sections facing up or down get no band. Each segment uses its section's facing σ. With identity offsets the band, line, label and OBJ are byte-identical to the pre-feature build.
20. **[3a] Exports.** OBJ and glTF vertex positions equal the viewport positions translated by spec 03's export-frame offset `(0, −P.y, 0)` (±1e-6), in all three modes, for the `offsets` config with a `bottom-left` and with a `mesh-center` pivot.
21. **[3a] JSON v2.** The round trip preserves the offset (written as `position_m`, read back to the same mm), the lock flag, the Detached flag and the host exactly, and a second save is byte-identical to the first. v1 imports get identity values. Invalid values are sanitised per 4.2, with one summary report. A file with `locked: true` opens in a 3a build fully editable and saves the flag back unchanged.
22. **Bounds and framing.** [3a] `WallLayout.bounds()` includes the offsets and every section. [3b] `F` frames the selection, or the whole wall when nothing is selected, including `large_wall` and a narrow (portrait) viewport.
23. **[3a] Robustness.** Duplicating (3b) or deleting the last section with a gizmo mode active never throws, and afterwards the view has exactly one node per section. Every reader resolves sections by id.
24. **[3b] Lock.** A locked section is skipped by viewport picking (click-through); shows disabled inputs (the name stays editable); is skipped by batch edits, with the count shown; cannot be deleted, moved or dragged, and gets no gizmo axes. The badge shows `(locked)` immediately. Unlocking restores everything. In 3a, `locked` has no effect (AC 21).
25. **[3b] Duplicate.** The copy is inserted directly after its source with a new unique id, the name `"<name> copy"` (unique, ≤ 32 characters), every field equal including the offset (deep copy) and the Detached host, `locked: false`, and a copied logo. The copies become the selection after the rebuild. Exactly one rebuild.
26. **[3b] Reorder.** Move up/down and the pointer drag change the order and the generative chain, also with touch. Detached sections keep their host. The collapse state of every card is preserved. Exactly one rebuild.
27. **[3b] Keyboard.** No new shortcut fires while typing in INPUT, TEXTAREA, SELECT or contenteditable, or on key repeat. Letters match the printed key (`e.key`; brackets by `e.code`, 07 C43). Ctrl/⌘+D and Ctrl/⌘+A do not move the orbit target; Ctrl/⌘+A acts only on the canvas or `body`. Delete with a camera or prop selected does nothing, and Delete/Backspace act only when the target is `#three-canvas`, `body`, `#wall-sections` or `#section-toolbar` (07 C44). Escape during a sidebar reorder drag cancels the drag (registry priority 75, 07 C42). Path A: the five actions are `KEYMAP` rows and no `keydown` listener is added.
28. **[3b] Hover hygiene.** After any press sequence of the existing scenarios, no hover outline and no `.hovered` card remain (asserted in `section_hover`, and every existing scenario IDENTICAL in step E2).
29. **[3a] Below-floor warning** appears exactly when the transformed min y < −1 mm.
30. **[3a] Normals view.** With spec 01's normal lines on, the lines follow a gizmo drag on every move (the `SECTION_CHANGED` live subscription).
31. **Performance.** [3a] On `large_wall`, the fast path of a gizmo move takes ≤ 4 ms. [3b] Hover adds ≤ 2 ms per frame on the reference machine (manual check).
32. **Docs.** ARCHITECTURE.md is amended per 5.9 in the same commits, and the change requests of 10.3 are applied to specs 01, 03, 05, 07 and 08 (by 07's consolidated D0). Static checks (layering, DOM-id ownership including `#flip-all-sections`, LEGACY parity, events subscribed, domain-field writers, `RENDER_ORDER`, css-slices) are green.
33. **[3a] Stable framing.** An offset commit, a gizmo release, a Reset of offsets or adding a detached section never moves the automatic orbit target (it reads `FramingPolicy`'s `generativeBox`, 6.11, 07 C34); a change of columns, rows, curve or Heading Change still does. Camera Reset and `F` with nothing selected frame the transformed wall (`wallBox`, ceilings included) on demand; the safe distance D reads `stageExtent`, so a ceiling, floor or riser never changes it. With no offsets and no detached or horizontal section the framing equals step F (08 P2-11c) exactly (unit test, 8.1). Path A after spec 07 I4b: the view is never re-centred by an edit at all (07 6.14).
34. **[3a] Visibility on large walls.** On `large_wall` framed whole, a selected section is visibly tinted, and (path B) its gizmo arrows are at least 90 px long and draggable; camera, prop and pivot gizmos keep their legacy size.
35. **[3a] Cross-spec contracts.** Sections implement exactly 07 C33's path-B hook set (spec 03 5.4: `allowedAxes` with `null`, `endGizmoDrag({cancel})` only; no `allowedModes`, no `cancelGizmoDrag`) and spec 07's Selectable v2 in path A; `SELECTION_CHANGED` carries `modes`; spec 03's `pivot_gizmo` goldens are unchanged by this feature; the `addObserver` observers (07 C37) are called exactly once per selection change.

---

## 10. Task breakdown

Effort scale: S ≤ 0.5 d, M 1-2 d, L 3-5 d, XL > 5 d. **Path A is the recommended order** (07 C58: I1-I3 land before T8 and T9; Q26 confirms it); T8, T9, T25 and T27 are still estimated for both.

### 10.1 Phase 3a (MVP)

| # | Task | Effort | Depends on |
|---|---|---|---|
| T0 | Harness prep: collapse clicks via `.section-toggle` (proven identical on legacy); `sectionsSnapshot` format and the **D0** refresh on the pre-feature build; configs `offsets_v2` and `offsets_identity_v2`; scaffold `scenarios-sections.mjs` | S (0.5 d) | WP1 harness |
| T1 | Domain: `SectionOffset` (round-then-wrap rotation rule), `WallSection` fields and methods (`offset`, `locked`, `detached`, `anchorId`, `clone`), `Wall.findById/indexOfId`, `flatBounds` detached rule, `core/sectionIds.js` + tests | M (1 d) | Phase 1 (WP3) |
| T2 | `geometry/SectionTransform.js` (frame, origin, matrix, Euler principal and nearest, axis-angle, quaternion, deltas, relative snapping helper, compensation) + E1-E10, E14-E17, E21, E22 tests | M (2 d) | T1 |
| T3 | `WallLayout`: `applySectionOffsets(out)` after `translated()` inside spec 03's `layoutProject` (07 C32), removal of the `postTransforms` option, `bounds`/`sectionBounds` (`wallBox`), `generativeBounds()` attached-only (`generativeBox`, 07 C34), `indexOfSection`, `originWorld`, `sectionPerimeter` (explicitly closed), `panelQuads`, `floorRuns` with σ + tests (identity `Object.is`, E6, E11, E17 shared with spec 03's test 8, framing stability) | M (1.5 d) | T2, the **recorded** B-L1 decision (08 Q10, 07 C6), spec 03 T2; 08 P2-11c for the framing tests |
| T4 | `WallMeshBuilder` and exporters: bake transforms, `panelWorldMatrix`; consumes 08 P2-7's vertex ranges and `sectionRangeForFace` (07 C52) + identity byte-equality and transformed-export tests | M (1.5 d) | T3 |
| T5 | Serializer v2 fields (`position_m` conversion, `anchor_section_id`) + validator rules (path A: `ProjectSchema` rows, revision bump, reachability cases) + migration + tests; Q24 settled; re-baseline **step A** | M (1 d) | T1, B-L31 / 07 D4, B-L8 / 07 D2 |
| T6 | `LEDWallView`: panel and frame composition, extended `sectionNodes`, `updateSectionTransforms` (incl. spec 01's per-section panel shell matrix and the fallback); consumes spec 01 T10's `pickMeshes()` with back shells (07 C52); `NormalsDebugView` live subscription | M (2 d) | T4, spec 01 step F1-5 (shells; no-op before) |
| T7 | `SafeDistanceView` on `floorRuns()` (σ per segment, P2-5b builder per run or the moved B-M15 row); harness **step B** gate | M (1 d) | T3, T6 |
| T17 | **Detached with a host** (separable; **in 3b by default**, Q25; in 3a only if the owner wants soffits, ceilings and risers in the MVP). **T17a** (lands with T3, inside step B, when T17 is in 3a): the two-pass walk (6.2), `resolveAnchor`, `Wall.defaultAnchorFor/reanchorTargetFor/dependantsOf/attachedCount`, `firstEdge`/`lastEdge` amendments, validator host rules, E13 and E18-E20 geometry tests. **T17b** (lands with T10-T12): `setSectionsDetached`/`setSectionsAnchor` with re-anchoring, delete re-anchoring, the card and batch Detached / Starts at controls, the `section_offsets_ui` host steps. If T17 is deferred, the `offsets_v2` soffit is captured without the flag and re-captured when T17 lands. | M (2 d: 1 + 1) | T17a: T3. T17b: T10, T11 |
| T8 | Selection. **Path B:** `SelectionManager` (kinds incl. `'projector'`, providers, `replace`/`add`/`toggle`/`range`, click picking, prune, the observer call points of 07 C37), `ViewportInput` click routing without mode gating, `mod(e)`, press clearing, `contextmenu`; `app/SectionSelection.js` provider; App wiring (5.8). **Path A (recommended):** `SectionSelection` as a spec 07 `SelectableProvider` (`resolve`, `all`, `group`, `resolveHit`), wiring | Path B: L (3 d). Path A: M (2 d) | T6, B-M14 (path A: 07 I2) |
| T9 | Gizmo adapters. **Path B:** on 07 C33's hook set (spec 03 T5): `WallSectionSelectable`/`SectionGroupSelectable` path B members (accumulating, relatively snapped adapters, `endGizmoDrag({cancel})`, `allowedAxes`), `TransformGizmo` additions (`orientGizmo(rotation, mode)`, `WALL_REBUILT` re-anchor, `updateScale` for section targets), its `addPreRender` registration (07 C46); spec 03 5.4 verbatim if spec 03 has not landed. **Path A:** Selectable v2 members (`getTransform` with `{mode}`, `applyTransform` with deltas from `ctx.start` per 07 6.5, `historyLabel`, `bounds`) | Path B: M (2 d). Path A: M (1.5 d) | T8, B-M12 (path A: 07 I3) |
| T10 | `WallController` use cases (offsets, drag session on total deltas, reset, LED side and `flipFaceOrientations`, batch, delete-many, single-card `SECTION_CHANGED`, add-selects, import-deselects (path B), `currentLayout` invalidation) + rebuild-policy spy tests incl. the stale-layout regression | M (2 d) | T5, T6, T8 |
| T11 | `SectionListPanel`: DOM-built cards (retires the B-M4/B-L16 templates), selection classes and ARIA, header semantics (`detail <= 1`, 3a double-click expand, `user-select: none`), chevron button, offset group (`Vec3Field`), Advanced with spec 01's relocated LED side select, collapse and open maps, below-floor warning, primary-only reveal | L (3 d) | T10 |
| T12 | `SectionBatchPanel`, `SectionToolbar` (3a buttons, the relocated `#flip-all-sections`, owned by the toolbar from this task on), `SectionCommands` (3a methods, async confirm), `dialogs.confirm` (path B) or the Dialog adapter (path A), `Vec3Field`, markup, `css/features/section-editor.css` (06 role tokens, 07 C52 link order), `ViewportToolbar` badge, DOM-id ownership update; re-baseline **step D1** | M (1.5 d) | T11 |
| T13 | `SectionHighlightView` (two-tone outlines from closed `THREE.Line` geometry and tints, lazy allocation, `RENDER_ORDER.HIGHLIGHT_HALO`/`SECTION_HIGHLIGHT`) + `SceneTheme.selection` with 06's values, tokens and `COLOR_BINDINGS` rows; re-baseline **step C** together with T8-T10 | M (1 d) | T6, T8 |
| (T14) | **Withdrawn (07 C58).** The change requests of 10.3 are applied by 07's consolidated D0 (docs only, counted there); this spec keeps only the owner's sign-offs of Q24 and Q25 before step A. | – | – |
| T15 | 3a harness scenarios (`offsets`, `offsets_identity`, `section_select`, `section_offsets_ui`, `section_gizmo`) + reviewed forward goldens for steps B-D1 | M (2.5 d) | T0, T7, T12, T13 (and T17 when it is in 3a) |
| T16 | ARCHITECTURE.md amendments (5.9) across the commits above; README "Editing sections" with the workflows of 3.7 and the shortcut list | M (1 d) | all 3a |

**If T17 is deferred (the default since the plan review, Q25).** T5 and step A write only `offset` and `locked`; the `detached` and `anchor_section_id` rows (4.3), their validator rules (4.2) and their JSON keys land with T17 in 3b, with that release's revision bump and its own JSON re-baseline step (07 C39: feature keys are absent until their landing commit). T17a's walk then lands under a step-B-style gate of its own (every existing output IDENTICAL), and T17b with its UI. The `offsets_v2` soffit is captured without the flag in 3a and re-captured with T17; T15 drops the `section_offsets_ui` host steps and T26 gains them. Acceptance criteria and UI rows about Detached apply from T17 on. 09 X10 (ceiling and floor presets) builds on T17 and therefore follows it.

**3a total: about 25 engineer-days in path A without T17 (the default), 27 with it; 26.5 / 28.5 in path B** (XL; about 5 weeks for one developer). Revision 3 counted 29.5 / 31 days; revision 3.1 removes T14's 2.5 days, which 07's consolidated D0 does once for every spec (07 C58). The host-anchored Detached flag is its own task (T17), and the highlight gains the tint and the gizmo its scaling (T9, T13). Path A is cheaper because spec 07 already owns the registry, the click rule, the gizmo and the keymap.

**Critical path (3a):** T1 → T2 → T3 → T4 → T6 → T8 → T10 → T11 → T12 → T15 (with T17 in 3a: T3 + T17a, and T12 ∥ T17b).

**Can run in parallel:** T5 alongside T2-T4; T7 and T13 after T6; T9 alongside T10.

### 10.2 Phase 3b (extras)

| # | Task | Effort | Depends on |
|---|---|---|---|
| T20 | Lock: enforcement in `editable()` and `resolveHit` (click-through), card button and disabled state, toolbar Lock, batch Lock all, `refreshTarget`, `allowedAxes` none when locked, badge `(locked)` | M (1 d) | 3a |
| T21 | Reorder: `Wall.insertAt/move`, Move up/down, pointer reorder with `dropIndex`, `reorderActive`/`cancelReorder()` and the Escape registry entry at priority 75 (07 C42) + unit tests | M (1.5 d) | 3a |
| T22 | Duplicate: `Wall.duplicate`, `uniqueCopyName`, `LogoLibrary.copy`, P-DUPLICATE (select after rebuild) | M (1 d) | 3a |
| T23 | Hover: `hoverAt` with the nearest-hit list (path A: the bodies of 07 I2's single hover raycast), rAF guards, `mouseleave`, cursor, card hover, two-tone hover outline, the hover-hit observers (07 C37; spec 04 UV-17 depends on this task) | M (1 d) | 3a |
| T24 | Snapping: toolbar selects writing `InteractionState.snap.translateMm/rotateDeg` through `setSnapIncrements` (the adapters' relative snapping is 3a code, inert without Ctrl/⌘ + increments) | S (0.5 d) | 3a |
| T25 | Shortcuts (F, [, ], Ctrl/⌘+D, Ctrl/⌘+A, Delete), `SectionCommands` 3b methods, double-click framing. **Path B:** `attachSectionShortcuts`, `KeyboardState` modifier filter, `OrbitController.frameSphere`/`#zoomMax`. **Path A:** `registerActions` for the five `KEYMAP` rows; framing through `orbit.frame` | Path B: M (1.5 d). Path A: S (0.5 d) | 3a, B-L11 (path A: 07 I1, I4a) |
| T26 | 3b harness scenarios (`section_list_ops`, `section_hover`, gizmo snap steps) + steps **E1**, **E2** | M (1.5 d) | T20-T25 |
| T27 | **Path A only:** `History` record rows of 5.4 at the end of every use case (labels, coalesce keys) + tests. Replaces revision 2's own `app/History.js`, which is deleted (spec 07 C16: one undo stack). | S (0.5 d) | spec 07 H1, T10, T22 |
| T28 | Docs for 3b (ARCHITECTURE amendments, README) | S (0.5 d) | T20-T27 |
| T17 (default) | Detached with a host, when deferred from 3a (the default, Q25): T17a and T17b as in 10.1, with the schema rows, the revision bump and the JSON re-baseline step of "If T17 is deferred", the `section_offsets_ui` host steps (moved from T15 into T26) and the 6.17 pivot-interplay unit test | M (2 d) | 3a |

**3b total: about 8.5 engineer-days in path B (8 in path A, including T27), plus 2 for T17 when it is deferred (the default): about 10 in path A.** Spec 07 asks Feature 2 to release together with H1 (undo); in path B there is no undo, so R9's mitigation (confirm on every delete) applies.

**Grand total: about 35 engineer-days in path A (recommended), 37 in path B** (revision 3: 37.5 / 39.5, before T14 moved to 07's D0), wherever T17 lands. If 3a and 3b ship in one release, steps D1 and E1 merge and about 0.5 d is saved.

### 10.3 Cross-spec dependencies and change requests

- **Spec 03 (pivot), lands first.** This spec uses its single pipeline (07 C32: `applySectionOffsets(out)` after `translated()`, 6.6; no conjugation), the path-B gizmo hook set of 07 C33 (03 5.4: `beginGizmoDrag`, `endGizmoDrag({cancel})`, `cancelDrag`, `allowedAxes` with `null`, `ctx = {space, axisWorld, snap}`, `setSnapIncrements`, `InteractionState.snap`), its Escape order (03 3.4), its relative snapping (03 D9), its `modes` payload, `generativeBounds()` (amended to attached sections) and step F's framing boxes (07 C34). Rebuild-policy rows are `F2-*` next to its `F3-*`. Rotation origin vs wall pivot naming (3.1). Spec 03's `pivot_gizmo` goldens are not touched. Every row of spec 03 5.10.1 is satisfied by this spec as written: #1 hook set, #2 Escape order, #3 one snapping model, #4 composition (translate, then build; E17 shared with 03's test 8), #5 `sl.baseY` in floor references, #6 pick priority against wall hits only, #7 `modes`, #8 `WALL_REBUILT` fields, #9 gizmo re-anchor, #10 `generativeBounds()` is spec 03's, #11 named rows, #12 no badge token, #13 no `pivot_gizmo` re-capture.
- **Spec 01 (normals), lands first.** This spec relocates the UI that spec 01 T9 ships (the `select.section-face-select[data-section-flag="faceOrientation"]` moves under Advanced; `#flip-all-sections` keeps its id, moves into the toolbar, is owned by `SectionToolbar` from T12 and acts on the selection or on all), picks the back shells of T10 through 01's `pickMeshes()` (6.13), updates the panel-mode shell matrices (6.15), carries σ into floor runs (6.12), uses spec 01's `RENDER_ORDER` registry by name, and adds the live `NormalsDebugView` subscription under the constant `SECTION_CHANGED` (5.3). Its rigidity assert is implemented in `applySectionOffsets`.
- **Spec 04 (UVs).** It does **not** subscribe to `SELECTION_CHANGED`/`SECTION_CHANGED`: it uses `SelectionManager.addObserver` and `addHoverHitObserver`, which are 07 I2's (07 C37; spec 04 adds them only in path B). This spec keeps their call points in every select path (after `gizmo.attach/detach`) and supplies the bodies of the single hover raycast (`hoverAt`/`clearHover`, T23), which spec 04's UV-17 waits for. Both consume 08 P2-7's `combinedGrid` vertex ranges; this spec keeps `kind === 'section'` and `primary.sectionId` as 04 reads them.
- **Spec 05 (HDRI).** Its HDRI point is id `'hdri-point'`, label `HDRI Point`, kind `'projector'`, `pickPriority` 9, with `allowedAxes` (05 5.3, 07 C36); selecting a section clears it and the other way round. Its projection uses `modelMatrix * position`, and offsets are baked, so the projection follows automatically. It reads this spec's `WallController.currentLayout` (the single layout accessor).
- **Spec 06 (branding), lands first.** 06 §5.12's per-key table is the spec of record for `SceneTheme.selection` (two-tone core `#F7F7F5`, halo `#0A0A0A`, dashes); this spec lands with those values, tokens and `COLOR_BINDINGS` rows (5.2).
- **Spec 07 (platform foundations).** Section 2.4 lists path A and path B for each foundation. Binding in both paths: `position_m` (C3), one file format, `History` as the only undo stack (C16).
- **Spec 08 (bug-fix roadmap).** Hard gates P2-3, P2-8, P2-9a-d, P2-13e (08's F2 row); P2-5 and P2-11 are soft. `floorRuns()` is owned here (CR-08-a).
- **Spec 09 (additional ideas).** **X10 = presets over Detached plus offsets:** `applyVolumePreset` runs inside one `WallController` use case with `setSectionsDetached([id], true)` semantics (host = `wall.defaultAnchorFor`, dependants re-anchored), then its field and offset writes, one rebuild and one history entry. Its overlays build on `postTransform`, `panelQuads()` and `floorRuns()`, and it reads `WallController.currentLayout`.
- **Keymap:** 3.5.1 (path B) or spec 07's `KEYMAP` (path A). No help-badge change.

**Change requests** (docs edits to the named specs; applied by 07's consolidated D0, 07 C58, which replaced T14):

| # | Target | Request | Why |
|---|---|---|---|
| CR-01-a | spec 01 3.3, 5.1, 5.2 (`NormalsDebugView`), 5.3 | Rename the live event constant `WALL_SECTION_CHANGED` / `wall:sectionChanged` to `SECTION_CHANGED` / `section:changed` (ARCHITECTURE 9). The handler is unchanged. | `bus.on` throws on an unknown event name (bus rule 3); one constant for both specs. |
| CR-01-b | spec 01 3.1, 3.2, 5.2 (`bindFlipAllButton`), 5.6, CR-5 | Record that Feature 2 moves `#flip-all-sections` into `#section-toolbar` (id kept; owner `SectionToolbar` from T12; acts on the selection or on all sections) and the `select.section-face-select[data-section-flag="faceOrientation"]` into the card's Advanced disclosure (selector kept); no `#section-flip-all` id exists. | CR-5e made concrete; DOM-id ownership has one owner at every commit. |
| CR-03-a | spec 03 6.3 | The insertion comment reads "spec 02 calls `applySectionOffsets(out)` here, after `translated()`" (07 C32). No `conjugateTranslation` exists; spec 03's unit test 8 and this spec's E17 are one shared equivariance test. | One pipeline for both specs (6.6). |
| CR-03-b | spec 03 6.6 step F, 08 P2-11c/P2-13g | Step F reads `FramingPolicy`'s three named boxes (07 C34): `generativeBox` for the pre-I4b orbit re-target and `mesh-center`, `wallBox` for Reset/`F`/open, `stageExtent` for D, width, height and `fits`; `generativeBounds()` covers the attached sections only from T3 on (identical while nothing is detached). | Framing must not jump after every offset edit (6.11); identity-exact, so no golden changes. |
| CR-05-a | spec 05 2.3 | "Spec 03: `pickPriority`, `allowedModes` and `endGizmoDrag`" becomes "`pickPriority`, `allowedAxes` (with `null`) and `endGizmoDrag({cancel})`". | 07 C33 settled one path-B hook set. |
| CR-07-a | spec 07 0.2, 4.1, 4.2 (skeleton line 585), 4.3, 4.4 | `offset.rotation_origin` (not `pivot`) in the skeleton and the field table; new rows `sections[].detached` and `sections[].anchor_section_id` (reserved keys of F2); `SECTION_FIELDS` gains `'detached'` and `'anchorId'`. | 07 0.2 says the other leaves are unchanged; `pivot` collides with spec 03's top-level `pivot`. Q24. |
| CR-07-b | spec 07 6.4 | The press record is also cleared on `window` `pointerup` and `pointercancel`. | A press released outside the canvas must not complete a later click (AC 4). |
| CR-07-c | spec 07 5.4.1 `GizmoCtx` | Type `snap` as the shared `InteractionState.snap` object (`translateMm`, `rotateDeg`, `pivotM`), as its mapping row already says. | Each target reads its own increment (03 5.10.1 #2). |
| CR-07-d | spec 07 5.5.2 `apply` step 10 | Restore remembered `section:` ids only for reason `undo`/`redo`. | After open or import an equal numeric id names an unrelated section. |
| CR-07-e | spec 07 5.4.1 `getTransform`, 5.4.2 | `attach()` and `sync()` pass `{mode: this.mode}` to `getTransform`, and `setMode()` calls `sync()`. Targets that ignore it are unaffected. | Local translate arrows must follow the section frame `B` (one field per arrow), local rings `B·R0` (6.8). |
| CR-08-a | spec 08 §9 Feature 2 row (line 732), F2 gate table (line 89), P2-5b signature | "P2-5b delivers the band builder over one polyline; Feature 2 adds `floorRuns()` and calls it per run"; `buildSafeDistanceBand` accepts a run (`{points, facing, sectionOfVertex}`), with the layout form kept as a wrapper. | Ownership of `floorRuns()` is disputed between the two texts; this settles it. |
| - | specs 01, 04 | Feature stylesheets live in `css/features/` (before `12-responsive.css`), in 07 C52's link order. | One convention for every spec. |

## 11. Risks and open questions

### 11.1 Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Identity offsets drift outputs (for example −0 or float re-association) | `offsetMatrix` returns `null` for identity, pass 2 of the walk only runs for detached sections, `applySectionOffsets` writes `null` for identity offsets, and every consumer takes the previous code path. Step B gate (all existing outputs IDENTICAL), plus the `offsets_identity` byte check. |
| R2 | Users expect a moved section to drag its neighbours ("the wall broke") | Copy and hint text (3.1, 3.3); the ⊕ badge; Reset; the Detached flag and the workflows (3.7); Heading Change relabel (Q12); "attach following sections" kept as a later option (Q4). |
| R3 | The B-L1 curve-convention change after offsets exist alters every curved section's chord, and so its frame. Stored local offsets would be re-interpreted (a small rotation and shift). | The owner's B-L1 decision is collected at Phase 2 kickoff and recorded (08 Q10, 07 C6); T3 is gated on it. If it changes later, a migration must convert the offsets: express the old placement through the new frame using 6.9-style algebra (`t_new`, `R_new = B_newᵀ·B_old·R_old`), in the same commit as spec 07 C6's `curvature_convention` key. |
| R4 | Euler fields jump after gizmo rotations (two equivalent triples; gimbal at tilt ±90°, the soffit and ceiling case) | `eulerYXZNearest` keeps the triple nearest the drag start and keeps the roll at gimbal (6.10, E14, E15). The placement is exact; values are composed from the drag snapshot, so they never drift. |
| R5 | Hover raycasts and live patches are slow on very large walls (panel mode: 3,200 meshes) | rAF-throttled hover; bounding-sphere prefilter (r128 does this first); the patch covers only the dragged sections' vertex ranges, and panel-mode shells need one matrix write per section; a measured budget (AC 31). Fallback: hover only while a gizmo mode is active. |
| R6 | After spec 01 flips `mesh.viewport.side` to `'front'`, back faces of the LED meshes are culled for picking | Resolved by design: the back-shell meshes (`BackSide`) are picked and resolve to their section (6.13). No material is changed during picking. |
| R7 | Rebuilding the cards with DOM APIs changes structure the harness depends on | Keep every existing class, `data-field` attribute and nesting, and spec 01's LED side selector. T0 moves the collapse clicks to `.section-toggle`. D0 refreshes the snapshot format separately; D1 re-baselines the markup with the exact file list. The `ui_visual` probe list in `ui-spec.mjs` is updated in D1. |
| R8 | Event volume during drags (a `SECTION_CHANGED` per mousemove) | Subscribers do value writes only. `SectionListPanel` skips collapsed cards and patches them on expand. `NormalsDebugView.sync({keepLength: true})` reuses its buffers (spec 01 6.7.5). `SectionHighlightView` rebuilds only the dragged sections' outline and tint (plain arrays, one `BufferGeometry` update each). |
| R9 | Delete mistakes without undo (path B) | Confirm on every delete; lock (3b). Path A: spec 07's single `History` (T27 record rows); spec 07 asks Feature 2 to release with H1. |
| R10 | Non-unique or NaN section ids break `section:<id>` selection and Detached hosts | Hard dependency on the B-L8 validator (unique numeric ids; spec 07 6.8 keeps the first occurrence's id). `find` returns null for unknown ids, `prune` drops them, `resolveAnchor` falls back to the nearest attached section, and every reader resolves by id. |
| R11 | Stale cached layout during list changes (the duplicate-last-section crash of revision 1) | The invalidation rule and id-based lookups (5.4), selection changes only after `rebuild()`, and the regression unit test. |
| R12 | Selection feedback is invisible on large walls (a 1 px outline: WebGL ignores `linewidth`; 0.84 m gizmo arrows a few pixels long at 100 m) | **In 3a:** a translucent, depth-tested tint per selected section (6.13), and in path B the gizmo scaled with camera distance for section targets only (`updateScale`, arrows ≥ 90 px; legacy targets unchanged, so the `keyboard` and `gizmo_drag` goldens are safe). Path A: `TransformControls` is screen-sized. AC 34 and a manual check. |
| R13 | The gizmo technology changes under this feature (spec 07 I3 replaces the hand-written gizmo with `TransformControls`) | Both contracts are specified (5.5) and the `WallController` API is the same for both (a total delta from the drag start), so only the thin adapter in `SectionSelection` differs. Q26 fixes the path before T8; if I3 lands after this feature, I3 ports the section adapter like the other Selectables (07 5.4.1 mapping). |
| R14 | Detached semantics surprise users ("why did my section jump?") | The host is explicit ("Starts at"), stored by id, never changed by reorder, and re-anchored without movement on delete or detach (6.2.1); the chip title names the host; the workflows (3.7); Q20, Q25. The flag is off by default and never set implicitly. |
| R15 | Cross-spec drift (hook set, event names, shell design, keymap, schema keys, framing) | No contract is defined twice: path B uses 07 C33's set (spec 03 5.4), path A spec 07 5.4.1 (5.5), mapped one-to-one; spec 01's shells and event handler are reused; the change requests of 10.3 are applied by 07's consolidated D0 before any dependent code; Q24 settles the file keys before step A. |
| R16 | The 3a/3b split costs an extra card-markup re-baseline (E1) | Merge D1 and E1 when both phases ship in one release. |
| R17 | Spec 07's foundations land half-way through this feature (for example I2 before T8 but I3 after T9) | Each row of 2.4 is independent; the adapter for each row is chosen when its task starts and recorded in the PR. Mixed states are allowed only per row, never inside one task. |

### 11.2 Open questions for the owner (each with the recommended default)

| # | Question | Recommended default |
|---|---|---|
| Q1 | Offset units? | **Position in mm in the UI** (matches panel sizes; 0.1 mm resolution; ±100 m), **stored in metres** in the file (`position_m`, spec 07 C3). **Rotation in degrees** (0.01°). Camera and props stay in metres. Labels always show units. |
| Q2 | World axes or section axes for the offset? | **Section axes** (X Along, Y Up, Z Out = the layout's front side, independent of LED side), so an offset keeps its meaning when upstream sections are reconfigured. The gizmo's world mode converts automatically; its local translate arrows match the fields. |
| Q3 | Rotation origin? | **Per section, default "Bottom centre"** (chord midpoint at the base: tilt keeps the floor line, pan matches the plan centre). "Centre" and "Bottom left" are available. Switching keeps the placement (6.9). Named "Rotation origin" so it is not confused with the wall Pivot of spec 03. |
| Q4 | Do offsets propagate to following sections? | **No.** "Attach following sections" can be added later as an explicit per-section flag. It is not written in schema 2.0, and the validator ignores unknown keys. |
| Q5 | Allow Y offsets, and sections below the floor? | **Allow both.** Show a below-floor warning and do not clamp. The safe distance projects to the floor and skips up- or down-facing sections. |
| Q6 | Should spec 03 pivots use generative or transformed geometry? | **Generative** (settled by spec 03 D5 and kept by 6.17), and from attached sections only, so offsets and gizmo drags never move the pivot, and adding a section that is detached from the start leaves it where it was. Detaching a section that is already part of the chain is a generative edit and can move a centred pivot (6.17). The consequence for exports is 03 Q5. |
| Q7 | Gizmo technology? | **Whatever spec 07 decides for the whole app** (Q26): its `TransformControls` wrapper in path A, otherwise the existing `TransformGizmo` extended through spec 03's hook set. This spec does not introduce a third gizmo. |
| Q8 | Click-to-select without a gizmo mode? | **Yes, for every selectable.** This intentionally changes N-3 (spec 07 3.7 makes the same change). The existing harness clicks all happen with a mode active, so they are unaffected. |
| Q9 | Card header click? | **Select and expand. If the section is already the sole selection, toggle collapse. The chevron only collapses. Double-click keeps the card expanded (3a) and frames it (3b).** |
| Q10 | What does "Lock" mean? | **An edit lock** (fields, offsets, delete, reorder, gizmo) **plus viewport click-through, from 3b.** It is not a world-position lock: upstream edits still move a locked section, because it is generative. In 3a the flag is stored but inert. |
| Q11 | What does Duplicate copy? | **Everything** (fields, colour, offset, LED side, Detached and host, logo) except the id, name (`"<name> copy"`) and lock. Inserted after the source. Locked sources may be duplicated. |
| Q12 | Relabel "Section Offset (°)"? | **Yes:** "Heading Change (°)" with the hint "Turns this and all following sections". JSON keeps `angle_offset_degrees`. |
| Q13 | Write identity offsets and flags to JSON? | **Always write** (explicit for pipeline tools). This costs one JSON re-baseline (step A). |
| Q14 | Undo? | **Spec 07's single `History`** (H1), with this spec's record rows (T27). Release 3b's keyboard delete and duplicate only once H1 has landed. No feature-local undo stack. |
| Q15 | Multi-selection transform semantics? | **Translate:** the same world delta for every section. **Rotate:** each section about its own rotation origin ("individual origins"). The gizmo sits at the median origin. |
| Q16 | What does "Z Distance from Wall" mean once sections rotate? | Belongs to the B-M10 fix (spec 03 already renames the input to "Z Position (m)"). Add a read-only "Distance to wall" = the hit distance along the optical axis against the transformed `panelQuads()`, falling back to the nearest point. |
| Q17 | Hover highlight on by default? | **Yes** (3b). It is suppressed while any mouse button is held, during drags, in pilot mode and outside the canvas, and it never outlines through props or the pivot marker. |
| Q18 | Safe distance for ceiling or floor sections? | **Excluded** (\|front normal y\| > 0.9). Detached sections that face the stage get their own run. |
| Q19 | glTF: bake the transforms, or per-section node matrices and `extras` metadata? | **Bake** (identical structure to today; DCC-agnostic). Node matrices or `extras: {sectionId, offset}` can be added later behind an export option. |
| Q20 | Where does a Detached section start: where its host **starts** (overlay), or where it **ends**? | **Where it starts.** Then "Duplicate + Detached" overlays the source exactly, which is the soffit/riser workflow, and placing a ceiling never depends on the length of the host. |
| Q21 | Should Add select the new section? | **Yes, unless a camera, prop, pivot or HDRI point is selected** (that selection and its gizmo are kept). |
| Q22 | Ship 3a on its own first? | **Yes.** 3a covers the owner's request (select, edit more easily, basic offsets that keep the layout generative). 3b follows as polish. |
| Q23 | Snapping style? | **Relative everywhere** (spec 03 D9): with Ctrl/⌘ held, the dragged distance (both gizmo spaces) and the dragged angle are multiples of the increment from the drag start; values that are not dragged never change. Revision 2's absolute grid for local translate is withdrawn, so specs 02 and 03 share one model. Absolute grids can be added later as a separate "snap to grid" toggle for every target at once. |
| Q24 | Persisted key names, to settle **before step A**: `offset.position_m` (spec 07 C3, binding) and `offset.rotation_origin` (spec 07 0.2 "other leaves unchanged") vs the `pivot` leaf in spec 07's 4.2 skeleton? | **`position_m` and `rotation_origin`.** One v2 format in both paths, metres for every world offset; `rotation_origin` avoids a second meaning of "pivot" next to spec 03's top-level `pivot`. CR-07-a fixes the skeleton line. |
| Q25 | Is the Detached flag part of the MVP (3a)? It changes the generative walk for opted-in sections, which goes beyond "basic offsets". | **No: defer it to 3b** (T17, with a host by id), or to 09 X10 if the ceiling and floor presets are accepted, which build on it. It is the only change to the generative walk, ticking it is a generative edit that can move a centred pivot (6.17), and the owner asked for basic offsets. Choose **"in 3a"** only if you need soffits, ceilings or risers now: without it, such a section placed in the middle of the list consumes chain length and opens a hole in the wall, and a section appended at the end moves whenever upstream sections change. Either way the flag is off by default, the walk is the verbatim Phase 1 walk for every wall that does not use it, and T17 is the same 2-day task (10.1, "If T17 is deferred"). |
| Q26 | Spec 07 path for selection, gizmo and keyboard (2.4 rows 4-6): build on spec 07 I1-I3 (path A) or on spec 03's hand-written gizmo (path B)? | **Path A.** 07's recommended order (C58) schedules I1-I3 before this feature's gizmo work, which saves about 2 days here and a later port, and no path-B scaffolding is built. Path B, which I3 would port later through the 5.5 mapping, is only the fallback if that order cannot hold. Confirm before T8. |
