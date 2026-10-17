# Morph LED Configurator: improvement plan

| | |
|---|---|
| **Purpose** | The owner's entry point to the post-refactor improvements. This page says what will be built, in which order, what it costs and what you need to decide. The nine specs in [`docs/improvements/`](improvements/) contain the implementation detail. |
| **Date** | 2026-10-16 |
| **Based on** | Specs 01-09 as they are on disk: 01, 02, 03, 05, 06, 07 and 08 at revision 3.1; 04 and 09 at revision 2.1. Each of those revisions applies the cross-spec consistency review, whose decisions are recorded in [07 §0](improvements/07-platform-foundations.md) (C1-C62). The plan review's follow-up edits (marked "Plan review (2026-10-16)" in each status row) are applied to 02, 03, 04, 05, 06, 07 and 09: Detached deferred to 3b, the pivot's Q5 consequence and a per-device default, the UV default explained, a quality bar for the car, the prototype's private location, and corrected cross-references. |
| **Binding contracts** | [`ARCHITECTURE.md`](ARCHITECTURE.md) (modules, events, `Strategies`/`LEGACY_SITES`, §9 feature seams) and [`REFACTOR_PLAN.md`](REFACTOR_PLAN.md). This plan changes neither. Amendments to them land with the code that needs them, or in task 07 D0. |
| **Starting line** | Phase 1 (the move from one HTML file to modules) merged with the golden-master harness green. Phase 1C H1/H2 have already landed. Nothing in this plan is implemented yet. |

---

## 1. Executive summary

**Every item on your list has an implementation-ready spec.** The five requests and the Morph branding are specs 01-06. Three further specs support them:

- spec 08 is the Phase 2 bug-fix roadmap, which fixes all 57 verified defects ([`DEFECTS.md`](DEFECTS.md));
- spec 07 builds the shared platform the features need: one project file, undo, a single renderer, selection and the gizmo;
- spec 09 lists optional ideas beyond your list.

Section 4 maps each request to its spec.

**Order.** The plan follows your priorities.

1. **Normals come first.** The inverted normals are fixed in every export after the kick-off (M0, 3 days) and about 8.5 days of Phase 2 work (milestone M1): usable on about day 13.5. The normals debug view follows right after (M3).
2. **Branding and the pivot start right after Phase 1** (M2, M5). With two people they run in parallel with the bug fixes; a sole maintainer takes them right after the normals work (§3.4). Branding lands before the other feature UIs, so those ship in Morph colours from the start.
3. **The pivot lands before section offsets** (M5 before M10). Offsets are then built on the pivot's coordinate frames, so there is one composition rule.
4. **The UV bug fix (08 P2-7) lands before the UV editor (M4 before M11).** The editor's export step (UV-8b) lands before the HDRI bake (T13).
5. **The single renderer (M6) lands before any HDRI work (M12).**

**Effort.** The nine specs add up to about **318.5 engineer-days**, plus about **10 days** for the later three.js upgrade.
- Your list, together with the bug fixes and platform work it depends on, is about **273 days**: 56 (Phase 2) + 70.5 (platform) + 146.5 (the six feature specs).
- A lean core, without the HDRI increments (16.5), section-editing 3b (8), the deferred Detached sections (2) and the optional branding tasks (2.25), is about **244 days** (about 246 if you keep Detached in the section-editing MVP, decision A6).
- The spec totals already include the review's consolidations: one documentation commit replaces six, and nothing is built twice. That saves about 11 days compared with the pre-review sum.
- **Calendar.** For one maintainer the full route is about 13 working months; for two people about 6.6 months. §3.4 gives the day each request becomes usable.

**Two routes.** Even the lean core puts every requested feature except normals, pivot and branding behind about 45 gate-days of platform work (v2 file and session, keymap and gizmo rewrite, single renderer, undo and autosave). The **minimum path** (§1.1) uses the fallbacks the specs already describe (path B, session-only state) to deliver all six requests in about **162 days** (about 7.7 months alone, about 3.9 months for two people; on the full route the last request, the UV editor, is usable on about day 223 alone or day 130 for two), and leaves the platform for later. You choose the route (decision A0; decided 2026-10-16: the full platform route).

**What we need from you now** (§8, part A):
- the route: the full platform route or the minimum path first (A0);
- the go-ahead to publish the 8 Morph logo files in the public repo;
- the curve-convention decision (B-L1);
- the "path A" order for section editing;
- sign-off on the shared gizmo contract;
- which spec 09 ideas you want.

Every question has a recommended default, so nothing stalls if you accept the defaults.

**Decided 2026-10-16** (§8): the full platform route (A0), publication of the 8 brand files approved (A8), and the recommended default for every other question, including keeping the curve convention (A1), path A for section editing (A4), the gizmo sign-off (A7) and spec 09's Release A (A14).

### 1.1 Minimum path per request

The full route (§3) builds the shared platform first, so that every feature lands once, with undo, autosave, one project file and one gizmo. The minimum path delivers your six requests first, at the "basic" level you asked for, using fallbacks the specs already describe: path B for section editing and the UV editor (02 §2.4, 04 header), session-only state where a spec allows it (principle 6), and the HDRI MVP without its gizmo and persistence tasks. Everything it cuts stays specified and can follow in §3's order.

Days are engineer-days including the ≈ 20 % gate overhead on Phase 2 work; "usable by" counts working days from Phase 1 merged, with M0 first (about 21 working days per month). Two people split the work as: person A takes M0, M1, M4 and the gate block, then section editing and the HDRI MVP; person B takes branding, the normals view, the pivot, the single renderer and the pivot persistence, then the UV editor.

| # | Request | What the minimum path ships | Cut or deferred to the platform route | Effort (d) | Usable by (day): one maintainer / two people |
|---|---|---|---|---|---|
| – | Shared base | M0 (decisions, 07 D0); M1 (08 P2-0, P2-5a, P2-1, P2-2, 07 G1); M4 (every owner-visible fix, including the UV fix P2-7); 08's feature-gate block (P2-8b-d, P2-9a-d, P2-13a and the v2 file P2-13e) | – | 3 + 10.5 + 17.5 + 14.5 | UV fix: 71.5 / 31 |
| 1 | Normals flipped, plus a debug view | M1's flip in every export; 01 F1-0 … F1-3 (normal lines, face orientation, normal colours, `N`/`Shift+N`) | LED side and `FrontSide` with the cabinet back (01 F1-4, F1-5, 7 d) | 12 | flip 13.5 / 13.5; debug view 25.5 / 27 |
| 6 | Morph branding | 06 core (T1-T9, T12), unchanged | optional T10, T13 (2.25 d); T4b and the README lockups still wait for your Q2 | 15 | 40.5 / 15 |
| 3 | Pivot modes and offset | 03 in full, saved in the project (T7 on P2-13e) and with the marker visible once 07 R1 lands | step F (true framing, 08 P2-11c in M8); optional T14, T15, T17 | 19 | session-only 54, saved 91 / 40.5, saved 53 |
| 2 | Section selection, easier editing, basic offsets | 02 3a in **path B**: spec 03's gizmo hook set, its own `SelectionManager` changes, `createDialogs` confirm, on the gate block above | Detached (T17), all of 3b (lock, reorder, duplicate, hover, snapping, shortcuts, undo rows), 07 I1-I3 | 26.5 | 117.5 / 72 |
| 4 | UVs that fill 0..1, plus a UV viewer and editor | 04 in **path B**: `UvFallbackHistory` (its own undo), the `U` branch in `ViewportInput`, in-memory viewer preferences, its own selection observer hooks | UV-5c persistence (UV transforms are session-only until 07 D4/D5), the global undo stack (07 H1), `app/Prefs` | 27 | 144.5 / 80 |
| 5 | HDRI projected from a point, with rotation | 07 R1-R3 (single renderer and render-on-demand: a hard gate with no fallback, 7 d) and the 05 MVP without T6 and T8: the custom projection point is typed into `#hdri-point-x/y/z`, and the HDR loader comes from a loaders-only slice of 07 I3's `vendor/three-addons.js` (0.5 d) | dragging the point with the gizmo (05 T6, needs 07 I1-I3), persistence and relink (05 T8, needs 07 D4-D6; the HDRI is session-only), every increment including the car | 7 + 0.5 + 9.5 | 162 / 82 |
| | **Total** | all six requests | M8 (true framing, preview labels, texture LRU, toggle accessibility, curve-convention code, `Strategies` deletion: about 16 bug ids stay open); M13 (`OrbitControls`, accessibility pass, perf HUD, Pages deploy); 07 D1-D9, E1-E4, G2-G6, H1-H3, I1-I4b, X1-X5 (no undo, autosave, Project section, toasts or golden CI) | **≈ 162** | **≈ 162 (≈ 7.7 months) / ≈ 82 (≈ 3.9 months)** |

Notes:
- The one-maintainer order is M0, M1, normals view, branding, pivot, M4, the gate block, pivot persistence, section editing, UV editor, single renderer, HDRI. It merges the pivot before P2-8, which needs 03 Q17 answered "relax" (nothing in spec 03 depends on P2-8); otherwise the pivot follows M4 and arrives at about day 71.5, with the UV fix at about day 58. Both schedules also pull 08 P2-9b (the shared typing guard, about half a day) ahead of 01 T7, which consumes it.
- **Cost of switching later.** Adding the platform afterwards costs about 5 days more than the full route: path B adds about 1.5 days to 02 and 1 day to 04 now, and later 07 I3 converts the path-B section adapter (about 2 days, 07 C15) and 04 UV-18 removes its fallbacks (0.5 day). Everything else in §3 is unchanged.
- **Risks you accept on this path:** no undo (02 R9: every delete asks for confirmation), UV transforms and the HDRI are lost on reload until their persistence lands, no golden CI on pull requests, and the 16 Phase 2 remainder bugs stay open.

---

## 2. Guiding principles

1. **One golden-master re-baseline per intentional change.** The procedure is the same for every spec ([08 §8.1](improvements/08-bugfix-roadmap.md)):
   - the baseline is the parent commit's output;
   - each commit first writes its expected-change manifest (`tests/regression/expected/<commit-id>.json`) and then runs the full harness;
   - `compare.mjs --expect` fails on any change the manifest does not declare, and also on a declared change that did not happen;
   - a person reviews every expected diff before the candidate is promoted.

   Steps that should change nothing carry an empty manifest. The only standing allowance is the measured harness jitter (`_nondeterminism.json`). Merges stay serial, one golden-changing commit at a time. Harness-only changes land in their own PRs first.
2. **Fix by flipping `Strategies` and retiring `LEGACY` rows.** Phase 1 keeps every known defect, each behind one `Strategies` switch or one `// LEGACY(B-xx)` tag that is listed in `LEGACY_SITES`. A fix commit:
   - flips exactly one switch, or edits one tagged site;
   - removes the matching `LEGACY_SITES` row;
   - amends ARCHITECTURE §8 in the same commit.

   Each commit fixes one bug for one consumer. `LegacyProfiles` keeps the old values for the oracle tests. Once Feature 1's FrontSide step and Feature 3's step A have flipped their keys, 08 P2-13g deletes `Strategies`: the mesh profiles move to `geometry/MeshProfiles.js` and framing moves to `geometry/FramingPolicy.js`.
3. **No build step.** Native ES modules are served as static files from GitHub Pages, with no bundler and no npm runtime dependencies. CI runs without `npm install`.
   - three.js stays on r128 until Feature 5 ships. Its addons are classic scripts, pinned with SRI, loaded through one module, `js/vendor/three-addons.js`.
   - The later upgrade (Track F) moves to an importmap, still without a build step.
4. **Defaults are identity-exact.** At its default settings, a new feature leaves every existing export byte-identical and every screenshot pixel-identical. Visible changes land in separate steps, each re-baselined on its own. Examples: the default pivot, zero section offsets, and per-feature JSON keys that stay absent until the feature lands.
5. **One owner per contract.** [07 §0](improvements/07-platform-foundations.md) is binding where specs overlap. That gives one of each of the following:
   - project schema (07 §4.2: snake_case, a superset of v1, `"version": "2.<n>"`);
   - undo stack and keymap;
   - render-layer table and render-order registry;
   - layout accessor (`WallController.currentLayout`) and coordinate-frame rule.

   [08 §5.6](improvements/08-bugfix-roadmap.md) is the single bug-ownership table.
6. **Features merge when their own gates are in.** Feature work does not wait for the end of Phase 2. [08 §1.1](improvements/08-bugfix-roadmap.md) lists the hard gates for each task group. Until a feature's persistence gate lands, its state lasts for the session only, and its release note says so.
7. **Contract changes travel with the code.** ARCHITECTURE.md is amended in the same commit as the code it describes. The cross-spec edits arrive in one documentation commit, 07 D0, before any shared-contract code.

---

## 3. Roadmap

### 3.1 Milestones at a glance

Effort is in engineer-days, taken from the specs. Phase 2 (08) and platform (07) work also carry a per-commit gate overhead of about 20%, shown as "≈ with overhead". Feature specs already include their re-baseline work.

| ID | Milestone | Request | Effort | Can start after |
|---|---|---|---|---|
| M0 | Kick-off: your decisions and the reconciliation commit (07 D0) | all | 3 | Phase 1 merged |
| M1 | **Normals flipped by default** in every export (08 P2-0, P2-5a, P2-1, P2-2; 07 G1) | 1 | 9 (≈ 10.5) | M0 |
| M2 | **Morph branding**, core (06 T1-T7, T9, T12; T4b once you approve; T8 after M7a) | branding | 15 (+2.25 optional) | Phase 1, in parallel |
| M3 | **Normals debug view and LED side** (01 T1-T11) | 1 | 19 | M1; the LED side part also needs M4 |
| M4 | **Owner-visible fixes, including the UV fix** (08 P2-8a, P2-3, P2-4, P2-5b, P2-6, P2-12a/d, P2-7) | 4, 1 | 14.5 (≈ 17.5) | M1 |
| M5 | **Configurable pivot** (03 T1-T10, T12, T13, T16) | 3 | 19 (17-21) | M0 (gizmo sign-off), in parallel |
| M6 | **Single renderer** (07 R1 → R2 → R3) | 5 (prerequisite) | 5.5-7 | Phase 1, in parallel |
| M7a | Project file v2 and session (08 P2-8b-d, P2-13a, P2-13e; 07 D1, D2, D4-D7) | 2-6 (saving) | 23 (≈ 26) | M4 |
| M7b | Keymap, selection and gizmo (08 P2-9a-j; 07 G3, G4, G6, E1, I1-I3) | 2, 4, 5 | 20.5 (≈ 23) | M7a's P2-8b-d, M6 (R1), 01 T2 |
| M8 | Phase 2 remainder: true framing, preview, clean-up (08 P2-10, P2-11, P2-12b/c, P2-13b/c/f/g) | 3 (step F) | 8-9.5 (≈ 11) | M4; merges after M7a in 08's order |
| M9 | Undo, autosave, project section, error messages (07 H1-H3, D8, E2-E4) | all | 16.5 (≈ 18) | M7a, M7b |
| M10 | **Section selection and offsets** (02 3a, then 3b with Detached) | 2 | 35 (3a 25; 3b 8 + Detached 2) | M5, M7a, M7b; 3b also M9 |
| M11 | **Clean UVs and the UV viewer/editor** (04 UV-5a-UV-17) | 4 | 27 (24-31) | M4, M7a, M7b, M9 |
| M12 | **HDRI previs**: MVP, then approved increments (05) | 5 | MVP 12.75; all 29.25 | M6, M7a, M7b; the bake also needs M11 |
| M13 | Platform polish (07 I4a, I4b, X1-X5, G2; R4 if 09 X4 is accepted) | quality | 11.5 (+2) | M7b, M8 |
| M14 | Additional ideas, releases A, B and C (09) | beyond the list | 45.5 (A: 14.5) | A: M7a, E1, M8, R4 |
| M15 | three.js upgrade, Track F (07 U0-U3b) | maintenance | ≈ 10 | M12 shipped |

### 3.2 Dependency graph

Read "→" as "merges before". "⇐" lists what a milestone waits for.

```
Phase 1 merged (WP1-WP10, 1C H1/H2), harness green
│
M0  Kick-off: decisions (§8 A) + 07 D0 docs commit
│
├── M1  Normals flipped: 08 P2-0 → P2-5a → P2-1 (B-H3 encoder) → P2-2 (winding + normals); 07 G1 CI
│     ├── M3 part 1  Debug view: F1-0 → F1-1 → F1-2 → F1-3
│     └── M4  Owner-visible fixes: P2-8a → P2-3 → P2-4 → P2-5b → P2-6 → P2-12a/d → P2-7 (UV fix)
│           ├── M3 part 2  LED side (F1-4) → FrontSide + cabinet back (F1-5)   ⇐ P2-3b, P2-5b, owner Q1/Q2/Q5
│           ├── M7a  P2-8b-d → P2-13a → P2-13e (v2 file) → 07 D1 → D2 → D4 → D5 (session) → D6; D7
│           │     └── M7b  P2-9a-j; 07 G3 → G4 → G6; E1 → I1 (keymap) → I2 (selection) → I3 (gizmo, ⇐ R1)
│           │           └── M9  H1 (undo, ⇐ D5) → H2 (⇐ I1), H3 (autosave); D8; E2 → E3; E4
│           └── M8  P2-10c → P2-11 (true framing = pivot step F) → P2-12b/c → P2-13b/c/f/g (P2-13g last)
├── M2  Branding core: 06 T1 → T2 → T3 → T4a → T5 → T7 (T6a/b, T4c alongside; T4b ⇐ your OK)
├── M5  Pivot steps A-E: 03 T1 → … → T10   (T5 ⇐ T13 sign-off; T7 ⇐ P2-13e; step C ⇐ R1)
└── M6  Single renderer: 07 R1 → R2 → R3

Milestones that wait on several lanes
M10  Sections + offsets, 3a  ⇐ M5 (pivot first) + M7a + M7b + the recorded B-L1 decision;  3b ⇐ M9 (H1)
M11  UVs + UV editor         ⇐ M4 (P2-7, P2-12d) + M7a (D5) + M7b (I1, I2) + M9 (H1);  UV-17 ⇐ 02 T23 (M10 3b)
M12  HDRI MVP                ⇐ M6 (R3 is hard for T4 onward) + M7b (I1-I3) + M7a (D4-D6);  bake T13 ⇐ M11 (UV-8b)
M13  Platform polish         ⇐ M7b (I3) + M8 (P2-11c)
M14  Additional ideas        A ⇐ M7a, E1, M8 (P2-11), 07 R4;  X10 ⇐ M10;  X11 ⇐ M3, M5, M11;  X13 ⇐ M7b, M6
M15  three.js upgrade        ⇐ M12 shipped
```

### 3.3 Milestone contents and definition of done

| ID | Includes | Done when |
|---|---|---|
| M0 | Your part-A decisions (§8), including the route (A0). 07 D0, one documentation-only commit: the review's resolutions in every spec; the coordinate frame each consumer reads (ARCHITECTURE §1.4); named rebuild-policy row ids (§6.2); the §9 pivot row rewritten (no wall root transform). | Decisions recorded (08 §5.6, ARCHITECTURE §1.4) and D0 merged. No code. |
| M1 | P2-0 harness tooling (`--expect`, nondeterminism allowlist, 8 new `p2_*` scenarios, `tools/check-orientation.mjs`); P2-5a safe-distance OBJ download; P2-1 chunked glTF encoder and canvas guards; P2-2 winding and normals; 07 G1 (static checks and unit tests on every push). | Every OBJ and glTF export, ZIP entries included, passes the orientation checker (stage-facing triangles, per-vertex normals, glTF `NORMAL`); large walls export without `RangeError`; viewport screenshots unchanged (P2-2a's manifest is empty). |
| M2 | Inline styles to classes; `ThemeBridge` (CSS tokens drive chrome, scene and canvases); Morph colours, type and text header; Fivefold logo removed; two-tone scene overlays; export strings and `morph-led-wall.*` filenames; new palette. With your OK: wordmark, monogram watermark, favicon, `NOTICE.md` (T4b, T9). | Each step re-baselined on its own; T1-T3 and T6b proven identical; token parity (U4) and contrast tests green. The JSON `generator` (T8) and the optional PNG brand mark (T10) follow M7a. |
| M3 | Normal lines (`N`); face-orientation and normal-colour shading (`Shift+N`) with popover and legend; per-section LED Side and "Flip LED Side (All Sections)"; `FrontSide` walls with a dark cabinet-back shell. | Debug is off by default and absent from exports, picking, preview lines and stills; a reversed section shows its cabinet back from the stage; steps F1-0 … F1-5 each re-baselined. |
| M4 | Integer counts and caps; safe import (escaped names, validated and clamped values, corrections reported); clean preview-off in pilot; mitred safe-distance band facing +Y; lossless ZIP with matching texture names; one texture per section in panel mode; the UV fix (one pixel-accurate atlas for viewport, OBJ and glTF; `TEXCOORD_0`; one material per section; atlas PNG in every ZIP). | Every row of the [08 §0](improvements/08-bugfix-roadmap.md) table shows its harness proof. |
| M5 | Wall Pivot panel (three modes, offset, "Keep stage layout"); draggable marker (`O`); exports in the export frame; re-centred grid; v2 persistence (T7, after P2-13e); marker visible by default (step C, after R1). | Step A proves zero diffs at the default pivot; steps A′-E each re-baselined. Step F (true framing) is 08 P2-11c, in M8. |
| M6 | Camera preview drawn into the main canvas, letterboxed to the filmback; four layers (`DEFAULT`, `HELPERS`, `ENVIRONMENT`, `DEBUG`); render on demand; `SceneManager.addPreRender`. | One WebGL context; no helpers or orange tint in the preview (B-M9, B-M11, B-L32); R3 golden-identical. If R1/R2 land before 08 P2-10 (Q18), 08 drops P2-10a/b. |
| M7a | v2 writer and reader (07 §4.2 skeleton, v1 migration, schema-driven validator); `ProjectSession.apply` with a hook map the features register into; logos by reference (`AssetStore`); ZIP open; `core/sha256.js`. | Save then Open never changes a project; a v1 file imports as a wall-only project with its legacy colours. |
| M7b | 08's interaction fixes (click-select, shortcut filter, gizmo sign and axes, pilot movement); harness determinism and golden CI (G3, G4, G6); Notifier toasts; `KEYMAP` with one typing guard, an Escape registry and `?` help; `SelectionManager` v2 with observer hooks; `TransformControls` behind a proxy (converts the pivot marker). | Every shortcut is a `KEYMAP` row; selection on click (< 4 px travel) in any mode; gizmo hidden in pilot. |
| M8 | Preview labels; rotation-aware coverage ("Not aimed at wall"); true framing with `FramingPolicy`'s three named boxes (the pivot's step F); frustum depth; tile-cache LRU; toggle accessibility; curve-convention code; `Strategies` deleted (P2-13g, last). | Every bug id closed in [08 §5.6](improvements/08-bugfix-roadmap.md). |
| M9 | One global undo stack for every feature; header undo/redo; two-slot autosave with a restore banner; Project section (name, Save, Open, New); toasts and dialogs instead of `alert()`; WebGL context-loss recovery. | `undo_redo`, `autosave_restore` and `project_v2_roundtrip` green. |
| M10 | 3a: picking in all mesh modes, multi-select and batch editor, per-section Transform Offsets, translate/rotate gizmo with cancel, v2 fields. 3b: lock, reorder, duplicate, hover, snapping, shortcuts, undo rows, and Detached sections with a host (02 T17; in 3a only if you choose so, A6). | Zero offsets keep every export byte-identical; offsets and drags never move the pivot, while detaching can move a centred pivot and says so (02 §6.17); 02's acceptance criteria pass. |
| M11 | Two Combined layouts, per-section 0..1 (each section fills the UV space) and the pixel-accurate atlas (the wall fills it), with the default chosen by B7 after your B8 test; per-section UV transform baked into every output; section-space panel exports; floating UV viewer and editor (`U`); hover readout. | Your Unreal/disguise check passed before UV-7; UV-7, UV-8a and UV-8b shipped in one release. |
| M12 | MVP: `.hdr`/`.jpg`/`.png` projected from a projection point; yaw, pitch, roll, exposure with Auto, tone map; backdrop dome; preview parity; persistence by reference with relink; `H`, `Shift+H`, `,`, `.`. Increments: LED mask, coverage outline, remember on device, EXR, quality tiers, sample HDRI, reflective car, stage reflections, bake. | MVP harness scenario green; each increment approved and re-baselined on its own; the car meets 05's quality bar (AC 33) and your side-by-side sign-off before T11. |
| M13 | `OrbitControls` (touch, delta-time WASD); framing only on boot, open, `F` and Reset; the one help-badge rewrite; accessibility pass; perf HUD and texture budgets; Pages deploy from Actions. | Your hands-on review of the orbit feel before I4a merges; `a11y_keyboard` and `perf_leak` green. |
| M14 | Release A: X1-X4 (product library, power/weight/data estimates, moiré calculator, screenshots). Releases B and C: see §7.2. | Per item: its scenario green, one revision bump (numbered at merge), one JSON re-baseline. |
| M15 | U1 importmap at r128 (zero diffs) → U2 current release (screenshot-only diffs) → U3 colour management, U3b HDRI port. | Each step's screenshot-only manifest reviewed and promoted. |

### 3.4 Timing: when each request becomes usable

The table has two kinds of figures.
- **Gates clear (day)** is when a result's hard gates have merged: 07 §10's "Earliest day" and 08 §1.1. It counts 08 batch-days without overhead and without M0, and assumes Phase 2 and the platform run in parallel. It does **not** include the result's own work, so it is the earliest day that work can merge, not the day you can use it. For results that are themselves Phase 2 work, it shows 08's merge day.
- **Usable by (day)** is resource-loaded: the day the result is merged and usable in the app. It counts M0 (3 days) before M1, the result's own effort, the ≈ 20 % gate overhead on Phase 2 and platform work, and who is free to do the work. Days are working days from Phase 1 merged; a month is about 21 working days.

| Request | Result | Gates clear (day) | Own work (d) | Usable by: one maintainer | Usable by: two people |
|---|---|---|---|---|---|
| 1 | Normals flipped in every export (M1) | 08 P2-2 merges at 8.5 | 10.5 (M1) | 13.5 | 13.5 |
| 1 | Normals debug view (01 F1-0 … F1-3) | 8.5 | 12 | 25.5 | 27 |
| 6 | Branding core: tokens, header, fonts, palette, filenames (06 T1-T7, T9, T12) | 0 | 15 | 40 | 15 |
| 3 | Pivot: modes, offset, marker, exports at the pivot; session-only (03 T1-T6, T10, T12, T13) | 0 | 13.5 | 54 | 40 |
| 4 | UV fix: pixel-accurate atlas, glTF UVs (08 P2-7, last step of M4) | 08 P2-7 merges at 23 | 17.5 (M4) | 71 | 31 |
| 1 | LED side and `FrontSide` with the cabinet back (01 F1-4, F1-5) | 15.5 | 7 | 78 | 54 |
| 3 | Pivot saved in the project, marker on by default (03 T7, T9, T8) | 35 | 5.5 | 117 | 60 |
| 2 | Section editing 3a (02) | 45.5 | 25 | 165 | 105 |
| 5 | HDRI MVP (05 T1-T9, T14) | R1-R2 about 5; I3 42; D6 47.5 | 12.75 | 177.5 | 103 |
| all | Undo and autosave (M9) | 49.5 / 52.5 | 18 (M9) | 195.5 | 98 |
| 4 | Every section fills 0..1; UV viewer and editor (M11) | 49.5 (H1) | 27 | 222.5 | 130 |
| 2 | Section editing 3b, with Detached (02) | 49.5 | 10 | 232.5 | 115 |
| 5 | Reflective car (05 T10-T12) | the MVP | 5.5 | 241 | 123.5 |
| – | Everything in the ≈ 273-day scope, M8 and M13 last | – | – | 271.5 (≈ 13 months) | 139.5 (≈ 6.6 months) |

**Assumed order, one maintainer** (requests first, then the platform polish): M0, M1, normals view, M2, pivot, M4, LED side and `FrontSide`, M6, M7a, pivot persistence, M7b, 3a, HDRI MVP, M9, M11, 3b with Detached, the HDRI increments (look, car, the rest, bake), M8, M13. The pivot merges before P2-8 here, which needs 03 Q17 answered "relax" (nothing in spec 03 depends on P2-8); keeping the gate moves the pivot to about day 71 and the UV fix to about day 58.

**Assumed split, two people.** Person A works the critical chain: M0, M1, M4, 08's feature-gate block (P2-8b-d, P2-9a-j, P2-13a, P2-13e), 07 D1-D7, 07 G3, G4, G6, E1 and I1-I3, M9, then the rest of the HDRI MVP (05 T1, T6, T8, T9, T14), M11 and the bake. Person B takes the early requests and the rest: M2, normals view, pivot, M6, LED side and `FrontSide`, pivot persistence, the HDRI render groundwork (05 T2-T5, T7), M8 while waiting for I3, 3a, 3b, the HDRI look increments and the car, the rest of the increments, and M13. Each person carries about 135 days. Branding T1-T3 start during M0 because they touch no shared contract.

Both schedules pull 08 P2-9b (the shared typing guard, about half a day) ahead of 01 T7, which consumes it. Merges stay serial; a result is usable when its last commit has merged through the §2 gate. The minimum path (§1.1) gives about the same dates for the early results and much earlier ones for section editing, the UV editor and the HDRI.

---

## 4. Your requests, one by one

| # | Request | Covered by | Milestones | First visible result |
|---|---|---|---|---|
| 1 | Inverted normals flipped by default, plus a debug option to show normals | 08 P2-1/P2-2, [01-normals](improvements/01-normals.md) | M1, M3 | All exports face the stage (M1) |
| 2 | Select sections, edit them easily, basic position/rotation offsets that keep the layout generative | [02-section-editing-offsets](improvements/02-section-editing-offsets.md) | M10 | Click-to-select and offsets (3a) |
| 3 | Configurable pivot (bottom-left, middle of wall mesh, middle of entire wall on the floor) plus an offset | [03-pivot](improvements/03-pivot.md), 08 P2-11c | M5, M8 | Pivot panel; exports land at the pivot |
| 4 | Clean per-section UVs filling 0..1, plus a UV viewer with editing | 08 P2-7/P2-12d, [04-uvs-uv-editor](improvements/04-uvs-uv-editor.md) | M4, M11 | UVs match textures (M4); 0..1 and editor (M11) |
| 5 | HDRI projected onto the wall with projection-point and rotation controls; a better reflective car | [05-hdri-projection](improvements/05-hdri-projection.md), 07 R1-R3 | M6, M12 | HDRI MVP; the car as an increment |
| 6 | Morph business branding | [06-morph-branding](improvements/06-morph-branding.md) | M2 | Rebranded UI right after Phase 1 |

### 4.1 Normals flipped by default, plus a normals debug view

Specs: [docs/improvements/01-normals.md](improvements/01-normals.md) for the feature; [docs/improvements/08-bugfix-roadmap.md](improvements/08-bugfix-roadmap.md) P2-1 and P2-2 for the flip itself.

**The problem.** The triangles are wound clockwise as seen from the stage, and the stored normals point away from the faces. Exported walls therefore look inside-out in Blender, Unreal and Unity (B-H1, B-H2, B-L3).

**What you get.**
- **The flip (08 P2-2).** There is one winding source (`WallMeshBuilder.quadIndices`, `'ccw'`). It keeps the same diagonal, so viewport pixels do not change.
  - Curved walls get averaged normals, with hard creases at section seams.
  - OBJ gets per-vertex `vn` and glTF gets a `NORMAL` accessor.
  - The safe-distance floor faces up (P2-5b, in M4).
  - The glTF encoder fix (P2-1) must land first: adding normals pushes the `large_wall` glTF to 121,056 bytes, inside the size band where the old encoder throws.
- **The LED side.** A per-section "LED Side" select (Stage side or Reversed) and "Flip LED Side (All Sections)" handle walls that genuinely face away from the stage. The value is saved in the project and honoured by the viewport, every export, the safe zone and coverage.
- **What you see matches the engine.** Wall materials become single-sided. A dark matte cabinet back (`#403C37`) shows wherever you look at a wall from behind, so a section facing the wrong way is obvious in the app.
- **The debug view** has its own toolbar buttons, a popover and a legend:
  - vertex normals (lime) and face normals (magenta) as one cheap line set, capped and decimated on huge walls;
  - face orientation (blue for front, red for back, as in Blender);
  - world-space normal colours.

  `N` toggles the lines and `Shift+N` cycles the shading. The debug view never appears in exports, picking, preview lines or client stills.
- **A checker for any export.** `tools/check-orientation.mjs` checks any OBJ, glTF, ZIP or folder, and a golden test runs it over every harness export.

**Delivery.** M1 carries the flip (about 8.5 days of Phase 2 work). M3 carries 01 T1-T11, about 19 days. The FrontSide step lands last, after the LED side control exists and you have signed off.

**Your decisions.** Before F1-5 you need to answer 01 Q1 (cabinet colour), Q2 (per-section LED side) and Q5 (no "legacy inverted" export option); see §8.

### 4.2 Section selection, easier editing and per-section offsets

Spec: [docs/improvements/02-section-editing-offsets.md](improvements/02-section-editing-offsets.md).

**What you get.**
- **Selection.** You can click any section in the viewport, in all three mesh modes and from either side. The section is outlined and tinted, and its card highlights, expands and scrolls into view. Shift-click adds to the selection, and Ctrl/⌘-click toggles a section in or out.
- **Easier editing.** A section toolbar offers select all, expand/collapse all, flip LED side and delete. When two or more sections are selected, a batch editor appears and shows "Mixed" where values differ. Collapse state survives every re-render.
- **Transform Offset per section.** Each section gets a position (mm in the UI, metres in the file, ±100 m on a 0.1 mm grid) and a rotation (tilt, pan and roll in degrees).
  - Both are expressed in the section's own frame: along the chord, up, and out toward the stage.
  - The section rotates about a rotation origin, bottom centre by default.
  - The offset is applied **after** the generative layout and never fed back into it. Changing columns, curve or heading still regenerates the wall, and every offset keeps its meaning.
  - Offsets do not propagate to the following sections.
  - Offsets and gizmo drags never move the wall pivot, in any pivot mode.
  - With all offsets at zero, every export stays byte-identical.
- **Detached sections (3b by default).** A Detached flag with a host section ("Starts at") lets you place soffits, ceilings and risers without consuming chain length or opening a hole in the wall. It is the only part of the feature that changes the generative walk: ticking it re-chains the following sections, so it is a generative edit and can move a centred pivot (`#pivot-status` reports the shift; 02 §6.17). It therefore ships with 3b, not with the basic offsets, unless you want soffits now (A6).
- **Gizmo and shortcuts.** `G` and `R` drag offsets, `Ctrl` snaps and `Esc` cancels. `F` frames the selection, `[` and `]` step through sections, and `Ctrl+D`, `Ctrl+A` and `Delete` act on the selection. Undo uses the platform's single stack.
- **Clearer labels.** The existing "Section Offset (°)" becomes "Heading Change (°)" ("turns this and all following sections"), so it is not confused with the new offset.

**Delivery.** M10. 3a (the MVP, about 25 days; 27 with Detached) covers your request. 3b (about 10 days) adds lock, reorder, duplicate, hover, snapping, shortcuts, undo rows and Detached. Section editing is built on 07's keymap, selection and `TransformControls` gizmo ("path A", M7b), so nothing is built twice. It lands after the pivot (M5) and the v2 file (M7a).

**Your decisions.** Answer at kick-off: Q24 (key names), Q25 (Detached in the MVP; the default is now "no, in 3b") and Q26 (path A; the minimum path of §1.1 uses path B).

### 4.3 Configurable pivot point with an offset

Spec: [docs/improvements/03-pivot.md](improvements/03-pivot.md). Step F (true framing) is 08 P2-11c.

**What you get.**
- **Three modes.**
  - `Bottom-left` is today's behaviour and stays the default.
  - `Mesh centre on floor` is the bounding-box centre of the wall on the floor (the owner's answer of 2026-10-17 to B5; a raised pivot is an Offset Y).
  - `Wall centre` is the midpoint between the first section's first bottom vertex and the last section's last bottom vertex, always on the floor.
- **An offset.** Pivot = anchor + offset, in metres at 1 mm resolution. The offset moves the pivot relative to the wall, as in a DCC tool. It never moves the wall.
- **Exports land where you need them.** Every OBJ and glTF is written with the pivot as the file origin, so walls arrive in Unreal or Blender with no manual re-centring. A pivot comment (OBJ) and `extras` (glTF) are written only for non-default pivots.
- **The viewport keeps the floor at y = 0.** Its origin is the pivot projected onto the floor. "Keep stage layout" is on by default: when you change the pivot, the camera, props and HDRI point move with the wall.
- **A stable anchor.** The anchor is computed from the generated wall before any section offsets, so nudging a section never moves the pivot. Adding, resizing or detaching a section changes the generated wall, so in the two centred modes it can move the anchor; `#pivot-status` then reports the stage-origin shift. The flip side (03 Q5, decision B5a): once risers, leaned flats or soffits exist, "middle of wall mesh" is the middle of the generated wall, not of the exported mesh.
- **Your own default.** New projects start in `Bottom-left`. An optional "Use for new projects" button (03 T17, half a day, after 07 H3) stores your preferred mode on your device in 07's `app/Prefs`; files and imports are not affected.
- **UI.** A "Wall Pivot" sidebar panel and a viewport marker. `O` selects the marker; dragging it moves only the marker, and the wall rebuilds once on release. `Esc` cancels the drag.

**Delivery.** M5, about 19 days (range 17-21). With the default pivot, outputs stay identical (step A proves zero diffs).
- Saving needs the v2 file (M7a).
- The marker is visible by default once the single renderer hides helpers from the preview (M6).
- The grid re-centres in its own step.
- True framing arrives with P2-11c (M8).

The pivot's coordinate frames and its gizmo hooks are the contract that section offsets build on, which is why M5 lands before M10.

**Your decisions.** Q1 (keep bottom-left as the default; optionally your own per-device default), Q2 (what "middle of wall mesh" means; an optional surface-centre mode exists), Q5 (anchor from the generated wall or from the live mesh), Q8 (grid) and the T13 sign-off; see §8.

### 4.4 Clean per-section UVs filling 0..1, plus a UV viewer and editor

Specs: [docs/improvements/08-bugfix-roadmap.md](improvements/08-bugfix-roadmap.md) P2-7 and P2-12d for the fix; [docs/improvements/04-uvs-uv-editor.md](improvements/04-uvs-uv-editor.md) for the feature.

**The problem.** UVs are generated in five places that disagree:
- shorter sections sample the wrong rows (B-M5);
- the combined OBJ writes overlapping UVs (B-M6);
- glTF has no UVs at all (B-M7);
- combined exports use section 0's colour for every section (B-L6);
- panel mode wastes memory and drops logos (B-M16, B-L19).

**What you get.**
- **Phase 2 (M4).** One pixel-accurate atlas UV function feeds the viewport, OBJ and glTF, and it matches `panel-ids.png` pixel for pixel. glTF gains `TEXCOORD_0`. Combined exports get one material per section. Every ZIP carries the atlas PNG. Panel mode shares one texture per section.
- **Every section fills 0..1 (M11).** You asked for UVs that fill the whole UV space. The proposed default for the Combined mesh meets that with one material slot per section, each section's island filling 0..1 (the islands overlap across sections). The atlas layout stays one click away. Panel-mode exports use section space.
  - Each section's 0..1 square maps exactly onto its own pixel canvas, so panel corners land on pixel boundaries.
  - **Which layout suits which workflow.** The per-section default suits **per-material workflows**, where content is applied per material slot (Unreal static meshes with per-slot materials, Unity, Blender, Maya). **One-feed-per-mesh workflows**, which include your main pipelines (nDisplay mesh projection, a disguise screen object), sample one 0..1 canvas across the whole mesh, so overlapping islands would repeat the feed. They need the **Atlas** layout (non-overlapping, matching `panel-ids.png`) or **Individual Section Meshes** (one object per section, each 0..1). The sidebar says so under the layout select (04 §3.3). Your pipeline check (B8) therefore also decides the default (B7), and 04 Q18 asks whether the default should follow an export target.
- **UV transform per section.** Offset, scale, rotation, flip and a "source orientation" (for rotated feeds) are baked once, by one function, into the viewport UVs, the OBJ `vt` and the glTF `TEXCOORD_0`. LED-pixel simulation ignores the transform, because it shows physical pixels.
- **UV viewer and editor.** `U` opens a floating 2D panel showing the selected section's UVs over a choice of background: panel IDs, LED pattern, checker, or later the HDRI bake. It has:
  - drag handles and numeric fields;
  - presets: Fit 0-1 and Pixel-accurate;
  - Turn feed ±90°, Copy to all, and undo.
- **Hover readout.** Hovering the 3D wall shows the section, panel, LED, pixel, atlas position and UV under the cursor.

**Delivery.** M4 carries the fix (P2-7, 4 days). M11 carries the feature, about 27 days (range 24-31). If B7 keeps the per-section default, the combined UV outputs are re-baselined twice: once by P2-7, then by the change to the per-section default. This is accepted: the visible bug is fixed sooner, and the atlas survives as an option. If B7 chooses Atlas, the second re-baseline does not happen.

**Your decisions.** Q12 first (test one export of each layout in your Unreal nDisplay and disguise setups before UV-7; a go/no-go gate), then Q1 (per-section or Atlas as the Combined default, decided by that test), Q18 (a per-export-target default; recommended: not now) and Q17 (texture budget).

### 4.5 HDRI projection for previs, plus a reflective car

Spec: [docs/improvements/05-hdri-projection.md](improvements/05-hdri-projection.md). The single renderer it needs is in [docs/improvements/07-platform-foundations.md](improvements/07-platform-foundations.md) R1-R3.

**What you get (MVP).**
- **Loading.** You drop or choose an `.hdr`, `.jpg` or `.png` file. Nothing is uploaded to a server, and oversized files are rejected from their header before any decoding.
- **A fourth wall content mode**: Colour | LED pixels | Panel IDs | HDRI.
- **Projection.** The panorama is projected spherically onto the wall from a **projection point**.
  - The default point is the film camera's nodal point. A custom point can be dragged with the gizmo.
  - Controls: yaw, pitch, roll, exposure (with Auto) and the tone map. None of them rebuilds the wall.
  - It uses world positions, not UVs, so it works in every mesh mode, with section offsets and with any pivot.
- **The camera preview shows the same image.** An optional backdrop dome shows the environment beyond the wall: seen from the projection point the two line up, and from anywhere else the parallax break shows (the key previs insight).
- **Persistence by reference.** The project stores the file's name, size and SHA-256, with a Relink state when the file is missing. The ZIP can optionally bundle the HDRI.
- **Shortcuts.** `H` toggles HDRI content, `Shift+H` toggles the backdrop, and `,` and `.` turn the image.

**Increments, each approved on its own.**
- **Look and convenience:** LED-pixel mask, coverage outline, remember HDRIs on this device, EXR, 2K/4K/8K quality tiers, a bundled CC0 sample (about 6 days in total).
- **Reflective car** (about 5.5 days): a glTF car with clear-coat paint. Reflections come from the HDRI, a neutral studio, or (+1.5 days) a live capture of the LED stage. The current box car remains the fallback.
  - **"Better" is measurable** (05 AC 33): a smooth, curved body after Blender prep (at least 10,000 paint triangles, hard edges only); separate paint, glass and tyre materials, so the paint colour can be changed; 10,000-150,000 triangles in total within the 2.5 MB budget; and your sign-off on a side-by-side render before T11 starts.
  - **Candidates.** The recommended one is Khronos **CarConcept** (CC BY 4.0, by Eric Chadwick, © 2024 Darmstadt Graphics Group GmbH; the credit is shown in the app), cut down to the budget with its Khronos logo decals removed. The fallback is the **Kenney Car Kit** (CC0), which is small but stylised, low-poly and single-material, so it passes the bar only if you relax it.
- **Bake for export** (about 3.5 days, after M11): per-LED textures and a pixel map.

**Not in the MVP.** "Whole wall follows the camera" is a simplification that the UI states. An "inner frustum only" option is proposed for v1.1, about 2 days.

**Delivery.** M12. The MVP is about 12.75 days; everything is about 29.25 days. It needs:
- the single renderer, with render-on-demand as a hard gate (M6);
- the keymap, selection and gizmo for the projection-point marker (M7b);
- the v2 file and session for persistence (M7a).

three.js stays on r128 for this feature. The upgrade then ports it (M15).

**Your decisions.** Q19 (MVP first, then increments), Q3 (car asset: CarConcept, with Kenney as the fallback) and Q2 (the glTF car becomes the default only after your side-by-side sign-off).

### 4.6 Morph branding

Spec: [docs/improvements/06-morph-branding.md](improvements/06-morph-branding.md). Summarised in §5. Delivered in M2.

---

## 5. Morph branding summary

**Name and header.** The product is **"Morph LED Configurator"**. The header shows the Morph wordmark, a divider and "LED Configurator" as live text. Below 520 px it switches to the monogram. Until you approve publishing the artwork, the header is text only.

**Colour roles.**

| Role | Value | Where |
|---|---|---|
| Morph Black and four derived greys | `#0A0A0A`, `#111111`, `#161616`, `#1F1F1F`, `#262626`/`#333333` | All surfaces; the cyan/magenta identity is removed |
| Signal Red (accent) | `#C51622`; small red text uses `#F2555A` | Graphics and large text only, always next to a surface at least as dark as `#161616` |
| Pivot Gold (call to action) | `#F2B705` | Exactly once: the Export All (ZIP) button |
| Default first-section colour | Studio Grey `#d9d9d6` | A new 8-colour palette with no gold-like colours |

Gizmo XYZ = RGB, the R/G/B panel-ID border cycle and the prop colours stay as they are, because they are functional conventions.

**Typography.** Montserrat for the UI; JetBrains Mono for numbers and panel-ID labels. Montserrat was identified by eye, so Q4 asks you to confirm it.

**Viewport.** The third-party Fivefold logo is removed. A 44 px Morph monogram watermark sits beside the gizmo buttons and is hidden in pilot mode.

**One colour source.** CSS tokens drive the chrome, the 3D scene and the canvases through `js/theme/ThemeBridge.js`. `Theme.js` keeps identical fallbacks, and a parity test (U4) holds the two together.
- Overlays that cross the wall (frustum lines, selection outlines, pivot glyph) are two-tone: a light dashed core over a black halo, so they stay readable on any section colour.
- Panel frames pick light or dark per section.

**Exports.**
- Files are named `morph-led-wall.*`.
- OBJ and MTL headers are plain ASCII.
- glTF carries the generator "Morph LED Configurator", and the JSON v2 file carries a `generator` object.
- An optional Morph mark can be added to panel-ID PNG exports; it is off by default.

**Gate: publishing the logos is irreversible.** T4b copies 8 files into a tracked `assets/brand/` folder. From then on they are public on GitHub Pages and in git history, and forks and caches keep them. A `NOTICE.md` states that the Morph marks are not covered by the Apache-2.0 licence. Nothing is copied until you approve in writing (Q2). If you say no, the core still ships with a text-only header.

**Steps.**

| Step | Content | Proven by |
|---|---|---|
| T1, T2, T3 | Inline styles moved to classes; `ThemeBridge`; tokens with the legacy values | only class keys differ (T1); identical (T2, T3) |
| T4a | Morph chrome: tokens and roles, text header, logo removal, component states, header grid with the undo slot | re-baselined screenshots |
| T4b, T9 | Wordmark, watermark, favicon, README lockups | **needs your OK** |
| T4c | British English labels ("Colour") | re-baselined card text |
| T5, T7 | Scene and canvas colours, fonts; palette | re-baselined screenshots and PNGs |
| T6a, T6b | Export header strings; filenames | T6b byte-identical under a rename map |
| T8, T10 (optional), T13 (optional) | JSON `generator`; PNG brand mark; self-hosted fonts | after M7a |

**Visual prototype.** A restyled copy of the original app lives in the private brand folder:

`Morph Brand Assets/prototype/index.html`

Open it from `file://`. The folder also holds screenshots: `screenshot.png`, `shot-camera.png`, `shot-camera-exports.png`, `shot-panelids.png`, `shot-sections.png`, `shot-pilot.png`, `shot-narrow.png`, and `original-screenshot.png` for comparison. Its build script and stylesheet belong in `Morph Brand Assets/prototype/tools/`.

`Morph Brand Assets/` is git-ignored, so the prototype stays **local and private, outside the repository**, until Q2 is answered; it contains the brand files. This is the copy the brand owner reviews (06 R2). Spec 06 restates every value the prototype shows, and its "Prototype notes" list where the spec has superseded it: two-tone frustum, adaptive frames, an opaque selection badge, the Steel swatch, and more.

Effort: about 15 days core, plus 2.25 days optional. The open questions are 06 Q1-Q25; the ones that matter most are in §8.

---

## 6. Bug-fix roadmap (Phase 2)

Spec: [docs/improvements/08-bugfix-roadmap.md](improvements/08-bugfix-roadmap.md). It takes 57 verified bug ids, groups them into 21 root causes, and orders them as 14 batches (P2-0 … P2-13). Each batch card lists the switch or `LEGACY` site it changes, the exact harness outputs that change, the effort, the risk and what it unblocks.

**Owner-visible block first (about 23 days, about 27.5 with overhead).**

| What users see today | Bug ids | Batch | Milestone |
|---|---|---|---|
| Exported walls look inside-out ("inverted normals") | B-H1, B-H2, B-L3 | P2-2 | M1 |
| glTF export silently fails on bigger walls; the ZIP dies; the panel-ID PNG throws | B-H3, B-L4, B-L5 | P2-1 | M1 |
| Export Safe Distance OBJ never downloads; its floor faces down | B-M1, B-L29, B-M15 | P2-5a, P2-5b | M1, M4 |
| A shared project JSON can inject script (XSS); imports are not validated | B-M4, B-L8, B-L16, B-L21 | P2-3 | M4 |
| Turning the preview off in pilot mode traps the viewport | B-H4, B-M8 | P2-4 | M4 |
| The ZIP drops section offsets; MTL texture paths don't match | B-M3, B-M2, B-L14, B-L7 | P2-6 | M4 |
| UV misalignment; no glTF UVs | B-M5, B-M6, B-M7, B-L6, B-L18 | P2-7 | M4 |
| GPU memory exhaustion in panel mode | B-H5, B-L12, B-M16, B-L19 | P2-12a/d | M4 |

**Feature-gate block (12 days).** P2-8b-d (numeric inputs), P2-9a-d (click-select, shortcut filter, gizmo sign, prop axes), P2-13a (logo guards) and P2-13e (the v2 file, 7.5 days). Under path A, P2-9e-j (local gizmo space, quaternion rotation, pilot movement) is pulled into this block as well. These batches open F2, F3 T7, F4, F5 T8 and F6 T8 (M7a, M7b).

**Remainder (about 9.5 days, M8).** P2-10 (preview window; mostly taken over by the single renderer), P2-11 (true framing and rotation-aware coverage), P2-12b/c, P2-13b/c/f/g.

**Ordering facts the specs verified.**
- P2-1 must precede P2-2: normals push the `large_wall` glTF into the old encoder's failure band.
- P2-5a precedes P2-1a, so the new export wrapper never shows an interim error.
- P2-8a precedes the validator, so the UI only produces values the validator accepts.

The P2-0 commit rewrites REFACTOR_PLAN §5's suggested Phase 2 order to match.

**Total.** 46.5 days of batch work plus about 9.5 days of gate overhead, about **56 days**. The owner questions are 08 Q1-Q19; the key ones are in §8.

---

## 7. Platform and additional ideas

### 7.1 Platform foundations (spec 07), in priority order

Spec: [docs/improvements/07-platform-foundations.md](improvements/07-platform-foundations.md). Spec 08 fixes each bug first; spec 07 replaces mechanisms and adds the platform on top.

| Priority | Workstream | Why it matters | Milestone |
|---|---|---|---|
| 1 | (d) **Project file v2 and session.** A snake_case superset of v1 (`"version": "2.<n>"`, `"format": "morph-led-project"`), a schema-driven validator, v1 migration, one serializer for file, ZIP, history and autosave, and `ProjectSession.apply` with feature hooks | Every feature saves state, and today a reload loses almost everything (B-L31). External v1 parsers keep working. | M7a |
| 2 | (b) **Keymap, selection v2, three.js controls.** One `KEYMAP` with scopes and an Escape registry; id-based selection with click-select; `TransformControls`, then `OrbitControls` | Section editing, the UV editor and the HDRI marker need them; they fix the gizmo bug family by construction | M7b, M13 |
| 3 | (a, c) **Single renderer and render-on-demand.** Preview drawn by scissor, four layers, stills | HDRI and PBR need one GL context; a clean preview; zero GPU use while idle | M6 |
| 4 | (e) **Undo/redo and autosave.** Snapshot undo with coalescing and drag transactions; two-slot autosave with a restore banner | Safety net for every edit; section editing 3b releases with it | M9 |
| 5 | (g) **CI and deploy.** `ci.yml` (static + unit, no npm), differential golden CI, deploy to Pages from Actions | Catches regressions on every push | M1 (G1), M7b (G4), M13 (G2) |
| 6 | (h) **Quality.** Toasts and dialogs instead of `alert()`, context-loss recovery, an accessibility pass, a perf HUD and texture budgets | Professional error UX; works by keyboard | M9, M13 |
| 7 | (f) **three.js upgrade.** After Feature 5: importmap at r128 (zero diffs), current release, then colour management | Keeps the library current without delaying the features | M15 |

Effort: about 70.5 days required (range 61-81): 65.5 of tasks plus about 5 of gate overhead. Add about 10 days for Track F, plus 2 days for R4 if 09 X4 is accepted.

### 7.2 Additional ideas (spec 09), prioritised

Spec: [docs/improvements/09-additional-ideas.md](improvements/09-additional-ideas.md). Every item ships on its own and is off by default. A rejected item leaves no JSON key behind.

| Priority | Items | Effort | When |
|---|---|---|---|
| **Must** (Release A, about 3 weeks) | X1 LED product library (verified ROE data; add Morph's inventory) · X2 power, weight, rigging and processor-port estimates with stage checks · X3 moiré and viewing-distance calculator · X4 high-resolution screenshot and camera stills export | 14.5 d | after M7a, E1, M8; X4 on 07 R4 |
| Delegated | X5 autosave and X8 undo/redo: already 07 H1-H3 | 0 d | M9 |
| **Should** (Release B) | X6 templates and curved-volume generator · X7 share links · X9 inner-frustum overlay and coverage extensions · X10 ceiling/floor presets (on 02's Detached sections) · X11 Unreal nDisplay and Disguise stage packs · X12 print/PDF spec sheet | 19.5 d | X10 after M10; X11 after M3, M5, M11 |
| **Could** (Release C) | X13 measurement tool (`M`) · X14 metric/imperial units (last) · X15 SVG plan · X16 data-port map | 11.5 d | X13 after M7b, M6 |
| Won't (this cycle) | Full `.ndisplay` config, Disguise project files, live processor control, camera-tracking input, photometric simulation, cloud storage, FBX, DXF | – | – |

Recommendation: accept Release A now. Decide on B and C after M10.

---

## 8. Decisions needed from you

Every question has a recommended default. If you accept the defaults, only the items marked **blocking** need an explicit answer.

**Decided 2026-10-16 (M0 kick-off).** The owner chose the **full platform route** (A0) and **approved** publishing the 8 Morph brand files (A8). Every other question in tables A and B, and every remaining question in the specs (§11.2), takes its recommended default. The last column of each table records the outcome. The specs record the decisions they gate where they require it: B-L1 in 08 §5.6 and Q10 and in ARCHITECTURE §1.4; the 03 T13 sign-off in 03 §5.10.1 and 02 §10.3; 02 Q24-Q26 and 06 Q2 in their question tables; the kick-off list in 07 §1.5.

**Decided 2026-10-17 (re-prioritisation).** After testing the Phase 2 exports, the owner made **03 (pivot) and 04 (UVs and the UV editor) the next priority**, sequenced "fastest, session-only". This overrides the full-route order (A0) for these two features only:
- **No project file v2 now.** 08 P2-13e and P2-8b-d, 03 T7 and 04 UV-5c wait for M7a ("Project file v2 and session"); the pivot and the UV settings last for the session only until then, and their release notes say so (principle 6). An import resets them (03 §4.4, Q14).
- **The UV editor takes path B** (04 header): `UvFallbackHistory`, the `ViewportInput` `'u'` branch with the shared typing guard, in-memory viewer preferences and observer hooks on the Phase-1 `SelectionManager`, because 07 I1/I2/H1/H3 are not built; 04 UV-18 removes them later. Spec 02 is not built, so 04 UV-17 is skipped; the viewer chooses a section with its section dropdown and a double-click on the wall (UV-15).
- **Export OBJ is one download** (08 P2-6e, landed): `morph-led-wall-obj.zip` with the OBJ, the MTL and every texture the MTL references.
- **Every other open question keeps its recommended default:** A7 (the 03 T13 sign-off, confirmed: 03 §5.10.1, 02 §10.3), B4 bottom-left, B5 the bounding-box centre (on the floor since the owner's request of 2026-10-17), B5a the generated wall, B6 the 100 m grid centred on the stage origin, B7 per-section 0..1 with the Atlas layout as an option (the owner's own review of the exports in Blender and Unreal stands in for B8's go/no-go), B9 16 MP, A11 / 08 Q4, Q5 yes.

### A. At kick-off (M0)

| # | Decision | Source | Recommended default | Decided 2026-10-16 |
|---|---|---|---|---|
| A0 | Route: the full platform route (§3), or the minimum path per request first (§1.1) and the platform afterwards? | this plan | **One maintainer: the minimum path first** (all six requests usable by about day 162 instead of about day 223; the platform follows in §3's order for about 5 extra days of porting). **Two people: the full route** (everything in about 140 days, with undo, autosave and the shared gizmo from the start). Blocking: it decides 02 Q26 and the order of M7-M12. | **Full platform route** (§3), the owner's choice. A4 follows as path A. |
| A1 | Curve convention (step before the first panel) | 08 Q10 | **Keep it** and document it (blocking for 02 T3) | Recommended default: **keep** (recorded in 08 §5.6 and ARCHITECTURE §1.4) |
| A2 | Which fixes the preview bugs: the single renderer first, or the old second renderer? | 07 Q18 | **Single renderer (R1/R2) first** | Recommended default |
| A3 | three.js version during the features | 07 Q1, 05 Q18 | **Stay on r128 through Feature 5**, then upgrade (Track F) | Recommended default |
| A4 | Build section editing on 07's keymap, selection and gizmo ("path A")? | 02 Q26 | **Path A** on the full route; **path B** on the minimum path (A0) (blocking before 02 T8) | Recommended default for the full route: **path A** |
| A5 | Persisted offset key names | 02 Q24 | **`offset.position_m` and `offset.rotation_origin`** | Recommended default |
| A6 | Detached sections in the section-editing MVP? | 02 Q25 | **No: defer them to 3b** (or to 09 X10, which builds on them). They are the only change to the generative walk, detaching can move a centred pivot (02 §6.17), and you asked for basic offsets. Say **yes** only if you need soffits, ceilings or risers now; 3a then takes 27 days instead of 25. | Recommended default: defer to 3b |
| A7 | Sign off the shared gizmo and composition contract | 03 T13 | **Sign off** (blocking before 03 T5) | Recommended default: **signed off** (recorded in 03 §5.10.1 and 02 §10.3; confirmed 2026-10-17, 03 T13 done) |
| A8 | Publish the 8 Morph brand files in the public repo | 06 Q2 | **Yes, exactly those 8, with your written OK**; otherwise a text-only header (blocking for 06 T4b) | **Approved:** exactly the 8 files of 06 §5.8, with `NOTICE.md` |
| A9 | Product name | 06 Q1 | **"Morph LED Configurator"** | Recommended default |
| A10 | Fix the glTF crash before the normals | 08 Q1 | **Yes** | Recommended default |
| A11 | Phase 2 UVs: pixel-accurate atlas now, per-section 0..1 in Feature 4 | 08 Q4, Q5 | **Yes**; accept the second re-baseline if B7 keeps the per-section default; ship the atlas PNG in every ZIP | Recommended default |
| A12 | Owner-visible fixes before the feature-gate block | 08 Q17 | **Yes** (UV fix first) | Recommended default |
| A13 | Replace the hand-written gizmo and orbit with three.js controls | 07 Q2 | **Yes**, after 08 P2-9, keeping its behaviour as the contract | Recommended default |
| A14 | Which spec 09 ideas | 09 §0 | **Release A (X1-X4)**; decide B and C later | Recommended default: Release A |

### B. Before a specific step

| # | Decision | Source | Recommended default | Needed before | Decided 2026-10-16 |
|---|---|---|---|---|---|
| B1 | What the back of a wall looks like after the FrontSide switch | 01 Q1 | **Dark matte cabinet back `#403C37`** | F1-5 | Recommended default |
| B2 | Per-section LED side in Feature 1 | 01 Q2 | **Yes**; no per-project flag | F1-4 | Recommended default |
| B3 | A "legacy inverted" export option | 01 Q5 | **No**; a release note and the checker tool instead | F1-5 | Recommended default |
| B4 | Default pivot for new projects | 03 Q1 | **Bottom-left** (today's behaviour). Optionally, a "Use for new projects" button keeps your preferred mode per device in 07's `app/Prefs` (03 T17, 0.5 d, after 07 H3); files are unaffected | 03 T1 (T17 after 07 H3) | Recommended default |
| B5 | Meaning of "middle of wall mesh" | 03 Q2 | **Bounding-box centre on the floor** (03 Q2 (c); "Wall mesh centre on floor (bounding box)"); the 3D centre is an Offset Y; an optional surface-centre mode stays available if you meant the content centre | 03 T2, B1-pivot-floor | **Decided by the owner, 2026-10-17** (was: the 3D bounding-box centre) |
| B5a | Does the pivot anchor use the generated wall or the live mesh (with section offsets and detached sections)? | 03 Q5 | **Generated wall only**, so the pivot stays still while sections are nudged. **Consequence:** once risers, leaned flats or soffits exist, "middle of wall mesh" is the middle of the generated wall, not of the exported mesh, and the file origin sits off the centre of the exported geometry; correct it with the pivot offset (a later "Use current mesh" button can fill it in). Choose "live mesh" only if exports must always be centred on the final geometry; the pivot then moves while you drag sections. | 03 T2 | Recommended default |
| B6 | Grid relative to the stage origin | 03 Q8 | **100 m grid centred on the stage origin** | 03 T10 | Recommended default |
| B7 | Combined-mesh UV default | 04 Q1, Q18 | **Per-section 0..1 if you apply content per material slot; Atlas if your main pipelines are one feed per mesh** (nDisplay mesh projection, disguise), or export Individual Section Meshes. Both fill the UV space; per-section islands overlap across sections, which repeats a single feed. B8's test decides. A per-export-target default (04 Q18) is not recommended now | UV-7 | Recommended default (B8's test chooses between the two) |
| B8 | Test exports in your Unreal nDisplay and disguise setups | 04 Q12 | **Yes, required go/no-go**; it also decides B7 | UV-7 | Recommended default: you run the test before UV-7 |
| B9 | Viewport texture budget for section textures | 04 Q17 | **16 MP per rebuild** | UV-7 | Recommended default |
| B10 | HDRI: MVP first, then increments one by one | 05 Q19 | **Yes** | 05 T1 | Recommended default |
| B11 | Car asset, and when the glTF car becomes the default | 05 Q3, Q2 | **Khronos CarConcept (CC BY 4.0, credited in the app)** prepared to 05's quality bar (AC 33), with the **Kenney Car Kit (CC0)** as the fallback; you choose from a side-by-side render, and the glTF car becomes the default only after that sign-off | 05 T10 (sign-off before T11) | Recommended default; you choose from the side-by-side render before T11 |
| B12 | Watermark, and gold only on Export All | 06 Q6, Q7 | **Watermark on (hidden in pilot); gold only on Export All** | 06 T4b | Recommended default |
| B13 | Typeface and font hosting | 06 Q4, Q5 | **Montserrat**; Google Fonts first, self-hosted later | 06 T4a | Recommended default |
| B14 | British English labels ("Colour") | 06 Q14 | **Yes**, visible labels only | 06 T4c | Recommended default |
| B15 | Default first-section colour | 06 Q8 | **Studio Grey `#d9d9d6`** | 06 T7 | Recommended default |
| B16 | One global undo stack (also inside the UV viewer) | 07 Q17 | **Yes** | 07 H1 | Recommended default |
| B17 | Re-centre the orbit on every wall edit | 07 Q6 | **No**; frame only on boot, open, `F` and Reset | 07 I4b | Recommended default |
| B18 | `Ctrl/⌘+S` saves the project | 07 Q11 | **Yes** | 07 I1 | Recommended default |
| B19 | Exact modifier matching (`Shift+G` no longer acts as `G`) | 07 Q19 | **Yes** | 07 I1 | Recommended default |
| B20 | Remove the camera Z ≥ 0.1 m minimum | 08 Q13 | **Yes**, in P2-11c; the label becomes "Z Position (m)" | P2-11c | Recommended default |
| B21 | Product catalogue contents | 09 Q1 | **Verified ROE entries**; you add Morph's rental inventory | 09 X1 | Recommended default |

The remaining questions in each spec (§11.2) have defaults that need no action unless you disagree. As decided on 2026-10-16, they all take their recommended defaults.

---

## 9. Effort summary

| Spec | Scope | Effort (engineer-days) | Notes |
|---|---|---|---|
| [08](improvements/08-bugfix-roadmap.md) Phase 2 bug fixes | 14 batches, 57 bug ids | **≈ 56** | 46.5 of batch work plus 9.5 of gate overhead; owner-visible block ≈ 27.5 |
| [07](improvements/07-platform-foundations.md) Platform | 33 required tasks | **≈ 70.5** (61-81) | 65.5 of tasks, including D0 (3 d), plus about 5 of overhead; +2 for R4 if X4 is accepted; ≈ 1 for I3's conversion of the pivot marker |
| [01](improvements/01-normals.md) Normals view and LED side | T1-T11 (12 tasks) | **≈ 19** | The flip itself is in 08 (P2-2, 2 d) |
| [06](improvements/06-morph-branding.md) Branding | T1-T13 (T11 dropped) | **≈ 17.25** | 15 core, 2.25 optional |
| [03](improvements/03-pivot.md) Pivot | 13 tasks | **≈ 19** (17-21) | Step F counted in 08; optional alignment, surface-centre mode and per-device default (T17, 0.5 d) extra |
| [02](improvements/02-section-editing-offsets.md) Sections and offsets | 3a + 3b | **≈ 35** (path A) | 3a 25; 3b 8; Detached 2 (in 3b by default); path B would be 37 |
| [04](improvements/04-uvs-uv-editor.md) UVs and UV editor | 15 tasks | **≈ 27** (24-31) | The UV bug fix is in 08 (P2-7) |
| [05](improvements/05-hdri-projection.md) HDRI and car | MVP + increments | **≈ 29.25** | MVP 12.75; look 6; car 5.5; stage reflections 1.5; bake 3.5 |
| [09](improvements/09-additional-ideas.md) Additional ideas | 16 items | **≈ 45.5** | Must 14.5, Should 19.5, Could 11.5 |
| **Total** | | **≈ 318.5** | + ≈ 10 for the three.js upgrade (Track F) ≈ **328.5** |

**Roll-ups.**
- **Your list, plus the bug fixes and platform it depends on** (everything except spec 09 and Track F): 56 + 70.5 + 146.5 = **≈ 273 days**.
- **Lean core** (without the HDRI increments, section-editing 3b, the deferred Detached sections and the optional branding tasks): 273 − 16.5 − 8 − 2 − 2.25 = **≈ 244 days** (≈ 246 with Detached in the MVP, A6).
- **Minimum path per request** (§1.1): **≈ 162 days**, with the platform and polish deferred.
- **Spec 09 Release A** adds 14.5 days. Releases B and C add 31 days.

**Notes.**
- **What the figures include.** Phase 2 and platform figures include the per-commit gate overhead (manifest, review of every expected diff, three full harness runs). Feature figures include their own re-baselines and harness scenarios.
- **Consolidations already applied.** One D0 replaces six documentation tasks. Path A means no path-B scaffolding is built. True framing is counted only in 08. Duplicate tasks are dropped (06 T11, 05 RB-2b). Together these save about 11 days against the pre-review sum.
- **Calendar** (§3.4, resource-loaded, M0 included). One maintainer working full time needs about 13 working months for the ≈ 273-day scope (day ≈ 272). Two people who share the work as §3.4 describes need about 6.6 months (day ≈ 140), because branches are developed in parallel even though merges stay serial; each carries about 135 days. The minimum path (§1.1) takes about 7.7 months alone or about 3.9 months for two.
