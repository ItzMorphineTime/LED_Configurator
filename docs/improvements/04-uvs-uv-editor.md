# Spec 04: Clean per-section UVs filling 0..1, plus a UV viewer and editor

**Status:** implementation-ready draft for Phase 3 (Feature 4), revision 2. **Plan review (2026-10-16):** the per-section Combined default is no longer described as the owner's requested layout. The owner asked for UVs that fill the 0..1 space; the default suits per-material workflows, while one-feed-per-mesh workflows (nDisplay mesh projection, disguise) need Atlas or Individual Section Meshes (5.1, Q1, new Q18). **Revision 2.1** applies the cross-spec consistency review (07 §0 C32-C62): path A is the recommended order (07 I1-I3 and H1 before UV-12/13, so `UvFallbackHistory`, the `'u'` branch and UV-18 are not built; C58); the observer hooks are 07 I2's and the hover hit is 02 T23's (UV-17 depends on 02 T23; C37); this spec adds no help-badge token (C35); the section texture budget lives in `geometry/TextureBudget.js` (C38); the chip calls `setContentMode('panelIds')` and the viewer backgrounds use the domain spellings (C49); the UV colours are 06's two-tone values and `UvHighlightView` uses `RENDER_ORDER.UV_HOVER_OUTLINE`; events are classified visual or non-visual (C47); shared helpers have named owners (C52); UV-0's alignment is done by 07's consolidated D0. It builds on the Phase 2 UV and panel-texture fixes that Spec 08 owns and designs (P2-7a–f, P2-8a, P2-12d), and on Spec 07's schema, history, keymap and preferences. Revision 2 aligns the persisted keys, undo, keyboard and preferences with Spec 07, the ZIP atlas name and the P2-7 design authority with Spec 08, and the bake and material contracts with Spec 05 (2.3).
**Implementation status (2026-10-31).** Landed: UV-5a and UV-6 (invariance). Skipped by the owner for now: UV-5c (no project file v2 yet, so UV state is session-only), UV-17, UV-18. Deviations: `WallSection.uvTransform` is an accessor over a private field and `SECTION_FIELDS` keeps the 11 legacy fields (4.1 appends the key; this keeps the legacy-parity tests and `{...section}` copies unchanged); `wallPointFromBaseUv` adds the section's `baseY` (03 6.4) to 6.10's y.
**Builds on:** `docs/ARCHITECTURE.md` (binding module contracts, events, `Strategies`, `LEGACY_SITES`, section 9 seams) and `docs/REFACTOR_PLAN.md` (phases, re-baseline rules).
**Legacy line numbers** refer to `index.html@cd3fd3f` (`git show cd3fd3f:index.html`). **Bug ids** refer to the verified defect list ([`docs/DEFECTS.md`](../DEFECTS.md): B-H*, B-M*, B-L*).
**Sibling specs** are cited by number: Spec 01 (normals and the debug view), Spec 02 (section selection and offsets), Spec 03 (pivot), Spec 05 (HDRI projection and the car), Spec 06 (Morph branding), Spec 07 (platform foundations: schema v2, validator, history, keymap, prefs), Spec 08 (Phase 2 bug-fix roadmap). Like Spec 02, this spec names two paths where a Spec 07 foundation may not have landed yet: **Path A** uses it (the primary design); **Path B** is a temporary fallback that task UV-18 removes.
**Authority split.**
- **Spec 08** owns, and is authoritative for the design of, P2-7a–f (B-M5, B-M6, B-M7, B-L6, B-L18 and the ZIP atlas), P2-8a (B-L15) and P2-12d (the panel-mode viewport on shared section textures, B-M16 and B-L19), together with their re-baselines. This spec starts from their output and does not restate their design.
- **Spec 07** owns the v2 envelope, paths, key names and casing (07 §4.2–4.4; C1, C2, C8), the only undo stack (C16, `app/History.js`), the keymap and the typing guard (C17, C18), and preferences (C19, `app/Prefs.js`). This spec supplies the value rules of its reserved keys `sections[].uv_transform`, `sections[].pixel_map`, `uv` and `atlas` (07 §4.4 rule 1), its `History` record rows and its `KEYMAP` rows.
- **This spec** owns the per-section Combined layout, the UV transform, section-space UVs in panel-mode exports and the `panel_uvs` option, the viewport budget for section textures, and the viewer and editor.
- 2.3 lists every change this spec asks of Specs 08, 07, 05, 06, 01 and 02. 07's consolidated D0 (07 C58) applies them; there is no separate UV-0 task.

---

## 1. Summary and user value

**Problem.** The owner asked that every LED mesh section's UVs "map cleanly and accurately and fill the entire UV space", and for a way to view and edit the UVs of a selected section. In the legacy app:
- UVs are generated in five separate places that disagree with each other.
- The default Combined mode samples the wrong rows on walls whose sections have different pixel heights (B-M5).
- The Combined OBJ writes overlapping UVs that match nothing (B-M6).
- glTF has no UVs at all (B-M7).
- Combined exports colour the whole wall with section 0's colour (B-L6).
- Fractional column or row counts produce garbage UVs (B-L15).
- Panel mode uses a separate texture per panel, which costs a lot of memory and drops logos (B-M16, B-L19).
- There is no way to see or adjust UVs.

Spec 08 Phase 2 makes the Combined UVs pixel-accurate against the atlas, adds glTF `TEXCOORD_0`, adds per-section materials and ships the atlas in the ZIP (P2-7). It also rounds the integer fields (P2-8a) and moves the panel-mode viewport onto one shared texture per section (P2-12d). This spec then:
- makes each section **fill 0..1** in the Combined mesh by default (the owner asked for UVs that fill the UV space; Section mode already does). This default suits per-material workflows; one-feed-per-mesh workflows use the Atlas layout or Section mode (5.1, Q1);
- adds a per-section UV transform;
- makes panel-mode exports section-space;
- adds the viewer and editor.

**Who it is for.**
- **Morph's stage designers and pipeline TDs** take the exported OBJ or glTF into Unreal (nDisplay), disguise, Blender or Maya and apply content per LED section. They need each section to be a clean, pixel-accurate 0..1 island, consistent across mesh modes.
- **Operators** need to answer "which pixel of which section is this?" (the hover readout). They also need to fix orientation for sections whose feed is flipped or rotated on the processor side (flip and quarter-turn).

**Key decisions at a glance**

| # | Decision | Section |
|---|---|---|
| D1 | **Section UV space is canonical.** Each section's 0..1 square maps exactly onto its own pixel canvas (`panelCols·ledX × panelRows·ledY`). Row 0 is at the bottom and u increases along the column order. | 6.1, 6.2 |
| D2 | **Combined mode has two UV layouts.** `per-section` is the default: geometry groups plus one material slot per section, each section filling 0..1. `atlas` is the alternative: non-overlapping and pixel-accurate, matching `panel-ids.png`. It is the Spec 08 P2-7 output. UDIM tiles and a second UV channel were evaluated and rejected as the default. | 5.1 |
| D3 | **Per-section `uvTransform` is baked at generation.** It covers offset, scale, rotate, source orientation and flip. One function produces the viewport `uv`, the OBJ `vt` and the glTF `TEXCOORD_0`. The app never uses `texture.offset/repeat/rotation` **for UV transforms**. LED-mask content keeps its `repeat` for pixel tiling. | 6.3 |
| D4 | **LED-mask content ignores UV transforms.** LED-pixel simulation and Spec 05's HDRI LED mask show physical pixels, so their viewport UVs are always the base (or atlas-placed base) UVs. | 6.5 |
| D5 | **Panel mode uses section-space UVs.** Each panel gets its sub-rectangle of the section's 0..1 space and shares one section texture. 08 P2-12d does this for the viewport. This spec does it for OBJ and glTF (UV-9) and keeps a per-panel 0..1 legacy option (`panel_uvs = 'panel'`). | 6.4 |
| D6 | **glTF writes `t = 1 − v`**, the glTF top-left origin. OBJ keeps `v` with a bottom-left origin. | 7.3 |
| D7 | **The viewer is a 2D canvas inside a reusable `FloatingPanel`.** It is not another WebGL renderer. | 3.2, 5.3 |
| D8 | **Rotation happens in source-pixel space, not raw UV space.** The transform knows the section's pixel size W×H and the source's (W×H, or H×W when `sourceRotated`). As a result, an island is always a rectangle in the viewer. With a uniform scale the content is never sheared **in pixels**; on sections with non-square LED pitch, a free-angle rotation looks sheared in metres, as any pixel-mapped content does (6.1). Quarter turns of a matching source are exactly the UV-space quarter turns, so they fill 0..1 and stay pixel-exact. | 6.3 |
| D9 | **Combined glTF uses one primitive per section, each with its own accessors** (POSITION, NORMAL, TEXCOORD_0 and indices, with index base 0). 08 P2-7d already specifies this (08 §6.8). | 7.3 |
| D10 | **UV edits use the platform.** One global undo stack (07 H1, C16), `KEYMAP` rows and the `uv-viewer` scope (07 I1, C17), the shared typing guard (`core/typingTarget.js`, C18) and `app/Prefs.js` (C19). Path B fallbacks exist only if this feature's UI merges first, and UV-18 removes them. | 3.6, 5.3 |

---

## 2. Current state

### 2.1 Legacy behaviour (`index.html@cd3fd3f`)

| Path | Code | UVs today | Defect (fixing commit) |
|---|---|---|---|
| Viewport, Section mode | `createSectionMeshes` 1710-1774; UV push at 1740 | `(col/panelCols, row/panelRows)`; fills 0..1 per section | Correct for integer counts. A fractional count gives fractional indices and UVs that stop at 0.8 (B-L15, field parse at 4029; 08 P2-8a). |
| Viewport, Combined mode | `createCombinedMesh` 1579-1678; `uvWidth` 1596, push 1627, `uvOffsetX += uvWidth` 1643 | `u = uvOffsetX + (col/cols)·uvWidth` (correct pixel share); `v = row/rows` for every section | **B-M5** (08 P2-7a). The atlas is `max(rows·ledY)` tall, with sections bottom-aligned (`createCombinedPanelIdCanvas` 1680-1708, `yOffset` 1701). Shorter sections therefore sample the atlas background, and their labels and logos are squashed. LED sim uses `repeat(totalLedX, totalLedY)` over the full V range (1672), so it shows the wrong row count. |
| Viewport, Combined LED sim | 1672 | White tile, repeated `totalLedX × totalLedY` | B-M5 (row count); B-L18 (white; 08 P2-7e: white tile × `vertexColors`) |
| Viewport, Panel mode | `createIndividualPanels` 1776-1802; `PlaneGeometry` 1782 | Each panel spans 0..1 with its own canvas (`createPanelIdTexture` 2001-2050) | **B-M16:** 4-16 px per LED per panel, about 1 GB at 176² LEDs. **B-L19:** no logos, and the label size is ignored. 08 P2-12d fixes both for the viewport (shared section textures, section-space panel UVs). This spec moves the exports to section space (UV-9). |
| Section canvas | `createSectionPanelIdCanvas` 2052-2187; row flip at 2074 | Canvas row `rows−1−row` holds panel row `row`. With `CanvasTexture.flipY = true`, v = 0 is the bottom. | Consistent with the strip UVs |
| OBJ, Combined | 4581-4587 | `vt col/cols row/rows` per section, inside one object | **B-M6** (08 P2-7b): islands overlap and match neither the viewport atlas nor `panel-ids.png` |
| OBJ, Section | 4629-4633 | 0..1 per section | OK |
| OBJ, Panel | 4696 | `vt 0 0 / 1 0 / 1 1 / 0 1` per panel | OK as a per-panel convention |
| OBJ/MTL, Combined colour | 4564-4566 | `Kd` taken from `wallSections[0]` | **B-L6** (08 P2-7d) |
| glTF, all modes | `addMesh` 4737-4828; attributes at 4819 | `POSITION` only | **B-M7** (08 P2-2d `NORMAL`, P2-7c `TEXCOORD_0`) |
| glTF, Combined colour | 4850 | baseColor from `sections[0]` | **B-L6** (08 P2-7d) |
| PNG `panel-ids.png` | `exportPanelIds` 4926-4940 | Horizontal atlas: bottom-aligned, `pxPerLed = clamp(floor(4096/max(totalLedX,totalLedY)),1,4)` | No canvas guard (B-L4; 08 P2-1c) |
| ZIP textures | 4533-4542 | One section canvas per section, at `clamp(floor(4096/max(W,H)),1,4)` px/LED | Names collide (B-L14). The MTL path does not match (B-M2). Both are fixed in 08 P2-6. 08 P2-7f adds the atlas as `textures/` + `Brand.files.panelIdsPng`. |
| Integer inputs | card template 3943-3952; rules 4030-4036 | `parseFloat`, no rounding, no `step` | **B-L15** (08 P2-8a) |

Other facts confirmed in the code:
- Nothing passes UV rectangles between the texture generators and the mesh builders. Both sides recompute `cumulativeCol`, `totalLedX` and `totalLedY`, which is why they drifted.
- Raycasting never targets the wall, and the wall meshes carry no identity.
- The only floating overlay is the camera preview window (1185-1200). It uses a top-left resize handle written in inline styles (3647-3700), sits at bottom/right 20 px, and has no z-index.
- At ≤ 900 px width the grid rows are `60px 1fr 350px` (859-869), so `.viewport` is `100vh − 410px` tall.
- The per-panel canvas (2001-2050) draws its label at 0.4 of the panel size and a small section-name caption at the bottom of every panel, at 4-16 px/LED. The section canvas (2052-2187) draws labels at 0.35 of the panel size, one centred section name (0.15 of the canvas, 60 % opacity) and the logo, at 1-4 px/LED. Both continue the column letters across sections.

### 2.2 Refactored modules involved (per `ARCHITECTURE.md`)

The `js/` tree is still being produced by the parallel refactor, so `ARCHITECTURE.md` is the source of truth.

| Module | Contract relevant here (Phase 1, plus the Phase 2 and platform changes from Specs 08 and 07) |
|---|---|
| `geometry/WallMeshBuilder.js` | `sectionGrid(sl, {indexBase, uv: 'unit' \| {offsetU, widthU, heightV?} \| null, normals})`. `combinedGrid(layout, atlas)` switches on `profile.combinedUV`: `'atlas-u-full-v'` in Phase 1, `'atlas-pixel-accurate'` after 08 P2-7a. It returns `sectionRanges` = `[{sectionId, sectionIndex, indexStart, indexCount}]`, extended with `vertexStart, vertexCount` by 08 P2-7 (08 §5.2), their one named owner (07 C52); Spec 02 and this spec consume them. `panelCorners` (BL, BR, TR, TL). `panelUvs(panel, sl)` (BL, BR, TR, TL in section space) from 08 P2-12d. |
| `geometry/TextureAtlas.js` | `computeAtlas(sections)` returns `{totalLedX, totalLedY, pxPerLed, entries[{startCol, ledOffsetX, uvWidth, uvOffsetX, uvHeight}]}`. `uvHeight` is added by 08 P2-7a. `CANVAS_HARD_LIMITS` and `canvasFits` are added by 08 P2-1c. |
| `render/LEDWallView.js` | `rebuild({layout, meshMode, display})`; mesh `userData` tags `{kind:'led-wall', mode, sectionId, sectionIndex, col, row, sectionRanges}`; `meshes()`, `sectionNodes()`. Spec 02 adds `pickMeshes()`, `vertexRange` and the transform-only path `updateSectionTransforms`. Spec 01 F1-5 adds back shells tagged `kind: 'led-wall-back'` (pickable, so they are in `pickMeshes()`), and flips panel planes for reversed sections. |
| `render/LEDMaterialFactory.js` | `combined(sections, atlas)` (B-M5 repeat and B-L18 white tile × `vertexColors`, both fixed in 08 P2-7a/e); `section(...)`; `panel(...)`; `sectionShared(section, i, startCol)` (08 P2-12d). Spec 05 adds a first `hdri` branch to each (05 §5.6). |
| `render/MaterialOverride.js` | Spec 01 T5: stash and restore of wall materials for the debug shading |
| `render/textures/PanelIdRenderer.js` | `panelCanvas` (B-L19, B-M16; reachable only with `panel_uvs = 'panel'` after P2-12d), `sectionCanvas(section, i, overrideScale, startCol)`, `atlasCanvas(sections, atlas)`, `atlasSize`/`sectionSize` (08 P2-1) |
| `io/ObjExporter.js` | Combined `profile.combinedUV`. Per-section `usemtl` comes from 08 P2-7d. Standalone MTL has no `map_Kd` (08 P2-6c); since 08 P2-6e Export OBJ is a ZIP whose MTL references only the textures that ZIP ships. |
| `io/GltfExporter.js` | `profile.attributes` becomes `['POSITION','NORMAL','TEXCOORD_0']` (08 P2-2d, P2-7c); `indexType = 'auto'` (08 P2-1b) |
| `io/ProjectSerializer.js`, `io/ProjectSchema.js`, `io/ProjectValidator.js`, `io/ProjectMigrations.js` | The v2 writer and reader (07 D1-D4; 08 P2-13e implements the Phase-2 subset of the same schema) |
| `app/ProjectSession.js` | 07 D5: `apply(v2, {reason})` hydrates every feature's state in step 3 and rebuilds in step 5; `openFile` records one history entry |
| `app/History.js` | 07 H1: the only undo stack (`record(label, {coalesceKey})`, `undo`, `redo`, `HISTORY_CHANGED`) |
| `app/Prefs.js` | 07 H3: `get(key)`, `set(key, value)`, every access in try/catch (C19) |
| `interaction/Keymap.js`, `core/typingTarget.js`, `ui/dom.js` | 07 I1: `KEYMAP` rows with scopes, `ViewportInput.registerActions(map)`, `bindScopedKeys(el, scope, actions)`, `isTypingTarget(t)` (C18). Before I1, the Phase-1 guard `InputState.isShortcutIgnoredTarget` applies, extended by 08 P2-9 for B-L11. |
| `domain/WallSection.js` | `FIELD_RULES` (B-L15 rounding from 08 P2-8a) |
| `interaction/SelectionManager.js`, `ViewportInput.js`, `InputState.js` | Selectable registry, shortcuts and the shared `PointerRay`. 07 I2 replaces `SelectionManager` with v2 (providers, `revalidate`, `SELECTION_CHANGED {id, label, ids, kind, origin, modes}`). Spec 02 adds multi-select, select on pointer-up, `hoverAt` and `dblclick` pick-and-frame. |
| `render/PreviewWindow.js` | The resize-handle pattern that `ui/FloatingPanel.js` generalises |
| `core/EventBus.js` | `WALL_REBUILT` seam; `SELECTION_CHANGED`; 07's `PROJECT_REPLACED` and `HISTORY_CHANGED` |

### 2.3 Prerequisites, gates and cross-spec alignment

Feature 4 starts from the state after the commits below. They are **not** tasks of this spec. The previous draft's Phase 2 tasks (its UV-1 to UV-4) are withdrawn: they are 08's P2-7a–d, and 08 is authoritative for their design. The "Requested change" columns below are applied to the sibling specs by 07's consolidated D0 (07 C58), before the first Feature 4 code task merges; the former UV-0 task is withdrawn.

**Gates** (reconciled with 08 §1.1 and 07 §1.4; 08's F4 row lists P2-6, P2-7 and P2-12d as hard gates and persistence as soft, which matches this table, so 08 needs no new gate):

| Gate | Owner | Kind for F4 | Needed by | Why |
|---|---|---|---|---|
| P2-7a–c | 08 | hard | UV-6 | The builder and the plans start from the pixel-accurate atlas and glTF `TEXCOORD_0` |
| P2-7d–f, P2-6 | 08 | hard | UV-8a, UV-8b | Per-section materials, unique texture names, the ZIP atlas |
| P2-1a (B-H3) | 08 | hard (already a P2-7 prerequisite) | UV-8b | glTF buffers grow by about 8 bytes per vertex |
| B-H5 disposal (Phase 1C H1, else 08 P2-12a) | Phase 1 / 08 | hard | UV-7 | Per-section textures must not leak on every rebuild |
| P2-12d | 08 | hard | UV-9 | The viewport half of section-space panel UVs |
| P2-8a (B-L15) | 08 | soft | – | `plan.valid` and the viewer's error state (3.8) cover fractional counts |
| P2-9 (B-L11) | 08 | soft | UV-12 (Path B only) | Only the Path B shortcut uses the Phase-1 guard |
| 07 D4, D5 (08 P2-13e is the Phase-2 subset) | 07 | hard for persistence only | UV-5c | The writer, the reader and `ProjectSession.apply` |
| 07 I1 | 07 | **Path A, the recommended order** (07 C58: I1-I3 land before UV-12); Path B and UV-18 only as a fallback | UV-12, UV-13 | `KEYMAP`, `bindScopedKeys`, `registerActions`, `core/typingTarget.js` |
| 07 H1 | 07 | **Path A, recommended** (H1 before UV-13); Path B and UV-18 only as a fallback | UV-13 | The only undo stack |
| 07 H3 | 07 | soft | UV-10 | `app/Prefs.js`. Until it lands, viewer state is session-only. |
| 07 I2 | 07 | hard for the observer hooks (`addObserver`, `addHoverHitObserver`, 07 C37) | UV-11, UV-17 | In path B (fallback) this spec adds the same two methods on the Phase-1 `SelectionManager` |
| 02 T23 | 02 | hard for the shared hover hit | UV-17 | `SelectionManager.hoverAt` bodies: the single hover raycast (07 C37). Until it lands, `WallHoverProbe` uses its own front-mesh raycast. |

**Spec 08** (Phase 2):

| # | Topic | Decision (binding for Specs 04 and 08) | Owning commit | Requested change in Spec 08 |
|---|---|---|---|---|
| 08-1 | Design authority for P2-7 | 08 is authoritative for P2-7a–f. Spec 04 builds on their output from UV-6 on. | 08 P2-7 | Replace every "P2-7a–d = 04 UV-1..UV-4" and "04 is authoritative" pointer: the §1.1 F4 row, the §4.1 rows `mesh.viewport.combinedUV`, `mesh.obj.combinedUV` and `exportCombinedColor`, the §5.6 rows B-M5/B-M6/B-M7/B-L6 and B-L15 ("P2-8a = 04 UV-0"), the opening lines of §6.7 and §6.8, the P2-7 header line, and Q4. |
| 08-2 | `mesh.*.combinedUV` dispositions | The keys are kept. Spec 04 adds a `'plan'` case and selects it: UV-7 (viewport), UV-8a (OBJ), UV-8b (glTF). The legacy and `'atlas-pixel-accurate'` cases stay reachable through `LegacyProfiles`. | 04 UV-7, UV-8a, UV-8b | §4.1: replace "04 UV-7 later deletes the key" and "04 UV-8 later deletes the key" with the sentence of the decision column. |
| 08-3 | glTF combined UV leaf | New leaf `mesh.gltf.combinedUV = 'atlas-pixel-accurate'` (glTF had no legacy UVs, like `mesh.gltf.panelNormal`). `combinedGrid` reads `profile.combinedUV`, and the glTF profile has no such leaf today. | 08 P2-7c | Add the leaf to §4.1. P2-7c's manifest already covers every glTF and ZIP output by glob. |
| 08-4 | Combined glTF accessors | One primitive per section, each with its own accessors (08 §6.8, §5.2) | 08 P2-7d | none (already in 08) |
| 08-5 | B-L6 manifest | Per-section materials, also on single-section walls (`Wall_1`, 08 Q11) | 08 P2-7d | Confirm that the manifest covers `import_edge/*combined*__export-{obj,gltf}*` and their `.mtl`: the material rename changes them, and `**/combined__export-*` does not match those names. |
| 08-6 | B-L18 | Combined LED sim is a white tile × `vertexColors` (08 §5.2 `LEDMaterialFactory` row) | 08 P2-7e | none. 04's per-section layout uses the same material in every slot (6.4), so 08's note "04 §5.5 agrees" holds. |
| 08-7 | ZIP atlas name | `'textures/' + brand.files.panelIdsPng`: `textures/panel-ids.png` until 06 T6b, then `textures/morph-led-wall-panel-ids.png` | 08 P2-7f | Build the ZIP entry name and the `map_Kd` path from `Brand.files.panelIdsPng`, never from a literal (06 R-B3b forbids the literal token). Q5: "The name follows 04 §7.5" becomes "the entry is `textures/` + `Brand.files.panelIdsPng`; 04 §7.5 adopts it". |
| 08-8 | Who references the atlas | Phase 2: only the combined MTL in the ZIPs (`map_Kd`, P2-7f; Export All, and Export OBJ's ZIP from 08 P2-6e, which then ships the atlas too); glTF has no `images` in Phase 2. From UV-8a (MTL) and UV-8b (glTF, the first glTF `images`): only when `uv.combined_layout = 'atlas'`. The atlas PNG always ships when `canvasFits` passes (08 Q5). | 08 P2-7f; 04 UV-8a, UV-8b | none |
| 08-9 | Panel mode | Viewport half: P2-12d. Exports and the `panel_uvs` option: 04 UV-9. | 08 P2-12d; 04 UV-9 | none (08 §5.6 B-M16 row already says so) |
| 08-10 | Stale schema text | 07 §4.2 is the schema | 08 P2-13e | Editorial: the §4.6 sample (`schemaVersion`, `wall.uvLayout`, `sections[].uv`, `zipManifest`) and the §5.6 B-M3 note "07 `zipManifest` replaces `texture_file`" contradict 07 C1, C2, C8 and §4.2 (`texture_file` is kept). Replace both with a pointer to 07 §4.2. |
| 08-11 | B-L15 | `Math.round` and caps in `FIELD_RULES`, `step="1"`/`max` markup, and their re-baseline | 08 P2-8a | none. This spec adds no integer-field markup. |

**Spec 07** (platform):

| # | Topic | Decision (binding for Spec 04) | Requested change in Spec 07 |
|---|---|---|---|
| 07-1 | Persisted keys | 07's paths and casing: `sections[].uv_transform`, derived `sections[].pixel_map`, top-level `uv`, derived top-level `atlas` (C8, §4.2, §4.4). They are absent until UV-5c adds them and bumps `version` to the next `"2.<n>"`. The writer always writes full objects; there is no `null` canonicalisation. | none |
| 07-2 | New leaf | `uv_transform.source_rotated` (bool, default `false`), appended after `flip_v` (D8) | Add it to the §4.2 skeleton and to the §4.3 `…uv_transform.*` row. 4.4 rule 1 already allows it inside F4's reserved key. |
| 07-3 | Unit suffix | `_led` means LED pixels (one source pixel per LED at identity), beside `_px` (image pixels), in `pixel_map` and `atlas` | Add `_led` to the §4.2 key-style rule. |
| 07-4 | Undo | `app/History.js` is the only stack (C16). Record rows as in 5.3 (`UvController`). There is no local stack and no `resetHistory`. | §5.6.1 feature row: copy 04's labels and coalesce keys from 5.3. (Applied.) |
| 07-9 | Observer hooks | `addObserver(o)` and `addHoverHitObserver(fn)` are `SelectionManager` v2 members from I2 (direct ordered calls, R2); `hoverAt` is the single hover raycast (07 C37) | §5.4.1 and I2. (Applied.) |
| 07-10 | Texture budget | `SECTION_TEXTURE_BUDGET_PX = 16,777,216` per rebuild in `geometry/TextureBudget.js` (07 X3, delivered by 08 P2-12d); each canvas side ≤ min(`maxTextureSize`, 4096) (07 C38) | §5.9.5, §6.12, X3. (Applied.) |
| 07-5 | Keymap | `U` → `uv.toggleViewer` (global) and the `uv-viewer` scope through `bindScopedKeys` (C17); the typing guard from `core/typingTarget.js` (C18) | §3.8: set `notInPilot` on the `U` row (04 3.6, like `O`). In the `uv-viewer` row: `[`/`]` read "turn the feed ∓90° (counter-clockwise / clockwise on the wall)"; the propagation rule reads "every keydown without Ctrl, Meta or Alt stops propagation, except `U`, and `Esc` when no drag is active; modified chords other than the scope's own undo/redo propagate, so `mod+S` and `mod+O` keep working"; scope actions run only when the target is `#uv-viewer-canvas`. §5.9.4: `bindScopedKeys(el, scope, actions, {actionTarget} = {})`: with `actionTarget`, actions dispatch only for keydowns whose target is that element, while the propagation rule applies to all of `el`. |
| 07-6 | Prefs | `app/Prefs.js`, stored under `morph-led-configurator:uvViewer` (C19, §4.8) | §4.8 row content: `{open, top, right, width, height, moved, pinned, background, space, aspect, zoom}`. |
| 07-7 | Events | `UVViewer` mirrors `HISTORY_CHANGED` (↶/↷ state and titles) and `PROJECT_REPLACED` (section list) | §5.10: add `UVViewer` to both subscriber lists. |
| 07-8 | Import | `ProjectSession.apply` step 3 hydrates F4 state (4.2). A v1 import resets the UV settings to defaults (§4.6). | none |

**Spec 05** (HDRI):

| # | Topic | Decision | Requested change in Spec 05 |
|---|---|---|---|
| 05-1 | `invertUv` signature | `invertUv(t, W, H, u, v, out)` (5.3) | §6.12: call `invertUv(plan.transform, plan.W, plan.H, u', v', tmp)`. |
| 05-2 | Post-transform | `wallPointFromBaseUv` already applies `sl.postTransform` (6.10) | §6.12: delete `X = sl.postTransform ? transformPoint(...)`. Applying it again moves offset sections twice. |
| 05-3 | Export bake size | `plan.sourceW × plan.sourceH` at k = 1 | §6.12 "Exports": replace `cols·ledX × rows·ledY`, which is wrong for `source_rotated` on a non-square section. |
| 05-4 | Combined bake layout | Follows `uv.combined_layout` | §7.2: `per-section` writes one `textures/<name>_HDRI.png` per material slot (as Section mode); `atlas` writes the atlas PNG, used with atlas UVs. Panel mode: section textures with `panel_uvs = 'section'`, none with `'panel'`. |
| 05-5 | Viewport LED mask | Follows the layout (6.4 materials table) | §5.6: `#ledRepeat` reads 04's plan. Combined `per-section`: a `Material[]` with one `hdri.create` per slot and repeat `(cols·ledX, rows·ledY)`. Combined `atlas`: one material with `(totalLedX, totalLedY)`. Panel `section` (08 P2-12d): one shared material per section with `(cols·ledX, rows·ledY)`. Panel `panel`: per panel `(ledX, ledY)`. |
| 05-6 | UVs for LED-mask content | Base UVs: `applyTransforms = false` for `hdri` as for `ledSim` (6.5, 6.13) | §5.6: one sentence noting it (05 already says the projection ignores UVs). |

**Spec 06** (branding):

| # | Topic | Decision | Requested change in Spec 06 |
|---|---|---|---|
| 06-1 | ZIP atlas name | `textures/` + `Brand.files.panelIdsPng` (08-7) | T6b: the `--rename panel-ids.png=morph-led-wall-panel-ids.png` mapping must also cover that token inside ZIP entry paths and inside the MTL `map_Kd`, glTF `images[].uri` and JSON `atlas.texture_file` text, so the mapped compare stays IDENTICAL. |
| 06-2 | `Theme.uv` | The values of 5.3 | none (06 §5.4 already reserves `uv`) |

**Spec 01** (normals):

| # | Topic | Decision | Requested change in Spec 01 |
|---|---|---|---|
| 01-1 | Debug shading on the combined mesh | `MaterialOverride` stashes `mesh.material` by reference, so a `Material[]` is restored intact. A debug material is applied as one material (r128 then draws the whole index range and ignores the groups). Restore before dispose. | §5.2 and T5: state the `Material[]` case and add it to the `MaterialOverride` unit test. (Applied.) |
| 01-2 | `disposeObject3D` de-duplication | 01 T10 is its one named owner (07 C52); UV-7 consumes it | none (applied) |
| 01-3 | Back shells and plane flips | `kind: 'led-wall-back'` meshes are never resolved by `LEDWallView.resolveHit` and are not hover targets (6.9). A panel mesh whose plane flip reverses local +x against the column order carries `userData.uMirrored = true`. | Where `LEDWallView` flips a panel plane, state the `uMirrored` value. (Applied in 01 §6.5: the in-place flip moves no vertex, so it never sets `uMirrored`.) |
| 01-4 | Toolbar and badge | `#toggle-uv-viewer` after `#debug-view-btn` (01 CR-7). The button's commit raises the two `@media` thresholds of spec 01's toolbar overflow fallback by 48 px (3.1). No badge token: per-feature tokens are frozen and 07 I4a rewrites the badge once (07 C35). | none |

**Spec 02** (sections):

| # | Topic | Decision | Requested change in Spec 02 |
|---|---|---|---|
| 02-1 | Help badge | This spec adds **no** badge token (07 C35). The `U` key is documented by the button title "UV Viewer (U)", 07's `KEYMAP`-generated `ShortcutHelp` and the README. | none |
| 02-2 | Selection observer, hover hit, double-click | 5.3 and UV-17: the observers are 07 I2's (07 C37), the hover hit comes from 02 T23's `hoverAt` bodies | none beyond 02 T23 |
| 02-3 | Vertex ranges, `pickMeshes`, `sectionRangeForFace` | Named owners (07 C52): vertex ranges and `sectionRangeForFace` are 08 P2-7's, `pickMeshes()` is 01 T10's; Specs 02 and 04 consume them | none |

---

## 3. UX design

### 3.1 Where the feature lives

1. **Sidebar, "Mesh Options" card.** A new **UV Mapping** block sits under the mesh-mode radios and is visible in all modes:
   ```
   ┌ MESH OPTIONS ───────────────────────────────┐
   │ (•) Single Combined Mesh                     │
   │ ( ) Individual Section Meshes                │
   │ ( ) Individual Panels                        │
   │ UV MAPPING                                   │
   │ Combined mesh UVs  [Per-section 0–1     ▾]   │
   │ Panel UVs          [Section space       ▾]   │
   │ [ ] glTF: also write atlas UVs (TEXCOORD_1)  │
   │ ⓘ Atlas 1,312 × 270 LED px                   │
   │   PNG 3,936 × 810 (3 px/LED)                 │
   │ Wireframe                         [ toggle ] │
   │ Show Panel Frames                 [ toggle ] │
   └──────────────────────────────────────────────┘
   ```
2. **Section card.** A new last row in `.section-content`, after Spec 02's offset group when that is present:
   ```
   UV Mapping   Identity                     [Edit UVs…]
   ```
3. **Viewport toolbar.** A new `#toggle-uv-viewer` button in `.viewport-controls`, after `#toggle-grid` and after Spec 01's `#toggle-normals`/`#debug-view-btn` if they land first (01 CR-7). Its title is "UV Viewer (U)", with `aria-pressed`. It uses `.view-btn.active`, whose one named owner is Spec 01 T7 (07 C52; B-L24). The column grows by one 40 px button and its 8 px gap, so the commit that adds the button (UV-14) also raises the two thresholds of spec 01's column overflow fallback in `css/features/debug-view.css` by 48 px: `@media (max-height: 444px)` becomes `492px`, and `@media (max-width: 900px) and (max-height: 794px)` becomes `842px` (01 §3.1, CR-7). If spec 01 lands after this button, it adds the fallback with the raised thresholds.
4. **UV Viewer floating panel**, `#uv-viewer`. It is absolutely positioned inside `.viewport` (which is `position: relative`).
   - **Wide layout (> 900 px):** default `top: 20px; right: 72px` (left of the view-button column, clear of Spec 06's reserved zone x ∈ [20, 140], y ∈ [20, 270]). Size 380 × 440 px. Resizable from the bottom-left corner (minimum 300 × 320, maximum 90 % of `.viewport` in each axis). Movable by dragging its header. The position is clamped so the header stays inside `.viewport`.
   - **Stacking against the camera preview window** (`#camera-preview-window`, bottom/right 20 px, resizable up to 800 × 600, no z-index):
     - The viewer uses `z-index: 30`, so it stacks above the preview window. In the shared `right: 72px` slot the z-order is Spec 01's debug popover 110 > this viewer 30 > Spec 05's HDRI badge 20 (07 C51).
     - Auto-offset runs on open, and whenever the preview window is shown, hidden or resized while the viewer is still at its default position. If the default rectangle would overlap the preview window, the viewer's height shrinks until its bottom edge is 8 px above the preview window's top, down to the 320 px minimum.
     - `FloatingPanel` observes the preview window element with a `ResizeObserver` (a hidden element reports 0 × 0, so showing and hiding are observed too). `PreviewWindow` needs no new hook.
     - If the panels still overlap, the viewer stays on top. Once the user has moved or resized the viewer, auto-offset stops for the session.
   - **Window and viewport resizes:** on `window` `resize`, and on `.viewport` size changes (the same `ResizeObserver` watches the host), the panel is re-clamped: its size to at most 90 % of `.viewport`, and its position so the header stays inside `.viewport`.
   - **Narrow layout (≤ 900 px):** a bottom sheet across the full width of `.viewport`. Its height is set as a share of `.viewport`, not of `vh`: `height: 60%; min-height: min(200px, 100%); max-height: 100%`. With the 350 px sidebar row, a 700 px-tall window has a 290 px viewport and a 200 px sheet, so nothing is clipped. Moving and resizing are disabled. On viewports under about 470 px tall the sheet overlaps the gizmo column; this is accepted because the user opens the viewer and can close it.
   - **Styles:** `css/features/floating-panel.css` and `css/features/uv-viewer.css`, in the `css/features/*` block of 07 C52's link order (before `css/12-responsive.css`). Each file carries its own `@media (max-width: 900px)` rules. `tests/static/css-slices.mjs` runs report-only and scoped to `01-12` (07 S7), so it never scans them.
5. **Help badge: not changed.** Per-feature tokens are frozen (07 C35): only Spec 01's ` N=normals` exists, and 07 I4a rewrites the badge once, to `Drag to rotate • Right-drag to pan • Scroll to zoom • WASD to move • G/R/L/P • ? all shortcuts`. The `U` key is documented by the toolbar button title, by 07's `KEYMAP`-generated `ShortcutHelp` and by the README.

### 3.2 UV Viewer wireframe

```
┌─ UV Viewer ─────────────── Main 500 ● ── [📌][×] ┐  ← header: drag to move; pin; close
│ Section [Main 500     ▾]  Show [Panel IDs ▾]      │  ← #uv-viewer-section, #uv-viewer-background
│ Space [Section|Atlas] View [Auto ▾] ⓘ per-section │  ← #uv-viewer-space-*, #uv-viewer-aspect
├───────────────────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░░ ┌──────────────────────────────────────┐ ░░░░ │  ← texture drawn in the 0–1 rect at the source
│ ░░ │ A3 ┊ B3 ┊ C3 ┊ D3 ┊ E3      ● rotate │ ░░░░ │    aspect Ws:Hs; outside 0–1 dimmed
│ ░░ │┄┄┄┄┼┄┄┄┄┼┄┄┄┄┼┄┄┄┄┼┄┄┄┄              │ ░░░░ │  ← UV wireframe (panel grid) + island outline
│ ░░ │ A2 ┊ B2 ┊ C2 ┊ D2 ┊ E2               │ ░░░░ │  ← corner/edge handles ■, rotate knob ●
│ ░░ │┄┄┄┄┼┄┄┄┄┼┄┄┄┄┼┄┄┄┄┼┄┄┄┄              │ ░░░░ │
│ ░░ │ A1 ┊ B1 ┊ C1 ┊ D1 ┊ E1     ✛ hover   │ ░░░░ │  ← crosshair at the hovered UV
│ ░░ └──────────────────────────────────────┘ ░░░░ │
├───────────────────────────────────────────────────┤
│ Offset U [ 0.0000] V [ 0.0000]   Units [UV|px]    │
│ Scale  U [ 100 %] V [ 100 %]  [🔗 lock]           │
│ Rotate [  0.0 °]  Turn feed [⟲ 90][⟳ 90]          │
│ Source [320×192|192×320]   Flip [↔ U][↕ V]        │
│ [Reset] [Fit 0–1] [Pixel-accurate] [Copy to all]  │
│ [↶][↷]  ● Pixel-accurate · source 320×192         │  ← #uv-status chips
│ Moving the island right shows content from further│  ← hint line (3.7)
│ right of the source (the image slides left).      │
├───────────────────────────────────────────────────┤
│ Main 500 · Panel C3 (c3 r3) · LED 17,40/64×64     │  ← #uv-readout (live hover)
│ px 145,40/320×192 · atlas LED 145,118             │
│ uv .4547,.7891 → .4547,.7891                      │
└───────────────────────────────────────────────────┘
```
The readout example is the `mixed` config's first section (5×3 panels of 64×64 LEDs, W×H = 320×192, atlas 1,312×270 LED px, so its top-left sits at atlas LED row 270 − 192 = 78).

### 3.3 Controls

| Id | Control | Label | Type, range, step | Default | Units and notes |
|---|---|---|---|---|---|
| `#uv-combined-layout` | select (sidebar) | Combined mesh UVs | `per-section` "Per-section 0–1 (one material per section)" \| `atlas` "Atlas, pixel-accurate (one texture)" | `per-section` | Rebuilds when the mesh mode is combined; otherwise only the model is written. The hint below it reads: "For one feed per mesh (nDisplay mesh projection, disguise): use Atlas or Individual Section Meshes." |
| `#uv-panel-mode` | select (sidebar) | Panel UVs | `section` "Section space (shared section texture)" \| `panel` "Per panel 0–1 (legacy)" | `section` | Rebuilds when the mesh mode is panel. |
| `#uv-gltf-uv1` | checkbox (sidebar) | glTF: also write atlas UVs (TEXCOORD_1) | boolean | off | Export-only. Enabled only when the combined layout is `per-section`. |
| `#uv-atlas-note` | text (sidebar) | – | – | – | Line 1: `Atlas {totalLedX} × {totalLedY} LED px`. Line 2: `PNG {pngW} × {pngH} ({pxPerLed} px/LED)`, where `png = totalLed·pxPerLed` is the size of `panel-ids.png` and of the ZIP atlas (`textures/` + `Brand.files.panelIdsPng`). Notes and warnings, each on its own line: <ul><li>"ⓘ Viewport section textures at {p} px/LED (16 MP budget)" when the section-texture budget reduced them (6.4).</li><li>"⚠ Larger than 4K" when the LED size exceeds 3840×2160 or 2160×3840 (the B-L17 expression).</li><li>"⚠ Over the GPU texture limit ({max} px): the Atlas layout is downscaled in the viewport" when the layout is `atlas` and `max(pngW, pngH) > maxTextureSize`. `maxTextureSize` is `renderer.capabilities.maxTextureSize`, typically 16,384, read through a getter injected into `UvController` (5.3).</li><li>"⚠ Exceeds the browser canvas limit: Export Panel IDs and the ZIP atlas will be skipped" when `!canvasFits(pngW, pngH)`. The limits are 08's `CANVAS_HARD_LIMITS`: 32,767 px per side and 268 MP. iOS Safari is lower, at about 16.7 MP (B-L4).</li></ul> |
| `.section-uv-summary` | text (card) | UV Mapping | – | `Identity` | `UvTransform.summaryFor(W, H)`, for example `Flip U · 90° · Source rotated · 50 % × 50 % · Offset 0.1000, 0.0000` |
| `.section-uv-btn` | button (card) | Edit UVs… | – | – | Opens the viewer on this section |
| `#toggle-uv-viewer` | toolbar button | UV Viewer (U) | toggle | closed | `aria-pressed` mirrors the open state |
| `#uv-viewer-section` | select | Section | every section by name | Spec 02's primary selected section, else the last viewed section, else the first | Names refresh on every rebuild and on rename (5.3, `onSectionRenamed`) |
| `#uv-viewer-background` | select | Show | `panelIds` "Panel IDs" \| `ledSim` "LED pixels" \| `checker` "UV checker" \| `hdri` "HDRI bake" (only when a Spec 05 baker reports an HDRI) \| `none` (the domain spellings of 07 C49's `ContentMode`, plus `checker` and `none`) | `panelIds` | Viewer preference |
| `#uv-viewer-space-section`, `#uv-viewer-space-atlas` | segmented buttons | Space | Section \| Atlas | Section | Atlas is read-only and enabled only for combined + `atlas` |
| `#uv-viewer-aspect` | select | View | `auto` "Auto" \| `texture` "Texture aspect" \| `square` "Square (UV space)" | `auto` | `auto` = `texture`, unless `max(Ws/Hs, Hs/Ws) > 8`, in which case it is `square`. Very long sections (50×1 panels is about 50:1) otherwise leave the island a few px tall. Viewer preference. |
| `#uv-viewer-pin` | toggle button | Pin | boolean | off | When pinned, the viewer ignores selection changes. |
| `#uv-offset-u`, `#uv-offset-v` | number | Offset U / V | [−8, 8], step 0.0001 (UV) or 1 (px) | 0 | Units toggle `#uv-units`. px uses the **source** size: `offsetU·Ws`, `offsetV·Hs` (6.3). Zero is accepted. Offsets move the island; the content on the wall slides the opposite way (3.7 hint). |
| `#uv-scale-u`, `#uv-scale-v` | number | Scale U / V | [1, 1600] %, step 0.1 | 100 % | Stored as a fraction from 0.01 to 16. 100 % means 1 LED = 1 source px. |
| `#uv-scale-lock` | toggle | 🔗 | boolean | **on** | Editing one scale field sets both. With the lock on, content is never sheared in pixels (6.3). |
| `#uv-rotation` | number | Rotate | any value, normalised to (−180, 180], step 0.1 ° | 0 ° | Rotates the **island** counter-clockwise within the current source (free rotation); the content on the wall turns the opposite way. Title: "Island rotation (counter-clockwise). The image on the wall turns the other way." It never changes the Source. |
| `#uv-rot-ccw`, `#uv-rot-cw` | buttons | Turn feed ⟲ 90 / ⟳ 90 | – | – | **Turn the feed**, named for the content on the wall: ⟳ turns the image on the wall clockwise (θ + 90, so the island turns counter-clockwise in the viewer); ⟲ the reverse. Each also toggles Source on non-square sections, so a filling island stays filling and pixel-exact. Titles: "Turn feed 90° clockwise (island turns counter-clockwise)" and "Turn feed 90° counter-clockwise (island turns clockwise)". Use these for processor-rotated feeds (6.6). |
| `#uv-source-wh`, `#uv-source-hw` | segmented buttons | Source | `{W}×{H}` \| `{H}×{W}`, shown with the actual numbers | `{W}×{H}` | `UvTransform.sourceRotated`. The pixel size of the content the section is fed with. Hidden when W = H, where the flag has no effect (don't-care, 6.6). |
| `#uv-flip-u`, `#uv-flip-v` | toggle buttons | Flip U / Flip V | boolean | off | |
| `#uv-preset-reset` | button | Reset | – | – | Identity |
| `#uv-preset-fit` | button | Fit 0–1 | – | – | Uniform scale, centred: the largest undistorted island that fits in [0,1]². Rotation, flips and Source are kept (6.6). |
| `#uv-preset-pixel` | button | Pixel-accurate | – | – | Scale 1, rotation snapped to 90°, Source chosen to match, offsets snapped to whole source pixels, flips kept (6.6) |
| `#uv-copy-all` | button | Copy to all | – | – | Applies this section's transform to every section; a Fit result is re-fitted per section (6.6). One history entry. |
| `#uv-undo`, `#uv-redo` | buttons | ↶ / ↷ | – | disabled | Call `uvController.undo()`/`redo()`, which call 07's global `history.undo()`/`redo()` (C16). Enabled state and titles (`Undo: {undoLabel}`, `Redo: {redoLabel}`) mirror `HISTORY_CHANGED`, so the title names the action that will be undone, UV or not (07 Q17). Path B: a temporary UV-only stack (5.2) with the same interface. |
| `#uv-status` | chips | – | – | – | See 3.7 |
| `#uv-readout` | text | – | – | "Hover the front of the wall or the UV canvas" | See 3.5 |
| `#uv-viewer-canvas` | canvas | – | `tabindex="0"`, `aria-label="UV editor canvas"` | – | Carries a `data-island` attribute: the island's screen corners in CSS px (BL, BR, TR, TL), as JSON, for the harness. |

**Commit semantics of the numeric fields.**
- `input` gives a **live preview**: `UvController.previewField(sectionId, field, raw)` writes the domain and updates the viewport in place, with no history entry. The first preview of an edit session stores the before-state locally (a cancel snapshot, not an undo stack).
- `change` (Enter, blur after editing, or a spinner click) **commits**: `UvController.commitField(sectionId, field, raw)` records exactly one history entry (`history.record('UV <Field> (<name>)', {coalesceKey: 'uv:<id>:<field>'})`) and writes the stored value back into the field. Repeated spinner clicks within 07's 750 ms window coalesce into that entry.
- Escape inside a field reverts the preview to the before-state and ends the session without an entry.
- As a result, typing "0.125" creates one undo entry, not five.

### 3.4 Canvas interactions (UV viewer)

All drag maths run in **source-pixel space** (6.8). In the default Texture view this is screen space up to a uniform scale, so handles respond the same in every direction. In Square view the island is drawn in raw UV space: it may appear as a parallelogram (display only), while the maths still runs in source pixels.

| Gesture | Effect | Snapping and modifiers |
|---|---|---|
| Drag inside the island | Translate (offset) | Snaps to the source-pixel grid (1/Ws, 1/Hs) by default. **Alt** turns snapping off. **Shift** locks the axis, chosen from the larger screen component of the first 4 px of travel. Offsets clamp to [−8, 8]. |
| Drag a corner handle ■ | Scale, with the opposite corner anchored | 1 % steps. Uniform while the 🔗 lock is on (the default). **Shift** inverts the lock for this drag. **Alt** gives free (unsnapped) scaling. |
| Drag an edge handle ■ | Scale one axis, with the opposite edge anchored | As for corners; with the lock on, the other axis follows |
| Drag the rotate knob ● | Rotate the island about its centre | 15° steps. **Shift** snaps to 90°. **Alt** gives free rotation. The angle is measured in source-pixel space. A rotate drag never changes the Source. |
| Wheel | Zoom about the cursor, ×0.1 to ×64 | `preventDefault`; never reaches the 3D canvas |
| Middle-drag, or Space + drag | Pan | |
| Double-click on empty canvas | Frame the 0–1 rect, with an 8 % margin | |
| Hover | Readout of the panel, LED and pixel under the cursor. The matching panel is outlined on the 3D wall (optional `UvHighlightView`). | |
| Escape while dragging | Cancels the drag and restores the transform | Consumed |

A drag records **one** history entry when it ends (`history.record('UV drag (<name>)')`, no coalesce key, no transaction: 07 transactions are for gizmo drags only). A cancelled drag records nothing.

**Handles on a general quadrilateral.**
- The island is drawn from `screen(islandCorners)`. It is a rectangle in Texture view, and a parallelogram in Square view at non-quarter angles. Flips reverse its winding.
- Handles:
  - 4 corners;
  - 4 edge midpoints;
  - the rotate knob, 24 CSS px beyond the midpoint of the TL–TR edge, along that edge's screen-space outward normal (the normal pointing away from the quad's centroid).
- Hit-test order, with an 8 CSS px radius for the handles:
  1. knob;
  2. corners;
  3. edge midpoints;
  4. interior, using a point-in-convex-polygon test. All edge cross products must have the sign of the quad's signed area, so flipped islands work.
  5. Otherwise, empty canvas.
- **Thin islands:**
  - If a side is shorter than 24 CSS px on screen, the edge handles across that side are disabled.
  - If both sides are shorter than 16 px, only translate (interior) and the knob stay active, and the hint "Zoom in to edit handles" appears.
- **Cursors:** `move` for the interior and `grab`/`grabbing` for the knob. For corners and edges, the cursor follows the screen angle of the handle from the centroid, in 45° buckets: `ew-resize`, `nesw-resize`, `ns-resize`, `nwse-resize`.

During a drag, a cursor tooltip shows the live delta, for example `Δu +0.0125 (4 px)`, `Scale 87.5 %` or `Rot 45°`.

### 3.5 Viewport interactions

- **Hover readout.** Active only while the viewer is open. It is skipped while orbit-dragging (`e.buttons !== 0`), while dragging the gizmo, and in pilot mode.
  - Until Spec 02 T23 lands, `WallHoverProbe` raycasts the **front LED meshes** (`view.meshes()`, never Spec 01's back shells) at most once per animation frame.
  - From Spec 02 T23 on, the probe performs **no raycasts of its own**. It reuses the nearest wall intersection from `SelectionManager.hoverAt`, the app's single hover raycast (07 I2 skeleton, bodies by 02 T23; 07 C37), through `addHoverHitObserver` (5.3). If that hit is a back shell, `resolveHit` returns `null`.
  - Hovering the back of the wall (after Spec 01 F1-5 the LED faces are `FrontSide`, so the ray reaches the shell or nothing) shows "Hover the front of the wall or the UV canvas".

  Readout format:
  ```
  {section name} · Panel {C3} (c{col+1} r{row+1}) · LED {lx},{ly}/{ledX}×{ledY}
  px {px},{py}/{W}×{H} · atlas LED {gx},{gy}
  uv {baseU},{baseV} → {finalU},{finalV}
  ```
  - `px`/`py` are physical section pixels (LEDs) with a top-left origin.
  - `atlas LED` gives the section pixel's position in the atlas, in **LED pixels**, with a top-left origin. To get pixels in `panel-ids.png` or the ZIP atlas, multiply by `png_px_per_led` from the sidebar note or from the JSON's top-level `atlas` (4.2).
  - `uv` shows the base value and the exported value.

  The viewer canvas shows a crosshair at the final UV when the hovered section is the one on display.
- **Double-click on the wall.**
  - Without Spec 02, while the viewer is open, it shows that section in the viewer.
  - With Spec 02, the probe registers **no** `dblclick` listener (`doubleClick: false`, 5.3). Spec 02's double-click selects the section and frames it. The viewer follows the selection unless it is pinned.
- **With Spec 02,** clicking a wall section selects it, and the viewer follows the **primary** selected section unless it is pinned. Multi-selection follows the primary. Deselecting leaves the viewer on its current section.
- **Seeing edits on the wall.** UV edits show on the wall only when the content uses UVs (Panel IDs, or an HDRI bake in exports). In colour mode the chip "ⓘ Wall shows colours: UV edits are not visible on the wall" carries a `[Show Panel IDs]` action (3.7).

### 3.6 Keyboard shortcuts

Existing and sibling-spec keys:
- legacy: G, R, L, P and Escape, and WASD, the arrow keys, Q and E (orbit and pilot movement);
- Spec 01: N, Shift+N;
- Spec 02: F, [, ], Ctrl/⌘+D, Ctrl/⌘+A, Delete/Backspace;
- Spec 03: O;
- Spec 05: H, Shift+H, comma, period;
- Spec 07: Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y, Ctrl/⌘+S, Ctrl/⌘+O, `?`. Spec 07's `KEYMAP` already holds the `U` row and the `uv-viewer` scope for this feature (07 §3.8).

**Path A (07 I1 landed; the primary design).** Every chord is a `KEYMAP` row (07 C17, rule S5). This feature adds no `keydown` listener.

| Chord | Scope | Action id | Flags | Effect | Conflict check |
|---|---|---|---|---|---|
| **U** | global | `uv.toggleViewer` | `notInPilot` (requested, 2.3 row 07-5) | Toggle the UV viewer | Free (reserved by 07). 07's defaults also ignore it while typing (`core/typingTarget.js`, C18), with Ctrl, Meta or Alt held, and on `e.repeat`. |
| ← → ↑ ↓ | `uv-viewer` | `uv.nudge*` | `allowRepeat` | Nudge the offset by 1 source pixel (1/Ws, 1/Hs). **Shift**: by one panel (1/cols, 1/rows). | Orbit uses these keys; the scope stops propagation and 07's movement guard ignores `[data-key-scope]` targets. |
| H / V | `uv-viewer` | `uv.flipU`, `uv.flipV` | – | Flip U / Flip V | Shadows Spec 05's H while the canvas has focus |
| [ / ] (`BracketLeft`/`BracketRight`) | `uv-viewer` | `uv.turnFeedCcw`, `uv.turnFeedCw` | – | Turn the feed 90° counter-clockwise / clockwise on the wall (as `#uv-rot-ccw`/`#uv-rot-cw`) | Shadows Spec 02's select previous/next while the canvas has focus |
| F | `uv-viewer` | `uv.fit` | – | Fit 0–1 | Shadows `view.frame` while the canvas has focus |
| 0 | `uv-viewer` | `uv.reset` | – | Reset | – |
| Home | `uv-viewer` | `uv.frame` | – | Frame the 0–1 rect | – |
| Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y | `uv-viewer` | `history.undo`, `history.redo` | – | The global undo and redo (07 C16) | Same actions as the global rows |
| Escape | `uv-viewer` | `uv.cancelDrag` | – | Cancels an active drag (consumed). Otherwise it propagates to 07's Escape chain (dialog, gizmo drag, pilot, deselect). | – |

**Focus scoping rule.** `UVViewer` binds the scope with `bindScopedKeys(panelEl, 'uv-viewer', actions, {actionTarget: canvasEl})` (the `actionTarget` option is requested in 2.3 row 07-5). For a keydown inside the panel:
1. **Viewer actions** run **only when `e.target` is `#uv-viewer-canvas`**. Inside an INPUT, SELECT or a button of the panel, the native behaviour applies: typing "0.1" in `#uv-offset-u` never triggers Reset, arrow keys step the number, and Ctrl+Z is the field's own undo.
2. **Propagation is stopped** for every key pressed without Ctrl, Meta or Alt (Shift allowed), except two:
   - U. It reaches the global dispatcher, which ignores it when the target is a typing field. So U toggles the viewer from the canvas, but not while typing in `#uv-offset-u`.
   - Escape when no drag is active.
3. **Modified chords pass through** (Ctrl/⌘+S, +O, +D, +A), except the scope's own undo/redo chords while the canvas has focus.

As a result, while focus is anywhere in the panel, these do not fire: G, R, L, P, the WASD, arrow, Q and E movement keys, Spec 01's N, Spec 02's F, [, ] and Delete, Spec 03's O, and Spec 05's H, comma and period. `keyup` is **never** stopped, because `KeyboardState` must still see key releases; otherwise a key held while focus moved into the panel would stay stuck.

**Path B (fallback only; not built under the recommended order).** 07 C58 schedules 07 I1-I3 before UV-12/13, so this path exists only if UV-12 were to merge before 07 I1.
- `ViewportInput.attachShortcuts` gains a `'u'` branch (`e.key.toLowerCase() === 'u'`, like G/R/L/P) that calls an injected `commands.toggleUvViewer`. Guards: the Phase-1 `isShortcutIgnoredTarget` as extended by 08 P2-9 (B-L11), Ctrl, Meta or Alt held, `e.repeat`, and `interaction.isPilotMode`.
- `UVViewer` attaches one bubbling `keydown` listener on `#uv-viewer` that implements the focus scoping rule above. In Path B, Ctrl/⌘+Z on the canvas calls the temporary UV stack.
- The static check lists this listener as a declared exception to 07 rule S5. UV-18 replaces both with the Path A rows and deletes the exception.

### 3.7 Feedback states

**Status chips** (`#uv-status`), complete list:
- `● Pixel-accurate · source {Ws}×{Hs}` (success colour). The `{Ws}×{Hs}` part reads H×W when Source is rotated.
- `▲ Resampled · 1 LED = {su} × {sv} source px` (warning), for example `1 LED = 0.50 × 0.50 source px`, which magnifies the content 2×.
- `▲ Resampled · rotated pixel grid ({θ}°)` (warning) when θ is not a multiple of 90.
- `⚠ Outside 0–1 (edges clamp)`.
- `⚠ Bleeds into neighbouring sections` (atlas layout only).
- `ⓘ Wall shows colours: UV edits are not visible on the wall [Show Panel IDs]` (content `color`). The action calls `uvController.showPanelIds()`, which calls `wallController.setContentMode('panelIds')` (07 C49; before Feature 5 adds `setContentMode`, `wallController.setPanelIds(true)`, which becomes its wrapper), recorded like the toggle.
- `ⓘ LED simulation shows physical pixels; UV transform not applied` (content LED sim).
- `ⓘ HDRI projection ignores UVs; the LED mask shows physical pixels` (content `hdri`; the transform applies to the HDRI **bake** in exports).
- `ⓘ Per-panel UVs: transform not applied in Panel mode` (panel mode with `panel_uvs = 'panel'`).
- `ⓘ Zoom in to see LEDs` (LED background below 3 CSS px per LED).
- `ⓘ Background stretched to the {Hs}×{Ws} source` (Source rotated, with a W×H background such as Panel IDs).
- `ⓘ No HDRI loaded` (background `hdri` without a baker or HDRI).
- `ⓘ Preview downscaled` (background over the preview budget, 6.11).

**Other feedback:**
- **Header:** the section name, plus a colour dot in `section.color`. Both refresh on rename and colour changes.
- **Toolbar button:** `.active` / `aria-pressed` while the viewer is open.
- **Card summary:** updates live while dragging and while previewing a field.
- **Undo/redo buttons:** mirror `HISTORY_CHANGED` (`canUndo`, `canRedo`, labels).
- **Hint line** under the controls: "Moving the island right shows content from further right of the source (the image slides left on the wall)." This follows from 6.3: with `offset_u = +0.25`, the wall's left edge samples `u' = 0.25` (R10).

### 3.8 Empty and error states (`#uv-viewer-message`, which replaces the canvas area)

| Condition | Message | Controls |
|---|---|---|
| No section to show (only possible transiently) | "Select a wall section: click it in the viewport, or pick one above." | Disabled |
| Section counts are not positive integers. This cannot happen once 08 P2-8a and the validator have landed; the guard stays for robustness. | "Wall N has non-integer panel or pixel counts. Fix them in the section card to edit UVs." | Disabled |
| Background `hdri` with no baker or HDRI | Background falls back to `checker`, with the chip "ⓘ No HDRI loaded" | Enabled |
| Background canvas over the preview budget | Rendered at reduced scale (6.11), with the chip "ⓘ Preview downscaled". If even the reduced canvas fails `canvasFits`, the checker background is shown. | Enabled |
| Viewed section deleted (Spec 02 delete, 07 `revalidate`, open, undo) | The viewer switches to the nearest remaining section by index | – |
| Hover on the back of the wall or off the wall | Readout: "Hover the front of the wall or the UV canvas" | – |

---

## 4. Data model

### 4.1 Domain (`js/domain/UvSettings.js`, new; and changes)

```js
export const UvLayout    = Object.freeze({ PER_SECTION: 'per-section', ATLAS: 'atlas' });
export const PanelUvMode = Object.freeze({ SECTION: 'section', PANEL: 'panel' });
```

**`UvTransform`** (value object; `WallSection.uvTransform`)

| Field | Type | Default | Validation (UI rule and import validator) | JSON v2 leaf (inside `sections[i].uv_transform`) |
|---|---|---|---|---|
| `offsetU` | number (UV units) | 0 | `Number.isFinite`, else 0; clamp [−8, 8] | `offset_u` |
| `offsetV` | number | 0 | same | `offset_v` |
| `scaleU` | number (fraction; source px per LED) | 1 | finite and ≠ 0, else 1. A negative value takes `abs(v)` and toggles `flipU` (import: `coerced`). Clamp to [0.01, 16]. The UI enters percent [1, 1600]. | `scale_u` |
| `scaleV` | number | 1 | same, toggling `flipV` | `scale_v` |
| `rotation` | number (degrees, counter-clockwise island rotation in source-pixel space with v up) | 0 | finite, else 0; normalised to (−180, 180] with `d − 360·Math.ceil((d − 180)/360)` | `rotation_degrees` |
| `flipU` | boolean | false | `=== true`; `"true"`/`"false"` are coerced; anything else is false | `flip_u` |
| `flipV` | boolean | false | same | `flip_v` |
| `sourceRotated` | boolean | false | same. Don't-care when W = H (6.6). | `source_rotated` (new leaf, 2.3 row 07-2) |

Members:
- `static identity()`, `get isIdentity()`, `isIdentityFor(W, H)`, `clone()`, `equals(o)`.
- `summaryFor(W, H)`.
- `static RULES`: raw UI strings to stored values. They are `Number.isFinite` based, so 0 is legal (this avoids B-L9). The validator calls the same functions (07 §4.3).
- `setField(field, raw)`.
- `static normalizeRotation(deg)`.
- `toJSON()` returns the **full** snake_case object of 4.2, defaults included. `static fromJSON(validated)` builds from a validated object.

`isIdentity` is true when both offsets `=== 0`, both scales `=== 1`, the rotation `=== 0`, `sourceRotated === false` and neither flip is set. `isIdentityFor(W, H)` is also true when only `sourceRotated` differs and `W === H`. `summaryFor(W, H)` lists only the non-default parts, in this order: flips, rotation, "Source rotated" (only when W ≠ H), scale, offset. For example: `Flip U · 90° · Source rotated · 50 % × 50 % · Offset 0.1000, 0.0000`.

**`UvSettings`** (`Project.uv`; JSON top-level `uv`)

| Field | Type | Default | JSON v2 leaf (inside `uv`) |
|---|---|---|---|
| `combinedLayout` | `'per-section' \| 'atlas'` | `'per-section'` | `combined_layout` |
| `panelUvs` | `'section' \| 'panel'` | `'section'` | `panel_uvs` |
| `gltfAtlasTexcoord1` | boolean | `false` | `gltf_atlas_texcoord1` |

Members: `get isDefault()`, `static RULES`, `assign({combinedLayout, panelUvs, gltfAtlasTexcoord1})` (validated values; 07 §4.1 rule: aggregate parts are hydrated in place, never replaced), `toJSON()` (the full snake_case object) and `static fromJSON(validated)` (the field object for `assign`).

**Changes to existing domain classes**
- `WallSection`:
  - `SECTION_FIELDS` gains `'uvTransform'`, appended at the end (07 §4.1).
  - The constructor sets `this.uvTransform = fields.uvTransform instanceof UvTransform ? fields.uvTransform : UvTransform.identity()`. Each section owns its own instance; instances are never shared.
  - New writer: `setUvTransform(t)`, which stores `t.clone()`.
  - The B-L15 rounding is **not** part of this spec; it comes from 08 P2-8a.
- `Wall.appendLikeLast`: a new section gets `UvTransform.identity()`. It does not copy the last section's transform (Q8).
- `Project`: a new field `uv = new UvSettings()`, set in the constructor and in `createDefault()`. It is injected by reference and never replaced.
- State map (ARCHITECTURE section 4) additions:
  - `WallSection.uvTransform` is written by `UvController` (preview, commit, drag, preset, flip, turn, copy) and by section construction in `ProjectSession.apply` (open, undo, redo).
  - `Project.uv` is written by `UvController.setCombinedLayout/setPanelUvs/setGltfAtlasTexcoord1` and by `ProjectSession.apply` step 3.
  - Both are **model state**: they are in 07's `history` variant and are undoable through `ProjectSession.apply`.

### 4.2 Project JSON v2 (the keys this spec fills)

Spec 07 owns the envelope, the key names and casing, the key order, the variants, the validator and the migration (07 §4.2–4.7; C1, C2, C8). The keys below are F4's reserved keys (07 §4.4 rule 1). Following 07 §4.4 rule 3, this spec supplies their rows, the `io/ProjectSchema.js` entries, absent-means-default behaviour, the round-trip tests and the reachability cases.

**Revision.** Feature 4's keys are absent until UV-5c lands (07 C39). UV-5c adds all four keys in one commit with **one** revision bump for this feature release, whose number is assigned at merge time and recorded in `ProjectSchema.REVISIONS` (07 C40); the derived `pixel_map` and `atlas` never bump on their own. It sets `KNOWN_REVISION` (07 §4.4 rule 4). An older reader drops them as `dropped-unknown` (info), under 07's `newer-revision` warning.

**Placement and order** (07 §4.2 skeleton):
- per section, after `color`: `uv_transform`, then `pixel_map`, then 07's `logo`, `texture_file` (zip variant) and `extensions`;
- top level, after `pivot`: `uv`, then `atlas`, then `display`.

**Field rows** (07 §4.3 format; owner F4):

| Path | Type | Default | Validator (07 §6.7 issue codes) | Writers can produce |
|---|---|---|---|---|
| `sections[i].uv_transform` | object | identity | Absent: identity, silent. `null` or any non-object: identity plus `defaulted`. Unknown leaves: `dropped-unknown`. | `UvController` writes through `UvTransform`; the serializer writes the full object |
| `….offset_u`, `….offset_v` | number (UV units) | 0 | non-finite: 0 (`defaulted`); clamp [−8, 8] (`clamped`) | fields [−8, 8]; drags and nudges clamp to [−8, 8]; Pixel-accurate rounds within the range |
| `….scale_u`, `….scale_v` | number (source px per LED) | 1 | 0 or non-finite: 1 (`defaulted`); negative: `abs(v)` and toggles `flip_u`/`flip_v` (`coerced`); clamp [0.01, 16] (`clamped`) | fields 1–1600 % = [0.01, 16]; drags and Fit clamp to [0.01, 16] |
| `….rotation_degrees` | number (degrees, CCW, source-pixel space) | 0 | non-finite: 0 (`defaulted`); normalised into (−180, 180] (`wrapped`, info) | every writer stores `normalizeRotation(θ)` |
| `….flip_u`, `….flip_v` | bool | `false` | `"true"`/`"false"`: converted (`coerced`); any other non-boolean: `false` plus `defaulted` | toggles |
| `….source_rotated` | bool | `false` | as `flip_u` | Turn, Pixel-accurate and Source controls |
| `sections[i].pixel_map` | object | derived | ignored on read (07 derived key) | `pixelMapJson` |
| `uv` | object | defaults | Absent: defaults, silent. Non-object: defaults plus `defaulted`. Unknown leaves (for example a `mode` key): `dropped-unknown`. | `UvController`; the serializer writes the full object |
| `uv.combined_layout` | enum `per-section\|atlas` | `per-section` | unknown: default plus `defaulted` | select |
| `uv.panel_uvs` | enum `section\|panel` | `section` | unknown: default plus `defaulted` | select |
| `uv.gltf_atlas_texcoord1` | bool | `false` | as `flip_u` | checkbox |
| `atlas` | object | derived | ignored on read (07 derived key) | `pixelMapJson` |

**Writer.** It always writes the full objects, defaults included, with the leaves in the row order above. 07 writes identity objects; there is no `null` canonicalisation. Reading an absent key or a full default object gives the same domain state. Every value a writer can produce lies inside the validator's range, so 07's fidelity rule holds: `strip(validateProject(file).project)` deep-equals `strip(file)` with no issues (`strip` removes `pixel_map` and `atlas` with 07's other derived keys).

**Variants** (07 §4.2):
- `uv_transform` and `uv` are model state and appear in every variant, including `history`.
- `pixel_map` and `atlas` are derived: written in `file`, `zip` and `autosave`, omitted in `history`.
- `atlas.texture_file` appears only in the `zip` variant, and only when the atlas PNG was actually written (08 P2-1 guard). Section textures keep 07's v1 key `sections[].texture_file`.

**Example fragment** (`mixed` config, first section turned for a rotated feed; other keys elided):
```jsonc
{
  "version": "2.<n>",                                   // the revision UV-5c introduced (07 §4.4 rule 4)
  "generator": { "…": "…" }, "format": "morph-led-project",
  "project": { "…": "…" },
  "sections": [
    { "name": "Main 500", "id": 10,
      "panel": { "columns": 5, "rows": 3, "width_mm": 500, "height_mm": 500 },
      "led_resolution": { "x": 64, "y": 64, "…": "…" },
      "curvature": { "…": "…" },
      // F1/F2 keys when landed (face_orientation, offset, locked)
      "color": "#00f0ff",
      "uv_transform": { "offset_u": 0, "offset_v": 0, "scale_u": 1, "scale_v": 1, "rotation_degrees": 90,
                        "flip_u": false, "flip_v": false, "source_rotated": true },
      "pixel_map": { "width_led": 320, "height_led": 192, "atlas_x_led": 0, "atlas_y_led": 78,
                     "texture_px_per_led": 4, "texture_width_px": 1280, "texture_height_px": 768 },
      "logo": null,
      "texture_file": "textures/Main_500_PanelIDs.png",  // zip variant only (07; v1 key)
      "extensions": {} }
    // … the other three sections
  ],
  "mesh_mode": "combined",
  "pivot": { "…": "…" },
  "uv": { "combined_layout": "per-section", "panel_uvs": "section", "gltf_atlas_texcoord1": false },
  "atlas": { "width_led": 1312, "height_led": 270, "png_px_per_led": 3, "png_width_px": 3936, "png_height_px": 810,
             "texture_file": "textures/panel-ids.png" },  // texture_file: zip variant only, and only when written
  "display": { "…": "…" },
  "…": "…"
}
```

**`pixel_map`** (per section, derived). It exists so that media-server and processor operators can map pixels without opening the app. Coordinates are LED pixels with a top-left origin (`_led`, 2.3 row 07-3):
- `width_led`/`height_led` = W/H.
- `atlas_x_led = ledOffsetX` and `atlas_y_led = totalLedY − H` (bottom-aligned).
- `texture_px_per_led = clamp(floor(4096/max(W, H)), 1, 4)`, and `texture_width_px`/`texture_height_px` describe the ZIP's per-section texture (`sections[].texture_file`). ZIP textures never use the viewport budget of 6.4.

**`atlas`** (top level, derived):
- `width_led`/`height_led` = `totalLedX`/`totalLedY`.
- `png_px_per_led = clamp(floor(4096/max(totalLedX, totalLedY)), 1, 4)`: the density of `panel-ids.png` (`Brand.files.panelIdsPng`) and of the ZIP atlas. `png_width_px`/`png_height_px` = LED size × `png_px_per_led`. For the default wall this is 160×96 LED, 4 px/LED, 640×384; for `mixed` it is 1312×270 LED, 3 px/LED, 3,936×810.
- `texture_file`: `textures/` + `Brand.files.panelIdsPng`, in the zip variant only, and only when written.

**Import and migration** (07 §4.6, D5):
- **v2.** `ProjectSession.apply` step 3 builds each section with `uvTransform: UvTransform.fromJSON(s.uv_transform)` (already validated) and calls `project.uv.assign(UvSettings.fromJSON(v.uv))`. The rebuild in step 5 then reaches `UvController.onWallRebuilt` (5.3).
- **v1.** A wall-only import: `uv_transform` takes the feature default (identity) and `uv` its defaults (07 §4.6 mapping table and scope). A v1 file carried no UV intent, and its exported UVs were defective. No issue is raised for the missing keys; the single `migrated` info applies.
- **Older v2 revision** without F4 keys: defaults, silently.
- **History.** There is no `resetHistory`. `ProjectSession.openFile` records exactly one `Open "<file>"` entry in 07's History, and undoing it restores the previous project, including its UVs.

**Not persisted in the project:** viewer state (open, position and size, moved flag, pin, background, space, view aspect, zoom).
- It is stored per browser by `app/Prefs.js` under `morph-led-configurator:uvViewer` (07 C19, §4.8). Until 07 H3 provides `Prefs`, `App` injects an in-memory `{get, set}`, so the state lasts for the session only.
- It is never recorded in History (07 §5.6.1, "Not recorded").
- `Prefs` wraps every access in try/catch, and the panel renders correctly without stored state.

---

## 5. Architecture

### 5.1 Decision: how Combined mode gives every section a 0..1 UV space

| Option | three r128 viewport | OBJ | glTF | Unreal (static mesh / nDisplay) | disguise | Blender / Maya | Verdict |
|---|---|---|---|---|---|---|---|
| **A. Geometry groups + one material per section; UV0 is 0..1 per section, overlapping across sections** | `BufferGeometry.addGroup` and material arrays are core in r128. Raycast returns a global `faceIndex` plus `face.materialIndex` (verified in `Mesh.raycast`). | `usemtl` per section inside one `o` | One mesh with N primitives, each with its own material and accessors | One static mesh with N material slots, and UV0 per slot. A single nDisplay mesh-projection viewport would repeat across the overlapping islands, so use Section mode or B for that. | Overlapping islands on one screen object would show the same feed on every section. Use Section mode or B. | Material slots plus one UV map | **Default (`per-section`)** for per-material workflows: every engine maps content per slot. It is one way to meet the owner's "fill the entire UV space", not a layout the owner asked for; it does **not** suit one feed per mesh (see the Unreal and disguise columns). |
| **B. Atlas: UV0 non-overlapping and pixel-accurate, laid out as `panel-ids.png`** | Single texture. This is the 08 P2-7a output. | Yes (08 P2-7b) | Yes (08 P2-7c) | One canvas per mesh. Works for mesh projection. | One feed canvas = `panel-ids.png` | Yes | **Option (`atlas`).** For pixel-mapping and single-feed workflows. |
| C. UDIM-like tiles (section i at u ∈ [i, i+1]) | No UDIM. A shader or per-group textures would be needed anyway. | `vt` > 1 is allowed | Allowed, but has no UDIM meaning; viewers repeat-wrap | Needs Virtual Texturing and `name.1001.png` naming. nDisplay expects 0..1. | Not supported (0..1 expected) | Native | **Rejected as a default.** A possible later export option (Q4). |
| D. Two UV channels (UV0 per-section, UV1 atlas) | `map` samples only `uv`. In r128, `uv2` is read only by `lightMap`/`aoMap` (`uv2_pars_vertex`), so the viewport would have to swap attributes. `Texture.channel` exists only in three r151+. | Impossible: OBJ has one `vt` set | `TEXCOORD_1` | Imported. However, "Generate Lightmap UVs" (on by default) writes UV channel 1, which clashes. | UV0 only | Two UV maps | **Optional glTF extra** (`gltf_atlas_texcoord1`, default off) |

Conclusion:
- The Combined mesh **always** carries one geometry group, material slot or primitive per section. 08 P2-7d does this for the exports; this spec does it for the viewport in UV-7.
- The layout setting chooses only the UV values (per-section 0..1 or atlas) and which texture each slot references.
- Section mode stays the recommended export for nDisplay or disguise setups with one object per screen. The sidebar hint under `#uv-combined-layout` says so (3.3).
- **Which default fits which workflow.** Per-section suits workflows that apply content per material slot (Unreal static meshes with per-slot materials, Unity, Blender, Maya). One-feed-per-mesh workflows (nDisplay mesh projection, a disguise screen object) sample one 0..1 canvas over the whole mesh, so overlapping islands would repeat the feed: they need Atlas, or Individual Section Meshes with one object per section. These are the owner's main pipelines, so Q12's pipeline check also decides Q1, and Q18 asks whether the default should follow an export target.

### 5.2 Modules added

| Path | Layer | Class or exports | Responsibility |
|---|---|---|---|
| `js/domain/UvSettings.js` | domain | `UvLayout`, `PanelUvMode`, `UvTransform`, `UvSettings` | 4.1 |
| `js/geometry/UvMapper.js` | geometry (pure) | Functions, see below | The transform maths, layout plans, presets, pixel accuracy and drag maths |
| `js/geometry/PixelMap.js` | geometry (pure) | Functions, see below | Conversions between UV and pixel, panel or atlas coordinates; the wall point for a UV (with `postTransform`); hover descriptions; the `pixel_map` and `atlas` JSON blocks |
| `js/app/UvViewModel.js` | app | `UvViewModel` | Viewer state (open, section, pin, background, space, aspect). Computes `SectionUvData` and background canvases. Emits the viewer events. |
| `js/app/UvController.js` | app | `UvController` | Use cases: transform preview and commit, presets, quarter turns, drag, history recording through 07's `History`, settings, viewer commands, hover. It is a `SelectionManager` observer and a `WallController` rebuild observer. |
| `js/app/UvFallbackHistory.js` | app | `UvFallbackHistory` | **Path B fallback only; not built under the recommended order (07 C58: H1 lands before UV-13).** A 200-entry UV-only stack with the subset of 07's `History` interface that `UvController` uses (`record`, `undo`, `redo`, `canUndo`, `canRedo`, `undoLabel`, `redoLabel`), plus pruning of entries for deleted sections. Deleted by UV-18. |
| `js/interaction/WallHoverProbe.js` | interaction | `WallHoverProbe` | Wall hover in two modes: its own rAF-throttled raycast of the front LED meshes (until 02 T23), or a consumer of `SelectionManager.hoverAt`'s hit (07 C37). Optional double-click. Calls back into the app through injected callbacks. |
| `js/render/UvHighlightView.js` | render | `UvHighlightView` | Optional. A two-tone outline of the hovered panel on the 3D wall, in world coordinates: one explicitly closed `THREE.Line` geometry (never `LineLoop`) drawn as a `--scene-overlay-halo` halo plus a light core (06 D15), at `RENDER_ORDER.UV_HOVER_OUTLINE` (994, spec 01's registry). Registered with `sceneManager.addHelper`, so it is on the HELPERS layer once layers exist. |
| `js/ui/FloatingPanel.js` | ui | `FloatingPanel` | A generic move/resize/close panel with focus handling, narrow-sheet mode, re-clamping and the preview-window auto-offset through `ResizeObserver` (3.1). The future home of `PreviewWindow`'s chrome; migrating it is out of scope (Spec 05 or 07 R2 can do it). |
| `js/ui/UVViewer.js` | ui | `UVViewer` | Panel content, controls, the toolbar button, the `uv-viewer` key scope (3.6), the `uv.toggleViewer` action registration, and mirrors for the viewer events |
| `js/ui/UVCanvas.js` | ui | `UVCanvas` | 2D drawing, view zoom, pan and aspect, and general-quad handle hit-testing. Pure DOM canvas. |
| `css/features/floating-panel.css`, `css/features/uv-viewer.css` | css | – | In the `css/features/*` block of 07 C52's link order. Their selectors do not overlap the legacy slices; 06's role tokens only. |
| `tests/regression/tools/pair-diff.mjs` | test tool | CLI | Compares two screenshots **from the same run** (criteria 4 and 19). Uses `lib/formats.mjs#decodePNG`. Options: `--shot-threshold 8 --shot-max-percent 0.5`. Prints the differing percentage and the diff bounding box. Exits 0 or 1. |

The layering follows ARCHITECTURE 1.3 (with 07's amendment that `ui` may import `interaction/Keymap.js` and `core/typingTarget.js`):
- `ui/UVViewer.js` imports only `core/`, `legacy/`, `domain/UvSettings.js` (for its static `RULES`), `ui/dom.js` (`bindScopedKeys`), `ui/FloatingPanel.js` and `ui/UVCanvas.js`.
- Every computation that needs `geometry/` goes through `UvController` or `UvViewModel`, which are injected. `UVCanvas` receives precomputed island corners and wireframe UVs in `SectionUvData`. For hit-testing and drags it only maps between screen and UV, and passes UV points to the controller.

### 5.3 Public signatures

```js
// js/geometry/UvMapper.js  (pure; no THREE, no DOM)
/** @typedef {{a:number, b:number, cc:number, d:number}} UvLinear     // the 2×2 part of 6.3; offsets live in the transform
 *  @typedef {{offsetU:number, widthU:number, heightV:number}} AtlasRect
 *  @typedef {{sectionId, sectionIndex:number, transform: UvTransform|null, linear: UvLinear|null,
 *             W:number, H:number, sourceW:number, sourceH:number, rect: AtlasRect|null,
 *             panelUvs: 'section'|'panel', valid: boolean}} SectionUvPlan
 *  transform/linear null = untransformed base UVs (identity for this W×H, or LED-mask content);
 *  valid false = non-integer counts (fallback: base UVs). */
export function isLedMaskContent(content)                   // content === 'ledSim' || content === 'hdri'
export function cosSinDeg(deg)                              // exact [c, s] for multiples of 90°, else [Math.cos, Math.sin]
export function sourceSize(t, W, H)                         // [Ws, Hs] = t.sourceRotated ? [H, W] : [W, H]
export function uvLinear(t, W, H)                           // UvLinear (6.3); null iff t is null or t.isIdentityFor(W, H)
export function applyUv(t, W, H, u, v, out = [0, 0])        // identity short-circuit returns u, v untouched
export function invertUv(t, W, H, u, v, out = [0, 0])       // 6.3 inverse (Spec 05's bake calls exactly this signature)
export function placeInRect(rect, u, v, out = [0, 0])       // u' = rect.offsetU + u * rect.widthU ; v' = v * rect.heightV
export function sectionUv(plan, u, v, out = [0, 0])         // applyUv (iff plan.transform) then placeInRect (iff plan.rect)
export function islandCorners(t, W, H)                      // [BL, BR, TR, TL] = applyUv of (0,0) (1,0) (1,1) (0,1)
export function islandBounds(t, W, H)                       // {minU, minV, maxU, maxV}
/** One plan per layout section (index = sectionIndex), and the single-section variant used by the live path. */
export function planSectionUvs({ layout, atlas, settings, meshMode, applyTransforms })
export function planSectionUv(sl, sectionIndex, { atlas, settings, meshMode, applyTransforms })
export function presetFit(t, W, H)                          // 6.6
export function isFitResult(t, W, H)                        // 6.6: zero offsets, uniform scale equal to presetFit's (±1e-9)
export function presetPixelAccurate(t, W, H)                // 6.6
export function quarterTurn(t, dir, W, H)                   // dir ±1 (+1 = feed clockwise on the wall): θ ± 90, Source toggled iff W ≠ H (6.6)
export function pixelAccuracy(t, W, H)                      // {kind: 'exact'|'resampled', rotatedGrid, ratioU, ratioV, sourceW, sourceH, fills} (6.7)
export function dragTranslate(t0, W, H, uv0, uv1, { snap, axisLock })             // returns a new UvTransform; offsets clamped to [−8, 8]
export function dragScale(t0, W, H, handle, uvPointer, { uniform, snapPercent })  // handle 'bl'|'br'|'tr'|'tl'|'l'|'r'|'b'|'t'
export function dragRotate(t0, W, H, uv0, uv1, { snapDeg })

// js/geometry/PixelMap.js  (pure)
export function sectionCanvasSize(section)                  // {W: panelCols * ledX, H: panelRows * ledY}
export function baseUvToPixel(section, u, v)                // {px, pyTop, col, row, lx, lyTop} (6.9)
export function pixelCenterToBaseUv(section, px, pyTop)     // [(px + 0.5) / W, 1 - (pyTop + 0.5) / H]
export function panelBaseRect(section, col, row)            // {u0: col/cols, v0: row/rows, u1: (col+1)/cols, v1: (row+1)/rows}
export function atlasLedPixel(atlas, entry, section, px, pyTop)   // {gx: entry.ledOffsetX + px, gy: (atlas.totalLedY - H) + pyTop}  (LED px)
export function wallPointFromBaseUv(sl, u, v)               // {x, y, z} in the builder's vertex space, postTransform applied (6.10);
                                                            // callers never apply postTransform again
/** @returns {{sections: object[], atlas: object}} the per-section pixel_map objects and the top-level atlas object of 4.2 */
export function pixelMapJson(layout, atlas, { atlasFile = null } = {})
/** @returns {HitDescription} {sectionId, sectionIndex, name, label, col, row, lx, lyTop, px, pyTop, W, H, gx, gy,
 *           baseU, baseV, finalU, finalV, sourcePx: {x, y}|null} */
export function describeHit({ sl, startCol, atlas, entry, plan, baseU, baseV })
```

```js
// js/geometry/TextureBudget.js (07 X3; delivered early by 08 P2-12d, 07 C38): the one budget module
export const SECTION_TEXTURE_BUDGET_PX = 16777216            // 16 MP per rebuild (Q17), every mode that uses section canvases
export const MAX_CANVAS_SIDE = 4096                          // each canvas side ≤ min(maxTextureSize, 4096)
// (PANEL_TEXTURE_BUDGET_PX = 33,554,432 wall-wide applies only with uv.panel_uvs = 'panel', UV-9)

// js/geometry/TextureAtlas.js  (changed)
/** Viewport density of the section panel-ID canvases (6.4), from TextureBudget.SECTION_TEXTURE_BUDGET_PX and the side cap.
 *  Exports never use it. */
export function sectionTextureScale(sections, { budgetPx = SECTION_TEXTURE_BUDGET_PX, maxSide } = {})
  // -> {scales: number[] (px/LED, possibly fractional), reduced: boolean, pxPerLed: number | null}

// js/geometry/WallMeshBuilder.js  (changed)
sectionGrid(sl, { indexBase = 0, uv = null, normals } = {}, out)
  // uv: null | 'unit' | AtlasRect (08) | SectionUvPlan. Per vertex: u = col / panelCols, v = row / panelRows
  // (legacy association), then sectionUv(plan, u, v). Strip index generation unchanged.
sectionUvs(sl, plan)                                   // number[] (u, v)*(cols+1)*(rows+1): the SAME per-vertex code path
combinedGrid(layout, atlas, plans = null)              // profile.combinedUV: 'atlas-pixel-accurate' (08) | 'plan' (UV-7);
                                                       // legacy cases kept for LegacyProfiles (08 §5.1 rule 3).
                                                       // sectionRanges carry {vertexStart, vertexCount} (08 P2-7 owns them, 07 C52)
panelUvs(panel, sl, plan = null)                       // [[u,v] BL, BR, TR, TL]. 08 P2-12d: section space without a transform.
                                                       // plan.panelUvs 'panel' -> [0,0],[1,0],[1,1],[0,1];
                                                       // 'section' -> sectionUv(plan, (col + lu) / cols, (row + lv) / rows)

// js/render/LEDWallView.js  (changed)
rebuild({ layout, atlas, uvPlans, sectionScale, meshMode, display, uvSettings })
updateSectionUvs(sectionId, plan)    // in-place uv rewrite (6.12); returns false when not applicable (LED-mask content, legacy panel UVs)
resolveHit(intersection)             // -> {sectionId, sectionIndex, col, row, baseU, baseV, panelCorners3D: [{x,y,z} x4] (world)} | null (6.9);
                                     //    null for every userData.kind other than 'led-wall' (Spec 01's back shells are 'led-wall-back')
panelCornersWorld(sectionId, col, row)   // [{x,y,z} x4] world, as a loop, from the mesh's own position attribute + matrixWorld (6.9)
meshes()                             // front LED meshes only: the hover targets (never back shells)
pickMeshes()                         // Spec 01 T10's list (LED meshes and back shells; 07 C52); not used for hover
sectionNodes()                       // entries += vertexRange: {vertexStart, vertexCount} | null (from 08 P2-7's ranges; Spec 02 reads it too)

// js/render/LEDMaterialFactory.js  (changed)
combined(sections, atlas, combinedLayout, sectionScale)   // Material | Material[] (index = sectionIndex), 6.4 table
sectionShared(section, sectionIndex, startCol, scale)     // 08 P2-12d; gains the budgeted scale (6.4)
// js/render/textures/LEDPixelTextureFactory.js (changed)
tileCanvas(color)                            // the cached master tile's canvas (no texture clone) for the viewer's LED background
// js/render/ResourceTracker.js (01 T10, its one named owner, 07 C52; UV-7 relies on it)
disposeObject3D(root, {maps})                // de-duplicates geometries, materials (also inside Material[]) and maps by identity
```

```js
// js/app/UvViewModel.js
export class UvViewModel {
  /** @param {{project, builder: WallMeshBuilder, panelIds: PanelIdRenderer, ledTiles: LEDPixelTextureFactory,
   *           hdriBaker?: {hasHdri(): boolean, bakeSection(sectionId, w, h, plan): HTMLCanvasElement|null},
   *           prefs: {get(key), set(key, value)},     // app/Prefs.js (07 H3), else an in-memory object
   *           bus}} deps */
  constructor(deps)
  get open(); get sectionId(); get pinned(); get background(); get space(); get aspect()
  setOpen(on); setSection(id); setPinned(on); setBackground(kind); setSpace(space); setAspect(kind)  // state + emit UV_VIEWER_CHANGED
  /** Emits UV_DATA_CHANGED iff open. Computes the viewed section's DISPLAY plan itself (applyTransforms: true), so the
   *  viewer always shows the transform even when the viewport shows LED-mask content.
   *  backgroundDirty false keeps the cached background canvas (drags never re-render textures). */
  refresh({ layout, atlas }, { backgroundDirty = true, history } = {})   // history: {canUndo, canRedo, undoLabel, redoLabel}
  publishHover(source, description)          // emits UV_HOVER_CHANGED
}

// js/app/UvController.js
export class UvController {
  /** @param {{project, wallController: WallController, view: LEDWallView, viewModel: UvViewModel,
   *           probe: WallHoverProbe, bus,
   *           history: History (07 H1, Path A, recommended) | UvFallbackHistory (Path B fallback only),
   *           maxTextureSize: () => number,          // a getter: the renderer exists only after sceneManager.init()
   *           raf: (fn) => number}} deps             // coalesces viewer redraws to one per animation frame
   */
  constructor(deps)
  toggleViewer(); openViewer(sectionId = null); closeViewer(); viewSection(sectionId)
  setBackground(kind); setSpace(space); setAspect(kind); setPinned(on)
  /** SelectionManager observer (change table below). Follows iff payload.kind === 'section' && !pinned:
   *  viewSection(payload.primary.sectionId). kind null (deselect) leaves the viewer unchanged. */
  onSelectionChanged(payload)
  /** WallController rebuild observer (P1 step 8, including the bootstrap rebuild): caches {layout, atlas, plans};
   *  cancels an open field session or drag whose section vanished; moves the viewer to the nearest remaining section if
   *  needed; viewModel.refresh(...); emits UV_SETTINGS_CHANGED (from UV-14) with the atlas note values, reading
   *  maxTextureSize() here, never in the constructor. */
  onWallRebuilt({ layout, atlas, plans, sectionScale })
  /** WallController.commitRename observer (always, before the panel-ID branch): refreshes the section names in the
   *  viewer header, dropdown and readout without re-rendering the background. */
  onSectionRenamed()
  previewField(sectionId, field, raw)          // live, no history entry (3.3)
  commitField(sectionId, field, raw)           // -> stored value (for input write-back); history.record('UV <Field> (<name>)',
                                               //    {coalesceKey: 'uv:<id>:<field>'})
  cancelField(sectionId)                       // Escape in a field: revert to the session's before-state; no entry
  toggleFlip(sectionId, axis); turnFeed(sectionId, dir); setSourceRotated(sectionId, on)   // one entry each:
                                               //    'UV flip U (<name>)', 'UV turn feed (<name>)', 'UV source (<name>)'
  applyPreset(sectionId, name)                 // 'reset' | 'fit' | 'pixel'; one entry 'UV <Preset> (<name>)'
  copyToAll(sectionId)                         // one entry 'UV copy to all' (6.6)
  beginDrag(sectionId, handle, uv, modifiers); updateDrag(uv, modifiers)
  endDrag()                                    // one entry 'UV drag (<name>)' at the end; no transaction
  cancelDrag()                                 // restores the start transform; no entry
  undo(); redo()                               // end any field session or drag (cancel), then history.undo()/redo()
  setCombinedLayout(value); setPanelUvs(value); setGltfAtlasTexcoord1(on)   // one entry each, 'UV layout: <value>' etc.
  showPanelIds()                               // chip action: wallController.setContentMode('panelIds') (setPanelIds(true) before F5; 07 C49)
  onWallHover(intersection | null); onWallDoubleClick(intersection); probeUv(sectionId, u, v)   // probeUv(null) clears
}

// js/interaction/WallHoverProbe.js
export class WallHoverProbe {
  /** @param {{sceneManager, pointerRay: PointerRay, interaction: InteractionState, win,
   *           targets: () => Object3D[],                 // App passes () => wallView.meshes(): front LED meshes only
   *           onHover: (hit|null) => void, onDoubleClick: (hit) => void,
   *           doubleClick: boolean,                       // App passes !viewportInput.handlesDoubleClick
   *           sharedHover: {addHoverHitObserver(fn)} | null}} deps   // App passes selection once 02 T23's hoverAt bodies have landed
   *                                                                    // (07 I2's addHoverHitObserver, C37); null before
   */
  constructor(deps)
  /** sharedHover: registers one hover-hit observer and NO mousemove listener (zero own raycasts).
   *  Otherwise: canvas 'mousemove' (passive) + 'mouseleave', at most one raycast per rAF, skipped when e.buttons !== 0,
   *  interaction.isDraggingGizmo or interaction.isPilotMode. 'dblclick' only when deps.doubleClick. Registered after
   *  ViewportInput.attachPointer. */
  attach()
  setEnabled(on)  // off: no raycasts and deliveries ignored; emits onHover(null) once
}

// js/ui/FloatingPanel.js
export class FloatingPanel {
  /** @param {{doc, win, host: HTMLElement, id: string, title: string, prefs, prefsKey: string,
   *           defaults: {top, right, width, height}, min: {width, height}, resizeCorner: 'bottom-left'|'top-left'|'bottom-right',
   *           avoidElement?: () => HTMLElement|null}} deps     // the preview window element (3.1 auto-offset)
   */
  constructor(deps)            // R4: stores deps only
  /** Lazily creates the DOM (header, body, close, resize handle) and attaches its listeners: pointer handlers, window
   *  'resize', and one ResizeObserver on host and on avoidElement() (when win.ResizeObserver exists). Idempotent. */
  mount()
  get body(); get element()
  show(); hide(); get visible()
  reflow()            // re-applies the auto-offset while at the default position, then re-clamps size and position
  onClose(fn); onResize(fn)    // local callbacks (not bus events)
}

// js/ui/UVViewer.js
export class UVViewer {
  /** Owns #toggle-uv-viewer, #uv-viewer and every #uv-* id inside it.
   *  Subscribes UV_VIEWER_CHANGED, UV_DATA_CHANGED, UV_TRANSFORM_CHANGED, UV_HOVER_CHANGED (from UV-12),
   *  HISTORY_CHANGED and PROJECT_REPLACED (07; mirrors only).
   *  @param {{doc, win, uvController: UvController, viewportInput, bus, theme: {uv: UvViewerTheme}, prefs}} deps */
  constructor(deps)
  /** Path A: viewportInput.registerActions({'uv.toggleViewer': () => uvController.toggleViewer()}); toolbar button click;
   *  panel DOM created on first open, which also calls bindScopedKeys(panelEl, 'uv-viewer', actions, {actionTarget: canvasEl}).
   *  Path B: the panel keydown listener of 3.6 instead of bindScopedKeys. */
  bind()
}
// js/ui/UVCanvas.js
export class UVCanvas {
  constructor({ canvas, win, theme })
  setData(sectionUvData); setHover(description | null); setAspect('texture'|'square'); frame()
  hitTest(clientX, clientY)     // -> {handle: 'island'|'bl'|'br'|'tr'|'tl'|'l'|'r'|'b'|'t'|'rotate'|null, uv: [u, v]} (3.4)
  toUv(clientX, clientY)        // screen -> section UV (inverse of the view transform)
  draw()                        // 6.11 order
}
```

**Changes to existing modules**

| Module | Change |
|---|---|
| `interaction/SelectionManager.js` | **Observer hook: 07 I2's `addObserver(o)` and `addHoverHitObserver(fn)`** (07 C37; path A, recommended). Only in path B (fallback) does this spec add the same two methods on the Phase-1 manager. The manager calls a private `#notifyObservers(payload)`. `#notifyObservers` is called **exactly once at the single post-change point of every path that emits `SELECTION_CHANGED`**: after the `bus.emit(...)` and after `gizmo.attach/detach`.<ul><li>Phase 1: `select` and `deselect`.</li><li>07 v2 and Spec 02: `select` (all modes), `selectMany`, `deselect`, `pickAt` (through these), and `revalidate` (02's `prune`; only when it emits).</li></ul>Payload: `{primaryId, primary: Selectable \| null, kind: 'camera' \| 'prop' \| 'section' \| 'pivot' \| 'projector' \| null, ids: string[], origin}`.<ul><li>`primary = find(primaryId)` is the primary member's own Selectable, never the multi-selection group.</li><li>Phase 1: `kind` is the Selectable's kind, `ids = id ? [id] : []` and `origin = 'api'`.</li></ul>Observers are objects with `onSelectionChanged(payload)`. These are direct ordered calls (R2), not events. `App` registers `uvController`.<br>**Hover hit (Spec 02 present).** `addHoverHitObserver(fn)`: `hoverAt` passes its nearest raw wall intersection (or `null`) to these observers after its own resolution, and `clearHover` passes `null`. The intersection is passed even when the section is locked, because Spec 02 resolves a locked section's id to `null` but the readout still applies. **Use `kind === 'section'` and `primary.sectionId`** (Spec 02's `WallSectionSelectable`). |
| `interaction/ViewportInput.js` | Path A (recommended): no change (the `U` row is 07's; `UVViewer` registers the action). Path B (fallback only): the constructor gains `commands = {}`, and `attachShortcuts` adds the `'u'` branch of 3.6; UV-18 removes both. New getter `handlesDoubleClick`: `false` in the legacy routing, and `true` once Spec 02's `dblclick` routing lands. |
| `app/WallController.js` | Rebuild pipeline P1 (6.13). It gains `addRebuildObserver(o)`: step 8 calls `o.onWallRebuilt({layout, atlas, plans, sectionScale})`, and `commitRename()` calls `o.onSectionRenamed?.()` on every observer, always, before its panel-ID branch (rebuild-policy row 4 does not rebuild when panel IDs are off). It owns the atlas computation, moved from `LEDWallView` step 3 (pure, so there is no order effect), and the section-texture scale. |
| `app/ProjectSession.js` (07 D5) | Step 3 hydrates F4 state (4.2): section construction with `uvTransform`, and `project.uv.assign(...)`. No `resetHistory` call anywhere. |
| `app/ProjectIO.js` | Computes `plans = planSectionUvs({..., applyTransforms: true})` and passes `uvPlans` and the `uv` settings to both exporters. ZIP: glTF image URIs and MTL `map_Kd` per 7.1 and 7.3; the `pixel_map`/`atlas` blocks come from the serializer (`pixelMapJson`). |
| `io/ObjExporter.js`, `io/GltfExporter.js` | `write({sections, meshMode, layout, atlas, uvPlans, uvSettings, textures})`. `textures` is `null` for Export glTF and `{sectionFiles: (string\|null)[], atlasFile: string \| null}` for the two ZIPs (Export All, and Export OBJ's ZIP since 08 P2-6e, which ships every file it names). `null` marks a texture skipped by the canvas guard (section 7). |
| `io/ProjectSerializer.js`, `io/ProjectSchema.js`, `io/ProjectValidator.js` | The 4.2 rows (snake_case, full objects), `pixel_map` and `atlas` as derived keys, the revision bump, round-trip and reachability tests |
| `ui/WallDisplayPanel.js` | Owns `#uv-options`, `#uv-combined-layout`, `#uv-panel-mode`, `#uv-gltf-uv1`, `#uv-atlas-note`. Subscribes `UV_SETTINGS_CHANGED` (UV-14). |
| `ui/SectionListPanel.js` | Card template row `.section-uv-row`: the summary and a button calling `uvController.openViewer(section.id)`. Subscribes `UV_TRANSFORM_CHANGED` to patch `.section-uv-summary` in the matching card (`data-id`), from UV-14. It adds **no** integer-field attributes (B-L15 markup belongs to 08 P2-8a). |
| `render/PreviewWindow.js` | No change. The viewer's `FloatingPanel` observes the window element (`avoidElement`) with a `ResizeObserver`, so showing, hiding and resizing it need no new hook. |
| `render/MaterialOverride.js` (Spec 01) | Stashes `mesh.material` by reference so the combined `Material[]` is restored intact (2.3 row 01-1). |
| `theme/Theme.js` | `UvViewerTheme = {wire: '#f7f7f5', wireMinor: 'rgba(247, 247, 245, 0.35)', island: '#f7f7f5', handle: '#f7f7f5', handleActive: '#f2555a', outside: 'rgba(10, 10, 10, 0.6)', pixelGrid: 'rgba(247, 247, 245, 0.08)', crosshair: '#f2555a', checkerA: '#262626', checkerB: '#161616', halo: '#0a0a0a', font: "11px 'JetBrains Mono', monospace"}`, as `Theme.uv`: **06 §5.12's per-key values, the spec of record** (Feature 6 lands first, 07 §1.4). Each key lands with its `--uv-*` token (the halo is `--scene-overlay-halo`; the font a `FONT_BINDINGS` row), its `COLOR_BINDINGS` row and this fallback in the same commit, so 06's U6 and U10 tests pass. Wire, island and handle strokes are two-tone: a 2 px wider halo stroke under the light core (06 D15). The panel uses `--color-surface-overlay`. |
| `index.html` | `#toggle-uv-viewer`; the `#uv-options` block; the card row (template); two `<link>`s. No help-badge change (3.1, 07 C35). All of the visible markup lands in UV-14. UV-12 adds only the `<link>`s. |
| `app/App.js` | **Construct phase** (R4: these calls only store references; no listeners): `UvViewModel`; `WallHoverProbe` after `ViewportInput`, with `targets: () => wallView.meshes()`, `doubleClick: !viewportInput.handlesDoubleClick` and `sharedHover: selection` once 02 T23's `hoverAt` bodies have landed (else `null`; 07 C37); `UvController` after both and after 07's `history`, with `history` (Path A, recommended) or `new UvFallbackHistory(...)` (Path B fallback), `maxTextureSize: () => sceneManager.renderer.capabilities.maxTextureSize` and `raf: (fn) => win.requestAnimationFrame(fn)`; then immediately `selection.addObserver(uvController)` and `wallController.addRebuildObserver(uvController)`, **before** `sceneManager.init()` and the bootstrap `wallController.rebuild()`, so the first `onWallRebuilt` fills the atlas note; `UVViewer` with the other ui panels; `prefs` from 07 H3 or an in-memory object. **setupUI:** `uvViewer.bind()` after `toolbar.bind()`; `uvProbe.attach()` after `viewportInput.attachPointer()`. |

### 5.4 Events added (`core/EventBus.js`)

ARCHITECTURE §5.1 rule 7 requires a subscriber in the same change, so each event lands in the task that lands its first subscriber. `tests/static/check.mjs` checks this at every commit.

| Constant | Name | Payload | Emitted by (exact point) | Subscribers (mirror only, R3) | Introduced in |
|---|---|---|---|---|---|
| `UV_VIEWER_CHANGED` | `uv:viewerChanged` | `{open, sectionId, pinned, background, space, aspect}` | `UvViewModel.setOpen/setSection/setPinned/setBackground/setSpace/setAspect`, after the state write | `UVViewer` (show or hide, header, selects, toolbar `.active` and `aria-pressed`) | UV-12 |
| `UV_DATA_CHANGED` | `uv:dataChanged` | `{sectionId, data: SectionUvData \| null}` | `UvViewModel.refresh` (when open; at most once per animation frame during live edits) | `UVViewer` (canvas data, fields when not focused, chips, messages) | UV-12 |
| `UV_TRANSFORM_CHANGED` | `uv:transformChanged` | `{sectionId, transform: plain object, summary, source: 'preview'\|'field'\|'drag'\|'preset'\|'flip'\|'turn'\|'source'\|'copy', live: boolean}` | `UvController`, after each domain write by a UV use case (once per pointer move during drags; once per `input` while previewing). Undo and redo restore through `ProjectSession.apply`, whose rebuild refreshes every mirror. | `UVViewer` (numeric fields) from UV-12; `SectionListPanel` (card summary) from UV-14 | UV-12 |
| `UV_HOVER_CHANGED` | `uv:hoverChanged` | `{source: 'wall'\|'uv-canvas', hit: HitDescription \| null, panelCorners3D: [{x,y,z} x4] \| null}` | `UvViewModel.publishHover` (from `UvController.probeUv` from UV-12, and `onWallHover` from UV-15) | `UVViewer` (readout, crosshair) from UV-12; `UvHighlightView` (3D outline) from UV-15 | UV-12 |
| `UV_SETTINGS_CHANGED` | `uv:settingsChanged` | `{combinedLayout, panelUvs, gltfAtlasTexcoord1, atlas: {widthLed, heightLed, pngPxPerLed, pngWidth, pngHeight, overTexture: boolean, fitsCanvas: boolean}, sectionTextures: {reduced, pxPerLed}}` | `UvController.setCombinedLayout/setPanelUvs/setGltfAtlasTexcoord1` before the rebuild; `UvController.onWallRebuilt` (bootstrap, atlas size changes, open, undo) | `WallDisplayPanel` (select values, checkbox, note) | UV-14 |

Before UV-12 and UV-14, the corresponding emit calls do not exist yet; the use cases and the view model land in UV-11 without them.

**Visual or non-visual (07 C47).** Each event is classified in the `Events` catalogue in the commit that adds it: `UV_VIEWER_CHANGED` and `UV_DATA_CHANGED` are **non-visual** (they update the viewer DOM only, so 07's render-on-demand does not invalidate on them); `UV_TRANSFORM_CHANGED`, `UV_SETTINGS_CHANGED` and `UV_HOVER_CHANGED` are **visual** (`UV_TRANSFORM_CHANGED` invalidates the frame after a live UV write, `UV_HOVER_CHANGED` moves the 3D outline).

`SectionUvData` is a plain object:
```
{
  sectionId, sectionIndex, name, color, sections: [{id, name}],
  cols, rows, ledX, ledY, W, H, sourceW, sourceH, startCol, meshMode, combinedLayout, panelUvs, content,
  transform: {...},
  uvs: Float64Array,                 // section space, (cols+1)*(rows+1), row-major from row 0 = bottom
  perPanel: boolean,
  island: [[u, v] x 4],              // BL, BR, TR, TL
  bounds, atlasRect, accuracy, notices: string[],
  background: {kind, canvas: HTMLCanvasElement|null, led?: {tile: HTMLCanvasElement, ledsX, ledsY}},
  atlasView?: {canvas, rects: [{sectionId, offsetU, widthU, heightV}]},   // only for space 'atlas'
  history: {canUndo, canRedo, undoLabel, redoLabel}
}
```
`ARCHITECTURE.md` section 9 suggested that `UVViewer` subscribe to `SELECTION_CHANGED` and `WALL_REBUILT` directly. That is not possible under R3 plus the ui layering rule, because ui cannot compute UVs and subscribers cannot call controllers. This spec replaces it with the two observer hooks (`SelectionManager`, `WallController`) plus `UV_DATA_CHANGED`. Section 9 is amended in task UV-16.

### 5.5 Mesh-profile values and `LEGACY_SITES`

The `mesh.*` leaves live in `Strategies.mesh` until 08 P2-13g, then in `geometry/MeshProfiles.js`. Per 08 §5.1 rule 3, their legacy cases stay reachable through `LegacyProfiles` for the oracle tests.

| Leaf / site | Phase 1 | After Spec 08 | Feature 4 step | After Feature 4 |
|---|---|---|---|---|
| `mesh.viewport.combinedUV` | `'atlas-u-full-v'` (B-M5) | `'atlas-pixel-accurate'` (P2-7a) | UV-7 | **`'plan'`**: `combinedGrid` takes UVs from `planSectionUvs(project.uv, …)`, covering both layouts and the transforms. The `'atlas-pixel-accurate'` case stays: it equals `'plan'` with `atlas` and identity transforms (unit-tested). |
| `mesh.obj.combinedUV` | `'per-section-overlap'` (B-M6) | `'atlas-pixel-accurate'` (P2-7b) | UV-8a | `'plan'` |
| `mesh.gltf.combinedUV` | absent (no UVs) | **new leaf** `'atlas-pixel-accurate'` (P2-7c; 2.3 row 08-3) | UV-8b | `'plan'` |
| `mesh.gltf.attributes` | `['POSITION']` (B-M7) | `['POSITION','NORMAL','TEXCOORD_0']` (P2-2d, P2-7c) | – | unchanged. `TEXCOORD_1` is driven by `uv.gltf_atlas_texcoord1`, not by the profile. |
| `exportCombinedColor` | `'first-section'` (B-L6) | retired (P2-7d) | – | – |
| `combinedLedSimColor` | `'white'` (B-L18) | retired (P2-7e): white tile × `vertexColors` | UV-7 | The `per-section` layout uses P2-7e's material in every slot, with a per-slot repeat (6.4). No colour helper is added. |
| Panel-mode UVs | – | viewport section space (P2-12d) | UV-9 | A user setting (`uv.panel_uvs`), not a profile key; exports follow it |
| `LEGACY_SITES` `PanelIdRenderer.js#panelCanvas` and `TextureAtlas.js#panelPxPerLed` (B-L19, B-M16) | – | tags narrowed to "only with `panelUvs = 'panel'`" (P2-12d) | UV-9 | **Kept**, with the behaviour text "reachable only with `uv.panel_uvs = 'panel'`". The default path no longer reaches them. |

Feature 4 retires no other `LEGACY_SITES` rows; 08 deletes the ARCHITECTURE 8.2 rows for B-M5, B-M6, B-M7, B-L6 and B-L15. ARCHITECTURE 8.1's `mesh.viewport.combinedUV` "Fix" column (`'atlas-pixel-accurate' / 'per-section' (Feature 4)`) becomes `'plan'` in UV-7.

### 5.6 Render layers and ownership

- `UvHighlightView` registers its two-tone closed `THREE.Line` (halo and core; never `LineLoop`, 06 6.6) through `sceneManager.addHelper`, at `RENDER_ORDER.UV_HOVER_OUTLINE` (spec 01's registry; no literal ≥ 900), so it inherits the HELPERS layer when 07 R1 activates layers. Its vertices are **world coordinates** from `panelCorners3D` (6.9), so it is never parented to `wallGroup` and needs no knowledge of Spec 02 offsets or Spec 03's pivot.
  - It is excluded from `WallHoverProbe.targets()` (front LED meshes only) and from exports, which never read the scene.
  - It is disposed through `ResourceTracker`.
- The viewer allocates no WebGL resources.
- The combined mesh's `Material[]` is the single owner of its slot materials. `LEDWallView` is the only writer of wall `.material`; Spec 01's `MaterialOverride` swaps and restores the whole array (2.3 row 01-1). `disposeObject3D` de-duplicates array members and shared section materials.
- DOM ownership: listed in 3.3 and 5.3. The static check's DOM-id ownership table must add these entries.

---

## 6. Algorithms and math

### 6.1 Conventions

| Space | Origin | Axes | Notes |
|---|---|---|---|
| World / layout | First section's first bottom edge (legacy). Spec 03 bakes its pivot into the layout (03 D4). | metres, Y up, wall faces +Z | UVs do not depend on the pivot (Spec 03), section offsets (Spec 02), `angleOffset` or the B-L1 convention. |
| Section base UV `(u_b, v_b)` | Bottom-left of panel (col 0, row 0) | u along the column (walk) order, which is left to right seen from the section's front (+normal); v up | `u_b = col/cols`, `v_b = row/rows` at grid vertices. UVs follow the physical pixel order, so a reversed section (Spec 01) does not mirror them (Q13). |
| Section pixel canvas | Top-left | `px` right, `py` down; W = cols·ledX, H = rows·ledY | Panel (col, row) occupies `x ∈ [col·ledX, (col+1)·ledX)`, `y ∈ [(rows−1−row)·ledY, (rows−row)·ledY)`, as in legacy 2074 |
| Source pixels | Bottom-left (v up) | `X = (u'·Ws, v'·Hs)` with `[Ws, Hs] = sourceSize(t, W, H)` | The isotropic space in which rotation, scale handles and snapping operate (6.3, 6.8). LED content is pixel-mapped, so pixels (not metres) are the isotropic unit. **Assumption:** this is isotropic in metres only when the LED pitch is square (`panelW/ledX = panelH/ledY`). On a non-square pitch, quarter turns and flips stay pixel-exact, but a free-angle rotation looks sheared on the physical wall, as any pixel-mapped content does. |
| three viewport UV | bottom-left | v up | `CanvasTexture.flipY = true` (r128 default) |
| OBJ `vt` | bottom-left | v up | Written as-is |
| glTF `TEXCOORD_0` | **top-left** | t down | `t = 1 − v`. r128 GLTFLoader sets `texture.flipY = false` to match. |
| UV rotation | – | counter-clockwise **island** rotation in source-pixel space with v up, which is counter-clockwise on the viewer screen. The content seen on the wall turns the opposite way (6.3). | degrees |

### 6.2 Base UVs and the pixel contract

At grid vertex (col, row): `u_b = col / panelCols`, `v_b = row / panelRows`. These are the legacy expressions, so identity outputs stay bit-identical.

Every panel in a section has the same width and LED count, so `u_b` is both the arc-length fraction and the pixel fraction. Vertices lie exactly on panel boundaries, which are pixel boundaries.

Pixel centre `(px, pyTop)` maps to `u_b = (px + 0.5)/W` and `v_b = 1 − (pyTop + 0.5)/H`. With the identity transform, content authored at W×H (or any integer multiple, such as the ZIP textures at 1-4 px/LED) maps 1:1.

### 6.3 The UV transform

Inputs: the transform `t` and the section's pixel size W×H. Let:
- `θ = normalizeRotation(t.rotation)`;
- `[c, s] = cosSinDeg(θ)`, which is exact for multiples of 90°: `{0: [1,0], 90: [0,1], 180: [−1,0], −90: [0,−1]}`. This avoids `Math.cos(π/2) = 6.1e−17`;
- `fu = flipU ? −1 : 1`, `fv = flipV ? −1 : 1`, `su = scaleU`, `sv = scaleV`, `ou = offsetU`, `ov = offsetV`;
- `[Ws, Hs] = t.sourceRotated ? [H, W] : [W, H]`.

**Definition.** In section pixels `P = (u·W, v·H)` and source pixels `X = (u'·Ws, v'·Hs)`, the transform is
`X − X_c = R(θ) · diag(fu·su, fv·sv) · (P − P_c)`, with the centres `P_c = (W/2, H/2)` and `X_c = ((0.5 + ou)·Ws, (0.5 + ov)·Hs)`.

In UV terms:
```
kWW = W / Ws ;  kHW = H / Ws ;  kWH = W / Hs ;  kHH = H / Hs      // computed first; exactly 1 when the two sizes are equal
a  =  c·su·fu·kWW        b  = −s·sv·fv·kHW
cc =  s·su·fu·kWH        d  =  c·sv·fv·kHH
u' = a·(u − 0.5) + b·(v − 0.5) + 0.5 + ou          (evaluate in exactly this order)
v' = cc·(u − 0.5) + d·(v − 0.5) + 0.5 + ov
```

**Direction.** The transform maps wall pixels into the source, so it places the **island** (the wall's footprint in the source). A source feature with direction `d_s` appears on the wall with direction `R(−θ)·d_s`: positive θ turns the island counter-clockwise and the image on the wall clockwise. Likewise `ou > 0` moves the island right, so the wall's left edge samples further right in the source and the image slides left on the wall (3.7 hint).

**Properties** (all unit-tested):
- **The island is a rectangle.** In source pixels it is `W·su × H·sv`, rotated by θ, at every angle. The viewer's Texture view draws source pixels isotropically (6.11), so it shows a rectangle. This resolves the shear the earlier UV-space rotation produced: on the 160×96 default wall at 45°, its edges drew as (268.7, −161.2) and (−268.7, −161.2).
- **No shear with a uniform scale.** The map from wall pixels to source pixels is `R(θ)·diag(fu·su, fv·sv)`. With `su = sv` (the 🔗 lock, on by default), it is a similarity, so content is rotated and uniformly scaled, never sheared in pixels (6.1 states the pitch assumption). With `su ≠ sv`, content is stretched along the section's own axes, as with any non-uniform island scale.
- **Source pixels per LED** are exactly `su` along the section's u and `sv` along its v, at every angle (6.7).
- **Unchanged cases.** At θ = 0 with `sourceRotated = false`, the transform is `diag(fu·su, fv·sv)`, which is the same as before. At θ = ±90 with `sourceRotated = true`, or 0/180 with `false`, every `k` ratio that multiplies a non-zero `c` or `s` is `W/W` or `H/H`, which is exactly 1. The transform then equals the UV-space quarter turn `R(θ)·S·F`. So **a quarter turn of a matching source fills 0..1 exactly and is pixel-exact**. This is the processor-rotated feed case.
- **Square sections.** When W = H every `k` is exactly 1, so `sourceRotated` has no effect on the maths (6.6).
- **Mismatched orientation.** At θ = 90 with `sourceRotated = false` on a W ≠ H section, the island is the section rotated inside a W×H source. It does not fill 0..1 (it overhangs on one axis, flagged by the "Outside 0–1" chip). Content is not distorted. `Turn ⟳ 90` and `Pixel-accurate` choose the matching Source automatically (6.6).

**Identity short-circuit:** `if (t === null || t.isIdentityFor(W, H)) return [u, v]`. This is mandatory, because `0.5 + (u − 0.5)` is not bit-identical to `u` for every `u = col/cols`.

**Exact flips:** with θ = 0 and no source rotation, flipU at u = 0 gives `−1·(−0.5) + 0 + 0.5 = 1` exactly, and at u = 1 gives `0` exactly.

**Inverse:**
```
x  = (u' − 0.5 − ou)·Ws ;   y  = (v' − 0.5 − ov)·Hs          // source pixels from the island centre
qx =  c·x + s·y ;           qy = −s·x + c·y                   // R(−θ)
u  = qx / (fu·su·W) + 0.5 ; v  = qy / (fv·sv·H) + 0.5
```

**Spec 05 contract (HDRI bake).** 2.3 rows 05-1 to 05-4 ask Spec 05 to match it exactly.
- A baker writes an ordinary top-left-origin canvas. For pixel-exact bakes, its size is `plan.sourceW × plan.sourceH` (× its density k). The export bake uses k = 1. This differs from `cols·ledX × rows·ledY` only when `source_rotated` is set on a non-square section.
- Texel `(x, y)` sits at final UV `((x + 0.5)/Wt, 1 − (y + 0.5)/Ht)` in the three/OBJ convention. The glTF `t = 1 − v` is handled by the exporter, so the same PNG serves both formats.
- The baker undoes the atlas rect (atlas layout only). It then calls `invertUv(plan.transform, plan.W, plan.H, u', v', out)` to get `(u_b, v_b)` (identity when `plan.transform` is null), and finally `PixelMap.wallPointFromBaseUv(sl, u_b, v_b)`. That helper **already applies `sl.postTransform`** (6.10); the baker must not apply it again.
- If the base UV falls outside [0,1]², the texel is not covered by the section and is filled with the background.
- The combined bake follows `uv.combined_layout`: per-section textures in the `per-section` layout (one per material slot), the atlas in the `atlas` layout. Panel mode bakes section textures with `panel_uvs = 'section'` and none with `'panel'`.

### 6.4 Layout placement (`planSectionUvs`) and viewport materials

For each layout section `i`:
- `plan.valid = Number.isInteger(cols) && cols ≥ 1 && Number.isInteger(rows) && rows ≥ 1`;
- `plan.W, plan.H` = the section's pixel size;
- `[plan.sourceW, plan.sourceH] = sourceSize(t, W, H)`;
- `plan.transform = (applyTransforms && !t.isIdentityFor(W, H)) ? t : null`; `plan.linear = uvLinear(plan.transform, W, H)`.

| meshMode | Setting | `plan.transform` | `plan.rect` | Final UV at base `(u_b, v_b)` |
|---|---|---|---|---|
| `section` | – | `t` (null if identity or LED-mask content) | null | `T(u_b, v_b)` |
| `combined` | `per-section` | `t` / null | null | `T(u_b, v_b)`; geometry group `i`, material slot `i` |
| `combined` | `atlas` | `t` / null | `{offsetU: e.uvOffsetX, widthU: e.uvWidth, heightV: e.uvHeight}` | `(e.uvOffsetX + T_u·e.uvWidth, T_v·e.uvHeight)`. With identity it is exactly the 08 P2-7a output. |
| `panel` | `section` | `t` / null | null | Panel corner `(lu, lv) ∈ {0,1}²`: `T((col+lu)/cols, (row+lv)/rows)`. With identity it is exactly 08 P2-12d's viewport UVs. |
| `panel` | `panel` | null (transform not applied) | null | `(lu, lv)` (legacy) |

`e.uvHeight = (s.panelRows·s.ledY) / totalLedY` (08 P2-7a). The atlas is bottom-aligned with `flipY`, so section `i` occupies `v ∈ [0, uvHeight]` and `u ∈ [uvOffsetX, uvOffsetX + uvWidth]`. This exactly matches `atlasCanvas`'s `drawImage(…, ledOffsetX·scale, (totalLedY − H)·scale)`.

Worked example, the `mixed` config (totalLedX = 1312, totalLedY = 270; `panel-ids.png` at 3 px/LED = 3,936×810):

| Section | W×H (LED px) | uvOffsetX | uvWidth | uvHeight | atlas LED top-left |
|---|---|---|---|---|---|
| Main 500 | 320×192 | 0 | 0.24390244 | 0.71111111 | (0, 78) |
| Tall 600×337.5 | 288×270 | 0.24390244 | 0.21951220 | 1 | (320, 0) |
| Wide 1000×500 | 512×128 | 0.46341463 | 0.39024390 | 0.47407407 | (608, 142) |
| Small 250 | 192×192 | 0.85365854 | 0.14634146 | 0.71111111 | (1120, 78) |

**Viewport materials by content and layout** (`LEDMaterialFactory.combined`; `side` and `wireframe` as today in every row):

| Content | `atlas` | `per-section` |
|---|---|---|
| Panel IDs | One material; map = `panelIds.atlasCanvas(sections, atlas)` | `Material[]`; map `i` = `panelIds.sectionCanvas(section_i, i, scale_i, startCol_i)`, identical to Section mode (`scale_i` is `null` unless the budget reduced it) |
| LED sim | One `MeshBasicMaterial({map: white tile repeated (totalLedX, totalLedY), vertexColors: true})` (08 P2-7e) | `Material[]`; slot `i` is the same material with the white tile repeated `(cols_i·ledX_i, rows_i·ledY_i)`. There is no section-colour helper: the colour comes from the vertex colours, exactly as in P2-7e. For a single section the parameters equal the `atlas` material's (unit test), so single-section screenshots do not change. |
| HDRI (Spec 05, `hdri.available`) | One `hdri.create({tileRepeatX: totalLedX, tileRepeatY: totalLedY, …})` | `Material[]`; slot `i` = `hdri.create({tileRepeatX: cols_i·ledX_i, tileRepeatY: rows_i·ledY_i, …})`. All slots share one program (05 §6.13). |
| Colour | One `vertexColors` material | One `vertexColors` material. r128 ignores groups for a non-array material. |

`geometry.addGroup(indexStart_i, indexCount_i, i)` is always called on the viewport combined mesh (from UV-7 on). Panel mode with `section` UVs uses 08 P2-12d's `materials.sectionShared(section, i, startCol, scale_i)`: one material per section, shared by its panels, with each panel's UVs written into its `PlaneGeometry` `uv` attribute (6.12). The same three content rows apply to it with per-section repeats.

**Viewport budget for section textures** (`TextureAtlas.sectionTextureScale`, computed once per rebuild in P1 step 2b). It applies to every viewport path that uses section canvases (Section mode, Combined `per-section`, Panel `section`), so criterion 4 keeps holding. Exports (ZIP section textures and `panel-ids.png`) never use it.
```
base_i = clamp(floor(4096 / max(W_i, H_i)), 1, 4)                   // the legacy sectionCanvas density (2056)
if (Σ W_i·H_i·base_i² ≤ budgetPx) return {scales: base, reduced: false, pxPerLed: null}   // sectionCanvas gets overrideScale null
cap = floor(sqrt(budgetPx / Σ W_i·H_i))
if (cap ≥ 1) return {scales: base.map(b => min(b, cap)), reduced: true, pxPerLed: cap}
s = sqrt(budgetPx / Σ W_i·H_i)                                      // < 1 px/LED: fractional, viewport only
return {scales: base.map(() => s), reduced: true, pxPerLed: s}
```
With the 16 MP budget only `large_wall` among the harness configs is reduced: 4 sections of 1280×640 LEDs, base 3 px/LED (29.5 MP) → cap = floor(√(16,777,216 / 3,276,800)) = 2 → 13.1 MP (about 70 MB with mipmaps, against about 157 MB unbudgeted and 17.5 MB for the 1 px/LED atlas; R4). When `reduced`, the sidebar note shows "ⓘ Viewport section textures at {p} px/LED (16 MP budget)".

### 6.5 LED-mask content (LED simulation and the HDRI mask)

LED sim and Spec 05's HDRI LED mask visualise physical pixels, so their plans use `applyTransforms = false` (`isLedMaskContent(content)`):
- section, combined: base UVs, or atlas-placed base UVs;
- panel mode with `section` UVs: section-space base UVs and the section tile repeated `(cols·ledX, rows·ledY)` (08 P2-12d);
- panel mode with `panel` UVs: per-panel `(lu, lv)` with the legacy per-panel `repeat(ledX, ledY)`.

As a result, LED-mask screenshots never change with UV edits. Across the two `panel_uvs` settings they show the same LED grid, but texture filtering at panel seams may differ slightly (08 P2-12d lists `toggles/06_ledsim_panel` as `mayChange` for the same reason), so criterion 19 compares them with `pair-diff.mjs`. Spec 05's projection itself ignores UVs (05 §6.4); only its exports use the transform, through the bake (6.3).

### 6.6 Presets and quarter turns

- **Reset:** `UvTransform.identity()`.
- **Fit 0–1 (contain, undistorted):**
  - Keep θ, flipU, flipV and `sourceRotated`. Set `ou = ov = 0` and a uniform scale `su = sv = σ`.
  - Compute the linear part for `su = sv = 1`: `A1 = |a| + |b|` (bounding-box width in UV) and `B1 = |cc| + |d|` (height). Then `σ = clamp(1 / max(A1, B1), 0.01, 16)`.
  - The island's bounding box lies inside [0,1]² and touches both edges on at least one axis (±1e−9).
  - It is **exactly** [0,1]² when `A1 = B1`: θ a multiple of 90° with the matching Source (σ = 1), or a square section at θ ≡ 0 mod 90.
  - Example: 160×96 at 45° with Source 160×96 gives A1 = 1.1314, B1 = 1.8856, σ = 0.5303, and a bbox of 0.600 × 1.000.
  - An exact fill at 45° on a non-square section is impossible without distortion: the 45° bounding box of an undistorted rectangle is square in source pixels.
- **Pixel-accurate:**
  ```
  θ' = normalizeRotation(90·Math.round(θ/90)); quarter = ((θ'/90 % 4) + 4) % 4
  sourceRotated' = (W ≠ H) ? (quarter is odd) : t.sourceRotated     // the orientation whose island fills the source; don't-care if W = H
  [Ws, Hs] = sourceRotated' ? [H, W] : [W, H]
  su = sv = 1; ou = Math.round(ou·Ws)/Ws; ov = Math.round(ov·Hs)/Hs; flips kept
  ```
  With zero offsets, the island is exactly [0,1]² and 1 LED = 1 source pixel.
- **Turn the feed** (`quarterTurn(t, dir, W, H)`; `#uv-rot-cw` is dir +1, `#uv-rot-ccw` is −1; `]` and `[`): `θ' = normalizeRotation(θ + 90·dir)` and `sourceRotated' = (W ≠ H) ? !sourceRotated : sourceRotated`, with S, F and O kept. Dir +1 turns the image on the wall clockwise and the island counter-clockwise (6.3 Direction). From identity, ⟳ 90 gives θ = 90 and Source H×W: the transform equals the UV-space R90, which fills 0..1 and is exact. Pressing it again gives θ = 180, Source W×H, R180.
- **Square sections (W = H).** `sourceRotated` is don't-care: it has no effect on the maths (every `k` is 1), the Source control is hidden, `summaryFor` omits it, `isIdentityFor` ignores it, and no operation changes it. A stored `true` survives only from a file or from a section that was non-square when it was turned; it becomes meaningful again if the counts later make W ≠ H, which preserves the user's earlier intent.
- **Copy to all:** one compound history entry. For every other section k:
  - if `isFitResult(t, W, H)` (offsets 0 and `su = sv = presetFit(t, W, H).scaleU` within 1e−9), it writes `presetFit(copy, W_k, H_k)`, keeping θ, flips and Source, so each section fits its own aspect;
  - otherwise it writes `t.clone()`. Offsets, scales, flips and quarter turns with the matching Source mean the same on every section; a free-angle island scaled by hand may overhang on a section of a different aspect, which the "Outside 0–1" chip then shows.

### 6.7 Pixel-accuracy classification

```
[Ws, Hs] = sourceSize(t, W, H); q = θ / 90
ratioU = su ; ratioV = sv                         // source pixels per LED along the section's u and v (6.3)
rotatedGrid = !Number.isInteger(q)
cornersOnGrid = every island corner (u', v'): |u'·Ws − round(u'·Ws)| ≤ 1e−6 && |v'·Hs − round(v'·Hs)| ≤ 1e−6
kind  = (!rotatedGrid && |su − 1| ≤ 1e−9 && |sv − 1| ≤ 1e−9 && cornersOnGrid) ? 'exact' : 'resampled'
fills = islandBounds equals [0,1]² within 1e−9
```
Chips:
- `exact`: "● Pixel-accurate · source {Ws}×{Hs}".
- `resampled`, not a rotated grid: "▲ Resampled · 1 LED = {su} × {sv} source px". For example, `su = 0.5` gives "1 LED = 0.50 × 0.50 source px", which magnifies the content 2×.
- `rotatedGrid`: "▲ Resampled · rotated pixel grid ({θ}°)".
- "⚠ Outside 0–1" when the bounds leave [0,1]².

### 6.8 Drag maths (`UvMapper`)

`M_t(p) = O + C + L·(p − C)` in UV, with `O = (ou, ov)`, `C = (½, ½)` and `L` the linear part of 6.3. `toSrc(p) = (p.u·Ws, p.v·Hs)` maps UV to source pixels.
- Base corners: `c_BL = (0,0)`, `c_BR = (1,0)`, `c_TR = (1,1)`, `c_TL = (0,1)`.
- Edge midpoints: `l = (0, ½)`, `r = (1, ½)`, `b = (½, 0)`, `t = (½, 1)`.

- **Translate:**
  - `O' = O0 + (uv1 − uv0)`.
  - With `axisLock`, zero the component with the smaller screen magnitude over the first 4 px of movement.
  - With `snap`, `ou' = round(ou'·Ws)/Ws` and `ov' = round(ov'·Hs)/Hs`.
  - Clamp both to [−8, 8] (the validator's range, so a dragged value always round-trips).
- **Scale from handle k** (anchor j is the opposite corner or edge midpoint, `δ = c_k − c_j` in base UV):
  ```
  A_uv = M_t0(c_j);  A = toSrc(A_uv)                 // fixed point
  d = R(−θ)·(toSrc(uvPointer) − A)                   // pointer in the island-rotated frame, source pixels
  corner: su' = d.x / (fu·δ.x·W);  sv' = d.y / (fv·δ.y·H)
  edge l/r: su' as above, sv' = sv0 ;  edge b/t: sv' as above, su' = su0
  uniform (lock on, or Shift with the lock off): d0 = (su0·fu·δ.x·W, sv0·fv·δ.y·H) restricted to the moving axes;
           k = (d·d0)/(d0·d0); su' = k·su0, sv' = k·sv0
  clamp each to [0.01, 16] (never through zero: flips only via Flip); snap to 0.01 unless Alt
  O' = A_uv − C − L'·(c_j − C)                       // keeps the anchor fixed exactly (L' = linear part with su', sv')
  ```
- **Rotate** about the island centre:
  - `P = toSrc(O0 + C)`, `a = toSrc(uv0) − P`, `b = toSrc(uv1) − P`.
  - `Δθ = atan2(a.x·b.y − a.y·b.x, a·b)·180/π`. This is measured in source pixels, so the knob responds the same in every direction, even on a 50:1 section.
  - `θ' = normalizeRotation(θ0 + Δθ)`, snapped to 15° (Shift: 90°, Alt: free).
  - `O` and `sourceRotated` are unchanged, because the centre is invariant.

### 6.9 Hover: from intersection to pixel

`LEDWallView.resolveHit(hit)`:
```
mesh = hit.object; tag = mesh.userData
if (tag.kind !== 'led-wall') return null          // includes Spec 01's back shells (kind 'led-wall-back')
strip modes (combined, section):
  p = mesh.worldToLocal(hit.point.clone()); {a, b, c} = hit.face
  A, B, Cv = positions a, b, c (Vector3.fromBufferAttribute); w = THREE.Triangle.getBarycoord(p, A, B, Cv, new Vector3())
  combined: range = sectionRangeForFace(sectionRanges, hit.faceIndex)     // 08 P2-7's binary search in WallMeshBuilder.js
            vertexBase = range.vertexStart                                // (its one named owner, 07 C52)
  section:  vertexBase = 0
  for idx in (a, b, c): local = idx − vertexBase; col = local % (cols+1); row = (local − col)/(cols+1);
            uv_idx = (col/cols, row/rows)
  baseU = clamp01(w.x·u_a + w.y·u_b + w.z·u_c); baseV likewise
panel mode (one PlaneGeometry(panelW, panelH) per panel; tag.col, tag.row within the section):
  p = mesh.worldToLocal(hit.point.clone()); {width: pw, height: ph} = mesh.geometry.parameters
  lu = clamp01(p.x / pw + 0.5); if (tag.uMirrored) lu = 1 − lu; lv = clamp01(p.y / ph + 0.5)
  baseU = (tag.col + lu) / cols; baseV = (tag.row + lv) / rows
(col, row) = baseUvToPixel(...).col/.row
panelCorners3D = panelCornersWorld(sectionId, col, row)
```
- Barycentric coordinates are affine-invariant, so the strip branch recovers base UVs independently of the transform, the content mode, Spec 01's winding and Spec 02 offsets. `THREE.Triangle.getBarycoord` is a static method in r128 core.
- The panel branch uses the plane's local frame, so it is independent of the `uv` attribute that 08 P2-12d and UV-9 rewrite. `uMirrored` (2.3 row 01-3) is set by `LEDWallView` where Spec 01 flips a reversed section's panel plane so that local +x runs against the column order; it is absent (false) otherwise.
- `panelCornersWorld` reads the panel quad from the **mesh's own position attribute** and applies `mesh.localToWorld`:
  - strip modes: vertices `vertexBase + row·(cols+1) + col`, `+1`, `+(cols+2)` and `+(cols+1)`, as a loop;
  - panel mode: the PlaneGeometry vertices 0, 1, 3, 2 (TL, TR, BR, BL in local order), as a loop.
- Positions are already post-transformed by the builder or by Spec 02's section groups, and pivot-baked (Spec 03), so the outline lands on the rendered wall in every case, also during Spec 02's transform-only path.

`PixelMap.baseUvToPixel(section, u, v)`:
```
px = min(W−1, floor(u·W)); pyTop = min(H−1, floor((1−v)·H))
col = floor(px / ledX); rowFromTop = floor(pyTop / ledY); row = rows − 1 − rowFromTop
lx = px − col·ledX; lyTop = pyTop − rowFromTop·ledY
label = columnLabel(startCol + col) + (row + 1)      // PanelNaming, as E-7
```
`describeHit` adds:
- `gx, gy` (`atlasLedPixel`, LED px);
- `finalU, finalV = sectionUv(plan, baseU, baseV)` (the export plan, `applyTransforms: true`);
- `sourcePx`: the sampled source pixel `(floor(T_u·Ws), floor((1 − T_v)·Hs))` when T lies in [0,1), else null.

**Pixel boundaries.** The default wall's exact centre (u = 0.5, v = 0.5) lies on a pixel boundary (px 80 vs 79, LED 16 vs 15). Unit tests therefore use pixel centres: `pixelCenterToBaseUv(section, 80, 48)` gives **C2**, LED `16,16` and px `80,48`. A screen-space hover asserts only the panel label: the centre lies inside C2, because panel C spans u ∈ [0.4, 0.6] and row 2 spans v ∈ [1/3, 2/3].

### 6.10 Wall point from a base UV

```
cf = u·cols; k = min(cols − 1, floor(cf + 1e−12)); f = cf − k     // 1e−12 guards (k/cols)·cols < k in float64
x = sl.edges[k].x + f·(sl.edges[k+1].x − sl.edges[k].x)
z = sl.edges[k].z + f·(sl.edges[k+1].z − sl.edges[k].z)
y = v·rows·sl.panelH
if (sl.postTransform) [x, y, z] = transformPoint(sl.postTransform, [x, y, z])     // Spec 02's pure geometry helper
```
- The result is in the builder's vertex space: layout space with the section offset applied, and Spec 03's pivot already baked into `edges`.
- It equals the rendered vertex position, because `wallGroup` has an identity transform (03 D4).
- **It applies `postTransform` itself. Callers never apply it again** (2.3 row 05-2).
- Consumers: the Spec 05 bake (6.3) and the unit tests. The hover outline uses `panelCornersWorld` instead (6.9).

### 6.11 Viewer drawing (`UVCanvas`)

**View transform:**
- `unitW = zoom·fitW`.
- `unitH = aspect === 'square' ? unitW : unitW·(Hs/Ws)`. Texture view draws source pixels isotropically. `auto` picks `square` when `max(Ws/Hs, Hs/Ws) > 8`.
- `screen(u, v) = (panX + u·unitW, panY + (1 − v)·unitH)`.
- The backing store is `css × min(devicePixelRatio, 2)`.
- `data-island` is refreshed after every draw.

**Draw order:**
1. Clear to `theme.uv.checkerB`.
2. Background in the 0–1 rect, stretched to it whatever its own pixel size:
   - panel IDs or HDRI: `drawImage(bg, screen(0,1), unitW, unitH)`, with `imageSmoothingEnabled = unitW/Ws < 4`;
   - LED: `createPattern(tileCanvas)` with `setTransform` scaling one 64 px tile to `unitW/W`. Below 3 px per LED, a flat `section.color` fill and the chip "ⓘ Zoom in to see LEDs";
   - checker: 8×8 squares with labels A–H and 1–8.
3. Dim outside [0,1]² with `theme.uv.outside`.
4. Pixel grid when `unitW/Ws ≥ 6`.
5. Wireframe: `cols+1` column polylines and `rows+1` row polylines through `uvs`. The transform is affine, so each is a straight segment. Optional triangle diagonals bl–tr (the diagonal is the same for both windings).
6. Island outline, the enabled handles (3.4) and the rotate knob.
7. Hover crosshair and highlighted panel.
8. Drag tooltip.

**Background budget:**
- `s0 = clamp(floor(4096/max(W,H)), 1, 4)` (the legacy default) and `s = min(s0, sqrt(4e6/(W·H)))`, so the background canvas is at most 4 MP for every section size. There is no lower floor: a 25,600 × 10,240 LED section (reachable with 07 D1's 65,536 LED cap) gets s ≈ 0.124, a 3,162 × 1,265 px canvas.
- `sectionCanvas(section, i, s, startCol)` takes `s` as `overrideScale` (fractional values are fine; legacy multiplies by it). "ⓘ Preview downscaled" appears whenever `s < s0`.
- If `!canvasFits(round(W·s), round(H·s))` (08 P2-1c; iOS Safari's lower area limit), the checker background is shown instead, with the same chip.
- The canvas is cached per (sectionId, kind) until a rebuild or a rename.
- The LED background uses `ledTiles.tileCanvas(color)`, with no texture clone.

### 6.12 Live in-place UV updates

During drags and field previews there is no full rebuild, and the layout and atlas are reused from the last `onWallRebuilt` (UV edits change neither):
```
UvController.#applyLive(section, t, source):
  section.setUvTransform(t)
  i = section's index in #cache.layout
  plan = planSectionUv(#cache.layout.sections[i], i, {atlas: #cache.atlas, settings: project.uv, meshMode,
                                                      applyTransforms: !isLedMaskContent(display.content)})
  #cache.plans[i] = plan
  view.updateSectionUvs(section.id, plan)                 // every update; false (no-op) for LED-mask content and 'panel' UVs
  bus.emit(UV_TRANSFORM_CHANGED, {..., live: true})        // every update (cheap DOM mirrors; from UV-12)
  #scheduleRefresh()                                       // viewModel.refresh(#cache, {backgroundDirty: false}) at most once
                                                           // per animation frame (deps.raf); the canvas redraw is coalesced
```
How `LEDWallView.updateSectionUvs` writes the new values:
- **Section mode:** `attr.array.set(builder.sectionUvs(sl, plan)); attr.needsUpdate = true`.
- **Combined mode:**
  ```
  attr.array.set(uvs, vertexStart*2)
  attr.updateRange.offset = vertexStart*2; attr.updateRange.count = uvs.length
  attr.needsUpdate = true
  ```
  `BufferAttribute.updateRange` is core in r128 and is reset after upload.
- **Panel mode with `section` UVs:** for each panel mesh, `builder.panelUvs()` returns BL, BR, TR, TL. Write them into PlaneGeometry order TL, TR, BL, BR, which is indices `[3, 2, 0, 1]` of the builder's array (08 §6.15 uses the same mapping).
- **No-op** (returns `false`) when the content is LED-mask content or `panel_uvs = 'panel'`.

No texture, material or geometry is created during a drag, and `WallController.rebuild` is not called. Unit tests with spies and a fake THREE verify this (8.1). `renderer.info.memory.textures` is a manual devtools check. With 07 R3 (render on demand), the `UV_TRANSFORM_CHANGED` emit invalidates the frame (5.4).

### 6.13 Rebuild pipeline P1 (amended)

```
1. layout = layoutProject(project)
2. atlas = computeAtlas(layout.sections.map(sl => sl.section))
2b. sectionScale = sectionTextureScale(layout.sections.map(sl => sl.section))                      // 6.4 (UV-7)
3. uvPlans = planSectionUvs({layout, atlas, settings: project.uv, meshMode,
                             applyTransforms: !isLedMaskContent(display.content)})                 // ledSim and hdri: base UVs
4. view.rebuild({layout, atlas, uvPlans, sectionScale, meshMode, display, uvSettings: project.uv})
5. publishStats(); 6. orbit step (legacy updateCameraPosition, or 07's orbit.onWallRebuilt); 7. if (camera.enabled) hub.refresh()
8. for (o of #rebuildObservers) o.onWallRebuilt({layout, atlas, plans: uvPlans, sectionScale})   // UvController: cache,
                                                                                                 // fix the viewed section, refresh
9. emit WALL_REBUILT {layout, meshMode, view}
```

### 6.14 Precision

- Float32 UVs: the spacing near 1.0 is 1.2e−7, which is under 0.001 texel for W ≤ 8,192.
- OBJ `toFixed(6)`: 1e−6 is under 0.033 texel for atlases up to the 32,767 px canvas limit. The legacy precision is kept.
- glTF: `t = 1 − v` is computed in float64 and stored as Float32.
- A `k` ratio of 6.3 whose numerator equals its denominator is exactly 1 (IEEE division of equal finite numbers). In quarter turns of a matching source, and at θ = 0 without source rotation, only such ratios multiply the non-zero `c`/`s` terms, so these cases stay bit-exact.
- JSON: every stored number is a float64 that `JSON.stringify` and `JSON.parse` round-trip exactly, so 07's fidelity rule holds without rounding.

---

## 7. Export impact

The rows below describe the state after this spec. The 08 commits that come first are named where they matter. `ATLAS` below means `'textures/' + brand.files.panelIdsPng` (`textures/panel-ids.png` until 06 T6b, then `textures/morph-led-wall-panel-ids.png`).

### 7.1 OBJ and MTL

| Mode | Change |
|---|---|
| Section | `vt` = `sectionUvs(sl, plan)`, formatted `vt ${u.toFixed(6)} ${v.toFixed(6)}`. Identity output is byte-identical to legacy. Faces are unchanged. |
| Combined | Structure from 08 P2-7d: one `o LED_Wall_Combined`, then all `v`, all `vt`, all `vn` (08 P2-2c), then for each section `usemtl Wall_<i+1>` followed by its faces. UV-8a changes only the `vt` values: `per-section` gives transformed 0..1 per section; `atlas` gives atlas-placed values, identical to 08 P2-7b for identity. |
| Panel (`section` UVs) | Per panel, 4 `vt` lines from `panelUvs` (BL, BR, TR, TL, matching the corner order), replacing the literal `vt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\n` (UV-9). With `panel` UVs the literal is kept. |
| MTL, Export OBJ's ZIP | Amended by the owner's decision of 2026-10-17 (08 P2-6e; it was "standalone, **no `map_Kd`** in any mode", 08 P2-6c): Export OBJ downloads one ZIP holding the OBJ, the MTL and every file the MTL references, so its MTL follows the ZIP rules of the next row and the archive ships each referenced file at the referenced path. |
| MTL, ZIP | `map_Kd` per section material, referencing only files present in the ZIP:<ul><li>Section mode, combined `per-section`, and panel `section`: `textures/<textureFileNames(sections)[i]>` (08 P2-6).</li><li>Combined `atlas`: `ATLAS` for every section (as 08 P2-7f writes in Phase 2).</li><li>Panel with `panel` UVs: none (per-panel 0..1 cannot use a section texture).</li><li>A texture skipped by the canvas guard: no `map_Kd` for that material.</li></ul> |

### 7.2 Importer notes

These are documented in the README export section.
- **Blender:** `usemtl` creates material slots, and `vt` becomes "UVMap".
- **Unreal:** one static mesh with N material slots, using UV channel 0.
- **disguise / nDisplay mesh projection:** use Section mode, or Combined + Atlas, because overlapping per-section islands in one object repeat the feed.

### 7.3 glTF

- The attribute list follows `mesh.gltf.attributes`, and accessors are created in that order: `POSITION`, `NORMAL` (08 P2-2d), then `TEXCOORD_0` (08 P2-7c).
- `TEXCOORD_0` is VEC2 FLOAT (5126) in its own bufferView (target 34962), padded to 4 bytes, with `count = POSITION.count`. Each value is `(u, 1 − v)`.
- **Combined (D9, 08 P2-7d):** one mesh `LED_Wall_Combined` and one node, with N primitives.
  - Each primitive has **its own** `POSITION`, `NORMAL`, `TEXCOORD_0` and index accessors (index base 0), and its own material `Wall_<i+1>_Material`.
  - With the UI limits a primitive holds at most 51×21 = 1,071 vertices, so B-L5 cannot happen in combined mode. `'auto'` is kept for unvalidated input.
  - `TEXCOORD_0` comes from `mesh.gltf.combinedUV`: `'atlas-pixel-accurate'` from P2-7c, then `'plan'` from UV-8b.
- **Panel:** `TEXCOORD_0` comes from `panelUvs` (UV-9).
- **`gltf_atlas_texcoord1`:** for combined `per-section` only, write `TEXCOORD_1` with the atlas UVs (`t = 1 − v`). No material references it. It is off by default, because Unreal's default lightmap UV generation targets channel 1.
- **Materials:**
  - Standalone: `baseColorFactor` = section colour, untextured.
  - ZIP (from UV-8b; Phase 2 writes no glTF `images`):
    - `images: [{uri: <file>}]`, one entry per distinct file referenced (the 7.1 MTL rules apply to glTF too, including `ATLAS` for the `atlas` layout);
    - one `samplers` entry `{magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071}`;
    - `textures`;
    - `pbrMetallicRoughness.baseColorTexture: {index}` with `baseColorFactor: [1, 1, 1, 1]`, because glTF multiplies the factor into the texture;
    - `extensions: {KHR_materials_unlit: {}}` on **each** textured material, and `KHR_materials_unlit` in the top-level `extensionsUsed` (not `extensionsRequired`), as Spec 05 §7.2 does. The Khronos validator reports an extension listed in `extensionsUsed` but used by no material, so both are written together (Q9).
- **Dependencies:** B-H3 (chunked base64, 08 P2-1a) must land first, because the buffers grow by about 8 bytes per vertex.

### 7.4 JSON

The v2 keys are in 4.2. Every variant comes from 07's single serializer (B-M3 fixed by 08 P2-6a, then 07 D4). The ZIP variant adds `atlas.texture_file` when the atlas PNG was written. Section texture files stay in 07's v1 key `sections[].texture_file`.

### 7.5 ZIP

- Per-section `textures/<name>_PanelIDs.png` as today, with unique names (08 P2-6). The textures are untransformed, because the UVs carry the transform. They use the legacy density, never the viewport budget.
- `ATLAS` (the atlas canvas) **always** ships when `canvasFits` passes (08 P2-7f, 08 Q5). Otherwise it is skipped and reported (08 P2-1, M-EXP-4).
- The MTL and glTF reference it only when the UVs are atlas-placed (7.1), and reference exactly the files present.
- **Export OBJ's ZIP** (08 P2-6e, the owner's decision): `Brand.files.objZip` holds the OBJ, the MTL and exactly the files that MTL references (section textures, and `ATLAS` when the combined layout references it), under the same names and guards as Export All.

### 7.6 PNG (`Brand.files.panelIdsPng`)

Unchanged. Its layout is the definition of the `atlas` UV layout, and acceptance criterion 3 checks it. Its density is `atlas.png_px_per_led`.

### 7.7 Safe-distance OBJ

Unaffected.

---

## 8. Testing

### 8.1 Unit tests (`node --test "tests/unit/**/*.test.mjs"`)

| File | Covers |
|---|---|
| `tests/unit/uv-mapper.test.mjs` | <ul><li>Identity short-circuit: `Object.is` equality with `col/cols` over fuzzed counts; `isIdentityFor(W, W)` ignores `sourceRotated`.</li><li>`applyUv`/`invertUv` round trip (≤1e−12) over 10,000 random transforms and sizes, including `sourceRotated`.</li><li>**Rectangle invariant:** for random θ, W, H, su, sv and flips, the island's source-pixel edges are orthogonal (abs(dot) ≤ 1e−9 · ‖e1‖·‖e2‖).</li><li>**No shear:** with `su = sv`, the wall-to-source map is a similarity (equal column norms, orthogonal columns).</li><li>**Direction:** θ = +90 maps a source up-vector to a wall right-vector (content turns clockwise); `ou = +0.25` makes u = 0 sample u' = 0.25.</li><li>The 45° on 160×96 example of 6.3 gives a rectangle.</li><li>`cosSinDeg` is exact at multiples of 90.</li><li>With `sourceRotated` matching the quarter parity, `uvLinear` equals `R(θ)·S·F` with `Object.is` on every entry.</li><li>Flip corners are exactly 0 and 1.</li><li>`quarterTurn` from identity fills [0,1]² exactly, two turns give R180, and on W = H it leaves `sourceRotated` unchanged.</li><li>`presetFit`: the bounds lie in [0,1]² and touch on one axis (±1e−9) for θ ∈ [−180, 180]; exactly [0,1]² at quarter turns with the matching Source; the 45° example gives 0.600 × 1.000.</li><li>`isFitResult` and Copy to all: a Fit at 45° on 160×96 copied to a 64×64 section is re-fitted there (bounds touch [0,1]²); a hand-scaled transform is copied verbatim.</li><li>`presetPixelAccurate` and `pixelAccuracy` across W=H, W≠H, mismatched Source, fractional offsets and rotated grids; `ratioU = su`.</li><li>`dragScale` keeps the anchor fixed (≤1e−12) for every handle, with and without flips, rotation or `sourceRotated`.</li><li>`dragRotate` keeps the centre, and is isotropic: equal screen arcs give equal Δθ on a 50:1 section.</li><li>`dragTranslate` snaps to `1/Ws` and clamps to [−8, 8].</li><li>`planSectionUvs` for every mode and setting row of 6.4, and `applyTransforms` false for `ledSim` and `hdri`; `planSectionUv` equals the matching element of `planSectionUvs`; `'atlas-pixel-accurate'` equals `'plan'` with atlas and identity.</li></ul> |
| `tests/unit/texture-atlas.test.mjs` (extended) | `sectionTextureScale`: unchanged (`reduced: false`) for `default`, `flat3`, `concave_offsets`, `convex`, `mixed`, `box_corner`; `large_wall` gives 2 px/LED and 13,107,200 px; a 25,600×10,240 section gives a fractional scale with the total ≤ 16,777,216. |
| `tests/unit/pixel-map.test.mjs` | <ul><li>Pixel-centre round trip.</li><li>Labels continue across sections (startCol), as E-7.</li><li>`atlasLedPixel` equals the `atlasCanvas` placement for `mixed`.</li><li>`pixelMapJson(mixed)` equals the 4.2 numbers (1312×270 LED, 3 px/LED, 3936×810; Main 500 at (0, 78), 4 px/LED, 1280×768), with snake_case keys in the 4.2 order.</li><li>`wallPointFromBaseUv` at `u = k/cols` equals `edges[k]` within **1e−12**, for every `cols` in 1..50 (49 is the case where `(1/49)·49 = 0.9999999999999999`).</li><li>`wallPointFromBaseUv` applies `postTransform` exactly once (Spec 02 E2/E3 vectors).</li><li>`describeHit` at the pixel centre `(80, 48)` of the default wall gives C2, LED (16,16) and px (80,48).</li></ul> |
| `tests/unit/geometry.test.mjs` (extended) | <ul><li>`sectionUvs` equals the `uv` output of `sectionGrid`.</li><li>`panelUvs` in `section` mode matches the strip UVs at shared corners bit for bit, and equals 08 P2-12d's output for identity.</li><li>`combinedGrid` `vertexStart`/`vertexCount` (shared with 08 and Spec 02).</li><li>`'plan'` with identity reproduces `'atlas-pixel-accurate'` (atlas) and `'unit'` per section (per-section) with `Object.is`.</li></ul> |
| `tests/unit/io.test.mjs` (extended) | <ul><li>OBJ: combined per-section `vt` equals per-section `sectionUvs`; the `vt` count equals the `v` count, and face refs are unchanged.</li><li>OBJ: atlas `vt` equals the viewport-profile builder output (`toFixed(6)`).</li><li>MTL: both ZIPs (Export All, and Export OBJ's ZIP since 08 P2-6e, 7.1 and 7.5) write `map_Kd` per the 7.1 rules and hold every file it names, including skipped textures and the `ATLAS` name built from `Brand.files.panelIdsPng`.</li><li>glTF: `TEXCOORD_0` accessor shape, `t = 1 − v`; one combined primitive per section with **its own** accessors and indices < its vertex count.</li><li>glTF: optional `TEXCOORD_1`; every textured material carries `KHR_materials_unlit`, and `extensionsUsed` lists it iff some material does.</li><li>ZIP: every image URI and `map_Kd` names a written file.</li><li>Serializer: v2 round trip of `uv` and every `sections[].uv_transform` (`deepStrictEqual`); defaults written as full objects; `pixel_map` and `atlas` written in `file`/`zip`/`autosave`, omitted in `history`, ignored on read; the `version` minor bumped once; fidelity (`strip(validate(file).project)` equals `strip(file)`, no issues) and a reachability property case for each 4.2 row.</li><li>Migration: a v1 file gives identity transforms and default settings with only the `migrated` info; an older v2 revision without F4 keys gives defaults silently.</li><li>Validator: `offset_u: 99` → 8 (`clamped`), `scale_u: 0` → 1 (`defaulted`), `scale_u: -0.5` → 0.5 with `flip_u` toggled (`coerced`), `rotation_degrees: 270` → −90 (`wrapped`), `flip_u: "yes"` → false (`defaulted`), `uv_transform: null` → identity (`defaulted`), a `mode` key inside `uv` → `dropped-unknown`.</li></ul> |
| `tests/unit/uv-controller.test.mjs` | With spies and a fake 07 `history` (`record`, `undo`, `redo`, labels): <ul><li>A drag performs no `wallController.rebuild()` call, one `view.updateSectionUvs` per update, and exactly one `history.record('UV drag (<name>)')` at `endDrag` (no `begin`/`commit`); `cancelDrag` restores the start transform and records nothing.</li><li>`previewField` ×5 then `commitField` records once with `coalesceKey 'uv:<id>:<field>'`; `cancelField` records nothing.</li><li>Flip, turn, Source, each preset, Copy to all and each settings change record exactly once.</li><li>`undo`/`redo` cancel an open drag or field session, then call `history.undo`/`redo`.</li><li>N live updates within one animation frame give one `viewModel.refresh` (fake `raf`).</li><li>Selection observer: follows `kind === 'section'` (primary) unless pinned, and ignores `kind: null` and other kinds.</li><li>`onWallRebuilt` moves the viewer to the nearest section after a delete or an undo that removes the viewed one; `onSectionRenamed` refreshes names without `backgroundDirty`.</li><li>Construction reads no renderer: `maxTextureSize` is called only inside `onWallRebuilt`.</li><li>Settings changes rebuild iff the active mesh mode is affected.</li></ul>Path B only (deleted in UV-18): `UvFallbackHistory` undo/redo with `equals`, and pruning of entries whose section was deleted, with a compound copy-to-all entry keeping its other sections. |
| `tests/unit/wall-hover-probe.test.mjs` (new) | Fake rAF queue, a fake `PointerRay` counting `intersect` calls, and a fake `InteractionState`. Disabled: 0 raycasts. Enabled: N mousemoves within one frame give 1 raycast. Skipped when `buttons !== 0`, during a gizmo drag and in pilot mode. `setEnabled(false)` emits `onHover(null)` once. Shared mode (fake `addHoverHitObserver`): 0 own raycasts, hits forwarded only while enabled. `doubleClick: false` registers no `dblclick` listener. The raycast targets are `targets()` only. |
| `tests/unit/selection-observer.test.mjs` (new; fake bus and gizmo) | The observer is called exactly once per emitted `SELECTION_CHANGED`, after `gizmo.attach/detach`, on every path: Phase-1 `select` and `deselect`; with 07 v2 or Spec 02, `selectMany`, `revalidate`/`prune` (only when it emits) and `pickAt`. The payload carries the primary's own Selectable. |
| `tests/unit/led-wall-view-uv.test.mjs` (new; render layer) | Installs a fake THREE as `globalThis.window.THREE` **before** a dynamic `import()` of `LEDWallView`/`LEDMaterialFactory`. The fake's constructors (`CanvasTexture`, `Mesh*Material`, `BufferGeometry`, `PlaneGeometry`, …) count instances. Fake `PanelIdRenderer`, `LEDPixelTextureFactory` and a fake `hdri.create` are used. Asserts: <ul><li>textures created per rebuild are N for combined `per-section`, 1 for `atlas`, N for panel `section`, and P for panel `panel` (criterion 20);</li><li>**one-section `per-section` LED-sim and HDRI material parameters equal the `atlas` ones** (map repeat, `vertexColors`, colour, side, wireframe);</li><li>multi-section `per-section` LED and HDRI slots get repeats `(cols_i·ledX_i, rows_i·ledY_i)`;</li><li>`sectionCanvas` receives `overrideScale` `null` unless the budget reduced it;</li><li>`updateSectionUvs` creates no texture, material or geometry (criterion 12);</li><li>`addGroup` is called N times on the combined mesh;</li><li>`resolveHit` returns `null` for a `led-wall-back` hit; the panel branch honours `uMirrored`;</li><li>`disposeObject3D` disposes each `Material[]` member and each shared section material once.</li></ul> |
| `tests/unit/floating-panel.test.mjs` (new) | Fake `ResizeObserver` and DOM rects: auto-offset shrinks the default rectangle above the preview window, stops after a user move, and re-clamps on host or window resize; `mount()` is idempotent and the constructor attaches nothing. |
| `tests/unit/keymap.test.mjs` (07, extended) | The `U` row and the `uv-viewer` scope rows are unique and have registered actions once UV-12 lands; `bindScopedKeys` with `actionTarget` dispatches only for the canvas and stops propagation per 3.6. |
| `tests/static/check.mjs` (rules updated) | The new modules' layering; DOM-id ownership of the new ids; **each new event emitted and subscribed in the commit that introduces it** (UV-12: four events; UV-14: `UV_SETTINGS_CHANGED`); the `'plan'` cases referenced; the B-L19/B-M16 site text; no literal `panel-ids.png` token in `js/` (06 R-B3b); 07 rule S5, with the Path B listener as a declared exception until UV-18. `css-slices.mjs` keeps ignoring `css/features/`. |

### 8.2 Harness scenarios to add (`tests/regression/scenarios-features.mjs`, shared with Spec 03; DOM-only)

| Scenario | Steps | Outputs |
|---|---|---|
| `uv_layouts` | Import `mixed`. In combined mode, for each layout (`#uv-combined-layout` = `per-section`, then `atlas`): panel IDs on, screenshot, Export OBJ, Export glTF, Export ZIP. Then Section mode with panel IDs: screenshot (criterion 4 pairs it with the per-section shot through `tools/pair-diff.mjs`). Then panel mode with `#uv-panel-mode` = `section`, then `panel`: screenshot, OBJ, glTF; LED sim on, screenshot for each setting (criterion 19 pairs them). | about 22 |
| `uv_transforms` | Import a new v2 `CONFIGS.uv_transforms` in the 07 §4.2 shape at the revision UV-5c introduced: 3 sections with `flip_u`, a feed turn (`rotation_degrees: 90, source_rotated: true`) and `offset_u 0.25 / scale_u 0.5 / scale_v 0.5`. Exports in all three modes, panel-ID screenshots, LED-sim screenshots, then a JSON round trip (re-import and re-export, which must be identical). Then LED sim on the same wall with the transforms reset through the UI: screenshot (criterion 19 pairs the two LED-sim shots). | about 18 |
| `uv_viewer` | Default wall. Press U and record the visibility and text of `#uv-viewer`; screenshot `#uv-viewer-canvas`. Set `#uv-offset-u` = 0.1 (value + `input` + `change`), click `#uv-flip-u`, drag the BR handle (coordinates from `data-island`) by (−40, 0) px, then record `.section-uv-summary`, the fields and the `#uv-undo` title, and export OBJ. Focus the canvas, press Ctrl+Z three times, export OBJ again (it must equal the pre-edit export), then press Escape. Typing checks with real key events: type `0.1` into `#uv-offset-u` (the summary shows Offset 0.1000, with no Reset); press U while focused there (no toggle); hold W while the canvas is focused (no orbit, so the canvas screenshot is unchanged). **Pilot guard:** close the viewer, enable `#toggle-camera-preview`, press P, press U and record that `#uv-viewer` stays hidden, press P to exit pilot, then disable the preview. | about 16 |
| `uv_hover` | Default wall, reset view, U. Hover the centre of `#three-canvas`: the reset view looks at the orbit target, which for this flat wall is the wall centre (u = v = 0.5, inside C2; 6.9). Record `#uv-readout`. **Only `Panel C2` and the section name are asserted**, because the centre lies on a pixel boundary. Without Spec 02: double-click the second section of `flat3`, then record `#uv-viewer-section`. | about 4 |
| `uv_select` (only with Spec 02) | `flat3` and U. Click section 2: `#uv-viewer-section` follows. Shift-click section 1: the viewer follows the new primary. Pin, click section 3: no change. Unpin and delete the viewed section: the viewer shows the nearest one. Double-click section 1: one selection change, framing happens, and the viewer follows. Rename section 1 with panel IDs off: the viewer header and dropdown show the new name. | about 9 |

`tests/regression/tools/pair-diff.mjs` runs after the capture: `node tests/regression/tools/pair-diff.mjs <out>/uv_layouts per_section.screenshot.png section_mode.screenshot.png --shot-threshold 8 --shot-max-percent 0.5`, and likewise for the two `uv_transforms` LED-sim shots and the two `uv_layouts` panel LED-sim shots.

### 8.3 Intentional golden changes and re-baseline steps

**Procedure:** Spec 08 §8.1, unchanged.
- A full candidate run (never `--only`), then `compare.mjs --expect tests/regression/expected/<step>.json`. The `--expect` option comes from 08 P2-0.
- Human review, then promotion, then a self-consistency run, then the commit.
- A step whose manifest is empty is an invariance step: any diff is a bug.
- Screenshot reviews may use Spec 01's optional `compare.mjs --diff-bbox`, or `tools/pair-diff.mjs`, to confirm that each diff lies in the declared region.

**Abbreviations** (08 §8.5):
- **CFG7** = `default, flat3, concave_offsets, convex, mixed, box_corner, large_wall`. **MULTI5** = CFG7 minus `default` and `convex`. `OBJ(s,m)`, `MTL(s,m)`, `GLTF(s,m)` and `ZIP(s)` as in 08.
- **SNAP** = every output that embeds `sectionsSnapshot()` (which records each card's `text`, inputs with `min`/`max`/`step`, and `buttons` with classes):
  - `CFG7 × s/sections_initial.json` (7);
  - `ui_sections/ui_00_* … ui_15_*` (16);
  - `import_edge/{i_empty_state, i_after_add, ii_strings_state, iv_after_import, iv_after_delete, v_after_import, v_after_add, vi_before, vi_after, vii_after, viii_after}` (11);
  - 08's `p2_xss_names/sections_*` and the `p2_zero_inputs` state;
  - any later feature scenario that records `sectionsSnapshot()` (for example Spec 02's `section_select`).
- **SHOTS** = every `*.screenshot.png` of every scenario. `screenshotCanvas()` uses `Page.captureScreenshot` clipped to `#three-canvas`, so it **includes the DOM overlays** (toolbar column, info badge, selection badge, preview window), as Specs 01 and 06 note.
- **ZIPS** = `CFG7 × ZIP(s)`, `logos/*__export-zip`, `p2_zip_section_mode`, `p2_xss_names` and `p2_oversize_canvas` ZIP outputs.
- **JSONS** = every JSON export:
  - `CFG7 × {initial,final,roundtrip}__export-json`;
  - the ZIP JSON entries;
  - `box_corner/zipjson_roundtrip__export-json`;
  - `ui_sections/{edited,final}__export-json`;
  - `import_edge/*__export-json`;
  - `name_with_panel_ids` JSON;
  - the `p2_*` JSON exports.

The Phase 2 UV steps (08 P2-7a–f, P2-8a, P2-12d) have their own manifests in 08; 2.3 lists the confirmations requested there. The Feature 4 steps:

| Step | `expect` (changes) | `mayChange` | Must NOT change |
|---|---|---|---|
| UV-5a (domain only) | none (invariance) | – | everything |
| UV-5c (persistence; one revision bump) | JSONS: `version` moves to the next `"2.<n>"`; every section gains `uv_transform` (identity) and `pixel_map`; the top level gains `uv` (defaults) and `atlas`; the ZIP JSON's `atlas` gains `texture_file` when the atlas was written | – | every geometry export, PNG, screenshot and state file |
| UV-6 (pure geometry and plans) | none (invariance: `'atlas-pixel-accurate'` stays active) | – | everything |
| UV-7 (viewport `per-section` default; `combinedUV = 'plan'`; section-texture budget) | `{mixed, box_corner, large_wall}/panel_ids_combined.screenshot.png` (section textures at 4 or 3 px/LED replace the atlas at 3 or 1 px/LED; `large_wall` at the budgeted 2 px/LED); the `p2_mixed_content` panel-ID screenshot | `{flat3, concave_offsets}/panel_ids_combined.screenshot.png` (same 4 px/LED density; only seam filtering may differ); the two `p2_mixed_content` LED-sim screenshots (same LED grid, per-slot tile repeat); Spec 05's HDRI screenshots of multi-section combined walls, if Spec 05 has landed (same LED-mask grid per slot) | Single-section screenshots (`default`, `convex`, `toggles/*` including the LED-sim shots `toggles/03_*` and `toggles/04_*`, `keyboard/*`, `camera/*`, `logos`, the extras: one slot equals the atlas material, unit-tested); every Section- and Panel-mode screenshot (no harness wall in those modes exceeds the budget); every export |
| UV-8a (OBJ consumer; `mesh.obj.combinedUV = 'plan'`; ZIP `map_Kd`) | `MULTI5 × OBJ(s, combined)` and the `.obj` entry of `MULTI5 × ZIP(s)` (`vt` returns to per-section 0..1; see the round-trip note); `ui_sections/edited__export-obj__led-wall-config.obj`; the `.mtl` entry of `CFG7 × ZIP(s)` and of `logos/*__export-zip` (`map_Kd` changes from `ATLAS` (08 P2-7f) to the per-section files); since 08 P2-6e also the `.mtl` entry and `textures/` of every combined `*__export-obj__*.zip` (Export OBJ's ZIP follows the ZIP rules of 7.1 and ships the per-section files it then names, so `ProjectIO`'s Export OBJ texture plan covers combined mode too) | `p2_oversize_canvas` ZIP `.mtl` (expected identical: both files are skipped) | The MTL entries of section- and panel-mode Export OBJ ZIPs; single-section combined OBJ (`default`, `convex`, `import_edge` combined: identity per-section equals atlas); section- and panel-mode OBJ; every glTF; section-mode ZIP MTLs (`p2_zip_section_mode`, `p2_xss_names`) |
| UV-8b (glTF consumer; `mesh.gltf.combinedUV = 'plan'`; ZIP textures; optional `TEXCOORD_1`) | `MULTI5 × GLTF(s, combined)` (`TEXCOORD_0` per-section); the `.gltf` entry of every ZIPS member except `p2_oversize_canvas` (images, sampler, textures, `baseColorTexture`, `KHR_materials_unlit`) | `p2_oversize_canvas` ZIP `.gltf` (no texture present, expected identical) | Standalone glTF of single-section walls and every section- and panel-mode standalone glTF; OBJ; MTL |
| UV-9 (panel exports in section space; `panel_uvs` option) | `CFG7 × OBJ(s, panel)` (`vt`); `CFG7 × GLTF(s, panel)` (`TEXCOORD_0`); `import_edge/ii_panel__export-{obj,gltf}*` | `import_edge/iii_weird__export-{obj,gltf}*` (depends on how the validator maps the unknown mode) | Every screenshot: the panel-mode viewport is already section-space since 08 P2-12d (`toggles/09_panelids_panel`, `toggles/06_ledsim_panel` unchanged); every MTL (Export All's and the Export OBJ ZIP entries, 08 P2-6e); combined and section exports; ZIPS (exported in combined mode) |
| UV-10, UV-11, UV-12, UV-13, UV-15, UV-17, UV-18 | none. The viewer DOM is created lazily on first open, no existing scenario presses U, the `<link>`s added in UV-12 style only new selectors, and no card, toolbar or sidebar markup is added before UV-14. If a harness scenario snapshots 07's shortcut-help dialog, UV-12 declares its new `U` and `uv-viewer` lines. | – | everything (an undeclared `ui_visual` styles diff here means a selector leaked) |
| UV-14 (all visible markup: toolbar button, card row, sidebar UV block; no help-badge token, 07 C35) | SNAP (each card's `text` gains "UV Mapping Identity Edit UVs…" and `buttons` gains `.section-uv-btn`); `ui_visual` (every `styles.json`, because rects below the Mesh Options card shift; `text.json`; sidebar, page and `narrow_800` screenshots); SHOTS, **in the toolbar-column region only** (the `rects` field of the `--expect` entries, measured by 01 T2's `measure-rects`, 07 C57) | – | Every export, PNG and JSON; the help badge; 3D pixels outside the toolbar-column region |
| UV-16 | The new scenarios get their first baseline (two self-consistency runs must match) | – | – |

**Round-trip note (UV-8a, and UV-7 for the viewport).**
- 08 P2-7b changes the MULTI5 combined OBJ `vt` from the legacy per-section overlap to atlas UVs. UV-8a changes them back to per-section 0..1, which for identity transforms is **byte-identical to the legacy `vt` lines**.
- The same files are therefore re-baselined twice and end where they started. The viewport follows the same pattern (08 P2-7a, then UV-7).
- This is planned. Phase 2 ships on its own, and the atlas OBJ is correct together with the ZIP atlas (P2-7f). Feature 4 may land much later.
- If the owner schedules Feature 4 immediately after Phase 2, 08 may skip P2-7b. B-M6 is then resolved by P2-7d's per-section `usemtl` plus UV-8a's per-section `map_Kd`. In that case UV-8a's OBJ `expect` list shrinks to the ZIP `.mtl` entries (Q14).

Manual checks (not automatable):
- Import the `mixed` and `uv_transforms` exports into Blender 4.x and into three's GLTFLoader (the three.js editor), and confirm the panel IDs read correctly.
- Validate the glTF with the Khronos glTF-Validator (online), with 0 errors and 0 unused-extension warnings.
- Have the owner check one Section-mode and one Combined + Atlas export in their Unreal and disguise pipeline (Q12).
- Devtools: `renderer.info.memory.textures` stays constant during a 5 s handle drag (criterion 12), and equals the section count plus non-wall textures in panel mode (criterion 20).
- Devtools on `large_wall`, Combined with panel IDs: the estimated texture memory (07's `?perf=1` HUD, or `renderer.info`) stays under about 90 MB for the wall textures (criterion 24).
- Devtools Performance panel: opening the viewer on a 50×20 section draws within 100 ms (criterion 11).

---

## 9. Acceptance criteria

Each criterion names its gate: **U** = unit test, **H** = harness scenario or manifest, **P** = `tools/pair-diff.mjs`, **M** = manual check.

1. With default settings, every section of a Combined, Section or Panel (`section` UVs) mesh has UVs whose minimum is exactly 0 and maximum exactly 1 in u and v. This holds in the viewport attribute, the OBJ `vt` and the glTF `TEXCOORD_0` (`t = 1 − v`). (U: builder over fuzzed walls. H: the `uv_layouts` exports parsed per section.)
2. With an identity transform, Section-mode OBJ `vt` lines are byte-identical to the pre-feature output in every harness scenario. (H: UV-5a to UV-9 manifests.)
3. In the `atlas` layout:
   - section i's UVs span `u ∈ [uvOffsetX_i, uvOffsetX_i + uvWidth_i]` and `v ∈ [0, rows_i·ledY_i/totalLedY]`;
   - multiplied by the `panel-ids.png` size, the rect equals that section's `drawImage` placement within 1e−6 px;
   - the output equals the 08 P2-7 atlas output for identity transforms.

   (U.)
4. The Combined `per-section` viewport with panel IDs on matches the Section-mode screenshot of the same wall within `--shot-threshold 8` and at most 0.5 % of pixels. (P: `uv_layouts` pair.)
5. For Combined `atlas`, OBJ `vt` equals the viewport `uv` attribute to `toFixed(6)`. (U.)
6. Every glTF primitive has `TEXCOORD_0` (VEC2, FLOAT, `count === POSITION.count`). Combined primitives have their own accessors, with every index below their vertex count. The Khronos validator reports 0 errors for the `default` and `mixed` exports in all modes. (U; M for the validator.)
7. Combined exports have one material per section with that section's colour (MTL `Kd`, and glTF `baseColorFactor` when untextured). The ZIP's per-section layout references per-section textures. (U, H.)
8. **Pixel units.** The readout's atlas coordinates are labelled "atlas LED", and the `pixel_map`/`atlas` blocks for `mixed` equal the 4.2 numbers. Multiplying `atlas_x_led`/`atlas_y_led` by `png_px_per_led` gives the section's top-left pixel in `panel-ids.png`. (U, H.)
9. Flip U on section k changes its exported u to `1 − u` (within 1e−6) and leaves other sections unchanged. Flipping again restores byte-identical exports. (U, H: `uv_transforms`.)
10. **Rotation and presets.**
    - For any θ and size, the island is a rectangle in source pixels, and with the lock on the content is never sheared in pixels (U).
    - Turn ⟳ 90 from identity on a non-square section gives an island of exactly [0,1]², turns the image on the wall clockwise, and shows the chip "● Pixel-accurate · source H×W" (U, H).
    - Fit 0–1 leaves the bounds inside [0,1]², touching on one axis (±1e−9), and exactly [0,1]² at quarter turns with the matching Source (U).
    - Pixel-accurate yields scale 1, a multiple of 90°, the matching Source, aligned corners and the "Pixel-accurate" chip (U).
    - On a square section no control changes `sourceRotated`, and the summary never shows "Source rotated" (U).
11. **Opening the viewer.**
    - U toggles the viewer. U does nothing while focus is in an INPUT, SELECT or TEXTAREA, with Ctrl, Meta or Alt held, on key repeat, or in pilot mode. (H: `uv_viewer`, including its pilot step; U: the `KEYMAP` row flags.)
    - The toolbar button and "Edit UVs…" also open it. (H.)
    - The canvas shows the section's texture and wireframe within 100 ms for a 50×20 section. (M.)
12. **During a drag:**
    - `WallController.rebuild` is not called (U: spy);
    - no texture, material or geometry is created (U: fake THREE; M: `renderer.info.memory.textures`);
    - the viewport, the numeric fields and the card summary update on every pointer move, and the viewer canvas redraws at most once per animation frame (H: summary after the drag; U: one `UV_TRANSFORM_CHANGED` per update, one refresh per frame);
    - Escape cancels and restores the exact previous transform (U, H).
13. **History** (07 H1 under the recommended order; only in the Path B fallback, the temporary stack until UV-18).
    - UV edits are recorded in 07's global History: one entry per committed field edit (an `input` series ending in `change`, coalesce key `uv:<id>:<field>`), one per drag (recorded at its end), one per flip, turn, Source or preset click, one for Copy to all.
    - Undo and redo restore transforms exactly (`UvTransform.equals`) through `ProjectSession.apply`.
    - The viewer's ↶/↷ and its Ctrl/⌘+Z call `history.undo()`/`redo()`; their state and titles mirror `HISTORY_CHANGED`.

    (U; H: `uv_viewer`'s three Ctrl+Z restore the pre-edit export.)
14. **Keyboard scoping** (the `uv-viewer` scope through `bindScopedKeys`; Path B: the panel listener).
    - With the viewer canvas focused, W, A, S, D, Q, E and the arrow keys do not move the orbit camera, and G, R, L, P and the sibling-spec single keys do not fire.
    - Typing `0.1` into `#uv-offset-u` never triggers Reset, and Ctrl+Z inside a field performs the field's own undo.
    - Ctrl/⌘+S and Ctrl/⌘+O still work with focus in the panel.
    - After focus leaves, no key remains stuck.

    (H: `uv_viewer`; U: `keymap.test.mjs`.)
15. Hovering the centre of `#three-canvas` in the reset view of the default wall shows `Panel C2` in `#uv-readout` (H). The pixel centre (80, 48) gives `LED 16,16/32×32` and `px 80,48/160×96` (U).
16. **Raycasts.** Without Spec 02: none while the viewer is closed, and at most one per animation frame while it is open, against the front LED meshes only. With Spec 02: the probe performs zero raycasts of its own. (U: `wall-hover-probe.test.mjs`.)
17. **JSON v2.** The round trip preserves `uv` and every `sections[].uv_transform` exactly, written as full snake_case objects in 07's key order. `pixel_map` and `atlas` are written in the `file`, `zip` and `autosave` variants, omitted in `history`, and ignored on read. 07's fidelity rule holds with no issues. A v1 import yields identity transforms and default settings. Invalid values are corrected with 07 issue codes shown in the import report. (U, H: `uv_transforms`.)
18. **ZIP references.**
    - Every MTL `map_Kd` and glTF `images[].uri` refers to a file present in the ZIP.
    - The atlas entry is `textures/` + `Brand.files.panelIdsPng`. It is present whenever it fits the canvas limits, and is referenced only in the `atlas` layout (after UV-8a/8b).

    (U, H.)
19. LED-sim screenshots are identical with and without a non-identity transform, and within `pair-diff.mjs` tolerance across both `panel_uvs` settings. (P: `uv_transforms` and `uv_layouts` pairs; H: the UV-9 manifest keeps `toggles/06_ledsim_panel` unchanged.)
20. **Panel mode with the default `section` UVs:**
    - section logos show (H: `uv_layouts` panel screenshot, reviewed);
    - the number of panel-ID textures equals the number of sections, not panels (U: fake THREE; M: devtools). 08 P2-12d resolves B-M16 and B-L19 for the viewport; UV-9 makes the exports match;
    - panel A1's UV rect is `[0, 1/cols] × [0, 1/rows]` in the viewport, OBJ and glTF (U).
21. **Spec 02 integration** (when present):
    - the viewer follows the primary selected section unless pinned;
    - `selectMany` and `revalidate`/`prune` notify the observer exactly once;
    - a double-click on the wall produces one selection change and Spec 02's framing, with no second handler.

    (U: `selection-observer.test.mjs`; H: `uv_select`.)
22. **The hover outline sits on the rendered panel** for sections with a Spec 02 offset and with a Spec 03 pivot change: `panelCornersWorld` equals the mesh vertices × `matrixWorld`. `wallPointFromBaseUv` applies `postTransform` exactly once. (U.)
23. The unit, static and golden-master gates pass with every manifest of 8.3. The `mesh.*.combinedUV` leaves read `'plan'`, and the B-L19/B-M16 `LEGACY_SITES` text reads "reachable only with `uv.panel_uvs = 'panel'`".
24. **Viewport texture budget.** The section panel-ID textures of one rebuild total at most 16,777,216 px; `large_wall` uses 2 px/LED and shows the sidebar note; no other harness config is reduced; exports keep the legacy density. (U: `texture-atlas.test.mjs`; H: UV-7 manifest; M: memory check.)
25. **Spec 01 integration** (when present): hits on back shells give no readout; the debug shading on a `per-section` combined wall restores the `Material[]` intact when turned off; each shared material is disposed once. (U.)
26. **Bootstrap and renames.** The sidebar atlas note is filled after the bootstrap rebuild (no empty note on first load); constructing `UvController` reads no renderer; renaming a section with panel IDs off updates the viewer header, dropdown and readout. (U; H: `uv_select` rename step.)

---

## 10. Task breakdown

Effort scale: S is at most 0.5 d, M is 1-2 d, L is 3-5 d, XL is more than 5 d.

**Prerequisites owned elsewhere (not counted here):** the gates of 2.3. Hard: 08 P2-1a, P2-6, P2-7a–f, P2-12d, and B-H5 disposal (Phase 1C H1 or 08 P2-12a); 07 D4/D5 for UV-5c. **Path A is the recommended order** (07 C58): 07 I1 lands before UV-12 and H1 before UV-13, so no Path B scaffolding (`UvFallbackHistory`, the `'u'` branch, UV-18) is built. 07 I2 (observer hooks) for UV-11/UV-17 and 02 T23 (shared hover hit) for UV-17.

| Id | Task | Effort | Depends on |
|---|---|---|---|
| (UV-0) | **Withdrawn.** The "Requested change" columns of 2.3 are applied by 07's consolidated D0 (docs only, counted in spec 07; 07 C58), before 08 P2-7 is implemented and before Spec 05 T13. | – | – |
| UV-5a | Domain: `UvTransform` (with `sourceRotated`, `isIdentityFor`, `summaryFor`) and `UvSettings` (with `assign`), `WallSection.uvTransform`, `Project.uv`; unit tests. Invariance step. No Phase-2 dependency. | M (1 d) | Phase 1 |
| UV-5c | Persistence: `ProjectSchema` rows (4.2), validator rules (the same `RULES`), the `ProjectSession.apply` step-3 hydration, writer (full objects), `pixel_map` and `atlas` via `pixelMapJson`, one revision bump; round-trip, fidelity, reachability and migration tests; re-baseline JSONS. (The previous draft's UV-5b is merged here: one bump, one JSONS step.) | M (1.5 d) | UV-5a, UV-6 (`PixelMap`); 07 D4, D5 |
| UV-6 | `geometry/UvMapper.js` (source-pixel maths, presets, quarter turns, Fit detection, accuracy, drags) and `geometry/PixelMap.js`; builder `SectionUvPlan`, `sectionUvs`, `panelUvs(…, plan)`, `combinedGrid(plans)` with the `'plan'` case and vertex ranges; unit tests. Invariance step. | M (2 d) | UV-5a; 08 P2-7a–c |
| UV-7 | Viewport `per-section` combined: `LEDMaterialFactory.combined(…, layout, sectionScale)` material arrays (Panel IDs, P2-7e's LED material per slot, the Spec 05 HDRI branch when present), LED-mask base UVs, `addGroup`, `TextureAtlas.sectionTextureScale` reading `geometry/TextureBudget.js` (`SECTION_TEXTURE_BUDGET_PX`, the 4096 side cap; 07 C38) and its use in all section-canvas paths, 01 T10's `ResourceTracker` de-duplication (consumed), P1 amendment (6.13); flip `mesh.viewport.combinedUV` to `'plan'`; unit tests; re-baseline | M–L (2.5 d) | UV-6; B-H5 disposal; 08 P2-7e |
| UV-8a | OBJ consumer: combined `vt` from plans (`mesh.obj.combinedUV = 'plan'`); ZIP MTL `map_Kd` rules (7.1); re-baseline | M (1 d) | UV-7; 08 P2-6, P2-7d/f |
| UV-8b | glTF consumer: combined `TEXCOORD_0` from plans (`mesh.gltf.combinedUV = 'plan'`); ZIP images, sampler, textures, `baseColorTexture` and the per-material `KHR_materials_unlit`; optional `TEXCOORD_1`; re-baseline | M (1.5 d) | UV-8a; 08 P2-1a (B-H3), P2-7c/d |
| UV-9 | Panel mode: section-space export UVs (OBJ `vt`, glTF `TEXCOORD_0`) from `panelUvs(…, plan)`; transforms in panel mode (viewport and exports); the `panel_uvs = 'panel'` option reaching `panelCanvas`; B-L19/B-M16 site text; re-baseline. Attach before/after screenshots of `toggles/09_panelids_panel` (Phase-1 versus current) to the review (Q2). | M (1 d) | UV-7; 08 P2-12d |
| UV-10 | `ui/FloatingPanel.js` plus `css/features/floating-panel.css`: move, resize, close, focus, prefs, narrow sheet, `ResizeObserver` auto-offset and re-clamping; `floating-panel.test.mjs` | M (1.5 d) | Phase 1; 07 H3 optional |
| UV-11 | Live path and use cases, **without events**: `LEDWallView.updateSectionUvs`, `vertexRange`, `panelCornersWorld`, `resolveHit`; `UvController` (preview/commit/cancel, flips, turns, Source, presets, Copy to all, history recording, cached layout, rAF-coalesced refresh, `onSectionRenamed`); `UvViewModel`; registration with 07 I2's `addObserver` and the `WallController` rebuild and rename observers; App construct-phase wiring; unit tests (`uv-controller`, `selection-observer`, `led-wall-view-uv`) | L (3 d) | UV-6; 07 I2 |
| UV-12 | Viewer UI: `UVViewer`, `UVCanvas` (drawing, zoom and pan, Texture/Square/Auto aspect, backgrounds for panel IDs, LED and checker with the 4 MP budget, the HDRI seam, the read-only Atlas space), section dropdown, canvas hover readout, empty and error states, `css/features/uv-viewer.css` (`<link>`s only; no visible markup). **Introduces `UV_VIEWER_CHANGED`, `UV_DATA_CHANGED` (both non-visual), `UV_TRANSFORM_CHANGED` and `UV_HOVER_CHANGED` (both visual) with `UVViewer` as their subscriber.** Path A: the `uv.toggleViewer` action and the `uv-viewer` scope rows. | L (3 d) | UV-10, UV-11; 07 I1 |
| UV-13 | Editing: numeric fields with commit semantics, units and lock; Turn feed, Source and Flip controls; drag handles on a general quadrilateral with snapping, modifiers, Escape cancel, thin-island rules and tooltips; presets; Copy to all with re-fit; key scope actions (3.6); status chips including the colour-mode action (`setContentMode('panelIds')`); ↶/↷ mirroring `HISTORY_CHANGED` | L (4 d) | UV-12; 07 H1 |
| UV-14 | All visible markup: sidebar UV options in `WallDisplayPanel` and the atlas note (**introduces `UV_SETTINGS_CHANGED`**, visual, with its subscriber); card row in `SectionListPanel` (joins `UV_TRANSFORM_CHANGED`); `#toggle-uv-viewer`; re-baseline (SNAP, `ui_visual`, SHOTS toolbar-column region). No badge token (07 C35). | M (1 d) | UV-11, UV-12 |
| UV-15 | Hover: `WallHoverProbe` (own-raycast mode, front meshes only, until 02 T23), wall readout and crosshair, double-click to view (no Spec 02); optional `UvHighlightView` (two-tone, `RENDER_ORDER.UV_HOVER_OUTLINE`; joins `UV_HOVER_CHANGED`); `wall-hover-probe.test.mjs` | M (2 d) | UV-12 |
| UV-16 | Harness: `uv_layouts`, `uv_transforms`, `uv_viewer`, `uv_hover` (and `uv_select` when Spec 02 is present), `CONFIGS.uv_transforms`, `tools/pair-diff.mjs`, harness README; ARCHITECTURE amendments (sections 2, 3, 4, 5, 6.1, 8.1, 9); README export notes | M (2 d) | UV-13, UV-15, UV-5c |
| UV-17 | **Spec 02 integration:** the `addObserver` observer (07 I2) at every post-change point (`select`, `selectMany`, `deselect`, `pickAt`, `revalidate`) with the primary; `kind === 'section'`; `addHoverHitObserver` and the probe's shared mode, which switches it from its own raycast to the single hover raycast; `handlesDoubleClick` and the probe's `doubleClick: false`; `uv_select` | M (1 d) | UV-15; **Spec 02 T23** (the `hoverAt` bodies; 07 C37), 07 I2 |
| (UV-18) | **Not built under the recommended order** (07 C58). Only if the Path B fallback was used: delete `UvFallbackHistory`, the `ViewportInput` `'u'` branch and `commands`, and the panel `keydown` listener; switch to `history`, the `KEYMAP` rows and `bindScopedKeys`; remove the S5 exception; swap the in-memory prefs for `app/Prefs.js`. Invariance step. | (S, 0.5 d, fallback only) | 07 H1, I1, H3; UV-13 |

**Total (Feature 4 only):** 15 tasks, about **27 developer-days** (range 24–31). Revision 2 counted 30 days; revision 2.1 removes UV-0 (1 d; 07's consolidated D0 does it), the path-B scaffolding (`UvFallbackHistory`, the `'u'` branch and UV-18, about 1.5 d; 07 C58) and the badge part of UV-14 (0.5 d; 07 C35). The previous draft's 26.5 days excluded the move to 07's History, `KEYMAP` and schema, the Spec 05 alignment and the texture budget, and under-sized UV-11 and UV-13. The Phase 2 prerequisites are estimated in Spec 08, and the platform tasks in Spec 07.

**Critical path:** UV-5a and UV-10 can be done before Phase 2's P2-7 lands. After 08 P2-7a–c: UV-6 (2) → UV-11 (3) → UV-12 (3) → UV-13 (4) → UV-16 (2), about 14 days, with 07 I1 merged before UV-12 and 07 H1 before UV-13 (the recommended order, 07 C58). The output track UV-7 → UV-8a → UV-8b → UV-9 (6 days) runs in parallel after UV-6. UV-5c runs after UV-6 once 07 D5 has merged, and gates only UV-16's `uv_transforms` scenario. UV-14 follows UV-11 and UV-12. UV-17 follows UV-15 and Spec 02 T23, in either order with UV-16.

**Release note:** between UV-7 and UV-8b, the viewport shows per-section Combined UVs while the exports still write the atlas. Merge UV-7, UV-8a and UV-8b in the same release, each as its own commit so each re-baseline stays isolated. Until UV-14 lands, the layout settings are reachable only by opening a v2 file (after UV-5c). Until UV-5c lands, UV state is session-only and the release note says so (07 §1.4).

---

## 11. Risks and open questions

### 11.1 Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | The pipeline claims about Unreal nDisplay mesh projection and disguise (UV0 sampled over 0..1, so overlapping islands repeat content) have not been verified against the owner's actual setup. | Both layouts ship. Section mode remains available. The owner validates one export of each before UV-7 merges (Q12). |
| R2 | Golden-master churn: seven Feature 4 steps touch outputs, on top of 08's P2-7 steps, and the combined OBJ `vt` makes a planned round trip. | 08's `--expect` manifests (a declared change that does not happen also fails), one consumer per commit, and the "must not change" column of 8.3. Optionally skip P2-7b (Q14). |
| R3 | Cross-spec collisions. **Spec 07:** schema paths and casing, the `source_rotated` leaf, the `_led` suffix, prefs key, history rows, keymap rows and `bindScopedKeys`. **Spec 08:** P2-7 authority, atlas name, the glTF profile leaf, manifests. **Spec 01:** toolbar order, `.view-btn.active`, `NORMAL` order, `css/features/debug-view.css`, back shells, panel-plane flips, `MaterialOverride` and `Material[]`, `disposeObject3D`. **Spec 02:** Selectable `kind`/`sectionId`, observer point, hover hit, `dblclick`, vertex ranges, card template, `pickMeshes`, the badge. **Spec 03:** pivot baked into the layout. **Spec 05:** `invertUv` signature, post-transform applied once, bake size, per-section versus atlas bake and LED mask, H key. **Spec 06:** theme roles, the reserved zone, `Brand.files.panelIdsPng` and the T6b rename map. | 2.3 is the binding alignment table, and 07's consolidated D0 applies its requested changes (07 C58; the former UV-0 task is withdrawn). Shared seams are named explicitly (5.3, 6.3, 6.10). "Whichever lands first adds X" rules apply to `vertexStart`/`vertexCount` (08, 02, 04), `pickMeshes` and `sectionRangeForFace` (02, 04), `.view-btn.active` (01, 06, 07) and the `disposeObject3D` de-duplication (01 T10, 04 UV-7). No feature adds a badge token: 07 I4a rewrites the badge once (07 C35; 2.3 rows 01-4 and 02-1). |
| R4 | Texture memory of the new default. Per-section textures use `clamp(floor(4096/max(W,H)),1,4)` px/LED, while the atlas density falls as the wall gets wider. Measured on the harness configs: `default` and `flat3` 1.0×; `mixed` 3.87 MP against 3.19 MP (1.2×); `box_corner` 3.54 MP against 1.99 MP (1.8×); `large_wall` 29.5 MP against 3.3 MP (9.0×: about 157 MB of GPU memory with mipmaps against 17.5 MB). Because `per-section` becomes the Combined default, this raises the context-loss risk that 08 treats as owner-visible. Without B-H5 the textures would also leak on every rebuild. | The 16 MP viewport budget (6.4) caps the section textures of one rebuild at about 90 MB with mipmaps: `large_wall` drops to 2 px/LED, 13.1 MP, about 70 MB (4× the atlas), and no other harness wall changes. The same budget applies to Section mode and Panel `section`, which today use the same unbudgeted textures. Hard dependency on B-H5 disposal (Phase 1C H1 or 08 P2-12a). The viewer's previews are budgeted separately (6.11). A manual `large_wall` memory check (criterion 24). The budget value is Q17. |
| R5 | Floating-point drift breaks bit-identical identity outputs, or leaves 1e−17 residues at quarter turns. | Identity short-circuit; exact `cosSinDeg`; `k` ratios exactly 1 for equal sizes (6.14); `Object.is` tests against the legacy oracle. |
| R6 | Material arrays change draw order and add N draw calls. | Sections do not overlap, and N stays small (dozens). Covered by the screenshot pair (criterion 4). |
| R7 | Focus-scoped key swallowing surprises users. | Applies only while focus is inside the panel. U, Escape and modified chords pass through. `keyup` is never stopped. Visible focus ring. The shadowed sibling keys are documented (3.6) and appear in 07's generated shortcut help. |
| R8 | The glTF V convention is easy to get wrong. | A unit test asserts `t = 1 − v`. Manual GLTFLoader and Blender checks. Documented in 6.1. |
| R9 | Hover raycasts on very large panel-mode walls (3,200 meshes) are slow. | From Spec 02 T23 on, the probe reuses the single hover raycast's hit (07 C37; zero extra raycasts). Without it, raycasts run only while the viewer is open, are rAF-throttled, and are skipped during orbit, gizmo drags and pilot. A per-section bounding-box pre-filter can be added later. |
| R10 | Users confuse "move the UV island" with "move the image" (opposite visual directions), and island rotation with feed rotation. | Standard UV-editor semantics (as in Blender), the corrected hint line (3.7), Turn buttons named and titled for the feed on the wall (3.3), and the live viewport preview. |
| R11 | The Source orientation (`sourceRotated`) is a new concept, and "Rotate 90" in the field differs from "Turn feed ⟳ 90". | Turn and Pixel-accurate set Source automatically, so most users never touch it. The Source control shows the actual dimensions (320×192 or 192×320) and is hidden for square sections, where the flag is don't-care. The chip names the source size. Q15 confirms the model. |
| R12 | With one global stack, Ctrl+Z in the viewer may undo a non-UV edit made elsewhere (07 Q17). | This is 07's documented model (C16). The ↶/↷ titles name the action that will be undone (`HISTORY_CHANGED` labels). |
| R13 | Path B fallbacks (temporary UV stack, raw `keydown` listener, in-memory prefs) linger after 07 lands. | 07 C58 schedules I1-I3 and H1 before UV-12/13, so under the recommended order they are never built. They would exist only if UV-12/13 merged before 07 I1/H1. UV-18 removes them; the static check's S5 exception names the listener so it cannot be forgotten; the same unit and harness checks pass in both paths. |
| R14 | Combined LED-sim or HDRI pixels change on single-section walls. | Each slot uses exactly 08 P2-7e's material (or 05's `hdri.create`) with the per-section repeat; for one section the parameters equal the atlas material's (unit test), and UV-7 keeps `toggles/*` in "must not change". |

### 11.2 Open questions for the owner

Each has a recommended default.

| # | Question | Recommended default |
|---|---|---|
| Q1 | Default UV layout for the Combined mesh? | **Per-section 0–1** with material slots, **if your content is applied per material slot**. If your main pipelines are one feed per mesh (nDisplay mesh projection, disguise), choose **Atlas** as the default instead, or export Individual Section Meshes; Q12's pipeline check decides. Both layouts fill the UV space without overlap inside each island, and the other one stays one click away. Switching the default later is one line in `UvSettings` plus one re-baseline. |
| Q2 | Panel-mode UVs: section space (one shared section texture) or legacy per-panel 0..1? 08 P2-12d already moves the **viewport** to section textures in Phase 2; this question decides the **exports** and whether the legacy option stays. With Panel IDs on, the visible differences against the legacy per-panel look are: one centred section name per section (0.15 of the canvas, 60 % opacity) instead of a small section-name caption at the bottom of every panel; panel labels at 0.35 instead of 0.4 of the panel size; 1–4 instead of 4–16 texture px per LED, so labels are softer when zoomed in close; logos and the section-label size now appear (B-L19). | **Section space** for the viewport and the exports, with `panel_uvs = 'panel'` kept as an option for the per-panel look. Before/after screenshots of `toggles/09_panelids_panel` are attached to the P2-12d review (08) and again to the UV-9 review. |
| Q3 | Also write atlas UVs as glTF `TEXCOORD_1`? | **Off by default.** Available as an option; it clashes with Unreal lightmap UV generation. |
| Q4 | UDIM-tile export (section i in tile 1001+i) for Blender, Maya or Unreal VT workflows? | **Defer.** Add later as an export-only option if a pipeline asks for it. |
| Q5 | Manual pixel-map canvas (place each section at an x, y position in a processor or media-server canvas, as a user-arranged atlas)? | **Defer to a separate feature.** It needs your processor workflow (Brompton, Megapixel or disguise feed). The `atlas` layout and the `pixel_map`/`atlas` JSON blocks are its foundations. |
| Q6 | Should LED-pixel simulation (and the HDRI LED mask) follow UV transforms? | **No.** They show physical pixels. |
| Q7 | ZIP texture density: keep 1-4 px per LED, or add a "1 px per LED (pixel-exact canvas)" option? | **Keep the current behaviour; add the option later.** UVs are normalised, so both work. `pixel_map` states the density. |
| Q8 | Should a newly added section inherit the previous section's UV transform? | **No (identity).** Predictable; "Copy to all" covers the batch case. |
| Q9 | glTF material for textured ZIP exports: `baseColorTexture` with `KHR_materials_unlit`, or emissive? | **`baseColorTexture`, factor white, with `extensions: {KHR_materials_unlit: {}}` on each textured material and `KHR_materials_unlit` in `extensionsUsed` (not `extensionsRequired`)**, exactly as Spec 05 §7.2 writes its HDRI bakes. Viewers without the extension fall back to a lit base colour. |
| Q10 | Global shortcut for the viewer? | **U** (reserved for this feature by Spec 07; no conflict with legacy or sibling keys). Ignored in pilot mode (`notInPilot` on 07's row). |
| Q11 | Material naming in a single-section Combined export: `Wall_1` or keep `LED_Wall_Combined`? | **`Wall_1`**, consistent with multi-section exports and Section mode (decided in 08 P2-7d; the object and mesh keep `LED_Wall_Combined`). |
| Q12 | Can you test one Section-mode and one Combined + Atlas export in your Unreal (nDisplay) and disguise setups before UV-7 merges? | **Yes, required:** a go/no-go gate for R1. |
| Q13 | If Spec 01 adds a "reversed face orientation" option, should UVs auto-mirror? | **No.** UVs follow the physical pixel order, which does not change. |
| Q14 | If Feature 4 follows Phase 2 immediately, skip 08 P2-7b (atlas OBJ `vt`) to avoid the round trip in 8.3? | **No, keep P2-7b** unless both are scheduled in the same release. Phase 2 must ship a correct textured combined OBJ on its own. |
| Q15 | Rotation model: rotate in source pixels with an explicit Source orientation (no shear, rectangular islands), or restrict to 90° steps in raw UV space? | **Source-pixel rotation with Source orientation** (D8). Quarter turns behave exactly like the UV-space model, and free angles never shear the content in pixels. |
| Q16 | Ship the atlas PNG (`textures/` + `Brand.files.panelIdsPng`, so `textures/panel-ids.png` until the Morph rename) in every ZIP even when the per-section layout does not reference it? | **Yes** (08 Q5). It is the pixel map processor operators need, and the JSON's `atlas` block documents it. |
| Q17 | Viewport texture budget for section panel-ID textures: 16 MP per rebuild (about 90 MB with mipmaps), reducing px/LED uniformly on very large walls? | **Yes, 16 MP.** Only walls with more than about 1–2 million LEDs in total are affected; the threshold depends on the per-section density (1.05 M LEDs at 4 px/LED, 1.86 M at 3 px/LED). `large_wall` (3.3 M LEDs) goes from 3 to 2 px/LED. Exports keep the full density. 07's panel-mode budget (32 MP) covers the legacy `panel` option separately. |
| Q18 | Should the Combined layout default follow an **export target** (for example "Unreal, material slots", "nDisplay mesh projection", "disguise", "DCC") instead of one project-wide default? | **Not in this feature.** Ship one default (Q1) plus the sidebar hint, and decide Q1 from Q12's check. If that check shows that your pipelines need different layouts, add an export-target select as a follow-up (S, about 0.5 d): it sets `uv.combined_layout` and the mesh mode together, is persisted through 07's extension protocol (4.4), and re-baselines only `ui_visual`. |
