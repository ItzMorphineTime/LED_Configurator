# 09: Additional improvements beyond the owner's list

| | |
|---|---|
| **Status** | Implementation-ready proposal set (Phase 3 and later), revision 2.1. **Plan review (2026-10-16):** X10 now depends on spec 02 T17 (Detached), which spec 02 defers to its 3b by default (02 Q25). **Revision 2.1** applies the cross-spec consistency review (07 §0 C32-C62 and 0.4): X2's top-level key is **`production`** (not `stage`, C61); revision numbers are assigned at merge (C40); `Brand.jsonGenerator` exists and the stage pack and spec sheet use it (C62); the `M` row matches by key and the measure step registers Escape priority 40 (C42, C43); X10 runs with `setSectionsDetached` semantics, and Q10/Q16 are closed by `FramingPolicy`'s three boxes (C34); render-order slots `INNER_FRUSTUM_OVERLAY` 990 and `MEASURE` 992; stills use `withContentMaterials` (C48); events are classified visual/non-visual (C47); X4 makes 07 R4 required; T0.1 is merged into 07 G3 (C57); there is no wall root transform (C32). Revision 2: Each item can be accepted, deferred or rejected on its own: an item's JSON fields land only with the item (§4.2), so a rejected item leaves nothing behind. Revision 2 re-bases the persistence section on spec 07's binding §0 decisions, re-scopes X10 onto spec 02's Detached sections, and fixes the capture, share-link, coverage, overlay and harness-manifest findings of the review. |
| **Builds on** | `docs/ARCHITECTURE.md` (the binding contract), `docs/REFACTOR_PLAN.md`, and sibling specs 01-08 in this folder: 01 normals, 02 section selection and offsets, 03 pivot, 04 UVs, 05 HDRI, 06 Morph branding (Features 1-6: the owner's requests, `docs/IMPROVEMENT_PLAN.md` §4), **07 platform foundations** and **08 bug-fix roadmap**. |
| **Ownership boundaries (binding)** | Spec 07 owns the Project JSON v2 envelope, key style and extension protocol (`io/ProjectSchema.js`, `ProjectValidator`, `ProjectMigrations`, `ProjectSerializer` v2 and its variant table), `app/ProjectSession` (`apply`, `PROJECT_REPLACED`), `app/History`, `app/Autosave`, `app/Prefs`, `ui/Notifier`, `ui/Dialog`, `interaction/Keymap` (`KEYMAP`, `registerActions`, `bindScopedKeys`), `render/PreviewPass` (including `capture`), `render/CanvasProbe`, the header history controls and the Project section. Spec 08 owns the B-M10 coverage analyser (`geometry/FrustumCoverage.analyzeCoverage`, P2-11), `WallLayout.worldVertices/columnQuads/extentAcross`, `CameraHub.refresh({poseOnly})` (P2-12c) and its status semantics, B-L34 (P2-10c) and B-L17 (P2-13b). Spec 02 owns Detached sections, `SectionOffset`, `SectionLayout.frame`, `WallLayout.panelQuads()`, `sectionBounds()`, `generativeBounds()`, `floorRuns()`, `WallController.currentLayout` and `SECTION_CHANGED`. Spec 03 owns the pivot, the stage/export frames and the `StageAnchored` protocol. Spec 06 owns `Brand` (`filePrefix`, `productName`, `jsonGenerator`: added by 06 T6a or 07 D4, whichever lands first, 07 C62), `BrandMark`, the role tokens and `COLOR_BINDINGS`. **This spec only adds rows, options, additive methods and use cases to those modules; it never redefines them.** Its former amendment requests (Q10, Q16) are settled by `FramingPolicy`'s three named boxes (07 C34). |
| **Legacy reference** | `index.html@cd3fd3f` (line numbers below). Bug ids come from the verified defect list ([`docs/DEFECTS.md`](../DEFECTS.md): `B-H*`, `B-M*`, `B-L*`). |
| **Conventions** | Metres, Y up, the wall faces +Z, the legacy origin is the first section's bottom-left vertex. Section sizes are in mm (`MM_TO_M`). Angles are in degrees in the domain and radians in maths (`(deg * Math.PI) / 180`). Euler order is `'YXZ'`. Spec 03 adds the *stage* frame (origin O = pivot projected on the floor) and the *export* frame (origin = pivot P). Everything here that reads a layout reads `wallController.currentLayout` (spec 02: the stage-frame layout, lazily re-laid out after every mutation, including live drags); before spec 02 lands, `layoutProject(project)` as spec 08 does. Project JSON keys follow spec 07 C1-C3: snake_case, unit suffixes (`_m`, `_mm`, `_kg`, `_w`, `_v`, `_a`, `_pct`, `_deg`). Domain fields stay camelCase; the serializer maps them. |
| **Notation** | Items are **X1-X16**. Tasks are **T*n*.*m***. "F*n*" means "the spec for Feature *n*". "V2" means spec 07's Project JSON v2 tasks D1-D5 (`ProjectSchema`, validator, migrations, serializer v2, `ProjectSession`). "S07-*xx*" and "S08-*xx*" name tasks of specs 07 and 08 (for example S07-H1, S08-P2-11). |

---

## 0. At a glance (MoSCoW)

Effort uses S ≤ 0.5 d, M 1-2 d, L 3-5 d, XL > 5 d; an item between two bands is labelled with both (for example "M/L (2.5 d)"). The figures are developer-days for one maintainer and include tests and the harness re-baselines. They exclude work owned by specs 07 and 08.

| ID | Idea | MoSCoW | Who benefits and why | Effort | Hard dependencies |
|---|---|---|---|---|---|
| X1 | **LED product library**: real cabinet size, resolution, pitch, weight, power, curve and rigging limits; one-click section setup (also for a multi-selection); links that keep the wall consistent | **Must** | Sales, VP supervisors and LED techs stop typing datasheet numbers. Every other estimate depends on it. | L (3.5 d) | V2 |
| X2 | **Power, weight, rigging and data/processor estimates**, plus **stage checks** (curve limits, hang/stack limits, mixed pitch, canvas size, per-cabinet circuit and port limits, surface mismatch) | **Must** | Quotes, power distribution, rigging plans and processor counts are the first questions on every VP job. | L (5 d) | X1 |
| X3 | **Moiré and viewing-distance calculator** (pitch vs lens, sensor, distance, focus, T-stop), with its own centre-hit helper | **Must** | It answers the most-asked ICVFX question, "will it moiré at this distance with this lens?", with transparent maths. | M/L (2.5 d) | S08-P2-11 (`columnQuads`, camera basis, `D0`). X9 adds the nearest visible point. |
| X4 | **Screenshot export**: viewport stills at high resolution with helpers hidden and the Morph watermark; camera-view stills. Built on spec 07's `PreviewPass` through a new additive `captureCanvas()`; spec 07's `capture()` keeps its signature. | **Must** | Previs stills for clients, including the HDRI backdrop (F5). It also feeds X12. | L (3 d) | S07-R1, S07-R2, **S07-R4** (required once X4 is accepted, and counted once in spec 07, C58); spec 06 T10 (`BrandMark`, optional) |
| X5 | **Autosave and restore** | **Delegated to spec 07 (S07-H3)** | Spec 07's `app/Autosave.js` (two slots, `rotateOnBoot`, restore banner) covers it. Every field of this spec is in the `autosave` variant automatically (none is view-only). | 0 d here | S07-H3 |
| X6 | **Stage templates** plus a **curved-volume generator** (radius and arc to columns, curve and heading change) | Should | Fast starting points. The generator removes trial-and-error arithmetic for curved volumes. | M/L (2.5 d) | X1, V2, S07-E1 (`Dialog`), B-M4 (S07-D7); X10 for the templates with a ceiling or floor |
| X7 | **Shareable URLs** (project in the URL fragment, compressed, size-capped on both ends, opened only after confirmation) | Should | "Send me the stage" without files. GitHub Pages friendly (the fragment never reaches a server). | M (2 d) | V2, B-M4 (S07-D7), B-L8 (S07-D2) |
| X8 | **Undo/redo** | **Delegated to spec 07 (S07-H1, S07-H2)** | Spec 07's `app/History.js` and `HistoryControls` cover it. This spec adds `History.record` rows for its own use cases (§5.5). | 0 d here | S07-H1 |
| X9 | **Inner-frustum visualisation** plus **coverage extensions** on spec 08's `analyzeCoverage`: exact inner-frustum pixel area, nearest visible point, border-sampled "within" | Should | Shows what the tracked camera sees on the wall and how many LED pixels the inner frustum covers. | L (4 d) | S08-P2-11, S07-R1 (helpers layer), spec 02 `panelQuads()`, T3.2 (centre hit) |
| X10 | **Ceiling and floor presets** on spec 02's Detached sections and Transform Offsets ("Ceiling: fit to volume", "Ceiling: snap to wall top", "Floor: fit to volume", "Floor: snap to wall front") | Should | Real volumes have LED ceilings (reflections, lighting) and XR floors. Spec 02 already makes them possible; the presets remove the hand arithmetic of its "Ceiling over the volume" workflow. | M/L (2.5 d) | spec 02 3a (offsets, `SectionLayout.frame`, `sectionBounds`) and spec 02 T17 (Detached; in 02 3b by default, 02 Q25) |
| X11 | **Engine and media-server stage packs** (Unreal nDisplay, Disguise): per-section meshes, UVs 0..1, manifest, viewport/region CSV | Should | Removes hours of hand prep per stage. The meshes must be correct (normals, UVs, pivot). | L (5 d) | F1, F3, F4, B-H3, B-L5, B-L14 (lands after them; no capability gating) |
| X12 | **Print/PDF spec sheet** (Morph-branded) | Should | A one-page client deliverable built from X2, X3 and X4. | L (3.5 d) | X2, X4, F6 |
| X13 | **Measurement tool** (snapping point-to-point distances, pinnable) | Could | Checking clearances and distances without exporting. | L (4 d) | S07-I1 (`Keymap`), S07-I2 (click rule, B-M14), S07-R1 (layers), spec 03 (`StageAnchored`) |
| X14 | **Unit localisation** (metric or imperial display) | Could | US crews work in feet and inches. Pitch stays in mm. | L (5 d) | all panels, including the spec 02-05 panels (do it last) |
| X15 | **Top-down plan export (SVG)** | Could | A floor plan for riggers and set designers. | M (1 d) | X10 optional |
| X16 | **Data-path (port) map** on the panel-ID atlas | Could | Shows LED techs which cabinets go on which processor port. | M (1.5 d) | X2 |

**Total ≈ 45.5 developer-days.** Must ≈ 14.5 d (including the T0 prerequisite T0.2, 0.5 d; revision 2.1 merges T0.1's 1 d into spec 07 G3, C57), Should ≈ 19.5 d, Could ≈ 11.5 d. Compared with revision 1: X4 (+2 d), X11 (+1.5 d) and X13 (+2 d) were re-estimated upwards, X10 shrank from 6 d to 2.5 d by building on spec 02, and the single schema step T0.3 was replaced by one schema row set per item (§4.2).

**Recommended first slice, Release A (about 3 weeks, 14.5 developer-days, after S07-D1…D5, S07-E1 and S08-P2-11, with X4 on S07-R4):** T0.2, X1, X2, X3, X4 (07 G3 already carries the print and clipboard hooks of the former T0.1). These add no geometry risk and change no OBJ, MTL, glTF or PNG byte. Each item's JSON fields land with the item: one revision bump per item release, numbered at merge, and one J re-baseline per item (§4.2, §8.2). Later releases: X10 after F2 3a; X11 after F1, F3 and F4; X13 after 07 I1, I2 and R1; X14 last. They deliver the "quote and plan" workflow.

**Won't (this cycle), with reasons:**
- Generating a full `.ndisplay` config. Mesh components must reference Unreal assets, and the schema is version-specific. X11 ships meshes plus a region table instead.
- Disguise project files.
- Live control of LED processors.
- Camera-tracking input (FreeD, OpenTrackIO).
- Photometric or colour-gamut simulation.
- Multi-user or cloud storage.
- FBX export (no browser-side writer without a library).
- DXF plans (X15 does SVG first).
- A three.js upgrade (owned by spec 07, workstream f).
- A second ceiling/floor placement mechanism. Spec 02's Detached flag and Transform Offsets are the only placement model; X10 only computes their values.

---

## 1. Summary and user value

**Problem.** Today the configurator answers one question well: *what does this wall look like?* A virtual-production job immediately asks several others, and the app currently gives no help with any of them:

1. *What is it made of?* There is no product notion. Pitch exists only as a derived number in the JSON export (4505, 4949).
2. *What does it weigh and draw, and how many processor ports does it need?*
3. *Will the camera see moiré at our working distances?*
4. *What exactly does the film camera see on the wall, and how many LED pixels does the inner frustum cover?* The coverage status ignores rotation and curvature (B-M10, fixed by S08-P2-11), and nothing reports the inner frustum.
5. *Can we add a ceiling or a floor?* The legacy walk is vertical-only (1483-1549). Spec 02 adds Detached sections and Transform Offsets, but its "Ceiling over the volume" workflow asks the user to compute Tilt, Y Up and Z Out by hand.
6. *Can Unreal or Disguise take the meshes directly?*
7. *Can I hand the client a sheet, or a picture?*
8. *Can I send the stage to a colleague without a file?*

Persistence and undo (B-L31, "a reload loses everything") are answered by spec 07; this spec makes sure its own fields take part.

**Who.**
- **Morph sales and solutions engineers** need quotes, spec sheets and screenshots.
- **VP supervisors and DPs** need lens and moiré checks, the inner frustum, and camera-view stills (with the HDRI backdrop).
- **LED techs and riggers** need power, data, weight, hang/stack limits and a plan.
- **Unreal and Disguise operators** need clean per-section meshes, UVs and regions.

**Principles for every item.**
- **Additive and default-off.** With default settings, no existing OBJ, MTL, glTF, PNG or canvas screenshot golden changes. JSON changes only when an item lands its own fields: one revision bump (its number assigned at merge, 07 C40) and one J re-baseline per item (§4.2, §8.2). The header is not touched, and nothing is drawn over the canvas by default.
- **Pure first.** All maths lives in Node-testable modules (`domain/`, `geometry/`, a new `analysis/`, `io/`), with worked examples as unit tests.
- **Data-driven catalogues.** Every number carries a source URL and a retrieval date.
- **Honest outputs.** Estimates and risk indicators are labelled as such, with their thresholds visible and adjustable in one place.
- **No parallel platforms.** Undo, autosave, toasts, dialogs, shortcuts, menus' keys, schema, stills and section placement use the spec 02 and spec 07 modules.

---

## 2. Current state

### 2.1 Legacy behaviour and the refactored modules involved

| Item | Today (legacy, `index.html@cd3fd3f`) | Bugs | Refactored modules involved |
|---|---|---|---|
| X1 | A section has `panelWidth/Height` (mm), `ledX/ledY`, curve and offset. The card inputs have bounds: cols 1-50, rows 1-20, width 50-5000, height ≥ 50, LED ≥ 8 (template 3944-3952; rules 4030-4036). Pitch appears only in the JSON export, as `parseFloat((panelWidth / ledX).toFixed(2))`, horizontal only (4505, 4949); spec 07 keeps it as the derived key `led_resolution.pixel_pitch_mm`. There is no product or cabinet concept. | B-L15 (fractional counts) | `domain/WallSection` (`FIELD_RULES`, spec 07 `LIMITS`), `ui/SectionListPanel` (or spec 02's card and `SectionBatchPanel`), `io/ProjectSchema` (spec 07) |
| X2 | The header shows pixels, panels, sections and arc only (879-899, `updateStats` 2307-2318). There is no weight, power, data or rigging information. | B-L17 is fixed by S08-P2-13b (`Wall.combinedCanvasSize()`, `#wall-texture-warning`) | `domain/Wall.totals`, `app/WallController.publishStats` |
| X3 | The camera has a filmback (mm), focal length and pose (1306-1331). It shows H/V FOV (2365-2371). The "Max Distance" readout is `D = min(W/(2tan(h/2)), H/(2tan(v/2)))` (2529), which is not a moiré metric. There is no sensor resolution. The fabricated `1920×1080` preview label (3732-3739, B-L34) is fixed by S08-P2-10c / S07-R2, not here. | B-M10 (S08-P2-11) | `domain/CineCamera`, `app/CameraController.CameraHub`, `ui/CameraPanel` |
| X4 | No screenshot exists. The main renderer has no `preserveDrawingBuffer` (1436). Spec 07 replaces the second WebGL context with `PreviewPass` (scissor pass) and offers a camera-frame PNG (S07-R4, optional in spec 07 but required once X4 is accepted, 07 C58): `PreviewPass.capture({width, height}) → Promise<Blob>`, rendered into a `WebGLMultisampleRenderTarget` on WebGL2, camera mask `DEFAULT \| ENVIRONMENT`. | B-M9, B-M11 (spec 07) | `render/SceneManager`, `render/PreviewPass`, `app/ProjectIO`, `ui/ExportPanel` |
| X5 | No persistence. **Spec 07 H3 adds `app/Autosave.js`.** | B-L31 | spec 07 |
| X6 | Startup always builds one 5×3 section (1395-1407). There are no templates. Curved volumes need hand-calculated curve and offset values. | B-L1 (curve convention). The owner answers 08 Q10 at Phase 2 kickoff (recorded in 08 §5.6 and ARCHITECTURE §1.4); S08-P2-13f then keeps and documents the legacy convention and retires `Strategies.curveBeforeFirstPanel`; spec 07 C6 stores nothing in v2.0 ("absent means legacy"), and a later change goes through `layoutOptions.curveConvention` and a top-level `curvature_convention` key. | `domain/Wall`, `geometry/WallLayout`, `app/ProjectSession` |
| X7 | The app never reads `location`. | B-M4 and B-L8 make any external project input unsafe today (spec 07 D2, D7 fix them) | `app/App`, `io/ProjectSerializer` |
| X8 | No undo exists. **Spec 07 H1/H2 add `app/History.js` and `HistoryControls`.** | none | spec 07 |
| X9 | The frustum is drawn as lines to a fixed 15 m plus an 8 % fill (2346-2429). The status `calculateFrustumIntersection` (2471-2534) uses `posZ` against a flat rectangle and ignores rotation. **S08-P2-11 replaces it with `geometry/FrustumCoverage.analyzeCoverage(layout, pose, lens) → {status, frameWidth, frameHeight, distance, cornerDepths, centreDepth}`** over `layout.columnQuads()` (statuses `offWall`, `within`, `offCenter`, `exceeds`), and P2-12c adds `CameraHub.refresh({poseOnly})` with `rig.updateFrustumDepths`. Nothing reports the inner-frustum pixel count or which section the camera is looking at. | B-M10, B-L33 (spec 08) | `geometry/FrustumCoverage` (spec 08), `render/CameraRigView`, `app/CameraController.CameraHub` |
| X10 | The walk is in the XZ plane only, with `y = row * panelH`. Sections are bottom-aligned on `y = 0` (1483-1549). **Spec 02 T17 adds the Detached flag** (in 02 3b by default, 02 Q25; a detached section starts where the last non-detached section above it starts and does not move the following sections; 02 §6.2) and **per-section Transform Offsets** (X Along, Y Up, Z Out in mm; Tilt, Pan, Roll; rotation origin; 02 §3.3, §6.5). Its §3.7 workflows "Soffit", "Ceiling over the volume" and "Riser strip" need the user to compute the values. `floorRuns()` already skips sections facing up or down, and `firstEdge`/`lastEdge` skip detached sections. | none | `geometry/WallLayout` (spec 02 `SectionLayout.frame`, `sectionBounds`, `generativeBounds`), `app/WallController`, spec 02's card |
| X11 | OBJ and glTF exist but have inverted winding (B-H2), overlapping combined OBJ UVs (B-M6), glTF without UVs or normals (B-M7), a base64 crash (B-H3), Uint16 indices (B-L5) and colliding names (B-L14). | as listed | `io/ObjExporter`, `io/GltfExporter`, `geometry/TextureAtlas`, `app/ProjectIO` |
| X12 | None. Spec 07 has `project.notes` with no UI yet. | none | `app/ProjectIO`, spec 07 Project section |
| X13 | None. Raycasting is only used for camera, person and car picking (3427-3474). | B-M14 (S07-I2) | `interaction/InputState.PointerRay`, `interaction/SelectionManager`, `interaction/Keymap` |
| X14 | Mixed units: panels in mm (card), camera and props in m (1047-1066, 1113-1158), angles in degrees. | none | every `ui/*` panel |
| X15/X16 | None. | none | `geometry/TextureAtlas`, `render/textures/PanelIdRenderer` |

**Stored normals (needed by X9).** The legacy strip vertex normals are `(−dz/len, 0, dx/len)` (1604-1625), which is `(−sin a, 0, cos a)` for an edge heading `a`: +Z at heading 0, i.e. **toward the stage**. Panel-mode planes are rotated by `rotY = −atan2(dz, dx)` (1531), which maps the plane's +Z normal to the same stage-facing direction. B-H1 is the *winding*: the triangles are clockwise seen from the stage, so the geometric face normal is the opposite of the stored normal (spec 01 §2). Spec 08's `'averaged'` profile keeps the stored normals stage-facing ("the normals are never negated"), and spec 01 multiplies them by σ = `sl.facing` (−1 for a reversed section). In every profile the stored normal is therefore the **LED-side** normal; X9's overlay relies on this invariant and tests it (§6.5, §8.1).

### 2.2 Seams the refactor and sibling specs provide (used here)

- **Spec 07.** `ProjectSession.apply(v2, {reason, scope})` and `PROJECT_REPLACED {reason, scope}`; its wall-scope merge (6.9 there: the live `capture('history')` plus the new wall keys, then validation); `ProjectSerializer.write(project, {variant})` and `read(data, {exportLimits})`; `io/ProjectSchema.js`, `KNOWN_REVISION` and the `REVISIONS` table (revision numbers assigned at merge, C40); the `"version": "2.<n>"` marker and the variant table (4.2 there); `ProjectSession.apply` step 3 hydration through the extensible `features` hook map (`stage`, which hydrates `production`, `measurements`, `lens`, `innerFrustum`; C41); `History.record(label, {coalesceKey})` (transactions `begin/commit/cancel` are for gizmo drags only); `Autosave.rotateOnBoot/schedule/flush`; `Notifier.info/success/warn/error`; `Dialog.open({title, body, actions})`; `interaction/Keymap.js` (`KEYMAP`, `matchShortcut`), `core/typingTarget.js`, `viewportInput.registerActions(map)`, `viewportInput.registerEscapeHandler(priority, fn)`, `ui/dom.js bindScopedKeys(el, scope, actions)`; the top-centre stack `#viewport-top-stack` (C51); `SceneManager.addHelper(o, {layer})`, `tagHelper`, `setPasses`, `invalidate`, `withPassHidden`; `LAYERS = {DEFAULT, HELPERS, ENVIRONMENT, DEBUG}` with the still mask `DEFAULT | ENVIRONMENT` (HELPERS never in the preview, never in pilot, Q7); `PreviewPass.capture({width, height}) → Promise<Blob>` (R4, 6.1 "Stills"); `CanvasProbe.fits(w, h)`; `app/Prefs.js` (`morph-led-configurator:prefs`, rule S2); the harness tasks G3 (storage clear, fixed clock, UTC, `?autosave=off` by default, `toasts.json`) and G4 (differential `golden.yml`).
- **Spec 08.** `analyzeCoverage(layout, cameraPose, lens) → {status, frameWidth, frameHeight, distance, cornerDepths: (number|null)[4], centreDepth}`, with the frame distance `D0` (`distance`, §6.10 there); its camera basis and ray–quad predicate (`den < −1e-9`, `t > 0`, `0 ≤ s ≤ 1`, `0 ≤ v ≤ 1`, smallest `t`); `layout.worldVertices()`, `layout.columnQuads()`, `layout.extentAcross(facing)`; `framingBounds 'layout'` with `FramingPolicy`'s three named boxes `generativeBox`, `wallBox` and `stageExtent` (07 C34); `CameraHub.refresh({poseOnly})` and `rig.updateFrustumDepths(cornerDepths)` (P2-12c); `Wall.combinedCanvasSize()`; `FILMBACK_PRESETS[*].shortName`; `Strategies.mesh` moved to `geometry/MeshProfiles.js` (P2-13g).
- **Spec 02.** `WallSection.detached` and `setDetached`, `SectionOffset` (mm, `position`/`rotation`/`origin`; persisted as `offset.position_m`, C3), `WallSection.clone`, `SectionLayout.postTransform`, `SectionLayout.frame` (`origin`, `xAxis`, `zAxis`, `B = Ry(β)`), `WallLayout.bounds()` (transformed), `generativeBounds()`, `sectionBounds(i)`, `*panelQuads()` (`{sectionIndex, sectionId, col, row, corners}`), `floorRuns()`, `WallController.currentLayout`, `SECTION_CHANGED {ids, fields, source, live}`, `SectionBatchPanel`.
- **Spec 03.** `layoutProject(project, {frame})`, `WallLayout.translated`, `distToWall`, the `StageAnchored` participant protocol (`{id, translateStage(dx, dz)}`), `pivotPoint(mode)` on `generativeBounds()` (D5).
- **Spec 01.** `core/renderOrder.js`, the single render-order registry (no literal ≥ 900 outside it); `LEDWallView.withContentMaterials(fn)` for stills (07 C48).
- **Spec 06.** `Brand.filePrefix` (explicitly for specs 07 and 09), `Brand.files.*`, `Brand.productName`, `Brand.jsonGenerator` (07 C62), `APP_VERSION`, `BrandMark.load()` (async, never rejects), `COLOR_BINDINGS`, the role tokens of `css/02-tokens.css`.
- **ARCHITECTURE.** `WALL_REBUILT {layout, meshMode, view}`, `ResourceTracker`, `DisplaySettings`, theme injection.

---

## 3. UX design

### 3.1 Where everything lives

This spec adds **nothing to the header** (spec 06 owns its rework and spec 07 owns the history controls in it) and **nothing over the canvas by default** (overlays appear only while a feature is active). Project-level controls go into spec 07's Project section; everything else goes into the sidebar, the section card, the export section and menus.

```
+------------------------------------------------------------------------------------------------------------------+
| [Morph logo] Morph LED Configurator (F6)  [Undo][Redo] * Saved 14:02 (spec 07)  | PIXELS  PANELS  SECTIONS  ARC  |
+------------------------------+-----------------------------------------------------------------------------------+
| PROJECT              (S07)   |        [ Restore unsaved work from 13:58 (3 sections)?  Restore | Discard ] (S07) |
|  Name   [Untitled stage  ]   |        [ Open shared stage "Car U" (4 sections)?   Open | Keep mine ]  (X7)       |
|  Client [               ] X12|                                          [Front][Side][Top][Reset][Grid] (as today)|
|  Notes  [               ] X12|                                                                                   |
|  [New][Open][Save]           |                               3D viewport                                         |
|  [Templates v] [Share]  X6,X7|          +---------------------------+                                            |
|  Autosave (on)  Units [m|ft] |          | 4.212 m  [Pin]            |  <- measurement label, only in measure     |
| > Wall 1  12x6 * 2112x1056   |          | dx 3.100 dy 0.000 dz 2.850|     mode or for pinned measurements (X13)  |
|   (card: Product (X1);       |          +---------------------------+                                            |
|    offset group: Ceiling /   |                                                                                   |
|    floor v (X10))            |                                               +-------------------+               |
| + Add Wall Section           |                                               | camera preview    |               |
| MESH OPTIONS / DISPLAY / IDS |                                               +-------------------+               |
| CAMERA FRUSTUM PREVIEW       |                 +- toasts (S07 Notifier, bottom centre) -+                        |
|   ... pose ...               |                                                                                   |
|   LENS & MOIRE      (X3, X9) |                                                                                   |
| SCENE PROPS                  |                                                                                   |
| TOOLS               (X13)    |                                                                                   |
|  [Measure distances (M)]     |                                                                                   |
| STAGE & POWER       (X2)     |                                                                                   |
| EXPORT                       |                                                                                   |
|  [ZIP] [Panel IDs] [OBJ] ... |                                                                                   |
|  [Screenshot v] [Spec sheet] |                                                                                   |
|  [Stage pack v] [Plan (SVG)] |                                                                                   |
+------------------------------+-----------------------------------------------------------------------------------+
```

Project-section additions (rows inside spec 07's `ProjectPanel` markup; each id has exactly one owning module):

| Control | Element | Owner | Type | Behaviour | States |
|---|---|---|---|---|---|
| Client | `#project-client` | `ui/ProjectPanel` (spec 07, amended in T12.2) | text input, `maxlength=80` | On `change`: `session.setClient(raw)` (trim, strip controls); history "Edit client" | empty by default |
| Notes | `#project-notes` | `ui/ProjectPanel` (amended in T12.2; spec 07's existing `project.notes` field gains its UI) | `<textarea rows=3 maxlength=4000>` | On `change`: `session.setNotes(raw)`; history "Edit notes" | empty by default |
| Templates | `#project-templates` and the popup `#templates-menu` | `ui/TemplatesMenu` | menu button (`aria-haspopup="menu"`, `aria-expanded`) plus a `role="menu"` list (§3.5 menu keys) | Lists the templates (§3.6). Its last entry is "Curved volume…", which opens spec 07's `Dialog`. | Templates that need X10 are not listed until X10 lands. |
| Share | `#project-share` | `ui/ShareControls` | button | Encodes the project and copies the URL (X7) | `aria-busy` and `disabled` only while an encode is running. Toasts: success "Link copied (1,240 characters). Client, notes, logos and the HDRI file are not included."; warning above 8,000 characters; error when the stage cannot fit a link ("Use Save Project instead"). |
| Units | `#units-toggle` | `ui/UnitsToggle` | two-state `<button role="switch" aria-checked>` labelled `m` and `ft` | X14 | Per-browser preference (`prefs.units`). Never changes project data. |

Toasts and dialogs use spec 07's `Notifier` and `Dialog` directly (`notifier.warn(...)`, `dialog.open(...)`). Static rule S3 (no `alert`/`confirm`/`prompt`) applies.

**Share banner placement.** `#share-banner` is the second child of spec 07's top-centre stack `#viewport-top-stack` (the restore banner, the share banner, then spec 01's legend; 07 C51). The stack follows `#pilot-info` and `.brand-watermark` in the DOM and shifts to `top: 72px` while the pilot banner shows, so the two banners in the wireframe above never overlap each other or the pilot banner.

### 3.2 X1: product picker in the section card

```
+--------------------------------------------------------+
| *  Wall 1                                    [x] [v]   |
|    12x6 * 2112x1056px * Concave                        |
+--------------------------------------------------------+
| Section Name   [Wall 1                            ]    |
| Product        [ROE Visual - Black Pearl BP2V2   v]    |
|                2.84 mm * 500x500 mm * 176x176 px       |
|                9.35 kg * 190 W max / 95 W avg [Unlink] |
| Columns [12]                 Rows [6]                  |
| Width (mm)  [500] (linked)   Height (mm) [500] (linked)|
| Pixels X    [176] (linked)   Pixels Y    [176] (linked)|
| Angle Between Panels (deg) [2.0]   Heading Change [0]  |
|   Concave (+2 deg) - product range -0..+10 deg  OK     |
| Panel Color  (swatches)                                |
| > Transform Offset (spec 02)  ... [Ceiling / floor v]  |
+--------------------------------------------------------+
```

| Control | Element | Type | Values | Default | Behaviour |
|---|---|---|---|---|---|
| Product | `select.section-product` (`data-field="productId"`) | `<select>` with `<optgroup>` per manufacturer | `""` = "Custom (no product)", then the products of `listProducts({surface: role})`, sorted by manufacturer and model, where `role = sectionRole(currentLayout, i)` (§6.1: `wall`, `ceiling` or `floor`). A currently linked product of another surface stays visible as one extra option suffixed "(other surface)". | `""` | `wallController.setSectionProduct(section, id)`, then the card write-back (below). One rebuild, one history entry. |
| Linked fields | the 4 existing number inputs | `readonly` plus class `.linked` and a chain icon | n/a | n/a | Read-only only in the `linked` state (table below). Focusing one shows the hint "Unlink the product to edit". |
| Unlink | `button.section-unlink` | button | n/a | n/a | `wallController.unlinkProduct(section)` sets `productId = null` and keeps the values. No rebuild (geometry is unchanged); one history entry. |
| Re-apply | `button.section-reapply` | button | n/a | n/a | Shown only in the `diverged` state. `wallController.reapplyProduct(section)` writes the catalogue values (one rebuild, one history entry). |
| Product summary | `div.section-product-summary` | text | `${pitch} mm • ${w}×${h} mm • ${px}×${py} px` and `${kg} kg • ${pmax} W max / ${pavg} W avg` | n/a | Written with `textContent` only. `title` = the source URL and retrieval date. |
| Curve check | the existing `.curve-hint` gains a suffix span | text | `product range −${convex}..+${concave}°` plus `OK` or `OUT OF RANGE` (`--color-warning`) | n/a | From `StageChecks` C1 (§6.13) via `STAGE_ESTIMATES_CHANGED` |
| Custom cabinet data | `input[data-field="cabinet.weightKg"]`, `cabinet.powerMaxW`, `cabinet.powerAvgW` | number | weight 0.1-500 kg (step 0.01); power 1-5000 W (step 1); avg ≤ max | empty (null) | Shown only when no known product is linked (collapsed under "Cabinet data (optional)"). Empty means unknown. `wallController.setSectionCabinet(section, field, raw)`: no rebuild, estimates refresh, one history entry (coalesced per field). |

**Link states** (`linkState(section)`, §6.1):

| State | Condition | Fields | Summary and buttons |
|---|---|---|---|
| `custom` | `productId === null` | editable | no summary; "Cabinet data (optional)" group |
| `linked` | known product and stored values equal the catalogue | read-only `.linked` | summary; [Unlink] |
| `diverged` | known product and stored values differ (an edited catalogue, or a hand-edited file) | editable, not `.linked` | "Values differ from BP2V2" plus the summary; [Re-apply product] [Unlink]; check C2 (info) |
| `unknown` | `productId` not in `PANEL_PRODUCTS` (newer catalogue, unverified candidate id, typo) | editable | "Unknown product `xyz` (values kept)"; the select shows a disabled option `xyz`; [Unlink]; check C2 (info) |

**Multi-selection (spec 02 batch panel).** `SectionBatchPanel` gains `select.batch-product` with the same options, filtered to products whose surfaces cover every selected section's role. It shows a disabled "Mixed" first option when the selected sections disagree. A choice calls `wallController.batchSetProduct(ids, id)` on the **editable** selected sections (spec 02's lock rule): one rebuild and one history entry "Product: <model> (N sections)", whatever N is.

**Write-back after `setSectionProduct`** (the PR4 pattern of ARCHITECTURE 6.4, applied to four fields at once):
1. `wallController.setSectionProduct(section, id)` updates the model (§6.1).
2. `SectionListPanel` writes `input.value` for `panelWidth`, `panelHeight`, `ledX`, `ledY` from the model, applies the link state, and updates the summary.
3. `#patchCard(section)` refreshes the curve hint, the header summary (`12x6 * 2112x1056px`), the 4K box and the title warning, exactly as for a field edit.
4. `wallController.commitSectionEdit()` runs `publishStats()` and P1 once, then `history.record('Product: <model> (<name>)')`.

If spec 02's card has landed, these rows are added to it with the same ids and the same write-back. Otherwise they go into the legacy template, with `escapeHtml` (S07-D7, B-M4) for every interpolated value.

### 3.3 X2: "Stage & Power" sidebar section

Placed after "Tools" (X13; after "Scene Props" when X13 is absent), before `.export-section`. It is owned by the new `ui/StagePanel.js`.

```
STAGE & POWER
 Cabinets ............ 200              Area ............ 50.00 m2
 Weight .............. 1,870 kg         Heaviest column . 93.5 kg (10 high; hang limit 20)
 Power max / avg ..... 38.0 / 19.0 kW   Heat (max) ...... 129,661 BTU/h
 Current ............. 173.9 A @ 230 V 1-ph
 Circuits ............ 15 x 16 A (80 %), 14 cabinets per circuit
 Data ................ 16 ports, 13 cabinets/port @ 10-bit 60 fps
 Processors .......... 1 x Brompton Tessera SX40 + 2 x XD (9.0 Mpx nominal)
 Canvas .............. 3520 x 1760 px (fits 4096 x 2160)
 ------------------------------------------------------------------
 Supply [230 V v]  Phases [1 v]  PF [0.95]  Breaker [16] A  Derate [80] %  Basis [Max v]
 [Regional defaults v]
 Processor [Brompton Tessera (1G port) v]  Bit depth [10 v]  Frame rate [60] fps
 Rigging [Hang v]
 ------------------------------------------------------------------
 CHECKS (2)
  [!] Wall 2: 12.0 deg per joint exceeds BP2V2 concave limit 10 deg
  [i] Wall 3: no cabinet weight/power - totals exclude 24 cabinets
 Estimates only. Confirm with manufacturer datasheets, the processor vendor's
 tools and a qualified rigger/electrician.
```

| Control | Id | Type | Range / options | Default | Units |
|---|---|---|---|---|---|
| Supply voltage | `#stage-voltage` | `<select>` plus "Custom…" (reveals a number field 90-480) | 120, 208, 230, 240, 400 | 230 | V. For 3-phase this is line-to-line. |
| Phases | `#stage-phases` | select | 1, 3 | 1 | n/a |
| Power factor | `#stage-pf` | number, step 0.01 | 0.50-1.00 | 0.95 | n/a |
| Breaker rating | `#stage-breaker` | number, step 1 | 1-400 | 16 | A |
| Derating | `#stage-derate` | number, step 1 | 50-100 | 80 | % of the breaker rating, for continuous load |
| Basis | `#stage-basis` | select | `max`, `avg` | `max` | which power figure sizes the circuits |
| Regional defaults | `#stage-region` + `#stage-region-menu` | menu button (§3.5 menu keys) | `eu-230` "Europe / UK: 230 V 1-ph, 16 A"; `na-120` "North America: 120 V 1-ph, 20 A"; `na-208-3ph` "North America: 208 V 3-ph, 20 A" | n/a (an action, not a state) | Writes voltage, phases and breaker through `stageController.applyRegionDefaults(id)`: one history entry "Stage: <region> defaults". The unit preference (X14) never changes these values. |
| Processor | `#stage-processor` | select | `ProcessorCatalog` ids | `brompton-tessera-1g` | n/a |
| Bit depth | `#stage-bit-depth` | select | 8, 10, 12 | 10 | bits per colour |
| Frame rate | `#stage-fps` | number, step 0.001 | 23.976-240 (the schema uses the same range) | 60 | fps |
| Rigging mode | `#stage-rigging` | select | `hang`, `stack` | `hang` | n/a |
| Readouts | `#stage-cabinets`, `#stage-area`, `#stage-weight`, `#stage-column-load`, `#stage-power`, `#stage-heat`, `#stage-current`, `#stage-circuits`, `#stage-data`, `#stage-processors`, `#stage-canvas` | `<span>` (`textContent`) | n/a | `—` when unknown | n/a |
| Checks | `#stage-checks` | `<ul>` (`textContent` per `<li>`; class `.check-error`, `.check-warn` or `.check-info`, coloured with `--color-danger`, `--color-warning`, `--color-text-secondary`) | n/a | empty: "No issues found" | n/a |

Every setting control calls `stageController.setSetting(path, raw)`, which writes the clamped value back to the input (PR4), refreshes the estimates and records one history entry (coalesced per path).

**Feedback.**
- When some sections lack cabinet data, the weight and power readouts show the known part plus a suffix: "(excl. 24 cabinets)".
- When no section has data, they show `—` and the hint "Pick a product or enter cabinet data".
- When a cabinet alone exceeds one circuit, one data port or the processor family's receiver-card limit (checks C10, C11), `#stage-circuits` or `#stage-data` and `#stage-processors` show `—`, and the check names the section.
- When the frame rate is not 60 fps, the data line says "(estimated)" unless the processor profile carries a vendor value for that rate (§6.2).
- Every number re-computes on `STAGE_ESTIMATES_CHANGED`, which is emitted in P1 step 5a and after every stage or cabinet use case.

### 3.4 X3 and X9: "Lens & Moiré" block (inside "Camera Frustum Preview")

Inserted below the rotation inputs, above `.frustum-status`. It is owned by the new `ui/LensMoirePanel.js`, so `CameraPanel` stays unchanged. Because it sits inside `#camera-preview-options`, it is visible exactly when the camera preview is on.

```
LENS & MOIRE
 Sensor width (photosites) [4448]   (ARRI LF: 4448 x 3096 photosites)
 Focus  (o) On wall   ( ) At [3.00] m          T-stop [2.8]
 Distance to wall (frame centre) .... 5.00 m  (Wall 1)
 Nearest visible wall point ......... 5.00 m
 LED pitch on sensor ................ 20.0 um = 2.43 photosites per LED pixel
 Defocus blur ....................... 2.95 LED pixels
 Moire risk ......................... LOW (wall defocused)
 Risky in-focus distances ........... 3.05 m - 17.3 m
 Human viewing distance ............. >= 2.8 m comfortable, >= 9.8 m pixels invisible
 [x] Show inner frustum   Overscan [10] %    Inner frustum: 2.87 Mpx on 1 section
```

| Control | Id | Type | Range | Default | Notes |
|---|---|---|---|---|---|
| Sensor width in photosites | `#camera-photosites-h` | number, step 1 | 100-20000 | From `SENSOR_PHOTOSITES[filmback].h` (Appendix B), otherwise empty | Empty means "unknown": the readouts show "Enter sensor photosites". Editing it marks the value as custom. Changing the filmback preset replaces it again (`CameraController.setFilmback`). The hint shows `${shortName}: ${h} x ${v} photosites` from the table (never computed from the aspect). |
| Focus mode | `input[name="camera-focus-mode"]` (`wall` / `distance`) | radio | n/a | `wall` | `wall` means focus at the frame-centre wall distance (the worst case) |
| Focus distance | `#camera-focus-distance` | number, step 0.01 | 0.1-1000 | 3.00 | m. Enabled only in `distance` mode. |
| T-stop | `#camera-t-stop` | number, step 0.1 | 0.7-32 | 2.8 | Treated as the f-number in the blur formula (T ≥ f, which is conservative) |
| Readouts | `#moire-distance`, `#moire-nearest`, `#moire-led-on-sensor`, `#moire-defocus`, `#moire-risk`, `#moire-band`, `#moire-viewing` | text | n/a | `—` | The risk badge has classes `.risk-low`, `.risk-medium` and `.risk-high` (spec 06 role tokens `--color-success`, `--color-warning`, `--color-danger`). `#moire-nearest` is filled from T9.1 on and shows `—` before. |
| Inner frustum | `#toggle-inner-frustum` | `<div class="toggle" role="switch" aria-checked>` (spec 07 switch pattern) | on/off | off | X9 overlay and pixel count |
| Overscan | `#inner-frustum-overscan` | number, step 1 | 0-100 | 10 | % total linear image-space enlargement (§6.5, Q6) |
| Inner-frustum readout | `#inner-frustum-pixels` | text | n/a | `—` | "2.87 Mpx on 1 section". Shows "— (turn on Show inner frustum)" while the toggle is off, because the pixel area is computed only then (§6.5). Updates at the end of a section drag (P1), while the overlay itself follows the drag live. |

**States.**
- Preview off: the whole block is inside `#camera-preview-options`, which is already hidden.
- Camera not aimed at the wall (spec 08 status `offWall`, `D0 === null`): the readouts show "Not aimed at wall" (the same text as `#frustum-status-text`) and the risk badge shows "n/a".
- The distance and the section come from T3.2's centre-hit helper (§6.3): the nearest panel hit of the centre ray. When the centre ray hits no panel, they come from the column plane that spec 08's `D0` rule selects, and the distance gets the suffix "(plane)".

### 3.5 X4, X11, X12, X15: export additions

```
EXPORT
 [Export All (ZIP)]
 [Export Panel IDs]
 [Export OBJ]  [Export glTF]
 [Screenshot v]          -> menu: Viewport 1x | Viewport 2x | Viewport 4K (3840 wide) | Camera view (filmback aspect)
                                  [x] Hide grid and markers  [ ] Include planning overlays  [ ] Include debug views
                                  Morph watermark: ( ) None  (o) Camera view only  ( ) All stills
 [Spec sheet (PDF)]
 [Stage pack v]          -> menu: Unreal nDisplay | Disguise | Generic (glTF + OBJ)
 [Plan (SVG)]   (X15)
```

(The JSON save/open buttons move to spec 07's Project section; their ids are unchanged.)

| Control | Id | Type | Options | Default | Behaviour |
|---|---|---|---|---|---|
| Screenshot | `#export-screenshot` + `#screenshot-menu` | menu button | `viewport-1x`, `viewport-2x`, `viewport-4k`, `camera-view` (`menuitem`) | n/a | Viewport stills download `${brand.filePrefix}-viewport-${w}x${h}.png`. `camera-view` downloads spec 07's camera-frame name `${brand.filePrefix}-camera-${focal}mm-${w}x${h}.png`; it is disabled when the camera preview is off ("Enable Camera Preview first"). |
| Screenshot options | `#screenshot-hide-chrome`, `#screenshot-overlays`, `#screenshot-debug` (`menuitemcheckbox`, `aria-checked`); `input[name="screenshot-watermark"]` (`menuitemradio`: `none`, `camera`, `all`) | checkboxes and a radio group inside the menu | hide grid, axes and feature markers (the gizmo is never in a still) / include planning overlays (frustum, safe zone, inner frustum, measurements) / include spec 01's debug views (normal lines, `LAYERS.DEBUG`) / watermark scope | on / off / off / `camera` (Q7) | They apply to **viewport** stills. Camera-view stills always use spec 07's still mask (`DEFAULT \| ENVIRONMENT`), like the film camera sees, and only the watermark option applies to them. Persisted per browser in spec 07's prefs store (`prefs.screenshot`), never in `localStorage` directly (static rule S2). |
| Spec sheet | `#export-spec-sheet` | button | n/a | n/a | Builds `#print-root`, waits for every image to decode, then `win.print()`. The user chooses "Save as PDF". Fallback in §3.10. |
| Stage pack | `#export-stage-pack` + `#stage-pack-menu` | menu button | `unreal-ndisplay`, `disguise`, `generic` | n/a | Downloads `${brand.filePrefix}-stage-pack-${target}.zip`. The button ships only with T11.1, which lands after F1 and F4 (§10), so it is never shown with legacy exporter profiles. |
| Plan | `#export-plan-svg` | button | n/a | n/a | Downloads `${brand.filePrefix}-plan.svg` (X15) |

Spec 07's own `#export-camera-frame` button (S07-R4) keeps its behaviour and its output exactly: no watermark, mask `DEFAULT | ENVIRONMENT`. The Screenshot menu's "Camera view" item shares its rendering (`PreviewPass.captureCanvas`, §6.7) and adds only the watermark preference.

**Menu keyboard and pointer behaviour** (every `role="menu"` of this spec: screenshot, stage pack, templates, regional defaults, the X10 "Ceiling / floor" menu). One helper, `ui/MenuButton.js bindMenuButton(button, menu, {onSelect, onToggle})`, implements it with spec 07's `bindScopedKeys` (no raw `keydown` listener, rule S5):
- The button has `aria-haspopup="menu"` and `aria-expanded`. Click, Enter or Space toggles the menu; ArrowDown on the button opens it and focuses the first item (scope `menu-button`).
- Inside the menu (scope `menu`): ArrowDown / ArrowUp move focus with wrap-around; Home / End go to the first / last item; Enter or Space activates a `menuitem` (and closes the menu) or toggles a `menuitemcheckbox` / selects a `menuitemradio` (the menu stays open); Escape closes the menu and returns focus to the button (the `menu` scope consumes Escape, step 2 of spec 07's Escape chain); Tab closes the menu and lets focus move on.
- A pointer-down outside the menu and its button closes it. Disabled items have `aria-disabled="true"` and are skipped by the arrow keys.
- Spec 07's movement guard already blocks `[role=menuitem]` targets, so arrow keys in a menu never pan the orbit target.

Errors use toasts (`notifier.warn` / `notifier.error`):
- "Screenshot reduced to 8192×4608: GPU limit".
- "Stage pack: Wall 3 spans 185° (a single render frustum cannot cover ≥ 180°): split the section".

### 3.6 X6: templates menu and curved-volume dialog

Templates (descriptors in `js/domain/StageTemplates.js`, turned into wall keys by `app/TemplateController`):

| Id | Name | Contents | Needs |
|---|---|---|---|
| `flat-6x3` | Flat wall 6 × 3 m | BP2V2 12 × 6, flat | X1 |
| `corner-l` | L-shaped corner | Back 12 × 6, side 8 × 6 at +90° | X1 |
| `curved-270-d20` | Curved volume 270°, Ø 20 m, 6 m high | Generated by `designArc` (two sections of 47 × 12) | X1, X6 |
| `curved-180-d12-ceiling` | 180° volume, Ø 12 m, with ceiling | Arc plus a detached ceiling section placed by X10's "Ceiling: fit to volume" | X10 |
| `car-process-u` | Car process U (back, two returns, ceiling) | 3 chained sections plus a fitted ceiling | X10 |
| `xr-wall-floor` | XR stage: wall and floor | BP2V2 wall plus a BM4 floor placed by "Floor: snap to wall front" | X10 |

**Loading a template replaces the wall only.** The menu entries read "<name> (replaces the wall)", and the menu's footer line says "Camera, props, display and HDRI are kept". `templateController.load(id)` builds the template's wall keys (`sections`, optional `mesh_mode`) and calls `session.applyWallScope(wallKeys, {reason: 'template', templateId: id})` (§5.3): spec 07's wall-scope merge (the live `capture('history')` with `sections` and `mesh_mode` replaced, the live pivot and UV settings kept, `project.template_id` set), validation, then `apply(v2, {reason: 'template', scope: 'wall'})`, and one `history.record('Template: <name>')`. Camera pose and lens, props, display, panel-ID style, the loaded HDRI and the logo library stay as they are. Section logos do not carry over (the template's sections are new sections). The wall is framed as for `new` (spec 07 6.14). There is **no confirmation**: like spec 07's New, the load is undoable, and the toast says so ("Loaded template "Flat wall 6 × 3 m". Press Ctrl+Z to go back.").

Curved-volume dialog: spec 07's `Dialog.open({title: 'Curved volume', body: curvedVolumeForm.element, actions: [{id: 'apply', label: 'Apply', primary: true}, {id: 'cancel', label: 'Cancel'}]})`. The body is a live form owned by `ui/CurvedVolumeForm.js`:

```
CURVED VOLUME
 Mode      (o) Replace wall   ( ) Append after the last chain section
 Product   [ROE BP2V2 v]        (Custom: panel width [500] mm, pixels [176])
 Size by   (o) Radius [10.00] m   ( ) Diameter [20.00] m
 Arc       [270] deg            Height [6.00] m  ->  12 rows = 6.00 m
 Symmetric about the stage axis  [x]      (disabled in Append mode)
 ------------------------------------------------------------
 Result: 94 columns x 12 rows, 2.865 deg per joint, arc 269.31 deg
         2 sections (47 + 47), radius 10.000 m (face 9.997 m)
         1,128 cabinets, 10,547 kg, 214.3 kW max
         [!] none
                                                     [Apply] [Cancel]
```

| Field | Id | Range | Default |
|---|---|---|---|
| Mode | `input[name="cv-mode"]` (`replace` / `append`) | radio | `replace` |
| Product | `#cv-product` | catalogue (`listProducts({surface: 'wall'})`) or custom | first verified wall product |
| Custom panel width | `#cv-panel-width` | 50-5000 mm | 500 |
| Radius / diameter | `#cv-radius`, `#cv-diameter` (kept in sync) | radius 1-200 m | 10 |
| Arc | `#cv-arc` | 1-359° | 270 |
| Height | `#cv-height` | 0.1-50 m, rounded to whole rows (≤ 20 per section) | 6 |
| Symmetric | `#cv-symmetric` | checkbox | on. **Disabled and shown unchecked in Append mode**, with the title "Append continues the current heading of the chain". Switching back to Replace restores the previous value. |

The result updates live. "Apply" calls `wallController.applyCurvedVolume(design, {mode})`, which records one history entry. Replace swaps the sections (symmetric or starting at heading 0); Append adds them after the last non-detached section, continuing its end heading (§6.4). Escape triggers `cancel` (spec 07's `Dialog`).

### 3.7 X10: "Ceiling / floor" presets in the section card

The presets live inside spec 02's "Transform Offset (moves only this section)" group, after its Detached checkbox. They only write spec 02 fields (Detached, Angle Between Panels, Columns, Rows, the six offset fields and the rotation origin), so everything stays editable afterwards and nothing new is persisted.

| Control | Element | Type | Items | Behaviour |
|---|---|---|---|---|
| Ceiling / floor | `button.section-volume-presets` + popup `.section-volume-menu` (`role="menu"`, §3.5 keys) | menu button, label "Ceiling / floor ▾" | `ceiling-fit` "Ceiling: fit to volume", `ceiling-top` "Ceiling: snap to wall top", `floor-fit` "Floor: fit to volume", `floor-front` "Floor: snap to wall front" | `wallController.applyVolumePreset(section, kind)` (§6.6): one model write set, one rebuild, one history entry "Ceiling: fit to volume (<name>)" |

**Behaviour.**
- **Fit presets** (`ceiling-fit`, `floor-fit`) tick Detached, set Angle Between Panels to 0, set the rotation origin to Bottom centre, fit Columns and Rows to the volume (≤ 50 × 20), and write the six offset fields. The values are computed from the generative bounds of the **non-detached** sections (`chainGenerativeBounds`, §6.6), so the result never depends on other ceilings or floors.
- **Snap presets** (`ceiling-top`, `floor-front`) are enabled only on a detached section whose LED face is horizontal (`|n.y| > 0.9`). "Snap to wall top" changes only Y Up; "Snap to wall front" changes only the horizontal offset (X Along / Z Out) so that the floor starts at the front lip of the volume.
- **Following sections.** If the section was not detached, ticking Detached removes it from the chain and the following chain sections close the gap (spec 02's rule). The menu items' `title` says so, and the toast "Wall 4 is now a detached ceiling; the following sections moved up the chain" appears only when a following section actually moved. Applied to a section that is already detached, or to the last section, a preset never moves another section.
- **Pivot independence.** Offsets are expressed in the section's own generative frame (spec 02 §6.3, §6.5), which translates with the wall, so a later pivot change (spec 03, any mode) moves the ceiling with the wall. Nothing is stored in the stage frame.
- **One-shot.** The preset is not remembered. After editing the chain, run it again; check C9 reports when a fitted ceiling or floor no longer covers the volume.
- The menu is disabled (with a title) when the section is locked (spec 02 3b). It is not rendered before spec 02 3a and T17 (Detached) have landed.

### 3.8 X13: measurement tool

| Control | Element | Behaviour |
|---|---|---|
| Measure button | `#tool-measure` in a new sidebar `global-section` "Tools" (owner `ui/ToolsPanel.js`), placed after "Scene Props" | A `.view-btn`-style toggle button "Measure distances (M)" with `aria-pressed`. It sits in the sidebar, outside the canvas rect, so no canvas screenshot changes (AC3). |
| Mode hint | `#measure-overlay .measure-hint` | Shown only while measure mode is active: "Measure: click two points • Shift: no snapping • Esc: exit". Hidden (`display: none`) otherwise, so the default canvas is unchanged. |
| First click | canvas | Sets A at the snapped point (wall vertex, panel centre, floor or camera). |
| Second click | canvas | Sets B. The measurement stays visible until the next click. A third click starts a new measurement. |
| Hover | canvas | A preview line from A to the cursor, plus a snap marker. |
| Shift held | during hover or click | Disables snapping. The free hit on the wall or floor is used. |
| Escape | keyboard (KEYMAP) | Cancels the in-progress point, or leaves measure mode if nothing is in progress (§3.9). |
| Label | `#measure-overlay .measure-label` | `4.212 m`, plus a second line `Δx 3.100 Δy 0.000 Δz 2.850 • horiz. 4.211 m`, formatted in the current unit system at display time. Positioned by the label pass (§5.7), so it follows camera moves under spec 07's render-on-demand. |
| Pin | `button.measure-pin` inside the current label | `measurementController.pin(current)`: stores the two points in `project.measurements` (saved, undoable). Refused with a warning toast at 50 pinned measurements. |
| Remove pinned | `button.measure-unpin[data-id]` inside each pinned label | `measurementController.unpin(id)` |

**Interaction rules.**
- Clicks use spec 07's click rule (pointer travel < 4 px, left button; S07-I2), so orbit drags still work in measure mode.
- **Gizmo.** Entering measure mode clears the gizmo mode (the `TransformControls` root is detached, so its handles receive no pointer events) and keeps the selection. Leaving measure mode does not restore the mode. The `G`, `R` and `L` actions leave measure mode first and then do their usual job.
- **Pilot.** `measure.toggle` is `notInPilot`; entering pilot leaves measure mode. Pinned labels and lines are helpers, so they are hidden in pilot (spec 07 Q7).
- **Range.** A point whose coordinates exceed ±100,000 m (a grazing floor hit far away) is not placed; the hint flashes "Point out of range". So every stored value lies inside the schema range (§4.2, reachability).

### 3.9 Keyboard shortcuts

This spec attaches **no `keydown` listener** (spec 07 static rule S5). It adds rows to spec 07's `KEYMAP` (`interaction/Keymap.js`) and registers its actions with `viewportInput.registerActions({...})`; `keymap.test.mjs` (S6) checks uniqueness.

**Conflict check against spec 07 §3.8 (global scope; 3.8 is the final `KEYMAP`, C44).** Taken: `G`, `R`, `L`, `P`, `Esc`, `W A S D` and arrows, `Q`/`E`, `mod+Z`, `mod+Shift+Z`, `Ctrl+Y`, `mod+S`, `mod+O`, `F`, `?`, `N` and `Shift+N` (F1), `U` (F4), `Delete`/`Backspace`, `mod+A`, `mod+D`, `[` and `]` (F2), `O` (F3), `H`, `Shift+H`, `Comma`, `Period` (F5). `M` is free (`KeyboardState` records `KeyM` but never reads it).

| Chord | Scope | Action id | Action | Flags | Owner |
|---|---|---|---|---|---|
| key `'m'` (letters match by `e.key`, case-insensitive with exact modifiers, so it follows the printed letter on AZERTY and Dvorak; 07 C43) | global | `measure.toggle` | Toggle measure mode (X13) | `notInPilot`, `viewportOnly` not set (works with sidebar focus, like `G`); ignored while typing (`core/typingTarget.js`); no repeat | X13 |
| `Esc` | global | `escape` (unchanged) | The measure step **registers** with `viewportInput.registerEscapeHandler(40, () => measure.active && measure.cancel())` (07 3.8, C42) instead of editing the `escape` action: it runs after the gizmo-drag (80), reorder (75), popover (70) and pilot (60) steps and before deselect (0), and cancels the pending measure point, or leaves measure mode. With measure mode off it returns `false`, so the chain is unchanged and no golden changes. | as spec 07 | X13 (T13.2) |
| `ArrowDown`, `Enter`, `Space` | `menu-button` (widget) | open, focus first item | §3.5 | - | P09 |
| `ArrowUp`, `ArrowDown`, `Home`, `End`, `Enter`, `Space`, `Esc`, `Tab` | `menu` (widget) | move, activate, close | §3.5; consumes `Esc` | - | P09 |

Undo and redo chords are spec 07's (spec 04 scopes them to the UV viewer when it has focus); this spec adds none. No shortcut is added for screenshots, the spec sheet or templates, to avoid browser conflicts (`Ctrl+P`, `Ctrl+N`).

The shortcut help is spec 07's `ShortcutHelp`, generated from `KEYMAP`, so the `M` row appears there automatically. If spec 07 I1 has not landed when T13.2 does, T13.2 waits (X13 depends on S07-I1).

### 3.10 Empty and error states (summary)

| Situation | Behaviour |
|---|---|
| A project references an unknown `product_id` (newer catalogue, unverified candidate, typo) | Values are kept. The card shows the `unknown` state (§3.2). StageChecks reports C2 (info). |
| A linked section's stored values differ from the catalogue | The `diverged` state: editable fields, "Values differ from <model>", [Re-apply product]; C2 (info). |
| A linked product does not match the section's surface (a floor tile on a vertical section) | Check C13 (warn) names the section and the product's surfaces. |
| Estimates without data | `—` and a hint. They never show 0 kW for unknown power. |
| A cabinet alone exceeds a circuit, a data port or the receiver-card limit | `—` in the affected readouts; check C10 or C11 (error) names the section. |
| Moiré inputs incomplete | "Enter sensor photosites" or "Not aimed at wall". |
| Share link invalid, too large or too new | `notifier.error('This link is invalid, too large, or was made by a newer version.')`. No banner; the current project stays. Decoding stops at the inflate cap (§6.8), so a crafted link cannot hang the tab. |
| Share link valid | Non-modal banner "Open shared stage "<name>" (N sections)? [Open] [Keep mine]". Nothing is applied before Open. Validator `budget` warnings add "(large stage: may be slow)". The hash is cleared after either choice. |
| A new share link is pasted into an open tab (only the hash changes) | `hashchange` runs the same decode; the banner is replaced by the new one. |
| Share link too long | Above 8,000 characters: a warning toast ("may be truncated by chat apps"). Above 65,536 characters (encoded) or 1 MiB of JSON: refused ("Use Save Project instead"). |
| Storage unavailable or full | Spec 07's autosave states. Screenshot preferences fall back to their defaults. |
| Screenshot above GPU or canvas limits | Clamped, with a toast (§6.7). |
| Print unsupported (`typeof win.print !== 'function'`, decided synchronously in the click handler) | The click handler opens the tab first (`tab = win.open('', '_blank')`, before any `await`, so popup blockers allow it); if `tab` is null, an error toast says "Allow pop-ups to open the spec sheet". After every image has decoded, the tab receives a document built with DOM APIs (no `document.write`): `<link rel="stylesheet">` elements for `css/02-tokens.css` and `css/21-print.css` (absolute URLs from `doc.baseURI`, `media="all"`) and a deep clone of `#print-root` (`tab.document.importNode`). An info toast says "Use your browser's print or share menu to save the PDF". |

---

## 4. Data model

### 4.1 Domain changes (pure layer)

```js
// js/domain/CabinetData.js (new value object; deep-copied, never shared)
export class CabinetData {
  weightKg = null; powerMaxW = null; powerAvgW = null;   // each number | null (null = unknown)
  static from(raw)          // tolerant: invalid -> null; never throws; always a fresh instance
  clone()
  get isEmpty()             // all three null
}

// js/domain/WallSection.js (SECTION_FIELDS gains 'productId' and 'cabinet', appended after spec 02's fields)
productId = null;                                       // string | null
cabinet   = CabinetData.from(fields.cabinet);           // own instance
get pitchMm()        // { x: panelWidth / ledX, y: panelHeight / ledY }  (derived, never stored)
// clone({id, name}) (spec 02) deep-copies cabinet.
// Wall.appendLikeLast copies productId and a deep copy of cabinet from the last section
// (spec 02's rule still gives the new section an identity offset and detached = false).

// js/domain/StageSettings.js (new)
export class StageSettings {
  power   = { voltageV: 230, phases: 1, powerFactor: 0.95, breakerA: 16, derating: 0.8, basis: 'max' };
  data    = { processorId: 'brompton-tessera-1g', bitDepth: 10, frameRate: 60 };
  rigging = { mode: 'hang' };
  static LIMITS         // per path: {min, max, enum?, default}; the ProjectSchema rows of 4.2 read the same table
  static REGION_DEFAULTS // frozen { 'eu-230': {voltageV: 230, phases: 1, breakerA: 16}, 'na-120': {120, 1, 20}, 'na-208-3ph': {208, 3, 20} }
  set(path, raw)        // 'power.voltageV' etc.; clamps; returns the stored value
  assign(v)             // in-place hydration for ProjectSession.apply (validated input only)
}

// js/domain/CineCamera.js
photositesH = null;        // integer | null   (sensor width in photosites; null = unknown)
focusMode = 'wall';        // 'wall' | 'distance'
focusDistanceM = 3;        // metres
tStop = 2.8;
export const SENSOR_PHOTOSITES   // frozen { [filmbackKey]: { h, v, source } } (Appendix B); FILMBACK_PRESETS untouched
// assign() (spec 07) accepts the four new fields.

// js/domain/Project.js
// spec 07's meta = { name, notes } gains: client = '', templateId = null
DisplaySettings.innerFrustum = { enabled: false, overscanPct: 10 };
Project.production = new StageSettings();   // JSON key `production` (07 C61: "stage" already names spec 03's frame and 05's env_source value)
Project.measurements = [];   // pinned only: [{id: 'm<k>', a: {x,y,z}, b: {x,y,z}}], metres, STAGE frame of the file's own pivot; no stored label
// All parts are hydrated in place (spec 07 rule: never replaced).
```

There is no placement value object: ceilings and floors are spec 02 sections with `detached === true` and an offset (§6.6).

Writers (they are added to the domain-field-writer list that `tests/static/check.mjs` enforces):

| Field | Writers |
|---|---|
| `section.productId`, linked geometry fields | `WallController.setSectionProduct`, `batchSetProduct`, `reapplyProduct`, `unlinkProduct` |
| `section.cabinet` | `WallController.setSectionCabinet` |
| spec 02 fields written by presets (`detached`, `curveIntensity`, `panelCols`, `panelRows`, `offset`) | `WallController.applyVolumePreset`, through spec 02's own domain methods (`setDetached`, `setField`, `offset.assign`); no new writer of those fields |
| new sections from the generator | `WallController.applyCurvedVolume` |
| `project.production` | `StageController.setSetting`, `applyRegionDefaults` |
| `camera.photositesH` | `CameraController.setLensField`, `CameraController.setFilmback` (preset value) |
| `camera.focusMode`, `focusDistanceM`, `tStop` | `CameraController.setLensField` |
| `display.innerFrustum` | `CameraController.setInnerFrustum` |
| `project.meta.client`, `notes` | `ProjectSession.setClient`, `setNotes` (spec 07 module, amended) |
| `project.meta.templateId` | `ProjectSession.applyWallScope` (from `TemplateController.load`) |
| `project.measurements` | `MeasurementController.pin`, `unpin`, `translateStage` (spec 03 re-expression) |
| all of the above | `ProjectSession.apply` (open, import, template, share, undo, redo, restore) |

### 4.2 Project JSON v2 fields (rows of spec 07's field table, §4.3 of spec 07)

The envelope, key style, key order rules, variants and validator are spec 07's (§0 C1-C10, §4.2-4.4 there). **Each item adds its rows in the commit that implements it** (spec 07 §4.4 rule 4), never ahead of it:
- that commit makes the item release's **one** revision bump: its number is assigned at merge time and recorded in `ProjectSchema.REVISIONS` (n → the keys it introduced), and `KNOWN_REVISION` is set to it (07 C40, a merge-checklist item). This spec reserves no number; derived keys never bump;
- it ships the rows in `io/ProjectSchema.js`, "absent means default" with no issue, a round-trip unit test, a case in spec 07's reachability property test, and the persistence-scope declaration;
- it is its own **J** re-baseline commit (§8.2).

An older build that opens a newer file drops the keys it does not know (`dropped-unknown`, info) and shows spec 07's `newer-revision` warning ("Some settings were saved by a newer version and were ignored"). A build therefore never silently misreads a field it has not implemented, and a rejected or deferred item leaves no key behind.

| Item (landing task) | Keys added | Position (recorded in `ProjectSchema.js`) |
|---|---|---|
| X1 (T1.2) | `sections[].product_id`, `sections[].cabinet` | immediately before each section's `extensions` key |
| X2 (T2.3) | top-level `production` (renamed from revision 2's proposed `stage`, 07 C61) | after `hdri`, before `measurements` and `viewport` |
| X3 (T3.2) | `camera.sensor_photosites_h`, `focus_mode`, `focus_distance_m`, `t_stop` | after `camera.rotation_deg` |
| X6 (T6.2) | `project.template_id` | after `project.notes` (and after `client` once X12 has landed) |
| X9 (T9.2) | `display.inner_frustum` | last key of `display` (after F3's `show_pivot_marker`) |
| X12 (T12.1) | `project.client` | after `project.notes` |
| X13 (T13.1) | top-level `measurements` | after `production` (or after `hdri` when X2 is absent), before `viewport` |

Fully landed, the additions look like this (comments are documentation only):

```jsonc
{
  "version": "2.<n>", "generator": { "...": "spec 07/06" }, "format": "morph-led-project",
  "project": { "name": "Untitled stage", "notes": "", "client": "", "template_id": null },          // client: X12; template_id: X6
  "sections": [ {
      "name": "Wall 1", "id": 0, "...": "spec 07, 01, 02, 04 keys in spec 07's order", "logo": null,
      "product_id": null,                                                                           // X1
      "cabinet": { "weight_kg": null, "power_max_w": null, "power_avg_w": null },                     // X1
      "extensions": {} } ],
  "mesh_mode": "combined", "pivot": { "...": "F3" }, "uv": { "...": "F4" }, "atlas": { "...": "F4" },
  "display": { "...": "spec 07", "show_pivot_marker": true,
               "inner_frustum": { "enabled": false, "overscan_pct": 10 } },                        // X9
  "panel_id_style": { "...": "spec 07" },
  "camera": { "...": "spec 07", "rotation_deg": { "x": 0, "y": 0, "z": 0 },
              "sensor_photosites_h": null, "focus_mode": "wall", "focus_distance_m": 3, "t_stop": 2.8 },   // X3
  "props": { "...": "spec 07/05" }, "hdri": { "...": "F5" },
  "production": {                                                                                     // X2
    "power":   { "voltage_v": 230, "phases": 1, "power_factor": 0.95, "breaker_a": 16, "derating": 0.8, "basis": "max" },
    "data":    { "processor_id": "brompton-tessera-1g", "bit_depth": 10, "frame_rate": 60 },
    "rigging": { "mode": "hang" } },
  "measurements": [],                                                                                 // X13: [{ "id": "m1", "a_m": {x,y,z}, "b_m": {x,y,z} }]
  "viewport": { "...": "spec 07" }, "assets": [], "totals": { "...": "derived" }, "extensions": {}
}
```

| Path | Type | Default | Validation (spec 07 §4.7 codes) | Writers can produce (reachability) | Item | Scope | v1 import |
|---|---|---|---|---|---|---|---|
| `project.client` | string 0..80 | `""` | spec 07's string sanitizer; truncated to 80 | `maxlength=80` + the same sanitizer in `setClient` | X12 | recorded; **omitted from the `share` variant** | live value kept (wall-only) |
| `project.template_id` | null \| string | `null` | `/^[a-z0-9-]{1,64}$/`, else `null` + `defaulted` | `STAGE_TEMPLATES` ids only | X6 | recorded | live |
| `sections[].product_id` | null \| string | `null` | `/^[a-z0-9-]{1,64}$/`, else `null` + `sanitized`. A valid but unknown id is **kept** (C2), never reset. | picker values (catalogue ids) | X1 | recorded | `null` |
| `sections[].cabinet.weight_kg` | null \| number | `null` | null, or (0, 500] (`clamped`); ≤ 0 or non-finite gives `null` + `defaulted` | input 0.1-500; `setSectionCabinet` clamps to [0.1, 500] | X1 | recorded | `null` |
| `sections[].cabinet.power_max_w` | null \| number | `null` | null or (0, 5000] | input 1-5000; setter clamps | X1 | recorded | `null` |
| `sections[].cabinet.power_avg_w` | null \| number | `null` | null or (0, `power_max_w ?? 5000`] (`clamped` to `power_max_w`) | setter clamps avg ≤ max | X1 | recorded | `null` |
| `display.inner_frustum.enabled` | bool | `false` | `"true"`/`"false"` coerced | toggle | X9 | recorded (like `show_safe_distance`) | live |
| `display.inner_frustum.overscan_pct` | number (%) | 10 | [0, 100] | input [0, 100]; setter clamps | X9 | recorded | live |
| `camera.sensor_photosites_h` | null \| int | `null` | null or [100, 20000], `rounded` | input [100, 20000] step 1; preset values 4448, 8192, 6144 | X3 | recorded | live |
| `camera.focus_mode` | enum `wall\|distance` | `wall` | unknown gives `wall` + `defaulted` | radios | X3 | recorded | live |
| `camera.focus_distance_m` | number (m) | 3 | [0.1, 1000] | input [0.1, 1000]; setter clamps | X3 | recorded | live |
| `camera.t_stop` | number | 2.8 | [0.7, 32] | input [0.7, 32]; setter clamps | X3 | recorded | live |
| `production.power.voltage_v` | number (V) | 230 | [90, 480] | select values, custom field 90-480, region defaults | X2 | recorded | live |
| `production.power.phases` | enum `1\|3` | 1 | unknown gives 1 + `defaulted` | select, region defaults | X2 | recorded | live |
| `production.power.power_factor` | number | 0.95 | [0.5, 1] | input [0.5, 1] | X2 | recorded | live |
| `production.power.breaker_a` | number (A) | 16 | [1, 400] | input [1, 400], region defaults | X2 | recorded | live |
| `production.power.derating` | number (fraction) | 0.8 | [0.5, 1] | input 50-100 % divided by 100 | X2 | recorded | live |
| `production.power.basis` | enum `max\|avg` | `max` | unknown gives `max` + `defaulted` | select | X2 | recorded | live |
| `production.data.processor_id` | string | `brompton-tessera-1g` | a known `ProcessorCatalog` id, else the default + `defaulted` | select | X2 | recorded | live |
| `production.data.bit_depth` | enum `8\|10\|12` | 10 | unknown gives 10 + `defaulted` | select | X2 | recorded | live |
| `production.data.frame_rate` | number (fps) | 60 | [23.976, 240] (the UI uses the same range) | input [23.976, 240]; setter clamps | X2 | recorded | live |
| `production.rigging.mode` | enum `hang\|stack` | `hang` | unknown gives `hang` + `defaulted` | select | X2 | recorded | live |
| `measurements[]` | array ≤ 50 | `[]` | entries beyond 50 dropped with `truncated`; each entry `{id: /^m\d{1,4}$/, a_m: Vec3, b_m: Vec3}`; duplicate or invalid ids renumbered (`reassigned-id`); every component finite and in [−100000, 100000] (`clamped`), the same range as spec 07's camera positions | `MeasureTool` refuses points outside ±100,000 m; `pin` refuses a 51st entry; `translateStage` clamps to the same range | X13 | recorded | live |

No field of this spec is view-only, so all of them appear in the `history` and `autosave` variants. Stored measurements carry no label: labels are formatted at display time in the viewer's unit system (X14).

**Variant registered in spec 07's variant table (T7.1): `share`.** The columns are spec 07's:

| Variant | Logos (`assets[].storage`) | `hdri.source` (F5) | `viewport` | View-only fields (`display.show_grid`, `display.show_pivot_marker`) | Derived keys | Extra |
|---|---|---|---|---|---|---|
| `share` | none: `assets: []` and every `sections[].logo: null` (bytes cannot travel in a URL) | `null` (the HDRI file does not travel; the other `hdri` leaves do, so a recipient who relinks the same file gets the same projection, 05 3.6); a live `display.content` of `"hdri"` is written as `"color"` | omitted | omitted | omitted (recomputed on read) | `project.client` and `project.notes` omitted (Q18). `props.car.model` written as live when it names a bundled model (every build ships it); spec 05's default when it would reference a user file. |

`ProjectSession.apply(v, {reason: 'share'})` keeps the live values of the omitted view-only fields (spec 07 apply step 3 extends its `{undo, redo}` list with `share` and `template`; the `production`, `measurements`, lens and inner-frustum state is hydrated in step 3 through this spec's registered `features` hooks, 07 C41) and frames the wall as for `new` (spec 07 6.14 extends its fixed-direction list), because no `viewport` block is present. Both reasons are added to spec 07's `apply` reason list in T6.2 and T7.2. The omitted `client` and `notes` read as their defaults (empty), so opening a share never carries a colleague's commercial notes into your project.

**Product linking on read.** `panel.*` and `led_resolution.*` stay the source of truth for geometry. An edited catalogue therefore never silently changes a saved stage. `product_id` is metadata plus the link state (§3.2). If a known product's values differ from the stored geometry, the section stays as stored, the card shows the `diverged` state, and StageChecks C2 says "values differ from catalogue".

### 4.3 Migration

- **v1 files** go through spec 07's `migrateV1toV2` (wall-only scope). The section keys of this spec get their defaults (`product_id: null`, cabinet nulls). Every non-wall field of this spec (`production`, the camera lens extras, `display.inner_frustum`, `project.client`, `project.template_id`, `measurements`) keeps the **live value**, like the rest of spec 07's non-wall state. No geometry changes, so a v1 import renders exactly as before.
- **v2 files of an older revision** (written before an item landed) simply lack its keys. "Absent means default" applies with no issue, as spec 07 §4.4 requires.
- **v2 files of a newer revision** opened by an older build: the keys of items that build has not implemented are dropped (`dropped-unknown`) under the `newer-revision` warning (§4.2).

### 4.4 State outside the project file

| Key | Where | Content | Notes |
|---|---|---|---|
| `morph-led-configurator:prefs` (spec 07) | `localStorage`, through `app/Prefs.js` only (rule S2) | adds `units: 'metric' \| 'imperial'` and `screenshot: {hide_chrome: true, overlays: false, debug: false, watermark: 'none' \| 'camera' \| 'all'}` (default `'camera'`) | Per browser, never in the project. If spec 07 has not split `app/Prefs.js` out of `Autosave.js` yet, T4.1 does it (S2 already names the file). |
| `#p=<payload>` | URL fragment | shared project (§6.8) | Removed with `win.history.replaceState` (the browser API, not spec 07's `History`) after the user chooses Open or Keep mine. `replaceState` fires no `hashchange`. |

Autosave slots are spec 07's (`morph-led-configurator:autosave:v2:current` and `:previous`); this spec adds no storage key.

---

## 5. Architecture

### 5.1 Layering amendment (ARCHITECTURE.md §1.3, done in T0.2)

Add a pure layer **`js/analysis/`** for derived engineering numbers. It is not geometry generation and not file IO.

| Layer | May import (besides its own directory) | Must not import |
|---|---|---|
| `analysis/` | `domain/`, `geometry/`, `legacy/` | THREE, DOM, `io/`, `render/`, `ui/`, `app/`, `interaction/`, `theme/` |
| `app/` (amended) | adds `analysis/` | unchanged |
| `ui/` (amended) | adds `domain/Units.js` (pure formatting and parsing functions; same status as the static rule tables) | unchanged |

`io/` is unchanged: the spec sheet and the stage pack receive estimates and checks as plain data arguments.

`tests/static/check.mjs` gains the rows. **No R3 amendment**: this spec has no deferred observer. History and autosave are driven by spec 07's direct `History.record` calls at the end of each use case.

**Stylesheets.** This spec takes the numbered block **20-29**: `css/20-stage-tools.css` (stage panel, lens block, tools section, menus, banners, measure overlay) and `css/21-print.css` (print-only rules). They are linked after every other stylesheet (`01-12`, the `13`/`14` files of specs 01, 04 and 06, and `css/features/*` of specs 02, 03 and 05), hold new selectors only, and use spec 06 role tokens only. `css-slices.mjs` is limited to `01-12` (spec 01/04) or retired (spec 06 T1, spec 07 S7), whichever lands first; it never scans 20-29. The numbering collision between specs 01, 04 and 06 (all claim `13`) is outside this spec; Q17 asks the owner for a registry.

### 5.2 New modules

| Path | Layer | Class / functions (public signatures) |
|---|---|---|
| `js/domain/CabinetData.js` | domain | §4.1 |
| `js/domain/PanelCatalog.js` | domain | `export const PANEL_PRODUCTS` (deep-frozen array of **verified rows only**, Appendix A; candidate rows are documented, never shipped); `export function findProduct(id) -> Product\|null` (searches `PANEL_PRODUCTS` only, so an unverified candidate id resolves to `null`, the `unknown` state); `export function productSectionFields(p) -> {panelWidth, panelHeight, ledX, ledY}`; `export function listProducts({surface}?) -> Product[]`; `export function linkState(section) -> 'custom'\|'linked'\|'diverged'\|'unknown'` |
| `js/domain/ProcessorCatalog.js` | domain | `export const PROCESSORS`; `export function findProcessor(id)`; `export function portCapacityPx(proc, bitDepth, frameRate) -> {pixels, estimated: boolean}` (§6.2) |
| `js/domain/StageSettings.js` | domain | `StageSettings` (§4.1) |
| `js/domain/StageTemplates.js` | domain | `export const STAGE_TEMPLATES` (frozen `{id, name, requires: string[], build(ctx) -> {sections: SectionFields[], meshMode?}}`). `build` returns domain-shaped plain objects, not v2; `ctx = {designArc, fitVolume, products, curveConvention}` is injected, so domain imports neither analysis nor geometry. `requires` lists item ids (`'X10'`). |
| `js/domain/Units.js` | domain | `UnitSystem`; `formatLength(m, system, {digits})`; `formatSmallLength(mm, system)`; `formatMass(kg, system)`; `formatArea(m2, system)`; `parseLength(raw, system, {defaultUnit: 'm'\|'mm'}) -> metres\|NaN` |
| `js/geometry/VolumePresets.js` | geometry | `export function chainGenerativeBounds(layout) -> {min, max}\|null` (generative box of the non-detached sections, §6.6); `export function sectionRole(layout, i) -> 'wall'\|'ceiling'\|'floor'`; `export function fitVolumeOffset(layout, i, kind, {product}) -> {panelCols, panelRows, offset: {positionMm, rotationDeg, origin}}`; `export function snapVolumeOffset(layout, i, kind) -> {positionMm}` (§6.6). Pure; reads spec 02's `SectionLayout.frame` and `sectionBounds(i)`. |
| `js/geometry/SnapPoints.js` | geometry | `export function snapCandidates(layout, {includeCentres = true}) -> {x,y,z,kind}[]` (from spec 02's `panelQuads()`); `export function nearestWithin(cands, p, radiusM) -> cand[]`; `export function pickSnap(cands, hit, pointerPx, projectToPx, {free = false, radiusM = 0.5, maxPx = 12}) -> {point, kind}` (the projection is injected, so the module stays THREE-free) |
| `js/analysis/CenterHit.js` | analysis | `export function centerHit(layout, pose, lens) -> {sectionIndex, sectionId, distanceM, onPanel: boolean} \| null` (§6.3); uses spec 08's exported `cameraBasis` and `rayQuadHit` on `layout.columnQuads()` |
| `js/analysis/StageEstimator.js` | analysis | `export function estimateStage({project, layout, products = PANEL_PRODUCTS, processors = PROCESSORS}) -> StageEstimates` (§6.2) |
| `js/analysis/StageChecks.js` | analysis | `export function runStageChecks({project, layout, estimates}) -> Check[]`, with `Check = {id: 'C1'..'C13', level: 'error'\|'warn'\|'info', sectionId?, message}` |
| `js/analysis/MoireCalculator.js` | analysis | `export const MOIRE_THRESHOLDS` (frozen); `export function analyzeMoire({pitchMm, focalMm, distanceM, photositePitchMm, focusDistanceM, tStop}) -> MoireResult`; `export function riskyDistanceBand(...)`; `export function humanViewingDistances(pitchMm)` (§6.3) |
| `js/analysis/CurvedVolume.js` | analysis | `export function designArc({panelWidthMm, radiusM, arcDeg, rows, symmetric, curveConvention, lockStepsDeg = null}) -> ArcDesign` (§6.4) |
| `js/io/ShareLinkCodec.js` | io | `export const SHARE_LIMITS = {maxFragmentChars: 65536, maxJsonBytes: 1048576}`; `export async function encodeShare(json, {CompressionStream, btoa}) -> string`; `export async function decodeShare(fragment, {DecompressionStream, atob, TextDecoder}) -> object` (throws `ShareLinkError` with `code: 'syntax'\|'version'\|'too-large'\|'corrupt'`) (§6.8) |
| `js/io/SpecSheetModel.js` | io | `export function buildSpecSheet({project, estimates, checks, moire, coverage, images, brand, units, now}) -> SpecSheet` (plain data: header with the generator `{name: brand.jsonGenerator.name, version: APP_VERSION}` (07 C62), summary rows, section rows, images, disclaimer) |
| `js/io/StagePackExporter.js` | io | `export class StagePackExporter { constructor({brand, appVersion, gltfExporter, objExporter}); build({project, layoutExport, atlas, checks, target}) -> {files: [{path, content: string\|Uint8Array}], manifest} }` |
| `js/io/PlanSvgExporter.js` | io | `export function writePlanSvg({layout, cine?, props?, units, brand}) -> string` (X15) |
| `js/render/ScreenshotRenderer.js` | render | `export class ScreenshotRenderer { constructor({sceneManager, previewPass, canvasProbe, doc}); viewportCamera() -> THREE.PerspectiveCamera (a clone); fitCamera(view: 'front'\|'top'\|'perspective', bounds, aspect) -> THREE.Camera; capture({camera, width, height, include: {chrome, overlays, debug}, supersample = 2, watermark: HTMLImageElement\|null}) -> {canvas, width, height, clamped: boolean} }` (§6.7). Rendering is delegated to `PreviewPass.captureCanvas`. |
| `js/render/InnerFrustumView.js` | render | `export class InnerFrustumView { constructor({sceneManager, theme, builder, bus, layoutSource: () => WallLayout}); rebuild(layout); update(cine, overscanPct); setVisible(on); dispose() }` (§6.5). Subscribes `SECTION_CHANGED` (live updates). |
| `js/render/MeasureView.js` | render | `export class MeasureView { constructor({sceneManager, theme, bus, onProject}); show({a, b, hover, snapKind}); clear(); get labelPass() -> {render(scene)}; dispose() }`. Subscribes `MEASUREMENTS_CHANGED` and `PROJECT_REPLACED` (mirror: pinned lines). |
| `js/interaction/MeasureTool.js` | interaction | `export class MeasureTool { constructor({pointerRay, interaction, view: MeasureView, bus, snapper, wallMeshes, gizmo}); get active(); get current(); toggle(); exit(); cancel() -> boolean (true if something was cancelled); onPointerDown(e); onPointerMove(e); onPointerUp(e) }`. `snapper(hitPoint, pointerPx, {free}) -> {point, kind}` and `wallMeshes() -> Mesh[]` are injected closures; it imports no `geometry/` or `domain/`. |
| `js/app/StageController.js` | app | `export class StageController { constructor({project, bus, history, products, processors, layoutSource}); refresh(layout); setSetting(path, raw); applyRegionDefaults(regionId); get last() }` |
| `js/app/TemplateController.js` | app | `export class TemplateController { constructor({project, session, history, notifier, wallController, products}); list(); load(id) }` |
| `js/app/ShareLinks.js` | app | `export class ShareLinks { constructor({serializer, session, history, notifier, win, codec, exportLimits}); attach(win) (registers 'hashchange'); async copyLink(); async readFragment(hash) -> {v2, summary, issues} \| null; open(v2); keepMine() }` |
| `js/app/MeasurementController.js` | app | `export class MeasurementController { constructor({project, bus, history}); pin({a, b}); unpin(id); get id() ('measurements'); translateStage(dx, dz) }`: a spec 03 `StageAnchored` participant |
| `js/ui/MenuButton.js` | ui | `export function bindMenuButton(button, menu, {onSelect, onToggle}) -> {open(), close(), dispose()}` (§3.5; uses `bindScopedKeys` with the `menu-button` and `menu` scopes) |
| `js/ui/StagePanel.js` | ui | §3.3 (subscribes `STAGE_ESTIMATES_CHANGED`, `PROJECT_REPLACED`, `UNITS_CHANGED`) |
| `js/ui/LensMoirePanel.js` | ui | §3.4 (subscribes `CAMERA_MOIRE_CHANGED`, `CAMERA_FILMBACK_CHANGED`, `PROJECT_REPLACED`, `UNITS_CHANGED`) |
| `js/ui/TemplatesMenu.js`, `js/ui/CurvedVolumeForm.js` | ui | §3.6 (the form is the `Dialog` body) |
| `js/ui/ShareControls.js`, `js/ui/ShareBanner.js` | ui | `#project-share`; `#share-banner`, `#share-open`, `#share-keep` |
| `js/ui/UnitsToggle.js` | ui | `#units-toggle` |
| `js/ui/ToolsPanel.js` | ui | the "Tools" `global-section` and `#tool-measure` (subscribes `MEASURE_CHANGED` for `aria-pressed`) |
| `js/ui/MeasureOverlay.js` | ui | `#measure-overlay`; `place(labels)` called by the label pass (§5.7); subscribes `MEASURE_CHANGED`, `MEASUREMENTS_CHANGED`, `UNITS_CHANGED` |
| `js/ui/SpecSheetView.js` | ui | `async render(sheet)` into `#print-root` (resolves when every image has decoded); `print()`; `openFallback()` (synchronous, §3.10) |

Every new class follows R4. Constructors store dependencies only. THREE objects are allocated lazily on the first `rebuild`, `show` or `capture`, never at construction, so the legacy id order is untouched while a feature is off.

### 5.3 Changed modules

| Module | Change |
|---|---|
| `domain/WallSection`, `domain/Wall`, `domain/Project`, `domain/CineCamera` | fields and copy rules of §4.1 |
| `geometry/WallLayout.computeWallLayout` | Exposes `layout.curveConvention` (`'curve-before-first-panel'` or `'curve-between-panels'`), set **inside its existing switch** on the convention: today the single `Strategies.curveBeforeFirstPanel` read site (ARCHITECTURE 3.6); after S08-P2-13f retires the key, the constant legacy value; after a spec 07 C6 change, `layoutOptions.curveConvention`. No new reader. |
| `geometry/WallLayout.columnQuads()` (spec 08) | Each entry gains `sectionIndex` and `col` (T3.2; additive, spec 08's analyser ignores them) |
| `geometry/WallLayout.panelQuads()` (spec 02) | Each yielded quad gains `normal: {x,y,z}` (the LED-side normal: stage-facing × σ, spec 01; transformed by `postTransform`), `ledX` and `ledY` (T9.1). Existing fields and order unchanged. |
| `geometry/FrustumCoverage` (spec 08) | T3.2 exports `cameraBasis(pose, lens)` and `rayQuadHit(o, d, quad)` with their bodies unchanged (if spec 08 kept them private). T9.1 adds an options argument and `packPanelQuads(layout)` (§6.5). Without options, `analyzeCoverage` returns exactly spec 08's result and runs exactly spec 08's arithmetic. |
| `io/ProjectSchema`, `io/ProjectSerializer` (spec 07) | the rows of §4.2, one revision per landed item; the `share` variant |
| `app/WallController` | `setSectionProduct`, `batchSetProduct`, `reapplyProduct`, `unlinkProduct`, `setSectionCabinet`, `applyVolumePreset`, `applyCurvedVolume`; P1 steps 4b and 5a (§5.5) |
| `app/CameraController` | P2 additions (§5.5); `setLensField(field, raw)`; `setInnerFrustum({enabled?, overscanPct?})`; `setFilmback` also writes `photositesH` from `SENSOR_PHOTOSITES`. The hub reads `wallController.currentLayout` on every refresh, as spec 08 reads a fresh layout; it caches only the packed panel quads, keyed by layout identity. |
| `app/ProjectSession` (spec 07) | reasons `'template'` and `'share'` (view-only fields kept; framing as `new`); `applyWallScope(wallKeys, {reason, templateId})` (its existing wall-scope merge, made public, keeping the live pivot and UV settings); `setClient(raw)`, `setNotes(raw)`; hydration of the §4.1 fields |
| `app/ProjectIO` | `exportScreenshot(kind)`, `exportSpecSheet()`, `exportStagePack(target)`, `exportPlanSvg()`. File names from `brand.filePrefix`. `await brandMark.load()` before any watermarked capture. |
| `render/SceneManager` (spec 07) | `addHelper(o, {layer, role})` accepts `role: 'chrome' \| 'overlay'` (default `'chrome'`); the rig and safe-distance groups are registered with `'overlay'`; `helpersByRole(role)` |
| `render/PreviewPass` (spec 07) | New additive method `captureCanvas({width, height, camera, include, supersample}) -> HTMLCanvasElement` (synchronous). Spec 07's `capture({width, height}) -> Promise<Blob>` keeps its signature and output and is implemented as `captureCanvas({width, height})` followed by `toBlob` (§6.7). |
| `render/textures/BrandMark` (spec 06) | read-only `get monogram()` (the loaded monogram `HTMLImageElement`, or `null` until `ready`) |
| `theme/Theme.js`, `theme/ThemeBridge.js` (spec 06) | `SceneTheme.innerFrustum = {color, opacity: 0.18}`, `SceneTheme.measure = {color}`; `COLOR_BINDINGS` rows `['scene.innerFrustum.color', '--scene-inner-frustum', 'num']`, `['scene.measure.color', '--scene-measure', 'num']`; tokens `--scene-inner-frustum: var(--ui-green-400)`, `--scene-measure: var(--morph-neutral-50)` in layer 4 of `css/02-tokens.css`; the parity test covers them |
| `interaction/Keymap` (spec 07) | the `M` row, the extended `escape` chain, and the `menu-button` / `menu` widget scopes (§3.9) |
| `interaction/InputState.InteractionState` | `measureActive = false` (single writer `MeasureTool`) |
| `interaction/ViewportInput` | Pointer routing: `if (interaction.measureActive) measure.onPointer*(e)` after the pilot branch and before click-select, so a measure click never selects |
| `ui/SectionListPanel` (or spec 02's card), `ui/SectionBatchPanel` (spec 02) | product and cabinet rows and the link states (§3.2); the batch product select; the "Ceiling / floor" menu in spec 02's offset group (§3.7) |
| `ui/ProjectPanel` (spec 07) | `#project-client`, `#project-notes` |
| `ui/ExportPanel` | new buttons and menus (§3.5) |
| `app/App` | construction and bootstrap additions (§5.8) |

### 5.4 Events added to `Events` (each with a subscriber in the same change, per bus rule 7)

| Event | Payload | Emitted by (exact point) | Subscribers (mirror) |
|---|---|---|---|
| `stage:estimatesChanged` (`STAGE_ESTIMATES_CHANGED`) | `{estimates: StageEstimates, checks: Check[]}` | `StageController.refresh` (P1 step 5a; also after `setSetting`, `applyRegionDefaults` and `setSectionCabinet`) | `StagePanel`, `SectionListPanel` (curve-check suffix, C1 only) |
| `camera:moireChanged` (`CAMERA_MOIRE_CHANGED`) | `{result: MoireResult\|null, coverage: {centerHit: {sectionId, distanceM, onPanel}\|null, nearestVisibleM: number\|null, innerFrustumPx: {total, bySection}\|null}}` | `CameraHub.refresh`, right after `CAMERA_COVERAGE_CHANGED` | `LensMoirePanel` |
| `measure:changed` (`MEASURE_CHANGED`) | `{active, a, b, hover, distanceM, delta: {x,y,z}, horizontalM}` | `MeasureTool` after each state change | `MeasureOverlay`, `ToolsPanel` (`#tool-measure` pressed state) |
| `measure:pinnedChanged` (`MEASUREMENTS_CHANGED`) | `{measurements}` | `MeasurementController.pin`, `unpin`, `translateStage` | `MeasureView` (pinned lines), `MeasureOverlay` (pinned labels) |
| `prefs:unitsChanged` (`UNITS_CHANGED`) | `{system}` | `Prefs.setUnits` | every panel that shows lengths (`StagePanel`, `LensMoirePanel`, `SectionListPanel`, `CameraPanel`, `PropControls`, `MeasureOverlay`, the spec 02/03 panels) |

**Classification (07 C47, enforced by static rule S9).** Each event is classified in the `Events` catalogue in the commit that adds it. **Non-visual** (DOM only; `SceneManager` does not invalidate on them): `STAGE_ESTIMATES_CHANGED`, `CAMERA_MOIRE_CHANGED`, `UNITS_CHANGED`. **Visual** (the canvas invalidates): `MEASURE_CHANGED`, `MEASUREMENTS_CHANGED`.

Existing events used, not redefined:
- `PROJECT_REPLACED` (spec 07) gains the subscribers `StagePanel`, `LensMoirePanel`, `MeasureView`, `MeasureOverlay` and `ProjectPanel` (client, notes); each calls its `syncFromModel()`.
- `SECTION_CHANGED` (spec 02) gains the subscriber `InnerFrustumView`: on `live === true` and while enabled, it updates the geometry of the listed sections in place (§6.5), as spec 01's `NormalsDebugView` does.
- `HISTORY_CHANGED` and `AUTOSAVE_STATUS` (spec 07) are not touched.
- `CAMERA_COVERAGE_CHANGED` keeps **spec 08's payload exactly**. The X3/X9 additions travel in `CAMERA_MOIRE_CHANGED`.

### 5.5 Pipelines (amendments to ARCHITECTURE §6)

**P1 `WallController.rebuild()`:**
```
1.  layout = layoutProject(project)            (spec 02: also stored as #currentLayout)
2.  view.rebuild({layout, meshMode, display})
3.  publishStats()
4.  orbit step (legacy updateCameraPosition, or spec 07's orbit.onWallRebuilt({reason}))
4b. if (display.innerFrustum.enabled) innerFrustum.rebuild(layout)   // NEW (X9): per-section overlay geometry, before the hub updates uniforms
5.  if (camera.enabled) hub.refresh()          // P2: also emits CAMERA_MOIRE_CHANGED and updates the inner frustum
5a. stage.refresh(layout)                      // NEW (X2): estimates + checks -> emit STAGE_ESTIMATES_CHANGED
6.  emit WALL_REBUILT {layout, meshMode, view}
```
These are insertions, not reorderings of legacy steps. Steps 4b and 5a allocate no THREE object while the features are off (4b is skipped, 5a is pure), so default draw order and goldens are unchanged.

**P2 `CameraHub.refresh({poseOnly = false} = {})`** (spec 08's P2-11/P2-12c form; additions marked `+`):
```
if (!cine.enabled) return
layout = wallController.currentLayout                                   (spec 02; before spec 02: layoutProject(project), as spec 08)
cov = analyzeCoverage(layout, pose, lens, {                             (spec 08 call; T9.1 adds the options object)
+       borderSegments: 16,                                              + border-sampled 'within' (§6.5)
+       packed: (this.#packedFor === layout ? this.#packed : (this.#packedFor = layout, this.#packed = packPanelQuads(layout))),
+       nearest: true,                                                   + nearest visible point, frame without overscan
+       pixels: display.innerFrustum.enabled ? { overscanPct: display.innerFrustum.overscanPct } : null })
poseOnly ? rig.updateFrustumDepths(cov.cornerDepths) : rig.rebuildFrustum(cine, cov.cornerDepths)     (spec 08)
rig.updateTransform(cine)
emit CAMERA_COVERAGE_CHANGED {spec 08 payload}                          (unchanged; status uses overscan 0)
+ hit = centerHit(layout, pose, lens)                                    (T3.2, §6.3)
+ emit CAMERA_MOIRE_CHANGED {result: analyzeMoire(moireInputs(cine, hit, project)), coverage: {centerHit: hit, nearestVisibleM: cov.nearestVisibleM ?? null, innerFrustumPx: cov.innerFrustumPx ?? null}}
+ if (display.innerFrustum.enabled) innerFrustum.update(cine, display.innerFrustum.overscanPct)
preview.updateCamera(); if (!poseOnly) this.syncSafeDistance(); pilotDriver.refresh(); emit SELECTABLE_MOVED {id: 'camera'}
```
Because the layout is read from `wallController.currentLayout` on every refresh, coverage is never staler than spec 08's: a camera refresh during or after one of spec 02's transform-only section drags sees the dragged geometry. The packed quads are rebuilt only when the layout object changes (once per P1, and once per drag frame while the inner frustum is on and the camera refreshes).

Spec 03's pivot drags move only the pending marker until `'end'` (03 D7), which then runs P1, so they need nothing here.

**History records** (spec 07 §5.6.1 table, rows added by this spec; each is a direct call at the **end** of the use case, after the rebuild or refresh; ignored while `history.recording` is false). Multi-field use cases write every field and then record once; none uses `begin/commit`, which spec 07 keeps for gizmo drags.

| Use case | Label | `coalesceKey` |
|---|---|---|
| `WallController.setSectionProduct(section, id)` | `Product: <model> (<name>)` (`Product: custom (<name>)` for `""`) | - |
| `WallController.batchSetProduct(ids, id)` | `Product: <model> (<N> sections)` | - |
| `WallController.reapplyProduct(section)` | `Re-apply product (<name>)` | - |
| `WallController.unlinkProduct(section)` | `Unlink product (<name>)` | - |
| `WallController.setSectionCabinet(section, field, raw)` | `Cabinet <field> (<name>)` | `section:<id>:cabinet.<field>` |
| `WallController.applyVolumePreset(section, kind)` | `<Ceiling: fit to volume \| Ceiling: snap to wall top \| Floor: fit to volume \| Floor: snap to wall front> (<name>)` | - (one record after the single rebuild) |
| `WallController.applyCurvedVolume(design, {mode})` | `Curved volume (<n> sections, <mode>)` | - |
| `StageController.setSetting(path, raw)` | `Stage: <label>` | `production:<path>` |
| `StageController.applyRegionDefaults(id)` | `Stage: <region> defaults` | - |
| `CameraController.setLensField(field, raw)` | `Camera <field>` | `camera:<field>` (spec 07's key family) |
| `CameraController.setInnerFrustum({enabled})` / `({overscanPct})` | `Inner frustum on/off` / `Inner frustum overscan` | - / `display:inner_frustum.overscan_pct` |
| `TemplateController.load(id)` | `Template: <name>` | - |
| `ShareLinks.open(v2)` | `Open shared stage "<name>"` | - |
| `MeasurementController.pin` / `unpin` | `Pin measurement` / `Remove measurement` | - |
| `ProjectSession.setClient` / `setNotes` | `Edit client` / `Edit notes` | `project:client` / `project:notes` |
| **Not recorded** | units toggle, screenshot options, measure mode on/off and unpinned measurements, menu open/close, share banner "Keep mine", `MeasurementController.translateStage` (clamped to ±100,000 m through its `LIMITS`; part of spec 03's pivot use case, which records **one** entry, 07 C45, C59) | - |

`History.onCommitted` already schedules spec 07's autosave, so every row above is also autosaved.

### 5.6 `Strategies` and the LEGACY registry

- **No new `Strategies` keys and no new `Strategies` or `MeshProfiles` readers.** These are new features with neutral defaults, not legacy quirks.
- **Nothing retired by this spec.** B-M10 is retired by S08-P2-11, B-L34 by S08-P2-10c (or S07-R2), and B-L17's wall-level warning is S08-P2-13b.
- **Nothing touched in spec 02's rows.** X10 changes no walk, `floorRuns()` or `firstEdge`/`lastEdge` code; its presets only write spec 02 fields.
- **Curve convention:** `computeWallLayout` exposes `layout.curveConvention` from inside its existing switch (§5.3); `designArc` and the templates receive the value from their caller (`wallController.currentLayout.curveConvention`). No §8.1 amendment is needed, and nothing reads `wall.conventions` (there is no such key; spec 07 C6).
- **Exporter profiles:** X11 lands after F1 and F4, so the pack always uses the live profiles through the builder. There is no capability object, no readiness check and no new read site of the mesh profile leaves (ARCHITECTURE 1.5 holds).

### 5.7 Render layers and helpers

| Object | Layer | Registered via | Screenshot role | Raycastable |
|---|---|---|---|---|
| Inner-frustum overlay (one mesh per section) | `LAYERS.HELPERS` (main camera only; never in the preview or a camera-view still; hidden in pilot, S07 Q7) | `addHelper(group, {role: 'overlay'})`; meshes added later go through `tagHelper` | overlay | no (`raycast = () => {}`) |
| Measurement lines, markers, pinned lines | `HELPERS` | `addHelper(group, {role: 'overlay'})` | overlay | no |
| Camera rig, safe distance (existing) | `HELPERS` (S07-R1) | existing calls, now with `{role: 'overlay'}` | overlay | rig body yes (spec 07 `PointerRay.enableAll`) |
| Grid, axes, pivot marker (spec 03), feature markers | `HELPERS` | existing | chrome | as defined |
| Gizmo (`TransformControls` root) | spec 07: `'default'` + `withPassHidden` | existing | never in a still | its own raycaster |
| Normal lines (spec 01) | `LAYERS.DEBUG` | existing | debug (included only with "Include debug views") | no |
| HDRI backdrop dome (F5) | `LAYERS.ENVIRONMENT` | existing | always in stills (spec 07 still mask) | no |

**Render order** (spec 01's registry `core/renderOrder.js`, the single source; no literal ≥ 900 outside it): the inner-frustum overlay at `RENDER_ORDER.INNER_FRUSTUM_OVERLAY` (990; depth-tested, below every line overlay), the measurement lines and markers at `RENDER_ORDER.MEASURE` (992). Both slots land with their items (07 0.4). Both already follow spec 06 §5.12 (tokens, `COLOR_BINDINGS` rows, two-tone line treatment, closed `Line`/`LineSegments` geometry).

**Label pass.** `MeasureView.labelPass` is a pass object `{render(scene)}` appended with `sceneManager.setPasses([previewPass, measureView.labelPass])`. It draws nothing: it projects the anchor point of every visible label (current and pinned) with the main camera to CSS pixels and calls the injected `onProject([{id, x, y, visible}])`, which `MeasureOverlay.place` applies. Because passes run only on rendered frames, the labels follow every camera move under spec 07's render-on-demand and cost nothing while idle. `MeasureTool` calls `sceneManager.invalidate('measure')` after each state change.

**Disposal.** Each view owns a `ResourceTracker`. The inner-frustum overlay owns its per-section geometries and its `ShaderMaterial` (it shares nothing with `LEDWallView`). `rebuild(layout)` disposes the previous geometries; `setVisible(false)` disposes everything, so nothing survives while the overlay is off; turning it on again runs `rebuild(wallController.currentLayout)` then `update`.

### 5.8 Composition (`App.js` additions, after spec 07's construct block)

```
prefs                                                                   // spec 07 app/Prefs.js; X4/X14 add keys
stage        = new StageController({ project, bus, history, products: PANEL_PRODUCTS, processors: PROCESSORS,
                                     layoutSource: () => wallController.currentLayout })
templates    = new TemplateController({ project, session, history, notifier, wallController, products: PANEL_PRODUCTS })
shareLinks   = new ShareLinks({ serializer, session, history, notifier, win, codec: { encodeShare, decodeShare },
                                exportLimits: () => canvasProbe.limits() })
measurements = new MeasurementController({ project, bus, history })     // also appended to spec 03's stageAnchored list (clamped translateStage, 07 C45)
innerFrustum = new InnerFrustumView({ sceneManager, theme, builder: wallBuilder, bus,
                                      layoutSource: () => wallController.currentLayout })   // lazy THREE allocation
screenshots  = new ScreenshotRenderer({ sceneManager, previewPass, canvasProbe, doc })
measureOverlay = new MeasureOverlay({ doc, bus, measurements, units: prefs })
measureView  = new MeasureView({ sceneManager, theme, bus, onProject: (labels) => measureOverlay.place(labels) })
snapper      = (hit, px, opts) => pickSnap(snapCache.for(wallController.currentLayout), hit, px, projectToPx, opts)
               // App-built closure: geometry/SnapPoints; snapCache recomputes snapCandidates only when the layout object changes;
               // projectToPx(p) = CSS px of new THREE.Vector3(p.x, p.y, p.z).project(sceneManager.camera)
measure      = new MeasureTool({ pointerRay, interaction, view: measureView, bus, snapper, gizmo,
                                 wallMeshes: () => wallView.pickMeshes() })
stagePanel, lensMoirePanel, toolsPanel, templatesMenu, curvedVolumeForm, shareControls, shareBanner, unitsToggle, specSheetView
viewportInput.registerActions({ 'measure.toggle': () => measure.toggle() })
viewportInput.registerEscapeHandler(40, () => measure.active && measure.cancel())   // 07 3.8 registry (C42); the 'escape' action is not edited
// the 'gizmo.translate' / 'gizmo.rotate' / 'gizmo.space' actions call measure.exit() first when measure.active
sceneManager.setPasses([previewPass, measureView.labelPass])
// wallController and hub receive stage / innerFrustum via new optional deps (null-safe when a feature is not built)
```

Bootstrap order (spec 07 §5.12 "7 Bootstrap", extended):
1. The legacy `init()`, `setupUI()` and `setView('reset')` sequence runs unchanged.
2. Then the new `bind()` calls, and `shareLinks.attach(win)` (registers `hashchange`).
3. `autosave.rotateOnBoot()` and the restore banner (spec 07). This runs **on every boot, including a share-link boot**, so the previous session's work is never overwritten and its banner still appears.
4. `shareLinks.readFragment(win.location.hash)`: if valid, `shareBanner.show(summary)`; nothing is applied. If invalid, an error toast. The decode is bounded (65,536 input characters, 1 MiB inflated, §6.8), so reading at boot cannot hang the tab.
5. `history.reset()` last (spec 07).

When neither a hash nor a previous slot exists, the startup DOM and first frame are identical to today.

---

## 6. Algorithms and math

### 6.1 Pitch, product linking and section role (X1)

```
pitchX = panelWidth / ledX;  pitchY = panelHeight / ledY            (mm)
catalogue integrity (unit test): |cabinetWidthMm / pixelsX - pitchMm| / pitchMm <= 0.5 %   (and the same for Y)
setSectionProduct(section, id):
  p = id === '' ? null : findProduct(id)
  if (p) { section.panelWidth = p.cabinetWidthMm; section.panelHeight = p.cabinetHeightMm;
           section.ledX = p.pixelsX; section.ledY = p.pixelsY; section.productId = id }
  else   { section.productId = null }                                   // "Custom": values kept
  -> card write-back (§3.2) -> commitSectionEdit() -> history.record(...)
batchSetProduct(ids, id): the same writes on every editable selected section; one rebuild; one record
reapplyProduct(section): setSectionProduct(section, section.productId) with its own label
linkState(section):
  section.productId === null                 -> 'custom'
  p = findProduct(section.productId); !p     -> 'unknown'
  fields equal productSectionFields(p)       -> 'linked'      (=== on the four numbers)
  otherwise                                  -> 'diverged'
sectionRole(layout, i):                                       (geometry/VolumePresets.js)
  n = LED-side normal of section i (spec 02 frame zAxis × σ, transformed by postTransform)
  n.y > 0.9 -> 'floor' ; n.y < -0.9 -> 'ceiling' ; otherwise 'wall'
listProducts({surface}) = PANEL_PRODUCTS.filter(p => p.surface.includes(surface))
```
Columns and rows stay free. The product only fixes the cabinet.

### 6.2 Stage estimates (X2)

For each section *i*, the cabinet data comes from the product when linked (or diverged; the product's weight and power still describe the hardware), else from `section.cabinet` (null means unknown):

```
n_i      = panelCols_i * panelRows_i                       (cabinets)
A_i      = n_i * (panelWidth_i * MM_TO_M) * (panelHeight_i * MM_TO_M)          (m2)
W_i      = n_i * weightKg_i ;  Pmax_i = n_i * powerMaxW_i ;  Pavg_i = n_i * powerAvgW_i
col_i    = panelRows_i * weightKg_i                         (heaviest column load, kg; excludes bars and hardware)
px_i     = ledX_i * ledY_i                                   (pixels per cabinet)
Totals   = sums over sections with known data; unknownCabinets = sum of n_i with missing data
```

**Electrical** (`P = Pmax` if basis is `max`, else `Pavg`; V = `voltageV`; PF = power factor):
```
1-phase:  I_total = P / (V * PF)
3-phase:  I_line  = P / (sqrt(3) * V * PF)              (V = line-to-line, balanced load)
V_circ   = phases === 1 ? V : V / sqrt(3)               (single-phase circuits off a 3-phase supply)
W_circ   = V_circ * PF * breakerA * derating            (usable watts per circuit)
Pcab_i   = per-cabinet max or avg per basis
if (Pcab_i > W_circ): check C10 (error); circuits = null (readout '—')
cabPerCircuit_i = min(floor(W_circ / Pcab_i), product.maxPerPowerChain ?? Infinity)      (>= 1 after the C10 guard)
circuits = sum_i ceil(n_i / cabPerCircuit_i)            (circuits are not shared across sections: conservative)
heatBTUh = Pmax * 3.412142
```

**Data:**
```
C = portCapacityPx(proc, bitDepth, frameRate):
    base60 = proc.capacity?.[bitDepth]                         (vendor value at 60 Hz)
             ?? proc.basePx8bit60 * 8 / bitDepth                (estimated)
    if (proc.capacityByRate?.[bitDepth]?.[frameRate] exists): C = that vendor value
    else C = base60 * min(1, 60 / frameRate)                   (never scaled ABOVE the 60 Hz value; lower rates may allow
                                                               more pixels only when the vendor table says so)
    estimated = (base60 came from basePx8bit60) || (frameRate !== 60 && no vendor value for that rate)
if (px_i > C || (proc.maxPxPerReceiver !== null && px_i > proc.maxPxPerReceiver)): check C11 (error); ports = processors = null
cabPerPort_i = min(floor(C / px_i), product.maxPerDataChain ?? Infinity)                 (>= 1 after the C11 guard)
ports        = sum_i ceil(n_i / cabPerPort_i)                (ports not shared across sections)
canvas       = Wall.combinedCanvasSize()                     (spec 08 P2-13b; equals the panel-ids.png atlas size)
processors   = max( ceil(ports / proc.portsPerUnit),
                    proc.pixelsPerUnit ? ceil(totalPixels / proc.pixelsPerUnit) : 0 )   (no pixelsPerUnit: port-limited only)
distribution = proc.distribution ? ceil(ports / proc.distribution.portsPerUnit) : 0      (Brompton: XD, 10 x 1G ports each)
```

`maxPxPerReceiver` (the receiving card's largest loadable cabinet, optional per processor family) is `null` for every seed profile until verified (Appendix C).

**Rigging:**
```
limit = rigging.mode === 'hang' ? product.rigging.maxHang : product.rigging.maxStack ;  violation iff panelRows_i > limit   (check C6)
```

**Worked example** (unit test `stage-estimator.test.mjs`). One section, BP2V2 20 × 10, 230 V single-phase, PF 0.95, 16 A, 80 %, basis max, Brompton, 10-bit, 60 fps:

| Quantity | Value |
|---|---|
| Cabinets, area | n = 200; A = 50.00 m² |
| Weight, heaviest column | 1,870 kg; 93.5 kg |
| Power | Pmax = 38,000 W; Pavg = 19,000 W |
| Current | I = 38000 / (230 × 0.95) = 173.91 A |
| Circuits | W_circ = 2,796.8 W; 14 cabinets per circuit; 15 circuits |
| Heat | 129,661 BTU/h |
| 3-phase alternative (400 V) | I_line = 57.74 A; V_circ = 230.94 V; W_circ = 2,808.2 W; 14 cabinets per circuit |
| Port capacity | C = 525,000 × 8 / 10 = 420,000 px (estimated); px = 30,976 per cabinet |
| Ports | 13 cabinets per port; 16 ports. At 8-bit: 16 cabinets per port, 13 ports. |
| Distribution | ceil(16 / 10) = 2 XD |
| Canvas | 3520 × 1760, which fits 4096 × 2160 |
| Processors | 1 (16 ≤ 40 ports; 6.20 Mpx ≤ 9 Mpx) |
| Frame-rate guard | At 23.976 fps C stays 420,000 (no scaling above the 60 Hz value); at 120 fps C = 210,000 and 7 cabinets per port, 29 ports, 3 XD |

Guard cases (also unit-tested): a 3 kW custom cabinet on a 16 A circuit gives C10 and `circuits = null`; a custom 1000 × 1000 px cabinet against 420,000 px gives C11 and `ports = null`; `generic-1g` (no `pixelsPerUnit`) gives a port-limited processor count with no `NaN`; `maxPerPowerChain = 10` caps 14 cabinets per circuit at 10; a profile with `maxPxPerReceiver = 30,000` gives C11 for BP2V2 (30,976 px).

### 6.3 Moiré and viewing distance (X3)

**Centre hit (T3.2, `analysis/CenterHit.js`).** It needs no T9.1 code:
```
centerHit(layout, pose, lens):
  {o, f} = cameraBasis(pose, lens)                                  (spec 08's basis, exported unchanged)
  best = null
  for q of layout.columnQuads():                                    (each entry {p0, a, b, n, sectionIndex, col}, §5.3)
    t = rayQuadHit(o, f, q)                                         (spec 08's predicate: den < -1e-9, t > 0, 0 <= s, v <= 1)
    if (t !== null && (best === null || t < best.t || (t === best.t && (q.sectionIndex, q.col) < (best.sectionIndex, best.col))))
      best = {t, sectionIndex: q.sectionIndex, col: q.col}
  if (best) return {sectionIndex, sectionId: layout.sections[sectionIndex].section.id, distanceM: best.t, onPanel: true}
  plane = the column plane that spec 08's D0 rule selects (rule 1, then rule 2; the same code path)
  return plane ? {sectionIndex: plane.sectionIndex, sectionId, distanceM: plane.t, onPanel: false} : null
```
`f` is a unit vector, so `t` is the distance along the optical axis, and on a panel hit it equals spec 08's `centreDepth`; off-panel it equals `D0`. The tie-break only chooses which section is reported for a ray through a shared edge; it changes no distance.

Inputs:
- p = LED pitch (mm) of section `centerHit.sectionIndex`: `max(panelWidth / ledX, panelHeight / ledY)`. The section fields, not the catalogue's rounded `pitchMm`, are the source.
- f = focal length (mm);
- d = camera-to-wall distance (mm) along the optical axis: `centerHit.distanceM × 1000`;
- q = photosite pitch = filmbackWidth / photositesH (mm);
- s = focus distance (mm), which is d in `wall` mode;
- N = T-stop.

```
m      = f / (d - f)                     thin-lens magnification
p_img  = p * m                           LED pitch imaged on the sensor (mm)
rho    = p_img / q                       photosites per LED pixel
c      = (f^2 / (N * (s - f))) * |d - s| / d          defocus blur-circle diameter on the sensor (mm)
beta   = c / p_img                       blur diameter in LED pixels
MTF_disk(beta) = 2 * J1(pi * beta) / (pi * beta)      contrast of the LED-grid fundamental after uniform defocus
d(rho_k) = f + p * f / (rho_k * q)       distance at which the grid images at rho_k photosites per LED pixel
```

`MOIRE_THRESHOLDS = { blurSuppressed: 1.22, blurPartial: 0.6, resolved: 4, chroma: 2, luma: 0.7 }`. The rationale:
- `beta = 1.22` is the first zero of the disk MTF. Beyond it the grid's contrast stays below 0.13.
- The sensor Nyquist limit is at 2 photosites per period, which gives `rho = 2` for luma aliasing.
- A Bayer sensor samples R and B at half rate, so chroma moiré extends to `rho < 4`.
- Below `rho ≈ 0.7` the OLPF and lens attenuate the grid.

Classification:

| Condition (evaluated in order) | Band | Risk |
|---|---|---|
| beta ≥ 1.22 | `defocused` | low |
| rho ≥ 4 | `resolved` (the pixel structure is visible if in focus: "screen door") | medium if beta < 0.6, else low |
| 2 ≤ rho < 4 | `chroma-alias` | high if beta < 0.6, else medium |
| 0.7 ≤ rho < 2 | `luma-alias` | high if beta < 1.22 |
| rho < 0.7 | `beyond-resolution` | medium if beta < 0.6, else low |

The output also includes:
- `riskyBand = [d(4), d(0.7)]`: the distances at which an **in-focus** wall is in an aliasing band;
- the human viewing distances: `comfortM = p` (1 m per mm of pitch, the common trade rule) and `acuityM = p * 3.437747`, where **one pixel pitch subtends 1 arcminute** (20/20 acuity): `1 / tan(1′) / 1000 = 3.437747` m per mm. This is the trade convention "visual acuity distance = pitch × 3438" (both in mm).

Display formats: `rho.toFixed(2)`, `beta.toFixed(2)`, band and viewing distances `toFixed(2)` for d(4) and `toFixed(1)` for d(0.7) and the human distances, in the current unit system.

The UI labels everything a **risk indicator**, says to test-shoot, and shows the thresholds in a tooltip. The trade rule of thumb "camera-to-wall distance in m ≥ pitch in mm" is quoted as context only, with sources (§Sources). Practitioners stress that defocus is the main mitigation.

**Worked example** (unit test, and the `moire` harness scenario). A 20 × 10 section of 500 × 500 mm at 176 × 176 px (p = 500/176 = 2.840909 mm), ARRI ALEXA LF open gate (q = 36.70 / 4448 = 8.250899 µm), f = 35 mm, camera at (5, 2.5, 5) facing the wall (centre hit: section 0, d = 5 m, on a panel), focus at 3 m, T2.8:

| Quantity | Value | Displayed |
|---|---|---|
| p_img | 20.0265 µm | "20.0 µm" |
| rho | 2.42720 (chroma-alias band) | "2.43 photosites per LED pixel" |
| Blur | c = 59.0219 µm; beta = 2.94718, so **defocused, low risk** | "2.95 LED pixels", "LOW" |
| Focus on the wall (s = d) | beta = 0, chroma-alias | "HIGH" |
| Risky band | d(4) = 3.04776 m, d(2) = 6.06051 m, d(0.7) = 17.25075 m | "3.05 m – 17.3 m" |
| Viewing distances | comfort 2.840909 m; acuity 9.76633 m | "≥ 2.8 m", "≥ 9.8 m" |

### 6.4 Curved-volume generator (X6)

```
w     = panelWidthMm * MM_TO_M ; R = radiusM ; Theta = arcDeg
c0    = 2 * asin(w / (2R))                   (radians; the exact joint angle for radius R)
cDeg  = Math.round(c0 * 180 / Math.PI * 1000) / 1000          (rounded to 0.001 deg; legacy curveIntensity)
if (lockStepsDeg): cDeg = the largest lock step <= concaveMaxDeg nearest to cDeg (ties -> the smaller step)
c     = (cDeg * Math.PI) / 180
R_eff = w / (2 * sin(c / 2)) ; faceRadius = R_eff * cos(c / 2)            (reported; the radius actually built)
n     = max(1, round(Theta / cDeg))   columns ; achievedArc = n * cDeg
symmetric start heading (the arc is mirror-symmetric, its middle panel faces +Z, concave toward +Z):
   curveConvention === 'curve-before-first-panel' (legacy B-L1, kept by S08-P2-13f):  theta0 = -(n + 1) * cDeg / 2
   curveConvention === 'curve-between-panels' (heading theta0 + k*c):                  theta0 = -(n - 1) * cDeg / 2
   theta0 is rounded with Math.round(theta0 * 1000) / 1000 (asymmetry <= 0.0005 deg, ignored)
split into k = ceil(n / 50) sections (FIELD_RULES caps panelCols at 50), sizes as equal as possible (n = 94 -> 47 + 47)
Replace: section 1 angleOffset = symmetric ? theta0 : 0 ;
         later sections angleOffset = curve-before-first-panel ? 0 : cDeg                    (arc continuity)
Append:  section 1 angleOffset = curve-before-first-panel ? 0 : cDeg (continues the end heading of the last
         non-detached section; Symmetric does not apply), later sections as above
rows = round(heightM / (panelHeightMm * MM_TO_M)), clamped 1..20 (one section height; more needs stacked sections: out of scope)
validation: cDeg > product.curve.concaveMaxDeg -> error "radius too tight for <model>"; |theta0| > 180 -> error (angleOffset range)
```

`designArc` takes the convention as a parameter (from `wallController.currentLayout.curveConvention`, §5.3) and reads no `Strategies` itself (§5.6). The generated values are not always multiples of the inputs' `step` attributes (0.1 for the curve, 1 for the heading change). They are still accepted: the app parses with `parseFloat`, no `:invalid` style exists, and the hint shows at most three decimals ("Concave (+2.865°)").

**Worked example** (unit test). R = 10 m, w = 0.5 m, Θ = 270°:
- c0 = 2.865087°, so cDeg = 2.865°; n = round(94.2408) = 94; arc = 269.31°;
- R_eff = 10.0003 m; face radius 9.99718 m;
- θ0 (legacy) = −136.087°; θ0 (curve between panels) = −133.222°;
- 2 sections of 47 columns. With 12 rows of BP2V2: 1,128 cabinets, 10,546.8 kg, 214,320 W max.

### 6.5 Coverage extensions and the inner frustum (X9, on spec 08 §6.10)

Spec 08 owns the camera basis, the ray–quad test, `D0`, the frame size and the four statuses. This section only adds options. **Without the options object, `analyzeCoverage` runs exactly spec 08's arithmetic and returns exactly spec 08's result.**

**Boundary handling (only when the options object is present).** Spec 08's predicate (`den = d·n < −1e-9`, `t > 0`, `0 ≤ s ≤ 1`, `0 ≤ v ≤ 1`, smallest `t`) is used **unchanged** for the centre ray and the 4 corner rays, so every value spec 08 outputs (`distance`, `cornerDepths`, `centreDepth`, the corner part of the status) is bit-identical. Only the 60 additional border rays of the border rule use the tolerant predicate `t > 1e-9`, `−1e-9 ≤ s ≤ 1 + 1e-9`, `−1e-9 ≤ v ≤ 1 + 1e-9`, because a border ray that passes exactly through the shared edge of two column quads can otherwise miss both by one ulp. Border rays can only downgrade `within`, never upgrade a status, so the tolerance cannot create a `within` that spec 08 would not report.

**Column quads after spec 02.** Spec 08 tests one quad per section column (`p0`, `a`, `b`) from `layout.columnQuads()`, already transformed by `postTransform` (spec 08 §6.10). Column quads are used for every ray (centre, corners, border samples).

**Border-sampled `within`** (option `borderSegments = 16`). Spec 08's "all 4 corner rays hit" is extended to "all 4 corner rays hit (spec 08's predicate) and all 60 other border rays hit (tolerant predicate)": each frame edge is divided into 16 segments, giving 64 sample directions (corners included), `dir = normalize(f + u·tx·r + w·ty·u)` with `(u, w)` on the border of `[−1, 1]²`. For a single planar convex wall face (every `camera` scenario state, the default wall), all border points lie inside the face whenever the 4 corners do, so the result equals spec 08's on every existing state. It differs where it should: on mixed heights or gaps, a frame whose corners land on tall sections but whose top edge crosses a shorter section or a gap is `offCenter` (if `fits`) or `exceeds`, not `within`. Gaps narrower than 1/16 of the frame edge can be missed (documented limit). Cost: 65 rays × 160 column quads on `large_wall` ≈ 10,000 tests, well under 0.5 ms.

**Packed panel quads** (option `packed`, built once per layout object by `packPanelQuads(layout)`):
```
for each quad k of layout.panelQuads() (spec 02, with normal, ledX, ledY; corners [BL, BR, TR, TL]):
  p0_k = BL ; a_k = BR - BL ; b_k = TL - BL           (a ⊥ b: every transform is rigid)
  n_k  = quad.normal                                  (LED side, σ applied)
  px_k = ledX * ledY ; sec_k = sectionIndex
returns {count, p0, a, b, n: Float64Array(3·count) each, px: Float64Array(count), sec: Int32Array(count)}
```

**Exact frustum clipping** (used by `pixels` and `nearest`). The frame (with linear overscan factor `k`) is the intersection of five half-spaces through the camera position P, with the camera basis `(f, r, u)` and `tx' = tx·k`, `ty' = ty·k`:
```
h1(X) = (tx'·f − r)·(X − P) ≥ 0     h2(X) = (tx'·f + r)·(X − P) ≥ 0
h3(X) = (ty'·f − u)·(X − P) ≥ 0     h4(X) = (ty'·f + u)·(X − P) ≥ 0
h5(X) = f·(X − P) − 0.1 ≥ 0          (near plane, as the legacy preview camera)
clipQuad(k_quad, k):                                          (no allocation: two preallocated Float64Array(16·3) buffers)
  if n_k·(P − p0_k) <= 0: return empty                        (back face: the camera is not on the LED side)
  poly = [BL, BR, TR, TL]
  quick accept: all 4 corners satisfy h1..h5 -> fraction 1 ; quick reject: all 4 fail the same h_i -> empty
  else Sutherland–Hodgman against h1..h5 (at most 9 vertices)
  fraction = |shoelace over the vertices in quad coordinates (s, t) = ((X − p0)·a/|a|², (X − p0)·b/|b|²)|
pixels (option pixels = {overscanPct}, only while the inner frustum is enabled):
  k = 1 + overscanPct / 100 ; total = Σ fraction_k · px_k ; bySection[sec_k] += fraction_k · px_k
nearest (option nearest, frame WITHOUT overscan, k = 1):
  for each quad with a non-empty clipped polygon Q:
    foot = P − ((P − p0)·n̂) n̂ ; if foot lies inside Q (convex test in (s, t)): dist = |(P − p0)·n̂|
    else dist = min over the edges of Q of the point–segment distance from P
  nearestVisibleM = min dist, or null when no quad is visible
```
The result is the LED-pixel **area** inside the frame (fractional pixels are counted proportionally), with no sampling tolerance. Occlusion is ignored (a quad hidden behind another section still counts); the camera is normally inside the volume, so this is rare, and it is documented in the readout tooltip. `nearest` only considers points inside the actual (non-overscanned) frame.

**Performance.** `large_wall` has 3,200 panel quads. Per refresh: one clip pass for `nearest` (always, while the camera is enabled) and one for `pixels` (only with the inner frustum on), with quick accept/reject first, no allocation (preallocated scratch buffers and one reused result object). `perf-coverage.test.mjs` asserts a median under 2 ms per `analyzeCoverage` call over 50 runs in Node with both passes, and that `packPanelQuads` runs once per layout object.

**Worked example** (unit test).
- Flat wall 20 × 10 BP2V2 (10 × 5 m, 3520 × 1760 px, 352 px/m) with its face at z = 0, x from 0 to 10.
- Camera at (5, 2.5, 5) looking at the wall (rotY = 0), ARRI LF (36.70 × 25.54 mm), 35 mm.
- Frame at the wall: 5.242857 × 3.648571 m. Status `within`; centre hit section 0 at 5.000 m, on a panel; nearest visible point 5.000 m (the foot of the perpendicular, (5, 2.5, 0), lies inside the frame).
- Inner frustum without overscan: 19.12898 m² × 123,904 px/m² = **2,370,152.03 px** ("2.37 Mpx on 1 section").
- With 10 % overscan: 5.767143 × 4.013429 m, still inside the wall, so **2,867,883.96 px** ("2.87 Mpx on 1 section"). Tolerance: ±0.5 px (floating point only). The status is still computed without overscan.
- Rotating the camera by rotY = 90° gives `offWall` (spec 08).
- Mixed-height fixture: sections A (4 × 6 cabinets of 500 mm, 2 × 3 m), B (2 × 2, 1 × 1 m), C (4 × 6, 2 × 3 m), flat; full-frame 36 × 24, 35 mm, camera at (2.5, 1.5, 3.8889). Frame 4.000 × 2.667 m: the 4 corners hit A and C, but the top edge crosses B above its 1 m top. Spec 08's corner rule says `within`; the border rule gives `offCenter` (`fits`: 4.0 ≤ 5 and 2.667 ≤ 3).

**Overlay** (`InnerFrustumView`).
- **Geometry.** One mesh per section, built by the injected viewport builder's per-section strip (`builder.sectionGrid(sl)`, spec 02/01: positions after `postTransform`, stored normals with σ) from `layoutSource()`. It owns its geometry in every mesh mode, so panel mode costs one draw call per section, not per panel, and the overlay never touches `LEDWallView`'s meshes, back shells (spec 01) or LED-sim materials. The strip surface coincides with the panel planes in panel mode (same column edges and row heights).
- **Live drags.** On `SECTION_CHANGED {live: true, ids}` while enabled, the overlay recomputes the strip of each listed section from `layoutSource()` (spec 02's `currentLayout`, already re-laid out by the drag) and writes `position` and `normal` in place (`array.set`, `needsUpdate = true`; a transform-only drag never changes the vertex count), then calls `sceneManager.invalidate('inner-frustum')`. Non-live changes arrive through P1 step 4b.
- **Facing.** The fragment test uses the stored `normal` attribute directly. By the invariant of §2.1 (legacy `'right-panel'` at 1604-1625, spec 08's `'averaged'`, and spec 01's σ), the stored normal is the LED-side normal in every profile, for every section, including reversed ones; no sign uniform and no wall-level flag exist. `inner-frustum-view.test.mjs` asserts the invariant (§8.1), so a future profile that changed the sign would fail a test instead of silently hiding the overlay.
- **Material.** r128 `ShaderMaterial` with `extensions: {derivatives: true}`, `transparent: true`, `depthWrite: false`, `polygonOffset: true`, `polygonOffsetFactor: -1`, `polygonOffsetUnits: -1`, `side: THREE.DoubleSide`:

```glsl
// vertex
uniform mat4 uFilmViewProj; varying vec4 vFilm; varying vec3 vWorldPos; varying vec3 vWorldNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz; vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vFilm = uFilmViewProj * wp; gl_Position = projectionMatrix * viewMatrix * wp;
}
// fragment
uniform vec3 uColor; uniform float uOpacity; uniform vec3 uFilmPos;
varying vec4 vFilm; varying vec3 vWorldPos; varying vec3 vWorldNormal;
void main() {
  if (dot(vWorldNormal, uFilmPos - vWorldPos) <= 0.0) discard;   // the film camera is not on this face's LED side
  if (vFilm.w <= 0.0) discard;
  vec2 ndc = vFilm.xy / vFilm.w;
  if (any(greaterThan(abs(ndc), vec2(1.0)))) discard;
  vec2 edge = (1.0 - abs(ndc)) / fwidth(ndc);            // pixels to the frame edge
  float line = 1.0 - clamp(min(edge.x, edge.y) / 1.5, 0.0, 1.0);
  gl_FragColor = vec4(uColor, uOpacity + line * (1.0 - uOpacity));
  #include <encodings_fragment>                          // linearToOutputTexel: the tint matches the token in r128
}                                                        // (LinearEncoding, identity) and after spec 07 U3 (sRGB output)
```

- `uFilmViewProj = filmCam.projectionMatrix × filmCam.matrixWorldInverse`, where `filmCam` is a private `THREE.PerspectiveCamera(2 * atan(tyo) * 180 / Math.PI, aspect, 0.1, 1000)` posed like the rig (`tyo = ty·(1 + overscanPct/100)`), allocated lazily on the first `update`.
- `uFilmPos` is the rig position. `uColor` is set with `THREE.Color` from `theme.scene.innerFrustum` (`--scene-inner-frustum`, Morph `--ui-green-400`), opacity 0.18.
- The overlay meshes have `matrixAutoUpdate = false` and an identity matrix: the strips are already in the stage frame that `LEDWallView` renders in (`wallController.currentLayout`, 07 C60). There is never a wall root transform: spec 03 translates the layout inside `layoutProject` and the identity transform of `wallGroup` is a unit-tested invariant (07 C32).
- `renderOrder = RENDER_ORDER.INNER_FRUSTUM_OVERLAY` (990): depth-tested, so it draws below every line overlay (§5.7).

### 6.6 Ceiling and floor presets (X10)

The presets compute values for spec 02's existing fields; spec 02's walk, offset matrix and consumers do the rest. Notation from spec 02: section frame `F = {origin O_s, basis B = [xAxis | yAxis | zAxis] = Ry(β)}` of the section's **generative** (pre-offset) geometry, with `β = atan2(−dz, dx)` for the chord direction `(dx, 0, dz)`; the offset applies `M = T(O_s)·B·T(o + t)·R·T(−o)·Bᵀ·T(−O_s)` with `R = Ry(pan)·Rx(tilt)·Rz(roll)` (02 §6.5).

**Chain box.** `G = chainGenerativeBounds(layout)`: the axis-aligned box of the generative grid vertices (`edges` × `[baseY, baseY + rows·panelH]`, no `postTransform`) of every section with `detached !== true`. It ignores every ceiling, floor and soffit, so presets never depend on each other. It is computed from the same layout as the section frame, so it translates with it (pivot independence, below).

**Fit presets.** `WallController.applyVolumePreset` is **one use case** (02 §10.3: X10 = presets over Detached plus offsets): it applies spec 02's `setSectionsDetached([id], true)` semantics (host = `wall.defaultAnchorFor(id)`, the section's dependants re-anchored to `wall.reanchorTargetFor`), then the field and offset writes below, then **one** rebuild and **one** history entry. For section *i* with panel size `panelW`, `panelH` (m):
```
1. Writes before the frame is read (domain writes, then layout = layoutProject(project), pure):
     the setSectionsDetached([id], true) writes (no rebuild yet); section.setField('curveIntensity', 0); offset.origin = 'bottom-center'
2. depth   = G.max.z − G.min.z ; width = G.max.x − G.min.x
   colsFit = clamp(floor((width + 1e-9) / panelW), 1, 50)
   rowsFit = depth >= panelH ? clamp(floor((depth + 1e-9) / panelH), 1, 20) : section.panelRows   (flat chain: keep rows)
   h       = rowsFit · panelH
   write panelCols = colsFit, panelRows = rowsFit; re-lay out (pure) and read F = layout.sections[i].frame
3. Target pose of the canonical section frame (origin at the chord midpoint of the base, x along the chord, y up, z = LED side):
     ceiling-fit: R_t = Rx(+90°)   (rows -> +Z, LED face -> −Y)   Q = ((G.min.x + G.max.x)/2, G.max.y + 0.10, G.min.z)
     floor-fit:   R_t = Rx(−90°)   (rows -> −Z, LED face -> +Y)   Q = ((G.min.x + G.max.x)/2, yFace, G.min.z + h)
                  yFace = product.depthMm · MM_TO_M when a floor product is linked, else 0 (the LED face is the tile top)
4. Offset values (o = 0 for the bottom-centre origin):
     R = Bᵀ · R_t = Ry(−β) · Rx(τ)  ->  rotation_deg = { x: τ, y: wrap180(−β · 180/π), z: 0 }     (τ = ±90)
     t = Bᵀ · (Q − O_s)              ->  position_mm = round1(1000 · t)                           (spec 02's 0.1 mm grid)
```
Check: a canonical point `p_c` sits at `O_s + B·p_c` before the offset, and `M` maps it to `O_s + B·(t + R·p_c) = Q + R_t·p_c`. So the chord midpoint lands on `Q`, the chord runs along +X, the rows run along `R_t·(0, 1, 0)` (+Z for the ceiling, −Z for the floor), and the LED face points along `R_t·(0, 0, 1)` (−Y, +Y). Rx(90°) maps (0, 1, 0) to (0, 0, 1) and (0, 0, 1) to (0, −1, 0); Rx(−90°) maps them to (0, 0, −1) and (0, 1, 0). The ceiling covers `x ∈ Q.x ± colsFit·panelW/2`, `z ∈ [G.min.z, G.min.z + h] ⊆ [G.min.z, G.max.z]` at height `G.max.y + 0.10`; the floor covers the same footprint. A numeric check with a section at heading 30° maps the canonical origin, +x and +y exactly to `Q`, `Q + x̂` and `Q + ẑ`; `volume-presets.test.mjs` repeats it over fuzzed headings.

**Snap presets** (enabled only for a detached section with `sectionRole` `ceiling` or `floor`; `sb = layout.sectionBounds(i)`, transformed):
```
ceiling-top: position_mm.y += round1(1000 · (G.max.y + 0.10 − sb.min.y))        (B is a Y rotation: frame y = world y)
floor-front: Δz = G.max.z − sb.min.z ; position_mm += round1(1000 · Bᵀ·(0, 0, Δz))  (only the horizontal components change)
```
"Snap to wall front" puts the floor's back edge at the front lip of the volume, so it extends toward the stage (the flat-wall XR layout).

**Pivot independence.** `t` and `R` are expressed in the section's own frame. Translating the layout (spec 03's stage and export frames, any pivot mode) translates `O_s` and `G` by the same vector and leaves `B` unchanged, so `fitVolumeOffset` returns `Object.is`-identical values in every frame (unit-tested), and spec 02's offset matrix is translation-equivariant (02 §6.5). A fitted ceiling therefore never drifts off the wall when the pivot changes, and nothing is stored in the stage frame.

For a flat chain (`depth = 0`), "Fit to volume" keeps the section's rows and starts at the wall line `G.min.z = G.max.z`: the ceiling extends toward +Z (the stage) from the top of the wall, and the floor `[G.min.z, G.min.z + h]` lies in front of it. When the volume is wider than 50 columns or deeper than 20 rows, the preset fills 50 × 20 and check C9 adds the info "Ceiling covers <x> of <depth> m; add a second section".

**How spec 02, 03 and 08 consumers treat these sections** (their rules, restated so the X10 acceptance criteria are checkable; X10 changes none of them):

| Consumer | Rule (owner) | Effect for a fitted ceiling or floor |
|---|---|---|
| Walk | Detached branch (02 §6.2, 6.2.1) | Hosted by `wall.defaultAnchorFor` (02's `setSectionsDetached` semantics; its dependants are re-anchored), so later chain sections are not moved by it |
| `floorRuns()` | Skips sections whose transformed front normal has `|n.y| > 0.9` (02 §6.12) | No safe-distance band for ceilings and floors |
| `firstEdge`, `lastEdge` | Skip detached sections (02 §5.2) | Spec 03's `bottom-left` and `wall-center` pivots ignore them |
| `pivotPoint('mesh-center')` | `generativeBox` = `generativeBounds()`: pre-offset, **attached sections only** from 02 T3 on (03 D5, 02 CR-03-b, 07 C34) | The ceiling does not count, so mesh-centre does not move (Q10 closed). |
| `bounds()`, `sectionBounds(i)` | `wallBox`: transformed, all sections (02, 07 C34) | `F`, Reset, open, new and restore framing include the ceiling (from 07 I4b); the pre-I4b automatic re-target reads `generativeBox` |
| `worldVertices()`, `columnQuads()` | Transformed, all sections (08 §6.10) | Coverage rays and the inner frustum see ceilings and floors (wanted: reflections and floor content are in shot) |
| `extentAcross(facing)`, height → `fits`, safe distance D | `stageExtent`: `worldVertices()` of the sections whose LED normal has \|n.y\| ≤ 0.9 (08 §6.10, 07 C34) | Ceilings and floors do not change D, `fits` or the frame size; the ray tests keep them (Q16 adopted). Identity on every harness wall. |
| `panelQuads()` | All sections, transformed (02) | X9 pixel area and X13 snapping include them |
| `Wall.totals()` | Counts detached panels, pixels and arc (02 §6.2) | A flat ceiling adds panels and pixels, 0° of arc |
| Exporters, atlas, panel-ID letters | Through the builder; list order (02) | Unchanged rules |
| StageChecks C9 | This spec (§6.13) | Info when a fitted surface no longer covers the volume |

### 6.7 Screenshot capture (X4)

Rendering is spec 07's `PreviewPass`, extended in T4.1 by one additive method. Spec 07's `capture` keeps its signature and output.

```
PreviewPass.captureCanvas({width, height, camera = <clone of this.camera>, include = {chrome: false, overlays: false, debug: false},
                           supersample = 1}) -> HTMLCanvasElement           (synchronous)
  sceneManager.withPassHidden(() => {                                         // r128 gizmo root (layer 0) hidden, spec 07
    cam = camera (always a clone; never the live main or preview camera); cam.aspect = width / height; updateProjectionMatrix
    cam.layers.mask = DEFAULT | ENVIRONMENT                                   // spec 07's still mask: the F5 backdrop dome is in
    if (include.chrome || include.overlays) cam.layers.enable(LAYERS.HELPERS)
    if (include.debug) cam.layers.enable(LAYERS.DEBUG)                        // spec 01's normal lines
    hidden = HELPERS enabled ? [...(include.chrome ? [] : sceneManager.helpersByRole('chrome')),
                                ...(include.overlays ? [] : sceneManager.helpersByRole('overlay'))].filter(h => h.visible) : []
    hidden.forEach(h => h.visible = false)
    W = width * supersample ; H = height * supersample
    rt = (renderer.capabilities.isWebGL2 && supersample === 1)
           ? new THREE.WebGLMultisampleRenderTarget(W, H)                     // MSAA, like the antialiased canvas (spec 07 R4)
           : new THREE.WebGLRenderTarget(W, H, {minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat})
                                                                              // supersample > 1 antialiases by downsampling
    // the target texture keeps the default LinearEncoding: r128 takes the pass's output encoding from it, which matches
    // the canvas under 05 Option L (spec 07 6.1); spec 07 U3 switches this to its default-framebuffer path
    prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt)
    draw = () => renderer.render(scene, cam)
    include.debug ? draw() : wallView.withContentMaterials(draw)              // spec 01's debug shading never leaks into a still (07 C48)
    renderer.setRenderTarget(prev)
    img = ctx2d(W, H).createImageData(W, H)
    band = new Uint8Array(W * 256 * 4)                 // read in bands of 256 rows, flip while copying: no second full buffer
    for (y0 = 0; y0 < H; y0 += 256) { rows = min(256, H - y0); renderer.readRenderTargetPixels(rt, 0, y0, W, rows, band);
                                       copy row r of band to img row (H - 1 - (y0 + r)) }
    rt.dispose(); hidden.forEach(h => h.visible = true); sceneManager.invalidate('still')
  })
  canvas(W, H).putImageData(img) ; if supersample > 1: drawImage onto canvas(width, height), imageSmoothingQuality 'high'
  return canvas

PreviewPass.capture({width, height}) -> Promise<Blob>                         (spec 07 R4, unchanged contract)
  = new Promise(resolve => captureCanvas({width, height}).toBlob(resolve, 'image/png'))
```
With its defaults, `captureCanvas` is exactly spec 07's R4 still: the preview camera clone, mask `DEFAULT | ENVIRONMENT`, MSAA on WebGL2, the same encoding, the content materials (`withContentMaterials`, which R4's `capture` also uses); banded reads return the same bytes as one full read. X4 makes S07-R4 a required task (C58), so T4.1 lands on it.

`ScreenshotRenderer.capture` adds the size policy, the watermark and the checks:

```
limits = canvasProbe limits (spec 07 CanvasProbe: max side, max area) ; gl = min(MAX_RENDERBUFFER_SIZE, capabilities.maxTextureSize)
side  = min(gl, limits.maxSide) ; area = min(limits.maxArea, 16777216)          (16.7 Mpx: the iOS Safari canvas ceiling)
s = supersample
if (width * s > side || height * s > side || width * height * s * s > area) s = 1        // drop supersampling first
if (width > side || height > side || width * height > area) {                          // then clamp, keeping the aspect
   k = min(side / max(width, height), sqrt(area / (width * height))); width = floor(width * k); height = floor(height * k); clamped = true }
canvas = previewPass.captureCanvas({width, height, camera, include, supersample: s})
if (!canvasProbe.fits(width, height) || canvas.width !== width) -> error toast "Screenshot failed: the browser could not allocate the image"
if (watermark) draw the monogram at the bottom-right: w = clamp(round(0.06 * width), 32, 160); h = round(w * 172 / 233);
               inset = max(ceil(24 * w / 233), 6) + round(0.015 * min(width, height)); globalAlpha 1, never recoloured (spec 06 D6)
return {canvas, width, height, clamped}
```

- `ProjectIO.exportScreenshot(kind)` first does `await brandMark.load()` when the watermark applies to that kind (spec 06's loader never rejects; if not `ready`, the still is saved without the mark and an info toast says so), then calls `capture`, then `canvas.toBlob(blob => blob ? downloader.saveBlob(...) : notifier.error(...), 'image/png')`.
- **Viewport stills** pass `include = {chrome: !prefs.screenshot.hide_chrome, overlays: prefs.screenshot.overlays, debug: prefs.screenshot.debug}` and the orbit camera clone. **Camera-view stills** pass `include` all false and the preview camera clone (the film camera's view), plus the watermark when `prefs.screenshot.watermark !== 'none'`.
- Everything between the helper hide and the restore is synchronous and renders into a render target, so no frame with hidden helpers is ever presented on the canvas.
- **Sizes.** Viewport 1x = the canvas client size; 2x = double; "4K" = 3840 × round(3840 / canvasAspect). Camera view: `aspect = filmbackWidth / filmbackHeight`, `fov = vFov` in degrees, `W × round(W / aspect)` with W = 1920 by default (3840 for "4K"). Examples: viewport 1x at 1240 × 868 keeps s = 2 (4.3 Mpx supersampled, plain target); 2x (2480 × 1736) and 4K (3840 × 2160) drop to s = 1 and so use MSAA on WebGL2; camera 1920 × 1280 keeps s = 2 (9.8 Mpx).
- `fitCamera` (for X12): 'front' places a perspective camera at the bounds centre, `+Z` at distance `max(halfW / tan(hfov/2), halfH / tan(vfov/2)) * 1.15` beyond `bounds.max.z`. 'top' uses `THREE.OrthographicCamera` with up = (0, 0, −1), so the stage (+Z) is at the bottom of the image, with frustum = bounds × 1.1 adjusted to the aspect. 'perspective' clones the current orbit camera.
- **File names** use `brand.filePrefix` (spec 06: `morph-led-wall` from spec 06 T6b on; the same property exists earlier with the legacy value). There is no local prefix helper.

### 6.8 Share-link codec (X7)

```
SHARE_LIMITS = { maxFragmentChars: 65536, maxJsonBytes: 1048576 }
encode:
  payload = JSON.stringify(serializer.write(project, {variant: 'share'}))
  bytes   = UTF-8(payload)                                                       (TextEncoder)
  if (bytes.length > maxJsonBytes) refuse ("Stage too large for a link")         (the decoder's inflate cap)
  if (CompressionStream): z = deflate(bytes) via new CompressionStream('deflate'); fragment = '#p=1d.' + base64url(z)
  else:                   if (bytes.length > 49147) refuse                       (the 65,536-character cap in bytes:
                                                                                  6 + ceil(4n/3) <= 65536 <=> n <= 49147)
                          fragment = '#p=1j.' + base64url(bytes)
  if (fragment.length > maxFragmentChars) refuse ("Use Save Project instead")   (applied AFTER compression)
binaryString(b) = concatenation of String.fromCharCode.apply(null, b.subarray(i, i + 8192)) for i = 0, 8192, ...
base64url(b)    = btoa(binaryString(b)) (ONE call) .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
decode(fragment):
  if (fragment.length > maxFragmentChars) throw ShareLinkError('too-large')     (before any work)
  match /^#p=(\d+)([dj])\.([A-Za-z0-9_-]+)$/ else 'syntax' ; version must be '1' else 'version'
  bytes = atob(...) once (<= 49,152 bytes)
  if 'd': reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader()
          total = 0; chunks = []
          loop { {done, value} = await reader.read(); if (done) break
                 total += value.length
                 if (total > maxJsonBytes) { await reader.cancel(); throw ShareLinkError('too-large') }
                 chunks.push(value) }
          a corrupt stream rejects the read -> ShareLinkError('corrupt')
  text = new TextDecoder('utf-8', {fatal: true}).decode(concat(chunks))           (invalid UTF-8 -> 'corrupt')
  JSON.parse -> serializer.read(data, {exportLimits}) (validator mandatory; B-L8; its budget checks) -> {v2, summary: {name, sections}, issues}
open:   ProjectSession.apply(v2, {reason: 'share'}) ; history.record('Open shared stage "<name>"') ; win.history.replaceState removes the hash
keep:   win.history.replaceState removes the hash; nothing else changes
hashchange (ShareLinks.attach): if location.hash starts with '#p=', run decode again and replace the banner
```

The inflate cap bounds both time and memory: a crafted link of at most 65,536 characters (≤ 49 KB of deflate data, which could otherwise expand about 1000:1) is cancelled after 1 MiB of output plus one chunk, before `JSON.parse` or the validator runs. The validator's `budget` checks then bound what a valid 1 MiB project can cost.

Chunking applies only to building the binary string, never to `btoa`: concatenated `btoa` chunks would contain mid-string `=` padding unless each chunk length were a multiple of 3. The 64 K cap makes one `btoa` call cheap. `'deflate'` (zlib) is chosen over `'deflate-raw'` for the widest `CompressionStream` support. Node 18+ provides `CompressionStream`, `DecompressionStream` and `Blob.stream()` globally, so the codec is unit-tested in Node.

Typical sizes: a 4-section v2 project is about 3 KB of JSON, about 0.9 KB deflated, about 1.2 K characters of URL.

### 6.9 History, autosave and harness determinism (X5, X8 delegated)

- **Coverage of this spec's state.** None of its fields is view-only, so the `history` and `autosave` variants carry all of them. Every use case in §5.5 records exactly once, and `History.onCommitted` schedules spec 07's autosave.
- **No write at boot.** Spec 07 writes autosave only from `schedule()`, which only `History.onCommitted` calls, so the bootstrap rebuild never writes. `rotateOnBoot()` moves `:current` to `:previous` before any write, and `:previous` is written only there, so neither a share-link boot nor edits made while the restore banner is showing can overwrite the previous session.
- **Determinism** comes from spec 07 G3: per-scenario `Storage.clearDataForOrigin`, the frozen wall clock (`2026-01-01T12:00:00.000Z`) with real `performance.now`, the UTC timezone and locale overrides, `?autosave=off` by default (scenarios that need autosave opt in and wait for `#autosave-status[data-state="saved"]`), and `toasts.json` from `#toast-stack[data-toast-log]`. T0.1 adds only what G3 lacks (§8.2). If G3 has not landed, the tasks with scenarios that depend on it wait.

### 6.10 Measurement snapping and storage (X13)

```
hit = raycaster.intersectObjects(wallMeshes(), false)[0]  ||  ray ∩ plane(y = 0)  (Ray.intersectPlane)      (MeasureTool, interaction)
{point, kind} = snapper(hit.point, pointerPx, {free: e.shiftKey})                                            (App-built closure)
   pickSnap: if (free) return {point: hit, kind: 'free'}                                                      (geometry/SnapPoints)
             cands = nearestWithin(snapCandidates(layout) ∪ {camera P, prop anchors}, hit, 0.5 m)
             best  = argmin over cands of |projectToPx(c) - pointer| ; accept if <= 12 px, else {point: hit, kind: 'free'}
if any |point component| > 100000: not placed ("Point out of range")                                         (reachability, §4.2)
distance = |B - A| ; delta = B - A ; horizontal = sqrt(dx^2 + dz^2)
pin: measurementController.pin({a: A, b: B}) -> project.measurements.push({id: 'm' + next, a, b})            (no label stored)
display: label = formatLength(distance, prefs.units) at render time (X14 changes it live)
translateStage(dx, dz): every pinned a and b gets x += dx, z += dz, clamped to ±100,000 m (LIMITS, 07 C45); emit MEASUREMENTS_CHANGED   (spec 03 StageAnchored; never records on its own)
```

Measurements are stored in the **stage frame** of the file's own pivot, like the camera, props, the HDRI point and the orbit (spec 07 C7, 4.2 rule 1). Snapping reads the stage-frame `wallController.currentLayout` (07 C60). As a spec 03 `StageAnchored` participant, they are re-expressed on explicit pivot edits with keep-stage-layout on, so they stay on the wall they measure. Like the camera, they are static points: a later section edit does not move them (re-measure after editing the wall).

`snapCandidates` covers every quad corner plus the panel centres. With 3,200 panels that is about 16k points, which is fine with the 0.5 m prefilter. The candidate list is recomputed only when `wallController.currentLayout` is a new object; the camera and prop anchors are read live.

### 6.11 Units (X14)

```
metric:   length m -> `${v.toFixed(3)} m` (inputs: value in m, step 0.01) ; small mm -> `${v} mm`
imperial: length m -> feet = m / 0.3048 ; display `${ft}' ${in.toFixed(2)}"` for readouts, decimal feet (2 dp) in inputs
          small mm -> inches = mm / 25.4 (2 dp) ; mass kg -> lb = kg / 0.45359237 ; area m2 -> ft2 = m2 / 0.09290304
parseLength(raw, system, {defaultUnit}): trims; accepts "12", "12.5m", "1250mm", "12ft", "12'", "12' 6\"", "150in", "150\"" ;
          unitless values use the field's display unit ; returns metres (NaN when unparseable -> field rule default)
pixel pitch: always mm (industry convention) ; angles: always degrees ; power: W/kW ; current: A ; voltage: V
```

The domain never stores imperial values. Panels convert at the DOM boundary only. `min`, `max` and `step` attributes are converted with the same functions, rounded outward. This applies to every length input, including the spec 02 offset rows (mm in metric, inches in imperial), the spec 03 pivot offset and the spec 05 projection controls. The unit preference never changes project data, including the electrical settings (§3.3 "Regional defaults" is a separate, explicit action).

### 6.12 Stage-pack regions (X11)

```
layoutE = layoutProject(project, {frame: 'export'})          (spec 03: origin = pivot; stage packs are export-frame consumers, 07 C60)
atlas   = computeAtlas(sections)
per section i: rect_i = { x: atlas.entries[i].ledOffsetX, y: atlas.totalLedY - rows_i * ledY_i, w: cols_i * ledX_i, h: rows_i * ledY_i }
                (top-left origin; identical placement to panel-ids.png, which is bottom-aligned: 1680-1708)
angularSpan_i = |cols_i * curveIntensity_i| (+ 0 for flat)   ; error if >= 179 deg ; warn if > 90 deg (configurable)
mesh_i = per-section geometry from the live F1/F4 profiles (ccw winding, averaged normals with σ, UV 0..1 per section),
         vertices in the export frame
glTF node extras: { morph: { sectionId, productId, resolutionPx: [w, h], pixelPitchMm, canvasRectPx: [x, y, w, h] } }
```

`stage-manifest.json` contains:
- `generator: {name: brand.jsonGenerator.name, version: APP_VERSION}` (the same pair spec 07's serializer writes; spec 06 §4.2, 07 C62);
- `units: "meters"`, `up_axis: "Y"`, `front_axis: "+Z"`;
- `pivot` (spec 03 block);
- `canvas {width_px, height_px, layout: "bottom-aligned, sections left to right (matches panel-ids.png)"}`;
- `sections[]` with `{id, name, mesh_gltf, mesh_obj, product_id, cabinets: {cols, rows}, resolution_px: {w, h}, pixel_pitch_mm, canvas_rect_px, angular_span_deg, warnings[]}`.

`viewports.csv` has the columns `section_id,name,mesh,x,y,w,h,pitch_mm,product_id`.

| Target | Files |
|---|---|
| `unreal-ndisplay` | `meshes/SM_LED_<name>.gltf` (UV channel 0 = 0..1 per section, which the nDisplay mesh projection policy uses for warp mapping; separate meshes are kept as Epic recommends), the manifest, the CSV, a README with Unreal import notes (the glTF importer converts metres to cm and Y-up to Z-up) |
| `disguise` | `meshes/<name>.obj` (UVs fill 0..1, as Designer requires for screens; resolution comes from the CSV, because the UV map carries none), the manifest, the CSV |
| `generic` | both formats |

Every file name starts from `brand.filePrefix`. Mesh names are sanitised and **de-duplicated** with `_2`, `_3` suffixes. This applies the B-L14 fix locally even if the ZIP fix has not landed.

### 6.13 Stage checks (X1, X2, X10)

| Id | Level | Rule |
|---|---|---|
| C1 | error | linked product and (`curveIntensity > curve.concaveMaxDeg` or `curveIntensity < −curve.convexMaxDeg`). The app's sign convention is + = concave toward +Z. |
| C2 | info | `unknown` link state, or `diverged` ("values differ from catalogue") |
| C3 | warn | adjacent chain sections with pitch differing by more than 1 % (a visible seam) |
| C4 | info | a section canvas over 4096 × 2160 (processor input) |
| C5 | warn | wall canvas (`Wall.combinedCanvasSize()`) over the selected processor's input; gives the processor count by canvas. (The 4K texture warning itself is spec 08's `#wall-texture-warning`.) |
| C6 | error | `panelRows > maxHang` (hang) or `> maxStack` (stack) |
| C7 | warn/error | angular span > 90° (warn) or ≥ 179° (error, stage pack) |
| C8 | warn | non-square pixels: \|pitchX − pitchY\| / pitchX > 2 % |
| C9 | info | a detached section whose role is `ceiling` or `floor` covers less of the chain box than one more row or column would add (`(G.max.z − G.min.z) − overlapZ ≥ panelH` or `(G.max.x − G.min.x) − overlapX ≥ panelW`), or does not overlap the chain box in plan at all. (A section dipping below the floor is spec 02's `.section-warning.below-floor`, not repeated here.) |
| C10 | error | one cabinet's power (per basis) exceeds one circuit's usable watts |
| C11 | error | one cabinet's pixels exceed one data port's capacity, or the processor family's `maxPxPerReceiver` |
| C12 | warn | linked product with `curve.lockStepsDeg` and a joint angle that is not one of the lock steps |
| C13 | warn | linked product whose `surface` list does not include the section's role (`sectionRole`, §6.1), for example a floor tile on a vertical section |

---

## 7. Export impact

| Format | Default settings (all features off or neutral) | When features are used |
|---|---|---|
| OBJ / MTL | **Unchanged** | X10: the presets write spec 02 fields only, so exports follow spec 02's rules (vertices through the builder). Product metadata comments are **not** added, so OBJ stays stable. X11 writes separate per-section OBJ files in the pack. |
| glTF | **Unchanged** | X10 as above. X11 per-section files with `extras.morph`. |
| JSON (file and ZIP) | **Changes once per landed item** (X1, X2, X3, X6, X9, X12, X13): the item's keys with their defaults, and `"version"` takes the revision number assigned to that item at merge (§4.2, 07 C40). Each is its own J re-baseline. | Values reflect the user's choices. `led_resolution.pixel_pitch_mm` stays spec 07's derived key (v1 formula); X1 adds no pitch key. |
| Panel-ID PNG | **Unchanged** | X16 (Could) adds a separate `port-map.png`. The atlas itself never changes. |
| ZIP ("Export All") | Only the JSON entry changes (with each J step) | No new entries. Stage packs are separate ZIPs. |
| Camera frame PNG (spec 07 R4) | **Unchanged** (`captureCanvas` reproduces it) | - |
| Screenshots (new) | n/a | `${brand.filePrefix}-viewport-WxH.png`, `${brand.filePrefix}-camera-<focal>mm-WxH.png` (spec 07's camera-frame name) |
| Spec sheet (new) | n/a | Printed HTML (`#print-root`). PDF via the browser. |
| Stage pack (new) | n/a | `${brand.filePrefix}-stage-pack-<target>.zip` (meshes, manifest, CSV, README) |
| Share link (new) | n/a | URL fragment (variant `share`), clipboard |
| Plan SVG (new, X15) | n/a | `${brand.filePrefix}-plan.svg`: top-down outline per section (thickness = product depth, otherwise 0.1 m; ceilings and floors dashed), dimension lines of the overall extents, camera position and frustum wedge (2D), props footprint, 1 m scale bar, units per the preference |

The safe-distance OBJ (B-M1) is unaffected.

---

## 8. Testing

### 8.1 Unit tests (`node --test "tests/unit/**/*.test.mjs"`)

| File | Covers |
|---|---|
| `project-v2-<item>.test.mjs` (one per landing task: `-products`, `-production`, `-lens`, `-template`, `-inner-frustum`, `-client`, `-measurements`) | The item's §4.2 rows: round trip (write, read, deep-equal), "absent means default" with no issue, the validation codes for out-of-range values, `KNOWN_REVISION` bumped by exactly one and `"version"` written as `"2.<KNOWN_REVISION>"`, key positions, the reachability property case, v1 wall-only scope (section defaults; live non-wall values kept). A file of the next revision read with this revision's schema drops the newer keys with `dropped-unknown` and raises `newer-revision`. |
| `share-variant.test.mjs` | The `share` variant: `assets: []`, every `logo: null`, `hdri.source: null`, `display.content` `hdri` written as `color`, no `viewport`, no view-only fields, no derived keys, no `project.client` / `project.notes`; read back with zero issues; `apply(…, {reason: 'share'})` keeps the live view-only fields. |
| `section-values.test.mjs` | `CabinetData`: `from`, `clone`, no shared references after `appendLikeLast` and `clone`; `appendLikeLast` copies `productId` and cabinet. |
| `panel-catalog.test.mjs` | Unique ids. Required fields. Pitch consistency within 0.5 % (§6.1). Every row of `PANEL_PRODUCTS` is `verified: true` with `source.url` and `source.retrieved`. `findProduct('absen-pl2-5-pro')` (a documented candidate) is `null`. `productSectionFields`. `linkState` for all four states. `listProducts({surface})`. |
| `stage-estimator.test.mjs` | The §6.2 worked example exactly (including 3-phase circuits and 2 XD). The frame-rate guard (23.976 fps gives 420,000; 120 fps gives 210,000, 29 ports, 3 XD). Unknown-data exclusion. 8-bit vs 10-bit ports. `maxPerDataChain`, `maxPerPowerChain` and `maxPxPerReceiver`. Avg vs max basis. Guards: C10 and C11 give `null` readouts, no `Infinity`; `generic-1g` gives no `NaN`. An empty wall gives zero cabinets and no throw. `applyRegionDefaults` values. |
| `stage-checks.test.mjs` | C1-C13 with minimal fixtures, including the sign convention (a convex −4° wall on BP2V2, convex max 0°, gives C1), C13 for a BM4 on a vertical section, and C9 for a ceiling fitted before a section was added to the chain. |
| `moire.test.mjs` | The §6.3 worked example to 1e-6 with p = 500/176, and its displayed strings. Disk MTF zero at 1.2197 ± 1e-3. Band edges. `riskyDistanceBand`. Human distances (`3.437747`). |
| `center-hit.test.mjs` | The worked example (section 0, 5.000 m, `onPanel`). Equals spec 08's `centreDepth` on a panel hit and `D0` off-panel (`Object.is`) over a grid of `flat3` poses. A ray through the shared edge of two columns reports the lower `(sectionIndex, col)`. Mixed-pitch wall: the reported section is the one under the frame centre. No `analyzeCoverage` options are needed. |
| `curved-volume.test.mjs` | The §6.4 worked example (rounded cDeg, R_eff, θ0 rounding). Both conventions. The 50-column split. Replace and Append continuity: the end heading of section k plus the offset of section k + 1 equals the next panel heading, checked via `computeWallLayout`. Append ignores Symmetric. Lock-step snapping. "Too tight" errors. |
| `frustum-coverage.test.mjs` (spec 08's file, extended) | Without options: `Object.is`-identical to spec 08 on every case, and no new arithmetic runs (spy). With options: `distance`, `cornerDepths` and `centreDepth` stay `Object.is`-identical (the exact predicate is used for those rays). Border rule equals the corner rule on a grid of `flat3` poses (`Object.is` on status), including border rays through column edges. Mixed-height fixture gives `offCenter`. The §6.5 worked example: 2,370,152.03 px and 2,867,883.96 px (±0.5 px), "2.37 Mpx" and "2.87 Mpx", nearest 5.000 m; status unaffected by overscan. Back-face and behind-camera rejection; a quad straddling the near plane; a quad partly outside one side plane (exact fraction against a hand computation); `nearest` ignores points outside the non-overscanned frame. |
| `perf-coverage.test.mjs` | `large_wall` with `nearest` and `pixels` on: median < 2 ms per `analyzeCoverage` call over 50 runs; `packPanelQuads` called once per layout object; no allocation per call (heap delta within noise over 1,000 calls). |
| `panel-quads.test.mjs` (spec 02's, extended) | `normal`, `ledX`, `ledY` on every quad; `normal` equals σ × the stage-facing normal for chain sections; transformed normals for `postTransform`. |
| `inner-frustum-view.test.mjs` (fake THREE-free geometry via the builder) | **Normal invariant:** for every overlay strip, under `LegacyProfiles` (pre-F1, `'right-panel'`) and the live profiles (post-P2-2 and F1), in a wall with one reversed section, the stored `normal` of every vertex has a positive dot product with the LED-side `normal` of its quad from `panelQuads()`. One mesh per section in combined, section and panel mode. A live `SECTION_CHANGED` updates the listed sections in place (same arrays, new values) and touches no other section. `setVisible(false)` disposes every geometry and the material. |
| `volume-presets.test.mjs` | `chainGenerativeBounds` ignores detached sections. For fuzzed chains (1-5 sections, curves ±30°, heading changes ±90°) and a detached target with a random heading change: after `fitVolumeOffset` and spec 02's `applySectionOffsets`, the ceiling's LED normal is (0, −1, 0) and the floor's (0, 1, 0) within 1e-9, the chord midpoint is `Q` within 0.1 mm, the footprint lies in `[G.min.z, G.max.z]` (ceiling) and the 180° arc and U fixtures match their expected boxes. Equivariance: the values are `Object.is`-identical for `frame: 'stage'`, `'export'` and `'layout'` and for every spec 03 pivot mode. Snap presets change only `position.y` (ceiling) or the horizontal components (floor). Flat chain keeps rows. Clamps at 50 × 20. |
| `share-link.test.mjs` | Round trip (deflate and raw). The 65,536-character cap applied after compression (a 200 KB project that deflates under the cap is accepted). The 1j raw pre-check at 49,147 bytes. A wrong version is rejected. Tampered base64 throws `ShareLinkError('corrupt')`. Unicode names survive. A 48 KB payload encodes with exactly one `btoa` call (spy) and no `=` inside the output. **Inflate bomb:** a link carrying 32 MiB of spaces (32,624 bytes deflated, 43,505 characters) is rejected with `'too-large'` in under 250 ms, having read at most 1 MiB plus one chunk, and `JSON.parse` is never called (spy). |
| `units.test.mjs` | Format and parse tables, round trip within 1e-9 m, invalid input gives NaN. |
| `spec-sheet-model.test.mjs` | Rows for a fixture project, including client and notes. The view test asserts `textContent` use, that `render` resolves only after every image's `decode()`, and that the fallback opens its tab synchronously (before the first `await`, spy order) and links both stylesheets. |
| `stage-pack.test.mjs` | Rects equal the atlas placement. De-duplicated names. Span checks. The manifest schema and its `generator` (`brand.jsonGenerator.name`, `APP_VERSION`). |
| `screenshot-size.test.mjs` | The size policy of §6.7 with fake limits: supersampling dropped first, aspect kept on clamp, area ≤ 16.7 Mpx, band reads cover every row exactly once (fake renderer). Layer masks per `include` (base `DEFAULT \| ENVIRONMENT`; `HELPERS` only with chrome or overlays; `DEBUG` only with debug). Render-target choice: multisample iff WebGL2 and s = 1. `capture` still resolves to a PNG `Blob` (spec 07's contract). |
| `menu-button.test.mjs` | The §3.5 key table on a fake DOM through `bindScopedKeys`; Escape returns focus; disabled items skipped; no `keydown` listener outside `ui/dom.js` (rule S5). |

**Spy updates in existing tests, per task:**
- T1.2: `wall-controller.test.mjs`: `setSectionProduct`, `batchSetProduct` (N sections) and `reapplyProduct` run one rebuild and one `history.record`; `unlinkProduct` and `setSectionCabinet` run zero rebuilds and one record each, and `setSectionCabinet` calls `stage.refresh`.
- T2.3: `wall-controller.test.mjs`: the P1 order spy gains `stage.refresh` after `hub.refresh` (step 5a); new `stage-controller.test.mjs`.
- T3.2: `camera-hub.test.mjs`: `emit CAMERA_MOIRE_CHANGED` directly after `CAMERA_COVERAGE_CHANGED`, on full and `poseOnly` refreshes; the hub reads `wallController.currentLayout` on every refresh; `CameraController.setFilmback` writes `photositesH`.
- T9.1: `camera-hub.test.mjs`: the options object; the coverage payload deep-equal to spec 08's; `packPanelQuads` only on a new layout object.
- T9.3: `wall-controller.test.mjs`: `innerFrustum.rebuild(layout)` at step 4b iff enabled, before `hub.refresh`; `camera-hub.test.mjs`: `innerFrustum.update` iff enabled.
- T10.2: `wall-controller.test.mjs`: `applyVolumePreset` runs one rebuild and one record; on the last section or an already-detached one, every other section's transformed vertices are `Object.is`-equal before and after.
- T6.2, T7.2: spec 07's session tests gain the reasons `'template'` and `'share'` (no viewport restore, view-only fields kept, framing as `new`); `applyWallScope` keeps the live camera, props, display, HDRI, pivot and UV settings.
- T13.1: spec 03's pivot-controller test: the measurement participant is re-expressed by −ΔO with keep-stage-layout on.
- T13.2: `keymap.test.mjs` (spec 07) covers the `M` row and the `menu` scopes; `viewport-input.test.mjs` covers the extended Escape chain, the gizmo rule (entering measure mode detaches the gizmo; `G` leaves measure mode) and measure pointer routing.

**Static** (`tests/static/check.mjs`): the `analysis/` layer row and the `ui → domain/Units.js` exception; new DOM ids each owned by exactly one module; new events have emitters and subscribers; new domain field writers; no module-level state; no new read site of `Strategies` or `MeshProfiles` leaves; spec 07's S2 (storage only in `Autosave`/`Prefs`), S3 (no `alert`/`confirm`/`prompt`), S5 (no new `keydown` listener) and S6 (unique chords) stay green.

### 8.2 Harness (`tests/regression/`)

**Harness prerequisites (merged into spec 07 G3, C57).** Revision 2's T0.1 is now part of 07 G3 in the one harness-only PR series 08 P2-0 → 01 T2 → 07 G3 → G4 → G6. G3 brings the per-scenario browser-context isolation, clock, timezone, `?autosave=off` and toast log, and also:
- `inject.mjs` hooks `window.print` and `navigator.clipboard.writeText` and records the calls. `print.json` and `clipboard.json` are written **only when a hook recorded something**, so no existing scenario gains an output file;
- G3's own zero-diff and flake checks cover these hooks.

**New scenarios** in `tests/regression/scenarios-features.mjs` (the file spec 03 introduces). Each scenario's baseline is captured at the commit that lands its feature (declared as added, `"<scenario>/**"`, in that commit's `--expect` manifest; 08 §8.1, 07 C26). There is no legacy equivalent, so these are forward regression guards.

| Scenario | Steps and outputs |
|---|---|
| `products_estimates` | Import a v2 fixture (BP2V2 20 × 10 plus a custom section with no data). Record the `#stage-*` texts and `#stage-checks`. Switch to 3-phase 400 V and record. Apply "North America: 120 V 1-ph, 20 A" and record. Save the JSON. |
| `curve_limits` | BP2V2 with curve 12° gives C1 in the card hint and the checks list |
| `product_batch` | Select 3 sections (spec 02), pick BP2V2 in the batch panel: one history entry, three linked cards. Hand-edit one stored width in a v2 fixture: the card shows the `diverged` state and C2. |
| `moire` | Import the v1 fixture "20 × 10 cabinets of 500 × 500 mm at 176 × 176 px" (flat). Enable the camera preview; set filmback `arri-lf`, focal 35, pos-x 5, pos-y 2.5, pos-z 5, rotations 0. Focus at 3 m, T2.8: record the `#moire-*` texts. Focus on the wall: record again. |
| `inner_frustum` | Same fixture and pose. Toggle on, overscan 10. Record `#inner-frustum-pixels` ("2.87 Mpx on 1 section"), `#moire-nearest` ("5.00 m") and a canvas screenshot. Pan 90°: `#frustum-status-text` reads "Not aimed at wall". |
| `coverage_mixed` | Import the mixed-height fixture of §6.5 and set its pose: `#frustum-status-text` reads "Off-center". |
| `screenshots` | Viewport 1x, 2x and camera-view downloads, with an HDRI backdrop on when F5 has landed. Record the PNG IHDR sizes and compare the PNG pixels (screenshot thresholds). |
| `undo_stage` | Pick a product; change a stage setting twice **inside one harness step with no settle between the two `setValue` calls** (well under 750 ms, so one coalesced entry); apply a ceiling preset (one entry); load a template; undo ×4, redo ×1. Record the stats, section snapshot, `#stage-*` texts and `#history-undo` `title`/`disabled` after each step. (Coalescing timing itself is unit-tested with spec 07's injectable `clock`.) |
| `share_link` | **Opts in to autosave** (loads without `?autosave=off`; waits for `#autosave-status[data-state="saved"]`). Open the page with a fixture `#p=` fragment: the banner text is recorded and the project is unchanged. Click Open: stats and section snapshot; the hash is cleared. Make an edit, wait for "saved", reload with the fragment: both banners show. Set a second fragment through `location.hash` in the open tab: the banner is replaced (`hashchange`). Click Share: the clipboard length, the toast text, and decoded equality, checked in Node. |
| `templates` | Each available template: stats and JSON save. The camera pose and props set before the load are unchanged after it. The curved-volume dialog with the §6.4 values gives the result text; Append disables Symmetric. |
| `volume_presets` | Build the 180° fixture, add a section, apply "Ceiling: fit to volume": record the offset fields, OBJ and glTF in 3 modes, and a canvas screenshot. Switch the pivot to `wall-center` and back (spec 03): the ceiling's transformed bounds relative to the first chain edge are unchanged (recorded). |
| `stage_pack` | Each target: ZIP entries, manifest and CSV |
| `spec_sheet` | Click: one `print` call is recorded. `#print-root` text snapshot. |
| `measure` | Front view. Click `#tool-measure` (then later press M). Click two known pixel positions on the default wall. Record the overlay text. Pin. Escape exits. Save the JSON (one measurement). Toggle ft: the pinned label re-formats. |
| `units_imperial` | Toggle ft. Record the texts of the stage panel, card and camera inputs. The stage settings are unchanged. |

**Reference: `camera` scenario statuses** (spec 08 P2-11a, unchanged by X9 because `flat3` is one rectangular face; listed so T9.1's zero-diff gate is checkable):

| States | Pose (from the baseline) | Status |
|---|---|---|
| `cam_00_disabled` | (0, 1.5, 5), preview off | not computed (`--`); were it computed, the centre ray passes exactly through the top-left corner and hits (inclusive test) |
| `cam_01` … `cam_07` | unrotated, frame taller than the 1.5 m wall | Exceeds wall |
| `cam_08_rotation` | (2.5, 1.8, 4), rot (5, −10, 2) | Exceeds wall (W/H at `D0` change in P2-11a) |
| `cam_09_far` | (2.5, 1.8, 20), same rotation | Exceeds wall (frame ≈ 17 × 11 m against 7 × 1.5 m: `fits` is false; W/H change in P2-11a) |
| `cam_09b_within_bounds` | (3.5, 0.75, 1) | Within bounds |
| `cam_09c_off_center` | (0, 0.75, 1): centre ray exactly on the left edge (hits, inclusive) | Off-center (left corners miss, right corners hit, `fits`) |
| `cam_10_clamps` | (0, 0, 1), rot-x 90 | Not aimed at wall (`D0 = null`, W/H `—`) |
| `cam_11` … `cam_15` | unrotated | Exceeds wall |

**Intentional golden changes, one feature per re-baseline commit (never batched)** (08 §8.1's procedure: a full run gated by the commit's `--expect` manifest, with `rects` fields where a step is rect-limited, 07 C26, C57; every output not listed must stay IDENTICAL). Abbreviations:
- **J** = every `json` output and every ZIP's JSON entry: `{default, flat3, concave_offsets, convex, mixed, box_corner, large_wall}/{initial,final,roundtrip}__export-json` (where present) and `final__export-zip`; `box_corner/zipjson_roundtrip__export-json`; `ui_sections/{edited,final}__export-json`; `import_edge/{i,ii,iv,v}__export-json`; `name_with_panel_ids/name_0{2,3}_*__export-json`; `logos/*__export-zip`; plus the JSON outputs of the spec 07/08 scenarios and of this spec's scenarios that exist at that commit (`p2_*`, `project_v2_roundtrip`, `import_v1_matrix`, `products_estimates`, …).
- **C** = card snapshots: `{default, flat3, concave_offsets, convex, mixed, box_corner, large_wall}/sections_initial`, `ui_sections/ui_*`, the `import_edge` wall states (`*_state`, `*_after_*`, `vi_before`).
- **T** = the text outputs of `ui_visual` states 00, 02, 04, 05, 06, 07 and 08 (`NN_*.text.json`). `lib/uiprobe.mjs` (lines 122-131) records every `button`, `label`, `select`, `[title]`, `[aria-label]` and `[placeholder]` with **no visibility filter**, so a control added inside a hidden block still changes T in states where it is not shown.
- **U** = every output of `ui_visual` states 00, 02, 04, 05, 06, 07, 08 and 09 (text, styles, viewport and sidebar screenshots). U includes T. States 01 and 03 (overlay styles only) must stay identical.
- **L** = T plus the styles, viewport and sidebar screenshots of `ui_visual` 04-09 (the camera options block is visible from state 04 on).
- **S** = every canvas screenshot outside `ui_visual` (`app.screenshotCanvas()` takes a page-surface clip of the canvas rect with `fromSurface`, so anything drawn over the canvas appears in it).

| Step | Re-baselined outputs | Must stay identical (explicitly checked) | Why |
|---|---|---|---|
| (T0.1) | merged into 07 G3 (C57) | – | – |
| T1.2 | **J** | all OBJ/MTL/glTF/PNG, every state, **S**, every `ui_visual` output | X1 rows (`product_id`, `cabinet`); one revision bump (numbered at merge) |
| T1.3 | **C**, **U** | **J**, **S**, `cameraState()` outputs | card rows: product picker, link states, cabinet data; batch select |
| T2.3 | **J** | everything else | `production`; one revision bump (number assigned at merge) |
| T2.4 | **U** | **C**, **J**, **S** | new "Stage & Power" section |
| T3.2 | **J** | everything else (no UI yet) | camera lens rows; one revision bump (numbered at merge) |
| T3.3 | **L** | `ui_visual` 01 and 03; **C**, **J**, **S**; `cameraState()` in `camera`, `pilot_look`, `preview_off_in_pilot`, `gizmo_drag` (`camera_01_translated`, `camera_02_rotated`), `preview_resize`, `import_edge` (`i_empty_state`) | lens block (hidden in 00 and 02, but present in their text) |
| T4.1 | **U** | **C**, **J**, **S**; `still_capture/*` and every `#export-camera-frame` output (S07-R4 lands before T4.1) | export-section buttons and the screenshot menu; `captureCanvas` reproduces R4 |
| T6.2 | **J** | everything else | `project.template_id`; one revision bump (numbered at merge) |
| T6.3 | **U** | **C**, **J**, **S** | Project section: Templates button |
| T7.2 | **U** | **C**, **J**, **S** | Project section: Share button |
| T9.1 | **none** (zero-diff gate) | every `cameraState()` output listed under T3.3 and every `camera` state (table above) | coverage options only; spec 08 payload unchanged |
| T9.2 | **J** | everything else | `display.inner_frustum`; one revision bump (numbered at merge) |
| T9.3 | **L** | `ui_visual` 01 and 03; **C**, **J**, **S** (overlay off by default), `cameraState()` | toggle, overscan and readout rows |
| T10.2 | **C**, **U** | **J** (presets add no key), **S**, all exports | "Ceiling / floor" menu in spec 02's offset group |
| T11.1 | **U** | **C**, **J**, **S** | export section: Stage pack |
| T12.1 | **J** | everything else | `project.client`; one revision bump (numbered at merge) |
| T12.2 | **U** | **C**, **J**, **S** | Project section: client, notes; export section: Spec sheet |
| T13.1 | **J** | everything else | `measurements`; one revision bump (numbered at merge) |
| T13.2 | **U**; spec 07's `a11y_keyboard` help-dialog text (KEYMAP row) | **C**, **J**, **S**, `ui_visual` 01 and 03 | "Tools" sidebar section with `#tool-measure`; nothing is drawn over the canvas while measure mode is off |
| T14.2 | none (metric default); `units_imperial` is a new scenario | everything | n/a |
| T15.1 | **U** | **C**, **J**, **S** | export section: Plan |
| T16.1 | **U** | **C**, **J**, **S** | port-map control |

The J steps happen in landing order; each makes its item's one revision bump, numbered at merge (07 C40). Their `--expect` manifests list only `*/*.json` and `*/*__export-zip*`.

**Header and canvas guard.** This spec adds nothing to the header and nothing over the canvas by default. For every UI step above, the compare must also show `ui_visual/00_initial.styles.json` `.header` height and `#three-canvas` client size unchanged, `ui_visual` 01 and 03 unchanged, and **no** canvas screenshot (**S**) changed (AC3).

### 8.3 Manual checks (owner)

1. Import a stage pack glTF into Unreal 5.x (glTF importer). Assign one section to an nDisplay viewport with the Mesh projection policy. The warp fills the viewport, normals face the stage, and the origin equals the pivot.
2. Import the Disguise OBJ. The screen renders (not black) and the resolution matches the CSV.
3. Print the spec sheet to PDF in Chrome and Safari, in A4 landscape and US Letter. Images are present on the first print (no blank frames). On an iOS in-app browser without `print`, the fallback tab opens and is styled.
4. Check a 4K screenshot on a laptop GPU and on an iPad (the clamp toast appears only when needed; no blank PNG). A camera-view still with an HDRI backdrop shows the backdrop.
5. Open a share link from Slack and email (fragment preserved; banner shows; nothing changes before Open). Paste a second link into the same tab: the banner updates.
6. Compare the inner-frustum overscan with an nDisplay ICVFX camera of the same lens and custom-frustum settings (Q6).
7. Fit a ceiling over a curved volume, then change the pivot mode and offset (spec 03): the ceiling stays on the wall in the viewport and in the exports.

---

## 9. Acceptance criteria

**Global**
1. With every feature at its default, all existing harness scenarios except the manifests of §8.2 compare IDENTICAL: OBJ, MTL, glTF, PNG, states and screenshots.
2. Every new module passes `tests/static/check.mjs` (layering, ownership, events, writers, no module-level state, no new profile read site) and spec 07's rules S2, S3, S5 and S6.
3. After every step of this spec, `.header` height and the `#three-canvas` client size at 1600 × 1000 equal their pre-spec values, `ui_visual` 01 and 03 are unchanged, and no canvas screenshot outside `ui_visual` changes in a UI-only step.

**X1: product library**

4. Only `verified: true` products exist in `PANEL_PRODUCTS` and appear in pickers, filtered by the section's surface role. Each shows pitch, size, resolution, weight and power, with the source URL and date in the summary tooltip.
5. Choosing a product sets the 4 geometry fields and `productId`, writes all 4 inputs back, patches the card (hint, summary, 4K box, title), causes exactly one rebuild and one history entry. The fields become read-only. "Unlink" keeps the values and makes the fields editable without rebuilding. A batch choice on N selected sections is one rebuild and one history entry.
6. A JSON round trip preserves `sections[].product_id` and `sections[].cabinet`. An unknown id is kept (`unknown` state, C2). Stored values that differ from a known product show the `diverged` state with "Re-apply product". Adding a section after a linked one copies `product_id` and the cabinet data as independent objects.

**X2: estimates and checks**

7. The Stage & Power readouts equal the §6.2 worked example for the fixture, digit for digit after formatting, including "15 x 16 A" and "+ 2 x XD". At 23.976 fps the port capacity is not scaled above the 60 Hz value.
8. Sections without data are excluded and named ("excl. N cabinets"). No readout shows a fabricated 0, `NaN` or `Infinity`.
9. C1, C3, C5, C6, C8, C10, C11, C12 and C13 fire on their fixtures. Their messages name the section and the limit.

**X3: moiré**

10. The `moire` scenario (20 × 10 cabinets of 500 × 500 mm at 176 × 176 px; ARRI LF, 35 mm; camera at (5, 2.5, 5)) shows "5.00 m (Wall 1)", "2.43 photosites per LED pixel", "2.95 LED pixels" and risk LOW at focus 3 m / T2.8; risk HIGH with focus on the wall; the band reads "3.05 m – 17.3 m"; the viewing distances read "≥ 2.8 m" and "≥ 9.8 m". This works with T3.2 alone (no T9.1 code).
11. Without photosites the block says "Enter sensor photosites" and computes nothing else that depends on them.

**X4: screenshots**

12. A viewport 2x screenshot has exactly twice the canvas client size, unless clamped (toast). Supersampling is dropped whenever the supersampled area would exceed 16.7 Mpx or the probed canvas limits; a still rendered at s = 1 on WebGL2 is multisampled. Grid, axes and markers are absent when "hide" is on; the gizmo is never present.
13. A camera-view PNG has the filmback aspect within 1 px, shows no helpers, and includes the `ENVIRONMENT` layer (the F5 backdrop dome when it is on).
14. During a capture, the live viewport never presents a frame with hidden helpers.
15. The watermark is the Morph monogram at full opacity, never recoloured; if `BrandMark` is not ready the still is saved without it and a toast says so. Spec 07's `PreviewPass.capture` still resolves to a PNG `Blob`, and its `still_capture` outputs are unchanged by T4.1.

**X5 and X8: delegated to spec 07** (spec 07 ACs 16-21 apply)

16. Every use case in the §5.5 history table creates exactly one history entry; Ctrl+Z restores the previous state of every field of §4.2.
17. After an edit to any §4.2 field, spec 07's autosave slot holds it, and Restore reproduces it.
18. Two consecutive harness runs of `ui_visual` (and `undo_stage`) on the same commit are identical (spec 07 G3 determinism).

**X6: templates**

19. Every listed template loads in one undo step without a confirmation, shows the undo toast, and validates with zero issues. It replaces the wall only: the camera pose and lens, props, display, HDRI, pivot and UV settings are unchanged. The `curved-270-d20` stats are 1,128 panels (94 columns × 12 rows) across 2 sections.
20. The dialog shows the §6.4 numbers for R = 10 m, 270°, BP2V2 (2.865° per joint, 269.31°, radius 10.000 m, face 9.997 m). "Append" continues the arc without a kink, which the unit test asserts, and disables "Symmetric".

**X7: share link**

21. Encode then decode reproduces the `share`-variant JSON exactly. Opening a link shows the banner and changes nothing until Open; Open applies the project as one history entry; either choice clears the hash. Changing only the hash in an open tab shows the new banner.
22. A malicious name (`<img src=x onerror=…>`) in a shared link renders as text. This requires the B-M4 fix (S07-D7). The X7 task is blocked until it lands.
23. Opening a share link when a previous autosave slot exists still shows spec 07's restore banner, and the previous slot is unchanged until the user decides.

**X9: inner frustum and coverage**

24. Statuses are spec 08's four (`offWall` "Not aimed at wall", `within`, `offCenter`, `exceeds`). Every `camera` scenario state matches the §8.2 reference table, and T9.1 changes no `cameraState()` output. The mixed-height fixture reads "Off-center".
25. The overlay tints only the LED side of each section (a reversed section is tinted only when the camera is on its LED side), only inside the overscanned frame, never in the camera preview or a camera-view still. It follows camera gizmo drags (uniforms on every refresh) and section gizmo drags (live `SECTION_CHANGED`). It is hidden in pilot (spec 07 Q7) and correct again on pilot exit. In panel mode it adds one draw call per section. Its colour in the output equals `--scene-inner-frustum` blended at 0.18.
26. `#inner-frustum-pixels` reads "2.37 Mpx on 1 section" without overscan and "2.87 Mpx on 1 section" with 10 % overscan on the fixture (unit values 2,370,152.03 and 2,867,883.96 px, ±0.5 px), and "—" while the inner frustum is off. `#moire-nearest` reads "5.00 m".
27. On `large_wall` with the inner frustum on, one coverage refresh takes a median under 2 ms (unit perf test) and allocates nothing per call.

**X10: ceiling and floor presets**

28. "Ceiling: fit to volume" on the 180° arc and U fixtures produces a detached, flat section whose LED normal is (0, −1, 0) within 1e-9 (checked through `panelQuads().normal` and visible in spec 01's normal view), whose lowest point is at `G.max.y + 0.10`, and whose z-range lies within `[G.min.z, G.max.z]`. "Floor: fit to volume" gives (0, 1, 0) and the same footprint; "Floor: snap to wall front" starts at `G.max.z`. On a flat chain, both start at the wall line and extend toward +Z.
29. A preset is one rebuild and one history entry and adds no JSON key. Applied to the last section or an already-detached one, it moves no other section (`Object.is` on every other section's transformed vertices), produces no floor run for the ceiling or floor, and leaves the `bottom-left`, `wall-center` and `mesh-center` pivots unchanged (`generativeBox` is attached-only, 02 CR-03-b), and D and `fits` unchanged (`stageExtent`, 07 C34). After any later pivot change (spec 03), the ceiling's position relative to the wall is unchanged.

**X11: stage pack**

30. Each section is exported as its own mesh, with UVs in [0, 1], normals toward the LED side and vertices in the export frame. Manifest rects equal the panel-ID atlas placement. The manifest's `generator` is `{name: Brand.productName, version: APP_VERSION}`.
31. A section spanning ≥ 179° blocks the pack with an error naming it. The Stage pack button exists only in builds that include F1 and F4.

**X12: spec sheet**

32. Clicking "Spec sheet" calls `print()` once, after every image has decoded. `#print-root` contains the project name, client, notes, date, totals, sections table, at least the perspective image and the disclaimer. The app UI is hidden in print media. Without `print`, the fallback tab is opened synchronously in the click handler and is styled by the print stylesheet.

**X13: measurement**

33. On the default wall in front view, measuring the two bottom corners of the first section reads `2.500 m` (5 × 500 mm) with snapping, and `Δy 0.000`.
34. Escape cancels a pending point; a second Escape leaves the tool, before any deselect. `M` and `#tool-measure` toggle (through `KEYMAP` / `registerActions`). Entering measure mode detaches the gizmo; `G` leaves measure mode. Orbit drags in measure mode do not place points. A pinned measurement is one history entry, is saved in `measurements` with no label, re-formats when the units change, and moves with the wall on a spec 03 pivot edit. Labels follow the camera under render-on-demand.

**X14: units**

35. Imperial mode shows 2.500 m as `8' 2.43"` in readouts and `8.20` ft in inputs. Typing `8' 2.43"` stores 2.500 m ± 0.5 mm. Pitch stays in mm. Toggling units never changes `stage.power`.

**X15 and X16**

36. The plan SVG opens in a browser, and its scale bar measures 1 m at the declared scale.
37. The port map labels every cabinet with its port number, and per-port pixel totals stay ≤ C (§6.2).

**Persistence and share safety (added in revision 2)**

38. Each item's landing task makes exactly one revision bump: its number is assigned at merge, recorded in `ProjectSchema.REVISIONS` with the keys it introduced, and written as `"version": "2.<n>"` (07 C40). A file written by a later build opened by an earlier one drops the unknown keys with `dropped-unknown` and shows the `newer-revision` warning; no field of an unimplemented item is ever read.
39. A share link that inflates beyond 1 MiB is rejected with "This link is invalid, too large, or was made by a newer version" before `JSON.parse` runs, in under 250 ms (unit test), and the current project is unchanged.
40. Share links carry no `project.client`, `project.notes`, logos or HDRI file; the copy toast says so.

---

## 10. Task breakdown

| ID | Task | Pri | Effort | Depends on |
|---|---|---|---|---|
| (T0.1) | **Merged into S07-G3** (C57): the print and clipboard hooks ship with G3's isolation work; no task here | – | – | – |
| T0.2 | `analysis/` layer and the `ui → domain/Units.js` exception (ARCHITECTURE §1.3, `check.mjs`); CSS block 20-29; `ui/MenuButton.js` and the `menu` / `menu-button` KEYMAP scopes | Must | S (0.5) | Phase 1 merged, S07-I1 |
| ~~T0.3~~ | Withdrawn in revision 2: each item lands its own schema rows (§4.2) | - | - | - |
| T1.1 | `PanelCatalog` (Appendix A, verified rows only, `linkState`, `listProducts`) + tests | Must | S (0.5) | none |
| T1.2 | `CabinetData`, `WallSection` fields; `setSectionProduct / batchSetProduct / reapplyProduct / unlinkProduct / setSectionCabinet` + history rows + spy updates; **schema rows `product_id`, `cabinet`, one revision bump (numbered at merge); J re-baseline** | Must | M (1.5) | T1.1, S07-D1…D5, S07-H1 |
| T1.3 | Card UI: product picker (surface filter), link states, write-back, summary, cabinet data; batch product select (spec 02); **C + U** re-baseline | Must | M (1.5) | T1.2, B-M4 (S07-D7); spec 02's card and batch panel if landed |
| T2.1 | `ProcessorCatalog` + `StageEstimator` (guards, XD, frame-rate rule, receiver limit) + tests | Must | M (1.5) | T1.1 |
| T2.2 | `StageChecks` C1-C13 + tests (C9 and C13 need `sectionRole` and `chainGenerativeBounds` from `geometry/VolumePresets.js`; T2.2 adds those two pure helpers if T10.1 has not landed) | Must | M (1) | T2.1 |
| T2.3 | `StageSettings` (+ region defaults), `StageController`, P1 step 5a, `STAGE_ESTIMATES_CHANGED`; **schema rows `production`, one revision bump (number assigned at merge); J re-baseline** | Must | M (1) | T2.1, T2.2 |
| T2.4 | `StagePanel` and the regional-defaults menu; **U** re-baseline | Must | M (1.5) | T2.3, T0.2 |
| T3.1 | `MoireCalculator` + `SENSOR_PHOTOSITES` + tests | Must | S (0.5) | none |
| T3.2 | Lens fields, `setLensField`, `setFilmback` photosites; `analysis/CenterHit.js` (+ spec 08 exports, `columnQuads` fields); hub emits `CAMERA_MOIRE_CHANGED` on full and `poseOnly` refreshes and reads `currentLayout`; **schema rows (camera lens), one revision bump (numbered at merge); J re-baseline** | Must | M (1) | T3.1, S08-P2-11, S08-P2-12c |
| T3.3 | `LensMoirePanel`; **L** re-baseline | Must | M (1) | T3.2 |
| T4.1 | `PreviewPass.captureCanvas` (masks, roles, MSAA rule, banded reads, `withContentMaterials`; R4's `capture` on top of it), `ScreenshotRenderer` (size policy, watermark), `addHelper` roles, `BrandMark.monogram`, `app/Prefs` keys (split from `Autosave` if needed), Screenshot menu with options; **U** re-baseline; R4 outputs unchanged | Must | L (3) | S07-R1, S07-R2, **S07-R4** (required with X4, C58); spec 06 T10 (optional); T0.2 |
| T6.1 | `CurvedVolume` (rounding, lock steps, both conventions) + `layout.curveConvention` + tests | Should | S (0.5) | none |
| T6.2 | `StageTemplates`, `TemplateController`, `ProjectSession.applyWallScope`, reasons `'template'` (framing, view-only kept); **schema row `project.template_id`, one revision bump (numbered at merge); J re-baseline** | Should | M (1) | T6.1, T1.1, S07-D5 |
| T6.3 | `TemplatesMenu`, `CurvedVolumeForm` in spec 07's `Dialog`, `applyCurvedVolume`; **U** re-baseline | Should | M (1) | T6.2, S07-E1, B-M4 |
| T7.1 | `ShareLinkCodec` (caps, streaming inflate, bomb test) + `share` variant + tests | Should | M (1) | S07-D4 |
| T7.2 | `ShareLinks` (`hashchange`), Share button, `ShareBanner`, boot path after `rotateOnBoot`, reason `'share'`; **U** re-baseline | Should | M (1) | T7.1, **B-M4**, **B-L8** (S07-D2, D7), S07-H3 |
| T9.1 | `analyzeCoverage` options: border segments (exact predicate for spec 08's rays), `packPanelQuads`, exact clip pass for `pixels` and `nearest`; `panelQuads` normal/led fields; perf test; **zero-diff gate** | Should | M (1.5) | S08-P2-11, spec 02 `panelQuads()`, T3.2 |
| T9.2 | `display.innerFrustum`, `CameraController.setInnerFrustum`; **schema rows, one revision bump (numbered at merge); J re-baseline** | Should | S (0.5) | T9.1 |
| T9.3 | `InnerFrustumView` (own per-section geometry, live `SECTION_CHANGED` updates, encodings include, disposal), toggle, overscan, pixel readout, P1 step 4b; **L** re-baseline | Should | M (2) | T9.2, S07-R1 |
| T10.1 | `geometry/VolumePresets.js` (`chainGenerativeBounds`, `sectionRole`, `fitVolumeOffset`, `snapVolumeOffset`) + tests (fuzz, fixtures, equivariance) | Should | M (1) | spec 02 3a and T17 (Detached) |
| T10.2 | `WallController.applyVolumePreset`, the "Ceiling / floor" menu in spec 02's offset group, check C9, the toast; **C + U** re-baseline | Should | M (1.5) | T10.1, T0.2 |
| T11.1 | `StagePackExporter`, manifest, CSV, README, menu, `stage_pack` scenario, manual Unreal/Disguise checks; **U** re-baseline | Should | L (5) | F1 (P2-2 profiles + σ), F4 per-section UV + TEXCOORD_0, spec 03 export frame, B-H3, B-L5 |
| T12.1 | `ProjectSession.setClient` / `setNotes`; **schema row `project.client`, one revision bump (numbered at merge); J re-baseline** | Should | S (0.5) | S07-D5 |
| T12.2 | `SpecSheetModel`, `SpecSheetView` (decode wait, synchronous fallback tab), print CSS, `fitCamera`, `#project-client`/`#project-notes`, Chrome and Safari checks; **U** re-baseline | Should | L (3) | T12.1, T2.4, T4.1, F6 Brand, S07-D8 |
| T13.1 | `MeasurementController` (pin, unpin, `StageAnchored` `translateStage`), `project.measurements`; **schema rows, one revision bump (numbered at merge); J re-baseline** | Could | M (1) | spec 03 T4 (`StageAnchored`), S07-H1 |
| T13.2 | `SnapPoints`, `MeasureTool` (gizmo rule, range guard), `MeasureView` (label pass, `RENDER_ORDER.MEASURE`), `MeasureOverlay`, `ToolsPanel` (`#tool-measure`), KEYMAP `M` row (key `'m'`) and the Escape handler at priority 40 (`registerEscapeHandler`); **U** re-baseline | Could | L (3) | T13.1, S07-I1, S07-I2, S07-R1, spec 02 `panelQuads()` |
| T14.1 | `Units` + tests | Could | S (0.5) | none |
| T14.2 | Units across every panel and readout (including the spec 02-05 panels), `Prefs.setUnits`, toggle | Could | L (4.5) | T14.1; land after the UI-heavy tasks |
| T15.1 | `PlanSvgExporter`; **U** re-baseline | Could | M (1) | T10.1 optional |
| T16.1 | Port map (snake order per section, port labels on an atlas copy); **U** re-baseline | Could | M (1.5) | T2.1 |

**Sequencing.**
- Release A (Must), after S07-D1…D5, S07-E1 and S08-P2-11, with X4 on S07-R4: T0.2 → T1.1 / T3.1 / T2.1 (parallel) → T1.2 → T2.2 → T1.3 → T2.3 → T2.4 → T3.2 → T3.3 → T4.1.
- Release B (Should): T6.*, T7.*, T9.*, T10.* (after spec 02 3a and T17, which is in 02 3b by default), T12.*, then T11.1 (after F1, F3 and F4).
- Release C (Could): T13.* after S07-I1, I2 and R1; the rest, with T14.2 last.
- Every task with a re-baseline is its own commit with its own manifest (§8.2). Two tasks never share a re-baseline commit, even when they land in the same release. Each item release makes one revision bump, numbered at merge (07 C40).

**Effort:** total ≈ 45.5 d. Must 14.5 d (T0 0.5 d, X1 3.5 d, X2 5 d, X3 2.5 d, X4 3 d; T0.1's 1 d moved into S07-G3), Should 19.5 d (X6 2.5, X7 2, X9 4, X10 2.5, X11 5, X12 3.5), Could 11.5 d (X13 4, X14 5, X15 1, X16 1.5). X5 and X8 cost nothing here (spec 07 H1-H3). The first slice (Release A) is about 3 weeks of one maintainer's time.

**Dependencies on other specs, summarised.** Spec 07: D1-D5 (schema, session, wall-scope merge), D7 (escaping), D2 (validator), E1 (Notifier, Dialog), H1-H3 (history, autosave), I1-I2 (keymap, `registerActions`, `bindScopedKeys`, click rule), R1-R2 (layers, PreviewPass) and R4 (required with X4), G3-G4 (harness determinism and isolation, including the former T0.1 hooks; differential golden). Spec 08: P2-11 (coverage, `columnQuads`, camera basis), P2-12c (`poseOnly`), P2-13b (canvas size), P2-13f/g (convention, MeshProfiles). Spec 02: Detached, offsets, `SectionLayout.frame`, `sectionBounds`, `generativeBounds`, `panelQuads`, `currentLayout`, `SECTION_CHANGED`, batch panel, `clone`. Spec 03: frames, `StageAnchored`. Spec 06: `Brand.filePrefix`, `Brand.productName`, `Brand.jsonGenerator`, `BrandMark`, tokens. Specs 01 and 04: live exporter profiles for X11; spec 01's σ for X9.

---

## 11. Risks and open questions

### 11.1 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Drift from the specs that own the platform (07), the bug fixes (08) and section placement (02) | Two incompatible implementations | §0 ownership boundaries; every touch point in §5.3 names the owning spec; this spec adds options, additive methods and rows only; cross-spec behaviour changes are amendment requests with owner questions (Q10, Q16). Reviewers check new ids, events, keys and files against specs 02, 07 and 08 before merging. |
| Schema keys of an unimplemented item misread by an intermediate build | A silently wrong stage | No reservation: each item's keys land with the item and bump the revision, so older builds drop them with `newer-revision` (AC38). |
| Wrong catalogue data, or data read as a guarantee | Bad quotes, rigging or power plans | Ship only entries verified on manufacturer pages, with source URL and retrieval date. Unit-test pitch consistency. Show the disclaimer in the Stage panel and on the spec sheet. Entries whose sources conflict are excluded (Appendix A candidates). |
| Optimistic data-path capacity at low frame rates | Too few ports or processors quoted | Capacity is never scaled above the 60 Hz table value unless the vendor gives a value for that rate; the result is flagged "estimated"; optional receiver-card limit (C11). |
| Estimates used as engineering calculations | Safety | The "Estimates only" text is always visible. No "safe/unsafe" wording, only "exceeds published limit". Rigging excludes bars and hardware, and says so. |
| Moiré heuristic gives false confidence | A reshoot | Thresholds are shown and explained. The band is reported, not just a verdict. The UI text says "test with your camera". |
| Share links or templates as an XSS or resource vector | Security, a hung tab | Hard dependency on B-M4 and B-L8 (spec 07). Input capped at 65,536 characters and inflate output at 1 MiB before parsing (AC39). Decoded data always passes the validator, including its `budget` checks. Nothing is applied before the user clicks Open. Names are rendered with `textContent`. Client and notes are not shared. |
| Golden flakiness from autosave/history timing | Unreliable gates | Spec 07 G3 (fixed clock, autosave off by default, storage clear, toast log); `share_link` opts in and waits on `data-state`; coalescing driven inside one harness step and unit-tested with an injected clock. AC18 runs `ui_visual` twice. |
| Golden churn from many UI additions | Review noise | One feature per re-baseline commit with an explicit manifest that accounts for the visibility-blind text probe (T, L); header and canvas untouched (AC3); the Measure button lives in the sidebar. |
| Ceiling/floor sections and hidden "vertical wall" assumptions | Wrong safe zone, pivot or size measures | X10 adds no placement model; spec 02's rules apply and are restated in §6.6; `FramingPolicy`'s three named boxes (07 C34) keep ceilings and floors out of `mesh-center` (`generativeBox`) and of D and `fits` (`stageExtent`). |
| GPU or canvas limits for large screenshots | Failed capture, tab crash on iOS | Clamp to the renderbuffer, texture and probed canvas limits and 16.7 Mpx; drop supersampling first; banded reads; verify the canvas; toast. |
| Coverage cost during pilot flight | Dropped frames | Exact clipping with quick accept/reject, no allocation, packed quads cached per layout object; pixel pass only with the inner frustum on; perf test (AC27). |
| `CompressionStream` missing (old Safari or Firefox) | Longer links | `1j` raw fallback (≤ 49,147 bytes). Decoding a `1d` link without support shows "Open in a newer browser". |
| Scope creep for a solo maintainer | Stalled roadmap | MoSCoW, a 3-week first slice, the "Won't" list. Every item is independently shippable and default-off, and rejecting one leaves no key behind. |
| Unreal or Disguise import specifics change by version | Pack friction | The manifest and CSV are tool-neutral. The README lists the tested versions. Manual check §8.3 runs per release. |

### 11.2 Open questions for the owner (each with a recommended default)

| # | Question | Recommended default |
|---|---|---|
| Q1 | Which products should the catalogue ship with? Morph's own rental inventory? | The verified ROE entries in Appendix A now. The owner adds Morph's inventory (with datasheet links and any curve-lock steps) before release A. Absen and CB5 stay out until datasheet-verified. |
| Q2 | Should products lock the cabinet fields? | Yes, linked and read-only, with one-click Unlink that keeps the values; a diverged section is editable with "Re-apply product". |
| Q3 | Default electrical region? | 230 V single-phase, 16 A, 80 % derating, PF 0.95 for every new project. No automatic change when units switch to imperial; North American crews use the explicit "Regional defaults" action, which is undoable. |
| Q4 | Default processor and bit depth? | Brompton Tessera 1G-port profile, 10-bit, 60 fps (capacity labelled "estimated" away from the vendor's values; never scaled above the 60 Hz value), with the XD count. NovaStar MX40 Pro as the second profile. |
| Q5 | Are the moiré thresholds acceptable as labelled heuristics? | Yes, with the values of §6.3, editable in one frozen object. Revisit after test shoots. |
| Q6 | Inner-frustum overscan semantics? | **Total linear overscan** (10 % makes the frame 1.1× wider and taller). nDisplay's custom frustum has separate Left/Right/Top/Bottom values, so it is per side; to approximate a per-side p %, enter 2p here. The exact UE percent base is to be confirmed in the engine (manual check §8.3.6). Display only. |
| Q7 | Should screenshots carry the Morph watermark by default? | Yes for camera-view stills and spec-sheet images (`watermark: 'camera'`). Off by default for viewport screenshots. Always at full opacity (brand rule). Spec 07's own camera-frame button stays unwatermarked. |
| Q8 | Should this spec's settings (stage, lens, inner frustum) be undoable? | Yes, coalesced per field (§5.5). Units and screenshot options are per-browser preferences and are not. |
| Q9 | Should a share link open automatically? | No: a non-modal "Open / Keep mine" banner; nothing changes before Open. The link is decoded at boot (bounded) only to show the banner. |
| Q10 | Ceilings and floors are spec 02 Detached sections. Spec 03's `mesh-center` pivot reads `generativeBounds()` over every section, so a fitted ceiling taller or wider than the chain moves mesh-centre. Should `pivotPoint('mesh-center')` skip detached sections, as `firstEdge`/`lastEdge` and `Wall.flatBounds()` already do? | **Closed (07 C34, 02 CR-03-b):** `generativeBounds()` (`FramingPolicy`'s `generativeBox`) covers the attached sections only from 02 T3 on, so `mesh-center` skips detached sections. |
| Q11 | Spec sheet via the browser's print-to-PDF, or a PDF library (jsPDF)? | Print-to-PDF (zero dependencies, selectable text). Revisit only if a pixel-exact PDF is required. |
| Q12 | Stage-pack mesh format for Unreal: glTF or GLB? | `.gltf` with embedded base64 (after the B-H3 chunked encoder). GLB as a later option for large walls. |
| Q13 | Which templates should ship? | The six in §3.6. Volumes with a ceiling or floor appear once X10 lands. |
| Q14 | Should share links include logos? | No (size). The copy toast says "logos and the HDRI file are not included". |
| Q15 | Should units be a per-browser preference or a per-project setting? | Per browser. The spec sheet prints in the viewer's units. |
| Q16 | Should spec 08's wall size measures (`extentAcross` width, height, hence `fits` and the safe distance D) skip sections whose LED face is horizontal (ceilings, floors, risers)? | **Adopted (07 C34):** spec 08 P2-11c's `stageExtent` reads `worldVertices()` of sections with `|n.y| ≤ 0.9` for width, height, D and `fits`; ray tests (`columnQuads`) keep every section. Identity on every harness wall. |
| Q17 | Stylesheet numbering across specs (01, 04 and 06 all claim `13`) | One registry: `01-12` legacy slices, `13-19` assigned in landing order to specs 01, 04 and 06, `css/features/*` for specs 02, 03 and 05, and `20-29` for this spec. |
| Q18 | Should share links carry the client name and the project notes? | No. They often hold commercial information and links end up in chat logs. The `share` variant omits them and the copy toast says so. |

---

## Appendix A: Seed product data (retrieved 2026-10-16)

Only rows marked **verified** ship in `PANEL_PRODUCTS`; candidate rows stay in this document. Values are per cabinet (ROE calls them "panels"). Curve limits are per joint, using the app's sign convention (+ = concave). No curve-lock steps are verified yet, so `lockStepsDeg` is `null` for every row.

| id | Manufacturer / model | Surface | W × H × D (mm) | Pixels | Pitch (mm) | kg | W max / avg | Curve concave / convex | Hang / stack | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `roe-bp2v2` | ROE Visual Black Pearl BP2V2 | wall | 500 × 500 × 90 | 176 × 176 | 2.84 | 9.35 | 190 / 95 | 10° / 0° | 20 / 12 | roevisual.com product page; BP2V2 brochure (EN, Feb 3 2024) | verified |
| `roe-rb2-6` | ROE Visual Ruby RB2.6 | wall | 500 × 500 × 73 | 192 × 192 | 2.604 | 8.5 | 160 / 80 | 5° / 5° | 20 / 12 | roevisual.com/ruby | verified |
| `roe-rb2-6f` | ROE Visual Ruby RB2.6F | wall | 500 × 500 × 73 | 192 × 192 | 2.604 | 8.02 | 215 / 110 | 5° / 5° | 20 / 12 | roevisual.com/ruby | verified |
| `roe-rb-c2-6` | ROE Visual Ruby RB-C2.6 (curved) | wall | 500 × 500 × 108 | 192 × 192 | 2.604 | 8.3 | 160 / 80 | 30° / 30° | 20 / 12 | roevisual.com/ruby | verified |
| `roe-rb2-2f` | ROE Visual Ruby RB2.2F | wall | 500 × 500 × 73 | 224 × 224 | 2.23 | 8.24 | 190 / 95 | 5° / 5° | 20 / 12 | roevisual.com/ruby | verified |
| `roe-rb1-5f` | ROE Visual Ruby RB1.5F | wall | 500 × 500 × 73 | 320 × 320 | 1.56 | 8.16 | 140 / 70 | 5° / 5° | 20 / 12 | roevisual.com/ruby | verified |
| `roe-bm4-matte` | ROE Visual Black Marble BM4 Matte | floor | 609.6 × 609.6 × 135 | 128 × 128 | 4.76 | 17.5 | 290 / 145 | flat | n/a (floor load 2000 kg/m²) | roevisual.com/products/black-marble-bm4 | verified |
| `roe-bm2-matte` | ROE Visual Black Marble BM2 Matte | floor | 609.6 × 609.6 × 133 | 216 × 216 | 2.82 | 18.6 | 310 / 155 | flat | n/a | roevisual.com/products/black-marble-bm4 (series table) | verified |
| `absen-pl2-5-pro` | Absen PL2.5 Pro | wall | 500 × 500 (depth 87-88) | 200 × 200 (derived) | 2.5 | 8.6-9.0 | 135-192.5 (sources conflict) | ? | ? | distributor listings (Rentex, Novelty) | **candidate: needs the Absen datasheet** |
| `roe-cb5-mk2` | ROE Visual Carbon CB5 MKII | ceiling/outdoor | 600 × 1200 × 79-80 | 104 × 208 | 5.77 | 12.2-17.5 | 480-750 max (conflict) | 15° / 10° (listing) | ? | rental listings (4Wall, LED Wall Central) | **candidate: needs the ROE datasheet** |

Product record shape (`PANEL_PRODUCTS[i]`):

```js
{ id, manufacturer, model, surface: ['wall'|'ceiling'|'floor'], cabinetWidthMm, cabinetHeightMm, depthMm, pixelsX, pixelsY, pitchMm,
  weightKg, powerMaxW, powerAvgW, curve: { concaveMaxDeg, convexMaxDeg, lockStepsDeg: number[] | null } | null,
  rigging: { maxHang, maxStack } | null, floorLoadKgM2: number | null, maxPerDataChain: number | null, maxPerPowerChain: number | null,
  source: { url, document, retrieved: 'YYYY-MM-DD' }, verified: true }
```

`pitchMm` is the catalogue's rounded display value. Calculations use the section fields (`panelWidth / ledX`), see §6.3. A ceiling-capable product (for "Ceiling: fit to volume") lists `'ceiling'` in `surface`; none of the verified rows does yet, so ceilings use wall products (C13 warns) until the owner adds one (Q1).

## Appendix B: Sensor photosites (`SENSOR_PHOTOSITES`, keyed by the existing `FILMBACK_PRESETS` keys)

| Preset key | Sensor (mm) | Photosites H × V | Pitch (µm) | Source |
|---|---|---|---|---|
| `arri-lf` | 36.70 × 25.54 (LF open gate) | 4448 × 3096 | 8.25 | ARRI ALEXA LF FAQ |
| `red-v-raptor` | 40.96 × 21.60 (8K VV) | 8192 × 4320 | 5.00 | RED V-RAPTOR technical specifications |
| `red-komodo` | 27.03 × 14.26 (6K S35) | 6144 × 3240 | 4.40 | RED KOMODO 6K technical specifications |
| `full-frame`, `super35`, `arri-alexa`, `sony-venice`, `bmpcc-6k`, `aps-c`, `mft`, `custom` | (existing presets) | `null`: the user enters the value | n/a | The owner can add verified values later |

The lens-block hint prints `h × v` from this table. It never derives `v` from the aspect ratio (`Math.round(4448 / aspect)` would give 3095, not 3096).

## Appendix C: Processor profiles (`PROCESSORS`)

| id | Name | Capacity per 1G port | Ports per unit | Pixels per unit | Distribution | Receiver limit (`maxPxPerReceiver`) | Source | Notes |
|---|---|---|---|---|---|---|---|---|
| `brompton-tessera-1g` | Brompton Tessera (SX40 + XD, S8, M2), 1G port | 525,000 px at 8 bpc, 60 Hz. The vendor states that capacity varies with bit depth and frame rate; the app scales with bit depth, never scales above the 60 Hz value for lower frame rates, scales down for higher ones, and flags the result "estimated" (no per-rate vendor table yet, `capacityByRate: null`). | 40 (SX40: 4 × 10G trunks to XDs) | 9,000,000 nominal (SX40) | `{name: 'XD', portsPerUnit: 10}` | `null` (not yet verified) | Brompton XD data sheet (Apr 2023); SX40 listings | Confirm with Brompton Tessera software |
| `novastar-mx40-pro` | NovaStar MX40 Pro | 650,000 px at 8-bit 60 Hz; 325,000 at 10/12-bit (480,000 at 10-bit only with A10s Pro or A8s Pro cards) | 20 | 9,000,000 | none | `null` | MX40 Pro specification (distributor-hosted PDF) | Confirm with NovaLCT |
| `generic-1g` | Generic 1 GbE receiving cards | 650,000 at 8-bit 60 Hz, scaled by bit depth and down (never up) by frame rate ("estimated") | 4 | `null` (port-limited count only) | none | `null` | n/a | n/a |

## Sources (retrieved 2026-10-16)

- ROE Visual, Black Pearl BP2V2 product page: https://www.roevisual.com/products/black-pearl-2v2 and brochure https://www.roevisual.com/uploads/files/Product%20File/Black%20Pearl/bp2v2-brochure-en-feb.-3-2024.pdf
- ROE Visual, Ruby series: https://www.roevisual.com/ruby
- ROE Visual, Black Marble: https://www.roevisual.com/products/black-marble-bm4
- Absen PL2.5 Pro (conflicting distributor data): https://www.rentex.com/rental-products/absen-pl2-5-pro/ and https://www.novelty.fr/produits/video/mur-d-images-led/plein-jour-led/pl2-5pro/
- ROE CB5 MKII (rental listings): https://www.4wall.com/rentals/9759078/5-7mm-roe-cb5-mkii and https://www.ledwallcentral.com/Roe-CB5MKII_RGBW.htm
- Brompton XD data sheet (Apr 2023), 1G port capacity and its scaling: https://www.rentex.com/wp-content/uploads/2026/02/Brompton-XD-Data-Sheet-Apr2023.pdf
- NovaStar MX40 Pro specification: https://www.rentex.com/wp-content/uploads/2023/01/MX40-Pro-LED-Display-Controller-Specification.pdf
- Epic Games, nDisplay projection policies (UV channel 0 drives the Mesh policy's warp): https://dev.epicgames.com/documentation/unreal-engine/projection-policies-in-ndisplay-in-unreal-engine
- Epic Games, secondary UVs for nDisplay (keep the meshes separate; consistent texel density): https://dev.epicgames.com/documentation/unreal-engine/creating-secondary-uvs-for-ndisplay-for-unreal-engine
- Epic Games, ICVFX camera custom frustum (separate Left/Right/Top/Bottom values in percent or pixels; field-of-view multiplier): https://docs.unrealengine.com/5.0/en-US/PythonAPI/class/DisplayClusterConfigurationICVFX_CameraCustomFrustum.html
- Disguise, UV maps in Designer (normalised 0..1 UVs; no UVs renders black; UVs do not set resolution): https://help.disguise.one/workflows/3d-modelling/uv-mapping/uv-maps-in-designer
- VP moiré rules of thumb and the role of defocus: https://www.thebroadcastbridge.com/content/entry/19584/virtual-production-for-broadcast-video-wall-configuration and https://www.redsharknews.com/virtual-production-six-tips-for-shooting-on-an-led-volume
- ARRI ALEXA LF FAQ: https://www.arri.com/en/learn-help/learn-help-camera-system/frequently-asked-questions/alexa-lf-faq
- RED V-RAPTOR specifications: https://docs.red.com/955-0199/955-0199_V1.2_Rev_A_RED_PS_V-RAPTOR_Operation_Guide/Content/C_TechSpecs/Specs_V-RAPTOR.htm ; KOMODO 6K: https://docs.red.com/955-0196_v1.6/Content/A_TechSpecs/Specs_KOMODO_6K.htm
- three.js r128 APIs verified against the r128 sources:
  - `WebGLRenderer.readRenderTargetPixels` (with an x/y/width/height sub-rectangle, used for banded reads);
  - `WebGLMultisampleRenderTarget` (WebGL2 only; resolved after `render()`, spec 07 6.1);
  - the render-target encoding selection (`WebGLRenderer.js`, the `_currentRenderTarget.texture.encoding` branch) and the `encodings_fragment` / `linearToOutputTexel` chunk available to `ShaderMaterial`;
  - `capabilities.maxTextureSize`, `capabilities.isWebGL2`;
  - `Frustum.setFromProjectionMatrix`;
  - `Vector3.project`;
  - `examples/js` `GLTFExporter` and `CSS2DRenderer` exist for r128 on jsDelivr. They are not needed by this spec.
- Web platform: `CompressionStream` / `DecompressionStream` (`'deflate'`), `ReadableStreamDefaultReader.cancel()`, `TextDecoder` with `fatal: true`, the `hashchange` event (not fired by `history.replaceState`).
