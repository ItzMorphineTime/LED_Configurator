# 07: Platform and foundations roadmap

**Status:** proposal, revision 3. **Plan review (2026-10-16):** C19 and 4.8 list 03's optional `pivot_default_mode` preference; nothing else in this spec changes. Implementable once Phase 1 (`docs/REFACTOR_PLAN.md`, WP1-WP10 and 1C) is merged; every task also names the spec 08 (Phase 2) commits it waits for (section 10). Revision 3 re-runs the reconciliation against the sibling specs **as they are on disk** (01 r3, 02 r3, 03 r3, 04 r2, 05 r3, 06 r3, 08 r3 and 09 r2; section 0), adds spec 08 to it, and adopts the siblings' change requests. It also fixes the camera-pose loss in `ProjectSession.apply`, the two pilot-mode regressions of the three.js controls, the hidden coupling between Tracks 2 and 3, the golden-change attribution, the asset limits, and the effort. **Revision 3.1** records the cross-spec consistency review of all nine specs as decisions C32-C62 (0.1) and 0.4; the sibling files were edited with the same resolutions, and task D0 becomes the one consolidated reconciliation commit (about 3 d, section 10).
**Implementation status (2026-10-31):** D1, D2, D4, D5, D6 and D7 landed (ARCHITECTURE 12, "07 D1 and D2", "07 D4 and D5", "07 D6", "07 D7" (S1 is static rule 21); the feature hook map is `ProjectSession.registerFeature(name, {hydrate(v2, ctx)})`). M7a (revision 1, `"version": "2.1"`) writes `generator` as the second key (`ProjectSerializer({generator})`, App injects `{name: Brand.jsonGenerator.name, version: APP_VERSION}`) and lands 03 T7 (`pivot` with `resolved_m`), 03 T9's `display.show_pivot_marker` and 04 UV-5c (`uv`, `atlas`, `sections[].uv_transform`, `sections[].pixel_map`, plus `sections[].uv_vertex_edits`), restored by the `pivot` and `uv` feature hooks (`PivotController.hydrate`, `UvController.hydrate`). Deviations: `project` is written only while the name or notes are not the defaults; `viewport` stays unapplied (no 6.15 orbit adapter, no `PreviewWindow.setSize`); a newer revision drops unknown keys outside `extensions` (4.4 rule 4) and names them in the `newer-revision` message; `budget` is a note that re-validation raises again, so the idempotence and fidelity properties exclude it. D5: step 9 (viewport) is absent; a wall-scope apply hydrates only the wall (no live 'history' capture is re-applied); `attachHistory`, `restorePrevious` and `setName` wait for H1, H3 and D8; `PROJECT_REPLACED`'s `syncFromModel` panels skip a wall-scope apply; Phase-1 orbit adapter (6.15) and `PreviewWindow.setSize` not added. D6: the SHA-256 stays the LogoLoader's (no `digest` dependency of `AssetStore`); no `addMissing` (a `missing` asset is dropped by the validator); no `hdri/` hand-over (Feature 5 has not landed); the label "Import JSON" stays until D8. D8 landed (ARCHITECTURE 12, "07 D8"): `ui/ProjectPanel` is the first sidebar card, open at start, with `#project-name` (`session.setName`, the C28 rule), Save, Open… and New, an unsaved-changes indicator (`#project-dirty`) and the title `Morph LED Configurator — <name>` (` •` while dirty), Ctrl/Cmd+S and Ctrl/Cmd+O; `project_v2_roundtrip` added. Deviations (the owner's request of 2026-11-01, and E1, H1, H3 and I1 not built): `#export-json` and `#import-json` stay in the Export section with their labels (the Project section has its own `#project-save`, `#project-open` with `#project-open-input`, and `#project-new`); Save names the file after the project (`projectFileName`: a safe slug, else `Brand.files.json`; Export JSON keeps `Brand.files.json`); a rename and New are not undoable and record no history; New (before it applies) and Open (once a file is chosen, because of the browser's user-activation window) ask "Discard unsaved changes?" through `dialogs.confirm` (`window.confirm`) while the project is dirty, instead of New's toast; corrections stay M-IMP-5's alert (no import report dialog); no `#toggle-autosave`, restore banner or `beforeunload` guard; the two chords are the panel's own capture-phase window listener, not the I1 keymap; `project_v2_roundtrip` sets no logo (`p2_project_v2` covers logos) and compares the camera and display states numerically. H1 and H2 landed (ARCHITECTURE 12, "07 H1 and H2"; the owner's request of 2026-11-01): `app/History` is the one undo stack (snapshots of `capture('history')`, `run` with nesting, 750 ms coalescing per key on `performance.now`, gizmo-drag transactions, 100 steps / 32 MB, undo and redo through `ProjectSession.apply` with reason `undo` / `redo`, `HISTORY_CHANGED`); every use case of the wall, display, panel IDs, logos, camera, props, pivot (with its re-expression), UV transforms, vertex edits and settings records with its 5.6.1 label, and so do rename, New and Open (undo brings the previous project back) and the pilot moves; `ui/HistoryControls` adds ↶ / ↷ to the header's history slot (titles "Undo <label>" / "Redo <label>") and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y as one capture-phase window listener that leaves text-editing controls to the browser's own undo (`isTextEditTarget`); 04's `UvFallbackHistory` is deleted (UV-18's history part; Q17's one stack also inside the viewer). Deviations: a record inside a transaction is absorbed into it (not a commit-first on another label); the depth limit counts undo steps; Cmd+Y also redoes (the owner's request); New and Open keep D8's confirm and are undoable as well (no toast); no `#autosave-status` (H3); the history chords are HistoryControls' own listener, not the I1 keymap; `notWhileDragging` is HistoryControls' busy check (a transaction, a gizmo or UV drag). H3 landed (ARCHITECTURE 12, "07 H3"; the owner's request of 2026-11-01): `app/Autosave` writes `capture('autosave')` 2 s after each history step (`history.setOnCommitted`) and on `pagehide` / hidden, never for a pristine new project, with the quota fallback without logos (then "storage full"), `unavailable` without working storage, and `?autosave=off` (no read or write; the harness loads every scenario with it except `autosave_restore`, and clears the origin's storage before each scenario, 8.3 items 1 and 3); `app/Prefs` holds `morph-led-configurator:prefs` (`autosave`, default on; `#toggle-autosave` in the Project section); `ui/RestoreBanner` (`#autosave-banner`, first in `#viewport-top-stack`) offers the newest valid slot when it differs from the fresh project: Restore is `ProjectSession.restore(text)` (validated and reported like an Open, reason `restore`, one `Restore session` entry), Discard removes both slots; `AUTOSAVE_STATUS`; `autosave_restore` added. Deviations (the owner's request): two alternating slots `morph-led-configurator:autosave:0` / `:1`, each a header line (`seq`, `saved_at`, `name`, `dirty`, `length`, SHA-256) plus the project text, the newest valid `seq` winning, instead of `:current` / `:previous` and the boot rotation; nothing is written while the banner is pending; a 2 s debounce; the banner reads "Restore unsaved work from <relative time> — <name>?"; `restore(text)` instead of `restorePrevious()`, called by Autosave; the banner is not ProjectPanel's; no header `#autosave-status` (the Project section's `#autosave-note` shows a problem and mirrors the state in `data-state`), no toasts (E1), no `beforeunload` guard, no multi-tab toast; the restored project is clean only if it was clean when autosaved, and `isPristineNew` survives a restore; the switch off keeps the slots.
**Binding baseline:** `docs/ARCHITECTURE.md` (module names, events, `Strategies`, `LEGACY_SITES`, section 9 seams). Where this spec changes a contract, section 5.12 lists the amendments to make to ARCHITECTURE.md in the same commit as the code.
**Legacy line numbers** refer to `index.html@cd3fd3f`. **Bug ids** refer to the verified defect list ([`docs/DEFECTS.md`](../DEFECTS.md), mirrored in ARCHITECTURE.md section 8.2).
**Bug-id note:** the brief cites "keyboard-operable toggles B-L25". In the defect list, toggle accessibility is **B-L36**. B-L25 is "view presets break the pilot view", an orbit bug.

This spec covers eight cross-cutting enablers. The feature specs (`docs/improvements/01-06`, Features 1-6) build on them. Spec 08 fixes every listed bug id first (C21); this spec replaces mechanisms and adds the platform on top:

| Id | Workstream | Foundation id (F0, below) | Bug ids in scope (REFACTOR_PLAN 5 item) | First fixed by (spec 08) |
|---|---|---|---|---|
| (a) | Single renderer (scissor preview), stills, render layers (`HELPERS`, `ENVIRONMENT`, `DEBUG`) | F0-e | item 9: B-M9, B-M11, B-L32, B-L34 | P2-10a-c, or R1/R2 if they land first (C31) |
| (b) | Keymap; selection registry v2; adopt `TransformControls` and `OrbitControls` (r128 `examples/js` builds) | F0-f | item 8: B-M14, B-L11, B-M12, B-L28, B-L22, B-L23, B-M13, B-L27, B-L25, B-L26 | P2-9a-j. I1-I4a replace the hand-written routing, gizmo and orbit. |
| (c) | Render-on-demand | (prerequisite of F5) | - | - |
| (d) | Project file v2 (a superset of v1): full state, v1 migration, validator, session | F0-a | items 2, 6 and 12: B-L8, B-M4, B-M3, B-L21, B-L31 | P2-3a-d, P2-6a, P2-13e. D1-D8 complete the schema and add the session. |
| (e) | Undo/redo command stack and autosave | F0-a | - | - |
| (f) | three.js r128 to current ESM (importmap): the planned upgrade path, scheduled **after Feature 5** (Q1) | F0-g | - | - |
| (g) | CI on GitHub Actions; GitHub Pages deploy | - | - | - |
| (h) | Accessibility, performance budgets, error UX | - | items 3, 8 and 12: B-H3 (reporting), B-L4, B-L36, B-L13, B-L24, B-M16, B-L35 | P2-1a/c/d, P2-13c, P2-8d, P2-12d, P2-13a; B-L24 by Features 1 and 6. E1-E4 and X1-X5 reroute and extend. |

**Foundation ids.** F0-a … F0-h name the foundations that the pre-refactor feature-readiness review asked the refactor to prepare, and specs 01-05 cite them by id: **F0-a** an observable project model with a validated v2 serializer and v1 migration; **F0-b** `geometry/WallLayout` (one pure layout walk with true bounds, first and last edges, pivot points and per-section matrices); **F0-c** `geometry/WallMeshBuilder` (the one owner of winding, normals and UVs); **F0-d** `render/LEDWallView` (mesh tags, groups, disposal, transform-only and material-only update paths, the `wall:rebuilt` event); **F0-e** a single renderer with a `HELPERS` layer; **F0-f** `SelectionManager` and `TransformGizmo` with a registry of Selectables; **F0-g** the module-delivery decision; **F0-h** `theme/Brand` and `ThemeBridge`.

---

## 0. Reconciliation with the sibling specs (binding)

Revision 2 of this section recorded one decision per conflict between this spec and specs 01-06. Every sibling has since been revised on top of it, and spec 08 (the Phase 2 bug-fix roadmap) has been reconciled with it too. Revision 3 re-runs the reconciliation against the files **as they are on disk now**:

| Spec on disk | Revision | Builds on 07 r2 section 0 | Requests to this spec, adopted in revision 3 (0.2) |
|---|---|---|---|
| 01 normals | r3 | yes: `sections[].face_orientation`, `core/typingTarget.js` (C18), normal lines move to `DEBUG` when R1 lands, `N`/`Shift+N` become `KEYMAP` rows after I1 | CR-9 (08 P2-9b creates `core/typingTarget.js`) |
| 02 sections and offsets | r3 | yes: `offset.position_m`; path A (07 I1-I3, D2/D4/D5, H1) or a path-B fallback that I3 ports later | CR-07-a to CR-07-e |
| 03 pivot | r3 | yes: top-level `pivot`; 02's hook set until I3 | 5.10.1 #6 (pick priority beats wall hits only) |
| 04 UVs and UV editor | r2 | yes: `uv_transform`, `pixel_map`, `uv`, `atlas`; path B with a temporary `UvFallbackHistory` until H1 | 07-2 to 07-7 |
| 05 HDRI and car | r3 | yes: top-level `hdri`, `HdriCache`, `LAYERS.ENVIRONMENT`, `vendor/three-addons.js`, `core/sha256.js`; its T0 and path B are deleted | 5.11 edits a to j |
| 06 branding | r3 | yes: `generator` as the 2nd key, C11 | none |
| 08 bug-fix roadmap | r3 | yes: 07's schema and ranges, `core/sha256.js`, `texture_file`; builds parts of D1-D7 and E3 in 07's final modules (08 §5.6 mapping) | §5.6.1 A1 to A6; the bug-ownership table (§5.6) and the single re-baseline procedure (§8.1) |
| 09 additional ideas | r2 | yes: JSON per 07 section 0; the `M` row; one extra Escape step | none (0.2 offers `registerEscapeHandler`) |

This section records **one binding decision per conflict**. Until a sibling spec is edited, this section wins over it. Task **D0** (docs only, about 3 d, section 10) is the one consolidated reconciliation commit: it applies the residual edits of 0.2 and the review of 0.4 (C32-C62) to the specs, ARCHITECTURE.md and REFACTOR_PLAN.md, **before any Phase 2 or Phase 3 code that touches a shared contract**.

### 0.1 Decisions

C1-C20 are revision 2's decisions; every sibling on disk has adopted them, and revision 3 only clarifies C9, C12, C15-C17 and C20. C21-C31 are new: they reconcile this spec with spec 08 and with the change requests of the siblings. C32-C62 (revision 3.1) record the cross-spec consistency review; the resolutions that do not touch this spec are listed in 0.4.

| # | Conflict | Binding decision | Why |
|---|---|---|---|
| C1 | Key style: camelCase and nested (07 r1) versus snake_case and flat | **snake_case. Every v1 key is kept verbatim and in place** (`version`, `sections`, `mesh_mode`, `panel.columns`, `panel.width_mm`, `led_resolution`, `curvature.angle_degrees`, `color`, `texture_file`, `totals`). New data is added as new keys, nested where it forms an object. Nothing that exists in v1 moves or is renamed. | A v2 file is a **superset of v1**. Every external tool that parses `sections[].panel.columns` keeps reading the generative wall (Q3). Migration only adds keys, so it cannot mis-map one. |
| C2 | Version marker: `format` + integer `schemaVersion` + `schemaRevision` (07 r1) versus `"version": "2.0"` | **`"version": "2.<revision>"`**, a string. Major 2; the minor number counts additive revisions, starting at `"2.0"`. Plus **`"format": "morph-led-project"`**. There are no `schemaVersion` or `schemaRevision` keys. The first keys are `version`, `generator` (06 4.2) and `format`. | One version key, as in v1. `format` lets tools and the ZIP reader recognise the file. |
| C3 | Offset units: metres versus millimetres | **Every persisted position and offset is in metres, with an `_m` suffix.** Physical panel sizes, filmback and pixel pitch stay in millimetres (`_mm`), as in v1. 02's offset is `offset.position_m` (range ±100 m, 0.1 mm resolution); 02 keeps millimetres in its UI and in `SectionOffset`, converting at the serializer with the exact formulas of 4.6. | One rule for world-space placement. |
| C4 | Face orientation: wall-level flag versus per section | **Per section: `sections[].face_orientation`** (`"stage"` or `"reversed"`, default `"stage"`). There is no wall-level flag. | 01 rejects a project flag as a "re-enable the bug" switch. A batch flip is Feature 1's "Flip all sections". |
| C5 | Debug view state persisted | **Not persisted.** `DebugViewSettings` stays session-only (01 Q7). | A viewer preference, not project data. |
| C6 | Curve convention (B-L1) | **The owner decides B-L1 at Phase 2 kickoff** (08 Q10; recommended: keep the convention; **decided 2026-10-16: keep**). The answer is recorded in 08 §5.6 and documented in ARCHITECTURE §1.4 by D0; 02 T3 is gated only on that recorded decision. 08 P2-13f's code (if the convention is kept, retiring `Strategies.curveBeforeFirstPanel` so the legacy convention is the only code path, 08 A6) may land at any time after it. **There is no `conventions` key in v2.0.** If the owner ever changes the convention, that change adds a top-level `curvature_convention` key in an additive revision, **absent means the legacy convention**, and `computeWallLayout` reads `layoutOptions.curveConvention`. | "Absent means legacy" needs no field today; a switch with one supported value is dead configuration. |
| C7 | Pivot shape | **03's shape, at the top level:** `pivot.{mode, offset_m, keep_stage_layout, resolved_m}`. `display.show_pivot_marker` is view-only. Camera, prop and HDRI-point positions are stored in the **stage frame** of the file's own pivot (03 4.2). | The spec that owns the semantics owns the shape. |
| C8 | UV keys | **04's shape:** `sections[].uv_transform` (with `source_rotated`, 04 07-2), derived `sections[].pixel_map`, top-level `uv` and derived top-level `atlas` (`atlas.texture_file` only in the `zip` variant). The writer always writes full objects (no `null` canonicalisation). | Same rule as C7. |
| C9 | HDRI and car model | **05's shape:** a top-level `hdri.{source, quality, backdrop, projection}` with its own source descriptor `hdri.source = {name, bytes, sha256, path}`. `assets[]` holds **logos only**; the kinds `hdri` and `model` stay reserved. The car model is `props.car.model.{kind, asset_id, paint, finish, env_source}`, where **`asset_id` is a bundled-manifest id** (`/^[a-z0-9][a-z0-9-]{0,63}$/`, for example `"kenney-sedan-sports"`; 05 6.10), not an `assets[]` id. | 05 r3 records the same decision (its decision record); 05 already specifies relink, ZIP inclusion and caching for this descriptor. |
| C10 | `generator` position and `savedAt` | **`generator` is the second key**, written from `Brand.jsonGenerator`, ignored on read and never echoed back. **Project files carry no timestamp.** Only the autosave envelope (4.8) carries `saved_at`. | Exports stay byte-deterministic for the harness, as 06 and 08 require. |
| C11 | v1 colour fill | v1 files fill missing colours from **`Palette.legacySectionColors`** (06 4.3). v2 files fill them from `Palette.sectionColors`. | An old file looks as it did when it was authored. |
| C12 | Single renderer and layers | **This spec owns R1-R3. Four layers:** `DEFAULT 0`, `HELPERS 1`, `ENVIRONMENT 2` (05's backdrop dome), `DEBUG 3` (01's normal lines). R1 adopts 05's per-frame helper-layer enforcement. 05 r3 deleted its T0 and path B, so there is one implementation. 05 keeps `SceneManager.setEnvironment` and `setPunctualLightScale` as its own additions. For the preview bugs see C31. | One owner; 05's design ideas are kept. |
| C13 | three.js version | **Stay on r128 through Feature 5** (Q1). Workstream F stays fully specified and runs after Feature 5 ships; U0 may land earlier; U3 includes 05's 6.11 port as U3b. | The owner chose r128 for the refactor; 05 is complete for r128. |
| C14 | Addon and loader access | **One module, `js/vendor/three-addons.js`**: control factories (synchronous) and loader factories (asynchronous, lazy, with SRI), behind one `createAddons({doc})` call (5.7.4). | One place knows addon packaging and version differences. |
| C15 | Gizmo and Selectable API | **Selectable v2 (5.4.1) is the target contract and lands with I3.** Features that land before I3 use the one path-B hook set of C33 on the hand-written gizmo (03 T5 implements it, 02 reuses it). The recommended order (C58) schedules I1-I3 before F2's gizmo work and F5 T6, so only F3's marker is ever converted. **I3 converts every Selectable registered at that time** in its own commit, with the mapping of 5.4.1 and those features' gizmo tests and harness steps as its regression gate. `GizmoCtx.snap` is the shared `InteractionState.snap` object (02 CR-07-c) and `getTransform(out, {mode})` receives the gizmo mode (02 CR-07-e). Snapping stays relative and inside the Selectable (03 D9). | Features ship on their own schedule; the conversion happens once, against tests that already exist. |
| C16 | Undo | **`app/History.js` (H1) is the only undo stack.** Features that land before H1 may ship a temporary path-B fallback (04's `UvFallbackHistory`), which the feature deletes in the commit that adopts H1 (04 UV-18); no fallback survives H1. 02's undo is H1 plus its record rows. | One stack, one mental model, one serializer-based snapshot. |
| C17 | Keyboard | **From I1 on, every chord is a `KEYMAP` row with a scope** (3.8). Features that land before I1 keep the listener their spec describes (path B). **I1 moves every such listener into `KEYMAP` rows and actions** in its own commit (expected golden change: none). Rule S5 is enforced from I1 on. | One uniqueness test and one typing guard, without blocking features on I1. |
| C18 | Typing guard | **One definition: `js/core/typingTarget.js isTypingTarget(t)`, created by 08 P2-9b** (01 CR-9) with the truth table of 3.8 (C52: one named owner, no "whichever lands first"); 01 T7 and I1 only consume or extend it. `InputState.isShortcutIgnoredTarget` becomes a re-export until I1 deletes it. `interaction/Keymap.js` re-exports it. | One definition, importable by `interaction/` and `ui/`. |
| C19 | Preferences | **`app/Prefs.js` owns every preference key**, prefixed `morph-led-configurator:`: the `:prefs` object (with 05's `hdri_remember` member and, if 03's optional T17 is taken, its `pivot_default_mode` member) and 04's `:uvViewer` key (4.8). | One storage owner (rule S2). |
| C20 | IndexedDB | **05's `HdriCache` (05 T8b, `app/HdriCache.js`) is the only IndexedDB store; 07 H4 is withdrawn.** 05 r3 specifies it in full (05 5.3, its decision record item 4). Logos stay inline in files and autosave. | One store for one job, owned by its only user. |
| C21 | Bug ownership: 08 §5.6 and 07 r2 5.11 both claimed the same ids | **08 §5.6 is the single bug-ownership table.** Each id is first fixed by the 08 commit named in 5.11 here. A 07 task that touches the same code runs **after** that commit (its "After" column names it) and **replaces the mechanism only**: it retires no `Strategies` key and no `LEGACY_SITES` row (08 removes them; 08 P2-13g deletes `Strategies`), and 08's criteria for the id become its regression criteria. The one exception is the preview (C31). | One owner per id; the 08 fixes land first in REFACTOR_PLAN order. |
| C22 | Ranges and limits | **07's ranges, which 08 r3 adopts** (08 §5.6.1, last paragraph): 200 sections (`Wall.MAX_SECTIONS`), panel height ≤ 100,000 mm, LED counts ≤ 65,536, curve ±180°, camera and prop positions within ±100,000 m (writer bounds from 08 P2-13e), camera Y ≥ 0. The same ±100,000 m bound applies to every stage-frame position: the HDRI point x/z (05; y stays [0, 100]) and measurement endpoints (09), and every `translateStage` clamps through its `LIMITS` (C45). Logos: at most **64 distinct images** (`MAX_LOGO_ASSETS`); the upload refuses a 65th with M-LOGO-3 and measures the 2 MB cap on the stored bytes after conversion (08 A2). The JSON size limit is `MAX_IMPORT_BYTES` = 187,347,712 bytes (≈ 179 MB, 08 A1). All these constants live in 08's `domain/rules.js`. | One table for UI and import, derived from what the app can write. |
| C23 | SHA-256 module | **`js/core/sha256.js sha256Hex(bytes, {subtle})`** (6.13), delivered early by 08 P2-13e. `App` injects it as `AssetStore`'s and 05's `digest`. | One module; 08 builds 07's file. |
| C24 | ZIP texture key | **`sections[].texture_file`**: the v1 key, `zip` variant only, written after `logo` (4.2 key order), `null` when 08 P2-1c's guard skipped the texture. There is no `zipManifest`. | Superset of v1 (C1). |
| C25 | Who builds the v2 modules | **08 builds parts of D1-D7 in this spec's final modules and signatures** (08 §5.6 mapping): `ProjectValidator`, `ProjectMigrations`, `ProjectSchema` (P2-3b, P2-13e), the `file` and `zip` writer variants, `CineCamera.LIMITS`/`Prop.LIMITS`, `assign`, `applyImportedPose`, `PROJECT_REPLACED` with `syncFromModel()` on four panels, `core/sha256.js` (P2-13e), escaping (P2-3a), `WallSection.LIMITS` and the caps (P2-8a). This spec completes them (section 10 lists what remains per task). P2-13e omits `project` and `viewport`; D5 adds them **without** a revision bump, because they are part of v2.0 (08 A5). | Each part is built once. |
| C26 | Re-baseline protocol: 08 §8.1 versus 07 r2's PR-body `golden-allow` block, `allow.mjs`, `compare.mjs --allow` and `BASELINES.md` | **08 §8.1 is the only procedure:** the baseline is the parent commit's output, every run is full, every golden-changing commit carries `tests/regression/expected/<commit-id>.json`, `compare.mjs --expect` is the only gating flag, and `expected/_nondeterminism.json` is the only standing allowance. This spec's steps name their manifests `07-<task>.json` (8.4). golden.yml runs exactly this gate in CI (5.8.3). 07 r2's allow block, `allow.mjs`, `--allow` and `BASELINES.md` are withdrawn. A harness change coupled to a code change lands first in a harness-only PR. | One procedure for every spec; it also catches declared changes that did not happen. |
| C27 | Messages and logos | **08's message texts and logo pipeline stand:** its 3.3 message ids (M-EXP-1..4, M-IMP-1..6, M-SEC-1, M-LOGO-1..3) and the two kept legacy alerts, and P2-13a's `LogoLoader`. E2 reroutes every `dialogs.alert` message to the Notifier with the same text (08 Q9); D8 replaces M-IMP-5's alert with the import-report dialog; D6's `AssetStore` stores what `LogoLoader` returns. | One message catalogue, one logo pipeline. |
| C28 | Name sanitising | **08 A3:** `sanitizeText(raw, maxLength)` in `domain/rules.js` strips C0, C1 and the bidi controls and truncates without splitting a surrogate pair, **without trimming**; `WallSection.setName` and the validator both call it, so Save then Open never changes a section name. `project.name` is also trimmed, in `ProjectPanel` and in the validator alike. | The writer and the reader run the same function. |
| C29 | Feature gates | **08 §1.1 is the per-task gate table**, built from each sibling's own prerequisites. This spec adds a gate only where a feature spec names a 07 task (1.4). | Features wait only for what they use. |
| C30 | Imported camera and prop poses | **08 A4:** `ProjectSession.apply` restores poses through `CameraController.applyImportedPose(pose)` and `PropController.applyImportedPose(fields)` (08 P2-13e), **after** `setPreviewEnabled`. A pose restored while the preview is off is kept for the next enable (a one-shot skip of `resetPose()`). | Otherwise every imported pose with the preview on is lost. |
| C31 | Preview bugs (B-M9, B-M11, B-L32, B-L34): 08 P2-10 in the second renderer versus 07 R1/R2 | **Whichever lands first fixes them** (08 §5.6, B-M11 row). If 08 P2-10 lands first, R1/R2 replace its mechanism and keep its geometry and labels. If R1/R2 land first, 08 drops P2-10a/b, R1/R2 take over their retirements and manifest entries, and P2-10c's label work lands in `PreviewPass.updateCamera`. The recommended order is Q18. | 08 already agrees to both orders; the rule makes the owner unambiguous at merge time. |
| C32 | Section offsets versus the pivot translation: 02 r3 conjugated every `postTransform` inside `translated()`, 03 r3 makes `translated()` throw on a non-null `postTransform`, and ARCHITECTURE §9 sketched a wall root group | **03 r3's single pipeline** inside `layoutProject`: (1) `computeWallLayout`: the verbatim walk plus 02's two-pass Detached host walk, B-L1 convention, every `postTransform` `null`; (2) `resolvePivot` on the raw walk, from generative quantities only (edges, `firstEdge`/`lastEdge`, attached-only `generativeBounds()`); (3) `translated(t)` on the raw walk, `t` = −O (stage), −P (export) or 0 (layout); it throws on a non-null `postTransform`, and no `conjugateTranslation` exists; (4) `applySectionOffsets(out)` builds `S_i` from the **translated** section frame (`O_s`, `B`, `baseY`) and asserts `det > 0`; (5) `out.pivot = {resolution, frame, translation}`. 02's E17 and 03's unit test 8 are one shared equivariance test. **There is never a wall root transform:** the identity transform of `wallGroup` is a unit-tested invariant, and D0 rewrites ARCHITECTURE §9's F3 row per 03 §5.9 #2. | Translation equivariance makes the result equal to 02's intent. Implementing both r3 texts made `layoutProject` throw as soon as an offset existed. |
| C33 | Path-B gizmo hooks: 03 r3 used `allowedModes`, an argument-less `endGizmoDrag()` and `cancelGizmoDrag()`; 02 r3 used `allowedAxes(mode)` and `endGizmoDrag({cancel})` and said 03's names did not exist | **One hook set that maps one-to-one onto Selectable v2:** `allowedAxes(mode)` returns `{x, y, z}` or `null` (`null` = the mode is unsupported; it replaces `allowedModes`, so the pivot returns `null` for `'rotate'`); `beginGizmoDrag()`; `applyGizmoTranslate(movement, ctx)` and `applyGizmoRotate(axis, deltaDeg, ctx)` with `ctx = {space, axisWorld, snap}`; `endGizmoDrag({cancel})` only. `TransformGizmo.cancelDrag()` calls `target.endGizmoDrag({cancel: true})` and sets `interaction.gestureCancelled`. `SELECTION_CHANGED.modes` = the modes whose `allowedAxes` is not `null` (5.4.1), so 03's "Pivot (translate only)" badge still works. 03 T5 implements the set and 02 reuses it. If F3 lands after I3, it implements Selectable v2 directly (03's path-A note). | One mapping row per hook in 5.4.1; no hook that I3 cannot convert. |
| C34 | Framing bounds: 08 P2-11c from `worldVertices()` (all sections), 03 `generativeBounds()` (all sections), 02 CR-03-b (attached, pre-offset), I4b `wallBox` (transformed); 09 wants ceilings in the orbit framing and horizontal sections out of D | **`FramingPolicy` (08 P2-13g) defines three named boxes, and each consumer names the one it reads.** (a) `generativeBox`: attached sections, pre-offset; read by the pivot `mesh-center` anchor and by the pre-I4b automatic orbit re-target on every rebuild. (b) `wallBox` = `bounds()`: transformed, all sections including detached ones; read by `F`, Reset, open, new and restore framing (6.14, from I4b on). (c) `stageExtent`: `worldVertices` of the sections whose LED normal has \|n.y\| ≤ 0.9; read by safe distance D, frame width and height, and "fits" (09 Q16). Coverage rays keep all `columnQuads`. P2-11c implements the boxes, with identical results on every harness wall. 03 step F and 02 CR-03-b reference the names; `generativeBounds()` is attached-only from 02 T3 on (identity until a section is detached). | The orbit, Reset and D never jump while offsets are edited; ceilings are framed; overhead sections do not inflate D. |
| C35 | Help-badge text: no owner, every token re-baselines every canvas screenshot, and the accumulated tokens overflow the space left of the preview window | **Per-feature tokens are frozen.** 01 F1-2 keeps " N=normals" (its step already re-baselines the badge rectangle). 03, 04 and 05 add no token (05 RB-2b and the badge part of 04 UV-14 are dropped; 03's "badge unchanged" test stays). **One rewrite lands with I4a**, when right-drag pan becomes true and `ShortcutHelp` already exists from I1: `Drag to rotate • Right-drag to pan • Scroll to zoom • WASD to move • G/R/L/P • ? all shortcuts`. Its manifest is every canvas capture, restricted to the badge rectangle (C57). Feature keys are documented in the `KEYMAP`-generated `ShortcutHelp`, button titles and the README. 06 T4a owns the badge position (bottom stacking), not its text. | One re-baseline instead of five; the badge stays inside its space. |
| C36 | The HDRI projection-point Selectable had three ids and kinds (`'hdri-point'`/`'projector'` in 05, id `'projector'` in 02 and here, kind `'hdri'` in 03) | **Id `'hdri-point'`, label `HDRI Point`, kind `'projector'`, `pickPriority` 9.** The owner (05) picks the id (0.3). 05 implements `isSelectable()` = `content === 'hdri'` && state ready && `pointMode === 'custom'`, and calls `selection.revalidate()` on those transitions instead of a special-cased deselect. | Feature specs own their Selectables; `revalidate()` already drops ids whose `isSelectable()`/`isPickable()` is false. |
| C37 | Observer hooks that 04 needs are missing from `SelectionManager` v2 | **I2 adds `addObserver(o)` and `addHoverHitObserver(fn)`** (5.4.1) as direct ordered calls (R2): observers run once after the emit and the gizmo sync in `select`, `selectMany`, `deselect`, `pickAt` and `revalidate` (only when they emit), and hover-hit observers receive the raw wall hit from `hoverAt`/`clearHover`. `SelectionManager.hoverAt` (skeleton in I2, bodies by 02 T23) is the single hover raycast. 04's `WallHoverProbe` uses its own front-mesh raycast until 02 T23 lands and switches to the shared hit then (04 UV-17 depends on 02 T23, not T8). | One hover raycast; no bus subscriber that could reorder against the gizmo sync. |
| C38 | Three texture budgets (04: 16 MP per rebuild; this spec: 32 MP wall-wide; 08 P2-12d: "32 MP per section") | **One module, `geometry/TextureBudget.js`** (X3, delivered early by 08 P2-12d per C25). `SECTION_TEXTURE_BUDGET_PX = 16,777,216` per rebuild (04 UV-7; every mode that uses section canvases). `PANEL_TEXTURE_BUDGET_PX = 33,554,432` wall-wide, used only with `uv.panel_uvs = 'panel'`. Each canvas side ≤ min(`maxTextureSize`, 4096). Export density is unchanged. 05's HDRI limits stay in `HDRI_LIMITS` (a separate GPU resource) but report into the same perf HUD. | One table of budgets, one module. |
| C39 | Feature-owned JSON keys before their feature lands (01: P2-13e writes `face_orientation`; 03: P2-13e "may write" `show_pivot_marker`) | **Keys are absent until the feature's own landing commit** (4.4 rule 3). F1 T9b adds `face_orientation` (its revision bump; JSON re-baseline in F1-4). F3 T7 adds `pivot`, and `display.show_pivot_marker` from step C. 08 P2-13e's manifest contains neither. 01's `wall.conventions`/`display.debug` import rule and 03's "nested under `wall`" alternative are deleted: no released writer produced those shapes, and the generic `dropped-unknown` handling covers stray keys. | No feature-private migrations (4.6). |
| C40 | Revision numbers: about 14 bumps on parallel branches, examples disagree, and it was unclear whether `generator` bumps | **Revision numbers are assigned at merge time.** `io/ProjectSchema.js` keeps a `REVISIONS` table (n → the keys it introduced), which the validator uses for its `dropped-unknown` and `newer-revision` messages; filling it is a merge-checklist item. Write-only or derived keys (`generator`, `pixel_map`, `atlas`, `resolved_m`, `totals`) never bump. One bump per feature release, not per task. Specs write `"2.<n>"` in examples. | Parallel branches cannot collide. |
| C41 | `ProjectSession.apply` step numbers and feature hydration | **5.5.2 is the numbering of record:** hydration 3, preview 4, poses 5, rebuild 7, `PROJECT_REPLACED` 8, viewport 9, re-selection 10 (D0 edits 02, 05 and 08 §5.4 accordingly). The `features` dependency is an extensible hook map `{pivot, uv, hdri, carModel, stage, measurements, lens, innerFrustum}`; each feature registers its step-3 hydrator (`stage` hydrates 09's `production` key), and 09's `share` and `template` reasons are added to the `apply` reason enum in 09 T6.2/T7.2. | One order; every feature's state hydrates in the same place. |
| C42 | Escape chain gaps (01's popover when focus is on BODY, 02 3b's reorder drag, 09 editing the action) | **Two more registry entries** (3.8): priority 75 `sectionList.reorderActive && (cancelReorder(), true)`, registered by F2 3b; priority 70 `debugControls.isPopoverOpen() && (closePopover(), true)`, registered by F1 and replacing its capture-phase listener. 09 registers priority 40. The chain is 80/75/70/60/40/0. Widget scopes keep handling Escape first (dialog, UV-viewer drag, menus); 03's order (cancel drag, exit pilot, deselect) is preserved. | Every Escape consumer is a registry row. |
| C43 | Letter matching: 01-03 match `e.key`, 05 and 09 matched `e.code` (`KeyH`, `KeyM`) | **Letters match by `key`** (case-insensitive, exact modifiers); **punctuation and brackets match by `code`** (`BracketLeft`/`BracketRight`, `Comma`, `Period`, `Slash` for `?`). 05's `H` and `Shift+H` rows use key `'h'`; 09's `M` row uses key `'m'`. | AZERTY and Dvorak users press the letter their keyboard prints (on AZERTY the `KeyM` position prints `,`). |
| C44 | The full shortcut inventory | **3.8 is the final `KEYMAP`** (global rows, Escape chain, widget scopes, pointer modifiers, rejected chords). Under exact-modifier matching no two global chords collide. `Delete`/`Backspace` act only when the target is `#three-canvas`, `body`, `#wall-sections` or `#section-toolbar`. `Shift+G` no longer triggers `G` (Q19; 08 P2-9b allowed it). | One table that the uniqueness test reads. |
| C45 | Re-expression on pivot edits (StageAnchored) misses the orbit and clamps inconsistently | **From I4b, `OrbitController` joins `stageAnchored`:** its `translateStage(Δ)` moves target and camera by −ΔO, unrecorded (before I4b the legacy re-centre hides the jump). **Every `translateStage` clamps through its `LIMITS`** (C22 writer bounds); 03's camera "No clamp" is withdrawn. The HDRI point x/z range widens to ±100,000 m (y stays [0, 100]), so re-expression never clamps in practice. 4.2's coordinate rule lists camera, props, the HDRI point, `measurements[]` and `viewport.orbit`. | After a "Keep stage layout" commit the wall no longer jumps on screen, and the validator never clamps a re-expressed value on reload. |
| C46 | Per-frame scalers under render-on-demand (03 `pivotMarker.updateScale`, 02 path B `gizmo.updateScale`) | **5.2.2 owns the tick.** `SceneManager.addPreRender(fn)`: every registered function runs on each rendered frame, after the camera update and before the passes of `renderFrame`. 03 registers `pivotMarker.updateScale`; 02 path B registers `gizmo.updateScale`. 03's tick snippet is replaced by a pointer to 5.2.2. | The scalers depend on camera distance, which only matters on frames that render. |
| C47 | Feature events that only update the DOM would invalidate the canvas | **Each feature classifies its events as visual or non-visual in the `Events` catalogue** in the commit that adds them; static rule S9 enforces it. Non-visual: `UV_VIEWER_CHANGED`, `UV_DATA_CHANGED`, `STAGE_ESTIMATES_CHANGED`, `CAMERA_MOIRE_CHANGED`, `UNITS_CHANGED`, `HISTORY_CHANGED`, `AUTOSAVE_STATUS`. Visual: `DEBUG_VIEW_CHANGED`, `SECTION_CHANGED`, `SELECTION_HOVER_CHANGED`, `WALL_PIVOT_CHANGED`, `UV_TRANSFORM_CHANGED`, `UV_SETTINGS_CHANGED`, `UV_HOVER_CHANGED`, `HDRI_CHANGED`, `HDRI_PROJECTION_CHANGED`, `CAR_MODEL_CHANGED`, `MEASURE_CHANGED`, `MEASUREMENTS_CHANGED`. | Owner rule per event; no needless renders. |
| C48 | 01's debug shading (a material swap) leaks into stills and screenshots | **`LEDWallView.withContentMaterials(fn)`** (01): restore the original materials, run `fn`, re-apply the override. `PreviewPass.capture` (R4) and 09's `captureCanvas` call it unless `include.debug` is true. The live preview keeps showing the shading (01 Q10). | Client-facing stills never show face orientation or normal colours. |
| C49 | One wall content-mode enum (05 `ContentMode.HDRI` + `setContentMode`; 04 `setPanelIds(true)` and a `'led'` value; 01's radio labelled "Content") | **`domain/Project.js` `ContentMode {COLOR: 'color', LED_SIM: 'ledSim', PANEL_IDS: 'panelIds', HDRI: 'hdri'}` is the only enum** (`display.content`). After F5, `WallController.setContentMode` is the only content writer; `setLedSim` and `setPanelIds` become wrappers that keep their legacy events and return values. 04 calls `setContentMode('panelIds')` (`setPanelIds` before F5), and its viewer background values are `'panelIds'\|'ledSim'\|'checker'\|'hdri'\|'none'`. Debug shading is an orthogonal override over every content mode, HDRI included; 01's radio is labelled "As displayed". | One enum and one writer. |
| C50 | 06's 60 px header leaves no room for `#history-undo`, `#history-redo` and `#autosave-status` (3.2) | **06 §3.2 defines the header as a grid** `[brand lockup \| history group (two 32 px icon buttons plus status) \| stats]`. Below 1100 px the status text collapses to an icon with its text in `title`; below 900 px it hides (it remains in the Project section). Whichever of 06 T4a and H2 lands second fills the slot and re-baselines. | One layout owner for the header. |
| C51 | Viewport overlays collide top right (`#perf-hud`, 01 and 04's column, the `right: 72px` slot) and top centre (pilot banner, 01's legend, the restore and share banners) | **`#perf-hud` moves to `left: 20px; top: 280px`**, below 06's reserved zone. **A top-centre stack, `#viewport-top-stack`**, placed in the DOM after `#pilot-info` and `.brand-watermark` so the existing sibling selectors still work, holds the restore banner, 09's share banner and 01's `#debug-view-legend`, in that order, and shifts to `top: 72px` while pilot is visible. The `right: 72px` slot keeps the z-order debug popover 110 > UV viewer 30 > HDRI badge 20. | One stacking rule per zone. |
| C52 | Shared helpers with competing creators ("whichever lands first") | **One named owner per helper.** `.view-btn.active` (B-L24): 01 T7 (06 T11 and 08 P2-13d's fallback are dropped; 06 T4a owns the badge offset and maps the rule to role tokens). `core/typingTarget.js`: 08 P2-9b with 3.8's truth table (01 T7 and I1 consume or extend it; C18). `disposeObject3D` de-duplication: 01 T10. Vertex ranges and `sectionRangeForFace`: 08 P2-7; `pickMeshes()`: 01 T10; 02 and 04 consume them. css-slices: S7, run with `--report-only` and scoped to `01-12` from the first intentional CSS change. **CSS link order:** `00-fonts`, `01`-`11`, `css/features/*`, `12-responsive`, `20`-`29` (09), `99-utilities` (06). | No duplicated work, no ordering race. |
| C53 | Harness colour probes hard-code colours that 06 T5/T7 and U3 change | **Probes read colours from a harness hook** that exposes the live palette and `SceneTheme` (or the swatch values in `sectionsSnapshot`), never from literals. The 06 T5/T7 and U3 manifests declare the probe JSON outputs (`content_probes`, `face_probes` and similar). 01's colour-pipeline risk belongs to U3, not to spec 05. | Each colour change stays attributable to its step. |
| C54 | Ownership of the sRGB output switch (06 R6 said spec 05) | **U3 owns it.** With `ColorManagement` enabled, three converts hex material colours from sRGB automatically, so 06's `ThemeBridge` needs no `num-linear` kind. Only raw vertex colours (the safe-distance floor and 08's "clamped" tint, through `setRGB(…, SRGBColorSpace)`) and canvas textures (`colorSpace`) need explicit U3 handling. 05's shader port is U3b. | 05 chose Option L (linear output, no tone mapping) on r128. |
| C55 | 05 needs R3 hard; 1.4 listed it as soft; 03 still named 05 T0 | **R3 is a hard gate for F5 T4 onward** (ticks call `invalidate`; uniforms are read per frame). 03 step C is gated on 08 P2-10a **or** R1 only; its 05 T0 references are removed (05 r3 deleted T0). | — |
| C56 | 03 kept the pivot marker's pick proxy on layer 0 | **The proxy is tagged `HELPERS`** like the rest of the marker. Pickability comes from `PointerRay.layers.enableAll()` and the explicit `pickMeshes()` list, so the proxy is hidden and unpickable in pilot, consistent with `O` being `notInPilot`. | R1's per-frame enforcement re-tags the whole subtree anyway. |
| C57 | Harness tooling specified in five places (08 P2-0, 01 T2, G3, 09 T0.1, 05 RB-2b's withdrawn `compare --allow`) | **One harness-only PR series:** 08 P2-0 (`--expect`, the nondeterminism allowlist, `p2_*` scenarios) → 01 T2 (rect allowances as a `rects` field on `--expect` manifest entries, measured by `measure-rects`) → G3 (absorbing 09 T0.1: per-scenario context isolation, print and clipboard hooks) → G4 → G6. Every rect-limited step, including 01 F1-2 and the I4a badge step, uses `--expect` `rects`. | One tool chain, no withdrawn flags. |
| C58 | Plan aggregation read stale summaries, and effort was counted twice | **Plans read the files.** The schema is 4.2 (snake_case); the three.js upgrade is Track F after F5. Efforts from the files before these consolidations: 01 19.5 d; 02 37.5 d (path A) or 39.5 d (path B); 03 21.5 d (20 if P2-11c has landed); 04 30 d; 05 31 d (MVP 12.75 + T15 2-3 + increments); 06 17.75 d; 07 68 d required + about 10 d Track F + 3 d optional + up to 3 d of I3 conversions; 08 56 d; 09 46.5 d; about 328 d in total plus Track F. Each spec's own totals are restated after the consolidations below. **Consolidations:** one D0 of about 3 d replaces the documentation tasks 04 UV-0, 05 T15 (its documentation part), 02 T14, 03 T13 (which keeps only the owner's sign-off) and the documentation part of 01 T11; P2-11c is counted only in 08 (03's former T11); 06 T11 is dropped; **I1-I3 are scheduled before 02's gizmo work and before 04 UV-12/13**, so F2 and F4 take path A and no path-B scaffolding is built (02 path B's +2 d, 04's `UvFallbackHistory`, `'u'` branch and UV-18, and most of I3's conversions); if 09 X4 is accepted, R4 becomes required and is counted once here; 09 T0.1 merges into G3; 05 RB-2b is dropped. About 13-17 d are avoided. | — |
| C59 | 5.6.1's feature rows covered 02-05 only | **Rows added** (5.6.1): F1 `LED side (<name>)` and `Flip LED side (N sections)` (02 T27 later relabels them); F6 brand mark; F5 car model, paint, finish and env source; a pointer to 09 §5.5. The pivot use case records **one** entry, which includes the re-expression of camera, props, HDRI point, measurements and orbit (every `translateStage` write). | — |
| C60 | No spec stated which frame each consumer uses | **ARCHITECTURE §1.4 states the frame per consumer** (D0). **Stage frame** (`WallController.currentLayout`): `LEDWallView`, frames, picking, gizmo anchors, 02 outlines and the fast path, 01 normal lines (`matrixWorld`), 04 hover readout (`panelCornersWorld`), 05 shader (`modelMatrix·position`) and T13 bake, 08 `FrustumCoverage` and `CameraHub`, the safe-distance band, 09 inner frustum, measurement snapping and the X15 plan SVG, and every stored pose. **Export frame** (`layoutProject({frame: 'export'})`): `ObjExporter`, `GltfExporter`, the ZIP and 09 X11 stage packs. The safe-distance OBJ is the stage band translated by (0, −P.y, 0) (03 §7.1). Texture content (04 UVs, 05 bake, panel IDs) is frame-independent. | 05's bake on the export layout (E) would sample every texel P.y too low. |
| C61 | One schema with every feature and 09 item | **4.2 is the single schema** with the final key order and the rules listed under it (frames, ranges, key absence, revisions, one migration path, hydration in `apply` step 3, key order from `ProjectSchema`, variants including 09's `share`, domain enum spellings, validator calling the features' own `RULES`). 09's proposed top-level `stage` is renamed **`production`** before it lands, because "stage" already names 03's frame and 05's `env_source` value. | — |
| C62 | `Brand.jsonGenerator` (09 said it does not exist) | **Kept.** 06 owns `Brand`; `jsonGenerator` is added by 06 T6a or D4, whichever lands first, and C10 writes it as the second key. 09's stage-pack manifest and spec-sheet generator write `{name: brand.jsonGenerator.name, version: APP_VERSION}`. | One generator identity. |

### 0.2 Change requests adopted, and the residual edits (task D0)

**Revision 2's 0.2 edits are applied** by the sibling revisions listed above (01 r3, 02 r3, 03 r3, 04 r2, 05 r3, 06 r3, 08 r3). The siblings' requests to this spec are adopted here:

| Source | Request | Where in this spec |
|---|---|---|
| 01 CR-9 | 08 P2-9b creates `core/typingTarget.js` | C18 |
| 02 CR-07-a | `offset.rotation_origin` (not `pivot`) in the skeleton and the field table; F2 reserves `sections[].detached` and `sections[].anchor_section_id`; `SECTION_FIELDS` gains `'detached'` and `'anchorId'` | 4.1, 4.2, 4.3, 4.4 |
| 02 CR-07-b | The press record is also cleared on `window` `pointerup` and `pointercancel` | 6.4 |
| 02 CR-07-c | `GizmoCtx.snap` is the shared `InteractionState.snap` (`translateMm`, `rotateDeg`, `pivotM`) | 5.4.1, 6.5 |
| 02 CR-07-d | `apply` restores remembered `section:` ids only for `undo`/`redo` | 5.5.2 step 10 |
| 02 CR-07-e | `getTransform(out, {mode})`; `attach()` and `sync()` pass the mode; `setMode()` calls `sync()` | 5.4.1, 5.4.2 |
| 03 5.10.1 #6 | `pickPriority` outranks wall (section) hits only; among camera, prop, pivot and HDRI-point hits the nearest wins | 3.7, 6.4 |
| 04 07-2, 07-3 | `uv_transform.source_rotated`; the `_led` unit suffix | 4.2, 4.3 |
| 04 07-4, 07-7 | 04's History record rows; `UVViewer` subscribes `HISTORY_CHANGED` and `PROJECT_REPLACED` | 5.6.1, 5.10 |
| 04 07-5 | `U` is `notInPilot`; the `uv-viewer` scope's wording and propagation rule; `bindScopedKeys(el, scope, actions, {actionTarget})` | 3.8, 5.9.4 |
| 04 07-6 | The `:uvViewer` record content | 4.8 |
| 05 5.11 a | 0.2 rows for 05 marked applied; C9 and C20 recorded identically in 05 | this table, C9, C20 |
| 05 5.11 b | Dome: preview and still yes, `CubeCamera` no | 5.2.1 |
| 05 5.11 c | Tick comment: `hdriController.tick(now)`, `carModelController.tick(now)` | 5.2.2 |
| 05 5.11 d | `createExrLoader` loads `examples/js/libs/fflate.min.js` first; 05's SRI table | 5.7.4 |
| 05 5.11 e | `shift?: boolean \| 'any'`; the dispatcher passes the `KeyboardEvent` to the action | 3.8 |
| 05 5.11 f | The skeleton's `hdri` leaves; `asset_id` as a bundled-manifest id; the `hdri.source.path` variant row | C9, 4.2 |
| 05 5.11 g, h | Serializer option `hdriZipPath`; `openFile(zip)` hands `hdri/` entries to `hdriController.provideZipEntries(map)`; `apply` calls `carModelController.syncFromModel()`; `exportZIP` writes `hdriController.zipEntry()` | 5.5.1, 5.5.2 |
| 05 5.11 i | `:prefs` gains `hdri_remember: true` | 4.8 |
| 05 5.11 j | `onRestored` gains `hdriController.onContextRestored()` and `carModelController.onContextRestored()` | 5.9.3 |
| 08 A1-A6 | JSON size limit; 64 distinct logos and M-LOGO-3; no trim for section names; poses after `setPreviewEnabled` through `applyImportedPose`; `project`/`viewport` without a revision bump; the B-L1 decision | C22, C28, C30, C25, C6 |

**Residual edits** (task D0, docs only, one commit before D1; revision 3.1 applied them to the sibling files together with the review of 0.4):

| Spec | Section(s) on disk | Edit |
|---|---|---|
| 02, 05 | every reference to 07 r2's `apply` step numbers | Use the numbers of 5.5.2: hydration step 3 (04's references are already right), preview step 4, poses step 5, rebuild step 7, `PROJECT_REPLACED` step 8, viewport step 9, re-selection step 10 through `selectMany` (02's "step 8 (`selection.revalidate()`)" in its 2.x table, P-IMPORT and CR-07-d). 05's `carModelController.syncFromModel()` call moves from "step 4" to step 3 and its `project:replaced` row from "step 6" to step 8. 08's A4 text describes 07 r2 and stays as history. |
| 08 | §4.3 `id` row, §6.5 id assignment | Ids are integers in [0, 2³¹−1]; when `max + 1` would exceed 2³¹−1, `nextFree` and `Wall.nextSectionId` take the smallest unused integer instead (6.8 here), so re-validation never renumbers again. |
| 08 | P2-12d (`panelPxPerLed` budget) | The budget of 6.12 is **wall-wide** (`wallPanelLeds` summed over the sections, one `pxPerLed` for the whole rebuild), and only 04's `panel` option reaches it. |
| 08 | §5.6 rows B-L31 and B-M11 | Mark A4 adopted (5.5.2) and C31 as the binding statement of the either-order rule. |
| 09 | 3.9 `Esc` row, 5.8 composition, T13.2 | The measure step registers with `viewportInput.registerEscapeHandler(40, () => measure.active && measure.cancel())` (3.8) instead of editing the `escape` action. |

### 0.3 Ownership after reconciliation

- **This spec owns:** the file envelope and the 4.2 skeleton; `ProjectSchema`, the validator, migrations and the serializer, completed on top of what 08 builds (C25); `ProjectSession`; `History` (the only undo stack); `Autosave`, `Prefs` and `AssetStore`; the single renderer and the layer table; render-on-demand; the selection registry, the `Selectable` v2 contract and the gizmo wrapper (from I3); `KEYMAP` and the keyboard dispatch (from I1); `vendor/three-addons.js`; the Notifier and Dialog; CI and deploy.
- **Spec 08 owns:** the first fix of every bug id (§5.6, C21); the limit constants of `domain/rules.js` (C22); the parts of D1-D7 and E3 it delivers early (C25); `LogoLoader` and the message texts (C27); the re-baseline procedure (C26).
- **Feature specs own:** their fields' semantics, defaults and ranges (added to `ProjectSchema` by the feature, 4.4), their `Selectable`s and providers, their `KEYMAP` rows and actions, their `History` record rows, their helpers (registered on the layer named in 5.2.1), and 05's `HdriCache`.

### 0.4 Cross-spec consistency review (revision 3.1)

The review checked the nine specs against each other (not only against this one). Its resolutions that bind this spec are C32-C62 above. The others are recorded in the sibling specs, and are listed here so that 0 stays the single index:

| Topic | Resolution | Specs edited |
|---|---|---|
| Section cap in 01's fixtures | 01 regenerates its cap fixture at **200** sections of 50×20 (C22 is unchanged): vertex lines only 214,200 total, stride 2, 107,100 written; both kinds 414,200 total, stride 3, 138,067 written. `MAX_NORMAL_LINES` stays 150,000 unless 01's manual check re-measures and raises it to 250,000. | 01 |
| Cabinet back-shell colour | `SceneTheme.wallBack` = **#403C37** everywhere: the `Theme.js` fallback, `--scene-wall-back`, the `COLOR_BINDINGS` row, 06's per-key table (ΔE00 58.1 from Pivot Gold) and 01's harness palette hook. | 01, 06 |
| Render order | 01's `core/renderOrder.js` is the single registry, and its static rule (no literal ≥ 900 outside it) applies to every spec. Slots: `HDRI_BACKDROP` −1e6, `RIG_CORE` 1, `INNER_FRUSTUM_OVERLAY` 990 (09, depth-tested), `MEASURE` 992 (09), `HDRI_MARKER` 993 (05), `UV_HOVER_OUTLINE` 994 (04), `NORMAL_LINES_ON_TOP` 995, `PIVOT_MARKER` 996, `HIGHLIGHT_HALO` 997, `SECTION_HIGHLIGHT` 998, `GIZMO` 999. Each slot lands with its owning spec. | 01, 02, 03, 04, 05, 09 |
| Feature colours after 06 | 06 §5.12's per-key table is the spec of record. Each later feature lands with 06's values and treatments in the same commit: a token, a `COLOR_BINDINGS` row, a `Theme` fallback, and two-tone overlays (a Morph Black halo plus a dashed core from closed `Line`/`LineSegments` geometry, never `LineLoop`) at the registry's slots. | 02, 03, 04, 05, 06 |
| Layout accessor | One accessor, `WallController.currentLayout` (02); before 02 lands it is the layout of the last P1 rebuild. 05 adds `rebuildSeq` and reads `currentLayout` (no `lastLayout`). | 02, 05, 09 |
| ZIP atlas filename | `'textures/' + Brand.files.panelIdsPng`, never a literal (06 R-B3b). 06 T6b's `--rename` map covers the ZIP entry path, the MTL `map_Kd`, glTF `images[].uri` and JSON `atlas.texture_file`. | 04, 06, 08 |
| Panel IDs sidebar section under HDRI content | The section stays visible; it collapses by default when `content ≠ panelIds` and shows the hint "Also used by Panel ID exports". | 05 |
| LED side controls | `select.section-face-select[data-section-flag="faceOrientation"]`; the id `#flip-all-sections` is kept and owned by `SectionToolbar` from 02 T12. | 01, 02 |
| 09 X10 presets | `applyVolumePreset` runs inside one `WallController` use case with `setSectionsDetached([id], true)` semantics (host = `wall.defaultAnchorFor`, dependants re-anchored), then the field and offset writes, one rebuild and one history entry. | 02, 09 |
| REFACTOR_PLAN §5 Phase 2 order | 08's P2-0 amendment commit rewrites the Phase 2 list to 08's merge order and batch membership (P2-5a, then P2-1 (B-H3), then P2-2). | 08 |
| Rebuild-policy row ids | ARCHITECTURE §6.2 rows get named ids (`F6-1`, `F3-1..5`, `F2-1..13`, `F4-n`, `F5-1..3`, `X2-1`, …) instead of contested numbers; D0 applies them. | 02, 03, 04, 05, 06, 09 |

---

## 1. Summary and user value

### 1.1 The problem

The refactor gives the app a clean module structure, and spec 08 (Phase 2) fixes its known defects. It still has these weaknesses:

- **Platform gaps.** It runs two WebGL contexts. It renders every frame even when nothing changes. Spec 08's v2 file saves the wall, camera, props, styling and logos, but not the project name, the view or any feature state, and opening a file does not restore everything through one path. It cannot undo. A reload loses all work. It reports failures through blocking `alert()` dialogs. It has no CI.
- **Library age.** It is pinned to a 2021 three.js build whose colour management, HDR loading and controls all differ from current three.js. The owner keeps r128 for now; this spec plans the upgrade so it can run later as one attributable series.
- **Feature blockers.** Each of the six planned features needs at least one of these foundations:
  - Feature 5 (HDRI and PBR car) cannot share PMREM output across two contexts.
  - Features 2, 3 and 5 need a real selection registry and gizmo.
  - Features 1-6 add state that must be saved, undone and validated, and today each spec assumes its own file shape.

### 1.2 Who benefits

| User | Value |
|---|---|
| LED / VP stage designers (primary users) | The normals fix ships first, with no platform wait. Projects survive reloads and crashes (autosave). Ctrl+Z works. Saved files restore the whole stage: camera, props, styling, logos, pivot, offsets and UVs. The preview shows the clean camera view without helpers or tint. Errors explain what to do. The UI works by keyboard and touch. |
| The owner (sole maintainer) | CI catches regressions on every push. Deploys are automated. Every feature extends one schema, one selection registry, one undo stack, one keymap and one layer table. The three.js upgrade is planned as a separate, attributable series. |
| Downstream tools | A documented, versioned, validated JSON format that is a **superset of v1** (`"version": "2.0"`, `"format": "morph-led-project"`), so existing v1 parsers keep reading the generative wall (sections, panels, LEDs, curvature; 7). |

### 1.3 Recommendations at a glance

1. **(a) Single renderer.** Draw the camera preview into the main canvas with `setViewport`/`setScissor`, letterboxed to the filmback, with one WebGL context (C31: this replaces 08 P2-10's second renderer if P2-10 landed first, keeping its geometry and labels). Layers: `DEFAULT 0`, `HELPERS 1`, `ENVIRONMENT 2` (Feature 5's backdrop dome), `DEBUG 3` (Feature 1's normal lines). The main camera sees all four; pilot mode hides `HELPERS`; the preview and still cameras see `DEFAULT` and `ENVIRONMENT`. Stills use a multisample render target on r128.
2. **(b) Adopt both three.js controls** (the r128 `examples/js` builds, behind a factory).
   - **`TransformControls`:** it keeps 08 P2-9's gizmo fixes (B-M12, B-L28, B-L22, B-L23) by construction and deletes the hand-written gizmo. Drive it through a proxy `Object3D` so the domain model stays the single source of truth. In pilot mode it is disabled and hidden (`setPilot`, B-L26 kept).
   - **`OrbitControls`:** use it for drag, wheel, pan and touch. Keep a thin custom keyboard layer for WASD/QE with delta time (08 P2-9h's B-L27 fix kept). In pilot mode its update is frozen, so it never re-aims the pilot camera.
   - **`SelectionManager` v2:** a registry of id-based `Selectable`s with providers, pick priority and group composites. Selection on click with less than 4 px of travel (08 P2-9a's B-M14 fix), now in any gizmo mode. A capture-phase press record makes "click on a gizmo handle" detection independent of listener order.
3. **(c) Render on demand.** Use a dirty flag set by explicit `invalidate()` calls. A camera-matrix change check is the safety net. The idle GPU load drops to zero.
4. **(d) Project file v2.** A snake_case superset of v1 (section 0, C1). Spec 08 builds the validator, migration, schema and the `file`/`zip` writer in this spec's modules (C25); this spec completes them and adds the session. One serializer serves file, ZIP, history and autosave. A schema-driven validator coerces, clamps, renumbers ids, strips control characters and rejects prototype keys; its ranges contain every value the app's own writers can produce (C22), so Save then Open never changes a project. v1 files migrate as a wall-only import. Logos are stored by reference in an `assets` table, inline in files; Feature 5 describes its HDRI with its own source descriptor (C9). Section 4.2 holds the **canonical skeleton** that Features 1-6 extend.
5. **(e) Undo and autosave.** Undo is snapshot-based: undo is "apply the previous snapshot". Only the outermost use case records, so a click that runs nested use cases makes one entry with the click's label. Continuous edits coalesce, and gizmo drags are wrapped in begin/commit transactions whose commit always records. Recording is suspended while a project is being applied, so Open, New and Restore each make exactly one entry. Autosave writes to `localStorage` after a 1.5 s debounce, using two slots so the previous session is never overwritten before the user decides.
6. **(f) three.js upgrade path.**
   - **When:** after Feature 5 ships (Q1 default; section 0, C13). U0 (decouple export and canvas colours from `THREE.Color`) may land any time after D2.
   - **How:** three re-baselined steps.
     - U1: the same r128 code delivered as ESM via an importmap. Expect zero diffs.
     - U2: the current release with the legacy colour pipeline. Expect screenshot-only diffs.
     - U3: colour management on, plus 05's documented port (U3b). Expect screenshot-only diffs.
   - The golden master accepts screenshot diffs only, and only after review.
7. **(g) CI.**
   - Run the static checks and unit tests on every push and PR (about 1 minute, no npm install).
   - Run the golden master **differentially** in one job, with 08's procedure (C26): the base commit with its own harness and the PR head with its own harness, on the same runner and the same Chrome, gated by `compare.mjs --expect` and the manifests the PR adds. Trigger it by the `golden` label, by hand and weekly. The harness is made clock- and timing-deterministic first (8.3).
   - Deploy to GitHub Pages from Actions after the checks pass.
8. **(h) Cross-cutting quality.**
   - **Accessibility:** on top of 08 P2-13c (switch semantics for the 9 toggles, B-L36) and P2-8d (one rebuild per mesh-mode click, B-L13): focusable mesh-mode radios whose `checked` state mirrors the model (V-2), ARIA labels, persistent live regions and the keyboard registry.
   - **Performance:** a measured budget table, a lazy canvas probe for exports, a texture budget for 04's per-panel option (08 P2-12d already bounds the default), coalesced rebuilds and a perf HUD.
   - **Error UX:** a `Notifier` with toasts and `Dialog`s replaces the 3 legacy `alert()` sites and 08's `dialogs.alert` messages, with the same texts (C27).

### 1.4 Recommended sequence: spec 08 alongside three tracks

The owner's first fix (normals) must not wait for platform work, and neither must any feature whose spec does not need it. Spec 08 (Phase 2) lands the bug fixes in its own merge order (08 §1) and delivers parts of this spec's D-tasks early (C25). Every task here names the 08 commits it waits for (C21), and features are gated only on what their own specs require: **08 §1.1 is the per-task gate table** (C29).

```
D0 consolidated reconciliation (docs only, about 3 d; 0.4) and the owner decisions of 1.5: before any shared-contract code
  |
Phase 1 merged (WP1-WP10, 1C H1/H2)
  |
  +-- Harness-only PR series (C57): [08 P2-0] -> 01 T2 (rects in manifests) -> G1/G3 (absorbs 09 T0.1) -> G4 -> G6
  |
  +-- Spec 08, in its merge order (08 §1): P2-0 ... P2-13g. Its commits are the "[08 ...]" gates below.
  |     P2-13g (Strategies deleted) lands after F1-5 and F3 step A have edited their keys.
  |
  +-- Track 1: owner's first asks (no 07 work needed; 08 §1.1)
  |     Feature 6 T1-T7 first (Phase 1 or [08 P2-2]; T4b after the owner's OK), so later features ship 06's tokens and
  |     two-tone overlays; Feature 1 (debug view after [08 P2-2], LED side after [08 P2-3b, P2-5b]);
  |     Feature 3 steps A, B and D; Feature 6's and Feature 3's persistence after [08 P2-13e]
  |
  +-- Track 2: persistence --------------------------------------------------------------------------------------
  |     G1 CI -> [08 P2-13e] -> D1 -> D2 -> D4 -> D5 session (feature hook map, C41) -> H1 history -> H2, H3 autosave
  |                                                    (E1 Notifier after G1; D6 assets -> D8 project UI)
  |
  +-- Track 3: rendering and interaction ------------------------------------------------------------------------
  |     R1 layers -> R2 scissor preview -> R3 render on demand   (Phase 1C only; or after [08 P2-10a-c], Q18; F5 starts after R2)
  |     E1 -> [08 P2-9b] I1 keymap -> [08 P2-9a] I2 selection v2 (+ observer hooks, C37) -> [G6, 08 P2-9c-f, j] I3 TransformControls
  |        -> [08 P2-9g-i, P2-11c] I4a OrbitControls (+ the one help-badge rewrite, C35) -> I4b framing policy (+ stageAnchored orbit, C45)
  |     I1-I3 land before F2's gizmo work, F4 UV-12/13 and F5 T6 (path A, C58): 08 pulls P2-9e-j into its feature-gate block
  |
  +-- Cross-cutting: X1 a11y (after E1, I1, [08 P2-13c]), X3 budgets (after E3, [08 P2-12d]), X4 perf HUD (after R3),
  |                  X5 warning (after E1); X2 contrast (any time, with Feature 6)
  |
  +-- Track F, after Feature 5 ships (Q1): U0 (allowed any time after D2) -> U1 -> U2 -> U3 + U3b (05 6.11 port)
```

**The only feature gates this spec adds** (everything else is 08 §1.1; C29):

| Feature task group | 07 gate | Source |
|---|---|---|
| F1 | none. R1 later moves its normal lines to `DEBUG`; I1 moves its `N`/`Shift+N` listener into `KEYMAP`. | 01 r3 |
| F2 3a | **path A (recommended, C58):** I1-I3 before its gizmo work, plus D2, D4 and D5; path B (08 gates only) only if the owner answers 02 Q26 "B" | 02 r3 2.4, Q26 |
| F2 3b (undo rows, Escape slot 75, hover bodies in T23) | H1 | 02 r3, 08 §1.1 |
| F3 | none; step C needs B-M11 fixed (08 P2-10a **or** R1, C31, C55); persistence (T7): 08 P2-13e or D2 + D5; if it lands after I3 it implements Selectable v2 directly (C33) | 03 r3, 08 §1.1 |
| F4 UV-5 onward | D5 (`ProjectSchema` and validator hooks, `ProjectSession`) for UV-5c; UV-12 after I1 and UV-13 after H1 (path A: no `UvFallbackHistory`, C58); UV-17 after 02 T23 (C37) | 04 r2 2.3, 08 §1.1 |
| F5 every task except T8 | R1 + R2 (render); **R3 hard for T4 onward** (C55); I1-I3 for T6 and the loader factories (T1); E1 (soft) | 05 r3 header |
| F5 T8 (persistence) | D4, D5, D6 (plus 08 P2-13e) | 05 r3 header, 08 §1.1 |
| F6 T8, T10 persistence half | none beyond 08 P2-3b and P2-13e | 06 r3, 08 §1.1 |

Until a feature's persistence gate lands, its new state is session-only, and its release note says so. Section 10 gives the critical paths, computed from the dependency column and 08's merge days.

### 1.5 Owner decisions to collect up front (with D0)

08 Q10 (B-L1: keep; C6), Q18 here (R1/R2 before 08 P2-10), Q1 here (stay on r128 through F5), 02 Q26 (path A, which implies I1-I3 before F2's gizmo work), 02 Q24/Q25, 06 Q2 (publishing brand assets gates 06 T4b, T9 and T10), 01 Q1/Q2/Q5 (before F1-5), 04 Q12 (the pipeline check before UV-7), and which 09 items are accepted.

**Recorded 2026-10-16** (`docs/IMPROVEMENT_PLAN.md` §8): the full platform route, so 02 Q26 is path A; 06 Q2 approved (exactly the 8 files of 06 §5.8); every other question above takes its recommended answer. 04 Q12 remains a test the owner runs before UV-7. Merges stay serial, one golden-changing commit at a time, each with its `--expect` manifest.

---

## 2. Current state

Sections 2.1-2.7 describe the legacy behaviour (`index.html@cd3fd3f`, preserved by Phase 1). Most of the defects they cite are fixed first by spec 08; section 2.9 lists the state this spec actually starts from.

### 2.1 Rendering: (a) and (c)
- **Main renderer:** `new THREE.WebGLRenderer({ canvas, antialias: true })` at 1436-1438, DPR capped at 2, owned by `SceneManager.init()`.
- **Second renderer:** `initPreviewCamera` at 3634-3645 creates a second `WebGLRenderer`, and with it a second GL context, on `#camera-preview-canvas`. It is fixed at 320×180 (`Strategies.previewRendererSize`, **B-M9**: filmback aspect stretched by about 18.5%). It is owned by `PreviewWindow.init()`.
- **What the preview renders:** `renderPreviewCamera` (3742-3745) renders the **whole scene**, including the grid, axes, gizmo, frustum and the 8% orange fill (`Strategies.previewRendersHelpers`, **B-M11**).
- **Resize handle:** it can blow out the window size with extreme aspects (**B-L32**, `PreviewWindow#setupResize`).
- **Double cost:** every texture is uploaded twice, once per context. PMREM render targets cannot be shared between contexts, which blocks Feature 5.
- **Layers seam:** `LAYERS = { DEFAULT: 0, HELPERS: 1 }` is declared in `SceneManager` but never applied (rule R6). The grid, axes, camera rig, safe-distance group and gizmo are already registered through `SceneManager.addHelper`.
- **Render loop:** `animate` (3884-3890) and `SceneManager.startLoop(tick)` call `requestAnimationFrame` unconditionally. Each frame runs the keyboard polls, the main render and the preview render, so two full scene renders per frame even when idle.

### 2.2 Selection, gizmo and orbit: (b)
- **Selection:**
  - Ids are strings: `'camera' | 'person' | 'car'` (`SelectionManager.register`, App registration order camera, person, car).
  - Picking runs on **mousedown** and only while a gizmo mode is active (`ViewportInput.attachPointer`, 4437-4448).
  - A miss deselects, including the start of an orbit drag and right clicks (**B-M14**).
- **Gizmo:** hand-written, `TransformGizmo` (2997-3425). Its known defects:
  - **B-M12:** it rotates opposite to the drag (`Strategies.gizmoRotateSign = -1`).
  - **B-L28:** the world rings write Euler channels.
  - **B-L22:** the prop handles are inert.
  - **B-L23:** the local orientation goes stale.
  - **B-L12:** it leaks resources (`Strategies.dispose.gizmo`, flipped in 1C).
  - **B-L26:** it stays visible in pilot mode.
  - **B-L10:** it bypasses validation (`CineCamera.translateBy`). Camera and prop pan (`rotY`) become unbounded (3380, 3390, 3396; pilot 3551); camera `posZ` can go negative (3340).
- **Hover:** the custom gizmo changes handle opacity on mouse move. No event is emitted, so a render-on-demand loop must be told explicitly (5.3).
- **Orbit:** custom spherical controls in `OrbitController` (3747-3875).
  - Drag moves 0.01 rad/px. The wheel moves linearly with `deltaY*0.01`, clamped to [2, 30]. Phi is clamped to [0.1, π-0.1].
  - The target is the flat-bounds centre plus a WASD/QE offset (**B-L2**). It re-centres on every rebuild (P1 step 4). The reset view is distance 8, θ 0.3, φ π/2.5.
  - Movement is per frame with no delta time (**B-L27**).
  - Presets work in pilot mode (**B-L25**).
  - There is no touch support and no mouse pan.

### 2.3 Project file: (d)
- **Writers:** `exportJSON` (4942-4965) writes v1: `version`, `sections[]` (`name`, `id`, `panel`, `led_resolution` with a derived `pixel_pitch_mm`, `curvature` with a derived `type`, `color`), `mesh_mode`, `totals`. `exportZIP` (4499-4519) writes a **drifted copy** that lacks `angle_offset_degrees` and adds `texture_file` (**B-M3**). Both are ported as `ProjectSerializer.write(project, {variant})`.
- **What v1 holds (B-L31):** only sections, `mesh_mode` and `totals`. Camera, props, display toggles, panel-ID styling and logos are lost.
- **Import:** `importJSON` (4967-5010, `ProjectSerializer.read`, `ProjectIO.importFromInputEvent`) validates nothing (**B-L8**):
  - strings, NaN and duplicate ids, empty walls and unknown modes are accepted;
  - names go into `innerHTML` unescaped (**B-M4**, `legacyHtml`);
  - logos are neither reset nor re-listed (**B-L21**);
  - malformed JSON shows `alert('Error parsing JSON file: ' + err.message)` (5005);
  - a file without `sections` is silently ignored (V-6).
- **Ranges the legacy writers can produce** (they matter for the validator, 4.3):
  - Section fields (4029-4036): columns [1, 50] and rows [1, 20], fractional (**B-L15**); width [50, 5000] mm; height ≥ 50 mm with no maximum; LED counts ≥ 8 with no maximum; per-panel curve unbounded (`value || 0`). The caps on height, LED counts and curve were removed deliberately in aee55ac.
  - Camera (4279-4308): `rotY` input clamp [-180, 360]; `rotX` [-90, 90] and `rotZ` [-180, 180] everywhere; position X/Z unbounded; the gizmo and pilot make `rotY` unbounded and the gizmo lets `posZ` go negative (B-L10).
  - Props (4345-4384): position X/Z unbounded; `rotY` input [-180, 180] but unbounded through the gizmo; scale [0.5, 2].
  - The section count is unbounded (Add Section has no cap).
  - **After spec 08** these become the limits of C22 (08 P2-3b, P2-8a, P2-13e): 200 sections, height ≤ 100,000 mm, LEDs ≤ 65,536, curve ±180°, integer counts, positions within ±100,000 m, camera Y ≥ 0, `wrapDeg` on gizmo and pilot pans.

### 2.4 Undo and persistence: (e)
- There is no undo of any kind.
- There is no persistence: a reload or a crash loses everything.
- Section collapse state lives only in the DOM.

### 2.5 three.js delivery: (f)
- `index.html` line 8 loads `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` as a classic script. Modules reach it through `js/vendor/three.js` (`window.THREE`).
- JSZip 3.10.1 is a classic script (line 9).
- The code uses only these core classes:
  - scene and camera: `Scene`, `PerspectiveCamera`, `WebGLRenderer`, `Group`, `Mesh`, `Raycaster`;
  - geometry: `BufferGeometry`, `Float32BufferAttribute`, `BufferAttribute`, `PlaneGeometry`, `BoxGeometry`, `CylinderGeometry`, `SphereGeometry`, `TorusGeometry`, `ConeGeometry`, `EdgesGeometry`;
  - materials and lines: `MeshBasicMaterial`, `LineBasicMaterial`, `LineSegments`, `Line`;
  - sprites and textures: `Sprite`, `SpriteMaterial`, `CanvasTexture`;
  - helpers and lights: `GridHelper`, `AxesHelper`, `AmbientLight`, `PointLight`;
  - maths: `Vector2`, `Vector3`, `Plane`, `Color`.

  (Inventory taken by grep over the legacy script.)
- No `examples/js` addon is loaded.
- Every material is unlit `MeshBasicMaterial`. Two materials are `DoubleSide` **and** transparent:
  - the frustum fill (2426);
  - the safe-distance floor (2719-2721), whose vertex colours are raw arrays `[0.2, 1, 0.4]` and `[1, 0.2, 0.2]` (2698-2700).
- **Raw colour components outside the exporters:** the LED-sim tile painters (1813-1950) build `new THREE.Color(color)` and paint `rgb(${ledColor.r * 255}, …)` CSS strings and a `(r + g + b) / 3` brightness. Under r128 these components are the raw sRGB values.

### 2.6 CI and deploy: (g)
- There is no `.github/workflows`.
- The site is live at `https://itzmorphinetime.github.io/LED_Configurator/` (README line 5), most likely served by "Deploy from branch".
- The golden-master harness (`tests/regression`) runs locally in headless Chrome with `--use-angle=swiftshader`. Its baselines are git-ignored and depend on the machine and Chrome build. It already supports `--root`, `--out` and `--only`; a full run takes about 3.2 minutes locally.

### 2.7 Accessibility, performance and errors: (h)
- **Toggles:** 9 `div.toggle` elements (931, 935, 943, 963, 980, 999, 1100, 1111, 1138) have no `tabindex`, `role` or key handling (**B-L36**).
- **Mesh-mode radios:** they are `display: none` (CSS 353-355), so they are not focusable. Their label handler fires twice (**B-L13**). Their `checked` state goes stale after an import (V-2).
- **Other controls:** colour swatches (3970-3975) and section headers (3984) are clickable `div`s. The icon buttons have `title` but no `aria-label`.
- **Toolbar visuals (B-L24):** `.view-btn.active` has no style, and the selection badge overlaps the help badge.
- **Shortcuts:** they ignore SELECT focus, modifiers and key repeat (**B-L11**).
- **Canvas guards:** none (**B-L4**). Panel-mode panel-ID canvases are 4-16 px/LED per panel, capped per canvas at `floor(4096 / max(ledX, ledY))` (2003), with no total budget (**B-M16**). Textures leak (**B-H5**, fixed in 1C).
- **Errors:**
  - 3 `alert()` calls: 2788 (safe-distance export), 3479 (pilot needs preview), 5005 (import).
  - Silent failures: ZIP unhandled rejection (**B-H3**, 4529), null PNG blob or a 0-byte PNG (**B-L4**), logo load with no `onerror` (**B-L35**), and import V-6.
- **Contrast:** `--text-secondary` on `--bg-secondary` is 5.49:1. `--border-color` (#2a2a3a, input borders and the mesh-mode radio ring) is 1.32:1 on `--bg-secondary`. `--text-dim` (#4a4a5a, 2.15:1) is declared but never used.

### 2.8 Refactored modules touched

| Module (ARCHITECTURE.md section 3) | Workstream | Nature of change |
|---|---|---|
| `render/SceneManager.js` | a, c, f, h | Layers applied and enforced, preview pass, invalidate/loop, colour config (F track), context loss |
| `render/PreviewWindow.js` | a | Loses 08 P2-10's renderer; becomes DOM rect provider + labels + resize (P2-10's clamps and `PreviewFit` kept) |
| `render/CameraRigView.js`, `SafeDistanceView.js` | a, f | Helper layer; `forceSinglePass` (U2); floor vertex colours through `Color.setRGB(…, SRGBColorSpace)` (U3) |
| `render/LEDMaterialFactory.js`, `textures/*` | f, h | Budget for 04's per-panel option; LED-sim painters from `hexToRgb` (U0); `colorSpace` (U3) |
| `interaction/InputState.js`, `ViewportInput.js` | b, h | Keymap dispatch, typing and movement guards, capture-phase click-select, Escape registry |
| `interaction/SelectionManager.js`, `TransformGizmo.js`, `OrbitController.js`, `PilotController.js` | b | Rewritten internals over the three.js controls; pilot gating |
| `io/ProjectSerializer.js`, `ProjectSchema.js`, `ProjectValidator.js`, `ProjectMigrations.js`, `core/sha256.js` (created by 08 P2-3b/P2-13e in this spec's modules, C25) | d | Remaining variants, `project`/`viewport`, fuzz and reachability, `budget` |
| `app/ProjectIO.js`, `WallController.js`, `CameraController.js`, `PropController.js` | d, e, h | Toasts on top of 08's `#runExport`, history records, session apply (replaces `#applyV2` and `applyImport`) |
| `domain/*` | d, e | `assign()`/`setPose()` hydration methods; `LIMITS` views of 08's rule tables; `hexColor.js` |
| `ui/*` | d, e, h | Project section, history controls, notifier, a11y markup, `syncFromModel()` on the remaining panels |
| `legacy/LegacyCompat.js` | - | Nothing left to retire after 08 P2-13g (C21, 5.11) |
| `js/vendor/three.js` (+ new `three-addons.js`) | b, f | Addon and loader factories (I3, r128 classic mode); ESM shim (U1) |
| `index.html` | a, b, d, e, f, h | Toast containers, project section, header buttons, ARIA, r128 control scripts (I3/I4a), importmap (U1) |

### 2.9 State after spec 08 (what this spec starts from)

Every 07 task runs after the 08 commits named in its "After" column (C21). At that point the code looks like this (08 r3):

| Area | State after spec 08 | 08 commits | 07 tasks that build on it |
|---|---|---|---|
| Preview | If P2-10 landed first (C31): still the second `WebGLRenderer`, canvas sized to the window's inner box, image letterboxed by scissor inside it (`geometry/PreviewFit.js` `letterboxRect`, `clampPreviewSize`; window 200-800 × 120-600 CSS px per axis), helpers hidden by toggling `visible` around the preview render, header short names (`presetShortName()`), drawn-size footer. Otherwise the legacy preview. | P2-10a-c (or none, C31) | R1, R2 |
| Gizmo | Hand-written `TransformGizmo`: rotation follows the drag; camera rotation by quaternion composition (`domain/eulerYXZ.js`); only allowed handles (`allowedAxes`); local orientation refreshed; hidden in pilot through a `PILOT_CHANGED` mirror. | P2-9c-f, P2-9j | I3 |
| Pointer and keys | Select on mouseup with less than 4 px travel (still only in a gizmo mode); shortcut filters for SELECT, contenteditable, modifiers and repeat in `core/typingTarget.js` (01 CR-9). | P2-9a, P2-9b | I2, I1 |
| Movement and presets | `dt` clamped to [0, 0.1]; pilot forward Y sign fixed; presets exit pilot first. | P2-9g-i | I4a |
| Framing and coverage | Orbit target and Reset from `framingBounds = 'layout'`; camera Z minimum removed; coverage from `FrustumCoverage`. | P2-11a-c | I4a, I4b |
| Limits and rules | `domain/rules.js` (`finiteOr`, `clamp`, `wrapDeg`, `sanitizeText`, `MAX_LOGO_BYTES`, `MAX_LOGO_ASSETS = 64`, `MAX_IMPORT_BYTES`); `Wall.MAX_SECTIONS = 200`; `WallSection.LIMITS` and the caps of 4.3 in `FIELD_RULES`; `CineCamera.LIMITS`, `Prop.LIMITS` with the ±100,000 m writer bounds; pilot floor 0; one rebuild per mesh-mode click (B-L13). | P2-3b, P2-8a-d, P2-13e | D1 (the disabled Add Section button) |
| Import | `ProjectValidator` and `ProjectMigrations` in this spec's modules and signatures (v1 path, then the v2 path for the Phase-2 keys), atomic rejects, M-IMP messages through `dialogs.alert`, logos reset on import (B-L21), `escapeHtml` in every template (B-M4). | P2-3a-d, P2-13e | D2, D7 (rule S1), E2, D8 |
| Exports | Chunked base64 (B-H3); Uint32 indices when needed; canvas guards (`TextureAtlas.CANVAS_HARD_LIMITS`, `canvasFits`); `ProjectIO.#runExport` with M-EXP messages; the safe-distance OBJ downloads (B-M1); unique texture names; ZIP JSON = file JSON + `texture_file`. | P2-1a-e, P2-5a, P2-6a-d | E3 |
| Project file v2 | `file` and `zip` variants of 4.2 for the Phase-2 keys (no `project`, no `viewport`; 08 A5); `ProjectSchema` rows; `core/sha256.js`; `PROJECT_REPLACED` for v2 imports, with `syncFromModel()` on four panels; `CineCamera.assign`, `Prop.assign`; `CameraController.applyImportedPose` and `PropController.applyImportedPose` (C30); `ProjectIO.#applyV2`. v1 imports still go through `WallController.applyImport`. | P2-13e | D1, D2, D4, D5, D6 |
| Logos | `LogoLoader` (MIME allowlist, 2 MB cap on the stored bytes after conversion, M-LOGO-1/2/3, SVG sanitising and sizing, decode check, `sha256` through the injected `digest`); `LogoLibrary` entries keep `dataUri`, `mime`, `bytes`, `name`, `sha256`; `distinctImageCount()`. | P2-13a, P2-13e | D6 |
| Toggles | `role="switch"`, `tabindex`, Space/Enter, `setToggle` keeps `aria-checked` in sync. | P2-13c | X1 |
| Panel mode | One texture per section in the viewport; `panelCanvas`/`panelPxPerLed` reachable only through 04's `panel` option, with the budget of 6.12. | P2-12d | X3 |
| Memory | Disposal on rebuild (1C H1/H2 or P2-12a), LRU of LED-tile masters, pose-only refresh. | 1C, P2-12a-c | R3 |
| Legacy registry | `Strategies` deleted; `MeshProfiles` and `FramingPolicy` remain; `LEGACY_SITES` keeps only rows handed to features. | P2-13g | 5.11 (no 07 retirement remains, except under C31) |

---

## 3. UX design

### 3.1 Layout overview

```
+-----------------------------------------------------------------------------------------------------------+
| [logo] LED WALL Configurator  | [Undo][Redo] (o) Saved 14:32 |    PIXELS 15,360  PANELS 15  SECTIONS 1  ARC 0.0 |
+--------------------------+--------------------------------------------------------------------------------+
| PROJECT                  | [G][R][W] | [P]  (watermark)                         [Fr][Sd][Tp][Rst][Grid]   |
|  Name [Untitled stage  ] |          +----------------------------------------------------+               |
|  [New] [Open...] [Save]  |          | Restore unsaved work from 14:32 (3 sections)?       |               |
|  Autosave         (on)   |          |                         [Restore]  [Discard]        |               |
|--------------------------|          +----------------------------------------------------+               |
| WALL SECTIONS ...        |                                                                                |
| MESH OPTIONS ...         |                         3D viewport (single WebGL canvas)                      |
| DISPLAY ...              |                                                                                |
| PANEL IDS ...            |                                                     +-Camera View 35mm . Full Frame-+ |
| CAMERA FRUSTUM ...       |        +- #toast-stack (bottom centre) ----+        |#####  letterboxed preview ####| |
| SCENE PROPS ...          |        | ! Enable Camera Frustum Preview   |        |#####  (drawn by scissor)  ####| |
| EXPORT                   |        |   first to use Pilot Mode [Enable |        | H: 54.4  V: 37.8    264x176 px| |
|                          |        |   preview] [x]                    |        |                               | |
|  [Export All (ZIP)] ...  |        +-----------------------------------+        +-------------------------------+ |
|                          | [Selected: Person]                                                             |
|                          | [Drag to rotate • Right-drag to pan • Scroll to zoom • WASD to move • G/R/L/P • ? all shortcuts] |
+--------------------------+--------------------------------------------------------------------------------+
```

Placement rules:
- **Header (C50):** 06 §3.2's grid `[brand lockup | history group | stats]`; the history group is the two 32 px icon buttons of 3.2 plus `#autosave-status`. Below 1100 px the status text collapses to an icon with its text in `title`; below 900 px it hides (it remains in the Project section). Whichever of 06 T4a and H2 lands second fills the slot and re-baselines.
- **Toasts:** bottom centre. This avoids the preview window (bottom right) and the badges (bottom left).
- **Top-centre stack (C51):** `#viewport-top-stack`, placed in the DOM after `#pilot-info` and `.brand-watermark` (so their existing sibling selectors still work), holds, in this order, the restore banner (3.4), 09's share banner and 01's `#debug-view-legend`. It sits under the toolbars and shifts to `top: 72px` while the pilot banner is visible.
- **Top right:** the `right: 72px` slot keeps the z-order debug popover 110 > UV viewer 30 > HDRI badge 20. `#perf-hud` is not there (3.10).
- **Badges (B-L24):** badge placement (bottom stacking) is Feature 6's fix (06 T4a) and `.view-btn.active` is Feature 1's (01 T7; C52). This layout assumes them; X1 does not re-fix them.
- **Help badge text (C35):** per-feature tokens are frozen (01's ` N=normals` is the only one added). **I4a rewrites the badge once**, when right-drag pan becomes true and `ShortcutHelp` exists from I1, to `Drag to rotate • Right-drag to pan • Scroll to zoom • WASD to move • G/R/L/P • ? all shortcuts`; feature keys are documented in `ShortcutHelp`, button titles and the README.

### 3.2 Header controls (workstream e)

| Element | Id | Type | Label / content | Behaviour |
|---|---|---|---|---|
| Undo | `#history-undo` | icon `button` | `aria-label="Undo"`, `title="Undo <label> (Ctrl+Z)"` | Disabled when `!canUndo`. Click calls `history.undo()`. |
| Redo | `#history-redo` | icon `button` | `aria-label="Redo"`, `title="Redo <label> (Ctrl+Shift+Z)"` | Disabled when `!canRedo`. |
| Autosave status | `#autosave-status` | `span` inside the polite live region of the header, `data-state` mirrors the state | One of: `Saved 14:32`, `Saving...`, `Autosave off`, `Autosave paused: restore pending`, `Autosave paused: storage full`, `Autosave unavailable`, `Not saved yet` | Mirrors `AUTOSAVE_STATUS`. Click opens the Project section. |

The three elements form the history group of 06 §3.2's header grid (C50). On macOS the title text uses `Cmd` (platform detection in section 6.4). Times are formatted with `Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit'})` from `AUTOSAVE_STATUS.savedAt`, a `Date.now()` value (the only Date-based clock in the app; intervals use `performance.now()`, 8.3).

### 3.3 Project section (sidebar, new first `global-section`)

| Control | Id | Type | Range / default | Behaviour |
|---|---|---|---|---|
| Project name | `#project-name` | text input, `maxlength=64` | default `Untitled stage` | On `change`, `session.setName(v)`, recorded as history "Rename project". The value goes through `sanitizeText(v, 64)` plus a trim (C28), the same function the validator runs. An empty value restores the default. |
| New | `#project-new` | button | - | Applies a default project. Recorded as "New project", so it is undoable and needs no confirmation dialog. Shows the toast "New project. Press Ctrl+Z to go back." Autosave writes nothing while the project is still the untouched New state (6.11), so an accidental New followed by a reload still offers the pre-New work in the restore banner. |
| Open... | `#import-json` (id **kept**, harness contract) | button | accepts `.json, .zip` (`#import-input` kept) | Opens a file through `ProjectSession.openFile`. See 3.5 for reporting. |
| Save | `#export-json` (id **kept**) | button, label "Save Project (.json)" | - | Downloads the v2 JSON (variant `file`) as `Brand.files.json` (`led-wall-config.json` until Feature 6 renames it to `morph-led-wall.json`). |
| Autosave | `#toggle-autosave` | switch (`div.toggle role=switch`) | default **on** | Persisted in prefs (6.11). Off clears the pending timer and shows `Autosave off`. |

The two kept ids move out of the Export section into this section. The harness drives them by id, so its contract holds. Both moves are recorded as intentional `ui_visual` changes (step D8).

### 3.4 Restore banner

- **When it appears:** at boot, when the previous-session slot holds a project (section 6.11). It is the first child of `#viewport-top-stack` (C51).
- **Text:** `Restore unsaved work from <HH:MM, or date if not today> (<N> sections<, logos missing>)?`
- **Buttons:** `#autosave-restore` and `#autosave-discard`.
  - Restore applies the snapshot with reason `'restore'` and records **one** history entry, "Restore session". Edits made before Restore stay undoable: Ctrl+Z returns to them.
  - Discard deletes the slot.
- **Non-modal:** editing while the banner is visible is allowed. The previous-session slot is never overwritten by the current session (6.11), so ignoring the banner loses nothing until the next boot. If the boot rotation could not copy the slot (storage full), autosave pauses until the banner is resolved, and the status says `Autosave paused: restore pending`.
- **Accessibility:** `role="region" aria-label="Restore previous session"`. It is not focus-trapped. Escape does not dismiss it.

### 3.5 Notifications, dialogs and the import report (workstream h)

**Toasts.** `#toast-stack` (bottom centre) holds two **persistent** live containers, present in the static markup from page load so that screen readers register them before any content arrives:
- `#toast-region`: `role="status" aria-live="polite" aria-relevant="additions"`, for `info`, `success` and `warning`;
- `#toast-alerts`: `role="alert" aria-live="assertive"`, for `error`.

Each toast is a plain `div.toast[data-level]` appended inside its container (no role of its own). Content: an icon glyph (text only), a title, a message, optional action buttons, an optional "Details" disclosure, and a close button.

| Level | Auto-dismiss | Example |
|---|---|---|
| `info` | 4 s | "Opened stage.json" |
| `success` | 4 s | "Exported led-wall-export.zip (3.1 MB)" |
| `warning` | 7 s | "Enable Camera Frustum Preview first to use Pilot Mode [Enable preview]" (08's kept text, plus an action) |
| `error` | sticky (until closed) | "Export glTF failed: Invalid array length. No file was downloaded. [Details]" (08 M-EXP-1) |

Every text that spec 08 defines (its 3.3 message ids and the two kept legacy alerts) is shown verbatim (C27); E2 only changes the channel.

Display rules:
- At most 4 toasts are visible. Older ones collapse into a "+N more" line.
- Identical `dedupeKey` within 2 s increments a `×N` counter instead of stacking.
- Hovering or focusing a toast pauses its auto-dismiss.
- **Toast log:** `Notifier` also writes `#toast-stack[data-toast-log]`, a JSON array of the last 50 notifications (`{level, title, message}`, in order). It does not depend on dismissal timing, so the harness reads it instead of the live toasts (8.3).

**Dialog** (`ui/Dialog.js`). A modal `div[role=dialog][aria-modal=true]` with a title, a body and action buttons.
- It traps focus and returns focus to the opener on close.
- Escape triggers the action whose id is `'cancel'`.
- It is used for: the import report, HDRI relink (Feature 5), the shortcut help, and "Open a file with errors".

**Import report.** The dialog (D8) replaces 08's M-IMP-5 alert. It opens only when the file has `warning`-level issues; info-only issues produce a toast ("Opened stage.json (2 values adjusted)"). Its lines use 08 3.3's format and labels (`Section ${i+1} "${name}": ${label} ${from} → ${to}`; file-level `${label}: ${from} → ${to}`).

```
+- Opened "stage.json" with 4 corrections ----------------------------------+
| Format: v1 (migrated to v2). Camera, props and styling were kept.          |
|                                                                           |
|  !  Section 2 "Left": Columns "10" → 10                                    |
|  !  Section 3 "Right": id 3 → 7                                           |
|  !  Section 3 "Right": Section Name (42 characters) → truncated to 32      |
|  !  Section 4 "Top": Pixels X 100000 → 65536                              |
|                                                                           |
|                                     [Copy report]  [OK]                   |
+---------------------------------------------------------------------------+
```

- **Error-level files** (parse error, newer major version, no sections, more than 200 sections, too large) are rejected atomically: the current project is unchanged. They show an error toast with 08's M-IMP text, whose `[Details]` opens the same dialog.
- **Value rendering:** every value in the dialog is rendered with `textContent`.

### 3.6 Camera preview window (workstream a)

Whichever lands first, 08 P2-10 or R1/R2, fixes the preview bugs (C31). The user-visible result is the same either way, and it is 08's window geometry and labels.

- **What stays:** the window's markup, ids, header and footer labels, and the resize handle (top left).
- **What the user sees after R1/R2:**
  - `#camera-preview-window` gets `background: transparent` and `border-radius: 0` (the scissor rectangle is square). Its border stays.
  - `#camera-preview-canvas` stays in the DOM as a **layout placeholder**: `visibility: hidden`, no WebGL context, no width/height attributes written. Its client rect defines the preview rectangle, which the main renderer draws by scissor at the same place.
  - The image is **letterboxed** to the filmback aspect (`PreviewFit.letterboxRect`, 08 6.14). The bars are black and drawn by the scissor clear (6.1). This fixes **B-M9** with no window refit, and **B-L32**, because any window size is valid.
  - The window size is clamped independently on each axis: width 200-800 CSS px, height 120-600 CSS px (`PreviewFit.clampPreviewSize`).
  - Helpers (grid, axes, frustum, fill tint, safe-distance floor, gizmo, pivot marker, selection outlines) and debug overlays (normal lines) **never** appear in the preview (**B-M11**): the preview camera's mask is `DEFAULT | ENVIRONMENT`. Feature 5's backdrop dome (`ENVIRONMENT`) does appear.
- **Labels (B-L34):** the header shows `presetShortName()` (for example `35mm • ARRI LF`) and `#camera-preview-res` the real drawn size in device pixels, e.g. `264×176 px`. If P2-10c landed first, R2 moves that code into `PreviewPass.updateCamera`; otherwise P2-10c lands there directly (C31).
- **Optional (task R4; required if 09 X4 is accepted, C58):** `Export Camera Frame (PNG)` (`#export-camera-frame`, button in the camera panel) plus `#camera-frame-width` (select: 1920 / 2560 / 3840, default 1920). The height is `round(width / filmbackAspect)`. It renders the still camera (layers `DEFAULT` and `ENVIRONMENT`) with antialiasing and the same colour output as the canvas (6.1).

### 3.7 Viewport interaction (workstream b)

"After 08" is the state of 2.9 (08 P2-9 on the hand-written controls); "New" is this spec's state after I1-I4b.

| Gesture | Legacy | After 08 | New |
|---|---|---|---|
| Left drag | Orbit (0.01 rad/px) | same | Orbit through `OrbitControls` (`rotateSpeed` 1.5) |
| Right drag | Nothing (and it deselects, B-M14) | Nothing; never selects (P2-9a) | **Pan** (`OrbitControls` screen-space pan). Never selects. |
| Middle drag | Nothing | same | Dolly |
| Wheel | Distance += deltaY·0.01, clamp [2, 30] | same | Exponential dolly (`OrbitControls`). `minDistance` 0.5 m; `maxDistance` = max(30, 4 × wall bounding radius). |
| Touch: 1 / 2 fingers | None | same | Rotate / pinch dolly + pan. The canvas gets `touch-action: none`. A press during which a second pointer went down never picks (6.4). |
| Click (< 4 px travel, left button) | Mousedown pick, only in gizmo mode | Mouseup pick, only in gizmo mode (P2-9a) | Pick in **any** mode. A hit selects; a miss on empty space deselects. Shift-click adds to the selection and mod-click (Ctrl, ⌘ on macOS) toggles, for Selectables that allow multi-select (sections, Feature 2); on macOS a Ctrl-click counts as a plain click. Overlapping hits: `pickPriority` outranks **wall (section) hits only**, so Feature 3's pivot marker wins over the wall in front of it; among camera, prop, pivot and HDRI-point hits the nearest wins (03 5.10.1 #6, 6.4). A click on a gizmo handle never changes the selection. |
| Drag on a gizmo handle | Custom gizmo | Custom gizmo, rotation follows the drag (P2-9c-f) | `TransformControls`. Orbit is disabled while dragging (`dragging-changed`). One history entry per drag. With a multi-selection the gizmo drives the group (Feature 2). Holding Ctrl/Cmd snaps the dragged distance (02/03). |
| WASD / arrows, Q/E | Move the target, 0.08 per frame | 0.08 × 60 × dt (P2-9h) | Move target and camera together at **4.8 m/s × dt** (equal to legacy at 60 Hz). Shift doubles the speed. Ignored while typing, while focus is in a radio, switch, slider or list widget, or with Ctrl/Cmd/Alt held (3.8). |
| View presets | Allowed in pilot (B-L25) | Exit pilot first (P2-9i) | Same, plus the info toast "Exited pilot mode" (E2). |
| Gizmo mode with nothing selected | Mode active, no gizmo | same | Same. The gizmo appears as soon as something is selected. |
| Gizmo in pilot | Visible across the view (B-L26) | Hidden (P2-9j `PILOT_CHANGED` mirror) | Hidden **and inert**: `PilotController.toggle` calls `gizmo.setPilot(true)`, which sets `controls.enabled = false` and hides the controls' root (5.4.2). A press on a handle's screen position starts mouse-look only. Pilot mode also hides the `HELPERS` layer (Q7). Feature 1's normal lines (`DEBUG`) and Feature 5's dome (`ENVIRONMENT`) stay visible in pilot, as 01 and 05 require. |
| Orbit in pilot | Keyboard frozen (`tickKeyboard` returns early), but a wall rebuild during pilot re-centres and moves the main camera (1575, 3857-3862) | same | `OrbitController.tick`, `onWallRebuilt` and `frame` do nothing to the camera while piloting, so `OrbitControls.update()` never re-aims the pilot view (5.4.3). |

Selection feedback:
- The badge shows `Selected: <label>` (textContent), or `Selected: 3 sections` for a multi-selection.
- Camera and props show no 3D highlight; the gizmo is the feedback. Features 2 and 3 add highlights through the `Selectable.highlight` hook (5.4.1).

**Auto-framing** (task I4b). Legacy re-centres the orbit target on every wall rebuild (P1 step 4). The new orbit keeps the user's view on edits and frames the wall only:
- on boot;
- on open/import/new/restore;
- on `F` with nothing selected;
- on the Reset view preset.

Task I4a (OrbitControls) keeps the legacy reset view and re-centring, so its golden diff stays small; I4b switches the policy (8.4). See open question Q6. Because I4b stops the re-centre that used to hide it, I4b also makes the orbit a spec 03 `StageAnchored` participant: a "Keep stage layout" pivot commit shifts the orbit target and camera with the stage, unrecorded and inside the pivot's single history entry, so the wall does not jump on screen (C45).

### 3.8 Keyboard shortcuts: the single registry

`interaction/Keymap.js` holds `KEYMAP`, the registry of **every** chord in the app, global or widget-scoped. From I1 on (C17), feature specs add rows here (and their actions) instead of adding `keydown` listeners; I1 itself moves the listeners of features that landed earlier (01, 02, 05 path B) into rows. `tests/unit/keymap.test.mjs` fails on any duplicate chord within the same scope and platform, and on any row of a landed feature whose action id has no registered action.

Row shape: `{ id, chord: {key | code, shift?: boolean | 'any', mod?, alt?}, scope, flags, owner }` (an undeclared `shift` means `false`; `'any'` matches with or without Shift, 05 5.11 e). **Key versus code (C43):** letters are given by `key` and match `e.key` case-insensitively, so AZERTY and Dvorak users press the letter their keyboard prints; punctuation and brackets are given by `code` (`BracketLeft`, `BracketRight`, `Comma`, `Period`, and `Slash` with `shift: true` for `?`). Flags: `allowRepeat` (default: repeats are ignored), `allowWhileTyping`, `allowInPilot`, `notInPilot`, `notWhileDragging`, `viewportOnly` (target must be the canvas or `body`). `mod` means Ctrl on Windows/Linux and Cmd on macOS. The dispatcher passes the `KeyboardEvent` to the action, so a `shift: 'any'` action reads `e.shiftKey` itself.

**Matching rule** (`matchShortcut`). A row matches an event only when every modifier is **exactly** as declared:
- `e.shiftKey === chord.shift` (with `undefined` read as `false`), unless `chord.shift === 'any'`;
- `mod` declared: the platform's mod key is down and the other of Ctrl/Meta is up; `mod` not declared: `e.ctrlKey` and `e.metaKey` are both false;
- `e.altKey === !!chord.alt`.

So `H` and `Shift+H`, or `N` and `Shift+N`, can never both match one event, and the uniqueness test compares the full `(key|code, shift, mod, alt)` tuple.

**Global scope** (dispatched by `ViewportInput`'s single `keydown` handler on the document):

| Chord | Action id | Flags | Owner | Notes / conflict check |
|---|---|---|---|---|
| `G` | `gizmo.translate` | `allowInPilot`, `notWhileDragging` | P (existing) | toggle; works in pilot as in legacy (the gizmo stays hidden and inert there) |
| `R` | `gizmo.rotate` | `allowInPilot`, `notWhileDragging` | P (existing) | toggle; as G |
| `L` | `gizmo.space` | `allowInPilot`, `notWhileDragging` | P (existing) | world/local; as G |
| `P` | `pilot.toggle` | `allowInPilot`, `notWhileDragging` | P (existing) | Ctrl+P does not trigger it (B-L11, fixed by 08 P2-9b, kept). Never toggles mid-drag, so `setPilot` never meets an active drag. |
| `Esc` | `escape` | `allowInPilot` | P (existing, extended) | Escape registry below; while typing, Escape is left to the field (legacy) |
| `W A S D`, arrows | movement (read by `KeyboardState`, not dispatched) | - | P (existing) | movement guard below; Shift doubles the speed; blocked by Ctrl, Meta or Alt and by typing or widget targets |
| `Q` / `E` | movement down / up | - | P (existing) | as above |
| `mod+Z` | `history.undo` | `notWhileDragging` (native field undo wins while typing) | P | Ignored during a gizmo drag; Esc cancels a drag. Browser default is a no-op outside fields. |
| `mod+Shift+Z` | `history.redo` | `notWhileDragging` | P | |
| `Ctrl+Y` | `history.redo` | `notWhileDragging`; Windows/Linux only (Cmd+Y opens History in Chrome on macOS) | P | |
| `mod+S` | `project.save` | `allowWhileTyping`, `allowInPilot` | P | `preventDefault`; blurs a focused field first so its pending `change` commits |
| `mod+O` | `project.open` | `allowWhileTyping`, `allowInPilot` | P | `preventDefault`; distinct from plain `O` |
| `F` | `view.frame` | `notInPilot` | P, shared with F2 | frames the selection, or the wall when nothing is selected |
| `?` (`Slash` + Shift, by `code`) | `help.shortcuts` | `allowInPilot` | P | help dialog generated from `KEYMAP` |
| `N` | `debug.normals` | `allowInPilot` | F1 | toggle normal lines |
| `Shift+N` | `debug.cycleShading` | `allowInPilot` | F1 | content, face orientation, normal colours |
| `U` | `uv.toggleViewer` | `notInPilot` | F4 | like `O` (04 07-5) |
| `Delete` / `Backspace` | `sections.delete` | `notInPilot` | F2 | with confirm; only when the target is `#three-canvas`, `body`, `#wall-sections` or `#section-toolbar` (C44), so a focused toolbar button or other non-typing element never deletes |
| `mod+A` | `sections.selectAll` | `viewportOnly`, `notInPilot` | F2 | browser select-all elsewhere |
| `mod+D` | `sections.duplicate` | `notInPilot` | F2 | `preventDefault` (bookmark) |
| `[` / `]` (`BracketLeft` / `BracketRight`) | `sections.prev` / `sections.next` | `notInPilot` | F2 | by `e.code` |
| `O` | `pivot.toggleSelect` | `notInPilot`, `notWhileDragging` | F3 | |
| `H` (key `'h'`) | `hdri.toggleContent` | `allowInPilot` | F5 | by `e.key` (C43) |
| `Shift+H` (key `'h'`, `shift: true`) | `hdri.toggleBackdrop` | `allowInPilot` | F5 | |
| `Comma` / `Period` (`shift: 'any'`; with Shift: ±45°) | `hdri.yawMinus` / `hdri.yawPlus` | `allowInPilot`, `allowRepeat` | F5 | by `e.code` |
| `M` (key `'m'`) | `measure.toggle` | `notInPilot` | 09 (if accepted) | by `e.key` (C43); works with sidebar focus, like `G`; listed so the uniqueness test covers it |

**Widget scopes** (dispatched by `ui/dom.js bindScopedKeys(el, scope, actions)`, which listens on the widget element only):

| Scope | Chords | Owner | Rule |
|---|---|---|---|
| `dialog` | `Esc` (cancel), `Tab`/`Shift+Tab` (focus trap) | P (`ui/Dialog.js`) | While a dialog is open, every global chord except `Esc` is ignored. |
| `debug-popover` | `Esc` (close, return focus to `#debug-view-btn`) | F1 | `stopPropagation` on `Esc` only. |
| `uv-viewer` | arrows (nudge 1 texel; Shift: 1 panel), `H` / `V` (flip U / V), `[` / `]` (turn the feed ∓90°: counter-clockwise / clockwise on the wall), `F` (fit), `0` (reset), `Home` (frame 0-1), `mod+Z` / `mod+Shift+Z` / `Ctrl+Y` (the global `history.undo` / `history.redo` actions), `Esc` (cancel an active drag) | F4 | Bound with `bindScopedKeys(el, 'uv-viewer', actions, {actionTarget: '#uv-viewer-canvas'})`: actions run only for keydowns whose target is the canvas. Every keydown without Ctrl, Meta or Alt stops propagation, except `U`, and `Esc` when no drag is active; modified chords other than the scope's own undo/redo propagate, so `mod+S` and `mod+O` keep working (04 07-5). `keyup` is never stopped. |
| `radiogroup` | arrows, `Space` | P (X1, `bindRovingRadio`) | swatches; native radios need no handler |
| `switch` | `Space`, `Enter` | P (X1, `bindSwitchKeys`) | `div.toggle[role=switch]` |
| `button-like` | `Enter`, `Space` | P (X1, `bindButtonKeys`) | section headers (`role=button`) |
| `menu-button`, `menu` | `ArrowDown`, `Enter`, `Space` (open); inside the menu arrows, `Home`, `End`, `Enter`, `Space`, `Esc` (close, focus back to the button) | 09 (T0.2, `ui/MenuButton.js`) | `menu` consumes Escape before the global chain |

Scoped chords may repeat a global chord (`H`, `F`, `[`, `]` in the UV viewer); the scope wins because it stops propagation. Uniqueness is checked per scope.

**Pointer modifiers** (not `KEYMAP` rows; listed so the inventory is complete, C44): Shift-click adds to the selection and mod-click toggles (on macOS a Ctrl-click counts as a plain click); Ctrl/⌘ held during a gizmo drag snaps the dragged distance or angle relative to the drag start (03 D9); Shift in 09's measure mode disables snapping; Alt, Shift and Space modify drags in 04's UV canvas.

**Escape registry.** Widget scopes see Escape first because their handlers stop propagation: an open dialog cancels; the debug popover closes; the UV viewer cancels its drag. Every other Escape reaches the global `escape` action, which runs the handlers registered with `viewportInput.registerEscapeHandler(priority, fn)` in descending priority until one returns `true`:

| Priority | Handler | Registered by |
|---|---|---|
| 80 | `gizmo.dragging && (gizmo.cancelDrag(), true)` | I1 for the hand-written gizmo (03 T5's `cancelDrag`, C33); from I3, `TransformGizmo.init` registers it |
| 75 | `sectionList.reorderActive && (sectionList.cancelReorder(), true)` (cancel 02 3b's pointer reorder drag in the sidebar) | F2 3b (C42) |
| 70 | `debugControls.isPopoverOpen() && (debugControls.closePopover(), true)` (close 01's popover even when focus is on `body`) | F1, replacing its capture-phase listener (C42) |
| 60 | `interaction.pilotMode && (pilot.toggle(), true)` | I1 (core) |
| 40 | `measure.active && measure.cancel()` (cancel the pending point, else leave measure mode) | 09 T13.2 (if accepted) |
| 0 | deselect and clear the gizmo mode; returns `true` | I1 (core) |

Features add steps with a priority between 1 and 79 instead of editing the `escape` action. `keymap.test.mjs` asserts that priorities are unique. The chain is 80/75/70/60/40/0 (C42); widget scopes (dialog, the UV-viewer drag, 09's menus, 01's popover while it has focus) still see Escape first, and 03's order (cancel drag, exit pilot, deselect) is preserved.

Rejected chords:
- `S` (as a scale mode): it collides with WASD.
- `Tab`: it must stay focus navigation (accessibility).
- `Ctrl+P`: the browser's print dialog.
- `Ctrl+N`: the browser's new window.
- `Ctrl+Shift+P`: it opens a private window in Firefox.

**Typing guard** (`core/typingTarget.js isTypingTarget(t)`; created by 08 P2-9b with this table, C18, C52; 01 T7 consumes it, I1 extends it and deletes the `isShortcutIgnoredTarget` re-export). A target counts as typing when it is:
- an `INPUT`, except types `checkbox`, `radio`, `button`, `submit`, `reset`, `color`, `file` and `range`;
- a `SELECT` or `TEXTAREA`;
- any element where `isContentEditable` is true;
- any element inside an open `[role=dialog]`, for every chord except `Esc`.

Global shortcuts ignore `e.repeat` unless the row has `allowRepeat`. Modifiers follow the matching rule above.

**Movement guard** (`core/typingTarget.js isMovementBlockedTarget(t)`, used by `KeyboardState`). Movement keys are not recorded as pressed when:
- `isTypingTarget(t)` is true, or `t` is any `INPUT` (of every type, as legacy ignored every INPUT), `SELECT` or `TEXTAREA`;
- `t.closest('[role=radio],[role=radiogroup],[role=switch],[role=slider],[role=listbox],[role=option],[role=spinbutton],[role=tab],[role=menuitem],[role=dialog],[data-key-scope]')` matches, so arrowing through the mesh-mode radios, the swatch radiogroup or Feature 2's section listbox never also pans the orbit target;
- Ctrl, Meta or Alt is held, so `Ctrl+S` does not start a backward move.

`keyup` is never filtered. `blur` and `visibilitychange` (hidden) clear all keys.

### 3.9 Accessibility behaviours (workstream h)

| Element | Change | Keyboard |
|---|---|---|
| 9 `div.toggle` + new switches | 08 P2-13c gives them `role="switch"`, `tabindex="0"`, `aria-checked`, `aria-label` and Space/Enter handling, and `setToggle` keeps `aria-checked` in sync (B-L36). X1 moves the key handling into `bindSwitchKeys` (same behaviour), uses it for the new switches, and adds the `:focus-visible` outline: 2 px `var(--accent-cyan)`, offset 2 px. | `Space`/`Enter` toggles (`preventDefault` on Space) |
| Mesh-mode radios | 08 P2-8d already makes one click rebuild once (B-L13). X1 makes the radios visually hidden but focusable: `position:absolute; opacity:0; width:1px; height:1px; margin:0`. The label shows the focus ring through `:focus-within`. The handler moves to the radio `change` event (still guarded by P2-8d's no-op check). The `WALL_MESH_MODE_CHANGED` and `PROJECT_REPLACED` mirrors set `input.checked` from the model (fixes V-2; ARCHITECTURE 8.2 amended, 5.12). | Arrow keys move within the group (native) |
| Section header | `role="button" tabindex="0" aria-expanded` | `Enter`/`Space` collapses or expands (`bindButtonKeys`) |
| Delete-section button | `aria-label="Delete section <name>"` (set with `setAttribute`) | - |
| Colour swatches | Container `role="radiogroup" aria-label="Panel colour"`. Each swatch is `role="radio" aria-checked tabindex` (roving) with `aria-label="#00f0ff"`. | Arrows move, `Space` selects (`bindRovingRadio`) |
| Icon buttons (`#view-*`, `#toggle-grid`, `#gizmo-*`) | `aria-label` equal to the existing `title`. `aria-pressed` on `#toggle-grid`, `#gizmo-translate`, `#gizmo-rotate`, `#gizmo-pilot`. (`.view-btn.active` is Feature 1's B-L24 fix; X1 does not add it.) | - |
| Add Section (and Feature 2's Duplicate) | D1 disables them at `Wall.MAX_SECTIONS` (200) with `title` = 08's M-SEC-1 text "A wall can have at most 200 sections."; a programmatic attempt still shows M-SEC-1 (as a toast after E2) | - |
| `#three-canvas` | `tabindex="0"`, `aria-label="3D viewport"`, `aria-describedby="viewport-help"` (the info badge gets the id) | Shortcuts work when the canvas has focus |
| Live regions | `#selection-indicator`, `#frustum-status-text` and `#autosave-status` get `aria-live="polite"`; toasts use the two persistent containers of 3.5 | - |
| Motion | Under `@media (prefers-reduced-motion: reduce)`: transitions 0 s, `OrbitControls.enableDamping = false` | - |
| Contrast | The pair table below is the test's input (`contrast.test.mjs`, X2). | - |

**Contrast pairs** (WCAG 2.2 relative luminance; values for the legacy tokens in `css/02-tokens.css`):

| # | Foreground (use) | Background | Ratio | Required | Status |
|---|---|---|---|---|---|
| K1 | `--text-primary` #e8e8ec (body text) | `--bg-primary` / `--bg-secondary` / `--bg-tertiary` | 16.16 / 15.25 / 14.12 | 4.5 | pass |
| K2 | `--text-secondary` #8a8a9a (labels, hints, badges) | same three | 5.82 / 5.49 / 5.08 | 4.5 | pass |
| K3 | `--accent-orange` #ff6b35 (warning text) | `--bg-secondary` | 6.57 | 4.5 | pass |
| K4 | `--accent-green` #00ff66 (status text) | `--bg-secondary` | 13.75 | 4.5 | pass |
| K5 | `--accent-cyan` #00f0ff (active toggle track, focus ring, active tool) | `--bg-secondary` / `--bg-tertiary` | 13.23 / 12.25 | 3 | pass |
| K6 | toggle knob #ffffff | track off `--bg-primary` | 19.75 | 3 | pass |
| K7 | `--border-color` #2a2a3a (mesh-mode radio ring) | `--bg-tertiary` | 1.22 | 3 | **exception E-1**, owned by Feature 6: its token set draws the ring and dot with the accent (06 3.12) |
| K8 | `--border-color` (input and card borders) | `--bg-secondary` | 1.32 | - | **exception E-2** (decorative): inputs are identified by their persistent label and value text; Feature 6 keeps this as a documented limitation (06 3.12) |

`--text-dim` (#4a4a5a, 2.15:1) is declared but unused, so it is not tested; Feature 6 removes it. The test fails on any pair below its threshold that is not listed as an exception with an owner. When Feature 6's token switch lands (06 T5), the table is replaced by 06 3.12's pairs, and E-1 is removed.

### 3.10 Debug and perf HUD, URL flags

| Flag | Effect |
|---|---|
| `?perf=1` | Shows `#perf-hud` at `left: 20px; top: 280px` (below 06's reserved top-left zone; C51), monospace 10 px: `fps 60 · frame 1.2 ms · calls 18 · tris 1.8k · tex 6 (24 MB est.) · geo 9 · rebuild 14 ms · frames 312 · idle`. The element carries `data-frames-rendered` and `data-last-rebuild-ms` for the harness. |
| `?render=always` | Disables render-on-demand (debugging aid). |
| `?autosave=off` | Disables autosave for this page load. Prefs are not changed. The harness loads every scenario with it except `autosave_restore` (8.3). |
| `?debug=1` | Logs invalidation reasons and runs the helper-layer audit (6.2) every 120 rendered frames. |

### 3.11 Empty, error and edge states

| State | Display |
|---|---|
| No WebGL 2 (after U2) or renderer creation throws | `#boot-error` overlay: "This browser can't run the 3D view (WebGL 2 is required). Try a current Chrome, Edge, Firefox or Safari." The sidebar stays usable for opening and saving files. |
| CDN failure: three.js, a control script or a module did not load within 15 s | `#boot-error`: "Couldn't load the 3D engine from <host>. Check your connection or content blocker, then reload." |
| WebGL context lost | Overlay over the viewport: "3D view paused: the graphics context was lost. Recovering..." The app calls `preventDefault()` on `webglcontextlost`, so the browser restores the context when it can; on `webglcontextrestored` it rebuilds automatically and hides the overlay (no button: a click cannot restore a GPU-reset context). If no restore arrives within 10 s, the overlay text becomes "The 3D view could not recover." with a `[Reload page]` button; autosave (when on) has the work. |
| Autosave unavailable (storage throws, private mode) | Status shows `Autosave unavailable`. One warning toast per session. |
| Unsaved changes while autosave is off, unavailable, paused or failing | Leaving the page triggers the browser's own "Leave site?" prompt (`beforeunload`, 6.11). Never while autosave is saving normally. |
| Insecure context (for example the dev server over LAN HTTP for iPad testing) | Everything works. Asset ids and integrity checks use the pure-JS SHA-256 path of `core/sha256.js` (6.13). |
| Undo stack at the start | Undo disabled. Title: "Nothing to undo". |
| Undo or redo of a wall edit | The section cards keep their collapsed/expanded state by section id; a section that reappears (an undone delete) is expanded. Open, New, Restore and import expand the first card only (legacy import behaviour). |
| Selection removed by undo or delete | Selection cleared. The badge hides. |
| Selected object stops being pickable (for example the camera after an undo that turns the preview off) | `revalidate()` drops it (5.4.1); the badge hides. |
| Preview enabled while the window would fall outside the canvas | Rect clipped to the canvas. If the visible area is under 50×30 px, the pass is skipped. |
| 200 sections | Add Section is disabled with 08's M-SEC-1 text as its title (3.9, D1). |
| Logo file over 2 MB (after conversion), not an image, or a 65th distinct logo image | 08's M-LOGO-2 / M-LOGO-1 / M-LOGO-3 text as an error toast; nothing is stored (C22, C27). |
| Panel mode above 2,000 panels | Warning toast once per page session (an in-memory flag, not persisted): "Individual-panel mode with N panels may be slow. Section mode looks the same with far fewer draw calls." with action `[Switch to Section mode]`. |

---

## 4. Data model

### 4.1 Domain changes

Spec 08 delivers part of this table early (C25): `Wall.MAX_SECTIONS` (P2-3b), `WallSection.LIMITS` (P2-8a), `CineCamera.LIMITS`, `Prop.LIMITS`, `CineCamera.assign` and `Prop.assign` (P2-13e), and the `LogoLibrary` entry fields (P2-13a).

| Class (file) | Change |
|---|---|
| `domain/Project.js` | Add `meta = { name: 'Untitled stage', notes: '' }` and `extensions = {}`. `Project.createDefault()` unchanged otherwise. **Rule:** the aggregate's parts (`display`, `panelIdStyle`, `logos`, `camera`, `person`, `car`, `wall`) are **never replaced**, because `App` injects them by reference into many collaborators. They are hydrated in place through `assign()`. |
| `domain/Project.js` `DisplaySettings` | `assign({content, ledLayout, wireframe, showFrame, showGrid, showSafeDistance})`; Feature 3 adds `showPivotMarker`, 09 X9 `innerFrustum`. **`ContentMode` `{COLOR: 'color', LED_SIM: 'ledSim', PANEL_IDS: 'panelIds', HDRI: 'hdri'}` in `domain/Project.js` is the only wall content enum** (C49). `ContentMode.HDRI` is added by Feature 5 (05 4.1); until then the validator maps `hdri` to `color` with a warning. After F5, `WallController.setContentMode` is the only content writer; `setLedSim` and `setPanelIds` become wrappers that keep their legacy events and return values. There is no `debug` field (C5); 01's debug shading is an orthogonal override over every content mode. |
| `domain/Project.js` `PanelIdStyle` | `assign(fields)` (validated values, no parsing) |
| `domain/CineCamera.js` | `assign(fields)` (08 P2-13e) writes any subset of `{filmback, filmbackWidth, filmbackHeight, focalLength, posX, posY, posZ, rotX, rotY, rotZ}` verbatim; it is used only with validated values, so a stored pan of 300° stays 300°. `enabled` is never assigned; it changes only through `CameraController.setPreviewEnabled`. Add `setPose({posX, posY, posZ, rotX, rotY, rotZ})`, the interactive writer used by the gizmo (I3) and pilot (I4a), which applies the pose rules of 6.5 through `CineCamera.LIMITS`. |
| `domain/Prop.js` | `assign({posX, posZ, rotY, scale})` (08 P2-13e); `setPose({posX, posZ, rotY})` for the gizmo (6.5) |
| `domain/Wall.js` | `replaceAll(sections, {nextSectionId})` keeps its legacy semantics when called without the option. `MAX_SECTIONS = 200` and `canAddSection()` exist from 08 P2-3b. Add `allocateId()`: the next id with the 2³¹−1 fallback of 6.8 (delivered early by 08 P2-3b2, which `appendLikeLast` already uses). `WallPivot` and its `assign` belong to Feature 3 (03 4.1). |
| `domain/WallSection.js` | `SECTION_FIELDS` gains `'extensions'`. Features add `'faceOrientation'` (F1), `'offset'`, `'locked'`, `'detached'` and `'anchorId'` (F2, 02 CR-07-a), `'uvTransform'` (F4), and `'productId'` and `'cabinet'` (09 X1) in their own specs, appended at the end in that landing order. The serializer never iterates `SECTION_FIELDS` for key order (4.2, C61). `LIMITS` exists from 08 P2-8a. `setName` stores `sanitizeText(String(raw), 32)` (08 P2-3b, C28). `setColor` accepts only `/^#[0-9a-f]{6}$/i` and lowercases it (B-M4 defence in depth). |
| `domain/LogoLibrary.js` | 08 gives it `clear()` (P2-3d), `set()`, `distinctImageCount()` and entries `{image, dataUri, mime, bytes, name, sha256, position, scale}` (P2-13a, P2-13e). D6 adds `assetId` to each entry and `replaceAll(entriesBySectionId)`. |
| `domain/rules.js` (08) | The source of every limit (C22): `MAX_LOGO_BYTES`, `MAX_LOGO_ASSETS`, `MAX_IMPORT_BYTES`, `sanitizeText`, `finiteOr`, `clamp`, `wrapDeg`. |
| `domain/hexColor.js` (new, U0) | `hexToRgb(hex) -> {r, g, b}` in 0..1 sRGB. It lives in `domain/` because both `io/` (exporters) and `render/` (LED-sim painters) may import `domain/`, and neither may import the other. |

**`LIMITS` and `FIELD_RULES`.** `LIMITS` tables are plain frozen data, `{ field: { min, max, int, default } }`, and the UI rule tables (`FIELD_RULES`) read the **same** `LIMITS`, so the UI, the gizmo, pilot and the validator can never disagree (08 P2-8a, P2-13e). Where aee55ac removed a UI cap on purpose (panel height, LED counts, per-panel curve), the sanity caps of C22 sit far above any buildable wall (100 m, 65,536 LEDs, ±180°); they exist only so that every value a writer can produce lies inside the validator's range (4.7, fidelity). `FIELD_RULES` use `finiteOr` from 08 P2-8b, so a legitimate `0` such as camera `posY = 0` survives.

### 4.2 Project JSON v2: canonical skeleton (the single schema Features 1-6 extend)

This is the canonical file as written by `ProjectSerializer.write(project, {variant: 'file'})` once every feature and every accepted 09 item has landed (C61). Keys owned by a feature (marked F1-F6) or a 09 item (marked X*n*) are absent until that feature's own landing commit adds them to `ProjectSchema` (4.4, C39). 08 P2-13e writes the Phase-2 keys first; `project` and `viewport` arrive with D5 without a revision bump, because they are part of v2.0 (C25). **Implementation status (2026-10-31):** 08 P2-13e has landed as `"version": "2.0"` (`io/ProjectSchema.js` KNOWN_REVISION 0) with the Phase-2 keys, `extensions` preserved, and the reader's dropped-unknown handling of every other v2.0 key; Features 3 and 4 landed session-only and were persisted by M7a as revision 1 (`"version": "2.1"`, with `generator`): `pivot` (with `orientation` {align, yaw_offset_deg} after `keep_stage_layout`, 03 12.11), `uv`, `atlas`, `display.show_pivot_marker`, `sections[].uv_transform`, `sections[].pixel_map` and `sections[].uv_vertex_edits` (after `uv_transform`); the `uv` switch is `gltf_canvas_texcoord1` (default `true`). Key order is fixed as shown. The output is `JSON.stringify(obj, null, 2)` with no trailing newline. The comments are documentation only; real files contain none. Numbers in real files are full doubles; the example rounds them.

```jsonc
{
  "version": "2.<n>",                                   // "2.<revision>", assigned at merge time (C40); v1 files say "1.0" or omit it
  "generator": { "name": "LED Wall Configurator", "version": "2.0.0" },   // F6: Brand.jsonGenerator; written, ignored on read; never bumps
  "format": "morph-led-project",                        // constant
  "project": { "name": "Untitled stage", "notes": "", "client": "", "template_id": null },   // client: X12; template_id: X6
  "sections": [
    {
      "name": "Wall 1",                                 // v1 key order kept: name, id, panel, led_resolution, curvature, ..., color
      "id": 0,
      "panel": { "columns": 5, "rows": 3, "width_mm": 500, "height_mm": 500 },
      "led_resolution": { "x": 32, "y": 32, "pixel_pitch_mm": 15.63 },          // pixel_pitch_mm: derived (v1 formula)
      "curvature": { "type": "flat", "angle_degrees": 0, "angle_offset_degrees": 0 },   // type: derived
      "face_orientation": "stage",                                              // F1
      "offset": { "position_m": { "x": 0, "y": 0, "z": 0 }, "rotation_deg": { "x": 0, "y": 0, "z": 0 },
                  "rotation_order": "YXZ", "frame": "section", "rotation_origin": "bottom-center" },   // F2 (02 CR-07-a)
      "locked": false,                                                          // F2
      "detached": false, "anchor_section_id": null,                             // F2 (02 CR-07-a)
      "color": "#00f0ff",
      "uv_transform": { "offset_u": 0, "offset_v": 0, "scale_u": 1, "scale_v": 1, "rotation_degrees": 0,
                        "flip_u": false, "flip_v": false, "source_rotated": false },   // F4
      "pixel_map": { "…": "…" },                                                // F4: derived (`_led` units, 04 07-3)
      "logo": null,                                     // or { "asset_id": "a_…", "position": "center", "scale": 0.3 }
      "texture_file": "textures/Wall_1_PanelIDs.png",   // zip variant only (v1 key); null when skipped (08 P2-1c)
      "product_id": null,                                                       // X1
      "cabinet": { "weight_kg": null, "power_max_w": null, "power_avg_w": null },   // X1
      "extensions": {}
    }
  ],
  "mesh_mode": "combined",
  "pivot": { "mode": "bottom-left", "offset_m": { "x": 0, "y": 0, "z": 0 }, "keep_stage_layout": true,
             "resolved_m": { "…": "…" } },             // F3; resolved_m: derived
  "uv": { "combined_layout": "per-section", "panel_uvs": "section", "gltf_atlas_texcoord1": false },   // F4
  "atlas": { "…": "…" },                                // F4: derived; its texture_file only in the zip variant
  "display": {
    "content": "color", "led_layout": "single-dot", "wireframe": false, "show_frame": false,
    "show_grid": true, "show_safe_distance": false,
    "show_pivot_marker": true,                          // F3 (view-only)
    "inner_frustum": { "enabled": false, "overscan_pct": 10 }   // X9
  },
  "panel_id_style": {
    "border_thickness": 8, "font_size": 0, "font_color": "#ffffff",
    "section_label_enabled": true, "section_label_font_size": 0, "section_label_color": "#888888",
    "brand_mark_on_export": false                       // F6 (T10)
  },
  "camera": {
    "enabled": false, "filmback": "full-frame", "filmback_width_mm": 36, "filmback_height_mm": 24, "focal_length_mm": 35,
    "position_m": { "x": 0, "y": 1.5, "z": 5 },        // stage frame (F3)
    "rotation_deg": { "x": 0, "y": 0, "z": 0 },        // x = tilt, y = pan, z = roll; Euler order YXZ
    "sensor_photosites_h": null, "focus_mode": "wall", "focus_distance_m": 3, "t_stop": 2.8   // X3
  },
  "props": {
    "person": { "visible": false, "position_m": { "x": 2, "z": 2 }, "rotation_y_deg": 0, "scale": 1 },
    "car":    { "visible": false, "position_m": { "x": 4, "z": 3 }, "rotation_y_deg": 0, "scale": 1,
                "model": { "kind": "procedural", "asset_id": "kenney-sedan-sports", "paint": "#b01c1c",
                           "finish": "gloss", "env_source": "auto" } }   // model: F5 (05 4.2); asset_id: bundled-manifest id
  },
  "hdri": {                                             // F5 (05 4.2, C9)
    "source": null,                                     // or { "name": "venice_4k.hdr", "bytes": 25292611, "sha256": "…(64 hex)",
                                                        //      "path": null }   path: "hdri/<name>" only in the zip variant
    "quality": "4k", "backdrop": false,
    "projection": { "point_mode": "camera", "point_m": { "x": 0, "y": 1.5, "z": 5 },   // stage frame; x/z ±100,000 m, y [0, 100] (C45)
                    "rotation_deg": { "x": 0, "y": 0, "z": 0 },                       // x = pitch, y = yaw, z = roll
                    "exposure_ev": 0, "tone_map": "auto", "led_mask": 0 }
  },
  "production": {                                       // X2 (09's proposed top-level "stage", renamed before it lands; C61)
    "power":   { "voltage_v": 230, "phases": 1, "power_factor": 0.95, "breaker_a": 16, "derating": 0.8, "basis": "max" },
    "data":    { "processor_id": "brompton-tessera-1g", "bit_depth": 10, "frame_rate": 60 },
    "rigging": { "mode": "hang" }
  },
  "measurements": [],                                   // X13: [{ "id": "m1", "a_m": {x,y,z}, "b_m": {x,y,z} }], stage frame
  "viewport": {
    "orbit": { "target_m": { "x": 1.25, "y": 0.75, "z": 0 }, "position_m": { "x": 2.33, "y": 2.01, "z": 3.6 } },
    "preview_window": { "width_px": 320, "height_px": 180 }
  },
  "assets": [],
  "totals": { "sections": 1, "total_panels": 15, "total_pixels": 15360 },   // v1 key: derived
  "extensions": {}
}
```

The `viewport.orbit` example is the default wall (target = its centre, (1.25, 0.75, 0)) after I4b's boot framing (6.14: distance 3.97 m along (0.3, 0.35, 1)). Before I4b the orbit is at the legacy reset view (distance 8, θ 0.3, φ π/2.5), so the same file holds `position_m` ≈ (3.50, 3.22, 7.27).

**Schema-wide rules:**
- **Superset of v1.** Every v1 key keeps its name, nesting, meaning and section-level order. A reader written for v1 that ignores unknown keys reads the same **generative** wall from a v2 file: the same sections, panels, LEDs and curvature. It does not apply what v2 adds on top (`offset`, `pivot`, `face_orientation`, `uv_transform`), so its placement differs once those hold non-default values (7, AC 47, Q3).
- **Key style.** snake_case. Every length or angle key carries a unit suffix: `_m` (world positions and offsets, C3), `_mm` (physical sizes, as in v1), `_px` (image pixels), `_led` (LED pixels, 04 07-3), and `_deg` for new angle keys (`_degrees` where a v1 key or 04's `rotation_degrees` already uses it). Enum values keep the domain's spelling (`ledSim`, `panelIds`).
- **Coordinates (C45).** Y is up and the wall faces +Z. Without Feature 3 the origin is the first section's bottom-left edge. With Feature 3, `camera.position_m`, `props.*.position_m`, `hdri.projection.point_m`, `measurements[]` and `viewport.orbit` are stored in the **stage frame of the file's own pivot** (03 4.2). Section offsets are in each section's own frame; `pivot.offset_m` is in layout axes.
- **Ranges** come from one table (C22, `domain/rules.js`). Stage positions lie within ±100,000 m (the HDRI point's x/z widened from ±1000 m to match; its y stays [0, 100]). A section offset position is ±100 m on a 0.1 mm grid, written as `Math.round(mm·10)/10000`. The pivot offset is ±1000 m at 1 mm. Every `translateStage` clamps through its `LIMITS` (reachability).
- **Derived keys** are written for downstream tools and **ignored on read**: `generator`, `led_resolution.pixel_pitch_mm`, `curvature.type`, `pixel_map`, `atlas`, `pivot.resolved_m`, `texture_file`, `totals`. They never bump the revision (C40).
- **Key order** comes from `ProjectSchema`, never from iterating `SECTION_FIELDS`. The domain field order follows landing order (the legacy 11 fields, `extensions`, `faceOrientation`, `offset`, `locked`, `detached`, `anchorId`, `uvTransform`, `productId`, `cabinet`), which need not match the file order.
- **Enum spellings** keep the domain values (`ledSim`, `panelIds`). The UI may show section offsets in mm and the pivot and HDRI point in m; 09's `Units` module formats both.
- **No timestamps** in project files (C10).
- **Variants.** All variants share the shape above; only these keys differ:

| Variant | Logos (`assets[].storage`) | `hdri.source.path` (F5) | `viewport` | View-only fields (`display.show_grid`, `display.show_pivot_marker`, `hdri.quality`, `hdri.backdrop`) | Derived keys | Extra |
|---|---|---|---|---|---|---|
| `file` | `inline` (`data_uri`) | `null` | yes | yes | yes | - |
| `zip` | `zip` (`path` under `assets/`) | `hdri/<name>` when the HDRI file is included (05 7.3), else `null` | yes | yes | yes | `sections[].texture_file`, `atlas.texture_file` |
| `history` | id only (`{id}`; blobs stay in `AssetStore`) | `null` | **omitted** | **omitted** | **omitted** (recomputed on apply) | - |
| `autosave` | `inline` if the total inline size is ≤ `maxInlineAssetBytes` (1,000,000), otherwise `missing` (metadata only) | `null` (05's `HdriCache` relinks) | yes | yes | yes | - |
| `share` (09 X7, registered by 09 T7.1) | none: `assets: []` and every `sections[].logo: null` | `hdri.source` is `null`; a live `display.content` of `"hdri"` is written as `"color"` | **omitted** | **omitted** | **omitted** | `project.client` and `project.notes` omitted |

### 4.3 Field table (types, defaults, validation, reachability, owner)

Owner "P" means this spec; "F1".."F6" means the feature spec that owns the field's semantics (and adds it to `ProjectSchema`); "X*n*" means spec 09's item, whose §4.2 table is the authority for values. This table is the authority for **paths**. For F-owned fields, the feature spec's table is the authority for values; the validator calls the same rule functions the feature's UI uses. 08 P2-3b and P2-13e implement the P rows for the Phase-2 keys.

**Reachability rule (binding).** Every validator range must contain every value the app's own writers can produce: UI rule tables, the gizmo, pilot, imports already validated, and feature setters. The "Writers can produce" column records why each range satisfies the rule, so Save then Open never changes a project (4.7).

| Path | Type | Default | Validator (6.7) | Writers can produce | Owner |
|---|---|---|---|---|---|
| `version` | string `"2.<n>"` | `"2.0"` | major 2 accepted; major > 2: `newer-version` (error); minor > `KNOWN_REVISION`: `newer-revision` (warning); `"1.0"` or absent with a `sections` array: v1 path (4.6) | - | P |
| `generator` | object | `Brand.jsonGenerator` | ignored on read, never echoed | - | F6 |
| `format` | const string | `"morph-led-project"` | if present must equal, else `unsupported-format` (error); absent is accepted (the version decides) | - | P |
| `project.name` | string 1..64 | `"Untitled stage"` | `sanitizeText(v, 64)` plus trim (C28); empty: default | `ProjectPanel` runs the same function | P |
| `project.notes` | string ≤ 4000 | `""` | `sanitizeText(v, 4000)` (no trim) | no UI yet (09 adds one) | P |
| `sections` | array | `[default]` | length 1..200, else error (`no-sections` / `limit-exceeded`) | Add Section refuses the 201st (08 P2-3b) and is disabled at 200 (D1); delete keeps ≥ 1 | P |
| `sections[i].name` | string 1..32 | `Wall ${i+1}` | numbers become `String(n)` (`coerced`); `sanitizeText(v, 32)`, **no trim** (C28); empty: default | `WallSection.setName` runs the same function | P |
| `sections[i].id` | int | index `i` | integer in [0, 2³¹−1], unique; else `reassigned-id` (6.8) | `Wall.allocateId()` | P |
| `…panel.columns` | int | 5 | [1, 50], rounded | `FIELD_RULES` [1, 50] with rounding (08 P2-8a) | P |
| `…panel.rows` | int | 3 | [1, 20], rounded | same | P |
| `…panel.width_mm` | number | 500 | [50, 5000] | `FIELD_RULES` [50, 5000] | P |
| `…panel.height_mm` | number | 500 | [50, 100000] | `FIELD_RULES` min 50, sanity cap 100000 (08 P2-8a) | P |
| `…led_resolution.x`, `.y` | int | 32 | [8, 65536], rounded; above the texture budget only a `budget` warning | `FIELD_RULES` min 8, sanity cap 65536, rounding (08 P2-8a) | P |
| `…led_resolution.pixel_pitch_mm` | number | derived | ignored | - | P |
| `…curvature.angle_degrees` | number | 0 | [-180, 180] | `FIELD_RULES` ±180 (08 P2-8a) | P |
| `…curvature.angle_offset_degrees` | number | 0 | [-180, 180] | `FIELD_RULES` [-180, 180] | P |
| `…curvature.type` | string | derived | ignored | - | P |
| `…face_orientation` | enum `stage\|reversed` | `"stage"` | unknown: `"stage"` + warning (01 4.5) | F1 setter | F1 |
| `…offset.*` | object | identity | 02 4.2 rules on `position_m` (±100 m, 0.1 mm), `rotation_deg` (wrapped into (-180, 180], `wrapped` info), `rotation_order` (`"YXZ"`), `frame` (`"section"`), `rotation_origin` (enum) | 02 `SectionOffset.RULES` (same functions) | F2 |
| `…locked`, `…detached` | bool | `false` | non-boolean: `false` + warning | F2 | F2 |
| `…anchor_section_id` | int \| `null` | `null` | read after id reassignment; 02 4.2 rules (not detached: `null`; detached with an invalid host: 02's default host + warning) | F2 | F2 |
| `…color` | `#rrggbb` lowercase | v1: `Palette.legacySectionColors[i % 8]`; v2: `Palette.sectionColors[i % 8]` | `#rgb` expands (`coerced`); anything else gets the default (`sanitized`) | `<input type=color>` and swatches give lowercase hex; `setColor` lowercases | P |
| `…uv_transform.*` | object | identity | 04 4.2 rows (offsets [−8, 8], scales [0.01, 16], `rotation_degrees` wrapped, flips, `source_rotated`) | 04 setters | F4 |
| `…pixel_map` | object | derived | ignored | - | F4 |
| `…logo` | null \| object | `null` | `asset_id` must reference an asset of kind `logo`, else dropped (`missing-asset`); `position` in `top-left\|top-center\|top-right\|center-left\|center\|center-right\|bottom-left\|bottom-center\|bottom-right`; `scale` in [0.05, 1] | UI 5-100 % in steps of 5 | P |
| `…texture_file` | string \| `null` | derived (zip) | ignored | - | P |
| `…extensions` | object | `{}` | see 4.4 | - | P |
| `mesh_mode` | enum `combined\|section\|panel` | `combined` | unknown: `combined` + `defaulted` warning (B-L8: legacy rendered panels). v1: falsy keeps the current mode (4.6) | radios | P |
| `pivot.*` | object | identity | 03 4.2 and 4.3 (`offset_m` ±1000 m, 1 mm) | 03 `WallPivot.parseOffset` | F3 |
| `uv.*`, `atlas` | object | defaults / derived | 04 4.2 | 04 setters | F4 |
| `display.content` | enum `color\|ledSim\|panelIds\|hdri` | `color` | `hdri` with `hdri.source === null` (or before F5 lands): `color` + warning; the validator checks `hdri` first | toggles | P/F5 |
| `display.led_layout` | enum `single-dot\|rgb-triangle\|rgb-stripe\|rgb-horizontal\|square` | `single-dot` | unknown: default + warning | select | P |
| `display.wireframe`, `show_frame`, `show_safe_distance` | bool | `false` | `"true"`/`"false"` strings are coerced | toggles | P |
| `display.show_grid` | bool | `true` | view-only (excluded from history) | grid button | P |
| `display.show_pivot_marker` | bool | `true` | view-only | F3 | F3 |
| `panel_id_style.border_thickness` | int | 8 | [1, 32] | UI rule [1, 32] | P |
| `panel_id_style.font_size` | int | 0 | [0, 200] (0 = auto) | UI rule [0, 200] | P |
| `panel_id_style.section_label_font_size` | int | 0 | [0, 400] | UI rule [0, 400] | P |
| `panel_id_style.font_color`, `section_label_color` | hex | `#ffffff`, `#888888` | hex rule | colour inputs | P |
| `panel_id_style.section_label_enabled` | bool | `true` | - | toggle | P |
| `panel_id_style.brand_mark_on_export` | bool | `false` | non-boolean: `false` + warning | F6 T10 | F6 |
| `camera.enabled` | bool | `false` | - | toggle | P |
| `camera.filmback` | enum: the 11 `FILMBACK_PRESETS` keys (`custom` included) | `full-frame` | unknown: `custom` + warning | select | P |
| `camera.filmback_width_mm`, `filmback_height_mm` | number | 36, 24 | [1, 100]; for a non-custom preset they are overwritten by the preset values (`info` if different) | UI rule [1, 100] | P |
| `camera.focal_length_mm` | number | 35 | [8, 800] | UI rule [8, 800] | P |
| `camera.position_m.x`, `.z` | number | 0, 5 | [-100000, 100000] | inputs, gizmo and pilot within the ±100,000 m writer bounds (08 P2-13e); the Z input keeps its 0.1 minimum only until 08 P2-11c | P/F3 |
| `camera.position_m.y` | number | 1.5 | [0, 100000] | every writer floors at 0 (08 P2-8b/c) and stays within the bound | P |
| `camera.rotation_deg.x` | number | 0 | [-90, 90] | every writer clamps [-90, 90] (legacy) | P |
| `camera.rotation_deg.y` | number | 0 | **any finite number; not clamped, not wrapped** | input [-180, 360]; gizmo and pilot through `wrapDeg` (08 P2-8c) | P |
| `camera.rotation_deg.z` | number | 0 | [-180, 180] | input clamp; gizmo through `wrapDeg` | P |
| `props.person\|car.visible` | bool | `false` | - | toggles | P |
| `props.*.position_m.x`, `.z` | number | person (2, 2), car (4, 3) | [-100000, 100000] | inputs and gizmo within the writer bounds (08 P2-13e) | P |
| `props.*.rotation_y_deg` | number | 0 | any finite number | input [-180, 180]; gizmo through `wrapDeg` | P |
| `props.*.scale` | number | 1 | [0.5, 2] | UI rule [0.5, 2] | P |
| `props.car.model` | object | 05 defaults | 05 4.2 (`asset_id` a bundled-manifest id; an unknown well-formed id is kept) | F5 | F5 |
| `hdri` | object | 05 defaults (`source: null`) | 05 4.2 | F5 | F5 |
| `hdri.projection.point_m` | Vec3 (m), stage frame | 05 default | x, z in [-100000, 100000], y in [0, 100] (C45; widened from ±1000 m) | the point inputs and gizmo within the same bounds; `translateStage` clamps through `HdriSettings` `LIMITS` | F5 |
| `project.client`, `project.template_id` | string ≤ 80 / `null` \| id | `""` / `null` | 09 4.2 | `ProjectSession.setClient`; `TemplateController.load` | X12 / X6 |
| `…product_id`, `…cabinet.*` | `null` \| id; `null` \| number | `null` | 09 4.2 | 09 setters | X1 |
| `display.inner_frustum.*` | object | `{enabled: false, overscan_pct: 10}` | 09 4.2 | `CameraController.setInnerFrustum` | X9 |
| `camera.sensor_photosites_h`, `.focus_mode`, `.focus_distance_m`, `.t_stop` | various | `null`, `wall`, 3, 2.8 | 09 4.2 | `CameraController.setLensField` | X3 |
| `production.*` | object | 09 defaults | 09 4.2 (`StageSettings.LIMITS`) | `StageController.setSetting` | X2 |
| `measurements[]` | array ≤ 50 of `{id, a_m, b_m}`, stage frame | `[]` | 09 4.2; components in [-100000, 100000] | `MeasureTool` and `MeasurementController.translateStage` clamp to the same range | X13 |
| `viewport.orbit.target_m`, `.position_m` | Vec3 (m) | computed (frame the wall) | each component finite with \|v\| ≤ 1,000,000; target equal to position gives the default framing (`defaulted`) | `OrbitControls` (distance ≥ 0.5 m, ≤ `maxDistance` = max(30, 4 × wall radius)) and WASD; a wall of 200 sections of 250 m spans at most 50 km | P |
| `viewport.preview_window.width_px` | number (CSS px) | 320 | [200, 800] (`clamped`) | the resize handle and `setSize` clamp per axis (`clampPreviewSize`) | P |
| `viewport.preview_window.height_px` | number (CSS px) | 180 | [120, 600] (`clamped`) | same | P |
| `assets[]` | array | `[]` | logo entries beyond `MAX_LOGO_ASSETS` (64) are dropped, each with a `sanitized` warning, and the file still opens (08 §6.16); unreferenced entries are dropped (`dropped-unknown`, info); per-entry rules in 4.5 | the upload refuses a 65th distinct image (M-LOGO-3, 08 A2); the writer emits only referenced assets, one per distinct image | P |
| `totals` | object | derived | ignored | - | P |
| `extensions` | object | `{}` | 4.4 | - | P |

### 4.4 Extension protocol (binding for feature specs)

1. **Where a feature may add fields:**
   - in its reserved keys: `sections[].face_orientation` (F1); `sections[].offset`, `sections[].locked`, `sections[].detached`, `sections[].anchor_section_id` (F2); top-level `pivot`, `display.show_pivot_marker` (F3); `sections[].uv_transform`, `sections[].pixel_map`, top-level `uv` and `atlas` (F4); top-level `hdri`, `props.car.model`, the `hdri` value of `display.content` (F5); `generator`, `panel_id_style.brand_mark_on_export` (F6); and spec 09's `sections[].product_id`, `sections[].cabinet` (X1), top-level `production` (X2), the four `camera` lens keys (X3), `project.template_id` (X6), `display.inner_frustum` (X9), `project.client` (X12) and top-level `measurements` (X13);
   - or as a **new key with a default that reproduces pre-feature behaviour**.
2. **No renames or removals.** A feature may never rename or remove a v2 key (or a v1 key), change its unit, or change its default. Doing so requires `"version": "3.0"` and a migration in `io/ProjectMigrations.js`.
3. **Keys are absent until their feature's own landing commit** (C39): no earlier writer (08 P2-13e included) writes a feature key. **Each new field ships, in that commit, with all of the following:**
   - a row in the feature spec, with type, default, range, owner and the writers that can produce it (the reachability rule of 4.3);
   - an entry in `io/ProjectSchema.js` (the single machine-readable table);
   - "absent means default" behaviour, with no issue raised;
   - a round-trip unit test, and a case in the reachability property test (8.1).
4. **Revisions.**
   - **Additive revisions (C40):** each feature release that adds keys bumps the minor version **once** (not once per task) and sets `KNOWN_REVISION` in `ProjectSchema.js`. **The number is assigned at merge time**, never reserved in a spec (specs write `"2.<n>"`), and recorded in `ProjectSchema.REVISIONS` (n → the keys that revision introduced); filling that table is a merge-checklist item. The validator uses `REVISIONS` for its `dropped-unknown` and `newer-revision` messages. Write-only or derived keys (`generator`, `pixel_map`, `atlas`, `resolved_m`, `totals`) never bump. An older reader that sees a newer revision shows the warning "Some settings were saved by a newer version and were ignored". It drops unknown keys **outside** `extensions` and records them as `dropped-unknown` (info). The P keys of 4.2 (`project`, `viewport`) are part of v2.0 and never bump the version (C25).
   - **`extensions`:** objects whose keys match `/^[a-z0-9-]+\.[A-Za-z0-9_.-]+$/` (namespaced, e.g. `"morph.stage_notes"`). Values must be JSON. Maximum depth 8, total serialized size at most 256 KB. They are preserved verbatim on round trip and never interpreted by the core.
5. **Persistence scope.** A feature declares whether each field is view-only. View-only fields are excluded from the `history` variant, the way `display.show_grid` is, and are kept live by a wall-scope import (4.6).
6. **Paths already named in section 0** are binding. Any later deviation needs an amendment to section 0 and to 4.3.
7. **One migration path, one hydration point.** Migration is `ProjectMigrations.detectVersion` plus `migrateV1toV2` (4.6) only; there are no feature-private migrations or alternative shapes (01's `wall.conventions`/`display.debug` rule and 03's `wall.pivot` alternative are deleted, C39). Hydration happens only in `ProjectSession.apply` step 3, through the hydrator each feature registers in the `features` hook map (5.5.2, C41).
8. **Shared rules.** The validator calls the same rule functions the UI uses (`SectionOffset.RULES`, `WallPivot.parseOffset`, `UvTransform.RULES`, `HdriSettings.FIELD_RULES`, `StageSettings.LIMITS`), so Save then Open never changes a project.

### 4.5 Assets (logos) by reference

`assets[]` entry:

```jsonc
{ "id": "a_3f9c0e1b2a7d4c55",          // "a_" + first 16 hex chars of SHA-256(bytes)
  "kind": "logo",                      // v2.0: logo only; "hdri" and "model" are reserved (C9)
  "name": "morph-logo.svg",            // original filename, sanitized, ≤ 128 chars
  "mime": "image/svg+xml",             // allowlist below
  "bytes": 18234,
  "sha256": "3f9c0e1b2a7d4c55…(64 hex)",
  "storage": "inline",                 // inline | zip | missing
  "data_uri": "data:image/svg+xml;base64,…",  // only when storage = inline
  "path": "assets/a_3f9c0e1b2a7d4c55.svg"     // only when storage = zip
}
```

- **MIME allowlist (logos):** `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`. 08's `LogoLoader` re-encodes other decodable types (GIF, BMP, AVIF) as PNG first.
- **Size and count:** at most 2 MB of stored bytes per logo, measured after conversion (`MAX_LOGO_BYTES`), and at most 64 distinct logo images per project (`MAX_LOGO_ASSETS`). Both are refused at upload (M-LOGO-2, M-LOGO-3; 08 P2-13a), so every logo the app holds can be inlined and every file it writes stays within `MAX_IMPORT_BYTES`.
- **The `data_uri` prefix** must equal `data:<mime>;base64,`, and its length must be at most `MAX_LOGO_DATAURI_CHARS` (08 6.16 `parseLogoDataUri`).
- **Rendering safety:** SVG logos are sanitised by `LogoLoader` and are only ever loaded through `Image()` from a blob or data URL, which runs no scripts. They are never injected as markup. No asset URL is ever fetched from another origin.
- **Integrity:** on load, the SHA-256 of the bytes is recomputed (`core/sha256.js`, 6.13; the pure-JS fallback outside secure contexts). A mismatch keeps the asset but raises a warning.
- **Missing assets:** a missing logo renders as no logo and raises a warning issue. The HDRI's missing and relink flow is Feature 5's (05 3.6), on its own `hdri.source` descriptor.

### 4.6 v1 to v2 migration

**Detection** (`io/ProjectMigrations.js detectVersion(data)`; the only dispatch, C2):
- `data` is not a plain object: error `unsupported-format`.
- `data.format` is present and is not `'morph-led-project'`: error `unsupported-format`.
- `data.version` matches `/^(\d+)\.(\d+)$/` with major ≥ 2: major > 2 gives error `newer-version`; major 2 dispatches to the v2 reader with revision = minor.
- Otherwise, `Array.isArray(data.sections)`: v1. `version` may be `"1.0"`, absent or anything else; legacy ignored it.
- Otherwise: error `no-sections`. This is the legacy V-6 "silently ignored" case, now reported (08 M-IMP-1).

**Scope.** A v1 import is a **wall-only** import (`scope: 'wall'`):
- It replaces `sections` and, if `mesh_mode` is truthy, `mesh_mode` (an unknown value becomes `combined` with a warning; a falsy one keeps the current mode, as legacy did).
- It resets the pivot to identity (03 4.4) and the UV settings to their defaults (04 4.2), once those features exist.
- It **clears the logo library** (B-L21, 08 P2-3d).
- It keeps camera, props, display **including the view-only fields**, panel-ID style, `hdri`, the project name, spec 09's non-wall state (`production`, the camera lens keys, `display.inner_frustum`, `project.client` and `project.template_id`, `measurements`) and the viewport exactly as they are. Legacy kept them too, so harness DOM states other than the wall stay identical, and the orbit is re-framed by the rebuild exactly as legacy re-centred it (5.5.2 step 7).

A v2 import replaces everything, including view-only fields and the viewport (`scope: 'full'`).

**Mapping.** Because v2 keeps every v1 key, the migration only reproduces the legacy `||` defaults (so a valid v1 file yields the **same wall** as legacy import) and adds the new keys' defaults. The v2 validator then runs on the result. Any v2 revision goes straight to `validateProject` with "absent means default"; a newer minor version gives `newer-revision` plus `dropped-unknown`; a major version above 2 is an error. No feature adds a migration of its own (4.4 rule 7).

| v1 key | v2 key | Legacy default reproduced |
|---|---|---|
| `sections[i].id` | same | `s.id !== undefined ? s.id : i` (then 6.8) |
| `name` | same | `s.name \|\| \`Wall ${i + 1}\`` |
| `panel.columns` / `rows` | same | `\|\| 5` / `\|\| 3` |
| `panel.width_mm` / `height_mm` | same | `\|\| 500` |
| `led_resolution.x` / `y` | same | `\|\| 32` |
| `curvature.angle_degrees` / `angle_offset_degrees` | same | `\|\| 0` |
| `color` | same | `s.color \|\| colors[i % colors.length]`, with `colors = palette.legacySectionColors ?? palette.sectionColors` (06 4.3) |
| `led_resolution.pixel_pitch_mm`, `curvature.type`, `texture_file`, `totals` | derived: ignored | - |
| `mesh_mode` | same | applied iff truthy (`data.mesh_mode \|\| null`; `null` keeps the current mode) |
| - | `face_orientation`, `offset`, `locked`, `detached`, `anchor_section_id`, `uv_transform`, `product_id`, `cabinet`, `logo` | feature defaults; `logo: null` |
| - | `pivot`, `uv` | identity and defaults |
| - | every other key | current live value (wall-only scope) |

**Unit conversion for Feature 2 (C3).** `SectionOffset` keeps millimetres internally. The serializer writes `position_m = Math.round(mm * 10) / 10000` and reads `mm = Math.round(m * 10000) / 10`. Both are exact for the 0.1 mm grid (|k| = |round(mm·10)| ≤ 10⁶, far below 2⁵³), so a file is byte-stable after its first save and the validator's own normalisation (`Math.round(m * 10000) / 10000`) leaves it unchanged.

### 4.7 Validator contract

`validateProject(input, { limits, palette, knownRevision, exportLimits = CANVAS_HARD_LIMITS }) -> { ok, project, issues }`

08 P2-3b creates `validateProject` with this signature and issue shape (the v1 path and the wall keys); 08 P2-13e adds the v2 path for the Phase-2 keys; D2 completes it (C25).

- `ok === false` exactly when at least one issue has severity `error`. In that case `project === null` and **no live state is touched**: the import is atomic.
- Issue: `{ path: 'sections[2].panel.columns', code, severity: 'info'|'warning'|'error', message, from?, to? }`. `path` uses v2 paths. Messages are plain text, in 08's 3.3 line format.
- `exportLimits` (`{maxSide, maxArea}`) defaults to 08's constant `TextureAtlas.CANVAS_HARD_LIMITS` (32,767 px, 268,435,456 px²). The validator never probes the browser; `CanvasProbe` is used only at export time (6.12).
- **Idempotence:** `validateProject(validateProject(x).project)` gives no issues and a deep-equal project.
- **Fidelity:** for every file the app writes, `strip(validateProject(file).project)` deep-equals `strip(file)` and `issues` is empty. `strip` removes the derived keys of 4.2. The reachability rule (4.3) makes this hold for every value a writer can produce; the property test in 8.1 checks it.
- **Shared rules:** feature fields are validated by the features' own rule functions (4.4 rule 8), never by a copy.
- **Revision messages:** `dropped-unknown` and `newer-revision` name the keys and the revision from `ProjectSchema.REVISIONS` (C40).

| Code | Severity | Meaning |
|---|---|---|
| `parse-error` | error | `JSON.parse` failed (message includes the position) |
| `too-large` | error | A JSON file over `MAX_IMPORT_BYTES` (187,347,712 bytes, ≈ 179 MB; 08 A1), checked on `file.size` before reading; a ZIP over 2 GiB (the practical `ArrayBuffer` limit); or, inside a ZIP, a project JSON entry over `MAX_IMPORT_BYTES` |
| `unsupported-format` / `newer-version` | error | not a project / major version > 2 |
| `no-sections` / `limit-exceeded` | error | 0 sections / more than 200 sections |
| `coerced` | warning | numeric string to number, `"true"` to true, number to string name, `#rgb` to `#rrggbb` |
| `clamped` / `rounded` | warning | out of range / fractional integer |
| `wrapped` | info | an angle normalised into (-180, 180] by a feature rule (02 offsets, 04 UV rotation, 05 yaw) |
| `defaulted` | warning | present but unusable (wrong type, NaN, ±Infinity, `'1e400'`) replaced by the default (missing optional fields are silent) |
| `truncated` / `sanitized` | warning | over-long string / control characters stripped, invalid colour, dropped logo |
| `reassigned-id` | warning | duplicate or invalid section id renumbered |
| `missing-asset` / `invalid-reference` | warning | logo asset absent or wrong kind |
| `dropped-unknown` | info | unknown key outside `extensions`, or an unreferenced asset |
| `newer-revision` | warning | file minor version above the known revision |
| `migrated` | info | v1 converted (one issue per file) |
| `budget` | warning | the configuration exceeds a texture or canvas budget (B-L4/B-M16), or has more than 20,000 panels in total; the file still opens |

**Security rules** (B-M4, B-L8; section 6.7):
- The validator **never** spreads or `Object.assign`s input objects. It builds fresh objects field by field from `ProjectSchema`.
- It rejects own keys `__proto__`, `constructor` and `prototype` at every level, including inside `extensions` (`dropped-unknown`).
- Strings go through `sanitizeText` (C28): the C0/C1 controls `\u0000-\u001F`, `\u007F-\u009F` and the bidi controls `‪-‮`, `⁦-⁩` are stripped.
- Colours must match the hex rule (blocks CSS injection through `style="background: …"`).
- Escaping at render (08 P2-3a, 5.5.4) is the primary XSS defence. Validation is defence in depth.

### 4.8 Persistence formats outside the project file

| Key (localStorage, origin `itzmorphinetime.github.io`, shared by all the owner's Pages sites, hence the namespace) | Owner | Content |
|---|---|---|
| `morph-led-configurator:autosave:v2:current` | `app/Autosave.js` | `{ "format": "morph-led-autosave", "v": 1, "saved_at": <epoch ms>, "app_version": "2.0.0", "project": <v2, variant autosave> }` |
| `morph-led-configurator:autosave:v2:previous` | `app/Autosave.js` | Same shape: the previous session's last state (6.11) |
| `morph-led-configurator:prefs` | `app/Prefs.js` | `{ "v": 1, "autosave": true, "hdri_remember": true (F5, 05 T8b), "pivot_default_mode": "bottom-left" (F3, optional 03 T17; absent or unknown = "bottom-left"; read only by New and a first start, never by Open or import) }` |
| `morph-led-configurator:uvViewer` | `app/Prefs.js` (for Feature 4) | `{open, top, right, width, height, moved, pinned, background, space, aspect, zoom}` (04 07-6) |

Every read is wrapped in try/catch with defaults. History snapshots live only in memory (`History`): variant `history`, serialized as strings. Feature 5's `HdriCache` (IndexedDB) is the only other store (C20). The panel-mode warning flag (3.11) is an in-memory flag, not a preference.

---

## 5. Architecture

### 5.1 Module map

New modules (all follow ARCHITECTURE.md 1.5: header, JSDoc, no module-level mutable state, layer rules in 1.3). Rows marked "08" are created by spec 08 and only extended here (C25):

| Path | Layer | Class / exports | Workstream (task) |
|---|---|---|---|
| `js/core/AppInfo.js` | core | `APP_VERSION = '2.0.0'` (bumped by hand per release; 08 P2-13e's injected `appVersion` reads it) | d (D1) |
| `js/core/typingTarget.js` (08) | core | `isTypingTarget(t)`, `isMovementBlockedTarget(t)` (3.8). Created by 08 P2-9b, its one named owner (01 CR-9, C18, C52); 01 T7 consumes it. | b (I1 extends) |
| `js/core/sha256.js` (08) | core | `sha256Hex(bytes, { subtle } = {})`: `subtle.digest` when given, else a pure-JS FIPS 180-4 implementation (6.13). Delivered by 08 P2-13e (C23). | d (D6 uses it) |
| `js/domain/hexColor.js` | domain | `hexToRgb(hex) -> {r, g, b}` in 0..1 sRGB | f (U0) |
| `js/io/ProjectSchema.js` (08) | io | `PROJECT_SCHEMA` (field table of 4.3), `KNOWN_REVISION`, `LIMITS`, `ENUMS`, `DERIVED_KEYS` (08 P2-3b, P2-13e, including the known-but-unapplied `project` and `viewport` rows); features add their rows | d (D1 completes) |
| `js/io/ProjectValidator.js` (08) | io | `validateProject(input, opts)`, `sanitizeString`, `finiteOr`, `isPlainObject`, `stripDerived` (08 P2-3b, P2-13e); D2 adds whatever 4.7 still lacks (extensions, `newer-revision`, `budget`) and the fuzz and reachability tests | d (D2) |
| `js/io/ProjectMigrations.js` (08) | io | `detectVersion(data)`, `migrateV1toV2(data, {palette})` (08 P2-3b, P2-13e) | d (D2) |
| `js/geometry/TextureBudget.js` | geometry | `SECTION_TEXTURE_BUDGET_PX` (16,777,216, per rebuild), `PANEL_TEXTURE_BUDGET_PX` (33,554,432, wall-wide, `uv.panel_uvs = 'panel'` only), `MAX_CANVAS_SIDE` (4096; each side ≤ min(`maxTextureSize`, 4096)), `fitPxPerLed`, `panelModePxPerLed`, `estimateGpuBytes`, `DEFAULT_LIMITS` (C38). Delivered early by 08 P2-12d (C25). | h (X3) |
| `js/render/PreviewPass.js` | render | `PreviewPass` (scissor pass, letterbox, still capture) | a (R2, R4) |
| `js/render/CanvasProbe.js` | render | `createCanvasProbe({doc, win})` → `{ fits(w, h) }`: lazy, at the requested size only, cached (6.12) | h (E3) |
| `js/interaction/Keymap.js` | interaction | `KEYMAP`, `matchShortcut(e, platform, scope)`, `platformOf(win)`; re-exports `isTypingTarget` | b, h (I1) |
| `js/vendor/three-addons.js` | vendor | `createAddons({doc})` returning control and loader factories (5.7.4; C14) | b (I3), f (U1) |
| `js/app/ProjectSession.js` | app | `ProjectSession` (capture/apply/open/save/new/restore; absorbs 08's `ProjectIO.#applyV2`) | d (D5) |
| `js/app/AssetStore.js` | app | `AssetStore` | d (D6) |
| `js/app/History.js` | app | `History` (the only undo stack, C16) | e (H1) |
| `js/app/Autosave.js` | app | `Autosave` | e (H3) |
| `js/app/Prefs.js` | app | `Prefs` (`get(key)`, `set(key, value)` on the one prefs object; reads `win.localStorage` itself from the injected `win`; every access in try/catch; C19) | e (H3) |
| `js/ui/Notifier.js` | ui | `Notifier` (toasts and the toast log; also implements the Phase-1 `dialogs` interface) | h (E1) |
| `js/ui/Dialog.js` | ui | `Dialog` (modal, focus trap) | h (E1) |
| `js/ui/ImportReport.js` | ui | `showImportReport(dialog, {fileName, sourceVersion, issues})`. `App` binds it into `ProjectSession`'s injected `reportImport` callback, because `app/` may not import `ui/`. | d (D8) |
| `js/ui/ProjectPanel.js` | ui | owns `#project-name`, `#project-new`, `#import-json`, `#import-input`, `#export-json`, `#toggle-autosave`, the restore banner | d, e (D8, H3) |
| `js/ui/HistoryControls.js` | ui | owns `#history-undo`, `#history-redo`, `#autosave-status` | e (H2) |
| `js/ui/ShortcutHelp.js` | ui | `?` dialog content generated from `KEYMAP` | b (I1) |
| `js/ui/PerfHud.js` | ui | `#perf-hud` (`?perf=1`) | h (X4) |
| `js/ui/ErrorReporter.js` | ui | window `error`/`unhandledrejection` to `Notifier`; boot flag | h (E4) |
| `js/boot.js` | (classic script, no imports) | 15 s boot watchdog, `#boot-error` (exempt from the globals and id-lookup static rules, 5.13 S8) | h (E4) |
| `.github/workflows/ci.yml`, `pages.yml`, `golden.yml` | - | - | g (G1, G2, G4) |

Withdrawn in revision 3: `tests/regression/allow.mjs` and `BASELINES.md` (C26). Not part of this spec: `app/HdriCache.js` (Feature 5, C20).

`ui/dom.js` gains the keyboard and busy helpers of 5.9.4 (`bindSwitchKeys`, `bindRovingRadio`, `bindButtonKeys`, `bindScopedKeys`, `withBusy`); `escapeHtml`, `setTitleWithWarning` (08 P2-3a) and `setToggle` (08 P2-13c) already exist. Changed modules are listed in 2.8. The detailed contracts follow.

### 5.2 (a) Single renderer and render layers

#### 5.2.1 `render/SceneManager.js` (changed)

```js
export const LAYERS = Object.freeze({ DEFAULT: 0, HELPERS: 1, ENVIRONMENT: 2, DEBUG: 3 });   // now applied (R1)

export class SceneManager {
  // existing API unchanged; additions:
  /** Register a helper root: scene.add(o); records {root: o, layer}. layer: LAYERS.HELPERS (default), LAYERS.DEBUG,
   *  LAYERS.ENVIRONMENT, or 'default'. 'default' keeps layer 0 and puts o in #passHidden, which is hidden around the preview
   *  and still passes (objects whose own raycaster cannot see other layers: r128 TransformControls). */
  addHelper(object3D, { layer = LAYERS.HELPERS } = {})
  /** Optional immediate re-tag of a subtree added under a registered root; the per-frame enforcement covers it anyway. */
  tagHelper(object3D)
  /** Per-frame scalers (C46): fn(camera) runs on every RENDERED frame, after the camera update and before the passes.
   *  03 registers pivotMarker.updateScale, 02 path B gizmo.updateScale. Returns an unregister function. */
  addPreRender(fn)
  // init(): camera.layers.mask = DEFAULT|HELPERS|ENVIRONMENT|DEBUG (0b1111); renderer.info.autoReset = false;
  //         canvas listeners webglcontextlost/restored (5.9.3)
  /** One rendered frame: #enforceHelperLayers() (6.2), info.reset(), main pass, then each injected pass.
   *  From R3 on it is called only by the loop (6.3) and by the first synchronous frame. render() stays an alias. */
  renderFrame()
  setPasses(passes)                        // [{render(scene)}]; App injects [previewPass]
  /** Pilot mode toggles HELPERS only: on -> camera.layers.enable(LAYERS.HELPERS); off -> camera.layers.disable(LAYERS.HELPERS).
   *  DEFAULT, ENVIRONMENT and DEBUG stay enabled in both states (Feature 1's normal lines and Feature 5's dome remain
   *  visible in pilot). */
  setHelpersVisibleInMain(on)
  invalidate(reason)                       // 5.3
  holdContinuous(token) / releaseContinuous(token)
  get framesRendered()
  /** Hides #passHidden roots (visible = false) around fn() and restores their previous values. */
  withPassHidden(fn)
  // Constructor deps gain `bus` (5.3) and the `onFatal` / `onRestored` / `onRecoveryTimeout` callbacks (5.9.3), all passed by App.
  // Feature 5 adds setEnvironment(texture | null) and setPunctualLightScale(k) (05 T12; C12).
}
```

**Layer assignment** (enforced every rendered frame by `#enforceHelperLayers`, audited under `?debug=1`, 6.2):

| Object | Layer | Main camera | Main camera in pilot | Preview / still | F5 stage probe (`CubeCamera`) | Pick |
|---|---|---|---|---|---|---|
| LED wall meshes, panel frames, cabinet back shell (F1) | DEFAULT | yes | yes | yes | yes | Feature 2 (wall Selectables) |
| Person, car (and the F5 glTF car) | DEFAULT | yes | yes | yes | yes | yes |
| HDRI backdrop dome (F5) | ENVIRONMENT, `raycast` no-op | yes | yes | yes | no: r128 cube cameras keep the default mask `0b0001` (05 5.11 b) | no |
| Normal lines (F1) | DEBUG | yes | yes (01: reachable in pilot) | no | no | no (`raycast` no-op) |
| Grid, axes | HELPERS | yes | no (Q7) | no | no | - |
| Camera rig (body, frustum lines, fill) | HELPERS | yes | no | no (B-M11 stays fixed) | no | yes: the body is picked through `PointerRay` |
| Safe-distance group | HELPERS | yes | no | no (Q8) | no | - |
| Gizmo (`TransformControls` root) | r128: `'default'` + `withPassHidden`. Current three (U2+): HELPERS + `raycaster.layers.set(HELPERS)` | yes | **no**: `gizmo.setPilot(true)` sets `root.visible = false` and `controls.enabled = false` (5.4.2), so it is neither drawn nor pickable (B-L26 stays fixed on r128, where the root is on layer 0) | no (`withPassHidden`) | no (05 captures inside `withPassHidden`) | its own raycaster; inert while `enabled` is false |
| Gizmo proxy `Object3D` | HELPERS (empty) | - | - | - | - | - |
| Feature helpers: pivot marker **including its invisible pick proxy** (F3, C56), selection and hover outlines (F2), UV hover marker (F4), projection-point marker (F5), inner-frustum overlay and measurement lines (09) | HELPERS | yes | no | no | no | per feature, through `PointerRay.layers.enableAll()` and the explicit `pickMeshes()` lists |

Camera masks: main `0b1111`; main in pilot `0b1101`; preview and still `0b0101` (`DEFAULT | ENVIRONMENT`). If 08 P2-10a landed first, R1 deletes its `PreviewWindow.render(scene, helpers)` visibility loop and the `sceneManager.helpers` argument `App` passes to it: the preview camera's mask does the same job, and the R1 golden step proves the preview pixels unchanged (8.4). If R1 lands first, it carries P2-10a's retirements instead (C31).

**As built (R1, 2026-10-17, after 08 P2-10a and before P2-10b/c; manifest `07-R1`):** `LAYERS` and `LAYER_MASKS` live in `render/SceneManager.js`; `addHelper(o, {layer})` tags the subtree at once and `render()` re-tags every registered root first (there is no `renderFrame()` before R2/R3); `tagHelper`, `withPassHidden`, `setHelpersVisibleInMain` (called by `PilotController.toggle`) and the `?debug=1` audit (nodes marked `userData.helper`, today the normal lines). The Phase-1 hand-written gizmo is registered with `'default'` (the r128 row above): it is hidden around the preview pass and, until 08 P2-9j fixes B-L26, still drawn in pilot mode, so R1 changes no gizmo pixel. P2-10a's visibility loop and `SceneManager.helpers` are deleted. As 8.4's row says, only the screenshots taken while piloting change (the grid, axes, rig with its frustum tint and safe-distance floor leave the pilot view); every preview rectangle stays identical.

**Picking consequence.** `PointerRay`'s single shared `Raycaster` must call `raycaster.layers.enableAll()` (in r128, `Layers.enableAll` exists and `Raycaster.layers` is tested in `intersectObject`). Otherwise the HELPERS-layer camera body can no longer be picked. `SelectionManager` keeps raycasting explicit `pickMeshes()` lists, so layers never decide what is pickable; objects that must never be hit (normal lines, dome) set `raycast = () => {}`.

**Why per-frame enforcement (adopted from 05).** `Object3D.layers` is **not inherited**, and views add children to registered roots after registration (`CameraRigView.rebuildFrustum`, the gizmo, feature helpers). Re-tagging each registered root's subtree at the start of every rendered frame makes a forgotten `tagHelper` call harmless. Helpers are small (hundreds of nodes), and with render-on-demand this runs only on rendered frames.

#### 5.2.2 `render/PreviewPass.js` (new) and `render/PreviewWindow.js` (changed)

```js
export class PreviewPass {
  /** @param {{sceneManager: SceneManager, cine: CineCamera, window: PreviewWindow, win: Window}} deps */
  constructor({ sceneManager, cine, window, win })
  get camera()                       // the preview PerspectiveCamera (moved here from PreviewWindow); mask DEFAULT|ENVIRONMENT
  /** Legacy updatePreviewCamera maths (fov = vFovDeg, aspect = cine.aspect(), near 0.1, far 100, YXZ pose),
   *  then window.setLabels(...) with 08 P2-10c's texts (presetShortName(), drawn size). Called by CameraHub.refresh()
   *  where PreviewWindow.updateCamera() was. */
  updateCamera()
  /** If !cine.enabled or !window.visible: return. Computes the device-pixel rects (6.1, PreviewFit.letterboxRect);
   *  clears the window rect black; renders the letterboxed rect with scene.background; restores the full viewport
   *  and scissor state. Wrapped in sceneManager.withPassHidden(). */
  render(scene)
  /** Still (task R4), 6.1 "Stills": antialiased, same colour output as the canvas, mask DEFAULT|ENVIRONMENT,
   *  wrapped in withPassHidden, and inside ledWallView.withContentMaterials() unless include.debug is true, so 01's
   *  debug shading never reaches a still (C48). @returns {Promise<Blob>} PNG */
  capture({ width, height, include = { debug: false } })
}
```

`PreviewWindow` keeps its DOM ownership: the six ids and the resize handle. It changes as follows (R2):
- **Removed:** 08 P2-10's second renderer (`init()`'s renderer creation, the inner-box `renderer.setSize`), `renderer`, `camera`, `render()`, `updateCamera()`.
- **Kept:** `setVisible(on)`, P2-10b's resize behaviour (`PreviewFit.clampPreviewSize`, per-axis clamps, no refit on filmback change).
- **New or confirmed:** `contentRect()` returns the client rect of `#camera-preview-canvas`. `setLabels({info, fov, res})`. `setSize({width_px, height_px})` applies `clampPreviewSize` and writes the window's inline size (D5 adds this method to P2-10's class already, 5.5.2). `get visible()`. `get initialized()` returns `#initDone`, set after the resize handle is wired (05 5.1 row 5).
- **Resize:** on every resize it calls `sceneManager.invalidate('preview-resize')`.

**App tick.**
- R1 and R2 keep the tick of 08 P2-9h (`(dt) => { orbit.tickKeyboard(dt); pilot.tickKeyboard(dt); sceneManager.renderFrame() }`), so those steps stay pixel-comparable.
- **From R3 on, the tick only updates state:** `(dt, now) => { orbit.tick(dt); pilot.tick(dt); /* F5: hdriController.tick(now) (it runs hdriView.tick()); carModelController.tick(now) */ }` (05 5.11 c). Each `tick` calls `invalidate()` when it changed something (or a continuous token is held). `SceneManager.startLoop` is the **only** caller of `renderFrame()` (6.3). There is never a second render per frame.
- **Per-frame scalers** (03's `pivotMarker.updateScale`, 02 path B's `gizmo.updateScale`) are not tick members: they register with `sceneManager.addPreRender(fn)` and run on every rendered frame after the camera update (C46). This section owns the tick; feature specs point here instead of quoting a tick snippet.

`renderFrame()` runs the pre-render functions, then `#renderMain()`, then each injected pass (`previewPass.render(scene)`). `App` calls `sceneManager.setPasses([previewPass])` after constructing both. `PreviewPass` receives `SceneManager`, so a static import the other way would create a cycle; the injection avoids it.

**As built (R2, 2026-10-17, before 08 P2-10b/c; manifest `07-R2`).** The owner's report that day: with the preview enlarged and the view orbited, a rectangle of the main viewport (the preview's size, mirrored vertically) stopped updating, a browser compositing bug of two overlapping WebGL canvases (the original app had it too). R2 removes it by construction: the page now creates exactly one WebGL context (`preview_compositing` asserts it through `window.__glCanvases()`; neither headless SwiftShader nor a headless GPU run reproduced the stale rectangle itself, so the canvas list is the regression check). Deviations: `PreviewPass({ sceneManager, cine, previewWindow })` (the key `window` would break static check rule 3) with no `win`; 6.1's arithmetic is the pure `PreviewFit.previewDeviceRects` (plus `cssForDevicePx`), so `preview-pass.test.mjs` tests it without a renderer; `render` also returns while `previewWindow.visible` is false and updates the camera's aspect only when the filmback changed; `PreviewWindow.setSize` (D5) and `invalidate('preview-resize')` (R3) are not added. The labels keep their legacy texts: B-L34 stays open and its tag moved to `PreviewPass.js#updateCamera` (5.11). The window is transparent with square corners (its border, outline and shadow stay), and `#camera-preview-canvas` is a `display: block; visibility: hidden` placeholder in `css/99-utilities.css` (the markup is unchanged).

**Retired:** no `Strategies` key or `LEGACY_SITES` row: 08 P2-10a-c retired `previewRendersHelpers`, `previewRendererSize` and the `PreviewWindow.js#init/#render/#setupResize/#updateCamera` and `SceneManager.js#addHelper` rows (C21). R2 deletes the second `WebGLRenderer` and its context.

### 5.3 (c) Render-on-demand

`SceneManager` owns the scheduler (no new module):

```js
startLoop(tick)   // frame(now): requestAnimationFrame(frame); dt = clamp((now - last) / 1000, 0, 0.1); tick(dt, now); maybe render (6.3)
invalidate(reason = 'unspecified')   // #dirty = true; under ?debug=1, #reasons.add(reason)
holdContinuous(token) / releaseContinuous(token)   // Set of tokens; non-empty means render every frame (F5 animations)
```

**Invalidation sources.** Each source is a direct call or an idempotent mirror (R3-compliant: it touches only `SceneManager` state):

| Source | Mechanism |
|---|---|
| Every **visual** bus event: `Object.values(Events)` minus `SceneManager.NON_VISUAL_EVENTS` (a frozen list). **Each feature classifies its events as visual or non-visual in the `Events` catalogue in the commit that adds them** (C47; static rule S9 fails on an unclassified event). Non-visual: `HISTORY_CHANGED`, `AUTOSAVE_STATUS`, `UV_VIEWER_CHANGED`, `UV_DATA_CHANGED` (F4), `STAGE_ESTIMATES_CHANGED`, `CAMERA_MOIRE_CHANGED`, `UNITS_CHANGED` (09). Visual: `WALL_REBUILT`, `PROJECT_REPLACED`, `SELECTION_CHANGED`, `CAMERA_*`, `PROP_*`, `GIZMO_*`, `PILOT_CHANGED`, `DISPLAY_CONTENT_CHANGED`, plus `DEBUG_VIEW_CHANGED` (F1), `SECTION_CHANGED`, `SELECTION_HOVER_CHANGED` (F2), `WALL_PIVOT_CHANGED` (F3), `UV_TRANSFORM_CHANGED`, `UV_SETTINGS_CHANGED`, `UV_HOVER_CHANGED` (F4), `HDRI_CHANGED`, `HDRI_PROJECTION_CHANGED`, `CAR_MODEL_CHANGED` (F5), `MEASURE_CHANGED`, `MEASUREMENTS_CHANGED` (09). | `SceneManager` gains a `bus` dependency and subscribes in its constructor: `bus.on(type, () => this.invalidate(type))` |
| Orbit camera moves (drag, wheel, damping, WASD) | `OrbitControls` `change` event (it fires on every damping step), and `OrbitController.tick` when it moved |
| Pilot look/fly | through `CAMERA_POSE_CHANGED` (above) and `PilotCameraDriver.enterView` |
| **Phase-1 custom gizmo hover** (R3 lands before I3) | `TransformGizmo.onHover` calls `sceneManager.invalidate('gizmo-hover')` when the hovered axis changes. Fallback: `ViewportInput`'s canvas `pointermove` with no button pressed calls `invalidate('pointer')` while a gizmo is attached (cheap: one flag write). |
| `TransformControls` hover and drag (from I3) | its `change` event |
| Window resize / preview resize | `onResize()` / `PreviewWindow` |
| Grid toggle | `SceneManager.toggleGrid()` |
| Async texture readiness (logo `Image.onload`, `document.fonts.ready`, F5 HDRI decode) | the owning code calls `invalidate` (fonts: `App` once at boot) |
| Context restored | `webglcontextrestored` handler |
| **Safety net** | each loop iteration compares `camera.matrixWorld.elements` and `projectionMatrix.elements` with the last-rendered copies; any difference renders |

`?render=always` sets a permanent continuous token. The **first frame renders synchronously** inside `startLoop`, as legacy does (initial `#dirty = true`). This step is behaviour-preserving for every harness output, so its harness run must be **identical**. Hover is not covered by the harness (ARCHITECTURE 10 lists it as a manual check), so R3's manual checklist includes the gizmo hover highlight (8.6).

**Idle measurement.** With `enableDamping` (`dampingFactor` 0.05; `OrbitControls` stops when the remaining delta is below its internal epsilon of 1e-6), the tail after a fast drag lasts about 1.5-2 s of `change` events. The idle budget (5.9.5, AC 6) is therefore measured over a 1 s window that starts **3 s** after the last input, and the `render_on_demand` scenario also emulates `prefers-reduced-motion: reduce`, which turns damping off (3.9).

### 5.4 (b) Selection registry, gizmo and orbit

Every task in this section runs after the 08 P2-9 commits that fixed the same ids on the hand-written code (2.9, C21). 08's criteria 34-37 are regression criteria for I1-I4a.

#### 5.4.1 `interaction/SelectionManager.js` v2 and the `Selectable` v2 contract (C15)

I2 lands the registry and the selection members (`id`, `label`, `kind`, `multi`, `pickPriority`, `isPickable`, `isSelectable`, `pickMeshes`, `resolveHit`, `bounds`), and the observer hooks of C37. The gizmo members (`allowedAxes(mode)` as an object of booleans, `getTransform`, `applyTransform`, `historyLabel`) become binding with I3; until then the path-B hook set of C33 drives the hand-written gizmo.

```js
/** @typedef {object} Selectable
 * @property {string} id                 'camera' | 'person' | 'car' | 'section:<id>' (F2) | 'pivot' (F3) | 'hdri-point' (F5; C36)
 * @property {string} label              badge text (rendered with textContent); F5: 'HDRI Point'
 * @property {'camera'|'prop'|'section'|'pivot'|'projector'} kind      F5's HDRI point is kind 'projector'
 * @property {boolean} [multi]           may join a multi-selection (sections only)
 * @property {number} [pickPriority]     default 0; a target with priority > 0 wins over nearer wall (section) hits only;
 *                                        among all other hits the nearest wins (6.4; 03 5.10.1 #6). F3 pivot: 10; F5 HDRI point: 9
 * @property {() => boolean} isPickable
 * @property {() => boolean} [isSelectable]   default isPickable; revalidate() drops a selected id when it returns false
 *           (F5: content === 'hdri' && state ready && pointMode === 'custom'; 05 calls revalidate() on those transitions)
 * @property {() => THREE.Object3D[]} pickMeshes
 * @property {(hit: THREE.Intersection) => string|null} [resolveHit]   e.g. combined-mesh faceIndex -> 'section:<id>' (F2);
 *                                                                    null = not selectable (locked sections, F2)
 * @property {(mode: 'translate'|'rotate') => {x: boolean, y: boolean, z: boolean} | null} allowedAxes
 *           null = no gizmo in this mode (also for locked sections). Keeps 08 P2-9d's "only working handles" (B-L22).
 * @property {(out: {position: THREE.Vector3, quaternion: THREE.Quaternion}, opts: {mode: 'translate'|'rotate'}) => void} getTransform
 *           world space: gizmo anchor and orientation; the mode lets a target orient its arrows and rings differently
 *           (02 CR-07-e: local translate arrows follow the section frame B, local rings B·R0). Targets may ignore it.
 * @property {(t: {position, quaternion}, phase: 'start'|'drag'|'end'|'cancel', ctx: GizmoCtx) => void} applyTransform
 *           'start': snapshot the domain state; 'drag': write start + delta (t is absolute; delta = t vs ctx.start), applying
 *           ctx.snap to the delta; 'end': commit (at most one full rebuild); 'cancel': restore the start snapshot.
 *           Validated domain writes only (setPose rules), pose event, refresh. Idempotent for equal input.
 * @property {string} historyLabel       e.g. 'Move camera'
 * @property {(on: boolean) => void} [highlight]
 * @property {() => THREE.Box3 | null} [bounds]   for "frame selection" (F)
 */
/** @typedef {{ space: 'world'|'local', snap: InteractionState['snap'] | null,
 *              start: {position: THREE.Vector3, quaternion: THREE.Quaternion},
 *              axis: 'X'|'Y'|'Z'|'XY'|'YZ'|'XZ'|'XYZ'|'E'|'XYZE'|null }} GizmoCtx
 *  snap is the shared InteractionState.snap object {translateMm: 10, rotateDeg: 5, pivotM: 0.1} (02 CR-07-c, 03 5.10.1 #3),
 *  non-null iff Ctrl/Cmd is held during the drag (interaction.snapHeld). Each target reads its own increment (sections
 *  translateMm and rotateDeg, the pivot pivotM). TransformGizmo.setSnapIncrements(partial) is its only writer and merges.
 *  Snapping is relative to the start (03 D9).
 *  axis is the active TransformControls handle (controls.axis); the delta decoding per handle kind is in 6.5. */
/** @typedef {{ prefix: string, resolve(id: string): Selectable|null, all(): Selectable[],
 *              group?(ids: string[], primaryId: string): Selectable|null }} SelectableProvider
 *  group returns a composite Selectable (F2 SectionGroupSelectable: anchor = median of the members' pivots, orientation =
 *  the primary's, label `${n} sections`, applyTransform drives every unlocked member). */

export class SelectionManager {
  constructor({ bus, gizmo, pointerRay, interaction })
  register(selectable)                     // static selectables (camera, person, car); order = tie order at equal priority and distance
  registerProvider(provider)               // dynamic families (F2 sections: prefix 'section:')
  find(id)                                 // static or provider-resolved
  get selectedIds()                        // frozen copy; primary = last
  get primaryId() / get selectedId() / get selected()   // primary (legacy-compatible names)
  /** What the gizmo drives: find(primary) for one id; provider.group(ids, primary) when several ids share a provider
   *  that has group(); otherwise null (mixed kinds never multi-select). */
  get gizmoTarget()
  /** mode: 'replace' | 'add' | 'toggle' | 'range' (F2 list); origin: 'viewport' | 'list' | 'keyboard' | 'api'.
   *  Multi only when every member has multi === true; otherwise replace. */
  select(id, { mode = 'replace', origin = 'api' } = {})
  selectMany(ids, { primaryId, origin = 'api' } = {})
  deselect({ origin = 'api' } = {})
  /** Re-resolve ids; drop ids that no longer resolve or whose Selectable is not selectable (isSelectable?.() ?? isPickable()),
   *  e.g. the camera after an undo turned the preview off. Emits SELECTION_CHANGED iff the set changed. F2's prune().
   *  Called directly (never from a bus subscriber, because #syncGizmo may cancel a drag): by
   *  CameraController.setPreviewEnabled(false) and by WallController after a rebuild that removed sections (F2).
   *  ProjectSession.apply step 10 uses selectMany with the ids it keeps instead (5.5.2), which applies the same filter. */
  revalidate()
  /** Click pick (6.4). Called by ViewportInput on pointerup with travel < 4 px, a single pointer and no handle press. */
  pickAt(event, { mode = 'replace' } = {})
  /** The single hover raycast (C37): skeleton in I2, bodies by F2 T23 (emits SELECTION_HOVER_CHANGED). */
  hoverAt(event) / setHover(id) / clearHover()
  /** C37, for F4: o(selectionState) runs once, after the emit and the gizmo sync, in select, selectMany, deselect,
   *  pickAt and revalidate (only when they emit). Direct ordered calls (R2), never bus subscribers. */
  addObserver(o)
  /** C37, for F4: fn(hit | null) receives the raw wall hit of hoverAt, and null from clearHover. */
  addHoverHitObserver(fn)
}
```

**Gizmo wiring stays a direct call.** Every method that changes the selection ends with the private `#syncGizmo()`, **before** emitting `SELECTION_CHANGED`: `target = this.gizmoTarget; target && target.allowedAxes(gizmo.mode) ? gizmo.attach(target) : gizmo.detach()`. This is the Phase-1 wiring. `TransformGizmo` never subscribes to `SELECTION_CHANGED`, because `detach()` may cancel an active drag, which calls `target.applyTransform(start, 'cancel')` and writes the domain; a bus subscriber must not do that (ARCHITECTURE R3).

Emits `SELECTION_CHANGED { id, label, ids, kind, origin, modes }`, where `modes` lists the gizmo modes whose `allowedAxes` is non-null for the gizmo target (03 5.4). The payload extends the legacy `{id, label}` and stays compatible with `ViewportToolbar`.

**Conversion of the features' hook set** (C15, C33). Features that land before I3 implement the one path-B hook set (03 T5 implements it, 02 reuses it) on the Phase-1 gizmo. I3 converts each one that exists, using this mapping; their gizmo tests and harness steps are I3's regression gate. With the recommended order (C58) only F3's marker exists by then:

| Phase-1 / 02 / 03 hook | Selectable v2 |
|---|---|
| `hasGizmoTarget()` | `allowedAxes(mode) !== null` (locked sections return `null`) |
| `gizmoAnchor(out)`, `orientGizmo(rotation, mode)` | `getTransform(out, {mode})` (position = anchor, quaternion = orientation; 02 CR-07-e) |
| `beginGizmoDrag()` | `applyTransform(t, 'start', ctx)` |
| `applyGizmoTranslate(movement, ctx)` (`ctx = {space, axisWorld, snap}`) | `applyTransform(t, 'drag', ctx)` with `translateWorld = t.position - ctx.start.position` (from the start, not incremental) |
| `applyGizmoRotate(axis, deltaDeg, ctx)` | `applyTransform(t, 'drag', ctx)`: for a single-axis handle, `{axis, deltaDeg}` decoded from `t.quaternion · ctx.start.quaternion⁻¹`; for the free-rotation handles (`E`, `XYZE`), the world delta quaternion itself (6.5) |
| `endGizmoDrag({cancel: false})` / `endGizmoDrag({cancel: true})` (the only end hook; `TransformGizmo.cancelDrag()` calls the latter and sets `interaction.gestureCancelled`) | the `'end'` phase: `applyTransform(t, 'end', ctx)` / the `'cancel'` phase: `applyTransform(ctx.start, 'cancel', ctx)` |
| `allowedAxes(mode)`: `{x, y, z}` or `null` (`null` = mode unsupported; e.g. the pivot's `'rotate'`) | required; same meaning, and `SELECTION_CHANGED.modes` is derived from it |
| `pickPriority` (03) | same |
| `SectionSelection.group(ids, primaryId)` (02) | `SelectableProvider.group` |
| `SELECTION_CHANGED.modes` (03), `.ids`, `.kind`, `.origin` (02) | same |
| `interaction.snap` + Ctrl/Cmd held (02, 03) | `ctx.snap`, filled from `interaction.snap` when `interaction.snapHeld` |

**Replaced code:** I2 replaces 08 P2-9a's mouseup pending-click logic with the capture-phase press record (6.4) and removes its gizmo-mode gating. No `LEGACY_SITES` row remains to retire (C21).

#### 5.4.2 `interaction/TransformGizmo.js` over `TransformControls` (recommended: adopt)

**Decision matrix** (both columns start from 08 P2-9's fixed gizmo):

| Criterion | Keep the hand-written gizmo (08 P2-9) | Adopt `TransformControls` |
|---|---|---|
| Open bugs | none after P2-9 (B-M12, B-L28, B-L22, B-L23, B-L26 fixed by hand) | none; the same behaviour by construction, and it disposes its own resources |
| Features needed by F2, F3, F5 | Plane handles, multi-target and screen-constant size are missing (02 builds them on the hook set) | `setSize`, plane handles (XY/YZ/XZ), hover states; group targets through the proxy |
| Code size we maintain | about 430 lines (2997-3425) plus P2-9's changes | about 150-line wrapper |
| r128 availability (the default, Q1) | - | `examples/js/controls/TransformControls.js`, a classic script from `cdn.jsdelivr.net/npm/three@0.128.0/` (verified: extends `THREE.Object3D`, events `change`, `dragging-changed`, `objectChange`, `mouseDown`, `mouseUp`; `pointerdown`/`pointermove` on the element and `pointerup` on the document; every handler returns early when `enabled` is false; module-private raycaster, **no** `getRaycaster`; the attached object must have a parent) |
| Current three (after U2) | - | `extends Controls`; `scene.add(controls.getHelper())` (r169); `getRaycaster()` and `reset()` available |
| Risk | Low (known) | Medium: pointer-event interplay with orbit, click-select and pilot (handled in 6.4 and `setPilot`); visual change (re-baseline, after the harness step G6) |

**Contract:**

```js
export class TransformGizmo {
  /** @param {{sceneManager, camera (main, read at use), domElement, interaction: InteractionState, bus,
   *           orbit: OrbitController, recorder: {begin(label), commit(), cancel(opts)}, addons, viewportInput,
   *           onHandleDown: () => void}} deps
   *  recorder is History from H1 on; before H1, App passes a no-op recorder, so I3 does not wait for Track 2.
   *  onHandleDown is ViewportInput.markHandleDown (6.4). */
  constructor(deps)
  /** Creates the controls and the proxy (R4: allocation in init, not the constructor) and registers the Escape handler
   *  viewportInput.registerEscapeHandler(80, () => this.dragging && (this.cancelDrag(), true)) (3.8).
   *  Section 7: called in the init phase immediately after orbit.attach(). Click-select does not depend on this order (6.4). */
  init()
  get mode(); get space(); get dragging(); get attached()
  attach(selectable)                       // proxy <- selectable.getTransform(out, {mode: this.mode}); controls.attach(proxy);
                                           // showX/Y/Z from allowedAxes(mode)
  detach()                                 // cancels an active drag first; called only by SelectionManager (direct call)
  setMode(m) / clearMode() / toggleSpace() // same events as Phase 1 (GIZMO_MODE_CHANGED, GIZMO_SPACE_CHANGED); setMode calls sync()
  setSnapIncrements(partial)               // the only writer of InteractionState.snap; merges (03 5.10.1 #3)
  /** Pilot gating (B-L26 kept): on -> controls.enabled = false; root.visible = false.
   *  off -> controls.enabled = true; root.visible = true; sync(). Never meets an active drag: pilot.toggle has notWhileDragging. */
  setPilot(on)
  /** Re-sync the proxy from the target (on SELECTABLE_MOVED for the target id, CAMERA_POSE_CHANGED, PROP_POSE_CHANGED,
   *  WALL_REBUILT for section and pivot targets). */
  sync()
  cancelDrag()                             // Esc during drag (6.5)
  dispose()
}
```

**Wiring:**
- `dragging-changed`: `interaction.isDraggingGizmo = e.value; orbit.enabled = !e.value && !interaction.pilotMode`.
- `mouseDown`: `onHandleDown()`; `#cancelled = false`; `#start = read(proxy)`; `recorder.begin(target.historyLabel)`; `target.applyTransform(#start, 'start', ctx())`.
- `objectChange`: `if (#cancelled) return`; `target.applyTransform(read(proxy), 'drag', ctx())`, then `sync()`, so domain clamps and snapping move the proxy back to the stored value. `TransformControls` recomputes from its own drag-start state on every move, so the snap-back never accumulates.
- `mouseUp`: `if (#cancelled) { #cancelled = false; sync(); return }`; `target.applyTransform(read(proxy), 'end', ctx())`; `recorder.commit()`.
- `ctx()` = `{ space: this.space, snap: interaction.snapHeld ? interaction.snap : null, start: #start, axis: controls.axis }`. `ViewportInput` updates `interaction.snapHeld = e.ctrlKey || e.metaKey` on every canvas `pointerdown` and `pointermove`. `TransformControls`' own `translationSnap`/`rotationSnap` stay `null` (snapping is relative and owned by the Selectable).
- **Pilot:** `PilotController.toggle()` calls `sceneManager.setHelpersVisibleInMain(!on)` and `gizmo.setPilot(on)` next to each other, on entry and on exit. This replaces 08 P2-9j's `PILOT_CHANGED` mirror, which I3 deletes. In pilot mode a press over a handle's screen position therefore never starts a gizmo drag: `TransformControls`' `pointerdown` handler returns early, and the pilot's mouse-look handler gets the press.

**Proxy.** An empty `Object3D` added through `addHelper`. `TransformControls` reads `object.parent.matrixWorld`, so the proxy must be parented in the scene.

**Selectables after this change:**

| Selectable | `allowedAxes('translate')` | `allowedAxes('rotate')` | `applyTransform` |
|---|---|---|---|
| `CameraController` (`'camera'`) | x, y, z | x, y, z | `cine.setPose(...)` from position and YXZ Euler (6.5), then `CAMERA_POSE_CHANGED {source: 'gizmo'}` and `hub.refresh({poseOnly: true})` (08 P2-12c); `'cancel'` restores the start pose |
| `PropController` (`'person'`, `'car'`) | x, z | y | `prop.setPose({posX, posZ, rotY})`, then `PROP_POSE_CHANGED`, then `applyTransform()` |
| Sections (F2), pivot (F3), HDRI projection point (F5) | per feature spec, converted per 5.4.1 | | |

**Removed by I3:** the hand-written gizmo (about 430 lines plus P2-9's changes), `CineCamera.rotateBy` and `translateBy`, `Prop.translateBy` and `rotateBy`, `domain/eulerYXZ.js`'s callers in the gizmo path (the module stays if other code uses it), and P2-9j's `PILOT_CHANGED` mirror. **No** `Strategies` key or `LEGACY_SITES` row is retired here: 08 P2-9c-f, P2-9j and 1C/P2-12a already did that (C21). A harness step lands first (G6) so that `gizmo_drag` can find `TransformControls`' handles (8.3).

#### 5.4.3 `interaction/OrbitController.js` over `OrbitControls` (recommended: adopt)

**Decision matrix:**

| Criterion | Keep the custom orbit (after 08 P2-9h/i, P2-11c) | Adopt `OrbitControls` |
|---|---|---|
| Touch, pan, damping | Absent | Built in (r128 verified: `pointerdown`/`wheel`/`touchstart` on the element; `saveState`/`reset`/`getPolarAngle`; **no key listeners unless `listenToKeyEvents()` is called**, so there is no conflict with WASD/arrows) |
| Open bugs | none (B-L27, B-L25 and B-L2 fixed by 08) | the same fixes kept in our keyboard layer and framing (3.7, I4b) |
| Behaviour change | none | Drag sensitivity and wheel curve differ (I4a re-baseline); framing policy (I4b re-baseline) |
| Pilot interplay | `tickKeyboard` returns early in pilot | `OrbitControls.update()` ignores `enabled`: it re-clamps the radius and polar angle and calls `object.lookAt(target)` on the shared main camera, which is the pilot camera. The wrapper must gate it (below). |
| Code | about 130 lines | about 100-line wrapper + keyboard layer |

**Contract** (public API kept so `PilotController`, `WallController` and `App` change minimally):

```js
export class OrbitController {
  static MOVE_SPEED_MPS = 4.8;             // = legacy 0.08 per frame at 60 Hz
  /** wallBox: () => THREE.Box3 | null, injected by App from FramingPolicy's wallBox = WallLayout.bounds() of the current
   *  layout (transformed, all sections including detached ones; C34). generativeBox (attached sections, pre-offset) drives
   *  only the I4a/pre-I4b automatic re-target on every rebuild. frameBounds (08 P2-11c's framingBounds) stays the fallback
   *  when wallBox() returns null. */
  constructor({ sceneManager, keyboard, interaction, frameBounds, wallBox, generativeBox, addons })
  attach()                                 // creates OrbitControls(camera, canvas): rotateSpeed 1.5, minPolarAngle 0.1,
                                           // maxPolarAngle PI - 0.1, minDistance 0.5, maxDistance computed, enableDamping
                                           // (unless reduced motion), 'change' -> invalidate; never calls listenToKeyEvents
  set enabled(on)                          // false in pilot and while a gizmo drag is active
  /** If interaction.pilotMode: return false immediately (no keyboard move and NO controls.update()).
   *  Otherwise keyboard move (6.6), then controls.update() (damping); returns moved. */
  tick(dt)
  /** 6.14; null = wallBox() (or the flat fallback). Replaces F2's frameSphere. While piloting: stores the request in
   *  #deferred and returns; resumeAfterPilot applies it. */
  frame(box3 | null, { animate = false })
  setView(view)                            // 'front' | 'side' | 'top' | 'reset'; if interaction.pilotMode the caller exits pilot first (B-L25)
  /** I4a: legacy policy (re-centre on every rebuild, legacy reset view). I4b: frames iff reason in
   *  {'boot','open','import','new','restore'} (Q6). While piloting: records the reason in #deferred and returns. */
  onWallRebuilt({ reason })
  getPose() / setPose(p)                   // { position: Vector3, target: Vector3 }: pilot save and v2 viewport.orbit
  /** From I4b (C45): a spec 03 StageAnchored participant (id 'orbit'). Moves controls.target and the camera together by
   *  the stage shift (−ΔO), unrecorded; while piloting it shifts the saved pose instead. Clamped to |v| ≤ 1,000,000. */
  translateStage(dx, dz)
  /** Pilot exit: setPose(saved); controls.update() once (re-syncs OrbitControls' spherical state from the restored pose);
   *  then applies #deferred (the I4a re-centre, or an I4b frame) and clears it. */
  resumeAfterPilot(saved)
}
```

`PilotController` saves `orbit.getPose()` on entry and calls `orbit.resumeAfterPilot(saved)` on exit. Persistence (5.5.2) uses `getPose`/`setPose` too. **D5 adds these two methods to the Phase-1 controller first** (formulas in 6.15), so persistence does not wait for I4a; I4a keeps the signatures.

**Removed by I4a:** the custom spherical controls. 08 P2-9h (dt), P2-9i (presets exit pilot) and P2-11c (layout framing) are kept as behaviour; no tag or key is retired here (C21). I4a runs after 08 P2-9g-i and P2-11c, so it ports their code instead of racing it.

#### 5.4.4 `interaction/ViewportInput.js` and `InputState.js` (changed)

- **`attachShortcuts()`:** a single `keydown` handler on the document. `matchShortcut(e, platform, 'global')` (3.8 matching rule, flags, typing guard, dialog rule) returns an action id, dispatched to the `actions` map. `App` injects the core actions; features add theirs with `registerActions(map)` (looked up at dispatch time, so registration order does not matter):

```js
{ 'gizmo.translate': () => gizmo.setMode('translate'), 'gizmo.rotate': ..., 'gizmo.space': ...,
  'pilot.toggle': ..., 'escape': () => this.#runEscapeHandlers(), 'history.undo': () => history.undo(), 'history.redo': ...,
  'project.save': () => session.saveFile(), 'project.open': () => projectPanel.openPicker(),
  'view.frame': () => orbit.frame(selection.gizmoTarget?.bounds?.() ?? null), 'help.shortcuts': () => shortcutHelp.open() }
registerActions(map)                       // features: 'debug.normals', 'uv.toggleViewer', 'sections.delete', 'pivot.toggleSelect', 'hdri.*', ...
registerEscapeHandler(priority, fn)        // fn: () => boolean; unique priorities; run in descending order until one returns true (3.8)
```

  It replaces 08 P2-9b's filters (kept as behaviour) and deletes the `isShortcutIgnoredTarget` re-export (C18).
- **`attachPointer()`:** pointer events (algorithm in 6.4).
  - A **capture-phase** `pointerdown` listener on `canvas.parentElement` records the press `{x, y, button, pointerId, onHandle: false, multi: false}` and adds the pointer to `#active`. If another pointer is already active, the current press is marked `multi: true` (a pinch or a two-finger pan is never a click). Capture-phase listeners on an ancestor always run before any target-phase listener on the canvas, so the record exists before `TransformControls` or `OrbitControls` see the press, whatever their registration order.
  - `markHandleDown()` sets `onHandle = true` on the current press. `TransformGizmo` calls it from the controls' `mouseDown` event, which fires inside the controls' own `pointerdown` handler for the same press, even with no movement.
  - `pointerup` on the canvas picks only if `button === 0`, travel < 4 px, `!press.onHandle`, `!press.multi` and not in pilot: `selection.pickAt(e, {mode: e.shiftKey ? 'add' : (mod(e) ? 'toggle' : 'replace')})`. `pointerup` and `pointercancel` remove the pointer from `#active`. A `window` `pointerup`/`pointercancel` listener also clears the press record, so a press released outside the canvas never completes a later click (02 CR-07-b).
  - `pointerdown`/`pointermove` update `interaction.snapHeld`; a `pointermove` with no buttons while a gizmo is attached calls `sceneManager.invalidate('pointer')` (5.3).
  - In pilot mode, the pilot handlers stay as in Phase 1, and the gizmo is inert (5.4.2).
  - Clicking a gizmo handle never changes the selection (AC 45).
- **`KeyboardState.attach()`:** `keydown` ignores events with `ctrlKey || metaKey || altKey` and `isMovementBlockedTarget(e.target)` targets (3.8). `keyup` is never filtered. `blur` and `visibilitychange` (hidden) clear all keys.

### 5.5 (d) Serializer, validator, session

#### 5.5.1 `io/ProjectSerializer.js` (created as v2 by 08 P2-13e; completed here)

```js
export class ProjectSerializer {
  /** @param {{palette: {sectionColors, legacySectionColors?}, brand: {jsonGenerator}, appVersion, limits}} deps */
  constructor(deps)
  /** @param {Project} project
   *  @param {{variant: 'file'|'zip'|'history'|'autosave',
   *           viewport?: {orbit: {position, target}, previewWindow: {width_px, height_px}},
   *           assets: {get(id): {meta, dataUri: string|null} | null},
   *           textureNames?: (string|null)[],   // zip only: 08 P2-6 textureFileNames(sections), skipped entries null
   *           hdriZipPath?: string | null,      // zip only, F5: 'hdri/<name>' when the HDRI file is included (05 5.11 g)
   *           maxInlineAssetBytes?: number}} opts
   *  @returns {object} v2 object, key order of 4.2. ONE writer for every variant. No clock. */
  write(project, opts)
  /** @param {unknown} data   already JSON.parse'd
   *  @param {{exportLimits?: {maxSide, maxArea}}} [opts]
   *  @returns {{ok, project: object|null, issues: Issue[], sourceVersion: 1|2, scope: 'wall'|'full'}} */
  read(data, opts)
}
```

- **08 P2-13e** writes the `file` and `zip` variants for the Phase-2 subset (C25). **D4** adds the `history` and `autosave` variants. **D5** starts writing `project` and `viewport` (no revision bump, C25). **D6** adds the `zip` storage of logo assets.
- **Retired:** nothing. 08 retired `Strategies.zipJsonIncludesAngleOffset` (P2-6a), `Strategies.importValidation` (P2-3b) and the `ProjectSerializer.js#write`/`#read` tags (P2-3a, P2-6a, P2-13e) (C21).
- **`read()` order:** `detectVersion`, then `migrateV1toV2(data, {palette})` if v1 (it produces the wall keys only; `ProjectSession` merges them with the live project, 6.9), then `validateProject`.

#### 5.5.2 `app/ProjectSession.js` (new; absorbs 08's `ProjectIO.#applyV2`)

```js
export class ProjectSession {
  /** @param {{project, serializer, assets: AssetStore, wallController, cameraController, cameraHub, personController,
   *           carController, pilot, selection, orbit, previewWindow, ledTiles, sceneManager, bus, notifier,
   *           downloader, brand, JSZip, win,
   *           reportImport: (r: {fileName, sourceVersion, issues}) => void,
   *           features?: {pivot?, uv?, hdri?, carModel?, stage?, measurements?, lens?, innerFrustum?}}} deps
   *  reportImport: App binds ui/ImportReport.showImportReport(dialog, r) (app/ may not import ui/).
   *  features: an extensible hook map (C41); each feature registers its step-3 hydrator when it lands (03 4.4, 04 5.3,
   *  05 5.3; 09: stage hydrates the `production` key, measurements, lens = the X3 camera keys, innerFrustum). */
  constructor(deps)
  /** Late binding, called once by App after both exist (History needs the session; the session records through History). */
  attachHistory(history)
  /** True while apply() runs. History ignores every record while it is true, so the use cases that apply()
   *  reuses (setPreviewEnabled, setVisible, ...) never record, and autosave is never scheduled mid-apply. */
  get applying()
  /** @returns {string} JSON.stringify(serializer.write(project, {variant, viewport, assets})) */
  capture(variant = 'history')
  /** capture('history') !== #cleanSnapshot. #cleanSnapshot is taken after openFile, saveFile, newProject and
   *  restorePrevious. Read by Autosave's beforeunload guard (5.6.2). */
  get dirty()
  /** True while the project is still exactly what newProject() produced (capture('history') === #newSnapshot);
   *  #newSnapshot is cleared by openFile and restorePrevious. Read by Autosave (6.11). */
  get isPristineNew()
  /** Hydrate live state from a VALIDATED v2 object (order below). Never called with unvalidated input.
   *  Body runs with #applying = true (try/finally). */
  apply(v2, { reason, scope = 'full' })    // reason: 'open'|'import'|'undo'|'redo'|'restore'|'new'
  async openFile(file)                     // .json or .zip; size guard; parse; read; on error -> notifier (atomic);
                                           // for a .zip, before apply: features.hdri.provideZipEntries(entries under hdri/)
                                           // (05 5.11 h); then apply + exactly one history.record('Open "<name>"')
                                           // + reportImport (3.5)
  saveFile()                               // blurs a focused typing target first (commits its pending change event), then
                                           // downloader.saveText(JSON.stringify(write(variant 'file'), null, 2), brand.files.json, ...)
  newProject()                             // apply(defaultV2, {reason: 'new'}) + history.record('New project')
  /** Restore banner: v = autosave.restorePrevious(); if (v) { apply(v, {reason: 'restore'}); history.record('Restore session') }
   *  autosave.resolvePrevious(). History is not reset, so earlier edits stay undoable. */
  restorePrevious()
  setName(raw)
}
```

**`apply` order** (direct calls, R2; the whole body runs with `applying === true`):
1. If pilot is active, call `pilot.toggle()`. This exits pilot cleanly (08 P2-4) and restores the orbit (`orbit.resumeAfterPilot`).
2. `remembered = selection.selectedIds`, then `selection.deselect()`.
3. Domain hydration in place (no events except Feature 3's, no rebuild):
   - `wall.replaceAll(sections, {nextSectionId})`, `project.meshMode`;
   - F3: `features.pivot.assign(v.pivot)`, which emits `WALL_PIVOT_CHANGED {source: 'import', rebuilds: true}` before the rebuild of step 7 (03 4.4);
   - F4: `features.uv.assign(v.uv)` (each section's `uv_transform` arrives with the sections);
   - `display.assign(...)`. The view-only fields (`show_grid`, F3 `show_pivot_marker`, F5 `hdri.quality` and `hdri.backdrop`) keep their **live** values when `reason ∈ {undo, redo}` or `scope === 'wall'`;
   - `panelIdStyle.assign(...)`;
   - `logos.replaceAll(...)` (images from `AssetStore`; empty for a wall-scope import);
   - `camera.assign(lens)`: filmback, filmback size and focal length only. **Not the pose and not `enabled`.**
   - F5: `features.carModel.syncFromModel()` (05 5.11 h) and `features.hdri.restore(v.hdri, {reason})`;
   - 09 (each when its item lands): `features.stage.assign(v.production)`, `features.lens.assign(...)` (the X3 camera keys), `features.innerFrustum.assign(v.display.inner_frustum)`, `features.measurements.assign(v.measurements)`;
   - `project.meta` (scope `full` only; 09 adds `client` and `templateId`).
4. **Preview state first:** if `v.camera.enabled !== cine.enabled`, call `cameraController.setPreviewEnabled(v.camera.enabled)`. Turning the preview on runs `resetPose()` (ARCHITECTURE 6.5 P-PREVIEW, legacy 4235-4237), which overwrites the pose with the wall-centre reset pose.
5. **Poses second (C30, 08 A4):** `cameraController.applyImportedPose(pose)` (08 P2-13e: `cine.assign(pose)`, `CAMERA_POSE_CHANGED {source: 'import'}`, `hub.refresh()` if enabled, else a one-shot flag that makes the next `setPreviewEnabled(true)` keep this pose instead of resetting it), then `personController.applyImportedPose(...)` and `carController.applyImportedPose(...)` (pose and scale). Writing the pose after step 4 is what keeps a saved pose when Open, Restore, Undo or Redo turns the preview on. The order is unit-tested (8.1, `session.test.mjs`).
6. Other view sync through use cases (their `history.run` calls do not record, because `applying` is true):
   - `cameraController.setSafeDistanceEnabled(v.display.show_safe_distance)` if it differs;
   - `personController.setVisible(...)` and `carController.setVisible(...)` if changed;
   - `ledTiles.clearCache()`.
7. `wallController.rebuild({ reason })`: P1. It calls `orbit.onWallRebuilt({reason})` (from I4a) or the Phase-1 re-centre (before I4a), as legacy import did. Then, if `cine.enabled`, `cameraHub.refresh()`, so the frustum, coverage and preview use the new wall and the restored pose.
8. `bus.emit(PROJECT_REPLACED, { reason, scope })`: panels call `syncFromModel({reason})` (5.10).
9. **Viewport, full scope only:** if `scope === 'full'`, `reason ∈ {open, import, restore}` and `v.viewport` is present: `orbit.setPose(v.viewport.orbit)` and `previewWindow.setSize(v.viewport.preview_window)`. A wall-scope (v1) import skips this step, so the orbit keeps the framing that step 7 gave it, exactly as legacy import re-centred. Undo and redo skip it because history snapshots carry no viewport.
10. Re-selection: `selection.selectMany(keep, {origin: 'api'})`, where `keep` is the remembered ids that still resolve and are selectable (5.4.1). Ids of provider families (F2 `section:`) are kept only for `undo` and `redo`, because after open or import an equal numeric id names an unrelated section (02 CR-07-d); static ids (camera, props, pivot, HDRI point) are kept for every reason.
11. `sceneManager.invalidate('project-applied')`.

Spec 09 (if accepted) adds the reasons `share` and `template` in its own tasks (09 T6.2, T7.2): step 3 keeps the live view-only values for them as for `undo`/`redo`, step 9 does not run (no `viewport`), and 6.14 frames the wall as for `new`.

The caller (`openFile`, `newProject`, `restorePrevious`) then records exactly one entry; `History.apply` (undo/redo) records none. Either way, autosave is scheduled once, by `History`'s `onCommitted` (5.6).

**No hard dependency on Track 3.** `apply` uses two members that Track 3 reimplements later. D5 adds both to the classes that exist after Phase 2, so D5 waits for neither I4a nor R2:
- `OrbitController.getPose()`/`setPose()` on the Phase-1 spherical orbit (adapter formulas in 6.15). I4a keeps the signatures on `OrbitControls`.
- `PreviewWindow.setSize({width_px, height_px})` on 08 P2-10's window: `clampPreviewSize`, the window's inline size, and the same inner-box renderer resize its handle performs. R2 keeps the method and drops the renderer resize.

**Wall-scope import** (v1, 6.9). `live = JSON.parse(this.capture('history'))`; `v2 = { ...live, sections, mesh_mode (only if truthy), pivot: identity (F3), uv: defaults (F4), assets: [] }`, with every section's `logo: null`; `validateProject(v2)`; `apply(project, {reason: 'import', scope: 'wall'})`. The history variant has no view-only fields and no viewport, and step 3 keeps the live view-only values for `scope: 'wall'`, so display is kept exactly (4.6).

**`ProjectIO` changes:**
- `exportJSON()` delegates to `session.saveFile()`.
- `importFromInputEvent(e)` delegates to `session.openFile(e.target.files[0])` and keeps the synchronous `e.target.value = ''` reset (V-7). 08's `#applyV2` is deleted; its order lives on in steps 4-5.
- `exportZIP()` keeps 08 P2-1c/P2-6's structure (pre-check, `textureNames`, late re-write) and writes `Brand.files.json` from `serializer.write(project, {variant: 'zip', textureNames, hdriZipPath, ...})` plus `assets/<id>.<ext>` files (D6) and, when Feature 5's export toggle is on, `hdriController.zipEntry()` (05 5.11 h).
- `ProjectIO`'s deps gain `canvasFits: (w, h) => boolean`. `App` binds `canvasProbe.fits` (6.12), because `app/` may not import `render/`. Before E3 it is 08's `TextureAtlas.canvasFits`.
- `WallController.applyImport` is removed; `ProjectSession.apply` replaces it. Feature specs that extend `applyImport` (03 4.4, 04 5.3) extend `apply` step 3 instead (D0).

#### 5.5.3 `app/AssetStore.js` (new)

```js
export class AssetStore {
  /** @param {{digest: (bytes: Uint8Array) => Promise<string>, logoLoader, win}} deps
   *  digest = bytes => sha256Hex(bytes, {subtle: win.crypto?.subtle}) from core/sha256.js (C23), injected by App. Web Crypto
   *  exists only in secure contexts (HTTPS Pages, localhost), so LAN HTTP testing (iPad) uses the pure-JS path. */
  constructor(deps)
  /** kind 'logo' only. Delegates to 08's LogoLoader.load({file}): allowlist and PNG conversion, 2 MB cap on the stored bytes
   *  (M-LOGO-2), the 64-distinct-image cap (M-LOGO-3, via LogoLibrary.distinctImageCount), SVG sanitising, decode check
   *  (M-LOGO-1). A refusal rejects with the loader's message and stores nothing. id = 'a_' + hex.slice(0, 16); dedupes by id.
   *  Every logo held has a dataUri, so the file variant can always inline it. @returns {{id, meta}} */
  async addFile(file, kind)
  async addFromDataUri(meta, dataUri)      // import: 08 parseLogoDataUri + LogoLoader.load({dataUri}); sha256 recomputed (mismatch -> warning)
  async addFromBlob(meta, blob)            // ZIP import
  addMissing(meta)                         // storage 'missing': metadata only
  get(id)                                  // {meta, blob|null, objectUrl|null, dataUri|null} | null
  async loadImage(id)                      // HTMLImageElement; rejects on error or 0x0 natural size (08 P2-13a's guard kept)
  list()
}
```

Assets are never evicted during a session, because history snapshots may still reference them. Feature 5 receives the same `digest` function from `App` (05 5.3), so it does not depend on `AssetStore`.

#### 5.5.4 XSS (B-M4)

08 P2-3a owns the fix: `escapeHtml` in every `ui/` template, `setTitleWithWarning` for the live title patch, `legacyHtml` deleted. **D7** only adds static rule S1 (5.13), so no later template can regress. No tag is left to retire (C21).

### 5.6 (e) History and autosave

#### 5.6.1 `app/History.js` (the only undo stack)

```js
export class History {
  /** @param {{session: ProjectSession (capture, apply, applying), bus, clock?: () => number,
   *           limits?: {maxEntries: 100, maxBytes: 33554432}, onCommitted?: () => void}} deps
   *  clock: App passes () => win.performance.now(): monotonic, used only for the coalescing window. It is never Date-based,
   *  so the harness's frozen Date (8.3) cannot merge separate edits. */
  constructor(deps)
  reset()                                  // states = [session.capture('history')]; labels = ['']; index = 0; emit (boot only)
  /** The way a use case records: runs fn; run() calls nested inside fn are absorbed, and only the outermost one records,
   *  once, after fn returns, with its own label and options. Returns fn's result. Exceptions propagate; nothing is recorded. */
  run(label, fn, { coalesceKey = null, coalesceMs = 750 } = {})
  /** Low-level record for outermost-only callers (ProjectSession after apply, PilotController). Ignored while a run() is
   *  open (#depth > 0), while session.applying, and while History applies undo/redo. */
  record(label, { coalesceKey = null, coalesceMs = 750 } = {})
  begin(label) / commit() / cancel({ revert = true } = {})   // transactions: gizmo drags only
  undo() / redo()
  get canUndo(); get canRedo(); get undoLabel(); get redoLabel()
  get recording()                          // false while session.applying, while History applies undo/redo, and inside run()
}
```

`History` emits `HISTORY_CHANGED` and calls `onCommitted()` after every record, undo and redo. `App` wires `onCommitted` to `autosave.schedule()`, a direct call, not an event subscriber (R3). Algorithm in 6.10.

**Record points.** Each use case wraps its body in `history.run(label, () => { ... }, opts)`. A use case that calls another one (for example `setPreviewEnabled(true)`, which runs `resetPose()`) therefore makes **one** entry with the outer label ("Camera preview on"), never "Reset camera". Feature specs add rows.

| Use case | Label | `coalesceKey` |
|---|---|---|
| `WallController.addSection` / `deleteSection(id)` | `Add section` / `Delete section "<name>"` | - |
| `WallController.commitSectionEdit` (field) | `Edit <Field> (<name>)` | `section:<id>:<field>` |
| `WallController.setSectionColor` | `Change colour (<name>)` | `section:<id>:color` |
| `WallController.commitRename` (plus the panel-IDs-off path) | `Rename section` | `section:<id>:name` |
| `setMeshMode` / `setWireframe` / `setShowFrame` / `setLedSim` / `setLedLayout` / `setPanelIds` | `Mesh mode: <m>` / `Wireframe on/off` / ... | - (duplicates are skipped by snapshot equality) |
| `setPanelIdStyle` (+ `rebuildIfPanelIds`) | `Panel ID style` | `panelIdStyle:<key>` |
| Logo upload / clear / position / scale | `Set logo (<name>)` / ... | `logo:<id>:scale` for scale |
| `CameraController.setPreviewEnabled` / `setFilmback` / `commitCameraField` / `resetPose` / `setSafeDistanceEnabled` | `Camera preview on/off` / `Filmback` / `Camera <field>` / `Reset camera` / `Safe distance on/off` | `camera:<field>` for fields |
| Gizmo drag (any Selectable) | `selectable.historyLabel` | transaction (`begin` on `mouseDown`, `commit` on `mouseUp`) |
| Pilot flight and look | `Pilot camera move` | `camera:pilot`, `coalesceMs: 2000`; recorded by `PilotController` (`record`) when a movement key is released and at the end of each mouse-look drag |
| `PropController.setVisible` / `setField` | `Show person` / `Person <field>` | `prop:<id>:<field>` |
| `ProjectSession.openFile` / `newProject` / `restorePrevious` / `setName` | `Open "<file>"` / `New project` / `Restore session` / `Rename project` | - |
| F1 (01 T9b) | `LED side (<name>)` / `Flip LED side (N sections)` (02 T27 later relabels them when it moves the controls) | `section:<id>:faceOrientation` / - |
| F6 (06 T10) | `Morph mark on PNG on/off` | `panelIdStyle:brandMarkOnExport` |
| F5 car (05 T11/T12; 05 5.12 is the source) | `Car model` / `Car paint` / `Car finish` / `Car reflections` (the env source) | - / `car:paint` / - / - (only the paint colour coalesces) |
| Feature rows | 02: offsets (`section:<id>:offset.<path>`), batch edits, duplicate, reorder, lock, delete; 03: pivot (`pivot:<field>`): **one entry per pivot commit, which includes the re-expression of camera, props, HDRI point, measurements and orbit** (every `translateStage` write, C59); 04: UV fields (`uv:<id>:<field>`), one entry per drag, one for Copy to all (H1 from the start on path A, C58); 05: HDRI fields (`hdri:<field>`); 09: the rows of 09 §5.5 | per feature |
| **Not recorded** | grid toggle, orbit/views, selection, gizmo mode/space, pilot toggle itself, preview window resize, card collapse, debug view (F1), UV viewer state (F4) | - |

#### 5.6.2 `app/Autosave.js`

```js
export class Autosave {
  /** @param {{session, prefs: Prefs, bus, notifier, win, clock: () => number, keyPrefix: 'morph-led-configurator',
   *           debounceMs: 1500, maxInlineAssetBytes: 1000000, enabled: boolean}} deps
   *  Storage: Autosave reads win.localStorage itself, inside try/catch, at construction and on every access (rule S2 names
   *  this file; App never passes a storage object). A throwing getter means enabled = false and state 'unavailable'.
   *  clock is Date.now and is used only for saved_at; the debounce uses win.setTimeout (real timers). */
  constructor(deps)
  /** Boot: move ':current' to ':previous' (6.11). @returns {{savedAt, sections, missingAssets} | null} for the banner */
  rotateOnBoot()
  schedule()                               // debounce; status 'pending'
  flush()                                  // write ':current' unless session.isPristineNew; quota fallback (6.11); status 'saved' | 'error'
  restorePrevious()                        // @returns validated v2 | null (atomic: invalid -> null + warning)
  resolvePrevious()                        // after Restore or Discard: delete the previous-session slot; un-pause
  setEnabled(on)                           // persists prefs.autosave
  /** true when enabled and the state is not 'unavailable', 'paused' or 'error'. */
  get active()
  /** 'pagehide' and visibilitychange(hidden) -> flush().
   *  'beforeunload' -> if (!this.active && session.dirty) { e.preventDefault(); e.returnValue = '' } (the browser's own prompt). */
  attachLifecycle(win, doc)
}
```

Emits `AUTOSAVE_STATUS`.

### 5.7 (f) three.js upgrade path

#### 5.7.1 Recommendation and timing

- **Stay on r128 through Feature 5, then upgrade (Q1 default, C13).** Run U1-U3 as their own track after Feature 5 ships; U0 may land any time after D2. The reasons:
  1. **The owner chose r128** for the refactor, and Phase 1 and Phase 2 rely on r128 pixel parity (decision D2).
  2. **Feature 5 is complete for r128.** 05's Option L keeps every legacy material bit-identical and converts only its new scene-referred content in its own shader. Its port to current three is small and already written down (05 6.11).
  3. **Workstream B does not need the upgrade.** The r128 `examples/js` builds of `OrbitControls` and `TransformControls` load as classic scripts, behind the factory of 5.7.4, so I1-I4 run on r128 and U1 later swaps only the factory's delivery branch.
  4. **Clean attribution.** Doing the upgrade as one short series of re-baselines, after the features, keeps every golden diff attributable.
- **Cost accepted.** 05's HDR decoding, PMREM and colour code is touched twice: once on r128, once in U3b. The API changes U2/U3 must absorb, for planning:
  - colour management: `outputEncoding`/`encoding` became `outputColorSpace`/`colorSpace` (r152);
  - HDR loading: `RGBELoader` defaults to HalfFloat (r131); `RGBEEncoding` removed (r136); the loader is renamed `HDRLoader` (r180);
  - PMREM: half-float targets (r136), cube render targets (r187);
  - lights: physically correct by default (r155), legacy mode removed (r165), `PointLight.decay` 2 (r147);
  - addon packaging: `examples/js` removed (r148); `TransformControls.getHelper()` (r169).
- **Alternative (if the owner answers Q1 "upgrade first").** U0-U3 move before Feature 5, and 05 is rewritten for the target release (`HDRLoader`, `colorSpace`, PMREM, `forceSinglePass`; Option G from the start). Estimated +3-5 days on Feature 5 and Feature 5 starting later.
- **Target version:** the newest release at least 4 weeks old at implementation time (r187 is the latest listed in the official migration guide at the time of writing). Pin the exact version in the importmap.
- **Out of scope:** `WebGPURenderer`. The app stays on `WebGLRenderer`.

#### 5.7.2 Steps (each its own commit and its own harness run)

| Step | Change | Expected golden result |
|---|---|---|
| **U0** (after D2) | Export **and canvas** colours stop using `THREE.Color`: `domain/hexColor.js hexToRgb` (exact `#rrggbb` parsing to `/255`). `App.colorToRgb` becomes `hexToRgb`. `LEDPixelTextureFactory` paints its CSS strings and its `(r + g + b) / 3` brightness from `hexToRgb(color)` with the legacy templates unchanged (`rgb(${c.r * 255}, …)`), so every string is byte-identical on r128. Requires D2: only validated hex reaches the domain. | Identical. Unit tests prove value equality with r128 `Color.setStyle` for the palette and 4,096 random hex values, and string equality of the painter templates. |
| **U1** | Delivery only, same version: `index.html` replaces the `three.min.js` `<script>` and the two r128 control scripts with an importmap (`"three": "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js"`, `"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/"`; r128 `examples/jsm` already imports the bare specifier `'three'`). `js/vendor/three.js` becomes `import * as THREE from 'three'; export default THREE; export { THREE };`. `vendor/three-addons.js` switches its delivery branch to ESM imports (5.7.4). JSZip stays a classic script. | **Identical** (same engine code). Any diff is a delivery bug: fix it, never re-baseline. |
| **U2** | Version bump to the target with the **legacy colour pipeline**: `ColorManagement.enabled = false`, set in `js/vendor/three.js` immediately after the import. That module body runs before any importer's body (ES module evaluation order), so no `Color` is created before the flag is set, including the `Color`s that R4 allows in constructors. `renderer.outputColorSpace = LinearSRGBColorSpace` in `SceneManager.init`; `forceSinglePass = true` on the two DoubleSide-transparent materials (`CameraRigView` fill, `SafeDistanceView` floor) to keep r128's single pass (two passes since r149); WebGL2 check (5.9.3); map `"three"` to the `.min.js` module build. | Exports (obj/mtl/gltf/json/png/zip), DOM state, dialogs and console **identical**. `screenshot` outputs may differ (shader, precision, mipmap and sorting changes). Re-baseline screenshots only, after review (8.5). |
| **U3** | Colour management on: remove the two overrides (default `ColorManagement.enabled = true`, `outputColorSpace = SRGBColorSpace`). Set `texture.colorSpace = SRGBColorSpace` on every 2D-canvas and image texture (LED tiles, panel-ID canvases, logos, the safe-distance label sprite). Hex inputs to `THREE.Color` are now converted to linear, which is correct for opaque materials. Raw vertex colours are **not** converted automatically, so the safe-distance floor builds its two colours with `new Color().setRGB(r, g, b, SRGBColorSpace)` before writing the attribute. The still capture switches to the default-framebuffer path (6.1). | Screenshots only. Exports identical (U0). Expected differences: transparent overlays (blending now happens in linear space: frustum fill, safe-distance floor, prop transparency); LED-sim and panel-ID screenshots (minified sRGB textures are now filtered in linear space, which changes the average brightness of dot patterns and thin lines). Opaque colour-mode wall colours stay within 2 levels (AC 24). |
| **U3b** | 05 6.11 port: adopt Option G (renderer tone mapping and sRGB output), delete `ColorManagement.patchSceneReferred`, replace the manual `LinearTosRGB` with `#include <colorspace_fragment>`, `toneMapped: false` on LED and HDRI materials, `HDRLoader` through the factory, `scene.environmentRotation` where 05 says so. | HDRI and car screenshots (05's RB scenarios) only. |

#### 5.7.3 What breaks in this codebase, r128 to current

| Area | Code (refactored module) | r128 | Current | Action, step |
|---|---|---|---|---|
| UMD global | `index.html`, `vendor/three.js` | `three.min.js` sets `window.THREE` | `build/three.js` and `three.min.js` removed (r160) | importmap + ESM shim, U1 |
| Addons and loaders | `vendor/three-addons.js` | `examples/js` classic, writing to `THREE.*` | `examples/js` removed (r148); jsm only | the factory's ESM branch, U1 |
| Module namespace | every `THREE.X` reader | mutable global object | frozen namespace (assignment throws) | none: Phase 1 code never assigns to `THREE`; the static check forbids `THREE.<x> =` |
| Colour pipeline | `SceneManager.init` | `outputEncoding = LinearEncoding`; `Color` stores raw sRGB | `ColorManagement.enabled` and sRGB output (r152) | U2 legacy overrides, U3 removal |
| Texture colour space | `LEDPixelTextureFactory`, `LEDMaterialFactory`, `SafeDistanceView` | `encoding = LinearEncoding` | `colorSpace = NoColorSpace` default | U3 sets `SRGBColorSpace` |
| Colour components read as numbers | `App.colorToRgb` (exports), `LEDPixelTextureFactory` (CSS paint strings, brightness) | `new THREE.Color(s)` gives raw sRGB components | linear components when CM is on | U0 `hexToRgb` |
| Raw vertex colours | `SafeDistanceView` floor (2698-2700) | written as-is, displayed as-is | treated as linear, displayed lighter | U3: `setRGB(r, g, b, SRGBColorSpace)` |
| Render-target colour output | `PreviewPass.capture` | the target texture's `encoding` selects the shader output encoding; tone mapping as the canvas | render targets get linear output and no tone mapping | U3: stills render through the default framebuffer (6.1) |
| DoubleSide + transparent | `CameraRigView` fill (2426), `SafeDistanceView` floor (2719-2721) | single pass | separate back/front passes (r148/r149) | `forceSinglePass = true`, U2 |
| WebGL1 fallback | `SceneManager.init` | WebGL1 when WebGL2 is missing | WebGL2 only (r163) | capability check, boot error, U2 |
| Lights | `SceneManager` ambient 0.3 + point 0.8 | legacy units | physically correct (r155), `PointLight.decay` 2 (r147) | none for unlit materials; U3b for Feature 5's car |
| Texture clones | `LEDPixelTextureFactory.tile` (`master.clone()`) | separate GL upload per clone | shared `Source`/`TextureSource` (r138/r186) | none; memory drops; verify dispose counts (8.1) |
| Mipmaps | canvas textures | per filter | always when `generateMipmaps` (r170) | none |
| Quaternions | `PilotCameraDriver` (`lookAt`, `rotateZ`) | - | expected normalized (r158) | none expected |
| Raycast recursion | `SelectionManager`, `TransformGizmo` | default non-recursive | default recursive (r133) | none (`false` passed explicitly) |
| `TransformControls` | `TransformGizmo` | `extends Object3D`; `scene.add(controls)`; no `getRaycaster` | `extends Controls`; `scene.add(controls.getHelper())` (r169); `getRaycaster()`, `reset()` | the factory (5.7.4) |
| `OrbitControls` | `OrbitController` | keys only via `listenToKeyEvents` (r125) | same; wheel-while-rotating dropped (r134) | none |
| Context attributes | `SceneManager` | `alpha: false`, `stencil: true` | alpha channel always (r137), `stencil: false` (r163) | none (opaque clear, no stencil use) |
| Payload | `index.html` | `three.min.js` about 0.6 MB | `three.module.min.js` + `three.core.min.js` | map `"three"` to the `.min.js` module build from U2 |

#### 5.7.4 Vendor addon and loader shim (one module, both delivery modes; C14)

```js
// js/vendor/three-addons.js — the ONLY module that knows addon packaging and version differences.
// Classic mode (r128; I3 until U1):
//   - OrbitControls.js and TransformControls.js are classic <script>s in index.html after three.min.js
//     (https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/…, exact version, integrity + crossorigin),
//     read from window.THREE (cdnjs hosts only three.min.js; jsdelivr hosts examples/js for 0.128.0);
//   - loaders are injected lazily as classic <script>s with SRI on first use (05's lazy loader, moved here), via the
//     injected doc (the only DOM use in vendor/), then read from window.THREE.
// ESM mode (U1+): static imports for the controls; dynamic import('three/addons/…') for loaders.
export function createAddons({ doc }) -> {
  createOrbitControls(camera, domElement),          // -> OrbitControls instance
  createTransformControls(camera, domElement),      // -> { controls, root, raycaster: Raycaster|null }
                                                    //    root = controls.getHelper ? controls.getHelper() : controls
                                                    //    raycaster = controls.getRaycaster ? controls.getRaycaster() : null
  async createGltfLoader(),                         // F5 car
  async createHdrLoader(),                          // RGBELoader (r128..r179) / HDRLoader (r180+), same API surface for 05
  async createExrLoader(),                          // F5; r128 classic mode loads examples/js/libs/fflate.min.js (global
                                                    // fflate) before EXRLoader.js, with the SRI values of 05 5.3 (05 5.11 d)
  async createRoomEnvironment(),                    // F5 studio environment
}
```

`App` calls `createAddons({doc})` once and injects the result. `TransformGizmo` uses `root` for `addHelper(root, raycaster ? {} : { layer: 'default' })`. If `raycaster` is not null, it sets `raycaster.layers.set(LAYERS.HELPERS)`. A loader that fails to load rejects with `Error('Failed to load <name>')`, which Feature 5 reports through the Notifier.

### 5.8 (g) CI and deploy

#### 5.8.1 `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push: { branches: ['refactor/**', 'feature/**'] }   # main is checked by pages.yml (it calls this workflow)
  pull_request:
  workflow_call:
permissions: { contents: read }
# In a called workflow, github.workflow is the CALLER's name, so the run inside pages.yml ("Deploy Pages-refs/heads/main")
# never shares a group with a direct CI run ("CI-refs/…"), and a PR or branch run can never cancel a deploy's checks.
concurrency: { group: '${{ github.workflow }}-${{ github.ref }}', cancel-in-progress: true }
jobs:
  checks:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262   # v4.4.0 (pinned by SHA, Q13)
        with: { fetch-depth: 0 }          # css-slices / oracle tests may read index.html@cd3fd3f
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020   # v4.4.0
        with: { node-version: '22' }
      - name: Static checks
        run: |
          node tests/static/check.mjs
          node tests/static/css-slices.mjs --report-only   # report-only from the first markup/CSS change on (S7)
      - name: Unit tests
        run: node --test "tests/unit/**/*.test.mjs"
```

No `npm install` and no `package.json` (zero dependencies, as today). G1 pins every action by commit SHA with its tag in a comment (Q13) and adds `.github/dependabot.yml` (`package-ecosystem: github-actions`, weekly), which keeps the pins current; `pages.yml` and `golden.yml` (G2, G4) pin theirs the same way. GOLDEN-dependent unit tests skip with a message when `GOLDEN_DIR` is absent (REFACTOR_PLAN 7). Until the first intentional markup or CSS change lands (08 P2-3/P2-8, Feature 1 or E1, whichever is first; 5.12 R8), the css-slices step runs without `--report-only`.

#### 5.8.2 `.github/workflows/pages.yml`

```yaml
name: Deploy Pages
on: { push: { branches: [main] }, workflow_dispatch: {} }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: false }   # queued, never cancelled
jobs:
  checks:
    uses: ./.github/workflows/ci.yml
  deploy:
    needs: checks
    runs-on: ubuntu-24.04
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - uses: actions/checkout@v4
      - name: Assemble site (allowlist)
        run: |
          mkdir _site
          for p in index.html css js assets favicon.svg favicon.ico; do [ -e "$p" ] && cp -r "$p" _site/; done
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: _site }
      - id: deployment
        uses: actions/deploy-pages@v4
```

- **Owner action (once):** Settings → Pages → Source = **GitHub Actions**.
- **Allowlisting:** it keeps `tests/`, `docs/`, `tools/` and the git-ignored `Morph Brand Assets/` out of the site.
- **Hardening (Q13):** pin actions by commit SHA. The repo is public.
- **Caching:** GitHub Pages serves with `Cache-Control: max-age=600`. For up to 10 minutes after a deploy, a browser can mix cached old modules with new ones. **Mitigation (task G5, optional):** the deploy step rewrites `index.html`'s `js/main.js` and `css/*.css` references with `?v=$GITHUB_SHA`. Deeper relative imports still rely on the cache expiring. The residual risk is accepted and documented in the README.

#### 5.8.3 `.github/workflows/golden.yml`: differential golden master (08 §8.1 in CI)

This job runs 08 §8.1's procedure (C26) on GitHub's runner. It adds no second protocol and no second gating flag.

```yaml
name: Golden master
on:
  pull_request: { types: [opened, synchronize, reopened, labeled] }
  schedule: [{ cron: '0 4 * * 1' }]
  workflow_dispatch: {}
permissions: { contents: read }
jobs:
  golden:
    if: github.event_name != 'pull_request' || contains(github.event.pull_request.labels.*.name, 'golden')
    runs-on: ubuntu-24.04
    timeout-minutes: 90
    env:
      BASE_SHA: ${{ github.event.pull_request.base.sha }}
    steps:
      - uses: actions/checkout@v4
        with: { path: head, fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - name: Base worktree
        run: git -C head worktree add ../base "${BASE_SHA:-origin/main}" && mkdir -p out
      - run: google-chrome --version
      - name: Baseline = the parent commit's output (base code, base harness; 08 §8.1 step 0)
        run: node base/tests/regression/run.mjs --root base --out out/base
      - name: Candidate (head code, head harness; always a full run, 08 §8.1 step 2)
        run: node head/tests/regression/run.mjs --root head --out out/head
      - name: Expected-change manifests added or modified by this PR
        run: |
          git -C head diff --name-only --diff-filter=AM "${BASE_SHA:-HEAD}...HEAD" -- tests/regression/expected/ \
            | sed 's#^#head/#' | paste -sd, - > out/manifests.txt
      - name: Gate (08 §8.1 step 3)
        run: |
          M="$(cat out/manifests.txt)"
          node head/tests/regression/compare.mjs out/base out/head ${M:+--expect "$M"} --json out/report.json
      - name: Harness-only check (runs when the PR changes tests/regression outside expected/)
        run: |
          if git -C head diff --quiet "${BASE_SHA:-HEAD}...HEAD" -- tests/regression ':!tests/regression/expected'; then exit 0; fi
          node head/tests/regression/run.mjs --root base --out out/base-new-harness
          M="$(cat out/manifests.txt)"
          node head/tests/regression/compare.mjs out/base out/base-new-harness ${M:+--expect "$M"} --json out/harness-report.json
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: golden-${{ github.run_id }}, path: out/, retention-days: 14 }
```

How it works:
- **Same machine.** Base and head run on the **same runner and the same Chrome**. Baselines are machine-specific (README "Limitations"), so this is the only meaningful CI comparison. Promotion (08 §8.1 step 5) stays local: no baseline is committed.
- **Manifests are the declaration.** Every golden-changing PR commits its manifest first: `tests/regression/expected/<commit-id>.json` in 08's format (08 §8.2: `expect` entries with `change` and optional `each`, plus `mayChange`). This spec's steps name theirs `07-<task>.json` (8.4). The job passes every manifest the PR adds or modifies to `compare.mjs --expect`, so an undeclared difference fails, and so does a declared change that did not happen. New scenarios are declared as `{ "output": "<scenario>/**", "change": "added", "each": true }`. The PR body is never read, so there is no script-injection surface.
- **Weekly and manual runs** have no base SHA, so they compare `origin/main` with itself and pass no manifest. Any FAIL there is nondeterminism: the run is a **flake detector**, and its report is triaged like a bug.
- **Code-coupled harness changes** (C26). The baseline runs with the base commit's own harness. A PR that changes how an **existing** scenario steps or records therefore lands as a **harness-only PR** first, and the job's last step proves it on the base code: the new harness on the old code must equal the old harness on the old code, except for outputs its manifest declares (normally none). Only then may a code PR rely on the new harness. A code PR may add new scenarios (declared `added`) but never edits the steps of existing ones. Example: G6 widens the `gizmo_drag` colour locators so they also find `TransformControls`' handles, and must leave every output of the hand-written gizmo identical; I3 then lands on it (8.3).
- **`--json <file>`** (G3) writes a machine-readable report next to the console output. It is a report format, not a gate.
- **Chrome on the runner (task G4).** The ubuntu-24.04 image restricts unprivileged user namespaces through AppArmor, which Chrome's sandbox uses. G4 verifies that the harness's headless Chrome launches there. If it does not, the job either sets `kernel.apparmor_restrict_unprivileged_userns=0` with `sudo sysctl` (preferred) or passes `--no-sandbox` to the harness (CI only; the harness loads only the local static server).
- **Runtime:** a full local run takes about 3.2 minutes; two or three runs plus setup fit well inside the 90-minute limit. G4 records the measured CI time in the README. PRs touching only `docs/` skip the job through the label rule.

### 5.9 (h) Errors, accessibility, budgets

#### 5.9.1 `ui/Notifier.js` and `ui/Dialog.js`

```js
export class Notifier {
  /** @param {{doc, win, clock?: () => number}} deps   owns #toast-stack, #toast-region and #toast-alerts (static markup)
   *  clock defaults to () => win.performance.now(): monotonic, used for the 2 s dedupe window and auto-dismiss.
   *  Displayed times (none today) would use Date. */
  constructor(deps)
  /** Appends the toast to #toast-alerts (error) or #toast-region (others); appends {level, title, message} to
   *  #toast-stack[data-toast-log] (last 50). @returns {{dismiss(): void, update(patch): void}} */
  notify({ level = 'info', title = '', message, details = null, actions = [], timeoutMs, dedupeKey = null })
  info(message, opts) / success(message, opts) / warn(message, opts) / error(message, opts)
  /** Phase-1 `dialogs` interface (createDialogs(win) replacement): warn-level toast, same text. Every 08 call site
   *  (`dialogs.alert(M-…)`) therefore reaches the Notifier unchanged. */
  alert(message)
}
export class Dialog {
  constructor({ doc })
  /** @returns {Promise<string>} the chosen action id; 'cancel' on Esc */
  open({ title, body /* Node | plain string rendered via textContent */, actions /* [{id, label, primary?, danger?}] */ })
}
```

- **`dialogs` injection:** `App` passes `notifier` wherever Phase 1 and spec 08 inject `dialogs`: `PilotController`, `ProjectIO`, `WallController` (M-SEC-1) and `SectionLogosPanel` (M-LOGO).
- **Message sites** (texts verbatim from spec 08, C27; E2 changes only the channel and level):

| Source | Text | New channel |
|---|---|---|
| legacy 2788, kept by 08 3.6 | `Enable Safe Distance 3D visualization first` | `notifier.warn(text)` |
| legacy 3479, kept by 08 3.6 | `Enable Camera Frustum Preview first to use Pilot Mode` | `notifier.warn(text, { actions: [{ label: 'Enable preview', run: enablePreview }] })`; `enablePreview` is a callback `App` injects into `PilotController` (`() => cameraController.setPreviewEnabled(true)`) |
| legacy 5005, kept by 08 (V-5) | `Error parsing JSON file: ${err.message}` | error toast from `ProjectSession.openFile` |
| 08 M-EXP-1, M-EXP-2, M-EXP-3 | 08 3.3 | error toasts with `[Details]` (the stack) |
| 08 M-EXP-4 | 08 3.3 | warning toast after a successful ZIP download |
| 08 M-IMP-1..4, M-IMP-6 | 08 3.3 | error toasts; the project is unchanged (atomic) |
| 08 M-IMP-5 | 08 3.3 line format | before D8: a warning toast with the full text in `[Details]`; from D8: the import-report dialog (3.5) |
| 08 M-SEC-1 | `A wall can have at most 200 sections.` | warning toast (and the disabled-button title, 3.9) |
| 08 M-LOGO-1, M-LOGO-2, M-LOGO-3 | 08 3.3 | error toasts |

- `ui/dom.js createDialogs` is deleted.
- **Confirmations.** E2 gives the injected `dialogs` object `confirm(text): Promise<boolean>`, implemented with `Dialog` (actions OK / Cancel; Esc cancels). Feature 2's delete command (02 `sectionCommands.deleteSelected`) awaits it; if Feature 2 has landed, E2 changes that one call site.
- **Static rule S3** (5.13) forbids calls to the global `alert`, `confirm` and `prompt` in `js/`.

#### 5.9.2 Export error handling (on top of 08 P2-1)

08 P2-1a already wraps every export in `ProjectIO.#runExport(label, fn)`, which catches, reports M-EXP-1 and logs the error; P2-1c adds the canvas pre-checks (`TextureAtlas.canvasFits`) and M-EXP-2/3/4. E3 changes only the reporting and the probe:

```js
async #runExport(label, fn) {                 // 08's method, reporting changed by E3
  try { const r = await fn(); notifier.success(`Exported ${r.fileName}`); if (r.skipped?.length) notifier.warn(M_EXP_4(r.skipped)); return true }
  catch (err) { notifier.error(M_EXP_1(label, err), { details: String(err && err.stack || err) }); win.console.warn(err); return false }
}
```

- **Busy state is UI-owned.** `ExportPanel` and `ProjectPanel` wrap each call in `withBusy(button, () => projectIO.exportZIP())` (new in `ui/dom.js`). It sets `aria-busy` and `disabled`, swaps the label to `Exporting...`, awaits the call, and restores the button.
- **Canvas probe.** `ProjectIO`'s injected `canvasFits(w, h)` becomes `TextureAtlas.canvasFits(w, h) && canvasProbe.fits(w, h)` (6.12): the hard limits first (pure), then a lazy probe at the requested size, so a device limit below the hard limit (iOS) is reported as M-EXP-2 before any work instead of as M-EXP-3 after it.
- **Retired:** nothing. 08 P2-1a/c, P2-5a and P2-13a retired the B-H3, B-L4, B-M1 and B-L35 tags (C21).

#### 5.9.3 Global errors, context loss, boot failures

- **`ui/ErrorReporter.attach(win)`:**
  - window `error` and `unhandledrejection` produce `notifier.error('Unexpected error: ' + message, { dedupeKey: message })`;
  - at most 3 per minute, measured with the injected monotonic clock (`performance.now`);
  - the browser console output stays unchanged.
- **`SceneManager.init()`:**
  - Wraps `new THREE.WebGLRenderer` in try/catch. On failure it calls the injected `onFatal({ kind: 'webgl' })`, which shows `#boot-error`.
  - On the `webglcontextlost` canvas event it calls `preventDefault()` (which lets the browser restore the context), sets `#contextLost`, skips rendering, shows the overlay "3D view paused: the graphics context was lost. Recovering..." and starts a 10 s timer.
  - On `webglcontextrestored` it clears the timer and calls `onRestored()`. `App` wires that to `wallController.rebuild({reason: 'context-restored'})`, `cameraHub.refresh()`, Feature 5's `hdriController.onContextRestored()` and `carModelController.onContextRestored()` (05 5.11 j), and `invalidate`; the overlay hides. No user action is needed or offered, because a button cannot restore a context the GPU reset.
  - If the timer fires first, it calls `onRecoveryTimeout()`: the overlay text becomes "The 3D view could not recover." with a `[Reload page]` button (`win.location.reload()`). Autosave, when active, already holds the work.
- **`js/boot.js`:** a classic `<script src="js/boot.js">` before the three.js scripts and the module script.
  - It sets a 15 s timer: if `document.documentElement.dataset.appReady !== '1'`, it shows `#boot-error` with the CDN message.
  - `App.start()` sets `appReady = '1'` as its last step.
  - It loads no libraries, has no `import`/`export`, and is the only file allowed to use `document` and an id lookup outside the usual allowlist (5.13 S8).

#### 5.9.4 Accessibility implementation

`ui/dom.js` changes. These helpers are the **only** element-scoped `keydown` listeners in `js/ui/` (rule S5):
- `setToggle(el, on)` exists from 08 P2-13c and is used by every `syncFromModel`;
- `bindSwitchKeys(el)`: `Space`/`Enter` calls `el.click()`, with `preventDefault`. X1 moves 08 P2-13c's per-toggle handler into this helper (same behaviour);
- `bindRovingRadio(container, { onSelect })`: roving `tabindex`, arrows move focus and selection, `Space` selects (the colour swatches);
- `bindButtonKeys(el)`: `Enter`/`Space` calls `el.click()` (section headers with `role=button`);
- `bindScopedKeys(el, scope, actions)`: dispatches `KEYMAP` rows of `scope` (3.8) for keydowns inside `el`; marks `el` with `data-key-scope` (so movement keys are blocked there, 3.8) and applies the scope's propagation rule.

Markup and CSS changes are listed in 3.9. **Retired:** nothing. 08 P2-13c (B-L36) and P2-8d (B-L13) retired those rows; B-L24 belongs to Features 1 and 6 (C21).

#### 5.9.5 Performance budgets and texture guards

| Metric | Budget | Measured by |
|---|---|---|
| Idle renders | 0 over a 1 s window that starts 3 s after the last input (the damping tail ends within about 2 s, 5.3) | `#perf-hud[data-frames-rendered]`; harness `render_on_demand` |
| Orbit frame time, `large_wall` (3,200 panels) combined, 1920×1080, integrated GPU (Iris Xe class) | p95 ≤ 16.7 ms | manual, PerfHud |
| Rebuild, `large_wall`, combined, colour mode | ≤ 50 ms | `performance.measure('wall-rebuild')` shown in the HUD |
| Rebuild with panel IDs, combined | ≤ 300 ms | same |
| Colour-picker drag | ≤ 1 rebuild per animation frame (`WallController.requestRebuild()` coalesces to the next rAF) | counter; `tests/unit/wall-controller.test.mjs` updated |
| Draw calls | ≤ 500 typical; warn above 2,000 panels in panel mode (3.11) | `renderer.info.render.calls` with `info.autoReset = false` and `info.reset()` per frame (two passes) |
| Viewport texture memory (estimated) | ≤ 256 MB total | `TextureBudget.estimateGpuBytes` summed by `LEDMaterialFactory` |
| Viewport section canvases (every mode that uses section canvases) | `SECTION_TEXTURE_BUDGET_PX` = 16,777,216 px **per rebuild** (04 UV-7), each canvas side ≤ min(`capabilities.maxTextureSize`, 4096) (C38) | `fitPxPerLed`, `TextureBudget` |
| Panel mode, default path | one section canvas per section (08 P2-12d, B-M16 fixed), inside the section budget above | - |
| Panel mode, 04's `uv.panel_uvs = 'panel'` option (per-panel canvases) | `PANEL_TEXTURE_BUDGET_PX` = 33,554,432 px **wall-wide** across all panel canvases, **and** each canvas side ≤ min(`maxTextureSize`, 4096). If even 1 px/LED exceeds the total, that rebuild uses the default section-canvas path and shows one warning toast. | `panelModePxPerLed` (6.12) |
| HDRI textures (F5) | 05's `HDRI_LIMITS` (a separate GPU resource), reported into the same perf HUD | 05 |
| Export canvas | 08's hard limits (32,767 px side, 268 MP area), then a lazy probe at the requested size (iOS about 16.7 MP) | `CanvasProbe` (6.12) |
| Leaks | `renderer.info.memory.textures` / `.geometries` return to their post-boot value (±0) after 100 rebuild cycles | harness `perf_leak` (optional) |
| Startup | first wall render ≤ 2 s on a 50 Mbps link with a cold cache | manual |
| History memory | ≤ 32 MB (100 entries) | `History` limits |
| Autosave payload | ≤ 2.5 MB per slot | `Autosave` |

**Retired:** nothing. 08 P2-12d narrowed the `TextureAtlas.js#panelPxPerLed` and `PanelIdRenderer.js#panelCanvas` rows to "only with `uv.panel_uvs = 'panel'`"; 04 UV-9 owns them.

### 5.10 Events added and changed

| Event | Payload | Emitted by | Subscribers (same change; bus rule 7) |
|---|---|---|---|
| `project:replaced` (`PROJECT_REPLACED`) | `{reason, scope: 'full'\|'wall'}` | Created by 08 P2-13e (`{reason: 'import', scope: 'full'}`). From D5: `ProjectSession.apply` step 8, for every reason and scope. | 08's subscribers (`WallDisplayPanel` with its toggles, radios `checked` and selects; `CameraPanel`; `PropControls` ×2), which from D5 also run for v1 imports, so V-2 is fixed at D5; plus, from D5: `SectionListPanel` (render; for `undo`/`redo` it keeps each card's collapsed state by section id, a reappearing section expanded; otherwise `expandFirst`), `SectionLogosPanel` (render), `ProjectPanel` (name), `ViewportToolbar` (grid button), `SceneManager` (invalidate); feature panels add themselves (02 cards, 03 `PivotPanel`, 04 `UVViewer` (04 07-7), 05 `HdriPanel`) |
| `history:changed` (`HISTORY_CHANGED`) | `{canUndo, canRedo, undoLabel, redoLabel, depth}` | `History` | `HistoryControls`; Feature 4's `UVViewer` (↶/↷ state and titles, 04 07-7). Non-visual: `SceneManager` does not invalidate on it (5.3). |
| `autosave:status` (`AUTOSAVE_STATUS`) | `{state: 'idle'\|'pending'\|'saved'\|'error'\|'disabled'\|'unavailable'\|'paused', savedAt, message?}` | `Autosave` | `HistoryControls` (`#autosave-status`), `ProjectPanel` (toggle). Non-visual. |
| `selection:changed` (changed) | `{id, label, ids, kind, origin, modes}` | `SelectionManager` | `ViewportToolbar`, feature panels (02, 03, 04). **Not** `TransformGizmo`: the gizmo is attached by a direct call (5.4.1). |
| `wall:sectionsChanged` (changed) | reason `'import'` no longer emitted from D5 on: every import goes through `ProjectSession.apply` and `PROJECT_REPLACED` (08's v1 path emitted it until then) | - | `SectionLogosPanel` moves to `PROJECT_REPLACED` |
| `camera:poseChanged` (changed) | `source` gains `'gizmo'` (I3; replaces `'gizmo-translate'`/`'gizmo-rotate'`). `'import'` (08 P2-13e) is used by every `apply`. `CameraPanel` writes all six inputs at `toFixed(2)` for both. | - | `CameraPanel` |
| `prop:poseChanged` (changed) | same `'gizmo'` and `'import'` sources | - | `PropControls` |

**Visual or non-visual (C47).** Every event in the `Events` catalogue carries a `visual: true|false` classification, set by the commit that adds it; `SceneManager.NON_VISUAL_EVENTS` is derived from it (5.3) and static rule S9 fails on an unclassified event. This spec's own `HISTORY_CHANGED` and `AUTOSAVE_STATUS` are non-visual.

### 5.11 Bug ids: who fixed them, and what this spec changes

This spec retires **no** `Strategies` key and **no** `LEGACY_SITES` row (C21), except the preview rows when R1/R2 land before 08 P2-10 (C31). Every other id below is first fixed by the 08 commit in its row, which deletes the key, the tag and the row in the same commit (08 §5.1). The 07 task runs after that commit and replaces the mechanism only; the 08 criteria for the id are its regression criteria.

| Bug ids | First fixed by (08; it retires the keys and tags) | 07 task | What the 07 task changes |
|---|---|---|---|
| B-M11 | P2-10a (`previewRendersHelpers`; `PreviewWindow.js#render`, `SceneManager.js#addHelper`), **or R1 if it lands first** (C31) | R1 | The preview camera's `DEFAULT \| ENVIRONMENT` mask replaces P2-10a's visibility loop; if R1 lands first it retires those rows itself |
| B-M9, B-L32 | P2-10b (`previewRendererSize`; `PreviewWindow.js#init`, `#setupResize`), **or R2 if it lands first** (C31) | R2 | Scissor pass in the main canvas; the second renderer deleted; `PreviewFit` used; if R2 lands first it retires those rows itself |
| B-L34 | P2-10c (`CineCamera.js#presetShortName`, `PreviewWindow.js#updateCamera`) | R2 | The label code lives in `PreviewPass.updateCamera`: R2 moves it there if P2-10c landed first; otherwise P2-10c lands there directly and R2 relocates the `#updateCamera` row to `PreviewPass.js#updateCamera` |
| B-M14 | P2-9a (`ViewportInput.js#attachPointer`, `SelectionManager.js#pickAt`) | I2 | Capture-phase press record; picks in any gizmo mode |
| B-L11 | P2-9b (`InputState.js#isShortcutIgnoredTarget`, `ViewportInput.js#attachShortcuts`) | I1 | `KEYMAP` dispatch with exact modifier matching |
| B-M12, B-L22, B-L23, B-L28 | P2-9c-f (`gizmoRotateSign`; `TransformGizmo.js#onMouseMove/#rebuild/#updatePosition`, `Prop.js#translateBy/#rotateBy`, `CineCamera.js#rotateBy`) | I3 | `TransformControls` through the proxy; the hand-written gizmo is deleted |
| B-L26 | P2-9j (`PilotController.js#toggle`, `TransformGizmo.js#rebuild`) | I3 | `gizmo.setPilot(on)` called by `PilotController.toggle` replaces the `PILOT_CHANGED` mirror (also disables the controls) |
| B-L12 | 1C H2 or P2-12a (`dispose.gizmo`) | I3 | `TransformControls.dispose()` in `TransformGizmo.dispose()` |
| B-M13, B-L27, B-L25 | P2-9g-i (`pilotForwardYSign`; `OrbitController.js#tickKeyboard/#setView`, `PilotController.js#tickKeyboard`) | I4a | dt keyboard layer on `OrbitControls`; the preset guard kept; pilot gating of `update()` |
| B-L10 | P2-8c (pilot half, `CineCamera.js#pilotFly`), P2-11c (Z half, `CineCamera.js#translateBy`) | I3, I4a | `setPose` applies the same rules (6.5) |
| B-L2 | P2-11c (`OrbitController.js#updateTargetPosition`, `framingBounds`) | I4a, I4b | `frame()` with `wallBox`; I4b changes the framing **policy** (Q6), which is not a bug fix |
| B-L8, B-M4, B-L16, B-L21 | P2-3a-d (`legacyHtml`, `importValidation`, the B-L8 rows, `SectionListPanel.js#render/#patchCard`, `WallController.js#applyImport`, `SectionLogosPanel.js#constructor`) | D2, D5, D7 | Validator completion; `apply` replaces `applyImport` (logos cleared for a wall-scope import); rule S1 |
| B-M3 | P2-6a (`zipJsonIncludesAngleOffset`) | D4 | More variants on the same writer |
| B-L31 | P2-13e (`ProjectSerializer.js#write`) | D1, D4, D5, D6, D8 | `project`, `viewport`, variants, session, assets, UI |
| B-H3, B-L4, B-L5 | P2-1a-e | E3 | Toasts, busy state, lazy canvas probe |
| B-M1 | P2-5a (`legacyMissingDownloadBlob`, `ProjectIO.js#exportSafeDistanceOBJ`) | E3 | Success toast |
| B-L35 | P2-13a (`SectionLogosPanel.js#onUpload`, `PanelIdRenderer.js#sectionCanvas`) | D6, E3 | `AssetStore` wraps `LogoLoader`; toasts |
| B-L13 | P2-8d (`WallController.js#setMeshMode`, `WallDisplayPanel.js#bind`) | X1 | Focusable radios, `change` handler, `checked` mirror (V-2) |
| B-L36 | P2-13c (`index.html` documentation row) | X1 | `bindSwitchKeys`, focus styling |
| B-L24 | Features 1 and 6 (08 P2-13d only if both slip) | - | not re-fixed |
| B-M16, B-L19 | P2-12d (the default viewport path samples the section canvas; `panelPxPerLed` gets the budget of 6.12) and 04 UV-9 | X3 | `TextureBudget` (the viewport canvas guard) and the `CanvasProbe` use; 08's X3 B-M16 line is a no-op |
| B-L1 | P2-13f (`curveBeforeFirstPanel`, if the owner keeps the convention; 08 A6) | - | C6: no `conventions` key |

**Code this spec deletes** (no `LEGACY_SITES` row involved): `ui/dom.js createDialogs` (E2); P2-10a's visibility loop (R1, if P2-10 landed first); the second renderer (R2); the hand-written gizmo, `CineCamera.rotateBy/translateBy`, `Prop.translateBy/rotateBy` and P2-9j's `PILOT_CHANGED` mirror (I3); the custom spherical orbit (I4a); `ProjectIO.#applyV2` and `WallController.applyImport` (D5).

The preview rows follow C31: whichever of P2-10 and R1/R2 lands first does the retirement. For every other row the order is fixed. If an owner decision ever reverses one of them, the 07 task takes over the 08 commit's retirements, manifest and criteria in full, in one commit; the work is never split between the two specs.

### 5.12 ARCHITECTURE.md amendments required (made with the code, never ahead of it)

| Section | Amendment | Task |
|---|---|---|
| 1.2 Delivery | `#toast-stack` markup (E1); `js/boot.js` (E4); r128 `examples/js` control scripts with SRI after `three.min.js` (I3, I4a); importmap and ESM three (U1); the CSS link order of C52 | E1, E4, I3, U1 |
| 1.4 Frames, curve convention | the frame of every consumer (C60) and the recorded B-L1 decision (C6) | D0 |
| 6.2 rebuild policy | named row ids (`F6-1`, `F3-1..5`, `F2-1..13`, `F4-n`, `F5-1..3`, `X2-1`, …) instead of contested numbers (0.4) | D0 |
| 9 Feature seams | the F3 row is rewritten per 03 §5.9 #2 (no wall root transform; C32) | D0 |
| 1.3 layer table | `vendor/three-addons.js` may use an injected `doc` (loader injection only); `ui` may import `interaction/Keymap.js` (static data) and `core/typingTarget.js`; `domain/hexColor.js` is importable by `io/` and `render/`; `app/` reaches `ui/` and `render/` only through injected callbacks (`reportImport`, `canvasFits`) | I1, I3, U0, D5, E3 |
| 1.5 Imports | bare `'three'` and `'three/addons/…'` specifiers are allowed only in `js/vendor/*` | U1 |
| 1.6 R4 | `TransformGizmo` allocates in `init()` | I3 |
| 1.6 R6 | "no layers": replaced by the layer table of 5.2.1 | R1 |
| 1.6 R8 | "markup byte-identical, CSS contiguous slices": superseded by the first intentional markup or CSS change (08's P2-3/P2-8 markup changes, Feature 1's toolbar buttons, or E1, whichever lands first). D8, X1 and later steps follow the same rule. | the first such step |
| 1.6 R11 | the capture-phase `pointerdown` listener on the canvas parent is order-independent by construction; `TransformGizmo.init()` runs right after `orbit.attach()` | I2, I3 |
| 3.2 Events | `HISTORY_CHANGED`, `AUTOSAVE_STATUS`, and the payload and subscriber changes of 5.10 (`PROJECT_REPLACED` itself is 08 P2-13e's) | D5, H1, H3, I2, I3 |
| 3.5 domain | `assign`/`setPose`/`LIMITS` views; `Project.meta`; `Wall.allocateId`; `LogoLibrary.replaceAll`; `hexColor.js` | D1, D5, D6, U0 |
| 3.7 render | `LAYERS` (four layers: DEFAULT, HELPERS, ENVIRONMENT, DEBUG) and enforcement, `SceneManager` additions, `PreviewPass`, `PreviewWindow` reduction, `CanvasProbe` | R1-R3, E3 |
| 3.8 interaction | `Selectable` v2 typedef (replaces the Phase-1 typedef and 02's hook set), `SelectionManager` v2, `TransformGizmo` (`setPilot`), `OrbitController` (pilot gating, `getPose`/`setPose`), `Keymap`, `ViewportInput` (`registerEscapeHandler`) | I1-I4b |
| 3.9 io | the completions of 08's `ProjectSerializer`, `ProjectSchema`, `ProjectValidator`, `ProjectMigrations` | D1-D4 |
| 3.10-3.11 app/ui | `ProjectSession`, `AssetStore`, `History`, `Autosave`, `Prefs`, the new ui modules, the `ui/dom.js` helpers | D5-D8, H1-H3, E1, X1 |
| 4 State model | radio `checked` becomes a model mirror (`syncFromModel`); `History`/`Autosave` state; orbit state is now `OrbitControls` | X1, H1, I4a |
| 6.1 P1 | step 4 becomes `orbit.onWallRebuilt({reason})` (deferred while piloting); optional `requestRebuild` coalescing | I4a, X4 |
| 6.2 rebuild policy | rows 3, 16 and 19 coalesce per frame (row 8 is 08 P2-8d's) | X4 |
| 6.12 P3 | `renderFrame()` called only by the loop, with on-demand scheduling; the tick updates state only | R3 |
| 7 Bootstrap | construction: `session` → `history` → `session.attachHistory(history)` → `autosave`; `addons = createAddons({doc})`; `canvasProbe` is constructed but allocates nothing until first use; init phase: `orbit.attach()` then `gizmo.init()` (which registers its Escape handler); setupUI: `viewportInput.attachPointer()` registers the capture-phase listener; `autosave.rotateOnBoot()` + banner after `setView('reset')`; `history.reset()` last | D5, H1, H3, I2, I3 |
| 8.2 B-L13 row | the prescribed fix becomes "radio `change` (guarded by 08 P2-8d) + `checked` mirrored from the model on `WALL_MESH_MODE_CHANGED` and `PROJECT_REPLACED`". The old "never radio `change`" rationale no longer holds once `checked` is a model mirror. | X1 |
| 10 Verification contracts | CI runs 08 §8.1's gate (golden.yml, G4) and the harness-only rule (5.8.3); static rules: `js/boot.js` allowlisted for the globals and DOM-id rules (E4); bare specifiers in `vendor/` (U1); `css-slices.mjs --report-only` from the first markup/CSS change (S7) | G1-G4, E4, U1 |

### 5.13 Static check additions (`tests/static/check.mjs`)

| Rule | Check |
|---|---|
| S1 | In `js/ui/**`, every `${` inside a template literal assigned to `.innerHTML`/`insertAdjacentHTML` starts with `${escapeHtml(` (guards 08 P2-3a's fix; task D7). |
| S2 | `localStorage`, `sessionStorage` and `indexedDB` appear only in `app/Autosave.js`, `app/Prefs.js` and `app/HdriCache.js` (Feature 5, C20). |
| S3 | No call to the global `alert`, `confirm` or `prompt` in `js/`: the regex `(?<![\w.$])(alert|confirm|prompt)\s*\(` and `window.(alert|confirm|prompt)` find none (method calls such as `dialogs.confirm(` are allowed). |
| S4 | `'three'` and `'three/addons/…'` are imported only by `js/vendor/*`. No assignment to `THREE.<ident> =` anywhere. |
| S5 | From I1 on: `addEventListener('keydown'` appears only in `interaction/InputState.js` (`KeyboardState`), `interaction/ViewportInput.js` (the global dispatcher), `ui/Dialog.js` and `ui/dom.js` (`bindSwitchKeys`, `bindRovingRadio`, `bindButtonKeys`, `bindScopedKeys`). Before I1, the listeners of features that landed earlier (01 `DebugViewControls`, 02's input, 05 `attachHdriShortcuts`, 08 P2-13c's toggle handler) are allowlisted by file; I1 removes those entries (C17). |
| S6 | Every `KEYMAP` chord tuple `(key\|code, shift, mod, alt)` is unique per scope and platform; Escape handler priorities are unique (also unit-tested). |
| S7 | `css-slices.mjs` runs with `--report-only`, scoped to `01-12`, from the first intentional markup or CSS change on (5.12, R8; C52). The CSS no longer equals the original by design; `css/features/*`, `20-29` and `99-utilities` are never scanned. |
| S8 | `js/boot.js` is exempt from the "no `window`/`document` globals" and DOM-id ownership rules, and must contain no `import` or `export`. |
| S9 | Every `Events` entry has a `visual` classification, and `SceneManager.NON_VISUAL_EVENTS` equals the non-visual set (C47). |
| S10 | 01's render-order rule applies to every spec: no numeric `renderOrder` literal ≥ 900 outside `core/renderOrder.js` (0.4). |

---

## 6. Algorithms and math

Conventions: metres; Y up; the wall faces +Z; the legacy origin is the first section's bottom-left edge (Feature 3 adds the stage frame); angles in the domain are in degrees, and the Euler order is `'YXZ'` (tilt = X, pan = Y, roll = Z). `wrapDeg`, `clamp` and `finiteOr` are 08's `domain/rules.js` functions; `wrapDeg(v) = 180 - ((((180 - v) % 360) + 360) % 360)` maps into (-180, 180].

### 6.1 Preview rectangle and letterbox (device pixels; WebGL origin is bottom-left)

three's `setViewport(x, y, w, h)` and `setScissor` multiply CSS values by the pixel ratio and **floor** them, and the drawing buffer was sized from the integer `renderer.getSize()` (the canvas's `clientWidth`/`clientHeight`). `getBoundingClientRect()` values are fractional. So every rectangle is computed in **integer device pixels** first, and passed to three as `(px + 0.5) / dpr`, which floors back to exactly `px`.

```
dpr = renderer.getPixelRatio()
S   = renderer.getSize(v)                                   // CSS size the drawing buffer was made from (integers)
W   = floor(S.x * dpr); H = floor(S.y * dpr)                // drawing buffer, device px (= gl.drawingBufferWidth/Height)
c   = canvas.getBoundingClientRect(); p = previewWindow.contentRect()   // CSS px, fractional; positions only
X0  = max(round((p.left  - c.left) * dpr), 0);  X1 = min(round((p.right  - c.left) * dpr), W)
Y0  = max(round((p.top   - c.top)  * dpr), 0);  Y1 = min(round((p.bottom - c.top)  * dpr), H)
w   = X1 - X0;  h = Y1 - Y0;  if (w < 50 * dpr || h < 30 * dpr) return             // skip tiny or off-canvas windows
A   = cine.filmbackWidth / cine.filmbackHeight                                        // filmback aspect
{vw, vh} = letterboxRect(w, h, A) rounded: vw = round(vw), vh = round(vh)             // 08 PreviewFit (bars left/right or top/bottom)
vx  = X0 + floor((w - vw) / 2);  vyTop = Y0 + floor((h - vh) / 2)
css(n) = (n + 0.5) / dpr                                                              // floors back to n in three
// pass 1: black bars (the whole window rect)
renderer.setScissorTest(true)
renderer.setViewport(css(X0), css(H - Y1), css(w), css(h)); renderer.setScissor(same)
prevColor = renderer.getClearColor(tmp); prevAlpha = renderer.getClearAlpha()
renderer.setClearColor(0x000000, 1); renderer.clear(true, true, false)
// pass 2: the image
renderer.setViewport(css(vx), css(H - (vyTop + vh)), css(vw), css(vh)); renderer.setScissor(same)
camera.aspect = A; camera.updateProjectionMatrix()                    // equals vw / vh within 1 device px; mask DEFAULT|ENVIRONMENT
sceneManager.withPassHidden(() => renderer.render(scene, camera))    // scene.background clears the scissor box
// restore
renderer.setClearColor(prevColor, prevAlpha); renderer.setScissorTest(false)
renderer.setViewport(0, 0, S.x, S.y)                                 // exactly the main viewport setSize() made
labels: res = `${vw}×${vh} px`                                       // device px, as 08 P2-10c
```

The y flip uses the integer `H`, so the image is never off by one row, and the restore uses `S`, so the main viewport never shrinks by a device pixel (R3's zero-diff gate and AC 3).

**Stills** (`capture({width, height})`, task R4). Callers pass `height = round(width / A)`; the still camera is a clone of the preview camera with `aspect = width / height` and the preview's mask `DEFAULT | ENVIRONMENT` (`0b0101`, 6.2). Both paths run inside `sceneManager.withPassHidden(...)`, so the r128 `TransformControls` root (layer 0) never appears.

- **r128 path (R4, until U3).** The canvas output is display-referred (`LinearEncoding`, no tone mapping; 05 Option L), and r128 takes the output encoding of a render pass from the target texture's `encoding`, so a target with the default `LinearEncoding` produces the same colours as the canvas.
  ```
  rt = renderer.capabilities.isWebGL2 ? new WebGLMultisampleRenderTarget(width, height)   // MSAA, like the antialiased canvas
                                       : new WebGLRenderTarget(width, height)
  renderer.setRenderTarget(rt); renderer.render(scene, stillCam)      // r128 resolves the MSAA buffer after render()
  renderer.readRenderTargetPixels(rt, 0, 0, width, height, buf)       // reads the resolved framebuffer
  copy row y of buf into ImageData row height - 1 - y; putImageData on a 2D canvas; canvas.toBlob('image/png')
  renderer.setRenderTarget(null); rt.dispose(); invalidate('still')
  ```
- **U3 path (colour management and, after U3b, tone mapping).** In current three a render target gets linear output and no tone mapping, so the still renders into the **default framebuffer** instead, inheriting exactly the canvas's MSAA, output colour space and tone mapping:
  ```
  saved = {size: renderer.getSize(v), ratio: renderer.getPixelRatio()}
  renderer.setPixelRatio(1); renderer.setSize(width, height, false)      // drawing buffer only; CSS size untouched
  if (gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height) -> restore; error toast "Frame too large for this GPU"
  renderer.setScissorTest(false); renderer.render(scene, stillCam)
  canvas.toBlob(cb, 'image/png')        // in the SAME task: the bitmap is copied when toBlob is called, before the
                                        // drawing buffer is presented and cleared (preserveDrawingBuffer stays false)
  renderer.setPixelRatio(saved.ratio); renderer.setSize(saved.size.x, saved.size.y, false); invalidate('still')
  ```
  The restore and the next render happen before the browser composites, so the user sees no flicker.
- Both paths: `width`, `height` ≤ `capabilities.maxTextureSize` (r128) or the drawing-buffer limit (U3), checked through `TextureBudget`.

### 6.2 Render layers: tagging, enforcement and audit

```
addHelper(o, {layer = HELPERS}): scene.add(o); roots.push({root: o, layer}); if (layer === 'default') passHidden.add(o)
#enforceHelperLayers() (start of every renderFrame):
   for {root, layer} of roots: if (layer !== 'default') root.traverse(n => n.layers.set(layer))
tagHelper(o): the same traverse, immediately, for the registered root that contains o
masks: main 0b1111 (DEFAULT|HELPERS|ENVIRONMENT|DEBUG); main in pilot 0b1101 (HELPERS off); preview and still 0b0101
audit (?debug=1, every 120 rendered frames):
   every node with userData.helper === true lies under a registered root, else console.warn('unregistered helper', n)
withPassHidden(fn): saved = [...passHidden].map(o => o.visible); passHidden.forEach(o => o.visible = false); try fn() finally restore
```

`withPassHidden` restores each root's **previous** `visible` value, so a gizmo root hidden by `setPilot(true)` stays hidden after a pass.

### 6.3 Render-on-demand loop (from R3)

```
startLoop(tick):
  last = win.performance.now(); renderFrame() once, synchronously (initial #dirty = true, as legacy); request frame
frame(now):
  win.requestAnimationFrame(frame)
  dt = min(max((now - last) / 1000, 0), 0.1); last = now      // 08 P2-9h's range
  tick(dt, now)                                // state only (orbit.tick, pilot.tick, F5 ticks); they call invalidate() iff they changed something
  if (contextLost) return
  camera.updateMatrixWorld()
  camChanged = !equals(camera.matrixWorld, lastMW) || !equals(camera.projectionMatrix, lastPM)   // safety net
  if (dirty || camChanged || continuous.size > 0):
     dirty = false; renderFrame(); framesRendered++        // renderFrame: enforce layers, info.reset(), main pass, passes
     lastMW.copy(camera.matrixWorld); lastPM.copy(camera.projectionMatrix)
bus subscription: for type of Object.values(Events) if !NON_VISUAL_EVENTS.includes(type): bus.on(type, () => invalidate(type))
```

`startLoop` is the only caller of `renderFrame()` from R3 on; the tick never renders.

### 6.4 Click versus drag; picking

```
captureDown(e)  // pointerdown on canvas.parentElement, {capture: true}: runs before every target-phase listener on the canvas
    interaction.snapHeld = e.ctrlKey || e.metaKey
    if (e.target !== canvas) return
    active.add(e.pointerId)
    if (active.size > 1) { if (press) press.multi = true; return }        // a second finger: the gesture is never a click
    press = {x: e.clientX, y: e.clientY, button: e.button, id: e.pointerId, onHandle: false, multi: false}
markHandleDown()  // called by TransformGizmo from the controls' 'mouseDown' event, i.e. inside the controls'
                  // own pointerdown listener for the SAME press (it fires on a handle hit even with 0 px travel)
    if (press) press.onHandle = true
pointermove(e) on canvas:
    interaction.snapHeld = e.ctrlKey || e.metaKey
    if (e.buttons === 0 && gizmo.attached) sceneManager.invalidate('pointer')
pointerup(e) / pointercancel(e) on canvas:
    active.delete(e.pointerId)
    if (e.type === 'pointercancel' || !press || e.pointerId !== press.id) return
    d = press; press = null; travel = hypot(e.clientX - d.x, e.clientY - d.y)
    if (d.button !== 0 || travel >= 4 || d.onHandle || d.multi || interaction.pilotMode) return
    selection.pickAt(e, {mode: e.shiftKey ? 'add' : mod(e) ? 'toggle' : 'replace'})
pointerup(e) / pointercancel(e) on win (bubble phase, so after the canvas handler above; 02 CR-07-b):
    active.delete(e.pointerId)
    if (press && e.pointerId === press.id) press = null     // a release outside the canvas never completes a later click
pickAt(e, {mode}):
    ray = pointerRay.fromEvent(e)                                       // raycaster.layers.enableAll()
    owner = new Map(); list = []
    for s of [...static, ...providers.flatMap(p => p.all())] if s.isPickable(): for m of s.pickMeshes(): owner.set(m, s); list.push(m)
    hits = ray.intersectObjects(list, false)
    if (!hits.length) { if (mode === 'replace') deselect({origin: 'viewport'}); return }
    // hits are sorted nearest first. pickPriority outranks wall (section) hits only (03 5.10.1 #6): a prioritised target
    // behind a nearer section hit wins; among camera, prop, pivot and HDRI-point hits the nearest wins.
    prio = h => owner.get(h.object).pickPriority ?? 0
    isWall = h => owner.get(h.object).kind === 'section'
    h = hits[0]
    if (isWall(h)) { p = hits.find(x => !isWall(x) && prio(x) > 0); if (p) h = p }
    s = owner.get(h.object); id = s.resolveHit ? s.resolveHit(h) : s.id
    if (id === null) return                                             // e.g. a locked section (F2)
    select(id, {mode, origin: 'viewport'})
platformOf(win): /Mac|iPhone|iPad/.test(win.navigator.platform || win.navigator.userAgent) ? 'mac' : 'other'; mod(e) = mac ? e.metaKey : e.ctrlKey
```

A press stays `multi` even if the first finger lifts last, so a pinch whose last finger barely moves never deselects.

**Why this is order-independent.** During dispatch, capture listeners on ancestors run before any listener on the target, so `press` for this pointer-down always exists before the controls' `pointerdown` handler can call `markHandleDown()`. `markHandleDown` marks only that press. Neither the registration order of `TransformControls`, `OrbitControls` and `ViewportInput` on the canvas, nor clock resolution, affects the result. In r128, `TransformControls` registers its `pointerup` on the document; newer releases use the element. That no longer matters either, because the decision is made on the press record, not on `dragging`.

### 6.5 Gizmo proxy conversions, deltas and clamps

`setPose` applies 08's pose rules (C22) through `CineCamera.LIMITS` and `Prop.LIMITS`; it never introduces a bound 08 does not have.

```
Camera getTransform:  position = (posX, posY, posZ); quaternion.setFromEuler(new Euler(rotX·π/180, rotY·π/180, rotZ·π/180, 'YXZ'))
Camera applyTransform(t, phase):
   'start':  start = cine pose copy
   'drag'|'end': e = new Euler().setFromQuaternion(t.quaternion, 'YXZ')
             cine.setPose({ posX: clamp(p.x, ±100000), posY: clamp(p.y, 0, 100000),
                            posZ: clamp(p.z, CineCamera.LIMITS.posZ.min, 100000),
                            rotX: clamp(deg(e.x), -90, 90), rotY: wrapDeg(deg(e.y)), rotZ: wrapDeg(deg(e.z)) })
             (the ±100,000 m writer bounds are 08 P2-13e's; CineCamera.LIMITS holds them since 03 T1, with
              posZ.min = -100000: the Z input's 0.1 minimum belongs to its input rule, not to LIMITS, and 08 P2-11c
              removes it, 08 Q13; a pivot off the wall plane needs posZ below 0.1, 03 4.1)
   'cancel': cine.setPose(start)
Prop getTransform:  position = (posX, gizmoAnchorY, posZ); quaternion from Euler(0, rotY·π/180, 0)
Prop applyTransform: posX = clamp(p.x, ±100000); posZ = clamp(p.z, ±100000);
   rotY = wrapDeg(deg(new Euler().setFromQuaternion(q, 'YXZ').y))                 // rotate shows Y only, so x = z = 0
After every 'drag': gizmo.sync() writes the stored (snapped) pose back into the proxy. TransformControls recomputes
from its own drag-start state on each move, so the snap-back does not accumulate error.
Gimbal: at tilt = ±90° yaw and roll are not unique; the conversion returns a valid equivalent, and the domain keeps it.

Deltas for relative Selectables (F2 sections and groups, F3 pivot, F5 projection point), always from ctx.start:
   translateWorld d = t.position - ctx.start.position
     snap (ctx.snap, single- or two-axis handles): express d in ctx.space axes; for each dragged axis k:
       d_k = round(d_k / inc) · inc, where inc is the target's own increment from ctx.snap (sections translateMm / 1000,
       the pivot pivotM; 02 CR-07-c); axes not dragged stay exactly 0 (03 D9: bit-for-bit)
   rotateWorld dq = t.quaternion · ctx.start.quaternion⁻¹                         // world-space delta, any handle
     single-axis handles (ctx.axis ∈ {'X','Y','Z'}): hW = unit axis, rotated by ctx.start.quaternion when space = 'local'
       w = clamp(dq.w, -1, 1); s = w < 0 ? -1 : 1; angle = 2·acos(s·w)            // shortest arc, [0, π]
       axisW = s·(dq.x, dq.y, dq.z) / sin(angle / 2)   (angle < 1e-9: deltaDeg = 0)
       deltaDeg = deg(angle) · sign(axisW · hW); snap: deltaDeg = round(deltaDeg / snap.rotateDeg) · snap.rotateDeg
     free-rotation handles ('E', 'XYZE', shown by TransformControls only when all three axes are allowed): the
       Selectable uses dq directly (F2: R_new = B⁻¹ · dq · B · R_start, then YXZ Euler); snapping does not apply
   GizmoCtx.axis = controls.axis (r128 and current: 'X' | 'Y' | 'Z' | 'XY' | 'YZ' | 'XZ' | 'XYZ' | 'E' | 'XYZE')

cancelDrag (Esc during a drag, registered Escape handler priority 80), identical for r128 and current three:
   if (!dragging) return
   #cancelled = true                                       // objectChange is ignored until mouseUp
   target.applyTransform(#start, 'cancel', ctx()); recorder.cancel({revert: false}); sync()
   on mouseUp: #cancelled = false; sync()                  // re-sync the proxy from the restored target; no commit
   (controls.reset() is not used: on current three it snaps back once, but `dragging` stays true until pointerup and
    further pointer moves keep transforming the proxy.)

setPilot(on): controls.enabled = !on; root.visible = !on; if (!on) sync()
```

### 6.6 Delta-time movement (B-L27 kept)

```
orbit.tick(dt):
  if (interaction.pilotMode) return false                   // no keyboard move and no controls.update(): update() ignores
                                                            // `enabled` and would lookAt(target) on the pilot camera
  f = (-sin θ, 0, -cos θ) with θ = azimuth of (camera.position - target)   // horizontal forward, legacy convention
  r = ( cos θ, 0, -sin θ)
  v = (W|Up ? f : 0) - (S|Down ? f : 0) + (D|Right ? r : 0) - (A|Left ? r : 0) + (E ? +Y : 0) - (Q ? +Y : 0)
  moved = false
  if (|v| > 0): delta = normalize(v) · MOVE_SPEED_MPS · (Shift ? 2 : 1) · dt
                target += delta; camera.position += delta; invalidate('orbit-keys'); moved = true
  if (controls.update()) moved = true                                          // damping
  return moved
orbit.onWallRebuilt({reason}) / orbit.frame(box): if (interaction.pilotMode) { #deferred = {reason, box}; return }
orbit.resumeAfterPilot(saved): setPose(saved); controls.update(); if (#deferred) apply it under the active policy; #deferred = null
pilot.tick(dt): speedMps = moveSpeed · 60 (legacy per-frame value at 60 Hz); same pattern, forward from the camera quaternion
                (08 P2-9g's sign); writes go through cine.setPose (6.5) from I4a
```

Diagonal movement is normalized. Legacy moved √2 faster diagonally; this is an intentional, non-golden-visible change, because the harness does not hold two movement keys at once. While piloting, the orbit camera is never touched: the pilot camera's quaternion is unchanged across idle frames (AC 55).

### 6.7 Validator coercion rules

```
num(v):           typeof v === 'number' ? v
                : typeof v === 'string' && /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(v) ? Number(v)
                : NaN
finiteValue(v, d): x = num(v)
                   Number.isFinite(x) ? (typeof v === 'string' ? (issue coerced, x) : x)
                 : v === undefined ? d                                 // missing: silent default
                 : (issue defaulted, d)                                // NaN, ±Infinity, '1e400', wrong type
                  // the finiteness test runs AFTER coercion, so '1e400' (Infinity) can never pass, even into a
                  // field whose range is "any finite number"
number(spec, v):  x = finiteValue(v, spec.default); if (spec.int && !Number.isInteger(x)) { x = Math.round(x); issue rounded }
                  if (spec.wrap180) { y = wrapDeg(x); if (y !== x) issue wrapped (info); x = y }
                  else if (x < spec.min || x > spec.max) { x = clamp(x, spec.min, spec.max); issue clamped }; return x
                  (spec.min/max may be ±Infinity: "any finite number", e.g. camera rotation_deg.y)
bool(v, d):       v === true || v === false ? v : v === 'true' ? (coerced, true) : v === 'false' ? (coerced, false) : (defaulted, d)
name(v, i):       s = typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? (coerced, String(v)) : (defaulted, default)
                  s = sanitizeText(s, spec.maxLength) (C28, 08 domain/rules.js): strip the C0/C1 controls and the bidi
                  controls U+202A-U+202E and U+2066-U+2069 (sanitized if changed); no trim; at most maxLength UTF-16 code
                  units, never splitting a surrogate pair (truncated); empty -> `Wall ${i + 1}`.
                  project.name additionally trims (C28).
hex(v, d):        /^#[0-9a-f]{6}$/i -> lower; /^#[0-9a-f]{3}$/i -> expand + lower (coerced); else (sanitized, d)
enum(spec, v):    spec.values.includes(v) ? v : (defaulted/warning, spec.fallback)
object(v):        isPlainObject(v) = v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
                  (JSON.parse always yields such objects); else defaulted
keys:             every own key in {'__proto__', 'constructor', 'prototype'} -> dropped-unknown (never read via v[key] on input)
derived keys:     skipped on read (4.2), no issue
budget (warning only):
                  TextureBudget.fitPxPerLed(totalLedX, totalLedY, exportLimits).fits === false, or Σ columns·rows > 20,000
```

### 6.8 Section id reassignment (B-L8)

The v1 migration has already filled each missing id with its array index (`s.id !== undefined ? s.id : i`, legacy V-3; 4.6), and a v2 section without an id gets the same default. 08 P2-3b implements this algorithm; revision 3 adds the range cap (D0 edits 08 §6.5).

```
MAX_ID = 2147483647                                                  // 2³¹ − 1
valid(x) = Number.isInteger(x) && x >= 0 && x <= MAX_ID
used = new Set()
for (s of sections): if (valid(s.id) && !used.has(s.id)) used.add(s.id)        // the first occurrence of each valid id keeps it
next = used.size ? max(used) + 1 : 0
for (s of sections in order): if (s.id is not the first occurrence of a valid id) {
    from = s.id; s.id = nextFree(); used.add(s.id); issue reassigned-id {from, to: s.id} }
nextFree(): while (next <= MAX_ID && used.has(next)) next++
            if (next <= MAX_ID) return next++
            return the smallest n >= 0 with !used.has(n)                         // fallback at the top of the range
wall.nextSectionId = nextFree()                    // recomputed on every apply; the file does not store it
Wall.allocateId(): the same nextFree() over the live ids
```

The first occurrence of each id keeps its id, so logos and selections keyed by it stay attached. Ids only need to be unique within a project, so recomputing `nextSectionId` (instead of persisting it) is safe: `revalidate()` drops selections of ids that no longer exist. Without the cap, a file holding id 2147483647 would make `next` = 2³¹, outside the valid range, and the next validation would renumber that section again; with it, every assigned id is valid, so validation is idempotent. 08's harness checks still hold: `concave_offsets` keeps ids 3, 7, 2 with no issue; `import_edge` (iv) `[1, 1, 2, missing]` gives `[1, 4, 2, 3]` with one `reassigned-id`.

### 6.9 v1 migration

```
migrateV1toV2(data, {palette}) ->
  colors = palette.legacySectionColors ?? palette.sectionColors                // 06 4.3
  sections = data.sections.map((s0, i) => {
     s = isPlainObject(s0) ? s0 : ({} with issue defaulted at sections[i])
     return { name: s.name || `Wall ${i + 1}`,
              id: s.id !== undefined ? s.id : i,                                  // legacy default; 6.8 resolves collisions
              panel: { columns: s.panel?.columns || 5, rows: s.panel?.rows || 3,
                       width_mm: s.panel?.width_mm || 500, height_mm: s.panel?.height_mm || 500 },
              led_resolution: { x: s.led_resolution?.x || 32, y: s.led_resolution?.y || 32 },
              curvature: { angle_degrees: s.curvature?.angle_degrees || 0,
                           angle_offset_degrees: s.curvature?.angle_offset_degrees || 0 },
              color: s.color || colors[i % colors.length],
              logo: null } })                                                     // feature keys absent: their defaults apply
  return { scope: 'wall', wall: { sections, mesh_mode: data.mesh_mode || null }, issues: [migrated] }
                                                // null keeps the current mode (legacy); an unknown truthy value becomes
                                                // 'combined' with a `defaulted` warning in the validator (4.3, 08 §4.3)

ProjectSession, wall scope (5.5.2):
  live = JSON.parse(this.capture('history'))                    // capture() returns a string; parse before spreading
  v2   = { ...live, sections: m.wall.sections, ...(m.wall.mesh_mode ? { mesh_mode: m.wall.mesh_mode } : {}),
           pivot: IDENTITY_PIVOT (F3), uv: UV_DEFAULTS (F4), assets: [] }    // each section's logo is already null
  r    = validateProject(v2, opts); issues = [...m.issues, ...r.issues]
  r.ok ? apply(r.project, {reason: 'import', scope: 'wall'}) : reject atomically
```

(`s.panel?.columns` evaluated on a non-object `s` throws in legacy. Here a non-object `s` is replaced by `{}` with a `defaulted` warning.) The view-only fields and the viewport are absent from the history variant, and `apply` keeps their live values for `scope: 'wall'` and skips the viewport step, so a v1 import changes nothing but the wall and the logos (4.6).

### 6.10 History

```
recording = !session.applying && !applyingHistory && depth === 0
run(label, fn, opts):
  depth++
  try { result = fn() } finally { depth-- }                 // an exception propagates; nothing is recorded
  if (depth === 0) record(label, opts)                      // only the outermost run records
  return result
record(label, {coalesceKey = null, coalesceMs = 750} = {}):
  if (session.applying || applyingHistory || depth > 0) return   // apply suspension; nested run() absorbed
  if (txn) { if (label === txn.label) return; commit() }    // a different action ends the open transaction first
  snap = session.capture('history')
  if (snap === states[index]) return                        // no-op edit (also double clicks, no-op drags)
  t = clock()                                               // performance.now(): monotonic, never the harness's frozen Date
  if (coalesceKey && coalesceKey === lastKey && t - lastTime < coalesceMs && index === states.length - 1 && index > 0)
       states[index] = snap; labels[index] = label
  else { states.length = index + 1; labels.length = index + 1; states.push(snap); labels.push(label); index++ }
  lastKey = coalesceKey; lastTime = t
  while (states.length > maxEntries || bytes(states) > maxBytes) { states.shift(); labels.shift(); index-- }   // bytes = Σ 2·length
  emit HISTORY_CHANGED; onCommitted()
begin(label): if (txn) commit(); txn = {label}
commit():     if (!txn) return; t = txn; txn = null; record(t.label)       // ALWAYS records; equality makes a no-op drag free
cancel({revert = true} = {}): if (!txn) return; txn = null; lastKey = null
              if (revert) apply(states[index], 'undo')                     // gizmo Esc passes revert: false (the Selectable restored itself)
undo():       if (txn) cancel(); if (index === 0) return; index--; apply(states[index], 'undo'); lastKey = null; emit; onCommitted()
redo():       if (index === states.length - 1) return; index++; apply(states[index], 'redo'); lastKey = null; emit; onCommitted()
apply(s, reason): applyingHistory = true; try { session.apply(JSON.parse(s), {reason, scope: 'full'}) } finally { applyingHistory = false }
```

- **Nested use cases:** `setPreviewEnabled(true)` runs `resetPose()`; both bodies are `run()` calls, so only "Camera preview on" is recorded, once (AC 58).
- **Gizmo drag:** `begin` on `mouseDown`; the Selectable's `'drag'` writes never call `record`; `commit` on `mouseUp` records exactly one entry (AC 29). A drag that ends where it started records nothing (equality). Ctrl+Z is ignored during a drag (`notWhileDragging`, 3.8); `undo()`'s `cancel()` is only a defence.
- **Pilot:** no transaction. `PilotController` calls `record('Pilot camera move', {coalesceKey: 'camera:pilot', coalesceMs: 2000})` when a movement key is released and at the end of each mouse-look drag. Field edits made in the sidebar during pilot are separate entries.
- **Open / New / Restore:** `ProjectSession.apply` runs with `session.applying === true`, so the use cases it reuses record nothing. The caller then records exactly one entry (AC 44).

Because history snapshots omit `viewport`, the view-only fields and the derived keys, undo never moves the orbit camera or flips view toggles. `ProjectSession.apply` with reason `undo`/`redo` keeps the live values of those fields.

### 6.11 Autosave

```
rotateOnBoot():
  cur = readRaw(':current')                           // string | null (a getItem throw -> state 'unavailable')
  if (cur !== null):
     try { remove(':previous'); set(':previous', cur); remove(':current'); slot = ':previous' }
     catch (e) { slot = ':current'; paused = true; emit {state: 'paused', message: 'restore pending'} }
                                                      // copy failed (quota): the old session stays in ':current' and
                                                      // autosave writes nothing until the banner is resolved
  else slot = ':previous'
  prev = parse(read(slot)); return prev ? { savedAt: prev.saved_at, sections: prev.project.sections.length, missingAssets } : null
schedule(): pending = true                          // remembered even while paused or disabled
            if (!enabled || paused) return; clearTimeout(timer); timer = setTimeout(flush, debounceMs); emit {state: 'pending'}
flush():
  if (!enabled || paused || !pending) return
  clearTimeout(timer); pending = false
  if (session.isPristineNew) { emit {state: 'idle'}; return }   // never overwrite the pre-New work with an untouched New
  payload = {format: 'morph-led-autosave', v: 1, saved_at: clock(), app_version, project: write(variant 'autosave')}
  try storage.setItem(':current', JSON.stringify(payload)); emit {state: 'saved', savedAt}
  catch (e) if quota(e):  payload.project = write(variant 'autosave', maxInlineAssetBytes: 0)        // drop inline logos
                          try again; on success emit saved + warn once ("logos not included in autosave")
                          else emit {state: 'error'} + warn once ("Autosave paused: browser storage is full")
            else: emit {state: 'error', message}
quota(e) = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)
restorePrevious(): v = serializer.read(parse(read(slot)).project)   // storage is untrusted input: full validation
                   return v.ok ? v.project : (warn; null)
resolvePrevious(): try { remove(slot) } catch {}; paused = false; if (pending) schedule()
Restore (ProjectSession.restorePrevious): v = restorePrevious(); if (v) { session.apply(v, {reason: 'restore'});
         history.record('Restore session') }; autosave.resolvePrevious()        // history is NOT reset
Discard: autosave.resolvePrevious()
beforeunload(e): if (!active && session.dirty) { e.preventDefault(); e.returnValue = '' }
                 active = enabled && state ∉ {'unavailable', 'paused', 'error'}
```

The previous-session slot is written only by `rotateOnBoot`, so a new session can never overwrite the last session before the user decides. Peak usage during rotation is two copies of one slot (at most 2 × 2.5 MB on an origin shared with the owner's other Pages sites); a failure is handled by the pause above, never by losing the old session.

**Accidental New.** After New, `:current` still holds the pre-New work until the user edits the new project, because `flush` skips the untouched New state. A reload in between therefore offers the pre-New work in the banner. Once the user edits after New, autosave resumes; the pre-New state then stays reachable with Ctrl+Z in this session only.

**Multi-tab:** last writer wins on `:current`. A tab that receives a `storage` event for `:current` from another tab shows one info toast: "This project is also open in another tab; autosave keeps the most recent tab's changes." This matches open question Q5.

### 6.12 Texture budget and the canvas probe

```
fitPxPerLed(ledW, ledH, {minP = 1, maxP, maxSide, maxArea}):
  p = maxP
  while (p > minP && (ledW·p > maxSide || ledH·p > maxSide || ledW·ledH·p² > maxArea)) p--
  if (ledW·p <= maxSide && ledH·p <= maxSide && ledW·ledH·p² <= maxArea) return {pxPerLed: p, fits: true}
  s = min(maxSide / ledW, maxSide / ledH, sqrt(maxArea / (ledW·ledH)))          // fractional downscale, viewport only
  return {pxPerLed: s, fits: false}                                           // exports must refuse when fits === false

// Section canvases (every mode that uses them): the sum over one rebuild's section canvases stays within
// SECTION_TEXTURE_BUDGET_PX = 16,777,216 (04 UV-7 computes the per-rebuild pxPerLed with fitPxPerLed against it), and each
// side ≤ min(renderer.capabilities.maxTextureSize, 4096) (C38). Export density is unchanged.
panelModePxPerLed({wallPanelLeds, maxLedSide}, {budgetPixels = PANEL_TEXTURE_BUDGET_PX /* 33,554,432 */, maxSide}):
  // Only for 04's uv.panel_uvs = 'panel' option (per-panel canvases); the default panel path samples the section canvas
  // (08 P2-12d). Called once per rebuild with the WALL-WIDE total wallPanelLeds = Σ over sections of
  // columns·rows·ledX·ledY and maxLedSide = max over sections of max(ledX, ledY); the result applies to every
  // panel canvas of that rebuild.
  // maxSide = min(renderer.capabilities.maxTextureSize, 4096): the legacy per-canvas cap (2003) and the common mobile limit
  p = min(floor(sqrt(budgetPixels / wallPanelLeds)), floor(maxSide / maxLedSide), 16)
  if (p >= 1) return {pxPerLed: p, fits: true}
  return {pxPerLed: 0, fits: false}           // even 1 px/LED exceeds the budget (> 33.5 M panel LEDs):
                                              // LEDMaterialFactory uses the section-canvas path for this rebuild + one warning toast
  // default wall, 15 panels of 32²: 15,360 -> min(46, 128, 16) = 16   (legacy max(4, min(16, 128)) = 16: unchanged)
  // 15 panels of 176²: 464,640 -> min(8, 23, 16) = 8                    (legacy 16)
  // large_wall, 3,200 panels of 32²: 3,276,800 -> min(3, 128, 16) = 3   (legacy 16)
  // one panel of 1024²: 1,048,576 -> min(5, 4, 16) = 4 -> 4096 px canvas
estimateGpuBytes(w, h, {mipmaps = true}) = w·h·4·(mipmaps ? 4/3 : 1)

createCanvasProbe({doc, win}).fits(w, h):        // export time only; never at boot, never at import
  if (!TextureAtlas.canvasFits(w, h)) return false            // 08's hard limits first (pure)
  key = `${w}x${h}`; if (cache.has(key)) return cache.get(key)
  if (isIOS(win) && w·h > 16777216) return cache.set(key, false), false   // known iOS canvas area limit, no allocation
  c = doc.createElement('canvas'); c.width = w; c.height = h
  ok = !!c.getContext('2d') && (ctx.fillRect(w - 1, h - 1, 1, 1), ctx.getImageData(w - 1, h - 1, 1, 1).data[3] === 255)
  c.width = c.height = 0                                      // release immediately
  cache.set(key, ok); return ok
  isIOS(win) = /iPhone|iPad/.test(win.navigator.userAgent) || (win.navigator.platform === 'MacIntel' && win.navigator.maxTouchPoints > 1)
```

The probe allocates **only the size about to be exported**, once per size, right before the export would allocate the same canvas anyway. It never runs binary searches over hundreds of megapixels, so it cannot exhaust iOS's canvas memory budget.

### 6.13 Asset ids and SHA-256

`id = 'a_' + hex(SHA-256(bytes)).slice(0, 16)`. A 64-bit prefix makes collisions negligible for the at most 64 logo assets a file can hold (C22). The full digest is kept in `sha256`. Feature 5's HDRI descriptor carries the full digest only (05 4.2).

`core/sha256.js sha256Hex(bytes, {subtle})` (C23; delivered by 08 P2-13e):
- When `subtle` is given (secure contexts: HTTPS Pages and `localhost`), it returns `hex(await subtle.digest('SHA-256', bytes))`.
- Otherwise (for example the dev server opened from an iPad over LAN HTTP, needed for the touch checks in 8.6), it runs a pure-JS FIPS 180-4 implementation over the `Uint8Array` in 64-byte blocks. It is fast enough for logos (≤ 2 MB) and acceptable for Feature 5's HDRIs on a test device.
- Unit test: both paths equal Node's `crypto.createHash('sha256')` for the empty input, `"abc"`, a 1 MB random buffer and lengths 55, 56, 63, 64 and 65 (padding edges).

### 6.14 Frame selection or wall (`F`, open, reset)

```
box = selection.gizmoTarget?.bounds?.() ?? wallBox() ?? flatBox(frameBounds())   // wallBox: Box3 from WallLayout.bounds(), injected by App
c = box.getCenter(); r = max(box.getSize().length() / 2, 0.5)
fov = camera.fov · π/180; fovH = 2·atan(tan(fov/2)·camera.aspect)
d = 1.15 · r / sin(min(fov, fovH) / 2)
dir = normalize(camera.position - controls.target) (keep the current view direction; for boot/open/import/new/restore use (0.3, 0.35, 1))
target = c; camera.position = c + dir·d; controls.maxDistance = max(30, 4·r); controls.update(); invalidate('frame')
```

For the default wall (5 × 3 panels of 500 mm, flat) at fov 50: r = 1.458 m, d ≈ 3.97 m, and the boot position is ≈ (2.33, 2.01, 3.60) around the target (1.25, 0.75, 0) (the 4.2 example).

`wallBox` is `FramingPolicy`'s `wallBox` (C34): transformed, all sections including detached ones, so ceilings are framed. Safe distance D, the frame width and height and "fits" read `stageExtent` (sections with \|n.y\| ≤ 0.9), never this box; the pre-I4b automatic re-target reads `generativeBox`.

### 6.15 Phase-1 orbit pose adapter (D5)

D5 gives the Phase-1 spherical `OrbitController` (after 08 P2-9h and P2-11c) the `getPose`/`setPose` of 5.4.3, so `viewport.orbit` persists before I4a. Its state is `{theta, phi, distance, offset}` with `target = framingCentre() + offset`:

```
getPose(): target = framingCentre() + offset
           position = target + distance · (sin φ · sin θ, cos φ, sin φ · cos θ)      // legacy updateCameraPosition (3857-3862)
setPose({position, target}):
           v = position - target; d = |v|
           if (!(d > 0)) return                                     // the validator already maps target == position to the default
           distance = clamp(d, 2, 30)                               // Phase-1 wheel limits
           theta = atan2(v.x, v.z); phi = clamp(acos(clamp(v.y / d, -1, 1)), 0.1, π - 0.1)
           offset = target - framingCentre(); updateCameraPosition()
```

For any pose the Phase-1 orbit itself produced, `setPose(getPose())` reproduces it to floating-point precision. A pose written after I4a (distance 0.5-30 m or beyond) and opened by an older build is clamped, which changes only the view. I4a re-implements both methods on `OrbitControls` (`controls.target` and `camera.position`) with the same signatures.

---

## 7. Export impact

"After 08" is the export state of 2.9; this table lists only what this spec changes on top of it.

| Output | After 08 | Change in this spec | Task | Notes |
|---|---|---|---|---|
| Project JSON (`Brand.files.json`) | v2 Phase-2 subset (C25), written by 08 P2-13e: sections, mesh mode, display, panel-ID style, camera, props, inline logos (B-L31) | Adds `project` and `viewport`; feature keys as features land (4.4). Every v1 key unchanged. Filename unchanged until Feature 6 (`led-wall-config.json`, then `morph-led-wall.json`). `#export-json` is relabelled "Save Project (.json)" (D8). No timestamp. | D4 (keys), D8 (label) | Logos stay inline `data_uri`. |
| ZIP JSON | Same writer, variant `zip` (B-M3 fixed by 08 P2-6a); `texture_file` per section, `null` when skipped (08 P2-1c) | Logos become `storage: "zip"` with `assets/<id>.<ext>` entries; `atlas.texture_file` once Feature 4 lands. No `zipManifest` (C24). | D4, D6 | The HDRI is added as `hdri/<name>` by Feature 5's own option, with `hdri.source.path` set (05 7.3). |
| ZIP import | - (Open accepts `.json` only) | New: `.zip` accepted by Open. It tries `Brand.files.json` first, then every other `*.json` at the ZIP root in name order, and takes the first one that `detectVersion` accepts (v2, or v1 by `Array.isArray(sections)`), so legacy `led-wall-config.json` ZIPs and Feature 6's renamed files both open. Logos come from `assets/`. | D6 | `too-large`: ZIP over 2 GiB, or a project entry over `MAX_IMPORT_BYTES` (4.7) |
| OBJ / MTL / glTF | 08's fixed geometry, normals, UVs and names | No geometry change. Colours come from `hexToRgb` (U0): byte-identical. Exports never read the scene, so layers and the single renderer cannot affect them. | U0 | Success and error toasts (E3) |
| Panel IDs PNG | Guarded by 08 P2-1c: M-EXP-2/3, no file when over the limits | Same texts as toasts; the lazy probe also catches device limits below 08's hard limits before rendering (5.9.2) | E3 | |
| ZIP textures | Over-limit sections skipped and listed (08 P2-1c, M-EXP-4) | M-EXP-4 as a warning toast after the download | E3 | |
| Safe-distance OBJ | Downloads, faces +Y, mitred (08 P2-5a/b) | Success toast | E3 | |
| Camera frame PNG (new, optional) | - | `<prefix>-camera-<focal>mm-<w>x<h>.png`, layers `DEFAULT` and `ENVIRONMENT`, antialiased, same colour output as the canvas (6.1) | R4 | Previs still. Filename prefix from Brand (Feature 6). |

**Limitation for downstream tools (documented in the README with D4).** A v1 reader of a v2 file sees the **generative** wall: sections, panels, LEDs and curvature, laid out as v1 would lay them out. It does not apply what v2 adds on top of that layout: Feature 2's `offset` and `detached`, Feature 3's `pivot` and Feature 1's `face_orientation`. Once those hold non-default values, the v1 reader's placement and facing differ from the app's. Tools that need the final placement should read the v2 keys or the OBJ/glTF exports (AC 47, Q3).

---

## 8. Testing

### 8.1 Unit tests (Node, `node --test "tests/unit/**/*.test.mjs"`)

Files marked "(08)" are created by spec 08 and extended here.

| File | Cases |
|---|---|
| `serializer-v2.test.mjs` (08) | **Writer:**<br>- key order equals 4.2, including feature keys in their fixed positions whatever their landing order;<br>- `variant` differences (4.2 table);<br>- `totals` equals `Wall.totals()`;<br>- the `zip` variant includes `curvature.angle_offset_degrees` and `texture_file` after `logo` (`null` for a skipped texture);<br>- `project` and `viewport` are written from D5 on without a revision bump (C25);<br>- no timestamp anywhere;<br>- every field of `Project.createDefault()` round-trips: write, read, deep-equal domain (via a pure `toPlain(project)`).<br>**Superset of v1:** the legacy `importJSON` mapping (oracle in `oracle/legacy-io.mjs`) applied to a v2 file yields the same generative wall as the v2 reader (AC 47).<br>**Reader:** the idempotence and fidelity properties of 4.7. |
| `validator.test.mjs` (08) | **Fuzz:** 2,000 seeded random documents built by mutating valid ones, injecting strings, NaN, Infinity, `'1e400'`, `'-1e400'`, `-0`, negatives, fractions, huge numbers, wrong types, nested arrays, deep nesting, and `__proto__`/`constructor`/`prototype` keys. Assertions:<br>- no throw;<br>- output always valid (`validate(output)` has no issues);<br>- `Object.prototype` untouched (`({}).polluted === undefined`);<br>- every number finite and in range, so `JSON.stringify(output)` never writes `null` for a number (the `'1e400'` case of 6.7);<br>- ids unique and in [0, 2³¹−1]; a file holding id 2147483647 plus a duplicate re-validates with no issue (6.8);<br>- 1 ≤ sections ≤ 200; 201 sections give `limit-exceeded`; logo assets after the 64th are dropped with `sanitized`; unreferenced assets are dropped (`dropped-unknown`).<br>**Names:** `sanitizeText` strips C0, C1 and the bidi controls, does not trim section names, never splits a surrogate pair; `WallSection.setName` and the validator give identical results on 1,000 random strings (C28).<br>**Golden issue lists** for the fixtures. |
| `project-reachability.test.mjs` (new) | **Reachability property (AC 46).** For 1,000 seeded runs: drive random raw inputs (numbers far outside every range, fractions, `''`, numeric strings) through every `FIELD_RULES` entry, `CineCamera.setPose`, `Prop.setPose`, `pilotFly` (10,000 random steps), WASD orbit moves, the preview resize clamp, `Wall.allocateId` and each landed feature's setters; write the project with every variant; assert `validateProject` returns no issue and a project deep-equal to the file after `stripDerived`.<br>**Size bound:** 64 sections, each with a distinct logo of 2 MB of stored bytes (the largest file the app can write), serialize below `MAX_IMPORT_BYTES` and read back with no issue. |
| `project-migrations.test.mjs` (08) | **Legacy parity:** for each `CONFIGS` entry in `tests/regression/configs.mjs` plus the `import_edge` inputs, `migrateV1toV2` followed by the domain build equals the legacy `importJSON` mapping (oracle) field by field with `Object.is`, for every valid file.<br>**Palette:** a colour-less v1 section gets `legacySectionColors[i % 8]`; a colour-less v2 section gets `sectionColors[i % 8]`.<br>**Scope:** wall-only; non-wall state untouched, including `display.show_grid = false` and the orbit pose; logos cleared; pivot and UV settings reset.<br>**Detection:** v1 with `version: "1.0"`, with no version, and with `version: 7` (number); v2 `"2.0"` and `"2.3"` (`newer-revision`); `"3.0"` (`newer-version`); `format: "other"`. |
| `session.test.mjs` (new) | With spies on fake collaborators:<br>- **apply order (AC 59):** live state `enabled: false`; apply a v2 object with `enabled: true` and pose (2, 1.2, 4, 5, -10, 2). `setPreviewEnabled(true)` runs a fake `resetPose()` that writes the reset pose; after `apply`, the camera pose equals the object's pose, and the spy order is `camera.assign(lens)` → `setPreviewEnabled` → `cameraController.applyImportedPose` → `rebuild` → `PROJECT_REPLACED`;<br>- the same for `reason: 'undo'` and `'restore'`; with `enabled: false` in both, the pose is stored and the next `setPreviewEnabled(true)` keeps it (08 A4);<br>- **wall scope:** `display.show_grid` keeps its live value, `orbit.setPose` and `previewWindow.setSize` are not called;<br>- **undo/redo:** view-only fields keep their live values; no viewport call;<br>- **selection (02 CR-07-d):** a remembered `section:3` is re-selected after `undo` but not after `open`; a remembered `camera` is re-selected after both;<br>- `isPristineNew` is true after `newProject()` and false after one edit; `dirty` toggles on edit and clears on save, open, new and restore;<br>- `reportImport` is called once, only when warnings exist. |
| `history.test.mjs` | Uses a fake session with string state and an injected monotonic fake clock:<br>- record, undo, redo;<br>- branch truncation;<br>- coalescing within and outside 750 ms; it still works when `Date.now` is frozen (the clock is not Date-based);<br>- no-op dedupe;<br>- **nested `run`:** an outer `run('Camera preview on')` whose body calls an inner `run('Reset camera')` makes exactly one entry, labelled "Camera preview on", and calls `onCommitted` once (AC 58); an exception inside `run` records nothing;<br>- transactions: `commit` records unconditionally; a drag with no change records nothing; nested `begin` commits the first; `record` with another label inside a transaction commits it first; `cancel({revert: false})` does not apply;<br>- **apply suspension:** while `session.applying` is true, `record` is ignored; a fake `openFile` that toggles the preview inside `apply` and then records `Open "x"` leaves exactly one entry, labelled `Open "x"`, and calls `onCommitted` once (AC 44);<br>- `maxEntries` and `maxBytes` eviction keeps `index` valid;<br>- `HISTORY_CHANGED` payloads. |
| `autosave.test.mjs` | Uses a fake `win` whose `localStorage` is a Map (plus throwing variants):<br>- debounce (fake timers);<br>- `rotateOnBoot` slot movement, and the failure path: `setItem(':previous')` throws, `:current` is kept, state `paused`, no write until `resolvePrevious`;<br>- the quota fallback drops inline assets;<br>- a storage getter that throws gives the `unavailable` state;<br>- `restorePrevious` returns null for invalid payloads;<br>- Restore records "Restore session" and does not reset history;<br>- **pristine New:** after `newProject()`, `flush()` writes nothing and `:current` keeps the pre-New payload; after one edit it writes (AC 61);<br>- **`beforeunload`:** prevented only when `!active && session.dirty` (AC 62);<br>- `setEnabled` persists prefs. |
| `asset-store.test.mjs` (new) | A logo over 2 MB of stored bytes is refused with M-LOGO-2's text and a 65th distinct image with M-LOGO-3's; nothing is stored in either case (AC 63); ids dedupe; every stored logo has a `dataUri`; `digest` is the injected function. |
| `keymap.test.mjs` | Unique `(key\|code, shift, mod, alt)` tuples per scope and platform; every row of a landed feature has a registered action; **key versus code (C43):** letter rows match `e.key` case-insensitively (an AZERTY event `{key: 'm', code: 'Semicolon'}` triggers `M`; `{key: ',', code: 'KeyM'}` does not), punctuation rows match `e.code` (`?` is `Slash` + Shift); **exact modifiers:** `Shift+H` does not match `H`, `H` does not match `Shift+H`, `shift: 'any'` rows match both and their action receives the event, `mod` maps to Meta on mac and Ctrl elsewhere, an undeclared Ctrl/Meta/Alt never matches (AC 60); `isTypingTarget` truth table (input types, select, textarea, contenteditable, dialog); `isMovementBlockedTarget` blocks INPUT of every type, `role=radio`/`radiogroup`/`switch`/`slider`/`listbox`/`option` and `[data-key-scope]` descendants (AC 49); `repeat` filtered; `allowWhileTyping` lets `mod+S`/`mod+O` through from a text input; `Ctrl+Y` absent on mac; undo/redo rows ignored while `isDraggingGizmo`; **Escape registry:** priorities unique, dispatched in descending order until a handler returns true (80, 75, 70, 60, 40, 0; C42), a registered 40 runs before the core deselect (09), 70 closes 01's popover when focus is on `body`; **Delete/Backspace** fire only for the four allowed targets (a focused toolbar button does not delete, C44); `bindScopedKeys` with `actionTarget` runs actions only for that target (04 07-5). |
| `viewport-input.test.mjs` | With a fake `EventTarget` that implements capture and target phases: a press on a handle (the fake controls call `markHandleDown` from their own `pointerdown`) with 0 px travel never calls `pickAt`, for **both** registration orders of the controls' listener and `ViewportInput`'s (AC 45); a 0 px click off the handles calls `pickAt` with the right mode; travel ≥ 4 px never picks; right button never picks; **two pointers:** a second `pointerdown` before the first `pointerup` marks the press `multi`, and no pick follows even when the last finger lifts with 0 px travel; `pointercancel` never picks (AC 64); **release outside the canvas:** a `window` `pointerup` clears the press, so a later canvas `pointerup` does not pick (02 CR-07-b). |
| `transform-gizmo.test.mjs` | With fake controls emitting `mouseDown`/`objectChange`/`mouseUp`: one `begin` and one `commit` per drag; after `cancelDrag`, further `objectChange` events are ignored and `mouseUp` commits nothing, for both the r128 and the current-three fake (AC 29); delta decoding of 6.5 (single-axis angle sign in world and local space; relative snapping with each target's own increment leaves undragged axes at exactly 0); `attach` and `sync` pass `{mode}` to `getTransform`, and `setMode` calls `sync` (02 CR-07-e); **`setPilot(true)`** sets `controls.enabled = false` and `root.visible = false`, and a fake `pointerdown` on a handle then starts no drag; `setPilot(false)` restores both and calls `sync()`; `withPassHidden` keeps a pilot-hidden root hidden. |
| `orbit-controller.test.mjs` (new) | With a fake `OrbitControls` whose `update()` re-clamps and calls `object.lookAt(target)` as r128 does: while `interaction.pilotMode`, 100 `tick(1/60)` calls leave the shared camera's position and quaternion bit-identical (AC 55); `onWallRebuilt` and `frame` while piloting change nothing until `resumeAfterPilot`, which restores the saved pose, calls `update()` once and then applies the deferred reframe; **Phase-1 adapter (6.15):** `setPose(getPose())` reproduces the pose within 1e-12 for random Phase-1 states. |
| `selection-manager.test.mjs` (updated) | `gizmo.attach`/`detach` are called directly, before `SELECTION_CHANGED` is emitted, and no bus subscriber calls them; **observers (C37):** an `addObserver` observer runs exactly once per emitting call of `select`, `selectMany`, `deselect`, `pickAt` and `revalidate`, after the emit and the gizmo sync, and never when nothing changed; an `addHoverHitObserver` function receives the raw hit from `hoverAt` and `null` from `clearHover`; `revalidate()` drops an id whose `isSelectable()` is false (the camera after its preview is turned off) and emits once (AC 57); **pick rule (03 5.10.1 #6):** a pivot marker behind a nearer wall hit wins; a nearer camera beats a farther pivot; a section behind a camera is not picked. |
| `scene-manager.test.mjs` (new) | `NON_VISUAL_EVENTS` equals the catalogue's non-visual set (C47; AC 56, 77); `addPreRender` functions run once per rendered frame, after the camera update and before the passes, and never on an idle frame (C46). |
| `preview-pass.test.mjs` (new) | `capture()` runs inside a fake `withContentMaterials` unless `include.debug` is true (C48). With a fake renderer recording `setViewport`/`setScissor` and its own `floor(v · dpr)`: for dpr 1, 1.25, 1.5 and 2 and fractional client rects, every rect three applies equals the intended integer device rect; the restore equals `renderer.getSize()` exactly; the letterboxed image aspect is within 1 device px of the filmback aspect; the y flip uses the integer drawing-buffer height (AC 3). |
| `canvas-probe.test.mjs` (new) | With a fake `doc`: constructing the probe creates no canvas; `fits(w, h)` checks 08's hard limits first, allocates exactly one canvas of `w×h`, releases it, and caches the answer per size; an iOS user agent refuses areas above 16,777,216 px without allocating (AC 65). |
| `notifier.test.mjs` (new) | Dedupe within 2 s with the injected monotonic clock (independent of `Date`); the toast log keeps the last 50; `alert(text)` is a warn-level toast with the same text; error toasts go to `#toast-alerts`. |
| `texture-budget.test.mjs` | The worked examples in 6.12 (including the 1024² panel); the property `fits ⇒` all three limits hold; `panelModePxPerLed` is wall-wide, monotonic in `wallPanelLeds`, never exceeds `maxSide / maxLedSide`, and returns `fits: false` above 33,554,432 panel LEDs (AC 40). |
| `static-rules.test.mjs` (new, D7) | Rule S1 flags an unescaped `${name}` in an `innerHTML` template and passes the escaped one; rule S3 flags `alert(` and `window.confirm(` and passes `dialogs.confirm(`. |
| `hex-color.test.mjs` (U0) | `hexToRgb(h)` equals r128 `Color.setStyle(h)` components (`Object.is`) for the palette, `#000000`, `#ffffff` and 4,096 random hex values. The oracle is the r128 6-digit branch of `setStyle`: `parseInt(hex.charAt(0) + hex.charAt(1), 16) / 255` per channel. The LED-sim painter templates produce byte-identical CSS strings from both. |
| `sha256.test.mjs` (08) | 6.13 vectors for both paths of `sha256Hex` (with and without `subtle`). |
| `contrast.test.mjs` | Reads the pair table of 3.9 and the token values in `css/02-tokens.css`; asserts each `pass` pair meets its threshold and each failing pair is a listed exception with an owner. |
| `wall-controller.test.mjs` (updated) | Rows 3, 16 and 19 coalesce with `requestRebuild` (one rebuild per frame tick under a fake rAF). Every use case wraps its body in `history.run` with the label and key of 5.6.1. 08's cases (200-section cap, one rebuild per mesh-mode click) stay. |
| `camera-hub.test.mjs` (updated) | `PreviewPass.updateCamera` replaces `PreviewWindow.updateCamera` in the hub order; the labels equal 08 P2-10c's. |

### 8.2 Static checks

Rules S1-S8 (5.13), plus the existing rules: LEGACY parity and `Strategies` references (08 rewrites rule 8 at P2-13g) must stay green after every step. This spec deletes no `LEGACY_SITES` row (C21), so rules 6 and 8 change only through 08.

### 8.3 Harness changes and new scenarios (`tests/regression`, WP1 owners)

**G3** (harness only; a harness-only PR, 5.8.3, whose manifest is empty because every change is inert on the base code):
1. **Isolation.** Before each scenario, run `Storage.clearDataForOrigin({ origin, storageTypes: 'all' })` over CDP.
2. **Deterministic wall clock.** `lib/inject.mjs` freezes `Date`: `Date.now()` and `new Date()` without arguments return `2026-01-01T12:00:00.000Z`. `performance.now()` and timers stay real. This is safe because every interval and debounce in the app uses `performance.now()` (History coalescing, Notifier dedupe, ErrorReporter rate limit) or real timers (Autosave's debounce); `Date` is used only for displayed times and `saved_at`. The harness also sets `Emulation.setTimezoneOverride({timezoneId: 'UTC'})` and the locale `en-US`, so `Saved 12:00` and the banner time are stable.
3. **Autosave off by default.** Every scenario loads with `?autosave=off` except `autosave_restore`, which waits for `#autosave-status[data-state="saved"]` instead of sleeping. (Before H3 the flag is ignored by the app.)
4. **Toasts.** One `toasts.json` state output per scenario, read from `#toast-stack[data-toast-log]` at the end, like `dialogs.json`; it is recorded only when `#toast-stack` exists, so G3 adds no output on the base code. `#toast-stack` is hidden with an injected rule (`visibility: hidden !important`) immediately before each screenshot and shown after it. `dialogs.json` stays.
5. **Report.** `compare.mjs --json <file>` writes a machine-readable report. `--expect` (with the auto-loaded `expected/_nondeterminism.json`) is 08 P2-0's and stays the only gate (C26).
6. **UI probes.** `ui-spec.mjs` probes the new UI (`#history-undo`, `#history-redo`, `#autosave-status`, the project section, `#toast-stack`, the radio and toggle focus styles via the `:focus-visible` class). A probe whose element does not exist records nothing, so the probes are inert until their element lands.
7. **Media emulation.** A per-scenario option `reducedMotion: true` sets `Emulation.setEmulatedMedia({features: [{name: 'prefers-reduced-motion', value: 'reduce'}]})` (used by `render_on_demand`).
8. **Context isolation and browser hooks (absorbs 09 T0.1, C57).** Each scenario runs in its own browser context; `window.print` and the clipboard are replaced by recording hooks (`print.json`, `clipboard.json`, recorded only when called), so 09's spec-sheet and share-link scenarios need no harness change of their own.

G3 lands in the harness-only series of C57, after 08 P2-0 and 01 T2 (whose `rects` field on `--expect` manifest entries and `measure-rects` tool it keeps), and before G4 and G6. Colour probes read the live palette hook that 01 T2 adds (C53), never literals.

**G6** (harness only, before I3): `isGizmoRed`/`isGizmoGreen` in `scenarios-extra.mjs` accept the union of the hand-written gizmo's band (main channel 78-128, today's rule) and `TransformControls`' r128 colours (`0xff0000`/`0x00ff00` at opacity 1: main channel ≥ 200, both other channels ≤ 40). The ≤ 40 bound excludes the safe-distance floor's red (255, 51, 51), the hover yellow `0xffff00` and the car body `#b01c1c` (main channel 176). The harness-only check proves every output of the hand-written gizmo identical, so `gizmo_drag` keeps recording `{found: true}` after I3 and its B-M12/B-L28 checks are not silently lost.

**New scenarios.** Each lands in the PR of its owner task and is declared `added` in that task's manifest. Their effort is counted in section 10.

**As built (B2-0, 2026-10-17):** `preview_clean` and the new `preview_compositing` landed in a harness-only commit before R1 (`tests/regression/scenarios-platform.mjs`, manifest `B2-0`, both `added`), so their baselines document the two-canvas preview and R2 declares them `modified`. `preview_clean` drags the handle to the widest window with a custom 100 × 10 mm filmback (800 × 120 once the clamps are per axis; 1200 × 120 before R2, B-L32) and records the gizmo-coloured pixels inside the preview rectangle.

| Scenario | Owner task (effort) | Steps | Records |
|---|---|---|---|
| `project_v2_roundtrip` | D8 (M, 1 d) | Set everything to non-defaults: camera preview on, **then** a custom lens and pose; both props visible and posed; LED-sim layout; panel-ID style; a logo; project name. Save. Reload (fresh). Open the saved file. Save again. | both JSON files (byte-identical: no timestamps); camera pose after Open equals the saved pose (the apply order of 5.5.2); prop and display DOM states after Open |
| `import_v1_matrix` | D2 (M, 1 d) | Import each `CONFIGS` v1 file (all 6) and export OBJ/glTF in all modes | the exports must equal the outputs of the existing config scenarios (migration parity); orbit view after import equals the config scenarios' (wall scope re-centres as legacy) |
| `import_hostile` | D2 (M, 1 d) | Import files with an `<img onerror>` name, a `"` name, `__proto__` keys, `"columns": "10"`, `columns: 100000`, `"x": "1e400"`, duplicate, NaN and 2147483647 ids, empty sections, `"version": "3.0"`, `"format": "other"`, invalid JSON, a missing `sections` key, 201 sections, 65 logo assets | `toasts.json`, the import-report text, the card titles (textContent), `document.querySelectorAll('img').length` unchanged |
| `undo_redo` | H2 (M, 1 d) | Edit columns, colour (an `input` burst), add a section, collapse card 1, move the person with the inputs, toggle panel IDs, turn the camera preview on. Undo ×6, redo ×2. Ctrl+Z inside the name field undoes text only. Open a file that turns the camera preview on; the undo title must read `Undo Open "…"`. | stats and state after each step; button `disabled` and `title` (one entry "Camera preview on", never "Reset camera"); card 1 still collapsed after undo/redo |
| `autosave_restore` | H3 (M, 1 d) | Edit; wait for `data-state="saved"`; reload **without** clearing storage; expect the banner; Restore; Ctrl+Z returns to the pre-restore state; reload and Discard. Then edit, wait for saved, press New, reload: the banner offers the pre-New work. | banner text, state after restore and after undo, `#autosave-status` text |
| `preview_clean` | R2 (S, 0.5 d) | Camera preview on, person selected in translate mode, safe distance on; screenshots at filmback 36×24 and 40.96×21.6; resize the window to 800×120 | screenshots (no tint, no grid, no gizmo in the preview rect; letterbox bars; square corners), `#camera-preview-res` text |
| `preview_compositing` | R2 (as built: the owner's report of 2026-10-17) | Camera preview on; enlarge the window with its handle; two orbit drags, each followed by a full-page screenshot | the WebGL canvases (`window.__glCanvases()` of `lib/inject.mjs`; AC 1: exactly one after R2), the window and placeholder rects, the pure-black share of the preview rectangle mirrored vertically (the stale rectangle of two overlapping WebGL canvases; not reproduced headless, so the canvas list is the check) |
| `render_on_demand` | R3 (S, 0.5 d) | With `?perf=1` and `reducedMotion: true`: idle 3 s, then read `data-frames-rendered` twice 1 s apart; orbit drag; idle 3 s; read twice 1 s apart | the frame-counter deltas (0 while idle, > 0 while dragging) |
| `gizmo_click` | I3 (S, 0.5 d) | Select the camera in translate mode; click (0 px travel) on the X handle; click on empty space | selection state after each click (kept, then cleared) |
| `pilot_gizmo` | I3 (S, 0.5 d) | Select the camera in translate mode; note the X-handle position; enter pilot; screenshot; press and release at that position with 0 px travel, then drag 20 px from it; idle 1 s | screenshot (no gizmo); `gizmoState` (no drag ever started); `cameraState` before and after the idle second (identical: the orbit never re-aims the pilot camera) |
| `still_capture` | R4 (S, 0.5 d; optional) | Default scene, preview on; export a 1920-wide camera frame | PNG; the mean RGB of the still versus the mean of the preview rectangle in a screenshot (AC 48) |
| `a11y_keyboard` | X1 (M, 1 d) | Tab through the sidebar; Space on `#toggle-wireframe`; arrow keys in the mesh-mode radios and the swatch radiogroup; Enter on a section header; `?` opens help; Esc closes it | `.active`, `aria-checked`, the radio `checked` state, `aria-expanded`, orbit target unchanged |
| `errors_ux` | E3 (S, 0.5 d) | Pilot without preview (P); safe-distance export with no floor; a panel-IDs PNG over the probe limit (a huge `led_resolution` config) | `toasts.json`, `downloads.json` (no file) |
| `perf_leak` | X4 (optional, not in PR runs) | 100 colour changes with `?perf=1` | HUD texture and geometry counts before and after |

### 8.4 Intentional golden changes, one manifest per step

Every step follows 08 §8.1 (C26): its manifest `tests/regression/expected/07-<task>.json` is written first, the baseline is the parent commit's output, and the candidate is a full run. "Runs on" names the 08 state the step starts from (2.9); the lists below are **relative to that state**, not to `cd3fd3f`. Patterns use 08's syntax (`*`, `**`, `{a,b}`; `each: true` marked "each"). Before committing, every list is re-derived from the parent's `baseline/manifest.json` (08 R10); the compare gate catches omissions. The only undeclared differences allowed are the entries of 08's `expected/_nondeterminism.json`, within their bounds. Where C31 allows two orders (R1, R2), the table gives one row per order.

| Step | Runs on | `expect` | `mayChange` | Must stay identical |
|---|---|---|---|---|
| G3, G6 (harness only) | any | none (harness-only check, 5.8.3) | - | everything |
| G1, G2, G4, D0 | any | no golden run needed | - | - |
| E1 Notifier, `#toast-stack` | Phase 1 + G3 | `*/toasts.json` added (each; all `[]`); `ui_visual/*.styles.json` (the `#toast-stack` probe) | - | every screenshot, export and other state |
| E2 message channel | E1, 08 P2-13e (the last commit that adds a message id) | every `*/dialogs.json` that is not `[]` on the parent becomes `[]` (re-derived list: at least `import_edge`, `keyboard`, `camera` if it exports without a floor, `p2_xss_names`, `p2_oversize_canvas`, `p2_project_v2`); the same scenarios' `toasts.json` gain the same texts; `p2_shortcut_filters/toasts.json` gains "Exited pilot mode" (step 4) | - | screenshots, exports, downloads, console |
| E3 export reporting | E2, 08 P2-1, P2-5a, P2-13a | `*/toasts.json` of every scenario that exports (success toasts; M-EXP-4 as a warning); `errors_ux/**` added (each) | - | every export file, `downloads.json`, `console.json`, screenshots |
| E4 boot watchdog, context-loss overlay | E1 | - | `ui_visual/*.{styles,text}.json` (hidden `#boot-error` and overlay, if probed) | screenshots, exports |
| D1 `AppInfo`, disabled Add Section | 08 P2-13e | none (no scenario reaches 200 sections) | - | everything |
| D2 validator + migration completion (one step; 08 retired `importValidation`) | D1 | `{import_v1_matrix,import_hostile}/**` added (each) | `import_edge/{dialogs,toasts}.json` (wording of a correction line, if the completed rules phrase it differently) | every existing export and screenshot |
| D4 `history`/`autosave` variants | D2 | none (no scenario exports those variants) | - | everything |
| D5 session (`project` + `viewport` keys; `apply`; remaining `syncFromModel`) | D4 | `**/*__export-json__*.json` (each: `project` and `viewport` added); `**/*__export-zip__*.zip` (each: JSON entry); the config scenarios' state outputs that record the mesh-mode radios' `checked` (V-2 now mirrored on every import, 5.10; re-derived by `grep -l checked` over the parent baseline) | `p2_project_v2/*` (v2 open now restores the viewport) | every canvas screenshot of the config scenarios (a wall-scope import skips the viewport step and re-centres as before); every OBJ, glTF, MTL and PNG |
| D6 assets, ZIP assets, ZIP open | D5, 08 P2-13a | `logos/*__export-zip__*.zip` (each: `assets/<id>.<ext>` entries; JSON `storage: "zip"`) | - | the file-variant JSON (still inline), screenshots |
| D7 rule S1 | 08 P2-3a | none | - | everything |
| D8 project section, import report | D5, D6, E1 | `ui_visual/*.sidebar.screenshot.png`, `ui_visual/*.{styles,text}.json` (each state that captures them: the section moves `#export-json`/`#import-json` and relabels Save); `project_v2_roundtrip/**` added (each) | `*/toasts.json` (M-IMP-5's toast becomes the report dialog) | exports, canvas screenshots |
| H1 history | D5 | none (no UI yet) | - | everything |
| H2 header controls | H1, I1 | `ui_visual/*` header styles, text and viewport screenshots (each state that captures them); `undo_redo/**` added | - | exports, canvas screenshots |
| H3 autosave, banner | H1, E1 | `ui_visual/*` header text (`Autosave off` under the harness flag) and the sidebar toggle; `autosave_restore/**` added | - | exports, canvas screenshots |
| R1 layers, **after** 08 P2-10a-c (C31) | 08 P2-10a-c | canvas screenshots taken **while piloting**: `keyboard/pilot_view.screenshot.png`, `pilot_look/look_0{1_after_drag,2_after_wheel}.screenshot.png`, `preview_off_in_pilot/pilot_00_on.screenshot.png` (grid, axes, frustum and safe-distance floor hidden in pilot, Q7; re-derive every screenshot taken with `pilotMode` true) | - | every screenshot outside pilot, **including every preview rectangle** (the `DEFAULT \| ENVIRONMENT` mask reproduces P2-10a's hiding), exports, states |
| R1 layers, **before** 08 P2-10 (C31, Q18) | Phase 1C | the pilot screenshots above, **plus** every canvas screenshot with the preview visible, whose preview rectangle loses the grid, axes, gizmo and the 8% tint: the list of 08 P2-10a's manifest (`camera/{01_camera_enabled,08_camera_moved,13_safe_distance}`, `gizmo_drag/camera_0{1,2}_*`, `pilot_look/look_0{1,2,3}_*`, `preview_off_in_pilot/pilot_0{0,5}_*`, `preview_resize/resize_0{1,3}_*`, `keyboard/{pilot_view,final_view}`), re-derived from the parent baseline. R1 also retires P2-10a's `Strategies` key and rows. | - | exports, states, screenshots without the preview |
| R2 single renderer, **before** 08 P2-10 (C31, Q18) | R1 | the preview screenshots of R1's row (now letterboxed, B-M9, with square corners), `preview_resize/*.json` and `preview_resize/*.screenshot.png` (per-axis clamps, B-L32), `ui_visual/{04,05,06,07,08}_*.styles.json` (window and canvas rects, transparent background), `ui_visual/{04,05}_*.viewport.screenshot.png`; `preview_clean/**` added. R2 also retires P2-10b's key and rows; the labels change later, with 08 P2-10c in `PreviewPass` | `ui_visual/{06,07,08}_*.viewport.screenshot.png` | exports, labels |
| R2 single renderer, **after** 08 P2-10a-c | R1 | `preview_resize/*.json` (each: no width/height attributes on `#camera-preview-canvas`); `ui_visual/{04,05}_*.styles.json` and `ui_visual/{04,05}_*.viewport.screenshot.png` (each: `#camera-preview-window` becomes transparent with square corners, visible through the masked canvases); `preview_clean/**` added | canvas screenshots with the preview visible: `camera/*`, `gizmo_drag/camera_*`, `pilot_look/*`, `preview_off_in_pilot/*`, `preview_resize/*`, `keyboard/{pilot_view,final_view}` (review: only the four window corners and edge antialiasing may differ); `ui_visual/{06,07,08}_*.{styles.json,viewport.screenshot.png}` if the window is visible there | exports, labels (`#camera-preview-res`, header) |
| R3 render on demand | R2 | none: any diff is a missing `invalidate`; `render_on_demand/**` added. Manual: gizmo hover highlight (8.6) | - | everything else |
| R4 camera stills (optional; required if 09 X4 is accepted, C58) | R2 | `ui_visual/*` sidebar screenshot, styles and text of the camera panel (new button and select); `still_capture/**` added | - | exports, canvas screenshots |
| I1 keymap | E1, 08 P2-9b | none (P2-9b's filters reproduced) | `p2_shortcut_filters/*` (only if a step uses Shift+letter, which no longer triggers the plain letter, 3.8) | everything else |
| I2 click-select v2 | I1, 08 P2-9a | none expected | `keyboard/*.json`, `ui_visual/selection_pick.json` (picks now work in any gizmo mode) | screenshots, exports |
| I3 `TransformControls` | I2, R1, G6, 08 P2-9c-f, P2-9j | every canvas screenshot showing a gizmo: `keyboard/person_selected_translate_gizmo.screenshot.png`, `keyboard/person_rotate_gizmo.screenshot.png`, `gizmo_drag/*.screenshot.png` (each); `gizmo_drag/{person,camera}_0{1_translated,2_rotated}.json` (the controls map a 60 px drag differently); `{gizmo_click,pilot_gizmo}/**` added | `keyboard/*.json` | **`gizmo_drag/*_handle.json` stays `{found: true}`** (G6); `gizmo_drag/camera_02_rotated.json` still shows `rotY` increasing for a counter-clockwise drag (08 AC 36); exports |
| I4a `OrbitControls` (legacy framing kept) and the **help-badge rewrite** (C35) | I3, 08 P2-9g-i, P2-11c | **every canvas capture, restricted to the badge rectangle** (each, with `rects` on the `--expect` entries measured by `measure-rects`, C57: the new badge text `Drag to rotate • Right-drag to pan • Scroll to zoom • WASD to move • G/R/L/P • ? all shortcuts`); `ui_visual/*.text.json` (the badge text); canvas screenshots taken after a harness orbit drag or wheel step (re-derive by step name: `zoom-out`, `look-drag` outside pilot, orbit drags in `toggles`), at least `gizmo_drag/camera_0{1,2}_*.screenshot.png` | `gizmo_drag/camera_*.json` (a different zoom changes the handle's drag distance); `keyboard/*` (dt-based speed equals legacy only at 60 Hz); `**/*__export-json__*.json` and `**/*__export-zip__*.zip` (`viewport.orbit` doubles may differ in the last bits) | screenshots with no orbit input; pilot screenshots (orbit frozen in pilot) |
| I4b framing policy, orbit joins `stageAnchored` (C45) | I4a | every canvas screenshot of every scenario except `ui_visual` (boot framing at d ≈ 3.97 m replaces the legacy reset view; edits no longer re-centre; after a "Keep stage layout" pivot commit the orbit shifts with the stage); `**/*__export-json__*.json` and `**/*__export-zip__*.zip` (each: `viewport.orbit`); `keyboard` view states | - | `ui_visual/*` (canvas masked), every OBJ, glTF, MTL and PNG |
| X1 a11y | E1, I1, 08 P2-13c, P2-8d | `ui_visual/*.styles.json` (the mesh-mode radio input becomes visually hidden but focusable); `a11y_keyboard/**` added | `ui_visual/*.text.json`, `ui_visual/*.sidebar.screenshot.png` | canvas screenshots, exports; the radio `checked` state (already changed at D5) |
| X2 contrast test | any | none | - | everything |
| X3 budgets | E3, 08 P2-12d | none (the budget applies only to 04's `uv.panel_uvs = 'panel'` option, which no scenario uses before Feature 4) | - | everything |
| X4 perf HUD, coalescing | R3 | none (`?perf=1` only in new scenarios) | - | everything |
| X5 panel-mode warning | E1 | `large_wall/toasts.json` (3,200 panels in panel mode) | - | everything else |
| U0, U1 | D2 / R3, I4a | **none** | - | everything |
| U2 | U1 | none | `**/*.screenshot.png` (8.5) | every `obj`, `mtl`, `gltf`, `json`, `png`, `zip`, `state` and `console` output |
| U3 | U2 | the colour-probe JSON outputs that read rendered pixels (`content_probes`, `face_probes` and similar; re-derived from the parent baseline, C53) | `**/*.screenshot.png`: transparent overlays; LED-sim and panel-ID screenshots (linear-space filtering of minified sRGB textures) (8.5) | every other non-screenshot output |
| U3b | U3 | none | Feature 5's HDRI and car screenshots | everything else |

### 8.5 Re-baseline protocol for the three.js upgrade (U2, U3) and every screenshot-only step

1. **Manifest.** `tests/regression/expected/07-U2.json` (or `07-U3.json`) has an empty `expect` list and `mayChange: ["**/*.screenshot.png"]`. Screenshot changes may fall under the comparison tolerance, so they are never declared under `expect` (08 §8.2 rule 5).
2. **Gate.** The PR carries the `golden` label; `compare.mjs --expect` must exit 0, so every `obj`, `mtl`, `gltf`, `json`, `png`, `zip`, `state` and `console` output is IDENTICAL.
3. **Review.** For each changed screenshot, the reviewer opens base and head from the artifact side by side, together with the reported metrics (max channel difference, % of pixels; `--json` report).
   - U2 acceptance: max channel diff ≤ 16 and ≤ 2% of pixels per screenshot. Anything beyond that is investigated as a regression, for example a missed `forceSinglePass`. The investigation is **time-boxed to 2 days** inside U2's L estimate; anything still unexplained after that is raised with the owner before merging.
   - U3: visual review only, with the expected differences of 8.4. Colour-mode opaque wall pixels must stay within 2 levels (AC 24).
4. **Promote.** No baseline is committed. Each developer promotes locally after review (08 §8.1 step 5) and re-runs the self-consistency check (step 6).
5. **Log.** The committed manifest is the record; the PR description adds the metrics summary.

### 8.6 Manual checks

Run these on Chrome, Firefox and Safari (macOS), and on an iPad for touch:
- orbit, pan and pinch; a pinch whose last finger barely moves keeps the selection;
- gizmo translate and rotate on the camera and props, in world and local space;
- **gizmo hover highlight** after R3 (the hand-written gizmo) and after I3 (`TransformControls`);
- Esc during a drag; Ctrl+Z during a drag does nothing;
- **pilot:** with the camera selected in translate mode, enter pilot; no gizmo is visible; pressing where a handle was starts mouse-look, never a gizmo drag; the view does not drift while idle;
- pilot fly at 60 Hz and 144 Hz (equal speed, B-L27);
- preview letterbox and square corners while dragging the resize handle, at device pixel ratios 1, 1.25 and 2 (no 1 px seam);
- context loss: `WEBGL_lose_context.loseContext()` then `restoreContext()` from devtools: the overlay shows "Recovering..." and the view returns without a click; without `restoreContext()`, the Reload fallback appears after 10 s;
- autosave across a browser restart; with autosave off, closing the tab after an edit shows the browser's "Leave site?" prompt;
- a screen reader (VoiceOver or NVDA) reading the toggles and toasts;
- Lighthouse accessibility ≥ 90;
- the iPad against the dev server over LAN HTTP: logo upload and Open work (SHA-256 fallback); a large Panel IDs export reports M-EXP-2 instead of failing;
- the Pages deploy URL smoke test (sub-path, case-sensitive paths).

---

## 9. Acceptance criteria

Numbers 1-43 keep their revision-1 numbering, 44-53 were added in revision 2, and 54-74 in revision 3. Where spec 08 fixed a bug first, the criterion is a **regression** criterion: it must still hold after the 07 task that replaces the mechanism (C21).

**(a) Single renderer**
1. The app creates exactly one `WebGLRenderer`. `#camera-preview-canvas` has no WebGL context (`canvas.getContext('webgl2')` is never called by the app on it).
2. With the preview on and the person selected in translate mode, the preview rectangle contains no pixels from the grid, axes, frustum lines or fill, safe-distance floor, gizmo or normal lines (`preview_clean`; B-M11, fixed by 08 P2-10a or R1, whichever lands first, C31).
3. For filmbacks 36×24, 40.96×21.6 and a custom 100×1, the drawn image aspect equals the filmback aspect within 1 device pixel, and black bars fill the rest of the window (B-M9). At device pixel ratios 1, 1.25, 1.5 and 2, the main viewport after the preview pass equals `renderer.getSize()` exactly (`preview-pass.test.mjs`).
4. Dragging the resize handle to any extreme keeps the window within 200-800 × 120-600 CSS px (B-L32, fixed by 08 P2-10b or R2, C31).
5. Picking the camera body still selects the camera after it moves to `LAYERS.HELPERS`.

**(c) Render on demand**

6. With `?perf=1`, reduced motion emulated and no input, `data-frames-rendered` increases by 0 over a 1 s window that starts 3 s after the last input.
7. Every harness scenario is identical before and after task R3.

**(d) Project v2**

8. Save then Open restores camera (lens, pose, enabled), props (visibility, pose, scale), display content and layout, toggles, panel-ID style, logos (image and position/scale), mesh mode, project name and the orbit view. The camera pose is restored even when opening the file turns the preview on. The two saved files are byte-identical.
9. The ZIP's JSON equals the file JSON except `assets[].storage`/`path`/`data_uri`, `sections[].texture_file` and `pixel_map.atlas.file` (B-M3, regression of 08 P2-6a).
10. Each of the six harness v1 configs imports to a wall whose OBJ/glTF exports are byte-identical to the legacy import's exports.
11. A v1 import keeps the current camera, props, display (including the view-only fields), panel-ID style and HDRI settings; clears all logos (B-L21); resets the pivot and UV settings; and leaves the orbit framed exactly as a legacy import does.
12. Importing a file whose section name is `<img src=x onerror=alert(1)>` creates no `img` element, runs no script and shows the literal text in the card title (B-M4, regression of 08 P2-3a).
13. Importing `{"sections": [], "version": "1.0"}`, invalid JSON, a file with no `sections` key, `"version": "3.0"` or 201 sections changes nothing and shows an error toast with 08's message for the reason (B-L8, V-5, V-6).
14. `"columns": "10"` imports as 10 with a `coerced` warning in the report. `columns: 100000` imports as 50 with `clamped`. Duplicate and NaN ids are renumbered uniquely, and `addSection` then works.
15. Fuzzing (2,000 cases) never throws, never pollutes `Object.prototype`, and always yields a re-validatable project whose numbers are all finite.

**(e) Undo and autosave**

16. Ctrl+Z / Cmd+Z undoes the last of: field edit, colour change (a whole colour-picker drag is one step), add/delete section, gizmo drag (one step per drag), pilot flight (coalesced), camera field, prop toggle, open file, new project, restore session. Redo re-applies it. The undo button title names the action.
17. Ctrl+Z inside a text input performs native text undo only.
18. Undo never changes the orbit view, grid visibility, pivot-marker visibility or debug toggles.
19. After an edit, `#autosave-status` shows `Saved HH:MM` within 2.5 s. After a reload, the banner offers the previous state, and Restore reproduces it exactly (byte-identical project JSON, camera pose included).
20. Filling storage beyond the quota shows one warning, and autosave continues without inline logos. If the boot rotation itself fails, the previous session is kept and autosave pauses until Restore or Discard.
21. `?autosave=off` and the toggle disable all writes (verified with a spy on storage).

**(f) three.js upgrade**

22. After U1, the whole harness is identical to the pre-U1 run.
23. After U2, every non-screenshot output is identical, and every screenshot meets the 8.5 U2 thresholds.
24. After U3, canvas textures have `colorSpace === SRGBColorSpace`, and in **colour mode** opaque wall colours in screenshots match U2 within 2 levels. LED-sim and panel-ID screenshot differences are expected and reviewed (8.4).
25. No module except `js/vendor/*` imports `'three'` (static rule S4).

**(b) Selection, gizmo, orbit**

26. An orbit drag (travel ≥ 4 px) or a right click never changes the selection (B-M14, regression of 08 P2-9a). A left click under 4 px selects, in any gizmo mode.
27. Rotating the camera with the world-space ring about X rotates it about world X, whatever its pan (B-L28). The object turns in the same direction the pointer travels around the ring (B-M12). Both are regressions of 08 P2-9c/f.
28. For props, the translate gizmo shows only the X and Z handles and the rotate gizmo only Y (B-L22). After rotating a prop in local space and then editing its rotation input, the local gizmo axes follow (B-L23). Both are regressions of 08 P2-9d/e.
29. One gizmo drag produces exactly one history entry, labelled with the Selectable's `historyLabel`. Esc during a drag restores the pre-drag pose, creates no entry, and later pointer moves in the same drag change nothing.
30. WASD moves at the same metres per second at 60 Hz and 144 Hz, within 5% (B-L27). View presets during pilot mode exit pilot first (B-L25). The gizmo is neither visible nor operable in pilot mode (B-L26, AC 54), while Feature 1's normal lines stay visible. All three are regressions of 08 P2-9h-j.
31. Touch: one-finger orbit and two-finger pinch/pan work on iPad Safari.

**(g) CI**

32. Every push and PR runs the static checks and unit tests in under 5 minutes, with no `npm install`.
33. A push to `main` deploys to Pages only when the checks pass, and a deploy is never skipped because of a concurrency cancellation (pages.yml queues; ci.yml's group includes the caller's workflow name). The deployed site contains no `tests/`, `docs/` or `tools/`.
34. A PR labelled `golden` produces a compare report artifact. It fails on any difference that the manifests it adds do not declare, and on any declared change that did not happen (08 §8.1).

**(h) Accessibility, budgets, errors**

35. All 9 toggles (and new switches) are reachable with Tab and toggled with Space/Enter, and `aria-checked` reflects state (B-L36, regression of 08 P2-13c). The mesh-mode radios are reachable and switch with the arrow keys, rebuilding once (B-L13, regression of 08 P2-8d), and their `checked` state follows the model after every import, undo and redo (V-2).
36. The help badge and selection badge do not overlap, and `#toggle-grid.active` is visibly styled (B-L24; fixed by Features 1 and 6; regression only).
37. G/R/L/P do nothing while a `SELECT` is focused or Ctrl/Cmd/Alt is held, and holding P does not toggle repeatedly (B-L11, regression of 08 P2-9b, now through `KEYMAP`).
38. No call to the global `alert`, `confirm` or `prompt` remains (static rule S3). The 3 legacy messages and 08's message ids appear as toasts or dialogs with unchanged texts.
39. An oversized panel-ID PNG export shows an error toast and produces no file. A ZIP with oversized sections skips them and lists them (B-L4, regression of 08 P2-1c). On iOS, a size within 08's hard limits but above the device limit is reported before rendering (`CanvasProbe`).
40. With 04's `uv.panel_uvs = 'panel'` option, panel IDs on and `large_wall` in panel mode, the panel canvases total at most 32 MP and no canvas side exceeds min(`maxTextureSize`, 4096). When even 1 px/LED exceeds the total, the rebuild uses the section-canvas path and shows one warning toast. The default panel path (08 P2-12d) and the default wall's 16 px/LED are unchanged.
41. A failing logo file shows an error toast with 08's M-LOGO text. A 0×0 SVG does not produce NaN layout (B-L35, regression of 08 P2-13a).
42. Losing the WebGL context shows the overlay, and the scene rebuilds by itself when the browser restores the context; if no restore arrives within 10 s, the overlay offers a Reload button.
43. The contrast unit test passes for the pairs of 3.9; every failing pair is a listed exception with an owner.

**Added in revision 2**

44. Opening a file that turns the camera preview on creates exactly one history entry, labelled `Open "<name>"`, and the undo button reads `Undo Open "<name>"`. No autosave write happens while the file is being applied.
45. A left click with 0 px travel on a gizmo handle never changes the selection, for either registration order of the controls' and `ViewportInput`'s listeners (`viewport-input.test.mjs`, `gizmo_click`).
46. For every field in 4.3, any value produced by a writer (UI rule, gizmo, pilot, feature setter) survives Save then Open unchanged, with no validator issue (`project-reachability.test.mjs`).
47. Reading a v2 file with the legacy v1 import mapping yields the same **generative** wall as the v2 reader: the same sections, panels, LEDs and curvature, before offsets, pivot and face orientation are applied. v1 readers do not see those v2 additions; the README documents this limitation (7).
48. A camera still's mean colour equals the preview rectangle's mean within 3 levels per channel, and its edges are antialiased (`still_capture`).
49. Arrow keys in the mesh-mode radios, the swatch radiogroup or Feature 2's section list change only that control; the orbit target does not move.
50. With the hand-written gizmo (after R3, before I3), hovering a handle updates its highlight on the next frame (manual, 8.6).
51. On an insecure origin (LAN HTTP), logo upload and Open work, using the SHA-256 fallback.
52. `mod+S` inside a text field commits the field's value and saves the project; the browser's "Save page" dialog never opens.
53. Every chord in 3.8 is unique within its scope and platform, and from I1 on no module outside the S5 allowlist adds a `keydown` listener.

**Added in revision 3**

54. In pilot mode the gizmo is neither drawn nor pickable: with the camera selected in translate mode, a press on the former handle position starts no gizmo drag (`pilot_gizmo`, `transform-gizmo.test.mjs`).
55. While piloting, idle frames leave the pilot camera's position and quaternion bit-identical; a wall edit made in the sidebar during pilot does not move the pilot view; on pilot exit the orbit view is restored and any deferred re-centre or frame is applied (`orbit-controller.test.mjs`, `pilot_gizmo`).
56. `HISTORY_CHANGED` and `AUTOSAVE_STATUS` never cause a rendered frame (unit test on `SceneManager`'s subscription list).
57. When an undo turns the camera preview off while the camera is selected, the selection is cleared and the badge hides (`selection-manager.test.mjs`).
58. Turning the camera preview on creates exactly one history entry, labelled "Camera preview on", never "Reset camera" (`history.test.mjs`, `undo_redo`).
59. Open, Restore, Undo and Redo that turn the preview on keep the stored camera pose exactly (`session.test.mjs`, `project_v2_roundtrip`).
60. `Shift+H` never triggers `H`'s action and `H` never triggers `Shift+H`'s; the same holds for `N`/`Shift+N` (`keymap.test.mjs`).
61. After an edit has been autosaved, pressing New and reloading offers the pre-New work in the restore banner (`autosave_restore`).
62. With autosave off, unavailable, paused or failing, closing the tab after an edit shows the browser's leave prompt; with autosave saving normally, or with no unsaved change, it never does.
63. A logo over 2 MB of stored bytes is refused at upload with 08's M-LOGO-2 text, and a 65th distinct logo image with M-LOGO-3; nothing is stored in either case. A project with 64 distinct logos of up to 2 MB each saves and reopens unchanged with no issue.
64. A two-finger gesture never selects or deselects, even when the last finger lifts with no movement.
65. `CanvasProbe` creates no canvas at boot or on import; at export it allocates only the requested size, once per size.
66. Ctrl+Z / Cmd+Z during a gizmo drag does nothing; Esc cancels the drag.
67. Undo and redo keep each section card's collapsed or expanded state.
68. A feature's Escape handler registered at priority 40 runs after the gizmo-drag cancel and the pilot exit and before deselect; duplicate priorities fail `keymap.test.mjs`.
69. A JSON file larger than `MAX_IMPORT_BYTES` (187,347,712 bytes) is rejected before it is read, with 08's M-IMP-6 text; the largest file the app can write opens (`project-reachability.test.mjs`).
70. `viewport.orbit` round-trips through Save and Open both before I4a (Phase-1 adapter, 6.15) and after it.
71. No 07 commit deletes a `LEGACY_SITES` row or a `Strategies` key, except R1/R2 when they land before 08 P2-10 (C31); every other 07 commit leaves static rules 6 and 8 unchanged (C21).
72. Every 07 golden step commits `tests/regression/expected/07-<task>.json` and passes `compare.mjs --expect`; a harness change to an existing scenario lands in a harness-only PR that is identical on the base code (5.8.3).
73. After G6, `gizmo_drag/*_handle.json` records `{found: true}` on both the hand-written gizmo and `TransformControls`.
74. A file whose numeric field holds `"1e400"` opens with that field at its default and a `defaulted` warning, and the next Save writes a finite number there.

**Added in revision 3.1** (the cross-spec review)

75. Escape runs the chain 80 (cancel gizmo drag), 75 (cancel a section reorder drag, F2), 70 (close 01's popover, even with focus on `body`), 60 (exit pilot), 40 (09 measure), 0 (deselect), stopping at the first handler that returns true (C42).
76. Letters match by key and punctuation by code: on an AZERTY layout the key printed `M` toggles measure and the key printed `,` does not; `?` is `Slash` with Shift (C43). `Delete` with a toolbar button focused deletes nothing (C44).
77. Every event in `Events` is classified visual or non-visual; non-visual events never cause a rendered frame (S9, C47). Pre-render functions run on rendered frames only (C46).
78. A camera still or 09 screenshot taken while 01's face-orientation shading is on shows the content materials, unless `include.debug` is true; the live view keeps the shading (C48).
79. After I4b, a "Keep stage layout" pivot commit leaves the wall at the same screen position: the orbit target and camera move with the stage, in the same single history entry as the other re-expressed positions (C45, C59).
80. `SelectionManager` observers run once per emitting selection call, after the gizmo sync; 04's hover readout uses the shared hover hit once 02 T23 has landed (C37).

---

## 10. Task breakdown

Effort: S ≤ 0.5 d, M 1-2 d, L 3-5 d, XL > 5 d; each task also states its estimate in days, which the totals sum. "After" lists hard dependencies only, **including the spec 08 commits** whose bug ids or modules the task builds on (C21, C25). Every task is one PR with its own manifest and golden step (8.4). Harness scenarios are part of the task whose criteria they verify; their share of the estimate is shown. "08 delivers" names the part of the task spec 08 builds first (08 §5.6 mapping).

| # | Task | Effort (days) | Of which scenarios | After | Track | Notes |
|---|---|---|---|---|---|---|
| D0 | **Consolidated reconciliation commit** (docs only, C58): the residual edits of 0.2 and the cross-spec review (0.4, C32-C62), applied to specs 01-09 (already reflected in these files), ARCHITECTURE §1.4 (frames per consumer, the B-L1 decision), §6.2 (named rebuild-policy row ids) and §9 (the F3 row, no wall root), with REFACTOR_PLAN §5's Phase 2 order rewritten by 08's P2-0 amendment commit; a check that every sibling text reflects them. Replaces the documentation parts of 04 UV-0, 05 T15, 02 T14, 03 T13 (which keeps only the owner's sign-off, with 02 Q24/Q25) and 01 T11. | M/L (3) | - | - | 2 | **before any Phase 2 or Phase 3 code that touches a shared contract** |
| G1 | `ci.yml` (static + unit) | S (0.5) | - | Phase 1 merged | 2 | - |
| G2 | `pages.yml` + owner switches the Pages source to GitHub Actions | S (0.5) | - | G1 | 2 | owner action |
| G3 | Harness determinism (8.3 items 1-8): storage clear, `Date` freeze + UTC + locale, `?autosave=off`, toast log and screenshot hiding, `--json`, inert UI probes, reduced-motion option, per-scenario contexts with print and clipboard hooks (absorbs 09 T0.1, C57); two self-consistency runs; harness-only PR | L (3.5) | - | 08 P2-0 (`--expect`, `_nondeterminism.json`), 01 T2 (`rects`) | 2 | `tests/regression` (WP1 owners) |
| G4 | `golden.yml` (08 §8.1 in CI, harness-only check); Chrome on ubuntu-24.04; measured runtime; README label workflow | M (1.5) | - | G3 | 2 | - |
| G5 | (optional) deploy-time `?v=<sha>` cache busting | S (0.5) | - | G2 | 2 | - |
| G6 | Harness only: `gizmo_drag` colour locators for both gizmos (8.3) | S (0.5) | - | G3 | 3 | before I3 |
| E1 | `ui/Notifier`, `ui/Dialog`, `#toast-stack` markup and CSS, toast log; css-slices report-only (S7) if no earlier step made it so | M (1.5) | - | G1, G3 | 2 | - |
| E2 | Route the 3 legacy messages and 08's message ids to Notifier/Dialog with unchanged texts; `dialogs.confirm` through `Dialog`; delete `createDialogs`; rule S3 | M (1.5) | - | E1, 08 P2-13a, P2-13e | 2 | 08 Q9 |
| E3 | Export reporting on 08's `#runExport`; `withBusy`; lazy `CanvasProbe` and the injected `canvasFits`; `errors_ux` | M (2) | 0.5 | E2, 08 P2-1a-e, P2-5a, P2-13a | 2 | 08 delivers the guards and messages |
| E4 | `ErrorReporter`, context loss with automatic recovery and the Reload fallback, `js/boot.js` watchdog, `#boot-error`, rule S8 | M (1.5) | - | E1 | 2 | - |
| D1 | `core/AppInfo.js`; Add Section and Duplicate disabled at 200; any P row of 4.3 that P2-13e did not add | S (0.5) | - | D0, 08 P2-13e | 2 | 08 delivers `LIMITS`, the caps, `Wall.MAX_SECTIONS` and the Phase-2 schema rows |
| D2 | Validator and migration completion, one golden step: what 4.7 still lacks after P2-13e (extensions, `newer-revision`, `budget`, the 2³¹−1 id fallback), fuzz and reachability property tests; `import_v1_matrix`, `import_hostile` | L (3.5) | 2 | D1 | 2 | 08 delivers both modules and the v1/v2 paths |
| D4 | `history` and `autosave` variants | M (1) | - | D2 | 2 | 08 delivers `file` and `zip`; no golden change |
| D5 | `ProjectSession` (the 11-step `apply` of 5.5.2, wall scope, `dirty`, `isPristineNew`, 02 CR-07-d); absorb 08's `#applyV2`; remove `applyImport`; `DisplaySettings`/`PanelIdStyle` `assign`, `LogoLibrary.replaceAll`; `PROJECT_REPLACED` subscribers on the remaining panels (with card-collapse keeping); Phase-1 orbit adapter (6.15); `PreviewWindow.setSize`; `project` and `viewport` written; `session.test.mjs` | XL (5.5) | - | D4 | 2 | 08 delivers `CineCamera`/`Prop` `assign`, `applyImportedPose`, the writer bounds and four panels' `syncFromModel` |
| D6 | `AssetStore` over 08's `LogoLoader`; logos by reference; ZIP assets; ZIP open (any `*.json`; F5's `hdri/` entries handed over) | M (2) | - | D5, 08 P2-13a | 2 | 08 delivers `core/sha256.js` |
| D7 | Static rule S1 and its test | S (0.5) | - | G1, 08 P2-3a | 2 | 08 delivers the escaping |
| D8 | Project section UI, import report dialog, Save/Open/New, `#project-name`; `project_v2_roundtrip` | L (3) | 1 | D5, D6, E1 | 2 | - |
| D9 | (optional) `tools/gen-schema.mjs` publishing `schema/project-v2.schema.json` | S (0.5) | - | D1 | 2 | - |
| H1 | `app/History` (6.10: `run`, depth, monotonic clock) + `history.run` at every use case (5.6.1) + tests; replaces the no-op recorder of I3 | L (4) | - | D5 | 2 | - |
| H2 | `HistoryControls` + undo/redo rows; `undo_redo` | M (1.5) | 1 | H1, I1 | 2 | - |
| H3 | `app/Autosave`, `app/Prefs`, slot rotation with the pause path, the pristine-New skip, `beforeunload`, the banner, `?autosave=off`; `autosave_restore` | L (3) | 1 | H1, E1 | 2 | - |
| R1 | Layers (4) with per-frame enforcement, `addHelper` options, masks (main, pilot, preview), `PointerRay.enableAll`, audit | M (1.5); +0.5 if it lands before 08 P2-10 | - | Phase 1C (or 08 P2-10a-c, C31, Q18) | 3 | before P2-10 it also takes over P2-10a's retirement (C31) |
| R2 | `PreviewPass` scissor in device pixels (6.1); `PreviewWindow` reduction; transparent, square window; `preview_clean` | M (2); +1 if it lands before 08 P2-10 | 0.5 | R1 | 3 | before P2-10 it also takes over P2-10b (letterbox, clamps) |
| R3 | Render-on-demand scheduler; tick becomes state-only; `addPreRender` (C46); the visual/non-visual event classification and rule S9 (C47); invalidation incl. the hand-written gizmo's hover; safety net; `?render=always`; PerfHud frame counter; `render_on_demand` | M (2) | 0.5 | R2 | 3 | must be golden-identical; manual hover check; **hard gate for F5 T4 onward** (C55) |
| R4 | `PreviewPass.capture` (r128 multisample path, inside `withContentMaterials` unless `include.debug`, C48) + Export Camera Frame; `still_capture`. Optional, **required if 09 X4 is accepted** (counted once, here; C58) | M (2) | 0.5 | R2 | 3 | - |
| I1 | `interaction/Keymap` (all scopes, exact modifiers with `shift: 'any'`, Escape registry, `bindScopedKeys` with `actionTarget`), `core/typingTarget.js` extension, `KeyboardState` movement guard, `ShortcutHelp`, `registerActions`; moves every earlier feature listener into `KEYMAP` (C17) | M (2) | - | E1, 08 P2-9b | 3 | - |
| I2 | `SelectionManager` v2 (registry, providers, the wall-only priority rule, groups, `revalidate` with `isSelectable`, direct gizmo sync, `addObserver` and `addHoverHitObserver`, the `hoverAt` skeleton; C37), capture-phase click-select with the multi-pointer and window-release rules | M (1.5) | - | I1, 08 P2-9a | 3 | - |
| I3 | `vendor/three-addons.js` (classic r128 mode, controls + loaders incl. `fflate`) + `index.html` control scripts; `TransformGizmo` over `TransformControls` + proxy, `setPilot`, `getTransform(out, {mode})`, `setSnapIncrements`, Escape handler; `Selectable` v2 for camera/props; `setPose`; conversion of every landed feature Selectable (C15); `gizmo_click`, `pilot_gizmo` | L (5) | 1 | I2, R1, G6, 08 P2-9c-f, P2-9j | 3 | plus about 1 d per feature Selectable family (F2, F3, F5) that has landed by then |
| I4a | `OrbitController` over `OrbitControls` + dt keyboard + pilot gating + touch + `getPose`/`setPose`; sensitivity tuning and the owner's hands-on review; legacy framing kept; **the one help-badge rewrite** (C35) | L (4) | - | I3, 08 P2-9g-i, P2-11c | 3 | badge manifest restricted to the badge rectangle |
| I4b | Framing policy (6.14, `wallBox` from `FramingPolicy`, C34), no re-centring on edits (Q6); the orbit joins `stageAnchored` (C45) | M (1.5) | - | I4a | 3 | re-baselines every canvas screenshot and every JSON export |
| X1 | a11y on top of 08 P2-13c/P2-8d (3.9): focusable radios with the `change` handler, swatches, headers, aria-labels, canvas tabindex, live regions, reduced motion, `bindSwitchKeys`; `a11y_keyboard` | M (2) | 1 | E1, I1, 08 P2-13c, P2-8d | X | - |
| X2 | Contrast unit test with the 3.9 pair table and exceptions | S (0.5) | - | - | X | Feature 6 replaces the table |
| X3 | `geometry/TextureBudget` completion (C38): `SECTION_TEXTURE_BUDGET_PX` and `PANEL_TEXTURE_BUDGET_PX`, the 4096 side cap, the viewport canvas guard, `panelModePxPerLed` for 04's `panel` option (wall-wide), 05's `HDRI_LIMITS` reported to the HUD | M (1) | - | E3, 08 P2-12d | X | 08 delivers the module and the default panel path |
| X4 | PerfHud metrics, `requestRebuild` coalescing, perf budget doc, `perf_leak` scenario | M (1.5) | - | R3 | X | - |
| X5 | Panel-mode large-wall warning toast (in-memory, once per page session) | S (0.5) | - | E1 | X | - |
| U0 | `domain/hexColor.js`; exporters and LED-sim painters off `THREE.Color` | S (0.5) | - | D2 | F | allowed early |
| U1 | importmap + ESM shim at r128; `three-addons.js` ESM branch | M (1.5) | - | U0, R3, I4a, Feature 5 shipped (Q1) | F | zero-diff gate |
| U2 | Bump to the target release with the legacy colour pipeline, `forceSinglePass`, WebGL2 check, min builds | L (4) | - | U1 | F | includes a 2-day investigation time box (8.5) |
| U3 | Colour management on (C54); `colorSpace` on all canvas and image textures; raw vertex colours of the safe-distance floor and 08's "clamped" tint through `setRGB(…, SRGBColorSpace)`; default-framebuffer stills; 01's palette hook values and 06's colour matchers updated; probe JSON outputs declared (C53) | M (1.5) | - | U2 | F | screenshot re-baseline |
| U3b | 05 6.11 port (Option G) | M (1.5) | - | U3 | F | owned with Feature 5 |

**Effort totals** (the stated days; per-PR gate overhead as in 08 §1: about 0.15 d per PR for the manifest, the review of every expected diff, the amendment and three full harness runs):

| Scope | Sum |
|---|---|
| Required tasks, Tracks 2, 3 and X (excluding G5, D9, R4 and Track F) | **65.5 days**, of which harness scenarios 8.5 days (D0 at 3 d and G3 at 3.5 d, C58) |
| Per-PR gate overhead, 33 required PRs | about 5 days |
| **Required total** | **about 70 engineer-days (range 61-81)** |
| R4, if 09 X4 is accepted (C58) | +2 days, counted only here |
| R1/R2 landing before 08 P2-10 (the Q18 default) | +1.5 days here, and about 1.5 days fewer in spec 08 (P2-10a/b dropped) |
| I3's conversion of feature Selectables that landed before it (C15) | about 1 day (F3's marker) with the recommended order (C58); up to 3 days only if F2 or F5 took path B |
| Optional tasks (G5, D9, and R4 unless X4 is accepted) | about 1-3 days |
| Track F, after Feature 5 (U0-U3b), including overhead | about 10 days |

Revision 2 estimated about 55 days without overhead. Revision 3 adds the 11 new scenarios that no task owned (8.5 d), the per-PR gate overhead (5 d), D5 at XL, G3 at L and the G6 harness step; spec 08 now delivers part of D1, D2 (which absorbs revision 2's D3), D4, D5, D6, D7 and E3 (C25), which removes about 9 days from this spec. Revision 3.1 adds 2 days to D0 (the consolidated reconciliation, which removes about 8-9 days of documentation tasks from the sibling specs) and 0.5 day to G3 (which absorbs 09 T0.1).

**Critical paths.** Spec 08 merges in its own order; its "merged by day" column (08 §1, batch days without overhead, revision 3) gives each 08 gate: P2-0 day 4, P2-2 8.5, P2-3 13, P2-5b 15.5, P2-7 23, P2-9a-d 26, P2-13a 27.5, P2-13e 35, P2-9e-j 37, P2-10 39, P2-11 42.5. The 07 chains below are the stated days after that gate. "Earliest" assumes one person on 08 and one on 07; a sole maintainer works the sum (about 56 d for 08 and 68 d for 07), and the tracks then decide **when value arrives**, not the total.

| Milestone | 08 gate (08 day) | 07 chain after the gate | Earliest day |
|---|---|---|---|
| Feature 1 debug view / LED side | P2-2 (8.5) / P2-5b (15.5) | none | 8.5 / 15.5 |
| Feature 6 tokens, header, fonts, filenames | Phase 1 | none | 0 |
| Feature 3 (except persistence and step C) | none | none | 0 |
| Features 3 (T7) and 6 (T8, T10) persistence | P2-13e (35) | none | 35 |
| Feature 2 3a, path A (C58) | P2-9j (37; earlier when 08 pulls P2-9e-j into its feature-gate block), P2-13e (35) | I3 (42) and D5 (45.5) | 45.5 |
| Feature 5 rendering (R2 done), R1/R2 first (Q18 default) | none (Phase 1C) | R1 → R2 (5, including the +1.5 d for taking over P2-10a/b) | 5 (plus Feature 5's own work) |
| Feature 5 rendering, R1/R2 after P2-10 | P2-10 (39) | R1 → R2 (3.5) | 42.5 |
| Feature 5 T6 and loader factories (I3 done) | P2-9j (37) | I1, I2, G6, R1 ready earlier → I3 (5) | 42 (45.5 if R1 waits for P2-10) |
| Feature 4 UV-5 onward (D5 done) | P2-13e (35) | D1 → D2 → D4 → D5 (10.5) | 45.5 |
| Feature 5 T8 persistence (D6 done) | P2-13e (35) | … → D6 (12.5) | 47.5 |
| Undo for every feature (H1); Feature 2 3b | P2-13e (35) | … → D5 → H1 (14.5) | 49.5 |
| Autosave (H3) | P2-13e (35) | … → H1 → H3 (17.5) | 52.5 |
| `OrbitControls` (I4a) / framing (I4b) | P2-11c (42.5) | after I3 (42) → I4a (4) → I4b (1.5) | 46.5 / 48 |

Multiply by about 1.1-1.2 for per-commit gate overhead on both sides.

**Dependencies on other specs and fixes:**
- **This spec needs:**
  - Phase 1 complete, including 1C H1/H2 (B-H5, B-L12);
  - the spec 08 commits named in each task's "After" column (C21, C25): in summary P2-0 (G3), P2-1a-e, P2-5a and P2-13a (E3), P2-3a (D7), P2-13a and P2-13e (E2, D1, D6), P2-9a, b, c-f, g-i, j (I1-I4a), P2-11c (I4a), P2-12d (X3), P2-13c and P2-8d (X1), and P2-10 for R1/R2 unless they land first (C31);
  - task D0 before any code that touches a shared contract (C58).
- **Feature specs need this one** (only these gates, C29 and 1.4):
  - **Feature 1:** nothing. R1 later moves its normal lines to `LAYERS.DEBUG`; I1 moves its `N`/`Shift+N` listener into `KEYMAP`. It claims `N`, `Shift+N`, the `DEBUG` layer, Escape priority 70 and `sections[].face_orientation`.
  - **Feature 2:** path A (C58): I1-I3 before its gizmo work, plus D2, D4, D5; H1 for 3b's undo rows. It claims `section:` Selectables, the group composite, `F`, `[`, `]`, `mod+D`, `mod+A`, `Delete`/`Backspace`, Escape priority 75, and `offset`, `locked`, `detached`, `anchor_section_id`.
  - **Feature 3:** nothing (step C needs B-M11 fixed by P2-10a or R1). I3 converts its marker Selectable (or, if F3 lands after I3, it implements Selectable v2 directly); I1 its `O` key. It claims `O`, `pickPriority: 10`, `pivot` and `display.show_pivot_marker`.
  - **Feature 4:** D5 for UV-5c; I1 for UV-12 and H1 for UV-13 (path A: no fallback stack, C58); I2's observer hooks and 02 T23's hover hit for UV-17 (C37). It claims `U`, the `uv-viewer` scope, the `:uvViewer` preference, `uv_transform`, `pixel_map`, `uv` and `atlas`.
  - **Feature 5:** R1 + R2 (render), **R3 (hard for T4 onward, C55)**, I1-I3 (T6 and the loader factories), D4 + D5 + D6 (T8); soft H1, E1. It claims the `ENVIRONMENT` layer, `hdri`, `props.car.model`, the `'hdri-point'` Selectable, `H`, `Shift+H`, `Comma`, `Period`, the loader factories and `HdriCache` (the only IndexedDB store).
  - **Feature 6:** nothing beyond 08 P2-3b and P2-13e; X2 for the contrast test it extends.
  - **Spec 09 (if accepted):** I1 for `M`, the `menu`/`menu-button` scopes and the Escape priority 40 (3.8); G3 for its harness hooks (T0.1 merged, C57); R4 for X4 (C58); D5's hook map for its hydrators (C41).

---

## 11. Risks and open questions

### 11.1 Risks

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Spec 07 and spec 08 prescribe different code or baselines for the same commits again | medium / high | 08 §5.6 is the single bug-ownership table (C21); one set of ranges (C22), one sha256 module (C23), one ZIP key (C24), one re-baseline procedure (C26); D0 edits 08; 5.11 lists every id with its 08 commit; "mechanism only" for every 07 task; the `--expect` gate rejects a commit that re-flips an output without a manifest |
| The sibling specs drift from this spec again | medium / high | Section 0 was re-run against the files on disk; D0 edits them before D1; 4.4 rule 6 requires an amendment for any path change |
| A Track 3 task waits for an 08 batch from Phase 2's "remainder" (P2-9e-j at day 37, P2-10 at day 39, P2-11c at day 42.5) | high / medium | C31 and Q18 let R1/R2 land first; features never wait for R1-I4b unless their own spec names them (C29) |
| The sibling specs keep moving while this one is implemented (all eight were revised during revision 3) | medium / high | Section 0 records the revision each decision was checked against; D0 re-checks the residual edits; any later deviation needs an amendment to section 0 (4.4 rule 6) |
| I3 must convert several feature Selectables at once (C15) | medium / medium | The 5.4.1 mapping is fixed; the features' own gizmo tests and harness steps are I3's gate; the estimate adds about 1 d per landed family |
| The three.js controls misbehave in pilot mode (gizmo drawn or pickable; `OrbitControls.update()` re-aiming the pilot camera) | high if unhandled / medium | `setPilot` disables and hides the gizmo; `OrbitController.tick`, `onWallRebuilt` and `frame` do nothing while piloting; `pilot_gizmo`, `transform-gizmo.test.mjs`, `orbit-controller.test.mjs` (AC 54, 55) |
| A harness change coupled to a code change hides a lost check (for example `gizmo_drag` recording `skipped`) | medium / medium | Harness-only PRs proven identical on the base code (5.8.3); G6 before I3; AC 73 |
| `ProjectSession.apply` loses or reorders state (the camera pose after `setPreviewEnabled`) | medium / high | Binding step order (5.5.2), `session.test.mjs` spy order, `project_v2_roundtrip`, AC 59 |
| A missing `invalidate()` leaves stale frames after render-on-demand | medium / medium | Bus-wide subscription minus the non-visual list, camera-matrix safety net, the pointermove fallback for hover, `?render=always`, the R3 zero-diff golden gate, and the manual hover check (the harness does not cover hover) |
| `TransformControls` and click-select pointer-event races | low / medium | Capture-phase press record plus `markHandleDown` (6.4): independent of listener order and clock resolution; unit-tested in both orders and in `gizmo_click` |
| `OrbitControls` "feel" differs from the custom orbit (sensitivity, wheel curve) | high / low | Tune `rotateSpeed`/`zoomSpeed` to match at 1000 px height; owner hands-on review before merging I4a; framing is a separate step (I4b) |
| r128 classic control and loader scripts from jsdelivr | low / medium | Exact version with SRI; the boot watchdog names the failing host; optional vendoring into `js/vendor/three/` (same-origin, same SRI) if outages are observed |
| Upgrade (Track F) changes draw order or blending beyond the thresholds | medium / medium | U1 zero-diff checkpoint isolates delivery; U2 keeps the legacy colour pipeline and single-pass transparency; a 2-day investigation time box, then the owner decides |
| Feature 5's HDRI code is touched twice (r128, then U3b) | certain / low | 05 6.11 already lists the port; U3b is sized M; the alternative ordering is Q1 |
| Global undo inside the UV viewer undoes a non-UV edit | medium / low | One stack is the documented model (C16); the button title names the action being undone |
| Shared `github.io` origin: other owner sites can read or overwrite `localStorage` and IndexedDB | low / low | Namespaced keys; autosave content is not sensitive; validation on restore treats storage as untrusted input; 05's `HdriCache` checks each blob's SHA-256 |
| Snapshot-based undo cost on very large walls (200 sections) | low / low | About 100-200 KB per snapshot, about 1 ms capture; byte cap 32 MB; continuous edits coalesce; derived keys are left out of history snapshots |
| Very large project files (64 distinct 2 MB logos, about 179 MB of JSON) are slow to save and open | low / medium | Reachable but unusual; `MAX_IMPORT_BYTES` accepts them (AC 63, 69); the ZIP variant stores logos as files; the import toast reports the size |
| `ProjectSession.apply` misses a panel mirror, leaving a stale DOM after undo or open | medium / medium | `PROJECT_REPLACED` subscriber list in 5.10; `project_v2_roundtrip` and `undo_redo` scenarios compare full DOM states |
| Golden CI runtime or flakiness on GitHub runners | medium / low | Deterministic clock, autosave off and toast log (8.3); label-triggered plus a weekly self-comparison flake detector; artifacts kept for inspection |
| Pages caching window mixes module versions after a deploy | low / low | G5 query-string mitigation; documented "hard reload" note |
| Validator rejects or alters files the owner's external tools produce | low / medium | Out-of-range values are clamped with warnings, not rejected; only structural errors are fatal; v2 keeps every v1 key, so tools reading v1 keep reading the generative wall (7, AC 47) |

### 11.2 Open questions for the owner (each with a recommended default)

| # | Question | Recommended default |
|---|---|---|
| Q1 | Upgrade three.js before Feature 5, or stay on r128 through Feature 5 and upgrade afterwards? | **Stay on r128 through Feature 5**, then run U1-U3b as one series (5.7.1). Choose "upgrade first" only if you want HDRI written once for the new release; that costs about 3-5 extra days on Feature 5 and starts it later. |
| Q2 | Replace the custom gizmo and orbit (already fixed by 08 P2-9) with `TransformControls`/`OrbitControls`? | **Yes to both** (5.4.2, 5.4.3), after 08 P2-9 and with its behaviour as the regression contract (08 Q6), keeping a custom keyboard layer and using the r128 `examples/js` builds |
| Q3 | Should v2 Save also write a separate v1-compatible file for external tools that parse `sections[].panel.columns`? | **No.** v2 is a superset of v1 (C1), so those tools keep reading the **generative** wall: sections, panels, LEDs and curvature. They do not see offsets, pivot or face orientation (7); tools that need final placement read the v2 keys or the OBJ/glTF. Optionally publish the JSON Schema (D9). |
| Q4 | Section-name maximum length | **32** (matches today's `maxlength`); longer imported names are truncated with a warning |
| Q5 | Autosave with two tabs open on the same machine | **Last writer wins**, with an info toast in the other tab (6.11) |
| Q6 | Should the orbit target still re-centre on every wall edit (legacy P1 step 4)? | **No**: frame only on boot, open, new, restore, Reset view and `F` (I4b) |
| Q7 | In pilot mode, show helpers (grid, frustum, safe-distance floor, gizmo) in the main view? | **No**: pilot hides `HELPERS` (a clean camera view) and disables the gizmo. Feature 1's normal lines (`DEBUG`) and Feature 5's backdrop dome (`ENVIRONMENT`) stay visible. |
| Q8 | Show the safe-distance floor in the camera preview? | **No** (helper); revisit if wanted as a planning overlay |
| Q9 | Include camera stills export (R4) now? | **Yes, after R2** (cheap, valuable for previs), with the r128 multisample path; U3 switches it to the default-framebuffer path |
| Q10 | Pilot fly clamps posY ≥ 0.1 while the gizmo and inputs allow 0 (B-L10) | **Decided by 08 P2-8c:** the floor is 0 everywhere |
| Q11 | `Ctrl/Cmd+S` saves the project file (overriding the browser's "Save page"), even while a field has focus? | **Yes** (it commits the field first) |
| Q12 | Keep the per-session undo history across reloads (persist the stack)? | **No**: autosave restores state; history starts fresh after a reload |
| Q13 | Pin GitHub Actions by commit SHA (public repo hardening)? | **Yes**, refreshed by Dependabot (`.github/dependabot.yml`, `package-ecosystem: github-actions`) |
| Q14 | Texture budget for 04's per-panel UV option (`uv.panel_uvs = 'panel'`): 32 MP wall-wide across panel canvases, each side ≤ 4096 px, falling back to the section canvas beyond that | **Yes** (the default panel path is already bounded by 08 P2-12d; default walls unchanged) |
| Q15 | Sanity caps where aee55ac removed the UI caps: panel height 100 m, LED counts 65,536, per-panel curve ±180°; a 200-section limit with Add Section disabled at the cap; 64 distinct logo images | **Yes** (C22; spec 08 r3 adopts the same table): far above any real wall, and needed so that Save then Open never changes a project |
| Q16 | Pilot flights in the undo history: one entry per flight segment, merged when segments are less than 2 s apart? | **Yes** (5.6.1) |
| Q17 | Undo inside the UV viewer: one global stack (an undo there may revert a non-UV edit) or a separate UV stack? | **One global stack** (C16), as in DCC tools; the button title names the action. Until H1 lands, Feature 4 may use its temporary path-B `UvFallbackHistory`, which UV-18 deletes (C16). |
| Q18 | Which fixes the preview bugs first: 08 P2-10 (in the second renderer, day 39 of 08's order) or R1/R2 (the single renderer, Phase 1C only)? (C31) | **R1/R2 first.** The fix lands once, in the code that stays; 08 drops P2-10a/b (about 1.5 days of code that R2 would delete) and keeps P2-10c's labels in `PreviewPass`; Feature 5's render work can start right after Phase 1 instead of after day 39. Choose "P2-10 first" only if Track 3 will not start before Phase 2 ends. |
| Q19 | Exact modifier matching (3.8): `Shift+G` no longer triggers `G` (08 P2-9b allowed it) | **Yes**: it is what keeps `H`/`Shift+H` and `N`/`Shift+N` from firing twice; the release note mentions it |
| Q20 | Logos stay inline in project files (up to 2 MB each, at most 64 distinct images), so a file can reach about 179 MB | **Yes** (self-contained files, 08 Q14); recommend Export All (ZIP) for logo-heavy projects |
